// 两层户建 / 复式公寓生成（日式戸建て、欧美 two-story house、中式独栋别墅；日式 / 中式复式）。
//
// 朝向约定同平层：y = 0 一侧朝南（院子、2F 阳台），y = D 一侧是入户（北，临路）。
// 骨架（镜像之前，x 往东）：
//
//   y=D  ┌──────┬────┬────┬────────┬──────┬────┐
//        │ 核心 │ 列 │填充│ 楼梯   │ 入口 │ 侧 │  北带 dN（U 形楼梯的进深 = dN）
//        │(上下 ├────┴────┴──┐ ↑↓  └──────┴────┤
//        │ 两间)│   走廊带 hw（和楼梯区合成一个 T 形走廊）│
//   y=dS ├──────┴────────────┴───────────────────┤
//        │          南带 dS：1F 起居 / 2F 卧室    │
//   y=0  └────────────────────────────────────────┘
//
//   1F：核心 = 日式 浴室(北) + 洗面所(南) / 欧美 Laundry / 中式 厨房；列 = 厕所 / Half Bath / 卫生间；
//       填充 = 收纳（北带宽度有富余时才有）；入口 = 玄关（和走廊敞开）；侧 = 鞋帽间（可选，门开向玄关）。
//       南带 = LDK（+ 和室）/ Kitchen + Dining + Living（开放）/ 餐厅 + 客厅（+ 老人房）。
//   2F：核心位置（总二阶时）= WIC / Primary Bath / 主卫（后两者门开向南边的主卧）；列 = 厕所 / WIC / 公卫，
//       正好叠在 1F 用水区上方；楼梯洞口在 2F 走廊里（U 形楼梯的起步和出梯口在同一端，都朝走廊带）；
//       入口上方 = 东侧房间（卧室 / 纳戸 / 公卫…）；南带 = 卧室并排，2F 南侧挑出阳台（悬挑，不计入外轮廓）。
//   部分二阶：2F 去掉核心那一列（1F 浴室 / 洗面所上方露出，盖单坡屋顶）。复式：没有用地和屋顶，2F 南带客厅上方是挑空。
//
// 用 createCtx 的随机序列，同一种子结果可复现；面积 / 合规不过关时 generateHouseWithArea 往后试种子（和平层同一套路）。

import { orientDoors } from './doors'
import { placeOnWall, placePair, firstDoorCenter, type PlaceSpec } from './place'
import { JO, area, bbox, edgesOf, add, mul, pointInPolygon, rectPoints, type Exterior, type FenceKind, type Fixture, type Opening, type OpeningKind, type Plan, type Region, type Room, type RoomKind, type Site, type Vec } from './model'
import { WALL, WALL_OUTER, createCtx, planArea, planViolations, type Ctx } from './generate'
import { bedroomCloset, placeBathroom, placeKitchen, roomLinks, shoeCabinet } from './generate-band'
import { isIndoor, sharedIntervals } from './walls'
import { DEFAULT_FLOOR_H, SLAB, floorOf, floorView, planFloors, stampFloor } from './floors'
import { stairHoleConflicts, stairLinks } from './stairs'
import { jp, t } from './i18n'

export type Dwelling = 'apartment' | 'house' | 'duplex'
export const DWELLING_LABELS: Record<Dwelling, string> = { apartment: '公寓', house: '户建', duplex: '复式' }

type Side = 'n' | 's' | 'w' | 'e'

interface CellDef {
  kind: RoomKind
  name: string
  /** 门开向哪：hall 走廊（缺省）/ n s w e 那一侧相邻的房间 / none 不开 / open 和走廊同属敞开组（不砌墙） */
  door?: 'hall' | Side | 'none' | 'open'
  doorKind?: OpeningKind
  doorW?: number
  swing?: Opening['swing']
  /** 外墙上的窗：哪一侧、多宽（那一侧不是外墙就不开） */
  win?: Partial<Record<Side, number>>
  /** 摆设备时的角色 */
  tag?: string
  flush?: boolean
}

interface SouthDef extends CellDef {
  min: number
  max: number
  /** 吃掉剩余宽度 */
  fill?: boolean
}

export interface HouseGenOpts {
  seed: number
  region: Region
  dwelling: 'house' | 'duplex'
  bedrooms: 'random' | 1 | 2 | 3 | 4 | 5
  minArea: number | null
  maxArea: number | null
}

interface Placed {
  def: CellDef
  room: Room
  floor: '1f' | '2f'
}

export interface HouseLayout {
  c: Ctx
  plan: Plan
  placed: Placed[]
  /** 要的卧室数（合规检查用：没凑够就换种子） */
  want: number
}

const F1 = '1f'
const F2 = '2f'

// ---------------------------------------------------------------------------
// 地区方案
// ---------------------------------------------------------------------------

interface Dims {
  dS: number
  hw: number
  dN: number
  /** 核心列宽 */
  wC: number
  /** 核心北间（日式浴室）的进深；0 = 核心是一整间 */
  dB: number
  /** 列宽 */
  wT: number
  /** 入口宽 */
  wG: number
  /** 侧间宽（0 = 没有） */
  wSC: number
  W: number
}

interface Program {
  region: Region
  /** 1F 起居的敞开组：走廊也加进去（欧美 / 中式），日式走廊有门 */
  group?: string
  hallName: string
  dims: (c: Ctx, n: number) => Dims
  core: { north?: CellDef; south: CellDef }
  col: CellDef
  filler: CellDef
  entry: CellDef
  side: CellDef
  /** 1F 南带（从西往东），以及其中有几间卧室 */
  south1: (c: Ctx, n: number, duplex: boolean) => { cells: SouthDef[]; beds: number }
  /** 2F 核心位置的房间（总二阶时）；masterSuite = 门开向南边的主卧 */
  nw2: CellDef
  col2: CellDef
  filler2: CellDef
  /** 2F 东侧（入口上方）：给定宽度和要不要当卧室，返回从西往东的房间与宽度 */
  east2: (c: Ctx, w: number, bed: string | null) => { def: CellDef; w: number }[]
  /** 2F 第 i 间卧室（0 = 主卧）的名字 */
  bedName: (i: number) => string
  /** 主卧的最小开间（主卫在北侧时要给走廊门留位置） */
  masterMin: (d: Dims) => number
  /** 2F 南带最多几间卧室 */
  maxSouth: number
  /** 东侧房间可以当卧室 */
  eastBed: boolean
  partial: number
  balcony: ((c: Ctx) => { name: string; depth: number; railing: Room['railing']; span: 'master' | 'two' | 'all' }) | null
  exterior: (c: Ctx) => Exterior
  fence: (c: Ctx) => FenceKind
  name: (n: number, extra: { partial: boolean; duplex: boolean; area: number; seed: number; beds: number; baths: number }) => string
}

