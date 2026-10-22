// 又一批家具：厨房岛台、吧台推车、收纳凳 / 收纳长凳、活动文件柜、转角书架、吊床。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；顶面、层板留空并声明 surface / surfaces。新素材直接在 def 里写 type / tags / mats。

import * as THREE from 'three'
import { ball, cyl, puck, rbox, shade } from '../toon'
import { C, rectPoly, slab, type AssetDef, type Poly } from '../kit'
import { P, cylX, rod3 } from '../geo'
import { CN, F, I, J, M, N, R, define, type Pal } from '../packkit'

const BRASS = '#d4b25a'
const TIRE = '#3a3a3c'
const STEEL = '#c3c7cc'

/** 一只脚轮：轮子横放在 (x, z)，上面一块小底座；整体高 h */
function caster(g: THREE.Group, x: number, z: number, h: number, color: string) {
  g.add(cylX(h * 0.36, h * 0.3, TIRE, x, h * 0.36, z, 14))
  g.add(rbox(h * 0.5, h * 0.3, h * 0.5, color, { x, y: h * 0.7, z }, 0.2))
}

// ---------- 厨房岛台：带门的柜体 + 后侧伸出的台面（吧台凳的腿位），侧面挂毛巾杆 ----------

const ISLAND_W = 120
const ISLAND_D = 75
const ISLAND_H = 90
/** 后侧台面挑出（坐吧台凳的那边） */
const OVERHANG = 25
function kitchenIsland(p: string[]) {
  const [body, top, knob] = p
  const g = new THREE.Group()
  const cd = ISLAND_D - OVERHANG
  const cz = ISLAND_D / 2 - cd / 2
  // 踢脚 + 柜体
  g.add(rbox(ISLAND_W - 6, 8, cd - 6, shade(body, -0.25), { z: cz - 1 }, 1))
  g.add(rbox(ISLAND_W - 2, ISLAND_H - 12, cd, body, { y: 8, z: cz }, 0.8))
  // 正面：左两扇门、右边三个抽屉
  const fz = ISLAND_D / 2 + 0.4
  const dw = (ISLAND_W - 8) / 3
  for (let i = 0; i < 2; i++) {
    const x = -ISLAND_W / 2 + 4 + dw * (i + 0.5)
    g.add(rbox(dw - 1.6, ISLAND_H - 17, 1.2, shade(body, 0.04), { x, y: 10, z: fz }, 0.4))
    g.add(rbox(1, 14, 1.2, knob, { x: x + (i ? -1 : 1) * (dw / 2 - 4), y: ISLAND_H - 30, z: fz + 1 }, 0.4))
  }
  const xd = -ISLAND_W / 2 + 4 + dw * 2.5
  const dh = (ISLAND_H - 17) / 3
  for (let j = 0; j < 3; j++) {
    const y = 10 + dh * j
    g.add(rbox(dw - 1.6, dh - 1.4, 1.2, shade(body, 0.04), { x: xd, y, z: fz }, 0.4))
    g.add(rbox(12, 1, 1.2, knob, { x: xd, y: y + dh - 7, z: fz + 1 }, 0.4))
  }
  // 台面（石材 / 木），后侧挑出
  g.add(rbox(ISLAND_W, 4, ISLAND_D, top, { y: ISLAND_H - 4 }, 0.8))
  // 后侧台面下的两根支撑
  for (const s of [-1, 1]) g.add(rbox(4, ISLAND_H - 4, 4, shade(body, -0.1), { x: s * (ISLAND_W / 2 - 4), z: -ISLAND_D / 2 + 3 }, 0.8))
  // 侧面毛巾杆
  g.add(rod3([ISLAND_W / 2 + 2.5, ISLAND_H - 22, cz - 12], [ISLAND_W / 2 + 2.5, ISLAND_H - 22, cz + 12], 0.6, knob))
  for (const s of [-1, 1]) g.add(rod3([ISLAND_W / 2 - 1, ISLAND_H - 22, cz + s * 12], [ISLAND_W / 2 + 2.5, ISLAND_H - 22, cz + s * 12], 0.5, knob))
  return g
}

// ---------- 吧台推车：两层带围边的托盘、细管框架、一侧两只轮子一侧两只脚、推手 ----------

