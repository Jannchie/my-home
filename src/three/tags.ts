// 素材语义标签：业务规则（一键布置、检查清单、兴趣、工位、摄像头、灯光、绿植…）按标签判断「这是什么、能放哪」，
// 名字只用于显示。改名、翻译不会改变布置结果。
//
// 词表是受控的（Tag 联合类型，写错编译报错）：
//   功能       这件东西是什么：细分（bed、desk、kettle、towel、plant…，业务规则按它们查）+ 粗分类（decor、food、tool…），每件素材至少一个
//   属性       for-kids、diatomite…
//   摆放       能放在哪 / 怎么摆（high-ok 可放 >140cm 高处、bed-ok 可放床上、shelf-only 只放柜架、fridge-door 可贴冰箱门、set-piece 成套专用…）
//   兴趣       hobby:<InterestId>：和 household.ts 的兴趣对应（落地 / 摆件 / 壁挂按素材本身的形态区分）
//
// 标签来源：src/three/tags.generated.ts（迁移脚本 scripts/migrate-tags.mts 生成的初始表，pnpm gen:tags）与 def.tags 合并。
// 新素材直接在 def 里写 tags；test/tags.spec.ts 会检查每件素材都有功能标签、只用词表里的值，
// 以及业务代码里没有按名字 / id 子串判断类别的正则（选择器只允许锚定在 id 开头的正则，用来点名具体素材或成套系列）。

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
  'dining-seat', // 餐桌边的坐具（餐椅、餐凳、卡座）
  'dining-chair', // 餐椅
  'bar-stool', // 吧凳、吧椅
  'floor-chair', // 座椅子（和室无腿椅）
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
  'pantry', // 食品柜（パントリー収納）
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
  'laundry-basket', // 洗衣篮
  'bath-corner-shelf', // 浴室转角架
  'bath-wall-shelf', // 浴室壁挂置物架
  'cat-tower',
  'pet-bowl', // 宠物食碗（预览时宠物会去吃饭）
  'litter-box',
  'aquarium',
  'luggage',
  'music-stand',
  'guitar',
  'piano',
  'drums',
  'e-keyboard', // 电子琴
  'weights', // 哑铃、壶铃、杠铃
  'yoga', // 瑜伽 / 普拉提用品
  'cardio', // 跑步机、动感单车、划船机
  'strength', // 卧推凳、深蹲架、哑铃架
  'yoga-mat',
  'play-mat',
  'bath-mat',
  'bath-stool',
  'bath-pail', // 洗面桶 / 風呂桶
  'projector-screen',
] as const

/** 功能：电器、数码 */
export const DEVICE_TAGS = [
  'aircon',
  'intercom', // 可视对讲室内机、门铃室内机
  'control-panel', // 墙上的热水器 / 浴室遥控面板
  'light-switch', // 墙上的灯开关
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
  'floor-lamp',
  'wall-lamp',
  'ceiling-light', // 吸顶灯、吊灯（房间主灯）
  'lamp', // 灯（检查清单「照明」）
  'desk-lamp',
  'table-lamp',
  'plant', // 绿植（贴墙时枝叶弯曲）
  'planter', // 花箱
] as const

/** 功能：厨房、餐具 */
export const KITCHEN_TAGS = ['cutting-board', 'knife-block', 'dish-rack', 'spice', 'oil-bottle', 'paper-towel', 'coffee-gear', 'tea-set', 'fruit-bowl', 'cup', 'mug', 'coffee-cup', 'teacup'] as const

/** 功能：卫浴、洗衣、洗护 */
export const HYGIENE_TAGS = [
  'toothbrush',
  'oral-care',
  'hand-soap',
  'skincare',
  'cosmetics',
  'perfume',
  'makeup-mirror',
  'shampoo',
  'body-soap',
  'toilet-paper',
  'toilet-brush',
  'sanitary-bin',
  'plunger', // 马桶搋子
  'sanitary', // 生理用品（卫生巾、护垫）
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
  'record', // 唱片、唱片机
  'home-theater', // 投影仪、播放机、碟片、爆米花机
  'water-bottle',
  'hat',
  'bag', // 包（挎包、手提包、双肩包）
  'trophy', // 奖杯
  'coin', // 硬币收藏
  'stamp', // 邮票收藏
  'mineral', // 矿石、化石、水晶标本
  'dog', // 狗用品（宠物分类）
  'cat', // 猫用品（宠物分类）
] as const

