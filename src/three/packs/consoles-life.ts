// 游戏主机 / 掌机 / 手柄 / 生活气息小物 素材包。
// 原点在占地中心底面，正面朝 +z。全部是 prop（主机放电视柜上，掌机放桌上 / 沙发边 / 床头）。
// build 统一经过 fit()：按实际包围盒把模型挪到「x/z 居中、底面贴 y = 0」，w/d/h 与包围盒一致。
// 主机、掌机只用形体特征区分风格（PS5 风的双翼、Series X 风的顶部散热孔、GBA SP 风的翻盖…），不写任何商标文字。
// 屏幕画面用 paintPanel 画像素小画面；玻璃、水、透明外壳是半透明材质（不描边）。

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, S, G, glow, holePanel, paintPanel, rng, slab, type AssetCategory, type AssetDef, type Hole, type Poly } from '../kit'
import { P, PI, cylX, cylZ, fitGroup, ghost, lit, noOutline, type V3 } from '../geo'
import { J, M, N, R, type Pal } from '../packkit'

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

const BLACK = '#1f2024'
const DARK = '#2c2e34'
const RUBBER = '#3a3b40'
const BLUE = '#6fd3ff'
const RED_LED = '#ff6b6b'
const GLASS = '#dff3ff'
const GLASS_A = 0.26
const WATER = '#a8dcf2'
const WATER_A = 0.34
const ROOT = '#f4efe0'
const SOIL = '#6b4a35'
const FACE4 = ['#6fd3a8', '#ff8f86', '#8fb8ff', '#ffb3e0']

// ---------- 定义 ----------

function def(
  id: string,
  name: string,
  category: AssetCategory,
  [w, d, h]: [number, number, number],
  pals: Pal[],
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
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build: (p) => fitGroup(build(p)),
    prop: true,
    ...extra,
  }
}

// ---------- 小工具 ----------

/** 指示灯小球 */
const led = (x: number, y: number, z: number, color: string, r = 0.25) => lit(ball(r, color, { x, y, z }), color, 0.9)

/** 平放的画面（掌机屏幕），中心 (x, z)，y 为画面高度 */
const flatScreen = (w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number, k = 0.5) => paintPanel(w, d, key, draw, { x, y, z: z + d / 2, rx: -PI / 2 }, k)
/** 竖直的画面，朝 +z，y 为底边 */
const vScreen = (w: number, h: number, key: string, draw: Draw, x: number, y: number, z: number, k = 0.5) => paintPanel(w, h, key, draw, { x, y, z }, k)

/** 两点之间的锥形杆：a 端半径 r0，b 端半径 r1 */
function stem(a: V3, b: V3, r0: number, r1: number, color: string, seg = 6) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const dir = B.clone().sub(A)
  const m = cyl(r1, r0, Math.max(0.01, dir.length()), color, {}, seg)
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return m
}

/** 两点之间的扁板 */
function strut(a: V3, b: V3, w: number, t: number, color: string) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const dir = B.clone().sub(A)
  const m = rbox(w, dir.length(), t, color, {}, Math.min(0.3, t * 0.4))
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return m
}

/** 折线茎：一串锥形段 + 关节小球，半径从 r0 渐变到 r1 */
function path(pts: V3[], r0: number, r1: number, color: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  const n = pts.length - 1
  for (let i = 0; i < n; i++) {
    const ra = r0 + ((r1 - r0) * i) / n
    const rb = r0 + ((r1 - r0) * (i + 1)) / n
    out.push(stem(pts[i], pts[i + 1], ra, rb, color))
    if (i > 0) out.push(ball(ra, color, { x: pts[i][0], y: pts[i][1], z: pts[i][2] }))
  }
  return out
}

/** 从 base 伸出的一片叶子：yaw 绕 y 的朝向（0 = +z），pitch 上扬角 */
function leafOut(base: V3, len: number, yaw: number, pitch: number, color: string, wide = 0.45, thick = 0.12) {
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  const c = new THREE.Vector3(...base).addScaledVector(dir, len * 0.45)
  const m = ball(len / 2, color, { x: c.x, y: c.y, z: c.z }, [wide, thick, 1])
  m.rotation.order = 'YXZ'
  m.rotation.set(-pitch, yaw, 0)
  return m
}

/** 把一堆同色小网格合成一个（豆芽、松针、硬币），省 draw call */
function merged(parts: THREE.Mesh[], color: string) {
  const geos = parts.map((m) => {
    m.updateMatrix()
    const g = m.geometry.clone().applyMatrix4(m.matrix)
    return g.index ? g.toNonIndexed() : g
  })
  for (const g of geos) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
  const geo = mergeGeometries(geos, false)
  const m = new THREE.Mesh(geo ?? geos[0], toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 侧面轮廓（点为 [z, y]）沿 x 挤出，厚 t，x 居中 */
function sideExtrude(pts: [number, number][], t: number, color: string, x = 0, bevel = 0.3) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)))
  const b = Math.min(bevel, t * 0.25)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 12 })
  geo.translate(0, 0, -t / 2 + b)
  const m = new THREE.Mesh(geo, toon(color))
  m.rotation.y = -PI / 2
  m.position.x = x
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 正面轮廓（点为 [x, y]）沿 z 挤出，厚 t，z 居中 */
function frontExtrude(pts: [number, number][], t: number, color: string, z = 0, bevel = 0.3) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const b = Math.min(bevel, t * 0.25)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 12 })
  geo.translate(0, 0, -t / 2 + b)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.z = z
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 圆角矩形顶面（四角半径可分别给：-x-z、+x-z、+x+z、-x+z） */
function roundRect(w: number, d: number, r: number | [number, number, number, number], n = 6): Poly {
  const rs = typeof r === 'number' ? [r, r, r, r] : r
  const corners: [number, number, number][] = [
    [-w / 2 + rs[0], -d / 2 + rs[0], PI],
    [w / 2 - rs[1], -d / 2 + rs[1], PI * 1.5],
    [w / 2 - rs[2], d / 2 - rs[2], 0],
    [-w / 2 + rs[3], d / 2 - rs[3], PI * 0.5],
  ]
  const out: Poly = []
  corners.forEach(([cx, cz, a0], i) => {
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * (PI / 2)
      out.push([cx + Math.cos(a) * rs[i], cz + Math.sin(a) * rs[i]])
    }
  })
  return out
}

/** 竖直面上的圆环（洞洞板圆孔阵列） */
function holeGrid(cx: number, cy: number, R: number, pitch: number, r: number): Hole[] {
  const out: Hole[] = []
  for (let x = -R; x <= R + 1e-6; x += pitch)
    for (let y = -R; y <= R + 1e-6; y += pitch) if (Math.hypot(x, y) <= R - r) out.push({ kind: 'circle', x: cx + x, y: cy + y, r })
  return out
}

// ---- 平放设备上的按键（y 为机身顶面） ----

/** 十字键 */
function dpadY(g: THREE.Group, x: number, y: number, z: number, s: number, color = DARK) {
  g.add(rbox(s, 0.45, s * 0.34, color, { x, y: y - 0.12, z }, 0.12))
  g.add(rbox(s * 0.34, 0.45, s, color, { x, y: y - 0.12, z }, 0.12))
}
/** 四个圆键 */
function btn4Y(g: THREE.Group, x: number, y: number, z: number, spread: number, r: number, cols: string[]) {
  const off: [number, number][] = [
    [0, -spread],
    [spread, 0],
    [0, spread],
    [-spread, 0],
  ]
  off.forEach(([dx, dz], i) => g.add(ball(r, cols[i % cols.length], { x: x + dx, y, z: z + dz }, [1, 0.7, 1])))
}
/** 摇杆 */
function stickY(g: THREE.Group, x: number, y: number, z: number, r: number, cap: string) {
  g.add(cyl(r * 0.5, r * 0.5, 0.6, BLACK, { x, y: y - 0.1, z }, 12))
  g.add(puck(r, 0.5, cap, { x, y: y + 0.4, z }))
}
/** 小药丸键（start / select） */
function pillY(g: THREE.Group, x: number, y: number, z: number, len: number, color: string, ry = 0) {
  const m = rbox(len, 0.35, len * 0.36, color, { x, y: y - 0.12, z, ry }, 0.1)
  g.add(m)
}

// ---- 竖直面（朝 +z）上的按键 ----

function stickZ(g: THREE.Group, x: number, y: number, z: number, r: number, cap: string) {
  g.add(cylZ(r * 0.5, 0.6, BLACK, x, y, z + 0.2, 12))
  g.add(cylZ(r, 0.45, cap, x, y, z + 0.6, 20))
}
function btn4Z(g: THREE.Group, x: number, y: number, z: number, spread: number, r: number, color: string) {
  for (const [dx, dy] of [
    [0, spread],
    [spread, 0],
    [0, -spread],
    [-spread, 0],
  ])
    g.add(ball(r, color, { x: x + dx, y: y + dy, z }, [1, 1, 0.7]))
}

// ---------- 像素小画面 ----------

type Px = (x: number, y: number, w: number, h: number, c: string) => void
function pixGrid(cols: number, rows: number, paint: (px: Px) => void): Draw {
  return (g, W, H) => {
    const sx = W / cols
    const sy = H / rows
    paint((x, y, w, h, c) => {
      g.fillStyle = c
      g.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(w * sx), Math.ceil(h * sy))
    })
  }
}

interface PlatCols {
  sky: string
  cloud: string
  ground: string
  grass: string
  brick: string
  q: string
  red: string
  skin: string
  blue: string
  pipe: string
  coin: string
}
const PLAT_COLOR: PlatCols = { sky: '#8fd3ff', cloud: '#ffffff', ground: '#b86b3a', grass: '#5cc25c', brick: '#c8643a', q: '#ffc83a', red: '#e83c3c', skin: '#ffcf9a', blue: '#3a5ce8', pipe: '#2fae4f', coin: '#ffd23a' }
const PLAT_POCKET: PlatCols = { sky: '#c9cbbd', cloud: '#e6e8dc', ground: '#55574f', grass: '#82847a', brick: '#55574f', q: '#a6a89c', red: '#2c2d29', skin: '#a6a89c', blue: '#2c2d29', pipe: '#55574f', coin: '#e6e8dc' }

/** 横版过关 */
const platScene = (c: PlatCols): Draw =>
  pixGrid(32, 20, (px) => {
    px(0, 0, 32, 20, c.sky)
    px(3, 3, 6, 2, c.cloud)
    px(4, 2, 3, 1, c.cloud)
    px(21, 4, 6, 2, c.cloud)
    px(22, 3, 3, 1, c.cloud)
    px(0, 16, 32, 4, c.ground)
    px(0, 16, 32, 1, c.grass)
    px(11, 9, 6, 2, c.brick)
    px(18, 9, 2, 2, c.q)
    px(15, 5, 1, 2, c.coin)
    px(24, 11, 6, 2, c.pipe)
    px(25, 13, 4, 3, c.pipe)
    px(6, 10, 3, 1, c.red)
    px(6, 11, 3, 1, c.skin)
    px(6, 12, 3, 2, c.blue)
    px(6, 14, 1, 2, c.red)
    px(8, 14, 1, 2, c.red)
  })

/** 俯视 RPG */
const rpgScene: Draw = pixGrid(32, 20, (px) => {
  px(0, 0, 32, 20, '#7cc96a')
  px(0, 13, 32, 3, '#e6cf98')
  px(14, 0, 3, 13, '#e6cf98')
  px(22, 2, 9, 7, '#5aa8e8')
  for (const [x, y] of [
    [2, 2],
    [6, 4],
    [3, 8],
    [9, 1],
    [26, 16],
    [20, 17],
  ]) {
    px(x, y, 3, 3, '#2f8a4a')
    px(x + 1, y + 3, 1, 1, '#7a5236')
  }
  px(5, 15, 5, 3, '#e86a5a')
  px(6, 18, 3, 2, '#f4e7c8')
  px(15, 10, 1, 1, '#ffcf9a')
  px(15, 11, 1, 2, '#3a5ce8')
})

/** 落块 */
const puzzleScene: Draw = pixGrid(20, 20, (px) => {
  px(0, 0, 20, 20, '#1d1f33')
  px(5, 0, 1, 20, '#7a7f96')
  px(15, 0, 1, 20, '#7a7f96')
  const cols = ['#ff6b6b', '#ffc83a', '#5cc25c', '#6fb8ff', '#c08aff']
  const r = rng(11)
  for (let y = 15; y < 20; y++) for (let x = 6; x < 15; x++) if (r() < 0.8 || y > 17) px(x, y, 1, 1, cols[Math.floor(r() * cols.length)])
  px(9, 4, 3, 1, '#c08aff')
  px(10, 5, 1, 1, '#c08aff')
  px(17, 3, 2, 2, '#ffc83a')
})

/** 竖版射击 */
const shooterScene: Draw = pixGrid(24, 20, (px) => {
  px(0, 0, 24, 20, '#0d1030')
  const r = rng(5)
  for (let i = 0; i < 24; i++) px(Math.floor(r() * 24), Math.floor(r() * 20), 1, 1, '#ffffff')
  for (let i = 0; i < 5; i++) {
    px(3 + i * 4, 3, 2, 1, '#ff7ad0')
    px(3 + i * 4, 4, 1, 1, '#ff7ad0')
    px(4 + i * 4, 4, 1, 1, '#ff7ad0')
    px(4 + i * 4, 6, 2, 1, '#7dff8a')
  }
  px(11, 9, 1, 2, '#ffd23a')
  px(11, 15, 2, 1, '#ffffff')
  px(10, 16, 4, 2, '#6fb8ff')
  px(11, 18, 2, 1, '#ff6b6b')
})

/** 赛车 */
const raceScene: Draw = pixGrid(32, 20, (px) => {
  px(0, 0, 32, 8, '#9fd8ff')
  px(0, 8, 32, 12, '#5cc25c')
  for (let y = 8; y < 20; y++) {
    const half = 2 + (y - 8) * 1.2
    px(16 - half, y, half * 2, 1, '#6d6f78')
    if (y % 3 === 0) px(15.5, y, 1, 1, '#ffffff')
  }
  px(4, 5, 5, 3, '#4f9e5b')
  px(24, 6, 6, 2, '#4f9e5b')
  px(14, 15, 4, 2, '#e83c3c')
  px(14, 17, 1, 1, BLACK)
  px(17, 17, 1, 1, BLACK)
})

/** 系统菜单（图标格） */
const menuScene: Draw = pixGrid(32, 20, (px) => {
  px(0, 0, 32, 20, '#f0f2f5')
  px(0, 0, 32, 3, '#d6dae2')
  const cols = ['#ff8f86', '#ffc83a', '#5cc25c', '#6fb8ff', '#c08aff', '#ffb3e0', '#7dd8d0', '#ffa64d']
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      px(3 + i * 7, 5 + j * 7, 5, 5, cols[i + j * 4])
      px(4 + i * 7, 6 + j * 7, 1, 1, '#ffffff')
    }
})

// ---------- 主机：PS 系 ----------

/** PS5 风机身（竖放，不含底座）：[外翼, 中芯, 灯] */
function ps5Body(p: string[]) {
  const [wing, core, light] = p
  const g = new THREE.Group()
  g.add(rbox(6.2, 37.6, 23.4, core, { y: 0.4 }, 1.0))
  g.add(rbox(5.6, 0.4, 20, shade(core, -0.08), { y: 37.8 }, 0.15))
  const prof: [number, number][] = [
    [-11.4, 0],
    [11.4, 0],
    [12.0, 4],
    [11.9, 10],
    [11.0, 17],
    [11.2, 24],
    [12.2, 31],
    [13.0, 36],
    [13.1, 39],
    [-13.1, 39],
    [-13.0, 36],
    [-12.2, 31],
    [-11.2, 24],
    [-11.0, 17],
    [-11.9, 10],
    [-12.0, 4],
  ]
  for (const s of [-1, 1]) {
    g.add(sideExtrude(prof, 2.1, wing, s * 4.25, 0.5))
    g.add(lit(rbox(0.35, 33, 0.5, light, { x: s * 2.75, y: 3, z: 11.7 }, 0.12), light, 0.85))
  }
  // 正面：光驱槽、按钮、USB 口
  g.add(rbox(0.5, 12, 0.4, BLACK, { x: 0, y: 22, z: 11.75 }, 0.15))
  g.add(rbox(1.0, 0.6, 0.4, BLACK, { x: -1.2, y: 6, z: 11.75 }, 0.15))
  g.add(rbox(0.7, 0.6, 0.4, BLACK, { x: 1.0, y: 6, z: 11.75 }, 0.15))
  g.add(rbox(1.4, 0.35, 0.4, shade(core, 0.2), { x: 0, y: 9.5, z: 11.75 }, 0.12))
  return g
}

