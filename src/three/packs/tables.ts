// 桌子素材包：各种规格 / 形状的书桌、餐桌、茶几边几，以及配套椅凳。
// 桌子本体保持空的，声明 surface（顶面高度）；不规则桌面用同一个多边形挤出并作为 surfaceShape。

import { ball, cyl, puck, rbox, shade, torus } from '../toon'
import { C, G, ellipsePoly, legs, lPoly, rectPoly, slab, type AssetDef, type Poly } from '../kit'
import { I, J, M, N, R, pal } from '../packkit'
import { fitPoly } from '../geo'

// ---------- 配色 ----------

/** 书桌：[桌面, 框架, 点缀] */
const DESK_PAL = pal(
  ['cute', [C.white, C.woodL, C.sky]],
  ['cute', [C.sakura, C.white, C.lilac]],
  ['nordic', [N.oak, N.white, N.sage]],
  ['modern', [M.white, M.char, M.silver]],
  ['japanese', [J.hinoki, J.wood, J.shu]],
  ['retro', [R.caramel, R.cream, R.orange]],
)
/** 木桌：[桌面, 腿, 隔板 / 点缀] */
const WOOD_PAL = pal(
  ['cute', [C.wood, C.woodD, C.pink]],
  ['cute', [C.white, C.woodL, C.sky]],
  ['nordic', [N.oakL, N.oak, N.sage]],
  ['japanese', [J.hinoki, J.dark, J.shu]],
  ['modern', [M.walnut, M.black, M.gray]],
  ['retro', [R.caramel, R.cream, R.teal]],
)
/** 造型可爱的小几 */
const POP_PAL = pal(
  ['cute', [C.sakura, C.white, C.pink]],
  ['cute', [C.mint, C.white, C.leaf]],
  ['cute', [C.lemon, C.white, C.orange]],
  ['nordic', [N.white, N.oak, N.blue]],
  ['retro', [R.teal, R.cream, R.mustard]],
  ['modern', [M.light, M.char, M.walnut]],
)
/** 椅凳：[框架, 坐垫, 点缀 / 金属脚] */
const SEAT_PAL = pal(
  ['cute', [C.wood, C.pink, C.woodD]],
  ['cute', [C.white, C.mint, C.woodL]],
  ['nordic', [N.oak, N.blue, N.oak]],
  ['japanese', [J.wood, J.tatami, J.dark]],
  ['retro', [R.caramel, R.mustard, R.caramel]],
  ['industrial', [I.walnut, I.leather, I.iron]],
)
/** 工业风：[木板, 铁管, 点缀] */
const IRON_PAL = pal(
  ['industrial', [I.walnut, I.iron, I.rust]],
  ['industrial', [N.oak, I.iron, I.steel]],
  ['industrial', [I.concrete, I.iron, I.walnut]],
  ['industrial', [I.leather, I.steel, I.iron]],
)
/** 现代极简：[主体, 隔板, 点缀] */
const MODERN_PAL = pal(
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.black, M.char, M.silver]],
  ['modern', [M.walnut, M.char, M.light]],
  ['modern', [M.light, M.white, M.gray]],
)

// ---------- 形状 ----------

/** 半圆，直边贴在 z = zb（背面） */
const halfPoly = (r: number, zb: number, n = 20): Poly =>
  Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const a = (i / n) * Math.PI
    return [Math.cos(a) * r, zb + Math.sin(a) * r]
  })

/** 腰形 / 豆形：椭圆背面中间凹进去 */
const kidneyPoly = (w: number, d: number) =>
  fitPoly(
    Array.from({ length: 48 }, (_, i): [number, number] => {
      const a = (i / 48) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const k = s < 0 ? 1 - 0.6 * Math.exp(-((c / 0.4) ** 2)) : 1
      return [c, s * k]
    }),
    w,
    d,
  )

/** 云朵：六个圆鼓鼓的瓣 */
const cloudPoly = (w: number, d: number) =>
  fitPoly(
    Array.from({ length: 72 }, (_, i): [number, number] => {
      const a = (i / 72) * Math.PI * 2
      const r = 0.88 + 0.12 * Math.abs(Math.cos(3 * a))
      return [Math.cos(a) * r, Math.sin(a) * r * 0.7]
    }),
    w,
    d,
  )

