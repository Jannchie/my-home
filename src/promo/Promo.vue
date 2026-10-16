<script setup lang="ts">
// 宣传片页面：一张 3D 画布 + 平面图 / 素材库 / 标签等叠层。不跑 requestAnimationFrame——
// 由 window.__promo.frame(t) 逐帧驱动（录制脚本 scripts/record-promo.mjs），?play 时用实时时钟预览。
import { computed, nextTick, onMounted, ref } from 'vue'
import { Director, DURATION, libCards, planUi, ui } from './timeline'
import PlanLayer from './PlanLayer.vue'

const canvas = ref<HTMLCanvasElement>()
const status = ref('loading')
let director: Director

const vmin = computed(() => Math.min(ui.w, ui.h) / 100)
const ink = computed(() => (ui.dark ? '#f4f1ea' : '#2b2925'))

/** 圆角方块（logo 的形状）：圆角半径 = 边长 × 116/512 */
const R = 116 / 512
function rr(cx: number, cy: number, s: number) {
  const h = s / 2
  const r = s * R
  return `M${cx - h + r},${cy - h}H${cx + h - r}A${r},${r} 0 0 1 ${cx + h},${cy - h + r}V${cy + h - r}A${r},${r} 0 0 1 ${cx + h - r},${cy + h}H${cx - h + r}A${r},${r} 0 0 1 ${cx - h},${cy + h - r}V${cy - h + r}A${r},${r} 0 0 1 ${cx - h + r},${cy - h}Z`
}
const maskPath = computed(() => {
  const m = ui.mask
  if (!m) return ''
  const W = ui.w
  const H = ui.h
  const full = Math.hypot(W, H) * 1.12
  if (m.mode === 'cover') return rr(W / 2, H / 2, Math.max(0.01, m.k * full))
  return `M0,0H${W}V${H}H0Z` + rr(W / 2, H / 2, Math.max(0.01, m.k * full))
})

const lib = computed(() => {
  const l = ui.lib
  if (!l) return null
  const gap = l.cardW * 0.14
  const step = l.cardW + gap
  const cards = libCards.value
  const focus = cards.find((_, i) => i === focusIndex.value)
  const fx = focus ? focus.x * step + l.cardW / 2 : 0
  const fy = focus ? focus.y * step + l.cardW / 2 : 0
  // 斜向平移：从右下方往焦点卡片滑过来
  const off = { x: (1 - l.pan) * step * 3.2, y: (1 - l.pan) * step * 1.6 }
  const big = (Math.min(ui.w, ui.h) * 0.66) / l.cardW
  return { ...l, gap, step, fx, fy, off, big }
})
const focusIndex = computed(() => director?.libFocus.i ?? -1)

