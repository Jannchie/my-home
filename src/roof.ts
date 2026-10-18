// 屋顶几何（纯函数：3D 搭建 three/exterior.ts 和测试共用，不依赖 three）。
//
// 每一层露在外面（上面没有楼层、也没有上层阳台盖着）的区域 R 盖一个整体的屋顶，不再拆成互相穿插的矩形块：
//   - 檐口范围 C：R 往外扩出「半墙厚 + 出檐」。下层的 C 不伸进上层的外轮廓，也不沿着上下层共用的外墙往上层旁边伸（不会在上层墙边多出一条檐）。
//   - 坡屋面（四坡 / 双坡 / 下屋）：直角多边形、等坡度的直骨架屋顶。对直角多边形，直骨架屋面的高度 = 到「会动的边」的 L∞ 距离
//     （正方形侵蚀），所以 h(p) = min over 动边 e of d∞(p, e)。屋脊、斜脊、天沟自然交在一起，整片屋面连续、不重叠、没有多余屋脊。
//       四坡：C 的外边都是动边。
//       双坡：「山墙端」（两头都是阳角、往里扫过去比自己长的短边）不动 → 两侧坡面一直延伸到山墙，山墙三角用外墙材质补齐。
//       下屋：贴着上层外墙的边、被上层切掉的边不动 → 屋面朝上层外墙升高（下屋 / 披屋），四坡风格两端是斜脊，双坡 / 单坡风格两端是山墙。
//     计算：侵蚀区域 E_t = C − ∪(动边 ⊕ 边长 t 的正方形)，坐标都是 c 或 c ± t；在所有可能的交换时刻之间组合结构不变，
//     每段时间里 E 的每条动边扫过一个平面梯形，拼起来就是精确的屋面（再补 T 形接缝、三角化）。
//   - 单坡（最上层）：整个 C 一个平面，高的一边朝北 / 东；四周墙补到屋面下。
//   - 平屋顶：C 范围的屋面板 + 沿外墙一圈女儿墙（下层的不沿上层外墙做）。
// 墙补齐：沿本层外墙（墙中心线），屋面底下高出墙顶的部分补上外墙（山墙三角、单坡的高墙、下屋两端的梯形）。

import { pointInPolygon, type RoofKind, type Vec } from './model'

export interface RoofRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const EPS = 1e-6

function uniq(v: number[]): number[] {
  const s = [...v].sort((a, b) => a - b)
  const out: number[] = []
  for (const x of s) if (!out.length || x - out[out.length - 1] > EPS) out.push(x)
  return out
}

/** xs[i] < x < xs[i + 1] 的 i；在范围外返回 -1（查询点都取在更细网格的格心，不会正好落在线上） */
function cellIndex(xs: number[], x: number): number {
  if (xs.length < 2 || x <= xs[0] || x >= xs[xs.length - 1]) return -1
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (xs[m] <= x) lo = m
    else hi = m
  }
  return lo
}

const inBox = (p: Vec, b: RoofRect) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1
const grow = (b: RoofRect, d: number): RoofRect => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d })

/** 直角区域：xs × ys 网格上的格子集合 */
export class Cells {
  readonly ny: number
  constructor(
    readonly xs: number[],
    readonly ys: number[],
    readonly on: Uint8Array,
  ) {
    this.ny = Math.max(0, ys.length - 1)
  }
  get nx() {
    return Math.max(0, this.xs.length - 1)
  }
  at(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.nx && j < this.ny && this.on[i * this.ny + j] === 1
  }
  has(p: Vec) {
    const i = cellIndex(this.xs, p.x)
    const j = cellIndex(this.ys, p.y)
    return i >= 0 && j >= 0 && this.on[i * this.ny + j] === 1
  }
  get empty() {
    return !this.on.some((v) => v === 1)
  }
  area() {
    let s = 0
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.ny; j++) if (this.at(i, j)) s += (this.xs[i + 1] - this.xs[i]) * (this.ys[j + 1] - this.ys[j])
    return s
  }
  /** 拆成互不重叠的矩形（先竖向连成条，再横向并起同样的条） */
  rects(): RoofRect[] {
    const { nx, ny } = this
    const used = new Uint8Array(nx * ny)
    const out: RoofRect[] = []
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        if (!this.at(i, j) || used[i * ny + j]) continue
        let j1 = j
        while (j1 + 1 < ny && this.at(i, j1 + 1) && !used[i * ny + j1 + 1]) j1++
        let i1 = i
        const colOk = (c: number) => {
          for (let k = j; k <= j1; k++) if (!this.at(c, k) || used[c * ny + k]) return false
          return true
        }
        while (i1 + 1 < nx && colOk(i1 + 1)) i1++
        for (let a = i; a <= i1; a++) for (let k = j; k <= j1; k++) used[a * ny + k] = 1
        out.push({ x0: this.xs[i], y0: this.ys[j], x1: this.xs[i1 + 1], y1: this.ys[j1 + 1] })
      }
    return out
  }
  static from(xs: number[], ys: number[], pred: (p: Vec) => boolean): Cells {
    const X = uniq(xs)
    const Y = uniq(ys)
    const nx = Math.max(0, X.length - 1)
    const ny = Math.max(0, Y.length - 1)
    const on = new Uint8Array(nx * ny)
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (pred({ x: (X[i] + X[i + 1]) / 2, y: (Y[j] + Y[j + 1]) / 2 })) on[i * ny + j] = 1
    return new Cells(X, Y, on)
  }
}

