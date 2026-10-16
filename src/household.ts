// 住户设定：先推算这套房子住着怎样一户人家（家庭构成、每个人的年龄 / 职业 / 性格 / 兴趣），
// 再据此决定统一的装修风格、房间分配和每个房间里放什么。

import { area, type Plan } from './model'
import { ASSETS, type AssetCategory, type AssetDef, type StyleTag } from './three/assets'
import { rng } from './three/kit'
import { t } from './i18n'

export type Role = 'self' | 'partner' | 'child' | 'elder' | 'roommate'

export interface Member {
  id: string
  name: string
  role: Role
  age: number
  job: JobId
  traits: TraitId[]
  interests: InterestId[]
  /**
   * 各兴趣的投入程度 Lv.1–4（没写的按 Lv.1）：等级越高，相关的东西越多越专业——
   * 例如数码 Lv.1 一台台式机、Lv.2 高端 RGB 主机、Lv.3 服务器机柜 / NAS、Lv.4 人形机器人。见 INTEREST_TIERS。
   */
  levels?: Partial<Record<InterestId, Lv>>
  /** 这个人的房间用什么风格（孩子、合租室友可以和全家不同） */
  style: StyleTag
}

export interface Household {
  kind: 'single' | 'couple' | 'family' | 'three-gen' | 'roommates'
  members: Member[]
  /** 全家公共空间的主风格 */
  style: StyleTag
  /** 东西多少：0.5 极简 ~ 1.6 堆满 */
  clutter: number
  seed: number
}

export const KIND_LABELS: Record<Household['kind'], string> = {
  single: '独居',
  couple: '二人世界',
  family: '核心家庭',
  'three-gen': '三代同堂',
  roommates: '合租',
}

export const ROLE_LABELS: Record<Role, string> = { self: '户主', partner: '伴侣', child: '孩子', elder: '长辈', roommate: '室友' }

// ---------- 性格 ----------

export type TraitId = 'tidy' | 'messy' | 'minimal' | 'collector' | 'nostalgic' | 'traditional' | 'rational' | 'natural' | 'maker' | 'cutie' | 'homebody' | 'active'

export const TRAITS: Record<TraitId, { label: string; style?: StyleTag; clutter?: number }> = {
  tidy: { label: '爱整洁', clutter: 0.75 },
  messy: { label: '随性', clutter: 1.35 },
  minimal: { label: '极简', style: 'modern', clutter: 0.6 },
  collector: { label: '收藏癖', clutter: 1.5 },
  nostalgic: { label: '怀旧', style: 'retro' },
  traditional: { label: '传统', style: 'japanese' },
  rational: { label: '理性', style: 'modern' },
  natural: { label: '自然派', style: 'nordic' },
  maker: { label: '动手派', style: 'industrial' },
  cutie: { label: '可爱控', style: 'cute' },
  homebody: { label: '宅家', clutter: 1.15 },
  active: { label: '好动' },
}

// ---------- 兴趣：对应的家具（落地）、摆件（桌柜上）、壁挂 ----------

/** 素材匹配：按分类和 `id 名称` 上的关键词 */
interface Matcher {
  cats?: AssetCategory[]
  re?: RegExp
}

export type InterestId =
  | 'gaming'
  | 'music'
  | 'reading'
  | 'otaku'
  | 'fitness'
  | 'photo'
  | 'cooking'
  | 'plants'
  | 'crafts'
  | 'models'
  | 'tea'
  | 'cats'
  | 'dogs'
  | 'aquarium'
  | 'smallpets'
  | 'birds'
  | 'coffee'
  | 'streaming'
  | 'tech'
  | 'sports'
  | 'science'
  | 'beauty'
  | 'boardgames'
  | 'collecting'
  | 'movies'
  | 'fishing'
  | 'outdoor'
  | 'maker'
  | 'puzzles'

