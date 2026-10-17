// 鞋子 / 鞋柜鞋架 / 收纳箱收纳柜 / 纸箱 素材包。约定见 kit.ts 开头。
//
// 约定补充：
//   - id 统一用 sb- 前缀，family 也用 sb- 前缀，避免和其他素材包撞名。
//   - 鞋子：一双两只并排（右脚在 +x），鞋尖朝 +z。鞋面是有壁厚的空心壳（shoeLast），鞋口里能看到鞋垫。
//     规格：成人男款 ≈ 29 × 10.6、成人女款 ≈ 24.5 × 9、儿童 ≈ 18 × 7、幼儿 ≈ 14 × 6。
//   - 鞋柜 / 鞋架：层板空着，surfaces 的 y = 层板顶面，h = 到上一块板底的净高，shape 扣掉侧板和背板。
//   - 收纳箱、纸箱都是 prop，可以放进柜子 / 床底 / 层板上；大件收纳柜不是 prop。

import * as THREE from 'three'
import { ball, capsule, cyl, puck, rbox, shade, toon, torus } from '../toon'
import { C, S, SWING_OPEN, holePanel, movable, paintPanel, rectPoly, rng, shell, slab, type AssetCategory, type AssetDef, type Poly, type StyleTag } from '../kit'

const PI = Math.PI
type V3 = [number, number, number]
type Pal = [StyleTag, string[]]
type Dims = [number, number, number]
type Build = (p: string[]) => THREE.Group
type Tab = [number, number][]

const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro

const WHITE = '#ffffff'
const INSOLE = '#efe4d0'
const INSOLE_LEATHER = '#c9a07a'
const RUBBER = '#f3efe6'
const KRAFT = '#c99a62'
const TAPE = '#d9b27c'

// ---------- 定义 ----------

function asset(id: string, name: string, category: AssetCategory, [w, d, h]: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}

// ---------- 小工具 ----------

function P<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}

const G = (...c: THREE.Object3D[]) => {
  const g = new THREE.Group()
  for (const o of c) g.add(o)
  return g
}

/** 沿 x 的横圆柱，给中心 */
const cylX = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) => P(cyl(r, r, len, color, {}, seg), x, y, z, 0, 0, PI / 2)

const UP = new THREE.Vector3(0, 1, 0)
/** 两点之间的细杆 */
function stick(a: V3, b: V3, r: number, color: string, seg = 8) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = cyl(r, r, dir.length(), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return m
}

/** 平滑管子（鞋口包边、鞋带、提手），开放的两端加圆头 */
function tube(pts: V3[], r: number, color: string, closed = false, seg?: number) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
    'centripetal',
  )
  const geo = new THREE.TubeGeometry(curve, seg ?? Math.max(16, pts.length * 4), r, 8, closed)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  if (closed) return m
  const a = pts[0]
  const b = pts[pts.length - 1]
  return G(m, ball(r, color, { x: a[0], y: a[1], z: a[2] }), ball(r, color, { x: b[0], y: b[1], z: b[2] }))
}

/** 半透明：整组换成透明材质（不描边） */
function clear<T extends THREE.Object3D>(o: T, color: string, a = 0.4): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = toon(color, { transparent: a })
  })
  return o
}

/** 竖直的异形板：poly 是 [z, y] 轮廓，板厚 t 沿 x，放在 x0..x0+t */
function sidePlate(poly: [number, number][], t: number, color: string, x0: number) {
  return P(slab(poly.map(([zz, yy]): [number, number] => [yy, zz]), t, color), x0 + t, 0, 0, 0, 0, PI / 2)
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function tab(t: Tab, u: number) {
  if (u <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (u <= t[i][0]) {
      const [u0, v0] = t[i - 1]
      const [u1, v1] = t[i]
      return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1)
    }
  }
  return t[t.length - 1][1]
}
const scaleTab = (t: Tab, k: number): Tab => t.map(([u, v]) => [u, v * k])
/** [u0, u1] 之间两端加密的采样 */
function spaced(u0: number, u1: number, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => u0 + ((u1 - u0) * (1 - Math.cos((PI * i) / n))) / 2)
}

function meshOf(pos: number[], idx: number[], color: string) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ======================================================================
// 鞋楦：鞋底 / 鞋垫 / 空心鞋面
// ======================================================================

/** 脚型：相对半宽，后跟窄、前掌最宽 */
const FOOT_W: Tab = [
  [0, 0.68],
  [0.25, 0.72],
  [0.45, 0.8],
  [0.7, 1],
  [0.86, 0.96],
  [1, 0.82],
]
const SLIM_W: Tab = [
  [0, 0.66],
  [0.3, 0.7],
  [0.7, 0.96],
  [0.88, 0.8],
  [1, 0.6],
]
const K = 0.55 // 鞋面截面：y = b · sin(φ)^K，鞋帮接近竖直

interface LastSpec {
  L: number
  W: number
  /** 鞋底厚 */
  soleT: number
  /** 鞋底底面高度（高跟、鞋头上翘） */
  base?: Tab
  widthT?: Tab
  toeP?: number
  heelP?: number
  /** 左右对称（木屐、草履） */
  sym?: boolean
  /** 鞋面闭合部分（鞋头、鞋背）中线高度 */
  dome: Tab
  /** 鞋口部分的鞋帮高度 */
  collar?: Tab
  /** 鞋面从 u0 到 u1；u < uOpen 是鞋口 */
  u0?: number
  u1?: number
  uOpen?: number
  /** 鞋口处鞋帮向内收的程度（截面拱高 / 鞋帮高） */
  wrap?: number
  /** 鞋面壁厚 */
  t?: number
}

interface Slice {
  u: number
  open: boolean
  b: number
  phiMax: number
}

/** 一只鞋（右脚）的鞋楦：u ∈ [0, 1] 从后跟到鞋尖，φ ∈ [0, π] 从外侧（+x）绕过鞋背到内侧（-x） */
function shoeLast(s: LastSpec) {
  const heelP = s.heelP ?? 4
  const toeP = s.toeP ?? 3
  const widthT = s.widthT ?? FOOT_W
  const u0 = s.u0 ?? 0.004
  const u1 = s.u1 ?? 0.996
  const uOpen = s.uOpen ?? u0
  const wrap = s.wrap ?? 1.25
  const t = s.t ?? 0.4
  const end = (u: number) => (u < 0.5 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - 2 * u, heelP))) : Math.sqrt(Math.max(0, 1 - Math.pow(2 * u - 1, toeP))))
  const a = (u: number) => (s.W / 2) * tab(widthT, u) * end(u)
  const cx = (u: number) => (s.sym ? 0 : -s.W * 0.07 * sstep(0.5, 1, u))
  const z = (u: number) => -s.L / 2 + u * s.L
  const base = (u: number) => (s.base ? tab(s.base, u) : 0)
  const top0 = (u: number) => base(u) + s.soleT
  const hc = (u: number) => (s.collar ? tab(s.collar, u) : 0)
  const isOpen = (u: number) => u < uOpen - 1e-6
  const bAt = (u: number) => (u <= uOpen + 1e-6 ? Math.max(tab(s.dome, u), hc(u) * wrap) : tab(s.dome, u))
  const phiMaxAt = (u: number) => (isOpen(u) ? Math.asin(Math.min(1, Math.pow(1 / wrap, 1 / K))) : PI / 2)

  /** 鞋面上的点（off 为往外的偏移） */
  const at = (u: number, phi: number, off = 0): V3 => {
    const b = bAt(u)
    return [cx(u) + (a(u) + off) * Math.cos(phi), top0(u) - 0.15 + (b + off) * Math.pow(Math.max(0, Math.sin(phi)), K), z(u)]
  }
  /** 鞋帮在高度 y（离鞋底顶面）处的外侧点；side = 1 外侧（+x），-1 内侧 */
  const wall = (u: number, y: number, side: number, off = 0): V3 => {
    const b = bAt(u)
    const phi = Math.asin(Math.min(1, Math.pow(clamp(y / b, 0, 1), 1 / K)))
    return at(u, side > 0 ? phi : PI - phi, off)
  }
  /** 中线顶面高度 */
  const topY = (u: number) => top0(u) - 0.15 + bAt(u)

  /** 沿轮廓的厚片：鞋底、鞋垫、鞋跟、中底色带 */
  function loftSlab(color: string, o: { u0?: number; u1?: number; bot: (u: number) => number; top: (u: number) => number; inflate?: number; scale?: number; n?: number }) {
    const us = spaced(o.u0 ?? 0, o.u1 ?? 1, o.n ?? 36)
    const inf = o.inflate ?? 0
    const sc = o.scale ?? 1
    const pos: number[] = []
    const idx: number[] = []
    for (const u of us) {
      const hw = a(u) * sc + inf
      const c = cx(u)
      const yb = o.bot(u)
      const yt = o.top(u)
      const zz = z(u)
      pos.push(c + hw, yb, zz, c + hw, yt, zz, c - hw, yt, zz, c - hw, yb, zz)
    }
    for (let i = 0; i < us.length - 1; i++)
      for (let k = 0; k < 4; k++) {
        const a0 = i * 4 + k
        const a1 = i * 4 + ((k + 1) % 4)
        const b0 = a0 + 4
        const b1 = a1 + 4
        idx.push(a0, a1, b1, a0, b1, b0)
      }
    const l = (us.length - 1) * 4
    idx.push(0, 2, 1, 0, 3, 2, l, l + 1, l + 2, l, l + 2, l + 3)
    return meshOf(pos, idx, color)
  }

  const sole = (color: string, inflate = 0.3) => loftSlab(color, { bot: base, top: top0, inflate })
  const insole = (color = INSOLE) => loftSlab(color, { bot: (u) => top0(u) - 0.1, top: (u) => top0(u) + 0.3, scale: 0.86 })

  /** 鞋面切片 */
  function slices(from: number, to: number): Slice[] {
    const list = spaced(from, to, 30)
    if (uOpen > from + 0.01 && uOpen < to - 0.01) {
      list.push(uOpen)
      list.sort((x, y) => x - y)
    }
    return list.map((u) => ({ u, open: isOpen(u), b: bAt(u), phiMax: phiMaxAt(u) }))
  }

  /** 空心鞋面：外壁 + 内壁（往里偏 t）+ 所有开口边的封边 */
  function upper(color: string, o: { from?: number; to?: number; off?: number; t?: number } = {}) {
    const sl = slices(o.from ?? u0, o.to ?? u1)
    const off = o.off ?? 0
    const th = o.t ?? t
    const Mh = 8
    const Cn = 2 * Mh + 2
    const pos: number[] = []
    for (const s0 of sl) {
      for (let c = 0; c < Cn; c++) {
        const phi = c <= Mh ? (s0.phiMax * c) / Mh : PI - (s0.phiMax * (2 * Mh + 1 - c)) / Mh
        pos.push(...at(s0.u, phi, off))
      }
    }
    const S0 = sl.length
    const quads: number[][] = []
    for (let i = 0; i < S0 - 1; i++)
      for (let c = 0; c < Cn - 1; c++) {
        if (c === Mh && (sl[i].open || sl[i + 1].open)) continue
        quads.push([i * Cn + c, i * Cn + c + 1, (i + 1) * Cn + c + 1, (i + 1) * Cn + c])
      }
    // 外壁法线
    const tmp = new THREE.BufferGeometry()
    tmp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    tmp.setIndex(quads.flatMap(([q0, q1, q2, q3]) => [q0, q1, q2, q0, q2, q3]))
    tmp.computeVertexNormals()
    const nrm = tmp.getAttribute('normal')
    const nv = pos.length / 3
    const all = pos.slice()
    for (let v = 0; v < nv; v++) {
      const nx = nrm.getX(v)
      const ny = nrm.getY(v)
      const nz = nrm.getZ(v)
      all.push(pos[v * 3] - nx * th, pos[v * 3 + 1] - ny * th, pos[v * 3 + 2] - nz * th)
    }
    tmp.dispose()
    const idx: number[] = []
    const edges = new Map<string, [number, number] | null>()
    for (const q of quads) {
      idx.push(q[0], q[1], q[2], q[0], q[2], q[3])
      idx.push(q[0] + nv, q[2] + nv, q[1] + nv, q[0] + nv, q[3] + nv, q[2] + nv)
      for (let k = 0; k < 4; k++) {
        const e0 = q[k]
        const e1 = q[(k + 1) % 4]
        const key = e0 < e1 ? `${e0}-${e1}` : `${e1}-${e0}`
        edges.set(key, edges.has(key) ? null : [e0, e1])
      }
    }
    for (const e of edges.values()) {
      if (!e) continue
      const [ea, eb] = e
      idx.push(ea, ea + nv, eb + nv, ea, eb + nv, eb)
    }
    // 封住闭合的端面（鞋尖、封闭的后跟）：端面截面是一道窄而高的拱，不封的话鞋头正中会露出一条竖缝、看见里面的鞋垫
    for (const i of [0, S0 - 1]) {
      if (sl[i].open) continue
      const p0 = at(sl[i].u, 0, off)
      const p1 = at(sl[i].u, PI, off)
      // 端面单独一套顶点（法线不和鞋面混），鞋尖朝 +z、后跟朝 -z
      const ci = all.length / 3
      all.push((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
      for (let c = 0; c < Cn; c++) all.push(pos[(i * Cn + c) * 3], pos[(i * Cn + c) * 3 + 1], pos[(i * Cn + c) * 3 + 2])
      for (let c = 0; c < Cn - 1; c++) {
        if (i > 0) idx.push(ci, ci + 1 + c, ci + 2 + c)
        else idx.push(ci, ci + 2 + c, ci + 1 + c)
      }
    }
    return meshOf(all, idx, color)
  }

  /** 鞋口包边：沿鞋口一圈的管子 */
  function collarRim(color: string, r: number) {
    const sl = slices(u0, u1)
    const open = sl.filter((x) => x.open)
    if (!open.length) return new THREE.Group()
    const pts: V3[] = []
    for (let i = open.length - 1; i >= 0; i--) pts.push(at(open[i].u, open[i].phiMax))
    for (let i = 0; i < open.length; i++) pts.push(at(open[i].u, PI - open[i].phiMax))
    pts.push(at(uOpen, PI / 2))
    return tube(pts, r, color, true, 80)
  }

  /** 横跨鞋面的拱形（包边、鞋头接缝） */
  function archTube(u: number, r: number, color: string, off = 0, p0 = 0, p1 = PI) {
    const pts: V3[] = []
    for (let i = 0; i <= 12; i++) pts.push(at(u, p0 + ((p1 - p0) * i) / 12, off))
    return tube(pts, r, color)
  }

  /** 横跨鞋面的带子（魔术贴、凉鞋带）：宽 wz、厚 th，贴在 b 拱上 */
  function strap(u: number, wz: number, color: string, o: { b?: number; th?: number; off?: number } = {}) {
    const th = o.th ?? 0.35
    const off = o.off ?? 0.05
    const n = 14
    const pos: number[] = []
    const ring = (phi: number, zz: number, d: number): V3 => {
      const b = (o.b ?? bAt(u)) + off + d
      const hw = a(u) + off + d
      return [cx(u) + hw * Math.cos(phi), top0(u) - 0.15 + b * Math.pow(Math.max(0, Math.sin(phi)), K), zz]
    }
    for (let i = 0; i <= n; i++) {
      const phi = (PI * i) / n
      pos.push(...ring(phi, z(u) - wz / 2, th), ...ring(phi, z(u) + wz / 2, th), ...ring(phi, z(u) + wz / 2, 0), ...ring(phi, z(u) - wz / 2, 0))
    }
    const idx: number[] = []
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 4; k++) {
        const a0 = i * 4 + k
        const a1 = i * 4 + ((k + 1) % 4)
        idx.push(a0, a1 + 4, a1, a0, a0 + 4, a1 + 4)
      }
    const l = n * 4
    idx.push(0, 1, 2, 0, 2, 3, l, l + 2, l + 1, l, l + 3, l + 2)
    return meshOf(pos, idx, color)
  }

  /** 鞋带：一排横杠 + 顶上一个蝴蝶结 */
  function laces(ua: number, ub: number, n: number, color: string, ex = 1.2, r = 0.22, bow = true) {
    const g = new THREE.Group()
    for (let i = 0; i < n; i++) {
      const u = ua + ((ub - ua) * i) / Math.max(1, n - 1)
      const e = Math.min(ex, a(u) * 0.55)
      const pr = Math.acos(e / a(u))
      const A = at(u, pr, 0.25)
      const B = at(u, PI - pr, 0.25)
      A[1] = B[1] = Math.max(A[1], B[1])
      g.add(stick(A, B, r, color))
      for (const p of [A, B]) g.add(ball(r * 1.6, shade(color, -0.25), { x: p[0], y: p[1] - r, z: p[2] }))
    }
    if (bow) {
      const [bx, by, bz] = at(ua, PI / 2, 0.4)
      for (const sx of [-1, 1]) {
        g.add(P(torus(0.9 * (r / 0.22), r, color), bx + sx * 0.9, by + 0.2, bz - 0.2, -1.1, 0, sx * 0.4))
        g.add(stick([bx, by, bz], [bx + sx * 1.1, by - 0.4, bz + 1.6], r, color))
      }
    }
    return g
  }

  /** 鞋舌：从鞋口前沿往后上方斜出 */
  function tongue(color: string, len: number, lean = 0.45) {
    const u = uOpen
    const w = a(u) * 1.0
    const y = topY(u) - 1.6
    const g = G(rbox(w, len, 0.5, color, {}, 0.24))
    return P(g, cx(u), y, z(u) - 0.3, -lean)
  }

  return { s, a, cx, z, base, top0, topY, at, wall, loftSlab, sole, insole, upper, collarRim, archTube, strap, laces, tongue }
}
type Last = ReturnType<typeof shoeLast>

