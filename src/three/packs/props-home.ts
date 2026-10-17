// 生活类桌面摆件：厨房 / 餐具 / 茶具 / 食物 / 洗护 / 化妆品 / 小玩具。
// 全部是 prop：原点在摆件底面中心，可以摆在桌面、柜面、台面上。约定见 kit.ts 开头。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, leaf, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, S, glow, holePanel, rng, rod, shell, type AssetDef, type Fx, type StyleTag } from '../kit'

const PI = Math.PI
const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro

// 食物 / 液体的固定色
const RICE = '#fffdf6'
const SOUP = '#d9a35f'
const COFFEE = '#7a4a32'
const TEA = '#c9d67a'
const WATER = '#cfeeff'
const BREAD = '#f7dca6'
const CRUST = '#c98a4f'
const SPONGE = '#f7dca6'
const CREAM = '#fffaf2'
const NORI = '#2f3b30'
const STRAW = '#ff5a6a'
const TOMATO = '#ff5a4f'
const BRASS = '#e9c46a'

// ---------- 小工具 ----------

function noLine<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    c.userData.noOutline = true
  })
  return o
}

/** 半透明玻璃（透明材质不描边） */
function glassy<T extends THREE.Object3D>(o: T, color: string, k = 0.45): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = toon(color, { transparent: k })
  })
  return o
}

/** 横放的圆柱 / 圆台：(x, y, z) 是中心；axis='x' 时顶端（rTop）朝 +x，'z' 时朝 +z */
function hcyl(rTop: number, rBottom: number, len: number, color: string, x: number, y: number, z: number, axis: 'x' | 'z' = 'x', seg = 16) {
  const m = cyl(rTop, rBottom, len, color, {}, seg)
  m.position.set(x, y, z)
  if (axis === 'x') m.rotation.z = -PI / 2
  else m.rotation.x = PI / 2
  return m
}

/** 容器里的液面：薄圆片，top 是液面高度 */
function liquid(r: number, top: number, color: string, x = 0, z = 0) {
  return noLine(cyl(r, r, 0.3, color, { x, y: top - 0.3, z }, 28))
}

/** 杯把手：竖直的半圆环，side=1 在 +x 侧 */
function handle(r: number, tube: number, color: string, x: number, y: number, side = 1, z = 0) {
  return torus(r, tube, color, { x, y, z, rz: side > 0 ? -PI / 2 : PI / 2 }, PI)
}

/** 一双筷子：沿 x 放，细头朝 -x，组中心为原点 */
function chopsticks(color: string, len = 21) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(hcyl(0.3, 0.18, len, color, 0, 0, s * 0.45, 'x', 8))
  return g
}

/** 扇形柱（蛋糕切块）：尖端在原点，朝 +x 张开 ang 弧度，底面在 y */
function sector(r: number, ang: number, h: number, color: string, y: number) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.absarc(0, 0, r, -ang / 2, ang / 2, false)
  shape.lineTo(0, 0)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 12 })
  geo.rotateX(-PI / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.y = y
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 三棱柱（饭团、积木屋顶）：尖朝上，正面朝 +z，底边在组的 y=0 */
function tri(R0: number, thick: number, color: string) {
  const m = cyl(R0, R0, thick, color, {}, 3)
  m.rotation.x = -PI / 2
  m.position.y = R0 / 2
  const g = new THREE.Group()
  g.add(m)
  return g
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z)
  o.rotation.y = ry
  return o
}

/** 平底盘：浅 cup */
const dish = (r: number, color: string, a: { x?: number; y?: number; z?: number } = {}, h = 1.2) => cup(r, r * 0.7, h, 0.45, color, a)

type Pal = [StyleTag, string, string, string]
type Def = Omit<AssetDef, 'palettes' | 'paletteStyles' | 'prop'> & { pals: Pal[] }

function def(o: Def): AssetDef {
  const { pals, styles, ...rest } = o
  const ps = pals.map((p) => p[0])
  return {
    ...rest,
    palettes: pals.map((p) => [p[1], p[2], p[3]]),
    paletteStyles: ps,
    styles: styles ?? [...new Set(ps)],
    prop: true,
  }
}

// ---------- 杯 / 茶具 ----------

function mug(s: number) {
  return (p: string[]) => {
    const [main, , acc] = p
    const r = 4 * s
    const h = 9 * s
    const x0 = -1.5 * s
    const g = new THREE.Group()
    g.add(cup(r, r - 0.2 * s, h, 0.6, main, { x: x0 }))
    g.add(liquid(r - 0.8, h - 1.4, COFFEE, x0))
    g.add(torus(r - 0.05, 0.3, acc, { x: x0, y: h * 0.72, rx: PI / 2 }))
    g.add(handle(2.6 * s, 0.7 * s, main, x0 + r - 0.1, h * 0.52))
    return g
  }
}

/** 马克杯热气：杯口中心 */
const mugFx = (s: number): Fx[] => [{ kind: 'steam', x: -1.5 * s, y: 9 * s, z: 0, scale: 0.6 * s }]

function teaSet(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(tray(30, 1.4, 22, 0.6, sub, {}, 0.3))
  const y0 = 0.6
  const kx = -4
  const kz = 1
  // 急須：横手（侧把）
  g.add(puck(3.4, 0.8, main, { x: kx, y: y0, z: kz }))
  g.add(ball(5.5, main, { x: kx, y: 5.5, z: kz }, [1, 0.8, 1]))
  g.add(puck(3.2, 1, main, { x: kx, y: 9.4, z: kz }))
  g.add(ball(0.9, shade(main, -0.12), { x: kx, y: 10.9, z: kz }))
  const sp = cyl(0.7, 1.4, 5, main, {}, 10)
  sp.position.set(kx - 6.3, 6.8, kz)
  sp.rotation.z = 0.9
  g.add(sp)
  const hd = cyl(0.9, 1.2, 6, main, {}, 10)
  hd.position.set(kx, 7, kz - 7.6)
  hd.rotation.x = -(PI / 2 - 0.25)
  g.add(hd)
  // 两只湯呑
  for (const [x, z] of [
    [8, -4],
    [9.5, 5],
  ]) {
    g.add(cup(2.8, 2.2, 5.5, 0.45, acc, { x, y: y0, z }))
    g.add(liquid(2.05, y0 + 4.3, TEA, x, z))
  }
  return g
}

function coffeeCup(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(cup(6.5, 4, 1, 0.4, sub))
  g.add(cup(3.8, 2.8, 5.5, 0.45, main, { y: 0.4 }))
  g.add(liquid(3.1, 5.3, COFFEE))
  g.add(noLine(ball(0.9, CREAM, { y: 5.32, z: 0.3 }, [1, 0.12, 0.9])))
  g.add(handle(1.4, 0.4, main, 3.4, 3.4))
  g.add(rbox(4.6, 0.25, 0.7, C.steel, { x: 0.6, y: 0.75, z: 4.4, ry: 0.35 }, 0.1))
  g.add(ball(0.7, C.steel, { x: -1.6, y: 0.95, z: 5.1 }, [1, 0.3, 1.4]))
  return g
}

function glassPitcher(p: string[]) {
  const [glass, lid, acc] = p
  const g = new THREE.Group()
  const px = -1.5
  g.add(glassy(cup(4.8, 5.2, 20, 0.5, glass, { x: px }), glass, 0.4))
  g.add(glassy(cyl(4.3, 4.6, 12.5, WATER, { x: px, y: 0.5 }), WATER, 0.5))
  g.add(puck(1.6, 0.3, acc, { x: px + 0.5, y: 8, z: 1, rx: 1.2 }))
  g.add(glassy(handle(3.8, 0.7, glass, px - 4.9, 11, -1), glass, 0.5))
  g.add(puck(4.7, 1.3, lid, { x: px, y: 19.6 }))
  g.add(ball(0.9, lid, { x: px, y: 21.3 }))
  g.add(glassy(cup(3, 2.7, 9, 0.4, glass, { x: 7.5 }), glass, 0.4))
  g.add(glassy(cyl(2.4, 2.3, 6, WATER, { x: 7.5, y: 0.4 }), WATER, 0.5))
  return g
}

function sakeSet(p: string[]) {
  const [main, band, base] = p
  const g = new THREE.Group()
  g.add(rbox(22, 1.2, 14, base, {}, 0.5))
  const tx = -5
  g.add(ball(4, main, { x: tx, y: 4.8 }, [1, 0.9, 1]))
  g.add(cyl(1.2, 1.9, 5, main, { x: tx, y: 7.4 }))
  g.add(cup(1.5, 1.2, 1.4, 0.3, main, { x: tx, y: 11.9 }))
  g.add(torus(3.97, 0.28, band, { x: tx, y: 4.8, rx: PI / 2 }))
  g.add(torus(3.7, 0.24, band, { x: tx, y: 6.2, rx: PI / 2 }))
  for (const [x, z] of [
    [3, -2.5],
    [7.5, 2.5],
  ]) {
    g.add(cup(2.4, 1.6, 2.6, 0.3, main, { x, y: 1.2, z }))
    g.add(torus(2.3, 0.18, band, { x, y: 2.9, z, rx: PI / 2 }))
    g.add(liquid(1.85, 3.3, '#f6f0d8', x, z))
  }
  return g
}

function creamSoda(p: string[]) {
  const [soda, ice, cherry] = p
  const g = new THREE.Group()
  g.add(puck(4.5, 0.4, '#c9a27a'))
  g.add(glassy(cyl(2.8, 3, 0.8, C.glass, { y: 0.4 }), C.glass, 0.5))
  g.add(glassy(cyl(0.7, 0.7, 3, C.glass, { y: 1.2 }), C.glass, 0.5))
  g.add(glassy(cup(4, 2.6, 12, 0.35, C.glass, { y: 4.2 }), C.glass, 0.35))
  g.add(glassy(cyl(3.5, 2.3, 10.8, soda, { y: 4.6 }), soda, 0.8))
  for (const [x, z, r] of [
    [-1.2, 0.8, 0.3],
    [1, -1, -0.4],
  ])
    g.add(glassy(rbox(1.6, 1.6, 1.6, '#ffffff', { x, y: 13.4, z, ry: r }, 0.4), '#ffffff', 0.6))
  g.add(ball(2.8, ice, { y: 16.6 }, [1, 0.9, 1]))
  g.add(ball(0.9, cherry, { x: 0.5, y: 19.9 }))
  g.add(rod(0.5, 20.6, 1.4, 22, 0.12, C.leafD))
  const st = cyl(0.35, 0.35, 16, '#ff6f61', {}, 8)
  st.position.set(-2, 14, 0.3)
  st.rotation.z = 0.15
  g.add(st)
  return g
}

// ---------- 花 / 果 ----------

