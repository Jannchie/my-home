// 镜子和水面的真实反射（画面增强开了反射时）：给标了 markMirror / markWater 的镜面、水面（toon.ts）换上真实的平面反射。
//
//   - 每面镜子挂一个 Reflector 子对象：按几何体最薄的轴定镜面法线（取朝素材正面 +z 的一侧），贴在镜面前 0.05cm，
//     几何体就是镜面本身的形状（圆镜、拱形镜不会变成方的），跟着柜门、折叠镜一起动；
//   - 在画面里、正面朝人、不太远的都开真实反射（每面多画一遍场景，倒影里不画描边和小物件）；
//     数量有个保险上限 MAX_ACTIVE，超过时按距离取近的（有个距离差的门槛，两面差不多远时不来回切）；
//   - 开着反射的镜子把画出来的高光条（userData.mirrorShine）藏起来，不然像贴在倒影上的贴纸；
//   - 水面（浴缸、马桶、鱼缸……）法线朝上，倒影跟着波纹晃，按菲涅尔在水色和倒影之间混合；
//     没轮到真实倒影的水面也换成同样会动的水（倒影是固定的室内色，不多画场景），任何角度看都是水；
//     画面里有水面时 update 返回 true，沙盘每帧重画（波纹在动）。
// 画面增强开了反射、高画质时用（Sandbox3D 负责建 / 拆）。

import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { guardReflector, releaseReflector } from './reflect'

/** 同时开着反射的镜子 / 水面数的上限：看得见的都开，这个只是保险（镜子特别多的户型不至于卡死） */
const MAX_ACTIVE = 4
/** 比这远的不反射（cm） */
const RANGE = { mirror: 700, water: 450 }
/** 换镜子的距离门槛（cm） */
const STICKY = 80
/** 镜面太小（cm²）的不做：鸟笼里的小镜子之类，反射看不出来还白画一遍场景 */
const MIN_AREA = 150
/**
 * 镜面在画面里太小也不做：包围球半径占画面半高的比例。远处的梳妆镜、桌上的小圆镜在画面里只有几十个像素，
 * 倒影看不清，却和穿衣镜一样要多画一遍整个场景。正开着的门槛低一点（不来回切）
 */
const MIN_SCREEN = 0.07
const MIN_SCREEN_KEEP = 0.05

const MirrorShader = {
  name: 'MirrorReflect',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv.xy / vUv.w);
      // 镜子玻璃带一点青、略暗；倒影里没画到东西的地方（窗外透明背景）给一点天色
      vec3 sky = vec3(0.86, 0.92, 0.96);
      vec3 rgb = mix(sky, c.rgb / max(c.a, 1e-3), c.a) * vec3(0.9, 0.95, 0.97);
      gl_FragColor = vec4(rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}

/** 水纹：几组斜向的正弦波叠出细碎的波纹（世界坐标 xz，cm），返回 [-1, 1] 的扰动 */
const RIPPLE = /* glsl */ `
  vec2 ripple(vec2 p, float t) {
    return vec2(
      sin(p.x * 0.42 + t * 1.6) + 0.6 * sin((p.x + p.y) * 0.27 - t * 1.1) + 0.35 * sin((p.x - 2.0 * p.y) * 0.61 + t * 2.3),
      cos(p.y * 0.38 - t * 1.3) + 0.6 * sin((p.y - p.x) * 0.31 + t * 0.9) + 0.35 * cos((p.y + 2.0 * p.x) * 0.57 - t * 2.1)
    ) / 1.95;
  }`

/**
 * 没轮到真实倒影的水面：同样的波纹和菲涅尔，倒影换成一个固定的室内色（天花板、墙的米白），不多画场景。
 * 开着反射时所有标了 markWater 的水面都换成它，轮到真实倒影的那一面再在上面叠 Reflector。
 */
