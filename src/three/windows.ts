// 窗的 3D 模型（各种款式）和拱顶 / 圆窗在墙洞里补上的墙角块。
//
// 局部坐标：x 沿墙（窗中心 x = 0），y 从窗台（0）往上到窗顶（h），z 横穿墙（out = +1 时户外在 +z 一侧）。
// house.ts buildOpenings 把这个组摆到窗洞中心、转到墙的方向；外观编辑器里的预览图也是同一份模型。
// 款式都不填的窗走 plain / 旧的落地推拉窗，几何和以前逐块一致（旧存档的样子不变）。

import * as THREE from 'three'
import type { WindowGrid, WindowStyle } from '../model'
import { archRise, roundDiameter } from '../windows'
import { C } from './assets'
import { rbox, toon } from './toon'
import { movable } from './kit'
import { SWING_MAX, windowLeaves } from '../doorMotion'

/** plain = 旧的腰窗（白框 + 一整片玻璃）；legacySash = 旧的落地推拉窗（两扇错开、一扇推开一半） */
export type WindowModelStyle = WindowStyle | 'plain' | 'legacySash'

export interface WindowSpec {
  style: WindowModelStyle
  /** 窗洞宽、高（cm） */
  w: number
  h: number
  /** 墙厚 */
  wall: number
  /** 窗框颜色 */
  frame: string
  grid?: WindowGrid
  /** 外墙上的百叶护窗板颜色（不画就不填） */
  shutters?: string
  /** 户外在 +z（1）还是 -z（-1） */
  out: 1 | -1
  /** 铰链在哪一端（单扇平开窗）：start = -x 一侧 */
  hinge?: 'start' | 'end'
  /** 窗顶被天花截掉了：不画上框（同旧的腰窗） */
  clipped?: boolean
  /**
   * 通往阳台的落地窗（当门用）：推拉扇、平开扇建在关着的位置，标成会动的部件（kit.ts movable，平开扇开到底 90°），
   * 由 kit.ts poseDoor 按开合程度摆。不填 = 摆成固定的样子（同以前）
   */
  movable?: boolean
}

const glassMat = () => toon(C.glass, { transparent: 0.45 })
/** 和风细格的「纸」：暖白、半透 */
const paperMat = () => toon('#fbf5e6', { transparent: 0.82 })

function glassBox(w: number, h: number, d: number, at: { x?: number; y: number; z?: number; rx?: number; ry?: number }, paper = false) {
  const m = rbox(Math.max(0.5, w), Math.max(0.5, h), d, C.glass, at, 0.3)
  m.material = paper ? paperMat() : glassMat()
  return m
}

/**
 * 格条：在 (x0..x1, y0..y1) 的玻璃面上排横竖细条（窗框色）。
 * cross 十字；colonial 每格约 28cm；shoji 竖向 ~20、横向 ~26 的细格；top 上部四分之一一排小格。
 */
function gridBars(g: THREE.Group, grid: WindowGrid | undefined, x0: number, x1: number, y0: number, y1: number, z: number, color: string) {
  if (!grid || grid === 'none') return
  const W = x1 - x0
  const H = y1 - y0
  if (W < 8 || H < 8) return
  const bar = grid === 'shoji' ? 1.2 : 1.8
  const vbars = (n: number, ya: number, yb: number) => {
    for (let i = 1; i < n; i++) g.add(rbox(bar, yb - ya, 1.6, color, { x: x0 + (W * i) / n, y: ya, z }, 0.3))
  }
  const hbars = (n: number, ya: number, yb: number) => {
    for (let i = 1; i < n; i++) g.add(rbox(W, bar, 1.6, color, { x: (x0 + x1) / 2, y: ya + ((yb - ya) * i) / n - bar / 2, z }, 0.3))
  }
  if (grid === 'cross') {
    vbars(2, y0, y1)
    hbars(2, y0, y1)
  } else if (grid === 'colonial') {
    vbars(Math.max(2, Math.round(W / 28)), y0, y1)
    hbars(Math.max(2, Math.round(H / 28)), y0, y1)
  } else if (grid === 'shoji') {
    vbars(Math.max(2, Math.round(W / 20)), y0, y1)
    hbars(Math.max(3, Math.round(H / 26)), y0, y1)
  } else if (grid === 'top') {
    const yt = y1 - Math.min(H * 0.28, 32)
    g.add(rbox(W, bar, 1.6, color, { x: (x0 + x1) / 2, y: yt - bar / 2, z }, 0.3))
    vbars(Math.max(2, Math.round(W / 18)), yt, y1)
  }
}