function vaseFlowers(p: string[]) {
  const [vase, petal, center] = p
  const g = new THREE.Group()
  g.add(cup(2.6, 4.6, 16, 0.6, vase))
  const flowers: [number, number, number][] = [
    [-3.5, 27, 0.5],
    [0.5, 30, -1],
    [3.8, 26, 1.2],
  ]
  for (const [x, y, z] of flowers) {
    g.add(rod(0, 12, x, y, 0.25, C.leafD, z))
    g.add(ball(1.1, center, { x, y, z }))
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + x
      g.add(ball(1.4, petal, { x: x + Math.cos(a) * 1.6, y: y - 0.2, z: z + Math.sin(a) * 1.6 }, [1, 0.5, 1]))
    }
  }
  g.add(leaf(5, C.leaf, { x: -2.2, y: 19, z: 0.6, rx: -0.5, ry: 1.2 }))
  g.add(leaf(4.5, C.leaf, { x: 2.4, y: 18, z: 0.4, rx: -0.6, ry: -1.1 }))
  return g
}

function mikanBasket(p: string[]) {
  const [basket, ring, lf] = p
  const g = new THREE.Group()
  g.add(cup(12, 9.5, 7, 1, basket))
  g.add(torus(10.45, 0.35, ring, { y: 2.5, rx: PI / 2 }))
  g.add(torus(11.3, 0.35, ring, { y: 4.9, rx: PI / 2 }))
  const mikan = (x: number, y: number, z: number) => {
    g.add(ball(4, C.orange, { x, y, z }, [1, 0.86, 1]))
    g.add(ball(0.9, lf, { x, y: y + 3.3, z }, [1, 0.6, 1]))
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    mikan(Math.cos(a) * 4.6, 4.45, Math.sin(a) * 4.6)
  }
  mikan(-2.3, 10.6, 0.4)
  mikan(2.4, 10.6, -0.3)
  return g
}

function fruitBowl(p: string[]) {
  const [bowl, foot] = p
  const g = new THREE.Group()
  g.add(cyl(4, 5, 1.5, foot))
  g.add(cup(12, 6, 6.5, 0.8, bowl, { y: 1.5 }))
  const apple = (x: number, z: number, c: string) => {
    g.add(ball(3.4, c, { x, y: 6.6, z }, [1, 0.92, 1]))
    g.add(cyl(0.22, 0.25, 1.4, C.woodD, { x, y: 9.4, z, rz: 0.2 }, 6))
  }
  apple(-4, 1, '#ff6b6b')
  apple(3.6, -3, C.red)
  g.add(ball(3.2, C.orange, { x: 2.8, y: 6.4, z: 4.2 }))
  g.add(torus(5, 1.2, C.lemon, { x: -1, y: 9.6, z: -1.2, rx: PI / 2 - 0.3, rz: 0.6 }, 2))
  const r = rng(11)
  for (let i = 0; i < 7; i++) g.add(ball(1.1, '#9b6fd0', { x: -3 + (r() - 0.5) * 2.6, y: 8.6 + r() * 1.6, z: -4.5 + (r() - 0.5) * 2.4 }))
  return g
}

// ---------- 日用小物 ----------

function keyTray(p: string[]) {
  const [main, , acc] = p
  const g = new THREE.Group()
  const t = cup(9, 7.6, 2, 0.6, main)
  t.scale.z = 0.65
  g.add(t)
  const key = (color: string) => {
    const k = new THREE.Group()
    k.add(torus(1.1, 0.45, color, { x: -2.6, y: 0.45, rx: PI / 2 }))
    k.add(rbox(4.4, 0.4, 1, color, { x: 0.6, y: 0.25 }, 0.15))
    for (const x of [1.2, 2.2]) k.add(rbox(0.6, 0.4, 0.6, color, { x, y: 0.25, z: -0.7 }, 0.15))
    return k
  }
  g.add(at(key(C.steel), -1, 0.6, 0.8, 0.3))
  g.add(at(key(BRASS), 1.2, 0.6, -1.2, -0.5))
  g.add(torus(1.4, 0.18, M.silver, { x: -4, y: 0.85, z: 0, rx: PI / 2 }))
  g.add(rbox(3, 0.5, 1.8, acc, { x: 4.6, y: 0.6, z: 1.2, ry: 0.4 }, 0.25))
  return g
}

function tissueBox(p: string[]) {
  const [main, band] = p
  const g = new THREE.Group()
  // 空心盒子，顶板真开出抽纸口，纸巾从口里冒出来
  g.add(shell(24, 8.4, 12, 0.6, main, { top: false }))
  g.add(holePanel(24, 12, 0.6, main, [{ kind: 'rect', x: 0, y: 4.6, w: 14, h: 2.8, r: 1.4 }], { y: 8.7, z: 6, rx: -Math.PI / 2 }, 1))
  g.add(rbox(24.4, 1.6, 12.4, band, { y: 1.2 }, 0.6))
  g.add(rbox(18, 6.5, 10.4, C.white, { y: 0.6 }, 1))
  g.add(ball(3.5, C.white, { y: 10.4, rz: 0.15 }, [1.4, 0.75, 0.3]))
  return g
}

// ---------- 食物 ----------

function platesWestern(p: string[]) {
  const [mat, plate, acc] = p
  const g = new THREE.Group()
  g.add(rbox(36, 0.3, 26, mat, {}, 0.12))
  g.add(cup(11, 7.5, 1.8, 0.5, plate, { y: 0.3 }))
  g.add(cup(7.5, 5, 1.2, 0.45, acc, { y: 0.8 }))
  // 叉
  g.add(rbox(1, 0.35, 11, C.steel, { x: -15, y: 0.3, z: 2 }, 0.15))
  g.add(rbox(2.2, 0.35, 2.4, C.steel, { x: -15, y: 0.3, z: -4.6 }, 0.15))
  for (let i = 0; i < 3; i++) g.add(rbox(0.4, 0.35, 2.6, C.steel, { x: -15 + (i - 1) * 0.8, y: 0.3, z: -7 }, 0.15))
  // 刀
  g.add(rbox(1.6, 0.3, 9, C.steel, { x: 15, y: 0.3, z: -3.5 }, 0.12))
  g.add(rbox(1.3, 0.6, 8, C.steel, { x: 15, y: 0.3, z: 5 }, 0.28))
  return g
}

function riceMiso(p: string[]) {
  const [bowl, wan, rest] = p
  const g = new THREE.Group()
  const z0 = -1.5
  g.add(cyl(2.6, 2.8, 0.8, bowl, { x: -7, z: z0 }))
  g.add(cup(6, 3.6, 6, 0.5, bowl, { x: -7, y: 0.7, z: z0 }))
  g.add(ball(5.2, RICE, { x: -7, y: 5.4, z: z0 }, [1, 0.42, 1]))
  g.add(cyl(3, 3.2, 0.8, wan, { x: 7, z: z0 }))
  g.add(cup(6, 4, 6.5, 0.5, wan, { x: 7, y: 0.7, z: z0 }))
  g.add(liquid(5.1, 6, SOUP, 7, z0))
  for (const [x, z] of [
    [6, -2.6],
    [8.4, -0.4],
    [6.6, 0.6],
  ])
    g.add(rbox(1, 0.5, 1, C.white, { x, y: 5.8, z, ry: x }, 0.2))
  g.add(leaf(2.2, '#3f6b3a', { x: 8.2, y: 6.05, z: -2.8, ry: 0.6 }))
  g.add(rbox(2.4, 0.8, 1.1, rest, { x: 8, z: 7 }, 0.35))
  const cs = chopsticks(shade(wan, -0.1))
  cs.position.set(0, 0.8, 7)
  cs.rotation.z = 0.05
  g.add(cs)
  return g
}

function bento(p: string[]) {
  const [box, kase] = p
  const g = new THREE.Group()
  const z0 = -1.5
  g.add(tray(20, 4.5, 12, 0.6, box, { z: z0 }, 0.3))
  g.add(rbox(9, 3, 10.4, RICE, { x: -4.7, y: 0.6, z: z0 }, 1))
  g.add(ball(1, '#d6455a', { x: -4.7, y: 3.7, z: z0 }))
  g.add(rbox(0.4, 3.6, 10.6, C.leafD, { x: 0.3, y: 0.6, z: z0 }, 0.15))
  for (const dz of [-3.3, -0.6]) g.add(rbox(3.4, 2.4, 2.6, '#ffd75e', { x: 3.2, y: 0.6, z: z0 + dz }, 0.6))
  g.add(cyl(0.5, 0.6, 1.4, '#9cc46a', { x: 7.2, y: 0.6, z: z0 - 2.5 }, 8))
  for (const [dx, dz] of [
    [0, 0],
    [-0.9, 0.6],
    [0.8, 0.5],
  ])
    g.add(ball(1.1, C.leafD, { x: 7.2 + dx, y: 2.6, z: z0 - 2.5 + dz }))
  const sau = capsule(0.9, 2.2, '#e85d4a')
  sau.rotation.z = PI / 2
  sau.position.set(6.2, 1.5, z0 + 2.4)
  g.add(sau)
  g.add(ball(1.3, TOMATO, { x: 3, y: 1.9, z: z0 + 3 }))
  g.add(rbox(19, 1.2, 2.4, kase, { z: 6.3 }, 0.5))
  return g
}

/** 蛋糕上三根蜡烛的位置 */
const CAKE_CANDLES = [0, 1, 2].map((i): [number, number] => {
  const a = (i / 3) * PI * 2 + 0.3
  return [Math.cos(a) * 3, Math.sin(a) * 3]
})

function cake(p: string[]) {
  const [frost, cream, candleC] = p
  const g = new THREE.Group()
  g.add(puck(10.5, 0.8, C.white))
  g.add(cyl(8.5, 8.5, 8, frost, { y: 0.8 }, 32))
  g.add(torus(8.5, 0.45, cream, { y: 1.3, rx: PI / 2 }))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    g.add(ball(1.2, cream, { x: Math.cos(a) * 7, y: 9.2, z: Math.sin(a) * 7 }, [1, 0.8, 1]))
    const b = a + PI / 8
    g.add(ball(1.2, STRAW, { x: Math.cos(b) * 6.6, y: 10, z: Math.sin(b) * 6.6 }, [1, 1.2, 1]))
  }
  for (const [x, z] of CAKE_CANDLES) {
    g.add(cyl(0.3, 0.3, 4, candleC, { x, y: 8.8, z }, 8))
    g.add(cyl(0.06, 0.06, 0.5, C.ink, { x, y: 12.8, z }, 4))
    const f = ball(0.25, C.lamp, { x, y: 13.5, z }, [1, 1.6, 1])
    f.material = toon(C.lamp, { emissive: 0.8 })
    g.add(noLine(f))
  }
  return g
}

function cakeSlice(p: string[]) {
  const [frost, fill, plate] = p
  const g = new THREE.Group()
  g.add(cup(6.5, 4.5, 1, 0.4, plate))
  const s = new THREE.Group()
  const r = 7.5
  const a = 0.9
  s.add(sector(r, a, 2.2, SPONGE, 0.4))
  s.add(sector(r, a, 0.6, fill, 2.6))
  s.add(sector(r, a, 2.2, SPONGE, 3.2))
  s.add(sector(r, a, 0.6, frost, 5.4))
  s.add(ball(1.1, frost, { x: 4.6, y: 6.5 }, [1, 0.8, 1]))
  s.add(ball(1.2, STRAW, { x: 4.6, y: 8 }, [1, 1.2, 1]))
  s.add(ball(0.6, C.leaf, { x: 4.6, y: 9.4 }, [1.4, 0.4, 1.4]))
  s.position.x = -3.2
  g.add(s)
  return g
}

