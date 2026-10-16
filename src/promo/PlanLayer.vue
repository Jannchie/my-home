<script setup lang="ts">
// 宣传片里的平面图：按 PlanCanvas 的画法画（房间底色、地面图案、墙、门窗、设备、家具占地、房间名），
// 但视图变换由时间线给出（和 3D 正俯视镜头严格对齐），只读、不响应指针。
import { computed } from 'vue'
import { ROOM_KINDS, add, area, bbox, edgeInfo, fixtureBox, fmtRoomArea, isAxisRect, labelPointAvoiding, mul, pointInPolygon, polyPath, type Plan, type Room, type RoomKind, type Vec } from '../model'
import { isIndoor, wallSegments, wallThicknessAt } from '../walls'
import { tatamiLayout } from '../tatami'
import { ASSET_MAP } from '../three/assets'
import { effectivePalette } from '../three/colors'
import { roomName } from '../i18n'
import FixtureGlyph from '../components/FixtureGlyph.vue'

const props = defineProps<{
  plan: Plan
  view: { x: number; y: number; s: number }
  /** 选中的房间（显示轮廓、边长、顶点） */
  sel?: string | null
  /** 正在拖的顶点 */
  vertex?: number | null
  /** 拖出来的矩形草稿（世界坐标） */
  draft?: { x0: number; y0: number; x1: number; y1: number } | null
  /** 刚放下的门：缩放进场 0..1 */
  doorIn?: { id: string; k: number } | null
  /** 指北针 */
  north: number
  compass: { x: number; y: number; r: number }
  /** 家具占地的不透明度（形变时渐隐） */
  furn?: number
  /** 屏幕像素 → 世界坐标的线宽换算基准（界面元素按屏幕像素画） */
  unit: number
}>()

const px = (n: number) => (n * props.unit) / props.view.s

const FLOOR_PATTERN: Partial<Record<RoomKind, string>> = {
  bath: 'url(#p-tile-s)',
  wash: 'url(#p-tile)',
  toilet: 'url(#p-tile)',
  entrance: 'url(#p-doma)',
  balcony: 'url(#p-tile-l)',
}

const rooms = computed(() =>
  props.plan.rooms.map((r) => {
    let mats: ReturnType<typeof tatamiLayout> = []
    if (r.kind === 'japanese' && isAxisRect(r.points)) {
      const b = bbox(r.points)
      const k = props.plan.wall / 2
      mats = tatamiLayout(b.x0 + k, b.y0 + k, b.x1 - k, b.y1 - k)
    }
    return {
      room: r,
      d: polyPath(r.points),
      fill: ROOM_KINDS[r.kind]?.fill ?? '#eee',
      pattern: FLOOR_PATTERN[r.kind],
      mats,
      label: labelPointAvoiding(
        r.points,
        props.plan.fixtures.filter((f) => pointInPolygon({ x: f.x, y: f.y }, r.points)).map(fixtureBox),
      ),
      sub: r.kind === 'balcony' ? '' : fmtRoomArea(area(r.points), props.plan.region),
    }
  }),
)

const walls = computed(() => {
  const segs = wallSegments(props.plan.rooms)
  const path = (kind: string) =>
    segs
      .filter((s) => s.kind === kind)
      .map((s) => `M${s.a.x},${s.a.y}L${s.b.x},${s.b.y}`)
      .join('')
  return { outer: path('outer'), inner: path('inner'), open: path('open') }
})

const balconies = computed(() => rooms.value.filter((v) => !isIndoor(v.room)))

function clampOffset(o: { offset: number; width: number }, L: number) {
  if (L <= o.width) return L / 2
  return Math.max(o.width / 2, Math.min(L - o.width / 2, o.offset))
}

