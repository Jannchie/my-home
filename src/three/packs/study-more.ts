// 书房家具补充（id 前缀 sm-）：复古写字台、翻板写字柜、双腿电动升降桌、带上架的 L 形书桌、壁挂折叠书桌、
// 图书馆书墙 + 滑轨梯、律师书柜、错层方格书架、阅读角、绘图高凳、坐地书桌、活动抽屉柜、平抽图纸柜、洞洞板书桌组。
// 约定见 kit.ts 开头：原点在占地中心底面，正面朝 +z；桌面、层板留空并声明 surface / surfaces。
// 有抽屉 / 柜门的用 kit 的 drawerBox / hingedDoor（或自己的 movable 翻门）+ drawerLevel，openable: true，门里的层标 inside。

import * as THREE from 'three'
import { ball, cup, cyl, nub, puck, rbox, shade, torus, tray } from '../toon'
import { C, carcass, drawerBox, drawerLevel, hingedDoor, holePanel, lPoly, movable, rectPoly, shelvesIn, slab, type AssetDef, type Hole, type Poly, type SurfaceDef } from '../kit'
import { P, PI, cylX, cylZ, fitGroup, fitWall, glassPane, lit, rod3, strutBox, tube, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const RUBBER = '#2e2f33'
const PAPER = '#f4f1ea'
const CTRL = '#2b2c30'
const DISPLAY = '#7fe0ff'
const BULB = '#fff2b8'

/** 小球段数：r < 1.5 的拉手、脚垫（ball 默认最少 12 × 8 = 168 面） */
const LOW: [number, number] = [8, 6]

/** 抽屉口参数（drawerBox / drawerLevel 共用） */
type DrawerSpec = { x0: number; x1: number; y0: number; y1: number; z: number; depth: number }

/** 四角圆角的矩形轮廓（桌面平面图），r 为圆角半径 */
function roundRect(w: number, d: number, r: number, n = 4): Poly {
  const out: Poly = []
  const corners: [number, number, number][] = [
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, PI / 2],
    [-w / 2 + r, -d / 2 + r, PI],
    [w / 2 - r, -d / 2 + r, (PI * 3) / 2],
  ]
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= n; i++) out.push([cx + Math.cos(a0 + (i / n) * (PI / 2)) * r, cz + Math.sin(a0 + (i / n) * (PI / 2)) * r])
  return out
}

/** 抽屉面板 + 两只圆钮（古典家具的抽屉）：drawerBox 的 front 用，knob 要设 false */
const twoKnobFront = (color: string, knob: string, kx: number, kr = 1) => (w: number, h: number) => [rbox(w, h, 1.6, color, { z: -0.8 }, 0.5), ball(kr, knob, { x: -kx, y: h / 2, z: kr * 0.6 }, undefined, LOW), ball(kr, knob, { x: kx, y: h / 2, z: kr * 0.6 }, undefined, LOW)]

// ---------- 复古写字台：四条鹅颈（卡布里）腿、桌面嵌一块皮面，围板正中一只抽屉，桌面后方一排小抽屉 + 信插格 ----------

const WD = { w: 110, d: 55, h: 95, top: 76 }
/** 腿的位置（中线） */
const WD_LX = 51
const WD_LZ = 23.5
/** 后方格架：前沿 z、背板 z、两侧板 x */
const WD_GZ0 = -26.5
const WD_GZ1 = -12
const WD_GX = 48.5
/** 格架下排抽屉 76..83.5，隔板 83.5..84.7，信插格 84.7..92，顶板 92..93.5 */
const WD_MID = 83.5
const WD_HOLE = 84.7
const WD_GTOP = 92
const WD_SMALL_X: [number, number][] = [
  [-WD_GX, -24.75],
  [-23.75, -0.5],
  [0.5, 23.75],
  [24.75, WD_GX],
]
const WD_CUBBY_DIV = [-29, -9.7, 9.7, 29]
const wdDrawers = (): DrawerSpec[] => [
  { x0: -26, x1: 26, y0: 64, y1: 73, z: WD_LZ + 1, depth: 40 },
  ...WD_SMALL_X.map(([x0, x1]) => ({ x0, x1, y0: WD.top, y1: WD_MID, z: WD_GZ1, depth: 12.5 })),
]
/** 信插格每格的 x 范围 */
const wdCubbies = (): [number, number][] => {
  const xs = [-WD_GX, ...WD_CUBBY_DIV, WD_GX]
  return xs.slice(0, -1).map((x, i) => [x + (i ? 0.5 : 0), xs[i + 1] - (i < xs.length - 2 ? 0.5 : 0)])
}

/** 鹅颈腿：上方方料接围板，膝部外鼓、脚踝内收、脚尖外翻，脚下一块圆垫。sx / sz 为腿所在的角 */
function cabrioleLeg(sx: number, sz: number, wood: string) {
  const g = new THREE.Group()
  const x = sx * WD_LX
  const z = sz * WD_LZ
  // 往对角线外侧鼓出的量
  const o = (k: number, y: number): V3 => [x + sx * k * 0.71, y, z + sz * k * 0.71]
  g.add(rbox(4.6, 12, 4.6, wood, { x, y: 61, z }, 0.8))
  g.add(tube([o(0, 62), o(1.2, 54), o(0.2, 44), o(-1, 30), o(-1.4, 14), o(-0.6, 6), o(0.8, 2.6)], 1.9, wood, { seg: 20 }))
  // 膝部和脚尖
  const [kx, ky, kz] = o(1.1, 54)
  g.add(ball(2.5, wood, { x: kx, y: ky, z: kz }, [1, 1.6, 1], [10, 6]))
  const [fx, , fz] = o(0.8, 0)
  g.add(puck(2.6, 1.6, shade(wood, -0.1), { x: fx, z: fz }))
  return g
}

