// 世界风格素材包的共用小工具：配色常量、挤出轮廓、卷曲腿 / 车旋腿、格心、束腰台座、雕花…
// 只放建模函数和它们用到的常量，素材表在 ../styles-world.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, puck, rbox, shade, torus } from '../../toon'
import { holePanel, type Hole, type Poly, type StyleTag } from '../../kit'
import { cappedTube, cylZ, latheAt, mesh, noOutlineDeep, type TubeOpts, type V3 } from '../../geo'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
export const TUBE: TubeOpts = { seg: { per: 8, min: 12 }, radial: 10, group: true }

export type P2 = [number, number]

/** 新中式：红木 / 黄花梨 / 鸡翅木、朱漆、铜饰、黛瓦、素绢 */
export const CHN = { rose: '#6b2f22', huali: '#b9773f', wenge: '#3f2b22', zitan: '#3a2220', lacquer: '#b8352b', jade: '#5f8f7a', ink: '#2f2b2a', gold: '#c9a45a', brass: '#c79a4a', silk: '#efe4c8', indigo: '#2f4a6b', celadon: '#9fbfa8', tile: '#4a4d52', wall: '#f1ede4', cane: '#c9a66b' }
/** 欧式古典：象牙白 + 金饰、桃花心木、酒红 / 海军蓝丝绒、大理石 */
export const CLS = { ivory: '#f1e8d6', gold: '#c9a54f', cream: '#efe3c4', wine: '#7d2a35', navy: '#2c3a5a', marble: '#ece8e2', vein: '#b8b2aa', mahogany: '#6e3524', sage: '#a7b59a', blush: '#e5bfb5', walnut: '#5e3a26', teal: '#2f5f5f', black: '#2a2626' }
/** 美式乡村：做旧白、谷仓红、鼠尾草绿、松木 / 深橡木、牛仔蓝、格纹、镀锌铁 */
export const FH = { white: '#f2ede2', barn: '#9e3b2e', sage: '#9caf8f', pine: '#c99a63', oak: '#7a5638', denim: '#5b7391', black: '#2f2d2b', cream: '#efe4cc', plaid: '#b5443a', galv: '#a9adb0', mustard: '#d4a23f', cognac: '#9a5a32', brick: '#a85a44', stone: '#a6a198' }

export type Tag = StyleTag
export const ZH: Tag = 'chinese'
export const EU: Tag = 'classic'
export const FA: Tag = 'farmhouse'

export const BRASS = '#d4b25a'
export const IRON = '#2f2f31'

// =====================================================================
// 小工具
// =====================================================================

export function extrude(s: THREE.Shape, depth: number) {
  const bevel = Math.min(0.5, depth * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 20 })
  geo.translate(0, 0, -depth / 2 + bevel)
  return geo
}

/** xy 平面轮廓沿 z 挤出（厚 depth，中心在 z） */
export function prism(pts: P2[], depth: number, color: string, z = 0, x = 0) {
  const m = mesh(extrude(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), depth), color)
  m.position.set(x, 0, z)
  return m
}

/** 侧板：轮廓在 zy 平面（[z, y]），沿 x 挤出厚 t，中心在 x */
export function sidePrism(pts: P2[], t: number, color: string, x: number) {
  const m = prism(pts, t, color)
  m.rotation.y = -Math.PI / 2
  m.position.set(x, 0, 0)
  return m
}

/** 中心线两侧各偏 t/2 得到的闭合带状轮廓 */
export function strip(pts: P2[], t: number): P2[] {
  const L: P2[] = []
  const Rr: P2[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    const nx = (-dy / l) * (t / 2)
    const ny = (dx / l) * (t / 2)
    L.push([pts[i][0] + nx, pts[i][1] + ny])
    Rr.push([pts[i][0] - nx, pts[i][1] - ny])
  }
  return [...L, ...Rr.reverse()]
}

/** 方格栅洞阵：cols × rows */
export function lattice(w: number, h: number, cols: number, rows: number, bar = 2.4, margin = 3): Hole[] {
  const holes: Hole[] = []
  const cw = (w - margin * 2 - bar * (cols - 1)) / cols
  const ch = (h - margin * 2 - bar * (rows - 1)) / rows
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) holes.push({ kind: 'rect', x: -w / 2 + margin + cw / 2 + i * (cw + bar), y: margin + j * (ch + bar), w: cw, h: ch, r: 0.4 })
  return holes
}

/**
 * 把座面压低：y0 以下按比例压缩到 y0 - dy，y0 以上整体下移 dy（靠背、扶手比例不变）。
 * 明式椅子原比例座高约 50（配 85 高的桌子 + 踏脚），和现代 72–75 的桌子搭配会太高。
 */
