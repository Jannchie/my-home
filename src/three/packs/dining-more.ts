// 餐厅家具补充：郁金香底座圆桌、玻璃面 X 腿餐桌、原木自然边餐桌、靠墙折叠餐桌、带餐位的厨房吧台、软包靠背餐凳、
// 叉骨靠背编绳椅、金属咖啡馆椅、圆背软包扶手餐椅、儿童增高垫餐椅、中古风餐边柜、上玻璃下柜碗橱、吧台酒柜、木质双层餐车。
// 约定见 kit.ts 开头：原点在占地中心底面，正面朝 +z；桌面、柜内层板留空并声明 surface / surfaces。
// 餐桌高 75、桌下 63cm 以下不放横撑（一键布置会配椅子，腿要伸得进去）；餐椅座高 45–47。

import * as THREE from 'three'
import { ball, cyl, plate, puck, rbox, shade, torus, tray } from '../toon'
import { C, carcass, drawerBox, drawerLevel, ellipsePoly, flapDoor, hingedDoor, paintPanel, rectPoly, slab, slidingDoors, type AssetDef, type Poly, type SurfaceDef } from '../kit'
import { P, PI, batten, cappedTube, cylX, cylZ, fitGroup, ghost, latheAt, rod3, sideSlab, strut, strutBox, taperRod3, tube, type V2, type V3 } from '../geo'
import { doorPanel } from '../cabinetKit'
import { CL, F, I, J, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const RUBBER = '#3a3b40'
const IRON = '#34353a'

/** 木纹画面：底色 + 几道弯弯的深色纹（推拉门、餐边柜门板用） */
function grainDraw(base: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.strokeStyle = shade(base, -0.12)
    g.lineWidth = Math.max(1, W * 0.012)
    for (let i = 0; i < 9; i++) {
      const x0 = W * (0.06 + i * 0.11)
      g.beginPath()
      g.moveTo(x0, 0)
      for (let k = 1; k <= 12; k++) g.lineTo(x0 + Math.sin(k * 0.9 + i * 1.7) * W * 0.018, (H * k) / 12)
      g.stroke()
    }
    // 一两处木节一样的椭圆纹
    g.beginPath()
    g.ellipse(W * 0.62, H * 0.38, W * 0.05, H * 0.07, 0, 0, Math.PI * 2)
    g.stroke()
  }
}

// ---------- 郁金香底座圆餐桌：车削的喇叭形单底座（圆盘脚 → 细腰 → 往上张开托住桌面）+ 大理石圆面，面上几道石纹 ----------

const PED = { r: 55, h: 75, t: 3 }
function pedestalRound(p: string[]) {
  const [marble, base, vein] = p
  const g = new THREE.Group()
  const ty = PED.h - PED.t
  // 底座轮廓 [半径, 高度]：贴地的圆盘脚微微鼓起，收成细腰，上端张开成托盘
  const prof: V2[] = [
    [0, 0],
    [28, 0],
    [28.6, 0.8],
    [27, 2.4],
    [19, 4.6],
    [11, 9],
    [7, 18],
    [5.4, 30],
    [5.2, 48],
    [6.2, 60],
    [9.5, 67],
    [15, 71],
    [15.5, ty + 0.4],
    [0, ty + 0.4],
  ]
  g.add(latheAt(prof, base, {}, 40))
  g.add(slab(ellipsePoly(PED.r, PED.r, 0, 0, 48), PED.t, marble, ty))
  // 石纹：几道斜着的细纹（贴片浮出台面 0.06）
  const veins: [x: number, z: number, len: number, ry: number, w: number][] = [
    [-12, -8, 46, 0.5, 0.5],
    [6, 10, 38, 0.62, 0.35],
    [-22, 14, 22, -0.3, 0.3],
    [20, -18, 26, 0.9, 0.4],
    [2, -26, 18, 0.2, 0.25],
  ]
  for (const [x, z, len, ry, w] of veins) g.add(plate(len, w, vein, { x, y: PED.h + 0.06, z, ry }))
  return g
}

// ---------- 玻璃面 X 腿餐桌：两端各一副钢方管 X 架（落地横档 + 交叉斜撑 + 顶横档），两根长梁连起来，胶垫托着钢化玻璃 ----------

const TG = { w: 180, d: 90, h: 75, glass: 1.2, fx: 72 }
function trestleGlass(p: string[]) {
  const [frame, glass, pad] = p
  const g = new THREE.Group()
  const topY = TG.h - TG.glass - 0.8
  const zz = 38
  for (const s of [-1, 1]) {
    const x = s * TG.fx
    g.add(rbox(4, 2.4, zz * 2 + 6, frame, { x }, 0.6))
    g.add(rbox(4, 3, zz * 2 + 6, frame, { x, y: topY - 3 }, 0.6))
    // X：两根方管从落地横档斜到顶横档
    for (const k of [-1, 1]) g.add(strutBox([x, 1.6, k * zz], [x, topY - 2.2, -k * zz], 4, 3.6, frame))
    // 交叉处的方板
    g.add(rbox(4.6, 6, 6, shade(frame, -0.08), { x, y: (topY - 0.6) / 2 - 3 }, 0.6))
  }
  // 两根长梁（顶横档之间，梁底 70 往上，不挡腿）
  for (const s of [-1, 1]) g.add(rbox(TG.fx * 2, 3, 3, frame, { y: topY - 3, z: s * 30 }, 0.6))
  // 胶垫
  for (const x of [-TG.fx, 0, TG.fx]) for (const s of [-1, 1]) g.add(cyl(2, 2, 0.8, pad, { x, y: topY, z: s * 30 }, 12))
  // 玻璃面
  g.add(ghost(rbox(TG.w, TG.glass, TG.d, glass, { y: TG.h - TG.glass }, 0.5), glass, 0.38))
  return g
}

// ---------- 原木自然边餐桌：前后两条长边是不规则的树皮边（深色），两端锯平；面上一道裂缝和一枚蝴蝶榫；两副黑铁 ∩ 形腿 ----------

