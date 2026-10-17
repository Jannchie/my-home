// 收藏类素材包：花瓶 / 瓷器、矿石 / 化石、硬币、邮票，以及放收藏品的展示家具。
// 约定见 kit.ts 开头。全部 id 以 col- 开头，避免和其他素材包撞名。
// 瓶身一律用 LatheGeometry 车削（口沿空心）；纹样用细环带 + 浮出的小贴片近似；
// 画面（邮票、标签、硬币册页面、盘心纹样）都用 paintPanel 画在贴图上，圆形 / 异形画面用 alphaTest 抠形。

import * as THREE from 'three'
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { ball, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, legs, paintPanel, rectPoly, rng, rod, type AssetDef, type Poly } from '../kit'
import { swingDoor } from './styles-world'
import { G, P, PI, UP, fitGroup, ghost, lit, mesh, noOutline, type V3 } from '../geo'
import { I, J, M, N, PROP, R, define, type PalFlat } from '../packkit'

type RY = [number, number]
type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

const GOLD = '#e3b549'
const SILVER = '#cfd3d8'
const COPPER = '#c67a4a'
const BRASS = '#d8b45a'
const GLASS = '#d6eef8'
const PAPER = '#fbf8f0'
const INK = '#3a3434'
const STEEL = '#c3c7cc'

// ---------- 小工具 ----------

/** 双面半透明（玻璃罩这类单层曲面） */
function ghost2<T extends THREE.Mesh>(m: T, color: string, a = 0.28): T {
  const mat = toon(color, { transparent: a }).clone()
  mat.side = THREE.DoubleSide
  m.material = mat
  m.castShadow = false
  m.userData.noOutline = true
  return m
}

const F = (b: (p: string[]) => THREE.Group) => (p: string[]) => fitGroup(b(p))

/** 平放的画面：w × d，画布顶边朝后（-z），(x, z) 为中心，y 为高度 */
function paintTop(w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number) {
  return paintPanel(w, d, key, draw, { x, y, z: z + d / 2, rx: -PI / 2 })
}

/** 画面按透明度抠形（圆盘、异形切片、带齿孔的邮票） */
function cutout<T extends THREE.Mesh>(m: T): T {
  ;(m.material as THREE.MeshToonMaterial).alphaTest = 0.5
  return m
}

/** 沿 z 的圆柱（朝前的圆盘），给中心 */
const cylZg = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 24) => P(G(cyl(r, r, len, color, { y: -len / 2 }, seg)), x, y, z, PI / 2)

/** 沿 x 的横圆柱，给中心 */
const cylXg = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 20) => P(G(cyl(r, r, len, color, { y: -len / 2 }, seg)), x, y, z, 0, 0, PI / 2)

/** yz 平面里的扁撑板（相框背撑） */
function strutZ(az: number, ay: number, bz: number, by: number, w: number, t: number, color: string, x = 0) {
  const m = rbox(w, Math.hypot(bz - az, by - ay), t, color, {}, Math.min(0.3, t * 0.4))
  m.position.set(x, (ay + by) / 2, (az + bz) / 2)
  m.rotation.x = Math.atan2(bz - az, by - ay)
  return m
}

/** 平放的硬币，at.y 为底 */
const coin = (r: number, color: string, x: number, y: number, z: number, t = 0.22) => puck(r, t, color, { x, y, z })
/** 竖着朝前的硬币，给中心 */
const coinZ = (r: number, color: string, x: number, y: number, z: number, t = 0.25) => cylZg(r, t, color, x, y, z, 28)

const COIN_COLS = [GOLD, SILVER, COPPER, SILVER, BRASS, '#b8bcc2']

// ---------- 车削 ----------

const V2 = (x: number, y: number) => new THREE.Vector2(x, y)

function spline(ctrl: RY[], n = 36) {
  return new THREE.SplineCurve(ctrl.map(([r, y]) => V2(r, y))).getSpacedPoints(n)
}

function radiusAt(pts: THREE.Vector2[], y: number) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)
  }
  return pts[pts.length - 1].x
}

interface Vessel {
  m: THREE.Mesh
  /** 外壁在高度 y 处的半径 */
  r: (y: number) => number
  /** 口沿顶 */
  top: number
}

/**
 * 空心器皿：ctrl 是外轮廓控制点 [半径, 高]（从底到口，第一个点 y = 0），壁厚 t。
 * 内壁沿法线向里偏移 t，口沿是半圆，内底高 t × 1.3。
 */
function vessel(ctrl: RY[], t: number, color: string, seg = 40): Vessel {
  const out = spline(ctrl)
  const n = out.length
  const nrm = (i: number) => {
    const a = out[Math.max(0, i - 1)]
    const b = out[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l = Math.hypot(dx, dy) || 1
    return V2(-dy / l, dx / l)
  }
  const floor = t * 1.3
  const k = Math.min(t, out[0].x * 0.25)
  const pts = [V2(0, 0), V2(out[0].x - k, 0), V2(out[0].x, k)]
  for (let i = 1; i < n; i++) if (out[i].y > k) pts.push(out[i].clone())
  const O = out[n - 1]
  const No = nrm(n - 1)
  const T = V2(No.y, -No.x)
  for (let j = 1; j < 6; j++) {
    const a = (j / 6) * PI
    pts.push(
      O.clone()
        .addScaledVector(No, t / 2 - (Math.cos(a) * t) / 2)
        .addScaledVector(T, (Math.sin(a) * t) / 2),
    )
  }
  for (let i = n - 1; i >= 0; i--) {
    const q = out[i].clone().addScaledVector(nrm(i), t)
    if (q.y <= floor + 0.05) break
    q.x = Math.max(q.x, 0.12)
    pts.push(q)
  }
  pts.push(V2(Math.max(0.12, pts[pts.length - 1].x * 0.6), floor), V2(0, floor))
  return { m: mesh(new THREE.LatheGeometry(pts, seg), color), r: (y) => radiusAt(out, y), top: O.y + t / 2 }
}

/** 实心车削体（盖子、钮）：ctrl 从底到顶，第一点 y = 0 */
function solid(ctrl: RY[], color: string, seg = 32) {
  const out = spline(ctrl, 24)
  return mesh(new THREE.LatheGeometry([V2(0, 0), ...out, V2(0, out[out.length - 1].y)], seg), color)
}

/** 显式点列车削（盘、碟这种薄而平的） */
function latheRaw(pts: RY[], color: string, seg = 40) {
  return mesh(new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg), color)
}

/** 瓶身上的环带纹 */
function band(v: Vessel, y: number, color: string, tube = 0.2) {
  return noOutline(torus(v.r(y) + tube * 0.15, tube, color, { y, rx: PI / 2 }))
}

/** 瓶身上浮出的小纹样贴片：高度 y、方位角 a，宽 sw 高 sh */
function patch(v: Vessel, y: number, a: number, sw: number, sh: number, color: string) {
  const r = v.r(y)
  const s = v.r(y + 0.4) - v.r(y - 0.4)
  const m = noOutline(ball(1, color, { z: r }, [sw, sh, 0.16]))
  m.rotation.x = Math.atan2(s, 0.8)
  return P(G(m), 0, y, 0, 0, a)
}

// ---------- 花瓶 / 瓷器 ----------

const VASE_PALS: PalFlat[] = [
  ['japanese', '#f5f2ea', J.ai, J.dark],
  ['japanese', '#a9cbb7', '#6f9a84', J.dark],
  ['retro', '#e0b04a', '#8a4b2a', R.caramel],
  ['modern', '#2f2d30', '#c9a45c', M.black],
  ['nordic', '#f4f1ea', N.blue, N.oak],
]

/** 梅瓶：小口、丰肩、敛足 */
function meiping(p: string[]) {
  const [body, deco] = p
  const v = vessel(
    [
      [5, 0],
      [5.6, 3],
      [7.6, 12],
      [9, 20.5],
      [8.4, 24.5],
      [5, 28],
      [2.6, 29.6],
      [2.3, 30.6],
      [2.8, 31.4],
    ],
    0.45,
    body,
  )
  const g = G(v.m, band(v, 1.6, deco), band(v, 4.2, deco, 0.14), band(v, 25.6, deco))
  for (let i = 0; i < 6; i++) {
    g.add(patch(v, 16, (i * PI) / 3 + 0.3, 1.7, 1.2, deco))
    g.add(patch(v, 10.5, (i * PI) / 3 + 0.3 + PI / 6, 0.8, 0.6, deco))
  }
  return g
}

/** 葫芦瓶：上下两个球腹，腰间系绳 */
function hulu(p: string[]) {
  const [body, deco, cord] = p
  const v = vessel(
    [
      [4.5, 0],
      [6.2, 1.6],
      [8, 5.5],
      [7.8, 10],
      [5.4, 13.6],
      [3.4, 15.6],
      [4.9, 18.6],
      [5.2, 21.4],
      [3.6, 24.8],
      [1.8, 26.6],
      [2, 27.6],
    ],
    0.4,
    body,
  )
  const g = G(v.m, band(v, 1.2, deco), band(v, 26.2, deco, 0.15))
  g.add(noOutline(torus(v.r(15.6) + 0.2, 0.28, cord, { y: 15.6, rx: PI / 2 })))
  // 绳结 + 垂下的穗
  g.add(ball(0.55, cord, { x: 0, y: 15.5, z: v.r(15.6) + 0.5 }))
  const kz = v.r(15.6) + 0.45
  const ey = 13.2
  const ez = v.r(ey) + 0.45
  const L = Math.hypot(ez - kz, 15.4 - ey)
  g.add(P(G(cyl(0.35, 0.15, L, cord, { y: -L })), 0, 15.4, kz, -Math.atan2(ez - kz, 15.4 - ey)))
  for (let i = 0; i < 5; i++) g.add(patch(v, 7.5, (i * 2 * PI) / 5, 1.4, 1.1, deco))
  return g
}

/** 玉壶春瓶：撇口、细颈、垂腹 */
function yuhuchun(p: string[]) {
  const [body, deco] = p
  const v = vessel(
    [
      [4, 0],
      [4.3, 1],
      [6.6, 4],
      [8, 8.6],
      [7, 13],
      [4.2, 17],
      [2.4, 21],
      [2.5, 25],
      [3.8, 28.4],
      [4.4, 29.4],
    ],
    0.4,
    body,
  )
  const g = G(v.m, band(v, 1.8, deco), band(v, 12.6, deco, 0.16), band(v, 21.6, deco, 0.14), band(v, 28, deco, 0.14))
  for (let i = 0; i < 8; i++) g.add(patch(v, 18.5, (i * PI) / 4, 0.35, 1.5, deco))
  return g
}

/** 天球瓶：球腹、直长颈 */
function tianqiu(p: string[]) {
  const [body, deco] = p
  const v = vessel(
    [
      [6, 0],
      [9, 2],
      [12, 7.6],
      [12.4, 11.6],
      [10.6, 17.6],
      [5.4, 21.6],
      [3.1, 23.6],
      [2.9, 29],
      [3.1, 34.6],
    ],
    0.45,
    body,
  )
  const g = G(v.m, band(v, 1, deco), band(v, 22.8, deco), band(v, 33.6, deco, 0.15))
  for (let i = 0; i < 7; i++) {
    const a = (i * 2 * PI) / 7
    g.add(patch(v, 11.5, a, 2.2, 1.6, deco))
    g.add(patch(v, 15.4, a + 0.45, 1, 0.7, deco))
    g.add(patch(v, 7.4, a + 0.45, 1, 0.7, deco))
  }
  return g
}

/** 长颈瓶（鹤首）：扁球腹 + 细长颈 */
function longneck(p: string[]) {
  const [body, deco] = p
  const v = vessel(
    [
      [4, 0],
      [5.2, 1],
      [7, 4.6],
      [7.2, 7.6],
      [5, 11.6],
      [1.9, 15.6],
      [1.4, 21],
      [1.45, 27],
      [1.7, 29.4],
    ],
    0.35,
    body,
  )
  return G(v.m, band(v, 6.4, deco, 0.16), band(v, 28.6, deco, 0.12))
}

/** 砧青瓷鱼耳瓶：直筒腹、长颈、颈上一对耳 */
function kinuta(p: string[]) {
  const [body, deco] = p
  const v = vessel(
    [
      [5, 0],
      [5.3, 0.7],
      [6.5, 1.6],
      [6.6, 11.8],
      [5.4, 14.4],
      [2.4, 16],
      [2, 20],
      [2.2, 24.8],
      [3.2, 27],
    ],
    0.4,
    body,
  )
  const g = G(v.m)
  for (const s of [-1, 1]) {
    g.add(torus(1.1, 0.34, body, { x: s * (v.r(21) + 0.9), y: 21.2 }))
    g.add(ball(0.5, body, { x: s * (v.r(22) + 0.2), y: 22.3 }, [1.2, 0.7, 0.8]))
  }
  g.add(band(v, 1.6, deco, 0.12))
  return g
}

/** 青花将军罐（带盔顶盖，放在木座上） */
function bwJar(p: string[]) {
  const [body, blue, wood] = p
  const g = G(puck(7.6, 1.6, wood), puck(6.8, 0.6, shade(wood, -0.08), { y: 1.4 }))
  const y0 = 1.9
  const v = vessel(
    [
      [6, 0],
      [6.4, 0.8],
      [9, 5],
      [11, 11],
      [10.2, 16],
      [7, 19.5],
      [6, 20.5],
      [6.2, 22],
    ],
    0.5,
    body,
  )
  const jar = G(v.m)
  for (const y of [1.5, 4.8, 16.6, 19.8]) jar.add(band(v, y, blue, 0.2))
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4
    jar.add(patch(v, 10.8, a, 1.8, 1.8, blue))
    jar.add(patch(v, 10.8, a + PI / 8, 0.5, 1.1, blue))
    jar.add(patch(v, 7.6, a + PI / 8, 0.9, 0.6, blue))
    jar.add(patch(v, 13.8, a + PI / 8, 0.9, 0.6, blue))
    jar.add(patch(v, 18.2, a, 0.6, 0.8, blue))
    jar.add(patch(v, 2.9, a + PI / 8, 0.35, 1, blue))
  }
  // 盖：宽沿 + 穹顶 + 宝珠钮
  const lid = solid(
    [
      [6.9, 0],
      [7, 0.7],
      [6.2, 2.4],
      [3.4, 3.8],
      [1.2, 4.3],
    ],
    body,
  )
  jar.add(P(lid, 0, v.top + 0.05, 0))
  jar.add(noOutline(torus(6.95, 0.18, blue, { y: v.top + 0.45, rx: PI / 2 })))
  jar.add(ball(1.5, body, { y: v.top + 5.3 }))
  jar.add(cyl(0.2, 0.7, 1.4, body, { y: v.top + 6.4 }))
  g.add(P(jar, 0, y0, 0))
  return g
}

