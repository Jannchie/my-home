// 生活小电器、个护电器、居家办公补充（id 前缀 gz-）：塔扇、无叶风扇、循环扇、被褥干燥机、厨余处理机、台面净水器、
// 电动牙刷套装、卷发棒与直发夹、筋膜枪、足浴盆、插线板、理线盒、带屏智能音箱、落地白板、数位屏、绘图桌、
// 双筒望远镜、遥控越野车、裁缝人台、线轴架。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。都不声明 surface（绘图桌的斜面放不了东西），build 末尾 fitGroup 居中落地。

import * as THREE from 'three'
import { ball, cup, cyl, markWater, puck, rbox, shade, torus, tray } from '../toon'
import { C, paintPanel, shell, type AssetDef } from '../kit'
import { batten, cylX, cylZ, dist, fitGroup, G, ghost, latheAt, lit, noOutline, P, PI, rod3, sideSlab, strutBox, tiltFrame, tube, UP, type V2, type V3 } from '../geo'
import { CL, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const DARK = '#26272c'
const GRILLE = '#3a3c42'
const RUBBER = '#2e2f33'
const STEEL = '#c3c7cc'
const SCREEN = '#1d2027'
const GLASS = '#cfe8f5'
const WATER = '#8fcfe8'
const WHITE = '#f4f4f2'
const LED_BLUE = '#8fe0ff'
const LED_GREEN = '#7fe39a'

// ---------- 小工具 ----------

/** 两点之间的螺旋弹簧：半径 r、圈数 turns、钢丝粗 wire */
function coil(a: V3, b: V3, r: number, turns: number, wire: number, color: string) {
  const len = dist(a, b)
  const n = Math.round(turns * 8)
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ang = t * turns * PI * 2
    pts.push([Math.cos(ang) * r, t * len, Math.sin(ang) * r])
  }
  const holder = new THREE.Group()
  holder.add(tube(pts, wire, color, { seg: n * 2, radial: 4 }))
  const va = new THREE.Vector3(...a)
  holder.position.copy(va)
  holder.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...b).sub(va).normalize())
  return holder
}

// ---------- 塔扇：圆底座 + 细高的圆柱机身，正面一条竖向出风格栅，顶部一圈按键和一块小屏 ----------

const TF = { w: 30, d: 30, h: 105 }
function towerFan(p: string[]) {
  const [body, accent, base] = p
  const g = new THREE.Group()
  // 底座和细颈
  g.add(puck(14.5, 3.6, base))
  g.add(cyl(4.6, 5.6, 2.8, base, { y: 3.4 }, 20))
  // 机身 + 顶盖
  g.add(cyl(6.5, 6.5, 96.8, body, { y: 6 }, 28))
  g.add(cyl(6.1, 6.5, 1.6, base, { y: 102.6 }, 28))
  // 顶面：后半圈五颗按键 + 前面一块发光小屏
  for (let k = 0; k < 5; k++) {
    const a = PI * 0.62 + (k / 4) * PI * 0.76
    g.add(cyl(0.65, 0.65, 0.5, accent, { x: Math.sin(a) * 4, y: 104, z: Math.cos(a) * 4 }, 10))
  }
  g.add(lit(rbox(3.6, 0.5, 1.8, LED_BLUE, { y: 103.9, z: 2.6 }, 0.2), LED_BLUE, 0.7))
  // 正面出风口：深色格栅底 + 一排竖条
  g.add(rbox(7.2, 72, 1.8, GRILLE, { y: 24, z: 5.85 }, 0.5))
  for (let i = 0; i < 7; i++) g.add(rbox(0.5, 70, 0.4, body, { x: -2.7 + i * 0.9, y: 25, z: 7 }, 0.15))
  // 背面进风口：横条格栅
  g.add(rbox(6, 26, 1.8, GRILLE, { y: 14, z: -5.85 }, 0.5))
  for (let i = 0; i < 5; i++) g.add(rbox(5.4, 0.5, 0.4, body, { y: 16 + i * 5, z: -7 }, 0.15))
  return fitGroup(g)
}

// ---------- 无叶落地扇：圆柱底座（下部一圈进风孔）上立着一只细长的椭圆环 ----------

const BF = { w: 22, d: 22, h: 105 }
function bladelessFan(p: string[]) {
  const [body, base, accent] = p
  const g = new THREE.Group()
  g.add(puck(11, 2.4, base))
  g.add(cyl(6.3, 6.6, 39, body, { y: 2 }, 28))
  // 进风孔：一圈竖向的深色长孔
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * PI * 2
    g.add(P(rbox(1, 16, 0.7, GRILLE, {}, 0.25), Math.sin(a) * 6.35, 19, Math.cos(a) * 6.35, 0, a, 0))
  }
  // 顶上的接口环
  g.add(cyl(5.6, 6.3, 1.4, accent, { y: 40.6 }, 28))
  // 椭圆出风环：截面前后拉长（像机翼）
  const pts: V3[] = []
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * PI * 2
    pts.push([Math.cos(t) * 7.2, 73.3 + Math.sin(t) * 29.5, 0])
  }
  const ring = tube(pts, 2.1, body, { closed: true, seg: 96, radial: 10 })
  ring.scale.z = 1.7
  g.add(ring)
  // 底座正面：小屏 + 电源键
  g.add(lit(rbox(2.8, 1.4, 0.5, LED_BLUE, { y: 33, z: 6.45 }, 0.2), LED_BLUE, 0.7))
  g.add(cylZ(0.6, 0.5, accent, 0, 30.4, 6.5, 12))
  return fitGroup(g)
}

// ---------- 空气循环扇：短粗的筒形风扇头（螺旋格栅），架在 U 形支架和圆底座上，头略微上仰 ----------

const CF = { w: 28, d: 24, h: 36 }
function circulator(p: string[]) {
  const [body, sub, accent] = p
  const g = new THREE.Group()
  // 底座 + 转轴座 + U 形支架
  g.add(puck(12, 3.4, body))
  g.add(cyl(3, 3.5, 2.6, sub, { y: 3.2 }, 16))
  g.add(rbox(26.8, 1.8, 3.2, sub, { y: 5.8 }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox(1.6, 20, 3.2, sub, { x: s * 12.6, y: 5.8 }, 0.6))
    g.add(cylX(1.8, 0.8, accent, s * 13.8, 24, 0, 14))
  }
  // 底座正面：旋钮 + 指示灯
  g.add(cylZ(1.3, 1, sub, 5, 1.8, 11.1, 14))
  g.add(lit(ball(0.4, LED_GREEN, { x: -5, y: 1.9, z: 10.75 }), LED_GREEN, 0.8))
  // 风扇头（局部 z 朝前）：后封的筒身、扇叶、螺旋格栅
  const h = new THREE.Group()
  h.add(cup(10.5, 10, 12, 1, body, { rx: PI / 2, z: -6 }))
  h.add(cylZ(3, 0.8, sub, 0, 0, -6.2, 18))
  for (const s of [-1, 1]) h.add(cylX(1.2, 3, sub, s * 11.5, 0, 0, 12))
  // 扇叶：五片压扁的椭球 + 中心毂
  h.add(ball(2, accent, { z: 2 }))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2
    h.add(P(ball(4, accent, {}, [1, 0.45, 0.12]), Math.cos(a) * 5, Math.sin(a) * 5, 1.6, 0, 0.25, a))
  }
  // 格栅：外圈 + 两道同心圈 + 12 根螺旋辐条（中间往前鼓）+ 中心标牌
  h.add(torus(10.2, 0.55, sub, { z: 6.2 }))
  const domeZ = (r: number) => 6.4 + 0.8 * (1 - (r - 2.2) / 7.8)
  for (const r of [5, 7.8]) h.add(torus(r, 0.22, sub, { z: domeZ(r) }))
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * PI * 2
    const pts: V3[] = []
    for (let i = 0; i <= 6; i++) {
      const r = 2.2 + (7.8 * i) / 6
      const a = a0 + (0.9 * i) / 6
      pts.push([Math.cos(a) * r, Math.sin(a) * r, domeZ(r)])
    }
    h.add(tube(pts, 0.22, sub, { seg: 10, radial: 4 }))
  }
  h.add(cylZ(2.4, 1, accent, 0, 0, 7, 18))
  h.position.set(0, 24, 0)
  h.rotation.x = -0.26
  g.add(h)
  return fitGroup(g)
}

// ---------- 被褥干燥机：小方机身、顶部提手，侧面伸出一根软管接一只扁平出风嘴 ----------