function writingDesk(p: string[]) {
  const [wood, inlay, brass] = p
  const g = new THREE.Group()
  // 桌面 + 嵌进去的皮面（浮出 0.3）
  g.add(rbox(WD.w, 3, WD.d, wood, { y: 73 }, 1))
  g.add(rbox(80, 0.6, 30, inlay, { y: 75.7, z: 7.5 }, 0.2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabrioleLeg(sx, sz, wood))
  // 围板：两侧、后面整块，前面中间让出抽屉口；抽屉下面一根细横档
  const ix = WD_LX - 2.3
  for (const s of [-1, 1]) {
    g.add(rbox(2, 9, WD_LZ * 2 - 4.6, wood, { x: s * WD_LX, y: 64 }, 0.5))
    g.add(rbox(ix - 26.3, 9, 2, wood, { x: (s * (ix + 26.3)) / 2, y: 64, z: WD_LZ }, 0.5))
  }
  g.add(rbox(ix * 2, 9, 2, wood, { y: 64, z: -WD_LZ }, 0.5))
  g.add(rbox(ix * 2, 1.2, 2, shade(wood, -0.08), { y: 62.8, z: WD_LZ }, 0.4))
  // 后方格架：两侧板、背板、顶板（两头翘一点的冠板）、中间隔板和竖隔
  const gd = WD_GZ1 - WD_GZ0
  const gz = (WD_GZ0 + WD_GZ1) / 2
  for (const s of [-1, 1]) g.add(rbox(1.5, WD_GTOP - WD.top, gd, wood, { x: s * (WD_GX + 0.75), y: WD.top, z: gz }, 0.4))
  g.add(rbox(WD_GX * 2, WD_GTOP - WD.top, 1, shade(wood, -0.08), { y: WD.top, z: WD_GZ0 + 0.5 }, 0.3))
  g.add(rbox(WD_GX * 2 + 4, 1.5, gd + 1, wood, { y: WD_GTOP, z: gz + 0.5 }, 0.5))
  g.add(rbox(64, 1.4, 1, wood, { y: WD_GTOP + 1.5, z: WD_GZ0 + 0.6 }, 0.4))
  for (const s of [-1, 1]) g.add(ball(0.9, brass, { x: s * (WD_GX + 0.8), y: WD_GTOP + 2.3, z: WD_GZ0 + 1 }, undefined, LOW))
  g.add(rbox(WD_GX * 2, WD_HOLE - WD_MID, gd - 1, wood, { y: WD_MID, z: gz + 0.5 }, 0.3))
  for (const [, x1] of WD_SMALL_X.slice(0, -1)) g.add(rbox(1, WD_MID - WD.top, gd - 1, wood, { x: x1 + 0.5, y: WD.top, z: gz + 0.5 }, 0.2))
  for (const x of WD_CUBBY_DIV) g.add(rbox(1, WD_GTOP - WD_HOLE, gd - 1, wood, { x, y: WD_HOLE, z: gz + 0.5 }, 0.2))
  // 抽屉：围板正中一只大的（两只钮），格架下排四只小的（一只钮）
  const [big, ...small] = wdDrawers()
  g.add(drawerBox({ ...big, color: shade(wood, 0.04), knob: false, front: twoKnobFront(shade(wood, 0.04), brass, 12, 1.1) }))
  for (const o of small) g.add(drawerBox({ ...o, color: shade(wood, 0.04), knob: false, front: (w, h) => [rbox(w, h, 1.6, shade(wood, 0.04), { z: -0.8 }, 0.4), ball(0.7, brass, { y: h / 2, z: 0.4 }, undefined, LOW)] }))
  return g
}

// ---------- 翻板写字柜：下面三只大抽屉，中段一块下翻的写字板（里面信插格 + 一排小抽屉面），上面玻璃门书柜 + 顶檐 ----------

const SEC = { w: 90, d: 50, h: 200 }
/** 下柜（含翻板段）顶 118，翻板段 76..116.2；上柜深 32，前沿 z = 7 */
const SEC_LOW = 118
const SEC_BED = 76
const SEC_FLAP_TOP = SEC_LOW - 1.8
const SEC_UP_D = 32
const SEC_UP_Z = -SEC.d / 2 + SEC_UP_D / 2
const SEC_UP_FRONT = -SEC.d / 2 + SEC_UP_D
const SEC_UP_H = 78
const SEC_SHELVES = [145, 170]
const SEC_IX = SEC.w / 2 - 1.8
/** 信插格：背后 14 深，下面一排小抽屉面到 83，上面两层格子 */
const SEC_PH_Z0 = -SEC.d / 2 + 1.8
const SEC_PH_Z1 = -9
const SEC_PH_MID = 99
const SEC_PH_DIV = [-21.6, 0, 21.6]
const secDrawers = (): DrawerSpec[] =>
  [
    [9.8, 31.2],
    [31.2, 52.6],
    [52.6, 74.2],
  ].map(([y0, y1]) => ({ x0: -SEC_IX, x1: SEC_IX, y0, y1, z: SEC.d / 2, depth: 44 }))

/** 玻璃门板：木框 + 玻璃 + 一竖两横的窗棂（hingedDoor 的 panel） */
const glazedPanel = (color: string) => (w: number, h: number) => [
  holePanel(w, h, 1.8, color, [{ kind: 'rect', x: 0, y: 4, w: w - 8, h: h - 8, r: 0.4 }], {}, 0.5, { seg: 3 }),
  glassPane(w - 7, h - 7, 0.4, { y: 3.5, z: 0 }),
  nub(1, h - 8, 1.2, color, { y: 4 }),
  ...[1, 2].map((k) => nub(w - 8, 1, 1.2, color, { y: 4 + ((h - 8) * k) / 3 - 0.5 })),
]

function secretaryBookcase(p: string[]) {
  const [wood, inlay, brass] = p
  const g = new THREE.Group()
  const front = shade(wood, 0.04)
  // 下柜：踢脚 8，内部 74.2..76 一块固定板（翻板段的写字台面）
  g.add(carcass(SEC.w, SEC_LOW, SEC.d, wood, { base: 8 }))
  g.add(rbox(SEC_IX * 2, 1.8, SEC.d - 1.8, wood, { y: SEC_BED - 1.8, z: 0.9 }, 0.3))
  for (const o of secDrawers()) g.add(drawerBox({ ...o, color: front, knob: false, front: twoKnobFront(front, brass, 22, 1.1) }))
  // 信插格：底下一条小抽屉面，上面两层、四格
  const phd = SEC_PH_Z1 - SEC_PH_Z0
  const phz = (SEC_PH_Z0 + SEC_PH_Z1) / 2
  g.add(rbox(SEC_IX * 2, 7, phd, shade(wood, -0.06), { y: SEC_BED, z: phz }, 0.3))
  for (const x of [-32.4, -10.8, 10.8, 32.4]) {
    g.add(rbox(19, 5.6, 0.6, front, { x, y: SEC_BED + 0.7, z: SEC_PH_Z1 + 0.3 }, 0.2))
    g.add(ball(0.6, brass, { x, y: SEC_BED + 3.5, z: SEC_PH_Z1 + 0.9 }, undefined, LOW))
  }
  g.add(rbox(SEC_IX * 2, 1, phd, wood, { y: SEC_PH_MID, z: phz }, 0.2))
  for (const x of SEC_PH_DIV) g.add(rbox(1, SEC_FLAP_TOP - SEC_BED - 7, phd, wood, { x, y: SEC_BED + 7, z: phz }, 0.2))
  // 翻板：底边铰链，打开放平当桌面；内侧一块皮面（放平后朝上），外侧凸起的线框和锁眼
  const fh = SEC_FLAP_TOP - SEC_BED - 0.8 - 0.3
  const fw = SEC_IX * 2 - 0.6
  const flap = new THREE.Group()
  flap.add(rbox(fw, fh, 1.6, front, {}, 0.5))
  flap.add(rbox(fw - 8, fh - 8, 0.4, inlay, { y: 4, z: -1 }, 0.15))
  flap.add(rbox(fw - 10, fh - 10, 0.5, shade(wood, -0.05), { y: 5, z: 0.95 }, 0.2))
  flap.add(nub(3, 4, 0.4, brass, { y: fh - 8, z: 1.35 }))
  flap.add(ball(1, brass, { y: fh - 3.5, z: 1.4 }, undefined, LOW))
  flap.position.set(0, SEC_BED + 0.8, SEC.d / 2 - 0.8)
  g.add(movable(flap, { kind: 'flap', angle: PI / 2 }))
  // 上柜：玻璃对开门、两层层板，顶上一道檐
  const up = carcass(SEC.w, SEC_UP_H, SEC_UP_D, wood)
  up.add(shelvesIn(SEC.w, SEC_UP_D, SEC_SHELVES.map((y) => y - SEC_LOW), wood))
  g.add(P(up, 0, SEC_LOW, SEC_UP_Z))
  const y0 = SEC_LOW + 1.8
  const y1 = SEC_LOW + SEC_UP_H - 1.8
  for (const [x0, x1, hinge] of [
    [-SEC_IX, 0, 'left'],
    [0, SEC_IX, 'right'],
  ] as const)
    g.add(hingedDoor({ x0, x1, y0, y1, z: SEC_UP_FRONT, hinge, color: front, th: 1.8, knob: brass, panel: glazedPanel(front) }))
  g.add(rbox(SEC.w + 2, SEC.h - SEC_LOW - SEC_UP_H - 1.5, SEC_UP_D + 2, shade(wood, -0.06), { y: SEC_LOW + SEC_UP_H, z: SEC_UP_Z + 1 }, 0.6))
  g.add(rbox(SEC.w + 1, 1.5, SEC_UP_D + 1.4, wood, { y: SEC.h - 1.5, z: SEC_UP_Z + 0.7 }, 0.5))
  return g
}

// ---------- 双腿电动升降桌：圆角桌面，三节方立柱、宽脚带调平垫、横梁和电机盒，背后理线槽 + 一串理线蛇骨，右前角手控器带小屏 ----------

const SD = { w: 160, d: 75, h: 74, t: 2.5 }
const SD_LX = 58
const SD_LZ = -5
const SD_UNDER = SD.h - SD.t
function standingDesk(p: string[]) {
  const [top, frame, acc] = p
  const g = new THREE.Group()
  g.add(slab(roundRect(SD.w, SD.d, 6), SD.t, top, SD_UNDER))
  for (const s of [-1, 1]) {
    const x = s * SD_LX
    // 脚 + 两只调平垫
    g.add(rbox(7, 3.2, 68, frame, { x, y: 1 }, 1.4))
    for (const z of [-31, 31]) g.add(cyl(1.8, 1.8, 1.1, RUBBER, { x, z }, 10))
    // 三节立柱：下粗上细，每节插进下一节 1cm
    g.add(rbox(9, 26, 6.6, frame, { x, y: 4.2, z: SD_LZ }, 1))
    g.add(rbox(8, 20, 5.6, shade(frame, 0.06), { x, y: 29.2, z: SD_LZ }, 0.8))
    g.add(rbox(7, SD_UNDER - 2.7 - 48.2, 4.6, shade(frame, 0.12), { x, y: 48.2, z: SD_LZ }, 0.7))
    // 桌面下的侧托
    g.add(rbox(6, 2.7, 62, frame, { x, y: SD_UNDER - 2.7 }, 0.8))
  }
  // 横梁 + 电机控制盒
  g.add(rbox(SD_LX * 2 - 6, 4, 4, frame, { y: SD_UNDER - 4, z: SD_LZ }, 0.8))
  g.add(rbox(16, 4, 7, CTRL, { y: SD_UNDER - 8, z: SD_LZ }, 1))
  // 理线槽（开口朝上，顶边贴着桌面底）和一串理线蛇骨落到地上
  g.add(tray(110, 9, 12, 0.8, acc, { y: SD_UNDER - 9, z: -28 }, 0.3))
  const n = 24
  const sh = (SD_UNDER - 9) / n
  for (let i = 0; i < n; i++) g.add(nub(3, sh, 2.4, i % 2 ? acc : shade(acc, -0.1), { x: 40 + 2.5 * Math.sin((i / (n - 1)) * PI), y: i * sh, z: -28 }))
  // 手控器：小屏 + 上下键 + 两个记忆键
  const cx = 50
  // 按键最前沿正好在桌面前沿（不超出声明的进深）
  const cz = SD.d / 2 - 3.4
  g.add(rbox(14, 2.6, 6, CTRL, { x: cx, y: SD_UNDER - 2.6, z: cz }, 0.8))
  g.add(lit(rbox(4, 1.3, 0.3, DISPLAY, { x: cx - 3.5, y: SD_UNDER - 2, z: cz + 3.15 }, 0.1), DISPLAY, 0.7))
  for (const [i, dx] of [0.5, 3, 5.5].entries()) g.add(nub(1.8, 1.2, 0.4, i ? '#8a8d93' : '#dfe2e6', { x: cx + dx, y: SD_UNDER - 1.95, z: cz + 3.2 }))
  return g
}

// ---------- 带上架的 L 形书桌：右侧回转桌面，后排一整排开放上架（左边一座小格塔，中间到右边是显示器位），挡板围着 ----------

const LH = { w: 160, d: 140, h: 150, arm: 60, ret: 55, top: 74 }
const LH_X0 = -LH.w / 2
const LH_Z0 = -LH.d / 2
/** 上架：深 26，左格塔 x -78..-48，层板 126，顶板 148..150，格塔中层 100 */
const LH_HZ1 = LH_Z0 + 27
const LH_TOWER = -47
const LH_SHELF = 126
const LH_TMID = 100
const LH_TOPB = 148
function lDeskHutch(p: string[]) {
  const [top, frame, acc] = p
  const g = new THREE.Group()
  const ut = LH.top - 3
  g.add(slab(lPoly(LH.w, LH.d, LH.arm, LH.ret, 'right'), 3, top, ut))
  // 腿：左端侧板、回转端侧板、右后角立柱；后面和右侧两块挡板
  const zArm = LH_Z0 + LH.arm
  g.add(rbox(3, ut, LH.arm - 4, frame, { x: LH_X0 + 2, z: LH_Z0 + LH.arm / 2 }, 0.8))
  g.add(rbox(LH.ret - 4, ut, 3, frame, { x: LH.w / 2 - LH.ret / 2, z: LH.d / 2 - 2 }, 0.8))
  g.add(rbox(5, ut, 5, frame, { x: LH.w / 2 - 4, z: LH_Z0 + 4 }, 1))
  const mod = shade(frame, -0.05)
  g.add(rbox(LH.w - 3.5 - 6.5, 30, 1.6, mod, { x: (LH_X0 + 3.5 + LH.w / 2 - 6.5) / 2, y: 38, z: LH_Z0 + 4 }, 0.4))
  g.add(rbox(1.6, 30, LH.d - 6.5 - 3.5, mod, { x: LH.w / 2 - 4, y: 38, z: (LH_Z0 + 6.5 + LH.d / 2 - 3.5) / 2 }, 0.4))
  // 理线孔盖
  g.add(puck(3, 0.7, RUBBER, { x: 62, y: LH.top - 0.3, z: zArm - 22 }))
  // 上架：三根立板、顶板、层板（分两段让开中间立板）、格塔中层、背板
  const hz = (LH_Z0 + LH_HZ1) / 2
  const hd = LH_HZ1 - LH_Z0
  // 立板背面比背板往前收 0.1（不共面）
  for (const x of [LH_X0 + 1, LH_TOWER, LH.w / 2 - 1]) g.add(rbox(2, LH_TOPB - LH.top, hd - 1, frame, { x, y: LH.top, z: hz + 0.4 }, 0.4))
  g.add(rbox(LH.w, 2, hd, top, { y: LH_TOPB, z: hz }, 0.6))
  g.add(rbox(LH_TOWER - 1 - (LH_X0 + 2), 2, hd - 2, top, { x: (LH_TOWER - 1 + LH_X0 + 2) / 2, y: LH_SHELF, z: hz - 0.5 }, 0.4))
  g.add(rbox(LH.w / 2 - 2 - (LH_TOWER + 1), 2, hd - 2, top, { x: (LH.w / 2 - 2 + LH_TOWER + 1) / 2, y: LH_SHELF, z: hz - 0.5 }, 0.4))
  g.add(rbox(LH_TOWER - 1 - (LH_X0 + 2), 2, hd - 2, top, { x: (LH_TOWER - 1 + LH_X0 + 2) / 2, y: LH_TMID, z: hz - 0.5 }, 0.4))
  g.add(rbox(LH.w - 4, LH_TOPB - LH_SHELF - 2, 0.8, acc, { y: LH_SHELF + 2, z: LH_Z0 + 0.4 }, 0.2))
  g.add(rbox(LH_TOWER - 1 - (LH_X0 + 2), LH_SHELF - LH.top, 0.8, acc, { x: (LH_TOWER - 1 + LH_X0 + 2) / 2, y: LH.top, z: LH_Z0 + 0.4 }, 0.2))
  return g
}

// ---------- 壁挂折叠书桌：墙上一只浅柜，桌板放下架在两根托臂上，柜里一块搁板、一道竖隔 ----------

const WL = { w: 80, d: 45, h: 60, mount: 70 }
/** 柜体 y 73..130、深 14.5（背面贴墙 z = -22.5）；桌板 73..75 伸到 z = 22.5 */
const WL_BOX0 = 73
const WL_TOP = WL.mount + WL.h
const WL_BACK = -WL.d / 2
const WL_FRONT = WL_BACK + 14.5
const WL_LEAF = 75
const WL_SHELF = 104.5
function wallDesk(p: string[]) {
  const [body, leaf, acc] = p
  const g = new THREE.Group()
  const bd = WL_FRONT - WL_BACK
  const bz = (WL_BACK + WL_FRONT) / 2
  const ix = WL.w / 2 - 1.8
  // 柜体：两侧、顶、底、背板（点缀色）、搁板、竖隔
  for (const s of [-1, 1]) g.add(rbox(1.8, WL_TOP - WL_BOX0, bd, body, { x: s * (WL.w / 2 - 0.9), y: WL_BOX0, z: bz }, 0.4))
  g.add(rbox(ix * 2, 1.8, bd, body, { y: WL_TOP - 1.8, z: bz }, 0.4))
  g.add(rbox(ix * 2, 1.8, bd, body, { y: WL_BOX0, z: bz }, 0.4))
  g.add(rbox(ix * 2, WL_TOP - WL_BOX0 - 3.6, 1, acc, { y: WL_BOX0 + 1.8, z: WL_BACK + 0.5 }, 0.2))
  g.add(rbox(ix * 2, 1.5, bd - 1, body, { y: WL_SHELF - 1.5, z: bz + 0.5 }, 0.3))
  g.add(rbox(1.5, WL_SHELF - 1.5 - WL_BOX0 - 1.8, bd - 1, body, { x: 16, y: WL_BOX0 + 1.8, z: bz + 0.5 }, 0.3))
  g.add(rbox(1.5, WL_TOP - 1.8 - WL_SHELF, bd - 1, body, { x: -18, y: WL_SHELF, z: bz + 0.5 }, 0.3))
  // 墙上的托条 + 两根托臂（从墙伸到桌板前沿下面）
  g.add(rbox(WL.w - 6, WL_BOX0 - WL.mount, 2.5, body, { y: WL.mount, z: WL_BACK + 1.25 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2.4, WL_BOX0 - WL.mount, WL.d - 4, shade(body, -0.06), { x: s * (WL.w / 2 - 5), y: WL.mount, z: WL_BACK + 2.5 + (WL.d - 4) / 2 }, 0.4))
  // 放下的桌板 + 铰链
  const ld = WL.d / 2 - WL_FRONT
  g.add(rbox(WL.w, WL_LEAF - WL_BOX0, ld, leaf, { y: WL_BOX0, z: WL_FRONT + ld / 2 }, 0.6))
  for (const s of [-1, 1]) g.add(cylX(0.6, 6, STEEL, s * 24, WL_BOX0, WL_FRONT, 8))
  return fitWall(g, WL.mount, WL.d)
}

// ---------- 图书馆书墙 + 滑轨梯：四列六层的通高书墙、顶檐，檐下一根铜滑轨，挂着一架带脚轮的木梯 ----------

const LB = { w: 200, d: 40, h: 230, cd: 26, base: 8 }
const LB_CZ = -LB.d / 2 + LB.cd / 2
const LB_FRONT = -LB.d / 2 + LB.cd
const LB_CASE_H = 222
const LB_VX = [-49.5, 0, 49.5]
const LB_SHELVES = [46, 82, 118, 154, 190]
const LB_FLOOR = LB.base + 1.8
const LB_CEIL = LB_CASE_H - 1.8
const LB_RAIL = { y: 211, z: LB_FRONT + 4.5, r: 1.1 }
const LB_LADDER_X = 50
/** 梯子：两根梯帮上端挂在滑轨上、下端脚轮落地 */
const LB_FOOT = { y: 3, z: LB.d / 2 - 1.5 }
const LB_TOPZ = LB_RAIL.z + 3.1
const lbZ = (y: number) => LB_FOOT.z + ((LB_TOPZ - LB_FOOT.z) * (y - LB_FOOT.y)) / (LB_RAIL.y + 0.5 - LB_FOOT.y)
/** 每一列的 x 范围（侧板 / 竖板之间） */
const lbBays = (): [number, number][] => {
  const xs = [-LB.w / 2 + 1.8, ...LB_VX.flatMap((x) => [x - 0.9, x + 0.9]), LB.w / 2 - 1.8]
  return [0, 1, 2, 3].map((i) => [xs[i * 2], xs[i * 2 + 1]])
}
function libraryWall(p: string[]) {
  const [wood, ladder, metal] = p
  const g = new THREE.Group()
  g.add(P(carcass(LB.w, LB_CASE_H, LB.cd, wood, { base: LB.base }), 0, 0, LB_CZ))
  const id = LB.cd - 1.8
  const iz = LB_CZ + 0.9
  for (const x of LB_VX) g.add(rbox(1.8, LB_CEIL - LB_FLOOR, id, wood, { x, y: LB_FLOOR, z: iz }, 0.3))
  for (const [x0, x1] of lbBays()) for (const y of LB_SHELVES) g.add(rbox(x1 - x0 - 0.2, 1.8, id - 0.6, wood, { x: (x0 + x1) / 2, y: y - 1.8, z: iz - 0.3 }, 0.3))
  // 顶檐：一层檐板 + 略宽的冠板
  g.add(rbox(LB.w, 6, LB.cd + 1, shade(wood, -0.06), { y: LB_CASE_H, z: LB_CZ + 0.5 }, 0.5))
  g.add(rbox(LB.w + 1, LB.h - LB_CASE_H - 6, LB.cd + 2, wood, { y: LB.h - 2, z: LB_CZ + 1 }, 0.5))
  // 滑轨 + 每根竖板上一只托架
  g.add(cylX(LB_RAIL.r, LB.w - 4, metal, 0, LB_RAIL.y, LB_RAIL.z, 10))
  for (const x of [-LB.w / 2 + 1, ...LB_VX, LB.w / 2 - 1]) g.add(nub(1.6, 2.4, LB_RAIL.z - LB_FRONT, metal, { x, y: LB_RAIL.y - 1.2, z: (LB_FRONT + LB_RAIL.z) / 2 }))
  // 梯子：梯帮、横档、挂钩环、脚轮
  for (const s of [-1, 1]) {
    const x = LB_LADDER_X + s * 21
    g.add(strutBox([x, LB_FOOT.y, LB_FOOT.z], [x, LB_RAIL.y + 0.5, LB_TOPZ], 4, 3, ladder, 0.6))
    g.add(torus(1.9, 0.5, metal, { x, y: LB_RAIL.y, z: LB_RAIL.z, ry: PI / 2 }, PI * 2, [6, 16]))
    g.add(nub(2.6, 3.2, 4.4, metal, { x, y: 0.4, z: LB_FOOT.z }))
    g.add(cylX(1.5, 1.4, RUBBER, x, 1.5, LB_FOOT.z, 10))
  }
  for (let i = 0; i < 8; i++) {
    const y = 25 + i * 25
    g.add(cylX(1.3, 40, ladder, LB_LADDER_X, y, lbZ(y), 10))
  }
  return g
}

// ---------- 律师书柜：底座 + 四节叠起来的柜格（接缝一道腰线），每节一扇上翻的玻璃门，顶上一块盖板 ----------

const BR = { w: 90, d: 35, h: 150, base: 12, mod: 33, n: 4 }
const BR_IX = BR.w / 2 - 1.8
const brY = (i: number) => BR.base + i * BR.mod
function barristerCase(p: string[]) {
  const [wood, trim, knob] = p
  const g = new THREE.Group()
  // 底座：一块收进去的座 + 四只方脚
  g.add(rbox(BR.w - 2, BR.base - 2, BR.d - 2, trim, { y: 2 }, 0.6))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 2.4, 6, shade(trim, -0.1), { x: sx * (BR.w / 2 - 4), z: sz * (BR.d / 2 - 4) }, 0.6))
  for (let i = 0; i < BR.n; i++) {
    const y0 = brY(i)
    for (const s of [-1, 1]) g.add(rbox(1.8, BR.mod, BR.d, wood, { x: s * (BR.w / 2 - 0.9), y: y0 }, 0.4))
    g.add(rbox(BR_IX * 2, 2, BR.d - 1, wood, { y: y0, z: 0.5 }, 0.3))
    g.add(rbox(BR_IX * 2, 1.6, BR.d - 1, wood, { y: y0 + BR.mod - 1.6, z: 0.5 }, 0.3))
    g.add(rbox(BR_IX * 2, BR.mod - 3.6, 1, shade(wood, -0.06), { y: y0 + 2, z: -BR.d / 2 + 0.5 }, 0.2))
    // 腰线：每节顶上一道深色线脚（背面收进 0.2，不和侧板背面共面）
    if (i < BR.n - 1) g.add(rbox(BR.w + 0.8, 1.2, BR.d + 0.2, trim, { y: y0 + BR.mod - 0.6, z: 0.3 }, 0.3))
    // 上翻玻璃门：顶边铰链，原点在顶边，门板往下挂
    const h = BR.mod - 3.6 - 0.6
    const w = BR_IX * 2 - 0.8
    const door = new THREE.Group()
    door.add(holePanel(w, h, 1.8, wood, [{ kind: 'rect', x: 0, y: 3.2, w: w - 7, h: h - 6.4, r: 0.4 }], { y: -h }, 0.4, { seg: 3 }))
    door.add(glassPane(w - 6, h - 5.4, 0.4, { y: -h + 2.7, z: 0 }))
    for (const s of [-1, 1]) door.add(ball(0.9, knob, { x: s * 22, y: -h + 1.6, z: 1.3 }, undefined, LOW))
    door.position.set(0, y0 + BR.mod - 1.6 - 0.3, BR.d / 2 - 0.9)
    g.add(movable(door, { kind: 'flap', angle: -(80 * PI) / 180 }))
  }
  // 盖板：两层，上层略宽
  const ty = brY(BR.n)
  g.add(rbox(BR.w, 3.5, BR.d, trim, { y: ty }, 0.5))
  g.add(rbox(BR.w + 1.4, BR.h - ty - 3.5, BR.d + 1.2, wood, { y: ty + 3.5, z: 0.4 }, 0.6))
  return g
}

