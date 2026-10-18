// 按地区分派户型生成：日式（generate.ts，行为不变）/ 中式（generate-cn.ts）/ 欧美（generate-west.ts）；
// 住宅类型是户建 / 复式时走 generate-house.ts（两层）。
//
// 地区「随机」时按种子的散列决定（相邻种子也会落到不同地区）。带面积限制的生成往后试种子时只试散列到同一地区的种子，
// 结果种子重新生成仍是同一地区、同一方案。住宅类型「随机」同理（另一个散列，公寓约占六成半）。
// 不填 dwelling（或填 apartment）就是原来的平层公寓：同一种子的结果和以前完全一样。

import { generateWithArea, seedUnit, type GenOptions, type GenResult } from './generate'
import { generateRegionWithArea } from './generate-band'
import { CN } from './generate-cn'
import { WEST } from './generate-west'
import { dwellingsFor, generateHouseWithArea, houseBedrooms, type Dwelling } from './generate-house'
import type { Region } from './model'

export const REGIONS: Region[] = ['jp', 'cn', 'west']

export function regionFor(opts: Pick<GenOptions, 'seed' | 'region'>): Region {
  if (!opts.region) return 'jp'
  if (opts.region !== 'random') return opts.region
  return REGIONS[Math.floor(seedUnit(opts.seed, 0x2c1b) * REGIONS.length)]
}

/** 住宅类型：随机时按种子（户建约两成半、复式约一成，其余公寓）；面积上限小于 90㎡ 时只出公寓 */
export function dwellingFor(opts: Pick<GenOptions, 'seed' | 'dwelling' | 'maxArea'>, region: Region): Dwelling {
  const d = opts.dwelling
  if (!d || d === 'apartment') return 'apartment'
  const ok = dwellingsFor(region)
  if (d !== 'random') return ok.includes(d) ? d : 'house'
  if (opts.maxArea !== null && opts.maxArea !== undefined && opts.maxArea < 90) return 'apartment'
  const v = Math.floor(seedUnit(opts.seed, 0x51ed) * 100)
  if (v < 25) return 'house'
  if (v < 35 && ok.includes('duplex')) return 'duplex'
  return 'apartment'
}

export function generatePlan(opts: GenOptions): GenResult {
  const region = regionFor(opts)
  const dw = dwellingFor(opts, region)
  // 随机地区 / 住宅类型：往后试种子时跳过散列到别的地区、类型的种子
  const randomType = opts.region === 'random' || opts.dwelling === 'random'
  const keep = randomType ? (seed: number) => regionFor({ ...opts, seed }) === region && dwellingFor({ ...opts, seed }, region) === dw : undefined
  if (dw !== 'apartment') {
    const choices = houseBedrooms(region)
    const b = opts.bedrooms
    const bedrooms = b === undefined || b === 'random' || !choices.includes(b) ? 'random' : b
    return generateHouseWithArea({ seed: opts.seed, region, dwelling: dw, bedrooms, minArea: opts.minArea, maxArea: opts.maxArea }, undefined, keep)
  }
  if (region === 'jp') return generateWithArea(opts, undefined, keep)
  return generateRegionWithArea(region === 'cn' ? CN : WEST, { ...opts, bedrooms: opts.bedrooms === 5 ? 4 : opts.bedrooms }, undefined, keep)
}
