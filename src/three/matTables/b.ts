// 材质标注 · 批次 B：assets.ts（不含 fx- 设备）和 packs/ 里的兴趣、收纳、世界风格、客厅、季节、湿区、变体 A、主机、家居小物、
// 创客、影音、桌面小物、椅子、浴室、房间、机器人、宠物、杂项、拼图、家电、壁架、摄像头、角色、秤、洗衣，以及画作类素材。
// 规则见 index.ts / mats.ts：按配色槽写，null = 交给推断（木色 / 白漆混用的槽留 null，木色自动出木纹、其余按涂装）。

import type { MatEntry } from './index'

const T: Record<string, MatEntry> = {
  // ---------- assets.ts ----------
  sofa2: ['fabric', 'fabric', 'fabric'],
  sofa3: ['fabric', 'fabric', 'fabric'],
  armchair: ['fabric', 'fabric', 'fabric'],
  'coffee-table': [null],
  'tv-board': [null],
  rug: ['pile', 'pile'],
  'rug-round': ['pile', 'pile', 'pile'],
  // 灯罩布面，灯杆铁
  'floor-lamp': { mats: ['fabric'], mat: 'metal' },
  // 满架的书
  bookshelf: { mats: [null], mat: 'paper' },
  monstera: ['ceramic'],
  beanbag: ['fabric'],
  'dining-table': [null],
  'dining-table-l': [null],
  'dining-chair': [null, 'fabric'],
  'bed-semi-single': ['bedding', 'bedding', 'wood'],
  'bed-single': ['bedding', 'bedding', 'wood'],
  'bed-semi-double': ['bedding', 'bedding', 'wood'],
  'bed-double': ['bedding', 'bedding', 'wood'],
  'bed-queen': ['bedding', 'bedding', 'wood'],
  nightstand: [null],
  wardrobe: [null, null],
  desk: [null, null],
  // 座面靠背软包，五星脚塑料
  'desk-chair': { mats: ['fabric'], mat: 'plastic' },
  dresser: [null, null],
  'stand-mirror': [null],
  // [被子, 天板木, 被子花纹 / 底垫]
  kotatsu: ['bedding', 'wood', 'bedding'],
  chabudai: { mats: ['wood'], mat: 'wood' },
  futon: ['bedding', 'bedding'],
  zabuton: ['fabric'],
  andon: ['paper'],
  bear: ['pile'],
  // 猫形抱枕
  'cat-loaf': ['pile', 'pile'],
  // 底板、平台铺毯，小屋布面
  'cat-tower': ['pile', 'fabric'],
  // 篮子塑料，里面的衣物布
  'laundry-basket': { mats: ['plastic'], mat: 'fabric' },
  // 桶陶瓷，伞面布
  'shoe-cabinet': [null],
  'umbrella-stand': { mats: ['ceramic'], mat: 'fabric' },
  planter: ['paint'],
  cactus: ['ceramic'],
  aircon: ['plastic'],
  'laundry-stand': ['metal'],

  // ---------- packs/actors-pack.ts ----------
  // 动物：毛色、肚皮、花纹都按长绒（皮毛），项圈布
  'act-cat': ['pile', 'pile', 'pile', 'pile'],
  'act-cat-long': ['pile', 'pile', 'pile', 'pile'],
  'act-kitten': ['pile', 'pile', 'pile', 'pile'],
  'act-shiba': ['pile', 'pile', 'fabric'],
  'act-poodle': ['pile', 'pile', 'fabric'],
  'act-dachshund': ['pile', 'pile', 'fabric'],
  'act-rabbit': ['pile', 'pile', 'pile', 'pile'],
  'act-rabbit-lop': ['pile', 'pile', 'pile', 'pile'],
  'act-vacuum': ['plastic', 'plastic', 'plastic'],
  // [机身, 层板, 木色层板 / 侧板, 点缀]
  'act-kachaka': ['plastic', null, null, null],
  'act-kachaka-2': ['plastic', null, null, null],
  'act-kachaka-3': ['plastic', null, null, null],

  // ---------- packs/appliances-pack.ts ----------
  'ap2-fridge-mini': ['plastic'],
  'ap2-fridge-2door': ['plastic'],
  'ap2-fridge-3door': ['plastic'],
  'ap2-fridge-retro': ['plastic'],
  'ap2-fridge-french': ['plastic'],
  'ap2-fridge-side': ['plastic'],
  'ap2-washer-mini': ['plastic'],
  'ap2-washer-compact': ['plastic'],
  'ap2-washer-top': ['plastic'],
  'ap2-washer-drum': ['plastic'],
  'ap2-washer-twin': ['plastic'],
  'ap2-washer-stack': ['plastic'],
  'ap2-washer-us': ['plastic'],
  'ap2-dryer': ['plastic'],
  'ap2-dryer-us': ['plastic'],
  'ap2-wine-cooler': ['plastic'],
  'ap2-wine-cooler-tall': ['plastic'],

  // ---------- packs/laundry.ts ----------
  // [架子, 夹子 / 晾着的小件 ×2]
  'laundry-pinch': ['plastic', 'plastic', 'plastic'],
  'laundry-pinch-hanging': ['plastic', 'fabric', 'fabric'],
  'laundry-pinch-full': ['plastic', 'fabric', 'fabric'],

  // ---------- packs/scales.ts ----------
  'scale-glass': ['plastic', 'plastic'],
  'scale-composition': ['plastic', 'plastic', 'plastic'],
  // 指针秤：烤漆铁皮外壳
  'scale-dial': ['paint', 'paint', 'paint'],
  'scale-round': ['plastic', 'plastic', 'plastic'],
  'scale-baby': ['plastic', 'plastic', 'plastic'],

  // ---------- packs/wall-shelves.ts ----------
  // [层板（木 / 白板）, 铁托架]
  'ws-kitchen-shelf-60': [null, 'metal'],
  'ws-kitchen-shelf2-60': [null, 'metal'],
  'ws-kitchen-shelf-90': [null, 'metal'],
  'ws-kitchen-shelf2-90': [null, 'metal'],
  'ws-kitchen-shelf-120': [null, 'metal'],
  'ws-kitchen-shelf2-120': [null, 'metal'],
  'ws-kitchen-rail-60': [null, 'metal'],
  'ws-kitchen-rail-90': [null, 'metal'],
  'ws-kitchen-cab-60': [null, null],
  'ws-kitchen-cab-90': [null, null],
  'ws-kitchen-cab-120': [null, null],
  'ws-toilet-shelf': [null, 'metal'],
  'ws-toilet-shelf-1': [null, 'metal'],
  'ws-toilet-cab': [null, null],

  // ---------- packs/cameras-home.ts ----------
  // 机身塑料；木色点缀的配色组按推断出木纹
  'hc-pet-dome': { mat: 'plastic' },
  'hc-pet-ears': { mat: 'plastic' },
  // 第三槽是零食颗粒
  'hc-pet-treat': { mats: ['plastic', 'plastic', 'paint'], mat: 'plastic' },
  'hc-pet-laser': { mat: 'plastic' },
  'hc-pet-screen': { mat: 'plastic' },
  'hc-sec-pt': { mat: 'plastic' },
  'hc-sec-cube': { mat: 'plastic' },
  'hc-sec-wall-dome': { mat: 'plastic' },
  'hc-sec-wall-bullet': { mat: 'plastic' },
  'hc-baby-cam': { mat: 'plastic' },
  'hc-baby-recv': { mat: 'plastic' },
  'hc-doorbell-video': { mat: 'plastic' },
  'hc-peephole': { mat: 'plastic' },
  'hc-action-kit': { mat: 'plastic' },

  // ---------- packs/robots.ts ----------
  'rb-drone-aerial': ['plastic', 'plastic', 'plastic'],
  'rb-drone-aerial-fold': ['plastic', 'plastic', 'plastic'],
  'rb-drone-mini': ['plastic', 'plastic', 'plastic'],
  'rb-drone-mini-fold': ['plastic', 'plastic', 'plastic'],
  'rb-drone-fpv': ['plastic', 'plastic', 'plastic'],
  'rb-drone-toy': ['plastic', 'plastic', 'plastic'],
  'rb-drone-selfie': ['plastic', 'plastic', 'plastic'],
  'rb-drone-case': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'rb-drone-case-closed': ['plastic', 'plastic', 'plastic'],
  'rb-drone-rc': ['plastic', 'plastic', 'plastic'],
  'rb-drone-charger': ['plastic', 'plastic', 'plastic'],
  // 尼龙停机坪垫
  'rb-drone-pad': ['fabric', 'fabric'],
  'rb-gimbal': ['plastic', 'plastic', 'plastic'],
  'rb-dog': ['plastic', 'plastic', 'plastic'],
  'rb-dog-rest': ['plastic', 'plastic', 'plastic'],
  'rb-dog-dock': ['plastic', 'plastic', 'plastic'],
  'rb-dog-mini': ['plastic', 'plastic', 'plastic'],
  // 毛绒外衣：[毛色, 浅色毛, 点缀, 眼屏]
  'rb-companion': ['pile', 'pile', null, 'plastic'],
  // [圆垫, 软靠背, 指示灯]
  'rb-companion-nest': ['fabric', 'fabric', 'plastic'],
  'rb-emo-bot': ['plastic', 'plastic', 'plastic'],
  'rb-catbot': ['plastic', 'plastic', 'plastic'],
  'rb-catbot-dock': ['plastic', 'plastic', 'plastic'],
  'rb-window-bot': ['plastic', 'plastic', 'plastic'],
  'rb-serve-bot': ['plastic', 'plastic', 'plastic'],
  'rb-serve-bot-dock': ['plastic', 'plastic', 'plastic'],
  'rb-helper': ['plastic', 'plastic', null, 'plastic'],
  'rb-butler': ['plastic', null, 'plastic'],
  'rb-humanoid': ['plastic', 'plastic', 'plastic', 'plastic'],
  'rb-humanoid-stand': ['plastic', 'plastic', 'plastic'],
  'rb-transform': ['plastic', 'plastic', 'plastic'],
  'rb-transform-car': ['plastic', 'plastic', 'plastic'],
  'rb-code-car': ['plastic', 'plastic', 'plastic'],
  // [臂身, 关节, 末端]
  'rb-arm': ['plastic', 'metal', 'metal'],
  // 铁皮玩具：亮面烤漆
  'rb-tin': ['plastic', 'plastic', 'plastic'],
  'rb-mecha': ['plastic', 'plastic', 'plastic'],

  // ---------- packs/puzzles.ts ----------
  'pz-cube-2': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-cube-2-scr': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-cube-3': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-cube-3-turn': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-cube-4': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-cube-4-scr': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-cube-5': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-pyraminx': { mats: ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'pz-megaminx': { mats: ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // 镜面魔方：电镀贴面
  'pz-mirror': ['metal'],
  'pz-cube-stand': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  // [亚克力展示架, 魔方各色 ×7]
  'pz-cube-shelf': ['glass', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  'pz-speed-timer': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'pz-luban': ['wood'],
  'pz-luban-apart': ['wood'],
  // [金属环, 柄]
  'pz-nine-rings': ['metal', null],
  // [木框, 棋子, 点缀漆]
  'pz-huarong': ['wood', null, 'paint'],
  'pz-tangram': ['wood', 'paint', 'paint'],
  'pz-hanoi': ['wood', 'paint'],
  'pz-spinner': ['plastic', 'metal'],
  'pz-squishy-bun': ['paint', 'paint'],
  'pz-squishy-cat': ['paint', 'paint'],
  'pz-tetris': ['plastic', 'plastic', 'plastic', 'plastic'],

  // ---------- packs/pet-habitats.ts ----------
  // 笼子：[底盘塑料, 铁丝, 点缀]
  'ph-hamster-cage-60': ['plastic', 'metal', 'plastic'],
  'ph-hamster-cage-45': ['plastic', 'metal', 'plastic'],
  'ph-hamster-acrylic': ['plastic', 'plastic', 'metal'],
  'ph-hamster-castle': ['plastic', 'metal', 'plastic'],
  // [透明球壳, 箍]
  'ph-hamster-orb': ['glass', 'plastic'],
  'ph-hamster-carrier': ['plastic', 'plastic'],
  // [底盘, 铁丝, 木层板]
  'ph-rabbit-cage': ['plastic', 'metal', null],
  // [底盘, 铁丝, 抓绒垫]
  'ph-guinea-pen': ['plastic', 'metal', 'fabric'],
  // [框, 铁丝, 层板]
  'ph-chinchilla-cage': ['metal', 'metal', null],
  'ph-birdcage-dome': ['plastic', 'metal', 'plastic'],
  'ph-birdcage-dome-hanging': ['plastic', 'metal', 'plastic'],
  'ph-birdcage-stand': ['metal', 'metal', 'plastic'],
  'ph-birdcage-square': ['plastic', 'metal', 'plastic'],
  'ph-birdcage-square-stand': ['plastic', 'metal', 'plastic'],
  // [竹, 木, 点缀布]
  'ph-birdcage-bamboo': ['wood', 'wood', 'fabric'],
  'ph-birdcage-bamboo-hanging': ['wood', 'wood', 'fabric'],
  // [底座, 栖木, 点缀]
  'ph-bird-perch': [null, 'wood', 'plastic'],
  // [框, 软木背景, 灯罩]
  'ph-terrarium': ['metal', 'wood', 'metal'],
  // [缸沿, 石头, 灯]
  'ph-turtle-tank': ['plastic', 'stone', 'metal'],
  // [底座, 砂石, 点缀]
  'ph-goldfish-bowl': [null, 'stone', null],
  // [釉面钵, 内里泥土, 睡莲花]
  'ph-medaka-bowl': ['ceramic', 'stone', 'plant'],
  // [铁丝, 底盘, 垫子]
  'ph-dog-crate-s': ['metal', 'plastic', 'fabric'],
  'ph-dog-crate-m': ['metal', 'plastic', 'fabric'],
  // [框, 围栏条, 狗窝]
  'ph-dog-pen': [null, null, 'fabric'],
  // [布面, 包边, 网纱]
  'ph-cat-carrier': ['fabric', 'fabric', 'fabric'],
  'ph-pet-fountain': ['plastic', null, 'plastic'],

  // ---------- packs/bath-extra.ts ----------
  // 浴缸盖：[板面, 包边] 都是塑料
  'bx-lid-roll-110x60': ['plastic', 'plastic'],
  'bx-lid-panel-110x60': ['plastic', 'plastic'],
  'bx-lid-roll-110x70': ['plastic', 'plastic'],
  'bx-lid-panel-110x70': ['plastic', 'plastic'],
  'bx-lid-roll-120x60': ['plastic', 'plastic'],
  'bx-lid-panel-120x60': ['plastic', 'plastic'],
  'bx-lid-roll-120x70': ['plastic', 'plastic'],
  'bx-lid-panel-120x70': ['plastic', 'plastic'],
  'bx-lid-roll-130x60': ['plastic', 'plastic'],
  'bx-lid-panel-130x60': ['plastic', 'plastic'],
  'bx-lid-roll-130x70': ['plastic', 'plastic'],
  'bx-lid-panel-130x70': ['plastic', 'plastic'],
  'bx-lid-roll-140x60': ['plastic', 'plastic'],
  'bx-lid-panel-140x60': ['plastic', 'plastic'],
  'bx-lid-roll-140x70': ['plastic', 'plastic'],
  'bx-lid-panel-140x70': ['plastic', 'plastic'],
  'bx-lid-roll-150x60': ['plastic', 'plastic'],
  'bx-lid-panel-150x60': ['plastic', 'plastic'],
  'bx-lid-roll-150x70': ['plastic', 'plastic'],
  'bx-lid-panel-150x70': ['plastic', 'plastic'],
  'bx-lid-roll-160x60': ['plastic', 'plastic'],
  'bx-lid-panel-160x60': ['plastic', 'plastic'],
  'bx-lid-roll-160x70': ['plastic', 'plastic'],
  'bx-lid-panel-160x70': ['plastic', 'plastic'],
  'bx-lid-roll-170x60': ['plastic', 'plastic'],
  'bx-lid-panel-170x60': ['plastic', 'plastic'],
  'bx-lid-roll-170x70': ['plastic', 'plastic'],
  'bx-lid-panel-170x70': ['plastic', 'plastic'],
  'bx-lid-roll-180x60': ['plastic', 'plastic'],
  'bx-lid-panel-180x60': ['plastic', 'plastic'],
  'bx-lid-roll-180x70': ['plastic', 'plastic'],
  'bx-lid-panel-180x70': ['plastic', 'plastic'],
  'bx-lid-zigzag': ['plastic', 'plastic'],
  'bx-lid-rolled-60': ['plastic', 'plastic'],
  // 硅藻土地垫：按石材
  'bx-mat-diatom-fold': ['stone', 'stone', null],
  'bx-mat-diatom-dots': ['stone', 'stone'],
  'bx-mat-chenille': ['pile', 'pile'],
  'bx-mat-towel': ['fabric', 'fabric', 'fabric'],
  'bx-mat-slat': ['wood', 'wood'],
  // [挂钩, 底座]
  'bx-towel-hook': ['metal', null],
  'bx-towel-hook-3': ['metal', null],
  'bx-towel-ring': ['metal', null],
  'bx-towel-bar-bath': ['metal', null],
  'bx-face-towel-folded': ['fabric', 'fabric'],
  'bx-face-towel-hanging': ['fabric', 'fabric'],
  'bx-shower-set': ['metal', null, null],

  // ---------- packs/chairs-more.ts ----------
  // [软垫, 铁架]
  'c2-fold-pad': ['fabric', 'metal'],
  'c2-fold-pad-closed': ['fabric', 'metal'],
  'c2-xslat': [null, null],
  'c2-xslat-closed': [null, null],
  // [帆布, 框]
  'c2-director-tall': ['fabric', null],
  'c2-director-tall-closed': ['fabric', null],
  // [布面, 铝架, 绑带]
  'c2-moon': ['fabric', 'metal', 'fabric'],
  'c2-camp-arm': ['fabric', 'metal', 'fabric'],
  'c2-camp-arm-closed': ['fabric', 'metal', 'fabric'],
  'c2-fold-high-stool': [null, 'metal'],
  'c2-fold-high-stool-closed': [null, 'metal'],
  // [布面, 底座]
  'c2-zaisu-fold': ['fabric', null],
  'c2-zaisu-fold-folded': ['fabric', null],
  'c2-bench-90': ['wood', null],
  'c2-bench-135': ['wood', null],
  'c2-frame-stool': [null, null],
  'c2-iron-stool-45': [null, 'metal'],
  'c2-iron-stool-65': [null, 'metal'],
  'c2-iron-stool-75': [null, 'metal'],
  'c2-wood-bar-65': [null, 'fabric'],
  'c2-wood-bar-75': [null, 'fabric'],
  // [踏板, 架]
  'c2-step-fold': [null, 'metal'],
  'c2-step-fold-closed': [null, 'metal'],
  'c2-low-stool': ['wood', null],
  'c2-kid-stool': ['plastic', 'plastic'],
  'c2-stack-stool': ['plastic', 'plastic'],
  'c2-stack-stool-5': ['plastic', 'plastic'],
  // [皮垫, 木身]
  'c2-piano-bench': ['leather', null],
  // [软垫, 金色凳脚]
  'c2-vanity-stool': ['fabric', 'metal'],
  'c2-shoe-bench-60': ['fabric', null],
  'c2-shoe-bench-90': ['fabric', null],
  // [座垫, 网面, 框架]
  'c2-ergo': ['fabric', 'fabric', 'plastic'],
  'c2-ergo-foot': ['fabric', 'fabric', 'plastic'],
  'c2-mesh-simple': ['fabric', 'fabric', 'plastic'],
  'c2-kneel-rock': ['fabric', null],
  'c2-saddle': ['leather', 'metal'],
  'c2-ball-stool': ['plastic', 'metal'],
  'c2-bean-lounger': ['fabric', 'fabric'],
  // [曲木, 藤编座面]
  'c2-bentwood': [null, null],
  // [木框, 草编座面]
  'c2-ladder-back': [null, null],

  // ---------- packs/chairs.ts ----------
  // [木, 坐垫, 点缀]
  'ch-windsor': [null, 'fabric', null],
  // [木, 纸绳编座面]
  'ch-wishbone': [null, 'fabric'],
  // [塑料壳, 木腿, 金属]
  'ch-shell-wood': ['plastic', null, 'metal'],
  'ch-shell-eiffel': ['plastic', null, 'metal'],
  'ch-plywood': ['wood'],
  'ch-tolix': ['metal'],
  'ch-panton': ['plastic'],
  'ch-quanyi': ['wood', 'fabric'],
  // [藤编, 木框, 钢管]
  'ch-cesca': ['wood', null, 'metal'],
  'ch-upholstered': ['fabric', null, null],
  'ch-bar-back-75': ['fabric', null, null],
  'ch-bar-back-65': ['fabric', null, null],
  'ch-fold-metal': ['plastic', 'metal'],
  'ch-fold-metal-closed': ['plastic', 'metal'],
  'ch-fold-wood': [null, null],
  'ch-fold-wood-closed': [null, null],
  // [座布, 网面, 框]
  'ch-mesh-office': ['fabric', 'fabric', 'plastic'],
  // 电竞椅：PU 皮面 + 布枕
  'ch-gaming': ['leather', 'leather', 'fabric'],
  'ch-task': ['fabric', 'plastic'],
  'ch-drafting': ['fabric', 'plastic'],
  'ch-kneeling': ['fabric', null],
  'ch-ball-seat': ['plastic', null],
  // [布, 抱枕, 木腿]
  'ch-chaise': ['fabric', 'fabric', null],
  // [壳, 垫, 底座]
  'ch-egg': ['plastic', 'fabric', 'metal'],
  'ch-ball': ['plastic', 'fabric', 'metal'],
  'ch-butterfly': ['leather', 'metal'],
  'ch-barcelona': ['leather', 'metal'],
  // [皮, 胶合板, 底座]
  'ch-lounge': ['leather', 'wood', 'metal'],
  'ch-lounge-ottoman': ['leather', 'wood', 'metal'],
  'ch-zaisu-high': ['fabric', null],
  'ch-seiza': ['wood', 'fabric'],
  'ch-plank-stool': [null, null],
  'ch-square-stool': [null, null],
  'ch-step-stool': [null, null],
  'ch-stool-60': [null, null],
  // 蘑菇凳：彩漆
  'ch-mushroom': ['paint', 'paint', 'paint'],
  // [人造革座面, 镀铬架]
  'ch-swivel-bar-high': ['leather', 'metal'],
  'ch-swivel-bar-mid': ['leather', 'metal'],
  'ch-mazha': ['fabric', null],
  'ch-mazha-closed': ['fabric', null],
  'ch-bath-stool': ['plastic'],
  'ch-high-chair': [null, 'fabric'],
  // [彩漆靠背, 彩漆点缀, 木]
  'ch-animal-bear': ['paint', 'paint', null],
  'ch-animal-bunny': ['paint', 'paint', null],
  'ch-animal-cat': ['paint', 'paint', null],
  'ch-deck': ['fabric', null],
  'ch-swing': ['fabric', null, 'metal'],
  'ch-bistro': [null, 'metal'],
  'ch-director': ['fabric', null],

  // ---------- packs/av.ts ----------
  // 投影仪：机身塑料，第三槽银色镜头圈按固定色推断出金属
  'av-projector': { mats: ['plastic', 'plastic', null], mat: 'plastic' },
  'av-projector-on': { mats: ['plastic', 'plastic', null], mat: 'plastic' },
  'av-projector-cube': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-projector-cube-on': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-projector-can': { mats: ['plastic', 'plastic', null], mat: 'plastic' },
  'av-projector-can-on': { mats: ['plastic', 'plastic', null], mat: 'plastic' },
  'av-projector-ust': { mats: ['plastic', 'plastic', null], mat: 'plastic' },
  'av-projector-ust-on': { mats: ['plastic', 'plastic', null], mat: 'plastic' },
  // [烤漆机身, 金属件, 片盘]
  'av-film-projector': { mats: ['paint', 'metal', 'metal'], mat: 'metal' },
  'av-film-projector-on': { mats: ['paint', 'metal', 'metal'], mat: 'metal' },
  // 幕布：画面布面（不属于配色槽），机身 / 架子按槽
  'av-screen-tripod': { mats: ['metal', 'plastic', 'plastic'], mat: 'fabric' },
  'av-screen-tripod-closed': { mats: ['metal', 'plastic', 'plastic'], mat: 'fabric' },
  'av-screen-pull': { mats: ['plastic', 'plastic', 'plastic'], mat: 'fabric' },
  'av-screen-pull-closed': { mats: ['plastic', 'plastic', 'plastic'], mat: 'fabric' },
  'av-screen-electric': { mats: ['plastic', 'plastic', 'plastic'], mat: 'fabric' },
  'av-screen-electric-closed': { mats: ['plastic', 'plastic', 'plastic'], mat: 'fabric' },
  // [铝框, 绒边, 脚]
  'av-screen-frame': { mats: ['metal', 'fabric', 'metal'], mat: 'fabric' },
  // [金属杆, 托板, 脚]
  'av-stand-tripod': ['metal', null, 'plastic'],
  'av-stand-arm': ['metal', null, null],
  // 音响器材：[拉丝金属机身, 面板, 显示屏]
  'av-cd-player': { mats: ['metal', 'metal', 'plastic'], mat: 'plastic' },
  'av-cd-player-open': { mats: ['metal', 'metal', 'plastic'], mat: 'plastic' },
  'av-boombox': { mats: ['plastic', 'metal', 'plastic'], mat: 'plastic' },
  'av-discman': ['plastic', 'plastic', 'plastic'],
  // [机身, 仓门, 耳机海绵]
  'av-walkman': { mats: ['metal', 'plastic', 'fabric'], mat: 'plastic' },
  'av-mini-compo': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-bd-player': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-cassette-deck': { mats: ['metal', 'metal', 'plastic'], mat: 'plastic' },
  'av-receiver': { mats: ['metal', 'metal', 'plastic'], mat: 'plastic' },
  // [木箱, 金属面板, 变压器]
  'av-tube-amp': [null, 'metal', 'metal'],
  'av-headphone-amp': ['metal', 'metal', 'metal'],
  // [机身, 网布, 灯]
  'av-soundbar': ['plastic', 'fabric', 'plastic'],
  // 家庭影院音箱：[箱体（胡桃 / 橡木出木纹）, 振膜, 金属圈]
  'av-ht-front': { mats: [null, 'plastic', 'metal'], mat: 'plastic' },
  'av-ht-center': { mats: [null, 'plastic', 'metal'], mat: 'plastic' },
  'av-ht-surround': { mats: [null, 'plastic', 'metal'], mat: 'plastic' },
  'av-ht-sub': { mats: [null, 'fabric', 'metal'], mat: 'plastic' },
  // [木箱, 面板, 振膜]
  'av-hifi-tower': ['wood', 'paint', 'plastic'],
  'av-hifi-tower-l': ['wood', 'paint', 'plastic'],
  // [网布, 顶盖, 点缀]
  'av-bt-cylinder': ['fabric', 'plastic', null],
  'av-bt-retro': ['leather', 'metal', 'leather'],
  'av-bt-ball': ['plastic', 'plastic', 'plastic'],
  // 一排光盘 / 录像带：塑料盒
  'av-cd-row': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-cd-tower': [null, null, null],
  'av-cd-rack-desk': [null, null],
  'av-bd-row': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-vhs-row': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'av-cassette-box': { mats: [null, 'plastic', 'plastic'], mat: 'plastic' },
  // [片盒, 片盘, 胶片]
  'av-film-reels': ['metal', 'metal', 'plastic'],
  'av-clapper': ['paint', 'paint', 'paint'],
  'av-poster': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'av-poster-space': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'av-poster-retro': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'av-ticket-stubs': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [红漆, 奶油漆, 金色金属]
  'av-popcorn-cart': ['paint', 'paint', 'metal'],
  'av-popcorn-machine': ['paint', 'paint', 'metal'],
  // [纸桶, 条纹, 爆米花]
  'av-popcorn-bucket': ['paper', 'paper', 'paint'],
  'av-theater-curtain': ['fabric', 'fabric', 'fabric'],
  // [皮面, 扶手, 杯托]
  'av-theater-sofa': ['leather', 'leather', 'metal'],
  'av-theater-sofa-2': ['leather', 'leather', 'metal'],

  // ---------- packs/props-desk.ts ----------
  // [铝机身, 键盘, 点缀]
  'prop-laptop': ['metal', 'plastic', 'plastic'],
  // [边框, 支架（木色出木纹）, 点缀]
  'prop-monitor': ['plastic', null, 'plastic'],
  'prop-monitor-27': ['plastic', null, 'plastic'],
  'prop-monitor-dual': ['plastic', null, 'plastic'],
  'prop-keyboard-mouse': ['plastic', 'plastic', 'plastic'],
  'prop-tv-43': ['plastic', null, 'plastic'],
  'prop-tv-55': ['plastic', null, 'plastic'],
  'prop-game-console': ['plastic', 'plastic', 'plastic'],
  'prop-tablet-stand': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'prop-phone-stand': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'prop-desk-speakers': { mats: [null, 'plastic', 'plastic'], mat: 'plastic' },
  // [架子, 头梁, 耳罩]
  'prop-headphone-stand': { mats: [null, 'leather', 'leather'], mat: 'plastic' },
  'prop-digital-clock': { mats: [null, 'plastic'], mat: 'plastic' },
  'prop-digital-frame': { mats: [null, null, 'plastic'], mat: 'plastic' },
  'prop-crt-tv': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [胶木机身, 喇叭布, 旋钮]
  'prop-radio': ['plastic', 'fabric', 'plastic'],
  // [机座, 唱盘, 唱片标签]
  'prop-turntable': [null, 'metal', 'paper'],
  'prop-rotary-phone': ['plastic', 'plastic', 'plastic'],
  // [烤漆机身, 键帽, 点缀]
  'prop-typewriter': ['plastic', 'plastic', 'plastic'],
  'prop-book-stack': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'prop-books-upright': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'prop-book-open': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [陶瓷笔筒, 笔 ×2]
  'prop-pen-cup': { mats: ['ceramic', 'plastic', 'plastic'], mat: 'plastic' },
  'prop-sticky-notes': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'prop-file-sorter': [null, 'paper', 'paper'],
  'prop-stapler': ['plastic', 'plastic'],
  'prop-tape-dispenser': ['plastic', 'plastic'],
  'prop-desk-calendar': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [木框, 黑板面, 粉笔]
  'prop-mini-blackboard': ['wood', 'paint', 'paint'],
  'prop-rubiks-cube': ['plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic', 'plastic'],
  // [海, 陆, 金属支架]
  'prop-globe': ['plastic', 'plastic', 'metal'],
  // [木架, 沙]
  'prop-hourglass': ['wood', 'stone'],
  // [机身, 铃, 指针]
  'prop-alarm-clock': ['plastic', 'metal', 'metal'],
  // 盆栽：[盆, 叶, 花 / 尖]
  'prop-succulent': ['ceramic', 'plant', 'plant'],
  'prop-air-plant': ['ceramic', 'plant', 'plant'],
  'prop-mini-cactus': ['ceramic', 'plant'],
  'prop-bonsai': ['ceramic', 'plant', 'wood'],
  'prop-desk-lamp': ['paint', null],
  // [灯罩, 陶瓷灯座, 边]
  'prop-table-lamp': ['fabric', 'ceramic', null],
  'prop-lamp-edison': [null, 'metal'],
  'prop-lamp-mushroom': ['plastic', 'plastic'],
  'prop-lamp-washi': ['paper', 'wood'],
  'prop-lamp-globe': ['frosted', null, 'metal'],
  // [蜡, 托盘]
  'prop-candles': ['paint', 'ceramic'],
  'prop-aroma-diffuser': ['ceramic', null, 'plastic'],
  'prop-mini-humidifier': ['plastic', 'plastic', 'plastic'],
  'prop-desk-fan': ['plastic', 'plastic', 'plastic'],
  // [框, 照片, 画面]
  'prop-photo-frame': [null, 'paper', 'paper'],
  'prop-photo-frame-wide': [null, 'paper', 'paper'],
  'prop-anime-figure': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'prop-gacha': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [陶瓷猫, 项圈, 金币]
  'prop-maneki-neko': ['ceramic', 'fabric', 'metal'],
  // 纸糊达摩：[红身, 脸, 金色]
  'prop-daruma': ['paper', 'paper', 'paint'],
  'prop-incense': ['ceramic', 'paint'],

  // ---------- packs/props-home.ts ----------
  'prop-mug': ['ceramic', 'ceramic', 'ceramic'],
  'prop-mug-l': ['ceramic', 'ceramic', 'ceramic'],
  // [茶壶茶杯, 木托盘, 点缀]
  'prop-tea-set': ['ceramic', null, 'ceramic'],
  'prop-coffee-cup': ['ceramic', 'ceramic', 'ceramic'],
  // [玻璃壶, 盖, 点缀]
  'prop-glass-pitcher': ['glass', null, null],
  // [酒壶酒杯, 色带, 托盘]
  'prop-sake-set': ['ceramic', 'ceramic', null],
  // [苏打（杯里）, 冰淇淋, 樱桃]
  'prop-cream-soda': ['glass', 'paint', 'paint'],
  // [花瓶, 花瓣, 花心]
  'prop-vase-flowers': ['ceramic', 'plant', 'plant'],
  // [竹筐, 筐沿, 叶]
  'prop-mikan-basket': ['wood', 'wood', 'plant'],
  'prop-fruit-bowl': ['ceramic', 'ceramic', 'ceramic'],
  'prop-key-tray': ['ceramic', null, null],
  'prop-tissue-box': ['paper', 'paper'],
  // [餐垫, 盘, 点缀]
  'prop-plate-set': ['fabric', 'ceramic', 'ceramic'],
  // [饭碗, 漆木汤碗, 筷托]
  'prop-rice-miso': ['ceramic', 'paint', 'ceramic'],
  'prop-bento': ['plastic', 'plastic'],
  'prop-cake': ['paint', 'paint', 'paint'],
  // [奶油, 夹心, 盘]
  'prop-cake-slice': ['paint', 'paint', 'ceramic'],
  // [盘, 糖霜 ×2]
  'prop-donut-plate': ['ceramic', 'paint', 'paint'],
  'prop-onigiri': ['ceramic', null, null],
  'prop-sushi': ['wood', 'wood'],
  // [碗, 碗沿花纹, 筷子]
  'prop-ramen': ['ceramic', 'ceramic', 'wood'],
  'prop-pudding': ['ceramic', 'paint', 'paint'],
  'prop-kettle': ['plastic', 'plastic', 'plastic'],
  // 珐琅壶：[珐琅身, 木把手, 色带]
  'prop-enamel-kettle': ['ceramic', 'wood', 'ceramic'],
  'prop-tetsubin': { mats: ['metal', 'metal', 'metal'], mat: 'metal' },
  'prop-moka-pot': ['metal', 'plastic'],
  'prop-pour-over': ['wood', 'ceramic'],
  'prop-coffee-maker': ['plastic', 'plastic', 'plastic'],
  // [金属机身, 黑色件, 木把手]
  'prop-espresso': ['metal', 'plastic', null],
  'prop-rice-cooker': ['plastic', 'plastic', 'plastic'],
  'prop-rice-cooker-s': ['plastic', 'plastic', 'plastic'],
  'prop-toaster': ['plastic', 'plastic', 'plastic'],
  'prop-microwave': ['plastic', 'plastic', 'plastic'],
  // [架子, 瓶盖, 标签]
  'prop-spice-rack': [null, 'plastic', 'paper'],
  // [砧板, 刀柄]
  'prop-cutting-board': [null, 'plastic'],
  'prop-frying-pan': ['metal', null],
  'prop-frying-pan-s': ['metal', null],
  // 珐琅锅：[锅身, 把手, 色带]
  'prop-pot': ['ceramic', null, 'ceramic'],
  'prop-pot-s': ['ceramic', null, 'ceramic'],
  'prop-donabe': ['ceramic', 'ceramic', 'ceramic'],
  // 昭和保温壶：亮面烤漆
  'prop-showa-thermos': ['plastic', 'plastic', 'plastic'],
  // [盖, 瓷瓶, 盖]
  'prop-condiments': ['plastic', 'ceramic', 'plastic'],
  'prop-makeup-mirror': ['plastic', 'plastic', 'plastic'],
  // [瓶身, 盖, 标签]
  'prop-perfume': ['glass', 'metal', 'paper'],
  'prop-toothbrush-cup': ['plastic', 'plastic', 'plastic'],
  'prop-hand-soap': ['plastic', 'plastic', 'paper'],
  // [藤筐, 毛巾 ×2]
  'prop-towel-roll': ['wood', 'fabric', 'fabric'],
  'prop-cosmetic-box': ['plastic', 'plastic', 'plastic'],
  // [管, 膏体, 金属圈]
  'prop-lipstick': ['plastic', 'paint', 'metal'],
  'prop-lotion': ['plastic', 'plastic', 'plastic'],
  // [梳子, 发圈]
  'prop-comb': ['plastic', 'fabric'],
  'prop-hair-dryer': ['plastic', 'plastic', 'plastic'],
  'prop-rubber-duck': ['plastic', 'plastic', 'plastic'],
  // 木积木：木色出木纹，彩色按涂装
  'prop-blocks': [null, null, null],
  'prop-toy-car': ['plastic', 'plastic', 'plastic'],
  'prop-bunny-plush': ['pile', 'pile', 'fabric'],

  // ---------- packs/consoles-life.ts ----------
  // 主机、手柄、掌机：整件塑料（屏幕、按键等固定色零件也按塑料）
  'cl-ps5-standing': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-ps5-lying': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-ps4': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-ps2-lying': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-ps2-standing': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-ps1': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-xsx-standing': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-xsx-lying': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-xss-standing': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-xss-lying': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-xone': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-x360': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-switch-dock': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-wii': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-gamecube': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-n64': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-famicom': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-sfc': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-megadrive': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-mini-arcade': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-ps5': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-ps1': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-fc': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-sfc': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-n64': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-gc': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-md': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-pad-wii': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-3ds-open': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-3ds-closed': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-dslite': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-gbasp-open': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-gbasp-closed': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-psp': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-vita': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-gba': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-steamdeck': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-switch-lite': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-switch-oled': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [壳（镀铬）, 饰条, 点缀]
  'cl-ps3': { mats: ['plastic', null, 'plastic'], mat: 'plastic' },
  // [透明壳, 按键, 屏框, 屏]
  'cl-gbc': { mats: [null, 'plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'cl-gbpocket': { mats: ['plastic', 'plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // 水培：[玻璃杯, 根茎, 叶]
  'cl-garlic-sprout': ['glass', 'paint', 'plant'],
  'cl-negi-regrow': ['glass', 'plant', 'plant'],
  // [盒, 海绵, 苗]
  'cl-sprout-box': ['plastic', 'fabric', 'plant'],
  'cl-avocado-pit': ['glass', 'paint', 'plant'],
  // [陶盆, 盆沿, 叶]
  'cl-herb-basil': ['ceramic', 'ceramic', 'plant'],
  'cl-herb-mint': ['ceramic', 'ceramic', 'plant'],
  'cl-herb-rosemary': ['ceramic', 'ceramic', 'plant'],
  'cl-mini-tomato': ['ceramic', 'paint', 'plant'],
  'cl-sweet-potato': ['glass', 'paint', 'plant'],
  'cl-ginger-sprout': ['ceramic', 'paint', 'plant'],
  // [木架, 保鲜袋（半透明）, 封口条]
  'cl-bag-dryer': ['wood', null, 'plastic'],
  // [饮料, 标签, 瓶盖]
  'cl-half-drink': [null, 'plastic', 'plastic'],
  'cl-peeled-mikan': ['paint', 'paint', 'paint'],
  'cl-piggy-bank': ['ceramic', 'ceramic', 'metal'],
  // [玻璃罐, 盖, 硬币]
  'cl-coin-jar': ['glass', null, 'metal'],
  'cl-journal-tape': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [纸信封, 胶带, 面单]
  'cl-parcel': { mats: ['paper', 'plastic', 'paper'], mat: 'paper' },
  // [塑料袋, 餐盒, 食物]
  'cl-takeout-bag': ['plastic', 'plastic', 'paint'],
  // [饮料, 海苔, 包装条]
  'cl-konbini-set': [null, 'paper', 'plastic'],
  'cl-cup-noodle': ['paper', 'paper', 'paper'],

  // ---------- packs/maker.ts ----------
  // 电路板、元件、模块：整件塑料（FR4 板、塑封件）
  'mk-arduino': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-raspi': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-esp32': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-bluepill': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-breadboard-full': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-breadboard-half': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-pcb-stack': { mats: ['plastic', 'plastic'], mat: 'plastic' },
  'mk-smd-reels': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [扣, 半透明盒盖]
  'mk-parts-box': { mats: ['plastic', null], mat: 'plastic' },
  'mk-dupont-lying': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-dupont-hanging': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-servo-set': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-robot-car': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-led-strip': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-battery-box': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-18650': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-oled': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [主机, 烙铁架, 指示灯]
  'mk-solder-station': { mats: ['plastic', 'metal', 'plastic'], mat: 'plastic' },
  'mk-hot-air': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [铝筒, 按钮, 握把]
  'mk-desolder-pump': ['metal', 'plastic', 'plastic'],
  // [架, 卷盘, 标签]；焊锡丝本身金属
  'mk-solder-spool': { mats: ['metal', 'plastic', 'paper'], mat: 'metal' },
  // [铁罐, 笔, 标签]
  'mk-flux': ['metal', 'plastic', 'paper'],
  'mk-helping-hands': { mats: ['metal', 'metal', 'metal'], mat: 'metal' },
  'mk-multimeter': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-oscilloscope': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [金属机壳, 面板, 旋钮]
  'mk-bench-psu': { mats: ['metal', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-sig-gen': { mats: ['metal', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-logic-analyzer': { mats: ['metal', 'paper'], mat: 'plastic' },
  'mk-usb-microscope': { mats: ['metal', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-glue-gun': { mats: ['plastic', 'plastic'], mat: 'plastic' },
  'mk-e-screwdriver': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'mk-rotary-tool': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [握把, 钳口]
  'mk-stripper-lying': { mats: ['plastic', 'metal'], mat: 'metal' },
  'mk-stripper-hanging': { mats: ['plastic', 'metal'], mat: 'metal' },
  // [腕带, 线, 夹子]
  'mk-esd-strap': ['fabric', 'plastic', 'metal'],
  'mk-esd-mat': ['plastic'],
  'mk-mag-lamp': ['metal', 'plastic', 'plastic'],
  'mk-bench-vise': { mats: ['metal', 'metal'], mat: 'metal' },
  'mk-drill-set': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [机身, 点缀, 砂轮片]
  'mk-angle-grinder': { mats: ['plastic', 'plastic', 'stone'], mat: 'plastic' },
  // [机身, 点缀, 木板]
  'mk-jigsaw': ['plastic', 'plastic', 'wood'],
  'mk-table-saw': { mats: ['plastic', 'metal'], mat: 'metal' },
  'mk-drill-press': { mats: ['metal', 'metal'], mat: 'metal' },
  // [烤漆机箱, 有色亚克力盖, 激光头]
  'mk-laser-cutter': ['paint', null, 'metal'],
  // [铝型材, 底板, 主轴]
  'mk-cnc': ['metal', 'plastic', 'metal'],
  // [框, 半透明抽屉, 拉手]
  'mk-drawers-desk': { mats: ['plastic', null, 'plastic'], mat: 'plastic' },
  'mk-drawers-floor': { mats: ['plastic', null, 'plastic'], mat: 'plastic' },
  // [烤漆柜体, 拉手, 抽屉垫]
  'mk-tool-chest': ['plastic', 'metal', 'plastic'],
  // [台面, 铁架, 洞洞板]
  'mk-workbench': ['wood', 'metal', null],
  'mk-workbench-peg': ['wood', 'metal', null],
  'mk-sawhorse': ['wood', null],
  // [松木, 杉木, 捆带]
  'mk-lumber': ['wood', 'wood', 'plastic'],
  // [盒, 半透明格盖]；里面的螺丝金属
  'mk-screw-sorter': { mats: ['plastic', null], mat: 'metal' },
  // [砂纸 ×2, 打磨块]
  'mk-sandpaper': ['paper', 'paper', null],
  'mk-teardown': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [夹具, 电路板, 点缀]
  'mk-wip-solder': { mats: ['metal', 'plastic', 'plastic'], mat: 'plastic' },

  // ---------- packs/more-variety.ts ----------
  // 伞架：后面的槽是插着的伞面（布）
  'mv-umb-ceramic': ['ceramic', 'ceramic', 'fabric', 'fabric'],
  'mv-umb-mesh': ['metal', null, 'fabric'],
  'mv-umb-slat': ['wood', 'metal', 'fabric', 'fabric'],
  'mv-umb-magnet': ['metal', 'metal', 'fabric'],
  // [架, 布筒, 接水盘, 伞 ×2]
  'mv-umb-fold': [null, 'fabric', 'metal', 'fabric', 'fabric'],
  'mv-umb-bamboo': ['wood', null, 'fabric', 'fabric'],
  'mv-umb-castiron': ['metal', 'metal', 'fabric', 'fabric'],
  // [筒, 侧袋, 伞 ×3]
  'mv-umb-with': ['ceramic', 'fabric', 'fabric', 'fabric', 'fabric'],
  'mv-umb-pole': ['metal', null, 'fabric', 'fabric'],
  'mv-bean-drop': ['fabric', 'fabric'],
  'mv-bean-sunk': ['fabric', 'fabric'],
  'mv-bean-cat': ['fabric', 'fabric'],
  'mv-bean-floor': ['fabric', 'fabric'],
  'mv-bean-shag': ['pile'],
  'mv-bean-outdoor': ['fabric', 'fabric'],
  'mv-bean-kid': ['fabric', 'fabric'],
  'mv-bean-duo': ['fabric', 'fabric'],
  'mv-bean-ottoman': ['fabric', 'fabric'],
  'mv-bean-pad': ['fabric', 'fabric'],
  // 装饰画：[框, 画面色 ×3]
  'mv-art-wood-a4': { mats: [null, 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-wood-a3': { mats: [null, 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-wood-b2': { mats: [null, 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-black-a3': { mats: ['paint', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-black-b2': { mats: ['paint', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-black-wide': { mats: ['paint', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-gold-sq': { mats: ['metal', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-gold-a3': { mats: ['metal', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-gold-b2': { mats: ['metal', 'paper', 'paper', 'paper'], mat: 'paper' },
  // 无框画布
  'mv-art-canvas-sq': { mats: ['fabric', 'fabric', 'fabric', 'fabric'], mat: 'fabric' },
  'mv-art-canvas-wide': { mats: ['fabric', 'fabric', 'fabric', 'fabric'], mat: 'fabric' },
  'mv-art-canvas-tall': { mats: ['fabric', 'fabric', 'fabric', 'fabric'], mat: 'fabric' },
  // 亚克力夹：[金属夹, 画面色 ×3]
  'mv-art-acrylic-a4': { mats: ['metal', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-acrylic-a3': { mats: ['metal', 'paper', 'paper', 'paper'], mat: 'paper' },
  'mv-art-acrylic-b2': { mats: ['metal', 'paper', 'paper', 'paper'], mat: 'paper' },
  // 照片墙：[框 ×2, 照片色调]
  'mv-photo-salon': { mats: [null, null, 'paper'], mat: 'paper' },
  // [麻绳, 木夹, 照片]
  'mv-photo-polaroid-line': { mats: ['fabric', 'wood', 'paper'], mat: 'paper' },
  'mv-photo-grid-tall': { mats: ['metal', 'metal', 'paper'], mat: 'paper' },
  // [软木, 边框, 点缀]
  'mv-photo-cork-round': { mats: ['wood', null, null], mat: 'paper' },
  'mv-photo-heart': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'mv-photo-stair': { mats: [null, null, 'paper'], mat: 'paper' },
  'mv-deco-plates': ['ceramic', 'ceramic', 'ceramic'],
  'mv-deco-wood-geo': ['wood', 'wood', 'paint'],
  // [编织线 ×2, 木珠]
  'mv-deco-weave-round': ['fabric', 'fabric', 'wood'],
  // [干花 ×2, 丝带]
  'mv-deco-hoop': ['plant', 'plant', 'fabric'],
  // [鹿头, 木托板, 角]
  'mv-deco-deer': ['paint', null, null],
  'mv-deco-ledge': { mats: [null, null, 'paper'], mat: 'paper' },

  // ---------- 画作类（artwork.ts 的画面，定义在 hobby / misc / stickers） ----------
  // [木架, 点缀 ×2]；画布布面
  'hb-easel': { mats: ['wood', 'paint', 'paint'], mat: 'fabric' },
  // [裱布, 木轴, 画心]
  'jp-kakejiku': { mats: ['fabric', 'wood', 'paper'], mat: 'paper' },
  // 挂画：[框, 画面底色, 点缀]
  'wall-art-mountain': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'wall-art-mountain-s': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'wall-art-flower': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'wall-art-flower-s': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'wall-art-abstract': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'wall-art-abstract-m': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'st-polaroid': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'st-kids-drawing': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'st-poster': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'st-poster-shapes': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [底垫, 碗]
  'pet-bowl': ['plastic', 'ceramic'],

  // ---------- packs/rooms.ts ----------
  'lv-sofa-l-left': ['fabric', 'fabric', 'fabric'],
  'lv-sofa-l-right': ['fabric', 'fabric', 'fabric'],
  'lv-sofa-low': ['fabric', 'fabric', null],
  // [坐垫, 靠垫, 木框]：床的默认是寝具，白色木框要写明
  'lv-sofa-bed': ['fabric', 'fabric', 'wood'],
  'lv-rocker': [null, 'fabric', 'fabric'],
  'lv-bean-pear': ['fabric', 'fabric', 'fabric'],
  'lv-pouf': ['fabric', 'fabric', 'fabric'],
  // 柜子：木色 / 白漆混用，交给推断
  'lv-tv-120': [null, null, null],
  'lv-tv-180': [null, null, null],
  // [柜身, 奶油色推拉门, 点缀]
  'lv-tv-retro': [null, 'paint', null],
  'lv-sideboard': [null, null, null],
  'lv-sideboard-nordic': [null, null, null],
  'lv-display': [null, null, null],
  // [柜体, 布收纳箱 ×2]
  'lv-cube-2x2': [null, 'fabric', 'fabric'],
  'lv-cube-3x3': [null, 'fabric', 'fabric'],
  'lv-cube-4x4': [null, 'fabric', 'fabric'],
  // [长椅, 坐垫, 靠垫]
  'lv-window-bench': [null, 'fabric', 'fabric'],
  // [床架, 被子, 枕头]
  'bd-bunk': ['wood', 'bedding', 'bedding'],
  'bd-loft': ['wood', 'bedding', 'bedding'],
  'bd-foot-bench': [null, 'fabric', null],
  'bd-vanity': [null, null, null],
  // [衣帽架, 帽子 / 包, 围巾]
  'bd-coat-rack': [null, 'fabric', 'fabric'],
  // [钢管架, 衣物 / 鞋 ×2]
  'bd-clothes-rail': ['metal', 'fabric', 'fabric'],
  'bd-tall-chest': [null, null, null],
  // [框, 屏面布, 点缀]
  'bd-screen': [null, 'fabric', null],
  'st-drawer-3': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'st-drawer-5': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'st-steel-rack-3': ['metal', null, null],
  'st-steel-rack-5': ['metal', null, null],
  // [木板, 水管, 接头]
  'st-pipe-shelf-3': ['wood', 'metal', 'metal'],
  'st-pipe-shelf-5': ['wood', 'metal', 'metal'],
  'st-slim-cart': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  // [柜体, 书 ×2]
  'st-bookcase-low': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'st-bookcase-wide': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'st-magazine': [null, 'paper', 'paper'],
  // [藤编篮, 内衬布 ×2]
  'st-baskets': ['wood', 'fabric', 'fabric'],
  // [箱体, 抽屉面, 铁把手]
  'st-kaidan': ['wood', 'wood', 'metal'],
  // [床架, 床品 ×2]
  'kid-crib': ['wood', 'bedding', 'bedding'],
  'kid-desk': [null, null, null],
  'kid-chair': [null, null],
  'kid-toybox': [null, null],
  'kid-horse': [null, null, null],
  // [帐篷布, 木杆, 点缀布]
  'kid-teepee': ['fabric', 'wood', 'fabric'],
  'kid-slide': ['plastic', 'plastic', 'plastic'],
  'kid-bed': ['wood', 'bedding', 'bedding'],

  // ---------- packs/variants-a.ts ----------
  'va-aircon-slim': ['plastic', 'plastic'],
  'va-aircon-premium': ['plastic', 'plastic', 'plastic'],
  // [机身, 木纹面板, 点缀]
  'va-aircon-wood': ['plastic', 'wood', 'plastic'],
  'va-aircon-black': ['plastic', 'plastic', 'plastic'],
  'va-aircon-round': ['plastic', 'plastic', 'plastic'],
  // [杆, 接头 / 夹]
  'va-lstand-tele': ['metal', 'plastic'],
  'va-lstand-x': ['metal', 'plastic'],
  'va-lstand-rail': ['metal', 'plastic'],
  'va-lstand-lift': ['metal', 'metal', 'plastic'],
  // [竹柱, 石座, 竹竿]
  'va-lstand-bamboo': ['wood', 'stone', 'wood'],
  // 花箱：[箱, 腿 / 盆, 花草]
  'va-planter-wood': ['wood', 'wood', 'plant'],
  'va-planter-terracotta': ['ceramic', 'ceramic', 'plant'],
  'va-planter-tiered': ['wood', 'ceramic', null],
  'va-planter-galv': ['metal', 'metal', 'plant'],
  'va-planter-cubes': ['ceramic', 'plastic', 'plant'],
  'va-brush-slim': ['plastic', 'plastic', 'plastic'],
  'va-brush-dome': ['plastic', 'plastic', 'plastic'],
  // [陶瓷筒, 木柄, 箍]
  'va-brush-wood': ['ceramic', 'wood', 'plastic'],
  'va-brush-stand': ['metal', 'ceramic', 'plastic'],
  'va-ns-open': [null, null, null],
  'va-ns-round': [null, null, null],
  'va-ns-wagon': ['metal', null],
  'va-ns-tansu': ['wood', 'metal', 'wood'],
  // [彩漆柜身, 拉手, 木腿]
  'va-ns-candy': ['paint', 'paint', null],
  'va-knife-magnet': [null, null, null],
  // [陶瓷筒, 刀柄, 箍]
  'va-knife-tub': ['ceramic', 'plastic', 'metal'],
  'va-knife-rack': ['wood', null, null],
  'va-knife-acrylic': ['glass', 'plastic', 'plastic'],
  // 毛绒：[主色, 肚皮, 点缀]
  'va-plush-bunny': ['pile', 'pile', 'pile'],
  'va-plush-cat': ['pile', 'pile', 'fabric'],
  'va-plush-dino': ['pile', 'pile', 'pile'],
  'va-plush-penguin': ['pile', 'pile', 'fabric'],
  'va-plush-shiba': ['pile', 'pile', 'fabric'],
  // 花瓶插花：[瓶, 花, 枝叶]
  'va-vase-bud': ['ceramic', 'plant', 'plant'],
  'va-vase-ikebana': ['ceramic', 'plant', 'wood'],
  'va-vase-jar': ['glass', 'plant', 'fabric'],
  'va-vase-pampas': ['ceramic', 'plant', 'plant'],
  'va-vase-milk': ['metal', 'metal', 'plant'],
  'va-vase-ribbon': ['ceramic', 'fabric', 'plant', 'plant'],
  // 洗衣篮：[篮, 边, 衣物]
  'va-lb-rattan': ['wood', 'wood', 'fabric'],
  'va-lb-fold': ['fabric', 'plastic', 'fabric'],
  'va-lb-hip': ['plastic', 'fabric'],
  'va-lb-wire': ['metal', 'wood', 'fabric'],
  'va-hamper-wicker-closed': ['wood', 'wood', 'fabric'],
  'va-hamper-wicker-open': ['wood', 'wood', 'fabric'],
  'va-hamper-canvas': ['fabric', 'wood', 'fabric'],
  'va-hamper-split-closed': ['fabric', 'fabric', 'fabric'],
  'va-hamper-split-open': ['fabric', 'fabric', 'fabric'],
  // [竹编, 箍, 内衬布]
  'va-hamper-bamboo-closed': ['wood', 'wood', 'fabric'],
  'va-hamper-bamboo-open': ['wood', 'wood', 'fabric'],
  'va-hamper-pop': ['fabric', 'fabric', 'fabric'],
  'va-lrack-ladder': ['wood', null, null],
  'va-lrack-tension': ['metal', null, 'plastic'],
  'va-lrack-cabinet': [null, 'metal', null],
  'va-lrack-mesh': ['metal', 'metal', 'plastic'],
  'va-lrack-cute': [null, null, null],
  // 刷牙杯：[杯, 牙刷 ×2]
  'va-tb-holder': ['ceramic', 'plastic', 'plastic'],
  'va-tb-mug': ['ceramic', 'plastic', 'plastic'],
  'va-tb-glass': ['glass', 'plastic', 'plastic'],
  'va-tb-ceramic': ['ceramic', 'ceramic', 'plastic'],
  // 咖啡杯碟：[杯, 碟, 勺]
  'va-coffee-latte': ['ceramic', 'ceramic', 'metal'],
  'va-coffee-espresso': ['ceramic', 'ceramic', 'metal'],
  // [杯垫, 玻璃杯, 点缀]
  'va-coffee-glass': ['wood', 'glass', null],
  'va-coffee-diner': ['ceramic', 'ceramic', 'metal'],
  'va-coffee-yunomi': ['ceramic', 'wood', 'ceramic'],

  // ---------- packs/wet.ts ----------
  // [层板, 钢架]
  'wet-toilet-rack-2': [null, 'metal'],
  'wet-toilet-rack-3': [null, 'metal'],
  // 吊柜 / 窄柜：[柜身, 门, 金属拉手]
  'wet-toilet-wall-cabinet': [null, null, 'metal'],
  'wet-toilet-upper-cab-60': [null, null, 'metal'],
  'wet-toilet-upper-cab-75': [null, null, 'metal'],
  'wet-toilet-slim-cabinet': [null, null, 'metal'],
  'wet-tp-stack': ['paper'],
  // [卷纸, 包装印花, 点缀]
  'wet-tp-4pack': ['paper', 'plastic', 'plastic'],
  'wet-tp-12pack': ['paper', 'plastic', 'plastic'],
  // [架, 卷纸, 木置物板]
  'wet-tp-holder': ['metal', 'paper'],
  'wet-tp-holder-double': ['metal', 'paper', 'wood'],
  'wet-toilet-brush': ['plastic', 'plastic', 'plastic'],
  'wet-sanitary-bin': ['plastic', 'plastic', 'plastic'],
  'wet-plunger': ['plastic', 'plastic', 'plastic'],
  'wet-sanitary-pads': ['plastic', 'plastic', 'plastic'],
  'wet-panty-liners': ['paper', 'paper', 'paper'],
  'wet-air-freshener': ['plastic', 'plastic', 'plastic'],
  'wet-toilet-mat': ['pile', 'pile'],
  'wet-toilet-slippers': ['plastic', 'plastic', 'plastic'],
  'wet-toilet-cleaner': ['plastic', 'plastic', 'plastic'],
  // 按压瓶：[瓶, 泵头, 标签]
  'wet-shampoo': ['plastic', 'plastic', 'plastic'],
  'wet-conditioner': ['plastic', 'plastic', 'plastic'],
  'wet-body-soap': ['plastic', 'plastic', 'plastic'],
  'wet-bottle-set': ['plastic', 'plastic', null],
  'wet-refill-pouch': ['plastic', 'plastic', 'plastic'],
  'wet-face-wash': ['plastic', 'plastic', 'plastic'],
  'wet-razor': ['plastic', 'metal'],
  'wet-bath-pouf': ['fabric', 'fabric'],
  // [海绵, 搓面]
  'wet-bath-sponge': ['paint', 'fabric'],
  // 浴凳：桧木 / 塑料都有，交给推断
  'wet-bath-stool-25': [null, null, null],
  'wet-bath-stool-35': [null, null, null],
  // [桶身, 铜箍]
  'wet-bath-pail': [null, 'metal'],
  'wet-bath-lid-rolled': ['plastic', 'plastic'],
  'wet-bath-lid-folded': ['plastic', 'plastic'],
  'wet-toy-boat': ['plastic', 'plastic', 'plastic'],
  'wet-toy-whale': ['plastic', 'plastic'],
  'wet-toy-cups': ['plastic', 'plastic', 'plastic'],
  // [浴盐, 木盖, 麻绳]
  'wet-bath-salt': ['paint', 'wood', 'fabric'],
  'wet-bath-corner-shelf-2': ['metal', 'plastic'],
  'wet-bath-corner-shelf-3': ['metal', 'plastic'],
  'wet-wire-basket': ['metal'],
  'wet-bath-caddy': [null, 'plastic'],
  'wet-laundry-rack-70': [null, 'metal'],
  'wet-laundry-rack-80': [null, 'metal'],
  'wet-washroom-tall-30': [null, null, 'metal'],
  'wet-washroom-tall-45': [null, null, 'metal'],
  'wet-washroom-wall-cabinet': [null, null, 'metal'],
  'wet-mirror-cabinet': [null, null, 'metal'],
  'wet-towel-stand': ['metal', null],
  'wet-towel-shelf': [null, 'metal'],
  'wet-bath-towel-folded': ['fabric', 'fabric', 'fabric'],
  'wet-bath-towel-hanging': ['fabric', 'fabric', 'fabric'],
  'wet-bath-mat': ['fabric', 'fabric'],
  // 硅藻土地垫：按石材
  'wet-bath-mat-stone': ['stone', null, 'stone'],
  // [秤身, 电极片]
  'wet-body-scale': ['plastic', 'metal'],
  'wet-dryer-holder': ['plastic', 'plastic'],
  'wet-detergent': ['plastic', 'plastic', 'plastic'],
  'wet-softener': ['plastic', 'plastic', 'plastic'],
  'wet-bleach': ['plastic', 'plastic', 'plastic'],
  // [纸盒, 标签, 提手]
  'wet-powder-box': ['paper', 'paper', 'plastic'],
  'wet-pod-jar': ['plastic', 'plastic', 'plastic'],
  // [网布, 包边, 拉链]
  'wet-laundry-net': ['fabric', 'fabric', 'metal'],
  'wet-peg-basket': ['plastic', 'plastic', 'plastic'],
  'wet-fabric-spray': ['plastic', 'plastic', 'plastic'],
  // [布篓, 木框, 衣物]
  'wet-hamper-closed': ['fabric', 'wood', 'fabric'],
  'wet-hamper-open': ['fabric', 'wood', 'fabric'],
  'wet-iron': ['plastic', 'plastic'],
  // [布面, 铁架]
  'wet-ironing-board-open': ['fabric', 'metal'],
  'wet-ironing-board-folded': ['fabric', 'metal'],
  // [盖, 毛巾 ×2]
  'wet-clear-case-s-closed': ['plastic', 'fabric', 'fabric'],
  'wet-clear-case-s-open': ['plastic', 'fabric', 'fabric'],
  'wet-clear-case-l-closed': ['plastic', 'fabric', 'fabric'],
  'wet-clear-case-l-open': ['plastic', 'fabric', 'fabric'],
  'wet-drawer-chest': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'wet-wash-basket': ['wood', 'wood'],
  // [香薰液, 藤条, 瓶口圈]
  'wet-reed-diffuser': ['glass', 'wood', 'metal'],
  // [玻璃罐, 蜡, 标签]
  'wet-candle-jar': ['glass', 'paint', 'paper'],
  'wet-deodor-box': ['plastic', 'plastic', 'plastic'],
  // [铝罐, 盖, 标签]
  'wet-air-spray': ['metal', 'plastic', 'plastic'],
  'wet-toilet-tablets': ['paper', 'paper', 'plastic'],
  'wet-dehumidifier-l': ['plastic', 'plastic', 'plastic'],
  'wet-dehumidifier-s': ['plastic', 'plastic', 'plastic'],
  'wet-dehum-bag-hanging': ['plastic', 'plastic', null],
  'wet-dehum-bag-lying': ['plastic', 'plastic', null],
  'wet-charcoal-bag': ['fabric', 'fabric'],
  'wet-moth-hanging': ['paper', 'paper'],
  'wet-moth-sheet': ['paper', 'paper'],

  // ---------- packs/seasonal.ts ----------
  // [竹, 稻草, 松梅]
  'ss-kadomatsu': ['wood', 'wood', 'plant'],
  'ss-kadomatsu-mini': ['wood', 'wood', 'plant'],
  // [木台, 年糕, 橘子]
  'ss-kagami-mochi': ['wood', 'paint', 'paint'],
  'ss-kagami-mochi-s': ['wood', 'paint', 'paint'],
  // [稻草绳, 纸垂, 点缀]
  'ss-shimekazari': ['fabric', 'paper', null],
  // [木座, 押绘板面, 点缀]
  'ss-hagoita': ['wood', 'fabric', 'fabric'],
  'ss-fukubukuro': ['paper', 'paper', 'paper'],
  'ss-fukubukuro-s': ['paper', 'paper', 'paper'],
  'ss-kohaku-mochi': ['ceramic', 'paint', 'paint'],
  // [纸鬼面, 木枡, 头发]
  'ss-setsubun': ['paper', 'wood', 'fabric'],
  // [红毛毡, 屏风, 衣装]
  'ss-hina-tiers': ['fabric', null, 'fabric'],
  'ss-hina-pair': ['fabric', null, 'fabric'],
  'ss-koinobori': ['fabric', 'fabric', 'fabric'],
  'ss-koinobori-mini': ['fabric', 'fabric', 'fabric'],
  // [漆, 金饰, 绳]
  'ss-kabuto': ['plastic', 'metal', 'fabric'],
  // [竹叶, 纸笺 ×2]
  'ss-tanabata': ['plant', 'paper', 'paper'],
  'ss-tanabata-mini': ['plant', 'paper', 'paper'],
  // [玻璃铃, 纸笺, 金鱼图案]
  'ss-furin': ['glass', 'paper', 'paint'],
  'ss-furin-hanging': ['glass', 'paper', 'paint'],
  'ss-uchiwa': ['paper', 'paper', 'wood'],
  'ss-uchiwa-hanging': ['paper', 'paper', 'wood'],
  // [陶猪, 点缀, 蚊香]
  'ss-katori-buta': ['ceramic', 'ceramic', 'paint'],
  'ss-tsukimi-dango': ['wood', 'paint', 'paper'],
  'ss-susuki': ['ceramic', 'plant', 'plant'],
  'ss-daruma-l': ['paper', 'paper', 'paint'],
  'ss-daruma-xl': ['paper', 'paper', 'paint'],
  'ss-maneki-l': ['ceramic', 'fabric', 'metal'],
  'ss-maneki-xl': ['ceramic', 'fabric', 'metal'],
  // [木, 屋顶, 注连绳]
  'ss-kamidana': ['wood', 'wood', 'fabric'],
  'ss-butsudan': ['wood', null, 'metal'],
  'ss-ema': ['wood', 'paint', 'fabric'],
  'ss-omamori': ['fabric', 'fabric', 'fabric'],
  'ss-omamori-hanging': ['fabric', 'fabric', 'fabric'],
  // [树, 挂球 ×2]
  'ss-xmas-tree-l': ['plant', 'plastic', 'plastic'],
  'ss-xmas-tree-m': ['plant', 'plastic', 'plastic'],
  'ss-xmas-tree-s': ['plant', 'plastic', 'plastic'],
  // [枝叶, 蝴蝶结, 浆果]
  'ss-wreath': ['plant', 'fabric', 'paint'],
  'ss-stockings': ['fabric', 'fabric', 'fabric'],
  'ss-stocking-hanging': ['fabric', 'fabric'],
  // [包装纸 ×2, 丝带]
  'ss-gifts': ['paper', 'paper', 'fabric'],
  // [南瓜皮, 瓜蒂, 光]
  'ss-pumpkin-l': ['paint', 'plant', 'paint'],
  'ss-pumpkin-s': ['paint', 'plant', 'paint'],
  'ss-easter-basket': ['wood', 'paint', 'paint'],
  'ss-cake-tier': ['paint', 'paint', 'paint'],
  'ss-balloons': ['plastic', 'plastic', 'plastic'],
  'ss-bunting': ['fabric', 'fabric', 'fabric'],
  'ss-fan-floor': ['plastic', 'plastic', 'plastic'],
  'ss-fan-desk': ['plastic', 'plastic', 'plastic'],
  'ss-fan-circ': ['plastic', 'plastic', 'plastic'],
  'ss-fan-tower': ['plastic', 'plastic', 'plastic'],
  // [机身, 金属扇叶, 网罩]
  'ss-fan-retro': ['plastic', 'metal', 'metal'],
  'ss-ceramic-heater': ['plastic', 'plastic', 'plastic'],
  // [烤漆机身, 顶板, 水壶]
  'ss-kerosene-conv': ['plastic', 'metal', 'metal'],
  'ss-kerosene-fan': ['plastic', 'plastic', 'plastic'],
  // [毯面, 缝线, 控制器]
  'ss-hot-carpet-2': ['fabric', 'fabric', 'plastic'],
  'ss-hot-carpet-3': ['fabric', 'fabric', 'plastic'],
  // [被炉被, 木桌, 垫]
  'ss-kotatsu-rect': ['bedding', 'wood', 'fabric'],
  'ss-futon-folded': ['bedding', 'bedding', 'fabric'],
  // [机身, 水箱（半透明）, 点缀]
  'ss-humidifier-tower': ['plastic', null, 'plastic'],
  'ss-humidifier-steam': ['plastic', 'plastic', 'plastic'],
  'ss-steamer-hand': { mats: ['plastic', null, 'plastic'], mat: 'plastic' },
  // [竹条, 包边布, 绳]
  'ss-sudare': ['wood', 'fabric', 'fabric'],
  'ss-sudare-s': ['wood', 'fabric', 'fabric'],
  'ss-yoshizu': ['wood', 'fabric'],
  'ss-clock-cuckoo': ['wood', null, null],
  'ss-clock-digital': ['plastic', 'plastic', 'plastic'],
  // [木框, 表盘, 墨]
  'ss-clock-wa': ['wood', 'paper', 'paint'],
  // [铝圈, 表盘, 秒针]
  'ss-clock-school': ['metal', 'paint', 'paint'],
  'ss-clock-pendulum': ['wood', 'paint', 'metal'],
  // 画布：布面
  'ss-art-canvas-xl': { mats: ['fabric', 'fabric', 'fabric'], mat: 'fabric' },
  'ss-art-triptych': { mats: ['fabric', 'fabric', 'fabric'], mat: 'fabric' },
  // 带框画：[框, 画面色 ×2]
  'ss-art-square': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'ss-art-tall': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'ss-art-mini-set': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'ss-photo-wall': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'ss-tapestry': ['fabric', 'fabric', 'fabric'],
  // [棉绳, 木杆, 木珠]
  'ss-macrame': ['fabric', 'wood', 'wood'],
  'ss-shelf-2tier': [null, 'metal'],
  'ss-shelf-cube': [null, null],
  'ss-shelf-floating': [null, null],
  // [木框, 便签 ×2]
  'ss-corkboard': ['wood', 'paper', 'paper'],
  // [木框, 毛毡, 字母]
  'ss-letterboard': ['wood', 'fabric', 'plastic'],
  'ss-wire-grid': { mats: ['metal', 'wood', 'paper'], mat: 'paper' },
  'ss-calendar': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'ss-calendar-tear': { mats: ['wood', 'paper', 'paper'], mat: 'paper' },
  // [裱布, 木轴, 画心]
  'ss-kakejiku-sansui': { mats: ['fabric', 'wood', 'paper'], mat: 'paper' },
  'ss-kakejiku-sho': { mats: ['fabric', 'wood', 'paper'], mat: 'paper' },
  // [扇面纸, 扇骨, 点缀]
  'ss-sensu-deco': ['paper', 'wood', 'paint'],

  // ---------- packs/living-more.ts ----------
  // [布面, 脚 / 底座, 靠垫]
  'lm-corner-sofa-l': ['fabric', null, 'fabric'],
  'lm-corner-sofa-r': ['fabric', null, 'fabric'],
  'lm-block-sofa-1': ['fabric', null, 'fabric'],
  'lm-block-sofa-2': ['fabric', null, 'fabric'],
  'lm-block-sofa-3': ['fabric', null, 'fabric'],
  'lm-futon-sofa': ['fabric', 'wood', 'fabric'],
  'lm-futon-sofa-open': ['fabric', 'wood', 'fabric'],
  'lm-lazy-cube': ['fabric', null, 'fabric'],
  'lm-lazy-shell': ['fabric', null, 'fabric'],
  'lm-lazy-long': ['fabric', null, 'fabric'],
  'lm-daybed': ['fabric', null, 'fabric'],
  'lm-storage-ottoman': ['fabric', null, null],
  'lm-knit-pouf': ['fabric', null, null],
  // [台面, 柜身, 金属件]
  'lm-lift-table': [null, null, 'metal'],
  'lm-lift-table-open': [null, null, 'metal'],
  'lm-nest-tables': [null, null, null],
  'lm-zataku': ['wood', 'wood'],
  'lm-glass-coffee': [null, null],
  // [木, 门框, 金属件]
  'lm-storage-coffee': [null, null, 'metal'],
  'lm-tv-board-150': [null, null, 'metal'],
  'lm-tv-board-200': [null, null, 'metal'],
  'lm-tv-board-240': [null, null, 'metal'],
  'lm-tv-wall-unit': [null, null, 'metal'],
  // [金属灯罩, 弧杆, 石材底座]
  'lm-arc-lamp': ['metal', 'metal', 'stone'],
  // [灯罩, 木脚, 金属件]
  'lm-tripod-lamp': ['fabric', 'wood', 'metal'],
  'lm-akari-floor': ['paper', 'metal', 'wood'],
  'lm-pole-lamp': ['fabric', 'wood', 'metal'],
  'lm-pleat-lamp': ['fabric', 'ceramic', 'metal'],
  // [绿玻璃罩, 黄铜]
  'lm-banker-lamp': ['glass', 'metal'],
  'lm-jar-lamp': ['fabric', 'ceramic', 'metal'],
  'lm-moon-lamp': ['plastic', 'wood'],
  'lm-sconce': ['metal', 'metal'],
  // [电线, 灯泡, 夹子]
  'lm-fairy-lights': ['plastic', 'glass', null],
  'lm-star-curtain': ['plastic', 'plastic', 'plastic'],
  // [灯管 ×2, 亚克力底板]
  'lm-neon-sign': ['glass', 'glass', 'plastic'],
  'lm-led-bar': ['plastic', 'plastic', 'plastic'],
  'lm-cloud-light': ['plastic', 'plastic', 'plastic'],
  'lm-candle-lantern': ['metal', 'paint', null],
  'lm-candle-tray': ['paint', null, null],
  'lm-rug-runner': ['pile', 'pile', 'pile'],
  'lm-rug-cloud': ['pile', 'pile'],
  'lm-rug-bear': ['pile', 'pile', 'pile'],
  'lm-rug-rainbow': ['pile', 'pile', 'pile'],
  'lm-rug-checker': ['pile', 'pile', 'pile'],
  // 编织 / 平织毯：布面
  'lm-rug-braided': ['fabric', 'fabric', 'fabric'],
  'lm-hanamushiro': ['fabric', 'fabric', 'fabric'],
  'lm-rug-kilim': ['fabric', 'fabric', 'fabric'],
  'lm-doormat-rect': ['pile', 'pile', 'pile'],
  'lm-doormat-half': ['pile', 'pile', 'pile'],
  'lm-doormat-cat': ['pile', 'pile', 'pile'],
  // [笔筒, 笔 ×2]
  'lm-pen-organizer': { mats: [null, 'plastic', 'plastic'], mat: 'plastic' },
  'lm-notebook-stack': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'lm-file-boxes': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [托盘, 金属立柱, 纸]
  'lm-letter-tray': [null, 'metal', 'paper'],
  'lm-block-calendar': ['wood', 'paint', null],
  'lm-sticky-notes': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [海, 陆, 木架]
  'lm-floor-globe': ['plastic', 'plastic', 'wood'],
  // [金属框, 笔迹, 点缀]；白板面亮面
  'lm-desk-whiteboard': { mats: ['metal', 'plastic', 'plastic'], mat: 'plastic' },
  'lm-desk-drawers': [null, null, null],
  // [金属猫, -, 点缀]；夹着的书
  'lm-cat-bookends': { mats: ['metal', null, null], mat: 'paper' },
  'lm-bladeless-fan': ['plastic', 'metal'],
  'lm-drop-humidifier': ['plastic', 'plastic', null],
  // PU 桌垫
  'lm-desk-mat': ['leather', 'leather'],
  'lm-monitor-riser': [null, 'metal', null],
  'lm-sharpener': ['plastic', 'plastic', 'metal'],
  'lm-hole-punch': ['plastic', 'plastic', 'metal'],
  // [机身, 翻页卡, 数字]
  'lm-flip-clock': [null, 'plastic', 'paint'],
  // [布袋, 拉链, 点缀]；露出的笔
  'lm-pencil-case': { mats: ['fabric', 'metal', 'fabric'], mat: 'plastic' },
  'lm-paper-ream': ['paper', 'paper', 'paper'],
  'lm-cork-board': ['wood', 'paper', 'paper'],
  // 木积木：木色出木纹，彩色按涂装
  'lm-blocks-tower': [null, null, null],
  'lm-blocks-scatter': [null, null, null],
  // EVA 拼接垫
  'lm-puzzle-mat': ['plastic', 'plastic', 'plastic'],
  'lm-train-track': ['wood', 'paint', 'paint'],
  'lm-ride-car': ['plastic', 'plastic', 'plastic'],
  'lm-dollhouse': [null, null, null],
  // [毛绒身, 木摇板, 鬃毛]
  'lm-rocker-unicorn': ['pile', 'wood', 'pile'],
  'lm-play-tunnel': ['fabric', 'fabric', 'plastic'],
  // [布围, 球 ×2]
  'lm-ball-pit': { mats: ['fabric', 'plastic', 'plastic'], mat: 'plastic' },
  // [木架, 布兜, 点缀]；绘本
  'lm-book-sling': { mats: ['wood', 'fabric', null], mat: 'paper' },
  // [柜, 收纳筐 ×2]
  'lm-toy-shelf': [null, 'fabric', 'fabric'],
  'lm-pikler': ['wood', 'wood'],
  'lm-walker': ['wood', 'plastic', null],
  'lm-growth-chair': ['wood', 'fabric', null],
  // [布篷, 车架, 点缀]
  'lm-stroller': ['fabric', 'metal', 'fabric'],
  'lm-stroller-folded': ['fabric', 'metal', 'fabric'],
  'lm-playpen': [null, 'fabric', null],
  'lm-play-kitchen': [null, null, null],
  'lm-kids-table-set': [null, null, null],
  'lm-shape-sorter': [null, null, null],
  'lm-stack-rings': [null, null, null],
  'lm-kids-easel': ['wood', null, null],

  // ---------- packs/storage-forms.ts ----------
  // [木, 金属挂钩, 挂着的东西]：衣物类标签让默认成了布，挂钩要写明
  'sf-coat-tree': ['wood', 'metal', null],
  'sf-ladder-hanger': ['wood', null, null],
  'sf-hall-tree': [null, 'metal', null],
  'sf-door-rack': [null, 'metal'],
  'sf-double-rail': [null, 'metal'],
  // [木, 漆木, 金属件]
  'sf-ikou': ['wood', 'wood', 'metal'],
  // 衣物：[主布, 衣架（木色出木纹）/ 纽扣, 点缀布]
  'sf-coat-folded': ['fabric', null, 'fabric'],
  'sf-coat-hanging': ['fabric', null, 'fabric'],
  'sf-down-folded': ['fabric', null, 'fabric'],
  'sf-down-hanging': ['fabric', null, 'fabric'],
  'sf-suit-folded': ['fabric', null, 'fabric'],
  'sf-suit-hanging': ['fabric', null, 'fabric'],
  'sf-hoodie-folded': ['fabric', null, 'fabric'],
  'sf-hoodie-hanging': ['fabric', null, 'fabric'],
  'sf-cardigan-folded': ['fabric', null, 'fabric'],
  'sf-cardigan-hanging': ['fabric', null, 'fabric'],
  'sf-dress-folded': ['fabric', null, 'fabric'],
  'sf-dress-hanging': ['fabric', null, 'fabric'],
  'sf-shirt-folded': ['fabric', null, 'fabric'],
  'sf-shirt-hanging': ['fabric', null, 'fabric'],
  'sf-sweater-folded': ['fabric', null, 'fabric'],
  'sf-sweater-hanging': ['fabric', null, 'fabric'],
  // 雨衣：塑胶
  'sf-raincoat-folded': ['plastic', null, 'plastic'],
  'sf-raincoat-hanging': ['plastic', null, 'plastic'],
  'sf-kimono-folded': ['fabric', null, 'fabric'],
  'sf-kimono-hanging': ['fabric', null, 'fabric'],
  'sf-apron-folded': ['fabric', 'fabric', 'fabric'],
  'sf-apron-hanging': ['fabric', 'fabric', 'fabric'],
  'sf-beanie-lying': ['fabric', 'fabric', 'fabric'],
  'sf-beanie-hanging': ['fabric', 'fabric', 'fabric'],
  'sf-straw-hat-lying': ['fabric', null, 'fabric'],
  'sf-straw-hat-hanging': ['fabric', null, 'fabric'],
  'sf-bucket-hat-lying': ['fabric', 'fabric'],
  'sf-bucket-hat-hanging': ['fabric', 'fabric'],
  'sf-top-hat-lying': ['fabric', 'fabric'],
  'sf-top-hat-hanging': ['fabric', 'fabric'],
  // 皮包：[包身, 肩带, 点缀]
  'sf-crossbody-standing': ['leather', 'leather', null],
  'sf-crossbody-hanging': ['leather', 'leather', null],
  'sf-handbag-standing': ['leather', 'leather', null],
  'sf-handbag-hanging': ['leather', 'leather', null],
  // 洞洞板：木板 / 白板都有，交给推断
  'sf-pegboard-40x60': [null, null, null],
  'sf-pegboard-60x90': [null, null, null],
  'sf-pegboard-90x120': [null, null, null],
  'sf-pegboard-120x60': [null, null, null],
  'sf-pegboard-set-60x90': [null, null, null],
  'sf-pegboard-set-90x120': [null, null, null],
  'sf-peg-shelf-standing': [null, null, 'metal'],
  'sf-peg-shelf-hanging': [null, null, 'metal'],
  'sf-peg-cup-standing': ['plastic', null, 'metal'],
  'sf-peg-cup-hanging': ['plastic', null, 'metal'],
  // 铁丝挂篮
  'sf-peg-basket-standing': ['metal'],
  'sf-peg-basket-hanging': ['metal'],
  // [层板, 金属托架]
  'sf-wall-shelf-1': [null, 'metal'],
  'sf-wall-shelf-2': [null, 'metal'],
  'sf-wall-shelf-3': [null, 'metal'],
  'sf-ladder-shelf': [null, null],
  'sf-corner-shelf': [null, null],
  'sf-open-rack-60': [null, null],
  'sf-open-rack-80': [null, null],
  'sf-open-rack-120': [null, null],
  // [线网, 脚轮]
  'sf-wire-rack-60': ['metal', 'plastic'],
  'sf-wire-rack-90': ['metal', 'plastic'],
  'sf-wire-rack-120': ['metal', 'plastic'],
  'sf-kitchen-rack': [null, null],
  'sf-counter-rack': [null, null],
  'sf-bath-corner': ['metal', 'plastic'],
  'sf-display-cube': [null, null],
  'sf-shoe-rack-2': [null, null],
  'sf-shoe-rack-4': [null, null],
  'sf-garment-rail-80': [null, 'metal'],
  'sf-garment-rail-120': [null, 'metal'],
  'sf-towel-bar-1': ['metal', 'metal'],
  'sf-towel-bar-2': ['metal', 'metal'],
  'sf-hook-rail-4': [null, null],
  'sf-hook-rail-6': [null, null],
  'sf-door-hooks': ['metal'],
  'sf-umbrella-hook': [null, 'metal'],
  'sf-kitchen-bar': [null, 'metal'],
  // [头梁, 耳罩, 金属件]
  'sf-headphones-lying': ['plastic', 'leather', 'metal'],
  'sf-headphones-hanging': ['plastic', 'leather', 'metal'],
  'sf-headset-lying': ['plastic', 'leather', 'metal'],
  'sf-headset-hanging': ['plastic', 'leather', 'metal'],
  // [机身, 饰边, 镜头]
  'sf-webcam-standing': ['plastic', 'plastic', 'glass'],
  'sf-webcam-lying': ['plastic', 'plastic', 'glass'],
  'sf-tote-standing': ['fabric', 'fabric', 'fabric'],
  'sf-tote-hanging': ['fabric', 'fabric', 'fabric'],
  'sf-backpack-standing': ['fabric', 'fabric', 'metal'],
  'sf-backpack-hanging': ['fabric', 'fabric', 'metal'],
  'sf-cap-lying': ['fabric', 'fabric', 'fabric'],
  'sf-cap-hanging': ['fabric', 'fabric', 'fabric'],
  'sf-scarf-folded': ['fabric', 'fabric', 'fabric'],
  'sf-scarf-hanging': ['fabric', 'fabric', 'fabric'],
  'sf-towel-folded': ['fabric', 'fabric', 'fabric'],
  'sf-towel-hanging': ['fabric', 'fabric', 'fabric'],
  'sf-tshirt-folded': ['fabric', null, 'fabric'],
  'sf-tshirt-hanging': ['fabric', null, 'fabric'],
  'sf-pants-folded': ['fabric', null, 'fabric'],
  'sf-pants-hanging': ['fabric', null, 'fabric'],
  'sf-mug-standing': ['ceramic', 'ceramic'],
  'sf-mug-hanging': ['ceramic', 'ceramic'],
  // 工具：[握把, 金属, 点缀]
  'sf-scissors-lying': ['plastic', 'metal', 'plastic'],
  'sf-scissors-hanging': ['plastic', 'metal', 'plastic'],
  'sf-pliers-lying': ['plastic', 'metal', 'plastic'],
  'sf-pliers-hanging': ['plastic', 'metal', 'plastic'],
  'sf-drivers-lying': ['plastic', 'metal', 'plastic'],
  'sf-drivers-hanging': ['plastic', 'metal', 'plastic'],
  'sf-tape-lying': ['plastic', 'metal', 'plastic'],
  'sf-tape-hanging': ['plastic', 'metal', 'plastic'],
  'sf-wrench-lying': ['plastic', 'metal'],
  'sf-wrench-hanging': ['plastic', 'metal'],
  'sf-cable-lying': ['plastic', 'plastic', 'metal'],
  'sf-cable-hanging': ['plastic', 'plastic', 'metal'],
  // [钥匙, 钥匙扣, 皮挂件]
  'sf-keys-lying': ['metal', 'plastic', 'leather'],
  'sf-keys-hanging': ['metal', 'plastic', 'leather'],
  // [伞布, 伞柄, 金属件]
  'sf-umbrella-lying': ['fabric', 'plastic', 'metal'],
  'sf-umbrella-hanging': ['fabric', 'plastic', 'metal'],
  'sf-basket-standing': ['fabric', null],
  'sf-basket-hanging': ['fabric', null],
  'sf-book-standing': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'sf-book-lying': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'sf-book-stacked': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'sf-laptop-open': ['metal', 'plastic', 'plastic'],
  'sf-laptop-closed': ['metal', 'plastic'],
  // [布盒, 盖, 点缀]
  'sf-storage-box-closed': ['fabric', null, null],
  'sf-storage-box-open': ['fabric', null, null],
  'sf-tissue-cube': ['paper', 'paper'],
  'sf-tissue-rect': ['paper', 'paper', null],
  'sf-tissue-soft': ['paper', 'paper'],
  'sf-toilet-roll': ['paper', 'paper'],
  'sf-wipes-canister': ['plastic', 'plastic', 'plastic'],
  'sf-wipes-pouch': ['plastic', 'plastic'],
  'sf-mask-box': ['paper', 'paper'],
  'sf-swab-case': [null, 'plastic'],
  'sf-hand-cream': ['plastic', 'plastic'],
  'sf-eye-drops': ['plastic', 'plastic'],
  'sf-pill-box': ['plastic', 'plastic', 'plastic'],
  'sf-sanitizer': ['plastic', 'plastic'],
  'sf-remote-tv': ['plastic', 'plastic', 'plastic'],
  'sf-remote-ac': ['plastic', 'plastic', 'plastic'],
  'sf-remote-light': ['plastic', 'plastic', 'plastic'],
  'sf-charger': ['plastic', 'plastic'],
  'sf-nail-clipper': { mats: ['metal', 'metal', 'plastic'], mat: 'metal' },

  // ---------- packs/styles-world.ts（含 styles-world/） ----------
  // 中式：红木 / 紫檀色太深，按颜色推断不出木头，要写明
  // [木, 座面编织 / 坐垫, 深色木]
  'sw-cn-guanmao': ['wood', 'fabric', 'wood'],
  'sw-cn-taishi': ['wood', 'fabric', 'wood'],
  'sw-cn-meigui': ['wood', 'fabric', 'wood'],
  'sw-cn-luohan': ['wood', 'fabric', 'wood'],
  'sw-cn-kang': ['wood', 'wood'],
  'sw-cn-qiaotou': ['wood', 'wood', 'wood'],
  'sw-cn-baxian': ['wood', 'wood'],
  'sw-cn-tiaodeng': ['wood', 'wood'],
  'sw-cn-fangji': ['wood', 'wood'],
  // [木, 深色木, 茶盘]；茶具陶瓷
  'sw-cn-chatai': { mats: ['wood', 'wood', 'wood'], mat: 'ceramic' },
  // [木, 深色木, 黄铜]
  'sw-cn-duobao': ['wood', 'wood', 'metal'],
  // [木框, 绢面, 画]
  'sw-cn-screen': ['wood', 'fabric', 'paint'],
  // [木, 绢罩, 流苏]
  'sw-cn-gongdeng': ['wood', 'fabric', 'fabric'],
  'sw-cn-denglong': ['wood', 'fabric', null],
  // [粉墙, 瓦, 木饰边]
  'sw-cn-moongate': ['paint', 'ceramic', 'wood'],
  'sw-cn-dingxiang': ['wood', 'metal', 'wood'],
  // [漆木鼓身, 坐垫, 铜钉]
  'sw-cn-gudeng': ['wood', 'fabric', 'metal'],
  'sw-cn-huaji': ['wood', 'wood'],
  // [被, 床单, 木床架]
  'sw-cn-jiazi': ['bedding', 'bedding', 'wood'],
  // [锦裱, 画心, 轴]
  'sw-cn-zhongtang': { mats: ['fabric', 'paper', 'wood'], mat: 'paper' },
  // [木座, 盆, 山石]
  'sw-cn-penjing': ['wood', 'ceramic', 'stone'],
  'sw-cn-nightstand': ['wood', 'metal', 'wood'],
  'sw-cn-sofa-2': ['wood', 'fabric', 'wood'],
  'sw-cn-sofa-3': ['wood', 'fabric', 'wood'],
  'sw-cn-quanyi-arm': ['wood', 'fabric', 'wood'],
  'sw-cn-chaji': ['wood', 'wood'],
  'sw-cn-tv': ['wood', 'metal', 'wood'],
  'sw-cn-dining': ['wood', 'wood'],
  'sw-cn-round': ['wood', 'wood'],
  'sw-cn-denggua': ['wood', 'fabric', 'wood'],
  'sw-cn-bed-97': ['bedding', 'bedding', 'wood'],
  'sw-cn-bed-120': ['bedding', 'bedding', 'wood'],
  'sw-cn-bed-140': ['bedding', 'bedding', 'wood'],
  'sw-cn-bed-160': ['bedding', 'bedding', 'wood'],
  'sw-cn-wardrobe': ['wood', 'metal', 'wood'],
  'sw-cn-dresser': ['wood', 'metal', 'wood'],
  'sw-cn-desk': ['wood', 'metal', 'wood'],
  'sw-cn-study-chair': ['wood', 'fabric', 'wood'],
  'sw-cn-liangge': ['wood', 'metal', 'wood'],
  'sw-cn-table-lamp': ['wood', 'fabric', null],

  // 欧式古典：描金按金属；白漆 / 胡桃混用的框交给推断
  // [布面, 框, 描金]
  'sw-cl-louis-arm': ['fabric', null, 'metal'],
  'sw-cl-louis-chair': ['fabric', null, 'metal'],
  'sw-cl-recamier': ['fabric', null, 'metal'],
  // [柜身, 台面, 描金]
  'sw-cl-sideboard': [null, null, 'metal'],
  // [柜身, 镜面, 描金]
  'sw-cl-vanity': [null, 'glass', 'metal'],
  // [石材, 壁炉台, 描金]
  'sw-cl-fireplace': { mats: ['stone', 'stone', 'metal'], mat: 'stone' },
  // [金属杆, 灯罩, 水晶]
  'sw-cl-crystal-lamp': ['metal', 'fabric', 'glass'],
  'sw-cl-candle-lamp': ['ceramic', 'fabric', 'metal'],
  'sw-cl-poster-bed': ['bedding', 'bedding', 'wood'],
  // [大理石, 金属脚, 纹理]
  'sw-cl-marble-coffee': ['stone', 'metal', 'stone'],
  'sw-cl-empire': [null, 'metal', null],
  'sw-cl-bench': ['fabric', null, 'metal'],
  'sw-cl-ottoman': ['fabric', null, 'metal'],
  'sw-cl-armoire': [null, null, 'metal'],
  // [金框, 镜面, 点缀]
  'sw-cl-mirror': ['metal', 'glass', null],
  'sw-cl-console': [null, null, 'metal'],
  'sw-cl-pedestal': ['stone', 'metal', 'stone'],
  'sw-cl-nightstand': [null, null, 'metal'],
  // [丝绒, 木脚, 铜钉]
  'sw-cl-chesterfield-2': ['fabric', null, 'metal'],
  'sw-cl-chesterfield-3': ['fabric', null, 'metal'],
  'sw-cl-wingback': ['fabric', null, 'metal'],
  'sw-cl-tv': [null, null, 'metal'],
  'sw-cl-dining-140': ['wood', null, 'metal'],
  'sw-cl-dining-180': ['wood', null, 'metal'],
  'sw-cl-queenanne': ['fabric', null, 'metal'],
  'sw-cl-sleigh-97': ['bedding', 'bedding', 'wood'],
  'sw-cl-sleigh-120': ['bedding', 'bedding', 'wood'],
  'sw-cl-sleigh-140': ['bedding', 'bedding', 'wood'],
  'sw-cl-sleigh-160': ['bedding', 'bedding', 'wood'],
  'sw-cl-dresser': [null, null, 'metal'],
  // [木, 皮面, 描金]
  'sw-cl-desk': [null, 'leather', 'metal'],
  'sw-cl-desk-chair': ['fabric', null, 'metal'],
  // [木, 表盘, 描金]
  'sw-cl-clock': [null, 'paint', 'metal'],
  'sw-cl-console-mirror': [null, null, 'metal'],
  'sw-cl-chandelier-lamp': ['metal', 'fabric', 'glass'],
  'sw-cl-vitrine': [null, null, 'metal'],

  // 农舍
  // [木板, 斜撑, 铁件]
  'sw-fh-barn-door': ['wood', null, 'metal'],
  // [木, 坐垫, 深色木]：扶手椅的默认是布，木框要写明
  'sw-fh-rocker': ['wood', 'fabric', 'wood'],
  // [台面, 底座]
  'sw-fh-table': ['wood', null],
  'sw-fh-bench': ['wood', null],
  'sw-fh-hutch': [null, 'wood', null],
  'sw-fh-iron-bed': ['bedding', 'bedding', 'metal'],
  'sw-fh-quilt-bench': ['wood', 'fabric', 'fabric'],
  // [石砌, 木梁, 炉床]
  'sw-fh-fireplace': { mats: ['stone', 'wood', 'stone'], mat: 'stone' },
  'sw-fh-crate-table': ['wood', 'metal', null],
  // [木梯, 毯子 ×2]
  'sw-fh-ladder': { mats: ['wood', 'fabric', 'fabric'], mat: 'fabric' },
  // [架子, 草编篮, 布]
  'sw-fh-baskets': [null, 'wood', 'fabric'],
  'sw-fh-lantern': ['metal', null, 'metal'],
  'sw-fh-shelf': ['wood', 'metal', 'metal'],
  // [皮面, 铜钉, 木脚]
  'sw-fh-club': ['leather', 'metal', 'wood'],
  'sw-fh-bookcase': [null, null, null],
  'sw-fh-dogbed': ['fabric', 'fabric', null],
  // [木, 草编座面, 深色]
  'sw-fh-xback': ['wood', 'fabric', null],
  'sw-fh-nightstand': ['wood', null, 'metal'],
  'sw-fh-slipcover-2': ['fabric', 'fabric', 'fabric'],
  'sw-fh-slipcover-3': ['fabric', 'fabric', 'fabric'],
  'sw-fh-coffee': ['wood', null],
  'sw-fh-tv': [null, 'wood', 'metal'],
  'sw-fh-trestle': ['wood', null],
  // [彩漆, 木座面, 深色]
  'sw-fh-windsor': ['paint', 'wood', null],
  'sw-fh-bed-97': ['bedding', 'bedding', 'wood'],
  'sw-fh-bed-120': ['bedding', 'bedding', 'wood'],
  'sw-fh-bed-140': ['bedding', 'bedding', 'wood'],
  'sw-fh-bed-160': ['bedding', 'bedding', 'wood'],
  'sw-fh-wardrobe': [null, 'wood', 'metal'],
  'sw-fh-dresser': [null, 'wood', 'metal'],
  'sw-fh-desk': ['wood', null, 'metal'],
  'sw-fh-desk-chair': ['paint', 'wood', null],
  // [陶罐, 灯罩, 点缀]
  'sw-fh-table-lamp': ['ceramic', 'fabric', null],
  'sw-fh-tripod-lamp': ['wood', 'fabric', null],

  // 和风
  'sw-jp-arm-zaisu': ['fabric', null, 'wood'],
  'sw-jp-zataku': ['wood', 'wood', 'wood'],
  // [木, 铁件, 车轮]
  'sw-jp-kuruma': ['wood', 'metal', 'wood'],
  'sw-jp-maru-andon': ['paper', 'wood', 'wood'],
  // [木框, 障子纸, 腰板]
  'sw-jp-shoji': ['wood', 'paper', 'wood'],
  // 置き床：床的标签让默认成了寝具，整件按木
  'sw-jp-okidoko': { mats: ['wood', 'wood', 'paint'], mat: 'wood' },
  // [木, 袄纸门, 深色木]
  'sw-jp-chigaidana': ['wood', 'paper', 'wood'],
  'sw-jp-zafu': ['fabric', 'fabric', 'fabric'],
  // [桐木, 金属环, 深色木]
  'sw-jp-nightstand': ['wood', 'metal', 'wood'],

  // 工业风
  'sw-in-pipe-shelf': ['wood', 'metal', 'metal'],
  // [烤漆柜身, 名牌, 深色件]
  'sw-in-locker': ['paint', 'metal', 'metal'],
  'sw-in-workbench': ['wood', 'metal', 'metal'],
  'sw-in-rivet-chair': ['leather', 'metal', 'metal'],
  // [铁管, 阀门, 灯泡]
  'sw-in-edison': ['metal', 'metal', 'glass'],
  // [烤漆车身, 把手, 轮]；车上的工具金属
  'sw-in-toolcart': { mats: ['paint', 'metal', 'plastic'], mat: 'metal' },
  'sw-in-concrete-side': ['stone', 'metal', 'wood'],
  'sw-in-cart-table': ['wood', 'metal', null],
  // [铁皮柜身, 标签, 木顶]
  'sw-in-nightstand': ['paint', 'paper', 'wood'],

  // ---------- packs/interests.ts（含 interests/） ----------
  // 钢琴：[亮面琴身, 白键, 金属件]
  'int-piano-upright': ['plastic', 'plastic', 'metal'],
  'int-piano-grand': ['plastic', 'plastic', 'metal'],
  // [琴身, 白键, 琴凳垫]
  'int-digital-piano': ['plastic', 'plastic', 'fabric'],
  // [鼓身, 鼓皮, 金属件]
  'int-drum-kit': ['plastic', 'plastic', 'metal'],
  'int-e-drum': ['metal', 'plastic', 'plastic'],
  // [琴盒, 内衬, 琴]
  'int-violin-case': ['plastic', 'fabric', 'wood'],
  'int-violin-stand': ['metal', 'wood', 'wood'],
  'int-cello': ['wood', 'metal', 'wood'],
  // [亮面琴身, 护板, 琴颈]
  'int-e-bass': ['plastic', 'plastic', 'wood'],
  'int-e-guitar-stand': ['plastic', 'plastic', 'wood'],
  'int-e-guitar-wall': ['plastic', 'plastic', 'wood'],
  // [皮面, 网布, 面板]
  'int-guitar-amp': ['leather', 'fabric', 'metal'],
  'int-sax-stand': ['metal', 'metal', 'metal'],
  'int-trumpet': ['metal', 'metal', 'metal'],
  'int-flute': ['plastic', 'fabric', 'metal'],
  'int-clarinet': ['wood', 'metal', 'metal'],
  // [金属盖板, 琴格, 盒]
  'int-harmonica': ['metal', 'plastic', 'paper'],
  // [琴身, 风箱, 金属件]
  'int-accordion': ['plastic', 'paper', 'metal'],
  'int-harp': ['wood', 'metal', 'wood'],
  // [木, 蒙皮, 架]
  'int-shamisen': ['wood', 'leather', 'wood'],
  'int-koto': ['wood', 'plastic', 'wood'],
  'int-taiko': ['wood', 'leather', 'wood'],
  'int-shakuhachi': ['wood', 'wood', null],
  'int-small-instruments': ['plastic', 'plastic', 'plastic'],
  'int-synth': ['plastic', 'plastic', 'plastic'],
  'int-midi-keyboard': ['plastic', 'plastic', 'plastic'],
  // [机身, 唱盘, 点缀]
  'int-dj-deck': ['plastic', 'metal', 'plastic'],
  // [谱架, 乐谱, 墨]
  'int-music-stand': ['metal', 'paper', 'paint'],
  'int-metronome': ['wood', 'paint', 'metal'],
  // 漫画、书：纸
  'int-manga-stack-s': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'int-manga-stack-m': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'int-manga-stack-l': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'int-manga-row': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [柜框, 手办 ×2]
  'int-figure-case': { mats: [null, 'plastic', 'plastic'], mat: 'plastic' },
  // [包, 吧唧（马口铁）, 边]
  'int-ita-bag': ['fabric', 'metal', 'fabric'],
  'int-acrylic-stand': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'int-penlights': { mats: ['plastic', 'plastic', 'plastic'], mat: 'plastic' },
  'int-poster-tubes': ['paper', 'paper', 'plastic'],
  // [球皮, 缝线]
  'int-basketball': ['leather', 'plastic'],
  'int-soccer-ball': ['leather', 'leather'],
  // [拍框, 握把, 网球（绒面）]
  'int-tennis': ['plastic', 'fabric', 'pile'],
  'int-badminton': ['metal', 'fabric', 'fabric'],
  // [手套皮, 球棒, 缝线]
  'int-baseball': ['leather', 'wood', 'fabric'],
  // [板面, 砂纸面, 轮]
  'int-skateboard-flat': ['wood', 'paper', 'plastic'],
  'int-skateboard-stand': ['wood', 'paper', 'plastic'],
  'int-surfboard': ['plastic', 'plastic', 'plastic'],
  'int-snowboard': ['plastic', 'plastic', 'plastic'],
  // [包, 皮饰边, 杆头套]；球杆金属
  'int-golf-bag': { mats: ['fabric', 'leather', 'fabric'], mat: 'metal' },
  'int-boxing-gloves': ['leather', 'leather', 'leather'],
  'int-bike-helmet': ['plastic', 'plastic', 'fabric'],
  // 将棋：[棋盘, 驹, 墨字]
  'int-shogi': ['wood', 'wood', 'paint'],
  'int-shogi-mid': ['wood', 'wood', 'paint'],
  'int-shogi-tsume': ['wood', 'wood', 'paint'],
  'int-shogi-boxed': ['wood', 'wood'],
  // 围棋：[棋盘, 棋罐, 线]；棋子
  'int-go': { mats: ['wood', 'wood', 'paint'], mat: 'ceramic' },
  'int-go-empty': { mats: ['wood', 'wood', 'paint'], mat: 'ceramic' },
  'int-go-opening': { mats: ['wood', 'wood', 'paint'], mat: 'ceramic' },
  'int-go-counting': { mats: ['wood', 'wood', 'paint'], mat: 'ceramic' },
  // 国际象棋：[棋盘框, 白子, 黑子]
  'int-chess': ['wood', 'plastic', 'plastic'],
  'int-chess-opening': ['wood', 'plastic', 'plastic'],
  'int-chess-boxed': ['wood', 'plastic', 'plastic'],
  'int-chess-folded': ['wood', 'plastic', 'plastic'],
  'int-chess-endgame': ['wood', 'plastic', 'plastic'],
  'int-chess-study': ['wood', 'plastic', 'plastic'],
  'int-chess-messy': ['wood', 'plastic', 'plastic'],
  // 麻将：[木框, 台呢, 牌背]；牌面塑料
  'int-mahjong-table': { mats: [null, 'fabric', 'plastic'], mat: 'plastic' },
  'int-mahjong-shuffle': { mats: [null, 'fabric', 'plastic'], mat: 'plastic' },
  'int-mahjong-walls': { mats: [null, 'fabric', 'plastic'], mat: 'plastic' },
  'int-mahjong-win': { mats: [null, 'fabric', 'plastic'], mat: 'plastic' },
  'int-mahjong-case': { mats: [null, 'plastic', null], mat: 'plastic' },
  'int-mahjong-mat-shuffle': { mats: ['fabric', 'plastic'], mat: 'plastic' },
  'int-mahjong-mat-walls': { mats: ['fabric', 'plastic'], mat: 'plastic' },
  // 扑克：[牌垫, 牌背, 筹码]；牌面纸
  'int-poker': { mats: ['fabric', 'paper', 'plastic'], mat: 'paper' },
  'int-poker-boxed': { mats: [null, 'paper', 'plastic'], mat: 'paper' },
  'int-poker-deck': { mats: [null, 'paper', 'plastic'], mat: 'paper' },
  'int-poker-dealing': { mats: ['fabric', 'paper', 'plastic'], mat: 'paper' },
  'int-boardgame-pile': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [篮, 毛线团 ×2]
  'int-knitting': ['wood', 'pile', 'pile'],
  'int-sewing-machine': ['plastic', 'plastic', 'fabric'],
  // [木绷, 布, 绣线]
  'int-embroidery': ['wood', 'fabric', 'fabric'],
  // [毛毡, 墨, 竹笔杆]；宣纸
  'int-calligraphy': { mats: ['fabric', 'paint', 'wood'], mat: 'paper' },
  // [铁盒, 画面色 ×2]
  'int-watercolor': { mats: ['metal', 'paper', 'paper'], mat: 'paper' },
  // [机身, 托盘, 陶土]
  'int-pottery-wheel': ['plastic', 'plastic', 'stone'],
  'int-microscope': ['plastic', 'metal', 'plastic'],
  // [木架, 药液 ×2]
  'int-chem-set': ['wood', 'glass', 'glass'],
  'int-star-chart': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  'int-map-scroll': ['paper', 'paint', 'wood'],
  'int-ref-books': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [唱片封套 ×2, 书挡]
  'int-record-row': { mats: ['paper', 'paper', null], mat: 'paper' },
  'int-vinyl-rack': { mats: [null, 'paper', 'paper'], mat: 'paper' },
  // 奖杯：[底座, 金属杯, 铭牌]
  'int-trophy-cup': [null, 'metal', 'metal'],
  'int-trophy-star': [null, 'metal', 'metal'],
  'int-trophy-column': [null, 'metal', 'metal'],
  // [挂板, 绶带 ×2]；奖牌金属
  'int-medal-rack': { mats: ['metal', 'fabric', 'fabric'], mat: 'metal' },
  // [铁网, 木夹, 串灯]；明信片
  'int-postcard-wall': { mats: ['metal', 'wood', 'plastic'], mat: 'paper' },
  'int-succulent-set': ['wood', 'ceramic', 'plant'],
  // [木盒, 点缀, 衬垫]；矿石
  'int-mineral-box': { mats: ['wood', null, 'fabric'], mat: 'stone' },
  // [瓦楞纸抓板, 逗猫棒, 羽毛]
  'int-cat-toys': ['paper', 'plastic', 'fabric'],
  'int-suitcase-standing': ['plastic', 'plastic', 'paper'],
  'int-suitcase-open': ['plastic', 'fabric', 'fabric'],
  'int-raincoat': ['plastic', 'plastic', 'metal'],
  // 纸箱
  'int-cartons-1': { mats: ['paper'], mat: 'paper' },
  'int-cartons-2': { mats: ['paper'], mat: 'paper' },
  'int-cartons-3': { mats: ['paper'], mat: 'paper' },
  // [零食袋, 盒, 点缀]
  'int-snack-pile': ['plastic', 'paper', null],
  'int-energy-cans': ['metal', 'metal', 'metal'],
  'int-coffee-canisters': ['metal', 'ceramic', 'paper'],
  // 钓竿：[竿, 握把, 渔轮]
  'int-rod-sea': ['plastic', 'plastic', 'metal'],
  'int-rod-lure': ['plastic', 'plastic', 'metal'],
  // 竿包：[包, 拉链, 背带]
  'int-rod-sea-bag': ['fabric', 'metal', 'fabric'],
  'int-rod-lure-bag': ['fabric', 'metal', 'fabric'],
  'int-rod-rack': ['wood', 'plastic', 'metal'],
  // [箱, 扣, 拟饵]
  'int-tackle-box-open': { mats: ['plastic', 'metal', 'plastic'], mat: 'plastic' },
  'int-tackle-box': { mats: ['plastic', 'metal', 'plastic'], mat: 'plastic' },
  'int-fish-cooler': ['plastic', 'plastic', 'plastic'],
  'int-fishing-stool': ['fabric', 'metal'],
  // [竹篓, 盖, 皮带]
  'int-fish-creel': ['wood', 'wood', 'leather'],
  // [杆, 圈, 网]
  'int-landing-net': ['metal', 'metal', 'fabric'],
  // 桌游：纸盒、纸版图
  'int-bgbox-square': { mats: ['paper'], mat: 'paper' },
  'int-bgbox-mid': { mats: ['paper'], mat: 'paper' },
  'int-bgbox-rect': { mats: ['paper'], mat: 'paper' },
  'int-bgbox-card': { mats: ['paper'], mat: 'paper' },
  'int-bgbox-row': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // [海, 点缀, 骰子]
  'int-bg-hex': { mats: ['paper', 'paper', 'plastic'], mat: 'paper' },
  // [版图, 火车 ×2]
  'int-bg-train': { mats: ['paper', 'plastic', 'plastic'], mat: 'paper' },
  // [牌背, 垫]
  'int-card-game': { mats: ['paper', 'fabric'], mat: 'paper' },
  'int-uno-cards': { mats: ['paper', 'fabric'], mat: 'paper' },
  'int-uno-boxed': { mats: ['paper', 'fabric'], mat: 'paper' },
  'int-uno-dealing': { mats: ['paper', 'fabric'], mat: 'paper' },
  // [皮骰盅, 毛毡, 骰子]
  'int-dice-game': ['leather', 'fabric', 'plastic'],
  'int-bg-loop': { mats: ['paper', 'plastic', null], mat: 'paper' },
  'int-bg-mystery': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // 象棋：[棋盘, 红字, 黑字]；木棋子
  'int-xiangqi': ['wood', 'paint', 'paint'],
  'int-xiangqi-mid': ['wood', 'paint', 'paint'],
  'int-xiangqi-end': ['wood', 'paint', 'paint'],
  'int-xiangqi-boxed': ['wood', 'paint', 'paint'],
  // 黑白棋：[棋盘, 黑子, 白子]
  'int-reversi': [null, 'plastic', 'plastic'],
  'int-reversi-opening': [null, 'plastic', 'plastic'],
  'int-reversi-full': [null, 'plastic', 'plastic'],
  'int-reversi-boxed': [null, 'plastic', 'plastic'],
  // 跳棋：[底盘, 星形描画, 点缀]
  'int-chinese-checkers': ['wood', 'paint', null],
  'int-chinese-checkers-playing': ['wood', 'paint', null],
  'int-chinese-checkers-tidy': ['wood', 'paint', null],
  // 双陆棋：[木框, 三角, 棋子]
  'int-backgammon': ['wood', 'paint', 'plastic'],
  'int-backgammon-opening': ['wood', 'paint', 'plastic'],
  'int-backgammon-closed': ['wood', 'paint', 'plastic'],
  // 花札
  'int-hanafuda': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'int-hanafuda-boxed': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'int-hanafuda-stack': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  'int-hanafuda-dealing': { mats: ['paper', 'paper', 'paper'], mat: 'paper' },
  // 歌牌：[榻榻米, 牌边, 墨]
  'int-karuta': { mats: ['fabric', 'paper', 'paint'], mat: 'paper' },
  'int-karuta-boxed': { mats: [null, 'paper', 'paint'], mat: 'paper' },
  'int-karuta-stack': { mats: [null, 'paper', 'paint'], mat: 'paper' },
  // [底垫, 拼图色 ×2]
  'int-jigsaw': { mats: ['fabric', 'paper', 'paper'], mat: 'paper' },
  'int-tangram': ['wood', 'paint', 'paint'],
  'int-burr-puzzle': { mats: ['wood'], mat: 'wood' },
  'int-jenga': { mats: ['wood'], mat: 'wood' },
  'int-jenga-fallen': { mats: ['wood'], mat: 'wood' },
}

export default T
