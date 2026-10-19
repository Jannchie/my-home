// 欧式古典补充款：切斯特菲尔德沙发、翼背椅、电视柜、长餐桌、安妮女王餐椅、雪橇床、五斗柜、书桌椅、落地座钟、玄关桌配镜、
// 枝形吊灯式落地灯、玻璃陈列柜。欧式人家一键布置时整套换成古典造型。
// 只放建模函数和它们用到的常量，素材表在 ../styles-world.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, cyl, markMirror, rbox, shade, toon, torus } from '../../toon'
import { C, paintPanel, rectPoly, type SurfaceDef } from '../../kit'
import { batten, cappedTube, cylX, cylZ, glassPane, latheAt, lit, noOutlineDeep, rod3, type V3 } from '../../geo'
import { drawerLv, drawerOf, hollow, swingDoor } from '../../cabinetKit'
import { TUBE, cabriole, carving, prism, sidePrism, strip, type P2 } from './common'

const r = rectPoly

/** 圆包脚（车旋矮脚） */
function bunFoot(x: number, z: number, h: number, color: string) {
  return latheAt([[0, 0], [h * 0.42, 0], [h * 0.52, h * 0.35], [h * 0.45, h * 0.7], [h * 0.32, h], [0, h]], color, { x, z }, 16, 0.001)
}

/** 切斯特菲尔德沙发（双人 / 三人）：扶手与靠背等高的卷边、满布拉扣、铜钉滚边、圆包脚，一整条长坐垫 */
export function clChesterfield(W: number) {
  return (p: string[]) => {
    const [fabric, wood, gold] = p
    const g = new THREE.Group()
    const D = 90
    const tuft = shade(fabric, -0.22)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bunFoot(sx * (W / 2 - 9), sz * (D / 2 - 8), 8, wood))
    g.add(rbox(W, 30, D, fabric, { y: 8 }, 4))
    // 靠背 + 顶卷
    g.add(rbox(W - 4, 30, 18, fabric, { y: 38, z: -D / 2 + 9 }, 5))
    g.add(cylX(8, W - 2, fabric, 0, 68, -D / 2 + 9, 20))
    // 扶手 + 卷边，正面一圈打褶的圆盘
    for (const s of [-1, 1]) {
      g.add(rbox(18, 30, D, fabric, { x: s * (W / 2 - 9), y: 38 }, 5))
      g.add(cylZ(9, D + 1, fabric, s * (W / 2 - 9), 68, 0, 20))
      g.add(noOutlineDeep(cylZ(7.6, 0.6, tuft, s * (W / 2 - 9), 68, D / 2 + 0.8, 20)))
    }
    // 拉扣：靠背正面菱形排布 + 扶手内侧
    const zb = -D / 2 + 18.2
    const nx = Math.round((W - 40) / 12)
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2) continue
        g.add(ball(0.9, tuft, { x: -(W - 40) / 2 + (i * (W - 40)) / nx, y: 50 + j * 7, z: zb }))
      }
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) if (!((k + j) % 2)) g.add(ball(0.9, tuft, { x: s * (W / 2 - 18.2), y: 52 + j * 7, z: -26 + k * 14 }))
    // 长坐垫
    g.add(rbox(W - 36, 10, D - 22, fabric, { y: 38, z: 9 }, 3.5))
    // 铜钉滚边（正面）
    for (let x = -W / 2 + 4; x <= W / 2 - 4; x += 5) g.add(ball(0.7, gold, { x, y: 12, z: D / 2 + 0.1 }))
    return g
  }
}

/** 翼背扶手椅：高靠背两侧伸出护翼，卷边扶手，前腿卷曲、后腿外撇，坐垫 */
export function clWingback(p: string[]) {
  const [fabric, wood, gold] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(cabriole(s * 31, 30, 18, 2, wood, s * 0.4, 0.6, 'pad'))
    g.add(batten([s * 30, 18, -30], [s * 33, 0.3, -35], 3.4, 3.4, wood))
  }
  g.add(rbox(74, 18, 72, fabric, { y: 17, z: -1 }, 4))
  g.add(rbox(58, 10, 58, fabric, { y: 35, z: 7 }, 4))
  g.add(rbox(60, 66, 13, fabric, { y: 35, z: -31, rx: -0.07 }, 5))
  g.add(cylX(7, 60, fabric, 0, 100, -34.5, 20))
  // 护翼 + 扶手（侧面轮廓）
  const wing: P2[] = [[-37, 35], [-37, 98], [-35, 106], [-27, 108], [-16, 104], [-8, 94], [-4, 80], [2, 66], [12, 60], [18, 56], [18, 35]]
  for (const s of [-1, 1]) {
    g.add(sidePrism(wing, 9, fabric, s * 32.5))
    g.add(cylZ(5.6, 22, fabric, s * 33, 55.6, 8, 16))
    g.add(noOutlineDeep(cylZ(4.6, 0.5, shade(fabric, -0.2), s * 33, 55.6, 19.2, 16)))
  }
  // 裙边铜钉
  for (let x = -34; x <= 34; x += 4) g.add(ball(0.6, gold, { x, y: 19, z: 35.1 }))
  return g
}

