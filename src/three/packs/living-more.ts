// 客厅扩充包：客厅大件（沙发 / 茶几 / 电视柜）、灯具、地毯、文具办公小物、儿童玩具。约定见 kit.ts 开头。
// id 一律 lm- 前缀。布面直接用 palette 槽位颜色 p[0]（不 shade），方便主程序识别布面。
// 柜、桌、架的顶面和层板留空，声明 surface / surfaces；地毯声明一个很薄的 surface，玩具和小物可以摆在上面。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, SWING_OPEN, ellipsePoly, glow, holePanel, movable, paintPanel, rectPoly, rng, shell, type AssetCategory, type AssetDef, type Poly, type SurfaceDef } from '../kit'
import { G, P, clearMat, lit, noOutlineDeep, type V3 } from '../geo'
import { I, J, M, N, PROP, R, type PalFlat } from '../packkit'

const BRASS = '#d4b25a'
const CHROME = '#d0d5db'
const TIRE = '#3a3a3c'
const WARM = '#ffe2a0'
const PAPER = '#fbf8f0'

function def(
  id: string,
  name: string,
  category: AssetCategory,
  [w, d, h]: [number, number, number],
  pals: PalFlat[],
  build: (p: string[]) => THREE.Group,
  extra: Partial<AssetDef> = {},
): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x.slice(1) as string[]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}

// ---------- 小工具 ----------

/** 两端已知的 3D 细杆 */
function rod3(a: V3, b: V3, r: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 两端已知的方截面梁 */
function beam(a: V3, b: V3, s: number, color: string) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = rbox(s, va.distanceTo(vb), s, color, {}, s * 0.25)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 沿 x 的水平圆柱，(x, y, z) 为轴心 */
function cylX(r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) {
  return P(cyl(r, r, len, color, {}, seg), x, y, z, 0, 0, Math.PI / 2)
}

/** 沿 z 的水平圆柱，(x, y, z) 为轴心 */
function cylZ(r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) {
  const m = cyl(r, r, len, color, {}, seg)
  m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  return m
}

/** xy 平面轮廓沿 z 挤出（厚 depth，中心在 z） */
function prism(pts: [number, number][], depth: number, color: string, z = 0, bevelMax = 0.5) {
  const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)))
  const bevel = Math.min(bevelMax, depth * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 20 })
  geo.translate(0, 0, -depth / 2 + bevel)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  m.position.z = z
  return m
}

/** 水平铺开的轮廓（地毯、垫子）：poly 为 [x, z]，底面 y、厚 t */
function flatShape(poly: Poly, t: number, color: string, y = 0, bevelMax = 0.4) {
  const m = prism(
    poly.map(([x, z]) => [x, -z]),
    t,
    color,
    0,
    bevelMax,
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = y + t / 2
  return m
}

/** 平铺的画面（地毯花纹、桌垫）：w × d，正面朝上，中心在原点，高 y */
function flatPaint(w: number, d: number, key: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, y: number) {
  return paintPanel(w, d, key, draw, { y, z: d / 2, rx: -Math.PI / 2 })
}

/** 平滑闭合曲线（云朵、动物轮廓）：控制点经 Catmull-Rom 插值 */
function smoothPoly(pts: [number, number][], n = 80): Poly {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  )
  return curve.getSpacedPoints(n).slice(0, n).map((v): [number, number] => [v.x, v.z])
}

/** 云朵轮廓：几个圆的外包 */
function cloudPoly(w: number, d: number, bumps = 7): Poly {
  const pts: Poly = []
  const n = 140
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = 0.84 + 0.16 * Math.abs(Math.sin((a * bumps) / 2 + 0.3))
    pts.push([(Math.cos(a) * w * k) / 2, (Math.sin(a) * d * k) / 2])
  }
  return pts
}

/** 一本书（立着，书脊朝 +z）：底面在 y */
function book(w: number, h: number, d: number, color: string, x: number, y: number, z: number, ry = 0, rz = 0) {
  const g = G(rbox(w, h, d, color, {}, 0.4), rbox(w + 0.02, h - 0.8, d - 0.8, PAPER, { y: 0.4, z: -0.6 }, 0.2))
  return P(g, x, y, z, 0, ry, rz)
}

/** 一排书：从 x0 往 +x 排，书高随机，宽总和不超过 len */
function bookRow(len: number, hMax: number, d: number, x0: number, y: number, z: number, seed: number, colors: string[]) {
  const g = new THREE.Group()
  const r = rng(seed)
  let x = x0
  while (x < x0 + len - 2) {
    const w = Math.min(1.6 + r() * 2.6, x0 + len - x)
    const h = hMax * (0.72 + r() * 0.28)
    g.add(book(w - 0.15, h, d, colors[Math.floor(r() * colors.length)], x + w / 2, y, z))
    x += w
  }
  return g
}

const BOOK_COLORS = ['#e07a6a', '#7aa6d8', '#f0c75e', '#86c08a', '#c49ad8', '#f3e6cf', '#5a6b8c']

/**
 * 正面开口的柜体：两侧板、顶板、底板、背板，原点在底面中心。
 * 内部：x ∈ ±(w/2 - t)，底板顶面 y0 + t，顶板底面 y0 + h - t，z ∈ [-d/2 + 1, d/2]。
 */
function openBox(w: number, h: number, d: number, t: number, color: string, y0 = 0) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(t, h, d, color, { x: s * (w / 2 - t / 2), y: y0 }, Math.min(0.6, t * 0.3)))
  g.add(rbox(w - t * 2 + 0.4, t, d, color, { y: y0 + h - t }, 0.5))
  g.add(rbox(w - t * 2 + 0.4, t, d, color, { y: y0 }, 0.5))
  g.add(rbox(w - t * 2 + 0.4, h - t * 2 + 0.4, 1, shade(color, -0.06), { y: y0 + t - 0.2, z: -d / 2 + 0.5 }, 0.3))
  return g
}

/** 门板 / 抽屉面：贴在 z = zf 处（背面嵌进 0.3） */
/** 自由造型的模型：xz 居中、最低点落到地面（没有 surfaces 坐标依赖时用） */
function centered(g: THREE.Group) {
  const box = new THREE.Box3().setFromObject(g, true)
  g.position.x -= (box.min.x + box.max.x) / 2
  g.position.z -= (box.min.z + box.max.z) / 2
  g.position.y -= box.min.y
  return G(g)
}

/** 整体沿 z 平移（正面把手、门板凸出时让包围盒居中），surfaces 的坐标同步减去 */
function shiftZ(g: THREE.Group, dz: number) {
  g.position.z += dz
  return G(g)
}

/** 壁挂件：xz 居中，最低点放到离地 y */
function mountAt(g: THREE.Group, y: number) {
  const box = new THREE.Box3().setFromObject(g, true)
  g.position.x -= (box.min.x + box.max.x) / 2
  g.position.z -= (box.min.z + box.max.z) / 2
  g.position.y += y - box.min.y
  return G(g)
}

function front(w: number, h: number, color: string, x: number, y: number, zf: number, t = 1.6) {
  return rbox(w, h, t, color, { x, y, z: zf + t / 2 - 0.3 }, 0.6)
}

/**
 * 可开合的抽屉：抽屉面（front 同款，贴在 zf）+ 抽屉盒（深 bd，往 -z）+ 拉手，拉出 pull。
 * 抽屉面底边在 y，宽 w、高 h；返回会动的 Group。抽屉格用 liveDrawerLevel。
 */
function liveDrawer(o: { w: number; h: number; x: number; y: number; zf: number; bd: number; color: string; inner: string; handle: THREE.Object3D }) {
  const g = new THREE.Group()
  g.add(front(o.w, o.h, o.color, 0, 0, o.zf))
  const bw = o.w - 3
  const bh = Math.max(3, o.h - 3)
  const z0 = o.zf - 0.3 - o.bd
  g.add(rbox(bw, 0.6, o.bd, o.inner, { y: 0.6, z: z0 + o.bd / 2 }, 0.2))
  for (const s of [-1, 1]) g.add(rbox(0.6, bh, o.bd, o.inner, { x: s * (bw / 2 - 0.3), y: 0.6, z: z0 + o.bd / 2 }, 0.15))
  g.add(rbox(bw - 1.2, bh, 0.6, o.inner, { y: 0.6, z: z0 + 0.3 }, 0.15))
  o.handle.position.x -= o.x
  o.handle.position.y -= o.y
  g.add(o.handle)
  g.position.set(o.x, o.y, 0)
  return movable(g, { kind: 'drawer', dz: Math.round(o.bd * 0.6) })
}
/** liveDrawer 的抽屉格（dz：整件模型最后 shiftZ 的量） */
function liveDrawerLevel(o: { w: number; h: number; x: number; y: number; zf: number; bd: number }, dz: number): SurfaceDef {
  const bw = o.w - 3
  const z0 = o.zf - 0.3 - o.bd
  return {
    y: Math.round((o.y + 1.2) * 10) / 10,
    h: Math.round((Math.max(3, o.h - 3) - 1) * 10) / 10,
    shape: [rectPoly(o.x - bw / 2 + 1, z0 + 1 + dz, o.x + bw / 2 - 1, o.zf - 1 + dz)],
    inside: true,
    slide: Math.round(o.bd * 0.6),
  }
}

// =====================================================================
// 沙发
// =====================================================================

const SOFA_PALS: PalFlat[] = [
  ['nordic', N.linen, N.oak, N.sage],
  ['modern', M.gray, M.black, M.light],
  ['industrial', I.leather, I.iron, I.concrete],
  ['retro', R.teal, R.caramel, R.mustard],
  ['cute', C.sakura, C.woodL, C.cream],
]

/** 转角沙发（左：长边靠背面，短边在左侧往前伸；右 = 镜像）：240 × 200 × 80 */
function cornerSofa(right: boolean) {
  return (p: string[]) => {
    const [fab, leg, acc] = p
    const g = new THREE.Group()
    // 底座
    g.add(rbox(240, 30, 90, fab, { y: 8, z: -55 }, 4))
    g.add(rbox(90, 30, 110.5, fab, { x: -75, y: 8, z: 44.75 }, 4))
    // 小脚
    for (const [x, z] of [[-115, -95], [115, -95], [115, -15], [-115, 95], [-35, 95], [-35, -15]] as [number, number][]) g.add(cyl(2.2, 1.8, 8.2, leg, { x, z }, 10))
    // 靠背：沿背面 + 沿左侧
    g.add(rbox(240, 42, 20, fab, { y: 38, z: -90 }, 6))
    g.add(rbox(20, 42, 180, fab, { x: -110, y: 38, z: 10 }, 6))
    // 右扶手、左前端扶手
    g.add(rbox(16, 24, 70, fab, { x: 112, y: 38, z: -45 }, 6))
    g.add(rbox(70, 24, 14, fab, { x: -65, y: 38, z: 93 }, 6))
    // 坐垫
    for (const x of [-48, 54]) g.add(rbox(100, 12, 68, fab, { x, y: 37.5, z: -45 }, 5))
    g.add(rbox(68, 12, 74, fab, { x: -66, y: 37.5, z: 48 }, 5))
    // 靠垫
    for (const [x, z, ry] of [[-60, -72, 0], [10, -72, 0], [75, -72, 0.1], [-94, 10, Math.PI / 2], [-94, 55, Math.PI / 2]] as V3[]) g.add(rbox(50, 30, 12, acc, { x, y: 48, z, ry, rx: ry > 1 ? 0 : -0.12 }, 5))
    if (right) {
      const o = new THREE.Group()
      g.scale.x = -1
      o.add(g)
      return o
    }
    return g
  }
}

/** 方块模块沙发：n 座，每座 90 宽，无扶手、厚坐垫，矮平台底座 */
function blockSofa(n: number) {
  return (p: string[]) => {
    const [fab, base, acc] = p
    const w = 90 * n
    const g = new THREE.Group()
    g.add(rbox(w - 10, 4, 84, base, { y: 0 }, 1))
    g.add(rbox(w, 34, 95, fab, { y: 4 }, 7))
    g.add(rbox(w, 30, 26, fab, { y: 36, z: -34.5 }, 8))
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 90
      g.add(rbox(88, 10, 66, fab, { x, y: 37.5, z: 13.5 }, 4.5))
      if (i % 2 === 0 || n === 1) g.add(rbox(46, 24, 13, acc, { x: x + (n === 1 ? 0 : 12), y: 41.5, z: -16, rx: -0.15, rz: 0.05 }, 6))
    }
    return g
  }
}

/** 地板沙发床（可折叠成沙发 / 展开成床），框架用木色 */
function futonSofa(open: boolean) {
  return (p: string[]) => {
    const [fab, wood, acc] = p
    const g = new THREE.Group()
    if (!open) {
      // 低木框 + 座垫 + 斜靠背（床垫折起）
      g.add(rbox(120, 12, 80, wood, { y: 0, z: 2.5 }, 1.5))
      g.add(rbox(120, 14, 66, fab, { y: 12, z: 9.5 }, 5))
      const back = rbox(120, 58, 16, fab, {}, 6)
      back.rotation.x = -0.22
      back.position.set(0, 12 + 31, -27.5)
      g.add(back)
      g.add(rbox(44, 30, 12, acc, { x: -28, y: 26, z: -10, rx: -0.25 }, 5))
      return centered(g)
    }
    // 展开：床垫全平
    g.add(rbox(120, 12, 190, wood, { y: 0 }, 1.5))
    g.add(rbox(120, 14, 190, fab, { y: 12 }, 5))
    g.add(rbox(55, 8.5, 32, C.white, { y: 25.5, z: -72 }, 4))
    g.add(rbox(112, 4, 100, acc, { y: 25.5, z: 38 }, 2))
    return g
  }
}

/** 方块豆袋 */
function lazyCube(p: string[]) {
  const [fab, , acc] = p
  const g = new THREE.Group()
  g.add(rbox(65, 40, 65, fab, {}, 14))
  // 坐下去的凹陷：顶面中间一块略深的布
  g.add(rbox(48, 6, 48, shade(fab, -0.05), { y: 37 }, 3))
  g.add(rbox(18, 3, 2.4, acc, { y: 30, z: 32.6 }, 1))
  return centered(g)
}

/** 贝壳懒人沙发：圆鼓鼓的座 + 身后扇形张开的一圈鼓瓣（像打开的扇贝），中间瓣最高、两侧渐低 */
function lazyShell(p: string[]) {
  const [fab, , acc] = p
  const g = new THREE.Group()
  g.add(puck(36, 26, fab))
  g.add(puck(27, 6, acc, { y: 24, z: 5 }))
  const n = 9
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5
    const th = t * 2.7
    const r = 10.5 - Math.abs(t) * 3
    const len = 36 - Math.abs(t) * 26
    // 瓣的底部落在座的后半圈上，顶部向外后方张开
    const pivot = new THREE.Group()
    pivot.position.set(Math.sin(th) * 22, 12, -Math.cos(th) * 22)
    pivot.rotation.order = 'YXZ'
    pivot.rotation.y = -th
    pivot.rotation.x = -0.26
    const lobe = capsule(r, len, fab)
    lobe.scale.z = 0.78
    pivot.add(lobe)
    g.add(pivot)
  }
  return centered(g)
}

/** 长条豆袋（躺倒的长枕形） */
function lazyLong(p: string[]) {
  const [fab, , acc] = p
  const g = new THREE.Group()
  const c = capsule(24, 96, fab)
  c.rotation.x = Math.PI / 2
  c.position.set(0, 21.7, 0)
  c.scale.set(1.25, 1, 0.88)
  g.add(c)
  const band = torus(23.9, 0.8, acc, { y: 21.7 })
  band.scale.set(1.25, 0.88, 1)
  g.add(band)
  return g
}

/** 贵妃榻：木框 + 床垫 + 左端涡卷扶手 + 半截靠背 */
function daybed(p: string[]) {
  const [fab, wood, acc] = p
  const g = new THREE.Group()
  for (const [x, z] of [[-76, -28], [76, -28], [-76, 28], [76, 28]] as [number, number][]) g.add(cyl(2.4, 1.8, 18, wood, { x, z }, 12))
  g.add(rbox(160, 8, 64, wood, { y: 16 }, 2))
  g.add(rbox(156, 14, 62, fab, { y: 24 }, 5))
  // 涡卷扶手：横置的大圆柱 + 外沿
  g.add(cylZ(15, 64, fab, -70, 48, 0, 24))
  g.add(rbox(12, 32, 64, fab, { x: -74, y: 24 }, 5))
  // 靠背：左半段
  g.add(rbox(92, 34, 12, fab, { x: -34, y: 36, z: -26 }, 5))
  // 圆筒抱枕
  g.add(cylX(8, 40, acc, 50, 46, 8))
  return centered(g)
}

/** 收纳软凳：方盒 + 软包盖 */
function storageOttoman(p: string[]) {
  const [fab, wood, acc] = p
  const g = new THREE.Group()
  for (const [x, z] of [[-25, -25], [25, -25], [-25, 25], [25, 25]] as [number, number][]) g.add(cyl(2, 1.5, 6, wood, { x, z }, 10))
  // 空心的箱体（底 + 四壁），盖子绕后沿往上掀开
  g.add(rbox(58, 1.6, 58, fab, { y: 6 }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox(58, 28, 3, fab, { y: 6, z: s * 27.5 }, 1.2))
    g.add(rbox(3, 28, 52, fab, { x: s * 27.5, y: 6 }, 1.2))
  }
  const lid = new THREE.Group()
  lid.add(rbox(60, 8, 60, fab, { y: 0.4, z: 30.3 }, 3.5))
  lid.add(rbox(60.6, 1.4, 60.6, acc, { z: 30.3 }, 0.6))
  lid.position.set(0, 33.6, -30.3)
  g.add(movable(lid, { kind: 'flap', angle: -(75 * Math.PI) / 180 }))
  return g
}

/** 针织坐墩 */
function knitPouf(p: string[]) {
  const [fab, , acc] = p
  const g = new THREE.Group()
  g.add(puck(24, 35, fab))
  for (const y of [9, 17.5, 26]) g.add(P(torus(23.6, 1, shade(fab, -0.08)), 0, y, 0, Math.PI / 2))
  g.add(puck(6, 1.2, acc, { y: 34.3 }))
  return g
}

