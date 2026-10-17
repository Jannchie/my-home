// 素材包的定义工具（唯一实现）：配色组展开 pal()、素材定义 define() / definer()、各风格色板简写，
// 以及开发期断言（声明的 surface / surfaceShape / mount / screens 要和模型对得上）。
// 依赖方向：toon → geo → kit → packkit → packs。
import * as THREE from 'three'
import { S, type AssetCategory, type AssetDef, type Poly, type ScreenPanel, type StyleTag } from './kit'

// ---------- 色板简写 ----------

export const N = S.nordic
export const M = S.modern
export const J = S.japanese
export const I = S.industrial
export const R = S.retro
export const CN = S.chinese
export const CL = S.classic
export const F = S.farmhouse

/** 桌面摆件：展开进 extra（{ ...PROP, ... }） */
export const PROP: Partial<AssetDef> = { prop: true }

// ---------- 类型 ----------

export type Build = (p: string[]) => THREE.Group
/** 占地 [w, d, h]，cm */
export type Dims = [number, number, number]
/** 配色组（嵌套写法）：[风格, [主色, 副色, …]] */
export type Pal = [StyleTag, string[]]
/** 配色组（平铺写法）：[风格, 主色, 副色, …] */
export type PalFlat = [StyleTag, ...string[]]
/** 固定三色的平铺配色组 */
export type Pal3 = [StyleTag, string, string, string]

// ---------- 配色组 ----------

/** 一组配色的颜色：嵌套写法取第二项，平铺写法取风格之后的全部 */
const colorsOf = (x: Pal | PalFlat): string[] => (Array.isArray(x[1]) ? (x[1] as string[]) : (x.slice(1) as string[]))

/** 带风格标注的配色组 → palettes / paletteStyles / styles（styles 按出现顺序去重） */
export function pal(...xs: (Pal | PalFlat)[]) {
  return { palettes: xs.map(colorsOf), paletteStyles: xs.map((x) => x[0]), styles: [...new Set(xs.map((x) => x[0]))] }
}

// ---------- 定义 ----------

/** 一条素材定义：基本字段 + 配色展开，extra 覆盖在最后 */
export function define(id: string, name: string, category: AssetCategory, [w, d, h]: Dims, pals: (Pal | PalFlat)[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  const def: AssetDef = { id, name, category, w, d, h, ...pal(...pals), build, ...extra }
  if (import.meta.env.DEV) warnStatic(def)
  return def
}

/**
 * 带包内默认值的 define：defaults 放在 extra 之前（extra 可以覆盖），wrap 可以包一层 build（对齐包围盒等）。
 * 例：const def = definer({ prop: true }, (b) => (p) => fitGroup(b(p)))
 */
export function definer(defaults: Partial<AssetDef> = {}, wrap?: (build: Build, extra: Partial<AssetDef>) => Build) {
  return (id: string, name: string, category: AssetCategory, dims: Dims, pals: (Pal | PalFlat)[], build: Build, extra: Partial<AssetDef> = {}): AssetDef =>
    define(id, name, category, dims, pals, wrap ? wrap(build, extra) : build, { ...defaults, ...extra })
}

// ---------- 开发期断言 ----------

const EPS = 0.05

/**
 * 只看声明数据的检查：surface ≤ 顶面（壁挂件的 surface 从地面量起，所以是 mount + h）；
 * surfaceShape 在 w × d 以内（挂起 / 贴附形态的原点不在占地中心，不查）。
 */
export function staticProblems(def: AssetDef): string[] {
  const out: string[] = []
  const top = (def.mount ?? 0) + def.h
  if (def.surface !== undefined && def.surface > top + EPS) out.push(`surface ${def.surface} 高于顶面 ${top}`)
  const inside = (poly: Poly) => poly.every(([x, z]) => Math.abs(x) <= def.w / 2 + EPS && Math.abs(z) <= def.d / 2 + EPS)
  if (def.form !== 'hanging' && !def.stick && def.surfaceShape?.some((p) => !inside(p))) out.push(`surfaceShape 超出 ${def.w}×${def.d}`)
  return out
}

function warnStatic(def: AssetDef) {
  const p = staticProblems(def)
  if (p.length) console.warn(`[packkit] ${def.id}: ${p.join('；')}`)
}

/**
 * mount 的容差（cm）：壁挂件最低点不能比声明的安装高度低 1cm 以上（会和下面的家具穿模），
 * 也不能高出 5cm 以上（挂轴的挂绳、吊篮的吊链之类让模型底边比安装点略高是正常的）。
 */
export const MOUNT_TOL_BELOW = 1
export const MOUNT_TOL_ABOVE = 5

/**
 * 要建模的检查：
 *   mount：壁挂件模型最低点 ≈ mount；
 *   screens：屏幕面板顶边中点正下方一点（沿面板厚度中心）必须落在某个网格的包围盒里，且那个网格的顶面和顶边齐平
 *   （面板坐标没跟着模型平移时，夹式摄像头、便签会悬空）。
 */
export function modelProblems(def: AssetDef, root: THREE.Object3D): string[] {
  const out: string[] = []
  root.updateMatrixWorld(true)
  const boxes: THREE.Box3[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.isOutline) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    boxes.push(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld))
  })
  if (def.mount !== undefined && def.form !== 'hanging' && !def.stick && boxes.length) {
    const minY = Math.min(...boxes.map((b) => b.min.y))
    if (minY < def.mount - MOUNT_TOL_BELOW || minY > def.mount + MOUNT_TOL_ABOVE) out.push(`mount ${def.mount} 与模型最低点 ${minY.toFixed(2)} 不符`)
  }
  for (const [i, s] of (def.screens ?? []).entries()) {
    const bad = screenMismatch(s, boxes)
    if (bad) out.push(`screens[${i}] ${bad}`)
  }
  return out
}

/** 屏幕面板和几何对不上的原因；对得上返回空串 */
export function screenMismatch(s: ScreenPanel, boxes: THREE.Box3[]): string {
  const top = s.y + s.h
  const probe = new THREE.Vector3(s.x, top - 0.5, s.z)
  const hits = boxes.filter((b) => b.containsPoint(probe))
  if (!hits.length) {
    // 找最近的面板状网格，报出偏差方便定位
    const near = boxes
      .filter((b) => Math.abs(b.max.y - top) < 2 && b.min.x <= s.x && b.max.x >= s.x)
      .map((b) => (b.min.z + b.max.z) / 2 - s.z)
      .sort((a, b) => Math.abs(a) - Math.abs(b))[0]
    return `顶边中点 (${s.x}, ${top}, ${s.z}) 不在任何网格里${near !== undefined ? `（最近的面板 z 偏 ${near.toFixed(2)}）` : ''}`
  }
  if (!hits.some((b) => Math.abs(b.max.y - top) <= 1)) return `顶边 ${top} 与网格顶面 ${hits.map((b) => b.max.y.toFixed(2)).join(' / ')} 不齐`
  return ''
}
