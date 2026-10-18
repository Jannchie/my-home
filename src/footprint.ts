// 外轮廓变形：把生成器排好的矩形户型切掉一角（凹口 / 退台）、往外凸出一块（凸窗、玄关凸出）、把阳台嵌进外轮廓（凹阳台）。
//
// 都是在第一阶段（房间 + 门窗，设备之前）做的后处理，只用直角多边形的网格运算：
//   carve：从外轮廓上挖掉矩形 N。碰到的房间（必须是矩形、允许变形的种类）变成 L 形或整体变浅，不留空洞；
//          fill 给了阳台时，挖掉的地方并进阳台（凹阳台 / L 形阳台）。
//   bump ：在矩形房间的一条外墙外加一块矩形（凸窗 / 玄关凸出），那面墙上的门窗挪到凸出部分的外墙上。
// 门窗按世界坐标重新挂到新多边形的边上；挂不上的窗挪到同一朝向最长的外墙段，门挂不上就放弃这次变形（不改任何东西）。
// 随机数只用 c.alt（第二条序列），主序列不动：放弃变形时户型和以前完全一样。

import { area, edgesOf, isAxisRect, pointInPolygon, projectToSegment, add, mul, signedArea, fixtureBox, type Fixture, type Opening, type Room, type RoomKind, type Vec } from './model'
import { isIndoor } from './walls'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const rectPts = (r: Rect): Vec[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
]

const key = (p: Vec) => `${p.x},${p.y}`

/**
 * 直角多边形的布尔运算：按所有输入的顶点坐标切网格，on(格心) 为真的格子拼成一个多边形。
 * 结果必须是一整块、没有洞、没有只在一个角上相连的地方，否则返回 null。
 * 顶点从最上（y 最小）最左的点开始，绕向和 rectPoints 一致（signedArea > 0），共线的点去掉。
 */
export function gridPolygon(polys: Vec[][], on: (p: Vec) => boolean): Vec[] | null {
  const xs = [...new Set(polys.flat().map((p) => p.x))].sort((a, b) => a - b)
  const ys = [...new Set(polys.flat().map((p) => p.y))].sort((a, b) => a - b)
  const nx = xs.length - 1
  const ny = ys.length - 1
  const cell: boolean[][] = []
  for (let i = 0; i < nx; i++) {
    cell.push([])
    for (let j = 0; j < ny; j++) cell[i].push(on({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }))
  }
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && cell[i][j]
  // 每个格子按 (x0,y0)→(x1,y0)→(x1,y1)→(x0,y1) 绕一圈，只留和空格子相邻的边
  const next = new Map<string, Vec[]>()
  let count = 0
  const edge = (a: Vec, b: Vec) => {
    const k = key(a)
    next.set(k, [...(next.get(k) ?? []), b])
    count++
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!cell[i][j]) continue
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]]
      if (!at(i, j - 1)) edge({ x: x0, y: y0 }, { x: x1, y: y0 })
      if (!at(i + 1, j)) edge({ x: x1, y: y0 }, { x: x1, y: y1 })
      if (!at(i, j + 1)) edge({ x: x1, y: y1 }, { x: x0, y: y1 })
      if (!at(i - 1, j)) edge({ x: x0, y: y1 }, { x: x0, y: y0 })
    }
  if (!count) return null
  for (const v of next.values()) if (v.length !== 1) return null
  const starts = [...next.keys()].map((k) => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const start = { x: starts[0][0], y: starts[0][1] }
  const loop: Vec[] = [start]
  let cur = next.get(key(start))![0]
  for (let guard = 0; key(cur) !== key(start); guard++) {
    if (guard > count) return null
    loop.push(cur)
    cur = next.get(key(cur))![0]
  }
  // 一圈没走完所有边：不止一块，或者有洞
  if (loop.length !== count) return null
  const out = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length]
    const b = loop[(i + 1) % loop.length]
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y))
  })
  return signedArea(out) > 0 ? out : null
}

const inRect = (p: Vec, r: Rect) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1

/** 多边形和矩形的重叠面积 */
export function overlapRect(pts: Vec[], r: Rect) {
  const xs = [...new Set([...pts.map((p) => p.x), r.x0, r.x1])].sort((a, b) => a - b)
  const ys = [...new Set([...pts.map((p) => p.y), r.y0, r.y1])].sort((a, b) => a - b)
  let s = 0
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      if (inRect(c, r) && pointInPolygon(c, pts)) s += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    }
  return s
}