// ---------- 尺码 ----------

type SizeKey = 'M' | 'F' | 'K' | 'T'
interface ShoeSize {
  L: number
  W: number
  k: number
  label: string
}
const SIZES: Record<SizeKey, ShoeSize> = {
  M: { L: 29, W: 10.6, k: 1, label: '成人男款' },
  F: { L: 24.5, W: 9, k: 0.88, label: '成人女款' },
  K: { L: 18, W: 7, k: 0.7, label: '儿童' },
  T: { L: 14, W: 6, k: 0.58, label: '幼儿' },
}

/** 一双：右脚在 +x，左脚是镜像；脚尖略微外撇，两只角度不一样 */
const PAIR_GAP = 0.8
const ANG_R = 0.05
const ANG_L = -0.08
function pair(one: () => THREE.Group, W: number) {
  const r = P(one(), W / 2 + PAIR_GAP / 2 + 0.3, 0, 0, 0, ANG_R)
  const l = P(one(), -(W / 2 + PAIR_GAP / 2 + 0.3), 0, 0, 0, ANG_L)
  l.scale.x = -1
  return G(r, l)
}
/** 一双鞋的占地（宽、深） */
function pairWD(z: ShoeSize, extraW = 0, extraD = 0.4) {
  const hw = z.W / 2 + 0.3 + extraW
  const cxo = z.W / 2 + PAIR_GAP / 2 + 0.3
  const w = 2 * (cxo + hw * Math.cos(0.08) + (z.L / 2) * Math.sin(0.08)) - 0.1 * z.W
  const d = z.L * Math.cos(0.08) + 2 * hw * Math.sin(0.08) + extraD
  return [Math.round(w * 10) / 10, Math.round(d * 10) / 10] as const
}

interface ShoeFamily {
  key: string
  name: string
  sizes: SizeKey[]
  /** 每个尺码的高度（与 sizes 对应） */
  hs: number[]
  pals: Pal[]
  one: (z: ShoeSize, p: string[]) => THREE.Group
  /** 占地额外加宽 / 加深（伸出鞋边的搭扣、提环；木屐比脚短） */
  extraW?: number
  extraD?: number
  labels?: Partial<Record<SizeKey, string>>
}

function shoeFamily(f: ShoeFamily): AssetDef[] {
  return f.sizes.map((k, i) => {
    const z = SIZES[k]
    const [w, d] = pairWD(z, f.extraW ?? 0, f.extraD ?? 0.4)
    return asset(`sb-shoe-${f.key}-${k.toLowerCase()}`, f.name, 'entrance', [w, d, f.hs[i]], f.pals, (p) => pair(() => f.one(z, p), z.W), {
      family: `sb-shoe-${f.key}`,
      sizeLabel: f.labels?.[k] ?? z.label,
      prop: true,
    })
  })
}

// ---------- 各种鞋（一只右脚） ----------

/** 运动鞋：厚底、系带、鞋舌、鞋口包边 */
function sneaker(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 2.8 * k,
    base: [
      [0, 0],
      [0.82, 0],
      [1, 0.9 * k],
    ],
    dome: scaleTab([[0.4, 6.6], [0.6, 5.6], [0.85, 4.4], [1, 3]], k),
    collar: scaleTab([[0, 7], [0.18, 5.4], [0.4, 5.6]], k),
    uOpen: 0.4,
    t: 0.5,
  })
  const g = G(L.sole(p[1]), L.insole(), L.upper(p[0]), L.collarRim(p[2], 0.55 * k))
  // 中底色带
  g.add(L.loftSlab(p[2], { bot: (u) => L.base(u) + 1.2 * k, top: (u) => L.base(u) + 1.7 * k, inflate: 0.42, u0: 0.02, u1: 0.98 }))
  // 鞋头包片
  g.add(L.upper(p[1], { from: 0.84, off: 0.12, t: 0.2 }))
  g.add(L.laces(0.43, 0.7, 5, p[2] === p[1] ? WHITE : p[2], 1.25 * k + 0.2))
  g.add(L.tongue(p[0], 4.4 * k))
  // 后跟提环
  const [hx, hy, hz] = L.at(0.004, PI / 2 - 0.3)
  g.add(P(torus(0.9 * k, 0.22, p[2], {}, PI), hx, hy - 0.2, hz - 0.3, 0, PI / 2, 0))
  return g
}

/** 帆布鞋：薄橡胶底 + 白色鞋头 + 色线；high 为高帮 */
function canvas(high: boolean) {
  return (z: ShoeSize, p: string[]) => {
    const k = z.k
    const L = shoeLast({
      L: z.L,
      W: z.W,
      soleT: 2.2 * k,
      dome: high ? scaleTab([[0.38, 9], [0.5, 6.4], [0.8, 4.2], [1, 2.8]], k) : scaleTab([[0.46, 5.2], [0.8, 4], [1, 2.8]], k),
      collar: high ? scaleTab([[0, 11], [0.38, 10.4]], k) : scaleTab([[0, 4.8], [0.2, 4], [0.46, 4.4]], k),
      uOpen: high ? 0.38 : 0.46,
      wrap: high ? 1.12 : 1.25,
    })
    const g = G(L.sole(RUBBER, 0.35), L.insole(), L.upper(p[0]))
    g.add(L.loftSlab(p[1], { bot: (u) => 0.9 * k, top: (u) => 1.3 * k, inflate: 0.45, u0: 0.01, u1: 0.99 }))
    g.add(L.upper(RUBBER, { from: 0.86, off: 0.12, t: 0.2 }))
    g.add(L.collarRim(shade(p[0], -0.08), 0.32))
    g.add(L.laces(high ? 0.41 : 0.48, high ? 0.72 : 0.72, high ? 6 : 5, p[2], 1.1 * k + 0.2, 0.2))
    g.add(L.tongue(p[0], high ? 2.2 * k : 3 * k, high ? 0.2 : 0.45))
    if (high) {
      // 内侧脚踝贴标
      const [x, y, zz] = L.wall(0.2, 7 * k, -1, 0.15)
      g.add(P(cyl(1.4 * k, 1.4 * k, 0.2, RUBBER, {}, 20), x, y, zz, 0, 0, PI / 2 - 0.2))
    }
    return g
  }
}

/** 皮鞋底：跟 + 腰窝 + 前掌 */
function heelBase(h: number): Tab {
  return [
    [0, h],
    [0.27, h],
    [0.42, h * 0.45],
    [0.6, 0],
    [0.9, 0],
    [1, 0.35],
  ]
}
/** 鞋跟块：贴着鞋底后段的轮廓 */
function heelBlock(L: Last, color: string, h: number, to = 0.27) {
  return L.loftSlab(color, { u1: to, bot: () => 0, top: () => h + 0.05, inflate: 0.3, n: 16 })
}

/** 牛津鞋：薄底带跟、封闭式系带、鞋头接缝 */
function oxford(z: ShoeSize, p: string[]) {
  const k = z.k
  const hh = 2.2 * k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 1.1,
    base: heelBase(hh),
    widthT: SLIM_W,
    toeP: 2.6,
    dome: scaleTab([[0.55, 5.4], [0.8, 4], [1, 2.4]], k),
    collar: scaleTab([[0, 5.6], [0.2, 4.4], [0.55, 4.8]], k),
    uOpen: 0.55,
    t: 0.35,
  })
  const g = G(L.sole(p[1]), heelBlock(L, p[1], hh), L.insole(INSOLE_LEATHER), L.upper(p[0]))
  g.add(L.laces(0.565, 0.68, 4, p[2], 0.8, 0.16, true))
  g.add(L.archTube(0.84, 0.12, shade(p[0], -0.15), 0.08))
  g.add(L.collarRim(shade(p[0], -0.1), 0.2))
  return g
}

/** 乐福鞋：低帮、鞋背横带、U 形缝线 */
function loafer(z: ShoeSize, p: string[]) {
  const k = z.k
  const hh = 2 * k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 1.1,
    base: heelBase(hh),
    toeP: 3,
    dome: scaleTab([[0.6, 4.8], [0.85, 3.9], [1, 2.4]], k),
    collar: scaleTab([[0, 4.8], [0.25, 3.4], [0.6, 3.6]], k),
    uOpen: 0.6,
    t: 0.35,
  })
  const g = G(L.sole(p[1]), heelBlock(L, p[1], hh), L.insole(INSOLE_LEATHER), L.upper(p[0]), L.collarRim(shade(p[0], -0.1), 0.22))
  g.add(L.strap(0.67, 1.6 * k, shade(p[0], -0.12), { th: 0.3 }))
  const [sx, sy, sz] = L.at(0.67, PI / 2, 0.38)
  g.add(rbox(1.6 * k, 0.2, 0.7 * k, p[2], { x: sx, y: sy - 0.05, z: sz }, 0.08))
  const seam: V3[] = []
  for (let i = 0; i <= 8; i++) seam.push(L.at(0.7 + i * 0.03, PI / 2 + 0.75, 0.05))
  for (let i = 8; i >= 0; i--) seam.push(L.at(0.7 + i * 0.03, PI / 2 - 0.75, 0.05))
  seam.splice(9, 0, L.at(0.97, PI / 2, 0.05))
  g.add(tube(seam, 0.1, shade(p[0], -0.18)))
  return g
}

