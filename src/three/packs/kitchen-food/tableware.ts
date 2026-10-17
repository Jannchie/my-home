// 厨房 / 食物素材包的餐具建模
// 只放建模函数和它们用到的常量，素材表在 ../kitchen-food.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus, tray } from '../../toon'
import { PI, cappedTube, hcyl, latheAt, noOutlineDeep, rod3 } from '../../geo'
import { BEER, COFFEE, DISH_IN, FOAM, GLASS, RICE, SOY, STEEL, TAMAGO, TEA, TOMATO, TUBE, bowl, chopsticks, dish, dome, glassGhost, hashioki, liquid } from './common'

// ======================================================================
// 餐具
// ======================================================================

/** 一人份和食器：饭碗 + 汤碗（带盖） + 筷子筷架，摆在餐垫上的位置关系 */
export function washokuSet(p: string[]) {
  const [rice, soup, chop] = p
  const g = new THREE.Group()
  g.add(bowl(5.8, 6, rice, { x: -6, z: 2 }))
  g.add(bowl(6, 6.5, soup, { x: 7, z: 2 }))
  // 漆碗盖（倒扣的浅碗，盖在口沿上）
  const lid = bowl(6.2, 2.4, soup, {}, 0.3, 0.38)
  lid.rotation.x = PI
  lid.position.set(7, 9.2, 2)
  g.add(lid)
  g.add(chopsticks(23, chop, 0, 0.9, -7.2))
  g.add(hashioki(shade(rice, -0.1), 10, 0, -7.2))
  return g
}

/** 筷子 + 筷架（两双） */
export function chopstickPair(p: string[]) {
  const [a, b, rest] = p
  const g = new THREE.Group()
  g.add(chopsticks(23, a, 0, 0.9, -1.5))
  g.add(chopsticks(21, b, -1, 0.9, 2.5))
  g.add(hashioki(rest, 8.5, 0, 0.5))
  return g
}

/** 盘子叠放：n 只，半径 r */
export function plateStack(p: string[], r: number, n: number) {
  const [a, b, rim] = p
  const g = new THREE.Group()
  const h = r > 11 ? 2.8 : 2.2
  for (let i = 0; i < n; i++) {
    g.add(dish(r, h, i % 3 === 1 ? b : a, { y: i * 1.25 }))
    g.add(noOutlineDeep(torus(r - 0.25, 0.12, rim, { y: i * 1.25 + h + 0.05, rx: PI / 2 })))
  }
  return g
}

