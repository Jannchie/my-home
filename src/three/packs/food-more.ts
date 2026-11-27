// 更多餐食与厨房小电器：快餐、面食、早餐、点心、甜品、面包拼盘，以及华夫饼机、热压三明治机、养生壶、豆浆机、手摇刨冰机。约定见 kit.ts 开头。
// 都是桌面摆件（prop）：原点在占地中心的底面，正面朝 +z。盘、碗、杯、篮都是真空心，食物放在口沿以内，不画脸。
// 食物是固有色（文件顶部常量），配色槽换的是盘子 / 托盘 / 包装 / 杯子 / 机身的颜色；type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, box, cached, cup, cyl, rbox, shade, torus, tray, type At } from '../toon'
import { C, holePanel, rng, slab, type AssetDef, type Fx } from '../kit'
import { G, P, PI, cylX, fitGroup, ghost, lathe, latheAt, lit, mesh, noOutline, rod3, taperRod3, tube, type V2, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

// ---------- 固定色 ----------
const STEEL = '#c3c7cc'
const DARK = '#2a2b30'
const IRON = '#33343a'
const GLASS = '#d8eef9'
const PAPER = '#fbf6ea'
const BUN = '#d9953f'
const BUN_L = '#e6b062'
const BREAD = '#f7dca6'
const CRUST = '#c98a4f'
const TOAST = '#dba254'
const PATTY = '#6e4230'
const CHEESE = '#ffc23c'
const LETTUCE = '#8fce5a'
const LEAF = '#4f9e4a'
const TOMATO = '#e8543e'
const FRY = '#f2c14e'
const FRIED = '#c8792e'
const KETCHUP = '#c9302a'
const MUSTARD = '#e8b83a'
const MILK_TEA = '#d9b38c'
const MATCHA = '#b9cf8e'
const PEARL = '#2c1f1c'
const NOODLE = '#f3d58a'
const MEAT_SAUCE = '#b5391f'
const STEAK = '#7a4630'
const CORN = '#ffd24a'
const POTATO = '#e8c170'
const EGG_W = '#fffaf0'
const EGG_Y = '#ffb92e'
const BACON = '#b5483a'
const BACON_FAT = '#f3c9a8'
const SAUSAGE = '#b5562f'
const JUICE = '#f6a21e'
const DOUGH = '#f6ecd2'
const SEAR = '#c98a3c'
const VINEGAR = '#3a1f18'
const ICE = '#f4fbff'
const SYRUP_RED = '#e8455a'
const CONDENSED = '#fff3cf'
const TAIYAKI = '#d59a4e'
const ANKO = '#5a2530'
const PANCAKE = '#f0cc88'
const PANCAKE_TOP = '#c98544'
const MAPLE = '#b5651d'
const BUTTER = '#fff1a8'
const BLUEBERRY = '#3a3f7a'
const STRAWBERRY = '#e23d4e'
const HAM = '#e88f8f'
const SALAMI = '#a83a35'
const GRAPE = '#6a3d8a'
const CRACKER = '#e8c98a'
const WAFFLE = '#d9a047'
const WAFFLE_L = '#edc16d'
const SOYMILK = '#f6efdc'
const SOYBEAN = '#e8d28a'
const TEA_AMBER = '#c9743a'
const GOJI = '#d83a2a'
const JUJUBE = '#7a2420'
const MELON = '#f0505a'
const RIND = '#3f8f3a'

// ---------- 小工具 ----------

type Spot = { x?: number; y?: number; z?: number }

/**
 * 低面数小球（珍珠、玉米粒、蓝莓这类成堆的小颗粒）：共享的 ball，默认 8×6 段（80 个三角面）；at.y 为球心。
 * 不到 1cm、一撒一大把的（芝麻、玉米粒、珍珠、褶子）用 GRAIN（6×4 段，36 个面）
 */
function bead(r: number, color: string, at: At = {}, scale?: [number, number, number], seg: [number, number] = [8, 6]) {
  return ball(r, color, at, scale, seg)
}
const GRAIN: [number, number] = [6, 4]

/** 圆角圆饼（面包胚、肉饼、松饼、机身）：比 puck 省面，at.y 为底面 */
function pad(r: number, h: number, color: string, at: Spot = {}, seg = 24) {
  const geo = cached(`fd-pad${r},${h},${seg}`, () => {
    const k = Math.min(h * 0.45, r * 0.4)
    const pts: V2[] = [[0, 0], [r - k, 0], [r - k * 0.3, k * 0.3], [r, k], [r, h - k], [r - k * 0.3, h - k * 0.3], [r - k, h], [0, h]]
    return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
  })
  return P(mesh(geo, color), at.x ?? 0, at.y ?? 0, at.z ?? 0)
}

/** 圆顶（底面封口）：底面半径 r、高 h，at.y 为底面 */
function domeOf(r: number, h: number, color: string, at: Spot = {}, seg = 20) {
  const pts: V2[] = [[0, 0], [r * 0.94, 0]]
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (PI / 2)
    pts.push([i === 6 ? 0 : r * Math.cos(a), h * 0.08 + h * 0.92 * Math.sin(a)])
  }
  return latheAt(pts, color, at, seg)
}

/** 盘子（真空心的浅盘）：半径 r、口沿高 h；内底在 y = PLATE_IN，平底部分的半径约 r × 0.6 */
const PLATE_IN = 0.6
function plateOf(r: number, h: number, color: string, at: Spot = {}) {
  const pts: V2[] = [[0, 0.2], [r * 0.5 - 0.3, 0.2], [r * 0.5 - 0.3, 0], [r * 0.5, 0], [r * 0.6, 0.3], [r * 0.86, h * 0.6], [r, h], [r - 0.35, h + 0.05], [r * 0.84, h * 0.6 + 0.3], [r * 0.6, PLATE_IN], [0, PLATE_IN]]
  return latheAt(pts, color, at, 28)
}

/** 盘子内表面在离盘心 d 处的高度：平底那一圈（r × 0.6）以外是往上翘的斜坡，摆在斜坡上的东西按它抬高 */
function plateInY(r: number, h: number, d: number) {
  const a: V2 = [r * 0.6, PLATE_IN]
  const b: V2 = [r * 0.84, h * 0.6 + 0.3]
  const c: V2 = [r - 0.35, h + 0.05]
  if (d <= a[0]) return PLATE_IN
  const [p, q] = d <= b[0] ? [a, b] : [b, c]
  return p[1] + ((q[1] - p[1]) * (d - p[0])) / (q[0] - p[0])
}

/** 让摆在盘子斜坡上的东西顺着斜坡躺：绕它所在位置的切线倾 tilt 弧度，朝盘外的一侧翘起（盘心在 o 的父节点原点），水平朝向不变 */
function leanOut<T extends THREE.Object3D>(o: T, tilt: number): T {
  const d = Math.hypot(o.position.x, o.position.z) || 1
  o.quaternion.setFromAxisAngle(new THREE.Vector3(-o.position.z / d, 0, o.position.x / d), tilt)
  return o
}

/** 碗（真空心）：口半径 r、高 h、壁厚 t，带矮圈足；at.y 为底面 */
function bowlOf(r: number, h: number, color: string, at: Spot = {}, t = 0.4, seg = 28) {
  const foot = r * 0.45
  const pts: V2[] = [[0, 0.3], [foot - 0.4, 0.3], [foot - 0.4, 0], [foot, 0], [foot, 0.5]]
  const n = 5
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (PI / 2)
    pts.push([foot + (r - foot) * Math.sin(a), 0.5 + (h - 0.5) * (1 - Math.cos(a))])
  }
  pts.push([r - t, h])
  for (let i = n - 1; i >= 0; i--) {
    const a = (i / n) * (PI / 2)
    pts.push([foot - t * 0.6 + (r - t - (foot - t * 0.6)) * Math.sin(a), 0.5 + t + (h - 0.5 - t) * (1 - Math.cos(a))])
  }
  pts.push([0, 0.5 + t])
  return latheAt(pts, color, at, seg)
}
/** 碗内壁在高度 y（离碗底）处的半径 */
function bowlInR(r: number, h: number, y: number, t = 0.4) {
  const foot = r * 0.45
  const k = Math.min(1, Math.max(0, (y - 0.5 - t) / (h - 0.5 - t)))
  return foot - t * 0.6 + (r - t - (foot - t * 0.6)) * Math.sin(Math.acos(1 - k))
}

/** 小蘸碟 / 酱料杯（真空心、薄壁、少面）：at.y 为底面，内底在 0.25 */
function miniCup(rTop: number, rBottom: number, h: number, color: string, at: Spot = {}, seg = 16) {
  return latheAt([[0, 0], [rBottom, 0], [rTop, h], [rTop - 0.22, h], [rBottom - 0.2, 0.25], [0, 0.25]], color, at, seg)
}

/** 圆弧上的点：'xy' 平面里 x = cos a、y = sin a；'xz' 平面里 x = cos a、z = sin a */
function arcPts(c: V3, r: number, a0: number, a1: number, n: number, plane: 'xy' | 'xz' = 'xy'): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push(plane === 'xy' ? [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]] : [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r])
  }
  return out
}

/** 叉子：平放，长 len 沿 z（齿朝 -z、柄朝 +z），底面在 y = 0 */
function forkOf(len: number, handle: string) {
  const o = new THREE.Group()
  o.add(rbox(1.1, 0.5, len * 0.46, handle, { z: len * 0.27 }, 0.24))
  o.add(box(0.6, 0.3, len * 0.26, STEEL, { y: 0.1, z: -len * 0.06 }))
  o.add(box(2, 0.3, len * 0.13, STEEL, { y: 0.1, z: -len * 0.225 }))
  for (const x of [-0.78, 0, 0.78]) o.add(box(0.42, 0.26, len * 0.23, STEEL, { x, y: 0.12, z: -len * 0.385 }))
  return o
}

/** 餐刀：平放，长 len 沿 z（刀尖朝 -z、柄朝 +z），底面在 y = 0 */
function knifeOf(len: number, handle: string, bladeW = 1.5) {
  const o = new THREE.Group()
  o.add(rbox(1.2, 0.55, len * 0.44, handle, { z: len * 0.28 }, 0.26))
  o.add(box(bladeW, 0.22, len * 0.58, STEEL, { y: 0.14, z: -len * 0.21 }))
  return o
}

/** 把平放建好的东西摆到 (x, y, z)：先绕自身 x 轴抬头 pitch、绕长轴侧倾 roll，再绕 y 轴转 yaw */
function laid(o: THREE.Object3D, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) {
  o.rotation.set(pitch, 0, roll)
  return P(G(o), x, y, z, 0, yaw, 0)
}

/** 波浪形薄条（培根）：沿 x 长 len、宽 w（沿 z）、厚 t，波幅 amp、waves 个波；最低点在 y = 0 */
function wavyStrip(len: number, w: number, t: number, amp: number, waves: number, color: string) {
  const n = waves * 6
  const bot: THREE.Vector2[] = []
  const top: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n
    const y = amp + amp * Math.sin((i / n) * waves * PI * 2)
    bot.push(new THREE.Vector2(x, y))
    top.push(new THREE.Vector2(x, y + t))
  }
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape([...bot, ...top.reverse()]), { depth: w, bevelEnabled: false })
  geo.translate(0, 0, -w / 2)
  return mesh(geo, color)
}

/**
 * 贴在车削器身外壁上的一片弧形贴片（竖条纹、小屏）的轮廓：面比器身鼓出 0.12，上下两条边折回去、压进器身 dip。
 * 只有鼓出的那一面的话，整片离器身 0.12 浮着，哪儿都不挨。折角处的点写两遍：车削的法线不跨折角平均，面上的明暗还是平的
 */
function patchProfile(r0: number, y0: number, r1: number, y1: number, dip = 0.15): V2[] {
  const a: V2 = [r0 + 0.12, y0]
  const b: V2 = [r1 + 0.12, y1]
  return [[r0 - dip, y0], a, a, b, b, [r1 - dip, y1]]
}

/** 圆台容器外壁上的一圈色带：器身外半径从 y0 处的 r0 到 y1 处的 r1，比器身鼓出 0.12（段数要和器身一致） */
function wallBand(r0: number, y0: number, r1: number, y1: number, color: string, at: Spot = {}, seg = 32) {
  return noOutline(latheAt([[r0 + 0.12, y0], [r1 + 0.12, y1]], color, at, seg))
}

// ---------- 汉堡薯条套餐：托盘上一只分层的汉堡、一盒薯条、一杯插吸管的饮料和一小杯番茄酱 ----------