const LE = { w: 200, d: 95, h: 75, t: 4.7 }
/** 自然边离占地边缘往里收的量（0–7cm），前后两条边各一套起伏 */
const edgeIn = (x: number, k: number) => 3.4 + 2.2 * Math.sin(x * 0.045 + 0.7 + k * 2.3) + 1.1 * Math.sin(x * 0.13 + 2.1 + k)
/** 桌面轮廓：沿前边从左到右，再沿后边从右到左；inset 为前后自然边再往里收 */
function liveEdgePoly(inset: number, xEnd = LE.w / 2): Poly {
  const n = 26
  const front: Poly = []
  const back: Poly = []
  for (let i = 0; i <= n; i++) {
    const x = -xEnd + (2 * xEnd * i) / n
    front.push([x, LE.d / 2 - edgeIn(x, 0) - inset])
    back.push([x, -LE.d / 2 + edgeIn(x, 1) + inset])
  }
  return [...front, ...back.reverse()]
}
function liveEdge(p: string[]) {
  const [wood, bark, iron] = p
  const g = new THREE.Group()
  const y0 = LE.h - LE.t
  // 树皮层在下、略大；木面层往里收 1.2，顶面高出树皮层 0.6，从上面看是一圈深色的毛边
  g.add(slab(liveEdgePoly(0, LE.w / 2 - 0.4), LE.t - 0.6, bark, y0))
  g.add(slab(liveEdgePoly(1.2), LE.t - 0.3, wood, y0 + 0.3))
  // 一道从端头裂进来的缝 + 跨缝的蝴蝶榫（嵌在木面里、顶面高出 0.1）
  g.add(plate(30, 0.4, shade(bark, -0.1), { x: -84, y: LE.h + 0.06, z: 6, ry: 0.05 }))
  const bow: Poly = [
    [-1.8, -3.2],
    [1.8, -3.2],
    [0.7, 0],
    [1.8, 3.2],
    [-1.8, 3.2],
    [-0.7, 0],
  ]
  g.add(slab(bow.map(([x, z]): [number, number] => [x - 76, z + 6.4]), 0.5, bark, LE.h - 0.4))
  // 木纹：几道顺着长边的细线
  for (const [x, z, len] of [
    [-30, -14, 70],
    [24, 4, 90],
    [40, -26, 60],
    [-46, 22, 50],
  ] as const)
    g.add(plate(len, 0.25, shade(wood, -0.14), { x, y: LE.h + 0.06, z, ry: 0.02 }))
  // ∩ 形铁腿：顶横档贴在桌面下，两根立腿到地，脚下调平垫
  for (const s of [-1, 1]) {
    const x = s * (LE.w / 2 - 22)
    g.add(rbox(7, 4, 78, iron, { x, y: y0 - 4 }, 0.6))
    for (const k of [-1, 1]) {
      g.add(rbox(7, y0 - 4 - 0.8, 3, iron, { x, y: 1, z: k * 37.5 }, 0.6))
      g.add(rbox(7.6, 1.2, 3.6, shade(iron, -0.05), { x, z: k * 37.5 }, 0.3))
    }
  }
  return g
}

// ---------- 靠墙折叠餐桌：贴墙的半张固定桌面 + 前面一块翻板支平，两只钢制折叠撑托住翻板；四条方锥腿都在固定半边下面 ----------

const DL = { w: 100, d: 70, h: 75, fixed: 32 }
function dropLeafWall(p: string[]) {
  const [top, frame, metal] = p
  const g = new THREE.Group()
  const ty = DL.h - 3
  const back = -DL.d / 2
  const hingeZ = back + DL.fixed
  g.add(rbox(DL.w, 3, DL.fixed, top, { y: ty, z: back + DL.fixed / 2 }, 0.8))
  // 翻板：中间一道细缝，缝里一条深色的合页线
  const leafD = DL.d - DL.fixed - 0.4
  g.add(rbox(DL.w, 3, leafD, top, { y: ty, z: DL.d / 2 - leafD / 2 }, 0.8))
  g.add(rbox(DL.w - 2, 2.4, 0.6, shade(top, -0.35), { y: ty + 0.2, z: hingeZ + 0.2 }, 0.1))
  for (const x of [-30, 30]) g.add(cylX(0.8, 8, metal, x, ty - 0.5, hingeZ + 0.2, 10))
  // 框：四条腿 + 一圈裙板（裙板底 64，不挡腿）
  const lx = DL.w / 2 - 4
  const zb = back + 3
  const zf = hingeZ - 3
  for (const x of [-lx, lx])
    for (const z of [zb, zf]) g.add(taperRod3([x, 0, z], [x, ty, z], 1.2, 1.9, frame, 4))
  for (const z of [zb, zf]) g.add(rbox(lx * 2 - 2, 8, 2, frame, { y: ty - 8, z }, 0.4))
  for (const x of [-lx, lx]) g.add(rbox(2, 8, zf - zb - 2, frame, { x, y: ty - 8, z: (zb + zf) / 2 }, 0.4))
  // 折叠撑：竖片钉在前裙板上，斜撑和横臂托住翻板底
  for (const x of [-30, 30]) {
    const zf0 = zf + 1
    g.add(rbox(1.2, 16, 3, metal, { x, y: ty - 16, z: zf0 + 1.5 }, 0.3))
    g.add(strutBox([x, ty - 15, zf0 + 2.6], [x, ty - 0.6, zf0 + 26], 1, 2.4, metal, 0.3))
    g.add(rbox(1, 1.2, 28, metal, { x, y: ty - 1.2, z: zf0 + 14 }, 0.3))
  }
  return g
}

// ---------- 带餐位的厨房吧台：正面是柜（左三抽、中两门、右一抽一门），背面挑出 30cm 台面，三只三角钢托 + 一根搁脚杆，背板竖条护墙 ----------

