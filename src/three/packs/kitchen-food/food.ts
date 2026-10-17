// 厨房 / 食物素材包的食物、饮料建模
// 只放建模函数和它们用到的常量，素材表在 ../kitchen-food.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../../toon'
import { G, rng, type Fx } from '../../kit'
import { PI, cappedTube, hcyl, noOutlineDeep, rod3, type V3 } from '../../geo'
import { BREAD, BROTH, CHOCO, CRUST, CUCUMBER, CURRY, DAIKON, DISH_IN, GLASS, HAKUSAI, LEAF, MISO, NEGI, NOODLE, NORI, ONION, PG, POTATO, RICE, SALMON, SOY, STEEL, TAMAGO, TEA, TOFU, TUBE, TUNA, arc, bottle, bowl, bowlIn, can, chopsticks, dish, glassGhost, hashioki, liquid, riceMound } from './common'

// ======================================================================
// 食物 / 饮料
// ======================================================================

/** 一碗白饭（冒热气） */
export function riceBowl(p: string[]) {
  const [b, , chop] = p
  const g = new THREE.Group()
  g.add(bowl(5.8, 6, b))
  g.add(riceMound(bowlIn(5.8, 6, 5.2), 2.4, 5.2))
  g.add(hashioki(shade(b, -0.12), 0, 0, 7.4, PI / 2))
  g.add(PG(chopsticks(22, chop, 0, 0, 0), 0, 0.9, 7.4))
  return g
}
export const RICE_FX: Fx[] = [{ kind: 'steam', x: 0, y: 8, z: 0, scale: 0.7, height: 18 }]

/** 味噌汤（漆碗，豆腐 + 海带芽 + 葱） */
export function misoSoup(p: string[]) {
  const [b, inner] = p
  const g = new THREE.Group()
  g.add(bowl(6, 6.5, b))
  g.add(noOutlineDeep(bowl(5.62, 6.1, inner, { y: 0.06 }, 0.1)))
  const top = 5.3
  g.add(liquid(bowlIn(6, 6.5, top), top, MISO))
  for (const [x, z] of [
    [-1.5, -1],
    [1.2, 1.4],
    [1.8, -1.6],
  ])
    g.add(noOutlineDeep(rbox(1.3, 0.6, 1.3, TOFU, { x, y: top - 0.4, z }, 0.15)))
  for (const [x, z] of [
    [-1.6, 1.8],
    [0.2, 0],
  ])
    g.add(noOutlineDeep(ball(1, '#2f5a2a', { x, y: top, z }, [1.2, 0.15, 0.7])))
  for (let i = 0; i < 6; i++) g.add(noOutlineDeep(cyl(0.3, 0.3, 0.25, NEGI, { x: -2.5 + i, y: top, z: 2.6 - (i % 3) }, 8)))
  return g
}
export const MISO_FX: Fx[] = [{ kind: 'steam', x: 0, y: 6.5, z: 0, scale: 0.7, height: 16 }]

/** 狐狸乌冬 */
export function kitsuneUdon(p: string[]) {
  const [b, , acc] = p
  const g = new THREE.Group()
  g.add(bowl(9.5, 8, b))
  g.add(noOutlineDeep(torus(9, 0.3, acc, { y: 7.2, rx: PI / 2 })))
  const top = 6.6
  g.add(liquid(bowlIn(9.5, 8, top), top, BROTH))
  // 粗面条
  for (let i = 0; i < 7; i++) g.add(noOutlineDeep(cappedTube(arc([0, top - 0.1, 0], 2 + i * 0.75, 0.3 * i, 0.3 * i + 2.2, 6, 'xz'), 0.4, '#fbf3df', { ...TUBE, seg: 16 })))
  // 油豆腐皮
  g.add(rbox(7, 1, 5, '#d99a45', { x: -1.5, y: top - 0.4, z: -1.5, ry: 0.3 }, 0.5))
  g.add(rbox(6, 1, 4.5, '#cf8d3c', { x: 2.5, y: top - 0.3, z: 1.5, ry: -0.4 }, 0.5))
  // 鱼板 + 葱
  g.add(cyl(1.8, 1.8, 0.6, '#ffffff', { x: 3.5, y: top - 0.2, z: -3.5 }, 16))
  g.add(noOutlineDeep(cyl(1.2, 1.2, 0.62, '#ff9db0', { x: 3.5, y: top - 0.2, z: -3.5 }, 16)))
  for (let i = 0; i < 6; i++) g.add(noOutlineDeep(cyl(0.35, 0.35, 0.3, NEGI, { x: -4 + i * 0.8, y: top + 0.5, z: 3.5 - (i % 2) }, 8)))
  return g
}
export const UDON_FX: Fx[] = [{ kind: 'steam', x: 0, y: 8, z: 0, scale: 1, height: 20 }]

