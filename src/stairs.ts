// 楼梯：踏步布置（平面图画踏步线和上楼箭头、3D 搭踏步和扶手共用）、上层的楼梯洞口、洞口与上层房间的冲突检查。
//
// 楼梯是设备（Fixture kind 'stairs'），放在下层，通到上面一层。局部坐标（和其他设备一样，x 沿宽、y 沿深，
// rot 顺时针）：起步在 +y 一端，往 -y 方向上楼。
//   straight 直跑：整块占地一跑到顶；
//   l        L 形：先沿一侧上到远端的转角平台，再横着拐出去（turn = 往哪边拐）；
//   u        U 形：一侧上到远端的平台，折返从另一侧上来，在起步那一端出梯；
//   spiral   旋转：扇形踏步绕中心柱转大约 300°。
// 最后一级踏步和上层地面齐平（落在洞口里），出梯口（arrival）是占地边界上接上层地面的那一段。

import { add, fixtureDepth, mul, pointInPolygon, rectPoints, type Fixture, type Plan, type Room, type Vec } from './model'
import { floorAbove, floorOf, isMultiFloor, riseOf } from './floors'
import { isVoid } from './walls'

/** 一级踢面的上限（cm）：级数 = ceil(层间高 / 它) */
export const MAX_RISER = 20

export interface StairStep {
  /** 踏面多边形（局部坐标） */
  poly: Vec[]
  /** 踏面高度（离本层地面） */
  top: number
}

export interface StairRail {
  /** 扶手沿线的点（局部坐标）和该处踏面高度 */
  pts: { x: number; y: number; h: number }[]
}

export interface StairLayout {
  steps: StairStep[]
  /** 上楼方向的路线（局部坐标）：平面图上画箭头 */
  path: Vec[]
  /** 出梯口：占地边界上接上层地面的那一段（局部坐标） */
  arrival: [Vec, Vec]
  rails: StairRail[]
  /** 旋转楼梯：外圈半径（中心在原点） */
  radius?: number
}

export const stairsVariant = (f: Pick<Fixture, 'stairs'>) => f.stairs ?? 'straight'

/** 各形式的默认占地（宽 × 深），按 270 左右的层间高、每级约 25 的踏面算 */
export const STAIRS_SIZE: Record<NonNullable<Fixture['stairs']>, { w: number; d: number }> = {
  straight: { w: 90, d: 360 },
  l: { w: 180, d: 270 },
  u: { w: 180, d: 270 },
  spiral: { w: 170, d: 170 },
}

/** L 形楼梯的梯段宽 */
export const stairsRun = (f: Pick<Fixture, 'run' | 'w'> & { d?: number }, D: number) => Math.max(50, Math.min(f.run ?? 90, f.w / 2, D / 2))

