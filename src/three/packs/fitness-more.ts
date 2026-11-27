// 健身器材与运动练习补充：小蹦床、踏步机、引体向上双杠架、仰卧板、卧式健身车、肋木架、木人桩、芭蕾把杆、推杆练习毯、
// 攀岩指力板、战绳、药球架、速度球、体操吊环、健腹器、甩脂机、跳舞毯、跳箱、健身补给组、健身镜。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；有控制台 / 扶手的有氧器械（踏步机、卧式健身车、健腹器）和跑步机一样，把手那头朝 -z（面向墙练）。
// 壁挂件（指力板、吊环）按离地高度建，背面贴 z = -d/2。type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, box, cup, cyl, nub, rbox, shade, torus } from '../toon'
import { C, paintPanel, type AssetDef } from '../kit'
import { cylX, cylZ, fitGroup, fitWall, G, latheAt, lit, noOutline, P, PI, rod3, sideSlab, strutBox, taperRod3, tiltFrame, tube, type V3 } from '../geo'
import { I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#24252a'
const RUBBER = '#2e2f33'
const FOAM = '#34353a'
const MAT = '#1f2024'
const SCREEN = '#7fd8ff'
/** 速度球立杆：跟反弹板的木色区分开，统一用黑钢 */
const POLE = M.black

/** 螺旋线上的点：绕 (cx, cz) 半径 r，从角度 a0 转 turns 圈，高度从 y0 线性升到 y1（角度 0 在 +z 方向） */
function helix(cx: number, cz: number, r: number, a0: number, turns: number, y0: number, y1: number, perTurn = 24): V3[] {
  const n = Math.max(2, Math.ceil(turns * perTurn))
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = a0 + t * turns * PI * 2
    out.push([cx + Math.sin(a) * r, y0 + (y1 - y0) * t, cz + Math.cos(a) * r])
  }
  return out
}

/** 球搁在两根横杆上（侧视图里两根杆的圆心 a、b，[z, y]）：球心 [z, y]；reach = 球半径 + 杆半径 */
function restOn(a: [number, number], b: [number, number], reach: number): [number, number] {
  const mz = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dz = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dz, dy)
  const h = Math.sqrt(reach * reach - (L / 2) ** 2)
  let nz = -dy / L
  let ny = dz / L
  if (ny < 0) {
    nz = -nz
    ny = -ny
  }
  return [mz + nz * h, my + ny * h]
}

/** 泡棉握把：套在 a → b 一段杆上的粗一圈的套子 */
function grip(a: V3, b: V3, r: number, color = FOAM) {
  return rod3(a, b, r, color, 12)
}

// ---------- 健身小蹦床：六条短腿撑起钢圈，黑色跳面外一圈压扁的弹簧护套，后面一根 T 形扶手 ----------

const TR = { r: 49.5, y: 22, post: -54.5, top: 116 }
function miniTrampoline(p: string[]) {
  const [frame, cover, hand] = p
  const g = new THREE.Group()
  const y = TR.y
  // 钢圈和跳面
  g.add(P(torus(TR.r, 1.6, frame, {}, PI * 2, [6, 32]), 0, y - 1, 0, PI / 2))
  g.add(cyl(41, 41, 0.6, MAT, { y: y - 0.6 }, 40))
  // 跳面上一圈缝线
  g.add(P(noOutline(torus(36, 0.3, '#4a4b52', {}, PI * 2, [4, 32])), 0, y + 0.05, 0, PI / 2))
  // 弹簧护套：压扁的粗圆环，盖住钢圈和弹簧
  const pad = P(torus(46, 5.6, cover), 0, y + 0.6, 0, PI / 2)
  pad.scale.set(1, 1, 0.42)
  g.add(pad)
  // 六条腿：从钢圈往外撇一点落地，脚底橡胶垫
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    const c = Math.sin(a)
    const s = Math.cos(a)
    g.add(rod3([c * TR.r, y - 1, s * TR.r], [c * 52, 1.6, s * 52], 1.3, frame, 8))
    g.add(cyl(2.4, 2.8, 1.8, RUBBER, { x: c * 52, z: s * 52 }, 10))
  }
  // T 形扶手：卡扣夹在钢圈后沿，立杆往上，顶端一根横把 + 两只泡棉握把
  const pz = TR.post
  g.add(rbox(7, 6, 7, frame, { y: y - 5, z: pz + 2.6 }, 1.2))
  g.add(cyl(1.9, 1.9, TR.top - (y - 8), frame, { y: y - 8, z: pz }, 12))
  g.add(cyl(2.3, 2.3, 4, hand, { y: y + 12, z: pz }, 12))
  g.add(cylX(1.6, 52, frame, 0, TR.top, pz, 12))
  for (const s of [-1, 1]) g.add(cylX(2.5, 15, hand, s * 18, TR.top, pz, 14))
  g.add(ball(2.3, frame, { y: TR.top, z: pz }))
  return fitGroup(g)
}

// ---------- 踏步机：底座后端一根转轴挑着两块踏板（一高一低），前端两只液压缸顶着，前面立柱顶上是横把和小显示屏 ----------

function stepper(p: string[]) {
  const [frame, pedal, acc] = p
  const g = new THREE.Group()
  // 底座 + 四只脚垫
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 1.4, 6, RUBBER, { x: sx * 14, z: 2 + sz * 18 }, 0.5))
  g.add(rbox(36, 6, 44, frame, { y: 1.2, z: 2 }, 2))
  const top = 7.2
  // 后端转轴：两只支座 + 一根轴
  const py = 12
  const pz = 20
  for (const s of [-1, 1]) g.add(rbox(3, py - top + 1.5, 5, frame, { x: s * 16, y: top - 0.3, z: pz }, 0.8))
  g.add(cylX(1.4, 34, STEEL, 0, py, pz, 12))
  // 两块踏板：绕转轴转起来，前端（-z）一高一低
  for (const [s, a] of [
    [-1, 0.34],
    [1, 0.13],
  ] as [number, number][]) {
    const x = s * 8
    const pd = new THREE.Group()
    pd.add(rbox(13, 3, 30, pedal, { z: -15 }, 1))
    // 防滑橡胶条
    for (let k = 0; k < 4; k++) pd.add(noOutline(box(10.5, 0.5, 1.4, RUBBER, { y: 2.8, z: -26 + k * 6.5 })))
    P(pd, x, py - 1.5, pz, a)
    g.add(pd)
    // 液压缸：粗缸筒坐在底座上，细活塞杆顶到踏板底
    const hy = py - 1.5 + 24 * Math.sin(a)
    const hz = pz - 24 * Math.cos(a)
    const len = hy - top
    g.add(cyl(1.8, 1.8, len * 0.55, acc, { x, y: top - 0.3, z: hz }, 12))
    g.add(cyl(0.7, 0.7, len * 0.6, STEEL, { x, y: top + len * 0.45, z: hz }, 8))
  }
  // 立柱、横把、握把、显示屏
  g.add(strutBox([0, top - 0.5, -15], [0, 104, -12], 4.2, 4.2, frame))
  g.add(cylX(1.5, 34, frame, 0, 103, -12, 12))
  for (const s of [-1, 1]) g.add(cylX(2.2, 11, RUBBER, s * 13, 103, -12, 12))
  const con = G(rbox(14, 9, 5, frame, { y: -4.5 }, 1.6), lit(box(10, 5, 0.6, SCREEN, { y: -2.5, z: 2.5 }), SCREEN, 0.5))
  for (const s of [-1, 1]) con.add(noOutline(box(2, 1.2, 0.6, acc, { x: s * 5, y: 3, z: 2.5 })))
  // 显示屏坐在横把和立柱顶上（后仰着，底面中间压进横把一点）
  g.add(P(con, 0, 108, -12, -0.35))
  return fitGroup(g)
}

// ---------- 引体向上双杠架：H 形底脚、两根立柱，顶上往前探的引体杆（两端斜握把），中部靠背垫、两条带肘垫的双杠把手 ----------

