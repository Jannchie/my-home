// measured.generated.ts 是否过期：现量一遍素材定义时要量的模型，结果必须和生成文件一致。
// 过期时运行 pnpm gen:measured 重新生成。
import { expect, test } from 'vitest'

test('measured.generated.ts 未过期', async () => {
  ;(globalThis as { __MEASURE_LIVE__?: boolean }).__MEASURE_LIVE__ = true
  const { measuredNow } = await import('/src/three/measured')
  await import('/src/three/assets')
  const { MEASURED } = await import('/src/three/measured.generated')
  const now = Object.fromEntries(Object.entries(measuredNow).map(([k, v]) => [k, [...v]]))
  const table = Object.fromEntries(Object.entries(MEASURED).map(([k, v]) => [k, [...v]]))
  expect(Object.keys(now).length).toBeGreaterThan(0)
  expect(table, '素材测量表已过期，请运行 pnpm gen:measured').toEqual(now)
})
