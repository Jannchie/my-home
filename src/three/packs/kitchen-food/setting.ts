// 厨房 / 食物素材包的餐桌摆设（组合）建模
// 只放建模函数和它们用到的常量，素材表在 ../kitchen-food.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, rbox, shade, torus, tray } from '../../toon'
import { C, rng, type Fx } from '../../kit'
import { PI, hcyl, lit, noOutlineDeep, rod3 } from '../../geo'
import { J, M } from '../../packkit'
import { BROTH, CRUST, CUCUMBER, DAIKON, DISH_IN, EGG_Y, GLASS, HAKUSAI, KRAFT, MEAT, MISO, NORI, RICE, SALMON, SHIITAKE, SOY, STEEL, TAMAGO, TOFU, TOMATO, TUNA, bottle, bowl, bowlIn, chopsticks, dish, dome, glassGhost, hashioki, liquid, riceMound } from './common'

// ======================================================================
// 餐桌摆设（组合）
// ======================================================================

/** 一人份定食托盘：饭、味噌汤、烤鲑鱼、小钵、渍物、筷子 */
export const TEISHOKU = { w: 42, d: 32, th: 2.2 }
export function teishoku(p: string[]) {
  const [trayC, bowlC, dishC] = p
  const g = new THREE.Group()
  g.add(tray(TEISHOKU.w, TEISHOKU.th, TEISHOKU.d, 0.6, trayC, {}, 0.6))
  const y0 = 0.6
  // 前左：饭
  g.add(bowl(5.6, 5.8, C.white, { x: -11, y: y0, z: 6 }))
  g.add(riceMound(bowlIn(5.6, 5.8, 5), 2.2, y0 + 5))
  ;(g.children[g.children.length - 1] as THREE.Object3D).position.set(-11, y0 + 5, 6)
  // 前右：味噌汤
  g.add(bowl(5.8, 6.2, bowlC, { x: 3, y: y0, z: 6 }))
  g.add(liquid(bowlIn(5.8, 6.2, 5), y0 + 5, MISO, 3, 6))
  for (const [dx, dz] of [
    [-1.2, -1],
    [1.4, 0.8],
  ])
    g.add(noOutlineDeep(rbox(1.2, 0.5, 1.2, TOFU, { x: 3 + dx, y: y0 + 4.7, z: 6 + dz }, 0.15)))
  // 后左：长方盘烤鲑鱼 + 萝卜泥
  g.add(tray(18, 1.6, 9, 0.5, dishC, { x: -8, y: y0, z: -7.5 }, 0.5))
  g.add(rbox(9, 1.8, 5, '#f08a62', { x: -9.5, y: y0 + 0.5, z: -7.5, ry: 0.1 }, 0.9))
  g.add(noOutlineDeep(rbox(8, 0.3, 1, '#c8603e', { x: -9.5, y: y0 + 2.3, z: -7.5, ry: 0.1 }, 0.1)))
  g.add(ball(1.6, DAIKON, { x: -2.5, y: y0 + 1.6, z: -7 }, [1, 0.7, 1]))
  // 后右：小钵（菠菜）
  g.add(bowl(4.2, 4, bowlC, { x: 10, y: y0, z: -7 }))
  g.add(noOutlineDeep(ball(2.6, '#3f8a3a', { x: 10, y: y0 + 3.4, z: -7 }, [1, 0.45, 1])))
  g.add(noOutlineDeep(ball(0.8, '#e8d8a8', { x: 10.3, y: y0 + 4.5, z: -7.2 }, [1, 0.4, 1])))
  // 右前：渍物小碟
  g.add(dish(3.4, 1, dishC, { x: 14.5, y: y0, z: 5 }))
  g.add(noOutlineDeep(rbox(2, 0.6, 1.2, '#f5d547', { x: 14.5, y: y0 + DISH_IN, z: 4.4 }, 0.2)))
  g.add(noOutlineDeep(rbox(1.8, 0.6, 1.1, '#a8467a', { x: 14.5, y: y0 + DISH_IN, z: 5.8 }, 0.2)))
  // 筷子（最前）
  g.add(chopsticks(22, J.dark, -3, y0 + 0.9, 13))
  g.add(hashioki(shade(dishC, -0.1), 8.5, y0, 13))
  return g
}
export const TEISHOKU_FX: Fx[] = [
  { kind: 'steam', x: -11, y: 8.5, z: 6, scale: 0.6, height: 16 },
  { kind: 'steam', x: 3, y: 6.5, z: 6, scale: 0.6, height: 14 },
]