// ---------- 错层方格书架：五层，每层竖隔板的位置都错开（砖缝一样），几格背板换点缀色 ----------

const CB = { w: 120, d: 30, h: 160 }
const CB_ROWS = [5, 36, 67, 98, 129]
const CB_ROW_H = 29
const CB_DIV: number[][] = [[-28, 22], [-44, 2, 36], [-12, 30], [-38, 8, 40], [-22, 26]]
/** 每层换点缀色背板的那一格（序号） */
const CB_ACCENT = [1, 0, 2, 1, 2]
const CB_IX = CB.w / 2 - 2
/** 某一层每一格的 x 范围 */
const cbCells = (row: number): [number, number][] => {
  const xs = [-CB_IX, ...CB_DIV[row].flatMap((x) => [x - 1, x + 1]), CB_IX]
  return Array.from({ length: xs.length / 2 }, (_, i) => [xs[i * 2], xs[i * 2 + 1]])
}
function cubeBookcase(p: string[]) {
  const [main, acc] = p
  const g = new THREE.Group()
  // 两条底脚、两侧板、背板
  for (const s of [-1, 1]) g.add(rbox(5, 3, CB.d - 4, shade(main, -0.12), { x: s * (CB_IX - 6) }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(2, CB.h - 3, CB.d, main, { x: s * (CB_IX + 1), y: 3 }, 0.5))
  g.add(rbox(CB_IX * 2, CB.h - 5 - 2, 0.8, shade(main, -0.05), { y: 5, z: -CB.d / 2 + 0.4 }, 0.2))
  // 横板（底板到顶板），前后收进背板
  const bd = CB.d - 0.8
  const bz = 0.4
  for (const y of [3, ...CB_ROWS.slice(1).map((y) => y - 2), CB.h - 2]) g.add(rbox(CB_IX * 2, 2, bd, main, { y, z: bz }, 0.4))
  CB_ROWS.forEach((yb, r) => {
    for (const x of CB_DIV[r]) g.add(rbox(2, CB_ROW_H, bd, main, { x, y: yb, z: bz }, 0.4))
    const [x0, x1] = cbCells(r)[CB_ACCENT[r]]
    g.add(rbox(x1 - x0 - 0.4, CB_ROW_H - 0.4, 0.6, acc, { x: (x0 + x1) / 2, y: yb + 0.2, z: -CB.d / 2 + 1.1 }, 0.2))
  })
  return g
}

// ---------- 阅读角：左边一张宽扶手的单人沙发椅，右边一体的木柜（下层前开的大格当边几、后半截升起一座小书塔），书塔侧面伸出一支灯臂罩住肩头 ----------

const RN = { w: 110, d: 80, h: 150 }
/** 椅子 x -55..19，木柜 x 19..55；边几顶 60，书塔 z -40..-6 */
const RN_SPLIT = 19
const RN_TABLE = 60
const RN_TOWER_D = 34
const RN_TOWER_SHELVES = [92, 121]
const RN_UX = (RN_SPLIT + RN.w / 2) / 2
const RN_UW = RN.w / 2 - RN_SPLIT
const RN_TZ = -RN.d / 2 + RN_TOWER_D / 2
const RN_TFRONT = -RN.d / 2 + RN_TOWER_D
const LAMP_METAL = '#3a3b40'
function readingNook(p: string[]) {
  const [fabric, cushion, wood] = p
  const g = new THREE.Group()
  const cx = (-RN.w / 2 + RN_SPLIT) / 2
  const cw = RN_SPLIT + RN.w / 2
  // 椅子：四只短脚、座箱、左扶手、靠背，座垫和靠垫
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.8, 1.5, 4, shade(wood, -0.1), { x: cx + sx * (cw / 2 - 5), z: sz * (RN.d / 2 - 6) }, 10))
  g.add(rbox(cw, 28, RN.d - 4, fabric, { x: cx, y: 4 }, 3))
  g.add(rbox(12, 30, RN.d - 18, fabric, { x: -RN.w / 2 + 6, y: 32, z: 7 }, 4))
  g.add(rbox(cw, 60, 14, fabric, { x: cx, y: 32, z: -RN.d / 2 + 9 }, 4))
  const sw = RN_SPLIT - (-RN.w / 2 + 12)
  const sx0 = (RN_SPLIT + (-RN.w / 2 + 12)) / 2
  g.add(rbox(sw, 11, 58, cushion, { x: sx0, y: 32, z: 6 }, 4))
  g.add(rbox(sw - 4, 40, 12, cushion, { x: sx0, y: 43, z: -RN.d / 2 + 21, rx: -0.12 }, 4))
  // 右边木柜：下层（前开的大格，中间一层隔板）+ 后半截的书塔
  g.add(P(carcass(RN_UW, RN_TABLE, RN.d, wood, { base: 4 }), RN_UX, 0, 0))
  g.add(P(shelvesIn(RN_UW, RN.d, [32], wood), RN_UX, 0, 0))
  const tower = carcass(RN_UW, RN.h - RN_TABLE, RN_TOWER_D, wood)
  tower.add(shelvesIn(RN_UW, RN_TOWER_D, RN_TOWER_SHELVES.map((y) => y - RN_TABLE), wood))
  g.add(P(tower, RN_UX, RN_TABLE, RN_TZ))
  // 灯臂：书塔左侧板上一块底座，弯臂伸到肩头上方，灯罩里一只发光的灯泡
  g.add(rbox(3, 6, 4, LAMP_METAL, { x: RN_SPLIT - 1.5, y: 137, z: -10 }, 0.6))
  const end: V3 = [2, 141, 9]
  g.add(tube([[RN_SPLIT - 1.5, 140, -10], [10, 146, -2], [4, 145, 5], end], 0.7, LAMP_METAL, { seg: 20 }))
  g.add(cyl(1.2, 1.2, 2, LAMP_METAL, { x: end[0], y: end[1] - 1.5, z: end[2] }, 10))
  g.add(cup(9, 3.2, 10, 0.6, shade(cushion, -0.04), { x: end[0], y: end[1] - 1.5, z: end[2], rx: PI }))
  g.add(cyl(1.1, 1.1, 3.2, LAMP_METAL, { x: end[0], y: end[1] - 4.6, z: end[2] }, 10))
  g.add(lit(ball(2.4, BULB, { x: end[0], y: end[1] - 6.5, z: end[2] }), BULB, 0.9))
  return g
}

