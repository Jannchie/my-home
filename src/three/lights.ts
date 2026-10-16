// 室内灯光：每个房间一盏主灯（吸顶灯 / 吊灯 / 厨房手元灯 / 阳台壁灯）+ 落地灯、台灯等灯具家具，
// 入夜按太阳高度自动渐亮（也可以全局 / 按房间 / 按单个灯具强制开关），色温可调。
//
// 设计要点：
//   - 真实点光源用固定大小的池（高画质 16、省电 6）：灯的数量不变，three 的着色器就不会重编译；
//     开关、渐变只改 intensity。超出池子的灯只靠发光材质 + 地面光斑（decal），不打光。
//   - 点光源 decay = 0 + distance 截断：中心亮、往墙角平滑变暗，toon 色阶下像动画里的一池暖光。
//     不投射阴影（性能）。光源放在灯罩 / 灯体内部：灯罩外表面背对光源，不会被自己的灯照到过曝。
//   - 地面光斑按房间多边形裁剪（不会漏到隔壁房间），UV 以灯为中心做径向渐变，叠加混合。
//   - 发光部件（灯罩、和纸、灯泡）亮度有上限（约原色 1.0–1.3 倍）：保留颜色、分格和造型，不会一片白。
//   - 天花板高度的灯具在墙体压低 / 半墙时淡出（光照保留），走 house.ts 的 stepCutaway。
// 单位：厘米。平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { area, labelPointAvoiding, pointInPolygon, edgesOf, fixtureBox, fixtureDepth, type Furniture, type Plan, type Room, type RoomKind, type Vec } from '../model'
import type { AssetDef } from './kit'
import { addOutlines, ball, cyl, rbox, toon } from './toon'

// ---------- 设置 ----------

export type LightMode = 'auto' | 'on' | 'off'
export const LIGHT_MODES: LightMode[] = ['auto', 'on', 'off']
export const KELVIN_MIN = 2700
export const KELVIN_MAX = 6500
export const DEFAULT_KELVIN = 3000
/** 真实点光源数量池（固定，避免重编译） */
export const POOL_HIGH = 16
export const POOL_LOW = 6
/** 天花板高度（灯具按真实层高 240 放，和沙盘「墙高」滑杆无关） */
export const CEILING = 240

export const isLightMode = (v: unknown): v is LightMode => v === 'auto' || v === 'on' || v === 'off'
export const clampKelvin = (k: number) => Math.round(Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, k)) / 100) * 100

/**
 * 色温 → 颜色（Tanner Helland 的近似公式，1000K–40000K 内误差很小），返回线性空间的 THREE.Color。
 */
export function kelvinColor(k: number, out = new THREE.Color()) {
  const t = Math.min(40000, Math.max(1000, k)) / 100
  let r: number
  let g: number
  let b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255
  return out.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace)
}

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
/** 灯光颜色：色温的色相，亮度（相对亮度）固定——换色温只换冷暖，不会冷了就更亮 */
export function lightColor(k: number, out = new THREE.Color()) {
  kelvinColor(k, out)
  return out.multiplyScalar(LIGHT_LUMA / Math.max(1e-3, lum(out)))
}
const LIGHT_LUMA = 0.8
/** 全局亮度（%）的范围 */
export const POWER_MIN = 30
export const POWER_MAX = 160
export const DEFAULT_POWER = 100

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 自动模式的亮灯程度：太阳高度（度）6° 开始渐亮，-4° 全亮；清晨反过来渐灭 */
export const autoLevel = (altitude: number) => 1 - smooth(-4, 6, altitude)

/** 房间灯的目标亮度：房间自己的设置优先（开 / 关），自动时跟全局；全局自动时按太阳高度 */
export function roomTarget(global: LightMode, room: LightMode | undefined, auto: number) {
  const m = room && room !== 'auto' ? room : global
  return m === 'on' ? 1 : m === 'off' ? 0 : auto
}

/** 灯具家具的目标亮度：自己设了开 / 关就按自己的，否则跟所在房间 */
export function lampTarget(own: Furniture['light'], roomLevel: number) {
  return own === 'on' ? 1 : own === 'off' ? 0 : roomLevel
}

// ---------- 房间主灯的位置与类型 ----------

export type RoomLightKind = 'ceiling' | 'small' | 'pendant' | 'counter' | 'wall'

