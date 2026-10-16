// 客厅 / 卧室 / 收纳 / 儿童 的大件家具。约定见 kit.ts 开头。
// 可以摆东西的柜、台顶面一律留空并声明 surface；柜内层板之间可以有书、收纳盒。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, S, holePanel, legs, lPoly, rectPoly, rng, rod, shell, slab, type AssetDef, type StyleTag } from '../kit'
import { soft, type SoftFn } from './more-variety'

type V3 = [number, number, number]
const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro

// ---------- 小工具 ----------

/** 两端已知的 3D 细杆 */
function rod3(a: V3, b: V3, r: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/**
 * 开口柜体：两块侧板、出沿 0.6 的顶板、底板、背板。
 * 内部：x ∈ ±(w/2 - t)，地板顶面 y0 + 0.4 + t，天花 y0 + h - t，z 从 -d/2 + 1.4 到 d/2。
 */
function carcass(w: number, h: number, d: number, color: string, y0 = 0, t = 2.5) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(t, h - 0.8, d, color, { x: s * (w / 2 - t / 2), y: y0 }, Math.min(1, t * 0.3)))
  g.add(rbox(w + 1.2, t, d + 1.2, color, { y: y0 + h - t }, 1))
  g.add(rbox(w - 2 * t + 0.6, t, d - 1.6, color, { y: y0 + 0.4 }, 0.6))
  g.add(rbox(w - 2 * t + 0.4, h - t - 0.8, 1.2, shade(color, -0.06), { y: y0 + 0.5, z: -d / 2 + 0.8 }, 0.4))
  return g
}

/** 柜内横隔板（宽 = 内宽） */
function shelf(innerW: number, y: number, d: number, color: string, t = 2.5, x = 0) {
  return rbox(innerW + 0.6, t, d - 2.4, color, { x, y, z: 0.5 }, 0.6)
}

/** 柜内竖隔板 */
function divider(x: number, y0: number, y1: number, d: number, color: string, t = 2.2) {
  return rbox(t, y1 - y0 + 0.2, d - 2.8, color, { x, y: y0 - 0.1, z: 0.4 }, 0.6)
}

/** 门板 / 抽屉面：贴在柜体正面（z = d/2）外，背面嵌进去 0.4 */
function front(w: number, h: number, d: number, color: string, x: number, y: number) {
  return rbox(w, h, 1.6, color, { x, y, z: d / 2 + 0.4 }, 0.8)
}

const BOOK_COLORS = [C.pink, C.sky, C.mint, C.lemon, C.lilac, C.peach, C.red, C.white]
const BOOK_SOBER = [N.blue, N.sage, N.mustard, M.char, N.linen, R.teal, R.red, I.leather]

/** 一排书，竖立在 y 上，x0..x1 之间 */
function books(x0: number, x1: number, y: number, maxH: number, depth: number, z: number, seed: number, colors = BOOK_COLORS) {
  const g = new THREE.Group()
  const rand = rng(seed)
  let x = x0 + 1
  while (x < x1 - 4) {
    const bw = 3 + Math.floor(rand() * 4)
    if (x + bw > x1 - 0.5) break
    const bh = maxH * (0.62 + rand() * 0.3)
    g.add(rbox(bw - 0.4, bh, depth, colors[Math.floor(rand() * colors.length)], { x: x + bw / 2, y, z }, 0.6))
    x += bw
    if (rand() < 0.1) x += 5
  }
  return g
}

/** 布收纳盒：空心 + 正面真开的把手孔 */
function bin(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const g = shell(w, h, d, 1.2, color, { top: false, front: [{ kind: 'rect', x: 0, y: h * 0.68, w: w * 0.36, h: 2.6, r: 1.3 }] })
  g.position.set(x, y, z)
  return g
}

/** 透明玻璃板 */
function glass(w: number, h: number, t: number, at: { x?: number; y: number; z: number }) {
  const m = rbox(w, h, t, C.glass, at, 0.2)
  m.material = toon(C.glass, { transparent: 0.32 })
  return m
}

/** 前后方向（沿 z）或左右方向（沿 x）的横杆 */
const barX = (x0: number, x1: number, y: number, z: number, r: number, c: string) => rod3([x0, y, z], [x1, y, z], r, c)
const barZ = (z0: number, z1: number, y: number, x: number, r: number, c: string) => rod3([x, y, z0], [x, y, z1], r, c)

type Pal = [StyleTag, string, string, string]
type Base = Omit<AssetDef, 'palettes' | 'paletteStyles'>

/** 组装素材定义：配色带风格标注；styles 不给就取配色里出现过的风格 */
function A(base: Base, pals: Pal[]): AssetDef {
  return {
    ...base,
    palettes: pals.map((p) => [p[1], p[2], p[3]]),
    paletteStyles: pals.map((p) => p[0]),
    styles: base.styles ?? [...new Set(pals.map((p) => p[0]))],
  }
}

// ---------- 常用配色 ----------

/** 软包：[面料, 抱枕 1, 抱枕 2] */
const UPH: Pal[] = [
  ['cute', C.pink, C.white, C.lemon],
  ['cute', C.sky, C.lemon, C.pink],
  ['nordic', N.gray, N.mustard, N.white],
  ['nordic', N.sage, N.linen, N.mustard],
  ['modern', M.char, M.light, M.white],
  ['retro', R.mustard, R.teal, R.cream],
]
/** 柜子：[柜体, 门板, 把手] */
const CAB: Pal[] = [
  ['cute', C.white, C.sakura, C.lemon],
  ['cute', C.woodL, C.mint, C.pink],
  ['nordic', N.white, N.oak, N.oak],
  ['nordic', N.oak, N.oakL, M.black],
  ['modern', M.white, M.light, M.black],
  ['modern', M.char, M.gray, M.silver],
  ['japanese', J.wood, J.hinoki, J.sumi],
]

// =====================================================================
// 客厅
// =====================================================================

/** L 形转角沙发：side = -1 贵妃位在左，1 在右 */
function sofaL(p: string[], side: -1 | 1) {
  const [main, sub, acc] = p
  const w = 240
  const d = 160
  const back = 86
  const chaise = 90
  const s = side
  const g = new THREE.Group()
  const lx = w / 2 - 6
  const legPts: [number, number][] = [
    [-lx, -d / 2 + 6],
    [lx, -d / 2 + 6],
    [0, -d / 2 + 6],
    [-s * lx, -d / 2 + back - 6],
    [s * lx, d / 2 - 6],
    [s * (w / 2 - chaise + 6), d / 2 - 6],
  ]
  for (const [x, z] of legPts) g.add(cyl(2.5, 2, 10, C.woodD, { x, z }, 12))
  g.add(slab(lPoly(w, d, back, chaise, s < 0 ? 'left' : 'right'), 22, shade(main, -0.06), 10))
  // 扶手只在远离贵妃位的一端
  g.add(rbox(21, 34, back + 1, main, { x: -s * (w / 2 - 10), y: 22, z: -d / 2 + back / 2 }, 9))
  g.add(rbox(w - 22, 42, 24, main, { x: s * 10, y: 26, z: -d / 2 + 14, rx: -0.12 }, 10))
  // 长边坐垫
  const x0 = -s * 99
  const x1 = s * 29
  for (let i = 0; i < 2; i++) g.add(rbox(62, 13, 56, shade(main, 0.04), { x: x0 + ((x1 - x0) * (i + 0.5)) / 2, y: 31, z: -23 }, 6))
  // 贵妃位坐垫
  g.add(rbox(86, 13, 131, shade(main, 0.04), { x: s * 75, y: 31, z: 12.5 }, 6))
  g.add(rbox(32, 30, 11, sub, { x: -s * 78, y: 42, z: -46, rx: -0.25, rz: s * 0.2 }, 5))
  g.add(rbox(30, 28, 10, acc, { x: s * 96, y: 42, z: -46, rx: -0.25, rz: -s * 0.25 }, 5))
  return g
}

/** 现代极简低矮沙发 */
function sofaLow(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(206, 6, 82, shade(main, -0.25), { z: -1 }, 1))
  g.add(rbox(220, 20, 95, main, { y: 6 }, 3))
  for (const s of [-1, 1]) {
    g.add(rbox(14, 22, 95, main, { x: s * 103, y: 26 }, 3))
    g.add(rbox(94, 14, 70, shade(main, 0.04), { x: s * 48, y: 26.3, z: 10 }, 4))
    g.add(rbox(92, 26, 14, shade(main, 0.04), { x: s * 48, y: 38, z: -26, rx: -0.15 }, 5))
  }
  g.add(rbox(192, 18, 20, main, { y: 26, z: -37.5 }, 3))
  g.add(rbox(40, 28, 10, sub, { x: -62, y: 39, z: -14, rx: -0.2, rz: 0.12 }, 4))
  g.add(rbox(36, 14, 9, acc, { x: 70, y: 40, z: -14, rx: -0.2 }, 4))
  return g
}

/** 沙发床：木框 + 两折床垫 */
function sofaBed(p: string[]) {
  const [main, sub, frame] = p
  const w = 190
  const d = 95
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(8, 62, d - 4, frame, { x: s * (w / 2 - 4) }, 2.5))
    g.add(rbox(10, 3, d, shade(frame, 0.06), { x: s * (w / 2 - 4), y: 61.6 }, 1.2))
  }
  g.add(rbox(w - 14, 6, d - 10, frame, { y: 26, z: 2 }, 1.5))
  g.add(rbox(w - 14, 6, 4, frame, { y: 50, z: -39 }, 1.5))
  g.add(rbox(w - 18, 15, 66, main, { y: 32.4, z: 9 }, 6))
  g.add(rbox(w - 18, 50, 15, main, { y: 36, z: -29, rx: -0.2 }, 6))
  for (const x of [-60, -20, 20, 60]) for (const z of [0, 22]) g.add(ball(1.1, shade(main, -0.15), { x, y: 47.3, z }))
  g.add(rbox(34, 30, 11, sub, { x: -58, y: 46, z: -16, rx: -0.3, rz: 0.15 }, 5))
  g.add(rbox(30, 28, 10, shade(sub, -0.08), { x: 60, y: 46, z: -16, rx: -0.3, rz: -0.15 }, 5))
  return g
}

