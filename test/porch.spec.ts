// 入户门前的雨棚 / 门廊：尺寸按门前到用地边界的空间收，柱子、台阶不压围挡、不出用地；院子里的东西不摆到台阶和柱子上。
import { describe, expect, test } from 'vitest'
import { generatePlan } from '/src/generate-region'
import { entranceDoor, PORCH_WALK, porchFootprint, porchShape, roomInFront } from '/src/exterior'
import { yardFurniture } from '/src/yard'
import { furnitureBox } from '/src/snap'
import { pointInPolygon, rectPoints, type PorchKind } from '/src/model'
import { overlapArea } from '/src/stairs'
import { JP_OPTS } from './helpers'

const houses = (['jp', 'cn', 'west'] as const).flatMap((region) => [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ region, seed, plan: generatePlan({ ...JP_OPTS, seed, region, dwelling: 'house' }).plan })))

describe('入户门前的雨棚 / 门廊', () => {
  test('门前空间够：保持原来的尺寸；不够：门廊收浅，再不够退成雨棚、只留门框', () => {
    expect(porchShape('porch', 90, 400)).toMatchObject({ kind: 'porch', depth: 160, width: 270 })
    expect(porchShape('porch', 90, 200)).toMatchObject({ kind: 'porch', depth: 200 - PORCH_WALK })
    expect(porchShape('porch', 90, 150).kind).toBe('canopy')
    expect(porchShape('canopy', 90, 400)).toMatchObject({ kind: 'canopy', depth: 85, stepD: 70 })
    expect(porchShape('canopy', 90, 60).kind).toBe('frame')
    expect(porchShape('none', 90, 400).kind).toBe('frame')
  })

  test('门前到用地边界的距离', () => {
    const site = { points: rectPoints(0, 0, 1000, 800), fence: 'hedge', gates: [], paths: [], parking: [] } as never
    expect(roomInFront(site, { x: 500, y: 650 }, { x: 0, y: 1 })).toBeCloseTo(150)
    expect(roomInFront(undefined, { x: 500, y: 650 }, { x: 0, y: 1 })).toBe(Infinity)
  })

  for (const kind of ['porch', 'canopy'] as PorchKind[])
    test(`生成的户建（${kind}）：落地部分在用地里，前沿到边界留出通行距离`, () => {
      let n = 0
      for (const { region, seed, plan } of houses) {
        if (!plan.exterior || !plan.site) continue
        plan.exterior.porch = kind
        const fp = porchFootprint(plan)
        const d = entranceDoor(plan)
        expect(d, `${region}#${seed}`).toBeTruthy()
        if (!fp) continue
        n++
        for (const p of fp) expect(pointInPolygon(p, plan.site.points), `${region}#${seed} 出了用地`).toBe(true)
        // 前沿两角到边界（沿门的朝向）至少 30（雨棚）/ PORCH_WALK（门廊）
        const gap = Math.min(roomInFront(plan.site, fp[2], d!.out), roomInFront(plan.site, fp[3], d!.out))
        expect(gap, `${region}#${seed}`).toBeGreaterThanOrEqual(kind === 'porch' && porchShape(kind, d!.width, roomInFront(plan.site, d!.face, d!.out)).kind === 'porch' ? PORCH_WALK - 0.5 : 14.5)
      }
      expect(n).toBeGreaterThan(10)
    })

  test('院子布置不把东西摆到门前台阶、门廊柱子上', () => {
    for (const { region, seed, plan } of houses) {
      if (!plan.exterior) continue
      plan.exterior.porch = 'porch'
      const fp = porchFootprint(plan)
      if (!fp) continue
      for (const f of yardFurniture(plan, seed)) {
        if (f.z) continue
        const b = furnitureBox(f.asset, f.x, f.y, f.rot)
        expect(overlapArea(fp, rectPoints(b.x0, b.y0, b.x1, b.y1)), `${region}#${seed} ${f.asset}`).toBeLessThanOrEqual(1)
      }
    }
  })
})