function burgerSet(p: string[]) {
  const [trayC, boxC, cupC, acc] = p
  const g = new THREE.Group()
  g.add(tray(34, 1.8, 26, 0.5, trayC, {}, 0.5))
  // 垫纸（嵌进托盘底，只露 0.2）
  g.add(noOutline(box(29.5, 0.3, 21.5, PAPER, { y: 0.4, ry: 0.03 })))
  const Y = 0.7
  // 汉堡：下胚、生菜、肉饼、芝士、番茄、上胚
  const b = new THREE.Group()
  b.add(pad(5.3, 1.8, BUN))
  b.add(ball(5.9, LETTUCE, { y: 2 }, [1, 0.11, 1], [16, 6]))
  b.add(pad(5.5, 1.6, PATTY, { y: 2.1 }))
  b.add(rbox(9.4, 0.4, 9.4, CHEESE, { y: 3.55, ry: 0.5 }, 0.15))
  b.add(cyl(5, 5, 0.5, TOMATO, { y: 3.9 }, 20))
  b.add(domeOf(5.4, 3.5, BUN, { y: 4.3 }))
  for (let k = 0; k < 7; k++) {
    const az = k * 2.4
    const el = 0.62 + (k % 3) * 0.28
    b.add(noOutline(bead(0.3, '#f6e6b8', { x: 5.4 * Math.cos(el) * Math.cos(az), y: 4.3 + 0.28 + 3.22 * Math.sin(el) + 0.05, z: 5.4 * Math.cos(el) * Math.sin(az), ry: -az }, [1.5, 0.45, 0.8], GRAIN)))
  }
  g.add(P(b, -8, Y, 1.5))
  // 薯条盒：上大下小的方纸盒，后壁高一截，里面插着长短不一的薯条。
  // 薯条只画盒口附近往上的那段：盒子越往下越窄，整根从盒底插上来的话外侧几根会从侧壁穿出去
  const f = new THREE.Group()
  const carton = latheAt([[0, 0], [3.9, 0], [5.5, 8], [5.2, 8], [3.7, 0.3], [0, 0.3]], boxC, {}, 4)
  carton.rotation.y = PI / 4
  const shellG = G(carton)
  shellG.scale.z = 0.62
  // 盒里的薯条堆：填到盒口下面一点，上面那些单根的薯条都从它里面伸出来（原来盒里是空的，露出来的那几截悬在盒口）
  const heap = noOutline(latheAt([[0, 0.3], [3.5, 0.3], [4.8, 7], [0, 7]], FRY, {}, 4))
  heap.rotation.y = PI / 4
  shellG.add(heap)
  f.add(shellG)
  f.add(rbox(6.8, 2.6, 0.3, boxC, { y: 7.3, z: -2.3 }, 0.14))
  f.add(noOutline(bead(1.3, acc, { y: 4.2, z: 2.02 }, [1, 1, 0.14])))
  const r = rng(7)
  const cut = 3.5
  for (let i = 0; i < 11; i++) {
    const back = i < 6
    const x = (back ? -2.75 + i * 1.1 : -2.4 + (i - 6) * 1.2) + (r() - 0.5) * 0.4
    const h = (back ? 9 : 7) + r() * 2.6
    const z = (back ? -1 : 0.6) + (r() - 0.5) * 0.3
    const rx = (r() - 0.5) * 0.2
    const rz = (r() - 0.5) * 0.3
    // 还是原来那根（中心在 y = 3 + h / 2）的轴线，去掉下面 cut 长的一截：中心沿轴线上移 cut / 2
    const k = cut / 2
    f.add(P(box(0.9, h - cut, 0.9, FRY), x - Math.sin(rz) * k, 3 + h / 2 + Math.cos(rz) * Math.cos(rx) * k, z + Math.cos(rz) * Math.sin(rx) * k, rx, 0, rz))
  }
  g.add(P(f, 5, Y - 0.1, -6))
  // 饮料：纸杯 + 塑料盖 + 吸管，杯身一圈色带
  const d = new THREE.Group()
  d.add(cup(3.9, 3, 11.5, 0.3, cupC, {}, 20))
  d.add(wallBand(3 + (0.9 * 4) / 11.5, 4, 3 + (0.9 * 7.5) / 11.5, 7.5, acc, {}, 20))
  d.add(pad(4.15, 0.9, '#f4f4f2', { y: 11.2 }))
  d.add(rod3([0.8, 11.6, 0], [1.9, 16.3, -0.6], 0.32, acc, 8))
  g.add(P(d, 10.5, Y, 5.5))
  // 番茄酱小杯
  g.add(miniCup(1.9, 1.5, 1.7, PAPER, { x: 0.5, y: Y, z: 8.6 }, 12))
  g.add(noOutline(cyl(1.55, 1.55, 0.3, KETCHUP, { x: 0.5, y: Y + 1, z: 8.6 }, 12)))
  return fitGroup(g)
}

// ---------- 炸鸡桶：竖条纹的锥形纸桶里堆着炸鸡块，顶上露出一只鸡腿，旁边两只蘸酱小盒 ----------

function friedChicken(p: string[]) {
  const [bucket, stripe, dip] = p
  const g = new THREE.Group()
  const RT = 8.5
  const RB = 6.5
  const H = 14
  const rAt = (y: number) => RB + ((RT - RB) * y) / H
  const bk = new THREE.Group()
  bk.add(cup(RT, RB, H, 0.35, bucket))
  // 八道竖条纹：贴着桶壁的扇形圆台面，角度和桶身的 32 段对齐
  for (let i = 0; i < 8; i++) bk.add(noOutline(lathe(patchProfile(rAt(0.8), 0.8, rAt(13.2), 13.2), stripe, 2, [(i * PI) / 4 + PI / 16, PI / 8])))
  bk.add(torus(RT, 0.4, stripe, { y: H - 0.1, rx: PI / 2 }, PI * 2, [6, 32]))
  // 炸鸡：桶口垫一层，上面堆几块
  bk.add(cyl(RT - 0.9, RT - 1.1, 1, FRIED, { y: 11.4 }, 16))
  const pcs: [number, number, number, number, number, number, number][] = [
    [-3.6, 13.5, -2.2, 3, 1.15, 0.85, 1],
    [2.8, 13.7, -3, 3.1, 1, 0.9, 1.2],
    [3.9, 13.3, 2.6, 3, 1.2, 0.85, 1],
    [-2.6, 13.4, 3.4, 3.1, 1.1, 0.9, 1.1],
    [0.3, 15.6, 0.4, 3.1, 1.2, 0.85, 1.05],
  ]
  pcs.forEach(([x, y, z, rr, sx, sy, sz], i) => bk.add(ball(rr, i % 2 ? shade(FRIED, -0.04) : FRIED, { x, y, z, ry: i }, [sx, sy, sz], [12, 8])))
  // 鸡腿：肉 + 露出来的骨头
  const leg = new THREE.Group()
  leg.add(ball(2.4, FRIED, {}, [1, 1.3, 1], [12, 8]))
  leg.add(cyl(0.5, 0.6, 3, '#f4ead8', { y: 2.6 }, 8))
  for (const s of [-1, 1]) leg.add(bead(0.6, '#f4ead8', { x: s * 0.45, y: 5.7 }))
  bk.add(P(leg, -1.2, 14.6, -3.6, -0.3, 0, 0.35))
  g.add(P(bk, -3.2, 0, 0))
  // 两只蘸酱小盒：番茄酱、蜂蜜芥末
  for (const [x, z, c] of [
    [9.3, 3.4, KETCHUP],
    [8.7, -2.6, MUSTARD],
  ] as const) {
    g.add(miniCup(2.6, 2.1, 2.4, dip, { x, z }))
    g.add(noOutline(cyl(2.15, 2.15, 0.3, c, { x, y: 1.5, z }, 16)))
  }
  return fitGroup(g)
}

// ---------- 珍珠奶茶（两杯）：透明杯里杯底一圈黑珍珠、上面是奶茶，封膜上插一根粗吸管 ----------

function bubbleTea(p: string[]) {
  const [film, straw, sticker] = p
  const g = new THREE.Group()
  const rOut = (y: number) => 2.9 + (0.9 * y) / 13
  /** 杯子内壁在高度 y 处的半径 */
  const rIn = (y: number) => 2.68 + (0.87 * (y - 0.3)) / 12.7
  const one = (x: number, tea: string, seed: number) => {
    const o = new THREE.Group()
    // 杯底的珍珠：两圈小球围着一根茶色芯
    o.add(noOutline(cyl(1.6, 1.5, 2.3, tea, { y: 0.3 }, 12)))
    for (let i = 0; i < 16; i++) {
      const up = i >= 8
      const a = (i / 8) * PI * 2 + (up ? 0.39 : 0)
      o.add(noOutline(bead(0.6, PEARL, { x: Math.cos(a) * (up ? 2.12 : 2.02), y: up ? 1.9 : 0.92, z: Math.sin(a) * (up ? 2.12 : 2.02) }, undefined, GRAIN)))
    }
    // 奶茶（珍珠层以上）+ 几颗浮起来贴着杯壁的珍珠（球心跟着内壁走：杯子上宽下窄，按固定半径放的话高处的几颗整颗埋在奶茶里）
    o.add(noOutline(cyl(3.38, 2.74, 9.4, tea, { y: 2.5 }, 20)))
    const r = rng(seed)
    for (let i = 0; i < 4; i++) {
      const a = r() * PI * 2
      const y = 3.2 + r() * 2.6
      const d = rIn(y) - 0.42
      o.add(noOutline(bead(0.5, PEARL, { x: Math.cos(a) * d, y, z: Math.sin(a) * d }, undefined, GRAIN)))
    }
    o.add(ghost(latheAt([[0, 0], [2.9, 0], [3.8, 13], [3.55, 13], [2.68, 0.3], [0, 0.3]], GLASS, {}, 24), GLASS, 0.3))
    // 封膜 + 贴纸 + 粗吸管（斜插）
    o.add(pad(3.85, 0.35, film, { y: 12.85 }))
    o.add(noOutline(bead(1.5, sticker, { y: 7.4, z: rOut(7.4) }, [1, 1, 0.1])))
    o.add(rod3([0.4, 2.8, 0.2], [1.7, 17.8, -0.7], 0.55, straw, 10))
    return P(o, x, 0, 0)
  }
  g.add(one(-4.65, MILK_TEA, 3))
  g.add(one(4.65, MATCHA, 8))
  return fitGroup(g)
}

// ---------- 意大利面：深盘里一卷番茄肉酱面，顶上肉酱和两片罗勒，叉子搭在盘沿 ----------

function pastaPlate(p: string[]) {
  const [plateC, rim, handle] = p
  const g = new THREE.Group()
  g.add(plateOf(12, 3.2, plateC))
  g.add(noOutline(torus(11.75, 0.17, rim, { y: 3.27, rx: PI / 2 }, PI * 2, [4, 28])))
  // 面：一座小丘 + 一圈圈叠上去的面条
  g.add(domeOf(5.6, 2.6, NOODLE, { y: PLATE_IN }))
  const rings: [number, number, number, number, number, number][] = [
    [4.7, 1.6, 0.08, 0.05, 0, 0],
    [4, 2.4, -0.12, 0.1, 0.3, -0.2],
    [3.2, 3.1, 0.14, -0.1, -0.2, 0.2],
    [2.4, 3.7, -0.1, 0.12, 0.2, 0.1],
  ]
  rings.forEach(([rr, y, rx, rz, x, z], i) => g.add(torus(rr, 0.42, i % 2 ? shade(NOODLE, -0.05) : NOODLE, { x, y, z, rx: PI / 2 + rx, rz }, PI * 2, [6, rr > 3.5 ? 20 : 16])))
  // 散在盘里的两根
  g.add(tube([[5.2, 0.9, 2.6], [7, 0.95, 0.4], [6.2, 0.9, -2.8]], 0.36, NOODLE, { seg: 8, radial: 5 }))
  g.add(tube([[-5.6, 0.9, -2], [-6.9, 0.95, 0.6], [-5, 0.9, 3.4]], 0.36, NOODLE, { seg: 8, radial: 5 }))
  // 肉酱 + 肉粒 + 罗勒叶
  g.add(ball(3.1, MEAT_SAUCE, { y: 4.2 }, [1, 0.42, 1], [16, 8]))
  g.add(ball(1.7, MEAT_SAUCE, { x: 2.3, y: 3.5, z: 1.6 }, [1.2, 0.4, 0.9]))
  for (const [x, z] of [
    [-1.4, 0.9],
    [1.2, -1.1],
    [0.3, 1.7],
    [-0.6, -1.5],
    [1.9, 0.5],
  ])
    g.add(noOutline(bead(0.5, PATTY, { x, y: 5.15 - Math.hypot(x, z) * 0.22, z }, undefined, GRAIN)))
  g.add(bead(1.4, LEAF, { x: -0.5, y: 5.6, z: 0.2, ry: 0.6, rz: 0.2 }, [0.62, 0.16, 1]))
  g.add(bead(1.2, LEAF, { x: 0.8, y: 5.55, z: -0.5, ry: -0.9, rz: -0.25 }, [0.62, 0.16, 1]))
  // 叉子横搭在右边盘沿上
  g.add(laid(forkOf(17, handle), 9.4, 3.2, 0))
  return fitGroup(g)
}

