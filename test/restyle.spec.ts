// 只换风格、不动布局（restyle.ts）：位置不变、换成目标风格的同类款，配色属于目标风格；上面摆着东西的桌柜不换成台面高度不同的款；范围限定
import { describe, expect, test } from 'vitest'
import { decorateHouse } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { furnitureRoom, restyleFurniture } from '/src/restyle'
import { ASSET_MAP } from '/src/three/assets'
import { paletteStyleOf, pickStyleColor } from '/src/three/stylePalettes'
import { genJp } from './helpers'

function furnished(seed: number) {
  const p = genJp(seed)
  p.household = generateHousehold(p)
  p.furniture = decorateHouse(p, seed, 'nordic', p.household)
  return p
}

describe('restyleFurniture', () => {
  test('位置、朝向、高度不变；每件都是目标风格的造型或配色', () => {
    const p = furnished(11)
    const before = p.furniture.map((f) => ({ id: f.id, x: f.x, y: f.y, rot: f.rot, z: f.z, asset: f.asset }))
    const n = restyleFurniture(p, () => 'industrial', 1)
    expect(n).toBeGreaterThan(0)
    let swapped = 0
    for (const f of p.furniture) {
      const b = before.find((x) => x.id === f.id)!
      expect([f.x, f.y, f.rot, f.z]).toEqual([b.x, b.y, b.rot, b.z])
      const def = ASSET_MAP.get(f.asset)!
      if (def.fixture) continue
      if (f.asset !== b.asset) {
        swapped++
        expect(def.styles).toContain('industrial')
        expect(def.type).toBe(ASSET_MAP.get(b.asset)!.type)
      }
      // 有工业风配色的（原生或派生）就一定是工业风的；绿植、宠物这类不能派生、也没有的保持默认
      if (pickStyleColor(def, 'industrial', 0) !== null) expect(paletteStyleOf(def, f.color ?? 0)).toBe('industrial')
      expect(f.colors).toBeUndefined()
    }
    expect(swapped).toBeGreaterThan(0)
  })

  test('上面摆着东西的桌柜：换上的款台面高度差不超过 3cm', () => {
    const p = furnished(23)
    const held = new Map(p.furniture.filter((f) => p.furniture.some((o) => o.z && Math.hypot(o.x - f.x, o.y - f.y) < 20)).map((f) => [f.id, ASSET_MAP.get(f.asset)!]))
    restyleFurniture(p, () => 'retro', 2)
    for (const f of p.furniture) {
      const old = held.get(f.id)
      if (!old || old.id === f.asset || old.surface === undefined) continue
      expect(Math.abs(ASSET_MAP.get(f.asset)!.surface! - old.surface)).toBeLessThanOrEqual(3)
    }
  })

  test('只换某个房间时，别的房间不动', () => {
    const p = furnished(5)
    const room = p.rooms.find((r) => p.furniture.some((f) => furnitureRoom(p, f)?.id === r.id))!
    const outside = p.furniture.filter((f) => furnitureRoom(p, f)?.id !== room.id).map((f) => JSON.stringify(f))
    restyleFurniture(p, (f) => (furnitureRoom(p, f)?.id === room.id ? 'cute' : undefined), 3)
    expect(p.furniture.filter((f) => furnitureRoom(p, f)?.id !== room.id).map((f) => JSON.stringify(f))).toEqual(outside)
  })
})

describe('每种风格的配色', () => {
  test('能派生的素材，每种风格至少 4 套（原生 + 派生，编号互不相同、都属于这个风格）', async () => {
    const { ASSETS } = await import('/src/three/assets')
    const { STYLE_ORDER, canDerive, pickStyleColor, paletteStyleOf, MIN_PER_STYLE } = await import('/src/three/stylePalettes')
    const def = ASSETS.find((a) => a.id === 'sofa2')!
    expect(canDerive(def)).toBe(true)
    for (const st of STYLE_ORDER) {
      const picks = new Set<number>()
      for (let k = 0; k < 40; k++) picks.add(pickStyleColor(def, st, (k + 0.5) / 40)!)
      expect(picks.size).toBeGreaterThanOrEqual(MIN_PER_STYLE)
      for (const c of picks) expect(paletteStyleOf(def, c)).toBe(st)
    }
  })
})