export interface RoomLightSpec {
  roomId: string
  kind: RoomLightKind
  /** 平面坐标 */
  x: number
  y: number
  /** 光源离地高度（绝对 y） */
  h: number
  /** 灯具本体的底面高度（吊灯的灯罩下沿 / 吸顶灯底面） */
  fy: number
  intensity: number
  distance: number
  /** 主灯（每个房间一盏）；厨房台面灯等是副灯，池子不够时先让出 */
  primary: boolean
  /** 灯具朝向（rad，绕 y）：手元灯沿台面、壁灯背贴墙 */
  ry: number
  /** 手元灯灯条长度 */
  len?: number
}

const SMALL_ROOMS: RoomKind[] = ['entrance', 'hall', 'storage', 'toilet', 'wash']
const DINING_RE = /^tbl-dining|^tbl-bar-table|baxian|fh-table/

/** 房间里的餐桌（吊灯挂在它上方） */
function diningTable(plan: Plan, room: Room, defs: Map<string, AssetDef>) {
  let best: Furniture | null = null
  let bestA = 0
  for (const f of plan.furniture) {
    if (f.z || !DINING_RE.test(f.asset) || !pointInPolygon(f, room.points)) continue
    const d = defs.get(f.asset)
    const a = d ? d.w * d.d : 1
    if (a > bestA) {
      best = f
      bestA = a
    }
  }
  return best ? { f: best, def: defs.get(best.asset) } : null
}

/**
 * 每个房间的灯：居室 / 客餐厅中央吸顶灯（餐厅有餐桌时换成餐桌上方的吊灯），厨房台面上方手元灯，
 * 浴室、洗面所、卫生间、玄关、走廊、收纳是小吸顶灯，阳台在靠室内那面墙上装壁灯。LDK 里有厨房时再加一盏台面灯（副灯）。
 */
export function roomLightSpecs(plan: Plan, defs: Map<string, AssetDef> = new Map()): RoomLightSpec[] {
  const out: RoomLightSpec[] = []
  for (const room of plan.rooms) {
    if (room.points.length < 3) continue
    const A = area(room.points)
    const r = Math.sqrt(A / Math.PI)
    const kitchens = plan.fixtures.filter((f) => f.kind === 'kitchen' && pointInPolygon(f, room.points))
    const boxes = plan.fixtures.filter((f) => pointInPolygon(f, room.points)).map(fixtureBox)
    const c = labelPointAvoiding(room.points, boxes)
    const dist = Math.min(800, Math.max(300, r * 2.0))
    // 面积大的房间灯更亮一点（光池更大，中心不变）
    const inten = 0.95 + Math.min(0.2, A / 1000000)
    const base = { roomId: room.id, primary: true, ry: 0 }
    if (room.kind === 'balcony') {
      // 靠室内的那面墙：边外侧一点落在别的（非阳台）房间里
      let wall: { p: Vec; n: Vec; len: number } | null = null
      for (const e of edgesOf(room.points)) {
        const m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
        const q = { x: m.x + e.out.x * 30, y: m.y + e.out.y * 30 }
        if (plan.rooms.some((o) => o !== room && o.kind !== 'balcony' && pointInPolygon(q, o.points)) && (!wall || e.length > wall.len)) wall = { p: m, n: e.out, len: e.length }
      }
      const t = plan.wallOuter / 2 + 4
      const p = wall ? { x: wall.p.x - wall.n.x * t, y: wall.p.y - wall.n.y * t } : c
      // 壁灯背面朝墙（-z 朝外法线方向）
      const ry = wall ? Math.atan2(-wall.n.x, -wall.n.y) : 0
      out.push({ ...base, kind: 'wall', x: p.x, y: p.y, h: 200, fy: 190, intensity: 0.7, distance: Math.min(420, Math.max(220, r * 2)), ry })
      continue
    }
    const kitchen = kitchens[0]
    let counter: RoomLightSpec | null = null
    if (kitchen) {
      // 壁付け：台面前沿上方；対面：通道正上方（离墙中点）
      const a = (kitchen.rot * Math.PI) / 180
      const fx = -Math.sin(a)
      const fy = Math.cos(a)
      const d = fixtureDepth(kitchen)
      const k = kitchen.variant === 'facing' ? 0 : d / 2 - 12
      counter = {
        ...base,
        kind: 'counter',
        x: kitchen.x + fx * k,
        y: kitchen.y + fy * k,
        h: CEILING - 10,
        fy: CEILING - 5,
        intensity: 0.8,
        distance: Math.max(240, Math.min(420, kitchen.w * 1.2)),
        ry: -a,
        len: Math.min(150, kitchen.w * 0.55),
      }
    }
    if (room.kind === 'kitchen' && counter) {
      out.push(counter)
      continue
    }
    if (room.kind === 'dining' || room.kind === 'ldk') {
      const t = diningTable(plan, room, defs)
      if (t && room.kind === 'dining') {
        const top = (t.def?.surface ?? 72) + 78
        out.push({ ...base, kind: 'pendant', x: t.f.x, y: t.f.y, h: top + 6, fy: top, intensity: inten, distance: dist })
        continue
      }
    }
    if (SMALL_ROOMS.includes(room.kind) || room.kind === 'bath') {
      out.push({ ...base, kind: 'small', x: c.x, y: c.y, h: CEILING - 5, fy: CEILING - 6, intensity: room.kind === 'bath' ? 1.0 : 0.85, distance: Math.min(420, Math.max(220, r * 2.4)) })
      continue
    }
    out.push({ ...base, kind: 'ceiling', x: c.x, y: c.y, h: CEILING - 5, fy: CEILING - 8, intensity: inten, distance: dist })
    if (counter) out.push({ ...counter, primary: false, intensity: 0.55 })
    if (room.kind === 'ldk') {
      const t = diningTable(plan, room, defs)
      if (t) {
        const top = (t.def?.surface ?? 72) + 78
        out.push({ ...base, primary: false, kind: 'pendant', x: t.f.x, y: t.f.y, h: top + 6, fy: top, intensity: 0.5, distance: 260 })
      }
    }
  }
  return out
}

