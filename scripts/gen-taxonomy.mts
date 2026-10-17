// 素材分类法：细分类型（type）+ 同款系列（series），生成 src/three/taxonomy.generated.ts。
// 用法：pnpm gen:taxonomy            生成
//       vite-node scripts/gen-taxonomy.mts --review <tsv>   导出每个旧 family 的拆分方式和成员类型，人工审查用
//
// 旧的 family 一个字段混了三种关系，这里把它拆开：
//   变体（variant）：完全相同的物品、不同的陈设方式（叠好 / 挂起、打开 / 合上、对局中 / 收在盒里、竖放 / 横放）
//   规格（size）：同一造型的不同尺寸（单人床 / 双人床、书桌 120 / 140、S / M / L）
//   款式：同类但造型不同的物品（行灯、石灯笼、PH 灯都是落地灯）——不再是变体，各自独立，靠细分类型 type 归类
// 生成结果：
//   series：素材库里合成一张卡片的单位 = 同一造型（含它的各尺寸、各陈设）；款式不同的不再合并
//   type：细分类型（一个功能标签，词表见 tags.ts），素材库按它细分筛选，一键布置的换款、同类数量、灯具池按它判断
// 新素材请在 def 里直接写 type / series（不写 family），这里只负责迁移已有素材。
import '../test/setup/stubdom'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS } from '/src/three/assets'
import type { AssetDef } from '/src/three/kit'
import { FUNCTION_TAGS } from '/src/three/tags'

type D = AssetDef

// ---------- 旧 family 的拆分方式（人工审查结论） ----------

/** 整个系列是同一件东西的不同陈设 / 状态（标签是「开局 / 对局中 / 收在盒里」「竖放 / 横放」这类） */
const VARIANT = new Set(
  `act-kachaka bg-checkers bg-chip-case bg-doushou bg-feixing bg-gomoku bg-junqi bg-paijiu bg-property bg-sugoroku bg-words
  broom-set bug-zapper ch-lounge cl-3ds cl-console-ps2 cl-console-ps5 cl-console-xss cl-console-xsx cl-gbasp col-coin-frame col-stamp-frame
  cordless-vac fm-folding-bed fm-recliner fm-storage-bed hg-mj-fold int-backgammon int-chess int-chinese-checkers int-e-guitar int-go
  int-hanafuda int-jenga int-karuta int-mahjong-set int-mahjong-table int-poker int-reversi int-shogi int-uno int-xiangqi kf-rail
  laundry-pinch lm-corner-sofa sofa-l phone pz-luban rb-companion rb-humanoid sn-cloud sn-heart sn-strip sn-tabs tablet yoga-mat
  hg-go-board webcam c2-stack-stool photo-frame`.split(/\s+/),
)
/** 同一造型的不同尺寸 */
const SIZE = new Set(
  `bed sofa desk desk-iron desk-waterfall desk-corner dining-table dining-iron dining-round fm-tatami-bed fm-koagari fm-modular fm-sliding-wardrobe
  av-hifi-tower av-theater-sofa be-lingerie be-mini-drawers bg-box-stack bx-lid-panel bx-lid-roll c2-bench c2-shoe-bench cast-iron-pot ch-swivel-bar
  clear-case col-curio-cabinet col-imari-plate col-geode cube-shelf dehumidifier dry-cabinet fm-tilt-shoe frying-pan garment-rail gd-bonsai-tray gd-enamel
  gd-glazed gd-rattan gd-seed-tray gd-terra gd-cement gd-ceramic gd-woodbox gm-closet-pipe gm-row-casual gm-row-kids gm-row-men gm-row-outer gm-row-women
  hook-rail int-cartons int-manga-stack kettlebell kf-cupboard kf-milk kf-pet kf-plates kf-rice-sack kf-wagon kf-water lm-tv-board lv-tv-low mk-breadboard
  monitor nas open-rack pegboard pegboard-set pl-fiddle pot rice-cooker sb-carton sb-carton-stack sb-drawer-cab sb-flip-cab sb-rack-metal sb-rack-wood
  shoe-rack sorting-bin ss-daruma ss-fukubukuro ss-hot-carpet ss-kagami-mochi ss-maneki ss-pumpkin ss-xmas-tree st-drawer-tower st-pipe-shelf
  st-steel-rack stock-pot toilet-rack tp-pack tv wall-art-abstract wall-art-flower wall-art-mountain wall-tv washroom-tall wire-rack ws-kitchen-cab
  ws-kitchen-rail yukihira lm-block-sofa bath-stool c2-iron-stool c2-wood-bar ch-bar-back mv-art-acrylic mv-art-black mv-art-canvas mv-art-gold mv-art-wood
  mug ph-birdcage-square ph-dog-crate plush-shark sb-plastic-box sb-underbed sb-fabric-box steam-loco st-bookcase ss-kadomatsu ss-koinobori ss-tanabata
  ws-kitchen-shelf ws-toilet-shelf wall-tier-shelf towel-bar tp-holder shredder bag-regi
  sb-shoe-ballet sb-shoe-canvas-high sb-shoe-canvas-low sb-shoe-chelsea sb-shoe-flipflop sb-shoe-geta sb-shoe-hiking sb-shoe-loafer sb-shoe-oxford
  sb-shoe-rain-boot sb-shoe-sandal sb-shoe-slides sb-shoe-slipper sb-shoe-sneaker sb-shoe-velcro sb-shoe-zori`.split(/\s+/),
)
/** 混合的系列：返回系列内的分组键（同一键 = 同一造型），其余按款式拆开 */
const SPLIT: Record<string, (a: D) => string> = {
  // 空 / 放着碗盘是同一个沥水架，单层小号是另一款
  'kf-dish-rack': (a) => (/单层/.test(a.sizeLabel ?? '') ? 'mini' : 'main'),
  // 平放 / 带支架是同一台掌机，复古掌机是另一款
  handheld: (a) => (/复古/.test(a.sizeLabel ?? '') ? 'retro' : 'main'),
  // 30–120 cm 带柜鱼缸是同一款的不同尺寸，圆形金鱼缸是另一款
  aquarium: (a) => (/金鱼缸/.test(a.sizeLabel ?? '') ? 'bowl' : 'tank'),
  // 金属丝笼的两种尺寸是同一款，亚克力箱是另一款
  'ph-hamster-cage': (a) => (/亚克力/.test(a.sizeLabel ?? '') ? 'acrylic' : 'wire'),
  // 70 / 80 宽的洗衣机置物架是同一款的不同尺寸，其余各是一款
  'laundry-rack': (a) => (/^\d+$/.test(a.sizeLabel ?? '') ? 'plain' : `s:${a.sizeLabel}`),
  // 固定重量的哑铃是同一款不同重量，可调式是另一款
  dumbbell: (a) => (/可调/.test(a.sizeLabel ?? '') ? 'adj' : 'fixed'),
  // 魔方：同一阶的「打乱 / 复原 / 拧到一半」是同一个魔方的不同状态，不同阶是不同的魔方
  'puzzle-cube': (a) => (a.sizeLabel ?? '').split(' · ')[0],
}

