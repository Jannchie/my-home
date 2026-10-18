// 中式 / 欧美户型共用的「三段式」骨架和设备摆放工具。
//
// 朝向约定同日式：y=0 一侧朝南（阳台 / 露台），y=D 一侧是入户（北）。
// 平面分三列：L 块 | C 列 | R 块（最后整体随机镜像）。
//   C 列：南侧客厅（living），北侧由各地区自己切（中式：餐厅 + 玄关；欧美：餐厅 + 厨房）。
//   L / R 块：南排房间 + 北排房间，中间一条走廊（hall）或者套间（suite：北排房间从南排主室进）。
//     - 走廊和 C 列同属一个敞开组（openGroup），不砌墙，走廊直通客餐厅。
//     - 北排为空时，南排单间加深到走廊带，门开向 C 列；南排为空时，北排单间的门开向 C 列。
//   块宽取南北两排里宽的那排，窄的那排把差额摊给各房间，北排差得多就补一间收纳（filler）。

import { orientDoors } from './doors'
import { firstDoorCenter, innerRoom, placeCandidates, placeOnWall, type PlaceSpec } from './place'
import { WALL, WALL_OUTER, createCtx, planArea, searchWithArea, type Ctx } from './generate'
import { add, area, bbox, edgeInfo, edgesOf, mul, openingGeom, pointInPolygon, projectToSegment, rectPoints, uid, type Fixture, type FixtureKind, type KitchenVariant, type OpeningKind, type Plan, type Region, type Room, type RoomKind, type Vec } from './model'
import { isIndoor, isOpenBetween, sharedIntervals } from './walls'
import { gridPolygon } from './footprint'

export { createCtx, planArea, WALL, WALL_OUTER, type Ctx }

export interface CellSpec {
  kind: RoomKind
  name: string
  /** 开间（沿 x）的取值范围 */
  min: number
  max: number
  /** 门开在哪：auto = 走廊 / 套间主室 / C 列（按所在位置）；c = 朝 C 列的侧墙；none = 不开 */
  door?: 'auto' | 'c' | 'none'
  doorKind?: OpeningKind
  doorW?: number
  /** 外墙上的窗宽（南排开在南墙，北排开在北墙），0 / 不填 = 不开 */
  window?: number
  /** 南排最外侧的主卧：在北侧外角切出一间卫生间（门开向主卧） */
  ensuite?: { name: string; w: number; h: number; tag?: string }
  /** 和 C 列敞开（半开放厨房） */
  openToC?: boolean
  /** 摆设备时用的角色：kitchen / bath / half / laundry / pantry / wic / master / foyer … */
  tag?: string
  /**
   * 北排（走廊模式）房间只占北端这么深（外包尺寸，从北外墙算起）：南边剩下的并进走廊，成一个门前的小凹口，门开在凹口里。
   * 剩下不到 60 就不切（整排进深）。Half Bath / Bath 用：北排进深按厨房定，整排进深的卫生间会变成细长的走廊。
   */
  depth?: number
  /** 和 depth 一起用：南边剩下的不并进走廊，做成这间（门开向走廊，居中），比如 Pantry 南边的走廊壁橱 */
  rest?: CellSpec
  /** 北排走廊门开在靠内侧的墙角（不居中）：窄卫生间要留出一整面长墙放马桶 + 台盆 */
  doorCorner?: boolean
  /** 开间就取 min..max 里抽到的值：北排比南排窄时，差额只摊给其余房间（不把卫生间撑大） */
  fixed?: boolean
}

export interface BlockSpec {
  south: CellSpec[]
  north: CellSpec[]
  /** 北排比南排窄得多时补的收纳间 */
  filler?: CellSpec
  /** 北排房间从南排主室进（欧美主卧套间：主卫 + 衣帽间） */
  suite?: boolean
}

export interface Placed {
  spec: CellSpec
  room: Room
}