/** 两层便当盒：open = 打开（盖子靠在旁边、饭菜可见） */
export function bento2(p: string[], open: boolean) {
  const [box, lid, band] = p
  const g = new THREE.Group()
  const W = 17
  const D = 10
  if (!open) {
    g.add(tray(W, 5, D, 0.5, box, {}, 1.4))
    g.add(tray(W, 4.6, D, 0.5, box, { y: 5 }, 1.4))
    g.add(rbox(W + 0.4, 1.4, D + 0.4, lid, { y: 9.6 }, 1.4))
    // 十字绑带
    g.add(rbox(2.4, 11.2, D + 0.8, band, { y: -0.05 }, 0.5))
    g.add(rbox(W + 0.8, 11.2, 2.4, band, { y: -0.05 }, 0.5))
    return g
  }
  // 打开：两层并排摆，盖子放后面
  const x1 = -9.5
  const x2 = 9.5
  g.add(tray(W, 5, D, 0.5, box, { x: x1 }, 1.4))
  g.add(tray(W, 4.6, D, 0.5, box, { x: x2 }, 1.4))
  // 下层：白饭 + 梅干 + 芝麻
  g.add(noOutlineDeep(rbox(W - 1.4, 3.6, D - 1.4, RICE, { x: x1, y: 0.5 }, 0.8)))
  g.add(ball(0.9, '#c8303f', { x: x1, y: 4.1, z: 0 }))
  // 上层：玉子烧、炸鸡、西兰花、小番茄、分隔叶
  g.add(rbox(4, 2.4, 2.6, TAMAGO, { x: x2 - 5, y: 0.5, z: -2.3 }, 0.6))
  g.add(rbox(4, 2.4, 2.6, TAMAGO, { x: x2 - 5, y: 0.5, z: 0.6 }, 0.6))
  for (const [dx, dz] of [
    [-0.5, -2],
    [1.6, -1.6],
    [0.4, 0.4],
  ])
    g.add(ball(1.5, '#c27a34', { x: x2 + dx, y: 2.2, z: dz }, [1.1, 0.8, 1]))
  for (const dz of [-2.4, 0.8]) {
    g.add(ball(1.3, '#4f9e3b', { x: x2 + 5, y: 3, z: dz }))
    g.add(cyl(0.4, 0.5, 2.2, '#8bc46a', { x: x2 + 5, y: 0.5, z: dz }, 8))
  }
  g.add(ball(1.2, TOMATO, { x: x2 + 2.5, y: 1.8, z: 2.6 }))
  g.add(noOutlineDeep(rbox(0.3, 3.4, D - 1.6, '#3f9a4a', { x: x2 + 3.4, y: 0.5 }, 0.1)))
  // 盖子竖靠在后面
  const l = rbox(W + 0.4, 1.4, D + 0.4, lid, {}, 1.4)
  l.position.set(0, (D + 0.4) / 2 + 0.2, -D / 2 - 2)
  l.rotation.x = -PI / 2 + 0.05
  g.add(l)
  return g
}

/** 茶碗蒸杯（带盖 + 托碟 + 木勺） */
export function chawanmushi(p: string[]) {
  const [cupC, saucer, spoon] = p
  const g = new THREE.Group()
  g.add(dish(6.5, 1.4, saucer))
  g.add(cup(3.8, 3, 7, 0.35, cupC, { y: DISH_IN }))
  g.add(noOutlineDeep(cyl(3.4, 3.4, 0.3, '#f5dc8a', { y: DISH_IN + 5.6 }, 20)))
  // 盖子：浅碟倒扣 + 钮
  g.add(dome(4, 1.6, cupC, { y: DISH_IN + 7 }))
  g.add(cyl(0.8, 1, 0.9, cupC, { y: DISH_IN + 8.4 }, 12))
  // 勺
  g.add(rbox(1, 0.3, 7, spoon, { x: 5, y: DISH_IN, z: 1, ry: 0.2 }, 0.1))
  return g
}

/** 酱油碟 + 小酱油壶 */
export function soyDish(p: string[]) {
  const [d, pot, acc] = p
  const g = new THREE.Group()
  g.add(dish(4.5, 1.3, d, { x: -3.5 }))
  g.add(liquid(2.3, DISH_IN + 0.3, SOY, -3.5))
  // 酱油壶
  g.add(latheAt([[0, 0], [2.6, 0], [3, 1.5], [2.8, 5], [1.4, 6.6], [1.2, 7.6], [0, 7.6]], pot, { x: 4.5 }))
  g.add(rod3([6.8, 4, 0], [8.4, 5.6, 0], 0.4, pot, 8))
  g.add(puck(1.6, 1, acc, { x: 4.5, y: 7.4 }))
  return g
}

/** 玻璃杯组（三只不同高度） */
export function glassTumblers(p: string[]) {
  const [g1, drink, coaster] = p
  const g = new THREE.Group()
  const list: [number, number, number, string | null][] = [
    [-6, 12, 3.3, drink],
    [1, 9, 3.6, null],
    [7.5, 7, 3.8, '#f2c94c'],
  ]
  for (const [x, h, r, dr] of list) {
    g.add(puck(r + 1, 0.4, coaster, { x }))
    g.add(glassGhost(cup(r, r * 0.88, h, 0.25, g1, { x, y: 0.4 }), g1, 0.4))
    if (dr) g.add(noOutlineDeep(cyl(r - 0.35, r * 0.88 - 0.3, h * 0.6, dr, { x, y: 0.75 }, 20)))
  }
  return g
}

