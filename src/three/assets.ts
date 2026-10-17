// 素材库：全部程序化生成的可爱家具。基础家具在本文件，扩展素材在 packs/*.ts。
// 约定见 kit.ts 开头。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, leaf, plate, puck, rbox, shade, toon, torus, tray } from './toon'
import { fridgeSpotModel, washerSpotModel } from './appliances'
import { holePanel, C, G, S, carcass, drawerBox, drawerLevel, ellipsePoly, flapDoor, glow, hangingPipe, hingedDoor, legs, pipeHook, rectPoly, rng, shell, shelvesIn, type AssetDef, type StyleTag } from './kit'
import { PACKS } from './packs'
import { soft, type SoftFn } from './packs/more-variety'
import { applyDims, warnIfDimsStale } from './dims'
import { DIMS } from './dims.generated'
import { GENERATED_TAGS } from './tags.generated'
import { TAXONOMY } from './taxonomy.generated'

export { C, CATEGORY_LABELS, STYLE_LABELS, type AssetCategory, type AssetDef, type StyleTag } from './kit'

// ---------- 客厅 ----------

function sofa(w: number, p: string[]) {
  const [main, sub, acc] = p
  const d = 86
  const g = G(legs(w - 10, d - 10, 10, C.woodD, 2.5, 4))
  g.add(rbox(w, 22, d, shade(main, -0.06), { y: 10 }, 6))
  const arm = 20
  for (const s of [-1, 1]) g.add(rbox(arm, 34, d, main, { x: s * (w / 2 - arm / 2), y: 22 }, 9))
  g.add(rbox(w - arm * 2 + 4, 42, 24, main, { y: 26, z: -d / 2 + 14, rx: -0.12 }, 10))
  const n = w > 120 ? 2 : 1
  const cw = (w - arm * 2) / n
  for (let i = 0; i < n; i++) g.add(rbox(cw - 2, 13, d - 28, shade(main, 0.04), { x: -w / 2 + arm + cw * (i + 0.5), y: 31, z: 11 }, 6))
  g.add(rbox(32, 30, 11, sub, { x: -w / 2 + arm + 22, y: 42, z: -d / 2 + 34, rx: -0.25, rz: 0.2 }, 5))
  if (n > 1) {
    const heart = rbox(28, 28, 10, acc, { x: w / 2 - arm - 22, y: 42, z: -d / 2 + 34, rx: -0.25, rz: -0.25 }, 5)
    g.add(heart)
  }
  return g
}

function armchair(p: string[]) {
  const [main, sub] = p
  const w = 80
  const d = 80
  const g = G(legs(w - 12, d - 12, 12, C.woodD, 2.5, 4))
  g.add(rbox(w, 18, d, shade(main, -0.06), { y: 12 }, 7))
  for (const s of [-1, 1]) g.add(rbox(16, 30, d - 4, main, { x: s * (w / 2 - 8), y: 26 }, 8))
  g.add(rbox(w - 26, 46, 20, main, { y: 26, z: -d / 2 + 12, rx: -0.15 }, 10))
  g.add(rbox(w - 34, 12, d - 26, shade(main, 0.05), { y: 30, z: 10 }, 6))
  g.add(rbox(28, 28, 10, sub, { y: 40, z: -d / 2 + 30, rx: -0.3 }, 5))
  return g
}

function coffeeTable(p: string[]) {
  const [top] = p
  const g = new THREE.Group()
  g.add(puck(42, 5, top, { y: 33 }))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    g.add(cyl(2.4, 2, 33, shade(top, -0.15), { x: Math.cos(a) * 28, z: Math.sin(a) * 28 }, 12))
  }
  return g
}

/** 柜内可摆区域：柜体外宽 w、外深 dc（柜体中心在 z = zc），板厚 t */
function cabInner(w: number, dc: number, zc: number, t = 1.8) {
  return rectPoly(-w / 2 + t + 0.4, zc - dc / 2 + t + 0.4, w / 2 - t - 0.4, zc + dc / 2 - 0.8)
}

// 电视柜：空心柜体分三格，每格一扇往下翻的门（关着时和以前一样是三块门板）
const TV_BOARD = { w: 150, d: 42, y0: 8, h: 36 }
const TV_BOARD_SURF: NonNullable<AssetDef['surfaces']> = (() => {
  const { w, d, y0, h } = TV_BOARD
  const dc = d - 1.6
  const z0 = -0.8 - dc / 2 + 1.8 + 0.4
  const z1 = -0.8 + dc / 2 - 0.8
  const cells = [
    [-w / 2 + 2.2, -w / 6 - 1.3],
    [-w / 6 + 1.3, w / 6 - 1.3],
    [w / 6 + 1.3, w / 2 - 2.2],
  ].map(([a, b]) => rectPoly(a, z0, b, z1))
  return [{ y: y0 + 1.8, h: h - 3.6 - 0.5, inside: true, shape: cells }]
})()
function tvBoard(p: string[]) {
  const [main] = p
  const { w, d, y0, h } = TV_BOARD
  const g = G(legs(w - 10, d - 10, y0, C.woodD, 2, 4))
  const body = carcass(w, h, d - 1.6, main)
  body.position.set(0, y0, -0.8)
  for (const s of [-1, 1]) body.add(rbox(1.8, h - 3.6, d - 3.4, main, { x: (s * w) / 6, y: 1.8, z: 0.1 }, 0.3))
  g.add(body)
  for (const s of [-1, 0, 1]) g.add(flapDoor({ x0: (s * w) / 3 - w / 6, x1: (s * w) / 3 + w / 6, y0, y1: y0 + h, z: d / 2, color: shade(main, s === 0 ? -0.08 : 0.04), hinge: 'bottom', knob: false }))
  return g
}

function rug(w: number, d: number, p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  const base = rbox(w, 1.2, d, main, {}, 0.55)
  base.castShadow = false
  g.add(base)
  const inner = rbox(w - 24, 1.7, d - 24, sub, {}, 0.6)
  inner.castShadow = false
  inner.userData.noOutline = true
  g.add(inner)
  const core = rbox(w - 40, 2.2, d - 40, main, {}, 0.65)
  core.castShadow = false
  core.userData.noOutline = true
  g.add(core)
  return g
}

function roundRug(r: number, p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const a = puck(r, 1.2, main)
  a.castShadow = false
  g.add(a)
  const b = puck(r * 0.72, 1.7, sub)
  b.castShadow = false
  b.userData.noOutline = true
  g.add(b)
  const c = puck(r * 0.38, 2.2, acc)
  c.castShadow = false
  c.userData.noOutline = true
  g.add(c)
  return g
}

function floorLamp(p: string[]) {
  const [shadeColor] = p
  const g = new THREE.Group()
  g.add(puck(15, 4, C.ink))
  g.add(cyl(1.4, 1.4, 130, C.ink, { y: 3 }, 10))
  const s = cyl(12, 20, 28, shadeColor, { y: 128 })
  s.material = toon(shadeColor, { emissive: 0.35 })
  g.add(s)
  return g
}

function bookshelf(p: string[]) {
  const [main] = p
  const w = 80
  const d = 30
  const h = 176
  const g = new THREE.Group()
  const t = 3
  for (const s of [-1, 1]) g.add(rbox(t, h, d, main, { x: s * (w / 2 - t / 2) }, 1))
  g.add(rbox(w, t, d, main, { y: h - t }, 1))
  g.add(rbox(w - 2, h - 2, 1.5, shade(main, -0.08), { y: 1, z: -d / 2 + 1 }, 0.5))
  const rows = 5
  const rh = (h - t) / rows
  const rand = rng(7)
  const colors = [C.pink, C.sky, C.mint, C.lemon, C.lilac, C.peach, C.red, C.white]
  for (let i = 0; i < rows; i++) {
    const y = i * rh
    g.add(rbox(w - t * 2, t, d - 1, main, { y }, 0.8))
    if (i === rows - 1) {
      // 顶层摆小熊
      g.add(bearBody(0.5, C.peach, { x: 14, y: y + t, z: 2 }))
      continue
    }
    let x = -w / 2 + t + 2
    const end = w / 2 - t - 2
    while (x < end - 4) {
      const bw = 3 + Math.floor(rand() * 4)
      if (x + bw > end) break
      const bh = rh * (0.6 + rand() * 0.28)
      const lean = rand() < 0.08 ? 0.18 : 0
      g.add(rbox(bw - 0.4, bh, d * 0.72, colors[Math.floor(rand() * colors.length)], { x: x + bw / 2, y: y + t, z: 1, rz: lean }, 0.6))
      x += bw
      if (rand() < 0.12) x += 6
    }
  }
  return g
}

function monstera(p: string[]) {
  const [pot] = p
  const g = new THREE.Group()
  g.add(cup(17, 13, 30, 2.2, pot))
  g.add(cyl(15, 15, 1, '#8b6a4f', { y: 25 }))
  const rand = rng(3)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand()
    const h = 55 + rand() * 45
    // 叶柄水平伸出 + 叶片半径不超过占地半径（35），否则贴墙、贴家具时必然穿模
    const tilt = Math.min(0.25 + rand() * 0.35, Math.asin(Math.min(1, 19 / h)))
    const stem = cyl(0.9, 0.9, h, C.leafD, { y: 26, x: 0, z: 0 }, 6)
    stem.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)
    stem.position.set((Math.cos(a) * Math.sin(tilt) * h) / 2, 26 + (Math.cos(tilt) * h) / 2, (Math.sin(a) * Math.sin(tilt) * h) / 2)
    stem.userData.noOutline = true
    g.add(stem)
    const tip = { x: Math.cos(a) * Math.sin(tilt) * h, y: 26 + Math.cos(tilt) * h, z: Math.sin(a) * Math.sin(tilt) * h }
    const l = ball(14, i % 2 ? C.leaf : shade(C.leaf, 0.06), tip, [1, 0.18, 0.75])
    l.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5)
    g.add(l)
  }
  return g
}

/** 圆团懒人沙发：一整团软布，前面坐出浅窝、后背自然鼓起（以前是两颗球叠起来，像馒头盖了个盖） */
const beanbagF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 30
  if (y > 0) Y -= 16 * Math.exp(-((x / 0.5) ** 2 + ((z - 0.25) / 0.5) ** 2)) * y
  if (z < 0) Y += 20 * z * z * Math.max(0, y)
  const spill = 1 + 0.05 * Math.max(0, -y)
  return [x * 36 * spill, Math.max(0, Y - 6), z * 34 * spill]
}
function beanbag(p: string[]) {
  return G(soft(p[0], beanbagF, { wrinkle: 0.9, seed: 4 }))
}