/** 青花缠枝赏瓶：环带 + 腹部缠枝花 + 颈部蕉叶纹 */
function bwVase(p: string[]) {
  const [body, blue] = p
  const v = vessel(
    [
      [5.5, 0],
      [6, 1],
      [9, 6],
      [10, 11],
      [8, 17],
      [4, 21],
      [3, 24],
      [3.1, 30],
      [4.5, 33.6],
      [5, 34.6],
    ],
    0.45,
    body,
  )
  const g = G(v.m)
  for (const y of [1.4, 4, 17.6, 22, 33.6]) g.add(band(v, y, blue, 0.18))
  for (let i = 0; i < 7; i++) {
    const a = (i * 2 * PI) / 7
    g.add(patch(v, 11, a, 2, 1.8, blue))
    g.add(patch(v, 13.4, a + PI / 7, 0.9, 0.6, blue))
    g.add(patch(v, 8.4, a + PI / 7, 0.9, 0.6, blue))
    g.add(patch(v, 2.6, a, 0.4, 0.9, blue))
  }
  for (let i = 0; i < 10; i++) g.add(patch(v, 26.6, (i * PI) / 5, 0.55, 2.4, blue))
  return g
}

const BW_PALS: PalFlat[] = [
  ['japanese', '#f5f3ec', '#2f4d8a', J.dark],
  ['retro', '#f5f0e6', '#b8443a', R.caramel],
  ['modern', '#f4f4f2', M.black, M.black],
  ['retro', '#e9cf7a', '#2f4d8a', I.walnut],
  ['nordic', '#f7f5f0', '#5f86b0', N.oak],
]

/** 伊万里赏盘的盘心：染付蓝 + 赤 + 金，六开光 */
function drawImari(ground: string, blue: string, red: string, gold: string): Draw {
  return (g, W, H) => {
    const cx = W / 2
    const cy = H / 2
    const r = Math.min(W, H) / 2
    g.save()
    g.beginPath()
    g.arc(cx, cy, r, 0, PI * 2)
    g.clip()
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * PI * 2 + 0.06
      const a1 = ((k + 1) / 6) * PI * 2 - 0.06
      g.fillStyle = k % 2 ? red : blue
      g.beginPath()
      g.arc(cx, cy, r * 0.96, a0, a1)
      g.arc(cx, cy, r * 0.6, a1, a0, true)
      g.closePath()
      g.fill()
      const am = (a0 + a1) / 2
      g.fillStyle = k % 2 ? gold : ground
      for (let j = -1; j <= 1; j++) {
        const rr = r * 0.78
        const aa = am + j * 0.28
        g.beginPath()
        g.arc(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, r * (j ? 0.05 : 0.08), 0, PI * 2)
        g.fill()
      }
    }
    g.strokeStyle = gold
    g.lineWidth = r * 0.025
    g.beginPath()
    g.arc(cx, cy, r * 0.54, 0, PI * 2)
    g.stroke()
    g.fillStyle = blue
    g.beginPath()
    g.arc(cx, cy, r * 0.42, 0, PI * 2)
    g.fill()
    g.fillStyle = ground
    g.beginPath()
    g.arc(cx, cy, r * 0.37, 0, PI * 2)
    g.fill()
    g.fillStyle = red
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2 - PI / 2
      g.beginPath()
      g.arc(cx + Math.cos(a) * r * 0.16, cy + Math.sin(a) * r * 0.16, r * 0.12, 0, PI * 2)
      g.fill()
    }
    g.fillStyle = gold
    g.beginPath()
    g.arc(cx, cy, r * 0.08, 0, PI * 2)
    g.fill()
    g.restore()
  }
}

/** 伊万里风赏盘：立在木盘架上，半径 Rp */
function imariPlate(Rp: number) {
  return (p: string[]) => {
    const [ground, blue, red, wood] = p
    const s = Rp / 15
    const g = new THREE.Group()
    const plate = new THREE.Group()
    const pts: RY[] = [
      [0, 0.5],
      [4.5, 0.5],
      [4.6, 0],
      [5.4, 0],
      [5.6, 0.6],
      [11, 1.2],
      [14, 2.4],
      [15, 3.1],
      [15.1, 3.4],
      [14.8, 3.6],
      [13.6, 3],
      [10.5, 1.9],
      [0, 1.8],
    ]
    plate.add(latheRaw(pts.map(([r, y]) => [r * s, y * s] as RY), ground, 48))
    plate.add(noOutline(torus(14.85 * s, 0.22 * s, GOLD, { y: 3.4 * s, rx: PI / 2 })))
    const D = 20.8 * s
    plate.add(cutout(paintTop(D, D, `col-imari-${ground}-${blue}-${red}`, drawImari(ground, blue, red, GOLD), 0, 1.9 * s + 0.3, 0)))
    const a = PI / 2 - 0.26
    const yBot = 1 * s * Math.cos(a) - Rp * Math.sin(a)
    const zFront = 1 * s * Math.sin(a) + Rp * Math.cos(a)
    const yc = 1.25 - yBot
    g.add(P(plate, 0, yc, 0, a))
    // 盘架：底板 + 前挡 + 两根后撑
    const bw = Rp * 0.9
    g.add(rbox(bw, 1.2, zFront + 10, wood, { z: (zFront + 1.4 - 8.6) / 2 }, 0.4))
    g.add(rbox(bw, 1.6, 1.2, wood, { y: 1.1, z: zFront + 0.75 }, 0.4))
    const lz = -0.45 * Rp
    const ly = 0.4 * s
    const ty = yc + ly * Math.cos(a) - lz * Math.sin(a)
    const tz = ly * Math.sin(a) + lz * Math.cos(a)
    for (const sx of [-1, 1]) g.add(strutZ(tz - 0.4, ty, -7.6, 1, 1.4, 0.8, wood, sx * Rp * 0.3))
    return g
  }
}

const IMARI_PALS: PalFlat[] = [
  ['japanese', '#f7f3ea', '#2f4d8a', '#c8473a', J.dark],
  ['japanese', '#f6f0e1', '#4f8a6a', '#d65a3c', J.wood],
  ['retro', '#f4e7c8', '#2f5f8a', '#c8473a', R.caramel],
  ['modern', '#f4f4f2', '#24252a', '#8a8d93', M.black],
]

/** 抹茶碗（侘寂的碗形：微收口、高台） */
function chawan(color: string) {
  return vessel(
    [
      [2.7, 0],
      [3, 0.9],
      [5.4, 2.4],
      [6.3, 4.8],
      [6.5, 7.4],
      [6.3, 8.1],
    ],
    0.45,
    color,
  )
}

/** 茶碗收藏：长木板上三只不同釉色的抹茶碗 */
function chawanSet(p: string[]) {
  const [a, b, c, board] = p
  const g = G(rbox(48, 1.5, 16, board, {}, 0.5))
  ;[a, b, c].forEach((col, i) => {
    const v = chawan(col)
    const bowl = G(v.m, band(v, 3.4, shade(col, -0.12), 0.18), band(v, 0.5, '#c9a27a', 0.25))
    for (let k = 0; k < 6; k++) bowl.add(patch(v, 6.4, (k * PI) / 3 + i, 0.5, 1.2, shade(col, 0.12)))
    g.add(P(bowl, -15.2 + i * 15.2, 1.5, 0, 0, i * 0.7))
  })
  return g
}

/** 九谷烧风豆皿的五种纹样 */
const KUTANI: Draw[] = [
  (g, W, H) => {
    g.fillStyle = '#2e7d4f'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#e2b53a'
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) g.fillRect(((i + 0.3 + (j % 2) * 0.5) * W) / 6, ((j + 0.3) * H) / 6, W * 0.07, H * 0.07)
  },
  (g, W, H) => {
    g.fillStyle = '#e2b53a'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#6b4a8a'
    g.lineWidth = W * 0.05
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      for (let x = 0; x <= W; x += W / 24) g.lineTo(x, ((k + 0.5) * H) / 5 + Math.sin((x / W) * PI * 4) * H * 0.04)
      g.stroke()
    }
  },
  (g, W, H) => {
    g.fillStyle = '#f6f0e1'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#b8443a'
    g.lineWidth = W * 0.08
    g.beginPath()
    g.arc(W / 2, H / 2, W * 0.42, 0, PI * 2)
    g.stroke()
    g.fillStyle = '#b8443a'
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2
      g.beginPath()
      g.arc(W / 2 + Math.cos(a) * W * 0.13, H / 2 + Math.sin(a) * H * 0.13, W * 0.1, 0, PI * 2)
      g.fill()
    }
    g.fillStyle = '#e3b549'
    g.beginPath()
    g.arc(W / 2, H / 2, W * 0.07, 0, PI * 2)
    g.fill()
  },
  (g, W, H) => {
    g.fillStyle = '#2f4d8a'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#f6f0e1'
    for (const [x, y] of [
      [0.3, 0.35],
      [0.65, 0.3],
      [0.5, 0.68],
    ]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * PI * 2
        g.beginPath()
        g.arc(W * x + Math.cos(a) * W * 0.06, H * y + Math.sin(a) * H * 0.06, W * 0.05, 0, PI * 2)
        g.fill()
      }
    }
  },
  (g, W, H) => {
    g.fillStyle = '#6b4a8a'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#2e7d4f'
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const x = ((i + 0.5 + (j % 2) * 0.5) * W) / 4
        const y = ((j + 0.5) * H) / 4
        g.beginPath()
        g.moveTo(x, y - H * 0.1)
        g.lineTo(x + W * 0.08, y)
        g.lineTo(x, y + H * 0.1)
        g.lineTo(x - W * 0.08, y)
        g.closePath()
        g.fill()
      }
  },
]

function circleClip(draw: Draw): Draw {
  return (g, W, H) => {
    g.save()
    g.beginPath()
    g.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, PI * 2)
    g.clip()
    draw(g, W, H)
    g.restore()
  }
}

/** 九谷烧风小碟组：漆托盘里五只豆皿 */
function kutaniSet(p: string[]) {
  const [body, trayC] = p
  const g = G(tray(36, 2.2, 23, 1, trayC))
  const dish: RY[] = [
    [0, 0.4],
    [3, 0.4],
    [3.1, 0],
    [3.6, 0],
    [3.8, 0.4],
    [4.6, 0.8],
    [5, 1.3],
    [5.05, 1.5],
    [4.7, 1.55],
    [4.3, 1.1],
    [3.4, 0.8],
    [0, 0.75],
  ]
  const spots: [number, number][] = [
    [-11, -4.8],
    [0, -4.8],
    [11, -4.8],
    [-5.5, 5],
    [5.5, 5],
  ]
  spots.forEach(([x, z], i) => {
    const d = G(latheRaw(dish, body, 32))
    d.add(cutout(paintTop(7.2, 7.2, `col-kutani-${i}`, circleClip(KUTANI[i]), 0, 1.05, 0)))
    g.add(P(d, x, 1, z, 0, i * 0.5))
  })
  return g
}

const GLASS_PALS: PalFlat[] = [
  ['modern', GLASS],
  ['retro', '#e8b46a'],
  ['nordic', '#9fd6b0'],
  ['modern', '#9a9ea6'],
  ['cute', '#f4b6c6'],
]

/** 玻璃花瓶：半透明瓶身 + 一点水 */
function glassVase(ctrl: RY[], water: number) {
  return (p: string[]) => {
    const [col] = p
    const t = 0.35
    const v = vessel(ctrl, t, col)
    ghost(v.m, col, 0.38)
    const g = G(v.m)
    const wp: RY[] = []
    const floor = t * 1.3 + 0.05
    for (let k = 0; k <= 8; k++) {
      const y = floor + ((water - floor) * k) / 8
      wp.push([Math.max(0.2, v.r(y) - t - 0.12), y - floor])
    }
    const w = latheRaw([[0, 0], ...wp, [0, water - floor]], '#bfe6ff', 32)
    ghost(w, '#bfe6ff', 0.3)
    g.add(P(w, 0, floor, 0))
    return g
  }
}

/** 陶艺小罐三只：高罐、带盖扁罐、茶叶罐 */
function potteryJars(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const v1 = vessel(
    [
      [3.5, 0],
      [4.5, 2],
      [5, 5],
      [4, 8],
      [2.6, 9],
      [2.8, 9.8],
    ],
    0.45,
    a,
  )
  const j1 = G(v1.m, band(v1, 5, shade(a, -0.15), 0.2))
  for (let k = 0; k < 5; k++) j1.add(patch(v1, 8.1, (k * 2 * PI) / 5, 0.6, 1, shade(a, 0.15)))
  g.add(P(j1, -9.5, 0, 0.5))
  const v2 = vessel(
    [
      [4, 0],
      [5.5, 1.8],
      [6, 3.8],
      [5.2, 5.8],
      [4.6, 6.4],
    ],
    0.45,
    b,
  )
  const j2 = G(v2.m)
  j2.add(P(solid([[4.9, 0], [4.7, 0.6], [3, 1.3], [1.2, 1.5]], b), 0, v2.top + 0.02))
  j2.add(ball(0.8, shade(b, -0.15), { y: v2.top + 1.9 }, [1, 0.8, 1]))
  j2.add(band(v2, 3.8, shade(b, -0.15), 0.18))
  g.add(P(j2, 1.5, 0, -0.5))
  const v3 = vessel(
    [
      [3, 0],
      [3.3, 0.8],
      [3.4, 10.6],
      [2.6, 12.2],
      [1.7, 12.8],
    ],
    0.35,
    c,
  )
  const j3 = G(v3.m, band(v3, 3, shade(c, -0.12), 0.16), band(v3, 8, shade(c, -0.12), 0.16))
  j3.add(P(solid([[2.2, 0], [2.2, 1.2], [1.4, 1.6]], shade(c, -0.2)), 0, v3.top - 0.1))
  g.add(P(j3, 10.5, 0, 0.5))
  return g
}

