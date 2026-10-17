// 收纳位上的柜子（id 前缀 cb-）：鞋柜、衣柜 / 押入れ、食品柜。
// 平面图上的「收纳位」（设备 builtin：鞋柜位 / 衣柜位 / 食品柜位）只表示预留的空间，柜子本身是这里的家具：
// 一键布置按位的宽度挑一件放上去（cabinet.ts），用户也可以换款、换色、挪走。都是可开合的（柜门 / 抽屉），
// 门里的层板、挂衣杆、抽屉格都能放东西。宽度系列对齐常见收纳位宽度，做成同款不同尺寸（series + sizeLabel）。
//
// 几款「造作」柜子（cb-shoe-tall、cb-closet-hinged、cb-pantry-glass）的层板高度和以前画在收纳位上的柜子一致：
// 旧存档迁移时换成它们，原来摆在里面的鞋、挂着的衣服仍然落在层板 / 挂衣杆上。

import type { AssetDef, StyleTag } from '../kit'
import type { Tag } from '../tags'
import { cabinetModel, cabinetSurfaces, type CabSection, type CabSpec, type DoorStyle } from '../cabinetKit'
import { type Pal3 } from '../packkit'

const WOOD: Pal3[] = [
  ['nordic', '#f3efe6', '#e6d3b3', '#b89f7e'],
  ['nordic', '#ead7b8', '#f3ead9', '#8f7a5e'],
  ['modern', '#f4f4f2', '#e8e8e6', '#9aa0a8'],
  ['modern', '#3d3f44', '#d7d8db', '#c3c7cc'],
  ['modern', '#7a5a43', '#e9e2d6', '#c3c7cc'],
  ['japanese', '#e9d2a6', '#f2e3c4', '#6e4f37'],
  ['japanese', '#b88a5a', '#e9d2a6', '#3e3a39'],
  ['cute', '#ffd6e0', '#fff1dc', '#e7bf93'],
  ['cute', '#cfe3f2', '#fbf7f1', '#e7bf93'],
  ['industrial', '#5b4a3e', '#a8a5a0', '#3a3a3c'],
  ['retro', '#a8683a', '#f4e7c8', '#e0a526'],
  ['farmhouse', '#f1ece2', '#b88d5e', '#3c3a38'],
  ['farmhouse', '#9caf91', '#f1ece2', '#3c3a38'],
  ['classic', '#f4ede0', '#e9dcc3', '#c8a96a'],
  ['chinese', '#6b3a2a', '#c9a27a', '#c9a25a'],
]
/** 襖（押入れ）：[纸色, 柜体色, 边框色] */
const FUSUMA: Pal3[] = [
  ['japanese', '#f6f0e1', '#e9d2a6', '#6e4f37'],
  ['japanese', '#efe6cf', '#d9b98c', '#3e3a39'],
  ['japanese', '#e8eef0', '#e9d2a6', '#3d5a80'],
  ['nordic', '#f7f5f0', '#ead7b8', '#b89f7e'],
  ['retro', '#f4e7c8', '#d9b98c', '#a8683a'],
]

const pals = (list: Pal3[], only?: StyleTag[]) => {
  const xs = only ? list.filter(([s]) => only.includes(s)) : list
  return { palettes: xs.map(([, a, b, c]) => [a, b, c]), paletteStyles: xs.map(([s]) => s), styles: [...new Set(xs.map(([s]) => s))] }
}

interface Family {
  id: string
  name: string
  type: Tag
  tags: Tag[]
  category: AssetDef['category']
  d: number
  h: number
  widths: number[]
  base?: number
  sections: (w: number) => CabSection[]
  pal: Pal3[]
  styles?: StyleTag[]
  pipeZ?: number
}

function family(f: Family): AssetDef[] {
  return f.widths.map((w): AssetDef => {
    const spec: CabSpec = { w, d: f.d, h: f.h, base: f.base, sections: f.sections(w), pipeZ: f.pipeZ }
    return {
      id: `${f.id}-${w}`,
      name: f.name,
      category: f.category,
      type: f.type,
      series: f.id,
      sizeLabel: `${w}`,
      w,
      d: f.d,
      h: f.h,
      ...pals(f.pal, f.styles),
      surface: f.h,
      surfaces: cabinetSurfaces(spec),
      openable: true,
      tags: [f.type, ...f.tags],
      build: (p) => cabinetModel(spec, p),
    }
  })
}

