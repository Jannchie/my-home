// 视图路由：地址栏和主视图（平面图 / 3D 沙盘 / 素材库）同步。
//
// 地址形如 /<lang>/plan、/<lang>/3d、/<lang>/library[/<素材 id>]；语言前缀可省（/3d、/library），省略时语言按 i18n 的规则推断。
// 语言入口页 /zh/ /ja/ /en/ 和根路径 / 都是平面图。查询参数（?lang=）和 hash 原样保留。
// 切换视图用 pushState（浏览器前进 / 后退能切回来），素材库里换选中的素材用 replaceState（不刷历史）。
// 部署：Cloudflare Pages 的 public/_redirects 把 /<lang>/* 重写到对应语言入口页；不带前缀的深链靠 Pages 自带的 SPA 回退（没有 404.html 时任意路径都返回根入口页）。

import { ref, watch, type Ref } from 'vue'

export type RouteView = '2d' | '3d' | 'lib'
export type RouteLang = 'zh' | 'ja' | 'en'

export interface Route {
  /** 路径里的语言前缀；没有前缀时为 null */
  lang: RouteLang | null
  view: RouteView
  /** 素材库里打开的素材 id（只有 view === 'lib' 时可能有） */
  asset?: string
}

const SEG_VIEW: Record<string, RouteView> = { '': '2d', plan: '2d', '3d': '3d', library: 'lib' }
const VIEW_SEG: Record<RouteView, string> = { '2d': 'plan', '3d': '3d', lib: 'library' }

/** 解析路径：/en/3d → { lang: 'en', view: '3d' }；认不出的路径当平面图 */
export function parseRoute(pathname: string): Route {
  const segs = pathname.split('/').filter(Boolean)
  let lang: RouteLang | null = null
  if (segs[0] === 'zh' || segs[0] === 'ja' || segs[0] === 'en') lang = segs.shift() as RouteLang
  // 构建产物里的入口页文件名（/en/index.html）也算入口
  if (segs[0] === 'index.html') segs.shift()
  const view = SEG_VIEW[segs[0] ?? ''] ?? '2d'
  let asset: string | undefined
  if (view === 'lib' && segs[1]) {
    try {
      asset = decodeURIComponent(segs[1])
    } catch {
      asset = undefined
    }
  }
  return { lang, view, ...(asset ? { asset } : {}) }
}

/** 拼路径：保留原来有没有语言前缀的写法 */
export function buildPath(r: Route): string {
  const pre = r.lang ? `/${r.lang}` : ''
  const asset = r.view === 'lib' && r.asset ? `/${encodeURIComponent(r.asset)}` : ''
  return `${pre}/${VIEW_SEG[r.view]}${asset}`
}

const here = (): Route => (typeof location === 'undefined' ? { lang: null, view: '2d' } : parseRoute(location.pathname))

/** 首屏的视图（store.ts 用它当 viewMode 的初值） */
export const initialRoute = here()

/** 素材库当前的素材 id（地址里带的；AssetLibrary 读写它） */
export const routeAsset = ref<string | undefined>(initialRoute.asset)

/** 当前地址的路径（不含 hash）是不是已经等于 r：避免重复 pushState */
function sameAsHere(r: Route) {
  const cur = here()
  return cur.view === r.view && (cur.asset ?? '') === (r.view === 'lib' ? (r.asset ?? '') : '')
}

function go(r: Route, replace: boolean) {
  if (sameAsHere(r)) return
  const u = new URL(location.href)
  u.pathname = buildPath({ ...r, lang: here().lang })
  if (replace) history.replaceState(history.state, '', u)
  else history.pushState(null, '', u)
}

let inited = false

/** 接上地址栏：viewMode 变化 → pushState；后退 / 前进（popstate）→ viewMode */
export function initRouter(viewMode: Ref<RouteView>) {
  if (inited || typeof window === 'undefined') return
  inited = true
  let fromPop = false
  watch(viewMode, (v) => {
    if (fromPop) return
    go({ lang: null, view: v, asset: v === 'lib' ? routeAsset.value : undefined }, false)
  }, { flush: 'sync' })
  watch(routeAsset, (id) => {
    if (fromPop || viewMode.value !== 'lib') return
    go({ lang: null, view: 'lib', asset: id }, true)
  }, { flush: 'sync' })
  window.addEventListener('popstate', () => {
    const r = here()
    fromPop = true
    viewMode.value = r.view
    if (r.asset) routeAsset.value = r.asset
    // 上面两个 watch 是同步的：赋值时已经看过 fromPop
    fromPop = false
  })
}