/** 欧式电视柜：卷曲短腿、波浪裙脚，两侧镶板门（椭圆线脚）+ 中间两只抽屉，石材台面 */
export function clTvStand(p: string[]) {
  const [body, top, gold] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 74, sz * 18.5, 14, 2, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(hollow(156, 44, 42, body, { y: 13 }, 1.6, inner))
  for (const s of [-1, 1]) {
    g.add(rbox(1.6, 40.8, 40, body, { x: s * 27.5, y: 14.6, z: 0.4 }, 0.3))
    g.add(rbox(3, 40.8, 1.6, body, { x: s * 76.5, y: 14.6, z: 21.2 }, 0.4))
  }
  g.add(prism([[-76, 14], [76, 14], [76, 11], [60, 9], [44, 12], [20, 9], [0, 11.5], [-20, 9], [-44, 12], [-60, 9], [-76, 11]], 1.4, body, 22))
  g.add(rbox(160, 3.5, 46, top, { y: 57 }, 1.2))
  for (const x of [-52, 52]) {
    const s = Math.sign(x)
    const parts: THREE.Object3D[] = [
      rbox(46, 38, 1.2, body, { x, y: 16, z: 21.6 }, 0.6),
      rbox(38, 30, 0.6, shade(body, -0.05), { x, y: 20, z: 22.3 }, 0.4),
      noOutlineDeep(torus(8, 0.5, gold, { x, y: 35, z: 22.8 })),
      ball(1.3, gold, { x: x - s * 19, y: 35, z: 22.9 }),
    ]
    g.add(swingDoor(parts, x + s * 23, 21, s < 0 ? 'left' : 'right'))
  }
  for (const y of CL_TV_ROWS) g.add(drawerOf([rbox(52, 19, 1.2, body, { y, z: 21.6 }, 0.6), rbox(10, 2.4, 1.2, gold, { y: y + 8.3, z: 22.8 }, 0.6)], -26, 26, y, 19, 21, 36, inner))
  g.add(carving(0, 12.4, 22.8, 4, gold))
  return g
}
const CL_TV_ROWS = [15.4, 35.4]
export const CL_TV_SURFACES: SurfaceDef[] = [
  ...[-1, 1].map((s): SurfaceDef => ({ y: 14.6, h: 40.8, inside: true, shape: [s < 0 ? r(-76, -19.6, -29.2, 20.4) : r(29.2, -19.6, 76, 20.4)] })),
  ...CL_TV_ROWS.map((y) => drawerLv(-26, 26, y, 19, 21, 36)),
]

/** 欧式长餐桌：卷曲腿卷叶脚、雕花裙板描金线，厚木台面 */
export function clDining(W: number, D: number) {
  return (p: string[]) => {
    const [wood, top, gold] = p
    const g = new THREE.Group()
    const lx = W / 2 - 7
    const lz = D / 2 - 7
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * lx, sz * lz, 64, 2.8, wood, sx * 0.5, sz * 0.5, 'scroll', gold))
    for (const s of [-1, 1]) {
      g.add(prism([[-lx, 72], [lx, 72], [lx, 64], [lx * 0.6, 62], [lx * 0.25, 64.5], [0, 61.5], [-lx * 0.25, 64.5], [-lx * 0.6, 62], [-lx, 64]], 2, wood, s * lz))
      g.add(sidePrism([[-lz, 72], [lz, 72], [lz, 64], [0, 62], [-lz, 64]], 2, wood, s * lx))
      g.add(carving(0, 66, s * (lz + 1.2), 5, gold))
      g.add(noOutlineDeep(rbox(2 * lx, 0.8, 0.4, gold, { y: 70.4, z: s * (lz + 1.1) }, 0.1)))
    }
    g.add(rbox(W - 4, 1.6, D - 4, shade(top, -0.06), { y: 72 }, 0.6))
    g.add(rbox(W, 4, D, top, { y: 73.6 }, 1.4))
    return g
  }
}