export interface BandDims {
  /** 南排进深 */
  dS: number
  /** 走廊宽 */
  cw: number
  /** 北排进深 */
  dN: number
  /** C 列开间 */
  cW: number
}

export interface BandOut {
  W: number
  D: number
  xC0: number
  xC1: number
  placed: Placed[]
}

/**
 * 把 diff（10 的倍数）按随机权重摊到各个宽度上：相邻的房间不会被摊成一样宽。
 * skip[i] 为真的不参与（固定开间）；全都固定时照常摊给所有房间。
 */
function spread(all: number[], diff: number, rand: () => number, skip?: boolean[]) {
  if (skip?.some(Boolean) && !skip.every(Boolean)) {
    const idx = all.map((_, i) => i).filter((i) => !skip[i])
    const sub = idx.map((i) => all[i])
    spread(sub, diff, rand)
    idx.forEach((i, k) => (all[i] = sub[k]))
    return
  }
  const ws = all
  if (!ws.length || diff <= 0) return
  const steps = Math.round(diff / 10)
  const wt = ws.map(() => 0.7 + rand() * 0.6)
  const sum = wt.reduce((a, x) => a + x, 0)
  let left = steps
  wt.forEach((w, i) => {
    const k = i === ws.length - 1 ? left : Math.min(left, Math.round((steps * w) / sum))
    ws[i] += k * 10
    left -= k
  })
}

/**
 * 三段式骨架。buildC 负责 C 列北半部分（y ∈ [dS, D]）；客厅由这里生成。
 * 返回的坐标已经镜像好；房间名、门窗都已加进 c.rooms / c.openings。
 */