// ---------- 灯具家具 ----------

/** 名字像灯、但不是照明的东西（头灯、应援棒、灯带卷、遥控器） */
const NOT_LAMP = new Set(['gr-headlamp', 'int-penlights', 'mk-led-strip', 'sf-remote-light'])
const LAMP_RE = /灯|燭|烛|蜡烛|行灯|lamp|lantern|candle/i

/** 灯具家具：素材分类是「灯具」，或名字是灯 / 蜡烛（化妆台的灯泡、植物补光灯、南瓜灯…） */
export function isLampAsset(def: Pick<AssetDef, 'id' | 'name' | 'category' | 'fixture'>) {
  if (def.fixture || NOT_LAMP.has(def.id)) return false
  return def.category === 'lighting' || LAMP_RE.test(def.name) || LAMP_RE.test(def.id)
}

/** 发光部件的标记：post.ts 的夜间加亮跳过它们，由这里按开关 / 色温控制 */
export const LAMP_GLOW = 'lampGlow'

interface GlowMat {
  mat: THREE.MeshToonMaterial
  /** 原本的 emissive 强度与颜色 */
  base: number
  color: THREE.Color
}

interface Lamp {
  id: string
  obj: THREE.Object3D
  /** 光源在模型局部坐标里的位置（发光部件的中心，在灯罩内部） */
  local: THREE.Vector3
  glows: GlowMat[]
  intensity: number
  distance: number
  /** 落地的灯：地上加一圈光斑 */
  floor: boolean
  level: number
  target: number
  roomId: string | null
  decal: THREE.Mesh | null
}

/**
 * 夜里发光部件的 emissiveIntensity：0.55–0.75，加上受到的灯光，总亮度约为原色的 1.2–1.5 倍
 * （再亮就成一片白、看不出和纸的分格和灯具造型）
 */
export function glowIntensity(base: number, night: number, level: number, luma = 0.5) {
  const off = base * (1 - 0.9 * night)
  // 越接近白色的灯罩（和纸、乳白玻璃）上限越低：白色再加亮就看不出和底色的差别了
  const cap = Math.min(0.65, Math.max(0.45, base * 1.2)) * (1 - 0.6 * luma)
  const on = base + (Math.max(base, cap) - base) * night
  return off + (on - off) * level
}

/** 发光部件的颜色：原色往色温方向偏一点，亮度不超过原色 */
function tintGlow(out: THREE.Color, orig: THREE.Color, kelvin: THREE.Color, level: number) {
  // 按亮度归一：只偏色相，不改变发光部件的亮度
  const m = lum(kelvin) || 1
  // 越接近白色（和纸、乳白灯罩）越偏向灯光颜色：白纸从里面透光看起来是暖的奶油色，不是更白
  const k = (0.35 + 0.4 * lum(orig)) * level
  out.setRGB(orig.r * (1 - k + (k * kelvin.r) / m), orig.g * (1 - k + (k * kelvin.g) / m), orig.b * (1 - k + (k * kelvin.b) / m))
  return out
}

// ---------- 地面光斑 ----------

