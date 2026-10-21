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
//   - 不投阴影的光会穿过楼板和隔墙：lightMask.ts 用俯视的房间编号图把每盏灯限制在所在楼层 + 所在房间
//     （敞开相连的房间、楼梯洞口 / 挑空上下相通），户型变了才重建编号图。
// 单位：厘米。平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { area, labelPointAvoiding, pointInPolygon, edgesOf, fixtureBox, fixtureDepth, uid, type Furniture, type Plan, type Room, type RoomKind, type Vec } from '../model'
import type { AssetDef, StyleTag } from './kit'
import { ASSET_MAP } from './assets'
import { hasTag } from './tags'
import { floorOf, floorViews, planFloors, stampFloor } from '../floors'
import { buildLightMask, lightMaskKey, setLightMaskEnabled, setLightMaskFloors, setLightMaskLight, setLightMaskMap, type LightMaskMap } from './lightMask'
import { useAnisotropy } from './toon'
import { CEILING, LAMP_GLOW, ceilingAssetId, fixtureModel, isMainKind, styleSpec, type FixtureShape, type RigGlow } from './lightFixtures'

export { CEILING, LAMP_GLOW, fixtureModel, styleSpec, type FixtureShape } from './lightFixtures'

// ---------- 设置 ----------

export type LightMode = 'auto' | 'on' | 'off'
export const LIGHT_MODES: LightMode[] = ['auto', 'on', 'off']
export const KELVIN_MIN = 2700
export const KELVIN_MAX = 6500
export const DEFAULT_KELVIN = 4000
/** 真实点光源数量池（固定，避免重编译） */
export const POOL_HIGH = 16
export const POOL_LOW = 6

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

export const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
/** 灯光颜色：色温的色相，亮度（相对亮度）固定——换色温只换冷暖，不会冷了就更亮 */
export function lightColor(k: number, out = new THREE.Color()) {
  kelvinColor(k, out)
  return out.multiplyScalar(LIGHT_LUMA / Math.max(1e-3, lum(out)))
}
const LIGHT_LUMA = 1.05
/** 全局亮度（%）的范围 */
export const POWER_MIN = 30
export const POWER_MAX = 160
export const DEFAULT_POWER = 100
/** 点光源照明范围的基础放大倍数（灯具规格里的 distance × 它 × 全局「范围」滑杆） */
const RANGE_SCALE = 1.5
/** 全局照明范围（%）的范围 */
export const RANGE_MIN = 50
export const RANGE_MAX = 250
export const DEFAULT_RANGE = 100
/** 室外光（天光、阳光、月光）强度（%）的范围：调低后室内主要靠灯照明，灯的影子更清楚 */
export const OUTDOOR_MIN = 0
export const OUTDOOR_MAX = 150
export const DEFAULT_OUTDOOR = 100

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
  /** 房间（住户）风格：吸顶灯 / 吊灯按风格换造型；没有就是通用的圆形吸顶灯 */
  style?: StyleTag
  shape?: FixtureShape
}

const SMALL_ROOMS: RoomKind[] = ['entrance', 'hall', 'storage', 'toilet', 'wash']
/** 吊灯挂在上方的餐桌 */
const isDiningTable = (asset: string) => hasTag(ASSET_MAP.get(asset), 'dining-table')

