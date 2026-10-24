<script setup lang="ts">
// 内收柱（梁）的直观调节：左边是站在房间里看这面墙的立面（拖两端改长、拖梁身改位置、拖底边改下垂高度），
// 右边是剖面（拖正面改深度、拖底边改高）。挂在这面墙上的空调等画成浅色框，看得出会不会挂到梁上。
// 拖动中实时改（只记一次撤销，松手 settle），尺寸吸到 5 cm。两张图都拉伸到固定高度（示意，不保持比例），细长的墙也好拖。
import { computed, ref } from 'vue'
import { edgeInfo, type Room, type WallBeam } from '../model'
import { plan, previewWallFace, settle } from '../store'
import { BEAM_MAX_H, BEAM_MIN, clampBeam } from '../wallFace'
import { roomWallH, wallMounted } from '../beamMount'

const props = defineProps<{ room: Room; edge: number; beam: WallBeam }>()

const L = computed(() => edgeInfo(props.room.points, props.edge).length)
const H = computed(() => roomWallH(plan.value, props.room))
/** 站在房间里面朝这面墙：边的起点在左边吗（平面图 y 朝下，看向 out 时左手是 (out.y, -out.x)） */
const startLeft = computed(() => {
  const e = edgeInfo(props.room.points, props.edge)
  return e.dir.x * e.out.y - e.dir.y * e.out.x > 0
})
/** 沿墙距离（到起点） ↔ 立面图横坐标 */
const toX = (along: number) => (startLeft.value ? along : L.value - along)

const b = computed(() => clampBeam(props.beam, L.value))
const beamRect = computed(() => {
  const x0 = toX(b.value.offset - b.value.w / 2)
  const x1 = toX(b.value.offset + b.value.w / 2)
  return { x: Math.min(x0, x1), w: Math.abs(x1 - x0), h: b.value.h }
})
// 立面图 y 朝下：0 是天花
const yOf = (z: number) => H.value - z
const mounted = computed(() =>
  wallMounted(plan.value, props.room, props.edge).map((m) => ({ id: m.id, x: toX(m.along) - m.w / 2, w: m.w, y: yOf(m.z1), h: m.z1 - m.z0 })),
)

/** 剖面：墙厚画 WALL，右边留够梁深（至少 60 cm）的地方 */
const WALL = 12
const secW = computed(() => WALL + Math.max(b.value.d, 60) + 10)

type Grip = 'body' | 'left' | 'right' | 'bottom' | 'depth'
const drag = ref<{ grip: Grip; svg: SVGSVGElement; x0: number; y0: number; start: WallBeam; first: boolean } | null>(null)

/** 屏幕坐标 → 这张 svg 的 viewBox 坐标（cm） */
function local(svg: SVGSVGElement, e: PointerEvent) {
  const m = svg.getScreenCTM()
  if (!m) return { x: 0, y: 0 }
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}
const snap = (v: number) => Math.round(v / 5) * 5
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function down(grip: Grip, e: PointerEvent) {
  const svg = (e.currentTarget as SVGElement).ownerSVGElement
  if (!svg || e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  const p = local(svg, e)
  drag.value = { grip, svg, x0: p.x, y0: p.y, start: { ...b.value }, first: true }
}

function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const p = local(d.svg, e)
  const s = d.start
  const n: WallBeam = { ...s }
  // 立面图左右两端换算回「靠起点 / 靠终点」那一端
  const a0 = s.offset - s.w / 2
  const a1 = s.offset + s.w / 2
  const along = startLeft.value ? p.x : L.value - p.x
  const nearEnd = (left: boolean) => (left === startLeft.value ? 'start' : 'end')
  if (d.grip === 'body') {
    n.offset = s.offset + snap((startLeft.value ? 1 : -1) * (p.x - d.x0))
  } else if (d.grip === 'left' || d.grip === 'right') {
    // 拖的那一端跟着鼠标走，另一端不动；贴到墙端（10 cm 内）就吸过去
    const end = nearEnd(d.grip === 'left')
    let v = clamp(snap(along), 0, L.value)
    if (along < 10) v = 0
    if (L.value - along < 10) v = L.value
    const [lo, hi] = end === 'start' ? [clamp(v, 0, a1 - BEAM_MIN), a1] : [a0, clamp(v, a0 + BEAM_MIN, L.value)]
    n.w = hi - lo
    n.offset = (lo + hi) / 2
  } else if (d.grip === 'bottom') {
    n.h = clamp(snap(p.y), BEAM_MIN, Math.min(BEAM_MAX_H, H.value - 1))
  } else {
    n.d = Math.max(BEAM_MIN, snap(p.x - WALL))
  }
  const c = clampBeam(n, L.value)
  if (c.w === b.value.w && c.d === b.value.d && c.h === b.value.h && c.offset === b.value.offset) return
  previewWallFace(props.room.id, props.edge, { beam: c }, d.first)
  d.first = false
}

