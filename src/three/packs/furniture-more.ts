// 更多大件家具：沙发、床、柜类、桌台、玄关 / 和风 / 儿童 / 宠物。约定见 kit.ts 开头。
// 布艺部分（沙发布面、床品、软包）直接用 palette 槽位颜色 p[0] / p[1]，不 shade，方便主程序识别布面加花纹。
// 顶面、层板一律留空并声明 surface / surfaces。

import * as THREE from 'three'
import { ball, cup, cyl, markMirror, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, SWING_OPEN, hangingPipe, holePanel, legs, movable, paintPanel, pipeHook, rectPoly, shell, slab, type AssetDef, type DoorMotion, type Hole, type Poly, type SurfaceDef } from '../kit'
import { batten, cylX, cylZ, glassPane, lit, meshWith, rod3, type V3 } from '../geo'
import { I, J, M, N, R, withPals, type Pal3 } from '../packkit'

const BRASS = '#d4b25a'
const CHROME = '#d0d5db'
const TIRE = '#3a3a3c'

// ---------- 小工具 ----------

function extrude(s: THREE.Shape, depth: number) {
  const bevel = Math.min(0.5, depth * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 20 })
  geo.translate(0, 0, -depth / 2 + bevel)
  return geo
}

/** xy 平面轮廓沿 z 挤出（厚 depth，中心在 z） */
function prism(pts: [number, number][], depth: number, color: string, z = 0) {
  const m = meshWith(extrude(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), depth), toon(color))
  m.position.z = z
  return m
}

/** 侧板：轮廓在 zy 平面（[z, y]），沿 x 挤出厚 t，中心在 x */
function sidePrism(pts: [number, number][], t: number, color: string, x: number) {
  const m = prism(pts, t, color)
  m.rotation.y = -Math.PI / 2
  m.position.set(x, 0, 0)
  return m
}

/** 编织藤面：方孔阵列 */
function weave(w: number, h: number, cell = 7, hole = 4.5): Hole[] {
  const holes: Hole[] = []
  const nx = Math.floor((w - 4) / cell)
  const ny = Math.floor((h - 4) / cell)
  const x0 = (-(nx - 1) * cell) / 2
  const y0 = (h - (ny - 1) * cell) / 2 - hole / 2
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) holes.push({ kind: 'rect', x: x0 + i * cell, y: y0 + j * cell, w: hole, h: hole, r: 0.8 })
  return holes
}

/** 方格栅（组子）：cols × rows 个方孔 */
function lattice(w: number, h: number, cols: number, rows: number, bar = 2.4, margin = 3): Hole[] {
  const holes: Hole[] = []
  const cw = (w - margin * 2 - bar * (cols - 1)) / cols
  const ch = (h - margin * 2 - bar * (rows - 1)) / rows
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) holes.push({ kind: 'rect', x: -w / 2 + margin + cw / 2 + i * (cw + bar), y: margin + j * (ch + bar), w: cw, h: ch, r: 0.4 })
  return holes
}

/**
 * 开口柜体：两块侧板、出沿 0.6 的顶板、底板、背板。
 * 内部：x ∈ ±(w/2 - t)，地板顶面 y0 + 0.4 + t，天花 y0 + h - t。
 */
function carcass(w: number, h: number, d: number, color: string, y0 = 0, t = 2.5) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(t, h - 0.8, d, color, { x: s * (w / 2 - t / 2), y: y0 }, Math.min(1, t * 0.3)))
  g.add(rbox(w + 1.2, t, d + 1.2, color, { y: y0 + h - t }, 1))
  g.add(rbox(w - 2 * t + 0.6, t, d - 1.6, color, { y: y0 + 0.4 }, 0.6))
  g.add(rbox(w - 2 * t + 0.4, h - t - 0.8, 1.2, shade(color, -0.06), { y: y0 + 0.5, z: -d / 2 + 0.8 }, 0.4))
  return g
}

/** 柜内竖隔板 */
function divider(x: number, y0: number, y1: number, d: number, color: string, t = 2.2) {
  return rbox(t, y1 - y0 + 0.2, d - 2.8, color, { x, y: y0 - 0.1, z: 0.4 }, 0.6)
}

/** 门板 / 抽屉面：贴在柜体正面（z = d/2）外，背面嵌进去 0.4 */
function front(w: number, h: number, d: number, color: string, x: number, y: number) {
  return rbox(w, h, 1.6, color, { x, y, z: d / 2 + 0.4 }, 0.8)
}

/** 玻璃门：框 + 玻璃，at 为底边中点 */
function glassDoor(w: number, h: number, color: string, x: number, y: number, z: number, bar = 2.5) {
  const g = new THREE.Group()
  g.add(rbox(w, bar, 1.4, color, { y: 0 }, 0.5))
  g.add(rbox(w, bar, 1.4, color, { y: h - bar }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(bar, h - bar * 2 + 0.4, 1.4, color, { x: s * (w / 2 - bar / 2), y: bar - 0.2 }, 0.5))
  g.add(glassPane(w - bar * 2 + 0.4, h - bar * 2 + 0.4, 0.5, { y: bar - 0.2, z: 0 }))
  g.position.set(x, y, z)
  return g
}

const knob = (x: number, y: number, z: number, color: string, r = 1.6) => ball(r, color, { x, y, z })
const pullBar = (w: number, x: number, y: number, z: number, color: string) => rbox(w, 1.5, 1.5, color, { x, y: y - 0.75, z }, 0.6)

// ---------- 可开合部件：把原来的门板 / 抽屉面（连同把手）原样收进一个会动的 Group ----------

/** 把一组部件收进以 at 为原点的 Group（部件位置不变），标上开合动作 */
function pivot(parts: THREE.Object3D[], at: V3, m: DoorMotion) {
  const g = new THREE.Group()
  g.position.set(...at)
  for (const o of parts) {
    o.position.x -= at[0]
    o.position.y -= at[1]
    o.position.z -= at[2]
    g.add(o)
  }
  return movable(g, m)
}
/** 平开门：铰链竖线在 (hx, hz)；left = 铰链在门的左边（门往 +x 伸） */
const swingAt = (parts: THREE.Object3D[], hx: number, hz: number, left: boolean) => pivot(parts, [hx, 0, hz], { kind: 'swing', angle: (left ? -1 : 1) * SWING_OPEN })
/** 抽屉：整体往 +z 拉出 dz */
const pullOut = (parts: THREE.Object3D[], dz: number) => pivot(parts, [0, 0, 0], { kind: 'drawer', dz })
/** 推拉门：沿 x 推 dx */
const slideBy = (parts: THREE.Object3D[], dx: number) => pivot(parts, [0, 0, 0], { kind: 'slide', dx })
/** 翻门：铰链横线在 (hy, hz)，angle 为 rotation.x 的增量（底边铰链往外放倒为正） */
const flapAt = (parts: THREE.Object3D[], hy: number, hz: number, angle: number) => pivot(parts, [0, hy, hz], { kind: 'flap', angle })

/** 抽屉盒（敞口托盘）：面板背面在 zf，往后深 depth；x / y 为盒子底面中心 */
function drawerTray(w: number, h: number, depth: number, color: string, x: number, y: number, zf: number) {
  return tray(w, h, depth, 0.8, color, { x, y, z: zf - depth / 2 })
}
/** 药柜 6 × 8 小抽屉：格宽、行高、每格面板的 [x, 底边 y] */
const APO_CW = 96 / 6
const APO_RH = 104 / 8
const APOTHECARY_CELLS: [number, number][] = Array.from({ length: 48 }, (_, k) => [-48 + APO_CW * ((k % 6) + 0.5), 11 + APO_RH * Math.floor(k / 6) + 0.5])
/** 抽屉盒的可摆放层：托盘内底在 y（离地），x0..x1、zf - depth..zf，打开时拉出 dz */
const drawerSurf = (x0: number, x1: number, y: number, zf: number, depth: number, h: number, dz: number): SurfaceDef => ({ y, h, inside: true, slide: dz, shape: [rectPoly(x0 + 1.2, zf - depth + 1.2, x1 - 1.2, zf - 1.2)] })

/** 床垫 + 被子 + 枕头：床垫底面 y0、床头在 z0（往 +z 延伸 len），床垫用 p[1]，被子用 p[0] */
function bedding(g: THREE.Group, w: number, len: number, y0: number, z0: number, p: string[], mh = 20, duvetOver = 2) {
  const [duvet, sheet] = p
  g.add(rbox(w, mh, len, sheet, { y: y0, z: z0 + len / 2 }, 5))
  const top = y0 + mh
  const pillows = w > 120 ? 2 : 1
  const pw = Math.min(62, (w - 16) / pillows - 4)
  for (let i = 0; i < pillows; i++) {
    const x = pillows === 1 ? 0 : (i - 0.5) * (pw + 6)
    g.add(rbox(pw, 11, 34, C.white, { x, y: top - 1, z: z0 + 24, rx: -0.12 }, 5))
  }
  const dz = len - 56
  g.add(rbox(w + duvetOver * 2, 8, dz, duvet, { y: top - 1, z: z0 + len - dz / 2 }, 4))
  g.add(rbox(w + duvetOver * 2 + 0.4, 3, 15, duvet, { y: top + 5.5, z: z0 + len - dz + 7.5 }, 1.5))
}

/** 把模型在 xz 上居中（只用于没有 surface 声明的自由造型） */
function centerGroupLoose(g: THREE.Group) {
  const box = new THREE.Box3().setFromObject(g)
  const out = new THREE.Group()
  g.position.x -= (box.min.x + box.max.x) / 2
  g.position.z -= (box.min.z + box.max.z) / 2
  out.add(g)
  return out
}

// =====================================================================
// 沙发
// =====================================================================

/** 切斯特菲尔德拉扣沙发：卷边扶手和靠背等高，满布拉扣 */
function chesterfield(p: string[]) {
  const [main, sub, wood] = p
  const g = new THREE.Group()
  const btn = shade(main, -0.18)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(3.6, 2.6, 8.4, shade(wood, -0.05), { x: sx * 90, z: sz * 36 }, 12))
  g.add(rbox(196, 22, 84, main, { y: 8 }, 5))
  for (const s of [-1, 1]) {
    g.add(rbox(18, 58, 86, main, { x: s * 90, y: 8 }, 6))
    g.add(cylZ(8, 88, main, s * 91, 67, 0, 16))
    for (const z of [-24, -4, 16, 36]) for (const y of [40, 52]) g.add(ball(1.1, btn, { x: s * 80.9, y, z: z + (y === 52 ? -10 : 0) }))
  }
  g.add(rbox(196, 64, 16, main, { y: 12, z: -35 }, 6))
  g.add(cylX(6.5, 192, main, 0, 70, -36))
  for (let r = 0; r < 4; r++) {
    const y = 44 + r * 7.5
    const off = r % 2 ? 8 : 0
    for (let x = -72 + off; x <= 72; x += 16) g.add(ball(1.1, btn, { x, y, z: -26.9 }))
  }
  for (let i = 0; i < 3; i++) g.add(rbox(53, 13, 68, main, { x: (i - 1) * 54, y: 30, z: 7 }, 5))
  g.add(rbox(34, 30, 11, sub, { x: -52, y: 42, z: -18, rx: -0.25, rz: 0.18 }, 5))
  return g
}

/** 模块化组合沙发：n 个无扶手模块 + 两端矮扶手 */
function modularSofa(n: number, p: string[]) {
  const [main, sub] = p
  const mw = 80
  const arm = 14
  const d = 98
  const w = n * mw + arm * 2
  const g = new THREE.Group()
  g.add(rbox(w - 12, 4, d - 12, shade(main, -0.35), {}, 1))
  for (const s of [-1, 1]) g.add(rbox(arm, 46, d, main, { x: s * (w / 2 - arm / 2), y: 4 }, 5))
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + arm + mw * (i + 0.5)
    g.add(rbox(mw - 0.6, 26, d, main, { x, y: 4 }, 4))
    g.add(rbox(mw - 1.5, 12, 74, main, { x, y: 30, z: 11 }, 5))
    g.add(rbox(mw - 1.5, 34, 20, main, { x, y: 30, z: -37, rx: -0.08 }, 6))
  }
  g.add(rbox(34, 28, 11, sub, { x: -w / 2 + arm + 24, y: 42, z: -21, rx: -0.22, rz: 0.15 }, 5))
  g.add(rbox(32, 26, 10, sub, { x: w / 2 - arm - 24, y: 42, z: -21, rx: -0.22, rz: -0.15 }, 5))
  return g
}

/** 日式低矮布沙发：木格栅扶手 + 厚坐垫 */
function jpLowSofa(p: string[]) {
  const [main, sub, wood] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(5, 50, 5, wood, { x: sx * 82, z: sz * 36 }, 1))
    g.add(rbox(7, 3, 80, wood, { x: sx * 82, y: 50 }, 1))
    g.add(rbox(4, 3, 68, wood, { x: sx * 82, y: 14 }, 0.8))
    for (let z = -28; z <= 28; z += 8) g.add(rbox(2.2, 33.4, 2.2, wood, { x: sx * 82, y: 16.8, z }, 0.6))
  }
  g.add(rbox(160, 4, 76, wood, { y: 14 }, 1))
  g.add(rbox(160, 6, 3, wood, { y: 8, z: 36.5 }, 1))
  g.add(rbox(160, 4, 4, wood, { y: 46, z: -36 }, 1))
  for (let x = -70; x <= 70; x += 14) g.add(rbox(2.4, 28, 2.2, wood, { x, y: 18, z: -36 }, 0.6))
  g.add(rbox(156, 14, 70, main, { y: 18, z: 3 }, 5))
  for (const s of [-1, 1]) g.add(rbox(77, 29, 14, main, { x: s * 39, y: 31, z: -26, rx: -0.15 }, 5))
  g.add(rbox(32, 28, 10, sub, { x: -48, y: 32, z: -14, rx: -0.2, rz: 0.1 }, 4))
  return g
}

/** 藤编沙发：圆木框 + 方孔藤面 */
function rattanSofa(p: string[]) {
  const [main, sub, frame] = p
  const cane = shade(frame, 0.12)
  const g = new THREE.Group()
  const X = 70
  const Z = 33
  for (const sx of [-1, 1]) {
    g.add(cyl(2.2, 2, 62, frame, { x: sx * X, z: Z }, 12))
    g.add(cyl(2.2, 2, 80, frame, { x: sx * X, z: -Z }, 12))
    g.add(cylZ(2.2, 70.4, frame, sx * X, 60, 0, 16))
    g.add(cylZ(1.8, 66, frame, sx * X, 33, 0, 16))
    g.add(cylZ(1.4, 66, frame, sx * X, 8, 0, 16))
    g.add(holePanel(64, 25, 1.2, cane, weave(64, 25), { x: sx * X, y: 34.5, ry: Math.PI / 2 }))
  }
  for (const z of [-Z, Z]) {
    g.add(cylX(1.8, 140, frame, 0, 33, z))
    g.add(cylX(1.4, 140, frame, 0, 8, z))
  }
  g.add(cylX(2.2, 140, frame, 0, 78, -Z))
  g.add(holePanel(134, 41, 1.2, cane, weave(134, 41), { y: 35, z: -Z }))
  g.add(rbox(138, 3, 64, shade(frame, -0.05), { y: 33 }, 1))
  g.add(rbox(134, 12, 62, main, { y: 36, z: 1 }, 5))
  for (const s of [-1, 1]) g.add(rbox(65, 30, 12, main, { x: s * 33, y: 46, z: -24, rx: -0.15 }, 5))
  g.add(rbox(30, 28, 10, sub, { x: 40, y: 47, z: -13, rx: -0.25, rz: -0.15 }, 4))
  return g
}