/** 青瓷三足香炉（木座） */
function censer(p: string[]) {
  const [body, wood] = p
  const g = G(puck(7.6, 1.2, wood))
  const v = vessel(
    [
      [5, 0],
      [6.2, 1.2],
      [6.9, 3.4],
      [6.6, 5.6],
      [6.9, 6.4],
    ],
    0.45,
    body,
  )
  const y0 = 3.6
  g.add(P(G(v.m, band(v, 3.4, shade(body, -0.12), 0.16)), 0, y0, 0))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    g.add(cyl(0.45, 0.7, y0 - 1.2 + 0.5, body, { x: Math.cos(a) * 3.6, y: 1.2, z: Math.sin(a) * 3.6 }, 12))
  }
  for (const s of [-1, 1]) g.add(P(G(rbox(0.5, 2.6, 2.4, body, {}, 0.2)), s * 6.6, y0 + v.top - 0.4, 0))
  // 耳的开孔用一块小的深色贴片表示
  for (const s of [-1, 1]) g.add(noOutline(rbox(0.3, 1.2, 1.2, shade(body, -0.25), { x: s * 6.6, y: y0 + v.top + 0.7 }, 0.1)))
  return g
}

// ---------- 矿石 / 化石 ----------

const rockCache = new Map<string, THREE.BufferGeometry>()
/** 不规则石块（单位半径），底部压平 */
function rockGeo(seed: number, detail = 1, amp = 0.22) {
  const key = `${seed}|${detail}|${amp}`
  let geo = rockCache.get(key)
  if (!geo) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
    g.deleteAttribute('normal')
    g.deleteAttribute('uv')
    g = mergeVertices(g)
    const r = rng(seed)
    const p = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).multiplyScalar(1 + (r() - 0.5) * 2 * amp)
      if (v.y < -0.55) v.y = -0.55 + (v.y + 0.55) * 0.15
      p.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    geo = g
    // 模块级缓存、多件家具共用：标记共享，disposeUnshared 不释放
    geo.userData.shared = true
    rockCache.set(key, geo)
  }
  return geo
}

/** 石块：size 是三个方向的半径，(x, y, z) 中 y 是底 */
function rock(size: V3, color: string, seed: number, x: number, y: number, z: number, ry = 0, detail = 1, amp = 0.22) {
  const m = mesh(rockGeo(seed, detail, amp), color)
  m.scale.set(...size)
  m.position.set(x, y + size[1] * 0.6, z)
  m.rotation.y = ry
  return m
}

/** 六方柱晶体：从 from 沿 dir 长出去 */
function crystal(r: number, len: number, color: string, from: V3, dir: V3, tip = r * 1.7) {
  const g = G(cyl(r, r, len, color, {}, 6), cyl(0, r, tip, color, { y: len }, 6))
  g.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize())
  g.position.set(...from)
  return g
}

/** 椭圆环（剖面上的玛瑙层） */
function ellRing(ax: number, ay: number, bx: number, by: number, depth: number, color: string, z: number) {
  const s = new THREE.Shape()
  s.absellipse(0, 0, ax, ay, 0, PI * 2, false, 0)
  const h = new THREE.Path()
  h.absellipse(0, 0, bx, by, 0, PI * 2, true, 0)
  s.holes.push(h)
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 32 })
  const m = mesh(geo, color)
  m.position.z = z
  return m
}

/** 剖开的晶洞：后半个椭球外壳 + 剖面玛瑙层 + 洞里的晶簇。原点在剖面中心 */
function geodeBody(p: string[], Rr: number, sy: number, sz: number, n: number, seed: number) {
  const [rockC, xtal, xtalL, rim] = p
  const g = new THREE.Group()
  const sh = mesh(new THREE.SphereGeometry(Rr, 32, 20, PI, PI), rockC)
  sh.scale.set(1, sy, sz)
  g.add(sh)
  g.add(ellRing(Rr, Rr * sy, Rr * 0.95, Rr * sy * 0.95, 0.4, shade(rockC, 0.08), -0.1))
  g.add(ellRing(Rr * 0.95, Rr * sy * 0.95, Rr * 0.86, Rr * sy * 0.87, 0.4, rim, -0.08))
  g.add(ellRing(Rr * 0.86, Rr * sy * 0.87, Rr * 0.8, Rr * sy * 0.81, 0.4, xtalL, -0.12))
  const cx = Rr * 0.8
  const cy = Rr * sy * 0.81
  const cz = Rr * sz * 0.75
  const cav = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, PI, PI), toon(shade(xtal, -0.12)).clone())
  ;(cav.material as THREE.Material).side = THREE.DoubleSide
  cav.scale.set(cx, cy, cz)
  noOutline(cav)
  g.add(cav)
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const th = Math.acos(1 - 2 * r())
    const ph = PI + r() * PI
    const u = new THREE.Vector3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th))
    const base: V3 = [u.x * cx * 0.92, u.y * cy * 0.92, u.z * cz * 0.92]
    const dir = new THREE.Vector3(-u.x, -u.y, -u.z + 0.7).normalize()
    const cr = Rr * (0.035 + r() * 0.025)
    let len = Rr * (0.1 + r() * 0.1)
    const room = (-0.15 - base[2]) / Math.max(0.05, dir.z) - cr * 1.7
    len = Math.max(cr, Math.min(len, room))
    g.add(crystal(cr, len, i % 3 ? xtal : xtalL, base, [dir.x, dir.y, dir.z]))
  }
  return g
}

const GEODE_PALS: PalFlat[] = [
  ['nordic', '#8f8a83', '#8e5fbf', '#c7a6e8', '#e8e1d4', N.oak],
  ['modern', '#5b5d61', '#7b4fb0', '#b98ce0', '#d7d8db', M.black],
  ['retro', '#9a8f80', '#e0a526', '#f4d27a', '#f4e7c8', R.caramel],
  ['nordic', '#7d7a74', '#7fa3c8', '#d4e3f0', '#f7f5f0', N.white],
]

/** 桌面紫水晶晶洞：立在小底座上 */
function geodeDesk(p: string[]) {
  const base = p[4]
  const Rr = 8.5
  const sy = 1.15
  const g = G(rbox(13, 1.6, 9, base, { z: -2.2 }, 0.5))
  g.add(P(geodeBody(p, Rr, sy, 0.62, 34, 5), 0, 1.6 + Rr * sy - 0.6, 0))
  return g
}

/** 落地紫晶洞（教堂洞）：铁底座上的高大晶洞 */
function geodeCathedral(p: string[]) {
  const base = p[4]
  const Rr = 14
  const sy = 2.1
  const g = G(rbox(26, 5, 18, base, { z: -4.5 }, 0.8), rbox(22, 1.2, 14, shade(base, -0.1), { y: 5, z: -4.5 }, 0.4))
  g.add(P(geodeBody(p, Rr, sy, 0.7, 110, 9), 0, 6.2 + Rr * sy - 1.2, 0))
  return g
}

/** 水晶簇：扁平母岩 + 一丛六方柱 */
function quartzCluster(p: string[], seed = 3) {
  const [xtal, rockC] = p
  const g = G(rock([7, 1.6, 5.4], rockC, seed, 0, 0, 0, 0, 1, 0.18))
  const r = rng(seed * 7 + 1)
  g.add(crystal(1.3, 7.5, xtal, [0, 1.4, 0], [0.05, 1, 0.08]))
  for (let i = 0; i < 13; i++) {
    const a = r() * PI * 2
    const rr = 1.2 + r() * 3.6
    const tilt = 0.25 + r() * 0.6
    const cr = 0.45 + r() * 0.55
    const len = 2 + cr * 4 + r() * 2
    g.add(
      crystal(cr, len, i % 2 ? xtal : shade(xtal, 0.06), [Math.cos(a) * rr, 1.3, Math.sin(a) * rr * 0.8], [Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)]),
    )
  }
  return g
}

/** 黄铁矿：母岩上长出几块互相穿插的立方晶 */
function pyrite(p: string[]) {
  const [gold, rockC] = p
  const g = G(rock([6.5, 1.5, 5], rockC, 21, 0, 0, 0, 0.4, 1, 0.2))
  const cubes: [number, number, number, number, number, number, number][] = [
    [3.4, -0.6, 1.2, 0, 0.1, 0.4, 0.05],
    [2.4, 2.6, 1.4, 0.9, 0.25, 0.9, 0.2],
    [1.8, -3.2, 1.6, -0.6, -0.2, 0.2, 0.3],
    [1.4, 0.8, 3.9, 0.6, 0.3, 0.7, -0.2],
    [1.1, -1.8, 1.8, 2.4, 0.4, 0.1, 0.1],
    [1, 3.2, 1.6, -1.8, 0.1, 0.5, 0.4],
  ]
  for (const [s, x, y, z, rx, ry, rz] of cubes) {
    g.add(rbox(s, s, s, gold, { x, y: y - s / 2, z, rx, ry, rz }, 0.12))
  }
  return g
}

/** 不规则切片的轮廓函数 */
const blobR = (a: number, k1: number, k2: number) => 1 + 0.1 * Math.sin(3 * a + k1) + 0.06 * Math.sin(5 * a + k2)

/** 异形切片（玛瑙、陨石切片）：边是厚 0.6 的挤出，两面贴画；原点在切片中心 */
function slice(rx: number, ry: number, k1: number, k2: number, edge: string, key: string, draw: (g: CanvasRenderingContext2D, W: number, H: number, path: (sc: number) => void) => void) {
  const s = new THREE.Shape()
  const n = 48
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * PI * 2
    const b = blobR(a, k1, k2)
    if (i === 0) s.moveTo(rx * b * Math.cos(a), ry * b * Math.sin(a))
    else s.lineTo(rx * b * Math.cos(a), ry * b * Math.sin(a))
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false })
  geo.translate(0, 0, -0.3)
  const g = G(mesh(geo, edge))
  const W = rx * 2.4
  const H = ry * 2.4
  const dr: Draw = (c, PW, PH) => {
    const path = (sc: number) => {
      c.beginPath()
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * PI * 2
        const b = blobR(a, k1, k2) * sc
        const x = PW / 2 + ((rx * b * Math.cos(a)) / W) * PW
        const y = PH / 2 - ((ry * b * Math.sin(a)) / H) * PH
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.closePath()
    }
    draw(c, PW, PH, path)
  }
  g.add(cutout(paintPanel(W, H, key, dr, { y: -H / 2, z: 0.42 })))
  g.add(cutout(paintPanel(W, H, key, dr, { y: -H / 2, z: -0.42, ry: PI })))
  return g
}

/** 玛瑙切片：立在木座的槽里 */
function agateSlice(p: string[]) {
  const [c1, c2, c3, wood] = p
  const rx = 6
  const ry = 4.8
  const sl = slice(rx, ry, 1.2, 0.4, c3, `col-agate-${c1}-${c2}-${c3}`, (g, W, H, path) => {
    g.fillStyle = c3
    path(0.98)
    g.fill()
    const cols = [c1, c2, shade(c1, -0.12), c2, shade(c1, 0.1)]
    for (let k = 0; k < 10; k++) {
      g.fillStyle = cols[k % cols.length]
      path(0.92 - k * 0.075)
      g.fill()
    }
    g.fillStyle = '#f4f7f8'
    path(0.16)
    g.fill()
    g.fillStyle = '#ffffff'
    for (let k = 0; k < 8; k++) {
      g.beginPath()
      g.arc(W / 2 + Math.cos(k) * W * 0.03, H / 2 + Math.sin(k * 1.7) * H * 0.03, W * 0.008, 0, PI * 2)
      g.fill()
    }
  })
  return G(rbox(10, 1.8, 4.2, wood, {}, 0.5), P(sl, 0, ry * 1.17 + 0.8, 0))
}

/** 萤石八面体：外层半透明，里面一颗深色的色带核 */
function octa(r: number, outer: string, inner: string) {
  const o = ghost(mesh(new THREE.OctahedronGeometry(r), outer), outer, 0.55)
  const i = mesh(new THREE.OctahedronGeometry(r * 0.55), inner)
  return G(o, i)
}

function fluorite(p: string[]) {
  const [outer, inner, wood] = p
  const g = G(rbox(16, 1.2, 8, wood, {}, 0.4))
  // 大的一颗尖朝下插在小台座里
  g.add(cyl(1.4, 1.8, 1.2, shade(wood, -0.15), { x: -3.5, y: 1.2 }, 20))
  g.add(P(octa(3.2, outer, inner), -3.5, 2.4 + 3.2 * 0.75, 0, 0, 0.4))
  // 两颗小的平躺
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, -1, 0))
  for (const [r, x, z, ry] of [
    [1.8, 3, -1, 0.3],
    [1.3, 5.8, 1.6, 1.1],
  ]) {
    const o = octa(r, outer, inner)
    o.quaternion.copy(q)
    const w = G(o)
    w.position.set(x, 1.2 + r / Math.sqrt(3), z)
    w.rotation.y = ry
    g.add(w)
  }
  return g
}

let ammoGeo: THREE.BufferGeometry | null = null
const AM = { turns: 3.2, Re: 6, R0: 0.22, kr: 0.46, kz: 0.36 }
const amTh = AM.turns * PI * 2
const amK = Math.log(AM.Re / AM.R0) / amTh
const amRc = (t: number) => AM.R0 * Math.exp(amK * t)