// ---------- 细分类型 ----------

/** 旧系列 → 细分类型（款式系列拆开以后，靠它把同类放在一起） */
const FAMILY_TYPE: Record<string, string> = {
  'floor-lamp': 'floor-lamp',
  'wall-lamp': 'wall-lamp',
  'table-lamp': 'table-lamp',
  'desk-lamp': 'desk-lamp',
  beanbag: 'floor-cushion',
  'bath-corner-shelf': 'bath-corner-shelf',
  'bath-wall-shelf': 'bath-wall-shelf',
  'laundry-basket': 'laundry-basket',
  hamper: 'hamper',
  planter: 'planter',
  monstera: 'plant',
  'rug-round': 'rug',
  bear: 'plush',
  'kid-crib': 'crib',
  'kid-bed': 'kid-bed',
  fridge: 'fridge',
  washer: 'washer',
  dryer: 'dryer',
  'dining-chair': 'dining-chair',
  mug: 'mug',
  'prop-coffee-cup': 'coffee-cup',
  'prop-perfume': 'perfume',
  'coffee-table': 'coffee-table',
  nightstand: 'nightstand',
  dresser: 'dresser',
  bookshelf: 'bookshelf',
  'shoe-cabinet': 'shoe-storage',
  'umbrella-stand': 'umbrella-stand',
  'laundry-stand': 'laundry-stand',
  aircon: 'aircon',
  'body-scale': 'body-scale',
  'floor-mirror': 'floor-mirror',
  'bath-mat': 'bath-mat',
  'wet-bath-pail': 'bath-pail',
  'wet-toilet-brush': 'toilet-brush',
  'chore-swing-bin': 'trash-bin',
  'pc-tower': 'pc',
  tv: 'tv',
  'wall-tv': 'tv',
  'bag-hook-set': 'hook-rack',
  'bag-regi': 'shopping-bag',
  desk: 'desk',
  'desk-corner': 'desk',
  'fridge-magnet': 'decor',
  'kf-water-server': 'appliance',
  'prop-vase-flowers': 'vase',
  'prop-toothbrush-cup': 'toothbrush',
  'prop-key-tray': 'key-tray',
  'ring-light': 'lamp',
  'ss-kakejiku': 'decor',
  'ss-kerosene': 'heater',
  'hg-mj-fold': 'tabletop-game',
  'mk-parts-drawer': 'storage-cabinet',
  'hg-ban': 'tabletop-game',
}