const FUTON_PALS: PalFlat[] = [
  ['japanese', J.ai, J.hinoki, J.washi],
  ['nordic', N.gray, N.oak, N.mustard],
  ['modern', M.char, M.walnut, M.light],
  ['cute', C.mint, C.woodL, C.pink],
]

export const LM_SOFAS: AssetDef[] = [
  def('lm-corner-sofa-l', '转角沙发', 'living', [240, 200, 80], SOFA_PALS, cornerSofa(false), { family: 'lm-corner-sofa', sizeLabel: '左转角' }),
  def('lm-corner-sofa-r', '转角沙发', 'living', [240, 200, 80], SOFA_PALS, cornerSofa(true), { family: 'lm-corner-sofa', sizeLabel: '右转角' }),
  def('lm-block-sofa-1', '方块模块沙发', 'living', [90, 95, 66.3], SOFA_PALS, blockSofa(1), { family: 'lm-block-sofa', sizeLabel: '单座' }),
  def('lm-block-sofa-2', '方块模块沙发', 'living', [180, 95, 66.3], SOFA_PALS, blockSofa(2), { family: 'lm-block-sofa', sizeLabel: '双座' }),
  def('lm-block-sofa-3', '方块模块沙发', 'living', [270, 95, 66.3], SOFA_PALS, blockSofa(3), { family: 'lm-block-sofa', sizeLabel: '三座' }),
  def('lm-futon-sofa', '地板沙发床', 'living', [120, 82.9, 71.9], FUTON_PALS, futonSofa(false), { family: 'lm-futon-sofa', form: 'folded', formLabel: '沙发' }),
  def('lm-futon-sofa-open', '地板沙发床', 'living', [120, 190, 34], FUTON_PALS, futonSofa(true), { family: 'lm-futon-sofa', form: 'open', formLabel: '展开成床' }),
  def(
    'lm-lazy-cube',
    '方块豆袋',
    'living',
    [65, 66.3, 43],
    [
      ['cute', C.lemon, shade(C.lemon, -0.12), C.white],
      ['nordic', N.linen, shade(N.linen, -0.12), N.oak],
      ['modern', M.char, shade(M.char, -0.12), M.light],
      ['retro', R.orange, shade(R.orange, -0.12), R.cream],
    ],
    lazyCube,
    { family: 'beanbag', sizeLabel: '方块' },
  ),
  def(
    'lm-lazy-shell',
    '贝壳懒人沙发',
    'living',
    [88, 76, 51.6],
    [
      ['cute', C.sakura, shade(C.sakura, -0.12), C.white],
      ['nordic', N.white, shade(N.white, -0.12), N.sage],
      ['modern', M.gray, shade(M.gray, -0.12), M.char],
      ['retro', R.mustard, shade(R.mustard, -0.12), R.teal],
    ],
    lazyShell,
    { family: 'beanbag', sizeLabel: '贝壳' },
  ),
  def(
    'lm-lazy-long',
    '长条豆袋',
    'living',
    [61.8, 144, 43.5],
    [
      ['cute', C.sky, shade(C.sky, -0.12), C.white],
      ['nordic', N.blue, shade(N.blue, -0.12), N.linen],
      ['modern', M.black, shade(M.black, -0.12), M.gray],
      ['industrial', I.leather, shade(I.leather, -0.12), I.iron],
    ],
    lazyLong,
    { family: 'beanbag', sizeLabel: '长条' },
  ),
  def(
    'lm-daybed',
    '贵妃榻',
    'living',
    [165, 64, 70],
    [
      ['retro', R.olive, R.caramel, R.mustard],
      ['nordic', N.linen, N.oak, N.blue],
      ['modern', M.light, M.black, M.char],
      ['japanese', J.washi, J.dark, J.shu],
    ],
    daybed,
  ),
  def(
    'lm-storage-ottoman',
    '收纳软凳',
    'living',
    [60.6, 60.6, 42],
    [
      ['nordic', N.gray, N.oak, N.white],
      ['modern', M.char, M.black, M.silver],
      ['industrial', I.leather, I.iron, I.walnut],
      ['cute', C.lilac, C.woodL, C.white],
    ],
    storageOttoman,
    { surface: 42, openable: true, surfaces: [{ y: 7.6, h: 25.5, shape: [rectPoly(-25, -25, 25, 25)], inside: true }] },
  ),
  def(
    'lm-knit-pouf',
    '针织坐墩',
    'living',
    [49.2, 49.2, 35.5],
    [
      ['nordic', N.white, shade(N.white, -0.12), N.oak],
      ['cute', C.peach, shade(C.peach, -0.12), C.white],
      ['modern', M.gray, shade(M.gray, -0.12), M.char],
      ['retro', R.mustard, shade(R.mustard, -0.12), R.caramel],
      ['japanese', J.ai, shade(J.ai, -0.12), J.washi],
    ],
    knitPouf,
  ),
]

// =====================================================================
// 茶几 / 电视柜
// =====================================================================

const WOOD_PALS: PalFlat[] = [
  ['nordic', N.oak, N.white, N.gray],
  ['modern', M.walnut, M.char, M.silver],
  ['industrial', I.walnut, I.iron, I.steel],
  ['japanese', J.hinoki, J.wood, J.sumi],
  ['cute', C.woodL, C.white, C.pink],
]

/** 升降茶几：后段固定、前段顶板可以抬起（下面是隐藏收纳格） */
function liftTable(open: boolean) {
  return (p: string[]) => {
    const [top, body, metal] = p
    const g = new THREE.Group()
    for (const s of [-1, 1]) g.add(rbox(3, 39, 60, body, { x: s * 53.5 }, 0.8))
    g.add(rbox(104.4, 2, 58, body, { y: 8 }, 0.6))
    // 隐藏收纳格
    g.add(tray(104.2, 13, 38, 1, shade(body, -0.06), { y: 26, z: 10 }, 0.4))
    g.add(rbox(110, 3, 20, top, { y: 39, z: -20 }, 0.8))
    if (!open) {
      g.add(rbox(110, 3, 40, top, { y: 39, z: 10 }, 0.8))
      return g
    }
    g.add(rbox(110, 3, 40, top, { y: 58, z: 10 }, 0.8))
    for (const x of [-46, 46]) {
      g.add(rbox(2, 1.2, 38, metal, { x, y: 39, z: 10 }, 0.3))
      g.add(rod3([x, 39, -6], [x, 58, 24], 0.8, metal))
      g.add(rod3([x, 39, 24], [x, 58, -6], 0.8, metal))
    }
    return g
  }
}
const LIFT_SURF_CLOSED: Partial<AssetDef> = { surface: 42, surfaces: [{ y: 10, h: 16, shape: [rectPoly(-51, -28, 51, 28)] }] }
const LIFT_SURF_OPEN: Partial<AssetDef> = {
  surface: 61,
  surfaceShape: [rectPoly(-55, -10, 55, 30)],
  surfaces: [
    { y: 42, shape: [rectPoly(-55, -30, 55, -10.5)] },
    { y: 27, shape: [rectPoly(-51, -8, 51, 28)], h: 12 },
    { y: 10, shape: [rectPoly(-51, -28, 51, 28)], h: 16 },
  ],
}

/** 三件套嵌套边几：高低错落、部分塞在大几下面 */
const NEST: { x: number; z: number; r: number; h: number }[] = [
  { x: -17.5, z: -10.5, r: 30, h: 50 },
  { x: 24.5, z: -6.5, r: 23, h: 44 },
  { x: 2.5, z: 23.5, r: 17, h: 38 },
]
function nestTables(p: string[]) {
  const [top, leg, acc] = p
  const g = new THREE.Group()
  NEST.forEach((t, i) => {
    g.add(cyl(t.r, t.r, 2, i === 1 ? acc : top, { x: t.x, y: t.h - 2, z: t.z }, 32))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i
      const rr = t.r * 0.72
      g.add(rod3([t.x + Math.cos(a) * rr, t.h - 2, t.z + Math.sin(a) * rr], [t.x + Math.cos(a) * (rr + 2), 0.6, t.z + Math.sin(a) * (rr + 2)], 0.8, leg))
      g.add(cyl(1, 1, 0.6, leg, { x: t.x + Math.cos(a) * (rr + 2), z: t.z + Math.sin(a) * (rr + 2) }, 8))
    }
  })
  return g
}

/** 和式座卓：厚榉木面 + 四方腿 + 牙板 */
function zataku(p: string[]) {
  const [top, leg] = p
  const g = new THREE.Group()
  g.add(rbox(120, 4, 75, top, { y: 29 }, 1.2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 29.2, 6, leg, { x: sx * 50, z: sz * 28.5 }, 1))
  for (const sz of [-1, 1]) g.add(rbox(94, 5, 2.5, leg, { y: 24.2, z: sz * 28.5 }, 0.6))
  for (const sx of [-1, 1]) g.add(rbox(2.5, 5, 51, leg, { x: sx * 50, y: 24.2 }, 0.6))
  return g
}

/** 玻璃茶几：细金属框 + 玻璃面 + 下层木板 */
function glassTable(p: string[]) {
  const [shelf, frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 39, 2.4, frame, { x: sx * 53.8, z: sz * 28.8 }, 0.5))
  for (const sz of [-1, 1]) g.add(rbox(105.2, 2, 2.4, frame, { y: 37, z: sz * 28.8 }, 0.5))
  for (const sx of [-1, 1]) g.add(rbox(2.4, 2, 55.2, frame, { x: sx * 53.8, y: 37 }, 0.5))
  g.add(clearMat(rbox(110, 1, 60, C.glass, { y: 39 }, 0.3), C.glass))
  g.add(rbox(105.2, 2, 55.2, shelf, { y: 10 }, 0.6))
  return g
}

/** 带收纳茶几：左半抽屉、右半开放格 */
function storageTable(p: string[]) {
  const [wood, fr, metal] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2, 1.6, 6.2, metal, { x: sx * 45, z: sz * 23 }, 10))
  g.add(openBox(100, 36, 55, 2.5, wood, 6))
  g.add(rbox(2.5, 31.4, 53, wood, { y: 8.3, z: 0.5 }))
  for (const d of ST_DRAWERS) g.add(liveDrawer({ ...d, color: fr, inner: shade(wood, 0.08), handle: rbox(10, 1.2, 1.2, metal, { x: -24.2, y: d.y + 9, z: 29.4 }, 0.5) }))
  return shiftZ(g, -1.25)
}
/** 带收纳茶几左半的两只抽屉 */
const ST_DRAWERS = [9.2, 24.6].map((y) => ({ w: 46, h: 14.6, x: -24.2, y, zf: 27.5, bd: 50 }))

/** 低矮电视柜：两侧门 / 抽屉，中间开放格（带一层隔板） */
function tvBoard(W: number) {
  return (p: string[]) => {
    const [wood, fr, metal] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2, 1.5, 8.2, metal, { x: sx * (W / 2 - 8), z: sz * 14 }, 10))
    g.add(openBox(W, 34, 40, 2, wood, 8))
    for (const s of [-1, 1]) g.add(rbox(2, 30.4, 38.5, wood, { x: s * 31, y: 9.8, z: 0.75 }))
    g.add(rbox(60, 1.6, 37.5, wood, { y: 24, z: 0.5 }, 0.4))
    const sw = W / 2 - 2 - 32
    const cx = W / 2 - 2 - sw / 2
    // 左：翻门（木条装饰），底边铰链往前放倒；门里一块层板
    g.add(rbox(sw - 0.2, 1.6, 37.5, wood, { x: -cx, y: 24, z: 0.5 }, 0.4))
    const flap = new THREE.Group()
    flap.add(front(sw - 0.6, 29.6, fr, 0, 0, 0))
    for (let k = 1; k < 6; k++) flap.add(rbox(0.8, 26, 0.8, shade(fr, -0.1), { x: -sw / 2 + (sw * k) / 6, y: 1.8, z: 1.5 }, 0.2))
    flap.add(rbox(8, 1.2, 1.2, metal, { y: 25.8, z: 1.8 }, 0.5))
    flap.position.set(-cx, 10.2, 20)
    g.add(movable(flap, { kind: 'flap', angle: (85 * Math.PI) / 180 }))
    // 右：两只抽屉
    for (const d of tvDrawers(W)) g.add(liveDrawer({ ...d, color: fr, inner: shade(wood, 0.08), handle: rbox(8, 1.2, 1.2, metal, { x: d.x, y: d.y + 10, z: 21.8 }, 0.5) }))
    return shiftZ(g, -1.2)
  }
}
/** 低矮电视柜右侧的两只抽屉 */
function tvDrawers(W: number) {
  const sw = W / 2 - 2 - 32
  const cx = W / 2 - 2 - sw / 2
  return [10.2, 25.2].map((y) => ({ w: sw - 0.6, h: 14.6, x: cx, y, zf: 20, bd: 34 }))
}
const tvSurf = (W: number): Partial<AssetDef> => {
  const sw = W / 2 - 2 - 32
  const cx = W / 2 - 2 - sw / 2
  const left = [rectPoly(-cx - sw / 2 + 0.3, -19.7, -cx + sw / 2 - 0.3, 18.3)]
  return {
    surface: 42,
    openable: true,
    surfaces: [
      { y: 10, shape: [rectPoly(-29.5, -19.7, 29.5, 18.3)], h: 14 },
      { y: 25.6, shape: [rectPoly(-29.5, -19.7, 29.5, 18.3)], h: 14.4 },
      // 翻门里：底板、层板
      { y: 10, shape: left, h: 13.5, inside: true },
      { y: 25.6, shape: left, h: 13.9, inside: true },
      ...tvDrawers(W).map((d) => liveDrawerLevel(d, -1.2)),
    ],
  }
}

/** 电视组合柜右侧的三只抽屉 */
const TVW_DRAWERS = [8.4, 18.2, 28].map((y) => ({ w: 76.4, h: 9.4, x: 80, y, zf: 21, bd: 36 }))

/** 电视组合柜：低柜 + 右侧高书架 + 浮空壁挂层板 */
function tvWallUnit(p: string[]) {
  const [wood, fr, metal] = p
  const g = new THREE.Group()
  for (const x of [-112, -40, 40, 112]) for (const z of [-15, 15]) g.add(cyl(1.8, 1.4, 6.2, metal, { x, z }, 10))
  g.add(openBox(240, 34, 42, 2.2, wood, 6))
  for (const x of [-40, 40]) g.add(rbox(2.2, 29.8, 40.5, wood, { x, y: 8, z: 0.75 }))
  // 左：两扇平开门（铰链在外侧）；右：三只抽屉
  for (const x of [-99.5, -60.5]) {
    const left = x < -80
    const hinge = x + (left ? -19.2 : 19.2)
    const dr = new THREE.Group()
    dr.add(front(38.4, 29.2, fr, x - hinge, 0, 21 - 21))
    dr.add(rbox(1.2, 8, 1.2, metal, { x: x + (left ? 16 : -16) - hinge, y: 18 - 8.4, z: 1.8 }, 0.5))
    dr.position.set(hinge, 8.4, 21)
    g.add(movable(dr, { kind: 'swing', angle: (left ? -1 : 1) * SWING_OPEN }))
  }
  for (const d of TVW_DRAWERS) g.add(liveDrawer({ ...d, color: fr, inner: shade(wood, 0.08), handle: rbox(12, 1.2, 1.2, metal, { x: 80, y: d.y + 4, z: 22.8 }, 0.5) }))
  // 高书架
  const shelf = openBox(40, 140, 32, 2, wood, 40)
  shelf.position.set(100, 0, -5)
  g.add(shelf)
  for (const y of [75, 110, 145]) g.add(rbox(36.4, 1.6, 30.5, wood, { x: 100, y, z: -4.25 }, 0.4))
  g.add(bookRow(30, 24, 20, 84, 42, -9, 11, BOOK_COLORS))
  g.add(bookRow(22, 22, 20, 84, 111.6, -9, 23, BOOK_COLORS))
  // 浮空层板（挂墙）
  g.add(rbox(150, 3, 24, wood, { x: -25, y: 140, z: -9 }, 0.8))
  g.add(rbox(150, 6, 1.2, metal, { x: -25, y: 137.5, z: -20.4 }, 0.4))
  return shiftZ(g, -1.2)
}