const CART_W = 76
const CART_D = 42
const CART_H = 84
const CART_YS = [16, 66]
function barCart(p: string[]) {
  const [frame, tray, acc] = p
  const g = new THREE.Group()
  const hw = CART_W / 2 - 6
  const hd = CART_D / 2 - 2
  const r = 0.9
  // 四根立柱（右边两根伸高做推手）
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const top = sx > 0 ? CART_H - 2 : CART_YS[1] + 3
      g.add(rod3([sx * hw, sx < 0 ? 0 : 7, sz * hd], [sx * hw, top, sz * hd], r, frame))
    }
  g.add(rod3([hw, CART_H - 2, -hd], [hw, CART_H - 2, hd], r, frame))
  g.add(rod3([hw, CART_H - 2, 0], [hw + 4, CART_H - 2, 0], r * 0.8, frame))
  g.add(cylX(1.3, 2, frame, hw + 4, CART_H - 2, 0, 10).rotateY(Math.PI / 2))
  // 轮子（右边）、脚（左边）
  for (const sz of [-1, 1]) {
    g.add(P(new THREE.Group().add(cylX(3.6, 1.6, TIRE, 0, 3.6, 0, 18)), hw, 0, sz * hd))
    g.add(rbox(2.6, 1.6, 2.6, frame, { x: -hw, z: sz * hd }, 0.6))
  }
  // 两层托盘：底板 + 围边
  for (const y of CART_YS) {
    g.add(rbox(CART_W - 10, 1.2, CART_D - 2, tray, { y }, 0.5))
    for (const s of [-1, 1]) {
      g.add(rbox(CART_W - 10, 4, 0.8, frame, { y, z: s * (CART_D / 2 - 1.4) }, 0.3))
      g.add(rbox(0.8, 4, CART_D - 2, frame, { x: s * (CART_W / 2 - 5.4), y }, 0.3))
    }
  }
  // 下层摆好的两瓶酒 + 上层托盘一角的冰桶 —— 不画，留给摆件；只在推手上挂一条小毛巾作点缀
  g.add(rbox(0.6, 14, 9, acc, { x: hw + 4.5, y: CART_H - 16, z: 0 }, 0.3))
  return g
}

// ---------- 收纳凳 / 收纳长凳：软包盒身 + 拉扣的掀盖 ----------

function ottoman(w: number) {
  return (p: string[]) => {
    const [fabric, lid, foot] = p
    const g = new THREE.Group()
    const d = 42
    const h = 42
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.2, 3, foot, { x: sx * (w / 2 - 4), z: sz * (d / 2 - 4) }, 10))
    g.add(rbox(w - 1, h - 12, d - 1, fabric, { y: 3 }, 2.4))
    // 盒身上的车线
    g.add(rbox(w - 0.6, 0.6, d - 0.6, shade(fabric, -0.1), { y: h - 12 }, 0.3))
    // 掀盖：厚软垫 + 拉扣
    g.add(rbox(w, 9, d, lid, { y: h - 9.5 }, 3.4))
    const n = Math.max(1, Math.round(w / 22))
    for (let i = 0; i < n; i++)
      for (const sz of n > 1 ? [-1, 1] : [0]) g.add(ball(0.9, shade(lid, -0.2), { x: (i - (n - 1) / 2) * (w / n), y: h - 0.4, z: sz * 9 }, [1, 0.5, 1]))
    return g
  }
}

// ---------- 活动文件柜：塞在书桌下的三斗柜（文具抽屉 ×2 + 挂文件的深抽屉），带锁、四个脚轮 ----------

const PED_W = 40
const PED_D = 50
const PED_H = 62
function pedestal(p: string[]) {
  const [body, front, handle] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(g, sx * (PED_W / 2 - 4), sz * (PED_D / 2 - 5), 5, shade(body, -0.2))
  g.add(rbox(PED_W, PED_H - 5, PED_D, body, { y: 5 }, 0.8))
  const fz = PED_D / 2 + 0.4
  const hs = [12, 12, PED_H - 5 - 2 - 24 - 3]
  let y = 6
  for (const h of hs) {
    g.add(rbox(PED_W - 2, h - 1, 1.2, front, { y, z: fz }, 0.4))
    // 凹槽拉手：顶边一条
    g.add(rbox(PED_W * 0.5, 1, 1.2, handle, { y: y + h - 3.4, z: fz + 0.6 }, 0.3))
    y += h
  }
  g.add(cyl(0.9, 0.9, 0.8, STEEL, { x: PED_W / 2 - 4.5, y: PED_H - 7.5, z: fz + 0.6, rx: Math.PI / 2 }, 12))
  return g
}

// ---------- 转角书架：贴墙角的扇形层板（直角边贴两面墙），细立柱 ----------

