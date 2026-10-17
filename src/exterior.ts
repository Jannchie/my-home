// 户建的外观数据：屋顶怎么分块（纯几何，3D 搭建 three/exterior.ts 和测试共用）、用地 / 外观字段的读档校验。
//
// 屋顶：每一层露在外面（上面没有楼层盖着）的部分都要盖屋顶。
//   最上层整个外轮廓；部分二阶时下层露出来的那块（下屋）也要盖。
//   区域按外轮廓顶点切成网格，再拼成若干「极大矩形」（可以互相重叠：L 形轮廓 = 两块交叉的屋顶，像真的十字屋顶那样穿插）。
//   最上层用外观指定的屋顶形式；下层露出的部分贴着上层外墙时做单坡（高的一边靠墙），否则跟最上层一样。

import { floorOutline, floorView, planFloors } from './floors'
import { pointInPolygon, type Exterior, type FacadeKind, type FenceKind, type Plan, type RoofKind, type Site, type Vec } from './model'

export type Side = 'n' | 's' | 'w' | 'e'

export interface RoofRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface RoofPart {
  /** 盖在哪一层上（屋顶的组放进这一层，跟着它显示 / 隐藏 / 拉开） */
  floor: string
  /** 墙中心线围成的矩形（平面坐标） */
  rect: RoofRect
  kind: RoofKind
  /** 双坡 / 四坡的屋脊方向：沿长边 */
  ridge: 'x' | 'y'
  /** 单坡：高的一边 */
  high?: Side
  /** 单坡的高边贴着上层外墙（这一边不出檐） */
  against?: boolean
  /** 檐口（墙顶）高度：这一层的 elevation + 墙高（离 1F 地面） */
  base: number
  /** 墙顶在这一层局部坐标里的高度（= 墙高） */
  top: number
}

const cellsOf = (polys: Vec[][]) => {
  const xs = [...new Set(polys.flat().map((p) => Math.round(p.x)))].sort((a, b) => a - b)
  const ys = [...new Set(polys.flat().map((p) => Math.round(p.y)))].sort((a, b) => a - b)
  return { xs, ys }
}

/** 在网格里把 on(i, j) 为真的格子拼成极大矩形（去掉被别的包含的） */
function maximalRects(xs: number[], ys: number[], on: (i: number, j: number) => boolean): RoofRect[] {
  const nx = xs.length - 1
  const ny = ys.length - 1
  const full = (i0: number, j0: number, i1: number, j1: number) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!on(i, j)) return false
    return true
  }
  const found: [number, number, number, number][] = []
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!on(i, j)) continue
      // 从这个格子出发，先横向、后纵向长到最大；再先纵后横各来一次，两种都收
      for (const order of [0, 1]) {
        let [i0, j0, i1, j1] = [i, j, i, j]
        const grow = (dir: 'x' | 'y') => {
          if (dir === 'x') {
            while (i0 > 0 && full(i0 - 1, j0, i0 - 1, j1)) i0--
            while (i1 < nx - 1 && full(i1 + 1, j0, i1 + 1, j1)) i1++
          } else {
            while (j0 > 0 && full(i0, j0 - 1, i1, j0 - 1)) j0--
            while (j1 < ny - 1 && full(i0, j1 + 1, i1, j1 + 1)) j1++
          }
        }
        grow(order ? 'y' : 'x')
        grow(order ? 'x' : 'y')
        found.push([i0, j0, i1, j1])
      }
    }
  const uniq = [...new Map(found.map((r) => [r.join(','), r])).values()]
  const kept = uniq.filter((a) => !uniq.some((b) => b !== a && b[0] <= a[0] && b[1] <= a[1] && b[2] >= a[2] && b[3] >= a[3]))
  // 少而大的优先；去掉被其余矩形合起来完全覆盖的
  kept.sort((a, b) => (b[2] - b[0] + 1) * (b[3] - b[1] + 1) - (a[2] - a[0] + 1) * (a[3] - a[1] + 1))
  const out: typeof kept = []
  const covered = new Set<string>()
  for (const r of kept) {
    let adds = false
    for (let i = r[0]; i <= r[2]; i++) for (let j = r[1]; j <= r[3]; j++) if (!covered.has(`${i},${j}`)) adds = true
    if (!adds) continue
    out.push(r)
    for (let i = r[0]; i <= r[2]; i++) for (let j = r[1]; j <= r[3]; j++) covered.add(`${i},${j}`)
  }
  return out.map(([i0, j0, i1, j1]) => ({ x0: xs[i0], y0: ys[j0], x1: xs[i1 + 1], y1: ys[j1 + 1] }))
}