export const polyCells = (polys: Vec[][], pred: (p: Vec) => boolean, extra: RoofRect[] = []) =>
  Cells.from([...polys.flat().map((p) => p.x), ...extra.flatMap((b) => [b.x0, b.x1])], [...polys.flat().map((p) => p.y), ...extra.flatMap((b) => [b.y0, b.y1])], pred)

const boxesCells = (bs: RoofRect[]) => Cells.from(bs.flatMap((b) => [b.x0, b.x1]), bs.flatMap((b) => [b.y0, b.y1]), (p) => bs.some((b) => inBox(p, b)))

/** 正方形膨胀 */
export function dilate(c: Cells, d: number): Cells {
  return boxesCells(c.rects().map((b) => grow(b, d)))
}

/** 正方形侵蚀 */
export function erode(c: Cells, d: number): Cells {
  if (c.empty) return c
  const m = d + 10
  const X = [c.xs[0] - m, ...c.xs, c.xs[c.xs.length - 1] + m]
  const Y = [c.ys[0] - m, ...c.ys, c.ys[c.ys.length - 1] + m]
  const comp = Cells.from(X, Y, (p) => !c.has(p))
    .rects()
    .map((b) => grow(b, d))
  return Cells.from([...c.xs, ...comp.flatMap((b) => [b.x0, b.x1])], [...c.ys, ...comp.flatMap((b) => [b.y0, b.y1])], (p) => c.has(p) && !comp.some((b) => inBox(p, b)))
}

/** 几个区域按谓词合成（网格取并集） */
export function combine(parts: Cells[], pred: (p: Vec) => boolean, extraX: number[] = [], extraY: number[] = []): Cells {
  return Cells.from([...parts.flatMap((c) => c.xs), ...extraX], [...parts.flatMap((c) => c.ys), ...extraY], pred)
}

// ---------- 边界 ----------

/** 区域边界上的一条直线段：h 为真时是水平边（y = c），沿 a0..a1；out 是外法线方向（+1 / -1，沿垂直于边的轴） */
export interface Run {
  h: boolean
  c: number
  a0: number
  a1: number
  out: 1 | -1
}

/** 区域边界的单位边（网格格边），按直线和外法线分组后并成连续的段；cls 给每一小段分类，类别不同就断开 */
export function boundaryRuns<T extends string>(c: Cells, cls: (mid: Vec, outside: Vec) => T): (Run & { cls: T })[] {
  const units: (Run & { cls: T })[] = []
  const { xs, ys, nx, ny } = c
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!c.at(i, j)) continue
      const push = (h: boolean, cc: number, a0: number, a1: number, out: 1 | -1) => {
        const mid = h ? { x: (a0 + a1) / 2, y: cc } : { x: cc, y: (a0 + a1) / 2 }
        const outside = h ? { x: mid.x, y: cc + out * 0.5 } : { x: cc + out * 0.5, y: mid.y }
        units.push({ h, c: cc, a0, a1, out, cls: cls(mid, outside) })
      }
      if (!c.at(i, j - 1)) push(true, ys[j], xs[i], xs[i + 1], -1)
      if (!c.at(i, j + 1)) push(true, ys[j + 1], xs[i], xs[i + 1], 1)
      if (!c.at(i - 1, j)) push(false, xs[i], ys[j], ys[j + 1], -1)
      if (!c.at(i + 1, j)) push(false, xs[i + 1], ys[j], ys[j + 1], 1)
    }
  const groups = new Map<string, (Run & { cls: T })[]>()
  for (const u of units) {
    const k = `${u.h}|${u.c}|${u.out}`
    let g = groups.get(k)
    if (!g) groups.set(k, (g = []))
    g.push(u)
  }
  const out: (Run & { cls: T })[] = []
  for (const g of groups.values()) {
    g.sort((a, b) => a.a0 - b.a0)
    let cur = { ...g[0] }
    for (let k = 1; k < g.length; k++) {
      const u = g[k]
      if (Math.abs(u.a0 - cur.a1) < EPS && u.cls === cur.cls) cur.a1 = u.a1
      else {
        out.push(cur)
        cur = { ...u }
      }
    }
    out.push(cur)
  }
  return out
}

