// 素材表的唯一实例：ASSETS（遍历用，只有原素材）和 ASSET_MAP（按 id 查，改过宽深的派生 id 现场派生）。
//
// 表里装的是哪一份由注册方决定：
//   - 完整素材（assets.ts 加载时注册）：带 build，3D 用；
//   - 元数据快照（生产构建里 virtual:asset-meta 注册，见 vite.config.ts 的 assetMeta 插件）：不带 build，
//     平面图先用它，不必下载全部建模代码和 three.js；完整素材一加载就整表替换掉它。
// 两处共用同一个数组、同一个 Map 实例，拿着引用的模块不用关心换没换过。
// 本模块不导入任何运行时模块：循环导入里也一定先于使用方初始化完。

import type { AssetMeta } from './assetMeta'

type Derive = (id: string, lookup: (id: string) => AssetMeta | undefined) => AssetMeta | undefined

let derive: Derive = () => undefined
let full = false

class AssetMap extends Map<string, AssetMeta> {
  override get(id: string) {
    return super.get(id) ?? (id.includes('@') ? derive(id, (b) => super.get(b)) : undefined)
  }
  override has(id: string) {
    return !!this.get(id)
  }
}

export const ASSETS: AssetMeta[] = []
export const ASSET_MAP: Map<string, AssetMeta> = new AssetMap()

/**
 * 登记素材表。isFull：带 build 的完整素材；完整素材登记过以后再来的快照忽略。
 * deriveResized：派生 id 的生成方式（完整素材连模型一起派生，快照只派生数据）
 */
export function registerAssets(list: AssetMeta[], deriveResized: Derive, isFull: boolean) {
  if (full && !isFull) return
  full = isFull
  derive = deriveResized
  ASSETS.splice(0, ASSETS.length, ...list)
  ASSET_MAP.clear()
  for (const a of list) ASSET_MAP.set(a.id, a)
}

