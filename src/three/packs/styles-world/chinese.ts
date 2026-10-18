// 新中式补充款：客厅 / 餐厅 / 卧室 / 书房的主力家具（沙发、圈椅、茶几、电视柜、餐桌椅、床、衣柜、斗柜、书桌椅、亮格柜、台灯），
// 中式人家一键布置时整套换成中式造型，而不是换了红木色的通用款。
// 只放建模函数和它们用到的常量，素材表在 ../styles-world.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, cyl, rbox, shade, torus } from '../../toon'
import { C, hangingPipe, holePanel, pipeHook, rectPoly, type SurfaceDef } from '../../kit'
import { batten, cappedTube, cylZ, latheAt, lit, rod3 } from '../../geo'
import { drawerLv, drawerOf, hollow, swingDoor } from '../../cabinetKit'
import { TUBE, brassPlate, cabriole, lattice, lowerSeat, prism, sidePrism, strip, waistBase, type P2 } from './common'

const r = rectPoly

/** 新中式沙发（双人 / 三人）：束腰马蹄足底座、格心靠背 + 拱起的搭脑、开光扶手板，软垫 + 圆枕 */
export function cnSofa(W: number) {
  return (p: string[]) => {
    const [wood, cushion, dark] = p
    const g = new THREE.Group()
    const D = 84
    const top = waistBase(g, W, D, 10, wood, dark, 6)
    const bh = 50
    const zb = -D / 2 + 2.4
    g.add(holePanel(W - 8, bh, 3.6, wood, lattice(W - 8, bh, Math.round(W / 26), 2, 2.6, 4), { y: top, z: zb }))
    g.add(prism([[-W / 2, top + bh], [W / 2, top + bh], [W / 2, top + bh + 3], [W * 0.18, top + bh + 4.2], [0, top + bh + 5.4], [-W * 0.18, top + bh + 4.2], [-W / 2, top + bh + 3]], 6, dark, zb + 0.2))
    const ah = 26
    for (const s of [-1, 1]) {
      g.add(rbox(5, bh, 5, wood, { x: s * (W / 2 - 2.5), y: top, z: zb }, 1))
      g.add(holePanel(D - 6, ah, 3.6, wood, [{ kind: 'circle', x: -4, y: ah / 2, r: 7.5 }], { x: s * (W / 2 - 2.4), y: top, z: 1.5, ry: Math.PI / 2 }))
      g.add(rbox(6, 3, D - 2, dark, { x: s * (W / 2 - 3), y: top + ah, z: 0.5 }, 1))
      g.add(rbox(5, ah, 5, wood, { x: s * (W / 2 - 2.5), y: top, z: D / 2 - 2.5 }, 1))
    }
    const n = W > 190 ? 3 : 2
    const inner = W - 12
    const cw = inner / n
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + cw * (i + 0.5)
      g.add(rbox(cw - 1, 12, D - 14, cushion, { x, y: top, z: 5 }, 3))
      g.add(rbox(cw - 3, 30, 11, cushion, { x, y: top + 11, z: -D / 2 + 10, rx: -0.1 }, 4))
    }
    for (const s of [-1, 1]) g.add(cylZ(6.5, 22, cushion, s * (W / 2 - 12), top + 18.5, 6, 16))
    return g
  }
}