const clockText = computed(() => {
  const c = ui.clock
  if (!c) return ''
  const m = Math.round((((c.time % 24) + 24) % 24) * 60) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
const clockHand = computed(() => {
  const c = ui.clock
  if (!c) return { h: 0, m: 0 }
  const h = ((c.time % 12) + 12) % 12
  return { h: h * 30, m: (c.time % 1) * 360 }
})
const isDay = computed(() => {
  const c = ui.clock
  if (!c) return true
  const h = ((c.time % 24) + 24) % 24
  return h > 5 && h < 19
})

declare global {
  interface Window {
    __promo?: { ready: Promise<void>; duration: number; frame: (t: number) => Promise<void>; status: () => string }
  }
}

onMounted(async () => {
  director = new Director(canvas.value!)
  ;(window as unknown as { __director: Director }).__director = director
  const resize = () => director.resize(window.innerWidth, window.innerHeight)
  resize()
  window.addEventListener('resize', resize)
  let ready!: () => void
  const readyP = new Promise<void>((r) => (ready = r))
  window.__promo = {
    ready: readyP,
    duration: DURATION,
    status: () => status.value,
    async frame(t: number) {
      director.frame(t)
      await nextTick()
      // 等叠层（图片、SVG）真正画上屏
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    },
  }
  await document.fonts.ready
  await director.init((s) => (status.value = s))
  status.value = 'ready'
  ready()
  const q = new URLSearchParams(location.search)
  if (q.has('t')) director.frame(+q.get('t')!)
  if (q.has('play')) {
    const t0 = performance.now() - (+q.get('play')! || 0) * 1000
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      director.frame(t % DURATION)
      requestAnimationFrame(tick)
    }
    tick()
  }
})
</script>

<template>
  <div class="promo" :class="{ vertical: ui.w < ui.h }" :style="{ background: ui.bg, '--u': vmin + 'px', '--ink': ink }">
    <canvas ref="canvas" class="gl" :style="{ opacity: ui.canvasO }" />

    <!-- 平面图 -->
    <div v-if="planUi" class="layer plan" :style="{ opacity: planUi.o }">
      <svg class="grid" :width="ui.w" :height="ui.h">
        <defs>
          <pattern id="g-min" :width="50 * planUi.view.s" :height="50 * planUi.view.s" patternUnits="userSpaceOnUse" :x="planUi.view.x" :y="planUi.view.y">
            <path :d="`M${50 * planUi.view.s},0L0,0L0,${50 * planUi.view.s}`" fill="none" stroke="#e7e3da" stroke-width="1" />
          </pattern>
          <pattern id="g-maj" :width="500 * planUi.view.s" :height="500 * planUi.view.s" patternUnits="userSpaceOnUse" :x="planUi.view.x" :y="planUi.view.y">
            <path :d="`M${500 * planUi.view.s},0L0,0L0,${500 * planUi.view.s}`" fill="none" stroke="#d6d0c3" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#fbfaf7" />
        <rect width="100%" height="100%" fill="url(#g-min)" />
        <rect width="100%" height="100%" fill="url(#g-maj)" />
      </svg>
      <PlanLayer v-bind="planUi" />
    </div>

    <!-- 素材库 -->
    <div v-if="lib" class="layer lib" :style="{ opacity: lib.o }">
      <div
        class="lib-grid"
        :style="{
          transform: `translate(${ui.w / 2}px, ${ui.h / 2}px) rotate(${lib.tilt * (1 - lib.focus)}deg) translate(${lib.off.x - lib.fx}px, ${lib.off.y - lib.fy}px)`,
        }"
      >
        <div
          v-for="(c, i) in libCards"
          :key="c.id + i"
          class="card"
          :style="{
            width: lib.cardW + 'px',
            height: lib.cardW + 'px',
            left: c.x * lib.step + 'px',
            top: c.y * lib.step + 'px',
            opacity: i === focusIndex ? 1 : 1 - lib.focus,
            zIndex: i === focusIndex ? 2 : 1,
            transform: i === focusIndex ? `scale(${1 + (lib.big - 1) * lib.focus})` : undefined,
            borderRadius: lib.cardW * 0.12 + 'px',
            background: i === focusIndex ? `color-mix(in srgb, #ffffff ${100 - lib.focus * 100}%, ${ui.bg})` : '#ffffff',
          }"
        >
          <img :src="c.src" alt="" />
        </div>
      </div>
    </div>

    <!-- 角标：一行短标签 -->
    <div v-if="ui.label && ui.label.o > 0.001" class="label" :style="{ background: ui.bg, opacity: ui.label.o, transform: `translateY(${(1 - ui.label.o) * 0.8}vmin)` }">
      <svg v-if="ui.clock" class="clock" viewBox="-12 -12 24 24">
        <circle r="10.5" fill="none" :stroke="ink" stroke-width="1.6" />
        <line :transform="`rotate(${clockHand.h})`" y2="-5.5" :stroke="ink" stroke-width="1.8" stroke-linecap="round" />
        <line :transform="`rotate(${clockHand.m})`" y2="-8" :stroke="ink" stroke-width="1.2" stroke-linecap="round" />
        <circle :cx="0" :cy="0" r="1.4" fill="#577a68" />
      </svg>
      <template v-for="(p, i) in ui.label.parts" :key="i">
        <span v-if="i" class="sep">·</span>
        <span :class="{ on: p.on, dim: p.dim }">{{ p.text }}</span>
      </template>
      <!-- 第二行：一句话概括（地区段） -->
      <span v-if="ui.label.note" class="note">{{ ui.label.note }}</span>
      <span v-if="ui.clock" class="sep">·</span>
      <span v-if="ui.clock" class="num on">{{ clockText }}</span>
      <svg v-if="ui.clock" class="sunmoon" viewBox="-12 -12 24 24">
        <circle v-if="isDay" r="5" fill="#e0a64a" />
        <path v-else d="M3 -8 A8 8 0 1 0 8 4 A6.5 6.5 0 1 1 3 -8 Z" :fill="ink" />
      </svg>
    </div>

    <div class="brand" :style="{ opacity: ui.brand }">
      <svg viewBox="0 0 512 512" class="mark"><rect width="512" height="512" rx="116" fill="#577a68" /><g transform="translate(64 64) scale(16)" fill="none" stroke="#fbfbf9" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.5h15a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zm-1 9h5m4 0h8m-6 0v4" /></g></svg>
      <span>My Home</span>
    </div>

    <!-- 光标（平面图演示） -->
    <svg v-if="ui.cursor && ui.cursor.o > 0.001" class="cursor" :style="{ left: ui.cursor.x + 'px', top: ui.cursor.y + 'px', opacity: ui.cursor.o }" viewBox="-20 -20 60 60">
      <circle r="13" fill="rgba(87,122,104,0.18)" stroke="#577a68" stroke-width="1.6" :transform="`scale(${0.4 + 0.6 * ui.cursor.down})`" :opacity="ui.cursor.down" />
      <path d="M0 0 L0 22 L5.6 16.6 L9.6 25.4 L13.4 23.6 L9.6 15 L17 15 Z" fill="#2b2925" stroke="#fbfaf7" stroke-width="2" stroke-linejoin="round" />
    </svg>

    <!-- 圆角方块遮罩 -->
    <svg v-if="ui.mask" class="layer mask" :viewBox="`0 0 ${ui.w} ${ui.h}`">
      <path :d="maskPath" fill="#577a68" fill-rule="evenodd" />
    </svg>

    <!-- 结尾 -->
    <div v-if="ui.end" class="layer end">
      <div class="blk" :style="{ left: 0, top: 0, width: '50%', height: '100%', transform: `translateX(${-(1 - ui.end.blocks) * 100}%)` }" />
      <div class="blk" :style="{ right: 0, top: 0, width: '50%', height: '100%', transform: `translateX(${(1 - ui.end.blocks) * 100}%)` }" />
      <div class="blk" :style="{ left: 0, top: 0, width: '100%', height: '50%', transform: `translateY(${-(1 - Math.min(1, ui.end.blocks * 1.08)) * 100}%)` }" />
      <div class="blk" :style="{ left: 0, bottom: 0, width: '100%', height: '50%', transform: `translateY(${(1 - Math.min(1, ui.end.blocks * 1.08)) * 100}%)` }" />
      <div class="card-end" :style="{ opacity: ui.end.logo, transform: `translateY(${(1 - ui.end.logo) * 2}vmin)` }">
        <svg viewBox="0 0 512 512" class="logo"><rect width="512" height="512" rx="116" fill="#f4f1ea" /><g transform="translate(64 64) scale(16)" fill="none" stroke="#577a68" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.5h15a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zm-1 9h5m4 0h8m-6 0v4" /></g></svg>
        <div class="big">My Home</div>
        <div class="small">生成一个带有生活气息的家</div>
        <div class="small url">home.jannchie.com</div>
      </div>
    </div>

    <div v-if="status !== 'ready'" class="status">{{ status }}</div>
  </div>