/**
 * 功能：粗分类。保证每件素材至少有一个「这是什么」；业务规则需要更细的判断时用上面的细分标签。
 */
export const COARSE_TAGS = [
  'rug', // 地毯、地垫、脚垫
  'audio', // 音响、收音机、播放器
  'home-camera', // 家用摄像头（宠物 / 安防 / 婴儿监视器 / 门铃）
  'robot',
  'drone',
  'model', // 模型（飞机、火车、高达）
  'puzzle', // 益智玩具、魔方、拼图
  'clothing',
  'stationery', // 文具、便签、日历、白板
  'office-machine', // 打印机、扫描仪、碎纸机
  'electronics', // 手机、移动电源、遥控器、数码小件
  'fan',
  'heater',
  'fridge',
  'washer', // 洗衣机
  'dryer', // 干衣机
  'appliance', // 其他家电
  'cleaning', // 清洁用品、资源回收
  'hook-rack', // 洞洞板、挂钩排、挂架
  'shopping-bag',
  'food',
  'drink',
  'tableware', // 餐具、餐垫、酒器
  'cookware', // 锅、炉、厨房小电器
  'kitchenware', // 其他厨房用品
  'personal-care', // 纸巾、湿巾、药、指甲剪
  'sundries', // 日用杂货（蚊香、钥匙、遥控器、线香…）
  'tool', // 工具
  'garden-tool',
  'pet-supply',
  'instrument', // 乐器
  'sports-gear', // 运动 / 健身用品
  'outdoor-gear', // 登山露营用品
  'fishing-gear',
  'craft-tool', // 手作工具（缝纫、刺绣、水彩、3D 打印）
  'science-kit', // 望远镜、显微镜、地球仪、化学烧瓶
  'decor', // 装饰、节日摆设、挂画
  'curtain',
  'partition', // 屏风、隔断
  'platform', // 小上がり等地台
  'vanity', // 梳妆台
  'counter', // 中岛、吧台
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
  'bed-ok', // 可以随手放床上（一两本在看的书、单本漫画、玩偶、手机平板、耳机、叠好的衣物毛巾；整套书、书堆、收藏摆件、挂着的形态都不算）
  'shelf-only', // 只放柜架层板（书架、唱片架、展示柜…）：漫画全套这类成排的整套，不随手摆到床、桌、茶几上
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
  'retired', // 停用的旧素材：只为读旧存档保留（摆着的照常显示、能编辑），素材库不列；同时带 set-piece，一键布置不用
] as const

/** 「这是什么」类标签（每件素材至少要有一个） */
export const FUNCTION_TAGS = [...FURNITURE_TAGS, ...DEVICE_TAGS, ...LIGHT_PLANT_TAGS, ...KITCHEN_TAGS, ...HYGIENE_TAGS, ...ITEM_TAGS, ...COARSE_TAGS] as const

type FixedTag =
  | (typeof FURNITURE_TAGS)[number]
  | (typeof DEVICE_TAGS)[number]
  | (typeof LIGHT_PLANT_TAGS)[number]
  | (typeof KITCHEN_TAGS)[number]
  | (typeof HYGIENE_TAGS)[number]
  | (typeof ITEM_TAGS)[number]
  | (typeof COARSE_TAGS)[number]
  | (typeof ATTR_TAGS)[number]
  | (typeof PLACEMENT_TAGS)[number]

export type Tag = FixedTag | `hobby:${InterestId}`

/** 固定词表（不含 hobby: 这类带参数的） */
export const FIXED_TAGS: readonly string[] = [...FUNCTION_TAGS, ...ATTR_TAGS, ...PLACEMENT_TAGS]

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