/** 安妮女王餐椅：前腿卷曲、后腿上延，牛轭形搭脑 + 花瓶形背板，软包座 */
export function clQueenAnne(p: string[]) {
  const [fabric, wood, gold] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(cabriole(s * 19, 18, 42, 1.8, wood, s * 0.4, 0.6, 'pad'))
    g.add(cappedTube([[s * 18, 0, -21], [s * 18.5, 44, -19.5], [s * 17.5, 99, -23]], 1.6, wood, { ...TUBE, caps: false }))
  }
  g.add(rbox(44, 5, 42, wood, { y: 40 }, 1.4))
  g.add(carving(0, 41.6, 21.3, 3.4, gold))
  g.add(rbox(41, 6, 39, fabric, { y: 44.5, z: 0.8 }, 2.6))
  g.add(cappedTube([[-19.6, 99.4, -22.6], [-13, 102.6, -23.4], [0, 101, -24], [13, 102.6, -23.4], [19.6, 99.4, -22.6]], 1.8, wood, TUBE))
  const vase: P2[] = [[-6, 50.5], [6, 50.5], [9, 58], [7, 67], [4, 75], [5, 85], [9, 94], [10, 100.4], [-10, 100.4], [-9, 94], [-5, 85], [-4, 75], [-7, 67], [-9, 58]]
  const sp = prism(vase, 1.4, wood, 0)
  sp.position.z = -21.6
  sp.rotation.x = -0.05
  g.add(sp)
  g.add(rbox(17, 3, 4, wood, { y: 48.5, z: -20 }, 0.8))
  return g
}

/** 雪橇床（床垫宽 m）：后仰外卷的弧形床头、前卷的矮床尾，侧板连成一体，描金雕花 */
export function clSleighBed(m: number) {
  return (p: string[]) => {
    const [duvet, sheet, wood] = p
    const gold = '#c9a54f'
    const g = new THREE.Group()
    const W = m + 12
    const D = 222
    const zh = -D / 2 + 9
    const zf = D / 2 - 9
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bunFoot(sx * (W / 2 - 6), sz * (D / 2 - 10), 7, shade(wood, -0.08)))
    for (const s of [-1, 1]) g.add(rbox(5, 24, D - 18, wood, { x: s * (W / 2 - 2.5), y: 7 }, 1.4))
    g.add(rbox(W - 10, 3, D - 20, shade(wood, -0.12), { y: 27 }, 0.8))
    // 床头：弧形板向后仰，顶上外卷
    const head: P2[] = [[zh, 7], [zh - 1, 40], [zh - 2.6, 72], [zh - 5, 96], [zh - 6.4, 108]]
    g.add(sidePrism(strip(head, 4.6), W, wood, 0))
    g.add(cylX(5.4, W + 3, wood, 0, 110.6, zh - 4.4, 20))
    g.add(carving(0, 92, zh + 0.4, 8, gold))
    // 床尾：弧形板向前，顶上前卷
    const foot: P2[] = [[zf, 7], [zf + 0.6, 30], [zf + 2.2, 46], [zf + 4.6, 56]]
    g.add(sidePrism(strip(foot, 4.6), W, wood, 0))
    g.add(cylX(5, W + 3, wood, 0, 58, zf + 3.6, 20))
    g.add(carving(0, 46, zf + 4.6, 6, gold))
    // 床品
    g.add(rbox(W - 14, 22, D - 34, sheet, { y: 30, z: 0 }, 5))
    const pn = m >= 120 ? 2 : 1
    for (let i = 0; i < pn; i++) g.add(rbox(pn > 1 ? m * 0.42 : m * 0.6, 12, 32, C.white, { x: pn > 1 ? (i ? 1 : -1) * m * 0.24 : 0, y: 51, z: zh + 26, rx: -0.14 }, 5))
    g.add(rbox(W - 10, 8, D - 96, duvet, { y: 51, z: 20 }, 4))
    g.add(rbox(W - 9.6, 3, 15, duvet, { y: 57.5, z: 20 - (D - 96) / 2 + 7.5 }, 1.5))
    return g
  }
}
/** 床面（被子顶）高度 */
export const CL_SLEIGH_TOP = 59

