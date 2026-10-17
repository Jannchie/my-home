// 一键布置的电脑工位：台式主机必须配显示器、每人最多一台主机；显示器按职业 / 兴趣挑单屏、双屏、三屏、竖屏、横 + 竖组合，
// 桌宽不够就减屏；主机放在桌上一侧或桌下（贴着桌腿一侧，不和椅子打架）。
// 另外两件收尾：夹式 / 条形摄像头一律夹到显示器（或电视）顶边正中，没有屏幕就不放；
// 便签贴在显示器边框外沿、桌子背后的墙上、冰箱门上，书桌桌面散几张。
// 由 decorate.ts 的 Decorator 调用（computersForChairs → workstations，最后 deskExtras）。

import { boxOverlaps, dist, edgesOf, fixtureBox, openingsOn, pointInPolygon, uid, type Box, type Furniture, type Plan, type Room, type Vec } from './model'
import { ASSET_MAP, type AssetDef } from './three/assets'
import { screenPoint, type ScreenPanel } from './three/kit'
import { fitsOnSurface, snapToClip, toLocal, toWorld } from './surface'
import { furnitureBox } from './snap'
import { boxInsideWalls } from './place'
import { levelOf, type Household, type Member } from './household'
import { wallThicknessAt } from './walls'
import { isMainAppliance } from './appliance'
import { hasTag, type Sel } from './three/tags'

/** Decorator 里这里要用到的部分（都是公开成员） */
export interface DeskHost {
  out: Furniture[]
  flat: Set<string>
  parentOf: Map<string, string>
  pick<T>(xs: T[]): T
  shuffle<T>(a: T[]): T[]
  find(sel: Sel, filter?: (d: AssetDef) => boolean): AssetDef[]
  peopleIn(room: Room): Member[]
  readonly clutter: number
  colorFor(def: AssetDef): number
  /** 立体上不冲突：不顶到墙上挂的东西、不插进窗帘（见 Decorator.clear3d） */
  clear3d(asset: string, x: number, y: number, rot: number, z?: number, ignore?: Set<string>): boolean
}
export interface DeskCtx {
  d: DeskHost
  plan: Plan
  rand: () => number
  household?: Household
}

const def = (f: Furniture) => ASSET_MAP.get(f.asset)
/** 需要配电脑的椅子 */
const isOfficeChair = (f: Furniture) => hasTag(def(f), 'office-chair', 'gaming-chair')
/** 椅子、凳子 */
const isSeat = (f: Furniture) => hasTag(def(f), 'seat')
const isLaptop = (f: Furniture) => hasTag(def(f), 'laptop')
const isKeyboard = (f: Furniture) => hasTag(def(f), 'keyboard')
/** 台式主机：机箱、迷你主机 */
export const isTower = (d?: AssetDef) => !!d && (d.type === 'pc' || d.id === 'of-mini-pc')
/** 显示器（有屏幕面板、不是电视 / 一体机） */
export const isMonitor = (d?: AssetDef) => !!d?.screens?.length && d.type !== 'tv' && d.id !== 'of-aio'
/** 能放电脑的书桌 / 工作台（desk 标签不含园艺台、焊接台） */
const isDeskDef = (d?: AssetDef) => !!d && !!d.surface && !d.prop && !d.mount && hasTag(d, 'desk')
/** 屏幕顶边能夹东西的（显示器、电视、一体机） */
const hasClip = (d?: AssetDef) => !!d?.surfaces?.some((l) => l.kind === 'clip' && l.shape?.length)
const round1 = (v: number) => Math.round(v * 10) / 10

/** 显示器组合 */
type Rig = 'single' | 'dual' | 'triple' | 'portrait' | 'combo'
const RIG_IDS: Record<Rig, string[]> = {
  single: ['prop-monitor', 'prop-monitor-27'],
  dual: ['prop-monitor-dual'],
  triple: ['mon-triple-22'],
  portrait: ['mon-portrait-24'],
  combo: ['mon-combo-hv'],
}
const FALLBACK: Record<Rig, Rig[]> = {
  triple: ['dual', 'combo', 'single', 'portrait'],
  dual: ['combo', 'single', 'portrait'],
  combo: ['dual', 'single', 'portrait'],
  single: ['portrait'],
  portrait: ['single'],
}

interface Seat {
  desk: Furniture
  room: Room
  /** 座位在桌子局部坐标里的 x（双人桌两个座位） */
  x: number
  /** 这个座位能用的桌宽 */
  zone: number
  owner?: Member
  chair?: Furniture
  desktop?: string
}

/** 每次布置记下工位：screenCams 决定谁的显示器上加摄像头、deskExtras 按主人贴便签 */
const SEATS = new WeakMap<DeskHost, Seat[]>()