const FD = { w: 34, d: 16, h: 34 }
function futonDryer(p: string[]) {
  const [body, sub, accent] = p
  const g = new THREE.Group()
  g.add(rbox(26, 27, 15, body, { x: 0 }, 3.5))
  // 顶部提手（半圆环，两端插进机身）
  g.add(torus(6, 1.1, sub, { y: 26.5 }, PI))
  // 正面操作区：面板、旋钮、两颗指示灯；下面一排出风百叶
  g.add(rbox(16, 7, 0.8, sub, { y: 17, z: 7.45 }, 0.4))
  g.add(cylZ(2, 1, accent, -4, 20.5, 8.2, 18))
  for (const [x, c] of [
    [2.5, LED_GREEN],
    [5, '#ffb347'],
  ] as [number, string][])
    g.add(lit(rbox(1.4, 1.4, 0.4, c, { x, y: 19.8, z: 8 }, 0.2), c, 0.8))
  for (let i = 0; i < 5; i++) g.add(rbox(14, 0.6, 0.6, GRILLE, { y: 4 + i * 1.6, z: 7.5 }, 0.2))
  // 背面进风口：方形格栅
  g.add(rbox(14, 12, 0.8, GRILLE, { y: 8, z: -7.45 }, 0.4))
  for (let i = 0; i < 5; i++) g.add(rbox(12.6, 0.5, 0.4, body, { y: 9.2 + i * 2.2, z: -7.95 }, 0.15))
  // 软管：侧面接口 → 往外弯下来 → 插进地上的出风嘴
  g.add(cylX(2.4, 1.6, sub, 13.4, 13, 0, 18))
  g.add(
    tube(
      [
        [12.5, 13, 0],
        [15.5, 13, 0],
        [18, 11, -1],
        [18.6, 6, -3],
        [18.6, 2.4, -4.8],
      ],
      1.6,
      sub,
      { seg: 30, radial: 10 },
    ),
  )
  // 扁平出风嘴 + 顶面出风缝
  g.add(rbox(5, 2.2, 13, sub, { x: 18.6 }, 0.8))
  for (let i = 0; i < 4; i++) g.add(rbox(3.6, 0.6, 0.7, GRILLE, { x: 18.6, y: 1.9, z: -0.6 + i * 1.8 }, 0.2))
  return fitGroup(g)
}

// ---------- 厨余处理机：圆角方筒机身、顶部翻盖（后面一根铰链），正面一条指示灯和三颗按键 ----------

const FC = { w: 28, d: 38, h: 36 }
function foodComposter(p: string[]) {
  const [body, lid, accent] = p
  const g = new THREE.Group()
  g.add(rbox(28, 31.5, 36, body, {}, 5))
  // 翻盖 + 前沿拉手 + 后面的铰链
  g.add(rbox(27.2, 4.4, 35.2, lid, { y: 31.3 }, 3.5))
  g.add(rbox(9, 1.4, 1.6, lid, { y: 31.5, z: 17.8 }, 0.5))
  g.add(cylX(1, 20, GRILLE, 0, 32.5, -18, 12))
  // 正面面板：指示灯条 + 三颗按键
  g.add(rbox(16, 6, 0.8, GRILLE, { y: 22.5, z: 18.15 }, 0.4))
  g.add(lit(rbox(12, 0.8, 0.5, accent, { y: 26.6, z: 18.7 }, 0.2), accent, 0.8))
  for (const x of [-4, 0, 4]) g.add(cylZ(0.9, 0.6, WHITE, x, 24.3, 18.7, 12))
  // 背面：散热格栅 + 电源线接口
  for (let i = 0; i < 4; i++) g.add(rbox(16, 0.6, 0.6, GRILLE, { y: 8 + i * 1.8, z: -18 }, 0.2))
  g.add(cylZ(1.2, 1.2, GRILLE, 9, 5, -18.2, 12))
  return fitGroup(g)
}

// ---------- 台面净水器：竖长机身，正面触控面板和出水嘴，下方接水托盘上放着一只盛水的玻璃杯 ----------

const WP = { w: 18, d: 38, h: 40 }
function waterPurifier(p: string[]) {
  const [body, sub] = p
  const g = new THREE.Group()
  g.add(rbox(18, 40, 30, body, { z: -4 }, 3))
  // 顶上的加水盖
  g.add(rbox(14.5, 0.8, 24, sub, { y: 39.6, z: -4 }, 0.4))
  // 侧面水位窗
  g.add(noOutline(rbox(0.6, 14, 4, WATER, { x: 9.1, y: 10, z: -10 }, 0.2)))
  // 触控面板：深色玻璃 + 发光的圆形图标和三条温度指示
  g.add(rbox(13, 9, 0.8, SCREEN, { y: 27, z: 11.15 }, 0.4))
  g.add(lit(cylZ(1.1, 0.3, LED_BLUE, 0, 32.4, 11.65, 16), LED_BLUE, 0.8))
  for (const [x, c] of [
    [-4, LED_BLUE],
    [0, WHITE],
    [4, '#ff8a6a'],
  ] as [number, string][])
    g.add(lit(rbox(2.4, 0.7, 0.3, c, { x, y: 28.6, z: 11.6 }, 0.1), c, 0.8))
  // 出水嘴
  g.add(rbox(4, 3, 7, sub, { y: 21, z: 13.5 }, 1))
  g.add(cyl(0.8, 0.9, 1.6, STEEL, { y: 19.6, z: 15.5 }, 12))
  // 接水托盘：浅盘 + 格栅
  g.add(tray(16, 1.4, 9, 0.6, sub, { z: 15 }))
  for (let i = 0; i < 4; i++) g.add(rbox(14.6, 0.4, 0.5, GRILLE, { y: 0.6, z: 12 + i * 2 }, 0.15))
  // 玻璃杯和里面的水
  g.add(ghost(cup(2.9, 2.5, 9, 0.25, GLASS, { y: 1, z: 15 }), GLASS, 0.35))
  g.add(ghost(cyl(2.55, 2.35, 6, WATER, { y: 1.3, z: 15 }, 20), WATER, 0.5))
  return fitGroup(g)
}

// ---------- 电动牙刷套装：托盘上一台充电座立着电动牙刷，两只替换刷头，旁边一台冲牙器（水箱 + 手柄 + 软管） ----------

const TB = { w: 22, d: 10, h: 24 }
function toothbrushSet(p: string[]) {
  const [base, dev, accent] = p
  const g = new THREE.Group()
  g.add(rbox(22, 1.4, 10, base, {}, 0.6))
  // 电动牙刷：充电座、手柄（色环 + 按键）、细颈、刷头
  const bx = -8
  g.add(cyl(2.3, 2.5, 2.4, dev, { x: bx, y: 1.4 }, 18))
  g.add(cyl(1.35, 1.45, 14.5, dev, { x: bx, y: 3.6 }, 16))
  g.add(cyl(1.5, 1.5, 0.6, accent, { x: bx, y: 15.4 }, 16))
  g.add(noOutline(rbox(0.9, 1.6, 0.4, accent, { x: bx, y: 10, z: 1.4 }, 0.15)))
  g.add(cyl(0.45, 0.75, 4.2, WHITE, { x: bx, y: 18 }, 10))
  g.add(rbox(1, 2.4, 1.2, WHITE, { x: bx, y: 21.4 }, 0.4))
  g.add(rbox(0.8, 1.8, 0.9, '#9fd8f0', { x: bx, y: 21.7, z: 0.9 }, 0.2))
  // 两只替换刷头（立在小插座上，刷毛颜色不同）
  for (const [x, c] of [
    [-3.5, accent],
    [-1, '#ffd27a'],
  ] as [number, string][]) {
    g.add(cyl(1, 1.1, 1.2, dev, { x, y: 1.4 }, 12))
    g.add(cyl(0.45, 0.7, 3.5, WHITE, { x, y: 2.6 }, 10))
    g.add(rbox(0.9, 2.2, 1.1, WHITE, { x, y: 5.6 }, 0.35))
    g.add(rbox(0.7, 1.6, 0.8, c, { x, y: 5.9, z: 0.8 }, 0.2))
  }
  // 冲牙器：主机、半透明水箱（里面有水）、箱盖、立在前面卡座里的手柄和喷嘴
  const fx = 5.5
  g.add(rbox(9, 4.5, 8.4, dev, { x: fx, y: 1.4 }, 1.2))
  g.add(ghost(rbox(8.4, 8.5, 5, GLASS, { x: fx, y: 5.9, z: -1.5 }, 1), GLASS, 0.35))
  g.add(ghost(rbox(7.6, 6, 4.2, WATER, { x: fx, y: 6.1, z: -1.5 }, 0.8), WATER, 0.5))
  g.add(rbox(8.6, 0.8, 5.2, dev, { x: fx, y: 14.3, z: -1.5 }, 0.4))
  g.add(cyl(1.25, 1.3, 11, dev, { x: fx, y: 5.9, z: 2.6 }, 16))
  g.add(cyl(0.7, 0.9, 1, accent, { x: fx, y: 16.6, z: 2.6 }, 12))
  g.add(cyl(0.25, 0.4, 5, WHITE, { x: fx, y: 17.4, z: 2.6 }, 8))
  // 主机正面的按键和灯
  g.add(cylZ(0.6, 0.5, accent, fx - 1.6, 3.4, 4.35, 12))
  g.add(lit(ball(0.35, LED_GREEN, { x: fx + 1.6, y: 3.4, z: 4.3 }), LED_GREEN, 0.8))
  // 软管：主机侧面 → 绕到手柄底部
  g.add(
    tube(
      [
        [9.6, 3, 2],
        [10.8, 3.6, 4.2],
        [9, 6, 4.6],
        [6.6, 7.6, 3.6],
      ],
      0.35,
      WHITE,
      { seg: 16, radial: 6 },
    ),
  )
  return fitGroup(g)
}