function ps5Standing(p: string[]) {
  const g = new THREE.Group()
  g.add(puck(6.2, 1.0, p[1], {}))
  g.add(P(ps5Body(p), 0, 0.9, 0))
  return g
}

function ps5Lying(p: string[]) {
  const g = new THREE.Group()
  g.add(P(ps5Body(p), 0, 0, 0, 0, 0, PI / 2))
  return g
}

/** PS4 风：斜切的两层薄片，[机身, 上层亮面, 灯条] */
function ps4(p: string[]) {
  const [body, top, light] = p
  const g = new THREE.Group()
  g.add(sideExtrude([[-13.8, 0], [14.2, 0], [15.0, 2.5], [-13.0, 2.5]], 27.5, body, 0, 0.3))
  g.add(sideExtrude([[-12.6, 2.4], [14.4, 2.4], [14.6, 2.9], [-12.4, 2.9]], 26.6, BLACK, 0, 0.1))
  g.add(sideExtrude([[-12.6, 2.8], [15.0, 2.8], [16.0, 5.3], [-11.6, 5.3]], 27.5, body, 0, 0.3))
  g.add(rbox(13.2, 0.3, 26.4, top, { x: -6.6, y: 5.15, z: 2.2 }, 0.12))
  g.add(lit(rbox(0.45, 0.3, 26, light, { x: 3.2, y: 5.2, z: 2.2 }, 0.1), light, 0.85))
  g.add(lit(rbox(25.5, 0.25, 0.3, light, { y: 2.55, z: 14.4 }, 0.1), light))
  return g
}

/** PS3 风（初代）：圆弧顶的厚机身，[机身, 银色饰条, 指示灯] */
function ps3(p: string[]) {
  const [body, trim, acc] = p
  const g = new THREE.Group()
  const pts: [number, number][] = [
    [-16, 0.8],
    [16, 0.8],
    [16, 6.4],
  ]
  for (let i = 0; i <= 16; i++) {
    const x = 16 - (32 * i) / 16
    pts.push([x, 6.4 + 3.4 * Math.sin((PI * i) / 16)])
  }
  g.add(frontExtrude(pts, 27.5, body, 0, 0.6))
  g.add(rbox(29, 1.0, 25, shade(body, -0.05), {}, 0.4))
  g.add(rbox(30.5, 2.6, 0.5, trim, { y: 2.4, z: 13.65 }, 0.2))
  g.add(rbox(13, 0.35, 0.4, BLACK, { x: -4, y: 5.4, z: 13.75 }, 0.12))
  g.add(led(12.4, 6.2, 13.8, acc, 0.3))
  g.add(led(13.6, 6.2, 13.8, '#7dffa8', 0.3))
  return g
}

/** PS2 风（平放）：黑色叠层，[机身, 腰线, 指示灯] */
function ps2Body(p: string[]) {
  const [body, groove, acc] = p
  const g = new THREE.Group()
  g.add(rbox(30, 4.4, 17.8, body, {}, 0.6))
  g.add(rbox(29.2, 0.6, 17.0, groove, { y: 4.2 }, 0.2))
  g.add(rbox(30, 3.0, 17.8, body, { y: 4.8 }, 0.6))
  for (let i = 0; i < 10; i++) g.add(rbox(0.35, 0.3, 16.2, shade(body, 0.08), { x: -13 + i * 1.3, y: 7.65 }, 0.1))
  g.add(rbox(19, 0.25, 0.4, shade(body, -0.1), { x: -4, y: 6.1, z: 8.9 }, 0.1))
  g.add(rbox(1.2, 0.8, 0.4, shade(body, 0.12), { x: 9.5, y: 5.9, z: 8.9 }, 0.15))
  g.add(rbox(1.2, 0.8, 0.4, shade(body, 0.12), { x: 11.5, y: 5.9, z: 8.9 }, 0.15))
  g.add(led(13.2, 6.3, 9.0, acc, 0.22))
  for (const x of [-10, -6.5]) {
    g.add(rbox(2.4, 1.0, 0.4, BLACK, { x, y: 1.6, z: 8.9 }, 0.15))
    g.add(rbox(1.8, 0.4, 0.4, BLACK, { x, y: 3.0, z: 8.9 }, 0.1))
  }
  return g
}

function ps2Lying(p: string[]) {
  return G(ps2Body(p))
}

function ps2Standing(p: string[]) {
  const g = new THREE.Group()
  g.add(rbox(10, 1.2, 19, RUBBER, {}, 0.5))
  g.add(P(ps2Body(p), 3.9, 1.2 + 15, 0, 0, 0, PI / 2))
  return g
}

/** PS1 风：灰色方盒 + 圆盖，[机身, 圆盖, 按键] */
function ps1(p: string[]) {
  const [body, lid, btn] = p
  const g = new THREE.Group()
  g.add(rbox(27, 4.6, 18.8, body, {}, 1.0))
  g.add(rbox(25, 1.0, 16, shade(body, -0.04), { y: 4.2, z: -0.6 }, 0.5))
  g.add(puck(6.6, 1.2, lid, { x: -3, y: 4.8, z: -1.0 }))
  g.add(torus(4.6, 0.12, shade(lid, -0.12), { x: -3, y: 6.02, z: -1.0, rx: PI / 2 }))
  g.add(puck(1.6, 0.7, btn, { x: 8.5, y: 4.9, z: -3.2 }))
  g.add(puck(1.0, 0.7, btn, { x: 7.2, y: 4.9, z: 3.0 }))
  g.add(puck(1.0, 0.7, btn, { x: 10.2, y: 4.9, z: 3.0 }))
  g.add(led(8.7, 5.4, 5.6, '#7dffa8', 0.2))
  for (const x of [-7, 4]) g.add(rbox(3.2, 1.6, 0.4, DARK, { x, y: 1.4, z: 9.45 }, 0.2))
  return g
}

// ---------- 主机：Xbox 系 ----------

/** Series X 风塔式机身：[机身, 散热口内绿光, 电源灯]，foot = 竖放的圆脚 */
function xsxBody(p: string[], foot: boolean) {
  const [body, vent, acc] = p
  const g = new THREE.Group()
  const y0 = foot ? 0.6 : 0
  if (foot) g.add(puck(6.5, 0.7, BLACK, {}))
  g.add(rbox(15.1, 28.4, 15.1, body, { y: y0 }, 0.8))
  g.add(lit(cyl(6.6, 6.6, 0.3, vent, { y: y0 + 28.45 }, 32), vent, 0.55))
  g.add(holePanel(15.1, 15.1, 1.6, body, holeGrid(0, 7.55, 6.3, 1.25, 0.42), { y: y0 + 29.2, z: 7.55, rx: -PI / 2 }, 0.8))
  g.add(led(-5.6, y0 + 26.4, 7.65, acc, 0.35))
  g.add(rbox(10, 0.35, 0.4, BLACK, { y: y0 + 18, z: 7.55 }, 0.12))
  g.add(rbox(1.2, 0.5, 0.4, BLACK, { x: 5.4, y: y0 + 2.2, z: 7.55 }, 0.12))
  return g
}

const xsxStanding = (p: string[]) => G(xsxBody(p, true))
const xsxLying = (p: string[]) => G(P(xsxBody(p, false), 0, 0, 0, 0, 0, PI / 2))

/** Series S 风扁盒（竖放，圆形风口在 +x 侧）：[机身, 风口, 电源灯] */
function xssBody(p: string[]) {
  const [body, vent, acc] = p
  const g = new THREE.Group()
  g.add(rbox(6.5, 27.5, 15.1, body, {}, 0.8))
  g.add(cylX(5.6, 0.2, '#111114', 3.25, 18, 0, 32))
  g.add(holePanel(11.2, 11.2, 0.4, vent, holeGrid(0, 5.6, 5.0, 0.95, 0.32), { x: 3.55, y: 18 - 5.6, ry: PI / 2 }, 5.6))
  g.add(led(-1.6, 25.6, 7.6, acc, 0.3))
  g.add(rbox(1.2, 0.5, 0.4, BLACK, { x: 1.2, y: 2.4, z: 7.55 }, 0.12))
  return g
}

const xssStanding = (p: string[]) => G(xssBody(p))
const xssLying = (p: string[]) => G(P(xssBody(p), 0, 0, 0, 0, 0, PI / 2))

/** Xbox One 风：左半亮面右半散热格栅的长方盒，[机身, 亮面, 电源灯] */
function xone(p: string[]) {
  const [body, gloss, acc] = p
  const g = new THREE.Group()
  g.add(rbox(33.3, 7.9, 27.4, body, {}, 0.8))
  g.add(rbox(14.5, 0.4, 26.6, gloss, { x: -8.8, y: 7.7 }, 0.15))
  for (let i = 0; i < 18; i++) g.add(rbox(0.45, 0.35, 25, shade(body, -0.12), { x: 0.6 + i * 0.88, y: 7.75 }, 0.12))
  g.add(rbox(13, 0.3, 0.4, BLACK, { x: -7.5, y: 4, z: 13.75 }, 0.1))
  g.add(lit(cylZ(0.7, 0.3, acc, 13.6, 4.2, 13.8, 20), acc, 0.9))
  return g
}

/** Xbox 360 风（平放）：顶面内凹的白色机身 + 正面光环，[机身, 光驱饰条, 光环] */
function x360(p: string[]) {
  const [body, trim, ring] = p
  const g = new THREE.Group()
  const pts: [number, number][] = [
    [-15.45, 0],
    [15.45, 0],
    [15.45, 7.8],
  ]
  for (let i = 0; i <= 16; i++) {
    const x = 15 - (30 * i) / 16
    pts.push([x, 8.3 - 0.8 * Math.sin((PI * i) / 16)])
  }
  pts.push([-15.45, 7.8])
  g.add(frontExtrude(pts, 25.8, body, 0, 0.6))
  g.add(rbox(19, 0.7, 0.4, trim, { x: -4, y: 4.1, z: 12.95 }, 0.2))
  g.add(lit(torus(1.25, 0.2, ring, { x: 11.5, y: 4.4, z: 13.0 }), ring, 0.8))
  g.add(cylZ(0.9, 0.4, M.silver, 11.5, 4.4, 13.0, 20))
  for (let i = 0; i < 6; i++) g.add(rbox(0.3, 4.2, 0.4, shade(body, -0.15), { x: -14.2 + i * 0.7, y: 1.8, z: 12.9 }, 0.1))
  return g
}

// ---------- 主机：任天堂系 ----------

/** Switch 风竖插的平板 + 两侧手柄（底边 y = 0，厚度沿 z 居中） */
function switchTablet(l: string, r: string, body: string, sw: number, sh: number) {
  const g = new THREE.Group()
  g.add(rbox(17.2, 10.2, 1.4, body, {}, 0.5))
  g.add(rbox(sw + 0.4, sh + 0.4, 0.2, BLACK, { y: (10.2 - sh) / 2 - 0.2, z: 0.75 }, 0.08))
  g.add(vScreen(sw, sh, 'plat-color', platScene(PLAT_COLOR), 0, (10.2 - sh) / 2, 0.9))
  for (const s of [-1, 1]) {
    const col = s < 0 ? l : r
    const x = s * 10.45
    g.add(rbox(3.6, 10.2, 1.4, col, { x }, 0.65))
    if (s < 0) {
      stickZ(g, x, 7.6, 0.7, 0.85, shade(col, -0.35))
      btn4Z(g, x, 4.0, 0.75, 0.7, 0.32, BLACK)
    } else {
      btn4Z(g, x, 7.6, 0.75, 0.7, 0.32, BLACK)
      stickZ(g, x, 4.0, 0.7, 0.85, shade(col, -0.35))
    }
  }
  return g
}

/** Switch 风底座 + 插在里面的主机：[左手柄, 右手柄, 底座] */
function switchDock(p: string[]) {
  const [l, r, dock] = p
  const g = new THREE.Group()
  g.add(rbox(17.3, 1.5, 5.4, dock, {}, 0.5))
  g.add(rbox(17.3, 10.4, 2.2, dock, { z: -1.6 }, 0.8))
  g.add(rbox(17.3, 5.5, 1.6, dock, { z: 1.9 }, 0.6))
  g.add(led(-7.6, 1.0, 2.75, '#7dffa8', 0.18))
  g.add(P(switchTablet(l, r, DARK, 14.4, 8.1), 0, 1.5, 0.3))
  return g
}

/** OLED 风：大屏 + 宽支架斜立在桌上，[左手柄, 右手柄, 机身] */
function switchOled(p: string[]) {
  const [l, r, body] = p
  const g = new THREE.Group()
  const a = 0.36
  g.add(P(switchTablet(l, r, body, 15.4, 8.8), 0, 0, 0, -a))
  // 支架：从机身背面中上部到桌面
  const yb = 6.5 * Math.cos(a) - 0.7 * Math.sin(a)
  const zb = -6.5 * Math.sin(a) - 0.7 * Math.cos(a)
  g.add(strut([0, yb, zb - 0.2], [0, 0.3, zb - 3.4], 15, 0.4, shade(body, -0.05)))
  return g
}

/** Switch Lite 风一体掌机（平放）：[机身, 按键, 点缀] */
function switchLite(p: string[]) {
  const [body, btn, acc] = p
  const g = new THREE.Group()
  g.add(slab(roundRect(20.8, 9.1, 3.2), 1.4, body))
  g.add(rbox(12.6, 0.45, 7.6, DARK, { y: 1.2 }, 0.15))
  g.add(flatScreen(11.4, 6.6, 'race', raceScene, 0, 1.7, 0))
  for (const s of [-1, 1]) {
    const x = s * 7.8
    stickY(g, x, 1.4, s < 0 ? -1.6 : 1.6, 0.85, shade(body, -0.3))
    if (s < 0) btn4Y(g, x, 1.4, 1.7, 0.7, 0.33, [btn, btn, btn, btn])
    else btn4Y(g, x, 1.4, -1.6, 0.7, 0.33, [btn, btn, btn, btn])
  }
  g.add(rbox(0.6, 0.3, 0.6, acc, { x: 7.0, y: 1.3, z: -3.6 }, 0.12))
  g.add(rbox(0.6, 0.3, 0.2, acc, { x: -7.0, y: 1.3, z: -3.6 }, 0.08))
  return g
}