function donutPlate(p: string[]) {
  const [plate, ice1, ice2] = p
  const g = new THREE.Group()
  g.add(dish(9.5, plate, {}, 1.4))
  const ices = [ice1, ice2, '#8a5a3c']
  const sp = [C.pink, C.sky, C.lemon, C.mint, C.white]
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.3
    const x = Math.cos(a) * 4.4
    const z = Math.sin(a) * 4.4
    g.add(torus(2.4, 1.3, '#e3ad6b', { x, y: 1.75, z, rx: PI / 2 }))
    g.add(torus(2.4, 1.12, ices[i], { x, y: 2.25, z, rx: PI / 2 }))
    for (let j = 0; j < 7; j++) {
      const b = (j / 7) * PI * 2 + i
      g.add(noLine(rbox(0.55, 0.2, 0.2, sp[(i + j) % sp.length], { x: x + Math.cos(b) * 2.4, y: 3.3, z: z + Math.sin(b) * 2.4, ry: b * 2 }, 0.08)))
    }
  }
  return g
}

function onigiri(p: string[]) {
  const [plate] = p
  const g = new THREE.Group()
  g.add(dish(7.5, plate))
  g.add(ball(6.5, C.leaf, { y: 0.75, ry: 1.3 }, [0.45, 0.05, 1]))
  for (const [x, z, ry] of [
    [-3.1, 0.6, 0.25],
    [3.1, -0.8, -0.2],
  ]) {
    const o = tri(3.4, 3.4, RICE)
    o.add(rbox(3.4, 2.6, 3.8, NORI, { y: -0.05 }, 0.4))
    g.add(at(o, x, 1, z, ry))
  }
  return g
}

function sushi(p: string[]) {
  const [board, feet] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(1.6, 1.25, 10, feet, { x: s * 9 }, 0.4))
  g.add(rbox(26, 1.6, 11, board, { y: 1.2 }, 0.5))
  const nigiri = (x: number, color: string, stripes: boolean, band: boolean) => {
    g.add(rbox(4.4, 1.8, 2.6, RICE, { x, y: 2.8 }, 0.8))
    g.add(rbox(5, 0.7, 3, color, { x, y: 4.45 }, 0.3))
    if (stripes) for (const k of [-1.2, 0, 1.2]) g.add(noLine(rbox(0.35, 0.2, 2.6, '#ffe6da', { x: x + k, y: 5.05, rz: 0.4 }, 0.08)))
    if (band) g.add(rbox(1.1, 2.7, 3.2, NORI, { x, y: 2.7 }, 0.3))
  }
  nigiri(-9.5, '#ff9e7a', true, false)
  nigiri(-4.5, '#e8505b', false, false)
  nigiri(0.5, '#ffd75e', false, true)
  nigiri(5.5, '#ff9a76', true, false)
  for (let i = 0; i < 3; i++) g.add(ball(0.9, '#f7b6b0', { x: 10.4 + i * 0.3, y: 3.1 + i * 0.4, z: 1.5 - i * 0.4 }, [1.3, 0.4, 1]))
  g.add(ball(0.7, '#9cc46a', { x: 10.5, y: 3.2, z: -2.5 }, [1, 0.7, 1]))
  return g
}

function ramen(p: string[]) {
  const [bowl, band, sticks] = p
  const g = new THREE.Group()
  g.add(cyl(4.5, 4.8, 1, bowl))
  g.add(cup(10.5, 5.5, 8, 0.7, bowl, { y: 1 }))
  g.add(torus(9.62, 0.35, band, { y: 7.5, rx: PI / 2 }))
  g.add(liquid(8.6, 7.6, '#f0c27a'))
  g.add(puck(5, 0.5, '#f3d36b', { y: 7.25 }))
  for (let i = 0; i < 5; i++) g.add(noLine(torus(1.1, 0.25, '#f6dc7f', { x: -1 + i * 0.6, y: 7.75, z: -1 + (i % 2), rx: PI / 2 })))
  g.add(puck(2.6, 0.7, '#d9946b', { x: -3, y: 7.4, z: 2 }))
  g.add(noLine(torus(2.2, 0.2, '#b8714a', { x: -3, y: 8.1, z: 2, rx: PI / 2 })))
  g.add(ball(1.8, C.white, { x: 3, y: 7.7, z: 2.5 }, [1, 0.5, 1.3]))
  g.add(ball(1, '#ffa726', { x: 3, y: 8.3, z: 2.5 }, [1, 0.35, 1]))
  g.add(puck(1.6, 0.5, C.white, { x: 2.5, y: 7.5, z: -2.5 }))
  g.add(noLine(torus(0.8, 0.18, C.pink, { x: 2.5, y: 8.05, z: -2.5, rx: PI / 2 })))
  g.add(rbox(4.5, 5.5, 0.3, NORI, { x: -2, y: 6.5, z: -6.8, rx: -0.3 }, 0.1))
  const r = rng(5)
  for (let i = 0; i < 8; i++) g.add(noLine(cyl(0.45, 0.45, 0.3, C.leaf, { x: (r() - 0.5) * 6, y: 7.8, z: (r() - 0.5) * 3 + 0.5 }, 8)))
  const cs = chopsticks(sticks)
  cs.position.set(0, 9.3, 4)
  g.add(cs)
  return g
}

function pudding(p: string[]) {
  const [plate, cream, cherry] = p
  const g = new THREE.Group()
  g.add(dish(5.5, plate, {}, 1.1))
  g.add(cyl(3, 3.7, 4.2, '#ffd86b', { y: 0.4 }))
  g.add(puck(3.1, 0.7, '#a8592e', { y: 4.3 }))
  g.add(ball(1.5, cream, { y: 5.6 }, [1, 0.8, 1]))
  g.add(ball(0.9, cherry, { y: 7.3 }))
  g.add(rod(0, 8, 0.8, 9.4, 0.12, C.leafD))
  return g
}

// ---------- 厨房电器 / 锅具 ----------

function kettle(p: string[]) {
  const [body, base, acc] = p
  const g = new THREE.Group()
  g.add(puck(8, 2, base))
  g.add(cyl(6, 7.5, 14.5, body, { y: 2 }, 32))
  g.add(puck(6.3, 1.6, shade(body, -0.04), { y: 16 }))
  g.add(ball(1, acc, { y: 18 }))
  g.add(rbox(2.2, 11, 3, base, { x: -9.6, y: 4.5 }, 1))
  g.add(rbox(4.2, 2, 3, base, { x: -8.2, y: 14.5 }, 0.9))
  g.add(rbox(3.2, 2, 3, base, { x: -8.4, y: 4.5 }, 0.9))
  const sp = cyl(0.8, 2.2, 4.5, body, {}, 16)
  sp.position.set(7.4, 13.5, 0)
  sp.rotation.z = -0.75
  g.add(sp)
  g.add(ball(0.7, acc, { y: 1, z: 7.9 }))
  return g
}

function enamelKettle(p: string[]) {
  const [body, wood, band] = p
  const g = new THREE.Group()
  const x0 = -1.5
  g.add(cyl(5.5, 9, 10, body, { x: x0 }, 32))
  g.add(torus(8.85, 0.4, band, { x: x0, y: 0.6, rx: PI / 2 }))
  g.add(puck(5.6, 1.4, body, { x: x0, y: 9.4 }))
  g.add(puck(4.5, 1.2, body, { x: x0, y: 10.6 }))
  g.add(ball(1.2, wood, { x: x0, y: 12.4 }))
  const sp = cyl(0.7, 1.6, 8, body, {}, 16)
  sp.position.set(x0 + 9, 7, 0)
  sp.rotation.z = -0.9
  g.add(sp)
  for (const s of [-1, 1]) g.add(cyl(0.4, 0.4, 3, C.steel, { x: x0 + s * 5.2, y: 9.5 }, 8))
  g.add(torus(5.2, 0.5, C.steel, { x: x0, y: 12 }, PI))
  g.add(hcyl(1, 1, 5, wood, x0, 17.2, 0, 'x'))
  return g
}

function tetsubin(p: string[]) {
  const [iron, grip, knob] = p
  const g = new THREE.Group()
  const x0 = -1.5
  g.add(ball(7.5, iron, { x: x0, y: 6.2 }, [1, 0.82, 1]))
  // 霰（表面的小疙瘩）
  for (const [dy, n] of [
    [1.5, 16],
    [3.4, 13],
  ]) {
    const rr = 7.5 * Math.sqrt(1 - (dy / 6.15) ** 2)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + dy
      g.add(noLine(ball(0.42, shade(iron, 0.06), { x: x0 + Math.cos(a) * rr, y: 6.2 + dy, z: Math.sin(a) * rr })))
    }
  }
  g.add(puck(3.6, 1.2, iron, { x: x0, y: 11.6 }))
  g.add(ball(1, knob, { x: x0, y: 13.4 }))
  const sp = cyl(0.7, 1.4, 5, iron, {}, 10)
  sp.position.set(x0 + 8, 8.5, 0)
  sp.rotation.z = -0.95
  g.add(sp)
  g.add(torus(6.5, 0.55, grip, { x: x0, y: 9, ry: PI / 2 }, PI))
  for (const s of [-1, 1]) g.add(ball(0.8, iron, { x: x0, y: 9, z: s * 6.5 }))
  return g
}

function mokaPot(p: string[]) {
  const [metal, knob] = p
  const g = new THREE.Group()
  const x0 = 1.2
  g.add(cyl(4.2, 5, 8, metal, { x: x0 }, 8))
  g.add(cyl(3.6, 3.6, 1, shade(metal, -0.1), { x: x0, y: 8 }, 8))
  g.add(cyl(4.6, 3.8, 8, metal, { x: x0, y: 9 }, 8))
  g.add(cyl(4.2, 4.6, 1.4, metal, { x: x0, y: 17 }, 8))
  g.add(cyl(0.8, 1.1, 1.3, knob, { x: x0, y: 18.4 }, 8))
  g.add(rbox(2.4, 1.2, 2, metal, { x: x0 + 4.6, y: 15.6, rz: -0.3 }, 0.3))
  g.add(rbox(1.6, 7.5, 2, knob, { x: x0 - 7.6, y: 9.5 }, 0.6))
  for (const y of [9.5, 15.5]) g.add(rbox(3.8, 1.4, 2, knob, { x: x0 - 5.4, y }, 0.5))
  g.add(ball(0.7, M.silver, { x: x0 + 4.8, y: 4 }))
  return g
}