/** 单人摇椅 */
function rocker(p: string[]) {
  const [wood, cushion, acc] = p
  const g = new THREE.Group()
  const R0 = 150
  const a = Math.asin(44 / R0)
  for (const s of [-1, 1]) {
    g.add(torus(R0, 1.8, wood, { x: s * 27, y: R0 + 1.8, ry: Math.PI / 2, rz: -Math.PI / 2 - a }, a * 2))
    g.add(cyl(1.8, 1.8, 36, wood, { x: s * 27, y: 3, z: 22 }, 10))
    g.add(cyl(1.8, 1.8, 37, wood, { x: s * 27, y: 2, z: -20 }, 10))
    // 扶手 + 支柱
    g.add(cyl(1.5, 1.5, 20, wood, { x: s * 29, y: 41, z: 20 }, 10))
    g.add(rbox(6, 3, 50, wood, { x: s * 29, y: 60 }, 1.2))
  }
  g.add(rbox(60, 4, 50, wood, { y: 38, z: 2 }, 1.2))
  g.add(rbox(54, 6, 44, cushion, { y: 41.6, z: 4 }, 3))
  const back = new THREE.Group()
  for (const s of [-1, 1]) back.add(rbox(4, 54, 4, wood, { x: s * 27 }, 1))
  back.add(rbox(58, 8, 4, wood, { y: 46 }, 1.5))
  for (const x of [-12, 0, 12]) back.add(rbox(4, 40, 2, wood, { x, y: 6 }, 0.8))
  back.add(rbox(46, 34, 6, cushion, { y: 8, z: 3.5 }, 3))
  back.position.set(0, 41, -22)
  back.rotation.x = -0.25
  g.add(back)
  g.add(rbox(24, 22, 8, acc, { y: 47, z: -12, rx: -0.3 }, 4))
  return g
}

/** 梨形豆袋 */
/** 梨形豆袋：下宽上窄的一整团，顶部往后倒成靠背，前面坐出窝（以前是两颗球叠起来，像葫芦 / 雪人） */
const pearF: SoftFn = (x, y, z) => {
  const t = (y + 1) / 2
  const q = Math.hypot(x, z)
  const [c, s] = q > 1e-6 ? [x / q, z / q] : [0, 0]
  let r = 35 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.7)
  r *= 1 - 0.34 * Math.exp(-(((t - 0.55) / 0.16) ** 2)) * Math.max(0, s) ** 2
  return [c * r, Math.max(0, 98 * t - 13), s * r - 18 * t ** 3 + 3]
}
function beanPear(p: string[]) {
  const [main, sub] = p
  const g = G(soft(main, pearF, { wrinkle: 0.8, seed: 6 }))
  // 侧面小布标：贴在 t≈0.33 处的表面上
  const t = 0.33
  const r = 35 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.7)
  const a = 0.6
  g.add(rbox(6, 3, 1, sub, { x: Math.sin(a) * (r + 0.2), y: 98 * t - 13 - 1.5, z: Math.cos(a) * (r + 0.2) - 18 * t ** 3 + 3, ry: a }, 0.4))
  return g
}

/** 圆脚凳 */
function pouf(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(puck(25, 38, main))
  g.add(torus(25, 1.6, sub, { y: 19, rx: Math.PI / 2 }))
  g.add(ball(2.2, acc, { y: 37.6 }, [1, 0.5, 1]))
  return g
}

/** 低矮长电视柜（120 / 180），顶面空着 */
function tvLow(p: string[], w: number) {
  const [main, sub, acc] = p
  const d = 40
  const y0 = 10
  const g = G(legs(w - 10, d - 8, y0, shade(main, -0.15), 2.2, 4), carcass(w, 32, d, main, y0))
  const fy = y0 + 2.9
  const top = y0 + 32 - 2.5
  const inner = w / 2 - 2.5
  const mid = 29
  for (const s of [-1, 1]) g.add(divider(s * mid, fy, top, d, main))
  const sideW = inner - mid - 1.1
  const sx = mid + 1.1 + sideW / 2
  // 左：翻门
  g.add(front(sideW - 1, top - fy - 1.6, d, sub, -sx, fy + 0.8))
  g.add(rbox(Math.min(14, sideW * 0.4), 1.6, 1.6, acc, { x: -sx, y: top - 5, z: d / 2 + 1.6 }, 0.6))
  // 右：两层抽屉
  const dh = (top - fy - 2.4) / 2
  for (let i = 0; i < 2; i++) {
    const y = fy + 0.8 + i * (dh + 0.8)
    g.add(front(sideW - 1, dh, d, sub, sx, y))
    g.add(ball(1.6, acc, { x: sx, y: y + dh / 2, z: d / 2 + 1.7 }))
  }
  // 中间开放格：游戏机 + 一排游戏盒
  g.add(rbox(26, 5, 18, C.white, { x: -12, y: fy, z: -2 }, 1.5))
  g.add(books(6, 27, fy, 17, 13, -3, 5))
  return g
}

/** 复古昭和电视柜：焦糖木 + 外八腿 + 玻璃推拉门 */
function tvRetro(p: string[]) {
  const [main, sub, acc] = p
  const w = 120
  const d = 45
  const y0 = 14
  const g = carcass(w, 36, d, main, y0)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(cyl(2.4, 1.6, 15, shade(main, -0.15), { x: sx * 52, y: -0.3, z: sz * 16, rx: -sz * 0.12, rz: sx * 0.12 }, 12))
  const fy = y0 + 2.9
  const top = y0 + 36 - 2.5
  g.add(divider(20, fy, top, d, main))
  // 左：玻璃推拉门，里面是唱片
  g.add(books(-56, 18, fy, 28, 30, -4, 21, [R.teal, R.red, R.mustard, R.cream, R.orange, R.olive]))
  const dh = top - fy - 1
  for (let i = 0; i < 2; i++) {
    const x = -38 + i * 37
    const z = d / 2 + 0.6 + i * 1.8
    const fr = new THREE.Group()
    fr.add(rbox(40, 2.5, 1.4, sub, { y: 0 }, 0.5))
    fr.add(rbox(40, 2.5, 1.4, sub, { y: dh - 2.5 }, 0.5))
    for (const s of [-1, 1]) fr.add(rbox(2.5, dh, 1.4, sub, { x: s * 18.75 }, 0.5))
    fr.add(glass(35, dh - 4, 0.5, { y: 2, z: 0 }))
    fr.add(rbox(1.2, 8, 1, acc, { x: i ? -15.5 : 15.5, y: dh / 2 - 4, z: 1 }, 0.4))
    fr.position.set(x, fy + 0.5, z)
    g.add(fr)
  }
  // 右：两层抽屉 + 长条拉手
  const h2 = (top - fy - 2.4) / 2
  for (let i = 0; i < 2; i++) {
    const y = fy + 0.8 + i * (h2 + 0.8)
    g.add(front(35, h2, d, shade(main, 0.06), 39.5, y))
    g.add(rbox(18, 1.6, 1.6, acc, { x: 39.5, y: y + h2 / 2, z: d / 2 + 1.7 }, 0.6))
  }
  return g
}

/** 边柜：细圆腿 + 三扇门 */
function sideboard(p: string[]) {
  const [main, sub, acc] = p
  const w = 140
  const d = 45
  const g = carcass(w, 66, d, main, 14)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.4, 1.4, 14.3, shade(main, -0.15), { x: sx * 64, z: sz * 18.5 }, 12))
  const dw = (w - 7) / 3
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * (dw + 0.6)
    g.add(front(dw - 0.6, 58, d, i === 1 ? sub : shade(main, 0.05), x, 18))
    g.add(ball(1.8, acc, { x: x + (i === 2 ? -1 : 1) * (dw / 2 - 5), y: 50, z: d / 2 + 1.8 }))
  }
  return g
}

/** 北欧细腿边柜：外八锥形腿，左边竖条纹门，右边三抽 */
function sideboardNordic(p: string[]) {
  const [main, sub, legC] = p
  const w = 160
  const d = 42
  const y0 = 20
  const g = carcass(w, 55, d, main, y0)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(cyl(2, 1.1, 20.6, legC, { x: sx * (w / 2 - 10), y: -0.4, z: sz * (d / 2 - 7), rx: -sz * 0.1, rz: sx * 0.1 }, 12))
  const fy = y0 + 2.9
  const top = y0 + 55 - 2.5
  g.add(divider(28, fy, top, d, main))
  const dh = top - fy - 1.6
  for (let i = 0; i < 2; i++) {
    const x = -w / 2 + 2.5 + 0.8 + 26.4 + i * 53.2
    g.add(front(52, dh, d, sub, x, fy + 0.8))
    for (let k = 0; k < 8; k++) g.add(rbox(4.6, dh - 4, 1, shade(sub, -0.04), { x: x - 22.75 + k * 6.5, y: fy + 2.8, z: d / 2 + 1.5 }, 0.5))
  }
  const rw = w / 2 - 2.5 - 29.1
  const rx = 29.1 + rw / 2
  const h3 = (dh - 1.6) / 3
  for (let i = 0; i < 3; i++) {
    const y = fy + 0.8 + i * (h3 + 0.8)
    g.add(front(rw - 1, h3, d, sub, rx, y))
    g.add(rbox(10, 1.2, 1.2, legC, { x: rx, y: y + h3 - 4, z: d / 2 + 1.6 }, 0.5))
  }
  return g
}