export interface ShapeTarget {
  rooms: Room[]
  openings: Opening[]
  fixtures?: Fixture[]
}

/** 门窗的世界坐标：中心、方向、外法线 */
function openingAt(rooms: Room[], o: Opening) {
  const r = rooms.find((x) => x.id === o.roomId)
  if (!r || o.edge >= r.points.length) return null
  const e = edgesOf(r.points)[o.edge]
  return { r, e, c: add(e.a, mul(e.dir, o.offset)) }
}

/** 点 p 往 out 方向探一下，落在哪个户内房间（except 除外） */
const indoorAt = (rooms: Room[], p: Vec, except: Room[]) => rooms.find((x) => !except.includes(x) && isIndoor(x) && pointInPolygon(p, x.points))

interface Move {
  o: Opening
  edge: number
  offset: number
  width: number
}

/**
 * 房间 r 换成新多边形 pts 后，它自己的门窗挂到哪条边上。
 *   中心和整个宽度还落在某条新边上：照原位置挂；
 *   否则（原来那段墙没了 / 被切短了）：窗、通往户外的门挪到同一朝向、外侧是户外的最长一段墙（靠近原位置）。
 * 返回 null = 有门挂不上（这次变形放弃）；dropped = 放不下而去掉的窗。
 */
function remap(before: Room[], rooms: Room[], r: Room, pts: Vec[], ops: Opening[]) {
  const es = edgesOf(pts)
  const others = rooms.filter((x) => x.id !== r.id)
  const moves: Move[] = []
  const dropped: Opening[] = []
  const exterior = (e: (typeof es)[number], t: number) => {
    const p = add(add(e.a, mul(e.dir, t)), mul(e.out, 15))
    return !indoorAt(others, p, [])
  }
  for (const o of ops.filter((x) => x.roomId === r.id)) {
    const g = openingAt(before, o)
    if (!g) continue
    let hit: Move | null = null
    es.forEach((e, i) => {
      if (hit) return
      const p = projectToSegment(g.c, e.a, e.b)
      if (p.d < 0.5 && p.t - o.width / 2 >= -0.5 && p.t + o.width / 2 <= e.length + 0.5) hit = { o, edge: i, offset: p.t, width: o.width }
    })
    if (hit) {
      moves.push(hit)
      continue
    }
    // 通往户外的门（入户门）、窗：外侧原本不是户内房间
    const outside = !indoorAt(before, add(g.c, mul(g.e.out, 15)), [r])
    if (o.kind !== 'window' && !outside) return null
    let best: { i: number; t: number; L: number } | null = null
    es.forEach((e, i) => {
      if (e.out.x * g.e.out.x + e.out.y * g.e.out.y < 0.99) return
      if (!exterior(e, e.length / 2)) return
      const t = projectToSegment(g.c, e.a, e.b).t
      if (!best || e.length > best.L) best = { i, t, L: e.length }
    })
    const b = best as { i: number; t: number; L: number } | null
    const margin = o.kind === 'window' ? 30 : 12
    const width = b ? Math.min(o.width, b.L - margin * 2) : 0
    if (!b || width < (o.kind === 'window' ? Math.min(60, o.width) : o.width)) {
      if (o.kind !== 'window') return null
      dropped.push(o)
      continue
    }
    const offset = Math.max(width / 2 + margin, Math.min(b.L - width / 2 - margin, b.t))
    moves.push({ o, edge: b.i, offset, width })
  }
  return { moves, dropped }
}

export interface CarveRule {
  /** any = 可以变成 L 形；shrink = 只能整体变浅 / 变窄（仍是矩形，比如和室的榻榻米） */
  mode: 'any' | 'shrink'
  /** 剩下的每一条「臂」至少多宽 */
  minArm: number
  /** 剩下的面积下限（cm²） */
  minArea: number
}

/**
 * 从外轮廓上挖掉矩形 N。rule(r) 给出房间能不能被切、怎么切（null = 不能碰）。
 * 成功返回 true 并改好房间、门窗；任何一项不满足就什么都不改、返回 false。
 * fill：挖掉的地方并进这个阳台（凹阳台）。
 */
