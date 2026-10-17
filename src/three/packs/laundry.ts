// 晾晒用的小物：方形晾衣夹架（ピンチハンガー），挂起时夹着袜子 / 毛巾 / 内衣，收起时平放。
// 挂起形态按 kit.ts 约定：原点在挂点（杆顶），钩环内顶在 y≈-0.5，架子在原点下方。

import * as THREE from 'three'
import { ball, rbox, torus } from '../toon'
import { C, rod, type AssetDef } from '../kit'
import { pal, type Pal } from '../packkit'

const PALS: Pal[] = [
  ['cute', [C.white, C.pink, C.lilac]],
  ['nordic', ['#f4f1ea', '#c9d3d9', '#e8e1d4']],
  ['modern', ['#d7d8db', '#3d3f44', '#f4f4f2']],
  ['cute', [C.sky, C.lemon, C.mint]],
  ['retro', ['#f4e7c8', '#c8473a', '#2f8f8a']],
]

const W = 36
const D = 18

/** 晾在夹子上的小件：0 袜子、1 小毛巾、2 内衣 */
function items(pin: THREE.Group, fy: number, a: string, b: string, n: number) {
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 4.5 + i * ((W - 9) / Math.max(1, n - 1))
    const z = i % 2 ? -D / 2 : D / 2
    const c = i % 2 ? a : b
    const kind = i % 3
    // 夹子
    pin.add(rbox(2.2, 3.4, 2.2, i % 2 ? C.lemon : C.sky, { x, y: fy - 3.6, z }, 0.5))
    if (kind === 0) {
      pin.add(rbox(6, 13, 1.6, c, { x, y: fy - 16, z }, 0.7))
      pin.add(rbox(9, 4.6, 1.6, c, { x: x + 1.5, y: fy - 19.5, z }, 0.7))
    } else if (kind === 1) {
      pin.add(rbox(14, 20, 0.8, c, { x, y: fy - 23, z }, 0.4))
    } else {
      pin.add(rbox(12, 9, 1.2, c, { x, y: fy - 12.5, z }, 1.2))
    }
  }
}

function pinchHanging(n: number) {
  return (p: string[]) => {
    const [frame, a, b] = p
    const g = new THREE.Group()
    // 钩子绕在杆上：钩环中心 y = -2.6，内顶约在 -0.5
    const hy = -2.6
    g.add(torus(2.6, 0.45, C.steel, { y: hy, ry: Math.PI / 2 }, Math.PI * 1.25))
    const fy = hy - 22
    g.add(rod(0, fy + 1, 0, hy - 2.2, 0.45, C.steel))
    g.add(ball(2, frame, { y: fy + 1 }))
    for (const s of [-1, 1]) {
      g.add(rbox(W, 1.4, 1.4, frame, { y: fy, z: (s * D) / 2 }, 0.6))
      g.add(rbox(1.4, 1.4, D, frame, { x: (s * W) / 2, y: fy }, 0.6))
      // 从中心吊钩斜拉到四个角
      for (const sz of [-1, 1]) {
        const cord = rod(0, fy + 1, Math.hypot(W / 2, D / 2), fy + 0.7, 0.25, C.steel)
        cord.userData.noOutline = true
        const arm = new THREE.Group()
        arm.add(cord)
        arm.rotation.y = Math.atan2(-sz * (D / 2), s * (W / 2))
        g.add(arm)
      }
    }
    if (n) items(g, fy, a, b, n)
    return g
  }
}

/** 收起：平放在地上 / 架子上，夹子朝上 */
function pinchFolded(p: string[]) {
  const [frame] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(W, 1.4, 1.4, frame, { z: (s * D) / 2 - s * 0.7 }, 0.6))
    g.add(rbox(1.4, 1.4, D - 2.8, frame, { x: (s * W) / 2 - s * 0.7 }, 0.6))
  }
  for (let i = 0; i < 6; i++) g.add(rbox(2, 3, 2, i % 2 ? C.lemon : C.sky, { x: -W / 2 + 4 + i * 5.6, y: 1.4, z: D / 2 - 1.5 }, 0.5))
  return g
}

const def = (id: string, sizeLabel: string, form: AssetDef['form'], [w, d, h]: [number, number, number], build: (p: string[]) => THREE.Group, prop = false): AssetDef => ({
  id,
  name: '晾衣夹架',
  family: 'laundry-pinch',
  sizeLabel,
  form,
  category: 'outdoor',
  w,
  d,
  h,
  prop,
  ...pal(...PALS),
  build,
})

export const LAUNDRY: AssetDef[] = [
  def('laundry-pinch', '收起', 'folded', [W, D, 4.4], pinchFolded, true),
  def('laundry-pinch-hanging', '空', 'hanging', [W + 1, D + 1, 25.5], pinchHanging(0)),
  def('laundry-pinch-full', '晾着小件', 'hanging', [W + 2, D + 2, 46], pinchHanging(6)),
]
