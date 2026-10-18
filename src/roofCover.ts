// 屋面材料（纯函数：3D 搭建 three/roofCover.ts 和测试共用，不依赖 three）。
//
// 屋面材料是贴在屋面上的一层「瓦面」：
//   - 每个坡面按自己的坡向取 UV：u 沿檐口方向（水平、垂直于流水方向），v 沿流水线往上量的斜长（从檐口算起）。
//     同一屋顶的坡面坡度相同，v 按高度换算，所以相邻坡面（斜脊两侧）的瓦行在同一高度对齐，檐口第一行是整块。
//   - 和瓦 / 西班牙瓦 / 金属板沿 u 有起伏的截面（profile）：屋面三角形按截面的折点切成竖条，每条按截面高度竖直抬起，
//     法线按截面斜率算（瓦片是圆的、金属板的立边是硬的）。行与行之间的搭接、颜色深浅交给贴图。
//   - 瓦面的外缘（檐口、山墙边）竖着补一圈「瓦头」，从屋面到瓦面，檐口看得到一排波浪形的瓦头。
//   - 平屋顶（防水卷材 / 碎石 / 屋顶绿化）按平面坐标取 UV，没有起伏。

import type { Exterior, Region, RoofCover, RoofKind } from './model'

export const PITCHED_COVERS: RoofCover[] = ['kawara', 'spanish', 'cement', 'shingle', 'slate', 'metal']
export const FLAT_COVERS: RoofCover[] = ['membrane', 'gravel', 'green']

/** 这种材料能不能铺在这种屋顶上（对不上就按素面搭） */
export const coverFits = (cover: RoofCover, roof: RoofKind) => (roof === 'flat' ? FLAT_COVERS : PITCHED_COVERS).includes(cover)

/** 实际铺的材料：没写、或和屋顶形式对不上 → null（素面） */
export function activeCover(ex: Pick<Exterior, 'roof' | 'roofCover'>): RoofCover | null {
  const c = ex.roofCover
  return c && coverFits(c, ex.roof) ? c : null
}

/**
 * 新生成的户建按地区挑屋面材料（h ∈ [0, 1) 是不消耗布局随机序列的哈希）：
 *   日式：双坡 / 四坡 和瓦 35%、彩色石板瓦 65%（新建住宅最常见的コロニアル）；单坡 金属板（ガルバリウム）。
 *   欧美：坡屋顶 沥青瓦 75%、石板瓦 25%；平屋顶 防水卷材。
 *   中式：坡屋顶 平板瓦 50%、西班牙瓦 35%、和瓦（小青瓦的样子）15%；平屋顶 碎石 / 绿化 / 卷材。
 */
export function defaultRoofCover(region: Region, roof: RoofKind, h: number): RoofCover {
  if (roof === 'flat') {
    if (region === 'cn') return h < 0.4 ? 'gravel' : h < 0.7 ? 'green' : 'membrane'
    return h < 0.7 ? 'membrane' : 'gravel'
  }
  if (region === 'jp') return roof === 'shed' ? 'metal' : h < 0.35 ? 'kawara' : 'slate'
  if (region === 'west') return roof === 'shed' ? 'metal' : h < 0.75 ? 'shingle' : 'slate'
  return h < 0.5 ? 'cement' : h < 0.85 ? 'spanish' : 'kawara'
}

// ---------- 各材料的尺寸、截面 ----------

export interface CoverSpec {
  /** 贴图一张对应的实际尺寸（cm）：w 沿檐口，h 沿流水线（平屋顶：平面 x / y） */
  texW: number
  texH: number
  /** 瓦面整体抬起（cm，截面最低处离屋面） */
  lift: number
  /** 截面：一个周期 period（cm，沿 u）里的折线 [t ∈ 0..1, 高度 cm]，首尾同高；没有就是平的 */
  profile?: { period: number; pts: [number, number][]; smooth: boolean }
}

