// 住户设定：先推算这套房子住着怎样一户人家（家庭构成、每个人的年龄 / 职业 / 性格 / 兴趣），
// 再据此决定统一的装修风格、房间分配和每个房间里放什么。

import { area, edgesOf, regionOf, type Plan, type Room } from './model'
import { floorOf, isMultiFloor, planFloors } from './floors'
import { sharedIntervals } from './walls'
import { ASSETS, type AssetCategory, type AssetDef, type StyleTag } from './three/assets'
import { rng } from './three/kit'
import { hasTag, type Sel, type Tag } from './three/tags'
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

/**
 * 素材匹配：分类命中，或带有这个兴趣的标签 hobby:<id>（tagged）。
 * 同一个兴趣标签按素材形态区分用途：落地的算 floor、摆件和贴附物算 props、壁挂算 wall。
 */
interface Matcher {
  cats?: AssetCategory[]
  tagged?: true
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
  gaming: { label: '游戏', props: { tagged: true }, floor: { tagged: true } },
  music: { label: '音乐', floor: { cats: ['music'] }, props: { cats: ['music'], tagged: true }, wall: { tagged: true } },
  reading: { label: '读书', props: { tagged: true }, floor: { tagged: true } },
  otaku: { label: '动漫', props: { tagged: true }, floor: { tagged: true } },
  fitness: { label: '健身', floor: { cats: ['fitness'] }, props: { cats: ['fitness'] } },
  // 防潮柜、相机展示柜只按等级摆（Lv.3 起，见 INTEREST_TIERS），随机池里只有三脚架
  photo: { label: '摄影', floor: { tagged: true }, props: { tagged: true } },
  cooking: { label: '料理', props: { cats: ['kitchenware'] } },
  plants: { label: '园艺', floor: { cats: ['plants'] }, props: { tagged: true }, style: 'nordic' },
  crafts: { label: '手作', props: { tagged: true }, floor: { tagged: true } },
  models: { label: '模型', props: { tagged: true } },
  tea: { label: '茶道', props: { tagged: true }, floor: { cats: ['japanese'] }, style: 'japanese' },
  cats: { label: '养猫', floor: { tagged: true }, props: { tagged: true } },
  // 机器狗（rb-）不算养狗
  dogs: { label: '养狗', floor: { tagged: true } },
  aquarium: { label: '水族', floor: { tagged: true } },
  // 小动物 / 鸟的笼子在 packs/pet-habitats.ts，带 limit（全屋各一只），所以落地和台面的笼子合起来只会摆一个
  smallpets: { label: '养小动物', floor: { tagged: true }, props: { tagged: true } },
  birds: { label: '养鸟', floor: { tagged: true }, props: { tagged: true } },
  coffee: { label: '咖啡', props: { tagged: true } },
  streaming: { label: '直播', props: { tagged: true }, floor: { tagged: true } },
  tech: { label: '数码', props: { tagged: true }, floor: { tagged: true }, style: 'industrial' },
  sports: { label: '运动', props: { tagged: true }, floor: { tagged: true } },
  science: { label: '天文科学', props: { tagged: true }, floor: { tagged: true } },
  beauty: { label: '美妆', props: { cats: ['toiletry'] }, floor: { tagged: true } },
  // 麻将桌 / 棋桌按地区由 Decorator.specialties 成套摆（桌子 + 座位 + 台面上的牌 / 棋盘），随机池里只有台面摆件；
  // 棋罐要成对摆在棋盘边，不进随机池（棋罐没有 hobby:boardgames 标签）
  boardgames: { label: '桌游棋牌', props: { tagged: true } },
  collecting: { label: '收藏', props: { tagged: true }, floor: { tagged: true }, style: 'retro' },
  movies: { label: '电影', props: { tagged: true }, floor: { tagged: true } },
  fishing: { label: '钓鱼', floor: { tagged: true }, props: { tagged: true } },
  outdoor: { label: '户外登山', floor: { tagged: true }, props: { tagged: true } },
  maker: { label: '电子手工', floor: { tagged: true }, props: { tagged: true }, style: 'industrial' },
  // 收藏展示架、计时器垫按等级单独摆（INTEREST_TIERS），随机池里不放
  puzzles: { label: '益智', props: { tagged: true } },
}