export function bandLayout(
  c: Ctx,
  dims: BandDims,
  blocks: { L?: BlockSpec; R?: BlockSpec },
  opts: { group: string; hallName: string; livingName: string; livingWindow: number; buildC: (x0: number, x1: number, dS: number, D: number) => void; mirror: boolean },
): BandOut {
  const { dS, cw, dN, cW } = dims
  const D = dS + cw + dN
  const yN = dS + cw
  const placed: Placed[] = []

  // 先定两块的宽度（南北排各房间开间）
  const sizes = (b: BlockSpec | undefined) => {
    if (!b) return { W: 0, sw: [] as number[], nw: [] as number[], north: [] as CellSpec[] }
    const sw = b.south.map((s) => c.rint(s.min, s.max))
    const north = [...b.north]
    const nw = north.map((s) => c.rint(s.min, s.max))
    const sumS = sw.reduce((a, x) => a + x, 0)
    const sumN = nw.reduce((a, x) => a + x, 0)
    const W = Math.max(sumS, sumN)
    spread(sw, W - sumS, c.alt)
    let diff = W - sumN
    if (north.length && diff >= 100 && b.filler) {
      const fw = Math.min(diff, b.filler.max)
      north.push(b.filler)
      nw.push(fw)
      diff -= fw
    }
    spread(nw, diff, c.alt, north.map((s) => !!s.fixed))
    return { W, sw, nw, north }
  }
  const SL = sizes(blocks.L)
  const SR = sizes(blocks.R)
  const xC0 = SL.W
  const xC1 = xC0 + cW
  const W = xC1 + SR.W

  const living = c.rect('ldk', opts.livingName, xC0, 0, xC1, dS)
  living.openGroup = opts.group
  c.windowOn(living, 0, Math.min(cW - 80, opts.livingWindow))
  opts.buildC(xC0, xC1, dS, D)

  const doorW = (s: CellSpec) => s.doorW ?? (s.kind === 'western' ? 85 : s.kind === 'bath' || s.kind === 'toilet' ? 75 : s.kind === 'kitchen' ? 80 : 75)
  const block = (b: BlockSpec | undefined, S: ReturnType<typeof sizes>, side: 'L' | 'R') => {
    if (!b || !S.W) return
    const inner = side === 'L' ? xC0 : xC1
    const X = (u: number) => (side === 'L' ? inner - u : inner + u)
    const hasN = S.north.length > 0
    const hasS = b.south.length > 0
    const hall = hasN && hasS && !b.suite
    const yS = hall ? dS : yN // 南排的北沿
    // 北排各间的进深（depth：只占北端，南边并进走廊或做成 rest 那间）
    // （剩下的做成一间时要 70：壁橱净深 60）
    const depthOf = (s: CellSpec) => (hall && s.depth && s.depth <= dN - (s.rest ? 70 : 60) ? s.depth : dN)
    if (hall) {
      // 走廊带 + 浅房间门前的凹口拼成一个多边形
      const rects: Vec[][] = [rectPoints(Math.min(X(0), X(S.W)), dS, Math.max(X(0), X(S.W)), yN)]
      let v = 0
      S.north.forEach((s, i) => {
        const dep = depthOf(s)
        if (dep < dN && !s.rest) rects.push(rectPoints(Math.min(X(v), X(v + S.nw[i])), yN, Math.max(X(v), X(v + S.nw[i])), D - dep))
        v += S.nw[i]
      })
      const pts = rects.length > 1 ? gridPolygon(rects, (p) => rects.some((q) => pointInPolygon(p, q))) : null
      const h = pts ? c.room('hall', opts.hallName, pts) : c.rect('hall', opts.hallName, X(0), dS, X(S.W), yN)
      h.openGroup = opts.group
    }
    // 南排
    let u = 0
    b.south.forEach((s, i) => {
      const w = S.sw[i]
      const u0 = u
      const u1 = u + w
      u = u1
      const es = s.ensuite && i === b.south.length - 1 ? s.ensuite : null
      const pts: Vec[] = es
        ? [
            { x: u0, y: 0 },
            { x: u1, y: 0 },
            { x: u1, y: yS - es.h },
            { x: u1 - es.w, y: yS - es.h },
            { x: u1 - es.w, y: yS },
            { x: u0, y: yS },
          ]
        : rectPoints(u0, 0, u1, yS)
      const r = c.room(s.kind, s.name, pts.map((p) => ({ x: X(p.x), y: p.y })))
      placed.push({ spec: s, room: r })
      if (s.window) c.open(r, 'window', { x: X((u0 + u1) / 2 + c.windowShift(w, Math.min(w - 80, s.window))), y: 0 }, Math.min(w - 80, s.window))
      // 门：走廊模式开在北沿（靠内侧一端，外侧可能是主卫）；否则开在朝 C 列的侧墙上（走廊带范围内）
      if (s.door !== 'none') {
        if (hall) c.open(r, s.doorKind ?? 'door', { x: X(u0 + Math.min(55, w / 2)), y: dS }, doorW(s))
        else if (i === 0) c.open(r, s.doorKind ?? 'door', { x: X(0), y: dS + cw / 2 }, Math.min(doorW(s), cw - 20))
      }
      if (es) {
        const e = c.room('bath', es.name, rectPoints(Math.min(X(u1 - es.w), X(u1)), yS - es.h, Math.max(X(u1 - es.w), X(u1)), yS))
        placed.push({ spec: { kind: 'bath', name: es.name, min: es.w, max: es.w, tag: es.tag ?? 'ensuite' }, room: e })
        // 门开向主卧：南沿或内侧墙
        if (c.chance(0.5) && es.w >= 120) c.open(e, 'door', { x: X(u1 - es.w / 2), y: yS - es.h }, 70)
        else c.open(e, 'door', { x: X(u1 - es.w), y: yS - es.h / 2 }, 70)
        c.open(e, 'window', { x: X(u1), y: yS - es.h / 2 }, Math.min(70, es.h - 80))
      }
    })
    // 北排
    u = 0
    S.north.forEach((s, i) => {
      const w = S.nw[i]
      const u0 = u
      const u1 = u + w
      u = u1
      const dep = depthOf(s)
      const y0 = D - dep
      const r = c.rect(s.kind, s.name, X(u0), y0, X(u1), D)
      placed.push({ spec: s, room: r })
      if (s.rest && dep < dN) {
        const q = c.rect(s.rest.kind, s.rest.name, X(u0), yN, X(u1), y0)
        placed.push({ spec: s.rest, room: q })
        c.open(q, s.rest.doorKind ?? 'door', { x: X((u0 + u1) / 2), y: yN }, Math.min(doorW(s.rest), w - 30))
      }
      if (s.window) c.open(r, 'window', { x: X((u0 + u1) / 2 + c.windowShift(w, Math.min(w - 60, s.window))), y: D }, Math.min(w - 60, s.window))
      if (s.openToC && i === 0) {
        r.openGroup = opts.group
        return
      }
      if (s.door === 'none') return
      if ((s.door === 'c' || !hasS) && i === 0) {
        c.open(r, s.doorKind ?? 'door', { x: X(0), y: (y0 + D) / 2 }, Math.min(doorW(s), dep - 40))
        return
      }
      // 走廊 / 套间主室：开在南沿；门靠近内侧（离 C 列近，走得少）
      // （随机数只在 w > 130 时抽，和以前一样）
      const corner = w > 130 && (c.chance(0.5) || !!s.doorCorner)
      const at = w <= 130 ? (u0 + u1) / 2 : corner ? u0 + Math.min(50, w / 2) : (u0 + u1) / 2
      c.open(r, s.doorKind ?? 'door', { x: X(at), y: y0 }, Math.min(doorW(s), w - 30))
    })
  }
  block(blocks.L, SL, 'L')
  block(blocks.R, SR, 'R')

  if (opts.mirror) {
    for (const r of c.rooms) r.points = r.points.map((p) => ({ x: W - p.x, y: p.y }))
  }
  return { W, D, xC0: opts.mirror ? W - xC1 : xC0, xC1: opts.mirror ? W - xC0 : xC1, placed }
}

