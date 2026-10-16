<script setup lang="ts">
// 底部抽屉（手机 / 平板竖屏）：收起 / 半屏 / 全屏三档，拖把手或标题区上下滑动切换，松手按位置和速度吸附到最近一档。
// enabled 为假时（桌面）只是一个普通的纵向容器：标题区在上、内容区可滚动，和原来的侧栏一样。
// 手机横屏时靠右停靠成侧抽屉（宽度不超过 420px），免得挡住大半个画面。
//
// 用法：<BottomSheet v-model="snap" :enabled="device.compact"><template #header>…</template>内容</BottomSheet>
// 标题区里可以放横向滚动的标签 / 工具条：只有竖向为主的拖动才会拖抽屉，横向滑动照常滚动。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { device, layout } from '../ui/device'

export type SheetSnap = 'peek' | 'half' | 'full'

const props = withDefaults(defineProps<{ enabled: boolean; modelValue: SheetSnap; label?: string }>(), { label: '' })
const emit = defineEmits<{ 'update:modelValue': [SheetSnap] }>()

const head = ref<HTMLElement>()
const body = ref<HTMLElement>()
const headH = ref(48)
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(() => {
    if (head.value) headH.value = head.value.offsetHeight
  })
  if (head.value) ro.observe(head.value)
})
onBeforeUnmount(() => ro?.disconnect())

const GRIP = 22
/** 全屏时的高度：顶栏以下留 8px 缝 */
const fullH = computed(() => Math.max(200, layout.vh - layout.topBar - 8))
const heights = computed(() => {
  const peek = GRIP + headH.value + layout.safeBottom
  const full = fullH.value
  // 横屏时高度很矮：半屏没有意义，直接两档（收起 / 全高）
  const half = device.landscape ? full : Math.min(full, Math.max(peek + 160, Math.round(layout.vh * 0.5)))
  return { peek, half, full }
})

/** 拖动中的可见高度（null 表示不在拖） */
const dragH = ref<number | null>(null)
const visible = computed(() => dragH.value ?? heights.value[props.modelValue])

const style = computed(() => ({
  height: fullH.value + 'px',
  transform: `translate3d(0, ${Math.round(fullH.value - visible.value)}px, 0)`,
}))
/** 内容区只占可见部分，才能滚到底 */
const bodyStyle = computed(() => (props.enabled ? { height: Math.max(0, heights.value[props.modelValue] - GRIP - headH.value - layout.safeBottom) + 'px' } : undefined))

// ---------- 拖动 ----------

let start: { y: number; x: number; h: number; id: number; decided: boolean; fromGrip: boolean } | null = null
const samples: { t: number; y: number }[] = []
let suppressClick = false

