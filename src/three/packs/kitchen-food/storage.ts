// 厨房 / 食物素材包的厨房收纳建模（架子、篮筐、调料、厨具挂件等）
// 只放建模函数和它们用到的常量，素材表在 ../kitchen-food.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus, tray } from '../../toon'
import { C, G, SWING_OPEN, movable, rng, type DoorMotion } from '../../kit'
import { PI, cappedTube, hcyl, noOutlineDeep, rod3, type V3 } from '../../geo'
import { M } from '../../packkit'
import { GLASS, PG, RICE, SOY, STEEL, S_LOW, TUBE, arc, bottle, bowl, glassGhost, hangAt, sHook } from './common'

// ======================================================================
// 厨房收纳
// ======================================================================

/** 不锈钢两层沥水架：full = 放着碗盘 */
export function dishRack2(p: string[], full: boolean) {
  const [frame, trayC, acc] = p
  const g = new THREE.Group()
  const W = 48
  const D = 28
  // 接水盘
  g.add(tray(W, 2.2, D, 0.5, trayC, {}, 0.4))
  // 出水嘴
  g.add(rbox(4, 1, 3, trayC, { x: W / 2 - 6, y: 0.6, z: D / 2 - 0.2 }, 0.4))
  // 四根立柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.45, 0.45, 36, frame, { x: sx * (W / 2 - 2), y: 1, z: sz * (D / 2 - 2) }, 8))
  // 下层：竖条碗栏（沿 x 一排）
  const y1 = 4
  for (const sz of [-1, 1]) g.add(rod3([-W / 2 + 2, y1, sz * (D / 2 - 2)], [W / 2 - 2, y1, sz * (D / 2 - 2)], 0.4, frame, 8))
  for (const sx of [-1, 1]) g.add(rod3([sx * (W / 2 - 2), y1, -D / 2 + 2], [sx * (W / 2 - 2), y1, D / 2 - 2], 0.4, frame, 8))
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 6 + i * 3.2
    g.add(rod3([x, y1, -3], [x, y1 + 9, -3], 0.25, frame, 8))
    g.add(rod3([x, y1, 3], [x, y1 + 6, 3], 0.25, frame, 8))
  }
  for (let i = 0; i < 7; i++) g.add(rod3([-W / 2 + 2, y1, -D / 2 + 3 + i * 3.6], [W / 2 - 2, y1, -D / 2 + 3 + i * 3.6], 0.22, frame, 8))
  // 右侧筷子筒
  g.add(tray(6, 12, 6, 0.4, acc, { x: W / 2 - 5.5, y: y1 + 0.3, z: D / 2 - 5.5 }, 0.5))
  // 上层：浅网篮
  const y2 = 22
  for (const sz of [-1, 1]) g.add(rod3([-W / 2 + 2, y2, sz * (D / 2 - 2)], [W / 2 - 2, y2, sz * (D / 2 - 2)], 0.4, frame, 8))
  for (const sx of [-1, 1]) g.add(rod3([sx * (W / 2 - 2), y2, -D / 2 + 2], [sx * (W / 2 - 2), y2, D / 2 - 2], 0.4, frame, 8))
  for (let i = 0; i < 7; i++) g.add(rod3([-W / 2 + 2, y2, -D / 2 + 3 + i * 3.6], [W / 2 - 2, y2, -D / 2 + 3 + i * 3.6], 0.22, frame, 8))
  for (const sz of [-1, 1]) g.add(rod3([-W / 2 + 2, y2 + 4, sz * (D / 2 - 2)], [W / 2 - 2, y2 + 4, sz * (D / 2 - 2)], 0.3, frame, 8))
  // 顶上把手横杆
  for (const sx of [-1, 1]) g.add(rod3([sx * (W / 2 - 2), 37, -D / 2 + 2], [sx * (W / 2 - 2), 37, D / 2 - 2], 0.45, frame, 8))
  if (full) {
    const r = rng(7)
    // 下层竖插的盘子
    for (let i = 0; i < 5; i++) {
      const pc = [C.white, acc, '#f3efe6', C.white, shade(acc, 0.15)][i]
      const m = cyl(9.5 - (i % 2) * 1.5, 9 - (i % 2) * 1.5, 0.7, pc, {}, 28)
      m.position.set(-W / 2 + 7 + i * 3.2, y1 + 10.5 - (i % 2) * 1.5, -2.5)
      m.rotation.z = PI / 2 + (r() - 0.5) * 0.15
      g.add(m)
    }
    // 倒扣的饭碗
    for (const [x, c] of [
      [10, C.white],
      [17, acc],
    ] as const) {
      const b = bowl(5.5, 5.8, c, {})
      b.rotation.x = PI * 0.75
      b.position.set(x, y1 + 6, 6)
      g.add(b)
    }
    // 上层倒扣杯子
    for (let i = 0; i < 3; i++) {
      const m = cup(3.8, 3.2, 9, 0.35, i === 1 ? acc : C.white)
      m.rotation.x = PI
      m.position.set(-14 + i * 9, y2 + 9.4, 0)
      g.add(m)
    }
    // 筷子
    for (let i = 0; i < 4; i++) g.add(rod3([W / 2 - 6.5 + (i % 2) * 2, y1 + 1, D / 2 - 6.5 + Math.floor(i / 2) * 2], [W / 2 - 6 + (i % 2) * 2.4, y1 + 21, D / 2 - 6 + Math.floor(i / 2) * 2.4], 0.3, i % 2 ? C.woodD : '#a3442f', 8))
  }
  return g
}

