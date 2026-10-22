// 体积光（后处理，漫游时）：阳光从窗口斜射进屋、照亮空气里的浮尘，形成一道道光柱（原神室内的那种）。
//
// 做法：每个像素沿视线从镜头走到画面里的物体（深度取环境光遮蔽那一遍的深度图，不多画场景），一路取样：
//   - 这一点照得到太阳吗：查太阳的阴影贴图（和地上的光斑同一张），所以光柱的形状、被窗格 / 窗帘 / 家具挡出的阴影
//     都和地上的光斑完全一致；
//   - 这一点在屋里吗：查灯光模块的俯视房间编号图（lightMask.ts，编号 ≥ 2 是室内房间组），屋外、阳台不算，
//     不然透过窗户看出去整片户外都是雾；
//   - 照得到又在屋里的长度累加起来，按相位函数（看向太阳的方向更亮，前向散射）乘上阳光颜色，加到画面上。
// 加在泛光之前，光柱最亮的地方会晕开一点。取样起点按像素抖动（静态的，画面不动时不闪），避免一圈圈的条纹。
// 画面增强开了体积光、在漫游里、高画质时开（深度图借环境光遮蔽那一遍，见 post.ts）；入夜随太阳一起消失。

import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { LM_FETCH_GLSL, LM_OUTDOOR, lightMaskUniforms } from './lightMask'
import { KEEP_ALPHA } from './blend'

/** 沿视线的取样数、最远走多远（cm） */
const STEPS = 40
const MAX_DIST = 1500