/** 踏步布置（局部坐标）。rise：层间高 */
export function stairLayout(f: Fixture, rise: number): StairLayout {
  const W = f.w
  const D = fixtureDepth(f)
  const N = Math.max(3, Math.ceil(rise / MAX_RISER))
  const r = rise / N
  const v = stairsVariant(f)
  const steps: StairStep[] = []
  const rect = (x0: number, y0: number, x1: number, y1: number) => rectPoints(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1))
  if (v === 'spiral') {
    const R = Math.min(W, D) / 2
    const sgn = f.turn === 'right' ? 1 : -1
    const th = (Math.PI * 2 * 0.84) / N
    const a0 = Math.PI / 2 - (sgn * th) / 2
    const at = (a: number, k: number) => ({ x: Math.cos(a) * k, y: Math.sin(a) * k })
    for (let i = 0; i < N; i++) {
      const a = a0 + sgn * i * th
      const b = a0 + sgn * (i + 1) * th
      const poly = [at(a, 8), at(a, R), at((a * 2 + b) / 3, R), at((a + b * 2) / 3, R), at(b, R), at(b, 8)]
      steps.push({ poly, top: (i + 1) * r })
    }
    const path = Array.from({ length: N + 1 }, (_, i) => at(a0 + sgn * (i + 0.5) * th, R * 0.6)).slice(0, N)
    // 出梯口：最后一级的方向和占地边界的交点，沿边界取一段梯段宽
    const af = a0 + sgn * (N - 0.5) * th
    const d = { x: Math.cos(af), y: Math.sin(af) }
    const kx = Math.abs(d.x) > 1e-6 ? W / 2 / Math.abs(d.x) : Infinity
    const ky = Math.abs(d.y) > 1e-6 ? D / 2 / Math.abs(d.y) : Infinity
    const hit = mul(d, Math.min(kx, ky))
    const half = R * 0.45
    const arrival: [Vec, Vec] =
      kx < ky
        ? [{ x: hit.x, y: Math.max(-D / 2, hit.y - half) }, { x: hit.x, y: Math.min(D / 2, hit.y + half) }]
        : [{ x: Math.max(-W / 2, hit.x - half), y: hit.y }, { x: Math.min(W / 2, hit.x + half), y: hit.y }]
    const rails: StairRail[] = [{ pts: Array.from({ length: N }, (_, i) => ({ ...at(a0 + sgn * (i + 0.5) * th, R - 4), h: (i + 1) * r })) }]
    return { steps, path, arrival, rails, radius: R }
  }
  if (v === 'straight') {
    const t = D / N
    for (let i = 0; i < N; i++) steps.push({ poly: rect(-W / 2, D / 2 - i * t, W / 2, D / 2 - (i + 1) * t), top: (i + 1) * r })
    const side = (x: number): StairRail => ({ pts: [{ x, y: D / 2 - t / 2, h: r }, { x, y: -D / 2 + t / 2, h: rise }] })
    return {
      steps,
      path: [
        { x: 0, y: D / 2 },
        { x: 0, y: -D / 2 },
      ],
      arrival: [
        { x: -W / 2, y: -D / 2 },
        { x: W / 2, y: -D / 2 },
      ],
      rails: [side(-W / 2 + 4), side(W / 2 - 4)],
    }
  }
  // L / U：第一跑在 sx 一侧（往左拐时在右侧）
  const sx = f.turn === 'right' ? -1 : 1
  const m = N - 1
  if (v === 'l') {
    const s = stairsRun(f, D)
    const L1 = Math.max(1, D - s)
    const L2 = Math.max(1, W - s)
    const n1 = Math.min(m - 1, Math.max(1, Math.round((m * L1) / (L1 + L2))))
    const n2 = m - n1
    const t1 = L1 / n1
    const t2 = L2 / n2
    const xi = sx * (W / 2 - s)
    const xo = sx * (W / 2)
    for (let i = 0; i < n1; i++) steps.push({ poly: rect(xi, D / 2 - i * t1, xo, D / 2 - (i + 1) * t1), top: (i + 1) * r })
    steps.push({ poly: rect(xi, -D / 2, xo, -D / 2 + s), top: (n1 + 1) * r })
    for (let j = 0; j < n2; j++) steps.push({ poly: rect(xi - sx * j * t2, -D / 2, xi - sx * (j + 1) * t2, -D / 2 + s), top: (n1 + 2 + j) * r })
    const cx = sx * (W / 2 - s / 2)
    const cy = -D / 2 + s / 2
    // 扶手在内侧（L 的内角一侧）：第一跑沿 x = xi，平台内角，第二跑沿 y = -D/2 + s
    const yi = -D / 2 + s
    const rail: StairRail = {
      pts: [
        { x: xi - sx * 4, y: D / 2 - t1 / 2, h: r },
        { x: xi - sx * 4, y: yi + 4, h: (n1 + 1) * r },
        { x: xi - sx * t2 / 2, y: yi + 4, h: (n1 + 2) * r },
        { x: -sx * (W / 2) + sx * t2 / 2, y: yi + 4, h: rise },
      ],
    }
    return {
      steps,
      path: [
        { x: cx, y: D / 2 },
        { x: cx, y: cy },
        { x: -sx * (W / 2), y: cy },
      ],
      arrival: [
        { x: -sx * (W / 2), y: -D / 2 },
        { x: -sx * (W / 2), y: -D / 2 + s },
      ],
      rails: [rail],
    }
  }
  // U：两跑各占一半宽，远端整宽的平台
  const s = W / 2
  const L = Math.max(1, D - s)
  const n1 = Math.ceil(m / 2)
  const n2 = m - n1
  const t1 = L / n1
  const t2 = L / Math.max(1, n2)
  for (let i = 0; i < n1; i++) steps.push({ poly: rect(0, D / 2 - i * t1, sx * (W / 2), D / 2 - (i + 1) * t1), top: (i + 1) * r })
  steps.push({ poly: rect(-W / 2, -D / 2, W / 2, -D / 2 + s), top: (n1 + 1) * r })
  for (let j = 0; j < n2; j++) steps.push({ poly: rect(0, -D / 2 + s + j * t2, -sx * (W / 2), -D / 2 + s + (j + 1) * t2), top: (n1 + 2 + j) * r })
  const y1 = -D / 2 + s
  return {
    steps,
    path: [
      { x: sx * (W / 4), y: D / 2 },
      { x: sx * (W / 4), y: -D / 2 + s / 2 },
      { x: -sx * (W / 4), y: -D / 2 + s / 2 },
      { x: -sx * (W / 4), y: D / 2 },
    ],
    arrival: [
      { x: 0, y: D / 2 },
      { x: -sx * (W / 2), y: D / 2 },
    ],
    // 中间一道扶手：第一跑往上、绕过平台内侧、第二跑往上
    rails: [
      {
        pts: [
          { x: sx * 3, y: D / 2 - t1 / 2, h: r },
          { x: sx * 3, y: y1 + 3, h: (n1 + 1) * r },
          { x: -sx * 3, y: y1 + 3, h: (n1 + 1) * r },
          { x: -sx * 3, y: D / 2 - t2 / 2, h: rise },
        ],
      },
    ],
  }
}