// ---------- 绘图高凳：五星脚 + 脚轮、气压杆、脚踏圈，圆座垫，后面一根立杆撑着一小块靠背 ----------

const DST = { w: 45, d: 45, h: 95, seat: 74 }
function draftingStool(p: string[]) {
  const [frame, fabric] = p
  const g = new THREE.Group()
  g.add(cyl(4, 5, 4, frame, { y: 5 }, 16))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const sx = Math.sin(a)
    const sz = Math.cos(a)
    g.add(strutBox([0, 7.5, 0], [sx * 21, 5.6, sz * 21], 3, 3, frame))
    g.add(cyl(0.8, 0.8, 1.8, RUBBER, { x: sx * 21, y: 3.8, z: sz * 21 }, 8))
    g.add(ball(2.3, RUBBER, { x: sx * 21, y: 2.3, z: sz * 21 }, [0.7, 1, 1], [10, 6]))
  }
  // 气压杆：黑色护套 + 镀铬内杆
  g.add(cyl(2.6, 3, 18, RUBBER, { y: 9 }, 14))
  g.add(cyl(1.6, 1.6, 37.5, STEEL, { y: 26.5 }, 12))
  // 脚踏圈：卡在内杆上的套环 + 三根辐条
  const ry = 40
  g.add(cyl(3.4, 3.4, 3, STEEL, { y: ry - 1.5 }, 14))
  g.add(torus(18, 1.1, STEEL, { y: ry, rx: PI / 2 }, PI * 2, [6, 32]))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 6
    g.add(rod3([Math.cos(a) * 3.2, ry, Math.sin(a) * 3.2], [Math.cos(a) * 17.4, ry, Math.sin(a) * 17.4], 0.6, STEEL, 8))
  }
  // 座：机构板、座壳、座垫，右边一根调节拨杆
  g.add(rbox(18, 3, 18, frame, { y: 63.5 }, 0.8))
  g.add(puck(20, 3, frame, { y: 66 }))
  g.add(puck(19.5, DST.seat - 68, fabric, { y: 68 }))
  g.add(rod3([8, 64.5, 4], [17, 63.5, 7], 0.5, RUBBER, 8))
  g.add(ball(1, RUBBER, { x: 17, y: 63.5, z: 7 }, undefined, LOW))
  // 靠背：从机构板往后伸的横臂 + 立杆 + 靠背垫（背后一块壳）
  g.add(rbox(4, 2.5, 14.5, frame, { y: 64, z: -15 }, 0.6))
  g.add(rbox(4, 24, 2.5, frame, { y: 64, z: -21.5 }, 0.6))
  g.add(rbox(30, 13, 1.4, frame, { y: 81, z: -21.4 }, 0.6))
  g.add(rbox(29, 12.4, 3, fabric, { y: 81.3, z: -19.3 }, 1.4))
  return fitGroup(g)
}