/** 高跟鞋：尖头、浅口、细跟或粗跟 */
function heels(block: boolean) {
  return (z: ShoeSize, p: string[]) => {
    const hh = block ? 5 : 8
    const L = shoeLast({
      L: z.L,
      W: z.W,
      soleT: 0.5,
      base: [
        [0, hh],
        [0.22, hh - 0.4],
        [0.55, hh * 0.25],
        [0.68, 0],
        [0.93, 0],
        [1, 0.3],
      ],
      widthT: SLIM_W,
      toeP: 1.8,
      dome: [
        [0.68, 3.2],
        [0.85, 2.6],
        [1, 1.4],
      ],
      collar: [
        [0, 5.2],
        [0.15, 4],
        [0.68, 2.2],
      ],
      uOpen: 0.68,
      t: 0.3,
    })
    const g = G(L.sole(p[1], 0.15), L.insole(p[2]), L.upper(p[0]), L.collarRim(p[0], 0.16))
    const zh = L.z(0.07)
    const top = L.base(0.07) + 0.15
    if (block) g.add(rbox(3, top, 3, p[1], { x: L.cx(0.07), z: zh + 0.3 }, 0.5))
    else g.add(cyl(0.75, 0.38, top, p[1], { x: L.cx(0.07), z: zh + 0.4 }, 12))
    return g
  }
}

/** 芭蕾平底鞋：极浅口、小蝴蝶结 */
function ballet(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 0.7,
    toeP: 2.6,
    dome: scaleTab([[0.62, 3.6], [0.85, 3], [1, 2]], k),
    collar: scaleTab([[0, 3.2], [0.3, 2.4], [0.62, 2.2]], k),
    uOpen: 0.62,
    t: 0.3,
  })
  const g = G(L.sole(p[1], 0.15), L.insole(p[2]), L.upper(p[0]), L.collarRim(shade(p[0], -0.1), 0.18))
  const [bx, by, bz] = L.at(0.64, PI / 2, 0.3)
  for (const sx of [-1, 1]) g.add(ball(0.9 * k, p[2], { x: bx + sx * 0.9 * k, y: by, z: bz }, [1, 0.5, 0.6]))
  g.add(ball(0.45 * k, shade(p[2], -0.1), { x: bx, y: by + 0.05, z: bz }))
  return g
}

/** 短靴（切尔西）：高筒到脚踝、后拉环、松紧侧片 */
function shortBoot(z: ShoeSize, p: string[]) {
  const k = z.k
  const hh = 2.4 * k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 1.6,
    base: heelBase(hh),
    dome: scaleTab([[0.4, 8], [0.6, 5.8], [0.85, 4.3], [1, 2.8]], k),
    collar: scaleTab([[0, 12.5], [0.4, 12]], k),
    uOpen: 0.4,
    wrap: 1.1,
    t: 0.4,
  })
  const g = G(L.sole(p[1]), heelBlock(L, p[1], hh), L.insole(INSOLE_LEATHER), L.upper(p[0]), L.collarRim(shade(p[0], -0.1), 0.25))
  for (const side of [-1, 1]) {
    const [x, y, zz] = L.wall(0.3, 7 * k, side, 0.12)
    g.add(P(rbox(0.25, 7 * k, 3.2 * k, p[2], {}, 0.1), x, y - 3.5 * k, zz, 0, 0, side * -0.18))
  }
  const [hx, hy, hz] = L.at(0.004, PI / 2 - 0.4)
  g.add(P(torus(1.1 * k, 0.3, p[2], {}, PI), hx, hy + 0.2, hz - 0.2, 0, PI / 2, 0))
  return g
}

/** 长筒靴 / 雨靴：脚部鞋楦 + 椭圆空心长筒 */
function bootShaft(L: Last, H: number, color: string, rim: string, flare = 1.08, th = 0.45) {
  const z = L.s
  const rx = z.W * 0.38
  const rz = z.L * 0.2 + 0.4
  const yb = L.top0(0.2) - 0.1
  const hgt = H - yb
  const g = new THREE.Group()
  const outer = new THREE.CylinderGeometry(1 * flare, 1, 1, 28, 1, true)
  const mOut = new THREE.Mesh(outer, toon(color))
  mOut.scale.set(rx, hgt, rz)
  mOut.position.y = hgt / 2
  const inner = new THREE.CylinderGeometry(1 * flare, 1, 1, 28, 1, true)
  inner.scale(-1, 1, 1)
  const inr = inner.getAttribute('normal')
  for (let i = 0; i < inr.count; i++) inr.setXYZ(i, -inr.getX(i), -inr.getY(i), -inr.getZ(i))
  const mIn = new THREE.Mesh(inner, toon(shade(color, -0.12)))
  mIn.scale.set(rx - th, hgt, rz - th)
  mIn.position.y = hgt / 2
  mIn.userData.noOutline = true
  for (const m of [mOut, mIn]) {
    m.castShadow = true
    m.receiveShadow = true
  }
  const ring = torus(1, th / 2 / Math.min(rx, rz), rim, {}, PI * 2)
  ring.scale.set(rx * flare - th / 2, rz * flare - th / 2, 1)
  ring.rotation.x = PI / 2
  ring.position.y = hgt
  // 管口圆环会按缩放变形，这里用椭圆环近似
  g.add(mOut, mIn, ring)
  g.position.set(L.cx(0.2), yb, L.z(0.2))
  return g
}

function longBoot(z: ShoeSize, p: string[]) {
  const hh = 3.2
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 1.2,
    base: heelBase(hh),
    widthT: SLIM_W,
    toeP: 2.4,
    dome: [
      [0.42, 8],
      [0.6, 5.4],
      [0.85, 4],
      [1, 2.6],
    ],
    collar: [
      [0, 9],
      [0.42, 9],
    ],
    uOpen: 0.42,
    wrap: 1.12,
  })
  const g = G(L.sole(p[1]), heelBlock(L, p[1], hh), L.insole(INSOLE_LEATHER), L.upper(p[0]), bootShaft(L, 42, p[0], shade(p[0], -0.1), 1.1))
  // 脚踝搭扣带
  g.add(L.strap(0.3, 1.4, p[2], { b: 9.6, th: 0.3 }))
  return g
}

function rainBoot(H: number) {
  return (z: ShoeSize, p: string[]) => {
    const k = z.k
    const L = shoeLast({
      L: z.L,
      W: z.W,
      soleT: 1.8 * k,
      base: [
        [0, 0.6 * k],
        [0.3, 0.6 * k],
        [0.4, 0],
        [0.92, 0],
        [1, 0.5],
      ],
      dome: scaleTab([[0.42, 8.4], [0.6, 6.2], [0.85, 4.8], [1, 3.2]], k),
      collar: scaleTab([[0, 9], [0.42, 9]], k),
      uOpen: 0.42,
      wrap: 1.12,
      t: 0.5,
    })
    const g = G(L.sole(p[1], 0.4), L.loftSlab(p[1], { u1: 0.3, bot: () => 0, top: (u) => L.base(u) + 0.1, inflate: 0.4, n: 12 }), L.insole(), L.upper(p[0]), bootShaft(L, H, p[0], p[2], 1.1, 0.55))
    if (z.k < 0.8) {
      // 儿童款：筒口两侧的提手环
      for (const side of [-1, 1]) g.add(P(torus(1.2, 0.3, p[2], {}, PI), L.cx(0.2) + side * (z.W * 0.38 * 1.1 - 0.1), H - 0.2, L.z(0.2), 0, PI / 2, 0))
    }
    return g
  }
}

/** 凉鞋：软木底 + 鞋背两条带 + 后跟环带 */
function sandal(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({ L: z.L, W: z.W, soleT: 2.4 * k, dome: [[0, 3.4 * k]] })
  const g = G(L.loftSlab(p[1], { bot: () => 0, top: () => 0.8 * k, inflate: 0.35 }), L.loftSlab(KRAFT, { bot: () => 0.7 * k, top: () => 2.4 * k, inflate: 0.3 }), L.insole(p[2]))
  g.add(L.strap(0.6, 2.2 * k, p[0], { b: 3.6 * k }), L.strap(0.8, 1.6 * k, p[0], { b: 2.8 * k }))
  const hy = L.top0(0) + 3.4 * k
  const loop: V3[] = []
  for (let i = 10; i >= 0; i--) loop.push([L.cx(i * 0.036) + L.a(i * 0.036) + 0.4, hy, L.z(i * 0.036)])
  loop.push([0, hy, L.z(0) - 0.5])
  for (let i = 0; i <= 10; i++) loop.push([L.cx(i * 0.036) - L.a(i * 0.036) - 0.4, hy, L.z(i * 0.036)])
  g.add(tube(loop, 0.32 * k + 0.1, p[0]))
  for (const side of [-1, 1]) {
    const x = L.cx(0.36) + side * (L.a(0.36) + 0.4)
    g.add(rbox(0.5, 3.6 * k, 1.6 * k, p[0], { x, y: L.top0(0.36) - 0.2, z: L.z(0.36) }, 0.15))
  }
  g.add(rbox(0.5, 1.4 * k, 1.8 * k, M.silver, { x: L.cx(0.2) + L.a(0.2) + 0.65, y: hy - 0.7 * k, z: L.z(0.2) }, 0.15))
  return g
}

/** 人字拖：EVA 平底 + Y 形夹带 */
function flipflop(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({ L: z.L, W: z.W, soleT: 1.6 * k, dome: [[0, 2]] })
  const g = G(L.loftSlab(p[1], { bot: () => 0, top: () => 0.8 * k, inflate: 0.4 }), L.loftSlab(p[0], { bot: () => 0.75 * k, top: () => 1.6 * k, inflate: 0.4 }))
  const t0 = L.top0(0.5)
  const post: V3 = [L.cx(0.8) - z.W * 0.08, t0 + 1.3 * k, L.z(0.8)]
  g.add(cyl(0.3, 0.3, 1.3 * k, p[2], { x: post[0], y: t0 - 0.1, z: post[2] }, 10))
  for (const side of [-1, 1]) {
    const end: V3 = [L.cx(0.46) + side * (L.a(0.46) - 0.2), t0 + 0.1, L.z(0.46)]
    const mid: V3 = [(post[0] + end[0]) / 2 + side * 0.6, t0 + 2.2 * k, (post[2] + end[2]) / 2]
    g.add(tube([post, mid, end], 0.42 * k + 0.1, p[2]))
  }
  return g
}

/** 一字拖：厚底 + 一条宽带 */
function slides(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({ L: z.L, W: z.W, soleT: 2.6 * k, dome: [[0, 3.6 * k]], u0: 0.42, u1: 0.78, t: 0.6 })
  const g = G(L.sole(p[1], 0.35), L.insole(p[2]), L.upper(p[0]))
  g.add(L.archTube(0.42, 0.34, shade(p[0], -0.1)), L.archTube(0.78, 0.34, shade(p[0], -0.1)))
  return g
}

/** 室内拖鞋（スリッパ）：软底 + 包住前脚的鞋面，后面敞开 */
function slipper(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 1.3 * k,
    dome: scaleTab([[0.48, 4.4], [0.8, 3.8], [1, 2.6]], k),
    u0: 0.48,
    t: 0.7,
  })
  const g = G(L.sole(p[1], 0.4), L.insole(p[2]), L.upper(p[0]))
  g.add(L.archTube(0.48, 0.45 * k + 0.1, p[2]))
  return g
}

/** 童鞋：两条魔术贴 + 圆头 */
function velcro(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 2.4 * k,
    toeP: 4,
    base: [
      [0, 0],
      [0.85, 0],
      [1, 0.6 * k],
    ],
    dome: scaleTab([[0.42, 7.4], [0.6, 6.4], [0.85, 5], [1, 3.4]], k),
    collar: scaleTab([[0, 8], [0.2, 6.6], [0.42, 7]], k),
    uOpen: 0.42,
    t: 0.5,
  })
  const g = G(L.sole(RUBBER), L.insole(), L.upper(p[0]), L.collarRim(p[2], 0.55 * k))
  g.add(L.upper(p[1], { from: 0.84, off: 0.12, t: 0.2 }))
  for (const [u, w] of [
    [0.5, 2.4],
    [0.66, 2.2],
  ]) {
    g.add(L.strap(u, w * k, p[1], { th: 0.4 }))
    const [x, y, zz] = L.wall(u, 2.6 * k, 1, 0.45)
    g.add(rbox(0.4, 2.2 * k, w * k, p[1], { x: x + 0.2, y: y - 1, z: zz }, 0.15))
  }
  g.add(L.tongue(p[0], 4.2 * k))
  return g
}

/** 下駄：木台 + 两条齿 + 鼻绪 */
function geta(z: ShoeSize, p: string[]) {
  const k = z.k
  const tooth = 4.2 * k
  const bt = 1.8 * k
  const bw = z.W * 0.98
  const bl = z.L * 0.96
  const g = new THREE.Group()
  g.add(rbox(bw, bt, bl, p[0], { y: tooth }, bw * 0.3))
  for (const zz of [-0.27, 0.25]) g.add(rbox(bw - 0.6, tooth + 0.1, 1.8 * k, shade(p[0], -0.1), { z: zz * bl }, 0.3))
  const top = tooth + bt
  const front: V3 = [0, top + 1.3 * k, bl * 0.3]
  g.add(cyl(0.45, 0.45, 1.3 * k + 0.1, p[1], { y: top - 0.1, z: bl * 0.3 }, 10))
  for (const side of [-1, 1]) {
    const end: V3 = [side * (bw / 2 - 0.9), top + 0.15, -bl * 0.06]
    g.add(tube([front, [side * bw * 0.3, top + 2.6 * k, bl * 0.12], end], 0.55 * k + 0.15, p[1]))
    g.add(ball(0.5, shade(p[1], -0.2), { x: end[0], y: top + 0.1, z: end[2] }, [1, 0.5, 1]))
  }
  g.add(ball(0.55, p[2], { x: 0, y: front[1] + 0.2, z: front[2] }))
  return g
}