/** 角部屋：一侧山墙（x = 0 或 W）上给大房间开窗 */
export function cornerWindows(c: Ctx, W: number, sizes: Partial<Record<RoomKind, number>>) {
  const sideX = c.chance(0.5) ? 0 : W
  for (const r of c.rooms) {
    const w = sizes[r.kind]
    if (!w) continue
    for (let i = 0; i < r.points.length; i++) {
      const e = edgeInfo(r.points, i)
      if (Math.abs(e.a.x - sideX) < 1 && Math.abs(e.b.x - sideX) < 1 && e.length > w + 40) {
        // 这一段外侧不能是别的户内房间（凹进去的地方）
        const probe = add(add(e.a, mul(e.dir, e.length / 2)), mul(e.out, 15))
        if (c.rooms.some((o) => o !== r && isIndoor(o) && pointInPolygon(probe, o.points))) continue
        if (c.openings.some((o) => o.roomId === r.id && o.edge === i)) continue
        c.open(r, 'window', add(e.a, mul(e.dir, e.length / 2)), w)
        break
      }
    }
  }
}

/** 在 room 的 y = yEdge 那条边上、x 范围 [x0, x1] 外侧加一个阳台（向外伸 depth） */
export function balconyAlong(c: Ctx, name: string, x0: number, x1: number, y: number, depth: number, railing: Room['railing']) {
  const y0 = depth > 0 ? y : y + depth
  const y1 = depth > 0 ? y + depth : y
  const b: Room = { id: uid('r'), kind: 'balcony', name, points: rectPoints(Math.min(x0, x1), y0, Math.max(x0, x1), y1), railing }
  c.rooms.push(b)
  return b
}

/** 房间在 y = yv 这条水平边上的 x 范围（矩形房间用） */
export function spanAt(r: Room, yv: number): [number, number] | null {
  const xs = r.points.filter((p) => Math.abs(p.y - yv) < 1).map((p) => p.x)
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null
}

// ---------------------------------------------------------------------------
// 设备
// ---------------------------------------------------------------------------