// ---------- 铁板牛排：木垫上的椭圆铸铁盘，牛排带烤纹和黄油块，配玉米粒、西兰花、土豆块，两边摆着刀叉 ----------

function steakPlate(p: string[]) {
  const [board, handle, sauce] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.6, 20, board, {}, 1.2))
  // 铸铁盘（椭圆、带矮沿和两只耳）
  const ironP = G(latheAt([[0, 0], [8.6, 0], [9.6, 0.5], [10, 1.9], [9.5, 1.9], [9, 0.8], [0, 0.8]], IRON, {}, 28))
  ironP.scale.set(1.3, 1, 0.86)
  ironP.position.y = 1.6
  g.add(ironP)
  for (const s of [-1, 1]) g.add(rbox(2.4, 0.7, 4, IRON, { x: s * 13.4, y: 2.9 }, 0.3))
  const Y = 2.4
  // 牛排 + 烤纹 + 黄油
  const st = G(pad(4.3, 2.1, STEAK, {}, 20))
  st.scale.set(1.45, 1, 0.95)
  for (let i = 0; i < 4; i++) st.add(noOutline(box(4.6, 0.3, 0.42, shade(STEAK, -0.12), { x: (-2.3 + i * 1.5) / 1.45, y: 1.92, ry: 0.7 })))
  g.add(P(st, -3.4, Y, 0.8, 0, 0.15, 0))
  g.add(rbox(2, 0.9, 2, BUTTER, { x: -3.6, y: Y + 2.05, z: 0.9, ry: 0.5 }, 0.3))
  // 玉米粒
  g.add(domeOf(2.5, 1.3, CORN, { x: 6, y: Y, z: -3.6 }, 12))
  const r = rng(4)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    const d = i % 3 === 0 ? 0.5 : 1.7
    g.add(noOutline(bead(0.4, i % 2 ? CORN : shade(CORN, -0.06), { x: 6 + Math.cos(a) * d, y: Y + 1.35 - d * 0.32 + r() * 0.1, z: -3.6 + Math.sin(a) * d }, undefined, GRAIN)))
  }
  // 西兰花两朵
  for (const [x, z, ry] of [
    [8.8, 0.3, 0],
    [5.9, 3.8, 1.2],
  ]) {
    const br = new THREE.Group()
    br.add(cyl(0.55, 0.65, 1.3, '#9ccf6a', {}, 8))
    for (let k = 0; k < 3; k++) br.add(bead(1.1, LEAF, { x: Math.cos(k * 2.1) * 0.75, y: 1.9, z: Math.sin(k * 2.1) * 0.75 }))
    br.add(bead(1.05, shade(LEAF, 0.04), { y: 2.5 }))
    g.add(P(br, x, Y, z, 0, ry, 0))
  }
  // 土豆块
  g.add(rbox(3, 1.6, 1.9, POTATO, { x: 9.3, y: Y, z: -2.2, ry: 0.5 }, 0.7))
  g.add(rbox(2.8, 1.5, 1.8, POTATO, { x: 9, y: Y, z: 3.1, ry: -0.6 }, 0.7))
  // 木垫角上的酱汁小杯
  g.add(miniCup(1.7, 1.4, 1.8, sauce, { x: -12.6, y: 1.6, z: 7.8 }, 12))
  g.add(noOutline(cyl(1.35, 1.35, 0.3, '#5a3320', { x: -12.6, y: 2.7, z: 7.8 }, 12)))
  // 刀叉（左右对称摆在木垫两侧）
  g.add(laid(forkOf(19, handle), -16.4, 0, 0))
  g.add(laid(knifeOf(19, handle, 2), 16.4, 0, 0))
  return g
}
const STEAK_FX: Fx[] = [{ kind: 'steam', x: -3.4, y: 5.5, z: 0.8, scale: 0.9, height: 18 }]

// ---------- 沙拉碗：大碗里堆着生菜叶、小番茄、鸡蛋片、黄瓜片和玉米粒，两根木叉勺斜插在碗后 ----------

function saladBowl(p: string[]) {
  const [bowlC, wood, rim] = p
  const g = new THREE.Group()
  const R0 = 11
  const H = 8
  g.add(bowlOf(R0, H, bowlC, {}, 0.4, 24))
  g.add(noOutline(torus(R0 - 0.2, 0.2, rim, { y: H + 0.05, rx: PI / 2 }, PI * 2, [4, 24])))
  // 生菜：一层垫底 + 几片翘起来的叶子
  g.add(domeOf(bowlInR(R0, H, 6.2) - 0.15, 2.3, LETTUCE, { y: 6.2 }))
  const r = rng(11)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.3
    const d = i === 6 ? 0 : 5.6
    g.add(ball(2.9, i % 2 ? shade(LETTUCE, -0.07) : shade(LETTUCE, 0.04), { x: Math.cos(a) * d, y: 8.1 + r() * 0.5, z: Math.sin(a) * d, ry: -a, rz: 0.25 }, [1.25, 0.26, 0.9], [12, 6]))
  }
  // 小番茄
  for (const [x, z] of [
    [-4.4, 2.6],
    [3.6, 4.4],
    [5.2, -2],
    [-1.6, -4.8],
  ])
    g.add(ball(1.3, TOMATO, { x, y: x > 5 ? 9.35 : 9.6, z }, undefined, [8, 6])) // 右后那颗下面没有翘起的叶子，落到垫底的生菜上
  // 鸡蛋片（正中那片压在中间的叶子上）
  for (const [x, z, rz, y] of [
    [0.6, 0.8, 0.1, 8.8],
    [-3.6, -1.4, -0.2, 9.15],
    [2.4, -3.6, 0.2, 9.15],
  ]) {
    const e = G(pad(1.7, 0.6, EGG_W, {}, 12), noOutline(cyl(0.95, 0.95, 0.3, EGG_Y, { y: 0.42 }, 12)))
    g.add(P(e, x, y, z, 0.15, 0, rz))
  }
  // 黄瓜片
  for (const [x, z, rz] of [
    [-1.2, 4.6, 0.3],
    [6.2, 1.4, -0.35],
    [-6.4, -0.6, 0.3],
  ]) {
    const c = G(cyl(1.5, 1.5, 0.4, LEAF, {}, 14), noOutline(cyl(1.2, 1.2, 0.56, '#cfe8a0', { y: -0.08 }, 12)))
    g.add(P(c, x, 9, z, 0.2, 0, rz))
  }
  // 玉米粒
  for (let i = 0; i < 10; i++) {
    const a = r() * PI * 2
    const d = 1.5 + r() * 5
    // 压进菜叶里一点：落在叶缝里的那两粒也够得着垫底的生菜（原来整体高 0.3，那两粒悬着）
    g.add(noOutline(bead(0.4, CORN, { x: Math.cos(a) * d, y: 8.95 - d * 0.08, z: Math.sin(a) * d }, undefined, GRAIN)))
  }
  // 木叉勺：柄从菜里斜伸出碗沿
  for (const s of [-1, 1]) {
    g.add(taperRod3([s * 2.6, 7.4, -3.2], [s * 8.6, 12.6, -9.2], 0.75, 0.5, wood, 8))
    g.add(bead(0.55, wood, { x: s * 8.6, y: 12.6, z: -9.2 }))
  }
  return fitGroup(g)
}

// ---------- 松饼塔：三层厚松饼，顶上一块黄油，枫糖浆从边上淌下来，配蓝莓和草莓 ----------

function strawberryOf(x: number, y: number, z: number, rz = 0) {
  const o = G(ball(1.2, STRAWBERRY, {}, [1, 1.2, 1]), bead(0.75, LEAF, { y: 1.2 }, [1, 0.35, 1]))
  return P(o, x, y, z, 0, 0, rz)
}

function pancakeStack(p: string[]) {
  const [plateC, rim, handle] = p
  const g = new THREE.Group()
  g.add(plateOf(10, 1.6, plateC))
  g.add(noOutline(torus(9.75, 0.16, rim, { y: 1.66, rx: PI / 2 }, PI * 2, [4, 28])))
  // 三层松饼：侧面浅、顶面煎成焦黄
  const offs: V2[] = [
    [0, 0],
    [0.4, -0.3],
    [-0.3, 0.2],
  ]
  offs.forEach(([x, z], i) => {
    const y = PLATE_IN + i * 2.1
    g.add(pad(6.4, 2.1, PANCAKE, { x, y, z }))
    g.add(noOutline(cyl(5.75, 5.75, 0.3, PANCAKE_TOP, { x, y: y + 1.92, z }, 24)))
  })
  const T = PLATE_IN + 6.3
  // 枫糖浆：顶上一滩 + 四道顺着侧面淌下来的 + 盘里一滩
  g.add(ball(4, MAPLE, { x: -0.3, y: T + 0.14, z: 0.2 }, [1, 0.09, 0.92], [16, 4]))
  for (const [a, yEnd] of [
    [0.5, 3.4],
    [2.2, 1.4],
    [3.7, 4.4],
    [5.2, 2.6],
  ]) {
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(noOutline(tube([[3.4 * c - 0.3, T + 0.12, 3.4 * s + 0.2], [5.7 * c - 0.3, T + 0.1, 5.7 * s + 0.2], [6.25 * c - 0.3, T - 0.7, 6.25 * s + 0.2], [6.3 * c - 0.3, yEnd, 6.3 * s + 0.2]], 0.45, MAPLE, { seg: 8, radial: 5 })))
    g.add(noOutline(bead(0.55, MAPLE, { x: 6.3 * c - 0.3, y: yEnd, z: 6.3 * s + 0.2 }, undefined, GRAIN)))
  }
  // 盘里那一滩在松饼外面的斜坡上：顺着斜坡躺（平放的话外沿会从盘底穿出去）
  const onPlate = (x: number, z: number) => plateInY(10, 1.6, Math.hypot(x, z))
  g.add(noOutline(leanOut(ball(2.4, MAPLE, { x: -4.6, y: onPlate(-4.6, 5.6) + 0.03, z: 5.6 }, [1.2, 0.07, 0.75], [12, 4]), 0.27)))
  // 黄油块
  g.add(rbox(2.2, 1, 2.2, BUTTER, { x: -0.3, y: T + 0.3, z: 0.2, ry: 0.4 }, 0.3))
  // 蓝莓和草莓：松饼顶上几颗，盘子的斜坡上几颗（按斜坡的高度摆，压进盘面一点）
  for (const [x, y, z] of [
    [2.2, T + 0.95, 1.6],
    [2.9, T + 0.9, 0.3],
    [-2.6, T + 0.95, -1.7],
    [6.2, onPlate(6.2, 4.6) + 0.7, 4.6],
    [5, onPlate(5, 5.9) + 0.7, 5.9],
    [7.1, onPlate(7.1, 3.2) + 0.7, 3.2],
  ])
    g.add(ball(0.8, BLUEBERRY, { x, y, z }, undefined, [8, 6]))
  g.add(strawberryOf(0.6, T + 1.3, -2.4, 0.2))
  g.add(strawberryOf(-7, onPlate(-7, -1.6) + 1.25, -1.6, -0.5))
  // 叉子搭在右边盘沿上
  g.add(laid(forkOf(15, handle), 8.5, 1.6, 0.6, 0.12))
  return fitGroup(g)
}

// ---------- 西式早餐盘：煎蛋、两条培根、两根香肠、烤番茄和两片三角吐司，旁边一杯橙汁 ----------