/** 一扇窗扇：框（宽 b）+ 玻璃 + 格条；原点在扇的左下角往右 w/2（底边中点），z 为扇的中面 */
function sash(w: number, h: number, d: number, color: string, grid: WindowGrid | undefined, b = 3.2) {
  const g = new THREE.Group()
  g.add(rbox(w, b, d, color, { y: 0 }, 0.6))
  g.add(rbox(w, b, d, color, { y: h - b }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(b, h - 2 * b, d, color, { x: (s * (w - b)) / 2, y: b }, 0.6))
  const paper = grid === 'shoji'
  g.add(glassBox(w - 2 * b + 0.4, h - 2 * b + 0.4, 1.2, { y: b - 0.2 }, paper))
  gridBars(g, grid, -w / 2 + b, w / 2 - b, b, h - b, 0, color)
  return g
}

/** 把手：小竖条，贴在扇的室内一侧 */
function handle(x: number, y: number, z: number, color = '#d9dcdf') {
  return rbox(1.6, 9, 2.2, color, { x, y: y - 4.5, z }, 0.6)
}

/** 窗洞四周的窗框（同旧腰窗的白框：4cm 宽，比墙厚 2cm）；只要两侧和下框时 top = false */
function casing(g: THREE.Group, w: number, h: number, wall: number, color: string, top: boolean, b = 4) {
  g.add(rbox(w, b, wall + 2, color, { y: 0 }, 0.8))
  if (top) g.add(rbox(w, b, wall + 2, color, { y: h - b }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(b, h, wall + 2, color, { x: (s * (w - b)) / 2 }, 0.8))
}

/** 椭圆弧上的点（中心 (0, cy)，半轴 rx / ry，角度 a0→a1，n 段） */
function arc(rx: number, ry: number, cy: number, a0: number, a1: number, n: number) {
  const out: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push(new THREE.Vector2(Math.cos(a) * rx, cy + Math.sin(a) * ry))
  }
  return out
}

/** 沿折线摆一圈框条（拱顶、圆窗的弧形框） */
function barsAlong(g: THREE.Group, pts: THREE.Vector2[], b: number, d: number, color: string, z = 0) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i]
    const q = pts[i + 1]
    const L = p.distanceTo(q)
    if (L < 0.2) continue
    // rbox 的几何本身是居中的（at.y 只是把位置抬高半个高度）：直接放到弦的中点、绕 z 转到弦的方向
    const m = rbox(L + b * 0.6, b, d, color, {}, 0.5)
    m.position.set((p.x + q.x) / 2, (p.y + q.y) / 2, z)
    m.rotation.set(0, 0, Math.atan2(q.y - p.y, q.x - p.x))
    g.add(m)
  }
}

/** 平板玻璃：任意轮廓（局部 xy），厚 d、中面在 z */
function glassShape(pts: THREE.Vector2[], d: number, z: number, paper = false) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: d, bevelEnabled: false, curveSegments: 1 })
  geo.translate(0, 0, z - d / 2)
  const m = new THREE.Mesh(geo, paper ? paperMat() : glassMat())
  m.receiveShadow = true
  return m
}