export const LM_TABLES: AssetDef[] = [
  def('lm-lift-table', '升降茶几', 'living', [110, 60, 42], WOOD_PALS, liftTable(false), { family: 'lm-lift-table', form: 'closed', formLabel: '收起', ...LIFT_SURF_CLOSED }),
  def('lm-lift-table-open', '升降茶几', 'living', [110, 60, 61], WOOD_PALS, liftTable(true), { family: 'lm-lift-table', form: 'open', formLabel: '升起', ...LIFT_SURF_OPEN }),
  def(
    'lm-nest-tables',
    '三件套嵌套边几',
    'living',
    [95, 81, 50],
    [
      ['nordic', N.oak, N.white, N.sage],
      ['modern', M.char, M.black, M.white],
      ['industrial', I.walnut, I.iron, I.rust],
      ['cute', C.white, C.woodL, C.pink],
      ['retro', R.caramel, BRASS, R.mustard],
    ],
    nestTables,
    {
      surface: 50,
      surfaceShape: [ellipsePoly(29, 29, NEST[0].x, NEST[0].z)],
      surfaces: [
        { y: 44, shape: [ellipsePoly(22, 22, NEST[1].x, NEST[1].z)] },
        { y: 38, shape: [ellipsePoly(16, 16, NEST[2].x, NEST[2].z)] },
      ],
    },
  ),
  def(
    'lm-zataku',
    '和式座卓',
    'japanese',
    [120, 75, 33],
    [
      ['japanese', J.wood, J.dark],
      ['japanese', J.hinoki, J.wood],
      ['modern', M.walnut, M.black],
      ['nordic', N.oakL, N.oak],
      ['retro', R.caramel, '#6b4126'],
    ],
    zataku,
    { surface: 33 },
  ),
  def(
    'lm-glass-coffee',
    '玻璃茶几',
    'living',
    [110, 60, 40],
    [
      ['modern', M.walnut, M.black],
      ['modern', M.white, CHROME],
      ['industrial', I.walnut, I.iron],
      ['nordic', N.oak, N.white],
      ['retro', R.caramel, BRASS],
    ],
    glassTable,
    { surface: 40, surfaces: [{ y: 12, h: 25, shape: [rectPoly(-50, -25, 50, 25)] }] },
  ),
  def('lm-storage-coffee', '带收纳茶几', 'living', [100, 57.5, 42], WOOD_PALS, storageTable, {
    surface: 42,
    surfaces: [{ y: 8.5, shape: [rectPoly(2, -27.75, 47.5, 25.75)], h: 31 }, ...ST_DRAWERS.map((d) => liveDrawerLevel(d, -1.25))],
    openable: true,
  }),
  def('lm-tv-board-150', '低矮电视柜（翻门）', 'living', [150, 42.4, 42], WOOD_PALS, tvBoard(150), { family: 'lm-tv-board', sizeLabel: '150', ...tvSurf(150) }),
  def('lm-tv-board-200', '低矮电视柜（翻门）', 'living', [200, 42.4, 42], WOOD_PALS, tvBoard(200), { family: 'lm-tv-board', sizeLabel: '200', ...tvSurf(200) }),
  def('lm-tv-board-240', '低矮电视柜（翻门）', 'living', [240, 42.4, 42], WOOD_PALS, tvBoard(240), { family: 'lm-tv-board', sizeLabel: '240', ...tvSurf(240) }),
  def('lm-tv-wall-unit', '电视组合柜（带书架）', 'living', [240, 44.4, 180], WOOD_PALS, tvWallUnit, {
    surface: 180,
    surfaceShape: [rectPoly(80, -22.2, 120, 9.8)],
    surfaces: [
      { y: 40, shape: [rectPoly(-120, -22.2, 80, 20.8), rectPoly(80, 10.3, 120, 20.8)], h: 97 },
      { y: 143, shape: [rectPoly(-100, -22.2, 50, 1.8)] },
      { y: 42, shape: [rectPoly(82, -21.2, 118, 9.8)], h: 33 },
      { y: 76.6, shape: [rectPoly(82, -21.2, 118, 9.8)], h: 33.4 },
      { y: 111.6, shape: [rectPoly(82, -21.2, 118, 9.8)], h: 33.4 },
      { y: 146.6, shape: [rectPoly(82, -21.2, 118, 9.8)], h: 31.4 },
      { y: 8.2, shape: [rectPoly(-38, -21.2, 38, 19.8)], h: 29.6 },
      // 左边两扇门里、右边三只抽屉
      { y: 8.2, shape: [rectPoly(-117.4, -21.2, -42, 19.8)], h: 29.6, inside: true },
      ...TVW_DRAWERS.map((d) => liveDrawerLevel(d, -1.2)),
    ],
    openable: true,
  }),
]

// =====================================================================
// 灯具
// =====================================================================

/** 空心灯罩（筒 / 锥），双面，at.y 为底；k > 0 时灯罩微微透光 */
function drum(rTop: number, rBot: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}, k = 0.35, seg = 32) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true)
  const mat = toon(color, k > 0 ? { emissive: k } : {}).clone()
  mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(geo, mat)
  m.position.set(at.x ?? 0, (at.y ?? 0) + h / 2, at.z ?? 0)
  m.castShadow = true
  return m
}

/** 褶皱灯罩：半径按角度交替起伏 */
function pleated(rTop: number, rBot: number, h: number, color: string, y: number, folds = 24) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, folds * 2, 1, true)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const a = Math.atan2(z, x)
    const seg = Math.round(((a + Math.PI) / (Math.PI * 2)) * folds * 2)
    const k = seg % 2 ? 1 : 0.94
    pos.setX(i, x * k)
    pos.setZ(i, z * k)
  }
  geo.computeVertexNormals()
  const mat = toon(color, { emissive: 0.35 }).clone()
  mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(geo, mat)
  m.position.y = y + h / 2
  m.castShadow = true
  return m
}

/** 沿控制点的细管（灯杆、电线、霓虹管） */
function tube(pts: V3[], r: number, color: string, seg = 48, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
  )
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, closed), toon(color))
  m.castShadow = true
  return m
}

/** 倒扣的灯罩（cup 翻转），yTop 为灯罩顶 */
function dome(r: number, h: number, color: string, x: number, yTop: number, z: number, rTop = r * 0.3) {
  const m = cup(r, rTop, h, 0.8, color)
  m.rotation.x = Math.PI
  m.position.set(x, yTop, z)
  return m
}

const bulb = (r: number, x: number, y: number, z: number) => P(lit(ball(r, WARM), WARM, 0.9), x, y, z)

/** 弧形钓鱼灯：大理石底座、弧形长杆、伸到前方的半球灯罩 */
function arcLamp(p: string[]) {
  const [shadeC, pole, base] = p
  const g = new THREE.Group()
  g.add(rbox(35, 7, 35, base, { z: -54.5 }, 2))
  g.add(tube([[0, 6, -54.5], [0, 90, -56], [0, 170, -40], [0, 194, 0], [0, 184, 38], [0, 170, 50]], 1.3, pole, 64))
  g.add(cyl(1.2, 1.2, 4, pole, { y: 166, z: 50 }, 8))
  g.add(dome(22, 18, shadeC, 0, 168, 50, 6))
  g.add(bulb(5, 0, 155, 50))
  return g
}

/** 三脚落地灯：木三脚 + 布筒灯罩 */
function tripodLamp(p: string[]) {
  const [shadeC, wood, metal] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    g.add(rod3([Math.cos(a) * 28, 0.8, Math.sin(a) * 28], [Math.cos(a) * 3, 118, Math.sin(a) * 3], 1.5, wood))
  }
  g.add(cyl(2, 2, 6, metal, { y: 114 }, 12))
  g.add(cyl(0.8, 0.8, 14, metal, { y: 118 }, 8))
  g.add(drum(22, 24, 28, shadeC, { y: 122 }))
  g.add(bulb(4, 0, 132, 0))
  return centered(g)
}

/** 和纸灯笼落地灯（细金属三脚撑起长椭圆纸灯） */
function akariFloor(p: string[]) {
  const [paper, metal, rib] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    g.add(rod3([Math.cos(a) * 14, 0.5, Math.sin(a) * 14], [0, 18, 0], 0.6, metal))
  }
  const cy = 16 + 52
  g.add(lit(ball(22, paper, { y: cy }, [1, 2.36, 1]), paper, 0.55))
  for (let i = -4; i <= 4; i++) {
    const dy = i * 11
    const r = 22 * Math.sqrt(Math.max(0, 1 - (dy / 52) ** 2)) + 0.15
    if (r < 3) continue
    g.add(noOutlineDeep(P(torus(r, 0.25, rib), 0, cy + dy, 0, Math.PI / 2)))
  }
  g.add(cyl(0.6, 0.6, 3, metal, { y: cy + 51 }, 8))
  return centered(g)
}

/** 北欧木杆落地灯：圆木底座 + 细木杆 + 亚麻筒罩 */
function poleLamp(p: string[]) {
  const [shadeC, wood, metal] = p
  const g = new THREE.Group()
  g.add(puck(16, 4, wood))
  g.add(cyl(1.6, 1.8, 124, wood, { y: 3.5 }, 12))
  g.add(cyl(1, 1, 8, metal, { y: 127 }, 8))
  g.add(drum(17, 20, 26, shadeC, { y: 124 }))
  g.add(bulb(3.5, 0, 133, 0))
  g.add(cyl(0.4, 0.4, 18, metal, { x: 2.5, y: 106 }, 6))
  g.add(ball(0.9, metal, { x: 2.5, y: 105.5 }))
  return g
}

/** 褶皱灯罩台灯：圆鼓陶瓷底座 */
function pleatLamp(p: string[]) {
  const [shadeC, base, metal] = p
  const g = new THREE.Group()
  g.add(cyl(5, 6, 2, base, {}, 24))
  g.add(ball(9, base, { y: 11 }, [1, 1, 1]))
  g.add(cyl(2.5, 3.5, 4, base, { y: 18.5 }, 16))
  g.add(cyl(0.6, 0.6, 8, metal, { y: 22 }, 8))
  g.add(pleated(9, 15, 16, shadeC, 26))
  g.add(bulb(2.8, 0, 31, 0))
  return g
}

/** 银行家台灯：黄铜底座 + 半圆筒绿玻璃罩 + 拉链 */
function bankerLamp(p: string[]) {
  const [glassC, brass] = p
  const g = new THREE.Group()
  g.add(rbox(24, 3, 14, brass, {}, 1))
  g.add(cyl(1, 1, 24, brass, { y: 3 }, 10))
  g.add(rbox(4, 1.5, 14, brass, { y: 26, z: 0 }, 0.4))
  const geo = new THREE.CylinderGeometry(7, 7, 26, 24, 1, true, 0, Math.PI)
  const mat = toon(glassC, { emissive: 0.25 }).clone()
  mat.side = THREE.DoubleSide
  const sh = new THREE.Mesh(geo, mat)
  sh.rotation.z = Math.PI / 2
  sh.position.set(0, 27, 0)
  sh.castShadow = true
  g.add(sh)
  for (const s of [-1, 1]) g.add(P(new THREE.Mesh(new THREE.CircleGeometry(7, 24, 0, Math.PI), mat), s * 13, 27, 0, 0, s * Math.PI / 2, 0))
  g.add(bulb(2.5, 0, 25, 0))
  g.add(cyl(0.2, 0.2, 8, brass, { x: 8, y: 19.4, z: 6.4 }, 6))
  g.add(ball(0.8, brass, { x: 8, y: 19, z: 6.4 }))
  return g
}

/** 陶瓷罐台灯（将军罐底座 + 筒罩） */
function jarLamp(p: string[]) {
  const [shadeC, jar, metal] = p
  const g = new THREE.Group()
  g.add(cyl(7, 7.5, 2, shade(jar, -0.15), {}, 24))
  g.add(ball(12, jar, { y: 13 }, [1, 1.05, 1]))
  g.add(cyl(5, 7, 4, jar, { y: 24 }, 24))
  g.add(cyl(0.7, 0.7, 14, metal, { y: 27 }, 8))
  g.add(drum(15, 18, 22, shadeC, { y: 36 }))
  g.add(bulb(3, 0, 44, 0))
  g.add(ball(1.2, metal, { y: 58.4 }))
  return g
}

/** 月球灯：发光球 + 木托 */
function moonLamp(p: string[]) {
  const [moon, wood] = p
  const g = new THREE.Group()
  g.add(cup(5.5, 4.5, 3.5, 1, wood))
  const m = lit(ball(7.5, moon, { y: 10 }), moon, 0.55)
  g.add(m)
  // 环形山：略深的小斑（不描边，贴在球面上）
  for (const [a, b, r] of [[0.4, 0.3, 1.6], [-0.7, 0.6, 1.1], [1.6, -0.2, 1.3], [-1.8, -0.4, 1]] as V3[]) {
    const v = new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).multiplyScalar(7.25)
    const c = lit(ball(r, shade(moon, -0.12), { x: v.x, y: 10 + v.y, z: v.z }, [1, 1, 0.3]), shade(moon, -0.12), 0.45)
    c.lookAt(0, 10, 0)
    g.add(c)
  }
  return g
}

/** 壁灯：圆底座 + 弯臂 + 朝上的锥形罩（离地 150） */
const SCONCE_Y = 150
function sconce(p: string[]) {
  const [shadeC, metal] = p
  const g = new THREE.Group()
  g.add(rbox(7, 16, 1.6, metal, { y: 2, z: -11.2 }, 0.8))
  g.add(tube([[0, 9, -11], [0, 9, -4], [0, 12, 2], [0, 14, 4]], 0.7, metal, 24))
  g.add(cyl(1.5, 1.2, 2.5, metal, { y: 12.5, z: 4 }, 10))
  g.add(drum(9, 5, 14, shadeC, { y: 14, z: 4 }))
  g.add(bulb(2.4, 0, 18, 4))
  return mountAt(g, SCONCE_Y)
}

/** 串灯：几段下垂的电线挂一串暖光小灯泡（壁挂，离地 160） */
const FAIRY_Y = 160
function fairyLights(p: string[]) {
  const [wire, bulbC, clip] = p
  const g = new THREE.Group()
  const W = 150
  const swags = 3
  const sw = W / swags
  for (let s = 0; s < swags; s++) {
    const x0 = -W / 2 + s * sw
    const sag = s === 1 ? 22 : 16
    const pts: V3[] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      pts.push([x0 + t * sw, 30 - sag * 4 * t * (1 - t), 0])
    }
    g.add(tube(pts, 0.25, wire, 40))
    for (let i = 1; i < 8; i++) {
      const t = i / 8
      const x = x0 + t * sw
      const y = 30 - sag * 4 * t * (1 - t)
      g.add(lit(ball(1.4, bulbC, { x, y: y - 2, z: 0 }, [1, 1.3, 1]), bulbC, 0.95))
    }
  }
  for (let s = 0; s <= swags; s++) g.add(rbox(2, 3, 2.4, clip, { x: -W / 2 + s * sw, y: 28.5, z: -0.2 }, 0.5))
  return mountAt(g, FAIRY_Y)
}

/** 星星灯帘：顶部横线 + 垂下的几串星星（壁挂） */
const STAR_Y = 110
function starCurtain(p: string[]) {
  const [wire, star, acc] = p
  const g = new THREE.Group()
  const W = 120
  g.add(cylX(0.35, W, wire, 0, 99.5, 0, 8))
  const r = rng(5)
  const starPts: [number, number][] = []
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2
    const rr = k % 2 ? 1.2 : 2.8
    starPts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  for (let i = 0; i < 8; i++) {
    const x = -W / 2 + 7.5 + i * 15
    const len = 55 + r() * 40
    g.add(cyl(0.18, 0.18, len, wire, { x, y: 100 - len }, 5))
    const n = Math.floor(len / 18)
    for (let j = 1; j <= n; j++) {
      const s = lit(prism(starPts, 1, j % 2 ? star : acc, 0, 0.2), j % 2 ? star : acc, 0.9)
      s.position.set(x, 100 - j * 18 + 2, 0)
      g.add(s)
    }
  }
  return mountAt(g, STAR_Y)
}

/** 霓虹灯牌：透明亚克力背板 + 发光的灯管图案（月亮 + 星星） */
const NEON_Y = 140
function neonSign(p: string[]) {
  const [tubeA, tubeB, plate] = p
  const g = new THREE.Group()
  g.add(clearMat(rbox(50, 40, 0.8, plate, { y: 0, z: -1.1 }, 1), plate, 0.28))
  // 月亮：两段弧
  const moon: V3[] = []
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI * 0.75 + (i / 24) * Math.PI * 1.5
    moon.push([-8 + Math.cos(a + Math.PI) * 13, 20 + Math.sin(a + Math.PI) * 13, 0])
  }
  for (let i = 24; i >= 0; i--) {
    const a = -Math.PI * 0.6 + (i / 24) * Math.PI * 1.2
    moon.push([-2.5 + Math.cos(a + Math.PI) * 10, 20 + Math.sin(a + Math.PI) * 10, 0])
  }
  g.add(lit(tube(moon, 0.6, tubeA, 96, true), tubeA, 0.95))
  // 星星
  const star: V3[] = []
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2
    const rr = k % 2 ? 2.6 : 6.5
    star.push([14 + Math.cos(a) * rr, 24 + Math.sin(a) * rr, 0])
  }
  g.add(lit(tube(star, 0.55, tubeB, 60, true), tubeB, 0.95))
  g.add(lit(ball(1.2, tubeB, { x: 15, y: 10, z: 0 }), tubeB, 0.95))
  g.add(lit(ball(0.9, tubeA, { x: 6, y: 34, z: 0 }), tubeA, 0.95))
  return mountAt(g, NEON_Y)
}

/** 氛围灯棒：竖直发光条 + 底座 */
function ledBar(p: string[]) {
  const [body, glowC, acc] = p
  const g = new THREE.Group()
  g.add(puck(5, 2, body))
  g.add(rbox(4, 36, 4, body, { y: 1.8 }, 1.2))
  g.add(glow(2.4, 33, glowC, { y: 3.3, z: 2.1 }, 0.95))
  g.add(lit(rbox(2.4, 16, 0.6, acc, { y: 20, z: 2.15 }, 0.3), acc, 0.95))
  return g
}

/** 云朵小夜灯：挤出的云形发光体 + 底座 */
function cloudNightLight(p: string[]) {
  const [glowC, base, acc] = p
  const g = new THREE.Group()
  const pts: [number, number][] = []
  const bumps: [number, number, number][] = [[-5, 4.5, 3.6], [0, 6.5, 4.6], [5, 4.8, 3.8]]
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const x = -8 + 16 * t
    let y = 2
    for (const [bx, by, br] of bumps) {
      const dx = x - bx
      if (Math.abs(dx) < br) y = Math.max(y, by + Math.sqrt(br * br - dx * dx))
    }
    pts.push([x, y])
  }
  pts.push([8, 0], [-8, 0])
  const cl = lit(prism(pts, 4.5, glowC, 0, 1), glowC)
  cl.position.y = 2
  g.add(cl)
  g.add(rbox(14, 2.2, 5.5, base, {}, 0.8))
  g.add(ball(0.6, acc, { x: 5, y: 1.1, z: 2.8 }))
  return g
}