function onDown(e: PointerEvent, fromGrip: boolean) {
  if (!props.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return
  start = { y: e.clientY, x: e.clientX, h: visible.value, id: e.pointerId, decided: fromGrip, fromGrip }
  samples.length = 0
  samples.push({ t: performance.now(), y: e.clientY })
  if (fromGrip) begin(e)
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}
function begin(e: PointerEvent) {
  start!.decided = true
  dragH.value = start!.h
  try {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  } catch {
    /* 已经被别的元素捕获 */
  }
}
function onMove(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return
  const dy = e.clientY - start.y
  const dx = e.clientX - start.x
  if (!start.decided) {
    // 标题区：竖向为主的拖动才接管；横向就让给标签条滚动
    if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
    if (Math.abs(dy) <= Math.abs(dx)) return cancel()
    begin(e)
  }
  e.preventDefault()
  const h = heights.value
  // 超出两端时带阻尼
  let v = start.h - dy
  if (v > h.full) v = h.full + (v - h.full) * 0.25
  if (v < h.peek) v = h.peek - (h.peek - v) * 0.25
  dragH.value = v
  samples.push({ t: performance.now(), y: e.clientY })
  if (samples.length > 6) samples.shift()
}
function onUp(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return
  const wasDrag = dragH.value !== null
  if (wasDrag) {
    const h = heights.value
    const v = dragH.value!
    const a = samples[0]
    const b = samples[samples.length - 1]
    const vel = a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0 // px/ms，向下为正
    const order: SheetSnap[] = device.landscape ? ['peek', 'full'] : ['peek', 'half', 'full']
    let target: SheetSnap
    if (Math.abs(vel) > 0.45) {
      // 快速甩动：按方向去上一档 / 下一档
      const cur = order.reduce((best, s) => (Math.abs(h[s] - v) < Math.abs(h[best] - v) ? s : best), order[0])
      const i = order.indexOf(cur)
      const goingUp = vel < 0
      const nearIdx = goingUp ? (h[cur] < v ? Math.min(order.length - 1, i + 1) : i) : h[cur] > v ? Math.max(0, i - 1) : i
      target = order[nearIdx]
    } else target = order.reduce((best, s) => (Math.abs(h[s] - v) < Math.abs(h[best] - v) ? s : best), order[0])
    emit('update:modelValue', target)
    // 拖过之后紧跟着的 click 不算点按钮
    suppressClick = true
    setTimeout(() => (suppressClick = false), 0)
  } else if (start.fromGrip) {
    // 点一下把手：收起 ↔ 半屏
    emit('update:modelValue', props.modelValue === 'peek' ? (device.landscape ? 'full' : 'half') : 'peek')
  }
  cancel()
}
function cancel() {
  start = null
  dragH.value = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
}
function onClickCapture(e: MouseEvent) {
  if (suppressClick) {
    e.stopPropagation()
    e.preventDefault()
  }
}
onBeforeUnmount(cancel)

// 换到收起时内容区回到顶部，下次展开从头看
watch(
  () => props.modelValue,
  (s) => {
    if (s === 'peek' && body.value) body.value.scrollTop = 0
  },
)

/** 键盘可达：把手是按钮，Enter / 空格切换 */
function onGripKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('update:modelValue', props.modelValue === 'peek' ? 'half' : props.modelValue === 'half' ? 'full' : 'peek')
}

// 把露出的高度告诉外面（浮动工具条往上让）；横屏侧抽屉不挡底部，记 0
watch(
  () => [props.enabled, heights.value[props.modelValue], device.landscape] as const,
  ([on, h, land]) => (layout.sheetH = on && !land ? h : 0),
  { immediate: true },
)
onBeforeUnmount(() => {
  if (props.enabled) layout.sheetH = 0
})

defineExpose({ body })
</script>

<template>
  <aside class="bs" :class="{ on: enabled, dragging: dragH !== null, ['s-' + modelValue]: enabled }" :style="enabled ? style : undefined" :aria-label="label || undefined" @click.capture="onClickCapture">
    <div v-if="enabled" class="bs-grip" role="button" tabindex="0" :aria-label="label" :aria-expanded="modelValue !== 'peek'" @pointerdown="onDown($event, true)" @keydown="onGripKey">
      <span class="bs-handle" />
    </div>
    <div ref="head" class="bs-head" @pointerdown="onDown($event, false)">
      <slot name="header" />
    </div>
    <div ref="body" class="bs-body" :style="bodyStyle">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.bs {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.bs-head {
  flex: none;
}
.bs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* ---------- 抽屉形态 ---------- */
.bs.on {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  width: auto;
  max-width: none;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 16px 16px 0 0;
  background: var(--surface-2);
  box-shadow: 0 -6px 24px rgba(32, 38, 34, 0.12);
  padding-bottom: var(--safe-b, env(safe-area-inset-bottom, 0px));
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
  touch-action: auto;
}
.bs.on.dragging {
  transition: none;
}
.bs.on .bs-head {
  touch-action: pan-x;
}
.bs.on .bs-body {
  flex: none;
  -webkit-overflow-scrolling: touch;
}
.bs-grip {
  flex: none;
  height: 22px;
  display: grid;
  place-items: center;
  cursor: grab;
  touch-action: none;
  outline: none;
}
.bs-grip:focus-visible .bs-handle {
  background: var(--accent);
}
.bs-handle {
  width: 40px;
  height: 5px;
  border-radius: 99px;
  background: var(--border-strong);
}
/* 手机横屏：靠右的侧抽屉 */
:root.landscape .bs.on {
  left: auto;
  right: max(8px, env(safe-area-inset-right, 0px));
  width: min(420px, 48vw);
  border-radius: 16px 16px 0 0;
}
@media (prefers-reduced-motion: reduce) {
  .bs.on {
    transition: none;
  }
}
</style>
