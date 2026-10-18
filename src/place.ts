// 设备贴墙摆放：厨房、浴缸、马桶、洗面台等通用。
// 避开：门的开扇范围、门洞前的通行空间、和玄関之间的敞开口、本墙上的门窗、已有设备。

import {
  add,
  bbox,
  boxOverlaps,
  dist,
  edgesOf,
  fixtureBox,
  fixtureFront,
  frontBox,
  isAxisEdge,
  mul,
  openingsOn,
  pointInPolygon,
  rotFacingWall,
  uid,
  type Box,
  type Fixture,
  type FixtureKind,
  type KitchenVariant,
  type Opening,
  type Plan,
  type Room,
  type Vec,
} from './model'
import { isOpenBetween, sharedIntervals, wallThicknessAt } from './walls'
import { stairKeepOut } from './stairs'
import { floorOf, riseOf } from './floors'
import { sashAllowed } from './windows'

export type PlaceCtx = Pick<Plan, 'rooms' | 'openings' | 'fixtures' | 'wall' | 'wallOuter'>

export interface PlaceSpec {
  kind: FixtureKind
  variant?: KitchenVariant
  /** 沿墙长度候选，靠前的优先 */
  lengths: number[]
  /** 长度尽量取整面墙净长，放不下再逐步缩短到 lengths[0]（浴缸） */
  fill?: boolean
  depth: number
  /** inner：只用不朝阳台的墙，里侧墙优先（厨房）；house：只用背后是户内房间的墙（阳台上的空调外机）；any：任意墙 */
  edges?: 'inner' | 'any' | 'house'
  /** 越靠近这个点越好（冰箱贴着厨房） */
  near?: Vec
  /** 和 near 的距离上限，超过就不放 */
  nearMax?: number
  /** 所在墙离这个点越远越好（浴缸、马桶背对门） */
  far?: Vec
  /** 在墙上居中，而不是贴角 */
  centered?: boolean
  /** 也避开边界上的窗（阳台上的空调外机别挡落地窗） */
  avoidWindows?: boolean
  /** 可以放在窗下（浴缸、洗面台、洗衣机） */
  underWindow?: boolean
  /** 覆盖默认的使用空间进深（家具用） */
  front?: number
  /** 通往阳台的落地窗前留出通行空间，underWindow 也不能挡在落地窗前（家具用；设备里冰箱位、卧室衣柜也传） */
  sash?: boolean
  /** 使用空间靠近本体的 45（椅子的位置）也不能压门的开合范围、门前通道（家具用：书桌前的椅子不挡门） */
  guardFront?: boolean
}

export function boxInside(b: Box, room: Room) {
  const e = 1
  const probes: Vec[] = []
  for (const fx of [0, 0.25, 0.5, 0.75, 1])
    for (const fy of [0, 0.5, 1]) probes.push({ x: b.x0 + e + (b.x1 - b.x0 - 2 * e) * fx, y: b.y0 + e + (b.y1 - b.y0 - 2 * e) * fy })
  if (!probes.every((p) => pointInPolygon(p, room.points))) return false
  // 凹多边形：房间顶点不能落在盒子内部
  return !room.points.some((p) => p.x > b.x0 + e && p.x < b.x1 - e && p.y > b.y0 + e && p.y < b.y1 - e)
}

const innerCache = new WeakMap<Room, { rooms: Room[]; inner: Room }>()
/**
 * 房间的墙面轮廓：房间多边形是墙体中心线，每条边按墙厚的一半往里收（一条边一部分是外墙、一部分是内墙时按厚的算）。
 * 在房间里找空地的家具（茶几、餐桌、餐椅、挤一挤的小东西）要整块落在这个轮廓里，才不会嵌进墙里。
 */