const CI = { w: 180, d: 90, h: 92, body: 176, cd: 58, base: 10 }
const CI_FRONT = CI.d / 2 - 1.6
const CI_CZ = CI_FRONT - CI.cd / 2
const CI_BACK = CI_FRONT - CI.cd
/** 柜内的前后范围（背板前、门后） */
const CI_IZ: [number, number] = [CI_BACK + 1.8 + 0.4, CI_FRONT - 0.8]
const CI_DRAWERS = [
  { x0: -87, x1: -30, y0: 11, y1: 36.3 },
  { x0: -87, x1: -30, y0: 36.3, y1: 61.6 },
  { x0: -87, x1: -30, y0: 61.6, y1: 86.9 },
  { x0: 30, x1: 87, y0: 66, y1: 86.9 },
].map((o) => ({ ...o, z: CI.d / 2, depth: 50 }))
function counterIsland(p: string[]) {
  const [body, top, metal] = p
  const g = new THREE.Group()
  g.add(P(carcass(CI.body, CI.h - 4, CI.cd, body, { base: CI.base }), 0, 0, CI_CZ))
  g.add(rbox(CI.w, 4, CI.d, top, { y: CI.h - 4 }, 0.6))
  // 柜内：两块竖隔板、中格一块层板、右格抽屉下的托板
  const iy = CI.base + 1.8
  const idz = (CI_IZ[0] + CI_IZ[1]) / 2
  for (const x of [-30, 30]) g.add(rbox(1.8, CI.h - 4 - 1.8 - iy, 56, body, { x, y: iy, z: idz }, 0.3))
  g.add(rbox(58, 1.6, 54, body, { y: 46.4, z: idz }, 0.3))
  g.add(rbox(55, 1.8, 56, body, { x: 58.5, y: 64.2, z: idz }, 0.3))
  // 门、抽屉
  for (const o of CI_DRAWERS) g.add(drawerBox({ ...o, color: body, knob: metal }))
  g.add(hingedDoor({ x0: -30, x1: 0, y0: 11, y1: 86.9, z: CI.d / 2, hinge: 'left', color: body, knob: metal }))
  g.add(hingedDoor({ x0: 0, x1: 30, y0: 11, y1: 86.9, z: CI.d / 2, hinge: 'right', color: body, knob: metal }))
  g.add(hingedDoor({ x0: 30, x1: 87, y0: 11, y1: 66, z: CI.d / 2, hinge: 'right', color: body, knob: metal }))
  // 餐位一侧：背板外的竖条护墙板
  const n = 22
  for (let i = 0; i < n; i++) g.add(rbox(7.4, CI.h - 4 - 0.8, 1.2, shade(body, i % 2 ? 0.03 : -0.03), { x: -CI.body / 2 + 2 + ((CI.body - 4) * (i + 0.5)) / n, y: 0.4, z: CI_BACK - 0.5 }, 0.4))
  // 三角钢托
  const bz = CI_BACK - 1
  for (const x of [-58, 0, 58])
    g.add(
      sideSlab(
        [
          [bz, CI.h - 3.9],
          [-CI.d / 2 + 6, CI.h - 3.9],
          [bz, CI.h - 28],
        ],
        1.2,
        metal,
        x,
      ),
    )
  // 搁脚杆（离地 22）+ 三根支杆
  const fz = CI_BACK - 11
  g.add(cylX(1.3, CI.body - 6, metal, 0, 22, fz, 14))
  for (const x of [-70, 0, 70]) g.add(rod3([x, 22, fz], [x, 22, CI_BACK - 1], 0.9, metal))
  return g
}
const ciRect = (x0: number, x1: number) => [rectPoly(x0 + 0.4, CI_IZ[0], x1 - 0.4, CI_IZ[1])]
const CI_SURF: SurfaceDef[] = [
  { y: CI.base + 1.8, h: 46.4 - CI.base - 1.8, inside: true, shape: ciRect(-29.1, 29.1) },
  { y: 48, h: CI.h - 4 - 1.8 - 48, inside: true, shape: ciRect(-29.1, 29.1) },
  { y: CI.base + 1.8, h: 64.2 - CI.base - 1.8, inside: true, shape: ciRect(30.9, 86.2) },
  ...CI_DRAWERS.map((o) => drawerLevel(o)),
]

// ---------- 软包靠背餐凳：140 宽的长凳，木框四条锥腿，厚坐垫；后腿一直伸上去夹住竖条绗缝的软包靠背 ----------

const BN = { w: 140, d: 45, h: 80, seat: 46 }
function benchBack(p: string[]) {
  const [fabric, wood] = p
  const g = new THREE.Group()
  const lx = BN.w / 2 - 6
  // 裙框 + 坐垫
  g.add(rbox(BN.w - 6, 5, BN.d - 6, wood, { y: 33, z: 1 }, 0.8))
  // 坐垫在后柱前面（后柱不穿过坐垫）
  g.add(rbox(BN.w, BN.seat - 37, 38, fabric, { y: 37, z: 3.5 }, 3))
  // 前腿：上粗下细
  for (const s of [-1, 1]) g.add(cyl(2.2, 1.5, 33.5, wood, { x: s * lx, z: BN.d / 2 - 6 }, 12))
  // 后腿 + 靠背立柱：一根到顶，往后微仰
  const zp = (y: number) => -BN.d / 2 + 4.5 - ((y - 33.5) / 45.5) * 3
  for (const s of [-1, 1]) {
    g.add(cyl(2.2, 1.5, 33.5, wood, { x: s * lx, z: -BN.d / 2 + 4.5 }, 12))
    g.add(strutBox([s * lx, 33, zp(33)], [s * lx, BN.h - 1.5, zp(BN.h - 1.5)], 3.4, 3.4, wood, 0.8))
  }
  // 软包靠背：背板夹在两根立柱之间，前面 8 条竖向绗缝
  const back = new THREE.Group()
  back.add(rbox(lx * 2, 25, 2, wood, {}, 0.6))
  const n = 8
  const cw = (lx * 2 - 3.4) / n
  for (let i = 0; i < n; i++) back.add(rbox(cw + 0.4, 27, 6.4, fabric, { x: -lx + 1.7 + cw * (i + 0.5), y: -1, z: 4 }, 2.8))
  g.add(P(back, 0, 50, zp(50), -Math.atan(3 / 45.5)))
  return g
}

// ---------- 叉骨靠背编绳椅：两条后腿往上接一道弯木拱背（半椭圆），拱里一只叉骨形（Y）撑从座框后档分叉顶到拱上；四框编绳座面 ----------