/** 一块 J 形桟瓦：宽的凹槽 + 窄的圆筒，圆筒顶在 t = 0（贴图上瓦的接缝也在这里） */
const KAWARA: [number, number][] = [
  [0, 3.6],
  [0.1, 3],
  [0.22, 1],
  [0.45, 0],
  [0.68, 0.8],
  [0.86, 2.9],
  [1, 3.6],
]
/** S 形陶瓦：深的槽 + 高的圆筒（圆筒占 40%） */
const SPANISH: [number, number][] = [
  [0, 6],
  [0.09, 5.4],
  [0.2, 2.6],
  [0.32, 0.4],
  [0.5, 0],
  [0.63, 0.8],
  [0.74, 3.6],
  [0.88, 5.7],
  [1, 6],
]
/** 立边咬合金属板：45cm 一道 3cm 高的立边 */
const METAL: [number, number][] = [
  [0, 0],
  [0.92, 0],
  [0.935, 3],
  [0.975, 3],
  [0.99, 0],
  [1, 0],
]

export const COVER_SPECS: Record<RoofCover, CoverSpec> = {
  kawara: { texW: 28 * 4, texH: 23.5 * 8, lift: 0.6, profile: { period: 28, pts: KAWARA, smooth: true } },
  spanish: { texW: 30 * 4, texH: 30 * 6, lift: 0.6, profile: { period: 30, pts: SPANISH, smooth: true } },
  cement: { texW: 30 * 4, texH: 28 * 6, lift: 1.8 },
  shingle: { texW: 200, texH: 14 * 12, lift: 0.9 },
  slate: { texW: 45 * 4, texH: 18 * 8, lift: 1.1 },
  metal: { texW: 45 * 4, texH: 240, lift: 0.4, profile: { period: 45, pts: METAL, smooth: false } },
  membrane: { texW: 200, texH: 400, lift: 0.4 },
  gravel: { texW: 120, texH: 120, lift: 1.5 },
  green: { texW: 160, texH: 160, lift: 3 },
}

/** 瓦面最高处离屋面多高（屋脊压条、天沟线要放在它上面） */
export function coverHeight(cover: RoofCover): number {
  const s = COVER_SPECS[cover]
  return s.lift + (s.profile ? Math.max(...s.profile.pts.map((p) => p[1])) : 0)
}

// ---------- 瓦面网格 ----------

export interface CoverSheet {
  /** 瓦面：三角形平铺（平面 x, y, 高度 z），法线、UV（贴图张数为单位） */
  pos: number[]
  nrm: number[]
  uv: number[]
  /** 瓦头：外缘一圈竖面（同样的格式，UV 不用） */
  edgePos: number[]
  edgeNrm: number[]
}

type V3 = [number, number, number]

/** 一个坡面三角形的坡向：法线、檐口方向 U（平面里的单位向量）、sin(坡角)；平的返回 null */
export function slopeFrame(a: V3, b: V3, c: V3) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  if (nz < 0) {
    nx = -nx
    ny = -ny
    nz = -nz
  }
  const L = Math.hypot(nx, ny, nz)
  if (L < 1e-9) return null
  const hz = Math.hypot(nx, ny)
  const n: V3 = [nx / L, ny / L, nz / L]
  if (hz / L < 1e-3) return { n, flat: true as const }
  // 法线的水平分量指向下坡；U = 下坡方向转 90°（所有坡面同一个手性，非对称的截面不会左右颠倒）
  const d = { x: nx / hz, y: ny / hz }
  return { n, flat: false as const, down: d, U: { x: -d.y, y: d.x }, sin: hz / L, cos: nz / L }
}

