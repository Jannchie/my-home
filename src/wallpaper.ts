// 墙纸：按房间主人的风格自动挑（低对比度的纯色 / 细花纹），也可以手动换。

import { shade } from './three/toon'
import { takesHouseWallpaper, type Plan, type Room, type Wallpaper, type WallTrim, type WoodTone } from './model'
import type { Household } from './household'
import { rng, type StyleTag } from './three/kit'
import type { PatternKind } from './three/patterns'
import { wallsWithoutPaper } from './wallFace'

/** 手动换墙纸时的色板、花纹（内装页的墙纸、单面墙的编辑卡片共用） */
export const WP_COLORS = ['#fbf7f1', '#f2f2f0', '#fff4f1', '#f3f8ff', '#f4fbf6', '#fff9e8', '#f6f0e1', '#e6e6e4', '#d6d3cd', '#f4e7c8', '#dfe8f0', '#3d3f44']
export const WP_PATTERNS: PatternKind[] = ['stripes', 'dots', 'gingham', 'flowers', 'sakura', 'stars', 'asanoha', 'seigaiha', 'ichimatsu', 'chevron', 'houndstooth', 'argyle']

/** 用底色 base 织一张低对比的花纹墙纸（边饰 trim 照带） */
export function patternWallpaper(kind: PatternKind, base: string, trim?: WallTrim): Wallpaper {
  return { color: base, trim, pattern: { kind, colors: [base, accentOf(base), accentOf(base, 0.04)], scale: kind === 'stripes' ? 16 : 12, angle: kind === 'stripes' ? 90 : 0, density: 0.3, seed: 7 } }
}

/** 各风格的墙纸底色 + 适合的花纹 */
const RECIPES: Record<StyleTag, { colors: string[]; patterns: PatternKind[] }> = {
  cute: { colors: ['#fff4f1', '#f3f8ff', '#fff9e8', '#f4fbf6', '#f8f2ff'], patterns: ['dots', 'stripes', 'hearts', 'stars', 'sakura', 'gingham'] },
  nordic: { colors: ['#f7f5f0', '#eef0ee', '#f1ece4', '#e9eef2'], patterns: ['stripes', 'gingham', 'dots'] },
  modern: { colors: ['#f2f2f0', '#e6e6e4', '#dcdde0', '#efefea'], patterns: ['stripes'] },
  japanese: { colors: ['#f6f0e1', '#efe6d0', '#f3eee4'], patterns: ['asanoha', 'seigaiha', 'ichimatsu', 'shippo'] },
  industrial: { colors: ['#d6d3cd', '#c9c6c0', '#e2ded8'], patterns: ['stripes'] },
  retro: { colors: ['#f4e7c8', '#efe0c0', '#f0e6d6'], patterns: ['flowers', 'stripes', 'chevron', 'dots'] },
  // 新中式：米白 / 宣纸色 / 淡青灰，回纹为主，偶尔细条纹
  chinese: { colors: ['#f3ede1', '#efe8da', '#ece9e1', '#e8ece6'], patterns: ['huiwen', 'huiwen', 'stripes'] },
  // 欧式古典：雾蓝、米黄、浅灰绿、象牙白，大马士革为主
  classic: { colors: ['#e3e9ef', '#f1e8d4', '#e4e8de', '#f4efe4', '#efe3df'], patterns: ['damask', 'damask', 'stripes'] },
  // 美式乡村：做旧白、奶油黄、浅鼠尾草，碎花 / 格纹
  farmhouse: { colors: ['#f2eee4', '#f3ead3', '#e6ebe0', '#ece6dc'], patterns: ['flowers', 'gingham', 'stripes', 'tartan'] },
}

/** 同色系的花色：比底色稍深一点，墙面不至于太花 */
export const accentOf = (base: string, k = 0.07) => shade(base, -k, 0.08)

/** 某风格的一张墙纸；plainBias 越大越倾向纯色 */
export function wallpaperFor(style: StyleTag, rand: () => number, plainBias = 0.55): Wallpaper {
  const r = RECIPES[style]
  const color = r.colors[Math.floor(rand() * r.colors.length)]
  if (rand() < plainBias) return { color }
  const kind = r.patterns[Math.floor(rand() * r.patterns.length)]
  const scale = kind === 'stripes' ? 14 + Math.floor(rand() * 10) : 10 + Math.floor(rand() * 8)
  return {
    color,
    pattern: { kind, colors: [color, accentOf(color), accentOf(color, 0.04)], scale, angle: kind === 'stripes' ? 90 : 0, density: 0.3, seed: Math.floor(rand() * 1e6) },
  }
}