/** 两人晚餐套组（对坐的两份：汉堡排 + 沙拉 + 玻璃杯 + 刀叉，中间一盘面包） */
export function dinnerForTwo(p: string[]) {
  const [plateC, mat, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const set = new THREE.Group()
    set.add(rbox(40, 0.3, 28, mat, {}, 0.1))
    set.add(dish(12, 2.4, plateC, { y: 0.3 }))
    set.add(ball(4.2, '#7a3e22', { x: -1.5, y: 0.3 + DISH_IN + 1.2, z: 1 }, [1.2, 0.42, 0.9]))
    set.add(noOutlineDeep(ball(3.6, '#5a2416', { x: -1.5, y: 0.3 + DISH_IN + 1.8, z: 1 }, [1.15, 0.25, 0.85])))
    set.add(ball(1.4, '#f08a3c', { x: 5, y: 0.3 + DISH_IN + 0.8, z: 2.5 }, [1.3, 0.6, 0.8]))
    set.add(ball(1.6, '#4f9e3b', { x: 5, y: 0.3 + DISH_IN + 1.3, z: -2.5 }))
    // 刀叉
    set.add(rbox(1, 0.3, 18, STEEL, { x: -15.5, y: 0.3, z: 0 }, 0.12))
    set.add(rbox(2, 0.3, 4, STEEL, { x: -15.5, y: 0.3, z: -9 }, 0.12))
    set.add(rbox(1.2, 0.3, 19, STEEL, { x: 15.5, y: 0.3, z: 0 }, 0.12))
    // 沙拉小碗 + 玻璃杯
    set.add(bowl(4.5, 4, acc, { x: 12, y: 0.3, z: -9 }))
    set.add(noOutlineDeep(ball(3.4, '#8fcf6a', { x: 12, y: 3.7, z: -9 }, [1, 0.4, 1])))
    set.add(noOutlineDeep(ball(0.9, TOMATO, { x: 13, y: 4.6, z: -8.5 })))
    set.add(glassGhost(cup(3.4, 3, 11, 0.25, GLASS, { x: -12, y: 0.3, z: -9 })))
    set.add(noOutlineDeep(cyl(3, 2.7, 6, '#fff3d0', { x: -12, y: 0.6, z: -9 }, 18)))
    set.position.z = s * 17
    set.rotation.y = s > 0 ? 0 : PI
    g.add(set)
  }
  // 中间：面包篮 + 烛台
  g.add(tray(14, 4, 9, 0.5, KRAFT, { x: -9, y: 0, z: 0 }, 0.8))
  for (const dx of [-3, 0, 3]) g.add(capsule(1.8, 3, CRUST, { x: -9 + dx, y: 2.5, z: 0 }).rotateZ(PI / 2))
  g.add(cyl(2.2, 2.6, 1.2, acc, { x: 10, y: 0 }, 16))
  g.add(cyl(1.1, 1.1, 10, C.cream, { x: 10, y: 1.2 }, 12))
  return g
}

