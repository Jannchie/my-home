// 语义标签迁移：用「迁移前」散落在业务代码里的名字 / id 正则给全部素材打一遍初始标签，生成 src/three/tags.generated.ts。
//
// 用法：vite-node scripts/migrate-tags.mts            生成（含人工审查结论 REVIEW）
//       vite-node scripts/migrate-tags.mts --faithful 只用旧规则、不套 REVIEW（核对重构是否等价时用）
//       vite-node scripts/migrate-tags.mts --check    不写文件，只打印各调用点「旧正则 vs 新标签查询」的候选差异
//
// 这里的正则是迁移时的一次性依据（从旧代码原样抄来），业务代码已经不再按名字判断。
// 生成后的标签表是数据：新增素材请直接在 def 里写 tags（与生成表合并），不要再回来加正则。
// 需要修正某件素材的标签时，在下面的 REVIEW 里加一条（写明原因）再重新生成，或直接在 def.tags 里补。
import '../test/setup/stubdom'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS } from '/src/three/assets'
import type { AssetDef } from '/src/three/kit'

type D = AssetDef
const T = (d: D) => `${d.id} ${d.name}`
/** 旧 Decorator.find 的匹配方式：id 或「id 名字」整串 */
const R = (re: RegExp) => (d: D) => re.test(d.id) || re.test(T(d))
const hasHook = (d: D) => !!d.surfaces?.some((l) => l.kind === 'hook' && l.shape?.length)
const furniture = (d: D) => !d.prop && !d.mount && !d.stick
const and =
  (...fs: ((d: D) => boolean)[]) =>
  (d: D) =>
    fs.every((f) => f(d))
const not = (f: (d: D) => boolean) => (d: D) => !f(d)

// ---------- 旧规则（原样抄自迁移前的代码，注释里写出处） ----------

const OLD = {
  // decorate.ts / homecams.ts / checklist.ts 的床
  isBedDecorate: (d: D) => d.family === 'bed' || d.family === 'kid-bed' || d.family === 'kid-crib' || /^bed-|床$/.test(d.id + ' ' + d.name),
  isBedCams: (d: D) => d.family === 'bed' || d.family === 'kid-bed' || d.family === 'kid-crib' || /^bed-|床$|futon|布団/.test(`${d.id} ${d.name}`),
  DESK_RE: /desk|书桌|电竞桌|工作台|L 形|tbl-desk/,
  NOT_PC_DESK: /potting|园艺|焊接|weld/,
  OFFICE_CHAIR_RE: /desk-chair|office|ergo|mesh|gaming|电竞|办公椅|人体工学|网椅/,
  SEAT_RE: /chair|stool|椅|凳|^ch-|^c2-/,
  LAPTOP_RE: /laptop(?!-stand)|笔记本电脑/,
  KEYBOARD_RE: /keyboard|键盘|^of-kb-/,
  HIGH_OK: /book|书|漫画|manga|plant|多肉|仙人掌|盆栽|succulent|cactus|figure|手办|收纳|box|篮|basket|trophy|奖杯|vase|花瓶|瓷|globe|地球仪|相框|frame|摆件|模型|plane|飞机|bear|玩偶|plush|lamp-globe/,
  BED_OK: /plush|玩偶|毛绒|bear|兔|cushion|靠垫|抱枕|pillow|枕|book|书(?!架|柜|桌)|漫画|manga|phone|手机|tablet|平板|switch|掌机|clothes|衣|towel|毛巾|pajama|睡衣/,
  MULTI_OK: /book|书|漫画|manga|plant|多肉|仙人掌|盆栽|succulent|cactus|herb|香草|figure|手办|立牌|bear|玩偶|plush|cat-loaf|shoe|鞋|magnet|冰箱贴|便签|sticky|polaroid|decal|贴纸|snack|零食|can|罐|box|盒|箱|carton|纸箱|zabuton|坐垫|cushion|靠垫|trophy|奖杯|record|唱片|cd|dvd|vhs|卡带|bottle|瓶|towel|毛巾|clothes|衣|hat|帽|bag|包|dumbbell|哑铃|kettlebell|壶铃|ball|球|stone|矿石|coin|硬币|stamp|邮票|pot|花盆|chair|椅|stool|凳/,
  PLANT_RE: /monstera|^pl-|cactus|plant|bonsai|盆栽|绿植|龟背|琴叶|橄榄|虎尾|天堂鸟|海芋|竹/,
  LAMP_RE: /灯|燭|烛|蜡烛|行灯|lamp|lantern|candle/i,
  NOT_LAMP: new Set(['gr-headlamp', 'int-penlights', 'mk-led-strip', 'sf-remote-light']),
  LIGHT_DINING_RE: /^tbl-dining|^tbl-bar-table|baxian|fh-table/,
  OPEN_SHELF_YES: /书架|书柜|多宝|陈列|展示|格|搁架|置物架|层架|开放架|bookshelf|bookcase|display|cube|curio|etagere|open-rack|wall-shelf|ラック|棚/,
  OPEN_SHELF_NO: /鞋|shoe|厨|kitchen|調味|调料|浴|bath|洗|wash|laundry|衣|wardrobe|closet|clothes|hanger|towel|毛巾|冰箱|fridge|微波|电视柜|tv-|toilet|马桶|garage|工具|tool|pet|猫|狗|cage|笼/,
}

/** decorate.ts LIMITS（同类数量规则） */
const LIMITS: [string, RegExp][] = [
  ['tv', /prop-tv|wall-tv|电视(?!柜)/],
  ['console', /game-console|cl-(ps\d|xsx|xss|xone|x360|wii|gamecube|n64|famicom|sfc|megadrive|switch-dock|mini-arcade)/],
  ['rice-cooker', /rice-cooker|电饭煲/],
  ['kettle', /kettle|electric-pot|tetsubin|水壶|电热水瓶|铁壶/],
  ['microwave', /microwave|steam-oven|微波炉|蒸烤箱/],
  ['toaster', /toaster|烤面包|烤箱/],
  ['coffee', /coffee-maker|espresso|咖啡机/],
  ['air-fryer', /air-fryer|空气炸锅/],
  ['pressure', /pressure-cooker|电压力锅/],
  ['blender', /blender|料理机|原汁机|juicer/],
  ['vacuum', /vac(?!uum-bag)|吸尘器|robot-station/],
  ['router', /router|路由器/],
  ['nas', /\bnas|of-nas|NAS/],
  ['piano', /piano|钢琴/],
  ['drums', /drum|架子鼓|电子鼓/],
  ['aquarium', /aquarium|水族|鱼缸/],
  ['clock', /clock|钟(?!表)/],
  ['floor-mirror', /floor-mirror|stand-mirror|mir-floor|穿衣镜|落地镜/],
  ['humidifier', /humidifier|加湿器/],
  ['purifier', /purifier|净化器/],
  ['dehumidifier', /dehumidifier(?!-bag)|除湿机/],
  ['trash', /垃圾桶|sort-bin|pedal-bin|kitchen-bin|swing-bin|waste-basket|废纸篓/],
  ['laptop', /laptop|笔记本电脑/],
  ['desk-lamp', /desk-lamp|折臂台灯|lamp-(edison|washi|globe|mushroom)/],
  ['table-lamp', /table-lamp|床头台灯/],
  ['monitor', /monitor|显示器/],
  ['tea-set', /tea-set|茶具|tea-tray/],
  ['fruit', /fruit-bowl|果盘|mikan-basket|橘子/],
  ['vase', /vase|花瓶/],
  ['key-tray', /key-tray|钥匙托盘/],
  ['makeup-mirror', /makeup-mirror|化妆镜|mir-table/],
  ['keyboard', /keyboard|键盘|kb-/],
  ['cup', /mug|cup(?!-noodle|board)|杯(?!垫)|yunomi|湯呑/],
]