const doors = (door: DoorStyle, extra: Partial<CabSection> & { y1: number }): CabSection => ({ front: 'doors', door, ...extra })

// ---------- 鞋柜（下駄箱） ----------

/** 造作高鞋柜：下柜 + 中间开放台面（放钥匙、摆件）+ 上柜，层板高度和旧的内置鞋柜一致 */
const shoeTall = family({
  id: 'cb-shoe-tall',
  name: '玄关高鞋柜（带台面格）',
  type: 'shoe-storage',
  tags: ['cabinet'],
  category: 'entrance',
  d: 38,
  h: 225,
  base: 8,
  widths: [60, 75, 90, 100, 120],
  sections: () => [doors('flat', { y1: 88, shelves: [26, 44, 62] }), { y1: 108, front: 'open' }, doors('flat', { y1: 223.2, shelves: [130, 160, 190] })],
  pal: WOOD,
})

/** 玄关矮鞋柜：台面上可以摆东西 */
const shoeLow = family({
  id: 'cb-shoe-low',
  name: '玄关矮鞋柜',
  type: 'shoe-storage',
  tags: ['cabinet'],
  category: 'entrance',
  d: 38,
  h: 95,
  base: 8,
  widths: [60, 75, 90, 120],
  sections: () => [doors('frame', { y1: 93.2, shelves: [27, 45, 63, 79] })],
  pal: WOOD,
})

/** 百叶门鞋柜（透气） */
const shoeLouver = family({
  id: 'cb-shoe-louver',
  name: '百叶门鞋柜',
  type: 'shoe-storage',
  tags: ['cabinet'],
  category: 'entrance',
  d: 36,
  h: 120,
  base: 6,
  widths: [60, 75, 90],
  sections: () => [doors('louver', { y1: 118.2, shelves: [25, 43, 61, 79, 97] })],
  pal: WOOD,
  styles: ['nordic', 'farmhouse', 'retro', 'cute', 'japanese'],
})

/** 薄型翻斗鞋柜：每层一个往外翻的斗 */
const shoeFlip = family({
  id: 'cb-shoe-flip',
  name: '薄型翻斗鞋柜',
  type: 'shoe-storage',
  tags: ['cabinet'],
  category: 'entrance',
  d: 30,
  h: 120,
  base: 5,
  widths: [60, 75, 90],
  sections: (w) => [
    { y1: 42, front: 'flaps', n: w > 80 ? 2 : 1, flap: 32 },
    { y1: 80, front: 'flaps', n: w > 80 ? 2 : 1, flap: 32 },
    { y1: 118.2, front: 'flaps', n: w > 80 ? 2 : 1, flap: 32 },
  ],
  pal: WOOD,
  styles: ['modern', 'nordic', 'cute', 'industrial'],
})

// ---------- 衣柜 ----------

/** 平开门衣柜：挂衣杆 + 枕棚，上面一段小门（天袋）；杆和枕棚的高度和旧的壁内收纳一致 */
const closetHinged = family({
  id: 'cb-closet-hinged',
  name: '平开门衣柜（带天袋）',
  type: 'wardrobe',
  tags: ['cabinet'],
  category: 'bedroom',
  d: 60,
  h: 225,
  base: 6,
  widths: [90, 120, 140, 160, 180, 200],
  pipeZ: 0.9,
  sections: (w) => [doors('frame', { y1: 176.2, pipe: 170, n: Math.max(2, Math.round(w / 45)) }), doors('flat', { y1: 223.2, n: Math.max(2, Math.round(w / 45)) })],
  pal: WOOD,
})

