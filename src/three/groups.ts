// 素材库的浏览维度：按功能分的大类（侧栏）+ 常用房间（筛选）。风格、尺寸另有筛选（catalog.ts）。
//
// 大类由素材的细分类型（def.type，功能标签）决定，一件素材只属于一个大类；设备类（fixture）单独一类。
// 新增功能标签时在 TYPE_GROUP 里补一行（缺了编译报错）。
// 常用房间来自素材的 category（定义素材时给的「放在哪」），只有和房间对得上的分类才有；category 本身仍给一键布置用。

import type { AssetCategory, AssetDef } from './kit'
import type { FUNCTION_TAGS } from './tags'

type FunctionTag = (typeof FUNCTION_TAGS)[number]

export type AssetGroup =
  | 'seating'
  | 'tables'
  | 'beds'
  | 'storage'
  | 'lighting'
  | 'textile'
  | 'decor'
  | 'plants'
  | 'kitchen'
  | 'appliance'
  | 'electronics'
  | 'bath'
  | 'clothing'
  | 'books'
  | 'games'
  | 'music'
  | 'fitness'
  | 'hobby'
  | 'kids'
  | 'pets'
  | 'daily'
  | 'fixture'

/** 大类的显示名：[中文, 日本語, English]，侧栏按这个顺序排 */
export const GROUP_NAMES: Record<AssetGroup, [zh: string, ja: string, en: string]> = {
  seating: ['沙发座椅', 'ソファ・椅子', 'Seating'],
  tables: ['桌几', 'テーブル・デスク', 'Tables & desks'],
  beds: ['床与寝具', 'ベッド・寝具', 'Beds'],
  storage: ['收纳柜架', '収納家具', 'Storage'],
  lighting: ['灯具', '照明器具', 'Lighting'],
  textile: ['地毯窗帘', 'ラグ・カーテン', 'Rugs & curtains'],
  decor: ['装饰摆件', 'インテリア小物', 'Decor'],
  plants: ['绿植园艺', 'グリーン・園芸', 'Plants & garden'],
  kitchen: ['厨房餐饮', 'キッチン・食卓', 'Kitchen & dining'],
  appliance: ['家电', '家電', 'Appliances'],
  electronics: ['数码影音', 'デジタル・AV', 'Electronics & AV'],
  bath: ['卫浴洗衣', 'バス・洗濯', 'Bath & laundry'],
  clothing: ['衣物鞋包', '服・靴・バッグ', 'Clothing'],
  books: ['书籍文具', '本・文房具', 'Books & stationery'],
  games: ['游戏桌游', 'ゲーム・ボードゲーム', 'Games'],
  music: ['乐器', '楽器', 'Instruments'],
  fitness: ['运动户外', 'スポーツ・アウトドア', 'Sports & outdoors'],
  hobby: ['手作收藏', 'ホビー・コレクション', 'Crafts & collections'],
  kids: ['儿童玩具', 'キッズ・おもちゃ', 'Kids & toys'],
  pets: ['宠物', 'ペット', 'Pets'],
  daily: ['日用杂货', '日用品', 'Household'],
  fixture: ['设备', '設備', 'Fixtures'],
}

export const GROUPS = Object.keys(GROUP_NAMES) as AssetGroup[]