/** 截面在 u 处的高度和斜率（dh/du） */
function profileAt(pr: NonNullable<CoverSpec['profile']>, u: number): { h: number; k: number } {
  const t = ((u / pr.period) % 1 + 1) % 1
  const P = pr.pts
  for (let i = 0; i + 1 < P.length; i++) {
    const [t0, h0] = P[i]
    const [t1, h1] = P[i + 1]
    if (t <= t1 || i + 2 === P.length) {
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0
      const k = (h1 - h0) / ((t1 - t0) * pr.period)
      return { h: h0 + (h1 - h0) * f, k }
    }
  }
  return { h: P[0][1], k: 0 }
}

/** 平滑截面在折点 i 处的斜率（两侧线段斜率的平均；首尾按周期接上） */
function knotSlope(pr: NonNullable<CoverSpec['profile']>, i: number) {
  const P = pr.pts
  const n = P.length - 1
  const seg = (j: number) => {
    const jj = ((j % n) + n) % n
    return (P[jj + 1][1] - P[jj][1]) / ((P[jj + 1][0] - P[jj][0]) * pr.period)
  }
  const ii = i === n ? 0 : i
  return (seg(ii - 1) + seg(ii)) / 2
}

/** 凸多边形在 u ∈ [lo, hi] 的部分（u 由 f 给出） */
function clipSlab(poly: V3[], f: (p: V3) => number, lo: number, hi: number): V3[] {
  const cut = (P: V3[], keep: (u: number) => number) => {
    const out: V3[] = []
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      const da = keep(f(a))
      const db = keep(f(b))
      if (da >= 0) out.push(a)
      if ((da >= 0) !== (db >= 0)) {
        const s = da / (da - db)
        out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s])
      }
    }
    return out
  }
  return cut(cut(poly, (u) => u - lo), (u) => hi - u)
}

/**
 * 屋面三角形（roof.ts 的 tris：平面 x, y, 高度）→ 瓦面。zRef 是檐口高度（瓦行从这里起算）。
 * 平的三角形（平屋顶）按平面坐标取 UV，不起伏。
 */
