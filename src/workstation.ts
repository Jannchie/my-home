// 一键布置的电脑工位：台式主机必须配显示器、每人最多一台主机；显示器按职业 / 兴趣挑单屏、双屏、三屏、竖屏、横 + 竖组合、带鱼屏，
// 多屏都是几台单屏并排摆（两侧往里转一个角度、内侧边贴着中间那台），桌宽不够就减屏；主机放在桌上一侧或桌下（贴着桌腿一侧，不和椅子打架）。
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
import { hasScreen } from './three/screenContent'
import { HARD_ZONES, type Occupancy, type PlaceOpts } from './occupancy'

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
  /** 统一的占用表（禁放区、留空区） */
  readonly occ: Occupancy
  /** 立体上能不能放（统一的占用表，见 Occupancy.canPlace） */
  canPlace(asset: string, x: number, y: number, rot: number, z?: number, opts?: PlaceOpts): boolean
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

/**
 * 显示器组合：dual / triple 是同一款单屏并排（两侧往里转），combo 是横屏居中 + 一侧竖屏，ultrawide 是一块带鱼 / 超宽曲面屏。
 * 一件素材里装多块屏的旧素材（prop-monitor-dual、mon-triple-22、mon-combo-hv）已停用，这里不用
 */
type Rig = 'single' | 'dual' | 'triple' | 'portrait' | 'combo' | 'ultrawide'
/** 横放的单屏（多屏组合也从这里挑） */
const LANDSCAPE = ['prop-monitor', 'prop-monitor-27', 'mon-slim-22', 'mon-slim-24', 'mon-slim-27', 'mon-pivot-27', 'mon-uhd-32', 'mon-alu-27', 'mon-arm-27', 'mon-round-24']
const PORTRAIT = ['mon-portrait-24', 'mon-pivot-27-v']
const ULTRAWIDE = ['mon-uw-34', 'mon-uw-49']
/** 设计 / 摄影偏好的大屏、铝合金，程序员偏好的窄边框、升降、支臂 */
const FOR_DESIGN = new Set(['mon-alu-27', 'mon-uhd-32', 'mon-pivot-27'])
const FOR_CODE = new Set(['mon-slim-22', 'mon-slim-24', 'mon-slim-27', 'mon-pivot-27', 'mon-arm-27'])
/** 笔记本旁边接的外接屏 */
const LAPTOP_EXT = ['prop-monitor', 'mon-slim-22', 'mon-slim-24', 'mon-portable-16', 'mon-arm-27']
/** 两侧屏往里转的角度（度） */
const SIDE_DEG: Record<'dual' | 'triple' | 'combo', number> = { dual: 14, triple: 28, combo: 22 }
/** 并排的两台屏幕边框之间留的缝 */
const SEAM = 0.6
const FALLBACK: Record<Rig, Rig[]> = {
  triple: ['dual', 'combo', 'ultrawide', 'single', 'portrait'],
  dual: ['combo', 'ultrawide', 'single', 'portrait'],
  combo: ['dual', 'single', 'portrait'],
  ultrawide: ['single', 'portrait'],
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
  let w: Record<Rig, number> = { single: 6, dual: 1, triple: 0.1, portrait: 0.3, combo: 0.3, ultrawide: 0.4 }
  if (job === 'programmer') w = { single: 1.5, dual: 3, triple: 1.2, portrait: 1, combo: 2.5, ultrawide: 1.2 }
  else if (job === 'streamer') w = { single: 1, dual: 3, triple: 2, portrait: 0.4, combo: 1.5, ultrawide: 0.8 }
  else if (job === 'designer' || job === 'photographer') w = { single: 3, dual: 2, triple: 0.3, portrait: 0.8, combo: 1, ultrawide: 0.8 }
  else if (job === 'engineer' || job === 'researcher' || job === 'musician') w = { single: 3, dual: 2.5, triple: 0.5, portrait: 0.5, combo: 1, ultrawide: 0.8 }
  if (game >= 2) {
    w.single += 2
    w.ultrawide += 1
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
    if (ext) placeOnDesk(c, s, d.pick(LAPTOP_EXT.filter((id) => ASSET_MAP.has(id))), 0, 'back')
    placeOnDesk(c, s, d.pick(laptops).id, ext ? 1 : 0, ext ? 'front' : 'mid')
  }
  SEATS.set(d, seats)
  TOWERS.set(d, new Set(d.out.filter((o) => isTower(def(o))).map((o) => o.id)))
  // 摄像头上屏幕顶边：在 dress / 补格子之前做，挪走书架上的摄像头后那一格还会被补上
  screenCams(c)
}