const PT = { x: 36, uz: -24, top: 208 }
function powerTower(p: string[]) {
  const [frame, pad, acc] = p
  const g = new THREE.Group()
  const { x: X, uz, top } = PT
  for (const s of [-1, 1]) {
    const x = s * X
    // 底脚：一根长方管 + 两头橡胶脚
    for (const sz of [-1, 1]) g.add(rbox(6.6, 2.4, 6, RUBBER, { x, z: sz * 56 }, 0.6))
    g.add(rbox(6, 5, 120, frame, { x, y: 0.3 }, 1))
    // 立柱
    g.add(rbox(5, top - 5, 5, frame, { x, y: 5, z: uz }, 0.8))
    // 前后斜撑
    g.add(strutBox([x, 4, 52], [x, 80, uz + 1], 4.4, 4.4, frame))
    g.add(strutBox([x, 4, -56], [x, 52, uz - 1], 4.4, 4.4, frame))
    // 顶上往前探的横臂
    g.add(rbox(4.4, 4.4, 46, frame, { x, y: top - 5.5, z: uz + 23 }, 0.8))
    // 双杠把手：方管从立柱内侧伸出，前段换成圆管套泡棉；上面一块肘垫
    const ax = s * (X - 4.4)
    g.add(rbox(4.4, 4.4, 34, frame, { x: ax, y: 122, z: uz + 17 }, 0.8))
    g.add(cylZ(1.8, 16, frame, ax, 124.2, 15, 12))
    g.add(cylZ(2.6, 13, FOAM, ax, 124.2, 17.5, 14))
    g.add(rbox(10, 5, 26, pad, { x: ax, y: 126, z: -6 }, 2))
    g.add(noOutline(box(10.4, 1, 26.4, acc, { x: ax, y: 127.6, z: -6 })))
  }
  // 底脚之间的横梁、顶上的横梁、靠背后的两根横档
  g.add(rbox(X * 2, 4, 6, frame, { y: 0.8, z: uz }, 0.8))
  g.add(rbox(X * 2, 4.5, 5, frame, { y: top - 7, z: uz }, 0.8))
  for (const y of [98, 128]) g.add(rbox(X * 2, 4, 4, frame, { y, z: uz }, 0.8))
  // 靠背垫
  g.add(rbox(34, 44, 6, pad, { y: 92, z: uz + 4.6 }, 2.4))
  g.add(noOutline(rbox(3, 40, 6.4, acc, { y: 94, z: uz + 4.6 }, 0.6)))
  // 引体杆：一根长横杆 + 两端往前下方的斜握把，内侧两段泡棉
  const by = top - 3.3
  const bz = PT.uz + 44
  g.add(cylX(1.6, 92, STEEL, 0, by, bz, 12))
  for (const s of [-1, 1]) {
    g.add(ball(1.6, STEEL, { x: s * 46, y: by, z: bz }))
    g.add(rod3([s * 46, by, bz], [s * 50, by - 6, bz + 10], 1.6, STEEL, 12))
    g.add(grip([s * 46.6, by - 0.9, bz + 1.5], [s * 49.6, by - 5.4, bz + 9], 2.4))
    g.add(cylX(2.4, 12, FOAM, s * 24, by, bz, 14))
  }
  return fitGroup(g)
}

// ---------- 仰卧板：一根斜钢梁托着长条软垫（头低脚高），后端一根落地横管，前端可调支脚，顶端立管上两对勾脚泡棉滚筒 ----------

const SB = { a: [-62, 10] as [number, number], b: [50, 40] as [number, number] }
function situpBoard(p: string[]) {
  const [frame, pad, acc] = p
  const g = new THREE.Group()
  // 钢梁 + 软垫（斜面坐标系里平放）
  const sl = tiltFrame(SB.a, SB.b, 'z')
  sl.g.add(rbox(5, 5, sl.len, frame, { y: -2.5, z: sl.len / 2 }, 1))
  sl.g.add(rbox(28, 1.4, sl.len - 12, DARK, { y: 2.2, z: (sl.len - 12) / 2 + 1 }, 0.5))
  sl.g.add(rbox(30, 5.5, sl.len - 12, pad, { y: 3.4, z: (sl.len - 12) / 2 + 1 }, 2.2))
  sl.g.add(noOutline(box(30.4, 1, sl.len - 11.6, acc, { y: 5.4, z: (sl.len - 12) / 2 + 1 })))
  g.add(sl.g)
  const [az, ay] = SB.a
  const [bz, by] = SB.b
  const on = (z: number) => ay + ((z - az) / (bz - az)) * (by - ay)
  // 后端：落地横管 + 短立管接到梁底
  g.add(cylX(2.2, 34, frame, 0, 2.2, -58, 12))
  for (const s of [-1, 1]) g.add(cylX(2.6, 3, RUBBER, s * 17.5, 2.2, -58, 12))
  g.add(strutBox([0, 2, -58], [0, on(-58) - 1, -58], 4, 4, frame))
  // 前端可调支脚：斜撑 + 插销 + 落地横管
  g.add(strutBox([0, on(28) - 1.5, 28], [0, 2.2, 40], 4.4, 4.4, frame))
  g.add(cylX(1.2, 8, acc, 0, 18, 33.3, 10))
  g.add(cylX(2.2, 40, frame, 0, 2.2, 40, 12))
  for (const s of [-1, 1]) g.add(cylX(2.6, 3, RUBBER, s * 20.5, 2.2, 40, 12))
  // 顶端立管 + 两对勾脚滚筒
  g.add(strutBox([0, by - 2, bz - 2], [0, 62, bz + 2], 4, 4, frame))
  for (const [y, z] of [
    [48.5, bz - 0.8],
    [58.5, bz + 1.3],
  ] as [number, number][]) {
    g.add(cylX(4, 28, FOAM, 0, y, z, 16))
    for (const s of [-1, 1]) g.add(cylX(4.2, 1.2, acc, s * 14.4, y, z, 16))
  }
  return fitGroup(g)
}

// ---------- 卧式健身车：一根长底梁，-z 端是圆润的飞轮罩和踏板、立杆上的仪表屏，+z 端是低座和后仰的靠背，座椅两侧握把 ----------

function recumbentBike(p: string[]) {
  const [frame, seat, acc] = p
  const g = new THREE.Group()
  const body = shade(frame, 0.06)
  // 底梁和前后稳定管
  g.add(rbox(8, 7, 118, frame, { y: 3 }, 1.6))
  for (const z of [-62, 62]) {
    g.add(cylX(3.2, 58, frame, 0, 3.2, z, 14))
    for (const s of [-1, 1]) g.add(cylX(3.6, 3, RUBBER, s * 30, 3.6, z, 14))
  }
  // 飞轮罩 + 两侧的飞轮饰盖
  g.add(rbox(18, 46, 42, body, { y: 6, z: -38 }, 8))
  g.add(cylX(14, 19, acc, 0, 30, -40, 28))
  g.add(cylX(5, 19.6, STEEL, 0, 30, -40, 16))
  // 曲柄和踏板（一前一后）
  g.add(cylX(4.4, 23, STEEL, 0, 30, -18, 16))
  for (const s of [-1, 1]) {
    const dy = s * 10.2
    const dz = s * 13.6
    g.add(strutBox([s * 11, 30, -18], [s * 11, 30 + dy, -18 + dz], 2, 2.4, STEEL))
    g.add(cylX(0.9, 4, STEEL, s * 13, 30 + dy, -18 + dz, 8))
    g.add(rbox(10, 2.6, 7, RUBBER, { x: s * 19.5, y: 30 + dy - 1.3, z: -18 + dz }, 0.8))
    g.add(rbox(8, 2, 1.6, acc, { x: s * 19.5, y: 30 + dy + 1.2, z: -18 + dz + 1.6 }, 0.5))
  }
  // 仪表立杆 + 往后仰对着座椅的仪表屏
  g.add(strutBox([0, 48, -30], [0, 90, -12], 5, 4, frame))
  const con = G(rbox(22, 12, 4, body, { y: -6 }, 1.6), lit(box(16, 7, 0.6, SCREEN, { y: -3.5, z: 2 }), SCREEN, 0.5))
  for (const s of [-1, 1]) con.add(noOutline(box(2.4, 1.6, 0.6, acc, { x: s * 8.6, y: -5, z: 2 })))
  g.add(P(con, 0, 92, -10, -0.55))
  // 座椅：座管、坐垫、后仰的靠背和后面的支撑
  g.add(strutBox([0, 9, 26], [0, 41, 24], 6, 6, frame))
  g.add(rbox(40, 8, 38, seat, { y: 40, z: 26 }, 3.5))
  g.add(P(rbox(42, 50, 7, seat, {}, 3.2), 0, 72, 50, 0.28))
  g.add(noOutline(P(rbox(6, 44, 7.4, acc, {}, 0.6), 0, 72, 50, 0.28)))
  g.add(strutBox([0, 9, 54], [0, 61.5, 51], 5, 5, frame))
  // 两侧握把：从座底伸出，弯向前方，前段泡棉
  for (const s of [-1, 1]) {
    g.add(tube([[s * 17, 43, 30], [s * 26, 43, 28], [s * 28, 42, 16], [s * 28, 38, 8]], 1.5, frame, { seg: 12, radial: 6 }))
    g.add(grip([s * 28, 41.2, 14], [s * 28, 38.2, 8.4], 2.3))
  }
  return fitGroup(g)
}