// ---------- 餐厅 ----------

function diningTable(w: number, p: string[]) {
  const [top] = p
  const d = 80
  const g = new THREE.Group()
  g.add(rbox(w, 4, d, top, { y: 68 }, 1.6))
  g.add(legs(w, d, 68, shade(top, -0.12), 2.6, 9, false))
  return g
}

function diningChair(p: string[]) {
  const [main, cushion] = p
  const g = new THREE.Group()
  // 座面（含坐垫）高 45.5：配 72cm 的餐桌留出 26cm 左右的落差（以前坐垫顶到 49.5，比常见餐椅高 4~5cm）
  g.add(legs(40, 40, 38, shade(main, -0.12), 1.8, 4))
  g.add(rbox(42, 4, 42, main, { y: 38 }, 1.5))
  g.add(rbox(36, 4, 34, cushion, { y: 41.5, z: 2 }, 2))
  for (const s of [-1, 1]) g.add(rbox(3, 40, 3, main, { x: s * 17, y: 40, z: -19 }, 1))
  g.add(rbox(40, 14, 3, main, { y: 66, z: -19 }, 1.5))
  return g
}

// ---------- 卧室 ----------

function bed(w: number, p: string[]) {
  const [duvet, sheet, frame] = p
  const d = 205
  const g = G(legs(w, d, 10, shade(frame, -0.12), 2.6, 6, false))
  g.add(rbox(w + 6, 16, d + 4, frame, { y: 10 }, 3))
  g.add(rbox(w + 8, 70, 8, frame, { z: -d / 2 - 2 }, 3.5))
  g.add(rbox(w - 2, 18, d - 4, sheet, { y: 24 }, 6))
  const pillows = w > 120 ? 2 : 1
  for (let i = 0; i < pillows; i++) {
    const pw = (w - 20) / pillows - 6
    const x = pillows === 1 ? 0 : (i - 0.5) * (pw + 8)
    g.add(rbox(pw, 12, 38, C.white, { x, y: 40, z: -d / 2 + 30, rx: -0.12 }, 6))
  }
  const dz = d - 64
  g.add(rbox(w + 4, 10, dz, duvet, { y: 40, z: d / 2 - dz / 2 }, 5))
  g.add(rbox(w + 4, 4, 18, shade(duvet, 0.08), { y: 49, z: d / 2 - dz + 9 }, 2))
  return g
}

// 床头柜：空心柜体 + 两层抽屉（拉出 0.6 深，里面能放东西）
const NIGHTSTAND_DRAWERS: [number, number][] = [
  [8, 26],
  [26, 44],
]
const nsDrawer = (y0: number, y1: number) => ({ x0: -21, x1: 21, y0, y1, z: 15.6, depth: 30 })
const NIGHTSTAND_SURF = NIGHTSTAND_DRAWERS.map(([a, b]) => drawerLevel(nsDrawer(a, b)))
function nightstand(p: string[]) {
  const [main] = p
  // 柜体略往后收，让抽屉面板和拉手也落在声明的 36cm 进深以内
  const g = G(legs(40, 34, 8, shade(main, -0.12), 1.6, 4))
  const body = carcass(42, 36, 32, main)
  body.position.set(0, 8, -2)
  g.add(body)
  const c = shade(main, 0.06)
  for (const [a, b] of NIGHTSTAND_DRAWERS) g.add(drawerBox({ ...nsDrawer(a, b), color: c, knob: false, front: (w, h) => [rbox(w, h, 1.6, c, { z: -0.8 }, 1), ball(1.5, C.woodD, { y: h / 2, z: 0.6 })] }))
  return g
}

// 衣柜：空心柜体，对开门（约 100° 转开），里面一根挂衣杆 + 杆上方一块层板
const WARDROBE = { w: 100, d: 58, h: 188, y0: 8, cw: 96, cd: 54, cz: -2, pipe: 158, shelf: 166 }
const WARDROBE_SURF: NonNullable<AssetDef['surfaces']> = (() => {
  const { y0, cw, cd, cz, pipe, shelf, h } = WARDROBE
  const inner = cabInner(cw, cd, cz)
  const ceil = h - 6 - 1.8
  return [
    { y: y0 + 1.8, h: shelf - 1.6 - y0 - 1.8 - 0.5, inside: true, shape: [inner] },
    { y: shelf, h: ceil - shelf - 0.5, inside: true, shape: [inner] },
    pipeHook(-cw / 2 + 1.8, cw / 2 - 1.8, pipe, cz + 1, pipe - y0 - 1.8 - 6),
  ]
})()
function wardrobe(p: string[]) {
  const [main, knob] = p
  const { w, d, h, y0, cw, cd, cz, pipe, shelf } = WARDROBE
  // 顶冠、门板、拉手都收在声明的 w × d 以内
  const g = G(legs(w, d, y0, shade(main, -0.12), 2, 6))
  const body = carcass(cw, h - 6 - y0, cd, main)
  body.position.set(0, y0, cz)
  body.add(shelvesIn(cw, cd, [shelf - y0], shade(main, 0.04)))
  g.add(body)
  g.add(hangingPipe(-cw / 2 + 1.8, cw / 2 - 1.8, pipe, cz + 1))
  g.add(rbox(w, 6, d - 2, shade(main, -0.06), { y: h - 6, z: -1 }, 2.5))
  const door = shade(main, 0.05)
  for (const s of [-1, 1]) {
    const left = s < 0
    // 竖条拉手（衣柜门高，圆钮太小看不清），在两扇门相接的一侧
    const panel = (pw: number, ph: number) => [rbox(pw, ph, 2, door, {}, 2), rbox(1.8, 26, 1.8, knob, { x: (left ? 1 : -1) * (pw / 2 - 4.5), y: 84 - y0 - 3, z: 1.6 }, 0.8)]
    g.add(hingedDoor({ x0: left ? -cw / 2 : 0, x1: left ? 0 : cw / 2, y0: y0 + 2, y1: h - 6.5, z: d / 2 - 1.2, hinge: left ? 'left' : 'right', color: door, th: 2, knob: false, panel }))
  }
  return g
}

function desk(p: string[]) {
  const [top, legColor] = p
  const w = 110
  const d = 56
  const g = new THREE.Group()
  g.add(rbox(w, 3.5, d, top, { y: 70 }, 1.2))
  g.add(rbox(38, 64, d - 6, legColor, { x: w / 2 - 22, y: 6 }, 2))
  // 抽屉柜底下的踢脚座（以前柜体悬在离地 6cm 处）
  g.add(rbox(34, 6.4, d - 12, shade(legColor, -0.12), { x: w / 2 - 22, z: -2 }, 1))
  g.add(rbox(4, 70, 4, legColor, { x: -w / 2 + 5, z: -d / 2 + 5 }, 1))
  g.add(rbox(4, 70, 4, legColor, { x: -w / 2 + 5, z: d / 2 - 5 }, 1))
  for (const y of [14, 34, 52]) {
    g.add(rbox(32, 15, 1.5, shade(legColor, 0.06), { x: w / 2 - 22, y, z: d / 2 - 3 + 0.7 }, 1))
    g.add(ball(1.4, C.woodD, { x: w / 2 - 22, y: y + 7.5, z: d / 2 - 1 }))
  }
  return g
}

function deskChair(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    // 五星脚收到半径 22（以前脚轮伸到 27，加上后仰的靠背，实际进深 58cm，比声明的 52 大）
    const spoke = rbox(4, 3, 22, C.ink, { x: Math.sin(a) * 11, y: 6, z: Math.cos(a) * 11, ry: a }, 1)
    g.add(spoke)
    g.add(ball(3, C.ink, { x: Math.sin(a) * 22, y: 3, z: Math.cos(a) * 22 }))
  }
  // 座面顶 47（以前 51，配 74cm 书桌偏高）
  g.add(cyl(2.2, 2.2, 32, C.steel, { y: 8 }, 10))
  g.add(rbox(48, 9, 46, main, { y: 38 }, 4.5))
  g.add(rbox(44, 52, 9, main, { y: 49, z: -19, rx: -0.1 }, 4.5))
  // 靠背支撑杆：从座下伸到靠背背面（以前靠背悬空，和座面之间没有任何连接）
  g.add(rbox(6, 22, 3, C.ink, { y: 36, z: -22.2, rx: -0.1 }, 1.2))
  // 猫耳
  for (const s of [-1, 1]) {
    const ear = cyl(0.1, 7, 11, main, { x: s * 15, y: 100, z: -21.5, rz: -s * 0.35 }, 4)
    ear.rotation.y = Math.PI / 4
    g.add(ear)
  }
  return g
}

// 五斗柜：空心柜体 + 三层抽屉（拉出 0.6 深，抽屉格能放东西）
const DRESSER_ROWS: [number, number][] = [
  [8, 33.3],
  [33.3, 58.7],
  [58.7, 84],
]
const drDrawer = (y0: number, y1: number) => ({ x0: -40, x1: 40, y0, y1, z: 19.6, depth: 37 })
const DRESSER_SURF = DRESSER_ROWS.map(([a, b]) => drawerLevel(drDrawer(a, b)))
function dresser(p: string[]) {
  const [main, knob] = p
  // 柜体往后收 4cm，抽屉面板和拉手落在声明的进深以内
  const g = G(legs(80, 44, 8, shade(main, -0.12), 2, 5))
  const body = carcass(80, 76, 40, main)
  body.position.set(0, 8, -2)
  g.add(body)
  const c = shade(main, 0.05)
  for (const [a, b] of DRESSER_ROWS)
    g.add(drawerBox({ ...drDrawer(a, b), color: c, knob: false, front: (w, h) => [rbox(w, h, 1.6, c, { z: -0.8 }, 1.5), ...[-1, 1].map((s) => ball(2, knob, { x: s * 18, y: h / 2, z: 0.6 }))] }))
  return g
}

// ---------- 和室 ----------

// 被炉，从下到上：炬燵敷布団（底垫）→ 桌架（四腿 + 框，框下挂加热器）→ 炬燵布団（盖在框上垂到底垫）→ 天板
const KOTATSU = {
  /** 底垫边长 */
  mat: 180,
  /** 桌架：框外边半宽、框顶高 */
  frameHalf: 36,
  frameTop: 38,
  /** 被子顶面高度（天板压在上面） */
  quiltTop: 40.6,
  /** 天板 */
  top: 80,
  topT: 2.5,
  topY: 41,
}