/** 单层小沥水篮 */
export function dishRackMini(p: string[]) {
  const [frame, trayC] = p
  const g = new THREE.Group()
  g.add(tray(34, 2, 24, 0.5, trayC, {}, 0.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.5, 0.5, 2.5, frame, { x: sx * 14, y: 1.5, z: sz * 9.5 }, 8))
  g.add(tray(32, 10, 22, 0.6, frame, { y: 3.5 }, 0.3))
  // 栅格：网篮侧面的竖条用浅色贴片表示
  for (let i = 0; i < 9; i++) g.add(noOutlineDeep(rbox(0.5, 7, 0.3, shade(frame, -0.12), { x: -12 + i * 3, y: 5.5, z: 11.2 }, 0.1)))
  return g
}

/** 旋转调料架：转盘 + 8 个调料瓶 */
export function spiceCarousel(p: string[]) {
  const [base, cap, lab] = p
  const g = new THREE.Group()
  g.add(puck(12, 1.4, base))
  g.add(cyl(1, 1, 22, base, { y: 1.4 }, 12))
  g.add(puck(11, 1.2, base, { y: 11 }))
  g.add(ball(1.8, cap, { y: 24 }))
  for (const lvl of [1.4, 12.2])
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + (lvl > 5 ? 0.5 : 0)
      const x = Math.cos(a) * 8
      const z = Math.sin(a) * 8
      g.add(glassGhost(cyl(2, 2, 8, GLASS, { x, y: lvl, z }, 14)))
      g.add(noOutlineDeep(cyl(1.7, 1.7, 5, ['#c0392b', '#e8c27a', '#7a8b3a', '#5a3a2a', '#e8e0d0', '#d8742a'][i], { x, y: lvl + 0.3, z }, 12)))
      g.add(cyl(2.1, 2.1, 1.6, cap, { x, y: lvl + 8, z }, 14))
      g.add(noOutlineDeep(rbox(2, 2, 0.3, lab, { x: x + Math.cos(a) * 2.05, y: lvl + 3, z: z + Math.sin(a) * 2.05, ry: -a + PI / 2 }, 0.1)))
    }
  return g
}

/** 两层调料架（带酱油瓶、盐罐、胡椒） */
export function spiceShelf(p: string[]) {
  const [wood, acc, lab] = p
  const g = new THREE.Group()
  const W = 36
  const D = 12
  for (const sx of [-1, 1]) g.add(rbox(1.2, 30, D, wood, { x: sx * (W / 2 - 0.6) }, 0.3))
  g.add(rbox(W - 2.4, 1.2, D, wood, { y: 1 }, 0.3))
  g.add(rbox(W - 2.4, 1.2, D, wood, { y: 15 }, 0.3))
  // 护栏
  for (const y of [7, 21]) g.add(hcyl(0.4, 0.4, W - 2.4, acc, 0, y, D / 2 - 1))
  // 下层：酱油 / 味醂 / 油
  const bots: [number, string, number][] = [
    [-11, SOY, 12],
    [-5, '#d9a441', 12.5],
    [1, '#f0d77a', 11],
  ]
  for (const [x, c, h] of bots) {
    g.add(glassGhost(bottle(2.4, h, 0.8, h * 0.55, GLASS, { x, y: 2.2, z: -1 })))
    g.add(noOutlineDeep(cyl(2.1, 2.1, h * 0.5, c, { x, y: 2.5, z: -1 }, 16)))
    g.add(cyl(0.95, 0.95, 1.2, acc, { x, y: 2.2 + h, z: -1 }, 12))
    g.add(noOutlineDeep(rbox(2.6, 3, 0.3, lab, { x, y: 4.5, z: 1.5 }, 0.1)))
  }
  // 盐罐、糖罐
  for (const [x, c] of [
    [8, '#ffffff'],
    [13.5, '#fff3dd'],
  ] as const) {
    g.add(cup(2.6, 2.6, 7, 0.3, lab, { x, y: 2.2, z: 0 }))
    g.add(noOutlineDeep(cyl(2.25, 2.25, 5.5, c, { x, y: 2.5, z: 0 }, 16)))
    g.add(puck(2.8, 1, acc, { x, y: 9.2, z: 0 }))
  }
  // 上层：小香料瓶一排
  for (let i = 0; i < 6; i++) {
    const x = -14 + i * 5.6
    g.add(glassGhost(cyl(1.8, 1.8, 7, GLASS, { x, y: 16.2, z: 0 }, 14)))
    g.add(noOutlineDeep(cyl(1.5, 1.5, 4.5, ['#c0392b', '#7a8b3a', '#e8c27a', '#3a2a22', '#d8742a', '#a4b86a'][i], { x, y: 16.5, z: 0 }, 12)))
    g.add(cyl(1.9, 1.9, 1.6, i % 2 ? acc : M.black, { x, y: 23.2, z: 0 }, 14))
  }
  return g
}

