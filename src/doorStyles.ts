// 门的款式（Opening.doorStyle / doorColor / doorHandle / handleFinish / doorLites）：默认色、默认把手、读档校验、生成户型时按地区配的缺省款式。
// 3D 模型在 three/doorModels.ts。都不填的门 = 旧存档的样子（平板门扇 + 小方块把手、入户门浅蓝、推拉门米色带浅色内框）。

import { DOOR_HANDLES, DOOR_LITES, DOOR_STYLES, HANDLE_FINISHES, type DoorHandle, type DoorLeafStyle, type DoorLites, type HandleFinish, type Opening, type OpeningKind, type Plan, type Region, type Room } from './model'

export type DoorKind = Exclude<OpeningKind, 'window'>
export const isDoorKind = (k: OpeningKind): k is DoorKind => k !== 'window'

/** 旧存档的门扇颜色（款式、颜色都不填时） */
export const LEGACY_DOOR = '#f6dcc0'
export const LEGACY_ENTRANCE = '#8fb7d9'
export const LEGACY_SLIDING = '#f3e1c7'

/** 各种门可选的款式（界面上按门的种类列出；数据上任何款式放在任何门上都能画） */
export const STYLES_FOR: Record<DoorKind, DoorLeafStyle[]> = {
  door: ['flush', 'panel2', 'panel4', 'panel6', 'glassTop', 'glassFull', 'louver', 'grooved'],
  sliding: ['flush', 'panel2', 'glassTop', 'glassFull', 'louver', 'fusuma', 'fusumaPattern', 'shoji', 'barn'],
  folding: ['flush', 'panel2', 'glassFull', 'louver', 'shoji'],
}

/** 门扇颜色：填了用填的；没填按款式（襖是纸色、障子是木框色、谷仓门深木色），其余同旧存档 */
export function doorColor(o: Pick<Opening, 'kind' | 'doorStyle' | 'doorColor'>, entrance: boolean): string {
  if (o.doorColor) return o.doorColor
  switch (o.doorStyle) {
    case 'fusuma':
    case 'fusumaPattern':
      return '#f1e8d2'
    case 'shoji':
      return '#d9bb8b'
    case 'barn':
      return '#8f6440'
  }
  if (o.kind === 'door') return entrance ? LEGACY_ENTRANCE : LEGACY_DOOR
  return LEGACY_SLIDING
}

/** 实际画的把手：填了用填的；没填按款式 / 门的种类（开门执手、横纹门长拉手、推拉 / 折叠门嵌入式拉手、谷仓门长拉手） */
export function doorHandleOf(o: Pick<Opening, 'kind' | 'doorStyle' | 'doorHandle'>): DoorHandle {
  if (o.doorHandle) return o.doorHandle
  if (o.doorStyle === 'grooved' || o.doorStyle === 'barn') return 'bar'
  return o.kind === 'door' ? 'lever' : 'pull'
}

export const handleColor = (o: Pick<Opening, 'handleFinish'>) => HANDLE_FINISHES[o.handleFinish ?? 'silver'].color

/** 门有没有设过款式相关的字段（都没设 = 旧存档的样子，3D 走原来的几何） */
export const doorStyled = (o: Pick<Opening, 'doorStyle' | 'doorColor' | 'doorHandle' | 'handleFinish' | 'doorLites'>) =>
  o.doorStyle !== undefined || o.doorColor !== undefined || o.doorHandle !== undefined || o.handleFinish !== undefined || o.doorLites !== undefined

/** 带亮子的开门：墙洞开到多高（门扇还是 198 高，上面一条固定玻璃） */
export const TRANSOM_TOP = 226
export const hasTransom = (o: Pick<Opening, 'kind' | 'doorLites'>) => o.kind === 'door' && (o.doorLites === 'top' || o.doorLites === 'both')
export const hasSidelight = (o: Pick<Opening, 'kind' | 'doorLites'>) => o.kind === 'door' && (o.doorLites === 'side' || o.doorLites === 'both')
/** 侧窗宽：门洞宽的 ~28%，夹在 22~40 */
export const sidelightWidth = (w: number) => Math.max(22, Math.min(40, w * 0.28))

const STYLES = Object.keys(DOOR_STYLES) as DoorLeafStyle[]
const HANDLES = Object.keys(DOOR_HANDLES) as DoorHandle[]
const FINISHES = Object.keys(HANDLE_FINISHES) as HandleFinish[]
const LITES = Object.keys(DOOR_LITES) as DoorLites[]
const HEX = /^#[0-9a-f]{6}$/