export function innerRoom(room: Room, ctx: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>): Room {
  const hit = innerCache.get(room)
  if (hit && hit.rooms === ctx.rooms) return hit.inner
  const edges = edgesOf(room.points)
  const half = edges.map((e) => {
    let t = 0
    const n = Math.max(1, Math.ceil(e.length / 30))
    for (let k = 0; k <= n; k++) {
      const s = Math.min(e.length - 2, Math.max(2, (e.length * k) / n))
      t = Math.max(t, wallThicknessAt(ctx, add(e.a, mul(e.dir, s)), e.out, room) / 2)
    }
    return t
  })
  const pts: Vec[] = []
  edges.forEach((e, i) => {
    const j = (i + edges.length - 1) % edges.length
    const prev = edges[j]
    const nPrev = mul(prev.out, -half[j])
    const nCur = mul(e.out, -half[i])
    if (prev.dir.x * e.dir.x + prev.dir.y * e.dir.y > 0.99) {
      // 共线的两条边：墙厚不同处错一个台阶
      pts.push(add(e.a, nPrev), add(e.a, nCur))
    } else pts.push(add(add(e.a, nPrev), nCur))
  })
  const inner = { ...room, points: pts }
  innerCache.set(room, { rooms: ctx.rooms, inner })
  return inner
}

const reflexCache = new WeakMap<Room, { rooms: Room[]; boxes: Box[] }>()
/**
 * 凹多边形房间（L 形）的阴角：墙中心线的拐点往两边各占半个墙厚，这一块是墙体。
 * 贴墙摆的东西只按所靠的那面墙让出半厚，伸到阴角旁边时要另外避开这里。
 */
export function reflexCorners(room: Room, ctx: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>): Box[] {
  const hit = reflexCache.get(room)
  if (hit && hit.rooms === ctx.rooms) return hit.boxes
  const es = edgesOf(room.points)
  const boxes: Box[] = []
  es.forEach((e, i) => {
    const prev = es[(i + es.length - 1) % es.length]
    // 往外法线方向拐 = 阴角（外法线朝左拐的话 prev.out 和 e.dir 同向）
    if (prev.out.x * e.dir.x + prev.out.y * e.dir.y < 0.5) return
    const h = Math.max(wallThicknessAt(ctx, add(e.a, mul(e.dir, 2)), e.out, room), wallThicknessAt(ctx, add(e.a, mul(prev.dir, -2)), prev.out, room)) / 2
    boxes.push({ x0: e.a.x - h, y0: e.a.y - h, x1: e.a.x + h, y1: e.a.y + h })
  })
  reflexCache.set(room, { rooms: ctx.rooms, boxes })
  return boxes
}

/** 盒子整块在房间的墙面轮廓内（不嵌进墙里） */
export function boxInsideWalls(b: Box, room: Room, ctx: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>) {
  return boxInside(b, innerRoom(room, ctx))
}

/**
 * 本房间边界上的门窗前方要留空的矩形区：
 * 开扇扫进本房间的门 = 门宽 × 门宽；折れ戸 = 门宽 × 半门宽；其余（开向另一侧、引き戸、窗）= 门宽 × 50 通行空间。
 * sash：通往阳台的落地窗（掃き出し窓）也是出入口，留出 50 的通行空间（家具用；设备里只有冰箱位、卧室衣柜传）。
 */
export function clearances(room: Room, ctx: PlaceCtx, avoidWindows: boolean, sash = false): Box[] {
  return clearanceZones(room, ctx, avoidWindows, sash).map((z) => z.box)
}

/** 留空区的种类：门扇扫过的范围、门前通道、落地窗前、腰窗前、楼梯（起步处 / 储物角开口前） */
export type ClearanceKind = 'door-swing' | 'door-front' | 'sash' | 'window' | 'stair'

/** clearances 的带种类版本（一键布置的占用表按种类区分用途） */
export function clearanceZones(room: Room, ctx: PlaceCtx, avoidWindows: boolean, sash = false): { box: Box; kind: ClearanceKind }[] {
  return [...openingClearances(room, ctx, avoidWindows, sash), ...stairClearances(room, ctx).map((box) => ({ box, kind: 'stair' as const }))]
}

/**
 * 这个房间里的楼梯要留空的地方（起步处、楼梯下储物角的开口前，见 stairKeepOut）。
 * ctx 带楼层表时按真实层间高算储物角，否则按常见的 270。
 */