/** 磁吸刀架（壁挂）：mount = 离地高度 */
export const KNIFE_MOUNT = 130
export function knifeMagnet(p: string[]) {
  const [bar, handle, acc] = p
  const g = new THREE.Group()
  g.add(rbox(42, 4.5, 1.8, bar, { y: KNIFE_MOUNT + 18, z: -1.6 }, 0.8))
  g.add(noOutlineDeep(rbox(40, 0.6, 0.3, acc, { y: KNIFE_MOUNT + 20, z: -0.55 }, 0.1)))
  // 刀：刀刃朝下，刀身贴着磁条
  const knives: [number, number, number][] = [
    [-15, 20.5, 4.6],
    [-6, 16, 3.6],
    [2, 13, 2.4],
    [9, 18, 4.2],
  ]
  for (const [x, L, bw] of knives) {
    g.add(rbox(bw, L, 0.25, STEEL, { x, y: KNIFE_MOUNT + 20.5 - L, z: -0.4 }, 0.1))
    g.add(rbox(bw * 0.7, 11, 1.4, handle, { x: x - bw * 0.1, y: KNIFE_MOUNT + 20.5, z: -0.4 }, 0.5))
  }
  // 剪刀
  g.add(rbox(1.2, 10, 0.3, STEEL, { x: 15, y: KNIFE_MOUNT + 10.5, z: -0.4 }, 0.1))
  g.add(torus(1.6, 0.4, acc, { x: 14, y: KNIFE_MOUNT + 22.2, z: -0.4 }))
  g.add(torus(1.6, 0.4, acc, { x: 17.4, y: KNIFE_MOUNT + 22.2, z: -0.4 }))
  // 打板
  g.add(rod3([15.6, KNIFE_MOUNT + 20.4, -0.4], [15.6, KNIFE_MOUNT + 22, -0.4], 0.4, acc, 8))
  return g
}

/** 厨具筒（筷子笼 + 木铲勺） */
export function utensilCrock(p: string[]) {
  const [pot, wood, acc] = p
  const g = new THREE.Group()
  g.add(cup(6, 5.4, 15, 0.6, pot))
  g.add(noOutlineDeep(cyl(5.3, 5.3, 0.4, shade(pot, -0.2), { y: 13 }, 24)))
  // 木铲
  g.add(rod3([-2, 2, 0], [-3.5, 30, -1], 0.6, wood, 8))
  g.add(rbox(5, 7, 0.6, wood, { x: -3.8, y: 28, z: -1.1, rz: 0.05 }, 0.3))
  // 汤勺
  g.add(rod3([2, 2, 1], [3, 31, 2], 0.45, acc, 8))
  const b = cup(3.2, 2.6, 2.6, 0.25, acc)
  b.position.set(3.2, 31, 2.5)
  b.rotation.x = PI * 0.92
  g.add(b)
  // 打蛋器
  g.add(rod3([0, 2, -2.5], [0.5, 22, -3], 0.5, M.black, 8))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI
    const pts = arc([0.5, 25.5, -3], 3.5, -PI / 2, PI * 1.5, 12, 'xy').map(([x, y]): V3 => [0.5 + (x - 0.5) * Math.cos(a), y + (y > 25.5 ? (y - 25.5) * 0.8 : 0), -3 + (x - 0.5) * Math.sin(a)])
    g.add(cappedTube(pts, 0.12, STEEL, { ...TUBE, seg: 24 }))
  }
  // 长筷子
  g.add(rod3([1.5, 2, -1], [5, 33, -2], 0.3, wood, 8))
  g.add(rod3([2.2, 2, -0.5], [6, 33, -1.2], 0.3, wood, 8))
  return g
}

/** 金属网篮多层推车：tiers = 3 / 4 */
export function wagonTiers(tiers: number) {
  const gap = tiers === 3 ? 30 : 24
  return Array.from({ length: tiers }, (_, i) => 7 + i * gap)
}
export const WAGON_DX = 1.65
export function kitchenWagon(p: string[], tiers: number) {
  const [frame, basket, acc] = p
  const g = new THREE.Group()
  const ys = wagonTiers(tiers)
  const W = 45
  const D = 30
  const top = ys[ys.length - 1] + 5
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cyl(0.9, 0.9, top - 4.5, frame, { x: sx * (W / 2 - 1.2), y: 4.5, z: sz * (D / 2 - 1.2) }, 10))
      // 万向轮
      g.add(cyl(0.6, 0.6, 1.6, M.black, { x: sx * (W / 2 - 1.2), y: 3, z: sz * (D / 2 - 1.2) }, 8))
      g.add(hcyl(1.5, 1.5, 1.2, M.black, sx * (W / 2 - 1.2), 1.5, sz * (D / 2 - 1.2), 'x', 14))
      g.add(ball(1.2, frame, { x: sx * (W / 2 - 1.2), y: top, z: sz * (D / 2 - 1.2) }))
    }
  for (const y of ys) {
    g.add(tray(W - 1, 5, D - 1, 0.6, basket, { y }, 0.3))
    // 网格感：前后侧面的细竖条
    for (let i = 0; i < 12; i++) for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(0.4, 3.6, 0.3, shade(basket, -0.15), { x: -W / 2 + 4 + i * 3.4, y: y + 0.8, z: s * (D / 2 - 0.25) }, 0.1)))
  }
  // 侧面推手
  g.add(rod3([W / 2 - 1.2, top - 2, -D / 2 + 4], [W / 2 + 2.5, top - 2, -D / 2 + 4], 0.6, acc, 8))
  g.add(rod3([W / 2 - 1.2, top - 2, D / 2 - 4], [W / 2 + 2.5, top - 2, D / 2 - 4], 0.6, acc, 8))
  g.add(rod3([W / 2 + 2.5, top - 2, -D / 2 + 4], [W / 2 + 2.5, top - 2, D / 2 - 4], 0.8, acc, 8))
  // 推手让包围盒右偏，整体左移居中
  g.position.x = -WAGON_DX
  return G(g)
}