const openings = computed(() => {
  const out: { id: string; kind: string; gap: string; leaf: string; arc: string; glass: string[]; panels: string[]; sash: boolean; fold: string; hinge: Vec }[] = []
  const p = props.plan
  for (const o of p.openings) {
    const r = p.rooms.find((x) => x.id === o.roomId)
    if (!r || o.edge >= r.points.length) continue
    const e = edgeInfo(r.points, o.edge)
    const c = clampOffset(o, e.length)
    const w = Math.min(o.width, e.length)
    const p0 = add(e.a, mul(e.dir, c - w / 2))
    const p1 = add(e.a, mul(e.dir, c + w / 2))
    const center = add(e.a, mul(e.dir, c))
    const wall = wallThicknessAt(p, center, e.out, r)
    const h = wall / 2 + 1
    const gap = polyPath([add(p0, mul(e.out, h)), add(p1, mul(e.out, h)), add(p1, mul(e.out, -h)), add(p0, mul(e.out, -h))])
    const probe = add(center, mul(e.out, wall / 2 + 15))
    const sash = o.kind === 'window' && p.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(probe, x.points))
    const v = { id: o.id, kind: o.kind, gap, leaf: '', arc: '', glass: [] as string[], panels: [] as string[], sash, fold: '', hinge: center }
    if (o.kind === 'sliding' || sash) {
      const t = Math.max(2, wall / 4)
      const mid = add(p0, mul(e.dir, w / 2))
      const halves: [Vec, Vec, number][] = [
        [p0, add(mid, mul(e.dir, 4)), t / 2 + 0.5],
        [add(mid, mul(e.dir, -4)), p1, -t / 2 - 0.5],
      ]
      for (const [a, b, k] of halves) v.panels.push(polyPath([add(a, mul(e.out, k + t / 2)), add(b, mul(e.out, k + t / 2)), add(b, mul(e.out, k - t / 2)), add(a, mul(e.out, k - t / 2))]))
    } else if (o.kind === 'folding') {
      const into = o.swing === 'in' ? mul(e.out, -1) : e.out
      const apex = add(add(p0, mul(e.dir, w / 2)), mul(into, w * 0.3))
      v.fold = `M${p0.x},${p0.y}L${apex.x},${apex.y}L${p1.x},${p1.y}`
    } else if (o.kind === 'door') {
      const hingeP = o.hinge === 'start' ? p0 : p1
      const other = o.hinge === 'start' ? p1 : p0
      const sw = o.swing === 'in' ? mul(e.out, -1) : e.out
      const tip = add(hingeP, mul(sw, w))
      const cross = (tip.x - hingeP.x) * (other.y - hingeP.y) - (tip.y - hingeP.y) * (other.x - hingeP.x)
      v.leaf = `M${hingeP.x},${hingeP.y}L${tip.x},${tip.y}`
      v.arc = `M${tip.x},${tip.y}A${w},${w} 0 0 ${cross > 0 ? 1 : 0} ${other.x},${other.y}`
      v.hinge = center
    } else {
      const q = wall / 2 - 1
      for (const k of [-q, 0, q]) {
        const a = add(p0, mul(e.out, k))
        const b = add(p1, mul(e.out, k))
        v.glass.push(`M${a.x},${a.y}L${b.x},${b.y}`)
      }
    }
    out.push(v)
  }
  return out
})

const furniture = computed(() =>
  props.plan.furniture.flatMap((f) => {
    const def = ASSET_MAP.get(f.asset)
    if (!def || f.z) return []
    const pal = effectivePalette(def, f.color ?? 0, f.colors)
    return [{ id: f.id, w: def.w, d: def.d, mounted: !!def.mount, color: pal[0] ?? '#ddd', transform: `translate(${f.x},${f.y}) rotate(${f.rot})` }]
  }),
)

const selRoom = computed<Room | null>(() => props.plan.rooms.find((r) => r.id === props.sel) ?? null)
const dims = computed(() => {
  const r = selRoom.value
  if (!r) return []
  return r.points.map((_, i) => {
    const e = edgeInfo(r.points, i)
    const m = mul(add(e.a, e.b), 0.5)
    const at = add(m, mul(e.out, props.plan.wall / 2 + px(14)))
    let ang = (Math.atan2(e.dir.y, e.dir.x) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang <= -90) ang += 180
    return { i, at, ang, text: Math.round(e.length).toString() }
  })
})

const doorScale = (id: string) => (props.doorIn && props.doorIn.id === id ? props.doorIn.k : 1)
</script>

