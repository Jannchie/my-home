// 素材制作工具箱：所有素材包（assets.ts、packs/*.ts）共用的类型、配色和小部件。
//
// 约定（写新素材前必读）：
//   - 单位 cm。局部坐标原点在占地中心的地面上：宽沿 x，进深沿 z，高沿 y。
//   - 背面（贴墙一侧）朝 -z，正面朝 +z。rbox / cyl / cup 等的 at.y 是底面高度，ball / torus 的 at.y 是中心。
//   - 描边由 addOutlines 统一加，build 里不用管；不想描边的小贴片设 userData.noOutline = true。
//   - 不要让两个面在同一平面上重叠（会闪烁）：贴在表面上的东西至少浮出 0.3cm，或者整体嵌进去。
//   - 容器（杯、碗、花盆、桶、箱）用 cup / tray 做成空心，里面的东西放在口沿以下。
//   - 只有玩偶、角色类才加 face()，家具和日用品不要加脸。
//   - 桌、柜等可以在上面摆东西的家具：本体保持空的，声明 surface（顶面高度），
//     不规则顶面再给 surfaceShape；桌上的东西做成独立的 prop 素材。

import * as THREE from 'three'
import { cyl, rbox, shade, toon, useAnisotropy } from './toon'
import { syncMatrix } from './matrices'
import { G } from './geo'
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

export interface AssetDef {
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
   * 素材库按它细分筛选；一键布置的换款、灯具池等按它判断。已有素材的值在 taxonomy.generated.ts，新素材直接写。
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
  build: (p: string[]) => THREE.Group
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
   * 新素材直接在这里写；已有素材的初始标签在 tags.generated.ts，加载时合并。
   */
  tags?: Tag[]
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

/** 把若干对象放进一个新 Group（实现在 geo.ts，这里转出，老代码照旧从 kit 引入） */
export { G }

/** 竖直的屏幕 / 发光面板：用很薄的圆角盒，正面朝 +z */
export function glow(w: number, h: number, color: string, at: { x?: number; y: number; z: number; rx?: number; ry?: number }, k = 0.55) {
  const m = rbox(w, h, 0.6, color, at, 0.3)
  m.material = toon(color, { emissive: k })
  m.userData.noOutline = true
  return m
}

/** 四条腿 */
export function legs(w: number, d: number, h: number, color: string, r = 2.2, inset = 6, round = true) {
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const at = { x: sx * (w / 2 - inset), z: sz * (d / 2 - inset) }
      g.add(round ? cyl(r, r * 0.8, h, color, at, 12) : rbox(r * 2, h, r * 2, color, at, 0.6))
    }
  return g
}

/** 一根两端已知的细杆 */
export function rod(ax: number, ay: number, bx: number, by: number, r: number, color: string, z = 0) {
  const len = Math.hypot(bx - ax, by - ay)
  const m = cyl(r, r, len, color, {}, 8)
  m.position.set((ax + bx) / 2, (ay + by) / 2, z)
  m.rotation.z = Math.atan2(-(bx - ax), by - ay)
  return m
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

/** 按多边形挤出一块板（桌面、台面）：底面在 y，厚 t，带一点倒角（倒角往里收，轮廓不超出多边形） */
export function slab(poly: Poly, t: number, color: THREE.ColorRepresentation, y = 0) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const bevel = Math.min(1, t * 0.25)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2 })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, bevel, 0)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.y = y
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ---------- 真开口：带洞的板、空心外壳 ----------

/**
 * 洞的形状（板的局部坐标：x 以板中心为 0，y 以板底为 0）
 *   circle：圆心 (x, y)，半径 r
 *   rect  ：底边中点 (x, y)，宽 w 高 h，圆角 r
 *   arch  ：底边中点 (x, y)，宽 w 高 h，顶部是半圆（狗窝门、猫窝入口）
 */
export type Hole =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { kind: 'arch'; x: number; y: number; w: number; h: number }