</template>

<style>
html,
body,
#promo {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>

<style scoped>
.promo {
  position: fixed;
  inset: 0;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif;
  color: var(--ink);
  /* 两个字号：small = 2.6u，big = 7.2u */
  --small: calc(var(--u) * 2.6);
  --big: calc(var(--u) * 7.2);
}
.promo.vertical {
  --small: calc(var(--u) * 3.3);
  --big: calc(var(--u) * 9);
}
.promo.vertical .label {
  bottom: calc(var(--u) * 26);
  left: 50%;
  translate: -50% 0;
}
.promo.vertical .brand {
  bottom: calc(var(--u) * 27.4);
  right: 50%;
  translate: 50% 0;
}
.gl {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.grid {
  position: absolute;
  inset: 0;
}
.lib-grid {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.card {
  position: absolute;
  overflow: hidden;
  display: grid;
  place-items: center;
  box-shadow: 0 0 0 1px rgba(43, 41, 37, 0.06);
}
.card img {
  width: 92%;
  height: 92%;
  object-fit: contain;
}
.label {
  position: absolute;
  left: calc(var(--u) * 4);
  bottom: calc(var(--u) * 3.4);
  padding: calc(var(--u) * 1.1) calc(var(--u) * 1.4);
  border-radius: calc(var(--u) * 1);
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 1);
  font-size: var(--small);
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.label:has(.note) {
  flex-wrap: wrap;
  row-gap: calc(var(--u) * 0.6);
}
.promo.vertical .label:has(.note) {
  justify-content: center;
}
.label .note {
  flex-basis: 100%;
  font-weight: 400;
  opacity: 0.72;
  /* 一句话，不折行：标签宽度跟着句子撑开 */
  white-space: nowrap;
}
.label .sep {
  opacity: 0.35;
}
.label .on {
  color: #577a68;
}
.label .dim {
  opacity: 0.32;
}
.label .num {
  font-variant-numeric: tabular-nums;
}
.clock,
.sunmoon {
  width: calc(var(--small) * 1.05);
  height: calc(var(--small) * 1.05);
}
.brand {
  position: absolute;
  right: calc(var(--u) * 5.4);
  bottom: calc(var(--u) * 4.5);
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 0.9);
  font-size: var(--small);
  font-weight: 600;
}
.brand .mark {
  width: calc(var(--small) * 1.1);
  height: calc(var(--small) * 1.1);
}
.cursor {
  position: absolute;
  width: calc(var(--u) * 5.4);
  height: calc(var(--u) * 5.4);
  margin-left: calc(var(--u) * -1.8);
  margin-top: calc(var(--u) * -1.8);
  overflow: visible;
}
.blk {
  position: absolute;
  background: #577a68;
}
.card-end {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #f4f1ea;
  gap: calc(var(--u) * 1.4);
}
.card-end .logo {
  width: calc(var(--u) * 13);
  height: calc(var(--u) * 13);
  margin-bottom: calc(var(--u) * 1.4);
}
.card-end .big {
  font-size: var(--big);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.card-end .small {
  font-size: var(--small);
  font-weight: 500;
}
.card-end .url {
  opacity: 0.72;
  margin-top: calc(var(--u) * 0.4);
}
.status {
  position: absolute;
  left: 8px;
  top: 8px;
  font: 12px monospace;
  opacity: 0.5;
}
</style>