/** 玻璃门展示柜：里面摆餐具，顶面空 */
function displayCabinet(p: string[]) {
  const [main, sub, acc] = p
  const w = 80
  const d = 40
  const y0 = 8
  const h = 172
  const g = G(rbox(76, 8, 36, shade(main, -0.1), { z: -1 }, 1.5), carcass(w, h, d, main, y0))
  const fy = y0 + 2.9
  const top = y0 + h - 2.5
  const step = (top - fy) / 4
  const lv: number[] = [fy]
  for (let k = 1; k < 4; k++) {
    const y = fy + k * step - 1
    g.add(shelf(w - 5, y, d, main, 2))
    lv.push(y + 2)
  }
  const cols = [C.white, sub, acc, C.white]
  // 0：叠起的盘子 + 大碗
  for (let i = 0; i < 4; i++) g.add(puck(9, 1.2, i % 2 ? cols[1] : C.white, { x: -16, y: lv[0] + i * 1.3, z: 0 }))
  g.add(cup(10, 6, 9, 1, acc, { x: 14, y: lv[0], z: 0 }))
  // 1：一排杯子
  for (let i = 0; i < 4; i++) {
    const x = -24 + i * 16
    g.add(cup(3.4, 3, 7, 0.6, cols[i], { x, y: lv[1], z: 2 }))
    g.add(torus(2.2, 0.6, cols[i], { x: x + 4, y: lv[1] + 3.8, z: 2 }))
  }
  // 2：立起来的盘子
  for (let i = 0; i < 3; i++) g.add(puck(9, 1.4, cols[i], { x: -20 + i * 20, y: lv[2] + 8.6, z: -12, rx: Math.PI / 2 - 0.18 }))
  // 3：茶壶 + 玻璃罐
  g.add(ball(8, sub, { x: -12, y: lv[3] + 7, z: 0 }, [1, 0.85, 1]))
  g.add(ball(2, acc, { x: -12, y: lv[3] + 14.4, z: 0 }))
  g.add(rod(-5, lv[3] + 6, 0, lv[3] + 11, 1, sub))
  g.add(torus(4, 0.9, sub, { x: -20, y: lv[3] + 7, z: 0 }))
  g.add(cup(5, 5, 14, 0.6, C.lemon, { x: 16, y: lv[3], z: 0 }))
  // 玻璃门
  const dh = h - 6
  for (const s of [-1, 1]) {
    const fr = new THREE.Group()
    const dw = w / 2 - 1
    for (const y of [0, dh - 3]) fr.add(rbox(dw, 3, 1.6, main, { y }, 0.6))
    for (const k of [-1, 1]) fr.add(rbox(3, dh, 1.6, main, { x: (k * (dw - 3)) / 2 }, 0.6))
    fr.add(glass(dw - 5, dh - 5, 0.5, { y: 2.5, z: 0 }))
    fr.add(ball(1.4, acc, { x: -s * (dw / 2 - 4), y: dh / 2, z: 1.4 }))
    fr.position.set(s * (dw / 2 + 0.3), y0 + 3, d / 2 + 0.9)
    g.add(fr)
  }
  return g
}

/** 格子柜（Kallax 风格），n × m 格 */
function cubeShelf(p: string[], cols: number, rows: number) {
  const [main, a, b] = p
  const t = 4
  const cell = 33
  const sep = 3
  const w = cols * cell + (cols - 1) * sep + 2 * t
  const h = rows * cell + (rows - 1) * sep + 2 * t + 0.4
  const d = 39
  const g = carcass(w, h, d, main, 0, t)
  const fy = 0.4 + t
  const top = h - t
  const inW = w - 2 * t
  for (let i = 1; i < cols; i++) g.add(divider(-inW / 2 + i * (cell + sep) - sep / 2, fy, top, d, main, sep))
  for (let j = 1; j < rows; j++) g.add(shelf(inW, fy + j * (cell + sep) - sep, d, main, sep))
  const rand = rng(cols * 10 + rows)
  let n = 0
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const cx = -inW / 2 + cell / 2 + i * (cell + sep)
      const cy = fy + j * (cell + sep)
      const k = (i * 7 + j * 3 + n++) % 5
      if (k === 0 || k === 3) g.add(bin(cell - 2, cell - 3, d - 6, k === 0 ? a : b, cx, cy, 1.5))
      else if (k === 1) g.add(books(cx - cell / 2, cx + cell / 2, cy, cell - 2, 24, 0, Math.floor(rand() * 1000)))
      else if (k === 2 && j < rows - 1) for (let s = 0; s < 3; s++) g.add(rbox(24 - s * 2, 3, 20, BOOK_COLORS[(i + j + s) % 8], { x: cx, y: cy + s * 3.1, z: 2, ry: s * 0.1 }, 0.6))
    }
  return { g, w, h }
}

/** 窗边长椅：下面三格收纳篮 */
function windowBench(p: string[]) {
  const [main, sub, acc] = p
  const w = 140
  const d = 45
  const g = carcass(w, 38, d, main, 0)
  const fy = 2.9
  const top = 35.5
  for (const s of [-1, 1]) g.add(divider(s * 22.5, fy, top, d, main))
  for (const x of [-45.7, 0, 45.7]) {
    g.add(tray(38, 26, 36, 1.4, C.woodL, { x, y: fy, z: 2 }, 0.6))
    g.add(torus(4, 0.7, shade(C.woodL, -0.18), { x, y: fy + 19, z: 20.5 }, Math.PI))
  }
  g.add(rbox(136, 8, 43, sub, { y: 38.4 }, 4))
  g.add(rbox(38, 32, 11, acc, { x: -40, y: 44, z: -14, rx: -0.2, rz: 0.08 }, 5))
  g.add(rbox(34, 30, 10, shade(sub, -0.08), { x: 44, y: 44, z: -14, rx: -0.2, rz: -0.1 }, 5))
  return g
}

// =====================================================================
// 卧室
// =====================================================================

/** 双层床 / 阁楼床的共用部分：长边沿 x（贴墙），床头在 -x，梯子在正面右侧 */

function bedPosts(g: THREE.Group, H: number, frame: string, acc: string) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(6, H, 6, frame, { x: sx * 102, z: sz * 49.5 }, 1.5))
      g.add(ball(3.4, acc, { x: sx * 102, y: H + 1.5, z: sz * 49.5 }))
    }
}

function bedDeck(g: THREE.Group, y: number, frame: string, duvet: string, pillow: string) {
  g.add(rbox(200, 5, 95, frame, { y }, 1))
  for (const s of [-1, 1]) g.add(rbox(200, 12, 4, frame, { y: y - 4, z: s * 49.5 }, 1))
  g.add(rbox(194, 16, 93, C.white, { y: y + 5.4 }, 5))
  g.add(rbox(32, 10, 56, pillow, { x: -75, y: y + 21, rx: 0.06 }, 4.5))
  g.add(rbox(130, 9, 97, duvet, { x: 34, y: y + 19 }, 4))
  g.add(rbox(16, 3.5, 99, shade(duvet, 0.08), { x: -23, y: y + 27.5 }, 1.5))
}

/** 护栏：背面整根，正面留出梯子口 */
function bedRails(g: THREE.Group, deckY: number, frame: string) {
  for (const y of [deckY + 28, deckY + 37]) {
    g.add(rbox(200, 4, 3, frame, { y, z: -49.5 }, 1))
    g.add(rbox(153, 4, 3, frame, { x: -22.5, y, z: 49.5 }, 1))
  }
  g.add(rbox(3, 41, 3, frame, { x: 55.5, y: deckY, z: 49.5 }, 1))
  for (const s of [-1, 1]) g.add(rbox(3, 40, 94, frame, { x: s * 102, y: deckY }, 1))
}

function ladder(g: THREE.Group, top: number, rungs: number[], frame: string) {
  for (const x of [58, 94]) g.add(rbox(3, top, 4, frame, { x, z: 50 }, 1))
  for (const y of rungs) g.add(barX(59, 93, y, 50, 1.4, frame))
}

function bunkBed(p: string[]) {
  const [frame, duvet, acc] = p
  const g = new THREE.Group()
  bedPosts(g, 146, frame, acc)
  for (const s of [-1, 1]) g.add(rbox(3, 30, 94, frame, { x: s * 102, y: 12 }, 1))
  bedDeck(g, 14, frame, shade(duvet, 0.06), acc)
  bedDeck(g, 96, frame, duvet, acc)
  bedRails(g, 96, frame)
  ladder(g, 137, [25, 50, 75, 118], frame)
  return g
}

function loftBed(p: string[]) {
  const [frame, duvet, acc] = p
  const g = new THREE.Group()
  bedPosts(g, 182, frame, acc)
  for (const s of [-1, 1]) g.add(rbox(3, 6, 94, frame, { x: s * 102, y: 22 }, 1))
  bedDeck(g, 140, frame, duvet, acc)
  bedRails(g, 140, frame)
  ladder(g, 180, [30, 60, 90, 120, 162], frame)
  // 下方书桌（桌面空着，可摆东西）
  const top = shade(frame, 0.06)
  g.add(rbox(148, 3, 54, top, { x: -24, y: 70, z: -19 }, 1))
  g.add(rbox(3, 70, 50, frame, { x: 48, z: -20 }, 1))
  g.add(rbox(3, 70, 50, frame, { x: -96 }, 1))
  g.add(rbox(40, 12, 48, top, { x: 22, y: 57.8, z: -21 }, 1.2))
  g.add(rbox(36, 9, 1.4, acc, { x: 22, y: 59.3, z: 3.3 }, 0.6))
  g.add(ball(1.4, frame, { x: 22, y: 63.8, z: 4.4 }))
  // 桌上方的书架板：两块侧板从桌面一直立到床板护栏下（以前侧板下端悬在桌面上方 35cm，整组书架悬空）
  g.add(rbox(146, 2.5, 22, frame, { x: -24, y: 108, z: -38 }, 0.8))
  for (const x of [-96, 46]) g.add(rbox(2.5, 63.1, 22, frame, { x, y: 73, z: -38 }, 0.6))
  g.add(books(-94, -10, 110.5, 22, 16, -39, 9))
  return g
}

