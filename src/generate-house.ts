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
import { WALL, WALL_OUTER, createCtx, planArea, planViolations, searchWithArea, type Ctx } from './generate'
import { bedroomCloset, placeBathroom, placeKitchen, roomLinks, shoeCabinet } from './generate-band'
import { isIndoor, sharedIntervals } from './walls'
import { DEFAULT_FLOOR_H, SLAB, floorOf, floorView, planFloors, stampFloor } from './floors'
import { stairHoleConflicts, stairLinks, withStairKeepout } from './stairs'
import { jp, t } from './i18n'
import { altInt, carveFloors, defaultRule } from './footprint'

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
  /** 列上的トイレ只占北端一段进深（净深 136～156），南边让给走廊的一个小凹口，门开在凹口里 */
  shallow?: boolean
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
  /** 外轮廓变形过（L 形）：同一种子不变形的方案 */
  plain?: () => HouseLayout
}

const F1 = '1f'
const F2 = '2f'

/** L 形楼梯的占地（宽 = 两跑的梯段宽，深 = 沿北墙的长度） */
const STAIR_L = { w: 180, d: 270 }
/** 户建的客厅楼梯：2F 南带东端让给走廊（洞口在里面）的宽度 */
const LIVING_STRIP = 110
/** 客厅楼梯起步前留出的进深 */
const STAIR_CLEAR_LIVING = 85

/** 不消耗布局随机序列的确定性哈希（0..1） */
function seedHash(seed: number, k: number) {
  let h = (Math.imul(seed | 0, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

export type HouseStairKind = 'u' | 'l' | 'living'

/**
 * 楼梯形式按住宅类型和地区挑：
 *   户建：日式 U 形 45% / L 形 25% / 客厅楼梯 30%；欧美 U 形 30% / L 形 30% / 客厅楼梯（开放式）40%；中式 U 形 45% / L 形 25% / 客厅楼梯 30%。
 *   复式：U 形 50% / 挑空里的客厅楼梯 50%（L 形放不进楼梯间的进深）。
 * 客厅楼梯要客厅在南带东端（日式和室、中式老人房在东端时退回 U 形）。
 */
export function stairKind(seed: number, region: Region, duplex: boolean, ldkLast: boolean): HouseStairKind {
  const h = seedHash(seed, 1)
  const pLiving = !ldkLast ? 0 : duplex ? 0.5 : region === 'west' ? 0.4 : 0.3
  const pL = duplex ? 0 : region === 'west' ? 0.3 : 0.25
  return h < pLiving ? 'living' : h < pLiving + pL ? 'l' : 'u'
}

/**
 * 楼梯下面和外观（stairStyles.ts）：
 *   楼梯间里的 L 形：掏空成储物角（一键布置摆矮柜、收纳箱）45%、「楼梯下收纳」样式（侧面柜门）35%、实心 20%；
 *   客厅楼梯：镂空木梯 / 现代玻璃栏板各半（开放式），其中一半下面摆收纳。
 */
function stairLook(seed: number, living: boolean): Pick<Fixture, 'under' | 'stairStyle'> {
  const h = seedHash(seed, 2)
  if (living) return { stairStyle: seedHash(seed, 3) < 0.5 ? 'open' : 'modern', ...(h < 0.5 ? { under: 'open' as const } : {}) }
  return h < 0.45 ? { under: 'open' } : h < 0.8 ? { stairStyle: 'storage' } : {}
}

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
    wT: c.rint(90, 100),
    wG: c.rint(170, 210),
    wSC: c.chance(0.6) ? c.rint(90, 130) : 0,
    W: n >= 4 ? c.rint(880, 1020) : c.rint(820, 960),
  }),
  core: {
    north: { kind: 'bath', name: '浴室', door: 's', doorKind: 'folding', doorW: 70, win: { w: 70 }, tag: 'jpBath' },
    south: { kind: 'wash', name: '洗面所', door: 'hall', doorKind: 'sliding', doorW: 70, win: { w: 60 }, tag: 'jpWash' },
  },
  col: { kind: 'toilet', name: 'トイレ', door: 'hall', doorKind: 'door', doorW: 65, swing: 'out', win: { n: 50 }, tag: 'toilet', shallow: true },
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
  col2: { kind: 'toilet', name: 'トイレ', door: 'hall', doorKind: 'door', doorW: 65, swing: 'out', win: { n: 50 }, tag: 'toilet', shallow: true },
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
  south1: (c) => {
    const kitchen: SouthDef = { kind: 'kitchen', name: 'Kitchen', min: 340, max: 390, door: 'open', win: { s: 140, e: 120 }, tag: 'kitchenRoom' }
    const dining: SouthDef = { kind: 'dining', name: 'Dining', min: 300, max: 360, door: 'open', win: { s: 160 } }
    const living: SouthDef = { kind: 'ldk', name: 'Living Room', min: 420, max: 9999, fill: true, door: 'open', win: { s: c.rint(240, 300), e: 160, w: 160 } }
    // 开放的客餐厨：厨房在西端（洗衣房旁）/ 夹在餐厅和客厅之间 / 客厅在西端、厨房到东端（不能做客厅楼梯）
    const v = c.alt()
    return { cells: v < 0.45 ? [kitchen, dining, living] : v < 0.75 ? [dining, kitchen, living] : [living, dining, kitchen], beds: 0 }
  },
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
    // 四室以上：1F 一间老人房（卫生间就在旁边），在东端或夹在餐厅和客厅之间
    if (!duplex && n >= 4) {
      const elder: SouthDef = { kind: 'western', name: '卧室', min: 300, max: 350, door: 'hall', win: { s: 150, e: 120 }, tag: 'bed' }
      if (c.altChance(0.4)) cells.splice(1, 0, elder)
      else cells.push(elder)
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

/** 去掉多边形里重合的点和共线的中间点 */
function simplifyRing(pts: Vec[]): Vec[] {
  let out = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length]
    return Math.abs(p.x - q.x) > 0.5 || Math.abs(p.y - q.y) > 0.5
  })
  for (let changed = true; changed && out.length > 3; ) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]
      const b = out[i]
      const n = out[(i + 1) % out.length]
      if (Math.abs((b.x - a.x) * (n.y - b.y) - (b.y - a.y) * (n.x - b.x)) < 1e-6) {
        out = out.filter((_, k) => k !== i)
        changed = true
        break
      }
    }
  }
  return out
}