function pourOver(p: string[]) {
  const [wood, dripper] = p
  const g = new THREE.Group()
  g.add(rbox(14, 1.6, 13, wood, {}, 0.6))
  g.add(rbox(2, 22.4, 2, wood, { z: -5.2, y: 1.4 }, 0.6))
  g.add(rbox(2, 1.6, 9, wood, { y: 17, z: -1 }, 0.6))
  g.add(torus(4.5, 0.5, shade(wood, -0.15), { y: 17.8, z: 1.5, rx: PI / 2 }))
  g.add(cup(5.4, 2.4, 6, 0.4, dripper, { y: 17.2, z: 1.5 }))
  g.add(liquid(4.2, 22.6, '#6b4a35', 0, 1.5))
  g.add(glassy(cup(4.2, 4.6, 12, 0.4, C.glass, { y: 1.6, z: 1.5 }), C.glass, 0.4))
  g.add(cyl(4, 4.2, 5, COFFEE, { y: 2, z: 1.5 }))
  g.add(glassy(handle(2.6, 0.6, C.glass, 4.6, 7.5, 1, 1.5), C.glass, 0.5))
  return g
}

function riceCooker(s: number) {
  return (p: string[]) => {
    const [body, panel, acc] = p
    const W = 26 * s
    const D = 30 * s
    const g = new THREE.Group()
    g.add(rbox(W, 14 * s, D, body, {}, 4 * s))
    g.add(ball(10, shade(body, 0.03), { y: 14 * s }, [1.25 * s, 0.55 * s, 1.42 * s]))
    g.add(torus(9 * s, 0.9 * s, panel, { y: 14 * s, z: -2 * s, rx: -PI / 2 + 0.6 }, PI))
    g.add(puck(1.6 * s, 0.8, acc, { y: 19.2 * s, z: -3 * s }))
    g.add(rbox(14 * s, 6 * s, 1.2, panel, { y: 4 * s, z: D / 2 + 0.2 }, 0.5))
    g.add(glow(5 * s, 2 * s, '#bfe9c8', { y: 6.8 * s, z: D / 2 + 0.9 }, 0.5))
    for (const sx of [-1, 1]) g.add(ball(0.9 * s, acc, { x: sx * 4 * s, y: 5.5 * s, z: D / 2 + 0.9 }))
    return g
  }
}

function toaster(p: string[]) {
  const [body, base, lever] = p
  const g = new THREE.Group()
  g.add(rbox(26, 1.2, 15, base, {}, 0.5))
  g.add(rbox(28, 16, 17, body, { y: 1 }, 4.5))
  for (const z of [-2.4, 2.4]) {
    g.add(rbox(17, 0.6, 2.6, '#4a3a36', { y: 16.75, z }, 0.25))
    g.add(rbox(13, 8.5, 1.4, CRUST, { y: 11, z }, 0.6))
    g.add(rbox(12.2, 7.8, 1.7, BREAD, { y: 11.35, z }, 0.6))
  }
  g.add(rbox(2.2, 1.6, 3, lever, { x: 14.6, y: 10 }, 0.6))
  g.add(hcyl(1.4, 1.4, 1, lever, 9, 6.5, 8.7, 'z'))
  return g
}

function coffeeMaker(p: string[]) {
  const [body, acc, btn] = p
  const g = new THREE.Group()
  g.add(rbox(20, 3, 24, body, {}, 1.5))
  g.add(rbox(20, 27, 9, body, { z: -7.5 }, 2))
  g.add(rbox(20, 6, 19, body, { y: 21, z: -2.5 }, 2))
  g.add(glow(6, 1.5, '#bfe9c8', { x: -5, y: 23, z: 7.1 }, 0.5))
  g.add(puck(5.5, 0.5, M.char, { y: 3, z: 3.5 }))
  g.add(glassy(cup(4.8, 5.4, 13, 0.4, C.glass, { y: 3.5, z: 3.5 }), C.glass, 0.4))
  g.add(cyl(4.5, 4.8, 6, COFFEE, { y: 3.9, z: 3.5 }))
  g.add(puck(5, 1.2, acc, { y: 16.3, z: 3.5 }))
  g.add(handle(3.5, 0.7, acc, 5.3, 10, 1, 3.5))
  g.add(ball(0.8, btn, { x: 6, y: 1.5, z: 12 }))
  return g
}

function espresso(p: string[]) {
  const [body, dark, accent] = p
  const g = new THREE.Group()
  g.add(rbox(28, 4, 30, body, { z: -1 }, 1.5))
  g.add(rbox(28, 30, 14, body, { y: 4, z: -9 }, 2))
  g.add(rbox(28, 6, 8, body, { y: 28, z: 2 }, 1.5))
  g.add(rbox(18, 0.6, 12, dark, { y: 4.1, z: 6 }, 0.2))
  g.add(cyl(3.2, 3.2, 3, M.silver, { y: 25, z: 2 }))
  g.add(cyl(3.4, 3, 2.4, dark, { y: 22.6, z: 2 }))
  g.add(rbox(2, 1.6, 10, accent, { y: 23, z: 11 }, 0.7))
  g.add(cup(2.6, 2.2, 5, 0.4, M.white, { y: 4.7, z: 2 }))
  g.add(liquid(2.1, 7.5, '#5a3624', 0, 2))
  g.add(cyl(0.4, 0.4, 14, M.silver, { x: 11, y: 9, z: 0 }, 8))
  g.add(rbox(1.5, 1.5, 2.6, M.silver, { x: 11, y: 21.5, z: -1.2 }, 0.4))
  g.add(hcyl(2, 2, 0.8, M.white, -8, 31, 6.2, 'z'))
  g.add(torus(2, 0.35, M.silver, { x: -8, y: 31, z: 6.6 }))
  for (const x of [5, 9]) g.add(ball(0.8, accent, { x, y: 31, z: 6 }))
  return g
}

function microwave(p: string[]) {
  const [body, panel, btn] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1, 1, 1.2, C.ink, { x: sx * 19, z: sz * 13 }, 8))
  g.add(rbox(46, 27, 34, body, { y: 1 }, 3))
  g.add(rbox(31, 23, 1, shade(body, 0.03), { x: -6.5, y: 3, z: 17 }, 1.2))
  g.add(glow(23, 15, '#4e5a6a', { x: -8, y: 7, z: 17.6 }, 0.1))
  g.add(rbox(1.8, 15, 2, panel, { x: 7, y: 7, z: 17.8 }, 0.8))
  g.add(rbox(10, 23, 1, panel, { x: 16.5, y: 3, z: 17 }, 1.2))
  g.add(glow(7, 2.5, '#bfe9c8', { x: 16.5, y: 21.5, z: 17.6 }, 0.5))
  g.add(hcyl(2.2, 2.2, 1.2, btn, 16.5, 13, 17.8, 'z'))
  for (const x of [14.5, 18.5]) g.add(rbox(3, 1.4, 0.8, btn, { x, y: 6, z: 17.6 }, 0.3))
  return g
}

function spiceRack(p: string[]) {
  const [wood, lid, label] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(1.4, 18, 10, wood, { x: s * 12.3 }, 0.5))
  const cont = ['#d9534f', '#7fa65a', '#f5f0e6', '#a8683a', '#e3b549', '#5a4a3a', '#e8833a', '#cfd8a0']
  let k = 0
  for (const y of [0, 9]) {
    g.add(rbox(24, 1.2, 10, wood, { y }, 0.4))
    g.add(rbox(23.4, 1.2, 0.8, wood, { y: y + 4.5, z: -4.4 }, 0.3))
    for (const x of [-8.4, -2.8, 2.8, 8.4]) {
      g.add(cyl(2.1, 2.1, 5.6, cont[k++ % cont.length], { x, y: y + 1.2 }, 20))
      g.add(cyl(2.17, 2.17, 2, label, { x, y: y + 2.4 }, 20))
      g.add(puck(2.25, 1.4, lid, { x, y: y + 6.4 }))
    }
  }
  return g
}

function cuttingBoard(p: string[]) {
  const [board, knifeH] = p
  const g = new THREE.Group()
  g.add(rbox(32, 2, 20, board, {}, 0.8))
  g.add(ball(3.4, TOMATO, { x: -8, y: 4.9, z: -3 }, [1, 0.85, 1]))
  g.add(puck(1, 0.4, C.leafD, { x: -8, y: 7.6, z: -3 }))
  g.add(cyl(0.18, 0.18, 0.8, C.leafD, { x: -8, y: 7.9, z: -3 }, 6))
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group()
    s.add(cyl(3, 3, 0.7, TOMATO, {}, 24))
    s.add(noLine(puck(2.2, 0.2, '#ffb0a0', { y: 0.65 })))
    s.position.set(-1 + i * 2.2, 2.3 + i * 0.25, 3)
    s.rotation.z = -0.22
    g.add(s)
  }
  g.add(rbox(11, 0.3, 2.6, C.steel, { x: 4, y: 2, z: -6 }, 0.12))
  g.add(rbox(7, 1.4, 1.8, knifeH, { x: 12.5, y: 2, z: -6 }, 0.6))
  return g
}

function fryingPan(r: number) {
  return (p: string[]) => {
    const [pan, grip] = p
    const L = r * 1.4
    const px = -(L - 0.5) / 2
    const h = 4.5 * (r / 13)
    const g = new THREE.Group()
    g.add(cup(r, r - 2, h, 0.6, pan, { x: px }))
    g.add(rbox(L, 1.6, 2.8, grip, { x: px + r - 0.5 + L / 2, y: h - 1.6, rz: 0.12 }, 0.7))
    g.add(puck(r * 0.38, 0.6, C.white, { x: px - 1, y: 0.6 }))
    g.add(ball(1.6, '#ffb300', { x: px - 1, y: 1.3 }, [1, 0.6, 1]))
    return g
  }
}

function pot(r: number) {
  return (p: string[]) => {
    const [body, grip, stripe] = p
    const h = r * 1.2
    const g = new THREE.Group()
    g.add(cup(r, r, h, 0.7, body))
    g.add(torus(r + 0.05, 0.3, stripe, { y: h * 0.72, rx: PI / 2 }))
    for (const s of [-1, 1]) g.add(rbox(3.6, 1.5, 5.5, grip, { x: s * (r + 1.2), y: h * 0.7 }, 0.6))
    g.add(puck(r + 0.5, 1.2, body, { y: h - 0.2 }))
    g.add(ball(r * 0.92, body, { y: h + 0.6 }, [1, 0.22, 1]))
    g.add(puck(2, 1.6, grip, { y: h + 0.4 + 0.2 * r }))
    return g
  }
}

function donabe(p: string[]) {
  const [body, lid, line] = p
  const g = new THREE.Group()
  g.add(puck(7, 1, shade(body, -0.08)))
  g.add(ball(11, body, { y: 7 }, [1, 0.62, 1]))
  for (const s of [-1, 1]) g.add(torus(2.2, 0.8, body, { x: s * 11.5, y: 8.5, rx: PI / 2 }))
  g.add(ball(10, lid, { y: 11 }, [1, 0.42, 1]))
  g.add(torus(10, 0.3, line, { y: 11.3, rx: PI / 2 }))
  g.add(ball(1.8, body, { y: 15.4 }, [1, 0.6, 1]))
  g.add(ball(0.5, C.ink, { x: 4, y: 14.4, z: 1.5 }))
  return g
}