// ---------- 卷发棒与直发夹：隔热垫上一支卷发棒、一把微微张开的直发夹，电线绕到垫子后角盘成一卷 ----------

const HT = { w: 34, d: 16, h: 5 }
function hairTools(p: string[]) {
  const [mat, dev, accent] = p
  const g = new THREE.Group()
  g.add(rbox(32, 0.5, 15, mat, {}, 0.25))
  // 卷发棒（沿 x 横放）：尾端旋转头、手柄、前环、发热棒、隔热尖头、夹片和压杆
  const cz = -2.5
  const cy = 2.1
  g.add(cylX(0.9, 2, accent, -15.5, cy, cz, 12))
  g.add(cylX(1.6, 11, dev, -9, cy, cz, 16))
  g.add(cylX(1.8, 1, accent, -3, cy, cz, 16))
  g.add(cylX(1.1, 13, STEEL, 4, cy, cz, 16))
  g.add(cylX(0.9, 1.6, DARK, 11.3, cy, cz, 12))
  g.add(rbox(11, 0.6, 2.4, dev, { x: 4.2, y: cy + 1.1, z: cz }, 0.25))
  g.add(cylZ(0.5, 2.6, accent, -2.2, cy + 1.3, cz, 10))
  g.add(P(rbox(3.2, 0.5, 1.4, dev, {}, 0.2), -4, cy + 1.9, cz, 0, 0, -0.3))
  // 直发夹（叠着横放）：下臂贴垫，上臂从铰链处微微张开，内侧是陶瓷夹板
  const fz = 3.8
  g.add(rbox(22, 1.4, 2.8, dev, { x: -1, y: 0.5, z: fz }, 0.6))
  g.add(rbox(9, 0.3, 2.2, '#d9d4cc', { x: 5, y: 1.9, z: fz }, 0.1))
  const top = G(rbox(22, 1.4, 2.8, dev, { x: 11 }, 0.6), rbox(9, 0.3, 2.2, '#d9d4cc', { x: 17, y: -0.3 }, 0.1))
  top.add(lit(rbox(1.6, 0.3, 0.8, accent, { x: 4, y: 1.4 }, 0.1), accent, 0.7))
  g.add(P(top, -12, 2.3, fz, 0, 0, 0.07))
  g.add(cylZ(1.1, 3, accent, -11.2, 2.1, fz, 14))
  // 电线：两根都从左端出来，沿着垫子前后沿绕到右后角，盘成一卷
  const cord = '#3a3b40'
  g.add(
    tube(
      [
        [-16.4, cy, cz],
        [-17.2, 0.9, -4.5],
        [-14, 0.85, -6.2],
        [0, 0.85, -6.3],
        [11, 0.85, -6.1],
        [12.4, 1.1, -5.6],
      ],
      0.35,
      cord,
      { seg: 36, radial: 6 },
    ),
  )
  g.add(
    tube(
      [
        [-12.4, 2.1, fz],
        [-14.6, 0.85, 5.6],
        [-8, 0.85, 6.6],
        [6, 0.85, 6.6],
        [12.4, 0.85, 6.2],
        [14.6, 0.85, 3.6],
        [14.6, 0.85, -1],
        [14, 1.1, -4.4],
      ],
      0.35,
      cord,
      { seg: 44, radial: 6 },
    ),
  )
  for (const y of [0.85, 1.5]) g.add(torus(1.4, 0.35, cord, { x: 13.5, y, z: -5.3, rx: PI / 2 }))
  return fitGroup(g)
}

// ---------- 筋膜枪：T 形机身（横向枪身 + 竖握把 + 底部电池），前端圆头；旁边敞口收纳盒里立着四只替换按摩头 ----------

const MG = { w: 24, d: 16, h: 22 }
function massageGun(p: string[]) {
  const [dev, accent, box] = p
  const g = new THREE.Group()
  const gz = -4
  // 握把 + 底部电池
  g.add(cyl(2.6, 2.6, 3, accent, { x: -3, z: gz }, 18))
  g.add(cyl(1.9, 2.1, 13, dev, { x: -3, y: 3, z: gz }, 16))
  // 枪身：横向圆筒 + 后盖 + 顶上的档位灯
  const by = 18.5
  g.add(cylX(3.1, 14, dev, -1, by, gz, 20))
  g.add(ball(3.1, dev, { x: -8, y: by, z: gz }, [0.4, 1, 1]))
  g.add(lit(rbox(3, 0.3, 1.2, LED_BLUE, { x: -3, y: 21.5, z: gz }, 0.1), LED_BLUE, 0.8))
  // 前端：色环、钢轴、圆形按摩头
  g.add(cylX(2.2, 1.6, accent, 6.6, by, gz, 16))
  g.add(cylX(0.9, 3, STEEL, 8.8, by, gz, 10))
  g.add(ball(2.4, '#3d3f44', { x: 12.3, y: by, z: gz }))
  // 收纳盒：敞口浅盒 + 海绵内衬
  const bx = 2
  const bz = 4.6
  g.add(tray(20, 3, 7.6, 0.6, box, { x: bx, z: bz }))
  g.add(rbox(18.6, 2, 6.2, '#45474e', { x: bx, y: 0.6, z: bz }, 0.4))
  // 四只替换头：圆球、扁平、子弹头、U 形叉
  const HEAD = '#5a5d66'
  for (const [i, x] of [-4.5, 0, 4.5, 9].entries()) {
    g.add(cyl(0.6, 0.6, 2.4, STEEL, { x, y: 2.2, z: bz }, 8))
    if (i === 0) g.add(ball(1.5, HEAD, { x, y: 5.8, z: bz }))
    else if (i === 1) g.add(puck(1.8, 1.4, HEAD, { x, y: 4.5, z: bz }))
    else if (i === 2) g.add(cyl(0.3, 1.3, 2.6, HEAD, { x, y: 4.5, z: bz }, 14))
    else {
      g.add(rbox(3, 0.9, 1.4, HEAD, { x, y: 4.4, z: bz }, 0.3))
      for (const s of [-1, 1]) g.add(ball(0.85, HEAD, { x: x + s * 1.1, y: 5.8, z: bz }))
    }
  }
  return fitGroup(g)
}

// ---------- 足浴盆：带两只提手的椭圆深盆，盆沿一圈翻边，前沿是控制面板，盆底六根按摩滚轮，里面盛着水 ----------

const FS = { w: 44, d: 38, h: 27 }
const FS_SX = 1.15
function footSpa(p: string[]) {
  const [basin, sub, accent] = p
  const g = new THREE.Group()
  const bowl = cup(18, 15, 23, 1.8, basin)
  bowl.scale.x = FS_SX
  g.add(bowl)
  // 盆沿翻边
  const rim = torus(18.3, 1, sub, { y: 22.6, rx: PI / 2 })
  rim.scale.x = FS_SX
  g.add(rim)
  // 盆底的按摩滚轮（左右两只脚各三根）和一排按摩凸点
  for (const sx of [-1, 1]) for (const z of [-6, 0, 6]) g.add(cylX(1, 6, accent, sx * 6, 2.8, z, 12))
  for (const z of [-9, -4.5, 0, 4.5, 9]) g.add(ball(0.7, accent, { y: 2, z }))
  // 水面
  const water = markWater(ghost(cyl(15.2, 15.2, 0.3, WATER, { y: 15.6 }, 32), WATER, 0.55))
  water.scale.x = FS_SX
  g.add(water)
  // 两端提手
  for (const sx of [-1, 1]) g.add(torus(3.5, 0.8, sub, { x: sx * 19.6, y: 23.2, ry: PI / 2 }, PI))
  // 前沿控制面板：发光小屏 + 两颗按键
  g.add(rbox(12, 3.5, 5.5, sub, { y: 22.8, z: 16.6 }, 1.2))
  g.add(lit(rbox(4, 0.4, 2, LED_BLUE, { x: -3, y: 26.1, z: 16.8 }, 0.1), LED_BLUE, 0.8))
  for (const x of [2, 4.5]) g.add(cyl(0.8, 0.8, 0.5, accent, { x, y: 26.1, z: 16.8 }, 12))
  return fitGroup(g)
}

// ---------- 插线板：六位排插（一排插孔）+ 发红光的开关，左端一截电线和插头，一个插孔插着充电头和数据线 ----------

