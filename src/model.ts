// 坐标单位：厘米。房间多边形按墙中心线定义。

import type { PatternSpec } from './three/patterns'
import type { Household } from './household'
import { lang, t } from './i18n'

export interface Vec {
  x: number
  y: number
}

export type RoomKind =
  | 'ldk'
  | 'kitchen'
  | 'dining'
  | 'western'
  | 'japanese'
  | 'wash'
  | 'bath'
  | 'toilet'
  | 'hall'
  | 'entrance'
  | 'storage'
  | 'balcony'
  | 'other'

export const ROOM_KINDS: Record<RoomKind, { label: string; fill: string }> = {
  ldk: { label: 'LDK', fill: '#f3e6cf' },
  kitchen: { label: 'キッチン', fill: '#f1e2c8' },
  dining: { label: '餐厅', fill: '#f2e4cc' },
  western: { label: '洋室', fill: '#e4ecf2' },
  japanese: { label: '和室', fill: '#e6edd5' },
  wash: { label: '洗面所', fill: '#dcefee' },
  bath: { label: '浴室', fill: '#cfe7ec' },
  toilet: { label: 'トイレ', fill: '#dcefee' },
  hall: { label: '廊下', fill: '#efebe4' },
  entrance: { label: '玄関', fill: '#e2ddd3' },
  storage: { label: '収納', fill: '#e9e4ea' },
  balcony: { label: 'バルコニー', fill: '#f4f2ee' },
  other: { label: '其他', fill: '#eeeeee' },
}

export interface Room {
  id: string
  name: string
  kind: RoomKind
  points: Vec[]
  /** 内墙墙纸：纯色或花纹；不填用默认的米白墙 */
  wallpaper?: Wallpaper
  /** 窗帘颜色（窗帘随窗户自动生成，宽度跟窗走）；false = 不挂 */
  curtain?: string | false
  /** 仅阳台：外缘扶手墙的样式，不填 = mixed（旧存档的样子） */
  railing?: RailingKind
  /** 仅玄关：地面和室内齐平（中式 / 欧美的入户，不做日式土间的下沉） */
  flush?: boolean
  /** 敞开分组：同组的相邻房间之间不砌墙（中式客餐厅、欧美开放式 living / dining / kitchen） */
  openGroup?: string
  /** 房间灯：auto（缺省）= 跟随全局（入夜自动亮）；on / off 强制开关（3D 沙盘，见 three/lights.ts） */
  light?: 'auto' | 'on' | 'off'
  /** 房间灯色温（K），不填跟随全局 */
  lightK?: number
}

/**
 * 阳台扶手墙：concrete 混凝土腰墙（压顶 + 排水沟）；glass 磨砂玻璃面板 + 金属扶手；bars 竖条金属栏杆；
 * louver 百叶；mixed 混凝土腰墙 + 上部磨砂玻璃 + 扶手
 */
export type RailingKind = 'concrete' | 'glass' | 'bars' | 'louver' | 'mixed'
export const RAILING_KINDS: Record<RailingKind, string> = {
  concrete: '混凝土腰墙',
  glass: '磨砂玻璃 + 扶手',
  bars: '竖条金属栏杆',
  louver: '百叶式',
  mixed: '腰墙 + 玻璃扶手',
}

export interface Wallpaper {
  color: string
  pattern?: PatternSpec
  /** 墙面上下的边饰 */
  trim?: WallTrim
}

/**
 * 墙面边饰（沿房间内侧墙面一圈，门洞处断开）：
 *   base 踢脚线（幅木）；wainscot 腰壁（下半截护墙板 + 顶上一道压条，batten = 竖向压条板）；crown 顶角线（廻り縁）。
 */
export interface WallTrim {
  base?: { h: number; color: string }
  wainscot?: { h: number; color: string; kind: 'plain' | 'batten' }
  crown?: { h: number; color: string }
}

/** door = 开门；sliding = 引き戸 / 襖（两扇推拉）；folding = 折れ戸（收纳、浴室）；window = 窗 */
export type OpeningKind = 'door' | 'sliding' | 'folding' | 'window'