/** 计量米柜（米びつ 10kg）：正面计量按钮 + 底部接米抽屉 */
export function riceCabinet(p: string[]) {
  const [body, front, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 46, 40, body, {}, 1.5))
  g.add(rbox(26, 2, 42, shade(body, -0.08), { y: 46 }, 0.8))
  g.add(rbox(20, 30, 0.6, front, { y: 12, z: 20 }, 0.6))
  // 米量窗
  g.add(glassGhost(rbox(5, 18, 0.4, GLASS, { y: 18, z: 20.4 }, 0.2)))
  g.add(noOutlineDeep(rbox(4, 12, 0.3, RICE, { y: 18.5, z: 20.25 }, 0.2)))
  // 计量按钮
  g.add(hcyl(2.4, 2.4, 1.2, acc, 0, 39, 20.6, 'z', 20))
  g.add(noOutlineDeep(rbox(2.4, 0.5, 0.3, C.white, { y: 38.8, z: 21.3 }, 0.1)))
  // 接米抽屉
  g.add(rbox(18, 8, 2, shade(front, -0.05), { y: 2, z: 20.5 }, 0.6))
  g.add(rbox(8, 1.5, 1.2, acc, { y: 6.5, z: 22 }, 0.5))
  return g
}

/** レジ袋スタンド：三个挂袋架（可燃 / 不燃 / 资源） */
export function bagStand(p: string[]) {
  const [frame, bag, acc] = p
  const g = new THREE.Group()
  const W = 75
  const D = 30
  const H = 68
  for (const sx of [-1, 1]) {
    g.add(rod3([sx * (W / 2 - 1), 0.8, -D / 2 + 1], [sx * (W / 2 - 1), 0.8, D / 2 - 1], 0.8, frame, 8))
    g.add(rod3([sx * (W / 2 - 1), 0.8, -D / 2 + 1], [sx * (W / 2 - 1), H - 0.8, -D / 2 + 1], 0.8, frame, 8))
  }
  g.add(rod3([-W / 2 + 1, H - 0.8, -D / 2 + 1], [W / 2 - 1, H - 0.8, -D / 2 + 1], 0.8, frame, 8))
  g.add(rod3([-W / 2 + 1, 0.8, -D / 2 + 1], [W / 2 - 1, 0.8, -D / 2 + 1], 0.8, frame, 8))
  // 挂袋方框的背面横杆
  g.add(rod3([-W / 2 + 1, H - 6, -D / 2 + 1], [W / 2 - 1, H - 6, -D / 2 + 1], 0.6, frame, 8))
  const tints = [acc, '#8fb8de', '#f2c94c']
  for (let i = 0; i < 3; i++) {
    const x = -24 + i * 24
    // 袋口方框（从背杆伸出）
    for (const sx of [-1, 1]) g.add(rod3([x + sx * 10, H - 6, -D / 2 + 1], [x + sx * 10, H - 6, D / 2 - 1.5], 0.45, frame, 8))
    g.add(rod3([x - 10, H - 6, D / 2 - 1.5], [x + 10, H - 6, D / 2 - 1.5], 0.45, frame, 8))
    // 半透明垃圾袋：口沿翻在框上
    g.add(glassGhost(tray(20.5, H - 9, D - 3, 0.3, bag, { x, y: 1.7, z: 0.5 }, 0.2), bag, 0.55))
    g.add(noOutlineDeep(rbox(21.4, 1.2, D - 2, bag, { x, y: H - 6.8, z: 0.5 }, 0.3)))
    // 颜色标签牌
    g.add(rbox(10, 4, 0.5, tints[i], { x, y: H - 12, z: D / 2 - 0.8 }, 0.3))
  }
  return g
}

/** 玻璃保鲜盒叠放（大 / 中 / 小三只，盖子扣着） */
export function glassContainers(p: string[]) {
  const [lid, lid2, acc] = p
  const g = new THREE.Group()
  const sizes: [number, number, number, string][] = [
    [22, 7, 16, lid],
    [18, 6, 13, lid2],
    [14, 5, 10, lid],
  ]
  let y = 0
  for (const [w, h, d, c] of sizes) {
    g.add(glassGhost(tray(w, h, d, 0.5, GLASS, { y }, 0.8)))
    g.add(rbox(w + 0.6, 1.2, d + 0.6, c, { y: y + h }, 0.5))
    // 四边锁扣
    for (const s of [-1, 1]) g.add(rbox(4, 2, 0.6, shade(c, -0.1), { y: y + h - 1, z: s * (d / 2 + 0.5) }, 0.2))
    y += h + 1.2
  }
  // 最下层里装了点东西
  g.add(noOutlineDeep(rbox(18, 3, 12, acc, { y: 0.6 }, 1)))
  return g
}