/** 咖喱饭（椭圆深盘 + 勺） */
export function curryRice(p: string[]) {
  const [d, rim, spoon] = p
  const g = new THREE.Group()
  const dd = dish(13, 3.2, d)
  dd.scale.z = 0.72
  g.add(dd)
  const ring = noOutlineDeep(torus(12.7, 0.2, rim, { y: 3.25, rx: PI / 2 }))
  ring.scale.y = 0.72 // 圆环转平后，局部 y 对应世界 z
  g.add(ring)
  // 饭在左、咖喱在右
  const rice = riceMound(5.5, 2.6, DISH_IN, RICE, -4, 0)
  rice.scale.z = 1.25
  g.add(rice)
  const roux = noOutlineDeep(cyl(6.2, 6.6, 0.8, CURRY, { x: 3.5, y: DISH_IN }, 28))
  roux.scale.z = 0.95
  g.add(roux)
  for (const [x, z, c] of [
    [3, -2, '#f08a3c'],
    [5.5, 1.5, '#e9d8a6'],
    [2, 2.5, '#a8683a'],
    [6.5, -1.8, '#e9d8a6'],
  ] as const)
    g.add(rbox(1.6, 1.2, 1.6, c, { x, y: DISH_IN + 0.5, z, ry: x }, 0.4))
  g.add(noOutlineDeep(rbox(0.8, 0.4, 2.2, '#e14b4b', { x: -6.5, y: DISH_IN + 1.2, z: 2.5 }, 0.15)))
  // 勺子斜放在盘沿
  g.add(rbox(1.2, 0.35, 12, spoon, { x: 9, y: 2.6, z: 1, ry: 0.25, rx: 0.12 }, 0.15))
  return g
}

/** 寿司桶（手卷 / 散寿司） */
export function sushiOke(p: string[]) {
  const [wood, band, acc] = p
  const g = new THREE.Group()
  g.add(cup(15, 14, 7, 0.9, wood))
  for (const y of [1.6, 5]) g.add(noOutlineDeep(torus(14.4 + (y > 3 ? 0.4 : 0), 0.35, band, { y, rx: PI / 2 })))
  const top = 5.6
  g.add(noOutlineDeep(cyl(13.8, 13.8, 0.4, RICE, { y: top - 0.4 }, 32)))
  // 散寿司：蛋丝、三文鱼、鲔鱼、黄瓜、虾、紫苏
  const r = rng(3)
  const tops = [SALMON, TUNA, TAMAGO, CUCUMBER, '#ff8a5c', '#f5c542']
  for (let i = 0; i < 26; i++) {
    const a = r() * PI * 2
    const d = Math.sqrt(r()) * 11.5
    const c = tops[i % tops.length]
    g.add(rbox(2.4, 0.7, 1.6, c, { x: Math.cos(a) * d, y: top - 0.1, z: Math.sin(a) * d, ry: r() * PI }, 0.3))
  }
  for (let i = 0; i < 18; i++) {
    const a = r() * PI * 2
    const d = Math.sqrt(r()) * 12
    g.add(noOutlineDeep(ball(0.4, '#ff6a3c', { x: Math.cos(a) * d, y: top + 0.5, z: Math.sin(a) * d })))
  }
  g.add(noOutlineDeep(ball(2.2, acc, { x: -3, y: top + 0.1, z: 4 }, [1, 0.12, 1.4])))
  return g
}

/** 饭团三个（竹叶上） */
export function onigiriTrio(p: string[]) {
  const [leaf, , acc] = p
  const g = new THREE.Group()
  g.add(noOutlineDeep(ball(11, leaf, { y: 0.3 }, [1.15, 0.03, 0.6])))
  const fills = ['#e14b4b', SALMON, acc]
  for (let i = 0; i < 3; i++) {
    const x = -7 + i * 7
    const o = new THREE.Group()
    // 三角饭团：压扁的圆角三棱柱用三个球 + 中心盒近似
    const shape = new THREE.Shape()
    const s = 3.4
    shape.moveTo(0, s * 1.6)
    shape.quadraticCurveTo(s * 0.3, s * 1.9, s * 0.6, s * 1.5)
    shape.lineTo(s * 1.3, s * 0.3)
    shape.quadraticCurveTo(s * 1.5, -0.1, s * 1.0, 0)
    shape.lineTo(-s * 1.0, 0)
    shape.quadraticCurveTo(-s * 1.5, -0.1, -s * 1.3, s * 0.3)
    shape.lineTo(-s * 0.6, s * 1.5)
    shape.quadraticCurveTo(-s * 0.3, s * 1.9, 0, s * 1.6)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 3 })
    geo.translate(0, 0, -1.2)
    const m = new THREE.Mesh(geo, toon(RICE))
    m.castShadow = true
    o.add(m)
    // 海苔
    o.add(rbox(3.6, 3.2, 4, NORI, { y: -0.3 }, 0.3))
    // 顶上露馅
    o.add(noOutlineDeep(ball(0.8, fills[i], { y: s * 1.2, z: 1.85 }, [1, 1, 0.3])))
    o.position.set(x, 0.65, 0)
    o.rotation.y = (i - 1) * 0.25
    g.add(o)
  }
  return g
}