/** household.ts INTERESTS：落地 / 摆件 / 壁挂各自的正则（cats 分类匹配不在这里，运行时照旧按分类） */
const INTERESTS: Record<string, { floor?: RegExp; props?: RegExp; wall?: RegExp }> = {
  gaming: { props: /pad-|handheld|gameboy|game-console|headset|arcade|vr\b|手柄|掌机|耳麦/, floor: /电竞椅|gaming/ },
  music: { props: /metronome|节拍|口琴|harmonica|谱|turntable|唱片机/, wall: /吉他|guitar/ },
  reading: { props: /book|书(?!架|柜|桌)/, floor: /bookshelf|bookcase|书架|书柜/ },
  otaku: { props: /漫画|manga|figure|手办|立牌|应援|gacha|扭蛋/, floor: /展示柜|showcase|display/ },
  photo: { floor: /tripod|三脚架/, props: /camera|lens|相机|镜头|拍立得/ },
  plants: { props: /gd-|succulent|cactus|air-plant|bonsai|多肉|盆栽|仙人掌|花瓶|浇水壶|花盆/ },
  crafts: { props: /毛线|缝纫|刺绣|书法|水彩|陶艺|knit|sew|embroid|paint/, floor: /easel|画架|缝纫/ },
  models: { props: /模型|train|plane|铁道|飞机|高达|gunpla|3d.?print|打印机/ },
  tea: { props: /tea|茶|incense|线香|daruma|达摩|tetsubin|铁壶/ },
  cats: { floor: /cat-|猫爬|猫窝|猫砂/, props: /cat|猫/ },
  dogs: { floor: /^(?!rb-).*(dog|狗)/ },
  aquarium: { floor: /aquarium|水族|鱼缸/ },
  smallpets: { floor: /ph-(hamster-(cage|castle)|rabbit|guinea|chinchilla)/, props: /ph-hamster-(cage|acrylic|castle)/ },
  birds: { floor: /ph-birdcage/, props: /ph-birdcage|ph-bird-perch/ },
  coffee: { props: /coffee|espresso|moka|pour-over|grinder|磨豆|咖啡/ },
  streaming: { props: /mic-|webcam|stream|capture|audio-interface|声卡|麦克风|补光/, floor: /ring-light-floor|softbox|green-screen|绿幕|柔光/ },
  tech: { props: /kb-|monitor|nas|mini-pc|router|显示器|键盘|NAS/, floor: /pc-(mid|full|itx)|server|机箱|机柜/ },
  sports: { props: /ball|球|racket|(?<![航自])拍|glove|手套|helmet|头盔/, floor: /surf|冲浪|golf|高尔夫|bike|自行车|skate|滑板|ski|滑雪/ },
  science: { props: /telescope|望远镜|microscope|显微镜|globe|地球仪|星图|flask|烧瓶|矿石/, floor: /telescope|望远镜/ },
  beauty: { floor: /mirror|镜|vanity|梳妆|clothes-rail|挂衣/ },
  boardgames: { props: /^(?!hg-go-bowl)(?=.*(桌游|棋|麻将|花札|かるた|扑克|骰|board-?game|chess|shogi|mahjong|jenga|叠叠乐|卡牌|牌九|骨牌|双六|拼字|筹码|计分本))(?!.*棋桌)/ },
  collecting: { props: /col-|瓷|矿石|晶|化石|硬币|邮票|coin|stamp|mineral|赏盘|茶碗/, floor: /陈列柜|博古架|curio/ },
  movies: { props: /av-|投影|CD|dvd|蓝光|vhs|卡带|cassette|boombox|爆米花|海报/, floor: /幕布|projector|家庭影院|soundbar|回音壁|落地音箱|hifi/i },
  fishing: { floor: /钓|fishing/, props: /渔具|拟饵|tackle|鱼篓/ },
  outdoor: { floor: /gr-.*(tent|pack|bag)|帐篷|登山包|露营|camp|ski|滑雪/, props: /gr-|登山|攀岩|露营|头灯|carabiner|harness|trekking|球(?!鞋)/ },
  maker: { floor: /mk-.*(bench|cabinet|chest)|工作台|工具柜|元件柜/, props: /mk-|pcb|arduino|开发板|面包板|烙铁|示波器|万用表|solder|oscillo|multimeter/i },
  puzzles: { props: /^(pz-(?!cube-shelf|speed-timer)|prop-rubiks)/ },
}

/** household.ts JOBS.desk */
const JOB_DESK: Record<string, RegExp> = {
  programmer: /monitor|kb-|mouse/,
  designer: /tablet|monitor|pen/,
  streamer: /mic-|webcam|monitor|stream/,
  photographer: /camera|lens|monitor/,
  musician: /audio-interface|mixer|monitor|synth|midi/,
  student: /laptop|book/,
  researcher: /monitor|book|microscope/,
  engineer: /mk-|monitor|oscillo|示波器|烙铁|pcb/,
  schoolkid: /book|pen|lamp/,
}

const CAMERA_CASE = /^of-(camera-showcase|dry-)/

// ---------- 标签规则：标签 → 旧规则（迁移依据） ----------

