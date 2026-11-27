// 阳台与小户外：咖啡桌椅组、栏杆挂式花槽、梯形花架、壁挂折叠小桌、吊篮蛋椅、户外收纳箱、阳台串灯、雨水桶、滚筒堆肥箱、
// 水管车、育苗温室箱、阳台隐私屏、游泳圈与充气火烈鸟、阳台晒鞋架。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。带台面的（咖啡桌椅组、折叠小桌、收纳箱）声明 surface，不做包围盒平移；
// 壁挂件（花槽、折叠小桌）按离地高度建，用 fitWall 把最低点放到 mount、背面贴 z = -d/2。type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, box, cup, cyl, puck, rbox, shade, torus, tray } from '../toon'
import { C, ellipsePoly, rectPoly, type AssetDef } from '../kit'
import { cappedTube, cylX, cylZ, fitGroup, fitWall, ghost, lit, noOutline, P, PI, rod3, sideSlab, strutBox, taperRod3, tiltFrame, tube, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#2b2c30'
const RUBBER = '#2e2f33'
const SOIL = '#6b4a3a'
const LEAF = C.leaf
const LEAF_D = C.leafD
const WHITE = '#f7f5f0'
const GLASS = C.glass
const BAMBOO = '#cdb57a'
const TERRA = '#c8794e'

// ---------- 小工具 ----------

/** 成堆的小颗粒（花瓣、小叶、桩头）用的低段数 */
const SEG_S: [number, number] = [8, 6]

/** cup(rTop, rBottom, h, t) 在 frac 高度处的土面半径：比内壁大一点、嵌进盆壁里（土和盆壁不留缝） */
function soilR(rTop: number, rBottom: number, frac: number, t: number) {
  return rBottom + (rTop - rBottom) * frac - t * 0.4
}

/** 一丛开花的小苗：压扁的叶团 + 一圈半露出来的小花，叶团底在 y（略微埋进土里） */
function bloom(x: number, y: number, z: number, r: number, petal: string, n = 3, seed = 0) {
  const g = new THREE.Group()
  g.add(ball(r, LEAF, { x, y: y + r * 0.5, z }, [1.15, 0.75, 1.15], [12, 8]))
  for (let i = 0; i < n; i++) {
    const a = seed + (i / n) * PI * 2
    g.add(ball(r * 0.42, i % 2 ? shade(petal, 0.12) : petal, { x: x + Math.cos(a) * r * 0.55, y: y + r * 0.95, z: z + Math.sin(a) * r * 0.55 }, undefined, SEG_S))
  }
  return g
}

/** 一盆小花：口径 12 的小盆 + 一层土 + 一丛花，盆底在 y */
function potFlower(x: number, y: number, z: number, pot: string, petal: string, seed = 0) {
  const g = new THREE.Group()
  g.add(cup(6, 4.6, 10, 0.8, pot, { x, y, z }, 16))
  g.add(cyl(soilR(6, 4.6, 0.86, 0.8), soilR(6, 4.6, 0.8, 0.8), 0.6, SOIL, { x, y: y + 8, z }, 16))
  g.add(bloom(x, y + 8.6, z, 4.2, petal, 4, seed))
  return g
}

/** 育苗的小芽：一根细茎 + 两片对生的子叶，茎底在 y */
function sprout(x: number, y: number, z: number, a = 0) {
  const g = new THREE.Group()
  g.add(cyl(0.35, 0.4, 6.5, LEAF_D, { x, y, z }, 6))
  for (const s of [-1, 1]) g.add(ball(2.4, LEAF, { x: x + Math.cos(a) * s * 2.1, y: y + 6.4, z: z + Math.sin(a) * s * 2.1, ry: -a, rz: s * 0.35 }, [1, 0.25, 0.6], SEG_S))
  g.add(ball(1.2, C.leaf, { x, y: y + 6.8, z }, [0.7, 1.2, 0.7], SEG_S))
  return g
}

// ---------- 阳台咖啡桌椅组：铁艺小圆桌（独柱 + 三只弯脚）+ 左右两把面朝桌子的法式折叠椅 ----------

const BS = { top: 72, r: 30, chairX: 40 }

/** 法式折叠椅（面朝 +z）：后腿一路长成微微后仰的靠背立柱，前腿竖直，侧面一根斜撑和后腿交成 X，座面和靠背都是横条板 */
function bistroChair(frame: string, slat: string) {
  const g = new THREE.Group()
  const hw = 19
  const sy = 42 // 座面侧梁高度
  for (const s of [-1, 1]) {
    const x = s * hw
    g.add(rod3([x, 0.9, -15], [x, 79, -19], 1, frame, 8))
    g.add(ball(1, frame, { x, y: 79, z: -19 }, undefined, SEG_S))
    g.add(rod3([x, 0.9, 17], [x, sy, 15], 1, frame, 8))
    // 座面侧梁、折叠斜撑
    g.add(rod3([x, sy, -17.1], [x, sy, 15], 0.9, frame, 8))
    g.add(rod3([x, 2, 16.9], [x, sy, -14], 0.8, frame, 8))
    // 脚头的小胶垫
    for (const z of [-15, 17]) g.add(cyl(1.3, 1.3, 1, RUBBER, { x, z }, 10))
  }
  // 前后两根横撑
  g.add(rod3([-hw, 12, 16.4], [hw, 12, 16.4], 0.7, frame, 8))
  g.add(rod3([-hw, 12, -15.6], [hw, 12, -15.6], 0.7, frame, 8))
  // 座面六根横条
  for (let i = 0; i < 6; i++) g.add(rbox(40, 1.6, 4.4, slat, { y: sy + 0.6, z: -14 + i * 5.6 }, 0.6))
  // 靠背三根横条（跟着立柱后仰）
  for (const y of [58, 65, 72]) g.add(rbox(39.6, 4.6, 1.3, slat, { y, z: -15 - (4 * (y + 2.3)) / 79 + 0.2, rx: -0.05 }, 0.5))
  return g
}

function bistroSet(p: string[]) {
  const [frame, slat, top] = p
  const g = new THREE.Group()
  // 桌面：圆板 + 一圈包边 + 台面下的托圈和三根辐条
  g.add(cyl(BS.r, BS.r, 2, top, { y: BS.top - 2 }, 32))
  g.add(torus(BS.r, 0.9, frame, { y: BS.top - 1, rx: PI / 2 }, PI * 2, [6, 40]))
  // 台面下的托圈从外面几乎看不到
  g.add(torus(20, 0.8, frame, { y: BS.top - 2.6, rx: PI / 2 }, PI * 2, [5, 24]))
  for (const a of [PI / 2, PI / 2 + (2 * PI) / 3, PI / 2 + (4 * PI) / 3]) g.add(rod3([0, BS.top - 2.4, 0], [Math.cos(a) * 20, BS.top - 2.4, Math.sin(a) * 20], 0.7, frame, 8))
  // 独柱：中段一道装饰箍，底下一只球形底座伸出三只弯脚
  g.add(cyl(1.8, 1.8, BS.top - 8, frame, { y: 6 }, 12))
  g.add(cyl(2.8, 2.8, 2, frame, { y: 36 }, 12))
  g.add(cyl(3.2, 2.4, 3, frame, { y: BS.top - 5 }, 12))
  g.add(ball(3.4, frame, { y: 7 }))
  for (const a of [PI / 6, (5 * PI) / 6, (3 * PI) / 2]) {
    const c = Math.cos(a)
    const s = Math.sin(a)
    // 根部埋在球形底座里，只给脚尖加球帽
    g.add(tube([[c * 2, 7, s * 2], [c * 10, 4.4, s * 10], [c * 20, 1.2, s * 20]], 1.2, frame, { seg: 10, radial: 8 }))
    g.add(ball(1.2, frame, { x: c * 20, y: 1.2, z: s * 20 }, undefined, SEG_S))
  }
  // 两把椅子面朝桌子
  for (const s of [-1, 1]) g.add(P(bistroChair(frame, slat), s * BS.chairX, 0, 0, 0, (s * -PI) / 2, 0))
  return g
}

// ---------- 栏杆挂式花槽：长条花槽两侧各一条铁皮挂钩，从槽底兜上来、翻过栏杆顶再垂下去；槽里一排开花的小苗，前沿垂下几簇叶子 ----------

const RP_MOUNT = 90
const RP_D = 24
function railPlanter(p: string[]) {
  const [box, hook, petal] = p
  const g = new THREE.Group()
  // 槽身 + 一圈卷边
  g.add(tray(58, 16, 16, 1.2, box, {}))
  for (const s of [-1, 1]) {
    g.add(rbox(59.2, 2, 2, box, { y: 14.4, z: s * 7.6 }, 0.7))
    g.add(rbox(2, 2, 17.2, box, { x: s * 28.6, y: 14.4 }, 0.7))
  }
  // 土和花
  g.add(rbox(56, 1, 14, SOIL, { y: 13 }, 0.3))
  ;[-22, -11, 0, 11, 22].forEach((x, i) => g.add(bloom(x, 14, i % 2 ? -1.5 : 1.5, 4.4, i % 2 ? shade(petal, -0.06) : petal, 4, i)))
  // 垂过前沿的藤蔓：从土里翻过卷边垂下来，挂着几片小叶
  for (const x of [-16, 5, 19]) {
    g.add(tube([[x, 13.8, 5.5], [x, 16.6, 8.2], [x + 1, 12, 9], [x + 2, 6, 8.9]], 0.35, LEAF_D, { seg: 16, radial: 5 }))
    for (const [dx, y, a] of [[0.6, 13.2, 0.5], [1.4, 10, -0.5], [2, 6.6, 0.4]]) g.add(ball(1.6, LEAF, { x: x + dx, y, z: 9.2, rz: a }, [0.55, 1, 0.16], SEG_S))
  }
  // 挂钩：槽底兜带 → 前沿一截卡舌 → 背面竖带 → 翻过栏杆顶 → 垂下的钩尾
  for (const s of [-1, 1]) {
    const x = s * 18
    g.add(rbox(3, 0.8, 17.6, hook, { x, y: -0.6 }, 0.3))
    g.add(rbox(3, 4.6, 0.6, hook, { x, y: -0.6, z: 7.9 }, 0.25))
    g.add(rbox(3, 30.4, 0.8, hook, { x, y: -0.6, z: -8.2 }, 0.3))
    g.add(rbox(3, 0.8, 6.4, hook, { x, y: 29, z: -11.4 }, 0.3))
    g.add(rbox(3, 7, 0.8, hook, { x, y: 22.8, z: -14.2 }, 0.3))
  }
  return fitWall(g, RP_MOUNT, RP_D)
}

// ---------- 梯形花架：一侧竖直、一侧斜撑的梯形侧框，三层从下往上越来越窄的条板，每层摆两盆小花 ----------

/** 三层的 [板顶高, 板前沿 z, 盆的 z] */
const LP_TIERS: [number, number, number][] = [
  [24, 16, 9.5],
  [50, 8.6, 1.5],
  [76, 1.2, -8.5],
]
function ladderPlanter(p: string[]) {
  const [wood, pot, petal] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 33.5
    // 斜前腿、竖后腿、顶上的连接块
    g.add(P(rbox(3, Math.hypot(25, 88), 3.5, wood, {}, 0.6), x, 44, 8.5, -Math.atan2(25, 88), 0, 0))
    g.add(rbox(3, 88, 3.5, wood, { x, z: -20.5 }, 0.6))
    g.add(rbox(3, 3, 19.5, wood, { x, y: 86, z: -12.5 }, 0.6))
  }
  // 后面一根横撑
  g.add(rbox(67, 3, 2, wood, { y: 8, z: -20.5 }, 0.5))
  // 每层两根条板（中间留 1cm 缝）+ 两盆花
  const petals = [petal, shade(petal, 0.16), WHITE]
  LP_TIERS.forEach(([y, zf, zp], i) => {
    const d = (zf + 20 - 1) / 2
    for (const k of [0, 1]) g.add(rbox(67, 2, d, wood, { y: y - 2, z: -20 + d / 2 + k * (d + 1) }, 0.5))
    for (const [j, x] of [-17, 17].entries()) g.add(potFlower(x + (i % 2 ? 2 : -2), y - 0.3, zp, j ? shade(pot, -0.08) : pot, petals[(i + j) % 3], i + j))
  })
  return fitGroup(g)
}