const bedCell = (name: string, win = 165, tag = 'bed'): CellDef => ({ kind: 'western', name, door: 'hall', win: { s: win }, tag })

const JP: Program = {
  region: 'jp',
  hallName: '廊下',
  dims: (c, n) => ({
    dS: c.rint(400, 460),
    hw: c.rint(90, 100),
    dN: c.rint(260, 280),
    wC: c.rint(170, 200),
    dB: c.rint(170, 190),
    wT: c.rint(90, 110),
    wG: c.rint(170, 210),
    wSC: c.chance(0.6) ? c.rint(90, 130) : 0,
    W: n >= 4 ? c.rint(880, 1020) : c.rint(820, 960),
  }),
  core: {
    north: { kind: 'bath', name: '浴室', door: 's', doorKind: 'folding', doorW: 70, win: { w: 70 }, tag: 'jpBath' },
    south: { kind: 'wash', name: '洗面所', door: 'hall', doorKind: 'sliding', doorW: 70, win: { w: 60 }, tag: 'jpWash' },
  },
  col: { kind: 'toilet', name: 'トイレ', door: 'hall', doorKind: 'door', doorW: 65, swing: 'out', win: { n: 50 }, tag: 'toilet' },
  filler: { kind: 'storage', name: '収納', door: 'hall', doorKind: 'folding', doorW: 70 },
  entry: { kind: 'entrance', name: '玄関', tag: 'entry' },
  side: { kind: 'storage', name: 'シューズIN', door: 'w', doorKind: 'door', doorW: 65 },
  south1: (c, n, duplex) => {
    const washitsu = !duplex && (n >= 4 ? c.chance(0.75) : c.chance(0.4))
    const ldk: SouthDef = { kind: 'ldk', name: 'LDK', min: 540, max: 9999, fill: true, door: 'hall', doorKind: 'door', doorW: 80, win: { s: 240, e: 150, w: 150 }, tag: 'kitchenRoom' }
    if (!washitsu) return { cells: [ldk], beds: 0 }
    const wa: SouthDef = { kind: 'japanese', name: '和室', min: 270, max: 360, doorKind: 'sliding', doorW: 160, win: { s: 150 }, tag: 'washitsu' }
    // 和室在西端（浴室这边）还是东端：门开向 LDK
    return c.chance(0.5) ? { cells: [{ ...wa, door: 'e' }, ldk], beds: 1 } : { cells: [ldk, { ...wa, door: 'w' }], beds: 1 }
  },
  nw2: { kind: 'storage', name: 'WIC', door: 'hall', doorKind: 'door', doorW: 70 },
  col2: { kind: 'toilet', name: 'トイレ', door: 'hall', doorKind: 'door', doorW: 65, swing: 'out', win: { n: 50 }, tag: 'toilet' },
  filler2: { kind: 'storage', name: '収納', door: 'hall', doorKind: 'folding', doorW: 70 },
  east2: (_c, w, bed) => [{ def: bed ? { kind: 'western', name: bed, door: 'hall', win: { n: 120, e: 120 }, tag: 'bed' } : { kind: 'storage', name: '納戸', door: 'hall', doorKind: 'door', doorW: 70, win: { n: 60 } }, w }],
  bedName: (i) => `洋室${i + 1}`,
  masterMin: () => 330,
  maxSouth: 3,
  eastBed: true,
  partial: 0.4,
  balcony: (c) => ({ name: 'バルコニー', depth: c.rint(90, 120), railing: c.pick<Room['railing']>(['concrete', 'bars', 'bars', 'louver', 'mixed']), span: c.pick(['master', 'two', 'all'] as const) }),
  exterior: (c) => {
    const roof = c.pick<Exterior['roof']>(['gable', 'gable', 'hip', 'hip', 'shed'])
    return {
      roof,
      roofColor: c.pick(['#4f5866', '#3d4655', '#6b4a3c', '#4b5a4e', '#2f3540']),
      pitch: roof === 'shed' ? 0.3 : c.pick([0.4, 0.45, 0.5]),
      eave: c.rint(40, 60),
      facade: c.chance(0.7) ? 'siding' : 'stucco',
      wallColor: c.pick(['#f2ede3', '#e7dfcf', '#d8d4cc', '#cdd6da', '#f5efe4', '#9aa0a6']),
      trimColor: c.pick(['#ffffff', '#5a4a3e', '#3d434b']),
      porch: 'canopy',
    }
  },
  fence: (c) => c.pick<FenceKind>(['hedge', 'hedge', 'wall', 'fence']),
  name: (n, x) =>
    `${n}LDK ${x.duplex ? jp('メゾネット') : jp('戸建て')}${x.partial ? '·' + jp('部分二階') : ''} ${x.area.toFixed(1)}㎡ #${x.seed}`,
}