// ---------- 肋木架：贴墙的两根木立柱之间十四根圆横杆，顶上一对钢臂往前挑出一根引体杆 ----------

const WB = { w: 90, d: 30, h: 230 }
function wallBars(p: string[]) {
  const [wood, steel] = p
  const g = new THREE.Group()
  const zc = -WB.d / 2 + 5
  for (const s of [-1, 1]) {
    const x = s * (WB.w / 2 - 4)
    g.add(rbox(8, WB.h, 8, wood, { x, z: zc }, 1.2))
    // 上下两只贴墙的钢角码
    for (const y of [20, 196]) g.add(rbox(9, 6, 1.8, steel, { x, y, z: -WB.d / 2 + 0.9 }, 0.4))
  }
  // 横杆两头插进立柱里
  for (let k = 0; k < 14; k++) g.add(cylX(1.7, WB.w - 12, wood, 0, 14 + k * 14, zc, 10))
  // 顶上的引体杆（泡棉握把的前沿不超出声明的进深）
  const bz = WB.d / 2 - 2.3
  for (const s of [-1, 1]) g.add(rbox(4, 4, 24, steel, { x: s * (WB.w / 2 - 9), y: 212, z: zc + 12 }, 0.8))
  g.add(cylX(1.6, WB.w - 14, steel, 0, 214, bz, 12))
  for (const s of [-1, 1]) g.add(cylX(2.2, 12, FOAM, s * 26, 214, bz, 14))
  return g
}

// ---------- 木人桩（咏春）：方框底座、两根立柱夹着两条横档，横档穿过圆柱桩身；桩身上三只桩手、一条弯折的桩腿 ----------

function woodenDummy(p: string[]) {
  const [frame, trunk, arm] = p
  const g = new THREE.Group()
  // 底座方框
  for (const s of [-1, 1]) {
    g.add(rbox(6, 6, 70, frame, { x: s * 27 }, 1))
    g.add(rbox(54, 5, 6, frame, { y: 0.5, z: s * 32 }, 1))
  }
  // 两根立柱 + 穿过桩身的两条横档
  for (const s of [-1, 1]) g.add(rbox(5.4, 136, 5.4, frame, { x: s * 27, y: 5.5 }, 1))
  for (const y of [52, 128]) g.add(rbox(62, 5, 4.4, frame, { y }, 1))
  // 桩身 + 顶上的倒角
  g.add(cyl(11, 11, 126, trunk, { y: 32 }, 24))
  g.add(cyl(10, 11, 2, trunk, { y: 158 }, 24))
  for (const y of [36, 154]) g.add(noOutline(cyl(11.3, 11.3, 1.2, shade(trunk, -0.18), { y }, 24)))
  // 两只上桩手（略往外张、往上翘）+ 一只中桩手
  for (const s of [-1, 1]) g.add(taperRod3([s * 3, 120, 4], [s * 9, 124, 31], 2.4, 1.8, arm, 10))
  g.add(taperRod3([0, 100, 4], [0, 101, 32], 2.4, 1.8, arm, 10))
  // 桩腿：先往前下方伸出，膝盖处折向下
  g.add(rod3([0, 64, 6], [0, 56, 24], 3, arm, 12))
  g.add(ball(3.3, arm, { y: 56, z: 24 }))
  g.add(taperRod3([0, 56, 24], [0, 34, 29], 3, 2.6, arm, 12))
  return g
}

// ---------- 芭蕾把杆（落地移动式）：两只 T 形底座上立着钢立柱，前面一高一低两根木把杆 ----------

const BB = { w: 200, d: 50, h: 110, low: 84, high: 104 }
function balletBarre(p: string[]) {
  const [metal, wood] = p
  const g = new THREE.Group()
  const ux = BB.w / 2 - 12
  for (const s of [-1, 1]) {
    const x = s * ux
    g.add(rbox(6, 4, BB.d - 2, metal, { x, y: 0.6 }, 1))
    for (const sz of [-1, 1]) g.add(rbox(6.6, 1.2, 4, RUBBER, { x, z: sz * (BB.d / 2 - 3) }, 0.4))
    g.add(cyl(2.2, 2.2, BB.h - 6.5, metal, { x, y: 4.4 }, 14))
    g.add(ball(2.6, metal, { x, y: BB.h - 2.6 }))
    // 两只托臂伸向前面的把杆
    for (const y of [BB.low, BB.high]) g.add(rbox(4, 4, 11, metal, { x, y: y - 2, z: 4.5 }, 0.8))
  }
  for (const y of [BB.low, BB.high]) g.add(cylX(2.1, BB.w, wood, 0, y, 8, 16))
  return g
}

// ---------- 高尔夫推杆练习毯：长条果岭毯，后端坡起的平台上开一个球洞插小旗，右侧一条回球槽；毯上两颗球，前端小支架上斜靠一支推杆 ----------

const PM = { x: -3.2, w: 33.6, z0: -100, z1: 122 }
function puttingMat(p: string[]) {
  const [green, trim, club] = p
  const g = new THREE.Group()
  const len = PM.z1 - PM.z0
  // 毯面
  g.add(rbox(PM.w, 1.2, len, green, { x: PM.x, z: (PM.z0 + PM.z1) / 2 }, 0.4))
  // 中间一条白色瞄准虚线
  for (let k = 0; k < 9; k++) g.add(noOutline(box(0.8, 0.3, 7, '#f4f4f2', { x: PM.x, y: 1.05, z: 100 - k * 20 })))
  // 后端坡起的平台（坡面压住毯子末端）
  g.add(sideSlab([[-125, 0], [-90, 0], [-90, 0.8], [-104, 6], [-125, 6]], PM.w + 0.8, green, PM.x, { bevel: 0.4 }))
  // 球洞：黑色洞口 + 白圈 + 小旗
  const hz = -114
  g.add(cyl(5.4, 5.4, 0.4, DARK, { x: PM.x, y: 5.85, z: hz }, 24))
  g.add(P(noOutline(torus(5.6, 0.35, '#f4f4f2', {}, PI * 2, [4, 24])), PM.x, 6.05, hz, PI / 2))
  g.add(cyl(0.3, 0.3, 26, '#f4f4f2', { x: PM.x, y: 5.9, z: hz }, 6))
  g.add(box(0.3, 5, 8, trim, { x: PM.x, y: 26.5, z: hz + 4 }))
  // 回球槽：坡道右侧的斜滑道 + 一路回到前端的浅槽；贴着毯子和平台的右沿（内侧的槽边压住毯边一点，不留缝）
  const rx = PM.x + PM.w / 2 + 3.35
  g.add(sideSlab([[-118, 0], [-86, 0], [-86, 0.6], [-118, 5]], 7, trim, rx, { bevel: 0.4 }))
  g.add(rbox(7, 0.6, 208, trim, { x: rx, z: 18 }, 0.2))
  for (const s of [-1, 1]) g.add(rbox(1, 1.6, 206, trim, { x: rx + s * 2.9, y: 0.4, z: 18 }, 0.3))
  g.add(ball(2.15, '#f8f8f6', { x: rx, y: 0.6 + 2.15, z: 70 }))
  // 毯上两颗球
  g.add(ball(2.15, '#f8f8f6', { x: -8, y: 1.2 + 2.15, z: 30 }))
  g.add(ball(2.15, '#f8f8f6', { x: 2, y: 1.2 + 2.15, z: -40 }))
  // 推杆支架 + 斜靠的推杆
  const sx = -12
  g.add(rbox(8, 1.6, 8, trim, { x: sx, y: 1.2, z: 100 }, 0.4))
  g.add(rbox(2.4, 54, 2.4, trim, { x: sx, y: 2.6, z: 100 }, 0.4))
  g.add(rbox(3.2, 3, 7, RUBBER, { x: sx, y: 55, z: 102 }, 0.6))
  const h0: V3 = [sx, 2.6, 118]
  const h1: V3 = [sx, 90, 96]
  g.add(rod3(h0, h1, 0.6, STEEL, 8))
  const at = (y: number): V3 => [sx, y, h0[2] + ((y - h0[1]) / (h1[1] - h0[1])) * (h1[2] - h0[2])]
  g.add(grip(at(66), at(90.4), 1.2, club))
  g.add(rbox(10, 2.4, 3, STEEL, { x: sx + 4, y: 1.2, z: 119 }, 0.6))
  g.add(noOutline(box(0.6, 1.2, 0.4, club, { x: sx + 4, y: 2, z: 120.6 })))
  return fitGroup(g)
}