/** 床尾凳：软包拉扣 + 下层木格 */
function footBench(p: string[]) {
  const [wood, cushion, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2, 1.5, 30.3, shade(wood, -0.1), { x: sx * 54, z: sz * 14 }, 12))
  g.add(rbox(120, 6, 40, wood, { y: 30 }, 1.5))
  g.add(rbox(116, 9, 37, cushion, { y: 35.6 }, 4))
  for (const x of [-40, -20, 0, 20, 40]) for (const z of [-8, 8]) g.add(ball(1, acc, { x: x + (z > 0 ? 10 : 0), y: 44.5, z }))
  for (let i = 0; i < 6; i++) g.add(rbox(104, 1.6, 4, wood, { y: 10, z: -12.5 + i * 5 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(110, 2, 2, wood, { y: 8, z: s * 14 }, 0.6))
  // 两端的横撑：下层木条两头搭在上面（以前中间几根木条只靠前后两根纵撑，悬空 6cm）
  for (const s of [-1, 1]) g.add(rbox(2, 2, 30, wood, { x: s * 52.5, y: 8 }, 0.6))
  return g
}

/** 梳妆台：镜子立在台面后沿，台面前部空着 */
function vanity(p: string[]) {
  const [main, sub, acc] = p
  const w = 90
  const d = 45
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.2, 1.5, 60.3, shade(main, -0.12), { x: sx * 40, z: sz * 17.5 }, 12))
  g.add(rbox(84, 12, 41, main, { y: 60 }, 1.5))
  g.add(rbox(w, 3, d, main, { y: 72 }, 1.2))
  g.add(rbox(40, 9, 1.4, sub, { y: 61.5, z: 20.8 }, 0.6))
  g.add(ball(1.5, acc, { y: 66, z: 21.8 }))
  // 镜架
  g.add(rbox(60, 4, 8, main, { y: 74.7, z: -17 }, 1.2))
  for (const s of [-1, 1]) {
    g.add(rbox(3, 40, 3, main, { x: s * 26.5, y: 78, z: -17 }, 1))
    g.add(ball(2, acc, { x: s * 26.5, y: 113, z: -17 }))
  }
  const mir = new THREE.Group()
  mir.add(torus(22, 2, sub))
  const gl = cyl(21, 21, 0.6, C.glass, { y: -0.3, rx: Math.PI / 2 }, 32)
  gl.userData.noOutline = true
  mir.add(gl)
  mir.scale.set(1, 1.35, 1)
  mir.position.set(0, 113, -17)
  g.add(mir)
  // 镜子两侧的转轴，把镜框挂在立柱上（以前镜框和立柱之间隔着 1cm）
  for (const s of [-1, 1]) g.add(barX(s * 23, s * 26, 113, -17, 0.9, acc))
  // 好莱坞灯泡
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 0.12 + (i / 7) * Math.PI * 0.76
    const b = ball(1.6, C.lamp, { x: Math.cos(a) * 24, y: 113 + Math.sin(a) * 24 * 1.35, z: -15 })
    b.material = toon(C.lamp, { emissive: 0.6 })
    g.add(b)
  }
  return g
}

/** 衣帽架：挂一顶帽子、一条围巾、一个包 */
function coatRack(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(puck(22, 4, main))
  g.add(cyl(2, 2.2, 170, main, { y: 3 }, 12))
  g.add(ball(3.5, main, { y: 174.5 }))
  const hook = (y: number, a: number) => {
    const hg = new THREE.Group()
    hg.add(rod(0, 0, 14, 8, 1, main))
    hg.add(ball(1.6, main, { x: 14, y: 8 }))
    hg.position.y = y
    hg.rotation.y = a
    g.add(hg)
  }
  for (let i = 0; i < 4; i++) hook(158, (i * Math.PI) / 2)
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) hook(140, a)
  // 帽子挂在 +x 钩上
  g.add(puck(12, 1.2, sub, { x: 14, y: 165, rz: -0.3 }))
  g.add(cyl(7, 7.5, 8, sub, { x: 15.4, y: 166, rz: -0.3 }))
  g.add(cyl(7.6, 7.6, 1.6, acc, { x: 14.6, y: 166.4, rz: -0.3 }))
  // 围巾搭在 -x 钩上
  g.add(ball(3, acc, { x: -14, y: 166.5 }, [1.4, 0.8, 1.2]))
  g.add(rbox(8, 40, 1.6, acc, { x: -16, y: 126, z: 0, rz: 0.05 }, 0.6))
  g.add(rbox(8, 34, 1.6, shade(acc, -0.06), { x: -12, y: 132, z: 1.8, rz: -0.05 }, 0.6))
  // 托特包挂在前钩上
  g.add(torus(6, 0.8, sub, { y: 142.8, z: 14 }))
  g.add(rbox(24, 26, 7, sub, { y: 112.8, z: 14 }, 2))
  return g
}

/** 衣架（杆沿 x，肩线沿 z）：钩子绕杆，衣服挂在肩架上 */
function railHanger(barY: number, color: string, garment: THREE.Group) {
  const g = new THREE.Group()
  g.add(torus(2.2, 0.45, C.steel, { y: barY, ry: Math.PI / 2 }, Math.PI * 1.3))
  g.add(cyl(0.45, 0.45, 7, C.steel, { y: barY - 9.2 }, 6))
  const sg = new THREE.Group()
  const top = barY - 9
  const sh = top - 7
  for (const s of [-1, 1]) sg.add(rod(0, top, s * 18, sh, 0.9, color))
  sg.add(rod(-18, sh, 18, sh, 0.6, color))
  sg.add(ball(1.3, color, { y: top }))
  garment.position.y = sh
  sg.add(garment)
  sg.rotation.y = Math.PI / 2
  g.add(sg)
  return g
}

/** 几件衣服（xy 平面、正面 +z，肩线在 y = 0） */
function garment(kind: number, col: string) {
  const g = new THREE.Group()
  if (kind === 0) {
    // T 恤
    g.add(rbox(32, 40, 2.4, col, { y: -40 }, 1.2))
    for (const s of [-1, 1]) g.add(rbox(11, 10, 2.4, col, { x: s * 17, y: -10, rz: -s * 0.55 }, 1.2))
    g.add(rbox(10, 3, 2.6, C.white, { y: -2 }, 1.2))
  } else if (kind === 1) {
    // 连衣裙
    g.add(rbox(26, 22, 2.6, col, { y: -22 }, 1.2))
    const skirt = cyl(9, 20, 46, col, { y: -66 }, 20)
    skirt.scale.z = 0.16
    g.add(skirt)
    g.add(rbox(28, 3, 3.2, C.white, { y: -23 }, 1.2))
  } else if (kind === 2) {
    // 长袖衬衫
    g.add(rbox(32, 46, 2.4, col, { y: -46 }, 1.2))
    for (const s of [-1, 1]) g.add(rbox(8, 40, 2.4, col, { x: s * 19.5, y: -41, rz: -s * 0.1 }, 1.2))
    for (let i = 0; i < 4; i++) g.add(ball(0.7, C.white, { y: -6 - i * 10, z: 1.3 }))
  } else {
    // 大衣
    g.add(rbox(36, 78, 4, col, { y: -78 }, 1.6))
    for (const s of [-1, 1]) {
      g.add(rbox(8, 58, 4, shade(col, -0.04), { x: s * 21, y: -60 }, 1.6))
      g.add(rbox(7, 20, 1, shade(col, 0.08), { x: s * 5, y: -20, z: 2.2, rz: s * 0.3 }, 0.4))
    }
    for (let i = 0; i < 3; i++) g.add(ball(1, C.ink, { x: 4, y: -32 - i * 12, z: 2.2 }))
  }
  return g
}

/** 移动挂衣架 */
function clothesRail(p: string[]) {
  const [frame, a, b] = p
  const g = new THREE.Group()
  const barY = 150
  for (const s of [-1, 1]) {
    const x = s * 56
    g.add(rbox(4, 3, 50, frame, { x, y: 4 }, 1))
    for (const z of [-21, 21]) {
      g.add(ball(2.6, C.ink, { x, y: 2.6, z }))
      g.add(cyl(1.5, 1.5, 2, frame, { x, y: 3, z }, 8))
    }
    g.add(cyl(1.6, 1.6, barY - 6, frame, { x, y: 7 }, 10))
    g.add(ball(2.2, frame, { x, y: barY + 1 }))
  }
  g.add(barX(-56, 56, barY, 0, 1.2, frame))
  g.add(rbox(110, 2, 40, frame, { y: 22 }, 0.8))
  // 下层两双鞋
  for (const [x, c] of [[-30, a], [24, b]] as [number, string][])
    for (const s of [-1, 1]) {
      g.add(rbox(9, 6, 22, c, { x: x + s * 5.5, y: 24.3, z: 2 }, 3))
      g.add(rbox(8, 1.2, 8, C.white, { x: x + s * 5.5, y: 30.2, z: 8 }, 0.5))
    }
  const kinds = [3, 0, 1, 2, 0, 2, 1]
  const cols = [b, a, shade(a, 0.08), C.white, shade(b, 0.1), a, b]
  kinds.forEach((k, i) => {
    const h = railHanger(barY, i % 2 ? C.woodL : C.white, garment(k, cols[i]))
    h.position.x = -42 + i * 14
    g.add(h)
  })
  return g
}

/** 高斗柜：上排两个小抽屉 + 五个大抽屉 */
function tallChest(p: string[]) {
  const [main, sub, acc] = p
  const w = 60
  const d = 45
  const g = G(legs(w, d, 8, shade(main, -0.12), 2, 5))
  g.add(rbox(w, 119.8, d, main, { y: 8 }, 2.5))
  g.add(rbox(w + 2, 2.5, d + 2, shade(main, -0.05), { y: 127.5 }, 1))
  const rh = (119.8 - 3) / 6
  for (let i = 0; i < 6; i++) {
    const y = 9.5 + i * rh
    const c = i % 2 ? sub : shade(sub, 0.05)
    if (i === 5) {
      for (const s of [-1, 1]) {
        g.add(rbox(26, rh - 2, 1.6, c, { x: s * 13.5, y, z: d / 2 + 0.3 }, 0.8))
        g.add(ball(1.6, acc, { x: s * 13.5, y: y + rh / 2 - 1, z: d / 2 + 1.6 }))
      }
    } else {
      g.add(rbox(54, rh - 2, 1.6, c, { y, z: d / 2 + 0.3 }, 0.8))
      for (const s of [-1, 1]) g.add(ball(1.6, acc, { x: s * 14, y: y + rh / 2 - 1, z: d / 2 + 1.6 }))
    }
  }
  return g
}