/** 烛台灯笼：金属框 + 玻璃 + 蜡烛 + 提环 */
function candleLantern(p: string[]) {
  const [frame, candle, acc] = p
  const g = new THREE.Group()
  g.add(rbox(16, 2, 16, frame, {}, 0.6))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1, 20, 1, frame, { x: sx * 7, y: 2, z: sz * 7 }, 0.3))
  for (const [x, z, ry] of [[0, 7, 0], [0, -7, 0], [7, 0, Math.PI / 2], [-7, 0, Math.PI / 2]] as V3[]) g.add(clearMat(rbox(13, 19.6, 0.3, C.glass, { x, y: 2.2, z, ry }, 0.1), C.glass, 0.32))
  g.add(rbox(16, 1.5, 16, frame, { y: 22 }, 0.5))
  g.add(cyl(2, 7.5, 4.5, frame, { y: 23.5 }, 4))
  g.children[g.children.length - 1].rotation.y = Math.PI / 4
  g.add(P(torus(3, 0.4, acc), 0, 30.5, 0))
  g.add(cyl(3, 3, 8, candle, { y: 2 }, 16))
  g.add(cyl(0.15, 0.15, 1, '#3a2a2a', { y: 10 }, 5))
  return g
}

/** 托盘蜡烛组：圆木托盘 + 三根高低柱蜡烛 */
const CANDLES: V3[] = [
  [-5, 12, -3],
  [5, 8, -4],
  [0.5, 5, 6],
]
function candleTray(p: string[]) {
  const [candle, trayC, acc] = p
  const g = new THREE.Group()
  g.add(cup(14, 13.5, 2.2, 0.8, trayC))
  CANDLES.forEach(([x, h, z], i) => {
    g.add(cyl(3.2 - i * 0.2, 3.2 - i * 0.2, h, i === 1 ? acc : candle, { x, y: 0.8, z }, 20))
    g.add(cyl(0.15, 0.15, 0.9, '#3a2a2a', { x, y: 0.8 + h, z }, 5))
  })
  return g
}

const LAMP_SHADE_PALS: PalFlat[] = [
  ['nordic', N.linen, N.oak, N.white],
  ['modern', M.white, M.black, M.silver],
  ['industrial', I.concrete, I.walnut, I.iron],
  ['retro', R.cream, R.caramel, BRASS],
  ['cute', C.sakura, C.woodL, C.white],
]

export const LM_LIGHTS: AssetDef[] = [
  def(
    'lm-arc-lamp',
    '弧形钓鱼灯',
    'lighting',
    [44, 144, 195.6],
    [
      ['modern', M.white, CHROME, M.white],
      ['modern', M.black, M.black, '#e9e6e1'],
      ['retro', R.mustard, BRASS, '#e9e6e1'],
      ['industrial', I.iron, I.steel, I.concrete],
      ['cute', C.mint, C.white, C.white],
    ],
    arcLamp,
    { family: 'floor-lamp', sizeLabel: '弧形钓鱼' },
  ),
  def('lm-tripod-lamp', '三脚落地灯', 'lighting', [51.3, 53.5, 149.5], LAMP_SHADE_PALS, tripodLamp, { family: 'floor-lamp', sizeLabel: '三脚' }),
  def(
    'lm-akari-floor',
    '和纸灯笼落地灯',
    'lighting',
    [44.8, 44.8, 121.9],
    [
      ['japanese', J.washi, J.sumi, J.wood],
      ['nordic', N.white, N.oak, N.gray],
      ['modern', M.white, M.black, M.gray],
      ['cute', C.sakura, C.white, C.pink],
    ],
    akariFloor,
    { family: 'floor-lamp', sizeLabel: '和纸灯笼' },
  ),
  def('lm-pole-lamp', '北欧木杆落地灯', 'lighting', [40, 40, 150], LAMP_SHADE_PALS, poleLamp, { family: 'floor-lamp', sizeLabel: '木杆' }),
  def(
    'lm-pleat-lamp',
    '褶皱灯罩台灯',
    'lighting',
    [29.7, 29.7, 42],
    [
      ['cute', C.sakura, C.white, BRASS],
      ['nordic', N.white, N.sage, BRASS],
      ['retro', R.cream, R.teal, BRASS],
      ['modern', M.white, M.char, CHROME],
      ['japanese', J.washi, J.ai, J.sumi],
    ],
    pleatLamp,
    { ...PROP, family: 'table-lamp', sizeLabel: '褶皱罩' },
  ),
  def(
    'lm-banker-lamp',
    '银行家台灯',
    'lighting',
    [26, 14, 34],
    [
      ['retro', '#3f8f5a', BRASS],
      ['industrial', '#2f6f6a', I.iron],
      ['modern', M.white, CHROME],
      ['retro', R.red, BRASS],
    ],
    bankerLamp,
    { ...PROP, family: 'desk-lamp', sizeLabel: '银行家' },
  ),
  def(
    'lm-jar-lamp',
    '陶瓷罐台灯',
    'lighting',
    [36, 36, 59.6],
    [
      ['nordic', N.linen, N.blue, BRASS],
      ['japanese', J.washi, J.ai, J.sumi],
      ['modern', M.white, M.char, CHROME],
      ['retro', R.cream, R.teal, BRASS],
      ['cute', C.white, C.pink, BRASS],
    ],
    jarLamp,
    { ...PROP, family: 'table-lamp', sizeLabel: '陶瓷罐' },
  ),
  def(
    'lm-moon-lamp',
    '月球灯',
    'lighting',
    [15.1, 15, 17.5],
    [
      ['nordic', '#fff2cf', N.oak],
      ['modern', '#f4f4f2', M.black],
      ['cute', '#ffe3ef', C.woodL],
      ['retro', '#ffd98a', R.caramel],
    ],
    moonLamp,
    PROP,
  ),
  def(
    'lm-sconce',
    '壁灯',
    'lighting',
    [18, 25, 26],
    [
      ['modern', M.white, M.black],
      ['retro', R.mustard, BRASS],
      ['industrial', I.iron, I.steel],
      ['nordic', N.linen, N.oak],
      ['cute', C.sakura, C.white],
    ],
    sconce,
    { mount: SCONCE_Y, family: 'wall-lamp', sizeLabel: '弯臂' },
  ),
  def(
    'lm-fairy-lights',
    '串灯',
    'lighting',
    [152, 2.8, 27.3],
    [
      ['cute', C.white, WARM, C.pink],
      ['nordic', '#c8b89a', WARM, N.oak],
      ['modern', M.black, '#fff6e0', M.black],
      ['retro', R.olive, '#ffc86b', R.red],
    ],
    fairyLights,
    { mount: FAIRY_Y },
  ),
  def(
    'lm-star-curtain',
    '星星灯帘',
    'lighting',
    [120, 1, 89.1],
    [
      ['cute', C.white, WARM, '#ffd1e3'],
      ['nordic', N.gray, WARM, '#fff6e0'],
      ['modern', M.silver, '#eef6ff', '#fff6e0'],
      ['retro', R.olive, '#ffc86b', '#ff9a6b'],
    ],
    starCurtain,
    { mount: STAR_Y },
  ),
  def(
    'lm-neon-sign',
    '霓虹灯牌',
    'lighting',
    [50, 2.7, 40],
    [
      ['cute', '#ff7ab8', '#7ad8ff', C.white],
      ['retro', '#ffb347', '#ff5f5f', C.white],
      ['modern', '#f4f4f2', '#9fd8ff', C.white],
      ['industrial', '#ffd27a', '#ff7a4a', C.white],
    ],
    neonSign,
    { mount: NEON_Y },
  ),
  def(
    'lm-led-bar',
    '氛围灯棒',
    'lighting',
    [10, 10, 37.8],
    [
      ['modern', M.black, '#8fd0ff', '#d58bff'],
      ['modern', M.white, '#ffe2a0', '#ffb36b'],
      ['cute', C.white, '#ffb6d9', '#b6d9ff'],
      ['industrial', I.iron, '#ff9a6b', '#ffd27a'],
    ],
    ledBar,
    PROP,
  ),
  def(
    'lm-cloud-light',
    '云朵小夜灯',
    'lighting',
    [16, 6.2, 13.1],
    [
      ['cute', '#fff4d6', C.pink, C.white],
      ['cute', '#e8f4ff', C.sky, C.white],
      ['nordic', '#fff7e8', N.oak, N.white],
      ['modern', '#f6f6f4', M.char, M.silver],
    ],
    cloudNightLight,
    PROP,
  ),
  def(
    'lm-candle-lantern',
    '烛台灯笼',
    'lighting',
    [16, 16, 33.9],
    [
      ['nordic', N.white, '#fbf3e4', N.oak],
      ['industrial', I.iron, '#fbf3e4', I.steel],
      ['retro', BRASS, '#fff1d6', BRASS],
      ['modern', M.black, '#f4f4f2', M.black],
    ],
    candleLantern,
    { ...PROP, fx: [{ kind: 'flame', x: 0, y: 11, z: 0, scale: 0.7 }] },
  ),
  def(
    'lm-candle-tray',
    '托盘蜡烛组',
    'lighting',
    [28, 28, 13.7],
    [
      ['nordic', '#fbf3e4', N.oak, N.sage],
      ['japanese', J.washi, J.dark, J.shu],
      ['modern', M.white, M.black, M.gray],
      ['cute', '#fff1f4', C.woodL, C.sakura],
      ['retro', R.cream, R.caramel, R.mustard],
    ],
    candleTray,
    { ...PROP, fx: CANDLES.map(([x, h, z]) => ({ kind: 'flame' as const, x, y: h + 2.2, z, scale: 0.6 })) },
  ),
]

// =====================================================================
// 地毯 / 地垫（很薄，声明 surface，玩具小物可以摆上去）
// =====================================================================

/** 地毯底层：不投影 */
function rugBase<T extends THREE.Object3D>(o: T, outline = true): T {
  o.traverse((c) => {
    c.castShadow = false
    if (!outline) c.userData.noOutline = true
  })
  return o
}

/** 长条走廊地毯：条纹 + 两端流苏 */
function runnerRug(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rugBase(rbox(70, 1.2, 200, main, {}, 0.5)))
  g.add(rugBase(rbox(62, 1.5, 192, sub, {}, 0.5), false))
  g.add(rugBase(rbox(56, 1.8, 186, main, {}, 0.5), false))
  for (let i = -3; i <= 3; i++) g.add(rugBase(rbox(56.2, 1.9, 6, i % 2 ? acc : sub, { z: i * 24 }, 0.3), false))
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) g.add(rugBase(rbox(1, 0.6, 4.5, sub, { x: -32.5 + i * 5, z: s * 102 }, 0.25), false))
  return g
}

/** 云朵地毯：外层云 + 内层小一圈 */
function cloudRug(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rugBase(flatShape(cloudPoly(160, 110), 1.6, main)))
  g.add(rugBase(flatShape(cloudPoly(160, 110).map(([x, z]): [number, number] => [x * 0.78, z * 0.74 - 2]), 2, sub), false))
  return centered(g)
}

/** 小熊头地毯 */
function bearRug(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const dz = 4
  g.add(rugBase(flatShape(ellipsePoly(55, 50, 0, dz, 48), 1.6, main)))
  for (const s of [-1, 1]) {
    g.add(rugBase(flatShape(ellipsePoly(18, 18, s * 40, -40 + dz, 24), 1.6, main)))
    g.add(rugBase(flatShape(ellipsePoly(10, 10, s * 40, -40 + dz, 20), 2, sub), false))
    g.add(rugBase(flatShape(ellipsePoly(4, 4, s * 20, -6 + dz, 16), 2, '#4a3434'), false))
    g.add(rugBase(flatShape(ellipsePoly(7, 4, s * 33, 12 + dz, 16), 1.9, acc), false))
  }
  g.add(rugBase(flatShape(ellipsePoly(20, 15, 0, 18 + dz, 32), 2, sub), false))
  g.add(rugBase(flatShape(ellipsePoly(6, 4, 0, 10 + dz, 16), 2.4, '#4a3434'), false))
  return g
}

/** 彩虹半圆地毯：几道半圆环 */
function rainbowRug(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const bands = [a, b, c, shade(a, 0.25), C.cream]
  const R0 = 70
  const step = 13
  const z0 = 35
  bands.forEach((col, i) => {
    const ro = R0 - i * step
    const ri = i === bands.length - 1 ? 0 : ro - step
    const poly: Poly = []
    for (let k = 0; k <= 32; k++) {
      const t = Math.PI + (k / 32) * Math.PI
      poly.push([Math.cos(t) * ro, z0 + Math.sin(t) * ro])
    }
    if (ri > 0)
      for (let k = 32; k >= 0; k--) {
        const t = Math.PI + (k / 32) * Math.PI
        poly.push([Math.cos(t) * ri, z0 + Math.sin(t) * ri])
      }
    g.add(rugBase(flatShape(poly, 1.6, col, 0, 0.3), i === 0))
  })
  return g
}

/** 格纹方地毯（画布格子） */
function checkerRug(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  g.add(rugBase(rbox(180, 1.4, 180, a, {}, 0.5)))
  g.add(
    flatPaint(
      172,
      172,
      `lm-checker-${a}${b}${c}`,
      (x, W, H) => {
        const n = 8
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            x.fillStyle = (i + j) % 2 ? a : b
            x.fillRect((i * W) / n, (j * H) / n, W / n + 1, H / n + 1)
          }
        x.strokeStyle = c
        x.lineWidth = W * 0.008
        for (let i = 1; i < n; i++) {
          x.beginPath()
          x.moveTo((i * W) / n, 0)
          x.lineTo((i * W) / n, H)
          x.moveTo(0, (i * H) / n)
          x.lineTo(W, (i * H) / n)
          x.stroke()
        }
      },
      1.5,
    ),
  )
  return g
}

/** 椭圆编织地毯：一圈圈颜色交替（逐层略高一点） */
function braidedRug(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const cols = [a, b, c, a, b, c, a]
  cols.forEach((col, i) => {
    const k = 1 - i * 0.135
    g.add(rugBase(flatShape(ellipsePoly(90 * k, 60 * k, 0, 0, 48), 1.2 + i * 0.2, col, 0, 0.3), i === 0))
  })
  return g
}

/** 和式花莚：灯芯草底 + 印花（菱格 + 花） */
function hanamushiro(p: string[]) {
  const [ground, a, b] = p
  const g = new THREE.Group()
  g.add(rugBase(rbox(176, 1, 176, ground, {}, 0.3)))
  for (const s of [-1, 1]) g.add(rugBase(rbox(176, 1.3, 5, a, { z: s * 85.5 }, 0.3), false))
  g.add(
    flatPaint(
      174,
      164,
      `lm-hanamushiro-${ground}${a}${b}`,
      (x, W, H) => {
        x.fillStyle = ground
        x.fillRect(0, 0, W, H)
        x.strokeStyle = shade(ground, -0.08)
        x.lineWidth = 1
        for (let y = 0; y < H; y += 3) {
          x.beginPath()
          x.moveTo(0, y)
          x.lineTo(W, y)
          x.stroke()
        }
        const n = 6
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const cx = ((i + 0.5) * W) / n
            const cy = ((j + 0.5) * H) / n
            const r = Math.min(W, H) / n / 2.6
            x.fillStyle = (i + j) % 2 ? a : b
            if ((i + j) % 2) {
              for (let k = 0; k < 5; k++) {
                const t = (k / 5) * Math.PI * 2
                x.beginPath()
                x.arc(cx + Math.cos(t) * r * 0.5, cy + Math.sin(t) * r * 0.5, r * 0.45, 0, Math.PI * 2)
                x.fill()
              }
            } else {
              x.beginPath()
              x.moveTo(cx, cy - r)
              x.lineTo(cx + r, cy)
              x.lineTo(cx, cy + r)
              x.lineTo(cx - r, cy)
              x.closePath()
              x.fill()
            }
          }
      },
      1.15,
    ),
  )
  return g
}

/** 几何基里姆地毯 */
function kilimRug(p: string[]) {
  const [ground, a, b] = p
  const g = new THREE.Group()
  g.add(rugBase(rbox(200, 1.3, 140, ground, {}, 0.5)))
  g.add(
    flatPaint(
      192,
      132,
      `lm-kilim-${ground}${a}${b}`,
      (x, W, H) => {
        x.fillStyle = ground
        x.fillRect(0, 0, W, H)
        x.fillStyle = a
        x.fillRect(0, 0, W, H * 0.08)
        x.fillRect(0, H * 0.92, W, H * 0.08)
        for (let i = 0; i < 4; i++) {
          const cx = ((i + 0.5) * W) / 4
          const cy = H / 2
          const r = H * 0.3
          for (const [k, col] of [[1, a], [0.66, b], [0.33, ground]] as [number, string][]) {
            x.fillStyle = col
            x.beginPath()
            x.moveTo(cx, cy - r * k)
            x.lineTo(cx + r * k * 0.8, cy)
            x.lineTo(cx, cy + r * k)
            x.lineTo(cx - r * k * 0.8, cy)
            x.closePath()
            x.fill()
          }
        }
        x.fillStyle = b
        for (let i = 0; i < 24; i++) {
          const cx = ((i + 0.5) * W) / 24
          x.beginPath()
          x.moveTo(cx - W / 60, H * 0.08)
          x.lineTo(cx, H * 0.14)
          x.lineTo(cx + W / 60, H * 0.08)
          x.fill()
          x.beginPath()
          x.moveTo(cx - W / 60, H * 0.92)
          x.lineTo(cx, H * 0.86)
          x.lineTo(cx + W / 60, H * 0.92)
          x.fill()
        }
      },
      1.4,
    ),
  )
  return g
}