function breakfastPlate(p: string[]) {
  const [plateC, rim, coaster] = p
  const g = new THREE.Group()
  const pl = new THREE.Group()
  pl.add(plateOf(11.5, 1.8, plateC))
  pl.add(noOutline(torus(11.25, 0.16, rim, { y: 1.86, rx: PI / 2 }, PI * 2, [4, 28])))
  const Y = PLATE_IN
  // 煎蛋：不规则的蛋白 + 鼓起的蛋黄。蛋白有一半摊在盘子的斜坡上：整只蛋朝盘外翘起一点顺着斜坡躺（平放的话外沿会从盘底穿出去）
  const egg = G(
    ball(3.6, EGG_W, {}, [1.1, 0.1, 0.95], [16, 4]),
    bead(1.6, EGG_W, { x: -2.7, y: 0.02, z: -1.7 }, [1.2, 0.2, 1]),
    bead(1.5, EGG_W, { x: 2.4, y: 0.02, z: 2.3 }, [1.2, 0.2, 1]),
    domeOf(1.4, 1, EGG_Y, { x: 0.2, y: 0.22, z: -0.2 }, 14),
  )
  pl.add(leanOut(P(egg, -3.6, Y + 0.24, 4.7), 0.126))
  // 培根：两条波浪形的肉条，中间一道肥肉
  for (const [x, z, ry] of [
    [0.5, -1, 0.1],
    [0.7, 0.8, -0.06],
  ]) {
    const bc = G(wavyStrip(9.4, 1.8, 0.3, 0.3, 3, BACON), noOutline(P(wavyStrip(9.6, 0.5, 0.5, 0.3, 3, BACON_FAT), 0, -0.1, 0.2)))
    pl.add(P(bc, x, Y + 0.05, z, 0, ry, 0))
  }
  // 香肠
  for (const [a, b] of [
    [
      [1.9, Y + 1, 3.3],
      [6.9, Y + 1.25, 2.2],
    ],
    [
      [1.7, Y + 1, 5.9],
      [6.3, Y + 1.3, 4.9],
    ],
  ] as [V3, V3][]) {
    pl.add(rod3(a, b, 1, SAUSAGE, 10))
    pl.add(bead(1, SAUSAGE, { x: a[0], y: a[1], z: a[2] }))
    pl.add(bead(1, SAUSAGE, { x: b[0], y: b[1], z: b[2] }))
  }
  // 烤番茄（半个，切面朝上）
  pl.add(pad(2, 1.6, TOMATO, { x: -6.6, y: Y + 0.1, z: -2.4 }, 16))
  pl.add(noOutline(cyl(1.5, 1.5, 0.3, '#f08a6a', { x: -6.6, y: Y + 1.55, z: -2.4 }, 12)))
  // 两片三角吐司：一片吐司沿对角线切开、两半稍微错开，后沿搭在盘子的斜坡上、前沿落在盘底
  const toast = () => G(slab([[0, 0], [6.6, 0], [0, 6.6]], 1.2, CRUST), noOutline(slab([[0.7, 0.7], [4.9, 0.7], [0.7, 4.9]], 0.4, BREAD, 0.95)))
  const t2 = toast()
  t2.rotation.y = PI
  t2.position.set(7.2, 0, 7.2)
  const pair = G(toast(), t2)
  pair.rotation.x = 0.115
  pl.add(P(G(pair), -3.6, Y + 0.7, -9.2))
  g.add(P(pl, -4.5, 0, 0))
  // 橙汁：杯垫 + 玻璃杯 + 橙汁
  const gx = 12.4
  const gz = -1.5
  g.add(pad(4.1, 0.5, coaster, { x: gx, z: gz }))
  g.add(noOutline(cyl(2.92, 2.48, 7.4, JUICE, { x: gx, y: 0.95, z: gz }, 20)))
  g.add(ghost(latheAt([[0, 0], [2.7, 0], [3.3, 10.5], [3.1, 10.5], [2.55, 0.4], [0, 0.4]], GLASS, { x: gx, y: 0.5, z: gz }, 24), GLASS, 0.3))
  return fitGroup(g)
}

// ---------- 饺子：一盘六只斜靠成排的煎饺（月牙形、顶上一道褶、煎面焦黄），配醋碟和一双架在筷架上的筷子 ----------

function dumpling() {
  const o = new THREE.Group()
  o.add(ball(1.7, DOUGH, { y: 1.2 }, [1.6, 0.72, 0.8]))
  // 顶上的褶：一排歪着的小扁球
  for (let i = -2; i <= 2; i++) o.add(bead(0.5, DOUGH, { x: i * 0.95, y: 2.3 - Math.abs(i) * 0.25, z: -0.25, ry: i % 2 ? 0.6 : -0.6 }, [0.9, 1, 0.55], GRAIN))
  // 煎面
  o.add(noOutline(bead(1.5, SEAR, { y: 1.15, z: 1 }, [1.3, 0.55, 0.32])))
  return o
}

function dumplingPlate(p: string[]) {
  const [plateC, dishC, chop] = p
  const g = new THREE.Group()
  g.add(plateOf(9.5, 1.5, plateC, { x: -4 }))
  // 六只煎饺：长轴朝前后，一只压一只往左靠，煎面朝右上
  for (let i = 0; i < 6; i++) {
    const d = dumpling()
    d.rotation.y = PI / 2
    const lean = G(d)
    lean.rotation.z = 0.5
    g.add(P(lean, -4 - 5.2 + i * 2.3, PLATE_IN, (i % 2) * 0.3 - 0.15))
  }
  // 醋碟
  g.add(miniCup(3.1, 2, 1.5, dishC, { x: 9.5, z: 3.5 }, 20))
  g.add(noOutline(cyl(2.55, 2.55, 0.3, VINEGAR, { x: 9.5, y: 0.85, z: 3.5 }, 16)))
  // 筷架 + 筷子（粗头架在筷架上，尖头落在桌面），贴着盘子前沿摆
  const cz = 10.7
  g.add(rbox(1.3, 0.85, 3.6, dishC, { x: -7.5, z: cz }, 0.4))
  for (const s of [-1, 1]) g.add(taperRod3([-10.5, 1.33, cz + s * 0.5], [10.5, 0.22, cz + s * 0.4], 0.36, 0.18, chop, 8))
  return fitGroup(g)
}

// ---------- 小笼包：竹蒸笼里八只带褶的小笼包，笼盖斜搭在笼沿上，旁边一碟姜丝醋 ----------

function xiaolongbaoOf(x: number, y: number, z: number, turn: number) {
  const o = new THREE.Group()
  o.add(ball(2, DOUGH, { y: 1.5 }, [1, 0.78, 1], [10, 6]))
  // 褶：从顶心旋着散开的八道细棱（一两毫米粗，三棱就够）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    o.add(noOutline(taperRod3([Math.cos(a + 0.6) * 0.25, 3.02, Math.sin(a + 0.6) * 0.25], [Math.cos(a) * 1.45, 2.5, Math.sin(a) * 1.45], 0.17, 0.1, shade(DOUGH, -0.09), 3)))
  }
  o.add(bead(0.4, DOUGH, { y: 3.12 }, undefined, GRAIN))
  return P(o, x, y, z, 0, turn, 0)
}

/** 小笼包手工量好的平移量（带蒸汽，不走 fitGroup）：模型整体挪这么多后包围盒在 xz 上居中 */
const XLB_OFF: V2 = [-5.33, 2.38]
const XLB_R = 9.2
function xiaolongbao(p: string[]) {
  const [bamboo, band, dishC] = p
  const g = new THREE.Group()
  // 蒸笼：空心笼圈 + 两道箍 + 笼底竹篾 + 垫纸（笼圈、箍、笼盖都是 24 段）
  g.add(cup(XLB_R, XLB_R, 5.5, 0.9, bamboo, {}, 24))
  for (const y of [0.9, 3.7]) g.add(wallBand(XLB_R, y, XLB_R, y + 1, band, {}, 24))
  g.add(cyl(8.4, 8.4, 0.4, shade(bamboo, -0.08), { y: 1.5 }, 24))
  g.add(noOutline(cyl(8, 8, 0.3, PAPER, { y: 1.75 }, 24)))
  const Y = 2.05
  g.add(xiaolongbaoOf(0, Y, 0, 0))
  for (let i = 0; i < 7; i++) {
    const a = ((i + 0.5) / 7) * PI * 2
    g.add(xiaolongbaoOf(Math.cos(a) * 5.5, Y, Math.sin(a) * 5.5, i * 0.7))
  }
  // 笼盖：一边落在桌面、底面搭在笼沿上（朝右后方）。倾角按「底面正好压住笼沿的圆口」算：再大一点盖子就悬在笼沿上方了
  const lid = new THREE.Group()
  lid.add(cyl(9.4, 9.4, 2, bamboo, {}, 24))
  lid.add(wallBand(9.4, 0.5, 9.4, 1.5, band, {}, 24))
  lid.add(domeOf(8.7, 1.3, shade(bamboo, 0.05), { y: 1.9 }, 24))
  lid.add(noOutline(rbox(15, 0.3, 1.2, band, { y: 3 }, 0.1)))
  const th = 0.438
  lid.rotation.z = -th
  lid.position.set(20.5 - 9.4 * Math.cos(th), 9.4 * Math.sin(th), 0)
  const lidG = G(lid)
  lidG.rotation.y = 0.5
  g.add(lidG)
  // 姜丝醋碟
  const dx = 11
  const dz = 7.6
  g.add(miniCup(3, 2, 1.4, dishC, { x: dx, z: dz }, 20))
  g.add(noOutline(cyl(2.45, 2.45, 0.3, VINEGAR, { x: dx, y: 0.8, z: dz }, 16)))
  for (let i = 0; i < 5; i++) g.add(noOutline(rod3([dx - 1.2 + i * 0.3, 1.2, dz - 0.8 + i * 0.35], [dx + 0.6 + i * 0.15, 1.25, dz - 0.2 + (i % 2) * 0.7], 0.12, '#f2d98a', 5)))
  return G(P(g, XLB_OFF[0], 0, XLB_OFF[1]))
}
const XLB_FX: Fx[] = [{ kind: 'steam', x: XLB_OFF[0], y: 6, z: XLB_OFF[1], scale: 1, height: 20 }]

// ---------- 刨冰：高脚玻璃碗里一座冰山，草莓糖浆和炼乳从山顶淌下来，顶上一颗樱桃，边上插着小勺 ----------

