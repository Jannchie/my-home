// 素材的数据部分：类型、标签表、配色常量和只算数的小工具，不依赖 three.js 的运行时。
// 平面图、一键布置的规则判断只需要这些；kit.ts 原样转出它们，写素材时照旧从 kit 引入。
// AssetMeta 是素材去掉模型构建（build / resize）后的部分：生产构建时 2D 先用它的快照（assetIndex.ts），进 3D 再补上完整素材。

import type * as THREE from 'three'
import type { Tag } from './tags'
import type { Mat } from './matIds'

export type AssetCategory =
  | 'living'
  | 'dining'
  | 'bedroom'
  | 'study'
  | 'kids'
  | 'japanese'
  | 'storage'
  | 'plants'
  | 'lighting'
  | 'tabletop'
  | 'kitchenware'
  | 'toiletry'
  | 'deco'
  | 'pets'
  | 'fitness'
  | 'hobby'
  | 'music'
  | 'entrance'
  | 'outdoor'
  | 'appliance'

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  living: '客厅',
  dining: '餐桌椅',
  bedroom: '卧室',
  study: '书房',
  kids: '儿童',
  japanese: '和风',
  storage: '收纳',
  plants: '绿植',
  lighting: '灯具',
  tabletop: '桌面摆件',
  kitchenware: '厨房餐具',
  toiletry: '洗护',
  deco: '装饰',
  pets: '宠物',
  fitness: '健身',
  hobby: '爱好模型',
  music: '乐器',
  entrance: '玄关',
  outdoor: '阳台',
  appliance: '家电设备',
}

/** 风格标签：配色和造型都可以打 */
export type StyleTag = 'cute' | 'nordic' | 'modern' | 'japanese' | 'industrial' | 'retro' | 'chinese' | 'classic' | 'farmhouse'

export const STYLE_LABELS: Record<StyleTag, string> = {
  cute: '可爱粉彩',
  nordic: '北欧原木',
  modern: '现代简约',
  japanese: '和风',
  industrial: '工业风',
  retro: '复古昭和',
  chinese: '新中式',
  classic: '欧式古典',
  farmhouse: '美式乡村',
}

/**
 * 各风格的参考色板（配色时从这里取，保证同一风格的东西放在一起协调）：
 *   cute       粉彩：C.pink / C.sky / C.mint / C.lemon / C.lilac，浅木 C.woodL
 *   nordic     白 + 浅橡木 + 灰蓝 / 鼠尾草绿，少量芥末黄
 *   modern     炭灰 / 纯白 / 黑，金属银，几乎不用彩色
 *   japanese   原木、榻榻米黄绿、墨色、朱红点缀、和纸白
 *   industrial 黑铁、胡桃木、旧皮革棕、锈橙
 *   retro      芥末黄、青绿、橙、焦糖棕、奶油白（昭和喫茶店）
 *   chinese    红木 / 胡桃深木、朱红漆、墨黑、象牙白、玉绿，黄铜金点缀
 *   classic    象牙白、香槟金、雾蓝、灰绿、酒红丝绒、浅胡桃
 *   farmhouse  做旧白、原木橡木、鼠尾草绿、海军蓝、谷仓红
 */