/** 扇形转角桌：圆心在左后角 */
const fanPoly = (r: number, n = 16): Poly => [
  [-r / 2, -r / 2],
  ...Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const a = (i / n) * (Math.PI / 2)
    return [-r / 2 + Math.cos(a) * r, -r / 2 + Math.sin(a) * r]
  }),
]

// ---------- 部件 ----------

const DT = 3.5 // 书桌桌面厚
const DS = 72 // 书桌高

/** 雪橇形金属框：左右两侧各一个"口"字框 + 后横撑 */
function sledFrame(w: number, d: number, h: number, color: string) {
  const g = G()
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 8)
    g.add(rbox(5, 3, d - 8, color, { x }, 1.2))
    g.add(rbox(5, 3, d - 10, color, { x, y: h - 3 }, 1.2))
    for (const sz of [-1, 1]) g.add(rbox(4, h - 5, 4, color, { x, y: 2.5, z: sz * (d / 2 - 9) }, 1))
  }
  g.add(rbox(w - 16, 3, 3, color, { y: 18, z: -(d / 2 - 9) }, 1))
  return g
}

/** 抽屉面板 + 圆钮，贴在 z = front 的面上 */
function drawerFront(w: number, h: number, color: string, knob: string, at: { x?: number; y: number; z: number }) {
  return G(rbox(w, h, 1.2, color, { x: at.x, y: at.y, z: at.z + 0.4 }, 0.6), ball(1.4, knob, { x: at.x, y: at.y + h / 2, z: at.z + 1.6 }))
}

// ---------- 书桌 ----------

function workDesk(w: number, d: number, style: 'legs' | 'pedestal' | 'panel' | 'sled', p: string[]) {
  const [top, frame, acc] = p
  const H = DS - DT
  const g = G(rbox(w, DT, d, top, { y: H }, 1.2))
  if (style === 'legs') {
    g.add(legs(w, d, H, frame, 2, 5, false))
    const dw = Math.min(50, w * 0.5)
    const dd = d - 14
    g.add(rbox(dw, 9, dd, frame, { y: H - 9, z: -2 }, 1))
    g.add(drawerFront(dw - 3, 7, acc, shade(acc, -0.2), { y: H - 8, z: -2 + dd / 2 }))
  } else if (style === 'pedestal') {
    const cw = 40
    const cx = w / 2 - cw / 2 - 2
    g.add(rbox(cw, H, d - 6, frame, { x: cx, z: -1 }, 2))
    for (const y of [3, 24, 45]) g.add(drawerFront(cw - 5, 19, shade(frame, 0.05), acc, { x: cx, y, z: -1 + (d - 6) / 2 }))
    for (const sz of [-1, 1]) g.add(rbox(4, H, 4, frame, { x: -w / 2 + 5, z: sz * (d / 2 - 5) }, 1))
    g.add(rbox(3, 3, d - 10, frame, { x: -w / 2 + 5, y: 14 }, 1))
  } else if (style === 'panel') {
    for (const s of [-1, 1]) g.add(rbox(3.5, H, d - 4, frame, { x: s * (w / 2 - 4) }, 1.2))
    g.add(rbox(w - 10, 26, 2, shade(frame, -0.04), { y: H - 30, z: -d / 2 + 8 }, 0.8))
  } else {
    g.add(sledFrame(w, d, H, frame))
  }
  return g
}

/** L 形转角桌：长臂贴背面，短臂在左（或右）侧往前伸 */
function lDesk(w: number, d: number, arm: number, corner: 'left' | 'right', p: string[]) {
  const [top, frame] = p
  const H = DS - DT
  const m = corner === 'left' ? 1 : -1
  const x0 = -w / 2
  const z0 = -d / 2
  const z1 = d / 2
  const g = G(slab(lPoly(w, d, arm, arm, corner), DT, top, H))
  // 长臂末端侧板、短臂末端侧板、拐角立柱
  g.add(rbox(3.5, H, arm - 4, frame, { x: m * (w / 2 - 4), z: z0 + arm / 2 }, 1.2))
  g.add(rbox(arm - 4, H, 3.5, frame, { x: m * (x0 + arm / 2), z: z1 - 4 }, 1.2))
  g.add(cyl(2.4, 2, H, frame, { x: m * (x0 + 6), z: z0 + 6 }, 12))
  // 挡板
  const mod = shade(frame, -0.04)
  g.add(rbox(w - 11, 24, 2, mod, { x: m * 0.5, y: H - 28, z: z0 + 6 }, 0.8))
  g.add(rbox(2, 24, d - 11, mod, { x: m * (x0 + 6), y: H - 28, z: 0.5 }, 0.8))
  return g
}