/** 户型的屋顶分块；没有外观设定（公寓）返回空 */
export function roofParts(plan: Plan): RoofPart[] {
  const ex = plan.exterior
  if (!ex) return []
  const fs = planFloors(plan)
  const outlines = fs.map((f) => floorOutline(floorView(plan, f.id).rooms))
  const out: RoofPart[] = []
  fs.forEach((f, k) => {
    const mine = outlines[k]
    if (!mine) return
    const above = outlines.slice(k + 1).filter((o): o is Vec[] => !!o)
    const { xs, ys } = cellsOf([mine, ...above])
    const mid = (i: number, j: number) => ({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 })
    const inAbove = (p: Vec) => above.some((o) => pointInPolygon(p, o))
    const on = (i: number, j: number) => {
      const p = mid(i, j)
      return pointInPolygon(p, mine) && !inAbove(p)
    }
    const rects = maximalRects(xs, ys, on)
    const top = k === fs.length - 1
    for (const rect of rects) {
      const w = rect.x1 - rect.x0
      const d = rect.y1 - rect.y0
      const ridge: 'x' | 'y' = w >= d ? 'x' : 'y'
      const part: RoofPart = { floor: f.id, rect, kind: ex.roof, ridge, base: f.elevation + f.height, top: f.height }
      if (!top && ex.roof !== 'flat') {
        // 下屋：哪一边贴着上层（那一边外侧一点点落在上层外轮廓里）
        const touch = (['n', 's', 'w', 'e'] as Side[]).filter((s) => {
          const probes = s === 'n' || s === 's' ? [0.25, 0.5, 0.75].map((t) => ({ x: rect.x0 + w * t, y: s === 'n' ? rect.y1 + 5 : rect.y0 - 5 })) : [0.25, 0.5, 0.75].map((t) => ({ x: s === 'e' ? rect.x1 + 5 : rect.x0 - 5, y: rect.y0 + d * t }))
          return probes.some(inAbove)
        })
        if (touch.length === 1) {
          part.kind = 'shed'
          part.high = touch[0]
          part.against = true
        } else if (part.kind === 'shed') part.kind = 'hip'
      } else if (part.kind === 'shed') {
        // 片流れ：高的一边朝北（y 大的一边），沿长边方向的话改成朝东西
        part.high = ridge === 'x' ? 'n' : 'e'
      }
      out.push(part)
    }
  })
  return out
}

/** 外轮廓的每个格子是否都被某块屋顶盖住（测试用） */
export function roofCovers(parts: RoofRect[], outline: Vec[]): boolean {
  const { xs, ys } = cellsOf([outline, ...parts.map((r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }])])
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const p = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      if (!pointInPolygon(p, outline)) continue
      if (!parts.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1)) return false
    }
  return true
}

// ---------- 读档校验 ----------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown): v is Vec => !!v && typeof v === 'object' && isNum((v as Vec).x) && isNum((v as Vec).y)
const isPoly = (v: unknown, min = 3): v is Vec[] => Array.isArray(v) && v.length >= min && v.every(isVec)
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)
const ROOFS: RoofKind[] = ['gable', 'hip', 'shed', 'flat']
const FACADES: FacadeKind[] = ['siding', 'stucco', 'brick']
const FENCES: FenceKind[] = ['hedge', 'fence', 'wall', 'none']

/** 用地 / 外观：坏数据整理掉（字段缺了补缺省，整体不像样就删） */
export function normalizeExterior(p: Plan) {
  const s = p.site as unknown as Record<string, unknown> | undefined
  if (s !== undefined) {
    if (!s || typeof s !== 'object' || !isPoly(s.points)) delete p.site
    else {
      const site: Site = {
        points: s.points as Vec[],
        fence: FENCES.includes(s.fence as FenceKind) ? (s.fence as FenceKind) : 'none',
        gates: Array.isArray(s.gates) ? (s.gates as unknown[]).filter((g): g is [Vec, Vec] => isPoly(g, 2) && (g as Vec[]).length === 2) : [],
        paths: Array.isArray(s.paths) ? (s.paths as unknown[]).filter((x): x is Vec[] => isPoly(x)) : [],
        parking: Array.isArray(s.parking)
          ? (s.parking as unknown[]).flatMap((x) => {
              const o = x as Record<string, unknown>
              if (!o || !isPoly(o.points)) return []
              return [{ points: o.points as Vec[], rot: isNum(o.rot) ? o.rot : 0, ...(o.car ? { car: true } : {}), ...(isColor(o.carColor) ? { carColor: o.carColor } : {}) }]
            })
          : [],
      }
      p.site = site
    }
  }
  const e = p.exterior as unknown as Record<string, unknown> | undefined
  if (e !== undefined) {
    if (!e || typeof e !== 'object' || !ROOFS.includes(e.roof as RoofKind)) delete p.exterior
    else {
      const ex: Exterior = {
        roof: e.roof as RoofKind,
        roofColor: isColor(e.roofColor) ? e.roofColor : '#4f5866',
        facade: FACADES.includes(e.facade as FacadeKind) ? (e.facade as FacadeKind) : 'stucco',
        wallColor: isColor(e.wallColor) ? e.wallColor : '#f2ede3',
        trimColor: isColor(e.trimColor) ? e.trimColor : '#ffffff',
      }
      if (isNum(e.pitch)) ex.pitch = Math.min(1.2, Math.max(0.1, e.pitch))
      if (isNum(e.eave)) ex.eave = Math.min(120, Math.max(0, e.eave))
      if (e.porch === 'canopy' || e.porch === 'porch' || e.porch === 'none') ex.porch = e.porch
      p.exterior = ex
    }
  }
}