// ---------- 壁挂折叠小桌：墙上一块挂板，桌板放平，两侧三角折叠支架（竖臂贴板、横臂托桌、斜撑带转轴） ----------

const FT = { mount: 70, w: 60, d: 40, h: 35 }
function foldingTable(p: string[]) {
  const [wood, metal] = p
  const g = new THREE.Group()
  const zb = -FT.d / 2
  // 挂板 + 四颗螺钉
  g.add(rbox(FT.w, FT.h - 3.2, 2, wood, { z: zb + 1 }, 0.6))
  for (const sx of [-1, 1]) for (const y of [4, 26]) g.add(noOutline(cylZ(0.7, 0.6, metal, sx * 26, y, zb + 2.15, 10)))
  // 桌板：四条横板，后沿压在铰链上
  for (let i = 0; i < 4; i++) g.add(rbox(FT.w, 3, 8.9, wood, { y: FT.h - 3, z: zb + 2 + 4.45 + i * 9.7 }, 0.8))
  g.add(cylX(0.9, 52, metal, 0, FT.h - 3.4, zb + 2.6, 10))
  // 折叠支架
  for (const s of [-1, 1]) {
    const x = s * 24
    g.add(rbox(2.4, 30.6, 1, metal, { x, y: 1, z: zb + 2.4 }, 0.3))
    g.add(rbox(2.4, 1, 30, metal, { x, y: FT.h - 3.9, z: zb + 17.5 }, 0.3))
    g.add(strutBox([x, 3, zb + 2.6], [x, FT.h - 3.4, zb + 29], 2, 1, metal, 0.3))
    for (const [y, z] of [
      [3, zb + 2.6],
      [FT.h - 3.4, zb + 29],
    ])
      g.add(cylX(0.9, 3.4, metal, x, y, z, 10))
  }
  return fitWall(g, FT.mount, FT.d)
}

