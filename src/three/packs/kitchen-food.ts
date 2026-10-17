// 厨房收纳 / 餐具 / 食物饮料 / 餐桌摆设素材包，id 统一用 kf- 前缀。约定见 kit.ts 开头。
//   - 桌面小物都是 prop：原点在底面中心，普通素材由 def() 自动落地并在 xz 上居中；
//     带 fx / surface(s) / mount / 挂起形态的素材坐标是手工对好的（模型本身左右前后居中），不再自动挪动。
//   - 挂起形态（form: 'hanging'）沿用 storage-forms 的约定：原点 = 挂点，模型在原点下方，本体在 z ≥ 0.3，
//     自带 S 钩（上环内顶 y ≈ -0.5）。挂杆的挂点层 y = 杆顶 + 0.5。
//   - 碗、杯、盘、盒都是真空心（cup / tray / 车削），食物放在口沿以下；食物不画脸。
//   - 食物类的配色主要换盛器（碗、盘、托盘、包装）的颜色，食物本身保持固有色。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, SWING_OPEN, movable, rectPoly, rng, type AssetCategory, type AssetDef, type DoorMotion, type Fx, type StyleTag, type SurfaceDef } from '../kit'
import { PI, box3, cappedTube, hcyl, lit, noOutlineDeep, rod3, type TubeOpts, type V3 } from '../geo'
import { I, J, M, N, R, type Build, type Pal3 } from '../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = { seg: { per: 6, min: 12 }, group: true }

// ---------- 固定色 ----------
const STEEL = '#c3c7cc'
const STEEL_D = '#9aa0a7'
const BRASS = '#d4a64a'
const GLASS = '#d8eef9'
const RICE = '#fffdf6'
const NORI = '#2f3a2e'
const MISO = '#c8955a'
const SOY = '#4a2a1c'
const CURRY = '#b8742a'
const NOODLE = '#f6e2a8'
const BROTH = '#e9c98a'
const EGG_Y = '#ffc93c'
const NEGI = '#7fbf5a'
const TOMATO = '#e8543e'
const SALMON = '#ff9a7a'
const TUNA = '#d8434b'
const TAMAGO = '#ffd75e'
const CUCUMBER = '#4f9e5b'
const BREAD = '#f7dca6'
const CRUST = '#c98a4f'
const CHOCO = '#6b3f2a'
const BEER = '#f2b632'
const FOAM = '#fffaf0'
const WINE_R = '#7a1f33'
const TEA = '#b7c96a'
const COFFEE = '#4a2c1d'
const CARD = '#d6b48a'
const KRAFT = '#c9a77c'
const SHIITAKE = '#7a5236'
const MEAT = '#d97c76'
const TOFU = '#fbf6e8'
const HAKUSAI = '#e9f2c9'
const DAIKON = '#f7f4ea'
const LEAF = '#5fae52'
const POTATO = '#c9a26a'
const ONION = '#c97f3c'

// ---------- 小工具 ----------

/** 半透明（玻璃、透明塑料、保鲜膜），不描边 */
function glassGhost<T extends THREE.Object3D>(o: T, color = GLASS, k = 0.38): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (m.isMesh) {
      m.material = toon(color, { transparent: k })
      m.castShadow = false
      m.userData.noOutline = true
    }
  })
  return o
}

/** 包一层再摆放（rbox / cyl 自带的 position 不会被覆盖） */
function PG<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = G(o)
  g.position.set(x, y, z)
  g.rotation.set(rx, ry, rz)
  return g
}

/** 圆弧上的点；'yz' 平面里 z = cos a、y = sin a；'xy' 平面里 x = cos a、y = sin a；'xz' 平面里 x = cos a、z = sin a */
function arc(c: V3, r: number, a0: number, a1: number, n: number, plane: 'xy' | 'yz' | 'xz' = 'xy'): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    if (plane === 'xy') out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]])
    else if (plane === 'yz') out.push([c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r])
    else out.push([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r])
  }
  return out
}

/** 车削体：pts 为 [半径, 高] 轮廓 */
function lathe(pts: [number, number][], color: string, at: { x?: number; y?: number; z?: number } = {}, seg = 32) {
  const m = new THREE.Mesh(
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
      seg,
    ),
    toon(color),
  )
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 碗（真空心）：口径半径 r、高 h、壁厚 t，带圈足；at.y 为底面。返回内底高度可用 bowlIn */
function bowl(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}, t = 0.35, footK = 0.42) {
  const foot = r * footK
  const fh = Math.min(0.7, h * 0.12)
  const pts: [number, number][] = [
    [0, fh * 0.6],
    [foot - 0.4, fh * 0.6],
    [foot - 0.4, 0],
    [foot, 0],
    [foot, fh],
  ]
  const n = 8
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (PI / 2)
    pts.push([foot + (r - foot) * Math.sin(a), fh + (h - fh) * (1 - Math.cos(a))])
  }
  pts.push([r - t * 0.5, h + t * 0.2], [r - t, h])
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * (PI / 2)
    pts.push([foot - t * 0.6 + (r - t - (foot - t * 0.6)) * Math.sin(a), fh + t + (h - fh - t) * (1 - Math.cos(a)) * 0.98])
  }
  pts.push([0, fh + t])
  return lathe(pts, color, at)
}
/** 碗内某个高度的内半径（盛饭、液面用）：y 为离碗底的高度 */
function bowlIn(r: number, h: number, y: number, t = 0.35, footK = 0.42) {
  const foot = r * footK
  const fh = Math.min(0.7, h * 0.12)
  const k = Math.min(1, Math.max(0, (y - fh - t) / ((h - fh - t) * 0.98)))
  const a = Math.acos(1 - k)
  return foot - t * 0.6 + (r - t - (foot - t * 0.6)) * Math.sin(a) - 0.1
}

/** 盘子（浅、真空心）：半径 r、高 h；内底在 y = 0.7 */
function dish(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  return lathe(
    [
      [0, 0.25],
      [r * 0.5 - 0.3, 0.25],
      [r * 0.5 - 0.3, 0],
      [r * 0.5, 0],
      [r * 0.56, 0.35],
      [r * 0.82, h * 0.6],
      [r, h],
      [r - 0.4, h],
      [r * 0.8, h * 0.6 + 0.3],
      [r * 0.55, 0.7],
      [0, 0.7],
    ],
    color,
    at,
  )
}
const DISH_IN = 0.7

/** 容器里的液面：薄圆片，top 为液面高度 */
function liquid(r: number, top: number, color: string, x = 0, z = 0) {
  return noOutlineDeep(cyl(r, r, 0.3, color, { x, y: top - 0.3, z }, 28))
}

/** 半球（开口朝下），y 为底面，高 h */
function dome(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, PI * 2, 0, PI / 2), toon(color))
  m.scale.y = h / r
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 饭堆：碗口内鼓起的米饭，y 为饭面最低处 */
function riceMound(r: number, h: number, y: number, color = RICE, x = 0, z = 0) {
  return dome(r, h, color, { x, y, z })
}

/** 一双筷子，沿 x 平放（尖朝 +x），y 为底面 */
function chopsticks(len: number, color: string, x: number, y: number, z: number, gap = 0.9, ry = 0) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(hcyl(0.16, 0.36, len, color, 0, 0.36, (s * gap) / 2))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