/** 圈椅：马蹄形椅圈从背后一路落到扶手前端出头，S 形靠背板，鹅脖前腿，软垫 */
export function cnQuanyi(p: string[]) {
  const [wood, cushion, dark] = p
  const g = new THREE.Group()
  const X = 23
  const Z = 20
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * X, 0, -Z], [s * X, 46, -Z], [s * (X - 1), 85, -Z - 1.5]], 1.7, wood, { ...TUBE, caps: false }))
    g.add(cappedTube([[s * X, 0, Z], [s * X, 46, Z], [s * (X + 1.5), 64, Z + 1]], 1.7, wood, { ...TUBE, caps: false }))
    g.add(rod3([s * X, 16, -Z], [s * X, 16, Z], 1, dark))
    g.add(rod3([s * (X + 0.4), 48, 4], [s * (X + 2.4), 66.5, 4], 0.8, wood))
  }
  // 椅圈：后高前低，前端越过鹅脖向外出头
  const half: [number, number, number][] = [[28, 66.5, 26], [25.5, 64.5, 20], [25.6, 67, 6], [24.4, 75, -9], [21.8, 84.5, -19.5], [13, 90.5, -25], [0, 92.5, -26.5]]
  const ring = [...half.map(([x, y, z]) => [-x, y, z] as [number, number, number]), ...half.slice(0, -1).reverse()]
  g.add(cappedTube(ring, 1.9, wood, TUBE))
  const splat: P2[] = [[-Z + 0.5, 48], [-Z + 1.6, 60], [-Z + 2, 72], [-Z + 0.4, 83], [-Z - 2.6, 90], [-Z - 5.8, 92.6]]
  g.add(sidePrism(strip(splat, 1.6), 16, wood, 0))
  g.add(rbox(52, 4, 45, wood, { y: 44 }, 1))
  g.add(rbox(46, 4.5, 40, cushion, { y: 48, z: 1 }, 1.8))
  g.add(prism([[-22.5, 44], [22.5, 44], [22.5, 39], [16, 38], [10, 35.5], [-10, 35.5], [-16, 38], [-22.5, 39]], 1.6, dark, Z))
  g.add(rbox(47, 2.2, 3.4, dark, { y: 8, z: Z }, 0.6))
  g.add(rod3([-X, 21, -Z], [X, 21, -Z], 1, dark))
  return lowerSeat(g, 44, 2)
}

/** 新中式茶几：束腰马蹄腿长方几，下层搁板 */
export function cnCoffee(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  const W = 100
  const D = 64
  waistBase(g, W, D, 31.6, wood, dark, 5)
  g.add(rbox(W - 12, 2, D - 12, dark, { y: 10 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(W - 12, 2.4, 2.4, wood, { y: 6, z: s * (D / 2 - 5) }, 0.5))
  return g
}
export const CN_COFFEE_SURFACES: SurfaceDef[] = [{ y: 12, h: 13.5, shape: [r(-43, -25, 43, 25)] }]

/** 新中式电视柜：短马蹄腿、两端翘头的面板，左右各两只铜面叶抽屉，中间敞开 */
export function cnTvStand(p: string[]) {
  const [wood, brass, dark] = p
  const g = new THREE.Group()
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(5, 9.4, 5, wood, { x: sx * 74, y: 1.6, z: sz * 16.5 }, 1))
      g.add(rbox(6.2, 2, 6.2, dark, { x: sx * 74.3, z: sz * 16.8 }, 0.8))
    }
  g.add(prism([[-71.5, 11], [71.5, 11], [71.5, 8], [60, 6.8], [20, 8.6], [-20, 8.6], [-60, 6.8], [-71.5, 8]], 1.4, dark, 19))
  g.add(hollow(156, 34, 40, wood, { y: 11 }, 1.6, inner))
  g.add(rbox(160, 3.5, 44, wood, { y: 45 }, 1))
  for (const s of [-1, 1]) g.add(prism([[s * 72, 48.5], [s * 80, 48.5], [s * 80.6, 52], [s * 78, 51.2], [s * 75, 49.6], [s * 72, 49.2]], 40, wood))
  for (const s of [-1, 1]) g.add(rbox(1.6, 30.8, 38, wood, { x: s * 27, y: 12.6, z: 0.4 }, 0.3))
  for (const [x0, x1] of CN_TV_COLS)
    for (const y of CN_TV_ROWS) {
      const cx = (x0 + x1) / 2
      g.add(drawerOf([rbox(x1 - x0 - 0.8, 14.4, 1.2, dark, { x: cx, y, z: 20.4 }, 0.5), brassPlate(cx, y + 8.6, 21, 2.4, brass)], x0, x1, y, 14.4, 19.8, 34, inner))
    }
  return g
}
const CN_TV_COLS: [number, number][] = [[-76.4, -27.8], [27.8, 76.4]]
const CN_TV_ROWS = [13, 28.4]
export const CN_TV_SURFACES: SurfaceDef[] = [{ y: 12.6, h: 30.8, shape: [r(-25.4, -18.4, 25.4, 19.6)] }, ...CN_TV_COLS.flatMap(([x0, x1]) => CN_TV_ROWS.map((y) => drawerLv(x0, x1, y, 14.4, 19.8, 34)))]

