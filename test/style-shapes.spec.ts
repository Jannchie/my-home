// 风格专属造型：新中式 / 欧式古典 / 美式乡村的人家一键布置，主力家具要换成本风格的专属造型（有原生配色的款），
// 而不是换了颜色的通用款（sofa2、bed-double、dining-table、tv-board…）。
import { beforeAll, describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import type { Furniture, Region } from '/src/model'
import { ASSET_MAP, type AssetDef, type StyleTag } from '/src/three/assets'
import { paletteStyle } from '/src/three/catalog'
import { range } from './helpers'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const
const STYLES: StyleTag[] = ['chinese', 'classic', 'farmhouse']
const REGIONS: Region[] = ['cn', 'west']
const SEEDS = range(1, 6)
/** 一键布置按默认款摆、会换成专属造型的主力家具（衣柜多是收纳位上的内置衣柜系统，不算） */
const MAIN = ['sofa', 'coffee-table', 'tv-stand', 'dining-table', 'dining-chair', 'bed', 'nightstand', 'dresser', 'desk', 'bookshelf'] as const
/** 每种风格都要用上本风格造型的类型 */
const MUST = ['sofa', 'coffee-table', 'tv-stand', 'dining-table', 'dining-chair', 'bed', 'desk'] as const

const native = (d: AssetDef, st: StyleTag) => d.palettes.some((_, i) => paletteStyle(d, i) === st)
const homes = new Map<StyleTag, Furniture[][]>()

beforeAll(() => {
  for (const st of STYLES) {
    const list: Furniture[][] = []
    for (const region of REGIONS)
      for (const seed of SEEDS) {
        const plan = generatePlan({ seed, ...OPTS, region }).plan
        const hh = generateHousehold(plan, seed)
        plan.household = hh
        list.push(decorate(plan, seed, st, hh))
      }
    homes.set(st, list)
  }
}, 300_000)

describe('专属造型风格的一键布置', () => {
  test.each(STYLES)('%s：主力家具大多是本风格的专属造型', (st) => {
    const main = homes
      .get(st)!
      .flat()
      .map((f) => ASSET_MAP.get(f.asset)!)
      .filter((d) => (MAIN as readonly string[]).includes(d.type ?? ''))
    const own = main.filter((d) => native(d, st))
    const share = own.length / main.length
    console.log(`[style-shapes] ${st}: ${own.length}/${main.length} = ${(share * 100).toFixed(1)}%`)
    expect(main.length).toBeGreaterThan(100)
    expect(share).toBeGreaterThan(0.7)
  })

  test.each(STYLES)('%s：沙发、茶几、电视柜、餐桌椅、床、书桌都用上了本风格的造型', (st) => {
    const used = new Set(
      homes
        .get(st)!
        .flat()
        .map((f) => ASSET_MAP.get(f.asset)!)
        .filter((d) => native(d, st))
        .map((d) => d.type),
    )
    expect(MUST.filter((t) => !used.has(t))).toEqual([])
  })

  test('新加的专属造型确实被选中（每种风格至少 10 款）', () => {
    const prefix: Record<string, RegExp> = { chinese: /^sw-cn-/, classic: /^sw-cl-/, farmhouse: /^sw-fh-/ }
    for (const st of STYLES) {
      const ids = new Set(homes.get(st)!.flat().map((f) => f.asset).filter((id) => prefix[st].test(id)))
      expect(ids.size, `${st}: ${[...ids].join(', ')}`).toBeGreaterThanOrEqual(10)
    }
  })
})