/** 菊石：对数螺线盘绕的管 + 横肋，立在木座上 */
function ammonite(p: string[]) {
  const [shell, rib, wood] = p
  if (!ammoGeo) {
    ammoGeo = new ParametricGeometry(
      (u, v, target) => {
        const t = u * amTh
        const Rc = amRc(t)
        const a = v * PI * 2
        const rr = AM.kr * Rc
        target.set((Rc + rr * Math.cos(a)) * Math.cos(t), (Rc + rr * Math.cos(a)) * Math.sin(t), AM.kz * Rc * Math.sin(a))
      },
      220,
      16,
    )
    // 模块级缓存、多件家具共用：标记共享，disposeUnshared 不释放
    ammoGeo.userData.shared = true
  }
  const am = G(mesh(ammoGeo, shell))
  const basis = (t: number) => {
    const X = new THREE.Vector3(Math.cos(t), Math.sin(t), 0)
    const Y = new THREE.Vector3(0, 0, 1)
    const Z = new THREE.Vector3().crossVectors(X, Y)
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))
  }
  for (let t = amTh - PI * 2.3; t < amTh - 0.15; t += 0.17) {
    const Rc = amRc(t)
    const m = noOutline(torus(1, 0.07, rib))
    m.quaternion.copy(basis(t))
    m.scale.set(AM.kr * Rc * 1.01, AM.kz * Rc * 1.01, AM.kr * Rc)
    m.position.set(Rc * Math.cos(t), Rc * Math.sin(t), 0)
    am.add(m)
  }
  // 口部封上
  const Re = amRc(amTh)
  const cap = ball(1, shade(shell, -0.08))
  cap.quaternion.copy(basis(amTh))
  cap.scale.set(AM.kr * Re, AM.kz * Re, AM.kr * Re * 0.4)
  cap.position.set(Re * Math.cos(amTh), Re * Math.sin(amTh), 0)
  am.add(cap)
  am.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(am, true)
  am.position.set(-(b.min.x + b.max.x) / 2, 1.6 - b.min.y - 0.5, 0)
  return G(rbox(11, 1.6, 6.5, wood, {}, 0.5), am)
}

/** 三叶虫化石：页岩板上浮雕出的三叶虫 */
function trilobite(p: string[]) {
  const [matrix, fossil, wood] = p
  const g = G(rbox(19, 1.2, 14.5, wood, {}, 0.4))
  const poly: Poly = []
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2
    const b = blobR(a, 0.7, 2.1)
    poly.push([8.2 * b * Math.cos(a), 6.2 * b * Math.sin(a)])
  }
  const sl = new THREE.Shape(poly.map(([x, z]) => V2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(sl, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 1 })
  geo.rotateX(-PI / 2)
  geo.translate(0, 0.2, 0)
  g.add(P(mesh(geo, matrix), 0, 1.2, 0))
  const t = new THREE.Group()
  t.add(ball(3.2, fossil, { z: -3 }, [1, 0.28, 0.62]))
  t.add(ball(1.1, fossil, { y: 0.35, z: -3.1 }, [0.75, 0.55, 1.1]))
  for (const s of [-1, 1]) {
    t.add(ball(0.45, shade(fossil, -0.1), { x: s * 1.6, y: 0.55, z: -2.6 }))
    t.add(P(G(cyl(0.05, 0.3, 3.4, fossil, { y: -1.7 }, 8)), s * 3, 0.12, -0.6, PI / 2, s * 0.15))
  }
  for (let k = 0; k < 9; k++) {
    const z = -1.2 + k * 0.55
    t.add(rbox(5 - k * 0.22, 0.5, 0.42, fossil, { y: -0.12, z }, 0.18))
    t.add(ball(0.75 - k * 0.03, shade(fossil, -0.06), { y: 0.3, z }, [1, 0.6, 0.45]))
  }
  t.add(ball(1.8, fossil, { z: 4.3 }, [1, 0.3, 0.75]))
  g.add(P(t, 0, 2.8, -0.3))
  return g
}

/** 陨石标本：铁陨石块 + 立着的维斯台登纹切片 + 铭牌 */
function meteorite(p: string[]) {
  const [lump, metal, base] = p
  const g = G(rbox(19, 1.5, 9, base, {}, 0.4))
  g.add(rock([4.4, 2.8, 3.6], lump, 11, -3.6, 1.1, -0.3, 0.6, 2, 0.16))
  for (const [x, y, z, s] of [
    [-5.2, 4.6, 2.2, 0.7],
    [-1.6, 5.2, 1.8, 0.55],
    [-4, 6.4, 0.6, 0.6],
  ])
    g.add(noOutline(ball(s, shade(lump, -0.1), { x, y, z }, [1, 0.5, 1])))
  const sl = slice(3.2, 2.6, 2.1, 0.9, shade(lump, -0.05), `col-widman-${metal}`, (c, W, H, path) => {
    c.fillStyle = shade(lump, -0.05)
    path(1)
    c.fill()
    c.save()
    path(0.9)
    c.clip()
    c.fillStyle = metal
    c.fillRect(0, 0, W, H)
    c.lineWidth = Math.max(1.5, W * 0.012)
    const r = rng(17)
    for (const ang of [0.3, 0.3 + PI / 3, 0.3 + (2 * PI) / 3]) {
      for (let k = -12; k <= 12; k++) {
        c.strokeStyle = r() > 0.5 ? shade(metal, -0.18) : shade(metal, 0.1)
        const ox = W / 2 + Math.cos(ang + PI / 2) * k * W * 0.045
        const oy = H / 2 + Math.sin(ang + PI / 2) * k * W * 0.045
        c.beginPath()
        c.moveTo(ox - Math.cos(ang) * W, oy - Math.sin(ang) * W)
        c.lineTo(ox + Math.cos(ang) * W, oy + Math.sin(ang) * W)
        c.stroke()
      }
    }
    c.restore()
  })
  g.add(P(sl, 5, 2.6 * 1.17 + 0.9, 0.5, 0, -0.25))
  g.add(
    paintPanel(
      7,
      1,
      'col-meteor-label',
      (c, W, H) => {
        c.fillStyle = BRASS
        c.fillRect(0, 0, W, H)
        c.fillStyle = INK
        c.fillRect(W * 0.08, H * 0.3, W * 0.5, H * 0.16)
        c.fillRect(W * 0.08, H * 0.6, W * 0.32, H * 0.12)
        c.fillRect(W * 0.7, H * 0.3, W * 0.2, H * 0.4)
      },
      { y: 0.25, z: 4.5 + 0.3 },
    ),
  )
  return g
}

const MINERAL_COLS = ['#3fa36b', '#3456a8', '#e8d23a', '#f2b8c6', '#5a4a4a', '#2a2a2e', '#f0ede6', '#d86a8a', '#8e5fbf', '#e8a33a', '#a8682a', '#6fae8a', '#2f4d8a', '#d4b24c', '#dfeef5', '#c4452f']

/** 矿物标本盒：4×4 格，每格一块小矿石 + 标签，玻璃盖翻开立在后面 */
function mineralBox(p: string[]) {
  const [wood, pad, frame] = p
  const W = 34
  const D = 26
  const g = G(tray(W, 4, D, 1, wood))
  const cw = (32 - 1.5) / 4
  const cd = (24 - 1.5) / 4
  const cx = (i: number) => -16 + cw / 2 + i * (cw + 0.5)
  const cz = (j: number) => -12 + cd / 2 + j * (cd + 0.5)
  g.add(
    paintTop(
      32,
      24,
      `col-minbox-${pad}`,
      (c, PW, PH) => {
        const sx = PW / 32
        const sz = PH / 24
        c.fillStyle = shade(pad, -0.1)
        c.fillRect(0, 0, PW, PH)
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) {
            const x0 = (cx(i) - cw / 2 + 16) * sx
            const z0 = (cz(j) - cd / 2 + 12) * sz
            c.fillStyle = pad
            c.fillRect(x0, z0, cw * sx, cd * sz)
            c.fillStyle = PAPER
            c.fillRect(x0 + cw * 0.12 * sx, z0 + cd * 0.68 * sz, cw * 0.76 * sx, cd * 0.26 * sz)
            c.fillStyle = MINERAL_COLS[i + j * 4]
            c.fillRect(x0 + cw * 0.16 * sx, z0 + cd * 0.73 * sz, cd * 0.14 * sz, cd * 0.14 * sz)
            c.fillStyle = INK
            c.fillRect(x0 + cw * 0.34 * sx, z0 + cd * 0.74 * sz, cw * 0.46 * sx, cd * 0.05 * sz)
            c.fillRect(x0 + cw * 0.34 * sx, z0 + cd * 0.84 * sz, cw * 0.3 * sx, cd * 0.04 * sz)
          }
      },
      0,
      1.3,
      0,
    ),
  )
  for (let k = 1; k < 4; k++) {
    g.add(rbox(0.5, 2.6, 24, wood, { x: -16 + k * (cw + 0.5) - 0.25, y: 1 }, 0.15))
    g.add(rbox(32, 2.6, 0.5, wood, { y: 1, z: -12 + k * (cd + 0.5) - 0.25 }, 0.15))
  }
  const r = rng(41)
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const k = i + j * 4
      const col = MINERAL_COLS[k]
      const x = cx(i)
      const z = cz(j) - cd * 0.18
      if (k === 8 || k === 14) {
        for (let q = 0; q < 4; q++) {
          const a = q * 1.7
          g.add(crystal(0.32, 0.9 + r(), col, [x + Math.cos(a) * 0.5, 1.4, z + Math.sin(a) * 0.4], [Math.cos(a) * 0.4, 1, Math.sin(a) * 0.3]))
        }
        g.add(rock([1.3, 0.4, 1], '#8f8a83', 50 + k, x, 1.3, z))
      } else if (k === 13) {
        g.add(rbox(1.4, 1.4, 1.4, col, { x: x - 0.4, y: 1.3, z, ry: 0.5 }, 0.08))
        g.add(rbox(0.9, 0.9, 0.9, col, { x: x + 0.8, y: 1.3, z: z + 0.3, ry: 0.2 }, 0.06))
      } else {
        g.add(rock([1.3 + r() * 0.6, 0.8 + r() * 0.4, 1.1 + r() * 0.4], col, 60 + k, x, 1.3, z, r() * 3, 1, 0.25))
      }
    }
  // 翻开的玻璃盖
  const lid = new THREE.Group()
  lid.add(rbox(W, 1.6, 1.2, frame, { z: -0.6 }, 0.4), rbox(W, 1.6, 1.2, frame, { y: D - 1.6, z: -0.6 }, 0.4))
  for (const s of [-1, 1]) lid.add(rbox(1.6, D - 3.2, 1.2, frame, { x: s * (W / 2 - 0.8), y: 1.6, z: -0.6 }, 0.4))
  lid.add(ghost(rbox(W - 3.2, D - 3.2, 0.3, GLASS, { y: 1.6, z: -0.6 }, 0.1), GLASS, 0.25))
  g.add(P(lid, 0, 4, -D / 2, -0.2))
  return g
}

/** 玻璃罩里的大块矿石：木座 + 双面玻璃钟罩 */
function domeSpecimen(p: string[]) {
  const [wood, xtal, rockC] = p
  const g = G(puck(9.8, 2, wood), puck(8.9, 1.1, shade(wood, -0.1), { y: 1.9 }))
  const pts: THREE.Vector2[] = [V2(8.4, 0), V2(8.4, 12.5)]
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (PI / 2)
    pts.push(V2(Math.max(0.01, 8.4 * Math.cos(a)), 12.5 + 8 * Math.sin(a)))
  }
  const dome = ghost2(new THREE.Mesh(new THREE.LatheGeometry(pts, 40)), GLASS, 0.26)
  g.add(P(dome, 0, 2.95, 0))
  g.add(ghost(ball(0.9, GLASS, { y: 2.95 + 20.5 + 0.7 }), GLASS, 0.4))
  g.add(cyl(3.4, 3.8, 1.4, M.black, { y: 3 }, 24))
  const c = fitGroup(quartzCluster([xtal, rockC], 8))
  c.scale.setScalar(0.66)
  g.add(P(c, 0, 4.4, 0))
  return g
}

// ---------- 硬币 ----------

/** 硬币册页面：深色页上 4 × 5 个透明袋，每袋一枚硬币 + 标签 */
function drawCoinPage(page: string, seed: number): Draw {
  return (c, W, H) => {
    c.fillStyle = page
    c.fillRect(0, 0, W, H)
    const cols = 4
    const rows = 5
    const cw = W / cols
    const ch = H / rows
    const r = rng(seed)
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = i * cw
        const y = j * ch
        c.fillStyle = shade(page, 0.08)
        c.fillRect(x + cw * 0.08, y + ch * 0.06, cw * 0.84, ch * 0.88)
        const col = COIN_COLS[Math.floor(r() * COIN_COLS.length)]
        const rr = Math.min(cw, ch) * (0.26 + r() * 0.08)
        const cx = x + cw / 2
        const cy = y + ch * 0.42
        c.fillStyle = shade(col, -0.18)
        c.beginPath()
        c.arc(cx, cy, rr, 0, PI * 2)
        c.fill()
        c.fillStyle = col
        c.beginPath()
        c.arc(cx, cy, rr * 0.88, 0, PI * 2)
        c.fill()
        c.strokeStyle = shade(col, -0.12)
        c.lineWidth = rr * 0.08
        c.beginPath()
        c.arc(cx, cy, rr * 0.6, 0, PI * 2)
        c.stroke()
        c.fillStyle = 'rgba(255,255,255,0.55)'
        c.beginPath()
        c.arc(cx - rr * 0.35, cy - rr * 0.35, rr * 0.18, 0, PI * 2)
        c.fill()
        c.fillStyle = '#f2efe6'
        c.fillRect(x + cw * 0.22, y + ch * 0.8, cw * 0.56, ch * 0.07)
      }
  }
}