function uPoly(w: number, d: number, back: number, side: number): Poly {
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2]
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x1 - side, z1],
    [x1 - side, z0 + back],
    [x0 + side, z0 + back],
    [x0 + side, z1],
    [x0, z1],
  ]
}

function uDesk(p: string[]) {
  const [top, frame] = p
  const [w, d, back, side] = [180, 140, 55, 50]
  const H = DS - DT
  const g = G(slab(uPoly(w, d, back, side), DT, top, H))
  const mod = shade(frame, -0.04)
  for (const s of [-1, 1]) {
    g.add(rbox(side - 4, H, 3.5, frame, { x: s * (w / 2 - side / 2), z: d / 2 - 4 }, 1.2))
    g.add(cyl(2.4, 2, H, frame, { x: s * (w / 2 - 6), z: -d / 2 + 6 }, 12))
    g.add(rbox(2, 24, d - 11, mod, { x: s * (w / 2 - 6), y: H - 28, z: 0.5 }, 0.8))
  }
  g.add(cyl(2.4, 2, H, frame, { z: -d / 2 + 6 }, 12))
  g.add(rbox(w - 12, 24, 2, mod, { y: H - 28, z: -d / 2 + 6 }, 0.8))
  return g
}

/** 升降桌：T 形脚 + 两节伸缩立柱 + 控制面板 */
const LIFT_S = 74
function liftDesk(p: string[]) {
  const [top, frame, acc] = p
  const [w, d] = [140, 70]
  const H = LIFT_S - DT
  const g = G(rbox(w, DT, d, top, { y: H }, 1.2))
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 20)
    g.add(rbox(7, 4, d - 6, frame, { x }, 2))
    g.add(rbox(8, 36, 6, frame, { x, y: 4 }, 1.5))
    g.add(rbox(6.5, H - 38, 4.6, shade(frame, 0.06), { x, y: 38 }, 1.2))
  }
  g.add(rbox(w - 34, 4, 5, frame, { y: H - 4 }, 1))
  const cx = w / 2 - 26
  const cz = d / 2 - 5
  g.add(rbox(12, 3.3, 6, acc, { x: cx, y: H - 3, z: cz }, 1))
  for (const s of [-1, 1]) g.add(ball(0.9, C.white, { x: cx + s * 2.5, y: H - 1.4, z: cz + 3.1 }))
  return g
}

/** 电脑桌：侧板 + 键盘托 + 主机格 */
function pcDesk(p: string[]) {
  const [top, frame, acc] = p
  const [w, d] = [120, 60]
  const H = DS - DT
  const g = workDesk(w, d, 'panel', p)
  g.add(rbox(2.5, H, d - 8, frame, { x: 27, z: -1 }, 1))
  g.add(rbox(27, 2, d - 10, frame, { x: 41.25, y: 10, z: -1 }, 0.8))
  // 键盘托：两条滑轨吊在桌面下
  g.add(rbox(70, 2, 42, top, { x: -14, y: H - 10, z: 4 }, 1))
  for (const s of [-1, 1]) g.add(rbox(2.5, 10, 44, frame, { x: -14 + s * 36.25, y: H - 10, z: 3 }, 0.8))
  g.add(rbox(16, 1.6, 1.2, acc, { x: -14, y: H - 9.8, z: 25.4 }, 0.5))
  return g
}

/** 扇形转角桌 */
function fanDesk(p: string[]) {
  const [top, frame] = p
  const r = 70
  const H = DS - DT
  const g = G(slab(fanPoly(r), DT, top, H))
  const k = -r / 2 + 58 * Math.SQRT1_2
  for (const [x, z] of [
    [-31, -31],
    [31, -32],
    [-32, 31],
    [k, k],
  ])
    g.add(cyl(2.2, 1.8, H, frame, { x, z }, 12))
  g.add(rbox(60, 3, 2, frame, { y: 16, z: -31 }, 0.8))
  g.add(rbox(2, 3, 60, frame, { x: -31, y: 16 }, 0.8))
  return g
}

// ---------- 餐桌 ----------

interface ApronOpts {
  t?: number
  inset?: number
  r?: number
  round?: boolean
  apron?: boolean
  shelf?: number
}