export function carve(t: ShapeTarget, N: Rect, rule: (r: Room) => CarveRule | null, fill?: Room): boolean {
  const hits = t.rooms.filter((r) => r !== fill && overlapRect(r.points, N) > 1)
  if (!hits.length) return false
  // 不变成阳台的凹口不能贴着阳台（阳台会悬在空处）
  const grow: Rect = { x0: N.x0 - 1, y0: N.y0 - 1, x1: N.x1 + 1, y1: N.y1 + 1 }
  if (t.rooms.some((r) => r !== fill && !isIndoor(r) && overlapRect(r.points, grow) > 0.5)) return false
  const next = new Map<Room, Vec[]>()
  for (const r of hits) {
    const ru = rule(r)
    if (!ru || !isAxisRect(r.points)) return false
    const pts = gridPolygon([r.points, rectPts(N)], (p) => pointInPolygon(p, r.points) && !inRect(p, N))
    if (!pts) return false
    if (ru.mode === 'shrink' && pts.length !== 4) return false
    if (area(pts) < ru.minArea) return false
    // 臂宽：切掉的部分（和 N 的交集）之外，剩下的开间 / 进深
    const bx = r.points.map((p) => p.x)
    const by = r.points.map((p) => p.y)
    const [rx0, rx1, ry0, ry1] = [Math.min(...bx), Math.max(...bx), Math.min(...by), Math.max(...by)]
    const iw = Math.min(rx1, N.x1) - Math.max(rx0, N.x0)
    const id = Math.min(ry1, N.y1) - Math.max(ry0, N.y0)
    const arms = [...(iw < rx1 - rx0 - 0.5 ? [rx1 - rx0 - iw] : []), ...(id < ry1 - ry0 - 0.5 ? [ry1 - ry0 - id] : [])]
    if (Math.min(...arms) < ru.minArm) return false
    next.set(r, pts)
  }
  // 别的房间（没被切的）开向 N 的门：门外就空了，不行（凹阳台时门外是阳台，可以）；窗没关系（外墙上的窗）
  for (const o of t.openings) {
    if (o.kind === 'window' || fill) continue
    const g = openingAt(t.rooms, o)
    if (!g || next.has(g.r)) continue
    const probes = [0, 0.45, -0.45].map((k) => add(add(g.c, mul(g.e.dir, k * o.width)), mul(g.e.out, 5)))
    if (probes.some((p) => inRect(p, N))) return false
  }
  if (t.fixtures?.some((f) => {
    const b = fixtureBox(f)
    return b.x0 < N.x1 - 1 && b.x1 > N.x0 + 1 && b.y0 < N.y1 - 1 && b.y1 > N.y0 + 1
  }))
    return false
  // 挖掉之后的房间集合（门窗挂靠用）
  const after = t.rooms.map((r) => (next.has(r) ? { ...r, points: next.get(r)! } : r))
  let fillPts: Vec[] | null = null
  if (fill) {
    fillPts = gridPolygon([fill.points, rectPts(N)], (p) => pointInPolygon(p, fill.points) || inRect(p, N))
    if (!fillPts) return false
  }
  const afterAll = fill ? after.map((r) => (r === fill ? { ...r, points: fillPts! } : r)) : after
  const allMoves: Move[] = []
  const allDropped: Opening[] = []
  for (const [r, pts] of next) {
    const res = remap(t.rooms, afterAll, r, pts, t.openings.filter((o) => o.roomId === r.id))
    if (!res) return false
    // 原来有窗的房间切完不能一扇窗都不剩（居室要采光）
    const had = t.openings.some((o) => o.roomId === r.id && o.kind === 'window')
    if (had && res.dropped.length === t.openings.filter((o) => o.roomId === r.id && o.kind === 'window').length) return false
    allMoves.push(...res.moves)
    allDropped.push(...res.dropped)
  }
  // 门窗挂靠是按切之前的边算的：先算完再一起改
  for (const [r, pts] of next) r.points = pts
  if (fill && fillPts) fill.points = fillPts
  for (const m of allMoves) {
    m.o.edge = m.edge
    m.o.offset = m.offset
    m.o.width = m.width
  }
  for (const o of allDropped) t.openings.splice(t.openings.indexOf(o), 1)
  return true
}

/**
 * 房间 r（矩形）的 side 一侧外墙往外凸出 depth，沿墙的范围 [a, b]（世界坐标，x 或 y）。
 * 凸出部分不能压到任何房间（阳台也不行）；那一侧的窗挪到凸出部分的外墙上（凸窗），入户门同理。
 */