/** 火锅：卡式炉 + 土锅（打开，满满的料），中心有热气 */
const NABE_TOP = 10 + 1.4 + 11
export function nabeSet(p: string[]) {
  const [stove, pot, acc] = p
  const g = new THREE.Group()
  // 卡式炉：本体 36 × 30 × 10
  g.add(rbox(36, 9, 30, stove, {}, 1.4))
  g.add(rbox(34, 1, 28, shade(stove, -0.12), { y: 9 }, 0.5))
  g.add(hcyl(2, 2, 1.6, M.black, -11, 4.5, 15.3, 'z', 16))
  g.add(noOutlineDeep(rbox(10, 3, 0.3, shade(stove, -0.25), { x: 6, y: 3, z: 15.05 }, 0.3)))
  // 炉架 + 蓝火
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    g.add(rod3([Math.cos(a) * 6, 10, Math.sin(a) * 6], [Math.cos(a) * 11, 11.4, Math.sin(a) * 11], 0.5, M.black, 8))
  }
  g.add(lit(torus(3.5, 0.6, '#5fa8ff', { y: 10.4, rx: PI / 2 }), '#5fa8ff', 0.8))
  // 土锅
  const y = 11.4
  g.add(cup(14, 9, 11, 1, pot, { y }))
  for (const s of [-1, 1]) g.add(rbox(4, 2.2, 5, pot, { x: s * 14.6, y: y + 7.6 }, 0.9))
  g.add(noOutlineDeep(torus(13.4, 0.35, acc, { y: y + 8, rx: PI / 2 })))
  // 汤面 + 料
  const top = y + 9
  g.add(liquid(12.4, top, BROTH))
  const r = rng(4)
  // 白菜、香菇、豆腐、肉、葱、胡萝卜花
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    g.add(rbox(4.5, 1.2, 2.4, HAKUSAI, { x: Math.cos(a) * 8.5, y: top - 0.6, z: Math.sin(a) * 8.5, ry: -a }, 0.5))
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4
    g.add(rbox(3, 1.6, 3, TOFU, { x: Math.cos(a) * 5, y: top - 0.8, z: Math.sin(a) * 5, ry: r() }, 0.3))
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 1.1
    g.add(dome(1.8, 1, SHIITAKE, { x: Math.cos(a) * 3.4, y: top, z: Math.sin(a) * 3.4 }))
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.2
    g.add(rbox(3.6, 0.5, 2.4, MEAT, { x: Math.cos(a) * 9.8, y: top, z: Math.sin(a) * 9.8, ry: -a + 0.6 }, 0.2))
  }
  g.add(noOutlineDeep(cyl(1.3, 1.3, 0.5, '#f08a3c', { y: top, z: 0 }, 5)))
  return g
}
export const NABE_FX: Fx[] = [{ kind: 'steam', x: 0, y: NABE_TOP - 1.6, z: 0, scale: 1.6, height: 32 }]

/** 章鱼烧派对：电烤盘（16 孔，正在烤） + 一盘烤好的章鱼烧 + 酱汁 */
export function takoParty(p: string[]) {
  const [base, plateC, acc] = p
  const g = new THREE.Group()
  // 烤盘本体
  const bx = -9
  g.add(rbox(28, 6, 28, base, { x: bx }, 1.4))
  g.add(rbox(24, 1.8, 24, '#3a3a3c', { x: bx, y: 6 }, 0.6))
  g.add(hcyl(1.6, 1.6, 1.4, '#f2f2f2', bx + 9, 3, 14.5, 'z', 12))
  for (let i = 0; i < 16; i++) {
    const x = bx - 8.1 + (i % 4) * 5.4
    const z = -8.1 + Math.floor(i / 4) * 5.4
    g.add(ball(2.15, i % 3 === 0 ? '#f3d48a' : '#d9a050', { x, y: 7.6, z }))
  }
  // 成品一盘
  const px = 13
  const pl = tray(14, 1.6, 20, 0.4, plateC, { x: px }, 0.4)
  g.add(pl)
  for (let i = 0; i < 6; i++) {
    const x = px - 3 + (i % 2) * 6
    const z = -6 + Math.floor(i / 2) * 6
    g.add(ball(2.3, '#c98a3c', { x, y: 2.6, z }))
    g.add(noOutlineDeep(ball(2, '#5a2e1c', { x, y: 3.5, z }, [1, 0.35, 1])))
    g.add(noOutlineDeep(rbox(1.2, 0.2, 0.4, '#7cc46a', { x: x + 0.4, y: 4.6, z, ry: i }, 0.05)))
  }
  // 牙签 + 酱汁瓶
  g.add(rod3([px + 2, 3, 0], [px + 4, 9, 1], 0.12, C.woodL, 8))
  g.add(bottle(2.2, 13, 0.9, 8, acc, { x: px, y: 0, z: 13.5 }))
  g.add(cyl(0.95, 0.4, 2.4, acc, { x: px, y: 13, z: 13.5 }, 10))
  return g
}