export const INTERESTS: Record<InterestId, { label: string; floor?: Matcher; props?: Matcher; wall?: Matcher; style?: StyleTag }> = {
  gaming: { label: '游戏', props: { re: /pad-|handheld|gameboy|game-console|headset|arcade|vr\b|手柄|掌机|耳麦/ }, floor: { re: /电竞椅|gaming/ } },
  music: { label: '音乐', floor: { cats: ['music'] }, props: { cats: ['music'], re: /metronome|节拍|口琴|harmonica|谱|turntable|唱片机/ }, wall: { re: /吉他|guitar/ } },
  reading: { label: '读书', props: { re: /book|书(?!架|柜|桌)/ }, floor: { re: /bookshelf|bookcase|书架|书柜/ } },
  otaku: { label: '动漫', props: { re: /漫画|manga|figure|手办|立牌|应援|gacha|扭蛋/ }, floor: { re: /展示柜|showcase|display/ } },
  fitness: { label: '健身', floor: { cats: ['fitness'] }, props: { cats: ['fitness'] } },
  // 防潮柜、相机展示柜只按等级摆（Lv.3 起，见 INTEREST_TIERS），随机池里只有三脚架
  photo: { label: '摄影', floor: { re: /tripod|三脚架/ }, props: { re: /camera|lens|相机|镜头|拍立得/ } },
  cooking: { label: '料理', props: { cats: ['kitchenware'] } },
  plants: { label: '园艺', floor: { cats: ['plants'] }, props: { re: /gd-|succulent|cactus|air-plant|bonsai|多肉|盆栽|仙人掌|花瓶|浇水壶|花盆/ }, style: 'nordic' },
  crafts: { label: '手作', props: { re: /毛线|缝纫|刺绣|书法|水彩|陶艺|knit|sew|embroid|paint/ }, floor: { re: /easel|画架|缝纫/ } },
  models: { label: '模型', props: { re: /模型|train|plane|铁道|飞机|高达|gunpla|3d.?print|打印机/ } },
  tea: { label: '茶道', props: { re: /tea|茶|incense|线香|daruma|达摩|tetsubin|铁壶/ }, floor: { cats: ['japanese'] }, style: 'japanese' },
  cats: { label: '养猫', floor: { re: /cat-|猫爬|猫窝|猫砂/ }, props: { re: /cat|猫/ } },
  // 机器狗（rb-）不算养狗
  dogs: { label: '养狗', floor: { re: /^(?!rb-).*(dog|狗)/ } },
  aquarium: { label: '水族', floor: { re: /aquarium|水族|鱼缸/ } },
  // 小动物 / 鸟的笼子在 packs/pet-habitats.ts，带 limit（全屋各一只），所以落地和台面的笼子合起来只会摆一个
  smallpets: { label: '养小动物', floor: { re: /ph-(hamster-(cage|castle)|rabbit|guinea|chinchilla)/ }, props: { re: /ph-hamster-(cage|acrylic|castle)/ } },
  birds: { label: '养鸟', floor: { re: /ph-birdcage/ }, props: { re: /ph-birdcage|ph-bird-perch/ } },
  coffee: { label: '咖啡', props: { re: /coffee|espresso|moka|pour-over|grinder|磨豆|咖啡/ } },
  streaming: { label: '直播', props: { re: /mic-|webcam|stream|capture|audio-interface|声卡|麦克风|补光/ }, floor: { re: /ring-light-floor|softbox|green-screen|绿幕|柔光/ } },
  tech: { label: '数码', props: { re: /kb-|monitor|nas|mini-pc|router|显示器|键盘|NAS/ }, floor: { re: /pc-(mid|full|itx)|server|机箱|机柜/ }, style: 'industrial' },
  sports: { label: '运动', props: { re: /ball|球|racket|(?<![航自])拍|glove|手套|helmet|头盔/ }, floor: { re: /surf|冲浪|golf|高尔夫|bike|自行车|skate|滑板|ski|滑雪/ } },
  science: { label: '天文科学', props: { re: /telescope|望远镜|microscope|显微镜|globe|地球仪|星图|flask|烧瓶|矿石/ }, floor: { re: /telescope|望远镜/ } },
  beauty: { label: '美妆', props: { cats: ['toiletry'] }, floor: { re: /mirror|镜|vanity|梳妆|clothes-rail|挂衣/ } },
  // 麻将桌 / 棋桌按地区由 Decorator.specialties 成套摆（桌子 + 座位 + 台面上的牌 / 棋盘），随机池里只有台面摆件；
  // 棋罐要成对摆在棋盘边，不进随机池
  boardgames: { label: '桌游棋牌', props: { re: /^(?!hg-go-bowl)(?=.*(桌游|棋|麻将|花札|かるた|扑克|骰|board-?game|chess|shogi|mahjong|jenga|叠叠乐|卡牌))(?!.*棋桌)/ } },
  collecting: { label: '收藏', props: { re: /col-|瓷|矿石|晶|化石|硬币|邮票|coin|stamp|mineral|赏盘|茶碗/ }, floor: { re: /陈列柜|博古架|curio/ }, style: 'retro' },
  movies: { label: '电影', props: { re: /av-|投影|CD|dvd|蓝光|vhs|卡带|cassette|boombox|爆米花|海报/ }, floor: { re: /幕布|projector|家庭影院|soundbar|回音壁|落地音箱|hifi/i } },
  fishing: { label: '钓鱼', floor: { re: /钓|fishing/ }, props: { re: /渔具|拟饵|tackle|鱼篓/ } },
  outdoor: { label: '户外登山', floor: { re: /gr-.*(tent|pack|bag)|帐篷|登山包|露营|camp|ski|滑雪/ }, props: { re: /gr-|登山|攀岩|露营|头灯|carabiner|harness|trekking|球(?!鞋)/ } },
  maker: { label: '电子手工', floor: { re: /mk-.*(bench|cabinet|chest)|工作台|工具柜|元件柜/ }, props: { re: /mk-|pcb|arduino|开发板|面包板|烙铁|示波器|万用表|solder|oscillo|multimeter/i }, style: 'industrial' },
  // 收藏展示架、计时器垫按等级单独摆（INTEREST_TIERS），随机池里不放
  puzzles: { label: '益智', props: { re: /^(pz-(?!cube-shelf|speed-timer)|prop-rubiks)/ } },
}

