// 冰箱、洗衣机改成家具之后：旧存档迁移（设备上的 style / color → 同款同色家具）、一键布置在位上放机器、检查清单按家具计数
import { describe, expect, test } from 'vitest'
import { appliancesOn, legacyAppliances, migrateAppliances } from '/src/appliance'
import { checklist } from '/src/checklist'
import { applyFixes, decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { fixtureDepth, rectPoints, type Fixture, type Plan } from '/src/model'
import { normalizePlan } from '/src/store'
import { ASSET_MAP } from '/src/three/assets'
import { APPLIANCE_PALETTES } from '/src/three/packs/appliances-pack'
import { genJp, range } from './helpers'

/** 一间 4m × 3m 的洗面所 + 一间 LDK（带厨房）的最小户型 */
function basePlan(fixtures: Fixture[]): Plan {
  return {
    version: 1,
    name: 'old',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'r1', name: 'LDK', kind: 'ldk', points: rectPoints(0, 0, 600, 500) },
      { id: 'r2', name: '洗面所', kind: 'wash', points: rectPoints(600, 0, 1000, 300) },
    ],
    openings: [],
    fixtures,
    furniture: [],
  }
}

const fx = (o: Partial<Fixture> & Pick<Fixture, 'kind' | 'x' | 'y' | 'w'>): Fixture => ({ id: `f-${o.kind}-${o.x}`, rot: 0, ...o })
const pal = (hex: string) => APPLIANCE_PALETTES.findIndex(([, c]) => c === hex)