// ---------- 兴趣等级：Lv.1 入门 → Lv.4 骨灰级，每级在上一级基础上再加东西 ----------

export type Lv = 1 | 2 | 3 | 4
export const LV_LABELS: Record<Lv, string> = { 1: '入门', 2: '爱好者', 3: '发烧友', 4: '骨灰级' }

/**
 * 每一级新增的东西（每个选择器各挑一件；选择器是语义标签、锚定 id 的正则，或它们的并集，见 three/tags.ts）：
 * floor 落地靠墙、props 台面摆件、wall 壁挂。
 * room：这一级想要一整间专用房（有空房时优先分给它）。没列的兴趣只按通用匹配撒东西，件数随等级增加。
 */
export interface Tier {
  floor?: Sel[]
  props?: Sel[]
  wall?: Sel[]
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
    { props: ['video-game'] },
    { props: [/^of-(gaming-headset|headset-stand-rgb)$/, /^of-kb-.*-rgb$/] },
    { floor: [/^of-pc-(mid|full)$/], props: [/^of-monitor-gaming$/, /^of-mousepad-rgb$/], wall: [/^hg-hex-lights$/] },
    { floor: [/^of-pc-full$/, 'display-cabinet'], room: true },
  ],
  // 每条正则的候选按地区加权挑（GAME_REGION：中式多军旗 / 五子棋 / 斗地主，日式花札 / 黑白棋 / 双六，欧美跳棋 / 拼字 / 地产桌游）
  boardgames: [
    { props: [/^(int-(poker|uno|card-game|mahjong-case|hanafuda-(boxed|stack))|bg-dice-pair)/] },
    {
      props: [
        /^(hg-go-board|int-(chess|xiangqi|shogi|reversi|chinese-checkers|backgammon)|bg-(junqi|gomoku|doushou|feixing|checkers|sugoroku))(-|$)/,
        /^(int-mahjong-mat|bg-(poker-|paijiu|hanafuda-mat|dominoes|holdem))/,
      ],
    },
    // Lv.3 的牌桌 / 棋桌按地区单独摆（Decorator.specialties），这里多撒几样更专门的：桌游、筹码、计分本、多面骰
    { props: [/^(int-boardgame|int-bg-|bg-(box-stack|property|words|jenga))/, /^bg-(chip-case|score-pad|dice-rpg)/] },
    { props: [/^bg-box-stack-l$/], room: true },
  ],
  music: [
    { props: ['music-accessory'] },
    { floor: [['guitar', 'e-keyboard']] },
    { wall: ['guitar', /^hg-acoustic$/] },
    { floor: [['piano', 'drums']], room: true },
  ],
  fitness: [
    { props: [['weights', 'yoga']] },
    { floor: [['yoga-mat', 'yoga']] },
    { floor: ['cardio'] },
    { floor: ['strength'], room: true },
  ],
  reading: [
    { props: ['book'] },
    { floor: ['bookshelf'] },
    { floor: ['bookshelf', 'armchair'] },
    { room: true },
  ],
  otaku: [
    { props: [['manga', 'figure', 'acrylic-stand']] },
    { props: [[/^int-figure-case$/, 'gacha']] },
    { floor: [[/^col-lit-showcase$/, 'display-cabinet']] },
    { wall: [/^col-wall-showcase$/], room: true },
  ],
  collecting: [
    { props: [['coin', 'stamp']] },
    { props: ['mineral'] },
    { floor: [['curio-cabinet', /^col-lit-showcase$/]] },
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
  const m2 = plan.rooms.reduce((sum, r) => sum + (r.kind === 'balcony' || r.kind === 'void' ? 0 : area(r.points)), 0) / 10000
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

/** desk：工作台上摆的东西（有其中任一标签的摆件） */
export const JOBS: Record<JobId, { label: string; wfh: boolean; interests?: InterestId[]; desk?: Tag[] }> = {
  office: { label: '公司职员', wfh: false },
  programmer: { label: '程序员', wfh: true, interests: ['tech', 'gaming', 'coffee'], desk: ['monitor', 'keyboard', 'mouse'] },
  designer: { label: '设计师', wfh: true, interests: ['crafts', 'reading'], desk: ['tablet', 'monitor', 'pen'] },
  streamer: { label: '主播', wfh: true, interests: ['streaming', 'gaming'], desk: ['mic', 'webcam', 'monitor', 'stream-gear'] },
  photographer: { label: '摄影师', wfh: true, interests: ['photo'], desk: ['camera', 'lens', 'monitor'] },
  musician: { label: '音乐人', wfh: true, interests: ['music'], desk: ['audio-gear', 'monitor'] },
  chef: { label: '厨师', wfh: false, interests: ['cooking', 'coffee'] },
  student: { label: '大学生', wfh: false, interests: ['reading'], desk: ['laptop', 'book'] },
  teacher: { label: '教师', wfh: false, interests: ['reading'] },
  nurse: { label: '护士', wfh: false },
  researcher: { label: '研究员', wfh: true, interests: ['science', 'reading'], desk: ['monitor', 'book', 'microscope'] },
  engineer: { label: '硬件工程师', wfh: true, interests: ['maker', 'tech'], desk: ['electronics-tool', 'monitor'] },
  retired: { label: '退休', wfh: false, interests: ['tea', 'plants'] },
  preschool: { label: '学龄前', wfh: false },
  schoolkid: { label: '学生', wfh: false, interests: ['reading'], desk: ['book', 'pen', 'lamp'] },
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
  const m2 = plan.rooms.reduce((sum, r) => sum + (r.kind === 'balcony' || r.kind === 'void' ? 0 : area(r.points)), 0) / 10000
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

function matches(d: AssetDef, id: InterestId, m: Matcher | undefined) {
  if (!m) return false
  // 并集：分类符合、或有兴趣标签都算（music.props = music 分类的摆件 + 带 hobby:music 的外分类摆件）
  return (!!m.cats && m.cats.includes(d.category)) || (!!m.tagged && hasTag(d, `hobby:${id}`))
}

/** 兴趣对应的落地家具（不含设备、壁挂、贴附物、太大的） */
export function interestFloor(id: InterestId) {
  return ASSETS.filter((d) => !d.fixture && !d.prop && !d.mount && !d.stick && Math.max(d.w, d.d) <= 200 && matches(d, id, INTERESTS[id].floor))
}
/** 兴趣对应的桌面摆件 */
export function interestProps(id: InterestId) {
  return ASSETS.filter((d) => d.prop && !d.stick && !d.form?.includes('hanging') && matches(d, id, INTERESTS[id].props))
}
/** 兴趣对应的贴附物（海报、贴纸），贴在墙上 */
export function interestStickers(id: InterestId) {
  return ASSETS.filter((d) => !!d.stick && matches(d, id, INTERESTS[id].props))
}
/** 兴趣对应的壁挂物 */
export function interestWall(id: InterestId) {
  return ASSETS.filter((d) => !!d.mount && matches(d, id, INTERESTS[id].wall))
}
/** 职业的工作台摆件 */
export function jobDeskProps(job: JobId) {
  const tags = JOBS[job].desk
  return tags ? ASSETS.filter((d) => d.prop && d.form !== 'hanging' && hasTag(d, ...tags)) : []
}

// ---------- 房间分配（全户统一） ----------

/** 空居室的用途 */
export type RoomPurpose = 'study' | 'library' | 'gaming' | 'music' | 'theater' | 'hobby' | 'gym' | 'play' | 'guest' | 'closet' | 'cards'

/** 全户的房间分配：每个成员恰好住一间居室（夫妻同室；房间不够时孩子和父母睡），多余的居室按兴趣做功能房 */
export interface Allocation {
  /** 每个居室住着谁 */
  occupants: Map<string, Member[]>
  /** 多出来的居室：给谁当书房 / 兴趣房 */
  studyOf: Map<string, Member>
  /** 没人住的居室做什么用 */
  purposeOf: Map<string, RoomPurpose>
}

/** 行动不便（楼层优先 1F）：长辈、70 岁以上 */
export const lowMobility = (m: Member) => m.role === 'elder' || m.age >= 70

/**
 * 按住户分配居室（洋室 + 和室），整套房子一起分（多层户型不按层各分一次）：
 *   夫妻住最大的洋室；长辈优先和室；孩子、室友各一间；房间不够时孩子和父母睡、长辈挤进最大的房间；
 *   剩下的居室不留空，按工作和兴趣排出功能房（书房、电竞房、音乐室…），一间一种用途。
 * 多层户型另外：
 *   - 长辈 / 行动不便者先分，优先 1F（1F 和室 > 1F 洋室 > 其他层和室 > 其他）；
 *   - 孩子优先和父母同层，其次相邻的层；3 岁以下的婴儿和父母同室；
 *   - 1F 和 LDK 相连的和室算全家共用（客间 / 家族室），只在长辈要住或房间不够时才分给个人。
 * 单层户型的结果和以前完全一样（一键布置的输出不变）。
 */
export function allocateRooms(plan: Plan, hh: Household): Allocation {
  const occupants = new Map<string, Member[]>()
  const studyOf = new Map<string, Member>()
  const purposeOf = new Map<string, RoomPurpose>()
  const multi = isMultiFloor(plan)
  const fs = planFloors(plan)
  const base = fs[0].id
  const level = (r: Room) => Math.max(0, fs.findIndex((f) => f.id === floorOf(plan, r)))
  const rooms = plan.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').sort((a, b) => area(b.points) - area(a.points))
  // 欧美的 Office 是书房，最后才拿来住人
  if (regionOf(plan) === 'west') rooms.sort((a, b) => Number(a.name === 'Office') - Number(b.name === 'Office'))
  // 多层：1F 和 LDK 相连的和室是全家共用的，排到最后
  const ldks = multi ? plan.rooms.filter((r) => r.kind === 'ldk' && floorOf(plan, r) === base) : []
  const sharedSet = new Set(rooms.filter((r) => multi && r.kind === 'japanese' && floorOf(plan, r) === base && ldks.some((l) => edgesOf(r.points).some((e) => sharedIntervals(e, l).length > 0))).map((r) => r.id))
  const shared = (r: Room) => sharedSet.has(r.id)
  if (multi) rooms.sort((a, b) => Number(shared(a)) - Number(shared(b)))
  const free = [...rooms]
  /** 按偏好依次找：第一个有命中的偏好胜出；都没有就取第一间 */
  const take = (...prefs: ((r: Room) => boolean)[]) => {
    for (const p of prefs) {
      const i = free.findIndex(p)
      if (i >= 0) return free.splice(i, 1)[0]
    }
    return free.splice(0, 1)[0]
  }
  const isParent = (m: Member) => m.role === 'self' || m.role === 'partner'
  const couple = hh.members.filter(isParent)
  const groups: Member[][] = []
  if (hh.kind === 'roommates') for (const m of hh.members) groups.push([m])
  else if (multi) {
    // 长辈先挑（要住 1F），再是夫妻、孩子
    for (const m of hh.members.filter((m) => !isParent(m) && lowMobility(m))) groups.push([m])
    if (couple.length) groups.push(couple)
    for (const m of hh.members.filter((m) => m.role === 'child' && !lowMobility(m)).sort((a, b) => b.age - a.age)) groups.push([m])
  } else {
    groups.push(couple)
    for (const m of hh.members.filter((m) => m.role === 'elder')) groups.push([m])
    for (const m of hh.members.filter((m) => m.role === 'child').sort((a, b) => b.age - a.age)) groups.push([m])
  }
  let parentsRoom: Room | undefined
  for (const g of groups) {
    // 多层：婴儿（3 岁以下）和父母睡一间
    if (multi && parentsRoom && g[0]?.role === 'child' && g[0].age < 3) {
      occupants.set(parentsRoom.id, [...(occupants.get(parentsRoom.id) ?? []), ...g])
      continue
    }
    if (!free.length) {
      // 房间不够：小孩和父母睡，长辈 / 大孩子挤进最大的房间
      const room = (multi && g[0]?.role === 'child' && parentsRoom) || rooms[0]
      if (room) occupants.set(room.id, [...(occupants.get(room.id) ?? []), ...g])
      continue
    }
    let room: Room
    if (!multi) room = take(g[0]?.role === 'elder' ? (r) => r.kind === 'japanese' : (r) => r.kind === 'western')
    else if (g[0] && !isParent(g[0]) && lowMobility(g[0])) {
      const on1 = (r: Room) => level(r) === 0
      room = take((r) => on1(r) && r.kind === 'japanese', on1, (r) => r.kind === 'japanese')
    } else if (g[0]?.role === 'child' && parentsRoom) {
      const pl = level(parentsRoom)
      const own = (r: Room) => !shared(r)
      // 学龄前的孩子不单独住到别的楼层：父母那层没有空房就和父母睡
      if (g[0].age < 6 && !free.some((r) => own(r) && level(r) === pl)) {
        occupants.set(parentsRoom.id, [...(occupants.get(parentsRoom.id) ?? []), ...g])
        continue
      }
      room = take((r) => own(r) && level(r) === pl && r.kind === 'western', (r) => own(r) && level(r) === pl, (r) => own(r) && Math.abs(level(r) - pl) === 1, own)
    } else room = take((r) => !shared(r) && r.kind === 'western', (r) => !shared(r))
    occupants.set(room.id, g)
    if (g.some(isParent)) parentsRoom = room
  }
  // 剩下的居室不留空：按住户的工作和兴趣排出功能房，一间一种用途
  const adults = hh.members.filter((m) => m.age >= 18)
  const has = (it: InterestId) => hh.members.filter((m) => m.interests.includes(it))
  const wanted: [RoomPurpose, Member | undefined][] = []
  const want = (p: RoomPurpose, who: Member[] | Member | undefined) => {
    const m = Array.isArray(who) ? who[0] : who
    if (m && !wanted.some(([q]) => q === p)) wanted.push([p, m])
  }
  // 骨灰级（Lv.4）的兴趣先挑一整间专用房
  const lv4 = (it: InterestId) => hh.members.filter((m) => levelOf(m, it) >= 4)
  want('cards', lv4('boardgames'))
  want('gaming', lv4('gaming').concat(lv4('streaming')))
  want('music', lv4('music'))
  want('gym', lv4('fitness'))
  want('library', lv4('reading'))
  want('hobby', [...lv4('otaku'), ...lv4('collecting'), ...lv4('photo'), ...lv4('tech')])
  want('study', adults.find((m) => JOBS[m.job].wfh))
  want('gaming', has('gaming').concat(has('streaming')))
  want('music', has('music'))
  want('theater', has('movies'))
  want('hobby', [...has('maker'), ...has('models'), ...has('crafts'), ...has('collecting'), ...has('otaku'), ...has('boardgames'), ...has('photo')])
  want('gym', [...has('fitness'), ...has('sports'), ...has('outdoor')])
  want('play', hh.members.filter((m) => m.role === 'child' && m.age < 10))
  want('library', has('reading'))
  want('study', adults[0])
  want('guest', adults[0] ?? hh.members[0])
  want('closet', adults[0] ?? hh.members[0])
  for (const r of free) {
    // 和室优先当客房 / 茶室式的书房（全家共用的和室只当客房），洋室按顺序分
    const i = shared(r) ? Math.max(0, wanted.findIndex(([p]) => p === 'guest')) : r.kind === 'japanese' ? Math.max(0, wanted.findIndex(([p]) => p === 'guest' || p === 'study' || p === 'library')) : 0
    const [p, m] = wanted.splice(i, 1)[0] ?? ['guest', hh.members[0]]
    purposeOf.set(r.id, p)
    // 全家共用的和室不记在某个人名下
    if (m && !shared(r)) studyOf.set(r.id, m)
  }
  return { occupants, studyOf, purposeOf }
}

/** 每个成员住的房间（UI：住户面板显示每人的房间和楼层） */
export function memberRooms(plan: Plan, hh: Household): Map<string, Room> {
  const a = allocateRooms(plan, hh)
  const out = new Map<string, Room>()
  for (const r of plan.rooms) for (const m of a.occupants.get(r.id) ?? []) out.set(m.id, r)
  return out
}
