// 装饰画的「画面」：挂画、画布、画架、海报、相框、照片墙、挂轴、儿童画这些素材的画面可以逐件换。
//
// 数据：Furniture.art = '画种.种子'（如 'fuji.4821'）。不填 = 素材原来的画（旧存档、素材库预览都是这样）。
// 构建：furnitureModel 用 withArt(fu.art, () => def.build(pal)) 构建模板（模板缓存键里含 art）；
//       素材 build 里的每块画面调 artFace(slot, key, draw)：有 art 就换成生成的画，没有就原样返回。
//       一件素材有多块画面（三联画、照片墙）时 slot 依次编号：画同一画种的不同种子（照片墙则轮换照片画种）。
// 布置：一键布置按房间风格用 pickArt 挑画种，全屋尽量不重复；沙盘里摆放 / 检查器里换画也走这里。

import type { StyleTag } from './kit'
import { MOTIFS, MOTIF_BY_ID, mulberry, type ArtKind, type Motif, type Rand } from './artMotifs'

export { MOTIFS, type ArtKind, type Motif } from './artMotifs'

export type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

/** 画面可换的素材 → 画面用途（决定能挂哪些画种） */
export const ART_ASSETS: Record<string, ArtKind> = {
  'wall-art-mountain': 'painting',
  'wall-art-mountain-s': 'painting',
  'wall-art-flower': 'painting',
  'wall-art-flower-s': 'painting',
  'wall-art-abstract': 'painting',
  'wall-art-abstract-m': 'painting',
  'mv-art-wood-a4': 'painting',
  'mv-art-wood-a3': 'painting',
  'mv-art-wood-b2': 'painting',
  'mv-art-black-a3': 'painting',
  'mv-art-black-b2': 'painting',
  'mv-art-black-wide': 'painting',
  'mv-art-gold-sq': 'painting',
  'mv-art-gold-a3': 'painting',
  'mv-art-gold-b2': 'painting',
  'mv-art-canvas-sq': 'painting',
  'mv-art-canvas-wide': 'painting',
  'mv-art-canvas-tall': 'painting',
  'mv-art-acrylic-a4': 'painting',
  'mv-art-acrylic-a3': 'painting',
  'mv-art-acrylic-b2': 'painting',
  'mv-deco-ledge': 'painting',
  'ss-art-canvas-xl': 'painting',
  'ss-art-triptych': 'painting',
  'ss-art-square': 'painting',
  'ss-art-tall': 'painting',
  'ss-art-mini-set': 'painting',
  'ss-calendar': 'painting',
  'hb-easel': 'painting',
  'av-poster': 'poster',
  'av-poster-space': 'poster',
  'av-poster-retro': 'poster',
  'st-poster': 'poster',
  'st-poster-shapes': 'poster',
  'jp-kakejiku': 'scroll',
  'ss-kakejiku-sansui': 'scroll',
  'ss-kakejiku-sho': 'scroll',
  'sw-cn-zhongtang': 'scroll',
  'prop-photo-frame': 'photo',
  'prop-photo-frame-wide': 'photo',
  'mv-photo-salon': 'photo',
  'mv-photo-polaroid-line': 'photo',
  'mv-photo-grid-tall': 'photo',
  'mv-photo-cork-round': 'photo',
  'mv-photo-heart': 'photo',
  'mv-photo-stair': 'photo',
  'ss-photo-wall': 'photo',
  'ss-wire-grid': 'photo',
  'st-polaroid': 'photo',
  'st-kids-drawing': 'kids',
  'lm-kids-easel': 'kids',
}

export const artKindOf = (asset: string): ArtKind | undefined => ART_ASSETS[asset]

/** 某种用途的全部画种（检查器里循环切换的顺序） */
export const motifsOfKind = (kind: ArtKind) => MOTIFS.filter((m) => m.kinds.includes(kind))

/** 适合某风格的画种：太少（不到 3 种）就退回这种用途的全部画种 */
export function motifsFor(kind: ArtKind, style?: StyleTag): Motif[] {
  const all = motifsOfKind(kind)
  if (!style) return all
  const s = all.filter((m) => m.styles.includes(style))
  return s.length >= 3 ? s : all
}

export function parseArt(art: string | undefined): { motif: Motif; seed: number } | null {
  if (!art) return null
  const dot = art.indexOf('.')
  const motif = MOTIF_BY_ID.get(dot < 0 ? art : art.slice(0, dot))
  if (!motif) return null
  const seed = dot < 0 ? 0 : Number(art.slice(dot + 1))
  return { motif, seed: Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0 }
}

