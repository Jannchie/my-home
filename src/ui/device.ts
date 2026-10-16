// 设备与布局形态：手机 / 平板 / 桌面的判断集中在这里，组件只读这些响应式标记。
//
//   compact    —— 窄屏（手机竖横屏、平板竖屏）：侧栏 / 属性面板改成底部抽屉，顶栏精简
//   compactBar —— 顶栏收成「品牌 + 视图 + 撤销重做 + 更多」：compact，或触屏平板横屏 / 窄桌面窗口
//   coarse     —— 主要输入是手指：触控目标放大到 44px，命中半径加大
//   landscape  —— 手机横屏：底部抽屉改为靠右的侧抽屉，免得挡住大半个画面
//
// 同时把这些标记写到 <html> 的 class 上（compact / compact-bar / coarse / landscape），
// 组件的 scoped 样式用 :root.compact 选择器适配（不要用 :global(.compact) …，Vue 会把整条选择器换成 .compact），CSS 与 JS 的判断永远一致。

import { reactive, watch } from 'vue'

const mq = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null)

const Q = {
  // 宽度不到 900，或触屏且高度很矮（手机横屏）
  compact: '(max-width: 899px), (pointer: coarse) and (max-height: 520px)',
  compactBar: '(max-width: 1279px), (pointer: coarse)',
  coarse: '(pointer: coarse)',
  landscape: '(orientation: landscape) and (max-height: 520px)',
}

export const device = reactive({ compact: false, compactBar: false, coarse: false, landscape: false })

const lists = Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, mq(q)])) as Record<keyof typeof Q, MediaQueryList | null>
function sync() {
  for (const k of Object.keys(Q) as (keyof typeof Q)[]) device[k] = !!lists[k]?.matches
}
sync()
for (const l of Object.values(lists)) l?.addEventListener?.('change', sync)

if (typeof document !== 'undefined') {
  watch(
    device,
    (d) => {
      const c = document.documentElement.classList
      c.toggle('compact', d.compact)
      c.toggle('compact-bar', d.compactBar)
      c.toggle('coarse', d.coarse)
      c.toggle('landscape', d.compact && d.landscape)
    },
    { immediate: true, deep: true },
  )
  // iOS Safari 的双指缩放手势（gesturestart）不受 touch-action 管：整页缩放会把工具条挤乱，统一拦掉
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
}

// ---------- 渲染画质：手机 / 低性能设备自动降级 ----------

const QUALITY_KEY = 'my-home:quality'
export type Quality = 'auto' | 'high' | 'low'

/** 低性能设备的粗略判断：触屏、内存 ≤ 4GB 或 CPU ≤ 4 核 */
function weakDevice() {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  return !!mq('(pointer: coarse)')?.matches || (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4
}

function loadQuality(): Quality {
  try {
    const v = localStorage.getItem(QUALITY_KEY)
    if (v === 'high' || v === 'low' || v === 'auto') return v
  } catch {
    /* 读不到就自动 */
  }
  return 'auto'
}

export const gfx = reactive({ quality: loadQuality(), weak: weakDevice() })

/** 当前是否走省电画质（低像素比、无 MSAA 改 FXAA、小阴影贴图、动画 30fps） */
export const lowPower = () => (gfx.quality === 'auto' ? gfx.weak : gfx.quality === 'low')

export function setQuality(q: Quality) {
  gfx.quality = q
  try {
    localStorage.setItem(QUALITY_KEY, q)
  } catch {
    /* 存不了就只在本次生效 */
  }
}

/** 触控长按的时长（ms）与「算作点按」的最大位移（px） */
export const LONG_PRESS_MS = 480
export const TAP_SLOP = 8

// ---------- 布局尺寸：顶栏高度、安全区（底部抽屉按它们算三档高度） ----------

/** sheetH：当前启用的底部抽屉露出的高度（浮在画布上的工具条按它往上让） */
export const layout = reactive({ topBar: 56, vh: typeof window === 'undefined' ? 800 : window.innerHeight, safeBottom: 0, sheetH: 0 })

if (typeof window !== 'undefined') {
  // env(safe-area-inset-bottom) 只能在 CSS 里取：放一个探针元素量一下
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'
  const measure = () => {
    if (!probe.isConnected && document.body) document.body.appendChild(probe)
    layout.safeBottom = probe.offsetHeight || 0
    layout.vh = window.innerHeight
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', measure, { once: true })
  else measure()
  window.addEventListener('resize', measure)
  window.addEventListener('orientationchange', () => setTimeout(measure, 250))
}
