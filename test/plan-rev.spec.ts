// 户型版本号：家具的变化只动 furnitureRev，其余部分只动 planRestRev；换整份户型两个都动
import { nextTick } from 'vue'
import { describe, expect, test } from 'vitest'
import { furnitureRev, plan, planRestRev, planRev } from '/src/store'

describe('plan revisions', () => {
  test('moving furniture bumps only furnitureRev', async () => {
    plan.value.furniture.push({ id: 'rev-test', asset: 'sofa', x: 0, y: 0, rot: 0 } as (typeof plan.value.furniture)[number])
    await nextTick()
    const f0 = furnitureRev.value
    const r0 = planRestRev.value
    plan.value.furniture.find((f) => f.id === 'rev-test')!.x += 10
    await nextTick()
    expect(furnitureRev.value).toBe(f0 + 1)
    expect(planRestRev.value).toBe(r0)
  })

  test('editing a room bumps only planRestRev', async () => {
    const f0 = furnitureRev.value
    const r0 = planRestRev.value
    plan.value.rooms[0].name = 'renamed'
    await nextTick()
    expect(planRestRev.value).toBe(r0 + 1)
    expect(furnitureRev.value).toBe(f0)
  })

  test('replacing the whole plan bumps both', async () => {
    const v0 = planRev.value
    const f0 = furnitureRev.value
    const r0 = planRestRev.value
    plan.value = JSON.parse(JSON.stringify(plan.value))
    await nextTick()
    expect(furnitureRev.value).toBe(f0 + 1)
    expect(planRestRev.value).toBe(r0 + 1)
    expect(planRev.value).toBe(v0 + 2)
  })
})