/** 袋装吐司（六片装） */
export function breadBag(p: string[]) {
  const [bag, tie, lab] = p
  const g = new THREE.Group()
  // 面包：截面方形带圆顶
  const loaf = new THREE.Group()
  loaf.add(rbox(11, 9, 22, CRUST, {}, 1.4))
  const top = hcyl(5.5, 5.5, 22, CRUST, 0, 9, 0, 'z', 20)
  top.scale.x = 1
  loaf.add(top)
  loaf.add(noOutlineDeep(rbox(10, 9.5, 0.3, BREAD, { y: 0.5, z: 11.05 }, 0.8)))
  g.add(loaf)
  // 袋子（半透明）+ 扎口 + 标签
  g.add(glassGhost(rbox(12.4, 15.6, 24, bag, { y: -0.2 }, 2.4), bag, 0.35))
  g.add(noOutlineDeep(rbox(12.5, 6, 10, lab, { y: 3.5, z: -2 }, 0.6)))
  g.add(ball(2, bag, { y: 7.5, z: -13.5 }, [1, 1, 0.8]))
  g.add(rbox(3, 1, 1.4, tie, { y: 7, z: -12.6 }, 0.3))
  return g
}

/** 吐司切片配黄油（木盘） */
export function toastPlate(p: string[]) {
  const [board, , acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 1.4, 16, board, {}, 0.5))
  for (const [x, y, ry] of [
    [-4.5, 1.4, 0.15],
    [4, 1.4, -0.2],
  ] as const) {
    const s = new THREE.Group()
    s.add(rbox(9.6, 1.4, 10, '#e2a865', {}, 1))
    s.add(noOutlineDeep(rbox(8.4, 0.3, 8.8, '#f3c47c', { y: 1.3 }, 0.6)))
    s.add(ball(4.8, '#e2a865', { y: 0.7, z: -4.2 }, [1, 0.15, 0.5]))
    s.position.set(x, y, 0)
    s.rotation.y = ry
    g.add(s)
  }
  g.add(rbox(2.6, 1.2, 2, '#fff1b0', { x: 4, y: 3.1, z: 0.5, ry: 0.3 }, 0.4))
  g.add(rbox(1.2, 0.3, 9, acc, { x: 10, y: 1.4, z: 1, ry: 0.15 }, 0.15))
  return g
}

/** 法棍（纸袋里两根） */
export function baguettes(p: string[]) {
  const [bag, stripe] = p
  const g = new THREE.Group()
  g.add(tray(14, 30, 8, 0.25, bag, {}, 0.2))
  for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(14.1, 1.4, 8.1, stripe, { y: 8 + s * 3 }, 0.1)))
  for (const [x, ry, h] of [
    [-3, 0.05, 62],
    [3, -0.06, 56],
  ] as const) {
    const b = G(capsule(2.8, h - 5.6, CRUST))
    // 表面的割纹
    for (let i = 0; i < 5; i++) b.add(noOutlineDeep(rbox(2.2, 0.4, 0.4, '#f0c98a', { y: h - 26 + i * 5, z: 2.55, rz: 0.5 }, 0.1)))
    b.position.set(x, 0.3, 0)
    b.rotation.z = ry
    g.add(b)
  }
  return g
}

/** 甜甜圈盒（打开，六个） */
export function donutBox(p: string[]) {
  const [box, lid, acc] = p
  const g = new THREE.Group()
  g.add(tray(30, 6, 20, 0.4, box, {}, 0.3))
  // 盒盖竖着打开在后面
  const l = rbox(30, 0.4, 20, lid, {}, 0.2)
  l.position.set(0, 6 + 10 - 0.4, -10 - 0.2)
  l.rotation.x = -PI / 2 + 0.08
  g.add(l)
  const glaze = ['#f7a8c4', CHOCO, '#fff3e0', '#f2c94c', acc, '#e3b87a']
  for (let i = 0; i < 6; i++) {
    const x = -9.5 + (i % 3) * 9.5
    const z = -4.5 + Math.floor(i / 3) * 9
    g.add(torus(2.6, 1.6, '#e2a865', { x, y: 2.1, z, rx: PI / 2 }))
    const t = torus(2.6, 1.62, glaze[i], { x, y: 2.5, z, rx: PI / 2 })
    t.scale.z = 0.7
    g.add(t)
    if (i % 2 === 0) for (let k = 0; k < 5; k++) g.add(noOutlineDeep(rbox(0.9, 0.3, 0.3, ['#ff5a6e', '#4fb7e8', '#ffd84d', '#7ed37a', '#ffffff'][k], { x: x + Math.cos(k * 1.3) * 2.6, y: 3.6, z: z + Math.sin(k * 1.3) * 2.6, ry: k }, 0.1)))
  }
  return g
}