/** 邮票：白底 + 齿孔 + 小画面。hole = null 时齿孔是真的透明缺口（配合 cutout） */
const STAMP_COLS = [
  ['#e8a33a', '#c8473a'],
  ['#7fb3d9', '#2f4d8a'],
  ['#9fcf8f', '#3f7f4a'],
  ['#f2b8c6', '#b5527a'],
  ['#d9c08a', '#6e4f37'],
  ['#c7b3ea', '#5a3c9a'],
]
function drawStamp(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hole: string | null, seed: number) {
  const [bg, fg] = STAMP_COLS[seed % STAMP_COLS.length]
  c.fillStyle = '#fbfaf5'
  c.fillRect(x, y, w, h)
  const hr = Math.min(w, h) * 0.045
  const step = hr * 2.7
  c.save()
  if (hole) c.fillStyle = hole
  else c.globalCompositeOperation = 'destination-out'
  const dot = (px: number, py: number) => {
    c.beginPath()
    c.arc(px, py, hr, 0, PI * 2)
    c.fill()
  }
  for (let px = x + step / 2; px < x + w; px += step) {
    dot(px, y)
    dot(px, y + h)
  }
  for (let py = y + step / 2; py < y + h; py += step) {
    dot(x, py)
    dot(x + w, py)
  }
  c.restore()
  const m = Math.min(w, h) * 0.13
  const ix = x + m
  const iy = y + m
  const iw = w - m * 2
  const ih = h - m * 2
  c.fillStyle = bg
  c.fillRect(ix, iy, iw, ih)
  c.fillStyle = fg
  const motif = Math.floor(seed / STAMP_COLS.length) % 5
  if (motif === 0) {
    c.beginPath()
    c.moveTo(ix, iy + ih)
    c.lineTo(ix + iw * 0.4, iy + ih * 0.45)
    c.lineTo(ix + iw * 0.7, iy + ih * 0.75)
    c.lineTo(ix + iw, iy + ih * 0.5)
    c.lineTo(ix + iw, iy + ih)
    c.closePath()
    c.fill()
    c.fillStyle = '#fff6d0'
    c.beginPath()
    c.arc(ix + iw * 0.72, iy + ih * 0.28, Math.min(iw, ih) * 0.12, 0, PI * 2)
    c.fill()
  } else if (motif === 1) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2
      c.beginPath()
      c.arc(ix + iw / 2 + Math.cos(a) * iw * 0.15, iy + ih * 0.45 + Math.sin(a) * iw * 0.15, iw * 0.13, 0, PI * 2)
      c.fill()
    }
    c.fillStyle = '#fff6d0'
    c.beginPath()
    c.arc(ix + iw / 2, iy + ih * 0.45, iw * 0.08, 0, PI * 2)
    c.fill()
  } else if (motif === 2) {
    c.beginPath()
    c.arc(ix + iw / 2, iy + ih * 0.4, Math.min(iw, ih) * 0.2, 0, PI * 2)
    c.fill()
    c.beginPath()
    c.ellipse(ix + iw / 2, iy + ih, iw * 0.38, ih * 0.3, 0, PI, 0)
    c.fill()
  } else if (motif === 3) {
    c.beginPath()
    c.moveTo(ix + iw * 0.15, iy + ih * 0.55)
    c.lineTo(ix + iw * 0.85, iy + ih * 0.35)
    c.lineTo(ix + iw * 0.55, iy + ih * 0.7)
    c.closePath()
    c.fill()
    c.fillRect(ix, iy + ih * 0.82, iw, ih * 0.06)
  } else {
    c.fillRect(ix + iw * 0.2, iy + ih * 0.2, iw * 0.6, ih * 0.6)
    c.fillStyle = bg
    c.fillRect(ix + iw * 0.32, iy + ih * 0.32, iw * 0.36, ih * 0.36)
  }
  c.fillStyle = INK
  c.fillRect(ix + iw * 0.06, iy + ih * 0.06, iw * 0.24, ih * 0.08)
}

/** 邮票册页面：护邮条 + 一排排邮票 */
function drawStampPage(page: string, seed: number): Draw {
  return (c, W, H) => {
    c.fillStyle = page
    c.fillRect(0, 0, W, H)
    const rows = 5
    const rh = H / rows
    const r = rng(seed)
    for (let j = 0; j < rows; j++) {
      const y = j * rh
      c.fillStyle = shade(page, -0.06)
      c.fillRect(W * 0.04, y + rh * 0.12, W * 0.92, rh * 0.8)
      let x = W * 0.07
      while (x < W * 0.86) {
        const sw = W * (0.16 + r() * 0.08)
        if (x + sw > W * 0.94) break
        const sh = rh * (0.58 + r() * 0.12)
        drawStamp(c, x, y + rh * 0.18, sw, sh, shade(page, -0.06), Math.floor(r() * 30))
        x += sw + W * 0.035
      }
      c.fillStyle = 'rgba(255,255,255,0.35)'
      c.fillRect(W * 0.04, y + rh * 0.12, W * 0.92, rh * 0.06)
    }
  }
}

/** 打开的收藏册：两块硬封面 + 两叠内页 + 中缝，内页画面由 draw 给 */
function albumOpen(p: string[], kind: string, drawL: Draw, drawR: Draw) {
  const [cover, page] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(16.2, 0.35, 25, cover, { x: s * 8.15 }, 0.15))
    g.add(rbox(15.4, 1, 24.2, '#f3efe6', { x: s * 7.95, y: 0.35 }, 0.15))
  }
  g.add(cylZg(0.75, 25, cover, 0, 0.75, 0, 16))
  g.add(paintTop(15, 23.8, `col-${kind}-L-${page}`, drawL, -7.95, 1.65, 0))
  g.add(paintTop(15, 23.8, `col-${kind}-R-${page}`, drawR, 7.95, 1.65, 0))
  return g
}

/** 合上叠放的收藏册（三本），封面上贴标签 */
function albumStack(p: string[], kind: string, label: Draw) {
  const [cover, , acc] = p
  const g = new THREE.Group()
  const cols = [cover, acc, shade(cover, -0.1)]
  cols.forEach((col, i) => {
    const b = new THREE.Group()
    b.add(rbox(16.5, 0.35, 25, col, {}, 0.15))
    b.add(rbox(16, 1.7, 24.4, '#f3efe6', { x: 0.2, y: 0.35 }, 0.15))
    b.add(rbox(16.5, 0.35, 25, col, { y: 2.05 }, 0.15))
    b.add(rbox(0.7, 2.4, 25, col, { x: -8.1 }, 0.3))
    b.add(paintTop(8, 5, `col-${kind}-label`, label, 0.5, 2.7, -5))
    g.add(P(b, i === 1 ? 0.8 : -0.3 * i, i * 2.4, i === 1 ? 0.5 : -0.4, 0, [0, 0.08, -0.06][i]))
  })
  return g
}

const ALBUM_PALS: PalFlat[] = [
  ['retro', '#2f4d8a', '#1f2a44', '#8a2f2f'],
  ['modern', '#2a2b30', '#1c1d21', '#5a5c62'],
  ['nordic', '#a9bfa3', '#2f3a33', '#9fb4c7'],
  ['industrial', I.leather, '#2a2522', I.walnut],
]
const STAMP_ALBUM_PALS: PalFlat[] = [
  ['retro', '#8a2f2f', '#f4ecd8', '#2f4d8a'],
  ['nordic', '#9fb4c7', '#f7f5f0', '#a9bfa3'],
  ['modern', '#2a2b30', '#26272c', '#5a5c62'],
  ['japanese', J.ai, J.washi, J.shu],
  ['cute', '#f2b8c6', '#fff7ef', '#a8d4f4'],
]

const coinLabel: Draw = (c, W, H) => {
  c.fillStyle = '#f4ecd8'
  c.fillRect(0, 0, W, H)
  c.strokeStyle = '#b08a3e'
  c.lineWidth = W * 0.03
  c.strokeRect(W * 0.05, H * 0.08, W * 0.9, H * 0.84)
  c.fillStyle = GOLD
  c.beginPath()
  c.arc(W * 0.28, H / 2, H * 0.26, 0, PI * 2)
  c.fill()
  c.fillStyle = INK
  c.fillRect(W * 0.5, H * 0.35, W * 0.36, H * 0.1)
  c.fillRect(W * 0.5, H * 0.55, W * 0.26, H * 0.08)
}
const stampLabel: Draw = (c, W, H) => {
  c.fillStyle = '#f4ecd8'
  c.fillRect(0, 0, W, H)
  drawStamp(c, W * 0.1, H * 0.18, W * 0.28, H * 0.64, '#f4ecd8', 7)
  c.fillStyle = INK
  c.fillRect(W * 0.48, H * 0.35, W * 0.4, H * 0.1)
  c.fillRect(W * 0.48, H * 0.55, W * 0.3, H * 0.08)
}

/** 带玻璃的浅框：背板在 z = 0，正面朝 +z，原点在框的底边中心 */
function frameBox(W: number, H: number, D: number, fb: number, frame: string, back: string) {
  const g = new THREE.Group()
  for (const y of [0, H - fb]) g.add(rbox(W, fb, D, frame, { y, z: D / 2 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(fb, H - fb * 2, D, frame, { x: (s * (W - fb)) / 2, y: fb, z: D / 2 }, 0.4))
  g.add(rbox(W - fb * 2, H - fb * 2, 0.6, back, { y: fb, z: 0.3 }, 0.1))
  g.add(ghost(rbox(W - fb * 2, H - fb * 2, 0.25, GLASS, { y: fb, z: D - 0.5 }, 0.08), GLASS, 0.22))
  return g
}

/** 桌面立式：整体后仰 0.17，背后一根撑 */
function standUp(fr: THREE.Group, H: number, color: string) {
  const a = -0.17
  const g = G(P(fr, 0, 0, 0, a))
  const yl = H * 0.55
  g.add(strutZ(yl * Math.sin(a) - 0.3, yl * Math.cos(a), -H * 0.38, 0, 1.6, 0.6, color))
  return g
}

/** 硬币展示框内容：天鹅绒背板上一格格竖立的硬币 + 小铭牌 */
function coinFrame(W: number, H: number, cols: number, rows: number, desk: boolean) {
  return (p: string[]) => {
    const [frame, velvet, plate] = p
    const D = 2.8
    const fb = 2
    const fr = frameBox(W, H, D, fb, frame, velvet)
    const sx = (W - fb * 2) / cols
    const sy = (H - fb * 2) / rows
    const r = rng(cols * 10 + rows)
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = -W / 2 + fb + sx * (i + 0.5)
        const y = fb + sy * (j + 0.58)
        const rr = Math.min(sx, sy) * (0.24 + r() * 0.08)
        fr.add(coinZ(rr, COIN_COLS[(i + j * 2) % COIN_COLS.length], x, y, 0.6 + 0.3))
        fr.add(rbox(sx * 0.5, sy * 0.1, 0.2, plate, { x, y: y - rr - sy * 0.2, z: 0.7 }, 0.05))
      }
    if (!desk) return G(P(fr, 0, 140, -D / 2))
    return fitGroup(standUp(fr, H, frame))
  }
}

const FRAME_PALS: PalFlat[] = [
  ['retro', I.walnut, '#2f3f6a', BRASS],
  ['modern', M.black, '#7a2a33', BRASS],
  ['nordic', N.oak, '#4f6b5a', SILVER],
  ['japanese', J.dark, '#3e3a39', GOLD],
]

/** 硬币盒：木盒 + 天鹅绒内衬圆槽（真开孔），盖子翻开 */
function coinCase(p: string[]) {
  const [wood, velvet, brass] = p
  const g = G(tray(22, 3.2, 16, 0.8, wood))
  g.add(rbox(20.4, 1.6, 14.4, velvet, { y: 0.8 }, 0.2))
  const holes: { kind: 'circle'; x: number; y: number; r: number }[] = []
  const xs = [-6.9, -2.3, 2.3, 6.9]
  const zs = [-4.4, 0, 4.4]
  for (const x of xs) for (const z of zs) holes.push({ kind: 'circle', x, y: 7.2 - z, r: 1.7 })
  g.add(holePanelFlat(20.4, 14.4, 0.6, velvet, holes, 2.7))
  let k = 0
  for (const x of xs) for (const z of zs) if (k++ !== 5) g.add(coin(1.45, COIN_COLS[k % COIN_COLS.length], x, 2.4, z, 0.25))
  const lid = new THREE.Group()
  lid.add(rbox(22, 16, 1.2, wood, { z: -0.6 }, 0.4))
  lid.add(rbox(20, 14, 0.3, velvet, { y: 1, z: 0.15 }, 0.1))
  g.add(P(lid, 0, 3.2, -8, -0.2))
  g.add(rbox(2, 1.2, 0.4, brass, { y: 1.7, z: 8.2 }, 0.1))
  return g
}

/** 平放的带孔板（holePanel 转平）：孔坐标 x 不变，y 是从 +z 边往 -z 量的距离；yc 是板中心高度 */
function holePanelFlat(w: number, d: number, t: number, color: string, holes: { kind: 'circle'; x: number; y: number; r: number }[], yc: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, d)
  s.lineTo(-w / 2, d)
  s.lineTo(-w / 2, 0)
  for (const h of holes) {
    const ph = new THREE.Path()
    ph.absarc(h.x, h.y, h.r, 0, PI * 2, true)
    s.holes.push(ph)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 20 })
  geo.translate(0, 0, -t / 2)
  const m = mesh(geo, color)
  return P(m, 0, yc, d / 2, -PI / 2)
}

/** 硬币卷：木托盘里码着纸卷，旁边立两卷 + 几枚散币 */
function coinRolls(p: string[]) {
  const [wood, w1, w2, w3] = p
  const g = G(tray(18, 2.2, 11, 0.8, wood))
  const roll = (col: string, end: string, x: number, y: number, z: number) => {
    const r = G(cyl(1.3, 1.3, 9, col, { y: -4.5 }, 20))
    r.add(puck(1.15, 0.3, end, { y: 4.4 }), puck(1.15, 0.3, end, { y: -4.7 }))
    r.add(noOutline(torus(1.32, 0.08, shade(col, -0.2), { y: 2.6, rx: PI / 2 })), noOutline(torus(1.32, 0.08, shade(col, -0.2), { y: -2.6, rx: PI / 2 })))
    return P(r, x, y, z, 0, 0, PI / 2)
  }
  const cols = [w1, w2, w3]
  const ends = [SILVER, COPPER, GOLD]
  ;[-2.7, 0, 2.7].forEach((z, i) => g.add(roll(cols[i], ends[i], 0, 2.1, z)))
  ;[-1.35, 1.35].forEach((z, i) => g.add(roll(cols[(i + 1) % 3], ends[(i + 1) % 3], 0, 2.1 + 1.3 * Math.sqrt(3) + 0.02, z)))
  for (const [x, z, i] of [
    [11.6, -2.6, 0],
    [12.2, 0.4, 2],
  ]) {
    const r = G(cyl(1.3, 1.3, 9, cols[i], { y: 0.3 }, 20), puck(1.15, 0.3, ends[i], { y: 9.2 }), puck(1.15, 0.32, ends[i]))
    g.add(P(r, x, 0, z))
  }
  for (let k = 0; k < 4; k++) g.add(coin(1.15, k % 2 ? COPPER : SILVER, 12 + (k % 2) * 0.15, k * 0.22, 3.6, 0.22))
  return g
}