/** 四折屏风 */
function screen(p: string[]) {
  const [frame, fabric, acc] = p
  const n = 4
  const pw = 40
  const th = 0.42
  const step = pw * Math.cos(th)
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const odd = i % 2 === 1
    const ph = odd ? 158 : 160
    const fh = odd ? 3.6 : 4
    const pg = new THREE.Group()
    for (const s of [-1, 1]) {
      pg.add(rbox(3, ph, 3, frame, { x: s * (pw / 2 - 1.5), y: fh }, 1))
      pg.add(rbox(4, fh, 10, frame, { x: s * (pw / 2 - 1.5) }, 1))
    }
    pg.add(rbox(pw - 3, 3, 2.6, frame, { y: fh + ph - 4 }, 0.8))
    pg.add(rbox(pw - 3, 3, 2.6, frame, { y: 14 }, 0.8))
    pg.add(rbox(pw - 5, ph - 17, 1.2, fabric, { y: 17 }, 0.4))
    for (const y of [60, 100, 140]) pg.add(rbox(pw - 5, 1.2, 2.2, frame, { y }, 0.4))
    // 小花
    const fx = odd ? -6 : 6
    const fy = 120 - (i % 3) * 18
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      pg.add(ball(2, acc, { x: fx + Math.cos(a) * 2.6, y: fy + Math.sin(a) * 2.6 }, [1, 1, 0.45]))
    }
    pg.add(ball(1.4, C.lemon, { x: fx, y: fy }, [1, 1, 0.6]))
    pg.position.x = -(step * n) / 2 + step * (i + 0.5)
    pg.rotation.y = odd ? -th : th
    g.add(pg)
  }
  return g
}

// =====================================================================
// 收纳
// =====================================================================

/** 抽屉式收纳箱塔：n 层 */
function drawerTower(p: string[], n: number) {
  const [main, a, b] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(ball(2.5, C.ink, { x: sx * 16, y: 2.5, z: sz * 18 }))
      g.add(cyl(2, 2, 1.5, main, { x: sx * 16, y: 4, z: sz * 18 }, 10))
    }
  g.add(rbox(40, 3, 45, main, { y: 5 }, 1))
  for (let i = 0; i < n; i++) {
    const y = 8 + i * 19.2
    g.add(rbox(40, 19, 45, main, { y }, 2))
    const c = i % 2 ? b : a
    // 抽屉面板：把手槽真开孔，透过去是箱体
    g.add(holePanel(36, 16, 1.4, c, [{ kind: 'rect', x: 0, y: 10.5, w: 10, h: 2.2, r: 1.1 }], { y: y + 1.5, z: 23.1 }, 0.7))
  }
  const top = 8 + n * 19.2 - 0.4
  g.add(rbox(41, 2.4, 46, main, { y: top }, 1))
  return { g, h: top + 2.4 }
}

/** 钢架置物架：n 层网格层板，全部空着 */
function steelRack(p: string[], n: number, h: number) {
  const [steel] = p
  const g = new THREE.Group()
  const wire = shade(steel, -0.12)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 43
      const z = sz * 20.5
      g.add(puck(2, 1.5, C.ink, { x, z }))
      g.add(cyl(1.3, 1.3, h - 1.5, steel, { x, y: 1.5, z }, 10))
    }
  for (let k = 0; k < n; k++) {
    const y = k === n - 1 ? h - 0.7 : 14 + (k * (h - 14.7)) / (n - 1)
    for (const s of [-1, 1]) {
      g.add(barX(-44, 44, y, s * 21.5, 0.7, steel))
      g.add(barZ(-21.5, 21.5, y, s * 44, 0.7, steel))
      g.add(barX(-43, 43, y - 1.2, s * 10, 0.5, steel))
    }
    for (let x = -38; x <= 38; x += 5.4) {
      const m = barZ(-21.5, 21.5, y - 0.35, x, 0.35, wire)
      m.userData.noOutline = true
      g.add(m)
    }
  }
  return g
}

/** 工业风水管 + 实木层板置物架 */
function pipeShelf(p: string[], n: number, h: number) {
  const [plank, pipe, fit] = p
  const w = 100
  const d = 35
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 44
      const z = sz * 12
      g.add(puck(3.6, 1, pipe, { x, z }))
      g.add(cyl(1.6, 1.6, h - 4, pipe, { x, y: 0.8, z }, 12))
      g.add(puck(3.6, 1, pipe, { x, y: h - 3.9, z }))
    }
  for (let k = 0; k < n; k++) {
    const y = k === n - 1 ? h - 3 : 10 + (k * (h - 13)) / (n - 1)
    g.add(rbox(w, 3, d, plank, { y }, 0.8))
    if (k < n - 1) for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.3, 2.3, 3, fit, { x: sx * 44, y: y - 3, z: sz * 12 }, 12))
  }
  return g
}

/** 窄缝收纳推车 */
function slimCart(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(ball(2, C.ink, { x: sx * 6, y: 2, z: sz * 21 }))
      g.add(cyl(0.8, 0.8, sz > 0 ? 80 : 66, main, { x: sx * 7.8, y: 4, z: sz * 22.8 }, 8))
    }
  const tiers = [5, 31, 57]
  for (const y of tiers) g.add(tray(18, 10, 48, 1.2, main, { y }, 0.5))
  g.add(rbox(17, 3, 3, sub, { y: 82, z: 22.8 }, 1.4))
  // 下两层装瓶罐
  const bottle = (z: number, y: number, c: string, hh: number) => {
    g.add(cyl(3, 3, hh, c, { y, z }, 14))
    g.add(cyl(1.4, 1.4, 3, C.white, { y: y + hh, z }, 10))
  }
  bottle(-14, 6.2, sub, 18)
  bottle(-5, 6.2, acc, 16)
  bottle(5, 6.2, C.white, 20)
  bottle(15, 6.2, sub, 14)
  for (let i = 0; i < 4; i++) g.add(cyl(3.2, 3.2, 8, [acc, C.white, sub, acc][i], { y: 32.2, z: -15 + i * 8.5 }, 14))
  return g
}

/** 书柜：cols 列 × rows 行，最上层也放书，顶面空 */
function bookcase(p: string[], w: number, h: number, d: number, cols: number, rows: number, seed: number) {
  const [main, a, b] = p
  const g = carcass(w, h, d, main)
  const fy = 2.9
  const top = h - 2.5
  const inW = w - 5
  const ch = (top - fy - (rows - 1) * 2.2) / rows
  const cw = (inW - (cols - 1) * 2.2) / cols
  for (let i = 1; i < cols; i++) g.add(divider(-inW / 2 + i * (cw + 2.2) - 1.1, fy, top, d, main))
  for (let j = 1; j < rows; j++) g.add(shelf(inW, fy + j * (ch + 2.2) - 2.2, d, main, 2.2))
  const pal = main === M.char || main === I.walnut || main === J.wood ? BOOK_SOBER : BOOK_COLORS
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x0 = -inW / 2 + i * (cw + 2.2)
      const y = fy + j * (ch + 2.2)
      if ((i + j * 2 + seed) % 5 === 3) g.add(bin(cw - 2, Math.min(ch - 3, 24), d - 6, (i + j) % 2 ? a : b, x0 + cw / 2, y, 1.5))
      else g.add(books(x0, x0 + cw, y, ch - 2, d * 0.7, 1, seed * 31 + i * 7 + j, pal))
    }
  return g
}

/** 杂志架：三级斜插 */
function magazineRack(p: string[]) {
  const [wood, a, b] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(2, 60, 30, wood, { x: s * 21 }, 0.8))
  g.add(rbox(40.6, 58, 1.5, wood, { y: 1, z: -14.2 }, 0.5))
  const cols = [a, b, C.white, shade(a, 0.1), shade(b, -0.08), C.lemon]
  for (let k = 0; k < 3; k++) {
    const z = 9 - 9 * k
    const y = 8 + 18 * k
    g.add(rbox(40.6, 2, 10, wood, { y, z }, 0.6))
    g.add(rbox(40.6, 9, 1.6, wood, { y, z: z + 4.5 }, 0.6))
    for (let m = 0; m < 2; m++) g.add(rbox(26 - m * 2, 24 - m * 3, 1, cols[k * 2 + m], { x: (m ? 4 : -3), y: y + 2.2, z: z + 1.5 - m * 1.6, rx: -0.15 }, 0.3))
  }
  return g
}

/** 矩形框（4 条边），用来给篮子加编织纹 */
function band(w: number, d: number, y: number, h: number, c: string, x = 0) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(w + 0.8, h, 0.8, c, { x, y, z: s * (d / 2) }, 0.3))
    g.add(rbox(0.8, h, d, c, { x: x + s * (w / 2), y }, 0.3))
  }
  return g
}

/** 收纳篮组：大中小三个 */
function basketSet(p: string[]) {
  const [main, a, b] = p
  const g = new THREE.Group()
  const sets: [number, number, number, number][] = [
    [-25, 38, 30, 36],
    [9, 28, 24, 30],
    [35, 20, 18, 24],
  ]
  for (const [x, w, h, d] of sets) {
    g.add(tray(w, h, d, 1.6, main, { x }, 0.7))
    for (const y of [h * 0.3, h * 0.62]) g.add(band(w, d, y, 2, shade(main, -0.12), x))
    for (const s of [-1, 1]) g.add(torus(3, 0.7, shade(main, -0.2), { x: x + s * (w / 2 + 0.6), y: h - 4, ry: Math.PI / 2 }, Math.PI))
  }
  // 大篮：卷起的毛巾
  for (let i = 0; i < 3; i++) {
    const m = capsule(5, 20, i % 2 ? a : C.white, {})
    m.position.set(-25, 6.6, -10 + i * 10)
    m.rotation.z = Math.PI / 2
    g.add(m)
  }
  // 中篮：叠好的布
  for (let i = 0; i < 3; i++) g.add(rbox(22, 4, 20, [b, C.white, a][i], { x: 9, y: 1.7 + i * 4.1 }, 1.5))
  // 小篮：毛线球
  g.add(ball(5, a, { x: 32, y: 6.8, z: -3 }))
  g.add(ball(4.5, b, { x: 38, y: 6.3, z: 4 }))
  return g
}