// ---------- 兴趣等级：Lv.1 入门 → Lv.4 骨灰级，每级在上一级基础上再加东西 ----------

export type Lv = 1 | 2 | 3 | 4
export const LV_LABELS: Record<Lv, string> = { 1: '入门', 2: '爱好者', 3: '发烧友', 4: '骨灰级' }

/**
 * 每一级新增的东西（按 id / 名字正则，各挑一件）：floor 落地靠墙、props 台面摆件、wall 壁挂。
 * room：这一级想要一整间专用房（有空房时优先分给它）。没列的兴趣只按通用匹配撒东西，件数随等级增加。
 */
export interface Tier {
  floor?: RegExp[]
  props?: RegExp[]
  wall?: RegExp[]
  room?: boolean
}
export const INTEREST_TIERS: Partial<Record<InterestId, Tier[]>> = {
  tech: [
    { floor: [/^of-pc-(mid-plain|itx)$/], props: [/^of-kb-(tkl|60)/] },
    { floor: [/^of-pc-(mid|full)$/], props: [/^of-monitor-gaming$/] },
    { floor: [/^of-server-rack$/], props: [/^of-nas-/] },
    { floor: [/^rb-humanoid/], props: [/^rb-arm$/], room: true },
  ],
  // 相机多了才有柜子：Lv.3 小防潮柜 + 相机展示柜（摆满机身和镜头），Lv.4 大防潮柜
  photo: [
    { props: [/^of-camera-(mirrorless|instant)$/, /^of-lens-(pancake|35)$/] },
    { props: [/^of-camera-dslr$/, /^of-lens-(2470|wide)$/] },
    { floor: [/^of-camera-showcase$/, /^of-dry-(30|50)$/], props: [/^of-lens-(70200|macro)$/, /^of-camera-film$/] },
    { floor: [/^of-dry-(100|160)$/], props: [/^rb-drone-aerial$/, /^rb-gimbal$/], room: true },
  ],
  streaming: [
    { props: [/^of-mic-(condenser|dynamic)$/, /^of-tv-camera$/] },
    { props: [/^of-audio-interface$/, /^of-ring-light$/, /^of-mic-boom$/] },
    { floor: [/^of-green-screen$/, /^of-softbox$/], wall: [/^hg-acoustic$/] },
    { floor: [/^of-ring-light-floor$/], props: [/^rb-drone-(mini|fpv)$/], room: true },
  ],
  gaming: [
    { props: [/game-console|pad-|手柄/] },
    { props: [/^of-(gaming-headset|headset-stand-rgb)$/, /^of-kb-.*-rgb$/] },
    { floor: [/^of-pc-(mid|full)$/], props: [/^of-monitor-gaming$/, /^of-mousepad-rgb$/], wall: [/^hg-hex-lights$/] },
    { floor: [/^of-pc-full$/, /展示柜|showcase/], room: true },
  ],
  boardgames: [
    { props: [/^int-(poker|mahjong-case)/] },
    { props: [/^(hg-go-board|int-(chess|xiangqi|shogi)(-|$))/, /^int-mahjong-mat/] },
    // Lv.3 的牌桌 / 棋桌按地区单独摆（Decorator.specialties），这里只多撒几样
    { props: [/^(int-boardgame|int-chess|hg-go-board)/] },
    { room: true },
  ],
  music: [
    { props: [/metronome|节拍|谱/] },
    { floor: [/^(?!.*(piano|钢琴)).*(guitar|吉他|keyboard|电子琴|ukulele|尤克里里)/] },
    { wall: [/吉他|guitar/, /^hg-acoustic$/] },
    { floor: [/piano|钢琴|drum|鼓/], room: true },
  ],
  fitness: [
    { props: [/dumbbell|哑铃|yoga|瑜伽/] },
    { floor: [/yoga-mat|瑜伽垫|kettlebell|壶铃/] },
    { floor: [/treadmill|跑步机|bike|单车|bench|卧推|rack/] },
    { floor: [/power-rack|深蹲|rowing|划船/], room: true },
  ],
  reading: [
    { props: [/book|书(?!架|柜|桌)/] },
    { floor: [/bookshelf|bookcase|书架|书柜/] },
    { floor: [/bookshelf|bookcase|书架|书柜/, /armchair|单人沙发|阅读椅|摇椅/] },
    { room: true },
  ],
  otaku: [
    { props: [/漫画|manga|figure|手办|立牌/] },
    { props: [/^int-figure-case$|gacha|扭蛋/] },
    { floor: [/^col-lit-showcase$|展示柜|showcase/] },
    { wall: [/^col-wall-showcase$/], room: true },
  ],
  collecting: [
    { props: [/col-|硬币|邮票|coin|stamp/] },
    { props: [/col-|矿石|化石|mineral/] },
    { floor: [/陈列柜|博古架|curio|^col-lit-showcase$/] },
    { wall: [/^col-wall-showcase$/], room: true },
  ],
  puzzles: [
    { props: [/^(prop-rubiks-cube|pz-cube-3)$/] },
    { props: [/^pz-(luban|nine-rings|huarong|tangram|hanoi)/] },
    { props: [/^pz-cube-stand$/, /^pz-speed-timer$/] },
    { props: [/^pz-cube-shelf$/, /^pz-(megaminx|pyraminx|mirror)$/] },
  ],
}