// ---------- 攀岩指力板（壁挂）：墙上一块背板，木质指力板顶上一条大把手、两排深浅不同的抠槽、两角圆包，下面挂一只粉袋 ----------

const HB_MOUNT = 190
function hangboard(p: string[]) {
  const [wood, back, bag] = p
  const g = new THREE.Group()
  // 背板 + 四颗螺丝
  g.add(rbox(62, 24, 1.8, back, { y: 20, z: 0.9 }, 0.6))
  for (const sx of [-1, 1]) for (const y of [22.5, 41.5]) g.add(cylZ(0.8, 0.6, STEEL, sx * 28.5, y, 1.9, 10))
  // 指力板底板（深色，露在槽里当槽底）
  g.add(rbox(56, 15, 2, shade(wood, -0.22), { y: 25, z: 2.6 }, 0.5))
  // 顶上的大把手
  g.add(rbox(56, 4, 4.6, wood, { y: 36, z: 3.8 }, 1.8))
  // 两排抠槽：一段段木条，中间的空当就是槽
  const rows: [number, number, number[]][] = [
    // [底边 y, 进深, 每段的 [起点 x, 终点 x] 平铺]
    [31, 3.8, [-28, -15, -11, 11, 15, 28]],
    [26, 3, [-28, -20, -16, -4, 4, 16, 20, 28]],
  ]
  for (const [y, dep, xs] of rows)
    for (let i = 0; i < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i]
      g.add(rbox(w, 3.6, dep, wood, { x: (xs[i] + xs[i + 1]) / 2, y, z: 2 + dep / 2 }, 0.8))
    }
  // 两角的圆包
  for (const s of [-1, 1]) g.add(ball(4.6, wood, { x: s * 24, y: 38.5, z: 4 }, [1, 0.75, 0.8]))
  // 粉袋：背板底下一只小钩，挂绳吊着一只敞口的粉袋（里面一层白色镁粉）
  g.add(rod3([0, 21.5, 1.6], [0, 21.5, 3.6], 0.35, STEEL, 6))
  g.add(ball(0.5, STEEL, { y: 21.5, z: 3.6 }))
  g.add(rod3([0, 21.2, 3.4], [0, 11.8, 1.2], 0.25, RUBBER, 6))
  // 粉袋：下宽上窄的软袋 + 一圈白色抓绒口沿 + 前面垂下的抽绳和绳扣
  const bz = 5.8
  // 袋身、镁粉面、口沿同样的段数；抽绳贴着袋壁垂下来，绳扣不比口沿更往前探
  g.add(cup(4.6, 5.3, 10.6, 0.5, bag, { z: bz }, 20))
  g.add(cyl(4.3, 4.3, 0.6, '#f6f6f2', { y: 8.2, z: bz }, 20))
  g.add(P(torus(4.6, 1, '#ece8df', {}, PI * 2, [8, 20]), 0, 10.8, bz, PI / 2))
  g.add(rod3([1.8, 10.4, bz + 4.9], [2.4, 6.4, bz + 4.9], 0.2, RUBBER, 5))
  g.add(cyl(0.7, 0.7, 1.6, shade(bag, -0.25), { x: 2.4, y: 5, z: bz + 4.9 }, 8))
  return fitWall(g, HB_MOUNT, 11.4)
}

// ---------- 战绳 + 地锚：一只地锚上的钢环穿着粗绳，绳子两股并着往后盘成两层螺旋，两个带胶套的绳头搭进圈中央 ----------

function battleRope(p: string[]) {
  const [rope, sleeve, anchor] = p
  const g = new THREE.Group()
  const cz = -6
  const R0 = 28
  const r = 2.6
  const a0 = -0.5
  // 地锚：底板 + 座 + 竖着的钢环（环面朝左右，绳子左右穿过）
  const az = 34
  g.add(cyl(7, 7.6, 1.4, anchor, { z: az }, 20))
  for (let k = 0; k < 4; k++) g.add(cyl(0.7, 0.7, 0.5, STEEL, { x: Math.cos(k * PI / 2 + PI / 4) * 5, y: 1.3, z: az + Math.sin(k * PI / 2 + PI / 4) * 5 }, 8))
  g.add(rbox(4, 2, 3, anchor, { y: 1.2, z: az }, 0.6))
  g.add(P(torus(3.4, 0.9, STEEL, {}, PI * 2, [8, 16]), 0, 6.7, az, 0, PI / 2))
  // 两股绳：A 在下层起步、B 叠在它上面，一起盘 1.5 圈；两股在地锚处连成一根穿过钢环
  const turns = 1.5
  const pitch = r * 4
  const A = helix(0, cz, R0, a0, turns, r, r + pitch * turns, 16)
  const B = helix(0, cz, R0, a0, turns, r * 3, r * 3 + pitch * turns, 16)
  const endA = A[A.length - 1]
  const endB = B[B.length - 1]
  // 绳头：从顶层往圈中央拐下去，平躺在地上
  const tailA: V3[] = [
    [endA[0] - 6, endA[1] - 1, endA[2] + 6],
    [-2, r + 3, cz - 10],
    [-6, r + 0.6, cz + 2],
    [-9, r + 0.6, cz + 14],
  ]
  const tailB: V3[] = [
    [endB[0] - 4, endB[1] - 2, endB[2] + 7],
    [8, r + 4, cz - 8],
    [7, r + 0.6, cz + 4],
    [5, r + 0.6, cz + 17],
  ]
  const path: V3[] = [
    ...tailA.slice().reverse(),
    ...A.slice().reverse(),
    [-8, r + 0.4, 27],
    [-2.4, 6.7, az],
    [2.4, 6.7, az],
    [-6, r * 3 + 1, 25],
    ...B,
    ...tailB,
  ]
  // 盘着的两圈每圈约 36 段，穿环那个急弯也还有七八段
  g.add(tube(path, r, rope, { seg: path.length * 3, radial: 8 }))
  // 两个绳头的胶套
  for (const t of [tailA, tailB]) {
    const a = t[2]
    const b = t[3]
    const dz = b[2] - a[2]
    const dx = b[0] - a[0]
    const L = Math.hypot(dx, dz)
    g.add(rod3([b[0] - (dx / L) * 15, b[1], b[2] - (dz / L) * 15], [b[0] + (dx / L) * 1, b[1], b[2] + (dz / L) * 1], r + 0.7, sleeve, 12))
  }
  return fitGroup(g)
}

// ---------- 药球架：两片侧框、三层前低后高的斜托（每层两根横杆），上面放五只大小颜色不同、带十字缝线的药球 ----------

const MB = { w: 56, z: 14.5, h: 112, tiers: [14, 54, 92] }
function medicineBalls(p: string[]) {
  const [frame, b1, b2, b3, b4] = p
  const g = new THREE.Group()
  const hx = MB.w / 2
  for (const s of [-1, 1]) {
    const x = s * hx
    g.add(rbox(5, 2.4, MB.z * 2 + 7, frame, { x }, 0.8))
    for (const sz of [-1, 1]) g.add(rbox(3, MB.h - 2.2, 3, frame, { x, y: 2.2, z: sz * MB.z }, 0.6))
  }
  // 顶上两根横杆当提手
  for (const sz of [-1, 1]) g.add(cylX(1.3, MB.w, frame, 0, MB.h - 3, sz * MB.z, 8))
  const rr = 1.1
  const balls: [number, number, string][][] = [
    [
      [-13.5, 12, b1],
      [13.5, 12, '#45474d'],
    ],
    [
      [-12, 10.5, b2],
      [12, 10.5, b3],
    ],
    [[0, 9.5, b4]],
  ]
  MB.tiers.forEach((y, i) => {
    // 一层：两侧斜臂 + 前后两根横杆（前面低 2cm，球往里靠）
    const back: [number, number] = [-6.5, y]
    const front: [number, number] = [6.5, y - 2]
    const k = (front[1] - back[1]) / (front[0] - back[0])
    const yAt = (z: number) => back[1] + (z - back[0]) * k
    for (const s of [-1, 1]) g.add(strutBox([s * hx, yAt(-MB.z), -MB.z], [s * hx, yAt(MB.z), MB.z], 2.6, 2.6, frame))
    for (const [z, yy] of [back, front]) g.add(cylX(rr, MB.w, frame, 0, yy, z, 8))
    // 前面一根挡杆，免得球滚下来（两头直接接在前立柱上）
    g.add(cylX(0.8, MB.w, frame, 0, yAt(MB.z) + 4, MB.z, 8))
    for (const [x, R, c] of balls[i]) {
      const [cz2, cy] = restOn(back, front, R + rr)
      const seam = shade(c, c === '#45474d' ? 0.25 : -0.25)
      // 两道缝线正好压在球的经线上：球 24 × 12 段，缝线一圈 24 段，折点一一对上；缝线只露一道棱，截面三边就够
      g.add(ball(R, c, { x, y: cy, z: cz2 }, undefined, [24, 12]))
      g.add(P(noOutline(torus(R, 0.4, seam, {}, PI * 2, [3, 24])), x, cy, cz2))
      g.add(P(noOutline(torus(R, 0.4, seam, {}, PI * 2, [3, 24])), x, cy, cz2, 0, PI / 2))
    }
  })
  return fitGroup(g)
}