/** 天鹅绒弧形沙发：一体弧形靠背 */
function curveSofa(p: string[]) {
  const [main, sub] = p
  const Ro = 160
  const Ri = 136
  const cz = 110
  const a = Math.asin(110 / Ro)
  const arc = (r: number, t0: number, t1: number, n: number): Poly =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = t0 + ((t1 - t0) * i) / n
      return [r * Math.sin(t), cz - r * Math.cos(t)] as [number, number]
    })
  const e = Ro - 60
  const ex = e * Math.sin(a)
  const ez = cz - e * Math.cos(a)
  const sag = 50 - ez
  const Rf = (ex * ex + sag * sag) / (2 * sag)
  const fcz = 50 - Rf
  const ua = Math.asin(ex / Rf)
  const frontArc: Poly = Array.from({ length: 17 }, (_, i) => {
    const u = ua - (2 * ua * i) / 16
    return [Rf * Math.sin(u), fcz + Rf * Math.cos(u)] as [number, number]
  })
  const seat: Poly = [...arc(Ro, -a, a, 28), ...frontArc]
  const back: Poly = [...arc(Ro, -a, a, 28), ...arc(Ri, a, -a, 28)]
  const g = new THREE.Group()
  g.add(slab(seat.map(([x, z]) => [x * 0.9, 15 + (z - 15) * 0.85] as [number, number]), 5, shade(main, -0.35), 0))
  g.add(slab(seat, 34, main, 4))
  g.add(slab(back, 34, main, 38))
  g.add(puck(15, 10, sub, { x: -42, y: 48, z: -11, rx: 1.4 }))
  g.add(rbox(36, 30, 11, sub, { x: 44, y: 38, z: -11, rx: -0.25, rz: -0.15 }, 5))
  return g
}

/** 功能躺椅：合上 / 打开（靠背放倒 + 脚托伸出） */
function recliner(p: string[], open: boolean) {
  const [main, sub, base] = p
  const g = new THREE.Group()
  g.add(rbox(76, 6, 76, base, {}, 1))
  for (const s of [-1, 1]) g.add(rbox(18, 58, 88, main, { x: s * 37, y: 6 }, 7))
  g.add(rbox(56.4, 30, 84, main, { y: 6, z: 2 }, 3))
  g.add(rbox(56, 13, 66, main, { y: 36, z: 8 }, 5))
  const bk = new THREE.Group()
  bk.add(rbox(58, 60, 20, main, { z: -2 }, 7))
  bk.add(rbox(50, 16, 10, sub, { y: 42, z: 11 }, 4))
  bk.position.set(0, 40, -32)
  bk.rotation.x = open ? -0.55 : -0.1
  g.add(bk)
  g.add(rbox(3, 10, 6, base, { x: 46.5, y: 30, z: 20 }, 1))
  if (open) {
    g.add(rbox(54, 10, 40, main, { y: 30, z: 66 }, 4))
    for (const s of [-1, 1]) {
      g.add(rod3([s * 20, 14, 40], [s * 20, 31, 60], 1, base))
      g.add(rod3([s * 20, 31, 44], [s * 20, 14, 62], 1, base))
    }
  } else {
    g.add(rbox(54, 26, 3, main, { y: 8, z: 44.5 }, 1.5))
  }
  return centerGroupLoose(g)
}

/** 双人卡座：贴墙，竖条拉扣靠背 */
function booth(p: string[]) {
  const [main, sub, base] = p
  const g = new THREE.Group()
  g.add(rbox(124, 4, 46, shade(base, -0.3), { z: 4 }, 1))
  g.add(rbox(130, 36, 52, base, { y: 4, z: 4 }, 2))
  g.add(rbox(130.4, 6, 0.8, sub, { y: 24, z: 30.2 }, 0.3))
  for (const y of [22.6, 30.6]) g.add(rbox(130.6, 1.2, 1, CHROME, { y, z: 30.3 }, 0.4))
  g.add(rbox(126, 10, 50, main, { y: 40, z: 5 }, 4))
  g.add(rbox(130, 104, 8, base, { z: -27 }, 2))
  g.add(rbox(132, 3, 10, shade(base, -0.08), { y: 104, z: -27 }, 1))
  for (let i = 0; i < 5; i++) g.add(rbox(24.4, 50, 9, main, { x: -50.8 + i * 25.4, y: 52, z: -18.5, rx: -0.06 }, 4.5))
  return centerGroupLoose(g)
}

/** 云朵沙发：一团团鼓起的软包 */
function cloudSofa(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(180, 4, 80, shade(main, -0.35), {}, 1))
  g.add(rbox(196, 30, 92, main, { y: 3 }, 14))
  for (const s of [-1, 1]) {
    for (const z of [-24, 0, 22]) g.add(ball(19, main, { x: s * 81, y: 40, z }))
    g.add(ball(16, main, { x: s * 82, y: 36, z: 29 }))
  }
  for (let i = 0; i < 5; i++) g.add(ball(22, main, { x: -64 + i * 32, y: 50, z: -30 }, [1, 0.9, 0.7]))
  for (const s of [-1, 1]) g.add(rbox(78, 16, 62, main, { x: s * 39.5, y: 30, z: 10 }, 8))
  g.add(puck(13, 9, sub, { x: -38, y: 54.5, z: -12, rx: 1.4 }))
  g.add(puck(11, 8, sub, { x: 40, y: 51, z: -12, rx: 1.4 }))
  return g
}

/** 日床（daybed）：三面木格栅围合的长榻，可坐可躺 */
function daybed(p: string[]) {
  const [main, sub, wood] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    g.add(rbox(5, 72, 5, wood, { x: sx * 96, z: -42 }, 1))
    g.add(rbox(5, 56, 5, wood, { x: sx * 96, z: 42 }, 1))
    g.add(rbox(5, 4, 89, wood, { x: sx * 96, y: 52 }, 1))
    for (let z = -30; z <= 30; z += 10) g.add(rbox(2, 30.4, 2, wood, { x: sx * 96, y: 21.8, z }, 0.5))
  }
  g.add(rbox(188, 8, 88, wood, { y: 14 }, 1.5))
  g.add(rbox(188, 4, 5, wood, { y: 68, z: -42 }, 1))
  for (let x = -84; x <= 84; x += 12) g.add(rbox(2, 46.4, 2, wood, { x, y: 21.8, z: -42 }, 0.5))
  g.add(rbox(186, 14, 80, main, { y: 22, z: 2 }, 5))
  for (let i = 0; i < 3; i++) g.add(rbox(58, 30, 12, main, { x: (i - 1) * 61, y: 35, z: -31, rx: -0.12 }, 5))
  for (const s of [-1, 1]) g.add(cylZ(9, 60, sub, s * 82, 45, 8, 16))
  return g
}

// =====================================================================
// 床
// =====================================================================

/** 帷幔床：四柱 + 顶框，外侧挂半透明纱帘（纱帘在柱子外，不穿床） */
function canopyBed(p: string[]) {
  const [duvet, sheet, frame] = p
  const g = new THREE.Group()
  const X = 72
  const Z = 103
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 205, 6, frame, { x: sx * X, z: sz * Z }, 1.5))
  for (const s of [-1, 1]) {
    g.add(rbox(138, 5, 5, frame, { y: 200, z: s * Z }, 1))
    g.add(rbox(5, 5, 200, frame, { x: s * X, y: 200 }, 1))
  }
  g.add(rbox(138, 22, 200, frame, { y: 12 }, 2))
  g.add(rbox(138, 60, 4, frame, { y: 34, z: -101 }, 1.5))
  g.add(cylZ(18, 4, frame, 0, 92, -101, 32))
  g.add(rbox(138, 18, 4, frame, { y: 34, z: 101 }, 1.5))
  bedding(g, 134, 196, 34, -98, p, 18)
  const sheer = (m: THREE.Mesh) => {
    m.material = toon(sheet, { transparent: 0.45 })
    return m
  }
  for (const s of [-1, 1]) {
    g.add(sheer(rbox(152, 22, 0.6, sheet, { y: 182, z: s * 106.3 }, 0.2)))
    g.add(sheer(rbox(0.6, 22, 213.2, sheet, { x: s * 75.3, y: 182 }, 0.2)))
    for (const sz of [-1, 1]) {
      g.add(sheer(rbox(1.2, 160, 26, sheet, { x: s * 76.4, y: 22, z: sz * 88 }, 0.4)))
      g.add(rbox(1.6, 3, 27, duvet, { x: s * 77.2, y: 95, z: sz * 88 }, 0.6))
    }
  }
  g.add(sheer(rbox(150, 0.6, 210, sheet, { y: 205.2 }, 0.2)))
  return g
}

/** 四柱木床：车削柱 + 组子格栅床头，床架抬高，床底可放收纳箱 */
function fourPoster(p: string[]) {
  const [, , wood] = p
  const g = new THREE.Group()
  const X = 79
  const Z = 106
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * X
      const z = sz * Z
      g.add(rbox(9, 22, 9, wood, { x, z }, 1.5))
      g.add(cyl(3.5, 3.5, 168, wood, { x, y: 20, z }, 16))
      g.add(puck(4.8, 3, wood, { x, y: 64, z }))
      g.add(ball(4.5, wood, { x, y: 190, z }))
    }
  for (const s of [-1, 1]) {
    g.add(rbox(2 * X, 5, 4, wood, { y: 178, z: s * Z }, 1))
    g.add(rbox(4, 5, 2 * Z, wood, { x: s * X, y: 178 }, 1))
    g.add(rbox(4, 10, 2 * Z - 5, wood, { x: s * (X - 2), y: 30 }, 1))
  }
  g.add(rbox(150, 4, 205, shade(wood, -0.1), { y: 36 }, 1))
  // 床头 / 床尾格栅两端插进柱子里（以前和柱子之间留着 1cm 缝）
  g.add(holePanel(153, 76, 3, wood, lattice(153, 76, 6, 3), { y: 40, z: -Z }))
  g.add(holePanel(153, 28, 3, wood, lattice(153, 28, 6, 1), { y: 30, z: Z }))
  bedding(g, 146, 200, 40, -100, p, 20, 1.5)
  return g
}

/** 榻榻米床台：木框里嵌榻榻米，上面铺被褥 */
function tatamiBed(w: number, p: string[]) {
  const [duvet, sheet, frame] = p
  const d = 212
  const g = new THREE.Group()
  g.add(rbox(w - 14, 5, d - 14, shade(frame, -0.3), {}, 1))
  g.add(rbox(w, 22, d, frame, { y: 5 }, 2))
  for (const s of [-1, 1]) {
    g.add(rbox(w, 6, 4, frame, { y: 27, z: s * (d / 2 - 2) }, 1))
    g.add(rbox(4, 6, d - 8, frame, { x: s * (w / 2 - 2), y: 27 }, 1))
  }
  const mats = w > 110 ? 2 : 1
  const mw = (w - 8) / mats
  for (let i = 0; i < mats; i++) {
    const x = -w / 2 + 4 + mw * (i + 0.5)
    g.add(rbox(mw - 0.4, 3.4, d - 8, J.tatami, { x, y: 27 }, 0.6))
    // 畳縁比榻榻米外侧多出 0.15，避免两者侧面共面闪烁
    for (const s of [-1, 1]) g.add(rbox(2.6, 3.7, d - 8, J.sumi, { x: x + s * (mw / 2 - 1.35), y: 27 }, 0.4))
  }
  const n = w >= 140 ? 2 : 1
  const fw = (w - 16) / n - 2
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i - 0.5) * (fw + 3)
    g.add(rbox(fw, 8, 196, sheet, { x, y: 30.4 }, 3))
    g.add(rbox(fw + 3, 7, 136, duvet, { x, y: 37.4, z: 30 }, 3))
    g.add(rbox(fw + 3.4, 2.5, 14, duvet, { x, y: 43.4, z: -31 }, 1.2))
    g.add(rbox(Math.min(48, fw - 10), 9, 30, C.white, { x, y: 37.4, z: -78 }, 4))
  }
  return g
}

/** 抽屉储物床：两侧各两个大抽屉（往两侧拉出），床头板顶面可放东西 */
function storageBed(p: string[]) {
  const [, , frame] = p
  const g = new THREE.Group()
  const fr = shade(frame, 0.06)
  const pull = shade(frame, -0.35)
  g.add(rbox(160, 85, 16, frame, { z: -96 }, 2))
  g.add(rbox(140, 4, 182, shade(frame, -0.3), { z: 8 }, 1))
  g.add(rbox(150, 28, 192, frame, { y: 4, z: 8 }, 2))
  for (const s of [-1, 1]) {
    // 抽屉朝两侧拉：在一个转了 ±90° 的局部坐标里做（局部 +z = 世界 ±x），抽屉动作照常沿局部 +z
    const side = new THREE.Group()
    side.rotation.y = (s * Math.PI) / 2
    for (const zc of [-38, 54]) {
      const lx = s > 0 ? -zc : zc
      side.add(
        pullOut(
          [
            rbox(88, 22, 1.6, fr, { x: lx, y: 6, z: 75.4 }, 0.6),
            rbox(24, 1.5, 1.5, pull, { x: lx, y: 22, z: 76.8 }, 0.6),
            drawerTray(84, 18, 60, shade(frame, 0.12), lx, 7, 74.6),
          ],
          40,
        ),
      )
    }
    g.add(side)
  }
  bedding(g, 146, 190, 32, -86, p, 20)
  return g
}

/** 圆床：圆形床座 + 弧形软包床头 */
function roundBed(p: string[]) {
  const [duvet, sheet, frame] = p
  const g = new THREE.Group()
  g.add(cyl(88, 88, 5, shade(frame, -0.3), {}, 48))
  g.add(cyl(106, 104, 30, frame, { y: 5 }, 48))
  g.add(puck(101, 22, sheet, { y: 33 }))
  const t0 = -1.2
  const t1 = 1.2
  const ring: Poly = []
  for (let i = 0; i <= 24; i++) {
    const t = t0 + ((t1 - t0) * i) / 24
    ring.push([118 * Math.sin(t), -118 * Math.cos(t)])
  }
  for (let i = 24; i >= 0; i--) {
    const t = t0 + ((t1 - t0) * i) / 24
    ring.push([106.2 * Math.sin(t), -106.2 * Math.cos(t)])
  }
  g.add(slab(ring, 75, frame, 5))
  const btn = shade(frame, -0.2)
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 9; i++) {
      const t = -0.95 + (1.9 * (i + (r % 2) * 0.5)) / 9
      if (t > 0.95) continue
      g.add(ball(1.2, btn, { x: 106 * Math.sin(t), y: 58 + r * 7, z: -106 * Math.cos(t) }))
    }
  g.add(puck(86, 6, duvet, { y: 53, z: 14 }))
  for (const s of [-1, 1]) g.add(rbox(48, 12, 30, C.white, { x: s * 27, y: 54, z: -70, rx: -0.15 }, 5))
  g.add(puck(13, 9, duvet, { x: 0, y: 62, z: -58, rx: 1.3 }))
  return centerGroupLoose(g)
}

/** 铁艺床：圆管床头床尾 + 小圆圈装饰，床底净空约 28cm */
function ironBed(p: string[]) {
  const [, , iron] = p
  const g = new THREE.Group()
  const X = 70
  const Z = 103
  for (const s of [-1, 1]) {
    g.add(cyl(2.5, 2.5, 108, iron, { x: s * X, z: -Z }, 12))
    g.add(ball(3.5, iron, { x: s * X, y: 109, z: -Z }))
    g.add(cyl(2.5, 2.5, 82, iron, { x: s * X, z: Z }, 12))
    g.add(ball(3.5, iron, { x: s * X, y: 83, z: Z }))
    g.add(rbox(3, 8, 2 * Z - 4, iron, { x: s * X, y: 28 }, 1))
  }
  for (const [z, y0, y1] of [
    [-Z, 40, 100],
    [Z, 40, 75],
  ]) {
    g.add(cylX(1.6, 2 * X, iron, 0, y0, z))
    g.add(cylX(1.6, 2 * X, iron, 0, y1, z))
    for (let x = -60; x <= 60; x += 12) g.add(cyl(0.9, 0.9, y1 - y0, iron, { x, y: y0, z }, 8))
    for (let x = -54; x <= 54; x += 12) g.add(torus(4.2, 0.7, iron, { x, y: (y0 + y1) / 2, z }))
  }
  // 横撑和床板两端搭到侧梁上（以前比侧梁内侧窄 1.5cm，整块床板悬空）
  for (const s of [-1, 1]) g.add(rbox(139, 3, 4, iron, { y: 32.4, z: s * 60 }, 0.8))
  g.add(rbox(139, 2, 198, shade(iron, 0.35), { y: 34 }, 0.6))
  bedding(g, 134, 200, 36, -100, p, 20, 1)
  return g
}