/** 显示器组合的权重：程序员、主播、设计、重度玩家多屏概率高 */
function rigWeights(m: Member | undefined): [Rig, number][] {
  const job = m?.job
  const game = m ? levelOf(m, 'gaming') : 0
  const tech = m ? levelOf(m, 'tech') : 0
  const stream = m ? levelOf(m, 'streaming') : 0
  let w: Record<Rig, number> = { single: 6, dual: 1, triple: 0.1, portrait: 0.3, combo: 0.3 }
  if (job === 'programmer') w = { single: 1.5, dual: 3, triple: 1.2, portrait: 1, combo: 2.5 }
  else if (job === 'streamer') w = { single: 1, dual: 3, triple: 2, portrait: 0.4, combo: 1.5 }
  else if (job === 'designer' || job === 'photographer') w = { single: 3, dual: 2, triple: 0.3, portrait: 0.8, combo: 1 }
  else if (job === 'engineer' || job === 'researcher' || job === 'musician') w = { single: 3, dual: 2.5, triple: 0.5, portrait: 0.5, combo: 1 }
  if (game >= 2) {
    w.single += 2
    w.triple += game >= 3 ? 1.2 : 0.2
  }
  if (tech >= 2) {
    w.dual += 1
    w.triple += 0.5
    w.combo += 0.5
  }
  if (stream >= 2) w.dual += 1.5
  return Object.entries(w) as [Rig, number][]
}

/**
 * 工位：收走全屋的台式主机，按「想要主机的房间」重新分配到书桌座位上（每人最多一台），
 * 有主机的座位一定配显示器（摆不下显示器就连主机也不放）；其余办公椅 / 电竞椅前的桌子补笔记本或主机。
 */
