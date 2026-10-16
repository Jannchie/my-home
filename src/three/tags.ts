// 素材语义标签：业务规则（一键布置、检查清单、兴趣、工位、摄像头、灯光、绿植…）按标签判断「这是什么、能放哪」，
// 名字只用于显示。改名、翻译不会改变布置结果。
//
// 词表是受控的（Tag 联合类型，写错编译报错）：
//   功能       这件东西是什么（bed、desk、kettle、towel、plant…），每件素材至少一个
//   摆放       能放在哪 / 怎么摆（high-ok 可放 >140cm 高处、bed-ok 可放床上、fridge-door 可贴冰箱门…）
//   兴趣       hobby:<InterestId>：和 household.ts 的兴趣对应（落地 / 摆件 / 壁挂按素材本身的形态区分）
//
// 标签来源：src/three/tags.generated.ts（迁移脚本 scripts/migrate-tags.mts 生成的初始表）与 def.tags（新素材直接写）合并。

import type { AssetDef } from './kit'
import type { InterestId } from '../household'

/** 功能：家具 */
export const FURNITURE_TAGS = [
  'bed', // 床（含儿童床、婴儿床）
  'bedding', // 地铺被褥（布団）
  'crib', // 婴儿床
  'kid-bed', // 儿童床
  'loft', // 阁楼床 / 上床下桌
  'sofa',
  'armchair', // 单人沙发、阅读椅、摇椅、躺椅
  'chair', // 椅子
  'seat', // 坐具（椅、凳）
  'stool',
  'floor-cushion', // 坐垫、座椅（和室）
  'dining-seat', // 餐椅 / 餐凳
  'office-chair',
  'ergonomic-chair',
  'gaming-chair',
  'desk', // 能放电脑的书桌 / 工作台
  'workbench', // 工作台（含园艺台、焊接台）
  'table', // 桌类（名字里是桌 / desk 的有台面的东西）
  'gaming-desk', // 适合当电竞桌的宽桌
  'duo-desk', // 双人并排桌
  'dining-table',
  'low-table', // 被炉、矮桌
  'coffee-table', // 茶几、边几
  'nightstand',
  'bookshelf',
  'record-shelf', // 唱片架、CD 架
  'shelving', // 带层板的柜架（书架、展示柜、收纳柜、搁架）
  'display-cabinet', // 展示柜
  'curio-cabinet', // 陈列柜、博古架
  'wardrobe',
  'dresser', // 斗柜、箪笥
  'clothes-rail', // 落地挂衣架
  'coat-rack', // 衣帽架
  'storage-cabinet', // 收纳柜、抽屉柜
  'cabinet', // 柜、架（泛指）
  'shoe-storage',
  'washer-rack', // 洗衣机上方置物架
  'open-rack', // 开放式钢架（リネン庫）
  'tv-stand',
  'garment-rail', // 带挂杆的挂衣架（会挂一排衣服）
  'kimono-rack', // 衣桁
  'towel-rail', // 毛巾杆 / 毛巾架（有挂钩层）
  'towel-bar', // 壁挂毛巾杆
  'mirror',
  'floor-mirror',
  'umbrella-stand',
  'laundry-stand', // 晾衣架
  'hamper', // 脏衣篓
  'cat-tower',
  'litter-box',
  'aquarium',
  'luggage',
  'music-stand',
  'guitar',
  'piano',
  'drums',
  'yoga-mat',
  'play-mat',
  'bath-mat',
  'bath-stool',
  'bath-pail', // 洗面桶 / 風呂桶
  'bucket', // 桶（泛指）
  'projector-screen',
] as const