// ---------- 吊篮蛋椅：圆盘底座上一根弯成问号的立杆，吊链挂着一只藤编蛋形吊篮（经线 + 纬圈，正面开一个大口），里面是坐垫和靠垫 ----------

const EG = { y0: 38, h: 112, r: 40, z: 6, n: 18 }
/** 蛋形轮廓：t 从底（0）到顶（1），最胖的地方偏下 */
const eggR = (t: number) => EG.r * Math.pow(Math.max(0, Math.sin(PI * Math.pow(t, 0.85))), 0.65)
const eggPt = (phi: number, t: number): V3 => [eggR(t) * Math.cos(phi), EG.y0 + EG.h * t, EG.z + eggR(t) * Math.sin(phi)]
/** 正面开口：以 +z（φ = 90°）为中心左右各 70°，从 t = 0.3 开到顶 */
const EG_OPEN = { half: (70 * PI) / 180, t0: 0.3, t1: 0.96 }

function hangingEgg(p: string[]) {
  const [rattan, cushion, frame] = p
  const g = new THREE.Group()
  const inOpen = (phi: number) => Math.abs(((phi - PI / 2 + PI * 3) % (PI * 2)) - PI) < EG_OPEN.half - 1e-3
  // 经线：开口里的只织到开口下沿
  for (let k = 0; k < EG.n; k++) {
    const phi = (k / EG.n) * PI * 2
    if (Math.abs(Math.abs(((phi - PI / 2 + PI * 3) % (PI * 2)) - PI) - EG_OPEN.half) < 1e-3) continue
    const t1 = inOpen(phi) ? EG_OPEN.t0 : 1
    const pts: V3[] = []
    for (let i = 0; i <= 8; i++) pts.push(eggPt(phi, 0.02 + ((t1 - 0.02) * i) / 8))
    g.add(tube(pts, 0.8, rattan, { seg: t1 < 1 ? 6 : 14, radial: 5 }))
  }
  // 纬圈：开口以下整圈，开口以上只绕后面
  for (const t of [0.08, 0.17, 0.42, 0.54, 0.66, 0.78, 0.88]) {
    const pts: V3[] = []
    if (t < EG_OPEN.t0) {
      for (let i = 0; i < 24; i++) pts.push(eggPt((i / 24) * PI * 2, t))
      g.add(tube(pts, 0.7, rattan, { seg: 32, radial: 5, closed: true }))
    } else {
      const a0 = PI / 2 + EG_OPEN.half
      const span = PI * 2 - EG_OPEN.half * 2
      for (let i = 0; i <= 16; i++) pts.push(eggPt(a0 + (span * i) / 16, t))
      g.add(tube(pts, 0.7, rattan, { seg: 24, radial: 5 }))
    }
  }
  // 开口的粗边框（U 形）+ 篮底的粗圈
  const rim: V3[] = []
  const aL = PI / 2 + EG_OPEN.half
  const aR = PI / 2 - EG_OPEN.half
  for (let i = 0; i <= 6; i++) rim.push(eggPt(aL, EG_OPEN.t1 - ((EG_OPEN.t1 - EG_OPEN.t0) * i) / 6))
  for (let i = 1; i < 6; i++) rim.push(eggPt(aL - ((aL - aR) * i) / 6, EG_OPEN.t0))
  for (let i = 0; i <= 6; i++) rim.push(eggPt(aR, EG_OPEN.t0 + ((EG_OPEN.t1 - EG_OPEN.t0) * i) / 6))
  g.add(cappedTube(rim, 1.6, shade(rattan, -0.08), { seg: 36, radial: 8 }))
  g.add(torus(eggR(0.3), 1.4, shade(rattan, -0.08), { y: EG.y0 + EG.h * 0.3, z: EG.z, rx: PI / 2 }, PI * 2))
  g.add(torus(eggR(0.08) + 0.4, 1.2, shade(rattan, -0.08), { y: EG.y0 + EG.h * 0.08, z: EG.z, rx: PI / 2 }, PI * 2))
  // 顶上的吊环
  const topY = EG.y0 + EG.h
  g.add(cyl(2.4, 3, 3, shade(rattan, -0.08), { y: topY - 1.5, z: EG.z }, 12))
  // 坐垫、靠垫、一只小抱枕
  g.add(puck(24, 12, cushion, { y: 52, z: EG.z }))
  g.add(ball(24, shade(cushion, -0.04), { y: 95, z: EG.z - 22 }, [1.1, 1.3, 0.45], [20, 14]))
  g.add(ball(8, shade(cushion, 0.08), { x: 11, y: 70, z: EG.z + 2 }, [1.1, 1, 0.6], [16, 12]))
  // 底座、立杆、吊钩、吊链
  g.add(puck(48, 4, frame, { z: -4 }))
  g.add(cyl(6, 7, 3, frame, { y: 3.4, z: -46 }, 16))
  const hookZ = EG.z
  g.add(cappedTube([[0, 5, -46], [0, 100, -47], [0, 160, -42], [0, 182, -28], [0, 190, -10], [0, 189.5, hookZ]], 2.6, frame, { seg: 32, radial: 10 }))
  g.add(cyl(0.9, 0.9, 5, STEEL, { y: 184.6, z: hookZ }, 8))
  const links = 8
  const y1 = 185
  const y0 = topY + 1.5
  for (let i = 0; i < links; i++) {
    const y = y1 - ((y1 - y0) * (i + 0.5)) / links
    g.add(torus(2, 0.45, STEEL, { y, z: hookZ, ry: i % 2 ? PI / 2 : 0 }, PI * 2, [4, 12]))
  }
  return fitGroup(g)
}

// ---------- 户外收纳箱：仿藤编的长箱（一圈圈深浅相间的编织带 + 四角立柱），翻盖上铺一块坐垫，正面一只拉手 ----------