/**
 * 炬燵布団：沿桌框的圆角方形一周，按剖面曲线（从框顶往外翻、垂下、摊在底垫上）扫出一张曲面，
 * 四边对称，每边两道浅褶，四角下摆外扩。u ∈ [0,1) 绕一周，v ∈ [0,1] 从框顶内侧到下摆。中间被天板盖住，不用封。
 */
function kotatsuQuilt(color: string, pattern: string) {
  const rc = 10
  const a = KOTATSU.frameHalf - rc
  const arc = (Math.PI * rc) / 2
  const L = 8 * a + 4 * arc
  // 剖面：r 是离开桌框边缘往外的距离，y 是高度
  const y0 = KOTATSU.quiltTop
  const prof = new THREE.CatmullRomCurve3(
    (
      [
        [-8, y0],
        [-2, y0],
        [1.5, y0 - 0.5],
        [4, y0 - 3],
        [6, y0 - 7.5],
        [8, y0 - 15],
        [10.5, y0 - 23],
        [13.5, y0 - 31],
        [17.5, 5.2],
        [22.5, 3.4],
        [27, 2.9],
        [30, 2.45],
      ] as [number, number][]
    ).map(([r, y]) => new THREE.Vector3(r, y, 0)),
  )
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  /** 桌框边缘一圈上的点和外法线角：四条直边 + 四个圆角 */
  const rim = (u: number) => {
    let p = (((u % 1) + 1) % 1) * L
    for (let k = 0; k < 4; k++) {
      const th0 = (k * Math.PI) / 2
      const nx = Math.cos(th0)
      const nz = Math.sin(th0)
      if (p <= 2 * a) {
        const s = p - a
        return { x: nx * (a + rc) - nz * s, z: nz * (a + rc) + nx * s, th: th0, s }
      }
      p -= 2 * a
      if (p <= arc) {
        const th = th0 + p / rc
        return { x: (nx - nz) * a + Math.cos(th) * rc, z: (nz + nx) * a + Math.sin(th) * rc, th, s: a }
      }
      p -= arc
    }
    return { x: a + rc, z: -a, th: 0, s: -a }
  }
  const tmp = new THREE.Vector3()
  const surf = (u: number, v: number, out: THREE.Vector3) => {
    const { x, z, th, s } = rim(u)
    prof.getPoint(Math.min(1, Math.max(0, v)), tmp)
    // 四边一样：每条边在 ±a/2 处各一道浅褶（往下才出现），四角下摆整齐地外扩成三角
    const corner = Math.sin(2 * th) ** 2
    const hang = smooth(0.2, 0.8, v)
    const floor = smooth(0.65, 1, v)
    const pleat = Math.exp(-(((Math.abs(s) - a / 2) / 3.5) ** 2))
    const r = tmp.x + pleat * 1.1 * hang + corner * 7 * floor
    const y = tmp.y
    return out.set(x + Math.cos(th) * r, y, z + Math.sin(th) * r)
  }
  const pa = new THREE.Vector3()
  const pb = new THREE.Vector3()
  const pc = new THREE.Vector3()
  const e = 1e-3
  /** 曲面的一块（u0..u1 × v0..v1），off > 0 时沿外法线浮出（做花纹贴片） */
  const patch = (u0: number, u1: number, v0: number, v1: number, nu: number, nv: number, off: number) => {
    const pos: number[] = []
    const idx: number[] = []
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = u0 + ((u1 - u0) * i) / nu
        const v = v0 + ((v1 - v0) * j) / nv
        surf(u, v, pa)
        if (off) {
          surf(u + e, v, pb).sub(pa)
          surf(u, v + e, pc).sub(pa)
          pa.addScaledVector(pb.cross(pc).normalize(), off)
        }
        pos.push(pa.x, pa.y, pa.z)
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const k = j * (nu + 1) + i
        idx.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1)
      }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }
  const g = new THREE.Group()
  const quilt = new THREE.Mesh(patch(0, 1, 0, 1, 160, 30, 0), toon(color))
  quilt.castShadow = true
  quilt.receiveShadow = true
  g.add(quilt)
  // 格子：每条边两道竖条 + 一圈横条（横条浮得更高，交叉处不共面）
  const deco = (geo: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(geo, toon(pattern))
    m.userData.noOutline = true
    m.receiveShadow = true
    g.add(m)
  }
  for (let k = 0; k < 4; k++)
    for (const s of [-0.28, 0.28]) {
      const c = (k * (2 * a + arc) + a + s * a) / L
      const hw = 2.2 / L
      deco(patch(c - hw, c + hw, 0.06, 0.93, 2, 30, 0.35))
    }
  deco(patch(0, 1, 0.5, 0.56, 160, 3, 0.7))
  return g
}

function kotatsu(p: string[]) {
  const [quilt, wood, accent] = p
  const K = KOTATSU
  const g = new THREE.Group()
  // 1. 敷布団
  g.add(rbox(K.mat, 2, K.mat, shade(accent, -0.03), {}, 0.9))
  // 2. 桌架：四腿 + 框 + 吊着的加热器（被被子盖住，但结构是完整的）
  const frame = shade(wood, -0.08)
  const fh = K.frameHalf
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4.5, K.frameTop - 2, 4.5, frame, { x: sx * (fh - 3), y: 2, z: sz * (fh - 3) }, 0.8))
  for (const s of [-1, 1]) {
    g.add(rbox(fh * 2, 5, 2.5, frame, { y: K.frameTop - 5, z: s * (fh - 1.25) }, 0.6))
    g.add(rbox(2.5, 5, fh * 2 - 5, frame, { x: s * (fh - 1.25), y: K.frameTop - 5 }, 0.6))
    // 吊加热器的横档
    g.add(rbox(fh * 2 - 5, 2, 3, frame, { y: K.frameTop - 4.5, z: s * 10 }, 0.5))
  }
  g.add(rbox(28, 7.5, 28, C.steel, { y: K.frameTop - 12 }, 2))
  const grill = rbox(24, 0.6, 24, '#ff7a3a', { y: K.frameTop - 12.4 }, 0.25)
  grill.material = toon('#ff7a3a', { emissive: 0.8 })
  grill.userData.noOutline = true
  g.add(grill)
  for (const x of [-6, 0, 6]) g.add(rbox(1, 0.8, 26, shade(C.steel, -0.2), { x, y: K.frameTop - 13 }, 0.3))
  // 3. 被子
  g.add(kotatsuQuilt(quilt, accent))
  // 4. 天板
  g.add(rbox(K.top, K.topT, K.top, wood, { y: K.topY }, 1))
  return g
}

function chabudai(p: string[]) {
  const [top] = p
  const g = new THREE.Group()
  g.add(puck(40, 4, top, { y: 28 }))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(rbox(5, 28, 5, shade(top, -0.12), { x: Math.cos(a) * 26, z: Math.sin(a) * 26 }, 1))
  }
  return g
}

function futon(p: string[]) {
  const [cover, sheet] = p
  const w = 100
  const d = 210
  const g = new THREE.Group()
  g.add(rbox(w, 9, d, sheet, {}, 4))
  g.add(rbox(48, 10, 28, C.white, { y: 9, z: -d / 2 + 22 }, 5))
  const dz = d - 50
  g.add(rbox(w + 6, 10, dz, cover, { y: 9, z: d / 2 - dz / 2 }, 4.5))
  // 麻叶纹：几道浅色条纹
  for (let i = 0; i < 4; i++) g.add(plate(w + 6, 4, shade(cover, 0.12), { y: 19.3, z: d / 2 - 22 - i * 34 }))
  return g
}

function zabuton(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  g.add(rbox(55, 8, 55, main, {}, 3.6))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(1.8, shade(main, -0.2), { x: sx * 26, y: 4, z: sz * 26 }))
  g.add(ball(1.6, shade(main, -0.2), { y: 8.2 }))
  return g
}

function andon(p: string[]) {
  const [paper] = p
  const g = new THREE.Group()
  g.add(rbox(32, 4, 32, C.woodD, {}, 1))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 62, 2.4, C.woodD, { x: sx * 13, z: sz * 13 }, 0.5))
  g.add(rbox(32, 3, 32, C.woodD, { y: 60 }, 1))
  const shadeBox = rbox(25, 50, 25, paper, { y: 8 }, 1)
  shadeBox.material = toon(paper, { emissive: 0.55 })
  shadeBox.userData.noOutline = true
  g.add(shadeBox)
  return g
}

// ---------- 小物 ----------

function bearBody(s: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const g = new THREE.Group()
  const muzzle = shade(color, 0.12)
  g.add(ball(12, color, { y: 12 }, [1, 0.95, 0.9]))
  for (const sx of [-1, 1]) {
    g.add(ball(4.5, color, { x: sx * 9, y: 4.5, z: 6 }))
    g.add(ball(4, color, { x: sx * 11, y: 15, z: 3 }))
  }
  g.add(ball(10.5, color, { y: 30 }))
  for (const sx of [-1, 1]) {
    g.add(ball(4, color, { x: sx * 7.5, y: 38.5, z: -1 }))
    g.add(ball(2.2, muzzle, { x: sx * 7.5, y: 38.5, z: 1.5 }, [1, 1, 0.5]))
  }
  g.add(ball(4, muzzle, { y: 27.5, z: 8.5 }, [1.2, 0.85, 0.7]))
  g.add(ball(1.3, C.ink, { y: 29, z: 11.2 }))
  g.add(face(12, { y: 31, z: 9.6 }))
  g.add(ball(3, '#ff8fa8', { x: 3.5, y: 21, z: 8.5 }, [1.2, 0.7, 0.5]))
  g.scale.setScalar(s)
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return g
}

function catLoaf(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(34, 22, 26, main, {}, 10))
  for (const s of [-1, 1]) {
    const ear = cyl(0.2, 5, 8, main, { x: s * 9, y: 21, z: 2, rz: -s * 0.3 }, 4)
    ear.rotation.y = Math.PI / 4
    g.add(ear)
    g.add(ball(2.6, sub, { x: s * 10, y: 2.5, z: 12 }, [1, 0.7, 1]))
  }
  g.add(face(16, { y: 13, z: 13 }))
  g.add(ball(1, C.ink, { y: 10.5, z: 13.2 }))
  const tail = torus(9, 2.4, main, { x: 14, y: 4, z: -4, rx: Math.PI / 2 }, Math.PI * 0.9)
  g.add(tail)
  return g
}

