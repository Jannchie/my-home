// 配色：预设配色 + 每个颜色槽的自定义覆盖。

import type { AssetDef, StyleTag } from './kit'
import { C, S } from './kit'
import { t } from '../i18n'

/** 颜色槽的名字：素材 build 按 [主色, 副色, 点缀色, …] 取用 */
export function slotLabel(i: number) {
  const base = ['主色', '副色', '点缀色'][i]
  return base ? t(base) : t('颜色 {n}', { n: i + 1 })
}

/** 素材用到几个颜色槽（各组预设里最长的那组） */
export function slotCount(def: AssetDef) {
  return Math.max(1, ...def.palettes.map((p) => p.length))
}

/** 实际用的配色：预设第 color 组，再用 colors 逐槽覆盖 */
export function effectivePalette(def: AssetDef, color = 0, colors?: string[]) {
  const base = def.palettes[color % def.palettes.length] ?? []
  if (!colors?.length) return base
  const n = Math.max(base.length, colors.length)
  return Array.from({ length: n }, (_, i) => colors[i] || base[i] || base[0] || '#cccccc')
}

/** 精选色板：按风格分组，自定义时点选 */
export const SWATCHES: { style: StyleTag | 'basic'; label: string; colors: string[] }[] = [
  { style: 'basic', label: '基础', colors: ['#ffffff', '#f4f1ea', '#d8d5ce', '#9a9690', '#5b5853', '#2b2a28'] },
  { style: 'cute', label: '可爱粉彩', colors: [C.pink, C.sakura, C.peach, C.lemon, C.mint, C.sky, C.lilac, C.red, C.orange, C.cream] },
  { style: 'nordic', label: '北欧原木', colors: Object.values(S.nordic) },
  { style: 'modern', label: '现代简约', colors: Object.values(S.modern) },
  { style: 'japanese', label: '和风', colors: Object.values(S.japanese) },
  { style: 'industrial', label: '工业风', colors: Object.values(S.industrial) },
  { style: 'retro', label: '复古昭和', colors: Object.values(S.retro) },
  { style: 'basic', label: '木色', colors: [C.woodL, C.wood, C.woodD, '#a0703f', '#7a5236', '#4e3424'] },
  { style: 'basic', label: '鲜艳', colors: ['#e84a5f', '#ff8c42', '#ffd23f', '#3bb273', '#2e86de', '#7c4dff', '#ff5fa2', '#00b8a9'] },
]

/** 从同一风格的色板里随机挑一套（同一套颜色放在一起比较协调） */
export function randomColors(def: AssetDef, rand = Math.random) {
  const pool = SWATCHES.filter((s) => s.style !== 'basic')
  const set = pool[Math.floor(rand() * pool.length)].colors
  const picked: string[] = []
  for (let i = 0; i < slotCount(def); i++) {
    let c = set[Math.floor(rand() * set.length)]
    // 尽量不和前面的槽撞色
    for (let k = 0; k < 4 && picked.includes(c); k++) c = set[Math.floor(rand() * set.length)]
    picked.push(c)
  }
  return picked
}
