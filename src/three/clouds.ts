// 体积积云（天球 animeSky.ts 用）：从地面往上看的一片积云场，光线步进算出每个方向上云的颜色和不透明度，烘进一张天空贴图。
// 天球每帧只取样这张贴图（天色 × (1 - a) + 云色），平时几乎不花什么；太阳方向、黄昏、入夜程度变了才重烘，
// 新的一张分几帧、一次几行地画进后备贴图，画完再换上（重烘期间画面上还是旧的云，不会半张新半张旧）。
//
// 做法参考 fragcoord.xyz 上 @freeborn 的两个积云着色器（clouds.glsl 和它的夕阳 HDR 版，MIT 许可），照思路自己写的：
//   - 形状：每个抖开的 2D 格子一座云塔（底宽顶窄，邻居融成一片），Worley 特征点周围的半球冠 sqrt(1 - F1²/R²) 堆出
//     大、中两级菜花状的团块，再用 billow 梯度噪声（|n| 叠几层）把表面推进推出成细碎的小鼓包；
//   - 体积：密度在表面以内 SOFT 的深度里从 0 升到满，边缘半透明但轮廓利落；
//   - 光照：朝太阳步进算遮挡（头几步用细节，后面只看大形）+ 两档多次散射近似，双瓣相位函数出受光边的银边，
//     朝上短步进估计能看到多少天空（背光面的天光），按通道不同的吸收让光走得越深越偏红（黄昏的云芯发橙）；
//   - 远处的云按距离淡进背后的天色（这里存成不透明度，天球里叠在它自己的地平线亮带上）。
// 改动：镜头在云底下面往上看（原作在云层里平飞）；覆盖率按大块区域起伏，不是按排；光的颜色、天光、
// 地面反光由天球按时间给；颜色在这里压一个保色相的肩（亮部不超过 PEAK），非 HDR 的画面效果也不会剪成死白。
//
// 贴图：横向是方位角，纵向是仰角的平方根（地平线附近行更密：窗外、鸟瞰背后看到的都是低空）。

import * as THREE from 'three'

export const CLOUD_W = 2048
export const CLOUD_H = 512
/** 每帧烘几行 */
const ROWS = 24