const CORNER_R = 60
const CORNER_H = 150
const CORNER_YS = [2, 38, 74, 110, 146]
/** 墙角在 (-R/2, -R/2)，扇形向 +x、+z 张开 */
function cornerPoly(r: number, inset = 0): Poly {
  const o = -CORNER_R / 2 + inset
  const pts: Poly = [[o, o]]
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2)
    pts.push([o + Math.cos(a) * (r - inset), o + Math.sin(a) * (r - inset)])
  }
  return pts
}
function cornerShelf(p: string[]) {
  const [board, post, acc] = p
  const g = new THREE.Group()
  const o = -CORNER_R / 2
  for (const y of CORNER_YS) g.add(slab(cornerPoly(CORNER_R), 2, board, y))
  // 三根立柱：墙角一根、两条直角边的端头各一根
  for (const [x, z] of [[o + 2, o + 2], [o + CORNER_R - 3, o + 2], [o + 2, o + CORNER_R - 3]] as const) g.add(rbox(2.6, CORNER_H, 2.6, post, { x, z }, 0.6))
  // 弧形前沿的挡条（最下面一层）
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * (Math.PI / 2)
    g.add(P(rbox(CORNER_R * 0.27, 3, 1, acc, {}, 0.3), o + Math.cos(a) * (CORNER_R - 1), CORNER_YS[0] + 2, o + Math.sin(a) * (CORNER_R - 1), 0, -a + Math.PI / 2))
  }
  return g
}

// ---------- 吊床：弯木 / 铁支架 + 两头收拢的网布床身 + 一只靠枕 ----------

const HAM_W = 280
const HAM_D = 100
const HAM_H = 118
function hammock(p: string[]) {
  const [frame, cloth, pillow] = p
  const g = new THREE.Group()
  // 支架：两条落地的横梁 + 两头往上弯的立臂
  for (const s of [-1, 1]) g.add(rbox(10, 6, HAM_D - 10, frame, { x: s * (HAM_W / 2 - 40) }, 1.2))
  g.add(rbox(HAM_W - 70, 6, 8, frame, { y: 0.5 }, 1.2))
  for (const s of [-1, 1]) {
    g.add(rod3([s * (HAM_W / 2 - 45), 4, 0], [s * (HAM_W / 2 - 14), 70, 0], 3.2, frame))
    g.add(rod3([s * (HAM_W / 2 - 14), 70, 0], [s * (HAM_W / 2 - 5), HAM_H - 4, 0], 3, frame))
    g.add(torus3(s * (HAM_W / 2 - 5), HAM_H - 4, STEEL))
  }
  // 床身：沿 x 下垂的一串布条（中间最低），两头收拢到挂环
  const n = 14
  const span = HAM_W - 70
  const sag = (t: number) => 42 + 26 * (2 * t - 1) ** 2
  for (let i = 0; i < n; i++) {
    const t0 = i / n
    const t1 = (i + 1) / n
    const x0 = -span / 2 + span * t0
    const x1 = -span / 2 + span * t1
    const wid = (t: number) => 18 + 60 * Math.sin(Math.PI * t) ** 0.7
    const L = Math.hypot(x1 - x0, sag(t1) - sag(t0))
    const piece = new THREE.Group()
    piece.add(rbox(L + 0.6, 1.4, wid((t0 + t1) / 2), i % 2 ? cloth : shade(cloth, -0.05), { y: -0.7 }, 0.5))
    g.add(P(piece, (x0 + x1) / 2, (sag(t0) + sag(t1)) / 2, 0, 0, 0, Math.atan2(sag(t1) - sag(t0), x1 - x0)))
  }
  // 两头的吊绳
  for (const s of [-1, 1])
    for (const k of [-1, 0, 1]) g.add(rod3([s * (span / 2), sag(s > 0 ? 1 : 0), k * 8], [s * (HAM_W / 2 - 6), HAM_H - 7, 0], 0.4, '#e9dfc9'))
  g.add(puck(13, 9, pillow).translateX(-span * 0.32).translateY(sag(0.18) + 1))
  return g
}
/** 支架顶上的挂环 */
function torus3(x: number, y: number, color: string) {
  const m = cyl(2.6, 2.6, 1.2, color, { x, y, rx: Math.PI / 2 }, 16)
  return m
}

// ---------- 定义 ----------

