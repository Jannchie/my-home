// 花纹生成：把几种颜色「织」成可平铺的花纹贴图（波点、条纹、格子、和柄、拼布…）。
// 纯 Canvas 2D 实现，无依赖。每个绘制函数在 [0,S]² 画一个可无缝平铺的单元：
//  - 散布图形（波点、樱花…）用 wrapAt 在跨边界时到对边补画；
//  - 晶格图形（麻叶、龟甲、青海波…）的晶格周期与单元严格对齐，直接画到单元外一圈再由画布裁掉。

export type PatternKind =
  | 'dots'
  | 'stripes'
  | 'gingham'
  | 'tartan'
  | 'houndstooth'
  | 'chevron'
  | 'argyle'
  | 'ichimatsu'
  | 'asanoha'
  | 'seigaiha'
  | 'shippo'
  | 'kikko'
  | 'yagasuri'
  | 'uroko'
  | 'sakura'
  | 'flowers'
  | 'hearts'
  | 'stars'
  | 'patchwork'
  | 'huiwen'
  | 'damask'

export interface PatternSpec {
  kind: PatternKind
  /** [底色, 花色 1, 花色 2, …]，至少 2 个 */
  colors: string[]
  /** 一个花纹单元在模型上的实际尺寸（cm） */
  scale: number
  /** 条纹 / 斜纹方向 */
  angle?: 0 | 45 | 90
  /** 密度 / 粗细 0–1（波点大小、条纹宽度、线条粗细） */
  density?: number
  /** 随机种子（拼布、碎花的排布） */
  seed?: number
  /** 拼布：素色布片的比例 0–1 */
  plainRatio?: number
  /** 拼布：一个单元里每边几块布片（2–8） */
  pieces?: number
}

type Group = '基础' | '和柄' | '纹样' | '可爱' | '拼布'

export const PATTERN_KINDS: { id: PatternKind; label: string; group: Group }[] = [
  { id: 'dots', label: '波点', group: '基础' },
  { id: 'stripes', label: '条纹', group: '基础' },
  { id: 'gingham', label: '格纹', group: '基础' },
  { id: 'tartan', label: '苏格兰格', group: '基础' },
  { id: 'houndstooth', label: '千鸟格', group: '基础' },
  { id: 'chevron', label: '锯齿纹', group: '基础' },
  { id: 'argyle', label: '菱格', group: '基础' },
  { id: 'ichimatsu', label: '市松', group: '和柄' },
  { id: 'asanoha', label: '麻叶', group: '和柄' },
  { id: 'seigaiha', label: '青海波', group: '和柄' },
  { id: 'shippo', label: '七宝', group: '和柄' },
  { id: 'kikko', label: '龟甲', group: '和柄' },
  { id: 'yagasuri', label: '矢絣', group: '和柄' },
  { id: 'uroko', label: '鳞', group: '和柄' },
  { id: 'huiwen', label: '回纹', group: '纹样' },
  { id: 'damask', label: '大马士革', group: '纹样' },
  { id: 'sakura', label: '樱花', group: '可爱' },
  { id: 'flowers', label: '碎花', group: '可爱' },
  { id: 'hearts', label: '爱心', group: '可爱' },
  { id: 'stars', label: '星星', group: '可爱' },
  { id: 'patchwork', label: '拼布', group: '拼布' },
]

// ───────────────────────── 工具 ─────────────────────────

/** mulberry32：小而确定的随机数 */
function rng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const mod = (a: number, n: number) => ((a % n) + n) % n
/** 不超过 k 且能整除 n 的最大数：按晶格下标循环取色时保证周期对齐 */
function cyc(n: number, k: number): number {
  for (let m = Math.min(n, Math.max(1, k)); m > 1; m--) if (n % m === 0) return m
  return 1
}

type RGB = [number, number, number]

function parseColor(c: string): RGB | null {
  const s = c.trim().toLowerCase()
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    let h = m[1]!
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((x) => x + x).join('')
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    return null
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (m) {
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map((x) => parseFloat(x))
    if (p.length >= 3 && p.slice(0, 3).every((x) => Number.isFinite(x))) return [p[0]!, p[1]!, p[2]!]
  }
  return null
}

const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')

function rgbOf(c: string): RGB {
  return parseColor(c) ?? [128, 128, 128]
}

function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a)
  const y = rgbOf(b)
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** t>0 提亮（混白），t<0 压暗（混深靛色，比纯黑更柔和） */
function shade(c: string, t: number): string {
  return t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#1d1a26', -t)
}

function luminance(c: string): number {
  const p = parseColor(c)
  if (!p) return 0.5
  return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255
}

/** 绘制上下文：S 为单元边长（像素），所有花纹都画在 [0,S]² 内 */
interface P {
  c: CanvasRenderingContext2D
  S: number
  base: string
  inks: string[]
  d: number
  angle: 0 | 45 | 90
  seed: number
  /** 拼布子花纹：底色已由外部铺好，不要再整块铺底 */
  noBg?: boolean
  spec: PatternSpec
}

const ink = (p: P, i: number) => p.inks[mod(i, p.inks.length)]!

function bg(p: P, color = p.base) {
  if (p.noBg && color === p.base) return
  p.c.fillStyle = color
  p.c.fillRect(0, 0, p.S, p.S)
}

/** 以 (x,y) 为中心、半径 r 的图形：在单元内画一次，跨边界时到对边补画 */
function wrapAt(p: P, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  const S = p.S
  for (const dx of [-S, 0, S]) {
    const xx = x + dx
    if (xx + r < 0 || xx - r > S) continue
    for (const dy of [-S, 0, S]) {
      const yy = y + dy
      if (yy + r < 0 || yy - r > S) continue
      draw(xx, yy)
    }
  }
}

function lineW(p: P, k = 1) {
  return Math.max(1, p.S * (0.006 + 0.012 * p.d) * k)
}

function poly(c: CanvasRenderingContext2D, pts: number[][]) {
  c.beginPath()
  pts.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)))
  c.closePath()
}

