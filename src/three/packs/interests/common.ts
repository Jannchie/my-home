// 兴趣素材包的共用小工具：颜色常量、沿折线的锥管、乐器和摆件共用的画法
// 只放建模函数和它们用到的常量，素材表在 ../interests.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, rbox, shade, toon } from '../../toon'
import { paintPanel, rng } from '../../kit'
import { PI, taperRod3, type V2, type V3 } from '../../geo'

export type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

export const METAL = '#d5d9de'
export const GOLD = '#e3b549'
export const BRASS = '#e6bf55'
export const DARK = '#2e2f33'
export const RUBBER = '#3a3b40'
export const PAPER = '#fbf8f0'
export const IVORY = '#f6f0e1'
export const CARD = '#c99a62'
export const GLASS = '#cfe8f5'

// ---------- 小工具 ----------

/** 沿折线的管子（萨克斯、小号），半径从 r0 渐变到 r1，关节处补球 */
export function taperPath(pts: V3[], r0: number, r1: number, color: string, seg = 12) {
  const g = new THREE.Group()
  let total = 0
  const acc = [0]
  for (let i = 1; i < pts.length; i++) {
    total += new THREE.Vector3(...pts[i]).distanceTo(new THREE.Vector3(...pts[i - 1]))
    acc.push(total)
  }
  const rAt = (i: number) => r0 + ((r1 - r0) * acc[i]) / total
  for (let i = 1; i < pts.length; i++) {
    g.add(taperRod3(pts[i - 1], pts[i], rAt(i - 1), rAt(i), color, seg))
    if (i < pts.length - 1) g.add(ball(rAt(i), color, { x: pts[i][0], y: pts[i][1], z: pts[i][2] }))
  }
  return g
}

/** 右半边轮廓（从底部中线到顶部中线）镜像成完整轮廓 */
export function sym(right: V2[]): V2[] {
  return [...right, ...right.slice(1, -1).reverse().map(([x, y]): V2 => [-x, y])]
}

/** 平面轮廓挤出成板（琴身、滑板、冲浪板）：轮廓在 xy 平面，厚度沿 z 居中 */
export function flat(pts: V2[], depth: number, color: string, smooth = true, bevel = 0.5) {
  let v: THREE.Vector2[]
  if (smooth) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal')
    v = curve.getPoints(pts.length * 8).map((p) => new THREE.Vector2(p.x, p.y))
    v.pop()
  } else v = pts.map(([x, y]) => new THREE.Vector2(x, y))
  const b = Math.min(bevel, depth * 0.3)
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(v), { depth: Math.max(0.01, depth - b * 2), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 8 })
  geo.translate(0, 0, -depth / 2 + b)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 平放的画面：w × d，画布顶边朝后（-z），(x, z) 为中心，y 为高度 */
export function paintTop(w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number) {
  return paintPanel(w, d, key, draw, { x, y, z: z + d / 2, rx: -PI / 2 })
}

/** 平放的薄板（卡片、纸），给中心 */
export const sheet = (w: number, d: number, color: string, x: number, y: number, z: number, t = 0.2) => rbox(w, t, d, color, { x, y, z }, t * 0.4)

// ---------- 画面 ----------

/** 琴键：从 start（0 = C … 6 = B）开始的 nWhite 个白键，黑键长度占 blackLen */
export function drawKeys(nWhite: number, white: string, black: string, start = 0, blackLen = 0.6): Draw {
  return (g, W, H) => {
    g.fillStyle = white
    g.fillRect(0, 0, W, H)
    const kw = W / nWhite
    g.fillStyle = shade(white, -0.35)
    for (let i = 1; i < nWhite; i++) g.fillRect(i * kw - 0.5, 0, Math.max(1, kw * 0.07), H)
    g.fillStyle = black
    for (let i = 0; i < nWhite - 1; i++) {
      const n = (i + start) % 7
      if (n === 0 || n === 1 || n === 3 || n === 4 || n === 5) g.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, H * blackLen)
    }
  }
}

/** 乐谱：五线谱 + 音符 */
export function drawScore(paper: string, ink: string, seed = 1): Draw {
  return (g, W, H) => {
    const r = rng(seed)
    g.fillStyle = paper
    g.fillRect(0, 0, W, H)
    g.fillStyle = ink
    g.fillRect(W * 0.3, H * 0.05, W * 0.4, H * 0.025)
    const rows = 7
    for (let k = 0; k < rows; k++) {
      const y0 = H * (0.14 + k * 0.12)
      const gap = H * 0.012
      for (let l = 0; l < 5; l++) g.fillRect(W * 0.08, y0 + l * gap, W * 0.84, Math.max(1, H * 0.0025))
      for (let n = 0; n < 9; n++) {
        const x = W * (0.16 + n * 0.085)
        const y = y0 + gap * Math.floor(r() * 7) * 0.5
        g.beginPath()
        g.ellipse(x, y, gap * 0.75, gap * 0.55, -0.4, 0, PI * 2)
        g.fill()
        g.fillRect(x + gap * 0.6, y - gap * 3, Math.max(1, W * 0.004), gap * 3)
      }
    }
  }
}

/** 指板：品丝 + 圆点 */
export function drawFretboard(wood: string, fret: string, frets: number): Draw {
  return (g, W, H) => {
    g.fillStyle = wood
    g.fillRect(0, 0, W, H)
    let y = H
    let step = H / (frets * 0.62)
    const pos: number[] = []
    for (let i = 0; i < frets; i++) {
      y -= step
      step *= 0.944
      pos.push(y)
      g.fillStyle = fret
      g.fillRect(0, y, W, Math.max(1, H * 0.006))
    }
    g.fillStyle = IVORY
    for (const i of [2, 4, 6, 8, 11, 14, 16]) {
      if (i >= pos.length) continue
      const cy = (pos[i] + (pos[i - 1] ?? H)) / 2
      const dots = i === 11 ? [-0.25, 0.25] : [0]
      for (const dx of dots) {
        g.beginPath()
        g.arc(W * (0.5 + dx), cy, W * 0.12, 0, PI * 2)
        g.fill()
      }
    }
  }
}