/** 矩形桌：四腿 + 可选围板 / 下层隔板 */
function apronTable(w: number, d: number, S: number, p: string[], o: ApronOpts = {}) {
  const [top, frame, sub] = p
  const t = o.t ?? 4
  const H = S - t
  const ins = o.inset ?? 6
  const g = G(rbox(w, t, d, top, { y: H }, 1.5))
  g.add(legs(w, d, H, frame, o.r ?? 2.4, ins, o.round ?? true))
  if (o.apron) {
    for (const s of [-1, 1]) {
      g.add(rbox(w - ins * 2, 7, 2, frame, { y: H - 7, z: s * (d / 2 - ins) }, 0.8))
      g.add(rbox(2, 7, d - ins * 2, frame, { x: s * (w / 2 - ins), y: H - 7 }, 0.8))
    }
  }
  if (o.shelf !== undefined) g.add(rbox(w - ins * 2 + 3, 2.5, d - ins * 2 + 3, shade(sub ?? top, 0.02), { y: o.shelf }, 1))
  return g
}

/** 6 人长桌：两端板式支架 + 中间横撑 */
function trestleTable(p: string[]) {
  const [top, frame] = p
  const [w, d, H] = [180, 90, 68]
  const g = G(rbox(w, 4, d, top, { y: H }, 1.5))
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 22)
    g.add(rbox(9, 5, 72, frame, { x }, 2))
    g.add(rbox(7, H - 9, 28, frame, { x, y: 4.5 }, 2))
    g.add(rbox(9, 5, 72, frame, { x, y: H - 5 }, 2))
  }
  g.add(rbox(w - 44, 6, 4, frame, { y: 22 }, 1.5))
  return g
}

function roundPedestal(p: string[]) {
  const [top, frame] = p
  return G(puck(45, 4, top, { y: 68 }), cyl(16, 16, 3, frame, { y: 65 }), cyl(5, 6, 60, frame, { y: 5 }, 16), puck(25, 5, frame))
}

function roundFourLeg(p: string[]) {
  const [top, frame] = p
  const g = G(puck(55, 4, top, { y: 68 }))
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    g.add(cyl(2.6, 2, 68, frame, { x: Math.cos(a) * 38, z: Math.sin(a) * 38 }, 12))
  }
  g.add(torus(38, 1.6, frame, { y: 66.4, rx: Math.PI / 2 }))
  g.add(torus(38, 1.2, frame, { y: 18, rx: Math.PI / 2 }))
  return g
}

const OVAL = ellipsePoly(80, 47.5, 0, 0, 40)
function ovalTable(p: string[]) {
  const [top, frame] = p
  const g = G(slab(OVAL, 4, top, 68))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(cyl(2.6, 2, 68, frame, { x: sx * 52, z: sz * 22 }, 12))
    g.add(rbox(3, 3, 44, frame, { x: sx * 52, y: 16 }, 1))
  }
  g.add(rbox(104, 3, 3, frame, { y: 16 }, 1))
  return g
}

/** 伸缩餐桌：两块端板 + 中间加长板（颜色稍浅），下面有滑轨 */
function extTable(p: string[]) {
  const [top, frame] = p
  const g = G()
  for (const s of [-1, 1]) g.add(rbox(50, 4, 80, top, { x: s * 35, y: 68 }, 1.5))
  g.add(rbox(20, 4, 80, shade(top, 0.06), { y: 68 }, 1.5))
  g.add(legs(120, 80, 68, frame, 2.4, 6, false))
  for (const s of [-1, 1]) g.add(rbox(96, 4, 2, shade(frame, -0.05), { y: 64, z: s * 30 }, 0.8))
  return g
}

function barTable(p: string[]) {
  const [top, frame, acc] = p
  const [w, d, S] = [120, 45, 105]
  const g = G(rbox(w, 4, d, top, { y: S - 4 }, 1.5), sledFrame(w, d, S - 4, frame))
  g.add(rbox(w - 16, 3, 3, acc, { y: 28, z: d / 2 - 9 }, 1))
  return g
}

// ---------- 茶几 / 边几 ----------

function consoleTable(p: string[]) {
  const [top, frame, acc] = p
  const [w, d, S] = [100, 30, 80]
  const H = S - 3
  const g = G(rbox(w, 3, d, top, { y: H }, 1))
  g.add(legs(w, d, H, frame, 2, 5))
  g.add(rbox(84, 9, 22, frame, { y: H - 9 }, 1))
  for (const s of [-1, 1]) g.add(drawerFront(38, 7, acc, shade(acc, -0.2), { x: s * 20.5, y: H - 8, z: 11 }))
  g.add(rbox(w - 7, 2, 23, shade(top, 0.03), { y: 18 }, 0.8))
  return g
}