const WEST: Program = {
  region: 'west',
  group: 'west-great',
  hallName: 'Hallway',
  dims: (c, n) => ({
    dS: c.rint(430, 500),
    hw: c.rint(110, 120),
    dN: c.rint(270, 290),
    wC: c.rint(190, 230),
    dB: 0,
    wT: c.rint(150, 180),
    wG: c.rint(200, 240),
    wSC: c.chance(0.6) ? c.rint(100, 140) : 0,
    W: n >= 4 ? c.rint(1240, 1360) : c.rint(1040, 1180),
  }),
  core: { south: { kind: 'wash', name: 'Laundry', door: 'hall', doorKind: 'door', doorW: 80, win: { w: 70 }, tag: 'laundry' } },
  col: { kind: 'bath', name: 'Half Bath', door: 'hall', doorKind: 'door', doorW: 70, tag: 'halfBath' },
  filler: { kind: 'storage', name: 'Pantry', door: 'hall', doorKind: 'door', doorW: 70, tag: 'pantry' },
  entry: { kind: 'entrance', name: 'Foyer', flush: true, tag: 'foyer' },
  side: { kind: 'storage', name: 'Closet', door: 'w', doorKind: 'door', doorW: 70 },
  south1: (c) => ({
    cells: [
      { kind: 'kitchen', name: 'Kitchen', min: 340, max: 390, door: 'open', win: { s: 140 }, tag: 'kitchenRoom' },
      { kind: 'dining', name: 'Dining', min: 300, max: 360, door: 'open', win: { s: 160 } },
      { kind: 'ldk', name: 'Living Room', min: 420, max: 9999, fill: true, door: 'open', win: { s: c.rint(240, 300), e: 160 } },
    ],
    beds: 0,
  }),
  nw2: { kind: 'bath', name: 'Primary Bath', door: 's', doorKind: 'door', doorW: 75, win: { w: 70 }, tag: 'primaryBath' },
  col2: { kind: 'storage', name: 'Walk-in Closet', door: 'w', doorKind: 'door', doorW: 70, tag: 'wic' },
  filler2: { kind: 'storage', name: 'Linen', door: 'hall', doorKind: 'door', doorW: 60 },
  east2: (c, w, bed) => {
    const bath: CellDef = { kind: 'bath', name: 'Bath', door: 'hall', doorKind: 'door', doorW: 75, win: { n: 70 }, tag: 'fullBath' }
    if (bed && w >= 520) return [{ def: bath, w: 230 }, { def: { kind: 'western', name: bed, door: 'hall', win: { n: 140, e: 140 }, tag: 'bed' }, w: w - 230 }]
    const bw = Math.min(w, c.rint(220, 250))
    return w - bw >= 90 ? [{ def: bath, w: bw }, { def: { kind: 'storage', name: 'Closet', door: 'hall', doorKind: 'door', doorW: 65 }, w: w - bw }] : [{ def: bath, w }]
  },
  bedName: (i) => (i === 0 ? 'Primary Bedroom' : `Bedroom ${i + 1}`),
  masterMin: (d) => Math.max(380, d.wC + 140),
  maxSouth: 4,
  eastBed: false,
  partial: 0,
  balcony: null,
  exterior: (c) => {
    const brick = c.chance(0.4)
    return {
      roof: c.pick<Exterior['roof']>(['gable', 'gable', 'hip']),
      roofColor: c.pick(['#4a4f57', '#5c4b43', '#3b4250', '#6e6a64']),
      pitch: c.pick([0.5, 0.58, 0.67]),
      eave: c.rint(30, 45),
      facade: brick ? 'brick' : 'siding',
      wallColor: brick ? c.pick(['#b5654c', '#a65a48', '#c27b5e', '#8f5a4a']) : c.pick(['#e9e4d8', '#cfd8dc', '#dfe6dd', '#f1e7d0', '#c8cfd6', '#ece7e0']),
      trimColor: '#ffffff',
      porch: 'porch',
    }
  },
  fence: (c) => c.pick<FenceKind>(['fence', 'fence', 'hedge', 'none']),
  name: (_n, x) => `${t('{n}室{b}卫', { n: x.beds, b: `${x.baths}.5` })} ${t('两层独栋')} ${x.area.toFixed(1)}㎡ #${x.seed}`,
}

const CN: Program = {
  region: 'cn',
  group: 'cn-public',
  hallName: '走廊',
  dims: (c, n) => ({
    dS: c.rint(430, 490),
    hw: c.rint(110, 120),
    dN: c.rint(270, 290),
    wC: c.rint(220, 260),
    dB: 0,
    wT: c.rint(170, 210),
    wG: c.rint(180, 220),
    wSC: c.chance(0.5) ? c.rint(100, 140) : 0,
    W: n >= 5 ? c.rint(1150, 1280) : n >= 4 ? c.rint(1040, 1180) : c.rint(950, 1080),
  }),
  core: { south: { kind: 'kitchen', name: '厨房', door: 's', doorKind: 'sliding', doorW: 80, win: { w: 100 }, tag: 'kitchenRoom' } },
  col: { kind: 'bath', name: '卫生间', door: 'hall', doorKind: 'door', doorW: 75, win: { n: 60 }, tag: 'cnBath1' },
  filler: { kind: 'storage', name: '储藏间', door: 'hall', doorKind: 'door', doorW: 70 },
  entry: { kind: 'entrance', name: '玄关', flush: true, tag: 'entry' },
  side: { kind: 'storage', name: '储藏间', door: 'w', doorKind: 'door', doorW: 70 },
  south1: (c, n, duplex) => {
    const cells: SouthDef[] = [
      { kind: 'dining', name: '餐厅', min: 300, max: 360, door: 'open', win: { s: 150 } },
      { kind: 'ldk', name: '客厅', min: 420, max: 9999, fill: true, door: 'open', win: { s: c.rint(240, 300), e: 150 } },
    ]
    // 四室以上：1F 东端一间老人房（卫生间就在旁边）
    if (!duplex && n >= 4) {
      cells.push({ kind: 'western', name: '卧室', min: 300, max: 350, door: 'hall', win: { s: 150, e: 120 }, tag: 'bed' })
      return { cells, beds: 1 }
    }
    return { cells, beds: 0 }
  },
  nw2: { kind: 'bath', name: '主卫', door: 's', doorKind: 'door', doorW: 75, win: { w: 70 }, tag: 'ensuite' },
  col2: { kind: 'bath', name: '公卫', door: 'hall', doorKind: 'door', doorW: 75, win: { n: 60 }, tag: 'cnBath' },
  filler2: { kind: 'storage', name: '储藏间', door: 'hall', doorKind: 'door', doorW: 70 },
  east2: (_c, w, bed) => [{ def: { kind: 'western', name: bed ?? '书房', door: 'hall', win: { n: 120, e: 120 }, tag: bed ? 'bed' : 'study' }, w }],
  bedName: (i) => ['主卧', '次卧', '儿童房', '次卧2'][i] ?? `次卧${i}`,
  masterMin: (d) => Math.max(360, d.wC + 130),
  maxSouth: 3,
  eastBed: true,
  partial: 0.3,
  balcony: (c) => ({ name: '露台', depth: c.rint(120, 150), railing: c.pick<Room['railing']>(['glass', 'bars', 'concrete']), span: c.pick(['master', 'two', 'all'] as const) }),
  exterior: (c) => {
    const roof = c.pick<Exterior['roof']>(['hip', 'hip', 'gable', 'flat'])
    return {
      roof,
      roofColor: c.pick(['#5a5f66', '#8a4b3c', '#3f4752', '#6d5f52']),
      pitch: c.pick([0.4, 0.45, 0.5]),
      eave: c.rint(40, 60),
      facade: c.pick<Exterior['facade']>(['stucco', 'stucco', 'stucco', 'brick', 'siding']),
      wallColor: c.pick(['#f1ebdf', '#e8e0d0', '#d9d2c3', '#efe7d6', '#cfc8bb']),
      trimColor: c.pick(['#7a6250', '#3f3a36', '#ffffff']),
      porch: c.chance(0.5) ? 'porch' : 'canopy',
    }
  },
  fence: (c) => c.pick<FenceKind>(['wall', 'wall', 'fence', 'hedge']),
  name: (_n, x) => `${t('{n}室两厅', { n: x.beds })}${x.duplex ? t('·复式') : t('·独栋别墅')} ${x.area.toFixed(1)}㎡ #${x.seed}`,
}

