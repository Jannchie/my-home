// 兴趣等级、荣誉展示、地区特色物件：等级推算受年龄 / 户型约束，等级越高相关物件越多，特色物件按地区出现且留出座位
import { describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { generatePlan } from '/src/generate-region'
import { matchSel } from '/src/three/tags'
import { INTEREST_TIERS, generateHousehold, levelCap, levelOf, type Household, type InterestId, type Lv } from '/src/household'
import { ASSET_MAP } from '/src/three/assets'
import { JP_OPTS, genJp, penetration, range, rectCorners } from './helpers'
import { supportOf } from '/src/surface'
import type { Furniture, Plan } from '/src/model'

const gen = (seed: number, region: 'jp' | 'cn' | 'west', bedrooms: 1 | 2 | 3 | 4 = 3): Plan => generatePlan({ seed, ...JP_OPTS, region, bedrooms }).plan

/** 把住户的某个兴趣强制设成指定等级（第一个成年人） */
function withLevel(hh: Household, it: InterestId, lv: Lv): Household {
  const members = hh.members.map((m, i) =>
    i === 0 ? { ...m, interests: [it, ...m.interests.filter((x) => x !== it)].slice(0, 3), levels: { ...m.levels, [it]: lv } } : { ...m, interests: m.interests.filter((x) => x !== it), levels: { ...m.levels } },
  )
  return { ...hh, members }
}
/** 某兴趣各级套装里出现的素材（按选择器命中） */
function tierHits(f: Furniture[], it: InterestId) {
  const sels = (INTEREST_TIERS[it] ?? []).flatMap((t) => [...(t.floor ?? []), ...(t.props ?? []), ...(t.wall ?? [])])
  return f.filter((x) => sels.some((sel) => matchSel(ASSET_MAP.get(x.asset)!, sel))).length
}

describe('兴趣等级推算', () => {
  test('每个兴趣都有 1–4 级；10 岁以下最多 Lv.2', () => {
    const bad: string[] = []
    for (const seed of range(1, 40)) {
      const plan = genJp(seed)
      for (const m of generateHousehold(plan, seed).members)
        for (const it of m.interests) {
          const lv = levelOf(m, it)
          if (lv < 1 || lv > 4) bad.push(`seed ${seed} ${m.name} ${it}=${lv}`)
          if (m.age < 10 && lv > 2) bad.push(`seed ${seed} ${m.age} 岁 ${it}=${lv}`)
        }
    }
    expect(bad).toEqual([])
  })

  test('等级受户型上限约束：小户型没有 Lv.4', () => {
    const bad: string[] = []
    for (const seed of range(1, 40)) {
      const plan = genJp(seed)
      const cap = levelCap(plan)
      for (const m of generateHousehold(plan, seed).members) for (const it of m.interests) if (levelOf(m, it) > cap) bad.push(`seed ${seed} ${it}=${levelOf(m, it)} > ${cap}`)
    }
    expect(bad).toEqual([])
    expect(levelCap({ ...genJp(1), rooms: genJp(1).rooms.slice(0, 1) })).toBeLessThanOrEqual(2)
  })

})

describe('等级套装', () => {
  test('Lv.4 摆出来的相关物件比 Lv.1 多（tech / photo / streaming / gaming / puzzles）', () => {
    const bad: string[] = []
    for (const it of ['tech', 'photo', 'streaming', 'gaming', 'puzzles'] as InterestId[]) {
      let lo = 0
      let hi = 0
      for (const seed of range(1, 3)) {
        const plan = gen(seed, 'jp', 3)
        const hh = generateHousehold(plan, seed)
        lo += tierHits(decorate(plan, seed, 'auto', withLevel(hh, it, 1)), it)
        hi += tierHits(decorate(plan, seed, 'auto', withLevel(hh, it, 4)), it)
      }
      if (hi <= lo) bad.push(`${it}: Lv.4 ${hi} 件 ≤ Lv.1 ${lo} 件`)
    }
    expect(bad).toEqual([])
  })
})

/** 棋牌 Lv.3 的人家，各地区布置一次，下面几条共用 */
type RCase = { region: 'jp' | 'cn' | 'west'; seed: number; plan: Plan; f: Furniture[] }
let regionalCache: RCase[] | null = null
function regional(): RCase[] {
  if (regionalCache) return regionalCache
  regionalCache = []
  for (const [region, seeds] of [['cn', range(1, 10)], ['west', range(1, 10)], ['jp', range(1, 16)]] as const)
    for (const seed of seeds) {
      const plan = region === 'jp' ? genJp(seed) : gen(seed, region, 3)
      const f = decorate(plan, seed, 'auto', withLevel(generateHousehold(plan, seed), 'boardgames', 3))
      plan.furniture = f
      regionalCache.push({ region, seed, plan, f })
    }
  return regionalCache
}
const SEAT = /chair|stool|zabuton|^ch-|^c2-|椅|凳/
const MAHJONG = /^(int-mahjong-(table|shuffle|walls|win)|hg-mj-(covered|fold)|hg-jantaku)$/

describe('地区特色物件', () => {
  test('特色物件只在对应地区：日式没有中式棋桌，欧美没有麻将桌', () => {
    const bad = regional()
      .filter(({ region, f }) => (region === 'jp' && f.some((x) => x.asset === 'hg-qizhuo')) || (region === 'west' && f.some((x) => MAHJONG.test(x.asset))))
      .map(({ region, seed }) => `${region} seed ${seed}`)
    expect(bad).toEqual([])
  })

  test('麻将桌 / 棋桌桌边至少 2 个座位，且桌子不和别的落地家具穿插', () => {
    const bad: string[] = []
    for (const { region, seed, f } of regional()) {
      const solid = f.filter((x) => !x.z && !ASSET_MAP.get(x.asset)!.mount && !ASSET_MAP.get(x.asset)!.stick && ASSET_MAP.get(x.asset)!.h > 3)
      for (const t of solid.filter((x) => /^(hg-(mj-(covered|fold)$|pool|qizhuo|game-table|jantaku|go-ban|shogi-ban)|int-mahjong-(table|shuffle|walls|win))/.test(x.asset))) {
        const td = ASSET_MAP.get(t.asset)!
        if (/^(int-mahjong-(table|shuffle|walls|win)|hg-mj-(covered|fold)|hg-qizhuo)$/.test(t.asset)) {
          const seats = f.filter((x) => SEAT.test(x.asset + ASSET_MAP.get(x.asset)!.name) && Math.hypot(x.x - t.x, x.y - t.y) < Math.max(td.w, td.d) / 2 + 45)
          if (seats.length < 2) bad.push(`${region} seed ${seed}: ${t.asset} 只有 ${seats.length} 个座位`)
        }
        for (const o of solid) {
          if (o === t || /chair|stool|zabuton|^ch-|^c2-|椅|凳|rug|地毯/.test(o.asset + ASSET_MAP.get(o.asset)!.name)) continue
          const od = ASSET_MAP.get(o.asset)!
          const p = penetration(rectCorners(t, td.w, td.d, t.rot), rectCorners(o, od.w, od.d, o.rot))
          if (p > 4) bad.push(`${region} seed ${seed}: ${t.asset} × ${o.asset} ${p.toFixed(1)}cm`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  /** 组合：桌子 + 台面摆件。棋盘 / 牌 / 棋罐都有支撑面且整块在台面内；落地棋笥不和别的落地物（含坐垫）重叠 */
  test('棋盘、棋罐、麻将牌有支撑面且不出界；落地棋笥不穿模', () => {
    const bad: string[] = []
    for (const { region, seed, plan, f } of regional())
      for (const x of f.filter((x) => /^(hg-go-board|hg-go-bowl|hg-mj-(walls|hands)|int-(chess|xiangqi|mahjong-mat))/.test(x.asset))) {
        if (!x.z) {
          if (!/^hg-go-bowl/.test(x.asset)) continue
          const xd = ASSET_MAP.get(x.asset)!
          for (const o of f) {
            const od = ASSET_MAP.get(o.asset)!
            if (o === x || o.z || od.mount || od.stick || od.h <= 1) continue
            const p = penetration(rectCorners(x, xd.w, xd.d, x.rot), rectCorners(o, od.w, od.d, o.rot))
            if (p > 0.5) bad.push(`${region} seed ${seed}: 落地 ${x.asset} × ${o.asset} ${p.toFixed(1)}cm`)
          }
          continue
        }
        const sp = supportOf(plan, x)
        if (!sp) bad.push(`${region} seed ${seed}: ${x.asset} 悬空`)
        else if (!sp.fits) bad.push(`${region} seed ${seed}: ${x.asset} 超出台面`)
      }
    expect(bad).toEqual([])
  })

  /** 相机展示柜 / 防潮柜：放了就每一层都摆着相机或镜头，不混进别的摆件 */
  test('相机展示柜 / 防潮柜每层都有相机，没有无关摆件', () => {
    const bad: string[] = []
    for (const seed of range(1, 6)) {
      const plan = gen(seed, 'jp', 3)
      const f = decorate(plan, seed, 'auto', withLevel(generateHousehold(plan, seed), 'photo', 4))
      for (const c of f.filter((x) => /^of-(camera-showcase|dry-)/.test(x.asset))) {
        const d = ASSET_MAP.get(c.asset)!
        // 在柜子占地范围内、高度落在柜内某一层上的东西
        const a = (c.rot * Math.PI) / 180
        const local = (x: Furniture) => ({ u: (x.x - c.x) * Math.cos(a) + (x.y - c.y) * Math.sin(a), v: -(x.x - c.x) * Math.sin(a) + (x.y - c.y) * Math.cos(a) })
        const ys = [...(d.surfaces ?? []).map((l) => l.y), ...(d.surface ? [d.surface] : [])]
        const inside = f.filter((x) => x.z && Math.abs(local(x).u) < d.w / 2 && Math.abs(local(x).v) < d.d / 2 && ys.some((y) => Math.abs(y - x.z!) < 0.6))
        const levels = new Set(inside.map((x) => Math.round(x.z!)))
        const shelfCount = (d.surfaces ?? []).filter((l) => l.kind !== 'hook').length
        if (levels.size < shelfCount) bad.push(`seed ${seed} ${c.asset} 只有 ${levels.size}/${shelfCount} 层有东西`)
        const odd = inside.filter((x) => !/^of-(camera|lens|action-cam)/.test(x.asset))
        if (odd.length) bad.push(`seed ${seed} ${c.asset} 里有无关摆件 ${odd.map((x) => x.asset).join(',')}`)
      }
    }
    expect(bad).toEqual([])
  })
})
