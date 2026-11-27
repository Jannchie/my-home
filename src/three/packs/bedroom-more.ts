// 卧室补充（br- 前缀）：日式平台床、船长床、壁床、现代木框架子床、壁挂书架床头板、床尾储物凳、七斗高斗柜、
// 带镜三门衣柜、悬浮床头柜、托盘边几床头柜、落地首饰柜、西装衣架、毛毯梯、床上小桌。约定见 kit.ts 开头。
//   - 床：床品（床垫、枕头、被子、被头）和 assets.ts 的床同一套做法（bedding.ts 的 duvet / pillowMesh）；
//     surface = 被子顶面，surfaceShape 让开枕头那一头（一键布置按床宽判断单双人）。床头靠墙在 -z。
//   - 柜子、抽屉、翻盖都是会动的部件（openable），里面的层声明 inside。壁挂件按离地高度建（最低点 = mount、背面贴 z = -d/2）。

import * as THREE from 'three'
import { ball, box, cup, cyl, markMirror, puck, rbox, shade, torus } from '../toon'
import { C, carcass, drawerBox, drawerLevel, ellipsePoly, hangingPipe, hingedDoor, holePanel, movable, pipeHook, rectPoly, type AssetDef, type SurfaceDef } from '../kit'
import { cappedTube, cylX, cylZ, lit, noOutline, PI, strutBox } from '../geo'
import { duvet, pillowMesh } from '../bedding'
import { CL, F, I, J, M, N, R, define, PROP, type Pal } from '../packkit'

const BRASS = '#c9a25a'
const STEEL = '#c3c7cc'
const LAMP = '#fff2b8'
const PAPER = '#f4efe2'
const COFFEE = '#6b4128'

// ---------- 床品：床垫 + 枕头 + 被子 + 被头 ----------

interface LinenOpts {
  /** 床垫宽、长、厚，底面高 y，床头那一端的 z */
  mw: number
  ml: number
  mh: number
  y: number
  z0: number
  duvet: string
  sheet: string
  /** 被子比床垫两侧、床尾各宽出多少（默认 4.5，和 assets.ts 的床一样） */
  over?: number
  /** 两侧、床尾垂下多长（默认垂到床垫底边上方 1.5） */
  drop?: number
  /** 被子翻边半径（默认 4） */
  thick?: number
  sway?: number
  /** 宽床枕头前的小靠垫（默认有） */
  cushion?: boolean
  seed: number
}

/** 铺床：和 assets.ts 的床同样的枕头、被子、被头摆法。返回被子顶面高（= surface） */
function bedLinen(g: THREE.Group, o: LinenOpts) {
  const top = o.y + o.mh
  const over = o.over ?? 4.5
  g.add(rbox(o.mw, o.mh, o.ml, o.sheet, { y: o.y, z: o.z0 + o.ml / 2 }, 5))
  const n = o.mw > 120 ? 2 : 1
  const pw = (o.mw - 14) / n - 4
  for (let i = 0; i < n; i++) g.add(pillowMesh(pw, 14, 40, C.white, { x: n === 1 ? 0 : (i - 0.5) * (pw + 6), y: top - 1, z: o.z0 + 25, rx: -0.3 }))
  // 宽床在枕头前斜靠一只小靠垫
  if (o.mw >= 120 && o.cushion !== false) g.add(pillowMesh(36, 12, 30, shade(o.duvet, -0.12), { y: top - 0.5, z: o.z0 + 43, rx: -0.5 }))
  // 被子从床头往后 55 起铺到床尾外沿，床头那端翻折一道被头
  const zs = o.z0 + 55
  const z1 = o.z0 + o.ml + over
  g.add(duvet({ w: o.mw + over * 2, len: z1 - zs, top: top + 4, z1, drop: o.drop ?? o.mh - 1.5, thick: o.thick, sway: o.sway ?? 0.5, color: o.duvet, seed: o.seed }))
  g.add(pillowMesh(o.mw + over * 2 + 0.4, 5, 18, shade(o.duvet, 0.08), { y: top + 2.5, z: zs + 9 }, 0.5))
  return top + 4
}

/** 床面的可摆放区：让开枕头那头（床头往后约三成半），到床垫尾端 */
const sleepShape = (mw: number, z0: number, ml: number, d: number) => [rectPoly(-mw / 2 + 4, Math.max(z0 + 72, -d / 2 + d * 0.36), mw / 2 - 4, z0 + ml - 2)]

const BED_PALS: Pal[] = [
  ['nordic', [N.sage, N.linen, N.oak]],
  ['nordic', [N.gray, N.white, N.oakL]],
  ['japanese', [J.ai, J.washi, J.wood]],
  ['modern', [M.char, M.white, M.walnut]],
  ['cute', [C.pink, C.white, C.woodL]],
]

// ---------- 日式低矮平台床：一整块宽出床垫一圈的木平台，下面缩进的底座让它像浮着；床头一体的宮棚（顶面 + 三格开放搁格） ----------

