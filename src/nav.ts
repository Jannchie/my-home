// 地面导航网格：给沙盘里活动的宠物 / 机器人找路。
//   - 10cm 一格；格子可走 = 在允许的房间里、不在墙体里（门洞除外）、不在家具 / 设备的占地里。
//   - 每格再算「离最近障碍的距离」（clearance），半径 r 的角色只能站在 clearance ≥ r 的格子上，
//     这样同一张网格可以给大小不同的角色用，不会贴着墙或家具穿模。
//   - 两类：pet（可以下到玄関土间）、robot（扫地机器人、Kachaka：上不了台阶，不进玄関）。
//   - 找路：8 邻接 A*，再用视线检查拉直路径。

import { fixtureBox, fixtureDepth, openingGeom, pointInPolygon, type Box, type Fixture, type Plan, type Room, type RoomKind, type Vec } from './model'
import { wallSegments } from './walls'
import { ASSET_MAP } from './three/assets'
import { furnitureBox } from './snap'
import { floorY } from './three/house'

export type NavClass = 'pet' | 'robot'

const NO_PET: RoomKind[] = ['balcony', 'bath', 'storage']
const NO_ROBOT: RoomKind[] = [...NO_PET, 'entrance']

export interface NavOptions {
  /** 不算障碍的家具 id（活动角色自己、可以钻进去的窝） */
  ignore?: Set<string>
  cell?: number
}

export class NavGrid {
  readonly cell: number
  x0 = 0
  y0 = 0
  nx = 0
  ny = 0
  /** 每格所在房间的地面高度 */
  floor: Float32Array
  private clear: Record<NavClass, Float32Array>

  constructor(
    plan: Plan,
    opts: NavOptions = {},
  ) {
    this.cell = opts.cell ?? 10
    const pts = plan.rooms.flatMap((r) => r.points)
    const C = this.cell
    if (pts.length) {
      this.x0 = Math.floor(Math.min(...pts.map((p) => p.x)) / C) * C - C
      this.y0 = Math.floor(Math.min(...pts.map((p) => p.y)) / C) * C - C
      this.nx = Math.ceil((Math.max(...pts.map((p) => p.x)) - this.x0) / C) + 2
      this.ny = Math.ceil((Math.max(...pts.map((p) => p.y)) - this.y0) / C) + 2
    }
    const n = this.nx * this.ny
    this.floor = new Float32Array(n)
    const okPet = new Uint8Array(n)
    const okRobot = new Uint8Array(n)
    const blocked = new Uint8Array(n)

    // 1. 房间：户内优先（和 roomAt 一致）
    const indoor = plan.rooms.filter((r) => r.kind !== 'balcony')
    const order = [...indoor, ...plan.rooms.filter((r) => r.kind === 'balcony')]
    for (let j = 0; j < this.ny; j++)
      for (let i = 0; i < this.nx; i++) {
        const p = this.center(i, j)
        const r: Room | undefined = order.find((q) => pointInPolygon(p, q.points))
        const k = j * this.nx + i
        if (!r) continue
        this.floor[k] = floorY(r)
        if (!NO_PET.includes(r.kind)) okPet[k] = 1
        if (!NO_ROBOT.includes(r.kind)) okRobot[k] = 1
      }

    // 2. 墙：非敞开的墙段按厚度栅格化，门洞挖开
    const door = new Uint8Array(n)
    for (const o of plan.openings) {
      if (o.kind === 'window') continue
      const g = openingGeom(plan.rooms, o)
      if (!g) continue
      const half = o.width / 2 - 4
      const across = plan.wallOuter / 2 + 4
      this.stamp(g.center, g.e.dir, half, across, door)
    }
    for (const s of wallSegments(plan.rooms)) {
      if (s.kind === 'open') continue
      const t = (s.kind === 'outer' ? plan.wallOuter : plan.wall) / 2
      this.capsule(s.a, s.b, t, blocked, door)
    }

    // 3. 家具（落地的）、设备
    const ignore = opts.ignore ?? new Set<string>()
    for (const f of plan.furniture) {
      const d = ASSET_MAP.get(f.asset)
      if (!d || d.mount || d.stick || (f.z ?? 0) > 0.5 || ignore.has(f.id) || d.h < 3) continue
      this.box(furnitureBox(f.asset, f.x, f.y, f.rot), blocked)
    }
    for (const fx of plan.fixtures) this.fixture(fx, blocked)

    // 4. clearance：两遍倒角距离变换（10 / 14），减去半格
    const dt = (ok: Uint8Array) => {
      const INF = 1e9
      const d = new Float32Array(n)
      for (let k = 0; k < n; k++) d[k] = ok[k] && !blocked[k] ? INF : 0
      const W = this.nx
      const a = C
      const b = C * Math.SQRT2
      for (let j = 0; j < this.ny; j++)
        for (let i = 0; i < W; i++) {
          const k = j * W + i
          if (!d[k]) continue
          let v = d[k]
          if (i > 0) v = Math.min(v, d[k - 1] + a)
          if (j > 0) {
            v = Math.min(v, d[k - W] + a)
            if (i > 0) v = Math.min(v, d[k - W - 1] + b)
            if (i < W - 1) v = Math.min(v, d[k - W + 1] + b)
          }
          if (i === 0 || j === 0 || i === W - 1 || j === this.ny - 1) v = Math.min(v, a)
          d[k] = v
        }
      for (let j = this.ny - 1; j >= 0; j--)
        for (let i = W - 1; i >= 0; i--) {
          const k = j * W + i
          if (!d[k]) continue
          let v = d[k]
          if (i < W - 1) v = Math.min(v, d[k + 1] + a)
          if (j < this.ny - 1) {
            v = Math.min(v, d[k + W] + a)
            if (i < W - 1) v = Math.min(v, d[k + W + 1] + b)
            if (i > 0) v = Math.min(v, d[k + W - 1] + b)
          }
          d[k] = v
        }
      for (let k = 0; k < n; k++) if (d[k]) d[k] -= C / 2
      return d
    }
    this.clear = { pet: dt(okPet), robot: dt(okRobot) }
  }