/** 苹果三个（木盘） */
export function apples(p: string[]) {
  const [d, , acc] = p
  const g = new THREE.Group()
  g.add(dish(10, 2, d))
  const pos: V3[] = [
    [-3.5, 0, -2],
    [3.5, 0, -1.5],
    [0, 0, 3.5],
  ]
  for (const [x, , z] of pos) {
    const c = x > 3 ? '#9cc24a' : acc
    g.add(ball(4, c, { x, y: DISH_IN + 3.7, z }, [1, 0.92, 1]))
    g.add(rod3([x, DISH_IN + 7, z], [x + 0.3, DISH_IN + 8.6, z], 0.25, '#6e4f37', 8))
    if (x < 0) g.add(ball(1.2, LEAF, { x: x + 1, y: DISH_IN + 8, z }, [1, 0.2, 0.5]))
  }
  return g
}

/** 一串香蕉（挂在香蕉架上 / 平放） */
export function bananas(p: string[]) {
  const [stand, , acc] = p
  const g = new THREE.Group()
  g.add(puck(8, 1.4, stand))
  g.add(cyl(0.8, 0.8, 30, stand, { y: 1.4 }, 10))
  g.add(cappedTube(arc([5, 31, 0], 5, PI, 0, 10, 'xy'), 0.6, stand, { ...TUBE, seg: 24 }))
  // 香蕉：从钩下垂的一束弯条
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.55
    const pts: V3[] = []
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      const y = 27 - t * 15
      const out = Math.sin(t * PI * 0.85) * 5 + t * 2.5
      pts.push([9.5 + Math.cos(a) * out * 0.7, y + t * t * 7, Math.sin(a) * out * 1.3])
    }
    g.add(cappedTube(pts, 1.5, '#ffd84d', { ...TUBE, seg: 24 }))
    g.add(ball(0.6, '#5a4630', { x: pts[8][0], y: pts[8][1], z: pts[8][2] }))
  }
  g.add(cyl(1.2, 1, 5.6, acc, { x: 9.5, y: 25.5 }, 10))
  return g
}

/** 橘子纸箱（打开，满满一箱） */
export function mikanBox(p: string[]) {
  const [card, print, acc] = p
  const g = new THREE.Group()
  g.add(tray(36, 15, 26, 0.5, card, {}, 0.2))
  // 箱盖四片打开外翻
  for (const s of [-1, 1]) {
    const f = rbox(36, 0.4, 12, card, {}, 0.1)
    f.position.set(0, 15 + Math.sin(0.9) * 6, s * (13 + Math.cos(0.9) * 6))
    f.rotation.x = -s * 0.9
    g.add(f)
  }
  g.add(noOutlineDeep(rbox(16, 6, 0.3, print, { y: 4, z: 13.05 }, 0.3)))
  const r = rng(5)
  for (let i = 0; i < 24; i++) {
    const x = -14 + (i % 6) * 5.6 + (r() - 0.5)
    const z = -9 + Math.floor(i / 6) * 6 + (r() - 0.5)
    g.add(ball(3, acc, { x, y: 12.4 + (r() - 0.5) * 0.6, z }, [1, 0.85, 1]))
    if (i % 3 === 0) g.add(noOutlineDeep(cyl(0.5, 0.5, 0.3, LEAF, { x, y: 14.9, z }, 8)))
  }
  return g
}

/** 半个西瓜（切面朝上） */
export function watermelonHalf(p: string[]) {
  const [rind, flesh, d] = p
  const g = new THREE.Group()
  g.add(dish(14, 2, d))
  const R0 = 11
  const m = new THREE.Mesh(new THREE.SphereGeometry(R0, 28, 12, 0, PI * 2, PI / 2, PI / 2), toon(rind))
  m.position.y = DISH_IN + R0 * 0.82
  m.scale.y = 0.82
  m.castShadow = true
  g.add(m)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    const s = cappedTube(arc([0, DISH_IN + R0 * 0.82, 0], R0 + 0.05, -PI / 2 + 0.25, -0.02, 6, 'yz').map(([, y, z]): V3 => [z * Math.sin(a), DISH_IN + R0 * 0.82 + (y - DISH_IN - R0 * 0.82) * 0.82, z * Math.cos(a)]), 0.35, shade(rind, -0.2), { ...TUBE, seg: 12 })
    g.add(noOutlineDeep(s))
  }
  const top = DISH_IN + R0 * 0.82
  g.add(cyl(R0, R0, 0.4, '#f4f7dc', { y: top }, 32))
  g.add(noOutlineDeep(cyl(R0 - 1, R0 - 1, 0.42, flesh, { y: top + 0.02 }, 32)))
  const r = rng(9)
  for (let i = 0; i < 22; i++) {
    const a = r() * PI * 2
    const dd = 2 + Math.sqrt(r()) * 7
    g.add(noOutlineDeep(ball(0.35, '#2b2020', { x: Math.cos(a) * dd, y: top + 0.42, z: Math.sin(a) * dd }, [1, 0.3, 1.5])))
  }
  return g
}