const PS = { w: 34, d: 7, h: 6 }
function powerStrip(p: string[]) {
  const [body, face, charger] = p
  const g = new THREE.Group()
  g.add(rbox(26, 3.4, 5.6, body, { x: 2 }, 1))
  // 六个插孔：圆形底座 + 两道深色插槽
  const xs = [-8, -4.6, -1.2, 2.2, 5.6, 9]
  for (const x of xs) {
    g.add(cyl(1.5, 1.5, 0.3, face, { x, y: 3.25 }, 16))
    for (const s of [-1, 1]) g.add(noOutline(rbox(0.35, 0.3, 0.9, DARK, { x: x + s * 0.45, y: 3.4 }, 0.1)))
  }
  // 开关（红色发光）
  g.add(lit(rbox(2.4, 0.9, 3, '#ff4a3d', { x: 12.9, y: 3 }, 0.3), '#ff4a3d', 0.6))
  // 插着的充电头 + 一根垂到桌上的数据线
  g.add(rbox(3.2, 3, 3.2, charger, { x: 2.2, y: 3.4 }, 0.6))
  g.add(
    tube(
      [
        [2.2, 5, 1.4],
        [2.2, 4.9, 3.2],
        [2.6, 2.4, 3.9],
        [4, 0.3, 3.9],
        [8, 0.3, 3.4],
      ],
      0.25,
      charger,
      { seg: 18, radial: 6 },
    ),
  )
  // 电线和插头
  g.add(
    tube(
      [
        [-10.6, 1.7, 0],
        [-13, 1.5, -0.5],
        [-15.5, 0.5, -1.8],
        [-17.5, 0.45, -0.6],
        [-17.8, 0.6, 0.6],
      ],
      0.45,
      body,
      { seg: 20, radial: 6 },
    ),
  )
  g.add(rbox(2.6, 1.6, 3, body, { x: -17.8, z: 1.8 }, 0.5))
  for (const z of [1.2, 2.4]) g.add(rbox(1.4, 0.2, 0.5, STEEL, { x: -19.6, y: 0.6, z }, 0.05))
  return fitGroup(g)
}

// ---------- 理线盒：白色长盒（两端开出线口）盖着木盖，几根线从两端的口里穿出来垂到桌上 ----------

const CB = { w: 40, d: 14, h: 13 }
function cableBox(p: string[]) {
  const [box, lid] = p
  const g = new THREE.Group()
  const hole = [{ kind: 'arch' as const, x: 0, y: 2.5, w: 4.5, h: 5 }]
  g.add(shell(34, 12, 14, 0.8, box, { top: false, left: hole, right: hole }))
  g.add(rbox(35, 1.6, 15, lid, { y: 11.6 }, 0.5))
  // 盒里藏着的排插（从出线口能看见一截）
  g.add(rbox(24, 3, 5, DARK, { y: 0.8 }, 0.6))
  // 线：右边两根、左边一根，从排插出来穿过出线口垂到桌上
  for (const z of [-0.8, 0.8])
    g.add(
      tube(
        [
          [11, 2.5, z],
          [14, 3.6, z],
          [17.4, 3.6, z],
          [19, 2.4, z * 1.5],
          [19.4, 0.45, z * 2 + 1],
        ],
        0.45,
        z < 0 ? '#3a3b40' : WHITE,
        { seg: 20, radial: 6 },
      ),
    )
  g.add(
    tube(
      [
        [-11, 2.5, 0],
        [-14, 4, 0],
        [-17.4, 4, 0],
        [-19, 2.5, 0.4],
        [-19.4, 0.45, 2],
      ],
      0.45,
      '#3a3b40',
      { seg: 20, radial: 6 },
    ),
  )
  return fitGroup(g)
}

// ---------- 带屏智能音箱：织物包裹的三角楔形音箱身，正面斜立着一块屏（时钟 + 天气界面，自发光） ----------

const SD = { w: 24, d: 12, h: 15 }
/** 侧面轮廓：前面一条斜面装屏，背面圆圆地收下来 */
const SD_SIDE: [number, number][] = [
  [-5.5, 0],
  [6, 0],
  [6, 1.6],
  [-0.2, 14.6],
  [-3, 14.2],
  [-5.6, 11],
  [-6, 4],
]
function paintSmartScreen(c: CanvasRenderingContext2D, W: number, H: number) {
  const grd = c.createLinearGradient(0, 0, W, H)
  grd.addColorStop(0, '#1d2a4a')
  grd.addColorStop(1, '#3b5a8a')
  c.fillStyle = grd
  c.fillRect(0, 0, W, H)
  // 左边：圆形时钟（底圈 + 一段亮弧 + 两根指针）
  const cx = W * 0.27
  const cy = H * 0.5
  const r = H * 0.3
  c.lineCap = 'round'
  c.lineWidth = H * 0.05
  c.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  c.beginPath()
  c.arc(cx, cy, r, 0, PI * 2)
  c.stroke()
  c.strokeStyle = '#ffd27a'
  c.beginPath()
  c.arc(cx, cy, r, -PI / 2, PI * 0.7)
  c.stroke()
  c.strokeStyle = '#ffffff'
  c.lineWidth = H * 0.035
  c.beginPath()
  c.moveTo(cx, cy)
  c.lineTo(cx, cy - r * 0.62)
  c.moveTo(cx, cy)
  c.lineTo(cx + r * 0.45, cy + r * 0.12)
  c.stroke()
  // 右上：太阳和一朵云
  c.fillStyle = '#ffd24a'
  c.beginPath()
  c.arc(W * 0.66, H * 0.3, H * 0.12, 0, PI * 2)
  c.fill()
  c.fillStyle = '#f4f6fb'
  for (const [x, y, rr] of [
    [0.7, 0.4, 0.09],
    [0.77, 0.36, 0.11],
    [0.84, 0.41, 0.08],
  ]) {
    c.beginPath()
    c.arc(W * x, H * y, H * rr, 0, PI * 2)
    c.fill()
  }
  c.fillRect(W * 0.7, H * 0.4, W * 0.14, H * 0.09)
  // 右下：三张预报小卡片
  for (let k = 0; k < 3; k++) {
    const x = W * (0.53 + k * 0.145)
    c.fillStyle = 'rgba(255, 255, 255, 0.16)'
    c.fillRect(x, H * 0.62, W * 0.12, H * 0.26)
    c.fillStyle = ['#ffd24a', '#9fd3ff', '#ffb38a'][k]
    c.beginPath()
    c.arc(x + W * 0.06, H * 0.72, H * 0.05, 0, PI * 2)
    c.fill()
    c.fillStyle = 'rgba(255, 255, 255, 0.6)'
    c.fillRect(x + W * 0.025, H * 0.8, W * 0.07, H * 0.03)
  }
  // 顶部状态条
  c.fillStyle = 'rgba(255, 255, 255, 0.35)'
  c.fillRect(W * 0.06, H * 0.07, W * 0.18, H * 0.035)
  c.fillRect(W * 0.84, H * 0.07, W * 0.1, H * 0.035)
}
function smartDisplay(p: string[]) {
  const [fabric] = p
  const g = new THREE.Group()
  g.add(sideSlab(SD_SIDE, 22, fabric, 0, { bevel: 0.6, bevelSeg: 2 }))
  // 斜面上的屏：深色边框 + 发光画面 + 顶边摄像头
  const s = tiltFrame([6, 1.6], [-0.2, 14.6])
  s.g.add(rbox(21, s.len - 0.4, 0.8, SCREEN, { y: 0.2, z: 0.15 }, 0.4))
  s.g.add(paintPanel(19, 11.8, 'gz-smart-display', paintSmartScreen, { y: 1.2, z: 0.6 }, 0.8))
  s.g.add(noOutline(cylZ(0.35, 0.3, '#4a4d55', 0, s.len - 0.9, 0.65, 10)))
  g.add(s.g)
  // 顶上两颗音量键、背面的电源口和一枚小标牌
  for (const x of [-2, 2]) g.add(P(rbox(2, 0.5, 1.2, shade(fabric, 0.06), {}, 0.2), x, 14.45, -1.6, -0.14))
  g.add(cylZ(0.6, 0.6, GRILLE, 7, 2.5, -5.8, 12))
  g.add(noOutline(cylZ(0.9, 0.4, '#9a9da6', 0, 8, -5.9, 16)))
  return fitGroup(g)
}

// ---------- 落地白板：带轮的 H 形支架夹着一块可翻转的白板（彩色笔迹、磁贴和一张贴纸），下沿笔槽里几支笔和板擦 ----------