/** 门口脚垫：长方（椰棕 + 字） / 半圆 / 猫咪轮廓 */
function doormat(kind: 'rect' | 'half' | 'cat') {
  return (p: string[]) => {
    const [ground, a, b] = p
    const g = new THREE.Group()
    if (kind === 'rect') {
      g.add(rugBase(rbox(60, 1.6, 40, a, {}, 0.5)))
      g.add(rugBase(rbox(54, 1.9, 34, ground, {}, 0.4), false))
      g.add(
        flatPaint(
          44,
          12,
          `lm-mat-${ground}${b}`,
          (x, W, H) => {
            x.fillStyle = ground
            x.fillRect(0, 0, W, H)
            x.fillStyle = b
            x.font = `bold ${Math.round(H * 0.7)}px sans-serif`
            x.textAlign = 'center'
            x.textBaseline = 'middle'
            x.fillText('WELCOME', W / 2, H / 2)
          },
          1.95,
        ),
      )
      return g
    }
    if (kind === 'half') {
      const poly: Poly = []
      for (let k = 0; k <= 32; k++) {
        const t = Math.PI + (k / 32) * Math.PI
        poly.push([Math.cos(t) * 35, 20 + Math.sin(t) * 40])
      }
      g.add(rugBase(flatShape(poly, 1.6, ground)))
      const inner: Poly = poly.map(([x, z]) => [x * 0.8, 20 + (z - 20) * 0.78 - 0.5])
      g.add(rugBase(flatShape(inner, 1.9, a), false))
      g.add(rugBase(flatShape(poly.map(([x, z]) => [x * 0.5, 20 + (z - 20) * 0.45 - 1]), 2.1, b), false))
      return g
    }
    // 猫咪：圆脸 + 两只耳朵
    const head = smoothPoly([
      [-30, 18], [-28, -4], [-26, -20], [-16, -10], [0, -12], [16, -10], [26, -20], [28, -4], [30, 18], [0, 22],
    ], 60)
    g.add(rugBase(flatShape(head, 1.6, ground)))
    for (const s of [-1, 1]) {
      g.add(rugBase(flatShape(ellipsePoly(3, 3.6, s * 11, 2, 12), 2, b), false))
      g.add(rugBase(flatShape(ellipsePoly(5, 2.5, s * 18, 10, 12), 1.9, a), false))
    }
    g.add(rugBase(flatShape(ellipsePoly(2.4, 1.6, 0, 8, 12), 2, b), false))
    return centered(g)
  }
}

const RUG_SURF = (h: number): Partial<AssetDef> => ({ surface: h })

export const LM_RUGS: AssetDef[] = [
  def(
    'lm-rug-runner',
    '长条走廊地毯',
    'living',
    [70, 208.5, 1.9],
    [
      ['nordic', N.linen, N.gray, N.sage],
      ['retro', R.red, R.cream, R.teal],
      ['modern', M.light, M.char, M.gray],
      ['japanese', J.ai, J.washi, J.shu],
      ['industrial', I.concrete, I.rust, I.iron],
    ],
    runnerRug,
    RUG_SURF(1.9),
  ),
  def(
    'lm-rug-cloud',
    '云朵地毯',
    'kids',
    [156.3, 107.9, 2],
    [
      ['cute', C.white, C.sky],
      ['cute', C.sakura, C.white],
      ['nordic', N.linen, N.white],
      ['modern', M.light, M.white],
    ],
    cloudRug,
    RUG_SURF(2),
  ),
  def(
    'lm-rug-bear',
    '小熊地毯',
    'kids',
    [116, 108, 2.4],
    [
      ['cute', '#d9a77a', C.cream, C.pink],
      ['cute', C.white, C.sakura, C.pink],
      ['nordic', N.linen, N.white, '#e8b8a8'],
      ['modern', M.light, M.white, '#e8b8a8'],
    ],
    bearRug,
    RUG_SURF(2.4),
  ),
  def(
    'lm-rug-rainbow',
    '彩虹地毯',
    'kids',
    [140, 70, 1.6],
    [
      ['cute', C.pink, C.lemon, C.mint],
      ['retro', R.orange, R.mustard, R.teal],
      ['nordic', '#d9a98c', N.mustard, N.sage],
      ['modern', M.char, M.gray, M.light],
    ],
    rainbowRug,
    RUG_SURF(1.6),
  ),
  def(
    'lm-rug-checker',
    '格纹方地毯',
    'living',
    [180, 180, 1.5],
    [
      ['retro', R.cream, R.mustard, R.caramel],
      ['cute', C.white, C.sakura, C.pink],
      ['nordic', N.white, N.sage, N.gray],
      ['modern', M.white, M.char, M.gray],
      ['industrial', I.concrete, I.walnut, I.iron],
    ],
    checkerRug,
    RUG_SURF(1.5),
  ),
  def(
    'lm-rug-braided',
    '椭圆编织地毯',
    'living',
    [180, 120, 2.4],
    [
      ['nordic', N.linen, N.gray, N.blue],
      ['retro', R.mustard, R.teal, R.cream],
      ['cute', C.sakura, C.cream, C.mint],
      ['industrial', I.concrete, I.walnut, I.rust],
    ],
    braidedRug,
    RUG_SURF(2.4),
  ),
  def(
    'lm-hanamushiro',
    '花莚',
    'japanese',
    [176, 176, 1.3],
    [
      ['japanese', J.tatami, J.shu, J.ai],
      ['japanese', J.hinoki, J.ai, J.sumi],
      ['nordic', N.oakL, N.sage, N.blue],
      ['retro', '#d9c48a', R.red, R.teal],
    ],
    hanamushiro,
    RUG_SURF(1.3),
  ),
  def(
    'lm-rug-kilim',
    '几何基里姆地毯',
    'living',
    [200, 140, 1.4],
    [
      ['retro', R.cream, R.red, R.teal],
      ['industrial', I.concrete, I.rust, I.iron],
      ['nordic', N.white, N.blue, N.mustard],
      ['modern', M.white, M.char, M.gray],
    ],
    kilimRug,
    RUG_SURF(1.4),
  ),
  def(
    'lm-doormat-rect',
    '门口脚垫',
    'entrance',
    [60, 40, 2],
    [
      ['nordic', '#c9a46c', '#8a6a44', '#4a3a2a'],
      ['modern', M.char, M.black, M.white],
      ['retro', R.mustard, R.caramel, R.red],
      ['industrial', I.concrete, I.iron, I.rust],
    ],
    doormat('rect'),
    { family: 'lm-doormat', sizeLabel: '长方', ...RUG_SURF(1.9) },
  ),
  def(
    'lm-doormat-half',
    '门口脚垫',
    'entrance',
    [70, 40, 2.1],
    [
      ['nordic', '#c9a46c', N.white, N.sage],
      ['japanese', J.ai, J.washi, J.shu],
      ['retro', R.teal, R.cream, R.orange],
      ['modern', M.gray, M.light, M.char],
    ],
    doormat('half'),
    { family: 'lm-doormat', sizeLabel: '半圆', ...RUG_SURF(2.1) },
  ),
  def(
    'lm-doormat-cat',
    '门口脚垫',
    'entrance',
    [62.5, 42.1, 2],
    [
      ['cute', C.lemon, C.pink, '#4a3434'],
      ['modern', M.char, '#e8b8a8', M.white],
      ['nordic', N.gray, '#e8b8a8', N.white],
      ['cute', C.white, C.sakura, '#4a3434'],
    ],
    doormat('cat'),
    { family: 'lm-doormat', sizeLabel: '猫咪', ...RUG_SURF(2) },
  ),
]

// =====================================================================
// 文具 / 办公小物（prop，原点在底面中心）
// =====================================================================

/** 一支笔：笔杆 + 笔帽，底端在 (x, y, z)，向 (tx, tz) 方向倾斜 */
function pen(len: number, color: string, cap: string, x: number, y: number, z: number, rx = 0, rz = 0) {
  const g = G(cyl(0.45, 0.45, len, color, {}, 8), cyl(0.5, 0.5, len * 0.3, cap, { y: len * 0.7 }, 8), cyl(0.12, 0.3, 0.8, '#444', { y: -0.8 }, 6))
  return P(g, x, y, z, rx, 0, rz)
}

/** 多格笔筒：三格收纳盒 + 笔、尺子、剪刀把手 */
function penOrganizer(p: string[]) {
  const [box, a, b] = p
  const g = new THREE.Group()
  g.add(tray(14, 9, 10, 0.6, box, {}, 0.25))
  g.add(rbox(0.6, 8.6, 9, box, { x: -2, y: 0.4 }, 0.2))
  g.add(rbox(5.2, 5.6, 0.6, box, { x: 4.3, y: 0.4, z: 0.5 }, 0.2))
  for (const [i, c] of [a, b, '#5a6b8c', C.red, a].entries()) g.add(pen(12, c, shade(c, -0.2), -6 + (i % 3) * 1.6, 0.8, -3 + Math.floor(i / 3) * 2.6 + (i % 2) * 0.6, (i - 2) * 0.05, (i - 2) * 0.06))
  // 尺子
  g.add(rbox(2.6, 15, 0.3, '#f0f4f8', { x: -0.4, y: 0.6, z: -3.6, rz: -0.06 }, 0.1))
  // 剪刀把手、橡皮
  g.add(P(torus(1.2, 0.35, b), 4.2, 10.4, -2.5, 0, 0.3, 0.25))
  g.add(P(torus(1.2, 0.35, b), 2.4, 10.1, -2.5, 0, 0.3, -0.25))
  g.add(rbox(0.5, 4, 0.5, CHROME, { x: 3.2, y: 6.4, z: -2.5 }, 0.15))
  g.add(rbox(2.4, 1.4, 1.6, C.white, { x: 4.3, y: 0.6, z: 3 }, 0.4))
  return g
}

/** 笔记本叠（平放）：几本错落的本子，最上面一本线圈本 */
function notebookStack(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const books: [number, number, number, string, number, number][] = [
    [21, 29.7, 1.6, a, 0, 0],
    [18.2, 25.7, 1.2, b, 0.6, 0.06],
    [21, 29.7, 0.8, c, -0.4, -0.04],
    [14.8, 21, 1.4, shade(a, 0.15), 0.3, 0.1],
  ]
  let y = 0
  for (const [w, d, t, col, dx, ry] of books) {
    const bk = G(rbox(w, t, d, col, {}, 0.3), rbox(w - 0.4, t - 0.3, d - 0.6, PAPER, { x: 0.4, y: 0.15 }, 0.1))
    P(bk, dx, y, 0, 0, ry, 0)
    g.add(bk)
    y += t
  }
  // 线圈
  for (let i = 0; i < 9; i++) g.add(P(torus(0.6, 0.15, CHROME), -7.4 + 0.3, y - 0.7, -9 + i * 2.2, 0, Math.PI / 2 + 0.1, 0))
  return g
}

/** 文件盒三连：斜切口的杂志盒，装着文件夹 */
function fileBoxes(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const cols = [a, b, c]
  const prof: [number, number][] = [[-12.5, 0], [12.5, 0], [12.5, 13], [-12.5, 32]]
  cols.forEach((col, i) => {
    const x = (i - 1) * 10
    for (const s of [-1, 1]) {
      const side = prism(prof, 0.6, col, 0, 0.2)
      side.rotation.y = -Math.PI / 2
      side.position.x = x + s * 4.7
      g.add(side)
    }
    g.add(rbox(8.8, 31.6, 0.6, col, { x, z: -12.2 }, 0.2))
    g.add(rbox(8.8, 0.6, 24.4, col, { x, y: 0 }, 0.2))
    g.add(rbox(8.8, 12.6, 0.6, col, { x, z: 12.2 }, 0.2))
    // 文件夹
    const r = rng(i + 3)
    for (let k = 0; k < 3; k++) g.add(rbox(1.6, 22 + r() * 6, 22, k % 2 ? PAPER : shade(col, 0.25), { x: x - 2.6 + k * 2.4, y: 0.6, z: -0.6, rz: (r() - 0.5) * 0.1 }, 0.2))
  })
  return g
}

/** 叠层文件托盘：三层前开口托盘 + 四根立柱，层里放纸 */
function letterTray(p: string[]) {
  const [frame, post, paper] = p
  const g = new THREE.Group()
  for (const y of [0, 7, 14]) {
    g.add(rbox(26, 0.6, 34, frame, { y }, 0.2))
    g.add(rbox(26, 3.4, 0.6, frame, { y, z: -16.7 }, 0.2))
    for (const s of [-1, 1]) g.add(rbox(0.6, 3.4, 34, frame, { x: s * 12.7, y }, 0.2))
    g.add(rbox(16, 1.6, 0.6, frame, { y, z: 16.7 }, 0.2))
    g.add(rbox(21, 0.8, 29.7, paper, { y: y + 0.6, z: -1.5 }, 0.1))
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.5, 0.5, 21, post, { x: sx * 12.2, z: sz * 16.2 }, 8))
  return g
}