/** 细分类型 → 大类 */
const TYPE_GROUP: Record<FunctionTag, AssetGroup> = {
  // 床
  bed: 'beds',
  bedding: 'beds',
  crib: 'beds',
  'kid-bed': 'beds',
  loft: 'beds',
  // 坐具
  sofa: 'seating',
  armchair: 'seating',
  chair: 'seating',
  seat: 'seating',
  stool: 'seating',
  'floor-cushion': 'seating',
  'dining-seat': 'seating',
  'dining-chair': 'seating',
  'bar-stool': 'seating',
  'floor-chair': 'seating',
  'office-chair': 'seating',
  'ergonomic-chair': 'seating',
  'gaming-chair': 'seating',
  // 桌
  desk: 'tables',
  workbench: 'tables',
  table: 'tables',
  'gaming-desk': 'tables',
  'duo-desk': 'tables',
  'dining-table': 'tables',
  'low-table': 'tables',
  'coffee-table': 'tables',
  vanity: 'tables',
  counter: 'tables',
  // 收纳
  nightstand: 'storage',
  bookshelf: 'storage',
  'record-shelf': 'storage',
  shelving: 'storage',
  'display-cabinet': 'storage',
  'curio-cabinet': 'storage',
  wardrobe: 'storage',
  dresser: 'storage',
  'clothes-rail': 'storage',
  'coat-rack': 'storage',
  'storage-cabinet': 'storage',
  cabinet: 'storage',
  'shoe-storage': 'storage',
  pantry: 'storage',
  'washer-rack': 'storage',
  'open-rack': 'storage',
  'tv-stand': 'storage',
  'garment-rail': 'storage',
  'kimono-rack': 'storage',
  'umbrella-stand': 'storage',
  'storage-box': 'storage',
  'hook-rack': 'storage',
  luggage: 'storage',
  // 灯
  light: 'lighting',
  'floor-lamp': 'lighting',
  'wall-lamp': 'lighting',
  lamp: 'lighting',
  'desk-lamp': 'lighting',
  'table-lamp': 'lighting',
  // 地毯、帘子
  rug: 'textile',
  curtain: 'textile',
  // 装饰
  mirror: 'decor',
  'floor-mirror': 'decor',
  clock: 'decor',
  vase: 'decor',
  'wall-art': 'decor',
  decor: 'decor',
  partition: 'decor',
  platform: 'decor',
  // 绿植
  plant: 'plants',
  planter: 'plants',
  'garden-tool': 'plants',
  // 厨房
  'cutting-board': 'kitchen',
  'knife-block': 'kitchen',
  'dish-rack': 'kitchen',
  spice: 'kitchen',
  'oil-bottle': 'kitchen',
  'paper-towel': 'kitchen',
  'coffee-gear': 'kitchen',
  'tea-set': 'kitchen',
  'fruit-bowl': 'kitchen',
  cup: 'kitchen',
  mug: 'kitchen',
  'coffee-cup': 'kitchen',
  teacup: 'kitchen',
  food: 'kitchen',
  drink: 'kitchen',
  tableware: 'kitchen',
  cookware: 'kitchen',
  kitchenware: 'kitchen',
  // 家电
  aircon: 'appliance',
  'rice-cooker': 'appliance',
  kettle: 'appliance',
  'electric-kettle': 'appliance',
  microwave: 'appliance',
  'steam-oven': 'appliance',
  toaster: 'appliance',
  'coffee-maker': 'appliance',
  'air-fryer': 'appliance',
  'pressure-cooker': 'appliance',
  blender: 'appliance',
  'stand-mixer': 'appliance',
  vacuum: 'appliance',
  humidifier: 'appliance',
  purifier: 'appliance',
  dehumidifier: 'appliance',
  fan: 'appliance',
  heater: 'appliance',
  fridge: 'appliance',
  washer: 'appliance',
  dryer: 'appliance',
  appliance: 'appliance',
  // 数码影音
  tv: 'electronics',
  hifi: 'electronics',
  pc: 'electronics',
  'aio-pc': 'electronics',
  monitor: 'electronics',
  keyboard: 'electronics',
  mouse: 'electronics',
  headset: 'electronics',
  laptop: 'electronics',
  router: 'electronics',
  nas: 'electronics',
  camera: 'electronics',
  lens: 'electronics',
  webcam: 'electronics',
  mic: 'electronics',
  'stream-gear': 'electronics',
  'audio-gear': 'electronics',
  tablet: 'electronics',
  electronics: 'electronics',
  audio: 'electronics',
  'home-camera': 'electronics',
  'office-machine': 'electronics',
  'projector-screen': 'electronics',
  'home-theater': 'electronics',
  robot: 'electronics',
  // 卫浴、洗衣、个人护理
  'towel-rail': 'bath',
  'towel-bar': 'bath',
  'bath-corner-shelf': 'bath',
  'bath-wall-shelf': 'bath',
  'bath-mat': 'bath',
  'bath-stool': 'bath',
  'bath-pail': 'bath',
  'laundry-stand': 'bath',
  hamper: 'bath',
  'laundry-basket': 'bath',
  toothbrush: 'bath',
  'oral-care': 'bath',
  'hand-soap': 'bath',
  skincare: 'bath',
  cosmetics: 'bath',
  perfume: 'bath',
  'makeup-mirror': 'bath',
  shampoo: 'bath',
  'body-soap': 'bath',
  'toilet-paper': 'bath',
  'toilet-brush': 'bath',
  'sanitary-bin': 'bath',
  plunger: 'bath',
  sanitary: 'bath',
  'air-freshener': 'bath',
  towel: 'bath',
  detergent: 'bath',
  softener: 'bath',
  'laundry-supply': 'bath',
  'wet-supply': 'bath',
  'hair-dryer': 'bath',
  'body-scale': 'bath',
  'personal-care': 'bath',
  // 衣物
  shoe: 'clothing',
  'line-dry': 'clothing',
  hat: 'clothing',
  bag: 'clothing',
  clothing: 'clothing',
  // 书、文具
  book: 'books',
  manga: 'books',
  magazine: 'books',
  pen: 'books',
  stationery: 'books',
  // 游戏
  'game-console': 'games',
  'video-game': 'games',
  'tabletop-game': 'games',
  puzzle: 'games',
  gacha: 'games',
  // 乐器
  'music-stand': 'music',
  guitar: 'music',
  piano: 'music',
  drums: 'music',
  'e-keyboard': 'music',
  instrument: 'music',
  'music-accessory': 'music',
  record: 'music',
  // 运动、户外
  weights: 'fitness',
  yoga: 'fitness',
  cardio: 'fitness',
  strength: 'fitness',
  'yoga-mat': 'fitness',
  'sports-gear': 'fitness',
  'water-bottle': 'fitness',
  'outdoor-gear': 'fitness',
  'fishing-gear': 'fitness',
  // 手作、收藏
  'craft-tool': 'hobby',
  'science-kit': 'hobby',
  microscope: 'hobby',
  'electronics-tool': 'hobby',
  model: 'hobby',
  drone: 'hobby',
  figure: 'hobby',
  'acrylic-stand': 'hobby',
  trophy: 'hobby',
  coin: 'hobby',
  stamp: 'hobby',
  mineral: 'hobby',
  // 儿童
  'play-mat': 'kids',
  plush: 'kids',
  toy: 'kids',
  // 宠物
  'cat-tower': 'pets',
  'pet-bowl': 'pets',
  'litter-box': 'pets',
  aquarium: 'pets',
  'pet-supply': 'pets',
  dog: 'pets',
  cat: 'pets',
  // 日用
  'key-tray': 'daily',
  'trash-bin': 'daily',
  cleaning: 'daily',
  sundries: 'daily',
  tool: 'daily',
  'shopping-bag': 'daily',
}

