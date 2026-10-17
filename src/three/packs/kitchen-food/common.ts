// 厨房 / 食物素材包的共用小工具和颜色常量
// 只放建模函数和它们用到的常量，素材表在 ../kitchen-food.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { cyl, rbox, toon } from '../../toon'
import { G, type AssetCategory, type AssetDef, type StyleTag } from '../../kit'
import { PI, box3, cappedTube, hcyl, latheAt, noOutlineDeep, type TubeOpts, type V3 } from '../../geo'
import { type Build, type Pal3 } from '../../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
export const TUBE: TubeOpts = { seg: { per: 6, min: 12 }, group: true }

// ---------- 固定色 ----------
export const STEEL = '#c3c7cc'
export const STEEL_D = '#9aa0a7'
export const BRASS = '#d4a64a'
export const GLASS = '#d8eef9'
export const RICE = '#fffdf6'
export const NORI = '#2f3a2e'
export const MISO = '#c8955a'
export const SOY = '#4a2a1c'
export const CURRY = '#b8742a'
export const NOODLE = '#f6e2a8'
export const BROTH = '#e9c98a'
export const EGG_Y = '#ffc93c'
export const NEGI = '#7fbf5a'
export const TOMATO = '#e8543e'
export const SALMON = '#ff9a7a'
export const TUNA = '#d8434b'
export const TAMAGO = '#ffd75e'
export const CUCUMBER = '#4f9e5b'
export const BREAD = '#f7dca6'
export const CRUST = '#c98a4f'
export const CHOCO = '#6b3f2a'
export const BEER = '#f2b632'
export const FOAM = '#fffaf0'
export const WINE_R = '#7a1f33'
export const TEA = '#b7c96a'
export const COFFEE = '#4a2c1d'
export const CARD = '#d6b48a'
export const KRAFT = '#c9a77c'
export const SHIITAKE = '#7a5236'
export const MEAT = '#d97c76'
export const TOFU = '#fbf6e8'
export const HAKUSAI = '#e9f2c9'
export const DAIKON = '#f7f4ea'
export const LEAF = '#5fae52'
export const POTATO = '#c9a26a'
export const ONION = '#c97f3c'

// ---------- 小工具 ----------

/** 半透明（玻璃、透明塑料、保鲜膜），不描边 */
export function glassGhost<T extends THREE.Object3D>(o: T, color = GLASS, k = 0.38): T {
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
export function PG<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = G(o)
  g.position.set(x, y, z)
  g.rotation.set(rx, ry, rz)
  return g
}

/** 圆弧上的点；'yz' 平面里 z = cos a、y = sin a；'xy' 平面里 x = cos a、y = sin a；'xz' 平面里 x = cos a、z = sin a */
export function arc(c: V3, r: number, a0: number, a1: number, n: number, plane: 'xy' | 'yz' | 'xz' = 'xy'): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    if (plane === 'xy') out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]])
    else if (plane === 'yz') out.push([c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r])
    else out.push([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r])
  }
  return out
}

/** 碗（真空心）：口径半径 r、高 h、壁厚 t，带圈足；at.y 为底面。返回内底高度可用 bowlIn */
export function bowl(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}, t = 0.35, footK = 0.42) {
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
  return latheAt(pts, color, at)
}
/** 碗内某个高度的内半径（盛饭、液面用）：y 为离碗底的高度 */
export function bowlIn(r: number, h: number, y: number, t = 0.35, footK = 0.42) {
  const foot = r * footK
  const fh = Math.min(0.7, h * 0.12)
  const k = Math.min(1, Math.max(0, (y - fh - t) / ((h - fh - t) * 0.98)))
  const a = Math.acos(1 - k)
  return foot - t * 0.6 + (r - t - (foot - t * 0.6)) * Math.sin(a) - 0.1
}

/** 盘子（浅、真空心）：半径 r、高 h；内底在 y = 0.7 */
export function dish(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  return latheAt(
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
export const DISH_IN = 0.7

/** 容器里的液面：薄圆片，top 为液面高度 */
export function liquid(r: number, top: number, color: string, x = 0, z = 0) {
  return noOutlineDeep(cyl(r, r, 0.3, color, { x, y: top - 0.3, z }, 28))
}

/** 半球（开口朝下），y 为底面，高 h */
export function dome(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, PI * 2, 0, PI / 2), toon(color))
  m.scale.y = h / r
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 饭堆：碗口内鼓起的米饭，y 为饭面最低处 */
export function riceMound(r: number, h: number, y: number, color = RICE, x = 0, z = 0) {
  return dome(r, h, color, { x, y, z })
}

/** 一双筷子，沿 x 平放（尖朝 +x），y 为底面 */
export function chopsticks(len: number, color: string, x: number, y: number, z: number, gap = 0.9, ry = 0) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(hcyl(0.16, 0.36, len, color, 0, 0.36, (s * gap) / 2))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

/** 筷架 */
export function hashioki(color: string, x: number, y: number, z: number, ry = 0) {
  const g = G(rbox(1.3, 0.9, 4.2, color, { y: 0 }, 0.4))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

/** 瓶子：身半径 r、总高 h、瓶颈半径 nr、肩高 sh；盖子另加。at.y 为底面 */
export function bottle(r: number, h: number, nr: number, sh: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const neck = sh + (r - nr) * 1.3
  return latheAt(
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
export function can(r: number, h: number, color: string, top = STEEL, at: { x?: number; y?: number; z?: number } = {}) {
  const g = new THREE.Group()
  g.add(cyl(r, r * 0.86, 0.8, top, { y: 0 }, 20))
  g.add(cyl(r, r, h - 1.6, color, { y: 0.8 }, 20))
  g.add(cyl(r * 0.84, r, 0.8, top, { y: h - 0.8 }, 20))
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return g
}

/** 挂起：把本体移到挂点下方（顶面 topY），本体背面不小于 z = 0.3 */
export function hangAt<T extends THREE.Object3D>(o: T, topY: number, xOff = 0): T {
  const b = box3(o)
  o.position.x += xOff - (b.min.x + b.max.x) / 2
  o.position.y += topY - b.max.y
  o.position.z += 0.3 - b.min.z
  return o
}

/** S 形钩：上环开口朝后（内顶 y ≈ -0.5），下环最低点 (0, S_LOW, S_Z) */
export const S_LOW = -6.4
const S_Z = 2.6
export function sHook(color = STEEL) {
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

export function def(o: Def): AssetDef {
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