function condiments(p: string[]) {
  const [cap, body, cap2] = p
  const g = new THREE.Group()
  const soy = '#5c3326'
  g.add(cyl(1.8, 2.2, 6, soy, { x: -3.5 }))
  g.add(cyl(0.9, 1.8, 2, soy, { x: -3.5, y: 6 }))
  g.add(cyl(0.4, 1.1, 2, cap, { x: -3.5, y: 7.8 }))
  g.add(cyl(1.7, 1.7, 5.5, body, { x: 1 }))
  g.add(puck(1.75, 1.6, cap2, { x: 1, y: 5.3 }))
  g.add(cyl(1.7, 1.7, 5.5, body, { x: 4.6 }))
  g.add(puck(1.75, 1.6, cap, { x: 4.6, y: 5.3 }))
  return g
}

// ---------- 洗护 / 化妆 ----------

function makeupMirror(p: string[]) {
  const [main, back, acc] = p
  const g = new THREE.Group()
  g.add(puck(6, 1.8, main))
  g.add(cyl(0.8, 0.9, 6.2, main, { y: 1.6 }, 12))
  g.add(rbox(21.2, 1.2, 1.2, main, { y: 7.4 }, 0.5))
  for (const s of [-1, 1]) {
    g.add(rbox(1.2, 11.2, 1.2, main, { x: s * 10, y: 7.4 }, 0.5))
    g.add(ball(0.9, acc, { x: s * 9.4, y: 18 }))
  }
  const m = new THREE.Group()
  m.add(torus(8, 1.2, main))
  const glass = cyl(7.6, 7.6, 0.6, C.glass, {}, 32)
  glass.rotation.x = PI / 2
  glass.position.set(0, 0, 0)
  glass.material = toon(C.glass, { emissive: 0.15 })
  m.add(noLine(glass))
  const bk = cyl(7.9, 7.9, 0.8, back, {}, 32)
  bk.rotation.x = PI / 2
  bk.position.set(0, 0, -0.75)
  m.add(bk)
  m.position.set(0, 18, 0)
  m.rotation.x = -0.12
  g.add(m)
  return g
}

function perfume(p: string[]) {
  const [body, cap, label] = p
  const g = new THREE.Group()
  g.add(rbox(5.6, 6.5, 3.8, body, {}, 1.2))
  g.add(rbox(3, 2, 0.4, label, { y: 2.2, z: 1.85 }, 0.15))
  g.add(cyl(0.9, 0.9, 1.4, cap, { y: 6.3 }, 12))
  g.add(cyl(1.9, 1.9, 2.6, cap, { y: 7.6 }, 8))
  return g
}

function toothbrushCup(p: string[]) {
  const [main, b1, b2] = p
  const g = new THREE.Group()
  g.add(cup(3.2, 2.8, 9, 0.5, main))
  const brush = (color: string, x: number, z: number, rz: number) => {
    const b = new THREE.Group()
    b.add(cyl(0.45, 0.4, 15, color, {}, 10))
    b.add(rbox(0.8, 2.2, 1.1, C.white, { y: 12.4, z: 0.6 }, 0.3))
    b.position.set(x, 0.6, z)
    b.rotation.z = rz
    g.add(b)
  }
  brush(b1, -0.8, 0.4, 0.15)
  // 倾角不超过 0.15：杯口处刷柄外沿在内壁（半径 2.7）以内
  brush(b2, 0.8, -0.4, -0.13)
  return g
}

function handSoap(p: string[]) {
  const [bottle, pump, label] = p
  const g = new THREE.Group()
  g.add(cyl(3.2, 3.3, 10, bottle, {}, 28))
  g.add(puck(3.2, 2.4, bottle, { y: 8.8 }))
  g.add(cyl(3.4, 3.4, 4, label, { y: 3 }, 28))
  g.add(cyl(1.2, 1.2, 1.4, pump, { y: 11 }, 12))
  g.add(cyl(1.6, 1.6, 1.2, pump, { y: 12.2 }, 12))
  g.add(cyl(0.5, 0.5, 2, pump, { y: 13.4 }, 8))
  g.add(rbox(1.8, 1.4, 1.8, pump, { y: 15.2 }, 0.5))
  g.add(rbox(0.8, 0.7, 2.5, pump, { y: 15.6, z: 1.6 }, 0.3))
  return g
}

function towelRoll(p: string[]) {
  const [basket, t1, t2] = p
  const g = new THREE.Group()
  g.add(tray(24, 5, 14, 0.8, basket, {}, 0.3))
  const cols = [t1, t2, t1]
  for (let i = -1; i <= 1; i++) {
    const c = cols[i + 1]
    g.add(hcyl(2.8, 2.8, 12, c, i * 7.2, 3.6, 0, 'z', 20))
    g.add(noLine(torus(1.4, 0.25, shade(c, -0.14), { x: i * 7.2, y: 3.6, z: 6.1 })))
  }
  return g
}

function cosmeticBox(p: string[]) {
  const [box, brushC, acc] = p
  const g = new THREE.Group()
  g.add(tray(22, 7, 14, 0.7, box, {}, 0.3))
  g.add(rbox(0.6, 6.3, 12.6, box, { x: 3, y: 0.7 }, 0.2))
  const lips = [C.pink, '#e04a5f', '#c86b6b']
  ;[-7, -5.2, -3.4].forEach((x, i) => {
    g.add(cyl(0.9, 0.9, 4.6, BRASS, { x, y: 0.7, z: -3 }, 12))
    g.add(cyl(0.65, 0.65, 1.8, lips[i], { x, y: 5.3, z: -3 }, 12))
  })
  ;[-8, -6, -4].forEach((x, i) => {
    const b = new THREE.Group()
    b.add(cyl(0.35, 0.45, 9, brushC, {}, 8))
    b.add(cyl(0.5, 0.5, 1.5, M.silver, { y: 9 }, 8))
    b.add(capsule(0.6, 1.2, '#5a4646', { y: 10.3 }))
    b.position.set(x, 0.7, 2.5)
    b.rotation.z = (i - 1) * 0.15
    g.add(b)
  })
  g.add(puck(2.6, 1.2, acc, { x: 6.8, y: 0.7, z: -3 }))
  g.add(puck(2.6, 1, brushC, { x: 6.8, y: 1.9, z: -3 }))
  g.add(cyl(1.6, 1.6, 5, acc, { x: 6.8, y: 0.7, z: 3 }, 16))
  g.add(cyl(0.8, 0.8, 1.6, M.silver, { x: 6.8, y: 5.7, z: 3 }, 12))
  return g
}

function lipstick(p: string[]) {
  const [tube, bullet, ring] = p
  const g = new THREE.Group()
  g.add(cyl(1.1, 1.1, 4, tube, { x: -1.6, z: 1 }, 16))
  g.add(cyl(1, 1, 1.2, ring, { x: -1.6, y: 4, z: 1 }, 16))
  g.add(cyl(0.75, 0.75, 1.3, bullet, { x: -1.6, y: 5.2, z: 1 }, 16))
  g.add(ball(0.75, bullet, { x: -1.6, y: 6.5, z: 1, rz: 0.4 }, [1, 1.1, 1]))
  g.add(hcyl(1.15, 1.15, 3.8, tube, 2, 1.15, 1.2, 'x'))
  g.add(hcyl(1.1, 1.1, 6.4, tube, 0.4, 1.1, -2, 'x'))
  g.add(torus(1.05, 0.12, ring, { x: 0.8, y: 1.1, z: -2, ry: PI / 2 }))
  return g
}

function lotionSet(p: string[]) {
  const [bottle, cap, jar] = p
  const g = new THREE.Group()
  g.add(cyl(2.4, 2.6, 11, bottle, { x: -3.8 }, 24))
  g.add(puck(2.4, 1.6, bottle, { x: -3.8, y: 10.2 }))
  g.add(cyl(1.2, 1.2, 3.2, cap, { x: -3.8, y: 11.6 }, 16))
  g.add(cyl(3, 3, 3, jar, { x: 2.6, z: 1 }, 24))
  g.add(puck(3.15, 1.4, cap, { x: 2.6, y: 2.8, z: 1 }))
  g.add(cyl(1.3, 1.3, 4.2, '#d79a4f', { x: 3.4, z: -2.6 }, 16))
  g.add(cyl(0.7, 0.7, 0.8, cap, { x: 3.4, y: 4.2, z: -2.6 }, 12))
  g.add(capsule(0.7, 1.2, cap, { x: 3.4, y: 4.6, z: -2.6 }))
  return g
}

function comb(p: string[]) {
  const [main, scr] = p
  const g = new THREE.Group()
  g.add(rbox(16, 1, 1.8, main, { x: -2, z: -1.6 }, 0.4))
  for (let i = 0; i < 20; i++) g.add(rbox(0.4, 0.6, 3, main, { x: -9.6 + i * 0.8, z: 0.6 }, 0.15))
  g.add(torus(2, 0.85, scr, { x: 8.5, y: 0.85, rx: PI / 2 }))
  return g
}

function hairDryer(p: string[]) {
  const [body, nozzle, btn] = p
  const g = new THREE.Group()
  const x0 = -1.7
  g.add(rbox(3.6, 13, 3, body, { x: x0 }, 1.2))
  g.add(rbox(1.4, 2.6, 1, btn, { x: x0, y: 9, z: 1.6 }, 0.4))
  g.add(hcyl(4, 4, 13, body, x0, 16.5, 0, 'x', 24))
  g.add(ball(4, body, { x: x0 - 6.5, y: 16.5 }, [0.4, 1, 1]))
  g.add(hcyl(3.2, 3.2, 0.5, nozzle, x0 - 8, 16.5, 0, 'x', 24))
  g.add(hcyl(2.8, 3.8, 5, nozzle, x0 + 8.9, 16.5, 0, 'x', 24))
  return g
}

// ---------- 玩具 ----------

function rubberDuck(p: string[]) {
  const [body, beak, blush] = p
  const g = new THREE.Group()
  g.add(ball(3.6, body, { y: 3.4 }, [1.2, 0.95, 1.25]))
  g.add(ball(1.6, body, { y: 4.8, z: -4, rx: -0.4 }, [1, 0.8, 1.2]))
  for (const s of [-1, 1]) g.add(ball(1.6, shade(body, -0.05), { x: s * 3.9, y: 4, z: 0 }, [0.5, 0.8, 1.2]))
  g.add(ball(2.5, body, { y: 8, z: 1.6 }))
  g.add(ball(1.1, beak, { y: 7.3, z: 4 }, [1.1, 0.45, 1]))
  g.add(face(3.2, { y: 8.4, z: 4 }, blush))
  return g
}