/** 推拉门衣柜：两扇（宽的四扇）推拉门，挂衣杆 + 枕棚 */
const closetSliding = family({
  id: 'cb-closet-sliding',
  name: '推拉门衣柜',
  type: 'wardrobe',
  tags: ['cabinet'],
  category: 'bedroom',
  d: 60,
  h: 225,
  base: 6,
  widths: [120, 150, 180, 200],
  pipeZ: 0.9,
  sections: (w) => [{ y1: 176.2, front: 'sliding', door: 'flat', pipe: 170, n: w >= 180 ? 4 : 2, upto: 1 }, { y1: 223.2, front: 'covered' }],
  pal: WOOD,
  styles: ['modern', 'nordic', 'japanese', 'industrial', 'cute'],
})

/** 镜面推拉门衣柜 */
const closetMirror = family({
  id: 'cb-closet-mirror',
  name: '镜面推拉门衣柜',
  type: 'wardrobe',
  tags: ['cabinet'],
  category: 'bedroom',
  d: 60,
  h: 225,
  base: 6,
  widths: [150, 180, 200],
  pipeZ: 0.9,
  sections: () => [{ y1: 176.2, front: 'sliding', door: 'mirror', pipe: 170, n: 2, upto: 1 }, { y1: 223.2, front: 'covered' }],
  pal: WOOD,
  styles: ['modern', 'classic', 'nordic'],
})

/** 押入れ式衣柜：襖门，中段把柜子分成上下两层，上面一块枕棚，顶上是带小襖的天袋 */
const oshiire = family({
  id: 'cb-oshiire',
  name: '押入れ式衣柜（中段 + 枕棚）',
  type: 'wardrobe',
  tags: ['cabinet'],
  category: 'japanese',
  d: 60,
  h: 225,
  base: 4,
  widths: [90, 135, 180],
  sections: (w) => [
    { y1: 78.2, front: 'sliding', door: 'fusuma', n: w >= 170 ? 4 : 2, upto: 1 },
    { y1: 176.2, front: 'covered', shelves: [150] },
    { y1: 223.2, front: 'sliding', door: 'fusuma', n: w >= 170 ? 4 : 2 },
  ],
  pal: FUSUMA,
})

// ---------- 食品柜（パントリー） ----------

/** 玻璃门食品柜：下柜实木门、上柜玻璃门；层板高度和旧的内置食品柜一致 */
const pantryGlass = family({
  id: 'cb-pantry-glass',
  name: '玻璃门食品柜',
  type: 'pantry',
  tags: ['cabinet'],
  category: 'dining',
  d: 40,
  h: 225,
  base: 8,
  widths: [60, 80, 90, 120],
  sections: () => [doors('flat', { y1: 78.2, shelves: [30, 55] }), doors('glass', { y1: 223.2, shelves: [115, 150, 185] })],
  pal: WOOD,
})

/** 实木门食品柜（乡村风的框门） */
const pantryFrame = family({
  id: 'cb-pantry-frame',
  name: '框门食品柜',
  type: 'pantry',
  tags: ['cabinet'],
  category: 'dining',
  d: 40,
  h: 210,
  base: 8,
  widths: [60, 80, 90, 120],
  sections: () => [doors('frame', { y1: 88, shelves: [32, 60] }), doors('frame', { y1: 208.2, shelves: [120, 150, 180] })],
  pal: WOOD,
  styles: ['farmhouse', 'classic', 'nordic', 'retro', 'chinese'],
})

/** 带抽屉的食品柜：下面两层深抽屉（米、瓶罐），上面门柜 */
const pantryDrawer = family({
  id: 'cb-pantry-drawer',
  name: '抽屉食品柜',
  type: 'pantry',
  tags: ['cabinet'],
  category: 'dining',
  d: 45,
  h: 180,
  base: 6,
  widths: [45, 60, 80, 90],
  sections: () => [{ y1: 72, front: 'drawers', rows: 2 }, doors('flat', { y1: 178.2, shelves: [108, 143] })],
  pal: WOOD,
  styles: ['modern', 'nordic', 'cute', 'japanese', 'industrial'],
})

export const CABINET_ASSETS: AssetDef[] = [...shoeTall, ...shoeLow, ...shoeLouver, ...shoeFlip, ...closetHinged, ...closetSliding, ...closetMirror, ...oshiire, ...pantryGlass, ...pantryFrame, ...pantryDrawer]
