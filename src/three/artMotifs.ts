// 装饰画的画种库：每个画种是一个「种子 → Canvas 画面」的绘制函数，扁平卡通风格（大色块、少渐变），
// 构图只用画布的相对坐标，横幅 / 竖幅 / 挂轴的长条都能画。
// 画种的风格（styles）和用途（kinds）决定一键布置时挂到哪里；label 是中文名（ui.ts 里有三语对照）。

import type { StyleTag } from './kit'

export type ArtKind = 'painting' | 'photo' | 'poster' | 'scroll' | 'kids'
export type Rand = () => number
type G = CanvasRenderingContext2D

export interface Motif {
  id: string
  label: string
  kinds: ArtKind[]
  styles: StyleTag[]
  draw: (g: G, W: number, H: number, r: Rand) => void
}

const TAU = Math.PI * 2
const PI = Math.PI

// ---------- 小工具 ----------

export function mulberry(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(r: Rand, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length]
const rr = (r: Rand, a: number, b: number) => a + (b - a) * r()
const ri = (r: Rand, a: number, b: number) => Math.min(b, Math.floor(a + (b - a + 1) * r()))
function shuffle<T>(r: Rand, a: T[]): T[] {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[o[i], o[j]] = [o[j], o[i]]
  }
  return o
}

function rgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** 两色线性混合（#rrggbb） */
export function mix(a: string, b: string, t: number) {
  const x = rgb(a)
  const y = rgb(b)
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${h(x[0] + (y[0] - x[0]) * t)}${h(x[1] + (y[1] - x[1]) * t)}${h(x[2] + (y[2] - x[2]) * t)}`
}
const light = (c: string, k: number) => mix(c, '#ffffff', k)
const dark = (c: string, k: number) => mix(c, '#000000', k)

function rect(g: G, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c
  g.fillRect(x, y, w, h)
}
function circle(g: G, x: number, y: number, rad: number, c: string) {
  g.fillStyle = c
  g.beginPath()
  g.arc(x, y, Math.max(0.5, rad), 0, TAU)
  g.fill()
}
function ellipse(g: G, x: number, y: number, rx: number, ry: number, rot: number, c: string) {
  g.fillStyle = c
  g.beginPath()
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, TAU)
  g.fill()
}
function poly(g: G, pts: number[], c: string) {
  g.fillStyle = c
  g.beginPath()
  g.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.closePath()
  g.fill()
}
function stroke(g: G, pts: number[], c: string, w: number) {
  g.strokeStyle = c
  g.lineWidth = Math.max(1, w)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.stroke()
}
/** 闭合的圆滑轮廓（过各点中点的二次曲线） */
function smooth(g: G, pts: [number, number][], c: string) {
  const n = pts.length
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  g.fillStyle = c
  g.beginPath()
  const s = mid(pts[n - 1], pts[0])
  g.moveTo(s[0], s[1])
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1])
  }
  g.closePath()
  g.fill()
}
/** 不规则圆团（剪纸色块、树冠、云） */
function blob(g: G, cx: number, cy: number, rad: number, r: Rand, c: string, n = 9, irr = 0.45) {
  const pts: [number, number][] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU
    const d = rad * (1 - irr / 2 + irr * r())
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d])
  }
  smooth(g, pts, c)
}
/** 起伏的山脊：填满 y0 附近的曲线以下；返回曲线高度函数 */
function ridge(g: G, W: number, H: number, y0: number, amp: number, r: Rand, c: string) {
  const f1 = rr(r, 0.6, 1.8)
  const f2 = rr(r, 2.5, 5)
  const p1 = rr(r, 0, TAU)
  const p2 = rr(r, 0, TAU)
  const yAt = (x: number) => y0 + amp * (0.72 * Math.sin((x / W) * f1 * PI + p1) + 0.28 * Math.sin((x / W) * f2 * PI + p2))
  g.fillStyle = c
  g.beginPath()
  g.moveTo(0, H)
  for (let k = 0; k <= 32; k++) g.lineTo((W * k) / 32, yAt((W * k) / 32))
  g.lineTo(W, H)
  g.closePath()
  g.fill()
  return yAt
}
/** 尖峰山脉的折线点（从画布左外到右外） */
function peaks(r: Rand, W: number, top: number, base: number, n: number): [number, number][] {
  const pts: [number, number][] = []
  for (let k = 0; k <= n * 2; k++) {
    const x = -W * 0.08 + ((W * 1.16) / (n * 2)) * (k + rr(r, -0.25, 0.25))
    const hi = k % 2 === 1
    pts.push([x, hi ? top + (base - top) * rr(r, 0, 0.45) : base - (base - top) * rr(r, 0.05, 0.35)])
  }
  return pts
}
function fillPeaks(g: G, pts: [number, number][], base: number, c: string, snow?: string) {
  g.fillStyle = c
  g.beginPath()
  g.moveTo(pts[0][0], base)
  for (const [x, y] of pts) g.lineTo(x, y)
  g.lineTo(pts[pts.length - 1][0], base)
  g.closePath()
  g.fill()
  if (!snow) return
  for (let i = 1; i < pts.length - 1; i += 2) {
    const [px, py] = pts[i]
    const [lx, ly] = pts[i - 1]
    const [qx, qy] = pts[i + 1]
    const t = 0.32
    const a = [px + (lx - px) * t, py + (ly - py) * t]
    const b = [px + (qx - px) * t, py + (qy - py) * t]
    poly(g, [px, py, b[0], b[1], (px + b[0]) / 2 + (b[0] - a[0]) * 0.08, (py + b[1]) / 2 + Math.abs(b[1] - py) * 0.25, px, py + Math.abs(a[1] - py) * 0.6, (px + a[0]) / 2, (py + a[1]) / 2 + Math.abs(a[1] - py) * 0.3, a[0], a[1]], snow)
  }
}
function pine(g: G, x: number, base: number, h: number, c: string) {
  const w = h * 0.42
  for (let k = 0; k < 3; k++) {
    const y = base - h * 0.15 - k * h * 0.26
    const ww = w * (1 - k * 0.25)
    poly(g, [x - ww / 2, y, x, y - h * 0.45, x + ww / 2, y], c)
  }
  rect(g, x - h * 0.03, base - h * 0.15, h * 0.06, h * 0.15, c)
}
function lollipop(g: G, x: number, base: number, h: number, leaf: string, trunk: string, r: Rand) {
  rect(g, x - h * 0.04, base - h * 0.55, h * 0.08, h * 0.55, trunk)
  blob(g, x, base - h * 0.7, h * 0.3, r, leaf, 8, 0.25)
}
function cloud(g: G, x: number, y: number, s: number, c: string) {
  g.fillStyle = c
  g.beginPath()
  g.arc(x - s * 0.55, y, s * 0.42, 0, TAU)
  g.arc(x, y - s * 0.25, s * 0.55, 0, TAU)
  g.arc(x + s * 0.6, y - s * 0.02, s * 0.4, 0, TAU)
  g.fill()
  g.fillRect(x - s * 0.55, y - s * 0.05, s * 1.15, s * 0.47)
}
function text(g: G, s: string, x: number, y: number, size: number, c: string, font = 'sans-serif', weight = 'bold', align: CanvasTextAlign = 'center') {
  g.fillStyle = c
  g.font = `${weight} ${Math.max(4, Math.round(size))}px ${font}`
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(s, x, y)
}
/** 字号适配：文字宽度不超过 maxW */
function fitText(g: G, s: string, size: number, maxW: number, font: string, weight = 'bold') {
  g.font = `${weight} ${Math.round(size)}px ${font}`
  const w = g.measureText(s).width
  return w > maxW && w > 4 ? (size * maxW) / w : size
}
const SANS = '"Helvetica Neue", Arial, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'
const CJK = '"KaiTi", "STKaiti", "Kaiti SC", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif CJK SC", "Noto Serif JP", "SimSun", serif'
/** 竖排文字 */
function vtext(g: G, s: string, x: number, y: number, size: number, c: string) {
  ;[...s].forEach((ch, i) => text(g, ch, x, y + i * size * 1.08, size, c, CJK, 'normal'))
}
/** 朱红印章 */
function seal(g: G, x: number, y: number, s: number, c = '#c0392b') {
  rect(g, x, y, s, s, c)
  const p = s * 0.18
  g.fillStyle = mix(c, '#ffffff', 0.75)
  g.fillRect(x + p, y + p, s * 0.26, s * 0.64)
  g.fillRect(x + s * 0.56, y + p, s * 0.26, s * 0.28)
  g.fillRect(x + s * 0.56, y + s * 0.54, s * 0.26, s * 0.28)
}
/** 古典画的描金内框 */
function goldLine(g: G, W: number, H: number, c = '#c9a24a') {
  const m = Math.min(W, H)
  g.strokeStyle = c
  g.lineWidth = Math.max(1, m * 0.012)
  g.strokeRect(m * 0.035, m * 0.035, W - m * 0.07, H - m * 0.07)
  g.lineWidth = Math.max(1, m * 0.005)
  g.strokeRect(m * 0.06, m * 0.06, W - m * 0.12, H - m * 0.12)
}
/** 四角压暗（照片感） */
function vignette(g: G, W: number, H: number, a = 0.14) {
  const m = Math.min(W, H) * 0.08
  g.globalAlpha = a
  rect(g, 0, 0, W, m, '#000000')
  rect(g, 0, H - m, W, m, '#000000')
  rect(g, 0, m, m, H - m * 2, '#000000')
  rect(g, W - m, m, m, H - m * 2, '#000000')
  g.globalAlpha = 1
}
/** 五瓣小花 */
function blossom(g: G, x: number, y: number, s: number, petal: string, center: string, rot = 0) {
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * TAU
    circle(g, x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, petal)
  }
  circle(g, x, y, s * 0.28, center)
}
/** 尖叶：从 (x, y) 朝 ang 方向长 len，最宽 wid */
function leaf(g: G, x: number, y: number, len: number, wid: number, ang: number, c: string) {
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const tx = x + dx * len
  const ty = y + dy * len
  const mx = x + dx * len * 0.45
  const my = y + dy * len * 0.45
  g.fillStyle = c
  g.beginPath()
  g.moveTo(x, y)
  g.quadraticCurveTo(mx - dy * wid, my + dx * wid, tx, ty)
  g.quadraticCurveTo(mx + dy * wid, my - dx * wid, x, y)
  g.fill()
}
function heart(g: G, x: number, y: number, s: number, c: string) {
  g.fillStyle = c
  g.beginPath()
  g.moveTo(x, y + s)
  g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.5, y - s * 1.2, x, y - s * 0.3)
  g.bezierCurveTo(x + s * 0.5, y - s * 1.2, x + s * 1.6, y - s * 0.2, x, y + s)
  g.fill()
}
function star(g: G, x: number, y: number, s: number, c: string, n = 5, inner = 0.45) {
  const pts: number[] = []
  for (let k = 0; k < n * 2; k++) {
    const a = -PI / 2 + (k / (n * 2)) * TAU
    const d = k % 2 ? s * inner : s
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d)
  }
  poly(g, pts, c)
}
function grayscale(g: G, W: number, H: number, sepia: boolean) {
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i + 3 < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11
    d[i] = Math.min(255, l * (sepia ? 1.08 : 1) + (sepia ? 12 : 0))
    d[i + 1] = Math.min(255, l * (sepia ? 0.96 : 1) + (sepia ? 4 : 0))
    d[i + 2] = Math.min(255, l * (sepia ? 0.8 : 1))
  }
  g.putImageData(img, 0, 0)
}

// ---------- 人物 / 动物（照片、肖像、萌系共用） ----------

const SKINS = ['#f6d7bf', '#efc7a5', '#dca983', '#b98563', '#8a5a3c']
const HAIRS = ['#2a211c', '#4a3328', '#7a5232', '#c09060', '#e8d6a8', '#1a1a1a', '#8a3a24']
const SHIRTS = ['#e86a5a', '#5a8be0', '#f2c14e', '#7fb38a', '#f4f1ea', '#3a3a40', '#c58ad6', '#ff9fb4', '#2f6f7a']

/** 半身人像：底边 base，总高 h（头顶到底边） */
function person(g: G, cx: number, base: number, h: number, r: Rand, o: { skin?: string; hair?: string; shirt?: string; smile?: boolean } = {}) {
  const skin = o.skin ?? pick(r, SKINS)
  const hair = o.hair ?? pick(r, HAIRS)
  const shirt = o.shirt ?? pick(r, SHIRTS)
  const hr = h * 0.2
  const hy = base - h + hr * 1.05
  const style = ri(r, 0, 4)
  if (style === 1 || style === 4) ellipse(g, cx, hy + hr * 0.6, hr * 1.12, hr * 1.5, 0, hair)
  ellipse(g, cx, base + hr * 0.5, hr * 2.1, hr * 1.9, 0, shirt)
  rect(g, cx - hr * 0.32, hy + hr * 0.6, hr * 0.64, hr * 0.9, dark(skin, 0.08))
  ellipse(g, cx, hy, hr * 0.86, hr, 0, skin)
  g.fillStyle = hair
  g.beginPath()
  g.ellipse(cx, hy - hr * 0.12, hr * 0.92, hr * 0.92, 0, PI * 1.02, PI * 1.98)
  g.fill()
  if (style === 2) circle(g, cx, hy - hr * 1.05, hr * 0.42, hair)
  if (style === 3) {
    for (const s of [-1, 1]) ellipse(g, cx + s * hr * 0.8, hy - hr * 0.2, hr * 0.25, hr * 0.45, 0, hair)
  }
  // 五官
  for (const s of [-1, 1]) circle(g, cx + s * hr * 0.33, hy + hr * 0.08, hr * 0.085, '#2a211c')
  g.globalAlpha = 0.35
  for (const s of [-1, 1]) circle(g, cx + s * hr * 0.5, hy + hr * 0.36, hr * 0.14, '#ff8a8a')
  g.globalAlpha = 1
  g.strokeStyle = '#7a3a2a'
  g.lineWidth = Math.max(1, hr * 0.07)
  g.beginPath()
  if (o.smile === false) {
    g.moveTo(cx - hr * 0.15, hy + hr * 0.5)
    g.lineTo(cx + hr * 0.15, hy + hr * 0.5)
  } else g.arc(cx, hy + hr * 0.3, hr * 0.25, 0.2 * PI, 0.8 * PI)
  g.stroke()
}

/** 猫脸：中心 (x, y)，半径 s */
function catFace(g: G, x: number, y: number, s: number, fur: string, r: Rand, blush = true) {
  const inner = '#f5a5b5'
  for (const d of [-1, 1]) {
    poly(g, [x + d * s * 0.9, y - s * 0.2, x + d * s * 0.75, y - s * 1.15, x + d * s * 0.2, y - s * 0.7], fur)
    poly(g, [x + d * s * 0.75, y - s * 0.35, x + d * s * 0.68, y - s * 0.92, x + d * s * 0.36, y - s * 0.66], inner)
  }
  ellipse(g, x, y, s, s * 0.85, 0, fur)
  if (r() < 0.5) {
    // 花斑
    g.save()
    g.beginPath()
    g.ellipse(x, y, s, s * 0.85, 0, 0, TAU)
    g.clip()
    blob(g, x - s * 0.6, y - s * 0.5, s * 0.5, r, fur === '#f4f1ea' ? '#f2a65a' : dark(fur, 0.35), 7, 0.4)
    g.restore()
  }
  const sleepy = r() < 0.3
  for (const d of [-1, 1]) {
    if (sleepy) {
      g.strokeStyle = '#2a211c'
      g.lineWidth = Math.max(1, s * 0.06)
      g.beginPath()
      g.arc(x + d * s * 0.38, y - s * 0.02, s * 0.13, PI * 1.1, PI * 1.9)
      g.stroke()
    } else {
      ellipse(g, x + d * s * 0.38, y - s * 0.02, s * 0.1, s * 0.14, 0, '#2a211c')
      circle(g, x + d * s * 0.38 + s * 0.03, y - s * 0.07, s * 0.035, '#ffffff')
    }
  }
  poly(g, [x - s * 0.08, y + s * 0.18, x + s * 0.08, y + s * 0.18, x, y + s * 0.27], '#e86a7a')
  g.strokeStyle = '#2a211c'
  g.lineWidth = Math.max(1, s * 0.04)
  g.beginPath()
  g.arc(x - s * 0.09, y + s * 0.3, s * 0.09, 0, PI)
  g.arc(x + s * 0.09, y + s * 0.3, s * 0.09, 0, PI)
  g.stroke()
  g.globalAlpha = 0.6
  for (const d of [-1, 1])
    for (const k of [-1, 0, 1]) {
      g.beginPath()
      g.moveTo(x + d * s * 0.45, y + s * 0.25 + k * s * 0.08)
      g.lineTo(x + d * s * 1.1, y + s * 0.2 + k * s * 0.16)
      g.stroke()
    }
  g.globalAlpha = 1
  if (blush) {
    g.globalAlpha = 0.4
    for (const d of [-1, 1]) ellipse(g, x + d * s * 0.6, y + s * 0.25, s * 0.14, s * 0.09, 0, '#ff7f8f')
    g.globalAlpha = 1
  }
}

/** 狗脸：中心 (x, y)，半径 s */
function dogFace(g: G, x: number, y: number, s: number, r: Rand) {
  const breed = ri(r, 0, 3)
  const fur = ['#e8c48a', '#f2a65a', '#fbf7ee', '#c8a07a'][breed]
  const ear = ['#c89a5a', '#d9823a', '#3a3a40', '#3a2a24'][breed]
  if (breed === 1) {
    for (const d of [-1, 1]) poly(g, [x + d * s * 0.95, y - s * 0.1, x + d * s * 0.7, y - s * 1.1, x + d * s * 0.2, y - s * 0.75], fur)
  } else {
    for (const d of [-1, 1]) ellipse(g, x + d * s * 0.85, y + s * 0.05, s * 0.3, s * 0.62, d * 0.25, ear)
  }
  ellipse(g, x, y, s * 0.9, s * 0.85, 0, fur)
  if (breed === 2) {
    circle(g, x + s * 0.4, y - s * 0.35, s * 0.12, '#3a3a40')
    circle(g, x - s * 0.5, y + s * 0.1, s * 0.08, '#3a3a40')
  }
  ellipse(g, x, y + s * 0.35, s * 0.48, s * 0.36, 0, breed === 3 ? '#3a2a24' : light(fur, 0.55))
  for (const d of [-1, 1]) {
    circle(g, x + d * s * 0.36, y - s * 0.12, s * 0.11, '#2a211c')
    circle(g, x + d * s * 0.36 + s * 0.035, y - s * 0.16, s * 0.035, '#ffffff')
  }
  ellipse(g, x, y + s * 0.22, s * 0.16, s * 0.11, 0, '#2a211c')
  if (r() < 0.6) ellipse(g, x, y + s * 0.6, s * 0.12, s * 0.16, 0, '#ef7f8f')
  g.strokeStyle = '#2a211c'
  g.lineWidth = Math.max(1, s * 0.045)
  g.beginPath()
  g.moveTo(x, y + s * 0.3)
  g.lineTo(x, y + s * 0.42)
  g.arc(x - s * 0.12, y + s * 0.42, s * 0.12, 0, PI * 0.9)
  g.moveTo(x, y + s * 0.42)
  g.arc(x + s * 0.12, y + s * 0.42, s * 0.12, PI, PI * 0.1, true)
  g.stroke()
}

/** 小熊 / 兔子 / 熊猫 */
function animalFace(g: G, x: number, y: number, s: number, kind: number, fur: string) {
  const ink = '#2a211c'
  if (kind === 1) {
    for (const d of [-1, 1]) {
      ellipse(g, x + d * s * 0.4, y - s * 1.1, s * 0.22, s * 0.62, d * 0.12, fur)
      ellipse(g, x + d * s * 0.4, y - s * 1.08, s * 0.1, s * 0.45, d * 0.12, '#f5a5b5')
    }
  } else {
    for (const d of [-1, 1]) {
      circle(g, x + d * s * 0.72, y - s * 0.68, s * 0.32, kind === 2 ? ink : fur)
      circle(g, x + d * s * 0.72, y - s * 0.68, s * 0.16, kind === 2 ? '#4a4a50' : light(fur, 0.4))
    }
  }
  ellipse(g, x, y, s, s * 0.88, 0, kind === 2 ? '#fbf7ee' : fur)
  if (kind === 2) for (const d of [-1, 1]) ellipse(g, x + d * s * 0.36, y - s * 0.05, s * 0.2, s * 0.26, d * -0.5, ink)
  ellipse(g, x, y + s * 0.3, s * 0.34, s * 0.26, 0, kind === 2 ? '#fbf7ee' : light(fur, 0.5))
  for (const d of [-1, 1]) {
    circle(g, x + d * s * 0.36, y - s * 0.05, s * 0.09, kind === 2 ? '#ffffff' : ink)
    if (kind === 2) circle(g, x + d * s * 0.36, y - s * 0.05, s * 0.05, ink)
  }
  ellipse(g, x, y + s * 0.2, s * 0.12, s * 0.08, 0, ink)
  g.globalAlpha = 0.4
  for (const d of [-1, 1]) ellipse(g, x + d * s * 0.62, y + s * 0.25, s * 0.14, s * 0.09, 0, '#ff7f8f')
  g.globalAlpha = 1
}

// ---------- 风景的零件 ----------

function sailboat(g: G, x: number, y: number, s: number, hull: string, sail: string) {
  poly(g, [x - s, y, x + s, y, x + s * 0.7, y + s * 0.3, x - s * 0.7, y + s * 0.3], hull)
  stroke(g, [x, y, x, y - s * 1.6], hull, s * 0.06)
  poly(g, [x + s * 0.06, y - s * 1.55, x + s * 0.06, y - s * 0.1, x + s * 0.85, y - s * 0.1], sail)
  poly(g, [x - s * 0.06, y - s * 1.2, x - s * 0.06, y - s * 0.1, x - s * 0.6, y - s * 0.1], light(sail, 0.0))
}
function birds(g: G, r: Rand, W: number, H: number, n: number, c: string, top = 0.1, bot = 0.35) {
  const m = Math.min(W, H)
  for (let k = 0; k < n; k++) {
    const x = W * rr(r, 0.1, 0.9)
    const y = H * rr(r, top, bot)
    const s = m * rr(r, 0.02, 0.035)
    g.strokeStyle = c
    g.lineWidth = Math.max(1, s * 0.25)
    g.beginPath()
    g.moveTo(x - s, y - s * 0.3)
    g.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y)
    g.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.3)
    g.stroke()
  }
}

// ======================================================================
// 画种
// ======================================================================

const ALL: StyleTag[] = ['cute', 'nordic', 'modern', 'japanese', 'industrial', 'retro', 'chinese', 'classic', 'farmhouse']

export const MOTIFS: Motif[] = [
  // ---------- 抽象 / 几何 ----------
  {
    id: 'mondrian',
    label: '格子构成',
    kinds: ['painting', 'poster'],
    styles: ['modern', 'nordic', 'industrial', 'retro'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#f3f0e8', '#d43a2f', '#1f4e9c', '#f2c531', '#151515'],
        ['#f2ede3', '#c9724f', '#6f8fa6', '#e3b65a', '#2a2a2a'],
        ['#f6f4ef', '#9aa7a0', '#d8b48a', '#3f5566', '#3a3a3a'],
      ])
      rect(g, 0, 0, W, H, P[0])
      const cells: [number, number, number, number][] = [[0, 0, W, H]]
      const n = ri(r, 5, 9)
      for (let k = 0; k < n; k++) {
        cells.sort((a, b) => b[2] * b[3] - a[2] * a[3])
        const [x, y, w, h] = cells.shift()!
        const t = rr(r, 0.28, 0.72)
        if (w > h * rr(r, 0.7, 1.3)) cells.push([x, y, w * t, h], [x + w * t, y, w * (1 - t), h])
        else cells.push([x, y, w, h * t], [x, y + h * t, w, h * (1 - t)])
      }
      const cols = shuffle(r, [P[1], P[2], P[3]])
      shuffle(r, cells.map((_, i) => i))
        .slice(0, ri(r, 2, 4))
        .forEach((i, k) => rect(g, cells[i][0], cells[i][1], cells[i][2], cells[i][3], cols[k % 3]))
      g.strokeStyle = P[4]
      g.lineWidth = Math.max(2, Math.min(W, H) * 0.028)
      for (const c of cells) g.strokeRect(c[0], c[1], c[2], c[3])
    },
  },
  {
    id: 'colorfield',
    label: '色域',
    kinds: ['painting'],
    styles: ['modern', 'nordic', 'japanese', 'industrial'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#8c2f28', '#d4553a', '#eea23b'],
        ['#26343f', '#4f6d7f', '#c3d0d3'],
        ['#e8dfcf', '#c4ae8e', '#8d9c7c'],
        ['#3d2c4a', '#b0476a', '#f0a868'],
        ['#f0e6d6', '#e4a59a', '#9fb6c2'],
        ['#2e3a2e', '#7f9a6c', '#d9cf9e'],
      ])
      rect(g, 0, 0, W, H, P[0])
      const n = ri(r, 2, 3)
      const m = Math.min(W, H) * 0.08
      const ws = Array.from({ length: n }, () => rr(r, 0.6, 1.4))
      const sum = ws.reduce((a, b) => a + b, 0)
      const cols = shuffle(r, [P[1], P[2], mix(P[1], P[2], 0.5)])
      let y = m
      const avail = H - m * (n + 1)
      ws.forEach((w, i) => {
        const h = (avail * w) / sum
        g.globalAlpha = 0.35
        rect(g, m - m * 0.18, y - m * 0.18, W - m * 2 + m * 0.36, h + m * 0.36, cols[i])
        g.globalAlpha = 1
        rect(g, m, y, W - m * 2, h, cols[i])
        y += h + m
      })
    },
  },
  {
    id: 'bauhaus',
    label: '包豪斯几何',
    kinds: ['painting', 'poster'],
    styles: ['modern', 'retro', 'nordic', 'industrial', 'cute'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#efe6d4', '#d8572a', '#2d5d7b', '#f2b134', '#1e1e1e'],
        ['#f5efe6', '#c26a5a', '#5f7f6e', '#e6b85c', '#2a2a2a'],
        ['#fff6ee', '#ffb6c8', '#a6d8f0', '#ffe08f', '#b6e3cc'],
        ['#e9e4d8', '#b5523b', '#3a3a3c', '#c9a24a', '#7d8a8c'],
      ])
      const cols = Math.max(1, Math.min(6, Math.round((W / H) * 2)))
      const cw = W / cols
      const rows = Math.max(1, Math.round(H / cw))
      const ch = H / rows
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = i * cw
          const y = j * ch
          const bg = pick(r, P)
          let fg = pick(r, P)
          if (fg === bg) fg = P[(P.indexOf(bg) + 1) % P.length]
          g.save()
          g.beginPath()
          g.rect(x, y, cw, ch)
          g.clip()
          rect(g, x, y, cw, ch, bg)
          g.translate(x + cw / 2, y + ch / 2)
          g.rotate(ri(r, 0, 3) * (PI / 2))
          const s = Math.min(cw, ch) / 2
          switch (ri(r, 0, 5)) {
            case 0:
              circle(g, 0, 0, s * 0.72, fg)
              break
            case 1:
              g.fillStyle = fg
              g.beginPath()
              g.arc(0, s, s, PI, TAU)
              g.fill()
              break
            case 2:
              g.fillStyle = fg
              g.beginPath()
              g.moveTo(-s, -s)
              g.arc(-s, -s, s * 2, 0, PI / 2)
              g.closePath()
              g.fill()
              break
            case 3:
              poly(g, [-s, s, s, s, -s, -s], fg)
              break
            case 4:
              for (let k = 0; k < 3; k++) rect(g, -s, -s + (k * 2 * s) / 3, s * 2, s / 3, fg)
              break
            default:
              circle(g, 0, 0, s * 0.8, fg)
              circle(g, 0, 0, s * 0.42, bg)
          }
          g.restore()
        }
    },
  },
  {
    id: 'arches',
    label: '彩虹拱',
    kinds: ['painting'],
    styles: ['nordic', 'cute', 'farmhouse', 'modern'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#f3e9dc', '#c8673f', '#e2a74a', '#9aa786', '#e6b8a2'],
        ['#f6efe6', '#d98c74', '#f0c27b', '#a8b9a0', '#8c5a48'],
        ['#fff6ee', '#ffb6c8', '#ffd9a0', '#b6e3d4', '#a8c8f0'],
        ['#ece4d4', '#2f5d62', '#c9844f', '#e0c28a', '#5e8b7e'],
      ])
      rect(g, 0, 0, W, H, P[0])
      const m = Math.min(W, H)
      if (r() < 0.6) circle(g, W * rr(r, 0.2, 0.8), H * rr(r, 0.15, 0.3), m * rr(r, 0.08, 0.13), P[2])
      const groups = W > H * 1.8 ? 2 : 1
      for (let k = 0; k < groups; k++) {
        const cx = groups === 1 ? W / 2 : W * (k ? 0.72 : 0.28)
        const by = H * rr(r, 0.82, 0.95)
        const R = Math.min((W / groups) * rr(r, 0.38, 0.46), H * 0.72)
        const bands = ri(r, 3, 5)
        const cols = shuffle(r, P.slice(1))
        for (let i = 0; i < bands; i++) {
          const rad = R * (1 - (i / bands) * 0.82)
          g.fillStyle = cols[i % cols.length]
          g.beginPath()
          g.arc(cx, by, rad, PI, TAU)
          g.lineTo(cx + rad, H)
          g.lineTo(cx - rad, H)
          g.closePath()
          g.fill()
        }
        g.fillStyle = P[0]
        g.beginPath()
        g.arc(cx, by, R * 0.18 * (bands / 5 + 0.5) * 0.6, PI, TAU)
        g.fill()
      }
      rect(g, 0, H * 0.93, W, H * 0.07, P[0])
      for (let k = 0; k < ri(r, 3, 8); k++) circle(g, W * r(), H * rr(r, 0.05, 0.45), m * 0.012, P[4])
    },
  },
  {
    id: 'cutouts',
    label: '剪纸色块',
    kinds: ['painting', 'poster'],
    styles: ['modern', 'nordic', 'cute', 'retro'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#f2ead8', '#1f4fa0', '#e2583e', '#f2c531', '#2f7d5b'],
        ['#1f3a5f', '#f2ead8', '#f2a541', '#e86a4f', '#7fb3a4'],
        ['#fbefe6', '#e98a6f', '#7da38e', '#f2c46b', '#2e4057'],
        ['#f6f1e8', '#3a3a3c', '#c9a24a', '#a9bfa3', '#d98b74'],
      ])
      rect(g, 0, 0, W, H, P[0])
      const m = Math.min(W, H)
      const n = ri(r, 4, 8)
      for (let k = 0; k < n; k++) {
        const c = pick(r, P.slice(1))
        const x = W * rr(r, 0.05, 0.95)
        const y = H * rr(r, 0.05, 0.95)
        const t = r()
        if (t < 0.45) {
          // 海藻状的叶子：中脊两侧交替的圆瓣
          const len = m * rr(r, 0.35, 0.6)
          const ang = rr(r, 0, TAU)
          const lobes = ri(r, 4, 7)
          for (let i = 0; i <= lobes; i++) {
            const f = i / lobes
            const px = x + Math.cos(ang) * len * f
            const py = y + Math.sin(ang) * len * f
            const side = i % 2 ? 1 : -1
            const w = m * 0.07 * (1 - f * 0.6)
            ellipse(g, px - Math.sin(ang) * side * w * 0.8, py + Math.cos(ang) * side * w * 0.8, w * 1.2, w * 0.6, ang + side * 0.7, c)
          }
          stroke(g, [x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len], c, m * 0.03)
        } else if (t < 0.8) blob(g, x, y, m * rr(r, 0.08, 0.18), r, c, ri(r, 6, 10), 0.6)
        else star(g, x, y, m * rr(r, 0.06, 0.12), c, ri(r, 5, 8), 0.5)
      }
    },
  },
  {
    id: 'pattern',
    label: '几何纹样',
    kinds: ['painting', 'poster'],
    styles: ['modern', 'retro', 'industrial', 'cute', 'nordic'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#f4efe6', '#2f4858', '#e3a857'],
        ['#1f2a33', '#e9e4d8', '#d4553a'],
        ['#fff4f0', '#ff9fb4', '#9fd8f0'],
        ['#f2e8d0', '#c8473a', '#2f8f8a'],
        ['#e9eae4', '#7d8a8c', '#3a3a3c'],
      ])
      rect(g, 0, 0, W, H, P[0])
      const s = Math.min(W, H) / ri(r, 4, 7)
      const kind = ri(r, 0, 4)
      for (let y = -s; y < H + s; y += s)
        for (let x = -s; x < W + s; x += s) {
          const i = Math.round(x / s)
          const j = Math.round(y / s)
          const c = (i + j) % 2 ? P[1] : P[2]
          if (kind === 0) {
            if ((i + j) % 2) rect(g, x, y, s, s, P[1])
          } else if (kind === 1) poly(g, j % 2 ? [x, y, x + s, y, x + s / 2, y + s] : [x, y + s, x + s, y + s, x + s / 2, y], c)
          else if (kind === 2) circle(g, x + (j % 2 ? s / 2 : 0), y, s * 0.28, c)
          else if (kind === 3) {
            g.fillStyle = c
            g.beginPath()
            g.arc(x + (j % 2 ? s / 2 : 0), y + s, s / 2, PI, TAU)
            g.fill()
            g.fillStyle = P[0]
            g.beginPath()
            g.arc(x + (j % 2 ? s / 2 : 0), y + s, s * 0.25, PI, TAU)
            g.fill()
          } else poly(g, [x, y + s / 2, x + s / 2, y, x + s, y + s / 2, x + s / 2, y + s], (i + j) % 3 ? P[1] : P[2])
        }
    },
  },
  {
    id: 'sunset',
    label: '复古落日',
    kinds: ['painting', 'poster'],
    styles: ['retro', 'modern', 'cute'],
    draw(g, W, H, r) {
      const P = pick(r, [
        ['#f4e7c8', '#e2702f', '#e0a526', '#2f8f8a', '#c8473a'],
        ['#2b1e3a', '#ff4f7b', '#ffc15e', '#5b3a8a', '#ff7a59'],
        ['#fbe8d3', '#f28c6a', '#f7c46c', '#7a9e9f', '#3b5b6b'],
        ['#fff4ec', '#ff8fa3', '#ffd38a', '#9fd3c7', '#ffb38a'],
      ])
      rect(g, 0, 0, W, H, P[0])
      const hz = H * rr(r, 0.62, 0.72)
      const R = Math.min(W * 0.36, H * 0.34)
      const cx = W / 2
      const cy = hz - R * rr(r, 0.1, 0.5)
      const bands = 7
      for (let k = 0; k < bands; k++) {
        g.save()
        g.beginPath()
        g.rect(0, cy - R + (2 * R * k) / bands, W, (2 * R) / bands + 1)
        g.clip()
        circle(g, cx, cy, R, mix(P[2], P[1], k / (bands - 1)))
        g.restore()
      }
      for (let k = 0; k < 5; k++) {
        const y = cy + R * (0.1 + k * 0.2)
        rect(g, 0, y, W, R * 0.03 * (k + 1), P[0])
      }
      rect(g, 0, hz, W, H - hz, P[3])
      const v = ri(r, 0, 2)
      if (v === 0) {
        g.strokeStyle = light(P[3], 0.35)
        g.lineWidth = Math.max(1, H * 0.006)
        for (let k = -8; k <= 8; k++) {
          g.beginPath()
          g.moveTo(cx + k * W * 0.04, hz)
          g.lineTo(cx + k * W * 0.25, H)
          g.stroke()
        }
        for (let k = 1; k < 6; k++) rect(g, 0, hz + (H - hz) * (k / 6) ** 1.8, W, Math.max(1, H * 0.006), light(P[3], 0.35))
      } else if (v === 1) {
        const pts = peaks(r, W, hz - R * 0.6, hz, 4)
        fillPeaks(g, pts, hz + 1, P[4])
      } else {
        for (const s of [-1, 1]) {
          const x = cx + s * W * rr(r, 0.28, 0.4)
          stroke(g, [x, H, x + s * W * 0.02, hz - R * 0.5], P[4], W * 0.015)
          for (let k = 0; k < 5; k++) leaf(g, x + s * W * 0.02, hz - R * 0.5, R * 0.45, R * 0.08, -PI / 2 + (k - 2) * 0.6, P[4])
        }
      }
    },
  },

  // ---------- 风景 ----------
  {
    id: 'hills',
    label: '田园山丘',
    kinds: ['painting', 'photo'],
    styles: ['nordic', 'farmhouse', 'cute', 'classic', 'modern'],
    draw(g, W, H, r) {
      const [sky, sun] = pick(r, [
        ['#bfe3f2', '#fff3c4'],
        ['#ffd8b8', '#fff0d0'],
        ['#f4d6e6', '#ffffff'],
        ['#d9e8f0', '#ffffff'],
        ['#f7e3b5', '#fffaf0'],
      ])
      const greens = pick(r, [
        ['#bfdca3', '#93c27c', '#6ea35f', '#4d7f46'],
        ['#d6dfb0', '#aebf83', '#869e62', '#62784a'],
        ['#ecd29a', '#cdb070', '#9fb77a', '#6f8f55'],
        ['#cfe8d6', '#a6d8b8', '#f4c4cf', '#8cc59c'],
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, sky)
      circle(g, W * rr(r, 0.15, 0.85), H * rr(r, 0.12, 0.28), m * rr(r, 0.07, 0.11), sun)
      for (let k = 0; k < ri(r, 1, 3); k++) cloud(g, W * rr(r, 0.1, 0.9), H * rr(r, 0.1, 0.3), m * rr(r, 0.07, 0.11), '#ffffff')
      const ys: ((x: number) => number)[] = []
      for (let i = 0; i < 4; i++) ys.push(ridge(g, W, H, H * (0.45 + i * 0.13), H * rr(r, 0.03, 0.06), r, greens[i]))
      if (r() < 0.6) {
        g.save()
        g.globalAlpha = 0.18
        g.strokeStyle = '#3a4a2a'
        g.lineWidth = Math.max(1, m * 0.01)
        for (let k = -10; k < 20; k++) {
          g.beginPath()
          g.moveTo((W * k) / 10, H)
          g.lineTo((W * k) / 10 + W * 0.3, ys[2](W * 0.5))
          g.stroke()
        }
        g.restore()
        ridge(g, W, H, H * 0.84, H * 0.03, r, greens[3])
      }
      const trees = ri(r, 1, 4)
      for (let k = 0; k < trees; k++) {
        const x = W * rr(r, 0.08, 0.92)
        lollipop(g, x, ys[1](x) + H * 0.02, m * rr(r, 0.12, 0.2), dark(greens[3], 0.15), '#7a5a3a', r)
      }
      if (r() < 0.4) {
        const x = W * rr(r, 0.2, 0.8)
        const y = ys[2](x) + H * 0.01
        const s = m * 0.07
        rect(g, x - s, y - s, s * 2, s, '#fbf6ee')
        poly(g, [x - s * 1.2, y - s, x, y - s * 1.9, x + s * 1.2, y - s], '#c8473a')
        rect(g, x - s * 0.2, y - s * 0.6, s * 0.4, s * 0.6, '#6a4a3a')
      }
    },
  },
  {
    id: 'alpine',
    label: '雪山湖泊',
    kinds: ['painting', 'photo'],
    styles: ['nordic', 'modern', 'classic', 'industrial', 'farmhouse'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { sky: '#cfe6f2', far: '#9fb8cc', near: '#6f8aa3', lake: '#7fa8c4', shore: '#3f5f4a' },
        { sky: '#f6d9c4', far: '#b9a3b8', near: '#7f6a8a', lake: '#c9a8b0', shore: '#3f3a4a' },
        { sky: '#e8ecee', far: '#b8c4c8', near: '#7d8c92', lake: '#a8b8bc', shore: '#4a5450' },
        { sky: '#bfe0e8', far: '#8fb0a0', near: '#5a7f6a', lake: '#6fa0a8', shore: '#2f4a3a' },
      ])
      const m = Math.min(W, H)
      const hz = H * rr(r, 0.58, 0.68)
      rect(g, 0, 0, W, H, S.sky)
      if (r() < 0.6) circle(g, W * rr(r, 0.15, 0.85), H * rr(r, 0.1, 0.22), m * 0.06, light(S.sky, 0.7))
      const far = peaks(r, W, hz - H * 0.42, hz, ri(r, 3, 5))
      const near = peaks(r, W, hz - H * 0.26, hz, ri(r, 2, 4))
      const ranges = () => {
        fillPeaks(g, far, hz + 1, S.far, '#fbfcfd')
        fillPeaks(g, near, hz + 1, S.near, light(S.near, 0.8))
      }
      ranges()
      rect(g, 0, hz, W, H - hz, S.lake)
      g.save()
      g.beginPath()
      g.rect(0, hz, W, H - hz)
      g.clip()
      g.translate(0, hz * 2)
      g.scale(1, -1)
      g.globalAlpha = 0.35
      ranges()
      g.restore()
      g.globalAlpha = 0.5
      for (let k = 0; k < 6; k++) rect(g, W * rr(r, 0, 0.8), hz + (H - hz) * rr(r, 0.2, 0.9), W * rr(r, 0.05, 0.2), Math.max(1, m * 0.006), light(S.lake, 0.6))
      g.globalAlpha = 1
      rect(g, 0, hz - m * 0.01, W, m * 0.02, S.shore)
      for (let k = 0; k < ri(r, 4, 12); k++) {
        const x = r() < 0.5 ? W * rr(r, 0, 0.3) : W * rr(r, 0.7, 1)
        pine(g, x, hz + m * 0.005, m * rr(r, 0.06, 0.14), S.shore)
      }
    },
  },
  {
    id: 'seascape',
    label: '海景帆船',
    kinds: ['painting', 'photo'],
    styles: ['nordic', 'classic', 'retro', 'farmhouse', 'cute', 'modern'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { sky: '#bfe3f2', sea: '#4f8fc0', sun: '#fff4c4' },
        { sky: '#f7c59f', sea: '#5a6f9a', sun: '#ffe0a0' },
        { sky: '#e4ecef', sea: '#8fa9b8', sun: '#ffffff' },
        { sky: '#f4e2c4', sea: '#2f8f8a', sun: '#e2702f' },
        { sky: '#ffe4ec', sea: '#8fd0e0', sun: '#fff6c8' },
      ])
      const m = Math.min(W, H)
      const hz = H * rr(r, 0.48, 0.62)
      for (let k = 0; k < 4; k++) rect(g, 0, (hz * k) / 4, W, hz / 4 + 1, mix(S.sky, '#ffffff', k * 0.12))
      const sx = W * rr(r, 0.2, 0.8)
      const sy = r() < 0.5 ? hz - m * 0.04 : H * rr(r, 0.15, 0.3)
      g.save()
      g.beginPath()
      g.rect(0, 0, W, hz)
      g.clip()
      circle(g, sx, sy, m * rr(r, 0.08, 0.12), S.sun)
      g.restore()
      if (r() < 0.6) cloud(g, W * rr(r, 0.1, 0.9), H * rr(r, 0.1, 0.25), m * 0.08, '#ffffff')
      rect(g, 0, hz, W, H - hz, S.sea)
      rect(g, 0, hz + (H - hz) * 0.5, W, (H - hz) * 0.5, dark(S.sea, 0.12))
      g.globalAlpha = 0.7
      for (let k = 0; k < 6; k++) {
        const w = m * 0.16 * (1 - k * 0.12)
        rect(g, sx - w / 2, hz + m * 0.02 + k * m * 0.035, w, Math.max(1, m * 0.012), S.sun)
      }
      g.globalAlpha = 0.45
      g.strokeStyle = '#ffffff'
      g.lineWidth = Math.max(1, m * 0.008)
      for (let k = 0; k < 10; k++) {
        const x = W * r()
        const y = hz + (H - hz) * rr(r, 0.15, 0.95)
        const s = m * rr(r, 0.02, 0.05)
        g.beginPath()
        g.arc(x, y, s, PI * 1.15, PI * 1.85)
        g.stroke()
      }
      g.globalAlpha = 1
      if (r() < 0.85) sailboat(g, W * rr(r, 0.2, 0.75), hz + (H - hz) * rr(r, 0.2, 0.45), m * rr(r, 0.07, 0.12), pick(r, ['#7a4a32', '#3a3a40', '#c8473a']), '#fbfaf6')
      if (r() < 0.3) {
        const x = r() < 0.5 ? W * 0.12 : W * 0.88
        poly(g, [x - m * 0.12, hz + m * 0.02, x - m * 0.04, hz - m * 0.05, x + m * 0.08, hz - m * 0.04, x + m * 0.14, hz + m * 0.02], '#5a5a50')
        rect(g, x - m * 0.02, hz - m * 0.25, m * 0.04, m * 0.2, '#fbfaf6')
        for (let k = 0; k < 3; k++) rect(g, x - m * 0.02, hz - m * 0.22 + k * m * 0.06, m * 0.04, m * 0.025, '#c8473a')
        rect(g, x - m * 0.025, hz - m * 0.28, m * 0.05, m * 0.03, '#f2c14e')
      }
      birds(g, r, W, hz, ri(r, 0, 4), '#3a3a40', 0.15, 0.7)
    },
  },
  {
    id: 'desert',
    label: '沙漠仙人掌',
    kinds: ['painting', 'poster'],
    styles: ['modern', 'retro', 'nordic', 'cute'],
    draw(g, W, H, r) {
      const S = pick(r, [
        ['#f6dcc0', '#e86a3a', '#e8b07a', '#d48a5a', '#b8643a', '#4f7a5a'],
        ['#fde9d9', '#f4a261', '#e9c46a', '#e7a46a', '#c87f4a', '#2a9d8f'],
        ['#e8e2d6', '#c9a87a', '#d8c4a4', '#bfa27e', '#9a7f5e', '#6f8a6a'],
        ['#2a2340', '#f2c14e', '#7a5a8a', '#5a4270', '#3e2f55', '#2f6f5a'],
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S[0])
      circle(g, W * rr(r, 0.3, 0.7), H * rr(r, 0.25, 0.4), m * rr(r, 0.14, 0.2), S[1])
      const ys = [ridge(g, W, H, H * 0.6, H * 0.05, r, S[2]), ridge(g, W, H, H * 0.72, H * 0.04, r, S[3]), ridge(g, W, H, H * 0.84, H * 0.035, r, S[4])]
      for (let k = 0; k < ri(r, 1, 3); k++) {
        const x = W * rr(r, 0.12, 0.88)
        const base = ys[k % 3](x) + H * 0.03
        const h = m * rr(r, 0.22, 0.36)
        const w = h * 0.16
        const c = S[5]
        g.fillStyle = c
        g.beginPath()
        g.roundRect(x - w / 2, base - h, w, h, w / 2)
        g.fill()
        for (const s of [-1, 1]) {
          if (r() < 0.25) continue
          const ay = base - h * rr(r, 0.35, 0.6)
          const ah = h * rr(r, 0.25, 0.4)
          g.beginPath()
          g.roundRect(x + s * w * 0.4 - (s < 0 ? w * 1.2 : 0), ay - w * 0.35, w * 1.2, w * 0.7, w * 0.35)
          g.roundRect(x + s * w * 1.4 - w * 0.35, ay - ah, w * 0.7, ah, w * 0.35)
          g.fill()
        }
      }
    },
  },
  {
    id: 'forest',
    label: '松林',
    kinds: ['painting', 'photo'],
    styles: ['nordic', 'farmhouse', 'industrial', 'classic'],
    draw(g, W, H, r) {
      const S = pick(r, [
        ['#dfe9ea', '#b8cbc8', '#8aa8a0', '#557a6a', '#2f4f42', '#fbf6e6'],
        ['#f2dcc8', '#d8b8a8', '#a88a88', '#6f5a64', '#3a3040', '#fff2d8'],
        ['#1f2f45', '#2f4560', '#3a5670', '#22384a', '#14222e', '#f2ecd0'],
        ['#eaf0e4', '#c8d8c0', '#9fbf98', '#6f9a6a', '#3f6a44', '#ffffff'],
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S[0])
      circle(g, W * rr(r, 0.2, 0.8), H * rr(r, 0.12, 0.25), m * rr(r, 0.06, 0.09), S[5])
      for (let row = 0; row < 3; row++) {
        const base = H * (0.55 + row * 0.15)
        rect(g, 0, base, W, H - base, S[row + 2])
        const n = Math.ceil((W / m) * (8 - row * 2))
        for (let k = 0; k <= n; k++) pine(g, (W * (k + rr(r, -0.3, 0.3))) / n, base + m * 0.01, m * rr(r, 0.14, 0.26) * (1 + row * 0.35), S[row + 2])
      }
      if (r() < 0.4) birds(g, r, W, H, 3, S[4], 0.1, 0.3)
    },
  },
  {
    id: 'nightsky',
    label: '星夜',
    kinds: ['painting', 'poster', 'photo'],
    styles: ['cute', 'modern', 'nordic', 'retro'],
    draw(g, W, H, r) {
      const S = pick(r, [
        ['#1d2b4f', '#2f4570', '#f6e7b0', '#14203a'],
        ['#2a1f4a', '#4a3a7a', '#ffe9a8', '#1a1430'],
        ['#0f2a3a', '#1f4a5a', '#e8f0e0', '#0a1a24'],
        ['#3a3f7a', '#6a6aa8', '#fff2c4', '#262a5a'],
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S[0])
      for (let k = 0; k < 80; k++) {
        g.globalAlpha = rr(r, 0.4, 1)
        circle(g, W * r(), H * r() * 0.75, m * rr(r, 0.003, 0.008), '#ffffff')
      }
      g.globalAlpha = 1
      for (let k = 0; k < ri(r, 3, 6); k++) star(g, W * r(), H * rr(r, 0.05, 0.55), m * rr(r, 0.015, 0.03), S[2], 4, 0.3)
      const mx = W * rr(r, 0.2, 0.8)
      const my = H * rr(r, 0.15, 0.3)
      const mr = m * rr(r, 0.08, 0.12)
      circle(g, mx, my, mr, S[2])
      if (r() < 0.6) circle(g, mx + mr * 0.45, my - mr * 0.2, mr * 0.85, S[0])
      else for (let k = 0; k < 3; k++) circle(g, mx + mr * rr(r, -0.5, 0.5), my + mr * rr(r, -0.5, 0.5), mr * 0.14, dark(S[2], 0.1))
      if (r() < 0.4) stroke(g, [W * 0.1, H * 0.1, W * 0.3, H * 0.2], '#ffffff', m * 0.006)
      const y1 = ridge(g, W, H, H * 0.72, H * 0.05, r, S[1])
      ridge(g, W, H, H * 0.85, H * 0.04, r, S[3])
      if (r() < 0.6) {
        const x = W * rr(r, 0.2, 0.8)
        const y = y1(x) + m * 0.02
        const s = m * 0.07
        rect(g, x - s, y - s, s * 2, s, dark(S[1], 0.3))
        poly(g, [x - s * 1.2, y - s, x, y - s * 1.8, x + s * 1.2, y - s], dark(S[1], 0.45))
        rect(g, x - s * 0.5, y - s * 0.7, s * 0.4, s * 0.35, '#ffd76a')
        rect(g, x + s * 0.2, y - s * 0.7, s * 0.4, s * 0.35, '#ffd76a')
      }
    },
  },
  {
    id: 'city',
    label: '城市天际线',
    kinds: ['painting', 'poster', 'photo'],
    styles: ['industrial', 'modern', 'retro'],
    draw(g, W, H, r) {
      const night = r() < 0.5
      const S = night
        ? pick(r, [
            { sky: '#1f2a44', far: '#34405e', near: '#141b2e', win: '#ffd76a', sun: '#f2ecd0' },
            { sky: '#3a2850', far: '#5a4070', near: '#1f1530', win: '#ff9fb4', sun: '#ffe0a0' },
          ])
        : pick(r, [
            { sky: '#e8e2d6', far: '#b8b4ac', near: '#5a5650', win: '#d8d2c6', sun: '#e2702f' },
            { sky: '#cfe0ea', far: '#9fb4c2', near: '#4a5a66', win: '#e8f0f4', sun: '#ffffff' },
            { sky: '#f6d0b0', far: '#d0907a', near: '#6a3f3a', win: '#ffd9a8', sun: '#fff0c8' },
          ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S.sky)
      circle(g, W * rr(r, 0.15, 0.85), H * rr(r, 0.12, 0.3), m * rr(r, 0.06, 0.1), S.sun)
      const ground = H * rr(r, 0.82, 0.9)
      for (const [col, hmin, hmax, wins] of [
        [S.far, 0.25, 0.55, false],
        [S.near, 0.15, 0.45, true],
      ] as const) {
        let x = -m * 0.05
        while (x < W) {
          const bw = m * rr(r, 0.07, 0.16)
          const bh = H * rr(r, hmin, hmax)
          const top = ground - bh
          rect(g, x, top, bw, bh, col)
          const roof = ri(r, 0, 3)
          if (roof === 1) rect(g, x + bw * 0.45, top - m * 0.08, Math.max(1, m * 0.008), m * 0.08, col)
          if (roof === 2) rect(g, x + bw * 0.2, top - m * 0.04, bw * 0.6, m * 0.04, col)
          if (roof === 3) poly(g, [x, top, x + bw / 2, top - bw * 0.5, x + bw, top], col)
          if (wins) {
            const cs = Math.max(2, m * 0.02)
            for (let wy = top + cs; wy < ground - cs * 1.5; wy += cs * 1.8)
              for (let wx = x + cs * 0.7; wx < x + bw - cs; wx += cs * 1.6) {
                if (night && r() < 0.45) continue
                g.globalAlpha = night ? 1 : 0.5
                rect(g, wx, wy, cs * 0.8, cs, S.win)
              }
            g.globalAlpha = 1
          }
          x += bw + m * rr(r, 0, 0.02)
        }
      }
      rect(g, 0, ground, W, H - ground, S.near)
      if (night) {
        g.globalAlpha = 0.6
        for (let k = 0; k < 14; k++) rect(g, W * r(), ground + (H - ground) * rr(r, 0.2, 0.8), m * rr(r, 0.02, 0.06), Math.max(1, m * 0.006), S.win)
        g.globalAlpha = 1
      }
    },
  },
  {
    id: 'pastoral',
    label: '古典田园',
    kinds: ['painting'],
    styles: ['classic', 'farmhouse', 'retro'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { sky: '#c8d6d8', cloud: '#f4efe2', f: ['#c9b880', '#a8a060', '#7f8a4a', '#5a6a3a'], tree: '#3f4f30', water: '#a8bcc0' },
        { sky: '#e8d8b8', cloud: '#fbf4e0', f: ['#d8c088', '#b8a060', '#8a8a4a', '#64683a'], tree: '#4a4a2a', water: '#c8c4a8' },
        { sky: '#b8ccd8', cloud: '#ffffff', f: ['#b8c890', '#90a868', '#6a8a50', '#4a6a3a'], tree: '#2f4a2a', water: '#9fb8c8' },
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S.sky)
      for (let k = 0; k < ri(r, 2, 4); k++) {
        const x = W * rr(r, 0.1, 0.9)
        const y = H * rr(r, 0.12, 0.35)
        const s = m * rr(r, 0.08, 0.14)
        for (let j = 0; j < 6; j++) circle(g, x + s * rr(r, -1.2, 1.2), y + s * rr(r, -0.4, 0.3), s * rr(r, 0.4, 0.7), S.cloud)
        g.globalAlpha = 0.25
        rect(g, x - s * 1.5, y + s * 0.2, s * 3, s * 0.25, S.sky)
        g.globalAlpha = 1
      }
      const ys: ((x: number) => number)[] = []
      S.f.forEach((c, i) => ys.push(ridge(g, W, H, H * (0.52 + i * 0.11), H * rr(r, 0.02, 0.05), r, c)))
      if (r() < 0.7) {
        g.fillStyle = S.water
        g.beginPath()
        const x0 = W * rr(r, 0.3, 0.7)
        g.moveTo(x0 - W * 0.01, ys[1](x0))
        g.bezierCurveTo(x0 - W * 0.2, H * 0.75, x0 + W * 0.3, H * 0.8, x0 + W * 0.05, H)
        g.lineTo(x0 + W * 0.35, H)
        g.bezierCurveTo(x0 + W * 0.5, H * 0.8, x0 + W * 0.05, H * 0.72, x0 + W * 0.01, ys[1](x0))
        g.fill()
      }
      const tx = r() < 0.5 ? W * rr(r, 0.12, 0.3) : W * rr(r, 0.7, 0.88)
      const tb = ys[2](tx) + H * 0.02
      const th = m * rr(r, 0.35, 0.5)
      rect(g, tx - th * 0.04, tb - th * 0.55, th * 0.08, th * 0.55, '#5a4030')
      for (let j = 0; j < 7; j++) blob(g, tx + th * rr(r, -0.25, 0.25), tb - th * rr(r, 0.55, 0.9), th * rr(r, 0.16, 0.24), r, j < 4 ? S.tree : light(S.tree, 0.15), 8, 0.3)
      g.globalAlpha = 0.25
      ellipse(g, tx + th * 0.1, tb, th * 0.3, th * 0.04, 0, '#2a2a1a')
      g.globalAlpha = 1
      for (let k = 0; k < ri(r, 0, 4); k++) {
        const x = W * rr(r, 0.1, 0.9)
        ellipse(g, x, ys[3](x) + H * 0.04, m * 0.025, m * 0.016, 0, '#f4efe2')
        circle(g, x + m * 0.025, ys[3](x) + H * 0.035, m * 0.01, '#3a3a30')
      }
      goldLine(g, W, H)
    },
  },
  {
    id: 'galleon',
    label: '古帆船',
    kinds: ['painting'],
    styles: ['classic', 'retro', 'industrial'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { sky: '#5a6a78', sea: '#2f4250', foam: '#d8dcd8', sail: '#e8dfc8' },
        { sky: '#d8c8a0', sea: '#6a7058', foam: '#f2e8cc', sail: '#f4ecd8' },
        { sky: '#a8c4d4', sea: '#3a6a80', foam: '#ffffff', sail: '#fbf6ea' },
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S.sky)
      for (let k = 0; k < 4; k++) blob(g, W * r(), H * rr(r, 0.05, 0.35), m * rr(r, 0.08, 0.16), r, light(S.sky, rr(r, 0.1, 0.3)), 9, 0.4)
      const hz = H * 0.66
      rect(g, 0, hz, W, H - hz, S.sea)
      const cx = W * rr(r, 0.4, 0.6)
      const s = Math.min(W * 0.32, H * 0.3)
      const hy = hz + s * 0.05
      const hull = '#5a3a24'
      g.fillStyle = hull
      g.beginPath()
      g.moveTo(cx - s, hy - s * 0.22)
      g.lineTo(cx + s * 0.9, hy - s * 0.12)
      g.quadraticCurveTo(cx + s * 0.75, hy + s * 0.18, cx + s * 0.5, hy + s * 0.2)
      g.lineTo(cx - s * 0.7, hy + s * 0.2)
      g.quadraticCurveTo(cx - s * 0.95, hy, cx - s, hy - s * 0.22)
      g.fill()
      rect(g, cx - s, hy - s * 0.38, s * 0.35, s * 0.18, hull)
      rect(g, cx - s * 0.85, hy - s * 0.1, s * 1.6, s * 0.04, '#c9a24a')
      for (const [dx, hgt] of [
        [-0.45, 1.1],
        [0.05, 1.35],
        [0.5, 1],
      ]) {
        const x = cx + s * dx
        stroke(g, [x, hy - s * 0.1, x, hy - s * hgt], '#3a2a1a', s * 0.03)
        for (let k = 0; k < 3; k++) {
          const top = hy - s * hgt + s * 0.12 + k * s * 0.3
          const w = s * (0.32 - k * 0.02) * (hgt / 1.2)
          g.fillStyle = S.sail
          g.beginPath()
          g.moveTo(x - w, top)
          g.lineTo(x + w, top)
          g.quadraticCurveTo(x + w * 1.15, top + s * 0.13, x + w, top + s * 0.25)
          g.lineTo(x - w, top + s * 0.25)
          g.quadraticCurveTo(x - w * 0.85, top + s * 0.13, x - w, top)
          g.fill()
        }
        poly(g, [x, hy - s * hgt, x + s * 0.12, hy - s * hgt + s * 0.03, x, hy - s * hgt + s * 0.06], '#b8322a')
      }
      g.strokeStyle = S.foam
      g.lineWidth = Math.max(1, m * 0.008)
      for (let k = 0; k < 14; k++) {
        const x = W * r()
        const y = hz + (H - hz) * rr(r, 0.1, 0.95)
        g.beginPath()
        g.arc(x, y, m * rr(r, 0.02, 0.05), PI * 1.1, PI * 1.9)
        g.stroke()
      }
      birds(g, r, W, H, ri(r, 2, 4), '#2a2a2a', 0.1, 0.4)
      goldLine(g, W, H)
    },
  },

  // ---------- 植物 / 静物 ----------
  {
    id: 'monstera',
    label: '热带叶',
    kinds: ['painting', 'poster'],
    styles: ['nordic', 'modern', 'cute', 'retro'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#f2ead8', '#e9dfd0', '#f4d6c6', '#d8e4dc', '#1f3a34', '#f6f4ef'])
      const greens = ['#2f6b4f', '#3f7f5a', '#5a9a6a', '#1f5040', '#7fae7a']
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const n = ri(r, 1, 3)
      for (let k = 0; k < n; k++) {
        const s = m * rr(r, 0.24, 0.36) * (n === 1 ? 1.3 : 1)
        const x = n === 1 ? W / 2 : W * rr(r, 0.25, 0.75)
        const y = n === 1 ? H * 0.45 : H * rr(r, 0.3, 0.65)
        const c = pick(r, greens)
        g.save()
        g.translate(x, y)
        g.rotate(rr(r, -0.7, 0.7))
        stroke(g, [0, s * 0.45, 0, s * 2.2], dark(c, 0.1), s * 0.07)
        if (r() < 0.65) {
          g.fillStyle = c
          g.beginPath()
          g.moveTo(0, s * 0.45)
          g.bezierCurveTo(-s * 1.1, s * 0.6, -s * 1.15, -s * 0.7, 0, -s)
          g.bezierCurveTo(s * 1.15, -s * 0.7, s * 1.1, s * 0.6, 0, s * 0.45)
          g.fill()
          g.strokeStyle = bg
          g.lineWidth = s * 0.07
          g.lineCap = 'butt'
          for (const d of [-1, 1])
            for (let i = 0; i < 4; i++) {
              const t = -0.7 + i * 0.36
              g.beginPath()
              g.moveTo(d * s * 0.42, s * t + s * 0.05)
              g.lineTo(d * s * 1.3, s * t - s * 0.25)
              g.stroke()
            }
          for (const d of [-1, 1]) ellipse(g, d * s * 0.25, -s * 0.1, s * 0.06, s * 0.1, 0, bg)
          stroke(g, [0, s * 0.45, 0, -s * 0.85], light(c, 0.25), s * 0.03)
        } else {
          // 棕榈叶
          stroke(g, [0, s * 0.45, 0, -s], c, s * 0.04)
          for (let i = 0; i < 9; i++) {
            const t = i / 9
            for (const d of [-1, 1]) leaf(g, 0, s * 0.35 - t * s * 1.3, s * (0.85 - t * 0.5), s * 0.07, -PI / 2 + d * (1.1 - t * 0.5), c)
          }
        }
        g.restore()
      }
    },
  },
  {
    id: 'bouquet',
    label: '瓶花静物',
    kinds: ['painting'],
    styles: ['classic', 'farmhouse', 'cute', 'retro', 'nordic'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { bg: '#3a3226', table: '#6a4a32', vase: '#c9a24a' },
        { bg: '#e9e1d0', table: '#c4a888', vase: '#6f8fa6' },
        { bg: '#cfd8d3', table: '#a89a88', vase: '#f4f1ea' },
        { bg: '#f4d8cf', table: '#e0b8a8', vase: '#7fb3a4' },
        { bg: '#2c3a4a', table: '#5a4a3a', vase: '#e8dcc8' },
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S.bg)
      const ty = H * 0.8
      rect(g, 0, ty, W, H - ty, S.table)
      rect(g, 0, ty, W, Math.max(1, m * 0.012), light(S.table, 0.2))
      const cx = W / 2
      const vw = m * rr(r, 0.12, 0.17)
      const vh = m * rr(r, 0.2, 0.3)
      const mouth = ty - vh
      const greens = ['#4f7f4a', '#6a9a5a', '#3f6a44']
      const flowers = ri(r, 5, 9)
      const petals = pick(r, [
        ['#e85a6a', '#f2a0b0', '#fbf6ee', '#f2c14e'],
        ['#f4f1ea', '#e8d0a8', '#c8b0d8', '#f2c14e'],
        ['#e86a3a', '#f2a541', '#fbe8a0', '#c8473a'],
        ['#a88ad8', '#f4f1ea', '#8ab0e0', '#f2c4d8'],
      ])
      const heads: [number, number][] = []
      for (let k = 0; k < flowers; k++) {
        const a = -PI / 2 + rr(r, -1.1, 1.1)
        const d = m * rr(r, 0.18, 0.34)
        heads.push([cx + Math.cos(a) * d * 1.1, mouth - m * 0.04 + Math.sin(a) * d])
      }
      for (const [x, y] of heads) stroke(g, [cx + (x - cx) * 0.1, mouth + vh * 0.2, x, y], pick(r, greens), m * 0.01)
      for (let k = 0; k < 6; k++) {
        const [x, y] = pick(r, heads)
        leaf(g, (x + cx) / 2, (y + mouth) / 2, m * 0.1, m * 0.03, rr(r, 0, TAU), pick(r, greens))
      }
      for (const [x, y] of heads) {
        const c = pick(r, petals)
        const s = m * rr(r, 0.045, 0.075)
        const t = ri(r, 0, 2)
        if (t === 0) blossom(g, x, y, s, c, '#f2c14e', r() * TAU)
        else if (t === 1) {
          circle(g, x, y, s, c)
          g.strokeStyle = dark(c, 0.2)
          g.lineWidth = Math.max(1, s * 0.12)
          g.beginPath()
          g.arc(x, y, s * 0.55, 0, PI * 1.5)
          g.stroke()
        } else {
          g.fillStyle = c
          g.beginPath()
          g.moveTo(x - s, y - s * 0.6)
          g.lineTo(x - s * 0.5, y - s * 0.1)
          g.lineTo(x, y - s * 0.7)
          g.lineTo(x + s * 0.5, y - s * 0.1)
          g.lineTo(x + s, y - s * 0.6)
          g.quadraticCurveTo(x + s, y + s * 0.8, x, y + s * 0.8)
          g.quadraticCurveTo(x - s, y + s * 0.8, x - s, y - s * 0.6)
          g.fill()
        }
      }
      const vt = ri(r, 0, 2)
      g.fillStyle = S.vase
      g.beginPath()
      if (vt === 0) {
        g.ellipse(cx, ty - vh * 0.42, vw, vh * 0.45, 0, 0, TAU)
        g.fill()
        rect(g, cx - vw * 0.35, mouth, vw * 0.7, vh * 0.3, S.vase)
      } else if (vt === 1) {
        g.moveTo(cx - vw * 0.5, mouth)
        g.lineTo(cx + vw * 0.5, mouth)
        g.lineTo(cx + vw * 0.75, ty)
        g.lineTo(cx - vw * 0.75, ty)
        g.fill()
      } else {
        g.roundRect(cx - vw * 0.7, mouth, vw * 1.4, vh, vw * 0.3)
        g.fill()
        g.strokeStyle = S.vase
        g.lineWidth = vw * 0.18
        g.beginPath()
        g.arc(cx + vw * 0.8, mouth + vh * 0.4, vw * 0.3, -PI / 2, PI / 2)
        g.stroke()
      }
      g.globalAlpha = 0.25
      ellipse(g, cx - vw * 0.3, ty - vh * 0.5, vw * 0.12, vh * 0.2, 0, '#ffffff')
      g.globalAlpha = 1
      if (S.bg === '#3a3226' || S.bg === '#2c3a4a') goldLine(g, W, H)
    },
  },
  {
    id: 'fruit',
    label: '水果静物',
    kinds: ['painting'],
    styles: ['classic', 'farmhouse', 'retro', 'cute'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { bg: '#2f2a22', table: '#5a3f2a', cloth: '#e8dfcc', bowl: '#8a6a4a' },
        { bg: '#ece4d4', table: '#b89a78', cloth: '#ffffff', bowl: '#5f7f9a' },
        { bg: '#f6e8dc', table: '#e4b8a0', cloth: '#fff6ee', bowl: '#a6d8c8' },
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S.bg)
      const ty = H * 0.68
      rect(g, 0, ty, W, H - ty, S.table)
      poly(g, [W * 0.15, ty, W * 0.7, ty, W * 0.82, H, W * 0.05, H], S.cloth)
      const cx = W * rr(r, 0.42, 0.58)
      const bw = m * 0.32
      const fr = m * rr(r, 0.07, 0.09)
      const fruits = ['#d8402a', '#e8a030', '#f2d24a', '#7fa84a', '#7a3a6a']
      const items: [number, number, string][] = []
      for (let k = 0; k < ri(r, 4, 6); k++) items.push([cx + rr(r, -bw * 0.75, bw * 0.75), ty - fr * rr(r, 0.4, 1.6), pick(r, fruits)])
      items.sort((a, b) => a[1] - b[1])
      for (const [x, y, c] of items) {
        if (c === '#7a3a6a') {
          for (let j = 0; j < 9; j++) circle(g, x + fr * rr(r, -0.6, 0.6), y + fr * (j / 9) * 1.3 - fr * 0.4, fr * 0.32, j % 2 ? c : light(c, 0.12))
        } else if (c === '#f2d24a') ellipse(g, x, y, fr * 1.15, fr * 0.8, 0.2, c)
        else {
          circle(g, x, y, fr, c)
          stroke(g, [x, y - fr * 0.8, x + fr * 0.1, y - fr * 1.2], '#5a3a24', fr * 0.12)
          if (r() < 0.5) leaf(g, x + fr * 0.1, y - fr * 1.05, fr * 0.6, fr * 0.2, -0.4, '#5a8a4a')
        }
        g.globalAlpha = 0.35
        circle(g, x - fr * 0.35, y - fr * 0.35, fr * 0.22, '#ffffff')
        g.globalAlpha = 1
      }
      g.fillStyle = S.bowl
      g.beginPath()
      g.moveTo(cx - bw, ty - fr * 0.3)
      g.quadraticCurveTo(cx - bw * 0.9, ty + fr * 1.2, cx, ty + fr * 1.2)
      g.quadraticCurveTo(cx + bw * 0.9, ty + fr * 1.2, cx + bw, ty - fr * 0.3)
      g.fill()
      rect(g, cx - bw * 0.3, ty + fr * 1.1, bw * 0.6, fr * 0.35, dark(S.bowl, 0.15))
      for (let k = 0; k < 2; k++) {
        const x = W * (k ? rr(r, 0.72, 0.86) : rr(r, 0.12, 0.26))
        const y = H * rr(r, 0.78, 0.86)
        const c = pick(r, fruits.slice(0, 3))
        circle(g, x, y, fr * 0.9, c)
        g.globalAlpha = 0.35
        circle(g, x - fr * 0.3, y - fr * 0.3, fr * 0.2, '#ffffff')
        g.globalAlpha = 1
      }
      if (S.bg === '#2f2a22') goldLine(g, W, H)
    },
  },
  {
    id: 'botanical',
    label: '植物图鉴',
    kinds: ['painting'],
    styles: ['farmhouse', 'nordic', 'classic', 'modern'],
    draw(g, W, H, r) {
      const paper = pick(r, ['#f3ecdc', '#efe9df', '#e8e4d4', '#f6f4ef'])
      const ink = '#3a3a30'
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      const kind = ri(r, 0, 4)
      const names = ['Triticum aestivum', 'Lavandula', 'Olea europaea', 'Polypodium', 'Eucalyptus']
      const cx = W / 2
      const top = H * 0.1
      const bot = H * 0.8
      const stems = W > H * 1.2 ? 3 : ri(r, 1, 2)
      for (let s = 0; s < stems; s++) {
        const x0 = cx + (s - (stems - 1) / 2) * Math.min(W * 0.28, m * 0.35)
        const lean = rr(r, -0.08, 0.08) * W
        const xAt = (t: number) => x0 + lean * t * t
        const yAt = (t: number) => bot - (bot - top) * t
        const green = ['#b8963a', '#6a7a5a', '#6a8050', '#4f7a4a', '#7f9a90'][kind]
        g.strokeStyle = green
        g.lineWidth = Math.max(1, m * 0.008)
        g.beginPath()
        g.moveTo(xAt(0), yAt(0))
        for (let i = 1; i <= 10; i++) g.lineTo(xAt(i / 10), yAt(i / 10))
        g.stroke()
        if (kind === 0) {
          for (let i = 0; i < 9; i++) {
            const t = 0.55 + i * 0.05
            for (const d of [-1, 1]) {
              ellipse(g, xAt(t) + d * m * 0.018, yAt(t), m * 0.02, m * 0.032, d * 0.4, '#d8b050')
              stroke(g, [xAt(t) + d * m * 0.025, yAt(t) - m * 0.02, xAt(t) + d * m * 0.06, yAt(t) - m * 0.1], '#c8a040', m * 0.003)
            }
          }
          leaf(g, xAt(0.2), yAt(0.2), m * 0.2, m * 0.02, -PI / 2 - 0.5, green)
        } else if (kind === 1) {
          for (let i = 0; i < 14; i++) {
            const t = 0.6 + i * 0.028
            for (const d of [-1, 1]) circle(g, xAt(t) + d * m * 0.012, yAt(t), m * 0.014, i % 2 ? '#8a6ab8' : '#a88ad0')
          }
          for (const d of [-1, 1]) leaf(g, xAt(0.15), yAt(0.15), m * 0.12, m * 0.012, -PI / 2 + d * 0.5, green)
        } else if (kind === 2) {
          for (let i = 0; i < 9; i++) {
            const t = 0.15 + i * 0.09
            const d = i % 2 ? 1 : -1
            leaf(g, xAt(t), yAt(t), m * 0.13, m * 0.022, -PI / 2 + d * 0.9, green)
            if (i % 3 === 1) ellipse(g, xAt(t) - d * m * 0.04, yAt(t) + m * 0.02, m * 0.022, m * 0.03, 0, '#3a4a2a')
          }
        } else if (kind === 3) {
          for (let i = 0; i < 16; i++) {
            const t = 0.1 + i * 0.055
            const l = m * 0.14 * Math.sin(Math.min(1, t) * PI) + m * 0.02
            for (const d of [-1, 1]) leaf(g, xAt(t), yAt(t), l, m * 0.018, -PI / 2 + d * 1.2, green)
          }
        } else {
          for (let i = 0; i < 8; i++) {
            const t = 0.15 + i * 0.1
            for (const d of [-1, 1]) circle(g, xAt(t) + d * m * 0.045, yAt(t), m * 0.04, i % 2 ? green : light(green, 0.15))
          }
        }
      }
      g.strokeStyle = ink
      g.lineWidth = Math.max(1, m * 0.004)
      g.strokeRect(m * 0.05, m * 0.05, W - m * 0.1, H - m * 0.1)
      text(g, names[kind], W / 2, H * 0.88, fitText(g, names[kind], m * 0.055, W * 0.8, SERIF, 'italic'), ink, SERIF, 'italic')
      rect(g, W * 0.35, H * 0.92, W * 0.3, Math.max(1, m * 0.004), ink)
    },
  },

  // ---------- 和风 ----------
  {
    id: 'wave',
    label: '浮世绘浪',
    kinds: ['painting', 'poster'],
    styles: ['japanese', 'modern', 'retro'],
    draw(g, W, H, r) {
      const paper = pick(r, ['#efe3c8', '#e8dcc0', '#f2ead6'])
      const ink = pick(r, ['#22406a', '#2f4f7a', '#1f3a5a'])
      const mid = '#6f95b8'
      const foam = '#f8f3e6'
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      if (r() < 0.45) {
        // 青海波
        const s = m / ri(r, 4, 6)
        for (let j = 0; j * s * 0.5 < H + s; j++)
          for (let i = -1; i * s < W + s; i++) {
            const x = i * s + (j % 2 ? s / 2 : 0)
            const y = j * s * 0.5
            for (let k = 0; k < 4; k++) {
              g.fillStyle = k % 2 ? foam : k === 0 ? ink : mid
              g.beginPath()
              g.arc(x, y, (s / 2) * (1 - k * 0.24), PI, TAU)
              g.fill()
            }
          }
        if (r() < 0.7) {
          const R = m * 0.22
          circle(g, W / 2, H / 2, R * 1.12, paper)
          circle(g, W / 2, H / 2, R, '#c8402a')
        }
        return
      }
      // 浪头朝左 / 朝右随机
      if (r() < 0.5) {
        g.translate(W, 0)
        g.scale(-1, 1)
      }
      rect(g, 0, 0, W, H * 0.12, mix(paper, '#8a7a60', rr(r, 0.1, 0.25)))
      const fx = W * 0.7
      const fy = H * 0.66
      const fs = m * 0.16
      poly(g, [fx - fs, fy, fx - fs * 0.12, fy - fs * 0.62, fx + fs * 0.12, fy - fs * 0.62, fx + fs, fy], ink)
      poly(g, [fx - fs * 0.35, fy - fs * 0.4, fx - fs * 0.12, fy - fs * 0.62, fx + fs * 0.12, fy - fs * 0.62, fx + fs * 0.35, fy - fs * 0.4, fx + fs * 0.1, fy - fs * 0.45, fx - fs * 0.1, fy - fs * 0.38], foam)
      // 大浪
      const body = () => {
        g.beginPath()
        g.moveTo(0, H)
        g.lineTo(0, H * 0.62)
        g.bezierCurveTo(W * 0.05, H * 0.25, W * 0.22, H * 0.08, W * 0.4, H * 0.12)
        g.bezierCurveTo(W * 0.55, H * 0.16, W * 0.6, H * 0.34, W * 0.5, H * 0.42)
        g.bezierCurveTo(W * 0.44, H * 0.46, W * 0.38, H * 0.4, W * 0.4, H * 0.34)
        g.bezierCurveTo(W * 0.3, H * 0.4, W * 0.32, H * 0.62, W * 0.55, H * 0.75)
        g.bezierCurveTo(W * 0.7, H * 0.82, W * 0.85, H * 0.78, W, H * 0.74)
        g.lineTo(W, H)
        g.closePath()
      }
      g.fillStyle = ink
      body()
      g.fill()
      g.save()
      body()
      g.clip()
      g.strokeStyle = mid
      g.lineWidth = Math.max(1, m * 0.012)
      for (let k = 1; k < 9; k++) {
        g.beginPath()
        g.ellipse(W * 0.42, H * 0.62, W * 0.06 * k, H * 0.07 * k, -0.4, PI * 0.9, PI * 1.9)
        g.stroke()
      }
      g.restore()
      for (let k = 0; k < 16; k++) {
        const t = k / 15
        const x = W * (0.12 + t * 0.42)
        const y = H * (0.2 - Math.sin(t * PI) * 0.1 + t * 0.12)
        circle(g, x, y, m * rr(r, 0.018, 0.03), foam)
        stroke(g, [x, y, x + m * 0.03, y + m * rr(r, 0.04, 0.07)], foam, m * 0.012)
      }
      for (let k = 0; k < 18; k++) circle(g, W * rr(r, 0.35, 0.7), H * rr(r, 0.08, 0.4), m * rr(r, 0.005, 0.012), foam)
      for (let k = 0; k < 3; k++) {
        const x = W * (0.6 + k * 0.14)
        const y = H * (0.8 + (k % 2) * 0.03)
        g.fillStyle = mid
        g.beginPath()
        g.ellipse(x, y, W * 0.08, H * 0.06, 0, PI, TAU)
        g.fill()
        for (let j = 0; j < 5; j++) circle(g, x - W * 0.06 + j * W * 0.03, y - H * 0.055 + Math.abs(j - 2) * H * 0.01, m * 0.014, foam)
      }
      ellipse(g, W * 0.62, H * 0.6, W * 0.12, m * 0.012, -0.15, '#d8c48a')
    },
  },
  {
    id: 'fuji',
    label: '富士山',
    kinds: ['painting', 'scroll', 'poster'],
    styles: ['japanese', 'modern', 'retro'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { sky: '#f2e6d0', mtn: '#3c5a80', snow: '#fbf7ee', sun: '#d9472b', ground: '#5a7a6a' },
        { sky: '#9ec3d8', mtn: '#b5432e', snow: '#f6f1e6', sun: '', ground: '#2f5a4a' },
        { sky: '#f6c7a2', mtn: '#5a4a6a', snow: '#fff2e6', sun: '#f2f0e0', ground: '#3a3050' },
        { sky: '#e9e4d8', mtn: '#4a5a64', snow: '#ffffff', sun: '#c8402a', ground: '#7a8a7a' },
      ])
      const m = Math.min(W, H)
      rect(g, 0, 0, W, H, S.sky)
      const hz = H * rr(r, 0.68, 0.76)
      const cx = W * rr(r, 0.42, 0.58)
      const top = hz - Math.min(H * 0.42, W * 0.48)
      const bw = Math.min(W * 0.55, (hz - top) * 1.5)
      const tw = bw * 0.1
      if (S.sun) circle(g, W * rr(r, 0.18, 0.82), H * rr(r, 0.1, 0.22), m * rr(r, 0.07, 0.1), S.sun)
      const mtn = () => {
        g.beginPath()
        g.moveTo(cx - bw, hz)
        g.quadraticCurveTo(cx - bw * 0.32, hz - (hz - top) * 0.3, cx - tw, top)
        g.lineTo(cx + tw, top)
        g.quadraticCurveTo(cx + bw * 0.32, hz - (hz - top) * 0.3, cx + bw, hz)
        g.closePath()
      }
      g.fillStyle = S.mtn
      mtn()
      g.fill()
      g.save()
      mtn()
      g.clip()
      const sy = top + (hz - top) * 0.32
      const pts: number[] = [cx - bw, top - 2, cx + bw, top - 2]
      const teeth = 7
      for (let k = 0; k <= teeth * 2; k++) {
        const x = cx + bw - ((bw * 2) / (teeth * 2)) * k
        pts.push(x, k % 2 ? sy + (hz - top) * 0.1 : sy - (hz - top) * 0.04)
      }
      poly(g, pts, S.snow)
      g.restore()
      for (let k = 0; k < ri(r, 2, 4); k++) {
        const y = top + (hz - top) * rr(r, 0.45, 0.9)
        const w = W * rr(r, 0.25, 0.5)
        const x = W * rr(r, -0.1, 0.8)
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.roundRect(x, y, w, m * 0.035, m * 0.0175)
        g.fill()
      }
      rect(g, 0, hz, W, H - hz, S.ground)
      const v = ri(r, 0, 2)
      if (v === 0) {
        g.strokeStyle = light(S.ground, 0.4)
        g.lineWidth = Math.max(1, m * 0.008)
        for (let k = 0; k < 10; k++) {
          const x = W * r()
          const y = hz + (H - hz) * rr(r, 0.2, 0.9)
          g.beginPath()
          g.arc(x, y, m * 0.03, PI * 1.1, PI * 1.9)
          g.stroke()
        }
      } else if (v === 1) {
        for (let k = 0; k < ri(r, 3, 7); k++) pine(g, W * r(), H, m * rr(r, 0.15, 0.3), dark(S.ground, 0.3))
      } else {
        const x = W * rr(r, 0.15, 0.3)
        const s = m * 0.12
        const red = '#c8402a'
        rect(g, x - s, hz - s * 1.6, s * 0.12, s * 1.6 + H - hz, red)
        rect(g, x + s * 0.88, hz - s * 1.6, s * 0.12, s * 1.6 + H - hz, red)
        rect(g, x - s * 1.3, hz - s * 1.8, s * 2.6, s * 0.16, red)
        rect(g, x - s * 1.1, hz - s * 1.45, s * 2.2, s * 0.1, red)
      }
    },
  },
  {
    id: 'bamboo',
    label: '墨竹',
    kinds: ['scroll', 'painting'],
    styles: ['japanese', 'chinese'],
    draw(g, W, H, r) {
      const paper = pick(r, ['#f3ecdc', '#efe6d2', '#e9e4d8', '#f6f1e4'])
      const ink = r() < 0.75 ? '#2b2b2b' : '#3f6a44'
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      const n = ri(r, 2, 4)
      for (let k = 0; k < n; k++) {
        const x0 = W * rr(r, 0.2, 0.8)
        const lean = rr(r, -0.12, 0.12) * W
        const w = m * rr(r, 0.035, 0.06)
        g.globalAlpha = rr(r, 0.45, 0.95)
        let y = H * 1.02
        const seg = H * rr(r, 0.1, 0.16)
        while (y > -seg) {
          const t0 = 1 - y / H
          const t1 = 1 - (y - seg) / H
          const xa = x0 + lean * t0
          const xb = x0 + lean * t1
          stroke(g, [xa, y - w * 0.3, xb, y - seg + w * 0.3], ink, w)
          stroke(g, [xb - w * 0.7, y - seg, xb + w * 0.7, y - seg], ink, w * 0.3)
          if (r() < 0.45) {
            const d = r() < 0.5 ? -1 : 1
            const bx = xb + d * m * 0.12
            const by = y - seg - m * 0.08
            stroke(g, [xb, y - seg, bx, by], ink, w * 0.18)
            for (let j = 0; j < ri(r, 3, 5); j++) leaf(g, bx, by, m * rr(r, 0.12, 0.2), m * 0.022, d > 0 ? rr(r, -0.3, 1.2) : PI - rr(r, -0.3, 1.2), ink)
          }
          y -= seg
        }
      }
      g.globalAlpha = 1
      vtext(g, pick(r, ['清風', '竹林', '虚心', '節操', '平安']), W * 0.12, H * 0.1, m * 0.07, '#2b2b2b')
      seal(g, W * 0.12 - m * 0.03, H * 0.1 + m * 0.18, m * 0.06)
    },
  },
  {
    id: 'enso',
    label: '圆相',
    kinds: ['scroll', 'painting'],
    styles: ['japanese', 'modern', 'chinese'],
    draw(g, W, H, r) {
      const paper = pick(r, ['#f3ecdc', '#efe6d2', '#f6f4ef', '#e8e0cc'])
      const ink = pick(r, ['#1f1f1f', '#2a2a2a', '#7a2a24'])
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      const cx = W / 2
      const cy = H > W * 1.5 ? H * 0.38 : H / 2
      const R = m * 0.32
      const a0 = rr(r, 0, TAU)
      const span = TAU * rr(r, 0.82, 0.93)
      const N = 90
      g.lineCap = 'round'
      for (let k = 0; k < N; k++) {
        const t = k / N
        const a = a0 + span * t
        const w = m * 0.07 * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.6 + 0.2) * PI * 0.9))
        g.strokeStyle = ink
        g.lineWidth = Math.max(1, w)
        g.globalAlpha = 0.9 - t * 0.25
        g.beginPath()
        g.arc(cx, cy, R + Math.sin(t * 5) * m * 0.006, a, a + span / N + 0.02)
        g.stroke()
      }
      g.globalAlpha = 0.6
      g.strokeStyle = paper
      g.lineWidth = Math.max(1, m * 0.004)
      for (let k = 0; k < 3; k++) {
        g.beginPath()
        g.arc(cx, cy, R + m * rr(r, -0.02, 0.02), a0 + span * 0.55, a0 + span * 0.98)
        g.stroke()
      }
      g.globalAlpha = 1
      if (H > W * 1.4) vtext(g, pick(r, ['無', '一期一会', '日日是好日', '和敬清寂']), W * 0.75, cy + R * 1.3, m * 0.08, '#2b2b2b')
      seal(g, W * 0.72, H * 0.88, m * 0.07)
    },
  },
  {
    id: 'koi',
    label: '锦鲤',
    kinds: ['painting', 'scroll'],
    styles: ['japanese', 'chinese'],
    draw(g, W, H, r) {
      const water = pick(r, ['#2f5f6f', '#1f4a5a', '#efe6d2', '#3a5a50'])
      const paper = water === '#efe6d2'
      rect(g, 0, 0, W, H, water)
      const m = Math.min(W, H)
      g.strokeStyle = paper ? '#9fb8c8' : light(water, 0.25)
      g.lineWidth = Math.max(1, m * 0.006)
      for (let k = 0; k < 6; k++) {
        const x = W * r()
        const y = H * r()
        for (let j = 1; j < 4; j++) {
          g.beginPath()
          g.ellipse(x, y, m * 0.04 * j, m * 0.02 * j, 0, 0, TAU)
          g.stroke()
        }
      }
      for (let k = 0; k < ri(r, 1, 3); k++) {
        const x = W * r()
        const y = H * r()
        const s = m * rr(r, 0.08, 0.13)
        g.fillStyle = '#4f8a5a'
        g.beginPath()
        g.moveTo(x, y)
        g.arc(x, y, s, 0.3, TAU - 0.1)
        g.closePath()
        g.fill()
      }
      const n = ri(r, 2, 4)
      for (let k = 0; k < n; k++) {
        const L = m * rr(r, 0.24, 0.34)
        const x = W * rr(r, 0.2, 0.8)
        const y = H * rr(r, 0.15, 0.85)
        const base = pick(r, ['#fbf7ee', '#f08a24', '#f2c14e', '#fbf7ee'])
        g.save()
        g.translate(x, y)
        g.rotate(rr(r, 0, TAU))
        const bodyPath = () => {
          g.beginPath()
          g.moveTo(-L * 0.5, 0)
          g.bezierCurveTo(-L * 0.5, -L * 0.18, L * 0.1, -L * 0.16, L * 0.35, -L * 0.04)
          g.lineTo(L * 0.35, L * 0.04)
          g.bezierCurveTo(L * 0.1, L * 0.16, -L * 0.5, L * 0.18, -L * 0.5, 0)
        }
        for (const d of [-1, 1]) ellipse(g, -L * 0.15, d * L * 0.14, L * 0.1, L * 0.045, d * 0.6, light(base, 0.3))
        g.fillStyle = base
        g.beginPath()
        g.moveTo(L * 0.3, 0)
        g.quadraticCurveTo(L * 0.55, -L * 0.18, L * 0.62, -L * 0.14)
        g.quadraticCurveTo(L * 0.5, 0, L * 0.62, L * 0.14)
        g.quadraticCurveTo(L * 0.55, L * 0.18, L * 0.3, 0)
        g.fill()
        g.fillStyle = base
        bodyPath()
        g.fill()
        g.save()
        bodyPath()
        g.clip()
        for (let j = 0; j < 3; j++) blob(g, rr(r, -0.4, 0.2) * L, rr(r, -0.1, 0.1) * L, L * rr(r, 0.08, 0.14), r, r() < 0.7 ? '#e0452a' : '#2a2a2a', 7, 0.5)
        g.restore()
        circle(g, -L * 0.38, -L * 0.07, L * 0.02, '#1f1f1f')
        circle(g, -L * 0.38, L * 0.07, L * 0.02, '#1f1f1f')
        g.restore()
      }
    },
  },
  {
    id: 'sakura',
    label: '樱枝',
    kinds: ['painting', 'scroll', 'poster'],
    styles: ['japanese', 'cute', 'chinese'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#f6efe6', '#dfeaf2', '#2c3550', '#f3e6dc', '#fff4f6'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const bark = bg === '#2c3550' ? '#1a1f30' : '#4a3530'
      const spots: [number, number][] = []
      const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
        const ex = x + Math.cos(ang) * len
        const ey = y + Math.sin(ang) * len
        const mx = (x + ex) / 2 + rr(r, -0.15, 0.15) * len
        const my = (y + ey) / 2 + rr(r, -0.15, 0.15) * len
        g.strokeStyle = bark
        g.lineWidth = Math.max(1, w)
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(mx, my, ex, ey)
        g.stroke()
        spots.push([mx, my], [ex, ey])
        if (depth <= 0) return
        branch(ex, ey, ang + rr(r, -0.45, 0.45), len * 0.72, w * 0.66, depth - 1)
        if (r() < 0.7) branch(ex, ey, ang + (r() < 0.5 ? -1 : 1) * rr(r, 0.5, 0.9), len * 0.6, w * 0.55, depth - 1)
      }
      const fromLeft = r() < 0.5
      const sx0 = fromLeft ? -m * 0.05 : W + m * 0.05
      const sy0 = H * rr(r, 0.1, 0.75)
      const toC = Math.atan2(H * 0.45 - sy0, W / 2 - sx0)
      branch(sx0, sy0, toC + rr(r, -0.35, 0.35), Math.hypot(W, H) * 0.26, m * 0.075, 4)
      const petal = pick(r, ['#f6b8c8', '#f9cdd8', '#ffffff', '#f4a0b8'])
      for (const [x, y] of spots) {
        if (r() < 0.1) continue
        for (let j = 0; j < ri(r, 2, 4); j++) blossom(g, x + m * rr(r, -0.07, 0.07), y + m * rr(r, -0.07, 0.07), m * rr(r, 0.04, 0.065), r() < 0.3 ? light(petal, 0.4) : petal, '#e05a7a', r() * TAU)
      }
      for (let k = 0; k < 14; k++) ellipse(g, W * r(), H * r(), m * 0.02, m * 0.012, r() * TAU, petal)
    },
  },

  // ---------- 中式 ----------
  {
    id: 'shanshui',
    label: '水墨山水',
    kinds: ['scroll', 'painting'],
    styles: ['chinese', 'japanese'],
    draw(g, W, H, r) {
      const paper = pick(r, ['#efe6d2', '#f2ebdc', '#e8e0cc', '#f4efe4'])
      const qinglv = r() < 0.3
      const ink = '#2b2b2b'
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      const layers = 4
      for (let L = 0; L < layers; L++) {
        const base = H * (0.38 + L * 0.17)
        const col = qinglv ? mix(paper, L % 2 ? '#3f7a72' : '#5a8a6a', 0.3 + L * 0.18) : mix(paper, ink, 0.18 + L * 0.2)
        const n = ri(r, 1, 3)
        for (let k = 0; k < n; k++) {
          const x = W * rr(r, 0.1, 0.9)
          const bw = W * rr(r, 0.35, 0.7)
          const ph = H * rr(r, 0.18, 0.32) * (L === 0 ? 1.3 : 1)
          g.fillStyle = col
          g.beginPath()
          g.moveTo(x - bw / 2, base + H * 0.05)
          g.bezierCurveTo(x - bw * 0.4, base - ph * 0.6, x - bw * 0.15, base - ph, x, base - ph)
          g.bezierCurveTo(x + bw * 0.2, base - ph * 0.95, x + bw * 0.45, base - ph * 0.45, x + bw / 2, base + H * 0.05)
          g.closePath()
          g.fill()
          if (L >= 2) {
            g.strokeStyle = mix(col, ink, 0.5)
            g.lineWidth = Math.max(1, m * 0.006)
            for (let j = 0; j < 4; j++) {
              const sx = x + bw * rr(r, -0.25, 0.25)
              const sy = base - ph * rr(r, 0.2, 0.7)
              g.beginPath()
              g.moveTo(sx, sy)
              g.quadraticCurveTo(sx + m * 0.03, sy + m * 0.05, sx + m * 0.01, sy + m * 0.1)
              g.stroke()
            }
            for (let j = 0; j < 3; j++) {
              const tx = x + bw * rr(r, -0.15, 0.15)
              const ty = base - ph * rr(r, 0.85, 1)
              for (let q = 0; q < 4; q++) circle(g, tx + m * rr(r, -0.025, 0.025), ty - m * rr(r, 0, 0.04), m * 0.014, mix(col, ink, 0.6))
            }
          }
        }
        g.globalAlpha = 0.75
        rect(g, 0, base, W, H * 0.06, paper)
        g.globalAlpha = 1
      }
      rect(g, 0, H * 0.9, W, H * 0.1, paper)
      const bx = W * rr(r, 0.3, 0.7)
      const by = H * rr(r, 0.86, 0.92)
      const bs = m * 0.06
      g.fillStyle = ink
      g.beginPath()
      g.moveTo(bx - bs, by)
      g.quadraticCurveTo(bx, by + bs * 0.4, bx + bs, by)
      g.closePath()
      g.fill()
      circle(g, bx + bs * 0.2, by - bs * 0.2, bs * 0.15, ink)
      birds(g, r, W, H, ri(r, 2, 4), mix(paper, ink, 0.7), 0.08, 0.22)
      vtext(g, pick(r, ['山高水长', '江山如画', '溪山清远', '烟雨', '云山']), W * 0.86, H * 0.06, m * 0.07, ink)
      seal(g, W * 0.86 - m * 0.03, H * 0.06 + m * 0.4, m * 0.06)
    },
  },
  {
    id: 'plum',
    label: '红梅',
    kinds: ['scroll', 'painting'],
    styles: ['chinese', 'japanese', 'classic'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { bg: '#efe6d2', bark: '#2b2b2b', bloom: '#c8323a', center: '#f2c14e' },
        { bg: '#2a2522', bark: '#0f0d0c', bloom: '#fbf4ea', center: '#e8c36a' },
        { bg: '#e8efe6', bark: '#3a3530', bloom: '#e8a0a8', center: '#c8323a' },
        { bg: '#f4efe4', bark: '#4a3a30', bloom: '#d8404a', center: '#f8e0a0' },
      ])
      rect(g, 0, 0, W, H, S.bg)
      const m = Math.min(W, H)
      const spots: [number, number][] = []
      let x = W * rr(r, 0.1, 0.3)
      let y = H
      let ang = -PI / 2 + rr(r, 0.1, 0.5)
      let w = m * 0.06
      const steps = ri(r, 6, 9)
      for (let k = 0; k < steps; k++) {
        const len = Math.max(W, H) * rr(r, 0.08, 0.14)
        const nx = x + Math.cos(ang) * len
        const ny = y + Math.sin(ang) * len
        stroke(g, [x, y, nx, ny], S.bark, w)
        spots.push([nx, ny])
        if (r() < 0.7) {
          const ba = ang + (r() < 0.5 ? -1 : 1) * rr(r, 0.6, 1.1)
          const bl = len * rr(r, 0.6, 1.1)
          const bx = nx + Math.cos(ba) * bl
          const by = ny + Math.sin(ba) * bl
          stroke(g, [nx, ny, bx, by], S.bark, w * 0.35)
          spots.push([bx, by], [(nx + bx) / 2, (ny + by) / 2])
          stroke(g, [bx, by, bx + Math.cos(ba - 0.3) * bl * 0.4, by + Math.sin(ba - 0.3) * bl * 0.4], S.bark, w * 0.15)
        }
        x = nx
        y = ny
        ang += rr(r, -0.7, 0.7)
        ang = Math.max(-PI * 0.95, Math.min(-PI * 0.05, ang))
        w *= 0.8
      }
      for (const [px, py] of spots) {
        for (let j = 0; j < ri(r, 1, 3); j++) {
          const bx = px + m * rr(r, -0.04, 0.04)
          const by = py + m * rr(r, -0.04, 0.04)
          if (r() < 0.25) circle(g, bx, by, m * 0.012, S.bloom)
          else blossom(g, bx, by, m * rr(r, 0.022, 0.035), S.bloom, S.center, r() * TAU)
        }
      }
      vtext(g, pick(r, ['暗香', '梅开五福', '疏影横斜', '报春']), W * 0.85, H * 0.08, m * 0.07, S.bg === '#2a2522' ? '#e8dcc0' : '#2b2b2b')
      seal(g, W * 0.85 - m * 0.03, H * 0.08 + m * 0.36, m * 0.06)
    },
  },
  {
    id: 'calligraphy',
    label: '书法',
    kinds: ['scroll', 'painting'],
    styles: ['chinese', 'japanese'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { paper: '#f3ecdc', ink: '#1f1f1f' },
        { paper: '#efe2c4', ink: '#2a2a2a' },
        { paper: '#b8322a', ink: '#1f1a14' },
        { paper: '#f6f4ef', ink: '#1f1f1f' },
      ])
      rect(g, 0, 0, W, H, S.paper)
      if (S.paper === '#b8322a') {
        g.globalAlpha = 0.3
        for (let k = 0; k < 30; k++) circle(g, W * r(), H * r(), Math.min(W, H) * 0.01, '#e8c36a')
        g.globalAlpha = 1
      }
      const m = Math.min(W, H)
      const tall = H > W * 1.3
      const phrase = tall
        ? pick(r, ['花鳥風月', '一期一会', '上善若水', '宁静致远', '厚德载物', '天道酬勤', '行云流水', '和敬清寂', '明月清风', '春华秋实'])
        : pick(r, ['福', '和', '静', '夢', '寿', '禅', '道', '心', '忍', '龍', '愛', '誠', '楽', '雅', '春', '山'])
      const n = [...phrase].length
      const size = tall ? Math.min(W * 0.62, (H * 0.78) / n) : m * 0.68
      const x = tall ? W * 0.55 : W / 2
      const y0 = tall ? (H - size * n * 1.04) / 2 + size / 2 : H * 0.47
      ;[...phrase].forEach((ch, i) => {
        g.globalAlpha = 0.25
        text(g, ch, x + size * 0.02, y0 + i * size * 1.04 + size * 0.02, size, S.ink, CJK)
        g.globalAlpha = 1
        text(g, ch, x, y0 + i * size * 1.04, size, S.ink, CJK)
      })
      const sx = tall ? W * 0.18 : W * 0.86
      const sy = tall ? H * 0.55 : H * 0.62
      vtext(g, pick(r, ['丙午年', '春日', '秋月', '山人']), sx, sy, m * 0.06, S.ink)
      seal(g, sx - m * 0.03, sy + m * 0.3, m * 0.06, S.paper === '#b8322a' ? '#e8c36a' : '#c0392b')
    },
  },
  {
    id: 'lotus',
    label: '荷花',
    kinds: ['scroll', 'painting'],
    styles: ['chinese', 'japanese', 'classic'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#efe6d2', '#e8efe6', '#f4efe4', '#24343a'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const green = bg === '#24343a' ? '#3f6a5a' : '#4f7f5a'
      for (let k = 0; k < ri(r, 2, 4); k++) {
        const x = W * rr(r, 0.1, 0.9)
        const y = H * rr(r, 0.55, 0.92)
        const s = m * rr(r, 0.14, 0.22)
        stroke(g, [x, y, x + rr(r, -0.1, 0.1) * W, H], dark(green, 0.15), m * 0.012)
        g.fillStyle = k % 2 ? green : light(green, 0.12)
        g.beginPath()
        g.ellipse(x, y, s, s * 0.55, rr(r, -0.2, 0.2), 0.2, TAU - 0.2)
        g.lineTo(x, y)
        g.fill()
        g.strokeStyle = light(green, 0.3)
        g.lineWidth = Math.max(1, m * 0.004)
        for (let j = 0; j < 8; j++) {
          const a = (j / 8) * TAU + 0.4
          g.beginPath()
          g.moveTo(x, y)
          g.lineTo(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.5)
          g.stroke()
        }
      }
      const pink = pick(r, ['#f2a0b0', '#f6c0c8', '#fbf4ea'])
      for (let k = 0; k < ri(r, 1, 3); k++) {
        const x = W * rr(r, 0.2, 0.8)
        const y = H * rr(r, 0.25, 0.55)
        const s = m * rr(r, 0.1, 0.15)
        stroke(g, [x, y + s * 0.3, x + rr(r, -0.1, 0.1) * W, H], dark(green, 0.15), m * 0.01)
        for (let j = 0; j < 7; j++) {
          const a = -PI / 2 + (j - 3) * 0.38
          leaf(g, x, y + s * 0.35, s * (1 - Math.abs(j - 3) * 0.1), s * 0.28, a, j % 2 ? pink : light(pink, 0.3))
        }
        g.globalAlpha = 0.5
        for (let j = 0; j < 7; j++) circle(g, x + Math.cos(-PI / 2 + (j - 3) * 0.38) * s * 0.9, y + s * 0.35 + Math.sin(-PI / 2 + (j - 3) * 0.38) * s * 0.9, s * 0.06, '#d9607a')
        g.globalAlpha = 1
        ellipse(g, x, y + s * 0.2, s * 0.18, s * 0.1, 0, '#e8c84a')
      }
      seal(g, W * 0.1, H * 0.1, m * 0.06)
    },
  },

  // ---------- 古典 ----------
  {
    id: 'portrait',
    label: '古典肖像',
    kinds: ['painting'],
    styles: ['classic', 'retro'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#3a3a2a', '#2f3b3a', '#4a3328', '#1f2a30', '#5a4a3a'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      g.globalAlpha = 0.25
      ellipse(g, W / 2, H * 0.42, W * 0.42, H * 0.4, 0, light(bg, 0.35))
      g.globalAlpha = 1
      const skin = pick(r, ['#f1d2b6', '#e3b896', '#c99a74'])
      const garment = pick(r, ['#2a2a30', '#5a2a2a', '#2f4a3a', '#3a3050', '#7a5a2a'])
      const hair = pick(r, ['#3a2a20', '#6a4a2a', '#a07a4a', '#e8e0d0', '#1a1a1a'])
      const cx = W / 2
      const hs = Math.min(W * 0.19, H * 0.15)
      const hy = H * 0.4
      const style = ri(r, 0, 4)
      if (style === 1) ellipse(g, cx, hy + hs * 0.9, hs * 1.15, hs * 1.7, 0, hair)
      ellipse(g, cx, H * 1.02, W * 0.45, H * 0.36, 0, garment)
      if (r() < 0.5) {
        for (let k = 0; k < 9; k++) {
          const a = PI + (k / 8) * PI
          circle(g, cx + Math.cos(a) * hs * 0.9, hy + hs * 1.55 - Math.sin(a) * hs * 0.25, hs * 0.22, '#f4efe2')
        }
      } else {
        poly(g, [cx - hs * 0.7, hy + hs * 1.35, cx + hs * 0.7, hy + hs * 1.35, cx, hy + hs * 2.3], skin)
        if (r() < 0.6) for (let k = 0; k < 9; k++) circle(g, cx + (k - 4) * hs * 0.13, hy + hs * 1.6 + Math.abs(k - 4) ** 2 * -hs * 0.012 + hs * 0.15, hs * 0.05, '#f4efe2')
      }
      rect(g, cx - hs * 0.32, hy + hs * 0.6, hs * 0.64, hs * 0.8, dark(skin, 0.06))
      ellipse(g, cx, hy, hs * 0.78, hs, 0, skin)
      g.globalAlpha = 0.2
      ellipse(g, cx + hs * 0.35, hy + hs * 0.1, hs * 0.35, hs * 0.75, 0, '#5a3a2a')
      g.globalAlpha = 1
      if (style === 4) {
        g.fillStyle = '#2f5a9a'
        g.beginPath()
        g.ellipse(cx - hs * 0.05, hy - hs * 0.45, hs * 0.95, hs * 0.65, -0.15, PI * 0.95, TAU * 1.02)
        g.fill()
        ellipse(g, cx + hs * 0.55, hy + hs * 0.2, hs * 0.25, hs * 0.8, -0.2, '#e8c45a')
        circle(g, cx - hs * 0.6, hy + hs * 0.35, hs * 0.09, '#f4f4f0')
      } else if (style === 3) {
        for (const d of [-1, 1]) for (let k = 0; k < 3; k++) circle(g, cx + d * hs * 0.85, hy - hs * 0.2 + k * hs * 0.35, hs * 0.22, hair)
        ellipse(g, cx, hy - hs * 0.6, hs * 0.9, hs * 0.55, 0, hair)
      } else {
        g.fillStyle = hair
        g.beginPath()
        g.ellipse(cx, hy - hs * 0.15, hs * 0.86, hs * 0.92, 0, PI * 1.02, PI * 1.98)
        g.fill()
        if (style === 2) circle(g, cx, hy - hs * 1.05, hs * 0.38, hair)
      }
      for (const d of [-1, 1]) ellipse(g, cx + d * hs * 0.3, hy + hs * 0.05, hs * 0.09, hs * 0.06, 0, '#2a1f1a')
      stroke(g, [cx, hy + hs * 0.1, cx - hs * 0.05, hy + hs * 0.35, cx + hs * 0.05, hy + hs * 0.38], dark(skin, 0.2), hs * 0.04)
      ellipse(g, cx, hy + hs * 0.58, hs * 0.16, hs * 0.05, 0, '#b8584a')
      g.globalAlpha = 0.3
      for (const d of [-1, 1]) circle(g, cx + d * hs * 0.45, hy + hs * 0.35, hs * 0.15, '#e8806a')
      g.globalAlpha = 1
      goldLine(g, W, H)
      void m
    },
  },

  // ---------- 乡村 ----------
  {
    id: 'rooster',
    label: '公鸡',
    kinds: ['painting', 'poster'],
    styles: ['farmhouse', 'retro'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { bg: '#f3ead6', ink: '#2a2a2a' },
        { bg: '#d9dcc8', ink: '#2f3a2a' },
        { bg: '#a8382c', ink: '#f3ead6' },
        { bg: '#eae4d8', ink: '#3a4a5a' },
      ])
      rect(g, 0, 0, W, H, S.bg)
      const m = Math.min(W, H)
      const s = m * 0.3
      const cx = W / 2
      const cy = H * 0.5
      const tails = ['#2f4a3a', '#1f1f1f', '#8a4a2a', '#3a5a6a']
      g.lineCap = 'round'
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = tails[k % tails.length]
        g.lineWidth = s * 0.13
        g.beginPath()
        g.arc(cx + s * 0.55, cy - s * 0.1, s * (0.75 - k * 0.07), PI * (1.35 + k * 0.03), PI * (2.25 - k * 0.02))
        g.stroke()
      }
      ellipse(g, cx, cy + s * 0.15, s * 0.75, s * 0.55, 0.1, '#c8642a')
      ellipse(g, cx - s * 0.1, cy + s * 0.12, s * 0.45, s * 0.3, 0.2, '#8a3a1f')
      ellipse(g, cx - s * 0.55, cy - s * 0.25, s * 0.25, s * 0.45, -0.3, '#e0902a')
      circle(g, cx - s * 0.6, cy - s * 0.65, s * 0.22, '#e0902a')
      for (let k = 0; k < 3; k++) circle(g, cx - s * 0.72 + k * s * 0.12, cy - s * 0.88 + Math.abs(k - 1) * s * 0.05, s * 0.1, '#d8302a')
      ellipse(g, cx - s * 0.78, cy - s * 0.42, s * 0.06, s * 0.12, 0, '#d8302a')
      poly(g, [cx - s * 0.8, cy - s * 0.68, cx - s * 1.02, cy - s * 0.6, cx - s * 0.8, cy - s * 0.55], '#f2c14e')
      circle(g, cx - s * 0.63, cy - s * 0.68, s * 0.035, '#1f1f1f')
      for (const d of [-0.15, 0.15]) stroke(g, [cx + d * s, cy + s * 0.65, cx + d * s, cy + s * 1.0, cx + d * s - s * 0.12, cy + s * 1.05], '#e8a030', s * 0.05)
      rect(g, 0, cy + s * 1.05, W, Math.max(1, m * 0.008), S.ink)
      if (r() < 0.6) {
        const word = pick(r, ['FARM FRESH', 'GOOD MORNING', 'EST. 1928', 'COUNTRY LIFE'])
        text(g, word, W / 2, H * 0.12, fitText(g, word, m * 0.09, W * 0.8, SERIF), S.ink, SERIF)
      }
    },
  },
  {
    id: 'barn',
    label: '红谷仓',
    kinds: ['painting', 'photo'],
    styles: ['farmhouse', 'cute', 'retro'],
    draw(g, W, H, r) {
      const sky = pick(r, ['#cfe3ea', '#f4dcc0', '#e8ecef', '#dbe8d0'])
      rect(g, 0, 0, W, H, sky)
      const m = Math.min(W, H)
      if (r() < 0.6) circle(g, W * rr(r, 0.15, 0.85), H * rr(r, 0.1, 0.22), m * 0.07, '#fff4c8')
      cloud(g, W * rr(r, 0.1, 0.9), H * 0.18, m * 0.08, '#ffffff')
      ridge(g, W, H, H * 0.6, H * 0.04, r, '#a8c08a')
      const gy = ridge(g, W, H, H * 0.72, H * 0.02, r, '#88a86a')
      const bc = pick(r, ['#a83a2c', '#b8422e', '#8a9a8a', '#f2ece0'])
      const trim = bc === '#f2ece0' ? '#3a4a3a' : '#f6f1e6'
      const cx = W * rr(r, 0.35, 0.6)
      const bw = m * 0.24
      const bh = m * 0.2
      const by = gy(cx) + m * 0.02
      rect(g, cx - bw / 2, by - bh, bw, bh, bc)
      poly(g, [cx - bw * 0.56, by - bh, cx - bw * 0.42, by - bh - bw * 0.3, cx, by - bh - bw * 0.48, cx + bw * 0.42, by - bh - bw * 0.3, cx + bw * 0.56, by - bh], dark(bc, 0.25))
      const dw = bw * 0.4
      rect(g, cx - dw / 2, by - bh * 0.65, dw, bh * 0.65, bc)
      g.strokeStyle = trim
      g.lineWidth = Math.max(1, m * 0.008)
      g.strokeRect(cx - dw / 2, by - bh * 0.65, dw, bh * 0.65)
      g.beginPath()
      g.moveTo(cx - dw / 2, by - bh * 0.65)
      g.lineTo(cx + dw / 2, by)
      g.moveTo(cx + dw / 2, by - bh * 0.65)
      g.lineTo(cx - dw / 2, by)
      g.stroke()
      rect(g, cx - bw * 0.08, by - bh - bw * 0.25, bw * 0.16, bw * 0.12, trim)
      const sx = cx + bw * 0.72
      rect(g, sx - bw * 0.12, by - bh * 1.5, bw * 0.24, bh * 1.5, '#b8bcbc')
      g.fillStyle = '#8a9090'
      g.beginPath()
      g.arc(sx, by - bh * 1.5, bw * 0.12, PI, TAU)
      g.fill()
      for (let k = 0; k < 12; k++) {
        const x = (W * k) / 11
        rect(g, x - m * 0.006, H * 0.86, m * 0.012, m * 0.07, '#f6f1e6')
      }
      rect(g, 0, H * 0.875, W, m * 0.01, '#f6f1e6')
      rect(g, 0, H * 0.905, W, m * 0.01, '#f6f1e6')
      if (r() < 0.6) lollipop(g, W * (cx > W / 2 ? 0.15 : 0.85), gy(W * 0.15) + m * 0.03, m * 0.25, '#5a7f4a', '#6a4a32', r)
    },
  },
  {
    id: 'cow',
    label: '奶牛',
    kinds: ['painting', 'poster'],
    styles: ['farmhouse', 'cute'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#f3ead6', '#cfe3ea', '#f4d8cf', '#dbe4c8'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const field = r() < 0.5
      if (field) ridge(g, W, H, H * 0.75, H * 0.03, r, '#9fbf7a')
      const s = m * 0.3
      const cx = W / 2
      const cy = H * 0.55
      for (const dx of [-0.5, -0.3, 0.35, 0.55]) rect(g, cx + dx * s - s * 0.07, cy + s * 0.2, s * 0.14, s * 0.55, '#f6f3ec')
      g.fillStyle = '#f6f3ec'
      g.beginPath()
      g.roundRect(cx - s * 0.7, cy - s * 0.35, s * 1.4, s * 0.7, s * 0.3)
      g.fill()
      g.save()
      g.beginPath()
      g.roundRect(cx - s * 0.7, cy - s * 0.35, s * 1.4, s * 0.7, s * 0.3)
      g.clip()
      for (let k = 0; k < 4; k++) blob(g, cx + s * rr(r, -0.6, 0.6), cy + s * rr(r, -0.3, 0.3), s * rr(r, 0.12, 0.22), r, '#2a2a2a', 7, 0.5)
      g.restore()
      stroke(g, [cx + s * 0.7, cy - s * 0.2, cx + s * 0.85, cy + s * 0.25], '#2a2a2a', s * 0.04)
      ellipse(g, cx + s * 0.7, cy + s * 0.15, s * 0.1, s * 0.1, 0, '#f2b8c0')
      const hx = cx - s * 0.75
      const hy = cy - s * 0.3
      for (const d of [-1, 1]) {
        ellipse(g, hx + d * s * 0.3, hy - s * 0.1, s * 0.14, s * 0.07, d * 0.4, '#2a2a2a')
        poly(g, [hx + d * s * 0.12, hy - s * 0.25, hx + d * s * 0.2, hy - s * 0.42, hx + d * s * 0.22, hy - s * 0.22], '#e8dcc0')
      }
      ellipse(g, hx, hy, s * 0.26, s * 0.3, 0, '#f6f3ec')
      ellipse(g, hx, hy + s * 0.18, s * 0.22, s * 0.14, 0, '#f2b8c0')
      for (const d of [-1, 1]) {
        circle(g, hx + d * s * 0.08, hy + s * 0.18, s * 0.025, '#8a4a4a')
        circle(g, hx + d * s * 0.11, hy - s * 0.05, s * 0.035, '#2a2a2a')
      }
      if (!field) rect(g, 0, cy + s * 0.75, W, Math.max(1, m * 0.008), '#5a5040')
      if (r() < 0.5) for (let k = 0; k < 5; k++) blossom(g, W * rr(r, 0.05, 0.95), H * rr(r, 0.85, 0.95), m * 0.02, '#ffffff', '#f2c14e')
    },
  },

  // ---------- 萌系 ----------
  {
    id: 'kitty',
    label: '猫咪',
    kinds: ['painting', 'poster', 'photo'],
    styles: ['cute', 'nordic', 'retro'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#ffe4ec', '#dff0f6', '#fff3c8', '#e6f4e6', '#efe6f8'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      for (let k = 0; k < 24; k++) {
        g.globalAlpha = 0.5
        circle(g, W * r(), H * r(), m * 0.015, '#ffffff')
      }
      g.globalAlpha = 1
      const fur = pick(r, ['#f2a65a', '#9aa0a8', '#3a3a40', '#f4f1ea', '#e8c08a'])
      if (r() < 0.5) catFace(g, W / 2, H * 0.55, m * 0.3, fur, r)
      else {
        const cx = W / 2
        const by = H * 0.88
        const s = m * 0.32
        g.strokeStyle = fur
        g.lineWidth = s * 0.12
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(cx + s * 0.4, by - s * 0.1)
        g.quadraticCurveTo(cx + s * 1.0, by - s * 0.2, cx + s * 0.85, by - s * 0.8)
        g.stroke()
        ellipse(g, cx, by - s * 0.45, s * 0.55, s * 0.6, 0, fur)
        ellipse(g, cx, by - s * 0.3, s * 0.3, s * 0.38, 0, light(fur, 0.35))
        catFace(g, cx, by - s * 1.25, s * 0.5, fur, r)
      }
      if (r() < 0.5) for (let k = 0; k < 3; k++) heart(g, W * rr(r, 0.1, 0.9), H * rr(r, 0.08, 0.3), m * 0.04, '#ff8fa3')
    },
  },
  {
    id: 'friends',
    label: '动物朋友',
    kinds: ['painting', 'poster', 'kids'],
    styles: ['cute'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#fff4dc', '#e4f2fb', '#fde8ef', '#e8f6ec'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const n = W > H * 1.3 ? 3 : ri(r, 1, 2)
      const furs = ['#c89a6a', '#fbf7ee', '#f2b8c8', '#e8c08a', '#a8a0b8']
      for (let k = 0; k < n; k++) {
        const x = (W * (k + 0.5)) / n
        const s = Math.min(W / n, H) * 0.28
        animalFace(g, x, H * 0.56, s, ri(r, 0, 2), pick(r, furs))
      }
      for (let k = 0; k < 6; k++) star(g, W * r(), H * rr(r, 0.05, 0.25), m * 0.025, pick(r, ['#ffd76a', '#ff9fb4', '#9fd8f0']))
      rect(g, 0, H * 0.88, W, H * 0.12, pick(r, ['#b6e3cc', '#ffd9a0', '#c8d8f8']))
    },
  },
  {
    id: 'rainbow',
    label: '彩虹云朵',
    kinds: ['painting', 'kids', 'poster'],
    styles: ['cute', 'nordic'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#e8f4fb', '#fff6ee', '#f6eefb', '#eef8f0'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const cols = r() < 0.5 ? ['#ff9aa2', '#ffc58a', '#fff09a', '#a8e6a3', '#9fd3f0', '#c8a8f0'] : ['#d98c74', '#e8b87a', '#f0d8a0', '#a8b9a0', '#9fb8c4']
      const cx = W / 2
      const cy = H * 0.68
      const R = Math.min(W * 0.42, H * 0.55)
      const bw = (R * 0.55) / cols.length
      cols.forEach((c, i) => {
        g.strokeStyle = c
        g.lineWidth = bw
        g.beginPath()
        g.arc(cx, cy, R - i * bw, PI, TAU)
        g.stroke()
      })
      for (const d of [-1, 1]) {
        const x = cx + d * (R - bw * cols.length * 0.5)
        cloud(g, x, cy + m * 0.02, m * 0.13, '#ffffff')
        if (r() < 0.7) {
          circle(g, x - m * 0.04, cy - m * 0.01, m * 0.01, '#5a4a5a')
          circle(g, x + m * 0.04, cy - m * 0.01, m * 0.01, '#5a4a5a')
          g.globalAlpha = 0.5
          circle(g, x - m * 0.07, cy + m * 0.02, m * 0.015, '#ff8fa3')
          circle(g, x + m * 0.07, cy + m * 0.02, m * 0.015, '#ff8fa3')
          g.globalAlpha = 1
        }
      }
      for (let k = 0; k < 6; k++) (r() < 0.5 ? heart : star)(g, W * r(), H * rr(r, 0.05, 0.3), m * 0.025, pick(r, cols))
    },
  },
  {
    id: 'sweets',
    label: '甜点',
    kinds: ['painting', 'poster'],
    styles: ['cute', 'retro'],
    draw(g, W, H, r) {
      const bg = pick(r, ['#ffe4ec', '#e0f4f0', '#fff3c8', '#2f2a4a'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const spr = ['#ff6b8a', '#6bc5ff', '#ffd76a', '#8ae0a0', '#ffffff']
      for (let k = 0; k < 30; k++) {
        g.save()
        g.translate(W * r(), H * r())
        g.rotate(r() * TAU)
        rect(g, -m * 0.012, -m * 0.004, m * 0.024, m * 0.008, pick(r, spr))
        g.restore()
      }
      const cx = W / 2
      const s = m * 0.3
      const t = ri(r, 0, 2)
      if (t === 0) {
        poly(g, [cx - s * 0.4, H * 0.5, cx + s * 0.4, H * 0.5, cx, H * 0.5 + s * 1.3], '#e8b070')
        g.strokeStyle = '#c88a4a'
        g.lineWidth = Math.max(1, m * 0.006)
        for (let k = 1; k < 4; k++) {
          g.beginPath()
          g.moveTo(cx - s * 0.4 + k * s * 0.2, H * 0.5)
          g.lineTo(cx + s * 0.15 - k * 0.0, H * 0.5 + s * (0.4 + k * 0.2))
          g.stroke()
        }
        const scoops = ri(r, 1, 3)
        for (let k = 0; k < scoops; k++) {
          const c = pick(r, ['#ffb6c8', '#fff4dc', '#8a5a3a', '#b6e3cc', '#c8a8f0'])
          circle(g, cx, H * 0.47 - k * s * 0.5, s * 0.45, c)
          for (let j = 0; j < 3; j++) circle(g, cx - s * 0.3 + j * s * 0.3, H * 0.5 - k * s * 0.5, s * 0.12, c)
        }
        circle(g, cx + s * 0.1, H * 0.47 - scoops * s * 0.5 - s * 0.05, s * 0.12, '#e8303a')
      } else if (t === 1) {
        circle(g, cx, H / 2, s, '#e8b878')
        g.fillStyle = pick(r, ['#ff8fb4', '#8a5a3a', '#fff4f0', '#b6a8f0'])
        g.beginPath()
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * TAU
          const d = s * (0.88 + (k % 2) * 0.06)
          if (k === 0) g.moveTo(cx + Math.cos(a) * d, H / 2 + Math.sin(a) * d)
          else g.lineTo(cx + Math.cos(a) * d, H / 2 + Math.sin(a) * d)
        }
        g.fill()
        circle(g, cx, H / 2, s * 0.32, bg)
        for (let k = 0; k < 18; k++) {
          const a = r() * TAU
          const d = s * rr(r, 0.45, 0.8)
          g.save()
          g.translate(cx + Math.cos(a) * d, H / 2 + Math.sin(a) * d)
          g.rotate(r() * TAU)
          rect(g, -s * 0.06, -s * 0.02, s * 0.12, s * 0.04, pick(r, spr))
          g.restore()
        }
      } else {
        poly(g, [cx - s * 0.6, H * 0.52, cx + s * 0.6, H * 0.52, cx + s * 0.45, H * 0.52 + s * 0.7, cx - s * 0.45, H * 0.52 + s * 0.7], '#f4a0b8')
        g.strokeStyle = '#e07a98'
        g.lineWidth = Math.max(1, m * 0.008)
        for (let k = -2; k <= 2; k++) {
          g.beginPath()
          g.moveTo(cx + k * s * 0.22, H * 0.52)
          g.lineTo(cx + k * s * 0.17, H * 0.52 + s * 0.7)
          g.stroke()
        }
        for (let k = 0; k < 3; k++) ellipse(g, cx, H * 0.5 - k * s * 0.22, s * (0.65 - k * 0.15), s * 0.2, 0, '#fff8f0')
        circle(g, cx, H * 0.5 - s * 0.6, s * 0.12, '#e8303a')
      }
    },
  },

  // ---------- 海报 ----------
  {
    id: 'typo',
    label: '字体海报',
    kinds: ['poster', 'painting'],
    styles: ['modern', 'industrial', 'nordic', 'retro'],
    draw(g, W, H, r) {
      const [bg, fg, ac] = pick(r, [
        ['#f4f1ea', '#1f1f1f', '#e2583e'],
        ['#1f1f1f', '#f4f1ea', '#f2c531'],
        ['#e9e4d8', '#2e2e30', '#c46a3a'],
        ['#2f5d62', '#f4ead8', '#e0a526'],
        ['#f2c531', '#1f1f1f', '#ffffff'],
        ['#d9dcd6', '#3a3a3c', '#5a7f9a'],
      ])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const v = ri(r, 0, 2)
      if (v === 0) {
        const word = pick(r, ['HOME', 'STAY', 'CALM', 'JOY', 'LOVE', 'SLOW', 'OPEN', 'PLAY', 'MAKE', 'REST'])
        const letters = [...word]
        const tall = H > W * 1.15
        if (tall) {
          const size = Math.min(W * 0.7, (H * 0.8) / letters.length)
          letters.forEach((ch, i) => text(g, ch, W * 0.42, H * 0.12 + size * (i + 0.5), size, i === letters.length - 1 ? ac : fg, SANS, '900'))
        } else {
          const size = fitText(g, word, H * 0.45, W * 0.86, SANS, '900')
          text(g, word, W / 2, H * 0.48, size, fg, SANS, '900')
          rect(g, W * 0.07, H * 0.75, W * 0.3, Math.max(2, m * 0.02), ac)
        }
        for (let k = 0; k < 4; k++) rect(g, W * 0.72, H * (0.12 + k * 0.035), W * (0.18 - (k % 2) * 0.05), Math.max(1, m * 0.012), fg)
      } else if (v === 1) {
        const num = pick(r, ['1984', 'No.7', '24', '01', '99', 'A—Z', '1972', '3:00'])
        circle(g, W * 0.62, H * 0.42, m * 0.3, ac)
        text(g, num, W * 0.45, H * 0.45, fitText(g, num, m * 0.42, W * 0.8, SANS, '900'), fg, SANS, '900')
        for (let k = 0; k < 6; k++) rect(g, W * 0.1, H * (0.78 + k * 0.03), W * (0.6 - (k % 3) * 0.12), Math.max(1, m * 0.01), fg)
      } else {
        const word = pick(r, ['MODERN', 'DESIGN', 'STUDIO', 'WORKS', 'SUPPLY', 'COFFEE', 'HELLO'])
        for (let k = 0; k < 5; k++) {
          g.globalAlpha = k === 2 ? 1 : 0.18
          text(g, word, W / 2, H * (0.2 + k * 0.15), fitText(g, word, H * 0.14, W * 0.9, SANS, '900'), k === 2 ? ac : fg, SANS, '900')
        }
        g.globalAlpha = 1
        rect(g, W * 0.1, H * 0.92, W * 0.8, Math.max(1, m * 0.008), fg)
      }
    },
  },
  {
    id: 'blueprint',
    label: '蓝图',
    kinds: ['poster', 'painting'],
    styles: ['industrial', 'modern'],
    draw(g, W, H, r) {
      const [bg, ln] = pick(r, [
        ['#1f4e8c', '#e8f0fa'],
        ['#20374f', '#cfe0f0'],
        ['#efe9dc', '#3a5f8a'],
        ['#2a2e33', '#e0a050'],
      ])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      g.strokeStyle = ln
      g.globalAlpha = 0.18
      g.lineWidth = 1
      const step = m * 0.06
      for (let x = 0; x < W; x += step) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, H)
        g.stroke()
      }
      for (let y = 0; y < H; y += step) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(W, y)
        g.stroke()
      }
      g.globalAlpha = 1
      g.lineWidth = Math.max(1, m * 0.008)
      const cx = W / 2
      const cy = H * 0.45
      const s = m * 0.32
      const v = ri(r, 0, 2)
      g.beginPath()
      if (v === 0) {
        const teeth = ri(r, 8, 14)
        for (let k = 0; k < teeth * 2; k++) {
          const a = (k / (teeth * 2)) * TAU
          const d = k % 2 ? s * 0.82 : s
          const a2 = ((k + 1) / (teeth * 2)) * TAU
          g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d)
          g.lineTo(cx + Math.cos(a2) * d, cy + Math.sin(a2) * d)
        }
        g.closePath()
        g.moveTo(cx + s * 0.3, cy)
        g.arc(cx, cy, s * 0.3, 0, TAU)
      } else if (v === 1) {
        const w = s * 1.6
        const h = s * 1.1
        g.rect(cx - w / 2, cy - h / 2, w, h)
        g.moveTo(cx - w * 0.1, cy - h / 2)
        g.lineTo(cx - w * 0.1, cy + h / 2)
        g.moveTo(cx - w * 0.1, cy)
        g.lineTo(cx + w / 2, cy)
        g.moveTo(cx - w / 2 + w * 0.15, cy + h / 2)
        g.arc(cx - w / 2 + w * 0.15, cy + h / 2, w * 0.12, PI, PI * 1.5)
        g.moveTo(cx + w * 0.2, cy)
        g.arc(cx + w * 0.2, cy, w * 0.1, 0, PI / 2)
      } else {
        g.moveTo(cx - s, cy + s * 0.6)
        g.lineTo(cx - s, cy - s * 0.1)
        g.lineTo(cx, cy - s * 0.8)
        g.lineTo(cx + s, cy - s * 0.1)
        g.lineTo(cx + s, cy + s * 0.6)
        g.closePath()
        g.rect(cx - s * 0.2, cy + s * 0.1, s * 0.4, s * 0.5)
        g.rect(cx - s * 0.75, cy - s * 0.05, s * 0.35, s * 0.3)
        g.rect(cx + s * 0.4, cy - s * 0.05, s * 0.35, s * 0.3)
      }
      g.stroke()
      g.lineWidth = Math.max(1, m * 0.004)
      g.beginPath()
      g.moveTo(cx - s, cy + s * 0.95)
      g.lineTo(cx + s, cy + s * 0.95)
      g.moveTo(cx - s, cy + s * 0.88)
      g.lineTo(cx - s, cy + s * 1.02)
      g.moveTo(cx + s, cy + s * 0.88)
      g.lineTo(cx + s, cy + s * 1.02)
      g.stroke()
      g.strokeRect(W * 0.6, H * 0.84, W * 0.34, H * 0.11)
      text(g, pick(r, ['A-01', 'B-12', 'NO.3', 'REV.2']), W * 0.77, H * 0.895, m * 0.05, ln, SANS)
    },
  },
  {
    id: 'rocket',
    label: '复古太空',
    kinds: ['poster', 'painting', 'kids'],
    styles: ['retro', 'cute', 'modern'],
    draw(g, W, H, r) {
      const S = pick(r, [
        { bg: '#1f2a44', planet: '#e2702f', ring: '#f2c14e', body: '#f4ead8', fin: '#c8473a' },
        { bg: '#2a1f3a', planet: '#5ab0a0', ring: '#f2a0b0', body: '#ffffff', fin: '#ff6b6b' },
        { bg: '#f4e7c8', planet: '#2f8f8a', ring: '#e0a526', body: '#fbf6ea', fin: '#c8473a' },
        { bg: '#0f3a4a', planet: '#f2c14e', ring: '#ffffff', body: '#e8eef0', fin: '#e86a3a' },
      ])
      rect(g, 0, 0, W, H, S.bg)
      const m = Math.min(W, H)
      for (let k = 0; k < 50; k++) circle(g, W * r(), H * r(), m * rr(r, 0.003, 0.008), S.bg === '#f4e7c8' ? '#c8a878' : '#ffffff')
      const px = W * rr(r, 0.2, 0.8)
      const py = H * rr(r, 0.15, 0.35)
      const pr = m * rr(r, 0.1, 0.16)
      circle(g, px, py, pr, S.planet)
      circle(g, px - pr * 0.3, py - pr * 0.2, pr * 0.2, dark(S.planet, 0.15))
      g.strokeStyle = S.ring
      g.lineWidth = Math.max(1, pr * 0.12)
      g.beginPath()
      g.ellipse(px, py, pr * 1.6, pr * 0.4, -0.3, 0, TAU)
      g.stroke()
      const rx = W * rr(r, 0.35, 0.65)
      const ry = H * 0.62
      const s = m * 0.2
      g.save()
      g.translate(rx, ry)
      g.rotate(rr(r, -0.5, 0.5))
      g.fillStyle = '#ffb347'
      g.beginPath()
      g.moveTo(-s * 0.2, s * 0.6)
      g.quadraticCurveTo(0, s * 1.4, s * 0.2, s * 0.6)
      g.fill()
      g.fillStyle = '#fff07a'
      g.beginPath()
      g.moveTo(-s * 0.1, s * 0.6)
      g.quadraticCurveTo(0, s * 1.05, s * 0.1, s * 0.6)
      g.fill()
      for (const d of [-1, 1]) poly(g, [d * s * 0.22, s * 0.1, d * s * 0.45, s * 0.65, d * s * 0.2, s * 0.55], S.fin)
      g.fillStyle = S.body
      g.beginPath()
      g.moveTo(0, -s)
      g.quadraticCurveTo(s * 0.35, -s * 0.5, s * 0.25, s * 0.6)
      g.lineTo(-s * 0.25, s * 0.6)
      g.quadraticCurveTo(-s * 0.35, -s * 0.5, 0, -s)
      g.fill()
      poly(g, [0, -s, s * 0.17, -s * 0.62, -s * 0.17, -s * 0.62], S.fin)
      circle(g, 0, -s * 0.15, s * 0.13, S.fin)
      circle(g, 0, -s * 0.15, s * 0.09, '#9fd8f0')
      g.restore()
      if (r() < 0.6) {
        const word = pick(r, ['SPACE', 'ORBIT', 'MOON', 'MARS 1969', 'GALAXY'])
        text(g, word, W / 2, H * 0.9, fitText(g, word, m * 0.12, W * 0.8, SANS, '900'), S.ring, SANS, '900')
      }
    },
  },
  {
    id: 'vinyl',
    label: '唱片',
    kinds: ['poster'],
    styles: ['retro', 'industrial', 'modern'],
    draw(g, W, H, r) {
      const [bg, sleeve, lab] = pick(r, [
        ['#f4e7c8', '#e2702f', '#2f8f8a'],
        ['#1f1f1f', '#c8473a', '#f2c531'],
        ['#e9e4d8', '#3a5f7a', '#e8a04a'],
        ['#2f5d62', '#f2c14e', '#e86a4f'],
      ])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const s = m * 0.62
      const sx = W / 2 - s * 0.62
      const sy = H * 0.42 - s / 2
      const dx = sx + s * 0.95
      const dy = sy + s / 2
      circle(g, dx, dy, s * 0.47, '#151515')
      g.strokeStyle = '#3a3a3a'
      g.lineWidth = Math.max(1, m * 0.004)
      for (let k = 1; k < 7; k++) {
        g.beginPath()
        g.arc(dx, dy, s * (0.2 + k * 0.04), 0, TAU)
        g.stroke()
      }
      circle(g, dx, dy, s * 0.15, lab)
      circle(g, dx, dy, s * 0.02, '#151515')
      rect(g, sx, sy, s, s, sleeve)
      const v = ri(r, 0, 2)
      if (v === 0) for (let k = 0; k < 5; k++) rect(g, sx, sy + s * (0.2 + k * 0.13), s, s * 0.06, k % 2 ? bg : lab)
      else if (v === 1) {
        circle(g, sx + s / 2, sy + s / 2, s * 0.32, lab)
        circle(g, sx + s / 2, sy + s / 2, s * 0.16, bg)
      } else for (let k = 0; k < 4; k++) poly(g, [sx, sy + s - k * s * 0.25, sx + s - k * s * 0.25, sy + s, sx, sy + s], k % 2 ? lab : light(sleeve, 0.2))
      const word = pick(r, ['SIDE A', 'JAZZ', 'SOUL', 'CITY POP', 'LIVE', 'B-SIDES'])
      text(g, word, W / 2, H * 0.86, fitText(g, word, m * 0.11, W * 0.8, SANS, '900'), bg === '#1f1f1f' ? '#f4f1ea' : '#1f1f1f', SANS, '900')
    },
  },
  {
    id: 'film',
    label: '电影海报',
    kinds: ['poster'],
    styles: ['modern', 'retro', 'industrial', 'cute'],
    draw(g, W, H, r) {
      const [bg, ac, fg] = pick(r, [
        ['#14213d', '#fca311', '#e5e5e5'],
        ['#2b2d42', '#ef233c', '#edf2f4'],
        ['#3d405b', '#f2cc8f', '#f4f1de'],
        ['#1b4332', '#ffb703', '#d8f3dc'],
        ['#f1e3d3', '#e76f51', '#264653'],
      ])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      const v = ri(r, 0, 3)
      const cx = W / 2
      if (v === 0) {
        circle(g, cx, H * 0.38, m * 0.32, ac)
        const s = m * 0.25
        circle(g, cx, H * 0.6 - s * 0.95, s * 0.14, bg)
        poly(g, [cx - s * 0.22, H * 0.6 - s * 0.8, cx + s * 0.22, H * 0.6 - s * 0.8, cx + s * 0.3, H * 0.6, cx - s * 0.3, H * 0.6], bg)
        rect(g, 0, H * 0.6, W, H * 0.4, bg)
      } else if (v === 1) {
        const hz = H * 0.5
        rect(g, 0, hz, W, H * 0.4, dark(bg, 0.3))
        poly(g, [cx - W * 0.04, hz, cx + W * 0.04, hz, cx + W * 0.35, H * 0.72, cx - W * 0.35, H * 0.72], light(bg, 0.15))
        for (let k = 0; k < 4; k++) rect(g, cx - m * 0.005, hz + (H * 0.22 * (k + 0.3)) / 4, m * 0.01, m * 0.03 * (k + 1) * 0.5, ac)
        circle(g, cx, hz - m * 0.12, m * 0.08, ac)
      } else if (v === 2) {
        const pts = peaks(r, W, H * 0.25, H * 0.62, 3)
        fillPeaks(g, pts, H * 0.62, light(bg, 0.12), fg)
        rect(g, 0, H * 0.62, W, H * 0.38, bg)
        circle(g, cx + m * 0.15, H * 0.56, m * 0.015, ac)
        rect(g, cx + m * 0.143, H * 0.57, m * 0.014, m * 0.04, ac)
      } else {
        for (let k = 0; k < 6; k++) {
          g.globalAlpha = 0.25 + k * 0.12
          circle(g, cx, H * 0.4, m * (0.36 - k * 0.055), k % 2 ? ac : fg)
        }
        g.globalAlpha = 1
        heart(g, cx, H * 0.4, m * 0.06, bg)
      }
      const title = pick(r, ['MIDNIGHT', 'THE LONG ROAD', 'STARFALL', 'BLUE HOUR', 'LAST SUMMER', 'ECHOES', 'NEON CITY', 'PARADISE'])
      text(g, title, W / 2, H * 0.76, fitText(g, title, m * 0.13, W * 0.86, SANS, '900'), fg, SANS, '900')
      text(g, pick(r, ['COMING SOON', 'NOW SHOWING', 'A FILM BY M.H.', 'IN CINEMAS']), W / 2, H * 0.84, fitText(g, 'COMING SOON', m * 0.04, W * 0.6, SANS), ac, SANS)
      g.globalAlpha = 0.6
      for (let k = 0; k < 3; k++) rect(g, W * 0.15, H * (0.89 + k * 0.025), W * 0.7, Math.max(1, m * 0.008), fg)
      g.globalAlpha = 1
    },
  },

  // ---------- 照片 ----------
  {
    id: 'family',
    label: '全家福',
    kinds: ['photo'],
    styles: ALL,
    draw(g, W, H, r) {
      const outdoor = r() < 0.5
      if (outdoor) {
        rect(g, 0, 0, W, H, pick(r, ['#bfe3f2', '#d8ecf4', '#f4e0c8']))
        for (let k = 0; k < 5; k++) blob(g, W * r(), H * rr(r, 0.35, 0.55), Math.min(W, H) * rr(r, 0.12, 0.2), r, pick(r, ['#8fc07a', '#7fb06a', '#a8d090']), 8, 0.3)
        rect(g, 0, H * 0.62, W, H * 0.38, '#a8d090')
      } else {
        const wall = pick(r, ['#e8dcc8', '#d8e4ec', '#f0e0e4', '#dcdcd4'])
        rect(g, 0, 0, W, H, wall)
        rect(g, 0, H * 0.78, W, H * 0.22, dark(wall, 0.12))
      }
      const n = W > H * 1.2 ? ri(r, 3, 4) : ri(r, 2, 3)
      const order = shuffle(r, Array.from({ length: n }, (_, i) => i))
      for (const i of order) {
        const kid = n > 2 && i % 2 === 1 && r() < 0.6
        const h = H * (kid ? rr(r, 0.42, 0.5) : rr(r, 0.6, 0.72))
        person(g, (W * (i + 0.5)) / n, H * 1.02, h, r)
      }
      vignette(g, W, H, 0.1)
    },
  },
  {
    id: 'pet',
    label: '宠物照',
    kinds: ['photo'],
    styles: ALL,
    draw(g, W, H, r) {
      const bg = pick(r, ['#e8dcc8', '#cfe3ea', '#f4d8cf', '#dbe8d0', '#3a4a5a'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      if (r() < 0.5) {
        const sofa = pick(r, ['#7f9aa8', '#c89a7a', '#8aa07a', '#a88ab8'])
        g.fillStyle = sofa
        g.beginPath()
        g.roundRect(-W * 0.05, H * 0.55, W * 1.1, H * 0.5, m * 0.08)
        g.fill()
      }
      if (r() < 0.55) dogFace(g, W / 2, H * 0.55, m * 0.32, r)
      else catFace(g, W / 2, H * 0.58, m * 0.3, pick(r, ['#f2a65a', '#9aa0a8', '#3a3a40', '#f4f1ea']), r, false)
      vignette(g, W, H, 0.1)
    },
  },
  {
    id: 'travel',
    label: '旅行照',
    kinds: ['photo'],
    styles: ALL,
    draw(g, W, H, r) {
      const src = pick(r, ['seascape', 'alpine', 'hills', 'city', 'forest', 'desert', 'fuji'])
      MOTIF_BY_ID.get(src)!.draw(g, W, H, r)
      vignette(g, W, H, 0.12)
      if (r() < 0.4) text(g, `'${ri(r, 10, 26)} ${ri(r, 1, 12)} ${ri(r, 1, 28)}`, W * 0.95, H * 0.92, Math.min(W, H) * 0.06, '#ff8a3a', '"Courier New", monospace', 'bold', 'right')
    },
  },
  {
    id: 'selfie',
    label: '人像照',
    kinds: ['photo'],
    styles: ALL,
    draw(g, W, H, r) {
      const bg = pick(r, ['#f2d6c8', '#cfe0ea', '#e6e0f0', '#e8ecd8', '#f6e8c8'])
      rect(g, 0, 0, W, H, bg)
      const m = Math.min(W, H)
      for (let k = 0; k < 6; k++) {
        g.globalAlpha = 0.25
        circle(g, W * r(), H * r() * 0.6, m * rr(r, 0.05, 0.12), '#ffffff')
      }
      g.globalAlpha = 1
      if (W > H * 1.2) {
        person(g, W * 0.4, H * 1.02, H * 0.8, r)
        person(g, W * 0.62, H * 1.02, H * 0.74, r)
      } else person(g, W / 2, H * 1.02, Math.min(H * 0.82, W * 1.1), r)
      vignette(g, W, H, 0.1)
    },
  },
  {
    id: 'bwphoto',
    label: '黑白老照片',
    kinds: ['photo'],
    styles: ALL,
    draw(g, W, H, r) {
      const src = pick(r, ['family', 'selfie', 'seascape', 'city', 'alpine', 'pet'])
      MOTIF_BY_ID.get(src)!.draw(g, W, H, r)
      grayscale(g, W, H, r() < 0.5)
      vignette(g, W, H, 0.15)
    },
  },

  // ---------- 儿童画 ----------
  {
    id: 'crayon',
    label: '蜡笔画',
    kinds: ['kids'],
    styles: ALL,
    draw(g, W, H, r) {
      const paper = pick(r, ['#fffdf6', '#ffffff', '#fdf8ec'])
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      const lw = Math.max(2, m * 0.022)
      const wob = (pts: number[], c: string, w = lw) => {
        const o: number[] = []
        for (let i = 0; i < pts.length; i += 2) o.push(pts[i] + rr(r, -1, 1) * m * 0.008, pts[i + 1] + rr(r, -1, 1) * m * 0.008)
        stroke(g, o, c, w)
      }
      const crayons = ['#ef5b6b', '#5a8be0', '#f6c445', '#5bb85d', '#a86ad8', '#ff9a3a', '#4a4a5a']
      const sx = r() < 0.5 ? W * 0.15 : W * 0.85
      circle(g, sx, H * 0.16, m * 0.08, '#f6c445')
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU
        wob([sx + Math.cos(a) * m * 0.11, H * 0.16 + Math.sin(a) * m * 0.11, sx + Math.cos(a) * m * 0.16, H * 0.16 + Math.sin(a) * m * 0.16], '#f0a020')
      }
      if (r() < 0.7) {
        const cx = W * rr(r, 0.3, 0.7)
        cloud(g, cx, H * 0.15, m * 0.08, '#cfe8ff')
      }
      g.strokeStyle = '#5bb85d'
      wob(Array.from({ length: 21 }, (_, k) => [(W * k) / 20, H * (k % 2 ? 0.86 : 0.9)]).flat(), '#5bb85d')
      const items = shuffle(r, ['house', 'person', 'person', 'tree', 'flower', 'cat'])
      const n = W > H * 1.2 ? 4 : 3
      for (let k = 0; k < n; k++) {
        const x = (W * (k + 0.5)) / n + rr(r, -0.05, 0.05) * W
        const base = H * 0.88
        const c = pick(r, crayons)
        const s = Math.min((W / n) * 0.9, H * 0.6)
        switch (items[k]) {
          case 'house':
            wob([x - s * 0.5, base, x - s * 0.5, base - s * 0.6, x + s * 0.5, base - s * 0.6, x + s * 0.5, base, x - s * 0.5, base], c)
            poly(g, [x - s * 0.62, base - s * 0.58, x, base - s * 1.05, x + s * 0.62, base - s * 0.58], pick(r, crayons))
            wob([x - s * 0.12, base, x - s * 0.12, base - s * 0.3, x + s * 0.12, base - s * 0.3, x + s * 0.12, base], c)
            break
          case 'person': {
            const hr = s * 0.15
            const top = base - s * 0.95
            g.strokeStyle = c
            g.lineWidth = lw
            g.beginPath()
            g.arc(x, top + hr, hr, 0, TAU)
            g.stroke()
            if (r() < 0.5) poly(g, [x, top + hr * 2, x - s * 0.22, base - s * 0.25, x + s * 0.22, base - s * 0.25], c)
            else wob([x, top + hr * 2, x, base - s * 0.3], c)
            wob([x - s * 0.25, top + hr * 2.8, x + s * 0.25, top + hr * 2.6], c)
            wob([x - s * 0.15, base, x, base - s * 0.3, x + s * 0.15, base], c)
            circle(g, x - hr * 0.35, top + hr * 0.9, lw * 0.4, '#4a4a5a')
            circle(g, x + hr * 0.35, top + hr * 0.9, lw * 0.4, '#4a4a5a')
            break
          }
          case 'tree':
            wob([x, base, x, base - s * 0.5], '#8a5a3a', lw * 1.6)
            blob(g, x, base - s * 0.75, s * 0.32, r, '#5bb85d', 8, 0.4)
            for (let j = 0; j < 3; j++) circle(g, x + s * rr(r, -0.2, 0.2), base - s * rr(r, 0.6, 0.9), lw * 0.9, '#ef5b6b')
            break
          case 'flower':
            wob([x, base, x, base - s * 0.5], '#5bb85d')
            blossom(g, x, base - s * 0.55, s * 0.13, c, '#f6c445')
            break
          default:
            ellipse(g, x, base - s * 0.25, s * 0.3, s * 0.22, 0, c)
            circle(g, x - s * 0.25, base - s * 0.5, s * 0.17, c)
            poly(g, [x - s * 0.38, base - s * 0.6, x - s * 0.34, base - s * 0.8, x - s * 0.24, base - s * 0.64], c)
            poly(g, [x - s * 0.18, base - s * 0.62, x - s * 0.12, base - s * 0.8, x - s * 0.08, base - s * 0.58], c)
        }
      }
      heart(g, W * rr(r, 0.3, 0.7), H * rr(r, 0.25, 0.4), m * 0.04, '#ef5b6b')
    },
  },
  {
    id: 'doodle',
    label: '涂鸦动物',
    kinds: ['kids'],
    styles: ALL,
    draw(g, W, H, r) {
      const paper = pick(r, ['#fffdf6', '#ffffff', '#f6fbff'])
      rect(g, 0, 0, W, H, paper)
      const m = Math.min(W, H)
      const c = pick(r, ['#5bb85d', '#5a8be0', '#ff9a3a', '#a86ad8', '#ef5b6b'])
      const cx = W / 2
      const cy = H * 0.55
      const s = m * 0.32
      const scribble = (path: () => void) => {
        g.save()
        path()
        g.clip()
        g.strokeStyle = c
        g.lineWidth = Math.max(2, m * 0.018)
        g.beginPath()
        for (let k = -20; k < 20; k++) {
          g.moveTo(cx + k * s * 0.08 - s, cy - s * 1.2)
          g.lineTo(cx + k * s * 0.08 + s, cy + s * 1.2)
        }
        g.stroke()
        g.restore()
        g.strokeStyle = dark(c, 0.3)
        g.lineWidth = Math.max(2, m * 0.016)
        path()
        g.stroke()
      }
      const kind = ri(r, 0, 2)
      if (kind === 0) {
        scribble(() => {
          g.beginPath()
          g.ellipse(cx, cy, s, s * 0.55, 0, 0, TAU)
        })
        poly(g, [cx + s * 0.9, cy, cx + s * 1.4, cy - s * 0.4, cx + s * 1.4, cy + s * 0.4], c)
        circle(g, cx - s * 0.55, cy - s * 0.1, s * 0.08, '#2a2a2a')
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = '#8ac8f0'
          g.lineWidth = Math.max(1, m * 0.01)
          g.beginPath()
          g.arc(cx - s * 1.1, cy - s * (0.6 + k * 0.25), s * 0.06 * (k + 1), 0, TAU)
          g.stroke()
        }
      } else if (kind === 1) {
        scribble(() => {
          g.beginPath()
          g.ellipse(cx + s * 0.1, cy, s * 0.8, s * 0.45, 0, 0, TAU)
          g.moveTo(cx - s * 0.4, cy - s * 0.2)
          g.ellipse(cx - s * 0.7, cy - s * 0.5, s * 0.32, s * 0.28, 0, 0, TAU)
        })
        for (const dx of [-0.4, -0.1, 0.3, 0.6]) stroke(g, [cx + dx * s, cy + s * 0.35, cx + dx * s, cy + s * 0.75], dark(c, 0.3), m * 0.03)
        for (let k = 0; k < 5; k++) poly(g, [cx - s * 0.3 + k * s * 0.22, cy - s * 0.42, cx - s * 0.2 + k * s * 0.22, cy - s * 0.7, cx - s * 0.1 + k * s * 0.22, cy - s * 0.42], '#f6c445')
        circle(g, cx - s * 0.8, cy - s * 0.55, s * 0.06, '#2a2a2a')
        stroke(g, [cx + s * 0.85, cy, cx + s * 1.3, cy - s * 0.3], dark(c, 0.3), m * 0.03)
      } else {
        scribble(() => {
          g.beginPath()
          g.arc(cx, cy, s * 0.7, 0, TAU)
        })
        for (const d of [-1, 1]) poly(g, [cx + d * s * 0.6, cy - s * 0.3, cx + d * s * 0.55, cy - s * 0.95, cx + d * s * 0.2, cy - s * 0.62], c)
        for (const d of [-1, 1]) circle(g, cx + d * s * 0.25, cy - s * 0.1, s * 0.08, '#2a2a2a')
        stroke(g, [cx - s * 0.15, cy + s * 0.2, cx, cy + s * 0.28, cx + s * 0.15, cy + s * 0.2], '#2a2a2a', m * 0.012)
      }
      star(g, W * 0.15, H * 0.15, m * 0.05, '#f6c445')
      heart(g, W * 0.85, H * 0.18, m * 0.04, '#ef5b6b')
    },
  },
]

export const MOTIF_BY_ID = new Map(MOTIFS.map((m) => [m.id, m]))
