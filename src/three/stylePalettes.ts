// 派生配色（虚拟配色）：让每种风格都能覆盖几乎所有素材，而不改动素材原生配色的下标。
//
// 编号约定（存档里 Furniture.color）：
//   0 .. n-1          素材自己的原生配色（含义永远不变）
//   1000 + 风格序号    该风格的派生配色，风格序号见 STYLE_ORDER（只追加、不改顺序）
//
// 派生规则：
//   1. 模板：从素材的原生配色里挑「最接近目标风格」的一组（TEMPLATE_PREF），没有就用第 0 组。
//   2. 探针：用一组互不相同的哨兵色 build 一次模型（结果按素材缓存），看每个颜色槽实际落在哪些网格上：
//      槽只用于发光材质（屏幕、灯光）或半透明材质（玻璃）→ 保持原色；在网格上找不到（只画进贴图，如挂画）→ 保持原色；
//      同时得到每个槽的面积占比，用来判断「主体」。
//   3. 按颜色的明度 / 饱和度 / 色相把每个槽归到一个角色（浅色、木色、深色、灰、粉彩布面、强调色），
//      映射到目标风格色板（STYLE_KITS）里同角色的颜色，并保留槽与槽之间的明暗差（木色深浅、浅色层次）。
//   4. 同角色的不同槽撞色时换到备选角色，避免对比丢失。
//   色板有多套变体，按素材系列（family ?? id）哈希选，结果确定，同系列不同规格一致。
// 不生成派生配色的素材：绿植（叶子颜色本身就是固有色）、会动的角色（宠物、机器人：毛色 / 机身色）。

import * as THREE from 'three'
import type { AssetDef, StyleTag } from './kit'
import { disposeUnshared } from './toon'

/** 风格序号：派生配色编号 = 1000 + 序号。只能往后追加，绝不调整顺序 */
export const STYLE_ORDER: readonly StyleTag[] = ['cute', 'nordic', 'modern', 'japanese', 'industrial', 'retro', 'chinese', 'classic', 'farmhouse']
export const DERIVED_BASE = 1000

export const isDerived = (color: number | undefined) => (color ?? 0) >= DERIVED_BASE
export const derivedIndex = (style: StyleTag) => DERIVED_BASE + STYLE_ORDER.indexOf(style)
export const derivedStyle = (color: number): StyleTag | undefined => STYLE_ORDER[color - DERIVED_BASE]

/** 原生第 i 组配色的风格 */
export const nativeStyle = (def: AssetDef, i: number): StyleTag => def.paletteStyles?.[i] ?? def.styles?.[0] ?? 'cute'

// ───────────────────────── 风格色板（数据） ─────────────────────────

/**
 * 每种风格的角色色：
 *   light  浅色（白、象牙、做旧白）    wood   主体木色            dark   深色（墨、铁、海军蓝）
 *   metal  金属 / 小面积的灰           fabric 布面（粉彩、亚麻、丝绒） accent / accent2 强调色
 *   spread 木色、浅色等「同角色」里保留模板明暗差的比例（越小越统一，新中式的红木要压得更深更齐）
 */
interface Kit {
  light: string
  wood: string
  dark: string
  metal: string
  fabric: string
  accent: string
  accent2: string
  spread?: number
}