// ───────────────────────── 条带（条纹 / 格子 / 锯齿共用） ─────────────────────────

interface Band { s: number; e: number; color: string }

/** 归一化到 [0,1) 的条带序列；只记录非底色条带 */
function normBands(seq: { w: number; color: string | null }[], reps: number): Band[] {
  const total = seq.reduce((a, b) => a + b.w, 0) * reps
  const out: Band[] = []
  let at = 0
  for (let r = 0; r < reps; r++) {
    for (const b of seq) {
      const w = b.w / total
      if (b.color) out.push({ s: at, e: at + w, color: b.color })
      at += w
    }
  }
  return out
}

/** 条纹序列：每种花色一条，底色条带「细」或「同宽」（seed 决定），偶尔在宽底色带中间加一条细线 */
function stripeBands(p: P, inks: string[] = p.inks): Band[] {
  const k = inks.length
  const thinBase = (p.seed & 1) === 1
  const accent = !thinBase && ((p.seed >> 1) & 1) === 1 && k >= 1
  const w = 0.5 + p.d * 1.5
  const gap = thinBase ? 0.4 : 1
  const seq: { w: number; color: string | null }[] = []
  inks.forEach((col, i) => {
    seq.push({ w, color: col })
    if (accent) {
      seq.push({ w: gap * 0.4, color: null })
      seq.push({ w: gap * 0.2, color: inks[(i + 1) % k]! })
      seq.push({ w: gap * 0.4, color: null })
    } else seq.push({ w: gap, color: null })
  })
  const reps = k === 1 ? 3 : k === 2 ? 2 : 1
  return normBands(seq, reps)
}

/** 'h' 横条（沿 y 排列）、'v' 竖条、'd' 45° 斜条（u = x+y，周期 S 保证平铺） */
function paintBands(p: P, bands: Band[], dir: 'h' | 'v' | 'd') {
  const { c, S } = p
  for (const b of bands) {
    c.fillStyle = b.color
    const a = b.s * S
    const z = b.e * S
    if (dir === 'h') c.fillRect(0, a, S, z - a)
    else if (dir === 'v') c.fillRect(a, 0, z - a, S)
    else {
      for (const k of [-1, 0, 1]) {
        const o = k * S
        poly(c, [[a + o, 0], [z + o, 0], [z + o - S, S], [a + o - S, S]])
        c.fill()
      }
    }
  }
}

// ───────────────────────── 三角晶格（麻叶 / 龟甲 / 鳞） ─────────────────────────

/**
 * 边长 1 的正三角晶格，W 列 × R 行（R 为偶数，行间错半格）恰好铺满一个单元。
 * W=5、R=6 时纵横比 1.039，形变不到 4%。
 */
const LAT_W = 5
const LAT_R = 6
const LAT_H = Math.sqrt(3) / 2

function latMap(p: P) {
  const sx = p.S / LAT_W
  const sy = p.S / (LAT_R * LAT_H)
  return (x: number, y: number): [number, number] => [x * sx, y * LAT_H * sy]
}

/** 遍历单元内（及外扩一圈）的所有三角形；up=true 表示尖朝上 */
function eachTri(cb: (v: [number, number][], up: boolean, r: number, c: number) => void) {
  for (let r = -1; r <= LAT_R; r++) {
    const off = mod(r, 2) * 0.5
    for (let c = -2; c <= LAT_W + 1; c++) {
      const x = c + off
      // 底边在第 r 行、尖在 r+1 行（画面上尖朝下）
      cb([[x, r], [x + 1, r], [x + 0.5, r + 1]], false, r, c)
      // 底边在第 r+1 行、尖在 r 行（尖朝上）
      cb([[x + 0.5, r + 1], [x + 1.5, r + 1], [x + 1, r]], true, r, c)
    }
  }
}

// ───────────────────────── 基础 ─────────────────────────

function drawDots(p: P) {
  const { c, S } = p
  bg(p)
  const n = p.inks.length % 3 === 0 ? 6 : 4
  const kk = cyc(n, p.inks.length)
  const cell = S / n
  const r = cell * (0.14 + 0.24 * p.d)
  const small = ((p.seed >> 2) & 3) === 0 // 偶尔在空隙里加小点
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (j % 2) * 0.5) * cell
      const y = (j + 0.5) * cell
      c.fillStyle = ink(p, (i + j) % kk)
      wrapAt(p, x, y, r, (xx, yy) => {
        c.beginPath()
        c.arc(xx, yy, r, 0, Math.PI * 2)
        c.fill()
      })
      if (small) {
        const sr = r * 0.32
        c.fillStyle = ink(p, (i + j + 1) % kk)
        wrapAt(p, x + cell * 0.5, y + cell * 0.5, sr, (xx, yy) => {
          c.beginPath()
          c.arc(xx, yy, sr, 0, Math.PI * 2)
          c.fill()
        })
      }
    }
  }
}

function drawStripes(p: P) {
  bg(p)
  paintBands(p, stripeBands(p), p.angle === 90 ? 'v' : p.angle === 45 ? 'd' : 'h')
}

function drawGingham(p: P) {
  const { c, S } = p
  bg(p)
  const n = 4
  const cell = S / n
  const w = cell * (0.35 + 0.3 * p.d)
  const h = ink(p, 0)
  const v = p.inks.length > 1 && (p.seed & 1) ? ink(p, 1) : h
  const hMid = mix(p.base, h, 0.5)
  const vMid = mix(p.base, v, 0.5)
  const cross = h === v ? h : shade(mix(h, v, 0.5), -0.12)
  const o = (cell - w) / 2
  c.fillStyle = vMid
  for (let i = 0; i < n; i++) c.fillRect(i * cell + o, 0, w, S)
  c.fillStyle = hMid
  for (let j = 0; j < n; j++) c.fillRect(0, j * cell + o, S, w)
  c.fillStyle = cross
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) c.fillRect(i * cell + o, j * cell + o, w, w)
}