/** 落地的主机在这张书桌下，或紧挨着桌子一侧 */
function beside(desk: Furniture, t: Furniture) {
  const dd = def(desk)!
  const l = toLocal(desk, t)
  return Math.abs(l.x) <= dd.w / 2 + def(t)!.w + 4 && Math.abs(l.y) <= dd.d / 2 + 1
}

/**
 * 最后的统一校验（Decorator.validate）会把挡路的书桌换个地方重摆：桌上的东西被当成普通摆件另找地方，落地的主机留在原处。
 * 收拾一遍：不在书桌桌面上的显示器、不在有显示器的书桌上 / 旁边的主机拿掉；
 * 不在屏幕顶边上的夹式 / 条形摄像头重新夹到同一房间的屏幕顶边，没有屏幕就拿掉
 */
export function tidyDesks(c: DeskCtx) {
  const { d, plan } = c
  const drop = (o: Furniture) => (d.out = d.out.filter((x) => x !== o && d.parentOf.get(x.id) !== o.id))
  const parent = (o: Furniture) => d.out.find((x) => x.id === d.parentOf.get(o.id))
  const deskUnder = (o: Furniture) => {
    const p = parent(o)
    return p && isDeskDef(def(p)) && Math.abs((o.z ?? 0) - (p.z ?? 0) - def(p)!.surface!) <= 0.6 ? p : undefined
  }
  for (const m of d.out.filter((o) => isMonitor(def(o)))) if (!deskUnder(m)) drop(m)
  const desks = d.out.filter((o) => !o.z && isDeskDef(def(o)) && d.out.some((m) => isMonitor(def(m)) && d.parentOf.get(m.id) === o.id))
  for (const t of d.out.filter((o) => isTower(def(o)))) {
    const k = deskUnder(t)
    if (k ? !desks.includes(k) : !desks.some((x) => beside(x, t))) drop(t)
  }
  for (const cam of d.out.filter((o) => def(o)?.screenClip)) {
    const p = parent(cam)
    if (p && (def(p)?.surfaces ?? []).some((l) => l.kind === 'clip' && Math.abs((p.z ?? 0) + l.y - (cam.z ?? 0)) < 0.5)) continue
    drop(cam)
    const room = plan.rooms.find((r) => pointInPolygon(cam, r.points))
    const screens = room ? d.out.filter((o) => hasClip(def(o)) && pointInPolygon(o, room.points) && !clipped(c, o)) : []
    if (screens.length) clipOnScreen(c, d.pick(screens), cam.asset)
  }
}

/** 工位那一步摆好的主机 */
const TOWERS = new WeakMap<DeskHost, Set<string>>()

/**
 * 个人物件摆完之后再收拾一遍工位（工位在功能性的那一步先摆，后面散放的兴趣摆件里可能又有迷你主机、夹式摄像头）：
 * 新出现的主机交给同一房间里还没有主机的座位（主人还没有主机的），放不上就收走；不在桌面上的显示器收走；
 * 夹式 / 条形摄像头挪到屏幕顶边（电视这时已经摆上了）。
 */