function holePath(h: Hole) {
  const p = new THREE.Path()
  if (h.kind === 'circle') {
    p.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true)
  } else if (h.kind === 'arch') {
    const r = h.w / 2
    const top = h.y + Math.max(h.h - r, 0)
    p.moveTo(h.x - r, h.y)
    p.lineTo(h.x - r, top)
    p.absarc(h.x, top, r, Math.PI, 0, true)
    p.lineTo(h.x + r, h.y)
    p.lineTo(h.x - r, h.y)
  } else {
    const r = Math.min(h.r ?? 2, h.w / 2, h.h / 2)
    const x0 = h.x - h.w / 2
    const x1 = h.x + h.w / 2
    const y0 = h.y
    const y1 = h.y + h.h
    p.moveTo(x0 + r, y0)
    p.absarc(x0 + r, y0 + r, r, -Math.PI / 2, -Math.PI, true)
    p.lineTo(x0, y1 - r)
    p.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true)
    p.lineTo(x1 - r, y1)
    p.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true)
    p.lineTo(x1, y0 + r)
    p.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true)
  }
  return p
}

/**
 * 带洞的板：在 xy 平面里，宽 w（x 居中）、高 h（底边在 y = 0）、厚 t（z 居中），可以开多个真正透光的洞。
 * at 和 rbox 一样：at.y 是底面；ry 转 90° 就能当侧板用。
 */
export function holePanel(w: number, h: number, t: number, color: THREE.ColorRepresentation, holes: Hole[] = [], at: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number } = {}, corner = 1.5) {
  const r = Math.min(corner, w / 2, h / 2)
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, 0)
  s.lineTo(w / 2 - r, 0)
  s.quadraticCurveTo(w / 2, 0, w / 2, r)
  s.lineTo(w / 2, h - r)
  s.quadraticCurveTo(w / 2, h, w / 2 - r, h)
  s.lineTo(-w / 2 + r, h)
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - r)
  s.lineTo(-w / 2, r)
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0)
  for (const hole of holes) s.holes.push(holePath(hole))
  const bevel = Math.min(0.4, t * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 16 })
  geo.translate(0, 0, -t / 2 + bevel)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 空心外壳：外尺寸 w × h × d、壁厚 t，原点在底面中心。每个面可以开洞（洞坐标用该面自己的局部坐标，从外面看）。
 * top / bottom 为 false 时不封顶 / 不封底（盒子、花箱、猫砂盆盆体）。
 */
export function shell(
  w: number,
  h: number,
  d: number,
  t: number,
  color: THREE.ColorRepresentation,
  opts: { front?: Hole[]; back?: Hole[]; left?: Hole[]; right?: Hole[]; top?: boolean; bottom?: boolean } = {},
) {
  const g = new THREE.Group()
  const y0 = opts.bottom === false ? 0 : t
  const ih = h - y0 - (opts.top === false ? 0 : t)
  // 前后板盖住全宽，左右板夹在中间
  g.add(holePanel(w, ih, t, color, (opts.front ?? []).map((o) => ({ ...o, y: o.y - y0 })), { y: y0, z: d / 2 - t / 2 }))
  g.add(holePanel(w, ih, t, color, (opts.back ?? []).map((o) => ({ ...o, x: -o.x, y: o.y - y0 })), { y: y0, z: -d / 2 + t / 2, ry: Math.PI }))
  g.add(holePanel(d - t * 2, ih, t, color, (opts.right ?? []).map((o) => ({ ...o, y: o.y - y0 })), { x: w / 2 - t / 2, y: y0, ry: Math.PI / 2 }))
  g.add(holePanel(d - t * 2, ih, t, color, (opts.left ?? []).map((o) => ({ ...o, y: o.y - y0 })), { x: -w / 2 + t / 2, y: y0, ry: -Math.PI / 2 }))
  if (opts.bottom !== false) g.add(rbox(w, t, d, color, {}, Math.min(t * 0.4, 1)))
  if (opts.top !== false) g.add(rbox(w, t, d, color, { y: h - t }, Math.min(t * 0.4, 1)))
  return g
}

