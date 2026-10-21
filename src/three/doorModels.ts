// 门扇的 3D 模型（各种款式 + 把手）、开门旁的侧窗 / 亮子。
//
// 门扇局部坐标：x 沿门扇（扇中心 x = 0，-w/2..w/2），y 从扇底（0）往上到扇顶（h），z 横穿门扇（厚 t，中面 z = 0）。
// house.ts buildOpenings 把门扇摆到铰链 / 推拉轨道上；门窗检查器的预览图也是同一份模型。
// 款式、颜色、把手都不填的门不走这里（house.ts 保留原来的几何，旧存档的样子不变）。

import * as THREE from 'three'
import type { DoorGlass, DoorHandle, DoorLeafStyle } from '../model'
import { C } from './assets'
import { ball, rbox, shade, toon } from './toon'

export interface LeafSpec {
  /** 不填 = 平板（同旧门扇的形状） */
  style?: DoorLeafStyle
  w: number
  h: number
  t: number
  color: string
  handle: DoorHandle
  handleColor: string
  /** 把手在哪一侧（-1 = -x 端，1 = +x 端）；0 = 不画把手 */
  handleSide: -1 | 0 | 1
  /** 玻璃：不填 = 旧的样子（卡通画面半透明、写实下磨砂） */
  glass?: DoorGlass
}

/** 玻璃材质：旧的（不填）、透明（更通透，写实下是光面玻璃）、磨砂（乳白、不太透，夜里被室内灯照亮） */
const glassMat = (kind?: DoorGlass) =>
  kind === 'clear' ? toon(C.glass, { transparent: 0.3 }) : kind === 'frosted' ? toon('#eef2ef', { transparent: 0.8 }) : toon(C.glass, { transparent: 0.45 })
/** 障子纸：暖白、半透 */
const paperMat = () => toon('#fbf6e8', { transparent: 0.85 })

function glass(w: number, h: number, d: number, at: { x?: number; y: number }, paper = false, kind?: DoorGlass) {
  const m = rbox(Math.max(0.5, w), Math.max(0.5, h), d, C.glass, at, 0.3)
  m.material = paper ? paperMat() : glassMat(kind)
  // 写实光照下：透明的画成光面玻璃，其余画成磨砂玻璃（门后的东西模糊地透出来，realistic.ts）
  if (!paper) m.userData.mat = kind === 'clear' ? 'glass' : 'frosted'
  return m
}

/**
 * 平板门扇上开一列玻璃（竖条 / 横条玻璃门）：x0..x1 同宽的几块 holes（[y0, y1]，从下往上、互不重叠），
 * 门板拆成两侧立板 + 洞之间的横档，每块玻璃四周一圈压条（比门板略凸、深一点）
 */
function holed(g: THREE.Group, w: number, h: number, t: number, c: string, x0: number, x1: number, holes: [number, number][], kind?: DoorGlass) {
  const r = 0.6
  g.add(rbox(x0 + w / 2 + 0.2, h, t, c, { x: (x0 - w / 2) / 2 + 0.1, y: 0 }, 1.2))
  g.add(rbox(w / 2 - x1 + 0.2, h, t, c, { x: (x1 + w / 2) / 2 - 0.1, y: 0 }, 1.2))
  const cw = x1 - x0 + 0.4
  const cx = (x0 + x1) / 2
  let y = 0
  for (const [y0, y1] of holes) {
    g.add(rbox(cw, y0 - y + 0.2, t, c, { x: cx, y: y - (y ? 0.1 : 0) }, r))
    y = y1
  }
  g.add(rbox(cw, h - y + 0.1, t, c, { x: cx, y: y - 0.1 }, r))
  const bead = shade(c, -0.07)
  const b = 1.4
  for (const [y0, y1] of holes) {
    g.add(glass(x1 - x0 + 0.4, y1 - y0 + 0.4, 1.2, { x: cx, y: y0 - 0.2 }, false, kind))
    for (const k of [-1, 1]) g.add(rbox(b, y1 - y0 + 2 * b, t + 0.8, bead, { x: cx + k * ((x1 - x0) / 2 + b / 2), y: y0 - b }, 0.3))
    for (const yy of [y0 - b, y1]) g.add(rbox(x1 - x0, b, t + 0.8, bead, { x: cx, y: yy }, 0.3))
  }
}