export function coverSheet(tris: number[], cover: RoofCover, zRef: number): CoverSheet {
  const spec = COVER_SPECS[cover]
  const pr = spec.profile
  const out: CoverSheet = { pos: [], nrm: [], uv: [], edgePos: [], edgeNrm: [] }
  const V = (k: number): V3 => [tris[k], tris[k + 1], tris[k + 2]]
  // 外缘边：只属于一个三角形的边
  const key = (p: V3) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`
  const edgeCount = new Map<string, number>()
  const ek = (p: V3, q: V3) => {
    const a = key(p)
    const b = key(q)
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }
  for (let k = 0; k < tris.length; k += 9) {
    const T = [V(k), V(k + 3), V(k + 6)]
    for (let m = 0; m < 3; m++) {
      const e = ek(T[m], T[(m + 1) % 3])
      edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1)
    }
  }
  for (const { poly: T, fr } of convexFaces(tris)) {
    if (fr.flat) {
      for (let i = 1; i + 1 < T.length; i++)
        for (const p of [T[0], T[i], T[i + 1]]) {
          out.pos.push(p[0], p[1], p[2] + spec.lift)
          out.nrm.push(0, 0, 1)
          out.uv.push(p[0] / spec.texW, -p[1] / spec.texH)
        }
      for (let m = 0; m < T.length; m++) {
        const a = T[m]
        const b = T[(m + 1) % T.length]
        if (edgeCount.get(ek(a, b)) !== 1) continue
        quadEdge(out, a, b, spec.lift, spec.lift)
      }
      continue
    }
    const { U, sin, cos } = fr
    const uOf = (p: V3) => p[0] * U.x + p[1] * U.y
    const vOf = (p: V3) => (p[2] - zRef) / sin
    const gx = -fr.n[0] / fr.n[2]
    const gy = -fr.n[1] / fr.n[2]
    /** 瓦面在 p 处抬起多少（竖直）和法线 */
    const lift = (p: V3, kOverride?: number): { dz: number; n: V3 } => {
      if (!pr) return { dz: spec.lift / cos, n: fr.n }
      const { h, k } = profileAt(pr, uOf(p))
      const kk = kOverride ?? k
      const c = 1 / cos
      // 高度场 z = 屋面 + c·h(u)：梯度 = 屋面梯度 + c·h'(u)·U
      const ex = gx + c * kk * U.x
      const ey = gy + c * kk * U.y
      const L = Math.hypot(ex, ey, 1)
      return { dz: (spec.lift + h) * c, n: [-ex / L, -ey / L, 1 / L] }
    }
    const emit = (P: V3[], kAt?: (p: V3) => number) => {
      if (P.length < 3) return
      const L = P.map((p) => lift(p, kAt?.(p)))
      for (let i = 1; i + 1 < P.length; i++)
        for (const j of [0, i, i + 1]) {
          const p = P[j]
          out.pos.push(p[0], p[1], p[2] + L[j].dz)
          out.nrm.push(...L[j].n)
          out.uv.push(uOf(p) / spec.texW, vOf(p) / spec.texH)
        }
    }
    if (!pr) emit(T)
    else {
      // 按截面折点切成竖条（条内高度是 u 的线性函数，抬起后仍是平面）
      const us = T.map(uOf)
      const u0 = Math.min(...us)
      const u1 = Math.max(...us)
      const breaks: number[] = []
      for (let n = Math.floor(u0 / pr.period) - 1; n * pr.period <= u1; n++)
        for (let i = 0; i + 1 < pr.pts.length; i++) {
          const u = (n + pr.pts[i][0]) * pr.period
          if (u > u0 + 1e-6 && u < u1 - 1e-6) breaks.push(u)
        }
      breaks.sort((a, b) => a - b)
      const cuts = [u0, ...breaks, u1]
      for (let i = 0; i + 1 < cuts.length; i++) {
        const lo = cuts[i]
        const hi = cuts[i + 1]
        if (hi - lo < 1e-6) continue
        const P = clipSlab(T, uOf, lo, hi)
        if (!pr.smooth) emit(P)
        else {
          // 平滑：条两边的折点取平均斜率，条内线性插值
          const kLo = smoothSlopeAt(pr, lo)
          const kHi = smoothSlopeAt(pr, hi)
          emit(P, (p) => {
            const f = (uOf(p) - lo) / (hi - lo)
            return kLo + (kHi - kLo) * Math.min(1, Math.max(0, f))
          })
        }
      }
    }
    // 外缘：瓦头（按截面折点分段，和瓦面的条对齐）
    for (let m = 0; m < T.length; m++) {
      const a = T[m]
      const b = T[(m + 1) % T.length]
      if (edgeCount.get(ek(a, b)) !== 1) continue
      const ua = uOf(a)
      const ub = uOf(b)
      const ss = [0, 1]
      if (pr && Math.abs(ub - ua) > 1e-6) {
        const [lo, hi] = ua < ub ? [ua, ub] : [ub, ua]
        for (let n = Math.floor(lo / pr.period) - 1; n * pr.period <= hi; n++)
          for (let i = 0; i + 1 < pr.pts.length; i++) {
            const u = (n + pr.pts[i][0]) * pr.period
            if (u > lo + 1e-6 && u < hi - 1e-6) ss.push((u - ua) / (ub - ua))
          }
        ss.sort((x, y) => x - y)
      }
      for (let i = 0; i + 1 < ss.length; i++) {
        const p = lerp3(a, b, ss[i])
        const q = lerp3(a, b, ss[i + 1])
        quadEdge(out, p, q, lift(p).dz, lift(q).dz)
      }
    }
  }
  return out
}

type Frame = NonNullable<ReturnType<typeof slopeFrame>>

/**
 * 屋面三角形按所在平面分组，同一平面里相邻的三角形贪心并成凸多边形（逆时针）。
 * 切竖条按多边形切：tessellate 为消 T 形接缝做的扇形三角化会把一个坡面拆成十几个细长三角形，逐个切条面数会翻好几倍。
 */
function convexFaces(tris: number[]): { poly: V3[]; fr: Frame }[] {
  const key = (p: V3) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`
  const groups = new Map<string, { polys: V3[][]; fr: Frame }>()
  for (let k = 0; k < tris.length; k += 9) {
    const T: V3[] = [
      [tris[k], tris[k + 1], tris[k + 2]],
      [tris[k + 3], tris[k + 4], tris[k + 5]],
      [tris[k + 6], tris[k + 7], tris[k + 8]],
    ]
    const fr = slopeFrame(T[0], T[1], T[2])
    if (!fr) continue
    const area = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[2][0] - T[0][0]) * (T[1][1] - T[0][1])
    if (Math.abs(area) < 1e-6) continue
    if (area < 0) T.reverse()
    const d = fr.n[0] * T[0][0] + fr.n[1] * T[0][1] + fr.n[2] * T[0][2]
    const gk = `${fr.n.map((v) => v.toFixed(3)).join(',')}|${d.toFixed(1)}`
    let g = groups.get(gk)
    if (!g) groups.set(gk, (g = { polys: [], fr }))
    g.polys.push(T)
  }
  const convex = (P: V3[]) => {
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      const c = P[(i + 2) % P.length]
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      if (cr < -1e-6 * (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) + 1e-9)) return false
    }
    return true
  }
  const out: { poly: V3[]; fr: Frame }[] = []
  for (const { polys, fr } of groups.values()) {
    let merged = true
    while (merged) {
      merged = false
      outer: for (let i = 0; i < polys.length; i++)
        for (let j = i + 1; j < polys.length; j++) {
          const A = polys[i]
          const B = polys[j]
          for (let a = 0; a < A.length; a++) {
            const ka = key(A[a])
            const kb = key(A[(a + 1) % A.length])
            for (let b = 0; b < B.length; b++) {
              if (key(B[b]) !== kb || key(B[(b + 1) % B.length]) !== ka) continue
              // A 从 a+1 绕一圈到 a，接着 B 从 b+2 到 b-1
              const P: V3[] = []
              for (let t = 1; t <= A.length; t++) P.push(A[(a + t) % A.length])
              for (let t = 2; t < B.length; t++) P.push(B[(b + t) % B.length])
              if (!convex(P)) continue
              polys[i] = P
              polys.splice(j, 1)
              merged = true
              break outer
            }
          }
        }
    }
    for (const poly of polys) out.push({ poly, fr })
  }
  return out
}

