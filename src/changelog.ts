// 更新日志：应用内「更新日志」面板与 GitHub Release 说明的共同来源（scripts/release-notes.mjs 从这里生成）。
// 最新的版本放最前面；第一条的 version 必须和 package.json 一致（test/changelog.spec.ts 检查）。
// 界面只显示当前语言的那一份。
import type { Lang } from './i18n'

export interface Release {
  version: string
  /** YYYY-MM-DD */
  date: string
  notes: Record<Lang, string[]>
}

export const CHANGELOG: Release[] = [
  {
    version: '1.2.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '内置收纳改为"收纳位 + 柜子"：柜子是普通家具，新增 43 款鞋柜、衣柜、食品柜，按尺寸放进收纳位',
        '素材库里 160 多款带门或抽屉的柜子都能打开，门里、抽屉里可以收纳东西；一键布置会往柜子里放衣物、鞋、碗盘、食品等日常用品，兴趣物件和收藏品留在外面',
        '一键布置的穿模大幅减少：不再嵌进墙里、不挡门和落地窗，墙上挂的东西、垂下的毛巾和窗帘不再插进下方的家具',
        '空调不再和衣柜、冰箱等高家具重叠',
        '3D 场景新增透视调节，可在接近等距视图和较强的近大远小之间切换',
        '修正伞架、月亮椅、刷牙杯等模型内部的零件穿插',
      ],
      ja: [
        '造り付け収納を「収納スペース + 家具」に変更。新しい靴箱・ワードローブ・パントリー 43 点をサイズに合わせて配置',
        '扉や引き出しのある家具 160 点以上を開けられるように。中に物を収納できます。おまかせ配置では衣類・靴・食器・食品などの日用品を中にしまい、趣味の物やコレクションは外に飾ります',
        'おまかせ配置のめり込みを大幅に削減：壁にめり込まない、ドアや掃き出し窓をふさがない、壁掛け・タオル・カーテンが下の家具に刺さらない',
        'エアコンがワードローブや冷蔵庫などの背の高い家具と重ならないように',
        '3D 表示にパース（画角）の調整を追加。平行投影に近い見え方から遠近感の強い見え方まで',
        '傘立て、ムーンチェア、歯ブラシコップなどモデル内部の部品のめり込みを修正',
      ],
      en: [
        'Built-in storage is now a storage spot plus a cabinet: cabinets are regular furniture, with 43 new shoe cabinets, wardrobes and pantries sized to fit',
        'Over 160 cabinets with doors or drawers can be opened and used for storage. Auto-furnish stores everyday items such as clothes, shoes, dishes and food inside, and keeps hobby items and collections on display',
        'Far fewer collisions when furnishing: nothing sinks into walls or blocks doors and balcony doors, and wall-mounted items, hanging towels and curtains no longer cut into furniture below',
        'Wall air conditioners no longer overlap wardrobes, fridges or other tall furniture',
        'Adjustable perspective in 3D, from nearly isometric to strong perspective',
        'Fixed parts clipping through each other inside models such as the umbrella stand, moon chair and toothbrush cups',
      ],
    },
  },
  {
    version: '1.1.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '各风格新增 76 款落地灯、台灯和壁灯；天花板主灯随房间风格变化',
        '新增宠物摄像头、婴儿监视器、安防摄像头和可视门铃；新增军旗、斗兽棋、花札、双陆等 30 余种棋牌',
        '重做猫、狗和兔子的模型',
        '素材库可按细分类型筛选；不同造型不再合并在同一张卡片里',
        '平面图、3D、素材库有独立地址；户型（可含家具）可以生成链接分享',
        '柜子和内置收纳先选中容器本身，选中后半透明显示内部；内置收纳可在 3D 中开关柜门',
        '拖动家具需要先选中或拖过一段距离；指南针移到右上角',
        '地板、墙纸等贴图启用各向异性过滤；墙面边饰不再闪烁',
        '手机：顶栏放随机生成按钮，适配 iPhone 主屏幕应用的安全区',
        '修正按名称误判素材导致的布置错误，例如竹编灯被当作绿植',
      ],
      ja: [
        '各スタイルにフロアライト・テーブルランプ・壁付け照明を 76 点追加。天井照明は部屋のスタイルに合わせて変わります',
        'ペットカメラ、ベビーモニター、防犯カメラ、テレビドアホンを追加。軍棋、闘獣棋、花札、バックギャモンなどゲーム類を 30 点以上追加',
        '猫・犬・うさぎのモデルを作り直し',
        '素材ライブラリを種類で絞り込めるように。形の違う家具は別々のカードに',
        '間取り図・3D・素材ライブラリにそれぞれ URL を追加。間取り（家具込みも可）をリンクで共有可能に',
        '棚や収納はまず本体を選択し、選択中は半透明で中が見えるように。造り付け収納は 3D で扉を開け閉めできます',
        '家具は選択してから、または一定距離ドラッグしてから動くように。方位磁針を右上へ',
        '床や壁紙のテクスチャに異方性フィルタリングを適用。壁の見切り材のちらつきを修正',
        'スマホ：ヘッダーにランダム生成ボタンを配置。iPhone のホーム画面アプリのセーフエリアに対応',
        '名前で素材を判定していたことによる配置ミスを修正（竹編みランプが植物扱いされる など）',
      ],
      en: [
        '76 new floor, table and wall lamps across all styles; ceiling lights now match the room style',
        'Pet cameras, baby monitors, security cameras and video doorbells; 30+ new board and card games such as junqi, animal chess, hanafuda and backgammon',
        'Rebuilt cats, dogs and rabbits',
        'Filter the asset library by type; different designs no longer share one card',
        'Plan, 3D and library each have their own URL; share a plan (optionally with furniture) as a link',
        'Shelves and built-in storage select the container first and turn translucent to show what is inside; open and close built-in storage doors in 3D',
        'Furniture moves only after it is selected or dragged far enough; the compass moved to the top right',
        'Anisotropic filtering for floor, wallpaper and fabric textures; wall trims no longer flicker',
        'Mobile: random generate in the header; safe areas in the iPhone home-screen app',
        'Fixed furnishing mistakes caused by matching assets by name, such as a bamboo lamp treated as a plant',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-10-16',
    notes: {
      zh: [
        '首个版本',
        '日式、中式、欧美户型生成，也可以手绘户型',
        '按住户的家庭构成、风格偏好和兴趣等级一键布置家具',
        '2800+ 件素材、9 种风格配色',
        '3D 沙盘：墙体显示模式、按时间与城市计算的日照、室内灯光、画面效果、会走动的宠物和机器人',
        '支持触屏和离线使用；中文、日文、英文界面',
      ],
      ja: [
        '最初のリリース',
        '日本・中国・欧米の間取りを生成。手描きにも対応',
        '家族構成・好みのスタイル・趣味のレベルに合わせて家具をおまかせ配置',
        '2800 点以上の素材、9 種類のスタイル配色',
        '3D ジオラマ：壁の表示モード、時刻と都市による日照、室内照明、画面エフェクト、歩き回るペットとロボット',
        'タッチ操作とオフラインに対応。日本語・中国語・英語',
      ],
      en: [
        'First release',
        'Japanese, Chinese and Western floor plan generators, or draw your own',
        'Furnish every room from the household: family makeup, style taste and hobby levels',
        '2,800+ assets, 9 style palettes',
        '3D diorama: wall display modes, sunlight by time and city, room lighting, visual effects, wandering pets and robots',
        'Touch and offline support; Chinese, Japanese and English UI',
      ],
    },
  },
]

/** 当前版本（更新日志第一条） */
export const APP_VERSION = CHANGELOG[0].version
