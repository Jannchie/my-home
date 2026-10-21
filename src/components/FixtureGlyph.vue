<script setup lang="ts">
// 设备符号，局部坐标：中心在原点，背面（贴墙一侧）朝 -y。
// 外层负责 translate + rotate；文字反向旋转保持正立。
import { computed } from 'vue'
import { KITCHEN, fixtureDepth, polyPath, type Fixture } from '../model'
import { jp, t } from '../i18n'
import { stairLayout, stairsVariant } from '../stairs'
import { DEFAULT_FLOOR_H, SLAB } from '../floors'
import type { StallWalls } from '../bathroom'

/** rise：楼梯的层间高（决定级数），不给按默认层高 + 楼板厚；stall：淋浴房哪几边贴墙（不给 = 只有正面不贴墙） */
const props = defineProps<{ f: Fixture; rise?: number; stall?: StallWalls }>()

const w = computed(() => props.f.w)
const d = computed(() => fixtureDepth(props.f))
const back = computed(() => -d.value / 2)
const LINE = '#2b2925'

/** 淋浴房的玻璃隔断：每一面不贴墙的边一道（局部坐标，背面朝 -y） */
const stallGlass = computed(() => {
  const s = props.stall ?? { back: true, left: true, right: true, front: false }
  const hw = w.value / 2 - 2
  const hd = d.value / 2 - 2
  const out: [number, number, number, number][] = []
  if (!s.front) out.push([-w.value / 2, hd, w.value / 2, hd])
  if (!s.back) out.push([-w.value / 2, -hd, w.value / 2, -hd])
  if (!s.left) out.push([-hw, -d.value / 2, -hw, d.value / 2])
  if (!s.right) out.push([hw, -d.value / 2, hw, d.value / 2])
  return out
})
const FILL = '#ffffff'

/** 楼梯：踏步线、上楼箭头（局部坐标），起步处画一个小圆 */
const stairs = computed(() => {
  if (props.f.kind !== 'stairs') return null
  const L = stairLayout(props.f, props.rise ?? DEFAULT_FLOOR_H + SLAB)
  const path = L.path
  const end = path[path.length - 1]
  const prev = path[path.length - 2] ?? path[0]
  const dx = end.x - prev.x
  const dy = end.y - prev.y
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l
  const uy = dy / l
  const head = `M${end.x - ux * 16 - uy * 9},${end.y - uy * 16 + ux * 9}L${end.x},${end.y}L${end.x - ux * 16 + uy * 9},${end.y - uy * 16 - ux * 9}`
  return { steps: L.steps.map((st) => polyPath(st.poly)), line: polyPath(path, false), head, start: path[0], spiral: stairsVariant(props.f) === 'spiral', r: L.radius ?? 0 }
})
</script>