/** 干货密封罐（三只不同高度：意面 / 米 / 麦片） */
export function canisters(p: string[]) {
  const [lid, band, acc] = p
  const g = new THREE.Group()
  const jars: [number, number, string][] = [
    [-9, 26, '#f1d58a'],
    [0, 20, RICE],
    [9, 15, '#d8a35c'],
  ]
  for (const [x, h, fill] of jars) {
    g.add(glassGhost(cup(4, 4, h, 0.4, GLASS, { x })))
    if (fill === '#f1d58a') for (let i = 0; i < 12; i++) g.add(noOutlineDeep(rod3([x - 2.5 + (i % 4) * 1.6, 0.6, -1.5 + Math.floor(i / 4) * 1.5], [x - 2.4 + (i % 4) * 1.6, h - 3, -1.5 + Math.floor(i / 4) * 1.5], 0.28, fill, 8)))
    else g.add(noOutlineDeep(cyl(3.5, 3.5, h * 0.7, fill, { x, y: 0.5 }, 18)))
    g.add(puck(4.5, 2.2, lid, { x, y: h - 0.3 }))
    g.add(noOutlineDeep(cyl(4.05, 4.05, 2.5, band, { x, y: h * 0.45 }, 24)))
    g.add(ball(0.9, acc, { x, y: h + 2.3 }))
  }
  return g
}

/** 保鲜膜 / 铝箔收纳架（两层斜放） */
export function wrapRack(p: string[]) {
  const [frame, box1, box2] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(rbox(0.8, 16, 9, frame, { x: sx * 16.5 }, 0.3))
  g.add(rbox(33.6, 0.8, 9, frame, {}, 0.3))
  g.add(rbox(33.6, 0.8, 9, frame, { y: 8 }, 0.3))
  g.add(rbox(33.6, 0.8, 9, frame, { y: 15.2 }, 0.3))
  // 两盒
  for (const [y, c, roll] of [
    [0.8, box1, '#e8f4f8'],
    [8.8, box2, '#d8dde3'],
  ] as const) {
    g.add(rbox(31, 5.6, 6, c, { y, z: 0 }, 0.4))
    g.add(noOutlineDeep(rbox(29, 1.6, 0.3, shade(c, -0.2), { y: y + 2, z: 3.1 }, 0.1)))
    g.add(noOutlineDeep(hcyl(1.6, 1.6, 29, roll, 0, y + 3.8, 1.2)))
  }
  return g
}

/** 墙上挂杆（空，带挂钩层）：mount = 杆座下沿离地高度 */
export const RAIL_MOUNT = 140
export const RAIL_BAR_Y = RAIL_MOUNT + 3
export const RAIL_R = 0.8
/** 杆座贴墙、杆在前：整体往前挪 RAIL_DZ 让包围盒前后居中；RAIL_Z 是挪完后的杆中心 z */
const RAIL_DZ = 0.95
export const RAIL_Z = RAIL_DZ
export function railBase(p: string[], len: number) {
  const [bar, plate] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    g.add(rbox(3, 6, 0.8, plate, { x: sx * (len / 2 - 1.5), y: RAIL_MOUNT, z: -2.6 + RAIL_DZ }, 0.3))
    g.add(hcyl(0.7, 0.7, 2.4, plate, sx * (len / 2 - 1.5), RAIL_BAR_Y, -1.2 + RAIL_DZ, 'z', 12))
    g.add(ball(1.1, bar, { x: sx * (len / 2 + 0.2), y: RAIL_BAR_Y, z: RAIL_Z }))
  }
  g.add(hcyl(RAIL_R, RAIL_R, len, bar, 0, RAIL_BAR_Y, RAIL_Z, 'x', 14))
  return g
}

// ---------- 可挂起的厨具：竖直本体（顶端有挂孔），挂起 / 平放两种形态 ----------

/** 汤勺：长 30，勺口朝前 */
export function ladleBody(p: string[]) {
  const [head, handle] = p
  const g = new THREE.Group()
  g.add(rbox(1.6, 22, 0.6, handle, { y: 6 }, 0.3))
  g.add(torus(0.8, 0.3, handle, { y: 28.6 }))
  const b = cup(4.2, 3.2, 3.6, 0.3, head)
  b.rotation.x = PI / 2
  b.position.set(0, 3.6, -1.8)
  g.add(b)
  g.add(rod3([0, 6.5, 0], [0, 7.4, 0.2], 0.5, head, 8))
  return g
}
/** 锅铲（フライ返し） */
export function turnerBody(p: string[]) {
  const [head, handle] = p
  const g = new THREE.Group()
  g.add(rbox(8, 9, 0.5, head, { y: 0 }, 0.4))
  for (let i = 0; i < 3; i++) g.add(noOutlineDeep(rbox(0.8, 5, 0.3, shade(head, -0.25), { x: -2.2 + i * 2.2, y: 2.5, z: 0.25 }, 0.1)))
  g.add(rbox(1.8, 4, 0.6, head, { y: 9 }, 0.3))
  g.add(rbox(2.2, 16, 1.2, handle, { y: 13 }, 0.5))
  g.add(torus(0.8, 0.3, handle, { y: 29.8 }))
  return g
}
/** 打蛋器 */
export function whiskBody(p: string[]) {
  const [wire, handle] = p
  const g = new THREE.Group()
  g.add(cyl(1.1, 1, 11, handle, { y: 14 }, 12))
  g.add(torus(0.8, 0.3, handle, { y: 25.8 }))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI
    const pts: V3[] = []
    for (let k = 0; k <= 16; k++) {
      const t = (k / 16) * PI * 2
      const xx = Math.sin(t) * 3.2
      const yy = 14 - (1 - Math.cos(t)) * 7
      pts.push([xx * Math.cos(a), yy, xx * Math.sin(a)])
    }
    g.add(cappedTube(pts, 0.13, wire, { ...TUBE, seg: 32 }))
  }
  return g
}
/** 夹子（トング） */
export function tongsBody(p: string[]) {
  const [arm, grip] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rod3([s * 0.6, 22, 0], [s * 2.2, 2, 0], 0.5, arm, 8))
    g.add(rbox(2, 2.2, 1.2, grip, { x: s * 2.2, y: 0, z: 0, rz: s * 0.08 }, 0.4))
    g.add(rod3([s * 0.8, 20, 0], [s * 1.5, 12, 0], 0.75, grip, 8))
  }
  g.add(torus(1, 0.32, arm, { y: 24 }))
  return g
}

