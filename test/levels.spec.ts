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

  test('40 个住户里各级都出现过', () => {
    const seen = new Set<number>()
    for (const seed of range(1, 40)) for (const m of generateHousehold(genJp(seed), seed).members) for (const it of m.interests) seen.add(levelOf(m, it))
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
  })
})

describe('等级套装', () => {
  test.each(['tech', 'photo', 'streaming', 'gaming', 'puzzles'] as InterestId[])('%s：Lv.4 摆出来的相关物件比 Lv.1 多', (it) => {
    let lo = 0
    let hi = 0
    for (const seed of range(1, 8)) {
      const plan = gen(seed, 'jp', 3)
      const hh = generateHousehold(plan, seed)
      lo += tierHits(decorate(plan, seed, 'auto', withLevel(hh, it, 1)), it)
      hi += tierHits(decorate(plan, seed, 'auto', withLevel(hh, it, 4)), it)
    }
    expect(hi).toBeGreaterThan(lo)
  })

  test('会拿奖的兴趣 Lv.4：多数人家有奖杯 / 奖牌 / 证书', () => {
    let n = 0
    for (const seed of range(1, 10)) {
      const plan = gen(seed, 'cn', 3)
      const f = decorate(plan, seed, 'auto', withLevel(generateHousehold(plan, seed), 'sports', 4))
      if (f.some((x) => /^(hg-trophy|int-trophy|hg-medal|hg-cert|int-medal)/.test(x.asset))) n++
    }
    expect(n).toBeGreaterThanOrEqual(6)
  })
})

