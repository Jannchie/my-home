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
import { area, labelPointAvoiding, pointInPolygon, edgesOf, fixtureBox, fixtureDepth, type Furniture, type Plan, type Room, type RoomKind, type Vec } from '../model'
import type { AssetDef, StyleTag } from './kit'
import { ASSET_MAP } from './assets'
import { hasTag } from './tags'
import { floorOf, floorViews, planFloors } from '../floors'
import { buildLightMask, lightMaskKey, setLightMaskEnabled, setLightMaskFloors, setLightMaskLight, setLightMaskMap, type LightMaskMap } from './lightMask'
import { addOutlines, ball, cup, cyl, rbox, toon, torus, useAnisotropy } from './toon'

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
  const out: RoomLightSpec[] = []
  // 多层户型按层算（同一位置上下两层的房间各管各的设备、餐桌）；高度是本层地面起算，楼层的高度由调用方加上
  for (const { view } of floorViews(plan)) roomSpecsInto(out, view, defs)
  // 吸顶灯 / 吊灯按房间风格换造型；和室一律用和风的
  const kinds = new Map(plan.rooms.map((r) => [r.id, r.kind]))
  for (const s of out) styleSpec(s, kinds.get(s.roomId) === 'japanese' ? 'japanese' : styleOf?.(s.roomId))
  return out
}

function roomSpecsInto(out: RoomLightSpec[], plan: Plan, defs: Map<string, AssetDef>) {
  for (const room of plan.rooms) {
    if (room.points.length < 3 || room.kind === 'void') continue
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
}

// ---------- 灯具家具 ----------

/** 灯具家具：带 light 标签的（灯具分类，以及化妆台的灯泡、植物补光灯、南瓜灯、蜡烛…；头灯、应援棒、灯带卷不算） */
export function isLampAsset(def: Pick<AssetDef, 'tags' | 'fixture'>) {
  return !def.fixture && hasTag(def, 'light')
}

/** 发光部件的标记：post.ts 的夜间加亮跳过它们，由这里按开关 / 色温控制 */
export const LAMP_GLOW = 'lampGlow'

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

// ---------- 吸顶灯 / 吊灯模型 ----------

/**
 * 按风格变化的主灯造型。flush 类贴着天花板（吸顶），其余吊在天花板下（吊灯、半吸顶）。
 *   hang：主灯（ceiling）时灯具底面离天花板多远；small：小房间（卫浴玄关）用时的距离（不给 = 不用在小房间）
 *   light：光源在灯具底面以上多高（放在灯罩 / 灯体里面）
 */
export type FixtureShape =
  | 'washi-square'
  | 'bamboo'
  | 'ph'
  | 'wood-ring'
  | 'led-disc'
  | 'led-line'
  | 'metal-dome'
  | 'cage'
  | 'milk-glass'
  | 'tiffany'
  | 'cloud'
  | 'star'
  | 'lattice'
  | 'palace'
  | 'chandelier'
  | 'crystal-flush'
  | 'wagon-wheel'
  | 'hex-lantern'
  | 'cylinder'

const SHAPES: Record<FixtureShape, { hang: number; light: number; small?: number }> = {
  'washi-square': { hang: 9, light: 3.5, small: 7 },
  bamboo: { hang: 52, light: 9 },
  ph: { hang: 55, light: 6 },
  'wood-ring': { hang: 8, light: 3, small: 6 },
  'led-disc': { hang: 7, light: 1.5, small: 6 },
  'led-line': { hang: 40, light: 1.2 },
  'metal-dome': { hang: 55, light: 5 },
  cage: { hang: 30, light: 9, small: 24 },
  'milk-glass': { hang: 14, light: 6, small: 10 },
  tiffany: { hang: 55, light: 6 },
  cloud: { hang: 14, light: 6, small: 11 },
  star: { hang: 12, light: 2, small: 10 },
  lattice: { hang: 12, light: 5, small: 9 },
  palace: { hang: 58, light: 12 },
  chandelier: { hang: 62, light: 10 },
  'crystal-flush': { hang: 10, light: 4, small: 8 },
  'wagon-wheel': { hang: 58, light: 6 },
  'hex-lantern': { hang: 56, light: 11 },
  cylinder: { hang: 55, light: 6 },
}

/** 各风格的主灯 / 小房间灯 / 餐桌吊灯造型（同一风格有几款时按房间 id 固定挑一款） */
const STYLE_SHAPES: Record<StyleTag, { ceiling: FixtureShape[]; small: FixtureShape; pendant: FixtureShape }> = {
  japanese: { ceiling: ['washi-square', 'bamboo'], small: 'washi-square', pendant: 'bamboo' },
  nordic: { ceiling: ['ph', 'wood-ring'], small: 'wood-ring', pendant: 'ph' },
  modern: { ceiling: ['led-disc', 'led-line'], small: 'led-disc', pendant: 'cylinder' },
  industrial: { ceiling: ['metal-dome', 'cage'], small: 'cage', pendant: 'metal-dome' },
  retro: { ceiling: ['milk-glass', 'tiffany'], small: 'milk-glass', pendant: 'tiffany' },
  cute: { ceiling: ['cloud', 'star'], small: 'cloud', pendant: 'cloud' },
  chinese: { ceiling: ['lattice', 'palace'], small: 'lattice', pendant: 'palace' },
  classic: { ceiling: ['chandelier', 'crystal-flush'], small: 'crystal-flush', pendant: 'chandelier' },
  farmhouse: { ceiling: ['wagon-wheel', 'hex-lantern'], small: 'cage', pendant: 'hex-lantern' },
}

const hashStr = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 给房间灯套上风格造型：改 shape / style，吊下来的造型把灯具和光源一起往下移 */
export function styleSpec(s: RoomLightSpec, style: StyleTag | undefined, variant = hashStr(s.roomId)) {
  if (!style || !(s.kind === 'ceiling' || s.kind === 'small' || s.kind === 'pendant')) return
  const t = STYLE_SHAPES[style]
  const shape = s.kind === 'ceiling' ? t.ceiling[variant % t.ceiling.length] : s.kind === 'small' ? t.small : t.pendant
  const info = SHAPES[shape]
  s.style = style
  s.shape = shape
  if (s.kind !== 'pendant') s.fy = CEILING - (s.kind === 'small' ? info.small ?? info.hang : info.hang)
  s.h = Math.min(CEILING - 3, s.fy + info.light)
}

function glowMaterial(color: string) {
  const m = (toon(color) as THREE.MeshToonMaterial).clone()
  m.emissive = new THREE.Color(color)
  m.emissiveIntensity = 0.15
  m.userData[LAMP_GLOW] = true
  return m
}

const WARM_BULB = '#ffe6b0'
const PAPER = '#fbf3e2'
const BRASS = '#cfae63'
const IRON = '#3a3a3c'
const CRYSTAL = '#e6f3ff'

/** 沿控制点的细管 */
function tubeMesh(pts: [number, number, number][], r: number, color: string) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 6, false), toon(color))
  return m
}