const BakeShader = {
  uniforms: {
    uSize: { value: new THREE.Vector2(CLOUD_W, CLOUD_H) },
    /** 指向太阳（入夜后是月亮） */
    uL: { value: new THREE.Vector3(0, 1, 0) },
    /** 直射光颜色（线性，含强度） */
    uSunCol: { value: new THREE.Color() },
    /** 从上方来的天光 */
    uAmb: { value: new THREE.Color() },
    /** 从下方来的地面反光（云底） */
    uBounce: { value: new THREE.Color() },
    /** 每个通道的吸收（占消光的比例）：越大的通道光走得越深越少 */
    uAbsorb: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    precision highp int;
    uniform vec2 uSize;
    uniform vec3 uL;
    uniform vec3 uSunCol;
    uniform vec3 uAmb;
    uniform vec3 uBounce;
    uniform vec3 uAbsorb;
    varying vec2 vUv;

    #define PI 3.14159265
    // 云格子的边长、云塔的底（单位是云自己的，镜头在 CAM_Y）
    #define CELL 4.0
    #define BASE -4.0
    #define CAM_Y -13.0
    #define SIGMA 12.0
    #define SOFT 0.08
    #define FOG 0.009
    #define MS 0.55
    #define PEAK 1.6
    #define FAR 260.0

    const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

    // PCG3D 哈希（Jarzynski & Olano 2020）
    vec3 hash33(ivec3 c) {
      uvec3 v = uvec3(c) * 1664525u + 1013904223u;
      v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
      v ^= v >> 16u;
      v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
      return vec3(v >> 8u) / 16777215.0;
    }

    float gnoise(vec3 p) {
      ivec3 i = ivec3(floor(p));
      vec3 f = fract(p);
      vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      #define G(o) dot(hash33(i + o) * 2.0 - 1.0, f - vec3(o))
      return mix(mix(mix(G(ivec3(0, 0, 0)), G(ivec3(1, 0, 0)), u.x), mix(G(ivec3(0, 1, 0)), G(ivec3(1, 1, 0)), u.x), u.y),
                 mix(mix(G(ivec3(0, 0, 1)), G(ivec3(1, 0, 1)), u.x), mix(G(ivec3(0, 1, 1)), G(ivec3(1, 1, 1)), u.x), u.y), u.z);
    }

    float smin(float a, float b, float k) {
      float h = max(k - abs(a - b), 0.0) / k;
      return min(a, b) - h * h * k * 0.25;
    }

    // 最近 Worley 特征点距离的平方（特征点在格子的 [0.15, 0.85] 里，0.36 以内只用查自己和每个轴上近的那个邻居）
    float worley2(vec3 p) {
      ivec3 i = ivec3(floor(p));
      vec3 f = fract(p);
      ivec3 n = ivec3(step(0.5, f)) * 2 - 1;
      float m = 9.0;
      for (int k = 0; k < 8; k++) {
        ivec3 o = ivec3(k & 1, (k >> 1) & 1, k >> 2) * n;
        vec3 r = vec3(o) + 0.15 + 0.7 * hash33(i + o) - f;
        m = min(m, dot(r, r));
      }
      return m;
    }

    // 大形：每格一座云塔（底宽顶窄、轻轻扭动），覆盖率按 4×4 格的大块起伏：有成片的云，也有大块的晴空
    float heaps(vec3 p) {
      ivec2 cell = ivec2(floor(p.xz / CELL));
      float d = 1e3;
      for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        ivec3 c = ivec3(cell.x + i, 0, cell.y + j);
        vec3 h = hash33(c);
        float region = hash33(ivec3(c.x >> 2, 7, c.z >> 2)).x;
        float cov = mix(0.0, 0.34, region * region);
        if (h.z >= cov) continue;
        vec3 g = hash33(c + ivec3(0, 1, 0));
        float r = CELL * (0.22 + 0.16 * g.x);
        float top = BASE + 4.0 + 4.5 * g.y * g.y;
        vec2 ctr = (vec2(c.xz) + 0.3 + 0.4 * h.xy) * CELL;
        vec3 q = p - vec3(ctr.x, 0.0, ctr.y);
        float y = clamp(q.y, BASE, top);
        vec2 wob = vec2(sin(y * 0.7 + 6.28 * g.z), cos(y * 0.6 + 6.28 * h.x)) * 0.35 * r;
        float rad = r * (0.65 + 1.2 * smoothstep(top, top - 5.0, y));
        // 云底压平一点：积云的底是平的（凝结高度）
        float tower = (length((q - vec3(wob.x, y, wob.y)) * vec3(1.0, q.y < BASE ? 2.5 : 1.0, 1.0)) - rad) * 0.7;
        d = smin(d, tower, 0.2 * CELL);
      }
      return d;
    }

    // 菜花团块：lod 级，最后一级按小数淡入；离表面越远冠越小，只从表面上长出来，不凭空出现孤岛
    float lobes(vec3 p, float d, float lod) {
      vec3 q = p;
      float fr = 0.5;
      float fine = 0.35 + 0.65 * smoothstep(BASE, BASE + 6.0, p.y);
      for (int o = 0; o < 3; o++) {
        float wgt = clamp(lod - float(o), 0.0, 1.0);
        if (wgt <= 0.0) break;
        float x = max(1.0 - worley2(q * fr) / 0.36, 0.0);
        float relief = o == 0 ? 1.0 : o == 1 ? 1.3 : 1.0;
        float h = 0.6 / fr * relief * (o == 0 ? 1.0 : fine) * wgt;
        d -= h * x * inversesqrt(x + 0.04) * clamp(1.0 - d / (1.5 * h), 0.0, 1.0);
        q = ROT * q + 3.1;
        fr *= 2.1;
      }
      return d;
    }

    float cloud(vec3 p, float lod) {
      float d = heaps(p);
      return d > 2.0 ? d - 1.9 : lobes(p, d, lod);
    }

    // 细碎的小鼓包：billow 噪声把表面往外推
    float bumps(vec3 p, float oct) {
      p *= 3.0;
      float n = 0.0, a = 1.0;
      for (int o = 0; o < 3; o++) {
        float w = clamp(oct - float(o), 0.0, 1.0);
        if (w <= 0.0) break;
        n += a * w * abs(gnoise(p));
        p = ROT * p * 2.03;
        a *= 0.5;
      }
      return 0.5 * (n - 0.28);
    }

    float puffL(float d, float w) { return smoothstep(-0.3 * w, w, -d); }

    // 朝光源的光学深度：第一步带细节（团块互相遮），后面只看大形
    float lightDepth(vec3 p, vec3 L, float lod) {
      float od = 0.0, s = 0.08;
      for (int k = 0; k < 6; k++) {
        p += L * s;
        float d = cloud(p, k == 0 ? lod : k < 3 ? 2.0 : 1.0);
        if (k < 2 && d < 0.45) d -= bumps(p, 2.0);
        od += puffL(d, SOFT * (1.0 + 2.0 * float(k))) * s;
        s *= 1.6;
      }
      return od;
    }

    // 朝上看得到多少天（背光面的天光）
    float skyDepth(vec3 p) {
      return puffL(cloud(p + vec3(0.0, 0.5, 0.0), 2.0), 0.8) * 0.6 + puffL(cloud(p + vec3(0.0, 1.5, 0.0), 1.0), 0.8);
    }

    float hg(float c, float g) { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5); }

    void main() {
      // 贴图坐标 → 方向：横向方位角，纵向仰角的平方根
      float az = (vUv.x - 0.5) * 2.0 * PI;
      float el = vUv.y * vUv.y * 0.5 * PI;
      vec3 rd = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
      vec3 L = normalize(uL);
      vec3 ro = vec3(13.7, CAM_Y, -6.1);
      // 只走云层那一段：从云底往下留够团块的余量，到云顶为止（贴着地平线的走到 FAR）
      float y0 = max(rd.y, 1e-3);
      float t = (BASE - 2.0 - ro.y) / y0;
      float tEnd = min(FAR, (BASE + 11.0 - ro.y) / y0);
      float c = dot(rd, L);
      float ph = mix(hg(c, -0.2), hg(c, 0.6), 0.3);
      vec3 sigT = SIGMA * (1.0 + uAbsorb);
      vec3 albedo = 1.0 / (1.0 + uAbsorb);
      vec3 T = vec3(1.0);
      vec3 S = vec3(0.0);
      float A = 0.0;
      // 每个像素在一单位距离上占多大（决定细节到哪一级）
      float px = 2.0 * PI / uSize.x;
      float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      for (int i = 0; i < 420 && t < tEnd && T.r > 0.02; i++) {
        float dt = 0.03 + 0.004 * t;
        vec3 p = ro + rd * (t + jit * dt);
        float hd = heaps(p);
        if (hd > 2.0) {
          vec2 f = mod(p.xz, CELL);
          float edge = min(min(f.x, CELL - f.x), min(f.y, CELL - f.y));
          t += max(min(hd - 1.9, edge + CELL - 3.9), dt);
          continue;
        }
        float dc = lobes(p, hd, 2.0) - 0.25;
        if (dc > 0.0) {
          t += max(dc * 0.5, dt);
          continue;
        }
        float lod = clamp(log2(0.6 / (px * max(t, 0.1))) / 1.07 + 1.0, 2.0, 3.0);
        float d = lobes(p, hd, lod);
        if (d > 0.45) {
          t += max((d - 0.45) * 0.5, dt);
          continue;
        }
        d -= bumps(p, clamp(log2(0.33 / (2.0 * px * max(t, 0.1))) + 1.0, 1.0, 2.0));
        float dens = smoothstep(0.0, SOFT, -d);
        if (dens <= 0.0) {
          t += dt;
          continue;
        }
        float od = lightDepth(p, L, lod);
        vec3 sun = exp(-sigT * od) * ph + MS * (0.5 * exp(-0.25 * sigT * od) + 0.25 * exp(-0.06 * sigT * od)) * mix(ph, 1.0, 0.6);
        float hy = smoothstep(BASE, BASE + 8.0, p.y);
        vec3 amb = uAmb * (0.35 + 0.65 * hy) * exp(-1.5 * skyDepth(p));
        vec3 bounce = uBounce * (1.0 - hy);
        vec3 lum = uSunCol * sun + amb + bounce;
        // 远处的云淡进背后的天色：淡掉的那部分不算进不透明度
        float keep = exp(-FOG * max(t - 20.0, 0.0));
        vec3 tr = exp(-sigT * dens * dt);
        vec3 w = T * (1.0 - tr);
        S += w * albedo * lum * keep;
        A += w.g * keep;
        T *= tr;
        t += dt;
      }
      // 保色相的肩：最亮的通道压到 PEAK 以内，其余按同样比例
      float m = max(max(S.r, S.g), max(S.b, 1e-6));
      S *= PEAK * (1.0 - exp(-m / PEAK)) / m;
      gl_FragColor = vec4(S, clamp(A, 0.0, 1.0));
    }`,
}

const target = () =>
  new THREE.WebGLRenderTarget(CLOUD_W, CLOUD_H, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
  })

/** 云的光照（由天球按时间给） */
export type CloudLight = { dir: THREE.Vector3; sun: THREE.Color; amb: THREE.Color; bounce: THREE.Color; absorb: THREE.Vector3 }

export class CloudBaker {
  /** 天球取样的那张（烘好的） */
  front = target()
  private back = target()
  private mat = new THREE.ShaderMaterial({ ...BakeShader, uniforms: THREE.UniformsUtils.clone(BakeShader.uniforms), depthTest: false, depthWrite: false, blending: THREE.NoBlending })
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  /** 正在烘的下一行；-1 = 没在烘 */
  private row = -1
  private pending: CloudLight | null = null
  /** 至少烘好过一张 */
  ready = false

  constructor() {
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  /** 要按这个光照重烘（正在烘的那张烘完再开始下一张） */
  request(light: CloudLight) {
    this.pending = light
  }

  busy() {
    return this.row >= 0 || !!this.pending
  }

  /** 每帧调用：烘几行；整张烘好、换上的那一帧返回 true（要重画） */
  step(renderer: THREE.WebGLRenderer, rows = ROWS) {
    if (this.row < 0) {
      if (!this.pending) return false
      const u = this.mat.uniforms
      const l = this.pending
      u.uL.value.copy(l.dir)
      u.uSunCol.value.copy(l.sun)
      u.uAmb.value.copy(l.amb)
      u.uBounce.value.copy(l.bounce)
      u.uAbsorb.value.copy(l.absorb)
      this.pending = null
      this.row = 0
    }
    const prev = renderer.getRenderTarget()
    const autoClear = renderer.autoClear
    const n = Math.min(rows, CLOUD_H - this.row)
    this.back.scissor.set(0, this.row, CLOUD_W, n)
    this.back.scissorTest = true
    renderer.autoClear = false
    renderer.setRenderTarget(this.back)
    renderer.render(this.scene, this.cam)
    renderer.setRenderTarget(prev)
    renderer.autoClear = autoClear
    this.row += n
    if (this.row < CLOUD_H) return false
    this.row = -1
    const t = this.front
    this.front = this.back
    this.back = t
    this.ready = true
    return true
  }

  dispose() {
    this.front.dispose()
    this.back.dispose()
    this.mat.dispose()
    this.quad.geometry.dispose()
  }
}