const PROGRAMS: Record<Region, Program> = { jp: JP, west: WEST, cn: CN }

/** 某地区能生成的住宅类型：欧美没有复式 */
export const dwellingsFor = (r: Region): Dwelling[] => (r === 'west' ? ['apartment', 'house'] : ['apartment', 'house', 'duplex'])

/** 某地区户建的卧室数选项 */
export const houseBedrooms = (r: Region): number[] => (r === 'cn' ? [3, 4, 5] : [3, 4])

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 若干宽度凑成 total（10 的倍数，最后一个吃掉零头）：按权重分，不低于各自下限 */
function splitWidths(total: number, mins: number[], weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0)
  const ws = weights.map((w, i) => Math.max(mins[i], Math.round((total * w) / sumW / 10) * 10))
  let diff = total - ws.reduce((a, b) => a + b, 0)
  // 多了从宽的里面扣（不低于下限），少了加给第一个
  for (let guard = 0; diff < 0 && guard < 200; guard++) {
    const i = ws.map((w, k) => ({ k, s: w - mins[k] })).sort((a, b) => b.s - a.s)[0].k
    const d = Math.min(-diff, Math.max(0, ws[i] - mins[i]), 10)
    if (d <= 0) break
    ws[i] -= d
    diff += d
  }
  ws[0] += diff
  return ws
}

/** 两个房间的共用边上开门：位置靠近 prefer 点（不给就居中），门框离墙角 15 */
function doorBetween(c: Ctx, a: Room, b: Room, kind: OpeningKind, width: number, swing: Opening['swing'] = 'in', prefer?: Vec) {
  let best: { e: ReturnType<typeof edgesOf>[number]; lo: number; hi: number } | null = null
  for (const e of edgesOf(a.points)) for (const [lo, hi] of sharedIntervals(e, b)) if (!best || hi - lo > best.hi - best.lo) best = { e, lo, hi }
  if (!best) return false
  const { e, lo, hi } = best
  const w = Math.min(width, hi - lo - 20)
  if (w < 50) return false
  const lo2 = lo + w / 2 + 12
  const hi2 = hi - w / 2 - 12
  let t0 = (lo2 + hi2) / 2
  if (prefer) {
    const tp = (prefer.x - e.a.x) * e.dir.x + (prefer.y - e.a.y) * e.dir.y
    t0 = Math.max(lo2, Math.min(hi2, tp))
  }
  c.open(a, kind, add(e.a, mul(e.dir, t0)), w, swing)
  return true
}

const SIDE_OUT: Record<Side, Vec> = { n: { x: 0, y: 1 }, s: { x: 0, y: -1 }, w: { x: -1, y: 0 }, e: { x: 1, y: 0 } }

/** 房间朝 side 一侧的外墙上开窗：取那一侧最长的一段外墙（外面不是户内房间），居中 */
function windowSide(c: Ctx, r: Room, side: Side, width: number, floorRooms: Room[]) {
  const o = SIDE_OUT[side]
  let best: { mid: Vec; len: number } | null = null
  for (const e of edgesOf(r.points)) {
    if (e.out.x * o.x + e.out.y * o.y < 0.9) continue
    // 沿边切成外侧有 / 没有户内房间的几段，取外侧空着的最长一段
    const n = Math.max(2, Math.ceil(e.length / 10))
    let run0 = -1
    for (let k = 0; k <= n; k++) {
      const s = (e.length * k) / n
      const probe = add(add(e.a, mul(e.dir, Math.min(e.length - 1, Math.max(1, s)))), mul(e.out, 15))
      const free = k < n && !floorRooms.some((x) => x !== r && isIndoor(x) && pointInPolygon(probe, x.points))
      if (free && run0 < 0) run0 = s
      if ((!free || k === n) && run0 >= 0) {
        const len = s - run0
        if (!best || len > best.len) best = { mid: add(e.a, mul(e.dir, (run0 + s) / 2)), len }
        run0 = -1
      }
    }
  }
  if (!best || best.len < Math.min(width, 60) + 50) return
  c.open(r, 'window', best.mid, Math.min(width, best.len - 50))
}

const mirrorX = (W: number) => (p: Vec): Vec => ({ x: W - p.x, y: p.y })

// ---------------------------------------------------------------------------
// 第一阶段：房间、门窗、楼梯、用地
// ---------------------------------------------------------------------------