/** 局部坐标 → 平面坐标（和设备的 rot 一致：顺时针） */
export function stairToWorld(f: Pick<Fixture, 'x' | 'y' | 'rot'>) {
  const a = (f.rot * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return (p: Vec): Vec => ({ x: f.x + p.x * c - p.y * s, y: f.y + p.x * s + p.y * c })
}

/** 楼梯占地（平面坐标，四个角） */
export function stairFootprint(f: Fixture): Vec[] {
  const W = f.w
  const D = fixtureDepth(f)
  return rectPoints(-W / 2, -D / 2, W / 2, D / 2).map(stairToWorld(f))
}

export interface StairHole {
  /** 下层的楼梯 */
  stair: Fixture
  /** 洞口多边形（平面坐标） */
  poly: Vec[]
  /** 出梯口（平面坐标）：洞口边上这一段不装栏杆 */
  arrival: [Vec, Vec]
}

/** 通到 floorId 这一层的楼梯在这一层的洞口（= 楼梯占地） */
export function stairHoles(p: Plan, floorId: string): StairHole[] {
  if (!isMultiFloor(p)) return []
  const out: StairHole[] = []
  for (const f of p.fixtures) {
    if (f.kind !== 'stairs') continue
    const from = floorOf(p, f)
    if (floorAbove(p, from)?.id !== floorId) continue
    const L = stairLayout(f, riseOf(p, from))
    const w = stairToWorld(f)
    out.push({ stair: f, poly: stairFootprint(f), arrival: [w(L.arrival[0]), w(L.arrival[1])] })
  }
  return out
}

/**
 * 给一层的子户型补上楼梯洞口：把通上来的楼梯照原样当作这一层的一个设备（只在这份子户型里，不写回户型），
 * 一键布置、检查补漏把它当障碍，洞口里不会摆家具。
 */
export function withStairHoles(p: Plan, view: Plan, floorId: string): Plan {
  const holes = stairHoles(p, floorId)
  if (!holes.length) return view
  return { ...view, fixtures: [...view.fixtures, ...holes.map((h) => ({ ...h.stair, id: `${h.stair.id}~hole`, floor: floorId }))] }
}

/** 楼板上要挖空的区域：楼梯洞口 + 挑空房间 */
export function slabHoles(p: Plan, floorId: string): Vec[][] {
  const voids = p.rooms.filter((r) => isVoid(r) && floorOf(p, r) === floorId).map((r) => r.points)
  return [...stairHoles(p, floorId).map((h) => h.poly), ...voids]
}

/** 洞口里可以有的房间：走廊（楼梯间常见的样子：洞口在走廊里，四周装栏杆）和挑空 */
const HOLE_OK = new Set<Room['kind']>(['hall', 'void'])

export interface HoleConflict {
  stairId: string
  roomId: string
  floor: string
}

/**
 * 楼梯洞口和上层房间的冲突：洞口压到了走廊 / 挑空以外的房间（卧室、卫生间…地板上开了个洞）。
 * 判断用两者重叠的面积（网格切分，直角多边形是精确的）大于 1 cm²。
 */
export function stairHoleConflicts(p: Plan): HoleConflict[] {
  if (!isMultiFloor(p)) return []
  const out: HoleConflict[] = []
  for (const fl of p.floors!) {
    const rooms = p.rooms.filter((r) => floorOf(p, r) === fl.id && !HOLE_OK.has(r.kind))
    for (const h of stairHoles(p, fl.id)) for (const r of rooms) if (overlapArea(h.poly, r.points) > 1) out.push({ stairId: h.stair.id, roomId: r.id, floor: fl.id })
  }
  return out
}

/** 两个多边形的重叠面积：用全部顶点坐标切网格，按格心判断（直角多边形精确，斜边近似） */
export function overlapArea(a: Vec[], b: Vec[]) {
  const xs = [...new Set([...a, ...b].map((v) => v.x))].sort((m, n) => m - n)
  const ys = [...new Set([...a, ...b].map((v) => v.y))].sort((m, n) => m - n)
  let s = 0
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      if (pointInPolygon(c, a) && pointInPolygon(c, b)) s += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    }
  return s
}