let cashGeo: THREE.BufferGeometry | null = null
/** 方孔钱（圆形方孔，厚 0.14），平面在 xy、厚度沿 z */
function cashCoin(color: string) {
  if (!cashGeo) {
    const s = new THREE.Shape()
    s.absarc(0, 0, 1.25, 0, PI * 2, false)
    const h = new THREE.Path()
    h.moveTo(-0.28, -0.28)
    h.lineTo(-0.28, 0.28)
    h.lineTo(0.28, 0.28)
    h.lineTo(0.28, -0.28)
    h.lineTo(-0.28, -0.28)
    s.holes.push(h)
    cashGeo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1, curveSegments: 24 })
    cashGeo.translate(0, 0, -0.05)
    // 模块级缓存、多件家具共用：标记共享，disposeUnshared 不释放
    cashGeo.userData.shared = true
  }
  return mesh(cashGeo, color)
}

/** 古钱币一串：红绳穿起的一捆方孔钱 + 穗子，旁边扇形摆开几枚，垫着织锦 */
function cashString(p: string[]) {
  const [bronze, cord, mat] = p
  const g = G(rbox(26, 0.3, 13, mat, {}, 0.15))
  const y = 0.3 + 1.3
  const n = 22
  const x0 = -5
  const step = 0.17
  for (let i = 0; i < n; i++) g.add(P(cashCoin(i % 3 ? bronze : shade(bronze, -0.06)), x0 + i * step, y, -2.6, 0, PI / 2, i * 0.3))
  const x1 = x0 + (n - 1) * step
  g.add(cylXg(0.11, x1 - x0 + 1.4, cord, (x0 + x1) / 2, y, -2.6, 8))
  for (const [xa, s] of [
    [x0 - 0.7, -1],
    [x1 + 0.7, 1],
  ]) {
    g.add(ball(0.32, cord, { x: xa, y, z: -2.6 }))
    g.add(rod(xa, y, xa + s * 2.2, 0.75, 0.11, cord, -2.6))
    g.add(ball(0.35, cord, { x: xa + s * 2.2, y: 0.7, z: -2.6 }))
    g.add(P(G(cyl(0.12, 0.45, 3, cord, { y: 0 }, 10)), xa + s * 2.5, 0.75, -2.6, 0, 0, -s * PI / 2))
  }
  for (let k = 0; k < 5; k++) {
    const a = -0.5 + k * 0.25
    g.add(P(cashCoin(bronze), Math.sin(a) * 11, 0.3 + 0.08, 4.4 - Math.cos(a) * 2, -PI / 2, 0, k * 0.4))
  }
  return g
}

/** 放大镜 + 硬币托盘 */
function coinLoupe(p: string[]) {
  const [wood, velvet, handle] = p
  const g = G(tray(16, 1.8, 12, 0.7, wood), rbox(14.6, 0.3, 10.6, velvet, { y: 0.7 }, 0.1))
  let k = 0
  for (const x of [-4.5, 0, 4.5]) for (const z of [-2.5, 2.5]) g.add(coin(1.55 - (k % 3) * 0.15, COIN_COLS[k++], x, 1, z, 0.22))
  const mg = new THREE.Group()
  mg.add(torus(3.4, 0.35, STEEL, { y: 0.35, rx: PI / 2 }))
  mg.add(ghost(cyl(3.3, 3.3, 0.3, GLASS, { y: 0.2 }, 32), GLASS))
  mg.add(cylXg(0.35, 1.2, STEEL, 4.2, 0.4, 0, 12))
  mg.add(P(G(cyl(0.55, 0.65, 8, handle, { y: 0 }, 14)), 4.7, 0.65, 0, 0, 0, -PI / 2))
  g.add(P(mg, 13, 0, 1.5, 0, 0.5))
  return g
}

/** 评级币盒：亚克力立架上插着四个透明封装盒 */
function coinSlabs(p: string[]) {
  const [base, labelC] = p
  const g = G(rbox(26, 1.4, 6, base, {}, 0.4))
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Group()
    s.add(ghost(rbox(5.6, 8.6, 0.7, GLASS, {}, 0.25), GLASS, 0.3))
    s.add(coinZ(1.8, COIN_COLS[k], 0, 3.6, 0, 0.3))
    s.add(
      paintPanel(
        5,
        1.8,
        `col-slab-${labelC}-${k}`,
        (c, W, H) => {
          c.fillStyle = '#fbfaf5'
          c.fillRect(0, 0, W, H)
          c.fillStyle = labelC
          c.fillRect(0, 0, W, H * 0.22)
          c.fillStyle = INK
          c.fillRect(W * 0.06, H * 0.38, W * 0.5, H * 0.14)
          c.fillRect(W * 0.06, H * 0.64, W * 0.36, H * 0.1)
          c.fillStyle = labelC
          c.fillRect(W * 0.7, H * 0.36, W * 0.24, H * 0.5)
        },
        { y: 6.4, z: 0.1 },
      ),
    )
    g.add(P(s, -9 + k * 6, 0.6, 0, -0.1))
  }
  return g
}

// ---------- 邮票 ----------

/** 裱框邮票：画在衬纸上的标题 + cols × rows 枚邮票 */
function drawStampMat(mat: string, cols: number, rows: number): Draw {
  return (c, W, H) => {
    c.fillStyle = mat
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(mat, -0.35)
    c.fillRect(W * 0.25, H * 0.04, W * 0.5, H * 0.025)
    c.fillRect(W * 0.35, H * 0.075, W * 0.3, H * 0.015)
    const top = H * 0.12
    const cw = (W * 0.86) / cols
    const ch = (H * 0.84) / rows
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = W * 0.07 + i * cw + cw * 0.12
        const y = top + j * ch + ch * 0.1
        c.fillStyle = 'rgba(0,0,0,0.15)'
        c.fillRect(x + cw * 0.04, y + ch * 0.04, cw * 0.76, ch * 0.72)
        drawStamp(c, x, y, cw * 0.76, ch * 0.72, mat, i * 7 + j * 11 + 3)
      }
  }
}

function stampFrame(W: number, H: number, cols: number, rows: number, desk: boolean) {
  return (p: string[]) => {
    const [frame, mat] = p
    const D = 2.4
    const fb = 2.2
    const fr = frameBox(W, H, D, fb, frame, mat)
    fr.add(paintPanel(W - fb * 2 - 0.2, H - fb * 2 - 0.2, `col-stampmat-${mat}-${cols}x${rows}`, drawStampMat(mat, cols, rows), { y: fb + 0.1, z: 0.9 }))
    if (!desk) return G(P(fr, 0, 135, -D / 2))
    return fitGroup(standUp(fr, H, frame))
  }
}

const STAMP_FRAME_PALS: PalFlat[] = [
  ['retro', I.walnut, '#f4ecd8'],
  ['nordic', N.oak, N.white],
  ['modern', M.black, '#e9e9e6'],
  ['japanese', J.dark, J.washi],
  ['cute', '#f6f0e8', '#ffe3ea'],
]

/** 集邮工具：皮垫上的镊子、放大镜、护邮袋（里面夹着邮票）、齿孔尺和散票 */
function stampTools(p: string[]) {
  const [padC, handle] = p
  const g = G(rbox(28, 0.4, 18, padC, {}, 0.2))
  const y0 = 0.4
  // 镊子
  const tw = new THREE.Group()
  for (const s of [-1, 1]) {
    tw.add(rbox(0.45, 0.14, 11, STEEL, { x: s * 0.4, ry: -s * 0.02 }, 0.05))
    tw.add(noOutline(ball(0.4, STEEL, { x: s * 0.3, y: 0.07, z: 5.6 }, [0.9, 0.2, 1.3])))
  }
  tw.add(rbox(1.6, 0.3, 1.2, STEEL, { z: -5.6 }, 0.1))
  g.add(P(tw, -10, y0, 0, 0, 0.3))
  // 手持放大镜
  const mg = new THREE.Group()
  mg.add(torus(2.4, 0.25, handle, { y: 0.25, rx: PI / 2 }))
  mg.add(ghost(cyl(2.35, 2.35, 0.22, GLASS, { y: 0.14 }, 28), GLASS))
  mg.add(P(G(cyl(0.4, 0.45, 5, handle, { y: 0 }, 12)), 2.5, 0.45, 0, 0, 0, -PI / 2))
  g.add(P(mg, 5, y0, -4.8, 0, -0.4))
  // 护邮袋（半透明）里夹着邮票
  for (let k = 0; k < 3; k++) {
    const e = new THREE.Group()
    const st = cutout(paintTop(3.4, 4, `col-stamp-${k * 5 + 2}`, (c, W, H) => drawStamp(c, 0, 0, W, H, null, k * 5 + 2), 0, 0.12, 0))
    e.add(st, ghost(rbox(6, 0.08, 7.6, '#f4f6f8', { y: 0.2 }, 0.03), '#f4f6f8', 0.45))
    g.add(P(e, -1 + k * 2.4, y0 + k * 0.32, 1 + k * 1.1, 0, 0.25 - k * 0.2))
  }
  // 齿孔尺
  g.add(
    paintTop(
      3.6,
      12,
      'col-perf-gauge',
      (c, W, H) => {
        c.fillStyle = '#fbfaf5'
        c.fillRect(0, 0, W, H)
        c.fillStyle = INK
        for (let j = 0; j < 14; j++) {
          const y = H * 0.05 + j * H * 0.065
          const n = 10 + j
          for (let i = 0; i < n; i++) c.fillRect(W * 0.08 + (i * W * 0.55) / n, y, W * 0.02, H * 0.02)
          c.fillRect(W * 0.72, y, W * 0.18, H * 0.02)
        }
      },
      11.5,
      y0 + 0.3,
      4,
    ),
  )
  // 散票
  for (const [k, x, z] of [
    [9, 5.2, 3.4],
    [14, 6.6, 6.2],
  ])
    g.add(cutout(paintTop(3, 3.6, `col-stamp-${k}`, (c, W, H) => drawStamp(c, 0, 0, W, H, null, k), x, y0 + 0.3, z)))
  return g
}

// ---------- 展示家具 ----------

const GLASS_A = 0.2

function curioSpec(H: number, n: number) {
  const floor = 10
  const inTop = H - 7
  const T = 1.6
  const clear = (inTop - floor - (n - 1) * T) / n
  const ys = Array.from({ length: n }, (_, k) => floor + k * (clear + T))
  return { floor, inTop, T, clear, ys }
}

/** 古董陈列柜：弯腿 + 四根立柱 + 玻璃侧板 + 两扇玻璃门，层板空着 */
function curioCabinet(w: number, d: number, H: number, n: number) {
  return (p: string[]) => {
    const [main, back, knob] = p
    const { floor, inTop, T, ys } = curioSpec(H, n)
    const g = G(legs(w - 2, d - 2, 8, shade(main, -0.08), 1.8, 3))
    g.add(rbox(w, 2, d, main, { y: 8 }, 0.6))
    g.add(rbox(w, H - inTop, d, main, { y: inTop }, 0.8))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, inTop - floor, 3, main, { x: sx * (w / 2 - 1.5), y: floor, z: sz * (d / 2 - 1.5) }, 0.5))
    g.add(rbox(w - 6, inTop - floor, 1, back, { y: floor, z: -d / 2 + 0.5 }, 0.2))
    for (const sx of [-1, 1]) g.add(ghost(rbox(0.5, inTop - floor, d - 6, GLASS, { x: sx * (w / 2 - 1.5), y: floor }, 0.1), GLASS, GLASS_A))
    const sd = d - 1 - 2.5
    const sz = (-d / 2 + 1 + d / 2 - 2.5) / 2
    for (let k = 1; k < n; k++) g.add(rbox(w - 6, T, sd, main, { y: ys[k] - T, z: sz }, 0.4))
    const dw = (w - 6) / 2 - 0.2
    const dh = inTop - floor - 0.4
    for (const s of [-1, 1]) {
      const fr = new THREE.Group()
      for (const y of [0, dh - 2.4]) fr.add(rbox(dw, 2.4, 1.5, main, { y }, 0.5))
      for (const k of [-1, 1]) fr.add(rbox(2.4, dh - 4.8, 1.5, main, { x: (k * (dw - 2.4)) / 2, y: 2.4 }, 0.5))
      fr.add(ghost(rbox(dw - 4.8, dh - 4.8, 0.4, GLASS, { y: 2.4 }, 0.1), GLASS, GLASS_A))
      fr.add(ball(0.6, knob, { x: -s * (dw / 2 - 1.2), y: dh / 2, z: 0.7 }))
      // 玻璃门：铰链在外侧立柱旁，绕门的正面边转开
      g.add(swingDoor([P(fr, s * (dw / 2 + 0.1), floor + 0.2, d / 2 - 1)], s * (dw + 0.1), d / 2 - 0.25, s < 0 ? 'left' : 'right'))
    }
    return g
  }
}
function curioSurfaces(w: number, d: number, H: number, n: number) {
  const { clear, ys } = curioSpec(H, n)
  return ys.map((y) => ({ y, h: clear, inside: true, glass: true, shape: [rectPoly(-w / 2 + 3, -d / 2 + 1, w / 2 - 3, d / 2 - 2.5)] }))
}