function layout(seed: number, o: Pick<HouseGenOpts, 'region' | 'dwelling' | 'bedrooms'>): HouseLayout {
  const P = PROGRAMS[o.region]
  const c = createCtx(seed)
  const duplex = o.dwelling === 'duplex'
  const choices = houseBedrooms(o.region)
  let n = o.bedrooms === 'random' ? c.pick(o.region === 'cn' ? [3, 4, 4, 5] : [3, 3, 4, 4, 4]) : Math.max(choices[0], Math.min(choices[choices.length - 1], o.bedrooms))
  if (duplex) n = Math.min(n, 3)
  const d = P.dims(c, n)
  const s1 = P.south1(c, n, duplex)
  let partial = !duplex && c.chance(P.partial)
  // 2F 要放几间卧室：南带 k 间，不够的放到东侧（入口上方）
  const m = n - s1.beds
  const eastBed = P.eastBed && m >= 3
  const k = Math.min(P.maxSouth, eastBed ? m - 1 : m)
  // 东侧当卧室要 290 宽以上（4.5 帖 / 7.3㎡）
  if (eastBed && d.wG + d.wSC < 290) d.wSC = 290 - d.wG
  if (o.region === 'west' && d.wG + d.wSC < 220) d.wSC = 220 - d.wG
  const wSt = 180
  // 复式的挑空：客厅上方，宽 300–380
  const voidW = duplex ? c.rint(300, 380) : 0
  // 宽度：北带的最小和、2F 南带放得下 k 间卧室
  const northMin = d.wC + d.wT + wSt + d.wG + d.wSC
  const master = P.masterMin(d)
  const needS = (k > 0 ? master + (k - 1) * 290 : 0) + voidW
  let W = Math.max(d.W, northMin, needS + (partial ? d.wC : 0))
  // 1F 南带的最小和
  const south1Min = s1.cells.reduce((a, x) => a + x.min, 0)
  W = Math.max(W, south1Min)
  W = Math.ceil(W / 10) * 10
  if (partial && W - d.wC < needS) partial = false
  // 北带富余：先补填充间（收纳），再放宽入口、核心；还有剩的给填充间（不超过 220）、侧间，最后都给入口
  let slack = W - northMin
  let wF = 0
  if (slack >= 90) {
    wF = Math.min(slack, c.rint(90, 150))
    slack -= wF
  }
  const take = (v: number) => {
    const a = Math.max(0, Math.min(slack, v))
    slack -= a
    return a
  }
  d.wG += take(60)
  d.wC += take(40)
  if (wF > 0) wF += take(220 - wF)
  if (d.wSC > 0) d.wSC += take(200 - d.wSC)
  d.wG += take(slack)
  const { dS, hw, dN, wC, wT } = d
  const yN = dS + hw
  const D = yN + dN
  const xF = wC + wT
  const xS = xF + wF
  const xG = xS + wSt
  const xSC = xG + d.wG
  const placed: Placed[] = []
  const rec = (def: CellDef, room: Room, floor: '1f' | '2f') => {
    if (def.flush) room.flush = true
    placed.push({ def, room, floor })
    return room
  }

  // ---------- 1F ----------
  const hallPts = (x0: number): Vec[] => [
    { x: x0, y: dS },
    { x: W, y: dS },
    { x: W, y: yN },
    { x: xG, y: yN },
    { x: xG, y: D },
    { x: xS, y: D },
    { x: xS, y: yN },
    { x: x0, y: yN },
  ]
  const hall1 = c.room('hall', P.hallName, hallPts(wC))
  if (P.group) hall1.openGroup = P.group
  if (P.core.north) {
    rec(P.core.north, c.rect(P.core.north.kind, P.core.north.name, 0, D - d.dB, wC, D), F1)
    rec(P.core.south, c.rect(P.core.south.kind, P.core.south.name, 0, dS, wC, D - d.dB), F1)
  } else rec(P.core.south, c.rect(P.core.south.kind, P.core.south.name, 0, dS, wC, D), F1)
  rec(P.col, c.rect(P.col.kind, P.col.name, wC, yN, xF, D), F1)
  if (wF > 0) rec(P.filler, c.rect(P.filler.kind, P.filler.name, xF, yN, xS, D), F1)
  const entry = rec(P.entry, c.rect('entrance', P.entry.name, xG, yN, xSC, D), F1)
  if (d.wSC > 0) rec(P.side, c.rect(P.side.kind, P.side.name, xSC, yN, W, D), F1)
  // 南带
  {
    const fixed = s1.cells.map((x) => (x.fill ? 0 : c.rint(x.min, x.max)))
    const fi = s1.cells.findIndex((x) => x.fill)
    let rest = W - fixed.reduce((a, b) => a + b, 0)
    // 填充间不够宽：从固定间里扣
    for (let i = 0; rest < s1.cells[fi].min && i < 50; i++) {
      const j = fixed.findIndex((w, q) => q !== fi && w - 10 >= s1.cells[q].min)
      if (j < 0) break
      fixed[j] -= 10
      rest += 10
    }
    fixed[fi] = rest
    let x = 0
    s1.cells.forEach((def, i) => {
      const r = c.rect(def.kind, def.name, x, 0, x + fixed[i], dS)
      if (def.door === 'open' && P.group) r.openGroup = P.group
      rec(def, r, F1)
      x += fixed[i]
    })
  }
  const rooms1 = c.rooms.splice(0)
  const open1 = c.openings.splice(0)

  // ---------- 2F ----------
  const x2 = partial ? wC : 0
  const hall2 = c.room('hall', P.hallName, hallPts(wC))
  if (!partial) rec(P.nw2, c.rect(P.nw2.kind, P.nw2.name, 0, dS, wC, D), F2)
  rec(P.col2, c.rect(P.col2.kind, P.col2.name, wC, yN, xF, D), F2)
  if (wF > 0) rec(P.filler2, c.rect(P.filler2.kind, P.filler2.name, xF, yN, xS, D), F2)
  {
    let x = xG
    const extraBedName = eastBed ? P.bedName(k) : null
    for (const { def, w } of P.east2(c, W - xG, extraBedName)) {
      rec(def, c.rect(def.kind, def.name, x, yN, x + w, D), F2)
      x += w
    }
  }
  // 南带卧室（复式时东端是客厅上方的挑空）
  const southEnd = W - voidW
  const beds2: Room[] = []
  if (k > 0) {
    const mins = Array.from({ length: k }, (_, i) => (i === 0 ? master : 280))
    const weights = Array.from({ length: k }, (_, i) => (i === 0 ? 1.35 : 1))
    const ws = splitWidths(southEnd - x2, mins, weights)
    let x = x2
    ws.forEach((w, i) => {
      const def = bedCell(P.bedName(i), i === 0 ? 180 : 160, i === 0 ? 'master' : 'bed')
      beds2.push(rec(def, c.rect('western', def.name, x, 0, x + w, dS), F2))
      x += w
    })
  } else if (southEnd > x2) {
    // 复式只要一间卧室：南带剩下的给主卧
    const def = bedCell(P.bedName(0), 180, 'master')
    beds2.push(rec(def, c.rect('western', def.name, x2, 0, southEnd, dS), F2))
  }
  if (voidW > 0) c.rect('void', '挑空', southEnd, 0, W, dS)
  // 阳台：2F 南侧挑出
  if (P.balcony && beds2.length) {
    const b = P.balcony(c)
    const span = b.span === 'master' || beds2.length === 1 ? [beds2[0]] : b.span === 'two' ? beds2.slice(0, 2) : beds2
    const bx0 = Math.min(...span.flatMap((r) => r.points.map((p) => p.x)))
    const bx1 = Math.max(...span.flatMap((r) => r.points.map((p) => p.x)))
    const bal = c.rect('balcony', b.name, bx0, -b.depth, bx1, 0)
    bal.railing = b.railing
  }
  const rooms2 = c.rooms.splice(0)
  const open2 = c.openings.splice(0)

  // ---------- 门窗（按层：开门只看本层的房间） ----------
  const stairsMid: Vec = { x: xS + wSt / 2, y: yN }
  const doors = (rooms: Room[], hall: Room, floor: '1f' | '2f') => {
    c.rooms.push(...rooms)
    const mine = placed.filter((p) => p.floor === floor)
    const bySide = (r: Room, side: Side) => {
      const b = bbox(r.points)
      const mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
      const probe = side === 'n' ? { x: mid.x, y: b.y1 + 10 } : side === 's' ? { x: mid.x, y: b.y0 - 10 } : side === 'w' ? { x: b.x0 - 10, y: mid.y } : { x: b.x1 + 10, y: mid.y }
      return rooms.find((x) => x !== r && isIndoor(x) && pointInPolygon(probe, x.points))
    }
    for (const { def, room } of mine) {
      const rule = def.door ?? 'hall'
      if (rule === 'none' || rule === 'open' || def.kind === 'entrance') continue
      const target = rule === 'hall' ? hall : bySide(room, rule)
      if (!target) continue
      // 走廊门靠近楼梯（走得少）；其余居中
      doorBetween(c, room, target, def.doorKind ?? 'door', def.doorW ?? 75, def.swing ?? 'in', rule === 'hall' ? (room.kind === 'ldk' ? { x: xG + d.wG / 2, y: dS } : stairsMid) : undefined)
    }
    for (const { def, room } of mine) for (const [side, w] of Object.entries(def.win ?? {}) as [Side, number][]) windowSide(c, room, side, w, rooms)
    // 阳台：南侧卧室的窗本来就开在南墙上，阳台挨着它们就是落地窗
    // 走廊端头的窗
    windowSide(c, hall, 'e', 80, rooms)
    void floor
    c.rooms.splice(0)
    return c.openings.splice(0)
  }
  // 入户门：入口北墙
  c.rooms.push(...rooms1)
  c.open(entry, 'door', { x: (xG + xSC) / 2, y: D }, P.region === 'jp' ? 85 : 95, 'out')
  c.rooms.splice(0)
  open1.push(...c.openings.splice(0))
  open1.push(...doors(rooms1, hall1, F1))
  open2.push(...doors(rooms2, hall2, F2))
  for (const r of rooms2) r.floor = F2
  for (const op of open2) op.floor = F2

  // ---------- 楼梯：U 形，占满北带进深，起步和出梯口都在走廊带一侧 ----------
  const stairs: Fixture = { id: `f${seed.toString(36)}st`, kind: 'stairs', stairs: 'u', turn: c.chance(0.5) ? 'left' : 'right', x: xS + wSt / 2, y: yN + dN / 2, w: wSt, d: dN, rot: 180 }

  // ---------- 用地 ----------
  let site: Site | undefined
  if (!duplex) {
    const doorX = (xG + xSC) / 2
    const south = c.rint(320, 480)
    const north = c.rint(130, 200)
    const sideW = c.rint(90, 150)
    const carW = 270
    const park = c.chance(o.region === 'jp' ? 0.85 : 0.95)
    const x0 = -sideW
    const x1 = W + (park ? 60 + carW + 50 : c.rint(90, 150))
    const y0 = -south
    const y1 = D + north
    const pw = o.region === 'jp' ? 110 : 130
    site = {
      points: rectPoints(x0, y0, x1, y1),
      fence: P.fence(c),
      gates: [[{ x: doorX - pw / 2 - 20, y: y1 }, { x: doorX + pw / 2 + 20, y: y1 }]],
      paths: [rectPoints(doorX - pw / 2, D, doorX + pw / 2, y1)],
      parking: [],
    }
    if (park) {
      const px0 = W + 60
      const py0 = Math.max(y0 + 40, y1 - 540)
      site.parking.push({ points: rectPoints(px0, py0, px0 + carW, y1), rot: 0, car: true, carColor: c.pick(['#d9534f', '#f2f2f2', '#3b5b8c', '#2f3338', '#9fb8a0', '#e6c35c']) })
      site.gates.push([{ x: px0 - 10, y: y1 }, { x: px0 + carW + 10, y: y1 }])
    }
  }

  // ---------- 镜像 ----------
  const mirror = c.chance(0.5)
  const fx: Fixture[] = [stairs]
  if (mirror) {
    const mx = mirrorX(W)
    for (const r of [...rooms1, ...rooms2]) r.points = r.points.map(mx)
    stairs.x = W - stairs.x
    stairs.turn = stairs.turn === 'left' ? 'right' : 'left'
    if (site) {
      site.points = site.points.map(mx)
      site.gates = site.gates.map(([a, b]) => [mx(a), mx(b)])
      site.paths = site.paths.map((p) => p.map(mx))
      for (const s of site.parking) s.points = s.points.map(mx)
    }
  }

  // 1F / 2F：层高都是默认墙高，2F 地面 = 1F 天花 + 楼板
  const floors = [F1, F2].map((id, i) => ({ id, name: id.toUpperCase(), elevation: i * (DEFAULT_FLOOR_H + SLAB), height: DEFAULT_FLOOR_H }))
  const rooms = [...rooms1, ...rooms2]
  const beds = rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
  const baths = rooms.filter((r) => r.kind === 'bath' && r.name !== 'Half Bath').length
  const plan: Plan = {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: '',
    wall: WALL,
    wallOuter: WALL_OUTER,
    rooms,
    openings: [...open1, ...open2],
    fixtures: fx,
    furniture: [],
    floors,
    region: o.region,
    ...(site ? { site, exterior: P.exterior(c) } : {}),
    // 户建：院子 / 阳台一侧（y = 0，平面图上方）朝南，3D 的日照从院子那边来
    ...(site ? { north: 180 } : {}),
  }
  plan.name = P.name(beds, { partial, duplex, area: planArea(plan), seed, beds, baths })
  return { c, plan, placed, want: n }
}