function cactus(p: string[]) {
  const [pot] = p
  const g = new THREE.Group()
  g.add(cup(9, 7, 14, 1.4, pot))
  g.add(cyl(7.8, 7.8, 0.6, '#8b6a4f', { y: 11 }))
  g.add(capsule(6, 14, C.leaf, { y: 9 }))
  g.add(capsule(3, 5, C.leaf, { x: 7, y: 20, rz: -0.5 }))
  g.add(capsule(2.6, 4, C.leaf, { x: -6.5, y: 24, rz: 0.5 }))
  g.add(ball(3, C.pink, { y: 36.6 }, [1, 0.7, 1]))
  return g
}

function catTower(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(55, 5, 55, main, {}, 2))
  g.add(cyl(5.5, 5.5, 115, '#e9d4b0', { x: 14, y: 5, z: 12 }, 14))
  g.add(cyl(5.5, 5.5, 70, '#e9d4b0', { x: -16, y: 5, z: -12 }, 14))
  // 小屋：空心外壳，正面圆洞、侧面小圆窗，里面一块软垫（外壳避开两根柱子）
  const house = shell(34, 36, 32, 2, sub, { front: [{ kind: 'circle', x: 0, y: 16, r: 9.5 }], left: [{ kind: 'circle', x: 4, y: 22, r: 4 }] })
  house.position.set(-9, 5, 10)
  g.add(house)
  g.add(puck(12, 3.5, shade(main, 0.08), { x: -9, y: 7, z: 10 }))
  g.add(puck(22, 5, main, { x: -16, y: 75, z: -12 }))
  g.add(puck(20, 5, main, { x: 14, y: 120, z: 12 }))
  g.add(ball(12, sub, { x: 14, y: 129, z: 12 }, [1, 0.45, 1]))
  // 吊着的毛球
  g.add(cyl(0.3, 0.3, 22, C.ink, { x: -32, y: 54, z: -12 }, 4))
  g.add(ball(3.6, C.pink, { x: -32, y: 52, z: -12 }))
  g.add(cyl(0.3, 0.3, 1, C.ink, { x: -32, y: 76, z: -12, rz: Math.PI / 2 }, 4))
  return g
}

function laundryBasket(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  g.add(cup(20, 16, 34, 1.6, main))
  g.add(torus(19.2, 1.4, shade(main, -0.08), { y: 33.4, rx: Math.PI / 2 }))
  g.add(ball(12, C.sky, { x: -4, y: 30, z: 2 }, [1.2, 0.5, 1]))
  g.add(ball(9, C.white, { x: 7, y: 32, z: -4 }, [1.1, 0.6, 1]))
  return g
}

function standMirror(p: string[]) {
  const [frame] = p
  // 镜框底边着地、整体后仰；背后一根支脚从镜框背面斜撑到地面。
  // （以前镜框底边离地 8cm、支脚也够不着地，整件悬空 1.7cm，而且重心偏后 10cm）
  const g = new THREE.Group()
  const tilt = -0.12
  const z0 = 15
  const mirror = new THREE.Group()
  mirror.add(rbox(44, 152, 6, frame, { y: 0.4 }, 3))
  mirror.add(glow(36, 142, C.glass, { y: 5.4, z: 3.3 }, 0.15))
  mirror.position.z = z0
  mirror.rotation.x = tilt
  g.add(mirror)
  // 支脚：上端贴在镜框背面 y≈110 处，下端落地
  const top = new THREE.Vector3(0, 110, -3).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt)
  top.z += z0
  const foot = new THREE.Vector3(0, 0, -20)
  const len = top.distanceTo(foot)
  const leg = rbox(4, len, 3, frame, {}, 1)
  leg.position.set(0, (top.y + foot.y) / 2, (top.z + foot.z) / 2)
  leg.rotation.x = Math.atan2(top.z - foot.z, top.y - foot.y)
  g.add(leg)
  return g
}

// ---------- 玄关 ----------

// 鞋柜：空心柜体 + 对开门，里面四层鞋板
const SHOE_CAB = { w: 80, d: 36, y0: 6, h: 94, cd: 33, cz: -1.5, shelves: [27.6, 47.4, 67.2] }
const SHOE_CAB_SURF: NonNullable<AssetDef['surfaces']> = (() => {
  const { w, y0, h, cd, cz, shelves } = SHOE_CAB
  const ys = [y0 + 1.8, ...shelves]
  const top = y0 + h - 1.8
  return ys.map((y, i) => ({ y, h: Math.round(((ys[i + 1] ?? top + 1.6) - 1.6 - y - 0.5) * 10) / 10, inside: true, shape: [cabInner(w, cd, cz)] }))
})()
function shoeCabinet(p: string[]) {
  const [main] = p
  const { w, d, y0, h, cd, cz, shelves } = SHOE_CAB
  const g = G(legs(w, d, y0, shade(main, -0.12), 1.6, 5))
  const body = carcass(w, h, cd, main)
  body.position.set(0, y0, cz)
  body.add(shelvesIn(w, cd, shelves.map((y) => y - y0), shade(main, 0.04)))
  g.add(body)
  for (const s of [-1, 1]) g.add(hingedDoor({ x0: s < 0 ? -w / 2 : 0, x1: s < 0 ? 0 : w / 2, y0, y1: y0 + h, z: d / 2 - 1.4, hinge: s < 0 ? 'left' : 'right', color: shade(main, 0.05), knob: C.woodD, knobY: 50 - y0 }))
  return g
}

function umbrellaStand(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  g.add(cup(11, 10, 48, 1.4, main))
  const cols = [C.pink, C.sky, C.lemon]
  // 桶内壁半径 11 - 1.4 = 9.6；伞面在桶口高度（48）半径约 2.7。伞尖离中心 3.2、向外倾 0.07 rad：
  // 桶口处伞面外沿 3.2 + 48 × 0.07 + 2.7 ≈ 9.3，贴着桶口内沿但不穿出桶壁；三把伞彼此也不相交
  const r0 = 3.2
  const lean = 0.07
  cols.forEach((c, i) => {
    const a = (i / 3) * Math.PI * 2
    // 合拢的伞：伞尖在桶底，伞面最宽处靠上，顶上是弯柄（柄朝外）
    const u = new THREE.Group()
    u.add(cyl(0.5, 0.5, 6, C.ink, { y: 2 }, 6))
    u.add(cyl(3, 0.6, 46, c, { y: 8 }, 10))
    u.add(cyl(0.6, 0.6, 14, C.ink, { y: 54 }, 6))
    u.add(torus(2.6, 0.8, C.woodD, { x: 2.6, y: 68 }, Math.PI))
    // 局部 +x 朝外：先绕 z 倒向 +x，再整体转到第 i 个方向
    u.rotation.z = -lean
    const slot = new THREE.Group()
    slot.add(u)
    slot.position.set(Math.cos(a) * r0, 1.4, Math.sin(a) * r0)
    slot.rotation.y = -a
    g.add(slot)
  })
  return g
}

// ---------- 阳台 ----------

function planter(p: string[]) {
  const [box] = p
  const g = new THREE.Group()
  g.add(tray(64, 22, 24, 2.5, box))
  g.add(rbox(59, 2, 19, '#8b6a4f', { y: 16 }, 0.8))
  const cols = [C.pink, C.lemon, C.red, C.lilac, C.white]
  for (let i = 0; i < 6; i++) {
    const x = -25 + i * 10
    const h = 14 + (i % 3) * 5
    const stem = cyl(0.5, 0.5, h, C.leafD, { x, y: 17 }, 4)
    stem.userData.noOutline = true
    g.add(stem)
    // 叶子长轴转到 x 方向，叶柄搭在茎上（以前长轴朝前后、离茎 0.5cm 悬空）
    g.add(leaf(8, C.leaf, { x: x + 3.6, y: 23, ry: Math.PI / 2 }))
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      g.add(ball(2.2, cols[i % cols.length], { x: x + Math.cos(a) * 2.4, y: 17 + h, z: Math.sin(a) * 2.4 }, [1, 0.5, 1]))
    }
    g.add(ball(1.4, C.lemon, { x, y: 18 + h }))
  }
  return g
}

function laundryStand(p: string[]) {
  const [pole] = p
  const w = 150
  const barY = 150
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(6, 3, 46, pole, { x: (s * w) / 2 }, 1))
    g.add(cyl(1.4, 1.4, barY + 4, pole, { x: (s * w) / 2, y: 3 }, 10))
    g.add(ball(2.2, pole, { x: (s * w) / 2, y: barY + 7 }))
  }
  const bar = cyl(1.2, 1.2, w, pole, {}, 10)
  bar.rotation.z = Math.PI / 2
  bar.position.y = barY
  g.add(bar)

  // 杆上的衣服、毛巾、晾衣夹架都是独立素材，挂到杆上（surfaces 里的挂钩层）
  return g
}

/** 壁挂空调室内机：背面贴墙（-z），出风口在正面下方 */
function aircon(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  const w = 80
  const y = AIRCON_MOUNT
  // 机身：上平下圆，正面略鼓
  g.add(rbox(w, 28, 20, main, { y, z: -2.5 }, 6))
  g.add(rbox(w - 4, 16, 2, shade(main, 0.02), { y: y + 9, z: 8 }, 1))
  // 出风口 + 导风板
  const vent = rbox(w - 14, 3.4, 1.2, '#4a4a55', { y: y + 2.2, z: 6.8 }, 0.5)
  vent.userData.noOutline = true
  g.add(vent)
  g.add(rbox(w - 16, 1.2, 5, shade(main, -0.04), { y: y + 1.2, z: 8.6, rx: 0.35 }, 0.5))
  // 运行指示灯
  const led = ball(0.8, '#7fe0a8', { x: w / 2 - 10, y: y + 7, z: 7.6 })
  led.material = toon('#7fe0a8', { emissive: 0.8 })
  led.userData.noOutline = true
  g.add(led)
  // 背后穿墙的配管罩，沿墙往侧边走
  g.add(rbox(8, 6, 6, main, { x: -w / 2 - 4, y: y + 4, z: -9 }, 2))
  return g
}
const AIRCON_MOUNT = 205

// ---------- 设备（平面图上的固定设备在 3D 中的样子；尺寸由平面图给定） ----------