/** 冰山的车削轮廓（[半径, 高]，相对玻璃碗底） */
const ICE_PROFILE: V2[] = [
  [0, 3.9],
  [2.7, 4],
  [5.2, 5.7],
  [6, 8],
  [5.8, 9.2],
  [4.9, 11.2],
  [3.5, 13.3],
  [1.8, 14.9],
  [0, 15.5],
]
const ICE_SEG = 24
const ICE_STEP = (PI * 2) / ICE_SEG
/** 冰山表面在高度 y 处的半径（只用碗沿以上那段：y ≥ 8） */
function iceR(y: number) {
  for (let i = 3; i < ICE_PROFILE.length - 1; i++) {
    const [r0, y0] = ICE_PROFILE[i]
    const [r1, y1] = ICE_PROFILE[i + 1]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return 0
}
/** 贴着冰面往下淌的一片（糖浆 / 炼乳）：从高度 top 淌到 bottom，占第 a0 段起的 segs 段方位角（和冰山的分段对齐），比冰面鼓出 lift */
function iceDrip(top: number, bottom: number, a0: number, segs: number, lift: number, color: string) {
  const pts: V2[] = [[iceR(bottom) + lift, bottom]]
  for (const [r, y] of ICE_PROFILE) if (y > bottom + 0.05 && y < top - 0.05) pts.push([r + lift, y])
  pts.push(top >= 15.5 ? [0, 15.5 + lift] : [iceR(top) + lift, top])
  return noOutline(lathe(pts, color, segs, [a0 * ICE_STEP, segs * ICE_STEP]))
}

function shavedIce(p: string[]) {
  const [saucer, spoon, glassC] = p
  const g = new THREE.Group()
  g.add(pad(6.2, 0.5, saucer))
  const c = new THREE.Group()
  c.add(latheAt(ICE_PROFILE, ICE, {}, ICE_SEG))
  // 草莓糖浆：盖住山顶，往下淌成长短不一的八道
  c.add(iceDrip(15.5, 13.3, 0, ICE_SEG, 0.15, SYRUP_RED))
  const ends = [9.6, 11.8, 8.8, 12.2, 10.2, 11.5, 9.2, 12.4]
  ends.forEach((yEnd, i) => {
    c.add(iceDrip(13.3, yEnd, i * 3, 2, 0.15, SYRUP_RED))
    const a = (i * 3 + 1) * ICE_STEP
    c.add(noOutline(bead(0.5, SYRUP_RED, { x: Math.sin(a) * (iceR(yEnd) - 0.1), y: yEnd, z: Math.cos(a) * (iceR(yEnd) - 0.1) }, [1.2, 1, 1.2], GRAIN)))
  })
  // 炼乳：山尖一小片 + 三道细流
  c.add(iceDrip(15.5, 14.5, 0, ICE_SEG, 0.3, CONDENSED))
  for (const [a0, yEnd] of [
    [2, 12.4],
    [10, 11.6],
    [17, 12.8],
  ])
    c.add(iceDrip(14.6, yEnd, a0, 1, 0.3, CONDENSED))
  // 樱桃
  c.add(ball(0.9, '#d6263a', { y: 16.3 }))
  c.add(rod3([0, 17, 0], [0.5, 18.2, 0.2], 0.1, '#6e4f37', 5))
  // 高脚玻璃碗
  c.add(ghost(latheAt([[0, 0], [3.2, 0], [3.2, 0.5], [0.9, 1], [0.9, 2.6], [3, 3.4], [5.6, 5.2], [6.6, 8.2], [6.3, 8.2], [5.4, 5.5], [2.8, 3.8], [0, 3.6]], glassC), glassC, 0.35))
  // 小勺：勺头埋在冰里，柄斜伸出来
  c.add(taperRod3([3, 10.2, 2.2], [5.9, 15.8, 4.3], 0.32, 0.4, spoon, 8))
  c.add(bead(0.5, spoon, { x: 5.9, y: 15.8, z: 4.3 }))
  g.add(P(c, 0, 0.5, 0))
  return fitGroup(g)
}

// ---------- 鲷鱼烧：竹盘垫纸上两只整的鱼形烧饼（眼睛、鳃、鱼鳞、尾纹），前面一只掰成两半露出红豆馅 ----------

type FishPart = 'whole' | 'head' | 'tail'
/** 鱼形饼的几何：鱼头朝 -x，平躺（厚度沿 y，底面在 0，厚 2.2），长约 11、宽约 6.4；head / tail 是掰开后的两半（断口是锯齿） */
function fishGeo(part: FishPart) {
  return cached(`fd-fish-${part}`, () => {
    const v = (x: number, y: number) => new THREE.Vector2(x, y)
    const s = new THREE.Shape()
    if (part === 'tail') {
      s.moveTo(0.9, -2.8)
      s.splineThru([v(1.8, -2.1), v(2.9, -1.3)])
    } else {
      s.moveTo(-5.5, 0)
      s.splineThru(part === 'head' ? [v(-4.4, -1.9), v(-1.6, -3.1), v(0.2, -3)] : [v(-4.4, -1.9), v(-1.2, -3.1), v(1.6, -2.3), v(2.9, -1.3)])
    }
    if (part === 'head') {
      for (const [x, y] of [[-0.3, -1.4], [0.5, -0.2], [-0.2, 1.2], [0.2, 3]]) s.lineTo(x, y)
      s.splineThru([v(-1.6, 3.1), v(-4.4, 1.9), v(-5.5, 0)])
    } else {
      s.lineTo(5.2, -3.1)
      s.quadraticCurveTo(5.9, -1.5, 4.5, 0)
      s.quadraticCurveTo(5.9, 1.5, 5.2, 3.1)
      s.lineTo(2.9, 1.3)
      if (part === 'tail') {
        s.splineThru([v(1.8, 2.1), v(0.9, 2.8)])
        for (const [x, y] of [[0.3, 1.3], [1.1, 0], [0.4, -1.4]]) s.lineTo(x, y)
      } else s.splineThru([v(1.6, 2.3), v(-1.2, 3.1), v(-4.4, 1.9), v(-5.5, 0)])
    }
    // 样条按「点数 × curveSegments」细分：十来厘米长的饼，3 就够圆了（6 的话一条鱼近九百个面）
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelOffset: -0.25, bevelSegments: 2, curveSegments: 3 })
    geo.rotateX(-PI / 2)
    geo.translate(0, 0.6, 0)
    return geo
  })
}

function taiyakiFish(part: FishPart) {
  const o = new THREE.Group()
  o.add(mesh(fishGeo(part), TAIYAKI))
  const dk = shade(TAIYAKI, -0.17)
  const T = 2.2
  const line = (pts: V3[]) => o.add(noOutline(tube(pts, 0.13, dk, { seg: 4, radial: 3 })))
  if (part !== 'tail') {
    // 眼睛、鳃
    o.add(noOutline(bead(0.42, dk, { x: -3.7, y: T - 0.02, z: -0.8 }, [1, 0.5, 1])))
    line([[-2.6, T, -1.9], [-2.1, T, 0], [-2.6, T, 1.9]])
  }
  // 鱼鳞：朝尾巴鼓的小弧
  const scales: V2[] = part === 'whole' ? [[-0.9, -1.1], [-0.9, 1.1], [0.4, 0], [1.6, -0.8], [1.6, 0.8]] : part === 'head' ? [[-1.3, -1.1], [-1.3, 1.1]] : [[1.9, 0]]
  for (const [x, z] of scales) line([[x - 0.2, T, z - 0.75], [x + 0.5, T, z], [x - 0.2, T, z + 0.75]])
  if (part !== 'head') {
    // 尾纹
    for (const s of [-1, 1]) o.add(noOutline(rod3([3.3, T, s * 0.4], [4.6, T, s * 2], 0.13, dk, 5)))
  }
  // 掰开的断口：露出红豆馅
  if (part === 'head') o.add(ball(1.25, ANKO, { x: 0.2, y: 1.1 }, [0.5, 0.6, 1.85]))
  if (part === 'tail') o.add(ball(1.2, ANKO, { x: 0.75, y: 1.1 }, [0.5, 0.6, 1.7]))
  return o
}

function taiyakiTray(p: string[]) {
  const [trayC, paper, edge] = p
  const g = new THREE.Group()
  g.add(tray(26, 1.5, 18, 0.6, trayC, {}, 0.5))
  // 两条短边的包边
  for (const s of [-1, 1]) g.add(noOutline(rbox(1.4, 1.8, 18.3, edge, { x: s * 11.5, y: -0.15 }, 0.3)))
  g.add(noOutline(box(21, 0.3, 15, paper, { y: 0.45, ry: 0.03 })))
  const Y = 0.75
  g.add(P(taiyakiFish('whole'), -5.2, Y, -4.1, 0, 0.1, 0))
  g.add(P(taiyakiFish('whole'), 5, Y, -3.9, 0, PI - 0.12, 0))
  g.add(P(taiyakiFish('head'), -3.6, Y, 4.2, 0, 0.22, 0))
  g.add(P(taiyakiFish('tail'), 3, Y, 4.4, 0, -0.25, 0))
  return fitGroup(g)
}

// ---------- 可颂面包篮：椭圆藤篮垫着一块布，里面两只可颂、两只圆面包和几片法棍 ----------

function croissantOf() {
  const o = new THREE.Group()
  // 五节：中间粗两头尖，沿一条弯弧排开
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.42
    const rr = [2.3, 2, 1.35][Math.abs(i)]
    o.add(ball(rr, i % 2 ? shade(BUN, -0.06) : BUN, { x: Math.sin(a) * 5, y: rr * 0.82, z: (1 - Math.cos(a)) * 5, ry: -a }, [1.05, 0.85, 1.12], [10, 6]))
  }
  return o
}

function breadBasket(p: string[]) {
  const [wicker, cloth, rim] = p
  const g = new THREE.Group()
  // 椭圆藤篮（圆篮沿 z 压扁）：篮身 + 三道编织纹 + 口沿 + 垫布
  const bk = new THREE.Group()
  bk.add(cup(15, 12.5, 8, 0.8, wicker))
  const rAt = (y: number) => 12.5 + (2.5 * y) / 8
  for (const y of [1.5, 3.5, 5.5]) bk.add(wallBand(rAt(y), y, rAt(y + 0.9), y + 0.9, shade(wicker, -0.1)))
  bk.add(torus(15, 0.55, rim, { y: 7.9, rx: PI / 2 }, PI * 2, [6, 32]))
  // 垫布：里面一圈贴着篮壁，翻出口沿垂下来一截；篮里再鼓起一团托着面包
  bk.add(latheAt([[16.5, 5.8], [16.3, 7.6], [15.3, 8.7], [14.2, 8.2], [13, 4]], cloth, {}, 32))
  bk.add(domeOf(13.4, 2.4, cloth, { y: 5 }, 24))
  bk.scale.z = 0.73
  g.add(bk)
  // 可颂两只
  g.add(P(croissantOf(), -5.6, 6.9, 0.6, 0, 0.3, 0))
  g.add(P(croissantOf(), 4.6, 6.7, 2.6, 0, -0.45, 0))
  // 圆面包两只（顶上十字割纹）
  for (const [x, z] of [
    [-3.2, -4.6],
    [8.2, -2.6],
  ]) {
    g.add(ball(3.2, BUN_L, { x, y: 8.4, z }, [1, 0.74, 1], [12, 8]))
    for (const ry of [0.3, 0.3 + PI / 2]) g.add(noOutline(box(4.2, 0.4, 0.4, shade(BUN_L, -0.12), { x, y: 10.45, z, ry })))
  }
  // 法棍片三片，立着斜靠成一排
  for (let i = 0; i < 3; i++) {
    const s = G(cyl(2.7, 2.7, 1.3, CRUST, {}, 14), noOutline(cyl(2.25, 2.25, 1.56, BREAD, { y: -0.13 }, 14)))
    s.scale.x = 0.85
    s.rotation.x = PI / 2 - 0.35
    g.add(P(G(s), 1.8 + i * 0.5, 9, -6.2 + i * 1.5, 0, 0.25, 0))
  }
  return fitGroup(g)
}

// ---------- 芝士拼盘：带柄木板上摆着大孔芝士、布里芝士角、切达小方块、火腿卷、萨拉米片、饼干、葡萄、一碗橄榄和一把芝士刀 ----------

function charcuterie(p: string[]) {
  const [board, handle, bowlC] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.5, 20, board, { x: -3 }, 1.4))
  // 带挂孔的柄
  g.add(holePanel(6.6, 5.5, 1.5, board, [{ kind: 'circle', x: 0.8, y: 2.75, r: 1.1 }], { x: 14.7, y: 0.75, z: 2.75, rx: -PI / 2 }, 1.5))
  const Y = 1.5
  // 大孔芝士（三角块）
  const em = G(slab([[0, 0], [7.5, 0], [7.5, 3.8]], 2.8, '#f6cf5a'))
  for (const [x, z, rr] of [
    [5.6, 1.4, 0.55],
    [3.4, 0.8, 0.4],
    [6.6, 2.6, 0.35],
  ])
    em.add(noOutline(bead(rr, '#dba93a', { x, y: 2.75, z }, [1, 0.3, 1], GRAIN)))
  em.add(noOutline(bead(0.5, '#dba93a', { x: 5, y: 1.4, z: 0.02 }, [1, 1, 0.3], GRAIN)))
  g.add(P(em, -16.6, Y, -8.6, 0, -0.08, 0))
  // 布里芝士角：白霉皮，两个切面是奶黄色
  const brie = new THREE.Group()
  const sector: V2[] = [[0, 0], ...arcPts([0, 0, 0], 6.5, -0.4, 0.4, 5, 'xz').map(([x, , z]): V2 => [x, z])]
  brie.add(slab(sector, 2.3, '#f8f1e0'))
  for (const s of [-1, 1]) brie.add(noOutline(box(4.6, 1.1, 0.3, '#f4dc98', { x: 3 * Math.cos(0.4) - s * Math.sin(0.4) * 0.03, y: 0.6, z: s * (3 * Math.sin(0.4) + Math.cos(0.4) * 0.03), ry: -s * 0.4 })))
  g.add(P(brie, -16.8, Y, 4.2, 0, 0.15, 0))
  // 切达小方块
  const cubes: [number, number, number, number][] = [
    [-7, 0, -7, 0.2],
    [-5, 0, -6.6, -0.3],
    [-6.2, 0, -4.9, 0.6],
    [-4.2, 0, -4.7, 0.1],
    [-5.6, 1.7, -6, 0.5],
  ]
  for (const [x, y, z, ry] of cubes) g.add(box(1.7, 1.7, 1.7, '#f0a030', { x, y: Y + y, z, ry }))
  // 火腿卷：两根并排、一根叠在上面
  for (const [x, y] of [
    [4, 1.2],
    [6.5, 1.2],
    [5.25, 3.25],
  ]) {
    g.add(P(cyl(1.2, 1.2, 5.6, HAM, {}, 12), x, Y + y, -5.2, PI / 2))
    g.add(noOutline(P(cyl(0.7, 0.7, 5.84, shade(HAM, -0.12), {}, 10), x, Y + y, -5.2, PI / 2)))
  }
  // 萨拉米片：一片压一片。脂肪粒只画露在外面的：平躺的第一片和最上面那片三粒都在，中间几片靠右的被后一片压住
  const fat: V2[] = [
    [-0.8, -0.4],
    [0.1, -1.1],
    [0.7, 0.5],
  ]
  for (let i = 0; i < 6; i++) {
    const s = G(cyl(2.1, 2.1, 0.35, SALAMI, {}, 14))
    for (const [x, z] of fat.slice(0, i === 0 || i === 5 ? 3 : i % 2 ? 1 : 2)) s.add(noOutline(bead(0.3, '#e6b8a8', { x, y: 0.35, z }, [1, 0.3, 1], GRAIN)))
    g.add(P(s, -7.2 + i * 1.6, Y + (i ? 0.52 : 0), 2.6 + (i % 2) * 0.3, 0, 0, i ? -0.25 : 0))
  }
  // 饼干：同样叠成一排
  for (let i = 0; i < 5; i++) g.add(P(cyl(2.3, 2.3, 0.3, CRACKER, {}, 14), -7.4 + i * 1.9, Y + (i ? 0.62 : 0.15), 7.3, 0, 0, i ? -0.2 : 0))
  // 葡萄
  const gr: V3[] = [
    [-1.8, 0.95, -1.5],
    [0, 0.95, -1.7],
    [1.8, 0.95, -1.3],
    [-0.9, 0.95, 0.1],
    [0.9, 0.95, 0.2],
    [0, 0.95, 1.8],
    [-0.9, 2.3, -0.9],
    [0.9, 2.3, -0.8],
    [0, 2.3, 0.7],
  ]
  for (const [x, y, z] of gr) g.add(ball(1, GRAPE, { x: 7.6 + x, y: Y + y, z: 3 + z }, undefined, [8, 6]))
  g.add(rod3([7.6, Y + 2.6, 1.6], [8, Y + 3.3, -0.2], 0.18, '#6e5a3a', 6))
  // 一小碗橄榄
  g.add(miniCup(2.6, 2, 2.3, bowlC, { x: -0.3, y: Y, z: -4.6 }, 20))
  g.add(noOutline(cyl(2.1, 2.1, 0.4, '#6b7a2e', { x: -0.3, y: Y + 1.1, z: -4.6 }, 14)))
  for (let i = 0; i < 5; i++) g.add(bead(0.75, i % 2 ? '#7a8a3a' : '#5d6e2c', { x: -0.3 + Math.cos(i * 1.26) * (i ? 1.15 : 0), y: Y + 1.8 + (i ? 0 : 0.6), z: -4.6 + Math.sin(i * 1.26) * (i ? 1.15 : 0) }, [1, 0.9, 1.2]))
  // 芝士刀
  g.add(laid(knifeOf(9.5, handle, 1.7), 7, Y, 8.2, PI / 2))
  return fitGroup(g)
}