// ---------------------------------------------------------------------------
// 第二阶段：设备（按层，在子户型里摆）
// ---------------------------------------------------------------------------

function furnish({ c, plan, placed }: HouseLayout): Plan {
  const region = plan.region ?? 'jp'
  for (const fl of planFloors(plan)) {
    const view = floorView(plan, fl.id)
    // 子户型的设备数组是筛出来的副本：摆好的设备同时记到原户型里
    view.fixtures = [...view.fixtures]
    orientDoors(view)
    const commit = (fs: Fixture[]) => {
      for (const f of fs) if (!plan.fixtures.includes(f)) plan.fixtures.push(stampFloor(plan, f, fl.id))
    }
    const put = (room: Room, spec: PlaceSpec) => {
      const f = placeOnWall(room, view, spec)
      if (f) {
        view.fixtures.push(f)
        commit([f])
      }
      return f
    }
    const run = (fn: () => void) => {
      const before = new Set(view.fixtures)
      fn()
      commit(view.fixtures.filter((f) => !before.has(f)))
    }
    for (const { def, room: r } of placed.filter((p) => p.floor === fl.id)) {
      const door = firstDoorCenter(r, view)
      const b = bbox(r.points)
      const minDim = Math.min(b.x1 - b.x0, b.y1 - b.y0)
      switch (def.tag) {
        case 'kitchenRoom': {
          const west = region === 'west'
          const isLdk = r.kind === 'ldk'
          run(() => {
            const { k } = placeKitchen(view, r, {
              variants: west ? ['facing', 'wall'] : isLdk && c.chance(0.7) ? ['facing', 'wall'] : ['wall'],
              lengths: west ? [300, 285, 270, 255, 240] : isLdk ? [270, 255, 240, 225, 210] : [240, 225, 210, 195, 180],
              edges: west || isLdk ? 'inner' : 'any',
              fridge: west ? [90, 85, 80] : [70, 65, 60],
              fridgeDepth: west ? 75 : 65,
              fridgeRooms: placed.filter((p) => p.floor === fl.id && (p.room.kind === 'dining' || p.room.kind === 'ldk') && p.room !== r).map((p) => p.room),
              extra: west ? { dishwasher: true, induction: c.chance(0.5), burners: 3 } : region === 'cn' ? { burners: 2 } : {},
            })
            if (k?.variant === 'facing' && west) k.island = true
          })
          break
        }
        case 'jpBath':
          put(r, { kind: 'bathtub', fill: true, lengths: [110], depth: Math.min(80, Math.round(minDim * 0.45)), far: door, underWindow: true })
          break
        case 'jpWash': {
          const fs = placePair(r, view, { kind: 'washer', lengths: [64, 60], depth: 64, underWindow: true }, { kind: 'basin', lengths: [75, 60], depth: 55, underWindow: true })
          view.fixtures.push(...fs)
          commit(fs)
          break
        }
        case 'toilet':
          // 窄厕所的小窗就在马桶后面那面墙上
          put(r, { kind: 'toilet', lengths: [40], depth: 68, far: door, centered: true, underWindow: true })
          break
        case 'entry':
          run(() => shoeCabinet(view, r, [120, 100, 90, 80, 60]))
          break
        case 'laundry':
          if (!put(r, { kind: 'washer', lengths: [140, 130], depth: 70 })) put(r, { kind: 'washer', lengths: [70, 64], depth: 68 })
          put(r, { kind: 'basin', lengths: [60, 50], depth: 50 })
          break
        case 'pantry': {
          const f = put(r, { kind: 'builtin', lengths: [130, 120, 100, 90, 80], depth: 40 })
          if (f) f.builtinType = 'pantry'
          break
        }
        case 'halfBath':
          run(() => placeBathroom(view, r, { wet: 'none', basins: 1, basinW: [60, 50], basinD: 45 }))
          break
        case 'primaryBath':
          run(() => placeBathroom(view, r, { wet: c.chance(0.55) ? 'tub' : 'shower', basins: 2, basinW: [75, 70, 65], basinD: 55 }))
          break
        case 'fullBath':
          run(() => placeBathroom(view, r, { wet: c.chance(0.7) ? 'tub' : 'shower', basins: 1, basinW: [80, 70, 60], basinD: 55 }))
          break
        case 'ensuite':
          run(() => placeBathroom(view, r, { wet: c.chance(0.3) ? 'tub' : 'shower', basins: c.chance(0.4) ? 2 : 1, basinW: [70, 60], basinD: 50 }))
          break
        case 'cnBath1':
          run(() => placeBathroom(view, r, { wet: 'shower', basins: 1, basinW: [70, 60], basinD: 50, washer: true }))
          break
        case 'cnBath':
          run(() => placeBathroom(view, r, { wet: c.chance(0.25) ? 'tub' : 'shower', basins: 1, basinW: [70, 60], basinD: 50 }))
          break
        case 'washitsu':
          // 押入れ：靠墙的深柜位
          run(() => bedroomCloset(view, r, [180, 170, 160], 80))
          break
        case 'bed':
        case 'master':
          if (!(region === 'west' && def.tag === 'master')) run(() => bedroomCloset(view, r))
          break
      }
    }
  }
  // 洗衣机没放下（卫生间太挤）：退到同层的收纳 / 阳台，再不行到别的层
  if (!plan.fixtures.some((f) => f.kind === 'washer')) {
    outer: for (const kind of ['wash', 'storage', 'balcony', 'bath'] as const)
      for (const fl of planFloors(plan)) {
        const view = floorView(plan, fl.id)
        for (const r of view.rooms.filter((x) => x.kind === kind)) {
          const f = placeOnWall(r, view, { kind: 'washer', lengths: [64, 60], depth: 64, avoidWindows: kind === 'balcony' })
          if (f) {
            plan.fixtures.push(stampFloor(plan, f, fl.id))
            break outer
          }
        }
      }
  }
  const big = planArea(plan) > 100
  for (const f of plan.fixtures)
    if (f.kind === 'toilet') f.toiletType = region === 'west' ? 'basic' : region === 'jp' ? (c.chance(big ? 0.3 : 0.15) ? 'tankless' : 'washlet') : c.chance(0.5) ? 'washlet' : 'basic'
  return plan
}

