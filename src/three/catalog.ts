// 素材目录的查询：风格、尺寸分级、规格系列。素材库和沙盘的家具栏共用。

import { ASSETS, ASSET_MAP, type AssetDef } from './assets'
import { FORM_LABELS, type AssetCategory, type StyleTag } from './kit'
import { assetText, lang } from '../i18n'

export type SizeClass = 'S' | 'M' | 'L'
export const SIZE_LABELS: Record<SizeClass, string> = { S: '小件', M: '中件', L: '大件' }

/** 按占地最长边分级：≤ 50 小件（摆件、小物），≤ 120 中件，其余大件 */
export function sizeClass(def: AssetDef): SizeClass {
  const m = Math.max(def.w, def.d)
  return m <= 50 ? 'S' : m <= 120 ? 'M' : 'L'
}

/** 第 i 组配色的风格 */
export const paletteStyle = (def: AssetDef, i: number): StyleTag => def.paletteStyles?.[i] ?? def.styles?.[0] ?? 'cute'

/** 素材支持的全部风格（造型 + 配色） */
export function stylesOf(def: AssetDef): Set<StyleTag> {
  const out = new Set<StyleTag>(def.styles ?? [])
  def.palettes.forEach((_, i) => out.add(paletteStyle(def, i)))
  return out
}

/** 某个风格的第一组配色；没有就用默认的 0 */
export function paletteFor(def: AssetDef, style: StyleTag | 'all') {
  if (style === 'all') return 0
  const i = def.palettes.findIndex((_, k) => paletteStyle(def, k) === style)
  return i < 0 ? 0 : i
}

/** 系列 → 成员：只建一次索引（以前每次都扫全部素材，browse 里对每个系列各扫一遍，是 O(n²)） */
let families: Map<string, AssetDef[]> | null = null
function familyOf(name: string) {
  if (!families) {
    families = new Map()
    for (const a of ASSETS) if (a.family) (families.get(a.family) ?? families.set(a.family, []).get(a.family)!).push(a)
  }
  return families.get(name) ?? []
}

/** 同系列的全部规格（没有系列就只有自己）；尺寸已按 dims.generated.ts 校正过，按校正后的尺寸排序 */
export function siblings(def: AssetDef): AssetDef[] {
  return def.family ? familyOf(def.family).slice().sort((a, b) => a.w * a.d - b.w * b.d) : [def]
}

export interface Filter {
  category: AssetCategory | 'all'
  style: StyleTag | 'all'
  size: SizeClass | 'all'
  query: string
  /** 是否包含设备类（fixture） */
  fixtures: boolean
}

/** 筛选后按系列合并：每个系列一项，代表素材取第一个符合条件的规格 */
/** 除分类以外的筛选条件 */
function matches(a: AssetDef, f: Filter, q: string) {
  return (
    (f.fixtures || !a.fixture) &&
    (f.style === 'all' || stylesOf(a).has(f.style)) &&
    (f.size === 'all' || sizeClass(a) === f.size) &&
    (!q || a.name.includes(q) || (a.sizeLabel ?? '').includes(q) || a.id.includes(q) || localHit(a, q))
  )
}

/** 非中文界面下也按译名搜索（不区分大小写） */
function localHit(a: AssetDef, q: string) {
  if (lang.value === 'zh') return false
  const s = q.toLowerCase()
  return assetText(a.name).toLowerCase().includes(s) || assetText(a.sizeLabel).toLowerCase().includes(s)
}

/** 每个分类下 browse 会出几项（等价于逐个分类调 browse 再取长度，但只扫一遍）；all 为全部分类的项数 */
export function countByCategory(f: Filter) {
  const q = f.query.trim()
  const keys = new Map<AssetCategory, Set<string>>()
  const all = new Set<string>()
  for (const a of ASSETS) {
    if (!matches(a, f, q)) continue
    const key = a.family ?? a.id
    all.add(key)
    let s = keys.get(a.category)
    if (!s) keys.set(a.category, (s = new Set()))
    s.add(key)
  }
  const m = new Map<AssetCategory, number>()
  for (const [c, s] of keys) m.set(c, s.size)
  return { all: all.size, m }
}

export function browse(f: Filter) {
  const q = f.query.trim()
  const hit = ASSETS.filter((a) => (f.category === 'all' || a.category === f.category) && matches(a, f, q))
  const seen = new Map<string, { rep: AssetDef; items: AssetDef[] }>()
  for (const a of hit) {
    const key = a.family ?? a.id
    const g = seen.get(key)
    if (g) g.items.push(a)
    else seen.set(key, { rep: a, items: [a] })
  }
  return [...seen.values()].map((g) => ({ ...g, sizes: g.rep.family ? familyOf(g.rep.family).length : 1 }))
}

/** 规格 / 形态的短标签 */
const formText = (def: AssetDef) => (def.form ? assetText(def.formLabel ?? FORM_LABELS[def.form]) : '')
export const variantLabel = (def: AssetDef) => [assetText(def.sizeLabel), formText(def)].filter(Boolean).join(' · ') || assetText(def.name)

/** 素材的显示名：系列名 + 规格 + 形态 */
export const displayName = (def: AssetDef) => [assetText(def.name), assetText(def.sizeLabel), formText(def)].filter(Boolean).join(' ')

/** 素材的系列名（按当前语言） */
export const assetName = (def: AssetDef) => assetText(def.name)

/**
 * 换到某类层上时该用的形态：挂钩层要 hanging；普通台面上如果当前是 hanging 就换回同规格的非挂起形态。
 * 返回要用的素材 id；挂钩层上没有挂起形态时返回 null（放不上去）。
 */
export function formFor(def: AssetDef, kind: 'shelf' | 'hook' | 'floor'): string | null {
  const sib = siblings(def)
  if (kind === 'hook') {
    if (def.form === 'hanging') return def.id
    return (sib.find((a) => a.form === 'hanging' && a.sizeLabel === def.sizeLabel) ?? sib.find((a) => a.form === 'hanging'))?.id ?? null
  }
  if (def.form !== 'hanging') return def.id
  return (sib.find((a) => a.form !== 'hanging' && a.sizeLabel === def.sizeLabel) ?? sib.find((a) => a.form !== 'hanging'))?.id ?? def.id
}

/** 有没有挂起形态（能不能上挂钩） */
export const canHang = (def: AssetDef) => formFor(def, 'hook') !== null

export const categoriesOf = (fixtures: boolean) => [...new Set(ASSETS.filter((a) => fixtures || !a.fixture).map((a) => a.category))]

export { ASSET_MAP }