/** 水龙头：底座 + 竖管 + 鹅颈弯管 + 出水口 + 单把手，出水口朝 +z 方向伸出 reach */
function faucet(color: string, reach = 14, height = 24) {
  const g = new THREE.Group()
  g.add(puck(2.6, 1.6, color))
  g.add(cyl(1.25, 1.35, height, color, { y: 1.4 }, 14))
  const r = reach / 2
  const arc = torus(r, 1.15, color, { y: height + 1.4, z: r, ry: Math.PI / 2 }, Math.PI)
  g.add(arc)
  g.add(cyl(1.25, 1.1, 3.2, color, { y: height + 1.4 - 3.2, z: reach }, 14))
  g.add(cyl(0.7, 0.7, 0.4, '#8a93a0', { y: height + 1.4 - 3.4, z: reach }, 12))
  // 单把手：斜向后翘的杆
  g.add(rbox(1.6, 1.4, 7, color, { y: height * 0.55, z: -3, rx: 0.5 }, 0.6))
  return g
}

/** 燃气灶（两口 / 三口）：黑玻璃面板 + 每口一个锅架（五德）和炉头 */
function gasHob(sinkSide: 1 | -1, burners: 2 | 3) {
  const g = new THREE.Group()
  g.add(rbox(60, 0.8, 46, '#2f3136', {}, 0.4))
  const layout: (readonly [number, number, number])[] =
    burners === 3
      ? [
          [-15, -9, 7.5],
          [15, -9, 7.5],
          [0, 11, 6],
        ]
      : [
          [-14, 0, 7.5],
          [14, 0, 7.5],
        ]
  for (const [dx, dz, r] of layout) {
    const z = dz * sinkSide
    g.add(puck(r * 0.55, 1.4, '#55585f', { x: dx, y: 0.8, z }))
    g.add(puck(r * 0.3, 1.2, '#2a2b2f', { x: dx, y: 2.2, z }))
    g.add(torus(r, 0.5, '#1f2024', { x: dx, y: 2.6, z, rx: Math.PI / 2 }))
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      g.add(rbox(1, 1.6, r * 0.7, '#1f2024', { x: dx + Math.cos(a) * r * 0.72, y: 1.4, z: z + Math.sin(a) * r * 0.72, ry: -a + Math.PI / 2 }, 0.3))
    }
  }
  return g
}

/** 电磁炉 / 电陶炉：黑色微晶面板 + 加热圈 */
function inductionHob(burners: 2 | 3) {
  const g = new THREE.Group()
  g.add(rbox(60, 0.8, 50, '#1d1e22', {}, 0.6))
  const layout: (readonly [number, number, number])[] =
    burners === 3
      ? [
          [-15, -8, 9],
          [15, -8, 9],
          [0, 12, 7],
        ]
      : [
          [-14, 0, 10],
          [14, 0, 10],
        ]
  for (const [dx, dz, r] of layout) g.add(torus(r, 0.35, '#6b6f78', { x: dx, y: 0.85, z: dz, rx: Math.PI / 2 }))
  g.add(rbox(16, 0.3, 3, '#3a3d44', { y: 0.85, z: 21 }, 0.2))
  return g
}

/**
 * 整体厨房。facing = 对面式（背面食器棚 + 通道 + 朝房间的主台面）；
 * o.island：中岛 —— 靠墙的背面做成带灶、吊柜和抽油烟机的操作台，岛台只有水槽，朝房间一侧台面出挑放吧凳；
 * o.dishwasher：水槽旁嵌一台洗碗机；o.induction：电磁炉（黑色微晶面板）代替燃气灶。
 */
export function kitchenModel(w: number, facing: boolean, burners: 2 | 3 = w < 200 ? 2 : 3, o: { island?: boolean; dishwasher?: boolean; induction?: boolean } = {}) {
  const g = new THREE.Group()
  const island = facing && !!o.island
  const hobOf = () => (o.induction ? inductionHob(burners) : gasHob(1, burners))
  const counter = (z: number, sinkSide: 1 | -1, withHob = true) => {
    const c = new THREE.Group()
    // 柜体做成空心外壳（不封顶），下沉的水槽才能从台面的开孔里看到
    const body = shell(w, 80, 62, 1.6, C.white, { top: false })
    body.position.y = 4
    c.add(body)
    c.add(rbox(w - 4, 6, 58, shade(C.wood, -0.25), { y: 0, z: -2 }, 1))
    const doors = Math.max(2, Math.round(w / 45))
    for (let i = 0; i < doors; i++) {
      const dw = w / doors
      c.add(rbox(dw - 3, 70, 1.4, i % 2 ? C.sakura : shade(C.sakura, 0.04), { x: -w / 2 + dw * (i + 0.5), y: 9, z: (31 + 0.7) * sinkSide }, 1.2))
      c.add(rbox(10, 1.6, 2, C.steel, { x: -w / 2 + dw * (i + 0.5), y: 72, z: (32 + 1) * sinkSide }, 0.6))
    }
    // 台面：水槽位置真开孔；台面平放（holePanel 的 y 轴转到 -z）
    const sx = -w / 2 + w * 0.3
    const zc = 2 * sinkSide
    c.add(holePanel(w + 2, 65, 4, C.steel, [{ kind: 'rect', x: sx, y: 32.5 - zc - 18, w: 52, h: 36, r: 5 }], { y: 86, z: 32.5, rx: -Math.PI / 2 }, 1))
    // 下沉水槽 + 排水口
    c.add(tray(51, 21, 35, 1.2, '#c4ccd6', { x: sx, y: 66.5, z: zc }, 2))
    c.add(cyl(2.2, 2.2, 0.4, '#7d8590', { x: sx, y: 67.8, z: zc + 6 * sinkSide }, 16))
    // 水龙头：在水槽后方，出水口伸向水槽中央
    const tap = faucet(C.steel, 16, 26)
    tap.position.set(sx, 88, zc - 23 * sinkSide)
    tap.rotation.y = sinkSide > 0 ? 0 : Math.PI
    c.add(tap)
    // 三口燃气灶 + 正面旋钮 + 烤鱼炉抽屉（台面上的小家电、厨具由用户 / 一键布置摆放）
    const bx = w / 2 - 48
    const front = 32.5 * sinkSide
    if (withHob) {
      const hob = o.induction ? inductionHob(burners) : gasHob(sinkSide, burners)
      hob.position.set(bx, 88, 0)
      if (o.induction && sinkSide < 0) hob.rotation.y = Math.PI
      c.add(hob)
      c.add(rbox(44, 12, 1.4, '#2f3136', { x: bx, y: 70, z: front + 0.4 * sinkSide }, 1))
      for (const dx of [-20, 20, -14, 14]) c.add(cyl(1.6, 1.6, 1.6, '#3a3c42', { x: bx + dx, y: 77, z: front + 1.2 * sinkSide, rx: Math.PI / 2 }, 16))
    }
    // 洗碗机：水槽右边一格，不锈钢门板 + 顶部横拉手（放不下就不装）
    const dwx = sx + 26 + 31
    if (o.dishwasher && dwx + 30 <= (withHob ? bx - 23 : w / 2 - 2)) {
      c.add(rbox(58, 72, 1.6, C.steel, { x: dwx, y: 8, z: front + 0.9 * sinkSide }, 1))
      c.add(rbox(40, 2, 2.2, shade(C.steel, -0.25), { x: dwx, y: 74, z: front + 2.4 * sinkSide }, 0.8))
      c.add(glow(6, 1.6, '#9fe3ff', { x: dwx + 20, y: 77, z: front + 1.9 * sinkSide }, 0.6))
    }
    c.position.z = z
    return c
  }
  if (!facing) {
    g.add(counter(0, 1))
    // 灶台正上方的抽油烟机（薄型罩 + 通到天花的风管罩）
    const hx = w / 2 - 48
    g.add(rbox(60, 14, 50, C.white, { x: hx, y: 168, z: -32.5 + 25 }, 2))
    g.add(rbox(58, 0.8, 46, shade(C.white, -0.18), { x: hx, y: 167.6, z: -32.5 + 25 }, 0.4))
    g.add(rbox(26, 48, 24, C.white, { x: hx, y: 182, z: -32.5 + 12 }, 1.5))
    g.add(rbox(2.4, 1.6, 1.4, '#9aa3ad', { x: hx - 22, y: 170, z: -32.5 + 50.4 }, 0.4))
  } else {
    const d = 45 + 90 + 65
    // 背面食器棚
    const back = new THREE.Group()
    back.add(rbox(w, 86, 44, C.white, { y: 4 }, 2))
    back.add(rbox(w - 4, 6, 40, shade(C.wood, -0.25), {}, 1))
    back.add(rbox(w + 2, 4, 46, C.woodL, { y: 88 }, 1))
    const doors = Math.max(2, Math.round(w / 50))
    for (let i = 0; i < doors; i++) {
      const dw = w / doors
      back.add(rbox(dw - 3, 76, 1.4, C.mint, { x: -w / 2 + dw * (i + 0.5), y: 9, z: 22.7 }, 1.2))
    }
    back.position.z = -d / 2 + 22.5
    g.add(back)
    if (!island) {
      // 主台面（站在通道一侧，正面朝通道 = -z）+ 吧台立板
      const main = counter(d / 2 - 32.5, -1)
      main.add(rbox(w, 22, 6, C.wood, { y: 88, z: 30 }, 2))
      g.add(main)
    } else {
      // 中岛：背面柜台上装灶（台面高 92），上方吊柜 + 抽油烟机；岛台只有水槽，朝房间一侧台面出挑 22
      const hx = w / 2 - 48
      const hob = hobOf()
      hob.position.set(hx, 92, -d / 2 + 22)
      g.add(hob)
      g.add(rbox(60, 14, 50, C.white, { x: hx, y: 168, z: -d / 2 + 25 }, 2))
      g.add(rbox(58, 0.8, 46, shade(C.white, -0.18), { x: hx, y: 167.6, z: -d / 2 + 25 }, 0.4))
      g.add(rbox(26, 48, 24, C.white, { x: hx, y: 182, z: -d / 2 + 12 }, 1.5))
      const uw = w - 84
      if (uw > 30) {
        g.add(rbox(uw, 62, 34, C.white, { x: -w / 2 + uw / 2, y: 150, z: -d / 2 + 17 }, 2))
        const n = Math.max(1, Math.round(uw / 45))
        for (let i = 0; i < n; i++) g.add(rbox(uw / n - 3, 58, 1.2, C.mint, { x: -w / 2 + (uw / n) * (i + 0.5), y: 152, z: -d / 2 + 34.6 }, 1))
      }
      const main = counter(d / 2 - 32.5, -1, false)
      main.add(rbox(w + 2, 4, 22, C.woodL, { y: 86, z: 32.5 + 11 }, 1.5))
      g.add(main)
    }
  }
  return g
}