/** 新中式长餐桌：束腰马蹄腿，长边罗锅枨加矮老，短边罗锅枨 */
export function cnDining(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  const W = 135
  const D = 80
  waistBase(g, W, D, 65.6, wood, dark, 6)
  const lx = W / 2 - 4
  const lz = D / 2 - 4
  for (const s of [-1, 1]) {
    g.add(cappedTube([[-lx, 48, s * lz], [-lx + 16, 55, s * lz], [lx - 16, 55, s * lz], [lx, 48, s * lz]], 1.3, dark, { ...TUBE, caps: false }))
    for (const k of [-24, 0, 24]) g.add(rod3([k, 55, s * lz], [k, 62.2, s * lz], 0.9, dark))
    g.add(cappedTube([[s * lx, 48, -lz], [s * lx, 55, -lz + 12], [s * lx, 55, lz - 12], [s * lx, 48, lz]], 1.3, dark, { ...TUBE, caps: false }))
  }
  return g
}

/** 新中式圆餐桌：圆面束腰、鼓形牙圈，四条三弯腿落马蹄，底下一圈托泥枨 */
export function cnRound(p: string[]) {
  const [wood, dark] = p
  const g = new THREE.Group()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cabriole(Math.cos(a) * 40, Math.sin(a) * 40, 63, 2.4, wood, Math.cos(a) * 0.7, Math.sin(a) * 0.7, 'hoof', dark))
  }
  g.add(torus(39.6, 1.3, dark, { y: 15.7, rx: Math.PI / 2 }))
  g.add(cyl(48, 48, 7, wood, { y: 62.6 }, 48))
  g.add(cyl(52, 52, 2.4, dark, { y: 69.6 }, 48))
  g.add(cyl(55, 55, 4, wood, { y: 72 }, 48))
  return g
}

/** 灯挂椅：后腿直通两端挑出的搭脑，S 形独板靠背，软屉座面，步步高赶枨 */
export function cnDengguaChair(p: string[]) {
  const [wood, mat, dark] = p
  const g = new THREE.Group()
  const X = 19.5
  const Z = 19
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * X, 0, -Z], [s * X, 47, -Z], [s * (X - 1.5), 100, -Z - 3]], 1.6, wood, { ...TUBE, caps: false }))
    g.add(cyl(1.6, 1.6, 47, wood, { x: s * X, z: Z }, 12))
    g.add(rod3([s * X, 14, -Z], [s * X, 14, Z], 0.9, dark))
  }
  g.add(cappedTube([[-23, 101.6, -21.6], [-18, 100.4, -22.2], [0, 99.4, -23], [18, 100.4, -22.2], [23, 101.6, -21.6]], 1.7, wood, TUBE))
  const splat: P2[] = [[-Z + 0.5, 49], [-Z + 1.4, 62], [-Z + 1.8, 74], [-Z + 0.2, 88], [-Z - 2.6, 99.4]]
  g.add(sidePrism(strip(splat, 1.5), 15, wood, 0))
  g.add(rbox(45, 4, 42, wood, { y: 45 }, 1))
  g.add(rbox(38, 0.8, 35, mat, { y: 48.6 }, 0.3))
  g.add(prism([[-18, 45], [18, 45], [18, 41.5], [11, 40], [-11, 40], [-18, 41.5]], 1.4, dark, Z))
  g.add(rbox(40, 2.2, 3.2, dark, { y: 7, z: Z }, 0.6))
  g.add(rod3([-X, 20, -Z], [X, 20, -Z], 0.9, dark))
  return lowerSeat(g, 45, 3)
}