function drawTartan(p: P) {
  const { c } = p
  const rand = rng(p.seed * 7 + 3)
  const pool = [p.base, ...p.inks, shade(ink(p, 0), -0.35), shade(p.base, -0.18)]
  const light = luminance(p.base) > 0.6 ? shade(ink(p, p.inks.length - 1), 0.55) : shade(p.base, 0.6)
  const nb = 3 + Math.floor(rand() * 3)
  const widths = [3, 5, 8, 12, 16]
  const half: { w: number; color: string }[] = []
  let prev = ''
  for (let i = 0; i < nb; i++) {
    let col = pool[Math.floor(rand() * pool.length)]!
    if (col === prev) col = pool[(pool.indexOf(col) + 1) % pool.length]!
    prev = col
    half.push({ w: widths[Math.floor(rand() * widths.length)]! * (0.7 + p.d * 0.6), color: col })
    if (rand() < 0.45) half.push({ w: 1, color: rand() < 0.5 ? light : shade(ink(p, 0), -0.4) })
  }
  // 对称的 sett：A B C … C B
  const full = [...half, ...half.slice(1, -1).reverse()]
  const total = full.reduce((a, b) => a + b.w, 0)
  const reps = total > 50 ? 1 : 2
  const bands = normBands(full, reps)
  paintBands(p, bands, 'h')
  c.save()
  c.globalAlpha = 0.5
  paintBands(p, bands, 'v')
  c.restore()
}

function drawHoundstooth(p: P) {
  const { c, S } = p
  bg(p)
  const n = 4
  const t = S / n
  const q = t / 2
  const dark = ink(p, 0)
  c.fillStyle = dark
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = i * t
      const y0 = j * t
      c.fillRect(x0, y0, q, q)
      // 右上、左下两个象限：45° 斜条（u = x+y），宽 q/2
      for (const [qx, qy] of [[x0 + q, y0], [x0, y0 + q]] as [number, number][]) {
        c.save()
        c.beginPath()
        c.rect(qx, qy, q, q)
        c.clip()
        for (const u0 of [q, 2 * q]) {
          // 局部 u = (x-x0)+(y-y0) ∈ [u0, u0+q/2)
          const a = u0
          const b = u0 + q / 2
          poly(c, [[x0 + a, y0], [x0 + b, y0], [x0 + b - 2 * q, y0 + 2 * q], [x0 + a - 2 * q, y0 + 2 * q]])
          c.fill()
        }
        c.restore()
      }
    }
  }
}

function drawChevron(p: P) {
  const { c, S } = p
  bg(p)
  const Z = 4
  const amp = 0.5 / Z
  const bands = stripeBands(p)
  const vert = p.angle === 90
  const pt = (x: number, y: number): [number, number] => (vert ? [y * S, x * S] : [x * S, y * S])
  for (const b of bands) {
    c.fillStyle = b.color
    for (const k of [-1, 0, 1]) {
      const pts: [number, number][] = []
      for (let i = 0; i <= 2 * Z; i++) pts.push(pt(i / (2 * Z), b.s + k + (i % 2) * amp))
      for (let i = 2 * Z; i >= 0; i--) pts.push(pt(i / (2 * Z), b.e + k + (i % 2) * amp))
      poly(c, pts)
      c.fill()
    }
  }
}

function drawArgyle(p: P) {
  const { c, S } = p
  bg(p)
  const a = ink(p, 0)
  const b = p.inks.length > 1 ? ink(p, 1) : mix(p.base, a, 0.45)
  // 两颗竖长菱形（中心 y=0.5）交替花色，其余区域（中心 y=0 的菱形）露出底色
  ;[a, b].forEach((col, i) => {
    const cx = (0.25 + i * 0.5) * S
    c.fillStyle = col
    poly(c, [[cx - S / 4, S / 2], [cx, 0], [cx + S / 4, S / 2], [cx, S]])
    c.fill()
  })
  // 斜向虚线（过菱形中心、平行于菱形边）：x - y/2 = k/2 与 x + y/2 = k/2
  const lc = p.inks.length > 2 ? ink(p, 2) : luminance(p.base) > 0.5 ? shade(a, -0.35) : shade(p.base, 0.55)
  // 虚线：每段线长度恰为整数个周期，且都从 y=0 起笔，跨边界相位一致
  const L = Math.hypot(S / 2, S)
  const dash = L / 24
  c.strokeStyle = lc
  c.lineWidth = lineW(p, 0.45)
  c.lineCap = 'butt'
  c.setLineDash([dash * 1.3, dash * 0.7])
  for (let k = -2; k <= 3; k++) {
    const x0 = (k * S) / 2
    c.beginPath()
    c.moveTo(x0, 0)
    c.lineTo(x0 + S / 2, S)
    c.stroke()
    c.beginPath()
    c.moveTo(x0, 0)
    c.lineTo(x0 - S / 2, S)
    c.stroke()
  }
  c.setLineDash([])
}

// ───────────────────────── 和柄 ─────────────────────────

function drawIchimatsu(p: P) {
  const { c, S } = p
  bg(p)
  const n = 4
  const cell = S / n
  const kk = cyc(2, p.inks.length)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if ((i + j) % 2 === 0) continue
      c.fillStyle = ink(p, (i % 2) % kk)
      c.fillRect(i * cell, j * cell, cell, cell)
    }
  }
}

function drawAsanoha(p: P) {
  const { c } = p
  bg(p)
  const m = latMap(p)
  c.strokeStyle = ink(p, 0)
  c.lineWidth = lineW(p, 0.55)
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.beginPath()
  eachTri((v) => {
    const g: [number, number] = [(v[0]![0] + v[1]![0] + v[2]![0]) / 3, (v[0]![1] + v[1]![1] + v[2]![1]) / 3]
    const G = m(g[0], g[1])
    const V = v.map(([x, y]) => m(x, y))
    // 三角形边
    c.moveTo(V[0]![0], V[0]![1])
    c.lineTo(V[1]![0], V[1]![1])
    c.lineTo(V[2]![0], V[2]![1])
    c.closePath()
    // 重心连向三个顶点 → 六个三角组成一片麻叶星
    for (const q of V) {
      c.moveTo(G[0], G[1])
      c.lineTo(q[0], q[1])
    }
  })
  c.stroke()
}