/** 木块万年历：底座 + 两块数字方块 + 月份条 */
function blockCalendar(p: string[]) {
  const [wood, ink, acc] = p
  const g = new THREE.Group()
  g.add(rbox(15, 2, 7, wood, {}, 0.5))
  const digit = (n: string, x: number) => {
    g.add(rbox(4.8, 4.8, 4.8, shade(wood, 0.08), { x, y: 2, z: 0.6 }, 0.5))
    g.add(paintPanel(3.8, 3.8, `lm-cal-${n}-${ink}`, (c, W, H) => {
      c.fillStyle = shade(wood, 0.08)
      c.fillRect(0, 0, W, H)
      c.fillStyle = ink
      c.font = `bold ${Math.round(H * 0.8)}px sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(n, W / 2, H / 2 + H * 0.04)
    }, { x, y: 2.5, z: 3.05 }))
  }
  digit('1', -4.2)
  digit('6', 1.4)
  g.add(rbox(4.4, 2.4, 2, acc, { x: 5.4, y: 2, z: 1.6 }, 0.4))
  g.add(rbox(4.6, 6.5, 1.4, shade(wood, -0.08), { x: 5.2, y: 2, z: -1.8 }, 0.3))
  return g
}

/** 便利贴组：三叠方形便签 + 一排索引贴 */
function stickyNotes(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  g.add(rbox(7.6, 2, 7.6, a, { x: -2, z: -1, ry: 0.1 }, 0.15))
  g.add(rbox(7.6, 1.2, 7.6, b, { x: -1.4, y: 2, z: -0.6, ry: -0.08 }, 0.15))
  g.add(rbox(5, 1.4, 5, c, { x: 4.2, z: 2.6, ry: 0.3 }, 0.15))
  // 最上面一张翘起
  g.add(rbox(7.4, 0.12, 3.6, b, { x: -1.4, y: 3.4, z: 1.5, rx: 0.25, ry: -0.08 }, 0.04))
  const flags = [a, b, c, '#9fd8ff']
  flags.forEach((f, i) => g.add(rbox(1.2, 0.6, 4.4, f, { x: 4 + i * 1.3, y: 1.4, z: -3 }, 0.1)))
  g.add(rbox(6.4, 1.4, 5, C.white, { x: 5.2, y: 0, z: -3 }, 0.3))
  return centered(g)
}

/** 落地地球仪：木三脚 + 子午圈 + 球（陆块用压扁小球贴在球面上） */
function floorGlobe(p: string[]) {
  const [sea, land, wood] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    g.add(rod3([Math.cos(a) * 23, 0.8, Math.sin(a) * 23], [Math.cos(a) * 16, 48, Math.sin(a) * 16], 1.4, wood))
  }
  g.add(P(torus(18, 1.3, wood), 0, 48, 0, Math.PI / 2))
  const cy = 62
  const globe = new THREE.Group()
  globe.add(ball(15, sea))
  const r = rng(9)
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2
    const b = (r() - 0.5) * 2.2
    const v = new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).multiplyScalar(14.7)
    const m = ball(2.5 + r() * 3, land, { x: v.x, y: v.y, z: v.z }, [1, 0.8, 0.25])
    m.lookAt(0, 0, 0)
    m.userData.noOutline = true
    globe.add(m)
  }
  globe.rotation.z = 0.41
  globe.position.y = cy
  g.add(globe)
  const mer = torus(16.5, 0.6, BRASS, {}, Math.PI * 1.5)
  mer.rotation.set(0, 0, 0.41 - Math.PI * 0.25)
  mer.position.y = cy
  g.add(mer)
  g.add(cyl(0.6, 0.6, 3.6, BRASS, { y: 46.6 }, 8))
  return centered(g)
}

/** 桌面白板：A 字小画架 + 白板 + 笔槽 */
function deskWhiteboard(p: string[]) {
  const [frame, ink, acc] = p
  const g = new THREE.Group()
  const board = new THREE.Group()
  board.add(rbox(40, 28, 1.4, frame, {}, 0.6))
  board.add(paintPanel(37, 25, `lm-wb-${ink}${acc}`, (c, W, H) => {
    c.fillStyle = '#fbfcfd'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = ink
    c.lineWidth = W * 0.012
    c.beginPath()
    c.moveTo(W * 0.1, H * 0.25)
    c.lineTo(W * 0.55, H * 0.25)
    c.moveTo(W * 0.1, H * 0.42)
    c.lineTo(W * 0.45, H * 0.42)
    c.moveTo(W * 0.1, H * 0.59)
    c.lineTo(W * 0.5, H * 0.59)
    c.stroke()
    c.strokeStyle = acc
    c.beginPath()
    c.arc(W * 0.76, H * 0.45, H * 0.2, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = acc
    c.fillRect(W * 0.1, H * 0.76, W * 0.2, H * 0.06)
  }, { y: 1.5, z: 0.75 }))
  board.position.set(0, 3, 1.5)
  board.rotation.x = -0.18
  g.add(board)
  for (const s of [-1, 1]) g.add(rod3([s * 17, 0.5, -6], [s * 17, 30, -1], 0.6, frame))
  g.add(rbox(40, 1.6, 4, frame, { y: 0, z: 2.5 }, 0.4))
  g.add(rbox(40, 1.6, 0.6, frame, { y: 1.4, z: 4.2 }, 0.2))
  g.add(P(cyl(0.6, 0.6, 11, ink, {}, 8), -6, 2.2, 2.8, 0, 0, Math.PI / 2))
  g.add(P(cyl(0.6, 0.6, 11, acc, {}, 8), 7, 2.2, 2.8, 0, 0, Math.PI / 2))
  return centered(g)
}

/** 桌面收纳抽屉：三层小抽屉柜 */
function deskDrawers(p: string[]) {
  const [body, fr, knob] = p
  const g = new THREE.Group()
  g.add(openBox(30, 20, 22, 1, body))
  for (let i = 0; i < 3; i++) {
    g.add(front(27.6, 5.6, fr, 0, 1.2 + i * 6, 11))
    g.add(rbox(6, 0.8, 0.8, knob, { y: 3.4 + i * 6, z: 12.6 }, 0.3))
  }
  return centered(g)
}

/** 猫咪书立 + 一排书 */
function catBookends(p: string[]) {
  const [metal, , acc] = p
  const g = new THREE.Group()
  const cat: [number, number][] = [[-4, 0], [4, 0], [4, 10], [3, 14], [2, 12.5], [-2, 12.5], [-3, 14], [-4, 10]]
  for (const s of [-1, 1]) {
    g.add(rbox(1, 0.4, 14, metal, { x: s * 18.5 - s * 3, z: 0 }, 0.15))
    const c = prism(cat, 0.8, metal, 0, 0.2)
    c.rotation.y = Math.PI / 2
    c.position.set(s * 18.5, 0, 0)
    g.add(c)
  }
  g.add(bookRow(32, 21, 14, -16, 0.4, 0, 31, [acc, ...BOOK_COLORS]))
  return g
}

/** 无叶桌面风扇：圆底座 + 竖直椭圆环 */
function bladelessFan(p: string[]) {
  const [body, acc] = p
  const g = new THREE.Group()
  g.add(cyl(6, 7, 12, body, {}, 32))
  g.add(cyl(6.05, 6.05, 1.2, acc, { y: 9 }, 32))
  const ring = torus(9, 1.6, body)
  ring.scale.set(1, 1.6, 1.6)
  ring.position.set(0, 12 + 9 * 1.6 + 1.6 * 1.6 - 0.8, 0)
  g.add(ring)
  g.add(ball(0.6, acc, { x: 0, y: 4, z: 6.6 }))
  return g
}

/** 水滴加湿器：水滴形机身 + 灯环 */
function dropHumidifier(p: string[]) {
  const [body, glowC, acc] = p
  const g = new THREE.Group()
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const y = t * 22
    const r = t < 0.3 ? 6.6 + 1.2 * Math.sin((t / 0.3) * (Math.PI / 2)) : 7.8 * Math.cos(((t - 0.3) / 0.7) * (Math.PI / 2)) ** 0.8
    pts.push(new THREE.Vector2(Math.max(0.01, r), y))
  }
  pts.unshift(new THREE.Vector2(0.01, 0))
  const body1 = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), toon(body))
  body1.castShadow = true
  g.add(body1)
  g.add(lit(cyl(6.75, 6.75, 1, glowC, { y: 1.2 }, 32), glowC, 0.9))
  g.add(cyl(0.9, 1.2, 1, acc, { y: 21.6 }, 12))
  return g
}

/** 桌垫：毡面 + 皮边 */
function deskMat(p: string[]) {
  const [main, edge] = p
  const g = new THREE.Group()
  g.add(rbox(80, 0.3, 40, edge, {}, 0.12))
  g.add(noOutlineDeep(rbox(78, 0.4, 38, main, {}, 0.15)))
  return g
}

/** 显示器增高架：木面板 + 两侧腿 + 底板，中间可塞键盘 */
function monitorRiser(p: string[]) {
  const [wood, leg, acc] = p
  const g = new THREE.Group()
  g.add(rbox(60, 0.8, 22, leg, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(2, 9.6, 22, leg, { x: s * 29, y: 0.6 }, 0.4))
  g.add(rbox(60, 2, 24, wood, { y: 10 }, 0.6))
  g.add(rbox(14, 1.2, 0.6, acc, { x: 18, y: 10.4, z: 12.2 }, 0.2))
  return g
}

/** 手摇削笔机 */
function sharpener(p: string[]) {
  const [body, acc, metal] = p
  const g = new THREE.Group()
  g.add(rbox(9, 1.6, 11, acc, {}, 0.5))
  g.add(rbox(8, 7, 9, body, { y: 1.4 }, 1.6))
  g.add(cylZ(2.2, 2, acc, 0, 6, 5.2, 16))
  g.add(cylZ(0.6, 0.4, '#3a3a3a', 0, 6, 6.3, 8))
  g.add(cylX(0.9, 2.2, metal, 5.1, 5.8, 0))
  g.add(rbox(0.6, 5, 0.8, metal, { x: 6.2, y: 5.6, z: 0 }, 0.2))
  g.add(P(cyl(0.8, 0.8, 2.4, acc, {}, 10), 7.5, 10.2, 0, 0, 0, Math.PI / 2))
  return centered(g)
}

/** 打孔机 */
function holePunch(p: string[]) {
  const [body, lever, metal] = p
  const g = new THREE.Group()
  g.add(rbox(14, 2, 10, body, {}, 0.6))
  for (const s of [-1, 1]) g.add(cyl(1.3, 1.5, 3.4, metal, { x: s * 4, y: 1.8, z: -2.2 }, 16))
  const lv = rbox(13, 1.6, 9, lever, {}, 0.7)
  lv.rotation.x = 0.18
  lv.position.set(0, 5, 0.6)
  g.add(lv)
  g.add(rbox(10, 0.6, 3, shade(body, -0.12), { y: 2, z: 3.5 }, 0.2))
  return g
}

/** 翻页钟：机身 + 四片数字翻页 */
function flipClock(p: string[]) {
  const [body, card, ink] = p
  const g = new THREE.Group()
  g.add(rbox(16, 9, 7, body, {}, 1.4))
  g.add(rbox(14, 0.6, 5, shade(body, -0.15), { y: -0.0, z: 0 }, 0.2))
  ;['1', '0', '2', '4'].forEach((n, i) => {
    const x = -5.1 + i * 3.4 + (i > 1 ? 0.5 : -0.5)
    g.add(rbox(3, 5.4, 0.4, card, { x, y: 2, z: 3.4 }, 0.2))
    g.add(paintPanel(2.6, 5, `lm-flip-${n}-${ink}${card}`, (c, W, H) => {
      c.fillStyle = card
      c.fillRect(0, 0, W, H)
      c.fillStyle = ink
      c.font = `bold ${Math.round(H * 0.7)}px sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(n, W / 2, H / 2)
      c.fillStyle = shade(card, -0.3)
      c.fillRect(0, H / 2 - 1, W, 2)
    }, { x, y: 2.2, z: 3.65 }))
  })
  g.add(ball(0.4, card, { x: 0, y: 3.8, z: 3.5 }))
  g.add(ball(0.4, card, { x: 0, y: 5.6, z: 3.5 }))
  return g
}

/** 打开的笔袋：软壳托盘 + 拉链 + 几支笔 */
function pencilCase(p: string[]) {
  const [cloth, zip, acc] = p
  const g = new THREE.Group()
  g.add(tray(20, 5, 8, 0.6, cloth, {}, 0.28))
  for (const s of [-1, 1]) g.add(rbox(20, 0.6, 0.8, zip, { y: 5, z: s * 3.8 }, 0.2))
  g.add(cylX(1, 1.5, zip, 10.6, 3.8, 3.8))
  const cols = [acc, '#5a6b8c', C.red, C.leaf]
  cols.forEach((c, i) => g.add(P(pen(13, c, shade(c, -0.2), 0, 0, 0), -5 + i * 2.4, 1.6 + i * 0.25, -1.4 + (i % 2) * 2.4, 0, 0, -Math.PI / 2 + 0.35)))
  g.add(rbox(3, 1.4, 2, C.white, { x: 6.5, y: 0.6, z: 1.6 }, 0.4))
  return centered(g)
}

/** A4 纸堆：拆开一半包装的复印纸 + 散页 */
function paperReam(p: string[]) {
  const [wrap, band, paper] = p
  const g = new THREE.Group()
  g.add(rbox(21, 5, 29.7, wrap, {}, 0.3))
  g.add(rbox(21.2, 5.1, 6, band, { z: 4 }, 0.3))
  g.add(rbox(20.8, 0.8, 18, paper, { y: 5, z: -5.6 }, 0.1))
  g.add(rbox(21, 0.12, 29.7, paper, { y: 5.85, z: 0, ry: 0.05 }, 0.04))
  return centered(g)
}

/** 软木板（壁挂）：木框 + 软木 + 钉着的便签和照片 */
const CORK_Y = 100
function corkBoard(p: string[]) {
  const [frame, a, b] = p
  const g = new THREE.Group()
  g.add(rbox(60, 45, 1.6, frame, { z: 0 }, 0.6))
  g.add(noOutlineDeep(rbox(56, 41, 1.8, '#c9995e', { y: 2, z: 0 }, 0.3)))
  const notes: [number, number, number, string, number][] = [
    [-17, 26, 9, a, 0.08],
    [-2, 22, 12, PAPER, -0.05],
    [16, 25, 10, b, 0.12],
    [-14, 8, 8, b, -0.1],
    [8, 6, 14, C.white, 0.04],
  ]
  for (const [x, y, s, c, rz] of notes) {
    g.add(noOutlineDeep(rbox(s, s * 0.85, 0.2, c, { x, y, z: 1, rz }, 0.05)))
    g.add(ball(0.7, C.red, { x, y: y + s * 0.85 - 1.2, z: 1.6 }))
  }
  return mountAt(g, CORK_Y)
}

const DESK_PALS: PalFlat[] = [
  ['cute', C.white, C.pink, C.sky],
  ['nordic', N.oak, N.sage, N.mustard],
  ['modern', M.char, M.gray, M.white],
  ['industrial', I.iron, I.walnut, I.rust],
  ['retro', R.teal, R.mustard, R.orange],
]

export const LM_DESK: AssetDef[] = [
  def('lm-pen-organizer', '多格笔筒', 'study', [14.2, 10, 15.7], DESK_PALS, penOrganizer, PROP),
  def(
    'lm-notebook-stack',
    '笔记本叠',
    'study',
    [22.3, 30.5, 5.1],
    [
      ['cute', C.pink, C.mint, C.lemon],
      ['modern', M.black, M.gray, M.white],
      ['nordic', N.blue, N.oak, N.sage],
      ['retro', R.red, R.mustard, R.teal],
      ['japanese', J.ai, J.shu, J.washi],
    ],
    notebookStack,
    { ...PROP, form: 'lying' },
  ),
  def('lm-file-boxes', '文件盒三连', 'study', [30, 25, 32], DESK_PALS, fileBoxes, PROP),
  def(
    'lm-letter-tray',
    '叠层文件托盘',
    'study',
    [26, 34, 21],
    [
      ['modern', M.black, M.silver, PAPER],
      ['nordic', N.oak, N.white, PAPER],
      ['cute', C.white, C.pink, '#fff3c4'],
      ['industrial', I.iron, I.steel, PAPER],
    ],
    letterTray,
    { ...PROP, surfaces: [{ y: 1.4, shape: [rectPoly(-12, -16, 12, 16)], h: 5.6 }, { y: 8.4, shape: [rectPoly(-12, -16, 12, 16)], h: 5.6 }, { y: 15.4, shape: [rectPoly(-12, -16, 12, 16)] }] },
  ),
  def(
    'lm-block-calendar',
    '木块万年历',
    'study',
    [15.1, 7, 8.5],
    [
      ['nordic', N.oakL, M.char, N.sage],
      ['japanese', J.hinoki, J.sumi, J.shu],
      ['modern', M.walnut, M.white, M.char],
      ['cute', C.woodL, C.pink, C.sky],
    ],
    blockCalendar,
    PROP,
  ),
  def(
    'lm-sticky-notes',
    '便利贴组',
    'study',
    [14.6, 11.2, 4],
    [
      ['cute', C.lemon, C.pink, C.mint],
      ['retro', R.mustard, R.orange, R.teal],
      ['nordic', N.mustard, N.sage, N.blue],
      ['modern', M.white, M.light, '#ffe08f'],
    ],
    stickyNotes,
    PROP,
  ),
  def(
    'lm-floor-globe',
    '落地地球仪',
    'study',
    [42.5, 43.7, 78.5],
    [
      ['retro', '#d7c08a', '#a8683a', '#7a4a2a'],
      ['nordic', N.blue, N.sage, N.oak],
      ['modern', M.char, M.silver, M.black],
      ['cute', C.sky, C.mint, C.woodL],
    ],
    floorGlobe,
  ),
  def(
    'lm-desk-whiteboard',
    '桌面白板',
    'study',
    [40, 11.1, 30.6],
    [
      ['modern', M.silver, M.black, '#e05a4f'],
      ['nordic', N.oak, N.blue, N.mustard],
      ['cute', C.pink, '#5a6b8c', C.sky],
      ['industrial', I.iron, I.iron, I.rust],
    ],
    deskWhiteboard,
    PROP,
  ),
  def(
    'lm-desk-drawers',
    '桌面收纳抽屉',
    'study',
    [30, 24, 20],
    [
      ['nordic', N.oak, N.white, N.oak],
      ['modern', M.white, M.light, M.char],
      ['cute', C.white, C.sakura, C.woodL],
      ['industrial', I.iron, I.steel, I.walnut],
      ['retro', R.cream, R.teal, BRASS],
    ],
    deskDrawers,
    { ...PROP, surface: 20 },
  ),
  def(
    'lm-cat-bookends',
    '猫咪书立',
    'study',
    [37.8, 14.2, 21.2],
    [
      ['modern', M.black, shade(M.black, -0.12), M.gray],
      ['nordic', N.white, shade(N.white, -0.12), N.sage],
      ['retro', BRASS, shade(BRASS, -0.12), R.teal],
      ['cute', C.pink, shade(C.pink, -0.12), C.sky],
    ],
    catBookends,
    PROP,
  ),
  def(
    'lm-bladeless-fan',
    '无叶桌面风扇',
    'appliance',
    [21.2, 14.2, 45.1],
    [
      ['modern', M.white, M.silver],
      ['modern', M.black, M.char],
      ['cute', C.sakura, C.white],
      ['nordic', N.white, N.oak],
    ],
    bladelessFan,
    PROP,
  ),
  def(
    'lm-drop-humidifier',
    '水滴加湿器',
    'appliance',
    [15.6, 15.6, 22.6],
    [
      ['modern', M.white, '#9fd8ff', M.silver],
      ['nordic', N.white, '#ffe2a0', N.oak],
      ['cute', C.sakura, '#ffd1e3', C.white],
      ['japanese', J.washi, '#ffe2a0', J.wood],
    ],
    dropHumidifier,
    { ...PROP, fx: [{ kind: 'mist', x: 0, y: 22.6, z: 0, scale: 0.8, height: 30 }] },
  ),
  def(
    'lm-desk-mat',
    '桌垫',
    'study',
    [80, 40, 0.4],
    [
      ['nordic', N.gray, N.oak],
      ['modern', M.char, M.black],
      ['cute', C.sakura, C.white],
      ['industrial', '#5a4a3a', I.leather],
      ['retro', R.olive, R.caramel],
    ],
    deskMat,
    { ...PROP, surface: 0.4 },
  ),
  def('lm-monitor-riser', '显示器增高架', 'study', [60, 24.5, 12], WOOD_PALS, monitorRiser, { ...PROP, surface: 12, surfaces: [{ y: 0.8, shape: [rectPoly(-27, -10, 27, 10)], h: 9 }] }),
  def(
    'lm-sharpener',
    '手摇削笔机',
    'study',
    [13.2, 12, 11],
    [
      ['retro', R.red, R.cream, CHROME],
      ['cute', C.sky, C.white, CHROME],
      ['modern', M.char, M.black, CHROME],
      ['nordic', N.sage, N.white, N.oak],
    ],
    sharpener,
    PROP,
  ),
  def(
    'lm-hole-punch',
    '打孔机',
    'study',
    [14, 10, 6.5],
    [
      ['modern', M.char, M.gray, CHROME],
      ['cute', C.white, C.pink, CHROME],
      ['retro', R.cream, R.teal, CHROME],
      ['industrial', I.iron, I.rust, I.steel],
    ],
    holePunch,
    PROP,
  ),
  def(
    'lm-flip-clock',
    '翻页钟',
    'study',
    [16, 7.4, 9],
    [
      ['retro', R.orange, R.cream, M.black],
      ['modern', M.black, M.char, M.white],
      ['nordic', N.white, M.char, M.white],
      ['cute', C.mint, C.white, '#5a4646'],
    ],
    flipClock,
    PROP,
  ),
  def(
    'lm-pencil-case',
    '笔袋',
    'study',
    [24.6, 9, 7.3],
    [
      ['cute', C.lilac, C.white, C.pink],
      ['nordic', N.linen, N.oak, N.blue],
      ['modern', M.char, M.black, M.silver],
      ['retro', R.mustard, R.caramel, R.teal],
    ],
    pencilCase,
    PROP,
  ),
  def(
    'lm-paper-ream',
    'A4 纸堆',
    'study',
    [22.5, 30.7, 6],
    [
      ['modern', M.white, '#3d7fd0', PAPER],
      ['cute', C.white, C.pink, PAPER],
      ['nordic', N.white, N.sage, PAPER],
      ['retro', R.cream, R.red, '#fbf2dc'],
    ],
    paperReam,
    PROP,
  ),
  def(
    'lm-cork-board',
    '软木板',
    'study',
    [60, 3.2, 45],
    [
      ['nordic', N.oak, N.mustard, N.blue],
      ['modern', M.black, '#ffe08f', '#9fd8ff'],
      ['cute', C.white, C.pink, C.lemon],
      ['industrial', I.iron, I.rust, '#ffe08f'],
    ],
    corkBoard,
    { mount: CORK_Y },
  ),
]

// =====================================================================
// 儿童玩具 / 婴幼儿用品
// =====================================================================

const TOY = [C.red, C.lemon, C.sky, C.mint, C.pink, C.orange, C.lilac]