  center(i: number, j: number): Vec {
    return { x: this.x0 + (i + 0.5) * this.cell, y: this.y0 + (j + 0.5) * this.cell }
  }

  private cellOf(p: Vec): [number, number] {
    return [Math.floor((p.x - this.x0) / this.cell), Math.floor((p.y - this.y0) / this.cell)]
  }

  private index(p: Vec) {
    const [i, j] = this.cellOf(p)
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return -1
    return j * this.nx + i
  }

  /** p 处离最近障碍的距离（cm）；网格外为 0 */
  clearAt(cls: NavClass, p: Vec) {
    const k = this.index(p)
    return k < 0 ? 0 : this.clear[cls][k]
  }

  floorAt(p: Vec) {
    const k = this.index(p)
    return k < 0 ? 0 : this.floor[k]
  }

  canStand(cls: NavClass, p: Vec, r: number) {
    return this.clearAt(cls, p) >= r
  }

  // ---------- 栅格化 ----------

  /** 以 c 为中心、沿 dir 半长 half、垂直方向半宽 across 的矩形 */
  private stamp(c: Vec, dir: Vec, half: number, across: number, out: Uint8Array) {
    const r = Math.hypot(half, across) + this.cell
    const [i0, j0] = this.cellOf({ x: c.x - r, y: c.y - r })
    const [i1, j1] = this.cellOf({ x: c.x + r, y: c.y + r })
    for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
        const p = this.center(i, j)
        const dx = p.x - c.x
        const dy = p.y - c.y
        const u = dx * dir.x + dy * dir.y
        const v = -dx * dir.y + dy * dir.x
        if (Math.abs(u) <= half && Math.abs(v) <= across) out[j * this.nx + i] = 1
      }
  }

  /** 墙段：到线段距离 < t 的格子（门洞里的除外） */
  private capsule(a: Vec, b: Vec, t: number, out: Uint8Array, door: Uint8Array) {
    const pad = t + this.cell
    const [i0, j0] = this.cellOf({ x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad })
    const [i1, j1] = this.cellOf({ x: Math.max(a.x, b.x) + pad, y: Math.max(a.y, b.y) + pad })
    const dx = b.x - a.x
    const dy = b.y - a.y
    const L2 = dx * dx + dy * dy || 1
    for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
        const k = j * this.nx + i
        if (door[k]) continue
        const p = this.center(i, j)
        const s = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
        if (Math.hypot(p.x - a.x - dx * s, p.y - a.y - dy * s) < t + this.cell * 0.35) out[k] = 1
      }
  }

  /** 和盒子有重叠的格子都算占用 */
  private box(b: Box, out: Uint8Array) {
    const h = this.cell / 2
    const [i0, j0] = this.cellOf({ x: b.x0 - h + 0.01, y: b.y0 - h + 0.01 })
    const [i1, j1] = this.cellOf({ x: b.x1 + h - 0.01, y: b.y1 + h - 0.01 })
    for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
        const p = this.center(i, j)
        if (p.x > b.x0 - h && p.x < b.x1 + h && p.y > b.y0 - h && p.y < b.y1 + h) out[j * this.nx + i] = 1
      }
  }

  /** 设备：対面厨房只占背面食器棚和主台面两条，中间的通道能走 */
  private fixture(f: Fixture, out: Uint8Array) {
    if (f.kind === 'kitchen' && f.variant === 'facing') {
      const d = fixtureDepth(f)
      const a = (f.rot * Math.PI) / 180
      const ax = { x: Math.cos(a), y: Math.sin(a) }
      const ay = { x: -Math.sin(a), y: Math.cos(a) }
      for (const [lo, hi] of [
        [-d / 2, -d / 2 + 45],
        [d / 2 - 65, d / 2],
      ]) {
        const mid = (lo + hi) / 2
        this.stamp({ x: f.x + ay.x * mid, y: f.y + ay.y * mid }, ax, f.w / 2 + 2, (hi - lo) / 2 + 2, out)
      }
      return
    }
    this.box(fixtureBox(f), out)
  }

  // ---------- 查询 ----------

  /** 离 p 最近的、半径 r 能站的点（maxD 以内），没有返回 null */
  nearest(cls: NavClass, p: Vec, r: number, maxD = 150): Vec | null {
    if (this.canStand(cls, p, r)) return { ...p }
    const [ci, cj] = this.cellOf(p)
    const R = Math.ceil(maxD / this.cell)
    let best: Vec | null = null
    let bd = Infinity
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) continue
        if (this.clear[cls][j * this.nx + i] < r) continue
        const c = this.center(i, j)
        const d = Math.hypot(c.x - p.x, c.y - p.y)
        if (d < bd && d <= maxD) {
          bd = d
          best = c
        }
      }
    return best
  }

  /** 随机一个能站的点（margin：再多留出的余量；near / maxD：限制在某点附近） */
  randomSpot(cls: NavClass, r: number, rand: () => number, near?: Vec, maxD = Infinity, margin = 8): Vec | null {
    for (let t = 0; t < 200; t++) {
      let i: number
      let j: number
      if (near && maxD < Infinity) {
        const a = rand() * Math.PI * 2
        const d = Math.sqrt(rand()) * maxD
        ;[i, j] = this.cellOf({ x: near.x + Math.cos(a) * d, y: near.y + Math.sin(a) * d })
      } else {
        i = Math.floor(rand() * this.nx)
        j = Math.floor(rand() * this.ny)
      }
      if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) continue
      if (this.clear[cls][j * this.nx + i] >= r + margin) return this.center(i, j)
    }
    return null
  }

  /** a → b 的直线上处处 clearance ≥ r */
  lineFree(cls: NavClass, a: Vec, b: Vec, r: number) {
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(L / (this.cell * 0.2)))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      if (this.clearAt(cls, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) < r) return false
    }
    return true
  }

  /**
   * A* 找路，返回拉直后的折线（含起点、终点）。起点 / 终点站不下时就近挪到能站的格子。
   * 找不到返回 null。
   */
  path(cls: NavClass, from: Vec, to: Vec, r: number): Vec[] | null {
    const s = this.nearest(cls, from, r, 80)
    const g = this.nearest(cls, to, r, 80)
    if (!s || !g) return null
    const W = this.nx
    const n = W * this.ny
    const clear = this.clear[cls]
    const [si, sj] = this.cellOf(s)
    const [gi, gj] = this.cellOf(g)
    const start = sj * W + si
    const goal = gj * W + gi
    const gs = new Float32Array(n).fill(Infinity)
    const came = new Int32Array(n).fill(-1)
    const closed = new Uint8Array(n)
    const heap: [number, number][] = []
    const push = (f: number, k: number) => {
      heap.push([f, k])
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (heap[p][0] <= heap[i][0]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const rr = l + 1
          let m = i
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr
          if (m === i) break
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top
    }
    const h = (k: number) => {
      const dx = Math.abs((k % W) - gi)
      const dy = Math.abs(Math.floor(k / W) - gj)
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
    }
    gs[start] = 0
    push(h(start), start)
    const DIRS = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ]
    let found = start === goal
    while (heap.length && !found) {
      const [, k] = pop()
      if (closed[k]) continue
      closed[k] = 1
      if (k === goal) {
        found = true
        break
      }
      const i = k % W
      const j = (k - i) / W
      for (const [di, dj, c] of DIRS) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.ny) continue
        const nk = nj * W + ni
        if (closed[nk] || clear[nk] < r) continue
        // 斜走不切角
        if (di && dj && (clear[j * W + ni] < r || clear[nj * W + i] < r)) continue
        const ng = gs[k] + c
        if (ng < gs[nk]) {
          gs[nk] = ng
          came[nk] = k
          push(ng + h(nk), nk)
        }
      }
    }
    if (!found) return null
    const cells: Vec[] = []
    for (let k = goal; k !== -1; k = came[k]) {
      cells.push(this.center(k % W, Math.floor(k / W)))
      if (k === start) break
    }
    cells.reverse()
    cells[0] = s
    cells[cells.length - 1] = g
    // 拉直：从当前点出发，取能直线到达的最远点
    const out: Vec[] = [cells[0]]
    let i = 0
    while (i < cells.length - 1) {
      let j = cells.length - 1
      while (j > i + 1 && !this.lineFree(cls, cells[i], cells[j], r)) j--
      out.push(cells[j])
      i = j
    }
    return out
  }
}