/** 功能：电器、数码 */
export const DEVICE_TAGS = [
  'aircon',
  'tv',
  'hifi',
  'pc', // 台式主机
  'aio-pc', // 一体机、复古电脑
  'monitor',
  'keyboard',
  'mouse',
  'headset', // 耳机、耳麦
  'laptop',
  'game-console',
  'gamepad',
  'video-game',
  'rice-cooker',
  'kettle',
  'electric-kettle', // 电水壶、电热水瓶（检查清单「电水壶」、厨房台面）
  'microwave',
  'steam-oven', // 蒸烤箱（和微波炉合算同类数量）
  'toaster',
  'coffee-maker',
  'air-fryer',
  'pressure-cooker',
  'blender',
  'stand-mixer',
  'vacuum',
  'router',
  'nas',
  'humidifier',
  'purifier',
  'dehumidifier',
  'hair-dryer',
  'body-scale', // 体重秤
  'camera',
  'lens',
  'webcam',
  'mic',
  'stream-gear',
  'audio-gear',
  'tablet',
  'microscope',
  'electronics-tool', // 电子手工工具（示波器、烙铁、开发板）
] as const

/** 功能：灯、绿植 */
export const LIGHT_PLANT_TAGS = [
  'light', // 会发光的灯具（灯光模块据此加光源）
  'lamp', // 灯（检查清单「照明」）
  'desk-lamp',
  'table-lamp',
  'plant', // 绿植（贴墙时枝叶弯曲）
] as const

/** 功能：厨房、餐具 */
export const KITCHEN_TAGS = ['cutting-board', 'knife-block', 'dish-rack', 'spice', 'oil-bottle', 'paper-towel', 'coffee-gear', 'tea-set', 'fruit-bowl', 'cup'] as const

/** 功能：卫浴、洗衣、洗护 */
export const HYGIENE_TAGS = [
  'toothbrush',
  'oral-care',
  'hand-soap',
  'skincare',
  'cosmetics',
  'makeup-mirror',
  'shampoo',
  'body-soap',
  'toilet-paper',
  'toilet-brush',
  'sanitary-bin',
  'air-freshener',
  'towel',
  'detergent',
  'softener',
  'laundry-supply',
  'wet-supply', // 卫浴、洗衣用品（不进客厅的柜格）
] as const

/** 功能：其他日用、收藏、玩具 */
export const ITEM_TAGS = [
  'shoe',
  'book',
  'manga',
  'magazine',
  'pen', // 笔、笔筒、笔袋
  'storage-box', // 收纳箱 / 盒 / 篮
  'tabletop-game', // 桌游、棋、牌（含盒装）
  'line-dry', // 晾衣架上可以晾的日常衣物
  'plush',
  'figure',
  'acrylic-stand',
  'gacha',
  'toy',
  'clock',
  'vase',
  'key-tray',
  'trash-bin',
  'wall-art',
  'music-accessory', // 节拍器、乐谱
  'dog', // 狗用品（宠物分类）
  'cat', // 猫用品（宠物分类）
] as const

/** 属性 */
export const ATTR_TAGS = [
  'for-kids', // 儿童用
  'diatomite', // 硅藻土 / 石材（地垫）
  'fixture', // 设备（只在 3D 里代替平面图设备）
] as const

/** 摆放能力 / 约束 */
export const PLACEMENT_TAGS = [
  'high-ok', // 可以放到 140cm 以上的高处（书柜顶、吊柜）
  'bed-ok', // 可以随手放床上
  'multi-ok', // 同款可以摆很多个（不受「同款每间一个」限制）
  'kitchen-shelf-ok', // 适合厨房墙上搁板
  'toilet-shelf-ok', // 适合马桶上方搁板
  'fridge-door', // 可以贴冰箱门（冰箱贴、便签、照片）
  'curio-ok', // 适合多宝格（瓷器、茶具、盆景、奇石…）
  'collectible', // 收藏品（展示柜里摆的）
  'open-shelf', // 开放格子柜架：一键布置会保证每一格都放东西
  'curio-shelf', // 多宝格类柜架
  'collection-shelf', // 展示 / 收藏类柜架
  'set-piece', // 成套摆放专用的部件（双人桌、棋罐、相机柜），通用查询不返回
] as const