// ---------- 画面：相框里的照片、挂画、屏幕画面 ----------

const paintCache = new Map<string, THREE.CanvasTexture>()

/**
 * 画布面板：在 w × h（cm）的竖直面板上用 Canvas 作画，正面朝 +z，at.y 为底边。
 * 画面天然被裁在面板范围内，不会像拼贴小网格那样溢出画框。key 相同的画面共用贴图。
 * emissive > 0 时自发光（屏幕）。不描边。
 */
export function paintPanel(
  w: number,
  h: number,
  key: string,
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
  at: { x?: number; y?: number; z?: number; rx?: number; ry?: number } = {},
  emissive = 0,
) {
  const pxPerCm = Math.min(12, 512 / Math.max(w, h))
  const W = Math.max(16, Math.round(w * pxPerCm))
  const H = Math.max(16, Math.round(h * pxPerCm))
  const k = `${key}|${W}x${H}`
  let tex = paintCache.get(k)
  if (!tex) {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    draw(cv.getContext('2d')!, W, H)
    tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    useAnisotropy(tex)
    paintCache.set(k, tex)
  }
  const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0)
  const mat = new THREE.MeshToonMaterial({ map: tex, color: '#ffffff', gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap })
  if (emissive > 0) {
    mat.emissive = new THREE.Color('#ffffff')
    mat.emissiveMap = tex
    mat.emissiveIntensity = emissive
  }
  const m = new THREE.Mesh(geo, mat)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, 0)
  m.userData.noOutline = true
  m.receiveShadow = true
  return m
}

/** 现成的画：风景（天空、远山、近山、太阳、云） */
export function paintLandscape(sky: string, hill: string, sun: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    g.fillStyle = sun
    g.beginPath()
    g.arc(W * 0.72, H * 0.3, Math.min(W, H) * 0.12, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    for (const [x, y, r] of [
      [0.2, 0.22, 0.07],
      [0.28, 0.2, 0.09],
      [0.36, 0.23, 0.06],
    ]) {
      g.beginPath()
      g.arc(W * x, H * y, Math.min(W, H) * r, 0, Math.PI * 2)
      g.fill()
    }
    const mountain = (cx: number, top: number, half: number, color: string) => {
      g.fillStyle = color
      g.beginPath()
      g.moveTo(W * (cx - half), H)
      g.lineTo(W * cx, H * top)
      g.lineTo(W * (cx + half), H)
      g.closePath()
      g.fill()
    }
    mountain(0.32, 0.38, 0.5, shade(hill, 0.18))
    mountain(0.78, 0.55, 0.45, hill)
    // 雪顶
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(W * 0.32, H * 0.38)
    g.lineTo(W * (0.32 - 0.1), H * (0.38 + 0.124))
    g.lineTo(W * (0.32 + 0.1), H * (0.38 + 0.124))
    g.closePath()
    g.fill()
  }
}