// ---------- 夏日饮品组：两只弹珠汽水瓶（瓶颈有一道腰、里面卡着玻璃弹珠）和一碟西瓜片 ----------

function ramuneBottle(label: string, cap: string) {
  const o = new THREE.Group()
  // 瓶身、汽水、标签都是 20 段
  o.add(ghost(latheAt([[0, 0.4], [2.6, 0.4], [2.6, 9.4], [2.2, 10.9], [1.2, 12], [0, 12]], '#c8f0ec', {}, 20), '#c8f0ec', 0.55))
  // 玻璃弹珠：没开封时被气压顶在瓶口，贴着瓶盖下沿
  o.add(bead(0.8, '#f2ffff', { y: 17.8 }))
  o.add(ghost(latheAt([[0, 0], [2.6, 0], [2.9, 0.4], [2.9, 9.5], [2.5, 11], [1.5, 12.2], [1.25, 12.9], [1.9, 13.8], [1.9, 15.2], [1.35, 16.2], [1.35, 18.6], [1.7, 18.8], [1.7, 19.5], [0, 19.5]], '#8fd8d0', {}, 20), '#8fd8d0', 0.38))
  o.add(wallBand(2.9, 3, 2.9, 8, label, {}, 20))
  o.add(noOutline(bead(1.1, cap, { y: 5.5, z: 3 }, [1, 1, 0.12])))
  o.add(cyl(1.85, 1.85, 1.2, cap, { y: 18.5 }, 16))
  return o
}

/** 一片西瓜；seeds 是朝前那面上的瓜子位置（叠在后面的几片，被前一片挡住的瓜子不画） */
function watermelonSlice(seeds: V2[]) {
  const mk = (s: THREE.Shape, depth: number, color: string) => {
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 })
    geo.translate(0, 0, -depth / 2)
    return mesh(geo, color)
  }
  // 果肉：尖朝上的三角片，底边是弧；瓜皮：贴着底弧的一条
  const flesh = new THREE.Shape()
  flesh.moveTo(0, 5.2)
  flesh.lineTo(-3.1, 1)
  flesh.quadraticCurveTo(0, 0.1, 3.1, 1)
  flesh.closePath()
  const rind = new THREE.Shape()
  rind.moveTo(-3.1, 1)
  rind.lineTo(-3.45, 0.45)
  rind.quadraticCurveTo(0, -0.6, 3.45, 0.45)
  rind.lineTo(3.1, 1)
  rind.quadraticCurveTo(0, 0.1, -3.1, 1)
  const o = G(mk(flesh, 1.3, MELON), mk(rind, 1.5, RIND))
  // 瓜子只有四毫米长：八面体就够
  for (const [x, y] of seeds) o.add(noOutline(bead(0.2, '#2b2020', { x, y, z: 0.62 }, [1, 1.5, 0.5], [4, 2])))
  return o
}

function ramuneSet(p: string[]) {
  const [label, cap, dish] = p
  const g = new THREE.Group()
  g.add(P(ramuneBottle(label, cap), -7.5, 0, -2.5))
  g.add(P(ramuneBottle(label, cap), -2.5, 0, 3, 0, 0.6, 0))
  const pl = new THREE.Group()
  pl.add(plateOf(6, 1.2, dish))
  // 三片西瓜斜靠着叠在盘里
  const seeds: V2[][] = [
    [[0, 3.6], [-0.9, 2.3], [0.9, 2.2], [0, 1.5]],
    [[0, 3.6], [-0.9, 2.3], [0.9, 2.2]],
    [[0, 3.6], [0.9, 2.2]],
  ]
  for (let i = 0; i < 3; i++) {
    const s = watermelonSlice(seeds[i])
    s.rotation.x = -1.05 + i * 0.05
    pl.add(P(G(s), (i - 1) * 0.5, PLATE_IN + 0.6 + i * 0.1, 2.9 - i * 1.9, 0, (i - 1) * 0.16, 0))
  }
  g.add(P(pl, 5.5, 0, -1))
  return fitGroup(g)
}

// ---------- 华夫饼机：圆形翻盖机，盖子向后掀开露出格子烤盘，下烤盘上一块烤好的格子华夫 ----------

/** 圆盘上的一组格子棱：半径 r 的圆里横竖各 n 道，间距 gap，棱截面 w × h，底面在 y */
function gridRibs(r: number, gap: number, w: number, h: number, y: number, color: string, z0 = 0) {
  const o = new THREE.Group()
  const n = Math.floor(r / gap)
  for (let i = -n; i <= n; i++) {
    const off = (i + 0.5) * gap
    if (Math.abs(off) > r - 0.8) continue
    const len = 2 * Math.sqrt(r * r - off * off) - 0.4
    o.add(noOutline(box(len, h, w, color, { y, z: z0 + off })))
    o.add(noOutline(box(w, h, len, color, { x: off, y: y + 0.02, z: z0 })))
  }
  return o
}

const WM_R = 9
function waffleMaker(p: string[]) {
  const [body, trim, acc] = p
  const g = new THREE.Group()
  const R0 = WM_R
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1, 1.1, 0.7, DARK, { x: sx * 5.5, z: sz * 5.5 }, 10))
  // 底座 + 下烤盘 + 华夫饼
  g.add(pad(R0, 4.1, body, { y: 0.5 }, 28))
  g.add(noOutline(cyl(R0 - 1.1, R0 - 1.1, 0.5, IRON, { y: 4.25 }, 28)))
  g.add(pad(R0 - 2, 1.4, WAFFLE, { y: 4.7 }))
  g.add(gridRibs(R0 - 2.3, 2.2, 0.55, 0.4, 5.95, WAFFLE_L))
  // 正面：下把手，右前方的温控旋钮，左前方两颗指示灯
  g.add(rbox(5, 1.3, 2.6, trim, { y: 3.1, z: R0 + 0.8 }, 0.5))
  const dial = G(cyl(1.3, 1.3, 1, acc, { y: 2, z: R0 + 0.1, rx: PI / 2 }, 16), noOutline(box(0.3, 1, 0.3, DARK, { y: 2.3, z: R0 + 0.5 })))
  dial.rotation.y = 0.75
  g.add(dial)
  for (const [a, c] of [
    [-0.62, '#7fe0a8'],
    [-0.86, '#ff7a5c'],
  ] as const)
    g.add(lit(bead(0.4, c, { x: Math.sin(a) * (R0 - 0.05), y: 2.7, z: Math.cos(a) * (R0 - 0.05) }), c, 0.8))
  // 后面的合页
  // 合页座往前伸进底座里（原来和底座差 0.07 没挨上）
  for (const s of [-1, 1]) g.add(rbox(1.8, 1.8, 2.2, body, { x: s * 2.9, y: 3.3, z: -R0 - 0.1 }, 0.4))
  g.add(cylX(0.85, 8.2, DARK, 0, 4.75, -R0 - 0.5, 12))
  // 上盖（以合页为原点建成合上的样子，再向后掀开 100°）：盖体 + 内侧烤盘和格子 + 顶上的装饰圆片 + 上把手
  const lid = new THREE.Group()
  lid.add(pad(R0, 3.8, body, { y: 0.2, z: R0 + 0.5 }, 28))
  lid.add(noOutline(cyl(R0 - 1.1, R0 - 1.1, 0.5, IRON, { y: 0.05, z: R0 + 0.5 }, 28)))
  lid.add(gridRibs(R0 - 1.6, 2.2, 0.5, 0.35, -0.22, shade(IRON, 0.14), R0 + 0.5))
  lid.add(noOutline(cyl(R0 - 3, R0 - 3, 0.3, shade(body, -0.07), { y: 3.85, z: R0 + 0.5 }, 24)))
  lid.add(noOutline(cyl(1.6, 1.6, 0.3, acc, { y: 4, z: R0 + 0.5 }, 16)))
  lid.add(rbox(5, 1.3, 2.6, trim, { y: 1.2, z: 2 * R0 + 1.3 }, 0.5))
  // 盖子后沿的合页筒：套在转轴上、夹在两个合页座之间，把盖子接到转轴上（原来盖子离转轴 0.4，整只盖悬在机身后面）
  lid.add(rbox(3.6, 1.8, 2.6, body, { y: -0.9, z: 0.4 }, 0.4))
  lid.rotation.x = -1.75
  lid.position.set(0, 4.75, -R0 - 0.5)
  g.add(lid)
  return fitGroup(g)
}

// ---------- 热压三明治机：合着的方形压板机（前面一对把手和卡扣、顶上对角压纹和指示灯），旁边盘里一份对切的热压三明治 ----------

/** 对切的半只热压三明治：平放的直角三角形（直角边 a、厚 t），斜边是切面，露出火腿和芝士 */
function pressedHalf(a: number, t: number) {
  const o = new THREE.Group()
  o.add(slab([[0, 0], [a, 0], [0, a]], t, TOAST))
  // 烤纹：顶面两道和斜边平行的焦痕
  for (const k of [0.45, 0.75]) o.add(noOutline(box(a * k * 1.414 - 1.2, 0.3, 0.5, shade(TOAST, -0.14), { x: a * k * 0.5, y: t - 0.18, z: a * k * 0.5, ry: PI / 4 })))
  // 切面上的夹心：火腿、芝士各一条，芝士淌下来一滴
  const len = a * 1.414 - 1.8
  o.add(noOutline(box(len, 0.5, 0.5, HAM, { x: a / 2 + 0.03, y: t / 2 - 0.45, z: a / 2 + 0.03, ry: PI / 4 })))
  o.add(noOutline(box(len + 0.4, 0.4, 0.6, CHEESE, { x: a / 2 + 0.06, y: t / 2 + 0.05, z: a / 2 + 0.06, ry: PI / 4 })))
  o.add(noOutline(bead(0.5, CHEESE, { x: a / 2 + 0.9, y: t / 2 - 0.35, z: a / 2 - 0.5 }, [0.7, 1.2, 0.7])))
  return o
}