/** 凸起的门芯板：深一圈的线脚 + 浅一点的芯板，两面都凸出门扇 */
function raised(g: THREE.Group, x: number, y: number, w: number, h: number, t: number, c: string) {
  if (w < 4 || h < 4) return
  g.add(rbox(w, h, t + 1.2, shade(c, -0.08), { x, y }, 0.6))
  if (w > 7 && h > 7) g.add(rbox(w - 5, h - 5, t + 2.2, shade(c, 0.03), { x, y: y + 2.5 }, 1))
}

/** 框（两根竖梃 + 上下冒头）：s 竖梃宽、top / bot 上下冒头高 */
function frame(g: THREE.Group, w: number, h: number, t: number, c: string, s: number, top: number, bot: number) {
  for (const k of [-1, 1]) g.add(rbox(s, h, t, c, { x: (k * (w - s)) / 2 }, 0.8))
  g.add(rbox(w - 2 * s + 0.4, top, t, c, { y: h - top }, 0.6))
  g.add(rbox(w - 2 * s + 0.4, bot, t, c, { y: 0 }, 0.6))
}

/** 横竖细格条（法式门 / 障子），x0..x1 × y0..y1，cols × rows 格 */
function muntins(g: THREE.Group, x0: number, x1: number, y0: number, y1: number, cols: number, rows: number, d: number, c: string, bar = 1.8) {
  const W = x1 - x0
  const H = y1 - y0
  for (let i = 1; i < cols; i++) g.add(rbox(bar, H, d, c, { x: x0 + (W * i) / cols, y: y0 }, 0.3))
  for (let j = 1; j < rows; j++) g.add(rbox(W, bar, d, c, { x: (x0 + x1) / 2, y: y0 + (H * j) / rows - bar / 2 }, 0.3))
}