const CB = { w: 120, d: 55, body: 54 }
function cushionBox(p: string[]) {
  const [rattan, cushion, trim] = p
  const g = new THREE.Group()
  const post = shade(rattan, -0.14)
  // 脚垫、空心箱体、四角立柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 2.4, 6, trim, { x: sx * 55, z: sz * 22 }, 0.6))
  g.add(tray(116, CB.body - 2, 51, 2, rattan, { y: 2 }))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, CB.body - 2.2, 4, post, { x: sx * 57, y: 2, z: sz * 24.5 }, 0.8))
  // 编织带：前后各 8 道、两侧各 8 道，深浅相间
  for (let i = 0; i < 8; i++) {
    const y = 4 + i * 6.2
    const c = i % 2 ? shade(rattan, 0.06) : shade(rattan, -0.06)
    for (const s of [-1, 1]) {
      g.add(box(111, 5.4, 0.8, c, { y, z: s * 25.7 }))
      g.add(box(0.8, 5.4, 46, c, { x: s * 58.2, y }))
    }
  }
  // 翻盖、坐垫、拉手
  g.add(rbox(CB.w, 4, CB.d, shade(rattan, -0.04), { y: CB.body }, 1.2))
  g.add(rbox(112, 2.6, 48, cushion, { y: CB.body + 3.8 }, 1.2))
  g.add(rbox(18, 2, 1.6, trim, { y: CB.body + 0.8, z: CB.d / 2 + 0.6 }, 0.5))
  return g
}

// ---------- 阳台串灯杆：两根带配重底座的立杆，杆顶探出挂臂，一根电线垂成弧，线上每隔 20cm 吊一只发光的小圆灯泡 ----------

const SL = { x: 135, top: 216, wire: 211, sag: 25 }
function stringLights(p: string[]) {
  const [pole, wire, bulb, bulb2] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * SL.x
    g.add(cyl(13, 15, 5, shade(pole, -0.06), { x }, 24))
    g.add(cyl(4, 6, 3, pole, { x, y: 4.8 }, 16))
    g.add(cyl(1.4, 1.4, SL.top - 7.5, pole, { x, y: 7.5 }, 12))
    g.add(ball(2, pole, { x, y: SL.top + 0.2 }))
    // 挂臂 + 挂环
    g.add(rod3([x, SL.wire + 1.4, 0], [x - s * 5, SL.wire + 1.4, 0], 0.6, pole, 8))
    g.add(torus(1.2, 0.35, pole, { x: x - s * 5.6, y: SL.wire + 0.6 }, PI * 2, [5, 12]))
  }
  // 电线：悬链近似成抛物线
  const x0 = SL.x - 5.6
  const yAt = (x: number) => SL.wire - SL.sag * (1 - (x / x0) ** 2)
  const pts: V3[] = []
  for (let i = 0; i <= 16; i++) {
    const x = -x0 + (2 * x0 * i) / 16
    pts.push([x, yAt(x), 0])
  }
  g.add(tube(pts, 0.3, wire, { seg: 32, radial: 5 }))
  // 灯泡：一小段吊线、灯座、发光的圆泡
  for (let i = 0; i < 12; i++) {
    const x = -110 + i * 20
    const yw = yAt(x)
    g.add(rod3([x, yw, 0], [x, yw - 3, 0], 0.2, wire, 5))
    g.add(cyl(1.2, 1.3, 2.6, wire, { x, y: yw - 5.4 }, 10))
    g.add(lit(ball(3, bulb, { x, y: yw - 8.2 }, [1, 1.15, 1], [10, 8]), i % 2 ? bulb2 : bulb, 0.9))
  }
  return g
}

// ---------- 雨水桶：略收口的桶身两道加强箍，扣着带滤网的盖，背后一根方形落水管经分流盒接进桶里，底部前面一只水龙头 ----------

const RB = { y: 6, h: 78, rT: 23, rB: 21, z: 2.5 }
function rainBarrel(p: string[]) {
  const [body, lid, tap] = p
  const g = new THREE.Group()
  const rAt = (y: number) => RB.rB + ((RB.rT - RB.rB) * (y - RB.y)) / RB.h
  // 底座、桶身、加强箍
  g.add(cyl(19, 20, RB.y + 0.4, lid, { z: RB.z }, 24))
  g.add(cup(RB.rT, RB.rB, RB.h, 1.5, body, { y: RB.y, z: RB.z }))
  for (const y of [22, 66]) g.add(torus(rAt(y) + 0.2, 1, shade(body, -0.08), { y, z: RB.z, rx: PI / 2 }, PI * 2))
  // 盖、滤网、盖上的提手
  const top = RB.y + RB.h
  g.add(puck(24, 3, lid, { y: top - 0.5, z: RB.z }))
  g.add(cyl(9, 9, 0.6, shade(lid, -0.25), { y: top + 2.4, z: RB.z + 4 }, 24))
  g.add(rbox(10, 1.4, 2.4, shade(lid, -0.1), { y: top + 2.4, z: RB.z - 11 }, 0.5))
  // 落水管：贴在背后，从地面到顶；分流盒套在管上，一截短管接进桶壁
  const zp = -25
  g.add(rbox(7, 90, 5, lid, { z: zp }, 0.8))
  g.add(rbox(9, 14, 6.6, shade(lid, -0.08), { y: 66, z: zp }, 1))
  g.add(cylZ(1.6, 4.4, shade(lid, -0.08), 0, 73, -20.4, 12))
  // 水龙头：伸出的短管、朝下的出水嘴、顶上的蝶形把手
  const zf = RB.z + rAt(14) - 0.6
  g.add(cylZ(2.2, 1.4, tap, 0, 14, zf + 0.4, 14))
  g.add(cylZ(1.2, 4.4, tap, 0, 14, zf + 2.6, 12))
  g.add(cyl(1, 1.1, 3, tap, { y: 10.2, z: zf + 4.2 }, 10))
  g.add(cyl(0.5, 0.5, 2, tap, { y: 15, z: zf + 3 }, 8))
  g.add(rbox(4.6, 0.8, 1.2, tap, { y: 16.8, z: zf + 3 }, 0.3))
  return fitGroup(g)
}

// ---------- 滚筒堆肥箱：两副 A 字钢架托着一根横轴，轴上是十二棱的黑色滚筒（两道加强筋、两端端盖带通风孔），正面一扇带锁扣的投料门 ----------