/** 階段箪笥：和风楼梯柜，四级台阶 */
function kaidan(p: string[]) {
  const [main, fronts, iron] = p
  const g = new THREE.Group()
  const bw = 37.5
  const d = 45
  const hs = [180, 135, 90, 45]
  hs.forEach((H, i) => {
    const x = -75 + bw * (i + 0.5)
    g.add(rbox(bw, H - 2.2, d, main, { x }, 1))
    g.add(rbox(bw + 0.4, 2.2, d + 1, shade(main, -0.1), { x, y: H - 2.2 }, 0.6))
    const rows = H / 22.5
    for (let k = 0; k < rows; k++) {
      const y = k * 22.5 + 1.2
      g.add(rbox(bw - 3.5, 19.6, 1.4, fronts, { x, y, z: d / 2 + 0.3 }, 0.6))
      g.add(torus(2, 0.5, iron, { x, y: y + 11, z: d / 2 + 1.6 }))
      g.add(rbox(5, 2.4, 0.6, iron, { x, y: y + 13.4, z: d / 2 + 1.1 }, 0.3))
    }
  })
  return g
}

// =====================================================================
// 儿童
// =====================================================================

/** 婴儿床 */
function crib(p: string[]) {
  const [frame, sub, acc] = p
  const H = 92
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(5, H, 5, frame, { x: sx * 61.5, z: sz * 31.5 }, 1.5))
      g.add(ball(3, frame, { x: sx * 61.5, y: H + 1.5, z: sz * 31.5 }))
    }
  for (const sz of [-1, 1]) {
    g.add(rbox(118, 4, 4, frame, { y: H - 6, z: sz * 31.5 }, 1.2))
    g.add(rbox(118, 4, 4, frame, { y: 21, z: sz * 31.5 }, 1.2))
    for (let x = -54; x <= 54; x += 9) g.add(cyl(1, 1, 61, frame, { x, y: 25, z: sz * 31.5 }, 8))
  }
  for (const sx of [-1, 1]) {
    g.add(rbox(3, 66, 59, sub, { x: sx * 61.5, y: 20 }, 1))
    const disc = cyl(9, 9, 0.8, acc, {}, 24)
    disc.position.set(sx * 63.5, 62, 0)
    disc.rotation.z = Math.PI / 2
    g.add(disc)
  }
  g.add(rbox(118, 3, 58, frame, { y: 24 }, 1))
  g.add(rbox(116, 10, 56, C.white, { y: 27.2 }, 4))
  g.add(rbox(56, 3, 58, acc, { x: 24, y: 36.6 }, 1.4))
  g.add(rbox(24, 6, 34, sub, { x: -40, y: 37 }, 3))
  return g
}

/** 儿童书桌：圆角桌面 + 一个抽屉，桌面空着 */
function kidDesk(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(4, 55, 44, sub, { x: s * 41 }, 1.5))
    g.add(rbox(6, 3, 48, shade(sub, -0.08), { x: s * 41 }, 1.2))
  }
  g.add(rbox(78, 6, 2.5, sub, { y: 20, z: -18 }, 1))
  g.add(rbox(90, 3, 50, main, { y: 55 }, 2))
  g.add(rbox(50, 8, 40, main, { y: 46.6, z: 2 }, 1.2))
  g.add(rbox(46, 6, 1.4, acc, { y: 47.6, z: 22.4 }, 0.6))
  g.add(ball(1.4, sub, { y: 50.6, z: 23.4 }))
  return g
}

/** 儿童椅：云朵靠背 */
function kidChair(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.4, 30.3, shade(main, -0.12), { x: sx * 14, z: sz * 13 }, 10))
  g.add(rbox(34, 3, 32, main, { y: 30 }, 1.2))
  for (const s of [-1, 1]) g.add(rbox(3, 18, 3, main, { x: s * 14, y: 32.6, z: -14.5 }, 1))
  // 靠背板比立柱厚一点，前后面不和立柱共面
  g.add(rbox(32, 12, 3.6, sub, { y: 46, z: -14.5 }, 1.4))
  for (const x of [-9, 0, 9]) g.add(ball(x === 0 ? 6 : 5, sub, { x, y: 58 + (x === 0 ? 1.5 : 0), z: -14.5 }, [1, 1, 0.3]))
  return g
}

/** 玩具箱：盖子掀开靠后，玩具都在口沿以下 */
function toyBox(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  // 箱体：空心外壳，正面三个圆洞（彩色包边）、两侧真开的提手孔
  const holes = [-18, 0, 18].map((x) => ({ kind: 'circle' as const, x, y: 22, r: 4.5 }))
  const grip = [{ kind: 'rect' as const, x: 0, y: 30, w: 12, h: 3.6, r: 1.8 }]
  const box = shell(70, 40, 40, 2.5, main, { top: false, front: holes, left: grip, right: grip })
  box.position.z = 7
  g.add(box)
  ;[C.pink, C.lemon, C.sky].forEach((c, i) => g.add(torus(5.1, 0.6, c, { x: -18 + i * 18, y: 22, z: 27.3 })))
  // 玩具
  g.add(rbox(12, 12, 12, C.sky, { x: -18, y: 2.5, z: 7, ry: 0.3 }, 2))
  g.add(rbox(10, 10, 10, C.lemon, { x: -16, y: 14.6, z: 4, ry: 0.8 }, 2))
  g.add(ball(10, C.pink, { x: 6, y: 12.5, z: 9 }))
  g.add(ball(7, C.mint, { x: 20, y: 9.5, z: 0 }))
  g.add(rbox(14, 8, 8, C.red, { x: 18, y: 2.5, z: 17 }, 2.5))
  g.add(cyl(0.8, 0.8, 30, C.lemon, { x: 4, y: 3, z: 0, rz: 0.4 }, 8))
  g.add(ball(3.2, C.lemon, { x: -1.8, y: 32.5, z: 0 }))
  // 盖子：铰链在后沿上方，掀开后略向后倒
  const lid = new THREE.Group()
  lid.add(rbox(70, 3, 40, sub, { z: 20 }, 1.4))
  lid.position.set(0, 40, -13)
  lid.rotation.x = -(Math.PI / 2 + 0.26)
  g.add(lid)
  return g
}

/** 木马：头朝 +x */
function rockingHorse(p: string[]) {
  const [main, sub, acc] = p
  const wood = shade(main, -0.12)
  const g = new THREE.Group()
  const R0 = 120
  const a = Math.asin(38 / R0)
  for (const z of [-12, 12]) g.add(torus(R0, 2, wood, { y: R0 + 2, z, rz: -Math.PI / 2 - a }, a * 2))
  for (const x of [-30, 30]) g.add(barZ(-12, 12, R0 + 2 - Math.sqrt(R0 * R0 - x * x), x, 1.5, wood))
  // 腿
  for (const x of [-16, 16])
    for (const s of [-1, 1]) {
      const ry = R0 + 2 - Math.sqrt(R0 * R0 - x * x)
      g.add(rod3([x, 38, s * 5], [x * 1.12, ry, s * 12], 2.2, main))
    }
  // 身体
  const body = capsule(11, 26, main)
  body.position.set(0, 44, 0)
  body.rotation.z = Math.PI / 2
  g.add(body)
  const neck = capsule(7, 16, main)
  neck.position.set(22, 56, 0)
  neck.rotation.z = -0.5
  g.add(neck)
  const head = capsule(7.5, 12, main)
  head.position.set(33, 66, 0)
  head.rotation.z = -1.2
  g.add(head)
  g.add(ball(6.4, shade(main, 0.08), { x: 41, y: 62.5 }))
  for (const s of [-1, 1]) g.add(cyl(0.3, 2.6, 6, main, { x: 28, y: 73, z: s * 4, rx: s * 0.2 }, 8))
  // 鬃毛 + 尾巴
  for (let i = 0; i < 5; i++) g.add(ball(3.4, acc, { x: 14 + i * 3.2, y: 50 + i * 5, z: 0 }))
  const tail = capsule(3, 12, acc)
  tail.position.set(-27, 46, 0)
  tail.rotation.z = 0.8
  g.add(tail)
  // 鞍 + 把手
  g.add(rbox(18, 3, 23, sub, { x: -2, y: 53.4 }, 1.2))
  g.add(barZ(-11, 11, 67, 30, 1.2, wood))
  for (const s of [-1, 1]) g.add(ball(2, wood, { x: 30, y: 67, z: s * 11 }))
  return g
}

/** 小帐篷（印第安风圆锥帐） */
function teepee(p: string[]) {
  const [fabric, pole, acc] = p
  const g = new THREE.Group()
  const mat = toon(fabric).clone()
  mat.side = THREE.DoubleSide
  const cone = new THREE.Mesh(new THREE.ConeGeometry(52, 140, 24, 1, true, 0.5, Math.PI * 2 - 1), mat)
  cone.position.y = 70
  cone.castShadow = true
  cone.receiveShadow = true
  cone.userData.noOutline = true
  g.add(cone)
  g.add(torus(52, 1.4, acc, { y: 3, rx: Math.PI / 2, rz: 0.5 - 1.5 * Math.PI }, Math.PI * 2 - 1))
  for (const th of [0.62, -0.62, 1.9, -1.9, Math.PI]) {
    const b: V3 = [56 * Math.sin(th), 0, 56 * Math.cos(th)]
    const k = 156 / 140
    g.add(rod3(b, [b[0] * (1 - k), 156, b[2] * (1 - k)], 1.3, pole))
  }
  for (const s of [-1, 1]) g.add(ball(2.6, acc, { x: s * 12.5, y: 70, z: 22.8 }))
  // 小旗
  g.add(rbox(10, 6, 0.6, acc, { x: 5, y: 146, z: 0 }, 0.3))
  // 里面：地垫 + 坐垫
  g.add(puck(44, 2, shade(fabric, 0.06)))
  g.add(puck(13, 8, acc, { x: -10, y: 1.5, z: -8 }))
  return g
}

