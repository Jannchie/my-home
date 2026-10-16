// My Home 的 service worker 源码生成器：构建时由 vite.config.ts 的 pwa 插件调用，填入版本号和预缓存清单，输出为 dist/sw.js。
//
// 缓存策略：
//   - 安装时预缓存应用壳（入口页、全部带 hash 的 JS / CSS、图标、manifest），之后离线也能打开；
//   - 页面导航：先走网络（拿到最新入口页），失败再用缓存（离线）；
//   - /assets/ 下带 hash 的文件：缓存优先（内容永不变）；
//   - 其他同源文件、Google Fonts、字体 CDN：先给缓存、后台再更新（stale-while-revalidate）。
// 新版本安装好后不自动接管：页面提示「有新版本」，用户点刷新时发 SKIP_WAITING 再接管（见 src/ui/pwa.ts）。

/** public/ 里要预缓存的文件（分享卡片大图 og*.png 不缓存） */
export const PUBLIC_PRECACHE = ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/manifest.webmanifest']

/** 简单的字符串 hash（FNV-1a），当 SW 版本号用：清单里任何文件名（含内容 hash）变了，版本就变 */
export function swVersion(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function swSource(version: string, precache: string[]) {
  return `const VERSION = '${version}'
const PRECACHE = ${JSON.stringify(precache, null, 2)}
const SHELL = \`my-home-shell-\${VERSION}\`
const RUNTIME = 'my-home-runtime'
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jannchie.com']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('my-home-shell-') && k !== SHELL) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

async function networkFirst(request) {
  try {
    const res = await fetch(request)
    if (res.ok) {
      const c = await caches.open(SHELL)
      c.put(request, res.clone())
    }
    return res
  } catch {
    const hit = await caches.match(request, { ignoreSearch: true })
    if (hit) return hit
    // 语言入口（/ja/ 等）没缓存到时退回根入口页
    return (await caches.match('/')) || Response.error()
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) {
    const c = await caches.open(SHELL)
    c.put(request, res.clone())
  }
  return res
}

async function staleWhileRevalidate(request, cacheName) {
  const c = await caches.open(cacheName)
  const hit = await c.match(request)
  const net = fetch(request)
    .then((res) => {
      // 跨域字体是 opaque 响应（status 0），也照样缓存
      if (res.ok || res.type === 'opaque') c.put(request, res.clone())
      return res
    })
    .catch(() => hit)
  return hit || net
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') return event.respondWith(networkFirst(request))
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request))
    if (url.pathname === '/sw.js') return
    return event.respondWith(staleWhileRevalidate(request, SHELL))
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(request, RUNTIME))
})
`
}