export const OPENING_LABELS: Record<OpeningKind, string> = {
  door: '开门',
  sliding: '引き戸（推拉）',
  folding: '折れ戸（折叠）',
  window: '窗',
}

export interface Opening {
  id: string
  kind: OpeningKind
  roomId: string
  /** 所在边：points[edge] → points[edge+1] */
  edge: number
  /** 开口中心到边起点的距离 */
  offset: number
  width: number
  /** 门铰链在开口的哪一端 */
  hinge: 'start' | 'end'
  /** in = 开向本房间内，out = 开向外侧 */
  swing: 'in' | 'out'
}

/**
 * 固定设备。x/y 为中心；局部坐标里「背面」朝 -y（贴墙一侧），
 * rot 为顺时针角度（0/90/180/270）。
 * washer / fridge 是「洗衣机位 / 冰箱位」：只是预留的空间（防水盘、冰箱的位置），机器本身是家具（family washer / fridge）。
 */
export type FixtureKind = 'kitchen' | 'bathtub' | 'toilet' | 'basin' | 'washer' | 'fridge' | 'ps' | 'outdoor' | 'builtin'
export type KitchenVariant = 'wall' | 'facing'
export type ToiletType = 'basic' | 'washlet' | 'tankless'
export type BuiltinType = 'shoe' | 'closet' | 'pantry'
export const BUILTIN_TYPES: Record<BuiltinType, string> = { shoe: '鞋柜（下駄箱）', closet: '壁内收纳', pantry: '食品柜' }
export const TOILET_TYPES: Record<ToiletType, string> = { basic: '普通（水箱）', washlet: '温水洗净', tankless: '无水箱一体（高级）' }

export interface Fixture {
  id: string
  kind: FixtureKind
  /** 仅厨房使用 */
  variant?: KitchenVariant
  /** 仅厨房：灶头数，不填按台面长度（< 200cm 两口，否则三口） */
  burners?: 2 | 3
  /** 仅对面式厨房：做成中岛（靠墙一侧是带灶和吊柜的操作台，房间一侧是带水槽的岛台，出挑可放吧凳） */
  island?: boolean
  /** 仅厨房：台面下嵌洗碗机 */
  dishwasher?: boolean
  /** 仅厨房：电磁炉 / 电陶炉（黑色微晶面板），不填是燃气灶 */
  induction?: boolean
  /** 仅浴缸：淋浴房（方形淋浴底盘 + 玻璃隔断，没有浴缸） */
  shower?: boolean
  /** 仅马桶：basic 普通水箱 / washlet 温水洗净（默认）/ tankless 无水箱一体 */
  toiletType?: ToiletType
  /** 仅空调外机：叠放在哪台外机上面（二段置き架台），不填就是放在地上 */
  stackOn?: string
  /**
   * @deprecated 旧存档：冰箱、洗衣机以前是带款式的设备（'2door' | '3door' | 'french' | 'side' | 'retro' / 'drum' | 'top' | 'compact' | 'stack' | 'twin' | 'pair'）。
   * 现在设备只是「冰箱位 / 洗衣机位」，机器是素材库里的家具；读档时 migrate.ts 把它换成同款家具后删掉这个字段。
   */
  style?: string
  /** @deprecated 旧存档：冰箱、洗衣机的机身颜色，迁移时转成家具的配色 */
  color?: string
  /** 仅内置收纳：类型 */
  builtinType?: BuiltinType
  /** 仅内置收纳：嵌在墙里（柜门和墙面齐平，柜体伸进墙后的空间，不占房间） */
  recessed?: boolean
  /** 仅内置收纳：柜门打开（露出里面的层板，可以往里放东西） */
  open?: boolean
  x: number
  y: number
  /** 沿墙长度 */
  w: number
  /** 进深；厨房由 variant 决定，其余缺省取 FIXTURES 默认值 */
  d?: number
  rot: number
}