/** 会拿奖的兴趣：等级 ≥ 3 时可能有奖杯、奖牌、证书 */
export const COMPETITIVE: InterestId[] = ['sports', 'fitness', 'music', 'boardgames', 'gaming', 'science', 'photo', 'outdoor', 'fishing', 'crafts', 'puzzles', 'cooking', 'reading']

/** 这个人在某个兴趣上的等级（没有这个兴趣 → 0） */
export function levelOf(m: Member, it: InterestId): 0 | Lv {
  return m.interests.includes(it) ? (m.levels?.[it] ?? 1) : 0
}
/** 全家在某个兴趣上的最高等级 */
export function topLevel(hh: Household | undefined, it: InterestId): 0 | Lv {
  return (hh?.members.reduce<number>((a, m) => Math.max(a, levelOf(m, it)), 0) ?? 0) as 0 | Lv
}

/** 户型能容下的最高等级：小户型放不下 Lv.4 的整间游戏室 / 机柜 */
export function levelCap(plan: Plan): Lv {
  const m2 = plan.rooms.reduce((sum, r) => sum + (r.kind === 'balcony' ? 0 : area(r.points)), 0) / 10000
  const n = plan.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
  return m2 < 35 || n < 1 ? 2 : m2 < 55 || n < 2 ? 3 : 4
}

/**
 * 推算一个人各兴趣的等级（用确定性哈希，不消耗住户生成的随机序列）：
 *   基础 1–4（越高越少见）；职业对口 +1；收藏癖 +1、极简 −1；长辈的茶道 / 园艺 / 棋牌 +1；
 *   小孩最多 Lv.2、少年最多 Lv.3；最后受户型上限约束。
 */