function blocks(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const cube = (x: number, y: number, z: number, col: string, ry: number) => g.add(rbox(5, 5, 5, col, { x, y, z, ry }, 0.8))
  cube(-4.6, 0, 0, a, 0.1)
  cube(1, 0, 0.3, b, -0.1)
  cube(-1.8, 5, 0, c, 0.35)
  g.add(at(tri(3.2, 5, a), -1.8, 10, 0, 0.35))
  g.add(cyl(1.8, 1.8, 5, b, { x: 5.9, z: -2.5 }, 20))
  g.add(rbox(3, 3, 3, c, { x: 6, z: 2.6, ry: 0.5 }, 0.6))
  return g
}

function toyCar(p: string[]) {
  const [body, hub, light] = p
  const g = new THREE.Group()
  g.add(rbox(11, 2.8, 5.2, body, { y: 1.2 }, 1))
  g.add(rbox(6, 2.4, 4.6, body, { x: -0.6, y: 3.7 }, 1.2))
  g.add(rbox(5.2, 1.4, 4.8, C.glass, { x: -0.6, y: 4.3 }, 0.4))
  g.add(rbox(6.2, 1.4, 3.8, C.glass, { x: -0.6, y: 4.3 }, 0.4))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(hcyl(1.3, 1.3, 1, M.char, sx * 3.4, 1.3, sz * 2.4, 'z'))
      g.add(hcyl(0.6, 0.6, 1.1, hub, sx * 3.4, 1.3, sz * 2.4, 'z'))
    }
  for (const sz of [-1, 1]) g.add(ball(0.5, light, { x: 5.45, y: 2.8, z: sz * 1.6 }))
  return g
}

function bunnyPlush(p: string[]) {
  const [fur, inner, ribbon] = p
  const g = new THREE.Group()
  g.add(ball(5.5, fur, { y: 5.3 }, [1, 0.95, 0.9]))
  g.add(ball(5, fur, { y: 14 }))
  for (const s of [-1, 1]) {
    g.add(capsule(1.4, 5, fur, { x: s * 2, y: 17.5, rz: -s * 0.15 }))
    g.add(noLine(capsule(0.75, 3.6, inner, { x: s * 2.05, y: 18.2, z: 0.85, rz: -s * 0.15 })))
    g.add(ball(1.6, fur, { x: s * 2.6, y: 7, z: 4 }))
    g.add(ball(2, fur, { x: s * 2.8, y: 1.3, z: 3.4 }, [1, 0.65, 1.3]))
    g.add(ball(1, ribbon, { x: s * 1.1, y: 9.6, z: 3.2 }, [1.2, 0.8, 0.5]))
  }
  g.add(ball(0.5, ribbon, { y: 9.6, z: 3.5 }))
  g.add(face(5, { y: 14, z: 4.75 }))
  g.add(ball(0.4, '#ff8fa3', { y: 13, z: 4.95 }))
  g.add(ball(1.8, C.white, { y: 4.5, z: -5 }))
  return g
}

function showaThermos(p: string[]) {
  const [body, flower, trim] = p
  const g = new THREE.Group()
  g.add(cyl(7.5, 7.8, 2, trim, {}, 28))
  g.add(cyl(6.8, 7.2, 22, body, { y: 2 }, 28))
  const fl: [number, number][] = [
    [-0.6, 7],
    [0.2, 13],
    [0.9, 8.5],
    [-0.25, 18.5],
  ]
  for (const [th, y] of fl) {
    const f = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2
      f.add(ball(1, flower, { x: Math.cos(a) * 1.2, y: Math.sin(a) * 1.2 }, [1, 1, 0.3]))
    }
    f.add(ball(0.6, C.lemon, { z: 0.15 }, [1, 1, 0.4]))
    f.add(ball(1, R.olive, { x: 1.4, y: -1.8, z: -0.05, rz: 0.6 }, [0.5, 1, 0.25]))
    const rr = 7.1 - (y - 2) * (0.4 / 22)
    f.position.set(Math.sin(th) * rr, y, Math.cos(th) * rr)
    f.rotation.y = th
    g.add(noLine(f))
  }
  g.add(puck(7.1, 3, trim, { y: 23.5 }))
  g.add(ball(4.5, trim, { y: 26 }, [1, 0.6, 1]))
  g.add(rbox(3.5, 1.2, 4, body, { y: 28.2 }, 0.5))
  g.add(torus(6, 0.8, trim, { y: 26.5 }, PI))
  g.add(rbox(3, 2.4, 4, trim, { y: 23, z: 7.5 }, 0.8))
  return g
}

// ---------- 素材表 ----------