export const STYLE_KITS: Record<StyleTag, Kit[]> = {
  cute: [
    { light: '#fffaf3', wood: '#f3dcbc', dark: '#6b5b6e', metal: '#e6e1ea', fabric: '#ffd6e0', accent: '#a6e3cc', accent2: '#fff1a8' },
    { light: '#fbf7f1', wood: '#ecd2b0', dark: '#5f6a8a', metal: '#dfe6ee', fabric: '#cfe6fb', accent: '#ffb3c7', accent2: '#d9c8f5' },
  ],
  nordic: [
    { light: '#f7f5f0', wood: '#d9b98c', dark: '#3f4652', metal: '#b9bfc4', fabric: '#e8e1d4', accent: '#9fb4c7', accent2: '#a9bfa3' },
    { light: '#f3f1ec', wood: '#cfae80', dark: '#4a4f55', metal: '#c9cdd0', fabric: '#d9dde0', accent: '#a9bfa3', accent2: '#e3b549' },
  ],
  modern: [
    { light: '#f4f4f2', wood: '#7a5a43', dark: '#24252a', metal: '#c3c7cc', fabric: '#d7d8db', accent: '#3d3f44', accent2: '#8a8d93' },
    { light: '#efefed', wood: '#a07f62', dark: '#2b2c30', metal: '#9aa0a7', fabric: '#8a8d93', accent: '#2e3a52', accent2: '#cbbba4' },
  ],
  japanese: [
    { light: '#f6f0e1', wood: '#c9a06e', dark: '#3e3a39', metal: '#6e6a66', fabric: '#e7dcc4', accent: '#3d5a80', accent2: '#d65a3c' },
    { light: '#f3eee4', wood: '#e2c597', dark: '#4a3a2e', metal: '#8a8580', fabric: '#d9cdb4', accent: '#6b7f4e', accent2: '#3d5a80' },
  ],
  industrial: [
    { light: '#e2ded8', wood: '#7b5236', dark: '#2e2e30', metal: '#7c8085', fabric: '#9a5f3a', accent: '#c46a3a', accent2: '#5d6b4a' },
    { light: '#d6d3cd', wood: '#8a6242', dark: '#3a3a3c', metal: '#a8a5a0', fabric: '#6e4b33', accent: '#3b5a80', accent2: '#a5543f' },
  ],
  retro: [
    { light: '#f4e7c8', wood: '#a8683a', dark: '#4a3426', metal: '#c8b89a', fabric: '#e0a526', accent: '#2f8f8a', accent2: '#e2702f' },
    { light: '#f0e6d6', wood: '#b97d4b', dark: '#3f2e26', metal: '#d0c3a8', fabric: '#8c8c3a', accent: '#c8473a', accent2: '#2f8f8a' },
  ],
  // 新中式：红木 / 胡桃深木、朱红漆、墨黑、象牙白、玉绿 / 青瓷，黄铜金点缀
  chinese: [
    { light: '#f2eadb', wood: '#6b3a2a', dark: '#2b2624', metal: '#c9a25a', fabric: '#e8dcc6', accent: '#b8352b', accent2: '#7fa48f', spread: 0.3 },
    { light: '#efe8da', wood: '#5a3b2a', dark: '#1f1c1b', metal: '#b8955a', fabric: '#a9c2b0', accent: '#8a2f2a', accent2: '#2f3f5c', spread: 0.3 },
    { light: '#f4efe6', wood: '#7a4a32', dark: '#2b2624', metal: '#c9a25a', fabric: '#d8cdb8', accent: '#b8352b', accent2: '#3f6b5a', spread: 0.3 },
  ],
  // 欧式古典：象牙白、香槟金、雾蓝、灰绿、酒红丝绒、浅胡桃
  classic: [
    { light: '#f4ede0', wood: '#9a7656', dark: '#4a3a33', metal: '#c8a96a', fabric: '#8fa3b8', accent: '#7a2e3a', accent2: '#a3ae98' },
    { light: '#f7f1e6', wood: '#b08d6b', dark: '#3b4a66', metal: '#c8b07a', fabric: '#a3ae98', accent: '#3b4a66', accent2: '#c9a6a0' },
    { light: '#efe6d6', wood: '#8a6446', dark: '#3a2e2a', metal: '#b8975a', fabric: '#e9dcc3', accent: '#7a2e3a', accent2: '#8fa3b8' },
  ],
  // 美式乡村：做旧白、原木橡木、鼠尾草绿、海军蓝、谷仓红、黄油黄
  farmhouse: [
    { light: '#f1ece2', wood: '#b88d5e', dark: '#3c3a38', metal: '#5a5650', fabric: '#e3d8c4', accent: '#9caf91', accent2: '#34465e' },
    { light: '#f3efe6', wood: '#a87d50', dark: '#2f3640', metal: '#6b665e', fabric: '#9caf91', accent: '#9e3b2f', accent2: '#efd99a' },
    { light: '#eee8dc', wood: '#c49a6a', dark: '#34465e', metal: '#4a4743', fabric: '#a7b8c9', accent: '#34465e', accent2: '#9e3b2f' },
  ],
}

/** 选模板时各目标风格偏好的原生风格（越靠前越像） */
const TEMPLATE_PREF: Record<StyleTag, StyleTag[]> = {
  cute: ['nordic', 'modern', 'retro', 'japanese', 'industrial', 'classic', 'farmhouse', 'chinese'],
  nordic: ['japanese', 'modern', 'farmhouse', 'cute', 'retro', 'classic', 'industrial', 'chinese'],
  modern: ['nordic', 'industrial', 'japanese', 'classic', 'retro', 'cute', 'farmhouse', 'chinese'],
  japanese: ['nordic', 'chinese', 'modern', 'retro', 'farmhouse', 'industrial', 'classic', 'cute'],
  industrial: ['modern', 'retro', 'farmhouse', 'nordic', 'japanese', 'chinese', 'classic', 'cute'],
  retro: ['nordic', 'farmhouse', 'japanese', 'cute', 'industrial', 'modern', 'classic', 'chinese'],
  chinese: ['japanese', 'industrial', 'modern', 'retro', 'nordic', 'classic', 'farmhouse', 'cute'],
  classic: ['nordic', 'modern', 'retro', 'farmhouse', 'japanese', 'cute', 'industrial', 'chinese'],
  farmhouse: ['nordic', 'retro', 'japanese', 'industrial', 'modern', 'classic', 'cute', 'chinese'],
}