/** 草履：两层椭圆底 + 粗鼻绪 */
function zori(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({ L: z.L, W: z.W, soleT: 2.2 * k, dome: [[0, 2]], sym: true, widthT: [[0, 0.82], [0.5, 0.9], [0.75, 1], [1, 0.9]], toeP: 4, heelP: 4 })
  const g = G(L.loftSlab(p[0], { bot: () => 0, top: () => 1.5 * k, inflate: 0.4 }), L.loftSlab(p[2], { bot: () => 1.4 * k, top: () => 2.2 * k, inflate: 0.3 }))
  const t0 = L.top0(0.5)
  const front: V3 = [0, t0 + 1.2 * k, L.z(0.84)]
  for (const side of [-1, 1]) {
    const end: V3 = [side * (L.a(0.4) - 0.3), t0 + 0.2, L.z(0.4)]
    g.add(tube([front, [side * L.a(0.6) * 0.6, t0 + 2.6 * k, L.z(0.62)], end], 0.6 * k + 0.15, p[1]))
  }
  g.add(ball(0.6, p[1], { x: 0, y: front[1], z: front[2] }))
  return g
}

/** 登山鞋：粗齿厚底、高帮、粗包边、上段挂钩 */
function hiking(z: ShoeSize, p: string[]) {
  const k = z.k
  const L = shoeLast({
    L: z.L,
    W: z.W,
    soleT: 3.2 * k,
    base: [
      [0, 0],
      [0.85, 0],
      [1, 1 * k],
    ],
    toeP: 3.4,
    dome: scaleTab([[0.38, 9], [0.52, 6.8], [0.8, 4.8], [1, 3.2]], k),
    collar: scaleTab([[0, 10.2], [0.38, 9.8]], k),
    uOpen: 0.38,
    wrap: 1.12,
    t: 0.55,
  })
  const g = G(L.sole(M.char, 0.45), L.insole(), L.upper(p[0]), L.collarRim(p[2], 0.85 * k))
  g.add(L.loftSlab(p[1], { bot: (u) => L.base(u) + 1.6 * k, top: (u) => L.base(u) + 3.2 * k - 0.1, inflate: 0.38, u0: 0.01, u1: 0.99 }))
  // 鞋底齿
  for (let i = 0; i < 7; i++) {
    const u = 0.1 + i * 0.13
    g.add(rbox(L.a(u) * 2 + 0.6, 0.5, 0.9, M.black, { x: L.cx(u), y: L.base(u) - 0.25, z: L.z(u) }, 0.2))
  }
  g.add(L.upper(p[1], { from: 0.86, off: 0.14, t: 0.25 }))
  g.add(L.laces(0.41, 0.66, 5, p[2], 1.3 * k + 0.2, 0.22))
  g.add(L.tongue(shade(p[0], -0.1), 2.6 * k, 0.15))
  return g
}

// ---------- 鞋子配色 ----------

const SNEAKER_PALS: Pal[] = [
  ['modern', [M.white, M.white, M.char]],
  ['cute', [C.pink, WHITE, C.sky]],
  ['nordic', [N.gray, N.white, N.mustard]],
  ['retro', [R.teal, R.cream, R.orange]],
  ['industrial', [I.iron, '#e9e4da', I.rust]],
]
const CANVAS_PALS: Pal[] = [
  ['modern', [M.black, M.black, WHITE]],
  ['nordic', [N.linen, N.blue, WHITE]],
  ['retro', [R.red, R.red, R.cream]],
  ['cute', [C.lemon, C.sky, WHITE]],
  ['japanese', [J.ai, J.shu, J.washi]],
]
const LEATHER_PALS: Pal[] = [
  ['industrial', [I.leather, '#4a3426', '#5a3c28']],
  ['modern', [M.black, '#2a2a2e', M.char]],
  ['retro', [R.caramel, '#5a3c28', '#3b2a1e']],
  ['nordic', [N.oak, '#6b5444', '#8d6e55']],
]
const HEEL_PALS: Pal[] = [
  ['modern', [M.black, M.black, '#d8c2a8']],
  ['cute', [C.pink, '#f4e7dc', '#ffe3ea']],
  ['nordic', [N.linen, N.oak, N.white]],
  ['retro', [R.red, '#3b2a1e', R.cream]],
]
const FLAT_PALS: Pal[] = [
  ['cute', [C.sakura, '#e8cdbf', C.pink]],
  ['modern', [M.black, M.char, M.white]],
  ['nordic', [N.sage, N.oak, N.white]],
  ['retro', [R.mustard, R.caramel, R.cream]],
]
const BOOT_PALS: Pal[] = [
  ['industrial', [I.leather, '#3a2a20', I.iron]],
  ['modern', [M.black, '#202024', M.char]],
  ['nordic', [N.oakL, '#6b5444', N.gray]],
  ['retro', [R.caramel, '#3b2a1e', R.olive]],
]
const RAIN_PALS: Pal[] = [
  ['cute', [C.lemon, '#d9b04a', C.sky]],
  ['nordic', [N.sage, '#6f8068', N.white]],
  ['modern', [M.char, M.black, M.silver]],
  ['retro', [R.red, '#8f2f26', R.cream]],
  ['japanese', [J.ai, J.sumi, J.washi]],
]
const SANDAL_PALS: Pal[] = [
  ['industrial', [I.leather, I.iron, '#d9c3a0']],
  ['modern', [M.black, M.char, '#cdbfa8']],
  ['nordic', [N.oak, N.gray, N.linen]],
  ['cute', [C.mint, '#8e7a68', C.cream]],
]
const FLIP_PALS: Pal[] = [
  ['cute', [C.sky, WHITE, C.pink]],
  ['modern', [M.char, M.black, M.white]],
  ['retro', [R.orange, R.cream, R.teal]],
  ['nordic', [N.blue, N.white, N.gray]],
]
const SLIPPER_PALS: Pal[] = [
  ['nordic', [N.linen, N.gray, N.white]],
  ['cute', [C.sakura, C.pink, WHITE]],
  ['japanese', [J.ai, J.sumi, J.washi]],
  ['modern', [M.light, M.char, M.white]],
  ['retro', [R.mustard, R.caramel, R.cream]],
]
const KID_PALS: Pal[] = [
  ['cute', [C.sky, C.lemon, C.pink]],
  ['cute', [C.pink, C.lilac, C.mint]],
  ['nordic', [N.sage, N.white, N.mustard]],
  ['retro', [R.red, R.cream, R.teal]],
]
const GETA_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.shu, J.washi]],
  ['japanese', [J.wood, J.ai, J.washi]],
  ['japanese', [J.dark, J.sumi, J.shu]],
  ['retro', [R.caramel, R.red, R.cream]],
]
const ZORI_PALS: Pal[] = [
  ['japanese', [J.tatami, J.shu, J.washi]],
  ['japanese', [J.sumi, J.ai, J.hinoki]],
  ['retro', [R.cream, R.red, R.mustard]],
  ['cute', [C.sakura, C.pink, C.white]],
]
const HIKE_PALS: Pal[] = [
  ['industrial', [I.leather, I.rust, I.iron]],
  ['nordic', [N.sage, N.mustard, N.gray]],
  ['retro', [R.olive, R.orange, R.caramel]],
  ['modern', [M.char, M.gray, M.black]],
]

const SHOES: AssetDef[] = [
  ...shoeFamily({ key: 'sneaker', name: '运动鞋', sizes: ['M', 'F', 'K'], hs: [12.1, 10.6, 8.4], pals: SNEAKER_PALS, one: sneaker, extraW: 0 }),
  ...shoeFamily({ key: 'canvas-low', name: '低帮帆布鞋', sizes: ['M', 'F', 'K'], hs: [8.8, 7.7, 6.4], pals: CANVAS_PALS, one: canvas(false) }),
  ...shoeFamily({ key: 'canvas-high', name: '高帮帆布鞋', sizes: ['M', 'F', 'K'], hs: [14.3, 12.4, 9.8], pals: CANVAS_PALS, one: canvas(true) }),
  ...shoeFamily({ key: 'oxford', name: '牛津皮鞋', sizes: ['M', 'F'], hs: [8.9, 8.0], pals: LEATHER_PALS, one: oxford }),
  ...shoeFamily({ key: 'loafer', name: '乐福鞋', sizes: ['M', 'F'], hs: [7.9, 7.1], pals: LEATHER_PALS, one: loafer }),
  ...shoeFamily({ key: 'pump', name: '高跟鞋', sizes: ['F'], hs: [13.7], pals: HEEL_PALS, one: heels(false), extraW: -0.4 }).map((d) => ({ ...d, sizeLabel: '成人女款 · 细跟 8cm' })),
  ...shoeFamily({ key: 'pump-block', name: '高跟鞋', sizes: ['F'], hs: [10.7], pals: HEEL_PALS, one: heels(true), extraW: -0.4 }).map((d) => ({ ...d, family: 'sb-shoe-pump', sizeLabel: '成人女款 · 粗跟 5cm' })),
  ...shoeFamily({ key: 'ballet', name: '芭蕾平底鞋', sizes: ['F', 'K'], hs: [4.4, 3.7], pals: FLAT_PALS, one: ballet, extraW: -0.4 }),
  ...shoeFamily({ key: 'chelsea', name: '短靴', sizes: ['M', 'F'], hs: [18.6, 16.6], pals: BOOT_PALS, one: shortBoot }),
  ...shoeFamily({ key: 'long-boot', name: '长筒靴', sizes: ['F'], hs: [42.1], pals: BOOT_PALS, one: longBoot, }),
  ...shoeFamily({ key: 'rain-boot', name: '雨靴', sizes: ['M', 'F', 'K'], hs: [38.1, 34.1, 19.3], pals: RAIN_PALS, one: (z, p) => rainBoot(z.k === 1 ? 38 : z.k > 0.8 ? 34 : 18)(z, p), }),
  ...shoeFamily({ key: 'sandal', name: '凉鞋', sizes: ['M', 'F', 'K'], hs: [6.5, 5.7, 4.6], pals: SANDAL_PALS, one: sandal }),
  ...shoeFamily({ key: 'flipflop', name: '人字拖', sizes: ['M', 'F', 'K'], hs: [4.4, 3.8, 3.1], pals: FLIP_PALS, one: flipflop }),
  ...shoeFamily({ key: 'slides', name: '一字拖', sizes: ['M', 'F'], hs: [6.4, 5.6], pals: FLIP_PALS, one: slides }),
  ...shoeFamily({ key: 'slipper', name: '室内拖鞋', sizes: ['M', 'F', 'K'], hs: [6.1, 5.4, 4.3], pals: SLIPPER_PALS, one: slipper }),
  ...shoeFamily({ key: 'velcro', name: '魔术贴童鞋', sizes: ['K', 'T'], hs: [8.8, 7.0], pals: KID_PALS, one: velcro }),
  ...shoeFamily({ key: 'geta', name: '木屐（下駄）', sizes: ['M', 'F', 'K'], hs: [9.3, 8.2, 6.6], pals: GETA_PALS, one: geta, extraD: -1 }),
  ...shoeFamily({ key: 'zori', name: '草履', sizes: ['M', 'F'], hs: [5.6, 4.9], pals: ZORI_PALS, one: zori }),
  ...shoeFamily({ key: 'hiking', name: '登山鞋', sizes: ['M', 'F'], hs: [15.3, 13.3], pals: HIKE_PALS, one: hiking }),
]

// ======================================================================
// 鞋柜 / 鞋架
// ======================================================================

type Surf = NonNullable<AssetDef['surfaces']>[number]
const r1 = (v: number) => Math.round(v * 10) / 10

/** 柜体规格：tops 为每层层板顶面（第一个是底板），天花 = h - t */
interface Cab {
  w: number
  d: number
  h: number
  t: number
  tops: number[]
  back?: number
}

/** 柜体：侧板、顶板、底板 + 踢脚、背板、层板。z 方向整体偏移 dz */
function carcass(c: Cab, color: string, inner: string, dz = 0) {
  const { w, d, h, t } = c
  const bt = c.back ?? 0.6
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(t, h, d, color, { x: s * (w / 2 - t / 2), z: dz }, 0.5))
  g.add(rbox(w - 2 * t + 0.2, t, d, color, { y: h - t, z: dz }, 0.5))
  g.add(rbox(w - 2 * t + 0.2, h - t - 0.4, bt, inner, { y: 0.4, z: dz - d / 2 + bt / 2 }, 0.2))
  const y0 = c.tops[0] - t
  if (y0 > 0.5) g.add(rbox(w - 2 * t + 0.2, y0, t, color, { z: dz + d / 2 - t / 2 - 1.5 }, 0.4))
  for (const y of c.tops) g.add(rbox(w - 2 * t + 0.2, t, d - bt - 1, inner, { y: y - t, z: dz + (bt - 1) / 2 }, 0.4))
  return g
}

function cabSurfaces(c: Cab, dz = 0): Surf[] {
  const bt = c.back ?? 0.6
  const shape = [rectPoly(-c.w / 2 + c.t, dz - c.d / 2 + bt, c.w / 2 - c.t, dz + c.d / 2 - 1)]
  return c.tops.map((y, i) => ({ y, shape, h: r1((i < c.tops.length - 1 ? c.tops[i + 1] - c.t : c.h - c.t) - y) }))
}

type DoorKind = 'solid' | 'glass' | 'louver'
/** 门板：铰链在 x = 0，向 -side 方向展开，正面朝 +z，厚 1.8 */
function door(w: number, h: number, kind: DoorKind, color: string, handle: string, side: number) {
  const g = new THREE.Group()
  const cx = (-side * w) / 2
  if (kind === 'solid') g.add(rbox(w - 0.3, h, 1.8, color, { x: cx, z: 0.9 }, 0.5))
  else {
    const f = 4
    for (const s of [-1, 1]) g.add(rbox(f, h, 1.8, color, { x: cx + s * (w / 2 - 0.15 - f / 2), z: 0.9 }, 0.4))
    g.add(rbox(w - 0.3 - 2 * f + 0.4, f, 1.8, color, { x: cx, z: 0.9 }, 0.4), rbox(w - 0.3 - 2 * f + 0.4, f, 1.8, color, { x: cx, y: h - f, z: 0.9 }, 0.4))
    if (kind === 'glass') g.add(clear(rbox(w - 2 * f + 0.4, h - 2 * f + 0.4, 0.5, C.glass, { x: cx, y: f - 0.2, z: 0.9 }, 0.1), C.glass, 0.3))
    else {
      const n = Math.floor((h - 2 * f - 1) / 3.4)
      for (let i = 0; i < n; i++) g.add(rbox(w - 2 * f + 0.4, 0.5, 2.6, color, { x: cx, y: f + 1 + i * 3.4, z: 0.9, rx: -0.6 }, 0.2))
    }
  }
  // 内凹拉手（只凸出 0.4）
  g.add(rbox(1.2, Math.min(14, h * 0.3), 0.6, handle, { x: -side * (w - 2.4), y: h * 0.5 - 4, z: 1.9 }, 0.25))
  return g
}

