// 转折线（后处理）：描边只画得出物体的外轮廓（反向外壳），冰箱、柜子的倒角、门缝、台面转角这些物体内部的转折画不出来。
// 这里借环境光遮蔽那一遍已经画好的法线、深度图（post.ts 的 GTAOPass），在法线突变（转折）或深度突变（缝隙、前后叠着）的地方描一条线。
// 线的颜色是那一点画面颜色的深色版本（和彩色描边一样，不是黑线）。画面效果带 crease 时开（「动画感」），省电画质不开。

import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/** 转折线至少连续多长（屏幕像素，两头各这么远）才画 */
const RUN = 2

const CreaseShader = {
  name: 'Crease',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uDTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uSil: { value: 0 },
    uFocusDist: { value: 300 },
    uNear: { value: 5 },
    uFar: { value: 20000 },
    uStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform vec2 uDTexel;
    uniform float uSil;
    uniform float uFocusDist;
    uniform float uNear;
    uniform float uFar;
    uniform float uStrength;
    varying vec2 vUv;

    float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    vec3 nrm(vec2 uv) { return unpackRGBToNormal(texture2D(tNormal, uv).rgb); }

    // 法线转折：两侧各取一个屏幕像素比较（法线图是半分辨率、双线性插值，圆角的倒角也能比出来）；
    // 过渡放宽，线是细的、边缘柔和（后处理画的线不经过多重采样）
    float creaseAt(vec2 uv, vec2 tx, vec2 ty) {
      float a = 1.0 - smoothstep(0.6, 0.93, dot(nrm(uv + tx), nrm(uv - tx)));
      float b = 1.0 - smoothstep(0.6, 0.93, dot(nrm(uv + ty), nrm(uv - ty)));
      return max(a, b);
    }
    // 深度缝隙：相邻点比这一点远出 4% 以上（门缝、前后叠着）
    float gapWith(float z0, vec2 off) {
      return smoothstep(0.04, 0.08, (viewZ(vUv + off) - z0) / z0);
    }

    // 外轮廓：深度的倒数在屏幕上沿平面是线性的，二阶差分在平面上为零，只在前后叠着的地方跳变。
    // 只取「比两边都近」的一侧（凸起的那一边），线描在前面物体的边上，不会在后面的墙上多出一圈；按深度图的像素取样
    float silAcross(vec2 uv, float w0, vec2 off) {
      float a = 1.0 / viewZ(uv + off);
      float b = 1.0 / viewZ(uv - off);
      return (2.0 * w0 - a - b) / w0;
    }

    // 墨线色（线性空间）：暖一点的深棕
    const vec3 INK = vec3(0.022, 0.016, 0.014);

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float d0 = texture2D(tDepth, vUv).x;
      if (uStrength <= 0.0 || d0 >= 1.0) {
        gl_FragColor = base;
        return;
      }
      float z0 = -perspectiveDepthToViewZ(d0, uNear, uFar);
      vec2 tx = vec2(uTexel.x, 0.0);
      vec2 ty = vec2(0.0, uTexel.y);
      float crease = creaseAt(vUv, tx, ty);
      // 只留连成线的：踢脚线顶面、窗台这类不到一个像素宽的细面，光栅化时一段有一段没有，转折线会断成一串珠子。
      // 横着或竖着往两边各隔 RUN 个像素看，两边都还在线上才算（连续的线横竖总有一个方向两头都是线），珠子去掉
      if (crease > 0.05 && z0 < 7000.0) {
        vec2 rx = tx * ${RUN.toFixed(1)};
        vec2 ry = ty * ${RUN.toFixed(1)};
        float runX = min(creaseAt(vUv + rx, tx, ty), creaseAt(vUv - rx, tx, ty));
        float runY = min(creaseAt(vUv + ry, tx, ty), creaseAt(vUv - ry, tx, ty));
        crease *= smoothstep(0.15, 0.5, max(runX, runY));
      }
      float gap = max(max(gapWith(z0, tx), gapWith(z0, -tx)), max(gapWith(z0, ty), gapWith(z0, -ty)));
      float e = max(crease, gap);
      // 线色：画面颜色压暗、提一点饱和度
      vec3 c = base.rgb * 0.42;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, 1.3), 0.0);
      // 描边模式：外轮廓（前后叠着的边）粗、墨色；内部的转折线细、是本色压暗的颜色（像画师的线：外粗内细）。
      // 外轮廓的取样间距 1.5 个深度图像素，线约两个 CSS 像素粗
      float sil = 0.0;
      float hl = 0.0;
      if (uSil > 0.0) {
        // 深度图是最近点取样：取样点对齐到深度图的像素中心，两侧到中心等距，平面上的二阶差分才是零
        vec2 duv = (floor(vUv / uDTexel) + 0.5) * uDTexel;
        float w0 = 1.0 / viewZ(duv);
        vec2 sx = vec2(uDTexel.x * 1.5, 0.0);
        vec2 sy = vec2(0.0, uDTexel.y * 1.5);
        // 门槛低：贴着墙的窗帘、挂画离墙只有几厘米，也要描出来
        sil = smoothstep(0.008, 0.03, max(silAcross(duv, w0, sx), silAcross(duv, w0, sy)));
        // 内部转折线比视线焦点远了就淡（漫游时焦点约三米，鸟瞰时是镜头到视角中心的距离），外轮廓留着
        e *= 1.0 - 0.5 * smoothstep(uFocusDist, uFocusDist * 3.0, z0);
        // 描线内侧的高光：凸起的棱（电视、柜子、台面的边）在线旁边留一道亮边，像画师在边缘提的高光。
        // 离线 2–4 个像素的一圈（宽取样有转折、窄取样没有）、凸的（深度倒数的二阶差分为正）、朝上或朝着镜头的面；
        // 超过焦点 2.5 倍就淡没了，那里不用算
        if (z0 < uFocusDist * 2.5) {
          vec2 hx = vec2(uDTexel.x * 2.0, 0.0);
          vec2 hy = vec2(0.0, uDTexel.y * 2.0);
          float wide = creaseAt(duv, hx, hy);
          float convex = smoothstep(0.001, 0.006, max(silAcross(duv, w0, hx), silAcross(duv, w0, hy)));
          vec3 n0 = nrm(vUv);
          float facing = smoothstep(0.3, 0.8, n0.y * 0.85 + n0.z * 0.3);
          hl = smoothstep(0.3, 0.8, wide - crease - sil) * convex * facing * (1.0 - smoothstep(uFocusDist, uFocusDist * 2.5, z0));
        }
      }
      // 远处的细节线淡掉，免得一片糊
      e *= 1.0 - smoothstep(3500.0, 7000.0, z0);
      vec3 ink = mix(c, min(c, INK), 0.88);
      // 高光：往白里提一点（保留本色）
      // 已经很亮的地方不再提（不然墙边会发白、被泛光晕开）
      vec3 col = mix(base.rgb, base.rgb * 1.12 + 0.02, hl * 0.35 * (1.0 - smoothstep(0.6, 1.0, dot(base.rgb, vec3(0.2126, 0.7152, 0.0722)))));
      col = mix(col, c, e * uStrength);
      // 外轮廓也随距离变淡一些（窗外的栏杆、远处的东西不抢画面）
      col = mix(col, ink, sil * (1.0 - 0.75 * smoothstep(uFocusDist * 1.3, uFocusDist * 4.0, z0)));
      gl_FragColor = vec4(col, base.a);
    }`,
}

export function createCrease() {
  return new ShaderPass(CreaseShader)
}

/** 每帧画之前：法线、深度图（环境光遮蔽那一遍的），画面尺寸（设备像素，取样按屏幕像素走），镜头远近裁剪面；没有图时 strength 当 0。
 * lines：后处理描线（外轮廓、描线内侧的高光）；focusDist：视线焦点距离（cm），内部转折线、高光从这里往外渐淡 */
export function updateCrease(pass: ShaderPass, camera: THREE.PerspectiveCamera, normal: THREE.Texture | null, depth: THREE.Texture | null, res: THREE.Vector2, strength: number, pixelRatio: number, lines: boolean, focusDist: number) {
  const u = pass.uniforms
  u.uStrength.value = normal && depth ? strength : 0
  if (!normal || !depth) return
  u.tNormal.value = normal
  u.tDepth.value = depth
  u.uTexel.value.set(1 / Math.max(1, res.x), 1 / Math.max(1, res.y))
  u.uSil.value = lines ? 1 : 0
  u.uFocusDist.value = focusDist
  // 法线、深度图按 CSS 像素画（post.ts createAO：像素比最多除到 1/2）
  const k = Math.min(2, Math.max(1, pixelRatio))
  u.uDTexel.value.set(k / Math.max(1, res.x), k / Math.max(1, res.y))
  u.uNear.value = camera.near
  u.uFar.value = camera.far
}