const WB = { w: 130, d: 56, h: 180 }
function whiteboard(p: string[]) {
  const [frame, accA, accB] = p
  const g = new THREE.Group()
  // 支架：两根立柱 + 柱帽、两条带轮的脚、一根低横梁
  for (const sx of [-1, 1]) {
    const x = sx * 63
    g.add(rbox(3, 170.5, 4, frame, { x, y: 8.5 }, 0.6))
    g.add(rbox(3.6, 1.2, 4.6, GRILLE, { x, y: 178.5 }, 0.4))
    g.add(rbox(4, 3.5, 56, frame, { x, y: 5.5 }, 0.8))
    for (const z of [-25, 25]) {
      g.add(cyl(1.4, 1.4, 1.4, STEEL, { x, y: 4.2, z }, 10))
      g.add(cylX(2.2, 1.6, RUBBER, x, 2.2, z, 14))
    }
    // 翻转轴和旋钮
    g.add(cylX(1.8, 3, STEEL, sx * 61.3, 122, 0, 12))
    g.add(cylX(2.6, 1.5, GRILLE, sx * 65.2, 122, 0, 14))
  }
  g.add(rbox(124, 3, 3, frame, { y: 22 }, 0.6))
  // 白板：铝边框 + 两面白板面（比边框各高出 0.3）
  const b = new THREE.Group()
  b.add(rbox(120, 92, 2.6, STEEL, { y: -46 }, 0.8))
  b.add(rbox(117, 89, 3.2, WHITE, { y: -44.5 }, 0.4))
  // 笔迹（只在正面）：标题、三行字、一个圆圈图、箭头、柱状图
  const fz = 1.85
  const wave = (x0: number, x1: number, y: number, amp: number, n: number, color: string) => {
    const pts: V3[] = []
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y + (i % 2 ? amp : -amp), fz])
    return noOutline(tube(pts, 0.45, color, { seg: n * 3, radial: 4 }))
  }
  b.add(wave(-48, -8, 32, 1.4, 12, '#3f6fd8'))
  b.add(noOutline(rbox(40, 0.6, 0.4, '#3f6fd8', { x: -28, y: 27.5, z: fz }, 0.15)))
  for (const [i, y] of [16, 8, 0].entries()) b.add(wave(-48, -14 - i * 5, y, 0.8, 14, '#2b2d33'))
  b.add(P(noOutline(torus(9, 0.35, '#e8483f')), 26, 16, fz))
  b.add(wave(20, 32, 16, 0.7, 5, '#e8483f'))
  b.add(P(noOutline(rbox(14, 0.6, 0.4, '#2b2d33', {}, 0.15)), 6, 14, fz, 0, 0, 0.2))
  for (const s of [-1, 1]) b.add(P(noOutline(rbox(3.4, 0.6, 0.4, '#2b2d33', {}, 0.15)), 12.2, 15.3 + s * 0.9, fz, 0, 0, 0.2 + s * 0.7))
  // 柱状图：底线 + 三根绿柱
  b.add(noOutline(rbox(30, 0.6, 0.4, '#2b2d33', { x: -30, y: -36, z: fz }, 0.15)))
  for (const [i, hh] of [10, 16, 7].entries()) b.add(noOutline(rbox(5, hh, 0.4, '#3f9e5b', { x: -40 + i * 9, y: -35.4, z: fz }, 0.15)))
  // 贴纸 + 压着它的磁贴，另外几颗散落的磁贴
  b.add(rbox(18, 24, 0.2, '#fff3a8', { x: 36, y: -38, z: 1.75 }, 0.05))
  b.add(cylZ(1.4, 0.8, accA, 36, -15.5, 2.25, 14))
  for (const [x, y, c] of [
    [-54, 40, accB],
    [54, 40, accA],
    [8, -26, accB],
    [-4, 40, accA],
  ] as [number, number, string][])
    b.add(cylZ(1.4, 0.8, c, x, y, 2, 14))
  // 下沿笔槽：托板 + 前挡边，两支笔和一块板擦
  b.add(rbox(70, 1, 5, STEEL, { y: -47, z: 3.8 }, 0.3))
  b.add(rbox(70, 1.6, 0.6, STEEL, { y: -47, z: 6 }, 0.2))
  for (const [x, z, c] of [
    [-20, 3, accA],
    [-6, 4.6, accB],
  ] as [number, number, string][]) {
    b.add(cylX(0.7, 12, c, x, -45.3, z, 10))
    b.add(cylX(0.75, 3, c, x - 6.5, -45.3, z, 10))
  }
  b.add(rbox(10, 2.2, 3.6, '#5a4a3a', { x: 22, y: -46, z: 3.8 }, 0.6))
  b.add(rbox(10, 1, 3.6, frame, { x: 22, y: -43.8, z: 3.8 }, 0.3))
  b.position.set(0, 122, 0)
  g.add(b)
  return fitGroup(g)
}

// ---------- 数位屏：后面一块撑脚把绘图屏斜撑在底板上（屏上是没画完的插画线稿，自发光），前面一支压感笔和笔座 ----------

const PD = { w: 42, d: 28, h: 20 }
function paintSketch(c: CanvasRenderingContext2D, W: number, H: number) {
  // 软件界面：深灰底、左侧工具条、右侧色板，中间是画布
  c.fillStyle = '#2a2d35'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#f7f4ee'
  c.fillRect(W * 0.1, H * 0.08, W * 0.78, H * 0.86)
  c.fillStyle = '#4a4e58'
  for (let k = 0; k < 6; k++) c.fillRect(W * 0.025, H * (0.12 + k * 0.12), W * 0.05, H * 0.08)
  for (const [k, col] of ['#e8483f', '#ffb347', '#ffd24a', '#5ab0e8', '#7a5cff', '#ff8fb4'].entries()) {
    c.fillStyle = col
    c.beginPath()
    c.arc(W * 0.94, H * (0.15 + k * 0.12), H * 0.035, 0, PI * 2)
    c.fill()
  }
  // 线稿：一个女孩的头像（只上了一半色）
  const cx = W * 0.47
  const cy = H * 0.44
  const r = H * 0.2
  c.fillStyle = 'rgba(255, 143, 180, 0.55)'
  c.beginPath()
  c.moveTo(cx - r * 1.2, cy + r * 0.2)
  c.quadraticCurveTo(cx - r * 1.3, cy - r * 1.3, cx, cy - r * 1.25)
  c.quadraticCurveTo(cx + r * 0.6, cy - r * 1.2, cx + r * 0.4, cy - r * 0.5)
  c.lineTo(cx - r * 0.9, cy + r * 0.2)
  c.fill()
  c.strokeStyle = '#3a3a44'
  c.lineWidth = Math.max(1.5, W * 0.006)
  c.lineCap = 'round'
  c.beginPath()
  c.arc(cx, cy, r, 0, PI * 2)
  c.moveTo(cx - r * 1.2, cy + r * 0.2)
  c.quadraticCurveTo(cx - r * 1.3, cy - r * 1.3, cx, cy - r * 1.25)
  c.quadraticCurveTo(cx + r * 1.3, cy - r * 1.3, cx + r * 1.2, cy + r * 0.3)
  c.moveTo(cx - r * 0.5, cy - r * 0.9)
  c.quadraticCurveTo(cx - r * 0.2, cy - r * 0.4, cx - r * 0.1, cy - r * 0.95)
  c.moveTo(cx + r * 0.1, cy - r * 0.95)
  c.quadraticCurveTo(cx + r * 0.4, cy - r * 0.4, cx + r * 0.6, cy - r * 0.85)
  // 脖子和肩膀
  c.moveTo(cx - r * 0.25, cy + r)
  c.lineTo(cx - r * 0.3, cy + r * 1.4)
  c.quadraticCurveTo(cx - r * 1.6, cy + r * 1.6, cx - r * 1.9, cy + r * 2.3)
  c.moveTo(cx + r * 0.25, cy + r)
  c.lineTo(cx + r * 0.3, cy + r * 1.4)
  c.quadraticCurveTo(cx + r * 1.4, cy + r * 1.6, cx + r * 1.5, cy + r * 1.9)
  c.stroke()
  // 眼睛
  c.fillStyle = '#3a3a44'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(cx + s * r * 0.38, cy + r * 0.1, r * 0.1, r * 0.16, 0, 0, PI * 2)
    c.fill()
  }
  // 画笔光标
  c.strokeStyle = '#5ab0e8'
  c.lineWidth = Math.max(1, W * 0.004)
  c.beginPath()
  c.arc(cx + r * 1.5, cy + r * 1.95, H * 0.025, 0, PI * 2)
  c.stroke()
}
function penDisplay(p: string[]) {
  const [stand, accent] = p
  const g = new THREE.Group()
  // 底板 + 前挡边（屏的下沿靠在挡边上）
  g.add(rbox(40, 1.2, 28, stand, { z: 1 }, 0.5))
  g.add(rbox(40, 2, 1.6, stand, { y: 1.2, z: 10.6 }, 0.5))
  // 斜 40° 的屏：机身 + 画面 + 左边框的四颗快捷键
  const a: [number, number] = [10, 2.8]
  const b: [number, number] = [10 - 26 * Math.cos((40 * PI) / 180), 2.8 + 26 * Math.sin((40 * PI) / 180)]
  const s = tiltFrame(a, b)
  s.g.add(rbox(42, 26, 1.6, SCREEN, { z: -0.8 }, 0.6))
  s.g.add(paintPanel(36, 21, 'gz-pen-display', paintSketch, { x: 0.5, y: 2.5, z: 0.06 }, 0.8))
  for (let k = 0; k < 4; k++) s.g.add(rbox(1.6, 1.6, 0.4, '#3a3d44', { x: -19.6, y: 7 + k * 3, z: 0.2 }, 0.2))
  g.add(s.g)
  // 背后的撑脚：从屏背面斜撑到底板，顶上一根铰链
  g.add(batten([0, 12.8, -3.8], [0, 1.2, -11.5], 30, 1.2, stand, 0.4))
  g.add(cylX(0.8, 28, GRILLE, 0, 12.6, -4.1, 10))
  // 压感笔（横躺在前面）+ 圆形笔座（插着几只替换笔尖）
  const pen = '#3d3f44'
  g.add(cylX(0.55, 15, pen, -4, 1.75, 13.2, 12))
  g.add(cylX(0.6, 1.2, accent, -1, 1.75, 13.2, 12))
  g.add(P(cyl(0.12, 0.55, 2, pen, {}, 10), 4.5, 1.75, 13.2, 0, 0, -PI / 2))
  g.add(cup(1.8, 2.1, 3, 0.4, accent, { x: 15, y: 1.2, z: 11.6 }))
  for (const [dx, dz] of [
    [-0.5, 0.3],
    [0.6, -0.2],
  ])
    g.add(cyl(0.15, 0.15, 2.8, '#e8e8e4', { x: 15 + dx, y: 1.8, z: 11.6 + dz }, 6))
  return fitGroup(g)
}