/** 读档校验：坏值、缺省值删掉（不锈钢把手不写），窗上的门字段整个去掉；颜色统一成小写 #rrggbb */
export function normalizeDoor(o: Opening) {
  if (o.kind === 'window') {
    delete o.doorStyle
    delete o.doorColor
    delete o.doorHandle
    delete o.handleFinish
    delete o.doorLites
    delete o.foldLeaves
    return
  }
  if (o.doorStyle !== undefined && !STYLES.includes(o.doorStyle)) delete o.doorStyle
  if (o.doorColor !== undefined) {
    const c = typeof o.doorColor === 'string' ? o.doorColor.toLowerCase() : ''
    if (HEX.test(c)) o.doorColor = c
    else delete o.doorColor
  }
  if (o.doorHandle !== undefined && !HANDLES.includes(o.doorHandle)) delete o.doorHandle
  if (o.handleFinish !== undefined && (!FINISHES.includes(o.handleFinish) || o.handleFinish === 'silver')) delete o.handleFinish
  if (o.doorLites !== undefined && (!LITES.includes(o.doorLites) || o.kind !== 'door')) delete o.doorLites
  if (o.foldLeaves !== undefined && ((o.foldLeaves !== 3 && o.foldLeaves !== 4) || o.kind !== 'folding')) delete o.foldLeaves
}

// ---------- 生成户型时的缺省款式 ----------