/** 挂起形态：S 钩 + 本体（挂孔套在 S 钩下环上） */
export function hungTool(body: THREE.Object3D) {
  return G(sHook(), hangAt(G(body), S_LOW + 0.9))
}
/** 平放形态：本体放倒，顺着 x 方向 */
export function laidTool(body: THREE.Object3D) {
  const a = G(body)
  a.rotation.x = -PI / 2
  const b = G(a)
  b.rotation.y = PI / 2
  return G(b)
}

/** 挂杆 + 挂好的一排厨具 */
export function railWithTools(p: string[]) {
  const [bar, plate, handle] = p
  const g = railBase([bar, plate], 60)
  const tp = [STEEL, handle]
  const bodies = [ladleBody(tp), turnerBody(tp), whiskBody(tp), tongsBody(tp)]
  bodies.forEach((b, i) => {
    const h = hungTool(b)
    h.position.set(-21 + i * 14, RAIL_BAR_Y + RAIL_R + 0.5, RAIL_Z)
    g.add(h)
  })
  return g
}

/** 砧板立架（木砧板 + 塑料砧板两块） */
export function boardStand(p: string[]) {
  const [frame, board1, board2] = p
  const g = new THREE.Group()
  g.add(rbox(28, 1, 12, frame, {}, 0.4))
  for (const z of [-3.5, 0.5, 4.5]) for (const sx of [-1, 1]) g.add(rod3([sx * 12, 1, z], [sx * 12, 9, z], 0.35, frame, 8))
  // 两块板斜靠
  const b1 = rbox(30, 22, 1.8, board1, {}, 0.6)
  b1.position.set(0, 12, -2.6)
  b1.rotation.x = -0.12
  g.add(b1)
  g.add(noOutlineDeep(rbox(4, 1.2, 0.3, shade(board1, -0.2), { y: 20, z: -1.2, rx: -0.12 }, 0.4)))
  const b2 = rbox(26, 19, 1, board2, {}, 0.5)
  b2.position.set(0, 10.8, 2.2)
  b2.rotation.x = -0.1
  g.add(b2)
  return g
}

/** 锅具收纳架：立放三只平底锅 / 锅盖 */
export function panRack(p: string[]) {
  const [frame, pan, acc] = p
  const g = new THREE.Group()
  const L = 36
  for (const sx of [-1, 1]) g.add(rod3([sx * 10, 0.6, -L / 2], [sx * 10, 0.6, L / 2], 0.6, frame, 8))
  for (let i = 0; i < 4; i++) {
    const z = -L / 2 + 2 + i * 10.5
    g.add(cappedTube([[-10, 0.6, z], [-10, 14, z], [10, 14, z], [10, 0.6, z]], 0.45, frame, { ...TUBE, seg: 24 }))
  }
  // 锅：竖立在两格之间，锅柄朝前上
  const pans: [number, number, string][] = [
    [-10.75, 12, pan],
    [-0.25, 10.5, shade(pan, 0.1)],
  ]
  for (const [z, r, c] of pans) {
    const m = cup(r, r * 0.8, 4.5, 0.35, c)
    m.rotation.x = PI / 2
    m.position.set(0, r + 1.2, z + 2.2)
    g.add(m)
    g.add(rod3([0, r * 2 + 0.5, z], [0, r * 2 + 13, z + 6], 0.9, M.black, 8))
  }
  // 玻璃锅盖
  const lid = glassGhost(cyl(11, 11, 0.6, GLASS, {}, 28))
  lid.rotation.x = PI / 2
  lid.position.set(0, 12, 10.5)
  g.add(lid)
  g.add(hcyl(1.6, 1.6, 2.2, acc, 0, 12, 12, 'z', 14))
  g.add(noOutlineDeep(torus(11, 0.4, STEEL, { y: 12, z: 10.5 })))
  return g
}