const WB = { w: 52, d: 48, h: 75, seat: 45, hw: 24 }
/** 靠背所在的斜面：越高越往后 */
const wbZ = (y: number) => -21 - (y - 46) * 0.15
/** 拱背：t = ±π/2 落在两条后腿顶（y 52），t = 0 是拱顶 */
const wbArch = (t: number): V3 => {
  const y = 52 + 22 * Math.cos(t)
  return [WB.hw * Math.sin(t), y, wbZ(y)]
}
function wishboneCord(p: string[]) {
  const [wood, cord] = p
  const g = new THREE.Group()
  const hw = WB.hw
  // 腿：前腿到座框，后腿一直到拱背两端
  for (const s of [-1, 1]) {
    g.add(taperRod3([s * hw, 0, 19.5], [s * hw, WB.seat, 19], 1.4, 1.8, wood, 10))
    g.add(taperRod3([s * hw, 0, -20.4], wbArch((s * PI) / 2), 1.4, 1.7, wood, 10))
    // 侧横撑
    g.add(rod3([s * hw, 16, 19.4], [s * hw, 16, -20.6], 0.9, wood, 8))
  }
  g.add(rod3([-hw, 20, 19.3], [hw, 20, 19.3], 0.9, wood, 8))
  // 座框四根方料
  for (const z of [19, -21]) g.add(rbox(hw * 2 + 1, 4, 3, wood, { y: WB.seat - 4, z }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(3, 4, 40, wood, { x: s * hw, y: WB.seat - 4, z: -1 }, 0.8))
  // 编绳座面：底 + 横竖两层粗纸绳
  g.add(rbox(hw * 2 - 5, 1.2, 37, cord, { y: WB.seat - 2.2, z: -1 }, 0.4))
  for (let i = 0; i < 9; i++) {
    const z = -17.6 + i * 4.2
    g.add(strut([-(hw - 1.6), WB.seat - 0.4, z], [hw - 1.6, WB.seat - 0.4, z], 0.9, cord, 0.9, 6))
  }
  for (let j = 0; j < 11; j++) {
    const x = -(hw - 3.5) + (j * (hw - 3.5) * 2) / 10
    g.add(strut([x, WB.seat + 0.2, -19], [x, WB.seat + 0.2, 17], 0.9, cord, 0.9, 6))
  }
  // 弯木拱背
  g.add(tube(Array.from({ length: 17 }, (_, i) => wbArch(-PI / 2 + (i / 16) * PI)), 1.5, wood, { seg: 40 }))
  // 叉骨撑：从座框后档立起，分叉顶到拱背上
  const fork: V3 = [0, 55, wbZ(55)]
  g.add(strutBox([0, WB.seat - 1, wbZ(WB.seat - 1)], fork, 4.2, 1.6, wood, 0.6))
  for (const s of [-1, 1]) g.add(strutBox(fork, wbArch(s * 0.65), 3.2, 1.5, wood, 0.6))
  return fitGroup(g)
}

// ---------- 金属咖啡馆椅：细钢管一笔弯成后腿 + 弧背（中间两道横弧），两条前腿外撇，座下一圈箍，圆座面带包边 ----------

const CF = { w: 43, d: 47, h: 82, seat: 46 }
function cafeChair(p: string[]) {
  const [frame, seat, glide] = p
  const g = new THREE.Group()
  const r = 1.1
  // 后腿 + 靠背：一根管从左脚上去、绕过靠背顶、下到右脚
  const half: V3[] = [
    [19.6, 1.6, -19.5],
    [15.8, 22, -16.2],
    [13, 43.8, -14],
    [14.8, 58, -17],
    [16.4, 72, -20.4],
    [13.2, 80, -22.9],
  ]
  const back = [...half.map(([x, y, z]): V3 => [-x, y, z]), [0, 80.9, -24.3] as V3, ...[...half].reverse()]
  g.add(cappedTube(back, r, frame, { seg: 72 }))
  // 靠背中间两道横弧（两端插进立管）
  for (const [y, x, z] of [
    [58, 14.6, -17],
    [66.5, 15.6, -19],
  ] as const)
    g.add(tube([[-x, y, z], [-x * 0.5, y + 1, z - 2.2], [0, y + 1.3, z - 2.8], [x * 0.5, y + 1, z - 2.2], [x, y, z]], 0.8, frame, { seg: 20 }))
  // 前腿：从座圈下外撇到地
  for (const s of [-1, 1]) g.add(cappedTube([[s * 13, 43.8, 12], [s * 15.8, 22, 15.6], [s * 19.6, 1.6, 19.5]], r, frame, { seg: 16 }))
  // 座下箍
  g.add(torus(18.4, 0.8, frame, { y: 43.8, z: -1, rx: PI / 2 }))
  // 圆座面 + 一圈包边
  g.add(puck(20, 2.4, seat, { y: CF.seat - 2.4, z: -1 }))
  g.add(torus(19.6, 0.7, shade(seat, -0.12), { y: CF.seat - 1.2, z: -1, rx: PI / 2 }))
  // 脚垫
  for (const [x, z] of [
    [19.6, -19.5],
    [-19.6, -19.5],
    [19.6, 19.5],
    [-19.6, 19.5],
  ])
    g.add(cyl(1.4, 1.5, 1.4, glide, { x, z }, 10))
  return fitGroup(g)
}

// ---------- 圆背软包扶手餐椅：一圈竖向绗缝的软包围成圆背（背后最高、往两侧扶手渐低），圆坐垫，四条外撇木腿带铜脚套 ----------

const UA = { w: 58, d: 55, h: 80, seat: 47 }
function upholsteredArm(p: string[]) {
  const [fabric, wood, ferrule] = p
  const g = new THREE.Group()
  // 座台（裙）+ 坐垫
  g.add(cyl(25.5, 24, 6, fabric, { y: 36 }, 32))
  g.add(puck(22.5, 7.4, fabric, { y: UA.seat - 7.4, z: 2 }))
  // 圆背：11 条竖包，沿半径 25 的圆弧从左扶手绕到右扶手
  const n = 11
  const A = (100 * PI) / 180
  for (let i = 0; i < n; i++) {
    const a = -A + (2 * A * i) / (n - 1)
    const top = 61 + 19 * ((Math.cos(a) + 0.18) / 1.18)
    const m = rbox(8.8, top - 38, 8, fabric, {}, 3.6)
    g.add(P(m, Math.sin(a) * 25, 38 + (top - 38) / 2, -Math.cos(a) * 25, 0, -a, 0))
  }
  // 腿：从座台底往外撇到地，脚上一截铜套
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(taperRod3([c * 21, 3, s * 21], [c * 16, 36.5, s * 16], 1.2, 1.9, wood, 10))
    g.add(cyl(1.35, 1.3, 3, ferrule, { x: c * 21, z: s * 21 }, 10))
  }
  return fitGroup(g)
}

// ---------- 儿童增高垫餐椅：一把普通的木餐椅（两道靠背横档），座上绑着一只带扶手和矮靠背的塑料增高座，两根绑带分别绕过椅背和座面 ----------

const KB = { w: 45, d: 42, h: 95, seat: 45 }
function kidsBooster(p: string[]) {
  const [shell, wood, strap] = p
  const g = new THREE.Group()
  // 椅子：四腿、座板、裙板、靠背立柱和两道横档、腿间横撑
  const lx = 19
  const lz = 18
  for (const sx of [-1, 1]) {
    g.add(rbox(3.2, KB.seat - 3, 3.2, wood, { x: sx * lx, z: lz }, 0.6))
    g.add(rbox(3.2, KB.h - 1, 3.2, wood, { x: sx * lx, z: -lz }, 0.6))
    g.add(ball(1.9, wood, { x: sx * lx, y: KB.h - 1.2, z: -lz }))
    g.add(rbox(2.4, 2.4, lz * 2 - 3, wood, { x: sx * lx, y: 12 }, 0.4))
  }
  g.add(rbox(lx * 2 - 3, 2.4, 2.4, wood, { y: 14, z: lz }, 0.4))
  g.add(rbox(42, 3, 41, wood, { y: KB.seat - 3, z: 0.5 }, 0.8))
  for (const z of [lz, -lz]) g.add(rbox(lx * 2 - 3, 6, 2, wood, { y: KB.seat - 9, z }, 0.4))
  for (const x of [lx, -lx]) g.add(rbox(2, 6, lz * 2 - 3, wood, { x, y: KB.seat - 9 }, 0.4))
  for (const y of [64, 82]) g.add(rbox(lx * 2 - 3, y === 82 ? 8 : 4, 2.2, wood, { y, z: -lz }, 0.6))
  // 增高座：底座块 + 浅色坐垫 + 矮靠背 + 两侧扶手
  const by = KB.seat
  g.add(rbox(34, 9, 30, shell, { y: by, z: 2 }, 3))
  g.add(rbox(24, 1.2, 20, shade(shell, 0.16), { y: by + 8.4, z: 3 }, 0.5))
  g.add(rbox(34, 21, 4, shell, { y: by + 6, z: -11.5 }, 1.8))
  for (const s of [-1, 1]) g.add(rbox(4, 8, 24, shell, { x: s * 15, y: by + 7, z: 1 }, 1.6))
  // 绑带一：绕椅背立柱一圈（后面一段贴着立柱背面，两侧斜接到增高座靠背）
  const sy = 62
  g.add(rbox(lx * 2 + 4.2, 2.6, 0.5, strap, { y: sy, z: -lz - 1.75 }, 0.2))
  for (const s of [-1, 1]) {
    g.add(rbox(0.5, 2.6, 4, strap, { x: s * (lx + 1.8), y: sy, z: -lz + 0.1 }, 0.2))
    g.add(batten([s * 16.8, sy + 1.3, -13.2], [s * (lx + 1.8), sy + 1.3, -lz + 2], 2.6, 0.5, strap, 0.2))
  }
  g.add(rbox(4, 3.6, 0.8, STEEL, { y: sy - 0.5, z: -lz - 2.1 }, 0.3))
  // 绑带二：从增高座两侧下来，包住座板和裙板，从座下穿过
  const sz = 2
  for (const s of [-1, 1]) {
    g.add(batten([s * 17, by + 4, sz], [s * 21.2, by + 0.2, sz], 2.6, 0.5, strap, 0.2))
    g.add(rbox(0.5, 9.8, 2.6, strap, { x: s * 21.15, y: by - 9.4, z: sz }, 0.2))
  }
  g.add(rbox(42.8, 0.5, 2.6, strap, { y: by - 9.4, z: sz }, 0.2))
  return fitGroup(g)
}