/** 淋浴房：低矮的方形淋浴底盘 + 地漏 + 正面玻璃隔断（一扇固定、一扇推拉，金属框） */
function showerStallModel(w: number, d: number) {
  const g = new THREE.Group()
  g.add(tray(w, 6, d, 3, C.white, {}, 2))
  g.add(cyl(3.5, 3.5, 0.4, '#9aa3ad', { y: 3.2, z: 0 }, 16))
  const H = 190
  const metal = '#b9c0c9'
  const zf = d / 2 - 2
  const pane = (pw: number, x: number, z: number) => {
    const p = rbox(pw, H - 8, 0.8, C.glass, { x, y: 7, z }, 0.2)
    p.material = toon(C.glass, { transparent: 0.3 })
    p.userData.noOutline = true
    g.add(p)
  }
  pane(w * 0.55, -w / 2 + (w * 0.55) / 2 + 1, zf)
  pane(w * 0.5, w / 2 - (w * 0.5) / 2 - 1, zf + 2.2)
  g.add(rbox(w, 2.4, 4, metal, { y: H - 1, z: zf + 1 }, 0.6))
  g.add(rbox(w, 1.6, 4, metal, { y: 6, z: zf + 1 }, 0.4))
  for (const x of [-w / 2 + 1, w / 2 - 1]) g.add(rbox(2.4, H - 6, 4, metal, { x, y: 6, z: zf + 1 }, 0.6))
  g.add(rbox(1.6, 28, 3, metal, { x: w / 2 - w * 0.5 + 4, y: 90, z: zf + 4.2 }, 0.6))
  return g
}

export function bathtubModel(w: number, d: number, shower = false) {
  if (shower) return showerStallModel(w, d)
  const g = new THREE.Group()
  g.add(tray(w, 55, d, 7, C.white, {}, 3))
  const water = rbox(w - 14, 1, d - 14, '#9fdcf0', { y: 40 }, 0.4)
  water.material = toon('#9fdcf0', { emissive: 0.15 })
  water.userData.noOutline = true
  g.add(water)
  // 小黄鸭
  const duck = new THREE.Group()
  duck.add(ball(5, C.lemon, { y: 4 }, [1.2, 0.85, 1]))
  duck.add(ball(3.6, C.lemon, { x: 3.5, y: 9.5 }))
  duck.add(ball(1.6, C.orange, { x: 7, y: 9 }, [1.4, 0.6, 1]))
  duck.position.set(-w / 4, 40, 4)
  duck.rotation.y = 0.6
  g.add(duck)
  return g
}

/**
 * 马桶：底座 + 空心马桶碗（有水面）+ 椭圆座圈 + 掀起的盖子。
 *   basic    普通水箱 + 普通座圈
 *   washlet  水箱 + 温水洗净座圈（座圈后部机体 + 侧边控制面板）
 *   tankless 无水箱一体：低矮的后座，线条更圆润（遥控器装在墙上，和卷纸架一体）
 */
export function toiletModel(w: number, d: number, type: 'basic' | 'washlet' | 'tankless' = 'washlet') {
  const g = new THREE.Group()
  const white = C.white
  const bz = d / 2 - w * 0.62 // 马桶碗中心（靠前）
  const sz = 1.35 // 前后拉长成椭圆
  const ped = cyl(w * 0.26, w * 0.33, 30, white, { z: bz }, 24)
  ped.scale.z = sz
  g.add(ped)
  const bowl = cup(w * 0.46, w * 0.3, 12, 1.4, white, { y: 28, z: bz })
  bowl.scale.z = sz
  g.add(bowl)
  const water = cyl(w * 0.3, w * 0.3, 0.3, '#bfe3f2', { y: 33, z: bz }, 24)
  water.scale.z = sz
  water.userData.noOutline = true
  g.add(water)
  // 座圈和盖子都按马桶口的椭圆轮廓做（外沿和碗口对齐）
  const seatColor = type === 'basic' ? shade(white, -0.02) : '#f6f7f9'
  const R = w * 0.46
  const backZ = -d / 2
  const ring = new THREE.Shape()
  ring.absellipse(0, 0, R, R * sz, 0, Math.PI * 2, false, 0)
  const hole = new THREE.Path()
  hole.absellipse(0, -R * 0.06, R * 0.6, R * sz * 0.66, 0, Math.PI * 2, true, 0)
  ring.holes.push(hole)
  const flat = (shape: THREE.Shape, t: number) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 2, curveSegments: 32 })
    geo.rotateX(-Math.PI / 2)
    return geo
  }
  const seat = new THREE.Mesh(flat(ring, 1.6), toon(seatColor))
  seat.position.set(0, 40.6, bz)
  g.add(seat)
  // 铰链：在马桶口后端，但不能伸进水箱 / 机体里
  const unitFront = type === 'tankless' ? backZ + 26 : type === 'washlet' ? backZ + 26.5 : backZ + 18
  const hingeZ = Math.max(bz - R * sz, unitFront + 1)
  const lidShape = new THREE.Shape()
  lidShape.absellipse(0, 0, R + 0.4, (R + 0.4) * sz, 0, Math.PI * 2, false, 0)
  const lid = new THREE.Mesh(flat(lidShape, 1.8), toon(seatColor))
  // 盖子掀起：以后端为轴竖起来，微微往后靠
  lid.position.set(0, 0, -(R + 0.4) * sz)
  const pivot = new THREE.Group()
  pivot.position.set(0, 43, hingeZ)
  pivot.rotation.x = Math.PI / 2 - 0.04
  pivot.add(lid)
  g.add(pivot)
  if (type === 'tankless') {
    g.add(rbox(w + 2, 24, 26, white, { y: 18, z: backZ + 13 }, 9))
    g.add(rbox(w * 0.86, 3, 8, '#f6f7f9', { y: 40, z: backZ + 26 + 3 }, 1.4))
  } else {
    // 水箱
    g.add(rbox(w + 4, 38, 18, white, { y: 36, z: backZ + 9 }, 5))
    g.add(rbox(w + 6, 4, 20, shade(white, -0.04), { y: 74, z: backZ + 10 }, 2))
    g.add(rbox(4, 1.6, 2, '#cfd3da', { x: w / 2 - 2, y: 66, z: backZ + 18.5 }, 0.6))
    if (type === 'washlet') {
      // 座圈后部机体 + 侧边控制面板
      g.add(rbox(w * 0.8, 7, 9, '#f6f7f9', { y: 38, z: backZ + 22 }, 2.4))
      g.add(rbox(4, 6, 15, '#f6f7f9', { x: w / 2 + 1.4, y: 37, z: bz - 2 }, 1.4))
      for (const [k, c] of [
        [0, '#7fb8e6'],
        [1, '#ff9a8b'],
        [2, '#a6e3cc'],
      ] as const)
        g.add(ball(0.9, c, { x: w / 2 + 3.6, y: 41, z: bz - 6 + k * 3.4 }, [0.4, 1, 1]))
    }
  }
  return g
}

export function basinModel(w: number, d: number) {
  const g = new THREE.Group()
  // 洗面柜做成空心（不封顶），台面开椭圆孔，嵌一个真正下凹的陶瓷盆
  const body = shell(w, 78, d, 1.6, C.white, { top: false })
  g.add(body)
  g.add(rbox(w - 6, 66, 1.4, C.sky, { y: 6, z: d / 2 + 0.7 }, 1.5))
  const r = Math.min(w * 0.3, d * 0.34)
  const bz = 3
  g.add(holePanel(w + 2, d + 2, 5, C.white, [{ kind: 'rect', x: 0, y: (d + 2) / 2 - bz - r, w: r * 2.5, h: r * 2, r }], { y: 80.5, z: (d + 2) / 2, rx: -Math.PI / 2 }, 2))
  const bowl = cup(r, r * 0.55, 12, 0.9, '#f4fbff', { y: 71, z: bz })
  bowl.scale.x = 1.25
  g.add(bowl)
  g.add(cyl(1.6, 1.6, 0.4, '#9aa3ad', { y: 71.95, z: bz }, 16))
  const tap = faucet(C.steel, Math.max(6, r * 0.9), 13)
  tap.position.set(0, 83, bz - r - 3.5)
  g.add(tap)
  g.add(cup(3, 2.6, 10, 0.6, C.pink, { x: w / 2 - 9, y: 83, z: -d / 2 + 8 }))
  g.add(cyl(0.6, 0.6, 12, C.sky, { x: w / 2 - 9, y: 85, z: -d / 2 + 8, rz: 0.2 }, 4))
  return g
}


export function outdoorUnitModel(w: number, d: number) {
  const g = new THREE.Group()
  g.add(rbox(w - 2, 56, d - 2, '#eef0f2', { y: 4 }, 3))
  for (const s of [-1, 1]) g.add(rbox(4, 4, d - 6, C.ink, { x: s * (w / 2 - 10) }, 1))
  const fx = -w * 0.15
  g.add(torus(19, 2, '#c9d0d8', { x: fx, y: 32, z: (d - 2) / 2 }))
  for (let i = 0; i < 3; i++) g.add(rbox(36, 1.4, 1.4, '#c9d0d8', { x: fx, y: 31.3, z: (d - 2) / 2, rz: (i * Math.PI) / 3 }, 0.6))
  for (let i = 0; i < 5; i++) g.add(rbox(w * 0.22, 1.2, 1, '#c9d0d8', { x: w * 0.3, y: 16 + i * 8, z: (d - 2) / 2 + 0.3 }, 0.4))
  return g
}

/**
 * 收纳位（鞋柜位 / 衣柜位 / 食品柜位）：只是预留的空间，柜子本身是家具（packs/cabinets.ts）。
 *   嵌墙（recessed）：墙里的壁龛——墙洞、背后和两侧的包墙由 house.ts 做，这里只画洞口一圈细细的包边和壁龛底板；
 *   靠墙：地面上一圈淡淡的标记（和冰箱位一样）。
 * 正面在 z = d/2；h 为壁龛高度（和 house.ts 挖墙的高度一致）。
 */