/** 微波炉架（落地，三层 + 顶面） */
export const MW = { w: 60, d: 42, h: 120, shelves: [10, 50, 88] }
export function rangeRack(p: string[]) {
  const [frame, board, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(2.4, MW.h - 2, 2.4, frame, { x: sx * (MW.w / 2 - 1.2), z: sz * (MW.d / 2 - 1.2) }, 0.4))
      g.add(cyl(1.5, 1.5, 1, M.black, { x: sx * (MW.w / 2 - 1.2), z: sz * (MW.d / 2 - 1.2) }, 10))
    }
  for (const y of MW.shelves) g.add(rbox(MW.w - 1, 2, MW.d - 1, board, { y }, 0.5))
  g.add(rbox(MW.w, 2, MW.d, board, { y: MW.h - 2 }, 0.6))
  // 侧面挂钩杆
  g.add(hcyl(0.5, 0.5, MW.d - 6, acc, MW.w / 2 - 1.2 + 0.0, 75, 0, 'z'))
  // 背面加强斜撑
  g.add(rod3([-MW.w / 2 + 2, MW.shelves[1] + 2, -MW.d / 2 + 1], [MW.w / 2 - 2, MW.shelves[2], -MW.d / 2 + 1], 0.5, frame, 8))
  g.add(rod3([MW.w / 2 - 2, MW.shelves[1] + 2, -MW.d / 2 + 1], [-MW.w / 2 + 2, MW.shelves[2], -MW.d / 2 + 1], 0.5, frame, 8))
  return g
}

/** 台面置物架（跨在微波炉 / 电饭煲上方） */
export function counterRack(p: string[]) {
  const [frame, board] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(cyl(1, 1, 40, frame, { x: sx * 27, z: sz * 16 }, 10))
    g.add(rod3([sx * 27, 20, -16], [sx * 27, 20, 16], 0.6, frame, 8))
  }
  g.add(rod3([-27, 20, -16], [27, 20, -16], 0.6, frame, 8))
  g.add(rbox(58, 2, 36, board, { y: 40 }, 0.5))
  return g
}

/** 冰箱夹缝推车（宽 15，塞满调料瓶） */
export function gapWagon(p: string[]) {
  const [body, front, acc] = p
  const g = new THREE.Group()
  const W = 15
  const D = 55
  const ys = [5, 24, 43, 62]
  // 两侧是框架 + 每层低护栏（侧面敞开，能看到瓶子）
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(1, 76, 1.6, body, { x: sx * (W / 2 - 0.5), y: 3, z: sz * (D / 2 - 0.8) }, 0.3))
  for (const y of ys) {
    g.add(rbox(W - 2, 0.8, D - 1, body, { y }, 0.3))
    g.add(rbox(W - 2, 5, 0.8, body, { y, z: D / 2 - 0.9 }, 0.3))
    g.add(rbox(W - 2, 5, 0.8, body, { y, z: -D / 2 + 0.9 }, 0.3))
    for (const sx of [-1, 1]) g.add(rbox(1, 1, D - 2, body, { x: sx * (W / 2 - 0.5), y: y + 4 }, 0.3))
  }
  g.add(rbox(W, 1.2, D, body, { y: 79 }, 0.4))
  // 前面把手：装在两根前立柱之间的横梁上
  g.add(rbox(W - 1, 2, 1.2, body, { y: 73.5, z: D / 2 - 0.8 }, 0.3))
  g.add(rbox(8, 3, 1.4, front, { y: 73, z: D / 2 + 0.2 }, 0.6))
  // 轮子
  for (const sz of [-1, 1]) g.add(hcyl(1.5, 1.5, 1, M.black, 0, 1.5, sz * (D / 2 - 3), 'x', 14))
  for (const sz of [-1, 1]) g.add(rbox(3, 2.2, 3, body, { y: 3, z: sz * (D / 2 - 3) }, 0.3))
  // 各层的瓶子
  const r = rng(11)
  const cols = [SOY, '#d9a441', '#f0d77a', '#c0392b', '#fff3dd', acc, '#7a8b3a']
  ys.forEach((y, li) => {
    const n = li === 3 ? 6 : 4
    for (let i = 0; i < n; i++) {
      const z = -D / 2 + 6 + i * ((D - 12) / (n - 1))
      const c = cols[Math.floor(r() * cols.length)]
      const h = li === 0 ? 17 : li === 3 ? 9 : 14
      const rr = li === 3 ? 2.2 : 3
      g.add(bottle(rr, h, rr * 0.4, h * 0.6, c, { y: y + 0.8, z }))
      g.add(cyl(rr * 0.45, rr * 0.45, 1.2, li % 2 ? acc : M.black, { y: y + 0.8 + h, z }, 10))
    }
  })
  return g
}