/** 铁板烧：电烤盘上的大阪烧 + 两把铲 + 酱料刷 */
export function okonomiyakiGrill(p: string[]) {
  const [body, handle, acc] = p
  const g = new THREE.Group()
  const W = 50
  const D = 32
  g.add(rbox(W, 5, D, body, {}, 1.4))
  g.add(tray(W - 4, 1.6, D - 4, 0.6, '#3a3a3c', { y: 5 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(6, 2.4, 3, handle, { x: s * (W / 2 + 2.2), y: 3.6 }, 0.9))
  g.add(hcyl(1.6, 1.6, 1.2, '#f2f2f2', -W / 2 + 6, 2.5, D / 2 + 0.5, 'z', 12))
  // 两张大阪烧
  for (const [x, z, r] of [
    [-10, 0, 9],
    [11, -2, 7.5],
  ] as const) {
    g.add(cyl(r, r, 2, '#d9a050', { x, y: 5.6, z }, 28))
    g.add(noOutlineDeep(cyl(r - 0.6, r - 0.6, 0.3, '#5a2e1c', { x, y: 7.6, z }, 28)))
    for (let i = 0; i < 4; i++) g.add(noOutlineDeep(rbox(r * 1.5, 0.12, 0.5, '#fff5c8', { x, y: 7.95, z: z - r * 0.5 + i * r * 0.33 }, 0.05)))
    for (let i = 0; i < 8; i++) g.add(noOutlineDeep(rbox(0.9, 0.15, 0.6, '#f4b8c0', { x: x + Math.cos(i * 2.3) * r * 0.5, y: 8.05, z: z + Math.sin(i * 2.3) * r * 0.5, ry: i }, 0.05)))
  }
  // 小铲
  for (const s of [-1, 1]) {
    g.add(rbox(6, 0.3, 4.5, STEEL, { x: s * 4 + 2, y: 5.7, z: 11, ry: s * 0.3 }, 0.1))
    g.add(rbox(1.3, 1.3, 7, acc, { x: s * 4 + 2 + s * 1.2, y: 6.2, z: 16, ry: s * 0.3 }, 0.4))
  }
  return g
}
export const OKONOMI_FX: Fx[] = [{ kind: 'steam', x: 0, y: 8.5, z: -1, scale: 1.2, height: 22 }]

/** 手卷寿司派对：寿司桶 + 海苔 + 配料拼盘 + 酱油碟 */
export function temakiParty(p: string[]) {
  const [wood, plateC, acc] = p
  const g = new THREE.Group()
  // 饭桶（白饭）
  g.add(cup(13, 12, 7, 0.9, wood, { x: -14 }))
  g.add(noOutlineDeep(torus(12.6, 0.35, shade(wood, -0.3), { x: -14, y: 2, rx: PI / 2 })))
  g.add(noOutlineDeep(cyl(12, 12, 0.4, RICE, { x: -14, y: 5.2 }, 32)))
  g.add(rbox(4, 0.5, 8, C.woodL, { x: -12, y: 5.6, z: 2, ry: 0.4 }, 0.2))
  // 配料长盘
  g.add(tray(26, 1.6, 18, 0.5, plateC, { x: 13, z: -2 }, 0.6))
  const items: [string, number][] = [
    [SALMON, -8],
    [TUNA, -3],
    [TAMAGO, 2],
    [CUCUMBER, 7],
  ]
  for (const [c, dx] of items)
    for (let i = 0; i < 4; i++) g.add(rbox(4, 1, 1.4, c, { x: 13 + dx, y: 0.5 + i * 0.05, z: -8 + i * 1.8, ry: 0.2 }, 0.3))
  g.add(noOutlineDeep(ball(2.4, '#ff6a3c', { x: 13 - 6, y: 1.1, z: 3.5 }, [1, 0.35, 1])))
  g.add(noOutlineDeep(ball(2.2, '#4f9e5b', { x: 13 + 1, y: 1, z: 3.5 }, [1, 0.12, 1.4])))
  g.add(noOutlineDeep(ball(2, '#f6e9c8', { x: 13 + 7, y: 1, z: 3.5 }, [1, 0.4, 1])))
  // 海苔一叠
  for (let i = 0; i < 4; i++) g.add(rbox(10, 0.15, 10, NORI, { x: -4, y: i * 0.16, z: 13, ry: i * 0.08 }, 0.05))
  // 酱油碟 + 小碗山葵
  g.add(dish(4, 1.2, acc, { x: 10, z: 13 }))
  g.add(liquid(2, DISH_IN + 0.3, SOY, 10, 13))
  g.add(dish(3, 1, acc, { x: 18, z: 13 }))
  g.add(noOutlineDeep(ball(1, '#a6c95a', { x: 18, y: DISH_IN + 0.3, z: 13 }, [1, 0.6, 1])))
  return g
}

/** 寿喜烧：铸铁浅锅（带料）+ 两只蛋液碗 */
export function sukiyaki(p: string[]) {
  const [pan, bowlC, acc] = p
  const g = new THREE.Group()
  g.add(cup(14, 13, 5, 0.6, pan))
  for (const s of [-1, 1]) g.add(rbox(4, 1.6, 4, pan, { x: s * 15, y: 3.4 }, 0.6))
  const top = 4
  g.add(liquid(13, top - 0.6, '#6a3a1c'))
  // 牛肉片、豆腐、葱段、香菇、魔芋丝、春菊
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = ball(3.4, '#b5654f', { x: Math.cos(a) * 8, y: top - 0.6, z: Math.sin(a) * 8 }, [1.3, 0.12, 0.8])
    m.rotation.y = -a
    g.add(m)
  }
  for (let i = 0; i < 3; i++) g.add(rbox(3.4, 1.8, 3.4, '#e8c58a', { x: -2 + i * 3.6, y: top - 1.4, z: -2 }, 0.3))
  for (let i = 0; i < 4; i++) g.add(hcyl(0.9, 0.9, 4, '#f4f4e6', -3 + i * 2.4, top - 0.5, 3, 'x', 10))
  g.add(dome(1.8, 1, SHIITAKE, { x: 4, y: top - 0.6, z: 3 }))
  g.add(noOutlineDeep(ball(2.4, '#3f8a3a', { x: -6, y: top - 0.4, z: 2 }, [1, 0.35, 1])))
  // 蛋液碗两只（放在锅前两边）
  for (const s of [-1, 1]) {
    g.add(bowl(4, 4, bowlC, { x: s * 11, z: 18 }))
    g.add(liquid(bowlIn(4, 4, 3), 3, EGG_Y, s * 11, 18))
  }
  g.add(chopsticks(22, acc, 0, 0, 23))
  return g
}
export const SUKI_FX: Fx[] = [{ kind: 'steam', x: 0, y: 5, z: 0, scale: 1.3, height: 26 }]