// ---------- 中古风餐边柜：长条柜身架在四条外撇的细锥腿上（铜脚套），四扇木纹推拉门，柜里一块层板 ----------

const SB = { w: 160, d: 45, h: 78, leg: 20 }
const SB_SHELF = 49
function sideboardMid(p: string[]) {
  const [body, door, leg] = p
  const g = new THREE.Group()
  const bh = SB.h - SB.leg
  g.add(P(carcass(SB.w, bh, SB.d, body), 0, SB.leg, 0))
  const iy0 = SB.leg + 1.8
  const iy1 = SB.h - 1.8
  g.add(rbox(SB.w - 3.8, 1.6, 38, body, { y: SB_SHELF - 1.6, z: -1.7 }, 0.3))
  // 推拉门：门板 + 木纹画面（浮出门面 0.06）
  const panel = (w: number, h: number) => [rbox(w, h, 1.6, door, {}, 0.5), paintPanel(w - 1.2, h - 1.2, `dg-grain-${door}`, grainDraw(door), { y: 0.6, z: 0.86 })]
  g.add(slidingDoors({ x0: -SB.w / 2 + 1.8, x1: SB.w / 2 - 1.8, y0: iy0, y1: iy1, z: SB.d / 2 - 0.5, color: door, n: 4, th: 1.6, panel, pull: leg }))
  // 细锥腿
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(taperRod3([sx * 74, 1.4, sz * 18.5], [sx * 68, SB.leg + 0.8, sz * 15], 1.0, 1.8, leg, 10))
      g.add(cyl(1.2, 1.1, 2.2, shade(leg, -0.18), { x: sx * 74, z: sz * 18.5 }, 10))
    }
  return g
}
const sbRect = [rectPoly(-SB.w / 2 + 2.2, -SB.d / 2 + 2.2, SB.w / 2 - 2.2, 17)]
const SB_SURF: SurfaceDef[] = [
  { y: SB.leg + 1.8, h: SB_SHELF - 1.6 - SB.leg - 1.8, inside: true, shape: sbRect },
  { y: SB_SHELF, h: SB.h - 1.8 - SB_SHELF, inside: true, shape: sbRect },
]

// ---------- 上玻璃下柜碗橱：下柜两抽两门 + 木台面；上面一只浅一些的玻璃门展示柜（门上两道横格条对着层板），顶上一条檐板 ----------

const GH = { w: 100, d: 45, h: 190, base: 85, upD: 32 }
const GH_UP_SHELVES = [120, 153]
const GH_DRAWERS = [
  { x0: -48.4, x1: 0, y0: 62, y1: 82 },
  { x0: 0, x1: 48.4, y0: 62, y1: 82 },
].map((o) => ({ ...o, z: GH.d / 2, depth: 38 }))
function glassHutch(p: string[]) {
  const [body, top, knob] = p
  const g = new THREE.Group()
  // 下柜
  const lowD = GH.d - 1.6
  const lowZ = GH.d / 2 - 1.6 - lowD / 2
  g.add(P(carcass(98, GH.base - 3, lowD, body, { base: 8 }), 0, 0, lowZ))
  g.add(rbox(GH.w, 3, GH.d, top, { y: GH.base - 3 }, 0.6))
  g.add(rbox(94.2, 1.6, 41.2, body, { y: 60.4, z: 0.1 }, 0.3))
  g.add(rbox(94.2, 1.6, 41.2, body, { y: 32.4, z: 0.1 }, 0.3))
  for (const o of GH_DRAWERS) g.add(drawerBox({ ...o, color: body, knob }))
  const frame = doorPanel('frame', body, knob)
  g.add(hingedDoor({ x0: -48.4, x1: 0, y0: 8.2, y1: 62, z: GH.d / 2, hinge: 'left', color: body, knob, panel: frame }))
  g.add(hingedDoor({ x0: 0, x1: 48.4, y0: 8.2, y1: 62, z: GH.d / 2, hinge: 'right', color: body, knob, panel: frame }))
  // 上柜：贴着背面、比下柜浅
  const upCD = GH.upD - 1.6
  const upZ = -GH.d / 2 + upCD / 2
  const upH = GH.h - 4 - GH.base
  g.add(P(carcass(98, upH, upCD, body), 0, GH.base, upZ))
  for (const y of GH_UP_SHELVES) g.add(rbox(94.2, 1.6, upCD - 2, body, { y: y - 1.6, z: upZ + 0.9 }, 0.3))
  g.add(rbox(GH.w, 4, GH.upD + 2, top, { y: GH.h - 4, z: -GH.d / 2 + (GH.upD + 2) / 2 }, 0.6))
  // 玻璃门：框 + 玻璃 + 对着层板的两道横格条
  const glass = doorPanel('glass', body, knob)
  const lites = (w: number, h: number) => [...glass(w, h), ...GH_UP_SHELVES.map((y) => rbox(w - 9, 1.6, 1.2, body, { y: y - GH.base - 1.1 }, 0.3))]
  const doorZ = -GH.d / 2 + GH.upD
  g.add(hingedDoor({ x0: -49, x1: 0, y0: GH.base, y1: GH.h - 4, z: doorZ, hinge: 'left', color: body, knob, knobY: 22, panel: lites }))
  g.add(hingedDoor({ x0: 0, x1: 49, y0: GH.base, y1: GH.h - 4, z: doorZ, hinge: 'right', color: body, knob, knobY: 22, panel: lites }))
  return g
}
const ghLow = [rectPoly(-46.8, -20.3, 46.8, 20.4)]
const ghUp = [rectPoly(-46.8, -20.3, 46.8, -GH.d / 2 + GH.upD - 2.4)]
const GH_SURF: SurfaceDef[] = [
  // 台面在上柜门前的那一条
  { y: GH.base, h: 40, shape: [rectPoly(-49.5, -GH.d / 2 + GH.upD + 1, 49.5, GH.d / 2 - 0.5)] },
  { y: 9.8, h: 32.4 - 9.8, inside: true, shape: ghLow },
  { y: 34, h: 60.4 - 34, inside: true, shape: ghLow },
  ...GH_DRAWERS.map((o) => drawerLevel(o)),
  { y: GH.base + 1.8, h: GH_UP_SHELVES[0] - 1.6 - GH.base - 1.8, inside: true, glass: true, shape: ghUp },
  { y: GH_UP_SHELVES[0], h: GH_UP_SHELVES[1] - 1.6 - GH_UP_SHELVES[0], inside: true, glass: true, shape: ghUp },
  { y: GH_UP_SHELVES[1], h: GH.h - 4 - 1.8 - GH_UP_SHELVES[1], inside: true, glass: true, shape: ghUp },
]