<template>
  <!-- 厨房：対面多一条背面柜；主台面上水槽 + 三口灶 -->
  <g v-if="f.kind === 'kitchen'" :transform="f.flip ? 'scale(-1 1)' : undefined">
    <rect v-if="f.variant === 'facing'" :x="-w / 2" :y="back" :width="w" :height="KITCHEN.back" :fill="FILL" :stroke="LINE" stroke-width="1.5" />
    <rect :x="-w / 2" :y="d / 2 - KITCHEN.counter" :width="w" :height="KITCHEN.counter" :fill="FILL" :stroke="LINE" stroke-width="1.5" />
    <rect
      :x="-w / 2 + w * 0.3 - 32"
      :y="d / 2 - KITCHEN.counter / 2 - 20"
      width="64"
      height="40"
      rx="8"
      fill="#e8f0f2"
      :stroke="LINE"
      stroke-width="1"
    />
    <circle
      v-for="(o, i) in [[-16, -11], [16, -11], [0, 13]]"
      :key="i"
      :cx="w / 2 - 50 + o[0]"
      :cy="(f.variant === 'facing' && f.island ? back + KITCHEN.back / 2 : d / 2 - KITCHEN.counter / 2) + o[1] * (f.variant === 'facing' && f.island ? 0.8 : 1)"
      r="8"
      fill="none"
      :stroke="LINE"
      stroke-width="1"
    />
  </g>

  <!-- 淋浴房：方形底盘 + 对角线 + 地漏，每一面不贴墙的边一道玻璃隔断 -->
  <g v-else-if="f.kind === 'bathtub' && f.shower">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" rx="2" fill="#eef6f8" :stroke="LINE" stroke-width="1.5" />
    <path :d="`M${-w / 2} ${-d / 2}L${w / 2} ${d / 2}M${w / 2} ${-d / 2}L${-w / 2} ${d / 2}`" :stroke="LINE" stroke-width="0.6" fill="none" />
    <circle cx="0" cy="0" r="4" :fill="FILL" :stroke="LINE" stroke-width="1" />
    <line v-for="(l, i) in stallGlass" :key="i" :x1="l[0]" :y1="l[1]" :x2="l[2]" :y2="l[3]" :stroke="LINE" stroke-width="2.4" />
  </g>

  <!-- 浴缸：外框 + 圆角内槽 + 排水口 -->
  <g v-else-if="f.kind === 'bathtub'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" rx="3" :fill="FILL" :stroke="LINE" stroke-width="1.5" />
    <rect :x="-w / 2 + 8" :y="-d / 2 + 8" :width="w - 16" :height="d - 16" :rx="Math.min(18, (d - 16) / 2)" fill="#e6f1f4" :stroke="LINE" stroke-width="1" />
    <circle :cx="w / 2 - 22" cy="0" r="3.5" fill="none" :stroke="LINE" stroke-width="1" />
  </g>

  <!-- 马桶：水箱 + 椭圆坐便 -->
  <g v-else-if="f.kind === 'toilet'">
    <rect :x="-w / 2 - 3" :y="back" :width="w + 6" height="18" rx="3" :fill="FILL" :stroke="LINE" stroke-width="1.5" />
    <ellipse cx="0" :cy="back + 18 + (d - 18) / 2" :rx="w * 0.42" :ry="(d - 18) / 2 - 1" :fill="FILL" :stroke="LINE" stroke-width="1.5" />
    <ellipse cx="0" :cy="back + 18 + (d - 18) / 2 + 2" :rx="w * 0.26" :ry="(d - 18) / 2 - 9" fill="none" :stroke="LINE" stroke-width="0.8" />
  </g>

  <!-- 洗面台：台面 + 椭圆面盆 + 龙头 -->
  <g v-else-if="f.kind === 'basin'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" rx="2" :fill="FILL" :stroke="LINE" stroke-width="1.5" />
    <ellipse cx="0" :cy="d * 0.06" :rx="w * 0.32" :ry="d * 0.3" fill="#e6f1f4" :stroke="LINE" stroke-width="1" />
    <circle cx="0" :cy="-d / 2 + 7" r="2.5" :fill="LINE" />
  </g>

  <!-- 洗衣机位（防水盘）：方框 + 圆 -->
  <g v-else-if="f.kind === 'washer'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" rx="4" :fill="FILL" :stroke="LINE" stroke-width="1.2" stroke-dasharray="5 3" />
    <circle cx="0" cy="0" :r="Math.min(w, d) * 0.3" fill="none" :stroke="LINE" stroke-width="1" />
  </g>

  <!-- 冰箱位：方框 + 「冷」 -->
  <g v-else-if="f.kind === 'fridge'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" :fill="FILL" :stroke="LINE" stroke-width="1.2" stroke-dasharray="5 3" />
    <text :transform="`rotate(${-f.rot})`" text-anchor="middle" dominant-baseline="central" font-size="24" :fill="LINE">{{ t('冷') }}</text>
  </g>

  <!-- PS 管道井：斜线填充 -->
  <!-- 内置收纳：柜体 + 柜门分格；嵌墙的画虚线框 -->
  <g v-else-if="f.kind === 'builtin'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" :fill="FILL" :stroke="LINE" stroke-width="1.2" :stroke-dasharray="f.recessed ? '4 3' : undefined" />
    <line v-for="k in Math.max(1, Math.round(w / 45)) - 1" :key="k" :x1="-w / 2 + (w / Math.max(1, Math.round(w / 45))) * k" :x2="-w / 2 + (w / Math.max(1, Math.round(w / 45))) * k" :y1="d / 2" :y2="d / 2 - 8" :stroke="LINE" stroke-width="0.8" />
    <text :transform="`rotate(${-f.rot})`" text-anchor="middle" dominant-baseline="central" font-size="11" :fill="LINE">{{ jp(f.builtinType === 'pantry' ? '食' : f.builtinType === 'closet' ? '収' : '下駄') }}</text>
  </g>

  <g v-else-if="f.kind === 'ps'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" fill="url(#hatch-ps)" :stroke="LINE" stroke-width="1.5" />
    <text :transform="`rotate(${-f.rot})`" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" :fill="LINE" paint-order="stroke" stroke="#fff" stroke-width="3">PS</text>
  </g>

  <!-- 楼梯：外框 + 踏步线 + 上楼箭头（起步处小圆） -->
  <g v-else-if="f.kind === 'stairs' && stairs">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" fill="#fbf7f0" :stroke="LINE" stroke-width="1.2" :stroke-dasharray="stairs.spiral ? '4 3' : undefined" />
    <circle v-if="stairs.spiral" cx="0" cy="0" :r="stairs.r" :fill="FILL" :stroke="LINE" stroke-width="1.2" />
    <path v-for="(p, i) in stairs.steps" :key="i" :d="p" fill="none" :stroke="LINE" stroke-width="0.9" />
    <circle v-if="stairs.spiral" cx="0" cy="0" r="6" :fill="LINE" />
    <path :d="stairs.line" fill="none" stroke="#3f6652" stroke-width="2" />
    <path :d="stairs.head" fill="none" stroke="#3f6652" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
    <circle :cx="stairs.start.x" :cy="stairs.start.y" r="5" :fill="FILL" stroke="#3f6652" stroke-width="2" />
  </g>

  <!-- 空调外机：机身 + 风扇 -->
  <g v-else-if="f.kind === 'outdoor'">
    <rect :x="-w / 2" :y="-d / 2" :width="w" :height="d" rx="2" :fill="FILL" :stroke="LINE" stroke-width="1.2" />
    <circle :cx="-w * 0.18" cy="0" :r="d * 0.36" fill="none" :stroke="LINE" stroke-width="1" />
    <line :x1="w * 0.18" :x2="w * 0.42" :y1="-d * 0.2" :y2="-d * 0.2" :stroke="LINE" stroke-width="0.8" />
    <line :x1="w * 0.18" :x2="w * 0.42" :y1="d * 0.2" :y2="d * 0.2" :stroke="LINE" stroke-width="0.8" />
  </g>
</template>