const art = (m: Motif, seed: number) => `${m.id}.${seed}`
const newSeed = (rand: Rand) => Math.floor(rand() * 10000)

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

/** 画面的绘制函数；slot > 0 是同一件素材上的其他画面 */
export function artDraw(a: string | undefined, slot = 0): Draw | null {
  const p = parseArt(a)
  if (!p) return null
  let { motif, seed } = p
  if (slot > 0) {
    seed = (seed + slot * 7919) >>> 0
    // 照片墙：每张照片换一种题材（人像、宠物、旅行…）
    if (motif.kinds.includes('photo') && motif.kinds.length === 1) {
      const list = motifsOfKind('photo').filter((m) => m.kinds.length === 1)
      motif = list[(list.indexOf(motif) + slot) % list.length]
    }
  }
  const m = motif
  const s = seed
  return (g, W, H) => {
    g.save()
    m.draw(g, W, H, mulberry(hash(m.id) ^ Math.imul(s + 1, 2654435761)))
    g.restore()
  }
}

// ---------- 构建时的上下文 ----------

let current: string | undefined
let faces = 0

/** 在「当前家具的画面是 a」的上下文里构建模型 */
export function withArt<T>(a: string | undefined, fn: () => T): T {
  const prev = current
  current = a
  try {
    return fn()
  } finally {
    current = prev
  }
}

/** artFace / artOverride 被调用的累计次数（测试用：确认素材的画面都接上了） */
export const artFaceCalls = () => faces

/**
 * 第 slot 块画面的 [贴图键, 绘制函数]：正在构建的家具指定了画面就换成生成的画，否则原样返回素材自己的画。
 * crop = [i, n]：一幅画横向切成 n 份、这块是第 i 份（三联画）。
 */
export function artFace(slot: number, key: string, draw: Draw, crop?: [number, number]): [string, Draw] {
  return artOverride(slot, crop) ?? [key, draw]
}

/** 同 artFace，但没有指定画面时返回 null（原本用几何体拼画面的素材自己决定怎么画） */
export function artOverride(slot: number, crop?: [number, number]): [string, Draw] | null {
  faces++
  const d = current ? artDraw(current, crop ? 0 : slot) : null
  if (!d) return null
  const key = `art|${current}|${slot}${crop ? `|${crop[0]}/${crop[1]}` : ''}`
  if (!crop) return [key, d]
  const [i, n] = crop
  return [
    key,
    (g, W, H) => {
      g.save()
      g.translate(-i * W, 0)
      d(g, W * n, H)
      g.restore()
    },
  ]
}

// ---------- 挑画 / 换画 ----------

/**
 * 按风格挑一幅画：used 记着全屋已经用过的画种（画种 → 次数），优先挑用得最少的。
 */
export function pickArt(kind: ArtKind, style: StyleTag | undefined, rand: Rand, used?: Map<string, number>): string {
  const pool = motifsFor(kind, style)
  let best = pool
  if (used) {
    const min = Math.min(...pool.map((m) => used.get(m.id) ?? 0))
    best = pool.filter((m) => (used.get(m.id) ?? 0) === min)
  }
  const m = best[Math.floor(rand() * best.length) % best.length]
  used?.set(m.id, (used.get(m.id) ?? 0) + 1)
  return art(m, newSeed(rand))
}

/** 换到这种用途的上一个 / 下一个画种（种子不变） */
export function cycleArt(a: string | undefined, kind: ArtKind, dir: 1 | -1): string {
  const list = motifsOfKind(kind)
  const p = parseArt(a)
  const i = p ? list.indexOf(p.motif) : -1
  const next = list[(((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir) % list.length + list.length) % list.length]
  return art(next, p?.seed ?? 0)
}

/** 同一画种换一版（新种子）；还没有画面就随机挑一幅 */
export function rerollArt(a: string | undefined, kind: ArtKind, style?: StyleTag, rand: Rand = Math.random): string {
  const p = parseArt(a)
  if (!p || !p.motif.kinds.includes(kind)) return pickArt(kind, style, rand)
  let s = newSeed(rand)
  if (s === p.seed) s = (s + 1) % 10000
  return art(p.motif, s)
}

/** 画种的中文名（界面上用 t() 翻译） */
export const artLabel = (a: string | undefined) => parseArt(a)?.motif.label
