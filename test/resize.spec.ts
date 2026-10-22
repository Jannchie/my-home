// 自由调宽深（resize.ts）：派生 id、可摆放层、模型包围盒、柜子按宽度重新分门、store 的背面对齐。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { baseAssetId, parseResized, resizeRange, resizedId } from '/src/three/resize'
import { doorParts } from '/src/three/kit'

const sizeOf = (id: string) => {
  const def = ASSET_MAP.get(id)!
  const box = new THREE.Box3().setFromObject(def.build(def.palettes[0] ?? []))
  return box.getSize(new THREE.Vector3())
}

describe('resize', () => {
  test('派生 id 的格式与范围', () => {
    expect(parseResized('cb-closet-hinged-120@135x58')).toEqual({ base: 'cb-closet-hinged-120', w: 135, d: 58 })
    expect(parseResized('cb-closet-hinged-120')).toBeNull()
    expect(baseAssetId('bookshelf@100x30')).toBe('bookshelf')
    const base = ASSET_MAP.get('cb-closet-hinged-120')!
    expect(resizedId(base, base.w, base.d)).toBe(base.id)
    expect(resizedId(base, 9999, 58)).toBe(`${base.id}@${resizeRange(base)!.w[1]}x58`)
    // 明显不对的尺寸、不能调的都查不到
    expect(ASSET_MAP.get(`${base.id}@9999x58`)).toBeUndefined()
    expect(ASSET_MAP.get(`${base.id}@0x58`)).toBeUndefined()
    expect(ASSET_MAP.get('prop-laptop@40x30')).toBeUndefined()
    expect(resizeRange(ASSET_MAP.get('prop-laptop'))).toBeNull()
  })

  test('柜、架、衣架、桌都能调；派生的不进素材表', () => {
    const n = ASSETS.filter((a) => resizeRange(a)).length
    expect(n).toBeGreaterThan(100)
    for (const id of ['cb-shoe-low-90', 'sf-double-rail', 'bd-clothes-rail', 'bookshelf', 'desk']) expect(resizeRange(ASSET_MAP.get(id)), id).not.toBeNull()
    const id = 'bookshelf@100x40'
    expect(ASSET_MAP.has(id)).toBe(true)
    expect([...ASSET_MAP.values()].some((a) => a.id === id)).toBe(false)
  })

  test('柜子按新宽度重新分门扇，模型和占地一致', () => {
    const wide = ASSET_MAP.get('cb-closet-hinged-90@200x45')!
    const doors = (id: string) => doorParts(ASSET_MAP.get(id)!.build(ASSET_MAP.get(id)!.palettes[0])).length
    expect(doors(wide.id)).toBeGreaterThan(doors('cb-closet-hinged-90'))
    const s = sizeOf(wide.id)
    expect(s.x).toBeCloseTo(200, 0)
    expect(s.z).toBeLessThan(48)
  })

  test('通用拉伸：包围盒跟着宽深走，高度不变；层板跟着拉宽', () => {
    for (const base of ['bookshelf', 'sf-double-rail', 'bd-clothes-rail', 'desk']) {
      const def = ASSET_MAP.get(base)!
      const s0 = sizeOf(base)
      const id = resizedId(def, def.w * 1.5, def.d * 1.2)
      const r = ASSET_MAP.get(id)!
      const s1 = sizeOf(id)
      // 挂着的衣服整件平移不拉伸，伸出占地的部分可能差一点
      expect(Math.abs(s1.x - s0.x - (r.w - def.w)), base).toBeLessThan(2)
      expect(Math.abs(s1.z - s0.z - (r.d - def.d)), base).toBeLessThan(2)
      expect(s1.y, base).toBeCloseTo(s0.y, 3)
      const xs = (d: typeof def) => (d.surfaces ?? []).flatMap((l) => l.shape ?? []).flat().map(([x]) => x)
      if (def.surfaces?.length) expect(Math.max(...xs(r)), base).toBeGreaterThan(Math.max(...xs(def)))
    }
  })
})