/** 法式五斗柜：卷曲短腿、波浪裙脚，三层抽屉配描金吊环拉手，石材台面 */
export function clDresser(p: string[]) {
  const [body, top, gold] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 41, sz * 19, 14, 2, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(hollow(88, 70, 44, body, { y: 13 }, 1.6, inner))
  g.add(prism([[-43, 14], [43, 14], [43, 11], [30, 9], [12, 12], [0, 9.5], [-12, 12], [-30, 9], [-43, 11]], 1.4, body, 22))
  for (const y of CL_DR_ROWS) {
    const parts: THREE.Object3D[] = [rbox(84, 20.4, 1.2, body, { y, z: 22.6 }, 0.6), rbox(76, 15.4, 0.5, shade(body, -0.05), { y: y + 2.5, z: 23.3 }, 0.3)]
    for (const x of [-22, 22]) {
      parts.push(noOutlineDeep(rbox(5, 2.4, 0.6, gold, { x, y: y + 12.6, z: 23.6 }, 0.2)))
      parts.push(torus(2.2, 0.45, gold, { x, y: y + 12.6, z: 23.9, rz: Math.PI }, Math.PI))
    }
    g.add(drawerOf(parts, -42, 42, y, 20.4, 22, 38, inner))
  }
  g.add(carving(0, 12.4, 22.8, 4, gold))
  g.add(rbox(92, 3.4, 48, top, { y: 83 }, 1.2))
  return g
}
const CL_DR_ROWS = [15.2, 37.6, 60]
export const CL_DRESSER_SURFACES: SurfaceDef[] = CL_DR_ROWS.map((y) => drawerLv(-42, 42, y, 20.4, 22, 38))

/** 法式书桌（bureau plat）：卷曲腿卷叶脚、裙板里三只抽屉描金拉手，台面嵌皮革 */
export function clDesk(p: string[]) {
  const [wood, leather, gold] = p
  const g = new THREE.Group()
  const W = 125
  const D = 65
  const inner = shade(wood, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 56, sz * 26, 64, 2.4, wood, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(rbox(W - 10, 1.2, D - 10, inner, { y: 62.8 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(1.6, 10.2, D - 10, wood, { x: s * 56.6, y: 62.8 }, 0.4))
    g.add(rbox(W - 10, 10.2, 1.6, wood, { y: 62.8, z: -(D / 2 - 5.8) }, 0.4))
  }
  for (const [a, b] of [[-57.4, -42], [-21.6, -20.4], [20.4, 21.6], [42, 57.4]]) g.add(rbox(b - a, 10.2, 1.6, wood, { x: (a + b) / 2, y: 62.8, z: D / 2 - 5.8 }, 0.4))
  for (const [x0, x1] of CL_DESK_DRAWERS) {
    const cx = (x0 + x1) / 2
    g.add(drawerOf([rbox(x1 - x0 - 0.8, 8.6, 1.2, wood, { x: cx, y: 63.6, z: D / 2 - 4.4 }, 0.5), rbox(6, 1.6, 1.2, gold, { x: cx, y: 67.4, z: D / 2 - 3.4 }, 0.5)], x0, x1, 63.6, 8.6, D / 2 - 5, 42, inner))
  }
  for (const s of [-1, 1]) g.add(carving(s * 52, 66, D / 2 - 4.6, 3.4, gold))
  g.add(rbox(W, 3.6, D, wood, { y: 73 }, 1.2))
  g.add(noOutlineDeep(rbox(W - 18, 0.4, D - 16, leather, { y: 76.6 }, 0.1)))
  g.add(noOutlineDeep(rbox(W - 16, 0.3, D - 14, gold, { y: 76.55 }, 0.1)))
  return g
}
const CL_DESK_DRAWERS: [number, number][] = [[-42, -21.6], [-20.4, 20.4], [21.6, 42]]
export const CL_DESK_SURFACES: SurfaceDef[] = CL_DESK_DRAWERS.map(([x0, x1]) => drawerLv(x0, x1, 63.6, 8.6, 27.5, 42))

/** 法式书椅：卷曲腿、软包座，弧形桶背 + 描金扶手 */
export function clDeskChair(p: string[]) {
  const [fabric, frame, gold] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 22, sz * 20, 40, 1.8, frame, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(rbox(52, 6, 48, frame, { y: 37 }, 2.2))
  g.add(carving(0, 40, 24.4, 4, gold))
  g.add(rbox(48, 8, 44, fabric, { y: 42, z: 1 }, 3.5))
  // 桶背：中间一块 + 两侧斜板，顶上一道弧形木框连到扶手
  g.add(rbox(32, 34, 6, fabric, { y: 47, z: -20.5, rx: -0.08 }, 2.6))
  for (const s of [-1, 1]) g.add(rbox(6, 30, 20, fabric, { x: s * 21.5, y: 47, z: -12, ry: s * 0.55 }, 2.6))
  const rail: V3[] = [[-25, 64, 14], [-25.6, 66, 0], [-23.6, 72, -12], [-15, 80, -22], [0, 82.4, -25], [15, 80, -22], [23.6, 72, -12], [25.6, 66, 0], [25, 64, 14]]
  g.add(cappedTube(rail, 1.6, frame, TUBE))
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * 25, 64, 14], [s * 25.4, 57, 19], [s * 23.6, 47, 20]], 1.6, frame, { ...TUBE, caps: false }))
    g.add(rbox(5, 2, 16, fabric, { x: s * 25.4, y: 65.2, z: 3 }, 0.9))
  }
  return g
}

