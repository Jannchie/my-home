// 只换风格、不动布局：把现有家具换成目标风格的同类款（或只换配色），位置、朝向、摆在上面的东西都不动。
//
// 每件家具：
//   - 素材本身的造型就适合目标风格（AssetDef.styles 含它）：只换成这个风格的配色；
//   - 否则找造型适合目标风格的替代款（换款规则和一键布置共用，decorate.ts sameShapeSlot），
//     上面摆着东西的桌柜还要台面高度差不多、占地不能变小（东西不会悬空或掉出去）；从最接近的几款里随机挑一款；
//   - 找不到就保留原款，只换配色（派生配色能覆盖大部分风格）；配色在这个风格的几套里随机挑一套。
// 自定义配色、布艺花纹清掉（它们是按原来的款配的）。设备、楼梯这些不是家具的不动。

import type { Furniture, Plan } from './model'
import { ASSETS, ASSET_MAP, type AssetDef, type StyleTag } from './three/assets'
import { paletteFor } from './three/catalog'
import { pickStyleColor } from './three/stylePalettes'
import { rng } from './three/kit'
import { isMultiFloor } from './floors'
import { roomAt } from './three/house'
import { propsOn } from './surface'
import { sameShapeSlot } from './decorate'

/** 上面摆着东西时台面高度最多差多少（cm） */
const TOL_SURFACE = 3

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, b)

/**
 * 造型适合 style 的替代款：换款规则和一键布置共用（decorate.ts sameShapeSlot：同类、尺寸相近、床分单双人、儿童款只换儿童款……）；
 * held = 上面摆着东西：还要台面高度差不多、占地不缩小（东西不会悬空或掉出去）
 */
function alternatives(def: AssetDef, style: StyleTag, held: boolean) {
  return ASSETS.filter((b) => {
    if (!b.styles?.includes(style) || !sameShapeSlot(def, b)) return false
    if (held) {
      if (b.surface === undefined || def.surface === undefined || Math.abs(b.surface - def.surface) > TOL_SURFACE) return false
      if (b.w < def.w * 0.95 || b.d < def.d * 0.95) return false
    }
    return true
  })
}

/**
 * 把 plan 里的家具换成某个风格（原地改 plan.furniture）。
 * styleOf(f) 给出这件家具要换成的风格（全屋一种、按房间各一种、只换某间都由调用方决定），返回 undefined 的不动。
 * 返回改动的件数。
 */
export function restyleFurniture(plan: Plan, styleOf: (f: Furniture) => StyleTag | undefined, seed = Date.now()) {
  const rand = rng(seed)
  let changed = 0
  for (const f of plan.furniture) {
    const style = styleOf(f)
    const def = ASSET_MAP.get(f.asset)
    if (!style || !def || def.fixture) continue
    let target = def
    if (!def.styles?.includes(style)) {
      const alts = alternatives(def, style, propsOn(plan, f).length > 0)
      if (alts.length) {
        // 尺寸最接近的前三款里随机挑一款
        const score = (b: AssetDef) => rel(b.w, def.w) + rel(b.d, def.d) + 0.5 * rel(b.h, def.h)
        alts.sort((a, b) => score(a) - score(b))
        target = alts[Math.floor(rand() * Math.min(3, alts.length))]
      }
    }
    // 这个风格的几套配色里随机挑一套（同一个风格的家具不会全是一个颜色）
    const color = pickStyleColor(target, style, rand()) ?? paletteFor(target, style)
    if (target.id === f.asset && (f.color ?? 0) === color && !f.colors && !f.patterns) continue
    f.asset = target.id
    if (color) f.color = color
    else delete f.color
    delete f.colors
    delete f.patterns
    changed++
  }
  return changed
}

/** 家具所在的房间（同一楼层、中心落在房间里，户内优先；和沙盘选中、灯光用的是同一个口径） */
export function furnitureRoom(plan: Plan, f: Furniture) {
  return roomAt(plan, f, isMultiFloor(plan) ? (f.floor ?? null) : undefined)
}