function drawSeigaiha(p: P) {
  const { c, S } = p
  bg(p)
  const R = S / 4
  const rows = 8
  const kk = cyc(rows, p.inks.length)
  const rings = 3 + Math.round(p.d * 2)
  const lw = Math.max(1, R * 0.05)
  for (let j = -4; j <= rows + 4; j++) {
    const y = (j * R) / 2
    const off = mod(j, 2) * R
    const col = ink(p, mod(j, kk))
    for (let i = -1; i <= 2; i++) {
      const x = i * 2 * R + off
      for (let t = 0; t < rings; t++) {
        const rr = R * (1 - t / rings)
        c.beginPath()
        c.arc(x, y, rr, 0, Math.PI * 2)
        c.fillStyle = t % 2 === 0 ? col : p.base
        c.fill()
        if (t % 2 === 0) {
          // 用底色描一圈细边，让相邻扇形分开
          c.lineWidth = lw
          c.strokeStyle = p.base
          c.stroke()
        }
      }
    }
  }
}

function drawShippo(p: P) {
  const { c, S } = p
  bg(p)
  const n = 2
  const d = S / n
  const r = d / Math.SQRT2
  const a = ink(p, 0)
  const b = p.inks.length > 1 ? ink(p, 1) : a
  const circle = (x: number, y: number, rr: number) => {
    c.beginPath()
    c.arc(x, y, rr, 0, Math.PI * 2)
  }
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      const x = i * d
      const y = j * d
      // 与右、下邻圆相交出的透镜形花瓣
      for (const [nx, ny, col] of [[x + d, y, a], [x, y + d, b]] as [number, number, string][]) {
        c.save()
        circle(x, y, r)
        c.clip()
        circle(nx, ny, r)
        c.fillStyle = col
        c.fill()
        c.restore()
      }
    }
  }
  c.strokeStyle = shade(a, -0.2)
  c.lineWidth = lineW(p, 0.35)
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      circle(i * d, j * d, r)
      c.stroke()
    }
  }
  // 四瓣花心（圆的交点）和圆心小点
  const dot = p.inks.length > 2 ? ink(p, 2) : shade(a, -0.3)
  c.fillStyle = dot
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      circle(i * d + d / 2, j * d + d / 2, d * 0.05)
      c.fill()
      circle(i * d, j * d, d * 0.07)
      c.fill()
    }
  }
}

function drawKikko(p: P) {
  const { c } = p
  bg(p)
  const m = latMap(p)
  const lineC = ink(p, 0)
  const tint = mix(p.base, lineC, 0.18)
  const flower = p.inks.length > 1 ? ink(p, 1) : lineC
  const hex = (cx: number, cy: number, rad: number) => {
    const pts: [number, number][] = []
    for (let k = 0; k < 6; k++) {
      const ang = Math.PI / 6 + (k * Math.PI) / 3
      pts.push(m(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad / LAT_H))
    }
    poly(c, pts)
  }
  const R0 = 1 / Math.sqrt(3)
  c.lineJoin = 'round'
  for (let r = -1; r <= LAT_R + 1; r++) {
    const off = mod(r, 2) * 0.5
    for (let col = -1; col <= LAT_W + 1; col++) {
      const cx = col + off
      const cy = r // 晶格坐标里 y 以「行」计，hex() 里换算
      hex(cx, cy, R0 * 0.98)
      c.strokeStyle = lineC
      c.lineWidth = lineW(p, 0.5)
      c.stroke()
      hex(cx, cy, R0 * 0.7)
      c.fillStyle = tint
      c.fill()
      c.lineWidth = lineW(p, 0.25)
      c.stroke()
      // 中心小花菱：四个小点
      const [X, Y] = m(cx, cy)
      const s = (p.S / LAT_W) * 0.07
      c.fillStyle = flower
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 2
        c.beginPath()
        c.arc(X + Math.cos(ang) * s * 1.3, Y + Math.sin(ang) * s * 1.3, s, 0, Math.PI * 2)
        c.fill()
      }
    }
  }
}

function drawYagasuri(p: P) {
  const { c, S } = p
  bg(p)
  const n = 4
  const w = S / n
  const h = S / 4
  const slant = w * (0.3 + 0.4 * p.d)
  const kk = cyc(n, p.inks.length)
  for (let i = 0; i < n; i++) {
    const x0 = i * w
    c.fillStyle = ink(p, i % kk)
    const off = (i % 2) * h
    for (let k = -2; k <= 4; k += 2) {
      const y = k * h + off
      poly(c, [
        [x0, y],
        [x0 + w / 2, y + slant],
        [x0 + w, y],
        [x0 + w, y + h],
        [x0 + w / 2, y + h + slant],
        [x0, y + h],
      ])
      c.fill()
    }
  }
}

function drawUroko(p: P) {
  const { c } = p
  bg(p)
  const m = latMap(p)
  const kk = cyc(LAT_R, p.inks.length)
  const shrink = 1 - 0.18 * (1 - p.d)
  eachTri((v, up, r) => {
    if (!up) return
    const gx = (v[0]![0] + v[1]![0] + v[2]![0]) / 3
    const gy = (v[0]![1] + v[1]![1] + v[2]![1]) / 3
    poly(c, v.map(([x, y]) => m(gx + (x - gx) * shrink, gy + (y - gy) * shrink)))
    c.fillStyle = ink(p, mod(r, kk))
    c.fill()
  })
}

// ───────────────────────── 纹样（中式回纹、欧式大马士革） ─────────────────────────