export function workstations(c: DeskCtx) {
  const { d, plan, rand } = c
  const roomOf = (p: Vec) => plan.rooms.find((r) => pointInPolygon(p, r.points))
  const removeTree = (f: Furniture) => {
    const gone = new Set([f.id])
    let grew = true
    while (grew) {
      grew = false
      for (const o of d.out) if (!gone.has(o.id) && gone.has(d.parentOf.get(o.id) ?? '')) (gone.add(o.id), (grew = true))
    }
    d.out = d.out.filter((o) => !gone.has(o.id))
  }
  const weighted = <T,>(items: [T, number][]) => {
    let r = rand() * items.reduce((s, [, w]) => s + w, 0)
    for (const [v, w] of items) if ((r -= w) <= 0) return v
    return items[items.length - 1][0]
  }

  // 1. 收走所有主机，记下各房间想要几台（兴趣等级、电竞房、双人电竞台摆的）
  const wanted: { room: Room; asset: string }[] = []
  for (const o of [...d.out]) {
    if (!isTower(def(o))) continue
    const r = roomOf(o)
    if (r) wanted.push({ room: r, asset: o.asset })
    removeTree(o)
  }
  // 2. 不在桌上的显示器（撒到书架、柜子上的）收走
  for (const o of [...d.out]) {
    if (!isMonitor(def(o))) continue
    const p = d.out.find((x) => x.id === d.parentOf.get(o.id))
    // 只认桌面（工作台下层的搁板不算）
    if (!p || !isDeskDef(def(p)) || Math.abs((o.z ?? 0) - (p.z ?? 0) - def(p)!.surface!) > 0.6) removeTree(o)
  }

  // 3. 座位：每张书桌一个（双人桌两个），找椅子和主人
  const seats: Seat[] = []
  for (const desk of d.out.filter((o) => !o.z && isDeskDef(def(o)))) {
    const room = roomOf(desk)
    if (!room) continue
    const dd = def(desk)!
    const duo = dd.w >= 180 && hasTag(dd, 'duo-desk')
    for (const x of duo ? [-dd.w / 4, dd.w / 4] : [0]) {
      const chair = d.out
        .filter((o) => !o.z && isSeat(o) && dist(o, desk) < 130)
        .map((o) => ({ o, l: toLocal(desk, o) }))
        .filter(({ l }) => l.y > -dd.d / 2 && Math.abs(l.x - x) < (duo ? dd.w / 4 : dd.w / 2) + 10)
        .sort((a, b) => Math.abs(a.l.x - x) - Math.abs(b.l.x - x))[0]?.o
      seats.push({ desk, room, x, zone: duo ? dd.w / 2 : dd.w, chair })
    }
  }
  const officeChair = (s: Seat) => !!s.chair && isOfficeChair(s.chair)
  // 主人：房间里的人（住的人 + 书房主人）依次分到各座位，办公椅、宽桌优先
  for (const room of plan.rooms) {
    const ss = seats.filter((s) => s.room === room).sort((a, b) => +officeChair(b) - +officeChair(a) || def(b.desk)!.w - def(a.desk)!.w)
    const people = d.peopleIn(room).filter((m) => m.age >= 6)
    ss.forEach((s, i) => (s.owner = people.length ? people[i % people.length] : undefined))
  }

  // 4. 分配主机：每人最多一台；没主人的座位（客厅的书桌）每个房间最多一台
  const owned = new Set<Member>()
  const roomTaken = new Set<string>()
  const canHave = (s: Seat) => !s.desktop && (s.owner ? !owned.has(s.owner) : !roomTaken.has(s.room.id)) && s.zone >= 70
  const give = (s: Seat, asset: string) => {
    s.desktop = asset
    if (s.owner) owned.add(s.owner)
    else roomTaken.add(s.room.id)
  }
  for (const w of wanted) {
    const order = (ss: Seat[]) => ss.filter(canHave).sort((a, b) => +officeChair(b) - +officeChair(a) || b.zone - a.zone)
    let s = order(seats.filter((x) => x.room === w.room))[0]
    // 这个房间没有桌子：主机跟着房间的主人走，放到他在别的房间的书桌上
    if (!s) {
      const people = new Set(d.peopleIn(w.room))
      s = order(seats.filter((x) => x.owner && people.has(x.owner)))[0]
    }
    if (s) give(s, w.asset)
  }
  // 电竞椅前的桌子：主人还没有主机就配一台
  for (const s of seats) {
    if (!s.chair || !hasTag(def(s.chair), 'gaming-chair') || !canHave(s)) continue
    const game = s.owner ? levelOf(s.owner, 'gaming') : 1
    const ids = game >= 3 ? ['of-pc-mid', 'of-pc-full'] : ['of-pc-mid-plain', 'of-pc-itx', 'of-pc-mid']
    give(s, d.pick(ids.filter((id) => ASSET_MAP.has(id))))
  }

  // 5. 摆：主机（桌下 / 桌上）+ 显示器组合 + 键盘
  for (const s of seats) if (s.desktop && !setupDesktop(c, s, weighted)) s.desktop = undefined
  // 6. 其余办公椅前的桌子：没有电脑就补笔记本（重度用户偶尔再接一台外接显示器）
  for (const s of seats) {
    if (s.desktop || !officeChair(s)) continue
    if (onSeat(c, s).some((o) => isMonitor(def(o)) || isLaptop(o) || hasTag(def(o), 'aio-pc'))) continue
    const dd = def(s.desk)!
    const laptops = d.find('laptop', (a) => !!a.prop && !a.stick && a.form !== 'closed' && !a.form?.includes('hanging') && a.w <= s.zone * 0.6 && a.d <= dd.d * 0.6)
    if (!laptops.length) continue
    const heavy = !!s.owner && ['programmer', 'designer', 'engineer', 'researcher', 'streamer'].includes(s.owner.job)
    const ext = heavy && rand() < 0.45
    if (ext) placeOnDesk(c, s, 'prop-monitor', 0, 'back')
    placeOnDesk(c, s, d.pick(laptops).id, ext ? 1 : 0, ext ? 'front' : 'mid')
  }
  SEATS.set(d, seats)
  // 摄像头上屏幕顶边：在 dress / 补格子之前做，挪走书架上的摄像头后那一格还会被补上
  screenCams(c)
}

/** 座位那一段桌面上的东西 */
function onSeat(c: DeskCtx, s: Seat) {
  const dd = def(s.desk)!
  const top = (s.desk.z ?? 0) + dd.surface!
  return c.d.out.filter((o) => c.d.parentOf.get(o.id) === s.desk.id && Math.abs((o.z ?? 0) - top) < 0.6 && Math.abs(toLocal(s.desk, o).x - s.x) <= s.zone / 2 + 1)
}

/** 摆到桌面局部坐标 (lx, lz)：整块在台面内、不和同一台面上的任何东西（含主机）重叠；不受同类数量限制 */
function putOn(c: DeskCtx, parent: Furniture, asset: string, lx: number, lz: number, lrot = 0) {
  const pd = def(parent)!
  const a = ASSET_MAP.get(asset)
  if (!a || !pd.surface) return null
  const z = (parent.z ?? 0) + pd.surface
  const p = toWorld(parent, lx, lz)
  const f: Furniture = { id: uid('u'), asset, x: round1(p.x), y: round1(p.y), rot: (parent.rot + lrot + 360) % 360, color: c.d.colorFor(a), z }
  if (!fitsOnSurface(parent, z, asset, f.x, f.y, f.rot)) return null
  const box = furnitureBox(asset, f.x, f.y, f.rot)
  const shrink = (b: Box): Box => ({ x0: b.x0 + 0.4, y0: b.y0 + 0.4, x1: b.x1 - 0.4, y1: b.y1 - 0.4 })
  if (c.d.out.some((o) => o !== parent && Math.abs((o.z ?? 0) - z) < 0.6 && !def(o)?.stick && boxOverlaps(shrink(box), shrink(furnitureBox(o.asset, o.x, o.y, o.rot))))) return null
  if (!c.d.clear3d(asset, f.x, f.y, f.rot, z, new Set([parent.id]))) return null
  c.d.out.push(f)
  c.d.flat.add(f.id)
  c.d.parentOf.set(f.id, parent.id)
  return f
}