// ---------- 绘图桌：金属 A 字腿架着一块斜 30° 的大桌板，桌板上铺着图纸、横着丁字尺，下沿挡边靠着一卷图纸，右侧挂一只笔盘 ----------

const DT = { w: 118, d: 78, h: 100 }
function draftingTable(p: string[]) {
  const [wood, metal, accent] = p
  const g = new THREE.Group()
  // 桌板（斜面坐标系里摆）：板、下沿挡边、图纸、丁字尺、靠在挡边上的一卷图纸、板下两根支撑梁
  const s = tiltFrame([34.64, 58], [-34.64, 98])
  s.g.add(rbox(104, 80, 2.4, wood, { z: -1.2 }, 0.6))
  s.g.add(rbox(104, 1.6, 4.4, metal, { y: -1.6, z: -0.2 }, 0.5))
  s.g.add(rbox(64, 46, 0.2, '#f6f3ea', { x: 6, y: 18, z: 0.15 }, 0.05))
  s.g.add(rbox(86, 4.5, 0.4, accent, { x: -9, y: 40, z: 0.5 }, 0.15))
  s.g.add(rbox(2.2, 16, 3.2, accent, { x: -53.1, y: 33.25, z: -0.9 }, 0.5))
  s.g.add(cylX(2.4, 56, '#f2ede0', 10, 2.4, 2.4, 16))
  s.g.add(cylX(2, 56.3, '#d9d0bc', 10, 2.4, 2.4, 16))
  for (const sx of [-1, 1]) s.g.add(rbox(3, 50, 3, metal, { x: sx * 46, y: 15, z: -3.9 }, 0.5))
  g.add(s.g)
  // 两副 A 字腿：两根斜腿交在桌板下的转轴上，底下一条脚管
  const pivot: V3 = [0, 74.6, -1.95]
  for (const sx of [-1, 1]) {
    const x = sx * 49
    for (const z of [34, -34]) g.add(strutBox([x, 1.5, z], [x, pivot[1], pivot[2]], 3, 3, metal, 0.6))
    g.add(rbox(4, 2, 78, metal, { x }, 0.6))
    g.add(cylX(1.8, 4.8, STEEL, x, pivot[1], pivot[2], 12))
    g.add(cylX(2.4, 1.4, GRILLE, sx * 52.1, pivot[1], pivot[2], 14))
  }
  // 两根横撑（前面一根兼作踏脚）
  g.add(cylX(1.4, 98, metal, 0, 25, -23.7, 12))
  g.add(cylX(1.4, 98, metal, 0, 25, 22.5, 12))
  // 右侧笔盘：托架 + 浅盘 + 三支铅笔和一块橡皮
  g.add(rbox(2, 1.4, 5, metal, { x: 50.8, y: 59, z: 5 }, 0.3))
  g.add(tray(12, 3.2, 14, 0.6, accent, { x: 57, y: 60, z: 4.45 }))
  for (const [i, c] of ['#ffd24a', '#e8483f', '#3f7fd8'].entries()) g.add(cylZ(0.4, 10, c, 54.5 + i * 2.5, 61, 4.45, 8))
  g.add(rbox(2.4, 1, 3.6, '#f4f4f2', { x: 58.5, y: 60.6, z: 9 }, 0.3))
  return fitGroup(g)
}

// ---------- 双筒望远镜：两只镜筒横躺在桌上，中轴上一只调焦轮，后端橡胶眼罩，前端物镜；挂绳盘在旁边 ----------

const BN = { w: 18, d: 14, h: 6.5 }
function binoculars(p: string[]) {
  const [body, armor, accent] = p
  const g = new THREE.Group()
  const cy = 3
  for (const sx of [-1, 1]) {
    const x = sx * 3.6
    g.add(cylZ(2.7, 9, body, x, cy, 0.5, 20))
    g.add(cylZ(2.8, 3.2, armor, x, cy, 1.4, 20))
    // 物镜：外圈 + 镜片
    g.add(cylZ(3, 1.6, armor, x, cy, 5.6, 20))
    g.add(noOutline(cylZ(2.4, 0.3, '#3a5a8a', x, cy, 6.4, 20)))
    // 目镜 + 橡胶眼罩 + 目镜片
    g.add(cylZ(1.7, 2, body, x, cy, -5, 16))
    g.add(cylZ(2.1, 1.8, RUBBER, x, cy, -6.9, 16))
    g.add(noOutline(cylZ(1.2, 0.2, '#2a3a55', x, cy, -7.85, 14)))
    // 挂绳扣
    g.add(torus(0.5, 0.15, accent, { x: sx * 6.45, y: cy + 0.4, z: -3, ry: PI / 2 }))
  }
  // 两道连接桥 + 中轴 + 调焦轮
  for (const z of [3, -2.5]) g.add(rbox(3.6, 1.6, 2.4, armor, { y: cy + 0.2, z }, 0.5))
  g.add(cylZ(0.9, 7.5, body, 0, cy + 0.8, 0.2, 12))
  g.add(cylX(1.5, 2.2, accent, 0, cy + 1.6, -1.6, 16))
  // 挂绳：从右侧绳扣垂到桌上，盘成两圈
  g.add(
    tube(
      [
        [6.5, cy + 0.2, -3],
        [7.6, 1.4, -3.6],
        [7.6, 0.3, -2.4],
      ],
      0.25,
      accent,
      { seg: 10, radial: 4 },
    ),
  )
  for (const [y, r] of [
    [0.3, 2.2],
    [0.75, 1.9],
  ]) {
    const loop = torus(r, 0.25, accent, { x: 8.8, y, z: 0.2, rx: PI / 2 })
    loop.scale.y = 1.6
    g.add(loop)
  }
  return fitGroup(g)
}

// ---------- 遥控越野车 + 遥控器：大轮越野车（弹簧避震、车壳、驾驶舱、灯架、天线），旁边立着一只枪式遥控器 ----------

const RC = { w: 40, d: 20, h: 18 }
function rcCar(p: string[]) {
  const [shellC, accent, remote] = p
  const g = new THREE.Group()
  const car = new THREE.Group()
  // 车轮：胎、轮毂、轴心
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      car.add(cylZ(4.4, 3.4, RUBBER, sx * 9, 4.4, sz * 7.8, 20))
      car.add(cylZ(2.6, 3.6, accent, sx * 9, 4.4, sz * 7.8, 16))
      car.add(cylZ(0.8, 3.9, STEEL, sx * 9, 4.4, sz * 7.8, 10))
      // 避震：阻尼杆 + 弹簧，从底盘斜到车壳下
      const a: V3 = [sx * 7.6, 5.2, sz * 3.2]
      const b: V3 = [sx * 8.4, 9.2, sz * 5.4]
      car.add(rod3(a, b, 0.35, STEEL, 8))
      car.add(coil(a, b, 0.75, 5, 0.18, '#e8c34a'))
    }
  // 底盘 + 两根车轴 + 前后保险杠
  car.add(rbox(24, 2, 8, DARK, { y: 3.4 }, 0.6))
  for (const sx of [-1, 1]) {
    car.add(cylZ(0.6, 14, STEEL, sx * 9, 4.4, 0, 8))
    car.add(rbox(1.6, 2, 10, DARK, { x: sx * 12.6, y: 4.6 }, 0.5))
  }
  // 车壳：下车身 + 驾驶舱 + 车窗 + 侧面色条 + 灯架
  car.add(rbox(24, 4, 12.5, shellC, { y: 8.5 }, 1.5))
  car.add(rbox(10, 4, 11, shellC, { x: -1, y: 12.3 }, 1.6))
  car.add(noOutline(rbox(7, 2.2, 11.2, '#2a3340', { x: -1.5, y: 13.2 }, 0.3)))
  car.add(noOutline(rbox(0.3, 2.4, 9, '#2a3340', { x: 4.05, y: 13.1 }, 0.1)))
  for (const sz of [-1, 1]) car.add(noOutline(rbox(14, 1, 0.3, accent, { x: 2, y: 10, z: sz * 6.35 }, 0.1)))
  car.add(rbox(1, 1, 10, DARK, { x: -2, y: 16.2 }, 0.3))
  for (const sz of [-1, 1]) car.add(lit(rbox(0.6, 0.8, 1.6, '#fff2b8', { x: -1.2, y: 16.3, z: sz * 2.5 }, 0.2), '#fff2b8', 0.7))
  // 天线
  car.add(cyl(0.15, 0.2, 5, DARK, { x: -10, y: 12.4, z: -4 }, 6))
  car.add(ball(0.35, accent, { x: -10, y: 17.5, z: -4 }))
  car.position.x = -6.4
  g.add(car)
  // 枪式遥控器（长轴沿 z，方向轮在右侧）：机身、斜握把、扳机、方向轮、天线、指示灯
  const r = new THREE.Group()
  r.add(rbox(4.4, 4.8, 13, remote, { y: 7.6 }, 1.4))
  r.add(P(rbox(3.4, 8, 4.2, remote, {}, 1.2), 0, 4.45, -3.4, 0.25))
  r.add(P(rbox(1.2, 2.6, 1.2, accent, {}, 0.4), 0, 6.4, -0.2, 0.3))
  r.add(cylX(0.8, 1.2, DARK, 2.6, 10, 2.5, 10))
  r.add(cylX(3, 1.2, DARK, 3.6, 10, 2.5, 20))
  r.add(cylX(2, 1.3, accent, 3.6, 10, 2.5, 16))
  r.add(cyl(0.25, 0.35, 5, DARK, { y: 12.4, z: -5 }, 6))
  r.add(lit(ball(0.35, LED_GREEN, { y: 12.4, z: 4 }), LED_GREEN, 0.8))
  r.position.x = 15.5
  g.add(r)
  return fitGroup(g)
}