const PB = { w: 160, d: 220, h: 70, deck: 20, mw: 140, ml: 195, mh: 22, z0: -93 }
function platformBed(p: string[]) {
  const [duvetC, sheet, frame] = p
  const g = new THREE.Group()
  const zb = -PB.d / 2
  // 缩进的底座 + 平台板（四周比床垫宽出 10）
  g.add(rbox(136, 14, 196, shade(frame, -0.25), { z: 4 }, 1))
  g.add(rbox(PB.w, 6, PB.d, frame, { y: 14 }, 1.2))
  // 床头宮棚：背板、两侧板、顶板、中间一层搁板，下半截前面封板（枕头挡着），上半截三格开放
  const hz = zb + 8
  g.add(rbox(155, 48, 1.6, shade(frame, -0.06), { y: PB.deck, z: zb + 1 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2, 48, 16, frame, { x: s * 78.5, y: PB.deck, z: hz }, 0.5))
  g.add(rbox(PB.w, 2.4, 16, frame, { y: PB.h - 2.4, z: hz }, 0.8))
  g.add(rbox(155, 1.8, 15, frame, { y: 50, z: hz }, 0.4))
  g.add(rbox(155, 30.4, 1.6, frame, { y: PB.deck, z: zb + 15.2 }, 0.4))
  for (const x of [-26, 26]) g.add(rbox(1.6, 16, 14, frame, { x, y: 51.8, z: hz - 0.5 }, 0.3))
  bedLinen(g, { mw: PB.mw, ml: PB.ml, mh: PB.mh, y: PB.deck, z0: PB.z0, duvet: duvetC, sheet, seed: 31 })
  return g
}
const PB_TOP = PB.deck + PB.mh + 4
const PB_SURFS: SurfaceDef[] = [
  { y: PB.h, h: 40, shape: [rectPoly(-79, -109, 79, -95)] },
  // 宮棚三格（中间一层搁板顶面 51.8，上到顶板底 67.6）
  ...[
    [-77, -27],
    [-25, 25],
    [27, 77],
  ].map(([a, b]): SurfaceDef => ({ y: 51.8, h: 15.6, shape: [rectPoly(a, -108.5, b, -95.5)] })),
]

// ---------- 船长床（单人）：床座是一只大抽屉箱，朝 +x 一侧两排共六个抽屉；床头一块带框的木板 ----------

const CP = { w: 102, d: 202, h: 80, box: 34, mw: 95, ml: 195, mh: 16, z0: -96.5 }
/** 船长床的抽屉箱在一个转了 90° 的局部坐标里做（局部 +z = 世界 +x，局部 x = 世界 -z）：抽屉照常沿局部 +z 拉出 */
const CP_BOX = { len: 197, cx: -1.5, d: 100, base: 4, t: 1.8 }
const CP_ROWS: [number, number][] = [
  [5.8, 19.6],
  [19.6, 32.2],
]
const cpCols = () => {
  const x0 = CP_BOX.cx - CP_BOX.len / 2 + CP_BOX.t
  const cw = (CP_BOX.len - CP_BOX.t * 2) / 3
  return [0, 1, 2].map((i) => [x0 + cw * i, x0 + cw * (i + 1)] as const)
}
const cpDrawer = (x0: number, x1: number, y0: number, y1: number) => ({ x0, x1, y0, y1, z: CP_BOX.d / 2, depth: 62 })
function captainBed(p: string[]) {
  const [duvetC, sheet, frame, front] = p
  const g = new THREE.Group()
  const side = new THREE.Group()
  side.rotation.y = Math.PI / 2
  const box = carcass(CP_BOX.len, CP.box, CP_BOX.d, frame, { base: CP_BOX.base })
  box.position.x = CP_BOX.cx
  side.add(box)
  for (const [y0, y1] of CP_ROWS)
    for (const [x0, x1] of cpCols())
      side.add(
        drawerBox({
          ...cpDrawer(x0, x1, y0, y1),
          color: front,
          knob: false,
          // 木条拉手
          front: (w, h) => [rbox(w, h, 1.6, front, { z: -0.8 }, 0.6), rbox(16, 1.8, 1.6, frame, { y: h / 2 - 0.9, z: 0.8 }, 0.6)],
        }),
      )
  g.add(side)
  // 床头：两根立柱 + 中间一块板 + 顶上横梁
  const hz = -CP.d / 2 + 1.5
  for (const s of [-1, 1]) g.add(rbox(4, CP.h - 4, 4, frame, { x: s * 48, z: hz }, 1))
  g.add(rbox(92, 40, 2, shade(frame, 0.05), { y: 34, z: hz }, 0.5))
  g.add(rbox(100, 4, 5, frame, { y: CP.h - 4, z: hz }, 1.2))
  bedLinen(g, { mw: CP.mw, ml: CP.ml, mh: CP.mh, y: CP.box, z0: CP.z0, duvet: duvetC, sheet, over: 3, drop: 14, seed: 7 })
  return g
}
/** 抽屉格：局部矩形 x∈[a, b]、z∈[c, e] → 世界 x∈[c, e]、z∈[-b, -a]，拉出方向是世界 +x */
const CP_SURFS: SurfaceDef[] = CP_ROWS.flatMap(([y0, y1]) =>
  cpCols().map(([x0, x1]) => {
    const lv = drawerLevel(cpDrawer(x0, x1, y0, y1))
    const pl = lv.shape![0]
    const xs = pl.map(([x]) => x)
    const zs = pl.map(([, z]) => z)
    return { y: lv.y, h: lv.h, inside: true, slideX: lv.slide, shape: [rectPoly(Math.min(...zs), -Math.max(...xs), Math.max(...zs), -Math.min(...xs))] }
  }),
)

// ---------- 壁床（放下的状态）：床头是一只竖起来的高柜（床收起时装进去），柜里空出来的背板、顶上的灯带；床架放平，床尾一副折叠腿 ----------

const MB = { w: 140, d: 204, h: 200, cd: 42, mw: 126, ml: 191.5, mh: 20, z0: -94.5, frameY: 22 }
function murphyBed(p: string[]) {
  const [duvetC, sheet, main, inner] = p
  const g = new THREE.Group()
  const zb = -MB.d / 2
  const cz = zb + MB.cd / 2
  // 高柜：两侧板、背板、顶冠，柜里一条小搁板、顶上一块挡板（下沿藏一条灯带）
  for (const s of [-1, 1]) g.add(rbox(3, 197, MB.cd, main, { x: s * 68.5, z: cz }, 0.6))
  g.add(rbox(141, 5, MB.cd + 1, main, { y: 195, z: cz + 0.5 }, 1))
  g.add(rbox(134, 195, 1.6, inner, { z: zb + 0.8 }, 0.3))
  g.add(rbox(134, 1.6, 12, main, { y: 148.4, z: zb + 7.6 }, 0.4))
  g.add(rbox(134, 18, 1.6, main, { y: 177, z: zb + MB.cd - 0.8 }, 0.4))
  g.add(lit(noOutline(rbox(120, 0.6, 2, LAMP, { y: 176.6, z: zb + MB.cd - 3 }, 0.2)), LAMP, 0.7))
  // 柜里的底座：床架的床头那端搭在上面
  g.add(rbox(134, MB.frameY, 36, shade(main, -0.2), { z: zb + 20 }, 0.5))
  // 床架：底板 + 两侧、床尾一圈围框（收起时就是柜门那一面），床尾一条拉手
  const fy = MB.frameY
  g.add(rbox(133, 3, 196, main, { y: fy, z: 2.5 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(3, 12, 196, main, { x: s * 65, y: fy, z: 2.5 }, 0.6))
  g.add(rbox(127, 12, 3, main, { y: fy, z: 99 }, 0.6))
  g.add(rbox(40, 2.4, 1.6, inner, { y: fy + 4.8, z: 101.2 }, 0.6))
  // 折叠腿：两根腿 + 顶上一根横撑，横撑顶住床架底板
  for (const s of [-1, 1]) g.add(rbox(4, fy, 3, main, { x: s * 55, z: 93 }, 0.8))
  g.add(rbox(114, 4, 3, main, { y: fy - 4, z: 93 }, 0.8))
  bedLinen(g, { mw: MB.mw, ml: MB.ml, mh: MB.mh, y: fy + 3, z0: MB.z0, duvet: duvetC, sheet, over: 3, drop: 10, seed: 17 })
  return g
}
const MB_TOP = MB.frameY + 3 + MB.mh + 4

// ---------- 现代木框架子床（Queen）：四根细方柱撑起一圈顶框（顶上两根横档），没有帷幔；软包床头，床架侧梁低矮 ----------

const CW = { w: 174, d: 215, h: 200, px: 84.5, pz: 105, rail: 32, mw: 160, ml: 198, mh: 22, z0: -100 }
function canopyWood(p: string[]) {
  const [duvetC, sheet, frame, pad] = p
  const g = new THREE.Group()
  const { px, pz, h, rail } = CW
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, h, 5, frame, { x: sx * px, z: sz * pz }, 1))
  // 顶框 + 两根横档
  for (const s of [-1, 1]) {
    g.add(rbox(164, 4, 3.5, frame, { y: h - 6, z: s * pz }, 0.8))
    g.add(rbox(3.5, 4, 205, frame, { x: s * px, y: h - 6 }, 0.8))
    g.add(rbox(165.5, 2.5, 2.5, frame, { y: h - 5, z: s * 35 }, 0.6))
  }
  // 床架：两侧梁、床头床尾梁，中间一整块床板
  for (const s of [-1, 1]) {
    g.add(rbox(3, 12, 205, frame, { x: s * px, y: rail - 12 }, 0.8))
    g.add(rbox(164, 12, 3, frame, { y: rail - 12, z: s * pz }, 0.8))
  }
  g.add(rbox(166, 2, 207, shade(frame, 0.1), { y: rail - 2 }, 0.4))
  // 中间一根撑脚，床板不靠侧梁悬着
  g.add(rbox(6, rail - 2, 6, shade(frame, -0.1), {}, 1))
  // 床头：一块木板 + 前面一块软包
  g.add(rbox(164, 62, 3, frame, { y: rail, z: -pz }, 0.8))
  g.add(rbox(150, 46, 6, pad, { y: rail + 10, z: -pz + 4 }, 1.4))
  bedLinen(g, { mw: CW.mw, ml: CW.ml, mh: CW.mh, y: rail, z0: CW.z0, duvet: duvetC, sheet, over: 2.5, thick: 3, drop: 15, sway: 0.35, cushion: false, seed: 41 })
  return g
}
const CW_TOP = CW.rail + CW.mh + 4

// ---------- 壁挂书架床头板：一整块背板，下半截两块软包靠垫，上半截一只三格书架盒；书架下面吊两盏小阅读灯（灯罩里自发光） ----------

const HS = { w: 170, d: 25, h: 80, mount: 60 }
function headboardShelf(p: string[]) {
  const [frame, pad, shadeC] = p
  const g = new THREE.Group()
  const y0 = HS.mount
  const zb = -HS.d / 2
  g.add(rbox(HS.w, HS.h, 2, frame, { y: y0, z: zb + 1 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(80, 34, 6, pad, { x: s * 41, y: y0 + 3, z: zb + 5 }, 3))
  // 书架盒：底板、顶板、两侧板、两块竖隔板
  const bz = zb + 2 + 11.5
  g.add(rbox(HS.w, 2, 23, frame, { y: 100, z: bz }, 0.6))
  g.add(rbox(HS.w, 2, 23, frame, { y: y0 + HS.h - 2, z: bz }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(2, 36.4, 23, frame, { x: s * 84, y: 101.8, z: bz }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(1.8, 36.4, 22, shade(frame, -0.04), { x: s * 40, y: 101.8, z: bz - 0.5 }, 0.4))
  // 阅读灯：吊杆 + 圆台灯罩，罩口一圈发光的灯片
  for (const s of [-1, 1]) {
    const x = s * 62
    g.add(cyl(0.6, 0.6, 1.4, STEEL, { x, y: 98.8, z: 4 }, 8))
    g.add(cyl(2.4, 5.6, 5, shadeC, { x, y: 94, z: 4 }, 20))
    g.add(lit(noOutline(cyl(5.2, 5.2, 0.4, LAMP, { x, y: 93.7, z: 4 }, 20)), LAMP, 0.8))
  }
  return g
}
const HS_SURFS: SurfaceDef[] = [
  [-82.5, -41],
  [-39, 39],
  [41, 82.5],
].map(([a, b]) => ({ y: 102, h: 35.8, shape: [rectPoly(a, -10, b, 12)] }))

// ---------- 床尾储物凳：四条短腿托着一只木箱，正面两块浮雕板、两头皮提手；软包翻盖（拉扣）从后沿掀起 ----------

const BT = { w: 120, d: 45, h: 48, leg: 8, bw: 116, wall: 40 }
function benchTrunk(p: string[]) {
  const [frame, cushion, acc] = p
  const g = new THREE.Group()
  const hd = BT.d / 2
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2, 1.4, BT.leg, shade(frame, -0.12), { x: sx * (BT.bw / 2 - 4), z: sz * (hd - 4) }, 10))
  // 箱体：底板 + 前后板 + 两头板（空心）
  g.add(rbox(BT.bw, 2, BT.d - 1, frame, { y: BT.leg }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(BT.bw, BT.wall - BT.leg - 2, 2, frame, { y: BT.leg + 2, z: s * (hd - 1.5) }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2, BT.wall - BT.leg - 2, BT.d - 5, frame, { x: s * (BT.bw / 2 - 1), y: BT.leg + 2 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(50, 20, 0.8, shade(frame, 0.07), { x: s * 28, y: BT.leg + 7, z: hd - 0.2 }, 0.3))
  // 两头的皮提手
  for (const s of [-1, 1]) {
    g.add(rbox(1.2, 3, 14, acc, { x: s * (BT.bw / 2 + 0.4), y: 28 }, 0.4))
    for (const z of [-7, 7]) g.add(cylX(0.7, 1.6, BRASS, s * (BT.bw / 2 + 0.6), 29.5, z, 10))
  }
  // 翻盖：铰链在后沿顶上，盖板 + 软垫，往上掀约 75°（软垫转到铰链前面，不往墙里伸）
  const lid = new THREE.Group()
  lid.add(rbox(118, 2.5, BT.d, frame, { y: -8, z: hd }, 0.6))
  lid.add(rbox(114, 5.5, BT.d - 3, cushion, { y: -5.5, z: hd }, 2.5))
  for (const x of [-38, -19, 0, 19, 38]) for (const z of [hd - 9, hd + 9]) lid.add(ball(0.9, shade(cushion, -0.2), { x: x + (z > hd ? 9.5 : 0), y: -0.3, z }, undefined, [6, 4]))
  lid.position.set(0, BT.h, -hd)
  g.add(movable(lid, { kind: 'flap', angle: -(75 * Math.PI) / 180 }))
  return g
}

// ---------- 七斗高斗柜：细锥腿，七格等高抽屉，黄铜横拉手，顶板四周挑出一点 ----------

const LT = { w: 55, d: 40, h: 130, leg: 12, cw: 53, cd: 38, cz: -1 }
const LT_ROWS: [number, number][] = (() => {
  const y0 = LT.leg + 1.8
  const step = (LT.h - 2 - y0) / 7
  return Array.from({ length: 7 }, (_, i) => [y0 + step * i, y0 + step * (i + 1)] as [number, number])
})()
const ltDrawer = (y0: number, y1: number) => ({ x0: -LT.cw / 2 + 1.8, x1: LT.cw / 2 - 1.8, y0, y1, z: LT.cz + LT.cd / 2, depth: 34 })
function lingerieTall(p: string[]) {
  const [body, front, pull] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.8, 1.1, LT.leg, shade(body, -0.1), { x: sx * 23, z: LT.cz + sz * 15 }, 10))
  const box = carcass(LT.cw, LT.h - 2 - LT.leg, LT.cd, body, { top: false })
  box.position.set(0, LT.leg, LT.cz)
  g.add(box)
  g.add(rbox(LT.w, 2, 39.5, body, { y: LT.h - 2, z: -0.25 }, 0.6))
  for (const [y0, y1] of LT_ROWS) g.add(drawerBox({ ...ltDrawer(y0, y1), color: front, knob: false, front: (w, h) => [rbox(w, h, 1.6, front, { z: -0.8 }, 0.5), rbox(14, 1.2, 1.2, pull, { y: h / 2 - 0.6, z: 0.6 }, 0.4)] }))
  return g
}

// ---------- 带镜三门衣柜：三段柜，左右平开门是线脚门板，中门是一整面穿衣镜；左右段挂衣杆、中段层板；两层顶冠 ----------

const AM = { w: 150, d: 58, h: 200, cw: 146, cd: 55, cz: -1, ch: 192, base: 8, t: 1.8 }
/** 三段的内宽范围（侧板、两块竖隔板之间） */
const AM_SEC = (() => {
  const inner = AM.cw / 2 - AM.t
  const a = -inner + (inner * 2) / 3
  return [
    [-inner, a - 0.9],
    [a + 0.9, -a - 0.9],
    [-a + 0.9, inner],
  ] as [number, number][]
})()
const AM_DIV = [-1, 1].map((s) => s * (AM.cw / 2 - AM.t - ((AM.cw - AM.t * 2) / 3)))
const AM_PIPE = 168
const AM_TOPSHELF = 176
const AM_SHELVES = [50, 90, 130, 170]
const AM_FLOOR = AM.base + AM.t
const AM_ZB = AM.cz - AM.cd / 2 + AM.t
const AM_ZF = AM.cz + AM.cd / 2
function armoireMirror(p: string[]) {
  const [main, door, knob] = p
  const g = new THREE.Group()
  const box = carcass(AM.cw, AM.ch, AM.cd, main, { base: AM.base })
  box.position.z = AM.cz
  g.add(box)
  g.add(rbox(148, 4, 56.5, shade(main, -0.05), { y: AM.ch, z: AM.cz + 0.25 }, 1))
  g.add(rbox(AM.w, 4, AM.d, main, { y: AM.ch + 4 }, 1.4))
  // 两块竖隔板
  for (const x of AM_DIV) g.add(rbox(1.8, AM.ch - AM_FLOOR - AM.t, AM.cd - AM.t - 0.6, main, { x, y: AM_FLOOR, z: AM.cz + AM.t / 2 - 0.3 }, 0.3))
  const shelf = (x0: number, x1: number, y: number) => rbox(x1 - x0 - 0.2, 1.6, AM.cd - AM.t - 1.6, shade(main, 0.04), { x: (x0 + x1) / 2, y: y - 1.6, z: AM.cz + AM.t / 2 - 0.8 }, 0.3)
  for (const [x0, x1] of [AM_SEC[0], AM_SEC[2]]) {
    g.add(shelf(x0, x1, AM_TOPSHELF))
    g.add(hangingPipe(x0, x1, AM_PIPE, AM.cz))
  }
  for (const y of AM_SHELVES) g.add(shelf(AM_SEC[1][0], AM_SEC[1][1], y))
  // 门：门洞按隔板中线分三段
  const xs = [-AM.cw / 2, AM_DIV[0], AM_DIV[1], AM.cw / 2]
  const y0 = AM.base + 1
  const y1 = AM.ch - 1
  const zf = AM_ZF + 2
  const panelDoor = (w: number, h: number) => [
    rbox(w, h, 2, door, {}, 0.8),
    rbox(w - 10, h * 0.5, 0.8, shade(door, 0.06), { y: h * 0.42, z: 1.2 }, 0.3),
    rbox(w - 10, h * 0.28, 0.8, shade(door, 0.06), { y: h * 0.06, z: 1.2 }, 0.3),
  ]
  const mirrorDoor = (w: number, h: number) => [rbox(w, h, 2, door, {}, 0.8), markMirror(noOutline(rbox(w - 9, h - 12, 0.4, C.glass, { y: 6, z: 1.2 }, 0.15)))]
  g.add(hingedDoor({ x0: xs[0], x1: xs[1], y0, y1, z: zf, hinge: 'left', color: door, th: 2, knob, panel: panelDoor }))
  g.add(hingedDoor({ x0: xs[1], x1: xs[2], y0, y1, z: zf, hinge: 'right', color: door, th: 2, knob, panel: mirrorDoor }))
  g.add(hingedDoor({ x0: xs[2], x1: xs[3], y0, y1, z: zf, hinge: 'right', color: door, th: 2, knob, panel: panelDoor }))
  return g
}
const AM_SURFS: SurfaceDef[] = (() => {
  const box = (x0: number, x1: number) => [rectPoly(x0 + 0.5, AM_ZB + 0.5, x1 - 0.5, AM_ZF - 1.5)]
  const out: SurfaceDef[] = []
  for (const [x0, x1] of [AM_SEC[0], AM_SEC[2]]) {
    out.push({ y: AM_FLOOR, h: AM_PIPE - 1.4 - AM_FLOOR - 1, inside: true, shape: box(x0, x1) })
    out.push({ y: AM_TOPSHELF, h: AM.ch - AM.t - AM_TOPSHELF - 0.5, inside: true, shape: box(x0, x1) })
    out.push(pipeHook(x0, x1, AM_PIPE, AM.cz, AM_PIPE - AM_FLOOR - 6))
  }
  const [m0, m1] = AM_SEC[1]
  const ys = [AM_FLOOR, ...AM_SHELVES]
  ys.forEach((y, i) => out.push({ y, h: (i + 1 < ys.length ? ys[i + 1] - 1.6 : AM.ch - AM.t) - y - 0.5, inside: true, shape: box(m0, m1) }))
  return out
})()

// ---------- 悬浮床头柜（壁挂）：一只扁盒子，上格一个抽屉（细长拉手），下格开放 ----------

const FN = { w: 45, d: 30, h: 25, mount: 45, mid: 56.1 }
const fnDrawer = () => ({ x0: -FN.w / 2 + 1.8, x1: FN.w / 2 - 1.8, y0: FN.mid + 1.8, y1: FN.mount + FN.h - 1.8, z: 14, depth: 26 })
function floatingNightstand(p: string[]) {
  const [body, front, acc] = p
  const g = new THREE.Group()
  const box = carcass(FN.w, FN.h, 29, body)
  box.position.set(0, FN.mount, -0.5)
  g.add(box)
  g.add(rbox(FN.w - 3.6, 1.8, 28, body, { y: FN.mid, z: -0.5 }, 0.3))
  g.add(drawerBox({ ...fnDrawer(), color: front, knob: false, front: (w, h) => [rbox(w, h, 1.6, front, { z: -0.8 }, 0.5), rbox(16, 1, 1.2, acc, { y: h - 2.4, z: 0.6 }, 0.4)] }))
  return g
}

// ---------- 托盘边几：三条细腿 + 一圈托环，中间一层圆搁板；顶上一只能端下来的圆托盘（两侧竖着两只提环） ----------

const TN = { r: 22.5, h: 55, tray: 48, legR: 15 }
function trayNightstand(p: string[]) {
  const [trayC, legC, acc] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    g.add(cyl(1.3, 1.0, TN.tray, legC, { x: Math.cos(a) * TN.legR, z: Math.sin(a) * TN.legR }, 10))
  }
  const ring = torus(TN.legR, 0.8, legC, { y: TN.tray - 0.8 })
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  g.add(puck(16, 2, legC, { y: 18 }))
  g.add(cup(TN.r, TN.r - 0.5, 4, 0.9, trayC, { y: TN.tray }))
  for (const s of [-1, 1]) {
    const h = torus(2.6, 0.5, acc, { x: s * (TN.r - 0.4), y: TN.h - 3.1 }, Math.PI)
    h.rotation.y = Math.PI / 2
    g.add(h)
  }
  return g
}

// ---------- 落地首饰柜：细腿窄高柜，正面一整扇镜门（里面绒布衬底、两层小搁板、一排戒指卷），两侧各一扇挂项链的侧门，下面三个小抽屉 ----------

const JA = { w: 40, d: 35, h: 105, leg: 12.5, cw: 32, z0: -17.5, z1: 15.5, mid: 50, top: 100 }
const JA_ROWS: [number, number][] = [
  [15.8, 27.2],
  [27.2, 38.6],
  [38.6, JA.mid],
]
const jaDrawer = (y0: number, y1: number) => ({ x0: -JA.cw / 2 + 1.8, x1: JA.cw / 2 - 1.8, y0, y1, z: JA.z1, depth: 28 })
const JA_SHELVES = [66, 82]
const NECK = ['#e3c46a', '#d9dee6', '#e8b4a8', '#e3c46a', '#d9dee6']
function jewelryArmoire(p: string[]) {
  const [body, velvet, acc] = p
  const g = new THREE.Group()
  const cz = (JA.z0 + JA.z1) / 2
  const cd = JA.z1 - JA.z0
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.4, 0.9, JA.leg, shade(body, -0.1), { x: sx * 17, z: cz + sz * 13.5 }, 10))
  g.add(rbox(39.4, 1.5, cd + 0.5, body, { y: JA.leg, z: cz }, 0.5))
  const box = carcass(JA.cw, JA.top - 14, cd, body)
  box.position.set(0, 14, cz)
  g.add(box)
  g.add(rbox(JA.w, 5, JA.d, body, { y: JA.top, z: 0 }, 1))
  // 下半截两侧补齐到侧门那么宽；上半截侧门后面是挂项链的夹层（前后两根封边立条）
  for (const s of [-1, 1]) {
    g.add(rbox(3.7, JA.mid - 14, cd, body, { x: s * 17.85, y: 14, z: cz }, 0.4))
    for (const z of [JA.z1 - 0.75, JA.z0 + 0.75]) g.add(rbox(2.5, JA.top - JA.mid, 1.5, body, { x: s * 17.25, y: JA.mid, z }, 0.3))
  }
  // 镜门里面：中隔板、绒布衬底、两层搁板、一排戒指卷
  g.add(rbox(JA.cw - 3.6, 1.5, cd - 2, body, { y: JA.mid, z: cz + 0.5 }, 0.3))
  g.add(rbox(JA.cw - 3.6, JA.top - 14 - 1.8 - JA.mid - 1.5 + 0.2, 0.6, velvet, { y: JA.mid + 1.5, z: JA.z0 + 2 }, 0.2))
  for (const y of JA_SHELVES) g.add(rbox(JA.cw - 3.6, 1.2, cd - 4, body, { y: y - 1.2, z: cz - 0.6 }, 0.3))
  for (let i = 0; i < 7; i++) g.add(cylX(1.1, JA.cw - 3.8, velvet, 0, JA.mid + 1.5 + 1.0, JA.z0 + 5 + i * 2.3, 12))
  for (const [y0, y1] of JA_ROWS) g.add(drawerBox({ ...jaDrawer(y0, y1), color: body, knob: false, front: (w, h) => [rbox(w, h, 1.4, body, { z: -0.7 }, 0.4), ball(0.9, acc, { y: h / 2, z: 0.6 }, undefined, [8, 6])] }))
  // 正面镜门（铰链在左）
  const mirror = (w: number, h: number) => [rbox(w, h, 1.5, body, {}, 0.5), markMirror(noOutline(rbox(w - 4, h - 4, 0.3, C.glass, { y: 2, z: 0.85 }, 0.1)))]
  g.add(hingedDoor({ x0: -JA.cw / 2, x1: JA.cw / 2, y0: JA.mid + 1.5, y1: JA.top, z: JA.z1 + 1.5, hinge: 'left', color: body, th: 1.5, knob: acc, panel: mirror }))
  // 两扇侧门：在转了 ±90° 的局部坐标里做（局部 +z 朝外），铰链在后沿；门内侧一排挂钩，挂着几条项链
  const sideDoor = (w: number, h: number) => {
    const parts: THREE.Object3D[] = [rbox(w, h, 1.2, body, {}, 0.4)]
    NECK.forEach((c, i) => {
      const x = -w / 2 + 6 + i * ((w - 12) / (NECK.length - 1))
      const r = 4 + (i % 3) * 2.5
      parts.push(cylZ(0.35, 1.2, BRASS, x, h - 6, -1.1, 8))
      // 细项链：截面 4 段就够
      parts.push(noOutline(torus(r, 0.18, c, { x, y: h - 6.2 - r, z: -1.6 }, PI * 2, [4, r > 5 ? 24 : 18])))
      parts.push(ball(0.7, c, { x, y: h - 6.2 - r * 2, z: -1.6 }, undefined, [6, 4]))
    })
    return parts
  }
  for (const s of [-1, 1]) {
    const side = new THREE.Group()
    side.rotation.y = (s * Math.PI) / 2
    // s = 1：局部 x = 世界 -z（后沿在局部 +x）；s = -1：局部 x = 世界 z（后沿在局部 -x）
    const [x0, x1] = s > 0 ? [-JA.z1, -JA.z0] : [JA.z0, JA.z1]
    side.add(hingedDoor({ x0, x1, y0: JA.mid + 0.5, y1: JA.top, z: 19.7, hinge: s > 0 ? 'right' : 'left', color: body, th: 1.2, knob: acc, knobY: 22, panel: sideDoor }))
    g.add(side)
  }
  return g
}
// 镜门里的两层搁板（最底下是戒指卷，不放东西）+ 三个抽屉格
const JA_SURFS: SurfaceDef[] = [
  ...JA_SHELVES.map((y, i): SurfaceDef => ({
    y,
    h: (i + 1 < JA_SHELVES.length ? JA_SHELVES[i + 1] - 1.2 : JA.top - 1.8) - y - 0.5,
    inside: true,
    shape: [rectPoly(-JA.cw / 2 + 2.2, JA.z0 + 2.6, JA.cw / 2 - 2.2, JA.z1 - 2.6)],
  })),
  ...JA_ROWS.map(([y0, y1]) => drawerLevel(jaDrawer(y0, y1))),
]

// ---------- 西装衣架：H 形底脚，两根立柱，顶上一只肩形挂架；中间前伸一根压着毡条的裤夹横杆，再往下一只放手表钥匙的小托盘 ----------

const VS = { w: 45, d: 35, h: 110, pz: -4 }
function valetStand(p: string[]) {
  const [wood, trayC, felt] = p
  const g = new THREE.Group()
  const pz = VS.pz
  for (const s of [-1, 1]) g.add(rbox(4, 3, VS.d, wood, { x: s * 12 }, 1))
  g.add(rbox(20.4, 2.6, 4, wood, { z: pz }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(3, 101, 3, wood, { x: s * 8, y: 2.5, z: pz }, 0.8))
  // 肩形挂架
  g.add(cappedTube([[-20.3, 98, pz], [-14, 101.8], [-6, 104], [0, 104.6], [6, 104], [14, 101.8], [20.3, 98]].map(([x, y, z]) => [x, y, z ?? pz] as [number, number, number]), 2.2, wood, { seg: 24 }))
  g.add(cyl(0.8, 0.8, 3.4, wood, { y: 105.2, z: pz }, 10))
  g.add(ball(1.5, wood, { y: VS.h - 1.5, z: pz }))
  // 裤夹：两条前伸的短臂 + 横杆，杆上压一条毡
  for (const s of [-1, 1]) g.add(rbox(1.6, 2, 9, wood, { x: s * 8, y: 71, z: pz + 4 }, 0.5))
  g.add(cylX(1.2, 17.6, wood, 0, 72, pz + 8, 14))
  g.add(rbox(15, 1, 1.4, felt, { y: 72.7, z: pz + 8 }, 0.4))
  // 小托盘：两条短臂托着
  for (const s of [-1, 1]) g.add(rbox(1.6, 2, 10, wood, { x: s * 8, y: 49, z: pz + 4.5 }, 0.5))
  const t = new THREE.Group()
  t.add(rbox(20, 0.8, 14, trayC, {}, 0.3))
  for (const s of [-1, 1]) {
    t.add(rbox(20, 2.4, 0.8, trayC, { y: 0.8, z: s * 6.6 }, 0.3))
    t.add(rbox(0.8, 2.4, 12.4, trayC, { x: s * 9.6, y: 0.8 }, 0.3))
  }
  t.position.set(0, 51, pz + 7.5)
  g.add(t)
  // 底下一根横撑
  g.add(cylX(1, 13.4, wood, 0, 15, pz, 12))
  return g
}

// ---------- 毛毯梯：斜靠墙的木梯（两根侧梁、四根圆横档），上面两根横档各搭一条毯子（前长后短，带织带和流苏） ----------

const BL = { w: 50, d: 30, h: 160, rx: 23.5, rungs: [30, 62, 94, 126], zt: 12.5 }
const blZ = (y: number) => BL.zt - (2 * BL.zt * (y - 0.25)) / (BL.h - 0.65)
function blanketLadder(p: string[]) {
  const [wood, blanketA, blanketB, stripe] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(strutBox([s * BL.rx, 0.25, BL.zt], [s * BL.rx, BL.h - 0.4, -BL.zt], 2.5, 4, wood, 0.6))
  for (const y of BL.rungs) g.add(cylX(1.4, BL.rx * 2, wood, 0, y, blZ(y), 14))
  // 一条毯子：横档外面包一圈卷边，前后两片垂下
  const drape = (y: number, front: number, back: number, color: string, bands: boolean, thick: number) => {
    const z = blZ(y)
    const r = 1.4 + thick
    g.add(cylX(r, 40, color, 0, y, z, 16))
    for (const [len, dz] of [
      [front, r - thick / 2],
      [back, -(r - thick / 2)],
    ]) {
      g.add(rbox(40, len, thick, color, { y: y - len, z: z + dz }, Math.min(0.5, thick / 2 - 0.05)))
      // 下摆一排流苏
      for (let i = 0; i < 14; i++) g.add(box(0.8, 2.8, 0.8, shade(color, -0.08), { x: -18.2 + i * 2.8, y: y - len - 2.5, z: z + dz }))
      if (bands) for (const k of [0.25, 0.55]) g.add(rbox(40.6, 2.4, thick + 0.6, stripe, { y: y - len * k, z: z + dz }, 0.4))
    }
  }
  drape(126, 30, 20, blanketA, true, 1.2)
  drape(62, 24, 16, blanketB, false, 2)
  return g
}

// ---------- 床上小桌（摆件）：带两头提手孔的托盘桌面，两副折叠 U 形腿；上面一杯咖啡（带碟）和一本合着的书 ----------

/** h：围边顶；mugTop：杯口（整件最高处） */
const BTR = { w: 60, d: 35, h: 25, legH: 20, mugTop: 30.3 }
function bedTray(p: string[]) {
  const [wood, mug, cover] = p
  const g = new THREE.Group()
  const top = BTR.legH + 1.6
  // 两副 U 形腿：两根立杆 + 着地的横杆
  for (const s of [-1, 1]) {
    for (const z of [-13, 13]) g.add(cyl(0.8, 0.8, BTR.legH - 0.8, wood, { x: s * 25, y: 0.8, z }, 10))
    g.add(cylZ(0.8, 27.6, wood, s * 25, 0.8, 0, 12))
  }
  g.add(rbox(BTR.w - 2.4, 1.6, BTR.d - 2.4, wood, { y: BTR.legH }, 0.4))
  // 围边：前后两条，两头是开了提手孔的端板
  for (const s of [-1, 1]) g.add(rbox(BTR.w - 2.4, BTR.h - BTR.legH, 1.2, wood, { y: BTR.legH, z: s * (BTR.d / 2 - 0.6) }, 0.4))
  for (const s of [-1, 1]) g.add(holePanel(BTR.d, BTR.h - BTR.legH, 1.2, shade(wood, -0.04), [{ kind: 'rect', x: 0, y: 1.6, w: 10, h: 2, r: 0.9 }], { x: s * (BTR.w / 2 - 0.6), y: BTR.legH, ry: Math.PI / 2 }, 0.6, { seg: 6 }))
  // 咖啡：碟 + 杯（空心）+ 杯里一层咖啡 + 杯把
  const mx = -13
  const mz = 4
  g.add(puck(6, 0.7, C.white, { x: mx, y: top, z: mz }))
  g.add(cup(3.8, 3.3, 8, 0.4, mug, { x: mx, y: top + 0.7, z: mz }, 24))
  g.add(noOutline(cyl(3.45, 3.45, 0.3, COFFEE, { x: mx, y: top + 0.7 + 6.6, z: mz }, 24)))
  g.add(torus(2, 0.5, mug, { x: mx + 4.6, y: top + 4.8, z: mz }, PI * 2, [6, 16]))
  // 书：上下封面 + 书页（三边缩进）+ 书脊，斜放
  const book = new THREE.Group()
  book.add(rbox(15, 0.35, 21, cover, {}, 0.12))
  book.add(rbox(14.2, 1.9, 20.2, PAPER, { x: 0.3, y: 0.3 }, 0.1))
  book.add(rbox(15, 0.35, 21, cover, { y: 2.15 }, 0.12))
  book.add(rbox(0.7, 2.5, 21, cover, { x: -7.3 }, 0.3))
  book.add(rbox(1, 0.1, 6, shade(cover, -0.25), { x: 2, y: 2.5, z: 12.5 }, 0.04))
  book.position.set(12, top, -1)
  book.rotation.y = 0.18
  g.add(book)
  return g
}

// ---------- 配色 ----------

const CP_PALS: Pal[] = [
  ['nordic', [N.blue, N.white, N.oak, N.oakL]],
  ['nordic', [N.sage, N.linen, N.white, N.white]],
  ['farmhouse', [F.navy, F.linen, F.oak, F.white]],
  ['modern', [M.light, M.white, M.char, M.gray]],
  ['cute', [C.sky, C.white, C.white, C.mint]],
]
const MB_PALS: Pal[] = [
  ['nordic', [N.blue, N.white, N.white, N.oakL]],
  ['nordic', [N.sage, N.linen, N.oak, N.white]],
  ['modern', [M.char, M.white, M.light, M.gray]],
  ['modern', [M.light, M.white, M.walnut, M.char]],
  ['japanese', [J.ai, J.washi, J.hinoki, J.wood]],
  ['cute', [C.lilac, C.white, C.white, C.sakura]],
]
const CW_PALS: Pal[] = [
  ['nordic', [N.gray, N.white, N.oak, N.linen]],
  ['modern', [M.char, M.white, M.black, M.light]],
  ['japanese', [J.ai, J.washi, J.dark, J.washi]],
  ['farmhouse', [F.sage, F.linen, F.white, F.butter]],
  ['classic', [CL.cream, CL.ivory, CL.walnut, CL.navy]],
]
const HS_PALS: Pal[] = [
  ['nordic', [N.oak, N.gray, M.white]],
  ['modern', [M.white, M.light, M.black]],
  ['modern', [M.walnut, M.char, BRASS]],
  ['japanese', [J.hinoki, J.ai, J.washi]],
  ['cute', [C.white, C.pink, C.lemon]],
]
const BT_PALS: Pal[] = [
  ['nordic', [N.white, N.gray, I.leather]],
  ['nordic', [N.oak, N.linen, '#6b4a33']],
  ['classic', [CL.ivory, CL.blue, '#7a5a43']],
  ['farmhouse', [F.oak, F.sage, F.iron]],
  ['modern', [M.char, M.light, M.black]],
]
const LT_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, BRASS]],
  ['nordic', [N.white, N.white, N.oak]],
  ['modern', [M.walnut, M.walnut, BRASS]],
  ['modern', [M.char, M.gray, M.silver]],
  ['retro', [R.caramel, R.cream, BRASS]],
  ['cute', [C.white, C.sakura, C.pink]],
]
const AM_PALS: Pal[] = [
  ['classic', [CL.ivory, CL.ivory, CL.gold]],
  ['classic', [CL.walnut, shade(CL.walnut, 0.06), CL.gold]],
  ['nordic', [N.white, N.oakL, N.oak]],
  ['farmhouse', [F.white, F.sage, F.iron]],
  ['modern', [M.light, M.white, M.black]],
]
const FN_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, M.black]],
  ['modern', [M.white, M.white, M.silver]],
  ['modern', [M.walnut, M.char, BRASS]],
  ['japanese', [J.hinoki, J.hinoki, J.dark]],
  ['cute', [C.mint, C.white, C.woodD]],
]
const TN_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.oak]],
  ['modern', [M.black, BRASS, BRASS]],
  ['modern', [M.white, M.silver, M.silver]],
  ['retro', [R.teal, R.cream, BRASS]],
  ['cute', [C.pink, C.white, C.lemon]],
]
const JA_PALS: Pal[] = [
  ['classic', [CL.ivory, CL.wine, CL.gold]],
  ['classic', [CL.walnut, CL.navy, CL.gold]],
  ['nordic', [N.white, N.blue, N.oak]],
  ['modern', [M.char, '#7a2e3a', M.silver]],
  ['cute', [C.white, C.pink, C.lemon]],
]
const VS_PALS: Pal[] = [
  ['classic', [CL.walnut, '#5a3b2a', CL.navy]],
  ['nordic', [N.oak, N.oakL, N.gray]],
  ['modern', [M.black, M.walnut, M.gray]],
  ['japanese', [J.dark, J.wood, J.ai]],
  ['retro', [R.caramel, '#6b4a33', R.olive]],
]
const BL_PALS: Pal[] = [
  ['nordic', [N.oak, N.linen, N.sage, N.gray]],
  ['farmhouse', [F.white, F.butter, F.sage, F.navy]],
  ['modern', [M.walnut, M.light, M.char, M.white]],
  ['japanese', [J.hinoki, J.washi, J.ai, J.shu]],
  ['cute', [C.white, C.sakura, C.mint, C.pink]],
]
const BTR_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.sage]],
  ['modern', [M.white, M.char, '#c8473a']],
  ['japanese', [J.hinoki, J.washi, J.ai]],
  ['retro', [R.caramel, R.mustard, R.teal]],
  ['cute', [C.woodL, C.pink, C.sky]],
]