// ---------- 速度球（落地立式）：加重圆底座上一段弹簧接立杆，杆顶横臂往前托着圆形反弹板，板底吊着梨形速度球 ----------

function speedBag(p: string[]) {
  const [base, board, bag] = p
  const g = new THREE.Group()
  const bz = -4
  const pz = -14
  const top = 156
  // 加重底座：注水 / 砂的圆盘 + 注水口盖
  g.add(cyl(21, 22, 9, base, { z: bz }, 32))
  g.add(cyl(19.5, 21, 1.6, shade(base, 0.12), { y: 9, z: bz }, 32))
  g.add(cyl(3, 3, 1.2, DARK, { x: 10, y: 10.2, z: bz + 4 }, 14))
  // 弹簧 + 立杆
  g.add(cyl(1.6, 1.6, 20, STEEL, { y: 9, z: pz }, 10))
  const coil = helix(0, pz, 3, 0, 6, 11, 26, 10)
  g.add(tube(coil, 0.65, STEEL, { seg: 60, radial: 5 }))
  g.add(cyl(3.6, 3.6, 2, base, { y: 9.6, z: pz }, 16))
  g.add(cyl(3.6, 3.6, 2.4, base, { y: 25.6, z: pz }, 16))
  g.add(cyl(2.2, 2.2, top - 27, POLE, { y: 27.5, z: pz }, 14))
  // 杆顶横臂和反弹板
  g.add(rbox(4, 4, 25, POLE, { y: top - 2, z: (pz + 8) / 2 }, 0.8))
  g.add(cyl(20, 20, 3, board, { y: top + 1.6, z: 6 }, 32))
  g.add(cyl(18, 18.5, 0.8, shade(board, -0.12), { y: top + 1, z: 6 }, 32))
  // 转环（上半截嵌在横臂底面里）+ 梨形速度球
  g.add(P(torus(1.2, 0.4, STEEL, {}, PI * 2, [6, 12]), 0, top - 1.8, 6, 0, PI / 2))
  const prof: [number, number][] = [
    [0, 0],
    [3.4, 0.5],
    [6.4, 2.8],
    [8.4, 7],
    [9.2, 11.5],
    [9, 15.5],
    [7.8, 19],
    [5.4, 22],
    [3, 24],
    [1.6, 25.4],
    [0, 25.8],
  ]
  const bagY = top - 3 - 25.4
  g.add(latheAt(prof, bag, { y: bagY, z: 6 }, 24))
  // 最粗处一圈缝线（和球身同样 24 段）+ 顶上的系绳
  g.add(P(noOutline(torus(9.2, 0.3, shade(bag, -0.25), {}, PI * 2, [4, 24])), 0, bagY + 11.5, 6, PI / 2))
  g.add(cyl(1.8, 1.8, 1.6, shade(bag, -0.15), { y: bagY + 24.2, z: 6 }, 12))
  return fitGroup(g)
}

// ---------- 体操吊环（壁挂）：墙上一根木横梁，梁底两只吊钩，两条带扣的织带吊着两只木环 ----------

const GR_MOUNT = 150
function gymRings(p: string[]) {
  const [wood, strap, buckle] = p
  const g = new THREE.Group()
  const bt = 86
  g.add(rbox(60, 8, 10, wood, { y: bt, z: 5 }, 1.4))
  for (const s of [-1, 1]) for (const x of [-26, 26]) g.add(cylZ(0.9, 0.6, STEEL, x, bt + 4 + s * 1.8, 10.05, 10))
  for (const s of [-1, 1]) {
    const x = s * 22
    // 吊钩
    g.add(rbox(3, 1, 3, STEEL, { x, y: bt - 0.6, z: 5 }, 0.3))
    g.add(P(torus(1.4, 0.45, STEEL, {}, PI * 2, [6, 12]), x, bt - 2.4, 5))
    // 织带：主带 + 折回来的一段 + 中间的扣
    g.add(nub(3.8, bt - 2.4 - 21.5, 0.4, strap, { x, y: 21.5, z: 5 }))
    g.add(nub(3.8, 14, 0.4, strap, { x, y: 48, z: 5.6 }))
    g.add(rbox(5, 3.4, 1.6, buckle, { x, y: 60, z: 5.2 }, 0.5))
    // 木环 + 环顶包住它的一截织带
    g.add(P(torus(9, 1.5, wood, {}, PI * 2, [8, 32]), x, 10.5, 5))
    g.add(rbox(4.2, 4.2, 3.4, strap, { x, y: 18, z: 5 }, 0.8))
  }
  return fitWall(g, GR_MOUNT, 10)
}

// ---------- 健腹器（跪姿滑轨式）：落地底框上两根前高后低的弧形滑轨，轨上一只跪垫小车；-z 端两根立柱顶着带肘垫的扶手 ----------

/** 滑轨在侧视图里的高度：后端（+z）低，往前（-z）越来越陡地翘起 */
const abRail = (z: number) => 14 + 31 * Math.pow((50 - z) / 99, 2.4)
function abCoaster(p: string[]) {
  const [frame, pad, acc] = p
  const g = new THREE.Group()
  // 底框：两根落地方管 + 三根横档
  for (const s of [-1, 1]) g.add(rbox(5, 4, 116, frame, { x: s * 24 }, 1))
  for (const z of [54, 40, 0, -54]) g.add(rbox(48, 3.4, 5, frame, { y: 0.3, z }, 0.8))
  // 两根弧形滑轨 + 尾端堵头 + 支撑
  const pts: V3[] = []
  for (let k = 0; k <= 12; k++) {
    const z = 50 - (k / 12) * 99
    pts.push([0, abRail(z), z])
  }
  for (const s of [-1, 1]) {
    const x = s * 8
    g.add(tube(pts.map(([, y, z]) => [x, y, z] as V3), 1.6, STEEL, { seg: 24, radial: 8 }))
    g.add(ball(1.8, RUBBER, { x, y: abRail(50), z: 50 }))
    for (const z of [40, 0]) g.add(rbox(3, abRail(z) - 3.5, 3, frame, { x, y: 3.5, z }, 0.6))
  }
  // 立柱、前端接滑轨的横管、顶上的扶手和肘垫
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 24, 3, -52], [s * 21, 118, -44], 4.4, 4.4, frame))
    g.add(rbox(9, 4, 24, pad, { x: s * 21, y: 117, z: -36 }, 1.6))
    g.add(noOutline(box(9.4, 1, 24.4, acc, { x: s * 21, y: 118.6, z: -36 })))
    g.add(cyl(1.6, 1.6, 6, frame, { x: s * 21, y: 115, z: -24 }, 10))
    g.add(grip([s * 21, 121, -24], [s * 21, 130, -23], 2.2))
  }
  g.add(cylX(1.8, 47, frame, 0, abRail(-49), -49.3, 12))
  g.add(cylX(1.8, 42, frame, 0, 118, -44, 12))
  // 跪垫小车：底盘、侧滚轮、跪垫。整车顺着轨道在这一段的坡度前倾，四只滚轮的轴心落在轨道中线的高度上，底盘压着轨顶
  const cz = 26
  const wz = 7
  const y0 = abRail(cz + wz)
  const y1 = abRail(cz - wz)
  const car = new THREE.Group()
  car.add(rbox(22, 4, 20, DARK, { y: 1.4 }, 1))
  for (const s of [-1, 1]) for (const dz of [-wz, wz]) car.add(cylX(2, 2, RUBBER, s * 11, 0, dz, 12))
  car.add(rbox(34, 7, 28, pad, { y: 5 }, 3))
  car.add(noOutline(box(34.4, 1.2, 28.4, acc, { y: 7.8 })))
  g.add(P(car, 0, (y0 + y1) / 2, cz, Math.atan2(y1 - y0, wz * 2)))
  return fitGroup(g)
}

// ---------- 甩脂机（律动机）：扁平的机身上一块带横纹的踏台、两块脚印色块，前面一条小屏，两侧拉出带握把的弹力绳 ----------