/** 室内滑梯：后面台阶上，前面滑下 */
function slide(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(4, 71, 50, main, { x: s * 22, z: -50 }, 2))
    const disc = cyl(8, 8, 0.8, acc, {}, 20)
    disc.position.set(s * 24.5, 36, -50)
    disc.rotation.z = Math.PI / 2
    g.add(disc)
    g.add(rbox(4, 30, 4, main, { x: s * 22, y: 70, z: -27 }, 1.5))
    g.add(ball(3.2, acc, { x: s * 22, y: 101, z: -27 }))
  }
  const steps: [number, number][] = [
    [14, -68],
    [32, -58],
    [50, -48],
  ]
  for (const [y, z] of steps) g.add(rbox(40, 4, 14, sub, { y, z }, 1.5))
  g.add(rbox(44, 5, 26, main, { y: 66, z: -38 }, 1.5))
  g.add(barX(-22, 22, 92, -27, 1.6, acc))
  // 滑道：铰点在平台前沿，往前下倾
  const phi = 0.6
  const L = 66 / Math.sin(phi)
  const chute = new THREE.Group()
  chute.add(rbox(36, 2.5, L, acc, { y: -2.5, z: L / 2 }, 1))
  for (const s of [-1, 1]) chute.add(rbox(3, 9, L, shade(acc, -0.06), { x: s * 19.5, y: -2.5, z: L / 2 }, 1.4))
  chute.position.set(0, 71, -25)
  chute.rotation.x = phi
  g.add(chute)
  const endZ = -25 + L * Math.cos(phi)
  g.add(rbox(36, 3, 10, acc, { y: 0.3, z: endZ + 3 }, 1))
  for (const s of [-1, 1]) g.add(rbox(3, 7, 10, shade(acc, -0.06), { x: s * 19.5, y: 0.3, z: endZ + 3 }, 1.4))
  return g
}

/** 儿童床（小屋框 + 护栏） */
function kidBed(p: string[]) {
  const [frame, duvet, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(4, 122, 4, frame, { x: sx * 48, z: sz * 98 }, 1.2))
  g.add(rbox(92, 12, 192, frame, { y: 4 }, 2))
  g.add(rbox(90, 14, 188, C.white, { y: 16 }, 5))
  g.add(rbox(40, 9, 30, acc, { y: 30, z: -76, rx: 0.08 }, 4))
  g.add(rbox(94, 8, 120, duvet, { y: 28, z: 32 }, 4))
  g.add(rbox(94, 3, 14, shade(duvet, 0.08), { y: 35.5, z: -21 }, 1.4))
  g.add(rbox(90, 30, 3, frame, { y: 16, z: -96.5 }, 1))
  g.add(rbox(90, 18, 3, frame, { y: 16, z: 96.5 }, 1))
  // 护栏：-x 整条，+x 床尾留口
  const rail = (x: number, z0: number, z1: number) => {
    g.add(rbox(3, 3, z1 - z0, frame, { x, y: 44, z: (z0 + z1) / 2 }, 1))
    for (let z = z0 + 8; z < z1 - 4; z += 16) g.add(cyl(1, 1, 28, frame, { x, y: 16, z }, 8))
  }
  rail(-48, -96, 96)
  rail(48, -96, 24)
  g.add(rbox(4, 46, 4, frame, { x: 48, y: 0, z: 24 }, 1.2))
  // 屋顶
  for (const s of [-1, 1]) {
    g.add(rbox(4, 4, 196, frame, { x: s * 48, y: 118 }, 1.2))
    for (const z of [-98, 98]) g.add(rod3([s * 48, 120, z], [0, 160, z], 2, frame))
  }
  g.add(rbox(4, 4, 200, frame, { y: 158 }, 1.2))
  // 屋脊下挂一串小绒球
  const cols = [C.pink, C.lemon, C.mint, C.sky, C.lilac, C.peach]
  for (let i = 0; i < 6; i++) {
    const z = -75 + i * 30
    g.add(cyl(0.3, 0.3, 10, C.ink, { y: 148, z }, 4))
    g.add(ball(3.2, cols[i], { y: 146, z }))
  }
  return g
}

// =====================================================================
// 素材表
// =====================================================================

const CUTE_KIDS: Pal[] = [
  ['cute', C.woodL, C.pink, C.mint],
  ['cute', C.white, C.sky, C.lemon],
  ['cute', C.white, C.sakura, C.lilac],
  ['nordic', N.oak, N.sage, N.mustard],
  ['nordic', N.white, N.blue, N.oak],
  ['modern', M.white, M.light, M.char],
]

const BEDS3: Pal[] = [
  ['cute', C.woodL, C.pink, C.lemon],
  ['cute', C.white, C.sky, C.pink],
  ['nordic', N.oak, N.blue, N.mustard],
  ['nordic', N.white, N.sage, N.oak],
  ['modern', M.char, M.light, M.silver],
  ['industrial', I.iron, I.concrete, I.rust],
]

const CUBE: Pal[] = [
  ['cute', C.white, C.sakura, C.mint],
  ['cute', C.woodL, C.sky, C.lemon],
  ['nordic', N.white, N.linen, N.sage],
  ['nordic', N.oak, N.gray, N.mustard],
  ['modern', M.char, M.gray, M.light],
  ['industrial', I.walnut, I.leather, I.concrete],
]

const cube = (id: string, label: string, c: number, r: number): AssetDef => {
  const w = c * 33 + (c - 1) * 3 + 8
  const h = r * 33 + (r - 1) * 3 + 8.4
  return A({ id, name: '格子柜', family: 'cube-shelf', sizeLabel: label, category: 'storage', w, d: 39, h, surface: h, build: (p) => cubeShelf(p, c, r).g }, CUBE)
}

/** 和 drawerTower 里的高度算法一致 */
const towerH = (n: number) => 8 + n * 19.2 + 2