/** Wii 风：竖放白机 + 体感遥控器和副手柄，[机身, 光驱灯, 遥控器] */
function wiiRemote(col: string) {
  const g = new THREE.Group()
  g.add(rbox(3.6, 3.0, 14.8, col, {}, 1.2))
  dpadY(g, 0, 3.0, -4.6, 1.5, shade(col, -0.25))
  g.add(puck(0.75, 0.55, shade(col, -0.08), { y: 2.85, z: -2.2 }))
  for (const x of [-1.0, 0, 1.0]) g.add(ball(0.28, shade(col, -0.25), { x, y: 3.0, z: 1.2 }, [1, 0.6, 1]))
  g.add(puck(0.45, 0.4, shade(col, -0.18), { y: 2.85, z: 4.0 }))
  g.add(puck(0.45, 0.4, shade(col, -0.18), { y: 2.85, z: 5.4 }))
  for (let i = 0; i < 4; i++) g.add(led(-0.9 + i * 0.6, 3.0, 6.7, BLUE, 0.12))
  return g
}
function wii(p: string[]) {
  const [body, acc, remote] = p
  const g = new THREE.Group()
  g.add(rbox(7, 1.0, 16, body, {}, 0.5))
  g.add(rbox(4.4, 15.7, 21.5, body, { y: 0.9 }, 0.8))
  g.add(lit(rbox(0.4, 12.5, 0.4, acc, { x: 0.6, y: 2.8, z: 10.8 }, 0.12), acc, 0.85))
  g.add(rbox(1.0, 0.8, 0.4, shade(body, -0.1), { x: -1.0, y: 14.4, z: 10.75 }, 0.15))
  g.add(rbox(1.0, 0.8, 0.4, shade(body, -0.1), { x: -1.0, y: 12.8, z: 10.75 }, 0.15))
  g.add(P(wiiRemote(remote), 7.4, 0, 1.5))
  // 副手柄（鸡腿形）
  const nx = 12.6
  g.add(ball(2.1, remote, { x: nx, y: 2.0, z: 3.5 }, [1, 0.9, 1.9]))
  stickY(g, nx, 3.8, 1.3, 0.7, shade(remote, -0.1))
  return g
}

/** GameCube 风：紫色方盒 + 背后提手，[机身, 圆盖, 按键] */
function gamecube(p: string[]) {
  const [body, lid, btn] = p
  const g = new THREE.Group()
  g.add(rbox(15, 11, 16.1, body, {}, 1.2))
  g.add(rbox(15.2, 2.2, 16.3, shade(body, -0.1), {}, 0.9))
  g.add(puck(6.0, 0.8, lid, { y: 10.6, z: 0.6 }))
  g.add(P(rbox(2.0, 0.4, 2.0, shade(lid, 0.15), {}, 0.15), 0, 11.3, 0.6, 0, PI / 4))
  for (const s of [-1, 1]) g.add(rbox(1.4, 2.6, 1.6, shade(body, -0.1), { x: s * 6.2, y: 10, z: -7.0 }, 0.5))
  g.add(rbox(13.8, 1.2, 1.6, shade(body, -0.1), { y: 11.5, z: -7.0 }, 0.5))
  g.add(puck(0.8, 0.5, btn, { x: -5.4, y: 10.8, z: 6.0 }))
  g.add(puck(0.8, 0.5, btn, { x: 5.4, y: 10.8, z: 6.0 }))
  g.add(puck(0.6, 0.5, shade(btn, 0.2), { x: 0, y: 10.8, z: 7.2 }))
  for (let i = 0; i < 4; i++) g.add(rbox(2.2, 1.4, 0.4, DARK, { x: -5.4 + i * 3.6, y: 3.2, z: 8.05 }, 0.25))
  return g
}

/** N64 风：中间隆起 + 插着卡带，[机身, 推杆, 卡带] */
function n64(p: string[]) {
  const [body, slider, cart] = p
  const g = new THREE.Group()
  g.add(rbox(26, 4.5, 19, body, {}, 1.4))
  g.add(rbox(18, 2.8, 15, body, { y: 4.0, z: -0.5 }, 1.3))
  g.add(rbox(10, 0.6, 2.6, BLACK, { y: 6.5, z: -1.2 }, 0.2))
  g.add(rbox(9.4, 5.6, 1.8, cart, { y: 6.8, z: -1.2 }, 0.4))
  for (let i = 0; i < 5; i++) g.add(rbox(8.6, 0.25, 0.3, shade(cart, -0.12), { y: 10.2 + i * 0.4, z: -0.25 }, 0.08))
  for (const s of [-1, 1]) g.add(rbox(1.4, 0.6, 2.4, slider, { x: s * 6.4, y: 6.5, z: 3.4 }, 0.25))
  for (const s of [-1, 1]) g.add(rbox(4.6, 0.8, 4.6, shade(body, -0.06), { x: s * 10.4, y: 4.1, z: -6.6 }, 0.4))
  for (let i = 0; i < 4; i++) g.add(rbox(2.4, 1.3, 0.4, BLACK, { x: -5.4 + i * 3.6, y: 1.4, z: 9.55 }, 0.2))
  g.add(led(9.6, 3.0, 9.65, RED_LED, 0.22))
  return g
}

/** FC 风方手柄（平放）：[机身, 面板, A/B 键] */
function fcPad(body: string, face: string, ab: string) {
  const g = new THREE.Group()
  g.add(rbox(12.6, 1.3, 5.4, body, {}, 0.45))
  g.add(rbox(12.0, 0.3, 4.8, face, { y: 1.15 }, 0.12))
  dpadY(g, -4.0, 1.45, 0.2, 1.9, BLACK)
  g.add(rbox(3.4, 0.25, 1.4, shade(face, -0.15), { x: 0, y: 1.35, z: 0.5 }, 0.1))
  pillY(g, -0.75, 1.65, 0.5, 1.0, BLACK)
  pillY(g, 0.75, 1.65, 0.5, 1.0, BLACK)
  g.add(puck(0.65, 0.5, ab, { x: 3.4, y: 1.25, z: 0.6 }))
  g.add(puck(0.65, 0.5, ab, { x: 5.0, y: 1.25, z: 0.6 }))
  return g
}

/** 红白机风：奶白机身 + 两侧插着手柄，[机身, 酒红, 金色] */
function famicom(p: string[]) {
  const [top, red, gold] = p
  const g = new THREE.Group()
  g.add(rbox(11.4, 2.4, 15, red, {}, 0.5))
  g.add(rbox(11.0, 3.0, 14.6, top, { y: 2.2 }, 0.6))
  g.add(rbox(10.8, 0.4, 0.4, gold, { y: 1.8, z: 7.5 }, 0.12))
  g.add(rbox(8.4, 0.6, 2.4, BLACK, { y: 5.0, z: -2.6 }, 0.2))
  g.add(rbox(7.8, 5.0, 1.6, '#e8d7a6', { y: 5.3, z: -2.6 }, 0.3))
  g.add(rbox(6.2, 2.8, 0.3, '#5cbcd8', { y: 7.0, z: -1.75 }, 0.1))
  g.add(rbox(1.6, 0.6, 1.0, red, { x: -2.2, y: 5.0, z: 4.6 }, 0.2))
  g.add(rbox(1.6, 0.6, 1.0, red, { x: 2.2, y: 5.0, z: 4.6 }, 0.2))
  g.add(rbox(1.2, 0.5, 1.2, BLACK, { x: 4.0, y: 5.0, z: 1.8 }, 0.2))
  for (const s of [-1, 1]) {
    g.add(rbox(5.8, 2.0, 15, red, { x: s * 8.6 }, 0.5))
    g.add(P(fcPad(red, gold, red), s * 8.6, 2.0, 0, 0, s * PI / 2))
  }
  return g
}

/** 超任风：圆润灰机，[机身, 紫色按键, 卡带] */
function sfc(p: string[]) {
  const [body, purple, cart] = p
  const g = new THREE.Group()
  g.add(rbox(20, 4.5, 24, body, {}, 2.0))
  g.add(rbox(17, 2.4, 20, body, { y: 4.0, z: -1 }, 1.6))
  g.add(rbox(11, 0.5, 3, BLACK, { y: 6.2, z: -4 }, 0.2))
  g.add(rbox(10.4, 5.6, 2.0, cart, { y: 6.4, z: -4 }, 0.4))
  g.add(rbox(8.4, 3.2, 0.3, '#ffd6e0', { y: 8.0, z: -2.95 }, 0.1))
  for (const s of [-1, 1]) g.add(rbox(2.2, 0.7, 2.6, purple, { x: s * 6.2, y: 6.1, z: 4.0 }, 0.3))
  g.add(rbox(3.2, 0.8, 2.0, purple, { y: 5.9, z: 6.4 }, 0.3))
  const dots = ['#e85d5d', '#f2c94c', '#6cc070', '#4a90e2']
  dots.forEach((c, i) => g.add(ball(0.3, c, { x: -9 + i * 0.8, y: 3.2, z: 12.0 })))
  for (const x of [-3, 3]) g.add(rbox(2.6, 1.6, 0.4, DARK, { x, y: 1.4, z: 12.05 }, 0.3))
  return g
}

/** MD 风：黑色机身 + 中央圆形凸台，[机身, 红色点缀, 金色圈] */
function megadrive(p: string[]) {
  const [body, red, gold] = p
  const g = new THREE.Group()
  g.add(rbox(28, 4.5, 21, body, {}, 1.2))
  g.add(cyl(9.4, 10, 2.0, body, { y: 4.2, z: -0.5 }, 40))
  for (const r of [7.6, 6.0]) g.add(torus(r, 0.16, shade(body, 0.12), { y: 6.22, z: -0.5, rx: PI / 2 }))
  g.add(torus(8.9, 0.18, gold, { y: 6.2, z: -0.5, rx: PI / 2 }))
  g.add(rbox(9, 0.6, 2.4, shade(body, -0.1), { y: 5.9, z: -1.4 }, 0.2))
  g.add(rbox(8.4, 6.2, 1.6, BLACK, { y: 6.1, z: -1.4 }, 0.3))
  g.add(rbox(6.8, 3.2, 0.3, red, { y: 8.4, z: -0.55 }, 0.1))
  g.add(rbox(1.6, 0.6, 2.4, red, { x: -11, y: 4.3, z: 6.5 }, 0.25))
  g.add(rbox(1.6, 0.6, 2.4, BLACK, { x: 11, y: 4.3, z: 6.5 }, 0.25))
  g.add(led(-11, 4.6, 8.6, RED_LED, 0.2))
  for (const x of [-4, 4]) g.add(rbox(2.6, 1.6, 0.4, DARK, { x, y: 1.4, z: 10.55 }, 0.3))
  return g
}

/** 迷你街机复刻机：[机身, 侧板, 招牌灯] */
function miniArcade(p: string[]) {
  const [cab, side, marquee] = p
  const g = new THREE.Group()
  const prof: [number, number][] = [
    [-7, 0],
    [5.5, 0],
    [5.5, 8.5],
    [8.5, 9.6],
    [8.5, 10.6],
    [4, 12],
    [4, 21],
    [6, 22.5],
    [6, 26],
    [-7, 26],
  ]
  g.add(sideExtrude(prof, 12.4, cab, 0, 0.2))
  for (const s of [-1, 1]) g.add(sideExtrude(prof, 0.8, side, s * 6.6, 0.25))
  g.add(rbox(12, 8.6, 0.3, BLACK, { y: 12.4, z: 4.1 }, 0.1))
  g.add(vScreen(10, 7.4, 'shooter', shooterScene, 0, 13, 4.3))
  g.add(glow(11.2, 3, marquee, { y: 22.8, z: 6.0 }, 0.75))
  // 操作台：斜面 y = 10.6 + (8.5 - z) * 0.311
  const sy = (z: number) => 10.6 + (8.5 - z) * 0.311
  g.add(cyl(0.18, 0.18, 1.6, M.silver, { x: -3, y: sy(6.8) - 0.2, z: 6.8 }, 8))
  g.add(ball(0.65, '#e83c3c', { x: -3, y: sy(6.8) + 1.6, z: 6.8 }))
  const bc = ['#ffc83a', '#6fb8ff', '#7dffa8']
  bc.forEach((c, i) => g.add(puck(0.5, 0.5, c, { x: 0.8 + i * 1.6, y: sy(6.8) - 0.25, z: 6.8 })))
  g.add(rbox(3, 3.6, 0.3, shade(cab, -0.2), { y: 2.6, z: 5.6 }, 0.1))
  g.add(lit(rbox(0.3, 1.0, 0.3, RED_LED, { x: -0.6, y: 3.8, z: 5.8 }, 0.08), RED_LED, 0.9))
  g.add(lit(rbox(0.3, 1.0, 0.3, RED_LED, { x: 0.6, y: 3.8, z: 5.8 }, 0.08), RED_LED, 0.9))
  return g
}

// ---------- 手柄 ----------

/** 双握把手柄的机身（PS 系）：[机身, 面板 / 摇杆, 点缀]，sticks 为 false 时是初代无摇杆款 */
function dualGrip(body: string, plate: string, acc: string, sticks: boolean, faceCols: string[]) {
  const g = new THREE.Group()
  g.add(rbox(10, 2.2, 6.4, body, { y: 0.9, z: -0.6 }, 1.1))
  for (const s of [-1, 1]) {
    g.add(ball(2.8, body, { x: s * 4.4, y: 2.0, z: -1.2 }, [1.1, 0.45, 1.05]))
    const grip = ball(2.4, body, { x: s * 5.3, y: 1.8, z: 1.8 }, [1, 0.75, 1.65])
    grip.rotation.y = s * 0.32
    g.add(grip)
    g.add(rbox(2.6, 0.9, 1, shade(body, -0.12), { x: s * 4.4, y: 2.0, z: -4.3 }, 0.4))
  }
  if (sticks) {
    g.add(rbox(7.4, 0.4, 3.4, plate, { y: 2.95, z: 0.9 }, 0.18))
    for (const s of [-1, 1]) stickY(g, s * 1.9, 3.35, 1.0, 1.0, plate)
    g.add(rbox(5.0, 0.35, 2.8, shade(body, 0.04), { y: 3.0, z: -2.3 }, 0.15))
    for (const s of [-1, 1]) g.add(lit(rbox(0.3, 0.3, 2.4, acc, { x: s * 2.75, y: 3.05, z: -2.3 }, 0.1), acc, 0.85))
  } else {
    pillY(g, -0.9, 3.25, 0.4, 1.1, plate, 0.3)
    pillY(g, 0.9, 3.25, 0.4, 1.1, plate, -0.3)
    g.add(rbox(3.2, 0.3, 1.4, shade(body, -0.06), { y: 3.0, z: -1.8 }, 0.12))
  }
  dpadY(g, -4.4, 3.3, -1.2, 1.9, sticks ? shade(body, -0.25) : plate)
  btn4Y(g, 4.4, 3.3, -1.2, 0.95, 0.42, faceCols)
  return g
}

const padPS5 = (p: string[]) => G(dualGrip(p[0], p[1], p[2], true, [shade(p[1], 0.35), shade(p[1], 0.35), shade(p[1], 0.35), shade(p[1], 0.35)]))
const padPS1 = (p: string[]) => G(dualGrip(p[0], p[1], p[2], false, FACE4))
const padFC = (p: string[]) => G(fcPad(p[0], p[1], p[2]))

/** 超任风狗骨头手柄：[机身, 右侧凹面, 十字键] */
function padSFC(p: string[]) {
  const [body, plate, cross] = p
  const g = new THREE.Group()
  g.add(rbox(8.4, 1.8, 4.4, body, {}, 0.7))
  for (const s of [-1, 1]) {
    g.add(puck(3.1, 2.0, body, { x: s * 4.2 }))
    g.add(rbox(3.4, 1.1, 0.8, shade(body, -0.15), { x: s * 4.3, y: 0.4, z: -2.9 }, 0.35))
  }
  g.add(puck(2.6, 0.3, plate, { x: 4.2, y: 1.85 }))
  dpadY(g, -4.2, 2.1, 0, 2.0, cross)
  const fc = ['#4a90e2', '#e85d5d', '#f2c94c', '#6cc070']
  btn4Y(g, 4.2, 2.15, 0, 1.0, 0.48, fc)
  pillY(g, -0.8, 1.9, 0.5, 1.1, shade(body, -0.25), -0.5)
  pillY(g, 0.8, 1.9, 0.5, 1.1, shade(body, -0.25), -0.5)
  return g
}

