// 按地区分派户型生成：日式（generate.ts，行为不变）/ 中式（generate-cn.ts）/ 欧美（generate-west.ts）；
// 住宅类型是户建 / 复式时走 generate-house.ts（两层）。
//
// 地区「随机」时按种子决定（每 1000 个连号种子同一地区：带面积限制的生成会往后试几百个种子，结果仍落在同一地区，
// 用结果种子重新生成也能复现）。住宅类型「随机」同理（另一个散列，公寓约占七成）。
// 不填 dwelling（或填 apartment）就是原来的平层公寓：同一种子的结果和以前完全一样。

import { generateWithArea, type GenOptions, type GenResult } from './generate'
import { generateRegionWithArea } from './generate-band'
import { CN } from './generate-cn'
import { WEST } from './generate-west'
import { dwellingsFor, generateHouseWithArea, houseBedrooms, type Dwelling } from './generate-house'
import type { Region } from './model'

export const REGIONS: Region[] = ['jp', 'cn', 'west']

export function regionFor(opts: Pick<GenOptions, 'seed' | 'region'>): Region {
  if (!opts.region) return 'jp'
  if (opts.region !== 'random') return opts.region
  const h = Math.imul((Math.floor(opts.seed / 1000) ^ 0x2c1b3c6d) >>> 0, 2654435761) >>> 0
  return REGIONS[(h >>> 9) % REGIONS.length]
}

/** 住宅类型：随机时按种子（户建约两成半、复式约一成，其余公寓）；面积上限小于 90㎡ 时只出公寓 */
export function dwellingFor(opts: Pick<GenOptions, 'seed' | 'dwelling' | 'maxArea'>, region: Region): Dwelling {
  const d = opts.dwelling
  if (!d || d === 'apartment') return 'apartment'
  const ok = dwellingsFor(region)
  if (d !== 'random') return ok.includes(d) ? d : 'house'
  if (opts.maxArea !== null && opts.maxArea !== undefined && opts.maxArea < 90) return 'apartment'
  const h = Math.imul((Math.floor(opts.seed / 1000) ^ 0x51ed27a3) >>> 0, 2246822519) >>> 0
  const v = (h >>> 11) % 100
  if (v < 25) return 'house'
  if (v < 35 && ok.includes('duplex')) return 'duplex'
  return 'apartment'
}

export function generatePlan(opts: GenOptions): GenResult {
  const region = regionFor(opts)
  const dw = dwellingFor(opts, region)
  if (dw !== 'apartment') {
    const choices = houseBedrooms(region)
    const b = opts.bedrooms
    const bedrooms = b === undefined || b === 'random' || !choices.includes(b) ? 'random' : b
    return generateHouseWithArea({ seed: opts.seed, region, dwelling: dw, bedrooms, minArea: opts.minArea, maxArea: opts.maxArea })
  }
  if (region === 'jp') return generateWithArea(opts)
  return generateRegionWithArea(region === 'cn' ? CN : WEST, { ...opts, bedrooms: opts.bedrooms === 5 ? 4 : opts.bedrooms })
}