export function lowerSeat(g: THREE.Group, y0: number, dy: number) {
  g.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert()
  const k = (y0 - dy) / y0
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)
    const geo = m.geometry.clone()
    geo.applyMatrix4(rel)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      pos.setY(i, y < y0 ? y * k : y - dy)
    }
    geo.applyMatrix4(rel.clone().invert())
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    m.geometry = geo
  })
  return g
}

/**
 * 卷曲腿 / 三弯腿：腿顶在 (x, top, z)，膝部朝 (ox, oz) 方向鼓出，脚踝内收、脚尖再外翻落地。
 * foot：'scroll' 卷叶脚（路易式）、'hoof' 马蹄足（明式）、'pad' 圆垫脚（安妮女王）
 */
export function cabriole(x: number, z: number, top: number, r: number, color: string, ox: number, oz: number, foot: 'scroll' | 'hoof' | 'pad' = 'pad', footColor = color) {
  const g = new THREE.Group()
  const k = r * 1.6
  const pts: V3[] = [
    [x, top, z],
    [x + ox * k * 0.7, top * 0.82, z + oz * k * 0.7],
    [x + ox * k * 0.5, top * 0.55, z + oz * k * 0.5],
    [x - ox * k * 0.15, top * 0.25, z - oz * k * 0.15],
    [x + ox * k * 0.25, r * 1.4, z + oz * k * 0.25],
  ]
  g.add(cappedTube(pts, r, color, { ...TUBE, caps: false }))
  g.add(ball(r * 1.15, color, { x: pts[1][0], y: pts[1][1], z: pts[1][2] }, [1, 1.3, 1]))
  const fx = x + ox * k * 0.4
  const fz = z + oz * k * 0.4
  if (foot === 'scroll') {
    g.add(ball(r * 1.15, footColor, { x: fx, y: r * 1.035, z: fz }, [1, 0.9, 1]))
  } else if (foot === 'hoof') {
    g.add(rbox(r * 2.4, r * 1.6, r * 2.4, footColor, { x: fx, y: 0, z: fz }, r * 0.5))
  } else {
    g.add(puck(r * 1.5, r * 0.9, footColor, { x: fx, y: 0, z: fz }))
    g.add(ball(r * 1.05, color, { x: fx, y: r * 1.3, z: fz }))
  }
  return g
}

/** 车旋腿（农舍餐桌、四柱床柱）：轮廓自下而上，h 为总高，at 为底 */
export function turnedLeg(h: number, r: number, color: string, at: { x?: number; y?: number; z?: number }, style: 'farm' | 'baluster' = 'farm') {
  const prof: P2[] =
    style === 'farm'
      ? [
          [0, 0],
          [r * 0.7, 0],
          [r * 0.75, h * 0.04],
          [r * 0.95, h * 0.12],
          [r * 0.7, h * 0.2],
          [r * 1.15, h * 0.3],
          [r * 0.75, h * 0.42],
          [r * 0.85, h * 0.55],
          [r * 1.05, h * 0.62],
          [r * 0.8, h * 0.68],
          [r * 1.0, h * 0.72],
          [r * 1.0, h],
          [0, h],
        ]
      : [
          [0, 0],
          [r * 1.1, 0],
          [r * 1.1, h * 0.05],
          [r * 0.7, h * 0.08],
          [r * 1.2, h * 0.25],
          [r * 0.65, h * 0.45],
          [r * 0.85, h * 0.5],
          [r * 0.6, h * 0.55],
          [r * 0.75, h * 0.85],
          [r * 1.0, h * 0.9],
          [r * 0.8, h * 0.95],
          [r * 0.8, h],
          [0, h],
        ]
  return latheAt(prof, color, at, 16, 0.001)
}

/** 圆形铜饰（中式面叶）：贴在 +z 面上 */
export function brassPlate(x: number, y: number, z: number, r: number, color = BRASS) {
  const g = new THREE.Group()
  g.add(cylZ(r, 0.5, color, x, y, z + 0.25, 20))
  g.add(torus(r * 0.45, 0.35, color, { x, y: y - r * 0.55, z: z + 0.9 }))
  g.add(ball(0.6, color, { x, y: y + r * 0.1, z: z + 0.6 }))
  return g
}