export function settleDesks(c: DeskCtx) {
  const { d, plan, rand } = c
  const seats = SEATS.get(d) ?? []
  const known = TOWERS.get(d) ?? new Set<string>()
  const owned = new Set(seats.filter((s) => s.desktop && s.owner).map((s) => s.owner!))
  const weighted = <T,>(items: [T, number][]) => {
    let r = rand() * items.reduce((t, [, w]) => t + w, 0)
    for (const [v, w] of items) if ((r -= w) <= 0) return v
    return items[items.length - 1][0]
  }
  for (const o of [...d.out]) {
    if (!isTower(def(o)) || known.has(o.id)) continue
    const room = plan.rooms.find((r) => pointInPolygon(o, r.points))
    d.out = d.out.filter((x) => x !== o && d.parentOf.get(x.id) !== o.id)
    const s = seats.find((x) => x.room === room && !x.desktop && x.zone >= 70 && d.out.includes(x.desk) && (!x.owner || !owned.has(x.owner)))
    if (!s) continue
    s.desktop = o.asset
    if (s.owner) owned.add(s.owner)
    if (!setupDesktop(c, s, weighted)) s.desktop = undefined
  }
  // 后来散放到书架、柜子上的显示器（兴趣摆件里的电竞显示器…）收走，和工位那一步一样只认桌面
  for (const o of [...d.out]) {
    if (!isMonitor(def(o)) || !d.out.includes(o)) continue
    const p = d.out.find((x) => x.id === d.parentOf.get(o.id))
    if (!p || !isDeskDef(def(p)) || Math.abs((o.z ?? 0) - (p.z ?? 0) - def(p)!.surface!) > 0.6) d.out = d.out.filter((x) => x !== o && d.parentOf.get(x.id) !== o.id)
  }
  known.clear()
  for (const o of d.out) if (isTower(def(o))) known.add(o.id)
  screenCams(c, false)
  screenContents(c)
}

// ---------- 屏幕画面：按主人挑 ----------

type W = Partial<Record<string, number>>
const add = (w: W, k: string, v: number) => (w[k] = (w[k] ?? 0) + v)
/** 各职业在电脑上常开的画面 */
const JOB_SCREENS: Partial<Record<Member['job'], W>> = {
  programmer: { code: 4, terminal: 2 },
  engineer: { terminal: 2, code: 2, sheet: 0.5 },
  designer: { design: 4 },
  photographer: { photo: 4 },
  streamer: { stream: 4, game: 1 },
  musician: { music: 4 },
  researcher: { sheet: 2, reading: 1, web: 1 },
  office: { sheet: 3, meeting: 2, web: 1 },
  teacher: { meeting: 1, web: 2, reading: 1 },
  student: { web: 2, reading: 2, video: 1, code: 0.5 },
  schoolkid: { game: 2, anime: 1, web: 1 },
  retired: { web: 2, stocks: 1, video: 1 },
  chef: { web: 2, video: 1 },
  nurse: { video: 1, web: 1 },
}

/**
 * 电脑屏幕（显示器、笔记本、一体机、平板）的画面权重：职业定主调，兴趣、性格再加减。
 * 电视看全家：孩子、宅、爱游戏的多放动画 / 游戏，其余追剧、新闻，也常关着
 */
export function screenWeights(def: AssetDef, people: Member[]): W {
  const w: W = {}
  if (def.type === 'tv' || hasTag(def, 'tv')) {
    add(w, 'video', 3)
    add(w, 'off', 2)
    add(w, 'web', 0.5)
    for (const m of people) {
      add(w, 'game', levelOf(m, 'gaming') * 0.8)
      add(w, 'anime', levelOf(m, 'otaku') + (m.age < 13 ? 1.5 : 0))
      add(w, 'video', levelOf(m, 'movies') * 0.8)
      if (m.traits.includes('homebody')) add(w, 'video', 0.5)
    }
    return w
  }
  add(w, 'wallpaper', 0.4)
  add(w, 'web', 0.6)
  add(w, 'video', 0.3)
  add(w, 'off', 0.2)
  for (const m of people) {
    for (const [k, v] of Object.entries(JOB_SCREENS[m.job] ?? {})) add(w, k, v!)
    add(w, 'game', levelOf(m, 'gaming') * 1.2)
    add(w, 'anime', levelOf(m, 'otaku'))
    add(w, 'reading', levelOf(m, 'reading') * 0.6)
    add(w, 'terminal', levelOf(m, 'tech') * 0.5)
    add(w, 'code', levelOf(m, 'tech') * 0.3)
    add(w, 'music', levelOf(m, 'music') * 0.6)
    add(w, 'photo', levelOf(m, 'photo') * 0.8)
    add(w, 'stream', levelOf(m, 'streaming') * 0.8)
    add(w, 'video', levelOf(m, 'movies') * 0.6)
    const tr = m.traits
    if (tr.includes('rational')) (add(w, 'sheet', 0.6), add(w, 'stocks', 0.4))
    if (tr.includes('homebody')) (add(w, 'video', 0.6), add(w, 'anime', 0.4))
    if (tr.includes('minimal')) (add(w, 'wallpaper', 0.8), add(w, 'off', 0.4))
    if (tr.includes('tidy')) add(w, 'wallpaper', 0.3)
    if (tr.includes('messy')) add(w, 'web', 0.4)
    if (tr.includes('cutie')) add(w, 'anime', 0.5)
    if (tr.includes('nostalgic')) add(w, 'game', 0.3)
  }
  return w
}