/** 马克杯架（树形）+ 四只马克杯 */
export function mugTree(p: string[]) {
  const [wood, m1, m2] = p
  const g = new THREE.Group()
  g.add(puck(7, 1.6, wood))
  g.add(cyl(1, 1, 32, wood, { y: 1.6 }, 12))
  g.add(ball(1.4, wood, { y: 33.6 }))
  const mugs = [m1, m2, m1, m2]
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4
    const y = 18 + (i % 2) * 7
    const ax = Math.cos(a)
    const az = Math.sin(a)
    // 枝：从杆上斜伸出，末端微微上翘
    g.add(rod3([0, y, 0], [ax * 7, y + 3, az * 7], 0.4, wood, 8))
    g.add(ball(0.6, wood, { x: ax * 7, y: y + 3, z: az * 7 }))
    // 杯子正立，杯柄（局部 +x）朝杆、挂在枝头上
    const mug = new THREE.Group()
    mug.add(cup(3.8, 3.6, 9, 0.35, mugs[i]))
    mug.add(torus(2.4, 0.55, mugs[i], { x: 3.6, y: 5, rz: -PI / 2 }, PI))
    mug.rotation.y = Math.atan2(az, -ax)
    mug.position.set(ax * 10.6, y + 3 - 0.6 - 7.4, az * 10.6)
    g.add(mug)
  }
  return g
}

/** 葡萄酒杯一对（一只倒了红酒） */
export function wineGlasses(p: string[]) {
  const [gl, wine, base] = p
  const g = new THREE.Group()
  g.add(rbox(20, 0.6, 12, base, {}, 0.3))
  for (const [x, full] of [
    [-5, true],
    [5, false],
  ] as const) {
    const s = new THREE.Group()
    s.add(cyl(3.2, 3.4, 0.4, gl, { y: 0 }, 20))
    s.add(cyl(0.4, 0.4, 9, gl, { y: 0.4 }, 8))
    s.add(latheAt([[0.4, 9.4], [3, 11.5], [4, 15], [3.4, 20], [3.2, 20], [3.75, 15], [2.8, 11.8], [0, 10]], gl))
    glassGhost(s, gl, 0.45)
    if (full) s.add(noOutlineDeep(latheAt([[0, 10.1], [2.7, 11.8], [3.6, 14.2], [0, 14.2]], wine)))
    s.position.set(x, 0.6, 0)
    g.add(s)
  }
  return g
}

/** 啤酒杯（带泡沫）×2 */
export function beerMugs(p: string[]) {
  const [coaster, gl, acc] = p
  const g = new THREE.Group()
  for (const x of [-5, 5]) {
    g.add(puck(4.8, 0.4, coaster, { x }))
    g.add(glassGhost(cup(3.8, 3.6, 15, 0.4, gl, { x, y: 0.4 }), gl, 0.4))
    g.add(noOutlineDeep(cyl(3.4, 3.2, 11, BEER, { x, y: 0.8 }, 20)))
    g.add(puck(3.6, 3, FOAM, { x, y: 11.4 }))
    g.add(glassGhost(torus(2.6, 0.6, gl, { x: x + (x < 0 ? -3.5 : 3.5), y: 8, rx: 0, ry: 0 }, PI), gl, 0.45).rotateZ(x < 0 ? PI / 2 : -PI / 2))
  }
  g.add(noOutlineDeep(rbox(3, 0.3, 3, acc, { x: 0, y: 0, z: 4 }, 0.2)))
  return g
}