function sandwichPress(p: string[]) {
  const [body, trim, plateC] = p
  const g = new THREE.Group()
  const m = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(cyl(0.9, 1, 0.7, DARK, { x: sx * 5.6, z: sz * 5.6 }, 8))
  // 下壳、夹在中间的烤盘（一圈深色的缝）、上壳
  m.add(rbox(15, 3.8, 15, body, { y: 0.5 }, 1.4))
  m.add(noOutline(rbox(14, 0.9, 14, IRON, { y: 3.9 }, 0.3)))
  m.add(rbox(15, 4.4, 15, body, { y: 4.4 }, 2))
  // 顶面：凹下去的装饰板 + 对角压纹 + 两颗指示灯
  m.add(noOutline(box(10.4, 0.4, 10.4, shade(body, -0.07), { y: 8.55 })))
  m.add(noOutline(box(13.6, 0.3, 0.6, shade(body, -0.2), { y: 8.82, ry: PI / 4 })))
  m.add(lit(bead(0.4, '#7fe0a8', { x: 3.3, y: 8.82, z: 6.2 }), '#7fe0a8', 0.8))
  m.add(lit(bead(0.4, '#ff7a5c', { x: 4.7, y: 8.8, z: 6.2 }), '#ff7a5c', 0.8))
  // 前面的上下把手 + 卡扣
  m.add(rbox(4.4, 1.3, 3, trim, { y: 2.7, z: 8.7 }, 0.5))
  m.add(rbox(4.4, 1.3, 3.4, trim, { y: 4.9, z: 8.9 }, 0.5))
  m.add(rbox(1.8, 3.4, 0.7, shade(trim, -0.1, 0), { y: 3, z: 10.5 }, 0.3))
  // 后面的合页
  m.add(cylX(0.8, 9, DARK, 0, 4.35, -7.7, 10))
  g.add(P(m, -7, 0, -1))
  // 盘子 + 对切的三明治：一半平放（比盘底大，三个角搁在盘沿的斜坡上），另一半斜搭在上面
  const pl = new THREE.Group()
  pl.add(plateOf(6.6, 1.2, plateC))
  pl.add(P(pressedHalf(8, 2.2), -4, PLATE_IN + 0.05, -3.6))
  const top = pressedHalf(8, 2.2)
  top.rotation.set(0.18, 0, -0.16)
  pl.add(P(G(top), -1.6, PLATE_IN + 1.75, -0.4, 0, 0.5, 0))
  g.add(P(pl, 8.6, 0, 0.6))
  return fitGroup(g)
}

// ---------- 养生壶：带旋钮和小屏的圆底座上一只玻璃壶，壶里是茶色的汤和枸杞红枣，侧面一只把手，顶上壶盖 ----------

function healthKettle(p: string[]) {
  const [base, trim, acc] = p
  const g = new THREE.Group()
  const SEG = 28
  const step = (PI * 2) / SEG
  // 底座：正面偏左一块弧形小屏（亮着读数），偏右一只旋钮
  g.add(pad(7.6, 4.2, base, {}, SEG))
  // 小屏的上下两条边折回去压进底座（底座是鼓形的，原来整片离底座 0.12～0.4 浮着）
  g.add(noOutline(lathe(patchProfile(7.6, 1.3, 7.6, 3.1, 0.6), DARK, 3, [-4 * step, 3 * step])))
  g.add(lit(lathe([[7.8, 1.8], [7.8, 2.6]], '#7fe0a8', 1, [-3 * step, step]), '#7fe0a8', 0.8))
  const knob = G(cyl(1.5, 1.5, 1.2, acc, { y: 1.5, z: 7.5, rx: PI / 2 }, 16), noOutline(rbox(0.3, 1.1, 0.3, DARK, { y: 2.1, z: 8 }, 0.1)))
  knob.rotation.y = 0.6
  g.add(knob)
  // 壶：钢底圈 + 茶汤 + 玻璃壶身 + 壶口钢圈
  g.add(cyl(6.2, 6.6, 1.2, STEEL, { y: 4.2 }, SEG))
  const Y = 5.4
  g.add(noOutline(latheAt([[0, 0.35], [5.7, 0.35], [6.1, 2], [6.1, 8.2], [0, 8.2]], TEA_AMBER, { y: Y }, SEG)))
  // 浮在汤面上的枸杞红枣，和几颗贴着壶壁的
  const r = rng(6)
  for (let i = 0; i < 9; i++) {
    const a = r() * PI * 2
    const d = 1 + r() * 4
    const big = i % 3 === 0
    g.add(noOutline(bead(big ? 0.8 : 0.4, big ? JUJUBE : GOJI, { x: Math.cos(a) * d, y: Y + 8.25, z: Math.sin(a) * d, ry: a }, big ? [1.4, 0.7, 1] : [1.5, 0.7, 0.9], big ? undefined : GRAIN)))
  }
  // 贴着壶壁的几颗：朝外的那一头正好顶到玻璃内壁（半径 6.2），比茶汤（6.1）多探出一点才看得见
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.4
    const big = i % 3 === 1
    const rr = big ? 0.6 : 0.4
    const d = 6.22 - rr * 0.8
    g.add(noOutline(bead(rr, big ? JUJUBE : GOJI, { x: Math.cos(a) * d, y: Y + 3 + r() * 4.6, z: Math.sin(a) * d, ry: -a }, [0.8, 1.3, 1], big ? undefined : GRAIN)))
  }
  g.add(ghost(latheAt([[0, 0], [6, 0], [6.5, 2], [6.5, 9], [6, 12.5], [5.6, 13.6], [5.3, 13.6], [5.7, 12.4], [6.2, 9], [6.2, 2], [5.75, 0.3], [0, 0.3]], GLASS, { y: Y }, SEG), GLASS, 0.3))
  g.add(noOutline(latheAt([[6.12, 12.5], [5.72, 13.65]], STEEL, { y: Y }, SEG)))
  // 壶嘴（左）和把手（右）：上下两条横臂的里端收在玻璃壁里，不伸进壶内
  g.add(rbox(1.9, 1, 2.2, STEEL, { x: -6.2, y: Y + 12.9, rz: 0.5 }, 0.4))
  g.add(rbox(1.9, 9.6, 2.6, trim, { x: 9.6, y: Y + 2.6 }, 0.9))
  g.add(rbox(4.2, 1.7, 2.4, trim, { x: 8.1, y: Y + 10.9 }, 0.7))
  g.add(rbox(4, 1.6, 2.4, trim, { x: 8.2, y: Y + 2.2 }, 0.7))
  // 壶盖 + 盖钮
  g.add(pad(5.9, 1.3, trim, { y: Y + 13.5 }))
  g.add(cyl(0.7, 0.9, 0.9, trim, { y: Y + 14.7 }, 10))
  g.add(ball(1.4, acc, { y: Y + 16.5 }, [1, 0.8, 1]))
  return fitGroup(g)
}

// ---------- 豆浆机：圆筒机身上扣着带提手和小屏的机头，侧面把手、对面壶嘴，旁边一杯豆浆和一小碟黄豆 ----------

function soymilkMaker(p: string[]) {
  const [body, head, cupC] = p
  const g = new THREE.Group()
  const SEG = 28
  const step = (PI * 2) / SEG
  const m = new THREE.Group()
  const rB = (y: number) => 7.1 - (0.2 * (y - 3)) / 18.5
  // 机身：圆筒 + 底部一圈深色底脚 + 一条水位窗
  m.add(latheAt([[0, 0], [6.6, 0], [7, 0.5], [7.1, 3], [6.9, 21.5], [0, 21.5]], body, {}, SEG))
  m.add(noOutline(latheAt([[7.14, 0.5], [7.22, 1.6]], DARK, {}, SEG)))
  m.add(noOutline(lathe([[rB(5) + 0.1, 5], [rB(17) + 0.1, 17]], '#e9f4f8', 1, [3 * step, step])))
  // 机头：正面一块弧形面板，亮着读数；顶上一只拱形提手
  m.add(pad(7.15, 6, head, { y: 21.3 }, SEG))
  m.add(noOutline(lathe([[7.27, 22.9], [7.27, 25.9]], DARK, 4, [-2 * step, 4 * step])))
  m.add(lit(lathe([[7.35, 24.2], [7.35, 25.2]], '#ffb347', 2, [-step, 2 * step]), '#ffb347', 0.8))
  for (const i of [-1, 0, 1]) m.add(noOutline(bead(0.32, '#d7d8db', { x: Math.sin(i * step * 0.8) * 7.3, y: 23.5, z: Math.cos(i * step * 0.8) * 7.3 })))
  m.add(tube(arcPts([0, 27, 0], 4, 0, PI, 8), 0.75, head, { seg: 12, radial: 6 }))
  // 侧把手（左）和壶嘴（右）
  m.add(rbox(1.9, 12.4, 2.6, head, { x: -10.2, y: 6 }, 0.9))
  m.add(rbox(4.4, 1.7, 2.4, head, { x: -8.6, y: 16.9 }, 0.7))
  m.add(rbox(4.2, 1.6, 2.4, head, { x: -8.5, y: 5.6 }, 0.7))
  m.add(rbox(2.2, 1.6, 2.8, body, { x: 7.1, y: 19.3, rz: -0.45 }, 0.5))
  g.add(P(m, -3.5, 0, 0))
  // 一杯豆浆
  g.add(cup(3.4, 2.8, 9, 0.3, cupC, { x: 7.95, z: 2.6 }, 20))
  g.add(noOutline(cyl(2.95, 2.95, 0.3, SOYMILK, { x: 7.95, y: 7.5, z: 2.6 }, 20)))
  // 一小碟黄豆
  g.add(miniCup(2.6, 1.8, 1.3, cupC, { x: 6.4, z: -5.4 }))
  g.add(noOutline(cyl(2.05, 2.05, 0.3, shade(SOYBEAN, -0.08), { x: 6.4, y: 0.55, z: -5.4 }, 12)))
  for (let i = 0; i < 7; i++) g.add(bead(0.5, SOYBEAN, { x: 6.4 + Math.cos(i * 1.05) * (i ? 1.25 : 0), y: 1.15 + (i ? 0 : 0.1), z: -5.4 + Math.sin(i * 1.05) * (i ? 1.25 : 0) }, [1, 0.85, 1.15]))
  return fitGroup(g)
}

// ---------- 手摇刨冰机：铸铁底座和后立柱撑着顶臂，顶上一只摇把连着螺杆压住透明冰仓里的冰块，刀盘下面的碗里接着一座冰山 ----------

function kakigoriMachine(p: string[]) {
  const [body, trim, bowlC] = p
  const g = new THREE.Group()
  // 底座（一圈装饰色带）、后立柱、顶臂
  g.add(rbox(18, 2, 21, body, {}, 0.9))
  g.add(noOutline(rbox(18.3, 0.6, 21.3, trim, { y: 0.7 }, 0.3)))
  g.add(rbox(6, 28.5, 4.5, body, { y: 1.5, z: -7.6 }, 1.4))
  g.add(rbox(6, 4, 12.5, body, { y: 26, z: -2.2 }, 1))
  g.add(noOutline(rbox(3.4, 1.4, 0.3, '#d4a64a', { y: 27.3, z: 4.1 }, 0.1)))
  // 刀盘台：从立柱伸出来托着冰仓
  g.add(rbox(5, 2, 4.6, body, { y: 13.5, z: -4.2 }, 0.6))
  g.add(pad(6.4, 2, body, { y: 13.5, z: 1 }))
  // 冰仓：透明筒里一块方冰，上面压着带螺杆的压盘
  g.add(rbox(7, 5.4, 7, '#dff3fb', { y: 15.6, z: 1 }, 1.2))
  g.add(ghost(latheAt([[5.3, 0], [5.3, 8.5], [5, 8.5], [5, 0]], GLASS, { y: 15.5, z: 1 }), GLASS, 0.32))
  g.add(cyl(4.5, 4.5, 0.9, STEEL, { y: 21, z: 1 }, 20))
  g.add(cyl(0.75, 0.75, 11.5, STEEL, { y: 21.9, z: 1 }, 10))
  g.add(cyl(1.6, 1.9, 1, shade(body, -0.08), { y: 30, z: 1 }, 12))
  // 摇把：横臂 + 竖握把
  g.add(rbox(9, 1.2, 2.2, STEEL, { x: 3.4, y: 32.6, z: 1 }, 0.5))
  g.add(cyl(1.05, 1.25, 3.8, trim, { x: 6.9, y: 33.8, z: 1 }, 12))
  g.add(ball(1.3, trim, { x: 6.9, y: 37.6, z: 1 }))
  // 接冰的碗和冰山：冰山的底边贴着碗的内壁（和碗同样 20 段），不是悬在碗里的一坨
  g.add(bowlOf(5.4, 5, bowlC, { y: 2, z: 1.5 }, 0.4, 20))
  g.add(latheAt([[0, 0], [4.85, 0], [4.95, 0.9], [4.2, 2.4], [3.3, 3.9], [2, 5], [0.8, 5.6], [0, 5.75]], ICE, { y: 5.6, z: 1.5 }, 20))
  return fitGroup(g)
}