// ---------- 吧台酒柜：短腿高柜，下面两扇门、中间一只抽屉；上格的门往前放平就是吧台面，里面左边酒瓶格、右边顶上一排倒挂酒杯的滑轨 ----------

const BC = { w: 80, d: 40, h: 150, leg: 12 }
const BC_FLAP = 96
/** 上格酒瓶格：x 范围、行高 */
const BC_CUB = { x0: -38.2, x1: -4.9, y0: BC_FLAP, y1: BC.h - 4 - 1.8, cols: 3, rows: 4 }
const BC_DRAWER = { x0: -39, x1: 39, y0: 78, y1: BC_FLAP, z: BC.d / 2, depth: 34 }
const BC_RAILS = [3, 11, 19, 27, 35]
function barCabinet(p: string[]) {
  const [body, inner, metal] = p
  const g = new THREE.Group()
  const cd = BC.d - 1.6
  const cz = BC.d / 2 - 1.6 - cd / 2
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2, 1.4, BC.leg, shade(body, -0.1), { x: sx * 35, z: sz * 15 }, 12))
  g.add(P(carcass(BC.w, BC.h - 4 - BC.leg, cd, body), 0, BC.leg, cz))
  g.add(rbox(BC.w, 4, BC.d, shade(body, -0.06), { y: BC.h - 4 }, 0.8))
  // 柜内横板：下格层板、抽屉上下两块
  const iz = cz + 0.9
  for (const y of [43.4, 76.4, BC_FLAP - 1.6]) g.add(rbox(76.2, 1.6, cd - 2, body, { y, z: iz }, 0.3))
  // 上格内衬（浅色，贴在背板前面；背板外面仍是柜体色）
  const c = BC_CUB
  g.add(rbox(76.4, c.y1 - c.y0, 0.4, inner, { y: c.y0, z: cz - cd / 2 + 1.8 + 0.1 }, 0.1))
  // 酒瓶格：一块竖隔板 + 格子板（浅色）
  g.add(rbox(1.8, c.y1 - c.y0, cd - 2, body, { x: -4, y: c.y0, z: iz }, 0.3))
  const cw = (c.x1 - c.x0) / c.cols
  const ch = (c.y1 - c.y0) / c.rows
  for (let i = 1; i < c.cols; i++) g.add(rbox(1, c.y1 - c.y0, cd - 2.4, inner, { x: c.x0 + cw * i, y: c.y0, z: iz }, 0.2))
  for (let j = 1; j < c.rows; j++) g.add(rbox(c.x1 - c.x0, 1, cd - 2.4, inner, { x: (c.x0 + c.x1) / 2, y: c.y0 + ch * j - 0.5, z: iz }, 0.2))
  // 酒杯滑轨：倒 T 形，贴在顶板下面
  for (const x of BC_RAILS) {
    g.add(rbox(1, 2.5, cd - 4, inner, { x, y: c.y1 - 2.5, z: iz }, 0.2))
    g.add(rbox(3.4, 0.8, cd - 4, metal, { x, y: c.y1 - 3.3, z: iz }, 0.2))
  }
  // 门：下面两扇平开门、中间抽屉、上面往前放平的翻门
  const framed = doorPanel('frame', body, metal)
  g.add(hingedDoor({ x0: -39, x1: 0, y0: BC.leg, y1: 78, z: BC.d / 2, hinge: 'left', color: body, knob: metal, panel: framed }))
  g.add(hingedDoor({ x0: 0, x1: 39, y0: BC.leg, y1: 78, z: BC.d / 2, hinge: 'right', color: body, knob: metal, panel: framed }))
  g.add(drawerBox({ ...BC_DRAWER, color: body, knob: metal }))
  // 翻门放平（90°）就是吧台面；门面上也压一圈框线，和下面的门一套
  const flap = flapDoor({ x0: -39, x1: 39, y0: BC_FLAP, y1: BC.h - 4, z: BC.d / 2, color: body, hinge: 'bottom', knob: metal, angle: PI / 2 })
  for (const m of framed(78 - 0.6, BC.h - 4 - BC_FLAP - 0.6).slice(1)) flap.add(m)
  g.add(flap)
  return g
}
const BC_IZ: [number, number] = [-BC.d / 2 + 2.2, BC.d / 2 - 2.4]
const bcCells = (): SurfaceDef[] => {
  const c = BC_CUB
  const cw = (c.x1 - c.x0) / c.cols
  const ch = (c.y1 - c.y0) / c.rows
  const out: SurfaceDef[] = []
  for (let i = 0; i < c.cols; i++)
    for (let j = 0; j < c.rows; j++)
      out.push({ y: c.y0 + ch * j + (j ? 0.5 : 0), h: ch - 1, inside: true, shape: [rectPoly(c.x0 + cw * i + 0.8, BC_IZ[0], c.x0 + cw * (i + 1) - 0.8, BC_IZ[1])] })
  return out
}
const BC_SURF: SurfaceDef[] = [
  { y: BC.leg + 1.8, h: 43.4 - BC.leg - 1.8, inside: true, shape: [rectPoly(-37.8, BC_IZ[0], 37.8, BC_IZ[1])] },
  { y: 45, h: 76.4 - 45, inside: true, shape: [rectPoly(-37.8, BC_IZ[0], 37.8, BC_IZ[1])] },
  drawerLevel(BC_DRAWER),
  // 上格右边（酒杯滑轨下面）
  { y: BC_FLAP, h: BC_CUB.y1 - 3.3 - BC_FLAP, inside: true, shape: [rectPoly(-2.7, BC_IZ[0], 37.8, BC_IZ[1])] },
  ...bcCells(),
]