// ---------- 坐地书桌：矮桌面，左边一块挖了方孔的板腿，右边是一只两层的小书格（兼当桌腿），后面一根横撑 ----------

const KD = { w: 100, d: 50, h: 38, t: 2.8 }
const KD_UNDER = KD.h - KD.t
/** 书格：外侧板 x 47.6..50，内侧板 26..28，底板 1..2.6，中层板顶 17.6 */
const KD_IN = 28
const KD_OUT = KD.w / 2 - 2.4
const KD_MID = 17.6
const KD_FLOOR = 2.6
const KD_SD = KD.d - 4
function kneelingDesk(p: string[]) {
  const [top, wood] = p
  const g = new THREE.Group()
  g.add(rbox(KD.w, KD.t, KD.d, top, { y: KD_UNDER }, 1))
  // 左板腿：中间一个圆角方孔
  g.add(holePanel(KD_SD, KD_UNDER, 2.4, wood, [{ kind: 'rect', x: 0, y: 6, w: KD_SD - 14, h: KD_UNDER - 14, r: 4 }], { x: -KD.w / 2 + 3.6, ry: PI / 2 }, 1, { seg: 6 }))
  // 右书格：两侧板、底板、中层板、背板
  g.add(rbox(2.4, KD_UNDER, KD_SD, wood, { x: KD_OUT + 1.2 }, 0.6))
  g.add(rbox(2, KD_UNDER, KD_SD, wood, { x: KD_IN - 1 }, 0.6))
  const sw = KD_OUT - KD_IN
  const sx = (KD_OUT + KD_IN) / 2
  g.add(rbox(sw, KD_FLOOR - 1, KD_SD, wood, { x: sx, y: 1 }, 0.4))
  g.add(rbox(sw, 1.6, KD_SD - 1, wood, { x: sx, y: KD_MID - 1.6, z: 0.5 }, 0.4))
  g.add(rbox(sw, KD_UNDER - KD_FLOOR, 1, shade(wood, -0.08), { x: sx, y: KD_FLOOR, z: -KD_SD / 2 + 0.5 }, 0.2))
  // 后横撑：左板腿到书格内侧板
  const x0 = -KD.w / 2 + 4.8
  const x1 = KD_IN - 2
  g.add(rbox(x1 - x0, 7, 1.6, wood, { x: (x0 + x1) / 2, y: KD_UNDER - 9, z: -KD_SD / 2 + 2 }, 0.4))
  return g
}

// ---------- 活动抽屉柜：四只带罩的脚轮，三只抽屉（浅笔盘、中抽、文件抽），最上面那只带锁芯 ----------

const MP = { w: 40, d: 55, h: 60, wheel: 5 }
const MP_IX = MP.w / 2 - 1.8
const mpDrawers = (): DrawerSpec[] =>
  [
    [6.8, 34.4],
    [34.4, 46.4],
    [46.4, 58.2],
  ].map(([y0, y1]) => ({ x0: -MP_IX, x1: MP_IX, y0, y1, z: MP.d / 2, depth: 50 }))