describe('旧存档迁移', () => {
  test('带款式 / 颜色的冰箱、洗衣机设备 → 同位置、同款、同色的家具，设备上的字段清掉', () => {
    const plan = basePlan([
      fx({ kind: 'fridge', x: 100, y: 33, w: 65, d: 65, style: 'french', color: '#c9ccd1' }),
      fx({ kind: 'washer', x: 700, y: 32, w: 64, d: 64, style: 'top', color: '#123456' }),
    ])
    const n = migrateAppliances(plan)
    expect(n).toBe(2)
    expect(plan.fixtures.every((f) => f.style === undefined && f.color === undefined)).toBe(true)
    const [fridge, washer] = plan.furniture
    expect(fridge.asset).toBe('ap2-fridge-french')
    // 预设里有的颜色直接用那组配色
    expect(fridge.color).toBe(pal('#c9ccd1'))
    expect(fridge.colors).toBeUndefined()
    // 预设里没有的颜色：用自定义颜色槽保留原色
    expect(washer.asset).toBe('ap2-washer-top')
    expect(washer.colors).toEqual(['#123456'])
    // 位置：沿墙居中、背面贴着位的背面（墙）
    const fd = ASSET_MAP.get('ap2-fridge-french')!
    expect(fridge.x).toBe(100)
    expect(fridge.y).toBeCloseTo(33 - 65 / 2 + fd.d / 2, 1)
    expect(fridge.rot).toBe(0)
    expect(appliancesOn(plan.furniture, plan.fixtures[0]).map((f) => f.id)).toEqual([fridge.id])
  })

  test('只有颜色没有款式：按以前的默认款（三门冰箱 / 滚筒洗衣机）', () => {
    const plan = basePlan([fx({ kind: 'fridge', x: 100, y: 33, w: 65, color: '#f6c9d2' }), fx({ kind: 'washer', x: 700, y: 32, w: 64, color: '#2f3134' })])
    migrateAppliances(plan)
    expect(plan.furniture.map((f) => [f.asset, f.color])).toEqual([
      ['ap2-fridge-3door', pal('#f6c9d2')],
      ['ap2-washer-drum', pal('#2f3134')],
    ])
  })

  test('欧美的洗衣机 + 烘干机并排（pair）→ 两台家具，并排在位里', () => {
    const wide = legacyAppliances(fx({ kind: 'washer', x: 800, y: 35, w: 140, d: 70, style: 'pair' }))
    expect(wide.map((f) => f.asset)).toEqual(['ap2-washer-us', 'ap2-dryer-us'])
    const narrow = legacyAppliances(fx({ kind: 'washer', x: 800, y: 35, w: 130, d: 70, style: 'pair' }))
    expect(narrow.map((f) => f.asset)).toEqual(['ap2-washer-drum', 'ap2-dryer'])
    for (const units of [wide, narrow]) {
      const [a, b] = units
      const wa = ASSET_MAP.get(a.asset)!.w
      // 左右各一台、不重叠，整体不超出位
      expect(a.x).toBeLessThan(800)
      expect(b.x).toBeGreaterThan(800)
      expect(b.x - a.x).toBeGreaterThanOrEqual(wa)
      // 默认颜色（旧版洗衣机白）不在预设里：保留原色
      expect(a.colors).toEqual(['#fbf7f1'])
    }
    expect(Math.abs(wide[0].x - 800) + ASSET_MAP.get('ap2-washer-us')!.w / 2).toBeLessThanOrEqual(70)
  })

  test('旧存档（无标记）没写款式颜色的位也补默认款；新格式的空位不动', () => {
    const old = basePlan([fx({ kind: 'fridge', x: 100, y: 33, w: 65 }), fx({ kind: 'washer', x: 700, y: 32, w: 64 })])
    expect(migrateAppliances(old)).toBe(2)
    expect(old.appliancesAsFurniture).toBe(true)
    const fresh = { ...basePlan([fx({ kind: 'fridge', x: 100, y: 33, w: 65 })]), appliancesAsFurniture: true as const }
    expect(migrateAppliances(fresh)).toBe(0)
    expect(fresh.furniture).toHaveLength(0)
  })

  test('新格式里没有款式和颜色的位不动；迁移可以重复执行（不会重复生成）', () => {
    const plan = { ...basePlan([fx({ kind: 'fridge', x: 100, y: 33, w: 65 }), fx({ kind: 'washer', x: 700, y: 32, w: 64, style: 'stack', color: '#f6f6f3' })]), appliancesAsFurniture: true as const }
    expect(migrateAppliances(plan)).toBe(1)
    expect(plan.furniture.map((f) => f.asset)).toEqual(['ap2-washer-stack'])
    // 旧版本又把字段写回来了：位上已有家具，不再生成
    plan.fixtures[1].style = 'stack'
    expect(migrateAppliances(plan)).toBe(0)
    expect(plan.furniture.length).toBe(1)
    expect(plan.fixtures[1].style).toBeUndefined()
  })

  test('normalizePlan（读档入口）会做迁移，旋转过的位也贴墙', () => {
    const raw = JSON.parse(JSON.stringify(basePlan([fx({ kind: 'fridge', x: 32, y: 200, w: 65, d: 65, rot: 90, style: '2door', color: '#bfe8d8' })])))
    delete raw.wallOuter
    const p = normalizePlan(raw)!
    expect(p.furniture).toHaveLength(1)
    const f = p.furniture[0]
    expect(f.asset).toBe('ap2-fridge-2door')
    expect(f.rot).toBe(90)
    // rot 90：背面朝 +x 方向的墙之外（局部 -y → 世界 +x），机器比位浅，往墙那边靠
    const d = ASSET_MAP.get('ap2-fridge-2door')!.d
    expect(f.x).toBeCloseTo(32 + (65 - d) / 2, 1)
    expect(f.y).toBe(200)
    expect(p.fixtures[0].style).toBeUndefined()
  })
})