export function putter(plan: Plan) {
  return (room: Room, spec: PlaceSpec) => {
    const f = placeOnWall(room, plan, spec)
    if (f) plan.fixtures.push(f)
    return f
  }
}

/** 厨房 + 冰箱：厨房候选（长台面优先）逐个试，直到冰箱也放得下；冰箱可以放到旁边的房间（餐厅） */
export function placeKitchen(
  plan: Plan,
  room: Room,
  o: { variants: KitchenVariant[]; lengths: number[]; edges?: PlaceSpec['edges']; fridge: number[]; fridgeDepth: number; fridgeRooms?: Room[]; extra?: Partial<Fixture> },
) {
  let fallback: Fixture | null = null
  for (const variant of o.variants) {
    const spec: PlaceSpec = { kind: 'kitchen', variant, lengths: o.lengths, depth: variant === 'facing' ? 200 : 65, edges: o.edges ?? 'any' }
    for (const k of placeCandidates(room, plan, spec).slice(0, 80)) {
      Object.assign(k, o.extra ?? {})
      fallback ??= k
      const ctx = { ...plan, fixtures: [...plan.fixtures, k] }
      for (const fr of [room, ...(o.fridgeRooms ?? [])]) {
        // 冰箱位不挡通往阳台的落地窗
        const f = placeOnWall(fr, ctx, { kind: 'fridge', lengths: o.fridge, depth: o.fridgeDepth, near: { x: k.x, y: k.y }, nearMax: k.w / 2 + (fr === room ? 160 : 320), sash: true })
        if (f) {
          plan.fixtures.push(k, f)
          return { k, f }
        }
      }
    }
  }
  if (fallback) plan.fixtures.push(fallback)
  return { k: fallback, f: null }
}

export interface BathSpec {
  /** tub = 浴缸（带淋浴，浴帘）；shower = 淋浴房；none = 只有马桶 + 洗手台（Half Bath） */
  wet: 'tub' | 'shower' | 'none'
  /** 洗手台个数（欧美主卫双台盆 = 2） */
  basins: 1 | 2
  basinW: number[]
  basinD: number
  washer?: boolean
  /**
   * 浴缸横在短边那头（欧美 5'×8' 次卫）：浴缸长度不超过短边净宽，这样离门最远的短墙和长墙同档，按「离门远」挑到短墙；
   * 不然长的浴缸档位优先，会顺着长墙放、把马桶和台盆挤到对面
   */
  tubAcross?: boolean
}

/**
 * 卫生间（马桶、洗手台、淋浴 / 浴缸同在一间）：几种摆放顺序都试，取摆得最全的。
 * 淋浴 / 浴缸离门最远（墙角），马桶居中靠墙，洗手台靠门。
 */
