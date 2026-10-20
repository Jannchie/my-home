// 素材目录的查询：风格、尺寸分级、规格系列。素材库和沙盘的家具栏共用。

import { ASSETS, ASSET_MAP, type AssetDef } from './assets'
import { FORM_LABELS, type StyleTag } from './kit'
import { assetText, lang, t } from '../i18n'
import { paletteStyleOf, preferredColor, styleSet } from './stylePalettes'
import { FUNCTION_TAGS, type Tag } from './tags'
import { typeLabel } from './typeLabels'
import { GROUPS, groupOf, roomOf, type AssetGroup, type AssetRoom } from './groups'

export type SizeClass = 'S' | 'M' | 'L'
export const SIZE_LABELS: Record<SizeClass, string> = { S: '小件', M: '中件', L: '大件' }

/** 按占地最长边分级：≤ 50 小件（摆件、小物），≤ 120 中件，其余大件 */
export function sizeClass(def: AssetDef): SizeClass {
  const m = Math.max(def.w, def.d)
  return m <= 50 ? 'S' : m <= 120 ? 'M' : 'L'
}

/** 配色编号 i 的风格（i ≥ 1000 为派生配色，见 stylePalettes.ts） */
export const paletteStyle = (def: AssetDef, i: number): StyleTag => paletteStyleOf(def, i)

/** 素材支持的全部风格（造型 + 原生配色 + 派生配色） */
export function stylesOf(def: AssetDef): Set<StyleTag> {
  return styleSet(def)
}

/** 某个风格优先用的配色编号：该风格第一组原生配色 → 派生配色 → 默认的 0 */
export function paletteFor(def: AssetDef, style: StyleTag | 'all') {
  if (style === 'all') return 0
  return preferredColor(def, style)
}

/** 同款系列 → 成员：只建一次索引（browse 里对每个系列各查一遍，扫全部素材会是 O(n²)） */
let seriesIndex: Map<string, AssetDef[]> | null = null
function seriesOf(name: string) {
  if (!seriesIndex) {
    seriesIndex = new Map()
    for (const a of ASSETS) {
      const k = a.series ?? a.id
      ;(seriesIndex.get(k) ?? seriesIndex.set(k, []).get(k)!).push(a)
    }
  }
  return seriesIndex.get(name) ?? []
}

/**
 * 同款系列的全部成员（同一造型的各尺寸、各陈设；造型不同的同类物品不在其中，见 type）。
 * 尺寸已按 dims.generated.ts 校正过，按校正后的尺寸排序
 */
export function siblings(def: AssetDef): AssetDef[] {
  const xs = seriesOf(def.series ?? def.id)
  return xs.length > 1 ? xs.slice().sort((a, b) => a.w * a.d - b.w * b.d) : [def]
}

/**
 * 同类的各款（编辑时原地换款用）：同一细分类型（type）、同样摆法（形态、贴附、壁挂一致）的各个造型，每个系列一件——
 * 当前这件所在的系列就是它自己，别的系列取尺寸和它最接近的那件。顺序固定（素材表的顺序），上一款 / 下一款能轮完一圈。
 * 没有细分类型的只有它自己
 */
export function sameTypeVariants(def: AssetDef): AssetDef[] {
  if (!def.type) return [def]
  const vol = (a: AssetDef) => Math.log(a.w * a.d * a.h + 1)
  const dist = (a: AssetDef) => Math.abs(vol(a) - vol(def))
  const self = def.series ?? def.id
  const bySeries = new Map<string, AssetDef>()
  for (const a of ASSETS) {
    if (a.fixture || a.type !== def.type || (a.form ?? '') !== (def.form ?? '') || !!a.stick !== !!def.stick || (a.mount === undefined) !== (def.mount === undefined) || a.tags?.includes('set-piece')) continue
    const k = a.series ?? a.id
    if (k === self) {
      bySeries.set(k, def)
      continue
    }
    const cur = bySeries.get(k)
    if (!cur || dist(a) < dist(cur)) bySeries.set(k, a)
  }
  return [...bySeries.values()]
}

export interface Filter {
  /** 功能大类（groups.ts） */
  group: AssetGroup | 'all'
  /** 常用房间（groups.ts）；不给 = 全部 */
  room?: AssetRoom | 'all'
  /** 细分类型（功能标签）；不给 = 全部 */
  type?: Tag | 'all'
  /** 任意标签（详情里点标签筛选）；不给 = 不限 */
  tag?: Tag
  style: StyleTag | 'all'
  size: SizeClass | 'all'
  query: string
  /** 是否包含设备类（fixture） */
  fixtures: boolean
}

/** 筛选后按系列合并：每个系列一项，代表素材取第一个符合条件的规格 */
/** 除大类以外的筛选条件 */
function matches(a: AssetDef, f: Filter, q: string) {
  return (
    (f.fixtures || !a.fixture) &&
    (!f.room || f.room === 'all' || roomOf(a) === f.room) &&
    (!f.type || f.type === 'all' || a.type === f.type) &&
    (!f.tag || !!a.tags?.includes(f.tag)) &&
    (f.style === 'all' || stylesOf(a).has(f.style)) &&
    (f.size === 'all' || sizeClass(a) === f.size) &&
    (!q || a.name.includes(q) || (a.sizeLabel ?? '').includes(q) || a.id.includes(q) || localHit(a, q) || tagHit(a, q))
  )
}