/** 在座位那段桌面上找个位置放：back 靠后（显示器）、front 靠前（键盘）、mid 中间；dx 往右偏的格数 */
function placeOnDesk(c: DeskCtx, s: Seat, asset: string, dx: number, row: 'back' | 'front' | 'mid', center = s.x) {
  const dd = def(s.desk)!
  const a = ASSET_MAP.get(asset)
  if (!a) return null
  const back = -dd.d / 2 + a.d / 2 + 1.5
  const front = dd.d / 2 - a.d / 2 - 3
  const zs = row === 'back' ? [back, back + 4, back + 9] : row === 'front' ? [front, front - 4, 0] : [dd.d * 0.05, 0, dd.d * 0.15]
  const half = s.zone / 2
  for (const lz of zs)
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8]) {
      const lx = center + dx * 12 + k * 5
      if (Math.abs(lx - s.x) + a.w / 2 > half + 0.5) continue
      const f = putOn(c, s.desk, asset, lx, lz)
      if (f) return f
    }
  return null
}

/** 桌下放主机：贴着这一侧的桌腿、靠后，不和椅子、垃圾桶、抽屉柜打架 */
/**
 * 各款书桌桌下能放主机的地方（和 tables.ts / assets.ts 里的模型一致）：
 * sides 只有这一侧是空的（另一侧是抽屉柜 / 侧板 / 主机格）；edge 主机离桌边多远（让开桌腿、侧板）；
 * back 高于 40 的主机离桌背多远（让开挡板）；apron 桌面下的抽屉 / 横档厚度；no 桌下不放（低横撑、整面侧板）
 */
const UNDER: Record<string, { sides?: number[]; edge?: number; back?: number; apron?: number; no?: boolean }> = {
  desk: { sides: [-1], edge: 7 },
  'tbl-desk-80': { edge: 7, apron: 10 },
  'tbl-desk-120': { sides: [-1], edge: 7 },
  'tbl-desk-140': { edge: 8, back: 10.5 },
  'tbl-desk-160': { edge: 9 },
  'tbl-desk-l-left': { sides: [1], edge: 8 },
  'tbl-desk-l-right': { sides: [-1], edge: 8 },
  'tbl-desk-u': { no: true },
  'tbl-desk-fan': { no: true },
  'tbl-desk-lift': { edge: 12 },
  'tbl-desk-pc': { sides: [-1], edge: 7 },
  'tbl-desk-iron-120': { no: true },
  'tbl-desk-iron-150': { no: true },
  'tbl-desk-waterfall-100': { edge: 6, back: 10.5 },
  'tbl-desk-waterfall-140': { edge: 6, back: 10.5 },
  'hg-duo-gaming-desk': { edge: 9 },
  'hg-duo-desk': { edge: 8 },
}

/**
 * 地上放主机：outside = false 在桌下贴着这一侧的桌腿、靠后；outside = true 在桌子这一侧的外面、贴着桌腿。
 * 不和椅子（扶手、椅脚按收进 4cm 算）、垃圾桶、抽屉柜、设备打架
 */
function floorTower(c: DeskCtx, s: Seat, asset: string, side: number, outside = false) {
  const dd = def(s.desk)!
  const tw = ASSET_MAP.get(asset)!
  const u = UNDER[dd.id] ?? {}
  if (!outside) {
    if (u.no || (u.sides && !u.sides.includes(side))) return null
    const back = tw.h > 40 ? (u.back ?? 4) : 4
    if (dd.surface! - (u.apron ?? 0) - tw.h < 3 || tw.d > dd.d - back - 2) return null
    if ((dd.surfaces ?? []).some((l) => l.kind !== 'clip' && l.y < tw.h + 2)) return null
    if (hasTag(dd, 'loft', 'for-kids')) return null
  } else if (s.x && Math.sign(s.x) !== side) return null
  const lx = outside ? s.x + side * (s.zone / 2 + tw.w / 2 + 2) : s.x + side * (s.zone / 2 - tw.w / 2 - (u.edge ?? 8))
  const lz = -dd.d / 2 + tw.d / 2 + (outside ? 1 : tw.h > 40 ? (u.back ?? 4) : 4)
  const p = toWorld(s.desk, lx, lz)
  const box = furnitureBox(asset, p.x, p.y, s.desk.rot)
  if (!boxInsideWalls(box, s.room, c.plan)) return null
  if (c.plan.fixtures.some((fx) => boxOverlaps(box, fixtureBox(fx)))) return null
  const solid = c.d.out.filter((o) => o !== s.desk && !o.z && !c.d.flat.has(o.id) && !def(o)?.mount && !def(o)?.stick && (def(o)?.h ?? 0) > 3)
  const boxOf = (o: Furniture) => {
    const b = furnitureBox(o.asset, o.x, o.y, o.rot)
    const k = isSeat(o) ? 4 : 0
    return { x0: b.x0 + k, y0: b.y0 + k, x1: b.x1 - k, y1: b.y1 - k }
  }
  if (solid.some((o) => boxOverlaps(box, boxOf(o)))) return null
  // 墙上挂的东西、窗帘（放到桌子外面、窗边时）
  if (!c.d.clear3d(asset, p.x, p.y, s.desk.rot)) return null
  // 门的开合范围、过道不能堵：放到桌子外面时也要在房间里留出门前空间
  if (outside && openingsOn(s.room, c.plan).some((o) => o.o.kind !== 'window' && dist(o.center, p) < o.o.width / 2 + tw.w / 2 + 50)) return null
  const f: Furniture = { id: uid('u'), asset, x: round1(p.x), y: round1(p.y), rot: s.desk.rot, color: c.d.colorFor(tw) }
  c.d.out.push(f)
  return f
}