const VolumetricShader = {
  name: 'WalkVolumetric',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uShadow: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uStrength: { value: 0 },
    uFrame: { value: 0 },
    ...lightMaskUniforms,
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2DShadow uShadow;
    uniform mat4 uShadowMatrix;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uStrength;
    uniform float uFrame;
    varying vec2 vUv;
    ${LM_FETCH_GLSL}

    // 这一点在不在屋里：所在楼层的房间编号图里编号 ≥ 2（0 = 墙体，1 = 户外 / 阳台）
    float indoor(vec3 p) {
      return lmFetch(p.xz, lmFloorOf(p.y)).x > ${LM_OUTDOOR}.5 ? 1.0 : 0.0;
    }

    float sunLit(vec3 p) {
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0 || sc.z > 1.0) return 0.0;
      return texture(uShadow, vec3(sc.xy, sc.z - 0.0005));
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.0) {
        gl_FragColor = base;
        return;
      }
      float depth = texture2D(tDepth, vUv).x;
      vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 view = uProjInv * ndc;
      view /= view.w;
      vec3 end = (uCamWorld * vec4(view.xyz, 1.0)).xyz;
      vec3 start = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 ray = end - start;
      float len = min(length(ray), ${MAX_DIST}.0);
      vec3 dir = normalize(ray);
      float stepLen = len / ${STEPS}.0;
      // 起点按像素抖动（interleaved gradient noise）：不同像素错开取样位置，消掉一圈圈的条纹；
      // 每帧再错开一个黄金比例的相位，镜头静止时的多帧累积（post.ts）把抖动的颗粒平均掉
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.618034);
      float acc = 0.0;
      for (int i = 0; i < ${STEPS}; i++) {
        vec3 p = start + dir * (stepLen * (float(i) + jitter));
        acc += sunLit(p) * indoor(p);
      }
      acc *= stepLen;
      // 前向散射：看向太阳那一侧（逆光看光柱）更亮
      float c = max(dot(dir, uSunDir), 0.0);
      float phase = 0.45 + 1.6 * pow(c, 6.0);
      vec3 scatter = uSunColor * (acc * uStrength * phase);
      gl_FragColor = vec4(base.rgb + scatter, base.a);
    }`,
}

export function createVolumetric() {
  const pass = new ShaderPass(VolumetricShader)
  // 共享的房间编号图 uniform：ShaderPass 会克隆 uniforms，这里换回同一个对象，户型变了自动跟上
  for (const k of Object.keys(lightMaskUniforms) as (keyof typeof lightMaskUniforms)[]) pass.uniforms[k] = lightMaskUniforms[k]
  return pass
}

const sunDir = new THREE.Vector3()

/**
 * 每帧画之前更新：镜头矩阵、太阳方向和阴影矩阵、深度图、累积的帧序号（抖动相位）。strength = 0 时不走光线（只拷贝画面）。
 * 太阳的阴影贴图要先画过一次才有（第一帧之前 strength 当 0）。
 */
export function updateVolumetric(pass: ShaderPass, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, depth: THREE.Texture | null, strength: number, frame = 0) {
  const u = pass.uniforms
  u.uFrame.value = frame % 64
  const shadow = sun.shadow.map?.depthTexture ?? null
  u.uStrength.value = shadow && depth ? strength : 0
  if (!shadow || !depth) return
  u.tDepth.value = depth
  u.uShadow.value = shadow
  u.uShadowMatrix.value.copy(sun.shadow.matrix)
  u.uProjInv.value.copy(camera.projectionMatrixInverse)
  u.uCamWorld.value.copy(camera.matrixWorld)
  u.uSunDir.value.copy(sunDir.subVectors(sun.position, sun.target.position).normalize())
  u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity)
}

// ---------- 浮尘 ----------
// 空气里的灰尘：一个立方体里撒满粒子，每颗在世界里有固定的位置、慢慢飘（漫游时；鸟瞰时不动，免得一直重画），
// 立方体跟着视点走（位置对边长取模，走出一边就从另一边回来，所以看起来是满屋子都有）：漫游时以镜头为中心、
// 鸟瞰时以视角焦点为中心、边长大到盖住整个户型。
// 顶点着色器里查太阳的阴影贴图和房间编号图（同光柱）：被阳光照到的亮（光柱里的金色亮点），屋里其余地方只有很淡的一点（天光色），
// 屋外不画。立方体边上淡出（取模换边时不会突然冒出来）；远处的颗粒按距离放大（屏幕上保持一两个像素），
// 比一个像素小的按面积压暗、不缩到一像素以下，不闪。
// 加色混合、不写深度，画在主场景里（线性空间，之后照常过泛光、色调映射）。

/** 粒子数、立方体边长（cm） */
const DUST_COUNT = 14000
/** 立方体边长（cm）：漫游、鸟瞰 */
export const DUST_BOX_WALK = 520
export const DUST_BOX_ORBIT = 1600
/** 浮尘只在地面以上这么高（cm）以内：大约到天花板 */
const DUST_CEIL = 240
/** 光柱外（屋里没被阳光照到的地方）的浮尘亮度，相对光柱里 */
const DUST_AMBIENT = 0.02

const DustShader = {
  uniforms: {
    uShadow: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uAmbColor: { value: new THREE.Color() },
    uBoxMin: { value: new THREE.Vector3() },
    uBox: { value: DUST_BOX_WALK },
    uTime: { value: 0 },
    /** 投影换算：世界尺寸 × uProj / 距离 = 像素 */
    uProj: { value: 1 },
    uStrength: { value: 0 },
    ...lightMaskUniforms,
  },
  vertexShader: /* glsl */ `
    uniform sampler2DShadow uShadow;
    uniform mat4 uShadowMatrix;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbColor;
    uniform vec3 uBoxMin;
    uniform float uBox;
    uniform float uTime;
    uniform float uProj;
    uniform float uStrength;
    varying vec3 vCol;
    ${LM_FETCH_GLSL}
    float sunLit(vec3 p) {
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0 || sc.z > 1.0) return 0.0;
      return texture(uShadow, vec3(sc.xy, sc.z - 0.0005));
    }
    void main() {
      vec3 s = position;
      // 慢慢往下沉、左右飘（每颗相位不同）
      vec3 drift = vec3(sin(uTime * 0.13 + s.y * 40.0) * 4.0, -uTime * 0.9 + sin(uTime * 0.21 + s.x * 30.0) * 2.5, cos(uTime * 0.11 + s.z * 50.0) * 4.0);
      vec3 p = uBoxMin + mod(s * uBox + drift - uBoxMin, uBox);
      vec3 q = (p - uBoxMin) / uBox;
      float edge = min(min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)), min(q.z, 1.0 - q.z));
      // 屋里：房间编号图里是房间，且在这一层的地面和天花板之间（鸟瞰时房子上空不算）
      float fl = lmFloorOf(p.y);
      float above = p.y - lmFloorY[int(fl)];
      float inside = lmFetch(p.xz, fl).x > ${LM_OUTDOOR}.5 && above > 0.0 && above < ${DUST_CEIL}.0 ? 1.0 : 0.0;
      float lit = sunLit(p) * inside;
      vec4 mv = viewMatrix * vec4(p, 1.0);
      float dist = -mv.z;
      // 前向散射：逆光看更亮；一闪一闪（颗粒转动时反光忽明忽暗）
      vec3 view = normalize(p - cameraPosition);
      float phase = 0.35 + 2.2 * pow(max(dot(view, uSunDir), 0.0), 5.0);
      float twinkle = 0.55 + 0.45 * sin(uTime * (1.3 + s.z * 2.0) + s.x * 70.0);
      // 半径（cm）：比真的灰尘大，画面上是一颗颗带晕的亮点（动画背景里的画法）
      // 远处（鸟瞰）按距离放大，屏幕上保持一两个像素
      float r = mix(0.15, 0.42, pow(fract(s.y * 91.7), 3.0)) * max(1.0, dist / 250.0);
      float px = 2.0 * r * uProj / max(dist, 1.0);
      float size = max(px, 1.4);
      float k = smoothstep(0.0, 0.12, edge) * smoothstep(8.0, 30.0, dist) * twinkle * uStrength * (px * px) / (size * size);
      vCol = (uSunColor * lit * phase + uAmbColor * inside * ${DUST_AMBIENT.toFixed(3)}) * k;
      gl_PointSize = max(vCol.r, max(vCol.g, vCol.b)) > 0.0005 ? size : 0.0;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vCol;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      // 高斯光点：小而亮的芯 + 一圈很淡的晕，边缘没有硬边
      float a = exp(-d * d * 30.0) * 0.8 + exp(-d * d * 6.0) * 0.25;
      gl_FragColor = vec4(vCol * a, 0.0);
    }`,
}

export function createDust() {
  const pos = new Float32Array(DUST_COUNT * 3)
  // 固定种子的随机分布（每次一样）
  let st = 12345
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < pos.length; i++) pos[i] = rnd()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  // 颜色直接相加（AdditiveBlending 会乘 alpha）；目标的 alpha 不动：画布背景是透明的（Base 按 alpha 合成天色），加了会在天空上挖出黑点
  const mat = new THREE.ShaderMaterial({
    ...DustShader,
    uniforms: THREE.UniformsUtils.clone(DustShader.uniforms),
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    ...KEEP_ALPHA,
  })
  for (const k of Object.keys(lightMaskUniforms) as (keyof typeof lightMaskUniforms)[]) mat.uniforms[k] = lightMaskUniforms[k]
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  pts.userData.noOutline = true
  pts.raycast = () => {}
  return pts
}

/**
 * 每帧画之前更新浮尘：立方体中心和边长、太阳、天光（光柱外的淡淡一层的颜色）、时间。
 * strength = 0（或还没有阴影贴图）时返回 false，不用画
 */
export function updateDust(pts: THREE.Points, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, height: number, time: number, strength: number, center: THREE.Vector3, box: number) {
  const u = (pts.material as THREE.ShaderMaterial).uniforms
  const shadow = sun.shadow.map?.depthTexture ?? null
  if (!shadow || strength <= 0) return false
  u.uShadow.value = shadow
  u.uShadowMatrix.value.copy(sun.shadow.matrix)
  u.uSunDir.value.copy(sunDir.subVectors(sun.position, sun.target.position).normalize())
  u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity)
  u.uAmbColor.value.copy(hemi.color).multiplyScalar(hemi.intensity)
  u.uBox.value = box
  u.uBoxMin.value.copy(center).subScalar(box / 2)
  u.uTime.value = time
  u.uProj.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360))
  u.uStrength.value = strength
  return true
}