const FakeWaterShader = {
  uniforms: {
    uTime: { value: 0 },
    uWater: { value: new THREE.Color() },
    uLight: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uWater;
    uniform float uLight;
    varying vec3 vWorld;
    ${RIPPLE}
    void main() {
      vec2 n = ripple(vWorld.xz, uTime);
      vec3 V = normalize(cameraPosition - vWorld);
      float f = 0.18 + 0.82 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      // 「倒影」：室内的米白，随波纹忽明忽暗
      vec3 room = vec3(0.9, 0.87, 0.82) * (0.85 + 0.15 * n.y);
      vec3 body = uWater * (0.9 + 0.1 * n.x);
      vec3 rgb = mix(body, room, f * 0.7) * uLight;
      rgb += vec3(0.25) * pow(max(n.x * n.y, 0.0), 6.0) * uLight;
      gl_FragColor = vec4(rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}

/** 所有水面材质共享的波纹时间、整体亮度：每帧在 Mirrors.update 里写一次 */
const waterUniforms = { uTime: { value: 0 }, uLight: { value: 1 } }

const WaterShader = {
  name: 'WaterReflect',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uWater: { value: new THREE.Color() },
    uLight: { value: 1 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uWater;
    uniform float uLight;
    varying vec4 vUv;
    varying vec3 vWorld;
    ${RIPPLE}
    void main() {
      vec2 n = ripple(vWorld.xz, uTime);
      vec4 c = texture2D(tDiffuse, vUv.xy / vUv.w + n * 0.012);
      vec3 sky = vec3(0.86, 0.92, 0.96);
      vec3 refl = mix(sky, c.rgb / max(c.a, 1e-3), c.a);
      vec3 V = normalize(cameraPosition - vWorld);
      // 水的菲涅尔：俯视多半是水色（透出池底），越斜越像镜子
      float f = 0.18 + 0.82 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      vec3 body = uWater * (0.9 + 0.1 * n.x) * uLight;
      vec3 rgb = mix(body, refl, f);
      // 波峰上的碎亮光
      rgb += vec3(0.25) * pow(max(n.x * n.y, 0.0), 6.0) * uLight;
      gl_FragColor = vec4(rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}

interface Item {
  kind: 'mirror' | 'water'
  mesh: THREE.Mesh
  refl: Reflector | null
  /** 镜面中心、法线（镜子局部空间，建反射时算好） */
  frame: THREE.Matrix4 | null
  area: number
  shine: THREE.Object3D[]
  /** 水面：开着反射期间换上的假水面材质，和换下来的原材质 */
  fake: THREE.ShaderMaterial | null
  orig: THREE.Material | THREE.Material[] | null
}

const tmpP = new THREE.Vector3()
const tmpN = new THREE.Vector3()
const tmpS = new THREE.Sphere()
const frustum = new THREE.Frustum()
const projView = new THREE.Matrix4()

export class Mirrors {
  private items = new Map<THREE.Mesh, Item>()
  private size = new THREE.Vector2(512, 512)

  /** 重新找场景里的镜子（刚建、家具变了时）；已经建好的反射保留 */
  scan(scene: THREE.Object3D) {
    const seen = new Set<THREE.Mesh>()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || !(m.userData.mirror || m.userData.water)) return
      seen.add(m)
      if (this.items.has(m)) return
      this.items.set(m, { kind: m.userData.water ? 'water' : 'mirror', mesh: m, refl: null, frame: null, area: 0, shine: shineOf(m), fake: null, orig: null })
    })
    for (const [m, it] of this.items) if (!seen.has(m)) this.drop(it)
  }

  /**
   * 每帧画之前：挑出要开反射的镜子 / 水面，水面都换成会动的水；light：整体亮度（入夜变暗，水面不受场景灯光）。
   * 返回 true = 画面里有水面（波纹在动，要每帧重画）
   */
  update(camera: THREE.PerspectiveCamera, time: number, light: number) {
    waterUniforms.uTime.value = time
    waterUniforms.uLight.value = light
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projView)
    const cam = camera.position
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const cands: { it: Item; d: number }[] = []
    let waves = false
    for (const it of this.items.values()) {
      const m = it.mesh
      if (it.kind === 'water' && !it.fake) fakeWater(it)
      if (!visibleInScene(m)) continue
      if (!it.frame) prepare(it)
      if (!it.frame || it.area < MIN_AREA) continue
      // 镜面中心、法线（世界）
      tmpP.setFromMatrixPosition(it.frame).applyMatrix4(m.matrixWorld)
      tmpN.setFromMatrixColumn(it.frame, 2).transformDirection(m.matrixWorld)
      const d = tmpP.distanceTo(cam)
      if (d > RANGE[it.kind]) continue
      if (tmpN.dot(tmpS.center.copy(cam).sub(tmpP)) <= 0) continue
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
      tmpS.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld)
      if (!frustum.intersectsSphere(tmpS)) continue
      if (it.kind === 'water') waves = true
      const screen = tmpS.radius / Math.max(1, d) / halfH
      if (screen < (it.refl?.visible ? MIN_SCREEN_KEEP : MIN_SCREEN)) continue
      cands.push({ it, d })
    }
    // 正开着的镜子算近一点：两面差不多远时不来回切（切换的那一帧新镜子还没有倒影，会闪）
    cands.sort((a, b) => a.d - (a.it.refl?.visible ? STICKY : 0) - (b.d - (b.it.refl?.visible ? STICKY : 0)))
    const on = new Set(cands.slice(0, MAX_ACTIVE).map((c) => c.it))
    for (const it of this.items.values()) {
      const active = on.has(it)
      if (active && !it.refl) this.build(it)
      if (it.refl) it.refl.visible = active
      for (const s of it.shine) s.visible = !active
    }
    return waves
  }

  /** 倒影按画面的一半分辨率画 */
  setSize(w: number, h: number) {
    this.size.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)))
    for (const it of this.items.values()) it.refl?.getRenderTarget().setSize(this.size.x, this.size.y)
  }

  dispose() {
    for (const it of this.items.values()) this.drop(it)
    this.items.clear()
  }

  private build(it: Item) {
    const m = it.mesh
    const inv = it.frame!.clone().invert()
    const geo = new THREE.BufferGeometry()
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry
    geo.setAttribute('position', src.getAttribute('position').clone())
    if (src !== m.geometry) src.dispose()
    geo.applyMatrix4(inv)
    const water = it.kind === 'water'
    const refl = new Reflector(geo, { textureWidth: this.size.x, textureHeight: this.size.y, clipBias: 0.003, multisample: 0, shader: water ? WaterShader : MirrorShader })
    if (water) {
      // 水色取原来的材质色（浴缸浅蓝、鱼缸水面……），略压暗，倒影才显得出来
      const u = (refl.material as THREE.ShaderMaterial).uniforms
      u.uWater.value.copy(waterColor(it))
      Object.assign(u, waterUniforms)
    }
    refl.applyMatrix4(it.frame!)
    // 反射面离镜面只有 0.05cm：远处深度精度不够会和镜面互相抢（闪烁），用深度偏移让它总是压在上面
    const mat = refl.material as THREE.ShaderMaterial
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -2
    mat.polygonOffsetUnits = -4
    refl.castShadow = false
    refl.receiveShadow = false
    refl.raycast = () => {}
    guardReflector(refl)
    m.add(refl)
    it.refl = refl
  }

  private drop(it: Item) {
    if (it.refl) {
      it.refl.removeFromParent()
      it.refl.geometry.dispose()
      releaseReflector(it.refl)
      it.refl = null
    }
    for (const s of it.shine) s.visible = true
    if (it.orig) {
      it.mesh.material = it.orig
      it.fake!.dispose()
    }
    this.items.delete(it.mesh)
  }
}