/** 外墙一侧的百叶护窗板：窗两侧各一扇（半个窗宽，最宽 60），横向百叶条 */
function shutters(g: THREE.Group, w: number, h: number, wall: number, out: 1 | -1, color: string) {
  const sw = Math.min(60, Math.max(20, w / 2 - 4))
  const z = out * (wall / 2 + 2)
  for (const s of [-1, 1]) {
    // 让开窗套（外墙的窗两侧各有 7cm 宽的窗套）
    const x = s * (w / 2 + sw / 2 + 8)
    g.add(rbox(sw, h, 2.4, color, { x, y: 0, z }, 0.6))
    // 百叶：深一点的横条（凸出板面 0.8）
    const n = Math.max(3, Math.floor((h - 12) / 9))
    for (let i = 0; i < n; i++) g.add(rbox(sw - 7, 2.2, 1.2, color, { x, y: 6 + ((h - 12) * (i + 0.5)) / n - 1.1, z: z + out * 1.4, rx: -out * 0.35 }, 0.3))
  }
}

/** 窗的模型（局部坐标见文件头） */
export function windowModel(s: WindowSpec): THREE.Group {
  const g = new THREE.Group()
  const { w, h, wall, frame: F, grid, out } = s
  if (w < 8 || h < 4) return g
  const top = !s.clipped
  switch (s.style) {
    case 'plain': {
      // 旧的腰窗：白框 + 一整片玻璃（数值不能动）
      casing(g, w, h, wall, F, top)
      g.add(glassBox(w - 6, h - 6, 1.4, { y: 3 }, grid === 'shoji'))
      gridBars(g, grid, -w / 2 + 4, w / 2 - 4, 4, h - (top ? 4 : 0), 0, F)
      break
    }
    case 'legacySash':
    case 'sliding': {
      // 引き違い：两扇错开在前后两条轨道上（几何见 doorMotion.ts windowLeaves）；旧的落地推拉窗一扇推开一半，普通的推拉窗两扇关着、在中间叠一点
      const legacy = s.style === 'legacySash'
      const t = Math.max(2, wall / 4)
      const L = windowLeaves(s.style, w, wall)!
      if (!legacy) casing(g, w, h, wall, F, top)
      const y0 = legacy ? 0 : 4
      const hh = legacy ? h : h - (top ? 8 : 4)
      L.slide.forEach((p, k) => {
        const pw = p.pw
        const panel = new THREE.Group()
        if (legacy) {
          for (const y of [0, hh - 4]) panel.add(rbox(pw, 4, t, F, { y }, 0.6))
          for (const side of [-1, 1]) panel.add(rbox(4, hh, t, F, { x: (side * (pw - 4)) / 2 }, 0.6))
          const pane = rbox(pw - 6, hh - 8, t + 0.4, C.glass, { y: 4 }, 0.3)
          pane.material = grid === 'shoji' ? paperMat() : glassMat()
          panel.add(pane)
          gridBars(panel, grid, -pw / 2 + 4, pw / 2 - 4, 4, hh - 4, 0, F)
        } else {
          panel.add(sash(pw, hh, t, F, grid))
          // 召し合わせ（两扇相接的竖框）上的月牙锁
          if (k === 0) panel.add(handle(pw / 2 - 2, hh * 0.5, -out * (t / 2 + 1)))
        }
        // 旧的落地推拉窗摆成固定样子时推开一半多一点
        panel.position.set(legacy && !s.movable && k === 0 ? p.x + w * 0.18 : p.x, y0, p.z * out)
        // 当门用：两扇各自推到另一扇那边（开到底 = 和另一扇重叠），doorLeaf 标出是哪一扇（openers.ts 分开开合）
        if (s.movable) {
          movable(panel, { kind: 'slide', dx: p.x1 - p.x })
          panel.userData.doorLeaf = k
        }
        g.add(panel)
      })
      break
    }
    case 'fixed': {
      // 固定窗：细框、整片玻璃，没有把手
      casing(g, w, h, wall, F, top, 3.2)
      g.add(glassBox(w - 5, h - 5, 1.4, { y: 2.5 }, grid === 'shoji'))
      gridBars(g, grid, -w / 2 + 3.2, w / 2 - 3.2, 3.2, h - (top ? 3.2 : 0), 0, F)
      break
    }
    case 'casement':
    case 'casement2':
    case 'combo': {
      // 平开：一扇（铰链一侧）推开 30°，其余关着；组合窗中间一大片固定玻璃、两侧窄扇（几何见 doorMotion.ts windowLeaves）
      casing(g, w, h, wall, F, top)
      const L = windowLeaves(s.style, w, wall, s.hinge)!
      const hh = h - (top ? 8 : 4)
      const d = 3.2
      if (L.fixed) {
        // 中间固定：两根竖框 + 玻璃
        for (const x of L.fixed) g.add(rbox(3.6, hh, wall * 0.6, F, { x, y: 4 }, 0.6))
        const fx0 = L.fixed[0] + 1.8
        const fx1 = L.fixed[1] - 1.8
        g.add(glassBox(fx1 - fx0, hh, 1.4, { x: (fx0 + fx1) / 2, y: 4 }, grid === 'shoji'))
        gridBars(g, grid, fx0, fx1, 4, 4 + hh, 0, F)
      }
      if (s.style === 'casement2') g.add(rbox(2.4, hh, wall * 0.5, F, { x: 0, y: 4 }, 0.6))
      for (const f of L.swing) {
        const lw = f.x1 - f.x0
        const leaf = sash(lw, hh, d, F, grid)
        // 铰链在扇的一侧、户外那面：以铰链为原点转
        const pivot = new THREE.Group()
        pivot.position.set(f.left ? f.x0 : f.x1, 4, out * f.z)
        leaf.position.set(f.left ? lw / 2 : -lw / 2, 0, 0)
        leaf.add(handle(f.left ? lw / 2 - 4 : -lw / 2 + 4, hh * 0.5, -out * (d / 2 + 1)))
        pivot.add(leaf)
        // 往户外推开：当门用时每扇都能推开到 90°，摆成固定样子时一扇推开 30°
        const sign = (f.left ? -1 : 1) * out
        if (s.movable) movable(pivot, { kind: 'swing', angle: sign * SWING_MAX })
        else if (f.ajar) pivot.rotation.y = (sign * (30 * Math.PI)) / 180
        g.add(pivot)
      }
      break
    }
    case 'doubleHung': {
      // 上下提拉：上扇在外、下扇在里，中间的召し合わせ横框重叠一点；下扇略微提起
      casing(g, w, h, wall, F, top)
      const inner = w - 8
      const hh = h - (top ? 8 : 4)
      const half = hh / 2 + 1.5
      const t = 3.2
      const upper = sash(inner, half, t, F, grid)
      upper.position.set(0, 4 + hh - half, out * (t / 2 + 0.4))
      const lower = sash(inner, half, t, F, grid)
      lower.position.set(0, 4 + Math.min(hh * 0.12, 14), -out * (t / 2 + 0.4))
      lower.add(handle(0, half - 2, -out * (t / 2 + 1)))
      g.add(upper, lower)
      break
    }
    case 'awning': {
      // 上悬：铰链在上框，下沿往户外推出 20°
      casing(g, w, h, wall, F, top)
      const inner = w - 8
      const hh = h - (top ? 8 : 4)
      const d = 3.2
      const pivot = new THREE.Group()
      pivot.position.set(0, 4 + hh, out * (wall / 2 - d / 2))
      const leaf = sash(inner, hh, d, F, grid)
      leaf.position.set(0, -hh, 0)
      leaf.add(handle(0, 8, -out * (d / 2 + 1)))
      pivot.add(leaf)
      pivot.rotation.x = -out * (20 * Math.PI) / 180
      g.add(pivot)
      break
    }
    case 'louver': {
      // 百叶窗（ジャロジー）：一排横向的磨砂玻璃条，微微张开；两侧竖框
      casing(g, w, h, wall, F, top)
      const inner = w - 8
      const hh = h - (top ? 8 : 4)
      const n = Math.max(3, Math.round(hh / 9))
      const step = hh / n
      for (let i = 0; i < n; i++) {
        const slat = rbox(inner - 2, 1, step + 1.5, C.glass, { y: 4 + step * (i + 0.5) - 0.5, rx: out * 0.45 }, 0.2)
        slat.material = toon('#dfe9ee', { transparent: 0.6 })
        g.add(slat)
      }
      for (const sx of [-1, 1]) g.add(rbox(2.4, hh, 8, F, { x: sx * (inner / 2 - 1.2), y: 4 }, 0.5))
      break
    }
    case 'arched': {
      // 拱顶：下面是矩形，上面一道椭圆拱（拱高见 archRise）；拱里放放射状格条（有格条时）
      const rise = archRise(w, h)
      const ys = h - rise
      const b = 4
      g.add(rbox(w, b, wall + 2, F, { y: 0 }, 0.8))
      for (const sx of [-1, 1]) g.add(rbox(b, ys, wall + 2, F, { x: (sx * (w - b)) / 2 }, 0.8))
      barsAlong(g, arc(w / 2 - b / 2, rise - b / 2, ys, 0, Math.PI, 10), b, wall + 2, F)
      // 拱脚的横框
      g.add(rbox(w - 2 * b, 2.6, 4, F, { y: ys - 1.3 }, 0.5))
      const pts = [new THREE.Vector2(-w / 2 + b, b), new THREE.Vector2(w / 2 - b, b), ...arc(w / 2 - b, rise - b, ys, 0, Math.PI, 16)]
      g.add(glassShape(pts, 1.4, 0, grid === 'shoji'))
      if (grid && grid !== 'none') {
        gridBars(g, grid === 'top' ? 'cross' : grid, -w / 2 + b, w / 2 - b, b, ys - 1.3, 0, F)
        // 拱里的放射格条
        for (const a of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) barsAlong(g, [new THREE.Vector2(0, ys), new THREE.Vector2(Math.cos(a) * (w / 2 - b), ys + Math.sin(a) * (rise - b))], 1.6, 1.6, F)
      }
      break
    }
    case 'round': {
      // 圆窗：直径 = 窗宽、窗高里小的那个，居中；一圈框 + 圆玻璃（有格条时十字）
      const D = roundDiameter(w, h)
      const r = D / 2
      const cy = h / 2
      const b = 4
      barsAlong(g, arc(r - b / 2, r - b / 2, cy, 0, Math.PI * 2, 20), b, wall + 2, F)
      g.add(glassShape(arc(r - b, r - b, cy, 0, Math.PI * 2, 24).slice(0, -1), 1.4, 0))
      if (grid && grid !== 'none') {
        g.add(rbox(1.8, D - 2 * b, 1.6, F, { y: cy - r + b }, 0.3))
        g.add(rbox(D - 2 * b, 1.8, 1.6, F, { y: cy - 0.9 }, 0.3))
      }
      break
    }
  }
  if (s.shutters && s.style !== 'round') shutters(g, w, h, wall, out, s.shutters)
  return g
}