/** 回纹（雷纹）：2×2 格，每格一个方形回旋线（左右格互为镜像），线头从格边伸出与邻格相接 */
function drawHuiwen(p: P) {
  const { c, S } = p
  bg(p)
  const n = 2
  const cell = S / n
  const g = cell / 7 // 平行线间距
  const h = cell / 2 - g / 2
  const L = 2 * h
  // 方形螺旋各段长度：L, L, L, L-g, L-g, L-2g, L-2g, …
  const lens = [L, L, L]
  for (let k = 1; L - k * g > g * 0.9; k++) lens.push(L - k * g, L - k * g)
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const
  c.strokeStyle = ink(p, 0)
  c.lineWidth = g * (0.3 + 0.25 * p.d)
  c.lineCap = 'butt'
  c.lineJoin = 'miter'
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      c.save()
      c.translate(i * cell + cell / 2, j * cell + cell / 2)
      if ((i + j) % 2) c.scale(-1, 1)
      c.beginPath()
      c.moveTo(-cell / 2, h)
      let x = -h
      let y = h
      c.lineTo(x, y)
      lens.forEach((len, k) => {
        const [dx, dy] = dirs[k % 4]!
        x += dx * len
        y += dy * len
        c.lineTo(x, y)
      })
      c.stroke()
      // 底边延伸到格子右边，和邻格的线头接上
      c.beginPath()
      c.moveTo(h, h)
      c.lineTo(cell / 2, h)
      c.stroke()
      c.restore()
    }
  }
}

/** 大马士革：错位排布的对称花饰（中轴一朵、角上一朵），两侧镜像的卷叶 + 中央尖顶花苞 */
function drawDamask(p: P) {
  const { c, S } = p
  bg(p)
  const R = S * 0.24
  const col = ink(p, 0)
  const col2 = p.inks.length > 1 ? ink(p, 1) : mix(p.base, col, 0.55)
  const half = (draw: () => void) => {
    draw()
    c.save()
    c.scale(-1, 1)
    draw()
    c.restore()
  }
  const motif = (x: number, y: number) => {
    c.save()
    c.translate(x, y)
    // 外轮廓：上尖下圆的蛋形（ogee）
    c.fillStyle = col
    c.beginPath()
    c.moveTo(0, -R * 1.25)
    c.bezierCurveTo(R * 0.25, -R * 0.9, R * 0.95, -R * 0.55, R * 0.8, R * 0.15)
    c.bezierCurveTo(R * 0.7, R * 0.75, R * 0.25, R * 1.05, 0, R * 1.2)
    c.bezierCurveTo(-R * 0.25, R * 1.05, -R * 0.7, R * 0.75, -R * 0.8, R * 0.15)
    c.bezierCurveTo(-R * 0.95, -R * 0.55, -R * 0.25, -R * 0.9, 0, -R * 1.25)
    c.fill()
    // 内部镂空：底色的花心 + 两侧卷叶
    c.fillStyle = p.base
    c.beginPath()
    c.ellipse(0, R * 0.2, R * 0.22, R * 0.34, 0, 0, Math.PI * 2)
    c.fill()
    half(() => {
      c.beginPath()
      c.moveTo(R * 0.12, -R * 0.55)
      c.bezierCurveTo(R * 0.55, -R * 0.45, R * 0.62, R * 0.05, R * 0.4, R * 0.5)
      c.bezierCurveTo(R * 0.5, R * 0.05, R * 0.4, -R * 0.25, R * 0.12, -R * 0.55)
      c.fill()
    })
    // 花心里的小花苞
    c.fillStyle = col2
    c.beginPath()
    c.moveTo(0, -R * 0.05)
    c.quadraticCurveTo(R * 0.14, R * 0.2, 0, R * 0.45)
    c.quadraticCurveTo(-R * 0.14, R * 0.2, 0, -R * 0.05)
    c.fill()
    // 顶上的小火焰尖和两侧外卷须
    c.fillStyle = col
    c.beginPath()
    c.moveTo(0, -R * 1.62)
    c.quadraticCurveTo(R * 0.13, -R * 1.42, 0, -R * 1.3)
    c.quadraticCurveTo(-R * 0.13, -R * 1.42, 0, -R * 1.62)
    c.fill()
    // 两侧下部向外上方舒展的卷叶 + 底部小托叶
    half(() => {
      c.beginPath()
      c.moveTo(R * 0.55, R * 0.8)
      c.bezierCurveTo(R * 1.0, R * 0.85, R * 1.45, R * 0.45, R * 1.35, -R * 0.15)
      c.bezierCurveTo(R * 1.2, R * 0.3, R * 0.95, R * 0.55, R * 0.62, R * 0.6)
      c.closePath()
      c.fill()
      c.beginPath()
      c.moveTo(R * 0.05, R * 1.15)
      c.quadraticCurveTo(R * 0.45, R * 1.25, R * 0.6, R * 1.55)
      c.quadraticCurveTo(R * 0.25, R * 1.5, R * 0.05, R * 1.3)
      c.fill()
    })
    c.restore()
  }
  // 大马士革的「之」字错位：(S/4, S/4) 一朵，(3S/4, 3S/4) 一朵，跨边界补画
  for (const [x, y] of [[S * 0.25, S * 0.27], [S * 0.75, S * 0.77]] as const) wrapAt(p, x, y, R * 1.7, motif)
  // 小菱形点缀填空
  c.fillStyle = col2
  for (const [x, y] of [[S * 0.75, S * 0.27], [S * 0.25, S * 0.77]] as const) {
    wrapAt(p, x, y, R * 0.3, (xx, yy) => {
      c.beginPath()
      c.moveTo(xx, yy - R * 0.28)
      c.lineTo(xx + R * 0.16, yy)
      c.lineTo(xx, yy + R * 0.28)
      c.lineTo(xx - R * 0.16, yy)
      c.closePath()
      c.fill()
    })
  }
}

// ───────────────────────── 可爱 ─────────────────────────