/** 现成的画：一枝花 */
export function paintFlower(ground: string, petal: string, center: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    const cx = W / 2
    const cy = H * 0.35
    const r = Math.min(W, H) * 0.11
    g.strokeStyle = '#4f9e5b'
    g.lineWidth = Math.max(2, W * 0.03)
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx, H * 0.86)
    g.stroke()
    g.fillStyle = '#78c47a'
    for (const s of [-1, 1]) {
      g.beginPath()
      g.ellipse(cx + s * W * 0.1, H * 0.6, W * 0.11, H * 0.035, -s * 0.5, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = petal
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2
      g.beginPath()
      g.arc(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2, r, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = center
    g.beginPath()
    g.arc(cx, cy, r * 0.75, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = shade(ground, -0.12)
    g.fillRect(cx - W * 0.16, H * 0.82, W * 0.32, H * 0.12)
  }
}

/** 现成的画：几何抽象（大圆 + 色块 + 横线） */
export function paintAbstract(ground: string, a: string, line: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    g.fillStyle = a
    g.beginPath()
    g.arc(W * 0.36, H * 0.42, Math.min(W, H) * 0.26, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = shade(a, -0.25)
    g.fillRect(W * 0.58, H * 0.3, W * 0.24, H * 0.55)
    g.fillStyle = line
    g.fillRect(W * 0.12, H * 0.74, W * 0.6, Math.max(2, H * 0.035))
    g.fillStyle = shade(a, 0.2)
    g.beginPath()
    g.arc(W * 0.8, H * 0.18, Math.min(W, H) * 0.07, 0, Math.PI * 2)
    g.fill()
  }
}

// ---------- 柜门、抽屉：可开合的部件 ----------

/**
 * 开合动作（挂在门扇 / 抽屉的 Group 的 userData.door 上，poseDoors 按家具的 open 状态摆）：
 *   swing ：平开门，绕 Group 原点的竖轴转 angle 弧度（three.js rotation.y 的增量；铰链在左、门往 +x 伸的，往外开是负角）
 *   slide ：推拉门，沿 x 平移 dx
 *   drawer：抽屉，沿 +z 拉出 dz
 *   flap  ：翻门 / 翻斗，绕 Group 原点的横轴转 angle 弧度（rotation.x 的增量；底边铰链往外翻是正角）
 */
export type DoorMotion = { kind: 'swing'; angle: number } | { kind: 'slide'; dx: number } | { kind: 'drawer'; dz: number } | { kind: 'flap'; angle: number }

/** 把一个部件标成会动的（门扇、抽屉…）。部件本身的 position / rotation 是关着时的位姿 */
export function movable<T extends THREE.Object3D>(o: T, m: DoorMotion): T {
  o.userData.door = m
  return o
}

/** 挂在墙上 / 贴在表面上的东西（壁挂物、贴附物；吸顶灯 / 吊灯不算）：贴墙摆、沿墙挪、选中框立在正面 */
export const isWallMounted = (d: Pick<AssetDef, 'mount' | 'stick' | 'ceiling'>) => (d.mount !== undefined || !!d.stick) && !d.ceiling

/** 按开 / 关摆好模型里所有会动的部件（可以反复调用，不会累积） */
export function poseDoors(root: THREE.Object3D, open: boolean) {
  for (const o of doorParts(root)) poseDoor(o, open ? 1 : 0)
}

/** 模型里会动的部件（门扇、抽屉…），按遍历顺序：同一件素材的模型顺序固定，下标可以当部件的编号 */
export function doorParts(root: THREE.Object3D) {
  const out: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.userData.door) out.push(o)
  })
  return out
}

/** 把一个会动的部件摆到开合程度 open（0 = 关着，1 = 开到底，中间按比例） */
export function poseDoor(o: THREE.Object3D, open: number) {
  const m = o.userData.door as DoorMotion
  const base = (o.userData.doorBase ??= { p: o.position.clone(), r: o.rotation.clone() }) as { p: THREE.Vector3; r: THREE.Euler }
  o.position.copy(base.p)
  o.rotation.copy(base.r)
  if (m.kind === 'swing') o.rotation.y += m.angle * open
  else if (m.kind === 'flap') o.rotation.x += m.angle * open
  else if (m.kind === 'slide') o.position.x += m.dx * open
  else o.position.z += m.dz * open
  // 静态矩阵（freezeMatrices）的模型也要跟着变
  if (!o.matrixAutoUpdate) syncMatrix(o)
}

/** 模型里会动的部件个数 */
export function countDoors(root: THREE.Object3D) {
  let n = 0
  root.traverse((o) => {
    if (o.userData.door) n++
  })
  return n
}

/** 平开门开到多少度（弧度）：约 100°，门扇转到柜子侧面外，里面看得清 */
export const SWING_OPEN = (100 * Math.PI) / 180

/**
 * 柜体（正面敞开的箱子）：背板、两侧、顶板、底板，外尺寸 w × h × d，板厚 t，原点在底面中心、正面朝 +z。
 * base 为踢脚 / 底座高度（底板抬到 base 上，下面是一块缩进的踢脚板）。门、抽屉另外做，层板用 shelvesIn。
 */
