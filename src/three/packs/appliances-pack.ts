// 大家电素材：冰箱、洗衣机、干衣机、酒柜（id 前缀 ap2-）。
// 以前冰箱、洗衣机是平面图上的设备（带款式 / 颜色），现在设备只表示「冰箱位 / 洗衣机位」这块预留空间，
// 机器本身是普通家具：一键布置按位的大小、住户风格挑一台放上去，用户也可以自己换款、换色、挪到别处。
// 模型在 ../appliances.ts；配色每组只有一个颜色（机身色），把手、面板的深浅由模型按机身色推出来。

import type * as THREE from 'three'
import type { AssetDef, Poly, StyleTag } from '../kit'
import { fridgeModel, washerModel, wineCoolerModel, type FridgeStyle, type WasherStyle } from '../appliances'

/** 机身配色：[风格, 颜色, 名字]。以前设备的 10 种颜色（APPLIANCE_COLORS）原样在前面，旧存档迁移按颜色精确匹配 */
export const APPLIANCE_PALETTES: [StyleTag, string, string][] = [
  ['modern', '#f6f6f3', '白'],
  ['modern', '#c9ccd1', '银'],
  ['industrial', '#8a8d93', '深灰'],
  ['industrial', '#2f3134', '黑'],
  ['classic', '#e8d9bf', '香槟'],
  ['nordic', '#efe4d0', '米'],
  ['cute', '#bfe8d8', '薄荷'],
  ['cute', '#f6c9d2', '粉'],
  ['cute', '#cfe3f2', '天蓝'],
  ['retro', '#f3e3a6', '柠檬'],
  ['japanese', '#f4eee2', '奶油白'],
  ['chinese', '#f2eadb', '象牙白'],
  ['chinese', '#d9c39a', '香槟金'],
  ['farmhouse', '#b9c9b0', '鼠尾草绿'],
  ['farmhouse', '#f1ece2', '做旧白'],
  ['retro', '#d9574b', '复古红'],
  ['nordic', '#b9c8d6', '雾蓝'],
]

const PALETTES = APPLIANCE_PALETTES.map(([, c]) => [c])
const PALETTE_STYLES = APPLIANCE_PALETTES.map(([s]) => s)
const ALL_STYLES: StyleTag[] = [...new Set(PALETTE_STYLES)]

/** 顶面可摆区域：四周各收 2cm */
const top = (w: number, d: number): Poly[] => [
  [
    [-w / 2 + 2, -d / 2 + 2],
    [w / 2 - 2, -d / 2 + 2],
    [w / 2 - 2, d / 2 - 2],
    [-w / 2 + 2, d / 2 - 2],
  ],
]

function appliance(id: string, name: string, family: string, sizeLabel: string, [w, d, h]: [number, number, number], build: (body: string) => THREE.Group, styles = ALL_STYLES): AssetDef {
  return {
    id,
    name,
    sizeLabel,
    category: 'appliance',
    w,
    d,
    h,
    palettes: PALETTES,
    paletteStyles: PALETTE_STYLES,
    styles,
    surface: h,
    surfaceShape: top(w, d),
    // 全屋只摆一台（一键布置时）；手动摆放不受限制
    limit: { scope: 'house', max: 1, group: family },
    build: (p) => build(p[0] ?? '#f6f6f3'),
  }
}

type Spec<S> = { id: string; style: S; label: string; size: [number, number, number]; styles?: StyleTag[] }

/** 冰箱：尺寸参考日本 / 欧美常见机型（宽 × 深 × 高，cm） */
export const FRIDGE_SPECS: Spec<FridgeStyle>[] = [
  { id: 'ap2-fridge-mini', style: 'mini', label: '单门迷你', size: [48, 50, 85] },
  { id: 'ap2-fridge-2door', style: '2door', label: '两门小冰箱', size: [54, 58, 124] },
  { id: 'ap2-fridge-3door', style: '3door', label: '三门', size: [60, 65, 172] },
  { id: 'ap2-fridge-retro', style: 'retro', label: '复古圆角', size: [60, 66, 152], styles: ['retro', 'cute', 'farmhouse', 'classic', 'nordic'] },
  { id: 'ap2-fridge-french', style: 'french', label: '法式六门', size: [65, 70, 183] },
  { id: 'ap2-fridge-side', style: 'side', label: '对开门', size: [84, 72, 180], styles: ['modern', 'industrial', 'classic', 'farmhouse', 'chinese'] },
]

/** 洗衣机（family washer）和干衣机（family dryer） */
export const WASHER_SPECS: (Spec<WasherStyle> & { family: 'washer' | 'dryer' })[] = [
  { id: 'ap2-washer-mini', family: 'washer', style: 'mini', label: '迷你', size: [40, 40, 62] },
  { id: 'ap2-washer-compact', family: 'washer', style: 'compact', label: '小型立式', size: [52, 50, 88] },
  { id: 'ap2-washer-top', family: 'washer', style: 'top', label: '立式波轮', size: [56, 58, 96] },
  { id: 'ap2-washer-drum', family: 'washer', style: 'drum', label: '滚筒', size: [60, 62, 85] },
  { id: 'ap2-washer-twin', family: 'washer', style: 'twin', label: '双槽', size: [75, 44, 90], styles: ['retro', 'japanese', 'chinese', 'farmhouse', 'cute'] },
  { id: 'ap2-washer-stack', family: 'washer', style: 'stack', label: '洗衣机 + 干衣机叠放', size: [60, 62, 176] },
  { id: 'ap2-washer-us', family: 'washer', style: 'us', label: '欧美大容量滚筒', size: [68, 70, 98], styles: ['modern', 'industrial', 'classic', 'farmhouse', 'nordic'] },
  { id: 'ap2-dryer', family: 'dryer', style: 'dryer', label: '滚筒干衣机', size: [60, 62, 85] },
  { id: 'ap2-dryer-us', family: 'dryer', style: 'us-dryer', label: '欧美大容量烘干机', size: [68, 70, 98], styles: ['modern', 'industrial', 'classic', 'farmhouse', 'nordic'] },
]

export const APPLIANCES_PACK: AssetDef[] = [
  ...FRIDGE_SPECS.map((s) => appliance(s.id, '冰箱', 'fridge', s.label, s.size, (c) => fridgeModel(s.style, c, ...s.size), s.styles)),
  ...WASHER_SPECS.map((s) => appliance(s.id, s.family === 'washer' ? '洗衣机' : '干衣机', s.family, s.label, s.size, (c) => washerModel(s.style, c, ...s.size), s.styles)),
  appliance('ap2-wine-cooler', '酒柜', 'wine-cooler', '台下式', [40, 56, 85], (c) => wineCoolerModel(c, 40, 56, 85), ['modern', 'industrial', 'classic', 'chinese']),
  appliance('ap2-wine-cooler-tall', '酒柜', 'wine-cooler', '立式', [60, 62, 150], (c) => wineCoolerModel(c, 60, 62, 150), ['modern', 'industrial', 'classic', 'chinese']),
]