/** 抖动网格：每格一个位置，避免扎堆；配合 wrapAt 平铺 */
function jitterGrid(n: number, S: number, rand: () => number, margin: number) {
  const cell = S / n
  const out: { x: number; y: number; i: number; j: number }[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const jx = (rand() - 0.5) * Math.max(0, cell - 2 * margin)
      const jy = (rand() - 0.5) * Math.max(0, cell - 2 * margin)
      out.push({ x: (i + 0.5) * cell + jx, y: (j + 0.5) * cell + jy, i, j })
    }
  }
  return out
}

/** 带缺口的樱花瓣，自原点朝 -y 方向，旋转 ang（点手动旋转，不依赖路径中途改变换） */
function sakuraPetal(c: CanvasRenderingContext2D, L: number, ang = 0) {
  const cs = Math.cos(ang)
  const sn = Math.sin(ang)
  const q = (x: number, y: number): [number, number] => [(x * cs - y * sn) * L, (x * sn + y * cs) * L]
  const bz = (a: [number, number], b: [number, number], d: [number, number]) => c.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1])
  c.moveTo(0, 0)
  bz(q(-0.55, -0.3), q(-0.5, -0.85), q(-0.2, -1))
  c.lineTo(...q(0, -0.8))
  c.lineTo(...q(0.2, -1))
  bz(q(0.5, -0.85), q(0.55, -0.3), [0, 0])
  c.closePath()
}

function drawSakura(p: P) {
  const { c, S } = p
  bg(p)
  const rand = rng(p.seed * 13 + 1)
  const n = 3
  const cell = S / n
  const k = p.inks.length
  const center = k > 1 ? ink(p, k - 1) : p.base
  for (const q of jitterGrid(n, S, rand, cell * 0.36)) {
    const L = cell * (0.2 + 0.1 * p.d) * (0.85 + rand() * 0.3)
    const rot = rand() * Math.PI * 2
    const col = ink(p, Math.floor(rand() * Math.max(1, k > 1 ? k - 1 : 1)))
    wrapAt(p, q.x, q.y, L, (x, y) => {
      c.save()
      c.translate(x, y)
      c.rotate(rot)
      c.beginPath()
      for (let t = 0; t < 5; t++) {
        sakuraPetal(c, L, (t * Math.PI * 2) / 5)
      }
      c.fillStyle = col
      c.fill()
      c.beginPath()
      c.arc(0, 0, L * 0.2, 0, Math.PI * 2)
      c.fillStyle = center
      c.fill()
      c.restore()
    })
  }
  // 散落的单片花瓣：放在格子角点附近
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * cell + (rand() - 0.5) * cell * 0.25
      const y = j * cell + (rand() - 0.5) * cell * 0.25
      const L = cell * 0.12
      const rot = rand() * Math.PI * 2
      const col = ink(p, Math.floor(rand() * k))
      wrapAt(p, x, y, L, (xx, yy) => {
        c.save()
        c.translate(xx, yy + L / 2)
        c.rotate(rot)
        c.translate(0, L / 2)
        c.beginPath()
        sakuraPetal(c, L)
        c.fillStyle = col
        c.fill()
        c.restore()
      })
    }
  }
}

function drawFlowers(p: P) {
  const { c, S } = p
  bg(p)
  const rand = rng(p.seed * 31 + 5)
  const n = 5
  const cell = S / n
  const k = p.inks.length
  const items = jitterGrid(n, S, rand, cell * 0.3)
  for (const q of items) {
    const type = rand()
    const rot = rand() * Math.PI * 2
    const col = ink(p, Math.floor(rand() * k))
    const col2 = ink(p, Math.floor(rand() * k) + 1)
    if (type < 0.6) {
      // 圆瓣小花
      const r = cell * (0.1 + 0.06 * p.d) * (0.85 + rand() * 0.3)
      const petals = rand() < 0.5 ? 5 : 6
      wrapAt(p, q.x, q.y, r * 2.2, (x, y) => {
        c.fillStyle = col
        for (let t = 0; t < petals; t++) {
          const a = rot + (t * Math.PI * 2) / petals
          c.beginPath()
          c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72, 0, Math.PI * 2)
          c.fill()
        }
        c.beginPath()
        c.arc(x, y, r * 0.55, 0, Math.PI * 2)
        c.fillStyle = col2 === col ? p.base : col2
        c.fill()
      })
    } else if (type < 0.85) {
      // 一对叶子
      const l = cell * 0.2
      wrapAt(p, q.x, q.y, l * 1.2, (x, y) => {
        c.save()
        c.translate(x, y)
        c.rotate(rot)
        c.fillStyle = col2
        for (const sgn of [-1, 1]) {
          c.beginPath()
          c.ellipse(sgn * l * 0.5, 0, l * 0.5, l * 0.2, sgn * 0.5, 0, Math.PI * 2)
          c.fill()
        }
        c.restore()
      })
    } else {
      // 三颗小果点
      const r = cell * 0.05
      wrapAt(p, q.x, q.y, r * 4, (x, y) => {
        c.fillStyle = col
        for (let t = 0; t < 3; t++) {
          const a = rot + (t * Math.PI * 2) / 3
          c.beginPath()
          c.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, r, 0, Math.PI * 2)
          c.fill()
        }
      })
    }
  }
}

/** MDN 经典爱心曲线，归一化到宽高约 1、中心在原点 */
function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const P2 = (px: number, py: number): [number, number] => [x + ((px - 75) / 110) * s, y + ((py - 72.5) / 95) * s]
  const m = (a: number, b: number) => { const [u, v] = P2(a, b); c.moveTo(u, v) }
  const bz = (a: number, b: number, cc: number, d: number, e: number, f: number) => {
    const [u1, v1] = P2(a, b)
    const [u2, v2] = P2(cc, d)
    const [u3, v3] = P2(e, f)
    c.bezierCurveTo(u1, v1, u2, v2, u3, v3)
  }
  c.beginPath()
  m(75, 40)
  bz(75, 37, 70, 25, 50, 25)
  bz(20, 25, 20, 62.5, 20, 62.5)
  bz(20, 80, 40, 102, 75, 120)
  bz(110, 102, 130, 80, 130, 62.5)
  bz(130, 62.5, 130, 25, 100, 25)
  bz(85, 25, 75, 37, 75, 40)
  c.closePath()
}