/** 一个有主机的座位：主机 + 显示器组合 + 键盘；摆不下显示器就把主机也撤掉，返回 false */
function setupDesktop(c: DeskCtx, s: Seat, weighted: <T>(items: [T, number][]) => T) {
  const { d, rand } = c
  const dd = def(s.desk)!
  // 座位上原有的显示器换成按人挑的组合
  for (const o of onSeat(c, s)) if (isMonitor(def(o))) d.out = d.out.filter((x) => x !== o && d.parentOf.get(x.id) !== o.id)
  const asset = s.desktop!
  const tw = ASSET_MAP.get(asset)!
  const mini = asset === 'of-mini-pc'
  // 双人桌：主机放各自外侧；单人桌随机一侧
  const side = s.x ? Math.sign(s.x) : rand() < 0.5 ? -1 : 1
  let tower: Furniture | null = null
  let topSide = 0
  if (!mini && rand() < 0.75) tower = floorTower(c, s, asset, side) ?? floorTower(c, s, asset, -side) ?? (rand() < 0.5 ? floorTower(c, s, asset, side, true) ?? floorTower(c, s, asset, -side, true) : null)
  if (!tower && !mini) {
    for (const sd of [side, -side]) {
      const lx = s.x + sd * (s.zone / 2 - tw.w / 2 - 3)
      tower = putOn(c, s.desk, asset, lx, -dd.d / 2 + tw.d / 2 + 2)
      if (tower) {
        topSide = sd
        break
      }
    }
    // 桌上也放不下：再试一次桌下（不挑概率）
    if (!tower) tower = floorTower(c, s, asset, side) ?? floorTower(c, s, asset, -side) ?? floorTower(c, s, asset, side, true) ?? floorTower(c, s, asset, -side, true)
    if (!tower) return false
  }
  // 显示器：按人挑组合，桌宽不够就减屏
  const gamer = !!s.owner && levelOf(s.owner, 'gaming') >= 2
  const avail = s.zone - 1 - (topSide ? tw.w + 4 : 0)
  const center = s.x - topSide * (tw.w + 4) / 2
  const first = weighted(rigWeights(s.owner))
  const ids = [first, ...FALLBACK[first]].flatMap((r) => (r === 'single' && gamer ? ['of-monitor-gaming', ...RIG_IDS.single] : RIG_IDS[r]))
  const fits = ids.filter((id, i) => ids.indexOf(id) === i && ASSET_MAP.has(id)).filter((id) => ASSET_MAP.get(id)!.w <= avail && ASSET_MAP.get(id)!.d <= dd.d * 0.6)
  let mon: Furniture | null = null
  // 先试按人挑的那种；被摆件挡住就挪走普通摆件（台灯、杯子之类，dress 之后还会补）再试，最后才减屏
  const order = [...fits.slice(0, 1), ...d.shuffle(fits.slice(1, 3)), ...fits.slice(3)]
  const clear = () => {
    for (const o of onSeat(c, s)) if (o !== tower && !isLaptop(o) && !isKeyboard(o) && !isMonitor(def(o))) d.out = d.out.filter((x) => x !== o && d.parentOf.get(x.id) !== o.id)
  }
  if (order.length) {
    mon = placeOnDesk(c, s, order[0], 0, 'back', center)
    if (!mon) {
      clear()
      mon = placeOnDesk(c, s, order[0], 0, 'back', center)
    }
  }
  for (const id of order.slice(1)) if (!mon && (mon = placeOnDesk(c, s, id, 0, 'back', center))) break
  if (!mon) {
    if (tower) d.out = d.out.filter((x) => x !== tower)
    return false
  }
  if (mini) placeOnDesk(c, s, asset, 0, 'back', toLocal(s.desk, mon).x + (ASSET_MAP.get(mon.asset)!.w / 2 + 9) * side)
  // 键盘：座位上还没有就补一把，放在显示器正前方
  if (!onSeat(c, s).some(isKeyboard)) {
    const kb = d.find(gamer ? /^of-kb-.*-rgb$/ : /^(of-kb-(tkl|full|60)|prop-keyboard-mouse)$/, (a) => !!a.prop && a.w <= s.zone * 0.7)
    if (kb.length) placeOnDesk(c, s, d.pick(kb).id, 0, 'front', toLocal(s.desk, mon).x)
  }
  return true
}