/** 三面围子：背板 + 两侧板，格心开孔 */
export function weizi(g: THREE.Group, w: number, d: number, y0: number, hb: number, hs: number, t: number, color: string, frame: string) {
  g.add(holePanel(w, hb, t, color, lattice(w, hb, Math.round(w / 22), 2, 2.6, 4), { y: y0, z: -d / 2 + t / 2 }))
  g.add(rbox(w + 1, 2.4, t + 1.2, frame, { y: y0 + hb, z: -d / 2 + t / 2 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(holePanel(d - t, hs, t, color, lattice(d - t, hs, Math.round(d / 22), 2, 2.6, 4), { x: s * (w / 2 - t / 2), y: y0, z: t / 2, ry: Math.PI / 2 }))
    g.add(rbox(t + 1.2, 2.4, d - t + 0.6, frame, { x: s * (w / 2 - t / 2), y: y0 + hs, z: t / 2 }, 0.8))
  }
}

/** 束腰床身 / 台座：腿 + 牙板 + 束腰 + 面板，返回面板顶高 */
export function waistBase(g: THREE.Group, w: number, d: number, legH: number, wood: string, dark: string, leg = 6) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(leg, legH, leg, wood, { x: sx * (w / 2 - leg / 2 - 1), y: 2.4, z: sz * (d / 2 - leg / 2 - 1) }, 1))
      // 内翻马蹄
      g.add(rbox(leg + 1.4, 3, leg + 1.4, dark, { x: sx * (w / 2 - leg / 2 - 1.4), y: 0, z: sz * (d / 2 - leg / 2 - 1.4) }, 1))
    }
  const y1 = legH + 2.4
  // 牙板：前后两侧，带壸门曲线
  const a = (len: number): P2[] => [[-len / 2, y1], [len / 2, y1], [len / 2, y1 - 7], [len / 2 - 8, y1 - 8.5], [len / 2 - 14, y1 - 6], [-(len / 2 - 14), y1 - 6], [-(len / 2 - 8), y1 - 8.5], [-len / 2, y1 - 7]]
  for (const s of [-1, 1]) {
    g.add(prism(a(w - leg * 2 - 2), 1.6, wood, s * (d / 2 - 1.8)))
    const side = sidePrism(a(d - leg * 2 - 2), 1.6, wood, s * (w / 2 - 1.8))
    g.add(side)
  }
  g.add(rbox(w - 3, 3, d - 3, dark, { y: y1 }, 0.8))
  g.add(rbox(w, 5, d, wood, { y: y1 + 3 }, 1.2))
  return y1 + 8
}

/** 卷叶雕花：两个相对的涡卷 + 中心贝壳（贴在 +z 面） */
export function carving(x: number, y: number, z: number, s: number, color: string) {
  const g = new THREE.Group()
  for (const k of [-1, 1]) g.add(torus(s * 0.45, s * 0.12, color, { x: x + k * s * 0.7, y, z }, Math.PI * 1.5))
  g.add(ball(s * 0.45, color, { x, y: y + s * 0.1, z }, [1, 0.8, 0.35]))
  return noOutlineDeep(g)
}

/** 按多边形挤出的平板（[x, z] 多边形，底面在 y，厚 t，不倒角） */
export function slabY(poly: Poly, t: number, color: string, y: number) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 })
  geo.rotateX(-Math.PI / 2)
  const m = mesh(geo, color)
  m.position.y = y
  return m
}

/** 拼布被面：方块拼色 + 缝线 */
export function paintPatchwork(a: string, b: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const cols = [a, b, '#c86a5a', '#e2c070', '#7a9ab8', '#f3ead8', shade(a, 0.15), '#9caf8f']
    const n = 6
    const m = Math.max(1, Math.round(n * (H / W)))
    const cw = W / n
    const ch = H / m
    const rnd = (i: number, j: number) => Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        g.fillStyle = cols[Math.floor(rnd(i, j) * cols.length)]
        g.fillRect(i * cw, j * ch, cw + 1, ch + 1)
        // 半数格子再分成两个三角
        if (rnd(j, i) > 0.5) {
          g.fillStyle = cols[Math.floor(rnd(i + 3, j + 7) * cols.length)]
          g.beginPath()
          g.moveTo(i * cw, j * ch)
          g.lineTo((i + 1) * cw, j * ch)
          g.lineTo(i * cw, (j + 1) * ch)
          g.closePath()
          g.fill()
        }
      }
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.setLineDash([4, 4])
    g.lineWidth = 1.5
    for (let i = 1; i < n; i++) {
      g.beginPath()
      g.moveTo(i * cw, 0)
      g.lineTo(i * cw, H)
      g.stroke()
    }
    for (let j = 1; j < m; j++) {
      g.beginPath()
      g.moveTo(0, j * ch)
      g.lineTo(W, j * ch)
      g.stroke()
    }
  }
}