/** [标签, 判定]。同一个标签可以出现多次（取并集） */
const RULES: [string, (d: D) => boolean][] = [
  // ----- 床 / 坐具 -----
  ['bed', OLD.isBedDecorate],
  ['bedding', R(/futon|布団|被褥/)],
  ['legacy-cl-bed', R(/^bed-|kid-crib|kid-bed|futon|bd-bunk|bd-loft|床(?!头|尾|边)|被褥/)],
  ['legacy-fix-bed', (d) => /^bed-|kid-crib|kid-bed|futon|bd-bunk|bd-loft/.test(d.id)],
  ['crib', R(/kid-crib|婴儿床/)],
  ['kid-bed', R(/kid-bed|儿童床/)],
  ['loft', R(/loft|阁楼/)],
  ['sofa', R(/sofa|沙发/)],
  ['armchair', R(/armchair|单人沙发|lounge|阅读椅|摇椅/)],
  ['chair', R(/chair|椅/)],
  ['seat', R(/chair|stool|椅|凳|^ch-|^c2-/)],
  ['floor-cushion', R(/zabuton|坐垫|zaisu/)],
  ['stool', R(/stool|凳/)],
  ['dining-seat', (d) => R(/chair|椅|stool|凳|zabuton|坐垫|zaisu/)(d) && (d.category === 'dining' || /餐|dining/.test(d.id + d.name))],
  ['office-chair', R(/办公椅|office|ergonomic|人体工学|书桌椅|task/)],
  ['legacy-plain-chair', R(/办公椅|office|ergonomic|人体工学|书桌椅|task|绘图|简约/)],
  ['legacy-ws-office', R(OLD.OFFICE_CHAIR_RE)],
  ['ergonomic-chair', R(/人体工学|ergo|网椅|mesh-office/)],
  ['gaming-chair', R(/电竞椅|gaming-chair|^ch-gaming/)],
  // ----- 桌 -----
  ['desk', and((d) => !!d.surface, R(OLD.DESK_RE), not(R(OLD.NOT_PC_DESK)))],
  ['workbench', and((d) => !!d.surface, R(/工作台|workbench/))],
  ['table', and((d) => !!d.surface, R(/desk|桌/))],
  ['legacy-name-zhuo', (d) => /桌/.test(d.name)],
  ['legacy-hobby-desk', R(/tbl-desk-(120|140|160)|desk|书桌|工作台/)],
  ['legacy-fix-desk', (d) => /desk|书桌|学习桌/.test(d.id + d.name)],
  ['legacy-cl-desk', R(/desk|书桌|学习桌|写字台|电脑桌/)],
  ['gaming-desk', R(/gaming-desk|电竞桌|tbl-desk-(140|160|l-)|L 形/)],
  ['duo-desk', R(/duo|双人/)],
  ['dining-table', R(/dining-table|tbl-dining|餐桌/)],
  ['low-table', R(/kotatsu|被炉|chabudai|矮桌|ちゃぶ台/)],
  ['coffee-table', (d) => /几/.test(d.name)],
  ['nightstand', (d) => d.family === 'nightstand' || /床头柜|nightstand/.test(`${d.id} ${d.family ?? ''} ${d.name}`)],
  // ----- 柜架 -----
  ['bookshelf', R(/bookshelf|bookcase|书架|书柜/)],
  ['record-shelf', R(/唱片架|黑胶|cd-tower|CD 架/)],
  ['legacy-music-shelf', R(/bookshelf|书架|唱片架|黑胶/)],
  ['legacy-theater-shelf', R(/cd-tower|CD 架|唱片架|bookshelf/)],
  ['shelving', R(/bookshelf|书架|陈列柜|展示柜|收纳柜|shelf/)],
  ['display-cabinet', R(/展示柜|showcase|display/)],
  ['curio-cabinet', R(/陈列柜|博古架|curio/)],
  ['open-shelf', (d) => !d.prop && !!d.surfaces?.length && OLD.OPEN_SHELF_YES.test(`${d.id} ${d.name} ${d.family ?? ''}`) && !OLD.OPEN_SHELF_NO.test(`${d.id} ${d.name} ${d.family ?? ''}`)],
  ['wardrobe', R(/wardrobe|衣柜/)],
  ['dresser', R(/tansu|箪笥|dresser|斗柜/)],
  ['clothes-rail', R(/clothes-rail|挂衣/)],
  ['coat-rack', and(furniture, R(/衣帽架|hanger/))],
  ['storage-cabinet', R(/收纳柜|chest|抽屉柜|storage/)],
  ['cabinet', R(/shelf|架|柜/)],
  ['shoe-storage', R(/shoe-cabinet|鞋柜|鞋架|shoe-rack/)],
  ['washer-rack', R(/laundry-rack|ランドリー|洗衣机.*架|洗衣机置物架/)],
  ['open-rack', R(/sf-(open|wire)-rack|オープンラック|スチールラック/)],
  ['tv-stand', R(/tv-stand|lv-tv|电视柜/)],
  // ----- 电器 / 设备 -----
  ['aircon', R(/aircon|空调/)],
  ['tv', R(/prop-tv|wall-tv|电视(?!柜)/)],
  ['hifi', R(/av-ht-front|落地 HiFi|hifi/)],
  ['pc', R(/pc-tower|台式机|主机箱/)],
  ['aio-pc', (d) => /aio|一体机|retro-pc/.test(d.id)],
  ['electric-kettle', R(/prop-kettle$|electric-pot|电水壶|电热水瓶/)],
  ['legacy-light-dining', (d) => OLD.LIGHT_DINING_RE.test(d.id)],
  ['monitor', R(/monitor|显示器/)],
  ['keyboard', R(/keyboard|键盘|^of-kb-|kb-/)],
  ['legacy-kb-id', (d) => OLD.KEYBOARD_RE.test(d.id)],
  ['mouse', R(/mouse|鼠标/)],
  ['headset', R(/headset|耳麦|耳机|headphone/)],
  ['laptop', R(/laptop|笔记本电脑/)],
  ['game-console', R(/game-console|cl-(ps\d|xsx|xss|xone|x360|wii|gamecube|n64|famicom|sfc|megadrive|switch-dock|mini-arcade)/)],
  ['rice-cooker', R(/rice-cooker|电饭煲/)],
  ['kettle', R(/kettle|electric-pot|tetsubin|水壶|电热水瓶|铁壶/)],
  ['microwave', R(/microwave|steam-oven|微波炉|蒸烤箱/)],
  ['toaster', R(/toaster|烤面包|烤箱/)],
  ['coffee-maker', R(/coffee-maker|espresso|咖啡机/)],
  ['air-fryer', R(/air-fryer|空气炸锅/)],
  ['pressure-cooker', R(/pressure-cooker|电压力锅/)],
  ['blender', R(/blender|料理机|原汁机|juicer/)],
  ['stand-mixer', R(/stand-mixer|厨师机/)],
  ['vacuum', R(/vac(?!uum-bag)|吸尘器|robot-station/)],
  ['router', R(/router|路由器/)],
  ['nas', R(/\bnas|of-nas|NAS/)],
  ['humidifier', R(/humidifier|加湿器/)],
  ['purifier', R(/purifier|净化器/)],
  ['dehumidifier', R(/dehumidifier(?!-bag)|除湿机/)],
  ['hair-dryer', R(/hair-dryer|吹风机/)],
  ['body-scale', (d) => /^(wet-body-scale|fit-scale|scale-(glass|round|dial|composition))$/.test(d.id)],
  ['legacy-cl-scale', R(/body-scale|fit-scale|^scale-|体重秤/)],
  // ----- 灯 / 绿植 -----
  ['light', (d) => !d.fixture && !OLD.NOT_LAMP.has(d.id) && (d.category === 'lighting' || OLD.LAMP_RE.test(d.name) || OLD.LAMP_RE.test(d.id))],
  ['lamp', R(/lamp|灯(?!泡)/)],
  ['desk-lamp', R(/desk-lamp|折臂台灯|lamp-(edison|washi|globe|mushroom)/)],
  ['table-lamp', R(/table-lamp|床头台灯/)],
  ['legacy-cl-lamp-fix', R(/prop-table-lamp|prop-desk-lamp|台灯/)],
  ['plant', (d) => (d.category === 'plants' || (OLD.PLANT_RE.test(T(d)) && d.category !== 'lighting')) && !d.mount],
  // ----- 厨房 -----
  ['cutting-board', R(/prop-cutting-board|砧板|cutting/)],
  ['knife-block', R(/prop-knife-block|刀架/)],
  ['dish-rack', R(/prop-dish-rack|沥水/)],
  ['spice', R(/prop-spice-rack|spice-jars|调味|香料/)],
  ['oil-bottle', R(/oil-bottles|油壶/)],
  ['paper-towel', R(/paper-towel|厨房纸/)],
  ['coffee-gear', R(/coffee-maker|espresso|pour-over|moka|磨豆/)],
  ['kitchen-shelf-ok', R(/spice|调料|seasoning|jar|罐|canister|mug|杯|bottle|瓶|succulent|多肉|herb|香草|tea|茶|coffee|咖啡/)],
  ['tea-set', R(/tea-set|茶具|tea-tray/)],
  ['fruit-bowl', R(/fruit-bowl|果盘|mikan-basket|橘子/)],
  ['cup', (d) => /mug|cup(?!-noodle|board)|杯(?!垫)|yunomi|湯呑/.test(T(d)) && !/toothbrush|牙刷|漱口/.test(T(d))],
  // ----- 卫浴 / 洗衣 -----
  ['toothbrush', R(/toothbrush|刷牙/)],
  ['oral-care', R(/toothbrush|牙刷|漱口/)],
  ['hand-soap', R(/hand-soap|洗手液/)],
  ['skincare', R(/lotion|乳液|化妆水/)],
  ['cosmetics', R(/makeup-mirror|perfume|cosmetic|lipstick|lotion|comb|hair-dryer|化妆|香水|口红|乳液/)],
  ['makeup-mirror', R(/makeup-mirror|化妆镜|mir-table/)],
  ['shampoo', R(/shampoo|bottle-set|洗发|洗护三瓶/)],
  ['body-soap', R(/body-soap|body-wash|bottle-set|沐浴|洗护三瓶/)],
  ['toilet-paper', R(/toilet-paper|卷纸|卷筒纸/)],
  ['legacy-tp-check', (d) => /toilet-paper|卷纸/.test(d.id + d.name)],
  ['toilet-brush', R(/toilet-brush|马桶刷/)],
  ['sanitary-bin', R(/sanitary|卫生桶|小垃圾桶/)],
  ['air-freshener', R(/freshener|芳香|香氛/)],
  ['toilet-shelf-ok', R(/toilet-paper|卷纸|卷筒纸|freshener|芳香|香氛|消臭|除湿|succulent|多肉|plant|绿植|incense|香薰|diffuser|tissue|纸巾/)],
  ['bath-stool', R(/bath-stool|浴凳|风呂椅|風呂椅/)],
  ['bath-pail', R(/^wet-bath-pail|洗面桶|風呂桶|洗面器/)],
  ['bucket', R(/bucket|洗面桶|風呂桶/)],
  ['bath-mat', R(/bath-mat|bx-mat-/)],
  ['diatomite', (d) => /硅藻土|stone|diatom/.test(`${d.id} ${d.sizeLabel ?? ''}`)],
  ['towel', R(/towel|毛巾|浴巾/)],
  ['towel-rail', (d) => hasHook(d) && /towel|毛巾|浴巾|タオル/.test(`${d.id} ${d.family ?? ''} ${d.name}`)],
  ['towel-bar', R(/towel-bar|毛巾杆|浴巾架/)],
  ['detergent', R(/detergent|洗衣液|洗衣粉/)],
  ['legacy-cl-detergent-fix', R(/detergent|洗衣液/)],
  ['softener', R(/soften|柔软/)],
  ['laundry-supply', R(/detergent|soften|洗衣|柔软/)],
  ['laundry-stand', R(/laundry-stand|晾衣架/)],
  ['hamper', R(/hamper|脏衣篓/)],
  ['wet-supply', R(/^wet-|toilet|厕所|トイレ|浴|bath|洗|laundry|deodor|除臭|消臭|detergent/)],
  // ----- 衣物 / 玄关 -----
  ['shoe', R(/shoe(?!-cab|-rack)|鞋(?!柜|架)|sneaker|boots|靴/)],
  ['legacy-cl-shoe-fix', R(/sneaker|运动鞋|shoe/)],
  ['umbrella-stand', R(/umbrella|伞架/)],
  ['luggage', R(/luggage|行李箱|suitcase/)],
  ['kimono-rack', (d) => /ikou|衣桁/.test(`${d.id} ${d.family ?? ''} ${d.name}`)],
  ['garment-rail', (d) => /garment-rail|clothes-rail|挂衣杆/.test(`${d.id} ${d.family ?? ''} ${d.name}`) && !/gm-closet-pipe/.test(d.id)],
  ['mirror', R(/mirror|镜/)],
  ['legacy-closet-mirror', R(/mirror|穿衣镜|落地镜/)],
  ['floor-mirror', R(/floor-mirror|stand-mirror|mir-floor|穿衣镜|落地镜/)],
  // ----- 书 / 文具 / 数码 -----
  ['book', R(/book|书(?!架|柜|桌)/)],
  ['manga', R(/漫画|manga/)],
  ['magazine', R(/novel|杂志|magazine/)],
  // 工作台上的工具（职业工作台按它们挑；旧的 /pen/ 会命中 open、/midi/ 会命中 humidifier，这里按词边界写）
  ['camera', and((d) => !!d.prop, R(/^of-camera-|^of-action-cam|相机/))],
  ['lens', R(/^of-lens-|镜头/)],
  ['webcam', R(/webcam/)],
  ['mic', R(/(^|-)mic(-|$)|麦克风/)],
  ['stream-gear', R(/stream-deck|capture-card|直播/)],
  ['audio-gear', R(/audio-interface|of-mixer|调音台|synth|midi-|studio-monitors/)],
  ['tablet', R(/(^|-)tablet(-|$)|平板电脑|平板支架/)],
  ['pen', R(/(^|-)(pen|pencil)(-|s?$)|笔筒|笔袋|削笔/)],
  ['microscope', R(/microscope/)],
  ['electronics-tool', R(/^mk-|oscillo|示波器|烙铁|pcb/)],
  // 晾衣架上随手晾的日常衣物（T 恤、衬衫、裤子、裙子、童装）
  ['line-dry', (d) => /^gm-(tee|tshirt|t-shirt|shirt|blouse|polo|tank|hoodie|sweat|jeans|shorts|pants|slacks|dress|skirt|kids)/.test(d.id)],
  // 收纳箱 / 盒 / 篮（真正用来收东西的）
  // 桌游 / 棋牌 / 牌类（含收在盒里的）：和兴趣 boardgames 的摆件同一批
  ['tabletop-game', (d) => !!d.prop && INTERESTS.boardgames.props!.test(T(d))],
  ['storage-box', (d) => /^(sb-(plastic-box|fabric-box|rattan-box|closet-box|underbed|vac-bag|wood-crate)|sf-storage-box|sf-basket|wet-clear-case|wet-wash-basket|st-baskets|lm-file-boxes|av-cassette-box|mk-parts-box|mk-screw-sorter|prop-cosmetic-box)/.test(d.id) || /收纳箱|收纳盒|收纳篮/.test(d.name)],
  // ----- 收藏 / 玩具 / 装饰 -----
  ['plush', R(/plush|玩偶|毛绒|bear|teddy|兔|bunny|抱枕/)],
  ['figure', R(/figure|手办/)],
  ['video-game', R(/game-console|手柄|pad-|掌机|cl-/)],
  ['toy', R(/toy|玩具|积木|block|plush|玩偶|绘本|picture-book|ball|球/)],
  ['music-prop', R(/metronome|节拍|谱|唱片|record|headphone|耳机/)],
  ['theater-prop', R(/av-projector|投影|popcorn|爆米花|蓝光|dvd|vhs|cd-row/)],
  ['gym-prop', R(/dumbbell|哑铃|kettlebell|壶铃|protein|蛋白|towel|毛巾|水壶|bottle/)],
  ['closet-prop', R(/收纳箱|storage-box|box|盒|帽|hat|bag|包/)],
  ['music-stand', R(/谱架|music-stand/)],
  ['guitar', R(/guitar|吉他|bass|贝斯/)],
  ['piano', R(/piano|钢琴/)],
  ['drums', R(/drum|架子鼓|电子鼓/)],
  ['yoga-mat', R(/yoga-mat|瑜伽垫/)],
  ['play-mat', R(/play-?mat|爬行垫|拼图垫|地垫/)],
  ['wall-art', R(/wall-art|挂画|ss-art|ss-photo|ss-tapestry|ss-macrame|poster|海报/)],
  ['legacy-wall-deco', R(/wall-art|wall-clock|挂画|挂钟/)],
  ['clock', R(/clock|钟(?!表)/)],
  ['vase', R(/vase|花瓶/)],
  ['key-tray', R(/key-tray|钥匙托盘/)],
  ['trash-bin', R(/垃圾桶|sort-bin|pedal-bin|kitchen-bin|swing-bin|waste-basket|废纸篓/)],
  ['aquarium', R(/aquarium|水族|鱼缸/)],
  ['cat-tower', R(/cat-tower|猫爬架/)],
  ['litter-box', R(/litter|猫砂/)],
  ['fridge-door', (d) => !!d.stick && R(/冰箱贴|便签|拍立得|儿童画|magnet|sticky-note|polaroid|kids-drawing/)(d)],
  ['for-kids', R(/儿童画|kids|kid|儿童/)],
  // fillCompartments 的几类候选
  ['curio-ok', R(/瓷|vase|花瓶|茶|tea|盆景|bonsai|奇石|stone|香炉|incense|玉|jade|印章|砚|墨|scroll|卷轴|铜|bronze|葫芦/)],
  ['collectible', (d) => R(/figure|手办|フィギュア|模型|model|minifig|gacha|扭蛋|ガチャ|toy-car|小汽车|车模|ミニカー|mineral|矿石|crystal|水晶|shell|贝壳|snow-?globe|雪景球|trophy|奖杯|doll|人形|ornament|摆件|plush|玩偶|cube|魔方|squishy|捏捏|emo-bot|情感机器人/)(d) && !/box|盒|case|箱|card|牌|^hc-|摄像头|camera/.test(d.id + d.name)],
  // ----- 摆放能力 -----
  ['high-ok', R(OLD.HIGH_OK)],
  ['bed-ok', R(OLD.BED_OK)],
  ['multi-ok', R(OLD.MULTI_OK)],
  // ----- 成套摆放专用（通用查询不返回） -----
  ['set-piece', (d) => /^hg-duo|^hg-go-bowl/.test(d.id) || CAMERA_CASE.test(d.id)],
  ['projector-screen', R(/av-screen-(pull|electric)$|幕布/)],
  ['legacy-book-label', (d) => /book|书/.test(`${d.id} ${d.name} ${d.family ?? ''}`)],
  ['curio-shelf', (d) => /多宝|duobao|cn-|curio/.test(`${d.id} ${d.name} ${d.family ?? ''}`)],
  ['collection-shelf', (d) => /展示|陈列|收藏|showcase|display|collection|curio|コレクション/.test(`${d.id} ${d.name} ${d.family ?? ''}`)],
  // INTEREST_TIERS 里按名字挑的几级
  ['gamepad', R(/game-console|pad-|手柄/)],
  ['music-accessory', R(/metronome|节拍|谱/)],
  ['legacy-music-t2', (d) => /^(?!.*(piano|钢琴)).*(guitar|吉他|keyboard|电子琴|ukulele|尤克里里)/.test(T(d))],
  ['legacy-fit-t1', R(/dumbbell|哑铃|yoga|瑜伽/)],
  ['legacy-fit-t2', R(/yoga-mat|瑜伽垫|kettlebell|壶铃/)],
  ['legacy-fit-t3', R(/treadmill|跑步机|bike|单车|bench|卧推|rack/)],
  ['legacy-fit-t4', R(/power-rack|深蹲|rowing|划船/)],
  ['acrylic-stand', R(/立牌/)],
  ['gacha', R(/gacha|扭蛋/)],
  ['legacy-col-t1', R(/col-|硬币|邮票|coin|stamp/)],
  ['legacy-col-t2', R(/col-|矿石|化石|mineral/)],
  ['legacy-piano-drum', R(/piano|钢琴|drum|鼓/)],
  ['legacy-reading-chair', R(/armchair|单人沙发|阅读椅|摇椅/)],
  ['legacy-showcase', R(/展示柜|showcase/)],
  ['dog', (d) => d.category === 'pets' && /dog|狗/.test(T(d))],
  ['cat', (d) => d.category === 'pets' && /cat|猫/.test(T(d))],
]