function drawHearts(p: P) {
  const { c, S } = p
  bg(p)
  const n = 4
  const kk = cyc(n, p.inks.length)
  const cell = S / n
  const s = cell * (0.32 + 0.26 * p.d)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (j % 2) * 0.5) * cell
      const y = (j + 0.5) * cell
      const tilt = ((i + j) % 2 ? 1 : -1) * 0.22
      c.fillStyle = ink(p, (i + j) % kk)
      wrapAt(p, x, y, s * 0.75, (xx, yy) => {
        c.save()
        c.translate(xx, yy)
        c.rotate(tilt)
        heartPath(c, 0, 0, s)
        c.fill()
        c.restore()
      })
    }
  }
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, R: number, rot: number) {
  c.beginPath()
  for (let t = 0; t < 10; t++) {
    const rr = t % 2 ? R * 0.46 : R
    const a = rot - Math.PI / 2 + (t * Math.PI) / 5
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (t) c.lineTo(px, py)
    else c.moveTo(px, py)
  }
  c.closePath()
}

function drawStars(p: P) {
  const { c, S } = p
  bg(p)
  const n = 4
  const kk = cyc(n, p.inks.length)
  const cell = S / n
  const R = cell * (0.22 + 0.16 * p.d)
  c.lineJoin = 'round'
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (j % 2) * 0.5) * cell
      const y = (j + 0.5) * cell
      const col = ink(p, (i + j) % kk)
      const rot = ((i * 3 + j * 5) % 4) * 0.12 - 0.18
      wrapAt(p, x, y, R * 1.2, (xx, yy) => {
        starPath(c, xx, yy, R, rot)
        c.fillStyle = col
        c.fill()
        // 同色粗描边把尖角磨圆，更可爱
        c.strokeStyle = col
        c.lineWidth = R * 0.18
        c.stroke()
      })
      // 空隙里的小圆点
      const sr = R * 0.14
      c.fillStyle = ink(p, (i + j + 1) % kk)
      wrapAt(p, x + cell * 0.5, y + cell * 0.5, sr, (xx, yy) => {
        c.beginPath()
        c.arc(xx, yy, sr, 0, Math.PI * 2)
        c.fill()
      })
    }
  }
}

// ───────────────────────── 拼布 ─────────────────────────

const PATCH_KINDS: PatternKind[] = [
  'dots', 'dots', 'stripes', 'stripes', 'gingham', 'gingham', 'flowers', 'sakura',
  'hearts', 'stars', 'ichimatsu', 'seigaiha', 'shippo', 'asanoha', 'uroko', 'houndstooth', 'chevron', 'tartan',
]

function drawPatchwork(p: P) {
  const { c, S } = p
  const rand = rng(p.seed * 97 + 11)
  const all = [p.base, ...p.inks]
  const pieces = clamp(Math.round(p.spec.pieces ?? 4), 2, 8)
  const plain = clamp(p.spec.plainRatio ?? 0.3, 0, 1)
  const cell = S / pieces
  const seam = Math.max(1, S * 0.008)
  const darkest = all.reduce((a, b) => (luminance(b) < luminance(a) ? b : a))
  const seamColor = (p.seed >> 3) & 1 ? p.base : shade(darkest, -0.25)
  c.fillStyle = seamColor
  c.fillRect(0, 0, S, S)
  // 布片内花纹细度：density 越大越细（子单元越小）
  const subS = cell * (1.5 - 1.0 * p.d)
  let prevKind: PatternKind | null = null
  for (let j = 0; j < pieces; j++) {
    for (let i = 0; i < pieces; i++) {
      const x0 = i * cell + seam / 2
      const y0 = j * cell + seam / 2
      const w = cell - seam
      // 布片配色：底 + 两种花色，彼此不同
      const bi = Math.floor(rand() * all.length)
      const pieceBase = all[bi]!
      const others = all.filter((_, k) => k !== bi)
      if (others.length === 0) others.push(shade(pieceBase, luminance(pieceBase) > 0.5 ? -0.35 : 0.4))
      const f1 = others[Math.floor(rand() * others.length)]!
      const f2 = others[Math.floor(rand() * others.length)]!
      const isPlain = rand() < plain
      let kind = PATCH_KINDS[Math.floor(rand() * PATCH_KINDS.length)]!
      if (kind === prevKind) kind = PATCH_KINDS[(PATCH_KINDS.indexOf(kind) + 3) % PATCH_KINDS.length]!
      const sub: P = {
        ...p,
        S: subS,
        base: pieceBase,
        inks: f1 === f2 ? [f1] : [f1, f2],
        d: 0.35 + rand() * 0.35,
        angle: ([0, 90, 45] as const)[Math.floor(rand() * 3)]!,
        seed: Math.floor(rand() * 1e6),
        noBg: true,
      }
      const ox = rand() * subS
      const oy = rand() * subS
      c.save()
      c.beginPath()
      c.rect(x0, y0, w, w)
      c.clip()
      c.fillStyle = isPlain ? (rand() < 0.5 ? pieceBase : mix(pieceBase, f1, 0.15)) : pieceBase
      c.fillRect(x0, y0, w, w)
      if (!isPlain) {
        prevKind = kind
        // 随机裁切相位，像从整块布上剪下来的
        for (let ty = y0 - oy; ty < y0 + w; ty += subS) {
          for (let tx = x0 - ox; tx < x0 + w; tx += subS) {
            c.save()
            c.translate(tx, ty)
            DRAW[kind](sub)
            c.restore()
          }
        }
      }
      c.restore()
      // 绗缝虚线
      const ins = Math.max(seam * 1.6, cell * 0.06)
      c.save()
      c.strokeStyle = luminance(pieceBase) > 0.55 ? shade(pieceBase, -0.3) : shade(pieceBase, 0.45)
      c.globalAlpha = 0.85
      c.lineWidth = Math.max(1, cell * 0.012)
      c.setLineDash([cell * 0.045, cell * 0.035])
      c.strokeRect(x0 + ins, y0 + ins, w - 2 * ins, w - 2 * ins)
      c.restore()
    }
  }
}

