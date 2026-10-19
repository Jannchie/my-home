// 地面反射（画面增强开了反射时）：反光的房间各一块「反射膜」，贴在地面上方一点，按视角混合镜像画面。
//
// 做法是平面反射（three 的 Reflector）：沿地面把相机镜像过去，用斜裁剪面把地面以下的东西裁掉，再画一遍场景到低分辨率的目标里。
//   - 反射膜是半透明的，叠在原来的地板上：地板材质（木纹、瓷砖）不用改，地毯、家具贴地的部分按深度自然把它盖住；
//   - 菲涅尔：俯视时只有一点倒影，越贴着地面看越亮；
//   - 只有真正反光的地面才做：卫浴的釉面砖、玄关地砖、打过蜡的木地板（Room / Plan 的 flooring.wax）。哑光木地板、阳台、榻榻米不做
//     （倒影淡到看不出，却要多画一遍场景）；
//   - 开销按平面算：同一层、同一高度的反光房间合成一块，看得见就画，一层通常只多画一遍场景。
// 阴影贴图沿用主画面的；倒影里不画描边、粒子和小物件（refreshReflectionSkip）。画面增强开了反射、高画质时建（Sandbox3D 负责进出）。

import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { roomFlooring, type Plan, type RoomKind } from '../model'
import { floorOf, isMultiFloor, planFloors } from '../floors'
import { slabHoles } from '../stairs'
import { floorY } from './house'
import { ceilingGeometry } from './walk'
import { isReflector } from './toon'

/**
 * 反光的地面：反射强度（贴着地面看时的上限）、模糊半径（倒影纹理的像素）。
 * 釉面砖（卫浴）最亮，玄关地砖粗一些；木地板打了蜡（flooring.wax）才有，哑光的不做。
 */
const GLOSS: Partial<Record<RoomKind, { k: number; blur: number }>> = {
  bath: { k: 0.4, blur: 1.5 },
  wash: { k: 0.36, blur: 1.5 },
  toilet: { k: 0.36, blur: 1.5 },
  entrance: { k: 0.22, blur: 3 },
}
const WAXED = { k: 0.3, blur: 2 }
/** 反射膜离地面的高度（cm）：压过地板、又低于地毯 */
const LIFT = 0.2

const ReflectShader = {
  name: 'FloorReflect',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    attribute vec2 aGloss;
    varying vec4 vUv;
    varying vec3 vWorld;
    varying vec2 vGloss;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      vGloss = aGloss;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec4 vUv;
    varying vec3 vWorld;
    varying vec2 vGloss;
    void main() {
      vec2 st = vUv.xy / vUv.w;
      // 9 个采样的小模糊：粗糙的木地板倒影是糊的
      vec2 r = uTexel * vGloss.y;
      vec4 c = texture2D(tDiffuse, st) * 0.2;
      c += (texture2D(tDiffuse, st + vec2(r.x, 0.0)) + texture2D(tDiffuse, st - vec2(r.x, 0.0)) + texture2D(tDiffuse, st + vec2(0.0, r.y)) + texture2D(tDiffuse, st - vec2(0.0, r.y))) * 0.12;
      c += (texture2D(tDiffuse, st + r) + texture2D(tDiffuse, st - r) + texture2D(tDiffuse, st + vec2(r.x, -r.y)) + texture2D(tDiffuse, st + vec2(-r.x, r.y))) * 0.08;
      vec3 V = normalize(cameraPosition - vWorld);
      // 风格化的菲涅尔：真实的 Schlick（F0≈0.04）在平常俯视地面的角度只有百分之几，看不出是亮面；
      // 这里俯视也留五分之一，越贴着地面看越接近上限
      float f = mix(0.2, 1.0, pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0));
      // 倒影里没画到东西的地方（窗外的透明背景）不盖
      float a = vGloss.x * f * c.a;
      gl_FragColor = vec4(c.rgb / max(c.a, 1e-3), a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}

/** 所有反射面（地面反射膜、镜子、水面）：画其中一个的倒影时，别的都先藏起来——不递归，也不会把别处的旧倒影贴进来 */
const reflectors = new Set<Reflector>()

/**
 * 倒影里不画的东西：描边外壳、粒子、半径 6cm 以下的小物件（杯子、笔、小摆件）。
 * 倒影本来就小、糊，这些看不出来，却占了大半 draw call——每多画一遍倒影都省下这些。
 * 场景（家具、开合、楼层显示）变了要重新收集：沙盘隔一会儿调一次 refreshReflectionSkip
 */
let skipped: THREE.Object3D[] = []
const ball = new THREE.Sphere()
export function refreshReflectionSkip(scene: THREE.Object3D) {
  skipped = []
  scene.traverse((o) => {
    if (o.userData.isOutline || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) return void skipped.push(o)
    const m = o as THREE.Mesh
    if (!m.isMesh || isReflector(m) || m.userData.mirror || m.userData.water) return
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
    if (ball.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld).radius < 6) skipped.push(m)
  })
}
export function clearReflectionSkip() {
  skipped = []
}