/** 没有指定时，按素材的功能标签取最具体的一个 */
const TYPE_PRIORITY = [
  'crib', 'kid-bed', 'loft', 'bed', 'bedding',
  'gaming-chair', 'office-chair', 'armchair', 'sofa', 'bar-stool', 'floor-chair', 'dining-chair', 'stool', 'dining-seat', 'floor-cushion', 'chair', 'seat',
  'gaming-desk', 'desk', 'workbench', 'dining-table', 'low-table', 'coffee-table', 'counter', 'nightstand', 'vanity', 'table',
  'bookshelf', 'record-shelf', 'display-cabinet', 'curio-cabinet', 'wardrobe', 'dresser', 'shoe-storage', 'tv-stand', 'washer-rack', 'open-rack',
  'bath-corner-shelf', 'bath-wall-shelf', 'garment-rail', 'clothes-rail', 'coat-rack', 'kimono-rack', 'towel-rail', 'towel-bar', 'storage-cabinet',
  'umbrella-stand', 'laundry-stand', 'laundry-basket', 'hamper', 'cat-tower', 'litter-box', 'pet-bowl', 'aquarium', 'luggage', 'music-stand',
  'piano', 'drums', 'guitar', 'e-keyboard', 'floor-mirror', 'mirror', 'yoga-mat', 'play-mat', 'bath-mat', 'bath-stool', 'bath-pail', 'projector-screen', 'rug', 'partition', 'curtain', 'platform',
  'aircon', 'tv', 'fridge', 'washer', 'dryer', 'pc', 'aio-pc', 'monitor', 'laptop', 'keyboard', 'mouse', 'headset', 'game-console', 'video-game',
  'rice-cooker', 'electric-kettle', 'kettle', 'microwave', 'steam-oven', 'toaster', 'coffee-maker', 'air-fryer', 'pressure-cooker', 'blender', 'stand-mixer',
  'vacuum', 'router', 'nas', 'humidifier', 'purifier', 'dehumidifier', 'hair-dryer', 'body-scale', 'camera', 'lens', 'webcam', 'mic', 'stream-gear', 'audio-gear',
  'tablet', 'microscope', 'home-camera', 'drone', 'robot', 'fan', 'heater', 'audio', 'office-machine', 'electronics', 'appliance',
  'floor-lamp', 'wall-lamp', 'desk-lamp', 'table-lamp', 'planter', 'plant', 'lamp', 'light',
  'cutting-board', 'knife-block', 'dish-rack', 'spice', 'oil-bottle', 'paper-towel', 'coffee-gear', 'tea-set', 'fruit-bowl', 'mug', 'coffee-cup', 'teacup', 'cup', 'tableware', 'cookware', 'drink', 'food', 'kitchenware',
  'toothbrush', 'hand-soap', 'skincare', 'makeup-mirror', 'perfume', 'cosmetics', 'shampoo', 'body-soap', 'toilet-paper', 'toilet-brush', 'sanitary-bin', 'air-freshener',
  'towel', 'detergent', 'softener', 'laundry-supply', 'oral-care', 'personal-care', 'cleaning', 'wet-supply',
  'shoe', 'hat', 'bag', 'clothing', 'line-dry', 'book', 'manga', 'magazine', 'pen', 'stationery', 'trophy', 'coin', 'stamp', 'mineral', 'figure', 'acrylic-stand', 'gacha',
  'tabletop-game', 'puzzle', 'plush', 'toy', 'model', 'clock', 'vase', 'key-tray', 'trash-bin', 'wall-art', 'record', 'home-theater', 'music-accessory', 'instrument',
  'weights', 'yoga', 'cardio', 'strength', 'water-bottle', 'sports-gear', 'outdoor-gear', 'fishing-gear', 'craft-tool', 'science-kit', 'electronics-tool', 'tool', 'garden-tool',
  'storage-box', 'hook-rack', 'shopping-bag', 'pet-supply', 'dog', 'cat',
  // 「柜 / 架」只给家具：摆件里名字带架的（刀架、调料架）按上面更具体的类型
  'shelving', 'cabinet', 'sundries', 'decor',
]

// ---------- 生成 ----------

const args = process.argv.slice(2)
const FUNC = new Set<string>(FUNCTION_TAGS)
for (const t of TYPE_PRIORITY) if (!FUNC.has(t)) throw new Error(`TYPE_PRIORITY: ${t} 不是功能标签`)
for (const t of Object.values(FAMILY_TYPE)) if (!FUNC.has(t)) throw new Error(`FAMILY_TYPE: ${t} 不是功能标签`)

const fams = new Map<string, D[]>()
for (const a of ASSETS) if (a.family && !a.fixture) (fams.get(a.family) ?? fams.set(a.family, []).get(a.family)!).push(a)