// ---------- 收尾：摄像头、便签 ----------

/** 把一件 screenClip 的东西夹到这块屏幕顶边正中（多块屏挑 level 下标 li，不给就随机） */
export function clipOnScreen(c: DeskCtx, screen: Furniture, asset: string, li?: number) {
  const pd = def(screen)
  const a = ASSET_MAP.get(asset)
  const lvs = (pd?.surfaces ?? []).filter((l) => l.kind === 'clip' && l.shape?.length)
  if (!pd || !a || !lvs.length) return null
  const lv = lvs[li ?? Math.floor(c.rand() * lvs.length)] ?? lvs[0]
  const s = snapToClip(screen, lv.shape![0])
  const f: Furniture = { id: uid('u'), asset, x: s.x, y: s.y, rot: s.rot, color: c.d.colorFor(a), z: (screen.z ?? 0) + lv.y }
  if (!fitsOnSurface(screen, f.z!, asset, f.x, f.y, f.rot)) return null
  c.d.out.push(f)
  c.d.flat.add(f.id)
  c.d.parentOf.set(f.id, screen.id)
  return f
}

/** 屏幕顶边已经夹了东西 */
const clipped = (c: DeskCtx, screen: Furniture) => c.d.out.some((o) => c.d.parentOf.get(o.id) === screen.id && def(o)?.screenClip)

/**
 * 摄像头：夹式 / 条形机顶摄像头（以及桌上那种折起来的小摄像头）一律挪到同一房间显示器（条形的优先电视）的顶边正中；
 * 房间里没有屏幕就不放。主播、远程办公的人的显示器上按概率再加一个。
 */
function screenCams(c: DeskCtx) {
  const { d, plan, rand } = c
  const roomOf = (p: Vec) => plan.rooms.find((r) => pointInPolygon(p, r.points))
  const screensIn = (room: Room | undefined) => (room ? d.out.filter((o) => hasClip(def(o)) && pointInPolygon(o, room.points) && !clipped(c, o)) : [])
  const loose = d.out.filter((o) => def(o)?.screenClip || (o.asset === 'sf-webcam-lying' && isDeskDef(ASSET_MAP.get(d.out.find((p) => p.id === d.parentOf.get(o.id))?.asset ?? ''))))
  for (const cam of loose) {
    d.out = d.out.filter((o) => o !== cam)
    const asset = cam.asset === 'sf-webcam-lying' ? 'of-webcam' : cam.asset
    const all = screensIn(roomOf(cam))
    const tv = all.filter((o) => def(o)!.type === 'tv')
    const mons = all.filter((o) => def(o)!.type !== 'tv')
    const pool = asset === 'of-tv-camera' && tv.length ? tv : mons.length ? mons : tv
    if (pool.length) clipOnScreen(c, d.pick(pool), asset)
  }
  // 主播的每台显示器几乎都有摄像头；程序员、设计等远程办公偶尔装一个开视频会
  for (const s of SEATS.get(d) ?? []) {
    const mon = onSeat(c, s).find((o) => isMonitor(def(o)))
    if (!mon || clipped(c, mon)) continue
    const job = s.owner?.job
    const p = job === 'streamer' || (s.owner && levelOf(s.owner, 'streaming') >= 1) ? 0.9 : ['programmer', 'designer', 'researcher', 'engineer'].includes(job ?? '') ? 0.35 : 0.12
    if (rand() < p) clipOnScreen(c, mon, rand() < 0.85 ? 'of-webcam' : 'of-tv-camera', 0)
  }
}

/** 贴的便签（不含一大组的 sn-trio）和桌面便签 */
const stickNotes = () => [...ASSET_MAP.values()].filter((a) => a.id.startsWith('sn-') && a.stick && a.w <= 10.5 && a.h <= 11)
const deskNotes = () => [...ASSET_MAP.values()].filter((a) => a.id.startsWith('sn-desk'))

