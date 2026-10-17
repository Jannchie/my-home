// 动态特效：蒸汽、烟、水雾、火苗、气泡。每个发射点一组 Points，粒子在 CPU 上更新，
// 发射点每帧跟着宿主物体走（家具被拖动、旋转时特效跟着动）。

import { useAnisotropy } from './toon'
import { syncMatrix } from './matrices'
import * as THREE from 'three'
import type { Fx } from './kit'

interface Spec {
  count: number
  life: [number, number]
  /** 上升速度 cm/s */
  rise: [number, number]
  /** 水平漂移 cm/s */
  drift: number
  /** 起始 / 结束大小（cm） */
  size: [number, number]
  alpha: number
  color: string
  additive?: boolean
  /** 出生时的水平散布半径 */
  spread: number
  /** 摆动幅度（cm） */
  wobble: number
}

const SPECS: Record<Fx['kind'], Spec> = {
  steam: { count: 16, life: [1.2, 2], rise: [9, 14], drift: 1.2, size: [2, 7], alpha: 0.55, color: '#ffffff', spread: 1.2, wobble: 1.2 },
  smoke: { count: 22, life: [2.5, 4], rise: [5, 7], drift: 0.6, size: [0.8, 4], alpha: 0.45, color: '#e9e6ef', spread: 0.2, wobble: 2.2 },
  mist: { count: 22, life: [2.2, 3.4], rise: [5, 8], drift: 1.8, size: [3, 11], alpha: 0.5, color: '#f4fbff', spread: 1.5, wobble: 1.5 },
  flame: { count: 10, life: [0.25, 0.45], rise: [6, 10], drift: 0.4, size: [2.2, 0.6], alpha: 0.9, color: '#ffb347', additive: true, spread: 0.3, wobble: 0.3 },
  bubbles: { count: 14, life: [1.6, 2.6], rise: [8, 13], drift: 0.5, size: [0.9, 1.3], alpha: 0.7, color: '#eaf8ff', spread: 6, wobble: 0.8 },
}

let softTex: THREE.Texture | null = null
function softTexture() {
  if (softTex) return softTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  softTex = new THREE.CanvasTexture(c)
  useAnisotropy(softTex)
  return softTex
}

