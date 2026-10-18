// 麻将桌 / 棋桌上已经摆着牌、棋局时，别的东西（茶杯、零食、小摆件）不能和牌 / 棋子穿模：
// 牌做在桌子模型里的自动麻将桌只有四个桌角能放东西；牌 / 棋盘是独立摆件的，后摆的东西避开它们；手动摆放时重叠会标红
import { beforeAll, describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { generateHousehold, type Household, type InterestId } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { fitOnSurface, fitsOnSurface, propClash, supportOf } from '/src/surface'
import { ASSET_MAP } from '/src/three/assets'
import type { Furniture, Plan } from '/src/model'
import { JP_OPTS, penetration, range, rectCorners } from './helpers'

const AUTO = ['int-mahjong-table', 'int-mahjong-shuffle', 'int-mahjong-walls', 'int-mahjong-win']
const GAME_TABLE = /^(int-mahjong-(table|shuffle|walls|win)|hg-mj-(covered|fold)|hg-jantaku|hg-qizhuo|hg-game-table-round)$/
const PIECES = /^(hg-go-board|hg-go-bowl|hg-mj-(walls|hands)|int-(chess|xiangqi|shogi|mahjong-mat|poker|reversi|chinese-checkers|backgammon)|bg-)/

const mini = (furniture: Furniture[]) => ({ furniture, fixtures: [] }) as unknown as Plan
const at = (asset: string, x: number, y: number, z?: number, rot = 0): Furniture => ({ id: `${asset}@${x},${y}`, asset, x, y, rot, z })

describe('自动麻将桌：牌在桌子模型里，只有桌角能放东西', () => {
  test('桌子中间（牌山、手牌）放不下，桌角放得下；横跨几个桌角的大件也不行', () => {
    for (const id of AUTO) {
      const t = at(id, 0, 0)
      const top = ASSET_MAP.get(id)!.surface!
      expect(fitsOnSurface(t, top, 'prop-mug', 0, 0, 0)).toBe(false)
      expect(fitsOnSurface(t, top, 'prop-mug', 0, 33, 0)).toBe(false)
      expect(fitsOnSurface(t, top, 'prop-mug', 33, 33, 0)).toBe(true)
      expect(fitsOnSurface(t, top, 'prop-mug', -33, 33, 0)).toBe(true)
      expect(fitsOnSurface(t, top, 'int-mahjong-mat-walls', 0, 0, 0)).toBe(false)
    }
  })

  test('手动拖到牌上：吸到最近的桌角里；伸到牌上的标红', () => {
    const t = at('int-mahjong-walls', 100, 100)
    const top = ASSET_MAP.get(t.asset)!.surface!
    const plan = mini([t])
    // pickSurface 把桌面中间的落点交给最近的桌角，fitOnSurface 再整件收进去
    const p = fitOnSurface(plan, t.id, top, 'prop-mug', 100 + 22, 100 + 24, 0)
    expect(fitsOnSurface(t, top, 'prop-mug', p.x, p.y, 0)).toBe(true)
    expect(propClash(plan, at('prop-mug', p.x, p.y, top))).toBe(false)
    expect(propClash(plan, at('prop-mug', 100, 100, top))).toBe(true)
    expect(propClash(plan, at('prop-mug', 100 + 20, 100 + 33, top))).toBe(true)
  })
})

describe('牌 / 棋盘是独立摆件的桌子：后放的东西不和它们重叠', () => {
  test('手动摆放：和桌上的麻将牌重叠标红，放在旁边空处不红', () => {
    const t = at('hg-mj-fold', 0, 0)
    const top = ASSET_MAP.get(t.asset)!.surface!
    const tiles = at('hg-mj-walls', 0, 0, top)
    const plan = mini([t, tiles])
    expect(propClash(plan, at('prop-mug', 0, 0, top))).toBe(true)
    expect(propClash(plan, at('prop-mug', 15, 20, top))).toBe(true)
    expect(propClash(plan, at('prop-mug', 33, 33, top))).toBe(false)
  })
})

function withLevel(hh: Household, it: InterestId, lv: 1 | 2 | 3 | 4): Household {
  return { ...hh, members: hh.members.map((m, i) => (i === 0 ? { ...m, interests: [it, ...m.interests.filter((x) => x !== it)].slice(0, 3), levels: { ...m.levels, [it]: lv } } : m)) }
}

describe('一键布置后的牌桌 / 棋桌', () => {
  const cases: { name: string; plan: Plan; f: Furniture[] }[] = []
  beforeAll(() => {
    for (const region of ['cn', 'jp'] as const)
      for (const seed of range(1, 12)) {
        const plan = generatePlan({ seed, ...JP_OPTS, region, bedrooms: 3 }).plan
        const hh = withLevel(generateHousehold(plan, seed), 'boardgames', 4)
        plan.household = hh
        plan.furniture = decorate(plan, seed, 'auto', hh)
        cases.push({ name: `${region} ${seed}`, plan, f: plan.furniture })
      }
  }, 600_000)

  test('桌上的东西都整件落在可放的区域里，牌 / 棋子和别的摆件的包围盒不相交', () => {
    const bad: string[] = []
    let tables = 0
    for (const { name, plan, f } of cases)
      for (const t of f.filter((x) => !x.z && GAME_TABLE.test(x.asset))) {
        tables++
        const on = f.filter((x) => x.z && supportOf(plan, x)?.ownerId === t.id)
        for (const x of on) if (!supportOf(plan, x)!.fits) bad.push(`${name}: ${t.asset} 上的 ${x.asset} 超出可放区域（压到牌 / 桌框）`)
        for (let i = 0; i < on.length; i++)
          for (let j = i + 1; j < on.length; j++) {
            const [a, b] = [on[i], on[j]]
            if (Math.abs((a.z ?? 0) - (b.z ?? 0)) > 0.5 || (!PIECES.test(a.asset) && !PIECES.test(b.asset))) continue
            const [da, db] = [ASSET_MAP.get(a.asset)!, ASSET_MAP.get(b.asset)!]
            const p = penetration(rectCorners(a, da.w, da.d, a.rot), rectCorners(b, db.w, db.d, b.rot))
            if (p > 0.5) bad.push(`${name}: ${t.asset} 上 ${a.asset} × ${b.asset} 重叠 ${p.toFixed(1)}cm`)
          }
      }
    expect(bad).toEqual([])
    expect(tables).toBeGreaterThan(3)
  })
})