/** 贴附物在墙面上的竖直范围 vs 其他东西的竖直范围 */
function zRange(f: Furniture): [number, number] {
  const a = def(f)!
  if (a.stick) return [(f.z ?? 150) - a.h / 2, (f.z ?? 150) + a.h / 2]
  if (a.form === 'hanging') return [(f.z ?? 0) - a.h, f.z ?? 0]
  const z0 = a.mount ?? f.z ?? 0
  return [z0, z0 + a.h]
}

/** 一个人有多爱贴便签：东西多 / 随性的人贴得多，爱整洁 / 极简的少 */
function noteMood(c: DeskCtx, m?: Member) {
  let k = c.d.clutter
  if (m?.traits.includes('messy')) k *= 1.3
  if (m?.traits.includes('collector')) k *= 1.1
  if (m?.traits.includes('tidy')) k *= 0.7
  if (m?.traits.includes('minimal')) k *= 0.5
  return k
}

/** 新贴一张便签（color 在六组颜色里随机） */
function stickNote(c: DeskCtx, asset: string, x: number, y: number, rot: number, z: number, parent?: Furniture) {
  const f: Furniture = { id: uid('u'), asset, x: round1(x), y: round1(y), rot: Math.round((rot + 720) % 360), color: Math.floor(c.rand() * 6), z: round1(z) }
  c.d.out.push(f)
  c.d.flat.add(f.id)
  if (parent) c.d.parentOf.set(f.id, parent.id)
  return f
}

/** 显示器边框外沿：贴在最外侧两块面板的左右边框上，大半张伸出屏幕外，不挡画面中间 */
function bezelNotes(c: DeskCtx, mon: Furniture, n: number) {
  const md = def(mon)!
  const screens = md.screens ?? []
  if (!screens.length) return 0
  const pool = stickNotes()
  const xs = screens.map((s) => s.x)
  const edges: { s: ScreenPanel; side: number }[] = screens.length === 1 ? [-1, 1].map((side) => ({ s: screens[0], side })) : [{ s: screens[xs.indexOf(Math.min(...xs))], side: -1 }, { s: screens[xs.indexOf(Math.max(...xs))], side: 1 }]
  const used: { e: number; y0: number; y1: number }[] = []
  let done = 0
  for (let t = 0; t < n * 4 && done < n; t++) {
    const ei = Math.floor(c.rand() * edges.length)
    const { s, side } = edges[ei]
    const a = c.d.pick(pool)
    const y = s.y + a.h / 2 + 0.5 + c.rand() * Math.max(0, s.h - a.h - 1)
    if (used.some((u) => u.e === ei && y + a.h / 2 > u.y0 && y - a.h / 2 < u.y1)) continue
    const u = side * (s.w / 2 - a.w * 0.32)
    const bow = (s.bow ?? 0) * (u / (s.w / 2)) ** 2
    const [lx, lz] = screenPoint(s, u, s.t / 2 + 0.06 + bow)
    const p = toWorld(mon, lx, lz)
    stickNote(c, a.id, p.x, p.y, mon.rot - ((s.ry ?? 0) * 180) / Math.PI, (mon.z ?? 0) + y, mon)
    used.push({ e: ei, y0: y - a.h / 2, y1: y + a.h / 2 })
    done++
  }
  return done
}