/** 系列里只靠 form 区分的一组（同一件东西的不同陈设） */
const onlyForms = (xs: D[]) => xs.length === new Set(xs.map((a) => `${a.form ?? ''}|${a.formLabel ?? ''}`)).size

function modeOf(fam: string, xs: D[]) {
  if (SPLIT[fam]) return 'split'
  if (VARIANT.has(fam)) return 'variant'
  if (SIZE.has(fam)) return 'size'
  return new Set(xs.map((a) => a.sizeLabel ?? '')).size === 1 && onlyForms(xs) ? 'variant' : 'style'
}

const series = new Map<string, string>()
const modes = new Map<string, string>()
for (const [fam, xs] of fams) {
  if (xs.length < 2) continue
  const mode = modeOf(fam, xs)
  modes.set(fam, mode)
  // 款式系列：同一款式（sizeLabel 相同）里只靠 form 区分的才合成一个系列，否则各自独立
  const key = (a: D) => (mode === 'variant' || mode === 'size' ? fam : mode === 'split' ? `${fam}:${SPLIT[fam](a)}` : `${fam}:${a.sizeLabel ?? ''}`)
  const groups = new Map<string, D[]>()
  for (const a of xs) (groups.get(key(a)) ?? groups.set(key(a), []).get(key(a))!).push(a)
  for (const [k, g] of groups) {
    if (g.length < 2) continue
    if (mode === 'style' && !onlyForms(g)) continue
    for (const a of g) series.set(a.id, k)
  }
}

function typeOf(a: D) {
  if (a.family && FAMILY_TYPE[a.family]) return FAMILY_TYPE[a.family]
  // more-variety 包的装饰画、照片墙、立体壁饰都是挂画
  if (/^mv-(art|photo|deco)-/.test(a.id)) return 'wall-art'
  const own = new Set(a.tags ?? [])
  return TYPE_PRIORITY.find((t) => own.has(t)) ?? FUNCTION_TAGS.find((t) => own.has(t)) ?? null
}

const out: string[] = []
const missing: string[] = []
const types = new Map<string, string>()
for (const a of ASSETS) {
  if (a.fixture) continue
  const t = typeOf(a)
  if (!t) {
    missing.push(`${a.id} ${a.name} [${(a.tags ?? []).join(',')}]`)
    continue
  }
  types.set(a.id, t)
  const s = series.get(a.id)
  // 同类数量规则的默认分组：沿用旧系列（同一类款式每间一个，和以前一样），和 series 相同时省略
  const g = a.family && a.family !== (s ?? a.id) ? a.family : undefined
  out.push(`  ${JSON.stringify(a.id)}: ['${t}'${s || g ? `, ${s ? JSON.stringify(s) : 'undefined'}` : ''}${g ? `, ${JSON.stringify(g)}` : ''}],`)
}
if (missing.length) throw new Error(`没有细分类型：\n${missing.join('\n')}`)

if (args[0] === '--review') {
  const rows: string[] = []
  for (const [fam, xs] of [...fams].sort()) {
    if (xs.length < 2) continue
    const ss = new Set(xs.map((a) => series.get(a.id) ?? a.id))
    const ts = [...new Set(xs.map((a) => types.get(a.id)))]
    rows.push([fam, modes.get(fam), xs.length, ss.size, ts.join(','), xs[0].name, [...new Set(xs.map((a) => a.sizeLabel ?? ''))].slice(0, 6).join(' / ')].join('\t'))
  }
  fs.writeFileSync(args[1], rows.join('\n'))
  const byType = new Map<string, number>()
  for (const t of types.values()) byType.set(t, (byType.get(t) ?? 0) + 1)
  fs.writeFileSync(args[1].replace(/\.tsv$/, '-types.tsv'), [...byType].sort((p, q) => q[1] - p[1]).map((r) => r.join('\t')).join('\n'))
} else {
  const src = `// 由 scripts/gen-taxonomy.mts 生成：id → [细分类型 type, 同款系列 series, 同类数量分组 limitGroup]（没有系列的素材自成一款）。规则见 src/three/kit.ts 的 type / series。
// 新素材请在 def 里直接写 type / series；要改已有素材，改 gen-taxonomy.mts 里的审查表再 pnpm gen:taxonomy。
import type { Tag } from './tags'

export const TAXONOMY: Record<string, readonly [Tag, (string | undefined)?, string?]> = {
${out.join('\n')}
}
`
  fs.writeFileSync(path.resolve(process.cwd(), 'src/three/taxonomy.generated.ts'), src)
  console.log(`[gen-taxonomy] ${out.length} 个素材，${new Set(series.values()).size} 个多件系列，${new Set(types.values()).size} 种细分类型`)
}