/** 热燗套组：德利 + 两只猪口 + 托盘（带一点热气） */
export function tokkuriSet(p: string[]) {
  const [ware, trayC, acc] = p
  const g = new THREE.Group()
  g.add(tray(24, 1.6, 14, 0.6, trayC, {}, 0.5))
  // 德利：中心在 (0, 0.6, 0)
  g.add(latheAt([[0, 0], [3.4, 0], [4, 2], [4, 7], [2, 11], [1.2, 13], [1.6, 14.2], [1.1, 14.4], [0.9, 13.6], [0, 13.6]], ware, { y: 0.6 }))
  g.add(noOutlineDeep(cyl(4.02, 4.02, 1.2, acc, { y: 5.6 }, 24)))
  for (const x of [-7.5, 7.5]) {
    g.add(cup(2.4, 1.5, 3.2, 0.25, ware, { x, y: 0.6, z: 2 }))
    g.add(liquid(2, 3.4, '#fbf3d8', x, 2))
  }
  return g
}

/** 手冲咖啡套组：细口壶 + 滤杯坐在分享壶上 + 咖啡豆袋 */
export function dripSet(p: string[]) {
  const [kettle, dripper, server] = p
  const g = new THREE.Group()
  // 分享壶（玻璃）+ 滤杯
  const sx = -4
  g.add(glassGhost(latheAt([[0, 0], [4.8, 0], [5.2, 2], [5.2, 8], [4.2, 11], [4.2, 12.5], [3.9, 12.5], [3.9, 11], [4.9, 8], [4.9, 2], [0, 0.4]], GLASS), GLASS, 0.4).translateX(sx))
  g.add(noOutlineDeep(cyl(4.7, 4.9, 3.2, COFFEE, { x: sx, y: 0.5 }, 24)))
  g.add(cappedTube([[sx - 5, 9.5, 0], [sx - 7.2, 8, 0], [sx - 7, 4, 0], [sx - 5, 2.5, 0]], 0.5, server, { ...TUBE, seg: 20 }))
  g.add(cup(5.6, 2.4, 6.5, 0.35, dripper, { x: sx, y: 12.5 }))
  g.add(puck(5.2, 0.6, dripper, { x: sx, y: 12.3 }))
  g.add(noOutlineDeep(cup(5.1, 2.2, 6.3, 0.15, '#f4efe4', { x: sx, y: 13 })))
  g.add(noOutlineDeep(cyl(3.8, 3.8, 0.3, COFFEE, { x: sx, y: 16 }, 20)))
  // 细口手冲壶
  const kx = 10
  g.add(latheAt([[0, 0], [5.2, 0], [5.6, 1], [5.6, 9], [4.5, 11.5], [2, 12.5], [0, 12.5]], kettle, { x: kx }))
  g.add(cyl(1.2, 1.4, 1.2, server, { x: kx, y: 12.4 }, 12))
  g.add(cappedTube([[kx - 4.6, 2, 0], [kx - 8.6, 8, 0], [kx - 10.6, 13.6, 0], [kx - 12, 14.6, 0]], 0.42, kettle, { ...TUBE, seg: 24 }))
  g.add(cappedTube([[kx + 5.4, 9.5, 0], [kx + 8.6, 9, 0], [kx + 8.6, 3, 0], [kx + 5.4, 2.5, 0]], 0.7, server, { ...TUBE, seg: 20 }))
  return g
}

/** 急须 + 汤吞两只 + 茶托盘 */
export function kyusuSet(p: string[]) {
  const [pot, cups, trayC] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.4, 17, trayC, {}, 0.6))
  // 急须（侧把手）
  g.add(latheAt([[0, 0], [3.6, 0], [4.8, 2.5], [4.8, 5], [3.6, 7.2], [2.8, 7.4], [0, 7.4]], pot, { x: -7, y: 1.4 }))
  g.add(dome(2.9, 1.4, pot, { x: -7, y: 8.6 }))
  g.add(ball(0.7, pot, { x: -7, y: 10.2 }))
  g.add(rod3([-7 + 4.4, 1.4 + 3.6, 0], [-7 + 7.2, 1.4 + 6.4, 0], 0.7, pot, 8))
  g.add(hcyl(1.1, 1.3, 6, pot, -7, 1.4 + 4, -6, 'z', 12))
  for (const x of [4, 11]) {
    g.add(cup(3, 2.5, 7.6, 0.3, cups, { x, y: 1.4, z: 1 }))
    g.add(liquid(2.6, 1.4 + 6, TEA, x, 1))
  }
  return g
}