/** N64 风三叉手柄：[机身, 摇杆, C 键] */
function padN64(p: string[]) {
  const [body, stick, cbtn] = p
  const g = new THREE.Group()
  g.add(ball(5, body, { y: 2.2, z: -1.2 }, [1.6, 0.42, 0.85]))
  for (const x of [-5.6, 0, 5.6]) g.add(P(capsule(1.55, 3.6, body), x, 1.75, 3.0, PI / 2 + (x === 0 ? 0.2 : 0.05)))
  stickY(g, 0, 3.6, 0.2, 0.75, stick)
  dpadY(g, -5.6, 3.95, -1.5, 2.0, shade(body, -0.25))
  g.add(ball(0.55, '#4a90e2', { x: 4.4, y: 3.85, z: -0.2 }, [1, 0.6, 1]))
  g.add(ball(0.55, '#6cc070', { x: 3.4, y: 3.85, z: -1.4 }, [1, 0.6, 1]))
  btn4Y(g, 6.2, 3.8, -2.0, 0.75, 0.32, [cbtn])
  g.add(ball(0.45, '#e85d5d', { y: 3.9, z: -2.4 }, [1, 0.6, 1]))
  return g
}

/** GC 风手柄：大绿 A 键，[机身, 摇杆, C 摇杆] */
function padGC(p: string[]) {
  const [body, stick, cst] = p
  const g = new THREE.Group()
  g.add(ball(4.6, body, { y: 2.1, z: -0.6 }, [1.45, 0.5, 0.95]))
  for (const s of [-1, 1]) {
    const grip = ball(2.4, body, { x: s * 5.0, y: 1.8, z: 2.2 }, [1, 0.75, 1.5])
    grip.rotation.y = s * 0.35
    g.add(grip)
  }
  stickY(g, -4.0, 4.1, -1.2, 1.0, stick)
  stickY(g, 2.2, 4.1, 2.0, 0.75, cst)
  dpadY(g, -2.2, 4.15, 2.2, 1.5, shade(body, -0.25))
  g.add(puck(1.0, 0.6, '#5fc46a', { x: 4.4, y: 3.85, z: -1.0 }))
  g.add(puck(0.55, 0.5, '#e85d5d', { x: 2.9, y: 3.9, z: 0.0 }))
  g.add(P(capsule(0.35, 1.4, '#d7d8db'), 6.0, 4.3, -1.0, PI / 2, -0.4))
  g.add(P(capsule(0.35, 1.4, '#d7d8db'), 4.4, 4.3, -2.6, PI / 2, PI / 2 - 0.3))
  pillY(g, 0, 4.4, -1.2, 0.8, shade(body, -0.25))
  return g
}

/** MD 风月牙手柄：三个大圆键，[机身, 按键, 十字键底盘] */
function padMD(p: string[]) {
  const [body, btn, disc] = p
  const g = new THREE.Group()
  g.add(ball(5.6, body, { y: 1.9, z: 0 }, [1.5, 0.34, 0.78]))
  g.add(puck(2.2, 0.5, disc, { x: -4.6, y: 3.25, z: 0 }))
  dpadY(g, -4.6, 3.95, 0, 2.6, shade(disc, -0.15))
  for (let i = 0; i < 3; i++) g.add(puck(0.8, 0.55, btn, { x: 2.6 + i * 2.0, y: 3.15 - i * 0.12, z: 0.6 - i * 0.55 }))
  g.add(rbox(1.2, 0.35, 0.6, shade(body, -0.2), { x: 1.0, y: 3.4, z: -1.8 }, 0.12))
  return g
}

/** Wii 风遥控器 + 副手柄（平放）：[遥控器, 副手柄, 点缀] */
function padWii(p: string[]) {
  const [remote, nun, acc] = p
  const g = new THREE.Group()
  g.add(P(wiiRemote(remote), -2.6, 0, 0))
  g.add(ball(2.1, nun, { x: 3.2, y: 2.0, z: 1.0 }, [1, 0.9, 1.9]))
  stickY(g, 3.2, 3.8, -1.2, 0.7, shade(nun, -0.1))
  g.add(puck(0.35, 0.4, acc, { x: -3.5, y: 2.85, z: -6.6 }))
  return g
}

// ---------- 掌机：翻盖 ----------

interface Clam {
  w: number
  d: number
  t: number
  gap: number
  open: number
  /** 下半机身内面上的按键（y 为内面高度） */
  lower: (g: THREE.Group, p: string[], y: number) => void
  /** 上盖内面（上盖局部：高沿 y 0..d，内面朝 +z、在 z = t / 2） */
  upper: (g: THREE.Group, p: string[]) => void
  /** 上盖外面（z = -t / 2，朝 -z） */
  outer?: (g: THREE.Group, p: string[]) => void
}

function clamshell(c: Clam, open: boolean) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const r = Math.min(0.5, c.t * 0.45)
    g.add(rbox(c.w, c.t, c.d, p[0], {}, r))
    if (open) c.lower(g, p, c.t)
    g.add(cylX(c.t * 0.55, c.w * 0.9, shade(p[0], -0.1), 0, c.t + c.gap / 2, -c.d / 2 + c.t * 0.4))
    const lid = new THREE.Group()
    lid.add(rbox(c.w, c.d, c.t, p[0], { z: 0 }, r))
    c.upper(lid, p)
    c.outer?.(lid, p)
    if (open) g.add(P(lid, 0, c.t + c.gap * 0.5, -c.d / 2 + c.t * 0.5, -c.open))
    else g.add(P(lid, 0, c.t + c.gap + c.t / 2, -c.d / 2, PI / 2))
    return g
  }
}

const CLAM_3DS: Clam = {
  w: 13.4,
  d: 7.4,
  t: 1.05,
  gap: 0.22,
  open: 0.3,
  lower: (g, p, y) => {
    g.add(rbox(12.6, 0.2, 6.6, p[1], { y: y - 0.1 }, 0.1))
    g.add(rbox(6.8, 0.2, 5.2, BLACK, { y: y - 0.05, z: -0.7 }, 0.08))
    g.add(flatScreen(6.2, 4.6, 'menu', menuScene, 0, y + 0.2, -0.7))
    g.add(cyl(0.6, 0.6, 0.3, BLACK, { x: -5.0, y: y, z: -1.7 }, 16))
    g.add(puck(0.75, 0.3, shade(p[1], -0.25), { x: -5.0, y: y + 0.18, z: -1.7 }))
    dpadY(g, -5.0, y + 0.15, 1.3, 1.3, shade(p[1], -0.3))
    btn4Y(g, 5.0, y + 0.1, -1.0, 0.62, 0.3, [p[2], p[2], p[2], p[2]])
    for (const x of [-1.2, 0, 1.2]) g.add(rbox(0.9, 0.3, 0.35, shade(p[1], -0.2), { x, y: y, z: 2.6 }, 0.1))
    g.add(led(5.6, y + 0.1, 2.9, '#7dc8ff', 0.16))
  },
  upper: (g, p) => {
    g.add(rbox(12.6, 6.6, 0.2, p[1], { y: 0.4, z: 0.52 }, 0.1))
    g.add(rbox(8.4, 5.1, 0.2, BLACK, { y: 1.2, z: 0.62 }, 0.08))
    g.add(vScreen(7.8, 4.6, 'plat-color', platScene(PLAT_COLOR), 0, 1.45, 0.75))
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(ball(0.1, BLACK, { x: s * 5.4, y: 3.2 + i * 0.4, z: 0.65 }))
  },
  outer: (g, p) => {
    for (const s of [-1, 1]) g.add(cylZ(0.3, 0.2, BLACK, s * 1.0, 6.6, -0.55, 20))
    g.add(rbox(10, 0.3, 0.2, p[2], { y: 5.6, z: -0.55 }, 0.08))
  },
}

const CLAM_SP: Clam = {
  w: 8.2,
  d: 8.4,
  t: 1.2,
  gap: 0.15,
  open: 0.32,
  lower: (g, p, y) => {
    dpadY(g, -2.4, y + 0.1, -1.6, 1.8, BLACK)
    g.add(puck(0.55, 0.4, p[2], { x: 1.9, y: y - 0.1, z: -1.2 }))
    g.add(puck(0.55, 0.4, p[2], { x: 3.1, y: y - 0.1, z: -2.0 }))
    pillY(g, -0.7, y + 0.1, 1.2, 0.9, shade(p[1], -0.25))
    pillY(g, 0.7, y + 0.1, 1.2, 0.9, shade(p[1], -0.25))
    for (let i = 0; i < 4; i++) g.add(rbox(0.2, 0.12, 1.2, shade(p[0], -0.2), { x: 2.0 + i * 0.4, y: y - 0.05, z: 2.4 }, 0.05))
    g.add(led(-3.4, y + 0.05, 1.4, '#7dffa8', 0.14))
  },
  upper: (g, p) => {
    g.add(rbox(7.2, 6.0, 0.2, p[1], { y: 1.6, z: 0.6 }, 0.3))
    g.add(rbox(6.2, 4.4, 0.2, BLACK, { y: 2.4, z: 0.7 }, 0.1))
    g.add(vScreen(5.8, 3.9, 'puzzle', puzzleScene, 0, 2.65, 0.83))
  },
  outer: (g, p) => g.add(cylZ(1.0, 0.2, p[2], 0, 4.8, -0.65, 20)),
}

const CLAM_DSL: Clam = {
  w: 13.3,
  d: 7.4,
  t: 1.1,
  gap: 0.15,
  open: 0.32,
  lower: (g, p, y) => {
    g.add(rbox(6.8, 0.2, 5.2, BLACK, { y: y - 0.05, z: -0.3 }, 0.08))
    g.add(flatScreen(6.2, 4.6, 'rpg', rpgScene, 0, y + 0.2, -0.3))
    dpadY(g, -5.0, y + 0.12, -0.8, 1.6, shade(p[1], -0.3))
    btn4Y(g, 5.0, y + 0.1, -0.8, 0.7, 0.32, [p[2], p[2], p[2], p[2]])
    g.add(ball(0.2, shade(p[1], -0.3), { x: 5.0, y: y, z: 2.0 }))
    g.add(ball(0.2, shade(p[1], -0.3), { x: 5.0, y: y, z: 2.7 }))
    g.add(led(-5.0, y + 0.05, 2.6, '#7dffa8', 0.15))
  },
  upper: (g, p) => {
    g.add(rbox(7.0, 5.2, 0.2, BLACK, { y: 1.1, z: 0.6 }, 0.1))
    g.add(vScreen(6.2, 4.6, 'plat-color', platScene(PLAT_COLOR), 0, 1.4, 0.73))
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) g.add(ball(0.1, shade(p[1], -0.3), { x: s * 5.2, y: 3.0 + i * 0.4, z: 0.6 }))
  },
  outer: (g, p) => g.add(rbox(3, 0.3, 0.2, p[2], { y: 5.8, z: -0.6 }, 0.08)),
}

// ---------- 掌机：直板 ----------

/** PSP 风：横长、宽屏，[机身, 屏框, 按键] */
function psp(p: string[]) {
  const [body, bezel, btn] = p
  const g = new THREE.Group()
  g.add(slab(roundRect(17, 7.4, 3.0), 2.2, body))
  g.add(rbox(11, 0.3, 5.9, bezel, { y: 2.05, z: -0.35 }, 0.12))
  g.add(flatScreen(9.6, 5.3, 'plat-color', platScene(PLAT_COLOR), 0, 2.48, -0.35))
  for (const [dx, dz, rz] of [
    [0, -0.7, 0],
    [0, 0.7, 0],
    [-0.7, 0, PI / 2],
    [0.7, 0, PI / 2],
  ])
    g.add(P(rbox(0.65, 0.4, 0.55, btn, {}, 0.12), -6.9 + dx, 2.0, -1.0 + dz, 0, rz))
  g.add(puck(0.65, 0.35, shade(body, -0.15), { x: -6.6, y: 2.05, z: 1.9 }))
  btn4Y(g, 6.9, 2.2, -1.0, 0.75, 0.34, FACE4)
  for (let i = 0; i < 5; i++) g.add(rbox(0.8, 0.25, 0.35, shade(body, -0.15), { x: -3.2 + i * 1.6, y: 2.1, z: 3.05 }, 0.1))
  return g
}

/** Vita 风：圆润椭长、双摇杆，[机身, 面板, 按键] */
function vita(p: string[]) {
  const [body, face, btn] = p
  const g = new THREE.Group()
  g.add(slab(roundRect(18.2, 8.4, 3.8), 1.9, body))
  g.add(slab(roundRect(17.4, 7.6, 3.4), 0.3, face, 1.75))
  g.add(flatScreen(11, 6.2, 'shooter', shooterScene, 0, 2.12, 0))
  stickY(g, -6.6, 2.05, 1.9, 0.75, shade(face, 0.15))
  stickY(g, 6.6, 2.05, 1.9, 0.75, shade(face, 0.15))
  dpadY(g, -7.0, 2.15, -1.3, 1.6, btn)
  btn4Y(g, 7.0, 2.1, -1.3, 0.7, 0.3, FACE4)
  g.add(ball(0.3, btn, { x: -7.8, y: 2.05, z: 3.1 }, [1, 0.5, 1]))
  return g
}

/** GBA 风：横向，[机身, 按键, 屏框] */
function gba(p: string[]) {
  const [body, btn, bezel] = p
  const g = new THREE.Group()
  g.add(slab(roundRect(14.4, 8.2, [2.4, 2.4, 3.6, 3.6]), 2.4, body))
  g.add(rbox(7.6, 0.3, 5.6, bezel, { y: 2.25, z: -0.5 }, 0.2))
  g.add(flatScreen(6.1, 4.1, 'plat-color', platScene(PLAT_COLOR), 0, 2.68, -0.5))
  dpadY(g, -5.1, 2.5, -0.6, 1.8, BLACK)
  g.add(puck(0.6, 0.45, btn, { x: 4.4, y: 2.25, z: 0.0 }))
  g.add(puck(0.6, 0.45, btn, { x: 5.8, y: 2.25, z: -0.9 }))
  pillY(g, -5.4, 2.5, 2.3, 0.9, shade(body, -0.25))
  pillY(g, -4.2, 2.5, 2.3, 0.9, shade(body, -0.25))
  for (const s of [-1, 1]) g.add(rbox(2.8, 0.9, 0.7, shade(body, -0.12), { x: s * 5.2, y: 1.2, z: -4.15 }, 0.3))
  for (let i = 0; i < 4; i++) g.add(ball(0.1, shade(body, -0.3), { x: 5.4 + (i % 2) * 0.4, y: 2.4, z: 1.8 + Math.floor(i / 2) * 0.4 }))
  return g
}

interface GbSpec {
  w: number
  d: number
  h: number
  clear: boolean
  sw: number
  sd: number
  scene: [string, Draw]
}
/** 竖向 Game Boy 系（平放，顶边朝 -z）：[外壳, 按键, 屏框, 内部电路板（透明款）] */
function gbVertical(o: GbSpec) {
  return (p: string[]) => {
    const [shellC, btn, bezel, board] = p
    const g = new THREE.Group()
    const body = slab(roundRect(o.w, o.d, [0.5, 0.5, 2.4, 0.5]), o.h, shellC)
    if (o.clear) {
      ghost(body, shellC, 0.55)
      g.add(rbox(o.w - 1.4, o.h * 0.3, o.d - 1.8, board, { y: o.h * 0.3 }, 0.1))
      for (const [x, z] of [
        [-1.4, 1.5],
        [1.2, 2.6],
        [0, -1.0],
      ])
        g.add(rbox(1.4, 0.3, 1.4, BLACK, { x, y: o.h * 0.6, z }, 0.08))
    }
    g.add(body)
    const bd = o.sd + 1.6
    const zs = -o.d / 2 + 0.8 + bd / 2
    g.add(rbox(o.w - 1.2, 0.3, bd, bezel, { y: o.h - 0.1, z: zs }, 0.2))
    g.add(flatScreen(o.sw, o.sd, o.scene[0], o.scene[1], 0, o.h + 0.24, zs - 0.1))
    g.add(led(-o.w / 2 + 1.1, o.h + 0.2, zs - 0.4, RED_LED, 0.15))
    const zc = zs + bd / 2 + 2.2
    dpadY(g, -o.w * 0.24, o.h + 0.12, zc, 1.8, BLACK)
    g.add(puck(0.6, 0.45, btn, { x: o.w * 0.15, y: o.h - 0.15, z: zc + 0.4 }))
    g.add(puck(0.6, 0.45, btn, { x: o.w * 0.34, y: o.h - 0.15, z: zc - 0.3 }))
    pillY(g, -0.5, o.h + 0.12, zc + 2.4, 0.9, shade(bezel, 0.15), -0.45)
    pillY(g, 0.7, o.h + 0.12, zc + 2.4, 0.9, shade(bezel, 0.15), -0.45)
    for (let i = 0; i < 5; i++) g.add(P(rbox(0.22, 0.12, 1.4, shade(o.clear ? board : shellC, -0.25), {}, 0.05), o.w * 0.18 + i * 0.38, o.h - 0.05, o.d / 2 - 1.5, 0, 0.6))
    return g
  }
}

