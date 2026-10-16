// dims.generated.ts 是否过期：按原始声明重新测量全部素材，结果必须和生成文件一致。
// 过期时运行 pnpm gen:dims 重新生成。
import { expect, test } from 'vitest'
import { ASSETS } from '/src/three/assets'
import { computeDims, diffDims } from '/src/three/dims'
import { DIMS } from '/src/three/dims.generated'

test('dims.generated.ts 未过期', () => {
  const bad = diffDims(computeDims(ASSETS), DIMS)
  expect(bad, '素材尺寸修正已过期，请运行 pnpm gen:dims').toEqual([])
})

test('修正已同步应用到 ASSETS（只放大不缩小）', () => {
  const map = new Map(ASSETS.map((a) => [a.id, a]))
  const bad = Object.entries(DIMS)
    .filter(([id, [w, d, h]]) => {
      const a = map.get(id)
      return !a || a.w !== w || a.d !== d || a.h !== h
    })
    .map(([id]) => id)
  expect(bad).toEqual([])
})