export const PROPS_HOME: AssetDef[] = [
  // —— 杯 / 茶具 ——
  def({
    id: 'prop-mug',
    name: '马克杯',
    category: 'kitchenware',
    family: 'mug',
    sizeLabel: '标准',
    w: 12,
    d: 8,
    h: 9,
    pals: [
      ['cute', C.pink, C.white, C.white],
      ['cute', C.sky, C.white, C.lemon],
      ['nordic', N.white, N.oak, N.blue],
      ['modern', M.char, M.char, M.silver],
      ['retro', R.mustard, R.cream, R.orange],
    ],
    build: mug(1),
    fx: mugFx(1),
  }),
  def({
    id: 'prop-mug-l',
    name: '马克杯',
    category: 'kitchenware',
    family: 'mug',
    sizeLabel: '大',
    w: 14,
    d: 9.2,
    h: 10.5,
    pals: [
      ['cute', C.mint, C.white, C.pink],
      ['nordic', N.sage, N.white, N.white],
      ['modern', M.white, M.white, M.black],
      ['industrial', I.concrete, I.iron, I.rust],
      ['retro', R.teal, R.cream, R.mustard],
    ],
    build: mug(1.17),
    fx: mugFx(1.17),
  }),
  def({
    id: 'prop-tea-set',
    name: '茶具',
    category: 'kitchenware',
    w: 30,
    d: 22,
    h: 12,
    pals: [
      ['cute', C.mint, C.woodL, C.white],
      ['japanese', '#a0522d', J.hinoki, J.washi],
      ['japanese', J.ai, J.wood, J.washi],
      ['nordic', N.sage, N.oak, N.white],
      ['modern', M.white, M.walnut, M.white],
    ],
    build: teaSet,
    fx: [
      { kind: 'steam', x: 8, y: 6.2, z: -4, scale: 0.45 },
      { kind: 'steam', x: 9.5, y: 6.2, z: 5, scale: 0.45 },
    ],
  }),
  def({
    id: 'prop-coffee-cup',
    name: '咖啡杯碟',
    family: 'prop-coffee-cup',
    sizeLabel: '标准',
    category: 'kitchenware',
    w: 13,
    d: 13,
    h: 6,
    pals: [
      ['cute', C.white, C.pink, C.pink],
      ['nordic', N.white, N.blue, N.blue],
      ['modern', M.black, M.white, M.white],
      ['retro', R.cream, R.teal, R.teal],
    ],
    build: coffeeCup,
    fx: [{ kind: 'steam', x: 0, y: 5.9, z: 0, scale: 0.55 }],
  }),
  def({
    id: 'prop-glass-pitcher',
    name: '玻璃水壶',
    category: 'kitchenware',
    w: 22,
    d: 11,
    h: 22.5,
    pals: [
      ['cute', C.glass, C.pink, C.lemon],
      ['nordic', C.glass, N.oak, N.mustard],
      ['modern', C.glass, M.black, M.silver],
      ['retro', '#ffd99a', R.orange, R.mustard],
    ],
    build: glassPitcher,
  }),
  def({
    id: 'prop-sake-set',
    name: '清酒酒器',
    category: 'kitchenware',
    w: 22,
    d: 14,
    h: 13.5,
    styles: ['japanese'],
    pals: [
      ['japanese', J.washi, J.ai, J.sumi],
      ['japanese', '#4a3b32', J.washi, J.shu],
      ['japanese', J.ai, J.washi, J.wood],
    ],
    build: sakeSet,
  }),
  def({
    id: 'prop-cream-soda',
    name: '奶油苏打',
    category: 'kitchenware',
    w: 9,
    d: 9,
    h: 22,
    pals: [
      ['retro', '#7fd18a', R.cream, R.red],
      ['retro', '#7cc6e8', R.cream, R.red],
      ['cute', '#ffb6c8', CREAM, '#ff4d5e'],
    ],
    build: creamSoda,
  }),

  // —— 花 / 果 ——
  def({
    id: 'prop-vase-flowers',
    name: '花瓶插花',
    family: 'prop-vase-flowers',
    sizeLabel: '标准',
    category: 'tabletop',
    w: 14,
    d: 10,
    h: 31,
    pals: [
      ['cute', C.sky, C.pink, C.lemon],
      ['cute', C.white, C.lilac, C.lemon],
      ['nordic', N.gray, N.white, N.mustard],
      ['japanese', J.sumi, J.shu, J.washi],
      ['modern', M.black, M.white, M.light],
      ['retro', R.teal, R.orange, R.mustard],
    ],
    build: vaseFlowers,
  }),
  def({
    id: 'prop-mikan-basket',
    name: '一筐橘子',
    category: 'kitchenware',
    w: 25,
    d: 25,
    h: 15,
    pals: [
      ['cute', C.woodL, C.wood, C.leaf],
      ['japanese', J.hinoki, J.wood, C.leafD],
      ['nordic', N.oakL, N.gray, N.sage],
      ['retro', R.caramel, R.cream, R.olive],
    ],
    build: mikanBasket,
  }),
  def({
    id: 'prop-fruit-bowl',
    name: '果盘',
    family: 'prop-fruit-bowl',
    sizeLabel: '标准',
    category: 'kitchenware',
    w: 24,
    d: 24,
    h: 12,
    pals: [
      ['cute', C.white, C.sky, C.sky],
      ['nordic', N.white, N.oak, N.oak],
      ['modern', M.char, M.silver, M.silver],
      ['japanese', '#8c2f2a', J.dark, J.dark],
      ['retro', R.teal, R.cream, R.cream],
    ],
    build: fruitBowl,
  }),

  // —— 日用小物 ——
  def({
    id: 'prop-key-tray',
    name: '钥匙托盘',
    family: 'prop-key-tray',
    sizeLabel: '标准',
    category: 'tabletop',
    w: 18,
    d: 12,
    h: 2,
    pals: [
      ['cute', C.sakura, C.lemon, C.mint],
      ['nordic', N.oak, N.white, N.mustard],
      ['modern', M.char, M.silver, M.white],
      ['industrial', I.leather, I.steel, I.rust],
      ['japanese', J.wood, J.washi, J.shu],
    ],
    build: keyTray,
  }),
  def({
    id: 'prop-tissue-box',
    name: '纸巾盒',
    category: 'tabletop',
    w: 24.4,
    d: 12.4,
    h: 13,
    pals: [
      ['cute', C.sakura, C.pink, C.white],
      ['nordic', N.oak, N.white, N.white],
      ['modern', M.char, M.gray, M.white],
      ['japanese', J.washi, J.ai, J.ai],
      ['retro', R.mustard, R.teal, R.cream],
    ],
    build: tissueBox,
  }),

  // —— 食物 / 餐具 ——
  def({
    id: 'prop-plate-set',
    name: '西餐餐具',
    category: 'kitchenware',
    w: 36,
    d: 26,
    h: 2.2,
    pals: [
      ['cute', C.sakura, C.white, C.pink],
      ['nordic', N.linen, N.white, N.sage],
      ['modern', M.char, M.white, M.light],
      ['retro', R.mustard, R.cream, R.teal],
    ],
    build: platesWestern,
  }),
  def({
    id: 'prop-rice-miso',
    name: '饭碗味噌汤',
    category: 'kitchenware',
    w: 26,
    d: 17,
    h: 8,
    pals: [
      ['cute', C.white, C.pink, C.sakura],
      ['japanese', J.washi, '#8c2f2a', J.shu],
      ['japanese', J.ai, J.dark, J.hinoki],
      ['nordic', N.white, N.oak, N.sage],
      ['modern', M.white, M.black, M.gray],
    ],
    build: riceMiso,
    fx: [{ kind: 'steam', x: 7, y: 7.2, z: -1.5, scale: 0.7 }],
  }),
  def({
    id: 'prop-bento',
    name: '便当盒',
    category: 'kitchenware',
    w: 20,
    d: 15,
    h: 5,
    pals: [
      ['cute', C.pink, C.sky, C.white],
      ['japanese', '#2b2523', J.shu, J.shu],
      ['nordic', N.oak, N.sage, N.sage],
      ['modern', M.char, M.gray, M.gray],
      ['retro', R.teal, R.orange, R.orange],
    ],
    build: bento,
  }),
  def({
    id: 'prop-cake',
    name: '生日蛋糕',
    category: 'kitchenware',
    w: 21,
    d: 21,
    h: 14,
    pals: [
      ['cute', C.white, C.pink, C.sky],
      ['retro', '#7a4a32', R.cream, R.red],
      ['nordic', N.white, N.sage, N.mustard],
      ['japanese', '#b8c98a', J.washi, J.shu],
    ],
    build: cake,
    fx: CAKE_CANDLES.map(([x, z]) => ({ kind: 'flame', x, y: 13, z, scale: 0.35 })),
  }),
  def({
    id: 'prop-cake-slice',
    name: '草莓蛋糕切块',
    category: 'kitchenware',
    w: 13,
    d: 13,
    h: 9.5,
    pals: [
      ['cute', C.white, C.pink, C.white],
      ['retro', '#7a4a32', R.cream, R.cream],
      ['japanese', '#b8c98a', J.washi, J.washi],
      ['nordic', N.white, N.mustard, N.white],
    ],
    build: cakeSlice,
  }),
  def({
    id: 'prop-donut-plate',
    name: '甜甜圈',
    category: 'kitchenware',
    w: 19,
    d: 19,
    h: 4,
    pals: [
      ['cute', C.white, C.pink, C.sky],
      ['retro', R.cream, R.orange, R.mustard],
      ['nordic', N.white, N.linen, N.mustard],
      ['modern', M.char, M.white, M.light],
    ],
    build: donutPlate,
  }),
  def({
    id: 'prop-onigiri',
    name: '饭团',
    category: 'kitchenware',
    w: 15,
    d: 15,
    h: 6,
    pals: [
      ['cute', C.sakura, C.white, C.white],
      ['japanese', J.washi, J.wood, J.wood],
      ['japanese', J.ai, J.washi, J.washi],
      ['nordic', N.white, N.oak, N.oak],
      ['modern', M.black, M.white, M.white],
    ],
    build: onigiri,
  }),
  def({
    id: 'prop-sushi',
    name: '寿司下駄',
    category: 'kitchenware',
    w: 26,
    d: 11,
    h: 6,
    pals: [
      ['japanese', J.hinoki, J.wood, J.wood],
      ['japanese', J.sumi, J.dark, J.dark],
      ['cute', C.woodL, C.wood, C.wood],
      ['nordic', N.oakL, N.oak, N.oak],
      ['modern', M.char, M.black, M.black],
    ],
    build: sushi,
  }),
  def({
    id: 'prop-ramen',
    name: '拉面',
    category: 'kitchenware',
    w: 22,
    d: 22,
    h: 11.5,
    pals: [
      ['cute', C.white, C.pink, C.woodD],
      ['japanese', J.washi, J.shu, J.wood],
      ['retro', R.cream, R.red, R.caramel],
      ['modern', M.black, M.char, M.walnut],
      ['nordic', N.white, N.blue, N.oak],
    ],
    build: ramen,
    fx: [{ kind: 'steam', x: 0, y: 9.2, z: -1, scale: 1.2 }],
  }),
  def({
    id: 'prop-pudding',
    name: '布丁',
    category: 'kitchenware',
    w: 11,
    d: 11,
    h: 9.5,
    pals: [
      ['cute', C.white, CREAM, '#ff4d5e'],
      ['retro', R.cream, CREAM, R.red],
      ['nordic', N.white, CREAM, N.mustard],
      ['modern', M.char, CREAM, '#c0392b'],
    ],
    build: pudding,
  }),

  // —— 厨房电器 / 锅具 ——
  def({
    id: 'prop-kettle',
    name: '电水壶',
    family: 'prop-kettle',
    sizeLabel: '标准',
    category: 'kitchenware',
    w: 21,
    d: 16,
    h: 19,
    pals: [
      ['cute', C.mint, C.white, C.pink],
      ['nordic', N.white, N.oak, N.gray],
      ['modern', '#2b2c30', M.silver, M.light],
      ['retro', R.cream, R.teal, R.orange],
    ],
    build: kettle,
    fx: [{ kind: 'steam', x: 8.9, y: 15.3, z: 0, scale: 0.55 }],
  }),
  def({
    id: 'prop-enamel-kettle',
    name: '珐琅水壶',
    category: 'kitchenware',
    w: 22,
    d: 18,
    h: 19,
    styles: ['nordic', 'retro'],
    pals: [
      ['nordic', N.white, N.oak, N.blue],
      ['nordic', N.blue, N.oak, N.white],
      ['nordic', N.sage, N.oak, N.white],
      ['nordic', N.mustard, N.oak, N.white],
      ['retro', R.cream, R.caramel, R.red],
    ],
    build: enamelKettle,
    fx: [{ kind: 'steam', x: 10.6, y: 9.6, z: 0, scale: 0.5 }],
  }),
  def({
    id: 'prop-tetsubin',
    name: '南部铁壶',
    category: 'kitchenware',
    w: 20,
    d: 15,
    h: 16.5,
    styles: ['japanese', 'industrial'],
    pals: [
      ['japanese', J.sumi, J.dark, J.shu],
      ['japanese', '#4a3b32', J.sumi, J.hinoki],
      ['industrial', I.iron, I.leather, I.rust],
      ['modern', M.black, M.char, M.silver],
    ],
    build: tetsubin,
    fx: [{ kind: 'steam', x: 8.5, y: 10.1, z: 0, scale: 0.5 }],
  }),
  def({
    id: 'prop-moka-pot',
    name: '摩卡壶',
    category: 'kitchenware',
    w: 16,
    d: 10,
    h: 20,
    styles: ['industrial', 'modern', 'retro'],
    pals: [
      ['industrial', I.steel, I.iron, I.iron],
      ['modern', M.silver, M.black, M.black],
      ['retro', R.red, M.black, M.black],
      ['cute', C.pink, C.ink, C.ink],
    ],
    build: mokaPot,
  }),
  def({
    id: 'prop-pour-over',
    name: '手冲咖啡架',
    category: 'kitchenware',
    w: 14,
    d: 13,
    h: 23,
    styles: ['nordic', 'industrial', 'modern', 'japanese'],
    pals: [
      ['nordic', N.oak, N.white, N.white],
      ['industrial', I.walnut, I.iron, I.iron],
      ['modern', M.walnut, M.white, M.white],
      ['japanese', J.hinoki, J.washi, J.washi],
    ],
    build: pourOver,
  }),
  def({
    id: 'prop-coffee-maker',
    name: '滴滤咖啡机',
    category: 'kitchenware',
    w: 20,
    d: 24,
    h: 27,
    pals: [
      ['cute', C.white, C.pink, C.lemon],
      ['nordic', N.white, N.oak, N.mustard],
      ['modern', M.black, M.silver, M.silver],
      ['retro', R.orange, R.cream, R.cream],
      ['industrial', I.iron, I.steel, I.rust],
    ],
    build: coffeeMaker,
  }),
  def({
    id: 'prop-espresso',
    name: '意式咖啡机',
    category: 'kitchenware',
    w: 28,
    d: 34,
    h: 34,
    styles: ['modern', 'industrial', 'retro'],
    pals: [
      ['modern', M.silver, M.black, M.walnut],
      ['modern', M.black, M.char, M.silver],
      ['modern', M.white, M.char, M.walnut],
      ['industrial', I.steel, I.iron, I.walnut],
      ['retro', R.cream, R.caramel, R.red],
    ],
    build: espresso,
  }),
  def({
    id: 'prop-rice-cooker',
    name: '电饭煲',
    category: 'kitchenware',
    family: 'rice-cooker',
    sizeLabel: '5.5 合',
    w: 26,
    d: 31,
    h: 21,
    pals: [
      ['cute', C.white, C.pink, C.sky],
      ['nordic', N.white, N.gray, N.oak],
      ['modern', M.black, M.char, M.silver],
      ['retro', R.cream, R.olive, R.orange],
    ],
    build: riceCooker(1),
  }),
  def({
    id: 'prop-rice-cooker-s',
    name: '电饭煲',
    category: 'kitchenware',
    family: 'rice-cooker',
    sizeLabel: '3 合',
    w: 22,
    d: 27,
    h: 18,
    pals: [
      ['cute', C.white, C.pink, C.sky],
      ['nordic', N.white, N.gray, N.oak],
      ['modern', M.black, M.char, M.silver],
      ['retro', R.cream, R.olive, R.orange],
    ],
    build: riceCooker(0.85),
  }),
  def({
    id: 'prop-toaster',
    name: '烤面包机',
    category: 'kitchenware',
    w: 30,
    d: 17,
    h: 20,
    pals: [
      ['cute', C.mint, C.white, C.pink],
      ['nordic', N.white, N.oak, N.gray],
      ['modern', M.silver, M.black, M.char],
      ['retro', R.teal, R.cream, R.mustard],
      ['industrial', I.steel, I.iron, I.walnut],
    ],
    build: toaster,
  }),
  def({
    id: 'prop-microwave',
    name: '微波炉',
    category: 'kitchenware',
    w: 46,
    d: 36,
    h: 28,
    pals: [
      ['cute', C.white, C.pink, C.mint],
      ['nordic', N.white, N.gray, N.oak],
      ['modern', M.black, M.char, M.silver],
      ['retro', R.cream, R.teal, R.orange],
      ['industrial', I.steel, I.iron, I.rust],
    ],
    build: microwave,
  }),
  def({
    id: 'prop-spice-rack',
    name: '调味料架',
    category: 'kitchenware',
    w: 26,
    d: 10,
    h: 18,
    pals: [
      ['nordic', N.oak, N.white, N.linen],
      ['cute', C.woodL, C.pink, C.white],
      ['japanese', J.hinoki, J.sumi, J.washi],
      ['industrial', I.iron, I.steel, I.concrete],
      ['modern', M.white, M.char, M.light],
    ],
    build: spiceRack,
  }),
  def({
    id: 'prop-cutting-board',
    name: '砧板番茄',
    category: 'kitchenware',
    w: 32,
    d: 20,
    h: 8,
    pals: [
      ['cute', C.woodL, C.pink, C.pink],
      ['nordic', N.oak, N.white, N.white],
      ['japanese', J.hinoki, J.dark, J.dark],
      ['modern', M.white, M.char, M.char],
      ['industrial', I.walnut, I.iron, I.iron],
    ],
    build: cuttingBoard,
  }),
  def({
    id: 'prop-frying-pan',
    name: '平底锅',
    category: 'kitchenware',
    family: 'frying-pan',
    sizeLabel: '26 cm',
    w: 44,
    d: 26,
    h: 5,
    pals: [
      ['cute', C.pink, C.woodL, C.woodL],
      ['modern', M.black, M.black, M.black],
      ['industrial', I.iron, I.walnut, I.walnut],
      ['nordic', N.blue, N.oak, N.oak],
      ['retro', R.orange, R.caramel, R.caramel],
    ],
    build: fryingPan(13),
  }),
  def({
    id: 'prop-frying-pan-s',
    name: '平底锅',
    category: 'kitchenware',
    family: 'frying-pan',
    sizeLabel: '20 cm',
    w: 34,
    d: 20,
    h: 4,
    pals: [
      ['cute', C.pink, C.woodL, C.woodL],
      ['modern', M.black, M.black, M.black],
      ['industrial', I.iron, I.walnut, I.walnut],
      ['nordic', N.blue, N.oak, N.oak],
      ['retro', R.orange, R.caramel, R.caramel],
    ],
    build: fryingPan(10),
  }),
  def({
    id: 'prop-pot',
    name: '双耳锅',
    category: 'kitchenware',
    family: 'pot',
    sizeLabel: '大',
    w: 28,
    d: 23,
    h: 18,
    pals: [
      ['nordic', N.white, N.oak, N.blue],
      ['cute', C.mint, C.white, C.pink],
      ['modern', M.silver, M.black, M.black],
      ['industrial', I.iron, I.walnut, I.rust],
      ['retro', R.cream, R.red, R.red],
    ],
    build: pot(11),
  }),
  def({
    id: 'prop-pot-s',
    name: '双耳锅',
    category: 'kitchenware',
    family: 'pot',
    sizeLabel: '小',
    w: 22,
    d: 17,
    h: 14,
    pals: [
      ['nordic', N.white, N.oak, N.blue],
      ['cute', C.mint, C.white, C.pink],
      ['modern', M.silver, M.black, M.black],
      ['industrial', I.iron, I.walnut, I.rust],
      ['retro', R.cream, R.red, R.red],
    ],
    build: pot(8),
  }),
  def({
    id: 'prop-donabe',
    name: '土锅',
    category: 'kitchenware',
    w: 30,
    d: 22,
    h: 16.5,
    styles: ['japanese', 'retro'],
    pals: [
      ['japanese', '#5b4636', J.washi, J.shu],
      ['japanese', J.sumi, J.washi, J.ai],
      ['japanese', J.ai, J.washi, J.sumi],
      ['retro', R.caramel, R.cream, R.red],
    ],
    build: donabe,
    fx: [{ kind: 'steam', x: 4, y: 14.9, z: 1.5, scale: 0.6 }],
  }),
  def({
    id: 'prop-showa-thermos',
    name: '昭和保温壶',
    category: 'kitchenware',
    w: 17,
    d: 19,
    h: 34,
    styles: ['retro'],
    pals: [
      ['retro', R.cream, R.orange, R.caramel],
      ['retro', R.cream, R.teal, R.olive],
      ['retro', '#f2d7a7', R.red, '#6e4f37'],
    ],
    build: showaThermos,
  }),
  def({
    id: 'prop-condiments',
    name: '调味瓶',
    category: 'kitchenware',
    w: 12,
    d: 5,
    h: 10,
    pals: [
      ['japanese', J.shu, J.washi, J.sumi],
      ['cute', C.pink, C.white, C.sky],
      ['modern', M.black, M.white, M.silver],
      ['retro', R.red, R.cream, R.teal],
    ],
    build: condiments,
  }),

  // —— 洗护 / 化妆 ——
  def({
    id: 'prop-makeup-mirror',
    name: '化妆镜',
    category: 'toiletry',
    w: 22,
    d: 12,
    h: 28,
    pals: [
      ['cute', C.white, C.pink, C.lemon],
      ['nordic', N.white, N.oak, N.oak],
      ['modern', M.silver, M.black, M.black],
      ['retro', '#d9b25a', R.cream, R.red],
      ['industrial', I.iron, I.steel, I.rust],
    ],
    build: makeupMirror,
  }),
  def({
    id: 'prop-perfume',
    name: '香水瓶',
    family: 'prop-perfume',
    sizeLabel: '标准',
    category: 'toiletry',
    w: 6,
    d: 4,
    h: 10.5,
    pals: [
      ['cute', C.pink, C.lemon, C.sakura],
      ['cute', C.lilac, C.white, C.white],
      ['modern', M.black, M.silver, M.white],
      ['retro', '#e0a526', R.caramel, R.cream],
      ['nordic', N.blue, N.oakL, N.white],
    ],
    build: perfume,
  }),
  def({
    id: 'prop-toothbrush-cup',
    name: '刷牙杯',
    family: 'prop-toothbrush-cup',
    sizeLabel: '标准',
    category: 'toiletry',
    w: 8,
    d: 8,
    h: 16,
    pals: [
      ['cute', C.pink, C.sky, C.mint],
      ['nordic', N.white, N.blue, N.sage],
      ['modern', M.char, M.white, M.gray],
      ['retro', R.teal, R.mustard, R.orange],
    ],
    build: toothbrushCup,
  }),
  def({
    id: 'prop-hand-soap',
    name: '洗手液',
    category: 'toiletry',
    w: 7,
    d: 7,
    h: 17,
    pals: [
      ['cute', C.mint, C.white, C.pink],
      ['nordic', N.white, N.oak, N.sage],
      ['modern', M.black, M.silver, M.white],
      ['japanese', J.washi, J.sumi, J.tatami],
      ['retro', '#c9822f', R.cream, R.cream],
    ],
    build: handSoap,
  }),
  def({
    id: 'prop-towel-roll',
    name: '毛巾卷',
    category: 'toiletry',
    w: 24,
    d: 14,
    h: 7,
    pals: [
      ['cute', C.woodL, C.pink, C.sky],
      ['nordic', N.oak, N.white, N.linen],
      ['japanese', J.hinoki, J.washi, J.ai],
      ['modern', M.char, M.white, M.gray],
      ['retro', R.caramel, R.mustard, R.teal],
    ],
    build: towelRoll,
  }),
  def({
    id: 'prop-cosmetic-box',
    name: '化妆品收纳',
    category: 'toiletry',
    w: 22,
    d: 14,
    h: 13,
    pals: [
      ['cute', C.white, C.pink, C.lilac],
      ['nordic', N.oak, N.white, N.sage],
      ['modern', M.light, M.black, M.silver],
      ['retro', R.cream, R.red, R.mustard],
    ],
    build: cosmeticBox,
  }),
  def({
    id: 'prop-lipstick',
    name: '口红',
    category: 'toiletry',
    w: 7,
    d: 6,
    h: 7.5,
    pals: [
      ['cute', C.pink, '#ff6f91', BRASS],
      ['modern', M.black, '#c0392b', M.silver],
      ['retro', R.mustard, R.red, R.cream],
      ['nordic', N.white, '#d98a8a', N.oak],
    ],
    build: lipstick,
  }),
  def({
    id: 'prop-lotion',
    name: '乳液套装',
    category: 'toiletry',
    w: 12,
    d: 8,
    h: 15,
    pals: [
      ['cute', C.sakura, C.white, C.mint],
      ['nordic', N.white, N.oak, N.sage],
      ['modern', M.white, M.black, M.silver],
      ['japanese', J.washi, J.wood, J.tatami],
      ['retro', R.cream, R.teal, R.mustard],
    ],
    build: lotionSet,
  }),
  def({
    id: 'prop-comb',
    name: '梳子发圈',
    category: 'toiletry',
    w: 22,
    d: 6,
    h: 1.7,
    pals: [
      ['cute', C.pink, C.lilac, C.lilac],
      ['nordic', N.oak, N.sage, N.sage],
      ['japanese', '#e2b86a', J.shu, J.shu],
      ['modern', M.black, M.gray, M.gray],
      ['retro', R.caramel, R.mustard, R.mustard],
    ],
    build: comb,
  }),
  def({
    id: 'prop-hair-dryer',
    name: '吹风机',
    category: 'toiletry',
    w: 20,
    d: 8,
    h: 21,
    pals: [
      ['cute', C.pink, C.white, C.lemon],
      ['nordic', N.white, N.oak, N.sage],
      ['modern', M.black, M.silver, M.silver],
      ['retro', R.mustard, R.cream, R.teal],
    ],
    build: hairDryer,
  }),

  // —— 玩具 ——
  def({
    id: 'prop-rubber-duck',
    name: '玩具小鸭',
    category: 'tabletop',
    w: 9,
    d: 10,
    h: 10.5,
    pals: [
      ['cute', C.lemon, C.orange, '#ff9db0'],
      ['cute', C.pink, C.orange, '#ff9db0'],
      ['retro', R.mustard, R.orange, R.red],
      ['nordic', N.white, N.mustard, '#e8b4a0'],
    ],
    build: rubberDuck,
  }),
  def({
    id: 'prop-blocks',
    name: '积木',
    category: 'tabletop',
    w: 16,
    d: 10,
    h: 15,
    pals: [
      ['cute', C.pink, C.sky, C.lemon],
      ['nordic', N.oak, N.white, N.sage],
      ['retro', R.red, R.teal, R.mustard],
      ['modern', M.white, M.char, M.gray],
    ],
    build: blocks,
  }),
  def({
    id: 'prop-toy-car',
    name: '玩具小汽车',
    category: 'tabletop',
    w: 12,
    d: 6.2,
    h: 6.2,
    pals: [
      ['cute', C.sky, C.white, C.lemon],
      ['cute', C.pink, C.white, C.lemon],
      ['retro', R.red, R.cream, R.mustard],
      ['modern', M.silver, M.black, M.white],
    ],
    build: toyCar,
  }),
  def({
    id: 'prop-bunny-plush',
    name: '毛绒小兔',
    category: 'tabletop',
    w: 13,
    d: 12,
    h: 25,
    pals: [
      ['cute', C.white, C.pink, C.sky],
      ['cute', C.sakura, C.pink, C.lemon],
      ['nordic', N.linen, '#e8b4a0', N.sage],
      ['retro', R.cream, R.orange, R.teal],
    ],
    build: bunnyPlush,
  }),
]