/** 一串葡萄（玻璃盘） */
export function grapes(p: string[]) {
  const [d, , berry] = p
  const g = new THREE.Group()
  g.add(dish(9, 1.6, d))
  // 葡萄串横躺在盘里：从 -x（梗）到 +x（尖）逐渐变细的圆锥，一圈一圈排果粒
  const rings: [number, number, number][] = [
    [-4, 2.2, 6],
    [-1.8, 2.1, 6],
    [0.4, 1.7, 5],
    [2.6, 1.2, 4],
    [4.4, 0, 1],
  ]
  const cy = DISH_IN + 2.6
  rings.forEach(([x, rr, n], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + ri * 0.5
      const y = cy + Math.sin(a) * rr * 0.55
      g.add(ball(1.3, berry, { x, y: Math.max(DISH_IN + 1.3, y), z: Math.cos(a) * rr }, [1, 1.1, 1]))
    }
  })
  g.add(ball(1.3, berry, { x: -2.9, y: cy + 1.4, z: 0 }, [1, 1.1, 1]))
  g.add(rod3([-5.5, cy + 0.8, 0], [-7.2, cy + 1.8, 0.5], 0.35, '#6e5a3a', 8))
  return g
}

/** 蔬菜篮：白萝卜 + 葱 + 白菜（竹篮） */
export function vegBasket(p: string[]) {
  const [basket, rim] = p
  const g = new THREE.Group()
  g.add(tray(44, 10, 28, 0.8, basket, {}, 1.2))
  for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(44.2, 1.2, 28.2, rim, { y: 4 + s * 2.5 }, 0.5)))
  // 白菜（横躺）
  const hk = new THREE.Group()
  hk.add(capsule(6, 14, HAKUSAI))
  for (let i = 0; i < 4; i++) hk.add(ball(5.5, LEAF, { y: 15 + i * 1.5, x: (i - 1.5) * 1.2 }, [1.15, 0.9, 1.1]))
  hk.rotation.z = PI / 2
  hk.position.set(10, 7, -5)
  g.add(hk)
  // 白萝卜
  const dk = new THREE.Group()
  dk.add(capsule(3.4, 26, DAIKON))
  dk.add(cyl(3.2, 3.4, 4, '#cfe3a0', { y: 26 }, 16))
  for (let i = 0; i < 4; i++) {
    const l = ball(5, LEAF, { y: 33 + i, x: (i - 1.5) * 1.6 }, [0.45, 1, 0.2])
    l.rotation.z = (i - 1.5) * 0.4
    dk.add(l)
  }
  dk.rotation.z = -PI / 2
  dk.position.set(-20, 5, 6)
  g.add(dk)
  // 葱三根
  for (let i = 0; i < 3; i++) {
    const z = 4 + i * 2
    g.add(hcyl(1, 1, 22, '#f4f4e6', -8, 10.5, z, 'x', 10))
    g.add(hcyl(0.8, 1, 16, NEGI, 11, 10.5 + i * 0.1, z, 'x', 10))
  }
  return g
}

/** 洋葱土豆网袋（倒放的两袋） */
export function onionPotatoBags(p: string[]) {
  const [net1, net2, tag] = p
  const g = new THREE.Group()
  const bagAt = (x: number, color: string, item: string, sc: number, n: number) => {
    const r = rng(n)
    for (let i = 0; i < n; i++) {
      const xx = x + ((i % 3) - 1) * 4.2 + (r() - 0.5)
      const zz = (Math.floor(i / 3) % 2) * 4 - 2
      const yy = 3 + Math.floor(i / 6) * 5
      g.add(ball(3 * sc, item, { x: xx, y: yy, z: zz }, item === POTATO ? [1.25, 0.85, 0.95] : [1, 0.95, 1]))
      if (item === ONION) g.add(cyl(0.2, 0.6, 1.4, '#a8683a', { x: xx, y: yy + 2.6 * sc, z: zz }, 6))
    }
    // 网袋：几道横网线 + 打结
    for (let k = 0; k < 3; k++) {
      const t = torus(6.8, 0.22, color, { x, y: 2.5 + k * 3.2, z: 0, rx: PI / 2 })
      t.scale.y = 0.65
      g.add(t)
    }
    g.add(cyl(0.6, 1.2, 3, color, { x, y: 11.5 }, 8))
    g.add(rbox(4, 2.4, 0.4, tag, { x, y: 10.5, z: 4.2 }, 0.2))
  }
  bagAt(-8, net1, ONION, 1, 9)
  bagAt(8, net2, POTATO, 0.95, 9)
  return g
}

