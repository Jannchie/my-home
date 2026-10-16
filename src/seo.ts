// SEO / 分享卡片用的三语文案与站点信息（纯数据，不碰 DOM）。
//
// 同时被两处使用：
// - vite.config.ts 的 seo 插件：构建时生成 /zh/ /ja/ /en/ 三个静态入口页的 <head>、JSON-LD、sitemap.xml、robots.txt
//   （社交平台的爬虫不跑 JS，所以每种语言都要有一份写死了 meta 的 HTML）；
// - src/i18n/index.ts：运行时切换语言时同步 document.title / description / og 标签。
// 一句话简介放在 i18n/ui.ts（界面也会用），这里引用过来，保证页面里和分享卡片里是同一句话；
// meta description 要控制在搜索结果能显示完的长度，单独写在这里（长简介见 ui.ts 的 PRODUCT_INTRO）。

import { PRODUCT_TAGLINE, UI } from './i18n/ui'

export type SeoLang = 'zh' | 'ja' | 'en'
export const SEO_LANGS: SeoLang[] = ['zh', 'ja', 'en']

/** 默认站点地址（正式站点）；部署到别的域名时用环境变量 VITE_SITE_URL 覆盖（见 vite.config.ts / README） */
export const DEFAULT_SITE_URL = 'https://home.jannchie.com'

export const SITE_NAME = 'My Home'
export const AUTHOR = { name: 'Jianqi Pan', url: 'https://github.com/Jannchie', x: 'https://x.com/jannchie' }
/** 项目源码仓库（顶栏 / 「更多」菜单的 GitHub 链接、JSON-LD 的 codeRepository） */
export const REPO_URL = 'https://github.com/Jannchie/my-home'

const pick = (zh: string, l: SeoLang) => (l === 'zh' ? zh : UI[zh][l === 'ja' ? 0 : 1])

export interface SeoText {
  /** <html lang> 与 hreflang */
  htmlLang: string
  /** og:locale */
  ogLocale: string
  /** 该语言入口页的路径（相对站点根） */
  path: string
  title: string
  /** 一句话简介（og/twitter 描述用，短一些） */
  tagline: string
  /** meta description（≈120～160 字符） */
  description: string
  keywords: string
  /** 分享图（public/ 下，1200×630） */
  ogImage: string
  ogImageAlt: string
  /** JSON-LD featureList */
  features: string[]
}

export const SEO: Record<SeoLang, SeoText> = {
  zh: {
    htmlLang: 'zh-CN',
    ogLocale: 'zh_CN',
    path: '/zh/',
    title: 'My Home · 户型编辑器与 3D 卡通沙盘',
    tagline: pick(PRODUCT_TAGLINE, 'zh'),
    description: '浏览器里的户型编辑器与 3D 卡通沙盘。生成日式、中式、欧美户型，按家庭构成、职业、性格与兴趣一键布置，模拟日照与昼夜。2600+ 素材、9 种风格，免费、无需注册。',
    keywords: '户型编辑器,户型生成,户型图,在线户型图,三室两厅,日本户型,間取り,3D 沙盘,家具布置,室内设计',
    ogImage: '/og.png',
    ogImageAlt: 'My Home：标题「生成一个带有生活气息的家」，旁边是一键布置好家具的户型 3D 卡通沙盘截图',
    features: [
      '日式（1K–3LDK）、中式（几室几厅）、欧美三种户型生成，也可手绘',
      '按家庭构成、职业、性格与兴趣一键布置家具与生活小物',
      '3D 卡通沙盘：五种墙体显示、按时刻 / 日期 / 城市计算日照与昼夜、12 种画面效果',
      '2600+ 程序化素材、9 种风格、布艺花纹可换',
      '支持触屏与 PWA 离线使用，中日英三语',
      '数据保存在浏览器本地，免费无需注册',
    ],
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    path: '/ja/',
    title: 'My Home · 間取りエディタ & 3D ジオラマ',
    tagline: pick(PRODUCT_TAGLINE, 'ja'),
    description: 'ブラウザで動く間取りエディタと 3D ジオラマ。日本・中国・欧米の間取りを生成し、家族構成・職業・性格・趣味に合わせて家具を自動配置。日照と昼夜も再現。素材 2600 点以上・9 テイスト、無料・登録不要。',
    keywords: '間取り,間取りエディタ,間取り作成,間取り図,間取り自動生成,3Dジオラマ,家具配置,インテリア,1LDK,無料',
    ogImage: '/og-ja.png',
    ogImageAlt: 'My Home：「暮らしの気配がある家をつくる」という見出しと、家具を自動配置した間取りの 3D ジオラマ',
    features: [
      '日本（1K〜3LDK）・中国・欧米の間取り生成、手描きにも対応',
      '家族構成・職業・性格・趣味に合わせて家具と生活小物を自動配置',
      '3D ジオラマ：5 種類の壁表示、時刻・日付・都市から計算する日照と昼夜、12 種類の画面エフェクト',
      '素材 2600 点以上・9 つのテイスト・布の柄を変更可能',
      'タッチ操作と PWA のオフライン利用、日中英の 3 言語',
      'データはブラウザ内に保存、無料・登録不要',
    ],
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    path: '/en/',
    title: 'My Home · Floor Plan Editor & 3D Diorama',
    tagline: pick(PRODUCT_TAGLINE, 'en'),
    description: 'Browser-based floor plan editor and 3D diorama. Generate Japanese, Chinese or Western layouts, auto-furnish them for a household, simulate sunlight. Free.',
    keywords: 'floor plan editor,floor plan generator,apartment layout,room planner,3D diorama,interior design,furniture layout,madori,1LDK,free',
    ogImage: '/og-en.png',
    ogImageAlt: 'My Home: the headline "Generate a home that feels lived-in" next to an auto-furnished floor plan rendered as a toon-shaded 3D diorama',
    features: [
      'Japanese (1K–3LDK), Chinese and Western floor plan generators, or draw by hand',
      'One-click furnishing based on household, jobs, personalities and hobbies',
      'Toon-shaded 3D diorama: five wall display modes, sunlight and day/night from time, date and city, 12 visual looks',
      '2,600+ procedural assets, 9 styles, swappable fabric patterns',
      'Touch and offline PWA support; Chinese, Japanese and English',
      'Stored locally in your browser; free, no sign-up',
    ],
  },
}

/** schema.org WebApplication（JSON-LD） */
export function jsonLd(l: SeoLang, siteUrl: string, page = SEO[l].path) {
  const s = SEO[l]
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    alternateName: SEO_LANGS.map((x) => SEO[x].title),
    url: siteUrl + page,
    description: s.description,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript and WebGL',
    inLanguage: SEO_LANGS.map((x) => SEO[x].htmlLang),
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    image: siteUrl + s.ogImage,
    screenshot: siteUrl + s.ogImage,
    featureList: s.features,
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url, sameAs: [AUTHOR.x, AUTHOR.url] },
    codeRepository: REPO_URL,
  }
}