export const S = {
  nordic: { white: '#f7f5f0', oak: '#d9b98c', oakL: '#ead7b8', gray: '#b9bfc4', blue: '#9fb4c7', sage: '#a9bfa3', mustard: '#e3b549', linen: '#e8e1d4' },
  modern: { char: '#3d3f44', gray: '#8a8d93', light: '#d7d8db', white: '#f4f4f2', black: '#24252a', silver: '#c3c7cc', walnut: '#7a5a43' },
  japanese: { hinoki: '#e9d2a6', wood: '#b88a5a', dark: '#6e4f37', tatami: '#c9cf8e', sumi: '#3e3a39', shu: '#d65a3c', washi: '#f6f0e1', ai: '#3d5a80' },
  industrial: { iron: '#3a3a3c', steel: '#7c8085', walnut: '#7b5236', leather: '#9a5f3a', rust: '#c46a3a', concrete: '#a8a5a0', brick: '#a5543f' },
  retro: { mustard: '#e0a526', teal: '#2f8f8a', orange: '#e2702f', caramel: '#a8683a', cream: '#f4e7c8', olive: '#8c8c3a', red: '#c8473a' },
  chinese: { rosewood: '#6b3a2a', walnut: '#5a3b2a', lacquer: '#b8352b', ink: '#2b2624', ivory: '#f2eadb', jade: '#7fa48f', brass: '#c9a25a', celadon: '#a9c2b0' },
  classic: { ivory: '#f4ede0', gold: '#c8a96a', blue: '#8fa3b8', sage: '#a3ae98', wine: '#7a2e3a', walnut: '#9a7656', cream: '#e9dcc3', navy: '#3b4a66' },
  farmhouse: { white: '#f1ece2', oak: '#b88d5e', sage: '#9caf91', navy: '#34465e', barn: '#9e3b2f', linen: '#e3d8c4', iron: '#3c3a38', butter: '#efd99a' },
}

/**
 * 动态特效发射点，局部坐标（和 build 里的坐标一致）。
 *   steam  ：热气（茶杯、拉面、水壶）白色、上升快、很快散掉
 *   smoke  ：细烟（线香、蚊香）灰白、细长、缓慢飘
 *   mist   ：水雾（香薰机、加湿器）白色、团状、慢慢上升扩散
 *   flame  ：火苗（蜡烛、火钵炭火）橙黄、原地闪烁
 *   bubbles：气泡（鱼缸）从底部升到水面
 * scale 缩放粒子大小和范围（默认 1，约合直径 3cm 的源）；height 是粒子能升多高（cm），气泡用来限定到水面。
 */
export interface Fx {
  kind: 'steam' | 'smoke' | 'mist' | 'flame' | 'bubbles'
  x: number
  y: number
  z: number
  scale?: number
  height?: number
  color?: string
}

/**
 * 可摆放层的类型：shelf = 普通台面 / 层板（默认）；hook = 挂钩、挂杆、洞洞板的挂点，只接受有挂起形态的东西；
 * clip = 显示器 / 电视的顶边（一条很窄的带子），只接受 screenClip 的东西（夹式网络摄像头、条形机顶摄像头），吸到带子正中
 */
export type SurfaceKind = 'shelf' | 'hook' | 'clip'

/**
 * 屏幕面板（显示器、电视、一体机），局部坐标：x / z 为面板底边中点（z 取面板厚度的中心），y 为底边离地高度；
 * w × h 为面板外框，t 为厚度；ry 为面板绕竖轴的转角（three.js rotation.y，双屏两侧往里收）；
 * bow 为曲面屏两端比中间往前凸出的距离。一键布置用它在边框上贴便签、在顶边夹摄像头。
 */
export interface ScreenPanel {
  x: number
  y: number
  z: number
  w: number
  h: number
  t: number
  ry?: number
  bow?: number
}

/** 夹在屏幕顶边上的东西：后脚从顶边往下扣这么多（cm），原点在后脚底端，所以 clip 层比顶边低这么多 */
export const CLIP_DROP = 5

/** 面板上一点（沿面板方向 u、朝前 v）→ 素材局部坐标 [x, z] */
export function screenPoint(s: ScreenPanel, u: number, v: number): [number, number] {
  const ry = s.ry ?? 0
  const c = Math.cos(ry)
  const sn = Math.sin(ry)
  return [s.x + u * c + v * sn, s.z - u * sn + v * c]
}

/**
 * 屏幕顶边的夹挂层：每块面板一条沿面板方向的窄带（宽不超过 32、深 9），y = 顶边 − CLIP_DROP。
 * 多边形按 [左后, 右后, 右前, 左前] 排列：第一条边就是面板方向（snapToClip 用它定朝向）。
 */
export function clipLevels(screens: ScreenPanel[]): NonNullable<AssetDef['surfaces']> {
  return screens.map((s) => {
    const hw = Math.min(s.w / 2 - 2, 16)
    const hd = 4.5
    return { y: s.y + s.h - CLIP_DROP, kind: 'clip' as const, h: 30, shape: [[screenPoint(s, -hw, -hd), screenPoint(s, hw, -hd), screenPoint(s, hw, hd), screenPoint(s, -hw, hd)]] }
  })
}