function levelsFor(m: Member, seed: number, idx: number, cap: Lv): Partial<Record<InterestId, Lv>> {
  const out: Partial<Record<InterestId, Lv>> = {}
  m.interests.forEach((it, k) => {
    const h = hash01(seed, 1000 + idx * 37 + k)
    let lv = h < 0.36 ? 1 : h < 0.7 ? 2 : h < 0.92 ? 3 : 4
    if (JOBS[m.job].interests?.includes(it)) lv++
    if (m.traits.includes('collector')) lv++
    if (m.traits.includes('minimal')) lv--
    if (m.age >= 65 && (it === 'tea' || it === 'plants' || it === 'boardgames')) lv++
    const ageCap = m.age < 10 ? 2 : m.age < 16 ? 3 : 4
    out[it] = Math.max(1, Math.min(lv, ageCap, cap)) as Lv
  })
  return out
}

// ---------- 职业：决定工作台和额外兴趣 ----------

export type JobId = 'engineer' | 'office' | 'programmer' | 'designer' | 'streamer' | 'photographer' | 'musician' | 'chef' | 'student' | 'teacher' | 'nurse' | 'researcher' | 'retired' | 'preschool' | 'schoolkid'

export const JOBS: Record<JobId, { label: string; wfh: boolean; interests?: InterestId[]; desk?: RegExp }> = {
  office: { label: '公司职员', wfh: false },
  programmer: { label: '程序员', wfh: true, interests: ['tech', 'gaming', 'coffee'], desk: /monitor|kb-|mouse/ },
  designer: { label: '设计师', wfh: true, interests: ['crafts', 'reading'], desk: /tablet|monitor|pen/ },
  streamer: { label: '主播', wfh: true, interests: ['streaming', 'gaming'], desk: /mic-|webcam|monitor|stream/ },
  photographer: { label: '摄影师', wfh: true, interests: ['photo'], desk: /camera|lens|monitor/ },
  musician: { label: '音乐人', wfh: true, interests: ['music'], desk: /audio-interface|mixer|monitor|synth|midi/ },
  chef: { label: '厨师', wfh: false, interests: ['cooking', 'coffee'] },
  student: { label: '大学生', wfh: false, interests: ['reading'], desk: /laptop|book/ },
  teacher: { label: '教师', wfh: false, interests: ['reading'] },
  nurse: { label: '护士', wfh: false },
  researcher: { label: '研究员', wfh: true, interests: ['science', 'reading'], desk: /monitor|book|microscope/ },
  engineer: { label: '硬件工程师', wfh: true, interests: ['maker', 'tech'], desk: /mk-|monitor|oscillo|示波器|烙铁|pcb/ },
  retired: { label: '退休', wfh: false, interests: ['tea', 'plants'] },
  preschool: { label: '学龄前', wfh: false },
  schoolkid: { label: '学生', wfh: false, interests: ['reading'], desk: /book|pen|lamp/ },
}