let poolTex: THREE.Texture | null = null
/** 径向渐变：中心亮、边缘透明 */
function poolTexture() {
  if (poolTex) return poolTex
  const s = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  // 平顶：中间一大片差不多亮，靠边才淡下去（光池更均匀，不是一个亮点）
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  grd.addColorStop(0.75, 'rgba(255,255,255,0.4)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, s, s)
  poolTex = new THREE.CanvasTexture(cv)
  poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping
  return poolTex
}

/** 按房间多边形裁剪的光斑：UV 以 (cx, cy) 为中心、半径 R */
function poolDecal(pts: Vec[], cx: number, cy: number, R: number, y: number) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)))
  const geo = new THREE.ShapeGeometry(shape)
  // ShapeGeometry 在 xy 平面：转到地面（平面 y → 3D z）
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getY(i)
    pos.setXYZ(i, x, y, z)
    uv.setXY(i, (x - cx) / (2 * R) + 0.5, (z - cy) / (2 * R) + 0.5)
  }
  // 绕向翻转后法线朝上（只是加色贴片，双面画也行）
  geo.computeVertexNormals()
  const mat = new THREE.MeshBasicMaterial({
    map: poolTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const m = new THREE.Mesh(geo, mat)
  m.renderOrder = 1
  m.visible = false
  m.raycast = () => {}
  return m
}

// ---------- 吸顶灯 / 吊灯模型 ----------

function glowMaterial(color: string) {
  const m = (toon(color) as THREE.MeshToonMaterial).clone()
  m.emissive = new THREE.Color(color)
  m.emissiveIntensity = 0.15
  m.userData[LAMP_GLOW] = true
  return m
}

/** 灯具模型：局部原点在灯具底面中心（吊灯在灯罩下沿）；glow 是要随开关变亮的材质 */
function fixtureModel(s: RoomLightSpec): { obj: THREE.Group; glow: THREE.MeshToonMaterial } {
  const g = new THREE.Group()
  const glow = glowMaterial('#fff6e6')
  const rim = '#e9e4da'
  if (s.kind === 'ceiling' || s.kind === 'small') {
    const r = s.kind === 'ceiling' ? 24 : 13
    const dome = cyl(r * 0.92, r, r * 0.26, '#fff6e6')
    dome.material = glow
    g.add(dome)
    g.add(cyl(r * 0.55, r * 0.55, 2, rim, { y: r * 0.26 }))
  } else if (s.kind === 'pendant') {
    const cordTop = CEILING - s.fy
    g.add(cyl(0.5, 0.5, cordTop - 16, '#3d3f44', { y: 16 }))
    g.add(cyl(5, 5, 1.6, '#3d3f44', { y: cordTop - 1.6 }))
    // 灯罩：上小下大的圆台，开口朝下；灯泡露出一点
    // 布灯罩：夜里从里面透出光（和灯泡共用发光材质）
    const shade = cyl(5, 19, 16, '#f2e6cf', {}, 28)
    shade.material = glow
    g.add(shade)
    const bulb = ball(5.5, '#fff3dc', { y: 2 })
    bulb.material = glow
    g.add(bulb)
    // 灯罩内侧（下面看上去是亮的）
    const inner = cyl(4, 17.5, 0.6, '#fff3dc', { y: 0.2 }, 28)
    inner.material = glow
    inner.userData.noOutline = true
    g.add(inner)
  } else if (s.kind === 'counter') {
    const L = s.len ?? 90
    const bar = rbox(L, 3, 9, '#fff6e6', {}, 1.2)
    bar.material = glow
    g.add(bar)
    g.add(rbox(L + 2, 1.5, 11, rim, { y: 3 }, 0.6))
  } else {
    // 阳台壁灯：贴墙的底座 + 方形灯罩
    g.add(rbox(10, 16, 3, '#3d3f44', { z: -8 }, 1))
    const box = rbox(11, 13, 11, '#fff6e6', { y: 1.5, z: 0 }, 2)
    box.material = glow
    g.add(box)
    g.add(rbox(13, 2, 13, '#3d3f44', { y: 14.5, z: 0 }, 0.8))
  }
  addOutlines(g)
  g.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
  })
  return { obj: g, glow }
}

// ---------- 管理器 ----------

interface RoomRig {
  spec: RoomLightSpec
  key: string
  /** 天花板的灯具（墙压低时淡出）；阳台壁灯在墙上，跟着外墙走，不淡出 */
  fixture: THREE.Group | null
  glow: THREE.MeshToonMaterial | null
  decal: THREE.Mesh | null
  level: number
  target: number
  kelvin: THREE.Color
}