/** Steam Deck 风：大型宽体，双摇杆 + 触控板，[机身, 摇杆帽, 按键] */
function steamDeck(p: string[]) {
  const [body, cap, btn] = p
  const g = new THREE.Group()
  g.add(slab(roundRect(29.8, 11.7, 4.6), 2.0, body, 1.6))
  for (const s of [-1, 1]) g.add(ball(3.6, body, { x: s * 11.6, y: 1.8, z: 0.8 }, [0.95, 0.45, 1.25]))
  g.add(rbox(19.6, 0.3, 11.0, DARK, { y: 3.45 }, 0.15))
  g.add(flatScreen(16, 9.4, 'rpg', rpgScene, 0, 3.88, 0))
  for (const s of [-1, 1]) {
    stickY(g, s * 11.6, 3.6, -0.6, 1.05, cap)
    g.add(rbox(3.2, 0.3, 3.0, shade(body, -0.12), { x: s * 12.0, y: 3.45, z: 3.1 }, 0.2))
  }
  dpadY(g, -13.2, 3.75, -3.6, 1.8, btn)
  btn4Y(g, 13.2, 3.75, -3.6, 0.7, 0.32, [btn, btn, btn, btn])
  return g
}

// ---------- 生活小物：水培 / 盆栽 ----------

/** 玻璃杯 + 水 */
function glassWater(g: THREE.Group, rTop: number, rBot: number, h: number, level: number, t = 0.3, glassC = GLASS) {
  g.add(ghost(cup(rTop, rBot, h, t, glassC, {}), glassC, GLASS_A))
  if (level > 0) {
    const r = (y: number) => rBot + ((rTop - rBot) * y) / h - t - 0.08
    g.add(ghost(cyl(r(level), r(t), level - t, WATER, { y: t }, 28), WATER, WATER_A))
  }
}

/** 一束细根：从 (x, y, z) 往下 */
function roots(n: number, x: number, y: number, z: number, len: number, spread: number, seed: number): THREE.Mesh[] {
  const r = rng(seed)
  const out: THREE.Mesh[] = []
  for (let i = 0; i < n; i++) {
    const a = r() * PI * 2
    const s = spread * (0.4 + r() * 0.6)
    out.push(stem([x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3], [x + Math.cos(a) * s, y - len * (0.6 + r() * 0.4), z + Math.sin(a) * s], 0.07, 0.04, ROOT, 5))
  }
  return out
}

/** 水培蒜苗：[玻璃, 蒜头, 蒜苗] */
function garlicSprout(p: string[]) {
  const [glassC, bulb, sprout] = p
  const g = new THREE.Group()
  const H = 8.5
  glassWater(g, 2.7, 2.4, H, 7.2, 0.3, glassC)
  const cy = H + 0.45
  g.add(ball(2.8, bulb, { y: cy }, [1, 0.85, 1]))
  const r = rng(3)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2
    g.add(ball(1.3, shade(bulb, -0.03), { x: Math.cos(a) * 1.75, y: cy + 0.35, z: Math.sin(a) * 1.75 }, [0.75, 1.25, 0.75]))
  }
  g.add(merged(roots(9, 0, cy - 2.2, 0, 3.6, 1.4, 4), ROOT))
  const blades: THREE.Mesh[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + r() * 0.3
    const bx = Math.cos(a) * 1.1
    const bz = Math.sin(a) * 1.1
    const len = 9 + r() * 7
    const lean = 0.08 + r() * 0.16
    blades.push(stem([bx, cy + 1.6, bz], [bx + Math.cos(a) * len * lean, cy + 1.6 + len, bz + Math.sin(a) * len * lean], 0.2, 0.06, sprout, 6))
  }
  g.add(merged(blades, sprout))
  return g
}

/** 水培葱：切剩的葱根插在杯里长出新芽，[玻璃, 葱白, 新芽] */
function negiRegrow(p: string[]) {
  const [glassC, white, green] = p
  const g = new THREE.Group()
  glassWater(g, 3.2, 2.9, 10, 4.2, 0.3, glassC)
  const r = rng(9)
  const shoots: THREE.Mesh[] = []
  const pos: [number, number][] = [
    [0, 0],
    [1.3, 0.5],
    [-1.2, 0.7],
    [0.4, -1.3],
    [-0.7, -1.0],
  ]
  for (const [x, z] of pos) {
    const h = 6.5 + r() * 1.2
    g.add(cyl(0.55, 0.6, h, white, { x, y: 0.6, z }, 12))
    g.add(merged(roots(5, x, 0.9, z, 0.6, 0.5, Math.round((x + 3) * 10 + z * 3)), ROOT))
    const len = 7 + r() * 8
    const lean = 0.05 + r() * 0.08
    const k = Math.atan2(z, x || 0.01)
    shoots.push(stem([x, 0.6 + h - 0.3, z], [x + Math.cos(k) * len * lean, 0.6 + h + len, z + Math.sin(k) * len * lean], 0.38, 0.14, green, 10))
  }
  g.add(merged(shoots, green))
  return g
}

/** 萝卜苗培育盒：[盒子, 海绵, 叶] */
function sproutBox(p: string[]) {
  const [box, sponge, leafC] = p
  const g = new THREE.Group()
  g.add(tray(12, 3.2, 9, 0.3, box, {}, 0.15))
  g.add(rbox(11.2, 1.2, 8.2, sponge, { y: 0.3 }, 0.2))
  const r = rng(17)
  const stems: THREE.Mesh[] = []
  const leaves: THREE.Mesh[] = []
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 6; j++) {
      const x = -4.8 + i * 1.2 + (r() - 0.5) * 0.5
      const z = -3.3 + j * 1.3 + (r() - 0.5) * 0.5
      const h = 4.5 + r() * 2.5
      const tx = x + (r() - 0.5) * 0.8
      const tz = z + (r() - 0.5) * 0.8
      stems.push(stem([x, 1.3, z], [tx, 1.5 + h, tz], 0.06, 0.05, '#f6f4e8', 4))
      const yaw = r() * PI
      leaves.push(leafOut([tx, 1.5 + h, tz], 1.0, yaw, 0.25, leafC, 0.7, 0.14))
      leaves.push(leafOut([tx, 1.5 + h, tz], 1.0, yaw + PI, 0.25, leafC, 0.7, 0.14))
    }
  g.add(merged(stems, '#f6f4e8'))
  g.add(merged(leaves, leafC))
  return g
}

/** 用牙签架在杯口的种子 / 块茎：三根牙签 */
function toothpicks(y: number, rOut: number, seed: number): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + seed
    out.push(stem([Math.cos(a) * 0.5, y, Math.sin(a) * 0.5], [Math.cos(a) * rOut, y, Math.sin(a) * rOut], 0.09, 0.07, '#e9d2a6', 6))
  }
  return out
}

/** 牛油果核水培：[玻璃, 果核, 叶] */
function avocadoPit(p: string[]) {
  const [glassC, pit, leafC] = p
  const g = new THREE.Group()
  const H = 9
  glassWater(g, 3.6, 3.0, H, 7.9, 0.3, glassC)
  const cy = 9.2
  g.add(ball(2.0, pit, { y: cy }, [1, 1.2, 1]))
  g.add(merged(toothpicks(H + 0.12, 4.6, 0.4), '#e9d2a6'))
  g.add(stem([0, cy - 2.2, 0], [0.3, 2.0, 0.2], 0.28, 0.08, ROOT, 8))
  g.add(merged(roots(5, 0.15, 4.5, 0.1, 1.6, 1.2, 21), ROOT))
  g.add(stem([0, cy + 2.0, 0], [0.3, cy + 9.5, -0.2], 0.22, 0.14, '#7a8a4a', 8))
  const top: V3 = [0.3, cy + 9.4, -0.2]
  for (let i = 0; i < 4; i++) g.add(leafOut(top, 4.2 - i * 0.4, (i / 4) * PI * 2 + 0.3, 0.35 + i * 0.1, leafC, 0.42, 0.1))
  return g
}

/** 香草盆的盆 + 托盘 + 土：返回土面高度 */
function herbPot(g: THREE.Group, pot: string, rim: string) {
  g.add(puck(5.4, 0.8, shade(pot, -0.08), {}))
  g.add(cup(5.2, 4.0, 9, 0.5, pot, { y: 0.6 }))
  g.add(torus(5.15, 0.45, rim, { y: 9.35, rx: PI / 2 }))
  g.add(cyl(4.6, 4.5, 0.5, SOIL, { y: 8.0 }, 24))
  return 8.5
}

function basil(p: string[]) {
  const [pot, rim, leafC] = p
  const g = new THREE.Group()
  const y0 = herbPot(g, pot, rim)
  const r = rng(31)
  const stems: THREE.Mesh[] = []
  const leaves: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const bx = Math.cos(a) * 1.8
    const bz = Math.sin(a) * 1.8
    const h = 7 + r() * 4
    const tx = bx + Math.cos(a) * 2
    const tz = bz + Math.sin(a) * 2
    stems.push(stem([bx, y0 - 0.2, bz], [tx, y0 + h, tz], 0.18, 0.12, shade(leafC, -0.1), 6))
    for (let k = 1; k <= 3; k++) {
      const f = k / 3.4
      const base: V3 = [bx + (tx - bx) * f, y0 + h * f, bz + (tz - bz) * f]
      const yaw = a + (k % 2) * (PI / 2)
      leaves.push(leafOut(base, 3.0 - k * 0.3, yaw, 0.15, leafC, 0.65, 0.16))
      leaves.push(leafOut(base, 3.0 - k * 0.3, yaw + PI, 0.15, leafC, 0.65, 0.16))
    }
    for (let k = 0; k < 4; k++) leaves.push(leafOut([tx, y0 + h, tz], 1.6, (k / 4) * PI * 2, 0.7, leafC, 0.65, 0.16))
  }
  g.add(merged(stems, shade(leafC, -0.1)))
  g.add(merged(leaves, leafC))
  return g
}

function mint(p: string[]) {
  const [pot, rim, leafC] = p
  const g = new THREE.Group()
  const y0 = herbPot(g, pot, rim)
  const r = rng(41)
  const stems: THREE.Mesh[] = []
  const leaves: THREE.Mesh[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + r() * 0.4
    const rr = 1 + r() * 2.2
    const bx = Math.cos(a) * rr
    const bz = Math.sin(a) * rr
    const h = 5 + r() * 4
    const tx = bx + Math.cos(a) * 2.4
    const tz = bz + Math.sin(a) * 2.4
    stems.push(stem([bx, y0 - 0.2, bz], [tx, y0 + h, tz], 0.12, 0.08, '#6a8a4a', 5))
    for (let k = 1; k <= 4; k++) {
      const f = k / 4.2
      const base: V3 = [bx + (tx - bx) * f, y0 + h * f, bz + (tz - bz) * f]
      const yaw = a + (k % 2) * (PI / 2)
      leaves.push(leafOut(base, 1.9, yaw, 0.2, leafC, 0.6, 0.14))
      leaves.push(leafOut(base, 1.9, yaw + PI, 0.2, leafC, 0.6, 0.14))
    }
  }
  g.add(merged(stems, '#6a8a4a'))
  g.add(merged(leaves, leafC))
  return g
}

function rosemary(p: string[]) {
  const [pot, rim, leafC] = p
  const g = new THREE.Group()
  const y0 = herbPot(g, pot, rim)
  const r = rng(51)
  const stems: THREE.Mesh[] = []
  const needles: THREE.Mesh[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + r() * 0.3
    const rr = 0.8 + r() * 2.2
    const bx = Math.cos(a) * rr
    const bz = Math.sin(a) * rr
    const h = 10 + r() * 5
    const tx = bx + Math.cos(a) * 1.6
    const tz = bz + Math.sin(a) * 1.6
    stems.push(stem([bx, y0 - 0.2, bz], [tx, y0 + h, tz], 0.14, 0.07, '#7a6a4a', 5))
    const n = 11
    for (let k = 2; k <= n; k++) {
      const f = k / (n + 0.5)
      const base: V3 = [bx + (tx - bx) * f, y0 + h * f, bz + (tz - bz) * f]
      const yaw = k * 1.3
      needles.push(leafOut(base, 1.3, yaw, 0.5, leafC, 0.2, 0.2))
      needles.push(leafOut(base, 1.3, yaw + PI, 0.5, leafC, 0.2, 0.2))
    }
  }
  g.add(merged(stems, '#7a6a4a'))
  g.add(merged(needles, leafC))
  return g
}

/** 小番茄盆栽：[盆, 果, 叶] */
function miniTomato(p: string[]) {
  const [pot, fruit, leafC] = p
  const g = new THREE.Group()
  g.add(cup(6.5, 5.0, 12, 0.6, pot, {}))
  g.add(cyl(5.7, 5.5, 0.6, SOIL, { y: 10.4 }, 24))
  g.add(cyl(0.3, 0.3, 30, '#d9c48a', { x: 1.6, y: 9, z: -1.6 }, 8))
  const main: V3[] = [
    [0, 10.6, 0],
    [0.6, 16, -0.4],
    [0.3, 22, -0.9],
    [0.9, 28, -1.0],
    [0.7, 34, -1.1],
  ]
  const stems: THREE.Mesh[] = [...path(main, 0.35, 0.15, '#6a9a4a')]
  const leaves: THREE.Mesh[] = []
  const r = rng(61)
  for (let k = 0; k < 7; k++) {
    const y = 13 + k * 3
    const yaw = k * 2.2
    const base: V3 = [0.5, y, -0.6]
    const tip: V3 = [0.5 + Math.sin(yaw) * 4, y + 1.2, -0.6 + Math.cos(yaw) * 4]
    stems.push(stem(base, tip, 0.12, 0.08, '#6a9a4a', 5))
    for (let j = 0; j < 3; j++) {
      const f = 0.45 + j * 0.27
      const at: V3 = [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] + (tip[2] - base[2]) * f]
      leaves.push(leafOut(at, 2.0, yaw + PI / 2, -0.1, leafC, 0.55, 0.12))
      leaves.push(leafOut(at, 2.0, yaw - PI / 2, -0.1, leafC, 0.55, 0.12))
    }
    leaves.push(leafOut(tip, 2.2, yaw, -0.1, leafC, 0.55, 0.12))
  }
  for (let k = 0; k < 4; k++) leaves.push(leafOut([0.7, 34, -1.1], 2, k * 1.6, 0.5, leafC, 0.55, 0.12))
  g.add(merged(stems, '#6a9a4a'))
  g.add(merged(leaves, leafC))
  // 两串果
  const trusses: [V3, number][] = [
    [[0.6, 19, -0.5], 0.8],
    [[0.5, 26, -0.9], -2.2],
  ]
  for (const [[x, y, z], yaw] of trusses) {
    const ex = x + Math.sin(yaw) * 2.6
    const ez = z + Math.cos(yaw) * 2.6
    g.add(stem([x, y, z], [ex, y - 1.2, ez], 0.08, 0.06, '#6a9a4a', 5))
    for (let i = 0; i < 5; i++) {
      const f = 0.3 + i * 0.17
      const fx = x + (ex - x) * f + (r() - 0.5) * 0.6
      const fz = z + (ez - z) * f + (r() - 0.5) * 0.6
      const col = i < 2 ? fruit : i < 4 ? shade(fruit, 0.1, -0.1) : '#9ccf6a'
      g.add(ball(0.85, col, { x: fx, y: y - 2.2 - (i % 2) * 0.6, z: fz }))
    }
  }
  return g
}