/** 一段边往区域里面扫，整段宽度都还在区域里的最大深度 */
function sweepDepth(c: Cells, r: Run): number {
  const along = r.h ? c.xs : c.ys
  const across = r.h ? c.ys : c.xs
  const i0 = along.findIndex((v) => Math.abs(v - r.a0) < EPS)
  const i1 = along.findIndex((v) => Math.abs(v - r.a1) < EPS)
  let k = across.findIndex((v) => Math.abs(v - r.c) < EPS)
  if (i0 < 0 || i1 < 0 || k < 0) return 0
  const dir = -r.out
  let d = 0
  for (;;) {
    const band = dir > 0 ? k : k - 1
    if (band < 0 || band >= across.length - 1) break
    let full = true
    for (let i = i0; i < i1 && full; i++) if (!(r.h ? c.at(i, band) : c.at(band, i))) full = false
    if (!full) break
    d += across[band + 1] - across[band]
    k += dir
  }
  return d
}

/** 段的两头是不是阳角（沿段方向再往前一点、靠区域里面的一侧已经不在区域里） */
function convexEnds(c: Cells, r: Run): boolean {
  const inn = -r.out * 0.5
  const probe = (a: number) => (r.h ? { x: a, y: r.c + inn } : { x: r.c + inn, y: a })
  return !c.has(probe(r.a0 - 0.5)) && !c.has(probe(r.a1 + 0.5))
}

/** 双坡的山墙端：两头阳角、往里扫的深度不短于自己的长度（一样长时只取竖边，屋脊沿 x，和以前的矩形双坡一致） */
export function isGableEnd(c: Cells, r: Run): boolean {
  if (!convexEnds(c, r)) return false
  const L = r.a1 - r.a0
  const d = sweepDepth(c, r)
  return d > L + 1 || (Math.abs(d - L) <= 1 && !r.h)
}

// ---------- 直骨架屋面 ----------

interface Sym {
  v: number
  s: -1 | 0 | 1
}
const symAt = (a: Sym, t: number) => a.v + a.s * t
const symKey = (a: Sym) => `${a.v.toFixed(6)},${a.s}`

function uniqSyms(list: Sym[]): Sym[] {
  const m = new Map<string, Sym>()
  for (const s of list) m.set(symKey(s), s)
  return [...m.values()]
}

/** 3D 点：平面 x、y，高度 z */
export type P3 = [number, number, number]

/**
 * 区域 C 上、动边集合 moving 的直骨架屋面（z = 侵蚀时间 t，即坡度 1 时的升高）。返回平面凸多边形（梯形 / 三角形）。
 */