describe('地区特色物件', () => {
  /** 中式三室、有长辈、棋牌 Lv.3 的人家：麻将桌 / 棋桌常见，桌边有座位、座位不和别的家具穿插 */
  test('中式：棋牌爱好者家里常有麻将桌或棋桌，桌边有 ≥2 个座位', () => {
    let tables = 0
    const bad: string[] = []
    for (const seed of range(1, 12)) {
      const plan = gen(seed, 'cn', 3)
      const hh = withLevel(generateHousehold(plan, seed), 'boardgames', 3)
      const f = decorate(plan, seed, 'auto', hh)
      const ts = f.filter((x) => /^(int-mahjong-(table|shuffle|walls|win)|hg-mj-(covered|fold)|hg-qizhuo)$/.test(x.asset) && !x.z)
      tables += ts.length
      for (const t of ts) {
        const d = ASSET_MAP.get(t.asset)!
        const seats = f.filter((x) => /chair|stool|zabuton|^ch-|^c2-|椅|凳/.test(x.asset + ASSET_MAP.get(x.asset)!.name) && Math.hypot(x.x - t.x, x.y - t.y) < Math.max(d.w, d.d) / 2 + 45)
        if (seats.length < 2) bad.push(`seed ${seed} ${t.asset} 只有 ${seats.length} 个座位`)
      }
    }
    expect(tables).toBeGreaterThanOrEqual(4)
    expect(bad).toEqual([])
  })

  test('日式：和室里会出现麻雀卓 / 足付き碁盤 / 将棋盤 / 神棚（不出现中式棋桌）', () => {
    const ids = new Set<string>()
    for (const seed of range(1, 30)) {
      const plan = genJp(seed)
      const hh = withLevel(generateHousehold(plan, seed), 'boardgames', 3)
      for (const x of decorate(plan, seed, 'auto', hh)) ids.add(x.asset)
    }
    expect([...ids].some((id) => /^(hg-jantaku|hg-go-ban|hg-shogi-ban|ss-kamidana)$/.test(id))).toBe(true)
    expect([...ids].filter((id) => /^hg-qizhuo$/.test(id))).toEqual([])
  })

  test('欧美：会出现台球桌 / 飞镖盘 / 国际象棋桌，且不出现麻将桌', () => {
    const ids = new Set<string>()
    for (const seed of range(1, 16)) {
      const plan = gen(seed, 'west', 3)
      const hh = withLevel(generateHousehold(plan, seed), 'boardgames', 3)
      for (const x of decorate(plan, seed, 'auto', hh)) ids.add(x.asset)
    }
    expect([...ids].some((id) => /^(hg-pool-table|hg-dartboard|hg-dart-cabinet|hg-game-table-round)$/.test(id))).toBe(true)
    expect([...ids].filter((id) => /^(int-mahjong-(table|shuffle|walls|win)|hg-mj-(covered|fold)|hg-jantaku)$/.test(id))).toEqual([])
  })

  test('特色桌子不和别的落地家具穿插（桌边座位除外）', () => {
    const bad: string[] = []
    for (const [region, seeds] of [['cn', range(1, 12)], ['west', range(1, 12)]] as const)
      for (const seed of seeds) {
        const plan = gen(seed, region, 3)
        const f = decorate(plan, seed, 'auto', withLevel(generateHousehold(plan, seed), 'boardgames', 3))
        const solid = f.filter((x) => !x.z && !ASSET_MAP.get(x.asset)!.mount && !ASSET_MAP.get(x.asset)!.stick && ASSET_MAP.get(x.asset)!.h > 3)
        for (const t of solid.filter((x) => /^(hg-(mj-(covered|fold)$|pool|qizhuo|game-table|jantaku|go-ban|shogi-ban)|int-mahjong-(table|shuffle|walls|win))/.test(x.asset))) {
          const td = ASSET_MAP.get(t.asset)!
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
  test('棋桌上的棋盘、棋罐、麻将牌有支撑面且不出界；落地棋笥不穿模', () => {
    const bad: string[] = []
    let boards = 0
    let bowlsOnFloor = 0
    for (const [region, seeds] of [['cn', range(1, 16)], ['west', range(1, 10)], ['jp', range(1, 30)]] as const)
      for (const seed of seeds) {
        const plan = region === 'jp' ? genJp(seed) : gen(seed, region, 3)
        const hh = withLevel(generateHousehold(plan, seed), 'boardgames', 3)
        const f = decorate(plan, seed, 'auto', hh)
        plan.furniture = f
        for (const x of f.filter((x) => /^(hg-go-board|hg-go-bowl|hg-mj-(walls|hands)|int-(chess|xiangqi|mahjong-mat))/.test(x.asset))) {
          if (!x.z) {
            if (!/^hg-go-bowl/.test(x.asset)) continue
            bowlsOnFloor++
            const xd = ASSET_MAP.get(x.asset)!
            for (const o of f) {
              const od = ASSET_MAP.get(o.asset)!
              if (o === x || o.z || od.mount || od.stick || od.h <= 1) continue
              const p = penetration(rectCorners(x, xd.w, xd.d, x.rot), rectCorners(o, od.w, od.d, o.rot))
              if (p > 0.5) bad.push(`${region} seed ${seed}: 落地 ${x.asset} × ${o.asset} ${p.toFixed(1)}cm`)
            }
            continue
          }
          // 棋盘：围棋盘或象棋 / 国际象棋盘（中式棋桌上围棋、象棋各一半概率）
          if (/^(hg-go-board|int-(chess|xiangqi))/.test(x.asset)) boards++
          const sp = supportOf(plan, x)
          if (!sp) bad.push(`${region} seed ${seed}: ${x.asset} 悬空`)
          else if (!sp.fits) bad.push(`${region} seed ${seed}: ${x.asset} 超出台面`)
        }
      }
    expect(bad).toEqual([])
    expect(boards).toBeGreaterThan(0)
    expect(bowlsOnFloor).toBeGreaterThanOrEqual(0)
  })

  /** 相机展示柜 / 防潮柜：摄影发烧友家里才常见，而且每一层都摆着相机或镜头 */
  test('相机展示柜 / 防潮柜：摄影 Lv.4 常见且装满相机，其他住户很少出现', () => {
    let withCase = 0
    let others = 0
    const bad: string[] = []
    for (const seed of range(1, 12)) {
      const plan = gen(seed, 'jp', 3)
      const base = generateHousehold(plan, seed)
      const f = decorate(plan, seed, 'auto', withLevel(base, 'photo', 4))
      plan.furniture = f
      const cases = f.filter((x) => /^of-(camera-showcase|dry-)/.test(x.asset))
      if (cases.length) withCase++
      for (const c of cases) {
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
      const plain = { ...base, members: base.members.map((m) => ({ ...m, interests: m.interests.filter((i) => i !== 'photo') })) }
      if (decorate(plan, seed, 'auto', plain).some((x) => /^of-(camera-showcase|dry-)/.test(x.asset))) others++
    }
    expect(withCase).toBeGreaterThanOrEqual(6)
    expect(others).toBeLessThanOrEqual(1)
    expect(bad).toEqual([])
  })
})