const CT = { y: 64, r: 27, len: 58, x: 34 }
function compostTumbler(p: string[]) {
  const [frame, drum, hatch] = p
  const g = new THREE.Group()
  // 滚筒绕轴转 15°，让一块平面正对前方装门
  const rot = PI / 12
  g.add(P(cyl(CT.r, CT.r, CT.len, drum, {}, 12), 0, CT.y, 0, rot, 0, PI / 2))
  for (const x of [-12, 12]) g.add(P(cyl(CT.r + 1, CT.r + 1, 3, shade(drum, 0.06), {}, 12), x, CT.y, 0, rot, 0, PI / 2))
  for (const s of [-1, 1]) {
    g.add(P(cyl(CT.r + 1, CT.r + 1, 2, shade(drum, -0.05), {}, 12), s * (CT.len / 2 + 0.5), CT.y, 0, rot, 0, PI / 2))
    // 端盖上一圈通风孔
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2
      g.add(noOutline(cylX(1.6, 0.6, DARK, s * (CT.len / 2 + 1.6), CT.y + Math.sin(a) * 15, Math.cos(a) * 15, 10)))
    }
  }
  // 投料门（贴在正面那块平面上）+ 两只合页 + 锁扣
  const zf = CT.r * Math.cos(PI / 12)
  g.add(rbox(30, 12, 1.2, hatch, { y: CT.y - 6, z: zf + 0.4 }, 0.5))
  for (const x of [-10, 10]) g.add(cylX(0.7, 4, shade(hatch, -0.2), x, CT.y + 6.2, zf + 0.9, 8))
  g.add(rbox(4, 3, 1.4, STEEL, { y: CT.y - 7.6, z: zf + 1.3 }, 0.4))
  // 横轴、轴座、A 字架、下横撑、脚垫
  g.add(cylX(1.2, CT.x * 2 + 5, STEEL, 0, CT.y, 0, 10))
  for (const s of [-1, 1]) {
    const x = s * CT.x
    g.add(cylX(3.4, 4, frame, x, CT.y, 0, 14))
    for (const sz of [-1, 1]) {
      g.add(rod3([x, 1.2, sz * 27], [x, CT.y, 0], 1.6, frame, 10))
      g.add(rbox(4.4, 1.5, 7, RUBBER, { x, z: sz * 27 }, 0.4))
    }
  }
  const zc = 27 * (1 - (16 - 1.2) / (CT.y - 1.2))
  for (const sz of [-1, 1]) g.add(rod3([-CT.x, 16, sz * zc], [CT.x, 16, sz * zc], 1.2, frame, 10))
  return fitGroup(g)
}

// ---------- 花园水管车：两只大轮子、往后仰的推把，前面一条撑脚；中间的卷盘绕满水管，右边一只摇柄，喷枪挂在左立柱的枪架上 ----------

function hoseCart(p: string[]) {
  const [frame, hose, acc] = p
  const g = new THREE.Group()
  const wz = -12
  const wy = 13
  // 轮子、轴
  for (const s of [-1, 1]) {
    g.add(cylX(13, 4, RUBBER, s * 21, wy, wz, 24))
    g.add(cylX(6.5, 4.4, acc, s * 21, wy, wz, 16))
  }
  g.add(cylX(0.9, 47, STEEL, 0, wy, wz, 8))
  // 侧框：立柱（轴 → 推把）、斜撑脚（立柱中段 → 前脚）
  const postZ = (y: number) => wz - (6 * (y - 10)) / 76
  const legZ = (y: number) => postZ(40) + ((20 - postZ(40)) * (40 - y)) / (40 - 1.4)
  for (const s of [-1, 1]) {
    const x = s * 17
    g.add(rod3([x, 10, wz], [x, 86, postZ(86)], 1.3, frame, 10))
    g.add(rod3([x, 40, postZ(40)], [x, 1.4, 20], 1.2, frame, 10))
    g.add(rbox(4, 1.4, 5, RUBBER, { x, z: 20 }, 0.4))
    // 轴座
    g.add(cylX(2, 3, frame, x, wy, wz, 12))
  }
  // 推把横杆 + 泡棉握把、下横撑
  g.add(cylX(1.3, 36.6, frame, 0, 86, postZ(86), 10))
  g.add(cylX(2.1, 18, acc, 0, 86, postZ(86), 14))
  g.add(cylX(1, 34.4, frame, 0, 3.2, 19.4, 8))
  // 卷盘：芯筒、两片挡盘、外层一圈圈水管、穿过侧框的轴
  const ry = 26
  const rz = legZ(ry)
  g.add(cylX(1, 37, STEEL, 0, ry, rz, 8))
  g.add(cylX(12.6, 23, shade(hose, -0.12), 0, ry, rz, 20))
  for (const s of [-1, 1]) g.add(cylX(17, 1.2, frame, s * 12.4, ry, rz, 28))
  for (let x = -10.8; x <= 10.81; x += 1.8) g.add(torus(13, 0.9, hose, { x, y: ry, z: rz, ry: PI / 2 }, PI * 2, [5, 24]))
  // 摇柄（右边）
  g.add(rod3([18.6, ry, rz], [21.6, ry, rz], 0.8, STEEL, 8))
  g.add(rod3([21.6, ry, rz], [21.6, ry + 8, rz], 0.8, STEEL, 8))
  g.add(cylX(1.1, 4, acc, 23.4, ry + 8, rz, 10))
  // 枪架和喷枪（左立柱，枪嘴朝下）
  const gy = 56
  const gz = postZ(gy)
  g.add(rbox(6, 2, 4, frame, { x: -19.5, y: gy, z: gz }, 0.5))
  g.add(rbox(2.6, 10.4, 3.2, acc, { x: -21.2, y: gy - 9, z: gz }, 0.8))
  g.add(cyl(1.4, 1.1, 2.6, shade(acc, -0.2), { x: -21.2, y: gy - 11.3, z: gz }, 12))
  g.add(strutBox([-21.2, gy + 1, gz], [-21.2, gy + 6, gz + 6.2], 2.4, 2.8, acc, 0.6))
  g.add(strutBox([-21.2, gy - 1, gz + 2.4], [-21.2, gy + 2.6, gz + 4.6], 1, 1.2, shade(acc, -0.2), 0.3))
  // 水管从卷盘顶上拉出来，接到枪柄末端
  g.add(tube([[-8, ry + 13.6, rz], [-12, ry + 20, rz + 6], [-18, gy + 2, gz + 9], [-21.2, gy + 6.4, gz + 6.6]], 0.9, hose, { seg: 24, radial: 8 }))
  return fitGroup(g)
}

// ---------- 小型育苗温室：梯形侧板的木框箱（前低后高），斜盖是木框 + 两片透明板，后沿两只合页；箱里铺土、摆着几盆小苗 ----------

