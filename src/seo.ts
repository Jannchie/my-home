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

/** 默认站点地址：上线前用环境变量 VITE_SITE_URL 覆盖（见 vite.config.ts / README） */
export const DEFAULT_SITE_URL = 'https://my-home.example'

export const SITE_NAME = 'My Home'
export const AUTHOR = { name: 'Jianqi Pan', url: 'https://github.com/Jannchie' }

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
    title: 'My Home · 日式户型编辑器与 3D 卡通沙盘',
    tagline: pick(PRODUCT_TAGLINE, 'zh'),
    description: '在浏览器里随机生成 1K～3LDK 日本户型，按住户人设一键布置家具与上千种生活小物，再到 3D 卡通沙盘里看看这个家。2000+ 素材、6 种风格，免费、无需注册。',
    keywords: '户型编辑器,日本户型,間取り,户型生成,3D 沙盘,家具布置,室内设计,1LDK,2LDK,在线户型图',
    ogImage: '/og.png',
    ogImageAlt: 'My Home：左侧是标题「生成一个日本的家，再把生活摆进去」，右侧是一键布置好家具的 2LDK 户型 3D 卡通沙盘',
    features: ['随机生成 1K～3LDK 日本户型', '按住户人设一键布置家具与生活小物', '3D 卡通沙盘与模拟人生式墙体显示', '2000+ 素材、6 种风格、自定义配色与花纹', '数据保存在本地浏览器，免费无需注册'],
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    path: '/ja/',
    title: 'My Home · 間取りエディタ & 3D ジオラマ',
    tagline: pick(PRODUCT_TAGLINE, 'ja'),
    description: '1K〜3LDK の日本の間取りをブラウザでランダム生成。住む人に合わせて家具と生活小物を自動配置し、3D のトゥーン調ジオラマで眺められます。素材 2000 点以上・6 つのテイスト、無料・登録不要。',
    keywords: '間取り,間取りエディタ,間取り作成,間取り図,3Dジオラマ,家具配置,インテリア,1LDK,2LDK,無料',
    ogImage: '/og-ja.png',
    ogImageAlt: 'My Home：「間取りをつくって、暮らしまで並べよう」という見出しと、家具を自動配置した 2LDK の 3D ジオラマ',
    features: ['1K〜3LDK の間取りをランダム生成', '住む人に合わせて家具と生活小物を自動配置', '3D ジオラマとシムズ風の壁表示', '素材 2000 点以上・6 つのテイスト・配色と柄のカスタマイズ', 'データはブラウザ内に保存、無料・登録不要'],
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    path: '/en/',
    title: 'My Home · Japanese Floor Plan Editor & 3D Diorama',
    tagline: pick(PRODUCT_TAGLINE, 'en'),
    description: 'Generate Japanese floor plans (1K–3LDK) in your browser, auto-furnish them to fit an imagined household, and explore the result as a toon-shaded 3D diorama. 2,000+ assets, 6 styles, free, no sign-up.',
    keywords: 'floor plan editor,Japanese apartment,madori,floor plan generator,3D diorama,interior design,furniture layout,1LDK,2LDK',
    ogImage: '/og-en.png',
    ogImageAlt: 'My Home: the headline "Generate a Japanese home, then fill it with life" next to a furnished 2LDK apartment rendered as a toon-shaded 3D diorama',
    features: ['Random 1K–3LDK Japanese floor plans', 'One-click furnishing based on an imagined household', 'Toon-shaded 3D diorama with Sims-style wall cutaways', '2,000+ assets, 6 styles, custom colors and fabric patterns', 'Stored locally in your browser; free, no sign-up'],
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
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
  }
}
