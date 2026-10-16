<script setup lang="ts">
// 全局即时提示：接管页面上所有 title（原生 title 要停顿约 1 秒才出现，样式也和界面不搭）。
// 指到带 title 的元素时把它挪到 data-tip（去掉原生提示），稍等后在元素下方显示；
// 末尾形如「(Ctrl Z)」「(G)」的快捷键单独排成按键样式。在提示之间移动时不再等待。
import { onBeforeUnmount, onMounted, ref } from 'vue'

const tip = ref<{ text: string; keys: string[]; x: number; y: number; below: boolean } | null>(null)
let target: Element | null = null
let timer = 0
/** 上一次提示消失的时间：刚看过提示时，挪到相邻按钮立即显示 */
let lastHide = 0

// 「(Ctrl Shift Z)」「(G)」「(Del)」这类：只认按键名，不吃「(C 切换)」这种说明
const KEY_RE = /\s*\((?:Ctrl|Shift|Alt|Cmd|Esc|Del|Space|Enter|[A-Z0-9?/]|F\d{0,2})(?:\s+(?:Ctrl|Shift|Alt|Cmd|[A-Z0-9?/]|Del|Esc|Enter|Space))*\)\s*$/

function textOf(el: Element) {
  const t = el.getAttribute('title')
  if (t !== null) {
    // 原生提示交给我们：挪到 data-tip。Vue 只在绑定值变化时才重写 title，不会来回打架
    el.setAttribute('data-tip', t)
    el.removeAttribute('title')
  }
  return el.getAttribute('data-tip') ?? ''
}

function show(el: Element) {
  const raw = textOf(el).trim()
  if (!raw) return
  const m = KEY_RE.exec(raw)
  const text = m ? raw.slice(0, m.index) : raw
  const keys = m ? m[0].trim().slice(1, -1).split(/\s+/) : []
  const r = el.getBoundingClientRect()
  const below = r.bottom + 44 < window.innerHeight
  tip.value = { text, keys, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below }
}

function hide() {
  clearTimeout(timer)
  if (tip.value) lastHide = performance.now()
  tip.value = null
  target = null
}

function onOver(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') ?? null
  if (el === target) return
  // 挪到没有提示的地方：先收起
  if (!el) {
    hide()
    return
  }
  // 抢先把原生 title 拿走，避免原生提示也冒出来
  textOf(el)
  clearTimeout(timer)
  const wasShowing = !!tip.value || performance.now() - lastHide < 400
  tip.value = null
  target = el
  timer = window.setTimeout(() => target === el && el.isConnected && show(el), wasShowing ? 0 : 420)
}

// 位置修正：贴着视口边缘时往里收
const box = ref<HTMLElement>()
function clampX(x: number) {
  const w = box.value?.offsetWidth ?? 0
  return Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, x))
}

onMounted(() => {
  document.addEventListener('pointerover', onOver, true)
  document.addEventListener('pointerdown', hide, true)
  document.addEventListener('wheel', hide, { capture: true, passive: true })
  window.addEventListener('keydown', hide, true)
  window.addEventListener('blur', hide)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerover', onOver, true)
  document.removeEventListener('pointerdown', hide, true)
  document.removeEventListener('wheel', hide, true)
  window.removeEventListener('keydown', hide, true)
  window.removeEventListener('blur', hide)
})
</script>

<template>
  <div
    v-if="tip"
    ref="box"
    class="tip"
    :class="{ above: !tip.below }"
    role="tooltip"
    :style="{ left: clampX(tip.x) + 'px', top: tip.y + 'px' }"
  >
    <span>{{ tip.text }}</span>
    <span v-if="tip.keys.length" class="keys"><kbd v-for="k in tip.keys" :key="k">{{ k }}</kbd></span>
  </div>
</template>

<style scoped>
.tip {
  position: fixed;
  z-index: 100;
  transform: translateX(-50%);
  max-width: 320px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 9px;
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--text-inverse);
  background: rgba(36, 40, 38, 0.92);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  pointer-events: none;
  animation: tip-in 0.12s ease-out;
}
.tip.above {
  transform: translate(-50%, -100%);
}
.keys {
  display: inline-flex;
  gap: 3px;
  flex: none;
}
.tip kbd {
  margin: 0;
  min-width: 18px;
  padding: 0 5px;
  text-align: center;
  color: var(--text-inverse);
  background: rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  line-height: 18px;
}
@keyframes tip-in {
  from {
    opacity: 0;
  }
}
</style>