/** 筷架 */
function hashioki(color: string, x: number, y: number, z: number, ry = 0) {
  const g = G(rbox(1.3, 0.9, 4.2, color, { y: 0 }, 0.4))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

/** 瓶子：身半径 r、总高 h、瓶颈半径 nr、肩高 sh；盖子另加。at.y 为底面 */
function bottle(r: number, h: number, nr: number, sh: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const neck = sh + (r - nr) * 1.3
  return lathe(
    [
      [0, 0],
      [r - 0.3, 0],
      [r, 0.3],
      [r, sh],
      [(r + nr) / 2 + (r - nr) * 0.15, sh + (neck - sh) * 0.55],
      [nr, neck],
      [nr, h],
      [0, h],
    ],
    color,
    at,
    20,
  )
}

/** 易拉罐：at.y 为底面 */
function can(r: number, h: number, color: string, top = STEEL, at: { x?: number; y?: number; z?: number } = {}) {
  const g = new THREE.Group()
  g.add(cyl(r, r * 0.86, 0.8, top, { y: 0 }, 20))
  g.add(cyl(r, r, h - 1.6, color, { y: 0.8 }, 20))
  g.add(cyl(r * 0.84, r, 0.8, top, { y: h - 0.8 }, 20))
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return g
}

/** 挂起：把本体移到挂点下方（顶面 topY），本体背面不小于 z = 0.3 */
function hangAt<T extends THREE.Object3D>(o: T, topY: number, xOff = 0): T {
  const b = box3(o)
  o.position.x += xOff - (b.min.x + b.max.x) / 2
  o.position.y += topY - b.max.y
  o.position.z += 0.3 - b.min.z
  return o
}

/** S 形钩：上环开口朝后（内顶 y ≈ -0.5），下环最低点 (0, S_LOW, S_Z) */
const S_LOW = -6.4
const S_Z = 2.6
function sHook(color = STEEL) {
  const top = arc([0, -1.45, 0.2], 1.2, PI * 1.15, 0, 8, 'yz')
  const bottom = arc([0, -5.2, S_Z], 1.2, PI, PI * 2.2, 8, 'yz')
  return cappedTube([...top, ...bottom], 0.25, color, { ...TUBE, seg: 48 })
}

// ---------- 定义 ----------

interface Def extends Omit<AssetDef, 'palettes' | 'paletteStyles' | 'styles' | 'category' | 'prop' | 'build'> {
  pals: Pal3[]
  category?: AssetCategory
  prop?: boolean
  styles?: StyleTag[]
  build: Build
  /** 坐标已手工对好，不要自动落地居中 */
  raw?: boolean
  /** 带 fx 的素材：手工量好的 xz 平移（模型和 fx 一起挪，让包围盒居中） */
  off?: [number, number]
}

/** 自动摆正：xz 居中；toFloor 时最低点落到 y = 0（壁挂物只居中） */
function normalized(build: Build, toFloor: boolean): Build {
  return (p) => {
    const inner = build(p)
    const b = box3(inner)
    inner.position.x -= (b.min.x + b.max.x) / 2
    inner.position.z -= (b.min.z + b.max.z) / 2
    if (toFloor) inner.position.y -= b.min.y
    return G(inner)
  }
}

function shifted(build: Build, [dx, dz]: [number, number]): Build {
  return (p) => PG(build(p), dx, 0, dz)
}

function def(o: Def): AssetDef {
  const { pals, raw, off, build, category, prop, styles, fx, ...rest } = o
  const ps = pals.map((p) => p[0])
  const manual = raw || !!fx || !!o.surfaces || o.surface !== undefined || o.form === 'hanging'
  let b = build
  if (off) b = shifted(build, off)
  else if (!manual) b = normalized(build, o.mount === undefined)
  return {
    ...rest,
    category: category ?? 'kitchenware',
    palettes: pals.map((p) => [p[1], p[2], p[3]]),
    paletteStyles: ps,
    styles: styles ?? [...new Set(ps)],
    ...(prop === false ? {} : { prop: true }),
    ...(fx ? { fx: off ? fx.map((f) => ({ ...f, x: f.x + off[0], z: f.z + off[1] })) : fx } : {}),
    build: b,
  }
}

// ======================================================================
// 厨房收纳
// ======================================================================

/** 不锈钢两层沥水架：full = 放着碗盘 */
function dishRack2(p: string[], full: boolean) {
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
function dishRackMini(p: string[]) {
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
function spiceCarousel(p: string[]) {
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
function spiceShelf(p: string[]) {
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
const KNIFE_MOUNT = 130
function knifeMagnet(p: string[]) {
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
function utensilCrock(p: string[]) {
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
function wagonTiers(tiers: number) {
  const gap = tiers === 3 ? 30 : 24
  return Array.from({ length: tiers }, (_, i) => 7 + i * gap)
}
const WAGON_DX = 1.65
function kitchenWagon(p: string[], tiers: number) {
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
function riceCabinet(p: string[]) {
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
function bagStand(p: string[]) {
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
function glassContainers(p: string[]) {
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
function canisters(p: string[]) {
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
function wrapRack(p: string[]) {
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
const RAIL_MOUNT = 140
const RAIL_BAR_Y = RAIL_MOUNT + 3
const RAIL_R = 0.8
/** 杆座贴墙、杆在前：整体往前挪 RAIL_DZ 让包围盒前后居中；RAIL_Z 是挪完后的杆中心 z */
const RAIL_DZ = 0.95
const RAIL_Z = RAIL_DZ
function railBase(p: string[], len: number) {
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
function ladleBody(p: string[]) {
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
function turnerBody(p: string[]) {
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
function whiskBody(p: string[]) {
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
function tongsBody(p: string[]) {
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
function hungTool(body: THREE.Object3D) {
  return G(sHook(), hangAt(G(body), S_LOW + 0.9))
}
/** 平放形态：本体放倒，顺着 x 方向 */
function laidTool(body: THREE.Object3D) {
  const a = G(body)
  a.rotation.x = -PI / 2
  const b = G(a)
  b.rotation.y = PI / 2
  return G(b)
}

/** 挂杆 + 挂好的一排厨具 */
function railWithTools(p: string[]) {
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
function boardStand(p: string[]) {
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
function panRack(p: string[]) {
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
const MW = { w: 60, d: 42, h: 120, shelves: [10, 50, 88] }
function rangeRack(p: string[]) {
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
function counterRack(p: string[]) {
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
function gapWagon(p: string[]) {
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
function cupboardShelves(W: number) {
  return { lowTop: 85, upBottom: 125, upMid: 152, top: 180, upD: 32, D: 45, W, lowMid: 36, drawerY: 63 }
}
/** 下柜每列的中心 x 和列宽 */
function cupboardCols(W: number) {
  const nCol = W >= 100 ? 3 : 2
  const cw = (W - 4) / nCol
  return Array.from({ length: nCol }, (_, i) => ({ x: -W / 2 + 2 + cw * (i + 0.5), cw, i }))
}
function cupboard(p: string[], W: number) {
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

// ======================================================================
// 餐具
// ======================================================================

/** 一人份和食器：饭碗 + 汤碗（带盖） + 筷子筷架，摆在餐垫上的位置关系 */
function washokuSet(p: string[]) {
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
function chopstickPair(p: string[]) {
  const [a, b, rest] = p
  const g = new THREE.Group()
  g.add(chopsticks(23, a, 0, 0.9, -1.5))
  g.add(chopsticks(21, b, -1, 0.9, 2.5))
  g.add(hashioki(rest, 8.5, 0, 0.5))
  return g
}

/** 盘子叠放：n 只，半径 r */
function plateStack(p: string[], r: number, n: number) {
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
function bento2(p: string[], open: boolean) {
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
function chawanmushi(p: string[]) {
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
function soyDish(p: string[]) {
  const [d, pot, acc] = p
  const g = new THREE.Group()
  g.add(dish(4.5, 1.3, d, { x: -3.5 }))
  g.add(liquid(2.3, DISH_IN + 0.3, SOY, -3.5))
  // 酱油壶
  g.add(lathe([[0, 0], [2.6, 0], [3, 1.5], [2.8, 5], [1.4, 6.6], [1.2, 7.6], [0, 7.6]], pot, { x: 4.5 }))
  g.add(rod3([6.8, 4, 0], [8.4, 5.6, 0], 0.4, pot, 8))
  g.add(puck(1.6, 1, acc, { x: 4.5, y: 7.4 }))
  return g
}

/** 玻璃杯组（三只不同高度） */
function glassTumblers(p: string[]) {
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
function mugTree(p: string[]) {
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
function wineGlasses(p: string[]) {
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
    s.add(lathe([[0.4, 9.4], [3, 11.5], [4, 15], [3.4, 20], [3.2, 20], [3.75, 15], [2.8, 11.8], [0, 10]], gl))
    glassGhost(s, gl, 0.45)
    if (full) s.add(noOutlineDeep(lathe([[0, 10.1], [2.7, 11.8], [3.6, 14.2], [0, 14.2]], wine)))
    s.position.set(x, 0.6, 0)
    g.add(s)
  }
  return g
}

/** 啤酒杯（带泡沫）×2 */
function beerMugs(p: string[]) {
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
function tokkuriSet(p: string[]) {
  const [ware, trayC, acc] = p
  const g = new THREE.Group()
  g.add(tray(24, 1.6, 14, 0.6, trayC, {}, 0.5))
  // 德利：中心在 (0, 0.6, 0)
  g.add(lathe([[0, 0], [3.4, 0], [4, 2], [4, 7], [2, 11], [1.2, 13], [1.6, 14.2], [1.1, 14.4], [0.9, 13.6], [0, 13.6]], ware, { y: 0.6 }))
  g.add(noOutlineDeep(cyl(4.02, 4.02, 1.2, acc, { y: 5.6 }, 24)))
  for (const x of [-7.5, 7.5]) {
    g.add(cup(2.4, 1.5, 3.2, 0.25, ware, { x, y: 0.6, z: 2 }))
    g.add(liquid(2, 3.4, '#fbf3d8', x, 2))
  }
  return g
}

/** 手冲咖啡套组：细口壶 + 滤杯坐在分享壶上 + 咖啡豆袋 */
function dripSet(p: string[]) {
  const [kettle, dripper, server] = p
  const g = new THREE.Group()
  // 分享壶（玻璃）+ 滤杯
  const sx = -4
  g.add(glassGhost(lathe([[0, 0], [4.8, 0], [5.2, 2], [5.2, 8], [4.2, 11], [4.2, 12.5], [3.9, 12.5], [3.9, 11], [4.9, 8], [4.9, 2], [0, 0.4]], GLASS), GLASS, 0.4).translateX(sx))
  g.add(noOutlineDeep(cyl(4.7, 4.9, 3.2, COFFEE, { x: sx, y: 0.5 }, 24)))
  g.add(cappedTube([[sx - 5, 9.5, 0], [sx - 7.2, 8, 0], [sx - 7, 4, 0], [sx - 5, 2.5, 0]], 0.5, server, { ...TUBE, seg: 20 }))
  g.add(cup(5.6, 2.4, 6.5, 0.35, dripper, { x: sx, y: 12.5 }))
  g.add(puck(5.2, 0.6, dripper, { x: sx, y: 12.3 }))
  g.add(noOutlineDeep(cup(5.1, 2.2, 6.3, 0.15, '#f4efe4', { x: sx, y: 13 })))
  g.add(noOutlineDeep(cyl(3.8, 3.8, 0.3, COFFEE, { x: sx, y: 16 }, 20)))
  // 细口手冲壶
  const kx = 10
  g.add(lathe([[0, 0], [5.2, 0], [5.6, 1], [5.6, 9], [4.5, 11.5], [2, 12.5], [0, 12.5]], kettle, { x: kx }))
  g.add(cyl(1.2, 1.4, 1.2, server, { x: kx, y: 12.4 }, 12))
  g.add(cappedTube([[kx - 4.6, 2, 0], [kx - 8.6, 8, 0], [kx - 10.6, 13.6, 0], [kx - 12, 14.6, 0]], 0.42, kettle, { ...TUBE, seg: 24 }))
  g.add(cappedTube([[kx + 5.4, 9.5, 0], [kx + 8.6, 9, 0], [kx + 8.6, 3, 0], [kx + 5.4, 2.5, 0]], 0.7, server, { ...TUBE, seg: 20 }))
  return g
}

/** 急须 + 汤吞两只 + 茶托盘 */
function kyusuSet(p: string[]) {
  const [pot, cups, trayC] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.4, 17, trayC, {}, 0.6))
  // 急须（侧把手）
  g.add(lathe([[0, 0], [3.6, 0], [4.8, 2.5], [4.8, 5], [3.6, 7.2], [2.8, 7.4], [0, 7.4]], pot, { x: -7, y: 1.4 }))
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
function placemat(p: string[], shape: 'rect' | 'round') {
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
function coasterStack(p: string[]) {
  const [a, b, holder] = p
  const g = new THREE.Group()
  g.add(tray(11.6, 3, 11.6, 0.6, holder, {}, 1))
  for (let i = 0; i < 5; i++) g.add(cyl(5, 5, 0.5, i % 2 ? b : a, { y: 0.6 + i * 0.55 }, 28))
  g.add(cyl(5, 5, 0.5, b, { x: 12, y: 0 }, 28))
  return g
}

/** 刀叉勺收纳盒（四格） */
function cutleryTray(p: string[]) {
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
function donburi(p: string[]) {
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

// ======================================================================
// 食物 / 饮料
// ======================================================================

/** 一碗白饭（冒热气） */
function riceBowl(p: string[]) {
  const [b, , chop] = p
  const g = new THREE.Group()
  g.add(bowl(5.8, 6, b))
  g.add(riceMound(bowlIn(5.8, 6, 5.2), 2.4, 5.2))
  g.add(hashioki(shade(b, -0.12), 0, 0, 7.4, PI / 2))
  g.add(PG(chopsticks(22, chop, 0, 0, 0), 0, 0.9, 7.4))
  return g
}
const RICE_FX: Fx[] = [{ kind: 'steam', x: 0, y: 8, z: 0, scale: 0.7, height: 18 }]

/** 味噌汤（漆碗，豆腐 + 海带芽 + 葱） */
function misoSoup(p: string[]) {
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
const MISO_FX: Fx[] = [{ kind: 'steam', x: 0, y: 6.5, z: 0, scale: 0.7, height: 16 }]

/** 狐狸乌冬 */
function kitsuneUdon(p: string[]) {
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
const UDON_FX: Fx[] = [{ kind: 'steam', x: 0, y: 8, z: 0, scale: 1, height: 20 }]

/** 咖喱饭（椭圆深盘 + 勺） */
function curryRice(p: string[]) {
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
function sushiOke(p: string[]) {
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
function onigiriTrio(p: string[]) {
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
function breadBag(p: string[]) {
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
function toastPlate(p: string[]) {
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
function baguettes(p: string[]) {
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
function donutBox(p: string[]) {
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
function apples(p: string[]) {
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
function bananas(p: string[]) {
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
function mikanBox(p: string[]) {
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
function watermelonHalf(p: string[]) {
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
function grapes(p: string[]) {
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
function vegBasket(p: string[]) {
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
function onionPotatoBags(p: string[]) {
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
function eggCarton(p: string[]) {
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
function milkCarton(p: string[], big: boolean) {
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
function cupNoodle(p: string[], open: boolean) {
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
const NOODLE_FX: Fx[] = [{ kind: 'steam', x: 0, y: 10.5, z: 0.5, scale: 0.7, height: 16 }]

/** 零食袋（三袋） */
function snackBags(p: string[]) {
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
function cannedFood(p: string[]) {
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
function seasoningBottles(p: string[]) {
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
function riceSack(p: string[], kg: 5 | 10) {
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
function waterCase(p: string[], open = true) {
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
function beerSixPack(p: string[]) {
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
function beerCrate(p: string[]) {
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
function isshobin(p: string[]) {
  const [glass, lab, cap] = p
  const g = new THREE.Group()
  g.add(bottle(5, 39, 1.5, 24, glass, {}))
  g.add(noOutlineDeep(cyl(5.04, 5.04, 12, lab, { y: 8 }, 24)))
  g.add(noOutlineDeep(rbox(3, 9, 0.3, '#d14b3c', { y: 9.5, z: 5.05 }, 0.2)))
  g.add(cyl(1.8, 1.8, 3, cap, { y: 38 }, 14))
  return g
}

/** 葡萄酒架（6 瓶位，放 4 瓶） */
function wineRack(p: string[]) {
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
function petBottles(p: string[]) {
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

// ======================================================================
// 餐桌摆设（组合）
// ======================================================================

/** 一人份定食托盘：饭、味噌汤、烤鲑鱼、小钵、渍物、筷子 */
const TEISHOKU = { w: 42, d: 32, th: 2.2 }
function teishoku(p: string[]) {
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
const TEISHOKU_FX: Fx[] = [
  { kind: 'steam', x: -11, y: 8.5, z: 6, scale: 0.6, height: 16 },
  { kind: 'steam', x: 3, y: 6.5, z: 6, scale: 0.6, height: 14 },
]

/** 两人晚餐套组（对坐的两份：汉堡排 + 沙拉 + 玻璃杯 + 刀叉，中间一盘面包） */
function dinnerForTwo(p: string[]) {
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
function nabeSet(p: string[]) {
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
const NABE_FX: Fx[] = [{ kind: 'steam', x: 0, y: NABE_TOP - 1.6, z: 0, scale: 1.6, height: 32 }]

/** 章鱼烧派对：电烤盘（16 孔，正在烤） + 一盘烤好的章鱼烧 + 酱汁 */
function takoParty(p: string[]) {
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
function okonomiyakiGrill(p: string[]) {
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
const OKONOMI_FX: Fx[] = [{ kind: 'steam', x: 0, y: 8.5, z: -1, scale: 1.2, height: 22 }]

/** 手卷寿司派对：寿司桶 + 海苔 + 配料拼盘 + 酱油碟 */
function temakiParty(p: string[]) {
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
function sukiyaki(p: string[]) {
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
const SUKI_FX: Fx[] = [{ kind: 'steam', x: 0, y: 5, z: 0, scale: 1.3, height: 26 }]

// ======================================================================
// 配色表
// ======================================================================

const RACK_PALS: Pal3[] = [
  ['modern', STEEL, M.white, M.char],
  ['nordic', N.white, N.oakL, N.sage],
  ['cute', C.white, C.sakura, C.pink],
  ['industrial', M.black, I.concrete, I.rust],
]
const SPICE_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.linen],
  ['modern', M.black, M.silver, M.white],
  ['japanese', J.wood, J.sumi, J.washi],
  ['industrial', I.walnut, I.iron, '#e8dcc4'],
  ['cute', C.woodL, C.pink, C.white],
]
const KNIFE_PALS: Pal3[] = [
  ['modern', M.char, M.black, M.silver],
  ['nordic', N.oak, N.oakL, N.white],
  ['industrial', I.walnut, I.walnut, I.iron],
  ['japanese', J.hinoki, J.dark, J.sumi],
]
const CROCK_PALS: Pal3[] = [
  ['nordic', N.white, N.oak, STEEL],
  ['japanese', J.ai, J.wood, STEEL],
  ['retro', R.mustard, R.caramel, R.cream],
  ['industrial', I.concrete, I.walnut, M.black],
  ['cute', C.mint, C.woodL, C.pink],
]
const WAGON_PALS: Pal3[] = [
  ['modern', M.white, M.white, M.char],
  ['nordic', N.white, N.sage, N.oak],
  ['industrial', I.iron, I.iron, I.walnut],
  ['cute', C.white, C.mint, C.pink],
  ['retro', R.cream, R.teal, R.mustard],
]
const RICE_CAB_PALS: Pal3[] = [
  ['modern', M.white, M.light, M.char],
  ['nordic', N.white, N.oakL, N.sage],
  ['japanese', J.hinoki, J.wood, J.shu],
  ['cute', C.white, C.sakura, C.pink],
]
const BAG_STAND_PALS: Pal3[] = [
  ['modern', M.white, '#e8ecef', '#d65a3c'],
  ['industrial', M.black, '#e8ecef', I.rust],
  ['nordic', N.white, '#eef1ea', N.sage],
  ['cute', C.white, '#fff0f4', C.pink],
]
const LID_PALS: Pal3[] = [
  ['modern', M.white, M.light, '#e9d8a6'],
  ['nordic', N.sage, N.blue, '#e9d8a6'],
  ['cute', C.pink, C.sky, '#ffd8a8'],
  ['industrial', M.char, I.concrete, '#c9a77c'],
]
const CANISTER_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.oak],
  ['modern', M.black, M.white, M.silver],
  ['retro', R.orange, R.cream, R.caramel],
  ['cute', C.lemon, C.white, C.pink],
]
const WRAP_PALS: Pal3[] = [
  ['modern', M.white, '#e86a5a', '#4a7fc0'],
  ['nordic', N.oak, '#e86a5a', '#4a7fc0'],
  ['industrial', M.black, '#e86a5a', '#4a7fc0'],
  ['cute', C.mint, '#ff9db0', '#a8d4f4'],
]
const RAIL_PALS: Pal3[] = [
  ['modern', STEEL, STEEL, M.black],
  ['industrial', M.black, I.iron, I.walnut],
  ['nordic', N.white, N.white, N.oak],
  ['retro', BRASS, BRASS, R.caramel],
]
const TOOL_PALS: Pal3[] = [
  ['modern', STEEL, M.black, M.black],
  ['nordic', STEEL, N.oak, N.oak],
  ['cute', STEEL, C.pink, C.pink],
  ['industrial', STEEL_D, I.walnut, I.walnut],
  ['retro', STEEL, R.teal, R.teal],
]
const BOARD_PALS: Pal3[] = [
  ['nordic', N.white, N.oak, N.sage],
  ['modern', M.black, M.walnut, M.white],
  ['japanese', J.sumi, J.hinoki, J.washi],
  ['cute', C.white, C.woodL, C.pink],
]
const PANRACK_PALS: Pal3[] = [
  ['modern', M.black, M.char, M.black],
  ['nordic', N.white, '#e9e4dc', N.oak],
  ['industrial', I.iron, I.iron, I.walnut],
  ['cute', C.white, C.pink, C.woodL],
]
const SHELF_PALS: Pal3[] = [
  ['nordic', N.white, N.oak, N.sage],
  ['modern', M.black, M.char, M.silver],
  ['industrial', I.iron, I.walnut, I.rust],
  ['japanese', J.sumi, J.wood, J.shu],
  ['cute', C.white, C.woodL, C.pink],
]
const GAP_PALS: Pal3[] = [
  ['modern', M.white, M.light, M.char],
  ['nordic', N.white, N.oak, N.sage],
  ['industrial', M.black, I.walnut, I.rust],
  ['cute', C.white, C.pink, C.sky],
]
const CUPBOARD_PALS: Pal3[] = [
  ['modern', M.white, M.light, M.char],
  ['nordic', N.white, N.oak, M.black],
  ['japanese', J.wood, J.hinoki, J.sumi],
  ['industrial', I.walnut, I.walnut, I.iron],
  ['retro', R.caramel, R.cream, '#d4a64a'],
]

// 餐具
const WASHOKU_PALS: Pal3[] = [
  ['japanese', J.washi, '#9b2d26', J.dark],
  ['japanese', '#e9e2d0', J.sumi, J.shu],
  ['nordic', N.white, N.oak, N.oak],
  ['modern', M.white, M.black, M.black],
  ['cute', C.white, C.pink, C.pink],
]
const CHOP_PALS: Pal3[] = [
  ['japanese', J.shu, J.sumi, J.washi],
  ['nordic', N.oak, N.oakL, N.sage],
  ['modern', M.black, M.silver, M.white],
  ['cute', C.pink, C.sky, C.lemon],
]
const PLATE_PALS: Pal3[] = [
  ['nordic', N.white, N.linen, N.blue],
  ['japanese', J.washi, '#d8d0bc', J.ai],
  ['modern', M.white, M.light, M.black],
  ['retro', R.cream, R.mustard, R.teal],
  ['cute', C.white, C.sakura, C.pink],
]
const BENTO_PALS: Pal3[] = [
  ['japanese', J.sumi, J.shu, J.shu],
  ['japanese', J.hinoki, J.wood, J.ai],
  ['cute', C.white, C.pink, C.mint],
  ['modern', M.char, M.light, M.black],
  ['nordic', N.sage, N.white, N.oak],
]
const CHAWAN_PALS: Pal3[] = [
  ['japanese', J.washi, J.wood, J.wood],
  ['japanese', J.ai, J.sumi, J.hinoki],
  ['modern', M.white, M.black, M.walnut],
  ['nordic', N.white, N.oak, N.oak],
]
const SOY_PALS: Pal3[] = [
  ['japanese', J.washi, J.ai, J.shu],
  ['modern', M.white, M.white, M.black],
  ['nordic', N.linen, N.white, N.oak],
  ['cute', C.white, C.white, C.pink],
]
const TUMBLER_PALS: Pal3[] = [
  ['modern', GLASS, '#f5a25d', M.char],
  ['nordic', GLASS, '#f5d58a', N.oak],
  ['retro', '#e8f5d0', R.orange, R.caramel],
  ['cute', '#ffe6ee', '#ff9db0', C.white],
]
const MUGTREE_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.sage],
  ['modern', M.black, M.white, M.char],
  ['retro', R.caramel, R.mustard, R.teal],
  ['cute', C.woodL, C.pink, C.sky],
  ['industrial', I.walnut, I.concrete, I.rust],
]
const WINE_PALS: Pal3[] = [
  ['modern', GLASS, WINE_R, M.black],
  ['nordic', GLASS, WINE_R, N.oak],
  ['industrial', GLASS, WINE_R, I.walnut],
  ['retro', '#f2ead0', '#e8c24a', R.caramel],
]
const BEER_PALS: Pal3[] = [
  ['industrial', I.walnut, GLASS, I.rust],
  ['modern', M.char, GLASS, M.white],
  ['retro', R.cream, GLASS, R.red],
  ['nordic', N.oak, GLASS, N.sage],
]
const TOKKURI_PALS: Pal3[] = [
  ['japanese', J.washi, J.dark, J.ai],
  ['japanese', '#c9b79a', J.sumi, J.shu],
  ['retro', R.cream, R.caramel, R.teal],
  ['modern', M.white, M.black, M.char],
]
const DRIP_PALS: Pal3[] = [
  ['modern', STEEL, M.white, M.black],
  ['nordic', N.white, N.white, N.oak],
  ['industrial', '#c7773e', '#8a6a52', I.walnut],
  ['retro', R.cream, R.mustard, R.caramel],
  ['cute', C.white, C.pink, C.woodL],
]
const KYUSU_PALS: Pal3[] = [
  ['japanese', '#8a4a2a', J.washi, J.wood],
  ['japanese', J.ai, '#e9e2d0', J.dark],
  ['modern', M.black, M.white, M.walnut],
  ['nordic', N.white, N.linen, N.oak],
  ['cute', C.mint, C.white, C.woodL],
]
const MAT_PALS: Pal3[] = [
  ['japanese', J.tatami, J.dark, J.dark],
  ['nordic', N.linen, N.sage, N.oak],
  ['modern', M.char, M.gray, M.black],
  ['cute', C.sakura, C.pink, C.pink],
  ['retro', R.mustard, R.caramel, R.red],
]
const COASTER_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.oak],
  ['japanese', J.hinoki, J.ai, J.wood],
  ['modern', M.char, M.gray, M.black],
  ['cute', C.pink, C.mint, C.white],
  ['retro', R.orange, R.cream, R.teal],
]
const CUTLERY_PALS: Pal3[] = [
  ['nordic', N.oak, N.oakL, N.oak],
  ['modern', M.white, M.light, M.black],
  ['industrial', I.walnut, I.walnut, M.black],
  ['cute', C.mint, C.white, C.pink],
]
const DON_PALS: Pal3[] = [
  ['japanese', J.ai, J.ai, J.washi],
  ['japanese', J.shu, J.sumi, J.washi],
  ['retro', R.cream, R.teal, R.red],
  ['modern', M.black, M.black, M.silver],
]

// 食物：换盛器
const RICEBOWL_PALS: Pal3[] = [
  ['japanese', J.washi, J.sumi, J.dark],
  ['japanese', J.ai, J.ai, J.shu],
  ['nordic', N.white, N.oak, N.oak],
  ['cute', C.white, C.pink, C.pink],
  ['modern', M.black, M.black, M.black],
]
const MISO_PALS: Pal3[] = [
  ['japanese', '#3a1f1a', '#9b2d26', J.shu],
  ['japanese', J.sumi, J.sumi, J.shu],
  ['nordic', N.oak, N.oak, N.oak],
  ['modern', M.black, M.char, M.black],
]
const UDON_PALS: Pal3[] = [
  ['japanese', J.washi, J.washi, J.ai],
  ['japanese', J.sumi, J.sumi, J.shu],
  ['retro', R.cream, R.cream, R.red],
  ['modern', M.white, M.white, M.black],
]
const CURRY_PALS: Pal3[] = [
  ['retro', R.cream, R.teal, STEEL],
  ['modern', M.white, M.light, STEEL],
  ['nordic', N.white, N.blue, N.oak],
  ['cute', C.white, C.pink, C.woodL],
]
const OKE_PALS: Pal3[] = [
  ['japanese', J.hinoki, '#b07a3a', '#5a9e3a'],
  ['japanese', J.shu, J.sumi, '#5a9e3a'],
  ['nordic', N.oakL, N.oak, '#5a9e3a'],
]
const ONIGIRI_PALS: Pal3[] = [
  ['japanese', '#7cae5a', J.wood, '#e9c0a0'],
  ['nordic', N.oakL, N.oak, '#e8d27a'],
  ['modern', '#3e3f44', M.char, '#e9c0a0'],
  ['cute', C.mint, C.woodL, '#ffc6a0'],
]
const BREADBAG_PALS: Pal3[] = [
  ['modern', '#f4f8fb', '#4a7fc0', '#e8eef5'],
  ['retro', '#fdf8ea', R.red, R.mustard],
  ['cute', '#fff6fa', C.pink, C.sakura],
  ['nordic', '#f6f6f0', N.sage, N.linen],
]
const TOAST_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, STEEL],
  ['industrial', I.walnut, I.iron, STEEL],
  ['japanese', J.hinoki, J.washi, J.wood],
  ['cute', C.woodL, C.pink, C.pink],
]
const BAGUETTE_PALS: Pal3[] = [
  ['nordic', KRAFT, N.white, N.white],
  ['retro', KRAFT, R.red, R.red],
  ['modern', '#f4f2ec', M.black, M.black],
  ['industrial', '#b58f62', I.iron, I.iron],
]
const DONUT_PALS: Pal3[] = [
  ['retro', R.cream, R.orange, '#7ad3c8'],
  ['cute', C.white, C.pink, C.lilac],
  ['modern', M.white, M.char, '#f7a8c4'],
  ['nordic', N.linen, N.sage, '#f2c94c'],
]
const APPLE_PALS: Pal3[] = [
  ['nordic', N.oak, N.oak, '#e0453a'],
  ['japanese', J.wood, J.dark, '#d63a3a'],
  ['modern', M.white, M.white, '#e0453a'],
  ['retro', R.cream, R.caramel, '#d6503a'],
]
const BANANA_PALS: Pal3[] = [
  ['nordic', N.oak, N.oak, '#5a4630'],
  ['modern', M.black, M.black, '#5a4630'],
  ['industrial', I.iron, I.walnut, '#5a4630'],
  ['cute', C.woodL, C.pink, '#5a4630'],
]
const MIKAN_PALS: Pal3[] = [
  ['japanese', CARD, '#3a7a3a', '#ff9a2a'],
  ['retro', CARD, R.red, '#ff9a2a'],
  ['nordic', '#d8c4a4', N.sage, '#ffa438'],
]
const MELON_PALS: Pal3[] = [
  ['nordic', '#3f8f3a', '#ff5a5a', N.white],
  ['japanese', '#35803a', '#ff5a5a', J.washi],
  ['cute', '#4f9e3b', '#ff6a7a', C.sky],
  ['modern', '#3f8f3a', '#ff5a5a', M.light],
]
const GRAPE_PALS: Pal3[] = [
  ['modern', M.white, M.white, '#5a3a7a'],
  ['nordic', N.linen, N.oak, '#5a3a7a'],
  ['cute', C.white, C.lilac, '#9fcf6a'],
  ['japanese', J.washi, J.wood, '#4a2f6a'],
]
const VEG_PALS: Pal3[] = [
  ['japanese', '#c9a568', '#a8813e', J.wood],
  ['nordic', '#d9c8a4', N.oak, N.oak],
  ['industrial', '#8a6a4a', I.iron, I.iron],
  ['cute', '#f0d8b0', C.pink, C.pink],
]
const NETBAG_PALS: Pal3[] = [
  ['retro', '#d64a3a', '#e0a526', R.cream],
  ['modern', '#d64a3a', '#3a8a5a', M.white],
  ['nordic', '#c85a4a', '#7a9a6a', N.linen],
]
const EGG_PALS: Pal3[] = [
  ['modern', '#eef4f8', '#e8a640', M.white],
  ['nordic', '#d8cbb0', N.sage, N.white],
  ['cute', '#ffeef3', C.pink, C.white],
]
const MILK_PALS: Pal3[] = [
  ['modern', M.white, '#4a7fc0', M.white],
  ['retro', R.cream, R.red, R.red],
  ['cute', C.white, C.pink, C.pink],
  ['nordic', N.white, N.sage, N.oak],
]
const NOODLE_PALS: Pal3[] = [
  ['retro', M.white, R.red, '#f2ecd8'],
  ['modern', M.white, M.black, M.light],
  ['cute', C.white, C.pink, '#fff3c8'],
  ['industrial', '#e8e0d0', I.rust, '#d8cfc0'],
]
const SNACK_PALS: Pal3[] = [
  ['retro', R.orange, R.red, R.teal],
  ['cute', C.pink, C.sky, C.lemon],
  ['modern', M.char, M.silver, '#d65a3c'],
  ['nordic', N.mustard, N.sage, N.blue],
]
const CAN_PALS: Pal3[] = [
  ['retro', R.red, R.teal, R.mustard],
  ['industrial', I.rust, I.steel, '#6a7a4a'],
  ['modern', M.white, M.char, M.silver],
  ['cute', C.pink, C.mint, C.lemon],
]
const SEASON_PALS: Pal3[] = [
  ['japanese', J.shu, '#e8c24a', J.washi],
  ['modern', M.black, M.white, M.white],
  ['retro', R.red, R.mustard, R.cream],
  ['nordic', N.white, N.oak, N.linen],
]
const SACK_PALS: Pal3[] = [
  ['japanese', J.washi, J.ai, J.shu],
  ['retro', R.cream, R.red, R.mustard],
  ['nordic', N.linen, N.sage, N.oak],
  ['modern', M.white, M.char, '#4a7fc0'],
]
const WATER_PALS: Pal3[] = [
  ['modern', CARD, '#4a9ad8', '#3a7ac8'],
  ['nordic', '#e2d6c0', N.blue, N.white],
  ['cute', CARD, C.sky, C.pink],
]
const SIXPACK_PALS: Pal3[] = [
  ['modern', M.silver, M.black, STEEL],
  ['retro', R.mustard, R.red, STEEL],
  ['japanese', '#2f4a8a', J.washi, STEEL],
  ['cute', C.sky, C.white, STEEL],
]
const CRATE_PALS: Pal3[] = [
  ['retro', '#d6463a', '#e0a526', R.cream],
  ['industrial', '#4a5a4a', '#c9a24a', I.concrete],
  ['modern', '#3d5a8a', '#d8d8d8', M.white],
  ['japanese', '#c8a03a', J.shu, J.washi],
]
const SAKE_PALS: Pal3[] = [
  ['japanese', '#3f6b3a', J.washi, J.shu],
  ['japanese', '#5a3a1f', J.washi, J.sumi],
  ['retro', '#3f6b3a', R.cream, R.mustard],
  ['modern', '#2a2c30', M.white, M.black],
]
const WINERACK_PALS: Pal3[] = [
  ['nordic', N.oak, '#2f4a2a', '#7a1f33'],
  ['industrial', I.walnut, '#2f4a2a', M.black],
  ['modern', M.black, '#2f3a2a', '#c3a052'],
  ['retro', R.caramel, '#3a2a1f', R.red],
]
const PET_PALS: Pal3[] = [
  ['modern', '#f2a03c', M.white, M.white],
  ['cute', '#ff9db0', C.white, C.pink],
  ['retro', '#d64a3a', R.cream, R.red],
  ['nordic', TEA, N.white, N.sage],
]

// 餐桌摆设
const TEISHOKU_PALS: Pal3[] = [
  ['japanese', J.dark, '#9b2d26', J.washi],
  ['japanese', J.hinoki, J.sumi, '#e9e2d0'],
  ['nordic', N.oak, N.sage, N.white],
  ['modern', M.black, M.black, M.white],
  ['cute', C.woodL, C.pink, C.white],
]
const DINNER_PALS: Pal3[] = [
  ['nordic', N.white, N.linen, N.sage],
  ['modern', M.white, M.char, M.black],
  ['retro', R.cream, R.mustard, R.teal],
  ['cute', C.white, C.sakura, C.pink],
  ['industrial', I.concrete, '#8a6a4a', I.iron],
]
const NABE_PALS: Pal3[] = [
  ['japanese', M.char, '#e9e2d0', J.ai],
  ['japanese', M.silver, '#6e4f37', J.shu],
  ['retro', R.red, R.cream, R.teal],
  ['modern', M.white, M.black, M.silver],
  ['cute', C.pink, C.white, C.pink],
]
const TAKO_PALS: Pal3[] = [
  ['retro', R.red, R.cream, '#5a2e1c'],
  ['modern', M.white, M.white, M.black],
  ['cute', C.pink, C.white, C.pink],
  ['japanese', J.sumi, J.washi, J.shu],
]
const GRILL_PALS: Pal3[] = [
  ['modern', M.white, M.black, M.black],
  ['industrial', M.black, I.walnut, I.walnut],
  ['retro', R.mustard, R.caramel, R.caramel],
  ['cute', C.sky, C.white, C.pink],
]
const TEMAKI_PALS: Pal3[] = [
  ['japanese', J.hinoki, J.washi, J.ai],
  ['japanese', J.shu, J.sumi, J.washi],
  ['nordic', N.oakL, N.white, N.blue],
  ['modern', M.walnut, M.black, M.white],
]
const SUKI_PALS: Pal3[] = [
  ['japanese', I.iron, J.washi, J.dark],
  ['japanese', I.iron, J.ai, J.shu],
  ['modern', M.black, M.white, M.black],
  ['retro', I.iron, R.cream, R.caramel],
]

// ======================================================================
// 素材表
// ======================================================================

const r = rectPoly
const WAGON_IN = r(-21 - WAGON_DX, -13.5, 21 - WAGON_DX, 13.5)
const wagonSurf = (tiers: number) => {
  const ys = wagonTiers(tiers)
  const gap = ys[1] - ys[0]
  return ys.slice(0, -1).map((y) => ({ y: y + 0.6, h: gap - 0.6, shape: [WAGON_IN] }))
}
const cupSurf = (W: number): SurfaceDef[] => {
  const k = cupboardShelves(W)
  const z0 = -k.D / 2
  const low = [r(-W / 2 + 2.5, z0 + 1.8, W / 2 - 2.5, k.D / 2 - 1.5)]
  return [
    { y: k.lowTop, h: k.upBottom - 2 - k.lowTop, shape: [r(-W / 2 + 1, z0 + 2, W / 2 - 1, k.D / 2 - 1)] },
    // 上柜（玻璃门）
    { y: k.upBottom, h: k.upMid - 1.5 - k.upBottom, shape: [r(-W / 2 + 2.5, z0 + 1.5, W / 2 - 2.5, z0 + k.upD - 2)], inside: true, glass: true },
    { y: k.upMid, h: k.top - 2 - k.upMid, shape: [r(-W / 2 + 2.5, z0 + 1.5, W / 2 - 2.5, z0 + k.upD - 4)], inside: true, glass: true },
    // 下柜：门里两层 + 每列一个抽屉
    { y: 8, h: k.lowMid - 1.6 - 8 - 0.5, shape: low, inside: true },
    { y: k.lowMid, h: 61.4 - k.lowMid - 0.5, shape: low, inside: true },
    ...cupboardCols(W).map(({ x, cw }): SurfaceDef => ({ y: k.drawerY + 1.1, h: 9.5, inside: true, slide: 23, shape: [r(x - (cw - 4) / 2 + 1.2, k.D / 2 - 0.4 - 38 + 1.2, x + (cw - 4) / 2 - 1.2, k.D / 2 - 1.6)] })),
  ]
}

type ToolKind = 'ladle' | 'turner' | 'whisk' | 'tongs'
const TOOL_BODY: Record<ToolKind, (p: string[]) => THREE.Group> = { ladle: ladleBody, turner: turnerBody, whisk: whiskBody, tongs: tongsBody }
const TOOL_NAME: Record<ToolKind, string> = { ladle: '汤勺', turner: '锅铲', whisk: '打蛋器', tongs: '食物夹' }
const TOOL_DIMS: Record<ToolKind, { lying: [number, number, number]; hanging: [number, number, number] }> = {
  ladle: { lying: [30.3, 8.4, 3.6], hanging: [8.4, 5.3, 35.8] },
  turner: { lying: [30.9, 8, 1.2], hanging: [8, 5.3, 36.4] },
  whisk: { lying: [27, 6.7, 6.7], hanging: [6.7, 8.2, 32.5] },
  tongs: { lying: [25.4, 6.5, 1.5], hanging: [6.5, 5.3, 30.9] },
}
const toolDefs = (k: ToolKind): AssetDef[] => [
  def({ id: `kf-${k}`, name: TOOL_NAME[k], family: `kf-${k}`, form: 'lying', w: TOOL_DIMS[k].lying[0], d: TOOL_DIMS[k].lying[1], h: TOOL_DIMS[k].lying[2], pals: TOOL_PALS, build: (p) => laidTool(TOOL_BODY[k](p)) }),
  def({ id: `kf-${k}-hanging`, name: TOOL_NAME[k], family: `kf-${k}`, form: 'hanging', w: TOOL_DIMS[k].hanging[0], d: TOOL_DIMS[k].hanging[1], h: TOOL_DIMS[k].hanging[2], pals: TOOL_PALS, build: (p) => hungTool(TOOL_BODY[k](p)) }),
]

export const KITCHEN_FOOD: AssetDef[] = [
  // ---------- 厨房收纳 ----------
  def({ id: 'kf-dish-rack', name: '两层沥水架', family: 'kf-dish-rack', sizeLabel: '空', w: 48, d: 29.3, h: 37.5, pals: RACK_PALS, build: (p) => dishRack2(p, false) }),
  def({ id: 'kf-dish-rack-full', name: '两层沥水架', family: 'kf-dish-rack', sizeLabel: '放着碗盘', w: 48, d: 29.3, h: 37.5, pals: RACK_PALS, build: (p) => dishRack2(p, true) }),
  def({ id: 'kf-dish-rack-mini', name: '两层沥水架', family: 'kf-dish-rack', sizeLabel: '单层小号', w: 34, d: 24, h: 13.5, pals: RACK_PALS, build: dishRackMini }),
  def({ id: 'kf-spice-carousel', name: '旋转调料架', w: 24, d: 24, h: 25.8, pals: SPICE_PALS, build: spiceCarousel }),
  def({ id: 'kf-spice-shelf', name: '两层调料架（带瓶）', w: 36, d: 12, h: 30, pals: SPICE_PALS, build: spiceShelf }),
  def({ id: 'kf-knife-magnet', name: '磁吸刀架', w: 42, d: 2.8, h: 31.5, mount: KNIFE_MOUNT, prop: false, pals: KNIFE_PALS, build: knifeMagnet }),
  def({ id: 'kf-utensil-crock', name: '厨具筒', w: 12.9, d: 12.8, h: 35.1, pals: CROCK_PALS, build: utensilCrock }),
  def({ id: 'kf-wagon-3', name: '厨房网篮推车', family: 'kf-wagon', sizeLabel: '3 层', w: 48.3, d: 30.6, h: 73.2, prop: false, surface: 67.6, surfaceShape: [WAGON_IN], surfaces: wagonSurf(3), pals: WAGON_PALS, build: (p) => kitchenWagon(p, 3) }),
  def({ id: 'kf-wagon-4', name: '厨房网篮推车', family: 'kf-wagon', sizeLabel: '4 层', w: 48.3, d: 30.6, h: 85.2, prop: false, surface: 79.6, surfaceShape: [WAGON_IN], surfaces: wagonSurf(4), pals: WAGON_PALS, build: (p) => kitchenWagon(p, 4) }),
  def({ id: 'kf-rice-cabinet', name: '计量米柜 10kg', w: 26, d: 43.6, h: 48, pals: RICE_CAB_PALS, build: riceCabinet }),
  def({ id: 'kf-bag-stand', name: '垃圾分类挂袋架', w: 74.6, d: 29.3, h: 68, prop: false, pals: BAG_STAND_PALS, build: bagStand }),
  def({ id: 'kf-glass-containers', name: '玻璃保鲜盒叠放', w: 22.6, d: 17.8, h: 21.6, pals: LID_PALS, build: glassContainers }),
  def({ id: 'kf-canisters', name: '干货密封罐', w: 27, d: 9, h: 29, pals: CANISTER_PALS, build: canisters }),
  def({ id: 'kf-wrap-rack', name: '保鲜膜收纳架', w: 34, d: 9, h: 16, pals: WRAP_PALS, build: wrapRack }),
  def({
    id: 'kf-rail',
    name: '厨房挂杆',
    family: 'kf-rail',
    sizeLabel: '空杆（可挂厨具）',
    w: 62.2,
    d: 4.9,
    h: 6,
    mount: RAIL_MOUNT,
    prop: false,
    surfaces: [{ y: RAIL_BAR_Y + RAIL_R + 0.5, kind: 'hook', h: 40, shape: [r(-27, RAIL_Z - 1.5, 27, RAIL_Z + 1.5)] }],
    pals: RAIL_PALS,
    build: (p) => railBase(p, 60),
  }),
  def({ id: 'kf-rail-tools', name: '厨房挂杆', family: 'kf-rail', sizeLabel: '挂满厨具', w: 62.6, d: 10, h: 38.1, mount: 107.9, prop: false, pals: RAIL_PALS, build: railWithTools }),
  ...toolDefs('ladle'),
  ...toolDefs('turner'),
  ...toolDefs('whisk'),
  ...toolDefs('tongs'),
  def({ id: 'kf-board-stand', name: '砧板立架', w: 30, d: 12, h: 23, pals: BOARD_PALS, build: boardStand }),
  def({ id: 'kf-pan-rack', name: '锅具收纳架', w: 24, d: 36, h: 37.4, pals: PANRACK_PALS, build: panRack }),
  def({ id: 'kf-range-rack', name: '微波炉架', w: MW.w, d: MW.d, h: MW.h, prop: false, surface: MW.h, surfaces: [{ y: MW.shelves[0] + 2, h: 120 }, { y: MW.shelves[1] + 2, h: 36 }, { y: MW.shelves[2] + 2, h: 28 }], pals: SHELF_PALS, build: rangeRack }),
  def({ id: 'kf-counter-rack', name: '台面置物架（跨电器）', w: 58, d: 36, h: 42, surface: 42, pals: SHELF_PALS, build: counterRack }),
  def({ id: 'kf-gap-wagon', name: '冰箱夹缝推车（带调料）', w: 15, d: 55.9, h: 80.2, prop: false, pals: GAP_PALS, build: gapWagon }),
  def({ id: 'kf-cupboard-80', name: '玻璃门食器棚', family: 'kf-cupboard', sizeLabel: '80', category: 'dining', w: 81, d: 46.8, h: 180, prop: false, surface: 180, surfaceShape: [r(-40, -22.5, 40, 9)], openable: true, surfaces: cupSurf(80), pals: CUPBOARD_PALS, build: (p) => cupboard(p, 80) }),
  def({ id: 'kf-cupboard-120', name: '玻璃门食器棚', family: 'kf-cupboard', sizeLabel: '120', category: 'dining', w: 121, d: 46.8, h: 180, prop: false, surface: 180, surfaceShape: [r(-60, -22.5, 60, 9)], openable: true, surfaces: cupSurf(120), pals: CUPBOARD_PALS, build: (p) => cupboard(p, 120) }),

  // ---------- 餐具 ----------
  def({ id: 'kf-washoku-set', name: '一人份和食器', category: 'tabletop', w: 25, d: 17.5, h: 9.2, pals: WASHOKU_PALS, build: washokuSet }),
  def({ id: 'kf-chopsticks', name: '筷子筷架', category: 'tabletop', w: 23, d: 5.6, h: 1.6, pals: CHOP_PALS, build: chopstickPair }),
  def({ id: 'kf-plates-s', name: '盘子叠放', family: 'kf-plates', sizeLabel: '小 15cm', w: 15, d: 15, h: 7.4, pals: PLATE_PALS, build: (p) => plateStack(p, 7.5, 5) }),
  def({ id: 'kf-plates-m', name: '盘子叠放', family: 'kf-plates', sizeLabel: '中 21cm', w: 21, d: 21, h: 6, pals: PLATE_PALS, build: (p) => plateStack(p, 10.5, 4) }),
  def({ id: 'kf-plates-l', name: '盘子叠放', family: 'kf-plates', sizeLabel: '大 27cm', w: 27, d: 27, h: 5.5, pals: PLATE_PALS, build: (p) => plateStack(p, 13.5, 3) }),
  def({ id: 'kf-bento-closed', name: '两层便当盒', family: 'kf-bento', form: 'closed', category: 'tabletop', w: 18, d: 11.8, h: 11, pals: BENTO_PALS, build: (p) => bento2(p, false) }),
  def({ id: 'kf-bento-open', name: '两层便当盒', family: 'kf-bento', form: 'open', category: 'tabletop', w: 36, d: 13.8, h: 10.6, pals: BENTO_PALS, build: (p) => bento2(p, true) }),
  def({ id: 'kf-chawanmushi', name: '茶碗蒸杯', category: 'tabletop', w: 13, d: 13, h: 10, pals: CHAWAN_PALS, build: chawanmushi }),
  def({ id: 'kf-soy-dish', name: '酱油碟 + 酱油壶', category: 'tabletop', w: 16.7, d: 9, h: 8.4, pals: SOY_PALS, build: soyDish }),
  def({ id: 'kf-tumblers', name: '玻璃杯组', category: 'tabletop', w: 22.6, d: 9.6, h: 12.4, pals: TUMBLER_PALS, build: glassTumblers }),
  def({ id: 'kf-mug-tree', name: '马克杯架', category: 'tabletop', w: 27.1, d: 27.1, h: 35, pals: MUGTREE_PALS, build: mugTree }),
  def({ id: 'kf-wine-glasses', name: '葡萄酒杯一对', category: 'tabletop', w: 20, d: 12, h: 20.6, pals: WINE_PALS, build: wineGlasses }),
  def({ id: 'kf-beer-mugs', name: '啤酒杯（两杯）', category: 'tabletop', w: 23.4, d: 10.3, h: 15.4, pals: BEER_PALS, build: beerMugs }),
  def({ id: 'kf-tokkuri', name: '热燗套组（德利 + 猪口）', category: 'tabletop', w: 24, d: 14, h: 15, raw: true, fx: [{ kind: 'steam', x: 0, y: 15, z: 0, scale: 0.4, height: 10 }], pals: TOKKURI_PALS, build: tokkuriSet }),
  def({ id: 'kf-drip-set', name: '手冲咖啡套组', category: 'tabletop', w: 31.9, d: 11, h: 19.5, pals: DRIP_PALS, build: dripSet }),
  def({ id: 'kf-kyusu-set', name: '急须茶壶 + 汤吞', category: 'tabletop', w: 30, d: 17.5, h: 11, pals: KYUSU_PALS, build: kyusuSet }),
  def({ id: 'kf-placemat', name: '餐垫', family: 'kf-placemat', sizeLabel: '长方', category: 'tabletop', w: 45, d: 32, h: 1.3, pals: MAT_PALS, build: (p) => placemat(p, 'rect') }),
  def({ id: 'kf-placemat-round', name: '餐垫', family: 'kf-placemat', sizeLabel: '圆形', category: 'tabletop', w: 38, d: 38, h: 1.3, pals: MAT_PALS, build: (p) => placemat(p, 'round') }),
  def({ id: 'kf-coasters', name: '杯垫一叠', category: 'tabletop', w: 22.8, d: 12.4, h: 3.4, pals: COASTER_PALS, build: coasterStack }),
  def({ id: 'kf-cutlery-tray', name: '餐具收纳盒', w: 30, d: 22, h: 5, pals: CUTLERY_PALS, build: cutleryTray }),
  def({ id: 'kf-donburi', name: '丼碗（带盖）', category: 'tabletop', w: 16, d: 16, h: 10.6, pals: DON_PALS, build: donburi }),

  // ---------- 食物 / 饮料 ----------
  def({ id: 'kf-rice-bowl', name: '一碗白饭', category: 'tabletop', w: 22, d: 14, h: 7.5, off: [0, -1.2], fx: RICE_FX, pals: RICEBOWL_PALS, build: riceBowl }),
  def({ id: 'kf-miso-soup', name: '味噌汤', category: 'tabletop', w: 12, d: 12, h: 6.6, fx: MISO_FX, pals: MISO_PALS, build: misoSoup }),
  def({ id: 'kf-udon', name: '狐狸乌冬', category: 'tabletop', w: 19, d: 19, h: 8.1, fx: UDON_FX, pals: UDON_PALS, build: kitsuneUdon }),
  def({ id: 'kf-curry', name: '咖喱饭', category: 'tabletop', w: 26, d: 19, h: 3.6, pals: CURRY_PALS, build: curryRice }),
  def({ id: 'kf-sushi-oke', name: '寿司桶（散寿司）', category: 'tabletop', w: 30, d: 30, h: 7, pals: OKE_PALS, build: sushiOke }),
  def({ id: 'kf-onigiri-trio', name: '饭团三个', category: 'tabletop', w: 25, d: 13, h: 7, pals: ONIGIRI_PALS, build: onigiriTrio }),
  def({ id: 'kf-bread-bag', name: '袋装吐司', category: 'tabletop', w: 12.4, d: 27.1, h: 15.6, pals: BREADBAG_PALS, build: breadBag }),
  def({ id: 'kf-toast-plate', name: '吐司切片配黄油', category: 'tabletop', w: 24, d: 16, h: 4.3, pals: TOAST_PALS, build: toastPlate }),
  def({ id: 'kf-baguettes', name: '纸袋法棍', category: 'tabletop', w: 17.7, d: 8, h: 62, pals: BAGUETTE_PALS, build: baguettes }),
  def({ id: 'kf-donut-box', name: '甜甜圈盒', category: 'tabletop', w: 30, d: 21, h: 25.6, pals: DONUT_PALS, build: donutBox }),
  def({ id: 'kf-apples', name: '苹果', category: 'tabletop', w: 20, d: 20, h: 9.3, pals: APPLE_PALS, build: apples }),
  def({ id: 'kf-bananas', name: '香蕉架', category: 'tabletop', w: 23.6, d: 18.1, h: 36.6, pals: BANANA_PALS, build: bananas }),
  def({ id: 'kf-mikan-box', name: '一箱橘子', w: 36, d: 41.2, h: 24.5, pals: MIKAN_PALS, build: mikanBox }),
  def({ id: 'kf-watermelon', name: '半个西瓜', category: 'tabletop', w: 28, d: 28, h: 10, pals: MELON_PALS, build: watermelonHalf }),
  def({ id: 'kf-grapes', name: '一串葡萄', category: 'tabletop', w: 18, d: 18, h: 6, pals: GRAPE_PALS, build: grapes }),
  def({ id: 'kf-veg-basket', name: '蔬菜篮（萝卜·葱·白菜）', w: 44.2, d: 28.8, h: 16.2, pals: VEG_PALS, build: vegBasket }),
  def({ id: 'kf-onion-bags', name: '洋葱土豆网袋', w: 31.9, d: 10, h: 14.3, pals: NETBAG_PALS, build: onionPotatoBags }),
  def({ id: 'kf-eggs', name: '鸡蛋盒', w: 26, d: 23, h: 5.6, pals: EGG_PALS, build: eggCarton }),
  def({ id: 'kf-milk', name: '牛奶盒', family: 'kf-milk', sizeLabel: '1L', w: 7, d: 7, h: 23.4, pals: MILK_PALS, build: (p) => milkCarton(p, true) }),
  def({ id: 'kf-milk-s', name: '牛奶盒', family: 'kf-milk', sizeLabel: '500ml', w: 6, d: 6, h: 16.4, pals: MILK_PALS, build: (p) => milkCarton(p, false) }),
  def({ id: 'kf-cup-noodle', name: '杯面', family: 'kf-cup-noodle', form: 'closed', category: 'tabletop', w: 10, d: 11.4, h: 10.8, pals: NOODLE_PALS, build: (p) => cupNoodle(p, false) }),
  def({ id: 'kf-cup-noodle-open', name: '杯面', family: 'kf-cup-noodle', form: 'open', formLabel: '泡着', category: 'tabletop', w: 21, d: 11.6, h: 18.8, off: [0, 0.97], fx: NOODLE_FX, pals: NOODLE_PALS, build: (p) => cupNoodle(p, true) }),
  def({ id: 'kf-snacks', name: '零食袋', category: 'tabletop', w: 34.8, d: 11.8, h: 21.7, pals: SNACK_PALS, build: snackBags }),
  def({ id: 'kf-cans', name: '罐头叠放', w: 25.7, d: 8.4, h: 16.5, pals: CAN_PALS, build: cannedFood }),
  def({ id: 'kf-seasonings', name: '调味料瓶（酱油·味醂·油）', w: 24.4, d: 8.4, h: 28.2, pals: SEASON_PALS, build: seasoningBottles }),
  def({ id: 'kf-rice-sack-5', name: '米袋', family: 'kf-rice-sack', sizeLabel: '5kg', w: 28, d: 42, h: 9.4, pals: SACK_PALS, build: (p) => riceSack(p, 5) }),
  def({ id: 'kf-rice-sack-10', name: '米袋', family: 'kf-rice-sack', sizeLabel: '10kg', w: 36, d: 54, h: 11.4, pals: SACK_PALS, build: (p) => riceSack(p, 10) }),
  def({ id: 'kf-water-case', name: '矿泉水整箱', family: 'kf-water-case', sizeLabel: '2L×6', form: 'open', w: 32.6, d: 34.7, h: 38.9, pals: WATER_PALS, build: (p) => waterCase(p, true) }),
  def({ id: 'kf-water-case-closed', name: '矿泉水整箱', family: 'kf-water-case', sizeLabel: '2L×6', form: 'closed', w: 32.6, d: 22.6, h: 31, pals: WATER_PALS, build: (p) => waterCase(p, false) }),
  def({ id: 'kf-beer-6', name: '啤酒罐六连包', category: 'tabletop', w: 21, d: 14, h: 13.2, pals: SIXPACK_PALS, build: beerSixPack }),
  def({ id: 'kf-beer-crate', name: '啤酒箱（20 瓶）', w: 48.4, d: 33, h: 30.8, pals: CRATE_PALS, build: beerCrate }),
  def({ id: 'kf-isshobin', name: '清酒一升瓶', category: 'tabletop', w: 10, d: 10, h: 41, pals: SAKE_PALS, build: isshobin }),
  def({ id: 'kf-wine-rack', name: '葡萄酒 + 酒架', w: 34, d: 30.5, h: 26, pals: WINERACK_PALS, build: wineRack }),
  def({ id: 'kf-pet-bottles', name: '宝特瓶饮料', category: 'tabletop', w: 18, d: 13.7, h: 33, pals: PET_PALS, build: petBottles }),

  // ---------- 餐桌摆设 ----------
  def({ id: 'kf-teishoku', name: '一人份定食', category: 'tabletop', w: TEISHOKU.w, d: TEISHOKU.d, h: 7.8, fx: TEISHOKU_FX, pals: TEISHOKU_PALS, build: teishoku }),
  def({ id: 'kf-dinner-two', name: '两人晚餐套组', category: 'tabletop', w: 40, d: 62, h: 11.6, pals: DINNER_PALS, build: dinnerForTwo }),
  def({ id: 'kf-nabe', name: '火锅（卡式炉 + 土锅）', category: 'tabletop', w: 36, d: 31.1, h: 22.4, off: [0, -0.55], fx: NABE_FX, pals: NABE_PALS, build: nabeSet }),
  def({ id: 'kf-takoyaki-party', name: '章鱼烧派对', category: 'tabletop', w: 43, d: 29.7, h: 15.4, pals: TAKO_PALS, build: takoParty }),
  def({ id: 'kf-okonomiyaki', name: '铁板烧（大阪烧）', category: 'tabletop', w: 60.4, d: 35.4, h: 8.1, off: [0, -1.72], fx: OKONOMI_FX, pals: GRILL_PALS, build: okonomiyakiGrill }),
  def({ id: 'kf-temaki-party', name: '手卷寿司派对', category: 'tabletop', w: 53, d: 32, h: 7, pals: TEMAKI_PALS, build: temakiParty }),
  def({ id: 'kf-sukiyaki', name: '寿喜烧', category: 'tabletop', w: 34, d: 37.8, h: 5, off: [0, -4.91], fx: SUKI_FX, pals: SUKI_PALS, build: sukiyaki }),
]

// ======================================================================
// 追加：饮料（罐 / 玻璃瓶 / 宝特瓶 / 纸盒）、矿泉水、饮水机、零食点心
// ======================================================================

const WATER = '#cfeeff'
const PET = '#e8f6ff'
const MILK = '#fbfaf4'

/** 一罐饮料：罐身 + 标签色带 + 拉环；at.y 为底面 */
function drinkCan(r: number, h: number, body: string, band: string, top = STEEL, at: { x?: number; y?: number; z?: number } = {}) {
  const g = can(r, h, body, top)
  g.add(noOutlineDeep(cyl(r + 0.03, r + 0.03, h * 0.28, band, { y: h * 0.38 }, 20)))
  g.add(noOutlineDeep(rbox(1, 0.2, 1.6, STEEL_D, { y: h, z: r * 0.35 }, 0.1)))
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return g
}

/** 封好的整箱纸箱（24 罐 / 24 瓶）：侧面印色带和一个商品小图，顶上胶带，两侧把手孔 */
function sealedCase(w: number, h: number, d: number, band: string, mark: string) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, CARD, {}, 0.4))
  g.add(noOutlineDeep(rbox(w + 0.6, h * 0.3, d + 0.6, band, { y: h * 0.35 }, 0.2)))
  g.add(noOutlineDeep(rbox(5, h * 0.6, 0.3, mark, { x: w * 0.3, y: h * 0.18, z: d / 2 + 0.5 }, 0.6)))
  g.add(noOutlineDeep(rbox(6, 0.2, d + 0.2, '#e8d9b8', { y: h }, 0.05)))
  for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(0.3, 2, 6, shade(CARD, -0.3), { x: s * (w / 2 + 0.05), y: h - 4 }, 0.5)))
  return g
}

/** 罐装饮料：single 单罐 / six 六联包（塑料环） / case 24 罐整箱 / short 咖啡短罐 / slim 能量饮料细长罐 */
function cans(p: string[], kind: 'single' | 'six' | 'case' | 'short' | 'slim') {
  const [body, band, acc] = p
  const g = new THREE.Group()
  if (kind === 'single') g.add(drinkCan(3.3, 12.2, body, band))
  if (kind === 'short') g.add(drinkCan(2.65, 10.4, body, band, acc))
  if (kind === 'slim') g.add(drinkCan(2.65, 13.4, body, band))
  if (kind === 'six') {
    for (let i = 0; i < 6; i++) g.add(drinkCan(3.3, 12.2, body, band, STEEL, { x: -6.7 + (i % 3) * 6.7, z: i < 3 ? -3.35 : 3.35 }))
    // 顶上的塑料提环
    g.add(glassGhost(rbox(20.4, 0.4, 13.6, '#f4f4f4', { y: 11.2 }, 0.2), '#f4f4f4', 0.55))
    for (let i = 0; i < 6; i++) g.add(torus(3, 0.25, acc, { x: -6.7 + (i % 3) * 6.7, y: 11.4, z: i < 3 ? -3.35 : 3.35, rx: PI / 2 }))
  }
  if (kind === 'case') g.add(sealedCase(41, 12.8, 27.4, body, band))
  return g
}

/** 玻璃瓶：soda 汽水瓶 / milk 牛奶瓶 / juice 果汁瓶 / beer 精酿啤酒 / sparkling 气泡水 */
function glassBottle(p: string[], kind: 'soda' | 'milk' | 'juice' | 'beer' | 'sparkling') {
  const [lab, cap, liq] = p
  const g = new THREE.Group()
  if (kind === 'soda') {
    g.add(glassGhost(lathe([[0, 0], [2.8, 0], [2.9, 0.4], [2.9, 9], [2.2, 12], [1.3, 16], [1.3, 18.6], [0, 18.6]], GLASS), '#cfe9d8', 0.45))
    g.add(noOutlineDeep(lathe([[0, 0.4], [2.55, 0.4], [2.55, 9], [1.95, 12], [1.1, 15], [0, 15]], liq)))
    g.add(noOutlineDeep(cyl(2.95, 2.95, 4, lab, { y: 3 }, 20)))
    g.add(cyl(1.5, 1.4, 0.9, cap, { y: 18.4 }, 16))
  } else if (kind === 'milk') {
    g.add(glassGhost(lathe([[0, 0], [3.1, 0], [3.2, 0.4], [3.2, 7.5], [2.4, 10.5], [2.2, 12.6], [0, 12.6]], GLASS), GLASS, 0.4))
    g.add(noOutlineDeep(lathe([[0, 0.3], [2.9, 0.3], [2.9, 7.4], [2.15, 10.3], [2, 11.6], [0, 11.6]], MILK)))
    g.add(cyl(2.4, 2.4, 0.4, cap, { y: 12.5 }, 20))
    g.add(noOutlineDeep(cyl(2.6, 2.4, 1.2, lab, { y: 11.9 }, 20)))
  } else if (kind === 'juice') {
    g.add(glassGhost(lathe([[0, 0], [3.2, 0], [3.3, 0.4], [3.3, 11], [2.4, 13.5], [2, 15], [0, 15]], GLASS), GLASS, 0.4))
    g.add(noOutlineDeep(lathe([[0, 0.4], [3, 0.4], [3, 10.8], [2.2, 13], [0, 13]], liq)))
    g.add(noOutlineDeep(cyl(3.35, 3.35, 5, lab, { y: 3.5 }, 20)))
    g.add(cyl(2.2, 2.2, 1.4, cap, { y: 14.8 }, 20))
  } else if (kind === 'beer') {
    g.add(bottle(3.1, 21, 1.15, 12.5, '#6b3a16', {}))
    g.add(noOutlineDeep(cyl(3.14, 3.14, 6.5, lab, { y: 3.5 }, 20)))
    g.add(noOutlineDeep(rbox(2.4, 3, 0.3, cap, { y: 5.2, z: 3.12 }, 0.2)))
    g.add(cyl(1.4, 1.3, 0.9, cap, { y: 20.6 }, 14))
  } else {
    g.add(bottle(3.9, 27, 1.3, 13, '#4f8a4a', {}))
    g.add(noOutlineDeep(cyl(3.95, 3.95, 6, lab, { y: 5 }, 22)))
    g.add(cyl(1.5, 1.5, 2, cap, { y: 26.6 }, 14))
  }
  return g
}

/** 宝特瓶：500ml（圆） / 2L（方）；liq 为饮料色，标签用色带区分 */
function petBottle(p: string[], big: boolean) {
  const [liq, lab, cap] = p
  const g = new THREE.Group()
  if (!big) {
    g.add(glassGhost(bottle(3.3, 19.6, 1.35, 13.5, PET, {}), PET, 0.4))
    g.add(noOutlineDeep(bottle(3.05, 16.5, 1.1, 13.3, liq, { y: 0.3 })))
    g.add(noOutlineDeep(cyl(3.35, 3.35, 6, lab, { y: 5 }, 20)))
    g.add(cyl(1.5, 1.5, 1.6, cap, { y: 19.4 }, 14))
    return g
  }
  // 2L 方瓶：方身 + 圆肩
  g.add(glassGhost(rbox(9.6, 23, 9.6, PET, {}, 2), PET, 0.4))
  g.add(glassGhost(lathe([[4.8, 0], [4.8, 1], [3, 4.5], [1.6, 6.2], [1.6, 8], [0, 8]], PET, { y: 23 }), PET, 0.4))
  g.add(noOutlineDeep(rbox(9, 21.6, 9, liq, { y: 0.4 }, 1.8)))
  g.add(noOutlineDeep(rbox(10.2, 7, 10.2, lab, { y: 9 }, 2))) // 比瓶身每边凸出 0.3，避免和瓶身侧面闪烁
  g.add(cyl(1.7, 1.7, 2, cap, { y: 31 }, 14))
  return g
}

/** 矿泉水：500ml 圆瓶 / 2L 方瓶（水色 + 色带标签） */
function waterBottle(p: string[], big: boolean) {
  return petBottle([WATER, p[0], p[1]], big)
}

/** 利乐纸盒：soy1l 豆乳 1L / soy200 豆乳 200ml（侧面贴吸管）/ juice125 果汁小盒（吸管插好） */
function tetra(p: string[], kind: 'soy1l' | 'soy200' | 'juice125') {
  const [body, band, acc] = p
  const g = new THREE.Group()
  const [w, d, h] = kind === 'soy1l' ? [7, 7, 19.5] : kind === 'soy200' ? [6.3, 4, 10.5] : [5.2, 3.6, 8.6]
  g.add(rbox(w, h, d, body, {}, 0.3))
  g.add(noOutlineDeep(rbox(w + 0.6, h * 0.4, d + 0.6, band, { y: h * 0.18 }, 0.25)))
  g.add(noOutlineDeep(ball(w * 0.18, acc, { y: h * 0.72, z: d / 2 + 0.02 }, [1, 1, 0.1])))
  if (kind === 'soy1l') {
    g.add(cyl(1.3, 1.3, 1.2, acc, { x: 1.4, y: h, z: 1.4 }, 14))
    g.add(rbox(w, 0.6, 1, body, { y: h, z: -d / 2 + 0.5 }, 0.2))
  }
  if (kind === 'soy200') g.add(glassGhost(rbox(0.8, 9, 0.8, '#f4f4f4', { x: w / 2 + 0.75, y: 0.6 }, 0.3), '#f4f4f4', 0.6))
  if (kind === 'juice125') g.add(PG(cyl(0.3, 0.3, 6, acc, {}, 8), 1.2, h - 1, 0.6, 0, 0, -0.35))
  return g
}

/** 酸奶：tub 400g 大盒 / four 四连杯 */
function yogurt(p: string[], kind: 'tub' | 'four') {
  const [body, lid, band] = p
  const g = new THREE.Group()
  if (kind === 'tub') {
    g.add(cup(5.4, 4.6, 8.4, 0.3, body))
    g.add(noOutlineDeep(cyl(5.1, 5.1, 0.3, MILK, { y: 7.6 }, 24)))
    g.add(noOutlineDeep(cup(5.42, 4.95, 4, 0.05, band, { y: 2.4 })))
    g.add(puck(5.8, 1.4, lid, { y: 8.2 }))
    return g
  }
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 ? 1 : -1) * 3.6
    const z = i < 2 ? -3.6 : 3.6
    g.add(cup(3.3, 2.8, 6, 0.25, body, { x, z }))
    g.add(noOutlineDeep(cyl(3.05, 3.05, 0.3, MILK, { x, y: 5.4, z }, 20)))
  }
  g.add(rbox(14.4, 0.3, 14.4, lid, { y: 6 }, 0.1))
  g.add(noOutlineDeep(rbox(14.6, 2.6, 14.6, band, { y: 1.6 }, 0.2)))
  return g
}

/** 冰箱用冷水壶（2L 细长，装麦茶 / 水） */
function fridgePot(p: string[]) {
  const [lid, liq, acc] = p
  const g = new THREE.Group()
  g.add(glassGhost(cup(5.2, 5, 25, 0.3, GLASS), GLASS, 0.35))
  g.add(noOutlineDeep(cyl(4.85, 4.75, 19, liq, { y: 0.3 }, 24)))
  g.add(puck(5.6, 2.4, lid, { y: 24.4 }))
  g.add(rbox(3, 1.4, 3, lid, { y: 25, z: 5 }, 0.5))
  g.add(cyl(1.4, 1.4, 1, acc, { y: 26.6 }, 12))
  g.add(glassGhost(cappedTube([[-5, 21, 0], [-8.6, 19, 0], [-8.6, 6, 0], [-5, 4, 0]], 0.8, GLASS, { ...TUBE, seg: 20 }), GLASS, 0.5))
  return g
}

// ---------- 饮水机 ----------

/** 倒扣的大水桶（半透明，能看到水）：瓶口朝下，瓶口底在 y0，半径 r、桶高 h */
function bigBottle(r: number, h: number, y0: number, fill = 0.75) {
  const g = new THREE.Group()
  const pts: [number, number][] = [[0, 0], [2.2, 0], [2.2, 3], [r * 0.55, 4.5], [r, 8], [r, h - 2], [r - 2, h], [0, h]]
  g.add(glassGhost(lathe(pts, '#bfe6ff', { y: y0 }, 28), '#bfe6ff', 0.35))
  // 倒扣时水在下面（靠瓶口一侧）
  const wh = (h - 8) * fill
  g.add(glassGhost(cyl(r - 0.5, r - 0.5, wh, '#7cc4f0', { y: y0 + 8 }, 28), '#7cc4f0', 0.4))
  g.add(glassGhost(lathe([[0, 0.3], [1.9, 0.3], [1.9, 3], [r * 0.52, 4.6], [r - 0.5, 8], [0, 8]], '#7cc4f0', { y: y0 }), '#7cc4f0', 0.4))
  // 桶身的加强环（不透明细圈，看得出是个桶）
  for (const k of [0.35, 0.7]) g.add(torus(r + 0.05, 0.25, '#9fd2f2', { y: y0 + 8 + (h - 10) * k, rx: PI / 2 }))
  return g
}

/** 冷热两个出水口（蓝 / 红按钮）+ 接水托盘；凹槽背板在 z = zf，出水口高 y */
function taps(trayC: string, y: number, zf: number, trayY: number, w = 16) {
  const g = new THREE.Group()
  g.add(rbox(w, y - trayY + 4, 0.6, '#3a3c40', { y: trayY, z: zf }, 0.4))
  for (const [x, c] of [
    [-3.5, '#4fa3f0'],
    [3.5, '#f05a4f'],
  ] as const) {
    g.add(rbox(3, 2.4, 4.2, c, { x, y, z: zf + 2.2 }, 0.8))
    g.add(cyl(0.6, 0.6, 1.2, STEEL, { x, y: y - 1.2, z: zf + 3 }, 10))
  }
  g.add(tray(w - 1, 1.4, 6.5, 0.4, trayC, { y: trayY, z: zf + 3.5 }, 0.4))
  g.add(noOutlineDeep(rbox(w - 2.4, 0.2, 5.2, STEEL_D, { y: trayY + 1.1, z: zf + 3.5 }, 0.05)))
  return g
}

/** 落地饮水机（ウォーターサーバー）：top = 上置（12L 水桶倒扣在顶上） / bottom = 下置（水桶在柜内，透明窗看得到） */
function waterServer(p: string[], top: boolean) {
  const [body, panel, acc] = p
  const g = new THREE.Group()
  const W = 30
  const D = 34
  if (top) {
    const H = 100
    g.add(rbox(W, H, D, body, {}, 3))
    g.add(rbox(W - 6, 30, 1, panel, { y: 62, z: D / 2 - 0.3 }, 1.5))
    g.add(taps(acc, 84, D / 2 + 0.2, 64))
    g.add(rbox(14, 3, 0.6, panel, { y: 94, z: D / 2 }, 0.5))
    g.add(lit(ball(0.5, '#7fe0a8', { x: 4, y: 95.5, z: D / 2 + 0.4 }), '#7fe0a8', 0.8))
    g.add(cyl(7, 8, 1.5, panel, { y: H }, 24))
    g.add(bigBottle(13, 38, H + 1.5))
    for (let i = 0; i < 4; i++) g.add(noOutlineDeep(rbox(16, 0.6, 0.3, shade(body, -0.15), { y: 6 + i * 1.6, z: D / 2 + 0.05 }, 0.1)))
    return g
  }
  const H = 112
  // 下部柜（侧板 + 背板 + 底板），正面是透明窗，能看到柜里的水桶
  for (const sx of [-1, 1]) g.add(rbox(1.5, 60, D, body, { x: sx * (W / 2 - 0.75) }, 0.8))
  g.add(rbox(W - 3, 1.5, D, body, {}, 0.5))
  g.add(rbox(W - 3, 60, 1.5, body, { z: -D / 2 + 0.75 }, 0.5))
  g.add(glassGhost(rbox(W - 3, 56, 0.4, GLASS, { y: 1.5, z: D / 2 - 0.5 }, 0.3), '#d8e2ea', 0.3))
  g.add(rbox(W - 3, 3, 1.2, panel, { y: 1.5, z: D / 2 - 0.6 }, 0.4))
  // 柜里的水桶（瓶口朝上立放，吸水管插进桶口）
  const b = bigBottle(12, 36, 0)
  b.rotation.x = PI
  b.position.set(0, 1.5 + 36, -1)
  g.add(b)
  g.add(cyl(0.6, 0.6, 22, '#e8f2f8', { y: 38, z: -1 }, 8))
  // 上部机身
  g.add(rbox(W, H - 58, D, body, { y: 58 }, 3))
  g.add(rbox(W - 6, 30, 1, panel, { y: 66, z: D / 2 - 0.3 }, 1.5))
  g.add(taps(acc, 88, D / 2 + 0.2, 68))
  g.add(rbox(14, 3, 0.6, panel, { y: 101, z: D / 2 }, 0.5))
  g.add(lit(ball(0.5, '#7fe0a8', { x: 4, y: 102.5, z: D / 2 + 0.4 }), '#7fe0a8', 0.8))
  return g
}

/** 台式小饮水机（7L 水桶倒扣） */
function deskServer(p: string[]) {
  const [body, panel, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 28, 28, body, {}, 2.5))
  g.add(rbox(18, 17, 1, panel, { y: 4, z: 13.7 }, 1.2))
  g.add(taps(acc, 15, 14.2, 4.4, 14))
  g.add(cyl(5.5, 6, 1.2, panel, { y: 28 }, 20))
  g.add(bigBottle(9.5, 24, 29.2))
  return g
}

// ---------- 外卖 / 便利店 / 日配 ----------

/** 披萨盒（L 33cm）：open 打开（盖子立在后面） / closed 合上 */
function pizzaBox(p: string[], open: boolean) {
  const [box, print, top] = p
  const g = new THREE.Group()
  const S = 33
  if (!open) {
    g.add(rbox(S, 4.4, S, box, {}, 0.4))
    g.add(noOutlineDeep(cyl(9, 9, 0.2, print, { y: 4.4 }, 28)))
    g.add(noOutlineDeep(cyl(6, 6, 0.25, top, { y: 4.4 }, 28)))
    return g
  }
  g.add(tray(S, 4.2, S, 0.4, box, {}, 0.3))
  // 盖子立在后面（盖内侧朝前，印着圆标）
  const lid = new THREE.Group()
  lid.add(rbox(S, 0.4, S, box, {}, 0.2))
  lid.add(noOutlineDeep(cyl(9, 9, 0.2, print, { y: 0.4 }, 28)))
  lid.rotation.x = PI / 2 - 0.06
  lid.position.set(0, S / 2 + 0.2, -S / 2 - 0.2)
  g.add(lid)
  // 披萨：饼边 + 酱 + 芝士 + 料，切 8 块
  const y = 0.4
  g.add(torus(14.2, 1.1, '#d9a050', { y: y + 1, rx: PI / 2 }))
  g.add(cyl(14, 14, 1, '#e8b468', { y }, 40))
  g.add(noOutlineDeep(cyl(13.2, 13.2, 0.3, '#d8442e', { y: y + 1 }, 40)))
  g.add(noOutlineDeep(cyl(12.4, 12.4, 0.35, '#ffe08a', { y: y + 1.1 }, 40)))
  const r = rng(13)
  for (let i = 0; i < 14; i++) {
    const a = r() * PI * 2
    const d = 2 + r() * 9
    g.add(cyl(1.6, 1.6, 0.4, '#c8303f', { x: Math.cos(a) * d, y: y + 1.35, z: Math.sin(a) * d }, 14))
  }
  for (let i = 0; i < 10; i++) g.add(noOutlineDeep(torus(0.8, 0.22, '#3f8a3a', { x: Math.cos(i * 2.1) * (3 + (i % 4) * 2.4), y: y + 1.6, z: Math.sin(i * 2.1) * (3 + (i % 4) * 2.4), rx: PI / 2 })))
  for (let i = 0; i < 4; i++) g.add(noOutlineDeep(rbox(28, 0.1, 0.2, '#b8803c', { y: y + 1.75, ry: (i * PI) / 4 }, 0.02)))
  return g
}

/** 中华外卖纸盒（打开，炒面）+ 一次性筷子 */
function chineseTakeout(p: string[]) {
  const [box, print, handle] = p
  const g = new THREE.Group()
  // 方口圆台：四段车削转 45°
  const m = lathe([[0, 0], [5.4, 0], [7.6, 10], [7.3, 10], [5.1, 0.35], [0, 0.35]], box, {}, 4)
  m.rotation.y = PI / 4
  g.add(m)
  g.add(noOutlineDeep(rbox(4, 4, 0.2, print, { y: 3, z: 4, rx: -0.22 }, 1)))
  g.add(cappedTube([[-6.6, 9, 0], [-5, 15, 0], [5, 15, 0], [6.6, 9, 0]], 0.12, handle, { ...TUBE, seg: 24 }))
  for (let i = 0; i < 8; i++) g.add(noOutlineDeep(cappedTube(arc([0, 8.6, 0], 1 + i * 0.6, i * 0.9, i * 0.9 + 2.6, 6, 'xz'), 0.3, '#d9a050', { ...TUBE, seg: 12 })))
  g.add(noOutlineDeep(ball(1, '#3f8a3a', { x: 2, y: 9, z: -1 }, [1.3, 0.3, 1])))
  g.add(noOutlineDeep(rbox(1.4, 0.4, 1, '#f08a3c', { x: -2, y: 9, z: 1.5 }, 0.2)))
  g.add(chopsticks(20, '#ead7b8', 0, 0, 9.5))
  return g
}

/** 外卖便当（底盒 + 透明盖，炸鸡 + 饭） */
function takeoutBento(p: string[]) {
  const [base, sticker, acc] = p
  const g = new THREE.Group()
  g.add(tray(22, 3.6, 16, 0.4, base, {}, 0.8))
  g.add(rbox(0.4, 3, 15, base, { x: 3, y: 0.4 }, 0.1))
  g.add(noOutlineDeep(rbox(11.6, 2.6, 14.6, RICE, { x: -2.7, y: 0.4 }, 1)))
  g.add(ball(0.9, '#c8303f', { x: -2.7, y: 3, z: 0 }))
  for (const [x, z] of [
    [5.5, -4],
    [8, -1],
    [5.8, 2],
    [8.4, 4.5],
  ])
    g.add(ball(1.8, '#b86a2a', { x, y: 2.6, z }, [1.1, 0.8, 1]))
  g.add(noOutlineDeep(ball(1.4, acc, { x: -6, y: 3, z: 4.5 }, [1.4, 0.3, 1])))
  // 透明盖（倒扣的浅盒）+ 价签
  g.add(glassGhost(tray(22.4, 3.2, 16.4, 0.3, GLASS, { y: 6.8, rx: PI }, 0.8), GLASS, 0.3))
  g.add(noOutlineDeep(rbox(6, 0.2, 3.5, sticker, { x: 5, y: 6.85, z: 4 }, 0.1)))
  return g
}

/** 三角形挤出体（三明治片 / 包装盒）：直角在 (-a, 0)，底宽 2a、高 b、厚 depth，z 从 z0 起 */
function triPrism(a: number, b: number, depth: number, color: string, z0: number, bevel = 0) {
  const s = new THREE.Shape()
  s.moveTo(-a, 0)
  s.lineTo(a, 0)
  s.lineTo(-a, b)
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, bevel ? { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 } : { depth, bevelEnabled: false })
  const m = new THREE.Mesh(geo, toon(color))
  m.position.z = z0
  m.castShadow = true
  return m
}

/** 便利店三明治（三角包装，两片） */
function sandwichPack(p: string[]) {
  const [film, label, filling] = p
  const g = new THREE.Group()
  for (const dz of [-2.2, 2.2]) {
    const h = new THREE.Group()
    h.add(triPrism(6.3, 10.6, 0.8, BREAD, -1.5, 0.2))
    h.add(triPrism(6.1, 10.2, 0.8, filling, -0.5))
    h.add(noOutlineDeep(triPrism(6.2, 10.3, 0.3, '#7cc46a', 0.3)))
    h.add(triPrism(6.3, 10.6, 0.8, BREAD, 0.7, 0.2))
    h.position.z = dz
    g.add(h)
  }
  g.add(glassGhost(triPrism(7.2, 12, 8.4, film, -4.2), film, 0.3))
  g.add(noOutlineDeep(rbox(6, 3, 0.2, label, { x: -3, y: 2, z: 4.3 }, 0.3)))
  return g
}

/** 纳豆三连盒 */
function natto(p: string[]) {
  const [box, label, tape] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    g.add(rbox(9.6, 3.5, 7.6, box, { y: i * 3.55 }, 0.6))
    g.add(noOutlineDeep(rbox(9.7, 0.3, 7.7, shade(box, -0.08), { y: i * 3.55 + 2.2 }, 0.1)))
  }
  g.add(noOutlineDeep(rbox(6, 0.2, 4.5, label, { y: 10.66 }, 0.3)))
  g.add(rbox(2.4, 10.8, 7.8, tape, { y: -0.05 }, 0.2))
  return g
}

/** 盒装豆腐（覆膜） */
function tofuPack(p: string[]) {
  const [trayC, label, acc] = p
  const g = new THREE.Group()
  g.add(tray(11.6, 4.2, 8.6, 0.3, trayC, {}, 0.5))
  g.add(noOutlineDeep(rbox(10.6, 3.6, 7.6, TOFU, { y: 0.3 }, 0.4)))
  g.add(glassGhost(rbox(11.8, 0.2, 8.8, '#ffffff', { y: 4.2 }, 0.05), '#ffffff', 0.4))
  g.add(noOutlineDeep(rbox(7, 0.15, 4, label, { y: 4.4 }, 0.2)))
  g.add(noOutlineDeep(ball(1, acc, { x: -2.2, y: 4.55, z: 0 }, [1, 0.1, 1])))
  return g
}

/** 杯面整箱（12 杯，打开） */
function noodleCase(p: string[]) {
  const [card, lidC, band] = p
  const g = new THREE.Group()
  g.add(tray(40, 11, 30, 0.5, card, {}, 0.2))
  g.add(noOutlineDeep(rbox(16, 5, 0.3, lidC, { y: 3, z: 15.05 }, 0.5)))
  for (const s of [-1, 1]) {
    const f = rbox(40, 0.4, 9, card, {}, 0.1)
    f.position.set(0, 11 + Math.sin(0.9) * 4.5, s * (15 + Math.cos(0.9) * 4.5))
    f.rotation.x = -s * 0.9
    g.add(f)
  }
  for (let i = 0; i < 12; i++) {
    const x = -14.4 + (i % 4) * 9.6
    const z = -9.6 + Math.floor(i / 4) * 9.6
    g.add(cup(4.6, 3.5, 10.5, 0.3, C.white, { x, y: 0.5, z }))
    g.add(noOutlineDeep(cup(4.62, 4.1, 3.4, 0.05, band, { x, y: 5.6, z })))
    g.add(cyl(4.7, 4.7, 0.3, lidC, { x, y: 11, z }, 24))
  }
  return g
}

// ---------- 零食 / 甜点 ----------

/** 糖果罐（玻璃罐装彩色糖球） */
function candyJar(p: string[]) {
  const [lid, a, b] = p
  const g = new THREE.Group()
  g.add(glassGhost(lathe([[0, 0], [5.8, 0], [6.2, 1], [6.4, 10], [5.2, 13], [4.6, 14], [0, 14]], GLASS), GLASS, 0.3))
  const cols = [a, b, '#ffd84d', '#7ed37a', '#ff8a5c', C.white]
  const r = rng(21)
  for (let i = 0; i < 26; i++) {
    const layer = Math.floor(i / 7)
    const ang = r() * PI * 2
    const d = r() * 4
    g.add(ball(1.1, cols[i % cols.length], { x: Math.cos(ang) * d, y: 1.4 + layer * 1.9 + r() * 0.4, z: Math.sin(ang) * d }))
  }
  g.add(puck(5, 1.6, lid, { y: 14 }))
  g.add(ball(1.2, lid, { y: 16.2 }))
  return g
}

/** 曲奇铁盒：open 盖子立在后面 / closed 盖着 */
function cookieTin(p: string[], open: boolean) {
  const [tin, band, acc] = p
  const g = new THREE.Group()
  g.add(cup(10, 10, 6.5, 0.3, tin))
  g.add(noOutlineDeep(cup(10.03, 10.03, 1.2, 0.05, band, { y: 2.6 })))
  if (!open) {
    g.add(puck(10.3, 2, tin, { y: 5.6 }))
    g.add(noOutlineDeep(cyl(6, 6, 0.2, band, { y: 7.6 }, 28)))
    g.add(noOutlineDeep(cyl(3, 3, 0.25, acc, { y: 7.6 }, 20)))
    return g
  }
  const pos: [number, number][] = [[0, 0], ...Array.from({ length: 6 }, (_, i): [number, number] => [Math.cos((i / 6) * PI * 2) * 5.6, Math.sin((i / 6) * PI * 2) * 5.6])]
  pos.forEach(([x, z], i) => {
    g.add(cup(2.5, 2.1, 1.8, 0.1, '#f4ece0', { x, y: 0.3, z }))
    g.add(puck(2.1, 1.2, i % 3 === 0 ? CHOCO : i % 3 === 1 ? '#e8b468' : '#d99a55', { x, y: 1.4, z }))
  })
  const l = G(puck(10.3, 2, tin), noOutlineDeep(cyl(6, 6, 0.2, band, { y: 2 }, 28)))
  l.rotation.x = PI / 2 - 0.15
  l.position.set(0, 10.3, -11.4)
  g.add(l)
  return g
}

/** 巧克力（三板叠放 + 一板拆开） */
function chocolate(p: string[]) {
  const [a, b, foil] = p
  const g = new THREE.Group()
  const cols = [a, b, a]
  for (let i = 0; i < 3; i++) {
    g.add(rbox(16, 1, 8, cols[i], { y: i * 1.02, ry: (i - 1) * 0.08 }, 0.3))
    g.add(noOutlineDeep(rbox(5, 0.1, 8.1, shade(cols[i], 0.25), { y: i * 1.02 + 0.3, ry: (i - 1) * 0.08 }, 0.02)))
  }
  g.add(rbox(16, 0.3, 8, foil, { x: 2, z: 10, ry: -0.1 }, 0.1))
  const bar = new THREE.Group()
  for (let i = 0; i < 5; i++) for (let k = 0; k < 2; k++) bar.add(rbox(2.6, 0.8, 3.4, CHOCO, { x: -5.6 + i * 2.8, z: -1.8 + k * 3.6 }, 0.3))
  bar.position.set(1, 0.3, 10)
  bar.rotation.y = -0.1
  g.add(bar)
  return g
}

/** 薯片：bag 大袋（立放） / tube 筒装；每组配色是一种口味 */
function chips(p: string[], kind: 'bag' | 'tube') {
  const [body, band, acc] = p
  const g = new THREE.Group()
  if (kind === 'tube') {
    g.add(cyl(3.8, 3.8, 23, body, {}, 24))
    g.add(noOutlineDeep(cyl(3.83, 3.83, 7, band, { y: 8 }, 24)))
    g.add(noOutlineDeep(ball(1.8, acc, { y: 11.5, z: 3.7 }, [1, 1, 0.12])))
    g.add(puck(4, 1.4, '#f4f4f4', { y: 22.4 }))
    return g
  }
  g.add(rbox(18, 23, 5.4, body, { y: 1.2 }, 2.4))
  for (const y of [0.2, 23.6]) g.add(rbox(17.6, 1.6, 1.2, shade(body, -0.1), { y }, 0.3))
  g.add(noOutlineDeep(rbox(14, 5, 0.2, band, { y: 15, z: 2.72 }, 1)))
  for (let i = 0; i < 3; i++) g.add(noOutlineDeep(ball(2, acc, { x: -4 + i * 4, y: 8 + (i % 2), z: 2.6 }, [1, 0.8, 0.12])))
  return g
}

/** 冰淇淋杯两个（一个开着插木勺） */
function iceCream(p: string[]) {
  const [cupC, ice, lid] = p
  const g = new THREE.Group()
  g.add(cup(4.2, 3.4, 5, 0.25, cupC, { x: -5 }))
  g.add(noOutlineDeep(cyl(3.9, 3.9, 0.3, ice, { x: -5, y: 4.4 }, 24)))
  g.add(dome(3.4, 1.6, ice, { x: -5, y: 4.6 }))
  g.add(PG(rbox(1.2, 0.3, 6, C.woodL, {}, 0.15), -4, 6.4, 1.5, 0.7, 0.3))
  g.add(cup(4.2, 3.4, 5, 0.25, cupC, { x: 5 }))
  g.add(puck(4.4, 1, lid, { x: 5, y: 4.7 }))
  return g
}

/** 便利店布丁三连杯 */
function pudding3(p: string[]) {
  const [cupC, lid, caramel] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 7.4
    g.add(glassGhost(cup(3.6, 2.6, 6.4, 0.25, cupC, { x }), cupC, 0.45))
    g.add(noOutlineDeep(cyl(3.3, 2.4, 5.4, '#f6d675', { x, y: 0.3 }, 20)))
    g.add(noOutlineDeep(cyl(2.45, 2.4, 0.8, caramel, { x, y: 0.3 }, 20)))
  }
  g.add(rbox(22.4, 0.3, 7.6, lid, { y: 6.4 }, 0.1))
  return g
}

/** 团子三串（长盘上） */
function dango(p: string[]) {
  const [plateC, , acc] = p
  const g = new THREE.Group()
  g.add(rbox(20, 1, 10, plateC, {}, 0.4))
  const sets: [number, string[]][] = [
    [-3, ['#ffb6c8', '#fffaf0', '#9ccf7a']],
    [0, ['#c98a3c', '#c98a3c', '#c98a3c']],
    [3, ['#8a4a5a', '#8a4a5a', '#8a4a5a']],
  ]
  for (const [z, cs] of sets) {
    g.add(hcyl(0.2, 0.2, 17, C.woodL, 0, 2.4, z, 'x', 6))
    cs.forEach((c, i) => g.add(ball(1.4, c, { x: -3.2 + i * 2.8, y: 2.4, z })))
  }
  g.add(noOutlineDeep(ball(0.6, acc, { x: 7, y: 1.3, z: 3.5 }, [1, 0.3, 1])))
  return g
}

/** 铜锣烧两个（一平放、一斜靠） */
function dorayaki(p: string[]) {
  const [plateC] = p
  const g = new THREE.Group()
  g.add(dish(9, 1.4, plateC))
  const one = (x: number, y: number, z: number, rz: number) => {
    const d = new THREE.Group()
    d.add(puck(4.2, 1.6, '#b8742a', { y: 0 }))
    d.add(noOutlineDeep(puck(3.8, 0.8, '#5a2e2a', { y: 1.4 })))
    d.add(puck(4.2, 1.6, '#b8742a', { y: 2 }))
    d.position.set(x, y, z)
    d.rotation.z = rz
    g.add(d)
  }
  one(-1.5, DISH_IN, 0.5, 0)
  one(2.6, DISH_IN + 1.2, -1.2, 0.35)
  return g
}

/** 大福三个（怀纸 + 盘） */
function daifuku(p: string[]) {
  const [plateC, paper] = p
  const g = new THREE.Group()
  g.add(rbox(18, 1, 12, plateC, {}, 0.5))
  g.add(noOutlineDeep(rbox(14, 0.1, 9, paper, { y: 1, ry: 0.15 }, 0.02)))
  for (const [x, c, ex] of [
    [-4.6, '#fffaf0', null],
    [0, '#ffd6e0', '#e8495a'],
    [4.6, '#c8dfa8', null],
  ] as const) {
    g.add(ball(2.6, c, { x, y: 1.1 + 1.9, z: 0 }, [1, 0.72, 1]))
    if (ex) g.add(noOutlineDeep(ball(0.9, ex, { x, y: 1.1 + 3.6, z: 0.3 }, [1, 0.6, 1])))
  }
  return g
}

/** 水果篮（藤编椭圆篮：苹果、橘子、香蕉、葡萄） */
function fruitBasket(p: string[]) {
  const [basket, rim] = p
  const g = new THREE.Group()
  const b = cup(14, 11, 9, 0.8, basket)
  b.scale.z = 0.7
  g.add(b)
  const t = torus(13.8, 0.6, rim, { y: 9, rx: PI / 2 })
  t.scale.y = 0.7
  g.add(t)
  g.add(cappedTube(arc([0, 9, 0], 12.5, 0, PI, 16, 'xy'), 0.6, rim, { ...TUBE, seg: 32 }))
  g.add(ball(3.6, '#e0453a', { x: -6, y: 8, z: -1.5 }, [1, 0.92, 1]))
  g.add(ball(3.2, '#ff9a2a', { x: 0, y: 8.5, z: 2.5 }, [1, 0.9, 1]))
  g.add(ball(3.2, '#ff9a2a', { x: -1.5, y: 8.6, z: -3.5 }, [1, 0.9, 1]))
  for (let i = 0; i < 3; i++) g.add(cappedTube(arc([5, 4, 0], 6.5, PI * 0.55, PI * 0.95, 6, 'xy').map(([x, y]): V3 => [x + 3, y + 3.5, -2 + i * 2]), 1.3, '#ffd84d', { ...TUBE, seg: 12 }))
  for (let i = 0; i < 9; i++) g.add(ball(1.1, '#5a3a7a', { x: 6 + (i % 3) * 1.6 - 1, y: 9.5 - Math.floor(i / 3) * 1.3, z: 3 + (i % 2) }))
  return g
}

/** 买菜环保袋（装着葱、胡萝卜、卷心菜） */
function vegBag(p: string[]) {
  const [bag, handle, print] = p
  const g = new THREE.Group()
  g.add(tray(34, 28, 14, 0.4, bag, {}, 1.5))
  g.add(noOutlineDeep(rbox(10, 10, 0.2, print, { y: 10, z: 7.1 }, 2)))
  for (const s of [-1, 1]) g.add(cappedTube([[-7, 27.5, s * 6.8], [-6, 38, s * 6], [6, 38, s * 6], [7, 27.5, s * 6.8]], 0.8, handle, { ...TUBE, seg: 24 }))
  g.add(ball(7, '#a6d47a', { x: 7, y: 24, z: 0 }, [1, 0.9, 0.85]))
  g.add(ball(6.5, '#cbe8a0', { x: 7, y: 24.8, z: 0.4 }, [1, 0.85, 0.8]))
  for (let i = 0; i < 3; i++) {
    g.add(rod3([-9 + i * 1.8, 6, -2 + i], [-11 + i * 1.8, 34, -3 + i], 1, '#f4f4e6', 8))
    g.add(rod3([-11 + i * 1.8, 34, -3 + i], [-12.5 + i * 2.2, 50, -3.5 + i], 0.85, NEGI, 8))
  }
  for (let i = 0; i < 2; i++) {
    const c = cyl(1.4, 0.3, 16, '#f08a3c', {}, 10)
    c.position.set(-1 + i * 2.8, 18, 3)
    c.rotation.z = PI + 0.15 - i * 0.3
    g.add(c)
  }
  return g
}

// ---------- 配色 ----------

// 罐装饮料：[罐身, 标签色带, 点缀]，每组是一种口味（不写品牌）
const CAN_FLAVOR_PALS: Pal3[] = [
  ['retro', '#d6343a', '#f4f4f4', '#d6343a'], // 可乐
  ['japanese', '#3f8a4a', '#e9e2d0', '#3f8a4a'], // 绿茶
  ['industrial', '#5a3a2a', '#d9b98c', '#3a2a22'], // 咖啡
  ['modern', '#dfe6ec', '#4a9ad8', '#c3c7cc'], // 碳酸水
  ['cute', '#1f2a3a', '#a6f03c', '#a6f03c'], // 能量饮料
]
const GLASS_BOTTLE_PALS: Pal3[] = [
  ['retro', R.cream, R.red, '#f5e6a8'],
  ['modern', M.white, M.char, '#f2a03c'],
  ['nordic', N.linen, N.sage, '#f5d58a'],
  ['cute', C.sakura, C.pink, '#ff9db0'],
  ['japanese', J.washi, J.ai, '#e8c24a'],
]
// 宝特瓶：[饮料色, 标签色带, 瓶盖]
const PET_FLAVOR_PALS: Pal3[] = [
  ['japanese', '#b7c96a', '#3f8a4a', '#3f8a4a'], // 绿茶
  ['modern', '#e8f4fb', '#3a7ac8', '#3a7ac8'], // 运动饮料
  ['retro', '#f2a03c', R.orange, R.red], // 橙汁
  ['cute', '#ffc8d6', C.pink, C.white], // 桃子水
  ['nordic', '#d8a35c', N.oak, N.white], // 麦茶
]
// 矿泉水：[标签色带, 瓶盖, —]
const WATERB_PALS: Pal3[] = [
  ['modern', '#3a7ac8', '#3a7ac8', '#3a7ac8'],
  ['nordic', N.blue, N.white, N.white],
  ['japanese', J.ai, J.washi, J.washi],
  ['cute', C.sky, C.pink, C.pink],
]
const WATER_CASE24_PALS: Pal3[] = [
  ['modern', '#3a7ac8', '#e8f4fb', CARD],
  ['nordic', N.blue, N.white, CARD],
  ['japanese', J.ai, J.washi, CARD],
  ['cute', C.sky, C.pink, CARD],
]
const TETRA_PALS: Pal3[] = [
  ['nordic', N.white, N.sage, '#d9b98c'],
  ['modern', M.white, M.char, '#4a9ad8'],
  ['retro', R.cream, R.orange, R.red],
  ['cute', C.white, C.pink, C.lemon],
]
const YOGURT_PALS: Pal3[] = [
  ['modern', M.white, '#4a7fc0', '#4a7fc0'],
  ['cute', C.white, C.pink, C.pink],
  ['nordic', N.white, N.sage, N.linen],
  ['retro', R.cream, R.red, R.mustard],
]
const FRIDGE_POT_PALS: Pal3[] = [
  ['modern', M.white, '#d8a35c', M.char],
  ['nordic', N.sage, WATER, N.white],
  ['cute', C.pink, '#d8a35c', C.white],
  ['japanese', J.ai, TEA, J.washi],
]
const SERVER_PALS: Pal3[] = [
  ['modern', M.white, M.char, M.light],
  ['industrial', M.black, I.iron, I.steel],
  ['nordic', N.white, N.oak, N.linen],
  ['cute', C.white, C.sky, C.mint],
  ['retro', R.cream, R.teal, R.cream],
]
const PIZZA_PALS: Pal3[] = [
  ['retro', '#f4ecd8', R.red, R.mustard],
  ['industrial', KRAFT, I.iron, I.rust],
  ['modern', M.white, M.black, '#d8442e'],
  ['cute', C.white, C.pink, C.lemon],
]
const TAKEOUT_PALS: Pal3[] = [
  ['retro', M.white, R.red, STEEL],
  ['modern', M.white, M.black, STEEL],
  ['industrial', KRAFT, I.iron, STEEL],
  ['cute', C.white, C.pink, STEEL],
]
const TAKEOUT_BENTO_PALS: Pal3[] = [
  ['modern', M.black, '#f2c94c', '#4f9e3b'],
  ['japanese', J.shu, J.washi, '#4f9e3b'],
  ['industrial', I.iron, '#e8dcc4', '#4f9e3b'],
  ['cute', C.pink, C.white, '#4f9e3b'],
]
const SANDWICH_PALS: Pal3[] = [
  ['modern', '#eaf4fb', '#3a7ac8', EGG_Y],
  ['retro', '#eaf4fb', R.red, '#f4b8c0'],
  ['cute', '#fff0f4', C.pink, '#ffd75e'],
  ['nordic', '#f4f6f0', N.sage, '#e8b468'],
]
const NATTO_PALS: Pal3[] = [
  ['japanese', M.white, J.shu, J.ai],
  ['retro', '#f4ecd8', R.red, R.mustard],
  ['modern', M.white, M.black, '#3a7ac8'],
]
const TOFU_PALS: Pal3[] = [
  ['japanese', M.white, J.ai, J.shu],
  ['modern', M.white, M.char, '#3a7ac8'],
  ['nordic', '#eef1ea', N.sage, N.oak],
]
const NOODLE_CASE_PALS: Pal3[] = [
  ['retro', CARD, R.red, R.red],
  ['modern', CARD, M.black, M.char],
  ['cute', CARD, C.pink, C.pink],
]
const CANDY_PALS: Pal3[] = [
  ['cute', C.pink, '#ff5a8a', '#6ac4f0'],
  ['retro', R.red, R.orange, R.teal],
  ['nordic', N.oak, '#f2a0a0', '#9fc8e8'],
  ['modern', M.silver, '#e8495a', '#4a9ad8'],
]
const TIN_PALS: Pal3[] = [
  ['retro', '#2f5a8a', R.cream, R.red],
  ['nordic', N.blue, N.white, N.mustard],
  ['cute', C.pink, C.white, C.mint],
  ['industrial', I.iron, I.rust, '#d4a64a'],
]
const CHOCO_PALS: Pal3[] = [
  ['retro', R.red, R.caramel, '#d4d4d4'],
  ['modern', M.black, M.white, '#d4d4d4'],
  ['cute', C.pink, C.lilac, '#e8d4a0'],
  ['nordic', N.blue, N.mustard, '#d4d4d4'],
]
// 薯片：每组一种口味
const CHIPS_PALS: Pal3[] = [
  ['retro', '#f2c94c', R.red, '#e8b468'], // 原味
  ['cute', '#9fd36a', C.white, '#e8b468'], // 海苔盐
  ['modern', '#3a5fb8', M.white, '#e8b468'], // 淡盐
  ['industrial', '#c8473a', I.iron, '#d99a55'], // 烧烤
  ['nordic', '#e8a640', N.white, '#e8b468'], // 黄油酱油
]
const ICE_PALS: Pal3[] = [
  ['retro', R.cream, '#fff6e0', R.red],
  ['cute', C.white, '#ffc8d6', C.pink],
  ['modern', M.white, '#a8683a', M.black],
  ['japanese', J.washi, '#b7c96a', J.ai],
]
const PUDDING_PALS: Pal3[] = [
  ['retro', '#fff8e0', R.red, '#8a4a1a'],
  ['cute', '#fff0f4', C.pink, '#8a4a1a'],
  ['modern', '#ffffff', M.char, '#6a3a1a'],
]
const WAGASHI_PALS: Pal3[] = [
  ['japanese', J.washi, J.washi, J.shu],
  ['japanese', J.sumi, '#f6e8d4', J.shu],
  ['nordic', N.white, N.linen, N.sage],
  ['modern', M.black, M.white, M.white],
  ['cute', C.sakura, C.white, C.pink],
]
const BASKET_PALS: Pal3[] = [
  ['nordic', '#d9c8a4', N.oak, N.oak],
  ['japanese', '#c9a568', '#a8813e', J.wood],
  ['industrial', '#8a6a4a', I.walnut, I.walnut],
  ['cute', '#f0d8b0', C.pink, C.pink],
]
const ECO_PALS: Pal3[] = [
  ['nordic', N.linen, N.oak, N.sage],
  ['modern', M.char, M.black, M.white],
  ['japanese', J.ai, J.sumi, J.washi],
  ['cute', C.sakura, C.pink, C.white],
  ['retro', R.mustard, R.caramel, R.teal],
]

export const KITCHEN_DRINKS_SNACKS: AssetDef[] = [
  // ---------- 罐装饮料 ----------
  def({ id: 'kf-can', name: '罐装饮料', family: 'kf-can', sizeLabel: '单罐 350ml', category: 'tabletop', w: 6.6, d: 6.6, h: 12.4, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'single') }),
  def({ id: 'kf-can-short', name: '罐装饮料', family: 'kf-can', sizeLabel: '咖啡短罐 190ml', category: 'tabletop', w: 5.3, d: 5.3, h: 10.6, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'short') }),
  def({ id: 'kf-can-slim', name: '罐装饮料', family: 'kf-can', sizeLabel: '细长罐 250ml', category: 'tabletop', w: 5.3, d: 5.3, h: 13.6, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'slim') }),
  def({ id: 'kf-can-6', name: '罐装饮料', family: 'kf-can', sizeLabel: '6 联包', category: 'tabletop', w: 20.4, d: 13.6, h: 12.4, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'six') }),
  def({ id: 'kf-can-case', name: '罐装饮料', family: 'kf-can', sizeLabel: '24 罐整箱', form: 'boxed', category: 'tabletop', w: 41.6, d: 28.4, h: 12.8, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'case') }),
  // ---------- 玻璃瓶 ----------
  def({ id: 'kf-bottle-soda', name: '玻璃瓶饮料', family: 'kf-glass-bottle', sizeLabel: '汽水瓶', category: 'tabletop', w: 5.8, d: 5.8, h: 19.3, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'soda') }),
  def({ id: 'kf-bottle-milk', name: '玻璃瓶饮料', family: 'kf-glass-bottle', sizeLabel: '牛奶瓶', category: 'tabletop', w: 6.4, d: 6.4, h: 12.9, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'milk') }),
  def({ id: 'kf-bottle-juice', name: '玻璃瓶饮料', family: 'kf-glass-bottle', sizeLabel: '果汁瓶', category: 'tabletop', w: 6.7, d: 6.7, h: 16.2, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'juice') }),
  def({ id: 'kf-bottle-beer', name: '玻璃瓶饮料', family: 'kf-glass-bottle', sizeLabel: '精酿啤酒', category: 'tabletop', w: 6.3, d: 6.3, h: 21.5, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'beer') }),
  def({ id: 'kf-bottle-sparkling', name: '玻璃瓶饮料', family: 'kf-glass-bottle', sizeLabel: '气泡水', category: 'tabletop', w: 7.9, d: 7.9, h: 28.6, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'sparkling') }),
  // ---------- 宝特瓶 / 纸盒 / 酸奶 ----------
  def({ id: 'kf-pet-500', name: '宝特瓶饮料', family: 'kf-pet', sizeLabel: '500ml', category: 'tabletop', w: 6.7, d: 6.7, h: 21, pals: PET_FLAVOR_PALS, build: (p) => petBottle(p, false) }),
  def({ id: 'kf-pet-2l', name: '宝特瓶饮料', family: 'kf-pet', sizeLabel: '2L', category: 'tabletop', w: 9.7, d: 9.7, h: 33, pals: PET_FLAVOR_PALS, build: (p) => petBottle(p, true) }),
  def({ id: 'kf-tetra-1l', name: '纸盒饮料', family: 'kf-tetra', sizeLabel: '豆乳 1L', category: 'tabletop', w: 7.6, d: 7.6, h: 20.7, pals: TETRA_PALS, build: (p) => tetra(p, 'soy1l') }),
  def({ id: 'kf-tetra-200', name: '纸盒饮料', family: 'kf-tetra', sizeLabel: '豆乳 200ml', category: 'tabletop', w: 7.8, d: 4.6, h: 10.5, pals: TETRA_PALS, build: (p) => tetra(p, 'soy200') }),
  def({ id: 'kf-tetra-125', name: '纸盒饮料', family: 'kf-tetra', sizeLabel: '果汁小盒（插吸管）', category: 'tabletop', w: 6.4, d: 4.2, h: 13.3, pals: TETRA_PALS, build: (p) => tetra(p, 'juice125') }),
  def({ id: 'kf-yogurt-tub', name: '酸奶', family: 'kf-yogurt', sizeLabel: '400g 大盒', category: 'tabletop', w: 11.6, d: 11.6, h: 9.6, pals: YOGURT_PALS, build: (p) => yogurt(p, 'tub') }),
  def({ id: 'kf-yogurt-4', name: '酸奶', family: 'kf-yogurt', sizeLabel: '四连杯', category: 'tabletop', w: 14.6, d: 14.6, h: 6.3, pals: YOGURT_PALS, build: (p) => yogurt(p, 'four') }),
  // ---------- 矿泉水 / 饮水 ----------
  def({ id: 'kf-water-500', name: '矿泉水', family: 'kf-water', sizeLabel: '500ml', category: 'tabletop', w: 6.7, d: 6.7, h: 21, pals: WATERB_PALS, build: (p) => waterBottle(p, false) }),
  def({ id: 'kf-water-2l', name: '矿泉水', family: 'kf-water', sizeLabel: '2L', category: 'tabletop', w: 9.7, d: 9.7, h: 33, pals: WATERB_PALS, build: (p) => waterBottle(p, true) }),
  def({ id: 'kf-water-case-24', name: '矿泉水整箱', family: 'kf-water-case', sizeLabel: '500ml×24', form: 'boxed', w: 41.6, d: 28.4, h: 21.4, pals: WATER_CASE24_PALS, build: (p) => G(sealedCase(41, 21.4, 27.4, p[0], p[1])) }),
  def({ id: 'kf-fridge-pot', name: '冰箱冷水壶 2L', category: 'tabletop', w: 16, d: 12.1, h: 27.6, pals: FRIDGE_POT_PALS, build: fridgePot }),
  def({ id: 'kf-water-server-top', name: '饮水机（大桶）', family: 'kf-water-server', sizeLabel: '上置水桶', category: 'appliance', prop: false, w: 30, d: 41, h: 139.5, pals: SERVER_PALS, build: (p) => waterServer(p, true) }),
  def({ id: 'kf-water-server-bottom', name: '饮水机（大桶）', family: 'kf-water-server', sizeLabel: '下置水桶', category: 'appliance', prop: false, w: 30, d: 41, h: 112, pals: SERVER_PALS, build: (p) => waterServer(p, false) }),
  def({ id: 'kf-water-server-desk', name: '饮水机（大桶）', family: 'kf-water-server', sizeLabel: '台式小型', category: 'appliance', w: 24, d: 35, h: 53.2, pals: SERVER_PALS, build: deskServer }),
  // ---------- 外卖 / 便利店 / 日配 ----------
  def({ id: 'kf-pizza-open', name: '披萨盒', family: 'kf-pizza', form: 'open', category: 'tabletop', w: 33, d: 34.2, h: 33.4, pals: PIZZA_PALS, build: (p) => pizzaBox(p, true) }),
  def({ id: 'kf-pizza-closed', name: '披萨盒', family: 'kf-pizza', form: 'closed', category: 'tabletop', w: 33, d: 33, h: 4.6, pals: PIZZA_PALS, build: (p) => pizzaBox(p, false) }),
  def({ id: 'kf-takeout-chinese', name: '外卖盒', family: 'kf-takeout', sizeLabel: '中华餐盒', category: 'tabletop', w: 20, d: 15.7, h: 16.2, pals: TAKEOUT_PALS, build: chineseTakeout }),
  def({ id: 'kf-takeout-bento', name: '外卖盒', family: 'kf-takeout', sizeLabel: '外卖便当', category: 'tabletop', w: 22.4, d: 17.4, h: 7, pals: TAKEOUT_BENTO_PALS, build: takeoutBento }),
  def({ id: 'kf-sandwich', name: '便利店三明治', category: 'tabletop', w: 14.4, d: 8.4, h: 12, pals: SANDWICH_PALS, build: sandwichPack }),
  def({ id: 'kf-natto', name: '纳豆三连盒', category: 'tabletop', w: 9.7, d: 7.8, h: 10.8, pals: NATTO_PALS, build: natto }),
  def({ id: 'kf-tofu', name: '盒装豆腐', category: 'tabletop', w: 11.8, d: 8.8, h: 4.6, pals: TOFU_PALS, build: tofuPack }),
  def({ id: 'kf-noodle-case', name: '杯面整箱', w: 40, d: 41.4, h: 18.1, pals: NOODLE_CASE_PALS, build: noodleCase }),
  // ---------- 零食 / 甜点 ----------
  def({ id: 'kf-candy-jar', name: '糖果罐', category: 'tabletop', w: 12.8, d: 12.8, h: 17.4, pals: CANDY_PALS, build: candyJar }),
  def({ id: 'kf-cookie-tin', name: '曲奇铁盒', family: 'kf-cookie-tin', form: 'closed', category: 'tabletop', w: 20.6, d: 20.6, h: 7.8, pals: TIN_PALS, build: (p) => cookieTin(p, false) }),
  def({ id: 'kf-cookie-tin-open', name: '曲奇铁盒', family: 'kf-cookie-tin', form: 'open', category: 'tabletop', w: 20.6, d: 22.8, h: 20.6, pals: TIN_PALS, build: (p) => cookieTin(p, true) }),
  def({ id: 'kf-chocolate', name: '巧克力', category: 'tabletop', w: 18.6, d: 19.4, h: 3, pals: CHOCO_PALS, build: chocolate }),
  def({ id: 'kf-chips-bag', name: '薯片', family: 'kf-chips', sizeLabel: '袋装', category: 'tabletop', w: 18, d: 5.4, h: 25.2, pals: CHIPS_PALS, build: (p) => chips(p, 'bag') }),
  def({ id: 'kf-chips-tube', name: '薯片', family: 'kf-chips', sizeLabel: '筒装', category: 'tabletop', w: 8, d: 8, h: 23.8, pals: CHIPS_PALS, build: (p) => chips(p, 'tube') }),
  def({ id: 'kf-ice-cream', name: '冰淇淋杯', category: 'tabletop', w: 18.4, d: 8.8, h: 8.5, pals: ICE_PALS, build: iceCream }),
  def({ id: 'kf-pudding-3', name: '布丁三连杯', category: 'tabletop', w: 22.4, d: 7.6, h: 6.7, pals: PUDDING_PALS, build: pudding3 }),
  def({ id: 'kf-dango', name: '日式点心', family: 'kf-wagashi', sizeLabel: '团子', category: 'tabletop', w: 20, d: 10, h: 3.8, pals: WAGASHI_PALS, build: dango }),
  def({ id: 'kf-dorayaki', name: '日式点心', family: 'kf-wagashi', sizeLabel: '铜锣烧', category: 'tabletop', w: 18, d: 18, h: 6.5, pals: WAGASHI_PALS, build: dorayaki }),
  def({ id: 'kf-daifuku', name: '日式点心', family: 'kf-wagashi', sizeLabel: '大福', category: 'tabletop', w: 18, d: 12, h: 5, pals: WAGASHI_PALS, build: daifuku }),
  def({ id: 'kf-fruit-basket', name: '水果篮', category: 'tabletop', w: 29, d: 20, h: 22, pals: BASKET_PALS, build: fruitBasket }),
  def({ id: 'kf-veg-bag', name: '买菜环保袋', w: 34, d: 16.2, h: 50, pals: ECO_PALS, build: vegBag }),
]