// ---------- 裁缝人台：布面躯干（腰线、木颈帽）插在立杆上，三脚木支架；肩上搭着一条软尺，胸前别着几枚珠针 ----------

const DF = { w: 38, d: 32, h: 160 }
/** 躯干轮廓 [半径, 高]：臀 → 腰 → 胸 → 肩 → 颈 */
const DF_PROFILE: V2[] = [
  [0, 100],
  [14, 100.5],
  [16.5, 104],
  [17, 110],
  [15, 116],
  [12.2, 122],
  [13, 127],
  [15.5, 133],
  [16, 137],
  [15.2, 142],
  [13.5, 146],
  [9, 149.5],
  [5.2, 151],
  [5, 155],
  [0, 155.5],
]
/** 前后方向的压扁比例（人台前后比左右薄） */
const DF_Z = 0.72
/** 躯干在高度 y 处的半径（轮廓线性插值） */
function formR(y: number) {
  for (let i = 1; i < DF_PROFILE.length; i++) {
    const [r0, y0] = DF_PROFILE[i - 1]
    const [r1, y1] = DF_PROFILE[i]
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0)
  }
  return 0
}
/** 躯干表面上 (x, y) 处的前（s = 1）/ 后（s = -1）表面 z，往外浮 lift */
function formZ(x: number, y: number, s: number, lift = 0.4) {
  const r = formR(y)
  return s * (DF_Z * Math.sqrt(Math.max(0, r * r - x * x)) + lift)
}
function dressForm(p: string[]) {
  const [fabric, wood, tape] = p
  const g = new THREE.Group()
  // 三脚支架：中心毂 + 三条斜腿 + 脚头圆珠
  g.add(cyl(2.4, 2.8, 6, wood, { y: 14 }, 16))
  for (const a of [-PI / 2, PI / 6, (PI * 5) / 6]) {
    const fx = Math.cos(a) * 19
    const fz = Math.sin(a) * 19
    g.add(strutBox([Math.cos(a) * 1.5, 16, Math.sin(a) * 1.5], [fx, 1.2, fz], 2.4, 1.8, wood, 0.6))
    g.add(ball(1.2, wood, { x: fx, y: 1.2, z: fz }))
  }
  // 立杆 + 调高卡箍
  g.add(cyl(1.2, 1.2, 83, wood, { y: 18 }, 12))
  g.add(cyl(1.8, 1.8, 3, '#c9a25a', { y: 60 }, 14))
  g.add(cylX(0.5, 2.4, '#c9a25a', 2.6, 61.5, 0, 8))
  // 躯干（前后压扁）+ 腰线 + 颈部木帽
  const torso = latheAt(DF_PROFILE, fabric, {}, 32)
  torso.scale.z = DF_Z
  g.add(torso)
  const waist = noOutline(torus(formR(122) + 0.05, 0.22, shade(fabric, -0.18), { y: 122, rx: PI / 2 }))
  waist.scale.y = DF_Z
  g.add(waist)
  g.add(puck(5.6, 2.6, wood, { y: 154.6 }))
  g.add(ball(1.3, wood, { y: 158.4 }))
  // 软尺：搭在左肩上，前后两头垂下来
  const tx = 8
  const front: V3[] = [
    [tx + 0.3, 120, formZ(tx, 140, 1) + 0.4],
    [tx + 0.2, 132, formZ(tx, 140, 1) + 0.3],
    [tx, 140, formZ(tx, 140, 1)],
    [tx, 146, formZ(tx, 146, 1)],
    [tx, 149, formZ(tx, 149, 1)],
  ]
  const back: V3[] = [
    [tx, 149, formZ(tx, 149, -1)],
    [tx, 146, formZ(tx, 146, -1)],
    [tx, 140, formZ(tx, 140, -1)],
    [tx + 0.2, 128, formZ(tx, 140, -1) - 0.3],
  ]
  g.add(tube([...front, [tx, 150.4, 0], ...back], 0.35, tape, { seg: 48, radial: 6 }))
  for (const [y, z] of [
    [120, front[0][2]],
    [128, back[3][2]],
  ])
    g.add(rbox(1, 0.8, 1, STEEL, { x: tx + 0.25, y: y - 0.8, z }, 0.1))
  // 珠针：针身斜插进胸前，彩色圆头
  for (const [x, y, c] of [
    [-6, 136, '#e8483f'],
    [-9, 132, '#3f7fd8'],
    [-4, 129, '#f2c230'],
    [-10, 139, '#3f9e5b'],
  ] as [number, number, string][]) {
    const z0 = formZ(x, y, 1, -0.6)
    const z1 = formZ(x, y, 1, 0.9)
    g.add(rod3([x, y, z0], [x, y + 0.4, z1], 0.08, STEEL, 4))
    g.add(ball(0.45, c, { x, y: y + 0.45, z: z1 + 0.3 }))
  }
  return fitGroup(g)
}

// ---------- 线轴架 + 布料卷：木质线轴架上四排斜插的木钉挂满彩色线轴，旁边两卷布叠着躺在桌上 ----------

