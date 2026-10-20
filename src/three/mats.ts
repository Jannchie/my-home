// 素材部件的材质类别（木、布、金属、皮革……）：写实光照（realistic.ts）按它定粗糙度、金属度、反光，画木纹、褶皱、皮纹、绒毛。
// 卡通光照不看它，模型、配色都不变。
//
// 每个零件的材质按下面的顺序定（前面的优先），在家具模板建好、合并网格之前写到零件的 userData.mat 上（resolveMats），
// 合并成顶点色网格时再写成逐顶点的 mat 属性（toon.ts mergeSolidColors），一件家具里木框、布垫、金属脚各是各的：
//   1. 零件或它的祖先显式标了的（tagMat）：同一个配色槽里混着几种材质时用；
//   2. 素材按配色槽标的 mats（AssetDef.mats，和 palettes 里每组颜色一一对应；matTables/ 是集中写的表）：
//      零件颜色等于第 i 个配色槽、或是由它 shade() 调出的深浅色，就取 mats[i]（标成木、这组配色却是白黑灰的，按涂装：刷了漆的木头）；
//   3. 固定颜色表（kit.ts 的 C、S 里有明确材质含义的颜色：橡木、胡桃、铁、黄铜、混凝土……）；
//   4. 零件材质本身的特征：半透明 → 玻璃；
//   5. 颜色像木头（橙褐、中等饱和）→ 木：没标注的素材的兜底（写了整件默认材质的、食物、奖杯硬币不做这一步）；
//   6. 素材的默认材质（AssetDef.mat；不填按类型：床、被褥是寝具，沙发、靠垫、窗帘、衣物这类是布，地毯、毛绒是长绒，家电是塑料，其余是涂装）。

import * as THREE from 'three'
import { C, S, type AssetDef } from './kit'
import { shadeSource } from './toon'
import type { Mat } from './matIds'

export { MATS, MAT_ID, type Mat } from './matIds'

/** 显式标材质：o 自己和它下面所有零件都算这种材质（除非下面的零件自己又标了） */
export function tagMat<T extends THREE.Object3D>(o: T, mat: Mat): T {
  o.userData.mat = mat
  return o
}

const hex = (c: string) => new THREE.Color(c).getHexString()

/** 固定颜色 → 材质：只收有明确材质含义的颜色（同一种颜色在不同素材里当不同东西用的，比如纯白、纯黑，不收） */
const FIXED: Record<string, Mat> = {}
const fix = (m: Mat, ...cs: string[]) => cs.forEach((c) => (FIXED[hex(c)] = m))
fix('wood', C.wood, C.woodD, C.woodL, S.nordic.oak, S.nordic.oakL, S.modern.walnut, S.japanese.hinoki, S.japanese.wood, S.japanese.dark, S.industrial.walnut, S.chinese.rosewood, S.chinese.walnut, S.classic.walnut, S.farmhouse.oak)
fix('metal', C.steel, S.modern.silver, S.industrial.iron, S.industrial.steel, S.chinese.brass, S.classic.gold, S.farmhouse.iron)
fix('glass', C.glass)
fix('leather', S.industrial.leather)
fix('stone', S.industrial.concrete, S.industrial.brick, S.chinese.jade)
fix('fabric', S.nordic.linen, S.farmhouse.linen, S.japanese.tatami)

/** 按类型 / 标签定的默认材质（tags.ts 的词表） */
const BEDDING_TAGS = new Set(['bed', 'bedding', 'crib', 'kid-bed'])
const FABRIC_TAGS = new Set(['sofa', 'armchair', 'floor-cushion', 'floor-chair', 'towel', 'clothing', 'curtain', 'hat', 'bag', 'yoga-mat', 'play-mat', 'bath-mat', 'line-dry'])
const PILE_TAGS = new Set(['rug', 'plush'])
const PLANT_TAGS = new Set(['plant'])
/** 奖杯、奖牌、硬币：金、铜色是金属，不是木头 */
const METAL_TAGS = new Set(['trophy', 'coin'])
/** 食物、饮品：面包、炸物、巧克力是橙褐色，不做木色推断 */
const FOOD_TAGS = new Set(['food', 'drink'])
/** 家电：机身是半光的塑料 / 烤漆（冰箱、空调、洗衣机……） */
const PLASTIC_TAGS = new Set(['aircon', 'fridge', 'washer', 'dryer', 'microwave', 'steam-oven', 'toaster', 'rice-cooker', 'kettle', 'electric-kettle', 'coffee-maker', 'air-fryer', 'pressure-cooker', 'blender', 'stand-mixer', 'vacuum', 'humidifier', 'purifier', 'dehumidifier', 'hair-dryer', 'fan', 'heater', 'tv', 'monitor', 'pc', 'aio-pc', 'laptop', 'game-console', 'router', 'nas', 'projector-screen', 'hifi', 'keyboard', 'mouse', 'headset'])
export function defaultMat(def: Pick<AssetDef, 'mat' | 'type' | 'tags'>): Mat {
  if (def.mat) return def.mat
  const tags = [def.type, ...(def.tags ?? [])].filter(Boolean) as string[]
  if (tags.some((t) => PILE_TAGS.has(t))) return 'pile'
  if (tags.some((t) => BEDDING_TAGS.has(t))) return 'bedding'
  if (tags.some((t) => FABRIC_TAGS.has(t))) return 'fabric'
  if (tags.some((t) => PLASTIC_TAGS.has(t))) return 'plastic'
  if (tags.some((t) => METAL_TAGS.has(t))) return 'metal'
  if (tags.some((t) => PLANT_TAGS.has(t))) return 'plant'
  return 'paint'
}