/** front：正前方要留给人站立 / 开门的使用空间进深 */
export const FIXTURES: Record<FixtureKind, { label: string; w: number; d: number; front: number }> = {
  kitchen: { label: '厨房', w: 255, d: 65, front: 80 },
  bathtub: { label: '浴缸', w: 140, d: 75, front: 0 },
  toilet: { label: '马桶', w: 40, d: 70, front: 45 },
  basin: { label: '洗面台', w: 75, d: 55, front: 55 },
  washer: { label: '洗衣机位', w: 64, d: 64, front: 50 },
  fridge: { label: '冰箱位', w: 65, d: 65, front: 60 },
  ps: { label: 'PS 管道井', w: 50, d: 50, front: 0 },
  outdoor: { label: '空调外机', w: 80, d: 30, front: 0 },
  builtin: { label: '内置收纳', w: 90, d: 38, front: 0 },
}

/** 厨房各段进深：壁付け只有主台面；対面 = 背面食器棚 + 通道 + 主台面 */
export const KITCHEN = { counter: 65, back: 45, aisle: 90 }

export function fixtureDepth(f: Pick<Fixture, 'kind' | 'variant' | 'd'>) {
  if (f.kind === 'kitchen') return f.variant === 'facing' ? KITCHEN.back + KITCHEN.aisle + KITCHEN.counter : KITCHEN.counter
  return f.d ?? FIXTURES[f.kind].d
}

/** 设备的世界坐标包围盒（rot 只取 90 的倍数） */
export function fixtureBox(f: Fixture) {
  const d = fixtureDepth(f)
  const vertical = Math.round(f.rot / 90) % 2 === 1
  const hw = (vertical ? d : f.w) / 2
  const hh = (vertical ? f.w : d) / 2
  return { x0: f.x - hw, y0: f.y - hh, x1: f.x + hw, y1: f.y + hh }
}

/** 使用空间进深：対面厨房的通道已经含在自身尺寸里 */
export function fixtureFront(f: Pick<Fixture, 'kind' | 'variant'>) {
  if (f.kind === 'kitchen' && f.variant === 'facing') return 0
  return FIXTURES[f.kind].front
}

/** 设备正前方的使用空间（世界坐标包围盒）；没有则为 null */
export function frontBox(f: Fixture) {
  const front = fixtureFront(f)
  if (front <= 0) return null
  const d = fixtureDepth(f)
  // 局部 +y 方向（离墙）旋转到世界坐标
  const a = (f.rot * Math.PI) / 180
  const fx = -Math.sin(a)
  const fy = Math.cos(a)
  const vertical = Math.round(f.rot / 90) % 2 === 1
  const half = f.w / 2
  const c = { x: f.x + fx * (d / 2 + front / 2), y: f.y + fy * (d / 2 + front / 2) }
  const hw = vertical ? front / 2 : half
  const hh = vertical ? half : front / 2
  return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh }
}

/** 背面朝向 out（单位轴向量）时的 rot */
export function rotFacingWall(out: Vec) {
  if (out.y > 0.5) return 180
  if (out.x > 0.5) return 90
  if (out.x < -0.5) return 270
  return 0
}

/**
 * 可移动家具（3D 沙盘用）。asset 对应素材库里的 id；x/y 为中心，
 * rot 为顺时针角度（任意值），局部坐标里背面朝 -y，和设备一致。
 */
export interface Furniture {
  id: string
  asset: string
  x: number
  y: number
  rot: number
  /** 配色方案序号 */
  color?: number
  /** 自定义配色：逐槽覆盖预设（[主色, 副色, 点缀色, …]），不填就用预设 */
  colors?: string[]
  /** 布艺花纹：按配色槽给（下标同 colors），null / 不填 = 纯色 */
  patterns?: (PatternSpec | null)[]
  /** 离房间地面的高度：摆在桌面上的东西 = 桌面高度；地上的为 0 / 不填 */
  z?: number
  /** 仅灯具：强制开 / 关；不填 = 跟随所在房间的灯 */
  light?: 'on' | 'off'
}