export function bump(t: ShapeTarget, r: Room, side: 'n' | 's' | 'e' | 'w', a: number, b: number, depth: number): boolean {
  if (!isAxisRect(r.points) || depth <= 0 || b - a < 60) return false
  const xs = r.points.map((p) => p.x)
  const ys = r.points.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const N: Rect =
    side === 's' ? { x0: a, x1: b, y0: y0 - depth, y1: y0 } : side === 'n' ? { x0: a, x1: b, y0: y1, y1: y1 + depth } : side === 'w' ? { x0: x0 - depth, x1: x0, y0: a, y1: b } : { x0: x1, x1: x1 + depth, y0: a, y1: b }
  if (side === 's' || side === 'n' ? a < x0 - 0.5 || b > x1 + 0.5 : a < y0 - 0.5 || b > y1 + 0.5) return false
  if (t.rooms.some((x) => x !== r && overlapRect(x.points, N) > 1)) return false
  // 凸出部分外侧要是户外：这一侧原来就是外墙
  const out = side === 's' ? { x: 0, y: -1 } : side === 'n' ? { x: 0, y: 1 } : side === 'w' ? { x: -1, y: 0 } : { x: 1, y: 0 }
  const mid = side === 's' || side === 'n' ? { x: (a + b) / 2, y: side === 's' ? y0 : y1 } : { x: side === 'w' ? x0 : x1, y: (a + b) / 2 }
  if (indoorAt(t.rooms, add(mid, mul(out, 15)), [r])) return false
  if (t.fixtures?.some((f) => {
    const q = fixtureBox(f)
    return q.x0 < N.x1 - 1 && q.x1 > N.x0 + 1 && q.y0 < N.y1 - 1 && q.y1 > N.y0 + 1
  }))
    return false
  const pts = gridPolygon([r.points, rectPts(N)], (p) => pointInPolygon(p, r.points) || inRect(p, N))
  if (!pts) return false
  const after = t.rooms.map((x) => (x === r ? { ...x, points: pts } : x))
  // 凸出那一侧的边 / 凸出部分最外面的那条边
  const sideEdge = (e: ReturnType<typeof edgesOf>[number]) => e.out.x * out.x + e.out.y * out.y > 0.99
  const farEdge = (e: ReturnType<typeof edgesOf>[number]) => sideEdge(e) && (side === 's' ? Math.abs(e.a.y - N.y0) < 0.5 : side === 'n' ? Math.abs(e.a.y - N.y1) < 0.5 : side === 'w' ? Math.abs(e.a.x - N.x0) < 0.5 : Math.abs(e.a.x - N.x1) < 0.5)
  const res = remap(t.rooms, after, r, pts, t.openings.filter((o) => o.roomId === r.id))
  if (!res) return false
  // 凸窗：这一侧的窗都挂到凸出部分的外墙上
  const es = edgesOf(pts)
  const far = es.findIndex(farEdge)
  for (const m of res.moves) {
    const e0 = es[m.edge]
    if (!sideEdge(e0) || far < 0 || m.edge === far) continue
    const e = es[far]
    const margin = m.o.kind === 'window' ? 25 : 12
    const width = Math.min(m.width, e.length - margin * 2)
    if (width < (m.o.kind === 'window' ? Math.min(60, m.width) : m.width)) {
      if (m.o.kind !== 'window') return false
      continue
    }
    const tt = projectToSegment(add(e0.a, mul(e0.dir, m.offset)), e.a, e.b).t
    m.edge = far
    m.width = width
    m.offset = Math.max(width / 2 + margin, Math.min(e.length - width / 2 - margin, tt))
  }
  r.points = pts
  for (const m of res.moves) {
    m.o.edge = m.edge
    m.o.offset = m.offset
    m.o.width = m.width
  }
  for (const o of res.dropped) t.openings.splice(t.openings.indexOf(o), 1)
  return true
}

/**
 * 多层一起切同一个 N（户建：上下层的外墙对齐）。第一层必须切到房间；上面的层在 N 里没有房间就不管。
 * 任何一层不行就全部还原、返回 false。只在还没开门窗的时候用（不处理门窗）。
 */
export function carveFloors(floors: Room[][], N: Rect, rule: (r: Room) => CarveRule | null): boolean {
  const saved = floors.flat().map((r) => [r, r.points] as const)
  for (const [i, rooms] of floors.entries()) {
    if (i > 0 && !rooms.some((r) => overlapRect(r.points, N) > 1)) continue
    if (!carve({ rooms, openings: [] }, N, rule)) {
      for (const [r, pts] of saved) r.points = pts
      return false
    }
  }
  return true
}