export function skeletonFaces(C: Cells, moving: Run[]): P3[][] {
  if (!moving.length || C.empty) return []
  const xSyms: Sym[] = C.xs.map((v) => ({ v, s: 0 }))
  const ySyms: Sym[] = C.ys.map((v) => ({ v, s: 0 }))
  for (const m of moving) {
    if (m.h) {
      xSyms.push({ v: m.a0, s: -1 }, { v: m.a1, s: 1 })
      ySyms.push({ v: m.c, s: -1 }, { v: m.c, s: 1 })
    } else {
      xSyms.push({ v: m.c, s: -1 }, { v: m.c, s: 1 })
      ySyms.push({ v: m.a0, s: -1 }, { v: m.a1, s: 1 })
    }
  }
  const XS = uniqSyms(xSyms)
  const YS = uniqSyms(ySyms)
  const limit = Math.max(C.xs[C.xs.length - 1] - C.xs[0], C.ys[C.ys.length - 1] - C.ys[0]) + 1
  const cand: number[] = [0]
  for (const S of [XS, YS])
    for (let a = 0; a < S.length; a++)
      for (let b = a + 1; b < S.length; b++) {
        const p = S[a]
        const q = S[b]
        if (p.s === q.s) continue
        const t = (q.v - p.v) / (p.s - q.s)
        if (t > EPS && t < limit) cand.push(t)
      }
  const times = uniq(cand)
  times.push(limit)
  const inRect = (m: Run, t: number, p: Vec) => (m.h ? p.x > m.a0 - t && p.x < m.a1 + t && p.y > m.c - t && p.y < m.c + t : p.x > m.c - t && p.x < m.c + t && p.y > m.a0 - t && p.y < m.a1 + t)

  interface Open {
    h: boolean
    line: Sym
    from: Sym
    to: Sym
    t0: number
    t1: number
  }
  const done: Open[] = []
  let open = new Map<string, Open>()
  for (let k = 0; k + 1 < times.length; k++) {
    const ta = times[k]
    const tb = times[k + 1]
    const tm = (ta + tb) / 2
    const X = [...XS].sort((a, b) => symAt(a, tm) - symAt(b, tm))
    const Y = [...YS].sort((a, b) => symAt(a, tm) - symAt(b, tm))
    const nx = X.length - 1
    const ny = Y.length - 1
    const on = new Uint8Array(nx * ny)
    let any = false
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const p = { x: (symAt(X[i], tm) + symAt(X[i + 1], tm)) / 2, y: (symAt(Y[j], tm) + symAt(Y[j + 1], tm)) / 2 }
        if (C.has(p) && !moving.some((m) => inRect(m, tm, p))) {
          on[i * ny + j] = 1
          any = true
        }
      }
    if (!any) break
    const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && on[i * ny + j] === 1
    const next = new Map<string, Open>()
    const emit = (h: boolean, line: Sym, from: Sym, to: Sym, side: number) => {
      // E 在线的哪一侧，线就该往那一侧走（s 与 side 同号）；不动的线（C 的边界）是竖直的截面，不出屋面
      if (line.s === 0 || line.s !== side) return
      const key = `${h}|${symKey(line)}|${symKey(from)}|${symKey(to)}`
      const prev = open.get(key)
      if (prev && Math.abs(prev.t1 - ta) < EPS) {
        prev.t1 = tb
        next.set(key, prev)
        open.delete(key)
      } else next.set(key, { h, line, from, to, t0: ta, t1: tb })
    }
    // 水平边界线
    for (let j = 0; j <= ny; j++) {
      let i = 0
      while (i < nx) {
        const below = at(i, j - 1)
        const above = at(i, j)
        if (below === above) {
          i++
          continue
        }
        const side = above ? 1 : -1
        let i1 = i
        while (i1 + 1 < nx && at(i1 + 1, j - 1) === below && at(i1 + 1, j) === above) i1++
        emit(true, Y[j], X[i], X[i1 + 1], side)
        i = i1 + 1
      }
    }
    // 竖直边界线
    for (let i = 0; i <= nx; i++) {
      let j = 0
      while (j < ny) {
        const left = at(i - 1, j)
        const right = at(i, j)
        if (left === right) {
          j++
          continue
        }
        const side = right ? 1 : -1
        let j1 = j
        while (j1 + 1 < ny && at(i - 1, j1 + 1) === left && at(i, j1 + 1) === right) j1++
        emit(false, X[i], Y[j], Y[j1 + 1], side)
        j = j1 + 1
      }
    }
    for (const o of open.values()) done.push(o)
    open = next
  }
  for (const o of open.values()) done.push(o)
  const faces: P3[][] = []
  for (const o of done) {
    const pt = (a: Sym, t: number): P3 => (o.h ? [symAt(a, t), symAt(o.line, t), t] : [symAt(o.line, t), symAt(a, t), t])
    const poly = [pt(o.from, o.t0), pt(o.to, o.t0), pt(o.to, o.t1), pt(o.from, o.t1)]
    const clean = dedupe(poly)
    if (clean.length >= 3 && Math.abs(planArea(clean)) > 1e-4) faces.push(clean)
  }
  return faces
}

const same3 = (a: P3, b: P3) => Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5 && Math.abs(a[2] - b[2]) < 1e-5
function dedupe(poly: P3[]): P3[] {
  const out: P3[] = []
  for (const p of poly) if (!out.length || !same3(out[out.length - 1], p)) out.push(p)
  while (out.length > 1 && same3(out[0], out[out.length - 1])) out.pop()
  return out
}
function planArea(poly: P3[]) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/**
 * 凸多边形面片 → 三角形（x, y, z 平铺，每 9 个数一个三角形，平面上逆时针）。
 * 先把落在别的面片边上的顶点插进去（消掉 T 形接缝，避免细缝闪烁），有插点的面片用重心扇形三角化。
 */