/** 鸡蛋盒（打开，10 个） */
export function eggCarton(p: string[]) {
  const [carton, lab] = p
  const g = new THREE.Group()
  g.add(glassGhost(tray(26, 4, 11, 0.3, carton, {}, 0.6), carton, 0.55))
  // 盖子打开翻在后面（平躺）
  g.add(glassGhost(tray(26, 3, 11, 0.3, carton, { y: 0, z: -11.4 }, 0.6), carton, 0.55))
  g.add(noOutlineDeep(rbox(16, 0.3, 6, lab, { y: 0.32, z: -11.4 }, 0.2)))
  for (let i = 0; i < 10; i++) {
    const x = -10 + (i % 5) * 5
    const z = i < 5 ? -2.4 : 2.4
    g.add(ball(2, '#f6e4c8', { x, y: 3, z }, [1, 1.3, 1]))
  }
  return g
}

/** 牛奶盒（1L / 500ml） */
export function milkCarton(p: string[], big: boolean) {
  const [body, band, cap] = p
  const g = new THREE.Group()
  const w = big ? 7 : 6
  const h = big ? 19.5 : 12.5
  g.add(rbox(w, h, w, body, {}, 0.3))
  // 屋顶形顶
  const roof = new THREE.Shape()
  roof.moveTo(-w / 2, 0)
  roof.lineTo(w / 2, 0)
  roof.lineTo(0.3, 2.6)
  roof.lineTo(-0.3, 2.6)
  roof.closePath()
  const geo = new THREE.ExtrudeGeometry(roof, { depth: w - 0.2, bevelEnabled: false })
  geo.translate(0, 0, -(w - 0.2) / 2)
  const m = new THREE.Mesh(geo, toon(body))
  m.position.y = h
  m.castShadow = true
  g.add(m)
  g.add(rbox(0.6, 1.4, w - 0.6, body, { y: h + 2.5 }, 0.2))
  g.add(noOutlineDeep(rbox(w + 0.1, h * 0.35, w + 0.1, band, { y: h * 0.2 }, 0.2)))
  g.add(cyl(0.9, 0.9, 0.8, cap, { x: w / 4, y: h + 1.1, z: w / 4 - 0.4 }, 12).rotateX(-0.75))
  return g
}

/** 杯面：closed = 盖着 / open = 掀开冒热气 */
export function cupNoodle(p: string[], open: boolean) {
  const [body, band, lid] = p
  const g = new THREE.Group()
  g.add(cup(4.8, 3.6, 10.5, 0.3, body))
  g.add(noOutlineDeep(cup(4.82, 4.1, 3.6, 0.05, band, { y: 5.4 })))
  if (!open) {
    g.add(cyl(5, 5, 0.3, lid, { y: 10.5 }, 28))
    g.add(rbox(2, 0.3, 2, lid, { z: 5.4, y: 10.5 }, 0.1))
    return g
  }
  g.add(liquid(4.4, 9, '#d9a35a'))
  for (let i = 0; i < 5; i++) g.add(noOutlineDeep(cappedTube(arc([0, 8.9, 0], 1 + i * 0.7, i, i + 2.4, 6, 'xz'), 0.22, NOODLE, { ...TUBE, seg: 12 })))
  g.add(noOutlineDeep(rbox(1.4, 0.3, 1.4, '#ffd75e', { x: 1.5, y: 8.9, z: -1 }, 0.1)))
  g.add(noOutlineDeep(rbox(1.2, 0.3, 1.2, '#e86a4a', { x: -1.8, y: 8.9, z: 0.8 }, 0.1)))
  // 掀开一半的盖子（翻起靠在后面）
  const l = cyl(5, 5, 0.3, lid, {}, 28)
  l.position.set(0, 10.5 + 3.6, -4.8)
  l.rotation.x = -1.2
  g.add(l)
  // 筷子横搭
  g.add(chopsticks(21, '#e7c08a', 0, 10.4, 1.2, 0.8))
  return g
}
export const NOODLE_FX: Fx[] = [{ kind: 'steam', x: 0, y: 10.5, z: 0.5, scale: 0.7, height: 16 }]

/** 零食袋（三袋） */
export function snackBags(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const bag = (w: number, h: number, color: string, x: number, z: number, ry: number) => {
    const s = new THREE.Group()
    s.add(rbox(w, h - 2.4, w * 0.3, color, { y: 1.2 }, w * 0.14))
    s.add(rbox(w * 0.96, 1.4, 1, shade(color, -0.1), { y: h - 1.6 }, 0.3))
    s.add(rbox(w * 0.96, 1.4, 1, shade(color, -0.1), { y: 0.2 }, 0.3))
    s.add(noOutlineDeep(ball(w * 0.22, '#ffd75e', { y: h * 0.5, z: w * 0.15 + 0.05 }, [1, 1, 0.12])))
    s.position.set(x, 0, z)
    s.rotation.y = ry
    // 靠立：袋子略倾斜
    s.rotation.x = -0.18
    g.add(s)
  }
  bag(16, 22, a, -9, 0, 0.1)
  bag(13, 18, b, 4, 2, -0.15)
  bag(10, 14, c, 13, 3.5, -0.3)
  return g
}