// ───────────────────────── 颜色工具 ─────────────────────────

interface HSL {
  h: number // 0..360
  s: number // 0..1
  l: number // 0..1
}

function parseHex(c: string): [number, number, number] | null {
  let m = /^#([0-9a-f]{6})$/i.exec(c)
  if (m) {
    const v = parseInt(m[1], 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  m = /^#([0-9a-f]{3})$/i.exec(c)
  if (m) return [...m[1]].map((x) => parseInt(x + x, 16)) as [number, number, number]
  return null
}

function toHsl(c: string): HSL | null {
  const rgb = parseHex(c)
  if (!rgb) return null
  const [r, g, b] = rgb.map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  if (d < 1e-6) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

function fromHsl({ h, s, l }: HSL): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hex = (v: number) => Math.round(Math.max(0, Math.min(1, v + m)) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// ───────────────────────── 探针：每个槽实际用在哪 ─────────────────────────

/** keep = 保持原色（发光 / 玻璃 / 只进贴图）；share = 该槽占模型的面积比例 */
interface SlotProbe {
  keep: boolean
  share: number
}

const probeCache = new Map<string, SlotProbe[]>()

/** 统计一个网格的面积（世界坐标），作为权重 */
function meshArea(m: THREE.Mesh) {
  const geo = m.geometry
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined
  if (!pos) return 0
  const idx = geo.index
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = idx ? idx.count : pos.count
  // 大网格抽样，够用了
  const step = Math.max(1, Math.floor(n / 3 / 400)) * 3
  let sum = 0
  for (let i = 0; i + 2 < n; i += step) {
    const i0 = idx ? idx.getX(i) : i
    const i1 = idx ? idx.getX(i + 1) : i + 1
    const i2 = idx ? idx.getX(i + 2) : i + 2
    a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld)
    b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld)
    c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld)
    sum += b.sub(a).cross(c.sub(a)).length() / 2
  }
  return (sum * step) / 3
}

/** 用哨兵色 build 一次，看每个槽落在哪类材质上 */
function probe(def: AssetDef, n: number): SlotProbe[] {
  const hit = probeCache.get(def.id)
  if (hit) return hit
  const hues = Array.from({ length: n }, (_, i) => (17 + (i * 360) / n) % 360)
  const sentinel = hues.map((h) => fromHsl({ h, s: 0.92, l: 0.5 }))
  const tpl = def.palettes[0] ?? []
  const pal = sentinel.map((c, i) => (tpl[i] === '' ? '' : c))
  const area = new Array<number>(n).fill(0)
  const keepArea = new Array<number>(n).fill(0)
  let total = 0
  let g: THREE.Object3D | null = null
  try {
    g = def.build(pal)
    g.updateMatrixWorld(true)
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as (THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number })[]
      const w = meshArea(m)
      total += w
      for (const mat of mats) {
        if (!mat?.color) continue
        const hsl = { h: 0, s: 0, l: 0 }
        mat.color.getHSL(hsl)
        if (hsl.s < 0.45 || hsl.l < 0.12 || hsl.l > 0.9) continue
        const h = hsl.h * 360
        let best = -1
        let bd = Math.min(8, 360 / n / 3)
        hues.forEach((hh, i) => {
          const d = hueDist(h, hh)
          if (d < bd) (bd = d), (best = i)
        })
        if (best < 0) continue
        const ww = w / mats.length
        area[best] += ww
        const glowing = !!mat.emissive && (mat.emissiveIntensity ?? 0) > 0 && mat.emissive.getHex() !== 0
        const basic = (mat as THREE.Material).type === 'MeshBasicMaterial'
        const glass = mat.transparent && mat.opacity < 0.9
        if (glowing || basic || glass) keepArea[best] += ww
      }
    })
  } catch {
    // build 不认哨兵色（极少数）：全部按普通槽处理
  } finally {
    if (g) disposeUnshared(g)
  }
  const used = area.reduce((s, v) => s + v, 0) || 1
  const out = area.map((a, i) => ({ keep: a <= 0 ? !!g && total > 0 : keepArea[i] / a > 0.5, share: a / used }))
  probeCache.set(def.id, out)
  return out
}