/** 表盘：米白圆盘、刻度、罗马数字位的小块、两根指针 */
function paintClockFace(ground: string, ink: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const c = W / 2
    const R = Math.min(W, H) / 2
    g.fillStyle = shade(ink, 0.25)
    g.fillRect(0, 0, W, H)
    g.fillStyle = ground
    g.beginPath()
    g.arc(c, H / 2, R * 0.96, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = ink
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      g.save()
      g.translate(c + Math.sin(a) * R * 0.76, H / 2 - Math.cos(a) * R * 0.76)
      g.rotate(a)
      g.fillRect(-R * 0.03, -R * 0.08, R * 0.06, R * 0.16)
      g.restore()
    }
    g.strokeStyle = ink
    g.lineCap = 'round'
    g.lineWidth = R * 0.06
    g.beginPath()
    g.moveTo(c, H / 2)
    g.lineTo(c + R * 0.32, H / 2 - R * 0.3)
    g.stroke()
    g.lineWidth = R * 0.035
    g.beginPath()
    g.moveTo(c, H / 2)
    g.lineTo(c - R * 0.12, H / 2 - R * 0.6)
    g.stroke()
  }
}

/** 落地座钟：方底座、长腰身（玻璃门里一只黄铜钟摆）、钟头带圆表盘、断山花顶 + 三颗尖顶 */
export function clGrandfatherClock(p: string[]) {
  const [wood, face, gold] = p
  const g = new THREE.Group()
  const dark = shade(wood, -0.08)
  g.add(rbox(50, 6, 30, dark, {}, 1))
  g.add(rbox(46, 36, 27, wood, { y: 6 }, 1))
  g.add(rbox(36, 26, 0.6, dark, { y: 11, z: 13.8 }, 0.3))
  g.add(rbox(48, 4, 29, dark, { y: 42 }, 1))
  // 腰身 + 钟摆窗
  g.add(rbox(38, 98, 23, wood, { y: 46 }, 1))
  g.add(rbox(28, 84, 1, dark, { y: 53, z: 11.6 }, 0.4))
  g.add(glassPane(22, 70, 0.4, { y: 60, z: 12.2 }))
  g.add(rod3([0, 124, 11.4], [0, 82, 11.4], 0.35, gold, 6))
  g.add(cylZ(5, 0.8, gold, 0, 80, 11.4, 20))
  for (const x of [-4, 4]) g.add(rod3([x, 124, 10.6], [x, 70, 10.6], 0.3, gold, 6))
  for (const x of [-4, 4]) g.add(cyl(1.6, 1.6, 9, gold, { x, y: 62, z: 10.6 }, 12))
  // 钟头
  g.add(rbox(48, 4, 29, dark, { y: 144 }, 1))
  g.add(rbox(46, 44, 27, wood, { y: 148 }, 1))
  for (const s of [-1, 1]) g.add(cyl(1.8, 1.8, 40, gold, { x: s * 20.5, y: 150, z: 13.4 }, 12))
  g.add(noOutlineDeep(torus(15.6, 1, gold, { y: 170, z: 13.6 })))
  g.add(paintPanel(29, 29, `sw-clock-${face}`, paintClockFace(face, '#2a2626'), { y: 155.5, z: 13.7 }))
  // 断山花 + 尖顶
  g.add(rbox(50, 4, 30, dark, { y: 192 }, 1))
  for (const s of [-1, 1]) g.add(prism([[s * 4, 196], [s * 25, 196], [s * 25, 199], [s * 6, 208], [s * 4, 206]], 26, wood))
  for (const x of [-21, 0, 21]) g.add(latheAt([[0, 0], [2.4, 0], [1.4, 2], [2, 4], [0.3, 8.4], [0, 8.4]], gold, { x, y: x ? 199 : 197, z: 8 }, 12, 0.001))
  return g
}