/** 双开门柜：可开合（门绕外侧铰链转开约 100°），门里的层板标 inside（玻璃门再标 glass） */
function doorCabinet(c: Cab, kind: DoorKind) {
  const dw = c.w / 2
  const D = c.d + 2.4
  const dz = -(D - c.d) / 2
  const doorY = c.tops[0] - c.t
  const build: Build = (p) => {
    const g = carcass(c, p[0], p[1], dz)
    for (const side of [-1, 1]) {
      const dr = door(dw, c.h - doorY - 0.2, kind, p[0], p[2], side)
      g.add(movable(P(dr, side * (c.w / 2), doorY, dz + c.d / 2), { kind: 'swing', angle: side * SWING_OPEN }))
    }
    return g
  }
  const surfaces = cabSurfaces(c, dz).map((l): Surf => ({ ...l, inside: true, ...(kind === 'glass' ? { glass: true } : {}) }))
  return { build, dims: [r1(c.w), r1(D), c.h] as Dims, surfaces, dz }
}

const CAB_PALS: Pal[] = [
  ['nordic', [N.white, N.oakL, N.oak]],
  ['nordic', [N.oak, N.oakL, N.white]],
  ['modern', [M.char, M.gray, M.silver]],
  ['japanese', [J.hinoki, J.washi, J.dark]],
  ['industrial', [I.walnut, shade(I.walnut, 0.08), I.iron]],
]

// --- 开放式鞋架 ---

const RACK_W = 70
const RACK_D = 30
const rackTops = (n: number, y0: number) => Array.from({ length: n }, (_, i) => y0 + i * 17)

function woodRack(n: number): Build {
  const t = 1.8
  const tops = rackTops(n, 6)
  const h = tops[n - 1]
  return (p) => {
    const g = new THREE.Group()
    for (const s of [-1, 1]) {
      const holes = h > 30 ? [{ kind: 'rect' as const, x: 0, y: h - 7, w: 11, h: 3.2, r: 1.6 }] : []
      g.add(holePanel(RACK_D, h, t, p[0], holes, { x: s * (RACK_W / 2 - t / 2), ry: PI / 2 }))
    }
    const sw = (RACK_D - 2) / 3
    for (const y of tops) for (let i = 0; i < 3; i++) g.add(rbox(RACK_W - 2 * t + 0.2, t, sw - 0.6, p[1], { y: y - t, z: -RACK_D / 2 + 1 + sw / 2 + i * sw }, 0.4))
    return g
  }
}
function metalRack(n: number): Build {
  const tops = rackTops(n, 4)
  const pt = 0.8
  const tx = RACK_W / 2 - 1.2
  const tz = RACK_D / 2 - 1.2
  const nt = 2.6
  const hw = RACK_W / 2
  const hd = RACK_D / 2
  const plate: Poly = [
    [-hw + nt, -hd],
    [hw - nt, -hd],
    [hw - nt, -hd + nt],
    [hw, -hd + nt],
    [hw, hd - nt],
    [hw - nt, hd - nt],
    [hw - nt, hd],
    [-hw + nt, hd],
    [-hw + nt, hd - nt],
    [-hw, hd - nt],
    [-hw, -hd + nt],
    [-hw + nt, -hd + nt],
  ]
  const ht = tops[n - 1] + 2
  return (p) => {
    const g = new THREE.Group()
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        g.add(cyl(1, 1, ht, p[0], { x: sx * tx, z: sz * tz }, 12))
        g.add(ball(1.2, p[2], { x: sx * tx, y: ht, z: sz * tz }))
        g.add(puck(1.5, 0.6, p[2], { x: sx * tx, z: sz * tz }))
      }
    for (const y of tops) {
      g.add(slab(plate, pt, p[1], y - pt))
      for (const sz of [-1, 1]) g.add(cylX(0.55, RACK_W - 4.4, p[0], 0, y - pt - 0.55, sz * tz))
    }
    return g
  }
}

const WOOD_RACK_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL, N.white]],
  ['japanese', [J.hinoki, J.hinoki, J.dark]],
  ['industrial', [I.walnut, I.walnut, I.iron]],
  ['nordic', [N.white, N.oak, N.gray]],
]
const METAL_RACK_PALS: Pal[] = [
  ['modern', [M.black, M.char, M.gray]],
  ['modern', [M.white, M.white, M.light]],
  ['industrial', [I.iron, I.steel, I.iron]],
  ['cute', [C.mint, WHITE, C.white]],
]

const rackShape = (inset: number, dIn: number) => [rectPoly(-RACK_W / 2 + inset, -RACK_D / 2 + dIn, RACK_W / 2 - inset, RACK_D / 2 - dIn)]
const RACKS: AssetDef[] = [
  ...[2, 3, 4].map((n) => {
    const tops = rackTops(n, 6)
    return asset(`sb-rack-wood-${n}`, '木鞋架', 'entrance', [RACK_W, RACK_D, tops[n - 1]], WOOD_RACK_PALS, woodRack(n), {
      family: 'sb-rack-wood',
      sizeLabel: `${n} 层`,
      surface: tops[n - 1],
      surfaceShape: rackShape(0, 0),
      surfaces: tops.slice(0, -1).map((y) => ({ y, shape: rackShape(1.8, 1), h: r1(17 - 1.8) })),
    })
  }),
  ...[2, 3, 4].map((n) => {
    const tops = rackTops(n, 4)
    return asset(`sb-rack-metal-${n}`, '金属鞋架', 'entrance', [RACK_W, RACK_D, tops[n - 1] + 3.2], METAL_RACK_PALS, metalRack(n), {
      family: 'sb-rack-metal',
      sizeLabel: `${n} 层`,
      surface: tops[n - 1],
      surfaceShape: rackShape(2.8, 0.4),
      surfaces: tops.slice(0, -1).map((y) => ({ y, shape: rackShape(2.8, 0.4), h: r1(17 - 0.8) })),
    })
  }),
]

// --- 带门鞋柜 ---

const SHOE_CAB: Cab = { w: 90, d: 35, h: 105, t: 1.8, tops: [7.8, 25.8, 43.8, 61.8, 79.8] }
const GLASS_CAB: Cab = { w: 60, d: 34, h: 120, t: 1.8, tops: [7.8, 26.8, 45.8, 64.8, 83.8, 102.8] }
const LOUVER_CAB: Cab = { w: 75, d: 35, h: 92, t: 1.8, tops: [7.8, 25.8, 43.8, 61.8] }

function doorCabDef(id: string, name: string, c: Cab, kind: DoorKind, pals: Pal[], cat: AssetCategory, extra: Partial<AssetDef> = {}): AssetDef {
  const m = doorCabinet(c, kind)
  return asset(id, name, cat, m.dims, pals, m.build, {
    surface: c.h,
    surfaceShape: [rectPoly(-c.w / 2, m.dz - c.d / 2, c.w / 2, m.dz + c.d / 2)],
    surfaces: m.surfaces,
    openable: true,
    ...extra,
  })
}

const CABINETS: AssetDef[] = [
  // 以前开 / 关是两件素材（sb-shoe-cab-open / -closed），现在一件可开合（旧的 open 形态读档时迁移成 closed + open）
  doorCabDef('sb-shoe-cab-closed', '双门鞋柜', SHOE_CAB, 'solid', CAB_PALS, 'entrance', { family: 'sb-shoe-cab' }),
  doorCabDef('sb-cab-glass', '玻璃门鞋柜', GLASS_CAB, 'glass', CAB_PALS, 'entrance'),
  doorCabDef('sb-cab-louver', '百叶门鞋柜', LOUVER_CAB, 'louver', CAB_PALS, 'entrance', { family: 'shoe-cabinet', sizeLabel: '百叶门' }),
]

// --- 开放柜：窄高鞋柜、靴柜 ---

const TALL_CAB: Cab = { w: 45, d: 34, h: 180, t: 1.8, tops: Array.from({ length: 10 }, (_, i) => 6.8 + i * 17) }
const BOOT_CAB: Cab = { w: 60, d: 36, h: 120, t: 1.8, tops: [6.8, 52.8, 69.8, 86.8, 103.8] }

const openCab =
  (c: Cab): Build =>
  (p) =>
    carcass(c, p[0], p[1])

// --- 鞋柜 + 长凳 ---

const BENCH = { w: 100, d: 36, t: 1.8, sideH: 40.6, seatT: 2.4, cushion: 5, tops: [6, 23] }
const BENCH_H = BENCH.sideH + BENCH.seatT + BENCH.cushion
function benchCab(p: string[]) {
  const { w, d, t } = BENCH
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(t, BENCH.sideH, d, p[0], { x: s * (w / 2 - t / 2) }, 0.5))
  g.add(rbox(w, BENCH.seatT, d, p[0], { y: BENCH.sideH }, 0.8))
  g.add(rbox(w - 4, BENCH.cushion, d - 3, p[2], { y: BENCH.sideH + BENCH.seatT, z: 0.5 }, 2))
  g.add(rbox(w - 2 * t + 0.2, BENCH.sideH - 4, 0.6, p[1], { y: 4, z: -d / 2 + 0.3 }, 0.2))
  for (const y of BENCH.tops) g.add(rbox(w - 2 * t + 0.2, t, d - 1.6, p[1], { y: y - t, z: 0.2 }, 0.4))
  g.add(rbox(w - 2 * t + 0.2, BENCH.tops[0] - t, t, p[0], { z: d / 2 - t / 2 - 1 }, 0.4))
  // 中间竖隔板
  g.add(rbox(t, BENCH.sideH - BENCH.tops[0], d - 1.6, p[0], { y: BENCH.tops[0], z: 0.2 }, 0.4))
  return g
}
const BENCH_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL, N.linen]],
  ['nordic', [N.white, N.oakL, N.sage]],
  ['japanese', [J.wood, J.hinoki, J.ai]],
  ['industrial', [I.walnut, shade(I.walnut, 0.08), I.leather]],
  ['cute', [C.woodL, C.white, C.pink]],
]
function benchSurfaces(): Surf[] {
  const xi = BENCH.w / 2 - BENCH.t
  const sh = [rectPoly(-xi, -BENCH.d / 2 + 0.6, -BENCH.t / 2, BENCH.d / 2 - 1), rectPoly(BENCH.t / 2, -BENCH.d / 2 + 0.6, xi, BENCH.d / 2 - 1)]
  return [
    { y: BENCH.tops[0], shape: sh, h: r1(BENCH.tops[1] - BENCH.t - BENCH.tops[0]) },
    { y: BENCH.tops[1], shape: sh, h: r1(BENCH.sideH - BENCH.tops[1]) },
  ]
}

// --- 翻斗鞋柜：每层一个往外翻的斗（关着时前板竖直，打开时绕底边往外倾 30°） ---

const FLIP = { w: 80, d: 30, t: 1.8, tier: 42, a: PI / 6, panelH: 39 }
function flipDims(n: number): Dims {
  return [FLIP.w, r1(FLIP.d + 1.8), n * FLIP.tier + 6 + FLIP.t]
}
const flipFloors = (n: number) => Array.from({ length: n }, (_, i) => 6 + i * FLIP.tier + 1.5)
function flipCab(n: number): Build {
  const [, D, H] = flipDims(n)
  const dz = -(D - FLIP.d) / 2
  const { w, d, t } = FLIP
  return (p) => {
    const g = new THREE.Group()
    for (const s of [-1, 1]) g.add(rbox(t, H, d, p[0], { x: s * (w / 2 - t / 2), z: dz }, 0.5))
    g.add(rbox(w - 2 * t + 0.2, t, d, p[0], { y: H - t, z: dz }, 0.5))
    g.add(rbox(w - 2 * t + 0.2, H - t - 0.4, 0.6, p[1], { y: 0.4, z: dz - d / 2 + 0.3 }, 0.2))
    g.add(rbox(w - 2 * t + 0.2, 6, t, p[0], { z: dz + d / 2 - t / 2 }, 0.4))
    const iw = w - 2 * t - 0.6
    const pivotZ = dz + d / 2
    for (let i = 0; i < n; i++) {
      const yb = 6 + i * FLIP.tier
      // 斗底板
      g.add(rbox(w - 2 * t + 0.2, 1.5, d - 0.6, p[1], { y: yb, z: dz + 0.3 }, 0.3))
      // 翻斗：前板 + 两侧挡板，绕前板底边往外倾
      const fp = G(rbox(iw, FLIP.panelH, 1.8, p[0], { z: 0.9 }, 0.5), rbox(14, 1.2, 0.8, p[2], { y: FLIP.panelH - 5, z: 2.1 }, 0.4))
      for (const s of [-1, 1])
        fp.add(
          sidePlate(
            [
              [-5, 0],
              [0, 0],
              [0, FLIP.panelH * 0.95],
              [-2.5, FLIP.panelH * 0.95],
            ],
            0.8,
            p[1],
            s > 0 ? iw / 2 - 0.8 : -iw / 2,
          ),
        )
      g.add(movable(P(fp, 0, yb + 1.5, pivotZ), { kind: 'flap', angle: FLIP.a }))
    }
    return g
  }
}
function flipSurfaces(n: number): Surf[] {
  const [, D, H] = flipDims(n)
  const dz = -(D - FLIP.d) / 2
  const xi = (FLIP.w - 2 * FLIP.t - 0.6) / 2 - 0.8
  const fl = flipFloors(n)
  return fl.map((y, i) => ({
    y,
    shape: [rectPoly(-xi, dz - FLIP.d / 2 + 0.6, xi, dz + FLIP.d / 2 - 0.3)],
    h: r1((i < n - 1 ? fl[i + 1] - 1.5 : H - FLIP.t) - y),
    inside: true,
  }))
}

