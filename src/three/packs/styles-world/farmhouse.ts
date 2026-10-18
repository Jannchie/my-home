// 美式乡村补充款：布套沙发、X 撑茶几、谷仓门电视柜、X 腿搁架餐桌、温莎餐椅 / 书椅、木板床、谷仓门衣柜、五斗柜、
// 车旋腿书桌、陶罐台灯、三脚木落地灯。乡村风人家一键布置时整套换成农舍造型。
// 只放建模函数和它们用到的常量，素材表在 ../styles-world.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, cup, cyl, rbox, shade, torus } from '../../toon'
import { C, hangingPipe, paintPanel, pipeHook, rectPoly, type SurfaceDef } from '../../kit'
import { batten, cappedTube, cylZ, latheAt, lit, noOutlineDeep, rod3, taperRod3, type V3 } from '../../geo'
import { drawerLv, drawerOf, hollow, slideDoor, swingDoor } from '../../cabinetKit'
import { TUBE, paintPatchwork, turnedLeg } from './common'

const r = rectPoly

/** 布套沙发（双人 / 三人）：布套垂到地面的裙边、卷边扶手、松软的靠垫和坐垫，两只抱枕 + 搭在扶手上的毯子 */
export function fhSlipcover(W: number) {
  return (p: string[]) => {
    const [fabric, pillow, throwC] = p
    const g = new THREE.Group()
    const D = 94
    const seam = shade(fabric, -0.12)
    g.add(rbox(W, 40.4, D, fabric, {}, 3))
    g.add(noOutlineDeep(rbox(W + 0.2, 0.6, D + 0.2, seam, { y: 12 }, 0.2)))
    for (const s of [-1, 1]) {
      g.add(rbox(20, 30, D, fabric, { x: s * (W / 2 - 10), y: 38 }, 6))
      g.add(cylZ(10, D + 1, fabric, s * (W / 2 - 10), 66, 0, 20))
    }
    g.add(rbox(W - 4, 36, 22, fabric, { y: 40, z: -D / 2 + 11 }, 6))
    const n = W > 190 ? 3 : 2
    const inner = W - 40
    const cw = inner / n
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + cw * (i + 0.5)
      g.add(rbox(cw - 1, 14, D - 28, fabric, { x, y: 40, z: 11 }, 5))
      g.add(rbox(cw - 2, 34, 16, fabric, { x, y: 50, z: -D / 2 + 26, rx: -0.12 }, 7))
    }
    for (const s of [-1, 1]) g.add(rbox(38, 34, 11, pillow, { x: s * (W / 2 - 42), y: 53, z: -D / 2 + 37, rx: -0.3, rz: s * 0.14 }, 5))
    // 毯子搭在左扶手上，一边垂下
    g.add(rbox(28, 1.6, 46, throwC, { x: -(W / 2 - 10), y: 75.6, z: 6 }, 0.6))
    g.add(rbox(1.6, 30, 46, throwC, { x: -(W / 2 + 0.8), y: 47, z: 6 }, 0.6))
    for (let k = -5; k <= 5; k++) g.add(noOutlineDeep(rbox(1.8, 4, 0.5, shade(throwC, -0.15), { x: -(W / 2 + 0.8), y: 47, z: 6 + k * 4 }, 0.2)))
    return g
  }
}

/** 农舍茶几：三块厚木板拼的面、两端 X 形撑、板条下层 */
export function fhCoffee(p: string[]) {
  const [top, base] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 42, 5, base, { x: sx * 45, z: sz * 28 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(batten([s * 45, 9, -26], [s * 45, 37, 26], 4, 3, base))
    g.add(batten([s * 45, 9, 26], [s * 45, 37, -26], 4, 3, base))
    g.add(rbox(85, 5, 2.4, base, { y: 36.4, z: s * 28 }, 0.6))
    g.add(rbox(85, 2.4, 2.4, base, { y: 7.6, z: s * 28 }, 0.5))
  }
  for (let i = 0; i < 5; i++) g.add(rbox(85, 2, 9.4, shade(top, (i % 2) * -0.05), { y: 10, z: -22 + i * 11 }, 0.5))
  for (let i = 0; i < 3; i++) g.add(rbox(100, 4.4, 21.8, shade(top, [0, -0.05, 0.03][i]), { y: 41.4, z: -22 + i * 22 }, 0.8))
  return g
}
export const FH_COFFEE_SURFACES: SurfaceDef[] = [{ y: 12, h: 24, shape: [r(-42, -26, 42, 26)] }]