/** 户内房间合起来的包围盒（阳台、挑空不算） */
export function indoorBox(rooms: Room[]): Rect {
  const pts = rooms.filter(isIndoor).flatMap((r) => r.points)
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) }
}

/** 外墙角 corner 处那间房（户内） */
export function cornerRoom(rooms: Room[], box: Rect, corner: 'nw' | 'ne' | 'sw' | 'se') {
  const p = { x: corner[1] === 'w' ? box.x0 + 5 : box.x1 - 5, y: corner[0] === 's' ? box.y0 + 5 : box.y1 - 5 }
  return rooms.find((r) => isIndoor(r) && pointInPolygon(p, r.points)) ?? null
}

export type AltCtx = { alt: () => number; altChance: (p: number) => boolean }

/** 用第二条随机序列取 [lo, hi] 里 10 的倍数 */
export const altInt = (c: AltCtx, lo: number, hi: number) => (hi <= lo ? Math.round(lo / 10) * 10 : Math.round((lo + c.alt() * (hi - lo)) / 10) * 10)

/**
 * 各种房间被切时的规矩（null = 不切：用水房间、厨房、玄关、走廊有设备 / 门的位置要求）。
 * minAreaM2：各种房间切完的面积下限（㎡）；keep：「至少留下原面积的几成」再乘的系数（户建切得狠一些）
 */
export function defaultRule(minAreaM2: Partial<Record<RoomKind, number>> = {}, keep = 1): (r: Room) => CarveRule | null {
  return (r) => {
    const a0 = area(r.points) * keep
    const m = (k: RoomKind, d: number) => (minAreaM2[k] ?? d) * 10000
    switch (r.kind) {
      case 'western':
        return { mode: 'any', minArm: 200, minArea: Math.max(m('western', 7.3), a0 * 0.62) }
      case 'japanese':
        return { mode: 'shrink', minArm: 250, minArea: Math.max(m('japanese', 7.3), a0 * 0.62) }
      case 'ldk':
      case 'dining':
        return { mode: 'any', minArm: 220, minArea: Math.max(m(r.kind, 8), a0 * 0.7) }
      case 'storage':
      case 'other':
        return { mode: 'shrink', minArm: 90, minArea: Math.max(m(r.kind, 1.2), a0 * 0.5) }
      default:
        return null
    }
  }
}

/**
 * 切一个外墙角（N 贴着两条外墙）：切角上那间房（rule 允许的种类）。
 * 凹口的宽 / 深按那间房的开间 / 进深取比例（size.w / size.d），再限制在 [min, max] 厘米之间；
 * 约三成凹口和整间房一样宽（房间整体变浅，仍是矩形）。依次试几档尺寸（大的先试），都不行返回 null。
 */
export function carveCorner(
  c: AltCtx,
  t: ShapeTarget,
  corner: 'nw' | 'ne' | 'sw' | 'se',
  rule: (r: Room) => CarveRule | null,
  size: { w: [number, number]; d: [number, number]; min?: number; max?: number },
  fill?: Room,
): Rect | null {
  const box = indoorBox(t.rooms)
  const r = cornerRoom(t.rooms, box, corner)
  if (!r || !rule(r) || !isAxisRect(r.points)) return null
  const xs = r.points.map((p) => p.x)
  const ys = r.points.map((p) => p.y)
  const rw = Math.max(...xs) - Math.min(...xs)
  const rd = Math.max(...ys) - Math.min(...ys)
  const lo = size.min ?? 90
  const hi = size.max ?? 260
  const fw = size.w[0] + c.alt() * (size.w[1] - size.w[0])
  const fd = size.d[0] + c.alt() * (size.d[1] - size.d[0])
  const fullW = c.altChance(0.3)
  const r10 = (v: number) => Math.round(v / 10) * 10
  const tries: [number, number][] = [1, 0.75, 0.55].map((k) => [fullW ? rw : r10(Math.min(rw - 10, Math.max(lo, Math.min(hi, rw * fw * k)))), r10(Math.min(rd - 10, Math.max(lo, Math.min(hi, rd * fd * k))))])
  for (const [w, d] of tries) {
    if (w < 60 || d < 60) continue
    const N: Rect = {
      x0: corner[1] === 'w' ? box.x0 : box.x1 - w,
      x1: corner[1] === 'w' ? box.x0 + w : box.x1,
      y0: corner[0] === 's' ? box.y0 : box.y1 - d,
      y1: corner[0] === 's' ? box.y0 + d : box.y1,
    }
    if (carve(t, N, rule, fill)) return N
  }
  return null
}