// ---------------------------------------------------------------------------
// 合规
// ---------------------------------------------------------------------------

/**
 * 跨层可达：从玄关出发，经门、敞开边界、通往阳台的窗（每层单独判断），再经楼梯（stairLinks）上下层，
 * 走不到的房间（挑空不算：它没有地面）。
 */
export function houseUnreachable(plan: Plan): Room[] {
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const fl of planFloors(plan)) for (const [a, ns] of roomLinks(floorView(plan, fl.id))) for (const b of ns) link(a, b)
  for (const s of stairLinks(plan)) if (s.lower && s.upper) link(s.lower.id, s.upper.id)
  const start = plan.rooms.find((r) => r.kind === 'entrance' && floorOf(plan, r) === planFloors(plan)[0].id)
  if (!start) return plan.rooms
  const seen = new Set([start.id])
  const q = [start.id]
  while (q.length) for (const n of adj.get(q.shift()!) ?? []) if (!seen.has(n)) (seen.add(n), q.push(n))
  return plan.rooms.filter((r) => r.kind !== 'void' && !seen.has(r.id))
}

/** 户建 / 复式的合规问题（空 = 合格）。checkFixtures = false 时只看布局 */
export function houseViolations(l: Pick<HouseLayout, 'plan' | 'want'>, checkFixtures: boolean): string[] {
  const { plan } = l
  const out: string[] = []
  const region = plan.region ?? 'jp'
  if (region === 'jp') {
    out.push(...planViolations(plan, checkFixtures))
    for (const fl of planFloors(plan)) out.push(...planViolations(floorView(plan, fl.id), false).map((v) => `${fl.name}: ${v}`))
  }
  for (const r of plan.rooms) {
    if (r.kind === 'western' || r.kind === 'japanese') {
      const m2 = area(r.points) / 10000
      if (m2 < 4.5 * JO) out.push(`${r.name} 太小 ${m2.toFixed(1)}㎡`)
    }
  }
  const beds = plan.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
  if (beds < l.want) out.push(`卧室只有 ${beds} 间`)
  const lost = houseUnreachable(plan)
  if (lost.length) out.push(`走不到：${lost.map((r) => r.name).join('、')}`)
  if (stairHoleConflicts(plan).length) out.push('楼梯洞口压到房间')
  if (checkFixtures) {
    if (!plan.fixtures.some((f) => f.kind === 'kitchen')) out.push('厨房放不下')
    if (!plan.fixtures.some((f) => f.kind === 'fridge')) out.push('冰箱放不下')
    if (!plan.fixtures.some((f) => f.kind === 'washer')) out.push('洗衣机放不下')
    for (const r of plan.rooms) {
      const fs = plan.fixtures.filter((f) => floorOf(plan, f) === floorOf(plan, r) && pointInPolygon(f, r.points))
      if (r.kind === 'toilet' && !fs.some((f) => f.kind === 'toilet')) out.push(`${r.name} 没有马桶`)
      if (r.kind === 'bath') {
        const need = r.name === 'Half Bath' ? ['toilet', 'basin'] : region === 'jp' ? ['bathtub'] : ['toilet', 'basin', 'bathtub']
        if (!need.every((k) => fs.some((f) => f.kind === k))) out.push(`${r.name} 设备不全`)
      }
    }
  }
  return out
}