// --- 玄关开放格 ---

const CUB = { w: 84, d: 32, t: 1.8, cols: 3, rows: 3, gap: 18.2 }
const CUB_H = CUB.t + CUB.rows * (CUB.gap + CUB.t)
const cubTops = () => Array.from({ length: CUB.rows }, (_, i) => CUB.t + i * (CUB.gap + CUB.t))
const cubColW = (CUB.w - (CUB.cols + 1) * CUB.t) / CUB.cols
function cubby(p: string[]) {
  const { w, d, t } = CUB
  const g = new THREE.Group()
  for (let i = 0; i <= CUB.cols; i++) g.add(rbox(t, CUB_H, d, p[0], { x: -w / 2 + t / 2 + i * (cubColW + t) }, 0.5))
  for (const y of [...cubTops(), CUB_H]) g.add(rbox(w - 2 * t + 0.2, t, d, p[0], { y: y - t }, 0.5))
  g.add(rbox(w - 2 * t + 0.2, CUB_H - 2 * t, 0.6, p[1], { y: t, z: -d / 2 + 0.3 }, 0.2))
  return g
}
function cubSurfaces(): Surf[] {
  const shape = Array.from({ length: CUB.cols }, (_, i) => {
    const x0 = -CUB.w / 2 + CUB.t + i * (cubColW + CUB.t)
    return rectPoly(x0, -CUB.d / 2 + 0.6, x0 + cubColW, CUB.d / 2)
  })
  return cubTops().map((y) => ({ y, shape, h: CUB.gap }))
}

const SHOE_FURNITURE: AssetDef[] = [
  ...RACKS,
  ...CABINETS,
  asset('sb-cab-tall', '窄高鞋柜', 'entrance', [TALL_CAB.w, TALL_CAB.d, TALL_CAB.h], CAB_PALS, openCab(TALL_CAB), { surface: TALL_CAB.h, surfaces: cabSurfaces(TALL_CAB) }),
  asset('sb-cab-boot', '靴柜', 'entrance', [BOOT_CAB.w, BOOT_CAB.d, BOOT_CAB.h], CAB_PALS, openCab(BOOT_CAB), { surface: BOOT_CAB.h, surfaces: cabSurfaces(BOOT_CAB) }),
  asset('sb-bench-cab', '鞋柜长凳', 'entrance', [BENCH.w, BENCH.d, BENCH_H], BENCH_PALS, benchCab, {
    surface: BENCH_H,
    surfaceShape: [rectPoly(-BENCH.w / 2 + 2, -BENCH.d / 2 + 1, BENCH.w / 2 - 2, BENCH.d / 2 - 2)],
    surfaces: benchSurfaces(),
  }),
  ...[2, 3].map((n) => {
    const [w, D, H] = flipDims(n)
    return asset(`sb-flip-cab-${n}`, '翻斗鞋柜', 'entrance', [w, D, H], CAB_PALS, flipCab(n), {
      family: 'sb-flip-cab',
      sizeLabel: `${n} 斗`,
      surface: H,
      surfaceShape: [rectPoly(-w / 2, -D / 2, w / 2, -D / 2 + FLIP.d)],
      surfaces: flipSurfaces(n),
      openable: true,
    })
  }),
  asset('sb-cubby', '玄关开放格', 'entrance', [CUB.w, CUB.d, CUB_H], CAB_PALS, cubby, { surface: CUB_H, surfaces: cubSurfaces() }),
]

// ======================================================================
// 收纳箱 / 收纳柜 / 纸箱
// ======================================================================

const CLOTH = [C.sky, C.pink, C.lemon, C.mint, N.linen, N.blue, M.light, R.mustard, C.lilac, C.peach, N.sage, M.char]

/** 叠好的衣物：在 w × d 区域里码一两摞，从 y 开始，不高于 maxH */
function clothes(w: number, d: number, maxH: number, y: number, seed: number, z = 0) {
  const r = rng(seed)
  const g = new THREE.Group()
  const cols = w > 45 ? 2 : 1
  const cw = w / cols
  for (let c = 0; c < cols; c++) {
    let yy = y
    const x = -w / 2 + cw * (c + 0.5)
    while (true) {
      const th = 2.5 + r() * 2.5
      if (yy + th > y + maxH) break
      const col = CLOTH[Math.floor(r() * CLOTH.length)]
      g.add(rbox(cw - 2 - r() * 2, th - 0.1, d - 2 - r() * 2, col, { x: x + (r() - 0.5), y: yy, z: z + (r() - 0.5) }, Math.min(1.2, th * 0.4)))
      yy += th
    }
  }
  return g
}

/** 一圈口沿（四根条） */
function rimRing(w: number, d: number, y: number, s: number, color: string) {
  return G(
    rbox(w, s, s, color, { y, z: d / 2 - s / 2 }, s * 0.4),
    rbox(w, s, s, color, { y, z: -d / 2 + s / 2 }, s * 0.4),
    rbox(s, s, d - 2 * s + 0.2, color, { x: w / 2 - s / 2, y }, s * 0.4),
    rbox(s, s, d - 2 * s + 0.2, color, { x: -w / 2 + s / 2, y }, s * 0.4),
  )
}

/** 空心方盒（底 + 四壁），可指定材质透明 */
function boxTray(w: number, h: number, d: number, t: number, color: string, alpha = 1) {
  const g = G(
    rbox(w, t, d, color, {}, t * 0.4),
    rbox(w, h, t, color, { z: d / 2 - t / 2 }, t * 0.4),
    rbox(w, h, t, color, { z: -d / 2 + t / 2 }, t * 0.4),
    rbox(t, h, d - 2 * t + 0.1, color, { x: w / 2 - t / 2 }, t * 0.4),
    rbox(t, h, d - 2 * t + 0.1, color, { x: -w / 2 + t / 2 }, t * 0.4),
  )
  return alpha < 1 ? clear(g, color, alpha) : g
}

/** 绕后上沿开合的盖子：lid 在本地 z ∈ [0, d]、y ∈ [0, th] 内；open 时转到 -100°（立在后面） */
function hinged(lid: THREE.Object3D, y: number, zBack: number, open: boolean) {
  return P(G(lid), 0, y, zBack, open ? -PI * 0.555 : 0)
}
/** 开盖后盖子往后伸出的距离 */
const lidBack = (d: number, th: number) => Math.abs(d * Math.cos(PI * 0.555)) + th

// --- 塑料收纳箱 ---

const CLEAR = '#e4f1f7'
interface BoxSpec {
  key: string
  w: number
  d: number
  h: number
}
const PLASTIC: BoxSpec[] = [
  { key: 's', w: 40, d: 30, h: 22 },
  { key: 'm', w: 54, d: 39, h: 29 },
  { key: 'l', w: 74, d: 44, h: 33 },
]
function plasticBox(s: BoxSpec, open: boolean) {
  const lidT = 2.2
  const hb = s.h - lidT
  const bw = s.w - 2.4
  const lb = lidBack(s.d, 1.6)
  const D = open ? s.d + lb : s.d
  const H = open ? hb + s.d * Math.sin(PI * 0.555) + 0.5 : s.h
  const dz = open ? (D - s.d) / 2 : 0
  const build: Build = (p) => {
    const g = new THREE.Group()
    g.add(P(boxTray(bw, hb - 1.4, s.d - 1, 0.5, CLEAR, 0.38), 0, 0, dz))
    g.add(P(rimRing(bw + 0.6, s.d, hb - 1.4, 1.4, p[0]), 0, 0, dz))
    for (const sz of [-1, 1]) g.add(rbox(bw - 4, 0.6, 2, p[0], { y: -0.0, z: dz + sz * (s.d / 2 - 3) }, 0.25))
    g.add(P(clothes(bw - 2, s.d - 3, hb * 0.72, 0.6, s.w + (open ? 1 : 0)), 0, 0, dz))
    const lid = G(rbox(bw + 1.2, 1.6, s.d + 0.2, p[0], { z: (s.d + 0.2) / 2 }, 0.6), rbox(bw - 6, 0.6, s.d - 6, shade(p[0], 0.06), { y: 1.6, z: s.d / 2 }, 0.3))
    g.add(hinged(lid, hb, dz - s.d / 2 - 0.1, open))
    // 侧边卡扣
    for (const sx of [-1, 1]) g.add(rbox(0.8, 3.4, 5, p[1], { x: sx * (bw / 2 + 0.6), y: hb - 3, z: dz }, 0.3))
    return g
  }
  return { build, dims: [s.w, r1(D), r1(H)] as Dims }
}
const PLASTIC_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.gray]],
  ['nordic', [N.gray, N.white, N.blue]],
  ['cute', [C.sky, C.white, C.pink]],
  ['modern', [M.char, M.gray, M.black]],
]

// --- 床底收纳箱 ---

interface UnderSpec {
  key: string
  label: string
  w: number
  d: number
  h: number
  wheels: boolean
}
const UNDER: UnderSpec[] = [
  { key: 's', label: 'S · 拉手', w: 60, d: 40, h: 15 },
  { key: 'm', label: 'M · 滚轮', w: 80, d: 45, h: 16.5 },
  { key: 'l', label: 'L · 滚轮', w: 100, d: 55, h: 17.5 },
].map((x, i) => ({ ...x, wheels: i > 0 }))
function underBed(s: UnderSpec): Build {
  return (p) => {
    const g = new THREE.Group()
    const y0 = s.wheels ? 1.6 : 0.3
    const lidT = 1.4
    const hb = s.h - y0 - lidT
    g.add(P(boxTray(s.w - 1.2, hb - 1.2, s.d - 1.2, 0.5, CLEAR, 0.38), 0, y0, 0))
    g.add(rimRing(s.w, s.d, y0 + hb - 1.2, 1.2, p[0]))
    g.add(clothes(s.w - 4, s.d - 4, hb - 2.4, y0 + 0.5, s.w))
    g.add(rbox(s.w + 0.2, lidT, s.d + 0.2, p[0], { y: y0 + hb }, 0.5))
    g.add(rbox(s.w - 10, 0.4, s.d - 10, shade(p[0], 0.06), { y: y0 + hb + lidT - 0.1 }, 0.2))
    // 正面拉手
    g.add(holePanel(14, 3.4, 1, p[1], [{ kind: 'rect', x: 0, y: 0.8, w: 10, h: 1.6, r: 0.8 }], { y: y0 + hb - 4.8, z: s.d / 2 + 0.5 }, 1))
    if (s.wheels) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(cylX(1.6, 1.2, M.char, sx * (s.w / 2 - 6), 1.6, sz * (s.d / 2 - 5)))
      g.add(rbox(2.4, 1.2, 3, p[1], { x: sx * (s.w / 2 - 6), y: 1.4, z: sz * (s.d / 2 - 5) }, 0.3))
    }
    else for (const sx of [-1, 1]) g.add(rbox(4, 0.4, s.d - 6, p[1], { x: sx * (s.w / 2 - 6) }, 0.15))
    return g
  }
}

// --- 布艺收纳箱（可折叠） ---

function fabricBox(w: number, d: number, h: number): Build {
  return (p) => {
    const g = new THREE.Group()
    const hole = { kind: 'rect' as const, x: 0, y: h - 6, w: 9, h: 2.6, r: 1.3 }
    g.add(shell(w, h, d, 0.8, p[0], { top: false, left: [hole], right: [hole] }))
    g.add(rimRing(w + 0.4, d + 0.4, h - 1, 1.3, p[1])) // 包边比箱壁高出 0.3，避免顶面共面闪烁
    // 把手洞包边
    for (const sx of [-1, 1]) g.add(rbox(0.4, 3.6, 10, p[1], { x: sx * (w / 2 + 0.25), y: h - 6.5 }, 0.2))
    g.add(holePanel(10, 3.6, 0.4, p[1], [{ kind: 'rect', x: 0, y: 0.5, w: 9, h: 2.6, r: 1.3 }], { x: w / 2 + 0.45, y: h - 6.5, ry: PI / 2 }, 1))
    g.add(holePanel(10, 3.6, 0.4, p[1], [{ kind: 'rect', x: 0, y: 0.5, w: 9, h: 2.6, r: 1.3 }], { x: -w / 2 - 0.45, y: h - 6.5, ry: -PI / 2 }, 1))
    // 里面：卷起的毛巾
    const r = rng(Math.round(w + h))
    for (let i = 0; i < 4; i++) {
      const rr = Math.min(3.6, (h - 3) / 4)
      const m = capsule(rr, d - 4 - 2 * rr, CLOTH[(i * 3 + Math.floor(r() * 2)) % CLOTH.length]) // 颜色错开，不会随机到一排深色
      g.add(P(m, -w / 2 + 5 + (i * (w - 10)) / 3, 0.8 + rr, 0, PI / 2))
    }
    return g
  }
}

// --- 木箱 ---