const ISLAND_PALS: Pal[] = [
  ['modern', [M.white, '#e9e7e2', M.char]],
  ['modern', [M.char, '#d8d6d0', M.silver]],
  ['nordic', [N.sage, N.oakL, BRASS]],
  ['nordic', [N.white, N.oak, M.black]],
  ['farmhouse', [F.navy, F.oak, BRASS]],
  ['industrial', [I.iron, I.walnut, I.steel]],
  ['japanese', [J.hinoki, J.washi, J.sumi]],
]
const CART_PALS: Pal[] = [
  ['modern', [BRASS, '#e9e7e2', M.white]],
  ['modern', [M.black, M.walnut, M.light]],
  ['industrial', [I.iron, I.walnut, I.rust]],
  ['retro', [R.mustard, R.cream, R.teal]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['classic', [BRASS, '#d8d3c8', '#7a2e3a']],
]
const OTTO_PALS: Pal[] = [
  ['nordic', [N.linen, N.gray, N.oak]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['modern', [M.gray, M.char, M.black]],
  ['cute', [C.sakura, C.white, C.woodL]],
  ['cute', [C.mint, C.cream, C.woodL]],
  ['retro', [R.mustard, R.caramel, R.caramel]],
  ['industrial', [I.leather, '#7a4a2e', I.iron]],
  ['classic', ['#3b4a66', '#4a5a78', BRASS]],
]
const PED_PALS: Pal[] = [
  ['modern', [M.white, M.white, M.gray]],
  ['modern', [M.char, M.black, M.silver]],
  ['nordic', [N.white, N.oak, N.oak]],
  ['industrial', [I.steel, I.iron, I.rust]],
  ['cute', [C.white, C.sky, C.white]],
]
const CORNER_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.oak]],
  ['nordic', [N.white, N.oak, N.white]],
  ['modern', [M.walnut, M.black, M.walnut]],
  ['industrial', [I.walnut, I.iron, I.iron]],
  ['japanese', [J.hinoki, J.wood, J.hinoki]],
  ['chinese', [CN.rosewood, CN.ink, CN.rosewood]],
]
const HAM_PALS: Pal[] = [
  ['nordic', [N.oak, N.linen, N.sage]],
  ['nordic', [N.oak, N.white, N.mustard]],
  ['retro', [R.caramel, R.orange, R.teal]],
  ['cute', [C.woodL, C.sky, C.pink]],
  ['industrial', [I.iron, '#c7b9a0', I.rust]],
]


export const FURNITURE_EXTRA: AssetDef[] = [
  define('fx-kitchen-island', '厨房岛台', 'dining', [ISLAND_W + 7, ISLAND_D + 5, ISLAND_H], ISLAND_PALS, kitchenIsland, {
    type: 'table',
    tags: ['table', 'storage-cabinet'],
    mats: ['paint', 'stone', 'metal'],
    sizeLabel: '120×75',
    surface: ISLAND_H,
    surfaceShape: [rectPoly(-ISLAND_W / 2, -ISLAND_D / 2, ISLAND_W / 2, ISLAND_D / 2)],
  }),
  define('fx-bar-cart', '吧台推车', 'dining', [CART_W, CART_D + 4, CART_H], CART_PALS, barCart, {
    type: 'kitchenware',
    tags: ['kitchenware'],
    mats: ['metal', null, 'fabric'],
    surface: CART_YS[1] + 1.2,
    surfaces: [{ y: CART_YS[0] + 1.2, shape: [rectPoly(-(CART_W / 2 - 6), -(CART_D / 2 - 2.4), CART_W / 2 - 6, CART_D / 2 - 2.4)], h: CART_YS[1] - CART_YS[0] - 2 }],
    surfaceShape: [rectPoly(-(CART_W / 2 - 6), -(CART_D / 2 - 2.4), CART_W / 2 - 6, CART_D / 2 - 2.4)],
  }),
  define('fx-ottoman-45', '收纳凳', 'living', [45, 42, 42], OTTO_PALS, ottoman(45), { type: 'stool', tags: ['stool', 'seat'], series: 'fx-ottoman', sizeLabel: '方凳 45', mats: ['fabric', 'fabric', 'wood'], surface: 42 }),
  define('fx-ottoman-90', '收纳凳', 'living', [90, 42, 42], OTTO_PALS, ottoman(90), { type: 'stool', tags: ['stool', 'seat'], series: 'fx-ottoman', sizeLabel: '长凳 90', mats: ['fabric', 'fabric', 'wood'], surface: 42 }),
  define('fx-pedestal', '活动文件柜', 'study', [PED_W, PED_D + 4, PED_H], PED_PALS, pedestal, { type: 'cabinet', tags: ['cabinet', 'storage-cabinet'], mats: ['metal', 'paint', 'metal'], sizeLabel: '三斗', surface: PED_H }),
  define('fx-corner-shelf', '转角书架', 'storage', [CORNER_R, CORNER_R, CORNER_H], CORNER_PALS, cornerShelf, {
    type: 'bookshelf',
    tags: ['bookshelf'],
    mats: ['wood', 'metal', 'wood'],
    surface: CORNER_YS[4] + 2,
    surfaceShape: [cornerPoly(CORNER_R, 1)],
    surfaces: CORNER_YS.slice(0, 4).map((y, i) => ({ y: y + 2, shape: [cornerPoly(CORNER_R, 1)], h: CORNER_YS[i + 1] - y - 2 })),
  }),
  define('fx-hammock', '吊床（带支架）', 'living', [HAM_W, HAM_D, HAM_H], HAM_PALS, hammock, { type: 'seat', tags: ['seat'], mats: ['wood', 'fabric', 'fabric'] }),
]
