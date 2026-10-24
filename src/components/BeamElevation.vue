<script setup lang="ts">
// 内收柱（梁）的工程图：左边是站在房间里看这面墙的立面，右边是梁的剖面，按真实比例画，标注尺寸（cm）。
//   立面：上方连续标注「到墙端 | 梁长 | 到墙端」，右侧标注梁的下垂高度和梁下净高；挂在这面墙上的空调等画成虚线框。
//   剖面：楼板、墙体剖切填充，只画天花往下一段（断开线）；标注梁深、下垂高度。
// 图上也能拖：立面拖梁身改位置、拖两端改长、拖底边改高；剖面拖正面改深。拖动中实时改（只记一次撤销，松手 settle）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { edgeInfo, type Room, type WallBeam } from '../model'
import { plan, previewWallFace, settle } from '../store'
import { clampBeam } from '../wallFace'
import { roomWallH, wallMounted } from '../beamMount'
import { dragBeam, type BeamGrip } from '../beamDrag'
import { t } from '../i18n'

const props = defineProps<{ room: Room; edge: number; beam: WallBeam }>()

/** 图案 / 裁剪的 id 每个实例各用一份 */
const uid = `beam-dwg-${Math.random().toString(36).slice(2, 8)}`

const root = ref<HTMLDivElement>()
/** 容器宽（px）：按它算比例 */
const cw = ref(280)
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => (cw.value = Math.max(180, e.contentRect.width)))
  if (root.value) ro.observe(root.value)
})
onBeforeUnmount(() => ro?.disconnect())

const L = computed(() => edgeInfo(props.room.points, props.edge).length)
const H = computed(() => roomWallH(plan.value, props.room))
const b = computed(() => clampBeam(props.beam, L.value))
/** 站在房间里面朝这面墙：边的起点在左边吗（平面图 y 朝下，看向 out 时左手是 (out.y, -out.x)） */
const startLeft = computed(() => {
  const e = edgeInfo(props.room.points, props.edge)
  return e.dir.x * e.out.y - e.dir.y * e.out.x > 0
})
/** 沿墙距离（到起点）→ 立面上离左端的距离 */
const fromLeft = (along: number) => (startLeft.value ? along : L.value - along)

// ---------- 版面（px） ----------
/** 剖面块宽、两块之间的空、立面右边留给竖向标注的宽、上方标注带高、立面最高 */
const SEC_W = 84
const GAP = 14
const PAD_R = 34
const TOP = 22
const MAX_H = 120
/** 立面：比例 k（px / cm）、墙的左上角、宽高 */
const el = computed(() => {
  const k = Math.min((cw.value - SEC_W - GAP - PAD_R) / L.value, MAX_H / H.value)
  return { k, x0: 1, y0: TOP, w: L.value * k, h: H.value * k }
})
/** 剖面下方还要放梁深的标注 */
const svgH = computed(() => el.value.y0 + el.value.h + 6)
/** 立面上梁的范围（px） */
const beamPx = computed(() => {
  const { k, x0, y0 } = el.value
  const l = fromLeft(b.value.offset - b.value.w / 2)
  const r = fromLeft(b.value.offset + b.value.w / 2)
  return { x0: x0 + Math.min(l, r) * k, x1: x0 + Math.max(l, r) * k, y1: y0 + b.value.h * k }
})
/** 上方的连续标注：到左墙端、梁长、到右墙端（0 长的段不画）；段太窄放不下数字就不写 */
const chain = computed(() => {
  const { k, x0 } = el.value
  const lo = (beamPx.value.x0 - x0) / k
  const hi = (beamPx.value.x1 - x0) / k
  return [
    { a: 0, b: lo, beam: false },
    { a: lo, b: hi, beam: true },
    { a: hi, b: L.value, beam: false },
  ]
    .filter((s) => s.b - s.a >= 0.5)
    .map((s) => {
      const text = String(Math.round(s.b - s.a))
      const x0s = x0 + s.a * k
      const x1s = x0 + s.b * k
      return { beam: s.beam, x0: x0s, x1: x1s, text, fits: x1s - x0s >= text.length * 6 + 4 }
    })
})
/** 尺寸界线的位置：标注段的分界点 */
const chainTicks = computed(() => [...new Set([el.value.x0, ...chain.value.map((s) => s.x1)])])
/** 右侧竖向标注的分界：天花、梁底、地面 */
const sideTicks = computed(() => [el.value.y0, beamPx.value.y1, el.value.y0 + el.value.h])
/** 挂在这面墙上（含梁正面）的东西 */
const mounted = computed(() => {
  const { k, x0, y0 } = el.value
  return wallMounted(plan.value, props.room, props.edge).map((m) => ({ id: m.id, x: x0 + (fromLeft(m.along) - m.w / 2) * k, w: m.w * k, y: y0 + (H.value - m.z1) * k, h: (m.z1 - m.z0) * k }))
})

