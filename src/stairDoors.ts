// 门口和楼梯的冲突：门洞前后的通行区（门宽 × 两侧各 DOOR_PASS）、开门的扇形，碰到楼梯梯段、扶手、上层的楼梯洞口和洞口栏杆、挑空边栏杆就算挡住。
// 生成户建时用它挑门的位置（generate-house.ts），测试用它扫一批种子。几何和 3D 用的是同一份（stairLayout / holeRailSegments / voidRailSegments）。

import { add, mul, openingGeom, pointInPolygon, type Opening, type Plan, type Vec } from './model'
import { floorOf, isMultiFloor, openingFloor, planFloors, riseOf } from './floors'
import { holeRailSegments, overlapArea, stairFootprint, stairHoles, stairLayout, stairToWorld } from './stairs'
import { voidRailSegments, wallSegments } from './walls'

/** 门洞两侧要留的通行进深（从墙中心线算，cm） */
export const DOOR_PASS = 70

export type DoorStairPart = 'flight' | 'stairRail' | 'hole' | 'holeRail' | 'voidRail'

export interface DoorStairHit {
  opening: Opening
  floor: string
  /** 挡住门的是什么：楼梯梯段 / 楼梯扶手 / 上层洞口 / 洞口栏杆 / 挑空边栏杆 */
  what: DoorStairPart
  /** 挡在通行区还是开门扇形里 */
  zone: 'passage' | 'swing'
  stairId?: string
}

/** 门洞的通行区（平面坐标的四个角）：门宽（两边各收 2）× 墙两侧各 depth */
export function doorPassage(p: Pick<Plan, 'rooms'>, o: Opening, depth = DOOR_PASS): Vec[] | null {
  const g = openingGeom(p.rooms, o)
  if (!g) return null
  const h = o.width / 2 - 2
  const { dir, out } = g.e
  const at = (s: number, n: number) => add(g.center, add(mul(dir, s), mul(out, n)))
  return [at(-h, -depth), at(h, -depth), at(h, depth), at(-h, depth)]
}

/** 开门（kind door）门扇扫过的扇形的采样点；推拉门、折叠门没有 */
export function doorSwingSamples(p: Pick<Plan, 'rooms'>, o: Opening): Vec[] {
  if (o.kind !== 'door') return []
  const g = openingGeom(p.rooms, o)
  if (!g) return []
  const hinge = add(g.center, mul(g.e.dir, (o.hinge === 'start' ? -1 : 1) * (o.width / 2)))
  const u = o.hinge === 'start' ? g.e.dir : mul(g.e.dir, -1)
  const n = o.swing === 'in' ? mul(g.e.out, -1) : g.e.out
  const pts: Vec[] = []
  for (const k of [0.3, 0.55, 0.8, 0.97])
    for (let a = 6; a <= 84; a += 13) {
      const t = (a * Math.PI) / 180
      pts.push(add(hinge, add(mul(n, Math.cos(t) * o.width * k), mul(u, Math.sin(t) * o.width * k))))
    }
  return pts
}

/** 线段是否穿过多边形内部（端点在里面，或和某条边真相交） */
function segHitsPoly(a: Vec, b: Vec, poly: Vec[]) {
  // 沿线段采样：直角多边形 + 轴向线段，采样足够稳（端点贴边的不算）
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(2, Math.ceil(L / 4))
  for (let i = 1; i < n; i++) {
    const t = i / n
    if (pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, poly)) return true
  }
  return false
}

/** 多边形往里收 k（只对凸的四边形用：通行区） */
function shrinkQuad(q: Vec[], k: number): Vec[] {
  const c = q.reduce((s, v) => add(s, mul(v, 1 / q.length)), { x: 0, y: 0 })
  return q.map((v) => {
    const d = { x: v.x - c.x, y: v.y - c.y }
    return { x: v.x - Math.sign(d.x) * k, y: v.y - Math.sign(d.y) * k }
  })
}

/** 一层上会挡门的东西（平面坐标） */
export function stairObstacles(p: Plan, floorId: string) {
  const polys: { poly: Vec[]; what: DoorStairPart; stairId: string }[] = []
  const segs: { a: Vec; b: Vec; what: DoorStairPart; stairId?: string }[] = []
  const rooms = p.rooms.filter((r) => floorOf(p, r) === floorId)
  for (const f of p.fixtures) {
    if (f.kind !== 'stairs' || floorOf(p, f) !== floorId) continue
    polys.push({ poly: stairFootprint(f), what: 'flight', stairId: f.id })
    const w = stairToWorld(f)
    for (const r of stairLayout(f, riseOf(p, floorId)).rails) for (let i = 0; i + 1 < r.pts.length; i++) segs.push({ a: w(r.pts[i]), b: w(r.pts[i + 1]), what: 'stairRail', stairId: f.id })
  }
  if (isMultiFloor(p)) {
    const ws = wallSegments(rooms)
      .filter((s) => s.kind !== 'open')
      .map((s) => ({ a: s.a, b: s.b, t: s.kind === 'outer' ? p.wallOuter : p.wall }))
    const voids = rooms.filter((r) => r.kind === 'void')
    for (const h of stairHoles(p, floorId)) {
      polys.push({ poly: h.poly, what: 'hole', stairId: h.stair.id })
      const c = h.poly.reduce((s, v) => add(s, mul(v, 1 / h.poly.length)), { x: 0, y: 0 })
      if (voids.some((v) => pointInPolygon(c, v.points))) continue
      for (const [a, b] of holeRailSegments(h.poly, h.arrival, ws)) segs.push({ a, b, what: 'holeRail', stairId: h.stair.id })
    }
    for (const s of voidRailSegments(rooms)) segs.push({ a: s.a, b: s.b, what: 'voidRail' })
  }
  return { polys, segs }
}

/** 一扇门（推拉 / 折叠也算）被楼梯挡住的地方；空 = 没挡 */
export function doorStairHits(p: Plan, o: Opening, obs = stairObstacles(p, openingFloor(p, o))): DoorStairHit[] {
  if (o.kind === 'window') return []
  const floor = openingFloor(p, o)
  const out: DoorStairHit[] = []
  const pass = doorPassage(p, o)
  if (!pass) return out
  const inner = shrinkQuad(pass, 1)
  const swing = doorSwingSamples(p, o)
  for (const ob of obs.polys) {
    if (overlapArea(pass, ob.poly) > 20) out.push({ opening: o, floor, what: ob.what, zone: 'passage', stairId: ob.stairId })
    else if (swing.some((q) => pointInPolygon(q, ob.poly))) out.push({ opening: o, floor, what: ob.what, zone: 'swing', stairId: ob.stairId })
  }
  for (const s of obs.segs) {
    if (segHitsPoly(s.a, s.b, inner)) out.push({ opening: o, floor, what: s.what, zone: 'passage', stairId: s.stairId })
  }
  return out
}

/** 全户型：每扇门被楼梯挡住的地方 */
export function doorStairConflicts(p: Plan): DoorStairHit[] {
  if (!p.fixtures.some((f) => f.kind === 'stairs')) return []
  const out: DoorStairHit[] = []
  for (const fl of planFloors(p)) {
    const obs = stairObstacles(p, fl.id)
    if (!obs.polys.length && !obs.segs.length) continue
    for (const o of p.openings) if (o.kind !== 'window' && openingFloor(p, o) === fl.id) out.push(...doorStairHits(p, o, obs))
  }
  return out
}
