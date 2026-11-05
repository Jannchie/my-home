declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** 某种语言的界面词典（vite.config.ts 的 i18nDicts 插件按 i18n/ui.ts、assetNames.ts 生成）：中文原文 → 该语言译文 */
declare module 'virtual:i18n-dict/*' {
  const dict: { ui: Record<string, string>; rooms: Record<string, string>; assets: Record<string, string> }
  export default dict
}

/** 素材表的初始内容：生产构建里登记元数据快照，开发 / 测试里直接加载完整素材（vite.config.ts 的 assetMeta 插件） */
declare module 'virtual:asset-meta' {}