export interface Plan {
  version: 1
  /** 冰箱、洗衣机已经是家具（摆在冰箱位 / 洗衣机位上）。没有这个标记的是旧存档：读取时给每个位补上原来的默认款 */
  appliancesAsFurniture?: true
  name: string
  /** 户内隔墙厚 */
  wall: number
  /** 外墙 / 户境墙（躯体）厚 */
  wallOuter: number
  rooms: Room[]
  openings: Opening[]
  fixtures: Fixture[]
  furniture: Furniture[]
  /** 住户设定：一键布置按它来分配房间、选风格和摆兴趣物品 */
  household?: Household
  /** 户型的地区风格：jp 日式（缺省，旧存档都是）/ cn 中式 / west 欧美；影响检查清单、一键布置和住户 */
  region?: Region
  /** 朝向：平面图上「北」相对画面上方顺时针转过的角度（度）；缺省 0 = 上北下南。3D 沙盘按它算太阳方位 */
  north?: number
  /** 这份户型来自「我的户型」里的哪份存档（打开 / 保存时写入；撤销到打开之前就没有了，避免误覆盖） */
  savedId?: string
}

export type Region = 'jp' | 'cn' | 'west'
export const REGION_LABELS: Record<Region, string> = { jp: '日式', cn: '中式', west: '欧美' }
export const regionOf = (p: Pick<Plan, 'region'>): Region => p.region ?? 'jp'

// 日本マンション常用：1帖 = 1.62㎡
export const JO = 1.62