/**
 * 风车形牌墙的摆位：四条长 L、厚 th 的牌墙围成方框，每条的一端顶着前一条的内侧面（像四个 T 字依次轮转），彼此不重叠；
 * 每条随机歪 2–4°、前后错开一点，端头和相邻牌墙之间留 0.2–0.6 的缝。
 * 返回每条牌墙的中心 [x, z] 和朝向 ry（three.js rotation.y；牌墙本身沿 x 排开、墙面朝 +z）。
 */
export function pinwheelWalls(L: number, th: number, seed: number): { x: number; z: number; ry: number }[] {
  const r = rng(seed)
  const rot = (x: number, z: number, a: number): [number, number] => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]
  const walls = [0, 1, 2, 3].map((k) => {
    const base = (k * Math.PI) / 2
    const tilt = (r() < 0.5 ? -1 : 1) * ((2 + r() * 2) * Math.PI) / 180
    const ry = base + tilt
    // 基准位置：沿自身方向偏 th / 2、离中心 L / 2，再沿法线错开一点
    const [cx, cz] = rot(th / 2, L / 2 + (r() - 0.5) * 1.2, base)
    const u = rot(1, 0, ry)
    const o = rot(0, 1, ry)
    return { cx, cz, ry, u, o, gap: 0.2 + r() * 0.4 }
  })
  // 第 k 条的「起始端」（局部 x = -L/2）顶着第 k-1 条的内侧面：沿自身方向滑动，让端头两角离那个面正好 gap
  // （滑动不改变自己侧面所在的直线，所以各条互不牵连，一次就能算完）
  return walls.map((w, k) => {
    const n = walls[(k + 3) % 4]
    const qx = n.cx - (th / 2) * n.o[0]
    const qz = n.cz - (th / 2) * n.o[1]
    const ends = [-1, 1].map((s) => [w.cx - (L / 2) * w.u[0] + s * (th / 2) * w.o[0], w.cz - (L / 2) * w.u[1] + s * (th / 2) * w.o[1]])
    const d0 = Math.min(...ends.map(([x, z]) => -((x - qx) * n.o[0] + (z - qz) * n.o[1])))
    const k1 = -(w.u[0] * n.o[0] + w.u[1] * n.o[1])
    const s = (w.gap - d0) / k1
    return { x: w.cx + s * w.u[0], z: w.cz + s * w.u[1], ry: w.ry }
  })
}

export type FormTag = 'lying' | 'standing' | 'hanging' | 'folded' | 'closed' | 'open' | 'boxed' | 'stacked'
export const FORM_LABELS: Record<FormTag, string> = {
  lying: '平放',
  standing: '立放',
  hanging: '挂起',
  folded: '叠好',
  closed: '合上',
  open: '打开',
  boxed: '装箱',
  stacked: '叠放',
}

/** 平面多边形，局部坐标 [x, z] */
export type Poly = [number, number][]

/**
 * 一层可摆放面（见 AssetDef.surfaces）。
 *   inside：在柜门里 / 抽屉里（关着门时不能往里放；一键布置只往里收日常用品，开放格子「必须放满」的规则不管它）
 *   glass ：柜门是玻璃的，关着也看得见里面（展示柜、玻璃门食器棚）：仍按展示格对待
 *   slide ：抽屉格，打开时随抽屉往前（+z）拉出这么多 cm；里面的东西跟着抽屉走（cabinet.ts setOpen）
 *   slideX：往侧面拉的抽屉（床侧抽屉）：打开时沿 x 拉出这么多 cm（可以为负）
 */
export interface SurfaceDef {
  y: number
  shape?: Poly[]
  kind?: SurfaceKind
  h?: number
  inside?: boolean
  glass?: boolean
  slide?: number
  slideX?: number
}

