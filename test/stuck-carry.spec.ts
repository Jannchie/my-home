// 贴在家具侧面上的贴附物（冰箱门上的冰箱贴、便签）：拖动、旋转、微调、删除、复制家具时一起带走（都走 carriedBy）
import { describe, expect, test } from 'vitest'
import type { Furniture } from '/src/model'
import { carriedBy, toWorld } from '/src/surface'
import { ASSETS, ASSET_MAP } from '/src/three/assets'

const FRIDGE = ASSETS.find((a) => a.type === 'fridge' && !a.prop && a.h > 120)!
const MAGNET = ASSET_MAP.get('st-magnet-star')!

/** 贴在家具局部坐标 (lx, lz) 上、外法线朝 (nx, nz)（局部）的贴附物，离地 z */
function stuck(f: Furniture, lx: number, lz: number, nx: number, nz: number, z: number, id = 'm'): Furniture {
  const p = toWorld(f, lx, lz)
  // 局部法线转到平面坐标，贴附物的朝向 rot 满足 法线 = (-sin rot, cos rot)（Sandbox3D locate）
  const w = toWorld({ x: 0, y: 0, rot: f.rot }, nx, nz)
  const rot = Math.round(((Math.atan2(-w.x, w.y) * 180) / Math.PI + 360) % 360)
  return { id, asset: MAGNET.id, x: p.x, y: p.y, rot, z }
}

describe('贴在家具侧面上的贴附物跟着家具走', () => {
  test('素材存在', () => {
    expect(FRIDGE).toBeTruthy()
    expect(MAGNET?.stick).toBe(true)
  })

  for (const rot of [0, 90, 215]) {
    test(`冰箱门上和侧面的冰箱贴算在冰箱上（冰箱朝向 ${rot}°）`, () => {
      const fr: Furniture = { id: 'fr', asset: FRIDGE.id, x: 300, y: 200, rot }
      // 一键布置的贴法：门面在前沿往里 3cm，浮出 0.3
      const front = stuck(fr, 10, FRIDGE.d / 2 - 2.7, 0, 1, 120, 'front')
      const side = stuck(fr, FRIDGE.w / 2 + 0.05, 0, 1, 0, 100, 'side')
      const plan = { furniture: [fr, front, side] }
      expect(carriedBy(plan, fr).map((o) => o.id).sort()).toEqual(['front', 'side'])
    })
  }

  test('不算：墙上紧挨着冰箱的贴附物（朝向不对）、比冰箱高的、离开侧面的、别的楼层的', () => {
    const fr: Furniture = { id: 'fr', asset: FRIDGE.id, x: 300, y: 200, rot: 0 }
    // 冰箱背靠墙：墙上的贴纸在冰箱背面那个平面上，但朝向房间（和背面的外法线相反）
    const wall = stuck(fr, 0, -FRIDGE.d / 2 - 0.5, 0, 1, 100, 'wall')
    const above = stuck(fr, 0, FRIDGE.d / 2 - 2.7, 0, 1, FRIDGE.h + 20, 'above')
    const away = stuck(fr, 0, FRIDGE.d / 2 + 15, 0, 1, 100, 'away')
    const upstairs = { ...stuck(fr, 0, FRIDGE.d / 2 - 2.7, 0, 1, 100, 'up'), floor: 'f2' }
    expect(carriedBy({ furniture: [fr, wall, above, away, upstairs] }, fr)).toEqual([])
  })
})