/** 两个房间的共用边上开门：位置靠近 prefer 点（不给就居中），门框离墙角 15 */
function doorBetween(c: Ctx, a: Room, b: Room, kind: OpeningKind, width: number, swing: Opening['swing'] = 'in', prefer?: Vec, side?: Side) {
  let best: { e: ReturnType<typeof edgesOf>[number]; lo: number; hi: number } | null = null
  for (const e of edgesOf(a.points)) {
    if (side && e.out.x * SIDE_OUT[side].x + e.out.y * SIDE_OUT[side].y < 0.9) continue
    for (const [lo, hi] of sharedIntervals(e, b)) if (!best || hi - lo > best.hi - best.lo) best = { e, lo, hi }
  }
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

/** 房间朝 side 一侧的外墙上开窗：取那一侧最长的一段外墙（外面不是户内房间），大致居中、有时偏向一侧 */
function windowSide(c: Ctx, r: Room, side: Side, width: number, floorRooms: Room[]) {
  const o = SIDE_OUT[side]
  let best: { mid: Vec; len: number; dir: Vec } | null = null
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
        if (!best || len > best.len) best = { mid: add(e.a, mul(e.dir, (run0 + s) / 2)), len, dir: e.dir }
        run0 = -1
      }
    }
  }
  if (!best || best.len < Math.min(width, 60) + 50) return
  const w = Math.min(width, best.len - 50)
  c.open(r, 'window', add(best.mid, mul(best.dir, c.windowShift(best.len, w))), w)
}

const mirrorX = (W: number) => (p: Vec): Vec => ({ x: W - p.x, y: p.y })

// ---------------------------------------------------------------------------
// 第一阶段：房间、门窗、楼梯、用地
// ---------------------------------------------------------------------------