/** 红薯水培藤蔓：[玻璃, 红薯, 叶] */
function sweetPotato(p: string[]) {
  const [glassC, potato, leafC] = p
  const g = new THREE.Group()
  const H = 11
  glassWater(g, 4.5, 4.0, H, 9.2, 0.35, glassC)
  const cy = 11
  g.add(ball(2.6, potato, { y: cy }, [1, 1.7, 1]))
  g.add(merged(toothpicks(H + 0.14, 5.4, 0.9), '#e9d2a6'))
  g.add(merged(roots(10, 0, cy - 4.2, 0, 4.4, 2.4, 71), ROOT))
  const vine = '#7a5a6a'
  const stems: THREE.Mesh[] = []
  const leaves: THREE.Mesh[] = []
  const shape: [number, number][] = [
    [0.8, 15.2],
    [2.6, 18],
    [5, 18.6],
    [7, 16.6],
    [8.2, 13],
    [8.8, 9],
    [9.0, 5.5],
  ]
  const yaws = [0.4, 2.5, 4.4]
  yaws.forEach((yaw, vi) => {
    const n = vi === 1 ? 7 : vi === 2 ? 5 : 6
    const pts: V3[] = shape.slice(0, n).map(([rr, y]) => [Math.sin(yaw) * rr, y, Math.cos(yaw) * rr])
    stems.push(...path(pts, 0.16, 0.1, vine))
    for (let i = 1; i < pts.length; i++) {
      const at = pts[i]
      leaves.push(leafOut(at, 2.8, yaw + (i % 2 ? 1.2 : -1.2), 0.15, leafC, 0.85, 0.12))
    }
  })
  for (let k = 0; k < 3; k++) leaves.push(leafOut([0, 15.3, 0], 2.4, k * 2.1 + 1.2, 0.8, leafC, 0.85, 0.12))
  g.add(merged(stems, vine))
  g.add(merged(leaves, leafC))
  return g
}

/** 生姜发芽：小碟上一块姜，[碟子, 姜, 芽] */
function gingerSprout(p: string[]) {
  const [dish, ginger, leafC] = p
  const g = new THREE.Group()
  g.add(cup(6.0, 4.8, 1.4, 0.3, dish, {}))
  g.add(cyl(5.3, 4.5, 0.15, '#f4f1ea', { y: 0.3 }, 24))
  const knobs: [number, number, number, number][] = [
    [-2.2, 1.6, 0, 1.4],
    [0, 1.7, 0.4, 1.5],
    [2.0, 1.6, -0.2, 1.3],
    [0.8, 1.6, 1.8, 1.0],
  ]
  for (const [x, y, z, rr] of knobs) g.add(ball(rr, ginger, { x, y, z }, [1.3, 0.8, 1]))
  const stems: THREE.Mesh[] = []
  const leaves: THREE.Mesh[] = []
  for (const [x, z, h, lean] of [
    [-0.2, 0.4, 12, 0.6],
    [2.0, -0.2, 9, -0.5],
  ]) {
    g.add(cyl(0.3, 0.32, 1.2, '#d6707a', { x, y: 2.4, z }, 8))
    const top: V3 = [x + lean, 2.4 + h, z]
    stems.push(stem([x, 3.4, z], top, 0.24, 0.12, '#7aaa5a', 6))
    for (let k = 0; k < 4; k++) {
      const f = 0.45 + k * 0.15
      const at: V3 = [x + lean * f, 2.4 + h * f, z]
      leaves.push(leafOut(at, 4, (k % 2 ? 1 : -1) * PI / 2 + lean * 0.3, 0.45, leafC, 0.22, 0.1))
    }
  }
  g.add(merged(stems, '#7aaa5a'))
  g.add(merged(leaves, leafC))
  return g
}

// ---------- 生活小物：痕迹 ----------

/** 保鲜袋晾干架：木底座 + 几根斜立的杆，袋子倒扣在杆上，[木, 袋, 封口条] */
function bagDryer(p: string[]) {
  const [wood, bag, zip] = p
  const g = new THREE.Group()
  g.add(puck(5, 1.2, wood, {}))
  const tilts: [number, number][] = [
    [0.3, 0.34],
    [2.4, 0.32],
    [4.3, 0.36],
  ]
  for (const [yaw, tilt] of tilts) {
    const top: V3 = [Math.sin(yaw) * Math.sin(tilt) * 18, 1.2 + Math.cos(tilt) * 18, Math.cos(yaw) * Math.sin(tilt) * 18]
    g.add(stem([0, 0.8, 0], top, 0.3, 0.25, shade(wood, -0.05), 8))
    g.add(ball(0.4, wood, { x: top[0], y: top[1], z: top[2] }))
    // 袋子：沿杆方向的薄片，袋底搭在杆顶
    const dir = new THREE.Vector3(top[0], top[1] - 0.8, top[2]).normalize()
    const bagG = new THREE.Group()
    bagG.add(ghost(rbox(6, 8.5, 1.2, bag, { y: -8.5 }, 0.5), bag, 0.45))
    bagG.add(rbox(6.1, 0.4, 1.3, zip, { y: -8.5 }, 0.15))
    bagG.position.set(top[0], top[1] + 0.3, top[2])
    // 袋子的宽边沿径向（像鳍一样张开），三只袋子互不相交
    const radial = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    const ax = radial.clone().addScaledVector(dir, -radial.dot(dir)).normalize()
    const az = new THREE.Vector3().crossVectors(ax, dir)
    bagG.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, dir, az))
    g.add(bagG)
  }
  return g
}

/** PET 瓶外壳（回转体，单面） + 内部液体 */
function petBottle(g: THREE.Group, liquid: string, label: string, capC: string, level: number, x = 0, z = 0, scale = 1) {
  const s = scale
  const prof: [number, number][] = [
    [0, 0],
    [3.0, 0],
    [3.3, 0.6],
    [3.3, 14.5],
    [3.0, 16.0],
    [1.8, 18.2],
    [1.3, 19.0],
    [1.3, 19.8],
  ]
  const mat = toon(GLASS, { transparent: 0.28 }).clone()
  mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * s, y * s)), 28), mat)
  m.position.set(x, 0, z)
  noOutline(m)
  g.add(m)
  g.add(ghost(cyl(3.15 * s, 2.9 * s, (level - 0.4) * s, liquid, { x, y: 0.4 * s, z }, 24), liquid, 0.7))
  g.add(cyl(3.35 * s, 3.35 * s, 5.5 * s, label, { x, y: 4 * s, z }, 28))
  g.add(cyl(1.5 * s, 1.5 * s, 1.6 * s, capC, { x, y: 19.6 * s, z }, 16))
}

/** 喝了一半的饮料瓶：[液体, 标签, 瓶盖] */
function halfDrink(p: string[]) {
  const g = new THREE.Group()
  petBottle(g, p[0], p[1], p[2], 11)
  return g
}

/** 剥了一半的橘子：[皮, 果肉, 白络] */
function peeledMikan(p: string[]) {
  const [peel, flesh, pith] = p
  const g = new THREE.Group()
  const fy = 2.6
  const fr = new THREE.Group()
  fr.add(ball(2.6, flesh, {}, [1, 0.85, 1]))
  for (let k = 0; k < 5; k++) {
    const t = torus(2.6, 0.05, pith, { ry: (k / 5) * PI })
    t.scale.set(1, 0.85, 1)
    fr.add(t)
  }
  g.add(P(fr, 0, fy - 0.2, 0))
  // 下半还包着的皮：半球壳
  const peelMat = toon(peel).clone()
  peelMat.side = THREE.DoubleSide
  const cupGeo = new THREE.SphereGeometry(2.72, 24, 10, 0, PI * 2, PI * 0.62, PI * 0.38)
  const pc = new THREE.Mesh(cupGeo, peelMat)
  pc.scale.set(1, 0.85, 1)
  pc.position.y = fy - 0.2
  pc.castShadow = true
  g.add(pc)
  // 摊开的花瓣皮：外橙内白
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + 0.3
    const cx = Math.sin(a) * 3.6
    const cz = Math.cos(a) * 3.6
    const outer = ball(1.8, peel, { x: cx, y: 0.2, z: cz }, [0.75, 0.1, 1.25])
    outer.rotation.y = a
    g.add(outer)
    const inner = ball(1.65, pith, { x: cx, y: 0.32, z: cz }, [0.68, 0.06, 1.15])
    inner.rotation.y = a
    g.add(inner)
  }
  // 掰下来的一瓣
  const seg = ball(1.4, flesh, { x: 5.6, y: 0.75, z: 2.2 }, [0.45, 0.55, 1])
  seg.rotation.y = 0.6
  g.add(seg)
  return g
}

/** 小猪存钱罐：[身体, 鼻子 / 耳朵, 硬币] */
function piggyBank(p: string[]) {
  const [body, snout, coin] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.0, 1.1, 2.2, body, { x: sx * 2.6, z: sz * 3.2 }, 12))
  g.add(ball(5, body, { y: 6.0 }, [1, 0.9, 1.25]))
  g.add(cylZ(1.6, 1.4, snout, 0, 6.2, 6.3, 20))
  for (const s of [-1, 1]) g.add(cylZ(0.3, 0.3, BLACK, s * 0.6, 6.2, 7.0, 10))
  for (const s of [-1, 1]) g.add(P(cyl(0.05, 1.2, 1.8, snout, {}, 4), s * 2.4, 10.0, 2.4, -0.3, PI / 4, -s * 0.4))
  g.add(rbox(3.0, 0.6, 0.45, BLACK, { y: 10.2 }, 0.15))
  g.add(torus(0.6, 0.18, snout, { y: 6.5, z: -6.4 }, PI * 1.5))
  const coins: [number, number, number][] = [
    [6.2, 0, 3.8],
    [6.4, 0.3, 3.6],
    [6.1, 0.6, 3.9],
  ]
  for (const [x, y, z] of coins) g.add(puck(1.1, 0.3, coin, { x, y, z }))
  return g
}

/** 零钱罐：玻璃罐里一堆硬币，[玻璃, 盖, 硬币主色] */
function coinJar(p: string[]) {
  const [glassC, lid, coinC] = p
  const g = new THREE.Group()
  g.add(ghost(cup(4.2, 4.2, 12, 0.35, glassC, {}), glassC, GLASS_A))
  g.add(cyl(4.45, 4.45, 1.5, lid, { y: 11.7 }, 28))
  g.add(rbox(2.6, 0.3, 0.4, BLACK, { y: 13.05 }, 0.1))
  const r = rng(81)
  const cols = [coinC, '#c9cdd2', '#c27a4a']
  const by: THREE.Mesh[][] = [[], [], []]
  for (let i = 0; i < 46; i++) {
    const rr = r() * 2.2
    const a = r() * PI * 2
    const y = 0.4 + (i / 46) * 5.6 + r() * 0.4
    const k = Math.floor(r() * 3)
    const c = puck(1.0 + r() * 0.3, 0.2, cols[k], { x: Math.cos(a) * rr, y, z: Math.sin(a) * rr })
    c.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8)
    by[k].push(c)
  }
  by.forEach((ms, k) => ms.length && g.add(merged(ms, cols[k])))
  return g
}

/** 手账页面 */
const journalPage =
  (ink: string, a: string, b: string, side: number): Draw =>
  (g, W, H) => {
    g.fillStyle = '#fbfaf3'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#e4e8ef'
    for (let y = H * 0.1; y < H; y += H * 0.06) g.fillRect(W * 0.06, y, W * 0.88, Math.max(1, H * 0.004))
    g.fillStyle = ink
    const r = rng(side + 3)
    for (let y = H * 0.16; y < H * 0.9; y += H * 0.06) {
      if (r() < 0.25) continue
      g.fillRect(W * 0.1, y - H * 0.018, W * (0.3 + r() * 0.5), Math.max(1, H * 0.008))
    }
    // 胶带条 + 贴纸
    g.fillStyle = a
    g.save()
    g.translate(W * 0.5, H * 0.08)
    g.rotate(side ? 0.08 : -0.06)
    g.fillRect(-W * 0.3, -H * 0.025, W * 0.6, H * 0.05)
    g.restore()
    g.fillStyle = b
    g.beginPath()
    g.arc(W * (side ? 0.78 : 0.25), H * 0.7, W * 0.1, 0, PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(W * (side ? 0.78 : 0.25), H * 0.7, W * 0.05, 0, PI * 2)
    g.fill()
  }

/** 手账本 + 彩色胶带：[封面, 胶带 A, 胶带 B] */
function journalTape(p: string[]) {
  const [cover, ta, tb] = p
  const g = new THREE.Group()
  g.add(rbox(30.4, 0.4, 21.4, cover, {}, 0.15))
  for (const s of [-1, 1]) {
    g.add(rbox(14.6, 0.8, 20.4, '#f4f1e6', { x: s * 7.5, y: 0.35 }, 0.25))
    g.add(flatScreen(14, 19.6, `journal|${ta}|${tb}|${s}`, journalPage(S.japanese.sumi, ta, tb, s > 0 ? 1 : 0), s * 7.5, 1.2, 0, 0))
  }
  g.add(rbox(0.6, 0.4, 20, shade(cover, -0.15), { y: 0.5 }, 0.15))
  // 胶带卷
  g.add(torus(1.9, 0.75, ta, { x: 19.5, y: 0.75, z: -5, rx: PI / 2 }))
  g.add(torus(1.6, 0.6, tb, { x: 18.6, y: 0.6, z: 1.0, rx: PI / 2 }))
  g.add(torus(1.6, 0.6, shade(ta, 0.1, -0.1), { x: 19.6, y: 1.8, z: -5, rx: PI / 2 }))
  // 一支笔
  g.add(P(cyl(0.4, 0.4, 13, S.modern.char, {}, 10), 9, 1.65, 7.5, 0, 0.15, PI / 2))
  return g
}

/** 快递面单 */
const shipLabel: Draw = (g, W, H) => {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#2b2a28'
  g.fillRect(W * 0.06, H * 0.08, W * 0.5, H * 0.07)
  for (let i = 0; i < 4; i++) g.fillRect(W * 0.06, H * (0.24 + i * 0.09), W * (0.4 + (i % 2) * 0.3), H * 0.035)
  const r = rng(91)
  let x = W * 0.08
  while (x < W * 0.92) {
    const bw = Math.max(1, W * (0.006 + r() * 0.018))
    g.fillRect(x, H * 0.66, bw, H * 0.22)
    x += bw + W * (0.006 + r() * 0.012)
  }
  g.strokeStyle = '#2b2a28'
  g.lineWidth = Math.max(1, W * 0.01)
  g.strokeRect(W * 0.66, H * 0.06, W * 0.28, W * 0.28)
}

/** 未拆的快递信封：[信封, 胶带, 点缀] */
function parcel(p: string[]) {
  const [env, tape, acc] = p
  const g = new THREE.Group()
  g.add(rbox(25, 1.4, 34, env, {}, 0.6))
  g.add(rbox(23.4, 0.5, 31, shade(env, 0.03), { y: 1.05 }, 0.25))
  g.add(rbox(25.2, 0.3, 2.6, tape, { y: 1.45, z: -14.5 }, 0.12)) // 顶面高出内衬 0.2，避免共面闪烁
  g.add(rbox(10.6, 0.25, 7.6, '#ffffff', { x: 3.2, y: 1.4, z: 3 }, 0.08))
  g.add(flatScreen(10, 7, 'ship-label', shipLabel, 3.2, 1.68, 3, 0))
  g.add(rbox(4.2, 0.25, 2.4, acc, { x: -7, y: 1.4, z: -8 }, 0.08))
  return g
}

/** 外卖袋：半透明塑料袋里叠着两盒便当，[袋, 便当盒, 饭菜] */
function takeoutBag(p: string[]) {
  const [bag, box, food] = p
  const g = new THREE.Group()
  for (let i = 0; i < 2; i++) {
    const y = 0.4 + i * 5.2
    g.add(rbox(18, 3.0, 12, box, { y }, 0.6))
    g.add(rbox(17, 0.6, 11, food, { y: y + 2.6 }, 0.3))
    g.add(ball(1.6, '#e28a3a', { x: 3, y: y + 3.4, z: 1 }, [1.3, 0.6, 1]))
    g.add(ball(1.2, '#78c47a', { x: -4, y: y + 3.3, z: -2 }, [1.2, 0.5, 1]))
    g.add(ghost(rbox(18.2, 1.8, 12.2, '#f4faff', { y: y + 3.0 }, 0.5), '#f4faff'))
  }
  g.add(ghost(rbox(22, 11.4, 15, bag, {}, 3), bag, 0.45))
  // 打结的提手
  for (const s of [-1, 1]) {
    const t = ghost(torus(3.0, 0.5, bag, { x: s * 2.2, y: 13.2, z: 0, ry: s * 0.25 }), bag, 0.55)
    g.add(t)
  }
  g.add(ghost(ball(1.2, bag, { y: 11.8 }), bag, 0.6))
  g.add(rbox(4, 0.3, 6, '#ffffff', { x: 6, y: 11.2, z: 2, rz: -0.1 }, 0.1))
  return g
}

/** 三角饭团（立放），朝 +z */
function onigiri(g: THREE.Group, x: number, z: number, ry: number, nori: string, strip: string) {
  const o = new THREE.Group()
  const tri: [number, number][] = []
  const pts: [number, number][] = [
    [-4.4, 0],
    [4.4, 0],
    [0, 7.6],
  ]
  // 圆角三角形
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % 3]
    for (let k = 1; k <= 6; k++) {
      const f = 0.12 + (k / 6) * 0.76
      tri.push([ax + (bx - ax) * f, ay + (by - ay) * f])
    }
  }
  o.add(frontExtrude(tri, 3.2, '#fbf7f1', 0, 0.8))
  o.add(rbox(5.2, 3.6, 3.4, nori, { y: 0.05 }, 0.3))
  o.add(rbox(0.5, 7.0, 3.5, strip, { y: 0.1 }, 0.15))
  o.add(rbox(3.6, 1.6, 0.2, '#ffffff', { y: 1.0, z: 1.75 }, 0.08))
  P(o, x, 0, z, 0, ry)
  g.add(o)
}