const NAMES = ['陽', '葵', '蒼', '凛', '湊', '結', '晴', '碧', '律', '澪', '樹', '楓', '光', '遥', '空', '真琴', '千尋', '和泉', '薫', '透', '渚', '悠', '暁', '環']
/** 中式 / 欧美户型的住户名字 */
const CN_NAMES = ['子涵', '浩然', '欣怡', '雨桐', '梓轩', '思远', '一诺', '佳怡', '宇航', '诗涵', '俊杰', '晓雯', '嘉怡', '明轩', '若曦', '天佑', '婉清', '志强', '秀英', '建国', '丽华', '文博', '可欣', '书瑶']
const WEST_NAMES = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Mia', 'Lucas', 'Chloe', 'James', 'Grace', 'Henry', 'Lily', 'Jack', 'Ella', 'Owen', 'Zoe', 'Leo', 'Ruth', 'Walter', 'Nora', 'Frank']
/** 按地区偏向的装修风格：中式多为新中式 / 现代 / 北欧；欧美多为欧式古典 / 美式乡村 / 现代 / 工业 / 北欧 */
const REGION_STYLES: Record<'cn' | 'west', StyleTag[]> = {
  cn: ['chinese', 'chinese', 'chinese', 'modern', 'modern', 'nordic', 'nordic'],
  west: ['classic', 'classic', 'farmhouse', 'farmhouse', 'modern', 'modern', 'industrial', 'nordic'],
}
/** 不消耗随机数的确定性小哈希（0..1），用来在不打乱既有随机序列的前提下微调风格 */
const hash01 = (seed: number, k: number) => {
  let h = (Math.imul(seed | 0, 2654435761) ^ Math.imul(k + 1, 40503)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

type Rand = () => number
const pick = <T,>(rand: Rand, xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
function pickN<T>(rand: Rand, xs: readonly T[], n: number): T[] {
  const pool = [...xs]
  const out: T[] = []
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  return out
}

const ADULT_JOBS: JobId[] = ['office', 'office', 'programmer', 'engineer', 'designer', 'streamer', 'photographer', 'musician', 'chef', 'teacher', 'nurse', 'researcher']
const ALL_INTERESTS = Object.keys(INTERESTS) as InterestId[]
const KID_INTERESTS: InterestId[] = ['gaming', 'otaku', 'sports', 'reading', 'models', 'music', 'crafts', 'science', 'boardgames', 'smallpets', 'puzzles']
const STYLE_TRAITS: TraitId[] = ['minimal', 'nostalgic', 'traditional', 'rational', 'natural', 'maker', 'cutie']
const MOOD_TRAITS: TraitId[] = ['tidy', 'messy', 'collector', 'homebody', 'active']

/** 一个人的设定 */
function person(rand: Rand, role: Role, age: number, used: Set<string>, names: readonly string[] = NAMES): Member {
  let name = pick(rand, names)
  for (let i = 0; i < 6 && used.has(name); i++) name = pick(rand, names)
  used.add(name)
  const job: JobId = age < 6 ? 'preschool' : age < 18 ? 'schoolkid' : age < 23 && rand() < 0.6 ? 'student' : age >= 65 ? 'retired' : pick(rand, ADULT_JOBS)
  const traits: TraitId[] = [pick(rand, STYLE_TRAITS), pick(rand, MOOD_TRAITS)]
  if (age >= 65 && rand() < 0.6) traits[0] = 'traditional'
  if (age < 12) traits[0] = 'cutie'
  const base = JOBS[job].interests ?? []
  const pool = age < 18 ? KID_INTERESTS : ALL_INTERESTS
  const extra = pickN(rand, pool.filter((i) => !base.includes(i)), age < 6 ? 1 : 2)
  const interests = [...new Set([...base.slice(0, 2), ...extra])].slice(0, 3)
  const style = TRAITS[traits[0]].style ?? INTERESTS[interests[0]]?.style ?? 'cute'
  return { id: `m${used.size}`, name, role, age, job, traits, interests, style }
}

/** 居室数（洋室 + 和室） */
const bedrooms = (plan: Plan) => plan.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length

/**
 * 按户型推算住户：
 *   1 室 → 多半独居，偶尔情侣；2 室 → 情侣 / 带一个小孩 / 合租；3 室以上 → 一家人，有和室时可能三代同堂。
 */
export function generateHousehold(plan: Plan, seed = Date.now()): Household {
  const rand: Rand = rng(seed)
  const n = bedrooms(plan)
  const m2 = plan.rooms.reduce((sum, r) => sum + (r.kind === 'balcony' ? 0 : area(r.points)), 0) / 10000
  const hasWashitsu = plan.rooms.some((r) => r.kind === 'japanese')
  const region = plan.region ?? 'jp'
  const names = region === 'cn' ? CN_NAMES : region === 'west' ? WEST_NAMES : NAMES
  const used = new Set<string>()
  const adultAge = () => 24 + Math.floor(rand() * 26)
  let kind: Household['kind']
  const members: Member[] = []
  const r = rand()
  if (n <= 1) kind = r < 0.8 || m2 < 25 ? 'single' : 'couple'
  else if (n === 2) kind = r < 0.4 ? 'couple' : r < 0.8 ? 'family' : 'roommates'
  // 三代同堂：日式要有和室给长辈住；中式三室以上本来就常见
  else kind = (hasWashitsu || region === 'cn') && r < 0.3 ? 'three-gen' : r < 0.85 ? 'family' : 'roommates'

  if (kind === 'single') members.push(person(rand, 'self', 20 + Math.floor(rand() * 45), used, names))
  else if (kind === 'roommates') for (let i = 0; i < Math.min(n, 3); i++) members.push(person(rand, i ? 'roommate' : 'self', 20 + Math.floor(rand() * 12), used, names))
  else {
    const a = adultAge()
    members.push(person(rand, 'self', a, used, names), person(rand, 'partner', Math.max(22, a + Math.floor(rand() * 7) - 3), used, names))
    if (kind !== 'couple') {
      const kids = Math.max(1, Math.min(n - 1 - (kind === 'three-gen' ? 1 : 0), 1 + Math.floor(rand() * 2)))
      for (let i = 0; i < kids; i++) members.push(person(rand, 'child', Math.max(0, Math.min(a - 22, Math.floor(rand() * 17))), used, names))
      if (kind === 'three-gen') members.push(person(rand, 'elder', 66 + Math.floor(rand() * 15), used, names))
    }
  }
  // 中式 / 欧美：成年人的风格按地区偏向（日式保持原样，不多消耗随机数）
  if (region !== 'jp') for (const m of members) if (m.age >= 18 && rand() < 0.6) m.style = pick(rand, REGION_STYLES[region])
  // 地区的「传统」：中式的长辈 / 传统派偏新中式，欧美偏古典或乡村，日式偏和风（用哈希，不改变既有随机序列）
  members.forEach((m, i) => {
    const h = hash01(seed, i)
    if (region === 'cn' && (m.role === 'elder' || m.traits.includes('traditional')) && h < 0.8) m.style = 'chinese'
    else if (region === 'west' && (m.role === 'elder' || m.traits.includes('traditional')) && h < 0.8) m.style = h < 0.45 ? 'classic' : 'farmhouse'
    else if (region === 'jp' && m.age >= 18 && m.style !== 'japanese' && h < 0.15) m.style = 'japanese'
  })
  // 伴侣的风格跟户主走（两个人商量着装修）；公共空间用户主的风格
  const head = members[0]
  for (const m of members) if (m.role === 'partner') m.style = head.style
  // 兴趣等级（哈希，不改变上面的随机序列）
  const cap = levelCap(plan)
  members.forEach((m, i) => (m.levels = levelsFor(m, seed, i, cap)))
  const clutter = members.filter((m) => m.age >= 18).reduce((c, m) => c * (m.traits.map((t) => TRAITS[t].clutter ?? 1).reduce((a, b) => a * b, 1)), 1)
  return { kind, members, style: head.style, clutter: Math.max(0.5, Math.min(1.6, clutter)), seed }
}

/** 一句话描述（UI 用） */
export function describe(m: Member) {
  return `${t('{n} 岁', { n: m.age })} · ${t(JOBS[m.job].label)}`
}

// ---------- 按兴趣找素材 ----------

const text = (d: AssetDef) => `${d.id} ${d.name}`
function matches(d: AssetDef, m: Matcher | undefined) {
  if (!m) return false
  // 并集：分类符合、或正则命中都算（music.props = music 分类的摆件 + 若干外分类关键词）
  return (!!m.cats && m.cats.includes(d.category)) || (!!m.re && m.re.test(text(d)))
}

/** 兴趣对应的落地家具（不含设备、壁挂、太大的） */
export function interestFloor(id: InterestId) {
  // 相机展示柜 / 防潮柜只给摄影（按等级），别的兴趣的「展示柜」不算它
  return ASSETS.filter((d) => !d.fixture && !d.prop && !d.mount && Math.max(d.w, d.d) <= 200 && (id === 'photo' || !/^of-(camera-showcase|dry-)/.test(d.id)) && matches(d, INTERESTS[id].floor))
}
/** 兴趣对应的桌面摆件 */
export function interestProps(id: InterestId) {
  return ASSETS.filter((d) => d.prop && !d.stick && !d.form?.includes('hanging') && matches(d, INTERESTS[id].props))
}
/** 兴趣对应的贴附物（海报、贴纸），贴在墙上 */
export function interestStickers(id: InterestId) {
  return ASSETS.filter((d) => !!d.stick && matches(d, INTERESTS[id].props))
}
/** 兴趣对应的壁挂物 */
export function interestWall(id: InterestId) {
  return ASSETS.filter((d) => !!d.mount && matches(d, INTERESTS[id].wall))
}
/** 职业的工作台摆件 */
export function jobDeskProps(job: JobId) {
  const re = JOBS[job].desk
  return re ? ASSETS.filter((d) => d.prop && d.form !== 'hanging' && re.test(text(d))) : []
}