/** 素材的数据部分（不含模型构建）：平面图、一键布置的规则、素材库筛选只读这些 */
export interface AssetMeta {
  id: string
  name: string
  category: AssetCategory
  /** 占地宽（x）、深（z）、高（y），cm */
  w: number
  d: number
  h: number
  /** 配色方案：每组是 [主色, 副色, 点缀色]，build 自行取用；第一组是默认 */
  palettes: string[][]
  /** 每组配色的风格（和 palettes 一一对应）；不给就当作 styles[0] 或 cute */
  paletteStyles?: StyleTag[]
  /** 造型本身适合的风格（同一造型换配色能覆盖的风格都写上） */
  styles?: StyleTag[]
  /**
   * 细分类型（一个功能标签，词表见 tags.ts）：「这是什么」。行灯、石灯笼、PH 灯是三件独立的素材，type 都是 floor-lamp。
   * 素材库按它细分筛选；一键布置的换款、灯具池等按它判断。已有素材的值在 typeTable.ts（直接改），新素材直接写。加载时会自动并进 tags，不用在 tags 里重复写。
   */
  type?: Tag
  /**
   * 同款系列：素材库里合成一张卡片的单位，只收「同一造型」——它的不同尺寸（sizeLabel：单人 / 双人、120 / 140）
   * 和不同陈设（form：叠好 / 挂起、打开 / 合上，或 sizeLabel 写的状态：对局中 / 收在盒里）。造型不同的同类物品不要放进同一系列，
   * 它们各自独立、靠 type 归类。没有尺寸 / 陈设之分的不用填（自成一款）。
   */
  series?: string
  /** 一键布置「同款每间一个」的默认分组（不填 = series ?? id）；limit.group 优先 */
  limitGroup?: string
  /** 尺寸 / 款式的显示名（Queen、120、石灯笼…）；陈设状态也可以写在这里（对局中、收在盒里） */
  sizeLabel?: string
  /**
   * 各配色槽的材质（和 palettes 里每组颜色一一对应，mats.ts）：[主色是木, 副色是布, 点缀色是金属] 这样写；
   * 用某一槽颜色（或它 shade 出的深浅色）的零件按这里算，null / 不写的槽走 mats.ts 的推断。写实光照用，卡通光照不看
   */
  mats?: (Mat | null)[]
  /** 整件的默认材质（推断不出来的零件按它）；不填按类型（mats.ts defaultMat） */
  mat?: Mat
  /** 模型上画着跟界面语言走的字（奖状、日用品标签…，见 signLang.ts）：切换语言时重建 */
  lingual?: boolean
  /** 设备类：只在 3D 中代替平面图的设备显示，不能作为家具单独摆放 */
  fixture?: boolean
  /** 壁挂：离地安装高度（cm），build 里自己把模型放到这个高度。不占地面，不参与家具之间的碰撞 */
  mount?: number
  /**
   * 挂在天花板下（吸顶灯、吊灯），值是当哪种房间主灯用（lightFixtures.ts MainKind）：mount 是灯具最低点离地多高。
   * 摆放时在这个高度的水平面上自由移动、不贴墙；墙压低 / 半墙时和房间灯一样淡出。见 packs/ceiling-lights.ts
   */
  ceiling?: 'ceiling' | 'small' | 'pendant'
  /** 顶面高度（cm）：桌、柜、台等，上面可以摆 prop */
  surface?: number
  /** 顶面可摆放的区域（局部坐标多边形，可以多块）；不给就是整个 w × d。L 形、圆形等不规则桌面用 */
  surfaceShape?: Poly[]
  /**
   * 额外的可摆放层（柜内层板、置物架各层、防潮柜隔板…）：y 为离家具底面的高度，shape 为该层可摆区域（默认整个 w × d）。
   * 顶面仍用 surface / surfaceShape；这里只写顶面以外的层。用户对着柜子正面点击时，射线会落到里面的层板上。
   * h 是这一层的净高（到上一层层板底 / 床板底的距离）：比它高的东西放不进去，避免穿模。床底收纳就是 y = 0 附近、h ≈ 床底净空的一层。
   */
  surfaces?: SurfaceDef[]
  /**
   * 可开合：有柜门 / 抽屉的柜子。模型里会动的部件（门扇、抽屉、翻门）用 movable() 标出开合动作，
   * 家具的 open 状态决定它们摆成开着还是关着（poseDoors），同一件素材、同一个 id，切换时里面的东西不动。
   * 门里的层板 / 挂杆 / 抽屉格照常写在 surfaces 里并标 inside；关着门时东西还在，只是被门挡住。
   */
  openable?: boolean
  /**
   * 形态：同一系列（series）里的不同摆法（平放 / 立放 / 挂起 / 叠好 / 合上 / 装箱）。
   * 放到挂钩层（kind: 'hook'）上时自动换成同系列的 'hanging' 形态；从挂钩拿到台面上时换回非挂起的形态。
   * 挂起形态的模型挂在原点下方（原点 = 挂钩位置，模型的 y 为负），其余形态原点在底面。
   */
  form?: FormTag
  /**
   * 一键布置时同类东西最多摆几个：house 全屋 / room 每个房间 / surface 每个台面。
   * 不填按 decorate.ts 里的通用规则（电饭煲全屋一个、台灯每张桌一个、书和绿植不限…）。手动摆放不受限制。
   */
  limit?: { scope: 'house' | 'room' | 'surface'; max: number; group?: string }
  /** 形态的显示名，覆盖通用的 FORM_LABELS（如投影仪的 open 显示成「投影中」） */
  formLabel?: string
  /** 桌面摆件：可以摆在别的家具顶面上，也可以直接放地上 */
  prop?: boolean
  /**
   * 贴附物（冰箱贴、便签、照片、海报、贴纸）：可以贴在任何物体的竖直表面上（冰箱门、柜门、墙），
   * 会按表面朝向贴平。原点在背面中心，模型向 +z 伸出、在 y 方向上下居中。
   */
  stick?: boolean
  /**
   * 仅挂起形态（form 'hanging'）：模型前后（z）方向的中心离挂钩（原点）多远，往前为正（cm）。
   * 挂件大多挂在钩子 / 横杆前面往前垂，不在原点居中；占位、避让按这个中心算。离线实测（dims.generated.ts 的 HANG_Z），加载时写入
   */
  hangZ?: number
  /** 动态特效发射点（蒸汽、烟、火苗、气泡…），由 fx.ts 实时渲染粒子；不要再用静态网格去画烟雾 */
  fx?: Fx[]
  /** 会在沙盘预览里活动的角色（宠物、扫地机器人、Kachaka），见 actors.ts */
  actor?: ActorSpec
  /** 屏幕面板（显示器、电视、一体机）：一键布置在边框上贴便签、在顶边夹摄像头用。见 ScreenPanel */
  screens?: ScreenPanel[]
  /** 夹在屏幕顶边上的东西（夹式网络摄像头、条形机顶摄像头）：只能放到 kind 'clip' 的层上，原点在后脚底端（见 CLIP_DROP） */
  screenClip?: boolean
  /**
   * 语义标签（词表见 tags.ts）：一键布置、检查清单、兴趣、灯光等业务规则只按标签判断「这是什么、能放哪」，不看名字。
   * 新素材直接在这里写；已有素材的标签在 tagTable.ts（直接改），加载时合并。
   */
  tags?: Tag[]
  /** 素材自己声明了 resize(w, d)（加载时由 assets.ts 标上；元数据快照里没有函数，靠它记住可调宽深） */
  ownResize?: boolean
  /** 派生配色的探针结果（只在元数据快照里有，完整素材现场 build 探测，见 paletteProbe.ts） */
  slotProbe?: SlotProbe[]
}