// ======================================================================
// 配色表（食物是固有色，换的是盛器 / 包装 / 机身）
// ======================================================================

// [托盘, 薯条盒, 纸杯, 吸管和色带]
const BURGER_PALS: Pal[] = [
  ['retro', [R.caramel, R.red, R.cream, R.mustard]],
  ['cute', [C.pink, C.white, C.white, C.sky]],
  ['modern', [M.char, M.white, M.light, M.black]],
  ['nordic', [N.sage, N.white, N.linen, N.mustard]],
]
// [纸桶, 条纹, 蘸酱盒]
const CHICKEN_PALS: Pal[] = [
  ['retro', [R.cream, R.red, R.mustard]],
  ['modern', [M.white, M.char, M.light]],
  ['cute', [C.white, C.pink, C.sakura]],
  ['farmhouse', [F.linen, F.navy, F.white]],
]
// [封膜, 吸管, 贴纸]
const BOBA_PALS: Pal[] = [
  ['cute', [C.sakura, C.pink, C.lemon]],
  ['modern', [M.light, M.black, M.white]],
  ['retro', [R.cream, R.orange, R.teal]],
  ['japanese', [J.washi, J.ai, J.shu]],
]
// [盘子, 盘沿线, 叉柄]
const PASTA_PALS: Pal[] = [
  ['nordic', [N.white, N.blue, N.oak]],
  ['modern', [M.white, M.char, M.silver]],
  ['farmhouse', [F.white, F.barn, F.oak]],
  ['retro', [R.cream, R.teal, R.caramel]],
  ['cute', [C.white, C.pink, C.woodL]],
]
// [木垫, 刀叉柄, 酱汁杯]
const STEAK_PALS: Pal[] = [
  ['industrial', [I.walnut, I.iron, I.concrete]],
  ['nordic', [N.oak, M.black, N.white]],
  ['farmhouse', [F.oak, F.barn, F.white]],
  ['japanese', [J.wood, J.sumi, J.washi]],
]
// [碗, 木叉勺, 碗沿线]
const SALAD_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.sage]],
  ['farmhouse', [F.oak, '#e3c9a0', F.sage]],
  ['modern', [M.char, M.walnut, M.silver]],
  ['cute', [C.mint, C.woodL, C.white]],
]
// [盘子, 盘沿线, 叉柄]
const PANCAKE_PALS: Pal[] = [
  ['nordic', [N.white, N.mustard, N.oak]],
  ['cute', [C.white, C.pink, C.pink]],
  ['retro', [R.cream, R.teal, R.caramel]],
  ['modern', [M.char, M.gray, M.silver]],
  ['farmhouse', [F.white, F.navy, F.oak]],
]
// [盘子, 盘沿线, 杯垫]
const BREAKFAST_PALS: Pal[] = [
  ['nordic', [N.white, N.blue, N.oak]],
  ['farmhouse', [F.white, F.sage, F.oak]],
  ['retro', [R.cream, R.orange, R.caramel]],
  ['modern', [M.white, M.black, M.char]],
  ['cute', [C.white, C.sky, C.lemon]],
]
// [盘子, 醋碟和筷架, 筷子]
const DUMPLING_PALS: Pal[] = [
  ['chinese', [CN.ivory, CN.celadon, CN.rosewood]],
  ['chinese', [CN.celadon, CN.ivory, CN.lacquer]],
  ['japanese', [J.washi, J.ai, J.dark]],
  ['modern', [M.char, M.white, M.black]],
  ['nordic', [N.white, N.blue, N.oak]],
]
// [竹笼, 竹箍, 醋碟]
const XLB_PALS: Pal[] = [
  ['chinese', ['#e3c48f', '#b98a52', CN.ivory]],
  ['chinese', ['#d9b077', CN.walnut, CN.celadon]],
  ['japanese', [J.hinoki, J.wood, J.ai]],
  ['nordic', [N.oakL, N.oak, N.white]],
]
// [托碟, 小勺, 玻璃碗]
const SHAVED_ICE_PALS: Pal[] = [
  ['japanese', [J.ai, J.hinoki, GLASS]],
  ['cute', [C.sakura, C.steel, '#ffe6ee']],
  ['retro', [R.teal, R.cream, '#e8f5d0']],
  ['modern', [M.white, M.silver, GLASS]],
]
// [竹盘, 垫纸, 包边]
const TAIYAKI_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.washi, J.dark]],
  ['japanese', [J.wood, J.washi, J.shu]],
  ['modern', [M.black, M.white, M.char]],
  ['nordic', [N.oakL, N.white, N.oak]],
  ['cute', [C.woodL, C.sakura, C.pink]],
]
// [藤篮, 垫布, 口沿]
const BASKET_PALS: Pal[] = [
  ['farmhouse', ['#c9a568', F.white, '#a8813e']],
  ['nordic', ['#d9c8a4', N.sage, N.oak]],
  ['retro', ['#b88a52', R.mustard, R.caramel]],
  ['cute', ['#f0d8b0', C.sakura, C.pink]],
  ['classic', [CL.walnut, CL.ivory, CL.gold]],
]
// [木板, 刀柄, 小碗]
const BOARD_PALS: Pal[] = [
  ['farmhouse', [F.oak, F.iron, F.white]],
  ['industrial', [I.walnut, I.iron, I.concrete]],
  ['nordic', [N.oak, N.white, N.sage]],
  ['classic', [CL.walnut, CL.gold, CL.ivory]],
]
// [标签, 瓶盖, 碟子]
const RAMUNE_PALS: Pal[] = [
  ['japanese', [J.washi, J.ai, J.ai]],
  ['retro', [R.cream, R.teal, R.mustard]],
  ['cute', [C.white, C.pink, C.sky]],
  ['modern', [M.white, '#3a7ac8', M.light]],
]
// [机身, 把手, 旋钮]
const WAFFLE_PALS: Pal[] = [
  ['retro', [R.cream, M.black, R.red]],
  ['modern', [M.char, M.black, M.silver]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['nordic', [N.white, N.oak, N.mustard]],
  ['retro', [R.teal, R.cream, R.mustard]],
]
// [机身, 把手, 盘子]
const PRESS_PALS: Pal[] = [
  ['modern', [M.white, M.black, M.light]],
  ['retro', [R.red, M.black, R.cream]],
  ['cute', [C.mint, C.white, C.lemon]],
  ['industrial', [I.steel, I.iron, I.concrete]],
  ['nordic', [N.sage, N.oak, N.white]],
]
// [底座, 把手和壶盖, 旋钮和盖钮]
const KETTLE_PALS: Pal[] = [
  ['modern', [M.white, M.black, M.silver]],
  ['chinese', [CN.ivory, CN.rosewood, CN.brass]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['nordic', [N.sage, N.oak, N.white]],
  ['modern', [M.char, M.black, M.silver]],
]
// [机身, 机头和把手, 杯子]
const SOYMILK_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.light]],
  ['cute', [C.white, C.pink, C.sakura]],
  ['nordic', [N.white, N.sage, N.linen]],
  ['retro', [R.cream, R.teal, R.mustard]],
  ['chinese', [CN.ivory, CN.lacquer, CN.celadon]],
]
// [机身, 握把和色带, 碗]
const KAKIGORI_PALS: Pal[] = [
  ['retro', [R.teal, R.red, R.cream]],
  ['japanese', [J.ai, J.shu, J.washi]],
  ['cute', [C.mint, C.pink, C.white]],
  ['industrial', [I.iron, I.rust, I.concrete]],
  ['retro', [R.red, R.cream, R.mustard]],
]

// ======================================================================
// 素材表
// ======================================================================

/** 做好的餐食：桌面摆件，食物本色（不派生风格配色） */
const MEAL: Partial<AssetDef> = { ...PROP, type: 'food', tags: ['own-colors'] }
/** 饮品 */
const DRINK: Partial<AssetDef> = { ...PROP, type: 'drink', tags: ['own-colors'] }

export const FOOD_MORE: AssetDef[] = [
  // ---------- 餐食 ----------
  define('fd-burger-set', '汉堡薯条套餐', 'tabletop', [34, 26, 17], BURGER_PALS, burgerSet, { ...MEAL, mats: ['plastic', 'paper', 'paper', 'plastic'] }),
  define('fd-fried-chicken', '炸鸡桶', 'tabletop', [24, 17.5, 20.5], CHICKEN_PALS, friedChicken, { ...MEAL, mats: ['paper', 'paper', 'paper'] }),
  define('fd-bubble-tea', '珍珠奶茶（两杯）', 'tabletop', [17, 8, 18], BOBA_PALS, bubbleTea, { ...DRINK, mats: ['plastic', 'plastic', 'paper'] }),
  define('fd-pasta', '番茄肉酱意面', 'tabletop', [24, 24, 6.5], PASTA_PALS, pastaPlate, { ...MEAL, mats: ['ceramic', 'ceramic', 'wood'] }),
  define('fd-steak', '铁板牛排', 'tabletop', [35, 20, 6.5], STEAK_PALS, steakPlate, { ...MEAL, mats: ['wood', 'wood', 'ceramic'], fx: STEAK_FX }),
  define('fd-salad-bowl', '沙拉碗', 'tabletop', [22, 22, 13], SALAD_PALS, saladBowl, { ...MEAL, mats: ['ceramic', 'wood', 'ceramic'] }),
  define('fd-pancakes', '松饼塔', 'tabletop', [20, 20, 10], PANCAKE_PALS, pancakeStack, { ...MEAL, mats: ['ceramic', 'ceramic', 'wood'] }),
  define('fd-breakfast-plate', '西式早餐盘', 'tabletop', [33, 23, 11], BREAKFAST_PALS, breakfastPlate, { ...MEAL, mats: ['ceramic', 'ceramic', 'wood'] }),
  define('fd-dumplings', '煎饺', 'tabletop', [27, 22, 4], DUMPLING_PALS, dumplingPlate, { ...MEAL, mats: ['ceramic', 'ceramic', 'wood'] }),
  define('fd-xiaolongbao', '小笼包', 'tabletop', [30, 26, 11], XLB_PALS, xiaolongbao, { ...MEAL, mats: ['wood', 'wood', 'ceramic'], fx: XLB_FX }),
  define('fd-shaved-ice', '草莓刨冰', 'tabletop', [14, 14, 19], SHAVED_ICE_PALS, shavedIce, { ...MEAL, mats: ['ceramic', 'metal', 'glass'] }),
  define('fd-taiyaki', '鲷鱼烧', 'tabletop', [26, 18, 3], TAIYAKI_PALS, taiyakiTray, { ...MEAL, mats: ['wood', 'paper', 'wood'] }),
  define('fd-croissant-basket', '可颂面包篮', 'tabletop', [33, 24, 13], BASKET_PALS, breadBasket, { ...MEAL, mats: ['wood', 'fabric', 'wood'] }),
  define('fd-charcuterie', '芝士拼盘', 'tabletop', [36, 20, 6.5], BOARD_PALS, charcuterie, { ...MEAL, mats: ['wood', 'wood', 'ceramic'] }),
  define('fd-ramune', '弹珠汽水和西瓜', 'tabletop', [22, 14, 20], RAMUNE_PALS, ramuneSet, { ...DRINK, mats: ['paper', 'plastic', 'ceramic'] }),
  // ---------- 厨房小电器 ----------
  define('fd-waffle-maker', '华夫饼机', 'kitchenware', [18, 28, 25], WAFFLE_PALS, waffleMaker, { ...PROP, type: 'cookware', tags: ['kitchenware'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('fd-sandwich-press', '热压三明治机', 'kitchenware', [30, 20, 9.5], PRESS_PALS, sandwichPress, { ...PROP, type: 'cookware', tags: ['kitchenware'], mats: ['plastic', 'plastic', 'ceramic'] }),
  define('fd-health-kettle', '养生壶', 'kitchenware', [19, 16, 23], KETTLE_PALS, healthKettle, { ...PROP, type: 'electric-kettle', tags: ['kettle', 'kitchenware'], mats: ['plastic', 'plastic', 'metal'] }),
  define('fd-soymilk-maker', '豆浆机', 'kitchenware', [26, 16, 32], SOYMILK_PALS, soymilkMaker, { ...PROP, type: 'blender', tags: ['kitchenware'], mats: ['plastic', 'plastic', 'ceramic'] }),
  define('fd-kakigori-machine', '手摇刨冰机', 'kitchenware', [18, 21, 39], KAKIGORI_PALS, kakigoriMachine, { ...PROP, type: 'cookware', tags: ['kitchenware'], mats: ['metal', 'wood', 'ceramic'] }),
]
