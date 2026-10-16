// 宣传片用的户型与布置：全部用固定种子生成，结果可复现。
// 只组合现有模块（generatePlan / generateHousehold / decorate / autoWallpapers），不改业务逻辑。

import { generatePlan } from '../generate-region'
import { ensureOutdoorUnits, type GenOptions } from '../generate'
import { generateHousehold, type Household } from '../household'
import { decorate, roomStyles } from '../decorate'
import { autoWallpapers } from '../wallpaper'
import type { Plan, Region } from '../model'
import type { StyleTag } from '../three/assets'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function basePlan(region: Region, seed: number, minArea: number, maxArea: number, type: GenOptions['type'] = 'random'): Plan {
  const r = generatePlan({ seed, type, style: 'random', corner: 'random', access: 'random', minArea, maxArea, region, bedrooms: 3 })
  const p = r.plan
  p.household = generateHousehold(p, r.seed)
  p.furniture = []
  return p
}

/** 按住户布置；style 给定时整户都换成这种风格（公共空间、各居室、墙纸窗帘一起换） */
export function furnished(src: Plan, seed: number, style?: StyleTag): Plan {
  const p = clone(src)
  let hh = p.household as Household
  if (style) {
    hh = { ...hh, style, members: hh.members.map((m) => ({ ...m, style })) }
    p.household = hh
  }
  p.furniture = decorate(p, seed, style ?? 'auto', hh)
  ensureOutdoorUnits(p)
  const styles = roomStyles(p, hh)
  autoWallpapers(p, hh, (r) => styles.get(r.id), seed)
  return p
}