/** 完整素材：数据 + 模型构建 */
export interface AssetDef extends AssetMeta {
  build: (p: string[]) => THREE.Group
  /**
   * 按任意宽深重新搭模型（resize.ts）：给了就用它代替通用的分区拉伸，返回要覆盖的字段（build、surfaces…）。
   * 结构规整、件数随宽度变的（柜门扇数、抽屉列数）写这个
   */
  resize?: (w: number, d: number) => Partial<AssetDef>
}

/**
 * 活动角色声明：
 *   role 'body'：这件素材本身就是角色（猫、狗、单独摆的扫地机器人、Kachaka 套装）；预览时它离开原位在家里活动。
 *   role 'home'：角色的窝 / 充电座（猫窝、狗窝、扫地机器人基站）；预览时会有一只角色住在这里。
 * 模型里 userData.actorPart = true 的子树是「会跑开的部分」（基站上的机器人、Kachaka 和它驮的架子），
 * 预览时隐藏、由活动的角色代替，座子留在原地；没有标记且 role 为 body 的，整件隐藏。
 * breed：外观（见 critters.ts 的 BREEDS）；dock：没有 actorPart 的窝里，角色趴的位置（局部坐标 [x, y, z]，y 为垫子高度）。
 * drone（无人机，breed 见 robots-actors.ts 的 DRONES）：从停机坪 / 摆放处起飞，在房间上空巡航后回来降落；
 * robopet（机器狗、陪伴 / 送餐 / 管家 / 人形机器人，breed 见 ROBO_BREEDS）：home 是它的充电座。
 */