/** 桌子背后的墙：显示器两侧或上方贴几张（避开门窗、壁挂、别的贴附物和桌上高的东西） */
function wallNotes(c: DeskCtx, s: Seat, mon: Furniture | undefined, n: number) {
  const { plan, d } = c
  const dd = def(s.desk)!
  const top = (s.desk.z ?? 0) + dd.surface!
  const backC = toWorld(s.desk, 0, -dd.d / 2)
  const ax = toWorld(s.desk, 1, 0)
  const axis = { x: ax.x - s.desk.x, y: ax.y - s.desk.y }
  // 桌背贴着的那面墙
  let gap: number | null = null
  let wallEdge: ReturnType<typeof edgesOf>[number] | null = null
  for (const e of edgesOf(s.room.points)) {
    if (Math.abs(e.dir.x * axis.x + e.dir.y * axis.y) < 0.99) continue
    const t = (backC.x - e.a.x) * e.dir.x + (backC.y - e.a.y) * e.dir.y
    if (t < 0 || t > e.length) continue
    const off = Math.abs((backC.x - e.a.x) * e.out.x + (backC.y - e.a.y) * e.out.y)
    const half = wallThicknessAt(plan, { x: e.a.x + e.dir.x * t, y: e.a.y + e.dir.y * t }, e.out, s.room) / 2
    const g = off - half
    if (g > -1 && g < 4 && (gap === null || g < gap)) ((gap = g), (wallEdge = e))
  }
  if (gap === null || !wallEdge) return 0
  const e = wallEdge
  const ops = openingsOn(s.room, plan).filter((o) => Math.abs(o.e.dir.x * e.dir.x + o.e.dir.y * e.dir.y) > 0.99 && Math.abs((o.center.x - e.a.x) * e.out.x + (o.center.y - e.a.y) * e.out.y) < 20)
  const pool = stickNotes()
  const md = mon ? def(mon) : undefined
  const mx = mon ? toLocal(s.desk, mon).x : s.x
  const mw = md?.w ?? 0
  const mtop = md ? top + md.h : top
  let done = 0
  for (let t = 0; t < n * 6 && done < n; t++) {
    const a = d.pick(pool)
    const above = c.rand() < 0.35
    const u = above ? mx + (c.rand() - 0.5) * Math.max(10, mw * 0.8) : mx + (c.rand() < 0.5 ? -1 : 1) * (mw / 2 + a.w / 2 + 3 + c.rand() * 22)
    if (Math.abs(u - s.x) > s.zone / 2 + 5) continue
    const z = above ? mtop + a.h / 2 + 3 + c.rand() * 6 : top + a.h / 2 + 12 + c.rand() * Math.max(5, (md?.h ?? 30) + 10)
    const p = toWorld(s.desk, u, -dd.d / 2 - gap + 0.06)
    if (ops.some((o) => Math.abs((p.x - o.center.x) * e.dir.x + (p.y - o.center.y) * e.dir.y) < o.o.width / 2 + a.w / 2 + 4)) continue
    const box = furnitureBox(a.id, p.x, p.y, s.desk.rot)
    // 桌子在墙角时，伸出桌边的便签不能贴进侧墙里
    if (!boxInsideWalls(box, s.room, plan)) continue
    const grown: Box = { x0: box.x0 - 1, y0: box.y0 - 1, x1: box.x1 + 1, y1: box.y1 + 1 }
    const [z0, z1] = [z - a.h / 2, z + a.h / 2]
    const clash = d.out.some((o) => {
      if (!def(o)) return false
      const [o0, o1] = zRange(o)
      return o0 < z1 + 1 && z0 - 1 < o1 && boxOverlaps(grown, furnitureBox(o.asset, o.x, o.y, o.rot))
    })
    if (clash) continue
    stickNote(c, a.id, p.x, p.y, s.desk.rot, z)
    done++
  }
  return done
}

/** 冰箱门：和冰箱贴一起贴 0–3 张 */
function fridgeNotes(c: DeskCtx) {
  const pool = stickNotes()
  for (const fr of c.d.out.filter((f) => !f.z && isMainAppliance(def(f), 'fridge'))) {
    const fd = def(fr)!
    // 冰箱贴那一步可能已经贴过便签：合起来 0–3 张
    const had = c.d.out.filter((o) => o.asset.startsWith('sn-') && dist(o, fr) < fd.w / 2 + fd.d / 2 + 2).length
    const n = Math.min(3, Math.floor(c.rand() * (0.8 + 1.6 * c.d.clutter))) - had
    for (let i = 0; i < n; i++) {
      const a = c.d.pick(pool)
      const p = toWorld(fr, (c.rand() - 0.5) * (fd.w - 20), fd.d / 2 - 3 + 0.3)
      const top = fd.h
      stickNote(c, a.id, p.x, p.y, fr.rot, Math.min(top - 15, 95 + c.rand() * 60) - (top < 140 ? Math.min(40, top - 50) * c.rand() : 0))
    }
  }
}

/** 布置最后一步：便签贴屏幕边框 / 桌后墙 / 冰箱门，书桌上散几张（摄像头在 workstations 里已经夹到屏幕顶边） */
export function deskExtras(c: DeskCtx) {
  const seats = SEATS.get(c.d) ?? []
  for (const s of seats) {
    if (!c.d.out.includes(s.desk)) continue
    const k = noteMood(c, s.owner)
    const mon = onSeat(c, s).find((o) => !!def(o)?.screens?.length)
    if (mon && c.rand() < Math.min(0.85, 0.5 * k)) {
      const n = Math.max(1, Math.min(4, Math.round((0.6 + c.rand() * 2.4) * k)))
      const onBezel = Math.round(n * (0.4 + c.rand() * 0.4))
      bezelNotes(c, mon, onBezel)
      wallNotes(c, s, mon, n - onBezel)
    } else if (!mon && c.rand() < 0.3 * k) wallNotes(c, s, undefined, 1 + Math.floor(c.rand() * 2))
    // 桌面：0–2 件
    const m = Math.min(2, Math.floor(c.rand() * (1 + 1.1 * k)))
    const pool = deskNotes()
    for (let i = 0; i < m && pool.length; i++) placeOnDesk(c, s, c.d.pick(pool).id, (c.rand() - 0.5) * 3, c.rand() < 0.5 ? 'front' : 'mid')
  }
  fridgeNotes(c)
}