function woodCrate(p: string[]) {
  const w = 42
  const d = 30
  const h = 26
  const g = new THREE.Group()
  const sl = 1.4
  // 端板（带把手洞）
  for (const sx of [-1, 1]) g.add(holePanel(d, h, 1.6, p[0], [{ kind: 'rect', x: 0, y: h - 6, w: 10, h: 3, r: 1.5 }], { x: sx * (w / 2 - 0.8), ry: PI / 2 }, 0.8))
  // 长边横条，中间留缝
  for (const sz of [-1, 1]) for (const y of [0.6, 9.4, 18.2]) g.add(rbox(w - 3.2 + 0.2, 7, sl, p[1], { y, z: sz * (d / 2 - sl / 2) }, 0.4))
  // 底条
  for (let i = 0; i < 4; i++) g.add(rbox(w - 3.2 + 0.2, 1.2, (d - 4) / 4 - 1, p[1], { y: 0.6, z: -d / 2 + 2 + ((d - 4) / 4) * (i + 0.5) }, 0.3))
  // 里面几本书 + 一卷布
  const bk = [C.sky, C.red, N.sage, R.mustard]
  for (let i = 0; i < 4; i++) g.add(rbox(3, 18 - i, 14, bk[i], { x: -12 + i * 3.4, y: 1.8, z: 0 }, 0.4))
  g.add(P(capsule(4, 12, CLOTH[4]), 8, 5.8, 0, PI / 2))
  return g
}

// --- 藤编收纳箱 ---

function rattanBox(open: boolean) {
  const w = 40
  const d = 30
  const hb = 22
  const lb = lidBack(d, 3)
  const D = open ? d + lb : d
  const dz = open ? (D - d) / 2 : 0
  const H = open ? hb + d * Math.sin(PI * 0.555) + 1 : hb + 5.5
  const build: Build = (p) => {
    const g = new THREE.Group()
    const body = new THREE.Group()
    body.add(rbox(w - 1, 1.2, d - 1, p[1], {}, 0.4))
    const n = 11
    const bh = (hb - 1) / n
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? p[0] : shade(p[0], -0.06)
      const inset = i % 2 ? 0.15 : 0
      body.add(rimRing(w - inset * 2, d - inset * 2, 1 + i * bh, bh, c))
    }
    body.add(rimRing(w + 0.6, d + 0.6, hb - 1.4, 1.6, p[1]))
    for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) body.add(cyl(0.3, 0.3, hb - 1.6, p[1], { x: -w / 2 + 6 + i * ((w - 12) / 3), y: 0.4, z: sz * (d / 2 + 0.1) }, 6))
    body.add(clothes(w - 6, d - 6, hb * 0.65, 1.2, 77))
    g.add(P(body, 0, 0, dz))
    const lid = G(rbox(w + 1.2, 2, d + 1.2, p[0], { z: (d + 1.4) / 2 }, 0.8), rimRing(w + 1.8, d + 1.8, -0.15, 2.45, p[1]).translateZ((d + 1.4) / 2))
    lid.add(P(torus(3, 0.5, p[2], {}, PI), 0, 2, (d + 1.4) / 2, 0, 0, 0))
    g.add(hinged(lid, hb, dz - d / 2 - 0.7, open))
    return g
  }
  return { build, dims: [w + 1.8, r1(D + (open ? 0.9 : 1.8)), r1(H)] as Dims }
}

// --- 金属工具箱 ---

function toolbox(open: boolean) {
  const w = 46
  const d = 20
  const hb = 14
  const lidT = 5
  const lb = lidBack(d, lidT)
  const D = open ? d + lb + 0.5 : d + 1
  const dz = open ? (D - d) / 2 : 0
  const H = open ? hb + d * Math.sin(PI * 0.555) + 1 : hb + lidT + 4.2
  const build: Build = (p) => {
    const g = new THREE.Group()
    const body = G(boxTray(w, hb, d, 0.6, p[0]))
    for (const sx of [-1, 1]) body.add(rbox(3, 2, 1, M.silver, { x: sx * 14, y: hb - 3, z: d / 2 + 0.3 }, 0.3))
    if (open) {
      // 上层托盘 + 工具
      body.add(boxTray(w - 2, 4, d - 2, 0.4, p[1]).translateY(hb - 4.5))
      body.add(P(cyl(0.5, 0.5, 14, M.silver, {}, 8), -8, hb - 3, -3, 0, 0, PI / 2))
      body.add(P(capsule(1.1, 6, p[2]), -18, hb - 3, -3, 0, 0, PI / 2))
      body.add(rbox(16, 0.8, 2, M.silver, { x: 6, y: hb - 4, z: 3 }, 0.3))
      body.add(cyl(2.2, 2.2, 1, M.char, { x: 14, y: hb - 4, z: -3 }, 16))
      for (let i = 0; i < 5; i++) body.add(cyl(0.6, 0.6, 1.4, M.silver, { x: -16 + i * 2, y: hb - 4, z: 4 }, 6))
    } else body.add(boxTray(w - 2, 4, d - 2, 0.4, p[1]).translateY(hb - 4.5))
    g.add(P(body, 0, 0, dz))
    // 盖子：外壳朝下扣（开盖后翻到后面立着）
    const lid = new THREE.Group()
    const shellLid = boxTray(w + 0.4, lidT, d + 0.4, 0.6, p[0])
    shellLid.rotation.x = PI
    shellLid.position.set(0, lidT, (d + 0.4) / 2)
    lid.add(shellLid)
    if (!open) {
      lid.add(P(G(cylX(0.7, 16, p[2], 0, 3.4, 0), cyl(0.6, 0.6, 3.4, M.silver, { x: -8 }, 8), cyl(0.6, 0.6, 3.4, M.silver, { x: 8 }, 8)), 0, lidT, (d + 0.4) / 2))
    }
    g.add(hinged(lid, hb, dz - d / 2 - 0.2, open))
    return g
  }
  return { build, dims: [w + 0.4, r1(D), r1(H)] as Dims }
}

// --- 衣物压缩袋 ---

function vacBag(puffy: boolean): Build {
  return (p) => {
    const w = 60
    const d = 45
    const h = puffy ? 18 : 6
    const g = new THREE.Group()
    g.add(clothes(w - 6, d - 6, h - 2.5, 0.8, puffy ? 31 : 32))
    g.add(clear(rbox(w, h, d, p[0], {}, puffy ? 7 : 2.5), p[0], 0.32))
    g.add(rbox(w - 4, 0.6, 1.2, p[1], { y: h - (puffy ? 2.4 : 0.9), z: d / 2 - 4 }, 0.25))
    g.add(cyl(3, 3, 0.8, p[2], { y: h - 0.3, x: 12 }, 20), cyl(1.6, 1.6, 1, p[1], { y: h + 0.3, x: 12 }, 16))
    return g
  }
}

// --- 抽屉式收纳柜（半透明） ---

const DRAWER = { w: 40, d: 45, unit: 20.5, base: 4 }
const drawerH = (n: number) => DRAWER.base + n * DRAWER.unit + 2
/** 每层抽屉：抽屉盒底面 y、净高 dh、内宽 dw；抽屉里码着的衣服最多到 clothH（抽屉格在衣服上面） */
const drawerRow = (i: number) => {
  const y = DRAWER.base + 0.8 + i * DRAWER.unit
  const dh = DRAWER.unit - 1.6
  return { y, dh, dw: DRAWER.w - 3.4, clothH: r1(dh * 0.4) }
}
const DRAWER_PULL = Math.round(DRAWER.d * 0.6)
function drawerCab(n: number): Build {
  return (p) => {
    const { w, d, base } = DRAWER
    const g = new THREE.Group()
    const H = drawerH(n)
    for (const sx of [-1, 1]) {
      g.add(rbox(1.5, H - base, d, p[0], { x: sx * (w / 2 - 0.75), y: base }, 0.4))
      for (const sz of [-1, 1]) g.add(cyl(1.4, 1.4, 2, M.char, { x: sx * (w / 2 - 3), y: 0, z: sz * (d / 2 - 4) }, 12), rbox(3, 1, 3, p[0], { x: sx * (w / 2 - 3), y: 2.6, z: sz * (d / 2 - 4) }, 0.3))
    }
    g.add(rbox(w, 1.2, d, p[0], { y: base - 0.4 }, 0.4))
    g.add(rbox(w, 2, d, p[0], { y: H - 2 }, 0.6))
    g.add(rbox(w - 2.8, H - base - 2, 0.6, p[0], { y: base + 0.6, z: -d / 2 + 0.3 }, 0.2))
    for (let i = 0; i < n; i++) {
      const { y, dh, dw, clothH } = drawerRow(i)
      if (i > 0) g.add(rbox(w - 2.8, 0.6, d - 2, p[0], { y: y - 0.7, z: 0 }, 0.2))
      // 抽屉（盒 + 面板 + 拉手 + 里面的衣服）整个往前拉出
      const dr = G(
        P(boxTray(dw, dh, d - 3, 0.5, CLEAR, 0.4), 0, 0, 0.2),
        clear(rbox(dw + 0.8, dh + 0.4, 0.6, p[1], { y: -0.1, z: d / 2 - 1.2 }, 0.3), p[1], 0.5),
        rbox(14, 2, 1.2, p[0], { y: dh - 4, z: d / 2 - 0.4 }, 0.5),
        clothes(dw - 2, d - 6, clothH, 0.5, 10 + i * 3 + n),
      )
      g.add(movable(P(dr, 0, y, 0), { kind: 'drawer', dz: DRAWER_PULL }))
    }
    return g
  }
}
/** 抽屉格：衣服上面还能放的空间，跟着抽屉拉出 */
function drawerCabSurfaces(n: number): Surf[] {
  return Array.from({ length: n }, (_, i) => {
    const { y, dh, dw, clothH } = drawerRow(i)
    const z0 = 0.2 - (DRAWER.d - 3) / 2 + 0.6
    const z1 = 0.2 + (DRAWER.d - 3) / 2 - 0.6
    return { y: r1(y + 0.5 + clothH), h: r1(dh - 0.5 - clothH - 0.3), shape: [rectPoly(-dw / 2 + 0.6, z0, dw / 2 - 0.6, z1)], inside: true, slide: DRAWER_PULL }
  })
}
const DRAWER_PALS: Pal[] = [
  ['modern', [M.white, '#eef3f6', M.light]],
  ['nordic', [N.white, N.linen, N.gray]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['modern', [M.char, M.light, M.gray]],
]

// --- 双门收纳柜 ---

const DOOR_CAB: Cab = { w: 60, d: 40, h: 90, t: 1.8, tops: [6.8, 32.8, 58.8] }

// --- 衣柜内收纳盒 ---

function closetGrid(p: string[]) {
  const w = 32
  const d = 32
  const h = 11
  const g = G(boxTray(w, h - 0.3, d, 0.8, p[0]), rimRing(w + 0.3, d + 0.3, h - 0.9, 0.9, p[1])) // 盒壁略低于包边，顶面不共面
  for (let i = 1; i < 4; i++) {
    g.add(rbox(0.5, h - 1.6, d - 1.6, p[1], { x: -w / 2 + i * (w / 4), y: 0.8 }, 0.15))
    g.add(rbox(w - 1.6, h - 1.6, 0.5, p[1], { y: 0.8, z: -d / 2 + i * (d / 4) }, 0.15))
  }
  // 卷好的袜子 / 内衣：每格一卷、按列配色，整整齐齐
  for (let ix = 0; ix < 4; ix++)
    for (let iz = 0; iz < 4; iz++) {
      const col = CLOTH[(ix * 2 + (iz % 2)) % CLOTH.length]
      g.add(P(capsule(2.4, 1.6, col), -w / 2 + (ix + 0.5) * (w / 4), 0.8 + 2.4, -d / 2 + (iz + 0.5) * (d / 4), PI / 2))
    }
  return g
}
function closetLong(p: string[]) {
  const w = 15
  const d = 32
  const h = 12
  const g = G(boxTray(w, h - 0.3, d, 0.8, p[0]), rimRing(w + 0.3, d + 0.3, h - 0.9, 0.9, p[1])) // 盒壁略低于包边，顶面不共面
  g.add(holePanel(5, 3, 0.5, p[1], [{ kind: 'rect', x: 0, y: 0.8, w: 3, h: 1.4, r: 0.7 }], { y: h - 4, z: d / 2 + 0.3 }, 0.8))
  g.add(clothes(w - 1, d - 2, h - 2, 0.8, 8))
  return g
}
const CLOSET_PALS: Pal[] = [
  ['nordic', [N.linen, N.gray, N.white]],
  ['modern', [M.gray, M.char, M.light]],
  ['cute', [C.sakura, C.pink, WHITE]],
  ['japanese', [J.washi, J.ai, J.hinoki]],
]

// --- 纸箱 ---

function drawFragile(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#d23a2e'
  g.lineWidth = Math.max(2, H * 0.06)
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth)
  g.fillStyle = '#d23a2e'
  // 酒杯
  const cx = W * 0.2
  g.beginPath()
  g.moveTo(cx - H * 0.14, H * 0.18)
  g.lineTo(cx + H * 0.14, H * 0.18)
  g.quadraticCurveTo(cx + H * 0.14, H * 0.5, cx, H * 0.52)
  g.quadraticCurveTo(cx - H * 0.14, H * 0.5, cx - H * 0.14, H * 0.18)
  g.fill()
  g.fillRect(cx - H * 0.02, H * 0.5, H * 0.04, H * 0.24)
  g.fillRect(cx - H * 0.11, H * 0.72, H * 0.22, H * 0.05)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `bold ${Math.round(H * 0.3)}px sans-serif`
  g.fillText('こわれもの', W * 0.6, H * 0.4)
  g.font = `bold ${Math.round(H * 0.16)}px sans-serif`
  g.fillText('FRAGILE · 取扱注意', W * 0.6, H * 0.74)
}
function drawUp(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#2b2b2b'
  for (const x of [0.3, 0.7]) {
    g.beginPath()
    g.moveTo(W * x, H * 0.08)
    g.lineTo(W * x + H * 0.13, H * 0.26)
    g.lineTo(W * x - H * 0.13, H * 0.26)
    g.fill()
    g.fillRect(W * x - H * 0.04, H * 0.25, H * 0.08, H * 0.22)
  }
  g.fillRect(W * 0.15, H * 0.5, W * 0.7, Math.max(2, H * 0.03))
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `bold ${Math.round(H * 0.13)}px sans-serif`
  g.fillText('THIS SIDE UP', W / 2, H * 0.66)
  g.font = `bold ${Math.round(H * 0.15)}px sans-serif`
  g.fillText('天地無用', W / 2, H * 0.85)
}
function drawLabel(text: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = '#fbf8f0'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#e5dfd2'
    g.fillRect(0, 0, W, H * 0.22)
    g.fillStyle = '#7a6a58'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `${Math.round(H * 0.15)}px sans-serif`
    g.fillText('MOVING · 引越し', W / 2, H * 0.12)
    g.fillStyle = '#26324a'
    g.font = `bold ${Math.round(H * 0.38)}px sans-serif`
    g.fillText(text, W / 2, H * 0.6)
  }
}