const CF = { w: 100, d: 60, front: 32, back: 52, t: 2.5 }
function coldFrame(p: string[]) {
  const [wood, lid, pot] = p
  const g = new THREE.Group()
  const hd = CF.d / 2
  // 侧板（侧视梯形）、前板、后板
  for (const s of [-1, 1])
    g.add(
      sideSlab(
        [
          [-hd, 0],
          [hd, 0],
          [hd, CF.front],
          [-hd, CF.back],
        ],
        CF.t,
        wood,
        s * (CF.w / 2 - CF.t / 2),
      ),
    )
  g.add(rbox(CF.w - CF.t * 2 + 1, CF.front, CF.t, wood, { z: hd - CF.t / 2 }, 0.5))
  g.add(rbox(CF.w - CF.t * 2 + 1, CF.back, CF.t, wood, { z: -hd + CF.t / 2 }, 0.5))
  // 前板外面两道压条
  for (const y of [8, 22]) g.add(rbox(CF.w - 8, 2.4, 0.8, shade(wood, -0.08), { y, z: hd + 0.2 }, 0.3))
  // 土、盆、芽
  g.add(rbox(CF.w - CF.t * 2 + 1, 6, CF.d - CF.t * 2 + 1, SOIL, { y: 0.5 }, 0.4))
  ;[-28, 0, 28].forEach((x, i) =>
    [-11, 11].forEach((z, j) => {
      const c = (i + j) % 2 ? shade(pot, -0.08) : pot
      g.add(cup(4.5, 3.6, 7, 0.6, c, { x, y: 6.2, z }, 14))
      g.add(cyl(soilR(4.5, 3.6, 0.86, 0.6), soilR(4.5, 3.6, 0.78, 0.6), 0.6, SOIL, { x, y: 6.2 + 5.5, z }, 14))
      g.add(sprout(x, 6.2 + 5.9, z, i + j * 1.3))
    }),
  )
  // 斜盖：在斜面坐标系里摆（原点在后沿，局部 +z 顺着斜面往前下方，+y 是朝上的法线）
  const { g: tf, len } = tiltFrame([-hd, CF.back], [hd, CF.front], 'z')
  const fy = -0.3
  tf.add(rbox(CF.w, 3, 4, lid, { y: fy, z: 2 }, 0.6))
  tf.add(rbox(CF.w, 3, 4, lid, { y: fy, z: len - 2 }, 0.6))
  for (const x of [-(CF.w / 2 - 2), 0, CF.w / 2 - 2]) tf.add(rbox(x ? 4 : 3, 3, len - 0.2, lid, { x, y: fy, z: len / 2 }, 0.6))
  for (const s of [-1, 1]) tf.add(ghost(rbox(46.4, 0.6, len - 7.6, GLASS, { x: s * 24.2, y: fy + 1.2, z: len / 2 }, 0.2), GLASS, 0.32))
  // 盖子前沿的拉手
  tf.add(rbox(10, 1.4, 2.4, STEEL, { y: fy + 2.8, z: len - 2 }, 0.4))
  g.add(tf)
  // 后沿合页
  for (const x of [-30, 30]) g.add(cylX(0.8, 6, STEEL, x, CF.back + 0.4, -hd + 0.4, 10))
  return fitGroup(g)
}

// ---------- 阳台隐私屏：四根立柱分成三格，上下横档之间排满竹竿（竹节错开），前后各两道横压条，每根立柱下一只 T 形脚 ----------

const BSC = { w: 180, d: 30, h: 150 }
function balconyScreen(p: string[]) {
  const [frame, bamboo, tie] = p
  const g = new THREE.Group()
  const posts = [-88, -29.3, 29.3, 88]
  for (const x of posts) {
    g.add(rbox(5, 5, BSC.d, frame, { x }, 1))
    g.add(rbox(4, BSC.h - 4.8, 4, frame, { x, y: 4.8 }, 0.8))
    g.add(rbox(5, 1.6, 5, shade(frame, -0.08), { x, y: BSC.h - 1.2 }, 0.5))
  }
  g.add(rbox(BSC.w - 1, 4, 3.6, frame, { y: BSC.h - 5.4 }, 0.8))
  g.add(rbox(BSC.w - 1, 4, 3.6, frame, { y: 14 }, 0.8))
  // 每格的竹竿
  const y0 = 17.6
  const y1 = BSC.h - 5
  for (let b = 0; b < 3; b++) {
    const xa = posts[b] + 2
    const xb = posts[b + 1] - 2
    const n = Math.floor((xb - xa) / 3)
    const step = (xb - xa) / n
    for (let i = 0; i < n; i++) {
      const x = xa + step * (i + 0.5)
      const c = i % 3 === 0 ? shade(bamboo, -0.05) : i % 3 === 1 ? bamboo : shade(bamboo, 0.04)
      g.add(cyl(1.4, 1.4, y1 - y0, c, { x, y: y0 }, 8))
      for (const y of i % 2 ? [48, 92] : [62, 108]) g.add(cyl(1.6, 1.6, 0.8, shade(c, -0.06), { x, y }, 8))
    }
    // 横压条（前后各两道）
    for (const y of [40, 118]) for (const s of [-1, 1]) g.add(rbox(xb - xa, 2.2, 1.2, tie, { x: (xa + xb) / 2, y, z: s * 1.9 }, 0.4))
  }
  return g
}

// ---------- 游泳圈与充气火烈鸟：一只红白相间、立着的游泳圈，旁边趴着一只长脖子的粉色充气火烈鸟 ----------

function poolFloats(p: string[]) {
  const [ring, stripe, bird] = p
  const g = new THREE.Group()
  // 游泳圈：六段交替的圆环弧拼成一整圈，带一只气嘴
  const R0 = 21
  const T0 = 8.5
  const ring0 = new THREE.Group()
  for (let k = 0; k < 6; k++) ring0.add(torus(R0, T0, k % 2 ? stripe : ring, { rz: (k * PI) / 3 }, PI / 3))
  ring0.add(cylZ(1.2, 2, shade(ring, -0.12), R0 * Math.cos(PI / 4), R0 * Math.sin(PI / 4), T0 - 0.3, 10))
  g.add(P(ring0, -24, R0 + T0, -6, 0, 0.35, 0))
  // 火烈鸟：身体、翅膀、尾巴、S 形长脖子、头、喙、眼睛
  const bx = 22
  const wing = shade(bird, -0.08)
  g.add(ball(16, bird, { x: bx, y: 11.6, z: 2 }, [0.95, 0.72, 1.45]))
  for (const s of [-1, 1]) g.add(ball(9, wing, { x: bx + s * 13.6, y: 14, z: -2, rx: -0.15 }, [0.35, 0.6, 1.2], [16, 12]))
  g.add(taperRod3([bx, 15, -18], [bx, 24, -26], 5, 1.4, bird, 14))
  g.add(cappedTube([[bx, 17, 16], [bx, 32, 22], [bx, 46, 18], [bx, 56, 12], [bx, 62, 14]], 3.8, bird, { seg: 24, radial: 10 }))
  g.add(ball(6, bird, { x: bx, y: 64, z: 16 }, [0.9, 0.95, 1.1]))
  g.add(taperRod3([bx, 63.6, 20.5], [bx, 60.6, 25.4], 2.1, 1.1, WHITE, 12))
  g.add(ball(1.2, DARK, { x: bx, y: 60.2, z: 25.8 }))
  for (const s of [-1, 1]) g.add(noOutline(ball(0.9, DARK, { x: bx + s * 5, y: 65.4, z: 18 }, [0.5, 1, 1])))
  return fitGroup(g)
}

// ---------- 阳台晒鞋架：两侧立柱 + 底脚，上下两根横杆各伸出四根往前上斜的鞋桩，桩上倒插着三双运动鞋（鞋尖朝上、鞋底朝外） ----------

/** 倒插运动鞋的侧面轮廓 [鞋高方向 u, 鞋长方向 y]：鞋跟在 y = 0、鞋尖朝 +y，u = 0 是鞋底那一侧 */
const SHOE_SIDE: [number, number][] = [
  [1.8, 0.4],
  [8.2, 0.4],
  [8.6, 2],
  [7.1, 3.6],
  [6.7, 9],
  [6.2, 12],
  [4.6, 20],
  [3.6, 23.4],
  [2.6, 24.8],
  [1.8, 24.8],
]
/**
 * 一只倒插的运动鞋（侧面朝前）：局部 +y 是鞋尖方向，鞋底朝 -x，鞋面朝 +x，鞋宽沿 z。
 * 鞋桩从鞋跟插进去，走在 x = 4.5 的鞋身里。
 */