/** 房间里的餐桌（吊灯挂在它上方） */
function diningTable(plan: Plan, room: Room, defs: Map<string, AssetDef>) {
  let best: Furniture | null = null
  let bestA = 0
  for (const f of plan.furniture) {
    if (f.z || !isDiningTable(f.asset) || !pointInPolygon(f, room.points)) continue
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
export function roomLightSpecs(plan: Plan, defs: Map<string, AssetDef> = new Map(), styleOf?: (roomId: string) => StyleTag | undefined): RoomLightSpec[] {
  let out: RoomLightSpec[] = []
  // 多层户型按层算（同一位置上下两层的房间各管各的设备、餐桌）；高度是本层地面起算，楼层的高度由调用方加上
  for (const { view } of floorViews(plan)) roomSpecsInto(out, view, defs)
  // 主灯换成了灯具家具的房间（接管了、或者手动摆了吸顶灯）：不再自动摆吸顶灯 / 吊灯（手元灯、阳台壁灯照旧）
  const owned = ownedLightRooms(plan)
  out = out.filter((s) => !(isMainKind(s.kind) && owned.has(s.roomId)))
  // 吸顶灯 / 吊灯按房间风格换造型；和室一律用和风的
  const roomKinds = new Map(plan.rooms.map((r) => [r.id, r.kind]))
  for (const s of out) styleSpec(s, roomKinds.get(s.roomId) === 'japanese' ? 'japanese' : styleOf?.(s.roomId))
  return out
}

/** 主灯由灯具家具接管的房间：标了 ownLights，或者房间里摆着吸顶灯 / 吊灯（同一层） */
export function ownedLightRooms(plan: Plan) {
  const out = new Set<string>()
  for (const r of plan.rooms) if (r.ownLights) out.add(r.id)
  for (const f of plan.furniture) {
    if (!ASSET_MAP.get(f.asset)?.ceiling) continue
    const fl = floorOf(plan, f)
    const r = plan.rooms.find((x) => floorOf(plan, x) === fl && pointInPolygon(f, x.points))
    if (r) out.add(r.id)
  }
  return out
}

/** 房间主灯的亮度、照射范围（自动摆的主灯和吸顶灯家具一样算） */
export function mainLightPower(room: Room, kind: RoomLightKind) {
  const A = area(room.points)
  const r = Math.sqrt(A / Math.PI)
  if (kind === 'small') return { intensity: room.kind === 'bath' ? 1.0 : 0.85, distance: Math.min(420, Math.max(220, r * 2.4)) }
  return { intensity: 0.95 + Math.min(0.2, A / 1000000), distance: Math.min(800, Math.max(300, r * 2.0)) }
}
/** 主灯发光部件的亮度（自动摆的主灯、吸顶灯家具都用它） */
const mainGlow = (e: number, power: number) => 0.15 + 0.4 * e * Math.min(1.2, power)
/** 主灯地上光池的不透明度上限 */
const MAIN_POOL_OPACITY = 0.06
/** 主灯在点光源池里的优先级：排在副灯、灯具前面，照得远的更靠前 */
const mainPri = (distance: number) => 2e6 + Math.min(9e5, distance * distance * 0.01)

/**
 * 天花板下的灯具（房间灯、吸顶灯家具）淡不淡出：半墙 / 全部压低（hideAll）时淡出；前墙让开时，
 * 在所指房间之前的（s = 沿视线方向离房子中心多远，depth = 所指房间的深度）淡出
 */
export const ceilingHidden = (hideAll: boolean, s: number | null, depth: number | null) => hideAll || (s !== null && depth !== null && s > depth + 30)

/** 主灯在地上的光池半径 */
const poolRadius = (room: Room) => Math.max(120, Math.sqrt(area(room.points) / Math.PI) * 1.25)

/**
 * 接管一个房间的主灯：现在自动摆的吸顶灯 / 吊灯（specs 里这个房间的）按原位换成灯具家具，房间标上 ownLights（就地改 plan）。
 * 返回新加的家具（没有对应素材的跳过）。
 */
export function takeOverRoomLights(plan: Plan, roomId: string, specs: RoomLightSpec[]): Furniture[] {
  const room = plan.rooms.find((r) => r.id === roomId)
  if (!room || room.ownLights) return []
  const made: Furniture[] = []
  for (const s of specs) {
    if (s.roomId !== roomId || !isMainKind(s.kind)) continue
    const asset = ceilingAssetId(s.shape, s.kind)
    if (ASSET_MAP.has(asset)) made.push(stampFloor<Furniture>(plan, { id: uid('u'), asset, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, rot: 0 }, floorOf(plan, room)))
  }
  plan.furniture.push(...made)
  room.ownLights = true
  return made
}

/** 主灯归属的指纹：哪些房间换成了灯具家具（变了要重建房间灯） */
export const ownedLightKey = (plan: Plan) => [...ownedLightRooms(plan)].sort().join(',')

function roomSpecsInto(out: RoomLightSpec[], plan: Plan, defs: Map<string, AssetDef>) {
  for (const room of plan.rooms) {
    if (room.points.length < 3 || room.kind === 'void') continue
    const A = area(room.points)
    const r = Math.sqrt(A / Math.PI)
    const kitchens = plan.fixtures.filter((f) => f.kind === 'kitchen' && pointInPolygon(f, room.points))
    const boxes = plan.fixtures.filter((f) => pointInPolygon(f, room.points)).map(fixtureBox)
    const c = labelPointAvoiding(room.points, boxes)
    // 面积大的房间灯更亮一点（光池更大，中心不变）
    const main = mainLightPower(room, 'ceiling')
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
        out.push({ ...base, kind: 'pendant', x: t.f.x, y: t.f.y, h: top + 6, fy: top, ...main })
        continue
      }
    }
    if (SMALL_ROOMS.includes(room.kind) || room.kind === 'bath') {
      out.push({ ...base, kind: 'small', x: c.x, y: c.y, h: CEILING - 5, fy: CEILING - 6, ...mainLightPower(room, 'small') })
      continue
    }
    out.push({ ...base, kind: 'ceiling', x: c.x, y: c.y, h: CEILING - 5, fy: CEILING - 8, ...main })
    if (counter) out.push({ ...counter, primary: false, intensity: 0.55 })
    if (room.kind === 'ldk') {
      const t = diningTable(plan, room, defs)
      if (t) {
        const top = (t.def?.surface ?? 72) + 78
        out.push({ ...base, primary: false, kind: 'pendant', x: t.f.x, y: t.f.y, h: top + 6, fy: top, intensity: 0.5, distance: 260 })
      }
    }
  }
}