/** 非中文界面下也按译名搜索（不区分大小写） */
function localHit(a: AssetDef, q: string) {
  if (lang.value === 'zh') return false
  const s = q.toLowerCase()
  return assetText(a.name).toLowerCase().includes(s) || assetText(a.sizeLabel).toLowerCase().includes(s)
}

/** 功能标签的显示名（当前语言、小写）：搜「床」「マグ」「kettle」也能按类型找到 */
let tagNames: { lang: string; m: Map<string, string> } | null = null
const FUNCTION_SET = new Set<string>(FUNCTION_TAGS)
function tagHit(a: AssetDef, q: string) {
  if (!a.tags) return false
  if (tagNames?.lang !== lang.value) tagNames = { lang: lang.value, m: new Map(FUNCTION_TAGS.map((x) => [x, t(typeLabel(x)).toLowerCase()])) }
  const s = q.toLowerCase()
  return a.tags.some((x) => FUNCTION_SET.has(x) && tagNames!.m.get(x)!.includes(s))
}

/** 每个大类下 browse 会出几项（等价于逐个大类调 browse 再取长度，但只扫一遍）；all 为全部大类的项数 */
export function countByGroup(f: Filter) {
  const q = f.query.trim()
  const keys = new Map<AssetGroup, Set<string>>()
  const all = new Set<string>()
  for (const a of ASSETS) {
    if (!matches(a, f, q)) continue
    const key = a.series ?? a.id
    all.add(key)
    const g = groupOf(a)
    let s = keys.get(g)
    if (!s) keys.set(g, (s = new Set()))
    s.add(key)
  }
  const m = new Map<AssetGroup, number>()
  for (const [c, s] of keys) m.set(c, s.size)
  return { all: all.size, m }
}

export function browse(f: Filter) {
  const q = f.query.trim()
  const hit = ASSETS.filter((a) => (f.group === 'all' || groupOf(a) === f.group) && matches(a, f, q))
  const seen = new Map<string, { rep: AssetDef; items: AssetDef[] }>()
  for (const a of hit) {
    const key = a.series ?? a.id
    const g = seen.get(key)
    if (g) g.items.push(a)
    else seen.set(key, { rep: a, items: [a] })
  }
  return [...seen.values()].map((g) => ({ ...g, sizes: seriesOf(g.rep.series ?? g.rep.id).length || 1 }))
}

/** 当前大类（和其他筛选条件）下有哪些细分类型、各有几款：素材库的「类型」筛选用，按款数从多到少 */
export function typesIn(f: Filter) {
  const q = f.query.trim()
  const m = new Map<Tag, Set<string>>()
  for (const a of ASSETS) {
    if (!a.type || (f.group !== 'all' && groupOf(a) !== f.group) || !matches(a, { ...f, type: 'all' }, q)) continue
    let s = m.get(a.type)
    if (!s) m.set(a.type, (s = new Set()))
    s.add(a.series ?? a.id)
  }
  return [...m].map(([type, s]) => ({ type, n: s.size })).sort((a, b) => b.n - a.n || a.type.localeCompare(b.type))
}

/** 规格 / 形态的短标签 */
const formText = (def: AssetDef) => (def.form ? assetText(def.formLabel ?? FORM_LABELS[def.form]) : '')
export const variantLabel = (def: AssetDef) => [assetText(def.sizeLabel), formText(def)].filter(Boolean).join(' · ') || assetText(def.name)

/** 素材的显示名：系列名 + 规格 + 形态 */
export const displayName = (def: AssetDef) => [assetText(def.name), assetText(def.sizeLabel), formText(def)].filter(Boolean).join(' ')

/** 素材的系列名（按当前语言） */
export const assetName = (def: AssetDef) => assetText(def.name)

/**
 * 卡片上的名字：系列里各成员的 sizeLabel 都一样时（款式名，如「石灯笼」「兔子」），它是这一款的名字的一部分，跟在后面；
 * sizeLabel 是在卡片里切换的尺寸 / 陈设（120 / 140、对局中 / 收在盒里）时只显示系列名。「标准」不显示
 */
export function cardName(def: AssetDef) {
  const sib = siblings(def)
  const label = def.sizeLabel && def.sizeLabel !== '标准' && sib.every((a) => a.sizeLabel === def.sizeLabel) ? def.sizeLabel : ''
  return [assetText(def.name), assetText(label)].filter(Boolean).join(' ')
}

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

/** 有素材的大类（按 GROUP_NAMES 的顺序） */
export function groupsOf(fixtures: boolean) {
  const has = new Set(ASSETS.filter((a) => fixtures || !a.fixture).map(groupOf))
  return GROUPS.filter((g) => has.has(g))
}

export { ASSET_MAP }