const HALF = halfPoly(45, -22.5)
function halfMoonTable(p: string[]) {
  const [top, frame, sub] = p
  const H = 73
  const g = G(slab(HALF, 3, top, H), slab(halfPoly(38, -22.5), 2, sub, 20))
  for (const [x, z] of [
    [-36, -18.5],
    [36, -18.5],
    [0, 12],
  ])
    g.add(cyl(2.2, 1.7, H, frame, { x, z }, 12))
  return g
}

function sideRound(p: string[]) {
  const [top, frame, sub] = p
  return G(puck(22.5, 3, top, { y: 47 }), cyl(2.6, 2.6, 44, frame, { y: 3 }, 12), puck(14, 3, frame), puck(15, 2, sub, { y: 18 }))
}

const KIDNEY = kidneyPoly(110, 60)
function kidneyTable(p: string[]) {
  const [top, frame] = p
  const g = G(slab(KIDNEY, 4, top, 34))
  for (const [x, z] of [
    [-40, -2],
    [40, -2],
    [-18, 18],
    [18, 18],
  ])
    g.add(cyl(2.6, 2, 34, frame, { x, z }, 12))
  return g
}

const HEX = ellipsePoly(40, 40, 0, 0, 6)
function hexTable(p: string[]) {
  const [top, frame] = p
  return G(slab(HEX, 4, top, 36), slab(ellipsePoly(24, 24, 0, 0, 6), 36, frame, 0))
}

const CLOUD = cloudPoly(100, 70)
function cloudTable(p: string[]) {
  const [top, frame] = p
  const g = G(slab(CLOUD, 5, top, 31))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(3.6, 3, 31, frame, { x: sx * 30, z: sz * 14 }, 16))
  return g
}

/** 嵌套双几：大几两侧板腿，小几从前面抽出一半 */
const NEST_TOP = rectPoly(-30, -25, 30, 15)
function nestTables(p: string[]) {
  const [top, frame, sub] = p
  const g = G(rbox(60, 3, 40, top, { y: 42, z: -5 }, 1.2))
  for (const s of [-1, 1]) g.add(rbox(3, 42, 38, frame, { x: s * 28.5, z: -5 }, 1.2))
  g.add(rbox(48, 2.5, 34, sub, { y: 35.5, z: 8 }, 1))
  for (const s of [-1, 1]) g.add(rbox(3, 35.5, 32, frame, { x: s * 22.5, z: 8 }, 1.2))
  return g
}

// ---------- 椅凳 ----------

function bench(p: string[]) {
  const [main, sub] = p
  const g = G(rbox(120, 5, 36, main, { y: 40 }, 2), rbox(110, 3.5, 30, sub, { y: 44.5 }, 1.6))
  for (const s of [-1, 1]) g.add(rbox(4, 40, 30, shade(main, -0.08), { x: s * 50 }, 1.2))
  g.add(rbox(100, 4, 3, shade(main, -0.08), { y: 12 }, 1))
  return g
}

function barStool(p: string[]) {
  const [main, sub, frame] = p
  const g = G(puck(20, 5, main, { y: 70 }), puck(18, 3, sub, { y: 73.5 }))
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    g.add(cyl(1.8, 1.6, 70, frame, { x: Math.cos(a) * 14, z: Math.sin(a) * 14 }, 10))
  }
  g.add(torus(14, 1.1, frame, { y: 26, rx: Math.PI / 2 }))
  return g
}

function roundStool(p: string[]) {
  const [main, sub, frame] = p
  const g = G(puck(17, 5, main, { y: 40 }), puck(15.5, 2.5, sub, { y: 43.5 }))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    g.add(cyl(1.8, 1.5, 40, frame, { x: Math.cos(a) * 11, z: Math.sin(a) * 11 }, 10))
  }
  g.add(torus(11, 1, frame, { y: 14, rx: Math.PI / 2 }))
  return g
}