export interface LightState {
  global: LightMode
  kelvin: number
  /** 自动模式下的亮灯程度（autoLevel） */
  auto: number
  /** 入夜程度：发光部件夜里才加亮到上限 */
  night: number
  /** 亮度倍数（全局「亮度」滑杆，1 = 默认） */
  power: number
}

const FADE_SPEED = 2.2 // 每秒

export class IndoorLights {
  /** 点光源 + 地面光斑 */
  readonly group = new THREE.Group()
  /** 天花板灯具（墙体淡出逻辑以它为根） */
  readonly fixtures = new THREE.Group()
  private pool: THREE.PointLight[] = []
  private rooms = new Map<string, RoomRig>()
  private lamps = new Map<string, Lamp>()
  private state: LightState = { global: 'auto', kelvin: DEFAULT_KELVIN, auto: 0, night: 0, power: 1 }
  private plan: Plan | null = null
  private globalKelvin = lightColor(DEFAULT_KELVIN)
  /** 每个房间最多给几盏灯具家具真实光源 */
  private lampsPerRoom = 2
  private dirty = true
  private tmp = new THREE.Vector3()

  constructor(poolSize = POOL_HIGH) {
    this.group.name = 'indoor-lights'
    this.fixtures.name = 'light-fixtures'
    this.setPoolSize(poolSize)
  }

  /** 改池子大小（画质切换时）：灯数变了，下一帧会重编译一次着色器 */
  setPoolSize(n: number) {
    while (this.pool.length > n) this.group.remove(this.pool.pop()!)
    while (this.pool.length < n) {
      const l = new THREE.PointLight('#ffffff', 0, 300, 0)
      l.castShadow = false
      this.pool.push(l)
      this.group.add(l)
    }
    this.lampsPerRoom = n >= POOL_HIGH ? 2 : 0
    this.dirty = true
  }

  get poolSize() {
    return this.pool.length
  }

  /** 房间、设备、餐桌变了：按需重建房间灯（同一房间 key 没变就不动） */
  syncRooms(plan: Plan, defs: Map<string, AssetDef>, floorY: (r: Room | undefined) => number) {
    this.plan = plan
    const specs = roomLightSpecs(plan, defs)
    const alive = new Set<string>()
    const byRoom = new Map(plan.rooms.map((r) => [r.id, r]))
    specs.forEach((s, i) => {
      const room = byRoom.get(s.roomId)!
      const id = `${s.roomId}#${i}`
      alive.add(id)
      const key = JSON.stringify(s) + room.points.map((p) => `${p.x},${p.y}`).join(';')
      let rig = this.rooms.get(id)
      if (rig && rig.key === key) {
        rig.spec = s
        return
      }
      if (rig) this.dropRig(rig)
      const { obj, glow } = fixtureModel(s)
      obj.position.set(s.x, s.fy, s.y)
      obj.rotation.y = s.ry
      if (s.kind !== 'wall') {
        // 和墙一样的淡出标记（法线为 0：只在半墙 / 全部压低时、或在所指房间前面时淡出）
        obj.userData.fade = { x: s.x, y: s.y, nx: 0, ny: 0, outer: false }
        this.fixtures.add(obj)
      } else this.group.add(obj)
      obj.userData.lightRoomId = s.roomId
      let decal: THREE.Mesh | null = null
      if (s.primary) {
        const R = Math.max(120, Math.sqrt(area(room.points) / Math.PI) * 1.25)
        decal = poolDecal(room.points, s.x, s.y, R, floorY(room) + 0.4)
        this.group.add(decal)
      }
      rig = { spec: s, key, fixture: obj, glow, decal, level: 0, target: 0, kelvin: new THREE.Color() }
      this.rooms.set(id, rig)
    })
    for (const [id, rig] of this.rooms) {
      if (!alive.has(id)) {
        this.dropRig(rig)
        this.rooms.delete(id)
      }
    }
    // 淡出列表要重算
    delete this.fixtures.userData.fadeList
    delete this.fixtures.userData.wallTop
    this.refreshTargets()
  }