/** 两端已知的细杆 */
function rodMesh(a: [number, number, number], b: [number, number, number], r: number, color: string) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, 6)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 水平圆环，y 为环心 */
const hRing = (r: number, t: number, color: string, y: number) => {
  const m = torus(r, t, color, { y })
  m.rotation.x = Math.PI / 2
  return m
}

/** 旋转体（灯罩），profile 为 [半径, 高] */
function latheMesh(profile: [number, number][], mat: THREE.Material, y = 0, seg = 28) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(0.001, r), h)), seg), mat)
  m.position.y = y
  return m
}

/** 吊线 + 吸顶座：从 y0 到天花板（top） */
function cord(g: THREE.Group, y0: number, top: number, color = IRON, canopy = 5) {
  if (top - y0 > 2) g.add(cyl(0.45, 0.45, top - y0 - 1.6, color, { y: y0 }, 6))
  g.add(cyl(canopy, canopy, 1.6, color, { y: top - 1.6 }, 20))
}

/**
 * 灯具模型：局部原点在灯具底面中心（吊灯在灯罩下沿）；glows 是要随开关变亮的材质（各自的原色）。
 * top = 天花板离原点多高（吸线、吸顶座画到这里）。
 */
export function fixtureModel(s: RoomLightSpec): { obj: THREE.Group; glows: RigGlow[] } {
  const g = new THREE.Group()
  const glows: RigGlow[] = []
  const glow = (color: string) => {
    const m = glowMaterial(color)
    glows.push({ mat: m, color: new THREE.Color(color) })
    return m
  }
  const lit = <T extends THREE.Mesh>(m: T, mat: THREE.Material, outline = true): T => {
    m.material = mat
    if (!outline) m.userData.noOutline = true
    return m
  }
  const top = CEILING - s.fy
  const small = s.kind === 'small'
  const S = small ? 13 : s.kind === 'pendant' ? 19 : 24
  const rim = '#e9e4da'
  switch (s.shape) {
    case 'washi-square': {
      // 方形和纸吸顶：原木框 + 和纸面板 + 底面组子格
      const w = S * 1.9
      const h = top - 1.6
      const wood = '#b88a5a'
      g.add(lit(rbox(w - 1.6, h, w - 1.6, PAPER, {}, 0.4), glow(PAPER)))
      for (const sz of [-1, 1]) {
        g.add(rbox(w, 1.8, 1.8, wood, { z: (sz * (w - 1.8)) / 2 }, 0.4))
        g.add(rbox(1.8, 1.8, w - 3.6, wood, { x: (sz * (w - 1.8)) / 2 }, 0.4))
      }
      for (let i = 1; i < 4; i++) {
        const p = -w / 2 + (w * i) / 4
        g.add(rbox(w - 3, 0.6, 0.6, wood, { y: -0.35, z: p }, 0.2))
        g.add(rbox(0.6, 0.6, w - 3, wood, { x: p, y: -0.35 }, 0.2))
      }
      g.add(rbox(w * 0.4, 1.6, w * 0.4, wood, { y: top - 1.6 }, 0.4))
      break
    }
    case 'lattice': {
      // 新中式方形木格吸顶：深色木框、绢纱发光、底面回纹 + 四角红流苏
      const w = S * 1.9
      const h = Math.max(4, top - 3.2)
      const wood = '#5a3b2a'
      g.add(lit(rbox(w - 2, h, w - 2, '#f6ecd8', { y: 0.4 }, 0.4), glow('#f6ecd8')))
      for (const y of [0, h]) {
        for (const sz of [-1, 1]) {
          g.add(rbox(w + 1, 2.2, 2.2, wood, { y, z: (sz * (w - 1.2)) / 2 }, 0.5))
          g.add(rbox(2.2, 2.2, w - 3.2, wood, { x: (sz * (w - 1.2)) / 2, y }, 0.5))
        }
      }
      for (const k of [0.62, 0.32]) {
        const ww = w * k
        for (const sz of [-1, 1]) {
          g.add(rbox(ww, 0.8, 0.8, wood, { y: -0.5, z: (sz * ww) / 2 }, 0.2))
          g.add(rbox(0.8, 0.8, ww, wood, { x: (sz * ww) / 2, y: -0.5 }, 0.2))
        }
      }
      if (!small)
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            g.add(cyl(0.25, 0.25, 3, '#b8352b', { x: sx * (w / 2 + 0.2), y: -3, z: sz * (w / 2 + 0.2) }, 4))
            g.add(cyl(0.6, 1.3, 6, '#b8352b', { x: sx * (w / 2 + 0.2), y: -9, z: sz * (w / 2 + 0.2) }, 8))
          }
      break
    }
    case 'wood-ring': {
      // 北欧木圈吸顶：乳白灯罩外围一圈原木
      const dome = cyl(S * 0.86, S * 0.92, Math.min(top - 2, S * 0.26), '#fff6e6', {}, 36)
      g.add(lit(dome, glow('#fff6e6')))
      g.add(hRing(S * 0.98, S * 0.09, '#d9b98c', S * 0.12))
      g.add(cyl(S * 0.5, S * 0.5, 2, '#d9b98c', { y: top - 2 }, 28))
      break
    }
    case 'led-disc': {
      // 现代圆盘 LED：很薄的发光圆盘 + 一圈金属边
      g.add(lit(cyl(S * 1.02, S * 1.02, 2.4, '#fbfaf6', {}, 48), glow('#fbfaf6')))
      g.add(hRing(S * 1.03, 0.6, '#c3c7cc', 1.2))
      g.add(cyl(S * 0.4, S * 0.4, top - 2.4, '#e8e8e6', { y: 2.4 }, 24))
      break
    }
    case 'led-line': {
      // 现代线条灯：长条铝壳，底面发光，两根吊线
      const L = S * 3.4
      g.add(rbox(L, 3, 5, '#3d3f44', { y: 0.6 }, 0.6))
      g.add(lit(rbox(L - 1.4, 0.8, 3.6, '#fbfaf6', {}, 0.3), glow('#fbfaf6'), false))
      for (const sx of [-1, 1]) {
        g.add(cyl(0.18, 0.18, top - 3.6, '#8a8d93', { x: sx * L * 0.38, y: 3.6 }, 4))
        g.add(cyl(2.2, 2.2, 1, '#3d3f44', { x: sx * L * 0.38, y: top - 1 }, 12))
      }
      break
    }
    case 'cylinder': {
      // 现代筒形吊灯：哑光金属筒，下口里面发光
      g.add(cup(S * 0.5, S * 0.5, S * 0.9, 0.6, '#3d3f44', { rx: Math.PI, y: S * 0.9 }))
      g.add(lit(cyl(S * 0.46, S * 0.46, 0.4, '#fff3dc', { y: S * 0.3 }, 28), glow('#fff3dc'), false))
      g.add(lit(ball(3, WARM_BULB, { y: S * 0.42 }), glow(WARM_BULB), false))
      cord(g, S * 0.9, top, '#3d3f44', 4)
      break
    }
    case 'ph': {
      // PH 三层罩吊灯
      const k = S / 22
      const domeAt = (r: number, h: number, yTop: number, rTop: number) => {
        const m = cup(r * k, rTop * k, h * k, 0.7, '#f7f5f0')
        m.rotation.x = Math.PI
        m.position.y = yTop * k
        return lit(m, glow('#f7f5f0'))
      }
      g.add(domeAt(22, 9, 22, 6))
      g.add(domeAt(16, 7, 13.5, 9))
      g.add(domeAt(10.5, 5, 6.5, 7))
      g.add(lit(ball(3.4 * k, WARM_BULB, { y: 7 * k }), glow(WARM_BULB), false))
      cord(g, 22 * k, top, '#8a8d93', 4)
      break
    }
    case 'bamboo': {
      // 竹编吊灯：发光的和纸内罩 + 竹篾弧条与箍
      const R = S * 0.95
      const H = R * 0.9
      const bamboo = '#c99a5b'
      const prof: [number, number][] = [
        [R * 0.82, 0],
        [R, H * 0.3],
        [R * 0.92, H * 0.65],
        [R * 0.55, H * 0.92],
        [R * 0.18, H],
      ]
      const inner = glow('#f6ecd6')
      ;(inner as THREE.MeshToonMaterial).side = THREE.DoubleSide
      g.add(latheMesh(prof, inner))
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const pts = prof.map(([r, y]): [number, number, number] => [Math.sin(a) * (r + 0.5), y, Math.cos(a) * (r + 0.5)])
        g.add(tubeMesh(pts, 0.3, bamboo))
      }
      g.add(hRing(R * 0.82 + 0.4, 0.5, bamboo, 0))
      g.add(hRing(R + 0.6, 0.4, bamboo, H * 0.3))
      g.add(hRing(R * 0.92 + 0.6, 0.4, bamboo, H * 0.65))
      g.add(lit(ball(3, WARM_BULB, { y: H * 0.45 }), glow(WARM_BULB), false))
      cord(g, H, top, '#6e4f37', 3.5)
      break
    }
    case 'metal-dome': {
      // 工业金属罩吊灯：深色金属斗罩，罩里一圈亮
      const R = S * 0.85
      const shade = cup(R, R * 0.22, R * 0.75, 0.7, IRON)
      shade.rotation.x = Math.PI
      shade.position.y = R * 0.75
      g.add(shade)
      g.add(lit(cyl(R * 0.94, R * 0.94, 0.3, '#ffeccc', { y: 0.6 }, 28), glow('#ffeccc'), false))
      g.add(lit(ball(3.4, WARM_BULB, { y: R * 0.3 }, [1, 1.3, 1]), glow(WARM_BULB), false))
      g.add(cyl(2.4, 2.4, 3, '#c46a3a', { y: R * 0.75 }, 12))
      cord(g, R * 0.75 + 3, top, IRON, 4)
      break
    }
    case 'cage': {
      // 铁笼半吸顶：吸顶盘 + 短杆 + 铁丝笼 + 爱迪生灯泡
      const R = small ? 7 : 10
      const H = small ? 15 : 20
      const cy = H / 2
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const pts: [number, number, number][] = []
        for (let j = 0; j <= 6; j++) {
          const t = -1 + (2 * j) / 6
          const r = R * Math.sqrt(1 - 0.7 * t * t)
          pts.push([Math.sin(a) * r, cy + (t * H) / 2, Math.cos(a) * r])
        }
        g.add(tubeMesh(pts, 0.3, IRON))
      }
      g.add(hRing(R, 0.35, IRON, cy))
      g.add(lit(ball(R * 0.42, WARM_BULB, { y: cy }, [1, 1.35, 1]), glow(WARM_BULB), false))
      g.add(cyl(1.8, 1.8, 3, '#c9a25a', { y: H - 0.5 }, 12))
      g.add(cyl(0.8, 0.8, Math.max(0.5, top - H - 2.5), IRON, { y: H + 2.5 }, 8))
      g.add(cyl(6, 6, 1.6, IRON, { y: top - 1.6 }, 20))
      break
    }
    case 'milk-glass': {
      // 复古乳白玻璃罩：黄铜底盘 + 半球乳白罩 + 底部小铜钮
      const R = S * 0.82
      const H = top - 2
      g.add(latheMesh([[0.001, 0], [R * 0.45, H * 0.05], [R * 0.85, H * 0.3], [R, H * 0.7], [R, H], [0.001, H]], glow('#f7efdc')))
      g.add(hRing(R + 0.2, 0.6, BRASS, H))
      // 吸顶座小一点：从上往下看主要是发光的罩子
      g.add(cyl(R * 0.32, R * 0.32, 2, BRASS, { y: H }, 28))
      g.add(ball(1.4, BRASS, { y: -0.6 }))
      break
    }
    case 'tiffany': {
      // 蒂芙尼彩玻璃吊灯：锥形罩，几种颜色的玻璃片，片间铅条
      const R = S * 0.95
      const H = R * 0.6
      const colors = ['#e8a83c', '#5aa47a', '#c8473a', '#f0c35a']
      const n = 16
      for (let i = 0; i < n; i++) {
        const mat = glow(colors[i % colors.length])
        mat.side = THREE.DoubleSide
        const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.3, R, H, 3, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n), mat)
        m.position.y = H / 2
        g.add(m)
        const a = (i / n) * Math.PI * 2
        g.add(rodMesh([Math.sin(a) * R, 0, Math.cos(a) * R], [Math.sin(a) * R * 0.3, H, Math.cos(a) * R * 0.3], 0.3, '#5a4a3a'))
      }
      g.add(hRing(R, 0.5, '#5a4a3a', 0))
      g.add(hRing(R * 0.65, 0.3, '#5a4a3a', H / 2))
      g.add(lit(ball(3, WARM_BULB, { y: H * 0.4 }), glow(WARM_BULB), false))
      cord(g, H, top, '#5a4a3a', 4)
      break
    }
    case 'cloud': {
      // 云朵灯：几团压扁的发光球
      const m = glow('#fdfcf8')
      const r = S / 4.2
      const parts: [number, number, number, number][] = [
        [-S * 0.55, 0, 0, 1],
        [-S * 0.2, r * 0.3, S * 0.18, 1.25],
        [S * 0.22, r * 0.25, -S * 0.12, 1.35],
        [S * 0.58, 0, S * 0.05, 1.05],
        [0, -r * 0.1, -S * 0.3, 1.1],
        [0.05, 0, S * 0.32, 1],
      ]
      for (const [x, y, z, k] of parts) g.add(lit(ball(r * k, '#fdfcf8', { x, y: y + r * k * 0.7, z }, [1, 0.7, 1]), m))
      g.add(cyl(0.4, 0.4, Math.max(0.5, top - r * 1.6), '#e8e4dc', { y: r * 1.6 }, 6))
      g.add(cyl(4, 4, 1.4, '#f4f0ea', { y: top - 1.4 }, 16))
      break
    }
    case 'star': {
      // 星星吸顶灯：一颗平放、朝下发光的星星
      const R0 = S * 1.1
      const sh = new THREE.Shape()
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? R0 * 0.5 : R0
        if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2 })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, 0.8, 0)
      g.add(new THREE.Mesh(geo, glow('#fff1b8')))
      g.add(cyl(R0 * 0.25, R0 * 0.25, top - 4, '#fbf7f1', { y: 4 }, 20))
      break
    }
    case 'palace': {
      // 新中式六角宫灯：木檐、绢纱灯身、六根立柱、檐角挂流苏
      const R = S * 0.62
      const H = R * 1.5
      const wood = '#6b3a2a'
      g.add(cyl(R * 0.5, R * 1.05, 3, wood, {}, 6))
      g.add(lit(cyl(R, R, H, '#f6e4c4', { y: 3 }, 6), glow('#f6e4c4')))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        g.add(cyl(0.7, 0.7, H, wood, { x: Math.sin(a) * R * 1.03, y: 3, z: Math.cos(a) * R * 1.03 }, 6))
        const ex = Math.sin(a) * R * 1.45
        const ez = Math.cos(a) * R * 1.45
        g.add(rodMesh([Math.sin(a) * R, H + 4, Math.cos(a) * R], [ex, H + 6, ez], 0.5, wood))
        g.add(cyl(0.6, 1.1, 4, '#b8352b', { x: ex, y: H + 1.6, z: ez }, 6))
      }
      g.add(cyl(R * 1.08, R * 1.08, 1.6, wood, { y: H + 3 }, 6))
      g.add(cyl(R * 0.35, R * 1.08, 3, wood, { y: H + 4.6 }, 6))
      g.add(cyl(0.6, 1.2, 6, '#b8352b', { y: -6 }, 8))
      cord(g, H + 7.6, top, wood, 4)
      break
    }
    case 'chandelier': {
      // 水晶吊灯：黄铜中柱、一圈 S 形烛臂、烛焰灯泡、挂一圈水晶坠
      const R = S * 1.05
      const crystal = toon(CRYSTAL, { transparent: 0.6 })
      g.add(latheMesh([[0.001, 0], [2.6, 1], [3.4, 5], [1.6, 9], [2.2, 14], [1, 20]], toon(BRASS), -2))
      const flame = glow('#ffe6b0')
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const ax = Math.sin(a)
        const az = Math.cos(a)
        g.add(tubeMesh([[ax * 2, 2, az * 2], [ax * R * 0.5, -0.5, az * R * 0.5], [ax * R * 0.95, 2, az * R * 0.95], [ax * R, 5, az * R]], 0.55, BRASS))
        g.add(cyl(2, 1.4, 1.4, BRASS, { x: ax * R, y: 5, z: az * R }, 12))
        g.add(cyl(1, 1, 4.5, '#f4ede0', { x: ax * R, y: 6.4, z: az * R }, 10))
        g.add(lit(ball(0.9, '#ffe6b0', { x: ax * R, y: 11.8, z: az * R }, [1, 1.7, 1]), flame, false))
        const d = ball(0.7, CRYSTAL, { x: Math.sin(a + 0.52) * R * 0.75, y: -1.8, z: Math.cos(a + 0.52) * R * 0.75 }, [1, 1.8, 1])
        d.material = crystal
        g.add(d)
      }
      const d0 = ball(1.4, CRYSTAL, { y: -3.6 }, [1, 1.6, 1])
      d0.material = crystal
      g.add(d0)
      g.add(hRing(R * 0.45, 0.35, BRASS, 8))
      cord(g, 18, top, BRASS, 4)
      break
    }
    case 'crystal-flush': {
      // 古典水晶吸顶：乳白圆罩 + 金边 + 一圈水晶坠
      const R = S * 0.85
      const H = Math.max(3, top - 3)
      g.add(lit(cyl(R * 0.82, R * 0.9, H, '#fbf3e6', { y: 1.4 }, 32), glow('#fbf3e6')))
      g.add(hRing(R * 0.92, 0.6, BRASS, 1.4))
      g.add(hRing(R * 0.84, 0.5, BRASS, H + 1.4))
      g.add(cyl(R * 0.3, R * 0.3, 1.6, BRASS, { y: H + 1.4 }, 24))
      const crystal = toon(CRYSTAL, { transparent: 0.6 })
      const n = small ? 8 : 14
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2
        const d = ball(small ? 0.5 : 0.8, CRYSTAL, { x: Math.sin(a) * R * 0.92, y: -0.4, z: Math.cos(a) * R * 0.92 }, [1, 1.8, 1])
        d.material = crystal
        g.add(d)
      }
      g.add(ball(1.2, BRASS, { y: 0.8 }))
      break
    }
    case 'wagon-wheel': {
      // 乡村铁艺马车轮吊灯：水平铁圈 + 辐条 + 圈上一圈烛泡，四根吊链
      const R = S * 1.25
      g.add(hRing(R, 0.9, IRON, 0))
      g.add(hRing(R * 0.25, 0.7, IRON, 0))
      const flame = glow('#ffe6b0')
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        g.add(rodMesh([Math.sin(a) * R * 0.25, 0, Math.cos(a) * R * 0.25], [Math.sin(a) * R, 0, Math.cos(a) * R], 0.5, IRON))
        if (k % 2 === 0) {
          const x = Math.sin(a + 0.39) * R
          const z = Math.cos(a + 0.39) * R
          g.add(cyl(1.6, 1.2, 1.2, IRON, { x, y: 0.6, z }, 10))
          g.add(cyl(0.9, 0.9, 4, '#efe6d4', { x, y: 1.8, z }, 8))
          g.add(lit(ball(0.9, '#ffe6b0', { x, y: 6.8, z }, [1, 1.7, 1]), flame, false))
        }
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 8
        g.add(rodMesh([Math.sin(a) * R * 0.97, 0.5, Math.cos(a) * R * 0.97], [0, 22, 0], 0.25, IRON))
      }
      g.add(ball(1.4, IRON, { y: 22 }))
      g.add(lit(ball(2.4, WARM_BULB, { y: 4 }), glow(WARM_BULB), false))
      cord(g, 22, top, IRON, 4)
      break
    }
    case 'hex-lantern': {
      // 乡村六角罩吊灯：铁框六角灯笼，玻璃发光，尖顶
      const R = S * 0.58
      const H = R * 1.7
      g.add(cyl(R * 1.05, R * 0.6, 2, IRON, {}, 6))
      g.add(lit(cyl(R, R * 0.92, H, '#fff0c8', { y: 2 }, 6), glow('#fff0c8')))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        g.add(rodMesh([Math.sin(a) * R * 0.95, 2, Math.cos(a) * R * 0.95], [Math.sin(a) * R * 1.03, H + 2, Math.cos(a) * R * 1.03], 0.45, IRON))
      }
      g.add(cyl(R * 0.3, R * 1.2, R * 0.6, IRON, { y: H + 2 }, 6))
      g.add(torus(2, 0.4, IRON, { y: H + 2 + R * 0.6 + 2 }))
      cord(g, H + 2 + R * 0.6 + 4, top, IRON, 4)
      break
    }
    default: {
      if (s.kind === 'ceiling' || s.kind === 'small') {
        const r = s.kind === 'ceiling' ? 24 : 13
        const dome = cyl(r * 0.92, r, r * 0.26, '#fff6e6')
        dome.material = glow('#fff6e6')
        g.add(dome)
        g.add(cyl(r * 0.55, r * 0.55, 2, rim, { y: r * 0.26 }))
      } else if (s.kind === 'pendant') {
        const m = glow('#fff6e6')
        g.add(cyl(0.5, 0.5, top - 16, '#3d3f44', { y: 16 }))
        g.add(cyl(5, 5, 1.6, '#3d3f44', { y: top - 1.6 }))
        // 灯罩：上小下大的圆台，开口朝下；灯泡露出一点
        // 布灯罩：夜里从里面透出光（和灯泡共用发光材质）
        g.add(lit(cyl(5, 19, 16, '#f2e6cf', {}, 28), m))
        g.add(lit(ball(5.5, '#fff3dc', { y: 2 }), m))
        // 灯罩内侧（下面看上去是亮的）
        g.add(lit(cyl(4, 17.5, 0.6, '#fff3dc', { y: 0.2 }, 28), m, false))
      } else if (s.kind === 'counter') {
        const L = s.len ?? 90
        g.add(lit(rbox(L, 3, 9, '#fff6e6', {}, 1.2), glow('#fff6e6')))
        g.add(rbox(L + 2, 1.5, 11, rim, { y: 3 }, 0.6))
      } else {
        // 阳台壁灯：贴墙的底座 + 方形灯罩
        g.add(rbox(10, 16, 3, '#3d3f44', { z: -8 }, 1))
        g.add(lit(rbox(11, 13, 11, '#fff6e6', { y: 1.5, z: 0 }, 2), glow('#fff6e6')))
        g.add(rbox(13, 2, 13, '#3d3f44', { y: 14.5, z: 0 }, 0.8))
      }
    }
  }
  addOutlines(g)
  g.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
  })
  return { obj: g, glows }
}

