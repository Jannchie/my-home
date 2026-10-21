// 画面效果的天空背景（LookDef.sky，「动画感」预设默认开，其余可以在调整里打开）：跟着镜头走的天球，照新海诚动画（和「新海诚风」的天空照片）的天画——
//   - 蓝天：天顶深而饱和的钴蓝 → 中段青蓝 → 地平线很窄的一条亮带；
//   - 积云：体积云（clouds.ts），光线步进烘进一张贴图，这里只取样叠上去；太阳、黄昏、入夜程度变了才重烘；
//   - 高空零散的鱼鳞云；太阳周围一圈光晕；
//   - 黄昏（太阳低）：地平线变橙、天顶偏蓝紫，云的受光面暖金、中间调粉、背光面紫，朝太阳的云底被照成橙粉；
//   - 入夜：夜空渐变、斜跨天空的银河、疏密和亮度都不均匀的星星；云换成深蓝灰、月光照亮边缘的夜云，挡住后面的星星。
// 窗外看出去是动画里的天，鸟瞰时房子背后也是天。
//
// 天球压在远平面上、不写深度、在不透明物体之后画（被房子挡住的像素不算）；不投影、不进遮蔽那一遍（不写深度的都跳过）。
// 天球中心就是镜头，走动时天不跟着平移。

import * as THREE from 'three'
import { CloudBaker } from './clouds'

const RADIUS = 9000

