// 宣传片的 3D 舞台：复用应用的渲染器、灯光、户型建模、后处理。
// 和 Sandbox3D 不同：没有交互、没有 requestAnimationFrame——每一帧由时间线显式设置状态再渲染一次，结果完全确定。

import * as THREE from 'three'
import { createStage, fitSun, type Stage } from '../three/stage'
import { attachPost, type Post } from '../three/post'
import { applyCutaway, buildHouse, furnitureModel, placeFurniture, roomAt, stepCutaway, isPlant, bendToWalls, floorY } from '../three/house'
import { IndoorLights, POOL_HIGH, autoLevel, lightColor, DEFAULT_KELVIN } from '../three/lights'
import { skyState, type Geo } from '../three/sky'
import { disposeUnshared } from '../three/toon'
import { ASSET_MAP } from '../three/assets'
import { bbox, type Furniture, type Plan } from '../model'
import { floorHeight } from '../floors'

export const CUT_H = 60

export interface FurnObj {
  f: Furniture
  obj: THREE.Group
  /** 摆放后的基准位置（落下动画以它为终点） */
  base: THREE.Vector3
}

/** 一套「户型 + 布置」建好的三维物体，可以在场景里整体换上 / 换下 */
export class HouseSet {
  root = new THREE.Group()
  house: THREE.Group
  furnRoot = new THREE.Group()
  furn: FurnObj[] = []
  glass: THREE.Mesh[] = []
  /** 室内灯光（房间主灯 + 灯具家具），黄昏后自动亮起 */
  lights = new IndoorLights(POOL_HIGH)
  center: { x: number; y: number }
  box: THREE.Box3
  /** 包围球半径（取景用，只算房子） */
  radius: number

  constructor(public plan: Plan) {
    this.house = buildHouse(plan, floorHeight(plan))
    const b = bbox(plan.rooms.flatMap((r) => r.points))
    this.center = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    for (const f of plan.furniture) {
      const obj = furnitureModel(f)
      placeFurniture(obj, plan, f)
      if (isPlant(f.asset)) bendToWalls(obj, plan, f)
      this.furnRoot.add(obj)
      this.furn.push({ f, obj, base: obj.position.clone() })
    }
    this.root.add(this.house, this.furnRoot)
    this.house.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      if (mats.some((x) => x.transparent && (x as THREE.MeshStandardMaterial).color?.getHexString() === 'bfe6ff')) this.glass.push(m)
    })
    this.box = new THREE.Box3().setFromObject(this.house)
    this.root.add(this.lights.group, this.lights.fixtures)
    this.lights.syncRooms(plan, ASSET_MAP, floorY)
    this.lights.syncLamps(plan, new Map(this.furn.map((o) => [o.f.id, { obj: o.obj }])), ASSET_MAP, (f) => roomAt(plan, f), floorY)
    this.radius = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2
  }

  /**
   * 墙体显示：half = 内墙压成矮墙、外墙按镜头方向压低（沙盘的「半墙」）；down = 全部压到 cut 高。
   * snap 时直接到位（跳转 / 形变动画由调用方逐帧给 cut）。
   */
  walls(cam: THREE.Vector3, mode: 'half' | 'down', cut: number, dt: number, snap = false) {
    const v = { x: cam.x - this.center.x, y: cam.z - this.center.y }
    const l = Math.hypot(v.x, v.y)
    const dir = l > 1 ? { x: v.x / l, y: v.y / l } : null
    applyCutaway(this.house, this.center, dir, null, mode === 'down', true)
    stepCutaway(this.house, snap ? 10 : dt, { style: 'cut', opacity: 0, cut }, true)
    // 窗玻璃不挡阳光：傍晚的光能从窗洞斜照进来（stepCutaway 每次都会重设投影开关，所以每帧关一次）
    for (const m of this.glass) m.castShadow = false
    this.lights.applyCutaway(this.center, dir, null, true)
    stepCutaway(this.lights.fixtures, snap ? 10 : dt, { style: 'fade', opacity: 0, cut }, true)
    this.lights.step(snap ? 10 : dt)
    this.mounted(dir, mode)
  }

  /** 壁挂物跟着墙：半墙模式下挂在内墙上的、外墙压低一侧的藏起来（同 Sandbox3D.updateMounted，直接显隐） */
  private mounted(dir: { x: number; y: number } | null, mode: 'half' | 'down') {
    const p = this.plan
    for (const o of this.furn) {
      const def = ASSET_MAP.get(o.f.asset)
      if (!def?.mount) continue
      const platform = !!def.surface || !!def.surfaces?.length
      if (platform) continue
      const a = (o.f.rot * Math.PI) / 180
      const back = { x: Math.sin(a), y: -Math.cos(a) }
      let hide = mode === 'down'
      if (!hide) {
        const k = def.d / 2 + p.wall + 5
        const r = roomAt(p, { x: o.f.x + back.x * k, y: o.f.y + back.y * k })
        hide = !!r && r.kind !== 'balcony'
      }
      if (!hide && dir) {
        const s = (o.f.x - this.center.x) * dir.x + (o.f.y - this.center.y) * dir.y
        hide = back.x * dir.x + back.y * dir.y > 0.3 && s > 25
      }
      o.obj.userData.mountHidden = hide
    }
  }

  dispose() {
    disposeUnshared(this.root)
  }
}