/** 素材所属的大类：设备类单独一类；否则按细分类型，没有细分类型的按第一个功能标签，都没有算装饰。筛选时每件都要查，缓存起来 */
const groupCache = new WeakMap<AssetDef, AssetGroup>()
export function groupOf(def: AssetDef): AssetGroup {
  let g = groupCache.get(def)
  if (!g) groupCache.set(def, (g = findGroup(def)))
  return g
}
function findGroup(def: AssetDef): AssetGroup {
  if (def.fixture) return 'fixture'
  if (def.type && def.type in TYPE_GROUP) return TYPE_GROUP[def.type as FunctionTag]
  for (const t of def.tags ?? []) if (t in TYPE_GROUP) return TYPE_GROUP[t as FunctionTag]
  return 'decor'
}

export type AssetRoom = 'living' | 'dining' | 'kitchen' | 'bedroom' | 'study' | 'kids' | 'washitsu' | 'bath' | 'entrance' | 'outdoor'

/** 常用房间的显示名：[中文, 日本語, English] */
export const ROOM_NAMES_LIB: Record<AssetRoom, [zh: string, ja: string, en: string]> = {
  living: ['客厅', 'リビング', 'Living room'],
  dining: ['餐厅', 'ダイニング', 'Dining'],
  kitchen: ['厨房', 'キッチン', 'Kitchen'],
  bedroom: ['卧室', '寝室', 'Bedroom'],
  study: ['书房', '書斎', 'Study'],
  kids: ['儿童房', '子ども部屋', 'Kids room'],
  washitsu: ['和室', '和室', 'Tatami room'],
  bath: ['卫浴', '水まわり', 'Bathroom'],
  entrance: ['玄关', '玄関', 'Entrance'],
  outdoor: ['阳台 / 户外', 'ベランダ・屋外', 'Balcony & outdoors'],
}

export const LIB_ROOMS = Object.keys(ROOM_NAMES_LIB) as AssetRoom[]

/** 素材分类 → 常用房间（灯、收纳、绿植这类哪里都放的分类没有） */
const CATEGORY_ROOM: Partial<Record<AssetCategory, AssetRoom>> = {
  living: 'living',
  dining: 'dining',
  kitchenware: 'kitchen',
  bedroom: 'bedroom',
  study: 'study',
  kids: 'kids',
  japanese: 'washitsu',
  toiletry: 'bath',
  entrance: 'entrance',
  outdoor: 'outdoor',
}

export const roomOf = (def: AssetDef): AssetRoom | undefined => CATEGORY_ROOM[def.category]