/** 迁移期的过渡标签：和旧规则逐字对应，用于证明重构等价；审查后会被功能标签取代 */
export const LEGACY_TAGS = [
  'gym-prop',
  'closet-prop',
  'theater-prop',
  'music-prop',
  'legacy-book-label',
  'legacy-cl-bed',
  'legacy-cl-desk',
  'legacy-cl-detergent-fix',
  'legacy-cl-lamp-fix',
  'legacy-cl-scale',
  'legacy-cl-shoe-fix',
  'legacy-closet-mirror',
  'legacy-col-t1',
  'legacy-col-t2',
  'legacy-fit-t1',
  'legacy-fit-t2',
  'legacy-fit-t3',
  'legacy-fit-t4',
  'legacy-fix-bed',
  'legacy-fix-desk',
  'legacy-hobby-desk',
  'legacy-light-dining',
  'legacy-music-shelf',
  'legacy-music-t2',
  'legacy-name-zhuo',
  'legacy-piano-drum',
  'legacy-plain-chair',
  'legacy-reading-chair',
  'legacy-showcase',
  'legacy-theater-shelf',
  'legacy-tp-check',
  'legacy-wall-deco',
  'legacy-ws-office',
  'legacy-kb-id',
] as const

/** 「这是什么」类标签（每件素材至少要有一个） */
export const FUNCTION_TAGS = [...FURNITURE_TAGS, ...DEVICE_TAGS, ...LIGHT_PLANT_TAGS, ...KITCHEN_TAGS, ...HYGIENE_TAGS, ...ITEM_TAGS] as const

type FixedTag =
  | (typeof FURNITURE_TAGS)[number]
  | (typeof DEVICE_TAGS)[number]
  | (typeof LIGHT_PLANT_TAGS)[number]
  | (typeof KITCHEN_TAGS)[number]
  | (typeof HYGIENE_TAGS)[number]
  | (typeof ITEM_TAGS)[number]
  | (typeof ATTR_TAGS)[number]
  | (typeof PLACEMENT_TAGS)[number]
  | (typeof LEGACY_TAGS)[number]

export type Tag = FixedTag | `hobby:${InterestId}`

/** 固定词表（不含 hobby: 这类带参数的） */
export const FIXED_TAGS: readonly string[] = [...FUNCTION_TAGS, ...ATTR_TAGS, ...PLACEMENT_TAGS, ...LEGACY_TAGS]

/** 有没有其中任一标签 */
export function hasTag(d: Pick<AssetDef, 'tags'> | undefined | null, ...ts: Tag[]): boolean {
  const own = d?.tags
  if (!own) return false
  for (const t of ts) if (own.includes(t)) return true
  return false
}

/** 全部标签都有 */
export function hasAllTags(d: Pick<AssetDef, 'tags'> | undefined | null, ...ts: Tag[]): boolean {
  const own = d?.tags
  return !!own && ts.every((t) => own.includes(t))
}

/**
 * 素材选择器：一个标签、一组标签（任一）、或锚定在 id 开头的正则（只匹配 id，用于成套摆放的专用系列 / 明确点名的几件），
 * 也可以混在一个数组里（并集）。名字不参与匹配。
 */
export type Sel = Tag | RegExp | readonly (Tag | RegExp)[]

export function matchSel(d: AssetDef, sel: Sel): boolean {
  if (typeof sel === 'string') return hasTag(d, sel)
  if (sel instanceof RegExp) return sel.test(d.id)
  for (const s of sel) if (typeof s === 'string' ? hasTag(d, s) : s.test(d.id)) return true
  return false
}

/** 选择器的缓存键 */
export function selKey(sel: Sel): string | null {
  const one = (s: Tag | RegExp) => (typeof s === 'string' ? s : s.global || s.sticky ? null : `/${s.source}/${s.flags}`)
  if (typeof sel === 'string' || sel instanceof RegExp) return one(sel)
  const ks = sel.map(one)
  return ks.includes(null) ? null : ks.join('|')
}

/** 选择器里有没有点名 id 的正则（点名了才会返回成套部件 set-piece） */
export function selNamesIds(sel: Sel): RegExp[] {
  if (typeof sel === 'string') return []
  if (sel instanceof RegExp) return [sel]
  return sel.filter((s): s is RegExp => s instanceof RegExp)
}