/** 按 id 定的 0..1（挑画面不动布置用的随机数流，别的东西的位置不受影响） */
function hash01(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

/**
 * 给每块屏幕挑画面：工位上的按座位主人，其余（电视、客厅的笔记本）按所在房间的人。
 * 用户已经选过的不改；同一座位上的几台显示器各挑各的（多屏常常一台写代码、一台开网页）
 */
function screenContents(c: DeskCtx) {
  const { d, plan } = c
  const seats = SEATS.get(d) ?? []
  for (const o of d.out) {
    const a = def(o)
    if (!a || o.screen || !hasScreen(a)) continue
    const seat = seats.find((s) => d.parentOf.get(o.id) === s.desk.id && Math.abs(toLocal(s.desk, o).x - s.x) <= s.zone / 2 + 1)
    const room = plan.rooms.find((r) => pointInPolygon(o, r.points))
    const people = seat?.owner ? [seat.owner] : room ? d.peopleIn(room) : []
    const w = Object.entries(screenWeights(a, people)).filter(([, v]) => v! > 0) as [string, number][]
    let r = hash01(o.id) * w.reduce((t, [, v]) => t + v, 0)
    for (const [k, v] of w) if ((r -= v) <= 0) {
      o.screen = k
      break
    }
  }
}

/**
 * 单独的键盘配一只鼠标：工位、兴趣摆件、通用桌面摆件放上去的键盘都可能没有鼠标（键鼠套装自带的不算）。
 * 同一台面上键盘旁边 50cm 内没有鼠标，就在键盘右边（放不下就左边）补一只；电竞（RGB）键盘配电竞鼠标
 */
function pairMice(c: DeskCtx) {
  const { d } = c
  for (const k of [...d.out]) {
    const kd = def(k)
    if (!kd || !hasTag(kd, 'keyboard') || hasTag(kd, 'mouse')) continue
    const parent = d.out.find((x) => x.id === d.parentOf.get(k.id))
    if (!parent || !def(parent)?.surface) continue
    const near = d.out.some((m) => m !== k && d.parentOf.get(m.id) === parent.id && hasTag(def(m), 'mouse') && Math.hypot(m.x - k.x, m.y - k.y) < 50)
    if (near) continue
    const mouse = /^of-kb-.*-rgb$/.test(k.asset) ? 'of-mouse-rgb' : 'of-mouse'
    const md = ASSET_MAP.get(mouse)
    if (!md) continue
    const lk = toLocal(parent, k)
    const lrot = (k.rot - parent.rot + 360) % 360
    // 键盘的局部 x 轴（转过 lrot）方向上，紧挨着键盘
    const a = (lrot * Math.PI) / 180
    const gap = kd.w / 2 + md.w / 2 + 5
    // 键盘的局部 z 轴（往前）方向：右边放不下就稍微往前 / 往后挪一点再试
    const fz = { x: -Math.sin(a), y: Math.cos(a) }
    place: for (const side of [1, -1])
      for (const extra of [0, 4, 8, 14])
        for (const dz of [0, -3, 3]) {
          const r = side * (gap + extra)
          if (putOn(c, parent, mouse, lk.x + Math.cos(a) * r + fz.x * dz, lk.y + Math.sin(a) * r + fz.y * dz, lrot)) break place
        }
  }
}

/** 座位那一段桌面上的东西 */
function onSeat(c: DeskCtx, s: Seat) {
  const dd = def(s.desk)!
  const top = (s.desk.z ?? 0) + dd.surface!
  return c.d.out.filter((o) => c.d.parentOf.get(o.id) === s.desk.id && Math.abs((o.z ?? 0) - top) < 0.6 && Math.abs(toLocal(s.desk, o).x - s.x) <= s.zone / 2 + 1)
}

/** 摆到桌面局部坐标 (lx, lz)：整块在台面内、不和同一台面上的任何东西（含主机）重叠；不受同类数量限制 */
function putOn(c: DeskCtx, parent: Furniture, asset: string, lx: number, lz: number, lrot = 0, ignore?: Set<string>) {
  const pd = def(parent)!
  const a = ASSET_MAP.get(asset)
  if (!a || !pd.surface) return null
  const z = (parent.z ?? 0) + pd.surface
  const p = toWorld(parent, lx, lz)
  const f: Furniture = { id: uid('u'), asset, x: round1(p.x), y: round1(p.y), rot: (parent.rot + lrot + 360) % 360, color: c.d.colorFor(a), z }
  if (!fitsOnSurface(parent, z, asset, f.x, f.y, f.rot)) return null
  // 同一台面上的东西（含主机）重叠不超过 1.8（贴着放）、不顶到墙上挂的东西…（Occupancy.canPlace）
  if (!c.d.canPlace(asset, f.x, f.y, f.rot, z, { parent: parent.id, surfaceTol: 1.8, ignore })) return null
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
 * 不和椅子（扶手、椅脚按收进 3cm 算，和别的落地家具最多交叠 4cm）、垃圾桶、抽屉柜、设备打架
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
  // 床边下床的空间、楼梯口这些留空区
  if (c.d.occ.zoneBoxes(s.room, [HARD_ZONES]).some((b) => boxOverlaps(box, b))) return null
  const solid = c.d.out.filter((o) => o !== s.desk && !o.z && !c.d.flat.has(o.id) && !def(o)?.mount && !def(o)?.stick && (def(o)?.h ?? 0) > 3)
  const boxOf = (o: Furniture) => {
    const b = furnitureBox(o.asset, o.x, o.y, o.rot)
    const k = isSeat(o) ? 3 : 0
    return { x0: b.x0 + k, y0: b.y0 + k, x1: b.x1 - k, y1: b.y1 - k }
  }
  if (solid.some((o) => boxOverlaps(box, boxOf(o)))) return null
  // 墙上挂的东西、窗帘（放到桌子外面、窗边时）
  if (!c.d.canPlace(asset, p.x, p.y, s.desk.rot)) return null
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
  const rigs = [first, ...FALLBACK[first]]
  let rig: Furniture[] | null = null
  const clear = () => {
    for (const o of onSeat(c, s)) if (o !== tower && !isLaptop(o) && !isKeyboard(o) && !isMonitor(def(o))) d.out = d.out.filter((x) => x !== o && d.parentOf.get(x.id) !== o.id)
  }
  // 先试按人挑的那种（换两次款）；被摆件挡住就挪走普通摆件（台灯、杯子之类，dress 之后还会补）再试，最后才减屏
  for (const [i, r] of rigs.entries()) {
    for (let k = 0; k < 2 && !rig; k++) {
      const pick = rigUnits(c, s, r, avail, gamer)
      if (!pick) break
      rig = placeRig(c, s, pick, center)
      if (!rig && i === 0 && k === 0) {
        clear()
        rig = placeRig(c, s, pick, center)
      }
    }
    if (rig) break
  }
  if (!rig) {
    if (tower) d.out = d.out.filter((x) => x !== tower)
    return false
  }
  // 整组显示器的左右边（迷你主机放在旁边）和键盘对着的位置（有中间那台就对着它，双屏对着两台中间）
  const xs = rig.map((m) => [toLocal(s.desk, m).x, ASSET_MAP.get(m.asset)!.w / 2] as const)
  const lo = Math.min(...xs.map(([x, h]) => x - h))
  const hi = Math.max(...xs.map(([x, h]) => x + h))
  const mid = rig.length === 2 && rig[0].asset === rig[1].asset ? (xs[0][0] + xs[1][0]) / 2 : xs[0][0]
  if (mini) placeOnDesk(c, s, asset, 0, 'back', side > 0 ? hi + 9 : lo - 9)
  // 键盘：座位上还没有就补一把，放在显示器正前方
  if (!onSeat(c, s).some(isKeyboard)) {
    const kb = d.find(gamer ? /^of-kb-.*-rgb$/ : /^(of-kb-(tkl|full|60)|prop-keyboard-mouse)$/, (a) => !!a.prop && a.w <= s.zone * 0.7)
    if (kb.length) placeOnDesk(c, s, d.pick(kb).id, 0, 'front', mid)
  }
  return true
}

/** 一组显示器：main 居中正对；sides 是两侧往里转 deg 度的屏（-1 左、1 右），没有 main 时两侧屏的内侧边在中线上相接 */
interface RigUnits {
  main?: string
  sides: [-1 | 1, string][]
  deg: number
}

/** 横屏候选里按人挑一款（设计 / 摄影偏好大屏、铝合金，程序员偏好窄边框、升降、支臂，孩子偏好圆润款，玩家的单屏常是电竞曲面） */
function pickLandscape(c: DeskCtx, s: Seat, maxW: number, gamer: boolean, single: boolean) {
  const dd = def(s.desk)!
  const job = s.owner?.job
  const ok = (id: string) => {
    const a = ASSET_MAP.get(id)
    return !!a && a.w <= maxW && a.d <= dd.d * 0.6
  }
  const pool: [string, number][] = LANDSCAPE.filter(ok).map((id) => {
    let w = 1
    if ((job === 'designer' || job === 'photographer') && FOR_DESIGN.has(id)) w = 4
    if (job === 'programmer' && FOR_CODE.has(id)) w = 2.5
    if (s.owner && s.owner.age < 16 && id === 'mon-round-24') w = 3
    return [id, w]
  })
  if (single && gamer && ok('of-monitor-gaming')) pool.push(['of-monitor-gaming', LANDSCAPE.length * 0.6])
  if (!pool.length) return null
  let r = c.rand() * pool.reduce((t, [, w]) => t + w, 0)
  for (const [id, w] of pool) if ((r -= w) <= 0) return id
  return pool[pool.length - 1][0]
}

/** 这种组合挑哪几台（宽度按整组算，放不下返回 null） */
function rigUnits(c: DeskCtx, s: Seat, rig: Rig, avail: number, gamer: boolean): RigUnits | null {
  const dd = def(s.desk)!
  const fit = (ids: string[]) => ids.filter((id) => ASSET_MAP.has(id) && ASSET_MAP.get(id)!.w <= avail && ASSET_MAP.get(id)!.d <= dd.d * 0.6)
  const cos = (deg: number) => Math.cos((deg * Math.PI) / 180)
  if (rig === 'single') {
    const id = pickLandscape(c, s, avail, gamer, true)
    return id ? { main: id, sides: [], deg: 0 } : null
  }
  if (rig === 'portrait' || rig === 'ultrawide') {
    const ids = fit(rig === 'portrait' ? PORTRAIT : ULTRAWIDE)
    if (!ids.length) return null
    // 49 寸超宽多半是重度玩家、主播的
    const big = rig === 'ultrawide' && ids.length > 1 && (gamer || s.owner?.job === 'streamer') && c.rand() < 0.4
    return { main: rig === 'portrait' ? c.d.pick(ids) : big ? ids[ids.length - 1] : ids[0], sides: [], deg: 0 }
  }
  if (rig === 'dual') {
    const id = pickLandscape(c, s, avail / (2 * cos(SIDE_DEG.dual)) - SEAM, gamer, false)
    return id ? { sides: [[-1, id], [1, id]], deg: SIDE_DEG.dual } : null
  }
  if (rig === 'triple') {
    const id = pickLandscape(c, s, avail / (1 + 2 * cos(SIDE_DEG.triple)) - SEAM, gamer, false)
    return id ? { main: id, sides: [[-1, id], [1, id]], deg: SIDE_DEG.triple } : null
  }
  // combo：竖屏放在一侧（多半是右边），横屏居中
  const pv = fit(PORTRAIT)
  if (!pv.length) return null
  const p = c.d.pick(pv)
  const pw = ASSET_MAP.get(p)!.w * cos(SIDE_DEG.combo)
  const main = pickLandscape(c, s, avail - 2 * pw - SEAM * 2, gamer, false)
  return main ? { main, sides: [[c.rand() < 0.75 ? 1 : -1, p]], deg: SIDE_DEG.combo } : null
}

/**
 * 摆一组显示器：main 靠后居中（找不到位置就往前、往两侧挪），两侧屏转 deg 度、面板内侧边贴着中间那台的边（或中线）；
 * 转不下就把角度收小再试。整组都在座位那段桌面上，组内互相不查重叠（面板按几何拼好、底座在各自面板后面）。
 * 返回摆好的显示器（main 在前）；摆不下返回 null，摆了一半的撤掉
 */
function placeRig(c: DeskCtx, s: Seat, u: RigUnits, center: number): Furniture[] | null {
  const dd = def(s.desk)!
  const half = s.zone / 2
  const first = ASSET_MAP.get(u.main ?? u.sides[0][1])!
  const sc0 = first.screens?.[0]
  if (!sc0) return null
  const back = -dd.d / 2 + first.d / 2 + 1.5
  const shifts = u.main ? [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8] : [0, 1, -1, 2, -2]
  const ignore = new Set<string>()
  /** 一台侧屏：面板内侧边落在 (ex, ez)，往里转 deg */
  const sideAt = (side: -1 | 1, asset: string, ex: number, ez: number, deg: number) => {
    const a = ASSET_MAP.get(asset)!
    const sc = a.screens![0]
    const r = (side * deg * Math.PI) / 180
    const qx = sc.x - (side * sc.w) / 2
    const ox = qx * Math.cos(r) - sc.z * Math.sin(r)
    const oz = qx * Math.sin(r) + sc.z * Math.cos(r)
    const lx = ex + side * SEAM - ox
    const lz = ez - oz
    const reach = (a.w / 2) * Math.cos(Math.abs(r)) + (a.d / 2) * Math.sin(Math.abs(r))
    if (Math.abs(lx - s.x) + reach > half + 0.5) return null
    return putOn(c, s.desk, asset, lx, lz, side * deg, ignore)
  }
  for (const dz of [0, 4, 9])
    for (const k of shifts) {
      const lx = center + k * 5
      const lz = back + dz
      const placed: Furniture[] = []
      // 中间那台的左右边（没有中间那台时就是两侧屏相接的中线）
      let edges: Record<string, [number, number]>
      if (u.main) {
        if (Math.abs(lx - s.x) + first.w / 2 > half + 0.5) continue
        const m = putOn(c, s.desk, u.main, lx, lz, 0)
        if (!m) continue
        placed.push(m)
        ignore.add(m.id)
        edges = { '-1': [lx + sc0.x - sc0.w / 2, lz + sc0.z], '1': [lx + sc0.x + sc0.w / 2, lz + sc0.z] }
      } else edges = { '-1': [lx - SEAM / 2, lz + sc0.z], '1': [lx + SEAM / 2, lz + sc0.z] }
      let ok = true
      for (const [side, asset] of u.sides) {
        const [ex, ez] = edges[side]
        let f: Furniture | null = null
        for (const deg of [u.deg, u.deg * 0.6, u.deg * 0.3]) if ((f = sideAt(side, asset, ex, ez, deg))) break
        if (!f) {
          ok = false
          break
        }
        placed.push(f)
        ignore.add(f.id)
      }
      if (ok) return placed
      const gone = new Set(placed)
      c.d.out = c.d.out.filter((x) => !gone.has(x))
      ignore.clear()
    }
  return null
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
function screenCams(c: DeskCtx, extras = true) {
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
  if (extras)
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
  // 键盘配鼠标：放在这里（所有可能摆键盘的步骤——工位、兴趣摆件、开放格子补件——之后）只跑一次
  pairMice(c)
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