/** 便利店饭团 + 饮料：[饮料液体, 海苔, 撕拉条] */
function konbiniSet(p: string[]) {
  const [liquid, nori, strip] = p
  const g = new THREE.Group()
  onigiri(g, -6, 1.5, 0.2, nori, strip)
  onigiri(g, 2.5, 3.6, -0.35, nori, strip)
  petBottle(g, liquid, '#ffffff', '#3a7a4a', 15, 6, -3.5, 0.9)
  return g
}

/** 杯面：揭开一半的盖子 + 筷子 + 热气，[杯, 腰封, 盖] */
function cupNoodle(p: string[]) {
  const [cupC, band, lid] = p
  const g = new THREE.Group()
  const H = 9.5
  const rt = 4.8
  const rb = 3.5
  g.add(cup(rt, rb, H, 0.3, cupC, {}))
  const rAt = (y: number) => rb + ((rt - rb) * y) / H
  const bandGeo = new THREE.CylinderGeometry(rAt(7) + 0.06, rAt(3) + 0.06, 4, 32, 1, true)
  const bandMesh = new THREE.Mesh(bandGeo, toon(band))
  bandMesh.position.y = 5
  bandMesh.castShadow = true
  g.add(bandMesh)
  // 汤面和配料
  g.add(cyl(rAt(7.6) - 0.35, rAt(7.6) - 0.4, 0.3, '#d9a25a', { y: 7.3 }, 28))
  const r = rng(101)
  for (let i = 0; i < 6; i++) g.add(torus(0.9 + r() * 0.6, 0.14, '#f2d68a', { x: (r() - 0.5) * 3, y: 7.7, z: (r() - 0.5) * 3, rx: PI / 2 + (r() - 0.5) * 0.5 }))
  const tops: [string, number, number][] = [
    ['#ffd23a', 1.4, 1.0],
    ['#ff9f8a', -1.2, 1.4],
    ['#78c47a', 0.4, -1.4],
    ['#a8683a', -1.6, -0.6],
  ]
  for (const [c, x, z] of tops) g.add(rbox(0.8, 0.4, 0.8, c, { x, y: 7.7, z }, 0.15))
  // 盖子：绕后沿翻起
  const a = 1.75
  const lidG = new THREE.Group()
  lidG.add(cyl(rt + 0.1, rt + 0.1, 0.08, lid, { z: rt }, 32))
  g.add(P(lidG, 0, H + 0.05, -rt, -a))
  // 筷子架在杯口
  for (const dz of [-0.5, 0.5]) g.add(P(cyl(0.18, 0.25, 21, '#e6c48f', {}, 8), 0, H + 0.25, 1.4 + dz, 0, 0, PI / 2))
  return g
}

// ---------- 配色 ----------

const PS5_PALS: Pal[] = [
  ['modern', [M.white, M.black, '#6fb8ff']],
  ['modern', [M.black, M.char, '#6fb8ff']],
  ['cute', [C.sakura, '#3a3b44', '#ff9fd0']],
  ['cute', [C.sky, '#3a3b44', '#c8f0ff']],
  ['retro', [R.cream, '#3a3330', R.orange]],
]
const PS2_PALS: Pal[] = [
  ['retro', [BLACK, '#3a3d5c', BLUE]],
  ['modern', [M.char, M.black, BLUE]],
  ['modern', [M.light, M.gray, BLUE]],
  ['cute', [C.sky, M.white, C.pink]],
]
const XSX_PALS: Pal[] = [
  ['modern', [BLACK, '#7dff8a', M.white]],
  ['modern', [M.white, '#7dff8a', M.white]],
  ['cute', [C.lilac, '#ff9fd0', M.white]],
  ['nordic', [N.sage, N.mustard, M.white]],
]
const XSS_PALS: Pal[] = [
  ['modern', [M.white, '#3a3b40', M.white]],
  ['modern', [BLACK, M.char, M.white]],
  ['cute', [C.mint, '#4a4d52', M.white]],
  ['nordic', [N.linen, N.oak, M.white]],
]
const HANDHELD3DS: Pal[] = [
  ['modern', [M.black, M.char, M.gray]],
  ['cute', [C.pink, M.white, C.sakura]],
  ['cute', ['#4cc3ea', M.white, C.sky]],
  ['retro', [R.red, '#3a3330', R.cream]],
]
const SP_PALS: Pal[] = [
  ['modern', ['#3a5ca8', '#2c3f73', '#9fb8e8']],
  ['modern', [M.silver, M.char, M.gray]],
  ['retro', [R.red, '#3a3330', R.cream]],
  ['cute', [C.pink, M.white, '#ff8fd0']],
  ['cute', [C.lilac, M.white, C.mint]],
]
const GBC_PALS: Pal[] = [
  ['retro', ['#8a5cc0', '#5b5f72', '#3a3b44', '#2f6a4a']],
  ['cute', ['#4cc3c0', '#5b5f72', '#3a3b44', '#2f6a4a']],
  ['cute', ['#ff6f8f', '#5b5f72', '#3a3b44', '#2f6a4a']],
  ['retro', ['#ffd23a', '#5b5f72', '#3a3b44', '#2f6a4a']],
  ['modern', ['#e8eef4', '#5b5f72', '#3a3b44', '#2f6a4a']],
]
const POCKET_PALS: Pal[] = [
  ['modern', [M.silver, '#a8325e', '#5b5f72', '#2f6a4a']],
  ['retro', [R.mustard, '#3a3330', '#5b5f72', '#2f6a4a']],
  ['cute', [C.pink, '#a8325e', '#5b5f72', '#2f6a4a']],
  ['modern', [M.black, M.char, '#5b5f72', '#2f6a4a']],
]
const GLASS_PALS = (leafC: string, bulb: string): Pal[] => [
  ['nordic', [GLASS, bulb, leafC]],
  ['japanese', ['#e8f4ef', shade(bulb, -0.04), shade(leafC, -0.05)]],
  ['cute', ['#ffe4ec', bulb, shade(leafC, 0.06)]],
  ['modern', ['#eef1f4', bulb, shade(leafC, -0.1)]],
]
const HERB_POTS = (leafC: string): Pal[] => [
  ['nordic', ['#c8774e', '#d98b5f', leafC]],
  ['nordic', [N.white, N.oakL, leafC]],
  ['japanese', [J.sumi, J.dark, shade(leafC, -0.05)]],
  ['cute', [C.sakura, C.pink, shade(leafC, 0.05)]],
  ['modern', [M.char, M.gray, shade(leafC, -0.08)]],
]
const PAD_RETRO_FC: Pal[] = [
  ['retro', ['#a8323a', '#d9b45a', '#c8473a']],
  ['retro', ['#c9c4b8', '#3a3b44', '#a8325e']],
  ['cute', [C.pink, C.white, '#ff6f8f']],
  ['cute', [C.sky, C.white, C.lilac]],
]

// ---------- 素材 ----------