/** 颜色像木头：橙褐色相、中等饱和、不过亮不过暗（和 realistic.ts 以前按颜色猜木纹的阈值一致） */
export function woodish(c: THREE.Color) {
  const s = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  const hsv = { h: 0, s: 0, l: 0 }
  c.getHSL(hsv, THREE.SRGBColorSpace)
  const mx = Math.max(s.r, s.g, s.b)
  const mn = Math.min(s.r, s.g, s.b)
  const sat = mx > 0 ? (mx - mn) / mx : 0
  return hsv.h > 0.03 && hsv.h < 0.13 && sat > 0.22 && sat < 0.85 && mx > 0.2 && mx < 0.97
}

/** 低饱和（白、黑、灰）：sRGB 里最大最小通道差不到 12% */
function lowSat(c: THREE.Color) {
  const s = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  const mx = Math.max(s.r, s.g, s.b)
  return mx - Math.min(s.r, s.g, s.b) < 0.12 * Math.max(mx, 0.2)
}

/** 零件颜色属于第几个配色槽（等于它，或由它 shade() 出来）；不属于返回 -1 */
function slotOf(c: string, slots: Map<string, number>) {
  for (let h: string | undefined = c, k = 0; h && k < 8; h = shadeSource(h), k++) {
    const i = slots.get(h)
    if (i !== undefined) return i
  }
  return -1
}

/**
 * 给模型里每个网格写上材质（userData.mat）。pal：这次建模用的配色（effectivePalette），def：素材定义。
 * 在 def.build 之后、合并网格之前调用；已经标了的（自己或祖先 tagMat）不动。
 */
export function resolveMats(root: THREE.Object3D, def: Pick<AssetDef, 'mats' | 'mat' | 'type' | 'tags'>, pal: string[]) {
  const slots = new Map<string, number>()
  pal.forEach((c, i) => {
    const h = hex(c)
    if (!slots.has(h)) slots.set(h, i)
  })
  const fallback = defaultMat(def)
  const tags = [def.type, ...(def.tags ?? [])].filter(Boolean) as string[]
  // 标注里写了整件的默认材质（标的人看过了）、奖杯硬币、食物：不做木色推断
  const noWood = !!def.mat || tags.some((t) => METAL_TAGS.has(t) || FOOD_TAGS.has(t))
  const walk = (o: THREE.Object3D, inherited: Mat | undefined) => {
    const own = o.userData.mat as Mat | undefined
    const tagged = own ?? inherited
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !o.userData.isOutline) {
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const color = (m as THREE.MeshToonMaterial | undefined)?.color
      // 显式标成木、颜色却是白黑灰的：刷了漆的木头
      if (tagged === 'wood' && color && lowSat(color)) o.userData.mat = 'paint'
      else if (!own) o.userData.mat = tagged ?? matOfPart(m, slots, def.mats, fallback, noWood)
    }
    for (const c of o.children) walk(c, tagged)
  }
  walk(root, undefined)
}

function matOfPart(m: THREE.Material | undefined, slots: Map<string, number>, mats: AssetDef['mats'], fallback: Mat, noWood: boolean): Mat {
  const color = (m as THREE.MeshToonMaterial | undefined)?.color
  if (!m || !color) return fallback
  const h = color.getHexString()
  const i = slotOf(h, slots)
  const byslot = i >= 0 ? mats?.[i] : undefined
  // 标成木的槽在这组配色里是白、黑、灰（刷了漆的木头）：按涂装画，不画木纹
  if (byslot === 'wood' && lowSat(color)) return 'paint'
  if (byslot) return byslot
  for (let c: string | undefined = h, k = 0; c && k < 8; c = shadeSource(c), k++) if (FIXED[c]) return FIXED[c]
  if (m.transparent) return 'glass'
  // 布艺素材（沙发、毛绒……）的配色槽零件没标注时按布算：驼色、焦糖色的布面不能当成木头。
  // 床例外：床架多半是木色，被褥很少是橙褐色
  if (i >= 0 && (fallback === 'fabric' || fallback === 'pile')) return fallback
  if (!noWood && woodish(color)) return 'wood'
  return fallback
}