// ---------- 木质双层餐车：两层带围边的木托盘，四根立柱和横档；一端两只辐条大轮，另一端立柱高出来做推手 ----------

const SC = { w: 80, d: 45, h: 80, wheelX: 25, wheelR: 15 }
const SC_TRAYS = [24, 61.5]
const SC_TRAY = { w: 66, d: 34, h: 4.5, t: 1.2 }
function servingCart(p: string[]) {
  const [wood, frame, tire] = p
  const g = new THREE.Group()
  const pz = 18.6
  const hx = -38.5
  const wx = SC.wheelX
  const wy = SC.wheelR
  // 立柱：推手端落地（脚下胶垫），轮子端立在轮轴上
  for (const s of [-1, 1]) {
    g.add(rbox(2.6, SC.h - 2.2, 2.6, frame, { x: hx, y: 1, z: s * pz }, 0.8))
    g.add(cyl(1.5, 1.6, 1.2, RUBBER, { x: hx, z: s * pz }, 10))
    g.add(rbox(2.6, 66 - wy + 1.5, 2.6, frame, { x: wx, y: wy - 1.5, z: s * pz }, 0.8))
  }
  // 推手
  g.add(cylZ(1.5, pz * 2 + 2.6, frame, hx, SC.h - 3, 0, 16))
  // 每层：托盘 + 下面的长档、横档
  for (const y of SC_TRAYS) {
    g.add(tray(SC_TRAY.w, SC_TRAY.h, SC_TRAY.d, SC_TRAY.t, wood, { y }))
    for (const s of [-1, 1]) g.add(rbox(wx - hx + 8, 2.4, 2.4, frame, { x: (hx + wx + 8) / 2, y: y - 2.4, z: s * pz }, 0.5))
    for (const x of [-SC_TRAY.w / 2 + 1, wx]) g.add(rbox(2.4, 2.4, pz * 2, frame, { x, y: y - 2.4 }, 0.5))
  }
  // 轮轴 + 两只大轮（胶圈 + 木轮圈 + 六根辐条 + 轮毂）
  g.add(cylZ(0.9, 44, STEEL, wx, wy, 0, 10))
  for (const s of [-1, 1]) {
    const z = s * 21
    g.add(torus(wy - 1.4, 1.4, tire, { x: wx, y: wy, z }))
    g.add(torus(wy - 2.7, 0.8, wood, { x: wx, y: wy, z }))
    for (let i = 0; i < 3; i++) g.add(P(rbox(1.2, (wy - 2.7) * 2, 1, wood, {}, 0.3), wx, wy, z, 0, 0, (i * PI) / 3))
    g.add(cylZ(2.4, 3.2, shade(wood, -0.12), wx, wy, z, 16))
  }
  return g
}
const SC_IN = [rectPoly(-SC_TRAY.w / 2 + 1.6, -SC_TRAY.d / 2 + 1.6, SC_TRAY.w / 2 - 1.6, SC_TRAY.d / 2 - 1.6)]

// ---------- 配色 ----------

const PED_PALS: Pal[] = [
  ['modern', ['#f2f0ec', M.white, '#a3a7af']],
  ['modern', ['#3e3f44', M.char, '#b8b4ab']],
  ['classic', ['#efe6d6', CL.gold, '#c8b89a']],
  ['nordic', ['#e7e3dc', N.oak, '#a9a59c']],
  ['retro', ['#3f6b5c', R.cream, '#d9e2d6']],
]
const TG_PALS: Pal[] = [
  ['modern', [M.black, '#cfeaff', RUBBER]],
  ['modern', [M.white, '#dfeef3', M.light]],
  ['industrial', [I.iron, '#9fa7ad', RUBBER]],
  ['classic', [CL.gold, '#e6d6b8', '#8c7a5a']],
  ['modern', [M.silver, '#bfe6ff', M.char]],
]
const LE_PALS: Pal[] = [
  ['industrial', [I.walnut, '#4a3226', IRON]],
  ['nordic', [N.oak, '#7a5a3e', M.black]],
  ['farmhouse', [F.oak, '#5e4330', F.iron]],
  ['modern', [M.walnut, '#3e2c22', M.char]],
  ['japanese', [J.hinoki, J.dark, J.sumi]],
]
const DL_PALS: Pal[] = [
  ['nordic', [N.oak, N.oak, M.black]],
  ['nordic', [N.white, N.oakL, M.silver]],
  ['japanese', [J.wood, J.dark, J.sumi]],
  ['farmhouse', [F.oak, F.white, F.iron]],
  ['cute', [C.woodL, C.mint, C.white]],
]
const CI_PALS: Pal[] = [
  ['modern', [M.white, '#e9e7e2', M.char]],
  ['nordic', [N.sage, N.white, '#c9a96e']],
  ['farmhouse', [F.navy, F.linen, F.iron]],
  ['industrial', [I.iron, I.concrete, I.steel]],
  ['modern', [M.walnut, '#3e3f44', M.silver]],
]
const BN_PALS: Pal[] = [
  ['nordic', [N.gray, N.oak]],
  ['nordic', [N.linen, N.oakL]],
  ['classic', [CL.navy, CL.walnut]],
  ['modern', ['#5d6b5a', M.walnut]],
  ['retro', [R.mustard, R.caramel]],
  ['cute', [C.pink, C.woodL]],
]
const WB_PALS: Pal[] = [
  ['nordic', [N.oak, '#e2cf9e']],
  ['nordic', [N.oakL, '#d8cdb8']],
  ['modern', [M.walnut, '#d9c08a']],
  ['japanese', [J.dark, '#cdb98a']],
  ['modern', [M.black, '#c9b48a']],
]
const CF_PALS: Pal[] = [
  ['retro', ['#2f5d4a', '#c9a06a', RUBBER]],
  ['industrial', [I.iron, I.walnut, RUBBER]],
  ['modern', [M.white, M.white, M.light]],
  ['retro', [R.red, R.cream, RUBBER]],
  ['cute', [C.sky, C.lemon, C.white]],
]
const UA_PALS: Pal[] = [
  ['modern', ['#d8cbb8', M.walnut, CL.gold]],
  ['classic', [CL.sage, CL.walnut, CL.gold]],
  ['retro', [R.mustard, R.caramel, '#c9a25a']],
  ['modern', ['#3f4a5e', M.black, M.silver]],
  ['cute', [C.sakura, C.woodL, C.lemon]],
]
const KB_PALS: Pal[] = [
  ['cute', [C.mint, C.woodL, '#e6a27a']],
  ['cute', [C.pink, C.wood, '#8fa3b8']],
  ['cute', [C.sky, C.woodL, C.lemon]],
  ['nordic', [N.white, N.oak, N.mustard]],
  ['modern', [M.light, M.walnut, M.char]],
]
const SB_PALS: Pal[] = [
  ['retro', [R.caramel, '#b47544', R.caramel]],
  ['retro', [M.walnut, R.mustard, M.walnut]],
  ['nordic', [N.oak, N.white, N.oak]],
  ['modern', [M.walnut, M.walnut, M.black]],
  ['retro', [R.teal, '#b47544', R.caramel]],
]
const GH_PALS: Pal[] = [
  ['farmhouse', [F.white, F.oak, F.iron]],
  ['farmhouse', [F.sage, F.oak, '#c9a25a']],
  ['classic', [CL.ivory, CL.walnut, CL.gold]],
  ['nordic', [N.oak, N.oakL, M.black]],
  ['retro', [R.cream, R.caramel, R.caramel]],
]
const BC_PALS: Pal[] = [
  ['classic', [CL.walnut, '#e9dcc3', CL.gold]],
  ['retro', [R.caramel, R.cream, '#c9a25a']],
  ['modern', [M.char, M.walnut, M.silver]],
  ['industrial', [I.walnut, I.iron, I.steel]],
  ['nordic', [N.oak, N.white, M.black]],
]
const SC_PALS: Pal[] = [
  ['nordic', [N.oakL, N.oak, M.char]],
  ['nordic', [N.white, N.oak, '#4a4a50']],
  ['retro', [R.caramel, R.caramel, RUBBER]],
  ['modern', [M.walnut, M.black, RUBBER]],
  ['japanese', [J.hinoki, J.wood, J.sumi]],
]

