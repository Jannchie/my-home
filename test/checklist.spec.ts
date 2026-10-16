// 检查清单：一键布置 + 补外机 + 一键补齐（applyFixes）之后，剩下的缺失项要少
import { expect, test } from 'vitest'
import { checklist, type CheckItem } from '/src/checklist'
import { applyFixes, decorate } from '/src/decorate'
import { ensureOutdoorUnits, indoorUnits } from '/src/generate'
import { generateHousehold } from '/src/household'
import type { Plan } from '/src/model'
import { genJp, range } from './helpers'

const SEEDS = range(1, 30)
/** 30 户补齐后剩余缺失项总数的上限（现状 26：衣物收纳 7、空调 5、餐椅 4、床 4、书桌 2、电水壶 2…；用 generateWithArea 出的户型，留一点余量，改进后收紧） */
const MAX_LEFT = 32

const missing = (p: Plan) => checklist(p, p.household).filter((c: CheckItem) => c.have < c.need && !c.builtin)

const results = SEEDS.map((seed) => {
  const plan = genJp(seed)
  const hh = generateHousehold(plan, seed)
  plan.household = hh
  plan.furniture = decorate(plan, seed, 'auto', hh)
  ensureOutdoorUnits(plan)
  plan.furniture = applyFixes(plan, missing(plan), hh, seed)
  ensureOutdoorUnits(plan)
  return { seed, plan, left: missing(plan) }
})

test(`补齐后 ${SEEDS.length} 户剩余缺失项总数 ≤ ${MAX_LEFT}`, () => {
  const left = results.flatMap(({ seed, left }) => left.map((c) => `seed ${seed}: ${c.label}${c.fix ? `（补法 ${c.fix.how}）` : '（无补法）'}`))
  expect(left.length, left.join('\n')).toBeLessThanOrEqual(MAX_LEFT)
})

test('空调外机数 = 室内机数', () => {
  const bad = results
    .map(({ seed, plan }) => ({ seed, indoor: indoorUnits(plan), outdoor: plan.fixtures.filter((f) => f.kind === 'outdoor').length }))
    .filter((r) => r.indoor !== r.outdoor)
    .map((r) => `seed ${r.seed}: 室内机 ${r.indoor} 台，外机 ${r.outdoor} 台`)
  expect(bad).toEqual([])
})