/** 新中式床（床垫宽 m）：束腰马蹄足床身，立柱 + 翘头搭脑的床头，月洞开光里衬软包，矮床尾 */
export function cnBed(m: number) {
  return (p: string[]) => {
    const [duvet, sheet, wood] = p
    const dark = shade(wood, -0.1)
    const g = new THREE.Group()
    const W = m + 8
    const D = 212
    const top = waistBase(g, W, D, 12, wood, dark, 7)
    const HB = 106
    const z0 = -D / 2 + 3
    const bw = W - 12
    for (const s of [-1, 1]) g.add(rbox(6, HB - top - 4, 6, wood, { x: s * (W / 2 - 3), y: top, z: z0 }, 1))
    g.add(rbox(bw, 22, 3, wood, { y: top, z: z0 }, 0.6))
    const rr = Math.min(22, bw * 0.19)
    const side = (bw / 2 - rr) / 2 + rr
    g.add(
      holePanel(bw, 56, 3, wood, [
        { kind: 'circle', x: 0, y: 28, r: rr },
        { kind: 'rect', x: -side, y: 10, w: bw / 2 - rr - 12, h: 36, r: 3 },
        { kind: 'rect', x: side, y: 10, w: bw / 2 - rr - 12, h: 36, r: 3 },
      ], { y: top + 22, z: z0 }),
    )
    g.add(rbox(bw - 2, 54, 1.6, sheet, { y: top + 23, z: z0 - 2.2 }, 0.4))
    g.add(rbox(bw, HB - 4 - (top + 78), 3.4, wood, { y: top + 78, z: z0 }, 0.6))
    g.add(prism([[-W / 2 - 1.5, HB - 4], [W / 2 + 1.5, HB - 4], [W / 2 + 2.2, HB + 2], [W / 2, HB + 0.6], [-W / 2, HB + 0.6], [-W / 2 - 2.2, HB + 2]], 7, dark, z0))
    // 床尾
    for (const s of [-1, 1]) g.add(rbox(6, 26, 6, wood, { x: s * (W / 2 - 3), y: top, z: D / 2 - 3 }, 1))
    g.add(rbox(W - 12, 18, 3, wood, { y: top, z: D / 2 - 3 }, 0.6))
    g.add(rbox(W - 6, 3, 5, dark, { y: top + 18, z: D / 2 - 3 }, 0.8))
    // 床品
    g.add(rbox(W - 14, 20, D - 14, sheet, { y: top, z: 0 }, 5))
    const pn = m >= 120 ? 2 : 1
    for (let i = 0; i < pn; i++) g.add(rbox(pn > 1 ? m * 0.42 : m * 0.6, 11, 32, C.white, { x: pn > 1 ? (i ? 1 : -1) * m * 0.24 : 0, y: top + 19, z: -D / 2 + 30, rx: -0.12 }, 5))
    g.add(rbox(W - 10, 8, D - 76, duvet, { y: top + 19, z: 26 }, 4))
    g.add(rbox(W - 9.6, 3, 15, duvet, { y: top + 25.5, z: 26 - (D - 76) / 2 + 7.5 }, 1.5))
    return g
  }
}
/** 床面（被子顶）高度 */
export const CN_BED_TOP = 49.4