// ---------- 管理器 ----------

/** 房间灯的发光材质和它的原色 */
interface RigGlow {
  mat: THREE.MeshToonMaterial
  color: THREE.Color
}

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
  /**
   * 多层户型：房间所在楼层的抬升高度（楼层 elevation + 分层拉开的偏移），null = 这一层隐藏（灯具淡出、不打光）。
   * 房间灯的规格（RoomLightSpec）都是按本层地面算的，这里统一加上。单层户型不设，等于 0。
   */
  private liftOf: ((roomId: string | null) => number | null) | null = null
  /** 房间编号图（lightMask.ts）与它的指纹 */
  private mask: LightMaskMap | null = null
  private maskKey = ''

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
        const R = Math.max(120, Math.sqrt(area(room.points) / Math.PI) * 1.25)
        decal = poolDecal(room.points, s.x, s.y, R, floorY(room) + 0.4)
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
          lamp.decal.position.y = this.liftOf?.(room!.id) ?? 0
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
    const cands: Cand[] = []
    for (const rig of this.rooms.values()) {
      const s = rig.spec
      const lv = rig.level
      const e = lv * lv * (3 - 2 * lv)
      for (const g of rig.glows) {
        g.mat.emissiveIntensity = 0.15 + 0.4 * e * Math.min(1.2, power)
        tintGlow(g.mat.emissive, g.color, rig.kelvin, e)
      }
      const hidden = this.hiddenRoom(s.roomId)
      if (rig.decal) {
        const m = rig.decal.material as THREE.MeshBasicMaterial
        m.color.copy(rig.kelvin)
        m.opacity = 0.06 * e * power
        rig.decal.visible = e > 0.01 && !hidden
      }
      if ((rig.target > 0 || lv > 0) && !hidden) {
        const pri = (s.primary ? 2e6 : 1e6) + Math.min(9e5, s.distance * s.distance * 0.01)
        cands.push({ pri, x: s.x, y: s.h + (this.liftOf?.(s.roomId) ?? 0), z: s.y, color: rig.kelvin, i: s.intensity * e * power, d: s.distance, room: s.roomId })
      }
    }
    // 灯具家具：每个房间离房间中心近的前 N 盏打光，其余只发光
    const byRoom = new Map<string, { l: Lamp; d: number }[]>()
    for (const l of this.lamps.values()) {
      const e = l.level * l.level * (3 - 2 * l.level)
      const kel = this.kelvinOfRoom(l.roomId)
      for (const g of l.glows) {
        g.mat.emissiveIntensity = glowIntensity(g.base, night, e, g.color.r * 0.3 + g.color.g * 0.59 + g.color.b * 0.11, g.area)
        tintGlow(g.mat.emissive, g.color, kel, e)
      }
      const hidden = this.hiddenRoom(l.roomId)
      if (l.decal) {
        const m = l.decal.material as THREE.MeshBasicMaterial
        m.color.copy(kel)
        m.opacity = 0.05 * e * power
        l.decal.visible = e > 0.01 && !hidden
      }
      if (!(l.target > 0 || l.level > 0) || !this.lampsPerRoom || hidden) continue
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
        cands.push({ pri: 5e5 + l.intensity * 1000, x: w.x, y: w.y, z: w.z, color: this.kelvinOfRoom(l.roomId), i: l.intensity * e * power, d: l.distance, room: l.roomId })
      }
    }
    cands.sort((a, b) => b.pri - a.pri)
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
      pl.distance = c.d
      anyOn = true
      const m = c.room ? this.mask?.rooms.get(c.room) : undefined
      setLightMaskLight(i, m?.floor ?? 0, m?.group ?? 0, !m)
    })
    setLightMaskEnabled(anyOn)
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
      if (!hide && dir && depth !== null) hide = s > depth + 30
      o.userData.target = hide ? 1 : 0
    }
  }

  /** 3D 里点中的天花板灯具 → 房间 id */
  pickRoom(ray: THREE.Raycaster) {
    const hit = ray.intersectObject(this.fixtures, true).find((h) => h.object.visible && !h.object.userData.isOutline && !this.hiddenRoom(lightRoomOf(h.object)))
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
  for (const m of meshes) {
    if (!isGlow(m.material as THREE.Material)) continue
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