function mobilePedestal(p: string[]) {
  const [body, front, handle] = p
  const g = new THREE.Group()
  // 脚轮：轮子 + 罩（罩顶贴着柜底）
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (MP.w / 2 - 5)
      const z = sz * (MP.d / 2 - 6)
      g.add(cylX(1.8, 1.6, RUBBER, x, 1.8, z, 10))
      g.add(nub(2.6, MP.wheel - 2, 4.2, shade(body, -0.15), { x, y: 2, z }))
    }
  g.add(P(carcass(MP.w, MP.h - MP.wheel, MP.d, body), 0, MP.wheel, 0))
  mpDrawers().forEach((o, i) => {
    const d = { ...o, color: front, knob: handle }
    // 最上面的笔盘抽屉：右上角一只锁芯（跟着抽屉走）
    if (i === 2)
      g.add(
        drawerBox({
          ...d,
          front: (w, h) => [rbox(w, h, 1.6, front, { z: -0.8 }, 0.4), cylZ(1, 1.2, STEEL, w / 2 - 3.5, h / 2, 0.1, 10), nub(0.3, 1.1, 0.2, RUBBER, { x: w / 2 - 3.5, y: h / 2 - 0.55, z: 0.8 })],
        }),
      )
    else g.add(drawerBox(d))
  })
  return g
}

// ---------- 平抽图纸柜：收进去的底座，五层又扁又宽的大抽屉，每层一只标签框（夹一张卡片）+ 一根长拉手 ----------

const MC = { w: 100, d: 70, h: 70, base: 7, n: 5 }
const MC_IX = MC.w / 2 - 1.8
const MC_Y0 = MC.base + 1.8
const MC_Y1 = MC.h - 1.8
const mcDrawers = (): DrawerSpec[] =>
  Array.from({ length: MC.n }, (_, i) => {
    const dh = (MC_Y1 - MC_Y0) / MC.n
    return { x0: -MC_IX, x1: MC_IX, y0: MC_Y0 + dh * i, y1: MC_Y0 + dh * (i + 1), z: MC.d / 2, depth: 64 }
  })
function mapCabinet(p: string[]) {
  const [body, metal] = p
  const g = new THREE.Group()
  const front = shade(body, 0.04)
  g.add(carcass(MC.w, MC.h, MC.d, body, { base: MC.base }))
  for (const o of mcDrawers())
    g.add(
      drawerBox({
        ...o,
        color: front,
        knob: false,
        front: (w, h) => [
          rbox(w, h, 1.6, front, { z: -0.8 }, 0.4),
          nub(9, 3.6, 0.5, metal, { y: h - 5.2, z: 0.15 }),
          nub(7.6, 2.4, 0.4, PAPER, { y: h - 4.6, z: 0.3 }),
          nub(30, 1.4, 1.6, metal, { y: 2, z: 0.8 }),
        ],
      }),
    )
  return g
}

// ---------- 洞洞板书桌组：方钢腿书桌，后腿往上长成两根立柱，柱子前面挂一整块洞洞板（几只挂钩、一块小搁板），顶上一根横梁 ----------

const PD = { w: 120, d: 60, h: 150, top: 74 }
/** 桌面 z -25..30；立柱 z -30..-26.5；洞洞板 z -26.5..-25.3，y 78..148 */
const PD_TZ0 = -25
const PD_POST_Z = -PD.d / 2 + 1.75
const PD_LX = PD.w / 2 - 3
const PD_BOARD = { y0: 78, h: 70, z: -25.9, w: PD_LX * 2 }
const PD_HOLE = 5.5
const PD_COLS = 19
const PD_ROWS = 12
/** 洞的位置：第 i 列、第 j 行（洞洞板局部 x、离地 y） */
const pdHole = (i: number, j: number): [number, number] => [(i - (PD_COLS - 1) / 2) * PD_HOLE, PD_BOARD.y0 + PD_BOARD.h / 2 + (j - (PD_ROWS - 1) / 2) * PD_HOLE]
/** 挂钩：[列, 行] */
const PD_HOOKS: [number, number][] = [
  [11, 8],
  [14, 8],
  [17, 6],
]
/** 小搁板：托架插在这两列、这一行 */
const PD_SHELF = { cols: [2, 7], row: 4 }
const PD_SHELF_D = 10
function pegboardDesk(p: string[]) {
  const [top, frame, board] = p
  const g = new THREE.Group()
  const ut = PD.top - 2.5
  const td = PD.d / 2 - PD_TZ0
  g.add(rbox(PD.w, 2.5, td, top, { y: ut, z: (PD_TZ0 + PD.d / 2) / 2 }, 1))
  for (const s of [-1, 1]) {
    const x = s * PD_LX
    // 前腿、通高的后立柱、两根侧横档
    g.add(rbox(3.5, ut, 3.5, frame, { x, z: PD.d / 2 - 3 }, 0.6))
    g.add(rbox(3.5, PD.h - 2.5, 3.5, frame, { x, z: PD_POST_Z }, 0.6))
    for (const y of [ut - 3, 10]) g.add(rbox(3, 3, PD.d / 2 - 4.75 - (PD_POST_Z + 1.75), frame, { x, y, z: (PD.d / 2 - 4.75 + PD_POST_Z + 1.75) / 2 }, 0.5))
  }
  g.add(rbox(PD_LX * 2 - 3.5, 3, 3, frame, { y: ut - 3, z: PD_POST_Z }, 0.5))
  g.add(rbox(PD_LX * 2 + 3.5, 2.5, 3.5, frame, { y: PD.h - 2.5, z: PD_POST_Z }, 0.6))
  // 洞洞板：n 边形小孔、不倒角（孔多，圆孔加倒角面数会翻好几倍）
  const holes: Hole[] = []
  for (let i = 0; i < PD_COLS; i++)
    for (let j = 0; j < PD_ROWS; j++) {
      const [x, y] = pdHole(i, j)
      holes.push({ kind: 'circle', x, y: y - PD_BOARD.y0, r: 0.55, n: 6 })
    }
  g.add(holePanel(PD_BOARD.w, PD_BOARD.h, 1.2, board, holes, { y: PD_BOARD.y0, z: PD_BOARD.z }, 1, { bevel: 0 }))
  // 挂钩：从洞里伸出来，末端上翘
  const zf = PD_BOARD.z + 0.6
  for (const [i, j] of PD_HOOKS) {
    const [x, y] = pdHole(i, j)
    g.add(rod3([x, y, zf - 0.6], [x, y, zf + 7], 0.35, STEEL, 6))
    g.add(rod3([x, y, zf + 7], [x, y + 2.5, zf + 8], 0.35, STEEL, 6))
  }
  // 小搁板：两只斜撑托架 + 带前挡边的金属板
  const [sxa, sya] = pdHole(PD_SHELF.cols[0], PD_SHELF.row)
  const [sxb] = pdHole(PD_SHELF.cols[1], PD_SHELF.row)
  const shelfY = sya + PD_HOLE
  const scx = (sxa + sxb) / 2
  const sw = sxb - sxa + 10
  for (const x of [sxa, sxb]) {
    g.add(rod3([x, sya, zf - 0.6], [x, shelfY, zf + PD_SHELF_D - 1], 0.35, STEEL, 6))
    g.add(rod3([x, shelfY, zf - 0.6], [x, shelfY, zf + PD_SHELF_D - 1], 0.35, STEEL, 6))
  }
  g.add(rbox(sw, 0.8, PD_SHELF_D, frame, { x: scx, y: shelfY + 0.35, z: zf + PD_SHELF_D / 2 }, 0.3))
  g.add(rbox(sw, 3, 0.6, frame, { x: scx, y: shelfY + 0.35, z: zf + PD_SHELF_D - 0.3 }, 0.2))
  return g
}
const pdShelfY = () => pdHole(0, PD_SHELF.row)[1] + PD_HOLE + 1.15

// ---------- 配色 ----------