/** 玄关桌配镜：卷曲腿、弧形裙板的窄桌，石材台面，背后立一面拱顶描金框的镜子 */
export function clConsoleMirror(p: string[]) {
  const [body, top, gold] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 49, sz * 13, 70, 2, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  for (const s of [-1, 1]) {
    g.add(prism([[-49, 78], [49, 78], [49, 70], [24, 67], [0, 69.5], [-24, 67], [-49, 70]], 1.6, body, s * 13))
    g.add(sidePrism([[-13, 78], [13, 78], [13, 70], [0, 68.5], [-13, 70]], 1.6, body, s * 49))
  }
  g.add(carving(0, 72, 14.2, 4.4, gold))
  g.add(rbox(110, 3, 36, top, { y: 78 }, 1.2))
  // 镜子
  const arch: P2[] = [[-38, 0], [38, 0], [38, 66], [30, 80], [14, 90], [0, 95], [-14, 90], [-30, 80], [-38, 66]]
  const mg = new THREE.Group()
  mg.add(prism(arch, 3.4, gold))
  const glass = prism(arch.map(([x, y]) => [x * 0.86, 5 + y * 0.86] as P2), 0.6, '#dfe8ee', 1.9)
  glass.material = toon('#dfe8ee', { emissive: 0.15 })
  mg.add(markMirror(glass))
  mg.add(carving(0, 92, 2.2, 7, gold))
  mg.position.set(0, 81, -15.6)
  g.add(mg)
  g.add(rbox(80, 3, 5, gold, { y: 81, z: -15.4 }, 0.8))
  return g
}

/** 枝形吊灯式落地灯：卷叶三脚底座、车旋立柱，弯臂挑出一盏五臂水晶小吊灯 */
export function clChandelierLamp(p: string[]) {
  const [metal, shadeC, crystal] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6
    const pt = (rr: number, y: number): V3 => [Math.sin(a) * rr, y, Math.cos(a) * rr]
    g.add(cappedTube([pt(2, 16), pt(10, 8), pt(16, 2.4), pt(19, 1.3)], 1.3, metal, TUBE))
  }
  g.add(latheAt([[0, 6], [3.2, 6], [2.2, 12], [3.4, 18], [1.4, 24], [1.3, 168], [2.4, 170], [0, 170]], metal, {}, 16, 0.001))
  // 弯臂
  g.add(cappedTube([[0, 168, 0], [0, 178, 4], [0, 182, 12], [0, 178, 20], [0, 172, 24]], 1.1, metal, TUBE))
  g.add(cyl(0.3, 0.3, 8, metal, { y: 164, z: 24 }, 6))
  // 小吊灯：中心车旋柱 + 五臂烛台 + 水晶坠
  const y = 150
  g.add(latheAt([[0, 0], [1.6, 0], [3, 3], [2, 7], [3.4, 11], [1, 15], [0, 15]], metal, { y, z: 24 }, 12, 0.001))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const pt = (rr: number, yy: number): V3 => [Math.sin(a) * rr, yy, 24 + Math.cos(a) * rr]
    g.add(cappedTube([pt(1.5, y + 4), pt(6.5, y + 2), pt(9.6, y + 5), pt(10, y + 8)], 0.6, metal, { ...TUBE, caps: false }))
    const [cx, , cz] = pt(10, 0)
    g.add(cyl(1.6, 1.1, 1.2, metal, { x: cx, y: y + 8, z: cz }, 10))
    g.add(cyl(0.8, 0.8, 4, C.cream, { x: cx, y: y + 9.2, z: cz }, 8))
    g.add(lit(ball(1, C.lamp, { x: cx, y: y + 14, z: cz }, [1, 1.5, 1]), C.lamp, 0.9))
    g.add(cyl(2.4, 3.6, 4.4, shadeC, { x: cx, y: y + 11.6, z: cz }, 12))
    const [dx, , dz] = pt(6.5, 0)
    const drop = ball(0.9, crystal, { x: dx, y: y - 0.6, z: dz }, [1, 1.6, 1])
    drop.material = toon(crystal, { transparent: 0.75 })
    g.add(drop)
  }
  return g
}