export const ROOMS: AssetDef[] = [
  // ---- 客厅 ----
  A({ id: 'lv-sofa-l-left', name: 'L 形转角沙发', family: 'sofa-l', sizeLabel: '贵妃位在左', category: 'living', w: 240, d: 160, h: 80, build: (p) => sofaL(p, -1) }, UPH),
  A({ id: 'lv-sofa-l-right', name: 'L 形转角沙发', family: 'sofa-l', sizeLabel: '贵妃位在右', category: 'living', w: 240, d: 160, h: 80, build: (p) => sofaL(p, 1) }, UPH),
  A(
    { id: 'lv-sofa-low', name: '极简低沙发', category: 'living', w: 220, d: 95, h: 69, build: sofaLow },
    [
      ['modern', M.char, M.light, M.silver],
      ['modern', M.light, M.char, M.white],
      ['modern', M.white, M.gray, M.walnut],
      ['nordic', N.linen, N.blue, N.mustard],
      ['nordic', N.gray, N.sage, N.white],
    ],
  ),
  A(
    { id: 'lv-sofa-bed', name: '沙发床', category: 'living', w: 190, d: 95, h: 86, build: sofaBed },
    [
      ['cute', C.sky, C.pink, C.woodL],
      ['cute', C.pink, C.lemon, C.white],
      ['nordic', N.gray, N.mustard, N.oak],
      ['japanese', J.ai, J.washi, J.wood],
      ['industrial', I.leather, I.concrete, I.walnut],
      ['retro', R.olive, R.orange, R.caramel],
    ],
  ),
  A(
    { id: 'lv-rocker', name: '摇椅', category: 'living', w: 66, d: 90, h: 95, build: rocker },
    [
      ['nordic', N.oak, N.linen, N.mustard],
      ['nordic', N.white, N.gray, N.blue],
      ['cute', C.woodL, C.pink, C.lemon],
      ['retro', R.caramel, R.mustard, R.teal],
      ['japanese', J.wood, J.tatami, J.shu],
    ],
  ),
  A(
    { id: 'lv-bean-pear', name: '梨形豆袋', family: 'beanbag', sizeLabel: '梨形', category: 'living', w: 70, d: 70, h: 85, build: beanPear },
    [
      ['cute', C.lilac, C.lemon, C.white],
      ['cute', C.mint, C.pink, C.white],
      ['nordic', N.sage, N.mustard, N.white],
      ['modern', M.gray, M.black, M.white],
      ['retro', R.orange, R.cream, R.teal],
      ['industrial', I.leather, I.iron, I.concrete],
    ],
  ),
  A(
    { id: 'lv-pouf', name: '圆脚凳', category: 'living', w: 50, d: 50, h: 38, build: pouf },
    [
      ['cute', C.sakura, C.pink, C.lemon],
      ['cute', C.sky, C.white, C.pink],
      ['nordic', N.linen, N.oak, N.gray],
      ['modern', M.light, M.char, M.black],
      ['retro', R.mustard, R.caramel, R.cream],
      ['industrial', I.leather, I.walnut, I.iron],
    ],
  ),
  A({ id: 'lv-tv-120', name: '低矮电视柜', family: 'lv-tv-low', sizeLabel: '120', category: 'living', w: 120, d: 40, h: 42, surface: 42, build: (p) => tvLow(p, 120) }, CAB),
  A({ id: 'lv-tv-180', name: '低矮电视柜', family: 'lv-tv-low', sizeLabel: '180', category: 'living', w: 180, d: 40, h: 42, surface: 42, build: (p) => tvLow(p, 180) }, CAB),
  A(
    { id: 'lv-tv-retro', name: '昭和电视柜', category: 'living', w: 120, d: 46, h: 50, surface: 50, build: tvRetro },
    [
      ['retro', R.caramel, R.cream, R.orange],
      ['retro', '#7a4a2a', R.cream, R.mustard],
      ['retro', R.teal, R.cream, R.mustard],
      ['retro', R.caramel, R.mustard, R.red],
    ],
  ),
  A({ id: 'lv-sideboard', name: '边柜', category: 'living', w: 140, d: 46, h: 80, surface: 80, build: sideboard }, CAB),
  A(
    { id: 'lv-sideboard-nordic', name: '细腿边柜', category: 'living', w: 160, d: 43, h: 75, surface: 75, build: sideboardNordic },
    [
      ['nordic', N.white, N.oak, N.oak],
      ['nordic', N.oak, N.oakL, N.oak],
      ['nordic', N.sage, N.oakL, N.oak],
      ['modern', M.char, M.walnut, M.black],
      ['modern', M.white, M.light, M.black],
    ],
  ),
  A({ id: 'lv-display', name: '玻璃展示柜', category: 'living', w: 80, d: 42, h: 180, surface: 180, build: displayCabinet }, [
    ['cute', C.white, C.sky, C.pink],
    ['cute', C.woodL, C.sakura, C.mint],
    ['nordic', N.oak, N.blue, N.mustard],
    ['modern', M.black, M.light, M.silver],
    ['retro', R.caramel, R.teal, R.mustard],
    ['industrial', I.iron, I.concrete, I.rust],
  ]),
  cube('lv-cube-2x2', '2×2', 2, 2),
  cube('lv-cube-3x3', '3×3', 3, 3),
  cube('lv-cube-4x4', '4×4', 4, 4),
  A({ id: 'lv-window-bench', name: '窗边长椅', category: 'living', w: 140, d: 46, h: 78, build: windowBench }, [
    ['cute', C.white, C.sakura, C.lemon],
    ['cute', C.woodL, C.sky, C.pink],
    ['nordic', N.white, N.linen, N.blue],
    ['nordic', N.oak, N.gray, N.mustard],
    ['japanese', J.hinoki, J.tatami, J.ai],
  ]),

  // ---- 卧室 ----
  A({ id: 'bd-bunk', name: '双层床', category: 'bedroom', w: 210, d: 105, h: 152, build: bunkBed }, BEDS3),
  A({ id: 'bd-loft', name: '阁楼床（下有书桌）', category: 'bedroom', w: 210, d: 105, h: 188, surface: 73, surfaceShape: [rectPoly(-97, -45, 46, 7)], build: loftBed }, BEDS3),
  A({ id: 'bd-foot-bench', name: '床尾凳', category: 'bedroom', w: 120, d: 40, h: 45, surface: 45, build: footBench }, [
    ['cute', C.woodL, C.pink, C.white],
    ['cute', C.white, C.sky, C.lemon],
    ['nordic', N.oak, N.linen, N.oakL],
    ['modern', M.black, M.gray, M.silver],
    ['retro', R.caramel, R.teal, R.cream],
    ['industrial', I.iron, I.leather, I.walnut],
  ]),
  A({ id: 'bd-vanity', name: '梳妆台', category: 'bedroom', w: 90, d: 45, h: 147, surface: 75, surfaceShape: [rectPoly(-44, -12, 44, 21.5)], build: vanity }, [
    ['cute', C.white, C.pink, C.lemon],
    ['cute', C.sakura, C.white, C.lilac],
    ['nordic', N.oak, N.white, N.oak],
    ['modern', M.white, M.silver, M.black],
    ['retro', R.caramel, R.cream, R.mustard],
  ]),
  A({ id: 'bd-coat-rack', name: '衣帽架', category: 'bedroom', w: 50, d: 50, h: 178, build: coatRack }, [
    ['cute', C.white, C.pink, C.sky],
    ['nordic', N.oak, N.linen, N.mustard],
    ['modern', M.black, M.gray, M.light],
    ['industrial', I.iron, I.leather, I.rust],
    ['retro', R.caramel, R.mustard, R.red],
  ]),
  A({ id: 'bd-clothes-rail', name: '移动挂衣架', category: 'bedroom', w: 122, d: 56, h: 154, build: clothesRail }, [
    ['cute', C.steel, C.pink, C.sky],
    ['cute', C.white, C.lemon, C.lilac],
    ['nordic', N.white, N.sage, N.mustard],
    ['modern', M.black, M.gray, M.white],
    ['industrial', I.iron, I.leather, I.rust],
  ]),
  A({ id: 'bd-tall-chest', name: '高斗柜', category: 'bedroom', w: 62, d: 47, h: 130, surface: 130, build: tallChest }, CAB),
  A({ id: 'bd-screen', name: '折叠屏风', category: 'bedroom', w: 152, d: 30, h: 164, build: screen }, [
    ['cute', C.white, C.sakura, C.pink],
    ['cute', C.woodL, C.cream, C.sky],
    ['japanese', J.dark, J.washi, J.shu],
    ['japanese', J.hinoki, J.washi, J.ai],
    ['nordic', N.oak, N.linen, N.sage],
    ['modern', M.black, M.light, M.gray],
  ]),

  // ---- 收纳 ----
  ...[3, 5].map((n) =>
    A({ id: `st-drawer-${n}`, name: '抽屉收纳箱塔', family: 'st-drawer-tower', sizeLabel: `${n} 层`, category: 'storage', w: 41, d: 46, h: towerH(n), surface: towerH(n), build: (p) => drawerTower(p, n).g }, [
      ['cute', C.white, C.pink, C.sky],
      ['cute', C.white, C.mint, C.lemon],
      ['nordic', N.white, N.oakL, N.gray],
      ['modern', M.white, M.light, M.light],
      ['modern', M.char, M.gray, M.gray],
    ]),
  ),
  ...([
    [3, 90],
    [5, 180],
  ] as [number, number][]).map(([n, h]) =>
    A({ id: `st-steel-rack-${n}`, name: '钢架置物架', family: 'st-steel-rack', sizeLabel: `${n} 层`, category: 'storage', w: 90, d: 45, h, surface: h, build: (p) => steelRack(p, n, h) }, [
      ['modern', C.steel, M.silver, M.silver],
      ['modern', M.black, M.char, M.char],
      ['industrial', I.steel, I.iron, I.iron],
      ['cute', C.white, C.sakura, C.sakura],
      ['cute', C.pink, C.white, C.white],
      ['nordic', N.gray, N.white, N.white],
    ]),
  ),
  ...([
    [3, 100],
    [5, 180],
  ] as [number, number][]).map(([n, h]) =>
    A({ id: `st-pipe-shelf-${n}`, name: '水管置物架', family: 'st-pipe-shelf', sizeLabel: `${n} 层`, category: 'storage', w: 100, d: 35, h, surface: h, build: (p) => pipeShelf(p, n, h) }, [
      ['industrial', I.walnut, I.iron, I.iron],
      ['industrial', I.leather, I.iron, I.rust],
      ['industrial', N.oak, I.iron, I.steel],
      ['modern', M.walnut, M.black, M.black],
    ]),
  ),
  A({ id: 'st-slim-cart', name: '窄缝收纳推车', category: 'storage', w: 18, d: 50, h: 85, build: slimCart }, [
    ['cute', C.white, C.pink, C.mint],
    ['cute', C.sky, C.white, C.lemon],
    ['nordic', N.white, N.sage, N.oakL],
    ['modern', M.white, M.char, M.gray],
    ['modern', M.black, M.light, M.silver],
  ]),
  A({ id: 'st-bookcase-low', name: '书柜', family: 'st-bookcase', sizeLabel: '矮款 80', category: 'storage', w: 81, d: 31, h: 90, surface: 90, build: (p) => bookcase(p, 80, 90, 30, 1, 3, 3) }, CAB),
  A({ id: 'st-bookcase-wide', name: '书柜', family: 'st-bookcase', sizeLabel: '宽款 160', category: 'storage', w: 161, d: 33, h: 120, surface: 120, build: (p) => bookcase(p, 160, 120, 32, 4, 3, 5) }, CAB),
  A({ id: 'st-magazine', name: '杂志架', category: 'storage', w: 44, d: 30, h: 70, build: magazineRack }, [
    ['cute', C.woodL, C.pink, C.sky],
    ['cute', C.white, C.mint, C.lemon],
    ['nordic', N.oak, N.blue, N.mustard],
    ['modern', M.black, M.light, M.gray],
    ['retro', R.caramel, R.orange, R.teal],
  ]),
  A({ id: 'st-baskets', name: '收纳篮组', category: 'storage', w: 92, d: 36, h: 30, build: basketSet }, [
    ['cute', C.woodL, C.pink, C.sky],
    ['nordic', N.oakL, N.sage, N.linen],
    ['japanese', J.hinoki, J.ai, J.washi],
    ['modern', M.light, M.char, M.white],
    ['industrial', I.concrete, I.leather, I.rust],
  ]),
  A({ id: 'st-kaidan', name: '階段箪笥', category: 'storage', w: 150, d: 47, h: 180, surface: 45, surfaceShape: [rectPoly(37.5, -23, 75, 23)], build: kaidan }, [
    ['japanese', J.wood, J.hinoki, J.sumi],
    ['japanese', J.dark, J.wood, J.sumi],
    ['japanese', J.hinoki, J.washi, J.dark],
    ['retro', R.caramel, R.cream, M.black],
  ]),

  // ---- 儿童 ----
  A({ id: 'kid-crib', name: '婴儿床', family: 'kid-crib', sizeLabel: '经典', category: 'kids', w: 128, d: 68, h: 96, build: crib }, CUTE_KIDS),
  A({ id: 'kid-desk', name: '儿童书桌', category: 'kids', w: 90, d: 50, h: 58, surface: 58, build: kidDesk }, CUTE_KIDS),
  A({ id: 'kid-chair', name: '儿童椅', category: 'kids', w: 36, d: 34, h: 64, build: kidChair }, CUTE_KIDS),
  A({ id: 'kid-toybox', name: '玩具箱', category: 'kids', w: 72, d: 56, h: 79, build: toyBox }, CUTE_KIDS),
  A({ id: 'kid-horse', name: '木马', category: 'kids', w: 84, d: 32, h: 80, build: rockingHorse }, [
    ['cute', C.white, C.pink, C.lemon],
    ['cute', C.lemon, C.sky, C.pink],
    ['nordic', N.oak, N.sage, N.linen],
    ['retro', R.red, R.mustard, R.cream],
  ]),
  A({ id: 'kid-teepee', name: '小帐篷', category: 'kids', w: 120, d: 120, h: 158, build: teepee }, [
    ['cute', C.white, C.woodL, C.pink],
    ['cute', C.sakura, C.woodL, C.lemon],
    ['nordic', N.linen, N.oak, N.sage],
    ['nordic', N.gray, N.oak, N.mustard],
    ['retro', R.cream, R.caramel, R.orange],
  ]),
  A({ id: 'kid-slide', name: '室内滑梯', category: 'kids', w: 54, d: 150, h: 104, build: slide }, [
    ['cute', C.white, C.mint, C.pink],
    ['cute', C.sakura, C.lemon, C.sky],
    ['nordic', N.white, N.oakL, N.sage],
    ['modern', M.light, M.white, M.gray],
  ]),
  A({ id: 'kid-bed', name: '儿童床', family: 'kid-bed', sizeLabel: '小屋', category: 'kids', w: 100, d: 200, h: 162, build: kidBed }, [
    ['cute', C.white, C.pink, C.lemon],
    ['cute', C.woodL, C.sky, C.mint],
    ['nordic', N.oak, N.sage, N.mustard],
    ['nordic', N.white, N.blue, N.linen],
    ['modern', M.char, M.light, M.white],
  ]),
]