// 兴趣：按素材的形态决定看哪条正则（落地看 floor、摆件和贴附物看 props、壁挂看 wall）
for (const [it, m] of Object.entries(INTERESTS)) {
  RULES.push([
    `hobby:${it}`,
    (d) => {
      const t = T(d)
      if (!d.prop && !d.mount && m.floor?.test(t) && (it === 'photo' || !CAMERA_CASE.test(d.id))) return true
      if (d.prop && m.props?.test(t)) return true
      if (d.stick && m.props?.test(t)) return true
      if (d.mount && m.wall?.test(t)) return true
      return false
    },
  ])
}

// ---------- 人工审查结论（REVIEW）：旧规则的误匹配，逐条修正 ----------

interface Fix {
  /** 素材 id，或 id 正则（批量） */
  ids: string[] | RegExp
  add?: string[]
  remove?: string[]
  why: string
}
const REVIEW: Fix[] = [
  // ---- 第 1 批：已知误匹配 ----
  { ids: ['ph-birdcage-bamboo', 'ph-birdcage-bamboo-hanging', 'prop-seiro', 'wet-charcoal-bag', 'gr-rugby', 'gd-plant-labels'], remove: ['plant'], why: '名字里的「竹 / 橄榄 / plant」不是绿植：竹编鸟笼、竹蒸笼、竹炭包、橄榄球、植物标签牌（会被当绿植贴墙弯折）' },
  {
    ids: ['av-projector-cube', 'av-projector-cube-on', 'sn-desk-cube', 'vb-kettle-cube', 'lp-cl-crystal-table', 'sw-cl-crystal-lamp', 'hb-model-workmat', 'ch-shell-wood', 'ch-shell-eiffel', 'lm-lazy-cube', 'lm-lazy-shell', 'lv-cube-2x2', 'lv-cube-3x3', 'lv-cube-4x4', 'ss-shelf-cube', 'sf-display-cube', 'vb-bs-cube', 'rb-helper'],
    remove: ['collectible'],
    why: 'cube / shell / crystal 字样被当成魔方、贝壳、水晶收藏（方块投影仪、便签本、方形电水壶、水晶灯、格子柜、壳椅…会被塞进展示柜）',
  },
  {
    ids: ['wet-deodor-box', 'wet-powder-box', 'chore-bag-box', 'gr-golf-box', 'hb-printer-box', 'int-tackle-box', 'int-tackle-box-open', 'int-boxing-gloves', 'int-basketball', 'cl-xone', 'cl-x360', 'of-pad-xbox', 'prop-tissue-box', 'sf-mask-box', 'sf-pill-box', 'kf-donut-box', 'kf-mikan-box', 'kf-cutlery-tray', 'kf-wrap-rack', 'kf-pan-rack', 'kf-veg-basket', 'kf-fruit-basket', 'prop-mikan-basket', 'sb-underbed-s', 'sb-underbed-m', 'sb-underbed-l', 'sb-toolbox-closed', 'sb-toolbox-open', 'sf-peg-cup-standing', 'sf-peg-cup-hanging', 'sf-peg-basket-standing', 'sf-peg-basket-hanging', 'gd-plant-labels'],
    remove: ['high-ok'],
    why: '名字带「盒 / box / 篮」的日用品、食物、电器（除臭盒、洗衣粉、纸巾盒、Xbox、篮球、拳击手套…）不是高处的收纳 / 摆件',
  },
  { ids: ['prop-stapler', 'int-calligraphy', 'ss-ceramic-heater', 'lp-nd-oak-arm', 'lp-md-arm', 'lp-cn-silk-frame-table', 'lp-cn-vase-table', 'lp-cl-bouillotte', 'lm-jar-lamp'], remove: ['high-ok'], why: '订书机 / 书法（「书」）、陶瓷暖风机（「瓷」）、台灯（frame / vase / 书桌灯）不是高处摆件' },
  // 工作台工具词表的清理（旧正则 monitor / keyboard / lamp 的误命中）
  { ids: ['of-studio-monitors', 'lm-monitor-riser'], remove: ['monitor'], why: '监听音箱、显示器增高架不是显示器（也不该占「每张桌一台显示器」的名额）' },
  { ids: ['int-synth', 'int-midi-keyboard', 'tbl-desk-pc'], remove: ['keyboard'], why: '合成器键盘是乐器、带键盘托的电脑桌是家具，都不是电脑键盘' },
  { ids: ['gr-headlamp', 'mk-led-strip'], remove: ['lamp'], why: '头灯、灯带卷不是室内照明' },
  { ids: ['hg-cert-folder', 'hg-cert-stack', 'hg-cert-tube', 'hg-cert-box', 'int-calligraphy', 'prop-stapler'], remove: ['book'], why: '证书收纳（证「书」）、书法套装、订书机不是书' },
  // ---- 第 2 批：同类数量规则（LIMITS）的误归类：被误归进一组的东西会互相挤掉名额 ----
  { ids: ['fit-kettlebell-4kg', 'fit-kettlebell-8kg', 'fit-kettlebell-16kg', 'gd-can-big', 'gd-can-small', 'gr-bike-bottles', 'kf-fridge-pot', 'prop-glass-pitcher', 'prop-water-pitcher'], remove: ['kettle'], why: '壶铃（kettlebell）、浇水壶、骑行水壶、冷水壶 / 滤水壶不是水壶：摆了它们就不能再摆电水壶（全屋限 1）' },
  { ids: ['prop-steam-oven'], remove: ['toaster'], why: '蒸烤箱（「烤箱」）归微波炉一类，不占烤面包机的名额' },
  { ids: ['kf-range-rack'], remove: ['microwave'], why: '微波炉架是家具，不是微波炉（摆了架子就摆不了微波炉）' },
  { ids: ['prop-steam-oven'], remove: ['microwave'], add: ['steam-oven'], why: '蒸烤箱单独一类（同类数量和检查清单里仍与微波炉合算；厨房台面挑「微波炉」时不挑它，和旧规则一致）' },
  { ids: /^(hg-trophy-|int-trophy-)/, remove: ['cup'], why: '奖杯不是杯子：会和马克杯一起受「全家杯子数 ≤ 人数 + 1」限制' },
  { ids: ['kf-chawanmushi', 'kf-cup-noodle', 'kf-cup-noodle-open', 'kf-noodle-case', 'kf-ice-cream', 'kf-pudding-3', 'prop-pen-cup', 'sf-peg-cup-standing', 'sf-peg-cup-hanging', 'wet-toy-cups'], remove: ['cup'], why: '茶碗蒸、杯面、冰淇淋杯、布丁、笔筒、洞洞板收纳杯、洗澡叠叠杯不是喝水的杯子' },
  { ids: ['sb-vac-bag-flat', 'sb-vac-bag-puffy'], remove: ['vacuum'], why: '衣物压缩袋（vac-bag）不是吸尘器' },
  { ids: ['wet-dehumidifier-l', 'wet-dehumidifier-s'], remove: ['dehumidifier'], why: '除湿盒（一次性吸湿盒）不是除湿机' },
  { ids: ['lp-rt-milk-bell-wall'], remove: ['clock'], why: '「钟」罩壁灯不是钟' },
  { ids: ['lp-cn-vase-table'], remove: ['vase'], why: '陶瓷瓶台灯是灯，不是花瓶' },
  { ids: ['cl-peeled-mikan', 'kf-mikan-box'], remove: ['fruit-bowl'], why: '剥了一半的橘子、一箱橘子不是果盘' },
]

