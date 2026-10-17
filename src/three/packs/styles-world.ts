// 世界风格家具：新中式 / 欧式古典 / 美式乡村三套有代表性的专属造型，外加和风、工业风的补充款。
// 目的：光靠换色区分不了风格，这里让中式、日式、欧美在外形上一眼能看出来（圈椅官帽椅、卷曲腿软包、谷仓门温莎椅…）。
// 约定见 kit.ts 开头：单位 cm、原点在占地中心地面、背面朝 -z；顶面 / 层板留空并声明 surface / surfaces；家具不加脸。
// 布艺部分（坐垫、床品、软包）直接用 palette 槽位颜色 p[0] / p[1]，不 shade，方便主程序识别布面加花纹。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, hangingPipe, holePanel, paintPanel, pipeHook, rectPoly, ellipsePoly, type AssetDef, type Hole, type Poly, type StyleTag, type SurfaceDef } from '../kit'
import { batten, cappedTube, centerGroup, cylX, cylZ, glassPane, lit, mesh, noOutlineDeep, rod3, type TubeOpts, type V3 } from '../geo'
import { I, J, M, N, R, withPals } from '../packkit'
import { drawerLv, drawerOf, hollow, slideDoor, swingDoor } from '../cabinetKit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = { seg: { per: 8, min: 12 }, radial: 10, group: true }

type P2 = [number, number]

/** 新中式：红木 / 黄花梨 / 鸡翅木、朱漆、铜饰、黛瓦、素绢 */
const CN = { rose: '#6b2f22', huali: '#b9773f', wenge: '#3f2b22', zitan: '#3a2220', lacquer: '#b8352b', jade: '#5f8f7a', ink: '#2f2b2a', gold: '#c9a45a', brass: '#c79a4a', silk: '#efe4c8', indigo: '#2f4a6b', celadon: '#9fbfa8', tile: '#4a4d52', wall: '#f1ede4', cane: '#c9a66b' }
/** 欧式古典：象牙白 + 金饰、桃花心木、酒红 / 海军蓝丝绒、大理石 */
const CL = { ivory: '#f1e8d6', gold: '#c9a54f', cream: '#efe3c4', wine: '#7d2a35', navy: '#2c3a5a', marble: '#ece8e2', vein: '#b8b2aa', mahogany: '#6e3524', sage: '#a7b59a', blush: '#e5bfb5', walnut: '#5e3a26', teal: '#2f5f5f', black: '#2a2626' }
/** 美式乡村：做旧白、谷仓红、鼠尾草绿、松木 / 深橡木、牛仔蓝、格纹、镀锌铁 */
const FH = { white: '#f2ede2', barn: '#9e3b2e', sage: '#9caf8f', pine: '#c99a63', oak: '#7a5638', denim: '#5b7391', black: '#2f2d2b', cream: '#efe4cc', plaid: '#b5443a', galv: '#a9adb0', mustard: '#d4a23f', cognac: '#9a5a32', brick: '#a85a44', stone: '#a6a198' }

type Tag = StyleTag
const ZH: Tag = 'chinese'
const EU: Tag = 'classic'
const FA: Tag = 'farmhouse'

const BRASS = '#d4b25a'
const IRON = '#2f2f31'

// =====================================================================
// 小工具
// =====================================================================

/** 旋转体：轮廓 [半径, 高度]，at 为底面中心 */
function lathe(profile: P2[], color: string, at: { x?: number; y?: number; z?: number } = {}, seg = 24) {
  const m = mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg), color)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return m
}

function extrude(s: THREE.Shape, depth: number) {
  const bevel = Math.min(0.5, depth * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 20 })
  geo.translate(0, 0, -depth / 2 + bevel)
  return geo
}

/** xy 平面轮廓沿 z 挤出（厚 depth，中心在 z） */
function prism(pts: P2[], depth: number, color: string, z = 0, x = 0) {
  const m = mesh(extrude(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), depth), color)
  m.position.set(x, 0, z)
  return m
}

/** 侧板：轮廓在 zy 平面（[z, y]），沿 x 挤出厚 t，中心在 x */
function sidePrism(pts: P2[], t: number, color: string, x: number) {
  const m = prism(pts, t, color)
  m.rotation.y = -Math.PI / 2
  m.position.set(x, 0, 0)
  return m
}