/** 北欧高脚木床：细锥腿 + 竖条床头，床底净空 30cm */
function nordicBed(p: string[]) {
  const [, , frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const z of [-97, 103]) g.add(cyl(2.8, 1.8, 30.4, shade(frame, -0.08), { x: sx * 71, z }, 12))
  g.add(rbox(150, 12, 210, frame, { y: 30, z: 2.5 }, 2))
  for (const s of [-1, 1]) g.add(rbox(5, 100, 5, frame, { x: s * 77.5, z: -105 }, 1.2))
  g.add(rbox(150, 6, 4, frame, { y: 94, z: -105 }, 1.2))
  g.add(rbox(150, 4, 4, frame, { y: 42, z: -105 }, 1))
  for (let x = -63; x <= 63; x += 14) g.add(rbox(8, 48, 2, shade(frame, 0.05), { x, y: 46, z: -105 }, 0.8))
  bedding(g, 150, 205, 42, -101, p, 22)
  return g
}

/** 折叠床：打开（铺平的钢管床） */
function foldingBedOpen(p: string[]) {
  const [mat, pillow, frame] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(cylZ(1.5, 196, frame, s * 44, 31, 0, 16))
    g.add(cylX(1.5, 88, frame, 0, 31, s * 98))
  }
  for (const z of [-88, 0, 88]) {
    for (const s of [-1, 1]) g.add(cyl(1.2, 1.2, 30, frame, { x: s * 42, z }, 8))
    g.add(cylX(1.2, 84, frame, 0, 1.2, z))
  }
  for (const s of [-1, 1]) g.add(rbox(4, 4, 6, shade(frame, -0.2), { x: s * 44, y: 29, z: 0 }, 1))
  g.add(rbox(86, 0.8, 194, shade(frame, -0.25), { y: 31 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(86, 10, 96.5, mat, { y: 32.4, z: s * 48.75 }, 4))
  g.add(rbox(50, 9, 30, pillow, { y: 41.5, z: -78 }, 4))
  return g
}

/** 折叠床：收起（对折竖立，带脚轮和绑带） */
function foldingBedClosed(p: string[]) {
  const [mat, pillow, frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(ball(3, TIRE, { x: sx * 40, y: 3, z: sz * 13 }))
      g.add(cyl(1, 1, 5, frame, { x: sx * 40, y: 4, z: sz * 13 }, 8))
    }
  for (const sz of [-1, 1]) {
    const z = sz * 13
    for (const sx of [-1, 1]) {
      g.add(cyl(1.5, 1.5, 100, frame, { x: sx * 44, y: 8, z }, 10))
      g.add(cyl(1.2, 1.2, 62, frame, { x: sx * 41, y: 20, z: sz * 15.8 }, 8))
    }
    g.add(cylX(1.5, 88, frame, 0, 8.5, z))
    g.add(cylX(1.5, 88, frame, 0, 107, z))
    g.add(rbox(86, 96, 0.8, shade(frame, -0.25), { y: 10, z: sz * 11.2 }, 0.3))
    g.add(rbox(86, 96.5, 10, mat, { y: 10, z: sz * 5.5 }, 4))
  }
  g.add(cylX(10.5, 86, mat, 0, 106, 0, 24))
  for (const s of [-1, 1]) {
    g.add(rbox(90, 4, 0.8, pillow, { y: 60, z: s * 17.6 }, 0.3))
    g.add(rbox(0.8, 4, 35.2, pillow, { x: s * 45.6, y: 60 }, 0.3))
  }
  return g
}

/** 酒店风床：整面竖条软包床头 + 床尾软包凳 */
function hotelBed(p: string[]) {
  const [uph, bed, frame] = p
  const g = new THREE.Group()
  g.add(rbox(190, 128, 8, frame, { z: -118 }, 2))
  for (let i = 0; i < 8; i++) g.add(rbox(22.6, 104, 6, uph, { x: -79.1 + i * 22.6, y: 18, z: -111.5 }, 3))
  g.add(rbox(192, 4, 10, shade(frame, -0.1), { y: 126, z: -117 }, 1))
  g.add(rbox(150, 5, 190, shade(frame, -0.35), { z: -10 }, 1))
  g.add(rbox(160, 28, 200, frame, { y: 5, z: -8 }, 2))
  g.add(rbox(156, 24, 198, bed, { y: 33, z: -8 }, 5))
  g.add(rbox(162, 8, 140, bed, { y: 55, z: 22 }, 4))
  g.add(rbox(162.4, 3, 14, bed, { y: 61, z: -41 }, 1.5))
  g.add(rbox(164, 9, 42, uph, { y: 54.8, z: 64 }, 3))
  for (const s of [-1, 1]) {
    g.add(rbox(56, 15, 30, C.white, { x: s * 31, y: 56, z: -92, rx: -0.3 }, 5))
    g.add(rbox(50, 12, 24, C.white, { x: s * 29, y: 56, z: -74, rx: -0.2 }, 5))
  }
  g.add(rbox(38, 20, 9, uph, { y: 57, z: -60, rx: -0.3 }, 4))
  const leg = shade(frame, -0.2)
  for (const sx of [-1, 1]) for (const z of [100, 132]) g.add(rbox(3, 33, 3, leg, { x: sx * 70, z }, 0.8))
  g.add(rbox(150, 3, 40, frame, { y: 33, z: 116 }, 1))
  g.add(rbox(148, 9, 38, uph, { y: 36, z: 116 }, 4))
  return centerGroupLoose(g)
}

/** 跑车儿童床 */
function carBed(p: string[]) {
  const [body, sheet, acc] = p
  const g = new THREE.Group()
  const prof: [number, number][] = [
    [-110, 6],
    [110, 6],
    [110, 28],
    [98, 38],
    [60, 42],
    [46, 52],
    [32, 44],
    [-62, 44],
    [-86, 58],
    [-110, 60],
  ]
  for (const s of [-1, 1]) {
    g.add(sidePrism(prof, 3, body, s * 48.75))
    for (const z of [-68, 70]) {
      g.add(cylX(17, 6, TIRE, s * 52, 17, z, 24))
      g.add(cylX(8, 6.6, acc, s * 52, 17, z, 20))
    }
    g.add(paintPanel(24, 24, 'fm-carbed-num', drawRaceNumber, { x: s * 50.4, y: 18, z: -8, ry: (s * Math.PI) / 2 }))
  }
  g.add(rbox(94.5, 4, 214, shade(body, -0.25), { y: 14 }, 1))
  g.add(rbox(94.5, 54, 3, body, { y: 6, z: -108.5 }, 1))
  g.add(rbox(94.5, 22, 3, body, { y: 6, z: 108.5 }, 1))
  g.add(rbox(90, 14, 190, sheet, { y: 18, z: -6 }, 4))
  g.add(rbox(50, 9, 30, C.white, { y: 31, z: -84 }, 4))
  for (const s of [-1, 1]) {
    g.add(rbox(4, 8.5, 4, acc, { x: s * 32, y: 60, z: -106 }, 1))
    g.add(lit(ball(4.5, C.lemon, { x: s * 32, y: 20, z: 110 }, [1, 1, 0.5]), C.lemon))
  }
  g.add(rbox(104, 3, 16, acc, { y: 68, z: -104 }, 1.2))
  g.add(paintPanel(22, 8, 'fm-carbed-plate', drawPlate, { y: 9, z: 110.1 }))
  return g
}

function drawRaceNumber(g: CanvasRenderingContext2D, W: number, H: number) {
  g.clearRect(0, 0, W, H)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(W / 2, H / 2, W * 0.48, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3a3a3c'
  g.font = `bold ${Math.round(H * 0.62)}px sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('7', W / 2, H * 0.54)
}

function drawPlate(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#fdfaf2'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#5a7a5a'
  g.lineWidth = Math.max(2, H * 0.08)
  g.strokeRect(2, 2, W - 4, H - 4)
  g.fillStyle = '#3d6b4a'
  g.font = `bold ${Math.round(H * 0.6)}px sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('KID 88', W / 2, H * 0.55)
}

// =====================================================================
// 柜类
// =====================================================================

/** 推拉门衣柜：空心柜体，里面一块枕棚 + 挂衣杆；前后两条轨道的推拉门，一扇带镜面 */
function slidingWardrobe(w: number, p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const n = w > 150 ? 3 : 2
  g.add(rbox(w - 4, 6, 52, shade(main, -0.25), { z: -2 }, 1))
  // 柜体（z -30..26）：背板、两侧、底板，顶盖原样
  g.add(rbox(w - 4, 190, 1.5, shade(main, -0.06), { y: 6, z: -29.25 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2, 190, 56, main, { x: s * (w / 2 - 1), y: 6, z: -2 }, 0.6))
  g.add(rbox(w - 4, 2, 54.5, main, { y: 6, z: -1.25 }, 0.4))
  g.add(rbox(w + 1, 4, 61, shade(main, -0.08), { y: 196 }, 1.2))
  g.add(rbox(w - 4, 1.8, 54, shade(main, 0.04), { y: 172.2, z: -1.5 }, 0.3))
  g.add(hangingPipe(-w / 2 + 2, w / 2 - 2, 166, -2, CHROME, 1.2))
  g.add(rbox(w - 4, 3, 5, shade(main, -0.15), { y: 6, z: 28.5 }, 0.8))
  const span = (w - 4) / n
  const dw = span + 3
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 2 + span * (i + 0.5)
    const z = i % 2 ? 29.6 : 27.4
    const parts: THREE.Object3D[] = [rbox(dw, 185, 2, sub, { x, y: 9.5, z }, 0.8)]
    if (i === Math.floor((n - 1) / 2) + (n === 2 ? 1 : 0)) parts.push(markMirror(rbox(dw - 12, 150, 0.6, '#d8ecf2', { x, y: 25, z: z + 1.1 }, 0.3)))
    else parts.push(rbox(dw - 8, 177, 0.6, shade(sub, 0.05), { x, y: 13.5, z: z + 1.1 }, 0.3))
    const hx = i === 0 ? dw / 2 - 4 : -(dw / 2 - 4)
    parts.push(rbox(1.6, 40, 1.4, acc, { x: x + hx, y: 80, z: z + 1.6 }, 0.6))
    // 前轨（奇数扇）推到左边那扇的前面
    if (i % 2) g.add(slideBy(parts, -span))
    else for (const o of parts) g.add(o)
  }
  return g
}

/** 一件挂起的衣服：衣架挂在 x 处、y 为挂杆高度，衣身在 yz 平面 */
function garment(x: number, rail: number, len: number, color: string, wd = 38) {
  const g = new THREE.Group()
  g.add(torus(1.6, 0.25, CHROME, { x, y: rail + 0.4, ry: Math.PI / 2 }))
  const top = rail - 4
  for (const s of [-1, 1]) g.add(rod3([x, top, s * (wd / 2 - 1)], [x, rail - 1, 0], 0.35, CHROME, 6))
  g.add(rbox(2.4, len, wd, color, { x, y: top - len + 0.5 }, 1))
  return g
}

const CLOTHES = [C.sky, C.white, R.mustard, N.sage, M.char, C.pink, N.blue, R.cream, I.leather]

/** 开放式衣帽间系统：左双挂杆 / 中抽屉 + 层板 / 右长挂杆 */
function closetSystem(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const d = 48
  const t = 2.5
  g.add(rbox(176, 4, 44, shade(main, -0.25), { z: 1 }, 1))
  for (const x of [-88.75, -30, 30, 88.75]) g.add(rbox(t, 203.5, d, main, { x, y: 4 }, 0.8))
  g.add(rbox(180, t, d, main, { y: 207.5 }, 0.8))
  const bays: [number, number][] = [
    [-87.5, -31.25],
    [-28.75, 28.75],
    [31.25, 87.5],
  ]
  const shelfIn = (x0: number, x1: number, y: number) => rbox(x1 - x0 + 0.4, t, d - 2, main, { x: (x0 + x1) / 2, y, z: 0.5 }, 0.6)
  for (const [x0, x1] of bays) {
    g.add(rbox(x1 - x0 + 0.2, 203.5, 1, shade(main, -0.06), { x: (x0 + x1) / 2, y: 4, z: -d / 2 + 0.5 }, 0.3))
    g.add(shelfIn(x0, x1, 183))
    g.add(shelfIn(x0, x1, 4))
  }
  // 左：上下两根挂杆
  for (const y of [178, 92]) g.add(cylX(1.2, 56.25, CHROME, -59.4, y, 0))
  for (let i = 0; i < 4; i++) g.add(garment(-84 + i * 6, 178, 68, CLOTHES[i]))
  for (let i = 0; i < 2; i++) g.add(garment(-83 + i * 7, 92, 46, CLOTHES[4 + i], 30))
  // 中：三层抽屉（可拉出）+ 两层板
  for (let i = 0; i < 3; i++) {
    const y = 7 + i * 20
    g.add(pullOut([rbox(56.5, 19, 1.6, sub, { y, z: d / 2 + 0.4 }, 0.8), pullBar(16, 0, y + 14, d / 2 + 1.8, acc), drawerTray(54, 15, 42, shade(main, 0.06), 0, y + 1, 23.6)], 26))
  }
  for (const y of [66, 100, 135]) g.add(shelfIn(-28.75, 28.75, y))
  // 右：长挂杆
  g.add(cylX(1.2, 56.25, CHROME, 59.4, 178, 0))
  for (let i = 0; i < 3; i++) g.add(garment(35 + i * 7, 178, 108, CLOTHES[6 + i], 40))
  return g
}

/** 食器棚：下柜（两个抽屉 + 两扇门，门里一块层板）+ 家电台面 + 上方玻璃门餐具柜（底层放碗盘，上层留空） */
function shokkidana(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(96, 6, 40, shade(main, -0.3), { z: -1 }, 1))
  g.add(carcass(100, 79, 43.8, main, 6))
  g.add(rbox(95, 1.6, 41, main, { y: 66.2, z: 0.5 }, 0.4))
  g.add(rbox(95, 1.6, 41, shade(main, 0.04), { y: 36, z: 0.5 }, 0.4))
  for (const s of [-1, 1]) {
    const x = s * 24.4
    g.add(pullOut([front(47.6, 13, 43.8, sub, x, 68.6), knob(x, 75, 23.5, acc, 1.4), drawerTray(44, 10, 38, shade(main, 0.08), x, 69, 21.5)], 23))
    g.add(swingAt([front(47.6, 58, 43.8, sub, x, 9.3), knob(s * 4.5, 50, 23.5, acc, 1.5)], s * 48.2, 21.5, s < 0))
  }
  const Du = 32
  const zc = -22.5 + Du / 2
  for (const s of [-1, 1]) g.add(rbox(2.5, 92.5, Du, main, { x: s * 48.75, y: 85, z: zc }, 0.8))
  g.add(rbox(95.4, 92.5, 1.2, shade(main, -0.06), { y: 85, z: -21.9 }, 0.4))
  g.add(rbox(95.4, 2.5, Du - 1.2, main, { y: 122, z: zc + 0.6 }, 0.6))
  g.add(rbox(95.4, 2, Du - 3, main, { y: 151, z: zc + 0.5 }, 0.6))
  g.add(rbox(101, 2.5, Du + 1, main, { y: 177.5, z: zc }, 1))
  for (const s of [-1, 1]) g.add(swingAt([glassDoor(47.4, 52.6, sub, s * 24, 124.7, 10.2), knob(s * 4, 150, 11.6, acc, 1.2)], s * 47.7, 9.5, s < 0))
  // 固定的碗盘：都在上柜底层（y 124.5），上层留空
  const yb = 124.5
  for (let i = 0; i < 6; i++) g.add(cyl(8.5, 7, 0.9, C.white, { x: -34, y: yb + i * 1.1, z: -6 }, 24))
  for (let i = 0; i < 3; i++) g.add(cup(6.5, 4, 5, 0.6, J.ai, { x: -14, y: yb + i * 1.6, z: -6 }))
  for (let i = 0; i < 3; i++) g.add(cup(3.8, 3, 7, 0.5, i === 1 ? J.shu : C.cream, { x: 4 + i * 8.5, y: yb, z: -4 }))
  for (let i = 0; i < 2; i++) {
    const pl = cyl(10, 10, 1, i ? R.cream : C.white, {}, 24)
    pl.rotation.x = Math.PI / 2 - 0.18
    pl.position.set(34 + i * 2.2 - 1, yb + 9.95, -17 + i * 1.6)
    g.add(pl)
  }
  return g
}

/** 水屋箪笥：上段组子推拉门 + 小抽屉，下段抽屉 + 木推拉门，铁件环形拉手；柜体空心，上下段各一块层板 */
function mizuya(p: string[]) {
  const [main, paper, iron] = p
  const g = new THREE.Group()
  const fr = shade(main, 0.06)
  const inner = shade(main, 0.08)
  const ring = (x: number, y: number, z: number): THREE.Object3D[] => [rbox(4.6, 4.6, 0.5, iron, { x, y: y - 2.3, z }, 0.3), torus(1.7, 0.35, iron, { x, y: y - 1.9, z: z + 0.6 })]
  g.add(rbox(120, 5, 45, shade(main, -0.2), { z: -0.5 }, 1))
  // 下段柜体（z -23..21）
  g.add(rbox(116, 78, 1.5, shade(main, -0.06), { y: 5, z: -22.25 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2, 78, 44, main, { x: s * 59, y: 5, z: -1 }, 0.6))
  g.add(rbox(116, 2, 43, main, { y: 5, z: -0.5 }, 0.4))
  g.add(rbox(116, 1.6, 42, main, { y: 66.6, z: 0 }, 0.4))
  g.add(rbox(116, 1.6, 42, inner, { y: 36.4, z: 0 }, 0.4))
  for (let i = 0; i < 3; i++) {
    const x = -40 + i * 40
    const parts: THREE.Object3D[] = [rbox(38.6, 13, 1.4, fr, { x, y: 68.5, z: 21.6 }, 0.5), ...ring(x, 77, 22.4), drawerTray(36, 10, 38, inner, x, 69, 20.9)]
    for (const s of [-1, 1]) parts.push(rbox(3, 3, 0.4, iron, { x: x + s * 17.5, y: 78.3, z: 22.4 }, 0.15))
    g.add(pullOut(parts, 23))
  }
  for (const s of [-1, 1]) {
    const z = s < 0 ? 21.6 : 23.2
    const parts = [rbox(58.5, 54, 1.4, shade(main, 0.03), { x: s * 29.25, y: 11, z }, 0.5), rbox(1.4, 9, 0.5, iron, { x: s * 4, y: 34, z: z + 0.8 }, 0.2)]
    if (s > 0) g.add(slideBy(parts, -58.5))
    else for (const o of parts) g.add(o)
  }
  g.add(rbox(122, 3, 46, shade(main, -0.08), { y: 83 }, 1))
  // 上段柜体（z -23..13）
  g.add(rbox(112, 86, 1.5, shade(main, -0.06), { y: 86, z: -22.25 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2, 86, 36, main, { x: s * 57, y: 86, z: -5 }, 0.6))
  g.add(rbox(112, 1.4, 35, main, { y: 97.2, z: -5 }, 0.4))
  g.add(rbox(112, 1.6, 35, inner, { y: 133, z: -5 }, 0.4))
  g.add(rbox(120, 3, 41, shade(main, -0.08), { y: 172, z: -2.5 }, 1))
  for (let i = 0; i < 4; i++) {
    const x = -43.5 + i * 29
    g.add(pullOut([rbox(27.4, 9, 1.4, fr, { x, y: 88, z: 13.4 }, 0.5), ...ring(x, 94.5, 14.2), drawerTray(25, 7, 30, inner, x, 88.3, 12.7)], 18))
  }
  for (const s of [-1, 1]) {
    const x = s * 29
    const z = s < 0 ? 14.7 : 16.5
    const parts = [rbox(55, 69, 0.4, paper, { x, y: 100, z: z - 1.15 }, 0.1), holePanel(58, 72, 1.6, main, lattice(58, 72, 3, 4, 1.6, 2.6), { x, y: 98.5, z })]
    if (s > 0) g.add(slideBy(parts, -58))
    else for (const o of parts) g.add(o)
  }
  return g
}

const RECORD_COLORS = [R.teal, R.red, R.mustard, R.cream, R.orange, M.black, '#5a4a7a', N.blue, '#e9e2d0']

/** 复古唱片柜：外八腿，三格唱片 + 一格平开门（门里一块层板） */
function recordCabinet(p: string[]) {
  const [main, sub, acc] = p
  const g = carcass(120, 46, 42, main, 16)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.4, 1.4, 16.3, shade(main, -0.15), { x: sx * 54, z: sz * 15, rx: -sz * 0.1, rz: sx * 0.1 }, 12))
  const fy = 18.9
  const top = 59.5
  for (const x of [-30, 0, 30]) g.add(divider(x, fy, top, 42, main))
  const bays: [number, number][] = [
    [-57.5, -31.1],
    [-28.9, -1.1],
    [1.1, 28.9],
  ]
  let k = 0
  bays.forEach(([x0, x1], b) => {
    const n = Math.floor((x1 - x0 - 4) / 1.1)
    for (let i = 0; i < n; i++) {
      k += 7
      g.add(rbox(0.6, 31, 31, RECORD_COLORS[(k + b) % RECORD_COLORS.length], { x: x0 + 1 + i * 1.1, y: fy, z: 2 }, 0.2))
    }
    const lean = rbox(0.6, 31, 31, RECORD_COLORS[(b * 3) % RECORD_COLORS.length], { x: x1 - 5, y: fy, z: 2, rz: -0.12 }, 0.2)
    lean.position.y += 0.3
    g.add(lean)
  })
  g.add(rbox(26.4, 1.6, 39, shade(main, 0.04), { x: 44.3, y: 38.4, z: 0.4 }, 0.4))
  g.add(swingAt([front(26.4, 39.6, 42, sub, 44.3, fy + 0.2), rbox(1.4, 12, 1.4, acc, { x: 33.5, y: 33, z: 22.6 }, 0.5)], 57.5, 20.6, false))
  return g
}

function drawLockerNo(n: number) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = '#f2f2ee'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#2a2b2e'
    g.font = `bold ${Math.round(H * 0.72)}px sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), W / 2, H * 0.55)
  }
}

/** 金属储物柜：学校风，百叶通风口 + 号码牌；空心柜体分格，每扇门里一格（高柜上面一块帽架） */
function locker(tall: boolean, p: string[]) {
  const [body, door, handle] = p
  const g = new THREE.Group()
  const W = 90
  const D = 45
  const H = tall ? 180 : 90
  g.add(rbox(W - 4, 5, D - 4, shade(body, -0.3), { z: -1 }, 1))
  g.add(rbox(W - 4, H - 7, 1.2, shade(body, -0.2), { y: 5, z: -22.9 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(2, H - 5, D, body, { x: s * (W / 2 - 1), y: 5, z: -1 }, 0.6))
  g.add(rbox(W, 2, D, body, { y: H - 2, z: -1 }, 0.6))
  g.add(rbox(W - 4, 2, D - 1, body, { y: 5, z: -1.5 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(1.4, H - 9, D - 2, body, { x: s * ((W - 4) / 6), y: 7, z: -1.5 }, 0.3))
  const rows = tall ? 1 : 3
  for (const y of lockerBoards(tall)) g.add(rbox(W - 4, 1.4, D - 2, body, { y: y - 1.4, z: -1.5 }, 0.3))
  const dw = (W - 4) / 3 - 0.8
  const dh = (H - 9) / rows - 0.8
  let no = 1
  for (let r = rows - 1; r >= 0; r--)
    for (let c = 0; c < 3; c++) {
      const x = -W / 2 + 2 + ((W - 4) / 3) * (c + 0.5)
      const y = 7 + 0.4 + ((H - 9) / rows) * r
      const holes: Hole[] = []
      const nSlot = tall ? 5 : 3
      for (let i = 0; i < nSlot; i++) holes.push({ kind: 'rect', x: 0, y: dh - 8 - i * 2.6, w: dw * 0.6, h: 1.2, r: 0.5 })
      if (tall) for (let i = 0; i < nSlot; i++) holes.push({ kind: 'rect', x: 0, y: 6 + i * 2.6, w: dw * 0.6, h: 1.2, r: 0.5 })
      g.add(
        swingAt(
          [
            holePanel(dw, dh, 1, door, holes, { x, y, z: 22.6 }, 1),
            rbox(2, 8, 1.4, handle, { x: x + dw / 2 - 4, y: y + (tall ? 85 : dh / 2 - 4), z: 23.6 }, 0.5),
            paintPanel(5, 2.6, `fm-locker-${no}`, drawLockerNo(no), { x, y: y + dh - (tall ? 22 : 14), z: 23.15 }),
          ],
          x - dw / 2,
          22.1,
          true,
        ),
      )
      no++
    }
  return g
}

/** 药柜（百味箪笥）：6 × 8 小抽屉（每个都能拉出），铜标签框 */
function apothecary(p: string[]) {
  const [main, drawer, pull] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 8.4, 5, shade(main, -0.15), { x: sx * 45, z: sz * 14 }, 1))
  g.add(rbox(100, 110, 36, main, { y: 8, z: -1 }, 1))
  g.add(rbox(102, 2.5, 38, shade(main, -0.06), { y: 117.5 }, 1))
  for (const [x, y] of APOTHECARY_CELLS)
    g.add(
      pullOut(
        [
          rbox(APO_CW - 1, APO_RH - 1, 1.4, drawer, { x, y, z: 17.3 }, 0.4),
          rbox(6.4, 2.6, 0.5, pull, { x, y: y + APO_RH - 5, z: 18.1 }, 0.15),
          rbox(5.2, 1.6, 0.5, R.cream, { x, y: y + APO_RH - 4.5, z: 18.3 }, 0.1),
          knob(x, y + 3.5, 18.4, pull, 1.1),
          drawerTray(APO_CW - 2.4, APO_RH - 4, 30, shade(main, 0.1), x, y + 0.5, 16.6),
        ],
        18,
      ),
    )
  return g
}

/** 玄关柜：长凳 + 鞋格 + 挂钩 + 顶部层板 */
function hallTree(p: string[]) {
  const [wood, cushion, metal] = p
  const g = new THREE.Group()
  const t = 2.5
  for (const s of [-1, 1]) {
    g.add(rbox(t, 43, 42, wood, { x: s * 48.75 }, 0.8))
    g.add(rbox(t, 141.5, 28, wood, { x: s * 48.75, y: 46, z: -7 }, 0.8))
  }
  g.add(rbox(95.4, t, 40, wood, { y: 2, z: 0.5 }, 0.6))
  g.add(rbox(95.4, t, 40, wood, { y: 22, z: 0.5 }, 0.6))
  g.add(rbox(100, 3, 42, wood, { y: 43 }, 1))
  g.add(rbox(94, 6, 36, cushion, { y: 46, z: 2 }, 3))
  g.add(rbox(95.4, 141.5, 1.5, shade(wood, -0.05), { y: 46, z: -20.25 }, 0.4))
  for (const x of [-36, -12, 12, 36]) {
    g.add(cylZ(1, 6, metal, x, 135, -16.5, 10))
    g.add(ball(1.6, metal, { x, y: 136, z: -13.6 }))
  }
  g.add(rbox(95.4, t, 26, wood, { y: 162, z: -7 }, 0.6))
  g.add(rbox(100, t, 30, wood, { y: 187.5, z: -6 }, 0.8))
  return g
}

/** 翻斗鞋柜：超薄，空心柜体，每层一扇底边铰链的翻门 */
function tiltShoe(tiers: number, p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const dh = 36
  const legH = 10
  const H = tiers * dh + 2
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.8, 1.2, legH + 0.3, shade(main, -0.15), { x: sx * 35, z: -1 + sz * 8 }, 12))
  g.add(rbox(77, H, 1.2, shade(main, -0.06), { y: legH, z: -12.4 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(1.5, H, 24, main, { x: s * 39.25, y: legH, z: -1 }, 0.5))
  g.add(rbox(80, 1.6, 24, main, { y: legH + H - 1.6, z: -1 }, 0.5))
  for (let i = 0; i < tiers; i++) {
    g.add(rbox(77, 1.6, 23, shade(main, 0.04), { y: legH + i * dh, z: -1.5 }, 0.3))
    const y = legH + 1 + i * dh + 0.6
    g.add(flapAt([rbox(77, dh - 1.2, 1.6, sub, { y, z: 11.4 }, 0.6), rbox(24, 1.5, 1.6, acc, { y: y + dh - 7, z: 12.8 }, 0.6)], y, 10.6, (32 * Math.PI) / 180))
  }
  return g
}

/** 厨房中岛：实木台面 + 抽屉（可拉出）+ 平开门（门里一块层板）+ 端头毛巾杆 */
function island(p: string[]) {
  const [body, top, acc] = p
  const g = new THREE.Group()
  g.add(rbox(106, 8, 48, shade(body, -0.3), {}, 1))
  g.add(carcass(110, 77, 54, body, 8))
  g.add(rbox(105, 1.6, 51, body, { y: 65.6, z: 0.5 }, 0.4))
  g.add(rbox(105, 1.6, 51, shade(body, 0.04), { y: 37.5, z: 0.5 }, 0.4))
  g.add(rbox(120, 5, 65, top, { y: 85 }, 1.5))
  for (const s of [-1, 1]) {
    const x = s * 27.3
    g.add(pullOut([front(53.6, 14, 54, shade(body, 0.05), x, 67.6), pullBar(20, x, 75.5, 28.9, acc), drawerTray(50, 10, 48, shade(body, 0.1), x, 68, 26.6)], 29))
    g.add(swingAt([front(53.6, 54, 54, shade(body, 0.05), x, 12), rbox(1.5, 18, 1.5, acc, { x: s * 4, y: 44, z: 28.9 }, 0.6)], s * 54.1, 26.6, s < 0))
  }
  for (const z of [-19, 19]) g.add(cylX(0.8, 3.4, acc, 57, 70, z, 8))
  g.add(cylZ(0.9, 40, acc, 58.4, 70, 0, 10))
  return g
}

/** 厨房推车：钢管四柱 + 两层托盘 + 木台面 + 两端把手 */
function kitchenCart(p: string[]) {
  const [frame, wood, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 32
      const z = sz * 18
      g.add(cyl(1.3, 1.3, 79, frame, { x, y: 7, z }, 10))
      g.add(rbox(3.4, 3, 3, frame, { x, y: 4, z }, 0.6))
      g.add(cylX(2.5, 2, TIRE, x, 2.5, z, 16))
    }
  g.add(tray(66, 7, 38, 1, frame, { y: 14 }))
  g.add(tray(66, 7, 38, 1, frame, { y: 48 }))
  g.add(rbox(70, 3, 42, wood, { y: 85 }, 1))
  for (const s of [-1, 1]) {
    // 把手支架接在立柱上（以前支架在 z = ±12，离立柱 6cm，整根把手悬空）
    for (const z of [-18, 18]) g.add(cylX(0.8, 5.6, acc, s * 35.5, 80, z, 8))
    g.add(cylZ(1.1, 38, acc, s * 38, 80, 0, 10))
  }
  return g
}

/** 酒柜：下部酒格（横放酒瓶）+ 开放台面 + 上部玻璃门（倒挂酒杯），玻璃门可以打开 */
function wineCabinet(p: string[]) {
  const [main, sub, acc] = p
  const g = carcass(80, 176, 38, main, 4)
  g.add(rbox(76, 4, 34, shade(main, -0.3), { z: -1 }, 1))
  for (const y of [25.2, 43.5, 61.8]) g.add(rbox(75.6, 1.5, 36, sub, { y, z: 0.5 }, 0.4))
  for (const x of [-18.75, 0, 18.75]) g.add(rbox(1.5, 73.2, 36, sub, { x, y: 6.9, z: 0.5 }, 0.4))
  const bottles = ['#2f4a35', '#5a1f2a', '#2f4a35', '#3a2a2a']
  let k = 0
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      if ((c * 4 + r) % 5 === 3) continue
      const x = -28.1 + c * 18.75
      const y = 6.9 + r * 18.3 + (r ? 1.5 : 0)
      const col = bottles[k++ % bottles.length]
      g.add(cylZ(3.6, 22, col, x, y + 3.6, -3, 16))
      g.add(cylZ(1.3, 8, col, x, y + 3.6, 12, 10))
      g.add(cylZ(1.5, 3, acc, x, y + 3.6, 16.5, 10))
    }
  g.add(rbox(75.6, 2.5, 36, main, { y: 80, z: 0.5 }, 0.6))
  g.add(rbox(75.6, 2.5, 36, main, { y: 112, z: 0.5 }, 0.6))
  g.add(rbox(75.6, 2, 34, main, { y: 142, z: 0 }, 0.6))
  for (const x of [-24, -8, 8, 24]) {
    g.add(rbox(1.5, 1, 30, acc, { x, y: 176.5, z: 0 }, 0.3))
    for (const z of [-8, 6]) {
      g.add(puck(2.8, 0.5, C.glass, { x, y: 175.8, z }))
      g.add(cyl(0.3, 0.3, 6.5, C.glass, { x, y: 169.5, z }, 6))
      // 倒扣的杯身接在杯脚下端（以前杯身比杯脚低 8cm，两段分离）
      const bowl = cup(3.6, 2.6, 8, 0.3, C.glass, { x, y: 169.6, z, rx: Math.PI })
      bowl.material = toon(C.glass, { transparent: 0.4 })
      g.add(bowl)
    }
  }
  for (const s of [-1, 1]) g.add(swingAt([glassDoor(37.6, 64, sub, s * 19.2, 113, 19.8), knob(s * 3.5, 140, 21.2, acc, 1.2)], s * 38, 19.1, s < 0))
  return g
}

/** 拱形玻璃陈列柜：拱顶 + 玻璃层板 + 顶部灯条；拱形玻璃门（左铰链）和底座抽屉都能打开 */
function archCabinet(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const yA = 135
  const archOutline = (r: number, y0: number) => {
    const s = new THREE.Shape()
    s.moveTo(-r, y0)
    s.lineTo(r, y0)
    s.lineTo(r, yA)
    s.absarc(0, yA, r, 0, Math.PI, false)
    s.lineTo(-r, y0)
    return s
  }
  const archPath = (r: number, y0: number) => {
    const s = new THREE.Path()
    s.moveTo(-r, y0)
    s.lineTo(r, y0)
    s.lineTo(r, yA)
    s.absarc(0, yA, r, 0, Math.PI, false)
    s.lineTo(-r, y0)
    return s
  }
  g.add(rbox(80, 20, 38, main, {}, 1))
  g.add(pullOut([front(74, 14, 38, sub, 0, 3), knob(0, 10, 20.6, acc, 1.2), drawerTray(70, 10, 32, shade(main, 0.08), 0, 3.5, 18.6)], 20))
  const ff = archOutline(40, 20)
  ff.holes.push(archPath(34, 26))
  const fm = meshWith(extrude(ff, 2), toon(main))
  fm.position.z = 18
  const gl = meshWith(extrude(archOutline(34.4, 25.6), 0.4), toon(C.glass, { transparent: 0.32 }))
  gl.position.z = 18
  g.add(swingAt([fm, gl, knob(31, 80, 19.8, acc, 1.3)], -40, 17, true))
  const bk = meshWith(extrude(archOutline(40, 20), 1.5), toon(shade(main, -0.06)))
  bk.position.z = -18.25
  g.add(bk)
  for (const s of [-1, 1]) g.add(rbox(2, 115, 34.5, main, { x: s * 39, y: 20 }, 0.6))
  const roof = new THREE.Shape()
  roof.moveTo(40, yA)
  roof.absarc(0, yA, 40, 0, Math.PI, false)
  roof.lineTo(-38, yA)
  roof.absarc(0, yA, 38, Math.PI, 0, true)
  roof.lineTo(40, yA)
  g.add(meshWith(extrude(roof, 34.5), toon(main)))
  for (const y of [60, 100, 132]) glassShelf(g, 75.6, 33, y)
  g.add(lit(rbox(44, 0.6, 3, C.lamp, { y: 160, z: 6 }, 0.2), C.lamp, 0.9))
  return g
}

function glassShelf(g: THREE.Group, w: number, d: number, y: number) {
  g.add(glassPane(w, 1, d, { y, z: 0 }))
}

// =====================================================================
// 桌台
// =====================================================================

/** 和风镜台：矮抽屉座（三个抽屉都能拉出）+ 立镜 + 镜掛け（盖布） */
function kyodai(p: string[]) {
  const [wood, cloth, metal] = p
  const g = new THREE.Group()
  const fr = shade(wood, 0.06)
  const inner = shade(wood, 0.1)
  g.add(rbox(56, 1.4, 30, shade(wood, -0.2), { z: -1 }, 0.4))
  g.add(rbox(60, 33, 33, wood, { y: 1, z: -1 }, 1))
  for (const s of [-1, 1]) g.add(pullOut([rbox(28.4, 9, 1.4, fr, { x: s * 14.5, y: 22, z: 15.9 }, 0.5), knob(s * 14.5, 26.5, 16.9, metal, 1), drawerTray(26, 6, 28, inner, s * 14.5, 22.5, 15.2)], 17))
  g.add(pullOut([rbox(57.6, 17, 1.4, fr, { y: 3.5, z: 15.9 }, 0.5), torus(1.8, 0.35, metal, { y: 10.5, z: 16.9 }), drawerTray(55, 13, 28, inner, 0, 4, 15.2)], 17))
  g.add(rbox(61, 1.6, 34, shade(wood, -0.06), { y: 33.4, z: -1 }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox(2.6, 66, 2.6, wood, { x: s * 23, y: 35, z: -11 }, 0.6))
    g.add(ball(1.8, wood, { x: s * 23, y: 101.8, z: -11 }))
    g.add(cylX(0.8, 1.6, metal, s * 21.5, 72, -11, 8))
  }
  g.add(holePanel(42, 64, 2.4, wood, [{ kind: 'rect', x: 0, y: 3, w: 36, h: 58, r: 3 }], { y: 38, z: -11 }))
  g.add(markMirror(rbox(36.6, 58.6, 0.5, '#d4e8ef', { y: 40.7, z: -11 }, 0.2)))
  g.add(rbox(43, 30, 0.6, cloth, { y: 72, z: -9.3 }, 0.2))
  g.add(rbox(43, 1.2, 3.8, cloth, { y: 102, z: -11 }, 0.4))
  g.add(rbox(43, 10, 0.6, cloth, { y: 92.6, z: -12.6 }, 0.2))
  return g
}

/** 翻盖书桌（secretary）：斜面上段打开成写字板，里面是小抽屉和信插格；下面三个大抽屉可以拉出 */
function secretary(p: string[]) {
  const [wood, leather, brass] = p
  const g = new THREE.Group()
  const zb = -39.5
  const zf = 5.5
  const zc = (zb + zf) / 2
  const fr = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const z of [zb + 4, zf - 4]) g.add(rbox(7, 8.4, 7, shade(wood, -0.12), { x: sx * 40, z }, 1))
  g.add(rbox(90, 67, 45, wood, { y: 8, z: zc }, 1))
  for (let i = 0; i < 3; i++) {
    const y = 10 + i * 19.6
    const parts: THREE.Object3D[] = [rbox(84, 18.6, 1.4, fr, { y, z: zf + 0.3 }, 0.5), drawerTray(80, 14, 38, shade(wood, 0.1), 0, y + 1, zf - 0.4)]
    for (const s of [-1, 1]) {
      parts.push(rbox(5, 2.6, 0.5, brass, { x: s * 24, y: y + 11, z: zf + 1.2 }, 0.2))
      parts.push(torus(2.6, 0.35, brass, { x: s * 24, y: y + 12.3, z: zf + 1.6, rz: Math.PI }, Math.PI))
    }
    g.add(pullOut(parts, 24))
  }
  for (const s of [-1, 1])
    g.add(
      sidePrism(
        [
          [zb, 75],
          [zb, 105],
          [zb + 18, 105],
          [zf, 79],
          [zf, 75],
        ],
        2.5,
        wood,
        s * 43.75,
      ),
    )
  g.add(rbox(90, 2, 20, wood, { y: 103, z: zb + 10 }, 0.6))
  g.add(rbox(85.4, 28, 1.5, shade(wood, -0.06), { y: 75, z: zb + 0.75 }, 0.4))
  g.add(rbox(85, 26, 13, '#3a2a20', { y: 75, z: zb + 8 }, 0.4))
  const holes: Hole[] = []
  for (let i = 0; i < 4; i++) holes.push({ kind: 'rect', x: -31.5 + 21 * i, y: 11, w: 18, h: 13, r: 0.5 })
  g.add(holePanel(85, 26, 1.2, wood, holes, { y: 75, z: zb + 15 }, 0.6))
  for (let i = 0; i < 4; i++) {
    const x = -31.5 + 21 * i
    g.add(rbox(18, 7.4, 0.8, shade(wood, 0.08), { x, y: 76.6, z: zb + 15.9 }, 0.3))
    g.add(knob(x, 80.3, zb + 16.5, brass, 0.8))
  }
  g.add(rbox(85, 1.6, 33, wood, { y: 74.4, z: zf + 16.5 }, 0.6))
  g.add(rbox(76, 0.6, 28, leather, { y: 75.7, z: zf + 17 }, 0.2))
  for (const s of [-1, 1]) g.add(rbox(4, 5, 30, wood, { x: s * 39, y: 69.4, z: zf + 12 }, 0.6))
  return g
}

/** 电脑台 + 上方书架：两侧塔式书架，中间留显示器位 */
function pcHutch(p: string[]) {
  const [top, frame, acc] = p
  const g = new THREE.Group()
  g.add(rbox(140, 3, 65, top, { y: 69 }, 1))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(4, 69, 4, frame, { x: sx * 67, z: sz * 29.5 }, 0.8))
    g.add(rbox(4, 4, 55, frame, { x: sx * 67, y: 8 }, 0.8))
  }
  g.add(rbox(130, 30, 1.5, frame, { y: 38, z: -30 }, 0.4))
  for (const x of [-69, -41, 41, 69]) g.add(rbox(2, 75.5, 25, top, { x, y: 72, z: -20 }, 0.6))
  for (const s of [-1, 1]) {
    for (const y of [98, 122]) g.add(rbox(26.4, 2, 24, top, { x: s * 55, y, z: -19.5 }, 0.5))
    g.add(rbox(26.4, 75.5, 1, shade(top, -0.06), { x: s * 55, y: 72, z: -32 }, 0.3))
  }
  g.add(rbox(140, 2.5, 26, top, { y: 147.5, z: -19.5 }, 0.8))
  g.add(rbox(42, 11, 52, shade(top, -0.05), { x: 38, y: 58, z: 3 }, 0.8))
  g.add(rbox(42.4, 9, 1.2, top, { x: 38, y: 59, z: 29.4 }, 0.4))
  g.add(pullBar(14, 38, 63.5, 30.6, acc))
  return g
}

function drawTimetable(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#fffdf6'
  g.fillRect(0, 0, W, H)
  const cols = ['#ffb6c8', '#a8d4f4', '#a6e3cc', '#ffe08f', '#cfb8f3']
  const cw = W / 5
  const rh = H / 5
  for (let i = 0; i < 5; i++) {
    g.fillStyle = cols[i]
    g.fillRect(i * cw + 1, 1, cw - 2, rh - 2)
    for (let j = 1; j < 5; j++) {
      g.fillStyle = (i + j) % 3 ? '#eeeae0' : cols[(i + j) % 5]
      g.fillRect(i * cw + 1, j * rh + 1, cw - 2, rh - 2)
    }
  }
}

function drawGakuPanel(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#e9e4d6'
  g.fillRect(0, 0, W, H)
  const r = W * 0.36
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#5a4646'
  g.lineWidth = Math.max(1, W * 0.04)
  g.beginPath()
  g.arc(W / 2, H * 0.28, r, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.beginPath()
  g.moveTo(W / 2, H * 0.28)
  g.lineTo(W / 2, H * 0.28 - r * 0.7)
  g.moveTo(W / 2, H * 0.28)
  g.lineTo(W / 2 + r * 0.5, H * 0.28 + r * 0.1)
  g.stroke()
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ['#e2702f', '#2f8f8a', '#e0a526'][i]
    g.fillRect(W * 0.3, H * (0.56 + i * 0.13), W * 0.4, H * 0.08)
  }
}

/** 学习机：侧柜三个抽屉 + 中间扁抽屉（都能拉出）+ 上方书架和灯 */
function gakushu(p: string[]) {
  const [body, accent, knobC] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.08)
  g.add(rbox(105, 3, 60, body, { y: 69 }, 1))
  g.add(rbox(2.5, 69, 56, body, { x: -51.25 }, 0.8))
  g.add(rbox(32, 69, 56, body, { x: 36.5 }, 1))
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 21.8
    g.add(pullOut([rbox(30, 20.4, 1.4, accent, { x: 36.5, y, z: 28.4 }, 0.6), knob(36.5, y + 15, 29.6, knobC, 1.4), drawerTray(28, 16, 48, inner, 36.5, y + 1, 27.7)], 28))
  }
  g.add(pullOut([drawerTray(66, 7, 50, shade(body, -0.05), -15, 59.8, 27), rbox(70, 8.6, 1.4, accent, { x: -15, y: 59.8, z: 27.6 }, 0.5), knob(-15, 64, 28.8, knobC, 1.3)], 30))
  g.add(rbox(70, 4, 4, body, { x: -15, y: 8, z: -20 }, 0.8))
  g.add(rbox(2, 50, 20, body, { x: -51.5, y: 72, z: -20 }, 0.6))
  g.add(rbox(8.5, 50, 20, body, { x: 48.25, y: 72, z: -20 }, 0.8))
  g.add(paintPanel(7, 18, 'fm-gaku-panel', drawGakuPanel, { x: 48.25, y: 98, z: -9.9 }))
  g.add(rbox(95, 2, 20, body, { x: -2.5, y: 98, z: -20 }, 0.6))
  g.add(rbox(105, 3, 21, body, { y: 122, z: -19.5 }, 0.8))
  g.add(rbox(95, 26, 1, '#c9a36a', { x: -2.5, y: 72, z: -29.5 }, 0.3))
  g.add(rbox(95, 22, 1, accent, { x: -2.5, y: 100, z: -29.5 }, 0.3))
  g.add(paintPanel(16, 11, 'fm-gaku-timetable', drawTimetable, { x: -28, y: 82, z: -28.9 }))
  g.add(rbox(60, 2, 5, shade(body, -0.1), { x: -2.5, y: 96, z: -14 }, 0.5))
  g.add(lit(cylX(0.9, 56, C.lamp, -2.5, 95, -14, 10), C.lamp, 0.9))
  return g
}

/** C 形床边桌：底板塞进沙发 / 床下，桌面伸到上方 */
function cTable(p: string[]) {
  const [top, frame] = p
  const g = new THREE.Group()
  g.add(rbox(46, 2.5, 38, frame, { x: 1 }, 0.8))
  g.add(rbox(3, 57.4, 26, frame, { x: 22.5, y: 2.3 }, 0.8))
  g.add(rbox(50, 2.5, 40, top, { y: 59.5 }, 0.8))
  return g
}

/** 吧台：竖条护板 + 脚踏杆，背面开放层板，下层横放酒瓶 */
function barCounter(p: string[]) {
  const [top, panel, metal] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(3, 103.2, 40, panel, { x: s * 71.5, z: -4 }, 0.8))
  g.add(rbox(140.4, 103.2, 3, panel, { z: 14.5 }, 0.8))
  for (let x = -66; x <= 66; x += 8.25) g.add(rbox(5, 98, 1.2, shade(panel, -0.08), { x, y: 2.5, z: 16.5 }, 0.4))
  g.add(rbox(140.4, 2.5, 37, shade(panel, -0.05), { y: 2, z: -5.5 }, 0.6))
  g.add(rbox(140.4, 2.5, 37, shade(panel, -0.05), { y: 50, z: -5.5 }, 0.6))
  g.add(rbox(150, 5, 60, top, { y: 103 }, 1.5))
  g.add(cylX(1.6, 140, metal, 0, 22, 25))
  for (const s of [-1, 1]) g.add(rod3([s * 60, 22, 17], [s * 60, 22, 25], 1, metal))
  const bottles = ['#2f4a35', '#5a1f2a', '#6b4a1f', '#2f4a35', '#3a2a2a']
  for (let i = 0; i < 5; i++)
    for (let r = 0; r < 2; r++) {
      if (r === 1 && i === 4) continue
      const x = -64 + i * 8 + r * 4
      const y = 4.5 + 3.6 + r * 7.2
      const col = bottles[(i + r * 2) % bottles.length]
      g.add(cylZ(3.6, 22, col, x, y, -4, 16))
      g.add(cylZ(1.3, 8, col, x, y, -19, 10))
    }
  return g
}

// =====================================================================
// 其他
// =====================================================================

/** 隔断书架：两面通透，错落格子，部分格子带色板 */
function dividerShelf(p: string[]) {
  const [frame, panel] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 4.2, 4, shade(frame, -0.2), { x: sx * 55, z: sz * 14 }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(2.5, 143.5, 35, frame, { x: s * 58.75, y: 4 }, 0.8))
  for (const y of [4, 50, 97]) g.add(rbox(115.4, 2.5, 35, frame, { y }, 0.6))
  g.add(rbox(120, 2.5, 35, frame, { y: 147.5 }, 0.8))
  const rows: [number, number, number[]][] = [
    [6.5, 50, [-20, 25]],
    [52.5, 97, [-35, 5, 35]],
    [99.5, 147.5, [-10, 30]],
  ]
  for (const [y0, y1, xs] of rows) for (const x of xs) g.add(rbox(2.2, y1 - y0 + 0.2, 34.6, frame, { x, y: y0 - 0.1 }, 0.5))
  g.add(rbox(36.2, 43.5, 1.2, panel, { x: -39.3, y: 6.5, z: -16.4 }, 0.3))
  g.add(rbox(27.6, 44.5, 1.2, panel, { x: 20, y: 52.5, z: 16.4 }, 0.3))
  g.add(rbox(26.2, 48, 1.2, panel, { x: 44.3, y: 99.5, z: -16.4 }, 0.3))
  return g
}

/** 玄关长凳：简子板凳面 + 下层鞋架 */
function genkanBench(p: string[]) {
  const [wood, legc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 42.6, 4, legc, { x: sx * 46, z: sz * 14.5 }, 0.8))
  for (const s of [-1, 1]) {
    // 牙板顶到面板底（以前中间几根面板条离牙板 1.5cm 悬空）
    g.add(rbox(88.2, 7.6, 2, wood, { y: 35, z: s * 14.5 }, 0.5))
    g.add(rbox(2, 7.6, 25.2, wood, { x: s * 46, y: 35 }, 0.5))
    g.add(rbox(3, 2, 25.2, legc, { x: s * 42.5, y: 8 }, 0.5))
  }
  for (let i = 0; i < 6; i++) g.add(rbox(100, 2.5, 5, wood, { y: 42.5, z: -14.5 + i * 5.8 }, 0.6))
  for (let i = 0; i < 5; i++) g.add(rbox(88, 1.8, 4.4, wood, { y: 10, z: -11 + i * 5.5 }, 0.5))
  return g
}

/** 小上がり：抬高的榻榻米台，正面大抽屉 */
function koagari(nMats: number, p: string[]) {
  const [frame, tatami, heri] = p
  const g = new THREE.Group()
  const w = 88 * nMats
  g.add(rbox(w - 8, 3, 168, shade(frame, -0.3), { z: -1 }, 1))
  g.add(rbox(w, 34, 174, frame, { y: 3, z: -1 }, 1.2))
  for (let i = 0; i < nMats; i++) {
    const x = -w / 2 + 44 + 88 * i
    g.add(rbox(87.4, 3, 173.4, tatami, { x, y: 37, z: -1 }, 0.6))
    // 畳縁比榻榻米外侧多出 0.15，避免两者侧面共面闪烁
    for (const s of [-1, 1]) g.add(rbox(2.6, 3.15, 173.4, heri, { x: x + s * 42.55, y: 37, z: -1 }, 0.4))
    g.add(rbox(82, 26, 1.6, shade(frame, 0.05), { x, y: 7, z: 87.4 }, 0.6))
    g.add(rbox(22, 2.2, 1, shade(frame, -0.35), { x, y: 28, z: 88.4 }, 0.4))
  }
  return g
}

/** 猫爬墙：错落踏板 + 猫屋 + 瞭望台 + 剑麻抓板（壁挂） */
function catWall(p: string[]) {
  const [wood, pad, metal] = p
  const g = new THREE.Group()
  const Z0 = -17
  const step = (x: number, y: number, w = 32, dd = 25) => {
    g.add(rbox(w, 2.5, dd, wood, { x, y, z: Z0 + dd / 2 }, 0.8))
    g.add(rbox(w - 4, 1.2, dd - 4, pad, { x, y: y + 2.3, z: Z0 + dd / 2 + 0.5 }, 0.5))
    for (const s of [-1, 1]) {
      const bx = x + s * (w / 2 - 5)
      g.add(rbox(2, 10, 1, metal, { x: bx, y: y - 10, z: Z0 + 0.5 }, 0.3))
      g.add(rod3([bx, y - 9, Z0 + 1], [bx, y, Z0 + dd * 0.55], 0.6, metal, 6))
    }
  }
  step(-44, 10)
  step(-14, 38)
  step(16, 66)
  step(-30, 112, 44, 30)
  g.add(rbox(44, 2.5, 34, wood, { x: 38, y: 92, z: Z0 + 17 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(rbox(2, 12, 1, metal, { x: 38 + s * 15, y: 80, z: Z0 + 0.5 }, 0.3))
    g.add(rod3([38 + s * 15, 81, Z0 + 1], [38 + s * 15, 92, Z0 + 20], 0.6, metal, 6))
  }
  const house = shell(40, 32, 30, 1.5, pad, { front: [{ kind: 'circle', x: 0, y: 15, r: 9 }] })
  house.position.set(38, 94.5, Z0 + 16)
  g.add(house)
  g.add(rbox(44, 2, 34, wood, { x: 38, y: 126.5, z: Z0 + 17 }, 0.8))
  const sisal = '#d8c39a'
  g.add(rbox(18, 50, 2, sisal, { x: 50, y: 22, z: Z0 + 1 }, 0.5))
  for (let i = 0; i < 8; i++) g.add(rbox(18.4, 0.6, 2.4, shade(sisal, -0.12), { x: 50, y: 25 + i * 6, z: Z0 + 1 }, 0.2))
  g.position.y = 60
  const out = new THREE.Group()
  out.add(g)
  return out
}

/** 婴儿尿布台：三个抽屉（可拉出）+ 侧格 + 三面护栏 + 绗缝垫 */
function changingTable(p: string[]) {
  const [padC, body, knobC] = p
  const g = carcass(85, 86, 48, body, 4)
  g.add(legs(80, 44, 4.2, shade(body, -0.15), 2, 3))
  const fy = 6.9
  const ceil = 87.5
  g.add(divider(18, fy, ceil, 48, body))
  for (let i = 0; i < 3; i++) {
    const y = 7.3 + i * 26.6
    g.add(pullOut([front(55.8, 25.6, 48, shade(body, 0.04), -11.6, y), knob(-11.6, y + 17, 25.6, knobC, 1.6), drawerTray(52, 20, 44, shade(body, 0.08), -11.6, y + 1, 23.6)], 26))
  }
  g.add(rbox(21.5, 2.5, 45.6, body, { x: 29.55, y: 46, z: 0.5 }, 0.6))
  g.add(rbox(85, 8, 2, body, { y: 90, z: -23.6 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(2, 8, 47, body, { x: s * 41.5, y: 90, z: 0.5 }, 0.6))
  g.add(rbox(81, 4, 2, body, { y: 90, z: 23.6 }, 0.6))
  for (let i = 0; i < 3; i++) g.add(rbox(26, 6, 44, padC, { x: (i - 1) * 26.4, y: 90, z: 0.4 }, 2.5))
  return g
}

/** 儿童绘本架：小房子造型，布兜三层 + 底部布收纳盒 */
function bookSling(p: string[]) {
  const [sling, binC, wood] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(3, 76, 3, wood, { x: sx * 43.5, z: sz * 15 }, 0.8))
    for (const y of [2, 40]) g.add(rbox(3, 3, 27.2, wood, { x: sx * 43.5, y }, 0.6))
    g.add(batten([sx * 45.5, 74.5, 0], [0, 97, 0], 3, 33, wood))
  }
  for (const s of [-1, 1]) g.add(rbox(84.2, 2, 2, wood, { y: 2, z: s * 15 }, 0.5))
  g.add(rbox(84, 2, 30, wood, { y: 4 }, 0.6))
  for (let i = 0; i < 3; i++) {
    const yb = 42 + i * 15
    const ybot = yb - 16
    g.add(cylX(1.2, 84.2, wood, 0, yb, -13, 10))
    g.add(cylX(1.2, 84.2, wood, 0, ybot + 9, 12, 10))
    g.add(batten([0, yb - 1, -13], [0, ybot, 7], 84, 0.6, sling))
    g.add(batten([0, ybot, 7], [0, ybot + 9, 12], 84, 0.6, sling))
  }
  for (const s of [-1, 1]) {
    const b = shell(38, 16, 28, 1, binC, { top: false, front: [{ kind: 'rect', x: 0, y: 11, w: 12, h: 2.6, r: 1.3 }] })
    b.position.set(s * 20.5, 6, 0)
    g.add(b)
  }
  return g
}

/** 复古旅行箱：皮带 + 铜包角，可当茶几 */
function trunk(p: string[]) {
  const [body, strap, metal] = p
  const g = new THREE.Group()
  const W = 90
  const D = 50
  const H = 51.5
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 1.4, 6, metal, { x: sx * 40, z: sz * 20 }, 0.4))
  g.add(rbox(W, H - 1, D, body, { y: 1 }, 2))
  for (const y of [10, 24]) g.add(rbox(W + 0.4, 3, D + 0.4, shade(body, -0.15), { y }, 1))
  g.add(rbox(W + 0.6, 1.6, D + 0.6, metal, { y: 36 }, 0.6))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [1.2, H - 5]) g.add(rbox(5, 5, 5, metal, { x: sx * (W / 2 - 2), y, z: sz * (D / 2 - 2) }, 1))
  for (const x of [-24, 24]) {
    for (const s of [-1, 1]) g.add(rbox(6, H - 2.5, 0.8, strap, { x, y: 1.5, z: s * (D / 2 + 0.2) }, 0.3))
    g.add(rbox(6, 0.8, D + 0.8, strap, { x, y: H - 0.4 }, 0.3))
    g.add(rbox(4, 4, 0.6, metal, { x, y: 40, z: D / 2 + 0.8 }, 0.2))
  }
  g.add(rbox(6, 7, 1, metal, { y: 31, z: D / 2 + 0.4 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(rbox(1.4, 4, 12, metal, { x: s * (W / 2 + 0.3), y: 33 }, 0.4))
    g.add(torus(5, 0.9, strap, { x: s * (W / 2 + 0.9), y: 35, rz: Math.PI, ry: Math.PI / 2 }, Math.PI))
  }
  return g
}

/** 梯形置物架：前斜后直，层板由下往上变浅 */
function ladderFront(y: number) {
  return 18 - 34 * (y / 180)
}
function ladderShelf(p: string[]) {
  const [shelfC, frame] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(batten([s * 33, 0, 18], [s * 33, 180, -16], 3.5, 4, frame))
    g.add(rbox(3.5, 180, 3.5, frame, { x: s * 33, z: -18.25 }, 0.8))
  }
  g.add(rbox(70, 3, 5, frame, { y: 176.5, z: -17.5 }, 0.8))
  for (const y of LADDER_YS) {
    const fz = ladderFront(y + 1) + 2
    g.add(rbox(62.6, 2, fz + 20, shelfC, { y, z: (fz - 20) / 2 }, 0.6))
  }
  return g
}
const LADDER_YS = [30, 70, 110, 150]

/** 推拉门衣柜的可摆放层：底板、枕棚、挂衣杆 */
function slidingWardrobeSurfaces(w: number): SurfaceDef[] {
  const shape = [rectPoly(-w / 2 + 2.5, -28, w / 2 - 2.5, 25)]
  return [
    { y: 8, h: 150, inside: true, shape },
    { y: 174, h: 21.5, inside: true, shape },
    pipeHook(-w / 2 + 2, w / 2 - 2, 166, -2, 152, 1.2),
  ]
}

/** 水屋箪笥的可摆放层：下段两层、上段两层、七个抽屉 */
function mizuyaSurfaces(): SurfaceDef[] {
  const lo = [rectPoly(-57.5, -21.5, 57.5, 20)]
  const up = [rectPoly(-55.5, -21.5, 55.5, 11.5)]
  return [
    { y: 7, h: 29, inside: true, shape: lo },
    { y: 38, h: 28, inside: true, shape: lo },
    { y: 86, h: 10.5, inside: true, shape: up },
    { y: 98.6, h: 34, inside: true, shape: up },
    { y: 134.6, h: 36.5, inside: true, shape: up },
    ...[0, 1, 2].map((i) => drawerSurf(-40 + i * 40 - 18, -40 + i * 40 + 18, 69.8, 20.9, 38, 9, 23)),
    ...[0, 1, 2, 3].map((i) => drawerSurf(-43.5 + i * 29 - 12.5, -43.5 + i * 29 + 12.5, 89.1, 12.7, 30, 6, 18)),
  ]
}

/** 储物柜里各层板的顶面高度（不含底板 y = 7）：高柜一块帽架，矮柜两块隔板 */
function lockerBoards(tall: boolean) {
  return tall ? [150.7] : [34.7, 61.7]
}

/** 储物柜的可摆放层：每列一格 */
function lockerSurfaces(tall: boolean): SurfaceDef[] {
  const cols = [rectPoly(-42.5, -21.5, -15.5, 20), rectPoly(-13.5, -21.5, 13.5, 20), rectPoly(15.5, -21.5, 42.5, 20)]
  const ys = [7, ...lockerBoards(tall)]
  const top = tall ? 178 : 88
  return ys.map((y, i) => ({ y, h: Math.round(((ys[i + 1] ?? top + 1.4) - 1.4 - y - 0.5) * 10) / 10, inside: true, shape: cols }))
}

// =====================================================================
// 配色
// =====================================================================

/** 床：[被子, 床单 / 床垫, 床架] */
const BED: Pal3[] = [
  ['cute', C.pink, C.white, C.white],
  ['nordic', N.sage, N.white, N.oak],
  ['modern', M.char, M.light, M.walnut],
  ['japanese', J.ai, J.washi, J.wood],
  ['retro', R.mustard, R.cream, R.caramel],
]
/** 柜子：[柜体, 门板, 把手] */
const CAB: Pal3[] = [
  ['cute', C.white, C.sakura, C.lemon],
  ['nordic', N.white, N.oak, N.oak],
  ['nordic', N.oak, N.oakL, M.black],
  ['modern', M.white, M.light, M.black],
  ['modern', M.char, M.gray, M.silver],
  ['japanese', J.wood, J.hinoki, J.sumi],
]

const r = rectPoly

// =====================================================================
// 素材
// =====================================================================

export const FURNITURE_MORE: AssetDef[] = [
  // ---------- 沙发 ----------
  withPals({ id: 'fm-chesterfield', name: '切斯特菲尔德沙发', category: 'living', w: 198, d: 86, h: 77, styles: ['retro', 'industrial', 'modern', 'classic'], build: chesterfield }, [
    ['retro', '#7a2e2a', R.cream, '#5a3a28'],
    ['industrial', I.leather, I.rust, I.iron],
    ['retro', '#2f5a46', R.mustard, R.caramel],
    ['modern', M.black, M.light, M.silver],
    ['cute', C.pink, C.white, C.woodD],
    ['classic', '#7d2a35', '#efe3c4', '#5e3a26'],
    ['classic', '#2c3a5a', '#f1e8d6', '#6e3524'],
  ]),
  ...[2, 3, 4].map((n) =>
    withPals({ id: `fm-modular-${n}`, name: '模块组合沙发', sizeLabel: `${n} 模块`, category: 'living', w: n * 80 + 28, d: 98, h: 73, build: (p) => modularSofa(n, p) }, [
      ['modern', M.char, M.light, M.black],
      ['modern', M.light, M.char, M.black],
      ['nordic', N.linen, N.sage, N.oak],
      ['nordic', N.blue, N.mustard, N.oak],
      ['cute', C.lilac, C.sakura, C.white],
    ]),
  ),
  withPals({ id: 'fm-jp-low-sofa', name: '和风矮沙发', category: 'japanese', w: 171, d: 80, h: 62, styles: ['japanese', 'nordic'], build: jpLowSofa }, [
    ['japanese', J.washi, J.ai, J.wood],
    ['japanese', J.ai, J.washi, J.hinoki],
    ['japanese', J.tatami, J.shu, J.dark],
    ['nordic', N.gray, N.mustard, N.oak],
    ['nordic', N.sage, N.linen, N.oakL],
  ]),
  withPals({ id: 'fm-rattan-sofa', name: '藤编沙发', category: 'living', w: 145, d: 71, h: 81, styles: ['japanese', 'nordic', 'retro'], build: rattanSofa }, [
    ['nordic', N.white, N.sage, '#c79a5b'],
    ['japanese', J.washi, J.ai, '#b8884e'],
    ['nordic', N.linen, N.mustard, '#d2a86a'],
    ['cute', C.mint, C.pink, '#d2a86a'],
    ['retro', R.cream, R.orange, R.caramel],
  ]),
  withPals({ id: 'fm-curve-sofa', name: '天鹅绒弧形沙发', category: 'living', w: 220, d: 100, h: 72, styles: ['modern', 'cute'], build: curveSofa }, [
    ['modern', M.light, M.char, M.black],
    ['cute', C.pink, C.lemon, C.white],
    ['cute', C.lilac, C.sakura, C.white],
    ['retro', R.teal, R.mustard, R.caramel],
    ['nordic', N.linen, N.blue, N.oak],
  ]),
  ...([false, true] as const).map((open) =>
    withPals({ id: open ? 'fm-recliner-open' : 'fm-recliner', name: '功能躺椅沙发', sizeLabel: open ? '躺平' : '坐姿', form: open ? 'open' : 'closed', category: 'living', w: 94, d: open ? 160 : 96, h: open ? 98 : 101, styles: ['modern', 'industrial', 'retro'], build: (p) => recliner(p, open) }, [
      ['modern', M.char, M.gray, M.black],
      ['industrial', I.leather, I.rust, I.iron],
      ['retro', R.caramel, R.cream, '#5a3a28'],
      ['nordic', N.gray, N.linen, M.char],
      ['cute', C.peach, C.white, C.woodD],
    ]),
  ),
  withPals({ id: 'fm-booth', name: '双人卡座', category: 'dining', w: 132, d: 63, h: 107, styles: ['retro', 'industrial', 'modern'], build: booth }, [
    ['retro', R.red, R.cream, R.cream],
    ['retro', R.teal, R.mustard, R.caramel],
    ['retro', R.mustard, R.orange, '#5a3a28'],
    ['industrial', I.leather, I.rust, I.walnut],
    ['modern', M.char, M.light, M.walnut],
    ['cute', C.pink, C.white, C.white],
  ]),
  withPals({ id: 'fm-cloud-sofa', name: '云朵沙发', category: 'living', w: 200, d: 92, h: 73, styles: ['cute', 'modern'], build: cloudSofa }, [
    ['cute', C.white, C.pink, C.white],
    ['cute', C.sakura, C.sky, C.white],
    ['cute', C.lemon, C.mint, C.white],
    ['modern', M.white, M.char, M.black],
    ['nordic', N.linen, N.sage, N.oak],
  ]),
  withPals({ id: 'fm-daybed', name: '格栅日床', category: 'living', w: 197, d: 89, h: 72, styles: ['nordic', 'japanese', 'retro'], build: daybed }, [
    ['nordic', N.linen, N.mustard, N.oak],
    ['nordic', N.blue, N.white, N.oakL],
    ['japanese', J.washi, J.ai, J.dark],
    ['retro', R.mustard, R.teal, R.caramel],
    ['modern', M.light, M.char, M.walnut],
  ]),

  // ---------- 床 ----------
  withPals({ id: 'fm-canopy-bed', name: '帷幔公主床', category: 'bedroom', w: 155, d: 213, h: 206, styles: ['cute', 'nordic', 'japanese'], build: canopyBed }, [
    ['cute', C.pink, C.sakura, C.white],
    ['cute', C.lilac, C.white, C.white],
    ['nordic', N.sage, N.linen, N.oak],
    ['japanese', J.ai, J.washi, J.dark],
    ['modern', M.light, M.white, M.black],
  ]),
  withPals({
    id: 'fm-four-poster',
    name: '四柱格栅床',
    category: 'bedroom',
    w: 168,
    d: 222,
    h: 195,
    styles: ['japanese', 'retro', 'nordic'],
    surfaces: [{ y: 0.2, shape: [r(-74, -100, 74, 100)], h: 35.6 }],
    build: fourPoster,
  }, [
    ['japanese', J.ai, J.washi, J.dark],
    ['japanese', J.shu, J.washi, J.wood],
    ['retro', R.olive, R.cream, R.caramel],
    ['nordic', N.blue, N.white, N.oak],
    ['industrial', I.rust, I.concrete, I.iron],
  ]),
  ...(
    [
      [100, '单人 100'],
      [122, '小双人 122'],
      [142, '双人 142'],
    ] as const
  ).map(([w, label]) =>
    withPals({ id: `fm-tatami-bed-${w}`, name: '榻榻米床台', sizeLabel: label, category: 'japanese', w, d: 212, h: 46, styles: ['japanese', 'nordic', 'modern'], build: (p) => tatamiBed(w, p) }, [
      ['japanese', J.ai, J.washi, J.wood],
      ['japanese', J.shu, J.washi, J.dark],
      ['nordic', N.sage, N.white, N.oak],
      ['modern', M.char, M.white, M.walnut],
      ['cute', C.pink, C.white, C.woodL],
    ]),
  ),
  withPals({
    id: 'fm-storage-bed',
    name: '抽屉储物床',
    category: 'bedroom',
    w: 160,
    d: 208,
    h: 85,
    surface: 85,
    surfaceShape: [r(-80, -104, 80, -88)],
    // 床座两侧的抽屉格：抽屉朝两侧拉出 40（slideX），里面的东西跟着抽屉走
    surfaces: [-1, 1].flatMap((s) => [-38, 54].map((zc): SurfaceDef => ({ y: 7.8, h: 17, inside: true, slideX: s * 40, shape: [s > 0 ? r(16, zc - 40.8, 73, zc + 40.8) : r(-73, zc - 40.8, -16, zc + 40.8)] }))),
    openable: true,
    styles: ['modern', 'nordic', 'cute'],
    build: storageBed,
  }, BED),
  withPals({ id: 'fm-round-bed', name: '圆床', category: 'bedroom', w: 220, d: 224, h: 80, styles: ['cute', 'retro', 'modern'], build: roundBed }, [
    ['cute', C.pink, C.white, C.white],
    ['cute', C.lilac, C.sakura, C.white],
    ['retro', R.red, R.cream, R.caramel],
    ['modern', M.char, M.light, M.black],
  ]),
  withPals({ id: 'fm-iron-bed', name: '铁艺床', category: 'bedroom', w: 147, d: 213, h: 113, styles: ['retro', 'industrial', 'cute'], surfaces: [{ y: 0.2, shape: [r(-67, -100, 67, 100)], h: 32.6 }], build: ironBed }, [
    ['retro', R.mustard, R.cream, '#3a3030'],
    ['industrial', I.rust, I.concrete, I.iron],
    ['cute', C.pink, C.white, C.white],
    ['nordic', N.sage, N.white, M.black],
    ['retro', R.teal, R.cream, R.cream],
  ]),
  withPals({ id: 'fm-nordic-bed', name: '北欧高脚床', category: 'bedroom', w: 160, d: 215, h: 100, styles: ['nordic', 'modern'], surfaces: [{ y: 0.2, shape: [r(-68, -94, 68, 100)], h: 29.6 }], build: nordicBed }, [
    ['nordic', N.sage, N.white, N.oak],
    ['nordic', N.mustard, N.linen, N.oakL],
    ['nordic', N.blue, N.white, N.white],
    ['modern', M.char, M.light, M.walnut],
    ['cute', C.mint, C.white, C.woodL],
  ]),
  ...([true, false] as const).map((open) =>
    withPals({ id: open ? 'fm-folding-bed' : 'fm-folding-bed-closed', name: '折叠床', sizeLabel: open ? '打开' : '收起', form: open ? 'open' : 'closed', category: 'bedroom', w: open ? 91 : 92, d: open ? 199 : 36, h: open ? 51 : 117, styles: ['modern', 'industrial', 'cute'], build: (p) => (open ? foldingBedOpen(p) : foldingBedClosed(p)) }, [
      ['cute', C.sky, C.white, C.white],
      ['nordic', N.gray, N.white, N.white],
      ['modern', M.char, M.light, M.black],
      ['industrial', '#5f6b4a', I.concrete, I.iron],
      ['retro', R.orange, R.cream, R.cream],
    ]),
  ),
  withPals({ id: 'fm-hotel-bed', name: '酒店风软包床', category: 'bedroom', w: 192, d: 258, h: 130, styles: ['modern', 'nordic', 'retro'], build: hotelBed }, [
    ['modern', M.char, M.white, M.walnut],
    ['modern', '#b9a892', M.white, M.char],
    ['nordic', N.blue, N.white, N.oak],
    ['retro', R.teal, R.cream, R.caramel],
    ['industrial', I.leather, '#efe9de', I.iron],
    ['cute', C.pink, C.white, C.white],
  ]),
  withPals({ id: 'fm-car-bed', name: '跑车儿童床', category: 'kids', w: 110, d: 225, h: 71, styles: ['cute', 'retro'], build: carBed }, [
    ['cute', C.red, C.sky, C.white],
    ['cute', C.pink, C.white, C.lemon],
    ['cute', C.sky, C.lemon, C.white],
    ['retro', R.teal, R.cream, R.mustard],
  ]),

  // ---------- 柜类 ----------
  ...[120, 180].map((w) =>
    withPals({ id: `fm-sliding-wardrobe-${w}`, name: '推拉门衣柜', sizeLabel: `${w}`, category: 'bedroom', w: w + 1, d: 61, h: 200, surface: 200, surfaces: slidingWardrobeSurfaces(w), openable: true, styles: ['modern', 'nordic', 'japanese'], build: (p) => slidingWardrobe(w, p) }, [
      ['modern', M.white, M.light, M.silver],
      ['modern', M.char, M.walnut, M.silver],
      ['nordic', N.white, N.oak, N.oak],
      ['japanese', J.hinoki, J.washi, J.sumi],
      ['cute', C.white, C.sakura, C.lemon],
    ]),
  ),
  withPals({
    id: 'fm-closet-system',
    name: '开放式衣帽间',
    category: 'bedroom',
    w: 180,
    d: 50,
    h: 210,
    surface: 210,
    surfaces: [
      { y: 68.5, shape: [r(-28.5, -23, 28.5, 23)], h: 31.5 },
      { y: 102.5, shape: [r(-28.5, -23, 28.5, 23)], h: 32.5 },
      { y: 137.5, shape: [r(-28.5, -23, 28.5, 23)], h: 45.5 },
      { y: 185.5, shape: [r(-87.5, -23, -31.5, 23), r(-28.5, -23, 28.5, 23), r(31.5, -23, 87.5, 23)], h: 22 },
      { y: 178, kind: 'hook', shape: [r(-62, -3, -33, 3), r(56, -3, 86, 3)], h: 80 },
      { y: 92, kind: 'hook', shape: [r(-68, -3, -33, 3)], h: 84 },
      // 中间三个抽屉
      ...[0, 1, 2].map((i) => drawerSurf(-27, 27, 7 + i * 20 + 1.8, 23.6, 42, 13, 26)),
    ],
    openable: true,
    build: closetSystem,
  }, CAB),
  withPals({
    id: 'fm-shokkidana',
    name: '食器棚',
    category: 'dining',
    w: 101,
    d: 48,
    h: 180,
    surface: 180,
    surfaceShape: [r(-50.5, -22.5, 50.5, 10)],
    surfaces: [
      { y: 85, shape: [r(-50, -22.5, 50, 22.5)], h: 37 },
      { y: 153, shape: [r(-47.5, -21, 47.5, 7.5)], h: 24.5, inside: true, glass: true },
      // 下柜：门里两层、两个抽屉
      { y: 8.9, shape: [r(-47.5, -20.5, 47.5, 20.5)], h: 26.5, inside: true },
      { y: 37.6, shape: [r(-47.5, -20.5, 47.5, 20.5)], h: 28, inside: true },
      ...[-1, 1].map((s) => drawerSurf(s * 24.4 - 22, s * 24.4 + 22, 69.8, 21.5, 38, 9, 23)),
    ],
    openable: true,
    styles: ['retro', 'japanese', 'nordic'],
    build: shokkidana,
  }, [
    ['retro', R.caramel, R.cream, BRASS],
    ['japanese', J.wood, J.hinoki, J.sumi],
    ['nordic', N.white, N.oak, N.oak],
    ['cute', C.white, C.mint, C.pink],
    ['industrial', I.walnut, I.iron, I.steel],
  ]),
  withPals({ id: 'fm-mizuya', name: '水屋箪笥', category: 'japanese', w: 122, d: 47, h: 175, surface: 175, surfaceShape: [r(-60, -23, 60, 18)], surfaces: mizuyaSurfaces(), openable: true, styles: ['japanese', 'retro'], build: mizuya }, [
    ['japanese', J.wood, J.washi, J.sumi],
    ['japanese', J.dark, J.washi, J.sumi],
    ['japanese', J.hinoki, J.washi, '#4a4040'],
    ['retro', R.caramel, R.cream, '#3a3030'],
    ['nordic', N.oak, N.white, M.black],
  ]),
  withPals({ id: 'fm-record-cabinet', name: '唱片柜', category: 'living', w: 122, d: 46, h: 62, surface: 62, surfaces: [18.9, 40].map((y) => ({ y, h: 19, inside: true, shape: [r(31.5, -19, 57, 19.5)] })), openable: true, styles: ['retro', 'nordic', 'industrial'], build: recordCabinet }, [
    ['retro', R.caramel, R.cream, R.mustard],
    ['retro', R.teal, R.cream, BRASS],
    ['nordic', N.oak, N.white, M.black],
    ['industrial', I.walnut, I.iron, I.steel],
    ['modern', M.walnut, M.char, M.silver],
  ]),
  ...([true, false] as const).map((tall) =>
    withPals({ id: tall ? 'fm-locker' : 'fm-locker-grid', name: '金属储物柜', sizeLabel: tall ? '3 门高柜' : '9 格矮柜', category: 'storage', w: 90, d: 48, h: tall ? 180 : 90, surface: tall ? 180 : 90, surfaces: lockerSurfaces(tall), openable: true, styles: ['industrial', 'retro', 'cute'], build: (p) => locker(tall, p) }, [
      ['industrial', '#5f7470', '#6f8782', M.silver],
      ['industrial', I.iron, I.steel, M.silver],
      ['retro', '#d9d3c0', '#e8e2cf', I.steel],
      ['modern', M.white, M.light, M.black],
      ['cute', C.sky, C.mint, C.white],
    ]),
  ),
  withPals({ id: 'fm-apothecary', name: '药柜（百味箪笥）', category: 'storage', w: 102, d: 39, h: 120, surface: 120, surfaces: APOTHECARY_CELLS.map(([x, y]) => drawerSurf(x - (APO_CW - 2.4) / 2, x + (APO_CW - 2.4) / 2, y + 1.3, 16.6, 30, APO_RH - 5, 18)), openable: true, styles: ['retro', 'japanese', 'industrial'], build: apothecary }, [
    ['retro', R.caramel, shade(R.caramel, 0.06), BRASS],
    ['japanese', J.dark, J.hinoki, J.sumi],
    ['industrial', I.walnut, shade(I.walnut, 0.06), I.steel],
    ['nordic', N.oak, N.white, M.black],
    ['cute', C.woodL, C.white, C.pink],
  ]),
  withPals({
    id: 'fm-hall-tree',
    name: '玄关挂衣凳柜',
    category: 'entrance',
    w: 100,
    d: 42,
    h: 190,
    surface: 190,
    surfaceShape: [r(-50, -21, 50, 9)],
    surfaces: [
      { y: 4.5, shape: [r(-47.5, -19.5, 47.5, 20.5)], h: 17.5 },
      { y: 24.5, shape: [r(-47.5, -19.5, 47.5, 20.5)], h: 18.5 },
      { y: 136, kind: 'hook', shape: [r(-47, -19, 47, -12)], h: 80 },
      { y: 164.5, shape: [r(-47.5, -19.5, 47.5, 6)], h: 23 },
    ],
    styles: ['nordic', 'japanese', 'industrial'],
    build: hallTree,
  }, [
    ['nordic', N.oak, N.gray, M.black],
    ['nordic', N.white, N.mustard, N.oak],
    ['japanese', J.hinoki, J.ai, J.sumi],
    ['industrial', I.walnut, I.leather, I.iron],
    ['cute', C.white, C.pink, C.lemon],
    ['modern', M.char, M.light, M.silver],
  ]),
  ...[2, 3].map((n) =>
    withPals({ id: `fm-tilt-shoe-${n}`, name: '翻斗鞋柜', sizeLabel: `${n} 层`, category: 'entrance', w: 80, d: 27, h: 12 + n * 36, surface: 12 + n * 36, surfaces: Array.from({ length: n }, (_, i) => ({ y: 11.6 + i * 36, h: 33, inside: true, shape: [r(-38, -11.5, 38, 9.5)] })), openable: true, styles: ['modern', 'nordic', 'cute'], build: (p) => tiltShoe(n, p) }, [
      ['modern', M.white, M.white, M.black],
      ['modern', M.char, M.gray, M.silver],
      ['nordic', N.white, N.oak, N.oak],
      ['nordic', N.oak, N.sage, M.black],
      ['cute', C.white, C.sky, C.pink],
      ['retro', R.cream, R.mustard, R.caramel],
    ]),
  ),
  withPals({
    id: 'fm-kitchen-island',
    name: '厨房中岛',
    category: 'dining',
    w: 120,
    d: 65,
    h: 90,
    surface: 90,
    surfaces: [
      { y: 10.9, h: 26, inside: true, shape: [r(-52.5, -25, 52.5, 25.5)] },
      { y: 39.1, h: 26, inside: true, shape: [r(-52.5, -25, 52.5, 25.5)] },
      ...[-1, 1].map((s) => drawerSurf(s * 27.3 - 25, s * 27.3 + 25, 68.8, 26.6, 48, 9, 29)),
    ],
    openable: true,
    styles: ['nordic', 'modern', 'industrial'],
    build: island,
  }, [
    ['nordic', N.white, N.oak, M.black],
    ['modern', M.char, M.walnut, M.silver],
    ['industrial', I.iron, I.walnut, I.steel],
    ['japanese', J.ai, J.hinoki, J.sumi],
    ['retro', R.teal, R.caramel, BRASS],
    ['cute', C.mint, C.woodL, C.white],
  ]),
  withPals({
    id: 'fm-kitchen-cart',
    name: '厨房推车',
    category: 'dining',
    w: 79,
    d: 42,
    h: 88,
    surface: 88,
    surfaces: [
      { y: 15, shape: [r(-32, -18, 32, 18)], h: 33 },
      { y: 49, shape: [r(-32, -18, 32, 18)], h: 36 },
    ],
    styles: ['industrial', 'retro', 'cute'],
    build: kitchenCart,
  }, [
    ['industrial', I.iron, I.walnut, I.steel],
    ['retro', R.teal, R.caramel, R.cream],
    ['cute', C.pink, C.woodL, C.white],
    ['nordic', N.white, N.oak, N.oak],
    ['modern', M.black, M.walnut, M.silver],
  ]),
  withPals({
    id: 'fm-wine-cabinet',
    name: '酒柜',
    category: 'dining',
    w: 81,
    d: 42,
    h: 180,
    surface: 180,
    surfaces: [
      { y: 82.5, shape: [r(-37.5, -17, 37.5, 18)], h: 29.5 },
      { y: 114.5, shape: [r(-37.5, -17, 37.5, 18)], h: 27.5, inside: true, glass: true },
      { y: 144, shape: [r(-37.5, -17, 37.5, 18)], h: 17, inside: true, glass: true },
    ],
    openable: true,
    styles: ['industrial', 'retro', 'modern'],
    build: wineCabinet,
  }, [
    ['industrial', I.walnut, I.iron, I.steel],
    ['retro', R.caramel, '#5a3a28', R.mustard],
    ['modern', M.black, M.char, M.silver],
    ['nordic', N.oak, N.white, N.oak],
  ]),
  withPals({
    id: 'fm-arch-cabinet',
    name: '拱形玻璃柜',
    category: 'living',
    w: 81,
    d: 42,
    h: 175,
    surface: 175,
    surfaceShape: [r(-8, -17, 8, 17)],
    surfaces: [
      ...[20, 61, 101, 133].map((y, i): SurfaceDef => ({ y, shape: [i === 3 ? r(-24, -16, 24, 16) : r(-37, -16, 37, 16)], h: [40, 39, 31, 25][i], inside: true, glass: true })),
      drawerSurf(-35, 35, 4.3, 18.6, 32, 9, 20),
    ],
    openable: true,
    styles: ['cute', 'nordic', 'retro'],
    build: archCabinet,
  }, [
    ['cute', C.sakura, C.white, C.lemon],
    ['cute', C.mint, C.white, C.pink],
    ['nordic', N.white, N.oak, N.oak],
    ['retro', '#2f6b5e', R.cream, BRASS],
    ['modern', M.black, M.char, M.silver],
  ]),

  // ---------- 桌台 ----------
  withPals({
    id: 'fm-kyodai',
    name: '和风镜台',
    category: 'japanese',
    w: 61,
    d: 35,
    h: 104,
    surface: 35,
    surfaceShape: [r(-30, -8.5, 30, 16)],
    surfaces: [...[-1, 1].map((s) => drawerSurf(s * 14.5 - 13, s * 14.5 + 13, 23.3, 15.2, 28, 5, 17)), drawerSurf(-27.5, 27.5, 4.8, 15.2, 28, 11.5, 17)],
    openable: true,
    styles: ['japanese', 'retro', 'cute'],
    build: kyodai,
  }, [
    ['japanese', J.dark, J.shu, J.sumi],
    ['japanese', J.wood, J.ai, J.sumi],
    ['retro', R.caramel, R.red, BRASS],
    ['cute', C.woodL, C.pink, C.lemon],
  ]),
  withPals({
    id: 'fm-secretary',
    name: '翻盖书桌',
    category: 'study',
    w: 90,
    d: 79,
    h: 105,
    surface: 105,
    surfaceShape: [r(-45, -39.5, 45, -19.5)],
    surfaces: [{ y: 76.3, shape: [r(-38, 8.5, 38, 36.5)], h: 40 }, ...[0, 1, 2].map((i) => drawerSurf(-40, 40, 10 + i * 19.6 + 1.8, 5.1, 38, 13, 24))],
    openable: true,
    styles: ['retro', 'industrial', 'nordic'],
    build: secretary,
  }, [
    ['retro', R.caramel, '#4f6b3a', BRASS],
    ['retro', '#6b3e26', '#7a2e2a', BRASS],
    ['industrial', I.walnut, I.leather, I.iron],
    ['nordic', N.oak, N.sage, M.black],
    ['cute', C.white, C.sakura, C.lemon],
  ]),
  withPals({
    id: 'fm-pc-hutch',
    name: '电脑台（上方书架）',
    category: 'study',
    w: 140,
    d: 65,
    h: 150,
    surface: 150,
    surfaceShape: [r(-70, -32.5, 70, -6.5)],
    surfaces: [
      { y: 72, shape: [r(-70, -7.5, 70, 32.5), r(-40, -32.5, 40, -7.5)], h: 75 },
      { y: 72, shape: [r(-68, -31.5, -42, -7.5), r(42, -31.5, 68, -7.5)], h: 26 },
      { y: 100, shape: [r(-68, -31.5, -42, -7.5), r(42, -31.5, 68, -7.5)], h: 22 },
      { y: 124, shape: [r(-68, -31.5, -42, -7.5), r(42, -31.5, 68, -7.5)], h: 23.5 },
    ],
    styles: ['modern', 'industrial', 'nordic'],
    build: pcHutch,
  }, [
    ['modern', M.white, M.black, M.silver],
    ['modern', M.walnut, M.black, M.silver],
    ['industrial', I.walnut, I.iron, I.steel],
    ['nordic', N.oak, N.white, N.oak],
    ['cute', C.white, C.sky, C.pink],
  ]),
  withPals({
    id: 'fm-gakushu-desk',
    name: '学習机',
    category: 'kids',
    w: 105,
    d: 60,
    h: 125,
    surface: 125,
    surfaceShape: [r(-52.5, -30, 52.5, -9)],
    surfaces: [
      { y: 72, shape: [r(-52.5, -9, 52.5, 30)], h: 50 },
      { y: 72, shape: [r(-50.5, -29, 44, -10)], h: 22 },
      { y: 100, shape: [r(-50.5, -29, 44, -10)], h: 22 },
      // 侧柜三个抽屉 + 中间扁抽屉
      ...[0, 1, 2].map((i) => drawerSurf(22.5, 50.5, 3 + i * 21.8 + 1.8, 27.7, 48, 15, 28)),
      drawerSurf(-48, 18, 60.6, 27, 50, 6, 30),
    ],
    openable: true,
    styles: ['retro', 'cute', 'nordic'],
    build: gakushu,
  }, [
    ['retro', R.cream, R.orange, R.caramel],
    ['retro', '#c9b28a', R.teal, R.mustard],
    ['cute', C.white, C.pink, C.lemon],
    ['cute', C.woodL, C.sky, C.white],
    ['nordic', N.oak, N.white, N.sage],
  ]),
  withPals({ id: 'fm-c-table', name: 'C 形边桌', category: 'living', w: 50, d: 40, h: 62, surface: 62, styles: ['modern', 'nordic', 'industrial'], build: cTable }, [
    ['modern', M.white, M.black, M.black],
    ['modern', M.walnut, M.silver, M.silver],
    ['nordic', N.oak, N.white, N.white],
    ['industrial', I.walnut, I.iron, I.iron],
    ['cute', C.sakura, C.white, C.white],
  ]),
  withPals({ id: 'fm-bar-counter', name: '吧台', category: 'dining', w: 150, d: 60, h: 108, surface: 108, surfaces: [{ y: 52.5, shape: [r(-70, -23.5, 70, 13)], h: 50.5 }], styles: ['industrial', 'retro', 'modern'], build: barCounter }, [
    ['industrial', I.walnut, I.iron, I.steel],
    ['industrial', '#8a5a3a', I.concrete, I.iron],
    ['retro', R.caramel, R.cream, BRASS],
    ['modern', '#f1efea', M.char, M.silver],
    ['nordic', N.oak, N.white, M.black],
  ]),

  // ---------- 其他 ----------
  withPals({ id: 'fm-divider-shelf', name: '隔断书架', category: 'storage', w: 120, d: 35, h: 150, surface: 150, surfaces: [6.5, 52.5, 99.5].map((y, i) => ({ y, shape: [r(-57.5, -17.5, 57.5, 17.5)], h: [43.5, 44.5, 48][i] })), styles: ['nordic', 'modern', 'industrial'], build: dividerShelf }, [
    ['nordic', N.white, N.sage, N.oak],
    ['nordic', N.oak, N.white, N.oak],
    ['modern', M.white, M.char, M.black],
    ['modern', M.black, M.walnut, M.silver],
    ['industrial', I.walnut, I.iron, I.steel],
    ['cute', C.white, C.pink, C.lemon],
  ]),
  withPals({ id: 'fm-genkan-bench', name: '玄关鞋凳', category: 'entrance', w: 100, d: 34, h: 45, surface: 45, surfaces: [{ y: 11.8, shape: [r(-44, -13.5, 44, 13.5)], h: 23 }], styles: ['japanese', 'nordic', 'industrial'], build: genkanBench }, [
    ['japanese', J.hinoki, J.hinoki, J.sumi],
    ['japanese', J.dark, J.dark, J.sumi],
    ['nordic', N.oak, N.oak, M.black],
    ['nordic', N.white, N.oak, N.oak],
    ['industrial', I.walnut, I.iron, I.steel],
    ['modern', M.char, M.black, M.silver],
  ]),
  ...[2, 3].map((n) =>
    withPals({ id: `fm-koagari-${n}`, name: '小上がり', sizeLabel: `${n} 畳`, category: 'japanese', w: 88 * n, d: 178, h: 40, surface: 40, styles: ['japanese', 'modern', 'nordic'], build: (p) => koagari(n, p) }, [
      ['japanese', J.hinoki, J.tatami, J.sumi],
      ['japanese', J.dark, J.tatami, J.ai],
      ['modern', M.white, '#c4c79a', M.char],
      ['nordic', N.oak, '#d6d3a6', N.blue],
    ]),
  ),
  withPals({ id: 'fm-cat-wall', name: '猫爬墙', category: 'pets', w: 120, d: 34, h: 129, mount: 60, styles: ['cute', 'nordic', 'modern'], build: catWall }, [
    ['cute', C.woodL, C.pink, C.white],
    ['cute', C.white, C.mint, C.woodD],
    ['nordic', N.oak, N.gray, M.black],
    ['modern', M.white, M.char, M.black],
    ['japanese', J.hinoki, J.tatami, J.sumi],
  ]),
  withPals({
    id: 'fm-changing-table',
    name: '婴儿尿布台',
    category: 'kids',
    w: 85,
    d: 52,
    h: 98,
    surfaces: [...[6.9, 48.5].map((y): SurfaceDef => ({ y, shape: [r(19.5, -21, 40, 23)], h: 39 })), ...[0, 1, 2].map((i) => drawerSurf(-37.5, 14.3, 7.3 + i * 26.6 + 1.8, 23.6, 44, 19, 26))],
    openable: true,
    styles: ['cute', 'nordic'],
    build: changingTable,
  }, [
    ['cute', C.mint, C.white, C.pink],
    ['cute', C.sakura, C.white, C.lemon],
    ['cute', C.sky, C.woodL, C.white],
    ['nordic', N.sage, N.white, N.oak],
    ['nordic', N.linen, N.oak, M.black],
  ]),
  withPals({ id: 'fm-book-sling', name: '小屋绘本架', category: 'kids', w: 93, d: 34, h: 99, styles: ['cute', 'nordic'], build: bookSling }, [
    ['cute', C.pink, C.lemon, C.woodL],
    ['cute', C.mint, C.lilac, C.white],
    ['nordic', N.gray, N.mustard, N.oak],
    ['nordic', N.sage, N.linen, N.white],
    ['retro', R.mustard, R.teal, R.caramel],
  ]),
  withPals({ id: 'fm-trunk', name: '复古旅行箱', category: 'living', w: 94, d: 52, h: 52, surface: 51.5, styles: ['retro', 'industrial', 'cute'], build: trunk }, [
    ['retro', R.caramel, '#6b4228', '#c9a04a'],
    ['retro', '#3f6f6a', R.caramel, '#c9a04a'],
    ['industrial', '#5a4636', I.leather, I.steel],
    ['cute', C.pink, C.white, C.lemon],
  ]),
  withPals({
    id: 'fm-ladder-shelf',
    name: '梯形置物架',
    category: 'storage',
    w: 70,
    d: 40,
    h: 181,
    surfaces: LADDER_YS.map((y, i) => ({ y: y + 2, shape: [r(-31, -19.5, 31, ladderFront(y + 1) + 1.5)], h: i === 3 ? 25 : 38 })),
    styles: ['nordic', 'industrial', 'modern'],
    build: ladderShelf,
  }, [
    ['nordic', N.oak, N.oak, N.oak],
    ['nordic', N.white, N.oak, N.oak],
    ['industrial', I.walnut, I.iron, I.iron],
    ['modern', M.black, M.black, M.black],
    ['japanese', J.hinoki, J.wood, J.wood],
  ]),
]