// ───────────────────────── 角色映射 ─────────────────────────

type Role = 'light' | 'wood' | 'dark' | 'grey' | 'fabric' | 'accent'

/** 模板颜色 → 角色 */
function roleOf(c: HSL): Role {
  if (c.s < 0.16) return c.l >= 0.8 ? 'light' : c.l < 0.3 ? 'dark' : 'grey'
  if (c.l < 0.22) return 'dark'
  if (c.l >= 0.95 || (c.l >= 0.84 && c.s < 0.4)) return 'light'
  if (c.h >= 16 && c.h <= 48 && c.s <= 0.7 && c.l >= 0.25 && c.l < 0.84) return 'wood'
  if (c.l >= 0.72) return 'fabric'
  return 'accent'
}

/** 各角色在模板里的「典型明度」：模板色比它亮多少，结果就比色板色亮多少（乘 spread） */
const REF_L: Record<Role, number> = { light: 0.92, wood: 0.6, dark: 0.18, grey: 0.6, fabric: 0.84, accent: 0.5 }
/** 撞色时的备选角色 */
const ALT: Record<string, keyof Kit> = { light: 'fabric', fabric: 'light', accent: 'accent2', accent2: 'fabric', wood: 'dark', dark: 'metal', metal: 'dark' }

/** 绿植、角色（宠物 / 机器人）不派生 */
export function canDerive(def: AssetDef) {
  return def.category !== 'plants' && !def.actor
}

/** 这件素材某风格有没有原生配色 */
export const hasNative = (def: AssetDef, style: StyleTag) => def.palettes.some((_, i) => nativeStyle(def, i) === style)

/** 某风格是否需要（并能够）提供派生配色：没有原生配色、且素材允许派生 */
export const hasDerived = (def: AssetDef, style: StyleTag) => canDerive(def) && !hasNative(def, style)

/** 派生用的模板：最接近目标风格的一组原生配色 */
function templateIndex(def: AssetDef, style: StyleTag) {
  for (const s of TEMPLATE_PREF[style]) {
    const i = def.palettes.findIndex((_, k) => nativeStyle(def, k) === s)
    if (i >= 0) return i
  }
  return 0
}

const derivedCache = new Map<string, string[]>()

/**
 * 某风格的派生配色（确定性，按素材缓存）。不能派生的素材（绿植、角色）返回该风格的原生配色或第 0 组。
 */
export function derivedPalette(def: AssetDef, style: StyleTag): string[] {
  const key = `${def.id}|${style}`
  const hit = derivedCache.get(key)
  if (hit) return hit
  let out: string[]
  if (!canDerive(def)) {
    const i = def.palettes.findIndex((_, k) => nativeStyle(def, k) === style)
    out = def.palettes[i < 0 ? 0 : i] ?? []
  } else out = recolor(def, style)
  derivedCache.set(key, out)
  return out
}