export function storageSpotModel(w: number, d: number, recessed: boolean, h: number) {
  const g = new THREE.Group()
  if (recessed) {
    const trim = '#efe6d6'
    const tw = 3
    const z = d / 2 + 0.5
    for (const s of [-1, 1]) g.add(rbox(tw, h + tw, 1, trim, { x: s * (w / 2 + tw / 2), z }, 0.3))
    g.add(rbox(w + tw * 2, tw, 1, trim, { y: h, z }, 0.3))
    // 壁龛底板：比地面高一点点，不和地板共面
    const floor = rbox(w - 0.4, 0.6, d - 0.4, shade(trim, -0.08), { y: 0.05 }, 0.2)
    floor.userData.noOutline = true
    g.add(floor)
    return g
  }
  const c = '#d5dade'
  const t = 1.2
  const mark = (mw: number, md: number, x: number, z: number) => {
    const m = rbox(mw, 0.3, md, c, { x, z }, 0.1)
    m.material = toon(c, { transparent: 0.55 })
    m.userData.noOutline = true
    m.castShadow = false
    g.add(m)
  }
  for (const s of [-1, 1]) {
    mark(w - 2, t, 0, (s * (d - 2 - t)) / 2)
    mark(t, d - 2 - t * 2, (s * (w - 2 - t)) / 2, 0)
  }
  return g
}

/** 嵌墙收纳位（壁龛）的高度：house.ts 挖墙、包墙和壁龛包边都按它 */
export const NICHE_H = 230

export function psModel(w: number, d: number, h: number) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, '#e3ddd3', {}, 2))
  g.add(rbox(w * 0.6, h * 0.5, 1.2, '#d3ccc0', { y: h * 0.25, z: d / 2 + 0.5 }, 1))
  return g
}

// ---------- 目录 ----------

/** 按风格分组写配色，展开成 palettes + paletteStyles + styles */
function sty(groups: Partial<Record<StyleTag, string[][]>>) {
  const palettes: string[][] = []
  const paletteStyles: StyleTag[] = []
  for (const [k, ps] of Object.entries(groups) as [StyleTag, string[][]][])
    for (const p of ps) {
      palettes.push(p)
      paletteStyles.push(k)
    }
  return { palettes, paletteStyles, styles: Object.keys(groups) as StyleTag[] }
}
const { nordic: N, modern: M, japanese: J, industrial: I, retro: R } = S

const sofaColors = sty({
  cute: [
    [C.sky, C.lemon, C.pink],
    [C.pink, C.white, C.lemon],
    [C.mint, C.peach, C.white],
    [C.lilac, C.sakura, C.lemon],
  ],
  nordic: [
    [N.gray, N.mustard, N.white],
    [N.linen, N.blue, N.sage],
  ],
  modern: [
    [M.char, M.white, M.gray],
    [M.light, M.char, M.black],
  ],
  industrial: [[I.leather, I.concrete, I.rust]],
  retro: [
    [R.teal, R.mustard, R.orange],
    [R.mustard, R.cream, R.red],
  ],
})
/** 单色木作：桌、柜 */
const woods = sty({
  cute: [[C.wood], [C.woodL], [C.white], [C.sakura]],
  nordic: [[N.oak], [N.white]],
  modern: [[M.white], [M.black], [M.walnut]],
  japanese: [[J.hinoki], [J.dark]],
  industrial: [[I.walnut]],
  retro: [[R.caramel]],
})
/** [主色, 把手 / 点缀] 的柜类 */
const cabinets = (cute: string[][]) =>
  sty({
    cute,
    nordic: [
      [N.white, N.oak],
      [N.oak, N.white],
    ],
    modern: [
      [M.char, M.silver],
      [M.white, M.black],
    ],
    japanese: [[J.hinoki, J.dark]],
    industrial: [[I.walnut, I.iron]],
    retro: [[R.caramel, R.mustard]],
  })
const softs = (cuteOnly = false) =>
  sty({
    cute: [[C.pink], [C.sky], [C.mint], [C.lemon], [C.lilac], [C.peach]],
    ...(cuteOnly ? {} : { nordic: [[N.gray], [N.sage]], modern: [[M.char]], industrial: [[I.leather]], retro: [[R.mustard], [R.teal]] }),
  })
const pots = (cute: string[][]) => sty({ cute, nordic: [[N.white]], modern: [[M.char]], japanese: [[J.sumi]], industrial: [[I.concrete]], retro: [[R.orange]] })

/** [id, 规格, 床垫宽 cm] */
const BEDS: [string, string, number][] = [
  ['bed-semi-single', 'Semi-single', 85],
  ['bed-single', 'Single', 97],
  ['bed-semi-double', 'Semi-double', 120],
  ['bed-double', 'Double', 140],
  ['bed-queen', 'Queen', 160],
]
const BED_CUTE = [
  [C.sky, C.white, C.wood],
  [C.pink, C.white, C.woodL],
  [C.mint, C.cream, C.wood],
  [C.lilac, C.white, C.white],
  [C.lemon, C.white, C.woodD],
]
/** 每种床默认配色错开一位，并排看时不重样 */
const rotate = <T,>(xs: T[], k: number) => [...xs.slice(k % xs.length), ...xs.slice(0, k % xs.length)]
const bedColors = (i: number) =>
  sty({
    cute: rotate(BED_CUTE, i),
    nordic: [
      [N.gray, N.white, N.oak],
      [N.sage, N.linen, N.oakL],
    ],
    modern: [
      [M.char, M.white, M.black],
      [M.light, M.white, M.walnut],
    ],
    japanese: [[J.ai, J.washi, J.hinoki]],
    industrial: [[I.concrete, N.linen, I.iron]],
    retro: [[R.mustard, R.cream, R.caramel]],
  })