/** 谷仓门电视柜：两扇 X 撑木板推拉门挂在黑铁滑轨上（左门可推开），厚木台面 */
export function fhTvStand(p: string[]) {
  const [body, wood, iron] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 8, 6, shade(body, -0.1), { x: sx * 74, z: sz * 17 }, 1))
  g.add(hollow(156, 50, 42, body, { y: 8 }, 1.6, inner))
  g.add(rbox(152.8, 1.6, 39, inner, { y: 33, z: 0.4 }, 0.3))
  g.add(rbox(160, 4, 46, wood, { y: 59 }, 1))
  g.add(rbox(158, 2.4, 1, iron, { y: 56.6, z: 24.4 }, 0.3))
  for (const s of [-1, 1]) g.add(cylZ(1, 2.6, iron, s * 78, 57.8, 23.2, 8))
  const door = (x: number, z: number) => {
    const parts: THREE.Object3D[] = [rbox(77, 46, 1.4, body, { x, y: 10, z }, 0.4)]
    for (let k = -2; k <= 2; k++) parts.push(noOutlineDeep(rbox(0.4, 45, 0.3, shade(body, -0.12), { x: x + k * 13, y: 10.5, z: z + 0.75 }, 0.1)))
    for (const y of [10, 51]) parts.push(rbox(77, 5, 0.9, wood, { x, y, z: z + 1 }, 0.3))
    for (const t of [-1, 1]) parts.push(rbox(5, 36, 0.9, wood, { x: x + t * 36, y: 15, z: z + 1 }, 0.3))
    parts.push(batten([x - 33, 15, z + 1], [x + 33, 51, z + 1], 4.4, 0.9, wood))
    parts.push(batten([x + 33, 15, z + 1], [x - 33, 51, z + 1], 4.4, 0.9, wood))
    for (const t of [-1, 1]) parts.push(cylZ(2.2, 1.2, iron, x + t * 26, 56, z, 16))
    parts.push(rod3([x + (x < 0 ? 33 : -33), 26, z + 2.6], [x + (x < 0 ? 33 : -33), 40, z + 2.6], 0.6, iron, 8))
    return parts
  }
  g.add(slideDoor(door(-39, 23.6), 38))
  for (const o of door(39, 25.2)) g.add(o)
  return g
}
const FH_TV_IN = r(-76.4, -19.4, 76.4, 20.6)
export const FH_TV_SURFACES: SurfaceDef[] = [
  { y: 9.6, h: 23.4, inside: true, shape: [FH_TV_IN] },
  { y: 34.6, h: 21.8, inside: true, shape: [FH_TV_IN] },
]