/** 各风格的边饰：踢脚线几乎都有；腰壁、顶角线看风格和运气 */
export function trimFor(style: StyleTag, rand: () => number, wall: string): WallTrim {
  const wood = ['#b98b5e', '#9a6b45', '#d2b48c'][Math.floor(rand() * 3)]
  const white = shade(wall, 0.02, -0.05)
  // 新中式用深色木（红木 / 胡桃）做踢脚、腰线；欧式古典一律白色线脚；乡村白或木色
  const darkWood = ['#6b3a2a', '#5a3b2a', '#7a4a32'][Math.floor(rand() * 3)]
  const baseColor =
    style === 'modern' || style === 'industrial' ? (rand() < 0.5 ? '#3d3f44' : white)
    : style === 'japanese' ? wood
    : style === 'chinese' ? darkWood
    : style === 'classic' ? white
    : rand() < 0.5 ? white : wood
  const t: WallTrim = { base: { h: style === 'classic' ? 10 : style === 'farmhouse' ? 8 : 6, color: baseColor } }
  const wainscot = { cute: 0.35, nordic: 0.3, retro: 0.5, japanese: 0.15, modern: 0.05, industrial: 0.15, chinese: 0.4, classic: 0.65, farmhouse: 0.7 }[style]
  if (rand() < wainscot) {
    let color = style === 'retro' || style === 'japanese' || rand() < 0.4 ? wood : style === 'cute' ? shade(wall, -0.06, 0.1) : white
    let kind: 'plain' | 'batten' = rand() < 0.5 ? 'batten' : 'plain'
    if (style === 'chinese') color = darkWood
    else if (style === 'classic') (color = rand() < 0.7 ? white : shade(wall, -0.05, 0.05)), (kind = 'plain')
    else if (style === 'farmhouse') (color = rand() < 0.6 ? white : ['#9caf91', '#34465e', '#b88d5e'][Math.floor(rand() * 3)]), (kind = 'batten')
    t.wainscot = { h: (style === 'chinese' ? 90 : 85) + Math.floor(rand() * 4) * 5, color, kind }
  }
  const crown = { cute: 0.2, nordic: 0.2, retro: 0.5, japanese: 0.4, modern: 0.1, industrial: 0, chinese: 0.35, classic: 0.9, farmhouse: 0.35 }[style]
  if (rand() < crown) t.crown = { h: style === 'classic' ? 9 : 5, color: style === 'japanese' ? wood : style === 'chinese' ? darkWood : white }
  return t
}

/** 各风格的窗帘颜色 */
const CURTAINS: Record<StyleTag, string[]> = {
  cute: ['#ffd6e0', '#cfe6fb', '#fff0b8', '#d9f2e6', '#e8dcfb'],
  nordic: ['#e8e1d4', '#c9d3d9', '#b9c4b0', '#efe9df'],
  modern: ['#8a8d93', '#d7d8db', '#3d3f44', '#f4f4f2'],
  japanese: ['#e9dfc8', '#c9cf8e', '#3d5a80'],
  industrial: ['#7c8085', '#9a5f3a', '#3a3a3c'],
  retro: ['#e0a526', '#2f8f8a', '#c8473a', '#f4e7c8'],
  chinese: ['#efe6d4', '#a9c2b0', '#8a3a30', '#d8cdb8'],
  classic: ['#c8b18a', '#8fa3b8', '#7a2e3a', '#e9dcc3', '#a3ae98'],
  farmhouse: ['#f1ece2', '#9caf91', '#34465e', '#e3d8c4', '#9e3b2f'],
}

/** 各风格的木地板色调（前面的更常见） */
const FLOOR_TONES: Record<StyleTag, WoodTone[]> = {
  cute: ['light', 'white', 'natural'],
  nordic: ['white', 'light', 'gray'],
  modern: ['gray', 'white', 'dark'],
  japanese: ['natural', 'light'],
  industrial: ['dark', 'walnut', 'gray'],
  retro: ['walnut', 'natural'],
  chinese: ['walnut', 'dark'],
  classic: ['walnut', 'dark', 'natural'],
  farmhouse: ['natural', 'walnut', 'light'],
}


/**
 * 全屋自动墙纸：居室用住在里面的人的风格，公共空间用全家的风格；浴室、收纳、阳台不贴。
 * occupantStyle(room) 给出房间主人的风格（由 decorate 的房间分配决定），没有就用全家风格。
 */
export function autoWallpapers(plan: Plan, hh: Household | undefined, occupantStyle: (room: Room) => StyleTag | undefined, seed = Date.now()) {
  const rand = rng(seed)
  const base = hh?.style ?? 'nordic'
  // 公共空间（LDK、廊下、玄関、洗面所）统一一种，记成全屋墙纸（Plan.wallpaper），这些房间不单独写，改全屋时一起变；
  // 有主人的居室、トイレ各自单独一种
  const common = wallpaperFor(base, rand, 0.7)
  common.trim = trimFor(base, rand, common.color)
  plan.wallpaper = common
  // 全屋地板按风格挑一种木色，偶尔打蜡；单间的地板覆盖清掉（随机是「重新来一套」）
  const tones = FLOOR_TONES[base]
  plan.flooring = { tone: tones[Math.floor(rand() * tones.length)], ...(rand() < 0.3 ? { wax: true } : {}) }
  for (const r of plan.rooms) {
    delete r.flooring
    // 单面墙的墙纸覆盖也清掉（内收柱是结构，留着）
    if (r.walls) {
      const walls = wallsWithoutPaper(r.walls)
      if (walls) r.walls = walls
      else delete r.walls
    }
    const own = r.kind === 'western' || r.kind === 'japanese' ? occupantStyle(r) : undefined
    const single = takesHouseWallpaper(r) && (!!own || r.kind === 'toilet')
    if (!single) {
      delete r.wallpaper
    } else {
      r.wallpaper = own ? wallpaperFor(own, rand, 0.45) : wallpaperFor(base, rand, 0.3)
      r.wallpaper.trim = trimFor(own ?? base, rand, r.wallpaper.color)
    }
    // 窗帘颜色跟房间风格走（和室不挂）
    if (r.kind === 'western' || r.kind === 'ldk') {
      const cs = CURTAINS[own ?? base]
      r.curtain = cs[Math.floor(rand() * cs.length)]
    }
  }
}