/** 罐头叠放（金字塔） */
export function cannedFood(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const cols = [a, b, c]
  const r = 4.2
  const h = 5.5
  let k = 0
  for (const [n, y] of [
    [3, 0],
    [2, h],
    [1, h * 2],
  ] as const)
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (r * 2 + 0.2)
      g.add(can(r, h, cols[k++ % 3], STEEL, { x, y }))
      g.add(noOutlineDeep(cyl(r + 0.03, r + 0.03, h * 0.5, '#ffffff', { x, y: y + h * 0.25 }, 20)))
    }
  return g
}

/** 调味料瓶组：酱油 / 味醂 / 色拉油（大瓶） */
export function seasoningBottles(p: string[]) {
  const [cap1, cap2, lab] = p
  const g = new THREE.Group()
  const list: [number, number, number, string, string][] = [
    [-8, 4, 22, SOY, cap1],
    [0, 3.8, 24, '#d9a441', cap2],
    [8, 4.2, 26, '#f0d77a', '#ffd84d'],
  ]
  for (const [x, r, h, liq, cap] of list) {
    g.add(glassGhost(bottle(r, h, 1.3, h * 0.6, GLASS, { x }), GLASS, 0.35))
    g.add(noOutlineDeep(cyl(r - 0.35, r - 0.35, h * 0.55, liq, { x, y: 0.4 }, 18)))
    g.add(cyl(1.5, 1.5, 2.2, cap, { x, y: h }, 14))
    g.add(noOutlineDeep(cyl(r + 0.05, r + 0.05, h * 0.25, lab, { x, y: h * 0.18 }, 18)))
  }
  return g
}

/** 米袋（5kg / 10kg，平放） */
export function riceSack(p: string[], kg: 5 | 10) {
  const [bag, print, acc] = p
  const g = new THREE.Group()
  const w = kg === 5 ? 28 : 36
  const d = kg === 5 ? 40 : 52
  const h = kg === 5 ? 9 : 11
  g.add(rbox(w, h, d, bag, {}, h * 0.45))
  g.add(noOutlineDeep(rbox(w * 0.7, 0.3, d * 0.45, print, { y: h - 0.05, z: -d * 0.05 }, 0.3)))
  g.add(noOutlineDeep(rbox(w * 0.4, 0.3, d * 0.12, acc, { y: h + 0.05, z: d * 0.27 }, 0.2)))
  // 两端压封
  for (const s of [-1, 1]) g.add(rbox(w * 0.9, 2, 3, shade(bag, -0.08), { y: h * 0.4, z: s * (d / 2 - 0.5) }, 0.5))
  // 提手孔
  g.add(noOutlineDeep(rbox(6, 0.3, 1.5, shade(bag, -0.35), { y: h - 0.1, z: -d / 2 + 4 }, 0.5)))
  return g
}

/** 瓶装水一箱（2L×6，箱子打开） */
export function waterCase(p: string[], open = true) {
  const [card, print, cap] = p
  const g = new THREE.Group()
  const W = 32
  const D = 22
  const H = 31
  g.add(tray(W, H, D, 0.5, card, {}, 0.2))
  g.add(noOutlineDeep(rbox(14, 9, 0.3, print, { y: 12, z: D / 2 + 0.05 }, 0.5)))
  g.add(noOutlineDeep(rbox(W + 0.6, 3, D + 0.6, print, { y: 3 }, 0.1)))
  if (open)
    for (let i = 0; i < 6; i++) {
      const x = -10 + (i % 3) * 10
      const z = i < 3 ? -5 : 5
      g.add(glassGhost(bottle(4.7, 30, 1.4, 22, '#bfe6ff', { x, y: 0.5, z }), '#bfe6ff', 0.45))
      g.add(cyl(1.6, 1.6, 2, cap, { x, y: 30.5, z }, 12))
    }
  if (!open) {
    // 封箱：顶盖合上 + 胶带
    g.add(rbox(W, 0.5, D, card, { y: H - 0.5 }, 0.1))
    g.add(noOutlineDeep(rbox(5, 0.2, D + 0.2, '#e8d9b8', { y: H }, 0.05)))
    return g
  }
  // 两片外翻盖
  for (const s of [-1, 1]) {
    const f = rbox(W, 0.4, 10, card, {}, 0.1)
    f.position.set(0, H + Math.sin(0.9) * 5, s * (D / 2 + Math.cos(0.9) * 5))
    f.rotation.x = -s * 0.9
    g.add(f)
  }
  return g
}