function stairClearances(room: Room, ctx: PlaceCtx): Box[] {
  const plan = ctx as Partial<Plan>
  return ctx.fixtures
    .filter((f) => f.kind === 'stairs' && !f.id.endsWith('~hole'))
    .flatMap((f) => stairKeepOut(f, plan.floors ? riseOf(plan as Plan, floorOf(plan as Plan, f)) : 270))
    .filter((poly) => poly.some((q) => pointInPolygon(q, room.points)) || pointInPolygon(centroidOf(poly), room.points))
    .map(bbox)
}
const centroidOf = (poly: Vec[]) => poly.reduce((a, q) => ({ x: a.x + q.x / poly.length, y: a.y + q.y / poly.length }), { x: 0, y: 0 })

function openingClearances(room: Room, ctx: PlaceCtx, avoidWindows: boolean, sash = false): { box: Box; kind: ClearanceKind }[] {
  return openingsOn(room, ctx).flatMap(({ o, owner, e, center }) => {
    if (o.kind === 'window' && !avoidWindows && !sash) return []
    const isSash = o.kind === 'window' && isSashWindow(ctx, owner, e, center, o)
    if (o.kind === 'window' && !avoidWindows && !isSash) return []
    // 指向本房间内部的法线
    const into = pointInPolygon(add(center, mul(e.out, 5)), room.points) ? e.out : mul(e.out, -1)
    const swingsIn = (o.kind === 'door' || o.kind === 'folding') && (owner.id === room.id ? o.swing === 'in' : o.swing === 'out')
    const depth = swingsIn ? (o.kind === 'door' ? o.width : o.width / 2) + 5 : 50
    const p0 = add(center, mul(e.dir, -o.width / 2))
    const p1 = add(center, mul(e.dir, o.width / 2))
    const kind: ClearanceKind = o.kind !== 'window' ? (swingsIn ? 'door-swing' : 'door-front') : isSash ? 'sash' : 'window'
    return [{ box: bbox([p0, p1, add(p0, mul(into, depth)), add(p1, mul(into, depth))]), kind }]
  })
}

/** 开向本房间的门扇（平开门 = 门宽 × 门宽，折れ戸 = 门宽 × 半门宽）扫过的范围 */
export function doorSwings(room: Room, ctx: PlaceCtx): Box[] {
  return openingsOn(room, ctx).flatMap(({ o, owner, e, center }) => {
    if (o.kind !== 'door' && o.kind !== 'folding') return []
    if (!(owner.id === room.id ? o.swing === 'in' : o.swing === 'out')) return []
    const into = pointInPolygon(add(center, mul(e.out, 5)), room.points) ? e.out : mul(e.out, -1)
    const depth = (o.kind === 'door' ? o.width : o.width / 2) + 5
    const p0 = add(center, mul(e.dir, -o.width / 2))
    const p1 = add(center, mul(e.dir, o.width / 2))
    return [bbox([p0, p1, add(p0, mul(into, depth)), add(p1, mul(into, depth))])]
  })
}

/** 窗的一侧是阳台、另一侧是户内：落地窗（和 house.ts 的 sash 判定一致：窗外半墙厚 + 15 落在阳台里；阳台自己的窗反过来看） */
export function isSashWindow(ctx: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>, owner: Room, e: { out: Vec }, center: Vec, o?: Pick<Opening, 'sill'>) {
  // 朝阳台但窗台改成腰窗 / 高窗 / 地窗的：普通的窗，走不出去
  if (!sashAllowed(o)) return false
  const t = wallThicknessAt(ctx, center, e.out, owner)
  const outside = ctx.rooms.find((r) => r !== owner && pointInPolygon(add(center, mul(e.out, t / 2 + 15)), r.points))
  return (owner.kind === 'balcony') !== (outside?.kind === 'balcony') && !!outside
}