/** 新中式对开门衣柜：短马蹄腿、门上部格心下部镶板，闩杆 + 铜面叶；门里挂衣杆 + 枕棚 */
export function cnWardrobe(p: string[]) {
  const [wood, brass, dark] = p
  const g = new THREE.Group()
  const W = 100
  const D = 56
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 8, 5, wood, { x: sx * 47.5, z: sz * 25.5 }, 1))
  g.add(prism([[-45, 8], [45, 8], [45, 5], [36, 4], [-36, 4], [-45, 5]], 1.4, dark, D / 2 - 0.4))
  g.add(hollow(W, 186, D, wood, { y: 8 }, 2, inner))
  g.add(rbox(W - 4, 1.6, D - 3, inner, { y: 176, z: 0.5 }, 0.3))
  g.add(hangingPipe(-46, 46, 168, 0))
  g.add(rbox(W + 3, 4, D + 3, dark, { y: 194 }, 1))
  g.add(rbox(3.2, 182, 1.4, dark, { y: 10, z: D / 2 + 0.3 }, 0.5))
  for (const s of [-1, 1]) {
    const dx = s * (W / 4 + 0.5)
    const dw = W / 2 - 5.6
    const parts: THREE.Object3D[] = [
      rbox(dw, 182, 1.2, wood, { x: dx, y: 10, z: D / 2 + 0.2 }, 0.5),
      holePanel(dw - 9, 70, 0.8, dark, lattice(dw - 9, 70, 3, 5, 1.6, 2.6), { x: dx, y: 108, z: D / 2 + 1.2 }),
      rbox(dw - 9, 64, 0.6, shade(wood, -0.06), { x: dx, y: 30, z: D / 2 + 0.95 }, 0.3),
    ]
    for (const hy of [24, 168]) parts.push(rbox(4, 4, 0.5, brass, { x: s * (W / 2 - 4), y: hy, z: D / 2 + 1 }, 0.2))
    g.add(swingDoor(parts, s * (W / 2 - 2.3), D / 2 - 0.4, s < 0 ? 'left' : 'right'))
  }
  g.add(rbox(12, 18, 0.5, brass, { y: 92, z: D / 2 + 1.1 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 3, 102, D / 2 + 1.6], [s * 3, 96, D / 2 + 1.8], 0.45, brass))
    g.add(ball(0.9, brass, { x: s * 3, y: 95.4, z: D / 2 + 1.8 }))
  }
  return g
}
const CN_WR_IN = r(-47.6, -25.6, 47.6, 27.2)
export const CN_WARDROBE_SURFACES: SurfaceDef[] = [
  { y: 10, h: 156, inside: true, shape: [CN_WR_IN] },
  { y: 177.6, h: 14.4, inside: true, shape: [CN_WR_IN] },
  pipeHook(-46, 46, 168, 0, 168 - 10 - 6),
]

/** 闷户橱式斗柜：两端翘头面板，三层铜面叶抽屉（上层两只），短腿 + 壸门牙板 */
export function cnDresser(p: string[]) {
  const [wood, brass, dark] = p
  const g = new THREE.Group()
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4.4, 12, 4.4, wood, { x: sx * 37.8, z: sz * 18.8 }, 0.8))
  g.add(prism([[-35.6, 12], [35.6, 12], [35.6, 9], [26, 7.8], [-26, 7.8], [-35.6, 9]], 1.2, dark, 20.4))
  g.add(hollow(80, 70, 42, wood, { y: 12 }, 1.6, inner))
  g.add(rbox(84, 3.4, 46, wood, { y: 82 }, 1))
  for (const s of [-1, 1]) g.add(prism([[s * 38, 85.4], [s * 42, 85.4], [s * 42.6, 88], [s * 40.6, 87.4], [s * 38, 85.8]], 42, wood))
  for (const [x0, x1, y, h] of CN_DRESSER_DRAWERS) {
    const cx = (x0 + x1) / 2
    g.add(drawerOf([rbox(x1 - x0 - 0.8, h - 0.6, 1.2, dark, { x: cx, y: y + 0.3, z: 21.4 }, 0.5), brassPlate(cx, y + h * 0.58, 22, h > 20 ? 3 : 2.4, brass)], x0, x1, y, h, 20.8, 36, inner))
  }
  return g
}
const CN_DRESSER_DRAWERS: [number, number, number, number][] = [[-38, 38, 14, 24], [-38, 38, 39, 24], [-38, -0.4, 64, 15.6], [0.4, 38, 64, 15.6]]
export const CN_DRESSER_SURFACES: SurfaceDef[] = CN_DRESSER_DRAWERS.map(([x0, x1, y, h]) => drawerLv(x0, x1, y, h, 20.8, 36))