/** 剖面：墙体剖切宽、楼板厚（px）；只画天花往下 span cm，比例 ks 让梁深放得下 */
const WALL_PX = 12
const SLAB_PX = 6
const sec = computed(() => {
  const x0 = cw.value - SEC_W
  const h = el.value.h
  const span = Math.max(b.value.h * 2, 80)
  const ks = Math.min(h / span, (SEC_W - WALL_PX - 28) / Math.max(b.value.d, 20))
  const wx = x0 + WALL_PX
  const y0 = el.value.y0
  return { x0, wx, ks, y0, h, bx1: wx + b.value.d * ks, by1: y0 + b.value.h * ks }
})

// ---------- 拖动 ----------
const drag = ref<{ grip: BeamGrip; x0: number; y0: number; k: number; start: WallBeam; first: boolean } | null>(null)

function down(grip: BeamGrip, e: PointerEvent, k: number) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  drag.value = { grip, x0: e.clientX, y0: e.clientY, k, start: { ...b.value }, first: true }
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const dx = (e.clientX - d.x0) / d.k
  const dy = (e.clientY - d.y0) / d.k
  // 立面往右 = 沿墙往终点（起点在左时）；底边往下拖 = 梁往下垂（dragBeam 的 bottom 以朝上为正）
  const delta = d.grip === 'front' ? dx : d.grip === 'bottom' ? -dy : startLeft.value ? dx : -dx
  // 立面左右两端换算成起点 / 终点那一端
  const grip: BeamGrip = d.grip === 'start' || d.grip === 'end' ? ((d.grip === 'start') === startLeft.value ? 'start' : 'end') : d.grip
  // 图小，默认按 5 cm 走；Shift 按 1 cm
  const n = dragBeam(d.start, grip, delta, L.value, H.value - 1, e.shiftKey ? 1 : 5)
  const c = b.value
  if (n.w === c.w && n.d === c.d && n.h === c.h && n.offset === c.offset) return
  previewWallFace(props.room.id, props.edge, { beam: n }, d.first)
  d.first = false
}
function up() {
  if (!drag.value) return
  if (!drag.value.first) settle()
  drag.value = null
}
const on = (g: BeamGrip) => drag.value?.grip === g
</script>