function armDiningChair(p: string[]) {
  const [main, sub] = p
  // 整体比以前低 4cm：坐垫顶 45.5、扶手顶 63，能塞进 72cm 餐桌下（以前坐垫顶 49.5，比常见餐椅高）
  const g = G(legs(52, 50, 38, shade(main, -0.12), 1.9, 4))
  g.add(rbox(54, 4, 52, main, { y: 38 }, 1.5))
  g.add(rbox(46, 4, 42, sub, { y: 41.5, z: 3 }, 2))
  for (const s of [-1, 1]) {
    g.add(rbox(3, 38, 3, main, { x: s * 23, y: 41, z: -24 }, 1))
    g.add(rbox(3, 20, 3, main, { x: s * 25.5, y: 41, z: 18 }, 1))
    g.add(rbox(5, 3, 44, main, { x: s * 25.5, y: 60, z: -2 }, 1.2))
  }
  g.add(rbox(48, 16, 3, main, { y: 60, z: -24 }, 1.5))
  g.add(rbox(40, 12, 3, sub, { y: 62, z: -21.8, rx: -0.05 }, 1.4))
  return g
}

// ---------- 工业风 / 现代极简造型变体 ----------

/** 水平铁管：axis 'x' 或 'z'，(x, y, z) 是管中心 */
function hpipe(len: number, r: number, color: string, axis: 'x' | 'z', x: number, y: number, z: number) {
  return cyl(r, r, len, color, axis === 'x' ? { x, y: y - len / 2, z, rz: Math.PI / 2 } : { x, y: y - len / 2, z, rx: Math.PI / 2 }, 12)
}

/** 黑铁水管腿：四根立管 + 法兰 + 两侧和后方的低横管 */
function ironFrame(w: number, d: number, h: number, iron: string) {
  const g = G()
  const ix = w / 2 - 8
  const iz = d / 2 - 8
  const ry = 14
  for (const sx of [-1, 1]) {
    const x = sx * ix
    for (const sz of [-1, 1]) {
      const z = sz * iz
      g.add(puck(4.5, 1.2, iron, { x, z }), cyl(1.9, 1.9, h - 2.4, iron, { x, y: 1.2, z }, 12), puck(4.5, 1.2, iron, { x, y: h - 1.2, z }))
      g.add(ball(2.7, iron, { x, y: ry, z }))
    }
    g.add(hpipe(iz * 2, 1.6, iron, 'z', x, ry, 0))
  }
  g.add(hpipe(ix * 2, 1.6, iron, 'x', 0, ry, -iz))
  return g
}

function ironTable(w: number, d: number, top: number, p: string[]) {
  const t = 4
  return G(rbox(w, t, d, p[0], { y: top - t }, 1), ironFrame(w, d, top - t, p[1]))
}