// ---------- 拱顶窗 / 圆窗：矩形墙洞里补回墙的部分 ----------

/**
 * 墙洞四角补回的墙块（拱顶窗：拱上方两角；圆窗：圆外四角）。局部坐标：x ∈ [-L/2, L/2]，y ∈ [-H/2, H/2]（块的中心为原点），
 * z ∈ [-t/2, t/2]。几何分三组：0 = +z 面、1 = -z 面、2 = 弧形的洞口内侧面（材质顺序同 house.ts wallPiece 的 faces）。
 * 椭圆中心 (0, cy)，半轴 rx / ry；lower = 下面两角也补（圆窗）。
 */
export function spandrelGeometry(L: number, H: number, t: number, rx: number, ry: number, cy: number, lower: boolean): THREE.BufferGeometry | null {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const groups: number[][] = [[], [], []]
  const yb = -H / 2
  const yt = H / 2
  const push = (grp: number, tri: [number, number, number][], n: [number, number, number][]) => {
    for (let i = 0; i < 3; i++) {
      groups[grp].push(pos.length / 3)
      pos.push(...tri[i])
      nor.push(...n[i])
      uv.push(tri[i][0] / 100, tri[i][1] / 100)
    }
  }
  const quads = [
    [-1, 1],
    [1, 1],
    ...(lower
      ? [
          [-1, -1],
          [1, -1],
        ]
      : []),
  ]
  const SEG = 8
  for (const [sx, sy] of quads) {
    const edgeY = sy > 0 ? yt : yb
    const tipY = cy + sy * ry
    // 轮廓：角 → 边中点 → 弧顶 → 弧 → 弧脚 → 侧边中点
    const ring: THREE.Vector2[] = [new THREE.Vector2((sx * L) / 2, edgeY), new THREE.Vector2(0, edgeY)]
    const arcPts: THREE.Vector2[] = []
    for (let i = 0; i <= SEG; i++) {
      const a = (Math.PI / 2) * (1 - i / SEG)
      arcPts.push(new THREE.Vector2(sx * Math.cos(a) * rx, cy + sy * Math.sin(a) * ry))
    }
    if (Math.abs(tipY - edgeY) > 0.05) ring.push(arcPts[0])
    ring.push(...arcPts.slice(1))
    if (Math.abs(rx - L / 2) > 0.05) ring.push(new THREE.Vector2((sx * L) / 2, cy))
    // 去掉重复点
    const pts = ring.filter((p, i) => i === 0 || p.distanceTo(ring[i - 1]) > 0.01)
    if (pts.length < 3) continue
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse()
    const faces = THREE.ShapeUtils.triangulateShape(pts, [])
    for (const [a, b, c] of faces) {
      const A = pts[a]
      const B = pts[b]
      const Cc = pts[c]
      push(0, [[A.x, A.y, t / 2], [B.x, B.y, t / 2], [Cc.x, Cc.y, t / 2]], [[0, 0, 1], [0, 0, 1], [0, 0, 1]])
      push(1, [[A.x, A.y, -t / 2], [Cc.x, Cc.y, -t / 2], [B.x, B.y, -t / 2]], [[0, 0, -1], [0, 0, -1], [0, 0, -1]])
    }
    // 弧形内侧面：法线指向椭圆中心
    for (let i = 0; i + 1 < arcPts.length; i++) {
      const p = arcPts[i]
      const q = arcPts[i + 1]
      const np = new THREE.Vector2(-p.x / (rx * rx || 1), -(p.y - cy) / (ry * ry || 1)).normalize()
      const nq = new THREE.Vector2(-q.x / (rx * rx || 1), -(q.y - cy) / (ry * ry || 1)).normalize()
      const P0: [number, number, number] = [p.x, p.y, t / 2]
      const Q0: [number, number, number] = [q.x, q.y, t / 2]
      const Q1: [number, number, number] = [q.x, q.y, -t / 2]
      const P1: [number, number, number] = [p.x, p.y, -t / 2]
      const NP: [number, number, number] = [np.x, np.y, 0]
      const NQ: [number, number, number] = [nq.x, nq.y, 0]
      // 绕向朝着法线：(Q0 - P0) × (P1 - P0) 和法线同向
      const e1 = new THREE.Vector3(q.x - p.x, q.y - p.y, 0)
      const cr = e1.cross(new THREE.Vector3(0, 0, -t))
      if (cr.x * (np.x + nq.x) + cr.y * (np.y + nq.y) >= 0) {
        push(2, [P0, Q0, Q1], [NP, NQ, NQ])
        push(2, [P0, Q1, P1], [NP, NQ, NP])
      } else {
        push(2, [P0, Q1, Q0], [NP, NQ, NQ])
        push(2, [P0, P1, Q1], [NP, NP, NQ])
      }
    }
  }
  if (!pos.length) return null
  // 按组重排成连续的区段
  const order = groups.flat()
  const P = new Float32Array(order.length * 3)
  const N = new Float32Array(order.length * 3)
  const U = new Float32Array(order.length * 2)
  order.forEach((v, i) => {
    P.set(pos.slice(v * 3, v * 3 + 3), i * 3)
    N.set(nor.slice(v * 3, v * 3 + 3), i * 3)
    U.set(uv.slice(v * 2, v * 2 + 2), i * 2)
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2))
  let o = 0
  groups.forEach((g, k) => {
    if (g.length) geo.addGroup(o, g.length, k)
    o += g.length
  })
  geo.computeBoundingSphere()
  return geo
}