/** 平面图上的踏步线、箭头（平面坐标） */
export function stairPlanLines(f: Fixture, rise: number) {
  const L = stairLayout(f, rise)
  const w = stairToWorld(f)
  return { steps: L.steps.map((s) => s.poly.map(w)), path: L.path.map(w), arrival: L.arrival.map(w) as [Vec, Vec] }
}

/** 线段 a→b 上去掉 cut 覆盖的部分（cut 投影到 a→b 上，离线超过 tol 的不算） */
export function subtractSpan(a: Vec, b: Vec, cut: [Vec, Vec], tol = 2): [number, number][] {
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  if (L < 1e-6) return []
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  const off = (p: Vec) => Math.abs((p.x - a.x) * u.y - (p.y - a.y) * u.x)
  if (off(cut[0]) > tol || off(cut[1]) > tol) return [[0, L]]
  const t0 = (cut[0].x - a.x) * u.x + (cut[0].y - a.y) * u.y
  const t1 = (cut[1].x - a.x) * u.x + (cut[1].y - a.y) * u.y
  const lo = Math.max(0, Math.min(t0, t1))
  const hi = Math.min(L, Math.max(t0, t1))
  if (hi <= lo) return [[0, L]]
  return ([[0, lo], [hi, L]] as [number, number][]).filter(([x, y]) => y - x > 1)
}

export const lerpV = (a: Vec, b: Vec, t: number) => add(a, mul({ x: b.x - a.x, y: b.y - a.y }, t))