/** 中心线两侧各偏 t/2 得到的闭合带状轮廓 */
function strip(pts: P2[], t: number): P2[] {
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
function lattice(w: number, h: number, cols: number, rows: number, bar = 2.4, margin = 3): Hole[] {
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
function lowerSeat(g: THREE.Group, y0: number, dy: number) {
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
function cabriole(x: number, z: number, top: number, r: number, color: string, ox: number, oz: number, foot: 'scroll' | 'hoof' | 'pad' = 'pad', footColor = color) {
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
function turnedLeg(h: number, r: number, color: string, at: { x?: number; y?: number; z?: number }, style: 'farm' | 'baluster' = 'farm') {
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
  return lathe(prof, color, at, 16)
}

/** 圆形铜饰（中式面叶）：贴在 +z 面上 */
function brassPlate(x: number, y: number, z: number, r: number, color = BRASS) {
  const g = new THREE.Group()
  g.add(cylZ(r, 0.5, color, x, y, z + 0.25, 20))
  g.add(torus(r * 0.45, 0.35, color, { x, y: y - r * 0.55, z: z + 0.9 }))
  g.add(ball(0.6, color, { x, y: y + r * 0.1, z: z + 0.6 }))
  return g
}

type Pal = [Tag, string, string, string]

const r = rectPoly

// =====================================================================
// 画面
// =====================================================================

/** 用正弦叠加出一条起伏的山脊线 */
function ridge(t: number, f: number[], ph: number) {
  let v = 0
  for (let i = 0; i < f.length; i++) v += Math.sin(t * f[i] + ph * (i + 1)) / (i + 1)
  return v
}

/**
 * 水墨山水长卷：parts 幅拼成一整幅，part 是第几幅（屏风每扇画一段，合起来是连续的画面）。
 */
function paintShanshui(ground: string, ink: string, accent: string, part = 0, parts = 1) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const VW = W * parts
    const X = (t: number) => t * VW - part * W
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    // 红日
    g.fillStyle = accent
    g.beginPath()
    g.arc(X(0.78), H * 0.2, Math.min(W, H) * (parts > 1 ? 0.1 : 0.07), 0, Math.PI * 2)
    g.fill()
    const layer = (base: number, amp: number, f: number[], ph: number, color: string) => {
      g.fillStyle = color
      g.beginPath()
      g.moveTo(X(0), H)
      for (let i = 0; i <= 80; i++) {
        const t = i / 80
        g.lineTo(X(t), H * (base - amp * (0.55 + 0.45 * ridge(t * 6, f, ph))))
      }
      g.lineTo(X(1), H)
      g.closePath()
      g.fill()
    }
    layer(0.55, 0.28, [1.3, 3.1, 7.7], 0.4, shade(ink, 0.5))
    // 云雾带
    g.fillStyle = ground
    g.fillRect(0, H * 0.56, W, H * 0.04)
    layer(0.78, 0.3, [2.1, 4.3, 9.1], 1.7, shade(ink, 0.25))
    g.fillStyle = ground
    g.fillRect(0, H * 0.79, W, H * 0.03)
    layer(0.98, 0.16, [3.3, 5.9, 11.3], 2.9, ink)
    // 松树（只画在第二段）
    const pine = (cx: number, by: number, s: number) => {
      g.strokeStyle = ink
      g.lineWidth = Math.max(2, s * 0.06)
      g.beginPath()
      g.moveTo(cx, by)
      g.quadraticCurveTo(cx + s * 0.15, by - s * 0.5, cx - s * 0.05, by - s)
      g.stroke()
      g.fillStyle = shade(ink, 0.08)
      for (let k = 0; k < 4; k++) {
        g.beginPath()
        g.ellipse(cx + (k % 2 ? s * 0.18 : -s * 0.16), by - s * (0.45 + k * 0.17), s * 0.28, s * 0.07, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
    pine(X(0.32), H * 0.86, H * 0.22)
    pine(X(0.36), H * 0.88, H * 0.16)
    // 小舟
    g.fillStyle = ink
    g.beginPath()
    g.ellipse(X(0.6), H * 0.68, H * 0.035, H * 0.008, 0, 0, Math.PI * 2)
    g.fill()
    // 题字（几笔竖排的墨点）+ 朱印
    for (let k = 0; k < 6; k++) g.fillRect(X(0.12), H * (0.1 + k * 0.045), Math.max(2, H * 0.016), Math.max(2, H * 0.03))
    g.fillStyle = accent
    g.fillRect(X(0.12) - H * 0.005, H * 0.39, H * 0.03, H * 0.03)
  }
}

/** 黑漆描金梅花喜鹊：parts 幅连续 */
function paintPlum(ground: string, branch: string, blossom: string, part = 0, parts = 1) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const VW = W * parts
    const X = (t: number) => t * VW - part * W
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    g.strokeStyle = branch
    g.lineCap = 'round'
    const br = (pts: P2[], lw: number) => {
      g.lineWidth = Math.max(2, H * lw)
      g.beginPath()
      g.moveTo(X(pts[0][0]), H * pts[0][1])
      for (let i = 1; i < pts.length; i++) g.lineTo(X(pts[i][0]), H * pts[i][1])
      g.stroke()
    }
    br([[0.02, 0.95], [0.18, 0.7], [0.3, 0.62], [0.5, 0.42], [0.72, 0.36], [0.95, 0.2]], 0.02)
    br([[0.3, 0.62], [0.38, 0.8], [0.46, 0.84]], 0.012)
    br([[0.5, 0.42], [0.55, 0.22], [0.62, 0.15]], 0.012)
    br([[0.72, 0.36], [0.8, 0.5], [0.9, 0.55]], 0.01)
    const flower = (t: number, y: number, s: number) => {
      g.fillStyle = blossom
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        g.beginPath()
        g.arc(X(t) + Math.cos(a) * s, H * y + Math.sin(a) * s, s * 0.8, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = branch
      g.beginPath()
      g.arc(X(t), H * y, s * 0.45, 0, Math.PI * 2)
      g.fill()
    }
    const s = H * 0.018
    for (const [t, y] of [[0.16, 0.72], [0.24, 0.65], [0.36, 0.78], [0.45, 0.83], [0.52, 0.38], [0.56, 0.24], [0.61, 0.16], [0.68, 0.37], [0.79, 0.48], [0.88, 0.54], [0.84, 0.29], [0.93, 0.22]] as P2[]) flower(t, y, s)
    // 喜鹊
    const bx = X(0.42)
    const by = H * 0.5
    g.fillStyle = branch
    g.beginPath()
    g.ellipse(bx, by, H * 0.05, H * 0.025, -0.3, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.arc(bx + H * 0.045, by - H * 0.025, H * 0.017, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.moveTo(bx - H * 0.04, by + H * 0.01)
    g.lineTo(bx - H * 0.12, by + H * 0.05)
    g.lineTo(bx - H * 0.11, by + H * 0.025)
    g.closePath()
    g.fill()
    g.fillStyle = blossom
    g.beginPath()
    g.ellipse(bx + H * 0.005, by + H * 0.006, H * 0.025, H * 0.01, -0.3, 0, Math.PI * 2)
    g.fill()
  }
}

/** 竖排书法：text 每个字一格；seal 为朱印颜色 */
function paintCalligraphy(ground: string, ink: string, text: string, seal = '#c0392b', border = '') {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    if (border) {
      g.strokeStyle = border
      g.lineWidth = Math.max(2, W * 0.03)
      g.strokeRect(W * 0.06, W * 0.06, W * 0.88, H - W * 0.12)
    }
    const n = text.length
    const cell = Math.min(W * 0.72, (H * 0.86) / n)
    g.fillStyle = ink
    g.font = `bold ${Math.round(cell * 0.86)}px "KaiTi","STKaiti","Kaiti SC","SimSun","Songti SC",serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const y0 = (H - cell * n) / 2 + cell / 2
    for (let i = 0; i < n; i++) g.fillText(text[i], W / 2, y0 + i * cell)
    g.fillStyle = seal
    g.fillRect(W * 0.62, y0 + (n - 0.2) * cell, W * 0.18, W * 0.18)
  }
}

// =====================================================================
// 新中式
// =====================================================================

/** 四出头官帽椅：搭脑与扶手两端出头，S 形独板靠背，步步高赶枨 */
function guanmaoChair(p: string[]) {
  const [wood, mat, dark] = p
  const g = new THREE.Group()
  const X = 24
  const Z = 19.5
  const lr = 1.6
  // 腿：后腿直通搭脑（略向后仰），前腿上延成鹅脖
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * X, 0, -Z], [s * X, 48, -Z], [s * X, 107, -21.5]], lr, wood, { ...TUBE, caps: false }))
    g.add(cappedTube([[s * X, 0, Z], [s * X, 48, Z], [s * X, 66, Z - 1.2]], lr, wood, { ...TUBE, caps: false }))
    // 扶手：后端插入后腿，前端越过鹅脖出头上翘
    g.add(cappedTube([[s * X, 66, -20.3], [s * (X + 0.6), 65.2, 0], [s * (X + 1.4), 66.4, Z], [s * (X + 2.4), 68.4, Z + 4.5]], 1.4, wood, TUBE))
    // 联帮棍
    g.add(rod3([s * X, 49.5, 3], [s * (X + 0.6), 65.4, 3], 0.8, wood))
    // 侧面赶枨（步步高：前低后高）
    g.add(rod3([s * X, 16, -Z], [s * X, 16, Z], 1, dark))
  }
  // 搭脑：两端出头上翘
  g.add(cappedTube([[-29, 110.5, -20], [-24, 108.2, -21.3], [0, 106.6, -22.6], [24, 108.2, -21.3], [29, 110.5, -20]], 1.8, wood, TUBE))
  // S 形靠背板
  const splat: P2[] = [[-Z + 0.5, 49], [-Z + 1.6, 62], [-Z + 2.2, 74], [-Z + 0.8, 88], [-Z - 1.2, 100], [-Z - 2.6, 107]]
  g.add(sidePrism(strip(splat, 1.6), 17, wood, 0))
  g.add(noOutlineDeep(cylX(3.2, 0.5, shade(wood, -0.12), 0, 93, -Z - 0.15 + 1.2 - 0.6)))
  // 座面：大边框 + 软屉
  g.add(rbox(52, 4, 43, wood, { y: 46 }, 1))
  g.add(rbox(45, 0.8, 36, mat, { y: 49.6 }, 0.3))
  // 券口牙子（前）与踏脚枨
  g.add(prism([[-22.5, 46], [22.5, 46], [22.5, 41], [16, 40], [10, 37.5], [-10, 37.5], [-16, 40], [-22.5, 41]], 1.6, dark, Z))
  g.add(rbox(47, 2.2, 3.4, dark, { y: 8, z: Z }, 0.6))
  g.add(rod3([-X, 21, -Z], [X, 21, -Z], 1, dark))
  return lowerSeat(g, 46, 4.5)
}

/** 太师椅：三屏风式靠背带帽头、实板扶手开光、托泥底座 */
function taishiChair(p: string[]) {
  const [wood, cushion, dark] = p
  const g = new THREE.Group()
  // 托泥
  for (const s of [-1, 1]) {
    g.add(rbox(66, 3, 4, dark, { z: s * 23 }, 0.8))
    g.add(rbox(4, 3, 42, dark, { x: s * 31 }, 0.8))
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4.4, 43, 4.4, wood, { x: sx * 29.5, y: 3, z: sz * 21.5 }, 0.8))
  // 座面 + 束腰 + 牙板
  g.add(rbox(64, 4.5, 50, wood, { y: 44 }, 1))
  g.add(rbox(60, 2.4, 46, dark, { y: 41.6 }, 0.6))
  g.add(prism([[-27, 41.8], [27, 41.8], [27, 36], [20, 35], [14, 33], [-14, 33], [-20, 35], [-27, 36]], 1.6, wood, 22.6))
  // 靠背：中屏 + 帽头卷云
  g.add(holePanel(42, 50, 3, wood, [{ kind: 'circle', x: 0, y: 30, r: 7.5 }, { kind: 'rect', x: 0, y: 8, w: 22, h: 10, r: 2 }], { y: 48.5, z: -23.5 }))
  g.add(prism([[-25, 98], [25, 98], [25, 101], [22, 104.5], [14, 103], [8, 106.5], [0, 105], [-8, 106.5], [-14, 103], [-22, 104.5], [-25, 101]], 4, wood, -23.5))
  // 侧屏（靠背两翼）
  for (const s of [-1, 1]) {
    g.add(holePanel(9, 38, 3, wood, [{ kind: 'rect', x: 0, y: 8, w: 4, h: 22, r: 1.5 }], { x: s * 26.5, y: 48.5, z: -23.5 }))
    // 扶手板：实板开光
    g.add(holePanel(42, 22, 3, wood, [{ kind: 'arch', x: 2, y: 4, w: 16, h: 13 }], { x: s * 30.5, y: 48.5, z: -1, ry: Math.PI / 2 }))
    g.add(rbox(4, 2.4, 44, dark, { x: s * 30.5, y: 70.5, z: -1 }, 0.8))
    // 扶手前端卷书
    g.add(cylX(2.4, 4.4, dark, s * 30.5, 72, 21.5))
  }
  // 坐垫与靠枕
  g.add(rbox(52, 5, 40, cushion, { y: 48.5, z: 2 }, 2))
  g.add(rbox(34, 22, 6, cushion, { y: 54, z: -18.5, rx: -0.08 }, 2.5))
  return lowerSeat(g, 44, 4.5)
}

/** 玫瑰椅：低靠背与扶手等高感，背下部券口格心，圆材直腿 */
function meiguiChair(p: string[]) {
  const [wood, mat, dark] = p
  const g = new THREE.Group()
  const X = 21.5
  const Z = 19.5
  for (const s of [-1, 1]) {
    g.add(cyl(1.4, 1.4, 84, wood, { x: s * X, z: -Z }, 12))
    g.add(cyl(1.4, 1.4, 66, wood, { x: s * X, z: Z }, 12))
    g.add(rod3([s * X, 65.2, -Z], [s * X, 65.2, Z], 1.2, wood))
    g.add(ball(1.5, wood, { x: s * X, y: 66, z: Z }))
    g.add(ball(1.5, wood, { x: s * X, y: 84, z: -Z }))
    // 扶手下格心
    g.add(holePanel(37.4, 9, 1.4, dark, lattice(37.4, 9, 4, 1, 2, 1.6), { x: s * X, y: 49.4, ry: Math.PI / 2 }))
    g.add(rod3([s * X, 14, -Z], [s * X, 14, Z], 0.9, dark))
  }
  g.add(rod3([-X, 83.8, -Z], [X, 83.8, -Z], 1.3, wood))
  // 背：上部空、下部券口格心
  g.add(holePanel(41, 15, 1.4, dark, lattice(41, 15, 5, 2, 1.8, 1.6), { y: 50, z: -Z }))
  g.add(rod3([-X, 66, -Z], [X, 66, -Z], 0.9, wood))
  g.add(holePanel(41, 6, 1.2, dark, [{ kind: 'rect', x: 0, y: 1, w: 26, h: 4, r: 1.6 }], { y: 77, z: -Z }))
  // 座面
  g.add(rbox(46, 4, 42, wood, { y: 45.5 }, 1))
  g.add(rbox(39, 0.8, 35, mat, { y: 49.1 }, 0.3))
  g.add(prism([[-20, 45.5], [20, 45.5], [20, 42], [12, 40.5], [-12, 40.5], [-20, 42]], 1.4, dark, Z))
  g.add(rbox(43, 2, 3, dark, { y: 8, z: Z }, 0.6))
  g.add(rod3([-X, 18, -Z], [X, 18, -Z], 0.9, dark))
  return lowerSeat(g, 45.5, 4.5)
}

/** 三面围子：背板 + 两侧板，格心开孔 */
function weizi(g: THREE.Group, w: number, d: number, y0: number, hb: number, hs: number, t: number, color: string, frame: string) {
  g.add(holePanel(w, hb, t, color, lattice(w, hb, Math.round(w / 22), 2, 2.6, 4), { y: y0, z: -d / 2 + t / 2 }))
  g.add(rbox(w + 1, 2.4, t + 1.2, frame, { y: y0 + hb, z: -d / 2 + t / 2 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(holePanel(d - t, hs, t, color, lattice(d - t, hs, Math.round(d / 22), 2, 2.6, 4), { x: s * (w / 2 - t / 2), y: y0, z: t / 2, ry: Math.PI / 2 }))
    g.add(rbox(t + 1.2, 2.4, d - t + 0.6, frame, { x: s * (w / 2 - t / 2), y: y0 + hs, z: t / 2 }, 0.8))
  }
}

/** 束腰床身 / 台座：腿 + 牙板 + 束腰 + 面板，返回面板顶高 */
function waistBase(g: THREE.Group, w: number, d: number, legH: number, wood: string, dark: string, leg = 6) {
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

/** 罗汉床：三面格心围子、束腰马蹄腿，厚坐褥 + 两只圆枕 */
function luohanBed(p: string[]) {
  const [wood, cushion, dark] = p
  const g = new THREE.Group()
  const top = waistBase(g, 200, 95, 30, wood, dark, 7)
  weizi(g, 200, 95, top, 32, 24, 4, wood, dark)
  g.add(rbox(186, 9, 82, cushion, { y: top, z: 4.5 }, 3))
  for (const s of [-1, 1]) g.add(cylX(9, 26, cushion, s * 79, top + 17.5, 0))
  g.add(rbox(36, 14, 10, cushion, { x: -40, y: top + 9, z: -36, rx: -0.12 }, 4))
  return g
}

/** 炕桌：矮束腰小桌，三弯短腿内翻马蹄 */
function kangTable(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 30.5, sz * 16.5, 20, 1.6, wood, -sx * 0.6, -sz * 0.6, 'hoof', dark))
  for (const s of [-1, 1]) {
    g.add(prism([[-28, 21], [28, 21], [28, 17], [20, 16], [-20, 16], [-28, 17]], 1.4, wood, s * 17.6))
    g.add(sidePrism([[-14.5, 21], [14.5, 21], [14.5, 17], [-14.5, 17]], 1.4, wood, s * 31.6))
  }
  g.add(rbox(66, 2, 38, dark, { y: 20.5 }, 0.6))
  g.add(rbox(70, 3, 42, wood, { y: 22.5 }, 1))
  return g
}

/** 翘头案：两端翘头，夹头榫插肩腿 + 挡板开光 + 托子 */
function qiaotouTable(p: string[]) {
  const [wood, dark, panel] = p
  const g = new THREE.Group()
  g.add(rbox(170, 4, 42, wood, { y: 80 }, 1))
  for (const s of [-1, 1]) g.add(prism([[s * 79, 84], [s * 85, 84], [s * 85.6, 88.5], [s * 83.2, 87.6], [s * 80.5, 85.6], [s * 79, 85]], 40, wood))
  // 牙条与牙头
  for (const z of [-17, 17]) {
    g.add(rbox(150, 3.6, 1.6, dark, { y: 76.4, z }, 0.5))
    for (const s of [-1, 1]) g.add(prism([[s * 62, 76.4], [s * 72, 76.4], [s * 72, 71], [s * 68, 72.5], [s * 64.5, 75.5]], 1.6, dark, z))
  }
  for (const s of [-1, 1]) {
    // 腿：侧脚（下端外撇）
    for (const z of [-16, 16]) g.add(batten([s * 69, 80, z], [s * 71, 4, z * 1.05], 4.4, 3.6, wood))
    // 挡板：如意云头开光
    g.add(holePanel(30, 52, 1.6, panel, [{ kind: 'circle', x: 0, y: 34, r: 8 }, { kind: 'arch', x: 0, y: 8, w: 12, h: 14 }], { x: s * 70, y: 16, ry: Math.PI / 2 }))
    g.add(rod3([s * 70, 14, -16], [s * 70, 14, 16], 1.1, wood))
    // 托子
    g.add(rbox(6, 4, 42, dark, { x: s * 71 }, 1))
  }
  return g
}

/** 八仙桌：束腰、罗锅枨加矮老 */
function baxianTable(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  const L = 41.5
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 77, 5, wood, { x: sx * L, z: sz * L }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(78, 7, 1.6, wood, { y: 69, z: s * (L + 1.2) }, 0.5))
    g.add(rbox(1.6, 7, 78, wood, { x: s * (L + 1.2), y: 69 }, 0.5))
    // 罗锅枨
    g.add(cappedTube([[-L, 56, s * L], [-L + 12, 63, s * L], [L - 12, 63, s * L], [L, 56, s * L]], 1.3, dark, { ...TUBE, caps: false }))
    g.add(cappedTube([[s * L, 56, -L], [s * L, 63, -L + 12], [s * L, 63, L - 12], [s * L, 56, L]], 1.3, dark, { ...TUBE, caps: false }))
    for (const k of [-14, 14]) {
      g.add(rod3([k, 63, s * L], [k, 69.2, s * L], 1, dark))
      g.add(rod3([s * L, 63, k], [s * L, 69.2, k], 1, dark))
    }
  }
  g.add(rbox(86, 3, 86, dark, { y: 76 }, 0.8))
  g.add(rbox(90, 4, 90, wood, { y: 79 }, 1.2))
  return g
}

/** 条凳：窄面、四腿外撇 */
function tiaoBench(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  g.add(rbox(110, 5, 24, wood, { y: 43 }, 1))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(batten([sx * 44, 43.5, sz * 7], [sx * 49, 0.2, sz * 10.5], 3.4, 2.6, wood))
    g.add(rod3([sx * 46.8, 16, -9], [sx * 46.8, 16, 9], 1, dark))
  }
  for (const s of [-1, 1]) g.add(prism([[-38, 43], [38, 43], [38, 40], [30, 38.6], [-30, 38.6], [-38, 40]], 1.4, dark, s * 8.2))
  return g
}

/** 方几：高茶几，牙板 + 底层板 */
function fangji(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3.4, 68, 3.4, wood, { x: sx * 20, z: sz * 17.5 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(prism([[-18.3, 68], [18.3, 68], [18.3, 63], [12, 61.5], [6, 63.5], [-6, 63.5], [-12, 61.5], [-18.3, 63]], 1.4, dark, s * 17.5))
    g.add(sidePrism([[-15.8, 68], [15.8, 68], [15.8, 63], [8, 62], [-8, 62], [-15.8, 63]], 1.4, dark, s * 20))
  }
  g.add(rbox(45, 3, 40, wood, { y: 68 }, 1))
  g.add(rbox(38.6, 2, 33.6, dark, { y: 12 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(38.6, 3, 1.4, wood, { y: 4, z: s * 17.5 }, 0.4))
  return g
}

/** 一套茶具：茶盘 + 紫砂壶 + 公道杯 + 四只品茗杯，at 为茶盘底面中心 */
function teaSet(g: THREE.Group, x: number, y: number, z: number, trayC: string, pot: string) {
  g.add(tray(54, 3.4, 32, 1.4, trayC, { x, y, z }, 0.6))
  for (let k = -3; k <= 3; k++) g.add(noOutlineDeep(rbox(1, 0.4, 28, shade(trayC, -0.12), { x: x + k * 6.6, y: y + 1.4, z }, 0.15)))
  // 紫砂壶
  const px = x - 14
  g.add(ball(5.4, pot, { x: px, y: y + 5.5, z: z - 2 }, [1, 0.78, 1]))
  g.add(cyl(2.8, 3.4, 1.2, pot, { x: px, y: y + 9.2, z: z - 2 }, 16))
  g.add(ball(1.1, pot, { x: px, y: y + 11, z: z - 2 }))
  g.add(rod3([px + 4.6, y + 5.5, z - 2], [px + 8.6, y + 8.5, z - 2], 0.9, pot))
  g.add(torus(2.6, 0.7, pot, { x: px - 5.8, y: y + 6, z: z - 2 }, Math.PI * 1.4))
  // 公道杯与品茗杯
  g.add(cup(2.6, 2.4, 6.4, 0.4, C.glass, { x: x + 2, y: y + 1.4, z: z - 6 }))
  for (const [cx, cz] of [[10, -6], [17, -6], [10, 4], [17, 4]] as P2[]) g.add(cup(2, 1.5, 3, 0.35, C.white, { x: x + cx, y: y + 1.4, z: z + cz }))
  g.add(cup(2.4, 1.8, 3.6, 0.4, C.white, { x: x - 12, y: y + 1.4, z: z + 8 }))
}

/** 茶台：厚板台面左侧嵌茶盘带茶具，右侧留空可摆；下有搁板 */
function teaTable(p: string[]) {
  const [wood, dark, trayC] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(7, 59, 7, wood, { x: sx * 62, z: sz * 26 }, 1.2))
  for (const s of [-1, 1]) {
    g.add(prism([[-58.5, 59], [58.5, 59], [58.5, 53], [50, 51], [-50, 51], [-58.5, 53]], 1.8, dark, s * 27.5))
    g.add(sidePrism([[-22.5, 59], [22.5, 59], [22.5, 53], [-22.5, 53]], 1.8, dark, s * 63))
  }
  g.add(rbox(117, 2, 45, dark, { y: 10 }, 0.6))
  g.add(rbox(140, 6, 70, wood, { y: 59 }, 1.6))
  teaSet(g, -32, 65, 4, trayC, CN.zitan)
  return g
}

/** 多宝格：错落格子 + 圆洞 / 拱洞隔板，下部带铜饰对开门 */
const DB = { w: 80, d: 32, h: 180, t: 2.5, cab: 50, split: -8, left: [86, 124, 148], right: [100, 140], subX: 16, subY: 140 }
function duobaoSurfaces() {
  const { w, d, t, cab, split, left, right, subX, h } = DB
  const x0 = -w / 2 + t
  const x1 = w / 2 - t
  const z0 = -d / 2 + 1.6
  const z1 = d / 2
  const ceil = h - t
  const out: { y: number; shape: Poly[]; h: number }[] = []
  const col = (xa: number, xb: number, levels: number[]) => {
    const ys = [cab, ...levels]
    for (let i = 0; i < ys.length; i++) {
      const y = ys[i] + 2
      const next = i + 1 < ys.length ? ys[i + 1] : ceil
      out.push({ y, shape: [r(xa, z0, xb, z1)], h: next - y })
    }
  }
  col(x0, split - 1.1, left)
  // 右列最上一格被竖隔板分成两格
  const ysR = [cab, ...right]
  for (let i = 0; i < ysR.length; i++) {
    const y = ysR[i] + 2
    const next = i + 1 < ysR.length ? ysR[i + 1] : ceil
    if (i === ysR.length - 1) {
      out.push({ y, shape: [r(split + 1.1, z0, subX - 1.1, z1)], h: next - y })
      out.push({ y, shape: [r(subX + 1.1, z0, x1, z1)], h: next - y })
    } else out.push({ y, shape: [r(split + 1.1, z0, x1, z1)], h: next - y })
  }
  return out
}
/** 多宝格下柜（对开门里）的一层 */
const DUOBAO_LOWER: SurfaceDef = { y: 8, h: 41.5, inside: true, shape: [r(-37, -14.4, 37, 15.2)] }
function duobao(p: string[]) {
  const [wood, dark, brass] = p
  const { w, d, h, t, cab, split, left, right, subX, subY } = DB
  const g = new THREE.Group()
  // 侧板、顶板、背板、底座
  for (const s of [-1, 1]) g.add(rbox(t, h - 6, d, wood, { x: s * (w / 2 - t / 2), y: 6 }, 0.8))
  g.add(rbox(w + 1.2, t, d + 1.2, wood, { y: h - t }, 1))
  g.add(rbox(w - 2 * t + 0.4, h - 6 - t, 1.2, shade(wood, -0.08), { y: 6, z: -d / 2 + 0.8 }, 0.4))
  g.add(prism([[-w / 2, 6], [w / 2, 6], [w / 2, 0], [w / 2 - 5, 0], [w / 2 - 9, 3], [-(w / 2 - 9), 3], [-(w / 2 - 5), 0], [-w / 2, 0]], d - 1, dark))
  g.add(rbox(w - 2 * t + 0.4, 2, d - 1.6, wood, { y: 6, z: 0.8 }, 0.5))
  // 下柜：对开门 + 铜面叶
  g.add(rbox(w - 2 * t + 0.4, 2, d - 1.6, wood, { y: cab, z: 0.8 }, 0.5))
  for (const s of [-1, 1]) {
    const parts: THREE.Object3D[] = [
      rbox(w / 2 - t - 0.6, cab - 8.6, 1.6, dark, { x: s * (w / 4 - t / 2 + 0.1), y: 8.3, z: d / 2 - 0.4 }, 0.6),
      rbox(w / 2 - t - 6, cab - 15, 0.6, wood, { x: s * (w / 4 - t / 2 + 0.1), y: 11.5, z: d / 2 + 0.6 }, 0.3),
    ]
    // 铜面叶压在右门的边上
    if (s > 0) parts.push(brassPlate(0, 30, d / 2 + 0.4, 4.2, brass))
    g.add(swingDoor(parts, s * (w / 2 - t - 0.2), d / 2 - 1.2, s < 0 ? 'left' : 'right'))
  }
  // 竖隔板：主隔板开拱洞，副隔板开圆洞
  g.add(holePanel(d - 2.8, h - t - cab - 2, 2.2, wood, [{ kind: 'arch', x: 2, y: 45, w: 14, h: 22 }], { x: split, y: cab + 2, z: 0.8, ry: Math.PI / 2 }))
  g.add(holePanel(d - 2.8, h - t - subY - 2, 2.2, wood, [{ kind: 'circle', x: 1, y: 18, r: 7 }], { x: subX, y: subY + 2, z: 0.8, ry: Math.PI / 2 }))
  // 层板
  const lx0 = -w / 2 + t
  for (const y of left) g.add(rbox(split - lx0 - 0.6, 2, d - 1.6, wood, { x: (lx0 + split) / 2, y, z: 0.8 }, 0.5))
  for (const y of right) g.add(rbox(w / 2 - t - split - 0.6, 2, d - 1.6, wood, { x: (w / 2 - t + split) / 2, y, z: 0.8 }, 0.5))
  // 顶部挂檐牙子
  g.add(holePanel(w - 2 * t, 6, 1.2, dark, lattice(w - 2 * t, 6, 8, 1, 1.6, 1.2), { y: h - t - 6, z: d / 2 - 0.8 }))
  return g
}

/** 四扇折屏：之字形展开，每扇上部画心（四扇连成一幅）、下部格心裙板 */
function screen4(p: string[]) {
  const [frame, ground, accent] = p
  const g = new THREE.Group()
  const PW = 46
  const PH = 172
  const a = 0.38
  const darkGround = new THREE.Color(ground).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35
  // 铰链链：第 i 扇从 P 点出发，沿自身局部 +x（世界方向 cos, -sin）展开 PW
  let px = 0
  let pz = 0
  for (let i = 0; i < 4; i++) {
    const ang = i % 2 ? -a : a
    const panel = new THREE.Group()
    for (const s of [-1, 1]) panel.add(rbox(3, PH, 2.6, frame, { x: s * (PW / 2 - 1.5), y: 4 }, 0.6))
    for (const y of [4, 40, 150, PH + 1]) panel.add(rbox(PW - 6 + 0.4, 3, 2.4, frame, { y }, 0.6))
    panel.add(holePanel(PW - 5.8, 34, 1.2, frame, lattice(PW - 5.8, 34, 3, 3, 1.8, 1.8), { y: 6.6 }))
    panel.add(rbox(PW - 5.8, 107, 0.8, shade(ground, -0.05), { y: 43 }, 0.2))
    const key = `sw-screen-${darkGround ? 'plum' : 'ink'}-${ground}-${accent}-${i}`
    panel.add(paintPanel(PW - 6, 106.6, key, darkGround ? paintPlum(ground, accent, '#f3e2c8', i, 4) : paintShanshui(ground, frame, accent, i, 4), { y: 43.2, z: 0.45 }))
    panel.add(holePanel(PW - 5.8, 20, 1.2, frame, lattice(PW - 5.8, 20, 4, 2, 1.6, 1.6), { y: 153 }))
    // 站牙小脚
    for (const s of [-1, 1]) panel.add(rbox(5, 4, 9, frame, { x: s * (PW / 2 - 2.5) }, 0.8))
    const dx = Math.cos(ang)
    const dz = -Math.sin(ang)
    panel.rotation.y = ang
    panel.position.set(px + (dx * PW) / 2, 0, pz + (dz * PW) / 2)
    g.add(panel)
    px += dx * (PW + 0.4)
    pz += dz * (PW + 0.4)
  }
  return centerGroup(g)
}

/** 宫灯落地灯：车旋立柱托六角宫灯，龙头挂钩垂流苏 */
function gongLamp(p: string[]) {
  const [wood, silk, tassel] = p
  const g = new THREE.Group()
  // 十字底座
  for (const ry of [0, Math.PI / 2]) {
    g.add(rbox(36, 4, 5, wood, { ry }, 1))
  }
  g.add(lathe([[0, 4], [5, 4], [3.2, 8], [2.2, 12], [2.2, 104], [3.2, 106], [3.2, 108], [0, 108]], wood, {}, 16))
  // 灯体
  const y0 = 110
  g.add(cyl(12, 12, 2.4, wood, { y: y0 - 2.4 }, 6))
  g.add(cyl(5, 9, 3, wood, { y: y0 - 5 }, 6))
  g.add(lit(cyl(10.4, 10.4, 30, silk, { y: y0 }, 6), silk, 0.55))
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2
    g.add(cyl(0.9, 0.9, 30, wood, { x: Math.sin(ang) * 11, y: y0, z: Math.cos(ang) * 11 }, 8))
  }
  g.add(cyl(12, 12, 2.4, wood, { y: y0 + 30 }, 6))
  g.add(cyl(6, 11, 5, wood, { y: y0 + 32.4 }, 6))
  g.add(ball(2.6, BRASS, { y: y0 + 39 }))
  // 龙头挂钩 + 流苏
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2
    const ex = Math.sin(ang) * 18
    const ez = Math.cos(ang) * 18
    g.add(rod3([Math.sin(ang) * 10.5, y0 + 33, Math.cos(ang) * 10.5], [ex, y0 + 36, ez], 0.8, wood))
    g.add(ball(1.2, BRASS, { x: ex, y: y0 + 36, z: ez }))
    g.add(cyl(0.3, 0.3, 6, tassel, { x: ex, y: y0 + 30, z: ez }, 6))
    g.add(cyl(0.9, 1.6, 9, tassel, { x: ex, y: y0 + 21, z: ez }, 8))
  }
  return g
}

/** 灯笼落地灯：曲柄木架挑出一盏圆灯笼 */
function lanternStand(p: string[]) {
  const [wood, silk, cap] = p
  const g = new THREE.Group()
  for (const ry of [0, Math.PI / 2]) g.add(rbox(36, 4, 5, wood, { ry }, 1))
  g.add(cyl(2.4, 2.8, 168, wood, { y: 4 }, 12))
  for (const s of [-1, 1]) {
    for (const ry of [0, Math.PI / 2]) {
      const v: V3 = ry ? [0, 4, s * 12] : [s * 12, 4, 0]
      g.add(rod3(v, [0, 24, 0], 0.9, wood))
    }
  }
  g.add(rbox(36, 3.4, 3.4, wood, { x: 16, y: 166 }, 0.8))
  g.add(rod3([0, 150, 0], [12, 166, 0], 1.1, wood))
  // 云头
  g.add(prism([[33, 166], [36, 166], [37.5, 168.5], [36, 171], [33, 170]], 3.6, wood))
  g.add(ball(2.2, wood, { y: 173.4 }))
  // 灯笼
  const lx = 28
  g.add(cyl(0.3, 0.3, 10, IRON, { x: lx, y: 156 }, 6))
  g.add(cyl(5, 5, 2.4, cap, { x: lx, y: 153.6 }, 16))
  g.add(lit(ball(13, silk, { x: lx, y: 140 }, [1, 0.88, 1]), silk, 0.5))
  for (let k = 0; k < 6; k++) g.add(noOutlineDeep(torus(13.05, 0.3, shade(silk, -0.25), { x: lx, y: 140, ry: (k / 6) * Math.PI }, Math.PI * 2)))
  g.add(cyl(5, 5, 2.4, cap, { x: lx, y: 125 }, 16))
  g.add(cyl(0.6, 1.8, 12, cap, { x: lx, y: 113 }, 8))
  return centerGroup(g)
}

/** 月洞门装饰框：粉墙圆洞 + 黛瓦檐 */
function moonGate(p: string[]) {
  const [wall, tile, trim] = p
  const g = new THREE.Group()
  g.add(rbox(134, 6, 30, shade(tile, 0.2), {}, 1))
  g.add(holePanel(128, 190, 10, wall, [{ kind: 'circle', x: 0, y: 95, r: 52 }], { y: 6 }))
  for (const z of [-5.4, 5.4]) g.add(torus(53.4, 1.6, trim, { y: 101, z }))
  // 四角回纹贴花
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const cx = sx * 53
      const cy = 101 + sy * 82
      g.add(noOutlineDeep(rbox(10, 1.6, 0.6, trim, { x: cx, y: cy - 0.8, z: 5.2 }, 0.2)))
      g.add(noOutlineDeep(rbox(1.6, 10, 0.6, trim, { x: cx - sx * 4.2, y: cy - (sy > 0 ? 9.2 : 0.8), z: 5.2 }, 0.2)))
    }
  // 檐口与瓦
  g.add(rbox(136, 6, 16, tile, { y: 196 }, 1))
  g.add(rbox(144, 3, 22, shade(tile, -0.08), { y: 202 }, 1))
  for (let k = -6; k <= 6; k++) g.add(cylZ(1.6, 22.4, shade(tile, 0.08), k * 11, 205.4, 0, 10))
  g.add(cylX(2.6, 146, tile, 0, 207.4, 0, 12))
  return g
}

/** 顶箱柜：下柜 + 顶箱，对开门、闩杆、铜面叶与合页；门可以打开，里面是层板 */
function dingxiang(p: string[]) {
  const [wood, brass, dark] = p
  const g = new THREE.Group()
  const W = 100
  const D = 55
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 6, 5, wood, { x: sx * 47.5, z: sz * 25 }, 1))
  g.add(prism([[-45, 6], [45, 6], [45, 3], [36, 2.2], [-36, 2.2], [-45, 3]], 1.4, dark, 25.8))
  const sec = (y: number, h: number, n: number, shelves: number[]) => {
    g.add(hollow(W, h, D, wood, { y }, 2, inner))
    for (const sy of shelves) g.add(rbox(W - 4, 1.6, D - 3, inner, { y: sy - 1.6, z: 0.5 }, 0.3))
    // 闩杆（固定在柜体上）+ 两扇门
    g.add(rbox(3.2, h - 4, 1.4, dark, { y: y + 2, z: D / 2 + 0.3 }, 0.5))
    for (const s of [-1, 1]) {
      const dx = s * (W / 4 + 0.5)
      const parts: THREE.Object3D[] = [rbox(W / 2 - 5.6, h - 4, 1.2, wood, { x: dx, y: y + 2, z: D / 2 + 0.2 }, 0.5), rbox(W / 2 - 12, h - 12, 0.6, shade(wood, -0.06), { x: dx, y: y + 6, z: D / 2 + 0.95 }, 0.3)]
      // 合页
      for (const hy of n > 1 ? [y + 18, y + h - 22] : [y + 10, y + h - 14]) parts.push(rbox(4, 4, 0.5, brass, { x: s * (W / 2 - 4), y: hy, z: D / 2 + 1 }, 0.2))
      g.add(swingDoor(parts, s * (W / 2 - 2.3), D / 2 - 0.4, s < 0 ? 'left' : 'right'))
    }
    // 面叶：闩杆上一块长方铜片 + 两侧吊牌
    const my = y + h / 2
    g.add(rbox(12, n > 1 ? 18 : 12, 0.5, brass, { y: my - (n > 1 ? 9 : 6), z: D / 2 + 1.1 }, 0.3))
    for (const s of [-1, 1]) {
      g.add(rod3([s * 3, my + 1, D / 2 + 1.6], [s * 3, my - 5, D / 2 + 1.8], 0.45, brass))
      g.add(ball(0.9, brass, { x: s * 3, y: my - 5.6, z: D / 2 + 1.8 }))
    }
  }
  sec(6, 164, 2, [60, 115])
  g.add(rbox(W + 1.2, 2.4, D + 1.2, dark, { y: 170 }, 0.8))
  sec(172.4, 52, 1, [])
  g.add(rbox(W + 1.6, 2.6, D + 1.6, dark, { y: 224.4 }, 0.8))
  return g
}
const DX_IN = r(-47.4, -25, 47.4, 26)
const DINGXIANG_SURFACES: SurfaceDef[] = [
  { y: 8, h: 50.4, inside: true, shape: [DX_IN] },
  { y: 60, h: 53.4, inside: true, shape: [DX_IN] },
  { y: 115, h: 53, inside: true, shape: [DX_IN] },
  { y: 174.4, h: 48, inside: true, shape: [DX_IN] },
]

/** 鼓凳：四根外鼓的弧腿连接上下圈，鼓钉一圈 + 绣墩坐垫 */
function drumStool(p: string[]) {
  const [wood, cushion, nail] = p
  const g = new THREE.Group()
  g.add(cyl(15, 15, 3, wood, {}, 32))
  g.add(torus(15, 1.6, wood, { y: 3.2, rx: Math.PI / 2 }))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const pt = (rr: number, y: number): V3 => [Math.sin(a) * rr, y, Math.cos(a) * rr]
    g.add(cappedTube([pt(15, 3.2), pt(18.2, 14), pt(18.8, 23), pt(18.2, 32), pt(15.4, 41.4)], 2.4, wood, { ...TUBE, caps: false }))
  }
  // 腰部一圈
  g.add(torus(18.6, 1, wood, { y: 23, rx: Math.PI / 2 }))
  g.add(cyl(16.4, 15.4, 4, wood, { y: 40.4 }, 32))
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    g.add(ball(0.75, nail, { x: Math.sin(a) * 16.2, y: 42.4, z: Math.cos(a) * 16.2 }))
    g.add(ball(0.7, nail, { x: Math.sin(a) * 15.2, y: 1.5, z: Math.cos(a) * 15.2 }))
  }
  g.add(puck(15.6, 3.6, cushion, { y: 44 }))
  g.add(ball(1.2, nail, { y: 47.8 }))
  return g
}

/** 高花几：方面束腰、长腿、底层板 */
function tallStand(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, 98, 3, wood, { x: sx * 15, z: sz * 15 }, 0.6))
  for (const s of [-1, 1]) {
    g.add(prism([[-13.5, 98], [13.5, 98], [13.5, 93], [8, 92], [4, 94], [-4, 94], [-8, 92], [-13.5, 93]], 1.2, dark, s * 15))
    g.add(sidePrism([[-13.5, 98], [13.5, 98], [13.5, 93], [8, 92], [4, 94], [-4, 94], [-8, 92], [-13.5, 93]], 1.2, dark, s * 15))
    // 中部横枨 + 冰裂纹意象（交叉短枨）
    g.add(rbox(27.4, 1.8, 1.8, dark, { y: 58, z: s * 15 }, 0.4))
    g.add(rbox(1.8, 1.8, 27.4, dark, { x: s * 15, y: 58 }, 0.4))
  }
  g.add(rbox(30, 1.6, 30, dark, { y: 97.4 }, 0.4))
  g.add(rbox(36, 3, 36, wood, { y: 99 }, 0.8))
  g.add(rbox(27.6, 2, 27.6, wood, { y: 20 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(27.4, 3, 1.4, dark, { y: 4, z: s * 15 }, 0.4))
  return g
}

/** 架子床：六柱、挂檐格心、三面加门围子，内铺锦被 */
function jiaziBed(p: string[]) {
  const [duvet, sheet, wood] = p
  const dark = shade(wood, -0.08)
  const g = new THREE.Group()
  const W = 170
  const D = 220
  const top = waistBase(g, W, D, 28, wood, dark, 7)
  // 柱子
  const PX = W / 2 - 2.5
  const PZ = D / 2 - 2.5
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(5, 222 - top, 5, wood, { x: sx * PX, y: top, z: sz * PZ }, 1))
    g.add(rbox(5, 222 - top, 5, wood, { x: sx * 45, y: top, z: PZ }, 1))
  }
  // 顶框
  for (const s of [-1, 1]) {
    g.add(rbox(W, 4, 5, wood, { y: 222, z: s * PZ }, 1))
    g.add(rbox(5, 4, D - 10 + 0.4, wood, { x: s * PX, y: 222 }, 1))
  }
  // 挂檐
  g.add(holePanel(W - 10, 14, 1.6, dark, lattice(W - 10, 14, 12, 1, 2, 2.4), { y: 207.6, z: PZ }))
  g.add(holePanel(W - 10, 14, 1.6, dark, lattice(W - 10, 14, 12, 1, 2, 2.4), { y: 207.6, z: -PZ }))
  for (const s of [-1, 1]) g.add(holePanel(D - 10, 14, 1.6, dark, lattice(D - 10, 14, 16, 1, 2, 2.4), { x: s * PX, y: 207.6, ry: Math.PI / 2 }))
  // 围子
  g.add(holePanel(W - 10, 34, 1.8, wood, lattice(W - 10, 34, 8, 2, 2.4, 3), { y: top, z: -PZ }))
  for (const s of [-1, 1]) {
    g.add(holePanel(D - 10, 34, 1.8, wood, lattice(D - 10, 34, 10, 2, 2.4, 3), { x: s * PX, y: top, ry: Math.PI / 2 }))
    g.add(holePanel(PX - 45 - 5, 34, 1.8, wood, lattice(PX - 50, 34, 2, 2, 2.4, 3), { x: s * (PX + 45) / 2, y: top, z: PZ }))
  }
  // 床品
  const mh = 16
  g.add(rbox(W - 14, mh, D - 14, sheet, { y: top }, 4))
  for (const s of [-1, 1]) g.add(rbox(56, 11, 32, C.white, { x: s * 33, y: top + mh - 1, z: -D / 2 + 30, rx: -0.12 }, 5))
  g.add(rbox(W - 12, 8, D - 70, duvet, { y: top + mh - 1, z: 26 }, 4))
  g.add(rbox(W - 11.6, 3, 15, duvet, { y: top + mh + 5.5, z: 26 - (D - 70) / 2 + 7.5 }, 1.5))
  return g
}

/** 中堂挂轴 + 一副对联（壁挂） */
const ZT_MOUNT = 72
function zhongtang(p: string[]) {
  const [brocade, paper, rodC] = p
  const g = new THREE.Group()
  const y0 = ZT_MOUNT
  const scroll = (x: number, w: number, h: number, key: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) => {
    g.add(rbox(w, h, 0.8, brocade, { x, y: y0 + 3, z: -0.6 }, 0.3))
    g.add(rbox(w - 6, h - 22, 0.6, paper, { x, y: y0 + 13, z: 0.1 }, 0.2))
    g.add(paintPanel(w - 7, h - 23, key, draw, { x, y: y0 + 13.5, z: 0.75 }))
    g.add(cylX(1.5, w + 2, rodC, x, y0 + 1.5, 0))
    for (const s of [-1, 1]) g.add(ball(1.5, rodC, { x: x + s * (w / 2 + 1.4), y: y0 + 1.5, z: 0 }))
    g.add(rbox(w + 1, 2, 1.6, rodC, { x, y: y0 + h + 3, z: -0.4 }, 0.5))
    for (const s of [-1, 1]) g.add(rod3([x + s * w * 0.3, y0 + h + 4.6, -0.4], [x, y0 + h + 11, -0.4], 0.25, CN.ink, 4))
  }
  scroll(0, 62, 150, `sw-zt-c-${paper}`, paintShanshui(paper, CN.ink, '#c0392b'))
  scroll(-52, 20, 142, `sw-zt-l-${paper}`, paintCalligraphy(paper, CN.ink, '松竹梅岁寒'))
  scroll(52, 20, 142, `sw-zt-r-${paper}`, paintCalligraphy(paper, CN.ink, '山水月清风'))
  return centerGroup(g)
}

/** 山水盆景台：圆面三弯腿花几 + 白石盆里假山与小松 */
function penjing(p: string[]) {
  const [wood, potC, rock] = p
  const g = new THREE.Group()
  // 托泥圆圈
  g.add(torus(17, 1.6, wood, { y: 3.2, rx: Math.PI / 2 }))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    g.add(ball(1.6, wood, { x: Math.sin(a) * 17, y: 1.6, z: Math.cos(a) * 17 }))
    const pt = (rr: number, y: number): V3 => [Math.sin(a) * rr, y, Math.cos(a) * rr]
    g.add(cappedTube([pt(17, 3.4), pt(15, 20), pt(18.4, 46), pt(16, 66)], 1.6, wood, { ...TUBE, caps: false }))
  }
  g.add(cyl(17, 16, 3, shade(wood, -0.08), { y: 64 }, 32))
  g.add(cyl(20, 20, 3, wood, { y: 67 }, 32))
  // 石盆
  g.add(tray(38, 4, 24, 1.2, potC, { y: 70 }, 0.6))
  g.add(noOutlineDeep(rbox(35, 0.4, 21, '#9fc3cf', { y: 72.3 }, 0.1)))
  // 假山：几块叠石
  const rockC = [rock, shade(rock, 0.1), shade(rock, -0.1)]
  for (const [x, y, z, rr, sy, c] of [[-8, 77, -2, 5, 2.4, 0], [-5, 85, -3, 3.4, 2.2, 1], [-9, 91, -2, 2.2, 1.8, 2], [6, 76, 2, 3.6, 1.5, 1], [9, 80, 1, 2.2, 1.6, 2]] as number[][])
    g.add(ball(rr, rockC[c], { x, y, z }, [1, sy, 0.9]))
  // 小松
  g.add(cappedTube([[4, 74, 3], [2, 82, 2], [6, 88, 0], [12, 90, -1]], 0.6, '#6b4a33', { ...TUBE, caps: false }))
  for (const [x, y, z, s] of [[2, 84, 3, 3.2], [7, 89, 0, 3.4], [12, 90.5, -1, 2.6]] as number[][]) g.add(ball(s, '#4f7d4a', { x, y, z }, [1.3, 0.45, 1]))
  return g
}

/** 闷户橱式床头柜：抽屉 + 门，铜面叶拉手 */
function cnNightstand(p: string[]) {
  const [wood, brass, dark] = p
  const g = new THREE.Group()
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3.6, 10, 3.6, wood, { x: sx * 19.2, z: sz * 14.6 }, 0.8))
  g.add(prism([[-17.4, 10], [17.4, 10], [17.4, 7], [10, 6], [-10, 6], [-17.4, 7]], 1.2, dark, 15.4))
  g.add(hollow(42, 42, 32, wood, { y: 10 }, 1.6, inner))
  g.add(rbox(38.8, 1.6, 30, inner, { y: 37.4, z: 0.4 }, 0.3))
  g.add(rbox(46, 3, 36, wood, { y: 52 }, 1))
  g.add(drawerOf([rbox(38, 10, 1.2, dark, { y: 39.5, z: 16.2 }, 0.5), brassPlate(0, 45, 16.6, 2.6, brass)], -19, 19, 39.5, 10, 15.6, 28, inner))
  g.add(swingDoor([rbox(38, 26, 1.2, dark, { y: 12, z: 16.2 }, 0.5), rbox(30, 18, 0.5, shade(dark, 0.08), { y: 16, z: 16.9 }, 0.2), brassPlate(0, 27, 17.1, 3.4, brass)], -19, 15.6, 'left'))
  return g
}
const CN_NS_SURFACES: SurfaceDef[] = [{ y: 11.6, h: 25.3, inside: true, shape: [r(-18.8, -14.4, 18.8, 14.8)] }, drawerLv(-19, 19, 39.5, 10, 15.6, 28)]

// =====================================================================
// 欧式古典
// =====================================================================

/** 卷叶雕花：两个相对的涡卷 + 中心贝壳（贴在 +z 面） */
function carving(x: number, y: number, z: number, s: number, color: string) {
  const g = new THREE.Group()
  for (const k of [-1, 1]) g.add(torus(s * 0.45, s * 0.12, color, { x: x + k * s * 0.7, y, z }, Math.PI * 1.5))
  g.add(ball(s * 0.45, color, { x, y: y + s * 0.1, z }, [1, 0.8, 0.35]))
  return noOutlineDeep(g)
}

/** 路易式扶手椅：卷曲腿、椭圆软包靠背、扶手垫，描金框 */
function louisArmchair(p: string[]) {
  const [fabric, frame, gold] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 27, sz * 24, 38, 2, frame, sx * 0.55, sz * 0.55, 'scroll', gold))
  // 座框：前沿弧形
  g.add(rbox(60, 7, 54, frame, { y: 34 }, 2.4))
  g.add(carving(0, 37.5, 27.4, 5, gold))
  g.add(rbox(56, 9, 50, fabric, { y: 40, z: 1 }, 4))
  // 椭圆靠背
  const bk = new THREE.Group()
  bk.add(torus(22, 2.2, frame, { y: 0 }))
  bk.add(ball(21, fabric, { y: 0 }, [1, 1, 0.22]))
  bk.add(ball(3.2, gold, { y: 23.6, z: 0.6 }, [1.4, 1, 0.5]))
  bk.scale.set(1, 1.18, 1)
  bk.position.set(0, 74, -25)
  bk.rotation.x = -0.12
  g.add(bk)
  for (const s of [-1, 1]) g.add(rod3([s * 22, 41, -24], [s * 15, 56, -25.5], 1.8, frame))
  // 扶手：弧形扶臂 + 垫 + 卷曲托
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * 26, 58, -22], [s * 28, 64, -8], [s * 29, 64.5, 8], [s * 28.5, 62, 18]], 1.8, frame, TUBE))
    g.add(rbox(6, 2.4, 20, fabric, { x: s * 28.4, y: 64.2, z: -2 }, 1.1))
    g.add(cappedTube([[s * 28.5, 62, 18], [s * 29.5, 54, 21], [s * 27.5, 46, 21]], 1.8, frame, { ...TUBE, caps: false }))
  }
  return g
}

/** 路易式餐椅：卷曲腿、软包座 + 奖章形靠背 */
function louisChair(p: string[]) {
  const [fabric, frame, gold] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 18.5, sz * 17.5, 42, 1.7, frame, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(rbox(44, 6, 42, frame, { y: 39 }, 2))
  g.add(carving(0, 42, 21.4, 4, gold))
  g.add(rbox(41, 7, 39, fabric, { y: 44, z: 0.6 }, 3))
  const bk = new THREE.Group()
  bk.add(torus(16, 1.8, frame))
  bk.add(ball(15.4, fabric, {}, [1, 1, 0.2]))
  bk.add(ball(2.4, gold, { y: 17.2, z: 0.5 }, [1.4, 1, 0.5]))
  bk.scale.set(1, 1.25, 1)
  bk.position.set(0, 74, -19.5)
  bk.rotation.x = -0.1
  g.add(bk)
  for (const s of [-1, 1]) g.add(rod3([s * 17, 45, -19], [s * 11, 57, -19.5], 1.6, frame))
  return g
}

/** 卷头贵妃榻（récamier）：两端外卷扶手一高一低，软包长座、圆枕 */
function recamier(p: string[]) {
  const [fabric, frame, gold] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(turnedLeg(16, 2.2, frame, { x: sx * 76, z: sz * 28 }, 'baluster'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(1.6, gold, { x: sx * 76, y: 1.6, z: sz * 28 }))
  g.add(rbox(166, 9, 66, frame, { y: 16 }, 2.4))
  for (const x of [-50, 0, 50]) g.add(carving(x, 20, 33.4, 4, gold))
  g.add(rbox(160, 14, 62, fabric, { y: 25 }, 5))
  // 高卷头（左）与低卷头（右）
  const scroll = (x: number, s: number, h: number) => {
    g.add(sidePrism([[-31, 25], [31, 25], [31, 25 + h], [-31, 25 + h]], 12, fabric, x))
    g.add(cylZ(9, 64, fabric, x + s * 3, 25 + h, 0, 20))
    for (const z of [-32.4, 32.4]) g.add(noOutlineDeep(torus(5.6, 1, gold, { x: x + s * 3, y: 25 + h, z }, Math.PI * 2)))
  }
  scroll(-76, -1, 44)
  scroll(76, 1, 30)
  g.add(cylZ(8, 46, CL.cream, -58, 47, -2, 16))
  return g
}

/** 雕花餐边柜：卷曲短腿、三门（两侧门 + 中间抽屉组）、描金线脚；门里各一块层板 */
function clSideboard(p: string[]) {
  const [body, top, gold] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 74, sz * 20, 16, 2.2, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(hollow(156, 76, 46, body, { y: 15 }, 1.6, inner))
  // 中间抽屉组两侧的隔板、门里的层板
  for (const s of [-1, 1]) {
    g.add(rbox(1.6, 72.8, 44, body, { x: s * 27.5, y: 16.6, z: 0.8 }, 0.3))
    g.add(rbox(46.4, 1.6, 42, inner, { x: s * 52, y: 48.4, z: 0.8 }, 0.3))
  }
  // 面框：底、两侧、门与抽屉之间的立梃、上方横档
  g.add(rbox(156, 7, 1.6, body, { y: 15, z: 22.2 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(3, 58, 1.6, body, { x: s * 76.5, y: 22, z: 22.2 }, 0.4))
    g.add(rbox(3, 62, 1.6, body, { x: s * 27.5, y: 22, z: 22.2 }, 0.4))
    g.add(rbox(50, 11, 1.6, body, { x: s * 52, y: 80, z: 22.2 }, 0.4))
  }
  g.add(rbox(52, 7, 1.6, body, { y: 84, z: 22.2 }, 0.4))
  // 波浪裙脚
  g.add(prism([[-76, 16], [76, 16], [76, 13], [60, 11], [44, 14], [20, 11], [0, 13.5], [-20, 11], [-44, 14], [-60, 11], [-76, 13]], 1.4, body, 23.2))
  g.add(rbox(160, 4, 50, top, { y: 91 }, 1.4))
  // 两侧门（铰链在外侧）
  for (const x of [-52, 52]) {
    const s = Math.sign(x)
    const parts: THREE.Object3D[] = [
      rbox(46, 58, 1.2, body, { x, y: 22, z: 23.2 }, 0.6),
      rbox(36, 46, 0.6, shade(body, -0.05), { x, y: 28, z: 23.95 }, 0.4),
      noOutlineDeep(torus(7, 0.5, gold, { x, y: 51, z: 24.5 })),
      ball(1.3, gold, { x: x + (x < 0 ? 19 : -19), y: 52, z: 24.6 }),
    ]
    g.add(swingDoor(parts, x + s * 23, 22.6, s < 0 ? 'left' : 'right'))
  }
  // 中间三层抽屉
  for (let k = 0; k < 3; k++) {
    const y = 23 + k * 21
    g.add(drawerOf([rbox(52, 19, 1.2, body, { y, z: 23.2 }, 0.6), rbox(10, 2.4, 1.2, gold, { y: y + 8.5, z: 24.4 }, 0.6)], -26, 26, y, 19, 22.6, 40, inner))
  }
  g.add(carving(0, 86, 23.4, 5, gold))
  return g
}
const CL_SB_SURFACES: SurfaceDef[] = [
  ...[-1, 1].flatMap((s): SurfaceDef[] => {
    const shape = [s < 0 ? r(-76, -21.2, -29.2, 21) : r(29.2, -21.2, 76, 21)]
    return [
      { y: 16.6, h: 31.6, inside: true, shape },
      { y: 50, h: 39, inside: true, shape },
    ]
  }),
  ...[0, 1, 2].map((k) => drawerLv(-26, 26, 23 + k * 21, 19, 22.6, 40)),
]

/** 法式梳妆台：卷曲腿、弓形台面、背后立椭圆镜；台面下三只小抽屉 */
function clVanity(p: string[]) {
  const [body, mirrorC, gold] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 48, sz * 18, 60, 2, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(hollow(104, 14, 42, body, { y: 60 }, 1.6, inner))
  // 抽屉面框：上下横档 + 抽屉之间的立梃
  g.add(rbox(104, 2, 1.2, body, { y: 60, z: 20.4 }, 0.3))
  g.add(rbox(104, 2, 1.2, body, { y: 72, z: 20.4 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(rbox(4, 10, 1.2, body, { x: s * 15, y: 62, z: 20.4 }, 0.3))
    g.add(rbox(9, 10, 1.2, body, { x: s * 47.5, y: 62, z: 20.4 }, 0.3))
  }
  for (const x of [-30, 0, 30]) g.add(drawerOf([rbox(26, 10, 1, shade(body, -0.04), { x, y: 62, z: 21.2 }, 0.4), ball(1.2, gold, { x, y: 67, z: 22.1 })], x - 13, x + 13, 62, 10, 20.7, 36, inner))
  g.add(prism([[-50, 60], [50, 60], [50, 57], [30, 55], [0, 57.5], [-30, 55], [-50, 57]], 1.4, body, 20.6))
  g.add(rbox(110, 3, 46, body, { y: 74 }, 1.2))
  // 镜子：底座 + 椭圆框
  g.add(rbox(60, 6, 10, body, { y: 77, z: -18 }, 1))
  for (const s of [-1, 1]) g.add(rbox(4, 40, 4, body, { x: s * 24, y: 80, z: -18 }, 1))
  const mg = new THREE.Group()
  mg.add(torus(22, 2.2, gold))
  const glassM = ball(21.2, mirrorC, {}, [1, 1, 0.04])
  glassM.material = toon(mirrorC, { emissive: 0.15 })
  mg.add(glassM)
  mg.add(ball(3.6, gold, { y: 23.6, z: 0.4 }, [1.6, 1, 0.5]))
  mg.scale.set(1, 1.3, 1)
  mg.position.set(0, 116, -18)
  g.add(mg)
  return g
}
const CL_VANITY_SURFACES: SurfaceDef[] = [-30, 0, 30].map((x) => drawerLv(x - 13, x + 13, 62, 10, 20.7, 36))

/** 欧式壁炉：大理石炉身、线脚炉架、柴火 + 两只三叉烛台 */
function clFireplace(p: string[]) {
  const [stone, mantel, gold] = p
  const g = new THREE.Group()
  g.add(rbox(150, 4, 42, shade(stone, -0.06), {}, 1))
  // 炉身两侧壁柱
  for (const s of [-1, 1]) {
    g.add(rbox(26, 96, 34, stone, { x: s * 57, y: 4, z: -4 }, 1.2))
    g.add(rbox(18, 80, 1, shade(stone, -0.05), { x: s * 57, y: 12, z: 13.4 }, 0.4))
    g.add(rbox(28, 5, 36, stone, { x: s * 57, y: 4, z: -4 }, 1))
    g.add(carving(s * 57, 92, 13.6, 4, gold))
  }
  // 炉口上方横额 + 内膛
  g.add(rbox(88, 22, 34, stone, { y: 78, z: -4 }, 1.2))
  g.add(carving(0, 88, 13.6, 6, gold))
  g.add(rbox(88, 74, 3, '#2a2422', { y: 4, z: -19.5 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(3, 74, 30, '#3a302c', { x: s * 42.5, y: 4, z: -4 }, 0.6))
  g.add(rbox(88, 2, 30, '#3a302c', { y: 4, z: -4 }, 0.5))
  // 柴架与柴火
  for (const s of [-1, 1]) g.add(rbox(2, 8, 18, IRON, { x: s * 20, y: 6, z: -4 }, 0.4))
  g.add(cylX(3.4, 46, '#7a5236', 0, 15, -8))
  g.add(cylX(3, 40, '#8a6040', 0, 15, 0))
  g.add(cylX(3, 40, '#6a4630', 0, 20.6, -4))
  // 炉架台面（出沿）
  g.add(rbox(150, 3, 42, shade(mantel, -0.05), { y: 100 }, 1))
  g.add(rbox(156, 4, 46, mantel, { y: 103 }, 1.2))
  // 三叉烛台
  for (const s of [-1, 1]) {
    const x = s * 62
    const y = 107
    g.add(lathe([[0, 0], [4.4, 0], [4, 1.4], [1.6, 2.4], [1.2, 10], [2, 11], [0, 11]], gold, { x, y, z: 4 }, 16))
    for (const k of [-1, 0, 1]) {
      const cx = x + k * 7
      if (k) g.add(cappedTube([[x, y + 10.5, 4], [x + k * 4, y + 11, 4], [cx, y + 13.5, 4]], 0.6, gold, { ...TUBE, caps: false }))
      else g.add(cyl(0.7, 0.7, 4.4, gold, { x, y: y + 10.8, z: 4 }, 8))
      g.add(cyl(1.6, 1.2, 1.4, gold, { x: cx, y: y + 13 + (k ? 0 : 2), z: 4 }, 12))
      g.add(cyl(0.9, 0.9, 8, C.cream, { x: cx, y: y + 14.4 + (k ? 0 : 2), z: 4 }, 10))
    }
  }
  return g
}
const FIREPLACE_FX = [
  { kind: 'flame' as const, x: 0, y: 22, z: -4, scale: 2.4 },
  ...[-1, 1].flatMap((s) => [-1, 0, 1].map((k) => ({ kind: 'flame' as const, x: s * 62 + k * 7, y: 107 + 22.6 + (k ? 0 : 2), z: 4, scale: 0.5 }))),
]

/** 水晶烛台落地灯：卷曲三脚、车旋立柱、多臂烛台挂水晶坠 */
function crystalFloorLamp(p: string[]) {
  const [metal, shadeC, crystal] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const pt = (rr: number, y: number): V3 => [Math.sin(a) * rr, y, Math.cos(a) * rr]
    g.add(cappedTube([pt(2, 18), pt(10, 10), pt(15, 2.7), pt(17, 1.3)], 1.3, metal, TUBE))
  }
  g.add(lathe([[0, 8], [3, 8], [2, 14], [3.4, 20], [1.4, 26], [1.2, 130], [2.4, 132], [2.4, 134], [0, 134]], metal, {}, 16))
  // 五臂烛台
  const y = 134
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const pt = (rr: number, yy: number): V3 => [Math.sin(a) * rr, yy, Math.cos(a) * rr]
    g.add(cappedTube([pt(1, y), pt(8, y - 2), pt(14, y + 2), pt(15, y + 7)], 0.7, metal, { ...TUBE, caps: false }))
    const [cx, , cz] = pt(15, 0)
    g.add(cyl(2, 1.4, 1.4, metal, { x: cx, y: y + 6.4, z: cz }, 12))
    g.add(cyl(1.6, 2.4, 6, shadeC, { x: cx, y: y + 7.8, z: cz }, 12))
    g.add(lit(cyl(1.2, 1.4, 4.4, C.lamp, { x: cx, y: y + 8, z: cz }, 10), C.lamp, 0.9))
    g.add(cyl(3.6, 5.6, 7.4, shadeC, { x: cx, y: y + 10.6, z: cz }, 16))
    // 水晶坠
    const [dx, , dz] = pt(10, 0)
    g.add(cyl(0.15, 0.15, 3, crystal, { x: dx, y: y - 4.4, z: dz }, 4))
    const drop = ball(1.1, crystal, { x: dx, y: y - 5.4, z: dz }, [1, 1.6, 1])
    drop.material = toon(crystal, { transparent: 0.75 })
    g.add(drop)
  }
  g.add(lathe([[0, 0], [1.4, 0], [3, 3], [2.4, 6], [0.4, 9], [0, 9]], metal, { y: y + 2 }, 12))
  return g
}

/** 烛台台灯：巴洛克车旋底座 + 褶皱灯罩 */
function candleTableLamp(p: string[]) {
  const [base, shadeC, gold] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [7, 0], [7, 1.6], [5, 3], [2.4, 5], [3.6, 9], [1.4, 14], [1.4, 26], [2.6, 28], [3.2, 30], [0, 30]], base, {}, 20))
  g.add(torus(6.6, 0.6, gold, { y: 1.6, rx: Math.PI / 2 }))
  g.add(cyl(0.5, 0.5, 6, gold, { y: 30 }, 8))
  g.add(lit(ball(2.2, C.lamp, { y: 34 }), C.lamp, 0.9))
  // 褶皱灯罩：外圈竖棱
  const shadeG = new THREE.Group()
  shadeG.add(cup(8, 13, 17, 0.6, shadeC, { y: 0 }))
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    shadeG.add(rod3([Math.sin(a) * 13, 0.4, Math.cos(a) * 13], [Math.sin(a) * 8, 16.6, Math.cos(a) * 8], 0.6, shade(shadeC, -0.04), 6))
  }
  shadeG.position.y = 31
  g.add(shadeG)
  g.add(torus(13, 0.45, gold, { y: 31.4, rx: Math.PI / 2 }))
  g.add(ball(1.2, gold, { y: 49 }))
  return g
}

/** 雕花四柱床：车旋柱带尖顶、拱形软包床头配描金冠饰、床尾低板 */
function clPosterBed(p: string[]) {
  const [duvet, sheet, wood] = p
  const gold = CL.gold
  const g = new THREE.Group()
  const W = 176
  const D = 218
  const PX = W / 2 - 5
  const PZ = D / 2 - 5
  for (const sx of [-1, 1]) {
    g.add(turnedLeg(196, 4.6, wood, { x: sx * PX, z: -PZ }, 'baluster'))
    g.add(turnedLeg(150, 4.6, wood, { x: sx * PX, z: PZ }, 'baluster'))
    g.add(lathe([[0, 0], [3.4, 0], [2, 4], [2.8, 7], [0.4, 12], [0, 12]], gold, { x: sx * PX, y: 196, z: -PZ }, 12))
    g.add(lathe([[0, 0], [3.4, 0], [2, 4], [2.8, 7], [0.4, 12], [0, 12]], gold, { x: sx * PX, y: 150, z: PZ }, 12))
    // 侧梁
    g.add(rbox(4, 16, D - 18, wood, { x: sx * PX, y: 22 }, 1.2))
  }
  g.add(rbox(W - 18, 4, D - 18, shade(wood, -0.1), { y: 30 }, 1))
  // 床头：拱形软包 + 木框 + 冠饰
  const arch: P2[] = [[-(PX - 4), 38], [PX - 4, 38], [PX - 4, 128], [50, 140], [20, 150], [0, 153], [-20, 150], [-50, 140], [-(PX - 4), 128]]
  g.add(prism(arch, 6, wood, -PZ))
  const inner = arch.map(([x, y]) => [x * 0.88, 44 + (y - 38) * 0.86] as P2)
  g.add(prism(inner, 2.4, sheet, -PZ + 3.8))
  for (let k = -3; k <= 3; k++) for (const y of [70, 92, 114]) g.add(ball(1.2, shade(sheet, -0.15), { x: k * 18 + (y === 92 ? 9 : 0), y, z: -PZ + 5.2 }))
  g.add(carving(0, 150, -PZ + 3.4, 9, gold))
  // 床尾板
  g.add(prism([[-(PX - 4), 22], [PX - 4, 22], [PX - 4, 70], [40, 76], [0, 80], [-40, 76], [-(PX - 4), 70]], 5, wood, PZ))
  g.add(carving(0, 64, PZ + 2.8, 6, gold))
  // 床品
  g.add(rbox(W - 22, 22, D - 28, sheet, { y: 34, z: 0 }, 5))
  for (const s of [-1, 1]) g.add(rbox(60, 13, 36, C.white, { x: s * 36, y: 55, z: -PZ + 30, rx: -0.14 }, 5))
  g.add(rbox(W - 18, 9, D - 80, duvet, { y: 54, z: 28 }, 4))
  g.add(rbox(W - 17.6, 3, 16, duvet, { y: 61, z: 28 - (D - 80) / 2 + 8 }, 1.5))
  return g
}

/** 圆形大理石茶几：大理石圆面 + 描金三弯柱脚 */
function marbleCoffee(p: string[]) {
  const [stone, metal, vein] = p
  const g = new THREE.Group()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const pt = (rr: number, y: number): V3 => [Math.sin(a) * rr, y, Math.cos(a) * rr]
    g.add(cappedTube([pt(12, 38), pt(22, 30), pt(20, 16), pt(27, 4), pt(31, 1.8)], 1.6, metal, TUBE))
  }
  g.add(torus(14, 1.4, metal, { y: 22, rx: Math.PI / 2 }))
  g.add(lathe([[0, 14], [4, 14], [6, 18], [3, 26], [5, 34], [12, 38.4], [0, 38.4]], metal, {}, 20))
  g.add(cyl(42, 42, 4, stone, { y: 38.4 }, 48))
  // 大理石纹
  for (const [x, z, l, a] of [[-12, -8, 34, 0.5], [10, 6, 28, -0.4], [-4, 18, 18, 0.2]] as number[][]) {
    const v = rbox(l, 0.3, 0.8, vein, { x, y: 42.3, z, ry: a }, 0.1)
    v.userData.noOutline = true
    g.add(v)
  }
  g.add(torus(42, 0.8, metal, { y: 40.4, rx: Math.PI / 2 }))
  return g
}

/** 帝国式书柜：立柱壁柱 + 三角山花，开放层板 */
const EMP = { w: 86, d: 32, h: 196, levels: [10, 50, 88, 126, 164] }
function empireBookcase(p: string[]) {
  const [body, gold, back] = p
  const { w, d, h, levels } = EMP
  const g = new THREE.Group()
  g.add(rbox(w, 10, d, body, {}, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(4, 166, d - 2, body, { x: s * (w / 2 - 6), y: 10 }, 0.8))
    // 壁柱
    g.add(cyl(2.6, 2.6, 156, body, { x: s * (w / 2 - 3), y: 15, z: d / 2 - 3 }, 16))
    g.add(rbox(7, 5, 7, body, { x: s * (w / 2 - 3), y: 10, z: d / 2 - 3.5 }, 1))
    g.add(rbox(7, 5, 7, gold, { x: s * (w / 2 - 3), y: 171, z: d / 2 - 3.5 }, 1))
    g.add(rbox(4, 166, 4, body, { x: s * (w / 2 - 3), y: 10, z: -d / 2 + 2.6 }, 0.8))
  }
  g.add(rbox(w - 16, 166, 1.2, back, { y: 10, z: -d / 2 + 1.6 }, 0.4))
  for (const y of levels.slice(1)) g.add(rbox(w - 16 + 0.4, 2, d - 4, body, { y, z: 0.4 }, 0.5))
  // 檐口 + 山花
  g.add(rbox(w, 4, d, body, { y: 176 }, 1))
  g.add(rbox(w + 2, 2.4, d + 2, gold, { y: 180 }, 0.8))
  g.add(prism([[-(w / 2 + 1), 182.4], [w / 2 + 1, 182.4], [0, h]], d - 4, body, -1))
  g.add(noOutlineDeep(cylZ(3.2, 0.6, gold, 0, 187.4, d / 2 - 2.6, 16)))
  return g
}
function empireSurfaces() {
  const { w, d, levels } = EMP
  return levels.map((y, i) => ({ y: y + (i ? 2 : 0), shape: [r(-(w / 2 - 8), -d / 2 + 2.4, w / 2 - 8, d / 2 - 1.6)], h: (i + 1 < levels.length ? levels[i + 1] : 176) - y - (i ? 2 : 0) }))
}

/** 法式软包长凳（钢琴凳 / 床尾凳）：拉扣软包 + 卷曲腿 */
function tuftedBench(p: string[]) {
  const [fabric, frame, gold] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 50, sz * 15, 34, 1.8, frame, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(rbox(110, 6, 40, frame, { y: 31 }, 2))
  g.add(carving(0, 34, 20.4, 4, gold))
  g.add(rbox(106, 10, 37, fabric, { y: 36.5 }, 4.5))
  for (let i = -3; i <= 3; i++) for (const z of [-8, 8]) g.add(ball(1, shade(fabric, -0.2), { x: i * 14 + (z > 0 ? 7 : 0), y: 46.3, z }))
  return g
}

/** 丝绒圆脚凳：拉扣圆垫 + 短卷腿 + 流苏裙边 */
function velvetOttoman(p: string[]) {
  const [fabric, frame, gold] = p
  const g = new THREE.Group()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cabriole(Math.sin(a) * 22, Math.cos(a) * 22, 14, 1.8, frame, Math.sin(a) * 0.7, Math.cos(a) * 0.7, 'scroll', gold))
  }
  g.add(cyl(28, 28, 5, frame, { y: 12 }, 40))
  g.add(puck(29, 24, fabric, { y: 16 }))
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2
    g.add(cyl(0.45, 0.45, 5, gold, { x: Math.sin(a) * 28.6, y: 15, z: Math.cos(a) * 28.6 }, 4))
  }
  g.add(ball(1.4, shade(fabric, -0.22), { y: 39.6 }))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    g.add(ball(1.1, shade(fabric, -0.22), { x: Math.sin(a) * 13, y: 38.9, z: Math.cos(a) * 13 }))
  }
  return g
}

/** 法式衣柜（拱顶）：弓形顶冠、两扇镜面 / 镶板门、卷曲短腿；门里是挂衣杆 + 枕棚 */
function clArmoire(p: string[]) {
  const [body, panel, gold] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 56, sz * 25, 14, 2.4, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(hollow(120, 170, 58, body, { y: 13 }, 1.8, inner))
  g.add(rbox(116.4, 1.6, 55, inner, { y: 168.4, z: 0.5 }, 0.3))
  g.add(hangingPipe(-56, 56, 160, 0))
  // 门上下的横档
  g.add(rbox(120, 5, 1.6, body, { y: 13, z: 28.2 }, 0.4))
  g.add(rbox(120, 5, 1.6, body, { y: 178, z: 28.2 }, 0.4))
  g.add(prism([[-60, 14], [60, 14], [60, 11], [40, 9], [0, 12], [-40, 9], [-60, 11]], 1.4, body, 29.2))
  // 拱顶
  g.add(prism([[-62, 183], [62, 183], [62, 189], [40, 197], [14, 202], [0, 208], [-14, 202], [-40, 197], [-62, 189]], 60, body))
  g.add(carving(0, 199, 30.4, 6, gold))
  // 门（铰链在外侧）
  for (const s of [-1, 1]) {
    const x = s * 28.6
    const arch: P2[] = [[-21, 28], [21, 28], [21, 140], [12, 150], [0, 153], [-12, 150], [-21, 140]]
    const parts: THREE.Object3D[] = [
      rbox(55, 160, 1.4, body, { x, y: 18, z: 29.2 }, 0.6),
      prism(arch, 0.8, panel, 30.2, x),
      noOutlineDeep(rbox(14, 1, 0.4, gold, { x, y: 90, z: 30.8 }, 0.2)),
      rbox(1.6, 14, 1.6, gold, { x: x - s * 23.5, y: 92, z: 31 }, 0.6),
    ]
    g.add(swingDoor(parts, x + s * 27.5, 28.5, s < 0 ? 'left' : 'right'))
  }
  return g
}
const CL_ARMOIRE_SURFACES: SurfaceDef[] = [
  { y: 14.8, h: 150, inside: true, shape: [r(-57.6, -26.6, 57.6, 27.4)] },
  { y: 170, h: 11, inside: true, shape: [r(-57.6, -26.6, 57.6, 27.4)] },
  pipeHook(-56, 56, 160, 0, 160 - 14.8 - 6),
]

/** 巴洛克金框落地镜：靠墙斜放，涡卷顶饰 */
function baroqueMirror(p: string[]) {
  const [frame, mirrorC, accent] = p
  const g = new THREE.Group()
  const H = 182
  const tilt = 0.12
  const m = new THREE.Group()
  const outline: P2[] = [[-38, 0], [38, 0], [38, 150], [30, 162], [16, 170], [0, 180], [-16, 170], [-30, 162], [-38, 150]]
  m.add(prism(outline, 4, frame))
  const inner = outline.map(([x, y]) => [x * 0.82, 8 + y * 0.88] as P2)
  const gm = prism(inner, 0.6, mirrorC, 2.2)
  gm.material = toon(mirrorC, { emissive: 0.15 })
  m.add(gm)
  m.add(carving(0, 172, 2.6, 7, accent))
  m.add(carving(0, 4, 2.6, 5, accent))
  for (const s of [-1, 1]) m.add(noOutlineDeep(ball(2.4, accent, { x: s * 38, y: 150, z: 1 })))
  m.position.y = 0.3
  m.rotation.x = -tilt
  g.add(m)
  g.add(rbox(80, 3, 8, frame, { z: 2 }, 1))
  void H
  return centerGroup(g)
}

/** 半圆玄关桌（console）：半圆台面 + 三条锥形腿 + 弧形裙板 */
function demilune(p: string[]) {
  const [body, top, gold] = p
  const g = new THREE.Group()
  const R0 = 50
  const half = (rr: number, z0: number, n = 20): Poly => [[-rr, z0], ...Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI - (i / n) * Math.PI; return [Math.cos(a) * rr, z0 + Math.sin(a) * rr * 0.76] as [number, number] }), [rr, z0]]
  const legPos: P2[] = [[-44, -14], [44, -14], [0, 14]]
  for (const [x, z] of legPos) {
    g.add(lathe([[0, 0], [1.6, 0], [1.4, 4], [2.4, 6], [2.2, 60], [3, 66], [3, 70], [0, 70]], body, { x, z }, 12))
    g.add(ball(1.6, gold, { x, y: 1.6, z }))
  }
  // 弧形裙板：用一圈短板拼
  const n = 12
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (i / n) * Math.PI
    const a1 = Math.PI - ((i + 1) / n) * Math.PI
    const am = (a0 + a1) / 2
    const rr = R0 - 3
    const x = Math.cos(am) * rr
    const z = -17.4 + Math.sin(am) * rr * 0.76
    const len = Math.hypot(Math.cos(a1) * rr - Math.cos(a0) * rr, (Math.sin(a1) - Math.sin(a0)) * rr * 0.76) + 0.6
    const seg = rbox(len, 9, 2, body, { x, y: 66, z }, 0.5)
    seg.rotation.y = -Math.atan2((Math.sin(a1) - Math.sin(a0)) * 0.76, Math.cos(a1) - Math.cos(a0))
    g.add(seg)
  }
  g.add(rbox(R0 * 2 - 6, 9, 2, body, { y: 66, z: -17.4 }, 0.5))
  g.add(carving(0, 70, 19.6, 4, gold))
  // 台面
  const { slab } = { slab: (poly: Poly, t: number, color: string, y: number) => {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 })
    geo.rotateX(-Math.PI / 2)
    const m = mesh(geo, color)
    m.position.y = y
    return m
  } }
  g.add(slab(half(R0, -19), 4, top, 75))
  return g
}

/** 大理石柱基座花台：方底座 + 凹槽圆柱 + 方顶板 */
function columnPedestal(p: string[]) {
  const [stone, accent, vein] = p
  const g = new THREE.Group()
  g.add(rbox(34, 6, 34, stone, {}, 1))
  g.add(rbox(30, 4, 30, shade(stone, -0.04), { y: 6 }, 1))
  g.add(lathe([[0, 10], [12, 10], [12, 12], [10, 14], [10, 90], [12, 92], [12, 94], [0, 94]], stone, {}, 32))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const f = rbox(1.4, 72, 0.6, vein, { x: Math.sin(a) * 10.05, y: 16, z: Math.cos(a) * 10.05, ry: a }, 0.3)
    f.userData.noOutline = true
    g.add(f)
  }
  g.add(torus(10.4, 0.8, accent, { y: 88, rx: Math.PI / 2 }))
  g.add(rbox(30, 4, 30, shade(stone, -0.04), { y: 94 }, 1))
  g.add(rbox(34, 4, 34, stone, { y: 98 }, 1))
  return g
}

/** 法式床头柜：卷曲腿、弓形抽屉、描金拉手 */
function clNightstand(p: string[]) {
  const [body, top, gold] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 18, sz * 13.5, 22, 1.6, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(hollow(42, 34, 33, body, { y: 21 }, 1.6, inner))
  g.add(rbox(38.8, 1.6, 31, inner, { y: 36.6, z: 0.4 }, 0.3))
  g.add(prism([[-20, 22], [20, 22], [20, 19], [10, 17], [0, 19.5], [-10, 17], [-20, 19]], 1.2, body, 16))
  for (const y of [23.5, 39]) g.add(drawerOf([rbox(36, 13, 1, shade(body, -0.04), { y, z: 16.8 }, 0.5), rbox(8, 1.6, 1.2, gold, { y: y + 6, z: 17.6 }, 0.5)], -18, 18, y, 13, 16.3, 30, inner))
  g.add(rbox(46, 3, 37, top, { y: 55 }, 1.2))
  return g
}
const CL_NS_SURFACES: SurfaceDef[] = [23.5, 39].map((y) => drawerLv(-18, 18, y, 13, 16.3, 30))

/** 按多边形挤出的平板（[x, z] 多边形，底面在 y，厚 t，不倒角） */
function slabY(poly: Poly, t: number, color: string, y: number) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 })
  geo.rotateX(-Math.PI / 2)
  const m = mesh(geo, color)
  m.position.y = y
  return m
}

/** 拼布被面：方块拼色 + 缝线 */
function paintPatchwork(a: string, b: string) {
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

// =====================================================================
// 美式乡村
// =====================================================================

/** 谷仓门：Z 字撑竖板门挂在黑铁滑轨上（壁挂，门底离地 1cm） */
const BARN_MOUNT = 1
function barnDoor(p: string[]) {
  const [wood, brace, metal] = p
  const g = new THREE.Group()
  const y0 = BARN_MOUNT
  const DW = 96
  const DH = 208
  const dx = -38
  for (let i = 0; i < 6; i++) g.add(rbox(DW / 6 - 0.3, DH, 3, i % 2 ? shade(wood, -0.05) : wood, { x: dx - DW / 2 + DW / 12 + (i * DW) / 6, y: y0, z: 2 }, 0.4))
  for (const y of [y0, y0 + DH - 14]) g.add(rbox(DW, 14, 2, brace, { x: dx, y, z: 4.4 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(13, DH - 28 + 0.4, 2, brace, { x: dx + s * (DW / 2 - 6.5), y: y0 + 13.8, z: 4.4 }, 0.5))
  g.add(batten([dx - DW / 2 + 15, y0 + 16, 4.4], [dx + DW / 2 - 15, y0 + DH - 16, 4.4], 12, 2, brace))
  // 拉手
  const hx = dx + DW / 2 - 6.5
  g.add(rod3([hx, y0 + 86, 8.6], [hx, y0 + 122, 8.6], 1, metal))
  for (const y of [y0 + 88, y0 + 120]) g.add(cylZ(0.8, 3.4, metal, hx, y, 6.8, 8))
  // 滑轨、托架螺栓、滚轮与吊带
  const ry = y0 + DH - 0.2
  g.add(rbox(200, 4, 1.2, metal, { y: ry, z: -1 }, 0.4))
  for (const x of [-90, -30, 30, 90]) g.add(cylZ(1.2, 2.6, metal, x, ry + 2, -2.9, 10))
  for (const s of [-1, 1]) g.add(rbox(2.4, 6, 3, metal, { x: s * 98.4, y: ry + 3.6, z: -1 }, 0.5))
  for (const s of [-1, 1]) {
    const wx = dx + s * 30
    const wy = ry + 4 + 4.2
    g.add(cylZ(4.2, 1.6, metal, wx, wy, -1, 20))
    g.add(cylZ(0.9, 2.6, shade(metal, 0.2), wx, wy, -0.6, 8))
    g.add(rbox(3.4, wy - (y0 + DH - 7), 0.8, metal, { x: wx, y: y0 + DH - 7, z: 0.2 }, 0.3))
    g.add(rbox(3.4, 1, 6.6, metal, { x: wx, y: y0 + DH, z: 3.1 }, 0.3))
    g.add(rbox(3.4, 16, 0.6, metal, { x: wx, y: y0 + DH - 15, z: 5.7 }, 0.2))
    g.add(ball(0.7, shade(metal, 0.2), { x: wx, y: y0 + DH - 10, z: 6 }))
  }
  return centerGroup(g)
}

/** 温莎摇椅：马鞍座、梳背纺锤杆、弧形摇板 */
function windsorRocker(p: string[]) {
  const [wood, cushion, dark] = p
  const g = new THREE.Group()
  const yc = (z: number) => 1.9 + 7 * (z / 44) ** 2
  const runner: P2[] = []
  for (let i = 0; i <= 16; i++) {
    const z = -44 + (88 * i) / 16
    runner.push([z, yc(z)])
  }
  for (const s of [-1, 1]) g.add(sidePrism(strip(runner, 3.8), 2.6, dark, s * 23))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const z1 = sz * 20
      g.add(rod3([sx * 17, 41, sz * 14], [sx * 23, yc(z1) + 1.4, z1], 1.6, wood))
    }
  for (const s of [-1, 1]) g.add(rod3([s * 20, 18, -17.5], [s * 20, 18, 17.5], 1, wood))
  g.add(rod3([-20, 18, 0], [20, 18, 0], 1, wood))
  g.add(rbox(50, 4.5, 44, wood, { y: 40 }, 2))
  g.add(rbox(42, 3, 36, cushion, { y: 44.3, z: 2 }, 1.4))
  // 梳背
  g.add(cappedTube([[-24, 100, -22], [-12, 103, -26], [0, 104, -27], [12, 103, -26], [24, 100, -22]], 2, wood, TUBE))
  for (let i = 0; i < 7; i++) {
    const t = -1 + i / 3
    const x = t * 16
    g.add(rod3([x * 0.85, 44, -18], [x * 1.3, 103.4 - Math.abs(t) * 2.6, -26 + Math.abs(t) * 3], 0.75, wood))
  }
  // 扶手
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * 16.5, 64, -20], [s * 22, 64.5, -4], [s * 24, 63, 12], [s * 23.5, 62.5, 18]], 1.6, wood, TUBE))
    g.add(rod3([s * 21, 44, 13], [s * 24, 62.6, 13], 1.2, wood))
    g.add(rod3([s * 20, 44, 0], [s * 22.8, 63.8, -1], 0.8, wood))
  }
  return g
}

/** 农舍长餐桌：厚拼板桌面 + 两端横封边、粗车旋腿（漆色底座 + 原木面） */
function farmTable(p: string[]) {
  const [top, base] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(turnedLeg(68, 4.6, base, { x: sx * 88, z: sz * 38.5 }, 'farm'))
  for (const s of [-1, 1]) {
    g.add(rbox(172, 9, 2.4, base, { y: 63, z: s * 38.5 }, 0.6))
    g.add(rbox(2.4, 9, 72, base, { x: s * 88, y: 63 }, 0.6))
  }
  for (let i = 0; i < 4; i++) g.add(rbox(184, 5, 23.75, i % 2 ? shade(top, -0.04) : top, { y: 72, z: -35.625 + i * 23.75 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(8, 5, 95, shade(top, -0.07), { x: s * 96, y: 72 }, 0.8))
  return g
}

/** 农舍长凳：厚板凳面 + X 形腿 */
function farmBench(p: string[]) {
  const [top, base] = p
  const g = new THREE.Group()
  g.add(rbox(160, 4.5, 36, top, { y: 41.5 }, 1))
  for (const s of [-1, 1]) {
    const x = s * 62
    g.add(batten([x, 40.3, -14], [x, 0.8, 14], 4, 4, base))
    g.add(batten([x, 40.3, 14], [x, 0.8, -14], 4, 4, base))
    g.add(rbox(4.4, 4, 34, base, { x, y: 37.5 }, 0.8))
  }
  g.add(rbox(128, 4, 4, base, { y: 18.75 }, 0.8))
  return g
}

/** 碗柜（hutch）：下柜门 + 抽屉，上部玻璃门里立着展示盘，豆腐板背板 */
function hutch(p: string[]) {
  const [body, top, back] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  g.add(rbox(136, 4, 44, shade(body, -0.2), {}, 0.5))
  g.add(hollow(140, 84, 48, body, { y: 4 }, 1.6, inner))
  g.add(rbox(136.8, 1.6, 46, inner, { y: 32.4, z: 0.8 }, 0.3))
  g.add(rbox(136.8, 1.6, 46, inner, { y: 61.4, z: 0.8 }, 0.3))
  // 面框
  g.add(rbox(140, 4, 1.6, body, { y: 4, z: 23.2 }, 0.4))
  g.add(rbox(140, 3, 1.6, body, { y: 62, z: 23.2 }, 0.4))
  g.add(rbox(140, 5, 1.6, body, { y: 83, z: 23.2 }, 0.4))
  g.add(rbox(4, 79, 1.6, body, { y: 4, z: 23.2 }, 0.4))
  for (const s of [-1, 1]) {
    const x = s * 34.5
    g.add(swingDoor([rbox(65, 54, 1.2, body, { x, y: 8, z: 24.2 }, 0.6), rbox(53, 42, 0.6, shade(body, -0.05), { x, y: 14, z: 25 }, 0.3), ball(1.4, FH.black, { x: x - s * 26, y: 36, z: 25.6 })], s * 67, 23.6, s < 0 ? 'left' : 'right'))
    g.add(drawerOf([rbox(65, 18, 1.2, body, { x, y: 65, z: 24.2 }, 0.6), torus(2.6, 0.6, FH.black, { x, y: 75.6, z: 25.2 }, Math.PI)], x - 32.5, x + 32.5, 65, 18, 23.6, 44, inner))
  }
  g.add(rbox(144, 3, 52, top, { y: 88 }, 1))
  // 上柜
  for (const s of [-1, 1]) g.add(rbox(3, 104, 32, body, { x: s * 66.5, y: 91, z: -10 }, 0.8))
  g.add(rbox(136, 3, 32, body, { y: 192, z: -10 }, 0.8))
  g.add(rbox(146, 5, 37, body, { y: 195, z: -8.5 }, 1))
  g.add(rbox(130.4, 101, 1.2, back, { y: 91, z: -25.2 }, 0.3))
  for (let x = -60; x <= 60; x += 7.5) g.add(noOutlineDeep(rbox(0.6, 100, 0.3, shade(back, -0.1), { x, y: 91.5, z: -24.45 }, 0.1)))
  for (const y of [125, 158]) {
    g.add(rbox(130.4, 2, 30, body, { y, z: -10 }, 0.5))
    g.add(cylX(0.5, 130.4, FH.black, 0, y + 6, -18))
    for (let k = -2; k <= 2; k++) {
      const plate = cylZ(10, 1.2, C.white, k * 25, y + 12, -21.4, 28)
      plate.rotation.x = Math.PI / 2 - 0.12
      g.add(plate)
      g.add(noOutlineDeep(cylZ(6.6, 0.4, k % 2 ? FH.denim : FH.barn, k * 25, y + 12, -20.6)).rotateX(-0.12))
    }
  }
  // 玻璃门（铰链在外侧）
  for (const s of [-1, 1]) {
    const x = s * 32.6
    const dg = new THREE.Group()
    dg.add(rbox(64.6, 3.4, 1.6, body, { y: 0 }, 0.5))
    dg.add(rbox(64.6, 3.4, 1.6, body, { y: 97.6 }, 0.5))
    for (const t of [-1, 1]) dg.add(rbox(3.4, 94.6, 1.6, body, { x: t * 30.6, y: 3.2 }, 0.5))
    dg.add(rbox(1.6, 94.6, 1.4, body, { y: 3.2 }, 0.4))
    dg.add(rbox(58, 1.6, 1.4, body, { y: 50 }, 0.4))
    dg.add(glassPane(58, 94.6, 0.4, { y: 3.2, z: 0 }))
    dg.add(ball(1.2, FH.black, { x: -s * 28, y: 50, z: 1.6 }))
    dg.position.set(x, 91.4, 6.9)
    g.add(swingDoor([dg], x + s * 32.3, 6.1, s < 0 ? 'left' : 'right'))
  }
  return g
}
const HUTCH_UP = r(-64.6, -17, 64.6, 5.2)
const HUTCH_SURFACES: SurfaceDef[] = [
  { y: 5.6, h: 26.6, inside: true, shape: [r(-68.2, -22.2, 68.2, 22)] },
  { y: 34, h: 27, inside: true, shape: [r(-68.2, -22.2, 68.2, 22)] },
  ...[-1, 1].map((s) => drawerLv(s * 34.5 - 32.5, s * 34.5 + 32.5, 65, 18, 23.6, 44)),
  { y: 91, h: 33.5, inside: true, glass: true, shape: [HUTCH_UP] },
  { y: 127, h: 30.5, inside: true, glass: true, shape: [HUTCH_UP] },
  { y: 160, h: 31.5, inside: true, glass: true, shape: [HUTCH_UP] },
]

/** 白铁艺床：拱形床头、黄铜球顶、竖栏，铺拼布被 */
function fhIronBed(p: string[]) {
  const [quilt, sheet, iron] = p
  const g = new THREE.Group()
  const W = 164
  const D = 210
  const X = W / 2 - 2.4
  const Z = D / 2 - 2.4
  for (const sx of [-1, 1]) {
    g.add(cyl(2.4, 2.4, 122, iron, { x: sx * X, z: -Z }, 12))
    g.add(cyl(2.4, 2.4, 92, iron, { x: sx * X, z: Z }, 12))
    g.add(ball(3.2, BRASS, { x: sx * X, y: 124.4, z: -Z }))
    g.add(ball(3.2, BRASS, { x: sx * X, y: 94.4, z: Z }))
    g.add(rbox(3, 10, 2 * Z - 4, iron, { x: sx * X, y: 26 }, 0.8))
  }
  const archY = (x: number) => 110 + 12 * (1 - (x / X) ** 2)
  g.add(cappedTube(Array.from({ length: 9 }, (_, i) => { const x = -X + (2 * X * i) / 8; return [x, archY(x), -Z] as V3 }), 1.4, iron, { ...TUBE, caps: false }))
  g.add(rod3([-X, 58, -Z], [X, 58, -Z], 1.2, iron))
  for (let i = 1; i < 12; i++) {
    const x = -X + (2 * X * i) / 12
    g.add(rod3([x, 58, -Z], [x, archY(x), -Z], 0.8, iron))
  }
  g.add(rod3([-X, 84, Z], [X, 84, Z], 1.4, iron))
  g.add(rod3([-X, 46, Z], [X, 46, Z], 1.2, iron))
  for (let i = 1; i < 12; i++) {
    const x = -X + (2 * X * i) / 12
    g.add(rod3([x, 46, Z], [x, 84, Z], 0.8, iron))
  }
  for (const s of [-1, 1]) g.add(noOutlineDeep(torus(4, 0.6, BRASS, { x: s * 30, y: archY(30) - 8, z: -Z })))
  g.add(rbox(W - 8, 3, D - 8, shade(iron, -0.3), { y: 33 }, 0.8))
  g.add(rbox(W - 10, 22, D - 10, sheet, { y: 36 }, 5))
  for (const s of [-1, 1]) g.add(rbox(58, 12, 34, C.white, { x: s * 34, y: 57, z: -Z + 28, rx: -0.12 }, 5))
  const qd = D - 72
  const qz = Z - 4 - qd / 2
  g.add(rbox(W - 4, 7, qd, quilt, { y: 57, z: qz }, 3))
  g.add(paintPanel(W - 10, qd - 6, `sw-quilt-${quilt}-${sheet}`, paintPatchwork(quilt, sheet), { y: 64.35, z: qz + (qd - 6) / 2, rx: -Math.PI / 2 }))
  return g
}

/** 床尾凳 + 叠好的拼布被：板条下层可放篮子 */
function quiltBench(p: string[]) {
  const [wood, quiltA, quiltB] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 44, 5, wood, { x: sx * 55, z: sz * 16.5 }, 1))
  for (const s of [-1, 1]) g.add(rbox(105.4, 6, 2, wood, { y: 37.5, z: s * 16.5 }, 0.5))
  g.add(rbox(120, 4, 42, wood, { y: 44 }, 1))
  for (let k = 0; k < 5; k++) g.add(rbox(105.4, 2, 5.6, shade(wood, k % 2 ? -0.04 : 0), { y: 10, z: -13.2 + k * 6.6 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(3, 3, 30, wood, { x: s * 52.5, y: 7 }, 0.5))
  // 叠好的被子
  g.add(rbox(56, 5, 36, quiltA, { x: -24, y: 48 }, 2))
  g.add(paintPanel(54, 4, `sw-qb-${quiltA}-${quiltB}`, paintPatchwork(quiltA, quiltB), { x: -24, y: 48.5, z: 18.35 }))
  g.add(rbox(54, 5, 35, quiltB, { x: -24, y: 53 }, 2))
  g.add(rbox(52, 4.4, 34, FH.cream, { x: -24, y: 58 }, 2))
  return g
}

/** 砖石壁炉：毛石炉身、拱形炉口、粗木梁炉架 */
function stoneFireplace(p: string[]) {
  const [stone, beamC, hearth] = p
  const g = new THREE.Group()
  g.add(rbox(160, 5, 50, hearth, {}, 1))
  // 正面墙：拱门直接做成外轮廓上的一段缺口（Shape 里不放 hole 路径）。
  // 原来用 holePanel 的 arch 洞时，洞底 y=0 与板底重合，开 bevel 后三角化会把洞口填死；缺口并入外轮廓就不存在这个问题。
  const R = 38 // 拱洞半径（开口宽 76）
  const springLocal = 34 // 起拱线（板局部 y）：世界 y = 5 + 34 = 39
  const wallW = 150
  const wallH = 115
  const wallT = 34
  const shape = new THREE.Shape()
  shape.moveTo(-wallW / 2, 0)
  shape.lineTo(-R, 0)
  shape.lineTo(-R, springLocal)
  shape.absarc(0, springLocal, R, Math.PI, 0, true)
  shape.lineTo(R, 0)
  shape.lineTo(wallW / 2, 0)
  shape.lineTo(wallW / 2, wallH)
  shape.lineTo(-wallW / 2, wallH)
  shape.lineTo(-wallW / 2, 0)
  const bevel = 0.4
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: wallT - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 20 })
  wallGeo.translate(0, 0, -wallT / 2 + bevel)
  const wall = new THREE.Mesh(wallGeo, toon(stone))
  wall.position.set(0, 5, -6)
  wall.castShadow = true
  wall.receiveShadow = true
  g.add(wall)
  // 炉膛：暗色内衬套筒（顺拱洞断面挤出，不用 bevel）+ 背板 + 炉底，把石墙的洞口断面盖住，开口才有纵深
  const soot = '#2e211b'
  const Ro = R - 0.2 // 套筒外壁，比石洞略小，避免和石头共面
  const Ri = R - 1.8 // 套筒内壁，形成 1.6cm 的暗色炉口边
  const lining = new THREE.Shape()
  lining.moveTo(-Ro, 0)
  lining.lineTo(Ro, 0)
  lining.lineTo(Ro, springLocal)
  lining.absarc(0, springLocal, Ro, 0, Math.PI, false)
  lining.lineTo(-Ro, 0)
  const liningHole = new THREE.Path()
  liningHole.moveTo(-Ri, 1.6)
  liningHole.lineTo(-Ri, springLocal)
  liningHole.absarc(0, springLocal, Ri, Math.PI, 0, true)
  liningHole.lineTo(Ri, 1.6)
  liningHole.lineTo(-Ri, 1.6)
  lining.holes.push(liningHole)
  const liningGeo = new THREE.ExtrudeGeometry(lining, { depth: 31.2, bevelEnabled: false, curveSegments: 20 })
  liningGeo.translate(0, 5, -20.8)
  const liner = new THREE.Mesh(liningGeo, toon(soot, { emissive: 0.18 }))
  liner.castShadow = true
  liner.receiveShadow = true
  g.add(liner)
  // 背板带一点暖色自发光，像被炉火映着，否则炉膛会读成一整块死黑，看不出进深
  const backer = rbox(74, 74, 2, '#3a2720', { y: 5, z: -21.4 }, 0.4)
  backer.material = toon('#3a2720', { emissive: 0.4 })
  g.add(backer)
  g.add(rbox(70, 1.8, 28, '#1c1411', { y: 5.4, z: -7 }, 0.4))
  // 毛石
  const rnd = (i: number) => Math.abs(Math.sin(i * 91.7 + 3.1) * 1000) % 1
  const inArch = (x: number, y: number) => Math.abs(x) < 42 && (y < 34 + 5 || Math.hypot(x, y - 34) < 42)
  let seed = 0
  for (let row = 0; row < 8; row++) {
    const y = 6 + row * 14
    let x = -75 + (row % 2 ? 9 : 0)
    if (row % 2) g.add(rbox(7.8, 12.6, 1.4, shade(stone, -0.04), { x: -71, y: y + 0.4, z: 11.3 }, 1.2))
    while (x < 75) {
      const w = 14 + rnd(seed++) * 12
      const x1 = Math.min(75, x + w)
      const cx = (x + x1) / 2
      const ok = !([[x + 1, 0], [x1 - 1, 0], [cx, 0], [x + 1, 12.6], [x1 - 1, 12.6], [cx, 12.6]] as P2[]).some(([px, py]) => inArch(px, y - 5 + py))
      if (ok && x1 - x > 5) g.add(rbox(x1 - x - 1.2, 12.6, 1.4, shade(stone, (rnd(seed++) - 0.5) * 0.16), { x: cx, y: y + 0.4, z: 11.3 }, 1.2))
      x = x1
    }
  }
  // 拱券石
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI
    const v = rbox(9, 6, 1.6, shade(stone, -0.08 + (k % 2) * 0.05), { x: Math.cos(a) * 41, y: 0, z: 11.4 }, 1)
    v.position.y = 5 + 34 + Math.sin(a) * 41
    v.rotation.z = a - Math.PI / 2
    g.add(v)
  }
  for (const s of [-1, 1]) g.add(rbox(8, 31, 2, shade(stone, -0.06), { x: s * 41, y: 5, z: 11.5 }, 1))
  // 柴火
  for (const s of [-1, 1]) g.add(rbox(2, 8, 18, IRON, { x: s * 20, y: 5, z: -8 }, 0.4))
  g.add(cylX(3.4, 46, '#7a5236', 0, 14, -12))
  g.add(cylX(3, 40, '#8a6040', 0, 14, -4))
  g.add(cylX(3, 40, '#6a4630', 0, 16.8, -8))
  // 余烬：炉底一层炭床 + 几块自发光碎炭（只加材质，不引入 fx / 粒子）
  const coal = rbox(42, 1.2, 18, '#6e2a12', { y: 7.2, z: -9 }, 0.8)
  coal.material = toon('#6e2a12', { emissive: 0.45 })
  g.add(coal)
  const emberMat = toon('#ff8a3d', { emissive: 1.8 })
  for (const [x, y, z, s] of [[-16, 8.4, -11, 3], [-6, 8.4, -6, 2.4], [4, 8.4, -13, 2.8], [14, 8.4, -7, 2.2], [-10, 7.2, 2, 2.6], [7, 7.2, 3, 2.2], [-1, 7.2, 4.5, 1.8]] as [number, number, number, number][]) {
    const m = rbox(s, s * 0.55, s * 0.9, '#ff8a3d', { x, y, z }, s * 0.3)
    m.material = emberMat
    g.add(m)
  }
  // 木梁炉架
  g.add(rbox(170, 12, 30, beamC, { y: 120 }, 1.4))
  for (let k = -3; k <= 3; k++) g.add(noOutlineDeep(rbox(18, 0.4, 0.3, shade(beamC, -0.15), { x: k * 22, y: 126, z: 15.05 }, 0.1)))
  return g
}

/** 木箱咖啡桌：板条箱身、带轮、下层可放东西 */
function crateCoffee(p: string[]) {
  const [wood, metal, dark] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 47
      const z = sz * 22
      g.add(rbox(7, 1.2, 7, metal, { x, y: 8.2, z }, 0.3))
      g.add(rbox(5, 4, 0.8, metal, { x, y: 4.4, z: z - 2.2 }, 0.2))
      g.add(rbox(5, 4, 0.8, metal, { x, y: 4.4, z: z + 2.2 }, 0.2))
      g.add(cylZ(3.6, 3, dark, x, 3.6, z, 16))
    }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 32.6, 4, shade(wood, -0.08), { x: sx * 51, y: 9.4, z: sz * 26 }, 0.6))
  g.add(rbox(106, 2, 56, wood, { y: 9.4 }, 0.5))
  for (let k = 0; k < 3; k++) {
    const y = 11.6 + k * 10.6
    for (const s of [-1, 1]) {
      g.add(rbox(98, 7.6, 1.8, shade(wood, (k - 1) * 0.04), { y, z: s * 27 }, 0.4))
      g.add(rbox(1.8, 7.6, 48, shade(wood, (1 - k) * 0.04), { x: s * 52, y }, 0.4))
    }
  }
  for (let i = 0; i < 5; i++) g.add(rbox(110, 3, 11.8, shade(wood, (i % 3) * 0.035 - 0.03), { y: 42, z: -24 + i * 12 }, 0.6))
  return g
}

/** 梯子毯架：斜靠墙的梯子，横档上搭两条毯子 */
function blanketLadder(p: string[]) {
  const [wood, blanketA, blanketB] = p
  const g = new THREE.Group()
  const at = (t: number): [number, number] => [0.25 + t * 167, 14 - t * 26]
  for (const s of [-1, 1]) g.add(batten([s * 22, 0.25, 14], [s * 22, 167.25, -12], 4.4, 3, wood))
  for (const t of [0.18, 0.36, 0.54, 0.72, 0.9]) {
    const [y, z] = at(t)
    g.add(cylX(1.4, 40, wood, 0, y, z, 12))
  }
  const drape = (t: number, color: string, front: number, back: number, fringe: boolean) => {
    const [y, z] = at(t)
    g.add(rbox(36, 1.4, 5.2, color, { y: y + 1.2, z }, 0.6))
    g.add(rbox(36, front, 1.2, color, { y: y + 1.6 - front, z: z + 2.4 }, 0.5))
    g.add(rbox(36, back, 1.2, color, { y: y + 1.6 - back, z: z - 2.4 }, 0.5))
    g.add(noOutlineDeep(rbox(36.2, 3, 1.9, shade(color, -0.15), { y: y + 1.6 - front * 0.5, z: z + 2.4 }, 0.3)))
    if (fringe) for (let k = -8; k <= 8; k++) g.add(cyl(0.3, 0.3, 2.4, shade(color, -0.1), { x: k * 2.1, y: y + 1.6 - front - 2.2, z: z + 2.4 }, 4))
  }
  drape(0.72, blanketA, 40, 24, true)
  drape(0.36, blanketB, 28, 18, false)
  return centerGroup(g)
}

/** 草编篮层架：三层木架，下两层各放两只草编篮（篮里叠着毛巾） */
function basketShelf(p: string[]) {
  const [wood, basket, cloth] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(3, 82.5, 34, wood, { x: s * 33.5 }, 0.8))
  for (const y of [4, 32, 60]) g.add(rbox(64.4, 2, 33, wood, { y }, 0.5))
  g.add(rbox(70, 2.5, 35, wood, { y: 82.5 }, 0.8))
  g.add(rbox(64.4, 4, 1.6, wood, { y: 76, z: -16 }, 0.4))
  for (const y of [6, 34])
    for (const s of [-1, 1]) {
      const x = s * 15.8
      g.add(tray(30, 22, 28, 1.2, basket, { x, y, z: 1 }, 0.8))
      for (let k = 0; k < 4; k++) g.add(noOutlineDeep(rbox(30.4, 1, 0.4, shade(basket, -0.14), { x, y: y + 3.5 + k * 5, z: 15.2 }, 0.2)))
      for (const t of [-1, 1]) g.add(noOutlineDeep(torus(3, 0.5, shade(basket, -0.1), { x: x + t * 15.2, y: y + 17, z: 1, ry: Math.PI / 2 }, Math.PI)))
      g.add(rbox(24, 12, 22, cloth, { x, y: y + 1.2, z: 1 }, 2))
    }
  return g
}

/** 铸铁灯笼落地灯：铸铁底座 + 立杆，顶上一盏马车灯笼 */
function ironLanternLamp(p: string[]) {
  const [metal, glow, accent] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [19, 0], [18, 2], [11, 4.4], [6, 7], [3, 12], [2.2, 14], [0, 14]], metal, {}, 24))
  g.add(cyl(1.6, 1.6, 106, metal, { y: 14 }, 12))
  g.add(torus(2.2, 0.6, accent, { y: 70, rx: Math.PI / 2 }))
  const y0 = 120
  g.add(rbox(22, 2, 22, metal, { y: y0 }, 0.5))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.6, 28, 1.6, metal, { x: sx * 9.6, y: y0 + 2, z: sz * 9.6 }, 0.3))
  for (const [x, z, ry] of [[0, 9.6, 0], [0, -9.6, 0], [9.6, 0, Math.PI / 2], [-9.6, 0, Math.PI / 2]] as number[][]) {
    const gl = glassPane(17.6, 26, 0.4, { x, y: y0 + 2, z })
    gl.rotation.y = ry
    g.add(gl)
  }
  g.add(cyl(1.4, 1.4, 6, accent, { y: y0 + 2 }, 10))
  g.add(lit(ball(3, glow, { y: y0 + 11 }, [1, 1.3, 1]), glow, 0.9))
  g.add(rbox(23, 1.6, 23, metal, { y: y0 + 30 }, 0.4))
  g.add(cyl(1.6, 16, 9, metal, { y: y0 + 31.6, ry: Math.PI / 4 }, 4))
  g.add(torus(2.2, 0.6, metal, { y: y0 + 43.4 }))
  g.add(ball(1.6, accent, { y: y0 + 41.2 }))
  return g
}

/** 旧木货架：黑铁角钢框 + 交叉拉杆，几块颜色不一的旧木板 */
const RS = { w: 120, d: 40, levels: [10, 52, 94, 136, 176] }
function reclaimedShelf(p: string[]) {
  const [wood, metal, accent] = p
  const { w, d, levels } = RS
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(3, 180, 3, metal, { x: sx * (w / 2 - 1.5), z: sz * (d / 2 - 1.5) }, 0.4))
    for (const y of levels) g.add(rbox(3, 3, d - 6 + 0.4, metal, { x: sx * (w / 2 - 1.5), y: y - 3 }, 0.4))
    // 侧面交叉拉杆
    for (let i = 0; i < levels.length - 1; i++) {
      const ya = levels[i] + 1
      const yb = levels[i + 1] - 4
      g.add(rod3([sx * (w / 2 - 1.5), ya, -(d / 2 - 3)], [sx * (w / 2 - 1.5), yb, d / 2 - 3], 0.5, metal, 6))
      g.add(rod3([sx * (w / 2 - 1.5), ya, d / 2 - 3], [sx * (w / 2 - 1.5), yb, -(d / 2 - 3)], 0.5, metal, 6))
    }
  }
  // 背面交叉拉杆
  for (let i = 0; i < levels.length - 1; i += 2) {
    const ya = levels[i] + 1
    const yb = levels[i + 1] - 4
    g.add(rod3([-(w / 2 - 3), ya, -(d / 2 - 1.5)], [w / 2 - 3, yb, -(d / 2 - 1.5)], 0.5, metal, 6))
    g.add(rod3([w / 2 - 3, ya, -(d / 2 - 1.5)], [-(w / 2 - 3), yb, -(d / 2 - 1.5)], 0.5, metal, 6))
  }
  const tones = [wood, shade(wood, -0.08), shade(wood, 0.06), shade(wood, -0.03), shade(wood, 0.03)]
  levels.forEach((y, i) => {
    for (let k = 0; k < 2; k++) g.add(rbox(w - 6, 4, d / 2, shade(tones[i], k ? -0.04 : 0), { y, z: (k ? 1 : -1) * (d / 4) }, 0.6))
  })
  for (const sx of [-1, 1]) g.add(noOutlineDeep(cylZ(1, 0.6, accent, sx * (w / 2 - 1.5), 120, d / 2 + 0.1, 8)))
  return g
}
function reclaimedSurfaces() {
  const { w, d, levels } = RS
  return levels.slice(0, -1).map((y, i) => ({ y: y + 4, shape: [r(-(w / 2 - 3), -(d / 2 - 0.2), w / 2 - 3, d / 2 - 0.2)], h: levels[i + 1] - 3 - (y + 4) }))
}

/** 做旧皮革单人沙发：卷边扶手、铜钉滚边、圆包脚 */
function leatherClub(p: string[]) {
  const [leather, nail, wood] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(lathe([[0, 0], [3.4, 0], [4.2, 3], [3.6, 6], [2.6, 8.4], [0, 8.4]], wood, { x: sx * 36, z: sz * 33 }, 16))
  g.add(rbox(88, 28, 82, leather, { y: 8 }, 4))
  for (const s of [-1, 1]) {
    g.add(rbox(16, 32, 84, leather, { x: s * 36, y: 22 }, 5))
    g.add(cylZ(9, 86, leather, s * 37, 54, 0, 20))
    for (let k = -4; k <= 4; k++) g.add(ball(0.8, nail, { x: s * 37 + k * 1.95, y: 46 + Math.cos((k / 4) * 1.2) * 8, z: 43.1 }))
  }
  for (let k = -10; k <= 10; k++) g.add(ball(0.8, nail, { x: k * 4, y: 11, z: 41.1 }))
  g.add(rbox(88, 46, 16, leather, { y: 22, z: -33 }, 6))
  g.add(cylX(8, 88, leather, 0, 66, -33, 20))
  g.add(rbox(55, 12, 62, leather, { y: 36, z: 6 }, 4))
  g.add(rbox(53, 30, 10, leather, { y: 46, z: -21, rx: -0.12 }, 4))
  return g
}

/** 做旧书柜：豆腐板背板、檐口线脚、底座 */
const FB = { w: 82, d: 30, levels: [8, 50, 92, 134], top: 174 }
function farmBookcase(p: string[]) {
  const [body, back, accent] = p
  const { w, d, levels, top } = FB
  const g = new THREE.Group()
  g.add(rbox(w + 2, 8, d + 1, body, {}, 0.8))
  for (const s of [-1, 1]) g.add(rbox(2.5, top - 8, d, body, { x: s * (w / 2 - 1.25), y: 8 }, 0.6))
  for (const y of levels) g.add(rbox(w - 5 + 0.4, 2, d - 2, body, { y, z: 0.6 }, 0.4))
  g.add(rbox(w - 5 + 0.4, 2, d - 2, body, { y: top - 2, z: 0.6 }, 0.4))
  g.add(rbox(w + 3, 4, d + 2.5, body, { y: top }, 0.8))
  g.add(rbox(w + 5, 2, d + 4, shade(body, -0.05), { y: top + 4 }, 0.6))
  g.add(rbox(w - 5 + 0.4, top - 10, 1.2, back, { y: 9, z: -d / 2 + 0.8 }, 0.3))
  for (let x = -(w / 2 - 7); x <= w / 2 - 6; x += 6.5) g.add(noOutlineDeep(rbox(0.5, top - 12, 0.3, shade(back, -0.1), { x, y: 10, z: -d / 2 + 1.55 }, 0.1)))
  // 做旧：边角磨出底色
  for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(0.6, 10, 0.3, accent, { x: s * (w / 2 - 0.9), y: 60, z: d / 2 + 0.05 }, 0.1)))
  return g
}
function farmBookSurfaces() {
  const { w, d, levels, top } = FB
  return levels.map((y, i) => ({ y: y + 2, shape: [r(-(w / 2 - 2.6), -d / 2 + 1.6, w / 2 - 2.6, d / 2)], h: (i + 1 < levels.length ? levels[i + 1] : top - 2) - y - 2 }))
}

/** 格纹狗床：三面圆枕 + 软垫 */
function plaidDogBed(p: string[]) {
  const [fabric, cushion, base] = p
  const g = new THREE.Group()
  g.add(rbox(88, 7, 68, base, {}, 3))
  g.add(cylX(8, 72, fabric, 0, 15, -26))
  for (const s of [-1, 1]) {
    g.add(cylZ(8, 52, fabric, s * 36, 15, 0, 16))
    g.add(ball(8, fabric, { x: s * 36, y: 15, z: -26 }))
    g.add(ball(8, fabric, { x: s * 36, y: 15, z: 26 }))
  }
  g.add(cylX(5, 64, fabric, 0, 10, 29))
  g.add(rbox(62, 5, 46, cushion, { y: 6.6, z: 3 }, 2.4))
  return g
}

/** X 背餐椅：后腿上延，背上交叉撑，灯芯草编座 */
function xbackChair(p: string[]) {
  const [wood, seat, dark] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(3.6, 44, 3.6, wood, { x: s * 19.5, z: 19.5 }, 0.6))
    g.add(batten([s * 19.5, 0, -19], [s * 19.5, 88, -21.5], 3.6, 3.6, wood))
    g.add(rbox(2.4, 2.4, 36, dark, { x: s * 19.5, y: 14 }, 0.5))
  }
  const zAt = (y: number) => -19 - 2.5 * (y / 88)
  g.add(rbox(36, 7, 2.6, wood, { y: 80, z: zAt(83.5) }, 0.6))
  g.add(rbox(36, 3, 2.2, wood, { y: 50, z: zAt(51.5) }, 0.5))
  g.add(batten([-17, 53, zAt(53)], [17, 80, zAt(80)], 2.6, 1.8, wood))
  g.add(batten([17, 53, zAt(53)], [-17, 80, zAt(80)], 2.6, 1.8, wood))
  g.add(rbox(44, 4, 42, wood, { y: 42 }, 1))
  g.add(rbox(38, 1.6, 35, seat, { y: 45.6 }, 0.6))
  for (let k = -3; k <= 3; k++) g.add(noOutlineDeep(rbox(0.6, 0.3, 34, shade(seat, -0.15), { x: k * 5, y: 47.2 }, 0.1)))
  g.add(rbox(36, 2.4, 2.4, dark, { y: 10, z: 19.5 }, 0.5))
  return g
}

/** 农舍床头柜：漆色柜身 + 原木面，一抽 + 下层板 */
function fhNightstand(p: string[]) {
  const [top, body, pull] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3.4, 54, 3.4, body, { x: sx * 19.3, z: sz * 15.3 }, 0.6))
  g.add(hollow(41, 18, 33, body, { y: 36 }, 1.6))
  g.add(drawerOf([rbox(36, 14, 1, shade(body, -0.04), { y: 38, z: 16.8 }, 0.5), torus(2.4, 0.6, pull, { y: 46.6, z: 17.6 }, Math.PI)], -18, 18, 38, 14, 16.3, 30, shade(body, 0.05)))
  g.add(rbox(38.6, 2, 30.6, body, { y: 12 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(35.2, 3, 1.6, body, { y: 30, z: s * 15.3 }, 0.4))
  g.add(rbox(46, 3, 38, top, { y: 54 }, 1))
  return g
}

// =====================================================================
// 和风补充
// =====================================================================

/** 肘掛け座椅子：底座 + 厚坐垫 + 后仰靠背，两侧木扶手 */
function armZaisu(p: string[]) {
  const [fabric, frame, wood] = p
  const g = new THREE.Group()
  g.add(rbox(54, 4, 58, frame, {}, 1.5))
  g.add(rbox(48, 9, 50, fabric, { y: 4, z: 3 }, 4))
  const bk = new THREE.Group()
  bk.add(rbox(48, 50, 9, fabric, { z: 4.5 }, 4))
  bk.add(rbox(46, 48, 2, frame, { y: 1, z: -0.6 }, 0.8))
  bk.position.set(0, 4, -24)
  bk.rotation.x = -0.32
  g.add(bk)
  for (const s of [-1, 1]) {
    g.add(rbox(5, 2.6, 42, wood, { x: s * 26.5, y: 22, z: -2 }, 1))
    g.add(rbox(3.6, 18, 3.6, wood, { x: s * 26.5, y: 4, z: 15 }, 0.8))
    g.add(rbox(3.6, 18, 3.6, wood, { x: s * 26.5, y: 4, z: -18 }, 0.8))
    g.add(rbox(3, 2.4, 30, wood, { x: s * 26.5, y: 4, z: -1.5 }, 0.6))
  }
  return centerGroup(g)
}

/** 一枚板座卓：自然边厚实木板 + 两片拱形板脚 */
function zatakuPoly(): Poly {
  const pts: Poly = []
  const n = 20
  for (let i = 0; i <= n; i++) {
    const x = -75 + (150 * i) / n
    pts.push([x, 40.6 + 1.6 * Math.sin(i * 1.3) * Math.sin((i / n) * Math.PI)])
  }
  for (let i = n; i >= 0; i--) {
    const x = -75 + (150 * i) / n
    pts.push([x, -40.6 - 1.6 * Math.sin(i * 1.9 + 1) * Math.sin((i / n) * Math.PI)])
  }
  return pts
}
function ichimaiZataku(p: string[]) {
  const [wood, leg, edge] = p
  const g = new THREE.Group()
  g.add(slabY(zatakuPoly(), 6, wood, 28))
  for (let k = -2; k <= 2; k++) g.add(noOutlineDeep(rbox(110 - Math.abs(k) * 14, 0.3, 0.6, shade(wood, -0.1), { x: k * 6, y: 34, z: k * 13, ry: 0.04 * k }, 0.1)))
  const legOutline: P2[] = [[-31, 0], [-18, 0], ...Array.from({ length: 11 }, (_, i) => { const a = Math.PI - (i / 10) * Math.PI; return [Math.cos(a) * 18, Math.sin(a) * 17] as P2 }).slice(1, -1), [18, 0], [31, 0], [31, 28], [-31, 28]]
  for (const s of [-1, 1]) g.add(sidePrism(legOutline, 6, leg, s * 52))
  g.add(noOutlineDeep(rbox(140, 1.2, 0.6, edge, { y: 30.5, z: 39.2 }, 0.2)))
  return g
}

/** 車箪笥：铁饰抽屉 + 拉门，底下四只木轮；拉门里一块层板 */
function kurumaDansu(p: string[]) {
  const [wood, iron, wheel] = p
  const g = new THREE.Group()
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cylZ(7, 4, wheel, sx * 38, 7, sz * 20, 20))
      g.add(cylZ(2, 4.8, iron, sx * 38, 7, sz * 20, 10))
    }
  g.add(rbox(100, 5, 46, shade(wood, -0.12), { y: 9 }, 0.8))
  g.add(hollow(100, 78, 46, wood, { y: 14 }, 1.6, inner))
  g.add(rbox(1.6, 74.8, 44, wood, { x: -1.2, y: 15.6, z: 0.8 }, 0.3))
  g.add(rbox(48.4, 1.6, 44, inner, { x: 24, y: 50.4, z: 0.8 }, 0.3))
  g.add(rbox(102, 3, 48, wood, { y: 92 }, 1))
  // 左：三层抽屉
  for (let k = 0; k < 3; k++) {
    const y = 16 + k * 25
    const front: THREE.Object3D[] = [rbox(47, 23, 1.2, shade(wood, 0.04), { x: -25, y, z: 23.3 }, 0.5), rbox(10, 6, 0.4, iron, { x: -25, y: y + 13, z: 24.1 }, 0.3), torus(2.8, 0.5, iron, { x: -25, y: y + 11, z: 24.5 }, Math.PI * 2)]
    for (const s of [-1, 1]) front.push(noOutlineDeep(rbox(4, 4, 0.3, iron, { x: -25 + s * 21.4, y: y + 0.4, z: 24.05 }, 0.1)))
    g.add(drawerOf(front, -48.5, -1.5, y, 23, 22.7, 42, inner))
  }
  // 右：两扇拉门（后轨固定，前轨带锁板推到左边）
  g.add(rbox(25, 73, 0.9, shade(wood, 0.04), { x: 11.5, y: 16.5, z: 23.3 }, 0.4))
  g.add(slideDoor([rbox(25, 73, 0.9, shade(wood, 0.04), { x: 36, y: 16.5, z: 24.2 }, 0.4), rbox(8, 12, 0.4, iron, { x: 23, y: 48, z: 24.9 }, 0.3), ball(1.2, iron, { x: 23, y: 54, z: 25.2 })], -24.5))
  for (const s of [-1, 1]) for (const y of [14.6, 89.6]) g.add(noOutlineDeep(rbox(6, 2.4, 0.4, iron, { x: s * 47, y, z: 23.2 }, 0.1)))
  return g
}
const KURUMA_SURFACES: SurfaceDef[] = [
  ...[0, 1, 2].map((k) => drawerLv(-48.5, -1.5, 16 + k * 25, 23, 22.7, 42)),
  { y: 15.6, h: 33.2, inside: true, shape: [r(0.6, -21.4, 47.8, 22)] },
  { y: 52, h: 36.8, inside: true, shape: [r(0.6, -21.4, 47.8, 22)] },
]

/** 丸行灯：三足圆筒纸灯，顶上提梁 */
function maruAndon(p: string[]) {
  const [paper, wood, dark] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(rod3([Math.sin(a) * 15, 0.9, Math.cos(a) * 15], [Math.sin(a) * 14, 76, Math.cos(a) * 14], 0.9, wood))
    g.add(ball(1.2, dark, { x: Math.sin(a) * 15, y: 1.2, z: Math.cos(a) * 15 }))
  }
  g.add(cyl(14, 14, 2, wood, { y: 12 }, 32))
  g.add(lit(cyl(13, 13, 58, paper, { y: 15 }, 32), paper, 0.5))
  for (const y of [15, 44, 73]) g.add(torus(13.6, 0.7, wood, { y, rx: Math.PI / 2 }))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    g.add(noOutlineDeep(cyl(0.2, 0.2, 57, shade(paper, -0.12), { x: Math.sin(a) * 13.05, y: 15.5, z: Math.cos(a) * 13.05 }, 4)))
  }
  g.add(torus(14, 0.8, wood, { y: 76, rx: Math.PI / 2 }))
  g.add(cappedTube([[-14, 76, 0], [-12, 84, 0], [0, 88, 0], [12, 84, 0], [14, 76, 0]], 0.9, wood, { ...TUBE, caps: false }))
  return centerGroup(g)
}

/** 障子三折屏：组子格心 + 和纸，下部腰板 */
function shojiScreen(p: string[]) {
  const [frame, paper, koshi] = p
  const g = new THREE.Group()
  const PW = 52
  const PH = 168
  const a = 0.42
  let px = 0
  let pz = 0
  for (let i = 0; i < 3; i++) {
    const ang = i % 2 ? -a : a
    const panel = new THREE.Group()
    for (const s of [-1, 1]) panel.add(rbox(3, PH, 2.6, frame, { x: s * (PW / 2 - 1.5), y: 2 }, 0.5))
    for (const y of [2, 20, PH - 1]) panel.add(rbox(PW - 6 + 0.4, 3, 2.4, frame, { y }, 0.5))
    panel.add(rbox(PW - 5.8, 15, 1.4, koshi, { y: 4.8 }, 0.3))
    panel.add(holePanel(PW - 5.8, PH - 24 + 0.4, 1.2, frame, lattice(PW - 5.8, PH - 23.6, 3, 7, 1.2, 0.4), { y: 22.8 }))
    const w = rbox(PW - 6, PH - 24, 0.4, paper, { y: 23, z: -0.9 }, 0.1)
    w.material = toon(paper, { emissive: 0.12 })
    panel.add(w)
    for (const s of [-1, 1]) panel.add(rbox(4, 2, 10, frame, { x: s * (PW / 2 - 2) }, 0.5))
    const dx = Math.cos(ang)
    const dz = -Math.sin(ang)
    panel.rotation.y = ang
    panel.position.set(px + (dx * PW) / 2, 0, pz + (dz * PW) / 2)
    g.add(panel)
    px += dx * (PW + 0.4)
    pz += dz * (PW + 0.4)
  }
  return centerGroup(g)
}

/** 置き床：可移动的床之间台，黑漆床框 */
function okidoko(p: string[]) {
  const [board, frame, accent] = p
  const g = new THREE.Group()
  g.add(rbox(116, 10, 41, shade(board, -0.1), { y: 0.4, z: -1 }, 0.8))
  g.add(rbox(116, 2.6, 41, board, { y: 10, z: -1 }, 0.6))
  g.add(rbox(122, 13, 4, frame, { z: 20.5 }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(3, 13, 41, frame, { x: s * 59.5, z: -2 }, 0.8))
  g.add(noOutlineDeep(rbox(30, 0.6, 0.4, accent, { y: 6, z: 22.6 }, 0.1)))
  return g
}

/** 違い棚：下地袋 + 交错两层搁板（海老束相连）+ 上天袋 */
function chigaidana(p: string[]) {
  const [wood, door, dark] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(2.4, 110, 36, wood, { x: s * 43.8 }, 0.6))
  g.add(rbox(85.2, 109, 1.2, shade(wood, -0.06), { y: 0.5, z: -17.2 }, 0.3))
  g.add(rbox(85.2, 2, 34.4, wood, { y: 1.5, z: 0.4 }, 0.4))
  g.add(rbox(85.2, 2.4, 34.8, wood, { y: 30, z: 0.4 }, 0.5))
  // 地袋：两扇拉门，前轨那扇推到右边
  for (const [x, z] of [[-21.2, 17.2], [21.2, 16.2]] as P2[]) {
    const parts = [rbox(42.2, 26, 0.9, door, { x, y: 3.8, z }, 0.3), noOutlineDeep(cylZ(1.6, 0.4, dark, x + (x < 0 ? 16 : -16), 16.8, z + 0.6, 12))]
    if (x < 0) g.add(slideDoor(parts, 42.4))
    else for (const o of parts) g.add(o)
  }
  g.add(rbox(44, 2.2, 32, wood, { x: -20.6, y: 62, z: 0.5 }, 0.5))
  g.add(rbox(44, 2.2, 32, wood, { x: 21.6, y: 74, z: 0.5 }, 0.5))
  g.add(rbox(2, 9.8, 2, dark, { x: 0.5, y: 64.2, z: 8 }, 0.4))
  g.add(prism([[-42.6, 64.2], [-40, 64.2], [-40, 66.2], [-42.6, 67.4]], 30, dark, 0.5))
  g.add(prism([[43.6, 76.2], [41, 76.2], [41, 78.2], [43.6, 79.4]], 30, dark, 0.5))
  g.add(rbox(85.2, 2, 34.4, wood, { y: 88, z: 0.4 }, 0.4))
  // 天袋：同样两扇拉门
  for (const [x, z] of [[-21.2, 17.2], [21.2, 16.2]] as P2[]) {
    const parts = [rbox(42.2, 19.6, 0.9, door, { x, y: 90.2, z }, 0.3), noOutlineDeep(cylZ(1.4, 0.4, dark, x + (x < 0 ? 16 : -16), 100, z + 0.6, 12))]
    if (x < 0) g.add(slideDoor(parts, 42.4))
    else for (const o of parts) g.add(o)
  }
  g.add(rbox(90, 2.4, 37, wood, { y: 110 }, 0.6))
  return g
}

/** 坐禅蒲团：方座布团 + 圆坐蒲（带褶） */
function zafuSet(p: string[]) {
  const [zabuton, zafu, tassel] = p
  const g = new THREE.Group()
  g.add(rbox(60, 7, 60, zabuton, {}, 3))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(1.4, tassel, { x: sx * 28.5, y: 3.5, z: sz * 28.5 }))
  g.add(puck(18, 14, zafu, { y: 6.6 }))
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    g.add(noOutlineDeep(rbox(0.6, 9, 0.6, shade(zafu, -0.15), { x: Math.sin(a) * 17.9, y: 9, z: Math.cos(a) * 17.9, ry: a }, 0.2)))
  }
  g.add(ball(1.2, tassel, { y: 20.6 }))
  return g
}

/** 和风床头柜：桐木柜身，两抽 + 上层开放格，环形把手 */
function jpNightstand(p: string[]) {
  const [kiri, kan, dark] = p
  const g = new THREE.Group()
  g.add(rbox(42, 4, 32, dark, {}, 0.6))
  for (const s of [-1, 1]) g.add(rbox(2, 40, 34, kiri, { x: s * 21, y: 4 }, 0.5))
  g.add(rbox(44, 2, 34, kiri, { y: 44 }, 0.6))
  g.add(rbox(40.4, 39.6, 1, shade(kiri, -0.06), { y: 4.2, z: -16.4 }, 0.3))
  g.add(rbox(40.4, 2, 33, kiri, { y: 28, z: 0.4 }, 0.4))
  for (const y of [4.6, 16.4]) g.add(drawerOf([rbox(39, 11, 1, shade(kiri, 0.03), { y, z: 16.4 }, 0.4), rbox(6, 2.6, 0.4, kan, { y: y + 7.2, z: 17.1 }, 0.2), torus(2.2, 0.45, kan, { y: y + 5.2, z: 17.6 }, Math.PI * 2)], -19.5, 19.5, y, 11, 15.9, 30, shade(kiri, 0.05)))
  return g
}

// =====================================================================
// 工业风补充
// =====================================================================

const CHROME = '#d0d5db'

/** 铁管书架：黑铁水管立柱 + 法兰 + 实木层板 */
const PB = { w: 80, d: 30, levels: [8, 50, 92, 134, 176] }
function pipeBookshelf(p: string[]) {
  const [wood, pipeC, fit] = p
  const { w, d, levels } = PB
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 4)
      const z = sz * (d / 2 - 4)
      g.add(cyl(3, 3, 1, pipeC, { x, z }, 16))
      g.add(cyl(1.6, 1.6, 176, pipeC, { x, z }, 12))
      for (const y of levels) g.add(cyl(2.4, 2.4, 2.6, fit, { x, y: y - 2.6, z }, 12))
      g.add(cyl(2.4, 2.4, 2, fit, { x, y: 179, z }, 12))
    }
  levels.forEach((y, i) => g.add(rbox(w, 3, d, shade(wood, (i % 2) * -0.05), { y }, 0.6)))
  return g
}
function pipeSurfaces() {
  const { w, d, levels } = PB
  return levels.slice(0, -1).map((y, i) => ({ y: y + 3, shape: [r(-w / 2, -d / 2, w / 2, d / 2)], h: levels[i + 1] - 2.6 - y - 3 }))
}

/** 三门铁皮更衣柜：百叶通风孔、号码牌、把手；每格一块顶层板 */
function locker3(p: string[]) {
  const [metal, plate, dark] = p
  const g = new THREE.Group()
  const inner = shade(metal, 0.06)
  g.add(rbox(88, 6, 43, dark, {}, 0.6))
  g.add(hollow(90, 174, 45, metal, { y: 6 }, 1.2, inner))
  for (const s of [-1, 1]) g.add(rbox(1.2, 171.6, 43.8, metal, { x: s * 14.7, y: 7.2, z: 0.6 }, 0.2))
  for (let i = 0; i < 3; i++) g.add(rbox(28, 1.2, 43, inner, { x: (i - 1) * 29.4, y: 148.8, z: 0.6 }, 0.2))
  g.add(rbox(90, 3, 1, metal, { y: 6, z: 22 }, 0.3))
  g.add(rbox(90, 3, 1, metal, { y: 177, z: 22 }, 0.3))
  g.add(rbox(91, 2, 46, shade(metal, -0.1), { y: 180 }, 0.6))
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 29.4
    const parts: THREE.Object3D[] = [rbox(28.4, 168, 1, shade(metal, 0.04), { x, y: 9, z: 22.9 }, 0.4)]
    for (const y0 of [150, 18]) for (let k = 0; k < 5; k++) parts.push(noOutlineDeep(rbox(16, 0.8, 0.4, dark, { x, y: y0 + k * 2.2, z: 23.55 }, 0.1)))
    parts.push(noOutlineDeep(rbox(6, 3.4, 0.4, plate, { x, y: 138, z: 23.55 }, 0.2)))
    parts.push(rbox(1.8, 12, 2, dark, { x: x + 10, y: 86, z: 24 }, 0.5))
    parts.push(torus(1.2, 0.35, plate, { x: x + 10, y: 85, z: 25.2 }, Math.PI * 2))
    g.add(swingDoor(parts, x - 14.2, 22.4, 'left'))
  }
  return g
}
const LOCKER_SURFACES: SurfaceDef[] = [r(-43.8, -21.3, -15.3, 21.4), r(-14.1, -21.3, 14.1, 21.4), r(15.3, -21.3, 43.8, 21.4)].flatMap((shape): SurfaceDef[] => [
  { y: 7.2, h: 141, inside: true, shape: [shape] },
  { y: 150, h: 28.6, inside: true, shape: [shape] },
])

/** 焊接工作台：角钢框、厚木台面、下层钢板，后角装台钳 */
function weldBench(p: string[]) {
  const [top, frame, vise] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(4, 84, 0.6, frame, { x: sx * 72, z: sz * 32.7 }, 0.2))
      g.add(rbox(0.6, 84, 4, frame, { x: sx * 73.7, z: sz * 31 }, 0.2))
      g.add(rbox(6, 0.6, 6, frame, { x: sx * 72, z: sz * 31 }, 0.2))
    }
  for (const s of [-1, 1]) {
    g.add(rbox(144, 4, 2, frame, { y: 80, z: s * 32 }, 0.4))
    g.add(rbox(2, 4, 62, frame, { x: s * 72.5, y: 80 }, 0.4))
    g.add(rbox(144, 3, 2, frame, { y: 14, z: s * 32 }, 0.4))
  }
  g.add(rbox(142, 1.4, 62, shade(frame, 0.15), { y: 16 }, 0.3))
  g.add(rbox(150, 6, 70, top, { y: 84 }, 0.8))
  for (let x = -60; x <= 60; x += 15) g.add(noOutlineDeep(rbox(0.4, 0.3, 69, shade(top, -0.1), { x, y: 90 }, 0.1)))
  // 台钳
  g.add(rbox(16, 4, 12, vise, { x: 60, y: 90, z: -24 }, 0.8))
  g.add(rbox(16, 8, 3, vise, { x: 60, y: 94, z: -17 }, 0.6))
  g.add(rbox(16, 8, 3, vise, { x: 60, y: 94, z: -6 }, 0.6))
  g.add(cylZ(1, 14, IRON, 60, 97, -9, 10))
  g.add(cylX(0.6, 12, IRON, 60, 97, -2, 8))
  return g
}

/** 铆钉皮革单椅：钢板侧架开窗、皮坐垫靠背、一排铆钉 */
function rivetChair(p: string[]) {
  const [leather, metal, rivet] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(holePanel(66, 52, 2.4, metal, [{ kind: 'rect', x: 0, y: 10, w: 50, h: 30, r: 4 }], { x: s * 31, ry: Math.PI / 2 }))
    g.add(rbox(8, 4, 66, leather, { x: s * 31, y: 52 }, 1.6))
    for (let k = -6; k <= 6; k++) g.add(ball(0.6, rivet, { x: s * 32.3, y: 46, z: k * 4.6 }))
    for (let k = -6; k <= 6; k++) g.add(ball(0.6, rivet, { x: s * 32.3, y: 5, z: k * 4.6 }))
  }
  g.add(rbox(59.6, 6, 62, metal, { y: 22 }, 0.8))
  g.add(rbox(58, 12, 58, leather, { y: 28, z: 3 }, 4))
  const bk = rbox(58, 44, 12, leather, { y: 30, z: -25 }, 5)
  bk.rotation.x = -0.12
  g.add(bk)
  for (let k = -5; k <= 5; k++) g.add(ball(0.6, rivet, { x: k * 5, y: 39.6, z: 32 }))
  return g
}

/** 爱迪生灯泡落地灯：水管三脚架、阀门手轮、弯头吊下一只笼罩灯泡 */
function edisonLamp(p: string[]) {
  const [pipeC, valve, bulbC] = p
  const g = new THREE.Group()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    g.add(rod3([Math.sin(a) * 17, 1.4, Math.cos(a) * 17], [0, 58, 0], 1.4, pipeC))
    g.add(cyl(2.2, 2.2, 1.6, pipeC, { x: Math.sin(a) * 17, z: Math.cos(a) * 17 }, 12))
  }
  g.add(cyl(2.4, 2.4, 6, pipeC, { y: 56 }, 12))
  g.add(cyl(1.5, 1.5, 92, pipeC, { y: 60 }, 12))
  g.add(cyl(2.2, 2.2, 3, pipeC, { y: 100 }, 12))
  g.add(cylX(2.2, 4, pipeC, 2.6, 101.5, 0, 12))
  g.add(torus(4.4, 0.6, valve, { x: 5, y: 101.5, ry: Math.PI / 2 }))
  for (let k = 0; k < 3; k++) g.add(rod3([5, 101.5, 0], [5, 101.5 + Math.cos((k / 3) * Math.PI * 2) * 4.2, Math.sin((k / 3) * Math.PI * 2) * 4.2], 0.4, valve, 6))
  g.add(ball(2.4, pipeC, { y: 152 }))
  g.add(cylX(1.5, 16, pipeC, 8, 152, 0, 12))
  g.add(ball(2.4, pipeC, { x: 16, y: 152 }))
  g.add(cyl(1.5, 1.5, 8, pipeC, { x: 16, y: 144 }, 12))
  g.add(cyl(2.2, 2.4, 5, '#8a6a3a', { x: 16, y: 139 }, 12))
  g.add(lit(ball(3.8, bulbC, { x: 16, y: 133.4 }, [1, 1.3, 1]), bulbC, 0.9))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    g.add(cappedTube([[16 + Math.sin(a) * 2.4, 139, Math.cos(a) * 2.4], [16 + Math.sin(a) * 5.6, 134, Math.cos(a) * 5.6], [16 + Math.sin(a) * 2, 127.6, Math.cos(a) * 2]], 0.3, pipeC, { ...TUBE, caps: false }))
  }
  g.add(torus(5.2, 0.35, pipeC, { x: 16, y: 134, rx: Math.PI / 2 }))
  return centerGroup(g)
}

/** 工具车：多抽屉推车，顶部托盘、两侧把手、万向轮 */
const TOOLCART_DRAWERS = [0, 1, 2, 3, 4].map((k) => ({ h: k < 2 ? 16 : 11, y: k < 2 ? 11 + k * 17 : 45 + (k - 2) * 12 }))
function toolCart(p: string[]) {
  const [body, handle, wheel] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 27
      const z = sz * 16
      g.add(rbox(6, 1, 6, CHROME, { x, y: 8.4, z }, 0.3))
      g.add(rbox(1, 5, 4, CHROME, { x: x - 2, y: 3.6, z }, 0.2))
      g.add(rbox(1, 5, 4, CHROME, { x: x + 2, y: 3.6, z }, 0.2))
      g.add(cylX(3.6, 3, wheel, x, 3.6, z, 16))
    }
  g.add(hollow(64, 70, 42, body, { y: 9.4 }, 1.2))
  for (const { h, y } of TOOLCART_DRAWERS) g.add(drawerOf([rbox(60, h, 1, shade(body, 0.05), { y, z: 21.3 }, 0.4), rbox(40, 1.4, 1.8, CHROME, { y: y + h - 3.4, z: 22.2 }, 0.5)], -30, 30, y, h, 20.8, 38, shade(body, 0.1)))
  g.add(tray(66, 6, 44, 1.2, shade(body, -0.06), { y: 79.4 }, 0.6))
  for (const s of [-1, 1]) {
    for (const z of [-14, 14]) g.add(cylX(0.9, 4, handle, s * 34, 72, z, 8))
    g.add(cylZ(1.2, 30, handle, s * 36, 72, 0, 12))
  }
  return g
}

/** 水泥台面边桌：黑钢方框腿、厚水泥板、下层木板 */
function concreteSide(p: string[]) {
  const [concrete, steel, wood] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 50, 2.4, steel, { x: sx * 20.3, z: sz * 20.3 }, 0.3))
  for (const s of [-1, 1]) {
    for (const y of [47.6, 10]) {
      g.add(rbox(38.2, 2.4, 2.4, steel, { y, z: s * 20.3 }, 0.3))
      g.add(rbox(2.4, 2.4, 38.2, steel, { x: s * 20.3, y }, 0.3))
    }
  }
  g.add(rbox(38.2, 1.8, 38.2, wood, { y: 12.4 }, 0.4))
  g.add(rbox(45, 5, 45, concrete, { y: 50 }, 0.8))
  for (const [x, z] of [[-12, -8], [6, 10], [14, -14], [-6, 15], [16, 4]] as P2[]) g.add(noOutlineDeep(cyl(0.5, 0.5, 0.2, shade(concrete, -0.2), { x, y: 55, z }, 8)))
  return g
}

/** 铸铁滚轮推车茶几：旧厂房推车改的矮桌，四只辐条铸铁轮 */
function factoryCart(p: string[]) {
  const [wood, iron, accent] = p
  const g = new THREE.Group()
  const WR = 15
  for (const sx of [-1, 1]) {
    g.add(cylZ(1.4, 66, iron, sx * 44, WR, 0, 10))
    for (const sz of [-1, 1]) {
      const z = sz * 32
      g.add(torus(WR - 1.4, 1.4, iron, { x: sx * 44, y: WR, z }))
      g.add(cylZ(3, 3, accent, sx * 44, WR, z, 14))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        g.add(rod3([sx * 44, WR, z], [sx * 44 + Math.cos(a) * (WR - 1.6), WR + Math.sin(a) * (WR - 1.6), z], 0.8, iron, 6))
      }
      g.add(rbox(10, 17.4, 1, iron, { x: sx * 44, y: WR, z: sz * 29 }, 0.3))
    }
  }
  for (const s of [-1, 1]) g.add(rbox(120, 4, 1.2, iron, { y: 32, z: s * 29.6 }, 0.3))
  for (let i = 0; i < 6; i++) g.add(rbox(118, 4.6, 10, shade(wood, ((i * 7) % 3) * 0.04 - 0.04), { y: 32.4, z: -25 + i * 10 }, 0.6))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(8, 1, 8, iron, { x: sx * 55, y: 37, z: sz * 25.4 }, 0.3))
  return g
}

/** 工业风床头柜：铁皮档案抽屉 + 木面 + 短钢脚 */
function inNightstand(p: string[]) {
  const [metal, label, wood] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 12.4, 2.4, IRON, { x: sx * 18.5, z: sz * 15.5 }, 0.3))
  g.add(hollow(40, 40, 34, metal, { y: 12 }, 1.2))
  g.add(rbox(37.6, 1.2, 33, shade(metal, 0.06), { y: 30.6, z: 0.5 }, 0.2))
  for (const y of [13.5, 32]) g.add(drawerOf([rbox(36, 17, 1, shade(metal, 0.05), { y, z: 17.3 }, 0.4), noOutlineDeep(rbox(8, 3, 0.4, label, { y: y + 12, z: 17.95 }, 0.2)), rbox(10, 1.6, 2, CHROME, { y: y + 7, z: 18.4 }, 0.5)], -18, 18, y, 17, 16.8, 30, shade(metal, 0.08)))
  g.add(rbox(42, 3, 36, wood, { y: 52 }, 0.8))
  return g
}

// =====================================================================
// 素材定义
// =====================================================================

type Extra = Partial<Omit<AssetDef, 'id' | 'name' | 'category' | 'w' | 'd' | 'h' | 'build' | 'palettes' | 'paletteStyles'>>
function D(id: string, name: string, category: AssetDef['category'], dims: [number, number, number], pals: Pal[], build: AssetDef['build'], extra: Extra = {}): AssetDef {
  // 统一在 xz 上居中（个别造型的拉手、雕花、斜靠让包围盒偏了 1~2cm）
  return withPals({ id, name, category, w: dims[0], d: dims[1], h: dims[2], build: (p) => centerGroup(build(p)), ...extra }, pals)
}

const HALF_MOON: Poly = [[-46, -17], ...Array.from({ length: 13 }, (_, i) => { const a = Math.PI - (i / 12) * Math.PI; return [Math.cos(a) * 46, -17 + Math.sin(a) * 35] as [number, number] }), [46, -17]]

/** 新中式 */
export const SW_CHINESE: AssetDef[] = [
  D('sw-cn-guanmao', '官帽椅', 'living', [61.6, 49.8, 107.9], [
    [ZH, CN.rose, CN.cane, CN.zitan],
    [ZH, CN.huali, CN.cane, CN.wenge],
    [ZH, CN.zitan, CN.lacquer, CN.wenge],
    [ZH, CN.wenge, CN.silk, CN.zitan],
    ['modern', M.black, M.light, M.char],
  ], guanmaoChair),
  D('sw-cn-taishi', '太师椅', 'living', [66, 50.5, 102], [
    [ZH, CN.rose, CN.lacquer, CN.zitan],
    [ZH, CN.zitan, CN.gold, CN.wenge],
    [ZH, CN.huali, CN.indigo, CN.wenge],
    [ZH, CN.wenge, CN.jade, CN.zitan],
  ], taishiChair),
  D('sw-cn-meigui', '玫瑰椅', 'dining', [46, 42, 81], [
    [ZH, CN.rose, CN.cane, CN.zitan],
    [ZH, CN.huali, CN.cane, CN.wenge],
    [ZH, CN.zitan, CN.silk, CN.wenge],
    ['japanese', J.wood, J.tatami, J.dark],
    ['modern', M.walnut, M.light, M.char],
  ], meiguiChair, { family: 'dining-chair', sizeLabel: '玫瑰椅' }),
  D('sw-cn-luohan', '罗汉床', 'living', [201.2, 95.9, 74.9], [
    [ZH, CN.rose, CN.lacquer, CN.zitan],
    [ZH, CN.huali, CN.celadon, CN.wenge],
    [ZH, CN.zitan, CN.gold, CN.wenge],
    [ZH, CN.wenge, CN.indigo, CN.zitan],
    ['modern', M.walnut, M.light, M.char],
  ], luohanBed),
  D('sw-cn-kang', '炕桌', 'living', [70, 42, 25.5], [
    [ZH, CN.rose, CN.zitan, CN.gold],
    [ZH, CN.huali, CN.wenge, CN.gold],
    [ZH, CN.lacquer, CN.ink, CN.gold],
    ['japanese', J.wood, J.dark, J.shu],
  ], kangTable, { prop: true, surface: 25.5 }),
  D('sw-cn-qiaotou', '翘头案', 'living', [171.2, 42, 88.5], [
    [ZH, CN.rose, CN.zitan, CN.rose],
    [ZH, CN.huali, CN.wenge, CN.huali],
    [ZH, CN.zitan, CN.wenge, CN.zitan],
    [ZH, CN.lacquer, CN.ink, CN.lacquer],
    ['modern', M.walnut, M.char, M.walnut],
  ], qiaotouTable, { surface: 84, surfaceShape: [r(-78, -20, 78, 20)] }),
  D('sw-cn-baxian', '八仙桌', 'dining', [90, 90, 83], [
    [ZH, CN.rose, CN.zitan, CN.gold],
    [ZH, CN.huali, CN.wenge, CN.gold],
    [ZH, CN.zitan, CN.wenge, CN.gold],
    [ZH, CN.wenge, CN.zitan, CN.gold],
  ], baxianTable, { surface: 83 }),
  D('sw-cn-tiaodeng', '条凳', 'dining', [110, 24.7, 48], [
    [ZH, CN.rose, CN.zitan, CN.gold],
    [ZH, CN.huali, CN.wenge, CN.gold],
    [ZH, CN.lacquer, CN.ink, CN.gold],
    ['japanese', J.wood, J.dark, J.shu],
  ], tiaoBench),
  D('sw-cn-fangji', '方几', 'living', [45, 40, 71], [
    [ZH, CN.rose, CN.zitan, CN.gold],
    [ZH, CN.huali, CN.wenge, CN.gold],
    [ZH, CN.zitan, CN.wenge, CN.gold],
    ['modern', M.walnut, M.char, M.silver],
  ], fangji, { surface: 71, surfaces: [{ y: 14, shape: [r(-18.3, -15.8, 18.3, 15.8)], h: 47 }] }),
  D('sw-cn-chatai', '茶台（带茶具）', 'living', [140, 70, 77.2], [
    [ZH, CN.rose, CN.zitan, CN.wenge],
    [ZH, CN.huali, CN.wenge, CN.zitan],
    [ZH, CN.wenge, CN.zitan, CN.ink],
    ['japanese', J.wood, J.dark, J.sumi],
    ['modern', M.walnut, M.char, M.black],
  ], teaTable, { surface: 65, surfaceShape: [r(-2, -33, 68, 33)], surfaces: [{ y: 12, shape: [r(-58, -21.5, 58, 21.5)], h: 39 }] }),
  D('sw-cn-duobao', '多宝格', 'storage', [81.2, 34.3, 180], [
    [ZH, CN.rose, CN.zitan, BRASS],
    [ZH, CN.huali, CN.wenge, BRASS],
    [ZH, CN.zitan, CN.wenge, BRASS],
    [ZH, CN.lacquer, CN.ink, BRASS],
    ['modern', M.walnut, M.char, M.silver],
  ], duobao, { family: 'bookshelf', sizeLabel: '多宝格', surface: 180, surfaces: [...duobaoSurfaces(), DUOBAO_LOWER], openable: true }),
  D('sw-cn-screen', '四扇屏风', 'deco', [174.9, 25.1, 176], [
    [ZH, CN.rose, CN.silk, '#c0392b'],
    [ZH, CN.zitan, '#1f1b1a', CN.gold],
    [ZH, CN.huali, '#f3ecd8', '#c0392b'],
    [ZH, CN.ink, '#2a2020', '#d8a55a'],
  ], screen4),
  D('sw-cn-gongdeng', '宫灯落地灯', 'lighting', [36, 39.3, 151.6], [
    [ZH, CN.rose, '#ffe2b0', CN.lacquer],
    [ZH, CN.zitan, '#fff1c8', CN.gold],
    [ZH, CN.huali, '#ffd9a8', CN.lacquer],
    [ZH, CN.lacquer, '#fff1c8', CN.gold],
  ], gongLamp, { family: 'floor-lamp', sizeLabel: '宫灯' }),
  D('sw-cn-denglong', '灯笼落地灯', 'lighting', [59.4, 36, 175.7], [
    [ZH, CN.wenge, '#e24a3a', CN.gold],
    [ZH, CN.rose, '#ffe2b0', CN.gold],
    [ZH, CN.zitan, '#f0b04a', CN.ink],
    ['japanese', J.dark, J.washi, J.sumi],
  ], lanternStand, { family: 'floor-lamp', sizeLabel: '灯笼' }),
  D('sw-cn-moongate', '月洞门', 'deco', [146, 30, 210], [
    [ZH, CN.wall, CN.tile, CN.huali],
    [ZH, '#e9e1d2', '#3e4247', CN.rose],
    [ZH, CN.lacquer, CN.ink, CN.gold],
    ['japanese', J.washi, J.sumi, J.wood],
  ], moonGate),
  D('sw-cn-dingxiang', '顶箱柜', 'bedroom', [101.6, 58.5, 227], [
    [ZH, CN.rose, BRASS, CN.zitan],
    [ZH, CN.huali, BRASS, CN.wenge],
    [ZH, CN.lacquer, BRASS, CN.ink],
    [ZH, CN.zitan, BRASS, CN.wenge],
    ['modern', M.walnut, M.silver, M.char],
  ], dingxiang, { surfaces: DINGXIANG_SURFACES, openable: true }),
  D('sw-cn-gudeng', '鼓凳', 'living', [39.3, 39.3, 49.1], [
    [ZH, CN.rose, CN.lacquer, BRASS],
    [ZH, CN.huali, CN.celadon, BRASS],
    [ZH, CN.zitan, CN.gold, BRASS],
    [ZH, CN.lacquer, CN.silk, BRASS],
  ], drumStool),
  D('sw-cn-huaji', '高花几', 'living', [36, 36, 102], [
    [ZH, CN.rose, CN.zitan, CN.gold],
    [ZH, CN.huali, CN.wenge, CN.gold],
    [ZH, CN.zitan, CN.wenge, CN.gold],
    ['modern', M.black, M.char, M.silver],
  ], tallStand, { surface: 102, surfaces: [{ y: 22, shape: [r(-13.5, -13.5, 13.5, 13.5)], h: 36 }] }),
  D('sw-cn-jiazi', '架子床', 'bedroom', [170, 220, 226], [
    [ZH, CN.lacquer, CN.silk, CN.rose],
    [ZH, CN.gold, CN.silk, CN.zitan],
    [ZH, CN.indigo, '#f3ecd8', CN.huali],
    [ZH, CN.jade, CN.silk, CN.wenge],
  ], jiaziBed),
  D('sw-cn-zhongtang', '中堂挂轴', 'deco', [129.8, 3, 161.3], [
    [ZH, CN.indigo, CN.silk, CN.zitan],
    [ZH, '#8a6a3a', '#f3ecd8', CN.wenge],
    [ZH, CN.jade, CN.silk, CN.rose],
    [ZH, CN.lacquer, '#f6e7c8', CN.ink],
  ], zhongtang, { mount: ZT_MOUNT }),
  D('sw-cn-penjing', '山水盆景台', 'plants', [40, 40, 95], [
    [ZH, CN.rose, '#f2efe8', '#8f9aa3'],
    [ZH, CN.huali, CN.celadon, '#9a9488'],
    [ZH, CN.zitan, '#e9e4da', '#7f8a92'],
    ['japanese', J.dark, J.washi, '#8f9aa3'],
  ], penjing),
  D('sw-cn-nightstand', '床头柜', 'bedroom', [46, 36.4, 55], [
    [ZH, CN.rose, BRASS, CN.zitan],
    [ZH, CN.huali, BRASS, CN.wenge],
    [ZH, CN.lacquer, BRASS, CN.ink],
    [ZH, CN.zitan, BRASS, CN.wenge],
    ['modern', M.walnut, M.silver, M.char],
  ], cnNightstand, { family: 'nightstand', sizeLabel: '中式', surface: 55, surfaces: CN_NS_SURFACES, openable: true }),
]

/** 欧式古典 */
export const SW_CLASSIC: AssetDef[] = [
  D('sw-cl-louis-arm', '路易扶手椅', 'living', [62.8, 58.7, 105.5], [
    [EU, CL.cream, CL.ivory, CL.gold],
    [EU, CL.wine, CL.walnut, CL.gold],
    [EU, CL.navy, CL.ivory, CL.gold],
    [EU, CL.blush, CL.ivory, CL.gold],
    [EU, CL.sage, CL.walnut, CL.gold],
  ], louisArmchair),
  D('sw-cl-louis-chair', '路易餐椅', 'dining', [44, 45.3, 98.5], [
    [EU, CL.cream, CL.ivory, CL.gold],
    [EU, CL.wine, CL.walnut, CL.gold],
    [EU, CL.navy, CL.ivory, CL.gold],
    [EU, CL.sage, CL.ivory, CL.gold],
    ['cute', C.sakura, C.white, C.lemon],
  ], louisChair, { family: 'dining-chair', sizeLabel: '路易' }),
  D('sw-cl-recamier', '卷头贵妃榻', 'living', [176, 67.4, 78.1], [
    [EU, CL.blush, CL.ivory, CL.gold],
    [EU, CL.wine, CL.mahogany, CL.gold],
    [EU, CL.teal, CL.walnut, CL.gold],
    [EU, CL.cream, CL.ivory, CL.gold],
  ], recamier),
  D('sw-cl-sideboard', '雕花餐边柜', 'dining', [160, 50.9, 95], [
    [EU, CL.ivory, CL.marble, CL.gold],
    [EU, CL.mahogany, CL.mahogany, CL.gold],
    [EU, CL.sage, CL.marble, CL.gold],
    [EU, CL.walnut, CL.black, CL.gold],
  ], clSideboard, { surface: 95, surfaces: CL_SB_SURFACES, openable: true }),
  D('sw-cl-vanity', '法式梳妆台', 'bedroom', [110, 46.4, 151.4], [
    [EU, CL.ivory, '#dfe8ee', CL.gold],
    [EU, CL.blush, '#dfe8ee', CL.gold],
    [EU, CL.mahogany, '#dfe8ee', CL.gold],
    ['cute', C.white, '#dfe8ee', C.lemon],
  ], clVanity, { surface: 77, surfaceShape: [r(-55, -12, 55, 23)], surfaces: CL_VANITY_SURFACES, openable: true }),
  D('sw-cl-fireplace', '欧式壁炉', 'living', [156, 46, 131.4], [
    [EU, CL.marble, CL.marble, CL.gold],
    [EU, CL.ivory, CL.cream, CL.gold],
    [EU, '#d8d2ca', CL.walnut, CL.gold],
    [EU, '#3a3636', CL.black, CL.gold],
  ], clFireplace, { surface: 107, surfaceShape: [r(-50, -23, 50, 23)], fx: FIREPLACE_FX }),
  D('sw-cl-crystal-lamp', '水晶烛台落地灯', 'lighting', [39.8, 38.4, 152], [
    [EU, CL.gold, CL.ivory, '#e8f4ff'],
    [EU, '#c8ccd2', CL.cream, '#e8f4ff'],
    [EU, CL.black, CL.ivory, '#e8f4ff'],
    [EU, CL.gold, CL.wine, '#ffe8f0'],
  ], crystalFloorLamp, { family: 'floor-lamp', sizeLabel: '水晶烛台' }),
  D('sw-cl-candle-lamp', '烛台台灯', 'lighting', [27, 27.2, 50.3], [
    [EU, CL.ivory, CL.cream, CL.gold],
    [EU, CL.gold, CL.ivory, CL.gold],
    [EU, CL.navy, CL.cream, CL.gold],
    [EU, CL.sage, CL.ivory, CL.gold],
  ], candleTableLamp, { prop: true, family: 'table-lamp', sizeLabel: '烛台' }),
  D('sw-cl-poster-bed', '雕花四柱床', 'bedroom', [177.1, 219.1, 208], [
    [EU, CL.cream, CL.ivory, CL.mahogany],
    [EU, CL.wine, CL.cream, CL.walnut],
    [EU, CL.navy, CL.ivory, CL.ivory],
    [EU, CL.blush, CL.ivory, CL.ivory],
  ], clPosterBed),
  D('sw-cl-marble-coffee', '大理石圆茶几', 'living', [85.6, 85.6, 42.5], [
    [EU, CL.marble, CL.gold, CL.vein],
    [EU, '#2e2c2c', CL.gold, '#cfc8bd'],
    [EU, '#e8dccd', CL.gold, '#c8a98c'],
    ['modern', M.white, M.black, M.gray],
  ], marbleCoffee, { family: 'coffee-table', sizeLabel: '大理石', surface: 42.4, surfaceShape: [ellipsePoly(40)] }),
  D('sw-cl-empire', '帝国式书柜', 'storage', [88, 34, 196], [
    [EU, CL.mahogany, CL.gold, CL.wine],
    [EU, CL.ivory, CL.gold, CL.sage],
    [EU, CL.walnut, CL.gold, CL.navy],
    [EU, CL.black, CL.gold, CL.teal],
  ], empireBookcase, { family: 'bookshelf', sizeLabel: '帝国式', surfaces: empireSurfaces() }),
  D('sw-cl-bench', '法式软包长凳', 'living', [110, 41.1, 47.3], [
    [EU, CL.cream, CL.ivory, CL.gold],
    [EU, CL.wine, CL.walnut, CL.gold],
    [EU, CL.navy, CL.ivory, CL.gold],
    [EU, CL.blush, CL.ivory, CL.gold],
  ], tuftedBench),
  D('sw-cl-ottoman', '丝绒圆脚凳', 'living', [58.1, 58.1, 41], [
    [EU, CL.wine, CL.walnut, CL.gold],
    [EU, CL.teal, CL.walnut, CL.gold],
    [EU, CL.blush, CL.ivory, CL.gold],
    [EU, CL.navy, CL.ivory, CL.gold],
    ['retro', R.mustard, R.caramel, R.cream],
  ], velvetOttoman),
  D('sw-cl-armoire', '法式拱顶衣柜', 'bedroom', [124, 61.9, 208], [
    [EU, CL.ivory, CL.cream, CL.gold],
    [EU, CL.mahogany, CL.walnut, CL.gold],
    [EU, CL.sage, CL.ivory, CL.gold],
    [EU, CL.blush, CL.ivory, CL.gold],
  ], clArmoire, { surfaces: CL_ARMOIRE_SURFACES, openable: true }),
  D('sw-cl-mirror', '落地镜', 'bedroom', [80.9, 29.5, 179.2], [
    [EU, CL.gold, '#dfe8ee', CL.cream],
    [EU, CL.ivory, '#dfe8ee', CL.gold],
    [EU, CL.black, '#dfe8ee', CL.gold],
    ['retro', R.caramel, '#dfe8ee', R.mustard],
  ], baroqueMirror, { family: 'floor-mirror', sizeLabel: '巴洛克金框' }),
  D('sw-cl-console', '半圆玄关桌', 'entrance', [100, 39.3, 79.1], [
    [EU, CL.ivory, CL.marble, CL.gold],
    [EU, CL.mahogany, CL.mahogany, CL.gold],
    [EU, CL.black, CL.marble, CL.gold],
    [EU, CL.sage, CL.ivory, CL.gold],
  ], demilune, { surface: 79, surfaceShape: [HALF_MOON] }),
  D('sw-cl-pedestal', '大理石柱花台', 'deco', [34, 34, 102], [
    [EU, CL.marble, CL.gold, CL.vein],
    [EU, CL.ivory, CL.gold, '#d8ccb4'],
    [EU, '#3a3636', CL.gold, '#6a6464'],
    ['modern', M.white, M.silver, M.light],
  ], columnPedestal, { surface: 102 }),
  D('sw-cl-nightstand', '床头柜', 'bedroom', [46, 37, 58], [
    [EU, CL.ivory, CL.ivory, CL.gold],
    [EU, CL.mahogany, CL.mahogany, CL.gold],
    [EU, CL.blush, CL.ivory, CL.gold],
    [EU, CL.sage, CL.marble, CL.gold],
  ], clNightstand, { family: 'nightstand', sizeLabel: '法式', surface: 58, surfaces: CL_NS_SURFACES, openable: true }),
]

/** 美式乡村 */
export const SW_FARMHOUSE: AssetDef[] = [
  D('sw-fh-barn-door', '谷仓门', 'deco', [200, 13.8, 220.2], [
    [FA, FH.pine, FH.oak, FH.black],
    [FA, FH.barn, FH.white, FH.black],
    [FA, FH.white, FH.white, FH.black],
    [FA, FH.sage, FH.white, FH.black],
    ['industrial', I.walnut, I.walnut, I.iron],
  ], barnDoor, { mount: BARN_MOUNT }),
  D('sw-fh-rocker', '温莎摇椅', 'living', [52, 89.1, 106], [
    [FA, FH.pine, '#d9c9a8', FH.oak],
    [FA, FH.black, FH.plaid, FH.black],
    [FA, FH.white, FH.denim, FH.white],
    [FA, FH.sage, FH.cream, FH.sage],
    ['nordic', N.oak, N.linen, N.oak],
  ], windsorRocker),
  D('sw-fh-table', '农舍长餐桌', 'dining', [200, 95, 77], [
    [FA, FH.pine, FH.white, FH.oak],
    [FA, FH.oak, FH.black, FH.black],
    [FA, FH.pine, FH.sage, FH.oak],
    [FA, FH.oak, FH.oak, FH.oak],
    ['nordic', N.oak, N.white, N.oak],
  ], farmTable, { surface: 77 }),
  D('sw-fh-bench', '农舍长凳', 'dining', [160, 36, 46], [
    [FA, FH.pine, FH.white, FH.oak],
    [FA, FH.oak, FH.black, FH.black],
    [FA, FH.pine, FH.sage, FH.oak],
    [FA, FH.oak, FH.oak, FH.oak],
  ], farmBench),
  D('sw-fh-hutch', '碗柜', 'dining', [146, 54, 200], [
    [FA, FH.white, FH.pine, FH.cream],
    [FA, FH.sage, FH.oak, FH.cream],
    [FA, FH.barn, FH.pine, FH.cream],
    [FA, FH.denim, FH.pine, FH.white],
    ['retro', R.teal, R.caramel, R.cream],
  ], hutch, { surface: 91, surfaceShape: [r(-72, 8.5, 72, 26)], surfaces: HUTCH_SURFACES, openable: true }),
  D('sw-fh-iron-bed', '白铁艺床', 'bedroom', [165.7, 211.7, 127.7], [
    [FA, FH.plaid, FH.white, FH.white],
    [FA, FH.denim, FH.cream, FH.white],
    [FA, FH.sage, FH.white, FH.black],
    [FA, FH.mustard, FH.cream, FH.black],
  ], fhIronBed),
  D('sw-fh-quilt-bench', '床尾凳（叠拼布被）', 'bedroom', [120, 42, 62.5], [
    [FA, FH.pine, FH.plaid, FH.denim],
    [FA, FH.white, FH.sage, FH.mustard],
    [FA, FH.oak, FH.denim, FH.plaid],
    [FA, FH.black, FH.mustard, FH.sage],
  ], quiltBench, { surface: 48, surfaceShape: [r(6, -21, 60, 21)], surfaces: [{ y: 12, shape: [r(-52, -15, 52, 15)], h: 25.5 }] }),
  D('sw-fh-fireplace', '砖石壁炉', 'living', [170, 50, 132], [
    [FA, FH.stone, FH.oak, '#8f8a82'],
    [FA, FH.brick, FH.oak, '#7a6e66'],
    [FA, FH.white, FH.pine, '#a6a198'],
    [FA, '#8f8b84', FH.black, '#6e6a64'],
    ['industrial', I.brick, I.walnut, I.concrete],
  ], stoneFireplace, { surface: 132, surfaceShape: [r(-84, -14, 84, 14)], fx: [{ kind: 'flame', x: 0, y: 16, z: -8, scale: 2.4 }] }),
  D('sw-fh-crate-table', '木箱咖啡桌', 'living', [110, 59.9, 45], [
    [FA, FH.pine, FH.black, IRON],
    [FA, FH.oak, FH.black, IRON],
    [FA, FH.white, FH.black, IRON],
    ['industrial', I.walnut, I.steel, I.iron],
  ], crateCoffee, { surface: 45, surfaces: [{ y: 11.4, shape: [r(-49, -25, 49, 25)], h: 30.6 }] }),
  D('sw-fh-ladder', '梯子毯架', 'living', [48.5, 28.8, 167.3], [
    [FA, FH.pine, FH.plaid, FH.cream],
    [FA, FH.oak, FH.denim, FH.white],
    [FA, FH.white, FH.sage, FH.mustard],
    ['nordic', N.oak, N.gray, N.mustard],
  ], blanketLadder),
  D('sw-fh-baskets', '草编篮层架', 'storage', [70, 35, 85], [
    [FA, FH.white, '#c9a66b', FH.cream],
    [FA, FH.oak, '#d6b77e', FH.white],
    [FA, FH.sage, '#c9a66b', FH.white],
    ['nordic', N.oak, N.linen, N.white],
  ], basketShelf, { surface: 85, surfaces: [{ y: 62, shape: [r(-32, -16.5, 32, 16.5)], h: 20.5 }] }),
  D('sw-fh-lantern', '铸铁灯笼落地灯', 'lighting', [38, 38, 166.2], [
    [FA, FH.black, '#ffe9b0', BRASS],
    [FA, '#3a4a3c', '#ffe9b0', BRASS],
    [FA, FH.oak, '#ffe9b0', FH.black],
    ['industrial', I.iron, '#ffd38a', I.rust],
  ], ironLanternLamp, { family: 'floor-lamp', sizeLabel: '铸铁灯笼' }),
  D('sw-fh-shelf', '旧木货架', 'storage', [120, 40.5, 180], [
    [FA, FH.pine, FH.black, BRASS],
    [FA, FH.oak, FH.black, BRASS],
    [FA, '#a89b88', FH.black, BRASS],
    ['industrial', I.walnut, I.iron, I.rust],
  ], reclaimedShelf, { surface: 180, surfaces: reclaimedSurfaces() }),
  D('sw-fh-club', '做旧皮革单人沙发', 'living', [92, 86.9, 76.1], [
    [FA, FH.cognac, BRASS, FH.oak],
    [FA, '#6e4a33', BRASS, FH.black],
    [FA, FH.denim, '#c0c4c8', FH.oak],
    ['industrial', I.leather, I.steel, I.iron],
    ['retro', R.caramel, BRASS, R.caramel],
  ], leatherClub),
  D('sw-fh-bookcase', '做旧书柜', 'storage', [87, 34, 180], [
    [FA, FH.white, FH.cream, FH.pine],
    [FA, FH.sage, FH.white, FH.oak],
    [FA, FH.barn, FH.cream, FH.oak],
    [FA, FH.black, FH.pine, FH.pine],
  ], farmBookcase, { family: 'bookshelf', sizeLabel: '做旧', surface: 180, surfaces: farmBookSurfaces() }),
  D('sw-fh-dogbed', '格纹狗床', 'pets', [88, 68, 23.1], [
    [FA, FH.plaid, FH.cream, FH.oak],
    [FA, FH.denim, FH.white, FH.black],
    [FA, FH.sage, FH.cream, FH.oak],
    ['cute', C.sky, C.cream, C.woodD],
  ], plaidDogBed, { actor: { kind: 'dog', role: 'home', breed: 'shiba', dock: [0, 11.6, 3] } }),
  D('sw-fh-xback', 'X 背餐椅', 'dining', [44, 44.6, 88.1], [
    [FA, FH.oak, '#c9a66b', FH.oak],
    [FA, FH.black, '#c9a66b', FH.black],
    [FA, FH.white, '#c9a66b', FH.pine],
    [FA, FH.sage, '#c9a66b', FH.sage],
    ['industrial', I.walnut, I.leather, I.iron],
  ], xbackChair, { family: 'dining-chair', sizeLabel: 'X 背' }),
  D('sw-fh-nightstand', '床头柜', 'bedroom', [46, 38, 57], [
    [FA, FH.pine, FH.white, FH.black],
    [FA, FH.oak, FH.sage, FH.black],
    [FA, FH.pine, FH.denim, BRASS],
    [FA, FH.oak, FH.black, BRASS],
  ], fhNightstand, { family: 'nightstand', sizeLabel: '农舍', surface: 57, surfaces: [{ y: 14, shape: [r(-19.3, -15.3, 19.3, 15.3)], h: 22 }, drawerLv(-18, 18, 38, 14, 16.3, 30)], openable: true }),
]

/** 和风补充 */
export const SW_JAPANESE: AssetDef[] = [
  D('sw-jp-arm-zaisu', '扶手座椅子', 'japanese', [58, 69.8, 53.3], [
    ['japanese', J.ai, J.sumi, J.wood],
    ['japanese', J.tatami, J.dark, J.hinoki],
    ['japanese', J.shu, J.sumi, J.dark],
    ['modern', M.gray, M.black, M.walnut],
    ['nordic', N.sage, N.gray, N.oak],
  ], armZaisu),
  D('sw-jp-zataku', '一枚板座卓', 'japanese', [150, 84.3, 34.4], [
    ['japanese', J.wood, J.dark, J.dark],
    ['japanese', J.hinoki, J.wood, J.wood],
    ['japanese', J.dark, J.sumi, J.sumi],
    ['industrial', I.walnut, I.iron, I.iron],
  ], ichimaiZataku, { surface: 34, surfaceShape: [r(-73, -39, 73, 39)] }),
  D('sw-jp-kuruma', '車箪笥', 'japanese', [102, 50.5, 95], [
    ['japanese', J.wood, J.sumi, J.dark],
    ['japanese', J.dark, J.sumi, J.sumi],
    ['japanese', '#7a3b2a', J.sumi, J.dark],
    ['retro', R.caramel, '#3a3030', '#3a3030'],
  ], kurumaDansu, { surface: 95, surfaces: KURUMA_SURFACES, openable: true }),
  D('sw-jp-maru-andon', '丸行灯', 'japanese', [29.7, 31.1, 88.9], [
    ['japanese', J.washi, J.dark, J.sumi],
    ['japanese', J.washi, J.shu, J.sumi],
    ['japanese', '#f3e3c3', J.wood, J.dark],
    ['modern', M.white, M.black, M.black],
  ], maruAndon, { family: 'floor-lamp', sizeLabel: '丸行灯' }),
  D('sw-jp-shoji', '障子三折屏风', 'japanese', [147, 30.2, 170], [
    ['japanese', J.hinoki, J.washi, J.wood],
    ['japanese', J.dark, J.washi, J.sumi],
    ['japanese', J.wood, '#f3e9d2', J.dark],
    ['nordic', N.oak, N.white, N.oakL],
  ], shojiScreen),
  D('sw-jp-okidoko', '置き床', 'japanese', [122, 45.4, 13], [
    ['japanese', J.hinoki, J.sumi, J.shu],
    ['japanese', J.wood, J.dark, J.washi],
    ['japanese', J.tatami, J.sumi, J.shu],
  ], okidoko, { surface: 12.6, surfaceShape: [r(-57, -21, 57, 18)] }),
  D('sw-jp-chigaidana', '違い棚', 'japanese', [90.1, 37, 112.5], [
    ['japanese', J.hinoki, J.washi, J.sumi],
    ['japanese', J.wood, '#e9dcc0', J.dark],
    ['japanese', J.dark, J.washi, J.sumi],
    ['modern', M.walnut, M.white, M.black],
  ], chigaidana, { surface: 112.4, surfaces: [{ y: 32.4, shape: [r(-42.6, -16.4, 42.6, 17)], h: 29.6 }, { y: 64.2, shape: [r(-42.6, -15.5, -0.5, 16.5)], h: 23.8 }, { y: 76.2, shape: [r(1.5, -15.5, 42.6, 16.5)], h: 11.8 }, { y: 3.5, h: 26.2, inside: true, shape: [r(-42.6, -16.4, 42.6, 15.4)] }, { y: 90, h: 19.8, inside: true, shape: [r(-42.6, -16.4, 42.6, 15.4)] }], openable: true }),
  D('sw-jp-zafu', '坐禅蒲团', 'japanese', [60, 60, 21.9], [
    ['japanese', J.ai, J.sumi, J.shu],
    ['japanese', J.tatami, J.dark, J.shu],
    ['japanese', J.shu, J.sumi, '#e6c56e'],
    ['nordic', N.gray, N.sage, N.mustard],
  ], zafuSet),
  D('sw-jp-nightstand', '床头柜', 'bedroom', [44, 35.1, 46], [
    ['japanese', J.hinoki, J.sumi, J.dark],
    ['japanese', J.wood, J.sumi, J.dark],
    ['japanese', J.dark, '#c9a45a', J.sumi],
    ['nordic', N.oakL, M.black, N.oak],
  ], jpNightstand, { family: 'nightstand', sizeLabel: '和风', surface: 46, surfaces: [{ y: 30, shape: [r(-20, -16, 20, 17)], h: 14 }, ...[4.6, 16.4].map((y) => drawerLv(-19.5, 19.5, y, 11, 15.9, 30))], openable: true }),
]

/** 工业风补充 */
export const SW_INDUSTRIAL: AssetDef[] = [
  D('sw-in-pipe-shelf', '铁管书架', 'storage', [80, 30, 181], [
    ['industrial', I.walnut, I.iron, I.steel],
    ['industrial', '#a87a52', I.iron, BRASS],
    ['industrial', I.concrete, I.iron, I.rust],
    [FA, FH.pine, FH.black, FH.black],
  ], pipeBookshelf, { family: 'bookshelf', sizeLabel: '铁管', surface: 179, surfaces: pipeSurfaces() }),
  D('sw-in-locker', '三门更衣柜', 'storage', [91, 48.6, 182], [
    ['industrial', '#5f7a7c', BRASS, I.iron],
    ['industrial', I.steel, '#f2f2f2', I.iron],
    ['industrial', '#8a4a3a', BRASS, I.iron],
    ['retro', R.teal, R.cream, '#3a3030'],
    ['modern', M.white, M.silver, M.char],
  ], locker3, { surfaces: LOCKER_SURFACES, openable: true }),
  D('sw-in-workbench', '焊接工作台', 'study', [150, 70, 102.1], [
    ['industrial', I.walnut, I.iron, '#3c5a7a'],
    ['industrial', '#c9a070', I.steel, I.rust],
    ['industrial', I.concrete, I.iron, '#c0392b'],
    [FA, FH.pine, FH.black, FH.barn],
  ], weldBench, { surface: 90, surfaceShape: [r(-75, -35, 51, 35), r(51, 0, 75, 35)], surfaces: [{ y: 17.4, shape: [r(-70, -30, 70, 30)], h: 62.6 }] }),
  D('sw-in-rivet-chair', '铆钉皮革单椅', 'living', [70, 66, 74], [
    ['industrial', I.leather, I.iron, BRASS],
    ['industrial', '#5a3a2a', I.steel, '#c0c4c8'],
    ['industrial', '#3a3a3c', I.rust, BRASS],
    ['retro', R.caramel, R.olive, BRASS],
  ], rivetChair),
  D('sw-in-edison', '爱迪生灯泡落地灯', 'lighting', [40.8, 38.5, 154.5], [
    ['industrial', I.iron, '#c0392b', '#ffc56a'],
    ['industrial', I.steel, BRASS, '#ffc56a'],
    ['industrial', '#6a4a32', I.iron, '#ffd38a'],
    ['retro', '#3a3030', R.red, '#ffc56a'],
  ], edisonLamp, { family: 'floor-lamp', sizeLabel: '爱迪生灯泡' }),
  D('sw-in-toolcart', '工具车', 'hobby', [74.5, 45.1, 85.4], [
    ['industrial', '#c0392b', I.iron, I.iron],
    ['industrial', '#3c5a7a', I.iron, I.iron],
    ['industrial', I.iron, I.steel, '#3a3a3c'],
    ['retro', R.teal, '#3a3030', '#3a3030'],
    ['modern', M.white, M.char, M.black],
  ], toolCart, { surface: 80.6, surfaceShape: [r(-31.8, -20.8, 31.8, 20.8)], surfaces: TOOLCART_DRAWERS.map(({ h, y }) => drawerLv(-30, 30, y, h, 20.8, 38)), openable: true }),
  D('sw-in-concrete-side', '水泥台面边桌', 'living', [45, 45, 55.3], [
    ['industrial', I.concrete, I.iron, I.walnut],
    ['industrial', '#8f8c87', I.iron, '#a87a52'],
    ['modern', M.light, M.black, M.walnut],
    ['industrial', '#b9b2a8', I.rust, I.walnut],
  ], concreteSide, { surface: 55, surfaces: [{ y: 14.2, shape: [r(-19, -19, 19, 19)], h: 33.4 }] }),
  D('sw-in-cart-table', '铸铁滚轮推车茶几', 'living', [120, 67, 38], [
    ['industrial', I.walnut, I.iron, I.rust],
    ['industrial', '#a87a52', I.iron, '#c0392b'],
    ['industrial', '#6a4a32', I.steel, I.iron],
    [FA, FH.pine, FH.black, FH.black],
  ], factoryCart, { surface: 37 }),
  D('sw-in-nightstand', '床头柜', 'bedroom', [42, 37.4, 55], [
    ['industrial', '#5f7a7c', '#f2efe6', I.walnut],
    ['industrial', I.steel, '#f2efe6', I.walnut],
    ['industrial', I.iron, BRASS, '#a87a52'],
    ['modern', M.white, M.light, M.walnut],
  ], inNightstand, { family: 'nightstand', sizeLabel: '铁皮档案柜', surface: 55, surfaces: [13.5, 32].map((y) => drawerLv(-18, 18, y, 17, 16.8, 30)), openable: true }),
]
