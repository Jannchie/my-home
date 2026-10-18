// 测试共用的生成与几何工具
import { generateWithArea, type GenOptions } from '/src/generate'
import { edgeInfo, onBoundary, pointInPolygon, type Plan, type Room, type Vec } from '/src/model'
import { isOpenBetween } from '/src/walls'

export const JP_OPTS: Omit<GenOptions, 'seed'> = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null }

/**
 * 日式户型：走和界面相同的入口 generateWithArea（从 seed 起找第一个符合表示规约的方案）。
 * 直接调 generateJapanese 不保证规约（LDK 帖数可能不足），界面也不会直接用它。
 */
export const genJp = (seed: number): Plan => generateWithArea({ seed, ...JP_OPTS }).plan

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/**
 * 两个直角多边形的重叠面积（cm²）：用两者全部顶点坐标切出网格，每个格子要么整个在内要么整个在外，按格心判断，结果精确。
 * 非直角多边形会退化成近似，这里的户型都是直角的。
 */
export function overlapArea(a: Vec[], b: Vec[]) {
  const xs = [...new Set([...a, ...b].map((p) => p.x))].sort((p, q) => p - q)
  const ys = [...new Set([...a, ...b].map((p) => p.y))].sort((p, q) => p - q)
  let s = 0
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      if (pointInPolygon(c, a) && pointInPolygon(c, b)) s += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    }
  return s
}

/** 点到房间的距离意义上的「在房间里」：内部或边界上（容差 tol） */
export const inRoom = (p: Vec, r: Room, tol = 1) => pointInPolygon(p, r.points) || onBoundary(r.points, p, tol)

/**
 * 房间连通图：门（非窗）连接所在边两侧的房间；敞开相邻（isOpenBetween）的房间之间也算连通。
 * withWindows = true 时窗也算（阳台靠落地窗进出）。
 */
export function roomGraph(plan: Plan, withWindows = false) {
  const adj = new Map<string, Set<string>>(plan.rooms.map((r) => [r.id, new Set<string>()]))
  const link = (a: string, b: string) => {
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const o of plan.openings) {
    if (o.kind === 'window' && !withWindows) continue
    const owner = plan.rooms.find((r) => r.id === o.roomId)
    if (!owner) continue
    const e = edgeInfo(owner.points, o.edge)
    const c = { x: e.a.x + e.dir.x * o.offset, y: e.a.y + e.dir.y * o.offset }
    // 门洞外侧一点点落在哪个房间
    const probe = { x: c.x + e.out.x * 5, y: c.y + e.out.y * 5 }
    const other = plan.rooms.find((r) => r !== owner && (pointInPolygon(probe, r.points) || (onBoundary(r.points, c, 1) && !pointInPolygon({ x: c.x - e.out.x * 5, y: c.y - e.out.y * 5 }, r.points))))
    if (other) link(owner.id, other.id)
  }
  for (let i = 0; i < plan.rooms.length; i++)
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i]
      const b = plan.rooms[j]
      if (isOpenBetween(a, b) && sharesEdge(a, b)) link(a.id, b.id)
    }
  return adj
}

/** 两个房间是否有一段长度 > 1cm 的共用边 */
export function sharesEdge(a: Room, b: Room) {
  for (let i = 0; i < a.points.length; i++) {
    const e = edgeInfo(a.points, i)
    for (let j = 0; j < b.points.length; j++) {
      const f = edgeInfo(b.points, j)
      // 平行（户型里多边形绕向不统一，同向反向都可能）且共线
      if (Math.abs(e.dir.x * f.dir.y - e.dir.y * f.dir.x) > 1e-6) continue
      const off = (f.a.x - e.a.x) * e.out.x + (f.a.y - e.a.y) * e.out.y
      if (Math.abs(off) > 1) continue
      const t0 = (f.a.x - e.a.x) * e.dir.x + (f.a.y - e.a.y) * e.dir.y
      const t1 = (f.b.x - e.a.x) * e.dir.x + (f.b.y - e.a.y) * e.dir.y
      const lo = Math.max(0, Math.min(t0, t1))
      const hi = Math.min(e.length, Math.max(t0, t1))
      if (hi - lo > 1) return true
    }
  }
  return false
}

/** 从 start 出发能到达的房间 id */
export function reachable(adj: Map<string, Set<string>>, start: string) {
  const seen = new Set([start])
  const q = [start]
  while (q.length) for (const n of adj.get(q.shift()!) ?? []) if (!seen.has(n)) seen.add(n), q.push(n)
  return seen
}

/** 把户型里的随机 id（uid 带时间戳和 Math.random）换成按出现顺序的序号，用于比较两次生成结构是否相同 */
export function normalizeIds(plan: Plan) {
  const map = new Map<string, string>()
  const idOf = (id: string) => {
    if (!map.has(id)) map.set(id, `#${map.size}`)
    return map.get(id)!
  }
  for (const r of plan.rooms) idOf(r.id)
  for (const o of plan.openings) idOf(o.id)
  for (const f of plan.fixtures) idOf(f.id)
  for (const f of plan.furniture) idOf(f.id)
  return JSON.parse(
    JSON.stringify(plan, (k, v) => ((k === 'id' || k === 'roomId' || k === 'stackOn' || k === 'savedId') && typeof v === 'string' ? (map.get(v) ?? v) : v)),
  )
}

/**
 * 骨架签名：户内房间按（行，x）排序后的种类序列，左右镜像取字典序小的那个。
 * 只看房间的相对排布，不看具体尺寸：同一骨架换了宽度、窗位还是同一个签名。
 */
export function skeletonSig(plan: Plan) {
  const rs = plan.rooms.filter((r) => r.kind !== 'balcony' && r.kind !== 'void')
  const xs = rs.flatMap((r) => r.points.map((p) => p.x))
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const cells = rs.map((r) => {
    const px = r.points.map((p) => p.x)
    const py = r.points.map((p) => p.y)
    return { k: `${r.floor ?? ''}${r.kind}`, x: (Math.min(...px) + Math.max(...px)) / 2, y: Math.round((Math.min(...py) + Math.max(...py)) / 2 / 150) }
  })
  const key = (mirror: boolean) =>
    cells
      .map((c) => ({ ...c, x: mirror ? x1 + x0 - c.x : c.x }))
      .sort((p, q) => p.y - q.y || p.x - q.x)
      .map((c) => c.k)
      .join(',')
  const a = key(false)
  const b = key(true)
  return a < b ? a : b
}

/** 旋转矩形（中心 c、宽 w、深 d、顺时针角度 rot）的四个角 */
export function rectCorners(c: Vec, w: number, d: number, rot: number): Vec[] {
  const a = (rot * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos }))
}

/** 两个凸多边形的穿透深度（SAT：各分离轴上投影重叠的最小值；≤ 0 表示不相交） */
export function penetration(a: Vec[], b: Vec[]) {
  let best = Infinity
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const L = Math.hypot(q.x - p.x, q.y - p.y)
      if (L < 1e-9) continue
      const n = { x: -(q.y - p.y) / L, y: (q.x - p.x) / L }
      const pa = a.map((v) => v.x * n.x + v.y * n.y)
      const pb = b.map((v) => v.x * n.x + v.y * n.y)
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))
      if (o < best) best = o
      if (best <= 0) return best
    }
  return best
}