/** 积木：一块（cube / cyl / arch / tri），底面在 y */
function block(kind: number, color: string, x: number, y: number, z: number, ry = 0, s = 4) {
  let m: THREE.Object3D
  if (kind === 0) m = rbox(s, s, s, color, {}, 0.4)
  else if (kind === 1) m = cyl(s / 2, s / 2, s, color, {}, 16)
  else if (kind === 2) m = rbox(s * 2, s / 2, s, color, {}, 0.3)
  else if (kind === 3) {
    const t = prism([[-s / 2, 0], [s / 2, 0], [0, s * 0.9]], s, color, 0, 0.3)
    m = t
  } else {
    const pts: [number, number][] = [[-s, 0], [-s / 2, 0]]
    for (let i = 1; i < 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI
      pts.push([(Math.cos(a) * s) / 2, s * 0.25 + (Math.sin(a) * s) / 2.2])
    }
    pts.push([s / 2, 0], [s, 0], [s, s], [-s, s])
    m = prism(pts, s, color, 0, 0.3)
  }
  return P(G(m), x, y, z, 0, ry, 0)
}

/** 积木塔（叠放） */
function blocksTower(p: string[]) {
  const pal = [p[0], p[1], p[2], ...TOY]
  const g = new THREE.Group()
  g.add(block(4, pal[0], 0, 0, 0, 0, 8))
  g.add(block(2, pal[1], 0, 8, 0, 0, 8))
  g.add(block(0, pal[2], -4, 12, 0, 0.1, 8))
  g.add(block(1, pal[3], 4.5, 12, 0, 0, 7))
  g.add(block(2, pal[4], 0, 20, 0, -0.05, 8))
  g.add(block(0, pal[5], 0, 24, 0, 0.3, 7))
  g.add(block(3, pal[6], 0, 31, 0, 0, 7))
  return centered(g)
}

/** 散落的积木 + 打开的木箱 */
function blocksScatter(p: string[]) {
  const pal = [p[0], p[1], p[2], ...TOY]
  const g = new THREE.Group()
  g.add(tray(22, 9, 16, 1, '#e7bf93', { x: -17, z: -8 }, 0.4))
  g.add(block(0, pal[1], -21, 1, -10, 0.2, 5))
  g.add(block(1, pal[2], -14, 1, -6, 0, 5))
  const r = rng(17)
  for (let i = 0; i < 12; i++) {
    const x = -2 + r() * 30
    const z = -16 + r() * 32
    g.add(block(i % 5, pal[i % pal.length], x, 0, z, r() * Math.PI, 5))
  }
  return centered(g)
}

/** 拼接地垫：3 × 3 块 EVA，彼此留细缝，带锯齿接口 */
function puzzleMat(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const cols = [a, b, c]
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const x = (i - 1) * 40
      const z = (j - 1) * 40
      const col = cols[(i + j * 2) % 3]
      g.add(rugBase(rbox(39.6, 1.2, 39.6, col, { x, z }, 0.4)))
      // 咬合齿伸进相邻地垫：比地垫面高 0.3cm，避免和邻块顶面共面闪烁
      if (i < 2) for (const k of [-1, 1]) g.add(rugBase(rbox(3, 1.5, 4, col, { x: x + 20.5, z: z + k * 10 }, 0.4), false))
      if (j < 2) for (const k of [-1, 1]) g.add(rugBase(rbox(4, 1.5, 3, col, { x: x + k * 10, z: z + 20.5 }, 0.4), false))
    }
  return g
}

/** 木制火车轨道：椭圆环轨 + 小火车 */
function trainTrack(p: string[]) {
  const [wood, a, b] = p
  const g = new THREE.Group()
  const L = 40
  const Rr = 24
  const pts: [number, number, number][] = []
  const n = 56
  const perim = 2 * L + 2 * Math.PI * Rr
  for (let i = 0; i < n; i++) {
    const s = (i / n) * perim
    let x: number, z: number, ang: number
    if (s < L) [x, z, ang] = [-L / 2 + s, Rr, 0]
    else if (s < L + Math.PI * Rr) {
      const t = (s - L) / Rr
      ;[x, z, ang] = [L / 2 + Math.sin(t) * Rr, Math.cos(t) * Rr, t]
    } else if (s < 2 * L + Math.PI * Rr) [x, z, ang] = [L / 2 - (s - L - Math.PI * Rr), -Rr, Math.PI]
    else {
      const t = (s - 2 * L - Math.PI * Rr) / Rr
      ;[x, z, ang] = [-L / 2 - Math.sin(t) * Rr, -Math.cos(t) * Rr, Math.PI + t]
    }
    pts.push([x, z, ang])
  }
  const seg = perim / n + 0.15
  for (const [x, z, ang] of pts) {
    g.add(rbox(seg, 1.2, 4, wood, { x, z, ry: ang }, 0.2))
    for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(seg, 0.2, 0.5, shade(wood, -0.18), { x: x + s * 1.1 * Math.sin(ang), y: 1.1, z: z + s * 1.1 * Math.cos(ang), ry: ang }, 0.05)))
  }
  // 小火车：车头 + 两节车厢，停在前直道上
  const car = (x: number, col: string, head: boolean) => {
    const c = new THREE.Group()
    c.add(rbox(7, 3, 3.6, col, { y: 2.4 }, 0.6))
    for (const sx of [-2.2, 2.2]) for (const sz of [-1.9, 1.9]) c.add(cylZ(1.1, 0.6, TIRE, sx, 2.4, sz, 12))
    if (head) {
      c.add(rbox(3, 3.6, 3.4, col, { x: -1.8, y: 5.2 }, 0.5))
      c.add(cyl(0.8, 1, 2.6, TIRE, { x: 2, y: 5.2 }, 10))
      c.add(rbox(3.6, 0.6, 4, shade(col, -0.2), { x: -1.8, y: 8.6 }, 0.2))
    } else c.add(ball(1.6, TOY[(x * 7) & 3], { y: 6.6 }))
    c.position.set(x, 0, Rr)
    return c
  }
  g.add(car(10, a, true))
  g.add(car(2, b, false))
  g.add(car(-6, shade(a, 0.2), false))
  return g
}

/** 扭扭车 / 乘骑玩具车 */
function rideCar(p: string[]) {
  const [body, seat, acc] = p
  const g = new THREE.Group()
  for (const sx of [-24, 24]) for (const sz of [-15, 15]) g.add(cylZ(7, 5, TIRE, sx, 7, sz, 20))
  for (const sx of [-24, 24]) for (const sz of [-1, 1]) g.add(cylZ(3, 5.2, acc, sx, 7, sz * 15, 12))
  g.add(rbox(66, 16, 26, body, { y: 7 }, 6))
  g.add(rbox(20, 10, 22, seat, { x: -6, y: 22 }, 4))
  g.add(rbox(6, 14, 22, seat, { x: -17, y: 22 }, 3))
  // 方向盘
  g.add(rod3([14, 22, 0], [10, 33, 0], 1, TIRE))
  g.add(P(torus(5, 1, acc), 10, 33, 0, 0, Math.PI / 2, 0.35))
  // 车灯
  for (const s of [-1, 1]) g.add(lit(ball(2.4, C.lemon, { x: 33, y: 16, z: s * 8 }, [0.5, 1, 1]), C.lemon, 0.5))
  return centered(g)
}

/** 玩偶屋：两层开放式小屋 + 人字屋顶 */
function dollhouse(p: string[]) {
  const [wall, roof, acc] = p
  const g = new THREE.Group()
  g.add(rbox(70, 2, 30, shade(wall, -0.1), {}, 0.6))
  for (const s of [-1, 1]) g.add(holePanel(30, 60, 1.5, wall, [{ kind: 'rect', x: 0, y: 34, w: 9, h: 10, r: 0.6 }], { x: s * 34.25, y: 2, ry: Math.PI / 2 }))
  g.add(holePanel(67, 60, 1.5, wall, [{ kind: 'arch', x: -18, y: 6, w: 10, h: 18 }, { kind: 'circle', x: 16, y: 44, r: 5 }], { y: 2, z: -14.25 }))
  g.add(rbox(67, 1.5, 28.5, wall, { y: 33, z: 0.75 }, 0.4))
  g.add(rbox(67, 1.5, 28.5, wall, { y: 60.5, z: 0.75 }, 0.4))
  // 屋顶：两片斜板 + 山墙
  const gable = prism([[-35, 0], [35, 0], [0, 18]], 1.5, wall, -14.25)
  gable.position.y = 62
  g.add(gable)
  for (const s of [-1, 1]) {
    const rf = rbox(41, 1.6, 30, roof, {}, 0.5)
    rf.rotation.z = s * -Math.atan2(18, 35)
    rf.position.set(s * 17.5, 62 + 9 + 0.6, 0)
    g.add(rf)
  }
  // 小家具：一楼小沙发、二楼小床
  g.add(rbox(14, 5, 6, acc, { x: 12, y: 2, z: -9 }, 1.2))
  g.add(rbox(14, 3, 9, C.white, { x: -18, y: 34.5, z: -7 }, 1))
  g.add(rbox(14, 1.2, 6, acc, { x: -18, y: 37.5, z: -5 }, 0.5))
  return g
}

/** 毛绒独角兽摇摇马（玩偶类，可以有脸） */
function rockerUnicorn(p: string[]) {
  const [plush, wood, mane] = p
  const g = new THREE.Group()
  // 弧形摇板
  for (const s of [-1, 1]) {
    const pts: [number, number][] = []
    for (let i = 0; i <= 20; i++) {
      const t = -0.55 + (i / 20) * 1.1
      pts.push([Math.sin(t) * 70, 70 - Math.cos(t) * 70])
    }
    for (let i = 20; i >= 0; i--) {
      const t = -0.55 + (i / 20) * 1.1
      pts.push([Math.sin(t) * 64, 70 + 3 - Math.cos(t) * 64])
    }
    g.add(prism(pts, 2.4, wood, s * 12))
  }
  for (const x of [-22, 22]) g.add(rbox(6, 18, 24, wood, { x, y: 4 }, 1))
  const body = capsule(13, 22, plush)
  body.rotation.z = Math.PI / 2
  body.position.set(0, 33, 0)
  g.add(body)
  g.add(rbox(16, 3, 22, mane, { x: -2, y: 45, z: 0 }, 1.4))
  g.add(capsule(6, 14, plush, { x: 19, y: 34 }))
  g.children[g.children.length - 1].rotation.z = -0.35
  const head = ball(10, plush, { x: 24, y: 55 }, [1.2, 1, 0.95])
  g.add(head)
  g.add(cyl(0.3, 2, 9, C.lemon, { x: 27, y: 63.5 }, 12))
  for (const s of [-1, 1]) g.add(cyl(0.6, 2.2, 5, plush, { x: 20, y: 62, z: s * 5.5 }, 10))
  for (let i = 0; i < 4; i++) g.add(ball(3.4, mane, { x: 15 - i * 2.4, y: 60 - i * 5, z: 0 }))
  g.add(ball(4, mane, { x: -24, y: 34 }))
  const f = face(9, { x: 0, y: 0, z: 0 })
  f.rotation.y = Math.PI / 2
  f.position.set(35.2, 54, 0)
  g.add(f)
  // 把手
  g.add(cylZ(0.8, 16, wood, 23, 57, 0, 10))
  return centered(g)
}

/** 爬行隧道：双面布筒 + 一圈圈弹簧骨 */
function playTunnel(p: string[]) {
  const [a, b, ring] = p
  const g = new THREE.Group()
  const n = 5
  for (let i = 0; i < n; i++) {
    const geo = new THREE.CylinderGeometry(23, 23, 30, 32, 1, true)
    const mat = toon(i % 2 ? a : b).clone()
    mat.side = THREE.DoubleSide
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = Math.PI / 2
    m.position.set(0, 24, -60 + i * 30)
    m.castShadow = true
    g.add(m)
  }
  for (let i = 0; i <= n; i++) g.add(P(torus(23.2, 0.8, ring), 0, 24, -75 + i * 30))
  return g
}

/** 球池：软圆围 + 一池彩色球（球面低于口沿） */
function ballPit(p: string[]) {
  const [wall, a, b] = p
  const g = new THREE.Group()
  g.add(cup(50, 50, 34, 9, wall))
  g.add(P(torus(45.5, 4.5, wall), 0, 30, 0, Math.PI / 2))
  const r = rng(21)
  const cols = [a, b, C.lemon, C.sky, C.white, C.mint]
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 46; i++) {
      const rr = Math.sqrt(r()) * 35
      const t = r() * Math.PI * 2
      g.add(ball(3.6, cols[Math.floor(r() * cols.length)], { x: Math.cos(t) * rr, y: 12.6 + layer * 6 + r() * 2, z: Math.sin(t) * rr }))
    }
  return g
}

/** 吊兜绘本架：两侧 A 形木架 + 三层布兜（书封面朝前） */
function bookSling(p: string[]) {
  const [wood, cloth, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(beam([s * 29, 0, -13], [s * 29, 70, -5], 2.4, wood))
    g.add(beam([s * 29, 0, 13], [s * 29, 40, 0], 2.4, wood))
  }
  for (let i = 0; i < 3; i++) {
    const y = 14 + i * 20
    const z = 4 - i * 3.2
    const zb = -10 + i * 2.2
    g.add(cylX(0.9, 58, wood, 0, y, z))
    g.add(cylX(0.9, 58, wood, 0, y + 14, zb))
    // 布兜：斜挂的布面 + 底
    const ang = Math.atan2(zb - z, 14)
    const sl = rbox(56, Math.hypot(14, zb - z), 0.5, cloth, {}, 0.2)
    sl.rotation.x = ang
    sl.position.set(0, y + 7, (z + zb) / 2)
    g.add(sl)
    const r = rng(40 + i)
    for (let k = 0; k < 3; k++) {
      const bw = 15 + r() * 3
      const bk = rbox(bw, 17 + r() * 3, 0.9, [acc, ...BOOK_COLORS][(k + i * 2) % 8], {}, 0.2)
      bk.rotation.x = ang
      bk.position.set(-17 + k * 17, y + 8.5, (z + zb) / 2 + 0.9 - Math.sin(ang) * 1.5)
      g.add(bk)
    }
  }
  return centered(g)
}

/** 玩具收纳柜：木框 + 三排斜放的收纳筐 */
function toyShelf(p: string[]) {
  const [wood, a, b] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(2, 60, 30, wood, { x: s * 42 }, 0.6))
  g.add(rbox(86, 2, 30, wood, { y: 58 }, 0.6))
  g.add(rbox(82, 1.2, 1, wood, { y: 2, z: -14.5 }, 0.3))
  const cols = [a, b, C.sky, C.mint, C.lemon, C.pink]
  for (let row = 0; row < 3; row++) {
    const y = 2 + row * 18.6
    g.add(rbox(82.4, 1.4, 28, wood, { y, z: -0.5 }, 0.4))
    const n = row === 0 ? 2 : 3
    for (let i = 0; i < n; i++) {
      const bw = 80 / n - 1.4
      const x = -40 + (i + 0.5) * (80 / n)
      const bin = tray(bw, 12, 24, 0.8, cols[(row * 3 + i) % cols.length], {}, 0.35)
      bin.position.set(x, y + 1.4, 1.5)
      bin.rotation.x = 0.08
      g.add(bin)
      if ((row + i) % 2 === 0) g.add(block(i % 5, TOY[(row + i) % TOY.length], x - 3, y + 2.6, 2, 0.4, 5))
    }
  }
  return g
}

/** 皮克勒攀爬三角 */
function pikler(p: string[]) {
  const [wood, rung] = p
  const g = new THREE.Group()
  const H = 74
  for (const s of [-1, 1]) {
    g.add(beam([s * 44, 0, -36], [s * 44, H, 0], 3.2, wood))
    g.add(beam([s * 44, 0, 36], [s * 44, H, 0], 3.2, wood))
    g.add(beam([s * 44, 1.6, -36], [s * 44, 1.6, 36], 3.2, wood))
  }
  for (let i = 1; i <= 6; i++) {
    const t = i / 7
    const y = H * t
    for (const zs of [-1, 1]) g.add(cylX(1.4, 86, rung, 0, y, zs * 36 * (1 - t)))
  }
  g.add(cylX(1.6, 88, rung, 0, H, 0))
  return centered(g)
}

/** 学步推车：带把手的木推车，车斗里装积木 */
function walker(p: string[]) {
  const [wood, wheel, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cylX(6, 2.4, wheel, sx * 19.6, 6, sz * 11, 20))
  g.add(cylX(1, 42, wood, 0, 6, 11))
  g.add(cylX(1, 42, wood, 0, 6, -11))
  g.add(tray(36, 13, 28, 1.2, wood, { y: 8 }, 0.5))
  for (const s of [-1, 1]) g.add(beam([s * 16, 18, -12], [s * 16, 47, -17], 2.4, wood))
  g.add(cylX(1.6, 34, acc, 0, 47, -17))
  const r = rng(3)
  for (let i = 0; i < 6; i++) g.add(block(i % 3, TOY[i], -10 + (i % 3) * 9, i < 3 ? 9.2 : 9.2 + (i % 3 === 2 ? 2.25 : 4.5), -4, r(), 4.5))
  return centered(g)
}

/** 成长椅（可调节座板与脚踏的高脚椅） */
function growthChair(p: string[]) {
  const [wood, seat, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(beam([s * 21, 0, 22], [s * 21, 79, -10], 3.4, wood))
    g.add(beam([s * 21, 0, -22], [s * 21, 40, 5.8], 3.4, wood))
  }
  g.add(rbox(40, 1.8, 26, wood, { y: 20, z: 6 }, 0.5))
  g.add(rbox(40, 1.8, 28, wood, { y: 46, z: -1 }, 0.5))
  g.add(rbox(36, 2, 24, seat, { y: 47.8, z: -1 }, 0.9))
  for (const y of [62, 72]) g.add(rbox(40, 6, 1.8, wood, { y, z: 22 - (32 * (y + 3)) / 79 }, 0.6))
  g.add(cylX(0.9, 46, acc, 0, 4, 0))
  return centered(g)
}

