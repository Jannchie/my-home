// 平面图、规则判断这一侧用的素材表入口：只读素材的数据部分（AssetMeta），不依赖 three.js 和建模代码。
//
// 生产构建里 virtual:asset-meta 是构建时算好的元数据快照（vite.config.ts 的 assetMeta 插件），首屏只下载它；
// 开发和测试环境里它直接加载完整素材（assets.ts）。需要模型或完整素材的操作先 await loadAssets()。
// 3D 侧的模块照旧从 assets.ts 引入（类型是带 build 的 AssetDef），两边是同一张表（assetRegistry.ts）。

import 'virtual:asset-meta'

export { ASSETS, ASSET_MAP } from './assetRegistry'
export { CATEGORY_LABELS, STYLE_LABELS, type AssetCategory, type AssetMeta, type StyleTag } from './assetMeta'

let loading: Promise<void> | null = null

/** 加载完整素材（带 build，替换掉元数据快照）；重复调用共用一次加载，失败后下次再试 */
export function loadAssets(): Promise<void> {
  loading ??= import('./assets').then(
    () => undefined,
    (e) => {
      loading = null
      throw e
    },
  )
  return loading
}