/** X 腿搁架餐桌：拼板桌面 + 两端横封边，两端 X 形腿架（上下横木）由一根长拉档连起来 */
export function fhTrestle(p: string[]) {
  const [top, base] = p
  const g = new THREE.Group()
  const W = 150
  const D = 85
  for (const s of [-1, 1]) {
    const x = s * 55
    g.add(rbox(8, 5, 74, base, { x }, 1))
    g.add(rbox(8, 5, 74, base, { x, y: 66 }, 1))
    g.add(batten([x, 5, -31], [x, 66, 31], 7, 5, base))
    g.add(batten([x, 5, 31], [x, 66, -31], 7, 5, base))
  }
  g.add(rbox(118, 7, 5, base, { y: 32.5 }, 1))
  for (const s of [-1, 1]) g.add(rbox(3, 9, 2, shade(base, -0.2), { x: s * 62, y: 31.5, z: 3.6 }, 0.4))
  for (let i = 0; i < 4; i++) g.add(rbox(W - 10, 5, D / 4, shade(top, [0, -0.05, 0.03, -0.02][i]), { y: 71, z: -D / 2 + D / 8 + (i * D) / 4 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(5, 5, D, shade(top, -0.07), { x: s * (W / 2 - 2.5), y: 71 }, 0.8))
  return g
}

/** 温莎椅：马鞍形座面、外撇车旋腿 + H 撑、弓形背 + 纺锤杆；arms 时加两侧扶手（书椅） */
export function fhWindsor(arms: boolean) {
  return (p: string[]) => {
    const [paint, seat, dark] = p
    const g = new THREE.Group()
    const sw = arms ? 25 : 23
    const sm = cyl(sw, sw, 4.5, seat, { y: 41.5 }, 32)
    sm.scale.z = 0.9
    g.add(sm)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(taperRod3([sx * 13, 42, sz * 12], [sx * 18.5, 0.3, sz * 17.5], 1.7, 1.3, paint, 10))
    for (const s of [-1, 1]) g.add(rod3([s * 16.4, 16, -15.4], [s * 16.4, 16, 15.4], 1.1, dark))
    g.add(rod3([-16.4, 16, 0], [16.4, 16, 0], 1.1, dark))
    const bow = (t: number): V3 => [-17 * Math.cos(Math.PI * t), 45 + 50 * Math.sin(Math.PI * t), -15 - 7 * Math.sin(Math.PI * t)]
    g.add(cappedTube(Array.from({ length: 11 }, (_, i) => bow(i / 10)), 1.4, paint, { ...TUBE, caps: false }))
    for (const x of [-10.5, -5.25, 0, 5.25, 10.5]) {
      const sv = Math.sqrt(1 - (x / 17) ** 2)
      g.add(rod3([x * 0.85, 45, -15], [x, 45 + 50 * sv, -15 - 7 * sv], 0.6, paint, 8))
    }
    if (arms)
      for (const s of [-1, 1]) {
        g.add(cappedTube([[s * 15.4, 66, -17.9], [s * 21.5, 66, -5], [s * 23, 65, 10]], 1.3, paint, TUBE))
        g.add(rod3([s * 20.6, 45, 9], [s * 23, 65, 10], 0.9, paint, 8))
        g.add(rod3([s * 19.6, 45, -2], [s * 21.5, 65.8, -3], 0.6, paint, 8))
      }
    return g
  }
}

/** 木板床（床垫宽 m）：方柱带帽头，床头 / 床尾是竖向企口木板，铺拼布被 */
export function fhPlankBed(m: number) {
  return (p: string[]) => {
    const [quilt, sheet, wood] = p
    const g = new THREE.Group()
    const W = m + 14
    const D = 214
    const zh = -D / 2 + 3.5
    const zf = D / 2 - 3.5
    for (const sx of [-1, 1]) {
      g.add(rbox(7, 112, 7, wood, { x: sx * (W / 2 - 3.5), z: zh }, 1))
      g.add(rbox(7, 62, 7, wood, { x: sx * (W / 2 - 3.5), z: zf }, 1))
      g.add(rbox(9, 2.6, 9, shade(wood, -0.08), { x: sx * (W / 2 - 3.5), y: 112, z: zh }, 0.8))
      g.add(rbox(9, 2.6, 9, shade(wood, -0.08), { x: sx * (W / 2 - 3.5), y: 62, z: zf }, 0.8))
      g.add(rbox(4, 14, D - 14, wood, { x: sx * (W / 2 - 3.5), y: 20 }, 0.8))
    }
    const bw = W - 14
    const n = Math.round(bw / 12)
    for (let i = 0; i < n; i++) {
      const x = -bw / 2 + (bw / n) * (i + 0.5)
      const c = shade(wood, (i % 3) * 0.035 - 0.03)
      g.add(rbox(bw / n - 0.5, 70, 2.6, c, { x, y: 34, z: zh }, 0.3))
      g.add(rbox(bw / n - 0.5, 22, 2.6, c, { x, y: 34, z: zf }, 0.3))
    }
    g.add(rbox(bw, 4, 4, wood, { y: 30, z: zh }, 0.6))
    g.add(rbox(W - 4, 6, 5, wood, { y: 104, z: zh }, 0.8))
    g.add(rbox(bw, 4, 4, wood, { y: 30, z: zf }, 0.6))
    g.add(rbox(W - 4, 5, 5, wood, { y: 56, z: zf }, 0.8))
    g.add(rbox(W - 12, 2, D - 14, shade(wood, -0.2), { y: 31 }, 0.5))
    g.add(rbox(W - 12, 22, D - 16, sheet, { y: 33 }, 5))
    const pn = m >= 120 ? 2 : 1
    for (let i = 0; i < pn; i++) g.add(rbox(pn > 1 ? m * 0.42 : m * 0.6, 12, 32, C.white, { x: pn > 1 ? (i ? 1 : -1) * m * 0.24 : 0, y: 54, z: zh + 28, rx: -0.12 }, 5))
    const qd = D - 78
    const qz = zf - 6 - qd / 2
    g.add(rbox(W - 6, 7, qd, quilt, { y: 54, z: qz }, 3))
    g.add(paintPanel(W - 12, qd - 6, `sw-quilt-${quilt}-${sheet}`, paintPatchwork(quilt, sheet), { y: 61.35, z: qz + (qd - 6) / 2, rx: -Math.PI / 2 }))
    return g
  }
}
/** 床面（被子顶）高度 */
export const FH_BED_TOP = 61

/** 谷仓门衣柜：漆色柜身、原木横竖框 + 斜撑的对开门、黑铁长合页和吊环拉手，顶冠线脚；门里挂衣杆 + 顶层板 */
export function fhWardrobe(p: string[]) {
  const [body, wood, iron] = p
  const g = new THREE.Group()
  const W = 106
  const D = 58
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(8, 8, 8, shade(body, -0.08), { x: sx * 48, z: sz * 23 }, 1))
  g.add(rbox(W, 6, D, body, { y: 8 }, 1))
  g.add(hollow(100, 172, 54, body, { y: 14 }, 1.6, inner))
  g.add(rbox(96.8, 1.6, 51, inner, { y: 174, z: 0.5 }, 0.3))
  g.add(hangingPipe(-46, 46, 166, 0))
  g.add(rbox(W, 4, D + 2, body, { y: 186 }, 1))
  g.add(rbox(W + 4, 4, D + 4, wood, { y: 190 }, 1))
  for (const s of [-1, 1]) {
    const dx = s * 24.8
    const dw = 49
    const z = 27.7
    const parts: THREE.Object3D[] = [rbox(dw, 168, 1.4, body, { x: dx, y: 16, z }, 0.4)]
    for (const y of [16, 96, 178]) parts.push(rbox(dw, 6, 0.9, wood, { x: dx, y, z: z + 1 }, 0.3))
    for (const t of [-1, 1]) parts.push(rbox(6, 156, 0.9, wood, { x: dx + t * (dw / 2 - 3), y: 22, z: z + 1 }, 0.3))
    parts.push(batten([dx - s * 19, 23, z + 1], [dx + s * 19, 95, z + 1], 5, 0.9, wood))
    parts.push(batten([dx - s * 19, 103, z + 1], [dx + s * 19, 177, z + 1], 5, 0.9, wood))
    for (const y of [40, 158]) parts.push(rbox(16, 2.4, 0.6, iron, { x: s * (W / 2 - 11), y, z: z + 1.6 }, 0.2))
    parts.push(torus(2.4, 0.5, iron, { x: s * 3.6, y: 100, z: z + 2 }))
    g.add(swingDoor(parts, s * (W / 2 - 3), z - 0.7, s < 0 ? 'left' : 'right'))
  }
  return g
}
const FH_WR_IN = r(-48, -25, 48, 26.4)
export const FH_WARDROBE_SURFACES: SurfaceDef[] = [
  { y: 15.6, h: 143, inside: true, shape: [FH_WR_IN] },
  { y: 175.6, h: 8.8, inside: true, shape: [FH_WR_IN] },
  pipeHook(-46, 46, 166, 0, 166 - 15.6 - 6),
]

/** 农舍五斗柜：漆色柜身 + 原木面板，四层抽屉（顶层两只小抽屉）配黑铁杯形拉手，托架脚 */
export function fhDresser(p: string[]) {
  const [body, top, pull] = p
  const g = new THREE.Group()
  const inner = shade(body, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(8, 8, 8, shade(body, -0.08), { x: sx * 40, z: sz * 18 }, 1))
  g.add(hollow(84, 76, 42, body, { y: 8 }, 1.6, inner))
  g.add(rbox(88, 4, 46, top, { y: 84 }, 1))
  for (const [x0, x1, y, h] of FH_DR) {
    const cx = (x0 + x1) / 2
    const parts: THREE.Object3D[] = [rbox(x1 - x0 - 0.8, h - 0.6, 1.2, body, { x: cx, y: y + 0.3, z: 21.4 }, 0.5)]
    for (const px of x1 - x0 > 60 ? [cx - 20, cx + 20] : [cx]) parts.push(torus(2.4, 0.6, pull, { x: px, y: y + h * 0.5, z: 22.2 }, Math.PI))
    g.add(drawerOf(parts, x0, x1, y, h, 20.8, 36, inner))
  }
  return g
}
const FH_DR: [number, number, number, number][] = [[-40.4, 40.4, 9.8, 17.6], [-40.4, 40.4, 28.2, 18], [-40.4, 40.4, 47, 18], [-40.4, -0.4, 65.8, 16.4], [0.4, 40.4, 65.8, 16.4]]
export const FH_DRESSER_SURFACES: SurfaceDef[] = FH_DR.map(([x0, x1, y, h]) => drawerLv(x0, x1, y, h, 20.8, 36))

/** 车旋腿书桌：漆色车旋腿和裙板，中间一只抽屉配杯形拉手，三块木板拼的桌面 */
export function fhDesk(p: string[]) {
  const [top, base, pull] = p
  const g = new THREE.Group()
  const W = 120
  const D = 60
  const inner = shade(base, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(turnedLeg(72, 3, base, { x: sx * 54, z: sz * 24 }, 'farm'))
  g.add(rbox(W - 16, 1.2, D - 12, inner, { y: 61.6 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(1.6, 9.4, 45, base, { x: s * 54, y: 62.6 }, 0.4))
    g.add(rbox(20.4, 9.4, 1.6, base, { x: s * 41.2, y: 62.6, z: 24 }, 0.4))
  }
  g.add(rbox(105, 9.4, 1.6, base, { y: 62.6, z: -24 }, 0.4))
  g.add(drawerOf([rbox(60, 8.6, 1.2, base, { y: 63, z: 24.4 }, 0.4), torus(2.4, 0.6, pull, { y: 66.6, z: 25.2 }, Math.PI)], -31, 31, 63, 8.6, 23.8, 40, inner))
  for (let i = 0; i < 3; i++) g.add(rbox(W, 4, D / 3, shade(top, [0, -0.05, 0.03][i]), { y: 72, z: -D / 3 + (i * D) / 3 }, 0.6))
  return g
}
export const FH_DESK_SURFACES: SurfaceDef[] = [drawerLv(-31, 31, 63, 8.6, 23.8, 40)]

/** 陶罐台灯：粗陶罐身 + 小耳，亚麻鼓形灯罩（上下两道缝边） */
export function fhTableLamp(p: string[]) {
  const [crock, shadeC, accent] = p
  const g = new THREE.Group()
  g.add(latheAt([[0, 0], [6, 0], [7, 2], [7.4, 9], [6, 15], [3, 18], [2.6, 21], [3.2, 22], [0, 22]], crock, {}, 20, 0.001))
  g.add(noOutlineDeep(torus(7.42, 0.4, accent, { y: 8, rx: Math.PI / 2 })))
  g.add(torus(2.4, 0.6, crock, { x: 6.6, y: 14, ry: Math.PI / 2 }, Math.PI))
  g.add(cyl(0.9, 0.9, 6, '#b8bcc0', { y: 22 }, 10))
  g.add(lit(ball(2.2, C.lamp, { y: 30.5 }), C.lamp, 0.9))
  g.add(cup(13.5, 11.5, 15, 0.5, shadeC, { y: 41, rx: Math.PI }))
  for (const [rr, y] of [[13.4, 26.4], [11.6, 40.6]]) g.add(noOutlineDeep(torus(rr, 0.35, accent, { y, rx: Math.PI / 2 })))
  return g
}

/** 三脚木落地灯：三根原木腿在顶上收拢，托一只亚麻鼓形灯罩 */
export function fhTripodLamp(p: string[]) {
  const [wood, shadeC, accent] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(rod3([Math.sin(a) * 23, 0.3, Math.cos(a) * 23], [Math.sin(a) * 2.6, 118, Math.cos(a) * 2.6], 1.5, wood, 10))
  }
  g.add(cyl(3.6, 3.6, 6, accent, { y: 113 }, 16))
  g.add(cyl(1, 1, 14, accent, { y: 119 }, 10))
  g.add(lit(ball(2.6, C.lamp, { y: 136 }), C.lamp, 0.9))
  g.add(cup(20, 18, 26, 0.6, shadeC, { y: 156, rx: Math.PI }))
  for (const [rr, y] of [[19.9, 130.4], [18.1, 155.6]]) g.add(noOutlineDeep(torus(rr, 0.4, accent, { y, rx: Math.PI / 2 })))
  return g
}