// ---------- 生成 ----------

const args = new Set(process.argv.slice(2))
const faithful = args.has('--faithful')
const tags = new Map<string, Set<string>>()
for (const d of ASSETS) {
  const s = new Set<string>()
  if (d.fixture) s.add('fixture')
  else for (const [t, f] of RULES) if (f(d)) s.add(t)
  tags.set(d.id, s)
}
if (!faithful)
  for (const fx of REVIEW) {
    const hit = Array.isArray(fx.ids) ? fx.ids : ASSETS.filter((d) => (fx.ids as RegExp).test(d.id)).map((d) => d.id)
    for (const id of hit) {
      const s = tags.get(id)
      if (!s) throw new Error(`REVIEW: 没有素材 ${id}`)
      for (const t of fx.add ?? []) s.add(t)
      for (const t of fx.remove ?? []) s.delete(t)
    }
  }

const counts = new Map<string, number>()
for (const s of tags.values()) for (const t of s) counts.set(t, (counts.get(t) ?? 0) + 1)

if (args.has('--stats')) {
  for (const [t, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${t}\t${n}`)
}
if (args.has('--list')) {
  const want = process.argv[process.argv.indexOf('--list') + 1]
  for (const d of ASSETS) if (tags.get(d.id)!.has(want)) console.log(`${d.id}\t${d.name}\t${d.category}\t${d.prop ? 'P' : ''}${d.mount ? 'M' : ''}${d.stick ? 'S' : ''}`)
}
if (args.has('--dump')) {
  // 全部「标签 → 素材」写成一个 TSV，人工审查用
  const out = process.argv[process.argv.indexOf('--dump') + 1]
  const rows: string[] = []
  for (const d of ASSETS) for (const t of tags.get(d.id)!) rows.push(`${t}\t${d.id}\t${d.name}\t${d.category}\t${d.prop ? 'P' : ''}${d.mount ? 'M' : ''}${d.stick ? 'S' : ''}${d.form === 'hanging' ? 'H' : ''}`)
  fs.writeFileSync(out, rows.sort().join('\n'))
}
if (!args.has('--check') && !args.has('--stats') && !args.has('--list') && !args.has('--dump')) {
  const lines = ASSETS.map((d) => `  ${JSON.stringify(d.id)}: [${[...tags.get(d.id)!].sort().map((t) => `'${t}'`).join(', ')}],`)
  const src = `// 由 scripts/migrate-tags.mts 生成的初始语义标签（id → 标签）。规则见 src/three/tags.ts。
// 新增素材请在 def 里直接写 tags（运行时与这张表合并）；要改某件素材的标签，在 migrate-tags.mts 的 REVIEW 里加一条再重新生成。
import type { Tag } from './tags'

export const GENERATED_TAGS: Record<string, readonly Tag[]> = {
${lines.join('\n')}
}
`
  fs.writeFileSync(path.resolve(process.cwd(), 'src/three/tags.generated.ts'), src)
  console.log(`[migrate-tags] ${ASSETS.length} 个素材，${counts.size} 种标签${faithful ? '（faithful：未套用 REVIEW）' : `，REVIEW ${REVIEW.length} 条`}`)
}

// ---------- 核对：各调用点「旧正则（含原过滤条件）」与「新标签查询」的候选是否一致 ----------

if (args.has('--check')) {
  const has = (d: D, t: string) => tags.get(d.id)!.has(t)
  const any = (...ts: string[]) => (d: D) => ts.some((t) => has(d, t))
  const COMPOSED: [RegExp, RegExp][] = [
    [/^hg-duo/, /duo/],
    [/^hg-go-bowl/, /go-bowl/],
    [/^of-(camera-showcase|dry-)/, /camera-showcase|dry-/],
  ]
  /** 旧 Decorator.find */
  const F = (re: RegExp, f: (d: D) => boolean = () => true) => (d: D) =>
    !d.fixture && !COMPOSED.filter(([, n]) => !n.test(re.source)).some(([id]) => id.test(d.id)) && (re.test(d.id) || re.test(T(d))) && f(d)
  /** 新 find：标签（任一）+ 同样的过滤；成套部件不进通用查询 */
  const N = (ts: string | string[], f: (d: D) => boolean = () => true) => (d: D) => !d.fixture && !has(d, 'set-piece') && any(...[ts].flat())(d) && f(d)
  /** 旧的「id 名字」整串匹配（checklist count / household matches） */
  const C = (re: RegExp, f: (d: D) => boolean = () => true) => (d: D) => re.test(T(d)) && f(d)
  const NC = (ts: string | string[], f: (d: D) => boolean = () => true) => (d: D) => any(...[ts].flat())(d) && f(d)
  const prop = (d: D) => !!d.prop && d.form !== 'hanging'
  const propX = (d: D) => !!d.prop && !d.stick && !d.form?.includes('hanging')
  const floor = (d: D) => !d.prop && !d.mount && !d.stick && !d.fixture && Math.max(d.w, d.d) <= 240
  const mount = (d: D) => !!d.mount
  const small = (d: D) => !d.mount && d.form !== 'hanging' && Math.max(d.w, d.d) < 70
  const surf = (d: D) => !!d.surface && !d.prop
  const SITES: [string, (d: D) => boolean, (d: D) => boolean][] = []
  const site = (name: string, old: (d: D) => boolean, now: (d: D) => boolean) => SITES.push([name, old, now])

  // decorate.ts
  site('kitchenWall 搁板小物', F(/spice|调料|seasoning|jar|罐|canister|mug|杯|bottle|瓶|succulent|多肉|herb|香草|tea|茶|coffee|咖啡/, (a) => !!a.prop && a.h < 26 && !a.form?.includes('hanging')), N('kitchen-shelf-ok', (a) => !!a.prop && a.h < 26 && !a.form?.includes('hanging')))
  site('toiletWall 搁板小物', F(/toilet-paper|卷纸|卷筒纸|freshener|芳香|香氛|消臭|除湿|succulent|多肉|plant|绿植|incense|香薰|diffuser|tissue|纸巾/, (a) => !!a.prop && a.h < 20 && a.w < 30 && !a.form?.includes('hanging')), N('toilet-shelf-ok', (a) => !!a.prop && a.h < 20 && a.w < 30 && !a.form?.includes('hanging')))
  const kd: [RegExp, string][] = [
    [/prop-rice-cooker$|ih-rice-cooker|电饭煲/, 'rice-cooker'],
    [/prop-kettle$|electric-pot|电水壶|电热水瓶/, 'electric-kettle'],
    [/prop-cutting-board|砧板/, 'cutting-board'],
    [/prop-knife-block|刀架/, 'knife-block'],
    [/prop-toaster$|toaster-oven|烤面包/, 'toaster'],
    [/prop-microwave|微波炉/, 'microwave'],
    [/prop-dish-rack|沥水/, 'dish-rack'],
    [/prop-spice-rack|spice-jars|调味|香料/, 'spice'],
    [/air-fryer|空气炸锅/, 'air-fryer'],
    [/pressure-cooker|电压力锅/, 'pressure-cooker'],
    [/stand-mixer|厨师机/, 'stand-mixer'],
    [/oil-bottles|油壶/, 'oil-bottle'],
    [/paper-towel|厨房纸/, 'paper-towel'],
    [/coffee-maker|espresso|pour-over|moka|磨豆/, 'coffee-gear'],
  ]
  for (const [re, t] of kd) site(`kitchenDress ${t}`, F(re, prop), N(t, prop))
  site('kitchenDress 砧板居中', (d) => !!d.prop && /cutting|砧板/.test(d.id + d.name), (d) => !!d.prop && has(d, 'cutting-board'))
  site('bathMat', F(/bath-mat|bx-mat-/, (a) => !!a.prop && a.h < 4), N('bath-mat', (a) => !!a.prop && a.h < 4))
  const wet: [RegExp, string, (d: D) => boolean][] = [
    [/toothbrush|刷牙/, 'toothbrush', prop],
    [/hand-soap|洗手液/, 'hand-soap', prop],
    [/lotion|乳液|化妆水/, 'skincare', prop],
    [/toilet-paper|卷纸|卷筒纸/, 'toilet-paper', prop],
    [/freshener|芳香|香氛/, 'air-freshener', prop],
    [/detergent|洗衣液|洗衣粉/, 'detergent', prop],
    [/soften|柔软/, 'softener', prop],
    [/towel-bar|毛巾杆|浴巾架/, 'towel-bar', mount],
    [/toilet-brush|马桶刷/, 'toilet-brush', small],
    [/sanitary|卫生桶|小垃圾桶/, 'sanitary-bin', small],
    [/bath-stool|浴凳|风呂椅|風呂椅/, 'bath-stool', small],
    [/^wet-bath-pail|洗面桶|風呂桶|洗面器/, 'bath-pail', small],
    [/hamper|脏衣篓/, 'hamper', small],
  ]
  for (const [re, t, f] of wet) site(`wetDress ${t}`, F(re, f), N(t, f))
  site('wetDress 已有卷纸', (d) => /toilet-paper|卷纸/.test(d.id + d.name), any('legacy-tp-check'))
  site('wash 体重秤', F(/^(wet-body-scale|fit-scale|scale-(glass|round|dial|composition)) /), N('body-scale'))
  site('wash 撒洗衣用品毛巾', F(/detergent|soften|洗衣|柔软|towel|毛巾/, prop), N(['laundry-supply', 'towel'], prop))
  site('personalize 书桌', (d) => /desk|书桌|桌/.test(d.id + d.name) && !!d.surface, (d) => has(d, 'table') && !!d.surface)
  site('personalize 墙饰', F(/wall-art|wall-clock|挂画|挂钟/, mount), N('legacy-wall-deco', mount))
  site('duoGaming 电竞椅', F(/电竞椅|gaming-chair|^ch-gaming/, (a) => !a.prop && a.category !== 'tabletop'), N('gaming-chair', (a) => !a.prop && a.category !== 'tabletop'))
  site('gameNight 桌', (d) => !!d.surface && !d.prop && /dining-table|tbl-dining|餐桌|kotatsu|被炉|chabudai|矮桌|ちゃぶ台/.test(T(d)), (d) => !!d.surface && !d.prop && any('dining-table', 'low-table')(d))
  site('chairsUpTo 餐桌', (d) => /dining-table|tbl-dining|餐桌/.test(d.id + d.name), any('dining-table'))
  site('chairsUpTo 椅子', (d) => /chair|椅/.test(d.id + d.name), any('chair'))
  site('plushOnBed', F(/plush|玩偶|毛绒|bear|teddy|兔|bunny|抱枕/, propX), N('plush', propX))
  site('chairAsset 人体工学', F(/人体工学|ergo|网椅|mesh-office/, (a) => !a.prop && a.category === 'study' && a.form !== 'closed'), N('ergonomic-chair', (a) => !a.prop && a.category === 'study' && a.form !== 'closed'))
  site('chairAsset 办公椅 plain', F(/办公椅|office|ergonomic|人体工学|书桌椅|task|绘图|简约/, (a) => !a.prop && (a.category === 'study' || a.category === 'dining') && a.id !== 'desk-chair'), N('legacy-plain-chair', (a) => !a.prop && (a.category === 'study' || a.category === 'dining') && a.id !== 'desk-chair'))
  site('chairAsset 办公椅 any', F(/办公椅|office|ergonomic|人体工学|书桌椅|task/, (a) => !a.prop && a.id !== 'desk-chair'), N('office-chair', (a) => !a.prop && a.id !== 'desk-chair'))
  site('fridgeMagnets', F(/冰箱贴|便签|拍立得|儿童画|magnet|sticky-note|polaroid|kids-drawing/, (a) => !!a.stick), N('fridge-door', (a) => !!a.stick))
  site('fridgeMagnets 儿童画', (d) => !!d.stick && has(d, 'fridge-door') && /儿童画|kids/.test(d.id + d.name), (d) => !!d.stick && has(d, 'fridge-door') && has(d, 'for-kids'))
  site('rackOverWasher', F(/laundry-rack|ランドリー|洗衣机.*架|洗衣机置物架/, (a) => !a.prop && !a.mount), N('washer-rack', (a) => !a.prop && !a.mount))
  site('funcRoom 电竞椅', F(/电竞椅|gaming-chair|gaming/, (a) => !a.prop && a.category !== 'tabletop'), N('gaming-chair', (a) => !a.prop && a.category !== 'tabletop'))
  site('study/western 电竞椅', F(/电竞椅|gaming/, (a) => !a.prop), N('gaming-chair', (a) => !a.prop))
  site('library 书架', F(/bookshelf|bookcase|书架|书柜/, floor), N('bookshelf', floor))
  site('library 单人椅', F(/armchair|单人沙发|lounge|阅读椅|摇椅/, floor), N('armchair', floor))
  site('library 书', F(/book|书(?!架|柜|桌)|漫画/, propX), N(['book', 'manga'], propX))
  site('gaming 桌', F(/gaming-desk|电竞桌|tbl-desk-(140|160|l-)|L 形/, floor), N('gaming-desk', floor))
  for (const [re, t] of [[/monitor|显示器/, 'monitor'], [/keyboard|键盘/, 'keyboard'], [/mouse|鼠标/, 'mouse'], [/headset|耳麦|耳机/, 'headset']] as [RegExp, string][]) site(`gaming 外设 ${t}`, F(re, prop), N(t, prop))
  site('gaming 主机', F(/pc-tower|台式机|主机箱/, floor), N('pc', floor))
  site('gaming/theater 电视柜', F(/tv-stand|lv-tv|电视柜/, floor), N('tv-stand', floor))
  site('gaming 展示柜', F(/展示柜|showcase|display|figure|手办/, floor), N(['display-cabinet', 'figure'], floor))
  site('gaming 摆件', F(/game-console|手柄|pad-|掌机|cl-|figure|手办/, propX), N(['video-game', 'figure'], propX))
  site('music 谱架', F(/谱架|music-stand/, floor), N('music-stand', floor))
  site('music 吉他', F(/guitar|吉他|bass|贝斯/, floor), N('guitar', floor))
  site('music 凳', F(/stool|凳/, floor), N('stool', floor))
  site('music 书架', F(/bookshelf|书架|唱片架|黑胶/, floor), N('legacy-music-shelf', floor))
  site('music 摆件', F(/metronome|节拍|谱|唱片|record|headphone|耳机/, propX), N('music-prop', propX))
  site('theater 沙发', F(/sofa|沙发|影院沙发|theater-sofa/, (a) => floor(a) && a.w <= 200), N('sofa', (a) => floor(a) && a.w <= 200))
  site('theater 电视柜', F(/tv-stand|lv-tv|电视柜|av-ht-front|落地 HiFi|hifi/, floor), N(['tv-stand', 'hifi'], floor))
  site('theater 幕布', F(/av-screen-(pull|electric)$|幕布/, mount), N('projector-screen', mount))
  site('theater 唱片架', F(/cd-tower|CD 架|唱片架|bookshelf/, floor), N('legacy-theater-shelf', floor))
  site('theater 摆件', F(/av-projector|投影|popcorn|爆米花|蓝光|dvd|vhs|cd-row/, propX), N('theater-prop', propX))
  site('hobby 工作台(maker)', F(/mk-workbench|工作台|workbench/, floor), N('workbench', floor))
  site('hobby 书桌', F(/tbl-desk-(120|140|160)|desk|书桌|工作台/, floor), N('legacy-hobby-desk', floor))
  site('hobby/cards 柜', F(/bookshelf|书架|陈列柜|展示柜|收纳柜|shelf/, floor), N('shelving', floor))
  site('gym 健身器材', (d) => !d.fixture && d.category === 'fitness' && !d.prop && !d.mount, (d) => !d.fixture && d.category === 'fitness' && !d.prop && !d.mount)
  site('gym 镜', F(/mirror|镜/, floor), N('mirror', floor))
  site('gym 瑜伽垫', F(/yoga-mat|瑜伽垫/), N('yoga-mat'))
  site('gym 摆件', F(/dumbbell|哑铃|kettlebell|壶铃|protein|蛋白|towel|毛巾|水壶|bottle/, propX), N('gym-prop', propX))
  site('play 地垫', F(/play-?mat|爬行垫|拼图垫|地垫/), N('play-mat'))
  site('play 儿童家具', (d) => !d.fixture && d.category === 'kids' && !d.prop && !d.mount && !/crib|婴儿床|kid-bed|儿童床/.test(d.id + d.name), (d) => !d.fixture && d.category === 'kids' && !d.prop && !d.mount && !any('crib', 'kid-bed')(d))
  site('play 玩具', F(/toy|玩具|积木|block|plush|玩偶|绘本|picture-book|ball|球/, propX), N('toy', propX))
  site('guest 行李箱', F(/luggage|行李箱|suitcase/, floor), N('luggage', floor))
  site('guest 挂衣架', F(/clothes-rail|衣帽架|hanger|挂衣/, floor), N(['clothes-rail', 'coat-rack'], floor))
  site('closet 衣柜', F(/wardrobe|衣柜|clothes-rail|挂衣|收纳柜|chest|抽屉柜|storage/, floor), N(['wardrobe', 'clothes-rail', 'storage-cabinet'], floor))
  site('closet 镜', F(/mirror|穿衣镜|落地镜/, floor), N('legacy-closet-mirror', floor))
  site('closet 摆件', F(/收纳箱|storage-box|box|盒|帽|hat|bag|包/, propX), N('closet-prop', propX))
  site('wearDress 衣桁', (d) => hasHook(d) && /ikou|衣桁/.test(`${d.id} ${d.family ?? ''} ${d.name}`), (d) => hasHook(d) && has(d, 'kimono-rack'))
  site('wearDress 挂衣杆', (d) => hasHook(d) && !/ikou|衣桁/.test(`${d.id} ${d.family ?? ''} ${d.name}`) && /garment-rail|clothes-rail|挂衣杆/.test(`${d.id} ${d.family ?? ''} ${d.name}`) && !/gm-closet-pipe/.test(d.id), (d) => hasHook(d) && !has(d, 'kimono-rack') && has(d, 'garment-rail'))
  site('wearDress 毛巾杆', (d) => hasHook(d) && !/ikou|衣桁|garment-rail|clothes-rail|挂衣杆/.test(`${d.id} ${d.family ?? ''} ${d.name}`) && /towel|毛巾|浴巾|タオル/.test(`${d.id} ${d.family ?? ''} ${d.name}`), (d) => hasHook(d) && !has(d, 'kimono-rack') && !has(d, 'garment-rail') && has(d, 'towel-rail'))
  site('bedroomExtras 化妆品', F(/makeup-mirror|perfume|cosmetic|lipstick|lotion|comb|hair-dryer|化妆|香水|口红|乳液/, (a) => prop(a) && a.category === 'toiletry'), N('cosmetics', (a) => prop(a) && a.category === 'toiletry'))
  site('linen 架子', F(/sf-(open|wire)-rack|オープンラック|スチールラック/, (a) => !a.prop && !a.mount && (a.surfaces?.length ?? 0) >= 2 && a.d <= 50), N('open-rack', (a) => !a.prop && !a.mount && (a.surfaces?.length ?? 0) >= 2 && a.d <= 50))
  site('artWall 已有挂画', (d) => /wall-art|ss-art|ss-photo|ss-tapestry|ss-macrame|poster|海报|挂画/.test(T(d)), any('wall-art'))
  site('artWall 沙发', (d) => /sofa|沙发/.test(d.id + d.name), any('sofa'))
  site('DESK_RE', (d) => !!d.surface && OLD.DESK_RE.test(T(d)), (d) => !!d.surface && any('desk', 'workbench')(d))
  site('fillCompartments 多宝格', F(/瓷|vase|花瓶|茶|tea|盆景|bonsai|奇石|stone|香炉|incense|玉|jade|印章|砚|墨|scroll|卷轴|铜|bronze|葫芦/, (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging'), N('curio-ok', (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging'))
  site('fillCompartments 书', F(/book|书(?!架|柜|桌)|漫画|manga|novel|杂志|magazine/, (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging'), N(['book', 'manga', 'magazine'], (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging'))
  site('fillCompartments 摆件', F(OLD.HIGH_OK, (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging' && !/^wet-|toilet|厕所|トイレ|浴|bath|洗|laundry|deodor|除臭|消臭|detergent/.test(a.id + a.name)), N('high-ok', (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging' && !has(a, 'wet-supply')))
  site('fillCompartments 收藏', F(/figure|手办|フィギュア|模型|model|minifig|gacha|扭蛋|ガチャ|toy-car|小汽车|车模|ミニカー|mineral|矿石|crystal|水晶|shell|贝壳|snow-?globe|雪景球|trophy|奖杯|doll|人形|ornament|摆件|plush|玩偶|cube|魔方|squishy|捏捏|emo-bot|情感机器人/, (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging' && !/box|盒|case|箱|card|牌|^hc-|摄像头|camera/.test(a.id + a.name)), N('collectible', (a) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging'))
  site('fillCompartments 去盒', (d) => /box|盒|case|箱/.test(d.id + d.name), any('storage-box'))
  site('fillCompartments 多宝格柜', (d) => /多宝|duobao|cn-|curio/.test(`${d.id} ${d.name} ${d.family ?? ''}`), any('curio-shelf'))
  site('fillCompartments 收藏柜', (d) => /展示|陈列|收藏|showcase|display|collection|curio|コレクション/.test(`${d.id} ${d.name} ${d.family ?? ''}`), any('collection-shelf'))
  site('fillCompartments 书柜', (d) => has(d, 'open-shelf') && /book|书/.test(`${d.id} ${d.name} ${d.family ?? ''}`), (d) => has(d, 'open-shelf') && has(d, 'legacy-book-label'))
  site('isOpenShelf', (d) => !d.prop && !!d.surfaces?.length && OLD.OPEN_SHELF_YES.test(`${d.id} ${d.name} ${d.family ?? ''}`) && !OLD.OPEN_SHELF_NO.test(`${d.id} ${d.name} ${d.family ?? ''}`), any('open-shelf'))
  site('scatter HIGH_OK', R(OLD.HIGH_OK), any('high-ok'))
  site('scatter BED_OK', R(OLD.BED_OK), any('bed-ok'))
  site('MULTI_OK', R(OLD.MULTI_OK), any('multi-ok'))
  site('isBed(decorate)', OLD.isBedDecorate, any('bed'))
  site('isBed(homecams)', OLD.isBedCams, any('bed', 'bedding'))
  site('applyFixes 有床', (d) => /^bed-|kid-crib|kid-bed|futon|bd-bunk|bd-loft/.test(d.id), any('legacy-fix-bed'))
  site('applyFixes 有书桌', (d) => /desk|书桌|学习桌/.test(d.id + d.name), any('legacy-fix-desk'))
  site('dressFor 床头柜', (d) => !!d.surface && !d.prop && (d.family === 'nightstand' || /床头柜|nightstand/.test(`${d.id} ${d.family ?? ''} ${d.name}`)), (d) => !!d.surface && !d.prop && has(d, 'nightstand'))
  site('dressFor 电视柜', (d) => !!d.surface && !d.prop && !(d.family === 'nightstand' || /床头柜|nightstand/.test(`${d.id} ${d.family ?? ''} ${d.name}`)) && /tv|电视/.test(`${d.id} ${d.family ?? ''} ${d.name}`), (d) => !!d.surface && !d.prop && !has(d, 'nightstand') && any('tv-stand', 'tv')(d))
  site('dressFor 书桌', (d) => d.category === 'study' && /桌/.test(d.name), (d) => d.category === 'study' && any('legacy-name-zhuo')(d))
  site('dressFor 餐桌', (d) => d.category === 'dining' && /桌/.test(d.name), (d) => d.category === 'dining' && any('legacy-name-zhuo')(d))
  for (const [k, re] of LIMITS) site(`LIMITS ${k}`, (d) => re.test(T(d)) && !(k === 'cup' && /toothbrush|牙刷|漱口/.test(T(d))), any(({ console: 'game-console', coffee: 'coffee-maker', pressure: 'pressure-cooker', trash: 'trash-bin', fruit: 'fruit-bowl' } as Record<string, string>)[k] ?? k))
  // workstation.ts
  site('ws isDeskDef', (d) => !!d.surface && !d.prop && !d.mount && OLD.DESK_RE.test(T(d)) && !OLD.NOT_PC_DESK.test(T(d)), (d) => !!d.surface && !d.prop && !d.mount && has(d, 'desk'))
  site('ws SEAT_RE', (d) => OLD.SEAT_RE.test(T(d)), any('seat'))
  const seatOnly = (f: (d: D) => boolean) => (d: D) => OLD.SEAT_RE.test(T(d)) && f(d)
  site('ws 办公椅', seatOnly((d) => OLD.OFFICE_CHAIR_RE.test(T(d))), seatOnly(any('legacy-ws-office')))
  site('ws 电竞椅', seatOnly((d) => /电竞|gaming/.test(T(d))), seatOnly(any('gaming-chair')))
  site('ws laptop', F(OLD.LAPTOP_RE, (a) => !!a.prop && !a.stick && a.form !== 'closed' && !a.form?.includes('hanging') && !/stand|支架/.test(a.id)), N('laptop', (a) => !!a.prop && !a.stick && a.form !== 'closed' && !a.form?.includes('hanging')))
  site('ws laptop 在座', (d) => OLD.LAPTOP_RE.test(T(d)), any('laptop'))
  site('ws keyboard', (d) => OLD.KEYBOARD_RE.test(T(d)), any('keyboard'))
  site('ws clear laptop(id)', (d) => OLD.LAPTOP_RE.test(d.id), any('laptop'))
  site('ws clear keyboard(id)', (d) => OLD.KEYBOARD_RE.test(d.id), any('legacy-kb-id'))
  site('ws aio', (d) => /aio|一体机|retro-pc/.test(d.id), any('aio-pc'))
  site('ws duo', (d) => d.w >= 180 && /duo|双人/.test(T(d)), (d) => d.w >= 180 && has(d, 'duo-desk'))
  site('ws 儿童桌', (d) => /loft|阁楼|kid|儿童/.test(T(d)), any('loft', 'for-kids'))
  // checklist.ts
  const CL: [string, RegExp, string | string[], ((d: D) => boolean)?][] = [
    ['aircon', /aircon|空调/, 'aircon'],
    ['bed', /^bed-|kid-crib|kid-bed|futon|bd-bunk|bd-loft|床(?!头|尾|边)|被褥/, 'legacy-cl-bed'],
    ['closet', /wardrobe|衣柜|tansu|箪笥|dresser|斗柜|clothes-rail|挂衣/, ['wardrobe', 'dresser', 'clothes-rail']],
    ['lamp', /lamp|灯(?!泡)/, 'lamp'],
    ['sofa', /sofa|沙发/, 'sofa'],
    ['tv', /prop-tv|wall-tv|电视(?!柜)/, 'tv'],
    ['dining', /dining-table|tbl-dining|餐桌/, 'dining-table'],
    ['microwave', /microwave|微波炉|steam-oven|蒸烤箱/, 'microwave'],
    ['rice', /rice-cooker|电饭煲/, 'rice-cooker'],
    ['kettle', /kettle|electric-pot|水壶|电热水瓶/, 'electric-kettle'],
    ['shoeCab', /shoe-cabinet|鞋柜|鞋架|shoe-rack/, 'shoe-storage'],
    ['umbrella', /umbrella|伞架/, 'umbrella-stand'],
    ['shoes', /shoe(?!-cab|-rack)|鞋(?!柜|架)|sneaker|boots|靴/, 'shoe', (d) => !!d.prop],
    ['detergent', /detergent|洗衣液|洗衣粉/, 'detergent'],
    ['scale', /body-scale|fit-scale|^scale-|体重秤/, 'legacy-cl-scale'],
    ['softener', /soften|柔软/, 'softener'],
    ['towel', /towel|毛巾|浴巾/, 'towel'],
    ['dryer', /hair-dryer|吹风机/, 'hair-dryer'],
    ['toothbrush', /toothbrush|刷牙/, 'toothbrush'],
    ['shampoo', /shampoo|bottle-set|洗发|洗护三瓶/, 'shampoo'],
    ['bodySoap', /body-soap|body-wash|bottle-set|沐浴|洗护三瓶/, 'body-soap'],
    ['bathStool', /bath-stool|浴凳|风呂椅|風呂椅/, 'bath-stool'],
    ['bucket', /bucket|洗面桶|風呂桶/, 'bucket'],
    ['toiletPaper', /toilet-paper|卷纸|卷筒纸/, 'toilet-paper'],
    ['toiletBrush', /toilet-brush|马桶刷/, 'toilet-brush'],
    ['laundryStand', /laundry-stand|晾衣架/, 'laundry-stand'],
    ['desk', /desk|书桌|学习桌|写字台|电脑桌/, 'legacy-cl-desk', (d) => !d.prop && !!d.surface],
    ['crib', /kid-crib|婴儿床/, 'crib'],
    ['catTower', /cat-tower|猫爬架/, 'cat-tower'],
    ['litter', /litter|猫砂/, 'litter-box'],
    ['chair(餐)', /chair|椅|stool|凳|zabuton|坐垫|zaisu/, 'dining-seat', (d) => d.category === 'dining' || /餐|dining/.test(d.id + d.name)],
  ]
  for (const [k, re, t, f] of CL) site(`checklist ${k}`, C(re, f), NC(t, f))
  // checklist 补法
  const CF: [string, RegExp, string | string[], (d: D) => boolean][] = [
    ['台灯', /prop-table-lamp|prop-desk-lamp|台灯/, 'legacy-cl-lamp-fix', prop],
    ['鞋子', /sneaker|运动鞋|shoe/, 'legacy-cl-shoe-fix', prop],
    ['洗衣液', /detergent|洗衣液/, 'legacy-cl-detergent-fix', prop],
    ['毛巾', /towel|毛巾/, 'towel', prop],
    ['柔软剂', /soften|柔软/, 'softener', prop],
    ['牙刷杯', /toothbrush|刷牙/, 'toothbrush', prop],
    ['吹风机', /hair-dryer|吹风机/, 'hair-dryer', prop],
    ['浴凳', /bath-stool|浴凳|風呂椅|风呂椅/, 'bath-stool', (d) => !d.mount],
    ['洗面桶', /bucket|洗面桶|風呂桶/, 'bucket', (d) => !d.mount],
    ['卷纸', /toilet-paper|卷纸|卷筒纸/, 'toilet-paper', prop],
    ['马桶刷', /toilet-brush|马桶刷/, 'toilet-brush', (d) => !d.mount],
    ['猫砂', /litter|猫砂/, 'litter-box', (d) => !d.mount],
  ]
  for (const [k, re, t, f] of CF) site(`checklist 补 ${k}`, F(re, f), N(t, f))
  // homecams.ts
  site('cams 宠物区', (d) => d.category === 'pets' && !d.prop && !d.mount && !/^rb-|aquarium|水族/.test(d.id), (d) => d.category === 'pets' && !d.prop && !d.mount && !d.id.startsWith('rb-') && !has(d, 'aquarium'))
  site('cams 狗', (d) => d.category === 'pets' && !d.prop && !d.mount && /dog|狗/.test(T(d)), (d) => d.category === 'pets' && !d.prop && !d.mount && has(d, 'dog'))
  site('cams 猫', (d) => d.category === 'pets' && !d.prop && !d.mount && /cat|猫/.test(T(d)), (d) => d.category === 'pets' && !d.prop && !d.mount && has(d, 'cat'))
  site('cams 架子', (d) => !!d.surface && !d.prop && (!!d.surfaces?.length || /shelf|架|柜/.test(T(d))), (d) => !!d.surface && !d.prop && (!!d.surfaces?.length || has(d, 'cabinet')))
  // lights / house
  site('isLampAsset', (d) => !d.fixture && !OLD.NOT_LAMP.has(d.id) && (d.category === 'lighting' || OLD.LAMP_RE.test(d.name) || OLD.LAMP_RE.test(d.id)), any('light'))
  site('lights 餐桌', (d) => OLD.LIGHT_DINING_RE.test(d.id), any('legacy-light-dining'))
  site('isPlant', (d) => (d.category === 'plants' || (OLD.PLANT_RE.test(T(d)) && d.category !== 'lighting')) && !d.mount, any('plant'))
  // household.ts 兴趣
  for (const [it, m] of Object.entries(INTERESTS)) {
    const tg = `hobby:${it}`
    if (m.floor) site(`interestFloor ${it}`, (d) => !d.fixture && !d.prop && !d.mount && Math.max(d.w, d.d) <= 200 && (it === 'photo' || !CAMERA_CASE.test(d.id)) && m.floor!.test(T(d)), (d) => !d.fixture && !d.prop && !d.mount && !d.stick && Math.max(d.w, d.d) <= 200 && has(d, tg))
    if (m.props) site(`interestProps ${it}`, (d) => !!d.prop && !d.stick && !d.form?.includes('hanging') && m.props!.test(T(d)), (d) => !!d.prop && !d.stick && !d.form?.includes('hanging') && has(d, tg))
    if (m.props) site(`interestStickers ${it}`, (d) => !!d.stick && m.props!.test(T(d)), (d) => !!d.stick && has(d, tg))
    if (m.wall) site(`interestWall ${it}`, (d) => !!d.mount && m.wall!.test(T(d)), (d) => !!d.mount && has(d, tg))
  }
  const NEW_JOB_DESK: Record<string, string[]> = { programmer: ['monitor', 'keyboard', 'mouse'], designer: ['tablet', 'monitor', 'pen'], streamer: ['mic', 'webcam', 'monitor', 'stream-gear'], photographer: ['camera', 'lens', 'monitor'], musician: ['audio-gear', 'monitor'], student: ['laptop', 'book'], researcher: ['monitor', 'book', 'microscope'], engineer: ['electronics-tool', 'monitor'], schoolkid: ['book', 'pen', 'lamp'] }
  for (const [job, re] of Object.entries(JOB_DESK)) site(`jobDesk ${job}`, (d) => !!d.prop && d.form !== 'hanging' && re.test(T(d)), (d) => !!d.prop && d.form !== 'hanging' && any(...NEW_JOB_DESK[job])(d))

  // INTEREST_TIERS（按名字的几级；锚定 id 的不变）
  const tprop = (d: D) => !!d.prop && !d.stick && !d.form?.includes('hanging')
  const tier: [string, RegExp, string[], (d: D) => boolean][] = [
    ['gaming 1', /game-console|pad-|手柄/, ['gamepad'], tprop],
    ['gaming 4 展示柜', /展示柜|showcase/, ['legacy-showcase'], floor],
    ['music 1', /metronome|节拍|谱/, ['music-accessory'], tprop],
    ['music 2', /^(?!.*(piano|钢琴)).*(guitar|吉他|keyboard|电子琴|ukulele|尤克里里)/, ['legacy-music-t2'], floor],
    ['music 3 壁挂', /吉他|guitar/, ['guitar'], mount],
    ['music 4', /piano|钢琴|drum|鼓/, ['legacy-piano-drum'], floor],
    ['fitness 1', /dumbbell|哑铃|yoga|瑜伽/, ['legacy-fit-t1'], tprop],
    ['fitness 2', /yoga-mat|瑜伽垫|kettlebell|壶铃/, ['legacy-fit-t2'], floor],
    ['fitness 3', /treadmill|跑步机|bike|单车|bench|卧推|rack/, ['legacy-fit-t3'], floor],
    ['fitness 4', /power-rack|深蹲|rowing|划船/, ['legacy-fit-t4'], floor],
    ['reading 1', /book|书(?!架|柜|桌)/, ['book'], tprop],
    ['reading 2', /bookshelf|bookcase|书架|书柜/, ['bookshelf'], floor],
    ['reading 3 椅', /armchair|单人沙发|阅读椅|摇椅/, ['legacy-reading-chair'], floor],
    ['otaku 1', /漫画|manga|figure|手办|立牌/, ['manga', 'figure', 'acrylic-stand'], tprop],
    ['otaku 2', /gacha|扭蛋/, ['gacha'], tprop],
    ['otaku 3', /展示柜|showcase/, ['legacy-showcase'], floor],
    ['collecting 1', /col-|硬币|邮票|coin|stamp/, ['legacy-col-t1'], tprop],
    ['collecting 2', /col-|矿石|化石|mineral/, ['legacy-col-t2'], tprop],
    ['collecting 3', /陈列柜|博古架|curio/, ['curio-cabinet'], floor],
  ]
  for (const [k, re, t, f] of tier) site(`tier ${k}`, F(re, f), N(t, f))

  let bad = 0
  for (const [name, old, now] of SITES) {
    const lost = ASSETS.filter((d) => !d.fixture && old(d) && !now(d)).map((d) => d.id)
    const gain = ASSETS.filter((d) => !d.fixture && !old(d) && now(d)).map((d) => d.id)
    if (!lost.length && !gain.length) continue
    bad++
    console.log(`✗ ${name}${lost.length ? `\n    少了 ${lost.length}: ${lost.join(' ')}` : ''}${gain.length ? `\n    多了 ${gain.length}: ${gain.join(' ')}` : ''}`)
  }
  console.log(`\n${SITES.length} 个调用点，${bad} 个候选有差异`)
}

export { tags, OLD, ASSETS, T, R }