export interface ActorSpec {
  kind: 'cat' | 'dog' | 'rabbit' | 'vacuum' | 'kachaka' | 'drone' | 'robopet'
  role: 'body' | 'home'
  breed?: string
  dock?: [number, number, number]
}

export const C = {
  white: '#fbf7f1',
  cream: '#fff1dc',
  wood: '#e7bf93',
  woodD: '#bf8b5e',
  woodL: '#f3dcbc',
  ink: '#5a4646',
  steel: '#d9dee6',
  pink: '#ffb6c8',
  sakura: '#ffd6e0',
  mint: '#a6e3cc',
  sky: '#a8d4f4',
  lemon: '#ffe08f',
  lilac: '#cfb8f3',
  peach: '#ffc6a0',
  leaf: '#78c47a',
  leafD: '#4f9e5b',
  red: '#ff8f86',
  orange: '#ffa64d',
  glass: '#bfe6ff',
  lamp: '#fff2b8',
}

/** 小型确定性随机数：书脊颜色之类，每次生成一致 */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------- 顶面形状 ----------

export const rectPoly = (x0: number, z0: number, x1: number, z1: number): Poly => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

/** 圆 / 椭圆顶面 */
export function ellipsePoly(rx: number, rz = rx, cx = 0, cz = 0, n = 24): Poly {
  return Array.from({ length: n }, (_, i): [number, number] => {
    const a = (i / n) * Math.PI * 2
    return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]
  })
}

/**
 * L 形顶面：占地 w × d，两条臂的宽度 armX（沿 x 的那条臂的进深）、armZ（沿 z 的那条臂的宽度）。
 * corner 指缺角以外的拐角在哪：'left' = 长臂靠背面、短臂在左侧往前伸。
 */
export function lPoly(w: number, d: number, armX: number, armZ: number, corner: 'left' | 'right' = 'left'): Poly {
  const x0 = -w / 2
  const x1 = w / 2
  const z0 = -d / 2
  const z1 = d / 2
  const pts: Poly =
    corner === 'left'
      ? [
          [x0, z0],
          [x1, z0],
          [x1, z0 + armX],
          [x0 + armZ, z0 + armX],
          [x0 + armZ, z1],
          [x0, z1],
        ]
      : [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x1 - armZ, z1],
          [x1 - armZ, z0 + armX],
          [x0, z0 + armX],
        ]
  return pts
}

/** 挂在墙上 / 贴在表面上的东西（壁挂物、贴附物；吸顶灯 / 吊灯不算）：贴墙摆、沿墙挪、选中框立在正面 */
export const isWallMounted = (d: Pick<AssetDef, 'mount' | 'stick' | 'ceiling'>) => (d.mount !== undefined || !!d.stick) && !d.ceiling

/** keep = 保持原色（发光 / 玻璃 / 只进贴图）；share = 该槽占模型的面积比例 */
export interface SlotProbe {
  keep: boolean
  share: number
}