/** 边的外侧（墙背后）是户内房间：阳台上贴着建筑外墙的那一面 */
function backedByHouse(e: { a: Vec; b: Vec; out: Vec }, ctx: PlaceCtx) {
  const mid = add(e.a, mul(add(e.b, mul(e.a, -1)), 0.5))
  const probe = add(mid, mul(e.out, ctx.wallOuter / 2 + 10))
  return ctx.rooms.some((r) => r.kind !== 'balcony' && pointInPolygon(probe, r.points))
}

/**
 * 所有可行的摆放位置，好的在前：先按长度候选的顺序（长的优先），同一长度内按评分。
 * 联合摆放（洗衣机 + 洗面台、厨房 + 冰箱）要遍历这些候选。
 */
export function placeCandidates(room: Room, ctx: PlaceCtx, spec: PlaceSpec): Fixture[] {
  const guards = clearances(room, ctx, !!spec.avoidWindows, !!spec.sash)
  const inRoom = ctx.fixtures.filter((f) => pointInPolygon({ x: f.x, y: f.y }, room.points))
  const obstacles = inRoom.map(fixtureBox)
  // 已有设备前方的使用空间：新设备不能占
  const fronts = inRoom.map(frontBox).filter((b): b is Box => !!b)
  const front = spec.front ?? fixtureFront({ kind: spec.kind, variant: spec.variant })
  // 没有墙的敞开边：和玄関之间的通行口、洗濯機置場的开口
  const passages = ctx.rooms.filter((r) => r.id !== room.id && ((r.kind === 'entrance' && room.kind !== 'entrance') || isOpenBetween(room, r)))
  const corners = reflexCorners(room, ctx)

  const edges = edgesOf(room.points)
    .map((e, i) => ({ i, e }))
    .filter(({ e }) => isAxisEdge(e) && (spec.edges !== 'inner' || e.out.y > -0.5))
    .filter(({ e }) => spec.edges !== 'house' || backedByHouse(e, ctx))
    // 里侧墙优先，其次侧墙；同类里长的优先
    .sort((a, b) => (spec.edges === 'inner' ? b.e.out.y - a.e.out.y : 0) || b.e.length - a.e.length)

  const out: { score: number; f: Fixture }[] = []
  edges.forEach(({ i, e }, rank) => {
    // 只和边有关的量，每条边算一次
    const blocked: [number, number][] = ctx.openings
      .filter((o) => o.roomId === room.id && o.edge === i && !(spec.underWindow && o.kind === 'window' && !(spec.sash && isSashWindow(ctx, room, e, add(e.a, mul(e.dir, o.offset)), o))))
      .map((o): [number, number] => [o.offset - o.width / 2 - 20, o.offset + o.width / 2 + 20])
    for (const p of passages) for (const [lo, hi] of sharedIntervals(e, p)) blocked.push([lo - 20, hi + 20])
    const inward = mul(e.out, -1)
    const mid = add(e.a, mul(e.dir, e.length / 2))
    const inset = wallThicknessAt(ctx, mid, e.out, room) / 2
    // 两端让出相邻墙的半厚（按两端各自的墙厚）。探点往房间里挪一点，不落在这条边的延长线上
    // （延长线正好是隔壁房间的边界时会误判成隔墙：L 形 / 凹口旁的房间，端头那面其实是外墙）
    const lo = wallThicknessAt(ctx, add(add(e.a, mul(e.dir, 1)), mul(inward, 3)), mul(e.dir, -1), room) / 2
    const endB = wallThicknessAt(ctx, add(add(e.b, mul(e.dir, -1)), mul(inward, 3)), e.dir, room) / 2
    const full = e.length - ctx.wallOuter
    const farBonus = spec.far ? dist(mid, spec.far) * 10 : 0

    // fill：从整面墙净长往下每次缩 15，越短扣分越多；同属第 0 档
    const tiers: { L: number; li: number }[] = spec.fill
      ? Array.from({ length: Math.max(0, Math.floor((full - (spec.lengths[0] ?? 110)) / 15)) + 1 }, (_, k) => ({ L: full - k * 15, li: 0 }))
      : spec.lengths.map((L, li) => ({ L, li }))

    for (const { L, li } of tiers) {
      if (L < 20) continue
      const hi = e.length - endB - L
      for (let t = lo; t <= hi + 0.01; t += 5) {
        if (blocked.some(([a, b]) => t < b && t + L > a)) continue
        let a = add(add(e.a, mul(e.dir, t)), mul(inward, inset))
        let b = add(a, mul(e.dir, L))
        // 设备坐标会取整：按取整后的位置检查，免得取整后和贴着的设备压进 1 以上
        const c0 = mul(add(add(a, b), mul(inward, spec.depth)), 0.5)
        const snap = { x: Math.round(c0.x) - c0.x, y: Math.round(c0.y) - c0.y }
        a = add(a, snap)
        b = add(b, snap)
        const box = bbox([a, b, add(a, mul(inward, spec.depth))])
        if (!boxInside(box, room)) continue
        if (corners.some((g) => boxOverlaps(g, box))) continue
        if (guards.some((g) => boxOverlaps(g, box))) continue
        if (obstacles.some((o) => boxOverlaps(o, box))) continue
        if (fronts.some((o) => boxOverlaps(o, box))) continue
        // 自己的使用空间要在房间内，且不被已有设备占住（使用空间之间可以共用）
        if (front > 0) {
          const fb = bbox([add(a, mul(inward, spec.depth)), add(b, mul(inward, spec.depth + front))])
          if (!boxInside(fb, room)) continue
          if (obstacles.some((o) => boxOverlaps(o, fb))) continue
          if (spec.guardFront) {
            const near = bbox([add(a, mul(inward, spec.depth)), add(b, mul(inward, spec.depth + Math.min(front, 45)))])
            if (guards.some((g) => boxOverlaps(g, near))) continue
          }
        }
        const center = mul(add(add(a, b), mul(inward, spec.depth)), 0.5)
        if (spec.near && spec.nearMax !== undefined && dist(center, spec.near) > spec.nearMax) continue
        let score = li * 1e8 + (spec.edges === 'inner' ? rank * 1e6 : 0) + (full - L) * (spec.fill ? 3 : 0) - farBonus
        score += spec.centered ? Math.abs(t + L / 2 - e.length / 2) : Math.min(t - lo, hi - t)
        if (spec.near) score += dist(center, spec.near) * 2
        out.push({
          score,
          f: {
            id: uid('f'),
            kind: spec.kind,
            ...(spec.kind === 'kitchen' ? { variant: spec.variant ?? 'wall' } : { d: spec.depth }),
            x: Math.round(center.x),
            y: Math.round(center.y),
            w: Math.round(L),
            rot: rotFacingWall(e.out),
          },
        })
      }
    }
  })
  return out.sort((a, b) => a.score - b.score).map((c) => c.f)
}

export function placeOnWall(room: Room, ctx: PlaceCtx, spec: PlaceSpec): Fixture | null {
  return placeCandidates(room, ctx, spec)[0] ?? null
}

/**
 * 一组两件设备的联合摆放：先放的那件逐个试候选位置，看后放的那件能不能放下。
 * 两种顺序都试；都放不下就退而求其次，只放能放下的那件。
 */
export function placePair(room: Room, ctx: PlaceCtx, a: PlaceSpec, b: PlaceSpec, tries = 60): Fixture[] {
  for (const [first, second] of [
    [a, b],
    [b, a],
  ]) {
    for (const f of placeCandidates(room, ctx, first).slice(0, tries)) {
      const g = placeOnWall(room, { ...ctx, fixtures: [...ctx.fixtures, f] }, second)
      if (g) return [f, g]
    }
  }
  const single = placeOnWall(room, ctx, a) ?? placeOnWall(room, ctx, b)
  return single ? [single] : []
}

/** 房间里的第一个门（设备要背对它） */
export function firstDoorCenter(room: Room, ctx: Pick<Plan, 'rooms' | 'openings'>): Vec | undefined {
  return openingsOn(room, ctx).find(({ o }) => o.kind !== 'window')?.center
}