/** 和平层同一套路：从 seed 起依次试，第一个面积合格且合规的胜出，否则给最接近的 */
export function generateHouseWithArea(opts: HouseGenOpts, attempts = 300): { plan: Plan; seed: number; matched: boolean } {
  const lo = opts.minArea ?? 0
  const hi = opts.maxArea ?? Infinity
  let best: { seed: number; score: number } | null = null
  for (let i = 0; i < attempts; i++) {
    const seed = (opts.seed + i) % 1_000_000
    const l = layout(seed, opts)
    const a = planArea(l.plan)
    const gap = a < lo ? lo - a : a > hi ? a - hi : 0
    const layoutOk = houseViolations(l, false).length === 0
    if (gap === 0 && layoutOk) {
      const plan = furnish(l)
      if (houseViolations(l, true).length === 0) return { plan, seed, matched: true }
    }
    const score = gap + (layoutOk ? 0 : 1e6) + (gap === 0 ? 1e5 : 0)
    if (!best || score < best.score) best = { seed, score }
  }
  return { plan: furnish(layout(best!.seed, opts)), seed: best!.seed, matched: false }
}

/** 测试用：只做布局 + 设备，不试种子 */
export function generateHouseRaw(opts: HouseGenOpts) {
  const l = layout(opts.seed, opts)
  return { ...l, plan: furnish(l) }
}