function invertedShoe(color: string) {
  const g = new THREE.Group()
  // 鞋面：侧面轮廓挤出（sideSlab 的轮廓在 [z, y]、沿 x 挤出，转 90° 让轮廓落到 xy 平面）
  g.add(P(sideSlab(SHOE_SIDE.map(([u, y]) => [-u, y] as [number, number]), 8, color, 0, { bevel: 1.2, bevelSeg: 2 }), 0, 0, 0, 0, -PI / 2, 0))
  // 鞋底：一条白色厚底，鞋跟处略高
  g.add(rbox(2.4, 25.2, 8.8, WHITE, { x: 1.0, y: 0.1 }, 1))
  // 鞋口、鞋带、后跟拉环
  g.add(noOutline(ball(2.4, DARK, { x: 7.0, y: 6.4 }, [0.3, 1.3, 0.8], SEG_S)))
  for (const [y, u] of [[11, 6.3], [14, 5.75], [17, 5.15]]) g.add(box(0.6, 0.8, 5.2, WHITE, { x: u - 0.15, y }))
  g.add(box(3, 1.4, 2.2, shade(color, -0.2), { x: 6.2, y: -0.5 }))
  // 白色包头、两侧一道斜饰条
  g.add(ball(3, WHITE, { x: 2.4, y: 23.2 }, [0.9, 0.62, 1.38], [10, 8]))
  for (const s of [-1, 1]) g.add(box(1.4, 10, 0.5, WHITE, { x: 4.4, y: 4.5, z: s * 4.05, rz: -0.38 }))
  return g
}

function shoeDryer(p: string[]) {
  const [frame, shoeA, shoeB] = p
  const g = new THREE.Group()
  const zb = -6
  for (const s of [-1, 1]) {
    const x = s * 23
    g.add(rbox(3, 2, 30, frame, { x }, 0.6))
    g.add(rod3([x, 1.6, zb], [x, 66, zb], 1, frame, 10))
    g.add(ball(1.3, frame, { x, y: 66, z: zb }, undefined, SEG_S))
  }
  g.add(rod3([-23, 66, zb], [23, 66, zb], 0.9, frame, 10))
  // 两层横杆和鞋桩
  const lean = Math.atan2(6, 16)
  const tiers: [number, (string | null)[]][] = [
    [40, [shoeA, shoeA, shoeB, shoeB]],
    [10, [null, shade(shoeB, 0.16), shade(shoeB, 0.16), null]],
  ]
  for (const [yb, shoes] of tiers) {
    g.add(rod3([-23, yb, zb], [23, yb, zb], 0.9, frame, 10))
    ;[-16.5, -6.5, 6.5, 16.5].forEach((x, i) => {
      g.add(rod3([x, yb, zb], [x, yb + 16, zb + 6], 0.55, frame, 8))
      g.add(ball(0.8, frame, { x, y: yb + 16, z: zb + 6 }, undefined, [6, 4]))
      const c = shoes[i]
      if (!c) return
      // 鞋套在桩上：鞋跟离横杆 3cm，桩走在鞋身里（局部 x = 4.5）；一双鞋鞋底朝外，右脚那只绕竖轴转半圈
      const inner = invertedShoe(c)
      inner.position.x = -4.5
      const turn = new THREE.Group()
      turn.add(inner)
      if (i % 2) turn.rotation.y = PI
      const sh = new THREE.Group()
      sh.add(turn)
      sh.rotation.x = lean
      sh.position.set(x, yb + 3 * Math.cos(lean), zb + 3 * Math.sin(lean))
      g.add(sh)
    })
  }
  return fitGroup(g)
}

// ======================================================================
// 配色
// ======================================================================