const TR = { w: 36, d: 21, h: 35 }
const THREADS = ['#e8483f', '#ff8fb4', '#ffb347', '#f2c230', '#8fd49a', '#3f9e5b', '#5ab0e8', '#3f6fd8', '#7a5cff', '#c9a0e8', '#f4f4f2', '#3d3f44']
function threadRack(p: string[]) {
  const [wood, fabA, fabB] = p
  const g = new THREE.Group()
  const rx = -6
  // 架子：底座、背板、背后两块撑脚、顶上一条横梁
  g.add(rbox(26, 1.8, 11.5, wood, { x: rx, z: -0.75 }, 0.5))
  g.add(rbox(24, 31.4, 1.4, wood, { x: rx, y: 1.8, z: -3 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(1.4, 10, 2.5, wood, { x: rx + s * 11.3, y: 1.8, z: -4.95 }, 0.3))
  g.add(rbox(25, 1.6, 2.2, wood, { x: rx, y: 33, z: -3 }, 0.4))
  // 四排木钉，每根插一只线轴（木钉微微上翘）
  let k = 0
  for (const y of [6.5, 13.5, 20.5, 27.5])
    for (let i = 0; i < 6; i++) {
      const spool = new THREE.Group()
      spool.add(cylZ(0.22, 3.6, shade(wood, -0.1), 0, 0, 1.5, 6))
      // 线团几乎和后挡片一样粗，前端只留一圈小木挡：正面看得见线的颜色
      spool.add(cylZ(1.4, 2.3, THREADS[(k++ * 5) % THREADS.length], 0, 0, 1.65, 14))
      spool.add(cylZ(1.55, 0.35, shade(wood, 0.08), 0, 0, 0.4, 14))
      spool.add(cylZ(0.95, 0.35, shade(wood, 0.08), 0, 0, 2.85, 12))
      spool.position.set(rx - 9 + i * 3.6, y, -2.3)
      spool.rotation.x = -0.25
      g.add(spool)
    }
  // 两卷布：大卷躺在桌上，小卷叠在上面；端面看得见卷层和纸芯
  for (const [r, len, y, z, c] of [
    [3.4, 20, 3.4, 0, fabA],
    [2.8, 18, 9.3, -0.5, fabB],
  ] as [number, number, number, number, string][]) {
    g.add(cylZ(r, len, c, 12.5, y, z, 20))
    g.add(cylZ(r - 0.5, len + 0.3, shade(c, 0.12), 12.5, y, z, 20))
    g.add(cylZ(0.8, len + 0.6, '#c9a878', 12.5, y, z, 12))
    g.add(noOutline(cylZ(0.5, len + 0.8, '#5a4a3a', 12.5, y, z, 10)))
  }
  return fitGroup(g)
}

// ---------- 配色 ----------

const TF_PALS: Pal[] = [
  ['modern', [M.white, '#5ab0e8', M.char]],
  ['modern', [M.char, '#ff8a3d', M.black]],
  ['nordic', [N.white, N.sage, N.oak]],
  ['cute', [C.sky, C.white, C.pink]],
]
const BF_PALS: Pal[] = [
  ['modern', [M.white, M.silver, '#5ab0e8']],
  ['modern', [M.silver, M.char, '#ff8a3d']],
  ['industrial', [I.steel, I.iron, I.rust]],
  ['nordic', [N.white, N.gray, N.blue]],
  ['cute', [C.pink, C.white, C.lemon]],
]
const CF_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#5ab0e8']],
  ['modern', [M.black, M.gray, '#ff8a3d']],
  ['retro', [R.mustard, R.cream, R.teal]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['cute', [C.mint, C.white, C.pink]],
]
const FD_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#5ab0e8']],
  ['cute', [C.cream, C.pink, C.sky]],
  ['nordic', [N.linen, N.blue, N.oak]],
  ['modern', [M.char, M.gray, '#ff8a3d']],
]
const FC_PALS: Pal[] = [
  ['modern', [M.white, M.char, LED_GREEN]],
  ['modern', [M.silver, M.black, LED_BLUE]],
  ['nordic', [N.sage, N.white, N.mustard]],
  ['farmhouse', [F.white, F.oak, LED_GREEN]],
]
const WP_PALS: Pal[] = [
  ['modern', [M.white, M.silver]],
  ['modern', [M.black, M.silver]],
  ['nordic', [N.white, N.oak]],
  ['cute', [C.mint, C.white]],
]
const TB_PALS: Pal[] = [
  ['modern', [M.light, M.white, '#5ab0e8']],
  ['modern', [M.char, M.black, M.silver]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['nordic', [N.oak, N.white, N.sage]],
]
const HT_PALS: Pal[] = [
  ['modern', [M.light, M.black, M.silver]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['classic', [CL.cream, CL.wine, CL.gold]],
  ['modern', [M.light, '#e8a0b4', M.white]],
]
const MG_PALS: Pal[] = [
  ['modern', [M.char, '#ff8a3d', M.black]],
  ['modern', [M.white, '#5ab0e8', M.gray]],
  ['nordic', [N.sage, N.white, N.linen]],
  ['cute', [C.lilac, C.white, C.pink]],
]
const FS_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#5ab0e8']],
  ['cute', [C.pink, C.white, C.lemon]],
  ['nordic', [N.white, N.sage, N.oak]],
  ['modern', [M.light, M.char, '#ff8a3d']],
]
const PS_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.white]],
  ['modern', [M.black, M.char, M.white]],
  ['cute', [C.pink, C.white, C.mint]],
  ['nordic', [N.white, N.gray, N.sage]],
]
const CB_PALS: Pal[] = [
  ['nordic', [N.white, N.oak]],
  ['modern', [M.white, M.walnut]],
  ['modern', [M.char, M.walnut]],
  ['japanese', [J.washi, J.hinoki]],
  ['industrial', [I.concrete, I.walnut]],
]
const SD_PALS: Pal[] = [
  ['modern', [M.char]],
  ['modern', [M.light]],
  ['nordic', [N.linen]],
  ['nordic', [N.sage]],
  ['cute', [C.sakura]],
]
const WB_PALS: Pal[] = [
  ['modern', [M.silver, '#e8483f', '#3f7fd8']],
  ['nordic', [N.oak, N.mustard, N.blue]],
  ['industrial', [I.iron, I.rust, I.steel]],
  ['cute', [C.mint, C.pink, C.lemon]],
]
const PD_PALS: Pal[] = [
  ['modern', [M.char, '#5ab0e8']],
  ['modern', [M.light, '#ff8a3d']],
  ['nordic', [N.white, N.sage]],
  ['cute', [C.white, C.pink]],
]
const DT_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.blue]],
  ['industrial', [I.walnut, I.iron, I.rust]],
  ['modern', [M.white, M.char, '#3f7fd8']],
  ['classic', [CL.walnut, CL.gold, CL.navy]],
  ['farmhouse', [F.oak, F.iron, F.barn]],
]
const BN_PALS: Pal[] = [
  ['modern', [M.black, M.char, M.silver]],
  ['industrial', [I.iron, '#5d6b4a', I.steel]],
  ['retro', [R.olive, R.caramel, R.cream]],
  ['modern', [M.char, '#3f6e8f', M.silver]],
]
const RC_PALS: Pal[] = [
  ['modern', ['#e8483f', '#f2c230', M.char]],
  ['cute', [C.sky, C.lemon, C.white]],
  ['retro', [R.orange, R.cream, R.teal]],
  ['industrial', ['#5d6b4a', I.rust, I.iron]],
]
const DF_PALS: Pal[] = [
  ['classic', [CL.cream, CL.walnut, CL.gold]],
  ['nordic', [N.linen, N.oak, N.mustard]],
  ['modern', [M.char, M.walnut, '#f2c230']],
  ['farmhouse', [F.linen, F.oak, F.barn]],
  ['cute', [C.sakura, C.woodL, C.mint]],
]
const TR_PALS: Pal[] = [
  ['nordic', [N.oak, N.blue, N.sage]],
  ['farmhouse', [F.oak, F.barn, F.linen]],
  ['japanese', [J.wood, J.ai, J.shu]],
  ['cute', [C.woodL, C.pink, C.mint]],
]

export const HOME_GADGETS: AssetDef[] = [
  define('gz-tower-fan', '塔扇', 'appliance', [TF.w, TF.d, TF.h], TF_PALS, towerFan, {
    type: 'fan',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-bladeless-fan', '无叶落地扇', 'appliance', [BF.w, BF.d, BF.h], BF_PALS, bladelessFan, {
    type: 'fan',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-circulator', '空气循环扇', 'appliance', [CF.w, CF.d, CF.h], CF_PALS, circulator, {
    type: 'fan',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-futon-dryer', '被褥干燥机', 'appliance', [FD.w, FD.d, FD.h], FD_PALS, futonDryer, {
    type: 'appliance',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-food-composter', '厨余处理机', 'appliance', [FC.w, FC.d, FC.h], FC_PALS, foodComposter, {
    type: 'appliance',
    mats: ['plastic', 'plastic', null],
  }),
  define('gz-water-purifier', '台面净水器', 'kitchenware', [WP.w, WP.d, WP.h], WP_PALS, waterPurifier, {
    ...PROP,
    type: 'appliance',
    mats: ['plastic', 'plastic'],
  }),
  define('gz-toothbrush-set', '电动牙刷套装', 'toiletry', [TB.w, TB.d, TB.h], TB_PALS, toothbrushSet, {
    ...PROP,
    type: 'oral-care',
    tags: ['toothbrush'],
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-hair-tools', '卷发棒与直发夹', 'toiletry', [HT.w, HT.d, HT.h], HT_PALS, hairTools, {
    ...PROP,
    type: 'personal-care',
    tags: ['hobby:beauty'],
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-massage-gun', '筋膜枪', 'fitness', [MG.w, MG.d, MG.h], MG_PALS, massageGun, {
    ...PROP,
    type: 'sports-gear',
    tags: ['hobby:fitness'],
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-foot-spa', '足浴盆', 'toiletry', [FS.w, FS.d, FS.h], FS_PALS, footSpa, {
    type: 'appliance',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-power-strip', '插线板', 'tabletop', [PS.w, PS.d, PS.h], PS_PALS, powerStrip, {
    ...PROP,
    type: 'electronics',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-cable-box', '理线盒', 'tabletop', [CB.w, CB.d, CB.h], CB_PALS, cableBox, {
    ...PROP,
    type: 'electronics',
    mats: ['plastic', 'wood'],
  }),
  define('gz-smart-display', '带屏智能音箱', 'tabletop', [SD.w, SD.d, SD.h], SD_PALS, smartDisplay, {
    ...PROP,
    type: 'audio',
    mats: ['fabric'],
  }),
  define('gz-whiteboard', '落地白板', 'study', [WB.w, WB.d, WB.h], WB_PALS, whiteboard, {
    type: 'stationery',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('gz-pen-display', '数位屏', 'tabletop', [PD.w, PD.d, PD.h], PD_PALS, penDisplay, {
    ...PROP,
    type: 'electronics',
    tags: ['hobby:crafts'],
    mats: ['plastic', 'plastic'],
  }),
  define('gz-drafting-table', '绘图桌', 'study', [DT.w, DT.d, DT.h], DT_PALS, draftingTable, {
    type: 'workbench',
    tags: ['hobby:crafts'],
    mats: ['wood', 'metal', 'plastic'],
  }),
  define('gz-binoculars', '双筒望远镜', 'hobby', [BN.w, BN.d, BN.h], BN_PALS, binoculars, {
    ...PROP,
    type: 'science-kit',
    mats: ['plastic', 'leather', 'fabric'],
  }),
  define('gz-rc-car', '遥控越野车', 'hobby', [RC.w, RC.d, RC.h], RC_PALS, rcCar, {
    ...PROP,
    type: 'toy',
    tags: ['hobby:models'],
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('gz-dress-form', '裁缝人台', 'hobby', [DF.w, DF.d, DF.h], DF_PALS, dressForm, {
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['fabric', 'wood', 'fabric'],
  }),
  define('gz-thread-rack', '线轴架与布料卷', 'hobby', [TR.w, TR.d, TR.h], TR_PALS, threadRack, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['wood', 'fabric', 'fabric'],
  }),
]