export function tessellate(polys: P3[][]): number[] {
  const verts: P3[] = []
  const seen = new Set<string>()
  for (const p of polys)
    for (const v of p) {
      const k = `${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`
      if (!seen.has(k)) {
        seen.add(k)
        verts.push(v)
      }
    }
  const out: number[] = []
  for (const poly0 of polys) {
    const poly = planArea(poly0) < 0 ? [...poly0].reverse() : poly0
    const full: P3[] = []
    let inserted = false
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      full.push(a)
      const d: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
      if (L2 < 1e-10) continue
      const mids: [number, P3][] = []
      const [lx, hx] = [Math.min(a[0], b[0]) - 1e-4, Math.max(a[0], b[0]) + 1e-4]
      const [ly, hy] = [Math.min(a[1], b[1]) - 1e-4, Math.max(a[1], b[1]) + 1e-4]
      for (const v of verts) {
        if (v[0] < lx || v[0] > hx || v[1] < ly || v[1] > hy) continue
        const w: P3 = [v[0] - a[0], v[1] - a[1], v[2] - a[2]]
        const s = (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / L2
        if (s <= 1e-6 || s >= 1 - 1e-6) continue
        const e = [w[0] - s * d[0], w[1] - s * d[1], w[2] - s * d[2]]
        if (e[0] * e[0] + e[1] * e[1] + e[2] * e[2] < 1e-8) mids.push([s, v])
      }
      if (mids.length) {
        inserted = true
        mids.sort((m, n) => m[0] - n[0])
        for (const [, v] of mids) full.push(v)
      }
    }
    const tri = (p: P3, q: P3, r: P3) => out.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2])
    if (!inserted) {
      for (let i = 1; i + 1 < full.length; i++) tri(full[0], full[i], full[i + 1])
    } else {
      const c: P3 = [0, 0, 0]
      for (const v of full) {
        c[0] += v[0] / full.length
        c[1] += v[1] / full.length
        c[2] += v[2] / full.length
      }
      for (let i = 0; i < full.length; i++) tri(c, full[i], full[(i + 1) % full.length])
    }
  }
  return out
}

// ---------- 剖面、屋脊 ----------

/** 屋面沿平面线段 a→b 的高度剖面：[(参数 s ∈ [0, 1], z)]，按 s 排序；线段不在屋面上的地方没有点 */
export function profileAlong(tris: number[], a: Vec, b: Vec): [number, number][] {
  const d = { x: b.x - a.x, y: b.y - a.y }
  const pts: [number, number][] = []
  for (let k = 0; k < tris.length; k += 9) {
    const P = [0, 1, 2].map((m) => ({ x: tris[k + m * 3], y: tris[k + m * 3 + 1], z: tris[k + m * 3 + 2] }))
    // Cyrus–Beck：线段在三角形（逆时针）里的参数区间
    let lo = 0
    let hi = 1
    let ok = true
    for (let m = 0; m < 3 && ok; m++) {
      const p = P[m]
      const q = P[(m + 1) % 3]
      // 内侧法线（逆时针时在左边）
      const n = { x: -(q.y - p.y), y: q.x - p.x }
      const num = n.x * (a.x - p.x) + n.y * (a.y - p.y)
      const den = n.x * d.x + n.y * d.y
      if (Math.abs(den) < 1e-12) {
        if (num < -1e-7) ok = false
        continue
      }
      const t = -num / den
      if (den > 0) lo = Math.max(lo, t)
      else hi = Math.min(hi, t)
    }
    if (!ok || hi - lo < 1e-9) continue
    const z = (s: number) => {
      const x = a.x + d.x * s
      const y = a.y + d.y * s
      const [p0, p1, p2] = P
      const det = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)
      const l1 = ((x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (y - p0.y)) / det
      const l2 = ((p1.x - p0.x) * (y - p0.y) - (x - p0.x) * (p1.y - p0.y)) / det
      return p0.z + l1 * (p1.z - p0.z) + l2 * (p2.z - p0.z)
    }
    pts.push([lo, z(lo)], [hi, z(hi)])
  }
  pts.sort((p, q) => p[0] - q[0] || q[1] - p[1])
  const out: [number, number][] = []
  for (const p of pts) if (!out.length || p[0] - out[out.length - 1][0] > 1e-7) out.push(p)
  return out
}

/** 屋面上一点的高度（不在屋面上返回 null） */
export function roofHeightAt(tris: number[], p: Vec): number | null {
  let best: number | null = null
  for (let k = 0; k < tris.length; k += 9) {
    const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = tris.slice(k, k + 9)
    const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(det) < 1e-9) continue
    const l1 = ((p.x - x0) * (y2 - y0) - (x2 - x0) * (p.y - y0)) / det
    const l2 = ((x1 - x0) * (p.y - y0) - (p.x - x0) * (y1 - y0)) / det
    if (l1 < -1e-6 || l2 < -1e-6 || l1 + l2 > 1 + 1e-6) continue
    const z = z0 + l1 * (z1 - z0) + l2 * (z2 - z0)
    if (best === null || z > best) best = z
  }
  return best
}

export type CreaseKind = 'ridge' | 'hip' | 'valley'
export interface Crease {
  a: P3
  b: P3
  kind: CreaseKind
}

/**
 * 屋面的折线：两侧三角形不共面的内边。凸的（第三个点在对面三角形平面以下）是屋脊（水平）或斜脊（倾斜），凹的是天沟。
 * 共线相接的连成一段。
 */