const WD_PALS: Pal[] = [
  ['classic', [CL.walnut, '#4f6b3a', CL.gold]],
  ['retro', [R.caramel, '#7a2e2a', '#c9a25a']],
  ['chinese', [CN.rosewood, CN.jade, CN.brass]],
  ['farmhouse', [F.white, F.sage, F.oak]],
  ['cute', [C.white, C.sakura, C.lemon]],
]
const SEC_PALS: Pal[] = [
  ['classic', [CL.walnut, '#4f6b3a', CL.gold]],
  ['retro', [R.caramel, '#7a2e2a', '#c9a25a']],
  ['chinese', [CN.rosewood, CN.jade, CN.brass]],
  ['farmhouse', [F.white, F.sage, F.iron]],
  ['nordic', [N.oak, N.sage, M.black]],
]
const SD_PALS: Pal[] = [
  ['modern', [M.white, M.black, M.char]],
  ['modern', [M.walnut, M.black, M.black]],
  ['nordic', [N.oak, N.white, N.white]],
  ['nordic', ['#d8b98a', M.silver, M.gray]],
  ['industrial', [I.walnut, I.iron, I.iron]],
  ['cute', [C.woodL, C.white, C.pink]],
]
const LH_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.light]],
  ['modern', [M.walnut, M.black, M.char]],
  ['nordic', [N.oak, N.white, N.white]],
  ['industrial', [I.walnut, I.iron, I.walnut]],
  ['cute', [C.white, C.woodL, C.sky]],
]
const WL_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.sage]],
  ['nordic', [N.oakL, N.oak, N.white]],
  ['modern', [M.white, M.walnut, M.char]],
  ['japanese', [J.hinoki, J.wood, J.ai]],
  ['cute', [C.sky, C.white, C.pink]],
]
const LB_PALS: Pal[] = [
  ['classic', [CL.walnut, '#6b4a33', CL.gold]],
  ['nordic', [N.white, N.oak, M.black]],
  ['modern', [M.walnut, M.black, M.silver]],
  ['farmhouse', [F.white, F.oak, F.iron]],
  ['chinese', [CN.rosewood, CN.ivory, CN.brass]],
]
const BR_PALS: Pal[] = [
  ['classic', [CL.walnut, '#5e4330', CL.gold]],
  ['retro', [R.caramel, '#6b3e26', '#c9a25a']],
  ['nordic', [N.oakL, N.oak, M.black]],
  ['farmhouse', [F.white, F.oak, F.iron]],
  ['industrial', [I.walnut, I.iron, I.steel]],
]
const CB_PALS: Pal[] = [
  ['nordic', [N.white, N.oak]],
  ['nordic', [N.oak, N.sage]],
  ['modern', [M.black, M.walnut]],
  ['modern', [M.white, M.char]],
  ['cute', [C.white, C.pink]],
  ['japanese', [J.hinoki, J.ai]],
]
const RN_PALS: Pal[] = [
  ['nordic', [N.linen, N.white, N.oak]],
  ['nordic', [N.sage, N.linen, N.oakL]],
  ['modern', [M.char, M.light, M.walnut]],
  ['retro', [R.mustard, R.cream, R.caramel]],
  ['cute', [C.sakura, C.white, C.woodL]],
  ['classic', [CL.navy, CL.cream, CL.walnut]],
]
const DST_PALS: Pal[] = [
  ['modern', [M.black, M.char]],
  ['modern', [M.white, M.gray]],
  ['industrial', [I.iron, I.leather]],
  ['nordic', [M.white, N.sage]],
  ['cute', [C.white, C.pink]],
]
const KD_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.wood]],
  ['japanese', [J.wood, J.dark]],
  ['nordic', [N.oakL, N.white]],
  ['nordic', [N.white, N.oak]],
  ['modern', [M.walnut, M.black]],
]
const MP_PALS: Pal[] = [
  ['modern', [M.light, M.white, M.char]],
  ['modern', [M.char, M.walnut, M.silver]],
  ['nordic', [N.white, N.oakL, M.char]],
  ['industrial', [I.iron, I.steel, I.iron]],
  ['cute', [C.white, C.pink, C.woodD]],
]
const MC_PALS: Pal[] = [
  ['industrial', ['#6f7d74', M.silver]],
  ['industrial', [I.iron, I.steel]],
  ['nordic', [N.oak, M.silver]],
  ['modern', [M.white, M.char]],
  ['retro', [R.caramel, '#c9a25a']],
  ['classic', [CL.walnut, CL.gold]],
]
const PD_PALS: Pal[] = [
  ['modern', [M.white, M.black, M.white]],
  ['nordic', [N.oak, M.white, N.sage]],
  ['industrial', [I.walnut, I.iron, '#c8a77e']],
  ['modern', [M.walnut, M.char, M.light]],
  ['cute', [C.woodL, C.white, C.mint]],
]

// ---------- 可摆放层 ----------

const WD_SURF: SurfaceDef[] = [
  { y: WD_GTOP + 1.5, shape: [rectPoly(-WD_GX - 1.5, WD_GZ0 + 1.4, WD_GX + 1.5, WD_GZ1 + 0.5)] },
  { y: WD_HOLE, h: WD_GTOP - WD_HOLE, shape: wdCubbies().map(([x0, x1]) => rectPoly(x0 + 0.3, WD_GZ0 + 1.4, x1 - 0.3, WD_GZ1 - 0.3)) },
  ...wdDrawers().map((o) => drawerLevel(o)),
]
const secLevel = (y: number, top: number): SurfaceDef => ({ y, h: top - y, inside: true, glass: true, shape: [rectPoly(-SEC_IX + 0.4, -SEC.d / 2 + 2.4, SEC_IX - 0.4, SEC_UP_FRONT - 2.4)] })
const SEC_SURF: SurfaceDef[] = [
  { y: SEC_LOW, shape: [rectPoly(-SEC.w / 2 + 0.5, SEC_UP_FRONT + 0.5, SEC.w / 2 - 0.5, SEC.d / 2 - 0.5)] },
  secLevel(SEC_LOW + 1.8, SEC_SHELVES[0] - 1.6),
  secLevel(SEC_SHELVES[0], SEC_SHELVES[1] - 1.6),
  secLevel(SEC_SHELVES[1], SEC_LOW + SEC_UP_H - 1.8),
  { y: SEC_BED, h: SEC_FLAP_TOP - SEC_BED, inside: true, shape: [rectPoly(-SEC_IX + 0.4, SEC_PH_Z1 + 1.4, SEC_IX - 0.4, SEC.d / 2 - 2.4)] },
  ...[SEC_BED + 7, SEC_PH_MID + 1].map((y, i) => {
    const xs = [-SEC_IX, ...SEC_PH_DIV, SEC_IX]
    return { y, h: (i ? SEC_FLAP_TOP : SEC_PH_MID) - y, inside: true, shape: xs.slice(0, -1).map((x, k) => rectPoly(x + 0.8, SEC_PH_Z0 + 0.4, xs[k + 1] - 0.8, SEC_PH_Z1 - 0.3)) }
  }),
  ...secDrawers().map((o) => drawerLevel(o)),
]
const LH_SURF: SurfaceDef[] = [
  { y: LH.top, h: LH_SHELF - LH.top, shape: [rectPoly(LH_TOWER + 1.4, LH_Z0 + 1.2, LH.w / 2 - 2.4, LH_HZ1 - 0.6)] },
  { y: LH.top, h: LH_TMID - LH.top, shape: [rectPoly(LH_X0 + 2.4, LH_Z0 + 1.2, LH_TOWER - 1.4, LH_HZ1 - 0.6)] },
  { y: LH_TMID + 2, h: LH_SHELF - LH_TMID - 2, shape: [rectPoly(LH_X0 + 2.4, LH_Z0 + 1.2, LH_TOWER - 1.4, LH_HZ1 - 1.6)] },
  { y: LH_SHELF + 2, h: LH_TOPB - LH_SHELF - 2, shape: [rectPoly(LH_X0 + 2.4, LH_Z0 + 1.2, LH_TOWER - 1.4, LH_HZ1 - 1.6), rectPoly(LH_TOWER + 1.4, LH_Z0 + 1.2, LH.w / 2 - 2.4, LH_HZ1 - 1.6)] },
  { y: LH_TOPB + 2, shape: [rectPoly(LH_X0 + 0.5, LH_Z0 + 0.5, LH.w / 2 - 0.5, LH_HZ1 - 0.5)] },
]
const WL_IX = WL.w / 2 - 1.8
const WL_SURF: SurfaceDef[] = [
  { y: WL_BOX0 + 1.8, h: WL_SHELF - 1.5 - WL_BOX0 - 1.8, shape: [rectPoly(-WL_IX + 0.4, WL_BACK + 1.4, 15, WL_FRONT - 0.4), rectPoly(17, WL_BACK + 1.4, WL_IX - 0.4, WL_FRONT - 0.4)] },
  { y: WL_SHELF, h: WL_TOP - 1.8 - WL_SHELF, shape: [rectPoly(-WL_IX + 0.4, WL_BACK + 1.4, -19, WL_FRONT - 0.4), rectPoly(-17, WL_BACK + 1.4, WL_IX - 0.4, WL_FRONT - 0.4)] },
  { y: WL_TOP, shape: [rectPoly(-WL.w / 2 + 0.5, WL_BACK + 0.5, WL.w / 2 - 0.5, WL_FRONT - 0.5)] },
]
const LB_LEVELS = [LB_FLOOR, ...LB_SHELVES]
const LB_SURF: SurfaceDef[] = LB_LEVELS.map((y, i) => ({
  y,
  h: (LB_SHELVES[i] ?? LB_CEIL + 1.8) - 1.8 - y,
  shape: lbBays().map(([x0, x1]) => rectPoly(x0 + 0.4, -LB.d / 2 + 2.2, x1 - 0.4, LB_FRONT - 0.6)),
}))
const BR_SURF: SurfaceDef[] = Array.from({ length: BR.n }, (_, i) => ({
  y: brY(i) + 2,
  h: BR.mod - 3.6,
  inside: true,
  glass: true,
  shape: [rectPoly(-BR_IX + 0.4, -BR.d / 2 + 1.4, BR_IX - 0.4, BR.d / 2 - 2.4)],
}))
const CB_SURF: SurfaceDef[] = CB_ROWS.map((y) => ({ y, h: CB_ROW_H, shape: [] as Poly[] })).map((l, r) => ({ ...l, shape: cbCells(r).map(([x0, x1]) => rectPoly(x0 + 0.4, -CB.d / 2 + 1.6, x1 - 0.4, CB.d / 2 - 0.6)) }))
const RN_UX0 = RN_SPLIT + 1.8
const RN_UX1 = RN.w / 2 - 1.8
const RN_SURF: SurfaceDef[] = [
  { y: 4 + 1.8, h: 32 - 1.6 - 5.8, shape: [rectPoly(RN_UX0 + 0.4, -RN.d / 2 + 2.2, RN_UX1 - 0.4, RN.d / 2 - 0.6)] },
  { y: 32, h: RN_TABLE - 1.8 - 32, shape: [rectPoly(RN_UX0 + 0.4, -RN.d / 2 + 2.2, RN_UX1 - 0.4, RN.d / 2 - 0.6)] },
  { y: RN_TABLE, shape: [rectPoly(RN_SPLIT + 0.5, RN_TFRONT + 0.5, RN.w / 2 - 0.5, RN.d / 2 - 0.5)] },
  ...[RN_TABLE + 1.8, ...RN_TOWER_SHELVES].map((y, i) => ({ y, h: (RN_TOWER_SHELVES[i] ?? RN.h) - (i < 2 ? 1.6 : 1.8) - y, shape: [rectPoly(RN_UX0 + 0.4, -RN.d / 2 + 2.2, RN_UX1 - 0.4, RN_TFRONT - 0.6)] })),
  { y: RN.h, shape: [rectPoly(RN_SPLIT + 0.5, -RN.d / 2 + 0.5, RN.w / 2 - 0.5, RN_TFRONT - 0.5)] },
]
const KD_SURF: SurfaceDef[] = [
  { y: KD_FLOOR, h: KD_MID - 1.6 - KD_FLOOR, shape: [rectPoly(KD_IN + 0.4, -KD_SD / 2 + 1.4, KD_OUT - 0.4, KD_SD / 2 - 0.4)] },
  { y: KD_MID, h: KD_UNDER - KD_MID, shape: [rectPoly(KD_IN + 0.4, -KD_SD / 2 + 1.4, KD_OUT - 0.4, KD_SD / 2 - 0.4)] },
]
const PD_SURF: SurfaceDef[] = [
  {
    y: pdShelfY(),
    h: 20,
    shape: [rectPoly(pdHole(PD_SHELF.cols[0], 0)[0] - 4.6, PD_BOARD.z + 1.2, pdHole(PD_SHELF.cols[1], 0)[0] + 4.6, PD_BOARD.z + 0.6 + PD_SHELF_D - 1)],
  },
  {
    y: pdHole(0, PD_HOOKS[0][1])[1] + 0.8,
    kind: 'hook',
    h: 40,
    shape: PD_HOOKS.map(([i, j]) => {
      const x = pdHole(i, j)[0]
      return rectPoly(x - 2, PD_BOARD.z + 4.6, x + 2, PD_BOARD.z + 8.6)
    }),
  },
]

