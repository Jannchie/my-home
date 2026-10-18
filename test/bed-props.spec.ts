// 床上随手放的东西：只放 bed-ok 的小件（在看的书、玩偶、手机掌机……），每张床最多 BED_PROPS_MAX 件；
// 漫画全套这类成套的书（shelf-only）只摆在书架 / 柜架的层板上
import { beforeAll, describe, expect, test } from 'vitest'
import { BED_PROPS_MAX, bedOk, decorate, isSleepLevel, shelfOnlyOk } from '/src/decorate'
import { generateHousehold, type Household, type InterestId } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { levels, supportOf, toLocal } from '/src/surface'
import { ASSETS, ASSET_MAP, type AssetDef } from '/src/three/assets'
import { hasTag } from '/src/three/tags'
import { pointInPolygon, type Furniture, type Plan } from '/src/model'
import { JP_OPTS, genJp, range } from './helpers'

/** 第一个成年人的某个兴趣强制设成指定等级 */
function withLevel(hh: Household, it: InterestId, lv: 1 | 2 | 3 | 4): Household {
  return { ...hh, members: hh.members.map((m, i) => (i === 0 ? { ...m, interests: [it, ...m.interests.filter((x) => x !== it)].slice(0, 3), levels: { ...m.levels, [it]: lv } } : m)) }
}

interface Case {
  name: string
  plan: Plan
  f: Furniture[]
}
const cases: Case[] = []

beforeAll(() => {
  const add = (name: string, plan: Plan, hh: Household, seed: number) => {
    plan.household = hh
    plan.furniture = decorate(plan, seed, 'auto', hh)
    cases.push({ name, plan, f: plan.furniture })
  }
  for (const seed of range(1, 40)) {
    const plan = genJp(seed)
    add(`jp ${seed}`, plan, generateHousehold(plan, seed), seed)
  }
  // 动漫 / 读书爱好者家里漫画、书多：漫画全套更常出现
  for (const seed of range(1, 12)) {
    const plan = generatePlan({ seed, ...JP_OPTS, region: seed % 2 ? 'cn' : 'west', bedrooms: 3 }).plan
    add(`otaku ${seed}`, plan, withLevel(withLevel(generateHousehold(plan, seed), 'reading', 4), 'otaku', 4), seed)
  }
}, 600_000)

const def = (x: Furniture) => ASSET_MAP.get(x.asset)!

/** 摆件所在的家具和层（level 同 onLevel：undefined = 顶面 surface） */
function seatOf(c: Case, x: Furniture): { parent: Furniture; pd: AssetDef; level: number | undefined } | null {
  const sp = supportOf(c.plan, x)
  const parent = sp && c.f.find((o) => o.id === sp.ownerId)
  if (!parent) return null
  const pd = def(parent)
  const lvs = levels(parent.asset, !!parent.open)
  const l = toLocal(parent, x)
  const i = lvs.findIndex((lv) => Math.abs((parent.z ?? 0) + lv.y - (x.z ?? 0)) < 0.5 && lv.polys.some((pl) => pointInPolygon(l, pl.map(([px, pz]) => ({ x: px, y: pz })))))
  if (i < 0) return null
  // levels() 的顺序：有 surface 时第 0 个是顶面，其后是 surfaces
  const level = pd.surface ? (i === 0 ? undefined : i - 1) : i
  return { parent, pd, level }
}

describe('床上的东西', () => {
  test('床垫上只有随手放的小件：不是成套的书、书堆、收藏摆件（玩偶除外）、挂着的形态', () => {
    const bad: string[] = []
    let n = 0
    for (const c of cases)
      for (const x of c.f) {
        if (!x.z) continue
        const s = seatOf(c, x)
        if (!s || !isSleepLevel(s.pd, s.level)) continue
        n++
        const d = def(x)
        const why = !bedOk(d)
          ? '不是 bedOk'
          : hasTag(d, 'shelf-only', 'set-piece')
            ? '成套 / 只放柜架'
            : hasTag(d, 'collectible') && !hasTag(d, 'plush')
              ? '收藏摆件'
              : /^(int-manga-(row|stack-[ml])|vb-books-(tall|cross|vintage)|prop-book(s-upright|-stack)|lm-cat-bookends|int-ref-books|sf-book-(stacked|standing))$/.test(x.asset)
                ? '书堆 / 整排的书'
                : ''
        if (why) bad.push(`${c.name}: ${s.parent.asset} 上的 ${x.asset}（${d.name}）${why}`)
      }
    expect(bad).toEqual([])
    // 床上确实会摆东西（规则没有把床上全清空）
    expect(n).toBeGreaterThan(10)
  })

  test(`每张床的床垫上最多 ${BED_PROPS_MAX} 件`, () => {
    const bad: string[] = []
    for (const c of cases) {
      const per = new Map<string, number>()
      for (const x of c.f) {
        if (!x.z) continue
        const s = seatOf(c, x)
        if (s && isSleepLevel(s.pd, s.level)) per.set(s.parent.id, (per.get(s.parent.id) ?? 0) + 1)
      }
      for (const [id, k] of per) if (k > BED_PROPS_MAX) bad.push(`${c.name}: ${c.f.find((o) => o.id === id)!.asset} 上 ${k} 件`)
    }
    expect(bad).toEqual([])
  })

  test('床头三成（枕头那头）除了玩偶不放东西', () => {
    const bad: string[] = []
    for (const c of cases)
      for (const x of c.f) {
        if (!x.z || hasTag(def(x), 'plush')) continue
        const s = seatOf(c, x)
        if (!s || !isSleepLevel(s.pd, s.level)) continue
        const l = toLocal(s.parent, x)
        const a = (((x.rot - s.parent.rot) % 360) * Math.PI) / 180
        const half = Math.abs(Math.cos(a)) * (def(x).d / 2) + Math.abs(Math.sin(a)) * (def(x).w / 2)
        if (l.y - half < -s.pd.d / 2 + s.pd.d * 0.3 - 0.5) bad.push(`${c.name}: ${x.asset} 压到 ${s.parent.asset} 的枕头`)
      }
    expect(bad).toEqual([])
  })
})

describe('漫画全套只放柜架', () => {
  test('标签：漫画全套是 shelf-only，不是 bed-ok；bed-ok 的都是摆件且没有挂起形态', () => {
    const row = ASSET_MAP.get('int-manga-row')!
    expect(hasTag(row, 'shelf-only')).toBe(true)
    expect(hasTag(row, 'bed-ok')).toBe(false)
    expect(ASSETS.filter((a) => hasTag(a, 'bed-ok') && (!a.prop || a.form?.includes('hanging'))).map((a) => a.id)).toEqual([])
    expect(ASSETS.filter((a) => hasTag(a, 'shelf-only') && hasTag(a, 'bed-ok')).map((a) => a.id)).toEqual([])
  })

  test('摆出来的漫画全套都在书架 / 柜架的层板上（不在床、桌、茶几上）', () => {
    const bad: string[] = []
    let n = 0
    for (const c of cases)
      for (const x of c.f) {
        if (!hasTag(def(x), 'shelf-only')) continue
        n++
        const s = seatOf(c, x)
        if (!s) bad.push(`${c.name}: ${x.asset} 不在任何层上（z=${x.z}）`)
        else if (!shelfOnlyOk(s.pd, s.level)) bad.push(`${c.name}: ${x.asset} 在 ${s.parent.asset}（${s.pd.name}）的 ${s.level ?? '顶面'} 上`)
      }
    expect(bad).toEqual([])
    expect(n).toBeGreaterThan(0)
  })
})