/** 门扇的面（不含把手） */
function leafBody(g: THREE.Group, style: DoorLeafStyle | undefined, w: number, h: number, t: number, c: string, kind?: DoorGlass) {
  const s = Math.max(5, Math.min(12, w * 0.13))
  switch (style) {
    case undefined:
    case 'flush':
      g.add(rbox(w, h, t, c, { y: 0 }, 1.2))
      return
    case 'panel2':
    case 'panel4':
    case 'panel6': {
      g.add(rbox(w, h, t, c, { y: 0 }, 1.2))
      const cols = style === 'panel2' || w < 50 ? 1 : 2
      // 各行占比（从下往上）：两格门上长下短、四格门两行、六格门下中上（上面一行矮）
      const rows = style === 'panel2' ? [0.42, 0.58] : style === 'panel4' ? [0.4, 0.6] : [0.36, 0.44, 0.2]
      const top = Math.min(12, h * 0.06)
      const bot = Math.min(20, h * 0.1)
      const rail = Math.min(9, h * 0.045)
      const avail = h - top - bot - rail * (rows.length - 1)
      const pw = (w - 2 * s - (cols - 1) * s * 0.8) / cols
      let y = bot
      for (const f of rows) {
        const ph = avail * f
        for (let i = 0; i < cols; i++) raised(g, -w / 2 + s + pw / 2 + i * (pw + s * 0.8), y, pw, ph, t, c)
        y += ph + rail
      }
      return
    }
    case 'glassTop': {
      // 下半一块门芯板、上半玻璃
      const split = h * 0.46
      const top = Math.min(10, h * 0.05)
      g.add(rbox(w, split, t, c, { y: 0 }, 1.2))
      raised(g, 0, Math.min(18, h * 0.09), w - 2 * s, split - Math.min(18, h * 0.09) - 8, t, c)
      g.add(rbox(w, 8, t, c, { y: split }, 0.8))
      for (const k of [-1, 1]) g.add(rbox(s, h - split - 8, t, c, { x: (k * (w - s)) / 2, y: split + 8 }, 0.8))
      g.add(rbox(w - 2 * s + 0.4, top, t, c, { y: h - top }, 0.6))
      g.add(glass(w - 2 * s + 0.4, h - split - 8 - top + 0.4, 1.2, { y: split + 8 - 0.2 }, false, kind))
      return
    }
    case 'glassFull': {
      // 法式门：细框 + 整片玻璃 + 格条（宽的两列，约 30cm 一行）
      const ss = Math.max(4, Math.min(9, w * 0.1))
      const top = Math.min(9, h * 0.05)
      const bot = Math.min(16, h * 0.08)
      frame(g, w, h, t, c, ss, top, bot)
      const gw = w - 2 * ss
      const gh = h - top - bot
      g.add(glass(gw + 0.4, gh + 0.4, 1.2, { y: bot - 0.2 }, false, kind))
      muntins(g, -gw / 2, gw / 2, bot, h - top, gw >= 45 ? 2 : 1, Math.max(1, Math.round(gh / 30)), t * 0.6, c)
      return
    }
    case 'glassStrip': {
      // 竖条玻璃门：门板正中一条竖向窄玻璃（下沿离地 ~30、上沿离顶 ~24）
      const gw = Math.max(5, Math.min(14, w * 0.15))
      holed(g, w, h, t, c, -gw / 2, gw / 2, [[Math.min(30, h * 0.15), h - Math.min(24, h * 0.12)]], kind)
      return
    }
    case 'glassSlits': {
      // 横条玻璃门：门板中间一列横向窄玻璃（约 55% 宽、每条 ~4 高、间距 ~14）
      const gw = Math.max(6, w * 0.55)
      const sh = Math.max(2, Math.min(4.5, h * 0.022))
      const y0 = h * 0.22
      const y1 = h * 0.86
      const n = Math.max(2, Math.round((y1 - y0) / 14))
      const step = (y1 - y0 - sh) / (n - 1)
      const holes: [number, number][] = []
      for (let i = 0; i < n; i++) holes.push([y0 + step * i, y0 + step * i + sh])
      holed(g, w, h, t, c, -gw / 2, gw / 2, holes, kind)
      return
    }
    case 'louver': {
      // 百叶门：框 + 中冒头，上下两段斜百叶
      const top = Math.min(9, h * 0.05)
      const bot = Math.min(14, h * 0.07)
      const mid = 8
      frame(g, w, h, t, c, s * 0.7, top, bot)
      const ym = h * 0.5
      g.add(rbox(w - 1.4 * s + 0.4, mid, t, c, { y: ym - mid / 2 }, 0.6))
      const slatW = w - 1.4 * s + 0.2
      for (const [y0, y1] of [
        [bot, ym - mid / 2],
        [ym + mid / 2, h - top],
      ]) {
        const n = Math.max(2, Math.floor((y1 - y0) / 4.5))
        const step = (y1 - y0) / n
        for (let i = 0; i < n; i++) g.add(rbox(slatW, 0.9, t * 0.9, shade(c, -0.04), { y: y0 + step * (i + 0.5) - 0.45, rx: 0.55 }, 0.2))
      }
      return
    }
    case 'grooved': {
      // 横纹门：平板 + 一道道横向的凹槽（深色细条）
      g.add(rbox(w, h, t, c, { y: 0 }, 1.2))
      const n = Math.max(3, Math.round(h / 16))
      for (let i = 1; i < n; i++) g.add(rbox(w - 1, 0.8, t + 0.3, shade(c, -0.13), { y: (h * i) / n - 0.4 }, 0.2))
      return
    }
    case 'fusuma':
    case 'fusumaPattern': {
      // 襖：纸面 + 一圈黑漆边框；花纹款下段一条色带、上面撒几片金箔
      const b = Math.min(2.6, w * 0.05)
      const lacquer = '#3b302a'
      g.add(rbox(w - 2 * b + 0.4, h - 2 * b + 0.4, t, c, { y: b - 0.2 }, 0.4))
      for (const k of [-1, 1]) g.add(rbox(b, h, t + 0.6, lacquer, { x: (k * (w - b)) / 2 }, 0.4))
      for (const y of [0, h - b]) g.add(rbox(w - 2 * b + 0.4, b, t + 0.6, lacquer, { y }, 0.4))
      if (style === 'fusumaPattern') {
        const iw = w - 2 * b
        const band = shade(c, -0.32, 0.08)
        const bh = h * 0.3
        g.add(rbox(iw, bh, t + 0.25, band, { y: b }, 0.2))
        // 色带上沿起伏的「雲」：几段高低错开的同色块
        const n = Math.max(2, Math.round(iw / 22))
        for (let i = 0; i < n; i++) {
          const cw = iw / n
          const ch = 5 + ((i * 7) % 3) * 4
          g.add(rbox(cw * 0.8, ch, t + 0.25, band, { x: -iw / 2 + cw * (i + 0.5), y: b + bh - 1 }, 0.6))
        }
        // 金箔：几片小方块
        const gold = '#d6b25e'
        const spots: [number, number][] = [
          [0.2, 0.62],
          [0.62, 0.7],
          [0.4, 0.82],
          [0.78, 0.55],
          [0.3, 0.48],
        ]
        for (const [fx, fy] of spots) g.add(rbox(Math.min(7, iw * 0.12), Math.min(7, iw * 0.12), t + 0.25, gold, { x: -iw / 2 + iw * fx, y: h * fy }, 0.2))
      }
      return
    }
    case 'shoji': {
      // 障子：木框 + 下段腰板 + 纸 + 组子（竖 ~22、横 ~28 一格）
      const ss = Math.min(3.2, w * 0.06)
      const top = 3
      const koshi = Math.min(26, h * 0.13)
      frame(g, w, h, t, c, ss, top, koshi)
      const gw = w - 2 * ss
      const gh = h - top - koshi
      g.add(glass(gw + 0.4, gh + 0.4, 0.8, { y: koshi - 0.2 }, true))
      muntins(g, -gw / 2, gw / 2, koshi, h - top, Math.max(2, Math.round(gw / 22)), Math.max(3, Math.round(gh / 28)), t * 0.7, c, 1.2)
      return
    }
    case 'barn': {
      // 谷仓门：竖向木板（深浅交替）+ 上下横档 + Z 形斜撑（两面都凸出）
      const n = Math.max(3, Math.round(w / 16))
      const pw = w / n
      for (let i = 0; i < n; i++) g.add(rbox(pw - 0.5, h, t, i % 2 ? shade(c, 0.03) : shade(c, -0.03), { x: -w / 2 + pw * (i + 0.5), y: 0 }, 0.4))
      const rail = Math.min(12, h * 0.07)
      const rc = shade(c, -0.08)
      for (const y of [h * 0.06, h - h * 0.06 - rail]) g.add(rbox(w - 2, rail, t + 1.6, rc, { y }, 0.6))
      const ya = h * 0.06 + rail
      const yb = h - h * 0.06 - rail
      const dx = w - 2 - rail * 1.2
      const dy = yb - ya
      const L = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx)
      // 斜撑的盒子转过角度后四角会探出一点：按转角把长度收一点
      const len = Math.max(4, L - rail * Math.abs(Math.sin(a)) - rail * 0.4)
      g.add(rbox(len, rail * 0.9, t + 1.6, rc, { y: (ya + yb) / 2 - (rail * 0.9) / 2, rz: a }, 0.6))
      return
    }
  }
}