export const CONSOLES_LIFE: AssetDef[] = [
  // ===== 家用主机：PS 系 =====
  def('cl-ps5-standing', '双翼主机（PS5 风）', 'tabletop', [12.4, 26.2, 39.9], PS5_PALS, ps5Standing, { family: 'cl-console-ps5', sizeLabel: '竖放', form: 'standing' }),
  def('cl-ps5-lying', '双翼主机（PS5 风）', 'tabletop', [39, 26.2, 10.6], PS5_PALS, ps5Lying, { family: 'cl-console-ps5', sizeLabel: '横放', form: 'lying' }),
  def('cl-ps4', '斜切薄片主机（PS4 风）', 'tabletop', [27.5, 29.8, 5.5], [
    ['modern', [BLACK, '#121316', BLUE]],
    ['modern', [M.white, M.light, BLUE]],
    ['cute', [C.lilac, C.white, C.pink]],
    ['retro', [R.teal, R.cream, R.mustard]],
  ], ps4),
  def('cl-ps3', '圆弧顶主机（PS3 风）', 'tabletop', [32, 27.9, 9.8], [
    ['modern', [BLACK, M.silver, RED_LED]],
    ['modern', [M.white, M.silver, RED_LED]],
    ['retro', ['#3a3330', R.caramel, R.orange]],
    ['cute', [C.sky, C.white, C.pink]],
  ], ps3),
  def('cl-ps2-lying', '叠层黑主机（PS2 风）', 'tabletop', [30, 18.1, 8], PS2_PALS, ps2Lying, { family: 'cl-console-ps2', sizeLabel: '横放', form: 'lying' }),
  def('cl-ps2-standing', '叠层黑主机（PS2 风）', 'tabletop', [10, 19, 31.2], PS2_PALS, ps2Standing, { family: 'cl-console-ps2', sizeLabel: '竖放带支架', form: 'standing' }),
  def('cl-ps1', '灰色圆盖主机（PS1 风）', 'tabletop', [27, 19, 6.1], [
    ['retro', ['#c9c6bf', '#b7b4ad', '#8a8d93']],
    ['retro', [R.cream, R.caramel, R.teal]],
    ['modern', [M.char, M.black, M.gray]],
    ['cute', [C.white, C.sakura, C.lilac]],
  ], ps1),

  // ===== 家用主机：Xbox 系 =====
  def('cl-xsx-standing', '立方塔主机（Series X 风）', 'tabletop', [15.1, 15.6, 30.6], XSX_PALS, xsxStanding, { family: 'cl-console-xsx', sizeLabel: '竖放', form: 'standing' }),
  def('cl-xsx-lying', '立方塔主机（Series X 风）', 'tabletop', [30, 15.6, 15.1], XSX_PALS, xsxLying, { family: 'cl-console-xsx', sizeLabel: '横放', form: 'lying' }),
  def('cl-xss-standing', '白色扁盒主机（Series S 风）', 'tabletop', [7, 15.5, 27.5], XSS_PALS, xssStanding, { family: 'cl-console-xss', sizeLabel: '竖放', form: 'standing' }),
  def('cl-xss-lying', '白色扁盒主机（Series S 风）', 'tabletop', [27.5, 15.5, 7], XSS_PALS, xssLying, { family: 'cl-console-xss', sizeLabel: '横放', form: 'lying' }),
  def('cl-xone', '长方黑主机（Xbox One 风）', 'tabletop', [33.3, 27.6, 8.1], [
    ['modern', ['#2a2b30', '#151619', M.white]],
    ['modern', [M.white, M.light, M.white]],
    ['industrial', [S.industrial.iron, '#222', S.industrial.rust]],
    ['cute', [C.mint, C.white, C.lemon]],
  ], xone),
  def('cl-x360', '内凹白主机（Xbox 360 风）', 'tabletop', [30.9, 26.1, 8.3], [
    ['modern', [M.white, M.light, '#7dff8a']],
    ['modern', [BLACK, M.char, '#7dff8a']],
    ['cute', [C.sakura, C.white, '#7dff8a']],
    ['retro', [R.cream, R.caramel, '#7dff8a']],
  ], x360),

  // ===== 家用主机：任天堂系 =====
  def('cl-switch-dock', '底座 + 主机（Switch 风）', 'tabletop', [24.5, 5.7, 11.7], [
    ['cute', ['#4cc3ea', '#ff6f61', DARK]],
    ['modern', [M.gray, M.gray, DARK]],
    ['modern', [M.white, M.white, M.white]],
    ['cute', [C.pink, C.mint, M.white]],
    ['retro', [R.teal, R.orange, DARK]],
  ], switchDock),
  def('cl-wii', '白色竖放主机 + 体感手柄（Wii 风）', 'tabletop', [18.2, 21.8, 16.6], [
    ['modern', [M.white, BLUE, M.white]],
    ['modern', [BLACK, BLUE, BLACK]],
    ['cute', [C.white, '#ff9fd0', C.sakura]],
    ['nordic', [N.white, BLUE, N.linen]],
  ], wii),
  def('cl-gamecube', '紫色方盒主机（GameCube 风）', 'tabletop', [15.2, 16.4, 12.7], [
    ['retro', ['#5a4a9a', '#4a3d82', '#c9c6e8']],
    ['modern', [BLACK, '#2a2b30', M.gray]],
    ['retro', [R.orange, '#c25a24', R.cream]],
    ['modern', [M.silver, M.gray, M.white]],
    ['cute', [C.lilac, C.sakura, C.white]],
  ], gamecube),
  def('cl-n64', '插卡带主机（N64 风）', 'tabletop', [26, 19.4, 12.4], [
    ['retro', ['#4a4b52', '#8a8d93', '#5a5b62']],
    ['retro', [R.cream, R.caramel, R.mustard]],
    ['cute', [C.lilac, C.white, C.pink]],
    ['modern', [M.char, M.silver, M.black]],
  ], n64),
  def('cl-famicom', '红白机（FC 风）', 'tabletop', [23, 15.2, 10.3], [
    ['retro', ['#f1e8d6', '#a8323a', '#d9b45a']],
    ['retro', [R.cream, R.teal, R.mustard]],
    ['cute', [C.white, '#ff8f9a', C.lemon]],
    ['modern', [M.light, M.char, M.silver]],
  ], famicom),
  def('cl-sfc', '圆润灰主机（超任风）', 'tabletop', [20, 24.3, 12], [
    ['retro', ['#c9c6bf', '#8a6fb8', '#7b7a80']],
    ['retro', [R.cream, R.teal, R.caramel]],
    ['cute', [C.white, C.lilac, C.sky]],
    ['modern', [M.char, M.gray, M.black]],
  ], sfc),
  def('cl-megadrive', '圆台黑主机（MD 风）', 'tabletop', [28, 21.3, 12.3], [
    ['retro', [BLACK, '#d8403a', '#d9b45a']],
    ['retro', ['#3a3330', R.orange, R.mustard]],
    ['modern', [M.char, '#d8403a', M.silver]],
    ['cute', [C.white, C.pink, C.lemon]],
  ], megadrive),
  def('cl-mini-arcade', '迷你街机复刻机', 'tabletop', [14, 15.5, 26], [
    ['retro', [BLACK, '#e2702f', '#ffd27a']],
    ['retro', [R.cream, R.teal, '#ffb3e0']],
    ['cute', [C.white, C.pink, '#a8e6ff']],
    ['modern', [M.char, M.black, '#a46bff']],
  ], miniArcade),

  // ===== 手柄 =====
  def('cl-pad-ps5', '游戏手柄', 'tabletop', [15.8, 10.4, 4.3], [
    ['modern', [M.white, BLACK, '#6fb8ff']],
    ['modern', [BLACK, '#3a3b40', '#6fb8ff']],
    ['cute', [C.sakura, M.white, '#ff9fd0']],
    ['cute', [C.sky, M.white, C.lilac]],
    ['retro', [R.cream, '#3a3330', R.orange]],
  ], padPS5, { family: 'cl-pad', sizeLabel: '双翼 · PS5 风' }),
  def('cl-pad-ps1', '游戏手柄', 'tabletop', [15.8, 10.4, 3.6], [
    ['retro', ['#c9c6bf', '#5b5f72', '#8a8d93']],
    ['modern', [BLACK, M.char, M.gray]],
    ['cute', [C.white, C.lilac, C.pink]],
    ['retro', [R.cream, R.caramel, R.teal]],
  ], padPS1, { family: 'cl-pad', sizeLabel: '初代 · PS1 风' }),
  def('cl-pad-fc', '游戏手柄', 'tabletop', [12.6, 5.4, 1.9], PAD_RETRO_FC, padFC, { family: 'cl-pad', sizeLabel: '方形 · FC 风' }),
  def('cl-pad-sfc', '游戏手柄', 'tabletop', [14.6, 6.4, 2.5], [
    ['retro', ['#c9c6bf', '#a39fb8', '#3a3b44']],
    ['retro', [R.cream, R.caramel, '#3a3330']],
    ['cute', [C.white, C.lilac, M.char]],
    ['modern', [M.char, M.gray, BLACK]],
  ], padSFC, { family: 'cl-pad', sizeLabel: '狗骨头 · 超任风' }),
  def('cl-pad-n64', '游戏手柄', 'tabletop', [16, 11.8, 4.7], [
    ['retro', ['#8a8d93', '#5b5f72', '#f2c94c']],
    ['retro', [R.cream, R.caramel, R.mustard]],
    ['cute', [C.lilac, C.white, C.lemon]],
    ['modern', [M.char, M.black, '#f2c94c']],
  ], padN64, { family: 'cl-pad', sizeLabel: '三叉 · N64 风' }),
  def('cl-pad-gc', '游戏手柄', 'tabletop', [15.1, 10.6, 5.2], [
    ['retro', ['#5a4a9a', '#8a8d93', '#f2c94c']],
    ['modern', [BLACK, M.gray, '#f2c94c']],
    ['retro', [R.orange, M.gray, R.mustard]],
    ['cute', [C.lilac, C.white, C.lemon]],
  ], padGC, { family: 'cl-pad', sizeLabel: 'GC 风' }),
  def('cl-pad-md', '游戏手柄', 'tabletop', [16.8, 8.7, 4.3], [
    ['retro', [BLACK, '#3a3b44', '#5b5f72']],
    ['retro', ['#3a3330', R.orange, R.caramel]],
    ['cute', [C.white, C.pink, C.sky]],
    ['modern', [M.char, M.gray, M.black]],
  ], padMD, { family: 'cl-pad', sizeLabel: '月牙 · MD 风' }),
  def('cl-pad-wii', '游戏手柄', 'tabletop', [9.7, 14.8, 4.7], [
    ['modern', [M.white, M.white, BLUE]],
    ['modern', [BLACK, BLACK, BLUE]],
    ['cute', [C.sakura, C.white, '#ff9fd0']],
    ['cute', [C.sky, C.white, C.mint]],
  ], padWii, { family: 'cl-pad', sizeLabel: '体感 · Wii 风' }),

  // ===== 掌机 =====
  def('cl-3ds-open', '翻盖双屏掌机（3DS 风）', 'tabletop', [13.4, 9.5, 8.3], HANDHELD3DS, clamshell(CLAM_3DS, true), { family: 'cl-3ds', sizeLabel: '打开', form: 'open' }),
  def('cl-3ds-closed', '翻盖双屏掌机（3DS 风）', 'tabletop', [13.4, 7.6, 2.4], HANDHELD3DS, clamshell(CLAM_3DS, false), { family: 'cl-3ds', sizeLabel: '合上', form: 'closed' }),
  def('cl-dslite', '翻盖双屏掌机（DS Lite 风）', 'tabletop', [13.3, 9.6, 8.2], [
    ['modern', [M.white, M.light, M.gray]],
    ['modern', [BLACK, M.char, M.gray]],
    ['cute', [C.pink, M.white, C.sakura]],
    ['cute', [C.sky, M.white, C.lilac]],
  ], clamshell(CLAM_DSL, true), { form: 'open' }),
  def('cl-gbasp-open', '翻盖掌机（GBA SP 风）', 'tabletop', [8.2, 10.9, 9.3], SP_PALS, clamshell(CLAM_SP, true), { family: 'cl-gbasp', sizeLabel: '打开', form: 'open' }),
  def('cl-gbasp-closed', '翻盖掌机（GBA SP 风）', 'tabletop', [8.2, 8.6, 2.7], SP_PALS, clamshell(CLAM_SP, false), { family: 'cl-gbasp', sizeLabel: '合上', form: 'closed' }),
  def('cl-psp', '横长宽屏掌机（PSP 风）', 'tabletop', [17, 7.4, 2.5], [
    ['modern', [BLACK, '#121316', M.char]],
    ['modern', [M.white, M.light, M.gray]],
    ['cute', [C.pink, M.white, C.sakura]],
    ['retro', [R.caramel, '#3a3330', R.cream]],
  ], psp),
  def('cl-vita', '椭长双摇杆掌机（Vita 风）', 'tabletop', [18.2, 8.4, 2.9], [
    ['modern', [BLACK, '#121316', M.char]],
    ['modern', [M.white, BLACK, M.gray]],
    ['cute', [C.sky, BLACK, C.white]],
    ['cute', [C.sakura, BLACK, C.white]],
  ], vita),
  def('cl-gba', '横向掌机（GBA 风）', 'tabletop', [14.4, 8.6, 2.8], [
    ['retro', ['#5a4a9a', '#a39fb8', '#3a3b44']],
    ['retro', [R.orange, R.cream, '#3a3b44']],
    ['cute', [C.sakura, C.white, '#3a3b44']],
    ['cute', [C.mint, C.white, '#3a3b44']],
    ['modern', [M.char, M.gray, BLACK]],
  ], gba),
  def('cl-gbc', '透明壳竖向掌机（Game Boy Color 风）', 'tabletop', [7.8, 13.3, 3.2], GBC_PALS, gbVertical({ w: 7.8, d: 13.3, h: 2.7, clear: true, sw: 4.4, sd: 4.0, scene: ['plat-color', platScene(PLAT_COLOR)] })),
  def('cl-gbpocket', '竖向掌机（Game Boy Pocket 风）', 'tabletop', [7.7, 12.7, 2.9], POCKET_PALS, gbVertical({ w: 7.7, d: 12.7, h: 2.5, clear: false, sw: 4.8, sd: 4.3, scene: ['plat-pocket', platScene(PLAT_POCKET)] })),
  def('cl-steamdeck', '大型双摇杆掌机（Steam Deck 风）', 'tabletop', [30, 11.7, 4.3], [
    ['modern', [M.char, M.black, M.gray]],
    ['modern', [M.white, M.char, M.gray]],
    ['cute', [C.lilac, M.white, C.pink]],
    ['industrial', [S.industrial.iron, S.industrial.rust, S.industrial.steel]],
  ], steamDeck),
  def('cl-switch-lite', '一体掌机（Switch Lite 风）', 'tabletop', [20.8, 9.1, 2.3], [
    ['cute', [C.lemon, M.char, M.char]],
    ['cute', ['#5ed0c4', M.char, M.char]],
    ['modern', [M.gray, M.black, M.black]],
    ['cute', ['#ff8f86', M.white, M.white]],
    ['nordic', [N.blue, N.white, N.white]],
  ], switchLite),
  def('cl-switch-oled', '支架斜立掌机（Switch OLED 风）', 'tabletop', [24.5, 7.1, 9.8], [
    ['modern', [M.white, M.white, M.black]],
    ['cute', ['#4cc3ea', '#ff6f61', DARK]],
    ['cute', [C.pink, C.lilac, M.white]],
    ['modern', [M.char, M.char, M.black]],
  ], switchOled),
  // ===== 生活：水培 / 盆栽 =====
  def('cl-garlic-sprout', '水培蒜苗', 'plants', [7.8, 5.9, 24.7], GLASS_PALS(C.leaf, '#f3ead8'), garlicSprout),
  def('cl-negi-regrow', '水培葱', 'plants', [6.4, 6.4, 21.5], GLASS_PALS('#5fb35f', '#f6f4e8'), negiRegrow),
  def('cl-sprout-box', '萝卜苗培育盒', 'kitchenware', [12, 9, 8.7], [
    ['nordic', [GLASS, N.white, '#8ad06a']],
    ['cute', [C.sakura, C.white, '#8ad06a']],
    ['modern', [M.light, M.white, '#6fbf5a']],
    ['japanese', [J.washi, J.hinoki, '#7ac05a']],
  ], sproutBox),
  def('cl-avocado-pit', '牛油果核水培', 'plants', [8, 8.2, 20.3], GLASS_PALS(C.leafD, '#8a5a3a'), avocadoPit),
  def('cl-herb-basil', '窗台香草盆', 'plants', [11.2, 11.2, 19.7], HERB_POTS('#4fae4f'), basil, { family: 'cl-herb-pot', sizeLabel: '罗勒' }),
  def('cl-herb-mint', '窗台香草盆', 'plants', [12.9, 11.4, 17.3], HERB_POTS('#7ccf7a'), mint, { family: 'cl-herb-pot', sizeLabel: '薄荷' }),
  def('cl-herb-rosemary', '窗台香草盆', 'plants', [11.2, 11.2, 23], HERB_POTS('#5e8a6a'), rosemary, { family: 'cl-herb-pot', sizeLabel: '迷迭香' }),
  def('cl-mini-tomato', '小番茄盆栽', 'plants', [13, 13, 39], [
    ['nordic', ['#c8774e', '#ff5a4a', C.leafD]],
    ['nordic', [N.white, '#ff5a4a', C.leafD]],
    ['cute', [C.sakura, '#ff6f61', C.leaf]],
    ['japanese', [J.sumi, '#e8503a', C.leafD]],
    ['modern', [M.char, '#ff5a4a', C.leafD]],
  ], miniTomato),
  def('cl-sweet-potato', '红薯水培藤蔓', 'plants', [16.9, 19.1, 19], GLASS_PALS('#7cc46a', '#a8475a'), sweetPotato),
  def('cl-ginger-sprout', '生姜发芽', 'kitchenware', [12, 12, 14.9], [
    ['japanese', [J.washi, '#d9b27a', '#7aaa5a']],
    ['nordic', [N.white, '#d9b27a', '#8ab86a']],
    ['cute', [C.sky, '#e0b880', '#8ad06a']],
    ['modern', [M.char, '#d9b27a', '#7aaa5a']],
  ], gingerSprout),

  // ===== 生活痕迹 =====
  def('cl-bag-dryer', '晾干中的保鲜袋', 'kitchenware', [14.2, 14.7, 19.4], [
    ['nordic', [N.oak, '#eef6ff', N.blue]],
    ['japanese', [J.wood, '#f4f8f4', J.shu]],
    ['cute', [C.woodL, '#fff0f4', C.pink]],
    ['modern', [M.walnut, '#f2f4f6', M.char]],
  ], bagDryer),
  def('cl-half-drink', '喝了一半的饮料瓶', 'tabletop', [6.7, 6.7, 21.2], [
    ['japanese', ['#c9a24a', '#3a7a4a', '#3a7a4a']],
    ['modern', ['#5a2a1a', '#d8403a', '#d8403a']],
    ['cute', ['#ffb36a', '#ffffff', C.orange]],
    ['nordic', ['#cfe8f4', N.blue, N.white]],
  ], halfDrink),
  def('cl-peeled-mikan', '剥了一半的橘子', 'kitchenware', [11.4, 11.2, 4.6], [
    ['japanese', ['#ff9a2e', '#ffb347', '#fff3d6']],
    ['cute', ['#ffa64d', '#ffc06a', '#fff6e0']],
    ['retro', [R.orange, '#f2a64a', R.cream]],
  ], peeledMikan),
  def('cl-piggy-bank', '小猪存钱罐', 'tabletop', [12.5, 13.7, 10.9], [
    ['cute', [C.pink, '#ff8fa8', '#ffd23a']],
    ['cute', [C.sky, '#7fbce8', '#ffd23a']],
    ['nordic', [N.white, N.linen, '#e3b549']],
    ['retro', [R.mustard, R.caramel, '#ffd23a']],
    ['japanese', [J.washi, J.shu, '#e3b549']],
  ], piggyBank),
  def('cl-coin-jar', '零钱罐', 'tabletop', [8.9, 8.9, 13.4], [
    ['nordic', [GLASS, N.oak, '#e3b549']],
    ['modern', ['#eef1f4', M.silver, '#e3b549']],
    ['cute', ['#ffe4ec', C.pink, '#ffd23a']],
    ['retro', ['#f4f0dc', R.red, R.mustard]],
  ], coinJar),
  def('cl-journal-tape', '手账本 + 彩色胶带', 'tabletop', [37.3, 21.4, 2.4], [
    ['cute', [C.sakura, C.mint, C.lemon]],
    ['nordic', [N.sage, N.mustard, N.blue]],
    ['japanese', [J.ai, J.shu, J.tatami]],
    ['retro', [R.caramel, R.teal, R.orange]],
  ], journalTape),
  def('cl-parcel', '未拆的快递信封', 'tabletop', [25.2, 34, 1.7], [
    ['nordic', ['#c9a27a', '#d9c49a', '#e85d5d']],
    ['modern', [M.light, '#c9cdd2', M.char]],
    ['cute', [C.sakura, C.white, C.lemon]],
    ['industrial', ['#9a7a5a', '#c46a3a', '#2b2a28']],
  ], parcel),
  def('cl-takeout-bag', '外卖袋', 'kitchenware', [22, 15, 16.7], [
    ['modern', ['#ffffff', BLACK, '#f4e7c8']],
    ['japanese', ['#fff8ee', J.shu, '#f4e7c8']],
    ['cute', ['#fff0f4', C.pink, '#fff3dc']],
  ], takeoutBag),
  def('cl-konbini-set', '便利店饭团 + 饮料', 'kitchenware', [19, 12.5, 19.1], [
    ['japanese', ['#c9a24a', '#2a3a2a', '#e8403a']],
    ['modern', ['#5a2a1a', '#2a2a2a', '#3a7ad8']],
    ['cute', ['#ffb36a', '#2a3a2a', C.pink]],
    ['nordic', ['#cfe8f4', '#2a3a2a', N.mustard]],
  ], konbiniSet),
  def('cl-cup-noodle', '泡面（冒热气）', 'kitchenware', [21, 11.4, 19.1], [
    ['modern', [M.white, '#d8403a', M.white]],
    ['retro', [R.cream, R.orange, R.cream]],
    ['cute', [C.white, C.pink, C.sakura]],
    ['japanese', [J.washi, J.shu, J.washi]],
  ], cupNoodle, { fx: [{ kind: 'steam', x: 0, y: 10, z: 0.9, scale: 0.8 }] }),
]