export function creaseLines(tris: number[]): Crease[] {
  const key = (v: P3) => `${v[0].toFixed(3)},${v[1].toFixed(3)},${v[2].toFixed(3)}`
  const edges = new Map<string, { a: P3; b: P3; c: P3[]; n: P3[] }>()
  for (let k = 0; k < tris.length; k += 9) {
    const V: P3[] = [0, 1, 2].map((m) => [tris[k + m * 3], tris[k + m * 3 + 1], tris[k + m * 3 + 2]])
    const u = sub(V[1], V[0])
    const w = sub(V[2], V[0])
    const n = norm(cross(u, w))
    if (n[2] < 0) n.forEach((_, i) => (n[i] = -n[i]))
    for (let m = 0; m < 3; m++) {
      const a = V[m]
      const b = V[(m + 1) % 3]
      const ka = key(a)
      const kb = key(b)
      const k2 = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      let e = edges.get(k2)
      if (!e) edges.set(k2, (e = { a, b, c: [], n: [] }))
      e.c.push(V[(m + 2) % 3])
      e.n.push(n)
    }
  }
  let segs: Crease[] = []
  for (const e of edges.values()) {
    if (e.c.length !== 2) continue
    const [n1, n2] = e.n
    if (Math.abs(n1[0] - n2[0]) + Math.abs(n1[1] - n2[1]) + Math.abs(n1[2] - n2[2]) < 1e-4) continue
    const convex = dot(n1, sub(e.c[1], e.a)) < 0
    const kind: CreaseKind = !convex ? 'valley' : Math.abs(e.a[2] - e.b[2]) < 1e-4 ? 'ridge' : 'hip'
    segs.push({ a: e.a, b: e.b, kind })
  }
  // 共线相接的并起来
  for (let merged = true; merged; ) {
    merged = false
    outer: for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const s = segs[i]
        const t = segs[j]
        if (s.kind !== t.kind) continue
        const d1 = norm(sub(s.b, s.a))
        const d2 = norm(sub(t.b, t.a))
        if (Math.abs(Math.abs(dot(d1, d2)) - 1) > 1e-6) continue
        let joined: [P3, P3] | null = null
        const eq = (p: P3, q: P3) => key(p) === key(q)
        if (eq(s.b, t.a)) joined = [s.a, t.b]
        else if (eq(s.b, t.b)) joined = [s.a, t.a]
        else if (eq(s.a, t.a)) joined = [s.b, t.b]
        else if (eq(s.a, t.b)) joined = [s.b, t.a]
        if (!joined) continue
        segs[i] = { a: joined[0], b: joined[1], kind: s.kind }
        segs = segs.filter((_, k) => k !== j)
        merged = true
        break outer
      }
  }
  return segs
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: P3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

// ---------- 一层的屋顶 ----------

/** 补到屋面下的一段外墙：墙中心线 a→b，墙顶 base 往上补到 za / zb（两端高度，中间线性） */
export interface WallFill {
  a: Vec
  b: Vec
  za: number
  zb: number
}

export interface FlatRoof {
  /** 屋面板（互不重叠的矩形）和板顶高度 */
  slab: RoofRect[]
  slabTop: number
  /** 女儿墙（互不重叠的矩形，从板顶往上 PARAPET）、压顶（再往外各 2cm） */
  parapet: RoofRect[]
  coping: RoofRect[]
}

export interface RoofInput {
  kind: RoofKind
  /** 本层外轮廓（墙中心线） */
  outline: Vec[]
  /** 上面各层的外轮廓（下屋用；最上层为空） */
  above: Vec[][]
  /** 上面各层的阳台（阳台板就是下面的顶，不再盖屋顶） */
  aboveBalconies: Vec[][]
  /** 墙顶高度（本层局部坐标） */
  top: number
  /** 上一层地面比本层地面高多少（下屋的屋面不挡上层的窗） */
  upperRise?: number
  wallOuter: number
  pitch: number
  eave: number
}

export interface RoofShape {
  kind: RoofKind
  lower: boolean
  /** 屋顶盖住的房体区域（墙中心线，互不重叠的矩形） */
  rects: RoofRect[]
  /** 实际用的坡度 */
  pitch: number
  /** 屋面（上表面）三角形：x, y, 高度（本层局部坐标），平面上逆时针 */
  tris: number[]
  /** 屋面折线：屋脊、斜脊（压条）、天沟 */
  creases: Crease[]
  /** 屋面下补齐的外墙 */
  walls: WallFill[]
  flat?: FlatRoof
}

/** 屋面厚度 */
export const ROOF_T = 10
/** 女儿墙高 */
export const PARAPET = 60
/** 平屋顶的屋面板厚 */
export const FLAT_T = 14
/** 下屋的屋面最多升高多少（再高就压低坡度） */
const LEAN_MAX = 150