function up() {
  if (!drag.value) return
  if (!drag.value.first) settle()
  drag.value = null
}
const on = (g: Grip) => drag.value?.grip === g
</script>

<template>
  <div class="beam-el" :class="{ dragging: !!drag }">
    <svg class="elev" :viewBox="`-4 -4 ${L + 8} ${H + 8}`" preserveAspectRatio="none" @pointermove="move" @pointerup="up" @pointercancel="up">
      <rect class="wall" x="0" y="0" :width="L" :height="H" />
      <rect class="beam" :class="{ on: on('body') }" :x="beamRect.x" :y="0" :width="beamRect.w" :height="beamRect.h" @pointerdown="down('body', $event)" />
      <!-- 挂在墙上 / 梁正面的东西画在梁前面 -->
      <rect v-for="m in mounted" :key="m.id" class="item" :x="m.x" :y="m.y" :width="m.w" :height="m.h" />
      <!-- 手柄：透明的粗线是点击范围，上面一条短粗线是看得见的把手 -->
      <g class="grip ew" :class="{ on: on('left') }" @pointerdown="down('left', $event)">
        <line class="hit" :x1="beamRect.x" y1="0" :x2="beamRect.x" :y2="beamRect.h" />
        <line class="knob" :x1="beamRect.x" :y1="beamRect.h * 0.25" :x2="beamRect.x" :y2="beamRect.h * 0.75" />
      </g>
      <g class="grip ew" :class="{ on: on('right') }" @pointerdown="down('right', $event)">
        <line class="hit" :x1="beamRect.x + beamRect.w" y1="0" :x2="beamRect.x + beamRect.w" :y2="beamRect.h" />
        <line class="knob" :x1="beamRect.x + beamRect.w" :y1="beamRect.h * 0.25" :x2="beamRect.x + beamRect.w" :y2="beamRect.h * 0.75" />
      </g>
      <g class="grip ns" :class="{ on: on('bottom') }" @pointerdown="down('bottom', $event)">
        <line class="hit" :x1="beamRect.x" :y1="beamRect.h" :x2="beamRect.x + beamRect.w" :y2="beamRect.h" />
        <line class="knob" :x1="beamRect.x + beamRect.w / 2 - Math.min(20, beamRect.w / 4)" :y1="beamRect.h" :x2="beamRect.x + beamRect.w / 2 + Math.min(20, beamRect.w / 4)" :y2="beamRect.h" />
      </g>
    </svg>
    <svg class="sec" :viewBox="`-4 -4 ${secW + 8} ${H + 8}`" preserveAspectRatio="none" @pointermove="move" @pointerup="up" @pointercancel="up">
      <rect class="cut" x="0" y="0" :width="WALL" :height="H" />
      <line class="floor" :x1="WALL" :y1="H" :x2="secW" :y2="H" />
      <line class="floor" :x1="WALL" y1="0" :x2="secW" y2="0" />
      <rect class="beam" :x="WALL" y="0" :width="b.d" :height="b.h" />
      <g class="grip ew" :class="{ on: on('depth') }" @pointerdown="down('depth', $event)">
        <line class="hit" :x1="WALL + b.d" y1="0" :x2="WALL + b.d" :y2="b.h" />
        <line class="knob" :x1="WALL + b.d" :y1="b.h * 0.25" :x2="WALL + b.d" :y2="b.h * 0.75" />
      </g>
      <g class="grip ns" :class="{ on: on('bottom') }" @pointerdown="down('bottom', $event)">
        <line class="hit" :x1="WALL" :y1="b.h" :x2="WALL + b.d" :y2="b.h" />
        <line class="knob" :x1="WALL + b.d * 0.25" :y1="b.h" :x2="WALL + b.d * 0.75" :y2="b.h" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.beam-el {
  display: flex;
  gap: 6px;
  align-items: stretch;
  touch-action: none;
  user-select: none;
}
svg {
  height: 96px;
  display: block;
  overflow: visible;
}
.elev {
  flex: 1;
  min-width: 0;
}
.sec {
  width: 64px;
  flex: none;
}
.wall {
  fill: var(--canvas);
  stroke: var(--border-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.cut {
  fill: var(--border-strong);
}
.floor {
  stroke: var(--border-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.item {
  fill: var(--surface);
  stroke: var(--text-faint);
  stroke-width: 1;
  stroke-dasharray: 3 2;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.beam {
  fill: var(--accent-weak);
  stroke: var(--accent);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
.elev .beam {
  cursor: grab;
}
.dragging .beam.on {
  cursor: grabbing;
}
.grip line {
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
}
.grip .hit {
  stroke: transparent;
  stroke-width: 14;
}
.grip .knob {
  stroke: var(--accent);
  stroke-width: 4;
}
.grip:hover .knob,
.grip.on .knob {
  stroke: var(--accent-strong);
  stroke-width: 6;
}
.grip.ew {
  cursor: ew-resize;
}
.grip.ns {
  cursor: ns-resize;
}
</style>