// ---------- 定义 ----------

export const BEDROOM_MORE: AssetDef[] = [
  define('br-platform-bed', '日式平台床', 'bedroom', [PB.w, PB.d, PB.h], BED_PALS, platformBed, {
    type: 'bed',
    sizeLabel: 'Double',
    mats: ['fabric', 'fabric', 'wood'],
    surface: PB_TOP,
    surfaceShape: sleepShape(PB.mw, PB.z0, PB.ml, PB.d),
    surfaces: PB_SURFS,
  }),
  define('br-captain-bed', '船长床', 'bedroom', [CP.w, CP.d, CP.h], CP_PALS, captainBed, {
    type: 'bed',
    sizeLabel: 'Single',
    mats: ['fabric', 'fabric', 'wood', 'wood'],
    surface: CP.box + CP.mh + 4,
    surfaceShape: sleepShape(CP.mw, CP.z0, CP.ml, CP.d),
    surfaces: CP_SURFS,
    openable: true,
  }),
  define('br-murphy-bed', '壁床', 'bedroom', [MB.w + 1, MB.d, MB.h], MB_PALS, murphyBed, {
    type: 'bed',
    sizeLabel: 'Double',
    mats: ['fabric', 'fabric', 'wood', 'wood'],
    surface: MB_TOP,
    surfaceShape: sleepShape(MB.mw, MB.z0, MB.ml, MB.d),
    surfaces: [
      { y: 150, h: 26, shape: [rectPoly(-66, -MB.d / 2 + 2, 66, -MB.d / 2 + 13)] },
      { y: MB.h, h: 30, shape: [rectPoly(-69, -MB.d / 2 + 1, 69, -MB.d / 2 + MB.cd)] },
    ],
  }),
  define('br-canopy-wood', '木框架子床', 'bedroom', [CW.w, CW.d, CW.h], CW_PALS, canopyWood, {
    type: 'bed',
    sizeLabel: 'Queen',
    mats: ['fabric', 'fabric', 'wood', 'fabric'],
    surface: CW_TOP,
    surfaceShape: sleepShape(CW.mw, CW.z0, CW.ml, CW.d),
  }),
  define('br-headboard-shelf', '书架床头板', 'bedroom', [HS.w, HS.d, HS.h], HS_PALS, headboardShelf, {
    type: 'shelving',
    mats: ['wood', 'fabric', 'metal'],
    mount: HS.mount,
    surface: HS.mount + HS.h,
    surfaceShape: [rectPoly(-84, -10, 84, 12)],
    surfaces: HS_SURFS,
  }),
  define('br-bench-trunk', '床尾储物凳', 'bedroom', [BT.w, BT.d, BT.h], BT_PALS, benchTrunk, {
    type: 'seat',
    mats: ['wood', 'fabric', 'leather'],
    surfaces: [{ y: BT.leg + 2, h: BT.wall - BT.leg - 2.5, inside: true, shape: [rectPoly(-BT.bw / 2 + 2.5, -BT.d / 2 + 3, BT.bw / 2 - 2.5, BT.d / 2 - 3)] }],
    openable: true,
  }),
  define('br-lingerie-tall', '七斗高斗柜', 'bedroom', [LT.w, LT.d, LT.h], LT_PALS, lingerieTall, {
    type: 'dresser',
    mats: ['wood', 'wood', 'metal'],
    surface: LT.h,
    surfaces: LT_ROWS.map(([y0, y1]) => drawerLevel(ltDrawer(y0, y1))),
    openable: true,
  }),
  define('br-armoire-mirror', '带镜三门衣柜', 'bedroom', [AM.w, AM.d, AM.h], AM_PALS, armoireMirror, {
    type: 'wardrobe',
    mats: ['wood', 'wood', 'metal'],
    surface: AM.h,
    surfaces: AM_SURFS,
    openable: true,
  }),
  define('br-floating-nightstand', '悬浮床头柜', 'bedroom', [FN.w, FN.d, FN.h], FN_PALS, floatingNightstand, {
    type: 'nightstand',
    mats: ['wood', 'wood', 'metal'],
    mount: FN.mount,
    surface: FN.mount + FN.h,
    surfaces: [{ y: FN.mount + 1.8, h: FN.mid - FN.mount - 2.3, shape: [rectPoly(-FN.w / 2 + 2.2, -13, FN.w / 2 - 2.2, 13)] }, drawerLevel(fnDrawer())],
    openable: true,
  }),
  define('br-tray-nightstand', '托盘边几床头柜', 'bedroom', [TN.r * 2, TN.r * 2, TN.h], TN_PALS, trayNightstand, {
    type: 'nightstand',
    mats: ['wood', 'metal', 'metal'],
    surface: TN.tray + 0.9,
    surfaceShape: [ellipsePoly(TN.r - 2)],
    surfaces: [{ y: 20, h: 27, shape: [ellipsePoly(13.5)] }],
  }),
  define('br-jewelry-armoire', '落地首饰柜', 'bedroom', [JA.w, JA.d, JA.h], JA_PALS, jewelryArmoire, {
    type: 'storage-cabinet',
    mats: ['wood', 'fabric', 'metal'],
    surface: JA.h,
    surfaces: JA_SURFS,
    openable: true,
  }),
  define('br-valet-stand', '西装衣架', 'bedroom', [VS.w, VS.d, VS.h], VS_PALS, valetStand, {
    type: 'coat-rack',
    mats: ['wood', 'wood', 'fabric'],
    surfaces: [{ y: 51.8, h: 15, shape: [rectPoly(-9, VS.pz + 1.5, 9, VS.pz + 13.5)] }],
  }),
  define('br-blanket-ladder', '毛毯梯', 'bedroom', [BL.w, BL.d, BL.h], BL_PALS, blanketLadder, {
    type: 'cabinet',
    mats: ['wood', 'fabric', 'fabric', 'fabric'],
  }),
  define('br-bed-tray', '床上小桌', 'bedroom', [BTR.w, BTR.d, BTR.mugTop], BTR_PALS, bedTray, {
    ...PROP,
    type: 'table',
    tags: ['bed-ok'],
    mats: ['wood', 'ceramic', 'paper'],
  }),
]