export function carcass(w: number, h: number, d: number, color: string, opts: { t?: number; base?: number; plinth?: string; back?: string; top?: boolean } = {}) {
  const t = opts.t ?? 1.8
  const base = opts.base ?? 0
  const g = new THREE.Group()
  g.add(rbox(w - t * 2, h - base - t, t, opts.back ?? shade(color, -0.04), { y: base, z: -d / 2 + t / 2 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(t, h, d, color, { x: (s * (w - t)) / 2 }, 0.3))
  if (opts.top !== false) g.add(rbox(w - t * 2 + 0.01, t, d, color, { y: h - t }, 0.3))
  g.add(rbox(w - t * 2, t, d - t, color, { y: base, z: t / 2 }, 0.3))
  if (base > 0) g.add(rbox(w - t * 2, base, d - 4, opts.plinth ?? shade(color, -0.12), { z: -1 }, 0.3))
  return g
}

/** 柜内层板：每个 y 是层板顶面高度（= surfaces 的 y），柜体外宽 w、外深 d，侧板厚 t */
export function shelvesIn(w: number, d: number, ys: number[], color: string, t = 1.8, th = 1.6) {
  const g = new THREE.Group()
  for (const y of ys) g.add(rbox(w - t * 2 - 0.2, th, d - t - 0.6, color, { y: y - th, z: t / 2 - 0.3 }, 0.3))
  return g
}

/** 柜内一根挂衣杆（两端杆座）：x0..x1、杆中心高 y、进深位置 z */
export function hangingPipe(x0: number, x1: number, y: number, z: number, color = '#d9dee6', r = 1.4) {
  const g = new THREE.Group()
  const pipe = cyl(r, r, x1 - x0, color, {}, 14)
  pipe.position.set((x0 + x1) / 2, y, z)
  pipe.rotation.z = Math.PI / 2
  g.add(pipe)
  for (const x of [x0 + 0.5, x1 - 0.5]) {
    const seat = cyl(r + 0.8, r + 0.8, 1, color, {}, 12)
    seat.position.set(x, y, z)
    seat.rotation.z = Math.PI / 2
    g.add(seat)
  }
  return g
}

/**
 * 挂衣杆的挂钩层（和 surface.ts 里旧内置收纳的写法一致）：挂点带沿杆、窄窄一条，钩环内顶搭在杆顶。
 * clear 为杆下净空（衣服长度上限）。
 */
export function pipeHook(x0: number, x1: number, y: number, z: number, clear: number, r = 1.4): SurfaceDef {
  return { y: y + r + 0.45, kind: 'hook', inside: true, h: clear, shape: [rectPoly(x0 + 2, z - 1.7, x1 - 2, z + 1.3)] }
}

/**
 * 平开门扇：门洞 x0..x1 × y0..y1，门板正面在 z（门板厚 th，背面贴着柜体正面）。
 * hinge 为铰链在哪一侧，把手在另一侧。panel 可以换成别的门板做法（玻璃、格栅…）：参数为门板宽高，
 * 返回的部件以门板中心底边为原点（x 居中、y 从 0 起、z 居中）。返回已标好 swing 动作的 Group（原点在铰链线上）。
 */
export function hingedDoor(o: {
  x0: number
  x1: number
  y0: number
  y1: number
  z: number
  hinge: 'left' | 'right'
  color: string
  th?: number
  gap?: number
  knob?: string | false
  knobY?: number
  angle?: number
  panel?: (w: number, h: number) => THREE.Object3D[]
}) {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const left = o.hinge === 'left'
  const leaf = new THREE.Group()
  const inner = new THREE.Group()
  for (const m of o.panel ? o.panel(w, h) : [rbox(w, h, th, o.color, {}, 0.5)]) inner.add(m)
  if (o.knob !== false) {
    // 把手：高柜在离地 95 左右，矮柜在门的上部
    const kh = Math.min(10, h * 0.3)
    const ky = o.knobY ?? (o.y1 > 120 ? Math.min(Math.max(95 - o.y0, kh), h - kh - 2) : h - kh - Math.min(4, h * 0.15))
    inner.add(rbox(1.2, kh, 1.4, o.knob ?? '#c9ced6', { x: (left ? 1 : -1) * (w / 2 - 3), y: ky, z: th / 2 + 0.7 }, 0.4))
  }
  inner.position.set(left ? w / 2 : -w / 2, 0, 0)
  leaf.add(inner)
  leaf.position.set(left ? o.x0 + gap : o.x1 - gap, o.y0 + gap, o.z - th / 2)
  return movable(leaf, { kind: 'swing', angle: (left ? -1 : 1) * (o.angle ?? SWING_OPEN) })
}

/** 一排平开门：门洞 x0..x1 均分成 n 扇（默认每扇约 45 宽），左半边铰链在左、右半边在右（单扇铰链在 hinge 侧） */
export function doorRow(o: Omit<Parameters<typeof hingedDoor>[0], 'hinge'> & { n?: number; hinge?: 'left' | 'right' }) {
  const n = o.n ?? Math.max(1, Math.round((o.x1 - o.x0) / 45))
  const g = new THREE.Group()
  const dw = (o.x1 - o.x0) / n
  for (let i = 0; i < n; i++) {
    const hinge: 'left' | 'right' = n === 1 ? (o.hinge ?? 'left') : i < n / 2 ? 'left' : 'right'
    g.add(hingedDoor({ ...o, x0: o.x0 + dw * i, x1: o.x0 + dw * (i + 1), hinge }))
  }
  return g
}

/**
 * 翻门（上翻 / 下翻）：门洞 x0..x1 × y0..y1，门板正面在 z。hinge 'bottom' = 底边铰链往前放倒（电视柜翻门、写字台），
 * 'top' = 顶边铰链往上掀（吊柜上翻门）。
 */
export function flapDoor(o: { x0: number; x1: number; y0: number; y1: number; z: number; color: string; hinge: 'bottom' | 'top'; th?: number; gap?: number; knob?: string | false; angle?: number }) {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const g = new THREE.Group()
  const bottom = o.hinge === 'bottom'
  const panel = rbox(w, h, th, o.color, { y: bottom ? 0 : -h }, 0.5)
  g.add(panel)
  if (o.knob !== false) g.add(rbox(Math.min(12, w * 0.3), 1.2, 1.4, o.knob ?? '#c9ced6', { y: bottom ? h - 4 : -h + 3, z: th / 2 + 0.7 }, 0.4))
  g.position.set((o.x0 + o.x1) / 2, bottom ? o.y0 + gap : o.y1 - gap, o.z - th / 2)
  // 下翻放平（约 85°），上翻掀到 75° 左右
  return movable(g, { kind: 'flap', angle: bottom ? (o.angle ?? (85 * Math.PI) / 180) : -(o.angle ?? (75 * Math.PI) / 180) })
}

/**
 * 抽屉：抽屉口 x0..x1 × y0..y1，面板正面在 z，抽屉盒深 depth（往 -z）。打开时拉出 pull（默认 depth 的 0.6）。
 * 返回 Group（标好 drawer 动作）。抽屉格的 surfaces 用 drawerLevel 生成。
 */
export function drawerBox(o: { x0: number; x1: number; y0: number; y1: number; z: number; depth: number; color: string; inner?: string; th?: number; gap?: number; knob?: string | false; pull?: number; front?: (w: number, h: number) => THREE.Object3D[] }) {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const g = new THREE.Group()
  const inner = o.inner ?? shade(o.color, 0.06)
  for (const m of o.front ? o.front(w, h) : [rbox(w, h, th, o.color, { z: -th / 2 }, 0.5)]) g.add(m)
  // 抽屉盒：底板、两侧、后板（比面板矮一点）
  const bh = Math.max(2, h - 3)
  const bw = w - 2
  const bd = o.depth - th - 1
  g.add(rbox(bw, 1, bd, inner, { y: DRAWER_FLOOR - 1, z: -th - bd / 2 }, 0.2))
  for (const s of [-1, 1]) g.add(rbox(1, bh, bd, inner, { x: (s * (bw - 1)) / 2, y: DRAWER_FLOOR - 1, z: -th - bd / 2 }, 0.2))
  g.add(rbox(bw - 2, bh, 1, inner, { y: DRAWER_FLOOR - 1, z: -th - bd + 0.5 }, 0.2))
  if (o.knob !== false) g.add(rbox(Math.min(10, w * 0.3), 1.2, 1.4, o.knob ?? '#c9ced6', { y: Math.max(1, h / 2 - 0.6), z: 0.7 }, 0.4))
  g.position.set((o.x0 + o.x1) / 2, o.y0 + gap, o.z)
  return movable(g, { kind: 'drawer', dz: o.pull ?? drawerPull(o.depth) })
}

/** 抽屉默认拉出多少 */
export const drawerPull = (depth: number) => Math.round(depth * 0.6)

/** 抽屉盒内底面离抽屉面板底边的高度（drawerBox 的底板顶面） */
export const DRAWER_FLOOR = 2

/**
 * 抽屉格的可摆放层：和 drawerBox 同样的参数，返回关着时的位置（surfaces 里的 y、shape），打开时按 slide 往前移。
 */
export function drawerLevel(o: { x0: number; x1: number; y0: number; y1: number; z: number; depth: number; th?: number; gap?: number; pull?: number }): SurfaceDef {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const bw = w - 2
  const bd = o.depth - th - 1
  const cx = (o.x0 + o.x1) / 2
  return { y: o.y0 + gap + DRAWER_FLOOR, h: Math.max(2, h - 3), inside: true, slide: o.pull ?? drawerPull(o.depth), shape: [rectPoly(cx - bw / 2 + 1.2, o.z - th - bd + 1.2, cx + bw / 2 - 1.2, o.z - th - 0.2)] }
}

/**
 * 推拉门：门洞 x0..x1 × y0..y1 均分成 n 扇，前后两条轨道交错（偶数扇在前轨 z，奇数扇在后轨）。
 * 打开时前轨的门推到相邻后轨门的正前方（露出一半柜内）。
 */
export function slidingDoors(o: { x0: number; x1: number; y0: number; y1: number; z: number; color: string; n?: number; th?: number; panel?: (w: number, h: number) => THREE.Object3D[]; pull?: string | false }) {
  const n = o.n ?? 2
  const th = o.th ?? 1.8
  const g = new THREE.Group()
  const dw = (o.x1 - o.x0) / n
  const h = o.y1 - o.y0 - 0.6
  for (let i = 0; i < n; i++) {
    const front = i % 2 === 0
    // 相邻两扇在中间重叠 1.5cm
    const w = dw + 1.5
    const leaf = new THREE.Group()
    for (const m of o.panel ? o.panel(w, h) : [rbox(w, h, th, o.color, {}, 0.5)]) leaf.add(m)
    // 凹槽拉手（靠近和相邻门交错的一侧）
    if (o.pull !== false) leaf.add(rbox(1.6, Math.min(16, h * 0.4), 0.6, o.pull ?? shade(o.color, -0.25), { x: (front ? 1 : -1) * (w / 2 - 4), y: Math.max(1, Math.min(h / 2, 100 - o.y0) - 8), z: th / 2 + 0.1 }, 0.3))
    const cx = o.x0 + dw * (i + 0.5)
    leaf.position.set(Math.min(Math.max(cx, o.x0 + w / 2), o.x1 - w / 2), o.y0 + 0.3, o.z - th / 2 - (front ? 0 : th + 0.4))
    // 前轨的门往右边那扇推（最后一扇往左）
    const dir = i < n - 1 ? 1 : -1
    g.add(front ? movable(leaf, { kind: 'slide', dx: dir * dw }) : leaf)
  }
  return g
}