describe('一键布置 / 检查清单', () => {
  const SEEDS = range(1, 12)
  const plans = SEEDS.map((seed) => {
    const plan = genJp(seed)
    plan.household = generateHousehold(plan, seed)
    plan.furniture = decorate(plan, seed, 'auto', plan.household)
    return { seed, plan }
  })

  test('每个冰箱位 / 洗衣机位上都放着一台对应的机器，且不比位宽', () => {
    const bad: string[] = []
    for (const { seed, plan } of plans)
      for (const f of plan.fixtures.filter((x) => x.kind === 'fridge' || x.kind === 'washer')) {
        const on = appliancesOn(plan.furniture, f)
        if (!on.length) bad.push(`seed ${seed}: ${f.kind} 位上没有机器`)
        for (const a of on) if (ASSET_MAP.get(a.asset)!.w > f.w + 1) bad.push(`seed ${seed}: ${a.asset} 比 ${f.kind} 位（${f.w}）宽`)
      }
    expect(bad).toEqual([])
  })

  test('冰箱贴贴在冰箱家具的门上，洗衣液放在洗衣机家具顶上', () => {
    let magnets = 0
    let detergents = 0
    for (const { plan } of plans) {
      const fridges = plan.furniture.filter((f) => ASSET_MAP.get(f.asset)?.family === 'fridge')
      const washers = plan.furniture.filter((f) => ASSET_MAP.get(f.asset)?.family === 'washer')
      for (const m of plan.furniture.filter((f) => ASSET_MAP.get(f.asset)?.stick && /magnet|冰箱贴|sticky-note|polaroid|kids-drawing/.test(f.asset + ASSET_MAP.get(f.asset)!.name))) {
        const fr = fridges.find((f) => Math.hypot(f.x - m.x, f.y - m.y) < 80)
        if (!fr) continue
        magnets++
        expect(m.z!).toBeLessThan(ASSET_MAP.get(fr.asset)!.h)
      }
      for (const d of plan.furniture.filter((f) => /detergent|洗衣液/.test(f.asset + ASSET_MAP.get(f.asset)!.name) && (f.z ?? 0) > 30)) {
        if (washers.some((w) => Math.abs((w.z ?? 0) + ASSET_MAP.get(w.asset)!.surface! - d.z!) < 0.6 && Math.hypot(w.x - d.x, w.y - d.y) < 40)) detergents++
      }
    }
    expect(magnets).toBeGreaterThan(0)
    expect(detergents).toBeGreaterThan(0)
  })

  test('检查清单：冰箱、洗衣机按家具计数；拿掉后一键补齐会补回位上', () => {
    const { plan, seed } = plans[0]
    const items = () => checklist(plan, plan.household)
    const fridgeItem = () => items().find((c) => c.label === '冰箱')!
    const washerItem = () => items().find((c) => c.label === '洗衣机')!
    expect(fridgeItem().have).toBeGreaterThanOrEqual(1)
    expect(washerItem().have).toBeGreaterThanOrEqual(1)
    const machines = new Set(['fridge', 'washer', 'dryer'])
    plan.furniture = plan.furniture.filter((f) => !machines.has(ASSET_MAP.get(f.asset)?.family ?? ''))
    expect(fridgeItem().have).toBe(0)
    expect(washerItem().have).toBe(0)
    plan.furniture = applyFixes(plan, [fridgeItem(), washerItem()], plan.household, seed)
    expect(fridgeItem().have).toBe(1)
    expect(washerItem().have).toBe(1)
    for (const f of plan.fixtures.filter((x) => x.kind === 'fridge' || x.kind === 'washer')) expect(appliancesOn(plan.furniture, f).length).toBeGreaterThan(0)
  })

  test('没有冰箱位 / 洗衣机位的户型：靠墙放一台', () => {
    const plan = basePlan([fx({ kind: 'kitchen', x: 300, y: 33, w: 255, variant: 'wall' })])
    plan.furniture = decorate(plan, 1, 'modern')
    const fams = plan.furniture.map((f) => ASSET_MAP.get(f.asset)?.family)
    expect(fams).toContain('fridge')
    expect(fams).toContain('washer')
    expect(fixtureDepth(plan.fixtures[0])).toBe(65)
  })
})