interface CartonOpt {
  marks?: boolean
  label?: string
}
/** 封好的纸箱：本体 + 顶面中缝 + 胶带（翻下两侧）+ 侧面标记 */
function carton(w: number, d: number, h: number, p: string[], o: CartonOpt = {}) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, p[0], {}, 0.5))
  const tw = Math.min(5, w * 0.14)
  g.add(rbox(tw, 0.3, d + 0.6, p[1], { y: h }, 0.1))
  for (const sz of [-1, 1]) g.add(rbox(tw, Math.min(7, h * 0.3), 0.3, p[1], { y: h - Math.min(7, h * 0.3), z: sz * (d / 2 + 0.15) }, 0.1))
  // 顶面中缝（胶带两侧露出的缝）
  for (const sx of [-1, 1]) g.add(rbox((w - tw) / 2 - 0.8, 0.31, 0.25, shade(p[0], -0.18), { x: sx * ((w - tw) / 4 + tw / 4), y: h - 0.01 }, 0.05))
  if (o.marks && !o.label) {
    const fw = Math.min(w * 0.55, 22)
    g.add(paintPanel(fw, fw * 0.4, 'sb-fragile', drawFragile, { x: -w * 0.12, y: h * 0.18, z: d / 2 + 0.32 }))
  }
  if (o.marks) {
    const sw = Math.min(d * 0.55, 16)
    g.add(paintPanel(sw, sw * 0.8, 'sb-up', drawUp, { x: w / 2 + 0.32, y: h * 0.3, ry: PI / 2 }))
  }
  if (o.label) {
    const lw = Math.min(w * 0.5, 20)
    g.add(paintPanel(lw, lw * 0.55, `sb-label-${o.label}`, drawLabel(o.label), { x: w * 0.1, y: h * 0.35, z: d / 2 + 0.32 }))
  }
  return g
}

const CARTONS: { key: string; w: number; d: number; h: number }[] = [
  { key: 's', w: 30, d: 22, h: 18 },
  { key: 'm', w: 40, d: 30, h: 28 },
  { key: 'l', w: 50, d: 38, h: 36 },
  { key: 'xl', w: 60, d: 45, h: 45 },
]

/** 打开的纸箱：盖片向外翻，里面有书和揉成团的报纸 */
const OPEN_C = { w: 40, d: 30, h: 28, flap: 14, droop: 0.35 }
function openCarton(p: string[]) {
  const { w, d, h, flap, droop } = OPEN_C
  const g = new THREE.Group()
  g.add(shell(w, h, d, 0.5, p[0], { top: false }))
  const flapAt = (len: number, x: number, z: number, ry: number) => {
    const f = P(G(rbox(len - 0.4, 0.4, flap, p[0], { z: flap / 2 }, 0.15)), 0, 0, 0, droop)
    return P(G(f), x, h - 0.3, z, 0, ry)
  }
  g.add(flapAt(w, 0, d / 2, 0), flapAt(w, 0, -d / 2, PI), flapAt(d, w / 2, 0, PI / 2), flapAt(d, -w / 2, 0, -PI / 2))
  // 胶带残片
  for (const sz of [-1, 1]) g.add(rbox(5, 5, 0.3, p[1], { y: h - 5.2, z: sz * (d / 2 + 0.15) }, 0.1))
  const bk = [N.blue, C.red, R.mustard, N.sage, M.char]
  for (let i = 0; i < 5; i++) g.add(rbox(3, 20 - (i % 3) * 2, 15, bk[i], { x: -15 + i * 3.4, y: 0.5, z: -4 }, 0.4))
  for (const [x, y, z, r] of [
    [6, 4, 2, 4],
    [12, 4, -5, 3.8],
    [9, 10, -2, 3.6],
    [14, 3.5, 7, 3.4],
    [3, 3.5, 9, 3.2],
  ]) g.add(ball(r, '#ece7dc', { x, y: y + 0.5, z }, [1, 0.85, 1]))
  return g
}
const openCartonDims = (): Dims => {
  const o = OPEN_C.flap * Math.cos(OPEN_C.droop) + 0.4
  return [r1(OPEN_C.w + 2 * o), r1(OPEN_C.d + 2 * o), OPEN_C.h]
}

/** 压扁的纸箱捆 */
function flatBundle(p: string[]) {
  const g = new THREE.Group()
  const r = rng(9)
  const n = 6
  for (let i = 0; i < n; i++) g.add(rbox(68 - r() * 4, 0.55, 48 - r() * 4, i % 2 ? p[0] : shade(p[0], -0.05), { x: (r() - 0.5) * 2, y: i * 0.6, z: (r() - 0.5) * 2 }, 0.2))
  const top = n * 0.6
  for (const x of [-18, 18]) {
    g.add(rbox(0.5, 0.25, 48.4, p[2], { x, y: top }, 0.1))
    for (const sz of [-1, 1]) g.add(rbox(0.5, top, 0.25, p[2], { x, z: sz * 24.2 }, 0.1))
  }
  g.add(rbox(70.4, 0.25, 0.5, p[2], { y: top + 0.25 }, 0.1))
  g.add(ball(0.8, p[2], { y: top + 0.6 }))
  return g
}

/** 搬家纸箱堆 */
const STACK_LABELS = ['キッチン', '本・書類', '衣類']
function cartonStack(n: number): Build {
  return (p) => {
    const g = new THREE.Group()
    const sizes = [
      [50, 38, 34],
      [48, 36, 30],
      [40, 30, 26],
    ]
    let y = 0
    for (let i = 0; i < n; i++) {
      const [w, d, h] = sizes[i]
      const b = carton(w, d, h, p, { label: STACK_LABELS[i], marks: i === 0 })
      g.add(P(b, (i % 2 ? 1.5 : -1) * (i ? 1 : 0), y, i ? 1 : 0, 0, i ? (i % 2 ? 0.05 : -0.04) : 0))
      y += h + 0.3
    }
    return g
  }
}

const CARTON_PALS: Pal[] = [
  ['industrial', [KRAFT, TAPE, '#e8dcc6']],
  ['nordic', ['#d8b98f', '#f2ede2', N.linen]],
  ['modern', ['#e9e6df', '#c9cdd2', M.gray]],
  ['retro', ['#b98a55', '#7fb4c9', R.cream]],
]
const BOX_PALS: Pal[] = [
  ['nordic', [N.linen, N.gray, N.oak]],
  ['modern', [M.light, M.char, M.gray]],
  ['japanese', [J.washi, J.ai, J.wood]],
  ['cute', [C.sakura, C.pink, C.woodL]],
  ['industrial', [I.concrete, I.leather, I.iron]],
]
const CRATE_PALS: Pal[] = [
  ['nordic', [N.oakL, N.oak]],
  ['industrial', [I.walnut, shade(I.walnut, 0.08)]],
  ['japanese', [J.hinoki, J.hinoki]],
  ['retro', [R.caramel, shade(R.caramel, 0.1)]],
]
const RATTAN_PALS: Pal[] = [
  ['japanese', ['#c9a46a', '#8d6a3e', '#6e4f37']],
  ['nordic', ['#e2cfa6', '#b99a6a', N.oak]],
  ['retro', ['#b77d43', '#7a4f2a', R.caramel]],
  ['modern', ['#7a6656', '#4a3d33', M.char]],
]
const TOOL_PALS: Pal[] = [
  ['retro', [R.red, M.char, R.mustard]],
  ['industrial', [I.iron, I.steel, I.rust]],
  ['nordic', [N.blue, N.gray, N.mustard]],
  ['modern', [M.char, M.gray, M.black]],
]
const BAG_PALS: Pal[] = [
  ['modern', ['#dfeef5', M.gray, M.white]],
  ['nordic', ['#e6efe9', N.sage, N.white]],
  ['cute', ['#f6e6ef', C.pink, WHITE]],
  ['modern', ['#e9edf2', M.char, M.light]],
]
const UNDER_PALS: Pal[] = [
  ['modern', [M.white, M.gray]],
  ['nordic', [N.gray, N.white]],
  ['cute', [C.mint, C.white]],
  ['modern', [M.char, M.gray]],
]

const PLASTIC_LABEL: Record<string, string> = { s: 'S', m: 'M', l: 'L（衣装ケース）' }
const BOXES: AssetDef[] = [
  ...PLASTIC.flatMap((s) =>
    [false, true].map((open) => {
      const m = plasticBox(s, open)
      return asset(`sb-plastic-box-${s.key}-${open ? 'open' : 'closed'}`, '塑料收纳箱', 'storage', m.dims, PLASTIC_PALS, m.build, {
        family: 'sb-plastic-box',
        sizeLabel: PLASTIC_LABEL[s.key],
        form: open ? 'open' : 'closed',
        prop: true,
      })
    }),
  ),
  ...UNDER.map((s) =>
    asset(`sb-underbed-${s.key}`, '床底收纳箱', 'storage', [s.w + 0.2, s.d + 1.2, s.h], UNDER_PALS, underBed(s), { family: 'sb-underbed', sizeLabel: s.label, prop: true }),
  ),
  ...(
    [
      ['std', '标准', 38, 26, 25],
      ['low', '浅型', 38, 26, 16],
    ] as const
  ).map(([k, label, w, d, h]) => asset(`sb-fabric-box-${k}`, '布艺收纳箱', 'storage', [w + 1, d + 0.4, h + 0.2], BOX_PALS, fabricBox(w, d, h), { family: 'sb-fabric-box', sizeLabel: label, prop: true })),
  asset('sb-wood-crate', '木箱', 'storage', [42, 30, 26], CRATE_PALS, woodCrate, { prop: true }),
  ...[false, true].map((open) => {
    const m = rattanBox(open)
    return asset(`sb-rattan-box-${open ? 'open' : 'closed'}`, '藤编收纳箱', 'storage', m.dims, RATTAN_PALS, m.build, { family: 'sb-rattan-box', form: open ? 'open' : 'closed', prop: true })
  }),
  ...[false, true].map((open) => {
    const m = toolbox(open)
    return asset(`sb-toolbox-${open ? 'open' : 'closed'}`, '金属工具箱', 'storage', m.dims, TOOL_PALS, m.build, { family: 'sb-toolbox', form: open ? 'open' : 'closed', prop: true })
  }),
  ...[true, false].map((puffy) =>
    asset(`sb-vac-bag-${puffy ? 'puffy' : 'flat'}`, '衣物压缩袋', 'storage', [60, 45, puffy ? 19.1 : 7.1], BAG_PALS, vacBag(puffy), {
      family: 'sb-vac-bag',
      form: puffy ? 'open' : 'closed',
      prop: true,
    }),
  ),
  ...[3, 4, 5].map((n) =>
    asset(`sb-drawer-cab-${n}`, '半透明抽屉柜', 'storage', [DRAWER.w, DRAWER.d, drawerH(n)], DRAWER_PALS, drawerCab(n), {
      family: 'sb-drawer-cab',
      sizeLabel: `${n} 层`,
      surface: drawerH(n),
      surfaces: drawerCabSurfaces(n),
      openable: true,
    }),
  ),
  doorCabDef('sb-door-cab-closed', '双门收纳柜', DOOR_CAB, 'solid', CAB_PALS, 'storage', { family: 'sb-door-cab' }),
  asset('sb-closet-box-grid', '衣柜内收纳盒', 'storage', [32.3, 32.3, 11], CLOSET_PALS, closetGrid, { family: 'sb-closet-box', sizeLabel: '16 格', prop: true }),
  asset('sb-closet-box-long', '衣柜内收纳盒', 'storage', [15.3, 32.8, 12], CLOSET_PALS, closetLong, { family: 'sb-closet-box', sizeLabel: '长条', prop: true }),
  ...CARTONS.map((c) =>
    asset(`sb-carton-${c.key}`, '快递纸箱', 'storage', [c.w + 0.7, c.d + 0.7, c.h + 0.3], CARTON_PALS, (p) => carton(c.w, c.d, c.h, p, { marks: true }), {
      family: 'sb-carton',
      sizeLabel: c.key.toUpperCase(),
      form: 'closed',
      prop: true,
    }),
  ),
  asset('sb-carton-open', '快递纸箱', 'storage', openCartonDims(), CARTON_PALS, openCarton, { family: 'sb-carton', sizeLabel: 'M', form: 'open', prop: true }),
  asset('sb-carton-flat', '压扁的纸箱捆', 'storage', [71, 50, 4.4], CARTON_PALS, flatBundle, { form: 'lying', prop: true }),
  ...[2, 3].map((n) =>
    asset(`sb-carton-stack-${n}`, '搬家纸箱堆', 'storage', [51.5, 39.5, n === 2 ? 64.6 : 90.9], CARTON_PALS, cartonStack(n), { family: 'sb-carton-stack', sizeLabel: `${n} 箱`, form: 'stacked', prop: true }),
  ),
]

export const SHOES_BOXES: AssetDef[] = [...SHOES, ...SHOE_FURNITURE, ...BOXES]