/** 餐垫：rect = 长方 / round = 圆形，配一双筷子作参照 */
export function placemat(p: string[], shape: 'rect' | 'round') {
  const [mat, border, chop] = p
  const g = new THREE.Group()
  if (shape === 'rect') {
    g.add(rbox(45, 0.4, 32, mat, {}, 0.15))
    for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(45, 0.08, 1.2, border, { y: 0.4, z: s * 13.5 }, 0.03)))
    for (let i = 0; i < 9; i++) g.add(noOutlineDeep(rbox(0.3, 0.06, 26, shade(mat, -0.06), { x: -20 + i * 5, y: 0.4 }, 0.02)))
  } else {
    g.add(cyl(19, 19, 0.4, mat, {}, 40))
    g.add(noOutlineDeep(torus(17.5, 0.35, border, { y: 0.42, rx: PI / 2 })))
  }
  g.add(chopsticks(23, chop, 0, 0.4, shape === 'rect' ? 11 : 10))
  return g
}

/** 杯垫一叠 + 收纳座 */
export function coasterStack(p: string[]) {
  const [a, b, holder] = p
  const g = new THREE.Group()
  g.add(tray(11.6, 3, 11.6, 0.6, holder, {}, 1))
  for (let i = 0; i < 5; i++) g.add(cyl(5, 5, 0.5, i % 2 ? b : a, { y: 0.6 + i * 0.55 }, 28))
  g.add(cyl(5, 5, 0.5, b, { x: 12, y: 0 }, 28))
  return g
}

/** 刀叉勺收纳盒（四格） */
export function cutleryTray(p: string[]) {
  const [box, div, acc] = p
  const g = new THREE.Group()
  g.add(tray(30, 5, 22, 0.8, box, {}, 0.8))
  for (const x of [-7, 1, 8]) g.add(rbox(0.6, 4.2, 20.4, div, { x, y: 0.8 }, 0.2))
  // 叉、刀、勺（平放在格子里）
  const items: [number, string][] = [
    [-11, 'fork'],
    [-3, 'knife'],
    [4.5, 'spoon'],
    [11.5, 'chop'],
  ]
  for (const [x, k] of items)
    for (let i = 0; i < 2; i++) {
      const xx = x + (i - 0.5) * 2.4
      const y = 0.8 + i * 0.4
      if (k === 'chop') {
        g.add(hcyl(0.18, 0.32, 20, acc, xx, y + 0.35, 0, 'z'))
        continue
      }
      g.add(rbox(1.1, 0.35, 11, STEEL, { x: xx, y, z: 3 }, 0.15))
      if (k === 'fork') g.add(rbox(1.8, 0.35, 5, STEEL, { x: xx, y, z: -5.5 }, 0.15))
      if (k === 'knife') g.add(rbox(1.6, 0.3, 8, STEEL, { x: xx, y, z: -6 }, 0.15))
      if (k === 'spoon') g.add(ball(1.5, STEEL, { x: xx, y: y + 0.35, z: -5.5 }, [1, 0.25, 1.4]))
    }
  return g
}

/** 丼碗（带盖） */
export function donburi(p: string[]) {
  const [b, lid, acc] = p
  const g = new THREE.Group()
  g.add(bowl(8, 7.5, b))
  g.add(noOutlineDeep(torus(7.3, 0.25, acc, { y: 6.4, rx: PI / 2 })))
  const l = bowl(7.6, 2.8, lid, {}, 0.35, 0.36)
  l.rotation.x = PI
  l.position.y = 10.4
  g.add(l)
  return g
}