/** 一层露在外面的区域的屋顶几何；没有要盖的返回 null */
export function roofShape(inp: RoofInput): RoofShape | null {
  const { outline, above, top: H, wallOuter } = inp
  const o = wallOuter / 2
  const e = inp.eave
  const oe = o + e
  const lower = above.length > 0
  const inAbove = (p: Vec) => above.some((q) => pointInPolygon(p, q))
  const inBalc = (p: Vec) => inp.aboveBalconies.some((q) => pointInPolygon(p, q))
  const R = polyCells([outline, ...above, ...inp.aboveBalconies], (p) => pointInPolygon(p, outline) && !inAbove(p) && !inBalc(p))
  if (R.empty || R.area() < 1) return null
  const rects = R.rects()

  // 上下层共用的外墙：沿外侧挤出一条（下屋的檐、女儿墙不沿着它长到上层旁边）
  const sharedStrips = (d: number): RoofRect[] => {
    const out: RoofRect[] = []
    const xs = uniq(outline.map((p) => p.x).concat(above.flat().map((p) => p.x)))
    const ys = uniq(outline.map((p) => p.y).concat(above.flat().map((p) => p.y)))
    for (const q of above)
      for (let i = 0; i < q.length; i++) {
        const a = q[i]
        const b = q[(i + 1) % q.length]
        const horiz = Math.abs(a.y - b.y) < EPS
        const cuts = (horiz ? xs : ys).filter((v) => v > Math.min(horiz ? a.x : a.y, horiz ? b.x : b.y) - EPS && v < Math.max(horiz ? a.x : a.y, horiz ? b.x : b.y) + EPS)
        for (let k = 0; k + 1 < cuts.length; k++) {
          const s0 = cuts[k]
          const s1 = cuts[k + 1]
          const mid = horiz ? { x: (s0 + s1) / 2, y: a.y } : { x: a.x, y: (s0 + s1) / 2 }
          // 上层轮廓的外法线：往两侧各探一点，哪边在上层外
          const n = horiz ? { x: 0, y: pointInPolygon({ x: mid.x, y: mid.y + 1 }, q) ? -1 : 1 } : { x: pointInPolygon({ x: mid.x + 1, y: mid.y }, q) ? -1 : 1, y: 0 }
          const outP = { x: mid.x + n.x * 2, y: mid.y + n.y * 2 }
          if (pointInPolygon(outP, outline)) continue
          out.push(horiz ? { x0: s0, x1: s1, y0: Math.min(a.y, a.y + n.y * d), y1: Math.max(a.y, a.y + n.y * d) } : { y0: s0, y1: s1, x0: Math.min(a.x, a.x + n.x * d), x1: Math.max(a.x, a.x + n.x * d) })
        }
      }
    return out
  }

  if (inp.kind === 'flat') {
    const k = o + Math.min(e, 12)
    const strips = sharedStrips(k + 2)
    const blocked = (p: Vec) => inAbove(p) || strips.some((b) => inBox(p, b))
    const slabArea = lower ? combine([dilate(R, k)], (p) => dilate(R, k).has(p) && !blocked(p), above.flat().map((p) => p.x).concat(strips.flatMap((b) => [b.x0, b.x1])), above.flat().map((p) => p.y).concat(strips.flatMap((b) => [b.y0, b.y1]))) : dilate(R, k)
    // 女儿墙：外墙一圈（下屋只要外墙那几段，贴着上层的不要）
    const outerBand = dilate(R, o)
    const inner = erode(polyCells([outline, ...above], (p) => pointInPolygon(p, outline) || inAbove(p)), o)
    const ringPred = (p: Vec) => outerBand.has(p) && !inner.has(p) && !inAbove(p)
    const ring = combine([outerBand, inner], ringPred, above.flat().map((p) => p.x), above.flat().map((p) => p.y))
    const copingCells = combine([dilate(ring, 2)], (p) => dilate(ring, 2).has(p) && !inAbove(p), above.flat().map((p) => p.x), above.flat().map((p) => p.y))
    const slabTop = H + FLAT_T
    // 平屋面也给一份「上表面」三角形（测试 / 覆盖检查用）
    const tris = tessellate(slabArea.rects().map((b) => [[b.x0, b.y0, slabTop], [b.x1, b.y0, slabTop], [b.x1, b.y1, slabTop], [b.x0, b.y1, slabTop]] as P3[]))
    return { kind: 'flat', lower, rects, pitch: 0, tris, creases: [], walls: [], flat: { slab: slabArea.rects(), slabTop, parapet: ring.rects(), coping: copingCells.rects() } }
  }

  // 檐口范围 C
  let C: Cells
  if (!lower) C = dilate(R, oe)
  else {
    const D = dilate(R, oe)
    const strips = sharedStrips(oe + 2)
    C = combine([D], (p) => D.has(p) && !inAbove(p) && !strips.some((b) => inBox(p, b)), above.flat().map((p) => p.x).concat(strips.flatMap((b) => [b.x0, b.x1])), above.flat().map((p) => p.y).concat(strips.flatMap((b) => [b.y0, b.y1])))
  }
  if (C.empty) return null
  const zFace = H + 2

  // 墙补齐：本层外墙（下屋只取挨着 R 的外墙段）
  const wallLines = (): { a: Vec; b: Vec }[] => {
    const runs = boundaryRuns(R, (_mid, outside) => (pointInPolygon(outside, outline) ? 'in' : 'ext'))
    return runs
      .filter((r) => r.cls === 'ext')
      .map((r) => {
        const a0 = r.a0 - o
        const a1 = r.a1 + o
        return r.h ? { a: { x: a0, y: r.c }, b: { x: a1, y: r.c } } : { a: { x: r.c, y: a0 }, b: { x: r.c, y: a1 } }
      })
  }
  const fills = (tris: number[], pitch: number): WallFill[] => {
    const out: WallFill[] = []
    const margin = ROOF_T + 1 + pitch * o
    for (const { a, b } of wallLines()) {
      const prof = profileAlong(tris, a, b)
      for (let k = 0; k + 1 < prof.length; k++) {
        let [s0, z0] = prof[k]
        let [s1, z1] = prof[k + 1]
        z0 -= margin
        z1 -= margin
        if (s1 - s0 < 1e-7 || (z0 <= H + 0.5 && z1 <= H + 0.5)) continue
        // 跨过墙顶的一段：只留高出墙顶的部分
        if (z0 < H) {
          s0 = s0 + ((H - z0) / (z1 - z0)) * (s1 - s0)
          z0 = H
        } else if (z1 < H) {
          s1 = s0 + ((z0 - H) / (z0 - z1)) * (s1 - s0)
          z1 = H
        }
        const P = (s: number) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s })
        out.push({ a: P(s0), b: P(s1), za: z0, zb: z1 })
      }
    }
    return out
  }

  if (inp.kind === 'shed' && !lower) {
    // 片流れ：整个 C 一个平面，沿短边方向升高，高的一边朝北（y 大）或朝东（x 大）
    const w = C.xs[C.xs.length - 1] - C.xs[0]
    const d = C.ys[C.ys.length - 1] - C.ys[0]
    const alongY = w >= d
    const v0 = alongY ? C.ys[0] : C.xs[0]
    const span = alongY ? d : w
    const p = Math.min(inp.pitch, LEAN_MAX / Math.max(1, span))
    const zLow = zFace - p * e
    const z = (x: number, y: number) => zLow + p * ((alongY ? y : x) - v0)
    const tris = tessellate(C.rects().map((b) => [[b.x0, b.y0, z(b.x0, b.y0)], [b.x1, b.y0, z(b.x1, b.y0)], [b.x1, b.y1, z(b.x1, b.y1)], [b.x0, b.y1, z(b.x0, b.y1)]] as P3[]))
    return { kind: 'shed', lower, rects, pitch: p, tris, creases: [], walls: fills(tris, p) }
  }

  // 坡屋面：直骨架。边分三类：cut（贴上层 / 被上层切掉，不动）、gable（山墙端，不动）、eave（动）
  const strips = lower ? sharedStrips(oe + 2) : []
  const runs = boundaryRuns(C, (_mid, outside) => (inAbove(outside) || strips.some((b) => inBox(outside, b)) ? 'cut' : 'ext'))
  const ext = runs.filter((r) => r.cls === 'ext')
  const gableStyle = inp.kind === 'gable' || inp.kind === 'shed'
  let moving = gableStyle ? ext.filter((r) => !isGableEnd(C, r)) : ext
  if (!moving.length) moving = ext
  if (!moving.length) return null
  const faces = skeletonFaces(C, moving)
  let tmax = 0
  for (const f of faces) for (const v of f) tmax = Math.max(tmax, v[2])
  let p = inp.pitch
  if (lower && tmax > 0) {
    // 下屋：屋面最高处不超过 LEAN_MAX，也不挡上一层的窗（窗台离上层地面 ≥ 80）
    const roomTop = (inp.upperRise ?? H + 30) + 80
    const capByWin = (roomTop - zFace) / Math.max(1, tmax - e)
    p = Math.max(0.12, Math.min(p, LEAN_MAX / tmax, capByWin))
  }
  const zE = zFace - p * e
  const tris = tessellate(faces.map((f) => f.map(([x, y, t]) => [x, y, zE + p * t] as P3)))
  return { kind: inp.kind, lower, rects, pitch: p, tris, creases: creaseLines(tris), walls: fills(tris, p) }
}
