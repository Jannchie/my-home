// 大气雾（后处理，画面效果 LookDef.fog，「手游风」用）：远处的东西蒙上一层天色，越贴地越浓，看向太阳那一侧带一点阳光色。
// 游戏画面的纵深感很大一部分来自这层空气：鸟瞰时房子后半截、院子、底座往背景里退；漫游时窗外的街景淡下去，屋里不受影响。
//
// 做法：深度取环境光遮蔽那一遍的深度图（和体积光、转折线共用，见 post.ts），反算出世界坐标：
//   - 距离雾：离镜头超过 start 的那一段按指数衰减（1 - e^(-密度 × 距离)）；
//   - 高度雾：雾的浓度随高度指数变小（离地面 height 厘米降到 1/e），乘到距离雾上：同样远的地面比屋顶雾浓；
//   - 颜色：天色（天球地平线附近的颜色，Sandbox3D 传进来）往阳光色偏，偏多少看视线和太阳方向的夹角（前向散射）。
// 天空（深度 = 1）不加：天球自己有地平线的亮带。在线性空间、泛光之前加（雾里的亮处照样晕开）。

import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

const FogShader = {
  name: 'Fog',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    /** 开始起雾的距离（cm）、每厘米的密度、高度衰减（cm）、地面高度 */
    uFog: { value: new THREE.Vector4(1000, 0, 400, 0) },
    uColor: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    /** 雾最浓到多少（不会把远处整个盖死） */
    uMax: { value: 0.7 },
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
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform vec4 uFog;
    uniform vec3 uColor;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    uniform float uMax;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float depth = texture2D(tDepth, vUv).x;
      if (uFog.y <= 0.0 || depth >= 1.0) {
        gl_FragColor = base;
        return;
      }
      vec4 view = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      view /= view.w;
      vec3 p = (uCamWorld * vec4(view.xyz, 1.0)).xyz;
      vec3 cam = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 ray = p - cam;
      float d = length(ray);
      float dist = max(d - uFog.x, 0.0);
      // 高度雾：沿视线积分 e^(-(y - 地面) / H)，取镜头和这一点的平均（视线水平时就是那个高度的浓度）
      float h0 = max(cam.y - uFog.w, 0.0);
      float h1 = max(p.y - uFog.w, 0.0);
      float dh = h1 - h0;
      float hk = abs(dh) > 1.0 ? uFog.z * (exp(-h0 / uFog.z) - exp(-h1 / uFog.z)) / dh : exp(-h0 / uFog.z);
      float f = (1.0 - exp(-dist * uFog.y * (0.35 + 0.65 * hk))) * uMax;
      float s = pow(max(dot(ray / max(d, 1e-3), uSunDir), 0.0), 6.0);
      vec3 col = uColor + uSunColor * s;
      // 画面内容是预乘的（清屏处 alpha = 0）：雾按 alpha 加，透明背景上不凭空出现雾
      gl_FragColor = vec4(mix(base.rgb, col * base.a, f), base.a);
    }`,
}

export function createFog() {
  return new ShaderPass(FogShader)
}

const sunDir = new THREE.Vector3()

/**
 * 每帧更新。start：开始起雾的距离（漫游时是房间尺度之外，鸟瞰时是视角焦点附近）；density = 0 或没有深度图时只拷贝画面。
 * color：雾的颜色（线性）；ground：地面高度
 */
export function updateFog(
  pass: ShaderPass,
  camera: THREE.PerspectiveCamera,
  depth: THREE.Texture | null,
  o: { start: number; density: number; height: number; ground: number; color: THREE.Color; sun: THREE.DirectionalLight; sunK: number; max: number },
) {
  const u = pass.uniforms
  u.uFog.value.set(o.start, depth ? o.density : 0, o.height, o.ground)
  if (!depth) return
  u.tDepth.value = depth
  u.uProjInv.value.copy(camera.projectionMatrixInverse)
  u.uCamWorld.value.copy(camera.matrixWorld)
  u.uColor.value.copy(o.color)
  u.uSunDir.value.copy(sunDir.subVectors(o.sun.position, o.sun.target.position).normalize())
  u.uSunColor.value.copy(o.sun.color).multiplyScalar(o.sun.intensity * o.sunK)
  u.uMax.value = o.max
}