/** 视角：围绕 target 的球坐标（az 从 +z 轴起逆时针看俯视；polar 0 = 正俯视） */
export interface View {
  target: THREE.Vector3
  az: number
  polar: number
  dist: number
  fov: number
  /** 画面里目标点的偏移（屏幕比例，正值向上） */
  roll?: number
}

export class PromoScene {
  stage: Stage
  post: Post
  current: HouseSet | null = null
  extra = new THREE.Group()
  bg = '#f4f1ea'
  night = 0

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage(canvas, { preserve: true, shadowSize: 4096 })
    this.stage.renderer.setPixelRatio(1)
    this.post = attachPost(this.stage, { low: false })
    this.stage.scene.add(this.extra)
  }

  resize(w: number, h: number) {
    this.stage.resize(w, h)
  }

  show(set: HouseSet | null) {
    if (this.current === set) return
    if (this.current) this.stage.scene.remove(this.current.root)
    this.current = set
    if (set) this.stage.scene.add(set.root)
  }

  setView(v: View) {
    const cam = this.stage.camera
    const s = Math.sin(v.polar)
    cam.fov = v.fov
    cam.position.set(v.target.x + v.dist * s * Math.sin(v.az), v.target.y + v.dist * Math.cos(v.polar), v.target.z + v.dist * s * Math.cos(v.az))
    // 正俯视时 up 取 -z（平面图的上方），避免万向锁
    if (v.polar < 0.02) cam.up.set(-Math.sin(v.az), 0, -Math.cos(v.az))
    else cam.up.set(0, 1, 0)
    cam.lookAt(v.target)
    cam.near = Math.min(120, Math.max(3, v.dist * 0.05))
    cam.far = v.dist * 6 + 4000
    cam.updateProjectionMatrix()
  }

  /** 时刻光照：太阳方向 / 颜色、天光；背景压成纯色（平面风格，不用渐变） */
  sky(time: number, month: number, day: number, geo: Geo, north: number) {
    const s = skyState(((time % 24) + 24) % 24, month, day, geo, north)
    const st = this.stage
    st.sun.color.copy(s.lightColor)
    st.sun.intensity = s.lightIntensity
    st.hemi.color.copy(s.hemiSky)
    st.hemi.groundColor.copy(s.hemiGround)
    st.hemi.intensity = s.hemiIntensity
    const box = this.current?.box
    if (box) fitSun(st.sun, box, s.lightDir)
    // 室内灯：自动模式，按太阳高度亮灯（同 Sandbox3D.applyLights）
    const lt = this.current?.lights
    if (lt) {
      lt.setState({ global: 'auto', kelvin: DEFAULT_KELVIN, auto: autoLevel(s.altitude), night: s.night, power: 1 })
      const kel = lightColor(DEFAULT_KELVIN)
      const avg = lt.averageLevel
      this.post.setIndoor(kel, avg)
      const fill = avg * s.night
      st.hemi.intensity = s.hemiIntensity + 0.25 * fill
      st.hemi.groundColor.copy(s.hemiGround).lerp(kel, Math.min(1, 0.6 * fill))
    }
    // 背景：白天用米白；入夜按天色的中段过渡
    const day0 = new THREE.Color(this.bgDay)
    const c = day0.lerp(new THREE.Color(s.bg[0]).lerp(new THREE.Color(s.bg[1]), 0.35), Math.min(1, s.night * 1.15 + (1 - smooth01(s.altitude, -4, 14)) * 0.35))
    this.bg = '#' + c.getHexString()
    this.night = s.night
    // post.ts 的 Base 着色器对背景色又做了一次 sRGB→线性（uniform 本身已是线性），背景会偏暗；这里预先补偿，让画布底色和页面底色一致
    const cs = new THREE.Color(this.bg).convertLinearToSRGB()
    const fix = '#' + new THREE.Color().setRGB(cs.r, cs.g, cs.b).getHexString()
    this.post.setSky([fix, fix, fix], s.night)
    return s
  }
  bgDay = '#f4f1ea'

  render() {
    // 壁挂物的显隐（mounted）
    const set = this.current
    if (set) for (const o of set.furn) o.obj.visible = !o.obj.userData.mountHidden && o.obj.userData.dropVisible !== false
    this.stage.renderer.shadowMap.needsUpdate = true
    this.stage.render()
  }
}

function smooth01(x: number, a: number, b: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