/** 画案式书桌：侧脚方腿、牙头，面板下两只浅抽屉 */
export function cnDesk(p: string[]) {
  const [wood, brass, dark] = p
  const g = new THREE.Group()
  const W = 120
  const D = 60
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(batten([sx * 54, 72, sz * 25], [sx * 55.5, 0.06, sz * 26.2], 4.4, 4.4, wood))
  g.add(rbox(W, 4, D, wood, { y: 72 }, 1.2))
  g.add(rbox(W - 14, 1.2, D - 12, dark, { y: 63.4 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(1.6, 8.6, D - 12, dark, { x: s * 53, y: 63.4 }, 0.4))
    g.add(rbox(W - 14, 8.6, 1.6, dark, { y: 63.4, z: -(D / 2 - 4) }, 0.4))
    g.add(rbox(4, 8.6, 1.6, dark, { x: s * 50.5, y: 63.4, z: D / 2 - 4.8 }, 0.4))
    // 牙头
    g.add(prism([[s * 44, 63.4], [s * 52, 63.4], [s * 52, 58], [s * 49, 59.4], [s * 46, 62.4]], 1.4, dark, D / 2 - 4.8))
    g.add(rod3([s * 54.5, 14, -25.6], [s * 54.5, 14, 25.6], 1.1, dark))
  }
  g.add(rbox(10, 8.6, 1.6, dark, { y: 63.4, z: D / 2 - 4.8 }, 0.4))
  for (const [x0, x1] of CN_DESK_DRAWERS) {
    const cx = (x0 + x1) / 2
    g.add(drawerOf([rbox(x1 - x0 - 0.8, 7.4, 1.2, wood, { x: cx, y: 64, z: D / 2 - 3.4 }, 0.4), brassPlate(cx, 68.4, D / 2 - 2.8, 1.8, brass)], x0, x1, 64, 7.4, D / 2 - 4, 40, inner))
  }
  return g
}
const CN_DESK_DRAWERS: [number, number][] = [[-48.5, -5], [5, 48.5]]
export const CN_DESK_SURFACES: SurfaceDef[] = CN_DESK_DRAWERS.map(([x0, x1]) => drawerLv(x0, x1, 64, 7.4, 26, 40))

/** 南官帽椅（书椅）：搭脑、扶手都不出头，圆转进腿柱；S 形靠背板，坐垫 */
export function cnStudyChair(p: string[]) {
  const [wood, cushion, dark] = p
  const g = new THREE.Group()
  const X = 23
  const Z = 19.5
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * X, 0, -Z], [s * X, 48, -Z], [s * (X - 0.5), 102, -21.5]], 1.6, wood, { ...TUBE, caps: false }))
    g.add(cappedTube([[s * X, 0, Z], [s * X, 48, Z], [s * X, 64, Z - 0.5]], 1.6, wood, { ...TUBE, caps: false }))
    g.add(cappedTube([[s * (X - 0.5), 64.5, -20.5], [s * (X + 1.2), 65.5, -4], [s * (X + 0.8), 64.8, 12], [s * X, 64.2, Z - 0.5]], 1.4, wood, TUBE))
    g.add(rod3([s * (X + 0.3), 49.5, 3], [s * (X + 1), 65.2, 3], 0.8, wood))
    g.add(rod3([s * X, 16, -Z], [s * X, 16, Z], 1, dark))
  }
  g.add(cappedTube([[-(X - 0.5), 102, -21.5], [-12, 104.2, -23], [0, 104.8, -23.5], [12, 104.2, -23], [X - 0.5, 102, -21.5]], 1.8, wood, TUBE))
  const splat: P2[] = [[-Z + 0.5, 49], [-Z + 1.6, 62], [-Z + 2, 74], [-Z + 0.6, 88], [-Z - 1.6, 98], [-Z - 3.6, 104]]
  g.add(sidePrism(strip(splat, 1.6), 17, wood, 0))
  g.add(rbox(52, 4, 43, wood, { y: 46 }, 1))
  g.add(rbox(46, 4, 38, cushion, { y: 50, z: 1 }, 1.6))
  g.add(prism([[-22.5, 46], [22.5, 46], [22.5, 41], [16, 40], [10, 37.5], [-10, 37.5], [-16, 40], [-22.5, 41]], 1.6, dark, Z))
  g.add(rbox(47, 2.2, 3.4, dark, { y: 8, z: Z }, 0.6))
  g.add(rod3([-X, 21, -Z], [X, 21, -Z], 1, dark))
  return lowerSeat(g, 46, 2)
}

