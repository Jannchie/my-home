<script setup lang="ts">
// 通用右键菜单：传入位置和条目，点外面 / Esc / 滚动 / 失焦时关闭；贴边时自动往里收。
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import type { AppIcon } from '../ui/icons'
import XLogo from './XLogo.vue'

export interface MenuItem {
  label: string
  icon?: AppIcon
  /** 品牌图标（jannchie-icons 里没有的）：目前只有 X */
  brand?: 'x'
  /** 右侧的快捷键提示 */
  keys?: string
  danger?: boolean
  disabled?: boolean
  action: () => void
}
export type MenuEntry = MenuItem | 'sep' | { header: string }

const props = defineProps<{ x: number; y: number; items: MenuEntry[]; title?: string }>()
const emit = defineEmits<{ close: [] }>()

const el = ref<HTMLElement>()
const pos = ref({ x: props.x, y: props.y })

async function place() {
  pos.value = { x: props.x, y: props.y }
  await nextTick()
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  pos.value = {
    x: Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8)),
    y: props.y + r.height > window.innerHeight - 8 ? Math.max(8, props.y - r.height) : props.y,
  }
  el.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
}
watch(() => [props.x, props.y], place)

function run(it: MenuItem) {
  if (it.disabled) return
  emit('close')
  it.action()
}

function onDown(e: PointerEvent) {
  if (!el.value?.contains(e.target as Node)) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    // 上下键在条目间移动
    e.preventDefault()
    e.stopPropagation()
    const btns = [...(el.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const n = btns.length
    btns[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus()
  }
}
const close = () => emit('close')

onMounted(() => {
  place()
  document.addEventListener('pointerdown', onDown, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  document.addEventListener('wheel', close, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDown, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
  document.removeEventListener('wheel', close, true)
})
</script>

<template>
  <div ref="el" class="cm" role="menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent>
    <div v-if="title" class="cm-title">{{ title }}</div>
    <template v-for="(it, i) in items" :key="i">
      <div v-if="it === 'sep'" class="cm-sep" role="separator" />
      <div v-else-if="'header' in it" class="cm-head">{{ it.header }}</div>
      <button v-else role="menuitem" class="cm-item" :class="{ danger: it.danger }" :disabled="it.disabled" @click="run(it)">
        <XLogo v-if="it.brand === 'x'" :size="15" />
        <JIcon v-else-if="it.icon" :icon="it.icon" :size="15" />
        <span v-else class="cm-ico" />
        <span class="cm-label">{{ it.label }}</span>
        <kbd v-if="it.keys">{{ it.keys }}</kbd>
      </button>
    </template>
  </div>
</template>

<style scoped>
.cm {
  position: fixed;
  z-index: 70;
  min-width: 200px;
  max-width: 300px;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 10px 30px rgba(32, 38, 34, 0.16);
  animation: cm-in 0.1s ease-out;
}
.cm-title {
  padding: 4px 8px 6px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm-head {
  padding: 6px 8px 2px;
  font-size: var(--fs-xs);
  color: var(--text-faint);
}
.cm-sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--border);
}
.cm-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border-color: transparent;
  background: transparent;
  text-align: left;
}
.cm-item:hover:not(:disabled),
.cm-item:focus-visible {
  background: var(--hover);
  border-color: transparent;
  outline: none;
}
.cm-item > svg {
  color: var(--text-muted);
}
.cm-item.danger,
.cm-item.danger > svg {
  color: var(--danger);
}
.cm-item.danger:hover:not(:disabled) {
  background: var(--danger-weak);
}
.cm-ico {
  width: 15px;
  flex: none;
}
.cm-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm kbd {
  margin-left: 12px;
  color: var(--text-faint);
}
@keyframes cm-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
}
/* 触屏：条目 44px 高，菜单不超出屏幕 */
:root.coarse .cm {
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
}
:root.coarse .cm-item {
  height: 44px;
  font-size: var(--fs-base);
}
/* 触屏没有键盘：快捷键提示不显示 */
:root.coarse .cm kbd {
  display: none;
}
</style>
