// 多语言：简体中文 / 日本語 / English。
//
// 做法：界面文案以中文原文作 key（原文就是 zh 的译文），ui.ts 里给出 [ja, en] 对照；
// 素材名（name / sizeLabel / formLabel）走单独的大词典 assetNames.ts。
// 数据里的 key / id / 名字一律不动（存档兼容），只在显示处用 t() / assetText() 取译文。
// lang 是响应式的：模板、computed 里调用 t() 会随切换即时刷新。

import { ref, watch } from 'vue'
import { ROOM_NAMES, UI } from './ui'
import { ASSET_NAMES } from './assetNames'
import { SEO } from '../seo'

export type Lang = 'zh' | 'ja' | 'en'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
]

const STORAGE_KEY = 'my-home:lang'
const isLang = (v: unknown): v is Lang => v === 'zh' || v === 'ja' || v === 'en'

/** 按浏览器语言推断：zh* → zh，ja* → ja，其余 → en（按 navigator.languages 的优先顺序取第一个能认的） */
export function detectLang(): Lang {
  const list = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of list) {
    const l = (raw || '').toLowerCase()
    if (l.startsWith('zh')) return 'zh'
    if (l.startsWith('ja')) return 'ja'
    if (l.startsWith('en')) return 'en'
  }
  return 'en'
}

/**
 * 地址里显式指定的语言：路径前缀 /zh/ /ja/ /en/（构建产物里各有一份写死 meta 的入口页，给爬虫和分享卡片用），
 * 或查询参数 ?lang=ja。显式指定优先于本地记住的选择和浏览器推断。
 */
const LANG_PATH = /^\/(zh|ja|en)(?=\/|$)/
function urlLang(): Lang | null {
  if (typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search).get('lang')
  if (isLang(q)) return q
  const m = LANG_PATH.exec(location.pathname)
  return m && isLang(m[1]) ? m[1] : null
}

function initialLang(): Lang {
  const fromUrl = urlLang()
  if (fromUrl) return fromUrl
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // 隐私模式等读不到 localStorage：按浏览器推断
  }
  return detectLang()
}

export const lang = ref<Lang>(initialLang())

const HTML_LANG: Record<Lang, string> = { zh: 'zh-CN', ja: 'ja', en: 'en' }

/** 同步 <head> 里随语言变化的 meta（标题、描述、og / twitter）。canonical / hreflang 由各语言的静态入口页决定，这里不动 */
function syncHead(l: Lang) {
  const s = SEO[l]
  const set = (sel: string, v: string) => document.head.querySelector(sel)?.setAttribute('content', v)
  document.title = s.title
  set('meta[name="description"]', s.description)
  set('meta[name="keywords"]', s.keywords)
  set('meta[property="og:title"]', s.title)
  set('meta[property="og:description"]', s.tagline)
  set('meta[property="og:locale"]', s.ogLocale)
  set('meta[property="og:image:alt"]', s.ogImageAlt)
  set('meta[name="twitter:title"]', s.title)
  set('meta[name="twitter:description"]', s.tagline)
  set('meta[name="twitter:image:alt"]', s.ogImageAlt)
  // og:image 是绝对地址：只换文件名，保留构建时注入的站点前缀
  for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const el = document.head.querySelector(sel)
    const cur = el?.getAttribute('content')
    if (el && cur) el.setAttribute('content', cur.replace(/\/og(-\w+)?\.png$/, s.ogImage))
  }
}

/**
 * 正文字体按语言分别加载（Google Fonts，font-display: swap，字重 400/500/700）：
 * 拉丁字母和数字统一走 Nunito（圆润、支持 tnum）；中文 Noto Sans SC，日文 Zen Maru Gothic。
 * CJK 字体由 Google Fonts 按 unicode-range 分片，只下载页面用到的字；只在切到该语言时才插入对应 <link>。
 * 字体栈在 style.css 里按 :root[lang] 切换。
 */
