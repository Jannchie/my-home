// 素材定义时要量一下模型的地方（吸顶灯的包围盒和最低点、衣物和毛巾的尺寸）：每次打开页面都现建模型来量，
// 素材包载入时要多花一百多毫秒。改成离线量好存在 measured.generated.ts（pnpm gen:measured），import 时直接查表。
//   - 表里没有的（新加的素材）照样现量，结果一样，只是慢一点；
//   - 模型改了表就过期：test/measured.spec.ts 现量一遍和表对比，过期时重跑 pnpm gen:measured。
import { MEASURED } from './measured.generated'

/** 现量模式：生成表、检查过期时在载入素材之前打开，所有 measured() 都现量并记下来 */
const live = () => !!(globalThis as { __MEASURE_LIVE__?: boolean }).__MEASURE_LIVE__

/** 这次现量的结果（key → 数值） */
export const measuredNow: Record<string, readonly number[]> = {}

/** 查表取 key 的测量结果，表里没有（或在现量模式）就调用 fn 现量 */
export function measured<T extends number[]>(key: string, fn: () => T): T {
  const hit = live() ? undefined : MEASURED[key]
  if (hit) return [...hit] as T
  const v = fn()
  measuredNow[key] = [...v]
  return v
}
