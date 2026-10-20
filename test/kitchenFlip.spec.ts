// 厨房左右翻转（Fixture.flip）：水槽、灶对调，台面的可摆放区跟着镜像，台面上的东西跟着对调。
import { describe, expect, test } from 'vitest'
import { kitchenSlots, type Fixture, type Furniture, type Plan } from '/src/model'
import { fitsOnFixture, fixtureTop, toWorld } from '/src/surface'
import { applyFixtureCarry, captureFixtureProps, mirrorFixtureCarry } from '/src/fixtureCarry'
import { ASSET_MAP } from '/src/three/assets'

const kitchen = (flip = false): Fixture => ({ id: 'k', kind: 'kitchen', variant: 'wall', x: 300, y: 200, w: 255, rot: 0, ...(flip ? { flip: true } : {}) })
/** 台面上能放的小摆件（比水槽开孔小） */
const small = [...ASSET_MAP.values()].find((a) => a.prop && a.w <= 12 && a.d <= 12 && !a.form?.includes('hanging'))!

describe('kitchen flip', () => {
  test('水槽、灶的位置左右对调', () => {
    const a = kitchenSlots(kitchen())
    const b = kitchenSlots(kitchen(true))
    expect(b.sink).toBeCloseTo(-a.sink)
    expect(b.hob).toBeCloseTo(-a.hob)
  })

  test('台面的可摆放区跟着镜像：翻转后 -x 处能不能放，和原来 x 处一样', () => {
    const k = kitchen()
    const f = kitchen(true)
    let blocked = 0
    // 取样点错开整数，免得摆件的角正好压在区域边界上（边界上的点判定不对称）
    for (let x = -120.3; x <= 120; x += 5) {
      const p = toWorld(k, x, 0)
      const q = toWorld(f, -x, 0)
      const ok = fitsOnFixture(k, small.id, p.x, p.y, 0)
      if (!ok) blocked++
      expect(fitsOnFixture(f, small.id, q.x, q.y, 0)).toBe(ok)
    }
    // 水槽、灶确实挡住了一部分
    expect(blocked).toBeGreaterThan(5)
  })

  test('台面上的东西跟着镜像，不会落进对调过来的水槽', () => {
    const k = kitchen()
    // 放在水槽和灶之间、靠灶的一侧
    const { sink, hob } = kitchenSlots(k)
    const lx = hob - 50
    const w = toWorld(k, lx, 0)
    expect(fitsOnFixture(k, small.id, w.x, w.y, 0)).toBe(true)
    const prop: Furniture = { id: 'p', asset: small.id, x: w.x, y: w.y, rot: 0, z: fixtureTop(k)! }
    const plan = { rooms: [], openings: [], fixtures: [k], furniture: [prop], wall: 12, wallOuter: 18 } as unknown as Plan
    const carry = captureFixtureProps(plan, k)
    expect(carry.props.map((c) => c.id)).toEqual(['p'])
    k.flip = true
    mirrorFixtureCarry(carry)
    applyFixtureCarry(plan, k, carry)
    const m = toWorld(k, -lx, 0)
    expect(prop.x).toBeCloseTo(m.x, 0)
    expect(prop.y).toBeCloseTo(m.y, 0)
    expect(fitsOnFixture(k, small.id, prop.x, prop.y, 0)).toBe(true)
    expect(kitchenSlots(k).sink).toBeCloseTo(-sink)
  })
})