export const ASSETS: AssetDef[] = [
  { id: 'sofa2', name: '沙发', family: 'sofa', sizeLabel: '双人', category: 'living', w: 170, d: 86, h: 80, ...sofaColors, build: (p) => sofa(170, p) },
  { id: 'sofa3', name: '沙发', family: 'sofa', sizeLabel: '三人', category: 'living', w: 210, d: 86, h: 80, ...sofaColors, build: (p) => sofa(210, p) },
  { id: 'armchair', name: '单人沙发', category: 'living', w: 80, d: 80, h: 80, ...sofaColors, build: armchair },
  { id: 'coffee-table', name: '圆茶几', family: 'coffee-table', sizeLabel: '标准', category: 'living', w: 84, d: 84, h: 38, surface: 38, surfaceShape: [ellipsePoly(39)], ...woods, build: coffeeTable },
  { id: 'tv-board', name: '电视柜', family: 'lv-tv-low', sizeLabel: '150', category: 'living', w: 150, d: 42, h: 44, surface: 44, ...woods, surfaces: TV_BOARD_SURF, openable: true, build: tvBoard },
  {
    id: 'rug',
    name: '方地毯',
    category: 'living',
    w: 200,
    d: 140,
    h: 2,
    ...sty({
      cute: [
        [C.cream, C.pink],
        [C.white, C.sky],
        [C.sakura, C.white],
        [C.mint, C.cream],
      ],
      nordic: [[N.linen, N.gray]],
      modern: [[M.light, M.char]],
      japanese: [[J.tatami, J.washi]],
      industrial: [[I.concrete, I.rust]],
      retro: [[R.orange, R.cream]],
    }),
    build: (p) => rug(200, 140, p),
  },
  {
    id: 'rug-round',
    name: '圆地毯',
    family: 'rug-round',
    sizeLabel: '标准',
    category: 'living',
    w: 150,
    d: 150,
    h: 2,
    ...sty({
      cute: [
        [C.sakura, C.white, C.pink],
        [C.sky, C.white, C.lemon],
        [C.cream, C.mint, C.peach],
      ],
      nordic: [[N.linen, N.white, N.sage]],
      modern: [[M.light, M.white, M.char]],
      retro: [[R.mustard, R.cream, R.teal]],
    }),
    build: (p) => roundRug(75, p),
  },
  { id: 'floor-lamp', name: '落地灯', family: 'floor-lamp', sizeLabel: '标准', category: 'lighting', w: 40, d: 40, h: 156, ...sty({ cute: [[C.lamp], [C.sakura], [C.mint]], nordic: [[N.linen]], modern: [[M.white]], retro: [[R.mustard]] }), build: floorLamp },
  { id: 'bookshelf', name: '书架', family: 'bookshelf', sizeLabel: '标准', category: 'storage', w: 80, d: 30, h: 176, surface: 176, ...woods, build: bookshelf },
  { id: 'monstera', name: '龟背竹', family: 'monstera', sizeLabel: '标准', category: 'plants', w: 70, d: 70, h: 130, ...pots([[C.white], [C.peach], [C.sky], [C.sakura]]), build: monstera },
  { id: 'beanbag', name: '懒人沙发', family: 'beanbag', sizeLabel: '圆团', category: 'living', w: 72, d: 70, h: 56, ...softs(), build: beanbag },

  { id: 'dining-table', name: '餐桌', family: 'dining-table', sizeLabel: '4 人 120×80', category: 'dining', w: 120, d: 80, h: 72, surface: 72, ...woods, build: (p) => diningTable(120, p) },
  { id: 'dining-table-l', name: '餐桌', family: 'dining-table', sizeLabel: '6 人 160×80', category: 'dining', w: 160, d: 80, h: 72, surface: 72, ...woods, build: (p) => diningTable(160, p) },
  {
    id: 'dining-chair',
    name: '餐椅',
    family: 'dining-chair',
    sizeLabel: '标准',
    category: 'dining',
    w: 42,
    d: 42,
    h: 80,
    ...sty({
      cute: [
        [C.wood, C.pink],
        [C.woodL, C.sky],
        [C.white, C.mint],
      ],
      nordic: [
        [N.oak, N.gray],
        [N.white, N.sage],
      ],
      modern: [
        [M.black, M.char],
        [M.white, M.light],
      ],
      japanese: [[J.hinoki, J.tatami]],
      industrial: [[I.iron, I.leather]],
      retro: [[R.caramel, R.mustard]],
    }),
    build: diningChair,
  },

  // 床：按日本规格的床垫宽（长 195），床架两侧各多 4cm。id 里 single / double 沿用旧存档
  ...BEDS.map(([id, size, m], i): AssetDef => ({ id, name: '床', family: 'bed', sizeLabel: size, category: 'bedroom', w: m + 8, d: 210, h: 80, surface: 50, surfaceShape: [rectPoly(-m / 2 + 4, -30, m / 2 - 4, 98)], ...bedColors(i), build: (p) => bed(m, p) })),
  { id: 'nightstand', name: '床头柜', family: 'nightstand', sizeLabel: '标准', category: 'bedroom', w: 42, d: 36, h: 44, surface: 44, surfaces: NIGHTSTAND_SURF, openable: true, ...woods, build: nightstand },
  {
    id: 'wardrobe',
    name: '衣柜',
    category: 'bedroom',
    w: 100,
    d: 58,
    h: 190,
    // 柜顶（顶冠上沿）在 WARDROBE.h = 188
    surface: WARDROBE.h,
    ...cabinets([
      [C.white, C.pink],
      [C.wood, C.white],
      [C.woodL, C.sky],
      [C.sakura, C.white],
    ]),
    surfaces: WARDROBE_SURF,
    openable: true,
    build: wardrobe,
  },
  {
    id: 'desk',
    name: '书桌',
    family: 'desk',
    sizeLabel: '110',
    category: 'study',
    w: 110,
    d: 56,
    h: 74,
    surface: 73.5,
    ...sty({
      cute: [
        [C.woodL, C.white],
        [C.white, C.sakura],
        [C.white, C.mint],
      ],
      nordic: [[N.oak, N.white]],
      modern: [
        [M.white, M.black],
        [M.walnut, M.black],
      ],
      japanese: [[J.hinoki, J.wood]],
      industrial: [[I.walnut, I.iron]],
      retro: [[R.caramel, R.cream]],
    }),
    build: desk,
  },
  { id: 'desk-chair', name: '猫耳椅', category: 'study', w: 52, d: 56, h: 111, ...softs(true), build: deskChair },
  {
    id: 'dresser',
    name: '五斗柜',
    family: 'dresser',
    sizeLabel: '标准',
    category: 'bedroom',
    w: 80,
    d: 44,
    h: 84,
    surface: 84,
    ...cabinets([
      [C.white, C.lemon],
      [C.sakura, C.white],
      [C.wood, C.white],
      [C.mint, C.white],
    ]),
    surfaces: DRESSER_SURF,
    openable: true,
    build: dresser,
  },
  { id: 'stand-mirror', name: '穿衣镜', category: 'bedroom', w: 46, d: 40, h: 158, ...sty({ cute: [[C.white], [C.sakura], [C.lemon]], nordic: [[N.oak]], modern: [[M.black]], industrial: [[I.iron]], retro: [[R.caramel]] }), build: standMirror },

  {
    id: 'kotatsu',
    name: '被炉',
    category: 'japanese',
    w: 180,
    d: 180,
    h: 44,
    surface: KOTATSU.topY + KOTATSU.topT,
    surfaceShape: [rectPoly(-KOTATSU.top / 2, -KOTATSU.top / 2, KOTATSU.top / 2, KOTATSU.top / 2)],
    // [被子主色, 天板木色, 被子花纹 / 底垫色]
    ...sty({
      japanese: [
        [J.ai, J.wood, J.washi],
        [J.shu, J.dark, J.hinoki],
      ],
      cute: [
        [C.red, C.woodD, C.cream],
        [C.sakura, C.wood, C.white],
        [C.sky, C.woodD, C.white],
      ],
      nordic: [[N.gray, N.oak, N.linen]],
      modern: [[M.char, M.walnut, M.light]],
      retro: [[R.orange, R.caramel, R.cream]],
    }),
    build: kotatsu,
  },
  { id: 'chabudai', name: '矮圆桌', category: 'japanese', w: 80, d: 80, h: 32, surface: 32, surfaceShape: [ellipsePoly(38)], ...sty({ japanese: [[J.dark], [J.hinoki]], cute: [[C.wood]], retro: [[R.caramel]] }), build: chabudai },
  {
    id: 'futon',
    name: '被褥',
    category: 'japanese',
    w: 106,
    d: 210,
    h: 20,
    ...sty({
      japanese: [
        [J.ai, J.washi],
        [J.shu, J.washi],
      ],
      cute: [
        [C.sky, C.white],
        [C.pink, C.white],
        [C.lemon, C.cream],
      ],
      nordic: [[N.gray, N.white]],
      modern: [[M.char, M.light]],
    }),
    build: futon,
  },
  { id: 'zabuton', name: '坐垫', category: 'japanese', w: 55, d: 55, h: 9, ...sty({ japanese: [[J.ai], [J.shu], [J.tatami]], cute: [[C.pink], [C.lilac], [C.lemon]], nordic: [[N.gray]], modern: [[M.char]] }), build: zabuton },
  { id: 'andon', name: '行灯', category: 'lighting', family: 'floor-lamp', sizeLabel: '行灯', w: 32, d: 32, h: 64, ...sty({ japanese: [[J.washi]], cute: [[C.lamp], [C.sakura]] }), build: andon },

  { id: 'bear', name: '小熊玩偶', family: 'bear', sizeLabel: '小熊', category: 'deco', w: 30, d: 26, h: 44, prop: true, ...sty({ cute: [[C.peach], [C.sakura], [C.white], ['#c99a6e'], [C.sky]] }), build: (p) => bearBody(1, p[0]) },
  { id: 'cat-loaf', name: '猫面包', category: 'deco', w: 40, d: 28, h: 30, prop: true, ...sty({ cute: [[C.white, C.pink], ['#ffcf8f', C.white], ['#6b6061', C.white], ['#c9c9cf', C.pink]] }), build: catLoaf },
  { id: 'cactus', name: '仙人掌', category: 'plants', w: 20, d: 20, h: 42, prop: true, ...pots([[C.sakura], [C.sky], [C.lemon], [C.white]]), build: cactus },
  { id: 'cat-tower', name: '猫爬架', category: 'pets', w: 60, d: 60, h: 136, ...sty({ cute: [[C.sakura, C.white], [C.sky, C.cream], [C.mint, C.white], [C.lemon, C.peach]], nordic: [[N.oak, N.linen]], modern: [[M.light, M.char]] }), build: catTower },
  { id: 'laundry-basket', name: '洗衣篮', family: 'laundry-basket', sizeLabel: '标准', category: 'storage', w: 42, d: 42, h: 44, ...sty({ cute: [[C.woodL], [C.sky], [C.white], [C.sakura]], nordic: [[N.linen]], modern: [[M.gray]], japanese: [[J.hinoki]] }), build: laundryBasket },

  { id: 'shoe-cabinet', name: '鞋柜', family: 'shoe-cabinet', sizeLabel: '标准', category: 'entrance', w: 80, d: 36, h: 100, surface: 100, surfaces: SHOE_CAB_SURF, openable: true, ...woods, build: shoeCabinet },
  { id: 'umbrella-stand', name: '伞架', family: 'umbrella-stand', sizeLabel: '经典圆桶', category: 'entrance', w: 24, d: 24, h: 80, ...sty({ cute: [[C.white], [C.sky], [C.sakura]], nordic: [[N.white]], modern: [[M.char]], japanese: [[J.dark]], industrial: [[I.iron]] }), build: umbrellaStand },

  { id: 'planter', name: '花箱', family: 'planter', sizeLabel: '标准', category: 'outdoor', w: 64, d: 24, h: 50, ...pots([[C.white], [C.woodL], [C.peach], [C.sky]]), build: planter },
  { id: 'aircon', name: '壁挂空调', family: 'aircon', sizeLabel: '标准', category: 'appliance', w: 96, d: 25, h: 28, mount: AIRCON_MOUNT, ...sty({ cute: [[C.white], [C.sakura], [C.sky]], modern: [[M.white], [M.char]], nordic: [[N.white]] }), build: aircon },
  { id: 'laundry-stand', name: '晾衣架', family: 'laundry-stand', sizeLabel: '标准', category: 'outdoor', w: 156, d: 46, h: 160, surfaces: [{ y: 151.7, kind: 'hook', h: 146, shape: [rectPoly(-69, -0.5, 69, 2.5)] }], ...sty({ cute: [[C.white], [C.sky]], modern: [[M.silver]], industrial: [[I.iron]] }), build: laundryStand },

  { id: 'fx-kitchen', name: '整体厨房', category: 'appliance', w: 255, d: 65, h: 120, palettes: [[]], build: () => kitchenModel(255, false), fixture: true },
  { id: 'fx-kitchen-facing', name: '对面式厨房', category: 'appliance', w: 255, d: 200, h: 120, palettes: [[]], build: () => kitchenModel(255, true), fixture: true },
  // 冰箱位 / 洗衣机位只是预留空间：机器本身是家具（packs/appliances-pack.ts）
  { id: 'fx-fridge', name: '冰箱位', category: 'appliance', w: 65, d: 65, h: 1, palettes: [[]], build: () => fridgeSpotModel(65, 65), fixture: true },
  { id: 'fx-washer', name: '洗衣机位', category: 'appliance', w: 64, d: 64, h: 115, palettes: [[]], build: () => washerSpotModel(64, 64), fixture: true },
  { id: 'fx-bathtub', name: '浴缸', category: 'appliance', w: 140, d: 75, h: 58, palettes: [[]], build: () => bathtubModel(140, 75), fixture: true },
  { id: 'fx-toilet', name: '马桶', category: 'appliance', w: 40, d: 70, h: 78, palettes: [[]], build: () => toiletModel(40, 70), fixture: true },
  { id: 'fx-basin', name: '洗面台', category: 'appliance', w: 75, d: 55, h: 92, palettes: [[]], build: () => basinModel(75, 55), fixture: true },
  { id: 'fx-outdoor', name: '空调外机', category: 'appliance', w: 80, d: 30, h: 60, palettes: [[]], build: () => outdoorUnitModel(80, 30), fixture: true },
]

ASSETS.push(...PACKS)

// 语义标签：def 里写的 + 迁移生成的初始表（tags.generated.ts），合并去重
for (const a of ASSETS) {
  const g = GENERATED_TAGS[a.id]
  if (g) a.tags = a.tags ? [...new Set([...a.tags, ...g])] : [...g]
  // 细分类型 / 同款系列：def 里写了的优先，否则用迁移生成的（taxonomy.generated.ts）；没有系列的自成一款
  const x = TAXONOMY[a.id]
  if (x) {
    a.type ??= x[0]
    a.series ??= x[1]
    a.limitGroup ??= x[2]
  }
  a.series ??= a.id
}

// 尺寸校正：实测比声明大的放大、陷地的抬起（预计算结果见 dims.generated.ts，由 pnpm gen:dims 生成；规则见 dims.ts）
applyDims(ASSETS, DIMS)

export const ASSET_MAP = new Map(ASSETS.map((a) => [a.id, a]))
if (import.meta.env.DEV && ASSET_MAP.size !== ASSETS.length) {
  const seen = new Set<string>()
  console.warn('素材 id 重复：', ASSETS.filter((a) => seen.has(a.id) || !seen.add(a.id)).map((a) => a.id))
}

/** 仅开发环境：检查 dims.generated.ts 是否过期（只告警，不改数据） */
export function checkDimsFresh() {
  if (!import.meta.env.DEV) return
  warnIfDimsStale(ASSETS, DIMS)
}