export function placeBathroom(plan: Plan, room: Room, b: BathSpec): Fixture[] {
  const door = firstDoorCenter(room, plan)
  const bb = bbox(room.points)
  const minDim = Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0)
  let tubLengths = [170, 160, 150, 140]
  if (b.tubAcross) {
    const ib = bbox(innerRoom(room, plan).points)
    const across = Math.min(ib.x1 - ib.x0, ib.y1 - ib.y0)
    tubLengths = tubLengths.filter((L) => L <= across || L === 140)
  }
  const wet: PlaceSpec | null =
    b.wet === 'tub'
      ? { kind: 'bathtub', fill: false, lengths: tubLengths, depth: Math.min(78, Math.round(minDim * 0.42)), far: door, underWindow: true }
      : b.wet === 'shower'
        ? { kind: 'bathtub', lengths: [100, 90, 85], depth: 90, far: door, underWindow: true }
        : null
  const toilet: PlaceSpec = { kind: 'toilet', lengths: [40], depth: 68, far: door }
  const basin: PlaceSpec = { kind: 'basin', lengths: b.basinW, depth: b.basinD, near: door, underWindow: true }
  const washer: PlaceSpec = { kind: 'washer', lengths: [64, 60], depth: 64, underWindow: true }
  const items = [wet, toilet, basin, ...(b.basins === 2 ? [{ ...basin, near: undefined }] : []), ...(b.washer ? [washer] : [])].filter((x): x is PlaceSpec => !!x)
  const orders: PlaceSpec[][] = [items, [toilet, ...items.filter((x) => x !== toilet)], [basin, ...items.filter((x) => x !== basin)], [...items].reverse()]
  let best: Fixture[] = []
  for (const order of orders) {
    const got: Fixture[] = []
    for (const spec of order) {
      // 第二个洗手台贴着第一个（双台盆）
      const first = got.find((f) => f.kind === 'basin')
      const s = spec.kind === 'basin' && first && b.basins === 2 ? { ...spec, near: { x: first.x, y: first.y }, nearMax: first.w + 10 } : spec
      const f = placeOnWall(room, { ...plan, fixtures: [...plan.fixtures, ...got] }, s)
      if (f) {
        if (spec === wet && b.wet === 'shower') f.shower = true
        got.push(f)
      }
    }
    const score = (fs: Fixture[]) => fs.length * 10 + (fs.some((f) => f.kind === 'toilet') ? 5 : 0)
    if (score(got) > score(best)) best = got
    if (got.length === items.length) break
  }
  plan.fixtures.push(...best)
  return best
}

/** 玄关鞋柜（靠墙的造作柜） */
export function shoeCabinet(plan: Plan, entry: Room, lengths = [120, 100, 90, 80, 60]) {
  const f = placeOnWall(entry, plan, { kind: 'builtin', lengths, depth: 38 })
  if (f) plan.fixtures.push({ ...f, builtinType: 'shoe' })
  return f
}

/** 卧室里的嵌入式衣柜（欧美 reach-in closet / 中式定制衣柜）：不挡通往阳台的落地窗 */
export function bedroomCloset(plan: Plan, room: Room, lengths = [200, 180, 160, 140, 120], depth = 60) {
  const f = placeOnWall(room, plan, { kind: 'builtin', lengths, depth, front: 70, sash: true } as PlaceSpec)
  if (f) plan.fixtures.push({ ...f, builtinType: 'closet' })
  return f
}

// ---------------------------------------------------------------------------
// 合规检查 / 带面积的生成
// ---------------------------------------------------------------------------

/** 所有户内房间是否都能从玄关走到（门 + 敞开边界），阳台从相邻房间的门窗进 */
export function unreachable(plan: Pick<Plan, 'rooms' | 'openings'>): Room[] {
  const adj = roomLinks(plan)
  const start = plan.rooms.find((r) => r.kind === 'entrance')
  if (!start) return plan.rooms
  const seen = new Set([start.id])
  const q = [start.id]
  while (q.length) for (const n of adj.get(q.shift()!) ?? []) if (!seen.has(n)) (seen.add(n), q.push(n))
  return plan.rooms.filter((r) => !seen.has(r.id))
}

/** 单层里房间之间的连通（门、通往阳台的窗、敞开边界 ≥ 60）：房间 id → 相邻可走的房间 id */
export function roomLinks(plan: Pick<Plan, 'rooms' | 'openings'>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const o of plan.openings) {
    const g = openingGeom(plan.rooms, o)
    if (!g) continue
    const other = plan.rooms.find((r) => r !== g.owner && pointInPolygon(add(g.center, mul(g.e.out, 12)), r.points)) ?? plan.rooms.find((r) => r !== g.owner && pointInPolygon(add(g.center, mul(g.e.out, -12)), r.points))
    if (!other) continue
    if (o.kind === 'window' && other.kind !== 'balcony' && g.owner.kind !== 'balcony') continue
    link(g.owner.id, other.id)
  }
  for (const a of plan.rooms)
    for (const b of plan.rooms) {
      if (a === b || !isOpenBetween(a, b)) continue
      if (edgesOf(a.points).some((e) => sharedIntervals(e, b).some(([lo, hi]) => hi - lo >= 60))) link(a.id, b.id)
    }
  return adj
}