function recolor(def: AssetDef, style: StyleTag): string[] {
  const tpl = def.palettes[templateIndex(def, style)] ?? def.palettes[0] ?? []
  const n = Math.max(1, ...def.palettes.map((p) => p.length))
  const kits = STYLE_KITS[style]
  const kit = kits[hashStr(def.family ?? def.id) % kits.length]
  const spread = kit.spread ?? 0.55
  const pr = probe(def, n)
  const bodyShare = Math.max(...pr.map((p) => p.share))
  const outdoor = def.category === 'outdoor'

  // 1. 每个槽的角色
  const slots = Array.from({ length: n }, (_, i) => {
    const raw = tpl[i] ?? tpl[0] ?? ''
    const hsl = raw ? toHsl(raw) : null
    return { i, raw, hsl, probe: pr[i] ?? { keep: false, share: 0 } }
  })
  const res: string[] = slots.map((s) => s.raw)
  const assigned: { key: keyof Kit; color: string; l: number; i: number }[] = []
  // 面积大的先选色，强调色优先给大面积
  const order = slots.filter((s) => s.hsl && !s.probe.keep).sort((a, b) => b.probe.share - a.probe.share)
  let accents = 0
  for (const s of order) {
    const c = s.hsl!
    // 室外素材里的叶绿保持原样
    if (outdoor && c.h >= 70 && c.h <= 165 && c.s > 0.2) continue
    const role = roleOf(c)
    let key: keyof Kit
    if (role === 'grey') key = s.probe.share >= 0.3 && s.probe.share >= bodyShare - 1e-6 ? 'fabric' : 'metal'
    else if (role === 'accent') key = accents++ === 0 ? 'accent' : 'accent2'
    else key = role
    // 撞色：同一个色板色已经给了别的槽，而模板里这两个槽本来不同 → 换备选角色
    const clash = assigned.find((a) => a.key === key && Math.abs(a.l - c.l) > 0.06)
    if (clash && ALT[key]) key = ALT[key]
    const kc = toHsl(kit[key] as string)!
    const k = key === 'wood' || key === 'light' || key === 'dark' ? spread : 0.35
    let l = clamp01(kc.l + (c.l - REF_L[role]) * k)
    // 浅色不要变灰、深色不要发白
    if (key === 'light') l = Math.max(l, 0.84)
    if (key === 'dark') l = Math.min(l, 0.3)
    const color = fromHsl({ h: kc.h, s: kc.s, l })
    assigned.push({ key, color, l: c.l, i: s.i })
    res[s.i] = color
  }
  // 2. 保持对比：模板里明暗差明显的两槽，结果不能贴在一起
  for (const a of assigned) {
    for (const b of assigned) {
      if (a.i >= b.i) continue
      const ta = toHsl(tpl[a.i]!)!
      const tb = toHsl(tpl[b.i]!)!
      const ra = toHsl(res[a.i])!
      const rb = toHsl(res[b.i])!
      const same = hueDist(ra.h, rb.h) < 12 && Math.abs(ra.s - rb.s) < 0.15
      if (!same || Math.abs(ta.l - tb.l) < 0.12 || Math.abs(ra.l - rb.l) >= 0.08) continue
      // 让模板里较暗的那个更暗一点
      const darker = ta.l < tb.l ? a : b
      const dh = toHsl(res[darker.i])!
      res[darker.i] = fromHsl({ ...dh, l: clamp01(dh.l - 0.12) })
    }
  }
  return res
}

// ───────────────────────── 统一入口：原生 + 派生 ─────────────────────────

export interface PaletteEntry {
  /** 存档里的 color 编号 */
  index: number
  style: StyleTag
  colors: string[]
  derived: boolean
}

/** 某个编号对应的基础配色（原生下标或派生编号；越界的原生下标取模，未知的派生编号回落到第 0 组） */
export function basePalette(def: AssetDef, color = 0): string[] {
  if (isDerived(color)) {
    const st = derivedStyle(color)
    return st ? derivedPalette(def, st) : (def.palettes[0] ?? [])
  }
  return def.palettes[color % def.palettes.length] ?? []
}

/** 编号对应的风格 */
export function paletteStyleOf(def: AssetDef, color = 0): StyleTag {
  if (isDerived(color)) return derivedStyle(color) ?? nativeStyle(def, 0)
  return nativeStyle(def, color % Math.max(1, def.palettes.length))
}

/** 规范化编号：原生下标取模；派生编号原样（风格未知时回 0） */
export function normalizeColor(def: AssetDef, color = 0): number {
  if (isDerived(color)) return derivedStyle(color) ? color : 0
  return color % Math.max(1, def.palettes.length)
}

/** 全部可选配色：原生在前（按原顺序），每个缺原生配色的风格补一项派生 */
export function allPalettes(def: AssetDef): PaletteEntry[] {
  const out: PaletteEntry[] = def.palettes.map((colors, i) => ({ index: i, style: nativeStyle(def, i), colors, derived: false }))
  for (const st of STYLE_ORDER) if (hasDerived(def, st)) out.push({ index: derivedIndex(st), style: st, colors: derivedPalette(def, st), derived: true })
  return out
}

/** 可选配色的个数（原生 + 派生） */
export const paletteCount = (def: AssetDef) => def.palettes.length + STYLE_ORDER.filter((st) => hasDerived(def, st)).length

/** 素材支持的风格（造型 + 原生配色 + 派生配色） */
export function styleSet(def: AssetDef): Set<StyleTag> {
  const out = new Set<StyleTag>(def.styles ?? [])
  def.palettes.forEach((_, i) => out.add(nativeStyle(def, i)))
  if (canDerive(def)) for (const st of STYLE_ORDER) out.add(st)
  return out
}

/** 某风格优先用的编号：原生第一组 → 派生 → 0 */
export function preferredColor(def: AssetDef, style: StyleTag): number {
  const i = def.palettes.findIndex((_, k) => nativeStyle(def, k) === style)
  if (i >= 0) return i
  return canDerive(def) ? derivedIndex(style) : 0
}