  private dropRig(rig: RoomRig) {
    for (const o of [rig.fixture, rig.decal]) {
      if (!o) continue
      o.removeFromParent()
      o.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose()
      })
    }
    rig.glow?.dispose()
    ;(rig.decal?.material as THREE.Material | undefined)?.dispose()
  }

  /**
   * 家具同步后调用：新出现的灯具家具找发光部件（换成独立材质），记下光源位置。
   * objs：家具 id → 模型；模型重建过（换配色）会重新处理。
   */
  syncLamps(plan: Plan, objs: Map<string, { obj: THREE.Object3D }>, defs: Map<string, AssetDef>, roomOf: (f: Furniture) => Room | undefined, floorY: (r: Room | undefined) => number) {
    this.plan = plan
    const alive = new Set<string>()
    for (const f of plan.furniture) {
      const def = defs.get(f.asset)
      const o = objs.get(f.id)
      if (!def || !o || !isLampAsset(def)) continue
      alive.add(f.id)
      let lamp = this.lamps.get(f.id)
      if (lamp && lamp.obj !== o.obj) {
        this.dropLamp(lamp)
        lamp = undefined
      }
      if (!lamp) {
        lamp = prepareLamp(f.id, o.obj, def)
        this.lamps.set(f.id, lamp)
      }
      const room = roomOf(f)
      lamp.roomId = room?.id ?? null
      // 落地的灯：地上一圈小光斑（位置变了就重建）
      const want = lamp.floor && !f.z && room
      const dkey = want ? `${f.x},${f.y},${room!.id}` : ''
      if ((lamp.decal?.userData.key ?? '') !== dkey) {
        if (lamp.decal) {
          lamp.decal.removeFromParent()
          lamp.decal.geometry.dispose()
          ;(lamp.decal.material as THREE.Material).dispose()
          lamp.decal = null
        }
        if (want) {
          lamp.decal = poolDecal(room!.points, f.x, f.y, 95, floorY(room!) + 0.5)
          lamp.decal.userData.key = dkey
          this.group.add(lamp.decal)
        }
      }
    }
    for (const [id, l] of this.lamps) {
      if (!alive.has(id)) {
        this.dropLamp(l)
        this.lamps.delete(id)
      }
    }
    this.refreshTargets()
  }

  private dropLamp(l: Lamp) {
    if (l.decal) {
      l.decal.removeFromParent()
      l.decal.geometry.dispose()
      ;(l.decal.material as THREE.Material).dispose()
    }
  }

  /** 全局开关、色温、太阳高度变了 */
  setState(s: LightState) {
    this.state = s
    lightColor(s.kelvin, this.globalKelvin)
    this.refreshTargets()
  }

  /** 户型数据里的开关、色温变了（房间 / 灯具的 light 字段） */
  refreshTargets() {
    const p = this.plan
    if (!p) return
    const rooms = new Map(p.rooms.map((r) => [r.id, r]))
    const roomLv = new Map<string, number>()
    for (const r of p.rooms) roomLv.set(r.id, roomTarget(this.state.global, r.light, this.state.auto))
    for (const rig of this.rooms.values()) {
      const r = rooms.get(rig.spec.roomId)
      rig.target = roomLv.get(rig.spec.roomId) ?? 0
      if (r?.lightK) lightColor(r.lightK, rig.kelvin)
      else rig.kelvin.copy(this.globalKelvin)
    }
    const fs = new Map(p.furniture.map((f) => [f.id, f]))
    for (const l of this.lamps.values()) {
      const f = fs.get(l.id)
      l.target = lampTarget(f?.light, l.roomId ? roomLv.get(l.roomId) ?? 0 : roomTarget(this.state.global, undefined, this.state.auto))
    }
    this.dirty = true
  }

  /** 某个房间 / 灯具当前的亮度（0–1，渐变中的值） */
  levelOf(id: string) {
    for (const rig of this.rooms.values()) if (rig.spec.roomId === id && rig.spec.primary) return rig.level
    return this.lamps.get(id)?.level ?? 0
  }

  /** 所有房间灯的平均目标亮度（窗户夜光用） */
  get averageLevel() {
    let s = 0
    let n = 0
    for (const rig of this.rooms.values()) {
      if (!rig.spec.primary) continue
      s += rig.target
      n++
    }
    return n ? s / n : 0
  }

  /**
   * 推进渐变并写入灯光；返回这一帧是否改了灯光（要重画）。
   * 池子分配：开着的主灯按面积排在前面，其次副灯，再其次每个房间离中心最近的几盏灯具家具。
   */
  step(dt: number) {
    let busy = false
    const k = dt * FADE_SPEED
    const approach = (o: { level: number; target: number }) => {
      if (o.level === o.target) return
      o.level = o.target > o.level ? Math.min(o.target, o.level + k) : Math.max(o.target, o.level - k)
      busy = true
    }
    for (const rig of this.rooms.values()) approach(rig)
    for (const l of this.lamps.values()) approach(l)
    if (!busy && !this.dirty) return false
    this.dirty = false
    this.apply()
    // 应用过一次（开关、色温、位置变了）也要重画
    return true
  }

  /** 拖动灯具时光源跟着走 */
  touch() {
    this.dirty = true
  }

  private apply() {
    const night = this.state.night
    const power = this.state.power
    // 候选：[优先级, 位置, 颜色, 强度, 距离]
    type Cand = { pri: number; x: number; y: number; z: number; color: THREE.Color; i: number; d: number }
    const cands: Cand[] = []
    for (const rig of this.rooms.values()) {
      const s = rig.spec
      const lv = rig.level
      const e = lv * lv * (3 - 2 * lv)
      if (rig.glow) {
        rig.glow.emissiveIntensity = 0.15 + 0.4 * e * Math.min(1.2, power)
        tintGlow(rig.glow.emissive, new THREE.Color('#fff6e6'), rig.kelvin, e)
      }
      if (rig.decal) {
        const m = rig.decal.material as THREE.MeshBasicMaterial
        m.color.copy(rig.kelvin)
        m.opacity = 0.06 * e * power
        rig.decal.visible = e > 0.01
      }
      if (rig.target > 0 || lv > 0) {
        const pri = (s.primary ? 2e6 : 1e6) + Math.min(9e5, s.distance * s.distance * 0.01)
        cands.push({ pri, x: s.x, y: s.h, z: s.y, color: rig.kelvin, i: s.intensity * e * power, d: s.distance })
      }
    }
    // 灯具家具：每个房间离房间中心近的前 N 盏打光，其余只发光
    const byRoom = new Map<string, { l: Lamp; d: number }[]>()
    for (const l of this.lamps.values()) {
      const e = l.level * l.level * (3 - 2 * l.level)
      const kel = this.kelvinOfRoom(l.roomId)
      for (const g of l.glows) {
        g.mat.emissiveIntensity = glowIntensity(g.base, night, e, g.color.r * 0.3 + g.color.g * 0.59 + g.color.b * 0.11)
        tintGlow(g.mat.emissive, g.color, kel, e)
      }
      if (l.decal) {
        const m = l.decal.material as THREE.MeshBasicMaterial
        m.color.copy(kel)
        m.opacity = 0.05 * e * power
        l.decal.visible = e > 0.01
      }
      if (!(l.target > 0 || l.level > 0) || !this.lampsPerRoom) continue
      l.obj.updateWorldMatrix(true, false)
      const w = l.obj.localToWorld(this.tmp.copy(l.local))
      const rc = this.roomCenter(l.roomId)
      const list = byRoom.get(l.roomId ?? '') ?? []
      list.push({ l, d: rc ? Math.hypot(w.x - rc.x, w.z - rc.y) : 0 })
      byRoom.set(l.roomId ?? '', list)
      ;(l as Lamp & { _w?: THREE.Vector3 })._w = w.clone()
    }
    for (const list of byRoom.values()) {
      list.sort((a, b) => a.d - b.d)
      for (const { l } of list.slice(0, this.lampsPerRoom)) {
        const e = l.level * l.level * (3 - 2 * l.level)
        const w = (l as Lamp & { _w?: THREE.Vector3 })._w!
        cands.push({ pri: 5e5 + l.intensity * 1000, x: w.x, y: w.y, z: w.z, color: this.kelvinOfRoom(l.roomId), i: l.intensity * e * power, d: l.distance })
      }
    }
    cands.sort((a, b) => b.pri - a.pri)
    this.pool.forEach((pl, i) => {
      const c = cands[i]
      if (!c || c.i <= 0.0005) {
        pl.intensity = 0
        return
      }
      pl.position.set(c.x, c.y, c.z)
      pl.color.copy(c.color)
      pl.intensity = c.i
      pl.distance = c.d
    })
  }

  private kelvinOfRoom(id: string | null) {
    if (id) for (const rig of this.rooms.values()) if (rig.spec.roomId === id && rig.spec.primary) return rig.kelvin
    return this.globalKelvin
  }

  private roomCenter(id: string | null) {
    if (!id) return null
    for (const rig of this.rooms.values()) if (rig.spec.roomId === id && rig.spec.primary) return { x: rig.spec.x, y: rig.spec.y }
    return null
  }

  /**
   * 天花板灯具的淡出目标：半墙 / 全部压低 / 墙很矮时全部淡出；前墙压低 / 透明且跟随鼠标时，所指房间之前的房间淡出。
   * 光照不受影响。
   */
  applyCutaway(center: Vec, dir: Vec | null, depth: number | null, hideAll: boolean) {
    for (const o of this.fixtures.children) {
      const f = o.userData.fade as { x: number; y: number }
      let hide = hideAll
      if (!hide && dir && depth !== null) hide = (f.x - center.x) * dir.x + (f.y - center.y) * dir.y > depth + 30
      o.userData.target = hide ? 1 : 0
    }
  }

  /** 3D 里点中的天花板灯具 → 房间 id */
  pickRoom(ray: THREE.Raycaster) {
    const hit = ray.intersectObject(this.fixtures, true).find((h) => h.object.visible && !h.object.userData.isOutline)
    let o: THREE.Object3D | null = hit?.object ?? null
    while (o && !o.userData.lightRoomId) o = o.parent
    return (o?.userData.lightRoomId as string) ?? null
  }

  dispose() {
    for (const rig of this.rooms.values()) this.dropRig(rig)
    for (const l of this.lamps.values()) this.dropLamp(l)
    this.rooms.clear()
    this.lamps.clear()
  }
}