/** 登记一个 Reflector：包一层它的 onBeforeRender，画倒影期间把其它反射面和 skipped 藏起来 */
export function guardReflector(mesh: Reflector) {
  reflectors.add(mesh)
  const draw = mesh.onBeforeRender
  mesh.onBeforeRender = function (this: Reflector, ...args: Parameters<typeof draw>) {
    const hidden: THREE.Object3D[] = []
    for (const r of reflectors) {
      if (r === mesh || !r.visible) continue
      r.visible = false
      hidden.push(r)
    }
    for (const o of skipped) {
      if (!o.visible) continue
      o.visible = false
      hidden.push(o)
    }
    try {
      draw.apply(this, args)
    } finally {
      for (const r of hidden) r.visible = true
    }
  }
}

export function releaseReflector(mesh: Reflector) {
  reflectors.delete(mesh)
  mesh.dispose()
}

const frustum = new THREE.Frustum()
const projView = new THREE.Matrix4()
const sphere = new THREE.Sphere()

/** 一个反射平面：同一层、同一地面高度的反光房间合在一起，只画一遍倒影 */
interface FloorPlane {
  floor: string
  mesh: Reflector
}

export class FloorReflections {
  readonly root = new THREE.Group()
  private items: FloorPlane[] = []
  private size = new THREE.Vector2(512, 512)

  constructor(plan: Plan, lift: (floor: string) => number) {
    this.root.name = 'floor-reflections'
    const multi = isMultiFloor(plan)
    const floors = planFloors(plan)
    // 倒影的开销按「平面」算：同一层、同一高度的反光房间（卫浴、打蜡的客厅……）在同一个平面上，镜像相机是同一个，
    // 合成一块只画一遍；玄关土间低一截，单独一块
    const groups = new Map<string, { floor: string; y: number; pos: number[]; gloss: number[] }>()
    for (const r of plan.rooms) {
      if (r.points.length < 3) continue
      const gl = GLOSS[r.kind] ?? (roomFlooring(plan, r)?.wax ? WAXED : null)
      if (!gl) continue
      const floor = multi ? floorOf(plan, r) : floors[0].id
      const src = ceilingGeometry(r.points, slabHoles(plan, floor))
      if (!src) continue
      // ceilingGeometry 给的是世界 (x, 0, y)；Reflector 的法线是局部 +z：转回平面 (x, -y, 0)，网格再绕 x 转 -90°
      src.rotateX(-Math.PI / 2)
      src.scale(1, -1, 1)
      const flat = src.index ? src.toNonIndexed() : src
      const pos = flat.getAttribute('position').array as Float32Array
      const y = floorY(r)
      const key = `${floor}|${y}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { floor, y, pos: [], gloss: [] }))
      for (let k = 0; k < pos.length; k += 3) {
        g.pos.push(pos[k], pos[k + 1], pos[k + 2])
        g.gloss.push(gl.k, gl.blur)
      }
      if (flat !== src) flat.dispose()
      src.dispose()
    }
    for (const g of groups.values()) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
      geo.setAttribute('aGloss', new THREE.Float32BufferAttribute(g.gloss, 2))
      geo.computeBoundingSphere()
      const mesh = new Reflector(geo, { textureWidth: 512, textureHeight: 512, clipBias: 0.002, multisample: 0, shader: ReflectShader })
      const mat = mesh.material as THREE.ShaderMaterial
      mat.transparent = true
      mat.depthWrite = false
      mat.side = THREE.DoubleSide
      mesh.rotation.x = -Math.PI / 2
      mesh.userData.reflectY = g.y
      mesh.position.y = lift(g.floor) + g.y + LIFT
      mesh.renderOrder = 1
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = () => {}
      guardReflector(mesh)
      this.items.push({ floor: g.floor, mesh })
      this.root.add(mesh)
    }
    this.setSize(this.size.x, this.size.y)
  }

  /** 每帧画之前：人所在那层、在画面里的反射平面都开（Reflector 自己只在真的画到时才重画倒影） */
  update(camera: THREE.PerspectiveCamera, floor: string) {
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projView)
    for (const it of this.items) {
      it.mesh.visible = false
      if (it.floor !== floor) continue
      it.mesh.updateMatrixWorld()
      sphere.copy(it.mesh.geometry.boundingSphere!).applyMatrix4(it.mesh.matrixWorld)
      it.mesh.visible = frustum.intersectsSphere(sphere)
    }
  }

  /** 楼层抬升变了（楼层动画）时跟上 */
  setLift(lift: (floor: string) => number) {
    for (const it of this.items) it.mesh.position.y = lift(it.floor) + (it.mesh.userData.reflectY as number) + LIFT
  }

  /** 倒影按画面的三分之一分辨率画（drawing buffer 像素）：地面倒影本来就模糊 */
  setSize(w: number, h: number) {
    this.size.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)))
    for (const it of this.items) {
      it.mesh.getRenderTarget().setSize(this.size.x, this.size.y)
      ;(it.mesh.material as THREE.ShaderMaterial).uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y)
    }
  }

  dispose() {
    for (const it of this.items) {
      it.mesh.geometry.dispose()
      releaseReflector(it.mesh)
    }
    this.items = []
    this.root.removeFromParent()
  }
}
