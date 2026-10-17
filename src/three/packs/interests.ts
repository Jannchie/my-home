// 兴趣与性格素材包：乐器 + 体现「住在这里的人」爱好的摆件（漫画、宅物、运动、棋牌、手作、学习、收藏、生活气息）。
// 约定见 kit.ts 开头。全部 id 以 int- 开头，避免和其他素材包撞名。
// 人偶 / 手办一律不加脸；画面（乐谱、星图、明信片、封面）都用 paintPanel 画在贴图上。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, paintLandscape, paintPanel, pinwheelWalls, rng, type AssetCategory, type AssetDef } from '../kit'
import { G, P, PI, cylX, cylZ, ghostOutlined, litOutlined, noOutline, rod3, taperRod3, type V2, type V3 } from '../geo'
import { I, J, M, N, PROP, R, type PalFlat } from '../packkit'

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

const METAL = '#d5d9de'
const GOLD = '#e3b549'
const BRASS = '#e6bf55'
const DARK = '#2e2f33'
const RUBBER = '#3a3b40'
const PAPER = '#fbf8f0'
const IVORY = '#f6f0e1'
const CARD = '#c99a62'
const GLASS = '#cfe8f5'

function def(
  id: string,
  name: string,
  category: AssetCategory,
  [w, d, h]: [number, number, number],
  pals: PalFlat[],
  build: (p: string[]) => THREE.Group,
  extra: Partial<AssetDef> = {},
): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x.slice(1) as string[]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}
/** build 结果再摆正一次 */
const F = (b: (p: string[]) => THREE.Group) => (p: string[]) => fit(b(p))

// ---------- 小工具 ----------

/** 沿折线的管子（萨克斯、小号），半径从 r0 渐变到 r1，关节处补球 */
function taperPath(pts: V3[], r0: number, r1: number, color: string, seg = 12) {
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
function sym(right: V2[]): V2[] {
  return [...right, ...right.slice(1, -1).reverse().map(([x, y]): V2 => [-x, y])]
}

/** 平面轮廓挤出成板（琴身、滑板、冲浪板）：轮廓在 xy 平面，厚度沿 z 居中 */
function flat(pts: V2[], depth: number, color: string, smooth = true, bevel = 0.5) {
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

/** 把组摆正：x / z 居中，最低点落在 y0 */
function fit(g: THREE.Object3D, y0 = 0) {
  const outer = new THREE.Group()
  outer.add(g)
  outer.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(outer, true)
  g.position.x -= (b.min.x + b.max.x) / 2
  g.position.z -= (b.min.z + b.max.z) / 2
  g.position.y += y0 - b.min.y
  return outer
}

/** 平放的画面：w × d，画布顶边朝后（-z），(x, z) 为中心，y 为高度 */
function paintTop(w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number) {
  return paintPanel(w, d, key, draw, { x, y, z: z + d / 2, rx: -PI / 2 })
}

/** 平放的薄板（卡片、纸），给中心 */
const sheet = (w: number, d: number, color: string, x: number, y: number, z: number, t = 0.2) => rbox(w, t, d, color, { x, y, z }, t * 0.4)

// ---------- 画面 ----------

/** 琴键：从 start（0 = C … 6 = B）开始的 nWhite 个白键，黑键长度占 blackLen */
function drawKeys(nWhite: number, white: string, black: string, start = 0, blackLen = 0.6): Draw {
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
function drawScore(paper: string, ink: string, seed = 1): Draw {
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
function drawFretboard(wood: string, fret: string, frets: number): Draw {
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

// =====================================================================
// 乐器
// =====================================================================

/** 立式钢琴 150×62×125：[琴身, 白键, 金属] */
function uprightPiano(p: string[]) {
  const [body, white, metal] = p
  const g = new THREE.Group()
  g.add(rbox(146, 122.5, 34, body, { z: -14 }, 1.2))
  g.add(rbox(150, 2.5, 35.5, body, { y: 122.5, z: -13.25 }, 0.8))
  g.add(rbox(120, 45, 0.6, shade(body, 0.05), { y: 12, z: 3.2 }, 0.3))
  // 键盘
  g.add(rbox(134, 8, 22, shade(body, -0.04), { y: 62, z: 13 }, 0.8))
  g.add(rbox(128, 1.6, 15, white, { y: 70, z: 16 }, 0.3))
  g.add(paintTop(127.4, 14.4, `int-keys52-${white}`, drawKeys(52, white, '#26262a', 5, 0.62), 0, 71.9, 16))
  g.add(rbox(128, 5, 2, body, { y: 71.6, z: 7.5 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(6, 14, 22, body, { x: s * 67, y: 62, z: 13 }, 1))
    g.add(rbox(5, 62, 5, body, { x: s * 67, z: 21 }, 1))
    g.add(rbox(7, 4, 30, body, { x: s * 67, z: 16 }, 1))
  }
  // 谱架 + 乐谱
  g.add(rbox(100, 2, 5, body, { y: 84, z: 5.5 }, 0.5))
  g.add(paintPanel(42, 28, `int-score-${PAPER}`, drawScore(PAPER, '#333', 3), { y: 86, z: 3.4 }))
  // 踏板
  g.add(rbox(30, 6, 4, shade(body, -0.06), { y: 0, z: 5 }, 0.8))
  for (const x of [-6, 0, 6]) g.add(rbox(2.2, 1.2, 7, metal, { x, y: 2.5, z: 9.5 }, 0.4))
  return g
}

/** 三角钢琴：琴盖撑开 [琴身, 白键, 金属] */
function grandPiano(p: string[]) {
  const [body, white, metal] = p
  const g = new THREE.Group()
  // 俯视轮廓（左侧直边，右侧 S 形曲线），z 从 -82（尾）到 60（键盘端）
  const curve = new THREE.CatmullRomCurve3(
    ([[75, 60], [75, 36], [66, 14], [48, -8], [30, -36], [14, -64], [-8, -80], [-34, -82], [-58, -78], [-75, -62]] as V2[]).map(([x, z]) => new THREE.Vector3(x, z, 0)),
    false,
    'centripetal',
  )
  const outline: V2[] = [[-75, 60], ...curve.getPoints(40).map((v): V2 => [v.x, v.y])]
  // 用 flat 挤出（xy 平面），再放平：x→x，y→-z
  const lay = (m: THREE.Mesh, y: number) => P(m, 0, y, 0, PI / 2)
  const caseM = lay(flat(outline.map(([x, z]): V2 => [x, z]), 34, body, false, 0.8), 75)
  g.add(caseM)
  // 琴盖：以左侧直边为轴撑开
  const lidAng = 0.45
  const lid = lay(flat(outline.map(([x, z]): V2 => [x + 75, z]), 2, shade(body, 0.04), false, 0.4), 1)
  g.add(P(G(lid), -75, 92, 0, 0, 0, lidAng))
  // 内部音板（金色铁骨）
  const inner = lay(flat(outline.map(([x, z]): V2 => [x * 0.9 + 1, z * 0.9 - 2]), 1, metal, false, 0.3), 90.6)
  g.add(inner)
  // 琴盖撑杆
  const sx = 40
  const lx = (sx + 75) / Math.cos(lidAng)
  g.add(rod3([sx, 91, -6], [sx, 92 + lx * Math.sin(lidAng) - 0.5, -6], 0.8, body))
  // 键盘
  g.add(rbox(134, 6, 22, shade(body, -0.04), { y: 62, z: 71 }, 0.8))
  g.add(rbox(128, 1.6, 15, white, { y: 68, z: 73.5 }, 0.3))
  g.add(paintTop(127.4, 14.4, `int-keys52-${white}`, drawKeys(52, white, '#26262a', 5, 0.62), 0, 69.9, 73.5))
  g.add(rbox(128, 6, 2, body, { y: 69.6, z: 65 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(6, 12, 22, body, { x: s * 67, y: 62, z: 71 }, 1))
  // 谱架
  g.add(rbox(76, 2, 6, body, { y: 92, z: 50 }, 0.5))
  const desk = G(rbox(72, 22, 1.4, body, {}, 0.4), paintPanel(40, 16, `int-score-${PAPER}`, drawScore(PAPER, '#333', 5), { y: 4, z: 0.9 }))
  g.add(P(desk, 0, 93.5, 50, -0.22))
  // 腿 + 踏板
  for (const [x, z] of [[-64, 46], [60, 40], [-38, -66]] as V2[]) {
    g.add(cyl(4.5, 3.5, 54, body, { x, y: 4, z }, 16))
    g.add(ball(3, metal, { x, y: 3, z }))
  }
  g.add(rbox(14, 48, 4, body, { y: 10, z: 56 }, 1))
  g.add(rbox(22, 4, 9, body, { y: 6, z: 58.5 }, 1))
  for (const x of [-6, 0, 6]) g.add(rbox(2.2, 1.2, 6, metal, { x, y: 7.5, z: 65 }, 0.4))
  return g
}

/** 电钢琴 + 琴凳：[琴身, 白键, 琴凳垫] */
function digitalPiano(p: string[]) {
  const [body, white, seat] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(4, 72, 33, body, { x: s * 66, z: -22.5 }, 0.8))
    g.add(rbox(6, 8, 18, body, { x: s * 65, y: 78, z: -14 }, 0.8))
  }
  g.add(rbox(128, 30, 1.5, body, { y: 30, z: -38 }, 0.4))
  g.add(rbox(136, 6, 35, body, { y: 72, z: -22.5 }, 0.8))
  g.add(rbox(124, 14, 17, body, { y: 78, z: -31.5 }, 0.8))
  g.add(rbox(124, 1.6, 15, white, { y: 78, z: -15.5 }, 0.3))
  g.add(paintTop(123.4, 14.4, `int-keys52-${white}`, drawKeys(52, white, '#26262a', 5, 0.62), 0, 79.9, -15.5))
  g.add(litOutlined(rbox(8, 0.4, 3, '#9fe0c8', { x: -40, y: 92, z: -27 }, 0.15), '#9fe0c8'))
  g.add(rbox(70, 3, 2, body, { y: 92, z: -36 }, 0.4))
  g.add(rbox(30, 3, 8, shade(body, -0.1), { z: -30 }, 0.6))
  // 琴凳
  const bench = shade(body, 0.02)
  // 座面高约 48（腿 39 + 框 4 + 垫 5）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, 39, 3, bench, { x: sx * 26, z: 25 + sz * 11 }, 0.6))
  g.add(rbox(60, 4, 30, bench, { y: 39, z: 25 }, 0.8))
  g.add(rbox(56, 5, 26, seat, { y: 43, z: 25 }, 2))
  return g
}

/** 一面鼓：轴沿 y，给底面中心 */
function drum(r: number, h: number, shellC: string, head: string, hoop: string) {
  const g = new THREE.Group()
  g.add(cyl(r, r, h, shellC, {}, 28))
  // 鼓皮比鼓圈顶略低（鼓圈顶在 h + 0.3），不和鼓圈顶共面
  g.add(cyl(r * 0.97, r * 0.97, 0.3, head, { y: h - 0.15 }, 28))
  g.add(torus(r, 0.5, hoop, { y: h - 0.2, rx: PI / 2 }))
  g.add(torus(r, 0.5, hoop, { y: 0.2, rx: PI / 2 }))
  return g
}

/** 镲片：给中心 */
function cymbal(r: number, color: string, x: number, y: number, z: number, tilt = 0) {
  const m = cyl(1.2, r, 1.4, color, {}, 28)
  return P(G(m, cyl(1.6, 2, 0.8, color, { y: 1.2 }, 12)), x, y, z, tilt)
}

/** 架子鼓：[鼓身, 鼓皮, 金属] */
function drumKit(p: string[]) {
  const [shellC, head, metal] = p
  const g = new THREE.Group()
  // 底鼓（轴朝前）
  const kick = drum(28, 40, shellC, head, metal)
  g.add(P(kick, 0, 30, 15, PI / 2))
  g.add(litOutlined(cylZ(9, 0.4, shade(shellC, 0.25), 0, 30, 55.4, 20), shade(shellC, 0.25), 0.1))
  for (const s of [-1, 1]) g.add(rod3([s * 20, 12, 30], [s * 32, 0.6, 38], 0.8, metal))
  // 嗵鼓
  for (const s of [-1, 1]) g.add(P(drum(10, 16, shellC, head, metal), s * 13, 62, 26, -0.45, 0, -s * 0.15))
  g.add(rod3([0, 57, 28], [0, 65, 24], 1, metal))
  // 落地嗵
  g.add(drum(16, 40, shellC, head, metal).translateX(46).translateY(16).translateZ(-16))
  for (const a of [0.3, 2.4, 4.4]) g.add(rod3([46 + Math.cos(a) * 17, 30, -16 + Math.sin(a) * 17], [46 + Math.cos(a) * 21, 0.6, -16 + Math.sin(a) * 21], 0.6, metal))
  // 军鼓 + 架
  g.add(drum(17, 13, shellC, head, metal).translateX(-28).translateY(52).translateZ(-22))
  for (const a of [0.6, 2.7, 4.8]) g.add(rod3([-28, 52, -22], [-28 + Math.cos(a) * 18, 0.6, -22 + Math.sin(a) * 18], 0.6, metal))
  // 踩镲
  g.add(rod3([-60, 0, -14], [-60, 96, -14], 0.8, metal))
  for (const a of [0.9, 3, 5.1]) g.add(rod3([-60, 30, -14], [-60 + Math.cos(a) * 14, 0.6, -14 + Math.sin(a) * 14], 0.6, metal))
  g.add(cymbal(17, GOLD, -60, 88, -14), cymbal(17, GOLD, -60, 90.2, -14))
  // 吊镲 / 叮叮镲
  g.add(rod3([-50, 0, 24], [-50, 112, 24], 0.8, metal))
  for (const a of [1, 3.1, 5.2]) g.add(rod3([-50, 30, 24], [-50 + Math.cos(a) * 14, 0.6, 24 + Math.sin(a) * 14], 0.6, metal))
  g.add(cymbal(19, GOLD, -50, 112, 24, 0.25))
  g.add(rod3([56, 0, 18], [56, 100, 18], 0.8, metal))
  for (const a of [0.2, 2.3, 4.4]) g.add(rod3([56, 30, 18], [56 + Math.cos(a) * 14, 0.6, 18 + Math.sin(a) * 14], 0.6, metal))
  g.add(cymbal(22, GOLD, 56, 100, 18, -0.2))
  // 鼓凳 + 踏板 + 鼓棒
  g.add(cyl(1.5, 1.5, 44, metal, { z: -50 }))
  for (const a of [0.5, 2.6, 4.7]) g.add(rod3([0, 18, -50], [Math.cos(a) * 16, 0.6, -50 + Math.sin(a) * 16], 0.7, metal))
  g.add(puck(17, 6, DARK, { y: 44, z: -50 }))
  g.add(rbox(8, 2, 22, metal, { z: -6 }, 0.5))
  // 鼓棒：交叉搁在鼓凳座面上
  g.add(rod3([-7, 50.5, -45], [7, 50.5, -55], 0.5, '#e8c89a'), rod3([-7, 51.4, -54], [7, 51.4, -46], 0.5, '#e8c89a'))
  return g
}

/** 电子鼓：[架子, 鼓垫, 点缀] */
function eDrum(p: string[]) {
  const [rack, pad, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rod3([s * 50, 0, -5], [s * 50, 96, -5], 1.6, rack))
    g.add(rod3([s * 50, 0.8, -26], [s * 50, 0.8, 16], 1.2, rack))
    g.add(rod3([s * 50, 72, -5], [s * 36, 72, 24], 1.2, rack))
  }
  g.add(rod3([-50, 72, -5], [50, 72, -5], 1.4, rack))
  const padAt = (r: number, x: number, y: number, z: number, tilt = 0.25) => {
    const m = G(puck(r, 3, RUBBER), cyl(r * 0.88, r * 0.88, 0.4, pad, { y: 2.9 }, 24))
    return P(m, x, y, z, tilt)
  }
  g.add(padAt(12, -22, 70, 14), padAt(10, 2, 76, 8), padAt(10, 22, 76, 8), padAt(13, 36, 66, 22))
  g.add(rod3([-22, 72, 8], [-22, 72, -4], 0.8, rack))
  for (const x of [2, 22]) g.add(rod3([x, 72, -5], [x, 76.5, 7], 0.8, rack))
  // 底鼓塔
  g.add(rbox(18, 34, 14, rack, { y: 0, z: 18 }, 1.5))
  g.add(cylZ(7, 1.6, pad, 0, 20, 25.4, 20))
  // 镲垫
  const cym = (r: number, x: number, y: number, z: number) => P(G(cyl(1.5, r, 1.2, RUBBER, {}, 24), torus(r - 1, 0.3, acc, { y: 0.9, rx: PI / 2 })), x, y, z, 0.2)
  g.add(rod3([-50, 96, -5], [-42, 108, 4], 0.8, rack), cym(16, -42, 108, 4))
  g.add(rod3([50, 96, -5], [44, 112, 2], 0.8, rack), cym(16, 44, 112, 2))
  g.add(rod3([-50, 80, -5], [-38, 88, 20], 0.8, rack), cym(12, -38, 88, 20))
  // 音源
  g.add(rbox(18, 13, 4, DARK, { x: 50, y: 80, z: -2 }, 1))
  g.add(litOutlined(rbox(10, 4, 0.4, '#8fe3ff', { x: 50, y: 86, z: 0.1 }, 0.15), '#8fe3ff'))
  g.add(cylZ(1.3, 1, acc, 46, 82, 0.5, 20), cylZ(1.3, 1, acc, 54, 82, 0.5, 20))
  // 凳
  g.add(cyl(1.4, 1.4, 44, rack, { z: -46 }))
  for (const a of [0.5, 2.6, 4.7]) g.add(rod3([0, 18, -46], [Math.cos(a) * 15, 0.6, -46 + Math.sin(a) * 15], 0.7, rack))
  g.add(puck(16, 6, DARK, { y: 44, z: -46 }))
  return g
}

/** 提琴类轮廓 */
function bowedOutline(L: number, lower: number, upper: number, waist: number): V2[] {
  const a = lower / 2
  const b = upper / 2
  const c = waist / 2
  return sym([[0, 0], [a * 0.72, L * 0.02], [a * 0.98, L * 0.15], [a, L * 0.27], [a * 0.84, L * 0.41], [c, L * 0.5], [c * 1.04, L * 0.57], [b * 0.9, L * 0.68], [b, L * 0.78], [b * 0.8, L * 0.93], [0, L]])
}

/** 小提琴：沿 y 立着（底部 y = 0），正面 +z，背面 z = -1.6。[木色, 黑件] */
function violin(wood: string, dark: string) {
  const g = new THREE.Group()
  const ol = bowedOutline(35.5, 20.5, 16.5, 11)
  g.add(flat(ol, 3.2, shade(wood, -0.08), true, 0.6))
  g.add(P(flat(ol.map(([x, y]): V2 => [x * 0.9, y * 0.94 + 1]), 1.2, wood, true, 0.5), 0, 0, 1.6))
  g.add(rbox(2.4, 13, 2.8, shade(wood, -0.05), { y: 35, z: 0.8 }, 0.6))
  g.add(rbox(2.2, 8, 2.4, shade(wood, -0.05), { y: 48, z: 0.4 }, 0.6))
  g.add(ball(1.6, shade(wood, -0.05), { y: 57, z: 0.4 }, [0.8, 1, 1.1]))
  for (const y of [50, 53]) g.add(cylX(0.35, 6, dark, 0, y, 0.4, 8))
  g.add(rbox(2.6, 27, 0.7, dark, { y: 22, z: 2.6 }, 0.3))
  g.add(rbox(3.2, 10, 0.7, dark, { y: 2.5, z: 2.7 }, 0.3))
  g.add(rbox(4.2, 0.5, 2, '#f0d9b0', { y: 13.2, z: 3.2 }, 0.2))
  for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(noOutline(taperRod3([x * 1.2, 12, 3.2], [x * 0.6, 48.5, 3.05], 0.05, 0.05, '#e8e8e8', 4)))
  for (const s of [-1, 1]) g.add(noOutline(P(rbox(0.5, 5, 0.3, '#3a2a20', {}, 0.15), s * 4.2, 11.5, 2.2, 0, 0, s * 0.15)))
  g.add(puck(2.6, 1, dark, { x: -5, y: 1.2, z: 2.2 }))
  return g
}

/** 琴弓：沿 x，给中心，弓杆在上 */
function bowStick(len: number, x: number, y: number, z: number, stickC: string) {
  return G(
    cylX(0.35, len, stickC, x, y + 1.2, z, 8),
    noOutline(rbox(len * 0.92, 0.15, 0.8, '#f6f2e8', { x, y, z }, 0.05)),
    rbox(4, 2, 1.2, DARK, { x: x - len / 2 + 4, y: y - 0.2, z }, 0.3),
  )
}

/** 小提琴（打开的琴盒）：[琴盒, 内衬, 琴木色] */
function violinCase(p: string[]) {
  const [shellC, lining, wood] = p
  const g = new THREE.Group()
  g.add(tray(78, 8, 24, 1.2, shellC, { z: 2 }))
  g.add(rbox(75.4, 1.5, 21.4, lining, { y: 1.2, z: 2 }, 0.5))
  const v = P(G(violin(wood, DARK)), 0, 4.3, 0, -PI / 2)
  g.add(P(G(v), 29.3, 0, 2, 0, PI / 2))
  g.add(rbox(12, 3, 8, shade(lining, -0.1), { x: -33, y: 2.7, z: 2 }, 1))
  // 立起的盒盖
  const lid = G(rbox(78, 24, 4, shellC, { z: -2 }, 1.2), rbox(75, 21.6, 0.6, lining, { y: 1.2, z: 0.3 }, 0.3), bowStick(70, 0, 12, 1.2, '#7a4a2a'))
  g.add(P(lid, 0, 8, -10, -0.18))
  g.add(rbox(10, 1.4, 1.6, DARK, { y: 4, z: 14.6 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2.4, 2, 0.8, METAL, { x: s * 20, y: 5.5, z: 14.3 }, 0.3))
  return g
}

/** 小提琴（支架）：[支架, 琴木色, 黑件] */
function violinStand(p: string[]) {
  const [stand, wood, dark] = p
  const g = new THREE.Group()
  const t = 0.16
  g.add(P(G(violin(wood, dark)), 0, 8, 3, -t))
  for (const a of [PI / 2, PI / 2 + 2.1, PI / 2 - 2.1]) g.add(rod3([0, 8, -2], [Math.cos(a) * 13, 0.6, -2 - Math.sin(a) * 13], 0.6, stand))
  g.add(rod3([-6, 7.4, 3], [6, 7.4, 3], 0.7, stand))
  for (const s of [-1, 1]) g.add(rod3([s * 6, 7.4, 3], [s * 6, 9.5, 5], 0.5, stand))
  g.add(rod3([0, 8, -2], [0, 46, -8], 0.6, stand))
  g.add(rod3([-2.5, 46, -8], [2.5, 46, -8], 0.5, stand))
  for (const s of [-1, 1]) g.add(rod3([s * 2.5, 46, -8], [s * 2.5, 46, -2.5], 0.45, stand))
  return g
}

/** 大提琴（支架）：[琴木色, 支架, 黑件] */
function celloStand(p: string[]) {
  const [wood, stand, dark] = p
  const g = new THREE.Group()
  const t = 0.18
  const k = 2.1
  const vc = violin(wood, dark)
  vc.scale.setScalar(k)
  const body = G(vc, cyl(0.5, 0.5, 12, METAL, { y: -12 }, 8))
  g.add(P(body, 0, 12, 8, -t))
  g.add(puck(3, 1.2, RUBBER, { y: 0, z: 8 }))
  // 底座托架 + 后撑杆
  g.add(rbox(50, 2.5, 30, stand, { y: 0, z: -2 }, 1))
  for (const s of [-1, 1]) g.add(rod3([s * 22, 2.5, 2], [s * 20, 22, 6], 1, stand))
  g.add(rod3([0, 2.5, -14], [0, 92, -14], 1.2, stand))
  g.add(rod3([-4, 92, -14], [4, 92, -14], 0.8, stand))
  for (const s of [-1, 1]) g.add(rod3([s * 4, 92, -14], [s * 4, 92, -10], 0.6, stand))
  return g
}

/** 电吉他 / 电贝斯：沿 y 立着，背面 z = -2.2。[琴身, 护板, 指板木, 金属] */
function eGuitar(bodyC: string, guard: string, neckC: string, metal: string, bass = false) {
  const g = new THREE.Group()
  const k = bass ? 1.08 : 1
  const pts: V2[] = ([[0, 0], [9, 1], [15, 5], [16, 12], [13.5, 20], [12.5, 25], [14, 32], [15.5, 39], [14, bass ? 50 : 45], [11.5, bass ? 51 : 46], [9.5, 41], [6, 36.5], [-4, 36.5], [-7.5, 39], [-10.5, bass ? 45 : 42], [-12.5, bass ? 44 : 40.5], [-12.5, 33], [-11.5, 26], [-13.5, 20], [-16, 12], [-15, 5], [-9, 1]] as V2[]).map(([x, y]) => [x * k, y * k])
  g.add(flat(pts, 4.4, bodyC, true, 0.8))
  g.add(P(flat(pts.map(([x, y]): V2 => [x * 0.72 - 1, y * 0.8 + 4]), 0.3, guard, true, 0.1), 0, 0, 2.35))
  const top = bass ? 96 : 82
  const n0 = 34 * k
  const nw = bass ? 4.6 : 5
  g.add(rbox(nw, top - n0, 2.2, neckC, { y: n0, z: 0.4 }, 0.6))
  g.add(paintPanel(nw - 0.2, top - n0 - 1, `int-fret-${neckC}-${bass}`, drawFretboard(shade(neckC, -0.25), '#c9c9c9', bass ? 20 : 22), { y: n0 + 1, z: 1.55 }))
  // 琴头
  const head = flat(bass ? [[-3, 0], [3, 0], [5, 6], [6, 20], [3, 23], [0, 22], [-3, 14]] : [[-3, 0], [3, 0], [4.5, 5], [5, 17], [2.5, 19], [-1, 17], [-3.5, 10]], 1.6, neckC, true, 0.4)
  g.add(P(head, 0, top - 0.5, 0))
  const nTun = bass ? 4 : 6
  for (let i = 0; i < nTun; i++) {
    const y = top + 3 + i * (bass ? 4.6 : 2.4)
    g.add(cylZ(0.6, 1.6, metal, 3.2 - i * 0.15, y, -1.4, 8))
  }
  // 拾音器、琴桥、旋钮
  const pick = bass ? [18, 26] : [12, 19, 26]
  for (const y of pick) g.add(rbox(8, 2, 0.6, DARK, { y: y * k, z: 2.5 }, 0.3))
  g.add(rbox(8, 3, 0.7, metal, { y: 7 * k, z: 2.5 }, 0.3))
  for (const [x, y] of [[8, 8], [10, 12], [11.5, 16]] as V2[]) g.add(cylZ(0.9, 1, DARK, x * k, y * k, 2.9, 12))
  for (let i = 0; i < nTun; i++) {
    const x = (i - (nTun - 1) / 2) * (bass ? 1.1 : 0.8)
    g.add(noOutline(taperRod3([x * 1.1, 8 * k, 3.1], [x * 0.7, top, 1.9], 0.05, 0.05, '#e8e8e8', 4)))
  }
  return { g, top: top + (bass ? 23 : 19) }
}

/** 吉他支架（A 字），琴往后仰 t。返回琴的放置参数 */
function guitarOnStand(inst: THREE.Group, top: number, stand: string) {
  const g = new THREE.Group()
  const t = 0.24
  const yb = 12
  const zb = 6
  g.add(P(G(inst), 0, yb, zb, -t))
  // 琴颈靠点（沿琴身 L 处的背面）
  const L = top * 0.66
  const ny = yb + L * Math.cos(t) - 2.2 * Math.sin(t)
  const nz = zb - L * Math.sin(t) - 2.2 * Math.cos(t)
  // 前脚托
  g.add(rod3([-12, yb - 1.4, zb + 2], [12, yb - 1.4, zb + 2], 1, RUBBER))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 12, yb - 1.4, zb + 2], [s * 16, 0.8, zb + 8], 0.9, stand))
    g.add(rod3([s * 12, yb - 1.4, zb + 2], [s * 4, ny - 2, nz - 1.2], 0.9, stand))
    g.add(rod3([s * 12, yb - 1.4, zb + 4.2], [s * 12, yb + 1.5, zb + 4.2], 0.8, RUBBER))
  }
  g.add(rod3([0, ny - 2, nz - 1.2], [0, 0.8, nz - 16], 0.9, stand))
  // 颈托
  g.add(rod3([-3.5, ny - 2, nz - 1.2], [3.5, ny - 2, nz - 1.2], 0.9, RUBBER))
  return g
}

/** 电吉他（支架）：[琴身, 护板, 琴颈木] */
const eGuitarStand = (bass: boolean) => (p: string[]) => {
  const { g, top } = eGuitar(p[0], p[1], p[2], METAL, bass)
  return guitarOnStand(g, top, DARK)
}

const E_GUITAR_MOUNT = 100
/** 电吉他（壁挂）：琴头挂在墙钩上，背面贴墙。[琴身, 护板, 琴颈木] */
function eGuitarWall(p: string[]) {
  const { g: inst, top } = eGuitar(p[0], p[1], p[2], METAL)
  const g = new THREE.Group()
  g.add(P(G(inst), 0, 0, 2.2 + 3.4))
  // 墙板 + 挂钩（托住琴头下面的琴颈）
  g.add(rbox(8, 12, 1.6, shade(p[2], -0.1), { y: top - 26, z: 0.8 }, 0.6))
  for (const s of [-1, 1]) g.add(rod3([s * 3.6, top - 22, 1.6], [s * 3.6, top - 22.8, 7.6], 0.6, DARK), ball(0.9, RUBBER, { x: s * 3.6, y: top - 22.4, z: 7.8 }))
  return fit(g, E_GUITAR_MOUNT)
}

/** 吉他音箱：[外皮, 网布, 面板] */
function guitarAmp(p: string[]) {
  const [tolex, grille, panel] = p
  const g = new THREE.Group()
  g.add(rbox(50, 40, 26, tolex, { y: 1.5 }, 1.8))
  g.add(rbox(44, 27, 0.6, grille, { y: 4.5, z: 13 }, 0.4))
  for (let i = 0; i < 6; i++) g.add(noOutline(rbox(43, 0.3, 0.2, shade(grille, -0.12), { y: 6.5 + i * 4.2, z: 13.35 }, 0.1)))
  g.add(rbox(44, 7, 0.6, panel, { y: 33, z: 13 }, 0.3))
  for (let i = 0; i < 6; i++) g.add(cylZ(1, 1.4, DARK, -14 + i * 5.2, 36.5, 13.9, 12))
  g.add(litOutlined(cylZ(0.6, 0.6, '#ff6a5a', 18, 36.5, 13.6, 8), '#ff6a5a', 0.8))
  g.add(rbox(8, 1.6, 0.6, METAL, { x: -15, y: 25, z: 13.4 }, 0.3))
  g.add(rbox(16, 2, 3, DARK, { y: 41.5 }, 0.8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.6, 1.5, RUBBER, { x: sx * 21, z: sz * 9 }, 10))
  return g
}

/** 萨克斯（支架）：[管身, 支架, 按键] */
function saxStand(p: string[]) {
  const [brass, stand, key] = p
  const g = new THREE.Group()
  const sax = new THREE.Group()
  sax.add(taperPath([[-9, 72, 0], [-6, 74, 0], [-2, 71, 0], [0, 66, 0]], 0.6, 1.1, brass))
  sax.add(cyl(0.7, 0.9, 4, DARK, {}, 10).translateX(-10.5).translateY(71).rotateZ(1.2))
  sax.add(taperPath([[0, 66, 0], [0.3, 46, 0], [1, 24, 0], [3, 14, 0], [8, 11, 0], [12, 15, 0], [13, 24, 0], [13.6, 31, 0]], 1.4, 4.2, brass, 16))
  sax.add(cup(8, 4.3, 7, 0.4, brass, { x: 13.7, y: 30.5 }))
  for (let i = 0; i < 6; i++) sax.add(ball(0.8, key, { x: 0.6 - i * 0.05, y: 56 - i * 4.5, z: 1.8 + i * 0.25 }, [1, 1, 0.5]))
  for (let i = 0; i < 4; i++) sax.add(ball(1.2, brass, { x: 9 + i * 1.2, y: 15 + i * 3, z: 2.6 }, [1, 1, 0.5]))
  g.add(P(sax, -2, 4, 0))
  // 支架：三脚 + 底托 + 立杆
  for (const a of [PI / 2, PI / 2 + 2.1, PI / 2 - 2.1]) g.add(rod3([3, 9, 0], [3 + Math.cos(a) * 15, 0.6, Math.sin(a) * 15], 0.7, stand))
  g.add(P(torus(4.5, 0.7, stand, {}, PI), 4, 12.5, 0, 0, 0, PI))
  g.add(rod3([3, 9, 0], [3, 12.3, 0], 0.7, stand))
  g.add(rod3([3, 9, 0], [-6, 44, -5], 0.7, stand))
  g.add(rod3([-6, 44, -5], [-2, 44, -2.5], 0.6, RUBBER))
  return fit(g)
}

/** 小号（平放）：[管身, 按键, 吹嘴] */
function trumpet(p: string[]) {
  const [brass, key, mouth] = p
  const g = new THREE.Group()
  const y1 = 5
  const y2 = 9.5
  g.add(taperPath([[-17, y2, 0], [-6, y2, 0]], 0.55, 0.65, brass))
  g.add(taperPath([[-6, y1, 0], [10, y1, 0], [16, y1, 0]], 0.65, 1.2, brass))
  g.add(taperPath([[-6, y2, 0], [-10, y2 - 0.2, 0], [-12.5, (y1 + y2) / 2, 0], [-10, y1 + 0.2, 0], [-6, y1, 0]], 0.65, 0.65, brass))
  g.add(taperPath([[4, y2, 0], [12, y2, 0], [15, (y1 + y2) / 2, 0], [12, y1 + 0.2, 0]], 0.6, 0.6, brass))
  g.add(cup(6, 1.2, 14, 0.3, brass, { x: 16, y: y1, rz: -PI / 2 }))
  for (let i = 0; i < 3; i++) {
    const x = -3 + i * 2.6
    g.add(cyl(1.2, 1.2, 9, brass, { x, y: 2.5 }, 14))
    g.add(cyl(0.4, 0.4, 2, METAL, { x, y: 11.5 }, 8), puck(1, 0.8, key, { x, y: 13.4 }))
  }
  g.add(cylX(0.9, 3, mouth, -18.5, y2, 0, 12))
  return fit(g)
}

/** 长笛（打开的琴盒）：[琴盒, 内衬, 笛身] */
function fluteCase(p: string[]) {
  const [shellC, lining, silver] = p
  const g = new THREE.Group()
  g.add(tray(40, 4.5, 12, 0.8, shellC))
  g.add(rbox(38.4, 1.4, 10.4, lining, { y: 0.8 }, 0.4))
  const pieces: [number, number, number][] = [[33, -2.8, -1.5], [20, 0, -8], [12, 2.8, -12]]
  for (const [len, z, x] of pieces) g.add(cylX(0.95, len, silver, x, 3.15, z, 14))
  for (let i = 0; i < 8; i++) g.add(ball(0.55, silver, { x: -14 + i * 3.6, y: 4.1, z: -2.8 }, [1, 0.5, 1]))
  g.add(ball(0.5, silver, { x: -8, y: 4, z: 0 }, [1.4, 0.6, 1]))
  return fit(g)
}

/** 单簧管（立在支架上）：[管身, 按键, 支架] */
function clarinetStand(p: string[]) {
  const [body, key, stand] = p
  const g = new THREE.Group()
  for (const a of [0, 2.1, 4.2]) g.add(rod3([0, 4, 0], [Math.cos(a) * 6.5, 0.5, Math.sin(a) * 6.5], 0.5, stand))
  g.add(cyl(0.6, 0.6, 9, stand, { y: 3 }, 8))
  g.add(cup(3.4, 1.5, 7, 0.3, body, { y: 3 }))
  g.add(cyl(1.5, 1.5, 48, body, { y: 10 }, 16))
  for (const y of [10, 26, 42, 58]) g.add(cyl(1.62, 1.62, 1, key, { y }, 16))
  g.add(cyl(1.4, 1.1, 6, body, { y: 58 }, 16))
  g.add(cyl(1.1, 0.7, 3, DARK, { y: 64 }, 12))
  for (let i = 0; i < 8; i++) g.add(ball(0.5, key, { y: 15 + i * 5, z: 1.45 }, [1, 1, 0.5]))
  for (let i = 0; i < 4; i++) g.add(noOutline(rbox(0.4, 3, 0.4, key, { x: 1.2, y: 22 + i * 7, z: 0.9 }, 0.15)))
  return g
}

/** 口琴 + 盒：[盖板, 琴格, 盒] */
function harmonica(p: string[]) {
  const [cover, comb, box] = p
  const g = new THREE.Group()
  g.add(tray(12, 2.4, 4.6, 0.4, box, { x: -1, z: -1.6 }))
  g.add(rbox(10.2, 0.8, 3.6, comb, { x: -1, y: 0.4, z: -1.6 }, 0.2))
  // 口琴斜靠在盒前
  const h = new THREE.Group()
  h.add(rbox(10.4, 1, 2.6, comb, { y: 0.6 }, 0.2))
  h.add(rbox(10.6, 0.6, 2.8, cover, {}, 0.25), rbox(10.6, 0.6, 2.8, cover, { y: 1.6 }, 0.25))
  for (let i = 0; i < 10; i++) h.add(noOutline(rbox(0.55, 0.5, 0.2, DARK, { x: -4.5 + i, y: 0.85, z: 1.25 }, 0.1)))
  g.add(P(h, 0.5, 0, 2.6))
  return fit(g)
}

/** 手风琴（立放）：[琴身, 风箱, 点缀] */
function accordion(p: string[]) {
  const [body, bellows, acc] = p
  const g = new THREE.Group()
  g.add(rbox(14, 40, 20, body, { x: 14, y: 1 }, 1.5))
  g.add(rbox(10, 38, 18, body, { x: -18, y: 2 }, 1.5))
  for (let i = 0; i < 9; i++) g.add(rbox(2.5, 36 - (i % 2) * 1.2, 17 - (i % 2) * 1.2, i % 2 ? shade(bellows, -0.12) : bellows, { x: -12.4 + i * 2.35, y: 3 + (i % 2) * 0.6 }, 0.4))
  g.add(rbox(5, 36, 1.2, IVORY, { x: 9.5, y: 3, z: 10.4 }, 0.3))
  g.add(paintPanel(4.6, 35, `int-acc-keys`, (c, W, H) => {
    c.fillStyle = IVORY
    c.fillRect(0, 0, W, H)
    const n = 20
    const kh = H / n
    c.fillStyle = '#999'
    for (let i = 1; i < n; i++) c.fillRect(0, i * kh, W, 1)
    c.fillStyle = '#26262a'
    for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) c.fillRect(0, (i + 1) * kh - kh * 0.3, W * 0.6, kh * 0.6)
  }, { x: 9.5, y: 3.5, z: 11.1 }))
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) g.add(ball(0.7, IVORY, { x: -21 + c * 3, y: 10 + r * 4.5 + c * 1.2, z: 9.2 }, [1, 1, 0.5]))
  // 装饰条比键盘面板靠后 0.3cm，避免共面闪烁
  g.add(rbox(10, 1.2, 1, acc, { x: 14, y: 30, z: 10.3 }, 0.3))
  for (const x of [-18, 14]) g.add(rbox(3, 4, 4, acc, { x, y: 41 }, 0.8))
  g.add(rbox(36, 1, 2.4, acc, { x: -2, y: 44, z: 0 }, 0.4))
  return g
}

/** 竖琴：[木色, 琴弦, 点缀] */
function harp(p: string[]) {
  const [wood, str, acc] = p
  const g = new THREE.Group()
  g.add(rbox(34, 6, 30, wood, { x: -16 }, 1.5))
  g.add(taperRod3([-30, 5, 0], [-30, 150, 0], 2.6, 2.2, wood, 12))
  g.add(ball(3.4, acc, { x: -30, y: 152 }))
  // 共鸣箱：从柱脚附近斜升到肩
  const a: V2 = [-20, 10]
  const b: V2 = [30, 120]
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const sb = rbox(len, 12, 26, wood, { y: -6 }, 3)
  g.add(P(G(sb), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, 0, 0, ang))
  g.add(P(G(rbox(len - 8, 0.6, 3, shade(wood, -0.2), { y: 6 }, 0.2)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, 0, 0, ang))
  // 琴颈：贝塞尔曲线
  const neck = new THREE.QuadraticBezierCurve(new THREE.Vector2(30, 122), new THREE.Vector2(-2, 182), new THREE.Vector2(-30, 146))
  const np = neck.getPoints(12)
  for (let i = 1; i < np.length; i++) g.add(taperRod3([np[i - 1].x, np[i - 1].y, 0], [np[i].x, np[i].y, 0], 2.6, 2.6, wood))
  for (let i = 1; i < np.length - 1; i++) g.add(ball(2.6, wood, { x: np[i].x, y: np[i].y }))
  const neckY = (x: number) => {
    let best = np[0]
    for (const v of np) if (Math.abs(v.x - x) < Math.abs(best.x - x)) best = v
    return best.y
  }
  const n = 22
  for (let i = 0; i < n; i++) {
    const x = -24 + (i / (n - 1)) * 48
    const yb = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) + 6 / Math.cos(ang)
    const yt = neckY(x) - 2.4
    if (yt - yb < 4) continue
    const c = i % 7 === 0 ? '#d65a3c' : i % 7 === 3 ? '#3d5a80' : str
    g.add(noOutline(taperRod3([x, yb, 0], [x, yt, 0], 0.15, 0.15, c, 4)))
  }
  return fit(g)
}

/** 三味线（立在架上）：[木色, 皮面, 架子] */
function shamisen(p: string[]) {
  const [wood, skin, stand] = p
  const inst = new THREE.Group()
  inst.add(rbox(20, 20, 9, wood, {}, 1.8))
  for (const s of [-1, 1]) inst.add(rbox(18.4, 18.4, 0.4, skin, { y: 0.8, z: s * 4.6 }, 0.2))
  inst.add(rbox(2.6, 76, 2.4, shade(wood, -0.1), { y: 19 }, 0.5))
  inst.add(P(G(rbox(3.4, 13, 2.4, shade(wood, -0.1), {}, 0.6)), 0, 94.5, -0.5, -0.35))
  for (let i = 0; i < 3; i++) inst.add(cylX(0.45, 8, IVORY, 0, 97 + i * 3.2, -1.6 - i * 1.1, 8))
  inst.add(rbox(4, 1, 1, IVORY, { y: 5, z: 5 }, 0.2))
  for (const x of [-0.6, 0, 0.6]) inst.add(noOutline(taperRod3([x * 1.5, 2, 5.1], [x, 94, 1.4], 0.05, 0.05, '#f2ecd8', 4)))
  const g = new THREE.Group()
  const t = 0.1
  g.add(rbox(26, 2, 24, stand, {}, 0.8))
  g.add(P(G(inst), 0, 2, 4, -t))
  const L = 62
  g.add(rbox(4, 2 + L * Math.cos(t) - 1, 3, stand, { y: 2, z: 4 - L * Math.sin(t) - 1.2 - 1.5 }, 0.8))
  g.add(rbox(8, 2, 4, stand, { y: 1 + L * Math.cos(t), z: 4 - L * Math.sin(t) - 1.2 - 1.5 }, 0.6))
  return fit(g)
}

/** 筝（和风长琴）：[木色, 琴柱, 架] */
function koto(p: string[]) {
  const [wood, bridge, stand] = p
  const g = new THREE.Group()
  for (const x of [-78, 78]) g.add(rbox(10, 6, 30, stand, { x }, 1))
  g.add(rbox(180, 6, 26, wood, { y: 6 }, 2.5))
  g.add(rbox(176, 1.2, 22, shade(wood, 0.05), { y: 11.4 }, 0.5))
  for (const x of [-84, 84]) g.add(rbox(3, 4, 24, shade(wood, -0.2), { x, y: 12 }, 0.6))
  const nS = 13
  for (let i = 0; i < nS; i++) {
    const z = -10.5 + (i / (nS - 1)) * 21
    g.add(noOutline(taperRod3([-84, 16.1, z], [84, 16.1, z], 0.06, 0.06, '#f6efd8', 4)))
    const x = 30 - i * 6 + Math.sin(i * 1.7) * 6
    g.add(cyl(0.5, 1.2, 3.5, bridge, { x, y: 12.6, z }, 6))
  }
  g.add(rbox(20, 0.8, 10, '#d65a3c', { x: -68, y: 12.6, z: 0 }, 0.3))
  return g
}

/** 桶身：轴沿 y、中间鼓起，底面在 0 */
function barrel(r0: number, bulge: number, h: number, color: string) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(r0 + bulge * Math.sin((i / 10) * PI), (i / 10) * h))
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 太鼓（台架上，鼓面斜朝前）：[鼓身, 鼓皮, 台架] */
function taiko(p: string[]) {
  const [body, skin, stand] = p
  const g = new THREE.Group()
  const d = new THREE.Group()
  d.add(barrel(20, 3, 30, body))
  for (const y of [0, 30]) {
    d.add(cyl(20.8, 20.8, 0.6, skin, { y: y - 0.3 }, 28))
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * PI * 2
      d.add(ball(0.6, DARK, { x: Math.cos(a) * 19.6, y: y + (y ? -1.2 : 1.2), z: Math.sin(a) * 19.6 }))
    }
  }
  for (const s of [-1, 1]) d.add(torus(2.2, 0.6, METAL, { x: s * 23, y: 15, ry: PI / 2 }))
  g.add(P(d, 0, 48, -12, 1.15))
  for (const s of [-1, 1]) {
    g.add(rbox(4, 46, 6, stand, { x: s * 27, z: 6 }, 1))
    g.add(rbox(4, 36, 6, stand, { x: s * 27, z: -16 }, 1))
    g.add(rbox(4, 4, 34, stand, { x: s * 27, y: 0 }, 1))
    // 枢轴销对准鼓身两侧的吊环，再用短支架接到前立柱顶
    g.add(cylX(1.2, 4, METAL, s * 24.5, 48 + 15 * Math.cos(1.15), -12 + 15 * Math.sin(1.15), 10))
    g.add(rbox(4, 12, 4, stand, { x: s * 27, y: 44, z: 2.5 }, 1))
  }
  for (const z of [-16, 6]) g.add(rbox(58, 4, 4, stand, { y: 6, z }, 1))
  for (const s of [-1, 1]) g.add(rod3([s * 6, 1, 22], [s * 3, 1, 4], 1, '#e8c89a'))
  return fit(g)
}

/** 尺八（插在座上）：[竹色, 节, 座] */
function shakuhachi(p: string[]) {
  const [bamboo, node, base] = p
  const g = new THREE.Group()
  g.add(cyl(6, 6.5, 2, base, {}, 24))
  g.add(cup(3.4, 3.4, 5, 0.5, base, { y: 2 }))
  g.add(ball(3, bamboo, { y: 5.5 }, [1, 0.8, 1]))
  g.add(cyl(1.9, 2.6, 50, bamboo, { y: 5.5 }, 16))
  for (const y of [14, 24, 34, 44, 54]) g.add(cyl(2.7 - (y - 5) * 0.014, 2.7 - (y - 5) * 0.014, 0.8, node, { y }, 16))
  for (const y of [18, 22, 28, 32]) g.add(noOutline(ball(0.5, '#2a1e14', { y, z: 2.35 - y * 0.012 }, [1, 1, 0.4])))
  g.add(noOutline(P(rbox(1.6, 0.4, 1.2, '#f6efd8', {}, 0.1), 0, 55.3, 1.2, -0.4)))
  return g
}

/** 小乐器组：铃鼓、沙锤、卡祖笛、三角铁 [主色, 副色, 点缀] */
function smallInstruments(p: string[]) {
  const [a, b, acc] = p
  const g = new THREE.Group()
  // 铃鼓
  g.add(cup(9, 9, 4.2, 0.8, a, { x: -8 }))
  g.add(cyl(8.6, 8.6, 0.3, IVORY, { x: -8, y: 3.6 }, 28))
  for (let k = 0; k < 5; k++) {
    const t = (k / 5) * PI * 2
    for (const y of [1.4, 2.2]) g.add(puck(1.4, 0.5, METAL, { x: -8 + Math.cos(t) * 9, y, z: Math.sin(t) * 9 }))
  }
  // 沙锤
  for (const [z, c] of [[-3, b], [3, acc]] as [number, string][]) {
    g.add(ball(3.4, c, { x: 6, y: 3.4, z }, [1, 1, 1]))
    g.add(cylX(0.8, 9, c, 13, 1.6, z * 1.3, 10))
  }
  // 卡祖笛
  g.add(cylX(1.1, 9, acc, 10, 1.1, 8, 12))
  g.add(cyl(0.9, 0.9, 1, a, { x: 10, y: 1.5, z: 8 }, 12))
  return fit(g)
}

/** 合成器 / MIDI 键盘：[机身, 白键, 点缀] */
const synth = (n: number, w: number, d: number, pads: boolean) => (p: string[]) => {
  const [body, white, acc] = p
  const g = new THREE.Group()
  const kd = d * 0.46
  const cheek = pads ? 0 : 3
  g.add(rbox(w - cheek * 2, 7, d, body, {}, 1.4))
  if (!pads) for (const s of [-1, 1]) g.add(rbox(cheek, 9, d, acc === GOLD ? N.oak : shade(body, -0.15), { x: s * (w / 2 - cheek / 2) }, 1))
  const kw = w - cheek * 2 - 6
  g.add(rbox(kw, 1.4, kd, white, { y: 7, z: d / 2 - kd / 2 - 1 }, 0.3))
  g.add(paintTop(kw - 0.4, kd - 0.4, `int-keys${n}-${white}`, drawKeys(n, white, '#26262a', 0, 0.62), 0, 8.7, d / 2 - kd / 2 - 1))
  const zc = -d / 2 + (d - kd) / 2 - 0.5
  g.add(litOutlined(rbox(w * 0.14, 0.4, d * 0.18, '#8fe3ff', { x: -w * 0.08, y: 7, z: zc }, 0.15), '#8fe3ff'))
  for (let i = 0; i < (pads ? 4 : 8); i++) g.add(cyl(1, 1, 1.4, DARK, { x: w * 0.12 + i * (pads ? 4 : 4.2), y: 7, z: zc - 2.2 }, 12), cyl(0.9, 0.9, 1.2, acc, { x: w * 0.12 + i * (pads ? 4 : 4.2), y: 7, z: zc + 2.4 }, 12))
  if (pads) {
    for (let i = 0; i < 8; i++) g.add(rbox(3.4, 0.8, 3.4, i % 2 ? acc : shade(acc, 0.2), { x: -w / 2 + 4 + (i % 4) * 4, y: 7, z: zc - 1.8 + Math.floor(i / 4) * 4 }, 0.5))
  } else {
    for (let i = 0; i < 5; i++) g.add(rbox(0.8, 0.8, 4, DARK, { x: w * 0.3 + i * 2.4, y: 7, z: zc }, 0.2))
    for (const x of [-w / 2 + 6, -w / 2 + 9.5]) g.add(cyl(1.2, 1.2, 1.2, DARK, { x, y: 7, z: d / 2 - kd / 2 - 1, rz: PI / 2 }, 12))
  }
  return g
}

/** DJ 控制器：[机身, 转盘, 点缀] */
function djDeck(p: string[]) {
  const [body, platter, acc] = p
  const g = new THREE.Group()
  g.add(rbox(70, 4, 38, body, {}, 1.4))
  g.add(rbox(68, 0.6, 36, shade(body, -0.08), { y: 4 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(puck(9, 1.6, platter, { x: s * 21, y: 4.6, z: -3 }))
    g.add(noOutline(cyl(6, 6, 0.3, shade(platter, 0.25), { x: s * 21, y: 6.2, z: -3 }, 28)))
    g.add(cyl(1, 1, 0.6, acc, { x: s * 21, y: 6.4, z: -3 }, 12))
    for (let i = 0; i < 8; i++) g.add(litOutlined(rbox(3, 0.6, 2.4, i % 2 ? acc : shade(acc, 0.25), { x: s * 21 - 7.2 + (i % 4) * 4.8, y: 4.4, z: 10 + Math.floor(i / 4) * 3 }, 0.4), i % 2 ? acc : shade(acc, 0.25), 0.4))
  }
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 4; r++) g.add(cyl(0.9, 0.9, 1.2, DARK, { x: -2.5 + c * 5, y: 4.6, z: -14 + r * 4 }, 12))
    g.add(rbox(0.8, 0.4, 8, DARK, { x: -2.5 + c * 5, y: 4.6, z: 6 }, 0.2))
    g.add(rbox(1.6, 1.4, 1.2, METAL, { x: -2.5 + c * 5, y: 4.8, z: 5 + c * 2 }, 0.3))
  }
  g.add(rbox(10, 0.4, 0.8, DARK, { y: 4.6, z: 14 }, 0.2), rbox(1.4, 1.4, 1.4, METAL, { x: 1, y: 4.8, z: 14 }, 0.3))
  return g
}

/** 谱架（带乐谱）：[架子, 纸, 墨] */
function musicStand(p: string[]) {
  const [stand, paper, ink] = p
  const g = new THREE.Group()
  for (const a of [PI / 2, PI / 2 + 2.1, PI / 2 - 2.1]) g.add(rod3([0, 26, 0], [Math.cos(a) * 22, 0.6, Math.sin(a) * 22], 0.8, stand))
  g.add(cyl(1, 1, 76, stand, { y: 24 }, 10))
  g.add(cyl(1.4, 1.4, 4, stand, { y: 60 }, 10))
  const desk = new THREE.Group()
  desk.add(rbox(50, 32, 1, stand, {}, 0.4))
  desk.add(rbox(50, 1.2, 3.6, stand, { z: 1.8 }, 0.4))
  desk.add(paintPanel(21, 28, `int-score-${paper}-a`, drawScore(paper, ink, 7), { x: -10.8, y: 1.6, z: 0.9 }))
  desk.add(paintPanel(21, 28, `int-score-${paper}-b`, drawScore(paper, ink, 11), { x: 10.8, y: 1.6, z: 0.9 }))
  g.add(P(desk, 0, 99, 0, -0.42))
  return fit(g)
}

/** 节拍器：[机身, 刻度面, 摆锤] */
function metronome(p: string[]) {
  const [body, face, weight] = p
  const g = new THREE.Group()
  g.add(rbox(11, 2, 10, body, {}, 0.6))
  const h = 19
  g.add(P(cyl(2.2, 6.6, h, body, {}, 4), 0, 2 + h / 2, 0, 0, PI / 4))
  const half = (y: number) => (6.6 + ((2.2 - 6.6) * (y - 2)) / h) * Math.SQRT1_2
  const ang = Math.atan2(6.6 - 2.2, h) * Math.SQRT1_2 * 1.4
  g.add(P(G(rbox(3, 12, 0.3, face, { y: 0 }, 0.1)), 0, 6, half(6) + 0.1, -ang))
  const a: V3 = [0, 5, half(5) + 0.5]
  const b: V3 = [2, 17, half(17) + 0.5]
  g.add(taperRod3(a, b, 0.18, 0.18, METAL, 6))
  g.add(P(rbox(1.6, 1.4, 1, weight, {}, 0.3), 1.5, 13.5, half(13.5) + 0.6, 0, 0, -Math.atan2(2, 12)))
  g.add(cylX(0.5, 2, METAL, 4.6, 7, 0, 8))
  return g
}

// =====================================================================
// 兴趣摆件
// =====================================================================

const SKIN = '#ffe3d1'
const SOIL = '#8b6a4f'

/** 叶片 / 花瓣：从 (x,y,z) 朝水平方向 a 伸出，仰角 p */
function petal(len: number, color: string, x: number, y: number, z: number, a: number, p: number, sw = 0.45, st = 0.18) {
  const m = ball(len / 2, color, {}, [sw, st, 1])
  m.rotation.order = 'YXZ'
  m.rotation.set(-p, Math.atan2(Math.cos(a), Math.sin(a)), 0)
  const r = (Math.cos(p) * len) / 2
  m.position.set(x + Math.cos(a) * r, y + (Math.sin(p) * len) / 2, z + Math.sin(a) * r)
  return m
}

/** 旋转体：pts 为 [半径, 高度] */
function lathe(pts: V2[], color: string, seg = 20) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ---------- 漫画 / 宅物 ----------

/** 平放的书：书脊朝 +z（spineBack 时朝 -z），底面中心 (x,y,z) */
function bookFlat(w: number, t: number, d: number, cover: string, x: number, y: number, z: number, ry = 0, spineBack = false) {
  const s = spineBack ? -1 : 1
  const b = G(
    rbox(w, 0.2, d, cover, {}, 0.08),
    rbox(w, 0.2, d, cover, { y: t - 0.2 }, 0.08),
    rbox(w - 0.4, t - 0.4, d - 0.5, PAPER, { y: 0.2, z: s * -0.05 }, 0.08),
    rbox(w, t, 0.3, cover, { z: s * (d / 2 - 0.15) }, 0.1),
  )
  return P(b, x, y, z, 0, ry)
}

/** 漫画书堆：n 本单行本（17.6 × 11.3 × 1.5）[主色, 副色, 点缀] */
const mangaStack = (n: number) => (p: string[]) => {
  const r = rng(n * 31 + 7)
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const c = shade(p[Math.floor(r() * 3)], (r() - 0.5) * 0.25)
    const x = (r() - 0.5) * 0.8
    const z = (r() - 0.5) * 0.6
    const ry = (r() - 0.5) * 0.08
    const book = bookFlat(17.6, 1.5, 11.3, c, 0, 0, 0)
    book.add(noOutline(rbox(3.2, 0.9, 0.2, '#ffffff', { x: -5, y: 0.3, z: 5.75 }, 0.05)))
    g.add(P(book, x, i * 1.5, z, 0, ry))
  }
  return fit(g)
}

/** 漫画全套（一排立放 + 书挡）：书脊画在一张贴图上 [系列 A, 系列 B, 书挡] */
function mangaRow(p: string[]) {
  const [a, b, end] = p
  const g = new THREE.Group()
  const n = 34
  const t = 1.6
  const x0 = (-n * t) / 2
  for (let i = 0; i < n; i++) g.add(rbox(t - 0.04, 17.6, 11.3, i < 21 ? a : b, { x: x0 + t / 2 + i * t }, 0.15))
  g.add(paintPanel(n * t, 17.4, `int-manga-row-${a}-${b}`, (c, W, H) => {
    const bw = W / n
    for (let i = 0; i < n; i++) {
      const col = i < 21 ? a : b
      const x = i * bw
      c.fillStyle = shade(col, ((i % 21) % 3) * 0.03)
      c.fillRect(x, 0, bw, H)
      c.fillStyle = '#ffffff'
      c.fillRect(x + bw * 0.12, H * 0.06, bw * 0.76, H * 0.36)
      c.fillStyle = shade(col, -0.25)
      for (let k = 0; k < 4; k++) c.fillRect(x + bw * 0.3, H * (0.1 + k * 0.075), bw * 0.4, H * 0.05)
      c.fillStyle = i % 2 ? shade(col, 0.25) : shade(i < 21 ? b : a, 0.1)
      c.beginPath()
      c.arc(x + bw / 2, H * 0.6, bw * 0.32, 0, PI * 2)
      c.fill()
      c.fillStyle = '#ffffff'
      c.fillRect(x + bw * 0.15, H * 0.82, bw * 0.7, H * 0.1)
      c.fillStyle = '#333333'
      c.font = `bold ${Math.floor(bw * 0.5)}px sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(String(i < 21 ? i + 1 : i - 20), x + bw / 2, H * 0.875)
      c.fillStyle = 'rgba(0,0,0,0.25)'
      c.fillRect(x + bw - 1, 0, 1, H)
    }
  }, { x: 0, y: 0.1, z: 11.3 / 2 + 0.3 }))
  for (const s of [-1, 1]) {
    g.add(rbox(0.4, 15, 11, end, { x: s * ((n * t) / 2 + 0.25) }, 0.15))
    g.add(rbox(5, 0.4, 11, end, { x: s * ((n * t) / 2 + 2.7) }, 0.15))
  }
  return fit(g)
}

/** 无脸小人偶（少女型），站在底座上，高约 11 */
function figGirl(hair: string, dress: string, base: string) {
  const g = new THREE.Group()
  g.add(puck(2.6, 0.6, base))
  for (const s of [-1, 1]) g.add(capsule(0.35, 2.4, SKIN, { x: s * 0.55, y: 0.6 }))
  g.add(cyl(0.9, 2.4, 3, dress, { y: 2.9 }, 16))
  g.add(capsule(0.85, 1.2, dress, { y: 5.4 }))
  for (const s of [-1, 1]) g.add(P(capsule(0.3, 2.2, SKIN), s * 1.25, 6.2, 0, 0, 0, s * 0.3))
  g.add(ball(1.7, SKIN, { y: 9.2 }))
  g.add(ball(1.85, hair, { y: 9.5, z: -0.3 }))
  for (const s of [-1, 1]) g.add(P(capsule(0.55, 2.4, hair), s * 1.9, 8, -0.5, 0, 0, s * 0.2))
  g.add(ball(0.5, base, { x: 1, y: 11, z: 0.6 }))
  return g
}

/** 机器人模型，高约 11 */
function figRobot(main: string, acc: string, base: string) {
  const g = new THREE.Group()
  g.add(rbox(5, 0.6, 4, base, {}, 0.2))
  for (const s of [-1, 1]) {
    g.add(rbox(1.2, 3.6, 1.6, main, { x: s * 0.9, y: 0.6 }, 0.3))
    g.add(rbox(1.5, 0.8, 2, acc, { x: s * 0.9, y: 0.6, z: 0.2 }, 0.2))
    g.add(rbox(1, 3, 1.1, main, { x: s * 2.3, y: 5 }, 0.3))
    g.add(rbox(1.6, 1.2, 1.6, acc, { x: s * 2.3, y: 7.6 }, 0.3))
  }
  g.add(rbox(3.6, 3.4, 2.4, main, { y: 4.2 }, 0.4))
  g.add(rbox(2.2, 1, 0.4, acc, { y: 6, z: 1.2 }, 0.15))
  g.add(rbox(2.4, 2.2, 2.2, main, { y: 7.7 }, 0.4))
  g.add(litOutlined(rbox(1.8, 0.5, 0.3, '#7fe3ff', { y: 8.6, z: 1.1 }, 0.1), '#7fe3ff', 0.7))
  g.add(cyl(0.12, 0.12, 1.2, acc, { x: 0.6, y: 9.9 }, 6), ball(0.3, acc, { x: 0.6, y: 11.2 }))
  return g
}

/** Q 版大头人偶（猫耳），高约 9 */
function figChibi(main: string, acc: string, base: string) {
  const g = new THREE.Group()
  g.add(puck(2.4, 0.6, base))
  g.add(cyl(1, 1.6, 2.6, main, { y: 0.6 }, 16))
  g.add(ball(2.5, SKIN, { y: 5.6 }))
  g.add(ball(2.65, acc, { y: 6, z: -0.35 }))
  for (const s of [-1, 1]) g.add(P(cyl(0.01, 0.9, 1.6, acc, {}, 4), s * 1.6, 8.3, -0.3, 0, 0, -s * 0.35))
  return g
}

/** 手办展示柜（亚克力罩 + 三层手办）：[框架, 手办主色, 手办副色] */
function figureCase(p: string[]) {
  const [frame, a, b] = p
  const g = new THREE.Group()
  g.add(rbox(40, 3, 25, frame, {}, 0.8))
  g.add(rbox(40, 2.5, 25, frame, { y: 43.5 }, 0.8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.2, 40.5, 1.2, frame, { x: sx * 19.4, y: 3, z: sz * 11.9 }, 0.3))
  g.add(ghostOutlined(rbox(38.6, 40.5, 0.3, GLASS, { y: 3, z: 12.2 }, 0.1), GLASS, 0.18))
  g.add(rbox(38.6, 40.5, 0.4, shade(frame, -0.1), { y: 3, z: -12.1 }, 0.1))
  for (const s of [-1, 1]) g.add(ghostOutlined(rbox(0.3, 40.5, 23.6, GLASS, { x: s * 19.5, y: 3 }, 0.1), GLASS, 0.18))
  for (const y of [16, 29.5]) g.add(ghostOutlined(rbox(38.6, 0.6, 23.6, GLASS, { y }, 0.2), GLASS, 0.4))
  g.add(litOutlined(rbox(36, 0.4, 1, '#fff4d0', { y: 43.1, z: 10 }, 0.15), '#fff4d0', 0.8))
  const tiers = [3, 16.6, 30.1]
  const makers = [() => figGirl(shade(a, 0.1), b, METAL), () => figRobot(b, a, DARK), () => figChibi(a, shade(b, -0.1), METAL)]
  tiers.forEach((y, ti) => {
    for (let k = 0; k < 3; k++) g.add(P(makers[(ti + k) % 3](), -12 + k * 12, y, (k % 2) * 2 - 1, 0, (k - 1) * -0.25))
  })
  return g
}

/** 痛包：透明窗里排满吧唧 [包身, 吧唧主色, 提手] */
function itaBag(p: string[]) {
  const [bag, badge, trim] = p
  const g = new THREE.Group()
  g.add(rbox(30, 24, 10, bag, {}, 2.5))
  g.add(rbox(25, 18, 0.6, shade(bag, 0.15), { y: 3, z: 5.1 }, 0.3))
  const cols = [badge, shade(badge, 0.2), '#ffffff', shade(badge, -0.15), C.lemon, C.sky, badge, shade(badge, 0.25), C.mint]
  for (let i = 0; i < 9; i++) {
    const x = -7.6 + (i % 3) * 7.6
    const y = 6.2 + Math.floor(i / 3) * 5.8
    g.add(cylZ(2.6, 0.5, cols[i], x, y, 5.65))
    g.add(noOutline(cylZ(1.7, 0.2, shade(cols[i], i % 2 ? -0.18 : 0.15), x, y + 0.2, 6.0, 20)))
    g.add(noOutline(ball(0.7, SKIN, { x, y: y + 0.4, z: 6.1 }, [1, 1, 0.3])))
  }
  g.add(ghostOutlined(rbox(25, 18, 0.3, GLASS, { y: 3, z: 6.4 }, 0.15), GLASS, 0.25))
  for (const s of [-1, 1]) g.add(torus(6, 0.6, trim, { y: 24, z: s * 3 }, PI))
  g.add(rbox(30.4, 2, 10.4, trim, { y: 0 }, 0.8))
  g.add(taperRod3([13, 22, 4], [15.2, 17, 5.2], 0.12, 0.12, METAL, 6))
  g.add(ball(1.8, badge, { x: 15.4, y: 15.4, z: 5.4 }))
  for (const s of [-1, 1]) g.add(ball(0.6, badge, { x: 15.4 + s * 1.2, y: 16.8, z: 5.4 }))
  return fit(g)
}

/** 亚克力立牌：[底色, 角色发色, 角色衣服] */
function acrylicStand(p: string[]) {
  const [bg, hair, dress] = p
  const g = new THREE.Group()
  g.add(ghostOutlined(rbox(9, 0.5, 5.5, GLASS, {}, 0.2), GLASS, 0.5))
  g.add(rbox(8.6, 0.12, 5.1, shade(bg, 0.1), { y: 0.05 }, 0.04))
  g.add(ghostOutlined(rbox(8.6, 14.5, 0.3, GLASS, { y: 0.5 }, 0.3), GLASS, 0.4))
  g.add(paintPanel(8, 13.8, `int-acsta-${bg}-${hair}-${dress}`, (c, W, H) => {
    c.fillStyle = shade(bg, 0.12)
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#ffffff'
    for (let k = 0; k < 8; k++) {
      c.beginPath()
      c.arc(W * ((k * 0.37) % 1), H * ((k * 0.23 + 0.05) % 0.9), W * 0.03, 0, PI * 2)
      c.fill()
    }
    const cx = W / 2
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.arc(cx, H * 0.3, W * 0.3, 0, PI * 2)
    c.fill()
    c.beginPath()
    c.moveTo(cx - W * 0.36, H * 0.95)
    c.lineTo(cx + W * 0.36, H * 0.95)
    c.lineTo(cx + W * 0.16, H * 0.45)
    c.lineTo(cx - W * 0.16, H * 0.45)
    c.fill()
    c.fillStyle = dress
    c.beginPath()
    c.moveTo(cx - W * 0.3, H * 0.92)
    c.lineTo(cx + W * 0.3, H * 0.92)
    c.lineTo(cx + W * 0.12, H * 0.48)
    c.lineTo(cx - W * 0.12, H * 0.48)
    c.fill()
    c.fillStyle = hair
    c.beginPath()
    c.arc(cx, H * 0.3, W * 0.26, 0, PI * 2)
    c.fill()
    c.fillRect(cx - W * 0.26, H * 0.3, W * 0.12, H * 0.3)
    c.fillRect(cx + W * 0.14, H * 0.3, W * 0.12, H * 0.3)
    c.fillStyle = SKIN
    c.beginPath()
    c.arc(cx, H * 0.33, W * 0.18, 0, PI)
    c.fill()
  }, { y: 0.85, z: 0.2 }))
  return g
}

/** 应援棒（三支平放）：三色发光 */
function penlights(p: string[]) {
  const g = new THREE.Group()
  p.slice(0, 3).forEach((c, i) => {
    const z = (i - 1) * 3.4
    const x = (i - 1) * 1.2
    g.add(cylX(1.3, 9, DARK, x - 6.5, 1.3, z, 14))
    g.add(cylX(1.4, 1, METAL, x - 1.5, 1.4, z, 14))
    g.add(litOutlined(cylX(1.15, 11, c, x + 4.5, 1.15, z, 14), c, 0.7))
    g.add(litOutlined(ball(1.15, c, { x: x + 10, y: 1.15, z }), c, 0.7))
    g.add(rbox(1.6, 0.6, 0.6, shade(c, -0.2), { x: x - 6, y: 2.4, z }, 0.2))
  })
  return fit(g)
}

/** 海报筒（两支立放）：[主色, 副色, 盖] */
function posterTubes(p: string[]) {
  const [a, b, capC] = p
  const g = new THREE.Group()
  g.add(cyl(4, 4, 68, a, { x: -2.6 }, 20), cyl(4.3, 4.3, 4, capC, { x: -2.6, y: 66 }, 20), cyl(4.3, 4.3, 3, capC, { x: -2.6 }, 20))
  g.add(cyl(3.2, 3.2, 54, b, { x: 5, z: 1.4 }, 20), cyl(3.5, 3.5, 3.5, capC, { x: 5, y: 52, z: 1.4 }, 20), cyl(3.5, 3.5, 2.5, capC, { x: 5, z: 1.4 }, 20))
  g.add(cyl(4.15, 4.15, 2, DARK, { x: -2.6, y: 40 }, 20))
  g.add(taperRod3([-2.6, 41, 4.1], [-2.6, 66, 4.2], 0.5, 0.5, DARK, 6))
  return fit(g)
}

// ---------- 运动 ----------

function basketball(p: string[]) {
  const [main, seam] = p
  const r = 12.2
  const g = new THREE.Group()
  g.add(ball(r, main, { y: r }))
  g.add(noOutline(torus(r + 0.03, 0.2, seam, { y: r })), noOutline(torus(r + 0.03, 0.2, seam, { y: r, ry: PI / 2 })), noOutline(torus(r + 0.03, 0.2, seam, { y: r, rx: PI / 2 })))
  for (const k of [-1, 1]) g.add(noOutline(torus(r * 0.75, 0.2, seam, { x: k * r * 0.66, y: r, ry: PI / 2 })))
  return g
}

function soccerBall(p: string[]) {
  const [main, patch] = p
  const r = 11
  const g = new THREE.Group()
  g.add(ball(r, main, { y: r }))
  const phi = (1 + Math.sqrt(5)) / 2
  const vs: V3[] = []
  for (const a of [-1, 1]) for (const b of [-1, 1]) vs.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a])
  const up = new THREE.Vector3(0, 1, 0)
  for (const v of vs) {
    const n = new THREE.Vector3(...v).normalize()
    const m = noOutline(new THREE.Mesh(new THREE.SphereGeometry(r + 0.15, 5, 2, 0, PI * 2, 0, 0.32), toon(patch)))
    m.position.set(0, r, 0)
    m.quaternion.setFromUnitVectors(up, n)
    g.add(m)
  }
  return g
}

/** 平放的球拍：拍头中心在原点（椭圆半径 a 沿 x、b 沿 z），手柄朝 -x */
function racket(frame: string, grip: string, a: number, b: number, handleLen: number, shaftLen: number, tubeR: number) {
  const g = new THREE.Group()
  const n = 40
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * PI * 2
    pts.push([Math.cos(t) * a, tubeR, Math.sin(t) * b])
  }
  for (let i = 1; i <= n; i++) g.add(taperRod3(pts[i - 1], pts[i], tubeR, tubeR, frame, 8))
  const ia = a - tubeR
  const ib = b - tubeR
  for (let z = -ib + 1.2; z < ib - 0.6; z += 1.3) {
    const half = ia * Math.sqrt(Math.max(0, 1 - (z / ib) ** 2))
    g.add(noOutline(rbox(half * 2, 0.08, 0.1, '#f4f4f0', { y: tubeR - 0.1, z }, 0.03)))
  }
  for (let x = -ia + 1.2; x < ia - 0.6; x += 1.3) {
    const half = ib * Math.sqrt(Math.max(0, 1 - (x / ia) ** 2))
    g.add(noOutline(rbox(0.1, 0.08, half * 2, '#f4f4f0', { x, y: tubeR + 0.02 }, 0.03)))
  }
  const hx = -a
  const sx = hx - shaftLen
  const hr = shaftLen > 12 ? 1.2 : 1.5
  if (shaftLen > 12) g.add(rod3([hx + 0.5, tubeR, 0], [sx, hr, 0], tubeR * 0.5, frame))
  else for (const s of [-1, 1]) g.add(rod3([hx + 1.5, tubeR, s * b * 0.45], [sx, hr, 0], tubeR * 0.9, frame))
  g.add(P(cyl(hr, hr, handleLen, grip, {}, 8), sx - handleLen / 2, hr, 0, 0, 0, PI / 2))
  g.add(cylX(hr + 0.2, 0.8, DARK, sx - handleLen, hr, 0, 8))
  return g
}

/** 网球拍 + 球：[拍框, 握把, 球] */
function tennis(p: string[]) {
  const [frame, grip, ballC] = p
  const g = new THREE.Group()
  g.add(P(racket(frame, grip, 15, 12, 20, 9, 0.9), 16, 0, -2))
  g.add(ball(3.3, ballC, { x: -14, y: 3.3, z: 9 }))
  g.add(noOutline(P(torus(3.0, 0.15, '#ffffff', {}), -14, 3.3, 9, 0.6, 0, 0.4)))
  return fit(g)
}

/** 羽毛球拍 + 球：[拍框, 握把, 羽毛] */
function badminton(p: string[]) {
  const [frame, grip, feather] = p
  const g = new THREE.Group()
  g.add(P(racket(frame, grip, 12, 10, 18, 26, 0.6), 18, 0, -2))
  const sh = new THREE.Group()
  sh.add(ball(1.4, IVORY, { y: 1.4 }))
  sh.add(cup(3.3, 1.3, 6.5, 0.15, feather, { y: 1.4 }))
  g.add(P(fit(P(G(sh), 0, 0, 0, 0, 0, -(PI / 2 + 0.28))), -10, 0, 9))
  return fit(g)
}

/** 棒球手套 + 球棒 + 球：[手套皮, 球棒木, 缝线] */
function baseball(p: string[]) {
  const [leather, wood, stitch] = p
  const g = new THREE.Group()
  const bat = G(cyl(3.2, 1.4, 82, wood, {}, 18), puck(2.2, 1.4, wood, { y: -1.2 }), cyl(1.5, 1.5, 22, DARK, { y: 0.2 }, 12))
  const e = Math.asin((3.2 - 1.4) / 82)
  g.add(P(fit(P(G(bat), 0, 0, 0, 0, 0, -PI / 2 + e)), 0, 0, 9))
  const glove = new THREE.Group()
  glove.add(ball(7, leather, { y: 3.9 }, [1, 0.55, 1.1]))
  for (let i = 0; i < 4; i++) glove.add(P(capsule(1.5, 5, leather), -4.2 + i * 2.6, 6, -8.2 + Math.abs(i - 1.5) * 0.6, -PI / 2 + 0.5))
  glove.add(P(capsule(1.7, 5, leather), 7, 5.2, -2.5, -PI / 2 + 0.3, 0, -0.9))
  glove.add(rbox(4, 4, 0.8, shade(leather, -0.1), { x: 5.2, y: 5, z: -4.5 }, 0.3))
  glove.add(P(cyl(5, 5, 2.4, shade(leather, -0.1), {}, 16), 0, 4, 7.5, PI / 2))
  glove.add(ball(3.7, '#fbf8f0', { x: 0.5, y: 10, z: -1.5 }))
  glove.add(noOutline(P(torus(3.4, 0.14, stitch, {}), 0.5, 10, -1.5, 0.4, 0.3, 0)))
  for (let i = 0; i < 3; i++) glove.add(noOutline(P(torus(0.6, 0.15, stitch, {}), -3 + i * 3, 7.6, 3.2, 0.3)))
  glove.scale.setScalar(1.5)
  // 手套的腕口圆筒最低到 -1（×1.5 = -1.5）：抬起 1.5 贴地，否则 fit 会把整体抬高、球棒悬空
  g.add(P(glove, -24, 1.5, -9))
  return fit(g)
}

/** 滑板（平放）：[板面底色, 砂纸, 轮子] */
function skateboardFlat(p: string[]) {
  const [deck, grip, wheel] = p
  const g = new THREE.Group()
  const yb = 7.6
  g.add(rbox(56, 1.2, 20, deck, { y: yb }, 0.5))
  g.add(noOutline(rbox(55.4, 0.3, 19.4, grip, { y: yb + 1.2 }, 0.1)))
  for (const s of [-1, 1]) {
    const tail = G(rbox(13, 1.2, 20, deck, { x: s * 6.2 }, 0.5), noOutline(rbox(12.4, 0.3, 19.4, grip, { x: s * 6.2, y: 1.2 }, 0.1)))
    g.add(P(tail, s * 28, yb, 0, 0, 0, s * 0.26))
    const tx = s * 20
    g.add(rbox(6, 1, 7, METAL, { x: tx, y: yb - 1 }, 0.3))
    g.add(rbox(3, 3.6, 3, METAL, { x: tx, y: yb - 4.4 }, 0.6))
    g.add(rbox(3, 1.6, 15, METAL, { x: tx, y: 2 }, 0.6))
    for (const sz of [-1, 1]) g.add(cylZ(2.7, 3.2, wheel, tx, 2.7, sz * 9.1, 18))
  }
  return g
}

/** 滑板（立靠墙）：板面贴墙，轮子朝外 */
function skateboardStand(p: string[]) {
  return fit(P(G(skateboardFlat(p)), 0, 0, 0, -0.14, -PI / 2, PI / 2))
}

/** 冲浪板（靠墙）：[板色, 条纹, 尾鳍] */
function surfboard(p: string[]) {
  const [board, stripe, fin] = p
  const pts = sym([[0, 0], [12, 0.5], [21, 10], [25.5, 45], [26, 80], [24, 115], [17, 150], [8, 172], [0, 180]])
  const b = new THREE.Group()
  b.add(flat(pts, 6, board, true, 2))
  b.add(P(flat(pts.map(([x, y]): V2 => [x * 0.86, y * 0.94 + 5]), 0.4, shade(board, 0.06), true, 0.1), 0, 0, 3.05))
  b.add(noOutline(rbox(1.2, 160, 0.3, stripe, { y: 10, z: 3.35 }, 0.1)))
  b.add(P(flat(pts.map(([x, y]): V2 => [x * 0.55, y * 0.06 + 120]), 0.4, stripe, true, 0.1), 0, 0, 3.3))
  for (const [x, y, s] of [[0, 6, 1], [-11, 18, 0.85], [11, 18, 0.85]] as V3[]) b.add(P(flat([[0, 0], [9 * s, 0], [3 * s, 9 * s]], 0.8, fin, false, 0.2), x, y, 3, 0, -PI / 2))
  return fit(P(G(b), 0, 0, 0, -0.1))
}

/** 滑雪板（靠墙）：[板色, 固定器, 绑带] */
function snowboard(p: string[]) {
  const [board, binding, strap] = p
  const pts = sym([[0, 0], [9, 0.4], [13.5, 4], [14, 10], [12.5, 40], [12, 75], [12.5, 110], [14, 140], [13.5, 146], [9, 149.6], [0, 150]])
  const b = new THREE.Group()
  b.add(flat(pts, 1.4, board, true, 0.5))
  b.add(P(flat(pts.map(([x, y]): V2 => [x * 0.8, y * 0.6 + 30]), 0.3, shade(board, 0.15), true, 0.1), 0, 0, 0.75))
  for (const [cy, ang] of [[50, 0.25], [100, -0.15]] as V2[]) {
    const bd = new THREE.Group()
    bd.add(rbox(10, 22, 1, binding, { y: -11, z: 0.5 }, 0.4))
    for (const s of [-1, 1]) bd.add(rbox(0.8, 22, 4.5, binding, { x: s * 4.6, y: -11, z: 1.2 }, 0.3))
    bd.add(rbox(10, 1, 12, binding, { y: -11, z: 6.5 }, 0.4))
    bd.add(rbox(10.4, 3.4, 1, strap, { y: 1, z: 4.6 }, 0.5), rbox(10.4, 3, 1, strap, { y: 7, z: 4 }, 0.5))
    b.add(P(bd, 0, cy, 0, 0, 0, ang))
  }
  return fit(P(G(b), 0, 0, 0, -0.1))
}

/** 高尔夫球包：[包身, 饰边, 球杆套] */
function golfBag(p: string[]) {
  const [bag, trim, cover] = p
  const g = new THREE.Group()
  g.add(cyl(13, 13, 4, trim, {}, 20))
  g.add(cyl(12.5, 12.5, 74, bag, { y: 4 }, 20))
  g.add(cup(13.5, 13, 8, 1.2, trim, { y: 76 }))
  g.add(rbox(14, 34, 5, trim, { y: 16, z: 11 }, 2.2))
  g.add(rbox(10, 14, 4, shade(bag, -0.1), { y: 52, z: 11.5 }, 1.8))
  g.add(rod3([-11, 70, -6], [-11, 30, -6], 1.6, DARK), rod3([-11, 70, -6], [-11.3, 50, -11], 1.2, DARK))
  for (const s of [-1, 1]) g.add(rod3([s * 6, 64, -12], [s * 9, 0.6, -24], 0.6, METAL))
  const clubs: [number, number, number][] = [[-5, -4, 0], [0, -6, 1], [5, -3, 2], [-3, 3, 3], [3, 4, 4], [7, 1, 5]]
  for (const [x, z, k] of clubs) {
    const top = 92 + (k % 3) * 4
    g.add(taperRod3([x * 0.8, 78, z * 0.8], [x, top, z], 0.4, 0.4, METAL, 6))
    if (k < 3) {
      g.add(ball(4, k === 1 ? cover : shade(cover, -0.15), { x, y: top + 3.4, z }, [1, 0.9, 1.1]))
      g.add(ball(1.6, k === 1 ? '#ffffff' : cover, { x, y: top + 7.2, z }))
    } else g.add(P(rbox(1.2, 3.6, 6, METAL, { y: -0.4 }, 0.3), x, top, z, 0, k * 0.7))
  }
  return fit(g)
}

/** 拳击手套（一对）：[皮色, 护腕, 点缀] */
function boxingGloves(p: string[]) {
  const [main, cuff, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 7.5
    g.add(ball(7, main, { x, y: 6.4, z: 2 }, [0.95, 0.9, 1.2]))
    g.add(P(capsule(2.2, 4.5, main), x - s * 5.4, 5.2, 0.5, PI / 2 - 0.3))
    g.add(P(cyl(5, 5, 8, cuff, {}, 18), x, 5.5, -8.5, PI / 2))
    g.add(P(cyl(5.2, 5.2, 2, acc, {}, 18), x, 5.5, -9, PI / 2))
    g.add(noOutline(rbox(4, 0.4, 3, acc, { x, y: 12.2, z: 3 }, 0.2)))
  }
  return fit(g)
}

/** 半球（开口朝下），y 是底面 */
function dome(r: number, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, PI * 2, 0, PI / 2), toon(color))
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 自行车头盔：[壳, 条纹, 内衬] */
function bikeHelmet(p: string[]) {
  const [shellC, stripe, inner] = p
  const g = new THREE.Group()
  g.add(dome(11, shellC, 0, 1.4, 0, 0.95, 0.95, 1.25))
  const rim = torus(11, 0.8, inner, { y: 0.8, rx: PI / 2 })
  rim.scale.set(0.95, 1.25, 1)
  g.add(rim)
  for (const x of [-4.5, 0, 4.5]) {
    const top = 1.4 + 10.45 * Math.sqrt(Math.max(0, 1 - (x / 10.45) ** 2))
    g.add(noOutline(ball(8, x === 0 ? stripe : shade(shellC, -0.3), { x, y: top - 0.7 }, [0.1, 0.06, 1])))
  }
  g.add(P(rbox(12, 0.5, 3.5, shellC, {}, 0.2), 0, 5, 13.2, 0.3))
  for (const s of [-1, 1]) g.add(taperRod3([s * 8, 1.2, 3], [s * 3, 0.4, 8], 0.4, 0.4, DARK, 6))
  g.add(rbox(3, 1, 2, DARK, { y: 0, z: 8 }, 0.3))
  return fit(g)
}

// ---------- 桌游 / 棋牌 ----------

/** 棋盘网格 */
function drawGrid(bg: string, line: string, n: number, stars: V2[] = [], margin = 0.04): Draw {
  return (c, W, H) => {
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    c.fillStyle = line
    const x0 = W * margin
    const y0 = H * margin
    const dx = (W - x0 * 2) / (n - 1)
    const dy = (H - y0 * 2) / (n - 1)
    const lw = Math.max(1, W * 0.004)
    for (let i = 0; i < n; i++) {
      c.fillRect(x0 + i * dx - lw / 2, y0, lw, H - y0 * 2)
      c.fillRect(x0, y0 + i * dy - lw / 2, W - x0 * 2, lw)
    }
    for (const [i, j] of stars) {
      c.beginPath()
      c.arc(x0 + i * dx, y0 + j * dy, lw * 2.5, 0, PI * 2)
      c.fill()
    }
  }
}

/** 将棋盘 + 棋子（开局后几步）：[棋盘木, 棋子木, 字色] */
function shogi(p: string[]) {
  const [board, piece, ink] = p
  const g = new THREE.Group()
  const bw = 33.3
  const bd = 36.4
  g.add(rbox(bw, 3, bd, board, {}, 0.5))
  // 9×9 格：线画在格子边上（10 条线）
  g.add(paintTop(31, 34, `int-shogi-${board}-${ink}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    const lw = Math.max(1, W * 0.004)
    for (let i = 0; i <= 9; i++) {
      c.fillRect((i / 9) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 9) * (H - lw), W, lw)
    }
    for (const [i, j] of [[3, 3], [6, 3], [3, 6], [6, 6]]) {
      c.beginPath()
      c.arc((i / 9) * W, (j / 9) * H, lw * 2.5, 0, PI * 2)
      c.fill()
    }
  }, 0, 3.3, 0))
  const cw = 31 / 9
  const ch = 34 / 9
  const at = (col: number, row: number): V2 => [-15.5 + cw * (col + 0.5), -17 + ch * (row + 0.5)]
  const put = (col: number, row: number, mine: boolean, big = false) => {
    const [x, z] = at(col, row)
    const r = big ? 1.65 : 1.45
    const m = cyl(r * 0.8, r, 0.8, piece, { x, y: 3.3, z, ry: mine ? PI : 0 }, 5)
    m.scale.set(0.85, 1, 1)
    g.add(m)
    g.add(noOutline(rbox(0.8, 0.1, 1.1, ink, { x, y: 4.12, z }, 0.05)))
  }
  const back = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  for (const mine of [true, false]) {
    const r0 = mine ? 8 : 0
    const r1 = mine ? 7 : 1
    const r2 = mine ? 6 : 2
    for (const col of back) put(col, r0, mine, col === 4)
    put(mine ? 1 : 7, r1, mine, true)
    put(mine ? 7 : 1, r1, mine, true)
    for (const col of back) {
      const moved = mine ? col === 2 || col === 6 : col === 6
      put(col, moved ? (mine ? 5 : 3) : r2, mine)
    }
  }
  return g
}

/** 围棋盘 + 两个棋罐：[棋盘木, 棋罐, 线色] */
function goBoard(p: string[]) {
  const [board, bowl, line] = p
  const g = new THREE.Group()
  g.add(rbox(42.4, 5, 45.5, board, {}, 0.6))
  const st: V2[] = [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
  g.add(paintTop(41.4, 44.5, `int-go-${board}-${line}`, drawGrid(board, line, 19, st, 0.05), 0, 5.3, 0))
  const r = rng(19)
  const gx = (41.4 * 0.9) / 18
  const gz = (44.5 * 0.9) / 18
  for (let k = 0; k < 34; k++) {
    const i = Math.floor(r() * 13) + 3
    const j = Math.floor(r() * 13) + 3
    g.add(ball(1.1, k % 2 ? '#f8f6f0' : '#26262a', { x: -41.4 * 0.45 + i * gx, y: 5.3 + 0.5, z: -44.5 * 0.45 + j * gz }, [1, 0.45, 1]))
  }
  for (const [s, c] of [[-1, '#26262a'], [1, '#f8f6f0']] as [number, string][]) {
    const x = s * 30.5
    g.add(ball(6.5, bowl, { x, y: 4.4, z: 14 }, [1, 0.68, 1]))
    g.add(puck(5.4, 1.8, bowl, { x, y: 8 + (s > 0 ? 0 : 0), z: 14 }))
    if (s < 0) for (let k = 0; k < 3; k++) g.add(ball(1.1, c, { x: x + 4 + k * 1.6, y: 0.5, z: 20 - k }, [1, 0.45, 1]))
  }
  return fit(g)
}

/** 国际象棋棋子 */
function chessPiece(kind: 'p' | 'r' | 'n' | 'b' | 'q' | 'k', color: string, facing = 0) {
  const g = new THREE.Group()
  const baseP: V2[] = [[0, 0], [1.4, 0], [1.4, 0.45], [1.0, 0.85]]
  if (kind === 'p') {
    g.add(lathe([...baseP, [0.55, 2.3], [0.95, 2.5], [0.45, 2.7], [0, 2.7]], color))
    g.add(ball(0.8, color, { y: 3.3 }))
  } else if (kind === 'r') {
    g.add(lathe([...baseP, [0.85, 3.1], [1.15, 3.3], [1.15, 4.1], [0, 4.1]], color))
  } else if (kind === 'b') {
    g.add(lathe([...baseP, [0.55, 3.0], [1.0, 3.2], [0.5, 3.4], [0, 3.4]], color))
    g.add(ball(0.75, color, { y: 4.2 }, [1, 1.35, 1]), ball(0.28, color, { y: 5.4 }))
  } else if (kind === 'n') {
    g.add(lathe([...baseP, [0.9, 1.4], [0, 1.4]], color))
    const head = G(rbox(1.3, 3.2, 1.6, color, { y: 0 }, 0.5), rbox(1.2, 1.2, 2.2, color, { y: 2, z: 0.8 }, 0.4))
    g.add(P(head, 0, 1.3, -0.2, 0.2))
  } else {
    const tall = kind === 'k' ? 4.6 : 4.2
    g.add(lathe([...baseP, [0.6, tall - 0.8], [1.1, tall - 0.6], [0.7, tall - 0.4], [1.05, tall + 0.3], [0, tall + 0.3]], color))
    if (kind === 'q') g.add(ball(0.42, color, { y: tall + 0.6 }))
    else g.add(rbox(0.4, 1.5, 0.4, color, { y: tall + 0.3 }, 0.1), rbox(1.2, 0.4, 0.4, color, { y: tall + 1 }, 0.1))
  }
  g.rotation.y = facing
  return g
}

/** 国际象棋（中局）：[棋盘框, 白子, 黑子] */
function chess(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  g.add(rbox(36, 2, 36, frame, {}, 0.5))
  g.add(paintTop(32, 32, `int-chess-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
      }
  }, 0, 2.3, 0))
  const sq = (f: number, r: number): V2 => [-14 + f * 4, 14 - r * 4]
  const pieces: [string, number, number, boolean][] = [
    ['k', 6, 0, true], ['r', 5, 0, true], ['q', 3, 1, true], ['b', 2, 3, true], ['n', 5, 2, true], ['p', 0, 1, true], ['p', 1, 1, true], ['p', 4, 3, true], ['p', 5, 1, true], ['p', 6, 1, true], ['p', 7, 2, true],
    ['k', 6, 7, false], ['r', 0, 7, false], ['r', 5, 7, false], ['q', 4, 6, false], ['n', 2, 5, false], ['b', 6, 6, false], ['p', 0, 6, false], ['p', 1, 5, false], ['p', 4, 4, false], ['p', 5, 6, false], ['p', 6, 5, false], ['p', 7, 6, false],
  ]
  for (const [k, f, r, w] of pieces) {
    const [x, z] = sq(f, r)
    g.add(P(chessPiece(k as 'p', w ? white : black, w ? PI : 0), x, 2.35, z))
  }
  // 被吃掉的黑象躺在棋盘边（沿 +z 平放，底座半径 1.4 → 抬 1.4 正好贴地；以前 translateY 在旋转后的局部系里，象一半陷进地面，整盘被 fit 抬高）
  g.add(P(chessPiece('b', black), 21, 1.4, 1.8, PI / 2))
  g.add(P(chessPiece('p', white), 20.5, 0, -6), P(chessPiece('n', white, 0.8), 21, 0, -1))
  return fit(g)
}

/** 麻将牌面：rows × cols 张牌 */
function drawTiles(cols: number, rows: number, seed: number, face: string): Draw {
  return (c, W, H) => {
    const r = rng(seed)
    const tw = W / cols
    const th = H / rows
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * tw
        const y = j * th
        c.fillStyle = shade(face, -0.15)
        c.fillRect(x, y, tw, th)
        c.fillStyle = face
        c.fillRect(x + tw * 0.06, y + th * 0.04, tw * 0.88, th * 0.92)
        const kind = Math.floor(r() * 3)
        const n = 1 + Math.floor(r() * 5)
        if (kind === 0) {
          for (let k = 0; k < n; k++) {
            c.fillStyle = k % 2 ? '#3d6fb8' : '#c8473a'
            c.beginPath()
            c.arc(x + tw * (0.3 + (k % 2) * 0.4), y + th * (0.2 + Math.floor(k / 2) * 0.28), tw * 0.15, 0, PI * 2)
            c.fill()
          }
        } else if (kind === 1) {
          c.fillStyle = '#2f8a4a'
          for (let k = 0; k < n; k++) c.fillRect(x + tw * (0.2 + (k % 3) * 0.24), y + th * (0.15 + Math.floor(k / 3) * 0.4), tw * 0.12, th * 0.32)
        } else {
          c.fillStyle = '#26262a'
          c.fillRect(x + tw * 0.25, y + th * 0.18, tw * 0.5, th * 0.07)
          c.fillRect(x + tw * 0.45, y + th * 0.18, tw * 0.1, th * 0.36)
          c.fillStyle = '#c8473a'
          c.fillRect(x + tw * 0.28, y + th * 0.62, tw * 0.44, th * 0.18)
        }
      }
  }
}

/** 麻将桌（一局进行中）：[桌框, 桌布, 牌背] */
function mahjong(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 68, 5, frame, { x: sx * 38, z: sz * 38 }, 1))
  g.add(rbox(88, 3, 88, frame, { y: 68 }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(88, 2.4, 4, frame, { y: 71, z: s * 42 }, 0.8))
    g.add(rbox(4, 2.4, 80, frame, { x: s * 42, y: 71 }, 0.8))
  }
  g.add(rbox(80, 0.5, 80, felt, { y: 71 }, 0.2))
  const fy = 71.5
  const tw = 2.6
  const th = 3.5
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group()
    // 手牌：13 张立着，牌面朝外
    const HL = 13 * tw
    side.add(rbox(HL, th, 1.2, IVORY, { z: 33.4 }, 0.25))
    side.add(rbox(HL, th, 0.7, back, { z: 32.45 }, 0.25))
    side.add(paintPanel(HL - 0.2, th - 0.2, `int-mj-hand-${k}`, drawTiles(13, 1, 30 + k, IVORY), { y: 0.1, z: 34.3 }))
    // 舍牌：两排 6 张，牌面朝上
    side.add(rbox(6 * tw, 0.7, 2 * th, back, { z: 9 }, 0.25))
    side.add(rbox(6 * tw, 1.2, 2 * th, IVORY, { y: 0.7, z: 9 }, 0.25))
    side.add(paintTop(6 * tw - 0.2, 2 * th - 0.2, `int-mj-river-${k}`, drawTiles(6, 2, 50 + k, IVORY), 0, 2.2, 9))
    g.add(P(side, 0, fy, 0, 0, (k * PI) / 2))
  }
  // 牌山：四面各 17 墩 × 2 层，风车形围成方框（彼此不重叠）
  mjRing(g, 17, back, fy, 11)
  g.add(rbox(9, 0.6, 9, DARK, { y: fy }, 0.3))
  for (const [x, z] of [[-1.2, 0.5], [1.4, -0.8]] as V2[]) g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x, y: fy + 0.6, z }, 0.3))
  return g
}

/** 扑克牌 + 筹码：[桌垫, 牌背, 筹码主色] */
function poker(p: string[]) {
  const [mat, cardBack, chip] = p
  const g = new THREE.Group()
  g.add(rbox(32, 0.3, 22, mat, {}, 0.15))
  g.add(rbox(6.3, 1.6, 8.8, '#ffffff', { x: -10, y: 0.3, z: -3 }, 0.3))
  g.add(noOutline(rbox(5.7, 0.1, 8.2, cardBack, { x: -10, y: 1.9, z: -3 }, 0.05)))
  const suits = ['♠', '♥', '♦', '♣', '♥']
  const ranks = ['A', 'K', 'Q', 'J', '10']
  for (let i = 0; i < 5; i++) {
    const card = G(rbox(6.3, 0.12, 8.8, '#ffffff', {}, 0.05), paintTop(6, 8.5, `int-card-${i}`, (c, W, H) => {
      c.fillStyle = '#ffffff'
      c.fillRect(0, 0, W, H)
      c.fillStyle = i % 4 === 0 || i === 3 ? '#26262a' : '#c8473a'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `${Math.floor(H * 0.4)}px serif`
      c.fillText(suits[i], W / 2, H * 0.55)
      c.font = `bold ${Math.floor(H * 0.14)}px sans-serif`
      c.fillText(ranks[i], W * 0.16, H * 0.1)
    }, 0, 0.42, 0))
    g.add(P(card, -1 + i * 2.2, 0.3 + i * 0.13, 4 - Math.abs(i - 2) * 0.4, 0, (2 - i) * 0.18))
  }
  const cols = [chip, '#ffffff', '#26262a', shade(chip, 0.25)]
  const stacks: [number, number, number][] = [[7, -5, 9], [11.5, -5, 6], [9.2, -1, 12], [13, 2.5, 4]]
  stacks.forEach(([x, z, n], i) => {
    const c = cols[i % cols.length]
    const h = n * 0.34
    g.add(cyl(2, 2, h, c, { x, y: 0.3, z }, 20))
    for (let k = 1; k < n; k += 2) g.add(noOutline(cyl(2.02, 2.02, 0.12, i % 4 === 1 ? chip : '#ffffff', { x, y: 0.3 + k * 0.34, z }, 20)))
  })
  g.add(cyl(2, 2, 0.34, chip, { x: 4, y: 0.3, z: 8, rz: 0.1 }, 20))
  return fit(g)
}

/** 桌游盒子堆：[盒色 1, 盒色 2, 盒色 3] */
function boardGames(p: string[]) {
  const g = new THREE.Group()
  const boxes: [number, number, number, number][] = [
    [30, 7, 30, 0.03],
    [27, 6, 27, -0.06],
    [29, 7.5, 15, 0.08],
    [19, 5.5, 19, -0.1],
  ]
  let y = 0
  boxes.forEach(([w, h, d, ry], i) => {
    const c = p[i % 3]
    const box = G(
      rbox(w, h, d, c, {}, 0.4),
      rbox(w + 0.1, 0.5, d + 0.1, shade(c, -0.15), { y: h - 1.5 }, 0.2),
      paintTop(w - 1, d - 1, `int-bg-${i}-${c}`, (cv, W, H) => {
        cv.fillStyle = c
        cv.fillRect(0, 0, W, H)
        cv.fillStyle = shade(c, 0.22)
        cv.beginPath()
        cv.arc(W * 0.65, H * 0.55, Math.min(W, H) * 0.32, 0, PI * 2)
        cv.fill()
        cv.fillStyle = shade(c, -0.25)
        for (let k = 0; k < 3; k++) cv.fillRect(W * (0.1 + k * 0.12), H * (0.6 - k * 0.12), W * 0.1, H * (0.3 + k * 0.12))
        cv.fillStyle = '#ffffff'
        cv.fillRect(W * 0.08, H * 0.08, W * 0.6, H * 0.14)
        cv.fillStyle = shade(c, -0.35)
        cv.fillRect(W * 0.12, H * 0.12, W * 0.45, H * 0.06)
      }, 0, h + 0.3, 0),
    )
    g.add(P(box, i === 2 ? -4 : 0, y, i === 2 ? 4 : 0, 0, ry))
    y += h
  })
  return fit(g)
}

// ---------- 手作 ----------

/** 毛线篮（毛线球 + 棒针）：[篮子, 毛线 1, 毛线 2] */
function knittingBasket(p: string[]) {
  const [basket, y1, y2] = p
  const g = new THREE.Group()
  g.add(cup(15, 12, 16, 1.2, basket))
  for (const y of [4, 8, 12]) g.add(torus(12 + (3 * y) / 16 + 0.15, 0.35, shade(basket, -0.12), { y, rx: PI / 2 }))
  g.add(ball(8, y2, { y: 9.5 }))
  const yarn = (r: number, c: string, x: number, y: number, z: number, seed: number) => {
    g.add(ball(r, c, { x, y, z }))
    const rr = rng(seed)
    for (let k = 0; k < 3; k++) g.add(noOutline(P(torus(r * 0.99, 0.18, shade(c, -0.12), {}), x, y, z, rr() * PI, rr() * PI, 0)))
  }
  yarn(5.5, y1, -5, 13, -3, 1)
  yarn(5, y2, 5, 12.5, 2, 2)
  yarn(4.5, shade(y1, 0.2), -1, 14, 7, 3)
  for (const s of [-1, 1]) {
    g.add(taperRod3([-5 + s, 13, -3], [-12 + s * 2, 30, -9], 0.35, 0.3, METAL, 8))
    g.add(ball(0.8, shade(y2, -0.2), { x: -12 + s * 2, y: 30, z: -9 }))
  }
  yarn(4.5, y1, 20, 4.5, 8, 4)
  g.add(noOutline(taperRod3([12, 15.5, 4], [17, 1, 8], 0.15, 0.15, y1, 4)))
  return fit(g)
}

/** 缝纫机：[机身, 点缀, 线] */
function sewingMachine(p: string[]) {
  const [body, acc, thread] = p
  const g = new THREE.Group()
  g.add(rbox(40, 5, 18, body, {}, 1.5))
  g.add(rbox(14, 0.4, 8, METAL, { x: -12, y: 5, z: 2 }, 0.2))
  g.add(rbox(11, 20, 14, body, { x: 13.5, y: 5 }, 2.2))
  g.add(rbox(38, 8, 13, body, { y: 22 }, 2.5))
  g.add(rbox(9, 10, 12, body, { x: -14.5, y: 13 }, 2))
  g.add(cyl(0.4, 0.4, 6, METAL, { x: -15, y: 7 }, 8))
  g.add(rbox(2.4, 0.6, 3, METAL, { x: -15, y: 5.4, z: 0.6 }, 0.2))
  g.add(cylX(5, 2.4, acc, 20.4, 18, 0, 24))
  g.add(cylX(2, 2.6, shade(acc, -0.15), 20.6, 18, 0, 16))
  g.add(cyl(0.3, 0.3, 4, METAL, { x: 8, y: 30 }, 6))
  g.add(puck(1.6, 0.4, thread, { x: 8, y: 30.2 }), cyl(1.2, 1.2, 2.4, thread, { x: 8, y: 30.6 }, 14), puck(1.6, 0.4, thread, { x: 8, y: 33 }))
  g.add(rbox(28, 1.4, 0.4, acc, { x: -2, y: 26, z: 6.6 }, 0.2))
  g.add(cylZ(1.8, 1.2, acc, 13.5, 14, 7.4, 16))
  g.add(noOutline(taperRod3([8, 33, 0], [-14, 29.8, 4], 0.06, 0.06, thread, 4)))
  g.add(rbox(16, 0.3, 10, shade(thread, 0.3), { x: -8, y: 5.4, z: 3 }, 0.1))
  return fit(g)
}

/** 刺绣绷（绣好的花）+ 绣线 + 剪刀：[木绷, 布, 线] */
function embroidery(p: string[]) {
  const [wood, cloth, thread] = p
  const g = new THREE.Group()
  const hx = -5
  g.add(torus(9, 0.7, wood, { x: hx, y: 0.7, rx: PI / 2 }))
  g.add(torus(8.4, 0.5, shade(wood, -0.08), { x: hx, y: 0.5, rx: PI / 2 }))
  g.add(cyl(8.6, 8.6, 0.15, cloth, { x: hx, y: 0.6 }, 32))
  g.add(paintTop(11.4, 11.4, `int-embroid-${cloth}-${thread}`, (c, W, H) => {
    c.fillStyle = cloth
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#4f9e5b'
    c.lineWidth = W * 0.03
    c.beginPath()
    c.moveTo(W * 0.5, H * 0.95)
    c.quadraticCurveTo(W * 0.42, H * 0.6, W * 0.5, H * 0.38)
    c.stroke()
    c.fillStyle = '#78c47a'
    for (const s of [-1, 1]) {
      c.beginPath()
      c.ellipse(W * (0.5 + s * 0.12), H * 0.7, W * 0.1, H * 0.045, -s * 0.6, 0, PI * 2)
      c.fill()
    }
    const fl = (cx: number, cy: number, r: number, col: string) => {
      c.fillStyle = col
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * PI * 2
        c.beginPath()
        c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.75, 0, PI * 2)
        c.fill()
      }
      c.fillStyle = '#ffe08f'
      c.beginPath()
      c.arc(cx, cy, r * 0.7, 0, PI * 2)
      c.fill()
    }
    fl(W * 0.5, H * 0.3, W * 0.09, thread)
    fl(W * 0.25, H * 0.5, W * 0.06, shade(thread, 0.15))
    fl(W * 0.76, H * 0.48, W * 0.06, shade(thread, -0.1))
  }, hx, 0.98, 0))
  g.add(rbox(1.6, 1.6, 2.2, METAL, { x: hx, y: 0.2, z: -10 }, 0.4))
  const skeins = [thread, shade(thread, 0.2), C.sky, C.lemon]
  skeins.forEach((c, i) => {
    g.add(P(capsule(0.7, 4.4, c), 9.5 + i * 1.7, 0.7, -3 + (i % 2) * 0.8, 0, 0, PI / 2 + 0.25))
    g.add(noOutline(cylX(0.75, 1, '#ffffff', 9.5 + i * 1.7, 0.7, -3 + (i % 2) * 0.8, 10)))
  })
  for (const s of [-1, 1]) {
    g.add(P(rbox(6, 0.3, 0.7, METAL, {}, 0.1), 11.5, 0.2 + (s > 0 ? 0.3 : 0), 6, 0, s * 0.12))
    g.add(torus(1, 0.3, thread, { x: 7.2, y: 0.35, z: 6 + s * 1.4, rx: PI / 2 }))
  }
  return fit(g)
}

/** 书法套装：毛毡 + 半纸 + 砚台 + 毛笔 + 文镇 [毛毡, 墨, 笔杆] */
function calligraphy(p: string[]) {
  const [felt, ink, bamboo] = p
  const g = new THREE.Group()
  g.add(rbox(46, 0.4, 36, felt, {}, 0.15))
  g.add(sheet(24.2, 33.3, J.washi, -8, 0.4, 0, 0.1))
  g.add(paintTop(24, 33, `int-shodo-${ink}`, (c, W, H) => {
    c.fillStyle = J.washi
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${Math.floor(W * 0.62)}px "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif`
    c.fillText('夢', W * 0.5, H * 0.3)
    c.fillText('翔', W * 0.5, H * 0.7)
    c.fillStyle = '#d65a3c'
    c.fillRect(W * 0.08, H * 0.86, W * 0.08, W * 0.08)
  }, -8, 0.82, 0))
  g.add(rbox(24, 1, 1.6, J.sumi, { x: -8, y: 0.5, z: -15.4 }, 0.3))
  g.add(rbox(9, 2, 16, '#3a3a40', { x: 12, y: 0.4, z: -6 }, 0.6))
  g.add(noOutline(rbox(6.4, 0.2, 4.2, '#15161a', { x: 12, y: 2.35, z: -11.2 }, 0.1)))
  g.add(rbox(1.6, 1.2, 5.5, '#26262a', { x: 12, y: 2.4, z: -3 }, 0.3))
  g.add(rbox(4, 1, 2, J.wood, { x: 12, y: 0.4, z: 8 }, 0.3))
  g.add(taperRod3([6.5, 1.6, 12], [19, 1.6, 7], 0.45, 0.42, bamboo))
  g.add(taperRod3([6.5, 1.6, 12], [3.8, 1.2, 13.2], 0.55, 0.12, '#1e1e22'))
  g.add(puck(2, 1.6, J.washi, { x: 18, y: 0.4, z: 13 }))
  return fit(g)
}

/** 水彩套装：画本 + 颜料盒 + 画笔 + 洗笔杯 [盒色, 天色, 山色] */
function watercolor(p: string[]) {
  const [tin, sky, hill] = p
  const g = new THREE.Group()
  g.add(rbox(22, 1, 16, '#ffffff', { x: -6, z: -2 }, 0.3))
  g.add(paintTop(20.4, 14.4, `int-wc-${sky}-${hill}`, paintLandscape(sky, hill, '#ffd27a'), -6, 1.3, -2))
  g.add(tray(13, 1.2, 8, 0.4, tin, { x: 12, z: -4 }))
  const pans = ['#d64545', '#e8873a', '#f0cf4a', '#5aa55a', '#3d8fd0', '#3a4a9a', '#8a4fb0', '#7a4a2a', '#26262a', '#f2a0b8', '#58c0b0', '#c0a070']
  pans.forEach((c, i) => g.add(rbox(1.7, 0.6, 2.6, c, { x: 12 - 5.2 + (i % 6) * 2.08, y: 0.4, z: -4 - 1.6 + Math.floor(i / 6) * 3.2 }, 0.2)))
  g.add(tray(13, 1, 8, 0.4, tin, { x: 12, z: 4.6 }))
  g.add(rbox(12, 0.3, 7, '#ffffff', { x: 12, y: 0.4, z: 4.6 }, 0.1))
  for (const [x, z, c] of [[9, 3.6, sky], [14, 5.6, hill]] as [number, number, string][]) g.add(noOutline(ball(1.4, c, { x, y: 0.75, z }, [1, 0.12, 0.8])))
  const brush = (z: number, c: string, r: number) => {
    g.add(taperRod3([-14, r, z], [4, r, z + 1], r, r * 0.6, c, 8))
    g.add(taperRod3([-14, r, z], [-16, r, z - 0.1], r * 1.05, r * 1.05, METAL, 8))
    g.add(taperRod3([-16, r, z - 0.1], [-19, r * 0.8, z - 0.2], r * 0.9, 0.08, '#3a2a20', 8))
  }
  brush(8.5, '#c8473a', 0.45)
  brush(10.5, '#26262a', 0.35)
  const jx = -22
  g.add(ghostOutlined(cup(3.2, 3, 8, 0.3, GLASS, { x: jx, z: 0 }), GLASS, 0.35))
  g.add(cyl(2.8, 2.7, 5, shade(sky, 0.15), { x: jx, y: 0.3, z: 0 }, 20))
  g.add(taperRod3([jx, 3, 0], [jx + 2.5, 11, 1], 0.3, 0.3, hill, 8))
  return fit(g)
}

/** 陶艺转盘：[机身, 托盘, 陶泥] */
function potteryWheel(p: string[]) {
  const [body, pan, clay] = p
  const g = new THREE.Group()
  g.add(rbox(46, 26, 50, body, {}, 6))
  g.add(cup(19, 17, 9, 1, pan, { y: 26, z: 2 }))
  g.add(cyl(13, 13, 2, METAL, { y: 27, z: 2 }, 32))
  g.add(lathe([[0, 0], [6, 0], [7.2, 2], [7.6, 6], [6.2, 10], [4.2, 13], [4.8, 14.2], [4, 14.4], [3.4, 13], [5.5, 9], [6.4, 5], [5.6, 2], [0, 1.4]], clay, 28).translateY(29).translateZ(2))
  g.add(rbox(10, 3, 14, body, { x: 16, z: 30 }, 1.2))
  g.add(rbox(8, 1, 10, RUBBER, { x: 16, y: 3, z: 30 }, 0.4))
  g.add(noOutline(taperRod3([16, 1, 23], [12, 1, 25], 0.4, 0.4, DARK, 6)))
  g.add(cylZ(2, 1.5, DARK, -14, 18, 25.6, 16))
  g.add(rbox(12, 1.5, 14, pan, { x: -29, y: 22 }, 0.5))
  g.add(rbox(5, 2.5, 4, C.lemon, { x: -30, y: 23.5, z: -2 }, 1))
  g.add(taperRod3([-27, 24.2, 4], [-33, 24.2, 3], 0.3, 0.3, METAL, 6))
  return fit(g)
}

// ---------- 学习 / 研究 ----------

/** 显微镜：[机身, 金属, 灯] */
function microscope(p: string[]) {
  const [body, metal, lamp] = p
  const g = new THREE.Group()
  g.add(rbox(14, 3, 18, body, { z: 1 }, 1.5))
  g.add(taperRod3([0, 3, -6], [0, 20, -7.5], 2, 1.8, body))
  g.add(ball(1.8, body, { y: 20, z: -7.5 }))
  g.add(taperRod3([0, 20, -7.5], [0, 26, -3], 1.8, 1.6, body))
  g.add(rbox(11, 1, 10, DARK, { y: 12, z: 2 }, 0.4))
  g.add(rbox(4, 9, 4, body, { y: 3, z: -4 }, 0.8))
  g.add(litOutlined(cyl(1.5, 1.5, 1, lamp, { y: 3, z: 2 }, 16), lamp))
  for (const s of [-1, 1]) g.add(cylX(2.2, 1.4, DARK, s * 2.6, 9, -6, 16))
  g.add(rbox(5, 5, 7, body, { y: 23, z: -2 }, 1))
  g.add(cyl(2.6, 2.2, 1.6, metal, { y: 20.6, z: 1.4 }, 16))
  for (const [dx, dz, l] of [[0, 1.2, 3.5], [-1.1, -0.6, 3], [1.1, -0.6, 2.5]] as V3[]) g.add(cyl(0.7, 0.55, l, metal, { x: dx, y: 20.7 - l, z: 1.4 + dz }, 10))
  g.add(taperRod3([0, 27.6, -2], [0, 31.5, -5.5], 1.1, 1.1, metal, 12))
  g.add(taperRod3([0, 31.5, -5.5], [0, 33, -6.8], 1.35, 1.35, DARK, 12))
  g.add(noOutline(rbox(7, 0.15, 2.5, '#eaf4ff', { y: 13, z: 2 }, 0.05)))
  return fit(g)
}

/** 化学烧瓶组：试管架 + 锥形瓶 + 烧杯 [木架, 液体 1, 液体 2] */
function chemSet(p: string[]) {
  const [wood, l1, l2] = p
  const g = new THREE.Group()
  g.add(rbox(22, 1, 6, wood, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(1, 9, 6, wood, { x: s * 10.5, y: 1 }, 0.3))
  const holes = [-8, -4, 0, 4, 8].map((x) => ({ kind: 'circle' as const, x, y: 3, r: 1.3 }))
  const top = holePanelH(22, 6, 0.8, wood, holes)
  g.add(P(top, 0, 9.6, 3, -PI / 2))
  const cols = [l1, l2, shade(l1, 0.2), '#ffd27a', shade(l2, -0.15)]
  ;[-8, -4, 0, 4, 8].forEach((x, i) => {
    const lh = 4 + (i % 3) * 2.5
    g.add(cyl(0.95, 0.95, lh, cols[i], { x, y: 1.6 }, 12), ball(0.95, cols[i], { x, y: 1.95 }))
    g.add(ghostOutlined(cyl(1.1, 1.1, 13, GLASS, { x, y: 1.9 }, 12), GLASS, 0.3))
  })
  const fx = 16
  g.add(cyl(3.4, 4.7, 4, l1, { x: fx, y: 0.2 }, 20))
  g.add(ghostOutlined(cyl(1.4, 5, 10, GLASS, { x: fx }, 20), GLASS, 0.3))
  g.add(ghostOutlined(cyl(1.3, 1.3, 4, GLASS, { x: fx, y: 10 }, 16), GLASS, 0.3))
  const bx = -16
  g.add(cyl(3.2, 3.2, 5, l2, { x: bx, y: 0.3 }, 20))
  g.add(ghostOutlined(cup(3.5, 3.5, 9, 0.2, GLASS, { x: bx }), GLASS, 0.3))
  for (let k = 0; k < 3; k++) g.add(noOutline(rbox(1.4, 0.15, 0.1, '#ffffff', { x: bx, y: 3 + k * 2, z: 3.55 }, 0.03)))
  return fit(g)
}

/** 水平放的带洞板：在 xz 平面，宽 w、深 d */
function holePanelH(w: number, d: number, t: number, color: string, holes: { kind: 'circle'; x: number; y: number; r: number }[]) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, d)
  s.lineTo(-w / 2, d)
  s.lineTo(-w / 2, 0)
  for (const h of holes) {
    const path = new THREE.Path()
    path.absarc(h.x, h.y, h.r, 0, PI * 2, true)
    s.holes.push(path)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 12 })
  geo.translate(0, 0, -t / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

const STAR_MOUNT = 120
/** 天文星图（挂墙）：[画框, 底色, 星色] */
function starChart(p: string[]) {
  const [frame, bg, star] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(70, 2.5, 2.5, frame, { y: s > 0 ? 47.5 : 0 }, 0.6))
    g.add(rbox(2.5, 45, 2.5, frame, { x: s * 33.75, y: 2.5 }, 0.6))
  }
  g.add(rbox(66, 46, 0.6, shade(bg, -0.1), { y: 2, z: -0.9 }, 0.2))
  g.add(paintPanel(65, 45, `int-star-${bg}-${star}`, (c, W, H) => {
    const r = rng(77)
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    c.strokeStyle = shade(bg, 0.12)
    c.lineWidth = Math.max(1, W * 0.002)
    const cx = W / 2
    const cy = H / 2
    for (const k of [0.15, 0.28, 0.41]) {
      c.beginPath()
      c.arc(cx, cy, H * k, 0, PI * 2)
      c.stroke()
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2
      c.beginPath()
      c.moveTo(cx, cy)
      c.lineTo(cx + Math.cos(a) * H * 0.41, cy + Math.sin(a) * H * 0.41)
      c.stroke()
    }
    c.fillStyle = star
    const pts: V2[] = []
    for (let k = 0; k < 160; k++) {
      const x = r() * W
      const y = r() * H
      const s = r() < 0.12 ? 2.2 : r() < 0.4 ? 1.3 : 0.8
      c.beginPath()
      c.arc(x, y, s * W * 0.002, 0, PI * 2)
      c.fill()
      if (s > 2) pts.push([x, y])
    }
    c.strokeStyle = star
    c.globalAlpha = 0.6
    for (let k = 0; k + 2 < pts.length; k += 3) {
      c.beginPath()
      c.moveTo(pts[k][0], pts[k][1])
      c.lineTo(pts[k + 1][0], pts[k + 1][1])
      c.lineTo(pts[k + 2][0], pts[k + 2][1])
      c.stroke()
    }
    c.globalAlpha = 1
    c.fillStyle = shade(star, -0.1)
    c.beginPath()
    c.arc(W * 0.82, H * 0.2, H * 0.06, 0, PI * 2)
    c.fill()
  }, { y: 2.5, z: -0.3 }))
  return fit(g, STAR_MOUNT)
}

/** 地图卷轴（摊开）：[纸色, 墨色, 轴木] */
function mapScroll(p: string[]) {
  const [paper, ink, wood] = p
  const g = new THREE.Group()
  g.add(sheet(36, 26, paper, 0, 0, 0, 0.2))
  g.add(paintTop(35, 25, `int-map-${paper}-${ink}`, (c, W, H) => {
    const r = rng(5)
    c.fillStyle = paper
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(paper, -0.12)
    for (let k = 0; k < 4; k++) {
      const cx = W * (0.2 + k * 0.2 + r() * 0.08)
      const cy = H * (0.3 + r() * 0.4)
      for (let j = 0; j < 6; j++) {
        c.beginPath()
        c.ellipse(cx + (r() - 0.5) * W * 0.12, cy + (r() - 0.5) * H * 0.2, W * (0.04 + r() * 0.05), H * (0.05 + r() * 0.08), r() * PI, 0, PI * 2)
        c.fill()
      }
    }
    c.strokeStyle = ink
    c.lineWidth = Math.max(1, W * 0.004)
    c.setLineDash([W * 0.012, W * 0.01])
    c.beginPath()
    c.moveTo(W * 0.15, H * 0.75)
    c.bezierCurveTo(W * 0.35, H * 0.2, W * 0.6, H * 0.9, W * 0.82, H * 0.35)
    c.stroke()
    c.setLineDash([])
    c.strokeStyle = '#c8473a'
    c.lineWidth = W * 0.008
    const x = W * 0.82
    const y = H * 0.35
    const s = W * 0.02
    c.beginPath()
    c.moveTo(x - s, y - s)
    c.lineTo(x + s, y + s)
    c.moveTo(x + s, y - s)
    c.lineTo(x - s, y + s)
    c.stroke()
    c.strokeStyle = ink
    c.lineWidth = Math.max(1, W * 0.003)
    c.beginPath()
    c.arc(W * 0.12, H * 0.2, H * 0.09, 0, PI * 2)
    c.moveTo(W * 0.12, H * 0.06)
    c.lineTo(W * 0.12, H * 0.34)
    c.moveTo(W * 0.12 - H * 0.14, H * 0.2)
    c.lineTo(W * 0.12 + H * 0.14, H * 0.2)
    c.stroke()
  }, 0, 0.5, 0))
  for (const s of [-1, 1]) {
    g.add(cylZ(2.2, 28, shade(paper, -0.05), s * 19.6, 2.2, 0, 20))
    for (const z of [-1, 1]) g.add(cylZ(1, 2.4, wood, s * 19.6, 2.2, z * 15.2, 12))
  }
  return fit(g)
}

/** 参考书堆 + 便签：[书色 1, 书色 2, 便签] */
function refBooks(p: string[]) {
  const [a, b, note] = p
  const g = new THREE.Group()
  const books: [number, number, number, string, number][] = [
    [26, 4.5, 19, a, 0.02],
    [24, 3.5, 17, b, -0.05],
    [25, 5.5, 18.5, shade(a, -0.15), 0.06],
    [21, 3, 15, shade(b, 0.15), -0.03],
  ]
  let y = 0
  const tabs = [note, C.pink, C.sky, C.mint, C.lemon]
  books.forEach(([w, t, d, c, ry], i) => {
    const bk = bookFlat(w, t, d, c, 0, 0, 0, 0, true)
    for (let k = 0; k < 3 + (i % 2); k++) bk.add(rbox(1.4, 0.1, 2.4, tabs[(i + k) % tabs.length], { x: -w / 2 + 3 + k * (w / 4), y: 0.6 + (k % 3) * (t - 1.2) / 3, z: d / 2 + 0.5 }, 0.04))
    g.add(P(bk, (i % 2) * 1.2 - 0.6, y, 0, 0, ry))
    y += t
  })
  g.add(rbox(7.5, 1, 7.5, note, { x: 4, y, z: 2 }, 0.2))
  g.add(taperRod3([-8, y + 0.5, 4], [4, y + 0.5, -4], 0.5, 0.5, DARK, 8))
  return fit(g)
}

// ---------- 收藏 ----------

/** 唱片封面画 */
function drawSleeve(a: string, b: string, seed: number): Draw {
  return (c, W, H) => {
    const r = rng(seed)
    c.fillStyle = a
    c.fillRect(0, 0, W, H)
    c.fillStyle = b
    c.beginPath()
    c.arc(W * (0.3 + r() * 0.4), H * (0.35 + r() * 0.3), W * 0.28, 0, PI * 2)
    c.fill()
    c.fillStyle = shade(a, -0.25)
    for (let k = 0; k < 5; k++) c.fillRect(0, H * (0.72 + k * 0.05), W, H * 0.02)
    c.fillStyle = '#ffffff'
    c.fillRect(W * 0.08, H * 0.08, W * 0.4, H * 0.05)
  }
}

/** 唱片收藏（一排立着 + 一张封面朝外）：[色 1, 色 2, 书挡] */
function recordRow(p: string[]) {
  const [a, b, end] = p
  const g = new THREE.Group()
  const r = rng(12)
  const n = 48
  const step = 0.58
  const x0 = (-n * step) / 2
  const pal = [a, b, '#26262a', '#f4efe4', shade(a, 0.2), shade(b, -0.2), C.lemon, '#c8473a']
  for (let i = 0; i < n; i++) g.add(rbox(0.52, 31.4, 31.4, pal[Math.floor(r() * pal.length)], { x: x0 + step / 2 + i * step, z: 0 }, 0.12))
  for (const s of [-1, 1]) {
    g.add(rbox(0.4, 18, 14, end, { x: s * ((n * step) / 2 + 0.25), z: 8 }, 0.15))
    g.add(rbox(5, 0.4, 14, end, { x: s * ((n * step) / 2 + 2.7), z: 8 }, 0.15))
  }
  const cover = G(rbox(31.4, 31.4, 0.5, a, {}, 0.12), paintPanel(30.6, 30.6, `int-sleeve-${a}-${b}`, drawSleeve(a, b, 3), { y: 0.4, z: 0.3 }))
  cover.add(P(cyl(15, 15, 0.3, '#1e1e22', {}, 32), 6, 15.7, -0.05, PI / 2))
  g.add(P(cover, 0, 0, 15.7 + 31.4 * Math.sin(0.08) + 0.6, -0.08))
  return fit(g)
}

/** 黑胶唱片架（2×2 格，塞满唱片）：[柜体, 唱片色 1, 唱片色 2] */
function vinylRack(p: string[]) {
  const [body, a, b] = p
  const g = new THREE.Group()
  const T = 2
  const IN = 34
  const W = T * 3 + IN * 2
  const legH = 5
  const H = legH + T * 3 + IN * 2
  const D = 36
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.3, legH, shade(body, -0.2), { x: sx * (W / 2 - 4), z: sz * (D / 2 - 4) }, 10))
  g.add(rbox(W, T, D, body, { y: legH }, 0.6))
  g.add(rbox(W - T * 2, T, D - 1, body, { y: legH + T + IN, z: 0.5 }, 0.5))
  g.add(rbox(W, T, D, body, { y: H - T }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(T, H - legH - T * 2, D, body, { x: s * (W / 2 - T / 2), y: legH + T }, 0.5))
  g.add(rbox(T, H - legH - T * 2, D - 1, body, { y: legH + T, z: 0.5 }, 0.5))
  g.add(rbox(W - T * 2, H - legH - T * 2, 1, shade(body, -0.06), { y: legH + T, z: -D / 2 + 0.5 }, 0.3))
  const r = rng(4)
  const pal = [a, b, '#26262a', '#f4efe4', shade(a, 0.2), shade(b, -0.2), C.lemon, '#c8473a']
  for (let cx = 0; cx < 2; cx++)
    for (let cy = 0; cy < 2; cy++) {
      const x0 = -W / 2 + T + cx * (IN + T)
      const y0 = legH + T + cy * (IN + T)
      const n = 18 + Math.floor(r() * 8)
      for (let i = 0; i < n; i++) g.add(rbox(1, 31.4, 31.4, pal[Math.floor(r() * pal.length)], { x: x0 + 1 + i * 1.08, y: y0, z: 1 }, 0.15))
      const lean = G(rbox(1, 31.4, 31.4, pal[Math.floor(r() * pal.length)], { x: -0.5 }, 0.15))
      g.add(P(lean, x0 + IN - 0.3, y0, 1, 0, 0, 0.2))
    }
  return g
}

/** 奖杯·杯形：[底座, 金属, 铭牌] */
function trophyCup(p: string[]) {
  const [base, metal, plate] = p
  const g = new THREE.Group()
  g.add(rbox(14, 3, 10, base, {}, 0.6), rbox(11, 3, 8, shade(base, 0.08), { y: 3 }, 0.6))
  g.add(noOutline(rbox(6, 1.6, 0.2, plate, { y: 0.8, z: 5.05 }, 0.05)))
  g.add(cyl(1, 2.4, 3, metal, { y: 6 }, 16), ball(1.6, metal, { y: 10 }), cyl(0.8, 1.2, 3, metal, { y: 11 }, 12))
  g.add(cup(6.5, 2.4, 10, 0.4, metal, { y: 13.5 }))
  for (const s of [-1, 1]) g.add(torus(3, 0.5, metal, { x: s * 6.2, y: 19, rz: -s * PI / 2 }, PI))
  return g
}

/** 奖杯·星形：[底座, 金属, 铭牌] */
function trophyStar(p: string[]) {
  const [base, metal, plate] = p
  const g = new THREE.Group()
  g.add(rbox(10, 3, 7, base, {}, 0.6))
  g.add(noOutline(rbox(5, 1.4, 0.2, plate, { y: 0.8, z: 3.55 }, 0.05)))
  g.add(cyl(1, 1.4, 11, metal, { y: 3 }, 12))
  const R0 = 6
  const pts: V2[] = []
  for (let k = 0; k < 10; k++) {
    const a = PI / 2 + (k / 10) * PI * 2
    const rr = k % 2 ? R0 * 0.42 : R0
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  g.add(P(flat(pts, 1.8, metal, false, 0.4), 0, 14 + R0 * 0.81 - 1.2, 0))
  return g
}

/** 奖杯·小立柱：[底座, 金属, 铭牌] */
function trophyColumn(p: string[]) {
  const [base, metal, plate] = p
  const g = new THREE.Group()
  g.add(rbox(8, 2, 8, base, {}, 0.5))
  g.add(rbox(4.4, 12, 4.4, shade(base, 0.1), { y: 2 }, 0.4))
  g.add(noOutline(rbox(3, 2, 0.2, plate, { y: 6, z: 2.25 }, 0.05)))
  g.add(cyl(0.7, 1.5, 1.5, metal, { y: 14 }, 12))
  g.add(cup(3, 1, 4, 0.3, metal, { y: 15.5 }))
  return g
}

const MEDAL_MOUNT = 140
/** 奖牌挂架：[挂板, 缎带 1, 缎带 2] */
function medalRack(p: string[]) {
  const [plate, r1, r2] = p
  const g = new THREE.Group()
  g.add(rbox(60, 8, 1.2, plate, { y: 28.5 }, 0.4))
  g.add(paintPanel(56, 5, `int-medal-plate-${plate}`, (c, W, H) => {
    c.fillStyle = plate
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(plate, -0.3)
    for (let k = 0; k < 5; k++) {
      c.beginPath()
      const cx = W * (0.1 + k * 0.2)
      c.arc(cx, H / 2, H * 0.22, 0, PI * 2)
      c.fill()
    }
    c.fillRect(0, H * 0.46, W, H * 0.08)
  }, { y: 30, z: 0.9 }))
  const metals = [GOLD, '#c9ced6', '#c8875a', GOLD, '#c9ced6']
  for (let i = 0; i < 5; i++) {
    const x = -24 + i * 12
    g.add(taperRod3([x, 29, 0.4], [x, 29, 2.4], 0.35, 0.35, METAL, 6))
    const rc = i % 2 ? r2 : r1
    const len = 14 + (i % 3) * 3
    for (const s of [-1, 1]) g.add(P(G(rbox(2.2, len, 0.2, s > 0 ? rc : shade(rc, -0.12), { y: -len }, 0.05)), x + s * 1.1, 29.5, 1.8 + (s > 0 ? 0.25 : 0), 0, 0, -s * 0.08))
    const my = 29.5 - len - 3.2
    g.add(cylZ(3.4, 0.6, metals[i], x, my, 2.2))
    g.add(noOutline(cylZ(2.4, 0.2, shade(metals[i], -0.12), x, my, 2.6, 20)))
  }
  return fit(g, MEDAL_MOUNT)
}

/** 明信片画 */
function drawPostcard(kind: number, a: string, b: string): Draw {
  if (kind === 0) return paintLandscape(a, b, '#ffd27a')
  return (c, W, H) => {
    c.fillStyle = a
    c.fillRect(0, 0, W, H)
    if (kind === 1) {
      c.fillStyle = b
      c.fillRect(0, H * 0.6, W, H * 0.4)
      c.fillStyle = '#ffffff'
      for (let k = 0; k < 3; k++) c.fillRect(0, H * (0.68 + k * 0.1), W, H * 0.02)
      c.fillStyle = '#ffb36b'
      c.beginPath()
      c.arc(W * 0.5, H * 0.6, H * 0.22, PI, 0)
      c.fill()
    } else if (kind === 2) {
      c.fillStyle = b
      for (let k = 0; k < 7; k++) {
        const h = H * (0.3 + ((k * 37) % 50) / 100)
        c.fillRect(W * (k / 7), H - h, W / 7 - W * 0.01, h)
      }
      c.fillStyle = '#fff2b8'
      for (let k = 0; k < 12; k++) c.fillRect(W * ((k * 0.083) % 1) + W * 0.02, H * (0.72 + (k % 3) * 0.08), W * 0.02, H * 0.03)
    } else {
      c.fillStyle = b
      c.beginPath()
      c.moveTo(0, H)
      c.lineTo(W * 0.5, H * 0.25)
      c.lineTo(W, H)
      c.fill()
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.moveTo(W * 0.38, H * 0.47)
      c.lineTo(W * 0.5, H * 0.25)
      c.lineTo(W * 0.62, H * 0.47)
      c.fill()
      c.fillStyle = '#ff8f86'
      c.beginPath()
      c.arc(W * 0.8, H * 0.22, H * 0.1, 0, PI * 2)
      c.fill()
    }
  }
}

const POSTCARD_MOUNT = 110
/** 明信片墙（铁丝网格 + 夹子 + 串灯）：[网格, 夹子, 灯] */
function postcardWall(p: string[]) {
  const [grid, clip, light] = p
  const g = new THREE.Group()
  const W = 90
  const H = 60
  for (let i = 0; i <= 6; i++) g.add(taperRod3([-W / 2, i * 10, 0], [W / 2, i * 10, 0], 0.25, 0.25, grid, 6))
  for (let i = 0; i <= 9; i++) g.add(taperRod3([-W / 2 + i * 10, 0, 0.5], [-W / 2 + i * 10, H, 0.5], 0.25, 0.25, grid, 6))
  const cards: [number, number, boolean, number, string, string][] = [
    [-30, 44, true, 0, '#a8d4f4', '#78c47a'],
    [-8, 47, false, 1, '#ffc6a0', '#3d5a80'],
    [16, 44, true, 2, '#3d4a6a', '#26262a'],
    [34, 40, false, 3, '#cfe8f5', '#9fb4c7'],
    [-33, 18, false, 1, '#ffe08f', '#2f8f8a'],
    [-10, 20, true, 3, '#ffd6e0', '#a9bfa3'],
    [14, 16, true, 0, '#fff1dc', '#e2702f'],
  ]
  cards.forEach(([x, y, land, kind, a, b], i) => {
    const w = land ? 14.8 : 10
    const h = land ? 10 : 14.8
    const card = G(rbox(w, h, 0.2, '#ffffff', { y: -h / 2 }, 0.05), paintPanel(w - 1, h - 1, `int-postcard-${i}-${a}`, drawPostcard(kind, a, b), { y: -h / 2 + 0.5, z: 0.4 }))
    card.add(rbox(1.2, 3, 0.8, clip, { y: h / 2 - 2 }, 0.2))
    g.add(P(card, x, y, 1.1, 0, 0, ((i % 3) - 1) * 0.06))
  })
  const n = 12
  for (let i = 0; i < n; i++) {
    const t0 = i / n
    const t1 = (i + 1) / n
    const yA = H - 3 - Math.sin(t0 * PI) * 7
    const yB = H - 3 - Math.sin(t1 * PI) * 7
    g.add(noOutline(taperRod3([-W / 2 + t0 * W, yA, 1.6], [-W / 2 + t1 * W, yB, 1.6], 0.12, 0.12, DARK, 4)))
    if (i > 0) g.add(litOutlined(ball(0.9, light, { x: -W / 2 + t0 * W, y: yA - 1, z: 1.6 }, [1, 1.3, 1]), light, 0.8))
  }
  return fit(g, POSTCARD_MOUNT)
}

/** 多肉组合（木托盘 + 四个小盆）：[托盘, 盆色, 多肉色] */
function succulentSet(p: string[]) {
  const [wood, pot, leafC] = p
  const g = new THREE.Group()
  g.add(tray(32, 3, 12, 0.8, wood))
  const xs = [-11.5, -4, 3.5, 11]
  xs.forEach((x, i) => {
    const pc = i % 2 ? pot : shade(pot, -0.12)
    g.add(cup(3.2, 2.6, 5.5, 0.4, pc, { x, y: 0.8 }))
    g.add(cyl(2.85, 2.85, 0.4, SOIL, { x, y: 5.6 }, 16))
  })
  const ry = 6
  // 莲座
  for (let ring = 0; ring < 3; ring++) {
    const n = 5 + ring * 2
    for (let k = 0; k < n; k++) g.add(petal(3.4 - ring * 0.8, shade(leafC, ring * 0.06), xs[0], ry, 0, (k / n) * PI * 2 + ring * 0.4, 0.35 + ring * 0.35, 0.55, 0.25))
  }
  // 小仙人掌
  g.add(capsule(1.5, 4, '#5aa36a', { x: xs[1], y: ry - 0.4 }))
  g.add(capsule(0.8, 1.6, '#5aa36a', { x: xs[1] + 1.6, y: ry + 1.6, rz: -0.5 }))
  g.add(ball(0.7, C.pink, { x: xs[1], y: ry + 6.7 }))
  // 十二卷
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2
    g.add(P(cyl(0.01, 0.6, 4, shade(leafC, -0.18), {}, 6), xs[2] + Math.cos(a) * 0.9, ry + 1.6, Math.sin(a) * 0.9, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4))
  }
  // 球形
  g.add(ball(2.2, shade(leafC, 0.1), { x: xs[3], y: ry + 1.8 }, [1, 0.9, 1]))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(noOutline(ball(2.2, shade(leafC, -0.05), { x: xs[3] + Math.cos(a) * 0.2, y: ry + 1.8, z: Math.sin(a) * 0.2 }, [0.25, 0.9, 1.02]).rotateY(a)))
  }
  g.add(ball(0.6, C.lemon, { x: xs[3], y: ry + 3.9 }))
  return fit(g)
}

/** 矿石标本盒（4×3 格）：[木盒, 点缀, 衬底] */
function mineralBox(p: string[]) {
  const [wood, acc, pad] = p
  const g = new THREE.Group()
  g.add(tray(30, 3.5, 22, 0.8, wood))
  for (const x of [-7.1, 0, 7.1]) g.add(rbox(0.5, 3, 20.4, wood, { x, y: 0.8 }, 0.15))
  for (const z of [-3.5, 3.5]) g.add(rbox(28.4, 3, 0.5, wood, { y: 0.8, z }, 0.15))
  const minerals = ['#c7a3ff', '#ffffff', '#ffd27a', '#9fd8e8', acc, '#ff9fb4', '#6a6d74', '#b8e0a0', '#e2b74a', '#d65a3c', '#bfe6ff', shade(acc, 0.2)]
  const r = rng(9)
  for (let i = 0; i < 12; i++) {
    const cx = -10.6 + (i % 4) * 7.1
    const cz = -7 + Math.floor(i / 4) * 7
    g.add(rbox(5.6, 0.4, 5.4, pad, { x: cx, y: 0.8, z: cz }, 0.15))
    const c = minerals[i]
    const kind = i % 4
    if (kind === 0) {
      for (let k = 0; k < 4; k++) {
        const h = 2.6 + r() * 1.6
        g.add(P(cyl(0.01, 0.7, h, c, {}, 6), cx + (k - 1.5) * 0.9, 1.2 + h / 2 - 0.3, cz + (k % 2) * 0.6, (r() - 0.5) * 0.5, 0, (k - 1.5) * 0.25))
      }
    } else if (kind === 1) {
      g.add(ball(1.8, '#8a7a6a', { x: cx, y: 1.2, z: cz }, [1, 0.7, 1]))
      g.add(noOutline(ball(1.3, c, { x: cx, y: 2.25, z: cz }, [1, 0.25, 1])))
    } else if (kind === 2) {
      g.add(ball(1.6, c, { x: cx, y: 2.2, z: cz }, [1.2, 0.65, 0.9]))
    } else {
      g.add(P(rbox(2, 2, 2, c, {}, 0.15), cx, 1.2, cz, 0, 0.5))
      g.add(P(rbox(1.2, 1.2, 1.2, c, {}, 0.1), cx + 1.4, 1.2, cz + 0.8, 0, 0.2))
    }
  }
  return g
}

// ---------- 生活气息 ----------

/** 猫抓板（波浪形）+ 逗猫棒 + 玩具老鼠：[纸板, 逗猫棒, 羽毛] */
function catToys(p: string[]) {
  const [card, wand, feather] = p
  const g = new THREE.Group()
  const top = (x: number) => 5 + 4 * (x / 24) ** 2
  const pts: V2[] = [[-24, 0], [24, 0]]
  for (let i = 0; i <= 24; i++) {
    const x = 24 - (i / 24) * 48
    pts.push([x, top(x)])
  }
  g.add(flat(pts, 22, card, false, 0.6))
  for (const s of [-1, 1]) g.add(rbox(48.4, 3, 0.4, shade(card, -0.3), { y: 0.5, z: s * 11.1 }, 0.1))
  for (let i = 0; i < 9; i++) {
    const x = -20 + i * 5
    g.add(noOutline(rbox(0.3, 0.1, 21, shade(card, -0.15), { x, y: top(x) + 0.05 }, 0.04)))
  }
  g.add(ball(1.5, '#9aa0a8', { x: 0, y: 6.3, z: 2 }, [1, 0.8, 1.5]))
  for (const s of [-1, 1]) g.add(noOutline(ball(0.6, C.pink, { x: s * 0.8, y: 7.5, z: 3.4 }, [1, 1, 0.3])))
  g.add(noOutline(taperRod3([0, 5.6, -0.2], [2, 5.4, -3.5], 0.12, 0.08, C.pink, 4)))
  g.add(taperRod3([-24, 0.5, 15], [14, 0.5, 13], 0.5, 0.4, wand, 8))
  g.add(noOutline(taperRod3([14, 0.4, 13], [20, 0.3, 17], 0.08, 0.08, '#ffffff', 4)))
  g.add(ball(1.6, feather, { x: 21, y: 1.6, z: 17.5 }))
  for (let k = 0; k < 4; k++) g.add(petal(5, k % 2 ? feather : shade(feather, 0.2), 21.5, 1.2, 17.5, -0.8 + k * 0.5, 0.25, 0.3, 0.12))
  return fit(g)
}

/** 旅行箱（立放）：[箱色, 点缀, 贴纸] */
function suitcaseStand(p: string[]) {
  const [main, acc, sticker] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(40, 60, 11.6, main, { y: 4, z: s * 6.2 }, 3))
  g.add(rbox(39, 59, 1.4, DARK, { y: 4.5 }, 0.5))
  for (const x of [-12, -4, 4, 12]) g.add(rbox(2, 52, 0.6, shade(main, -0.06), { x, y: 8, z: 12.1 }, 0.3))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(3, 2.6, 3.6, DARK, { x: sx * 16.5, y: 2.4, z: sz * 8.5 }, 0.6))
      g.add(cylX(1.8, 1.4, RUBBER, sx * 16.5, 1.8, sz * 8.5, 14))
    }
  g.add(rbox(20, 1, 4, DARK, { y: 64, z: -8 }, 0.4))
  for (const s of [-1, 1]) g.add(cyl(0.6, 0.6, 6, METAL, { x: s * 8, y: 64.5, z: -8 }, 8))
  g.add(rbox(19, 2, 3, DARK, { y: 70, z: -8 }, 0.8))
  g.add(rbox(12, 1.5, 3, acc, { y: 64.4, z: 3 }, 0.6))
  g.add(rbox(1, 3, 10, acc, { x: 20.3, y: 40 }, 0.4))
  g.add(P(rbox(0.3, 6, 4, sticker, {}, 0.1), 20.9, 32, 2, 0, 0, 0.08))
  for (const [x, y, r, c] of [[-10, 50, 3, sticker], [6, 22, 2.4, acc], [11, 54, 2, C.white]] as [number, number, number, string][]) g.add(noOutline(cylZ(r, 0.2, c, x, y, 12.55, 20)))
  return fit(g)
}

/** 旅行箱（打开平放）：[箱色, 内衬, 衣物] */
function suitcaseOpen(p: string[]) {
  const [main, lining, cloth] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(tray(40, 11, 62, 1.4, main, { x: s * 20.6 }))
    g.add(rbox(37, 0.6, 59, lining, { x: s * 20.6, y: 1.4 }, 0.2))
  }
  g.add(cylZ(0.9, 60, DARK, 0, 1.2, 0, 10))
  const folds: [number, number, string][] = [[-14, -15, cloth], [-14, 6, shade(cloth, 0.2)], [-28, -10, C.white], [-28, 12, shade(cloth, -0.15)]]
  for (const [x, z, c] of folds) for (let k = 0; k < 2; k++) g.add(rbox(14, 2.6, 18, k ? shade(c, 0.05) : c, { x, y: 2 + k * 2.6, z }, 1))
  g.add(P(capsule(3, 10, C.sky), -21, 5, 25, 0, 0, PI / 2))
  g.add(ghostOutlined(rbox(36, 4, 28, '#9fb4c7', { x: 20.6, y: 2, z: -14 }, 0.8), '#9fb4c7', 0.45))
  g.add(rbox(14, 3, 10, C.pink, { x: 16, y: 2, z: -14 }, 1))
  for (const s of [-1, 1]) g.add(noOutline(P(rbox(1.6, 0.3, 36, DARK, {}, 0.1), 20.6, 2.2, 14, 0, s * 0.5)))
  for (const s of [-1, 1]) g.add(cylX(1.8, 1.4, RUBBER, -20.6 + s * 14, 3, -32.6, 14))
  return fit(g)
}

const RAINCOAT_MOUNT = 95
/** 雨衣（挂在墙钩上）：[雨衣, 扣子, 墙钩] */
function raincoat(p: string[]) {
  const [coat, btn, hook] = p
  const g = new THREE.Group()
  const top = 92
  g.add(rbox(5, 7, 1.2, hook, { y: top - 4, z: 0.6 }, 0.4))
  g.add(taperRod3([0, top - 1.5, 1.2], [0, top - 2, 6], 0.5, 0.5, hook, 8))
  g.add(ball(0.8, hook, { y: top - 1.6, z: 6.2 }))
  g.add(torus(1.4, 0.3, coat, { y: top - 3, z: 5.5 }))
  g.add(taperRod3([0, top - 4.2, 5.6], [0, top - 12, 7.5], 0.6, 0.6, shade(coat, -0.1), 6))
  g.add(ball(8, shade(coat, -0.06), { y: top - 22, z: 3.5 }, [1, 1.1, 0.5]))
  const coatBody = cyl(13, 20, 68, coat, { y: top - 84, z: 9 }, 24)
  coatBody.scale.z = 0.45
  g.add(coatBody)
  g.add(ball(13.5, coat, { y: top - 17, z: 9 }, [1, 0.45, 0.45]))
  for (const s of [-1, 1]) g.add(P(capsule(3.4, 44, shade(coat, -0.05)), s * 15.5, top - 44, 9, 0, 0, s * 0.1))
  for (let k = 0; k < 5; k++) {
    const y = top - 26 - k * 12
    const rr = 13 + ((top - 16 - y) / 68) * 7
    g.add(ball(0.9, btn, { x: 1.2, y, z: 9 + rr * 0.45 + 0.2 }, [1, 1, 0.5]))
  }
  for (const s of [-1, 1]) g.add(noOutline(rbox(7, 1.2, 0.4, shade(coat, -0.12), { x: s * 8, y: top - 62, z: 9 + 18 * 0.45 + 0.4 }, 0.2)))
  return fit(g, RAINCOAT_MOUNT)
}

/** 一个快递纸箱：底面中心 */
function carton(w: number, h: number, d: number, color: string, seed: number) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, color, {}, 0.6))
  const tape = shade(color, 0.12)
  g.add(rbox(5, 0.25, d + 0.2, tape, { y: h - 0.1 }, 0.08))
  for (const s of [-1, 1]) g.add(rbox(5, 6, 0.25, tape, { y: h - 6, z: s * (d / 2 + 0.05) }, 0.08))
  g.add(rbox(10, 6.5, 0.2, '#ffffff', { x: w / 4, y: h * 0.4, z: d / 2 + 0.05 }, 0.05))
  g.add(paintPanel(9, 5.5, `int-label-${seed}`, (c, W, H) => {
    const r = rng(seed)
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#26262a'
    for (let k = 0; k < 4; k++) c.fillRect(W * 0.06, H * (0.1 + k * 0.12), W * (0.3 + r() * 0.5), H * 0.05)
    for (let x = W * 0.06; x < W * 0.94; x += W * 0.025) if (r() > 0.35) c.fillRect(x, H * 0.66, W * 0.012, H * 0.26)
  }, { x: w / 4, y: h * 0.4 + 0.5, z: d / 2 + 0.4 }))
  g.add(noOutline(rbox(w * 0.3, 0.1, 0.1, '#5a4646', { x: -w / 4, y: h * 0.75, z: d / 2 + 0.02 }, 0.03)))
  return g
}

/** 快递纸箱堆：n = 1 / 2 / 3 箱 [纸板色] */
const cartons = (n: number) => (p: string[]) => {
  const c = p[0]
  const g = new THREE.Group()
  const spec: [number, number, number, number][] = n === 1 ? [[34, 20, 24, 0]] : n === 2 ? [[45, 30, 35, 0], [34, 20, 24, 0.1]] : [[55, 35, 40, 0], [45, 30, 35, -0.06], [34, 20, 24, 0.12]]
  let y = 0
  spec.forEach(([w, h, d, ry], i) => {
    g.add(P(carton(w, h, d, i % 2 ? shade(c, 0.05) : c, n * 10 + i), 0, y, 0, 0, ry))
    y += h
  })
  return fit(g)
}

/** 零食堆：薯片袋 + 饼干棒 + 糖果 + 杯面 [袋色, 盒色, 点缀] */
function snackPile(p: string[]) {
  const [bag, box, acc] = p
  const g = new THREE.Group()
  // 薯片袋：P 会覆盖 rbox 自带的位置，所以这里直接给袋子中心高度 2.25（底面贴地）
  g.add(P(rbox(16, 4.5, 22, bag, {}, 2.2), 0, 2.25, 0, 0, 0.15))
  g.add(P(G(paintTop(11, 13, `int-chips-${bag}-${acc}`, (c, W, H) => {
    c.fillStyle = bag
    c.fillRect(0, 0, W, H)
    c.fillStyle = acc
    c.beginPath()
    c.ellipse(W / 2, H * 0.55, W * 0.35, H * 0.22, 0.3, 0, PI * 2)
    c.fill()
    c.fillStyle = '#ffffff'
    c.fillRect(W * 0.15, H * 0.12, W * 0.7, H * 0.14)
  }, 0, 4.8, 0)), 0, 0, 0, 0, 0.15))
  // 袋子两端的封口压边（包一层 grp 再转，免得 P 把 z 覆盖成 0、两条叠在中间）
  for (const s of [-1, 1]) g.add(P(G(rbox(16.4, 1.4, 1.4, shade(bag, -0.15), { y: 1.6, z: s * 10.8 }, 0.4)), 0, 0, 0, 0, 0.15))
  g.add(rbox(4, 2, 15, box, { x: 12, z: 0 }, 0.3), P(rbox(4, 2, 15, shade(box, 0.15), {}, 0.3), 12.5, 2, 0.5, 0, 0.2))
  const cc = [acc, C.pink, C.sky, C.lemon, C.mint]
  cc.forEach((c, i) => {
    const x = -4 + i * 3
    const z = 13 + (i % 2) * 2
    g.add(ball(1.2, c, { x, y: 1.2, z }, [1.3, 1, 1]))
    for (const s of [-1, 1]) g.add(P(cyl(0.2, 0.9, 1, c, {}, 8), x + s * 2, 1.2, z, 0, 0, s * PI / 2))
  })
  g.add(cyl(4.5, 3.4, 9.5, '#ffffff', { x: -14, z: -6 }, 20), puck(4.7, 0.5, METAL, { x: -14, y: 9.5, z: -6 }), cyl(4.15, 3.95, 2.5, acc, { x: -14, y: 5, z: -6 }, 20))
  return fit(g)
}

/** 能量饮料罐堆（3-2-1 金字塔 + 一罐）：[罐色, 条纹, 拉环] */
function energyCans(p: string[]) {
  const [body, band, top] = p
  const g = new THREE.Group()
  const can = (x: number, y: number, z: number) => {
    g.add(cyl(2.65, 2.65, 13, body, { x, y, z }, 20))
    g.add(cyl(2.3, 2.6, 0.5, top, { x, y: y + 13, z }, 20))
    g.add(cyl(2.4, 2.6, 0.4, top, { x, y: y - 0.0, z }, 20).translateY(0))
    g.add(cyl(2.68, 2.68, 3, band, { x, y: y + 5, z }, 20))
    g.add(noOutline(rbox(1.6, 0.1, 0.8, top, { x, y: y + 13.5, z: z + 0.8 }, 0.05)))
  }
  const hh = 13.5
  for (let i = 0; i < 3; i++) can(-5.4 + i * 5.4, 0, 0)
  for (let i = 0; i < 2; i++) can(-2.7 + i * 5.4, hh, 0)
  can(0, hh * 2, 0)
  can(9.5, 0, 5)
  return fit(g)
}

/** 咖啡豆罐：铁罐 + 陶罐 + 玻璃罐 + 量勺 [铁罐, 陶罐, 标签] */
function coffeeCanisters(p: string[]) {
  const [tin, ceramic, label] = p
  const g = new THREE.Group()
  const BEAN = '#6b4128'
  g.add(cyl(5, 5, 14, tin, { x: -9 }, 24), puck(5.2, 2, shade(tin, -0.1), { x: -9, y: 13.5 }), cyl(5.05, 5.05, 5, label, { x: -9, y: 4 }, 24))
  g.add(cyl(4.5, 4.5, 11, ceramic, { x: 1.5, z: -1 }, 24), puck(4.6, 1.6, J.wood, { x: 1.5, y: 11, z: -1 }), ball(0.9, J.wood, { x: 1.5, y: 13, z: -1 }))
  const gx = 11
  g.add(cyl(3.7, 3.7, 8, BEAN, { x: gx, y: 0.3, z: 1 }, 20))
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9
    g.add(ball(0.7, BEAN, { x: gx + Math.cos(a) * 2.2, y: 8.4, z: 1 + Math.sin(a) * 2.2 }, [1, 0.6, 1.3]))
  }
  g.add(ghostOutlined(cyl(4, 4, 12, GLASS, { x: gx, z: 1 }, 20), GLASS, 0.3))
  g.add(puck(4.2, 1.4, METAL, { x: gx, y: 12, z: 1 }))
  g.add(cup(1.8, 1.6, 1.6, 0.2, METAL, { x: -2, z: 7 }))
  g.add(taperRod3([-0.5, 0.9, 7], [5, 0.6, 8.5], 0.35, 0.35, METAL, 6))
  for (let k = 0; k < 4; k++) g.add(ball(0.7, BEAN, { x: -4.5 + k * 1.1, y: 0.4, z: 9.5 + (k % 2) }, [1, 0.6, 1.3]))
  return fit(g)
}

// ---------- 钓鱼 ----------

/** 钓竿沿线的点：底端在原点，往 -z 后仰 lean，竿梢最后 30% 往前垂 bend */
function rodPath(L: number, lean: number, bend: number, n = 16): V3[] {
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const k = s > 0.7 ? ((s - 0.7) / 0.3) ** 2 : 0
    pts.push([0, s * L * Math.cos(lean) - k * bend * 0.3, -s * L * Math.sin(lean) + k * bend])
  }
  return pts
}

/** 一根钓竿（沿给定路径）：握把、卷线器、导环 [竿色, 握把, 卷线器] */
function rodAlong(pts: V3[], blank: string, grip: string, reel: string, sea: boolean) {
  const g = new THREE.Group()
  g.add(taperPath(pts, sea ? 1.1 : 0.8, 0.12, blank, 8))
  const at = (s: number): THREE.Vector3 => {
    const f = s * (pts.length - 1)
    const i = Math.min(pts.length - 2, Math.floor(f))
    return new THREE.Vector3(...pts[i]).lerp(new THREE.Vector3(...pts[i + 1]), f - i)
  }
  const gripLen = sea ? 0.2 : 0.14
  const a = at(0.01)
  const b = at(gripLen)
  g.add(taperRod3([a.x, a.y, a.z], [b.x, b.y, b.z], sea ? 1.6 : 1.3, sea ? 1.4 : 1.1, grip, 12))
  g.add(ball(sea ? 1.7 : 1.4, DARK, { x: a.x, y: Math.max(a.y, sea ? 1.7 : 1.4), z: a.z }))
  // 卷线器：挂在竿的前面（+z 侧，即离墙一侧）
  const rp = at(gripLen + 0.02)
  const rr = sea ? 4.2 : 3
  g.add(taperRod3([rp.x, rp.y, rp.z], [rp.x, rp.y - 0.5, rp.z + 3.5], 0.5, 0.5, reel, 8))
  g.add(P(cyl(rr, rr, sea ? 4 : 3, reel, {}, 20), rp.x, rp.y - 0.8, rp.z + 3.5 + rr * 0.6, 0, 0, PI / 2))
  g.add(cylX(rr * 0.6, sea ? 4.6 : 3.4, shade(reel, -0.2), rp.x, rp.y - 0.8, rp.z + 3.5 + rr * 0.6, 14))
  g.add(cylX(0.3, 3, METAL, rp.x + (sea ? 3.5 : 2.6), rp.y - 0.8, rp.z + 3.5 + rr * 0.6, 6))
  // 导环
  for (const s of [0.36, 0.5, 0.62, 0.72, 0.8, 0.87, 0.93, 0.98]) {
    const c = at(s)
    const r = 0.5 + (1 - s) * (sea ? 2.4 : 1.6)
    g.add(noOutline(P(torus(r, 0.12, METAL, {}), c.x, c.y, c.z + r + 0.3, PI / 2)))
  }
  return g
}

/** 钓竿（靠墙立着）：底端贴地、上端靠墙、竿梢略弯 */
const rodStanding = (sea: boolean) => (p: string[]) => {
  const L = sea ? 240 : 195
  const lean = sea ? 0.075 : 0.085
  const g = rodAlong(rodPath(L, lean, sea ? 7 : 6), p[0], p[1], p[2], sea)
  return fit(g)
}

/** 竿袋（平放）：[袋色, 拉链, 带子] */
const rodBag = (sea: boolean) => (p: string[]) => {
  const [bag, zip, strap] = p
  const L = sea ? 150 : 128
  const g = new THREE.Group()
  g.add(rbox(L, 10, 14, bag, {}, 4.5))
  g.add(noOutline(rbox(L - 8, 0.3, 0.8, zip, { y: 9.9, z: 2 }, 0.1)))
  g.add(rbox(10, 2.4, 8, shade(bag, -0.12), { x: L / 2 - 8, y: 1, z: 0 }, 1).translateY(0))
  g.add(rbox(30, 7, 1.6, shade(bag, -0.1), { x: -L / 4, y: 1.5, z: 7.4 }, 1.2))
  g.add(rbox(16, 1.2, 3, strap, { y: 10 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2.4, 1, 14.4, strap, { x: s * (L / 2 - 14), y: 4 }, 0.4))
  g.add(noOutline(taperRod3([-(L / 2 - 14), 5, 7.3], [L / 2 - 14, 5, 7.3], 0.5, 0.5, strap, 6)))
  return fit(g)
}

const ROD_RACK_MOUNT = 150
/** 壁挂钓竿架（横挂 3 根）：[支架木, 竿色, 卷线器] */
function rodRack(p: string[]) {
  const [wood, blank, reel] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(6, 34, 2, wood, { x: s * 55, z: 1 }, 0.8))
    for (let k = 0; k < 3; k++) {
      g.add(rbox(6, 1.6, 7, wood, { x: s * 55, y: 4 + k * 11, z: 5 }, 0.5))
      g.add(rbox(6, 2.2, 1.2, wood, { x: s * 55, y: 4 + k * 11, z: 8 }, 0.4))
    }
  }
  const lens = [196, 210, 182]
  const cols = [blank, shade(blank, 0.15), shade(blank, -0.15)]
  for (let k = 0; k < 3; k++) {
    const L = lens[k]
    const y = 5.6 + 1 + k * 11
    const pts: V3[] = [[-L / 2, 0, 0], [L / 2, 0, 0]]
    const rod = rodAlong(pts, cols[k], k === 1 ? '#3a3b40' : '#c8a070', reel, k === 1)
    g.add(P(rod, 0, y, 5.5))
  }
  return fit(g, ROD_RACK_MOUNT)
}

/** 拟饵：小鱼形 + 钩 */
function lure(color: string, x: number, y: number, z: number, ry = 0) {
  return P(G(ball(0.6, color, { y: 0.6 }, [2.4, 1, 0.9]), noOutline(ball(0.2, '#ffffff', { x: 1, y: 0.75, z: 0.45 })), P(torus(0.35, 0.06, METAL, {}), 0, 0.2, 0.6, 0)), x, y, z, 0, ry)
}

/** 渔具箱：open = 打开（盖子掀到后面，上层隔板里是拟饵）[箱色, 扣件, 拟饵主色] */
const tackleBox = (open: boolean) => (p: string[]) => {
  const [box, latch, lureC] = p
  const g = new THREE.Group()
  const W = 36
  const D = 20
  if (!open) {
    g.add(rbox(W, 12, D, box, {}, 1.2))
    g.add(rbox(W + 0.4, 6, D + 0.4, shade(box, -0.08), { y: 12 }, 1.2))
    for (const s of [-1, 1]) g.add(rbox(3, 3, 1, latch, { x: s * 11, y: 10.5, z: D / 2 + 0.4 }, 0.4))
    for (const s of [-1, 1]) g.add(rbox(2, 3, 3, DARK, { x: s * 8, y: 18 }, 0.5))
    g.add(rbox(18, 1.6, 3, DARK, { y: 20.4 }, 0.6))
    return fit(g)
  }
  g.add(tray(W, 12, D, 1, box))
  g.add(rbox(W - 2, 1, D - 2, shade(box, 0.15), { y: 9 }, 0.3))
  for (let i = 1; i < 6; i++) g.add(rbox(0.5, 3, D - 2, shade(box, 0.15), { x: -W / 2 + 1 + i * ((W - 2) / 6), y: 9 }, 0.15))
  g.add(rbox(W - 2, 3, 0.5, shade(box, 0.15), { y: 9 }, 0.15))
  const lc = [lureC, C.lemon, '#c8473a', C.sky, C.mint, '#ffffff', shade(lureC, 0.2), C.pink, '#f0a040', C.lilac, lureC, C.lemon]
  for (let i = 0; i < 12; i++) {
    const x = -W / 2 + 1 + ((i % 6) + 0.5) * ((W - 2) / 6)
    const z = i < 6 ? -4.5 : 4.5
    g.add(lure(lc[i], x, 10, z, PI / 2 + (i % 3) * 0.3))
  }
  const lid = G(tray(W, 6, D, 1, shade(box, -0.08), { y: 0, rx: PI }).translateY(6), rbox(W - 2, 0.6, D - 2, shade(box, 0.2), { y: 1 }, 0.3))
  for (let i = 0; i < 6; i++) lid.add(lure(lc[11 - i], -W / 2 + 4 + i * 5.6, 1.6, 0, PI / 2))
  g.add(P(lid, 0, 12, -D / 2, -(PI / 2 + 0.25)).translateZ(0))
  for (const s of [-1, 1]) g.add(rbox(3, 3, 1, latch, { x: s * 11, y: 8.5, z: D / 2 + 0.4 }, 0.4))
  return fit(g)
}

/** 钓鱼冷藏箱：[箱体, 盖, 把手] */
function fishCooler(p: string[]) {
  const [body, lid, handle] = p
  const g = new THREE.Group()
  g.add(rbox(50, 26, 30, body, {}, 3))
  g.add(rbox(51, 6, 31, lid, { y: 26 }, 2.5))
  g.add(rbox(20, 0.6, 12, shade(lid, -0.1), { x: -10, y: 32 }, 0.3))
  g.add(rbox(12, 2.4, 8, shade(lid, 0.1), { x: 15, y: 31 }, 1))
  for (const s of [-1, 1]) {
    g.add(cylX(1.2, 2, DARK, s * 25.6, 22, 0, 10))
    g.add(taperRod3([s * 26.8, 22, -12], [s * 26.8, 22, 12], 0.9, 0.9, handle, 8))
    g.add(taperRod3([s * 26.2, 22, -12], [s * 26.8, 22, -12], 0.9, 0.9, handle, 8), taperRod3([s * 26.2, 22, 12], [s * 26.8, 22, 12], 0.9, 0.9, handle, 8))
  }
  g.add(rbox(10, 6, 0.6, '#ffffff', { x: -12, y: 8, z: 15.1 }, 0.3))
  g.add(cylZ(1.2, 1.4, DARK, 18, 3, 15.4, 12))
  for (const s of [-1, 1]) g.add(rbox(3, 4, 1.2, DARK, { x: s * 18, y: 24, z: 15.4 }, 0.4))
  return fit(g)
}

/** 折叠钓鱼凳（三脚）：[凳面, 腿] */
function fishingStool(p: string[]) {
  const [seat, leg] = p
  const g = new THREE.Group()
  const top = 40
  const feet: V2[] = []
  for (let k = 0; k < 3; k++) {
    const a = PI / 2 + (k / 3) * PI * 2
    feet.push([Math.cos(a) * 15, Math.sin(a) * 15])
  }
  for (let k = 0; k < 3; k++) {
    const [fx, fz] = feet[k]
    const [tx, tz] = feet[(k + 1) % 3]
    g.add(taperRod3([fx, 0.8, fz], [-tx * 0.85, top - 1, -tz * 0.85], 0.9, 0.9, leg, 8))
    g.add(ball(1, RUBBER, { x: fx, y: 1, z: fz }))
  }
  const tri = flat(feet.map(([x, z]): V2 => [-x * 0.95, -z * 0.95]), 1.2, seat, true, 0.3)
  g.add(P(tri, 0, top + 0.6, 0, PI / 2))
  return fit(g)
}

/** 鱼篓（竹编，背面平）：[竹色, 盖, 皮带] */
function fishCreel(p: string[]) {
  const [bamboo, lid, strap] = p
  const g = new THREE.Group()
  const body = cup(13, 10, 22, 1, bamboo)
  body.scale.z = 0.62
  g.add(body)
  for (const y of [5, 10, 15, 19]) {
    const t = torus(10 + (3 * y) / 22 + 0.15, 0.35, shade(bamboo, -0.15), { y, rx: PI / 2 })
    t.scale.y = 0.62
    g.add(t)
  }
  const lidM = puck(13.3, 2, lid, { y: 21.5 })
  lidM.scale.z = 0.62
  g.add(lidM)
  g.add(cup(2.6, 2.2, 2, 0.4, lid, { x: 4, y: 23.3 }))
  g.add(taperRod3([-11.5, 20, 0], [-6, 34, 0], 0.8, 0.8, strap, 8), taperRod3([11.5, 20, 0], [6, 34, 0], 0.8, 0.8, strap, 8), taperRod3([-6, 34, 0], [6, 34, 0], 0.8, 0.8, strap, 8))
  g.add(rbox(3, 3, 0.8, METAL, { y: 17, z: 8.2 }, 0.3))
  return fit(g)
}

/** 抄网（靠墙立着）：[杆色, 网框, 网] */
function landingNet(p: string[]) {
  const [pole, hoop, net] = p
  const g = new THREE.Group()
  const lean = 0.1
  const L = 120
  const top: V3 = [0, L * Math.cos(lean), -L * Math.sin(lean)]
  g.add(taperRod3([0, 0, 0], top, 1.2, 1, pole))
  g.add(taperRod3([0, 0, 0], [0, 30 * Math.cos(lean), -30 * Math.sin(lean)], 1.6, 1.5, DARK))
  const R = 20
  const hoopG = new THREE.Group()
  hoopG.add(torus(R, 0.6, hoop, { y: R }))
  hoopG.add(taperRod3([0, -2, 0], [0, 1, 0], 1.1, 1.1, hoop, 8))
  const bag = ghostOutlined(cup(R - 0.3, 3, 30, 0.2, net), net, 0.55)
  bag.position.set(0, R, 30)
  bag.rotation.set(-PI / 2, 0, 0)
  hoopG.add(bag)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2
    hoopG.add(noOutline(taperRod3([Math.cos(a) * R, R + Math.sin(a) * R, 0], [Math.cos(a) * 3, R + Math.sin(a) * 3, 30], 0.1, 0.1, shade(net, -0.25), 4)))
  }
  hoopG.position.set(...top)
  hoopG.rotation.x = -lean
  g.add(hoopG)
  return fit(g)
}

// ---------- 桌游扩充：盒子、摆开的桌游、更多棋牌 ----------

/** 贴花：画面贴在表面上方 0.02，用 polygonOffset 防闪（卡牌、骰子这类很薄的东西） */
function decal<T extends THREE.Mesh>(m: T): T {
  const mat = m.material as THREE.Material
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  mat.polygonOffsetUnits = -2
  return m
}

/** 平放的薄卡片：底面中心在原点，正面画 draw（不给就是纯色背面） */
function card(w: number, d: number, edge: string, key: string, draw?: Draw, t = 0.1) {
  const g = G(rbox(w, t, d, edge, {}, Math.min(0.04, t * 0.4)))
  if (draw) g.add(decal(paintTop(w - 0.1, d - 0.1, key, draw, 0, t + 0.02, 0)))
  return g
}

/** 一叠卡：n 张高 */
function cardStack(w: number, d: number, n: number, side: string, top: string, key: string, draw?: Draw) {
  const h = n * 0.08
  const g = G(rbox(w, h, d, side, {}, 0.05))
  if (draw) g.add(decal(paintTop(w - 0.1, d - 0.1, key, draw, 0, h + 0.02, 0)))
  else g.add(decal(paintTop(w - 0.1, d - 0.1, `${key}-plain`, (c, W, H) => {
    c.fillStyle = top
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffff'
    c.lineWidth = W * 0.06
    c.strokeRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84)
  }, 0, h + 0.02, 0)))
  return g
}

/** 骰子点数 */
function drawPips(n: number, face: string, pip: string): Draw {
  const spots: Record<number, V2[]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  }
  return (c, W, H) => {
    c.fillStyle = face
    c.fillRect(0, 0, W, H)
    c.fillStyle = n === 1 && pip === '#26262a' ? '#c8473a' : pip
    for (const [x, y] of spots[n]) {
      c.beginPath()
      c.arc(x * W, y * H, W * (n === 1 ? 0.14 : 0.1), 0, PI * 2)
      c.fill()
    }
  }
}

/** 骰子：顶面 top 点、正面 front 点，底面中心在原点 */
function die(s: number, face: string, pip: string, top: number, front: number, ry = 0) {
  const g = G(rbox(s, s, s, face, {}, s * 0.16))
  g.add(decal(paintTop(s * 0.84, s * 0.84, `int-pip-${top}-${face}-${pip}`, drawPips(top, face, pip), 0, s + 0.02, 0)))
  g.add(decal(paintPanel(s * 0.84, s * 0.84, `int-pip-${front}-${face}-${pip}`, drawPips(front, face, pip), { y: s * 0.08, z: s / 2 + 0.02 })))
  g.rotation.y = ry
  return g
}

/** 小棋子（圆锥身 + 球头），高约 2.6 */
function pawn(color: string, x: number, y: number, z: number, k = 1) {
  return P(G(cyl(0.45 * k, 0.85 * k, 1.8 * k, color, {}, 14), ball(0.6 * k, color, { y: 2 * k })), x, y, z)
}

/** 小房子（方块 + 四棱锥屋顶） */
function house(color: string, x: number, y: number, z: number, s = 1, ry = 0) {
  return P(G(rbox(1.2 * s, 0.9 * s, 1.2 * s, color, {}, 0.1 * s), cyl(0.01, 1.05 * s, 0.7 * s, shade(color, -0.15), { y: 0.9 * s, ry: PI / 4 }, 4)), x, y, z, 0, ry)
}

/** 桌游盒：盒盖有抽象图案（不写品牌名），底面中心在原点 */
function bgBox(w: number, h: number, d: number, c: string, seed: number) {
  const box = G(
    rbox(w, h, d, c, {}, Math.min(0.4, h * 0.1)),
    rbox(w + 0.1, Math.min(0.5, h * 0.12), d + 0.1, shade(c, -0.15), { y: h * 0.72 }, 0.15),
  )
  box.add(paintTop(w - 0.6, d - 0.6, `int-bgbox-${seed}-${c}-${Math.round(w)}x${Math.round(d)}`, (cv, W, H) => {
    const r = rng(seed)
    cv.fillStyle = c
    cv.fillRect(0, 0, W, H)
    cv.fillStyle = shade(c, 0.22)
    cv.beginPath()
    cv.arc(W * (0.45 + r() * 0.3), H * (0.45 + r() * 0.2), Math.min(W, H) * 0.3, 0, PI * 2)
    cv.fill()
    cv.fillStyle = shade(c, -0.25)
    for (let k = 0; k < 3; k++) cv.fillRect(W * (0.08 + k * 0.13), H * (0.6 - k * 0.1), W * 0.1, H * (0.32 + k * 0.1))
    cv.fillStyle = r() > 0.5 ? '#ffe08f' : '#ffffff'
    for (let k = 0; k < 4; k++) {
      cv.beginPath()
      cv.arc(W * r(), H * (0.3 + r() * 0.6), Math.min(W, H) * 0.04, 0, PI * 2)
      cv.fill()
    }
    cv.fillStyle = '#ffffff'
    cv.fillRect(W * 0.08, H * 0.07, W * 0.62, H * 0.15)
    cv.fillStyle = shade(c, -0.35)
    cv.fillRect(W * 0.12, H * 0.11, W * 0.42, H * 0.07)
  }, 0, h + 0.3, 0))
  return box
}

/** 桌游盒（单个，多种尺寸）[盒色] */
const bgBoxSingle = (w: number, h: number, d: number, seed: number) => (p: string[]) => bgBox(w, h, d, p[0], seed)

/** 一排竖插的桌游盒（侧面朝前） [色 1, 色 2, 色 3] */
function bgShelfRow(p: string[]) {
  const g = new THREE.Group()
  const specs: [number, number, number][] = [[7, 30, 30], [8, 30, 30], [6, 27, 27], [9, 30, 30], [5, 22, 22], [7.5, 30, 30], [6.5, 26, 26], [8, 30, 30]]
  const tw = specs.reduce((s, [t]) => s + t + 0.1, 0)
  let x = -tw / 2
  specs.forEach(([t, h, d], i) => {
    const c = shade(p[i % 3], ((i * 7) % 5) * 0.04 - 0.08)
    const b = G(rbox(t, h, d, c, {}, 0.3))
    b.add(paintPanel(t - 0.4, h - 0.6, `int-bgspine-${i}-${c}`, (cv, W, H) => {
      cv.fillStyle = c
      cv.fillRect(0, 0, W, H)
      cv.fillStyle = '#ffffff'
      cv.fillRect(W * 0.18, H * 0.08, W * 0.64, H * 0.45)
      cv.fillStyle = shade(c, -0.3)
      for (let k = 0; k < 3; k++) cv.fillRect(W * 0.3, H * (0.12 + k * 0.12), W * 0.4, H * 0.07)
      cv.fillStyle = shade(c, 0.25)
      cv.beginPath()
      cv.arc(W / 2, H * 0.75, W * 0.3, 0, PI * 2)
      cv.fill()
    }, { y: 0.3, z: d / 2 + 0.3 }))
    g.add(P(b, x + t / 2, 0, (30 - d) / 2))
    x += t + 0.1
  })
  return fit(g)
}

/** 六角地块版图（摆开在玩）：[海, 点缀, 骰子] */
function bgHex(p: string[]) {
  const [sea, acc, dieC] = p
  const g = new THREE.Group()
  const R = 4.1
  g.add(cyl(21, 21, 0.5, sea, { ry: PI / 6 }, 6))
  const terrain = ['#78c47a', '#4f9e5b', '#e8c55a', '#c8704a', '#a8a8a0', '#d8c890']
  const r = rng(3)
  const centers: V2[] = []
  for (let q = -2; q <= 2; q++)
    for (let rr = -2; rr <= 2; rr++) {
      if (Math.abs(q + rr) > 2) continue
      const x = R * Math.sqrt(3) * (q + rr / 2) * 1.02
      const z = R * 1.5 * rr * 1.02
      centers.push([x, z])
      const t = q === 0 && rr === 0 ? '#e8d8a0' : terrain[Math.floor(r() * terrain.length)]
      g.add(cyl(R, R, 0.6, t, { x, y: 0.5, z }, 6))
      if (q || rr) {
        g.add(puck(1.1, 0.25, IVORY, { x, y: 1.1, z }))
        g.add(noOutline(cyl(0.35, 0.35, 0.05, k2(r()), { x, y: 1.36, z }, 10)))
      }
    }
  function k2(v: number) {
    return v > 0.7 ? '#c8473a' : '#26262a'
  }
  // 小房子与道路（放在地块交界）
  const cols = [acc, '#3d6fb8', '#ffffff']
  for (let k = 0; k < 6; k++) {
    const [x, z] = centers[(k * 5 + 2) % centers.length]
    const a = (k * PI) / 3 + PI / 6
    const hx = x + Math.cos(a) * R
    const hz = z + Math.sin(a) * R
    g.add(house(cols[k % 3], hx, 1.1, hz, 1))
    const a2 = a + PI / 3
    const ex = x + Math.cos(a2) * R
    const ez = z + Math.sin(a2) * R
    const road = rbox(Math.hypot(ex - hx, ez - hz) - 1.4, 0.5, 0.6, cols[k % 3], {}, 0.1)
    g.add(P(G(road), (hx + ex) / 2, 1.1, (hz + ez) / 2, 0, -Math.atan2(ez - hz, ex - hx)))
  }
  g.add(P(die(1.6, dieC, '#26262a', 5, 2, 0.3), 22, 0, 10), P(die(1.6, dieC, '#26262a', 3, 6, -0.4), 24.5, 0, 11.5))
  for (let k = 0; k < 4; k++) g.add(P(cardStack(4.4, 6.6, 6 + k * 2, '#ffffff', terrain[k], `int-hexcard-${k}`), -26 + (k % 2) * 5.2, 0, -8 + Math.floor(k / 2) * 7.4))
  return fit(g)
}

/** 铁路地图版图：[版图底, 火车色 1, 火车色 2] */
function bgTrain(p: string[]) {
  const [land, t1, t2] = p
  const g = new THREE.Group()
  const BW = 50
  const BD = 34
  g.add(rbox(BW, 0.4, BD, '#ffffff', {}, 0.15))
  const cities: V2[] = [[-20, -12], [-8, -10], [6, -13], [19, -9], [-17, 2], [-3, 0], [12, 1], [21, 8], [-14, 12], [2, 11], [14, 13]]
  const routes: [number, number, string][] = [[0, 1, t1], [1, 2, '#ffffff'], [2, 3, t2], [0, 4, '#ffffff'], [1, 5, t1], [5, 6, t2], [6, 3, '#ffffff'], [4, 8, t2], [5, 9, '#ffffff'], [9, 10, t1], [6, 7, t1], [8, 9, '#ffffff']]
  const toPx = (x: number, z: number, W: number, H: number): V2 => [((x + BW / 2) / BW) * W, ((z + BD / 2) / BD) * H]
  g.add(decal(paintTop(BW - 0.2, BD - 0.2, `int-train-${land}-${t1}-${t2}`, (c, W, H) => {
    c.fillStyle = '#9ccbe8'
    c.fillRect(0, 0, W, H)
    c.fillStyle = land
    c.beginPath()
    c.ellipse(W * 0.5, H * 0.5, W * 0.47, H * 0.44, 0, 0, PI * 2)
    c.fill()
    c.fillStyle = shade(land, -0.08)
    c.beginPath()
    c.ellipse(W * 0.3, H * 0.4, W * 0.15, H * 0.12, 0.4, 0, PI * 2)
    c.fill()
    for (const [a, b, col] of routes) {
      const [x0, y0] = toPx(...cities[a], W, H)
      const [x1, y1] = toPx(...cities[b], W, H)
      const n = 4
      for (let k = 0; k < n; k++) {
        const f0 = (k + 0.1) / n
        const f1 = (k + 0.9) / n
        c.strokeStyle = '#555555'
        c.lineWidth = W * 0.016
        c.beginPath()
        c.moveTo(x0 + (x1 - x0) * f0, y0 + (y1 - y0) * f0)
        c.lineTo(x0 + (x1 - x0) * f1, y0 + (y1 - y0) * f1)
        c.stroke()
        c.strokeStyle = col === '#ffffff' ? '#e8e0c8' : col
        c.lineWidth = W * 0.011
        c.stroke()
      }
    }
    c.fillStyle = '#c8473a'
    for (const [x, z] of cities) {
      const [px, py] = toPx(x, z, W, H)
      c.beginPath()
      c.arc(px, py, W * 0.012, 0, PI * 2)
      c.fill()
    }
  }, 0, 0.42, 0)))
  // 已经占领的路线上摆小火车车厢
  const claimed: [number, number, string][] = [[0, 1, t1], [5, 6, t2], [9, 10, t1], [4, 8, t2]]
  for (const [a, b, col] of claimed) {
    const [x0, z0] = cities[a]
    const [x1, z1] = cities[b]
    const ang = -Math.atan2(z1 - z0, x1 - x0)
    const len = Math.hypot(x1 - x0, z1 - z0) / 4
    for (let k = 0; k < 4; k++) {
      const f = (k + 0.5) / 4
      g.add(P(rbox(len * 0.75, 0.9, 0.9, col, {}, 0.15), x0 + (x1 - x0) * f, 0.44, z0 + (z1 - z0) * f, 0, ang))
    }
  }
  // 牌堆 + 散落的车厢
  g.add(P(cardStack(5.6, 8.6, 14, '#ffffff', t2, 'int-traincards'), BW / 2 + 4, 0, -6))
  for (let k = 0; k < 4; k++) g.add(P(rbox(2, 0.9, 0.9, k % 2 ? t1 : t2, {}, 0.15), BW / 2 + 2.5 + (k % 2) * 3, 0, 4 + k * 1.6, 0, k * 0.5))
  return fit(g)
}

/** 卡牌面：彩色边框 + 中央图形 + 角标 */
function drawPlayCard(col: string, n: number): Draw {
  return (c, W, H) => {
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, W, H)
    c.fillStyle = col
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.ellipse(W / 2, H / 2, W * 0.3, H * 0.36, 0.5, 0, PI * 2)
    c.fill()
    c.fillStyle = col
    c.font = `bold ${Math.floor(H * 0.38)}px sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(n), W / 2, H * 0.53)
    c.fillStyle = '#ffffff'
    c.font = `bold ${Math.floor(H * 0.13)}px sans-serif`
    c.fillText(String(n), W * 0.2, H * 0.14)
  }
}

/** 扇形手牌（平放）：n 张，中心 (x, z)，朝 +z 的玩家 */
function fanHand(n: number, cols: string[], x: number, z: number, faceUp: boolean, back: string, seed: number, facing = 0) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.16
    const col = cols[(i + seed) % cols.length]
    const cd = faceUp ? card(5.7, 8.8, '#ffffff', `int-pc-${col}-${(i * 3 + seed) % 10}`, drawPlayCard(col, (i * 3 + seed) % 10)) : card(5.7, 8.8, '#ffffff', `int-pcback-${back}`, (c, W, H) => {
      c.fillStyle = '#26262a'
      c.fillRect(0, 0, W, H)
      c.fillStyle = back
      c.beginPath()
      c.ellipse(W / 2, H / 2, W * 0.32, H * 0.38, 0.5, 0, PI * 2)
      c.fill()
    })
    const pivot = G(P(cd, 0, 0, -5))
    g.add(P(pivot, 0, i * 0.11, 0, 0, a))
  }
  g.position.set(x, 0, z)
  g.rotation.y = facing
  return g
}

const UNO_COLS = ['#d64545', '#f0c030', '#3fa05a', '#3d7fd0']

/** 卡牌游戏摊开：牌堆 + 弃牌堆 + 两手扇形手牌 [牌背, 桌垫, —] */
function cardGame(p: string[]) {
  const [back, mat] = p
  const g = new THREE.Group()
  g.add(rbox(44, 0.3, 32, mat, {}, 0.15))
  const y = 0.3
  g.add(P(cardStack(5.7, 8.8, 30, '#ffffff', back, `int-cg-deck-${back}`), -4, y, -2))
  const r = rng(8)
  for (let k = 0; k < 6; k++) {
    const col = UNO_COLS[Math.floor(r() * 4)]
    const n = Math.floor(r() * 10)
    g.add(P(card(5.7, 8.8, '#ffffff', `int-pc-${col}-${n}`, drawPlayCard(col, n)), 4 + (r() - 0.5) * 1.5, y + k * 0.11, -2 + (r() - 0.5) * 1.5, 0, (r() - 0.5) * 1.2))
  }
  const hand = fanHand(7, UNO_COLS, 0, 12, true, back, 1)
  hand.position.y = y
  g.add(hand)
  const opp = fanHand(6, UNO_COLS, 0, -14, false, back, 2, PI)
  opp.position.y = y
  g.add(opp)
  return fit(g)
}

/** UNO 风卡牌（一副 + 几张摊开）[牌背, —, —] */
function unoCards(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(P(cardStack(5.7, 8.8, 40, '#ffffff', back, `int-uno-deck-${back}`), -7, 0, 0))
  g.add(rbox(6.4, 2.4, 9.5, back, { x: -15, z: 0 }, 0.4))
  const r = rng(21)
  for (let k = 0; k < 5; k++) {
    const col = UNO_COLS[k % 4]
    const n = Math.floor(r() * 10)
    g.add(P(card(5.7, 8.8, '#ffffff', `int-pc-${col}-${n}`, drawPlayCard(col, n)), 2 + k * 3.2, k * 0.11, (k % 2) * 1.5, 0, (k - 2) * 0.15))
  }
  return fit(g)
}

/** 骰子游戏：毛毡骰盘 + 骰盅 + 五颗骰子 [骰盅, 毡, 骰子] */
function diceGame(p: string[]) {
  const [cupC, felt, dieC] = p
  const g = new THREE.Group()
  g.add(cup(13, 13, 3, 1.2, shade(cupC, -0.1)))
  g.add(cyl(11.9, 11.9, 0.4, felt, { y: 1 }, 32))
  const pos: [number, number, number, number, number][] = [[-4, -3, 5, 2, 0.3], [2, -5, 3, 1, -0.5], [5, 1, 6, 4, 0.9], [-1, 3, 1, 5, 0.1], [-6, 4, 4, 3, -0.8]]
  for (const [x, z, t, f, ry] of pos) g.add(P(die(1.8, dieC, '#26262a', t, f, ry), x, 1.4, z))
  // 骰盅倒扣在旁边
  g.add(P(G(cup(4.4, 3.8, 10, 0.5, cupC), torus(4.3, 0.35, shade(cupC, 0.2), { y: 9.8, rx: PI / 2 })), 19, 10.2, 0, PI))
  return fit(g)
}

/** 大富翁式环形棋盘：[版图底, 地产色, 点缀] */
function bgLoop(p: string[]) {
  const [base, prop, acc] = p
  const g = new THREE.Group()
  const S0 = 50
  g.add(rbox(S0, 0.5, S0, '#ffffff', {}, 0.2))
  const props = [prop, '#3d7fd0', '#e2702f', '#c8473a', '#f0c030', '#3fa05a', '#8a4fb0', '#58c0e0']
  g.add(decal(paintTop(S0 - 0.2, S0 - 0.2, `int-loop-${base}-${prop}`, (c, W, H) => {
    c.fillStyle = base
    c.fillRect(0, 0, W, H)
    const n = 11
    const cw = W / n
    c.fillStyle = shade(base, 0.08)
    c.fillRect(cw, cw, W - cw * 2, H - cw * 2)
    c.strokeStyle = '#26262a'
    c.lineWidth = Math.max(1, W * 0.003)
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < n; i++) {
        let x = 0
        let y = 0
        if (side === 0) [x, y] = [i * cw, H - cw]
        else if (side === 1) [x, y] = [0, H - cw - i * cw]
        else if (side === 2) [x, y] = [i * cw, 0]
        else [x, y] = [W - cw, i * cw]
        c.strokeRect(x, y, cw, cw)
        if (i > 0 && i < n - 1 && i % 3 !== 0) {
          c.fillStyle = props[(side * 2 + Math.floor(i / 3)) % props.length]
          const bh = cw * 0.28
          if (side === 0) c.fillRect(x, y, cw, bh)
          else if (side === 2) c.fillRect(x, y + cw - bh, cw, bh)
          else if (side === 1) c.fillRect(x + cw - bh, y, bh, cw)
          else c.fillRect(x, y, bh, cw)
        }
      }
    }
    c.fillStyle = acc
    c.save()
    c.translate(W / 2, H / 2)
    c.rotate(-0.6)
    c.fillRect(-W * 0.28, -H * 0.07, W * 0.56, H * 0.14)
    c.fillStyle = '#ffffff'
    c.fillRect(-W * 0.24, -H * 0.03, W * 0.48, H * 0.06)
    c.restore()
  }, 0, 0.52, 0)))
  const cw = S0 / 11
  const edge = S0 / 2 - cw / 2
  for (let k = 0; k < 5; k++) g.add(house('#3fa05a', -edge + cw * (2 + k * 0.6), 0.52, edge - cw * 0.15, 0.7))
  g.add(P(rbox(1.6, 1, 1, '#c8473a', {}, 0.1), edge + cw * 0.15, 0.52, -edge + cw * 4))
  const pc = [acc, '#3d7fd0', '#ffffff', '#26262a']
  pc.forEach((c, i) => g.add(pawn(c, -edge + (i % 2) * 1.6, 0.52, edge - (i > 1 ? 1.6 : 0), 0.8)))
  g.add(P(die(1.5, '#ffffff', '#26262a', 4, 2, 0.4), 4, 0.52, 3), P(die(1.5, '#ffffff', '#26262a', 6, 3, -0.2), 6.5, 0.52, 4.5))
  const money = ['#f4f4f2', '#ffd6e0', '#ffe08f', '#a6e3cc', '#a8d4f4', '#e0c08a']
  money.forEach((c, i) => g.add(rbox(10, 0.3 + (i % 3) * 0.2, 5, c, { x: S0 / 2 + 7, z: -16 + i * 6 }, 0.05)))
  return fit(g)
}

/** 推理桌游：房间版图 + 角色棋子 + 线索卡 [版图色, 墙色, 点缀] */
function bgMystery(p: string[]) {
  const [floor, wall, acc] = p
  const g = new THREE.Group()
  const S0 = 48
  g.add(rbox(S0, 0.5, S0, '#ffffff', {}, 0.2))
  g.add(decal(paintTop(S0 - 0.2, S0 - 0.2, `int-mystery-${floor}-${wall}`, (c, W, H) => {
    c.fillStyle = shade(floor, 0.15)
    c.fillRect(0, 0, W, H)
    c.strokeStyle = shade(floor, -0.05)
    c.lineWidth = 1
    const n = 24
    for (let i = 0; i <= n; i++) {
      c.beginPath()
      c.moveTo((i * W) / n, 0)
      c.lineTo((i * W) / n, H)
      c.moveTo(0, (i * H) / n)
      c.lineTo(W, (i * H) / n)
      c.stroke()
    }
    const rooms: [number, number, number, number][] = [[0, 0, 7, 6], [9, 0, 7, 7], [18, 0, 6, 6], [0, 9, 6, 6], [18, 9, 6, 7], [0, 18, 7, 6], [9, 18, 6, 6], [17, 18, 7, 6]]
    rooms.forEach(([x, y, w, h], i) => {
      c.fillStyle = i % 2 ? floor : shade(floor, -0.08)
      c.fillRect((x * W) / n, (y * H) / n, (w * W) / n, (h * H) / n)
      c.strokeStyle = wall
      c.lineWidth = W * 0.008
      c.strokeRect((x * W) / n, (y * H) / n, (w * W) / n, (h * H) / n)
    })
    c.fillStyle = wall
    c.fillRect((9 * W) / n, (9 * H) / n, (6 * W) / n, (6 * H) / n)
    c.fillStyle = acc
    c.fillRect((10 * W) / n, (11 * H) / n, (4 * W) / n, (2 * H) / n)
  }, 0, 0.52, 0)))
  const chars = ['#c8473a', '#f0c030', '#ffffff', '#3fa05a', '#3d7fd0', '#8a4fb0']
  const spots: V2[] = [[-14, 6], [-4, -6], [6, 15], [15, -14], [-16, -16], [3, 4]]
  chars.forEach((c, i) => g.add(pawn(c, spots[i][0], 0.52, spots[i][1], 1)))
  g.add(rbox(8, 0.6, 5, acc, { y: 0.52 }, 0.1))
  g.add(P(cardStack(4.4, 6.6, 10, '#ffffff', wall, 'int-mystery-cards'), S0 / 2 + 4, 0, -10))
  g.add(P(card(9, 13, PAPER, 'int-mystery-note', (c, W, H) => {
    c.fillStyle = PAPER
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#9a9a9a'
    for (let k = 0; k < 14; k++) c.fillRect(W * 0.08, H * (0.08 + k * 0.064), W * 0.84, 1)
    c.fillStyle = '#c8473a'
    for (let k = 0; k < 6; k++) c.fillRect(W * 0.75, H * (0.1 + k * 0.13), W * 0.08, H * 0.03)
  }), S0 / 2 + 6, 0, 6, 0, -0.2))
  g.add(taperRod3([S0 / 2 + 3, 0.4, 10], [S0 / 2 + 10, 0.4, 7], 0.35, 0.35, DARK, 6))
  return fit(g)
}

/** 国际象棋（摆好的开局）：[棋盘框, 白子, 黑子] */
function chessOpening(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  g.add(rbox(36, 2, 36, frame, {}, 0.5))
  g.add(paintTop(32, 32, `int-chess-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
      }
  }, 0, 2.3, 0))
  const order: ('r' | 'n' | 'b' | 'q' | 'k')[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let f = 0; f < 8; f++) {
    const x = -14 + f * 4
    g.add(P(chessPiece(order[f], white, PI), x, 2.35, 14), P(chessPiece('p', white, PI), x, 2.35, 10))
    g.add(P(chessPiece(order[f], black, 0), x, 2.35, -14), P(chessPiece('p', black, 0), x, 2.35, -10))
  }
  return fit(g)
}

/** 中国象棋：[棋盘木, 红方, 黑方] */
function xiangqi(p: string[]) {
  const [board, red, black] = p
  const g = new THREE.Group()
  const BW = 40
  const BD = 44
  g.add(rbox(BW, 1.6, BD, board, {}, 0.4))
  const gx = 4.2
  const gz = 4.3
  const x0 = -gx * 4
  const z0 = -gz * 4.5
  g.add(paintTop(BW - 1, BD - 1, `int-xq-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    const px = (i: number) => ((x0 + i * gx + (BW - 1) / 2) / (BW - 1)) * W
    const pz = (j: number) => ((z0 + j * gz + (BD - 1) / 2) / (BD - 1)) * H
    c.strokeStyle = '#3a2a20'
    c.lineWidth = Math.max(1, W * 0.004)
    for (let j = 0; j < 10; j++) {
      c.beginPath()
      c.moveTo(px(0), pz(j))
      c.lineTo(px(8), pz(j))
      c.stroke()
    }
    for (let i = 0; i < 9; i++) {
      c.beginPath()
      if (i === 0 || i === 8) {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(9))
      } else {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(4))
        c.moveTo(px(i), pz(5))
        c.lineTo(px(i), pz(9))
      }
      c.stroke()
    }
    for (const j of [0, 7]) {
      c.beginPath()
      c.moveTo(px(3), pz(j))
      c.lineTo(px(5), pz(j + 2))
      c.moveTo(px(5), pz(j))
      c.lineTo(px(3), pz(j + 2))
      c.stroke()
    }
    c.lineWidth = Math.max(1, W * 0.007)
    c.strokeRect(px(0) - W * 0.012, pz(0) - W * 0.012, px(8) - px(0) + W * 0.024, pz(9) - pz(0) + W * 0.024)
  }, 0, 1.9, 0))
  const piece = (i: number, j: number, side: string) => {
    const x = x0 + i * gx
    const z = z0 + j * gz
    g.add(puck(1.8, 1, '#f2dcb0', { x, y: 1.6, z }))
    g.add(noOutline(torus(1.35, 0.1, side, { x, y: 2.62, z, rx: PI / 2 })))
    g.add(noOutline(rbox(1.1, 0.06, 0.25, side, { x, y: 2.6, z }, 0.03)), noOutline(rbox(0.25, 0.06, 1.1, side, { x, y: 2.6, z }, 0.03)))
  }
  for (const [side, back, cannon, pawnRow] of [[red, 9, 7, 6], [black, 0, 2, 3]] as [string, number, number, number][]) {
    for (let i = 0; i < 9; i++) piece(i, back, side)
    piece(1, cannon, side)
    piece(7, cannon, side)
    for (const i of [0, 2, 4, 6, 8]) piece(i, pawnRow, side)
  }
  return fit(g)
}

/** 黑白棋（中局）：[棋盘, 黑子, 白子] */
function reversi(p: string[]) {
  const [board, dark, light] = p
  const g = new THREE.Group()
  g.add(rbox(34, 1.6, 34, shade(board, -0.15), {}, 0.4))
  g.add(paintTop(32, 32, `int-reversi-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#1e2a1e'
    const lw = Math.max(1, W * 0.006)
    for (let i = 0; i <= 8; i++) {
      c.fillRect((i / 8) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 8) * (H - lw), W, lw)
    }
  }, 0, 1.9, 0))
  const r = rng(6)
  for (let i = 1; i < 7; i++)
    for (let j = 1; j < 7; j++) {
      if (r() < 0.45) continue
      const x = -14 + i * 4
      const z = -14 + j * 4
      const top = r() < 0.5 ? dark : light
      g.add(cyl(1.6, 1.6, 0.2, top === dark ? light : dark, { x, y: 1.6, z }, 20), cyl(1.6, 1.6, 0.2, top, { x, y: 1.8, z }, 20))
    }
  return fit(g)
}

/** 跳棋（六角星盘 + 弹珠）：[盘色, 星色, 点缀] */
function chineseCheckers(p: string[]) {
  const [plate, star, acc] = p
  const g = new THREE.Group()
  g.add(cyl(21.6, 21.6, 1.6, plate, {}, 48))
  const sp = 1.9
  const holes: V2[] = []
  const tri = (q: number, r: number) => [sp * (q + r / 2), sp * r * (Math.sqrt(3) / 2)] as V2
  for (let q = -8; q <= 8; q++)
    for (let r = -8; r <= 8; r++) {
      const s = -q - r
      const inA = q >= -4 && r >= -4 && s >= -4
      const inB = q <= 4 && r <= 4 && s <= 4
      if (inA || inB) holes.push(tri(q, r))
    }
  g.add(paintTop(30, 30, `int-cc-${plate}-${star}`, (c, W, H) => {
    c.fillStyle = plate
    c.fillRect(0, 0, W, H)
    c.fillStyle = star
    const k = W / 30
    const pts: V2[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + PI / 2
      const rr = i % 2 ? 7.6 : 14.4
      pts.push([W / 2 + Math.cos(a) * rr * k, H / 2 + Math.sin(a) * rr * k])
    }
    c.beginPath()
    c.moveTo(...pts[0])
    for (const pt of pts) c.lineTo(...pt)
    c.fill()
    c.fillStyle = shade(star, -0.3)
    for (const [x, z] of holes) {
      c.beginPath()
      c.arc(W / 2 + x * k, H / 2 + z * k, k * 0.45, 0, PI * 2)
      c.fill()
    }
  }, 0, 1.9, 0))
  const cols = [acc, '#3d7fd0', '#f0c030', '#3fa05a', '#ffffff', '#26262a']
  holes.forEach(([x, z]) => {
    const d = Math.hypot(x, z)
    if (d < sp * 4.6) return
    const a = Math.atan2(z, x)
    const sector = Math.round(((a + PI * 2) % (PI * 2)) / (PI / 3) - 0.5 + 6) % 6
    if (sector % 2 === 1 && sector !== 3) return
    g.add(ball(0.75, cols[sector], { x, y: 1.6 + 0.55, z }))
  })
  return fit(g)
}

/** 双陆棋（打开的棋盒）：[框, 三角 1, 棋子 1] */
function backgammon(p: string[]) {
  const [frame, tri, chk] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(tray(24, 2.4, 38, 1, frame, { x: s * 12.2 }))
  g.add(cylZ(0.5, 36, METAL, 0, 0.6, 0, 8))
  for (const s of [-1, 1])
    g.add(paintTop(21.8, 35.8, `int-bgm-${frame}-${tri}`, (c, W, H) => {
      c.fillStyle = shade(frame, 0.35)
      c.fillRect(0, 0, W, H)
      for (let i = 0; i < 6; i++) {
        for (const top of [true, false]) {
          c.fillStyle = (i + (top ? 0 : 1)) % 2 ? tri : '#f2e6cc'
          const x = (i / 6) * W
          c.beginPath()
          if (top) {
            c.moveTo(x, 0)
            c.lineTo(x + W / 6, 0)
            c.lineTo(x + W / 12, H * 0.42)
          } else {
            c.moveTo(x, H)
            c.lineTo(x + W / 6, H)
            c.lineTo(x + W / 12, H * 0.58)
          }
          c.fill()
        }
      }
    }, s * 12.2, 1.3, 0))
  const pw = 21.8 / 6
  const pt = (side: number, i: number, top: boolean, n: number, col: string) => {
    const x = side * 12.2 - 10.9 + pw * (i + 0.5)
    for (let k = 0; k < n; k++) g.add(cyl(1.5, 1.5, 0.6, col, { x, y: 1, z: (top ? -1 : 1) * (17.9 - 1.5 - k * 3) }, 18))
  }
  const other = '#f4f4f2'
  pt(-1, 0, true, 5, chk)
  pt(-1, 4, false, 3, other)
  pt(1, 0, false, 5, other)
  pt(1, 5, true, 2, chk)
  pt(-1, 0, false, 4, other)
  pt(1, 3, true, 3, chk)
  g.add(P(die(1.4, '#ffffff', '#26262a', 6, 3, 0.4), 5, 1, 0), P(die(1.4, '#ffffff', '#26262a', 2, 1, -0.3), 8, 1, 1.5))
  g.add(P(die(2, '#f4ead2', '#26262a', 2, 4, 0.2), -6, 1, 0))
  return fit(g)
}

/** 花札（散开的小牌）：[牌背, 主色, 点缀] */
function hanafuda(p: string[]) {
  const [back, a, acc] = p
  const g = new THREE.Group()
  const W0 = 3.3
  const D0 = 5.4
  const cardDraw = (k: number): Draw => (c, W, H) => {
    c.fillStyle = '#26262a'
    c.fillRect(0, 0, W, H)
    const sky = [a, '#f2e6cc', '#3d4a6a', '#e8a0a0'][k % 4]
    c.fillStyle = sky
    c.fillRect(W * 0.07, H * 0.05, W * 0.86, H * 0.9)
    if (k % 3 === 0) {
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.arc(W / 2, H * 0.35, W * 0.28, 0, PI * 2)
      c.fill()
    }
    c.fillStyle = k % 2 ? '#3a6a3a' : acc
    c.beginPath()
    c.moveTo(W * 0.07, H * 0.95)
    c.quadraticCurveTo(W * 0.5, H * (0.45 + (k % 3) * 0.08), W * 0.93, H * 0.95)
    c.fill()
    c.fillStyle = '#c8473a'
    for (let j = 0; j < 3; j++) {
      c.beginPath()
      c.arc(W * (0.3 + j * 0.2), H * (0.62 - (j % 2) * 0.1), W * 0.08, 0, PI * 2)
      c.fill()
    }
  }
  const backDraw: Draw = (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
  }
  g.add(P(cardStack(W0, D0, 20, '#26262a', back, `int-hana-back-${back}`, backDraw), -8, 0, -4))
  const r = rng(13)
  for (let k = 0; k < 8; k++) g.add(P(card(W0, D0, '#26262a', `int-hana-${k}-${a}-${acc}`, cardDraw(k), 0.08), -2 + (k % 4) * 4, 0, -5 + Math.floor(k / 4) * 6.2, 0, (r() - 0.5) * 0.2))
  for (let k = 0; k < 5; k++) g.add(P(card(W0, D0, '#26262a', `int-hana-${k + 8}-${a}-${acc}`, cardDraw(k + 8), 0.08), -3 + k * 1.6, k * 0.09, 9, 0, (k - 2) * 0.18))
  return fit(g)
}

/** 百人一首 / かるた（散在榻榻米上的牌）：[榻榻米, 牌边, 字色] */
function karuta(p: string[]) {
  const [tatami, edge, ink] = p
  const g = new THREE.Group()
  g.add(rbox(88, 1, 60, tatami, {}, 0.3))
  g.add(rbox(88, 1.02, 3, J.sumi, { z: -28.5 }, 0.3), rbox(88, 1.02, 3, J.sumi, { z: 28.5 }, 0.3))
  const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
  const r = rng(17)
  const cardDraw = (seed: number): Draw => (c, W, H) => {
    const rr = rng(seed)
    c.fillStyle = edge
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#fbf6e8'
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = ink
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${Math.floor(W * 0.24)}px "Yu Mincho", "Hiragino Mincho ProN", serif`
    for (let col = 0; col < 3; col++)
      for (let row = 0; row < 5; row++) {
        if (col === 2 && row > 2) continue
        c.fillText(kana[Math.floor(rr() * kana.length)], W * (0.75 - col * 0.25), H * (0.16 + row * 0.17))
      }
  }
  const place = (x: number, z: number, ry: number, seed: number) => g.add(P(card(5.3, 7.4, edge, `int-karuta-${seed}-${edge}`, cardDraw(seed), 0.12), x, 1, z, 0, ry))
  let seed = 0
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < 9; k++) {
        if (r() < 0.25) continue
        const x = -36 + k * 8.4 + (r() - 0.5) * 1.2
        const z = side * (7 + row * 9) + (r() - 0.5) * 1
        place(x, z, side > 0 ? 0 : PI + (r() - 0.5) * 0.1, seed++)
      }
  place(4, 0, 0.6, 99)
  return fit(g)
}

/** 叠叠乐：stacked = 叠好的塔；否则倒塌散落 [木色, —, —] */
const jenga = (stacked: boolean) => (p: string[]) => {
  const wood = p[0]
  const g = new THREE.Group()
  const L = 7.5
  const T = 1.5
  const Wb = 2.5
  const r = rng(stacked ? 1 : 2)
  const col = () => shade(wood, (r() - 0.5) * 0.1)
  if (stacked) {
    for (let lv = 0; lv < 18; lv++) {
      for (let k = 0; k < 3; k++) {
        if (lv > 3 && lv < 15 && r() < 0.12 && k !== 1) continue
        const off = (k - 1) * Wb
        const pull = lv === 9 && k === 1 ? 2.2 : 0
        const b = lv % 2 ? rbox(L, T, Wb - 0.05, col(), { x: pull, y: lv * T, z: off }, 0.15) : rbox(Wb - 0.05, T, L, col(), { x: off, y: lv * T, z: pull }, 0.15)
        g.add(b)
      }
    }
    g.add(rbox(L, T, Wb - 0.05, col(), { x: 6, y: 0, z: 6 }, 0.15))
  } else {
    // 剩下的半截塔 + 散落的木块
    for (let lv = 0; lv < 5; lv++) for (let k = 0; k < 3; k++) g.add(lv % 2 ? rbox(L, T, Wb - 0.05, col(), { y: lv * T, z: (k - 1) * Wb }, 0.15) : rbox(Wb - 0.05, T, L, col(), { x: (k - 1) * Wb, y: lv * T }, 0.15))
    const rings: [number, number][] = [[10.5, 10], [19, 14]]
    for (const [rad, n] of rings)
      for (let k = 0; k < n; k++) {
        if (r() < 0.15) continue
        const a = (k / n) * PI * 2 + (r() - 0.5) * 0.15
        const rr = rad + (r() - 0.5) * 1.5
        g.add(P(rbox(L, T, Wb - 0.05, col(), {}, 0.15), Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.85, 0, -a + (r() - 0.5) * 0.3))
      }
  }
  return fit(g)
}

/** 拼图（拼到一半）：底板 + 已拼部分 + 散落拼块 + 盒盖 [底板, 天色, 山色] */
function jigsaw(p: string[]) {
  const [base, sky, hill] = p
  const g = new THREE.Group()
  g.add(rbox(54, 0.4, 40, base, {}, 0.15))
  const pic = paintLandscape(sky, hill, '#ffd27a')
  g.add(rbox(50, 0.25, 36, '#d8d0c0', { y: 0.4 }, 0.05))
  g.add(decal(paintTop(50, 36, `int-jigsaw-${sky}-${hill}`, (c, W, H) => {
    pic(c, W, H)
    // 还没拼的区域
    c.fillStyle = '#d8d0c0'
    c.fillRect(W * 0.55, H * 0.4, W * 0.45, H * 0.6)
    c.fillRect(W * 0.3, H * 0.65, W * 0.25, H * 0.35)
    c.strokeStyle = 'rgba(0,0,0,0.18)'
    c.lineWidth = 1
    for (let i = 1; i < 20; i++) {
      c.beginPath()
      c.moveTo((i * W) / 20, 0)
      c.lineTo((i * W) / 20, H)
      c.stroke()
    }
    for (let j = 1; j < 14; j++) {
      c.beginPath()
      c.moveTo(0, (j * H) / 14)
      c.lineTo(W, (j * H) / 14)
      c.stroke()
    }
  }, 0, 0.67, 0)))
  const r = rng(31)
  const cols = [sky, hill, shade(hill, 0.18), '#ffffff', shade(sky, -0.1)]
  for (let k = 0; k < 22; k++) {
    const x = 6 + r() * 18
    const z = 2 + r() * 14
    const c = cols[Math.floor(r() * cols.length)]
    const pc = G(rbox(2.5, 0.25, 2.5, c, {}, 0.05), puck(0.55, 0.25, c, { x: 1.4 }), puck(0.55, 0.25, c, { z: 1.4 }))
    g.add(P(pc, x, 0.65, z, 0, r() * PI * 2))
  }
  return fit(g)
}

/** 七巧板（木盘里拼好的正方形 + 两块拿出来） [盘, 色 1, 色 2] */
function tangram(p: string[]) {
  const [tray0, a, b] = p
  const g = new THREE.Group()
  g.add(tray(18, 1.4, 18, 0.8, tray0))
  const S0 = 16
  const h = S0 / 2
  const pieces: [V2[], string][] = [
    [[[-h, -h], [h, -h], [0, 0]], a],
    [[[-h, -h], [0, 0], [-h, h]], b],
    [[[h, -h], [h, 0], [h / 2, -h / 2]], shade(a, 0.2)],
    [[[0, 0], [h / 2, -h / 2], [h, 0], [h / 2, h / 2]], C.lemon],
    [[[0, 0], [h / 2, h / 2], [0, h], [-h / 2, h / 2]], C.mint],
    [[[-h, h], [-h / 2, h / 2], [0, h]], shade(b, 0.2)],
    [[[h, 0], [h, h], [0, h], [h / 2, h / 2]], C.pink],
  ]
  pieces.forEach(([pts, c], i) => {
    const inset = pts.map(([x, z]): V2 => {
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length
      const cz = pts.reduce((s, q) => s + q[1], 0) / pts.length
      return [cx + (x - cx) * 0.94, cz + (z - cz) * 0.94]
    })
    const m = flat(inset.map(([x, z]): V2 => [x, z]), 0.8, c, false, 0.15)
    const lay = P(m, 0, 0.8 + 0.4, 0, PI / 2)
    if (i === 6) g.add(P(G(lay), 13.5, -0.8, 5, 0, 0.6))
    else if (i === 3) g.add(P(G(lay), 12.5, -0.8, -5, 0, -0.4))
    else g.add(lay)
  })
  return fit(g)
}

/** 鲁班锁（六根榫木互锁）+ 拆下的一根 [木色] */
function burrPuzzle(p: string[]) {
  const wood = p[0]
  const g = new THREE.Group()
  const L = 8
  const s = 1.6
  const o = s / 2
  const cy = L / 2
  const c = (k: number) => shade(wood, k * 0.05 - 0.05)
  for (const k of [-1, 1]) {
    g.add(rbox(L, s, s, c(0), { y: cy - o, z: k * o }, 0.12))
    g.add(rbox(s, L, s, c(1), { x: k * o, y: 0 }, 0.12))
    g.add(rbox(s, s, L, c(2), { x: 0, y: cy - o + k * o }, 0.12))
  }
  g.add(rbox(4, 0.6, 4, shade(wood, -0.2), { x: 9 }, 0.2))
  g.add(P(rbox(L, s, s, c(1), {}, 0.12), 10, 0, 4, 0, 0.4))
  return fit(g)
}

// =====================================================================
// 素材表
// =====================================================================

const PIANO_PALS: PalFlat[] = [
  ['modern', '#26262a', '#fbfaf6', GOLD],
  ['nordic', N.white, '#fbfaf6', N.oak],
  ['retro', R.caramel, IVORY, BRASS],
  ['industrial', I.walnut, IVORY, I.steel],
  ['cute', C.sakura, '#fffaf4', C.lemon],
]

const MUSIC: AssetDef[] = [
  def('int-piano-upright', '立式钢琴', 'music', [150, 62, 125], PIANO_PALS, uprightPiano, { surface: 125, surfaceShape: [[[-75, -31], [75, -31], [75, 4.5], [-75, 4.5]]] }),
  def('int-piano-grand', '三角钢琴', 'music', [151.5, 164.5, 159], PIANO_PALS.slice(0, 4), F(grandPiano)),
  def('int-digital-piano', '电钢琴（带琴凳）', 'music', [136, 80, 95], [
    ['modern', '#2f3035', '#fbfaf6', '#3d3f44'],
    ['nordic', N.white, '#fbfaf6', N.sage],
    ['nordic', N.oak, '#fbfaf6', N.linen],
    ['cute', C.white, '#fffaf4', C.pink],
    ['industrial', I.walnut, IVORY, I.leather],
  ], digitalPiano),
  def('int-drum-kit', '架子鼓', 'music', [155, 122.5, 116.5], [
    ['retro', R.red, IVORY, METAL],
    ['modern', '#26262a', '#f4f4f2', METAL],
    ['cute', C.sky, '#fffaf4', METAL],
    ['retro', R.teal, IVORY, METAL],
    ['industrial', I.walnut, IVORY, I.steel],
  ], F(drumKit)),
  def('int-e-drum', '电子鼓', 'music', [118, 97, 116.5], [
    ['modern', DARK, '#55575d', '#5ad1ff'],
    ['modern', M.silver, '#55575d', '#ff6a8a'],
    ['cute', C.white, '#6a6d74', C.pink],
    ['industrial', I.iron, '#4a4a4c', I.rust],
  ], F(eDrum)),
  def('int-violin-case', '小提琴', 'music', [78, 33.5, 31.5], [
    ['modern', '#2f3035', '#8a3a4a', '#b0652e'],
    ['retro', R.caramel, R.teal, '#b0652e'],
    ['cute', C.sky, C.sakura, '#c07a3e'],
    ['nordic', N.white, N.blue, '#c07a3e'],
  ], F(violinCase), { ...PROP, family: 'int-violin', form: 'open' }),
  def('int-violin-stand', '小提琴', 'music', [23, 23, 66], [
    ['retro', DARK, '#b0652e', '#2a2220'],
    ['nordic', N.oak, '#c07a3e', '#2a2220'],
    ['modern', M.silver, '#9a5428', '#1f1f22'],
    ['japanese', J.dark, '#b0652e', J.sumi],
  ], F(violinStand), { ...PROP, family: 'int-violin', form: 'standing' }),
  def('int-cello', '大提琴（支架）', 'music', [50, 34.5, 133.5], [
    ['retro', '#b0652e', DARK, '#2a2220'],
    ['nordic', '#c07a3e', N.oak, '#2a2220'],
    ['modern', '#9a5428', M.char, '#1f1f22'],
    ['japanese', '#a8602e', J.dark, J.sumi],
  ], F(celloStand)),
  def('int-e-bass', '电贝斯（支架）', 'music', [34.5, 46.5, 127], [
    ['modern', '#26262a', '#f4f4f2', '#d9b98c'],
    ['retro', R.orange, IVORY, '#d9b98c'],
    ['cute', C.mint, C.white, '#ead7b8'],
    ['industrial', '#3a5a3c', '#2b2b2b', I.walnut],
    ['retro', '#e0b07a', '#2b2b2b', '#d9b98c'],
  ], F(eGuitarStand(true))),
  def('int-e-guitar-stand', '电吉他', 'music', [33.5, 43.5, 109.5], [
    ['retro', R.red, C.white, '#d9b98c'],
    ['cute', C.pink, C.white, '#ead7b8'],
    ['modern', '#26262a', '#26262a', '#d9b98c'],
    ['retro', R.teal, IVORY, '#d9b98c'],
    ['nordic', N.blue, N.white, N.oakL],
  ], F(eGuitarStand(false)), { family: 'int-e-guitar', sizeLabel: '支架' }),
  def('int-e-guitar-wall', '电吉他', 'music', [32, 9, 100.5], [
    ['retro', R.red, C.white, '#d9b98c'],
    ['cute', C.pink, C.white, '#ead7b8'],
    ['modern', '#26262a', '#26262a', '#d9b98c'],
    ['retro', R.teal, IVORY, '#d9b98c'],
    ['nordic', N.blue, N.white, N.oakL],
  ], eGuitarWall, { family: 'int-e-guitar', sizeLabel: '壁挂', mount: E_GUITAR_MOUNT }),
  def('int-guitar-amp', '吉他音箱', 'music', [50, 27.5, 43.5], [
    ['modern', '#26262a', '#4a4b50', '#c3c7cc'],
    ['retro', R.cream, '#a8683a', R.caramel],
    ['industrial', I.iron, '#6b5a48', I.steel],
    ['cute', C.mint, C.cream, C.white],
  ], F(guitarAmp)),
  def('int-sax-stand', '萨克斯（支架）', 'music', [34.5, 23.5, 78.5], [
    ['retro', BRASS, DARK, '#f4ead2'],
    ['modern', '#c3c7cc', DARK, '#f4f4f2'],
    ['industrial', '#8a6a3a', I.iron, '#e8dcc0'],
    ['cute', '#f0c868', C.white, '#fffaf4'],
  ], saxStand),
  def('int-trumpet', '小号', 'music', [50, 12, 15.2], [
    ['retro', BRASS, '#f4ead2', METAL],
    ['modern', '#c3c7cc', '#f4f4f2', '#9a9da3'],
    ['cute', '#f0c868', C.pink, METAL],
  ], trumpet, PROP),
  def('int-flute', '长笛（琴盒）', 'music', [40, 12, 4.5], [
    ['modern', '#2f3035', '#3d5a80', '#dfe3e8'],
    ['retro', R.caramel, R.red, '#e3d6b8'],
    ['cute', C.white, C.sakura, '#dfe3e8'],
  ], fluteCase, PROP),
  def('int-clarinet', '单簧管（支架）', 'music', [10.5, 11.9, 67], [
    ['modern', '#2a2a2e', '#d5d9de', DARK],
    ['retro', '#3a2a22', BRASS, '#3a2a22'],
    ['nordic', '#2a2a2e', '#d5d9de', N.oak],
  ], F(clarinetStand), PROP),
  def('int-harmonica', '口琴', 'music', [12.8, 7.9, 2.4], [
    ['modern', '#d5d9de', '#3d3f44', '#26262a'],
    ['retro', '#d5d9de', R.caramel, R.red],
    ['cute', '#d5d9de', C.sky, C.pink],
  ], harmonica, PROP),
  def('int-accordion', '手风琴', 'music', [44, 21, 44], [
    ['retro', R.red, IVORY, METAL],
    ['retro', R.teal, R.cream, METAL],
    ['modern', '#26262a', '#f4f4f2', '#c3c7cc'],
    ['cute', C.pink, C.white, C.lemon],
  ], F(accordion), PROP),
  def('int-harp', '竖琴', 'music', [68, 30, 162], [
    ['nordic', N.oak, '#f2ead8', GOLD],
    ['retro', R.caramel, '#f2ead8', BRASS],
    ['modern', '#3d3f44', '#e8e8e8', '#c3c7cc'],
    ['cute', C.woodL, '#fff6e8', C.pink],
  ], harp),
  def('int-shamisen', '三味线', 'music', [26, 24.5, 108], [
    ['japanese', J.dark, J.washi, J.wood],
    ['japanese', '#5a2e22', '#fff8ec', J.sumi],
    ['retro', R.caramel, R.cream, R.red],
  ], shamisen),
  def('int-koto', '筝', 'music', [180, 30, 16.2], [
    ['japanese', J.wood, IVORY, J.dark],
    ['japanese', J.hinoki, '#fff8ec', J.sumi],
    ['retro', R.caramel, R.cream, '#5a3a24'],
  ], koto),
  def('int-taiko', '太鼓', 'music', [58, 45, 79.5], [
    ['japanese', '#7a3a24', '#f2e2c0', J.dark],
    ['japanese', J.wood, IVORY, J.sumi],
    ['retro', R.red, R.cream, R.caramel],
  ], taiko),
  def('int-shakuhachi', '尺八', 'music', [13, 13, 55.5], [
    ['japanese', '#d8b46a', '#a8803e', J.sumi],
    ['japanese', '#c8a050', '#8a6a34', J.dark],
    ['nordic', '#e2c486', '#b89058', N.white],
  ], shakuhachi, PROP),
  def('int-small-instruments', '小乐器组（铃鼓·沙锤·卡祖笛）', 'music', [34.5, 19.9, 6.9], [
    ['cute', C.pink, C.lemon, C.sky],
    ['retro', R.red, R.mustard, R.teal],
    ['nordic', N.oak, N.sage, N.mustard],
  ], smallInstruments, PROP),
  def('int-synth', '合成器键盘', 'music', [100, 32, 9], [
    ['modern', '#2f3035', '#fbfaf6', '#ff7a4d'],
    ['retro', R.cream, IVORY, R.orange],
    ['nordic', N.white, '#fbfaf6', GOLD],
    ['cute', C.lilac, '#fffaf4', C.pink],
  ], synth(36, 100, 32, false), { ...PROP, family: 'int-keyboard', sizeLabel: '61 键合成器' }),
  def('int-midi-keyboard', '合成器键盘', 'music', [50, 24, 8.7], [
    ['modern', '#2f3035', '#fbfaf6', '#ff7a4d'],
    ['retro', R.cream, IVORY, R.orange],
    ['cute', C.sky, '#fffaf4', C.pink],
    ['modern', M.white, '#fbfaf6', '#5ad1ff'],
  ], synth(15, 50, 24, true), { ...PROP, family: 'int-keyboard', sizeLabel: '25 键 MIDI' }),
  def('int-dj-deck', 'DJ 台', 'music', [70, 38, 7], [
    ['modern', '#26262a', '#4a4b50', '#5ad1ff'],
    ['modern', M.silver, '#3d3f44', '#ff6a8a'],
    ['cute', C.white, C.lilac, C.pink],
    ['industrial', I.iron, I.steel, I.rust],
  ], djDeck, PROP),
  def('int-music-stand', '谱架', 'music', [50, 36, 128], [
    ['modern', DARK, PAPER, '#2a2a2a'],
    ['nordic', N.oak, PAPER, '#3a3a3a'],
    ['cute', C.pink, '#fffaf4', '#5a4646'],
    ['industrial', I.iron, '#f4ecd8', '#3a2a22'],
  ], musicStand),
  def('int-metronome', '节拍器', 'music', [11.1, 10, 21], [
    ['retro', R.caramel, R.cream, BRASS],
    ['modern', '#26262a', M.white, METAL],
    ['cute', C.pink, C.white, C.lemon],
    ['nordic', N.oak, N.white, METAL],
  ], F(metronome), PROP),
]

const MANGA_PALS: PalFlat[] = [
  ['cute', C.pink, C.sky, C.lemon],
  ['retro', R.red, R.teal, R.mustard],
  ['modern', '#3d3f44', '#c8473a', '#f4f4f2'],
  ['nordic', N.blue, N.sage, N.mustard],
]

const OTAKU: AssetDef[] = [
  def('int-manga-stack-s', '漫画书堆', 'hobby', [18.7, 12.5, 7.5], MANGA_PALS, mangaStack(5), { ...PROP, family: 'int-manga-stack', sizeLabel: '5 本' }),
  def('int-manga-stack-m', '漫画书堆', 'hobby', [18.5, 12.3, 15], MANGA_PALS, mangaStack(10), { ...PROP, family: 'int-manga-stack', sizeLabel: '10 本' }),
  def('int-manga-stack-l', '漫画书堆', 'hobby', [18.6, 12.4, 24], MANGA_PALS, mangaStack(16), { ...PROP, family: 'int-manga-stack', sizeLabel: '16 本' }),
  def('int-manga-row', '漫画全套（一排）', 'hobby', [65, 11.6, 17.6], [
    ['cute', '#ff9fc0', '#8fc8f0', '#f4f4f2'],
    ['retro', R.orange, R.teal, '#8a8d93'],
    ['modern', '#26262a', '#c8473a', '#c3c7cc'],
    ['nordic', N.sage, N.blue, N.oak],
  ], mangaRow, PROP),
  def('int-figure-case', '手办展示柜', 'hobby', [40, 25, 46], [
    ['modern', '#26262a', '#ff9fc0', '#8fa0b8'],
    ['cute', C.white, C.pink, C.sky],
    ['nordic', N.oak, N.blue, N.white],
    ['industrial', I.iron, I.rust, I.steel],
  ], figureCase, PROP),
  def('int-ita-bag', '痛包', 'hobby', [32.5, 12.4, 30.5], [
    ['cute', C.pink, '#ff7fa8', C.white],
    ['cute', C.lilac, '#8a6ad0', C.white],
    ['cute', C.sky, '#4f8fd0', C.white],
    ['modern', '#26262a', '#ff6a8a', '#26262a'],
  ], itaBag, PROP),
  def('int-acrylic-stand', '亚克力立牌', 'hobby', [9, 5.5, 15], [
    ['cute', C.sky, '#ffcf6a', C.pink],
    ['cute', C.sakura, '#8a6ad0', C.white],
    ['cute', C.mint, '#5a4646', C.lilac],
    ['modern', '#3d3f44', '#c3c7cc', '#c8473a'],
  ], acrylicStand, PROP),
  def('int-penlights', '应援棒', 'hobby', [24.5, 9.6, 3.1], [
    ['cute', '#ff7fa8', '#6ad0ff', '#ffe066'],
    ['cute', '#b48aff', '#7affc8', '#ff9a5a'],
    ['modern', '#ffffff', '#5ad1ff', '#ff4a6a'],
  ], penlights, PROP),
  def('int-poster-tubes', '海报筒', 'hobby', [15.4, 9.2, 70], [
    ['modern', '#26262a', '#8a8d93', '#3d3f44'],
    ['cute', C.pink, C.sky, C.white],
    ['industrial', I.iron, I.leather, '#26262a'],
    ['nordic', N.sage, N.linen, N.oak],
  ], posterTubes, PROP),
]

const SPORTS: AssetDef[] = [
  def('int-basketball', '篮球', 'hobby', [25, 25, 25], [
    ['retro', '#e2702f', '#3a2a22'],
    ['modern', '#c8602a', '#26262a'],
    ['cute', '#ffa64d', '#5a4646'],
  ], basketball, PROP),
  def('int-soccer-ball', '足球', 'hobby', [22, 22, 22], [
    ['modern', '#fbfaf6', '#26262a'],
    ['cute', '#fffaf4', C.pink],
    ['retro', R.cream, R.caramel],
  ], soccerBall, PROP),
  def('int-tennis', '网球拍 + 球', 'hobby', [60.5, 27, 6.8], [
    ['modern', '#26262a', '#f4f4f2', '#d8ec4a'],
    ['cute', C.sky, C.white, '#d8ec4a'],
    ['retro', R.red, R.cream, '#d8ec4a'],
    ['nordic', N.white, N.oak, '#d8ec4a'],
  ], tennis, PROP),
  def('int-badminton', '羽毛球拍 + 球', 'hobby', [69, 25, 6.5], [
    ['modern', '#26262a', '#c8473a', '#fbfaf6'],
    ['cute', C.pink, C.white, '#fffaf4'],
    ['nordic', N.blue, N.white, '#fbfaf6'],
  ], badminton, PROP),
  def('int-baseball', '棒球手套 + 球棒', 'hobby', [83.5, 38.5, 22], [
    ['retro', '#a8683a', '#e8c89a', '#c8473a'],
    ['modern', '#3a2a22', '#26262a', '#c8473a'],
    ['industrial', I.leather, I.walnut, '#c8473a'],
  ], baseball, PROP),
  def('int-skateboard-flat', '滑板', 'hobby', [80.5, 21.5, 12.2], [
    ['retro', R.orange, '#2b2b2b', R.cream],
    ['cute', C.mint, '#3a3a3a', C.pink],
    ['modern', '#26262a', '#2b2b2b', '#f4f4f2'],
    ['industrial', I.walnut, '#2b2b2b', I.rust],
  ], skateboardFlat, { ...PROP, family: 'int-skateboard', form: 'lying' }),
  def('int-skateboard-stand', '滑板', 'hobby', [21.5, 20.5, 79.5], [
    ['retro', R.orange, '#2b2b2b', R.cream],
    ['cute', C.mint, '#3a3a3a', C.pink],
    ['modern', '#26262a', '#2b2b2b', '#f4f4f2'],
    ['industrial', I.walnut, '#2b2b2b', I.rust],
  ], skateboardStand, { family: 'int-skateboard', form: 'standing' }),
  def('int-surfboard', '冲浪板（靠墙）', 'hobby', [52.5, 32, 179.5], [
    ['nordic', N.white, N.blue, N.oak],
    ['retro', R.cream, R.orange, R.teal],
    ['cute', C.sky, C.pink, C.white],
    ['modern', '#f4f4f2', '#26262a', '#8a8d93'],
  ], surfboard),
  def('int-snowboard', '滑雪板（靠墙）', 'hobby', [28, 24, 149.5], [
    ['modern', '#26262a', '#3d3f44', '#5ad1ff'],
    ['retro', R.teal, '#3a3a3a', R.mustard],
    ['cute', C.lilac, '#5a4646', C.pink],
    ['industrial', I.rust, I.iron, I.steel],
  ], snowboard),
  def('int-golf-bag', '高尔夫球包', 'hobby', [27, 38, 109], [
    ['modern', '#26262a', '#c3c7cc', '#f4f4f2'],
    ['retro', R.cream, R.caramel, R.red],
    ['nordic', N.white, N.blue, N.mustard],
    ['industrial', I.leather, I.iron, I.rust],
  ], golfBag),
  def('int-boxing-gloves', '拳击手套', 'hobby', [28.5, 23, 12.6], [
    ['retro', R.red, '#fbfaf6', R.cream],
    ['modern', '#26262a', '#3d3f44', '#c8473a'],
    ['cute', C.pink, C.white, C.lemon],
    ['industrial', I.leather, I.iron, I.steel],
  ], boxingGloves, PROP),
  def('int-bike-helmet', '自行车头盔', 'hobby', [22.5, 29.5, 11.8], [
    ['modern', '#f4f4f2', '#c8473a', '#3d3f44'],
    ['cute', C.mint, C.white, '#5a4646'],
    ['industrial', I.iron, I.rust, '#26262a'],
    ['nordic', N.sage, N.white, N.gray],
  ], bikeHelmet, PROP),
]

const GAMES: AssetDef[] = [
  def('int-shogi', '将棋', 'hobby', [33.5, 36.5, 4.2], [
    ['japanese', '#e8c87a', '#f0d9a0', J.sumi],
    ['japanese', J.hinoki, '#f6e2b0', J.sumi],
    ['retro', R.caramel, R.cream, '#3a2a22'],
  ], shogi, { ...PROP, family: 'int-shogi', sizeLabel: '开局' }),
  def('int-go', '围棋', 'hobby', [74, 45.5, 9.8], [
    ['japanese', '#e8c87a', J.dark, J.sumi],
    ['japanese', J.hinoki, '#5a2e22', J.sumi],
    ['nordic', N.oak, N.white, '#3a3a3a'],
  ], goBoard, { ...PROP, family: 'int-go', sizeLabel: '中盘' }),
  def('int-chess', '国际象棋', 'hobby', [40.5, 36, 10.1], [
    ['modern', '#3d3f44', '#f4f4f2', '#26262a'],
    ['retro', R.caramel, R.cream, '#5a3a24'],
    ['nordic', N.oak, N.white, '#5a5f66'],
    ['cute', C.woodL, C.white, C.pink],
  ], chess, { ...PROP, family: 'int-chess', sizeLabel: '中盘' }),
  def('int-mahjong-table', '自动麻将桌', 'hobby', [88, 88, 75.5], [
    ['retro', R.caramel, '#2f8a5a', R.orange],
    ['modern', '#26262a', '#3d6fb8', '#3d6fb8'],
    ['japanese', J.dark, '#3f7a4a', '#2f8a5a'],
    ['cute', C.woodL, C.mint, C.pink],
  ], mahjong, { surface: 71.5, family: 'int-mahjong-table', sizeLabel: '打牌中' }),
  def('int-poker', '扑克牌', 'hobby', [32, 22, 4.4], [
    ['retro', '#2f6a4a', '#c8473a', '#c8473a'],
    ['modern', '#26262a', '#3d6fb8', '#3d6fb8'],
    ['industrial', '#3a5a3c', '#7a2a22', I.rust],
  ], poker, { ...PROP, family: 'int-poker', sizeLabel: '对局中' }),
  def('int-boardgame-pile', '桌游盒子堆', 'hobby', [34.5, 31, 26.5], [
    ['cute', C.pink, C.sky, C.lemon],
    ['retro', R.teal, R.orange, R.mustard],
    ['modern', '#3d3f44', '#c8473a', '#8a8d93'],
    ['nordic', N.blue, N.sage, N.mustard],
  ], boardGames, PROP),
]

const CRAFT: AssetDef[] = [
  def('int-knitting', '毛线篮', 'hobby', [39.5, 30, 31], [
    ['nordic', N.oak, N.sage, N.mustard],
    ['cute', C.woodL, C.pink, C.sky],
    ['retro', R.caramel, R.red, R.mustard],
    ['japanese', J.wood, J.ai, J.shu],
  ], knittingBasket, PROP),
  def('int-sewing-machine', '缝纫机', 'hobby', [42, 18, 34], [
    ['cute', C.white, C.pink, C.sky],
    ['retro', R.cream, R.teal, R.red],
    ['modern', '#f4f4f2', '#3d3f44', '#c8473a'],
    ['retro', '#26262a', BRASS, R.mustard],
  ], sewingMachine, PROP),
  def('int-embroidery', '刺绣绷', 'hobby', [32, 21, 2.5], [
    ['cute', C.woodL, '#fffaf4', C.pink],
    ['nordic', N.oak, N.linen, N.blue],
    ['japanese', J.wood, J.washi, J.shu],
  ], embroidery, PROP),
  def('int-calligraphy', '书法套装', 'japanese', [46, 36, 3.6], [
    ['japanese', '#3a4258', J.sumi, '#d8b46a'],
    ['japanese', '#5a2e22', J.sumi, '#c8a050'],
    ['modern', '#2e3036', '#1e1e22', '#c8a050'],
  ], calligraphy, PROP),
  def('int-watercolor', '水彩套装', 'hobby', [43.5, 21.5, 11.1], [
    ['cute', '#fffaf4', C.sky, C.mint],
    ['nordic', N.white, N.blue, N.sage],
    ['retro', R.cream, '#9ad0e0', R.olive],
  ], watercolor, PROP),
  def('int-pottery-wheel', '陶艺转盘', 'hobby', [58, 62, 43.5], [
    ['nordic', N.white, N.gray, '#c88a62'],
    ['modern', '#3d3f44', '#8a8d93', '#b87a52'],
    ['industrial', I.steel, I.iron, '#a8684a'],
    ['cute', C.sky, C.white, '#d89a72'],
  ], potteryWheel),
]

const STUDY: AssetDef[] = [
  def('int-microscope', '显微镜', 'study', [14, 19.3, 34], [
    ['modern', '#f4f4f2', '#c3c7cc', '#fff2b8'],
    ['retro', '#26262a', BRASS, '#fff2b8'],
    ['cute', C.white, C.sky, '#fff2b8'],
  ], microscope, PROP),
  def('int-chem-set', '化学烧瓶组', 'study', [40.5, 10, 14.9], [
    ['nordic', N.oak, '#7ad0a0', '#6aa8f0'],
    ['retro', R.caramel, '#e2702f', R.teal],
    ['cute', C.woodL, C.pink, C.sky],
  ], chemSet, PROP),
  def('int-star-chart', '天文星图', 'study', [70, 2.5, 50], [
    ['modern', '#26262a', '#1d2a4a', '#fff2b8'],
    ['nordic', N.oak, '#2a3a5a', '#ffffff'],
    ['retro', R.caramel, '#1e3a4a', R.mustard],
  ], starChart, { mount: STAR_MOUNT }),
  def('int-map-scroll', '地图卷轴', 'study', [43.5, 33, 4.4], [
    ['retro', '#f0dcb0', '#6a4a2a', R.caramel],
    ['japanese', J.washi, J.sumi, J.dark],
    ['nordic', N.linen, '#4a5a6a', N.oak],
  ], mapScroll, PROP),
  def('int-ref-books', '参考书堆 + 便签', 'study', [27, 21.5, 17.5], [
    ['modern', '#3d5a80', '#8a3a4a', '#ffe08f'],
    ['nordic', N.blue, N.sage, N.mustard],
    ['retro', R.teal, R.red, R.mustard],
    ['cute', C.sky, C.pink, C.lemon],
  ], refBooks, PROP),
]

const COLLECT: AssetDef[] = [
  def('int-record-row', '唱片收藏（一排）', 'hobby', [40, 35, 31.5], [
    ['retro', R.orange, R.teal, METAL],
    ['modern', '#3d3f44', '#c8473a', '#26262a'],
    ['nordic', N.blue, N.mustard, N.oak],
    ['cute', C.pink, C.sky, C.white],
  ], recordRow, PROP),
  def('int-vinyl-rack', '黑胶唱片架', 'storage', [74, 36, 79], [
    ['nordic', N.oak, N.blue, N.mustard],
    ['industrial', I.walnut, I.rust, I.steel],
    ['modern', '#f4f4f2', '#3d3f44', '#c8473a'],
    ['retro', R.caramel, R.orange, R.teal],
  ], vinylRack, { surface: 79 }),
  def('int-trophy-cup', '奖杯', 'deco', [19.4, 13, 23.5], [
    ['modern', '#26262a', GOLD, GOLD],
    ['retro', R.caramel, BRASS, BRASS],
    ['nordic', N.white, '#c9ced6', '#c9ced6'],
  ], trophyCup, { ...PROP, family: 'int-trophy', sizeLabel: '大杯' }),
  def('int-trophy-star', '奖杯', 'deco', [11.4, 7.2, 23.5], [
    ['modern', '#26262a', GOLD, GOLD],
    ['retro', R.caramel, BRASS, BRASS],
    ['cute', C.sky, '#ffd65a', '#ffd65a'],
  ], trophyStar, { ...PROP, family: 'int-trophy', sizeLabel: '星形' }),
  def('int-trophy-column', '奖杯', 'deco', [8, 8, 19.5], [
    ['modern', '#26262a', GOLD, GOLD],
    ['nordic', N.white, '#c9ced6', '#c9ced6'],
    ['retro', '#3a3a3a', '#c8875a', '#c8875a'],
  ], trophyColumn, { ...PROP, family: 'int-trophy', sizeLabel: '小立柱' }),
  def('int-medal-rack', '奖牌挂架', 'deco', [60, 3.3, 33.6], [
    ['modern', '#26262a', '#3d6fb8', '#c8473a'],
    ['nordic', N.oak, N.blue, N.mustard],
    ['industrial', I.iron, I.rust, '#3a5a3c'],
  ], medalRack, { mount: MEDAL_MOUNT }),
  def('int-postcard-wall', '明信片墙', 'deco', [90.5, 2.7, 60.5], [
    ['industrial', '#26262a', I.walnut, '#ffd27a'],
    ['nordic', N.white, N.oak, '#fff2b8'],
    ['cute', C.pink, C.woodL, '#fff2b8'],
    ['modern', '#8a8d93', '#26262a', '#ffffff'],
  ], postcardWall, { mount: POSTCARD_MOUNT }),
  def('int-succulent-set', '多肉组合', 'plants', [32, 12, 13.4], [
    ['nordic', N.oak, N.white, '#9cc49a'],
    ['cute', C.woodL, C.sakura, '#a6d8b0'],
    ['industrial', I.walnut, I.concrete, '#8ab08a'],
    ['japanese', J.wood, J.sumi, '#9cb88a'],
  ], succulentSet, PROP),
  def('int-mineral-box', '矿石标本盒', 'study', [30, 22, 5.1], [
    ['nordic', N.oak, N.blue, N.white],
    ['retro', R.caramel, R.teal, R.cream],
    ['modern', '#3d3f44', '#8ad0ff', '#f4f4f2'],
  ], mineralBox, PROP),
]

const LIFE: AssetDef[] = [
  def('int-cat-toys', '猫抓板 + 逗猫棒', 'pets', [50.5, 32, 9], [
    ['cute', CARD, C.pink, C.lemon],
    ['nordic', '#d8b98c', N.oak, N.mustard],
    ['retro', CARD, R.red, R.teal],
  ], catToys, PROP),
  def('int-suitcase-standing', '旅行箱', 'entrance', [41.5, 24.5, 72], [
    ['cute', C.sakura, C.pink, C.sky],
    ['modern', '#3d3f44', '#26262a', '#c8473a'],
    ['nordic', N.sage, N.oak, N.mustard],
    ['retro', R.mustard, R.caramel, R.teal],
    ['industrial', I.steel, I.leather, I.rust],
  ], suitcaseStand, { family: 'int-suitcase', form: 'standing' }),
  def('int-suitcase-open', '旅行箱', 'entrance', [81, 65.5, 11], [
    ['cute', C.sakura, C.white, C.sky],
    ['modern', '#3d3f44', '#8a8d93', '#3d5a80'],
    ['nordic', N.sage, N.linen, N.blue],
    ['retro', R.mustard, R.cream, R.teal],
    ['industrial', I.steel, I.concrete, I.rust],
  ], suitcaseOpen, { family: 'int-suitcase', form: 'open' }),
  def('int-raincoat', '雨衣（挂钩）', 'entrance', [42, 18.7, 87], [
    ['retro', '#f0c040', '#3a3a3a', R.caramel],
    ['cute', C.pink, C.white, C.woodL],
    ['nordic', N.sage, N.white, N.oak],
    ['modern', '#3d5a80', '#f4f4f2', '#26262a'],
  ], raincoat, { mount: RAINCOAT_MOUNT }),
  def('int-cartons-1', '快递纸箱', 'storage', [34, 24.5, 20], [['industrial', CARD], ['nordic', '#d8b98c'], ['retro', '#b8854e']], cartons(1), { ...PROP, family: 'int-cartons', sizeLabel: '1 箱' }),
  def('int-cartons-2', '快递纸箱', 'storage', [45, 35.5, 50], [['industrial', CARD], ['nordic', '#d8b98c'], ['retro', '#b8854e']], cartons(2), { family: 'int-cartons', sizeLabel: '2 箱' }),
  def('int-cartons-3', '快递纸箱', 'storage', [55, 40.5, 85], [['industrial', CARD], ['nordic', '#d8b98c'], ['retro', '#b8854e']], cartons(3), { family: 'int-cartons', sizeLabel: '3 箱' }),
  def('int-snack-pile', '零食堆', 'tabletop', [34.5, 28, 12.3], [
    ['cute', '#ff9a5a', C.pink, C.lemon],
    ['retro', R.red, R.mustard, R.orange],
    ['modern', '#3d5a80', '#26262a', '#ffd65a'],
  ], snackPile, PROP),
  def('int-energy-cans', '能量饮料罐堆', 'tabletop', [20.5, 10.4, 40.5], [
    ['modern', '#26262a', '#5ad1ff', METAL],
    ['modern', '#3d5a80', '#ff4a6a', METAL],
    ['cute', '#ffffff', C.pink, METAL],
    ['retro', R.teal, R.mustard, METAL],
  ], energyCans, PROP),
  def('int-coffee-canisters', '咖啡豆罐', 'kitchenware', [29.5, 17, 15.5], [
    ['retro', R.red, R.cream, '#d8b98c'],
    ['modern', '#26262a', '#f4f4f2', '#c3c7cc'],
    ['nordic', N.sage, N.white, N.linen],
    ['industrial', I.steel, I.concrete, '#c8a070'],
  ], coffeeCanisters, PROP),
]

const ROD_PALS: PalFlat[] = [
  ['modern', '#26262a', '#3a3b40', '#c3c7cc'],
  ['industrial', '#3a5a3c', '#c8a070', '#7c8085'],
  ['retro', '#7a2a22', '#c8a070', BRASS],
  ['nordic', N.blue, '#c8a070', '#c3c7cc'],
]
const BAG_PALS: PalFlat[] = [
  ['modern', '#26262a', '#8a8d93', '#3d3f44'],
  ['industrial', '#5a6a4a', '#26262a', I.leather],
  ['nordic', N.blue, N.white, N.oak],
  ['retro', R.olive, R.cream, R.caramel],
]

const FISHING: AssetDef[] = [
  def('int-rod-sea', '钓竿', 'hobby', [7.3, 20, 237.5], ROD_PALS, rodStanding(true), { family: 'int-fishing-rod', sizeLabel: '海竿 240', form: 'standing' }),
  def('int-rod-sea-bag', '钓竿', 'hobby', [150, 15.4, 11.2], BAG_PALS, rodBag(true), { ...PROP, family: 'int-fishing-rod', sizeLabel: '海竿 240', form: 'boxed' }),
  def('int-rod-lure', '钓竿', 'hobby', [5.8, 18.5, 192.5], ROD_PALS, rodStanding(false), { family: 'int-fishing-rod', sizeLabel: '路亚竿 195', form: 'standing' }),
  def('int-rod-lure-bag', '钓竿', 'hobby', [128, 15.4, 11.2], BAG_PALS, rodBag(false), { ...PROP, family: 'int-fishing-rod', sizeLabel: '路亚竿 195', form: 'boxed' }),
  def('int-rod-rack', '壁挂钓竿架', 'hobby', [210, 15.7, 34], [
    ['nordic', N.oak, N.blue, '#c3c7cc'],
    ['industrial', I.walnut, '#3a5a3c', '#7c8085'],
    ['modern', '#26262a', '#3d3f44', '#c3c7cc'],
    ['retro', R.caramel, '#7a2a22', BRASS],
  ], rodRack, { mount: ROD_RACK_MOUNT }),
  def('int-tackle-box-open', '渔具箱', 'hobby', [36, 24.5, 24.5], [
    ['industrial', '#5a6a4a', '#c3c7cc', '#e2702f'],
    ['modern', '#3d3f44', '#c3c7cc', '#5ad1ff'],
    ['retro', R.red, METAL, R.mustard],
    ['cute', C.mint, C.white, C.pink],
  ], tackleBox(true), { ...PROP, family: 'int-tackle-box', form: 'open' }),
  def('int-tackle-box', '渔具箱', 'hobby', [36.5, 21, 22], [
    ['industrial', '#5a6a4a', '#c3c7cc', '#e2702f'],
    ['modern', '#3d3f44', '#c3c7cc', '#5ad1ff'],
    ['retro', R.red, METAL, R.mustard],
    ['cute', C.mint, C.white, C.pink],
  ], tackleBox(false), { ...PROP, family: 'int-tackle-box', form: 'closed' }),
  def('int-fish-cooler', '钓鱼冷藏箱', 'hobby', [55.5, 31.5, 33.5], [
    ['modern', '#f4f4f2', '#3d5a80', '#26262a'],
    ['retro', R.cream, R.red, '#3a3a3a'],
    ['industrial', I.concrete, '#5a6a4a', I.iron],
    ['cute', C.white, C.sky, C.pink],
  ], fishCooler),
  def('int-fishing-stool', '折叠钓鱼凳', 'hobby', [28, 30, 41], [
    ['industrial', '#5a6a4a', I.iron],
    ['modern', '#26262a', '#8a8d93'],
    ['nordic', N.linen, N.oak],
    ['retro', R.olive, R.caramel],
  ], fishingStool),
  def('int-fish-creel', '鱼篓', 'hobby', [26.5, 16.8, 35], [
    ['japanese', '#d8b46a', J.wood, J.dark],
    ['retro', R.caramel, R.cream, '#5a3a24'],
    ['nordic', N.oak, N.linen, N.gray],
  ], fishCreel, PROP),
  def('int-landing-net', '抄网（靠墙）', 'hobby', [41, 33, 160], [
    ['modern', '#26262a', '#c3c7cc', '#3a3a3a'],
    ['industrial', I.walnut, I.iron, '#4a5a3a'],
    ['retro', R.caramel, BRASS, '#5a5a4a'],
  ], landingNet),
]

const BOX_PALS: PalFlat[] = [['cute', C.pink], ['retro', R.teal], ['modern', '#3d3f44'], ['nordic', N.sage], ['retro', R.orange]]
const TRIO_PALS: PalFlat[] = [
  ['cute', C.pink, C.sky, C.lemon],
  ['retro', R.teal, R.orange, R.mustard],
  ['modern', '#3d3f44', '#c8473a', '#8a8d93'],
  ['nordic', N.blue, N.sage, N.mustard],
]

const BOARDGAMES: AssetDef[] = [
  def('int-bgbox-square', '桌游盒', 'hobby', [30, 30, 7.8], BOX_PALS, bgBoxSingle(30, 7.5, 30, 1), { ...PROP, family: 'int-bgbox', sizeLabel: '方形大盒' }),
  def('int-bgbox-mid', '桌游盒', 'hobby', [23, 23, 6.3], BOX_PALS, bgBoxSingle(23, 6, 23, 2), { ...PROP, family: 'int-bgbox', sizeLabel: '中号方盒' }),
  def('int-bgbox-rect', '桌游盒', 'hobby', [30, 22, 6.3], BOX_PALS, bgBoxSingle(30, 6, 22, 3), { ...PROP, family: 'int-bgbox', sizeLabel: '长方形' }),
  def('int-bgbox-card', '桌游盒', 'hobby', [12.1, 9.1, 4.3], BOX_PALS, bgBoxSingle(12, 4, 9, 4), { ...PROP, family: 'int-bgbox', sizeLabel: '小卡牌盒' }),
  def('int-bgbox-row', '桌游盒（竖插一排）', 'hobby', [57.5, 30.5, 30], TRIO_PALS, bgShelfRow, PROP),
  def('int-bg-hex', '六角地块版图（对局中）', 'hobby', [53.5, 36.5, 2.7], [
    ['cute', '#9ccbe8', C.pink, '#ffffff'],
    ['retro', '#5aa0b8', R.red, R.cream],
    ['nordic', N.blue, N.mustard, N.white],
  ], bgHex, PROP),
  def('int-bg-train', '铁路地图版图（对局中）', 'hobby', [57, 34, 1.6], [
    ['retro', '#e8dcb0', R.red, R.teal],
    ['nordic', '#dfe5c8', N.blue, N.mustard],
    ['cute', '#f6ecd0', C.pink, C.sky],
  ], bgTrain, PROP),
  def('int-card-game', '彩色数字卡牌', 'hobby', [44, 32, 2.7], [
    ['retro', '#c8473a', '#2f6a4a'],
    ['modern', '#26262a', '#3d3f44'],
    ['cute', C.pink, C.sky],
  ], cardGame, { ...PROP, family: 'int-uno', sizeLabel: '对局中' }),
  def('int-dice-game', '骰子游戏（骰盅 + 骰子）', 'hobby', [36.5, 26, 10.2], [
    ['industrial', I.leather, '#2f6a4a', '#fbfaf6'],
    ['modern', '#26262a', '#3d5a80', '#fbfaf6'],
    ['retro', R.caramel, R.red, R.cream],
    ['cute', C.pink, C.mint, '#ffffff'],
  ], diceGame, PROP),
  def('int-bg-loop', '环形大富翁棋盘（对局中）', 'hobby', [62, 50, 2.6], [
    ['retro', '#dfe8d0', R.red, R.mustard],
    ['cute', '#f6ecd0', C.pink, C.sky],
    ['nordic', N.linen, N.blue, N.mustard],
  ], bgLoop, PROP),
  def('int-bg-mystery', '推理桌游（对局中）', 'hobby', [59.5, 48, 3.1], [
    ['retro', '#c8a878', '#5a3a24', R.red],
    ['modern', '#b8bcc2', '#3d3f44', '#c8473a'],
    ['nordic', N.oakL, N.gray, N.blue],
  ], bgMystery, PROP),
  def('int-chess-opening', '国际象棋', 'hobby', [36, 36, 8.8], [
    ['modern', '#3d3f44', '#f4f4f2', '#26262a'],
    ['retro', R.caramel, R.cream, '#5a3a24'],
    ['nordic', N.oak, N.white, '#5a5f66'],
    ['cute', C.woodL, C.white, C.pink],
  ], chessOpening, { ...PROP, family: 'int-chess', sizeLabel: '开局' }),
  def('int-xiangqi', '中国象棋', 'hobby', [40, 44, 2.7], [
    ['retro', '#e8c87a', '#c8302a', '#26262a'],
    ['nordic', N.oakL, '#c8302a', '#26262a'],
    ['japanese', J.hinoki, '#c8302a', J.sumi],
  ], xiangqi, { ...PROP, family: 'int-xiangqi', sizeLabel: '开局' }),
  def('int-reversi', '黑白棋', 'hobby', [34, 34, 2], [
    ['modern', '#3f8a4a', '#26262a', '#f4f4f2'],
    ['retro', '#2f7a4a', '#26262a', R.cream],
    ['cute', '#8fcf9a', '#5a4646', '#ffffff'],
  ], reversi, { ...PROP, family: 'int-reversi', sizeLabel: '中盘' }),
  def('int-chinese-checkers', '跳棋', 'hobby', [43, 43, 3], [
    ['retro', R.caramel, R.cream, R.red],
    ['nordic', N.oak, N.white, '#c8473a'],
    ['cute', C.woodL, C.sakura, C.pink],
  ], chineseCheckers, { ...PROP, family: 'int-chinese-checkers', sizeLabel: '开局' }),
  def('int-backgammon', '双陆棋', 'hobby', [48.5, 38, 3], [
    ['retro', '#7a4a2a', R.red, R.red],
    ['industrial', I.walnut, '#3a3a3c', '#26262a'],
    ['nordic', N.oak, N.blue, N.blue],
  ], backgammon, { ...PROP, family: 'int-backgammon', sizeLabel: '对局中' }),
  def('int-hanafuda', '花札', 'japanese', [21.5, 19.9, 1.6], [
    ['japanese', '#c8302a', '#f2e6cc', J.shu],
    ['japanese', '#26262a', '#cfe0f0', '#8a4fb0'],
    ['retro', R.red, R.cream, R.mustard],
  ], hanafuda, { ...PROP, family: 'int-hanafuda', sizeLabel: '对局中' }),
  def('int-karuta', '百人一首（かるた）', 'japanese', [88, 60, 1.1], [
    ['japanese', J.tatami, '#3a6a4a', J.sumi],
    ['japanese', '#d0d49a', '#c8302a', J.sumi],
    ['retro', '#c9c48a', R.teal, '#3a2a22'],
  ], karuta, { ...PROP, family: 'int-karuta', sizeLabel: '摆开对局' }),
  def('int-jenga', '叠叠乐', 'hobby', [13.5, 11, 27], [['nordic', '#e8cfa0'], ['japanese', J.hinoki], ['cute', '#f0d6b0']], jenga(true), { ...PROP, family: 'int-jenga', form: 'stacked' }),
  def('int-jenga-fallen', '叠叠乐', 'hobby', [45.5, 40, 8.3], [['nordic', '#e8cfa0'], ['japanese', J.hinoki], ['cute', '#f0d6b0']], jenga(false), { ...PROP, family: 'int-jenga', form: 'lying' }),
  def('int-uno-cards', '彩色数字卡牌', 'hobby', [37, 11.3, 3.2], [
    ['retro', '#c8473a', '#2f6a4a'],
    ['modern', '#26262a', '#3d3f44'],
    ['cute', C.pink, C.sky],
  ], unoCards, { ...PROP, family: 'int-uno', sizeLabel: '一副 + 摊开几张' }),
  def('int-jigsaw', '拼图（拼到一半）', 'hobby', [54, 40, 0.9], [
    ['nordic', N.linen, '#a8d4f4', '#78c47a'],
    ['retro', R.cream, '#9ad0e0', R.olive],
    ['cute', C.cream, C.sky, C.mint],
  ], jigsaw, PROP),
  def('int-tangram', '七巧板', 'hobby', [33.5, 20.5, 1.6], [
    ['nordic', N.oak, N.blue, N.sage],
    ['cute', C.woodL, C.sky, C.lilac],
    ['retro', R.caramel, R.red, R.teal],
  ], tangram, PROP),
  def('int-burr-puzzle', '鲁班锁', 'hobby', [18, 10.3, 8.8], [['nordic', '#e2c486'], ['japanese', J.wood], ['retro', R.caramel]], burrPuzzle, PROP),
]

export const INTERESTS: AssetDef[] = [...MUSIC, ...OTAKU, ...SPORTS, ...GAMES, ...CRAFT, ...STUDY, ...COLLECT, ...LIFE, ...FISHING, ...BOARDGAMES]

// =====================================================================
// 棋牌状态变体：每种棋牌一个 family（int-chess、int-go…），name 统一为棋种名，sizeLabel 表示状态
// （收在盒里 / 合上 / 开局 / 中盘 / 残局 / 摆谱 / 收拾中…）。旧 id 保留为其中一个状态，见上方 GAMES / BOARDGAMES。
// 同一 family 的配色组和旧素材完全一致，切换状态时配色不跳。
// =====================================================================

type ChessKind = 'p' | 'r' | 'n' | 'b' | 'q' | 'k'

/** 国际象棋盘（和旧素材同一张贴图）：36 × 36，盘面高 2.3 */
function chessBoard(g: THREE.Group, frame: string, white: string, black: string) {
  g.add(rbox(36, 2, 36, frame, {}, 0.5))
  g.add(paintTop(32, 32, `int-chess-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
      }
  }, 0, 2.3, 0))
}
/** 按「f 列 r 行 白?」摆子：r = 0 是白方底线（+z 一侧） */
function chessPut(g: THREE.Group, list: [ChessKind, number, number, boolean][], white: string, black: string) {
  for (const [k, f, r, w] of list) g.add(P(chessPiece(k, w ? white : black, w ? PI : 0), -14 + f * 4, 2.35, 14 - r * 4))
}
/** 被吃掉的子：横躺在棋盘外侧排成列（side = 1 右侧，-1 左侧） */
function chessTaken(g: THREE.Group, kinds: ChessKind[], color: string, side: number) {
  kinds.forEach((k, i) => {
    const col = Math.floor(i / 6)
    const row = i % 6
    g.add(P(chessPiece(k, color), side * (19.6 + col * 7), 1.4, -13 + row * 5.2, 0, 0, -side * (PI / 2)))
  })
}

const CHESS_MID: [ChessKind, number, number, boolean][] = [
  ['k', 6, 0, true], ['r', 5, 0, true], ['q', 3, 1, true], ['b', 2, 3, true], ['n', 5, 2, true], ['p', 0, 1, true], ['p', 1, 1, true], ['p', 4, 3, true], ['p', 5, 1, true], ['p', 6, 1, true], ['p', 7, 2, true],
  ['k', 6, 7, false], ['r', 0, 7, false], ['r', 5, 7, false], ['q', 4, 6, false], ['n', 2, 5, false], ['b', 6, 6, false], ['p', 0, 6, false], ['p', 1, 5, false], ['p', 4, 4, false], ['p', 5, 6, false], ['p', 6, 5, false], ['p', 7, 6, false],
]

/** 收在木盒里：抽拉盖木盒，盖上镶一小块棋盘格 [框, 白, 黑] */
function chessBoxed(p: string[]) {
  const [frame, white, black] = p
  const g = G(rbox(30, 6.4, 15, frame, {}, 0.6), rbox(29.4, 0.8, 14.2, shade(frame, -0.12), { y: 6.2 }, 0.3))
  g.add(paintTop(12, 6, `int-chess-lid-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 4, W / 8 + 1, H / 4 + 1)
      }
  }, 0, 7.05, 0))
  g.add(rbox(3, 0.5, 1, shade(frame, -0.3), { x: 13, y: 7, z: 0 }, 0.2))
  return fit(g)
}

/** 折叠棋盘合上：两片对折，外面露出半张棋盘格，后边两个合页、前边一个搭扣 [框, 白, 黑] */
function chessFolded(p: string[]) {
  const [frame, white, black] = p
  const g = G(rbox(36, 2.6, 18, frame, {}, 0.5), rbox(36, 2.6, 18, shade(frame, -0.06), { y: 2.7 }, 0.5))
  g.add(paintTop(32, 16, `int-chess-half-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 4, W / 8 + 1, H / 4 + 1)
      }
  }, 0, 5.6, 0))
  for (const x of [-11, 11]) g.add(cylX(0.6, 5, METAL, x, 2.7, -9.1))
  g.add(rbox(3, 2.4, 0.6, METAL, { y: 1.5, z: 9.1 }, 0.2))
  return fit(g)
}

/** 残局：双方只剩几个子，吃掉的子横躺在两侧 [框, 白, 黑] */
function chessEndgame(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  chessBoard(g, frame, white, black)
  chessPut(g, [['k', 6, 1, true], ['r', 0, 4, true], ['p', 5, 1, true], ['p', 6, 2, true], ['p', 7, 1, true], ['k', 5, 6, false], ['r', 3, 6, false], ['p', 6, 5, false], ['p', 7, 4, false], ['b', 2, 3, false]], white, black)
  chessTaken(g, ['q', 'r', 'n', 'n', 'b', 'p', 'p', 'p', 'p', 'p'], black, 1)
  chessTaken(g, ['q', 'r', 'n', 'n', 'b', 'b', 'p', 'p', 'p', 'p', 'p'], white, -1)
  return fit(g)
}

/** 打开的棋谱书：两页各画一个小棋图 + 几行字，中心 (x, z) [封面色] */
function openBook(cover: string, key: string, x: number, z: number, ry = 0, ink = '#3a3a3a') {
  const b = G(rbox(25, 0.4, 17.6, cover, {}, 0.15))
  for (const s of [-1, 1]) {
    b.add(rbox(12, 0.9, 16.6, PAPER, { x: s * 6.1, y: 0.4 }, 0.2))
    b.add(paintTop(11, 15.6, `${key}-${s}`, (c, W, H) => {
      c.fillStyle = PAPER
      c.fillRect(0, 0, W, H)
      const n = 8
      const bw = W * 0.7
      const x0 = (W - bw) / 2
      const y0 = H * 0.08
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          c.fillStyle = (i + j) % 2 ? '#b8b8b8' : '#ffffff'
          c.fillRect(x0 + (i * bw) / n, y0 + (j * bw) / n, bw / n + 1, bw / n + 1)
        }
      c.strokeStyle = ink
      c.lineWidth = Math.max(1, W * 0.01)
      c.strokeRect(x0, y0, bw, bw)
      const r = rng(s + 7)
      c.fillStyle = ink
      for (let k = 0; k < 7; k++) {
        c.beginPath()
        c.arc(x0 + (Math.floor(r() * 8) + 0.5) * (bw / 8), y0 + (Math.floor(r() * 8) + 0.5) * (bw / 8), bw / 24, 0, PI * 2)
        c.fill()
      }
      for (let k = 0; k < 6; k++) c.fillRect(W * 0.12, y0 + bw + H * (0.06 + k * 0.045), W * (0.5 + r() * 0.26), Math.max(1, H * 0.012))
    }, s * 6.1, 1.32, 0))
  }
  b.add(rbox(0.6, 1.1, 16.8, shade(cover, -0.2), { y: 0.35 }, 0.2))
  return P(b, x, 0, z, 0, ry)
}

/** 复盘 / 摆谱：盘上是谱里的局面，旁边摊着棋谱书和一支铅笔 [框, 白, 黑] */
function chessStudy(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  chessBoard(g, frame, white, black)
  chessPut(g, CHESS_MID.filter((_, i) => i % 5 !== 3), white, black)
  g.add(openBook(shade(frame, -0.1), `int-chess-book-${frame}`, 33, 2, -0.12))
  g.add(cylX(0.35, 13, '#e8c040', 32, 0.75, 13.5))
  g.add(P(cyl(0.01, 0.35, 1.2, '#f2d9b0', {}, 8), 25.4, 0.75, 13.5, 0, 0, PI / 2))
  return fit(g)
}

/** 散乱收拾中：盘上剩几个子、有的倒了，前面打开的木盒里已经装了一半 [框, 白, 黑] */
function chessMessy(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  chessBoard(g, frame, white, black)
  chessPut(g, [['k', 4, 0, true], ['r', 0, 0, true], ['p', 2, 2, true], ['q', 3, 7, false], ['p', 6, 6, false], ['n', 5, 4, false], ['b', 1, 5, true]], white, black)
  const lying: [ChessKind, number, number, number, boolean][] = [['p', 3, 3, 0.6, true], ['r', 6, 2, -1.2, false], ['p', -1, -9, 2.2, false], ['b', 9, -6, 0.3, true]]
  for (const [k, x, z, ry, w] of lying) g.add(P(G(P(chessPiece(k, w ? white : black), 0, 1.4, 0, 0, 0, PI / 2)), x, 2.3, z, 0, ry))
  // 木盒：两格，左格白子、右格黑子
  const box = G(tray(30, 6.4, 15, 0.8, frame), rbox(0.8, 5.6, 13.4, frame, { y: 0.8 }, 0.2))
  for (let i = 0; i < 9; i++) {
    const w = i % 2 === 0
    const x = w ? -12 + (i % 4) * 2.6 : 3 + (i % 4) * 2.6
    box.add(P(chessPiece(i % 3 === 0 ? 'p' : i % 3 === 1 ? 'n' : 'b', w ? white : black), x, 2.2, -3 + Math.floor(i / 4) * 3, 0, i * 0.7, PI / 2))
  }
  g.add(P(box, 0, 0, 29))
  g.add(rbox(30, 0.8, 15, shade(frame, -0.12), { x: -30, y: 0, z: 22 }, 0.3))
  return fit(g)
}

// ---------- 围棋 ----------

const GO_X = (i: number) => -41.4 * 0.45 + (i * 41.4 * 0.9) / 18
const GO_Z = (j: number) => -44.5 * 0.45 + (j * 44.5 * 0.9) / 18
const GO_B = '#26262a'
const GO_W = '#f8f6f0'

/**
 * 围棋：stones = [i, j, 黑?]；bowls：'closed' 棋罐盖着，'open' 盖子翻过来放在罐边（装提子）。
 * prisoners：每个盖子里的提子数。[棋盘木, 棋罐, 线色]
 */
function goState(p: string[], stones: [number, number, boolean][], bowls: 'closed' | 'open', prisoners = 0) {
  const [board, bowl, line] = p
  const g = new THREE.Group()
  g.add(rbox(42.4, 5, 45.5, board, {}, 0.6))
  const st: V2[] = [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
  g.add(paintTop(41.4, 44.5, `int-go-${board}-${line}`, drawGrid(board, line, 19, st, 0.05), 0, 5.3, 0))
  for (const [i, j, b] of stones) g.add(ball(1.1, b ? GO_B : GO_W, { x: GO_X(i), y: 5.8, z: GO_Z(j) }, [1, 0.45, 1]))
  for (const [s, c] of [[-1, GO_B], [1, GO_W]] as [number, string][]) {
    const x = s * 30.5
    g.add(ball(6.5, bowl, { x, y: 4.4, z: 14 }, [1, 0.68, 1]))
    if (bowls === 'closed') g.add(puck(5.4, 1.8, bowl, { x, y: 8, z: 14 }))
    else {
      // 罐口露出一堆棋子，盖子翻过来放在罐子后面，里面装着提子
      for (let k = 0; k < 7; k++) g.add(ball(1.1, c, { x: x + Math.cos(k) * (k ? 2.2 : 0), y: 8.6 + (k ? 0 : 0.5), z: 14 + Math.sin(k) * (k ? 2.2 : 0) }, [1, 0.45, 1]))
      g.add(cup(5.4, 4.6, 1.8, 0.4, bowl, { x, z: 0 }))
      const other = c === GO_B ? GO_W : GO_B
      for (let k = 0; k < prisoners; k++) g.add(ball(1.1, other, { x: x + Math.cos(k * 2.4) * Math.min(3.2, 0.9 * Math.sqrt(k)), y: 0.9 + (k > 10 ? 0.45 : 0), z: Math.sin(k * 2.4) * Math.min(3.2, 0.9 * Math.sqrt(k)) }, [1, 0.45, 1]))
    }
  }
  return fit(g)
}
const goEmpty = (p: string[]) => goState(p, [], 'closed')
const goOpening = (p: string[]) =>
  goState(p, [[3, 3, true], [15, 15, false], [15, 3, true], [3, 15, false], [16, 9, true], [2, 9, false], [5, 2, true], [13, 16, false], [9, 3, true], [15, 13, false], [16, 5, true]], 'open')
function goCounting(p: string[]) {
  // 终局数子：中间一条曲折的分界，黑占左、白占右；边上还有几块小的活棋
  const stones: [number, number, boolean][] = []
  for (let j = 0; j < 19; j++) {
    const b = 9 + Math.round(2.2 * Math.sin(j * 0.55))
    stones.push([b - 1, j, true], [b, j, false])
    if (j % 4 === 1) stones.push([b - 2, j, true])
    if (j % 5 === 2) stones.push([b + 1, j, false])
  }
  for (const [i, j] of [[3, 2], [4, 2], [4, 3], [3, 4], [2, 4]] as V2[]) stones.push([i, j, true])
  for (const [i, j] of [[15, 15], [14, 15], [14, 16], [16, 14], [15, 13]] as V2[]) stones.push([i, j, false])
  return goState(p, stones, 'open', 14)
}

// ---------- 将棋 ----------

/** 将棋盘（同旧素材贴图）+ 按 9 行字符图摆子：x = 自己的子、X = 自己的大子（王 / 飞 / 角），o / O 为对方 [棋盘木, 棋子木, 字色] */
function shogiState(p: string[], rows: string[], held: [number, number] = [0, 0], extra?: (g: THREE.Group) => void) {
  const [board, piece, ink] = p
  const g = new THREE.Group()
  const bw = 33.3
  const bd = 36.4
  g.add(rbox(bw, 3, bd, board, {}, 0.5))
  g.add(paintTop(31, 34, `int-shogi-${board}-${ink}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    const lw = Math.max(1, W * 0.004)
    for (let i = 0; i <= 9; i++) {
      c.fillRect((i / 9) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 9) * (H - lw), W, lw)
    }
    for (const [i, j] of [[3, 3], [6, 3], [3, 6], [6, 6]]) {
      c.beginPath()
      c.arc((i / 9) * W, (j / 9) * H, lw * 2.5, 0, PI * 2)
      c.fill()
    }
  }, 0, 3.3, 0))
  const koma = (x: number, y: number, z: number, mine: boolean, big: boolean) => {
    const r = big ? 1.65 : 1.45
    const m = cyl(r * 0.8, r, 0.8, piece, { x, y, z, ry: mine ? PI : 0 }, 5)
    m.scale.set(0.85, 1, 1)
    g.add(m, noOutline(rbox(0.8, 0.1, 1.1, ink, { x, y: y + 0.82, z }, 0.05)))
  }
  const cw = 31 / 9
  const ch = 34 / 9
  rows.forEach((row, j) =>
    [...row].forEach((ch0, i) => {
      if (ch0 === '.') return
      koma(-15.5 + cw * (i + 0.5), 3.3, -17 + ch * (j + 0.5), ch0.toLowerCase() === 'x', ch0 === 'X' || ch0 === 'O')
    }),
  )
  // 驹台：放持驹的小台，在各自右手边
  for (const [s, n] of [[1, held[0]], [-1, held[1]]] as [number, number][]) {
    if (!n) continue
    const x = s * 26
    const z = s * 11
    g.add(rbox(14, 1.6, 14, board, { x, y: 2.4, z }, 0.4))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.6, 2.4, 1.6, shade(board, -0.15), { x: x + sx * 5.5, z: z + sz * 5.5 }, 0.3))
    for (let k = 0; k < n; k++) koma(x - 4 + (k % 3) * 4, 4, z - 3 + Math.floor(k / 3) * 4, s > 0, false)
  }
  extra?.(g)
  return fit(g)
}
const SHOGI_MID = ['o.o.Oo.oo', '.O....oO.', 'o.oooo..o', '..o...o..', '.o..x..o.', '..x...x..', 'xx.xxx.xx', '.X.....X.', 'x.xxXx.xx']
const shogiMid = (p: string[]) => shogiState(p, SHOGI_MID, [3, 2])
const shogiTsume = (p: string[]) =>
  shogiState(p, ['...oO.o..', '.....o...', '....x.x..', '.X.......', '.........', '.........', '.........', '.........', '.........'], [2, 0], (g) => g.add(openBook('#e8e0cc', 'int-shogi-tsume-book', 0, 30, 0)))
/** 收好：棋盘上放着驹箱（木盒，盖子有一道浅槽）[棋盘木, 棋子木, 字色] */
function shogiBoxed(p: string[]) {
  const [board, piece] = p
  const g = new THREE.Group()
  g.add(rbox(33.3, 3, 36.4, board, {}, 0.5))
  g.add(paintTop(31, 34, `int-shogi-plain-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(board, -0.12)
    for (let i = 1; i < 6; i++) c.fillRect(0, (i / 6) * H, W, Math.max(1, H * 0.003))
  }, 0, 3.05, 0))
  g.add(rbox(10, 4.6, 7.4, shade(piece, -0.12), { y: 3, z: 0 }, 0.4), rbox(10.2, 1, 7.6, shade(piece, -0.2), { y: 7.2, z: 0 }, 0.3))
  g.add(rbox(4, 0.3, 1, shade(piece, -0.35), { y: 8.15 }, 0.1))
  return fit(g)
}

// ---------- 中国象棋 ----------

/** 中国象棋盘（同旧素材贴图）+ 摆子：pieces = [i, j, 红?]；taken = 两侧被吃的子数 [棋盘木, 红方, 黑方] */
function xqState(p: string[], pieces: [number, number, boolean][], taken: [number, number] = [0, 0]) {
  const [board, red, black] = p
  const g = new THREE.Group()
  const BW = 40
  const BD = 44
  g.add(rbox(BW, 1.6, BD, board, {}, 0.4))
  const gx = 4.2
  const gz = 4.3
  const x0 = -gx * 4
  const z0 = -gz * 4.5
  g.add(paintTop(BW - 1, BD - 1, `int-xq-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    const px = (i: number) => ((x0 + i * gx + (BW - 1) / 2) / (BW - 1)) * W
    const pz = (j: number) => ((z0 + j * gz + (BD - 1) / 2) / (BD - 1)) * H
    c.strokeStyle = '#3a2a20'
    c.lineWidth = Math.max(1, W * 0.004)
    for (let j = 0; j < 10; j++) {
      c.beginPath()
      c.moveTo(px(0), pz(j))
      c.lineTo(px(8), pz(j))
      c.stroke()
    }
    for (let i = 0; i < 9; i++) {
      c.beginPath()
      if (i === 0 || i === 8) {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(9))
      } else {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(4))
        c.moveTo(px(i), pz(5))
        c.lineTo(px(i), pz(9))
      }
      c.stroke()
    }
    for (const j of [0, 7]) {
      c.beginPath()
      c.moveTo(px(3), pz(j))
      c.lineTo(px(5), pz(j + 2))
      c.moveTo(px(5), pz(j))
      c.lineTo(px(3), pz(j + 2))
      c.stroke()
    }
    c.lineWidth = Math.max(1, W * 0.007)
    c.strokeRect(px(0) - W * 0.012, pz(0) - W * 0.012, px(8) - px(0) + W * 0.024, pz(9) - pz(0) + W * 0.024)
  }, 0, 1.9, 0))
  const piece = (x: number, y: number, z: number, side: string) => {
    g.add(puck(1.8, 1, '#f2dcb0', { x, y, z }))
    g.add(noOutline(torus(1.35, 0.1, side, { x, y: y + 1.02, z, rx: PI / 2 })))
    g.add(noOutline(rbox(1.1, 0.06, 0.25, side, { x, y: y + 1, z }, 0.03)), noOutline(rbox(0.25, 0.06, 1.1, side, { x, y: y + 1, z }, 0.03)))
  }
  for (const [i, j, r] of pieces) piece(x0 + i * gx, 1.6, z0 + j * gz, r ? red : black)
  // 被吃掉的子：在棋盘两侧叠成小摞（红方吃的黑子放红方右手边）
  for (const [s, n, col] of [[1, taken[0], black], [-1, taken[1], red]] as [number, number, string][])
    for (let k = 0; k < n; k++) piece(s * 23.5, Math.floor(k / 2) * 1, s * (8 + (k % 2) * 4), col)
  return fit(g)
}
const XQ_MID: [number, number, boolean][] = [
  [4, 9, true], [3, 9, true], [5, 9, true], [0, 9, true], [2, 7, true], [6, 9, true], [8, 8, true], [4, 7, true], [1, 5, true], [0, 6, true], [4, 5, true], [6, 6, true], [8, 6, true],
  [4, 0, false], [3, 0, false], [5, 1, false], [8, 0, false], [2, 2, false], [6, 0, false], [1, 4, false], [7, 2, false], [0, 3, false], [4, 3, false], [6, 3, false], [8, 3, false],
]
const xqMid = (p: string[]) => xqState(p, XQ_MID, [5, 3])
const xqEnd = (p: string[]) => xqState(p, [[4, 9, true], [3, 8, true], [2, 2, true], [5, 4, true], [3, 0, false], [4, 1, false], [7, 6, false], [6, 5, false]], [10, 11])
/** 收在盒里：木盒（盖子画一个「楚河汉界」的方格）+ 卷起来的布棋盘 [棋盘木, 红方, 黑方] */
function xqBoxed(p: string[]) {
  const [board, red, black] = p
  const g = G(rbox(22, 5.6, 12, shade(board, -0.12), {}, 0.5), rbox(22.2, 0.9, 12.2, shade(board, -0.22), { y: 5.2 }, 0.3))
  g.add(paintTop(18, 8, `int-xq-lid-${board}`, (c, W, H) => {
    c.fillStyle = shade(board, 0.05)
    c.fillRect(0, 0, W, H)
    c.fillStyle = red
    c.beginPath()
    c.arc(W * 0.3, H / 2, H * 0.3, 0, PI * 2)
    c.fill()
    c.fillStyle = black
    c.beginPath()
    c.arc(W * 0.7, H / 2, H * 0.3, 0, PI * 2)
    c.fill()
  }, 0, 6.15, 0))
  g.add(cylX(2.2, 30, '#f2e6cc', 0, 2.2, 11), torus(2.25, 0.25, red, { x: -10, y: 2.2, z: 11, ry: PI / 2 }), torus(2.25, 0.25, red, { x: 10, y: 2.2, z: 11, ry: PI / 2 }))
  return fit(g)
}

// ---------- 黑白棋 ----------

/** 黑白棋盘（同旧素材贴图）+ 棋子：cells = [i, j, 黑面朝上?]，i、j 为 0–7 [棋盘, 黑, 白] */
function reversiState(p: string[], cells: [number, number, boolean][]) {
  const [board, dark, light] = p
  const g = new THREE.Group()
  g.add(rbox(34, 1.6, 34, shade(board, -0.15), {}, 0.4))
  g.add(paintTop(32, 32, `int-reversi-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#1e2a1e'
    const lw = Math.max(1, W * 0.006)
    for (let i = 0; i <= 8; i++) {
      c.fillRect((i / 8) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 8) * (H - lw), W, lw)
    }
  }, 0, 1.9, 0))
  for (const [i, j, d] of cells) {
    const x = -14 + i * 4
    const z = -14 + j * 4
    g.add(cyl(1.6, 1.6, 0.2, d ? light : dark, { x, y: 1.9, z }, 20), cyl(1.6, 1.6, 0.2, d ? dark : light, { x, y: 2.1, z }, 20))
  }
  return fit(g)
}
const reversiOpening = (p: string[]) => reversiState(p, [[3, 3, false], [4, 4, false], [3, 4, true], [4, 3, true]])
function reversiFull(p: string[]) {
  const r = rng(64)
  const cells: [number, number, boolean][] = []
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) cells.push([i, j, i + j * 0.6 + r() * 4 < 7])
  return reversiState(p, cells)
}
/** 收在盒里：扁方盒，盖上画着黑白棋子 [棋盘, 黑, 白] */
function reversiBoxed(p: string[]) {
  const [board, dark, light] = p
  const g = G(rbox(30, 4, 30, board, {}, 0.5), rbox(30.2, 0.8, 30.2, shade(board, -0.15), { y: 3.4 }, 0.3))
  g.add(paintTop(27, 27, `int-reversi-lid-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    for (const [x, y, d] of [[0.38, 0.38, true], [0.62, 0.62, true], [0.62, 0.38, false], [0.38, 0.62, false]] as [number, number, boolean][]) {
      c.fillStyle = d ? dark : light
      c.beginPath()
      c.arc(x * W, y * H, W * 0.11, 0, PI * 2)
      c.fill()
    }
    c.fillStyle = light
    c.fillRect(W * 0.2, H * 0.86, W * 0.6, H * 0.03)
  }, 0, 4.25, 0))
  return fit(g)
}

// ---------- 跳棋 ----------

/** 跳棋盘（同旧素材贴图），返回孔位 [盘色, 星色, 点缀] */
function ccBoard(g: THREE.Group, plate: string, star: string) {
  g.add(cyl(21.6, 21.6, 1.6, plate, {}, 48))
  const sp = 1.9
  const holes: V2[] = []
  const tri = (q: number, r: number) => [sp * (q + r / 2), sp * r * (Math.sqrt(3) / 2)] as V2
  for (let q = -8; q <= 8; q++)
    for (let r = -8; r <= 8; r++) {
      const s = -q - r
      const inA = q >= -4 && r >= -4 && s >= -4
      const inB = q <= 4 && r <= 4 && s <= 4
      if (inA || inB) holes.push(tri(q, r))
    }
  g.add(paintTop(30, 30, `int-cc-${plate}-${star}`, (c, W, H) => {
    c.fillStyle = plate
    c.fillRect(0, 0, W, H)
    c.fillStyle = star
    const k = W / 30
    const pts: V2[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + PI / 2
      const rr = i % 2 ? 7.6 : 14.4
      pts.push([W / 2 + Math.cos(a) * rr * k, H / 2 + Math.sin(a) * rr * k])
    }
    c.beginPath()
    c.moveTo(...pts[0])
    for (const pt of pts) c.lineTo(...pt)
    c.fill()
    c.fillStyle = shade(star, -0.3)
    for (const [x, z] of holes) {
      c.beginPath()
      c.arc(W / 2 + x * k, H / 2 + z * k, k * 0.45, 0, PI * 2)
      c.fill()
    }
  }, 0, 1.9, 0))
  return holes
}
/** 对局中：三方的弹珠都走出了一部分，散在星盘各处 */
function ccPlaying(p: string[]) {
  const [plate, star, acc] = p
  const g = new THREE.Group()
  const holes = ccBoard(g, plate, star)
  const cols = [acc, '#f0c030', '#3fa05a']
  const r = rng(31)
  const used = new Set<number>()
  for (let k = 0; k < 30; k++) {
    let h = Math.floor(r() * holes.length)
    while (used.has(h)) h = (h + 7) % holes.length
    used.add(h)
    const [x, z] = holes[h]
    g.add(ball(0.75, cols[k % 3], { x, y: 2.15, z }))
  }
  return fit(g)
}
/** 收拾中：盘空了，弹珠都倒进旁边的小碗里 */
function ccTidy(p: string[]) {
  const [plate, star, acc] = p
  const g = new THREE.Group()
  ccBoard(g, plate, star)
  g.add(cup(5.5, 4, 4, 0.5, shade(plate, -0.1), { x: 27, z: 10 }))
  const cols = [acc, '#3d7fd0', '#f0c030', '#3fa05a', '#ffffff', '#26262a']
  for (let k = 0; k < 22; k++) {
    const a = k * 2.4
    const rr = Math.min(4, 0.9 * Math.sqrt(k))
    g.add(ball(0.75, cols[k % 6], { x: 27 + Math.cos(a) * rr, y: 1.3 + (k > 12 ? 1.2 : 0.2) + rr * 0.3, z: 10 + Math.sin(a) * rr }))
  }
  return fit(g)
}

// ---------- 双陆棋 ----------

/** 打开的双陆棋盒（同旧素材贴图）+ 按点位摆子：points = [点位 1–24, 枚数, 己方?] [框, 三角, 棋子] */
function bgmState(p: string[], points: [number, number, boolean][], dice = true) {
  const [frame, tri, chk] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(tray(24, 2.4, 38, 1, frame, { x: s * 12.2 }))
  g.add(cylZ(0.5, 36, METAL, 0, 0.6, 0, 8))
  for (const s of [-1, 1])
    g.add(paintTop(21.8, 35.8, `int-bgm-${frame}-${tri}`, (c, W, H) => {
      c.fillStyle = shade(frame, 0.35)
      c.fillRect(0, 0, W, H)
      for (let i = 0; i < 6; i++) {
        for (const top of [true, false]) {
          c.fillStyle = (i + (top ? 0 : 1)) % 2 ? tri : '#f2e6cc'
          const x = (i / 6) * W
          c.beginPath()
          if (top) {
            c.moveTo(x, 0)
            c.lineTo(x + W / 6, 0)
            c.lineTo(x + W / 12, H * 0.42)
          } else {
            c.moveTo(x, H)
            c.lineTo(x + W / 6, H)
            c.lineTo(x + W / 12, H * 0.58)
          }
          c.fill()
        }
      }
    }, s * 12.2, 1.3, 0))
  const pw = 21.8 / 6
  const other = '#f4f4f2'
  for (const [pt, n, mine] of points) {
    // 1–6 右下、7–12 左下、13–18 左上、19–24 右上
    const side = pt <= 6 || pt >= 19 ? 1 : -1
    const top = pt >= 13
    const i = pt <= 6 ? 6 - pt : pt <= 12 ? 12 - pt : pt <= 18 ? pt - 13 : pt - 19
    const x = side * 12.2 - 10.9 + pw * (i + 0.5)
    for (let k = 0; k < n; k++) g.add(cyl(1.5, 1.5, 0.6, mine ? chk : other, { x, y: 1 + Math.floor(k / 5) * 0.6, z: (top ? -1 : 1) * (17.9 - 1.5 - (k % 5) * 3) }, 18))
  }
  if (dice) g.add(P(die(1.4, '#ffffff', '#26262a', 5, 3, 0.4), 5, 1, 0), P(die(1.4, '#ffffff', '#26262a', 1, 2, -0.3), 8, 1, 1.5))
  return fit(g)
}
const bgmOpening = (p: string[]) =>
  bgmState(p, [[24, 2, true], [13, 5, true], [8, 3, true], [6, 5, true], [1, 2, false], [12, 5, false], [17, 3, false], [19, 5, false]], false)
/** 合上的双陆棋盒：手提箱样，盖面镶几道三角纹，前面搭扣、侧面提手 [框, 三角, 棋子] */
function bgmClosed(p: string[]) {
  const [frame, tri] = p
  const g = G(rbox(24.4, 2.6, 38, frame, {}, 0.6), rbox(24.4, 2.6, 38, shade(frame, -0.06), { y: 2.7 }, 0.6))
  g.add(paintTop(20, 33, `int-bgm-lid-${frame}-${tri}`, (c, W, H) => {
    c.fillStyle = shade(frame, 0.2)
    c.fillRect(0, 0, W, H)
    c.fillStyle = tri
    for (let i = 0; i < 6; i++) {
      c.beginPath()
      c.moveTo(0, (i / 6) * H)
      c.lineTo(W * 0.4, ((i + 0.5) / 6) * H)
      c.lineTo(0, ((i + 1) / 6) * H)
      c.fill()
      c.beginPath()
      c.moveTo(W, (i / 6) * H)
      c.lineTo(W * 0.6, ((i + 0.5) / 6) * H)
      c.lineTo(W, ((i + 1) / 6) * H)
      c.fill()
    }
  }, 0, 5.4, 0))
  for (const z of [-8, 8]) g.add(rbox(1, 2.6, 2.4, METAL, { x: 12.5, y: 1.4, z }, 0.3))
  g.add(cylZ(0.6, 10, METAL, -14, 2.7, 0, 8), rbox(2.6, 1, 1, METAL, { x: -13, y: 2.2, z: -5 }, 0.2), rbox(2.6, 1, 1, METAL, { x: -13, y: 2.2, z: 5 }, 0.2))
  return fit(g)
}

// ---------- 扑克 ----------

/** 扑克牌背：白边 + 牌背色菱格 */
const pokerBack = (back: string): Draw => (c, W, H) => {
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, W, H)
  c.fillStyle = back
  c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
  c.strokeStyle = 'rgba(255,255,255,0.45)'
  c.lineWidth = Math.max(1, W * 0.02)
  for (let k = -6; k < 12; k++) {
    c.beginPath()
    c.moveTo(W * 0.08 + k * W * 0.12, H * 0.06)
    c.lineTo(W * 0.08 + (k + 6) * W * 0.12, H * 0.94)
    c.moveTo(W * 0.08 + (k + 6) * W * 0.12, H * 0.06)
    c.lineTo(W * 0.08 + k * W * 0.12, H * 0.94)
    c.stroke()
  }
}
/** 扑克牌盒：小纸盒，盒面一个大黑桃 */
function pokerBox(back: string, open = false) {
  const g = G(rbox(6.8, 2, 9.4, back, {}, 0.2))
  g.add(decal(paintTop(6.2, 8.8, `int-pokerbox-${back}`, (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffff'
    c.lineWidth = W * 0.04
    c.strokeRect(W * 0.1, H * 0.08, W * 0.8, H * 0.84)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${Math.floor(H * 0.4)}px serif`
    c.fillText('♠', W / 2, H * 0.52)
  }, 0, 2.02, 0)))
  if (open) g.add(rbox(6.8, 0.2, 3, back, { y: 0.9, z: 6, rx: 0.5 }, 0.08))
  return g
}
/** 筹码一摞 */
function chipStack(g: THREE.Group, x: number, z: number, n: number, c: string, stripe: string, y = 0) {
  g.add(cyl(2, 2, n * 0.34, c, { x, y, z }, 20))
  for (let k = 1; k < n; k += 2) g.add(noOutline(cyl(2.02, 2.02, 0.12, stripe, { x, y: y + k * 0.34, z }, 20)))
}
/** 收在盒里：扑克牌盒 + 合上的筹码箱 [桌垫, 牌背, 筹码主色] */
function pokerBoxed(p: string[]) {
  const [, back, chip] = p
  const g = new THREE.Group()
  g.add(P(pokerBox(back), -9, 0, 2, 0, 0.15))
  const cs = G(rbox(18, 6, 12, '#c8ccd2', {}, 0.8), rbox(18.2, 0.6, 12.2, '#9a9ea6', { y: 3 }, 0.2), rbox(6, 1.2, 1.2, '#26262a', { y: 2.2, z: 6.4 }, 0.4))
  cs.add(rbox(8, 0.3, 4, chip, { y: 6, z: -2 }, 0.1))
  g.add(P(cs, 5, 0, 0))
  return fit(g)
}
/** 整副叠放：理齐的一副牌 + 打开的空盒 + 几摞筹码 [桌垫, 牌背, 筹码主色] */
function pokerDeck(p: string[]) {
  const [, back, chip] = p
  const g = new THREE.Group()
  g.add(P(cardStack(6.3, 8.8, 20, '#ffffff', back, `int-poker-deck-${back}`, pokerBack(back)), -4, 0, 0, 0, 0.1))
  g.add(P(pokerBox(back, true), 4.5, 0, -1, 0, -0.3))
  chipStack(g, 12, 3, 10, chip, '#ffffff')
  chipStack(g, 12.5, -2, 7, '#ffffff', chip)
  return fit(g)
}
/** 发牌中：毡垫上牌堆居中，四家面前各发了两张（背面朝上），旁边是筹码 [桌垫, 牌背, 筹码主色] */
function pokerDealing(p: string[]) {
  const [mat, back, chip] = p
  const g = new THREE.Group()
  g.add(rbox(44, 0.3, 36, mat, {}, 0.15))
  const y = 0.3
  g.add(P(cardStack(6.3, 8.8, 14, '#ffffff', back, `int-poker-deck-${back}`, pokerBack(back)), 0, y, 0, 0, 0.3))
  const seats: [number, number, number][] = [[0, 12.5, 0], [17, 0, PI / 2], [0, -12.5, PI], [-17, 0, -PI / 2]]
  seats.forEach(([x, z, ry], i) => {
    for (let k = 0; k < 2; k++) {
      const cd = card(6.3, 8.8, '#ffffff', `int-pokerback-${back}`, pokerBack(back), 0.12)
      g.add(P(G(P(cd, (k - 0.5) * 3.2, k * 0.13, 0, 0, (k - 0.5) * 0.25)), x, y, z, 0, ry))
    }
    chipStack(g, x + (i % 2 ? 0 : 9) * (i === 2 ? -1 : 1), z + (i % 2 ? 9 : 0) * (i === 1 ? -1 : 1), 4 + i * 2, i % 2 ? '#ffffff' : chip, i % 2 ? chip : '#ffffff', y)
  })
  // 发到一半：一张牌正滑向下家
  g.add(P(card(6.3, 8.8, '#ffffff', `int-pokerback-${back}`, pokerBack(back), 0.12), 8, y, 5, 0, 1.1))
  return fit(g)
}

// ---------- 花札 ----------

const hanaBack = (back: string): Draw => (c, W, H) => {
  c.fillStyle = back
  c.fillRect(0, 0, W, H)
}
/** 花札纸盒：一红一黑两盒（两副），盒面贴白色标签 */
function hanaBox(back: string, x: number, z: number, ry = 0) {
  const g = G(rbox(4.4, 2.6, 6.4, back, {}, 0.2))
  g.add(decal(paintTop(4, 6, `int-hanabox-${back}`, (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#f6f0e1'
    c.fillRect(W * 0.18, H * 0.18, W * 0.64, H * 0.64)
    c.fillStyle = '#c8302a'
    c.beginPath()
    c.arc(W / 2, H * 0.42, W * 0.16, 0, PI * 2)
    c.fill()
    c.fillStyle = '#26262a'
    c.fillRect(W * 0.3, H * 0.62, W * 0.4, H * 0.05)
  }, 0, 2.62, 0)))
  return P(g, x, 0, z, 0, ry)
}
/** 收在盒里：红黑两盒并排 [牌背, 主色, 点缀] */
function hanaBoxed(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(hanaBox(back, -2.6, 0, 0.05), hanaBox(back === '#26262a' ? '#c8302a' : '#26262a', 2.6, 0.3, -0.08))
  return fit(g)
}
/** 整副叠放：理齐的一叠（48 张）+ 打开的空盒 [牌背, 主色, 点缀] */
function hanaStack(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(P(cardStack(3.3, 5.4, 22, '#26262a', back, `int-hana-back-${back}`, hanaBack(back)), -3, 0, 0, 0, 0.08))
  const box = G(tray(4.4, 2.2, 6.4, 0.3, back), rbox(4.4, 0.3, 6.4, back, { x: 4.6, z: 0 }, 0.1))
  g.add(P(box, 3.5, 0, 0.4, 0, -0.15))
  return fit(g)
}
/** 发牌中：中间牌山，场上 8 张背面朝上两排，两家手里各 8 张背面朝上叠成扇形 [牌背, 主色, 点缀] */
function hanaDealing(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(P(cardStack(3.3, 5.4, 12, '#26262a', back, `int-hana-back-${back}`, hanaBack(back)), -9, 0, 0))
  const r = rng(5)
  for (let k = 0; k < 8; k++) g.add(P(card(3.3, 5.4, '#26262a', `int-hana-b1-${back}`, hanaBack(back), 0.08), -3 + (k % 4) * 4, 0, -3.2 + Math.floor(k / 4) * 6.4, 0, (r() - 0.5) * 0.2))
  for (const [z, ry] of [[10, 0], [-10, PI]] as [number, number][])
    for (let k = 0; k < 8; k++) g.add(P(G(P(card(3.3, 5.4, '#26262a', `int-hana-b1-${back}`, hanaBack(back), 0.08), 0, 0, -2.4)), (k - 3.5) * 1.3 * (ry ? -1 : 1), k * 0.09, z, 0, ry + (k - 3.5) * 0.12))
  return fit(g)
}

// ---------- UNO 风卡牌 ----------

const unoBack = (back: string): Draw => (c, W, H) => {
  c.fillStyle = '#26262a'
  c.fillRect(0, 0, W, H)
  c.fillStyle = back
  c.beginPath()
  c.ellipse(W / 2, H / 2, W * 0.32, H * 0.38, 0.5, 0, PI * 2)
  c.fill()
}
/** 收在盒里：长方纸盒，盒面四色色块 [牌背, 桌垫] */
function unoBoxed(p: string[]) {
  const [back] = p
  const g = G(rbox(6.6, 3.4, 9.6, back, {}, 0.3))
  g.add(decal(paintTop(6.2, 9.2, `int-unobox-${back}`, (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
    UNO_COLS.forEach((col, i) => {
      c.fillStyle = col
      c.fillRect(W * (0.15 + (i % 2) * 0.36), H * (0.2 + Math.floor(i / 2) * 0.3), W * 0.34, H * 0.28)
    })
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.ellipse(W / 2, H * 0.5, W * 0.22, H * 0.12, -0.4, 0, PI * 2)
    c.fill()
  }, 0, 3.42, 0)))
  return fit(g)
}
/** 发牌中：牌堆 + 翻开的第一张，三家面前各一叠 7 张背面朝上 [牌背, 桌垫] */
function unoDealing(p: string[]) {
  const [back, mat] = p
  const g = new THREE.Group()
  g.add(rbox(44, 0.3, 32, mat, {}, 0.15))
  const y = 0.3
  g.add(P(cardStack(5.7, 8.8, 26, '#ffffff', back, `int-uno-deal-${back}`, unoBack(back)), -3.5, y, 0))
  g.add(P(card(5.7, 8.8, '#ffffff', `int-pc-${UNO_COLS[2]}-7`, drawPlayCard(UNO_COLS[2], 7)), 3.5, y, 0, 0, 0.2))
  for (const [x, z, ry] of [[0, 10.5, 0], [-15, -4, PI / 2], [15, -4, -PI / 2]] as [number, number, number][])
    g.add(P(cardStack(5.7, 8.8, 7, '#ffffff', back, `int-uno-deal-${back}`, unoBack(back)), x, y, z, 0, ry + 0.1))
  return fit(g)
}

// ---------- 百人一首 ----------

/** 收在盒里：黑漆盒，盖子一道彩色边 [榻榻米, 牌边, 字色] */
function karutaBoxed(p: string[]) {
  const [, edge, ink] = p
  const g = G(rbox(20, 6.4, 13.6, ink, {}, 0.6), rbox(20.3, 1.6, 13.9, edge, { y: 5.2 }, 0.4), rbox(20.1, 0.4, 13.7, ink, { y: 6.6 }, 0.2))
  g.add(paintTop(10, 5, `int-karuta-lid-${edge}`, (c, W, H) => {
    c.fillStyle = '#e3c06a'
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    c.fillRect(W * 0.1, H * 0.4, W * 0.8, H * 0.2)
  }, 0, 7.02, 0))
  return fit(g)
}
/** 整叠：读札（带画的那叠）和取札两叠理好，盒子开着放在旁边 [榻榻米, 牌边, 字色] */
function karutaStacks(p: string[]) {
  const [, edge, ink] = p
  const g = new THREE.Group()
  g.add(P(cardStack(5.3, 7.4, 36, edge, '#f6f0e1', `int-karuta-yomi-${edge}`, (c, W, H) => {
    c.fillStyle = edge
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#fbf6e8'
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = '#c8473a'
    c.beginPath()
    c.arc(W / 2, H * 0.32, W * 0.2, 0, PI * 2)
    c.fill()
    c.fillStyle = ink
    for (let k = 0; k < 3; k++) c.fillRect(W * (0.25 + k * 0.2), H * 0.55, W * 0.06, H * 0.32)
  }), -8, 0, 0, 0, 0.05))
  g.add(P(cardStack(5.3, 7.4, 36, edge, '#f6f0e1', `int-karuta-tori-${edge}`, (c, W, H) => {
    c.fillStyle = edge
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#fbf6e8'
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = ink
    for (let k = 0; k < 3; k++) c.fillRect(W * (0.22 + k * 0.22), H * 0.14, W * 0.07, H * 0.7)
  }), -1.5, 0, 0.4, 0, -0.06))
  g.add(P(G(tray(20, 4, 13.6, 0.6, ink), rbox(0.6, 3.4, 12.4, ink, { y: 0.6 }, 0.2)), 12, 0, 0))
  return fit(g)
}

// ---------- 麻将 ----------

const MJ_TW = 2.6
const MJ_TH = 3.5
const MJ_TT = 1.9

/** 麻将桌本体（同旧素材）：桌面毡高 71.5 [桌框, 桌布] */
function mjTable(g: THREE.Group, frame: string, felt: string) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 68, 5, frame, { x: sx * 38, z: sz * 38 }, 1))
  g.add(rbox(88, 3, 88, frame, { y: 68 }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(88, 2.4, 4, frame, { y: 71, z: s * 42 }, 0.8))
    g.add(rbox(4, 2.4, 80, frame, { x: s * 42, y: 71 }, 0.8))
  }
  g.add(rbox(80, 0.5, 80, felt, { y: 71 }, 0.2))
}
/** 一段牌墙：n 墩 × 2 层，背面朝上；底面中心在原点，沿 x 排开，墙面朝 +z */
function mjWall(n: number, back: string) {
  const L = n * MJ_TW
  const side = new THREE.Group()
  for (let l = 0; l < 2; l++) {
    side.add(rbox(L, 1.2, MJ_TH, IVORY, { y: l * MJ_TT }, 0.25))
    side.add(rbox(L, 0.7, MJ_TH, back, { y: l * MJ_TT + 1.2 }, 0.25))
  }
  side.add(paintPanel(L, 3.8, `int-mj-wall${n}-${back}`, (c, W, H) => {
    c.fillStyle = IVORY
    c.fillRect(0, 0, W, H)
    c.fillStyle = back
    c.fillRect(0, 0, W, H * 0.18)
    c.fillRect(0, H * 0.5, W, H * 0.18)
    c.fillStyle = 'rgba(0,0,0,0.25)'
    for (let i = 1; i < n; i++) c.fillRect((i * W) / n, 0, 1, H)
    c.fillRect(0, H * 0.5 - 1, W, 1)
  }, { y: 0, z: MJ_TH / 2 + 0.3 }))
  return side
}
/** 四条牌墙风车形围成方框：每条的一端顶着相邻那条的侧面，各自歪一点、错开一点，互不重叠（见 pinwheelWalls） */
function mjRing(g: THREE.Group, n: number, back: string, y: number, seed: number) {
  for (const w of pinwheelWalls(n * MJ_TW, MJ_TH, seed)) g.add(P(mjWall(n, back), w.x, y, w.z, 0, w.ry))
}
/** 洗牌用的散牌：背面朝上随意散在 (cx, cz) 周围半径 rad 的范围里 */
function mjScatter(g: THREE.Group, back: string, y: number, rad: number, n: number, seed: number) {
  const r = rng(seed)
  const step = 3.6
  const cells: V2[] = []
  for (let x = -rad; x <= rad; x += step) for (let z = -rad; z <= rad; z += step) if (Math.hypot(x, z) < rad) cells.push([x, z])
  for (let k = 0; k < Math.min(n, cells.length); k++) {
    const idx = Math.floor(r() * cells.length)
    const [x, z] = cells.splice(idx, 1)[0]
    const t = G(rbox(MJ_TW, 1.2, MJ_TH, IVORY, {}, 0.25), rbox(MJ_TW, 0.7, MJ_TH, back, { y: 1.2 }, 0.25))
    g.add(P(t, x + (r() - 0.5) * 0.8, y + (k % 4) * 0.01, z + (r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.7))
  }
}
/** 洗牌中：牌全部背面朝上散在桌中间 [桌框, 桌布, 牌背] */
function mjShuffle(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  mjTable(g, frame, felt)
  mjScatter(g, back, 71.5, 30, 110, 3)
  return g
}
/** 砌好牌墙：四面各 17 墩 × 2 层，中间两颗骰子 [桌框, 桌布, 牌背] */
function mjWalls(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  mjTable(g, frame, felt)
  mjRing(g, 17, back, 71.5, 5)
  g.add(rbox(9, 0.6, 9, DARK, { y: 71.5 }, 0.3))
  for (const [x, z] of [[-1.2, 0.5], [1.4, -0.8]] as V2[]) g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x, y: 72.1, z }, 0.3))
  return g
}
/** 和牌摊开：牌墙剩一部分，各家舍牌三排；和了的那家手牌 14 张推倒、牌面朝上，其余三家立着 [桌框, 桌布, 牌背] */
function mjWin(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  mjTable(g, frame, felt)
  const fy = 71.5
  const walls = [9, 5, 12, 7]
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group()
    side.add(P(mjWall(walls[k], back), -((17 - walls[k]) * MJ_TW) / 2, 0, 18))
    // 舍牌：三排 6 张，牌面朝上
    side.add(rbox(6 * MJ_TW, 0.7, 3 * MJ_TH, back, { z: 9 }, 0.25))
    side.add(rbox(6 * MJ_TW, 1.2, 3 * MJ_TH, IVORY, { y: 0.7, z: 9 }, 0.25))
    side.add(paintTop(6 * MJ_TW - 0.2, 3 * MJ_TH - 0.2, `int-mj-river3-${k}`, drawTiles(6, 3, 70 + k, IVORY), 0, 2.2, 9))
    const HL = (k === 0 ? 14 : 13) * MJ_TW
    if (k === 0) {
      // 推倒的手牌：平躺，牌面朝上
      side.add(rbox(HL, 0.7, MJ_TH, back, { z: 32.6 }, 0.25), rbox(HL, 1.2, MJ_TH, IVORY, { y: 0.7, z: 32.6 }, 0.25))
      side.add(paintTop(HL - 0.2, MJ_TH - 0.2, 'int-mj-win-hand', drawTiles(14, 1, 99, IVORY), 0, 1.92, 32.6))
    } else {
      side.add(rbox(HL, MJ_TH, 1.2, IVORY, { z: 33.4 }, 0.25))
      side.add(rbox(HL, MJ_TH, 0.7, back, { z: 32.45 }, 0.25))
      side.add(paintPanel(HL - 0.2, MJ_TH - 0.2, `int-mj-hand-${k}`, drawTiles(13, 1, 30 + k, IVORY), { y: 0.1, z: 34.3 }))
    }
    g.add(P(side, 0, fy, 0, 0, (k * PI) / 2))
  }
  g.add(rbox(9, 0.6, 9, DARK, { y: fy }, 0.3))
  return g
}

/** 麻将牌箱（皮面手提箱，合上）[桌垫, 牌背, 箱色] */
function mjCase(p: string[]) {
  const [, back, box] = p
  const g = G(rbox(38, 10, 24, box, {}, 1.2), rbox(38.2, 0.8, 24.2, shade(box, -0.2), { y: 6.4 }, 0.3))
  for (const x of [-12, 12]) g.add(rbox(3, 2.4, 0.8, METAL, { x, y: 5.4, z: 12.2 }, 0.3))
  g.add(P(torus(5, 0.7, shade(box, -0.25), {}, PI), 0, 10, 0))
  for (const x of [-5, 5]) g.add(rbox(2, 1, 2, METAL, { x, y: 10, z: 0 }, 0.3))
  g.add(rbox(6, 0.3, 3, back, { x: 0, y: 10, z: 7 }, 0.1))
  return fit(g)
}
/** 牌垫上洗牌：方形毡垫，牌背面朝上散开 [桌垫, 牌背, 箱色] */
function mjMatShuffle(p: string[]) {
  const [mat, back] = p
  const g = G(rbox(70, 0.4, 70, mat, {}, 0.2))
  mjScatter(g, back, 0.4, 24, 80, 9)
  g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x: 30, y: 0.4, z: 30 }, 0.3), rbox(1.4, 1.4, 1.4, '#ffffff', { x: 28, y: 0.4, z: 31.5, ry: 0.5 }, 0.3))
  return fit(g)
}
/** 牌垫上砌好牌墙：四面各 17 墩 [桌垫, 牌背, 箱色] */
function mjMatWalls(p: string[]) {
  const [mat, back] = p
  const g = G(rbox(70, 0.4, 70, mat, {}, 0.2))
  mjRing(g, 17, back, 0.4, 9)
  for (const [x, z] of [[-1.2, 0.5], [1.4, -0.8]] as V2[]) g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x, y: 0.4, z }, 0.3))
  return fit(g)
}

// ---------- 素材声明 ----------

const CHESS_P: PalFlat[] = [['modern', '#3d3f44', '#f4f4f2', '#26262a'], ['retro', R.caramel, R.cream, '#5a3a24'], ['nordic', N.oak, N.white, '#5a5f66'], ['cute', C.woodL, C.white, C.pink]]
const GO_P: PalFlat[] = [['japanese', '#e8c87a', J.dark, J.sumi], ['japanese', J.hinoki, '#5a2e22', J.sumi], ['nordic', N.oak, N.white, '#3a3a3a']]
const SHOGI_P: PalFlat[] = [['japanese', '#e8c87a', '#f0d9a0', J.sumi], ['japanese', J.hinoki, '#f6e2b0', J.sumi], ['retro', R.caramel, R.cream, '#3a2a22']]
const MJ_P: PalFlat[] = [['retro', R.caramel, '#2f8a5a', R.orange], ['modern', '#26262a', '#3d6fb8', '#3d6fb8'], ['japanese', J.dark, '#3f7a4a', '#2f8a5a'], ['cute', C.woodL, C.mint, C.pink]]
const MJSET_P: PalFlat[] = [['retro', '#2f8a5a', R.orange, R.caramel], ['modern', '#3d6fb8', '#3d6fb8', '#26262a'], ['japanese', '#3f7a4a', '#2f8a5a', J.dark], ['cute', C.mint, C.pink, C.woodL]]
const POKER_P: PalFlat[] = [['retro', '#2f6a4a', '#c8473a', '#c8473a'], ['modern', '#26262a', '#3d6fb8', '#3d6fb8'], ['industrial', '#3a5a3c', '#7a2a22', I.rust]]
const UNO_P: PalFlat[] = [['retro', '#c8473a', '#2f6a4a'], ['modern', '#26262a', '#3d3f44'], ['cute', C.pink, C.sky]]
const XQ_P: PalFlat[] = [['retro', '#e8c87a', '#c8302a', '#26262a'], ['nordic', N.oakL, '#c8302a', '#26262a'], ['japanese', J.hinoki, '#c8302a', J.sumi]]
const REV_P: PalFlat[] = [['modern', '#3f8a4a', '#26262a', '#f4f4f2'], ['retro', '#2f7a4a', '#26262a', R.cream], ['cute', '#8fcf9a', '#5a4646', '#ffffff']]
const CC_P: PalFlat[] = [['retro', R.caramel, R.cream, R.red], ['nordic', N.oak, N.white, '#c8473a'], ['cute', C.woodL, C.sakura, C.pink]]
const BGM_P: PalFlat[] = [['retro', '#7a4a2a', R.red, R.red], ['industrial', I.walnut, '#3a3a3c', '#26262a'], ['nordic', N.oak, N.blue, N.blue]]
const HANA_P: PalFlat[] = [['japanese', '#c8302a', '#f2e6cc', J.shu], ['japanese', '#26262a', '#cfe0f0', '#8a4fb0'], ['retro', R.red, R.cream, R.mustard]]
const KARUTA_P: PalFlat[] = [['japanese', J.tatami, '#3a6a4a', J.sumi], ['japanese', '#d0d49a', '#c8302a', J.sumi], ['retro', '#c9c48a', R.teal, '#3a2a22']]

const st = (family: string, sizeLabel: string) => ({ ...PROP, family, sizeLabel })

export const INT_GAME_STATES: AssetDef[] = [
  // 国际象棋（旧：int-chess-opening = 开局、int-chess = 中盘）
  def('int-chess-boxed', '国际象棋', 'hobby', [30, 15, 7.5], CHESS_P, chessBoxed, st('int-chess', '收在盒里')),
  def('int-chess-folded', '国际象棋', 'hobby', [36, 19.1, 5.6], CHESS_P, chessFolded, st('int-chess', '棋盘合上')),
  def('int-chess-endgame', '国际象棋', 'hobby', [61.3, 36, 8.8], CHESS_P, chessEndgame, st('int-chess', '残局')),
  def('int-chess-study', '国际象棋', 'hobby', [64.4, 36, 8.8], CHESS_P, chessStudy, st('int-chess', '复盘摆谱')),
  def('int-chess-messy', '国际象棋', 'hobby', [63, 54.5, 8.8], CHESS_P, chessMessy, st('int-chess', '收拾中')),
  // 围棋（旧：int-go = 中盘）
  def('int-go-empty', '围棋', 'hobby', [74, 45.5, 9.8], GO_P, goEmpty, st('int-go', '空盘 + 棋罐')),
  def('int-go-opening', '围棋', 'hobby', [74, 45.5, 9.6], GO_P, goOpening, st('int-go', '布局')),
  def('int-go-counting', '围棋', 'hobby', [74, 45.5, 9.6], GO_P, goCounting, st('int-go', '终局数子')),
  // 将棋（旧：int-shogi = 开局）
  def('int-shogi-mid', '将棋', 'hobby', [66, 36.4, 4.9], SHOGI_P, shogiMid, st('int-shogi', '中盘（持驹）')),
  def('int-shogi-tsume', '将棋', 'hobby', [49.6, 57, 4.9], SHOGI_P, shogiTsume, st('int-shogi', '诘将棋')),
  def('int-shogi-boxed', '将棋', 'hobby', [33.3, 36.4, 8.5], SHOGI_P, shogiBoxed, st('int-shogi', '收好（驹箱）')),
  // 中国象棋（旧：int-xiangqi = 开局）
  def('int-xiangqi-mid', '中国象棋', 'hobby', [50.6, 44, 3.1], XQ_P, xqMid, st('int-xiangqi', '中盘')),
  def('int-xiangqi-end', '中国象棋', 'hobby', [50.6, 44, 6.1], XQ_P, xqEnd, st('int-xiangqi', '残局')),
  def('int-xiangqi-boxed', '中国象棋', 'hobby', [30, 19.6, 6.5], XQ_P, xqBoxed, st('int-xiangqi', '收在盒里')),
  // 黑白棋（旧：int-reversi = 中盘）
  def('int-reversi-opening', '黑白棋', 'hobby', [34, 34, 2.3], REV_P, reversiOpening, st('int-reversi', '开局四子')),
  def('int-reversi-full', '黑白棋', 'hobby', [34, 34, 2.3], REV_P, reversiFull, st('int-reversi', '终局铺满')),
  def('int-reversi-boxed', '黑白棋', 'hobby', [30.2, 30.2, 4.3], REV_P, reversiBoxed, st('int-reversi', '收在盒里')),
  // 跳棋（旧：int-chinese-checkers = 开局）
  def('int-chinese-checkers-playing', '跳棋', 'hobby', [43.2, 43.2, 2.9], CC_P, ccPlaying, st('int-chinese-checkers', '对局中')),
  def('int-chinese-checkers-tidy', '跳棋', 'hobby', [54.1, 43.2, 4.5], CC_P, ccTidy, st('int-chinese-checkers', '收拾中')),
  // 双陆棋（旧：int-backgammon = 对局中）
  def('int-backgammon-opening', '双陆棋', 'hobby', [48.4, 38, 2.4], BGM_P, bgmOpening, st('int-backgammon', '开局')),
  def('int-backgammon-closed', '双陆棋', 'hobby', [27.6, 38, 5.4], BGM_P, bgmClosed, st('int-backgammon', '合上')),
  // 扑克（旧：int-poker = 对局中）
  def('int-poker-boxed', '扑克牌', 'hobby', [27.1, 13.2, 6.3], POKER_P, pokerBoxed, st('int-poker', '收在盒里')),
  def('int-poker-deck', '扑克牌', 'hobby', [22.1, 13.4, 3.4], POKER_P, pokerDeck, st('int-poker', '整副叠放')),
  def('int-poker-dealing', '扑克牌', 'hobby', [44, 36, 3.7], POKER_P, pokerDealing, st('int-poker', '发牌中')),
  // 花札（旧：int-hanafuda = 对局中）
  def('int-hanafuda-boxed', '花札', 'japanese', [10, 6.9, 2.6], HANA_P, hanaBoxed, st('int-hanafuda', '收在盒里')),
  def('int-hanafuda-stack', '花札', 'japanese', [15.5, 7.6, 2.2], HANA_P, hanaStack, st('int-hanafuda', '整副叠放')),
  def('int-hanafuda-dealing', '花札', 'japanese', [21.5, 21.9, 1], HANA_P, hanaDealing, st('int-hanafuda', '发牌中')),
  // UNO 风卡牌（旧：int-uno-cards = 一副 + 摊开、int-card-game = 对局中）
  def('int-uno-boxed', '彩色数字卡牌', 'hobby', [6.6, 9.6, 3.4], UNO_P, unoBoxed, st('int-uno', '收在盒里')),
  def('int-uno-dealing', '彩色数字卡牌', 'hobby', [44, 32, 2.4], UNO_P, unoDealing, st('int-uno', '发牌中')),
  // 百人一首（旧：int-karuta = 摆开对局）
  def('int-karuta-boxed', '百人一首（かるた）', 'japanese', [20.3, 13.9, 7], KARUTA_P, karutaBoxed, st('int-karuta', '收在盒里')),
  def('int-karuta-stack', '百人一首（かるた）', 'japanese', [32.8, 13.6, 4], KARUTA_P, karutaStacks, st('int-karuta', '整叠')),
  // 自动麻将桌（旧：int-mahjong-table = 打牌中）
  def('int-mahjong-shuffle', '自动麻将桌', 'hobby', [88, 88, 73.4], MJ_P, mjShuffle, { surface: 71.5, family: 'int-mahjong-table', sizeLabel: '洗牌中' }),
  def('int-mahjong-walls', '自动麻将桌', 'hobby', [88, 88, 75.3], MJ_P, mjWalls, { surface: 71.5, family: 'int-mahjong-table', sizeLabel: '砌好牌墙' }),
  def('int-mahjong-win', '自动麻将桌', 'hobby', [88, 88, 75.3], MJ_P, mjWin, { surface: 71.5, family: 'int-mahjong-table', sizeLabel: '和牌摊开' }),
  // 麻将牌（桌面用）
  def('int-mahjong-case', '麻将牌', 'hobby', [38.2, 24.7, 15.7], MJSET_P, mjCase, st('int-mahjong-set', '收在牌箱里')),
  def('int-mahjong-mat-shuffle', '麻将牌', 'hobby', [70, 70, 2.3], MJSET_P, mjMatShuffle, st('int-mahjong-set', '牌垫上洗牌')),
  def('int-mahjong-mat-walls', '麻将牌', 'hobby', [70, 70, 4.2], MJSET_P, mjMatWalls, st('int-mahjong-set', '牌垫上砌牌墙')),
]