/** 啤酒罐六连包 */
export function beerSixPack(p: string[]) {
  const [canC, band, top] = p
  const g = new THREE.Group()
  for (let i = 0; i < 6; i++) {
    const x = -6.8 + (i % 3) * 6.8
    const z = i < 3 ? -3.4 : 3.4
    g.add(can(3.3, 12.2, canC, top, { x, z }))
    g.add(noOutlineDeep(cyl(3.33, 3.33, 3, band, { x, y: 4, z }, 20)))
  }
  // 纸提手
  g.add(rbox(21, 0.4, 14, '#c99a52', { y: 12.3 }, 0.1))
  g.add(rbox(8, 0.5, 2, '#c99a52', { y: 12.7 }, 0.2))
  return g
}

/** 啤酒箱（塑料周转箱，装满瓶子） */
export function beerCrate(p: string[]) {
  const [crate, capC, lab] = p
  const g = new THREE.Group()
  const W = 48
  const D = 33
  g.add(tray(W, 24, D, 1, crate, {}, 0.6))
  // 侧面把手孔（深色贴片）
  for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(0.3, 3.5, 12, shade(crate, -0.35), { x: s * (W / 2 + 0.05), y: 17 })))
  g.add(noOutlineDeep(rbox(18, 5, 0.3, lab, { y: 10, z: D / 2 + 0.05 }, 0.5)))
  for (let i = 0; i < 20; i++) {
    const x = -20 + (i % 5) * 10
    const z = -12 + Math.floor(i / 5) * 8
    g.add(bottle(3.4, 29, 1.2, 18, '#7a4a1f', { x, y: 1, z }))
    g.add(cyl(1.5, 1.5, 0.8, capC, { x, y: 30, z }, 10))
  }
  return g
}

/** 清酒一升瓶 */
export function isshobin(p: string[]) {
  const [glass, lab, cap] = p
  const g = new THREE.Group()
  g.add(bottle(5, 39, 1.5, 24, glass, {}))
  g.add(noOutlineDeep(cyl(5.04, 5.04, 12, lab, { y: 8 }, 24)))
  g.add(noOutlineDeep(rbox(3, 9, 0.3, '#d14b3c', { y: 9.5, z: 5.05 }, 0.2)))
  g.add(cyl(1.8, 1.8, 3, cap, { y: 38 }, 14))
  return g
}

/** 葡萄酒架（6 瓶位，放 4 瓶） */
export function wineRack(p: string[]) {
  const [wood, glassC, foil] = p
  const g = new THREE.Group()
  const W = 34
  const D = 28
  for (const sx of [-1, 1]) g.add(rbox(1.8, 26, D, wood, { x: sx * (W / 2 - 0.9) }, 0.5))
  for (const y of [1, 12.5]) for (const sz of [-1, 1]) g.add(hcyl(0.7, 0.7, W - 3.6, wood, 0, y + 3, sz * 10, 'x', 10))
  for (const y of [1, 12.5]) for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) g.add(noOutlineDeep(rbox(3.4, 1.2, 1.6, shade(wood, -0.08), { x: -10 + i * 10, y: y + 3.6, z: sz * 10 }, 0.3)))
  g.add(rbox(W, 1.6, D, wood, { y: 24.4 }, 0.5))
  // 瓶子平躺（瓶口朝前）
  const slots: [number, number][] = [
    [-10, 1],
    [10, 1],
    [0, 12.5],
    [10, 12.5],
  ]
  for (const [x, y] of slots) {
    const b = new THREE.Group()
    b.add(bottle(3.7, 30, 1.25, 20, glassC, {}))
    b.add(cyl(1.32, 1.32, 4, foil, { y: 26.5 }, 12))
    b.add(noOutlineDeep(cyl(3.74, 3.74, 6, '#f4ecd8', { y: 6 }, 18)))
    b.rotation.x = PI / 2
    b.position.set(x, y + 3.6 + 3.7 + 0.3, -15)
    g.add(b)
  }
  return g
}

/** 宝特瓶饮料（2L + 500ml ×2） */
export function petBottles(p: string[]) {
  const [liq, lab, cap] = p
  const g = new THREE.Group()
  g.add(glassGhost(bottle(5.2, 31, 1.4, 24, '#e8f6ff', {}), '#e8f6ff', 0.4))
  g.add(noOutlineDeep(cyl(4.8, 4.8, 22, liq, { y: 0.4 }, 20)))
  g.add(noOutlineDeep(cyl(5.24, 5.24, 7, lab, { y: 10 }, 20)))
  g.add(cyl(1.6, 1.6, 2, cap, { y: 31 }, 12))
  for (const [x, z, c] of [
    [9.5, -2, TEA],
    [9, 5, '#f2a03c'],
  ] as const) {
    g.add(glassGhost(bottle(3.3, 20, 1.3, 14, '#e8f6ff', { x, z }), '#e8f6ff', 0.4))
    g.add(noOutlineDeep(cyl(3, 3, 14, c, { x, y: 0.4, z }, 16)))
    g.add(noOutlineDeep(cyl(3.34, 3.34, 5, lab, { x, y: 7, z }, 16)))
    g.add(cyl(1.5, 1.5, 1.6, cap, { x, y: 20, z }, 12))
  }
  return g
}
