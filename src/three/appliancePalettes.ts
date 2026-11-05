// 家电机身配色表：素材在 packs/appliances-pack.ts，旧存档迁移（appliance.ts）按颜色查编号也用它。单独成文件，平面图不必加载素材包。

import type { StyleTag } from './assetMeta'

/** 机身配色：[风格, 颜色, 名字]。以前设备的 10 种颜色（APPLIANCE_COLORS）原样在前面，旧存档迁移按颜色精确匹配 */
export const APPLIANCE_PALETTES: [StyleTag, string, string][] = [
  ['modern', '#f6f6f3', '白'],
  ['modern', '#c9ccd1', '银'],
  ['industrial', '#8a8d93', '深灰'],
  ['industrial', '#2f3134', '黑'],
  ['classic', '#e8d9bf', '香槟'],
  ['nordic', '#efe4d0', '米'],
  ['cute', '#bfe8d8', '薄荷'],
  ['cute', '#f6c9d2', '粉'],
  ['cute', '#cfe3f2', '天蓝'],
  ['retro', '#f3e3a6', '柠檬'],
  ['japanese', '#f4eee2', '奶油白'],
  ['chinese', '#f2eadb', '象牙白'],
  ['chinese', '#d9c39a', '香槟金'],
  ['farmhouse', '#b9c9b0', '鼠尾草绿'],
  ['farmhouse', '#f1ece2', '做旧白'],
  ['retro', '#d9574b', '复古红'],
  ['nordic', '#b9c8d6', '雾蓝'],
]