/** 可开合部件：把一组部件收进以 at 为原点的 Group（部件位置不变），标上开合动作 */
function pivot(parts: THREE.Object3D[], at: [number, number, number], m: DoorMotion) {
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
/** 平开门：铰链竖线在 (hx, hz)；left = 铰链在门的左边 */
const swingAt = (parts: THREE.Object3D[], hx: number, hz: number, left: boolean) => pivot(parts, [hx, 0, hz], { kind: 'swing', angle: (left ? -1 : 1) * SWING_OPEN })
/** 抽屉：整体往 +z 拉出 dz */
const pullOut = (parts: THREE.Object3D[], dz: number) => pivot(parts, [0, 0, 0], { kind: 'drawer', dz })

/** 食器棚（玻璃门上柜 + 开放台面 + 下柜），宽 W */
export function cupboardShelves(W: number) {
  return { lowTop: 85, upBottom: 125, upMid: 152, top: 180, upD: 32, D: 45, W, lowMid: 36, drawerY: 63 }
}
/** 下柜每列的中心 x 和列宽 */
export function cupboardCols(W: number) {
  const nCol = W >= 100 ? 3 : 2
  const cw = (W - 4) / nCol
  return Array.from({ length: nCol }, (_, i) => ({ x: -W / 2 + 2 + cw * (i + 0.5), cw, i }))
}
export function cupboard(p: string[], W: number) {
  const [body, door, knob] = p
  const k = cupboardShelves(W)
  const g = new THREE.Group()
  const D = k.D
  const inner = shade(body, 0.06)
  // 下柜（空心：背板、两侧、底板、门里一块层板、抽屉下面一块隔板）
  g.add(rbox(W - 2, 6, D - 2, shade(body, -0.15), {}, 0.5))
  g.add(rbox(W - 4, k.lowTop - 8, 1.2, shade(body, -0.06), { y: 6, z: -D / 2 + 0.6 }, 0.3))
  for (const sx of [-1, 1]) g.add(rbox(2, k.lowTop - 8, D, body, { x: sx * (W / 2 - 1), y: 6 }, 0.5))
  g.add(rbox(W - 4, 2, D - 1.2, body, { y: 6, z: 0.6 }, 0.3))
  g.add(rbox(W - 4, 1.6, D - 2.5, inner, { y: k.lowMid - 1.6, z: 0.5 }, 0.3))
  g.add(rbox(W - 4, 1.2, D - 2, body, { y: 61.4, z: 0.5 }, 0.3))
  g.add(rbox(W + 1, 2, D + 1, shade(body, 0.04), { y: k.lowTop - 2 }, 0.6))
  // 抽屉上沿到台面之间的前横档（挡住柜内）
  g.add(rbox(W - 4, k.lowTop - 2 - 77.2, 1, body, { y: 77.2, z: D / 2 - 0.9 }, 0.3))
  // 下柜正面：上排抽屉 + 下排门（把手在哪边，铰链就在另一边）
  for (const { x, cw, i } of cupboardCols(W)) {
    g.add(pullOut([rbox(cw - 1, 14, 0.8, door, { x, y: k.drawerY, z: D / 2 }, 0.5), rbox(6, 1.2, 1.2, knob, { x, y: 69, z: D / 2 + 0.7 }, 0.4), tray(cw - 4, 10, 38, 0.8, inner, { x, y: k.drawerY + 0.3, z: D / 2 - 0.4 - 19 })], 23))
    const ks = i % 2 ? -1 : 1
    g.add(swingAt([rbox(cw - 1, 52, 0.8, door, { x, y: 9, z: D / 2 }, 0.5), rbox(1.2, 8, 1.2, knob, { x: x + ks * (cw / 2 - 4), y: 50, z: D / 2 + 0.7 }, 0.4)], x - ks * (cw / 2 - 0.5), D / 2 - 0.4, ks > 0))
  }
  // 开放台面的背板
  g.add(rbox(W, k.upBottom - k.lowTop, 1.5, shade(body, 0.08), { y: k.lowTop, z: -D / 2 + 0.75 }, 0.3))
  // 上柜：侧板 / 顶 / 底 / 背 / 中层板
  const z0 = -D / 2
  const z1 = z0 + k.upD
  const zc = (z0 + z1) / 2
  for (const sx of [-1, 1]) g.add(rbox(2, k.top - k.upBottom, k.upD, body, { x: sx * (W / 2 - 1), y: k.upBottom, z: zc }, 0.5))
  g.add(rbox(W, 2, k.upD, body, { y: k.top - 2, z: zc }, 0.5))
  g.add(rbox(W - 4, 2, k.upD, body, { y: k.upBottom - 2, z: zc }, 0.3))
  g.add(rbox(W - 4, k.top - k.upBottom - 2, 1, shade(body, 0.08), { y: k.upBottom, z: z0 + 0.5 }, 0.3))
  g.add(rbox(W - 4, 1.5, k.upD - 3, body, { y: k.upMid - 1.5, z: zc - 0.5 }, 0.3))
  // 上柜玻璃门（框 + 玻璃），可以打开
  const nd = W >= 100 ? 3 : 2
  const dw = (W - 4) / nd
  for (let i = 0; i < nd; i++) {
    const x = -W / 2 + 2 + dw * (i + 0.5)
    const zz = z1 + 0.5
    const hh = k.top - k.upBottom - 2
    const ks = i % 2 ? -1 : 1
    const parts: THREE.Object3D[] = [rbox(dw - 0.6, 2.4, 1, door, { x, y: k.upBottom, z: zz }, 0.3), rbox(dw - 0.6, 2.4, 1, door, { x, y: k.upBottom + hh - 2.4, z: zz }, 0.3)]
    for (const s of [-1, 1]) parts.push(rbox(2.4, hh, 1, door, { x: x + s * (dw / 2 - 1.5), y: k.upBottom, z: zz }, 0.3))
    parts.push(glassGhost(rbox(dw - 5, hh - 4.6, 0.3, GLASS, { x, y: k.upBottom + 2.3, z: zz }, 0.1), GLASS, 0.25))
    parts.push(rbox(1, 6, 1, knob, { x: x + ks * (dw / 2 - 3.6), y: k.upBottom + 8, z: zz + 0.9 }, 0.3))
    g.add(swingAt(parts, x - ks * (dw / 2 - 0.3), zz - 0.5, ks > 0))
  }
  // 门把手往前凸 0.8，整体后移让包围盒前后居中
  return PG(g, 0, 0, -0.4)
}