/** 把手：两面各一个（嵌入式拉手是一块穿透的深色凹槽）；x 把手中心，y 高度 */
function handleAt(g: THREE.Group, kind: DoorHandle, x: number, y: number, t: number, color: string, toward: -1 | 1, h: number) {
  if (kind === 'pull') {
    g.add(rbox(3.4, 9, t + 0.5, shade(color, -0.45), { x, y: y - 4.5 }, 1.2))
    return
  }
  for (const s of [-1, 1]) {
    const z0 = s * (t / 2)
    if (kind === 'lever') {
      g.add(rbox(5, 5, 1, color, { x, y: y - 2.5, z: z0 + s * 0.5 }, 2.3))
      g.add(rbox(1.6, 1.6, 4, color, { x, y: y - 0.8, z: z0 + s * 2 }, 0.6))
      g.add(rbox(11, 1.8, 1.8, color, { x: x + toward * 4.6, y: y - 0.9, z: z0 + s * 4 }, 0.8))
    } else if (kind === 'knob') {
      g.add(rbox(5.4, 5.4, 1, color, { x, y: y - 2.7, z: z0 + s * 0.5 }, 2.5))
      g.add(rbox(1.6, 1.6, 3, color, { x, y: y - 0.8, z: z0 + s * 1.8 }, 0.6))
      g.add(ball(2.8, color, { x, y, z: z0 + s * 4.6 }))
    } else {
      // 长拉手：竖条 + 上下两个支脚；高门扇上更长
      const L = h > 150 ? Math.min(90, h * 0.45) : Math.max(10, Math.min(30, h * 0.4))
      const yc = h > 150 ? Math.min(h - L / 2 - 8, 105) : y
      g.add(rbox(2.2, L, 2.2, color, { x, y: yc - L / 2, z: z0 + s * 4.6 }, 1))
      for (const k of [-1, 1]) g.add(rbox(1.6, 1.6, 4, color, { x, y: yc + (k * (L / 2 - 5)) - 0.8, z: z0 + s * 2 }, 0.6))
    }
  }
}

