// PWA：注册 service worker（public 之外由 vite.config.ts 的 sw 插件在构建时生成 /sw.js，开发环境不注册）。
// 新版本装好、在等待时 needRefresh = true，界面提示「有新版本」，点刷新后让新 SW 接管再整页重载。
import { reactive } from 'vue'

export const pwa = reactive({ needRefresh: false, offlineReady: false })

let waiting: ServiceWorker | null = null

export function applyUpdate() {
  if (!waiting) return location.reload()
  // 新 SW 接管（controllerchange）后再重载，保证拿到的是新资源
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function dismissUpdate() {
  pwa.needRefresh = false
}

export function registerSW() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return
        sw.addEventListener('statechange', () => {
          if (sw.state !== 'installed') return
          if (navigator.serviceWorker.controller) {
            // 已有旧版本在控制页面：新版本等待中
            waiting = sw
            pwa.needRefresh = true
          } else pwa.offlineReady = true
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting
        pwa.needRefresh = true
      }
      track(reg.installing)
      reg.addEventListener('updatefound', () => track(reg.installing))
      // 长时间开着的页面：每小时、以及切回前台时检查一次更新
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    } catch {
      /* 注册失败（隐私模式等）：不影响在线使用 */
    }
  })
}