/** 粒子大小按世界单位（cm）透视缩放 */
function makeMaterial(additive: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { uTex: { value: softTexture() }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      uniform float uScale;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        vAlpha = aAlpha;
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
}

interface Particle {
  age: number
  life: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  phase: number
}

class Emitter {
  points: THREE.Points
  parts: Particle[] = []
  spec: Spec
  pos: Float32Array
  size: Float32Array
  alpha: Float32Array
  color: THREE.Color
  origin = new THREE.Vector3()
  height: number
  scale: number

  constructor(
    public host: THREE.Object3D,
    public fx: Fx,
  ) {
    this.spec = SPECS[fx.kind]
    this.scale = fx.scale ?? 1
    this.height = fx.height ?? Infinity
    const n = this.spec.count
    this.pos = new Float32Array(n * 3)
    this.size = new Float32Array(n)
    this.alpha = new Float32Array(n)
    this.color = new THREE.Color(fx.color ?? this.spec.color)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) this.color.toArray(col, i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    this.points = new THREE.Points(geo, makeMaterial(!!this.spec.additive))
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    // 错开出生时间，一开始就是连续的一缕
    for (let i = 0; i < n; i++) this.parts.push(this.spawn(-Math.random() * this.spec.life[1]))
  }

  spawn(age = 0): Particle {
    const s = this.spec
    const k = this.scale
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * s.spread * k
    return {
      age,
      life: s.life[0] + Math.random() * (s.life[1] - s.life[0]),
      x: Math.cos(a) * r,
      y: 0,
      z: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 2 * s.drift * k,
      vy: (s.rise[0] + Math.random() * (s.rise[1] - s.rise[0])) * k,
      vz: (Math.random() - 0.5) * 2 * s.drift * k,
      phase: Math.random() * Math.PI * 2,
    }
  }

  update(dt: number, t: number) {
    const visible = isShown(this.host)
    this.points.visible = visible
    if (!visible) return
    this.host.updateWorldMatrix(true, false)
    this.origin.set(this.fx.x, this.fx.y, this.fx.z).applyMatrix4(this.host.matrixWorld)
    const s = this.spec
    const k = this.scale
    for (let i = 0; i < this.parts.length; i++) {
      let p = this.parts[i]
      p.age += dt
      if (p.age >= p.life || p.y > this.height) p = this.parts[i] = this.spawn()
      if (p.age < 0) {
        this.alpha[i] = 0
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const u = p.age / p.life
      const wob = Math.sin(t * 2.2 + p.phase + p.y * 0.25) * s.wobble * k * u
      this.pos[i * 3] = this.origin.x + p.x + wob
      this.pos[i * 3 + 1] = this.origin.y + p.y
      this.pos[i * 3 + 2] = this.origin.z + p.z + wob * 0.6
      this.size[i] = (s.size[0] + (s.size[1] - s.size[0]) * u) * k
      // 淡入淡出；火苗再加一点闪烁
      const fade = Math.min(1, u * 5) * (1 - u) ** 1.3
      this.alpha[i] = s.alpha * fade * (this.fx.kind === 'flame' ? 0.75 + 0.25 * Math.sin(t * 30 + p.phase) : 1)
    }
    const g = this.points.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.aSize.needsUpdate = true
    g.attributes.aAlpha.needsUpdate = true
  }

  dispose() {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}

/** 宿主自己和所有祖先都可见才显示（壁挂物随墙隐藏时特效也隐藏） */
function isShown(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}

/**
 * 游动的东西（鱼缸里的鱼）：build 里给某个子物体设 userData.swim，就会沿椭圆绕圈游，头朝前进方向。
 *   { rx, rz: 椭圆半径；cx, cz: 圆心（默认 0）；y: 高度；speed: 角速度 rad/s，负数反向；bob: 上下起伏幅度 }
 * 模型的头要朝 +x。
 */
export interface Swim {
  rx: number
  rz: number
  cx?: number
  cz?: number
  y: number
  speed: number
  bob?: number
}

/** 一个场景里的全部特效；按 key（家具 id）登记、注销 */
export class FxLayer {
  group = new THREE.Group()
  private emitters = new Map<string, Emitter[]>()
  private swimmers = new Map<string, { obj: THREE.Object3D; s: Swim; phase: number }[]>()
  private t = 0

  set(key: string, host: THREE.Object3D, fx: Fx[] | undefined) {
    this.remove(key)
    const fish: { obj: THREE.Object3D; s: Swim; phase: number }[] = []
    host.traverse((o) => {
      if (o.userData.swim) fish.push({ obj: o, s: o.userData.swim as Swim, phase: Math.random() * Math.PI * 2 })
    })
    // 游动的东西不投影：阴影贴图只在场景变化时才重画（见 Sandbox3D），每帧在动的鱼影会停在原地
    for (const f of fish) f.obj.traverse((o) => (o.castShadow = false))
    if (fish.length) this.swimmers.set(key, fish)
    if (!fx?.length) return
    const list = fx.map((f) => new Emitter(host, f))
    for (const e of list) this.group.add(e.points)
    this.emitters.set(key, list)
  }

  remove(key: string) {
    this.swimmers.delete(key)
    const list = this.emitters.get(key)
    if (!list) return
    for (const e of list) {
      this.group.remove(e.points)
      e.dispose()
    }
    this.emitters.delete(key)
  }

  keys() {
    return [...this.emitters.keys()]
  }

  get active() {
    return this.emitters.size > 0 || this.swimmers.size > 0
  }

  /** 每帧调用；返回是否有特效（有就需要持续重绘） */
  update(dt: number, viewportHeight: number) {
    this.t += dt
    for (const list of this.emitters.values())
      for (const e of list) {
        ;(e.points.material as THREE.ShaderMaterial).uniforms.uScale.value = viewportHeight * 1.2
        e.update(dt, this.t)
      }
    for (const list of this.swimmers.values())
      for (const { obj, s, phase } of list) {
        const a = this.t * s.speed + phase
        obj.position.set((s.cx ?? 0) + Math.cos(a) * s.rx, s.y + Math.sin(this.t * 1.7 + phase) * (s.bob ?? 0.6), (s.cz ?? 0) + Math.sin(a) * s.rz)
        // 切线方向：头（+x）朝前进方向
        const dx = -Math.sin(a) * s.rx * Math.sign(s.speed)
        const dz = Math.cos(a) * s.rz * Math.sign(s.speed)
        obj.rotation.set(0, Math.atan2(-dz, dx), Math.sin(this.t * 6 + phase) * 0.08)
        // 家具模型是静态矩阵（matrices.ts）
        if (!obj.matrixAutoUpdate) syncMatrix(obj)
      }
    return this.active
  }
}