// ───────────────────────── 入口 ─────────────────────────

const DRAW: Record<PatternKind, (p: P) => void> = {
  dots: drawDots,
  stripes: drawStripes,
  gingham: drawGingham,
  tartan: drawTartan,
  houndstooth: drawHoundstooth,
  chevron: drawChevron,
  argyle: drawArgyle,
  ichimatsu: drawIchimatsu,
  asanoha: drawAsanoha,
  seigaiha: drawSeigaiha,
  shippo: drawShippo,
  kikko: drawKikko,
  yagasuri: drawYagasuri,
  uroko: drawUroko,
  sakura: drawSakura,
  flowers: drawFlowers,
  hearts: drawHearts,
  stars: drawStars,
  patchwork: drawPatchwork,
  huiwen: drawHuiwen,
  damask: drawDamask,
}

/** 借画布把任意 CSS 颜色规范化成 #rrggbb（便于混色） */
function normalizeColor(ctx: CanvasRenderingContext2D, col: string): string {
  if (parseColor(col)) return toHex(rgbOf(col))
  ctx.fillStyle = '#000000'
  ctx.fillStyle = col
  const v = String(ctx.fillStyle)
  return parseColor(v) ? toHex(rgbOf(v)) : '#808080'
}

/** 在 size × size 的画布上画一个可无缝平铺的花纹单元 */
export function drawPattern(ctx: CanvasRenderingContext2D, spec: PatternSpec, size: number): void {
  const cols = (spec.colors.length ? spec.colors : ['#ffffff']).map((c) => normalizeColor(ctx, c))
  const base = cols[0]!
  let inks = cols.slice(1)
  if (inks.length === 0) inks = [shade(base, luminance(base) > 0.5 ? -0.35 : 0.4)]
  const p: P = {
    c: ctx,
    S: size,
    base,
    inks,
    d: clamp(spec.density ?? 0.5, 0, 1),
    angle: spec.angle ?? 0,
    seed: Math.abs(Math.floor(spec.seed ?? 1)),
    spec,
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.rect(0, 0, size, size)
  ctx.clip()
  ;(DRAW[spec.kind] ?? drawDots)(p)
  ctx.restore()
}

const SCALE: Record<PatternKind, [number, number]> = {
  dots: [6, 14],
  hearts: [8, 16],
  stars: [8, 16],
  sakura: [10, 18],
  flowers: [8, 16],
  stripes: [8, 20],
  chevron: [8, 20],
  gingham: [10, 24],
  tartan: [10, 24],
  houndstooth: [10, 24],
  argyle: [10, 24],
  ichimatsu: [8, 16],
  asanoha: [8, 16],
  seigaiha: [8, 16],
  shippo: [8, 16],
  kikko: [8, 16],
  yagasuri: [8, 16],
  uroko: [8, 16],
  patchwork: [20, 40],
  huiwen: [8, 16],
  damask: [16, 30],
}

/** 用给定颜色随机搭配一套花纹 */
export function randomPattern(colors: string[], rand: () => number = Math.random): PatternSpec {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length) % arr.length]!
  const range = (a: number, b: number) => a + rand() * (b - a)

  // 配色：底色倾向用最浅的颜色，其余打乱
  let cols = colors.length ? [...colors] : ['#fdf6ec', '#e8a0a8']
  cols.sort((a, b) => luminance(b) - luminance(a))
  const baseIdx = rand() < 0.75 ? 0 : Math.floor(rand() * cols.length)
  const base = cols[baseIdx]!
  const rest = cols.filter((_, i) => i !== baseIdx)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j]!, rest[i]!]
  }
  cols = [base, ...rest]

  // 花纹：按组加权（基础与可爱稍多，拼布适中）
  const weights: [PatternKind, number][] = [
    ['dots', 3], ['stripes', 3], ['gingham', 3], ['tartan', 2], ['houndstooth', 1], ['chevron', 1], ['argyle', 1],
    ['ichimatsu', 1.2], ['asanoha', 1.2], ['seigaiha', 1.2], ['shippo', 1.2], ['kikko', 1], ['yagasuri', 1], ['uroko', 1],
    ['sakura', 2], ['flowers', 2], ['hearts', 1.5], ['stars', 1.5], ['huiwen', 0.8], ['damask', 1],
    ['patchwork', 3],
  ]
  const sum = weights.reduce((a, b) => a + b[1], 0)
  let roll = rand() * sum
  let kind: PatternKind = 'dots'
  for (const [k, w] of weights) {
    roll -= w
    if (roll <= 0) { kind = k; break }
  }

  const [lo, hi] = SCALE[kind]
  const spec: PatternSpec = {
    kind,
    colors: cols,
    scale: Math.round(range(lo, hi)),
    density: Math.round(range(0.3, 0.75) * 100) / 100,
    seed: Math.floor(rand() * 1e6),
  }
  if (kind === 'stripes' || kind === 'chevron') {
    const r = rand()
    spec.angle = r < 0.4 ? 0 : r < 0.8 ? 90 : kind === 'stripes' ? 45 : 0
  }
  if (kind === 'patchwork') {
    spec.pieces = pick([4, 4, 4, 6, 6, 8])
    spec.plainRatio = Math.round(range(0.15, 0.45) * 100) / 100
    // 布片越多单元越大，保证单块布片不至于太碎
    spec.scale = Math.round(range(lo, hi) * (spec.pieces >= 6 ? 1.1 : 1))
    spec.scale = Math.min(40, spec.scale)
  }
  return spec
}