// ---------- 灯具家具 ----------

/** 灯具家具：带 light 标签的（灯具分类，以及化妆台的灯泡、植物补光灯、南瓜灯、蜡烛…；头灯、应援棒、灯带卷不算） */
export function isLampAsset(def: Pick<AssetDef, 'tags' | 'fixture'>) {
  return !def.fixture && hasTag(def, 'light')
}


interface GlowMat {
  mat: THREE.MeshToonMaterial
  /** 原本的 emissive 强度与颜色 */
  base: number
  color: THREE.Color
  /** 用这个材质的发光面大小（包围盒表面积，cm²）：大面积的白纸罩夜里上限更低 */
  area: number
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
  /** 吸顶灯 / 吊灯：当房间主灯用（亮度、范围、光池按房间算，发光部件同房间灯） */
  ceiling: boolean
  level: number
  target: number
  roomId: string | null
  decal: THREE.Mesh | null
}

/**
 * 夜里发光部件的 emissiveIntensity：0.55–0.75，加上受到的灯光，总亮度约为原色的 1.2–1.5 倍
 * （再亮就成一片白、看不出和纸的分格和灯具造型）
 */
export function glowIntensity(base: number, night: number, level: number, luma = 0.5, area = 0) {
  const off = base * (1 - 0.9 * night)
  // 越接近白色的灯罩（和纸、乳白玻璃）上限越低：白色再加亮就看不出和底色的差别了
  const cap = Math.min(0.65, Math.max(0.45, base * 1.2)) * (1 - 0.6 * luma)
  let lit = Math.max(base, cap)
  // 大面积的浅色纸罩 / 布罩（和纸灯笼、大鼓罩、发光圆柱）：一大片白在夜里最抢眼，亮起来时压到 LARGE_GLOW_CAP 附近
  // 灯泡、火苗（原本就很亮的小东西，合并网格后包围盒可能很大）不算
  const big = base <= 0.6 ? largeGlow(area) * Math.min(1, Math.max(0, (luma - 0.45) / 0.35)) : 0
  lit += (Math.min(lit, LARGE_GLOW_CAP) - lit) * big
  const on = base + (lit - base) * night
  return off + (on - off) * level
}

/** 大面积浅色发光罩夜里的 emissiveIntensity 上限 */
export const LARGE_GLOW_CAP = 0.45
/** 发光面积（cm²）→ 0–1：小灯泡、小台灯罩为 0，落地灯的大纸罩为 1 */
export const largeGlow = (area: number) => smooth(2000, 8000, area)

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
  useAnisotropy(poolTex)
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

// ---------- 管理器 ----------


interface RoomRig {
  spec: RoomLightSpec
  key: string
  /** 灯具本体（墙压低时淡出；阳台壁灯跟着它挂的那面墙藏） */
  fixture: THREE.Group | null
  glows: RigGlow[]
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
  /** 照明范围倍数（全局「范围」滑杆，1 = 默认）；不填 = 1 */
  range?: number
}