/** 种子散列（同 windows.ts；单独一份，和布局的随机序列无关） */
function seedUnit(seed: number, k: number) {
  let h = (Math.imul(seed | 0, 2654435761) ^ Math.imul(k + 0x5d31, 40503)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function weighted<T>(list: readonly [T, number][], u: number): T {
  const total = list.reduce((s, [, w]) => s + w, 0)
  let x = u * total
  for (const [v, w] of list) {
    if ((x -= w) < 0) return v
  }
  return list[list.length - 1][0]
}
const hex = (label: string) => ({ white: '#f6f4ef', ivory: '#eee4d0', light: '#e2c49a', mid: '#b98757', dark: '#6f4b33', black: '#2f3134', grey: '#8e949b', navy: '#2f4a6b', sage: '#9cb39a', red: '#9a4436' })[label]!

/** 门洞另一侧的房间（两侧各探 25cm，取不是本房间的那个）；外墙上的门返回 null */
export function roomAcross(plan: Pick<Plan, 'rooms'>, o: Opening, owner: Room): Room | null {
  const e = owner.points[o.edge]
  const f = owner.points[(o.edge + 1) % owner.points.length]
  if (!e || !f) return null
  const L = Math.hypot(f.x - e.x, f.y - e.y) || 1
  const d = { x: (f.x - e.x) / L, y: (f.y - e.y) / L }
  const t = Math.max(0, Math.min(L, o.offset))
  const c = { x: e.x + d.x * t, y: e.y + d.y * t }
  for (const k of [1, -1]) {
    const p = { x: c.x - d.y * 25 * k, y: c.y + d.x * 25 * k }
    const r = plan.rooms.find((x) => x !== owner && x.kind !== 'void' && inside(p, x.points))
    if (r) return r
  }
  return null
}

function inside(p: { x: number; y: number }, pts: { x: number; y: number }[]) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const LIVING = ['ldk', 'dining', 'kitchen']

/**
 * 给新生成的户型配门：地区决定整套门扇样式 / 颜色 / 把手，门两侧的房间决定细节。只写门的款式字段，不碰布局（种类、宽度、开向都不变）。
 *   日式：室内平板门（白 / 浅木 / 中木），执手；和室的推拉门是襖，收纳是平板；浴室折叠门是白色玻璃门；玄关门横纹（深色）、户建偶尔带侧窗。
 *   欧美：白色四格 / 六格门，球形或执手（黄铜 / 黑 / 银）；客厅通到户外、阳台的门是玻璃格子门；折叠门百叶；入户门六格或上部玻璃（藏青 / 砖红 / 黑 / 灰绿），户建带侧窗或亮子。
 *   中式：木色平板门（中木 / 深木 / 浅木），执手；厨房、阳台的推拉门是灰框玻璃门；入户门深灰横纹（防盗门）。
 */
export function styleDoors(plan: Plan, region: Region, seed: number) {
  const u = (k: number) => seedUnit(seed, k)
  const house = !!plan.site
  let inner: DoorLeafStyle
  let innerColor: string
  let finish: HandleFinish = 'silver'
  let handle: DoorHandle | undefined
  let entryStyle: DoorLeafStyle
  let entryColor: string
  let entryLites: DoorLites | undefined
  if (region === 'jp') {
    inner = 'flush'
    innerColor = hex(weighted([['white', 4], ['light', 3], ['mid', 2], ['ivory', 1]], u(1)))
    entryStyle = 'grooved'
    entryColor = hex(weighted([['dark', 3], ['navy', 1.5], ['black', 1.5], ['grey', 1]], u(2)))
    if (house && u(3) < 0.35) entryLites = 'side'
  } else if (region === 'cn') {
    inner = weighted<DoorLeafStyle>([['flush', 6], ['panel2', 2]], u(1))
    innerColor = hex(weighted([['mid', 4], ['dark', 3], ['light', 2], ['white', 1]], u(2)))
    entryStyle = 'grooved'
    entryColor = weighted([['#5b6168', 2], [hex('dark'), 2], [hex('black'), 1]], u(3))
    finish = weighted<HandleFinish>([['silver', 3], ['black', 1]], u(4))
  } else {
    inner = weighted<DoorLeafStyle>([['panel6', 5], ['panel4', 3], ['panel2', 2]], u(1))
    innerColor = hex('white')
    handle = weighted<DoorHandle>([['knob', 3], ['lever', 2]], u(2))
    finish = weighted<HandleFinish>([['brass', 3], ['silver', 2], ['black', 2]], u(3))
    entryStyle = weighted<DoorLeafStyle>([['panel6', 3], ['glassTop', 2], ['panel4', 1]], u(4))
    entryColor = hex(weighted([['navy', 3], ['red', 2], ['black', 2], ['sage', 1.5], ['white', 1]], u(5)))
    if (house) entryLites = weighted<DoorLites | undefined>([['side', 2], ['top', 1.5], ['both', 1], [undefined, 2]], u(6))
  }
  for (const o of plan.openings) {
    if (o.kind === 'window') continue
    const owner = plan.rooms.find((r) => r.id === o.roomId)
    if (!owner) continue
    const across = roomAcross(plan, o, owner)
    const kinds = [owner.kind, across?.kind]
    // 入户门：玄关在外墙上的开门
    if (o.kind === 'door' && owner.kind === 'entrance' && (!across || across.kind === 'balcony')) {
      o.doorStyle = entryStyle
      o.doorColor = entryColor
      if (region !== 'west') o.doorHandle = 'bar'
      else if (handle) o.doorHandle = handle === 'knob' ? 'lever' : handle
      if (finish !== 'silver') o.handleFinish = finish
      // 侧窗要门洞够宽（侧窗占掉的部分后门扇还剩 ≥ 75）
      if (entryLites && (entryLites === 'top' || o.width - sidelightWidth(o.width) >= 75)) o.doorLites = entryLites
      continue
    }
    const outdoor = !across || across.kind === 'balcony'
    if (o.kind === 'sliding') {
      if (kinds.includes('japanese')) {
        o.doorStyle = region === 'jp' && u(20) < 0.3 ? 'fusumaPattern' : 'fusuma'
      } else if (region === 'cn' && (kinds.includes('kitchen') || kinds.includes('balcony') || outdoor)) {
        o.doorStyle = 'glassFull'
        o.doorColor = '#5b6168'
      } else if (region === 'west' && LIVING.some((k) => kinds.includes(k as Room['kind'])) && u(21) < 0.35) {
        o.doorStyle = 'barn'
      } else {
        o.doorStyle = region === 'west' ? 'panel2' : 'flush'
        o.doorColor = innerColor
      }
      continue
    }
    if (o.kind === 'folding') {
      if (kinds.includes('bath')) {
        o.doorStyle = 'glassFull'
        o.doorColor = hex('white')
      } else {
        o.doorStyle = region === 'west' ? 'louver' : 'flush'
        o.doorColor = innerColor
      }
      continue
    }
    // 开门
    if (region === 'west' && outdoor && LIVING.some((k) => kinds.includes(k as Room['kind']))) o.doorStyle = 'glassFull'
    else if (kinds.includes('japanese') && region === 'jp') o.doorStyle = 'flush'
    else o.doorStyle = inner
    o.doorColor = innerColor
    if (handle) o.doorHandle = handle
    if (finish !== 'silver') o.handleFinish = finish
  }
}
