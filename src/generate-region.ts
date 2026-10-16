// 按地区分派户型生成：日式（generate.ts，行为不变）/ 中式（generate-cn.ts）/ 欧美（generate-west.ts）。
//
// 地区「随机」时按种子决定（每 1000 个连号种子同一地区：带面积限制的生成会往后试几百个种子，结果仍落在同一地区，
// 用结果种子重新生成也能复现）。

import { generateWithArea, type GenOptions, type GenResult } from './generate'
import { generateRegionWithArea } from './generate-band'
import { CN } from './generate-cn'
import { WEST } from './generate-west'
import type { Region } from './model'

export const REGIONS: Region[] = ['jp', 'cn', 'west']

export function regionFor(opts: Pick<GenOptions, 'seed' | 'region'>): Region {
  if (!opts.region) return 'jp'
  if (opts.region !== 'random') return opts.region
  const h = Math.imul((Math.floor(opts.seed / 1000) ^ 0x2c1b3c6d) >>> 0, 2654435761) >>> 0
  return REGIONS[(h >>> 9) % REGIONS.length]
}

export function generatePlan(opts: GenOptions): GenResult {
  const region = regionFor(opts)
  if (region === 'jp') return generateWithArea(opts)
  return generateRegionWithArea(region === 'cn' ? CN : WEST, opts)
}