/** 房间两两不重叠（面积交叠 > 1㎠ 视为重叠；采样判断，矩形 / L 形都适用） */
export function overlaps(plan: Pick<Plan, 'rooms'>): [Room, Room][] {
  const out: [Room, Room][] = []
  const rs = plan.rooms
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = bbox(rs[i].points)
      const b = bbox(rs[j].points)
      const x0 = Math.max(a.x0, b.x0)
      const x1 = Math.min(a.x1, b.x1)
      const y0 = Math.max(a.y0, b.y0)
      const y1 = Math.min(a.y1, b.y1)
      if (x1 - x0 <= 1 || y1 - y0 <= 1) continue
      let hit = false
      for (let x = x0 + 0.5; x < x1 && !hit; x += Math.max(1, (x1 - x0) / 12))
        for (let y = y0 + 0.5; y < y1 && !hit; y += Math.max(1, (y1 - y0) / 12)) if (pointInPolygon({ x, y }, rs[i].points) && pointInPolygon({ x, y }, rs[j].points)) hit = true
      if (hit) out.push([rs[i], rs[j]])
    }
  return out
}

/** 第二阶段之前统一做：开门方向 */
export function prepareDoors(plan: Plan) {
  orientDoors(plan)
}

export interface LayoutOpts {
  bedrooms: 'random' | 1 | 2 | 3 | 4
  corner: 'random' | 'yes' | 'no'
  /** 不做外轮廓变形（footprint.ts）：变形方案不合格时的退路 */
  plain?: boolean
}

export interface RegionLayout {
  c: Ctx
  plan: Plan
  /** 外轮廓变形过：同一种子不变形的方案 */
  plain?: () => RegionLayout
}

export interface RegionGen {
  region: Region
  /** 第一阶段：房间 + 门窗（面积就此确定） */
  layout: (seed: number, opts: LayoutOpts) => RegionLayout
  /** 第二阶段：设备 */
  furnish: (l: { c: Ctx; plan: Plan }) => Plan
  /** 合规：返回问题列表（空 = 合格）；checkFixtures = false 时只看布局 */
  violations: (plan: Plan, checkFixtures: boolean) => string[]
}

/** 和日式 generateWithArea 同一套路（searchWithArea）：面积合格且合规、通过骨架抽签的第一个胜出，否则给最接近的 */
export function generateRegionWithArea(
  gen: RegionGen,
  opts: { seed: number; bedrooms?: 'random' | 1 | 2 | 3 | 4; corner: 'random' | 'yes' | 'no'; minArea: number | null; maxArea: number | null },
  attempts = 400,
  keep?: (seed: number) => boolean,
) {
  const lo2 = { bedrooms: opts.bedrooms ?? 'random', corner: opts.corner }
  return searchWithArea({
    seed: opts.seed,
    minArea: opts.minArea,
    maxArea: opts.maxArea,
    attempts,
    key: `${gen.region}|${lo2.bedrooms}|${lo2.corner}`,
    keep,
    layout: (seed) => gen.layout(seed, lo2),
    layoutOk: (l) => gen.violations(l.plan, false).length === 0,
    furnish: gen.furnish,
    ok: (plan) => gen.violations(plan, true).length === 0,
  })
}

/** 面积（㎡） */
export const m2 = (r: Room) => area(r.points) / 10000

/** 房间在平面上离点最近的边（摆东西用） */
export function nearestEdge(r: Room, p: Vec) {
  let best = { i: 0, d: Infinity }
  edgesOf(r.points).forEach((e, i) => {
    const d = projectToSegment(p, e.a, e.b).d
    if (d < best.d) best = { i, d }
  })
  return best.i
}

export type { Fixture, FixtureKind, Plan, Region, Room }