/** 门扇模型（局部坐标见文件头） */
export function doorLeafModel(s: LeafSpec): THREE.Group {
  const g = new THREE.Group()
  const { w, h, t, color } = s
  if (w < 4 || h < 4) return g
  leafBody(g, s.style, w, h, t, color, s.glass)
  if (s.handleSide) {
    const edge = s.handle === 'pull' ? 5 : s.handle === 'bar' ? 7 : 8
    const x = s.handleSide * (w / 2 - Math.min(edge, w * 0.2))
    handleAt(g, s.handle, x, Math.min(95, h * 0.5), t, s.handleColor, s.handleSide > 0 ? -1 : 1, h)
  }
  return g
}

/** 开门旁的固定玻璃（侧窗 / 亮子）：x0..x1 × y0..y1 的一块，框色同门扇，厚 t；中面 z = 0；玻璃同门扇（LeafSpec.glass） */
export function liteModel(x0: number, x1: number, y0: number, y1: number, t: number, color: string, kind?: DoorGlass): THREE.Group {
  const g = new THREE.Group()
  const w = x1 - x0
  const h = y1 - y0
  if (w < 4 || h < 4) return g
  const b = Math.min(4, w * 0.15, h * 0.2)
  const cx = (x0 + x1) / 2
  for (const k of [-1, 1]) g.add(rbox(b, h, t, color, { x: cx + (k * (w - b)) / 2, y: y0 }, 0.6))
  for (const y of [y0, y1 - b]) g.add(rbox(w - 2 * b + 0.4, b, t, color, { x: cx, y }, 0.6))
  g.add(glass(w - 2 * b + 0.4, h - 2 * b + 0.4, 1.2, { x: cx, y: y0 + b - 0.2 }, false, kind))
  return g
}