const TABLE: Partial<AssetDef> = { type: 'dining-table', tags: ['table'] }
const CHAIR: Partial<AssetDef> = { type: 'dining-chair', tags: ['chair', 'seat', 'dining-seat', 'multi-ok'] }

export const DINING_MORE: AssetDef[] = [
  define('dg-pedestal-round', '郁金香底座圆餐桌', 'dining', [110, 110, PED.h], PED_PALS, pedestalRound, {
    ...TABLE,
    mats: ['stone', 'metal', 'stone'],
    sizeLabel: 'Φ110',
    surface: PED.h,
    surfaceShape: [ellipsePoly(PED.r - 1, PED.r - 1)],
  }),
  define('dg-trestle-glass', '玻璃面 X 腿餐桌', 'dining', [TG.w, TG.d, TG.h], TG_PALS, trestleGlass, {
    ...TABLE,
    mats: ['metal', 'glass', 'plastic'],
    sizeLabel: '180×90',
    surface: TG.h,
  }),
  define('dg-live-edge', '原木自然边餐桌', 'dining', [LE.w, LE.d, LE.h], LE_PALS, liveEdge, {
    ...TABLE,
    mats: ['wood', 'wood', 'metal'],
    sizeLabel: '200×95',
    surface: LE.h,
    surfaceShape: [liveEdgePoly(2)],
  }),
  define('dg-drop-leaf-wall', '靠墙折叠餐桌', 'dining', [DL.w, DL.d, DL.h], DL_PALS, dropLeafWall, {
    ...TABLE,
    mats: ['wood', 'wood', 'metal'],
    sizeLabel: '100×70',
    surface: DL.h,
  }),
  define('dg-counter-island', '带餐位的厨房吧台', 'dining', [CI.w, CI.d, CI.h], CI_PALS, counterIsland, {
    type: 'counter',
    tags: ['table', 'storage-cabinet'],
    mats: ['paint', 'stone', 'metal'],
    sizeLabel: '180×90',
    surface: CI.h,
    surfaces: CI_SURF,
    openable: true,
  }),
  define('dg-bench-set', '软包靠背餐凳', 'dining', [BN.w, BN.d, BN.h], BN_PALS, benchBack, {
    type: 'dining-seat',
    tags: ['seat'],
    mats: ['fabric', 'wood'],
    sizeLabel: '140',
  }),
  define('dg-wishbone-like', '叉骨靠背编绳椅', 'dining', [WB.w, WB.d, WB.h], WB_PALS, wishboneCord, { ...CHAIR, mats: ['wood', 'paper'] }),
  define('dg-cafe-chair', '金属咖啡馆椅', 'dining', [CF.w, CF.d, CF.h], CF_PALS, cafeChair, { ...CHAIR, mats: ['metal', 'wood', 'plastic'] }),
  define('dg-upholstered-arm', '圆背软包扶手餐椅', 'dining', [UA.w, UA.d, UA.h], UA_PALS, upholsteredArm, { ...CHAIR, mats: ['fabric', 'wood', 'metal'] }),
  define('dg-kids-booster', '儿童增高垫餐椅', 'dining', [KB.w, KB.d, KB.h], KB_PALS, kidsBooster, {
    type: 'dining-chair',
    tags: ['chair', 'seat', 'dining-seat', 'for-kids'],
    mats: ['plastic', 'wood', 'fabric'],
  }),
  define('dg-sideboard-mid', '中古风餐边柜', 'dining', [SB.w, SB.d, SB.h], SB_PALS, sideboardMid, {
    type: 'cabinet',
    tags: ['storage-cabinet'],
    mats: ['wood', 'wood', 'wood'],
    surface: SB.h,
    surfaces: SB_SURF,
    openable: true,
  }),
  define('dg-glass-hutch', '上玻璃下柜碗橱', 'dining', [GH.w, GH.d, GH.h], GH_PALS, glassHutch, {
    type: 'cabinet',
    tags: ['storage-cabinet'],
    mats: ['paint', 'wood', 'metal'],
    surface: GH.h,
    surfaceShape: [rectPoly(-GH.w / 2 + 0.5, -GH.d / 2 + 0.5, GH.w / 2 - 0.5, -GH.d / 2 + GH.upD + 1.5)],
    surfaces: GH_SURF,
    openable: true,
  }),
  define('dg-bar-cabinet', '吧台酒柜', 'dining', [BC.w, BC.d, BC.h], BC_PALS, barCabinet, {
    type: 'cabinet',
    tags: ['storage-cabinet'],
    mats: ['wood', 'wood', 'metal'],
    surface: BC.h,
    surfaces: BC_SURF,
    openable: true,
  }),
  define('dg-serving-cart', '木质双层餐车', 'dining', [SC.w, SC.d, SC.h], SC_PALS, servingCart, {
    type: 'kitchenware',
    mats: ['wood', 'wood', 'plastic'],
    surface: SC_TRAYS[1] + SC_TRAY.t,
    surfaceShape: SC_IN,
    surfaces: [{ y: SC_TRAYS[0] + SC_TRAY.t, h: SC_TRAYS[1] - 2.4 - SC_TRAYS[0] - SC_TRAY.t, shape: SC_IN }],
  }),
]