/** 是不是「真正的灯」的发光材质（和 post.ts 的夜间加亮判断一致） */
const isGlow = (m: THREE.Material) => {
  const e = m as THREE.MeshToonMaterial
  return !!e.emissive && e.emissiveIntensity >= 0.3 && e.emissive.r + e.emissive.g + e.emissive.b > 0.01 && !e.emissiveMap
}

/**
 * 找灯具家具的发光部件：换成这盏灯独有的材质（共享缓存的材质不能直接改），记下发光部件中心作为光源位置。
 * 没有发光部件的（蜡烛类）：模型上部最浅色的部件当灯罩，给它一点发光。
 */
export function prepareLamp(id: string, obj: THREE.Object3D, def: AssetDef): Lamp {
  obj.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert()
  const box = new THREE.Box3()
  const meshes: THREE.Mesh[] = []
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !o.userData.isOutline && !Array.isArray(m.material)) meshes.push(m)
  })
  const clones = new Map<THREE.Material, GlowMat>()
  const glowOf = (mat: THREE.Material, base?: number) => {
    let g = clones.get(mat)
    if (!g) {
      const c = (mat as THREE.MeshToonMaterial).clone()
      c.userData[LAMP_GLOW] = true
      if (base !== undefined) {
        c.emissive = c.color.clone()
        c.emissiveIntensity = base
      }
      g = { mat: c, base: c.emissiveIntensity, color: c.emissive.clone() }
      clones.set(mat, g)
    }
    return g
  }
  const localBox = (m: THREE.Mesh) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    return m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
  }
  for (const m of meshes) {
    if (!isGlow(m.material as THREE.Material)) continue
    m.material = glowOf(m.material as THREE.Material).mat
    box.union(localBox(m))
  }
  if (box.isEmpty()) {
    // 上部最浅色的部件
    const all = new THREE.Box3()
    for (const m of meshes) all.union(localBox(m))
    const top = all.max.y - (all.max.y - all.min.y) * 0.45
    let best: THREE.Mesh | null = null
    let bestL = -1
    for (const m of meshes) {
      const b = localBox(m)
      const mat = m.material as THREE.MeshToonMaterial
      if (b.max.y < top || !mat.color || mat.transparent) continue
      const l = mat.color.r * 0.3 + mat.color.g * 0.59 + mat.color.b * 0.11
      if (l > bestL) {
        bestL = l
        best = m
      }
    }
    if (best) {
      best.material = glowOf(best.material as THREE.Material, 0.35).mat
      box.union(localBox(best))
    } else box.copy(all)
  }
  const local = box.isEmpty() ? new THREE.Vector3(0, def.h * 0.8, 0) : box.getCenter(new THREE.Vector3())
  const big = !def.prop && def.h >= 90 && !def.mount
  const tiny = def.h < 20 || def.w > 100
  return {
    id,
    obj,
    local,
    glows: [...clones.values()],
    intensity: big ? 0.38 : tiny ? 0.15 : 0.25,
    distance: big ? 240 : tiny ? 120 : 170,
    floor: big,
    level: 0,
    target: 0,
    roomId: null,
    decal: null,
  }
}

/** 测试与界面用：户型里每个房间的主灯数 */
export function primaryCount(plan: Plan) {
  const m = new Map<string, number>()
  for (const s of roomLightSpecs(plan)) if (s.primary) m.set(s.roomId, (m.get(s.roomId) ?? 0) + 1)
  return m
}


/** 餐桌位置的指纹：变了才需要重算吊灯位置（拖动别的家具时不用重建房间灯） */
export function diningKey(plan: Plan) {
  return plan.furniture
    .filter((f) => !f.z && DINING_RE.test(f.asset))
    .map((f) => `${f.asset}@${f.x},${f.y}`)
    .join(';')
}
