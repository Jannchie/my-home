// 元数据快照的内容（vite.config.ts 的 assetMeta 插件在 Node 里调用）：完整素材去掉函数字段，
// 能派生配色的再带上探针结果（stylePalettes.slotProbeFor，要 build 模型，平面图那侧算不了）。

import { ASSETS } from './assets'
import type { AssetMeta } from './assetMeta'
import { slotProbeFor } from './stylePalettes'

export function assetSnapshot(): AssetMeta[] {
  return ASSETS.map((a) => {
    const o = Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v !== 'function')) as AssetMeta
    const probe = slotProbeFor(a)
    if (probe) o.slotProbe = probe
    return o
  })
}