const FADE_SPEED = 2.2 // 每秒
/** 顶灯投影：投影的灯最多几盏（高画质）、阴影贴图边长（立方体六面各一张）、影子浓度、换灯时淡入的速度（每秒） */
const SHADOW_SLOTS = 4
const SHADOW_SIZE = 512
const SHADOW_K = 0.7
const SHADOW_FADE = 3
export class IndoorLights {
  /** 点光源 + 地面光斑 */
  readonly group = new THREE.Group()
  /** 天花板灯具（墙体淡出逻辑以它为根） */
  readonly fixtures = new THREE.Group()
  private pool: THREE.PointLight[] = []
  private rooms = new Map<string, RoomRig>()
  private lamps = new Map<string, Lamp>()
  /** 设了色温的房间 → 颜色 */
  private roomK = new Map<string, THREE.Color>()
  private state: LightState = { global: 'auto', kelvin: DEFAULT_KELVIN, auto: 0, night: 0, power: 1 }
  private plan: Plan | null = null
  private globalKelvin = lightColor(DEFAULT_KELVIN)
  /** 每个房间最多给几盏灯具家具真实光源 */
  private lampsPerRoom = 2
  private dirty = true
  private tmp = new THREE.Vector3()
  /**
   * 多层户型：房间所在楼层的抬升高度（楼层 elevation + 分层拉开的偏移），null = 这一层隐藏（灯具淡出、不打光）。
   * 房间灯的规格（RoomLightSpec）都是按本层地面算的，这里统一加上。单层户型不设，等于 0。
   */
  private liftOf: ((roomId: string | null) => number | null) | null = null
  /** 房间编号图（lightMask.ts）与它的指纹 */
  private mask: LightMaskMap | null = null
  private maskKey = ''
  /** 可以投影的房间（setShadowRooms）、各投影位现在放的是哪盏灯（位置）、影子淡入的进度 */
  private shadowRooms: Set<string> | null = null
  private shadowKeys: string[] = []
  private shadowFades: number[] = []
  /** 投影位的个数（setPoolSize 定） */
  private slots = 0

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
    // 前几盏是投影位（高画质）：漫游时这一层最显著的几盏灯放在这里（setShadowRooms），在同一层里走动时投影的灯不变。
    // 一直开着投影（开关会重编译着色器），不用时阴影浓度为 0
    this.slots = n >= POOL_HIGH ? Math.min(n, SHADOW_SLOTS) : 0
    this.pool.forEach((sl, i) => {
      sl.castShadow = i < this.slots
      if (!sl.castShadow) return
      sl.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE)
      // 立方体阴影的深度是透视的（非线性）：近平面太近时远处精度很差，偏移量稍大就把离墙几十厘米内的影子全吃掉（壁挂、靠墙家具没有影子）。
      // 近平面放到 5cm，偏移只留约半厘米（1 米处），表面的自阴影交给法线偏移
      sl.shadow.camera.near = 5
      sl.shadow.bias = -0.0003
      sl.shadow.normalBias = 1.5
      // 取样圈的半径（阴影贴图像素）：轮廓平滑；过渡收得很窄（硬边），见 toon.ts
      sl.shadow.radius = 3.5
      sl.shadow.intensity = 0
      // 只在灯挪了、场景变了（refreshShadows）时重画
      sl.shadow.autoUpdate = false
      // 建好就先画一次阴影贴图：投影的灯没有贴图时，有的显卡驱动（ANGLE / D3D11）上整个光照会算坏
      sl.shadow.needsUpdate = true
    })
    this.shadowKeys = []
    this.shadowFades = []
    this.lampsPerRoom = n >= POOL_HIGH ? 2 : 0
    this.dirty = true
  }

  /** 可以投影的房间（漫游时镜头所在那一层的房间；null = 不投影）：其中最显著的几盏灯投影 */
  setShadowRooms(ids: Set<string>) {
    this.shadowRooms = ids
    this.dirty = true
  }

  /** 场景变了（家具、户型、门开合）：投影位的阴影贴图要重画 */
  refreshShadows() {
    this.shadowKeys.forEach((key, i) => {
      if (key) this.pool[i].shadow.needsUpdate = true
    })
  }

  /** 有投影位的阴影贴图等着重画（换了一盏灯、场景变了） */
  shadowPending() {
    for (let i = 0; i < this.slots; i++) if (this.pool[i].shadow.needsUpdate) return true
    return false
  }

  get poolSize() {
    return this.pool.length
  }

  /** 房间、设备、餐桌变了：按需重建房间灯（同一房间 key 没变就不动） */
  syncRooms(plan: Plan, defs: Map<string, AssetDef>, floorY: (r: Room | undefined) => number, styleOf?: (roomId: string) => StyleTag | undefined) {
    this.plan = plan
    this.syncMask(plan)
    const specs = roomLightSpecs(plan, defs, styleOf)
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
      const { obj, glows } = fixtureModel(s)
      obj.position.set(s.x, s.fy + (this.liftOf?.(s.roomId) ?? 0), s.y)
      obj.rotation.y = s.ry
      // 和墙一样的淡出标记。天花板的灯法线为 0：只在半墙 / 全部压低时、或在所指房间前面时淡出；
      // 阳台壁灯挂在外墙上，法线是它朝外（朝阳台）的方向：墙被压低 / 半墙，或这面墙是正对镜头的前墙时跟着墙一起藏
      obj.userData.fade = s.kind === 'wall' ? { x: s.x, y: s.y, nx: Math.sin(s.ry), ny: Math.cos(s.ry), outer: true, onWall: true } : { x: s.x, y: s.y, nx: 0, ny: 0, outer: false }
      this.fixtures.add(obj)
      obj.userData.lightRoomId = s.roomId
      let decal: THREE.Mesh | null = null
      if (s.primary) {
        decal = poolDecal(room.points, s.x, s.y, poolRadius(room), floorY(room) + 0.4)
        decal.position.y = this.liftOf?.(s.roomId) ?? 0
        this.group.add(decal)
      }
      rig = { spec: s, key, fixture: obj, glows, decal, level: 0, target: 0, kelvin: new THREE.Color() }
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

  /** 房间 / 墙 / 楼层 / 楼梯变了：重建房间编号图 */
  private syncMask(plan: Plan) {
    const key = lightMaskKey(plan)
    if (key === this.maskKey) return
    this.maskKey = key
    this.mask = buildLightMask(plan)
    setLightMaskMap(this.mask)
    this.updateMaskFloors()
  }

  /** 各层地面的当前世界高度（含分层拉开的偏移；隐藏的层不参与） */
  private updateMaskFloors() {
    const p = this.plan
    if (!p) return
    const fs = planFloors(p)
    setLightMaskFloors(
      fs.map((f) => {
        if (!this.liftOf) return f.elevation
        const r = p.rooms.find((x) => floorOf(p, x) === f.id)
        if (!r) return f.elevation
        const y = this.liftOf(r.id)
        return y === null ? 1e7 : y
      }),
    )
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
    for (const g of rig.glows) g.mat.dispose()
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
      if (lamp.ceiling && room) Object.assign(lamp, mainLightPower(room, def.ceiling === 'small' ? 'small' : 'ceiling'))
      // 落地的灯：地上一圈小光斑；吸顶灯 / 吊灯：和房间主灯一样的大光池（位置、房间形状变了就重建；改房间会换掉 points 数组）
      const want = (lamp.ceiling || (lamp.floor && !f.z)) && room
      const R = lamp.ceiling && room ? poolRadius(room) : 95
      const dkey = want ? `${f.x},${f.y},${room!.id},${R}` : ''
      if ((lamp.decal?.userData.key ?? '') !== dkey || (want && lamp.decal?.userData.points !== room!.points)) {
        if (lamp.decal) {
          lamp.decal.removeFromParent()
          lamp.decal.geometry.dispose()
          ;(lamp.decal.material as THREE.Material).dispose()
          lamp.decal = null
        }
        if (want) {
          lamp.decal = poolDecal(room!.points, f.x, f.y, R, floorY(room!) + (lamp.ceiling ? 0.4 : 0.5))
          lamp.decal.position.y = this.liftOf?.(room!.id) ?? 0
          lamp.decal.userData.key = dkey
          lamp.decal.userData.points = room!.points
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
    // 房间自己的色温（主灯是灯具家具的房间没有房间灯，从这里取）
    this.roomK.clear()
    for (const r of p.rooms) if (r.lightK) this.roomK.set(r.id, lightColor(r.lightK))
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
    const lamp = this.lamps.get(id)
    if (lamp) return lamp.level
    // 主灯是灯具家具的房间：看房间里的吸顶灯
    let lv = 0
    for (const l of this.lamps.values()) if (l.ceiling && l.roomId === id) lv = Math.max(lv, l.level)
    return lv
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
    for (const l of this.lamps.values()) {
      if (!l.ceiling) continue
      s += l.target
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
    // 换了投影的灯：影子淡入，不一下子冒出来（只改阴影浓度，不用重新分配灯）
    let fading = false
    this.shadowKeys.forEach((key, i) => {
      if (!key || this.shadowFades[i] >= 1) return
      this.shadowFades[i] = Math.min(1, this.shadowFades[i] + dt * SHADOW_FADE)
      this.pool[i].shadow.intensity = SHADOW_K * this.shadowFades[i]
      fading = true
    })
    if (!busy && !this.dirty) return fading
    this.dirty = false
    this.apply()
    // 应用过一次（开关、色温、位置变了）也要重画
    return true
  }

  /** 拖动灯具时光源跟着走 */
  touch() {
    this.dirty = true
  }

  /**
   * 多层户型：设置各房间的抬升高度（见 liftOf），挪好房间灯具和光斑。楼层动画（分层拉开、隐藏上层）每帧调用。
   * fn 传 null 恢复单层的样子。
   */
  setLift(fn: ((roomId: string | null) => number | null) | null) {
    this.liftOf = fn
    for (const rig of this.rooms.values()) {
      const y = fn?.(rig.spec.roomId)
      if (rig.fixture) rig.fixture.position.y = rig.spec.fy + (y ?? 0)
      // 阳台壁灯不走淡出（挂在墙上），隐藏楼层时直接藏起来
      if (rig.fixture && rig.spec.kind === 'wall') rig.fixture.visible = y !== null
      if (rig.decal) rig.decal.position.y = y ?? 0
    }
    for (const l of this.lamps.values()) if (l.decal) l.decal.position.y = fn?.(l.roomId) ?? 0
    this.updateMaskFloors()
    this.dirty = true
  }

  /** 房间所在楼层被隐藏（只显示到当前层时的上层） */
  private hiddenRoom(id: string | null) {
    return !!this.liftOf && this.liftOf(id) === null
  }

  private apply() {
    const night = this.state.night
    const power = this.state.power
    // 候选：[优先级, 位置, 颜色, 强度, 距离]
    type Cand = { pri: number; x: number; y: number; z: number; color: THREE.Color; i: number; d: number; room: string | null }
    const OFF_CAND = { pri: 0, x: 0, y: 0, z: 0, i: 0, d: 1, room: null }
    let cands: Cand[] = []
    for (const rig of this.rooms.values()) {
      const s = rig.spec
      const lv = rig.level
      const e = lv * lv * (3 - 2 * lv)
      for (const g of rig.glows) {
        g.mat.emissiveIntensity = mainGlow(e, power)
        tintGlow(g.mat.emissive, g.color, rig.kelvin, e)
      }
      const hidden = this.hiddenRoom(s.roomId)
      if (rig.decal) {
        const m = rig.decal.material as THREE.MeshBasicMaterial
        m.color.copy(rig.kelvin)
        m.opacity = MAIN_POOL_OPACITY * e * power
        rig.decal.visible = e > 0.01 && !hidden
      }
      if ((rig.target > 0 || lv > 0) && !hidden) {
        // 副灯（台面灯等）排在主灯后面
        const pri = mainPri(s.distance) - (s.primary ? 0 : 1e6)
        cands.push({ pri, x: s.x, y: s.h + (this.liftOf?.(s.roomId) ?? 0), z: s.y, color: rig.kelvin, i: s.intensity * e * power, d: s.distance, room: s.roomId })
      }
    }
    // 灯具家具：每个房间离房间中心近的前 N 盏打光，其余只发光
    const byRoom = new Map<string, { l: Lamp; d: number }[]>()
    for (const l of this.lamps.values()) {
      const e = l.level * l.level * (3 - 2 * l.level)
      const kel = this.kelvinOfRoom(l.roomId)
      for (const g of l.glows) {
        // 吸顶灯 / 吊灯的发光部件同房间灯
        if (l.ceiling) g.mat.emissiveIntensity = mainGlow(e, power)
        else g.mat.emissiveIntensity = glowIntensity(g.base, night, e, g.color.r * 0.3 + g.color.g * 0.59 + g.color.b * 0.11, g.area)
        tintGlow(g.mat.emissive, g.color, kel, e)
      }
      const hidden = this.hiddenRoom(l.roomId)
      if (l.decal) {
        const m = l.decal.material as THREE.MeshBasicMaterial
        m.color.copy(kel)
        m.opacity = (l.ceiling ? MAIN_POOL_OPACITY : 0.05) * e * power
        l.decal.visible = e > 0.01 && !hidden
      }
      if (!(l.target > 0 || l.level > 0) || hidden) continue
      l.obj.updateWorldMatrix(true, false)
      const w = l.obj.localToWorld(this.tmp.copy(l.local))
      if (l.ceiling) {
        // 当房间主灯用：和自动摆的主灯一样排在池子前面，不占「每个房间几盏灯具」的名额
        cands.push({ pri: mainPri(l.distance), x: w.x, y: w.y, z: w.z, color: kel, i: l.intensity * e * power, d: l.distance, room: l.roomId })
        continue
      }
      if (!this.lampsPerRoom) continue
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
        cands.push({ pri: 5e5 + l.intensity * 1000, x: w.x, y: w.y, z: w.z, color: this.kelvinOfRoom(l.roomId), i: l.intensity * e * power, d: l.distance, room: l.roomId })
      }
    }
    cands.sort((a, b) => b.pri - a.pri)
    // 投影位：可以投影的房间里开着的灯（主灯、台面灯、台灯落地灯都算），按「亮度 × 照射范围」挑最显著的几盏排到最前面——
    // 每盏各自投影，两盏灯照同一个东西就有两块影子，叠在一起的地方更暗
    const slots = this.slots
    if (slots) {
      const rooms = this.shadowRooms
      const lead = rooms
        ? cands
            .filter((c) => c.i > 0.05 && c.room && rooms.has(c.room))
            .sort((a, b) => b.i * b.d - a.i * a.d)
            .slice(0, slots)
        : []
      // 还在里面的灯留在原来的投影位（排名互换时不重画阴影、不重新淡入），新进来的填空出来的位
      const keyOf = (c: Cand) => `${c.x},${c.y},${c.z}`
      const placed: (Cand | null)[] = Array.from({ length: slots }, (_, i) => lead.find((c) => keyOf(c) === this.shadowKeys[i]) ?? null)
      for (const c of lead) if (!placed.includes(c)) placed[placed.indexOf(null)] = c
      const rest = cands.filter((c) => !lead.includes(c))
      // 空着的投影位也要占住池子的位置（池子第 i 盏 = 投影位 i）：用后面的普通灯补上，没有就放一盏不亮的
      cands = placed.map((c) => c ?? rest.shift() ?? { ...OFF_CAND, color: this.globalKelvin }).concat(rest)
      placed.forEach((c, i) => {
        const key = c ? keyOf(c) : ''
        if (key === (this.shadowKeys[i] ?? '')) return
        this.shadowKeys[i] = key
        this.shadowFades[i] = 0
        const sl = this.pool[i]
        sl.shadow.intensity = 0
        if (key) sl.shadow.needsUpdate = true
      })
    }
    let anyOn = false
    // 池子里第 i 盏灯 = 着色器里的 pointLights[ i ]（场景里只有这些点光源，按加入顺序）：遮罩数组按同样的下标写
    this.pool.forEach((pl, i) => {
      const c = cands[i]
      if (!c || c.i <= 0.0005) {
        pl.intensity = 0
        return
      }
      pl.position.set(c.x, c.y, c.z)
      pl.color.copy(c.color)
      pl.intensity = c.i
      // 照明范围放大一些：光被房间遮罩（lightMask.ts）限制在所在房间里，范围大了也不会漏到隔壁，房间角落不再一片暗
      pl.distance = c.d * RANGE_SCALE * (this.state.range ?? 1)
      anyOn = true
      const m = c.room ? this.mask?.rooms.get(c.room) : undefined
      setLightMaskLight(i, m?.floor ?? 0, m?.group ?? 0, !m)
    })
    setLightMaskEnabled(anyOn)
  }

  /** 房间灯的色温：房间自己设了就用它（refreshTargets 里 rig.kelvin 也是这么算的），否则跟随全局 */
  private kelvinOfRoom(id: string | null) {
    return (id && this.roomK.get(id)) || this.globalKelvin
  }

  /** 射线碰到的第一个看得见的房间灯具（隐藏楼层的不算）：灯具组 */
  private hitFixture(ray: THREE.Raycaster) {
    const hit = ray.intersectObject(this.fixtures, true).find((h) => h.object.visible && !h.object.userData.isOutline && !this.hiddenRoom(lightRoomOf(h.object)))
    let o: THREE.Object3D | null = hit?.object ?? null
    while (o && !o.userData.lightRoomId) o = o.parent
    return o
  }

  /** 屏幕射线碰到的自动摆的房间主灯（吸顶灯 / 吊灯；手元灯、阳台壁灯不算）：房间 id 和这个房间现在所有主灯的规格 */
  pickMain(ray: THREE.Raycaster): { roomId: string; specs: RoomLightSpec[] } | null {
    const o = this.hitFixture(ray)
    const rigs = [...this.rooms.values()]
    const rig = o && rigs.find((r) => r.fixture === o)
    if (!rig || !isMainKind(rig.spec.kind)) return null
    const roomId = rig.spec.roomId
    return { roomId, specs: rigs.filter((r) => r.spec.roomId === roomId).map((r) => r.spec) }
  }

  private roomCenter(id: string | null) {
    if (!id) return null
    for (const rig of this.rooms.values()) if (rig.spec.roomId === id && rig.spec.primary) return { x: rig.spec.x, y: rig.spec.y }
    return null
  }

  /**
   * 灯具本体的淡出目标：半墙 / 全部压低 / 墙很矮时全部淡出；前墙压低 / 透明且跟随鼠标时，所指房间之前的房间淡出；
   * 阳台壁灯挂的那面墙是被让开的前墙时也淡出。光照不受影响。
   */
  applyCutaway(center: Vec, dir: Vec | null, depth: number | null, hideAll: boolean) {
    for (const o of this.fixtures.children) {
      const f = o.userData.fade as { x: number; y: number; nx: number; ny: number; onWall?: boolean }
      // 隐藏楼层的灯具一起淡出
      let hide = hideAll || this.hiddenRoom(o.userData.lightRoomId ?? null)
      const s = dir ? (f.x - center.x) * dir.x + (f.y - center.y) * dir.y : 0
      // 阳台壁灯：挂的那面墙正对镜头、又在房子靠镜头的一侧（前墙透明 / 压低时被让开的那面）
      if (!hide && dir && f.onWall) hide = f.nx * dir.x + f.ny * dir.y > 0.3 && s > 25
      if (!hide) hide = ceilingHidden(false, dir ? s : null, depth)
      o.userData.target = hide ? 1 : 0
    }
  }

  /** 3D 里点中的天花板灯具 → 房间 id */
  pickRoom(ray: THREE.Raycaster) {
    return (this.hitFixture(ray)?.userData.lightRoomId as string) ?? null
  }

  dispose() {
    for (const rig of this.rooms.values()) this.dropRig(rig)
    for (const l of this.lamps.values()) this.dropLamp(l)
    this.rooms.clear()
    this.lamps.clear()
  }
}

/** 灯具网格所属的房间（往上找 lightRoomId） */
function lightRoomOf(o: THREE.Object3D | null): string | null {
  while (o && !o.userData.lightRoomId) o = o.parent
  return (o?.userData.lightRoomId as string) ?? null
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
      g = { mat: c, base: c.emissiveIntensity, color: c.emissive.clone(), area: 0 }
      clones.set(mat, g)
    }
    return g
  }
  /** 包围盒表面积（发光面大小的估计） */
  const boxArea = (b: THREE.Box3) => {
    const s = b.getSize(new THREE.Vector3())
    return 2 * (s.x * s.y + s.y * s.z + s.x * s.z)
  }
  const localBox = (m: THREE.Mesh) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    return m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
  }
  // 吸顶灯 / 吊灯素材的发光部件就是房间灯的发光材质（lightFixtures.ts glowMaterial 标了 LAMP_GLOW）
  const ceiling = !!def.ceiling
  for (const m of meshes) {
    const mat = m.material as THREE.Material
    if (!(ceiling ? mat.userData[LAMP_GLOW] : isGlow(mat))) continue
    const g = glowOf(m.material as THREE.Material)
    m.material = g.mat
    const b = localBox(m)
    g.area += boxArea(b)
    box.union(b)
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
    ceiling,
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
    .filter((f) => !f.z && isDiningTable(f.asset))
    .map((f) => `${f.asset}@${f.x},${f.y}`)
    .join(';')
}