/** 水色：原来的材质色（浴缸浅蓝、鱼缸水面……），略压暗，倒影才显得出来 */
function waterColor(it: Item) {
  const src = (it.orig ?? it.mesh.material) as THREE.MeshToonMaterial | THREE.MeshToonMaterial[]
  const c = (Array.isArray(src) ? src[0] : src).color
  return (c ? c.clone() : new THREE.Color('#9fdcf0')).multiplyScalar(0.8)
}

/** 水面换上会动的假水面（关掉反射时 drop 换回原材质） */
function fakeWater(it: Item) {
  it.orig = it.mesh.material
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(FakeWaterShader.uniforms),
    vertexShader: FakeWaterShader.vertexShader,
    fragmentShader: FakeWaterShader.fragmentShader,
  })
  mat.uniforms.uWater.value.copy(waterColor(it))
  Object.assign(mat.uniforms, waterUniforms)
  it.fake = mat
  it.mesh.material = mat
}

/** 网格和所有祖先都可见（楼层淡出、柜门子树藏起来时不反射） */
function visibleInScene(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

/** 同一个父节点下画出来的高光条 */
function shineOf(m: THREE.Mesh) {
  return (m.parent?.children ?? []).filter((c) => c.userData.mirrorShine)
}

/**
 * 镜面坐标系（镜子网格局部）：原点在镜面前 0.05cm 处，+z 是镜面法线。
 * 法线取几何体最薄的轴；镜子取朝素材正面（家具根节点的 +z）的那面，水面取朝上（家具根节点的 +y）的那面。
 */
function prepare(it: Item) {
  const m = it.mesh
  const g = m.geometry
  if (!g.boundingBox) g.computeBoundingBox()
  const box = g.boundingBox!
  const size = box.getSize(new THREE.Vector3())
  const axes = [size.x, size.y, size.z]
  const a = axes.indexOf(Math.min(...axes))
  const others = axes.filter((_, i) => i !== a)
  it.area = others[0] * others[1]
  const n = new THREE.Vector3().setComponent(a, 1)
  // 家具根节点（house.ts 给它记了 asset）里看，法线朝 +z 的一面是镜面
  let root: THREE.Object3D = m
  while (root.parent && !root.userData.asset) root = root.parent
  m.updateWorldMatrix(true, false)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(m.matrixWorld)
  const toward = n.clone().transformDirection(toRoot)
  if ((it.kind === 'water' ? toward.y : toward.z) < 0) n.negate()
  const c = box.getCenter(new THREE.Vector3())
  const half = size.getComponent(a) / 2
  c.addScaledVector(n, half + 0.05)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  it.frame = new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1))
}
