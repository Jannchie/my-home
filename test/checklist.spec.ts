// 检查清单：一键布置 + 补外机 + 一键补齐（applyFixes）
import { expect, test } from 'vitest'
import { checklist, type CheckItem } from '/src/checklist'
import { applyFixes, decorate } from '/src/decorate'
import { ensureOutdoorUnits, indoorUnits } from '/src/generate'
import { generateHousehold } from '/src/household'
import type { Plan } from '/src/model'
import { genJp, range } from './helpers'

const SEEDS = range(1, 30)
const missing = (p: Plan) => checklist(p, p.household).filter((c: CheckItem) => c.have < c.need && !c.builtin)

const results = SEEDS.map((seed) => {
  const plan = genJp(seed)
  const hh = generateHousehold(plan, seed)
  plan.household = hh
  plan.furniture = decorate(plan, seed, 'auto', hh)
  ensureOutdoorUnits(plan)
  const before = missing(plan).length
  plan.furniture = applyFixes(plan, missing(plan), hh, seed)
  ensureOutdoorUnits(plan)
  return { seed, plan, before, left: missing(plan) }
})

test('一键补齐不会让缺失项变多', () => {
  expect(results.filter((r) => r.left.length > r.before).map((r) => `seed ${r.seed}: ${r.before} → ${r.left.length}`)).toEqual([])
})


test('空调外机数 = 室内机数', () => {
  const bad = results
    .map(({ seed, plan }) => ({ seed, indoor: indoorUnits(plan), outdoor: plan.fixtures.filter((f) => f.kind === 'outdoor').length }))
    .filter((r) => r.indoor !== r.outdoor)
    .map((r) => `seed ${r.seed}: 室内机 ${r.indoor} 台，外机 ${r.outdoor} 台`)
  expect(bad).toEqual([])
})