function vibrationPlate(p: string[]) {
  const [body, deck, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.4, 2.6, 1.2, RUBBER, { x: sx * 28, z: sz * 14 }, 12))
  g.add(rbox(70, 10, 40, body, { y: 1 }, 4.5))
  // 踏台 + 防滑横纹 + 脚印色块
  g.add(rbox(58, 3.2, 32, deck, { y: 10.8 }, 1.4))
  for (let k = 0; k < 9; k++) g.add(noOutline(box(54, 0.6, 1.2, '#4a4c52', { y: 13.8, z: -12.8 + k * 3.2 })))
  for (const s of [-1, 1]) g.add(noOutline(box(13, 0.4, 19, acc, { x: s * 15, y: 14.2, z: -2 })))
  // 前面的小屏和两颗按键（按键的前沿正好到声明的进深）
  g.add(rbox(22, 4.4, 0.8, DARK, { y: 4.6, z: 19.7 }, 0.3))
  g.add(lit(box(13, 2, 0.4, SCREEN, { x: -3, y: 5.8, z: 20.25 }), SCREEN, 0.6))
  for (const x of [6, 9]) g.add(noOutline(cylZ(0.9, 0.5, acc, x, 6.8, 20.25, 10)))
  // 两侧的弹力绳：从机身侧面的挂扣拉出来，越过机身边缘，握把搁在踏台前沿
  for (const s of [-1, 1]) {
    g.add(P(torus(1.2, 0.4, STEEL, {}, PI * 2, [6, 12]), s * 35.2, 6, 6, 0, PI / 2))
    g.add(tube([[s * 35.4, 6, 7.2], [s * 36.4, 9.5, 9], [s * 32, 11.6, 11], [s * 28, 15, 12.5], [s * 16, 15.9, 13]], 0.6, acc, { seg: 20, radial: 6 }))
    g.add(cylX(1.5, 11, FOAM, s * 16, 15.9, 13, 12))
  }
  return g
}

// ---------- 跳舞毯 + 健身环：铺开的九宫格跳舞毯（上下左右四个箭头格、四角圆圈、中间菱形），右前角放一只带两只握把的健身环 ----------

function danceArt(base: string, tile: string, arrowA: string, arrowB: string) {
  return (c: CanvasRenderingContext2D, W: number, H: number) => {
    c.fillStyle = base
    c.fillRect(0, 0, W, H)
    const gap = W * 0.035
    const cell = (W - gap * 4) / 3
    // 箭头（朝上，按格子旋转）
    const arrow = (cx: number, cy: number, rot: number, col: string) => {
      c.save()
      c.translate(cx, cy)
      c.rotate(rot)
      c.fillStyle = col
      const u = cell
      c.beginPath()
      c.moveTo(0, -0.36 * u)
      c.lineTo(0.32 * u, -0.02 * u)
      c.lineTo(0.13 * u, -0.02 * u)
      c.lineTo(0.13 * u, 0.34 * u)
      c.lineTo(-0.13 * u, 0.34 * u)
      c.lineTo(-0.13 * u, -0.02 * u)
      c.lineTo(-0.32 * u, -0.02 * u)
      c.closePath()
      c.fill()
      c.restore()
    }
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) {
        const x = gap + k * (cell + gap)
        const y = gap + r * (cell + gap)
        c.fillStyle = tile
        c.beginPath()
        c.roundRect(x, y, cell, cell, cell * 0.12)
        c.fill()
        const cx = x + cell / 2
        const cy = y + cell / 2
        if (r === 1 && k === 1) {
          c.fillStyle = arrowB
          c.beginPath()
          c.moveTo(cx, cy - cell * 0.18)
          c.lineTo(cx + cell * 0.18, cy)
          c.lineTo(cx, cy + cell * 0.18)
          c.lineTo(cx - cell * 0.18, cy)
          c.fill()
        } else if ((r + k) % 2 === 1) {
          const rot = r === 0 ? 0 : r === 2 ? PI : k === 0 ? -PI / 2 : PI / 2
          arrow(cx, cy, rot, r === 1 ? arrowB : arrowA)
        } else {
          c.strokeStyle = 'rgba(255, 255, 255, 0.55)'
          c.lineWidth = cell * 0.06
          c.beginPath()
          c.arc(cx, cy, cell * 0.2, 0, PI * 2)
          c.stroke()
        }
      }
  }
}
const DP = { s: 84 }
function dancePad(p: string[]) {
  const [edge, tile, ringC] = p
  const g = new THREE.Group()
  g.add(rbox(DP.s, 1.4, DP.s, edge, {}, 0.6))
  const art = paintPanel(DP.s - 4, DP.s - 4, `ft-dance|${edge}|${tile}`, danceArt(shade(edge, -0.08), tile, '#ff5ca8', '#5ad1ff'), { y: 1.5, z: (DP.s - 4) / 2, rx: -PI / 2 })
  g.add(art)
  // 健身环：平躺在毯子右前角，前后两只握把，一只握把上插着手柄
  const rx = 20
  const rz = 19
  g.add(P(torus(17.5, 1.6, ringC), rx, 1.5 + 1.6, rz, PI / 2))
  for (const s of [-1, 1]) {
    // 握把的底压进毯面（毯子顶面 1.4，画面浮在 1.5）
    g.add(rbox(9, 3.8, 4.6, RUBBER, { x: rx, y: 1.3, z: rz + s * 17.5 }, 1.2))
    g.add(rbox(10, 1.2, 5, ringC, { x: rx, y: 4.6, z: rz + s * 17.5 }, 0.5))
  }
  g.add(rbox(3.4, 1.4, 9, '#ff5a4a', { x: rx, y: 5.6, z: rz + 17.5 }, 0.6))
  return g
}

// ---------- 跳箱三件套：三只由高到矮的软包跳箱并排成台阶，上下包边深色、中间主色，侧面一道提手槽、正面一块色标 ----------

const JB: [number, number, number][] = [
  // [宽 x, 深 z, 高]
  [61, 76, 60],
  [51, 61, 45],
  [41, 51, 30],
]
function jumpBoxes(p: string[]) {
  const [foam, band, acc] = p
  const g = new THREE.Group()
  let x = 0
  const back = -JB[0][1] / 2
  for (const [w, d, h] of JB) {
    const cx = x + w / 2
    const cz = back + d / 2
    g.add(rbox(w, h - 0.3, d, foam, { x: cx, y: 0.3, z: cz }, 3))
    // 上下两道深色包边
    g.add(rbox(w + 0.8, 6, d + 0.8, band, { x: cx, z: cz }, 2.4))
    g.add(rbox(w + 0.8, 6, d + 0.8, band, { x: cx, y: h - 5.6, z: cz }, 2.4))
    // 侧面提手槽、正面色标
    for (const s of [-1, 1]) g.add(noOutline(box(0.6, 4, 14, DARK, { x: cx + s * (w / 2 + 0.05), y: h * 0.62, z: cz })))
    g.add(noOutline(box(w * 0.36, 7, 0.6, acc, { x: cx, y: h * 0.38, z: cz + d / 2 + 0.1 })))
    x += w + 1
  }
  return fitGroup(g)
}

// ---------- 健身补给组：一罐蛋白粉、一只摇摇杯、一条卷好的毛巾、一副叠放的健身手套 ----------