/** 亮格柜：上部三层敞开的亮格（格口挂券口牙子），下部对开门柜，铜面叶 */
const LG = { w: 84, d: 36, cab: 84, open: [118, 150], top: 182 }
export function cnBookcase(p: string[]) {
  const [wood, brass, dark] = p
  const { w, d, cab, open, top } = LG
  const g = new THREE.Group()
  const inner = shade(wood, 0.05)
  const iw = w - 5 + 0.4
  g.add(prism([[-w / 2, 6], [w / 2, 6], [w / 2, 0], [w / 2 - 5, 0], [w / 2 - 9, 3], [-(w / 2 - 9), 3], [-(w / 2 - 5), 0], [-w / 2, 0]], d - 1, dark))
  for (const s of [-1, 1]) g.add(rbox(2.5, top - 6, d, wood, { x: s * (w / 2 - 1.25), y: 6 }, 0.6))
  g.add(rbox(iw, top - 6, 1.2, inner, { y: 6, z: -d / 2 + 0.8 }, 0.3))
  g.add(rbox(iw, 2, d - 1.6, wood, { y: 6, z: 0.8 }, 0.4))
  g.add(rbox(iw, 1.6, d - 3, inner, { y: 45, z: 0.4 }, 0.3))
  for (const y of [cab, ...open]) g.add(rbox(iw, 2, d - 1.6, wood, { y, z: 0.8 }, 0.4))
  g.add(rbox(w + 2, 3, d + 2, wood, { y: top }, 1))
  // 亮格口的券口牙子
  for (const y of [...open, top]) g.add(holePanel(w - 5, 5, 1.2, dark, lattice(w - 5, 5, 7, 1, 1.4, 1), { y: y - 5, z: d / 2 - 0.8 }))
  for (const s of [-1, 1]) {
    const parts: THREE.Object3D[] = [
      rbox(w / 2 - 3.1, cab - 8.6, 1.6, wood, { x: s * (w / 4 - 0.65), y: 8.3, z: d / 2 + 0.4 }, 0.6),
      rbox(w / 2 - 10, cab - 18, 0.6, shade(wood, -0.06), { x: s * (w / 4 - 0.65), y: 13, z: d / 2 + 1.4 }, 0.3),
    ]
    if (s > 0) parts.push(brassPlate(0, 50, d / 2 + 1.2, 4, brass))
    g.add(swingDoor(parts, s * (w / 2 - 2.6), d / 2 - 0.4, s < 0 ? 'left' : 'right'))
  }
  return g
}
const LG_IN = r(-39.4, -16.4, 39.4, 16.8)
export const CN_BOOKCASE_SURFACES: SurfaceDef[] = [
  { y: 8, h: 37, inside: true, shape: [LG_IN] },
  { y: 46.6, h: 37.4, inside: true, shape: [LG_IN] },
  ...[LG.cab, ...LG.open].map((y, i, ys) => ({ y: y + 2, h: (i + 1 < ys.length ? ys[i + 1] : LG.top) - 5 - (y + 2), shape: [r(-39.4, -16.4, 39.4, 16.6)] })),
]

/** 新中式台灯：方木座、车旋立柱，方形宫灯式绢罩 + 四角立柱 + 宝顶 */
export function cnTableLamp(p: string[]) {
  const [wood, silk, accent] = p
  const g = new THREE.Group()
  g.add(rbox(16, 3, 16, wood, {}, 0.8))
  g.add(rbox(11, 2, 11, shade(wood, -0.08), { y: 3 }, 0.5))
  g.add(latheAt([[0, 5], [2.4, 5], [1.6, 8], [1.3, 29], [2.2, 30.6], [0, 30.6]], wood, {}, 12, 0.001))
  const y0 = 30
  const H = 22
  const S = 12.5
  g.add(lit(rbox(2 * S - 1.4, H, 2 * S - 1.4, silk, { y: y0 }, 0.4), silk, 0.55))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.4, H + 2.4, 1.4, wood, { x: sx * S, y: y0 - 1.2, z: sz * S }, 0.3))
  for (const y of [y0 - 1, y0 + H - 0.4])
    for (const s of [-1, 1]) {
      g.add(rbox(2 * S + 1.4, 1.4, 1.4, wood, { y, z: s * S }, 0.3))
      g.add(rbox(1.4, 1.4, 2 * S - 1.4, wood, { x: s * S, y }, 0.3))
    }
  g.add(cyl(4, 11, 3.4, wood, { y: y0 + H + 1, ry: Math.PI / 4 }, 4))
  g.add(ball(1.8, accent, { y: y0 + H + 5.6 }))
  return g
}