const CURIO_PALS: PalFlat[] = [
  ['retro', '#7a3e2a', '#5e2f22', BRASS],
  ['modern', M.walnut, M.char, M.silver],
  ['nordic', '#f2efe8', N.linen, N.oak],
  ['modern', M.black, M.char, BRASS],
  ['japanese', J.dark, J.sumi, J.shu],
]

/** 博古架：不规则格子（单位：格线中心坐标，板厚 2） */
const BOGU = { w: 120, d: 32, h: 180 }
const BOGU_CELLS: [number, number, number, number][] = [
  [-59, 23, 7, 40],
  [23, 59, 7, 56],
  [-59, -17, 40, 92],
  [-59, -17, 92, 128],
  [-59, -17, 128, 179],
  [-17, 23, 40, 100],
  [-17, 23, 100, 150],
  [23, 59, 56, 96],
  [23, 59, 96, 150],
  [-17, 59, 150, 179],
]

function bogu(p: string[]) {
  const [wood, back, acc] = p
  const { w, d, h } = BOGU
  const g = G(rbox(w - 4, 6, d - 2, shade(wood, -0.1), {}, 0.6))
  g.add(rbox(w, 2, d, wood, { y: 6 }, 0.5), rbox(w, 2, d, wood, { y: h - 2 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2, h - 10, d, wood, { x: s * (w / 2 - 1), y: 8 }, 0.5))
  g.add(rbox(w - 4, h - 10, 0.8, back, { y: 8, z: -d / 2 + 0.4 }, 0.2))
  const bd = d - 0.8
  const bz = 0.4
  for (const [x0, x1, y0, y1] of BOGU_CELLS) {
    if (y0 > 7) g.add(rbox(x1 - x0 + 2, 2, bd, wood, { x: (x0 + x1) / 2, y: y0 - 1, z: bz }, 0.4))
    if (x1 < 59) g.add(rbox(2, y1 - y0 - 2, bd, wood, { x: x1, y: y0 + 1, z: bz }, 0.4))
  }
  // 几处格口上沿的如意小挂牙
  for (const [x0, x1, , y1] of [BOGU_CELLS[2], BOGU_CELLS[6], BOGU_CELLS[9]]) {
    for (const s of [-1, 1]) {
      const x = s < 0 ? x0 + 1 : x1 - 1
      g.add(rbox(4, 1.2, 1, acc, { x: x - s * 2, y: y1 - 2.2, z: d / 2 - 0.5 }, 0.3))
      g.add(rbox(1.2, 4, 1, acc, { x: x - s * 0.6, y: y1 - 5, z: d / 2 - 0.5 }, 0.3))
    }
  }
  return g
}

const BOGU_PALS: PalFlat[] = [
  ['retro', '#6b3428', '#8a4a36', '#8a4a36'],
  ['japanese', J.dark, J.wood, J.wood],
  ['modern', M.black, M.char, M.char],
  ['japanese', J.hinoki, J.washi, J.wood],
  ['nordic', N.white, N.linen, N.oak],
]

/** 壁挂收藏展示格：4 × 4 小格（手办、矿石、小摆件） */
const WSC = { w: 60, d: 10, h: 60, mount: 110, t: 1.8, b: 1.2 }
const wscClear = (WSC.w - WSC.t * 2 - WSC.b * 3) / 4
function wallShowcase(p: string[]) {
  const [frame, back] = p
  const { w, d, h, t, b } = WSC
  const g = new THREE.Group()
  g.add(rbox(w, t, d, frame, {}, 0.4), rbox(w, t, d, frame, { y: h - t }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(t, h - t * 2, d, frame, { x: s * (w / 2 - t / 2), y: t }, 0.4))
  g.add(rbox(w - t * 2, h - t * 2, 0.6, back, { y: t, z: -d / 2 + 0.3 }, 0.1))
  const iz = 0.3
  const id = d - 0.6
  for (let r = 1; r < 4; r++) g.add(rbox(w - t * 2, b, id, frame, { y: t + r * (wscClear + b) - b, z: iz }, 0.3))
  for (let r = 0; r < 4; r++)
    for (let c = 1; c < 4; c++) g.add(rbox(b, wscClear, id, frame, { x: -w / 2 + t + c * (wscClear + b) - b / 2, y: t + r * (wscClear + b), z: iz }, 0.3))
  return G(P(g, 0, WSC.mount, 0))
}
const wscSurfaces = Array.from({ length: 4 }, (_, r) => ({
  y: WSC.mount + WSC.t + r * (wscClear + WSC.b),
  h: wscClear,
  shape: Array.from({ length: 4 }, (_, c) => {
    const x0 = -WSC.w / 2 + WSC.t + c * (wscClear + WSC.b)
    return rectPoly(x0, -WSC.d / 2 + 0.6, x0 + wscClear, WSC.d / 2)
  }),
}))

/** 亚克力阶梯展示台：一整块阶梯形透明亚克力 */
function acrylicRiser(p: string[]) {
  const [col] = p
  const s = new THREE.Shape()
  const pts: [number, number][] = [
    [-9, 0],
    [9, 0],
    [9, 4],
    [3, 4],
    [3, 8],
    [-3, 8],
    [-3, 12],
    [-9, 12],
  ]
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, { depth: 29.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 1 })
  geo.rotateY(-PI / 2)
  geo.translate(15 - 0.2, 0, 0)
  const m = ghost(mesh(geo, col), col, 0.42)
  return G(m)
}

/** 玻璃罩展示台座：方柱 + 玻璃方罩 */
function domePedestal(p: string[]) {
  const [col, metal, inner] = p
  const g = G(rbox(34, 6, 34, col, {}, 0.8), rbox(28, 86, 28, col, { y: 6 }, 0.6), rbox(34, 6, 34, col, { y: 92 }, 0.8))
  // 绒布垫浮出台面 0.3（以前顶面和台面共面会闪）
  g.add(rbox(30, 0.4, 30, inner, { y: 97.9 }, 0.1))
  const gy = 98
  const gh = 32
  for (const s of [-1, 1]) {
    g.add(ghost(rbox(32, gh, 0.5, GLASS, { y: gy, z: s * 15.75 }, 0.1), GLASS, GLASS_A))
    g.add(ghost(rbox(0.5, gh, 31, GLASS, { x: s * 15.75, y: gy }, 0.1), GLASS, GLASS_A))
  }
  g.add(ghost(rbox(32, 0.5, 32, GLASS, { y: gy + gh }, 0.1), GLASS, GLASS_A))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(0.8, gh + 0.5, 0.8, metal, { x: sx * 15.8, y: gy, z: sz * 15.8 }, 0.2))
  for (const s of [-1, 1]) {
    g.add(rbox(32.4, 0.8, 0.8, metal, { y: gy + gh - 0.3, z: s * 15.8 }, 0.2))
    g.add(rbox(0.8, 0.8, 31, metal, { x: s * 15.8, y: gy + gh - 0.3 }, 0.2))
  }
  return g
}

const PEDESTAL_PALS: PalFlat[] = [
  ['modern', M.white, M.silver, M.light],
  ['modern', M.black, BRASS, M.char],
  ['nordic', N.oak, M.black, N.linen],
  ['retro', R.cream, BRASS, '#7a2a33'],
]

/** 带灯展示柜：玻璃塔柜，顶部灯板发光 */
const LS = { w: 45, d: 38, h: 165, n: 4 }
function lsSpec() {
  const floor = 6
  const inTop = LS.h - 6 - 0.4
  const T = 0.6
  const clear = (inTop - floor - (LS.n - 1) * T) / LS.n
  return { floor, inTop, T, clear, ys: Array.from({ length: LS.n }, (_, k) => floor + k * (clear + T)) }
}
function litShowcase(p: string[]) {
  const [frame, base, light] = p
  const { w, d, h } = LS
  const { floor, inTop, T, ys } = lsSpec()
  const g = G(rbox(w, 6, d, base, {}, 0.6), rbox(w, 6, d, frame, { y: h - 6 }, 0.6))
  g.add(lit(rbox(w - 6, 0.4, d - 6, light, { y: inTop }, 0.1), light, 0.9))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2, inTop + 0.4 - floor, 2, frame, { x: sx * (w / 2 - 1), y: floor, z: sz * (d / 2 - 1) }, 0.3))
  const gh = inTop + 0.4 - floor
  for (const s of [-1, 1]) g.add(ghost(rbox(0.5, gh, d - 4, GLASS, { x: s * (w / 2 - 1), y: floor }, 0.1), GLASS, GLASS_A))
  // 背面玻璃固定，正面玻璃是一扇门（铰链在左，把手在右）
  g.add(ghost(rbox(w - 4, gh, 0.5, GLASS, { y: floor, z: -(d / 2 - 1) }, 0.1), GLASS, GLASS_A))
  const front = [ghost(rbox(w - 4, gh, 0.5, GLASS, { y: floor, z: d / 2 - 1 }, 0.1), GLASS, GLASS_A), rbox(0.6, 14, 0.6, frame, { x: w / 2 - 5, y: 74, z: d / 2 - 0.4 }, 0.2)]
  g.add(swingDoor(front, -(w / 2 - 2), d / 2 - 0.75, 'left'))
  for (let k = 1; k < LS.n; k++) {
    g.add(ghost(rbox(w - 4, T, d - 4.6, GLASS, { y: ys[k] - T, z: -0.3 }, 0.1), GLASS, 0.3))
    g.add(rbox(w - 4, T, 0.6, frame, { y: ys[k] - T, z: d / 2 - 2.3 }, 0.1))
  }
  // 顶部的两颗射灯
  for (const s of [-1, 1]) g.add(lit(cyl(1.2, 1.4, 0.8, light, { x: s * 10, y: inTop - 0.7 }, 16), light, 1))
  return g
}

const LS_PALS: PalFlat[] = [
  ['modern', M.black, M.black, '#ffe9a8'],
  ['nordic', N.white, N.oak, '#fff4d0'],
  ['modern', M.silver, M.gray, '#d8ecff'],
  ['retro', I.walnut, I.walnut, '#ffd98a'],
]

// ---------- 素材表 ----------

const VASE_EXTRA = { ...PROP, family: 'col-vase' }