function sportBottles(p: string[]) {
  const [tub, towel, shaker] = p
  const g = new THREE.Group()
  // 蛋白粉罐：罐身 + 标签带 + 粗纹罐盖
  g.add(cyl(7.5, 7.5, 15, tub, { x: -7.5, z: -4 }, 24))
  g.add(cyl(7.8, 7.8, 6.5, '#f4f4f2', { x: -7.5, y: 4, z: -4 }, 24))
  g.add(cyl(7.9, 7.9, 2.2, shade(tub, 0.15), { x: -7.5, y: 6.2, z: -4 }, 24))
  g.add(cyl(7.8, 7.8, 3.2, shade(tub, -0.12), { x: -7.5, y: 14.6, z: -4 }, 24))
  // 摇摇杯：杯身、刻度线、杯盖、翻盖嘴和提环
  const sx = 7
  const sz = -5.2
  g.add(cyl(4.3, 3.9, 16, shaker, { x: sx, z: sz }, 20))
  for (let k = 0; k < 4; k++) g.add(noOutline(box(1.6, 0.3, 0.4, '#f4f4f2', { x: sx, y: 4 + k * 2.6, z: sz + 4.1 + k * 0.04 })))
  g.add(cyl(4.6, 4.5, 4, DARK, { x: sx, y: 15.6, z: sz }, 20))
  g.add(rbox(2.6, 1.4, 3, DARK, { x: sx, y: 19.4, z: sz + 1 }, 0.5))
  g.add(P(torus(1.8, 0.45, DARK, {}, PI * 2, [6, 12]), sx, 20.2, sz - 3.2))
  // 卷好的毛巾：横躺，两端一圈圈的卷边
  const ty = 3.6
  g.add(cylX(ty, 18, towel, -6, ty, 7.5, 20))
  for (const ex of [-15.05, 3.05])
    for (const rr of [2.4, 1.2]) g.add(P(noOutline(torus(rr, 0.22, shade(towel, -0.15), {}, PI * 2, [4, rr > 2 ? 16 : 12])), ex, ty, 7.5, 0, PI / 2))
  // 健身手套：掌心 + 四根短指 + 腕带，两只叠着
  const glove = (rot: number) => {
    const o = new THREE.Group()
    o.add(rbox(7.4, 1.8, 7.6, '#3a3b40', {}, 0.8))
    for (let k = 0; k < 4; k++) o.add(rbox(1.5, 1.5, 2.6, '#3a3b40', { x: -2.6 + k * 1.75, y: 0.1, z: 4.6 }, 0.6))
    o.add(rbox(7.8, 2.2, 2.6, shaker, { y: -0.2, z: -3.6 }, 0.6))
    o.rotation.y = rot
    return o
  }
  g.add(P(glove(0.2), 10.5, 0.2, 5.5))
  g.add(P(glove(-0.3), 10.5, 2, 5.2, 0, -0.3))
  return fitGroup(g)
}

// ---------- 健身镜（落地）：底座上立着全身镜大小的竖屏，屏上是发光的教练剪影、三圈运动圆环和几条进度条 ----------

function mirrorArt(acc: string) {
  return (c: CanvasRenderingContext2D, W: number, H: number) => {
    const grd = c.createLinearGradient(0, 0, W, H)
    grd.addColorStop(0, '#2a3242')
    grd.addColorStop(0.5, '#151a24')
    grd.addColorStop(1, '#232a38')
    c.fillStyle = grd
    c.fillRect(0, 0, W, H)
    // 镜面的斜向反光
    c.fillStyle = 'rgba(255, 255, 255, 0.05)'
    c.beginPath()
    c.moveTo(W * 0.1, 0)
    c.lineTo(W * 0.35, 0)
    c.lineTo(W * 0.0, H * 0.3)
    c.lineTo(0, H * 0.12)
    c.fill()
    // 教练剪影：头、躯干、举起的双臂、分开的双腿
    const fig = 'rgba(214, 226, 242, 0.9)'
    c.fillStyle = fig
    c.strokeStyle = fig
    c.lineCap = 'round'
    c.beginPath()
    c.arc(W * 0.5, H * 0.24, W * 0.075, 0, PI * 2)
    c.fill()
    c.lineWidth = W * 0.13
    c.beginPath()
    c.moveTo(W * 0.5, H * 0.33)
    c.lineTo(W * 0.5, H * 0.53)
    c.stroke()
    c.lineWidth = W * 0.055
    c.beginPath()
    c.moveTo(W * 0.44, H * 0.34)
    c.lineTo(W * 0.3, H * 0.27)
    c.lineTo(W * 0.24, H * 0.17)
    c.moveTo(W * 0.56, H * 0.34)
    c.lineTo(W * 0.7, H * 0.27)
    c.lineTo(W * 0.76, H * 0.17)
    c.stroke()
    c.lineWidth = W * 0.07
    c.beginPath()
    c.moveTo(W * 0.46, H * 0.55)
    c.lineTo(W * 0.36, H * 0.7)
    c.lineTo(W * 0.33, H * 0.84)
    c.moveTo(W * 0.54, H * 0.55)
    c.lineTo(W * 0.64, H * 0.7)
    c.lineTo(W * 0.67, H * 0.84)
    c.stroke()
    // 三圈运动圆环（底圈暗、上面亮一段）
    const cx = W * 0.82
    const cy = H * 0.07
    ;[
      [0.12, acc, 0.8],
      [0.088, '#7dff9a', 0.62],
      [0.056, '#5ad1ff', 0.45],
    ].forEach(([r, col, f]) => {
      const rad = W * (r as number)
      c.lineWidth = W * 0.026
      c.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      c.beginPath()
      c.arc(cx, cy, rad, 0, PI * 2)
      c.stroke()
      c.strokeStyle = col as string
      c.beginPath()
      c.arc(cx, cy, rad, -PI / 2, -PI / 2 + PI * 2 * (f as number))
      c.stroke()
    })
    // 左上的心率点、底部的进度条
    c.fillStyle = acc
    c.beginPath()
    c.arc(W * 0.12, H * 0.06, W * 0.035, 0, PI * 2)
    c.fill()
    for (let k = 0; k < 3; k++) {
      c.fillStyle = 'rgba(255, 255, 255, 0.18)'
      c.fillRect(W * 0.12, H * (0.9 + k * 0.03), W * 0.76, H * 0.012)
      c.fillStyle = k === 0 ? acc : 'rgba(255, 255, 255, 0.7)'
      c.fillRect(W * 0.12, H * (0.9 + k * 0.03), W * 0.76 * [0.7, 0.45, 0.25][k], H * 0.012)
    }
  }
}
function smartMirror(p: string[]) {
  const [frame, base, acc] = p
  const g = new THREE.Group()
  // 底座：一块圆角厚板，后面多出一截压稳
  g.add(rbox(48, 6, 26, base, { z: -2 }, 2))
  // 竖屏：外框 + 发光画面 + 屏下的扬声器缝
  const pz = -10
  g.add(rbox(60, 168.4, 4, frame, { y: 5.6, z: pz }, 1.6))
  g.add(paintPanel(54, 154, `ft-mirror|${acc}`, mirrorArt(acc), { y: 15, z: pz + 2.1 }, 0.8))
  g.add(noOutline(box(30, 1.4, 0.4, DARK, { y: 10, z: pz + 2.1 })))
  g.add(noOutline(box(1.6, 1.6, 0.4, acc, { x: 24, y: 9.9, z: pz + 2.1 })))
  // 背面的主机盒
  g.add(rbox(30, 40, 2, shade(frame, 0.08), { y: 24, z: pz - 2.8 }, 0.8))
  // 竖屏偏在底座后沿上：按包围盒前后居中，底座不超出声明的占地
  return fitGroup(g)
}

// ---------- 配色 ----------