/** 欧式玻璃陈列柜：卷曲短腿、拱顶玻璃对开门、玻璃层板，山花顶冠描金 */
const VT = { w: 90, d: 40, base: 16, top: 180, levels: [16, 58, 98, 138] }
export function clVitrine(p: string[]) {
  const [body, back, gold] = p
  const { w, d, base, top, levels } = VT
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cabriole(sx * 41, sz * 16, base, 2, body, sx * 0.5, sz * 0.5, 'scroll', gold))
  g.add(prism([[-44, base + 1], [44, base + 1], [44, base - 2], [24, base - 4], [0, base - 1.5], [-24, base - 4], [-44, base - 2]], 1.4, body, d / 2 - 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox(3, top - base, d, body, { x: s * (w / 2 - 1.5), y: base }, 0.6))
    g.add(glassPane(0.4, top - base - 8, d - 6, { x: s * (w / 2 - 3.2), y: base + 4, z: 0 }))
  }
  g.add(rbox(w - 6 + 0.4, top - base, 1.2, back, { y: base, z: -d / 2 + 0.8 }, 0.3))
  g.add(rbox(w - 6 + 0.4, 3, d - 1.6, body, { y: base, z: 0.8 }, 0.5))
  for (const y of levels.slice(1)) g.add(glassPane(w - 6.4, 0.8, d - 4, { y, z: 0.6 }))
  g.add(rbox(w + 2, 4, d + 2, body, { y: top }, 1))
  g.add(rbox(w + 4, 2.4, d + 4, gold, { y: top + 4 }, 0.8))
  g.add(prism([[-(w / 2 + 1), top + 6.4], [w / 2 + 1, top + 6.4], [w / 2 - 4, top + 9], [12, top + 14], [0, top + 16], [-12, top + 14], [-(w / 2 - 4), top + 9]], d - 6, body, -1))
  g.add(carving(0, top + 9.4, d / 2 - 3.6, 5, gold))
  // 玻璃门（铰链在外侧），拱顶门框
  for (const s of [-1, 1]) {
    const x = s * (w / 4 - 0.75)
    const dw = w / 2 - 3.6
    const dg = new THREE.Group()
    const dh = top - base - 4
    for (const t of [-1, 1]) dg.add(rbox(3.4, dh, 1.8, body, { x: t * (dw / 2 - 1.7) }, 0.5))
    dg.add(rbox(dw, 3.4, 1.8, body, {}, 0.5))
    dg.add(prism([[-dw / 2, dh - 12], [dw / 2, dh - 12], [dw / 2, dh], [-dw / 2, dh], [-dw / 2, dh - 12], [-dw / 2 + 3.4, dh - 12], [-dw / 2 + 3.4, dh - 4], [-dw / 4, dh - 1.6], [dw / 4, dh - 1.6], [dw / 2 - 3.4, dh - 4], [dw / 2 - 3.4, dh - 12]], 1.8, body))
    dg.add(glassPane(dw - 6.8, dh - 13.4, 0.4, { y: 3.4, z: 0 }))
    dg.add(ball(1.2, gold, { x: -s * (dw / 2 - 4), y: dh * 0.48, z: 1.4 }))
    dg.position.set(x, base + 2, d / 2 + 0.9)
    g.add(swingDoor([dg], s * (w / 2 - 0.2), d / 2, s < 0 ? 'left' : 'right'))
  }
  return g
}
const VT_IN = r(-41.4, -18.4, 41.4, 19.4)
export const CL_VITRINE_SURFACES: SurfaceDef[] = VT.levels.map((y, i) => ({ y: y + (i ? 0.8 : 3), h: (i + 1 < VT.levels.length ? VT.levels[i + 1] : VT.top) - y - (i ? 0.8 : 3) - 1, inside: true, glass: true, shape: [VT_IN] }))