const FONT_CSS: Record<Lang, string[]> = {
  en: ['Nunito:wght@400;500;700'],
  zh: ['Nunito:wght@400;500;700', 'Noto+Sans+SC:wght@400;500;700'],
  ja: ['Nunito:wght@400;500;700', 'Zen+Maru+Gothic:wght@400;500;700'],
}
const loadedFonts = new Set<string>()
function loadFonts(l: Lang) {
  const head = document.head
  if (!loadedFonts.size) {
    for (const [href, cross] of [
      ['https://fonts.googleapis.com', false],
      ['https://fonts.gstatic.com', true],
    ] as const) {
      const pre = document.createElement('link')
      pre.rel = 'preconnect'
      pre.href = href
      if (cross) pre.crossOrigin = ''
      head.appendChild(pre)
    }
  }
  for (const fam of FONT_CSS[l]) {
    if (loadedFonts.has(fam)) continue
    loadedFonts.add(fam)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`
    head.appendChild(link)
  }
}

if (typeof document !== 'undefined') {
  watch(
    lang,
    (v) => {
      document.documentElement.lang = HTML_LANG[v]
      document.documentElement.dataset.lang = v
      syncHead(v)
      loadFonts(v)
    },
    { immediate: true },
  )
}

/** 用户主动切换：记住选择 */
export function setLang(v: Lang) {
  lang.value = v
  // 地址里写着语言的，跟着改掉，免得刷新后又回到旧语言
  if (urlLang()) {
    const u = new URL(location.href)
    if (u.searchParams.has('lang')) u.searchParams.set('lang', v)
    else u.pathname = u.pathname.replace(LANG_PATH, `/${v}`)
    history.replaceState(history.state, '', u)
  }
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    // 存不了就只在本次会话生效
  }
}

const IDX: Record<Exclude<Lang, 'zh'>, 0 | 1> = { ja: 0, en: 1 }

const fill = (s: string, params?: Record<string, string | number>) =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s

const warned = new Set<string>()
function warnMissing(key: string) {
  if (!import.meta.env?.DEV || warned.has(key)) return
  warned.add(key)
  console.warn(`[i18n] 缺少译文：${JSON.stringify(key)}`)
}

/**
 * 界面文案：t('撤销')、t('共 {n} 件', { n })。
 * zh 直接用原文；ja / en 查 ui.ts，缺译文时回退原文（开发环境 console.warn 一次）。
 */
export function t(zh: string, params?: Record<string, string | number>): string {
  const l = lang.value
  if (l === 'zh' || !zh) return fill(zh, params)
  const e = UI[zh]
  if (!e) warnMissing(zh)
  return fill(e ? e[IDX[l]] : zh, params)
}

/** 查得到才翻译，查不到原样返回且不报警（用于可能是用户自定义文字的地方，例如房间名） */
export function tSoft(s: string): string {
  const l = lang.value
  if (l === 'zh' || !s) return s
  const e = UI[s]
  return e ? e[IDX[l]] : s
}

/** 当前语言下 t 有没有现成译文（zh 恒为 true） */
export const hasT = (s: string) => lang.value === 'zh' || s in UI

const CJK = /[぀-ヿ㐀-鿿]/

/**
 * 素材文字（name / sizeLabel / formLabel）：查 assetNames.ts 词典，缺失时回退中文原文。
 * 不含中日文字符的（纯数字、尺寸、英文型号）原样返回。
 */
export function assetText(zh: string | undefined): string {
  if (!zh) return ''
  const l = lang.value
  if (l === 'zh' || !CJK.test(zh)) return zh
  const e = ASSET_NAMES[zh] ?? UI[zh]
  return e ? e[IDX[l]] : zh
}

/**
 * 带数字的动态文案：先按原文查，查不到就把数字换成 {n} 再查（「床（3 人）」→「床（{n} 人）」）。
 * 用于数据里已经拼好数字的标签（检查清单等）。
 */
export function tAuto(s: string): string {
  const l = lang.value
  if (l === 'zh' || !s) return s
  if (UI[s]) return UI[s][IDX[l]]
  const nums: string[] = []
  const key = s.replace(/\d+(?:\.\d+)?/g, (m) => (nums.push(m), '{n}'))
  const e = nums.length === 1 ? UI[key] : undefined
  if (!e) {
    warnMissing(s)
    return s
  }
  return fill(e[IDX[l]], { n: nums[0] })
}

/**
 * 日式用语（房间默认名、户型布局叫法、平面图上的设备标注）在中文界面下的说法。
 * 这些词的原文是日文，所以不走 t()（t 的 key 是中文原文，中文界面会原样显示日文）。
 */
export const ZH_TERMS: Record<string, string> = {
  キッチン: '厨房',
  洋室: '卧室',
  和室: '和室',
  洗面所: '盥洗室',
  浴室: '浴室',
  ユニットバス: '整体浴室',
  トイレ: '卫生间',
  廊下: '走廊',
  玄関: '玄关',
  収納: '收纳间',
  押入: '壁橱',
  押入れ: '壁橱',
  クローゼット: '衣柜',
  WIC: '步入式衣帽间',
  シューズIN: '鞋帽间',
  シューズBOX: '鞋柜间',
  リネン庫: '布草间',
  納戸: '储藏室',
  洗濯機置場: '洗衣机位',
  バルコニー: '阳台',
  LDK: '客餐厅',
  DK: '餐厨',
  K: '厨房',
  田の字型: '田字型',
  縦長リビング: '纵长客厅',
  ワイドスパン: '宽面宽',
  シングル: '单身公寓',
  リビングイン: '经客厅入户',
  角部屋: '边户',
  下駄: '鞋',
  収: '收',
  食: '食',
  // 欧美户型的英文默认名（带序号的 Bedroom 2 走 roomName 的「默认名 + 序号」）
  'Living Room': '客厅',
  Dining: '餐厅',
  Kitchen: '厨房',
  'Primary Bedroom': '主卧',
  Bedroom: '卧室',
  'Primary Bath': '主卫',
  Bath: '卫生间',
  'Half Bath': '半卫',
  Laundry: '洗衣房',
  'Walk-in Closet': '步入式衣帽间',
  Foyer: '门厅',
  Hallway: '走廊',
  Office: '书房',
  Pantry: '储藏室',
  Linen: '布草间',
  Patio: '露台',
}

/** 日式用语：中文界面查 ZH_TERMS，日文 / 英文界面走 t() 的词典 */
export function jp(s: string): string {
  return lang.value === 'zh' ? (ZH_TERMS[s] ?? s) : t(s)
}

/**
 * 房间名：只有等于某个默认名（生成器 / 房间类型给的：洋室1、LDK、玄関、トイレ…，见 ui.ts 的 ROOM_NAMES）时才按语言翻译，
 * 用户自己改过的名字原样显示。zh 界面沿用原名（日式间取り用语本来就是日文）。
 */
export function roomName(name: string): string {
  const l = lang.value
  if (!name) return name
  if (l === 'zh') {
    // 中文界面：日式间取り用语换成中文说法（洋室 → 卧室、玄関 → 玄关…）；用户自己起的名字原样
    if (ZH_TERMS[name]) return ZH_TERMS[name]
    const m = /^(.*?)\s*(\d+)$/.exec(name)
    return m && ZH_TERMS[m[1]] ? `${ZH_TERMS[m[1]]}${m[2]}` : name
  }
  const direct = ROOM_NAMES[name]
  if (direct) return direct[IDX[l]]
  // 洋室1 / 洋室 2 / 和室3：默认名 + 序号
  const m = /^(.*?)\s*(\d+)$/.exec(name)
  if (m && ROOM_NAMES[m[1]]) return `${ROOM_NAMES[m[1]][IDX[l]]}${l === 'en' ? ' ' : ''}${m[2]}`
  return name
}