const TR_PALS: Pal[] = [
  ['modern', [M.black, '#3f7fd8', RUBBER]],
  ['modern', [M.char, '#e8483f', RUBBER]],
  ['industrial', [I.iron, I.rust, I.leather]],
  ['cute', [C.white, C.pink, C.sky]],
]
const ST_PALS: Pal[] = [
  ['modern', [M.char, '#3d3f44', '#e8483f']],
  ['modern', [M.white, '#5b5d66', '#3f7fd8']],
  ['industrial', [I.iron, '#46474d', I.rust]],
  ['cute', [C.white, C.sky, C.pink]],
]
const PT_PALS: Pal[] = [
  ['modern', [M.black, '#2b2c31', '#e8483f']],
  ['modern', [M.silver, '#2b2c31', '#3f7fd8']],
  ['industrial', [I.iron, '#4a2f22', I.rust]],
  ['nordic', [N.white, '#3d3f44', N.sage]],
]
const SB_PALS: Pal[] = [
  ['modern', [M.black, '#2b2c31', '#e8483f']],
  ['modern', [M.silver, '#3a3b42', '#f2c230']],
  ['industrial', [I.iron, '#5a3826', I.rust]],
  ['cute', [C.white, '#5b5d66', C.pink]],
]
const RB_PALS: Pal[] = [
  ['modern', [M.char, '#2b2c31', '#3f7fd8']],
  ['modern', [M.white, '#3a3b42', '#e8483f']],
  ['industrial', [I.iron, '#5a3826', I.rust]],
  ['nordic', [N.white, '#5b6068', N.sage]],
]
const WB_PALS: Pal[] = [
  ['nordic', [N.oak, M.silver]],
  ['japanese', [J.hinoki, M.char]],
  ['industrial', [I.walnut, I.iron]],
  ['farmhouse', ['#c79a68', '#3c3a38']],
]
const WD_PALS: Pal[] = [
  ['chinese', ['#6b3a2a', '#9a5a36', '#5a3b2a']],
  ['chinese', ['#5a3b2a', '#c08a52', '#6b3a2a']],
  ['japanese', [J.dark, J.wood, J.dark]],
  ['industrial', [I.iron, I.walnut, '#4a3326']],
]
const BB_PALS: Pal[] = [
  ['nordic', [M.silver, N.oak]],
  ['modern', [M.black, '#c79a68']],
  ['classic', ['#c8a96a', '#9a7656']],
  ['japanese', [M.char, J.hinoki]],
]
const PM_PALS: Pal[] = [
  ['modern', ['#3f8f4a', M.char, '#e8483f']],
  ['modern', ['#4c9e57', M.white, '#3f7fd8']],
  ['nordic', ['#5f9a6a', N.oak, N.mustard]],
  ['retro', ['#3f8a55', R.cream, R.red]],
]
const HB_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, '#e8483f']],
  ['japanese', [J.hinoki, J.dark, J.ai]],
  ['industrial', [I.walnut, I.iron, I.rust]],
  ['cute', [C.woodL, C.mint, C.pink]],
]
const BR_PALS: Pal[] = [
  ['modern', ['#3a3b40', '#e8483f', M.black]],
  ['industrial', ['#6b5a46', RUBBER, I.iron]],
  ['modern', ['#2f5c8f', RUBBER, M.char]],
  ['farmhouse', ['#c8b48a', '#34465e', '#3c3a38']],
]
const MB_PALS: Pal[] = [
  ['modern', [M.black, '#e8483f', '#3f7fd8', '#f2c230', '#4f9e5b']],
  ['industrial', [I.iron, I.rust, '#6b7a5a', I.leather, '#c9a25a']],
  ['cute', [C.white, C.pink, C.sky, C.lemon, C.mint]],
  ['modern', [M.silver, '#7a5cff', '#36d1c4', '#ff8fb4', '#f2c230']],
]
const SP_PALS: Pal[] = [
  ['modern', [M.char, '#c79a68', '#e8483f']],
  ['industrial', [I.iron, I.walnut, I.leather]],
  ['retro', [R.red, R.caramel, R.cream]],
  ['modern', [M.white, '#9a7656', '#2b2c31']],
]
const GR_PALS: Pal[] = [
  ['nordic', [N.oak, '#2b2c31', M.silver]],
  ['japanese', [J.wood, J.ai, M.silver]],
  ['industrial', [I.walnut, '#4f5a3a', I.iron]],
  ['retro', [R.caramel, R.red, '#d9b45a']],
]
const AB_PALS: Pal[] = [
  ['modern', [M.black, '#2b2c31', '#e8483f']],
  ['modern', [M.silver, '#3a3b42', '#3f7fd8']],
  ['industrial', [I.iron, '#5a3826', I.rust]],
  ['cute', [C.white, '#5b5d66', C.pink]],
]
const VP_PALS: Pal[] = [
  ['modern', [M.white, '#3a3b42', '#3f7fd8']],
  ['modern', [M.black, '#2b2c31', '#e8483f']],
  ['cute', [C.pink, '#5b5d66', C.white]],
  ['nordic', [N.linen, '#55585e', N.sage]],
]
const DP_PALS: Pal[] = [
  ['modern', ['#3a3d4a', '#2a2d38', '#e8483f']],
  ['cute', [C.lilac, '#4a3f66', C.mint]],
  ['retro', [R.teal, '#1f3f3c', R.orange]],
  ['modern', ['#d9dbe0', '#3a3d4a', '#3f7fd8']],
]
const JX_PALS: Pal[] = [
  ['modern', ['#d8483f', M.black, M.white]],
  ['modern', ['#3f7fd8', '#2b2c31', '#f2c230']],
  ['industrial', ['#6b7a5a', I.iron, I.rust]],
  ['cute', [C.pink, '#5b5d66', C.white]],
]
const SU_PALS: Pal[] = [
  ['modern', [M.black, C.white, '#e8483f']],
  ['modern', ['#3f7fd8', M.light, '#36d1c4']],
  ['cute', [C.pink, C.mint, C.sky]],
  ['industrial', [I.iron, '#c8b48a', I.rust]],
]
const SM_PALS: Pal[] = [
  ['modern', [M.black, M.char, '#ff5a4a']],
  ['modern', [M.silver, M.white, '#3f7fd8']],
  ['nordic', [N.white, N.oak, N.sage]],
  ['classic', ['#c8a96a', '#9a7656', '#ff8fb4']],
]

const GEAR: Partial<AssetDef> = { tags: ['sports-gear'] }

export const FITNESS_MORE: AssetDef[] = [
  define('ft-mini-trampoline', '健身小蹦床', 'fitness', [103, 112, 118.4], TR_PALS, miniTrampoline, { ...GEAR, type: 'cardio', mats: ['metal', 'fabric', 'plastic'] }),
  define('ft-stepper', '踏步机', 'fitness', [37, 44, 114], ST_PALS, stepper, { ...GEAR, type: 'cardio', mats: ['metal', 'plastic', 'plastic'] }),
  define('ft-power-tower', '引体向上双杠架', 'fitness', [104, 120, 208], PT_PALS, powerTower, { ...GEAR, type: 'strength', mats: ['metal', 'leather', 'plastic'] }),
  define('ft-situp-board', '仰卧板', 'fitness', [44, 118, 63], SB_PALS, situpBoard, { ...GEAR, type: 'strength', mats: ['metal', 'leather', 'plastic'] }),
  define('ft-recumbent-bike', '卧式健身车', 'fitness', [63, 131, 97.5], RB_PALS, recumbentBike, { ...GEAR, type: 'cardio', mats: ['plastic', 'leather', 'plastic'] }),
  define('ft-wall-bars', '肋木架', 'fitness', [WB.w + 1, WB.d, WB.h], WB_PALS, wallBars, { ...GEAR, type: 'strength', mats: ['wood', 'metal'] }),
  define('ft-wooden-dummy', '木人桩', 'fitness', [62, 70, 160], WD_PALS, woodenDummy, { type: 'sports-gear', mats: ['wood', 'wood', 'wood'] }),
  define('ft-ballet-barre', '芭蕾把杆', 'fitness', [BB.w, BB.d - 2, BB.h], BB_PALS, balletBarre, { type: 'sports-gear', mats: ['metal', 'wood'] }),
  define('ft-putting-mat', '高尔夫推杆练习毯', 'fitness', [42, 247, 91], PM_PALS, puttingMat, { type: 'sports-gear', tags: ['hobby:sports'], mats: ['pile', 'plastic', 'plastic'] }),
  define('ft-hangboard', '攀岩指力板', 'fitness', [62, 11.4, 44], HB_PALS, hangboard, { type: 'sports-gear', tags: ['hobby:outdoor'], mount: HB_MOUNT, mats: ['wood', 'wood', 'fabric'] }),
  define('ft-battle-rope', '战绳', 'fitness', [61, 78, 26], BR_PALS, battleRope, { type: 'sports-gear', mats: ['fabric', 'plastic', 'metal'] }),
  define('ft-medicine-balls', '药球架', 'fitness', [61, 36, 112], MB_PALS, medicineBalls, { ...GEAR, type: 'weights', mats: ['metal', 'plastic', 'plastic', 'plastic', 'plastic'] }),
  define('ft-speed-bag', '速度球', 'fitness', [44, 52, 160.6], SP_PALS, speedBag, { type: 'sports-gear', mats: ['plastic', 'wood', 'leather'] }),
  define('ft-gym-rings', '体操吊环', 'fitness', [65, 10.3, 94], GR_PALS, gymRings, { type: 'sports-gear', mount: GR_MOUNT, mats: ['wood', 'fabric', 'metal'] }),
  define('ft-ab-coaster', '健腹器', 'fitness', [53, 116, 130], AB_PALS, abCoaster, { ...GEAR, type: 'strength', mats: ['metal', 'leather', 'plastic'] }),
  define('ft-vibration-plate', '甩脂机', 'fitness', [74, 41, 17.4], VP_PALS, vibrationPlate, { ...GEAR, type: 'cardio', mats: ['plastic', 'plastic', 'plastic'] }),
  define('ft-dance-pad', '跳舞毯 + 健身环', 'fitness', [DP.s, DP.s, 7], DP_PALS, dancePad, { type: 'video-game', tags: ['hobby:gaming'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('ft-jump-box', '跳箱（三件套）', 'fitness', [156, 77, 60.4], JX_PALS, jumpBoxes, { ...GEAR, type: 'strength', mats: ['fabric', 'fabric', 'fabric'] }),
  define('ft-sport-bottles', '健身补给组', 'fitness', [31, 24, 22.5], SU_PALS, sportBottles, { ...PROP, type: 'sports-gear', mats: ['plastic', 'fabric', 'plastic'] }),
  define('ft-smart-mirror', '健身镜', 'fitness', [60, 26, 174], SM_PALS, smartMirror, { type: 'sports-gear', mats: ['metal', 'metal'] }),
]