/** 婴儿推车：展开（篮式车身 + 遮阳篷 + 推把）/ 折叠 */
function stroller(open: boolean) {
  return (p: string[]) => {
    const [cloth, frame, acc] = p
    const g = new THREE.Group()
    if (open) {
      for (const sx of [-1, 1]) {
        g.add(cylX(9, 3, TIRE, sx * 25, 9, -26, 20))
        g.add(cylX(6, 3, TIRE, sx * 25, 6, 32, 20))
        g.add(rod3([sx * 25, 9, -26], [sx * 23, 98, -40], 1.1, frame))
        g.add(rod3([sx * 25, 6, 32], [sx * 23, 45, -12], 1.1, frame))
      }
      g.add(cylX(1.6, 48, acc, 0, 98, -40))
      // 车篮：空心
      const basket = tray(44, 24, 60, 2, cloth, {}, 0.9)
      basket.position.set(0, 38, 2)
      basket.rotation.x = 0.06
      g.add(basket)
      g.add(rbox(40, 2, 56, C.white, { y: 41, z: 2 }, 0.8))
      // 遮阳篷：半个筒
      const geo = new THREE.CylinderGeometry(22, 22, 44, 24, 1, true, -Math.PI / 2, Math.PI)
      const mat = toon(acc).clone()
      mat.side = THREE.DoubleSide
      const hood = new THREE.Mesh(geo, mat)
      hood.rotation.set(0, 0, Math.PI / 2)
      hood.position.set(0, 62, -18)
      hood.castShadow = true
      g.add(hood)
      g.add(rbox(36, 8, 22, shade(cloth, 0.1), { y: 22, z: 4 }, 2))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.2, 10.5, 1.2, frame, { x: sx * 16, y: 29, z: 4 + sz * 9 }, 0.3))
      return centered(g)
    }
    // 折叠：前后轮并拢，车架折成扁平一束
    for (const sx of [-1, 1]) {
      g.add(cylX(9, 3, TIRE, sx * 22, 9, -6, 20))
      g.add(cylX(6, 3, TIRE, sx * 22, 6, 9, 20))
      g.add(rod3([sx * 22, 9, -6], [sx * 21, 80, -2], 1.1, frame))
      g.add(rod3([sx * 22, 6, 9], [sx * 21, 66, 2], 1.1, frame))
    }
    g.add(cylX(1.6, 44, acc, 0, 80, -2))
    g.add(rbox(38, 46, 9, cloth, { y: 22, z: 2 }, 3))
    g.add(rbox(38, 10, 12, acc, { y: 58, z: 1 }, 3))
    return centered(g)
  }
}

/** 宝宝游戏围栏：方形栏杆 + 软垫底 */
function playpen(p: string[]) {
  const [rail, mat, acc] = p
  const g = new THREE.Group()
  g.add(rbox(116, 2, 116, mat, { y: 0 }, 0.8))
  for (const s of [-1, 1]) {
    for (const y of [3, 60]) {
      g.add(cylX(1.4, 118, rail, 0, y, s * 58))
      g.add(cylZ(1.4, 118, rail, s * 58, y, 0))
    }
    for (let i = 0; i <= 12; i++) {
      const t = -54 + i * 9
      g.add(cyl(0.9, 0.9, 57, rail, { x: t, y: 3, z: s * 58 }, 8))
      g.add(cyl(0.9, 0.9, 57, rail, { x: s * 58, y: 3, z: t }, 8))
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.4, 2.4, 62, acc, { x: sx * 58, z: sz * 58 }, 12))
  return g
}

/** 儿童过家家厨房：灶台（两个炉头）+ 水槽 + 烤箱门 + 背板 */
function playKitchen(p: string[]) {
  const [body, door, acc] = p
  const g = new THREE.Group()
  g.add(openBox(70, 48, 30, 1.6, body))
  g.add(rbox(72, 2, 32, shade(body, -0.05), { y: 48 }, 0.6))
  g.add(rbox(70, 35, 2, body, { y: 50, z: -14 }, 0.6))
  g.add(rbox(34, 2, 30, body, { y: 83, z: -2 }, 0.6))
  // 烤箱门（带玻璃窗）+ 柜门
  g.add(holePanel(32, 38, 1.4, door, [{ kind: 'rect', x: 0, y: 12, w: 22, h: 16, r: 2 }], { x: -17, y: 4, z: 15.5 }))
  g.add(clearMat(rbox(23, 17, 0.3, C.glass, { x: -17, y: 15.5, z: 15.3 }, 0.1), C.glass, 0.32))
  g.add(cylX(0.8, 18, acc, -17, 38, 17.4))
  g.add(front(32, 38, door, 17, 4, 15))
  g.add(cyl(0.9, 0.9, 1.2, acc, { x: 4, y: 26, z: 17 }, 10))
  g.children[g.children.length - 1].rotation.x = Math.PI / 2
  // 炉头（偏左）、水槽（偏右）
  for (const [x, z] of [[-24, -4], [-12, 6]] as [number, number][]) {
    g.add(noOutlineDeep(cyl(4.5, 4.5, 0.5, M.char, { x, y: 50, z }, 20)))
    g.add(noOutlineDeep(P(torus(3, 0.35, C.red), x, 50.6, z, Math.PI / 2)))
  }
  g.add(tray(20, 6, 16, 1, CHROME, { x: 22, y: 44.5, z: 2 }, 0.4))
  g.add(rod3([22, 50, -12], [22, 60, -10], 0.8, CHROME))
  g.add(rod3([22, 60, -10], [22, 58, -4], 0.8, CHROME))
  // 背板旋钮 + 小钟
  for (let i = 0; i < 3; i++) g.add(cylZ(1.6, 1.4, acc, -26 + i * 6, 74, -12.4, 12))
  g.add(cylZ(4, 0.8, C.white, 0, 74, -12.6, 20))
  return shiftZ(g, -0.6)
}

/** 儿童桌椅套：小方桌 + 两只小凳 */
function kidsTableSet(p: string[]) {
  const [top, leg, seat] = p
  const g = new THREE.Group()
  g.add(rbox(60, 2.4, 45, top, { y: 44 }, 0.8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3.6, 44.2, 3.6, leg, { x: sx * 26, z: sz * 18.5 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(puck(13, 3, seat, { x: s * 43, y: 24 }))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      g.add(cyl(1.2, 1.4, 24.2, leg, { x: s * 43 + Math.cos(a) * 8, z: Math.sin(a) * 8 }, 8))
    }
  }
  return g
}

/** 形状配对盒：顶板开真洞（圆 / 方 / 三角外形用圆和方近似），旁边散着几块 */
function shapeSorter(p: string[]) {
  const [box, a, b] = p
  const g = new THREE.Group()
  g.add(shell(13, 11, 13, 0.8, box, { top: false }))
  const top = holePanel(13, 13, 0.9, shade(box, 0.15), [{ kind: 'circle', x: -3, y: 9.5, r: 1.8 }, { kind: 'rect', x: 3, y: 7.7, w: 3.6, h: 3.6, r: 0.3 }, { kind: 'arch', x: -3, y: 1.8, w: 3.6, h: 3.8 }, { kind: 'rect', x: 3, y: 2, w: 4.4, h: 2.2, r: 1 }], { y: 11, z: 6.5, rx: -Math.PI / 2 })
  g.add(top)
  g.add(cyl(1.6, 1.6, 2.8, a, { x: 9, z: 4 }, 16))
  g.add(rbox(3.2, 3.2, 3.2, b, { x: 9.6, z: -3, ry: 0.4 }, 0.4))
  return centered(g)
}

/** 叠叠圈 */
function stackRings(p: string[]) {
  const [base, a, b] = p
  const g = new THREE.Group()
  g.add(puck(6, 2.4, base))
  g.add(cyl(0.9, 0.9, 13, base, { y: 2.2 }, 10))
  const cols = [a, b, C.lemon, C.mint, C.sky]
  cols.forEach((c, i) => {
    const r = 5.2 - i * 0.75
    const tt = 1.25 - i * 0.07
    g.add(P(torus(r - tt, tt, c), 0, 2.4 + tt + i * 2.5, 0, Math.PI / 2))
  })
  g.add(ball(2, a, { y: 16 }))
  return g
}

/** 儿童双面画架：A 形木架，前白板、后黑板，顶上一卷画纸，下方托盘 */
function kidsEasel(p: string[]) {
  const [wood, a, tray0] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) for (const zs of [-1, 1]) g.add(beam([s * 25, 0, zs * 22], [s * 25, 98, zs * 3], 3, wood))
  for (const zs of [-1, 1]) {
    const board = rbox(47.6, 40, 1, zs > 0 ? '#fbfcfd' : '#3b4a44', {}, 0.3)
    board.rotation.x = zs * -0.2
    board.position.set(0, 74, zs * 8)
    g.add(board)
  }
  g.add(cylX(3.2, 52, PAPER, 0, 98, 0))
  g.add(cylX(0.8, 56, wood, 0, 98, 0))
  // 托盘
  g.add(tray(47.6, 4, 9, 0.8, tray0, { y: 50, z: 13 }, 0.3))
  g.add(tray(47.6, 4, 9, 0.8, tray0, { y: 50, z: -13 }, 0.3))
  for (let i = 0; i < 4; i++) g.add(P(cyl(0.6, 0.6, 6, TOY[i], {}, 8), -9 + i * 5, 51.8, 13, 0, 0, Math.PI / 2))
  g.add(P(cyl(0.6, 0.6, 6, a, {}, 8), 0, 51.8, -13, 0, 0, Math.PI / 2))
  return centered(g)
}

const KID_WOOD: PalFlat[] = [
  ['nordic', N.oak, N.white, N.sage],
  ['cute', C.woodL, C.pink, C.mint],
  ['modern', M.white, M.light, M.char],
  ['japanese', J.hinoki, J.washi, J.shu],
]

export const LM_KIDS: AssetDef[] = [
  def(
    'lm-blocks-tower',
    '木积木',
    'kids',
    [16.5, 8.8, 37.3],
    [
      ['cute', C.red, C.sky, C.lemon],
      ['nordic', N.oak, N.oakL, N.sage],
      ['retro', R.red, R.mustard, R.teal],
      ['modern', M.white, M.light, M.char],
    ],
    blocksTower,
    { ...PROP, family: 'lm-wood-blocks', form: 'stacked', formLabel: '搭成塔' },
  ),
  def(
    'lm-blocks-scatter',
    '木积木',
    'kids',
    [51.6, 32.5, 9],
    [
      ['cute', C.red, C.sky, C.lemon],
      ['nordic', N.oak, N.oakL, N.sage],
      ['retro', R.red, R.mustard, R.teal],
      ['modern', M.white, M.light, M.char],
    ],
    blocksScatter,
    { ...PROP, family: 'lm-wood-blocks', form: 'lying', formLabel: '散开' },
  ),
  def(
    'lm-puzzle-mat',
    '拼接地垫',
    'kids',
    [119.6, 119.6, 1.2],
    [
      ['cute', C.pink, C.sky, C.lemon],
      ['nordic', N.linen, N.sage, N.white],
      ['modern', M.light, M.gray, M.white],
      ['retro', R.mustard, R.teal, R.cream],
    ],
    puzzleMat,
    { surface: 1.2 },
  ),
  def(
    'lm-train-track',
    '木制火车轨道',
    'kids',
    [92.1, 52.3, 9.2],
    [
      ['nordic', N.oakL, N.sage, N.blue],
      ['cute', C.woodL, C.red, C.sky],
      ['retro', '#e2c48f', R.red, R.teal],
      ['modern', M.light, M.char, M.gray],
    ],
    trainTrack,
    PROP,
  ),
  def(
    'lm-ride-car',
    '儿童乘骑车',
    'kids',
    [67.2, 35.2, 39],
    [
      ['cute', C.red, C.white, C.lemon],
      ['cute', C.sky, C.white, C.pink],
      ['retro', R.teal, R.cream, R.mustard],
      ['modern', M.white, M.char, M.silver],
    ],
    rideCar,
  ),
  def(
    'lm-dollhouse',
    '玩偶屋',
    'kids',
    [71.8, 30, 81.5],
    [
      ['cute', C.white, C.pink, C.mint],
      ['nordic', N.white, N.oak, N.sage],
      ['retro', R.cream, R.red, R.teal],
      ['japanese', J.washi, J.sumi, J.shu],
    ],
    dollhouse,
    {
      surfaces: [
        { y: 2, shape: [rectPoly(-33, -13, 33, 15)], h: 31 },
        { y: 34.5, shape: [rectPoly(-33, -13, 33, 15)], h: 26 },
        { y: 62, shape: [rectPoly(-20, -13, 20, 15)], h: 10 },
      ],
    },
  ),
  def(
    'lm-rocker-unicorn',
    '毛绒摇摇马',
    'kids',
    [73.2, 26.4, 72.5],
    [
      ['cute', C.white, C.woodL, C.lilac],
      ['cute', C.sakura, C.woodL, C.sky],
      ['nordic', N.linen, N.oak, N.gray],
      ['retro', R.cream, R.caramel, R.mustard],
    ],
    rockerUnicorn,
  ),
  def(
    'lm-play-tunnel',
    '爬行隧道',
    'kids',
    [48, 151.5, 48],
    [
      ['cute', C.sky, C.lemon, C.white],
      ['cute', C.pink, C.white, C.lilac],
      ['nordic', N.sage, N.linen, N.gray],
      ['retro', R.orange, R.teal, R.cream],
    ],
    playTunnel,
  ),
  def(
    'lm-ball-pit',
    '球池',
    'kids',
    [100, 100, 34.3],
    [
      ['cute', C.white, C.pink, C.sky],
      ['nordic', N.gray, N.sage, N.mustard],
      ['modern', M.light, M.white, M.gray],
      ['retro', R.cream, R.orange, R.teal],
    ],
    ballPit,
  ),
  def('lm-book-sling', '吊兜绘本架', 'kids', [60.4, 28.1, 71.4], KID_WOOD, bookSling),
  def('lm-toy-shelf', '玩具收纳柜（带收纳筐）', 'kids', [86, 30, 60], KID_WOOD, toyShelf, { surface: 60 }),
  def(
    'lm-pikler',
    '皮克勒攀爬三角',
    'kids',
    [91.2, 74.3, 76],
    [
      ['nordic', N.oak, N.oakL],
      ['cute', C.woodL, C.mint],
      ['modern', M.white, M.light],
      ['retro', R.caramel, R.mustard],
    ],
    pikler,
  ),
  def('lm-walker', '学步推车', 'kids', [42, 35.6, 48.6], [['nordic', N.oak, N.white, N.sage], ['cute', C.woodL, C.pink, C.sky], ['retro', R.caramel, R.cream, R.red], ['modern', M.white, M.char, M.gray]], walker),
  def('lm-growth-chair', '成长椅', 'kids', [46, 46.4, 80], [['nordic', N.oak, N.gray, N.sage], ['modern', M.white, M.char, M.gray], ['cute', C.woodL, C.pink, C.mint], ['industrial', I.walnut, I.leather, I.iron], ['japanese', J.hinoki, J.ai, J.wood]], growthChair),
  def(
    'lm-stroller',
    '婴儿推车',
    'kids',
    [53, 79.6, 99.6],
    [
      ['nordic', N.gray, M.char, N.linen],
      ['modern', M.black, M.black, M.char],
      ['cute', C.sky, C.white, C.pink],
      ['retro', R.olive, BRASS, R.cream],
    ],
    stroller(true),
    { family: 'lm-stroller', form: 'open', formLabel: '展开' },
  ),
  def(
    'lm-stroller-folded',
    '婴儿推车',
    'kids',
    [47, 30, 81.6],
    [
      ['nordic', N.gray, M.char, N.linen],
      ['modern', M.black, M.black, M.char],
      ['cute', C.sky, C.white, C.pink],
      ['retro', R.olive, BRASS, R.cream],
    ],
    stroller(false),
    { family: 'lm-stroller', form: 'folded', formLabel: '收折' },
  ),
  def(
    'lm-playpen',
    '宝宝游戏围栏',
    'kids',
    [120.8, 120.8, 62],
    [
      ['nordic', N.oak, N.linen, N.oak],
      ['cute', C.white, C.sakura, C.pink],
      ['modern', M.white, M.light, M.gray],
      ['japanese', J.hinoki, J.tatami, J.wood],
    ],
    playpen,
    { surfaces: [{ y: 2, shape: [rectPoly(-56, -56, 56, 56)], h: 58 }] },
  ),
  def(
    'lm-play-kitchen',
    '儿童过家家厨房',
    'kids',
    [72, 35.2, 85],
    [
      ['cute', C.white, C.mint, C.pink],
      ['nordic', N.white, N.sage, N.oak],
      ['retro', R.cream, R.teal, R.red],
      ['modern', M.white, M.char, M.silver],
    ],
    playKitchen,
    { surfaces: [{ y: 50, shape: [rectPoly(-6, -12.6, 11, 15.4)], h: 33 }] },
  ),
  def('lm-kids-table-set', '儿童桌椅套', 'kids', [112, 45, 46.4], [['nordic', N.oak, N.white, N.sage], ['cute', C.white, C.woodL, C.pink], ['modern', M.white, M.char, M.gray], ['retro', R.cream, R.caramel, R.mustard]], kidsTableSet, {
    surface: 46.4,
    surfaceShape: [rectPoly(-30, -22.5, 30, 22.5)],
  }),
  def(
    'lm-shape-sorter',
    '形状配对盒',
    'kids',
    [18.1, 13, 11.5],
    [
      ['cute', C.sky, C.red, C.lemon],
      ['nordic', N.oak, N.sage, N.mustard],
      ['retro', R.teal, R.orange, R.mustard],
      ['modern', M.white, M.char, M.gray],
    ],
    shapeSorter,
    PROP,
  ),
  def(
    'lm-stack-rings',
    '叠叠圈',
    'kids',
    [12, 12, 18],
    [
      ['cute', C.woodL, C.red, C.sky],
      ['nordic', N.oak, N.sage, N.blue],
      ['retro', R.caramel, R.red, R.teal],
      ['modern', M.white, M.char, M.gray],
    ],
    stackRings,
    PROP,
  ),
  def('lm-kids-easel', '儿童双面画架', 'kids', [56, 46.7, 101.4], [['nordic', N.oak, N.blue, N.white], ['cute', C.woodL, C.pink, C.white], ['modern', M.white, M.char, M.light], ['retro', R.caramel, R.red, R.cream]], kidsEasel),
]