<template>
  <svg class="plan-layer" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="p-tile" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30,0L0,0L0,30" fill="none" stroke="#a9c3c9" stroke-width="0.8" /></pattern>
      <pattern id="p-tile-s" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20,0L0,0L0,20" fill="none" stroke="#a3c1c8" stroke-width="0.7" /></pattern>
      <pattern id="p-tile-l" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M45,0L0,0L0,45" fill="none" stroke="#d4cfc5" stroke-width="0.8" /></pattern>
      <pattern id="p-doma" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0,12L12,0" fill="none" stroke="#a49b8c" stroke-width="0.8" /></pattern>
    </defs>
    <g :transform="`translate(${view.x},${view.y}) scale(${view.s})`">
      <path v-for="v in rooms" :key="'f' + v.room.id" :d="v.d" :fill="v.fill" />
      <template v-for="v in rooms" :key="'p' + v.room.id">
        <path v-if="v.pattern" :d="v.d" :fill="v.pattern" />
        <rect v-for="(m, i) in v.mats" :key="i" :x="m.x" :y="m.y" :width="m.w" :height="m.h" :fill="m.half ? '#dce4b8' : '#e3e9c6'" stroke="#98a476" stroke-width="1.2" />
      </template>
      <path v-for="v in balconies" :key="'b' + v.room.id" :d="v.d" fill="none" stroke="#6b665d" stroke-width="7" />
      <path v-for="v in balconies" :key="'b2' + v.room.id" :d="v.d" fill="none" stroke="#fbfaf7" stroke-width="3.5" />
      <g :opacity="furn ?? 1">
        <g v-for="v in furniture" :key="'u' + v.id" :transform="v.transform">
          <rect :x="-v.w / 2" :y="-v.d / 2" :width="v.w" :height="v.d" :rx="Math.min(8, v.w / 4, v.d / 4)" :fill="v.mounted ? 'none' : v.color" fill-opacity="0.55" stroke="#8a7a70" stroke-width="0.8" :stroke-dasharray="v.mounted ? '4 3' : undefined" />
          <line :x1="-v.w / 2 + 4" :x2="v.w / 2 - 4" :y1="-v.d / 2 + 3" :y2="-v.d / 2 + 3" stroke="#8a7a70" stroke-width="1.2" />
        </g>
      </g>
      <path :d="walls.inner" stroke="#3a3732" :stroke-width="plan.wall" stroke-linecap="square" />
      <path :d="walls.outer" stroke="#22201c" :stroke-width="plan.wallOuter" stroke-linecap="square" />
      <path :d="walls.open" stroke="#5a554d" stroke-width="3" />
      <g v-for="v in openings" :key="v.id" :transform="doorScale(v.id) < 1 ? `translate(${v.hinge.x} ${v.hinge.y}) scale(${doorScale(v.id)}) translate(${-v.hinge.x} ${-v.hinge.y})` : undefined">
        <path :d="v.gap" fill="#fbfaf7" />
        <template v-if="v.kind === 'door'">
          <path :d="v.arc" fill="none" stroke="#6b665d" :stroke-width="px(1)" :stroke-dasharray="`${px(4)} ${px(3)}`" />
          <path :d="v.leaf" fill="none" stroke="#2b2925" stroke-width="4" stroke-linecap="round" />
        </template>
        <template v-else-if="v.panels.length">
          <path v-for="(g, i) in v.panels" :key="i" :d="g" :fill="v.sash ? '#dceaf0' : '#fff'" stroke="#2b2925" stroke-width="1.5" />
        </template>
        <path v-else-if="v.kind === 'folding'" :d="v.fold" fill="none" stroke="#2b2925" stroke-width="2" stroke-linejoin="round" />
        <template v-else>
          <path v-for="(g, i) in v.glass" :key="i" :d="g" fill="none" stroke="#2b2925" :stroke-width="i === 1 ? 2.5 : 1.5" />
        </template>
      </g>
      <g v-for="f in plan.fixtures" :key="f.id" :transform="`translate(${f.x},${f.y}) rotate(${f.rot})`">
        <FixtureGlyph :f="f" />
      </g>
      <g v-for="v in rooms" :key="'l' + v.room.id" class="label">
        <text :x="v.label.x" :y="v.label.y - px(2)" :font-size="px(13)" text-anchor="middle" fill="#2b2925" font-weight="600">{{ roomName(v.room.name) }}</text>
        <text v-if="v.sub" :x="v.label.x" :y="v.label.y + px(13)" :font-size="px(11)" text-anchor="middle" fill="#6b665d" class="num">{{ v.sub }}</text>
      </g>
      <!-- 拖出来的矩形草稿 -->
      <g v-if="draft">
        <rect :x="Math.min(draft.x0, draft.x1)" :y="Math.min(draft.y0, draft.y1)" :width="Math.abs(draft.x1 - draft.x0)" :height="Math.abs(draft.y1 - draft.y0)" fill="rgba(87,122,104,0.12)" stroke="#3f6652" :stroke-width="px(2)" :stroke-dasharray="`${px(6)} ${px(4)}`" />
        <text :x="(draft.x0 + draft.x1) / 2" :y="Math.min(draft.y0, draft.y1) - px(8)" :font-size="px(12)" text-anchor="middle" fill="#3f6652" class="num">{{ Math.round(Math.abs(draft.x1 - draft.x0)) }} × {{ Math.round(Math.abs(draft.y1 - draft.y0)) }}</text>
      </g>
      <g v-if="selRoom">
        <path :d="polyPath(selRoom.points)" fill="rgba(63,102,82,0.08)" stroke="#3f6652" :stroke-width="px(2)" />
        <text v-for="d in dims" :key="'d' + d.i" :x="d.at.x" :y="d.at.y" :font-size="px(11)" text-anchor="middle" dominant-baseline="middle" fill="#3f6652" class="num" :transform="`rotate(${d.ang} ${d.at.x} ${d.at.y})`">{{ d.text }}</text>
        <rect v-for="(p, i) in selRoom.points" :key="'v' + i" :x="p.x - px(5)" :y="p.y - px(5)" :width="px(10)" :height="px(10)" :fill="vertex === i ? '#3f6652' : '#fff'" stroke="#3f6652" :stroke-width="px(1.5)" />
      </g>
    </g>
    <g :transform="`translate(${compass.x} ${compass.y}) scale(${compass.r / 22})`">
      <circle r="22" fill="rgba(255,255,255,0.9)" stroke="#d3d4ce" />
      <g :transform="`rotate(${north})`">
        <path d="M0 -17 L6 3 L0 -1 L-6 3 Z" fill="#e0607e" />
        <path d="M0 17 L6 3 L0 -1 L-6 3 Z" fill="#a4a8a1" />
        <text y="-26" text-anchor="middle" class="north-t">N</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.plan-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.label text {
  paint-order: stroke;
  stroke: rgba(251, 250, 247, 0.7);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.num {
  font-variant-numeric: tabular-nums;
}
.north-t {
  font-size: 10px;
  font-weight: 700;
  fill: #2c302e;
  paint-order: stroke;
  stroke: #fbfaf7;
  stroke-width: 3px;
}
</style>