<template>
  <div ref="root" class="beam-dwg" :class="{ dragging: !!drag }">
    <svg :width="cw" :height="svgH" :viewBox="`0 0 ${cw} ${svgH}`" @pointermove="move" @pointerup="up" @pointercancel="up">
      <defs>
        <pattern :id="`${uid}-cut`" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" class="hatch" />
        </pattern>
        <clipPath :id="`${uid}-clip`">
          <rect :x="sec.x0" :y="sec.y0 - SLAB_PX" :width="SEC_W" :height="sec.h + SLAB_PX" />
        </clipPath>
      </defs>

      <!-- 立面 -->
      <rect class="wall" :x="el.x0" :y="el.y0" :width="el.w" :height="el.h" />
      <rect class="beam" :class="{ on: on('move') }" :x="beamPx.x0" :y="el.y0" :width="beamPx.x1 - beamPx.x0" :height="beamPx.y1 - el.y0" @pointerdown="down('move', $event, el.k)" />
      <!-- 挂在梁正面 / 墙上的东西画在梁前面 -->
      <rect v-for="m in mounted" :key="m.id" class="item" :x="m.x" :y="m.y" :width="m.w" :height="m.h" />
      <!-- 两端、底边：透明粗线是按的范围 -->
      <line class="hit ew" :class="{ on: on('start') }" :x1="beamPx.x0" :y1="el.y0" :x2="beamPx.x0" :y2="beamPx.y1" @pointerdown="down('start', $event, el.k)" />
      <line class="hit ew" :class="{ on: on('end') }" :x1="beamPx.x1" :y1="el.y0" :x2="beamPx.x1" :y2="beamPx.y1" @pointerdown="down('end', $event, el.k)" />
      <line class="hit ns" :class="{ on: on('bottom') }" :x1="beamPx.x0" :y1="beamPx.y1" :x2="beamPx.x1" :y2="beamPx.y1" @pointerdown="down('bottom', $event, el.k)" />

      <!-- 上方连续标注：尺寸线、尺寸界线、斜短线 -->
      <g class="dim">
        <line :x1="el.x0" :y1="el.y0 - 9" :x2="el.x0 + el.w" :y2="el.y0 - 9" />
        <template v-for="x in chainTicks" :key="'c' + x">
          <line :x1="x" :y1="el.y0 - 13" :x2="x" :y2="el.y0 - 2" />
          <line class="tick" :x1="x - 3" :y1="el.y0 - 6" :x2="x + 3" :y2="el.y0 - 12" />
        </template>
        <template v-for="(s, i) in chain" :key="'s' + i">
          <text v-if="s.fits" :class="{ em: s.beam }" :x="(s.x0 + s.x1) / 2" :y="el.y0 - 12">{{ s.text }}</text>
        </template>
      </g>
      <!-- 右侧竖向标注：梁的下垂高度、梁下净高 -->
      <g class="dim">
        <line :x1="el.x0 + el.w + 8" :y1="el.y0" :x2="el.x0 + el.w + 8" :y2="el.y0 + el.h" />
        <template v-for="(y, i) in sideTicks" :key="'v' + i">
          <line :x1="el.x0 + el.w + 2" :y1="y" :x2="el.x0 + el.w + 12" :y2="y" />
          <line class="tick" :x1="el.x0 + el.w + 5" :y1="y + 3" :x2="el.x0 + el.w + 11" :y2="y - 3" />
        </template>
        <text class="em side" :x="el.x0 + el.w + 14" :y="(el.y0 + beamPx.y1) / 2">{{ b.h }}</text>
        <text class="side" :x="el.x0 + el.w + 14" :y="(beamPx.y1 + el.y0 + el.h) / 2">{{ Math.round(H - b.h) }}</text>
      </g>

      <!-- 剖面：楼板、墙体剖切、梁 -->
      <g :clip-path="`url(#${uid}-clip)`">
        <rect class="cut" :fill="`url(#${uid}-cut)`" :x="sec.x0" :y="sec.y0 - SLAB_PX" :width="SEC_W" :height="SLAB_PX" />
        <rect class="cut" :fill="`url(#${uid}-cut)`" :x="sec.x0" :y="sec.y0" :width="WALL_PX" :height="sec.h" />
        <rect class="beam fixed" :x="sec.wx" :y="sec.y0" :width="sec.bx1 - sec.wx" :height="sec.by1 - sec.y0" />
      </g>
      <!-- 下方断开线：只画了天花往下一段 -->
      <path class="brk" :d="`M${sec.x0 - 3},${sec.y0 + sec.h} h${WALL_PX / 2 + 3} l2,-4 l3,8 l2,-4 h${WALL_PX / 2 + 3}`" />
      <line class="hit ew" :class="{ on: on('front') }" :x1="sec.bx1" :y1="sec.y0" :x2="sec.bx1" :y2="sec.by1" @pointerdown="down('front', $event, sec.ks)" />
      <line class="hit ns" :class="{ on: on('bottom') }" :x1="sec.wx" :y1="sec.by1" :x2="sec.bx1" :y2="sec.by1" @pointerdown="down('bottom', $event, sec.ks)" />
      <!-- 梁深（下方）、下垂高度（右侧） -->
      <g class="dim">
        <line :x1="sec.wx" :y1="sec.by1 + 8" :x2="sec.bx1" :y2="sec.by1 + 8" />
        <template v-for="(x, i) in [sec.wx, sec.bx1]" :key="'d' + i">
          <line :x1="x" :y1="sec.by1 + 2" :x2="x" :y2="sec.by1 + 12" />
          <line class="tick" :x1="x - 3" :y1="sec.by1 + 11" :x2="x + 3" :y2="sec.by1 + 5" />
        </template>
        <text class="em" :x="(sec.wx + sec.bx1) / 2" :y="sec.by1 + 22">{{ b.d }}</text>
        <line :x1="sec.bx1 + 8" :y1="sec.y0" :x2="sec.bx1 + 8" :y2="sec.by1" />
        <template v-for="(y, i) in [sec.y0, sec.by1]" :key="'h' + i">
          <line :x1="sec.bx1 + 2" :y1="y" :x2="sec.bx1 + 12" :y2="y" />
          <line class="tick" :x1="sec.bx1 + 5" :y1="y + 3" :x2="sec.bx1 + 11" :y2="y - 3" />
        </template>
        <text class="em side" :x="sec.bx1 + 14" :y="(sec.y0 + sec.by1) / 2">{{ b.h }}</text>
      </g>
    </svg>
    <div class="legend">
      <span>{{ t('立面') }} · cm</span>
      <span class="legend-sec">{{ t('剖面') }}</span>
    </div>
  </div>