const SkyShader = {
  uniforms: {
    uZenith: { value: new THREE.Color('#1a4cb5') },
    uMid: { value: new THREE.Color('#3a8fe6') },
    uHorizon: { value: new THREE.Color('#a6d8f7') },
    uGround: { value: new THREE.Color('#9fb0c0') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    /** 黄昏程度 0（白天）~ 1（太阳贴着地平线） */
    uGolden: { value: 0 },
    uNight: { value: 0 },
    uNightTop: { value: new THREE.Color('#1f2840') },
    uNightLow: { value: new THREE.Color('#2d3a57') },
    uClouds: { value: null as THREE.Texture | null },
    uCloudOn: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      // 压到远平面上：深度测试时被房子挡住的像素不跑天空的着色器（云、星星的噪声很贵）
      gl_Position.z = gl_Position.w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uZenith;
    uniform vec3 uMid;
    uniform vec3 uHorizon;
    uniform vec3 uGround;
    uniform vec3 uSunDir;
    uniform float uGolden;
    uniform float uNight;
    uniform vec3 uNightTop;
    uniform vec3 uNightLow;
    uniform sampler2D uClouds;
    uniform float uCloudOn;
    varying vec3 vDir;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.3, 9.1);
        a *= 0.5;
      }
      return v;
    }

    // 云的三层明暗：背光的蓝灰 → 中间的浅灰蓝 → 受光的亮白（黄昏：紫 → 粉 → 暖金）
    vec3 cloudColor(float lit) {
      vec3 sh = mix(vec3(0.5, 0.6, 0.82), vec3(0.5, 0.4, 0.66), uGolden);
      vec3 md = mix(vec3(0.78, 0.85, 0.96), vec3(0.95, 0.6, 0.7), uGolden);
      vec3 hi = mix(vec3(1.0), vec3(1.0, 0.84, 0.62), uGolden);
      vec3 c = mix(sh, md, smoothstep(0.0, 0.5, lit));
      return mix(c, hi, smoothstep(0.5, 1.0, lit));
    }

    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 sunD = normalize(uSunDir);
      float sunCos = dot(d, sunD);
      float az = atan(d.z, d.x);
      float sunAz = atan(sunD.z, sunD.x);
      // 和太阳的方位差（-1 背对 … 1 正对）
      float toSun = cos(az - sunAz);

      // 天空：天顶深钴蓝 → 中段青蓝 → 地平线很窄的一条亮带；黄昏时地平线（尤其太阳那一侧）染成橙，天顶偏蓝紫
      float t = clamp(h, 0.0, 1.0);
      vec3 zen = mix(uZenith, vec3(0.2, 0.22, 0.55), uGolden);
      vec3 mid = mix(uMid, vec3(0.55, 0.45, 0.75), uGolden);
      vec3 hor = mix(uHorizon, mix(vec3(0.95, 0.5, 0.45), vec3(1.0, 0.65, 0.35), max(toSun, 0.0)), uGolden);
      vec3 sky = mix(mid, zen, smoothstep(0.2, 0.85, t));
      sky = mix(hor, sky, smoothstep(0.0, 0.14, t));
      sky = mix(uGround, sky, smoothstep(-0.05, 0.01, h));

      // 太阳周围的光晕
      float glow = pow(max(sunCos, 0.0), 64.0) * 0.5 + pow(max(sunCos, 0.0), 8.0) * (0.06 + 0.25 * uGolden);
      sky += vec3(1.0, 0.9, 0.75) * glow;

      // 云的覆盖度和受光（夜里换成夜云的颜色、挡住星星时用）
      float cov = 0.0;
      float covLit = 0.0;
      if (h > -0.01) {
        // 高空的鱼鳞云（高积云）：零散的小块，受光的一侧边缘亮
        if (h > 0.25) {
          vec2 p = d.xz / (h + 0.05) * 3.2;
          float n = fbm(p + vec2(3.7, 1.3));
          float c = smoothstep(0.6, 0.64, n) * smoothstep(0.25, 0.45, h) * 0.85;
          if (c > 0.0) {
            vec2 off = normalize(sunD.xz + vec2(1e-4)) * 0.05;
            float lit = clamp((n - fbm(p + vec2(3.7, 1.3) + off)) * 18.0 + 0.6, 0.0, 1.0);
            sky = mix(sky, cloudColor(lit), c);
            covLit = mix(covLit, lit, c);
            cov = max(cov, c);
          }
        }
      }

      // 入夜：夜空的渐变（地平线一圈城市的暖光）+ 银河 + 疏密不均、大小亮度不一的星星 + 夜云
      vec3 night = mix(uNightLow, uNightTop, smoothstep(0.0, 0.7, clamp(h, 0.0, 1.0)));
      night += vec3(0.35, 0.22, 0.18) * (1.0 - smoothstep(0.0, 0.18, h)) * 0.35;
      float starsOn = smoothstep(0.4, 0.9, uNight) * smoothstep(0.0, 0.15, h);
      // 银河：天球上一条斜着的大圆带，里面是一团团的星云（偏紫蓝）和暗尘带
      vec3 mwN = normalize(vec3(0.8, 0.15, 0.55));
      float band = exp(-pow(dot(d, mwN) / 0.16, 2.0));
      float neb = fbm(d.xz / (abs(d.y) + 0.35) * 3.0 + vec2(5.2, 1.7));
      float dust = smoothstep(0.45, 0.7, fbm(d.xz / (abs(d.y) + 0.35) * 6.0 + vec2(1.3, 8.4)));
      float milky = band * smoothstep(0.3, 0.75, neb) * (1.0 - 0.7 * dust * band);
      vec3 mwCol = mix(vec3(0.45, 0.4, 0.75), vec3(0.85, 0.85, 1.0), smoothstep(0.55, 0.85, neb));
      // 星星：两层格子（小而多、大而少），每格一颗，位置抖开；疏密跟一层低频噪声和银河走
      vec2 sp = d.xz / (h + 0.4);
      float dens = smoothstep(0.3, 0.7, fbm(sp * 1.5 + vec2(9.1, 3.3))) * 0.7 + 0.3 + band * 1.5;
      float stars = 0.0;
      for (int k = 0; k < 2; k++) {
        float sc = k == 0 ? 520.0 : 180.0;
        vec2 g = sp * sc;
        vec2 cell = floor(g);
        float rnd = hash(cell + float(k) * 17.0);
        vec2 pos = vec2(hash(cell + 3.1), hash(cell + 7.7));
        float dist = length(fract(g) - pos);
        float size = k == 0 ? 0.28 : 0.16 + 0.16 * hash(cell + 5.5);
        float on = step(1.0 - (k == 0 ? 0.06 : 0.02) * dens, rnd);
        float bright = mix(0.4, 1.4, hash(cell + 11.3)) * (k == 0 ? 1.2 : 2.4);
        stars += on * bright * (1.0 - smoothstep(0.0, size, dist));
      }
      vec3 starCol = mix(vec3(1.0, 0.85, 0.7), vec3(0.8, 0.9, 1.0), hash(floor(sp * 520.0) + 2.2));
      night += (mwCol * milky * 0.8 + starCol * stars) * starsOn * (1.0 - cov);
      // 夜云：深蓝灰的云体，受光的一侧被月光照出淡淡的蓝白边，云底一点城市的暖光
      vec3 nightCloud = mix(vec3(0.035, 0.045, 0.09), vec3(0.16, 0.2, 0.32), covLit * covLit);
      nightCloud += vec3(0.3, 0.18, 0.12) * (1.0 - smoothstep(0.0, 0.3, h)) * 0.4;
      night = mix(night, nightCloud, cov);
      vec3 rgb = mix(sky, night, uNight);
      // 体积积云（clouds.ts 烘好的贴图，颜色已经按时间打好光）：盖在天色、星星、太阳光晕上
      if (uCloudOn > 0.5 && h > 0.0) {
        float v = sqrt(asin(min(h, 1.0)) / (0.5 * 3.14159265));
        vec4 cl = texture2D(uClouds, vec2(az / (2.0 * 3.14159265) + 0.5, v));
        // 贴着地平线收掉（最下面一行之下没有云）
        cl *= smoothstep(0.0, 0.01, h);
        // 轮廓收紧：贴图放大后半透明的边会糊成一圈，按不透明度提一下对比，颜色按同样比例跟着（预乘的）
        float a = smoothstep(0.03, 0.6, cl.a);
        cl = vec4(cl.rgb * (a / max(cl.a, 1e-3)), a);
        rgb = rgb * (1.0 - cl.a) + cl.rgb;
      }
      gl_FragColor = vec4(rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}

