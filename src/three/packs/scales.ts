// 体重计的各种款式（和洗护包里的基础款、健身包里的健身款同一系列 body-scale）。
// 都是放地上的扁平小物（也能收在层板上），原点在底面中心。

import * as THREE from 'three'
import { cyl, rbox, shade, toon, torus } from '../toon'
import { C, glow, type AssetDef } from '../kit'
import { pal, type Pal } from '../packkit'

const def = (id: string, sizeLabel: string, [w, d, h]: [number, number, number], pals: Pal[], build: (p: string[]) => THREE.Group): AssetDef => ({
  id,
  name: '体重秤',
  sizeLabel,
  category: 'toiletry',
  w,
  d,
  h,
  prop: true,
  ...pal(...pals),
  build,
})

/** 钢化玻璃秤：透明面板 + 底下四个脚 + 发光数字 */
function glassScale(p: string[]) {
  const [frame, digit] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.8, 1.4, frame, { x: sx * 12, z: sz * 12 }, 14))
  const glass = rbox(30, 0.8, 30, '#dff3fb', { y: 1.4 }, 1.5)
  glass.material = toon('#dff3fb', { transparent: 0.45 })
  glass.userData.noOutline = true
  g.add(glass)
  g.add(rbox(30.4, 0.3, 30.4, frame, { y: 1.35 }, 1.6))
  g.add(glow(7, 2.4, digit, { y: 2.25, z: -9, rx: -Math.PI / 2 }, 0.9))
  return g
}

/** 体组成计：踏板上有四块电极，前面立一根带握把的立柱和屏幕 */
function compositionScale(p: string[]) {
  const [body, electrode, screen] = p
  const g = new THREE.Group()
  g.add(rbox(32, 4.5, 34, body, { z: 4 }, 2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(9, 0.4, 11, electrode, { x: sx * 7.5, y: 4.45, z: 7 + sz * 6.5 }, 0.3))
  // 立柱 + 显示盒 + 两侧握把
  g.add(rbox(5, 82, 4, body, { y: 4, z: -11.5 }, 1.5))
  g.add(rbox(20, 10, 6, body, { y: 84, z: -11 }, 2))
  g.add(glow(13, 6, screen, { y: 86, z: -7.8 }, 0.7))
  for (const s of [-1, 1]) {
    const grip = cyl(1.5, 1.5, 12, shade(body, -0.25), { x: s * 16, y: 84, z: -9, rz: Math.PI / 2 }, 12)
    grip.position.y = 89
    g.add(grip)
    g.add(rbox(5, 1.2, 2, electrode, { x: s * 15.5, y: 90.3, z: -9 }, 0.4))
  }
  return g
}

/** 指针式：圆角厚盘 + 前方圆窗里的刻度盘和红指针 */
function dialScale(p: string[]) {
  const [body, mat, needle] = p
  const g = new THREE.Group()
  g.add(rbox(28, 5.5, 30, body, {}, 2.5))
  g.add(rbox(24, 0.4, 18, mat, { y: 5.4, z: 4 }, 1))
  g.add(cyl(5.2, 5.2, 0.6, '#fbf8ef', { y: 5.3, z: -9 }, 28))
  g.add(torus(5.4, 0.6, shade(body, -0.2), { y: 5.9, z: -9, rx: Math.PI / 2 }))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.add(rbox(0.3, 0.2, 1.2, '#4a4a4a', { x: Math.sin(a) * 4.2, y: 5.9, z: -9 + Math.cos(a) * 4.2, ry: a }, 0.05))
  }
  g.add(rbox(0.5, 0.25, 4, needle, { x: 1, y: 6.05, z: -10.2, ry: 0.5 }, 0.1))
  return g
}

/** 圆形智能体脂秤：薄圆盘 + 四个隐形电极 + 小屏 */
function roundScale(p: string[]) {
  const [body, electrode, screen] = p
  const g = new THREE.Group()
  g.add(cyl(15, 15.5, 2.2, body, {}, 40))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cyl(3, 3, 0.3, electrode, { x: Math.sin(a) * 8.5, y: 2.1, z: Math.cos(a) * 8.5 + 1.5 }, 20))
  }
  g.add(glow(5, 1.8, screen, { y: 2.3, z: -10, rx: -Math.PI / 2 }, 0.9))
  return g
}

/** 婴儿秤：带弧形托盘的秤台 */
function babyScale(p: string[]) {
  const [body, tray, screen] = p
  const g = new THREE.Group()
  g.add(rbox(52, 5, 30, body, {}, 2.5))
  // 弧形托盘：两层抬起的边
  g.add(rbox(48, 3, 26, tray, { y: 5 }, 3))
  for (const s of [-1, 1]) g.add(rbox(6, 4, 26, tray, { x: s * 21, y: 7.5 }, 2.5))
  g.add(glow(9, 3, screen, { y: 2, z: 15.1 }, 0.8))
  return g
}

export const SCALES: AssetDef[] = [
  def('scale-glass', '玻璃款', [30.4, 30.4, 2.55], [
    ['modern', ['#c9ccd1', '#9be7ff']],
    ['modern', ['#2f3134', '#ff8a65']],
    ['nordic', ['#f4f1ea', '#c8f5d2']],
    ['cute', [C.sakura, '#9be7ff']],
  ], glassScale),
  def('scale-composition', '体组成计（带握把）', [35, 38, 92], [
    ['modern', ['#f4f4f2', '#c9ccd1', '#9be7ff']],
    ['modern', ['#2f3134', '#8a8d93', '#ff8a65']],
    ['industrial', ['#5b5e63', '#c9ccd1', '#c8f5d2']],
  ], compositionScale),
  def('scale-dial', '指针式', [28, 30, 6.3], [
    ['retro', ['#e0a526', '#f4e7c8', '#c8473a']],
    ['retro', ['#2f8f8a', '#f4e7c8', '#c8473a']],
    ['cute', [C.sky, C.white, '#e06070']],
    ['japanese', ['#c9a77c', '#efe6d0', '#8a3a2a']],
  ], dialScale),
  def('scale-round', '圆形体脂秤', [31, 31, 2.6], [
    ['modern', [C.white, '#c9ccd1', '#9be7ff']],
    ['nordic', ['#e8e1d4', '#b9c4b0', '#c8f5d2']],
    ['cute', ['#fbe3ea', '#f4a9c0', '#9be7ff']],
    ['industrial', ['#3a3a3c', '#8a8d93', '#ff8a65']],
  ], roundScale),
  def('scale-baby', '婴儿秤', [52, 30, 11.5], [
    ['cute', [C.white, C.sky, '#9be7ff']],
    ['cute', [C.white, C.sakura, '#9be7ff']],
    ['nordic', ['#f4f1ea', '#e8e1d4', '#c8f5d2']],
  ], babyScale),
]