/** 平滑截面在 u 处（应是折点或条的端点）的斜率：正好落在折点上取平均，否则取所在线段的斜率 */
function smoothSlopeAt(pr: NonNullable<CoverSpec['profile']>, u: number) {
  const t = ((u / pr.period) % 1 + 1) % 1
  for (let i = 0; i < pr.pts.length; i++) {
    const d = Math.abs(t - pr.pts[i][0])
    if (d < 1e-6 || (i === 0 && Math.abs(t - 1) < 1e-6)) return knotSlope(pr, i)
  }
  return profileAt(pr, u).k
}

const lerp3 = (a: V3, b: V3, s: number): V3 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]

/** 外缘 a→b（三角形逆时针，外侧在右手边）上从屋面竖到瓦面的一条 */
function quadEdge(out: CoverSheet, a: V3, b: V3, da: number, db: number) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 1e-6) return
  // 逆时针多边形的外法线 = 边方向顺时针转 90°
  const n: V3 = [dy / L, -dx / L, 0]
  const a1: V3 = [a[0], a[1], a[2] + da]
  const b1: V3 = [b[0], b[1], b[2] + db]
  for (const p of [a, b, b1, a, b1, a1]) {
    out.edgePos.push(p[0], p[1], p[2])
    out.edgeNrm.push(...n)
  }
}