</template>

<style scoped>
.beam-dwg {
  min-width: 0;
  touch-action: none;
  user-select: none;
}
svg {
  display: block;
  overflow: visible;
}
.wall {
  fill: var(--canvas);
  stroke: var(--text-muted);
  stroke-width: 1;
}
.cut {
  stroke: var(--text-muted);
  stroke-width: 1;
}
.hatch {
  stroke: var(--text-faint);
  stroke-width: 1;
}
.item {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1;
  stroke-dasharray: 3 2;
  pointer-events: none;
}
.beam {
  fill: var(--accent-weak);
  stroke: var(--accent);
  stroke-width: 1.5;
  cursor: grab;
}
.beam.fixed {
  cursor: default;
}
.dragging .beam.on {
  cursor: grabbing;
}
.brk {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1;
}
.dim line {
  stroke: var(--text-faint);
  stroke-width: 0.75;
}
.dim line.tick {
  stroke: var(--text-muted);
  stroke-width: 1.2;
}
.dim text {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  fill: var(--text-muted);
  text-anchor: middle;
}
.dim text.side {
  text-anchor: start;
  dominant-baseline: middle;
}
.dim text.em {
  fill: var(--accent-strong);
  font-weight: 600;
}
.hit {
  stroke: transparent;
  stroke-width: 10;
}
.hit.ew {
  cursor: ew-resize;
}
.hit.ns {
  cursor: ns-resize;
}
.hit:hover,
.hit.on {
  stroke: var(--accent);
  stroke-opacity: 0.35;
  stroke-width: 6;
}
.legend {
  display: flex;
  margin-top: 4px;
  font-size: var(--fs-xs);
  color: var(--text-faint);
}
.legend-sec {
  margin-left: auto;
  width: 84px;
}
</style>