let idSeq = 0
export function uid(prefix: string) {
  idSeq++
  return `${prefix}${Date.now().toString(36)}${idSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ---------- 几何 ----------

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l }
}

export function signedArea(pts: Vec[]) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export const area = (pts: Vec[]) => Math.abs(signedArea(pts))

export function perimeter(pts: Vec[]) {
  let s = 0
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length])
  return s
}

export function centroid(pts: Vec[]): Vec {
  const A = signedArea(pts)
  if (Math.abs(A) < 1e-6) {
    const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 })
    return mul(s, 1 / pts.length)
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const f = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * f
    cy += (a.y + b.y) * f
  }
  return { x: cx / (6 * A), y: cy / (6 * A) }
}

export function pointInPolygon(p: Vec, pts: Vec[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 两个盒子是否重叠（贴边、1cm 以内的擦边不算） */
export const boxOverlaps = (a: Box, b: Box) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1

export function boxDist(p: Vec, b: Box) {
  const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1)
  const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1)
  return Math.hypot(dx, dy)
}

export const inBox = (p: Vec, b: Box) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1

export function bbox(pts: Vec[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x0, y0, x1, y1 }
}

/** 房间标签位置：形心在内部就用形心，否则在包围盒中线上找内部最宽处的中点 */
export function labelPoint(pts: Vec[]): Vec {
  const c = centroid(pts)
  if (pointInPolygon(c, pts)) return c
  const b = bbox(pts)
  let best = c
  let bestW = -1
  for (let k = 1; k < 20; k++) {
    const y = b.y0 + ((b.y1 - b.y0) * k) / 20
    const xs: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const q = pts[(i + 1) % pts.length]
      if (a.y > y !== q.y > y) xs.push(a.x + ((y - a.y) * (q.x - a.x)) / (q.y - a.y))
    }
    xs.sort((m, n) => m - n)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i]
      if (w > bestW) {
        bestW = w
        best = { x: (xs[i] + xs[i + 1]) / 2, y }
      }
    }
  }
  return best
}

/**
 * 避开障碍物的标签位置：在房间内网格采样，取离墙和障碍盒都最远的点。
 * 用于放了厨房等设备的房间。
 */
export function labelPointAvoiding(pts: Vec[], boxes: Box[]): Vec {
  const base = labelPoint(pts)
  if (!boxes.length) return base
  const b = bbox(pts)
  const obstacleDist = (p: Vec) => Math.min(...boxes.map((q) => boxDist(p, q)))
  const edgeDist = (p: Vec) => {
    let m = Infinity
    for (let i = 0; i < pts.length; i++) m = Math.min(m, projectToSegment(p, pts[i], pts[(i + 1) % pts.length]).d)
    return m
  }
  if (obstacleDist(base) > 40) return base
  let best = base
  let bestScore = -Infinity
  const N = 16
  for (let i = 1; i < N; i++)
    for (let j = 1; j < N; j++) {
      const p = { x: b.x0 + ((b.x1 - b.x0) * i) / N, y: b.y0 + ((b.y1 - b.y0) * j) / N }
      if (!pointInPolygon(p, pts)) continue
      // 文字是横向的，离墙距离加权，避免贴墙
      const score = Math.min(edgeDist(p) * 1.5, obstacleDist(p))
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
  return best
}

export interface EdgeInfo {
  a: Vec
  b: Vec
  length: number
  /** 单位方向 a→b */
  dir: Vec
  /** 单位外法线 */
  out: Vec
}

/** s：多边形绕向（+1 / -1），决定外法线朝哪边 */
function edgeWithSign(pts: Vec[], i: number, s: number): EdgeInfo {
  const a = pts[i]
  const b = pts[(i + 1) % pts.length]
  const d = sub(b, a)
  const dir = norm(d)
  return { a, b, length: len(d), dir, out: { x: dir.y * s, y: -dir.x * s } }
}

const windingSign = (pts: Vec[]) => (signedArea(pts) >= 0 ? 1 : -1)

export function edgeInfo(pts: Vec[], i: number): EdgeInfo {
  return edgeWithSign(pts, i, windingSign(pts))
}

/** 一次取出所有边（绕向只算一次；遍历所有边时用它，别逐条调 edgeInfo） */
export function edgesOf(pts: Vec[]): EdgeInfo[] {
  const s = windingSign(pts)
  return pts.map((_, i) => edgeWithSign(pts, i, s))
}

export const isAxisEdge = (e: { dir: Vec }) => Math.abs(e.dir.x) > 0.999 || Math.abs(e.dir.y) > 0.999

/** 点是否在多边形边界上 */
export function onBoundary(pts: Vec[], p: Vec, tol = 1) {
  return edgesOf(pts).some((e) => projectToSegment(p, e.a, e.b).d < tol)
}

/** 门窗的几何：所在房间、所在边、中心点；数据失效时为 null */
export function openingGeom(rooms: Room[], o: Opening) {
  const owner = rooms.find((r) => r.id === o.roomId)
  if (!owner || o.edge >= owner.points.length) return null
  const e = edgeInfo(owner.points, o.edge)
  return { owner, e, center: add(e.a, mul(e.dir, o.offset)) }
}

/** 开在 room 边界上的所有门窗（含邻居挂在共用墙上的） */
export function openingsOn(room: Room, plan: Pick<Plan, 'rooms' | 'openings'>) {
  return plan.openings.flatMap((o) => {
    const g = openingGeom(plan.rooms, o)
    return g && onBoundary(room.points, g.center) ? [{ o, ...g }] : []
  })
}

/** SVG 路径：多边形或折线 */
export const polyPath = (pts: Vec[], closed = true) => 'M' + pts.map((p) => `${p.x},${p.y}`).join('L') + (closed ? 'Z' : '')

/** 点到线段投影：t 为沿线段的距离 */
export function projectToSegment(p: Vec, a: Vec, b: Vec) {
  const d = sub(b, a)
  const L = len(d)
  if (L < 1e-9) return { t: 0, d: dist(p, a), point: a }
  const u = mul(d, 1 / L)
  const t = Math.max(0, Math.min(L, dot(sub(p, a), u)))
  const point = add(a, mul(u, t))
  return { t, d: dist(p, point), point }
}

export function isAxisRect(pts: Vec[]) {
  if (pts.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return false
  }
  return true
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number): Vec[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

export function fmtArea(cm2: number) {
  const m2 = cm2 / 10000
  return `${m2.toFixed(2)}㎡`
}

/** 房间面积的常用写法：日式按帖（中文界面写「叠」），中式 / 欧美按平方米 */
export function fmtRoomArea(cm2: number, region?: Plan['region']) {
  return !region || region === 'jp' ? fmtJo(cm2) : fmtArea(cm2)
}

export function fmtJo(cm2: number) {
  // 中文界面写「叠」（帖 / 畳 的中文说法），日文、英文走词典（帖 / jo）
  const n = (cm2 / 10000 / JO).toFixed(1)
  return lang.value === 'zh' ? `${n}叠` : t('{n}帖', { n })
}

export function emptyPlan(): Plan {
  return { version: 1, appliancesAsFurniture: true, name: t('未命名户型'), wall: 10, wallOuter: 18, rooms: [], openings: [], fixtures: [], furniture: [] }
}