/** 咖啡桌椅：[铁框, 椅子条板, 桌面] */
const BS_PALS: Pal[] = [
  ['retro', [R.teal, R.cream, R.cream]],
  ['industrial', [I.iron, I.walnut, I.walnut]],
  ['nordic', [N.white, N.oak, N.oakL]],
  ['cute', [C.pink, C.white, C.white]],
  ['classic', [CL.navy, CL.cream, CL.ivory]],
]
/** 栏杆花槽：[槽身, 挂钩, 花色] */
const RP_PALS: Pal[] = [
  ['cute', [C.sakura, C.white, '#ff7f9a']],
  ['nordic', [N.white, M.char, '#f2b8c6']],
  ['retro', [TERRA, I.iron, '#e0566a']],
  ['modern', [M.char, M.black, M.white]],
  ['farmhouse', [F.sage, F.iron, F.butter]],
]
/** 梯形花架：[木架, 花盆, 花色] */
const LP_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, '#f2b8c6']],
  ['japanese', [J.wood, TERRA, '#c9a6e8']],
  ['cute', [C.white, C.sky, C.pink]],
  ['industrial', [I.walnut, I.concrete, '#f0c24a']],
  ['farmhouse', [F.white, TERRA, '#e0566a']],
]
/** 折叠小桌：[木板, 支架] */
const FT_PALS: Pal[] = [
  ['nordic', [N.oak, N.white]],
  ['industrial', [I.walnut, I.iron]],
  ['modern', [M.white, M.char]],
  ['japanese', [J.hinoki, J.sumi]],
  ['cute', [C.mint, C.white]],
]
/** 蛋椅：[藤编, 坐垫, 支架] */
const EG_PALS: Pal[] = [
  ['nordic', ['#d8b98a', N.white, M.char]],
  ['cute', ['#ecd8b0', C.sakura, C.white]],
  ['modern', [M.char, M.light, M.black]],
  ['japanese', ['#b08a5a', J.washi, J.sumi]],
  ['retro', ['#a8683a', R.mustard, R.cream]],
]
/** 收纳箱：[仿藤, 坐垫, 拉手 / 脚垫] */
const CB_PALS: Pal[] = [
  ['nordic', ['#cfae80', N.linen, N.oak]],
  ['modern', [M.gray, M.light, M.char]],
  ['industrial', ['#6e5a48', I.concrete, I.iron]],
  ['cute', ['#ecd8b0', C.mint, C.woodD]],
  ['farmhouse', [F.white, F.navy, F.oak]],
]
/** 串灯：[灯杆, 电线 / 灯座, 灯泡, 间隔的灯泡] */
const SL_PALS: Pal[] = [
  ['industrial', [I.iron, I.iron, '#ffcf7a', '#ffcf7a']],
  ['modern', [M.black, M.char, '#fff2c8', '#fff2c8']],
  ['nordic', [N.white, M.light, '#fff6d8', '#fff6d8']],
  ['cute', [C.pink, C.white, '#ffe9a8', '#ffc6e0']],
  ['retro', [R.caramel, '#4a3a2e', '#ffb86b', '#ffd98a']],
]
/** 雨水桶：[桶身, 盖 / 底座 / 落水管, 水龙头] */
const RB_PALS: Pal[] = [
  ['modern', [M.char, M.gray, '#c9a25a']],
  ['industrial', ['#4d5a52', I.steel, '#c9a25a']],
  ['cute', [C.sky, C.white, C.lemon]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['farmhouse', [F.oak, F.iron, '#c9a25a']],
]
/** 堆肥箱：[钢架, 滚筒, 投料门] */
const CT_PALS: Pal[] = [
  ['industrial', [I.steel, '#3b3d40', '#4f9e5b']],
  ['modern', [M.silver, M.char, M.light]],
  ['nordic', [N.white, N.sage, N.oak]],
  ['cute', [C.white, C.mint, C.lemon]],
  ['retro', [R.cream, R.olive, R.orange]],
]
/** 水管车：[车架 / 挡盘, 水管, 轮毂 / 握把 / 喷枪] */
const HC_PALS: Pal[] = [
  ['industrial', ['#4d5a52', '#4f9e5b', '#e2702f']],
  ['modern', [M.char, M.gray, '#e2702f']],
  ['retro', [R.teal, R.mustard, R.orange]],
  ['cute', [C.white, C.mint, C.pink]],
  ['farmhouse', [F.barn, '#4f9e5b', F.butter]],
]
/** 育苗温室：[箱体木料, 盖框, 小盆] */
const CF_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, TERRA]],
  ['farmhouse', [F.white, F.sage, TERRA]],
  ['industrial', [I.walnut, I.iron, '#4a4a4d']],
  ['japanese', [J.wood, J.dark, '#8f5a3c']],
  ['cute', [C.woodL, C.mint, C.pink]],
]
/** 隐私屏：[框, 竹竿, 压条] */
const BSC_PALS: Pal[] = [
  ['japanese', [J.dark, BAMBOO, J.sumi]],
  ['nordic', [N.oak, N.oakL, N.white]],
  ['modern', [M.char, '#b9a070', M.black]],
  ['chinese', [CN.rosewood, BAMBOO, CN.ink]],
  ['cute', [C.white, '#e8d6a8', C.pink]],
]
/** 游泳圈与火烈鸟：[圈底色, 圈条纹, 火烈鸟] */
const PF_PALS: Pal[] = [
  ['cute', [C.white, '#ff7f9a', '#ff9ec0']],
  ['cute', [C.sky, C.white, '#ffb6c8']],
  ['retro', [R.orange, R.cream, '#f27aa0']],
  ['modern', [M.white, '#3f7fd8', '#ff8fb1']],
  ['nordic', [N.white, N.blue, '#f5b6c8']],
]
/** 晒鞋架：[铁架, 鞋 A, 鞋 B] */
const SD_PALS: Pal[] = [
  ['modern', [M.silver, '#5b7fb0', '#e2702f']],
  ['cute', [C.white, C.pink, C.sky]],
  ['nordic', [N.white, N.sage, N.mustard]],
  ['industrial', [I.iron, I.leather, I.steel]],
  ['retro', [R.cream, R.red, R.teal]],
]

// ======================================================================
// 素材列表
// ======================================================================

export const BALCONY: AssetDef[] = [
  define('bl-bistro-set', '阳台咖啡桌椅', 'outdoor', [120, 62, 80], BS_PALS, bistroSet, {
    type: 'seat',
    mats: ['metal', 'wood', 'wood'],
    surface: BS.top,
    surfaceShape: [ellipsePoly(28)],
  }),
  define('bl-rail-planter', '栏杆挂式花槽', 'outdoor', [60, RP_D, 30], RP_PALS, railPlanter, {
    type: 'planter',
    mount: RP_MOUNT,
    mats: ['plastic', 'metal', 'plant'],
  }),
  define('bl-ladder-planter', '梯形花架', 'outdoor', [70, 45, 90], LP_PALS, ladderPlanter, {
    type: 'planter',
    mats: ['wood', 'ceramic', 'plant'],
  }),
  define('bl-folding-table', '壁挂折叠小桌', 'outdoor', [FT.w, FT.d, FT.h], FT_PALS, foldingTable, {
    type: 'table',
    mount: FT.mount,
    mats: ['wood', 'metal'],
    surface: FT.mount + FT.h,
    surfaceShape: [rectPoly(-FT.w / 2 + 1, -FT.d / 2 + 3, FT.w / 2 - 1, FT.d / 2 - 1)],
  }),
  define('bl-hanging-egg', '吊篮蛋椅', 'outdoor', [96, 98, 193], EG_PALS, hangingEgg, {
    type: 'armchair',
    tags: ['seat'],
    mats: ['wood', 'fabric', 'metal'],
  }),
  define('bl-outdoor-cushion-box', '户外收纳箱', 'outdoor', [CB.w, 56, 60.4], CB_PALS, cushionBox, {
    type: 'storage-box',
    mats: ['plastic', 'fabric', 'metal'],
    surface: CB.body + 6.4,
    surfaceShape: [rectPoly(-55, -23, 55, 23)],
  }),
  define('bl-string-lights', '阳台串灯', 'outdoor', [300, 30, 220], SL_PALS, stringLights, {
    type: 'decor',
    mats: ['metal', 'plastic', 'glass'],
  }),
  define('bl-rain-barrel', '雨水桶', 'outdoor', [48, 57, 90], RB_PALS, rainBarrel, {
    type: 'garden-tool',
    mats: ['plastic', 'plastic', 'metal'],
  }),
  define('bl-compost-tumbler', '滚筒堆肥箱', 'outdoor', [73, 61, 91], CT_PALS, compostTumbler, {
    type: 'garden-tool',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('bl-hose-cart', '水管车', 'outdoor', [49, 48, 88], HC_PALS, hoseCart, {
    type: 'garden-tool',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('bl-cold-frame', '育苗温室箱', 'outdoor', [CF.w, 61, 55], CF_PALS, coldFrame, {
    type: 'planter',
    mats: ['wood', 'wood', 'plastic'],
  }),
  define('bl-balcony-screen', '阳台隐私屏', 'outdoor', [181, BSC.d, BSC.h], BSC_PALS, balconyScreen, {
    type: 'partition',
    mats: ['wood', 'wood', 'wood'],
  }),
  define('bl-pool-floats', '游泳圈与充气火烈鸟', 'outdoor', [91, 54, 70], PF_PALS, poolFloats, {
    type: 'toy',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('bl-shoe-dryer', '阳台晒鞋架', 'outdoor', [50, 30, 70], SD_PALS, shoeDryer, {
    // 不用 laundry-stand：阳台布置按它挑晾衣架，晒鞋架没有挂钩层、挂不了衣服
    type: 'laundry-supply',
    mats: ['metal', 'fabric', 'fabric'],
  }),
]