export const COLLECTIONS: AssetDef[] = [
  // 花瓶 / 瓷器
  define('col-vase-meiping', '梅瓶', 'deco', [19, 19, 32], VASE_PALS, meiping, { ...VASE_EXTRA, sizeLabel: '梅瓶' }),
  define('col-vase-hulu', '葫芦瓶', 'deco', [17, 17, 28], [VASE_PALS[0], VASE_PALS[1], ['retro', '#c8573a', '#f4e7c8', R.mustard], VASE_PALS[3], ['cute', '#ffe3ea', C.sky, '#d65a3c']], hulu, { ...VASE_EXTRA, sizeLabel: '葫芦瓶' }),
  define('col-vase-yuhuchun', '玉壶春瓶', 'deco', [17, 17, 30], VASE_PALS, yuhuchun, { ...VASE_EXTRA, sizeLabel: '玉壶春' }),
  define('col-vase-tianqiu', '天球瓶', 'deco', [25, 25, 35], VASE_PALS, tianqiu, { ...VASE_EXTRA, sizeLabel: '天球瓶' }),
  define('col-vase-longneck', '长颈瓶（鹤首）', 'deco', [15, 15, 30], [VASE_PALS[4], VASE_PALS[1], VASE_PALS[3], ['japanese', '#6e4f37', '#c9a45c', J.dark], ['cute', '#cfe8f5', '#ffb6c8', '#ffb6c8']], longneck, { ...VASE_EXTRA, sizeLabel: '长颈瓶' }),
  define(
    'col-celadon-kinuta',
    '砧青瓷鱼耳瓶',
    'deco',
    [14, 14, 27],
    [
      ['japanese', '#a7cdbd', '#7fa892'],
      ['japanese', '#8fbf9f', '#6a9a7a'],
      ['nordic', '#b5cfd6', '#8aaab4'],
      ['retro', '#d9cfae', '#a89a72'],
    ],
    kinuta,
    PROP,
  ),
  define('col-bw-jar', '青花将军罐', 'deco', [23, 23, 31], BW_PALS, bwJar, PROP),
  define('col-bw-vase', '青花缠枝赏瓶', 'deco', [21, 21, 35], BW_PALS, bwVase, PROP),
  define('col-imari-plate', '伊万里风赏盘（盘架）', 'deco', [30, 16, 31], IMARI_PALS, F(imariPlate(15)), { ...PROP, family: 'col-imari-plate', sizeLabel: '30cm' }),
  define('col-imari-plate-s', '伊万里风赏盘（盘架）', 'deco', [21, 14, 22], IMARI_PALS, F(imariPlate(10.5)), { ...PROP, family: 'col-imari-plate', sizeLabel: '21cm' }),
  define(
    'col-chawan-set',
    '茶碗收藏（三只）',
    'deco',
    [48, 16, 10],
    [
      ['japanese', '#3b2f2a', '#c8573a', '#a9cbb7', J.dark],
      ['retro', '#e0a526', '#2f8f8a', '#a8683a', I.walnut],
      ['modern', '#3d3f44', '#f4f4f2', '#8a8d93', M.black],
      ['nordic', '#f7f5f0', '#9fb4c7', '#a9bfa3', N.oak],
    ],
    chawanSet,
    PROP,
  ),
  define(
    'col-kutani-dishes',
    '九谷烧风小碟组',
    'deco',
    [36, 23, 3],
    [
      ['japanese', '#f6f0e1', '#2b2523'],
      ['japanese', '#f6f0e1', J.shu],
      ['retro', '#f4e7c8', R.caramel],
      ['nordic', N.white, N.oak],
    ],
    kutaniSet,
    PROP,
  ),
  define(
    'col-glass-vase-tall',
    '玻璃花瓶',
    'deco',
    [12, 12, 26],
    GLASS_PALS,
    glassVase(
      [
        [5, 0],
        [5, 0.5],
        [4.6, 6],
        [4.2, 14],
        [4.8, 22],
        [5.8, 26],
      ],
      11,
    ),
    { ...PROP, family: 'col-glass-vase', sizeLabel: '高筒' },
  ),
  define(
    'col-glass-vase-round',
    '玻璃花瓶',
    'deco',
    [19, 19, 18],
    GLASS_PALS,
    glassVase(
      [
        [3, 0],
        [5, 0.5],
        [8, 4],
        [9, 9],
        [7.5, 14],
        [4, 16.5],
        [3.6, 17.4],
        [4.2, 18],
      ],
      7,
    ),
    { ...PROP, family: 'col-glass-vase', sizeLabel: '球形' },
  ),
  define(
    'col-pottery-jars',
    '陶艺小罐（三只）',
    'deco',
    [29, 12, 14.5],
    [
      ['japanese', '#a86a45', '#5a4a40', '#d9cfae'],
      ['nordic', '#e8e1d4', '#a9bfa3', '#9fb4c7'],
      ['retro', '#e0a526', '#2f8f8a', '#c8473a'],
      ['modern', '#3d3f44', '#d7d8db', '#8a8d93'],
      ['cute', '#ffd6e0', '#a6e3cc', '#ffe08f'],
    ],
    potteryJars,
    PROP,
  ),
  define(
    'col-celadon-censer',
    '青瓷三足香炉',
    'deco',
    [16, 16, 12],
    [
      ['japanese', '#a7cdbd', J.dark],
      ['japanese', '#f5f2ea', J.wood],
      ['retro', '#d9cfae', R.caramel],
      ['modern', '#3d3f44', M.black],
    ],
    censer,
    PROP,
  ),
  // 矿石 / 化石
  define('col-amethyst-geode', '紫水晶晶洞', 'hobby', [17, 9, 21], GEODE_PALS, F(geodeDesk), { ...PROP, family: 'col-geode', sizeLabel: '桌面' }),
  define('col-amethyst-cathedral', '紫水晶晶洞', 'hobby', [28, 18, 64], GEODE_PALS, F(geodeCathedral), { family: 'col-geode', sizeLabel: '落地' }),
  define(
    'col-quartz-cluster',
    '水晶簇',
    'hobby',
    [17, 14, 11],
    [
      ['nordic', '#eef5f8', '#9a948c'],
      ['modern', '#8a7f78', '#5d5650'],
      ['cute', '#f6c9d3', '#a89a90'],
      ['retro', '#f3d27a', '#8a7a68'],
    ],
    F((p) => quartzCluster(p)),
    PROP,
  ),
  define(
    'col-pyrite',
    '黄铁矿立方晶',
    'hobby',
    [14, 10, 5.5],
    [
      ['nordic', '#d4b24c', '#8f8a83'],
      ['industrial', '#b8953a', '#4a4846'],
      ['modern', '#a9aeb5', '#5b5d61'],
    ],
    F(pyrite),
    PROP,
  ),
  define(
    'col-agate-slice',
    '玛瑙切片（木座）',
    'hobby',
    [14, 4, 13],
    [
      ['nordic', '#7fa3c8', '#dfe9f2', '#4d6f99', N.oak],
      ['cute', '#e48aa8', '#f8dbe4', '#b5527a', C.woodL],
      ['retro', '#c46a3a', '#f2dcc0', '#8a4a2a', R.caramel],
      ['nordic', '#5aa58a', '#d9efe5', '#2f6f58', N.white],
      ['modern', '#6b6e75', '#e4e5e8', '#2e2f33', M.black],
    ],
    F(agateSlice),
    PROP,
  ),
  define(
    'col-fluorite',
    '萤石八面体',
    'hobby',
    [16, 8, 8],
    [
      ['nordic', '#c3a6ec', '#6a48a8', N.oak],
      ['nordic', '#a6dcc2', '#2f8a63', N.white],
      ['modern', '#b4d4f0', '#3b6fb0', M.black],
      ['cute', '#f6c2d4', '#b5527a', C.woodL],
    ],
    F(fluorite),
    PROP,
  ),
  define(
    'col-ammonite',
    '菊石化石',
    'hobby',
    [12, 7, 15],
    [
      ['nordic', '#c9a77a', '#9c7a52', N.oak],
      ['modern', '#b9b2a6', '#8a8379', M.black],
      ['retro', '#c46a3a', '#8a4a2a', R.cream],
      ['japanese', '#d9cdb4', '#a8987a', J.dark],
    ],
    F(ammonite),
    PROP,
  ),
  define(
    'col-trilobite',
    '三叶虫化石',
    'hobby',
    [19, 15, 4],
    [
      ['nordic', '#6f6a63', '#3b3632', N.oak],
      ['japanese', '#c9b48f', '#8a6a45', J.dark],
      ['modern', '#4a4a4e', '#a8a29a', M.black],
      ['industrial', '#b9805a', '#5a3a28', I.walnut],
    ],
    F(trilobite),
    PROP,
  ),
  define(
    'col-meteorite',
    '陨石标本',
    'hobby',
    [19, 9, 7],
    [
      ['modern', '#4a4846', '#c3c7cc', M.black],
      ['nordic', '#5b544e', '#d0d4d8', N.oak],
      ['industrial', '#3a3634', '#a9aeb5', I.walnut],
    ],
    F(meteorite),
    PROP,
  ),
  define(
    'col-mineral-box',
    '矿物标本盒（16 格）',
    'hobby',
    [34, 32, 29.5],
    [
      ['nordic', '#c9a06a', '#f4efe3', '#a07a4a'],
      ['retro', I.walnut, '#efe6d2', I.walnut],
      ['modern', M.black, '#e9e9e6', M.black],
      ['japanese', J.hinoki, J.washi, J.wood],
    ],
    F(mineralBox),
    PROP,
  ),
  define(
    'col-dome-specimen',
    '玻璃罩矿石标本',
    'hobby',
    [20, 20, 25],
    [
      ['nordic', N.oak, '#c3a6ec', '#8f8a83'],
      ['modern', M.walnut, '#eef5f8', '#5d5650'],
      ['cute', C.woodL, '#f6c9d3', '#a89a90'],
      ['retro', R.caramel, '#f3d27a', '#8a7a68'],
    ],
    domeSpecimen,
    PROP,
  ),
  // 硬币
  define('col-coin-album', '硬币收藏册', 'hobby', [33, 25, 2], ALBUM_PALS, (p) => albumOpen(p, 'coinpage', drawCoinPage(p[1], 3), drawCoinPage(p[1], 8)), { ...PROP, family: 'col-coin-album', form: 'open' }),
  define('col-coin-album-stack', '硬币收藏册', 'hobby', [20, 27, 7.5], ALBUM_PALS, F((p) => albumStack(p, 'coinalbum', coinLabel)), { ...PROP, family: 'col-coin-album', form: 'stacked' }),
  define('col-coin-frame', '硬币展示框', 'hobby', [42, 3, 30], FRAME_PALS, coinFrame(42, 30, 6, 3, false), { family: 'col-coin-frame', sizeLabel: '壁挂', mount: 140 }),
  define('col-coin-frame-desk', '硬币展示框', 'hobby', [24, 10, 18], FRAME_PALS, coinFrame(24, 18, 4, 2, true), { ...PROP, family: 'col-coin-frame', sizeLabel: '桌面' }),
  define(
    'col-coin-case',
    '硬币盒（天鹅绒圆槽）',
    'hobby',
    [22, 21, 19],
    [
      ['retro', '#6b3428', '#7a2a33', BRASS],
      ['modern', M.black, '#2f3f6a', M.silver],
      ['nordic', N.oak, '#4f6b5a', BRASS],
      ['industrial', I.walnut, '#2a2522', BRASS],
    ],
    F(coinCase),
    PROP,
  ),
  define(
    'col-coin-rolls',
    '硬币卷（托盘）',
    'hobby',
    [23, 11, 10],
    [
      ['retro', R.caramel, '#c8473a', '#2f8f8a', '#e0a526'],
      ['nordic', N.oak, '#9fb4c7', '#a9bfa3', '#e3b549'],
      ['modern', M.black, '#d7d8db', '#8a8d93', '#c9a45c'],
      ['cute', C.woodL, '#ffb6c8', '#a8d4f4', '#ffe08f'],
    ],
    F(coinRolls),
    PROP,
  ),
  define(
    'col-cash-string',
    '古钱币一串（方孔钱）',
    'hobby',
    [26, 13, 3],
    [
      ['japanese', '#8a7a3e', '#c8473a', J.ai],
      ['retro', '#6f8f6a', '#c8473a', R.cream],
      ['modern', '#5a5040', GOLD, M.black],
      ['japanese', '#a07a3a', J.shu, J.washi],
    ],
    F(cashString),
    PROP,
  ),
  define(
    'col-coin-loupe',
    '放大镜 + 硬币托盘',
    'hobby',
    [32, 12, 2],
    [
      ['retro', I.walnut, '#7a2a33', '#2a2522'],
      ['nordic', N.oak, '#4f6b5a', N.oak],
      ['modern', M.black, '#2f3f6a', M.black],
      ['industrial', I.leather, '#2a2522', I.walnut],
    ],
    F(coinLoupe),
    PROP,
  ),
  define(
    'col-coin-slabs',
    '评级币盒（立架）',
    'hobby',
    [26, 6, 10],
    [
      ['modern', M.black, '#2f4d8a'],
      ['modern', M.white, '#c8473a'],
      ['nordic', N.oak, '#4f6b5a'],
    ],
    F(coinSlabs),
    PROP,
  ),
  // 邮票
  define('col-stamp-album', '邮票册', 'hobby', [33, 25, 2], STAMP_ALBUM_PALS, (p) => albumOpen(p, 'stamppage', drawStampPage(p[1], 5), drawStampPage(p[1], 12)), { ...PROP, family: 'col-stamp-album', form: 'open' }),
  define('col-stamp-album-stack', '邮票册', 'hobby', [20, 27, 7.5], STAMP_ALBUM_PALS, F((p) => albumStack(p, 'stampalbum', stampLabel)), { ...PROP, family: 'col-stamp-album', form: 'stacked' }),
  define('col-stamp-frame', '裱框邮票', 'hobby', [34, 2.4, 44], STAMP_FRAME_PALS, stampFrame(34, 44, 3, 4, false), { family: 'col-stamp-frame', sizeLabel: '壁挂', mount: 135 }),
  define('col-stamp-frame-desk', '裱框邮票', 'hobby', [20, 12, 25], STAMP_FRAME_PALS, stampFrame(20, 25, 2, 2, true), { ...PROP, family: 'col-stamp-frame', sizeLabel: '桌面' }),
  define(
    'col-stamp-tools',
    '集邮工具（镊子·放大镜·护邮袋）',
    'hobby',
    [28, 18, 1.5],
    [
      ['retro', '#7a5236', '#2a2522'],
      ['nordic', '#a9bfa3', N.oak],
      ['modern', M.char, M.black],
      ['japanese', J.ai, J.dark],
    ],
    stampTools,
    PROP,
  ),
  // 展示家具
  define('col-curio-cabinet', '古董陈列柜', 'storage', [90, 40, 180], CURIO_PALS, curioCabinet(90, 40, 180, 5), {
    family: 'col-curio-cabinet',
    sizeLabel: '90',
    surface: 180,
    surfaces: curioSurfaces(90, 40, 180, 5),
    openable: true,
  }),
  define('col-curio-cabinet-60', '古董陈列柜', 'storage', [60, 36, 160], CURIO_PALS, curioCabinet(60, 36, 160, 4), {
    family: 'col-curio-cabinet',
    sizeLabel: '60',
    surface: 160,
    surfaces: curioSurfaces(60, 36, 160, 4),
    openable: true,
  }),
  define('col-bogu-shelf', '博古架', 'storage', [BOGU.w, BOGU.d, BOGU.h], BOGU_PALS, bogu, {
    surface: BOGU.h,
    surfaces: BOGU_CELLS.map(([x0, x1, y0, y1]) => ({ y: y0 + 1, h: y1 - y0 - 2, shape: [rectPoly(x0 + 1, -BOGU.d / 2 + 0.8, x1 - 1, BOGU.d / 2)] })),
  }),
  define(
    'col-wall-showcase',
    '壁挂收藏展示格（16 格）',
    'deco',
    [WSC.w, WSC.d, WSC.h],
    [
      ['nordic', N.white, N.oak],
      ['nordic', N.oak, N.white],
      ['modern', M.black, M.char],
      ['retro', I.walnut, '#7a2a33'],
      ['cute', '#fff7ef', '#ffd6e0'],
    ],
    wallShowcase,
    { mount: WSC.mount, surface: WSC.mount + WSC.h, surfaces: wscSurfaces },
  ),
  define(
    'col-acrylic-riser',
    '亚克力阶梯展示台',
    'deco',
    [30, 18, 12],
    [
      ['modern', '#dff1fa'],
      ['modern', '#9a9ea6'],
      ['cute', '#f8c8d6'],
      ['nordic', '#c8e0f0'],
    ],
    acrylicRiser,
    {
      ...PROP,
      surface: 12,
      surfaceShape: [rectPoly(-15, -9, 15, -3)],
      surfaces: [
        { y: 4, h: 40, shape: [rectPoly(-15, 3, 15, 9)] },
        { y: 8, h: 40, shape: [rectPoly(-15, -3, 15, 3)] },
      ],
    },
  ),
  define('col-dome-pedestal', '玻璃罩展示台座', 'deco', [34, 34, 130.5], PEDESTAL_PALS, domePedestal, {
    surface: 130.5,
    surfaces: [{ y: 98, h: 31.5, shape: [rectPoly(-15.5, -15.5, 15.5, 15.5)] }],
  }),
  define('col-lit-showcase', '带灯展示柜', 'storage', [LS.w, LS.d, LS.h], LS_PALS, litShowcase, {
    surface: LS.h,
    surfaces: lsSpec().ys.map((y) => ({ y, h: lsSpec().clear, inside: true, glass: true, shape: [rectPoly(-LS.w / 2 + 2, -LS.d / 2 + 1.5, LS.w / 2 - 2, LS.d / 2 - 1.5)] })),
    openable: true,
  }),
]