export class AnimeSky {
  readonly mesh: THREE.Mesh
  private mat: THREE.ShaderMaterial
  private clouds = new CloudBaker()
  /** 上一次请求烘焙时的光照：变化够大才重烘（拖时间轴时不至于每帧都烘） */
  private baked = { dir: new THREE.Vector3(), golden: -1, night: -1 }

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
      vertexShader: SkyShader.vertexShader,
      fragmentShader: SkyShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 48, 24), this.mat)
    this.mesh.name = 'anime-sky'
    // 不透明物体之后画：被挡住的像素在深度测试里就剔掉
    this.mesh.renderOrder = 1000
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.mesh.raycast = () => {}
    this.mesh.visible = false
  }

  /**
   * 太阳和时间：dir 指向太阳（世界）；altitude 太阳高度角（度）；night 入夜程度；
   * bg 是 sky.ts 的背景渐变（中心 / 中段 / 边缘），入夜时用它当夜空色
   */
  setSun(dir: THREE.Vector3, altitude: number, night: number, bg: [string, string, string]) {
    const u = this.mat.uniforms
    u.uSunDir.value.copy(dir)
    // 太阳 25° 以下开始有黄昏色，贴着地平线最浓
    u.uGolden.value = 1 - THREE.MathUtils.smoothstep(altitude, 2, 25)
    u.uNight.value = night
    u.uNightLow.value.set(bg[0])
    u.uNightTop.value.set(bg[2])
    const golden = u.uGolden.value as number
    const b = this.baked
    if (b.golden >= 0 && b.dir.dot(dir) > Math.cos(THREE.MathUtils.degToRad(1)) && Math.abs(b.golden - golden) < 0.02 && Math.abs(b.night - night) < 0.02) return
    b.dir.copy(dir)
    b.golden = golden
    b.night = night
    this.clouds.request(cloudLight(dir, altitude, golden, night))
  }

  /** 每帧调用：云贴图要重烘时烘几行；新的一张换上的那一帧返回 true（要重画） */
  step(renderer: THREE.WebGLRenderer) {
    if (!this.mesh.visible || !this.clouds.step(renderer)) return false
    this.mat.uniforms.uClouds.value = this.clouds.front.texture
    this.mat.uniforms.uCloudOn.value = 1
    return true
  }

  /** 每帧画之前：天球中心跟着镜头 */
  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mat.dispose()
    this.clouds.dispose()
    this.mesh.removeFromParent()
  }
}

const RAYLEIGH = new THREE.Vector3(0.04, 0.1, 0.23)

/** 按时间给云打光：白天白亮的阳光 + 蓝色天光；太阳越低穿过的大气越厚，蓝光先没（橙红）；入夜换成淡蓝的月光 */
function cloudLight(dir: THREE.Vector3, altitude: number, golden: number, night: number) {
  // 大气质量：太阳在天顶 = 1，贴着地平线约 30
  const am = Math.min(30, 1 / Math.max(Math.sin(THREE.MathUtils.degToRad(Math.max(altitude, 0))) + 0.03, 1e-3))
  const fade = THREE.MathUtils.smoothstep(altitude, -3, 1)
  const sun = new THREE.Color(Math.exp(-RAYLEIGH.x * (am - 1)), Math.exp(-RAYLEIGH.y * (am - 1)), Math.exp(-RAYLEIGH.z * (am - 1))).multiplyScalar(2.6 * fade)
  sun.lerp(new THREE.Color(0.07, 0.09, 0.15), night)
  const amb = new THREE.Color(0.55, 0.72, 1.2).lerp(new THREE.Color(0.3, 0.27, 0.52), golden).lerp(new THREE.Color(0.012, 0.017, 0.035), night)
  const bounce = new THREE.Color(0.14, 0.13, 0.12).lerp(new THREE.Color(0.2, 0.11, 0.1), golden).lerp(new THREE.Color(0.035, 0.02, 0.014), night)
  const absorb = new THREE.Vector3(0.006, 0.03, 0.08).lerp(new THREE.Vector3(0.02, 0.12, 0.3), golden * (1 - night))
  return { dir: dir.clone(), sun, amb, bounce, absorb }
}