const DESK: Partial<AssetDef> = { type: 'desk', tags: ['table'] }
const BOOKCASE: Partial<AssetDef> = { type: 'bookshelf', tags: ['cabinet', 'shelving', 'hobby:reading'] }
const OPEN_BOOKCASE: Partial<AssetDef> = { type: 'bookshelf', tags: ['cabinet', 'shelving', 'open-shelf', 'hobby:reading'] }

export const STUDY_MORE: AssetDef[] = [
  define('sm-writing-desk', '复古写字台', 'study', [WD.w, WD.d, WD.h], WD_PALS, writingDesk, {
    ...DESK,
    mats: ['wood', 'leather', 'metal'],
    sizeLabel: '110×55',
    // 桌面：格架前面那一截；格架顶、信插格、抽屉另算
    surface: WD.top,
    surfaceShape: [rectPoly(-WD.w / 2 + 1, WD_GZ1 + 0.5, WD.w / 2 - 1, WD.d / 2 - 1)],
    surfaces: WD_SURF,
    openable: true,
  }),
  define('sm-secretary', '翻板写字柜', 'study', [SEC.w, SEC.d, SEC.h], SEC_PALS, secretaryBookcase, {
    ...BOOKCASE,
    mats: ['wood', 'leather', 'metal'],
    surface: SEC.h,
    surfaceShape: [rectPoly(-SEC.w / 2 + 0.5, -SEC.d / 2 + 0.5, SEC.w / 2 - 0.5, SEC_UP_FRONT)],
    surfaces: SEC_SURF,
    openable: true,
  }),
  define('sm-standing-desk-frame', '双腿电动升降桌', 'study', [SD.w, SD.d, SD.h], SD_PALS, standingDesk, {
    ...DESK,
    tags: ['table', 'gaming-desk'],
    mats: ['wood', 'metal', 'plastic'],
    sizeLabel: '160×75',
    surface: SD.h,
    surfaceShape: [roundRect(SD.w - 1, SD.d - 1, 5.5)],
  }),
  define('sm-l-desk-hutch', '带上架的 L 形书桌', 'study', [LH.w, LH.d, LH.h], LH_PALS, lDeskHutch, {
    ...DESK,
    mats: ['wood', 'wood', 'wood'],
    sizeLabel: 'L 形 160×140',
    // 桌面：上架前面的 L 形部分；上架下面、各层另算
    surface: LH.top,
    surfaceShape: [
      [
        [LH_X0, LH_HZ1],
        [LH.w / 2, LH_HZ1],
        [LH.w / 2, LH.d / 2],
        [LH.w / 2 - LH.ret, LH.d / 2],
        [LH.w / 2 - LH.ret, LH_Z0 + LH.arm],
        [LH_X0, LH_Z0 + LH.arm],
      ],
    ],
    surfaces: LH_SURF,
  }),
  define('sm-wall-desk', '壁挂折叠书桌', 'study', [WL.w, WL.d, WL.h], WL_PALS, wallDesk, {
    ...DESK,
    mats: ['wood', 'wood', 'wood'],
    sizeLabel: '80×45',
    mount: WL.mount,
    surface: WL_LEAF,
    surfaceShape: [rectPoly(-WL.w / 2 + 0.5, WL_FRONT + 0.3, WL.w / 2 - 0.5, WL.d / 2 - 0.5)],
    surfaces: WL_SURF,
  }),
  define('sm-library-ladder', '图书馆书墙（滑轨梯）', 'study', [LB.w, LB.d, LB.h], LB_PALS, libraryWall, {
    ...OPEN_BOOKCASE,
    mats: ['wood', 'wood', 'metal'],
    surface: LB.h,
    surfaceShape: [rectPoly(-LB.w / 2 + 0.5, -LB.d / 2 + 0.5, LB.w / 2 - 0.5, LB_FRONT + 1)],
    surfaces: LB_SURF,
  }),
  define('sm-barrister', '律师书柜', 'study', [BR.w, BR.d, BR.h], BR_PALS, barristerCase, {
    ...BOOKCASE,
    mats: ['wood', 'wood', 'metal'],
    surface: BR.h,
    surfaces: BR_SURF,
    openable: true,
  }),
  define('sm-cube-bookcase', '错层方格书架', 'study', [CB.w, CB.d, CB.h], CB_PALS, cubeBookcase, {
    ...OPEN_BOOKCASE,
    mats: ['wood', 'wood'],
    surface: CB.h,
    surfaces: CB_SURF,
  }),
  define('sm-reading-nook', '阅读角（沙发椅 + 书塔 + 灯臂）', 'study', [RN.w, RN.d, RN.h], RN_PALS, readingNook, {
    type: 'armchair',
    tags: ['seat', 'hobby:reading'],
    mats: ['fabric', 'fabric', 'wood'],
    surfaces: RN_SURF,
  }),
  define('sm-drafting-stool', '绘图高凳', 'study', [DST.w, DST.d, DST.h], DST_PALS, draftingStool, {
    type: 'stool',
    tags: ['seat'],
    mats: ['plastic', 'fabric'],
  }),
  define('sm-kneeling-desk', '坐地书桌（带书格）', 'study', [KD.w, KD.d, KD.h], KD_PALS, kneelingDesk, {
    type: 'low-table',
    tags: ['table'],
    mats: ['wood', 'wood'],
    sizeLabel: '100×50',
    surface: KD.h,
    surfaces: KD_SURF,
  }),
  define('sm-mobile-pedestal', '活动抽屉柜', 'study', [MP.w, MP.d, MP.h], MP_PALS, mobilePedestal, {
    type: 'storage-cabinet',
    tags: ['cabinet'],
    mats: [null, null, 'metal'],
    surface: MP.h,
    surfaces: mpDrawers().map((o) => drawerLevel(o)),
    openable: true,
  }),
  define('sm-map-cabinet', '平抽图纸柜', 'study', [MC.w, MC.d, MC.h], MC_PALS, mapCabinet, {
    type: 'storage-cabinet',
    tags: ['cabinet'],
    mats: [null, 'metal'],
    surface: MC.h,
    surfaces: mcDrawers().map((o) => drawerLevel(o)),
    openable: true,
  }),
  define('sm-pegboard-desk', '洞洞板书桌组', 'study', [PD.w, PD.d, PD.h], PD_PALS, pegboardDesk, {
    ...DESK,
    mats: ['wood', 'metal', 'wood'],
    sizeLabel: '120 带洞洞板',
    surface: PD.top,
    surfaceShape: [rectPoly(-PD.w / 2 + 0.5, PD_TZ0 + 0.5, PD.w / 2 - 0.5, PD.d / 2 - 0.5)],
    surfaces: PD_SURF,
  }),
]
