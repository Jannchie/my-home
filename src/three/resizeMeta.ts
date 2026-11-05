// 自由调整宽 / 深的数据部分（不依赖 three.js）：可调范围、派生 id 的拆合、占地和可摆放层按新尺寸换算。
// 模型的分区拉伸在 resize.ts；整体说明也见那里。

import type { AssetMeta, Poly, SurfaceDef } from './assetMeta'
import { hasTag, type Tag } from './tags'

const SEP = '@'
/** 边缘不变形的宽度（cm） */
const EDGE = 6

/** 能调宽深的：柜、架、衣架、桌 */
const RESIZABLE: Tag[] = [
  'bookshelf', 'record-shelf', 'shelving', 'display-cabinet', 'curio-cabinet', 'wardrobe', 'dresser', 'clothes-rail', 'coat-rack',
  'storage-cabinet', 'cabinet', 'shoe-storage', 'pantry', 'washer-rack', 'open-rack', 'tv-stand', 'garment-rail', 'kimono-rack',
  'nightstand', 'desk', 'workbench', 'table', 'dining-table', 'coffee-table', 'low-table', 'laundry-stand', 'towel-rail',
]
/** 带这些标签的即使也是柜 / 桌（上床下桌、猫爬架、鱼缸柜…）也不调 */
const FIXED: Tag[] = ['bed', 'loft', 'kid-bed', 'crib', 'sofa', 'light', 'aquarium', 'piano', 'cat-tower', 'set-piece']

export interface SizeRange {
  w: [number, number]
  d: [number, number]
}

/** 这件素材能调的宽深范围；不能调返回 null。传原素材（派生的会先找回原素材） */
export function resizeRange(def: AssetMeta | undefined): SizeRange | null {
  if (!def || def.prop || def.stick || def.fixture || def.actor || def.ceiling) return null
  if (!def.ownResize && (!hasTag(def, ...RESIZABLE) || hasTag(def, ...FIXED))) return null
  // 范围总是包含原尺寸（7cm 深的钥匙架不能因为下限 10 被强行加深）
  const r = (v: number, lo: number, hi: number, min: number, max: number): [number, number] => [
    Math.min(Math.round(v), Math.max(min, Math.round(v * lo))),
    Math.max(Math.round(v), Math.min(max, Math.round(v * hi))),
  ]
  return { w: r(def.w, 0.4, 2.5, 15, 400), d: r(def.d, 0.5, 2, 10, 200) }
}

/** 派生 id 拆成原素材 id 和尺寸；不是派生 id 返回 null */
export function parseResized(id: string): { base: string; w: number; d: number } | null {
  const i = id.lastIndexOf(SEP)
  if (i <= 0) return null
  const m = /^(\d+)x(\d+)$/.exec(id.slice(i + 1))
  return m ? { base: id.slice(0, i), w: +m[1], d: +m[2] } : null
}

/** 原素材 id（不是派生的就是它自己） */
export const baseAssetId = (id: string) => parseResized(id)?.base ?? id

/** 原素材按 (w, d) 派生出的 id：取整、夹到可调范围里；和原尺寸一样就是原 id */
export function resizedId(base: AssetMeta, w: number, d: number) {
  const r = resizeRange(base)
  if (!r) return base.id
  const cw = clamp(Math.round(w), r.w)
  const cd = clamp(Math.round(d), r.d)
  return cw === Math.round(base.w) && cd === Math.round(base.d) ? base.id : `${base.id}${SEP}${cw}x${cd}`
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

/**
 * 派生素材的数据部分（占地、可摆放层按新尺寸）：mx / mz 是两个方向的分区映射，完整素材（resize.ts）用它们拉伸模型。
 * 素材自己声明了 resize(w, d) 的（只有完整素材才有），由调用方再覆盖上去
 */
export function resizedMeta<T extends AssetMeta>(base: T, id: string, w: number, d: number): { out: T; mx: AxisMap; mz: AxisMap } {
  const out: T = { ...base, id, w, d, sizeLabel: `${w}×${d}` }
  const mx = axisMap(base.w, w)
  const mz = axisMap(base.d, d)
  const poly = (ps: Poly[]) => ps.map((p) => p.map(([x, z]) => [mx.at(x), mz.at(z)] as [number, number]))
  if (base.surfaceShape) out.surfaceShape = poly(base.surfaceShape)
  if (base.surfaces)
    out.surfaces = base.surfaces.map((s): SurfaceDef => ({
      ...s,
      ...(s.shape ? { shape: poly(s.shape) } : {}),
      ...(s.slide ? { slide: s.slide * mz.k } : {}),
      ...(s.slideX ? { slideX: s.slideX * mx.k } : {}),
    }))
  return { out, mx, mz }
}

/**
 * 派生 id 对应的素材（按 make 生成，结果缓存在 cache 里）；id 不合法、原素材不能调返回 undefined。
 * 读的时候不再按可调范围卡（素材尺寸校正后范围会变，存档里已经调好的家具不能因此丢掉），只拦明显不对的数
 */
export function deriveResizedWith<T extends AssetMeta>(id: string, lookup: (id: string) => T | undefined, cache: Map<string, T | null>, make: (base: T, id: string, w: number, d: number) => T): T | undefined {
  let d = cache.get(id)
  if (d === undefined) {
    d = null
    const p = parseResized(id)
    const base = p && lookup(p.base)
    const r = base && resizeRange(base)
    if (p && base && r && p.w >= 5 && p.d >= 5 && p.w <= 1000 && p.d <= 1000) d = make(base, id, p.w, p.d)
    cache.set(id, d)
  }
  return d ?? undefined
}

/** 一个方向上的分区映射：边缘 m 以内平移，中间按 k 线性拉伸；der 是某点的局部缩放（边缘 1，中间 k） */
export interface AxisMap {
  at(v: number): number
  der(v: number): number
  k: number
}
function axisMap(from: number, to: number): AxisMap {
  const h0 = from / 2
  const h1 = to / 2
  const m = Math.min(EDGE, h0 * 0.4, h1 * 0.4)
  const k = (h1 - m) / (h0 - m)
  const inMid = (v: number) => v > -h0 + m && v < h0 - m
  return {
    k,
    at: (v) => (inMid(v) ? v * k : v + Math.sign(v) * (h1 - h0)),
    der: (v) => (inMid(v) ? k : 1),
  }
}

const derivedMeta = new Map<string, AssetMeta | null>()

/** 只有元数据时（生产构建里完整素材加载前）的派生：占地、可摆放层按新尺寸换算，没有模型 */
export function deriveResizedMeta(id: string, lookup: (id: string) => AssetMeta | undefined): AssetMeta | undefined {
  return deriveResizedWith(id, lookup, derivedMeta, (base, i, w, d) => resizedMeta(base, i, w, d).out)
}
