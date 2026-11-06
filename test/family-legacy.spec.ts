import { expect, test } from 'vitest'

// 旧系列字段 family 已删除（迁移到 type / series / limitGroup）：素材定义里不能再带它；
// 冻结表 LEGACY_FAMILY 只用于派生配色的分组键（保证已有素材派生配色不变），不能指向不存在的素材。
test('family 已迁移，冻结表与素材一致', async () => {
  const { ASSETS, ASSET_MAP } = await import('/src/three/assets')
  const { LEGACY_FAMILY } = await import('/src/three/family.legacy')
  const { paletteKey } = await import('/src/three/stylePalettes')
  expect(ASSETS.filter((a) => 'family' in a).map((a) => a.id)).toEqual([])
  expect(Object.keys(LEGACY_FAMILY).filter((id) => !ASSET_MAP.has(id))).toEqual([])
  expect(ASSETS.filter((a) => paletteKey(a) !== (LEGACY_FAMILY[a.id] ?? a.id)).map((a) => a.id)).toEqual([])
})