/** 瀑布式：一块板折下来当两侧的腿 */
function waterfallDesk(w: number, d: number, p: string[]) {
  const [main, sub] = p
  const t = 3
  const H = DS - t
  const g = G(rbox(w, t, d, main, { y: H }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(t, H, d, main, { x: s * (w / 2 - t / 2) }, 0.8))
  g.add(rbox(w - t * 2 + 1, 24, 2, sub, { y: H - 30, z: -d / 2 + 6 }, 0.6))
  return g
}

function waterfallCoffee(p: string[]) {
  const [main, sub] = p
  const [w, d, top] = [110, 55, 36]
  const t = 4
  const g = G(rbox(w, t, d, main, { y: top - t }, 1))
  for (const s of [-1, 1]) g.add(rbox(t, top - t, d, main, { x: s * (w / 2 - t / 2) }, 1))
  g.add(rbox(w - t * 2 + 1, 2.5, d - 5, sub, { y: 8 }, 0.8))
  return g
}

// ---------- 素材表 ----------

export const TABLES: AssetDef[] = [
  // 书桌（family 'desk'）
  { id: 'tbl-desk-80', name: '书桌', family: 'desk', sizeLabel: '80', category: 'study', w: 80, d: 50, h: DS, surface: DS, ...DESK_PAL, build: (p) => workDesk(80, 50, 'legs', p) },
  { id: 'tbl-desk-120', name: '书桌', family: 'desk', sizeLabel: '120 抽屉柜', category: 'study', w: 120, d: 60, h: DS, surface: DS, ...DESK_PAL, build: (p) => workDesk(120, 60, 'pedestal', p) },
  { id: 'tbl-desk-140', name: '书桌', family: 'desk', sizeLabel: '140', category: 'study', w: 140, d: 70, h: DS, surface: DS, ...DESK_PAL, build: (p) => workDesk(140, 70, 'panel', p) },
  { id: 'tbl-desk-160', name: '书桌', family: 'desk', sizeLabel: '160', category: 'study', w: 160, d: 75, h: DS, surface: DS, ...DESK_PAL, build: (p) => workDesk(160, 75, 'sled', p) },
  {
    id: 'tbl-desk-l-left',
    name: '转角桌',
    family: 'desk-corner',
    sizeLabel: 'L 形（左）140×140',
    category: 'study',
    w: 140,
    d: 140,
    h: DS,
    surface: DS,
    surfaceShape: [lPoly(140, 140, 60, 60, 'left')],
    ...DESK_PAL,
    build: (p) => lDesk(140, 140, 60, 'left', p),
  },
  {
    id: 'tbl-desk-l-right',
    name: '转角桌',
    family: 'desk-corner',
    sizeLabel: 'L 形（右）160×120',
    category: 'study',
    w: 160,
    d: 120,
    h: DS,
    surface: DS,
    surfaceShape: [lPoly(160, 120, 60, 60, 'right')],
    ...DESK_PAL,
    build: (p) => lDesk(160, 120, 60, 'right', p),
  },
  { id: 'tbl-desk-u', name: '转角桌', family: 'desk-corner', sizeLabel: 'U 形 180×140', category: 'study', w: 180, d: 140, h: DS, surface: DS, surfaceShape: [uPoly(180, 140, 55, 50)], ...DESK_PAL, build: uDesk },
  { id: 'tbl-desk-fan', name: '转角桌', family: 'desk-corner', sizeLabel: '扇形 70', category: 'study', w: 70, d: 70, h: DS, surface: DS, surfaceShape: [fanPoly(70)], ...DESK_PAL, build: fanDesk },
  { id: 'tbl-desk-lift', name: '升降桌 140', category: 'study', w: 140, d: 70, h: LIFT_S, surface: LIFT_S, ...DESK_PAL, build: liftDesk },
  { id: 'tbl-desk-pc', name: '电脑桌（键盘托）120', category: 'study', w: 120, d: 60, h: DS, surface: DS, ...DESK_PAL, build: pcDesk },
  { id: 'tbl-desk-iron-120', name: '铁管书桌', family: 'desk-iron', sizeLabel: '120', category: 'study', w: 120, d: 60, h: DS, surface: DS, ...IRON_PAL, build: (p) => ironTable(120, 60, DS, p) },
  { id: 'tbl-desk-iron-150', name: '铁管书桌', family: 'desk-iron', sizeLabel: '150', category: 'study', w: 150, d: 70, h: DS, surface: DS, ...IRON_PAL, build: (p) => ironTable(150, 70, DS, p) },
  { id: 'tbl-desk-waterfall-100', name: '极简书桌', family: 'desk-waterfall', sizeLabel: '100', category: 'study', w: 100, d: 55, h: DS, surface: DS, ...MODERN_PAL, build: (p) => waterfallDesk(100, 55, p) },
  { id: 'tbl-desk-waterfall-140', name: '极简书桌', family: 'desk-waterfall', sizeLabel: '140', category: 'study', w: 140, d: 65, h: DS, surface: DS, ...MODERN_PAL, build: (p) => waterfallDesk(140, 65, p) },

  // 餐桌（family 'dining-table'）
  { id: 'tbl-dining-75', name: '餐桌', family: 'dining-table', sizeLabel: '2 人 75×75', category: 'dining', w: 75, d: 75, h: 72, surface: 72, ...WOOD_PAL, build: (p) => apronTable(75, 75, 72, p, { apron: true, inset: 7 }) },
  { id: 'tbl-dining-135', name: '餐桌', family: 'dining-table', sizeLabel: '4 人 135×80', category: 'dining', w: 135, d: 80, h: 72, surface: 72, ...WOOD_PAL, build: (p) => apronTable(135, 80, 72, p, { apron: true, inset: 7, r: 2.6 }) },
  { id: 'tbl-dining-180', name: '餐桌', family: 'dining-table', sizeLabel: '6 人 180×90', category: 'dining', w: 180, d: 90, h: 72, surface: 72, ...WOOD_PAL, build: trestleTable },
  { id: 'tbl-dining-round-90', name: '圆餐桌', family: 'dining-round', sizeLabel: 'Φ90', category: 'dining', w: 90, d: 90, h: 72, surface: 72, surfaceShape: [ellipsePoly(45)], ...WOOD_PAL, build: roundPedestal },
  { id: 'tbl-dining-round-110', name: '圆餐桌', family: 'dining-round', sizeLabel: 'Φ110', category: 'dining', w: 110, d: 110, h: 72, surface: 72, surfaceShape: [ellipsePoly(55)], ...WOOD_PAL, build: roundFourLeg },
  { id: 'tbl-dining-oval', name: '椭圆餐桌 160×95', category: 'dining', w: 160, d: 95, h: 72, surface: 72, surfaceShape: [OVAL], ...WOOD_PAL, build: ovalTable },
  { id: 'tbl-dining-ext', name: '伸缩餐桌 120（含中板）', category: 'dining', w: 120, d: 80, h: 72, surface: 72, ...WOOD_PAL, build: extTable },
  { id: 'tbl-dining-iron-140', name: '铁管餐桌', family: 'dining-iron', sizeLabel: '4 人 140×80', category: 'dining', w: 140, d: 80, h: 72, surface: 72, ...IRON_PAL, build: (p) => ironTable(140, 80, 72, p) },
  { id: 'tbl-dining-iron-180', name: '铁管餐桌', family: 'dining-iron', sizeLabel: '6 人 180×90', category: 'dining', w: 180, d: 90, h: 72, surface: 72, ...IRON_PAL, build: (p) => ironTable(180, 90, 72, p) },
  { id: 'tbl-bar-table', name: '吧台高桌 120×45', category: 'dining', w: 120, d: 45, h: 105, surface: 105, ...DESK_PAL, build: barTable },

  // 茶几 / 边几
  { id: 'tbl-console', name: '窄边桌 100×30', category: 'living', w: 100, d: 30, h: 80, surface: 80, ...WOOD_PAL, build: consoleTable },
  { id: 'tbl-half-moon', name: '半圆贴墙桌 90', category: 'living', w: 90, d: 45, h: 76, surface: 76, surfaceShape: [HALF], ...WOOD_PAL, build: halfMoonTable },
  { id: 'tbl-side-round', name: '小圆边几 Φ45', category: 'living', w: 45, d: 45, h: 50, surface: 50, surfaceShape: [ellipsePoly(22.5)], ...POP_PAL, build: sideRound },
  { id: 'tbl-coffee-rect', name: '长方茶几 120×60（带隔板）', category: 'living', w: 120, d: 60, h: 40, surface: 40, ...WOOD_PAL, build: (p) => apronTable(120, 60, 40, p, { round: false, r: 2.2, inset: 5, shelf: 10 }) },
  { id: 'tbl-coffee-kidney', name: '腰形茶几 110×60', category: 'living', w: 110, d: 60, h: 38, surface: 38, surfaceShape: [KIDNEY], ...WOOD_PAL, build: kidneyTable },
  { id: 'tbl-coffee-hex', name: '六边形茶几 80', category: 'living', w: 80, d: 70, h: 40, surface: 40, surfaceShape: [HEX], ...POP_PAL, build: hexTable },
  { id: 'tbl-coffee-cloud', name: '云朵茶几 100×70', category: 'living', w: 100, d: 70, h: 36, surface: 36, surfaceShape: [CLOUD], ...POP_PAL, build: cloudTable },
  { id: 'tbl-coffee-waterfall', name: '极简茶几 110×55', category: 'living', w: 110, d: 55, h: 36, surface: 36, ...MODERN_PAL, build: waterfallCoffee },
  { id: 'tbl-nest', name: '嵌套双几', category: 'living', w: 60, d: 50, h: 45, surface: 45, surfaceShape: [NEST_TOP], ...POP_PAL, build: nestTables },

  // 椅凳
  { id: 'tbl-bench', name: '长凳 120', category: 'dining', w: 120, d: 36, h: 48, ...SEAT_PAL, build: bench },
  { id: 'tbl-bar-stool', name: '吧凳', category: 'dining', w: 40, d: 40, h: 77, ...SEAT_PAL, build: barStool },
  { id: 'tbl-stool-round', name: '圆凳', category: 'living', w: 34, d: 34, h: 46, ...SEAT_PAL, build: roundStool },
  { id: 'tbl-arm-chair', name: '扶手餐椅', category: 'dining', w: 56, d: 54, h: 79, ...SEAT_PAL, build: armDiningChair },
]