function layout(seed: number, o: Pick<HouseGenOpts, 'region' | 'dwelling' | 'bedrooms'> & { plain?: boolean }): HouseLayout {
  const P = PROGRAMS[o.region]
  const c = createCtx(seed)
  const duplex = o.dwelling === 'duplex'
  const choices = houseBedrooms(o.region)
  let n = o.bedrooms === 'random' ? c.pick(o.region === 'cn' ? [3, 4, 4, 5] : [3, 3, 4, 4, 4]) : Math.max(choices[0], Math.min(choices[choices.length - 1], o.bedrooms))
  if (duplex) n = Math.min(n, 3)
  const d = P.dims(c, n)
  const s1 = P.south1(c, n, duplex)
  let partial = !duplex && c.chance(P.partial)
  // 部分二階：2F 的トイレ西边没有核心那一列，贴着外墙（厚墙），开间放到 100 才有净宽 86
  if (partial && P.col2.shallow) d.wT = Math.max(d.wT, 100)
  // 2F 要放几间卧室：南带 k 间，不够的放到东侧（入口上方）
  const m = n - s1.beds
  const eastBed = P.eastBed && m >= 3
  const k = Math.min(P.maxSouth, eastBed ? m - 1 : m)
  // 东侧当卧室要 290 宽以上（4.5 帖 / 7.3㎡）
  if (eastBed && d.wG + d.wSC < 290) d.wSC = 290 - d.wG
  if (o.region === 'west' && d.wG + d.wSC < 220) d.wSC = 220 - d.wG
  // 楼梯形式（用种子的哈希挑，不消耗布局的随机序列：U 形的户型和以前一样）
  // 客厅楼梯：起步前要留 80 的地方，南带进深放不下 300 长的梯段就不做
  const livingRun = Math.min(360, d.dS - WALL / 2 - WALL_OUTER / 2 - STAIR_CLEAR_LIVING)
  const kind = stairKind(seed, o.region, duplex, s1.cells[s1.cells.length - 1].kind === 'ldk' && livingRun >= 300)
  const living = kind === 'living'
  c.sig.push(`n${n}`, kind, partial ? 'partial' : '', s1.cells.map((x) => x.kind).join(','))
  // 楼梯间宽：U 形 180；L 形要放下 270 长的占地（两侧隔墙各让半个墙厚）；客厅楼梯时这一格做收纳
  const wSt = kind === 'l' ? STAIR_L.d + WALL + 2 : 180
  // 户建的客厅楼梯：2F 南带东端让出一条走廊（洞口在里面）
  const stripW = living && !duplex ? LIVING_STRIP : 0
  // 复式的挑空：客厅上方，宽 300–380
  const voidW = duplex ? c.rint(300, 380) : 0
  // 宽度：北带的最小和、2F 南带放得下 k 间卧室
  const northMin = d.wC + d.wT + wSt + d.wG + d.wSC
  const master = P.masterMin(d)
  const needS = (k > 0 ? master + (k - 1) * 290 : 0) + voidW + stripW
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
  // 浅的トイレ（日式）：只占列的北端 tH，南边 yN..yA 是走廊的凹口（トイレ前）
  const tH = P.col.shallow ? altInt(c, 150, 170) : 0
  const yA = tH ? D - tH : yN
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
  // 走廊：走廊带 + 北带的楼梯间（客厅楼梯时楼梯间做收纳，走廊不含它）；strip = 2F 南带东端让给客厅楼梯洞口的一条
  const hallPts = (x0: number, strip = 0): Vec[] => [
    { x: x0, y: dS },
    ...(strip
      ? [
          { x: W - strip, y: dS },
          { x: W - strip, y: 0 },
          { x: W, y: 0 },
        ]
      : [{ x: W, y: dS }]),
    { x: W, y: yN },
    ...(living
      ? []
      : [
          { x: xG, y: yN },
          { x: xG, y: D },
          { x: xS, y: D },
          { x: xS, y: yN },
        ]),
    // トイレ前的凹口：列的南段并进走廊
    ...(yA > yN
      ? [
          { x: xF, y: yN },
          { x: xF, y: yA },
          { x: x0, y: yA },
        ]
      : [{ x: x0, y: yN }]),
  ]
  // 客厅楼梯：楼梯间并进填充间（收纳）
  const xFill = living ? xG : xS
  const hall1 = c.room('hall', P.hallName, simplifyRing(hallPts(wC)))
  if (P.group) hall1.openGroup = P.group
  if (P.core.north) {
    rec(P.core.north, c.rect(P.core.north.kind, P.core.north.name, 0, D - d.dB, wC, D), F1)
    rec(P.core.south, c.rect(P.core.south.kind, P.core.south.name, 0, dS, wC, D - d.dB), F1)
  } else rec(P.core.south, c.rect(P.core.south.kind, P.core.south.name, 0, dS, wC, D), F1)
  rec(P.col, c.rect(P.col.kind, P.col.name, wC, P.col.shallow ? yA : yN, xF, D), F1)
  if (xFill > xF) rec(P.filler, c.rect(P.filler.kind, P.filler.name, xF, yN, xFill, D), F1)
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
    // 客厅楼梯贴着客厅东墙：东墙不开窗
    if (living) {
      const last = s1.cells[s1.cells.length - 1]
      last.win = { ...last.win }
      delete last.win.e
    }
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
  const hall2 = c.room('hall', P.hallName, simplifyRing(hallPts(wC, stripW)))
  if (!partial) rec(P.nw2, c.rect(P.nw2.kind, P.nw2.name, 0, dS, wC, D), F2)
  rec(P.col2, c.rect(P.col2.kind, P.col2.name, wC, P.col2.shallow ? yA : yN, xF, D), F2)
  if (xFill > xF) rec(P.filler2, c.rect(P.filler2.kind, P.filler2.name, xF, yN, xFill, D), F2)
  {
    let x = xG
    const extraBedName = eastBed ? P.bedName(k) : null
    for (const { def, w } of P.east2(c, W - xG, extraBedName)) {
      rec(def, c.rect(def.kind, def.name, x, yN, x + w, D), F2)
      x += w
    }
  }
  // 南带卧室（复式时东端是客厅上方的挑空；户建的客厅楼梯时东端是走廊的一条）
  const southEnd = W - voidW - stripW
  const beds2: Room[] = []
  if (k > 0) {
    const mins = Array.from({ length: k }, (_, i) => (i === 0 ? master : 280))
    // 主卧大一些；其余卧室的权重随机，并排的卧室不会一样宽
    const weights = Array.from({ length: k }, (_, i) => (i === 0 ? 1.35 : 0.8 + c.alt() * 0.4))
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
  // 外轮廓变形（户建）：南侧一角两层一起切掉，L 形的房子（客厅楼梯贴着东端，只切西端）
  const shaped = !o.plain && !duplex && shapeHouse(c, rooms1, c.rooms, W, dS, !living)
  // 阳台：2F 南侧挑出（只挑在南墙还在 y = 0 的那一段前面）
  if (P.balcony && beds2.length) {
    const b = P.balcony(c)
    const span = b.span === 'master' || beds2.length === 1 ? [beds2[0]] : b.span === 'two' ? beds2.slice(0, 2) : beds2
    const front = span.flatMap((r) => r.points.filter((p) => Math.abs(p.y) < 1).map((p) => p.x))
    const bx0 = Math.min(...front)
    const bx1 = Math.max(...front)
    if (front.length && bx1 - bx0 >= 150) {
      const bal = c.rect('balcony', b.name, bx0, -b.depth, bx1, 0)
      bal.railing = b.railing
    }
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
      // 浅トイレ的门只开在南墙（凹口里），不开到东边的楼梯间
      doorBetween(c, room, target, def.doorKind ?? 'door', def.doorW ?? 75, def.swing ?? 'in', rule === 'hall' ? (room.kind === 'ldk' ? { x: living ? Math.min(xG + d.wG / 2, W - 260) : xG + d.wG / 2, y: dS } : stairsMid) : undefined, def.shallow && yA > yN ? 's' : undefined)
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

  // ---------- 楼梯 ----------
  //   u      U 形，占满北带进深，起步和出梯口都在走廊带一侧；
  //   l      L 形，贴着楼梯间北墙：从东端（玄关那边）起步往西上，西端的平台拐向南，出梯口朝楼梯间南半边的走廊；
  //   living 客厅楼梯（直跑），贴着客厅东墙从南往北上，出梯口落在 2F 走廊带（户建：2F 南带东端那条走廊里开洞；复式：在挑空里）。
  const turnU = c.chance(0.5) ? 'left' : 'right'
  const id = `f${seed.toString(36)}st`
  const look = stairLook(seed, living)
  const stairs: Fixture =
    kind === 'l'
      ? { id, kind: 'stairs', stairs: 'l', turn: 'right', x: xS + wSt / 2, y: D - WALL_OUTER / 2 - STAIR_L.w / 2 - 1, w: STAIR_L.w, d: STAIR_L.d, rot: 270, ...look }
      : living
        ? { id, kind: 'stairs', stairs: 'straight', x: W - WALL_OUTER / 2 - 45 - 1, y: dS - WALL / 2 - livingRun / 2 - 1, w: 90, d: livingRun, rot: 180, ...look }
        : { id, kind: 'stairs', stairs: 'u', turn: turnU, x: xS + wSt / 2, y: yN + dN / 2, w: wSt, d: dN, rot: 180 }

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
    // 左右镜像：局部 x 翻转（拐向对调），朝向 rot → 360 - rot
    stairs.x = W - stairs.x
    if (stairs.stairs !== 'straight') stairs.turn = stairs.turn === 'left' ? 'right' : 'left'
    stairs.rot = (360 - stairs.rot) % 360
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
  return { c, plan, placed, want: n, ...(shaped ? { plain: () => layout(seed, { ...o, plain: true }) } : {}) }
}

/**
 * 户建的 L 形外轮廓（约 40%，只用 c.alt）：南侧一角（镜像之前的西端 / 东端）1F、2F 一起切掉一块，
 * 角上的房间变成 L 形或变浅（用水房间、厨房、走廊不切）；切掉的地方是院子。屋顶按外轮廓自动拼成交叉的两块。
 */
function shapeHouse(c: Ctx, f1: Room[], f2: Room[], W: number, dS: number, eastOk: boolean) {
  if (!c.altChance(0.4)) return false
  const rule = defaultRule({ ldk: 16.5, dining: 6, western: 7.3 }, 0.75)
  const sides = eastOk && c.altChance(0.5) ? ['e', 'w'] : ['w', 'e']
  const r10 = (v: number) => Math.round(v / 10) * 10
  const ds = [0.5, 0.42, 0.34].map((k) => r10(dS * k))
  const d0 = Math.floor(c.alt() * ds.length)
  const wk = c.alt()
  for (const side of sides) {
    if (side === 'e' && !eastOk) continue
    // 凹口宽度：贴着 1F / 2F 角上那间房的开间取（整间 / 一部分），切出来的房间不会剩下一条窄边
    const at = (rooms: Room[]) => rooms.find((r) => pointInPolygon({ x: side === 'w' ? 5 : W - 5, y: 5 }, r.points))
    const widths = [at(f1), at(f2)].flatMap((r) => {
      if (!r) return []
      const xs = r.points.map((p) => p.x)
      const rw = Math.max(...xs) - Math.min(...xs)
      return [rw, r10(rw * (0.4 + wk * 0.2))]
    })
    const ws = [...new Set(widths)].filter((w) => w >= 200 && w <= W * 0.5)
    const w0 = Math.floor(c.alt() * Math.max(1, ws.length))
    for (let i = 0; i < ws.length; i++)
      for (let j = 0; j < ds.length; j++) {
        const w = ws[(w0 + i) % ws.length]
        const d = ds[(d0 + j) % ds.length]
        if (carveFloors([f1, f2], { x0: side === 'w' ? 0 : W - w, x1: side === 'w' ? w : W, y0: 0, y1: d }, rule)) return true
      }
  }
  return false
}

// ---------------------------------------------------------------------------
// 第二阶段：设备（按层，在子户型里摆）
// ---------------------------------------------------------------------------

function furnish({ c, plan, placed }: HouseLayout): Plan {
  const region = plan.region ?? 'jp'
  for (const fl of planFloors(plan)) {
    const view = floorView(plan, fl.id)
    // 子户型的设备数组是筛出来的副本：摆好的设备同时记到原户型里。
    // 上层的楼梯洞口、楼梯口留空的地方当作障碍（只在这份子户型里，不写回户型）
    view.fixtures = withStairKeepout(plan, view, fl.id).fixtures.slice()
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

/** 和平层同一套路（searchWithArea）：面积合格且合规、通过骨架抽签的第一个胜出，否则给最接近的 */
export function generateHouseWithArea(opts: HouseGenOpts, attempts = 300, keep?: (seed: number) => boolean): { plan: Plan; seed: number; matched: boolean } {
  return searchWithArea({
    seed: opts.seed,
    minArea: opts.minArea,
    maxArea: opts.maxArea,
    attempts,
    key: `house|${opts.region}|${opts.dwelling}|${opts.bedrooms}`,
    keep,
    layout: (seed) => layout(seed, opts),
    layoutOk: (l) => houseViolations(l, false).length === 0,
    furnish,
    ok: (_plan, l) => houseViolations(l, true).length === 0,
  })
}

/** 测试用：只做布局 + 设备，不试种子 */
export function generateHouseRaw(opts: HouseGenOpts) {
  const l = layout(opts.seed, opts)
  return { ...l, plan: furnish(l) }
}

