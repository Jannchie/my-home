<script setup lang="ts">
import { computed } from 'vue'
import { FIXTURES, OPENING_LABELS, ROOM_KINDS, area, bbox, edgeInfo, fmtArea, fmtJo, fmtRoomArea, isAxisRect, perimeter, rectPoints, type OpeningKind, type RoomKind } from '../model'
import { planArea } from '../generate'
import { RAILING_KINDS, type RailingKind } from '../model'
import { isIndoor } from '../walls'
import { deleteSelection, duplicateSelection, findFixture, findRoom, mutate, plan, floorPlan, selection, settings, tidyDoors, setRoomLight, setRoomLightK } from '../store'
import { isMultiFloor, planFloors, floorView } from '../floors'
import { LIGHT_MODES, type LightMode } from '../three/lights'
import { roomName, t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import WindowStylePicker from './WindowStylePicker.vue'
import DoorStylePicker from './DoorStylePicker.vue'
import FixtureEditor from './FixtureEditor.vue'
import WallEditor from './WallEditor.vue'
import OpeningWidthPresets from './OpeningWidthPresets.vue'
import { resizedOpening } from '../openingEdit'
import { FIXTURE_ICONS, ICONS, ROOM_ICONS, TOOL_ICONS } from '../ui/icons'

/** 房间灯（3D 沙盘夜里的灯光，见 three/lights.ts） */
const LIGHT_LABELS: Record<LightMode, string> = { auto: '自动', on: '开', off: '关' }
const ROOM_K_PRESETS = [2700, 3000, 3500, 4000, 5000, 6500]

const room = computed(() => {
  const s = selection.value
  if (s?.type === 'room') return findRoom(s.id) ?? null
  return null
})
const vertex = computed(() => {
  const s = selection.value
  if (s?.type !== 'vertex') return null
  const r = findRoom(s.roomId)
  return r ? { room: r, index: s.index, p: r.points[s.index] } : null
})
const wall = computed(() => {
  const s = selection.value
  if (s?.type !== 'wall') return null
  const r = findRoom(s.roomId)
  return r && s.edge < r.points.length ? { room: r, edge: s.edge } : null
})
const opening = computed(() => {
  const s = selection.value
  if (s?.type !== 'opening') return null
  const o = plan.value.openings.find((o) => o.id === s.id)
  if (!o) return null
  const r = findRoom(o.roomId)
  return r ? { o, room: r, edgeLen: edgeInfo(r.points, o.edge).length } : null
})

const fixture = computed(() => {
  const s = selection.value
  return s?.type === 'fixture' ? (findFixture(s.id) ?? null) : null
})

const rectSize = computed(() => {
  const r = room.value
  if (!r || !isAxisRect(r.points)) return null
  const b = bbox(r.points)
  return { w: b.x1 - b.x0, h: b.y1 - b.y0, b }
})

const stats = computed(() => ({
  // planArea 是㎡，fmtArea 吃 cm²
  total: planArea(plan.value) * 10000,
  count: plan.value.rooms.filter(isIndoor).length,
}))

/** 房间列表：多层户型只列当前楼层的 */
const sortedRooms = computed(() => [...floorPlan.value.rooms].sort((a, b) => area(b.points) - area(a.points)))
/** 多层户型：各层面积（户内房间，挑空不算） */
const floorStats = computed(() => (isMultiFloor(plan.value) ? planFloors(plan.value).map((f) => ({ f, area: planArea(floorView(plan.value, f.id)) * 10000 })) : []))

const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const str = (e: Event) => (e.target as HTMLInputElement).value

/** 改门窗宽度：中心不动，宽度、位置夹在墙边内 */
function setOpeningWidth(w: number) {
  const o = opening.value?.o
  if (!o || !Number.isFinite(w)) return
  const v = resizedOpening(plan.value, o, w)
  if (!v) return
  mutate(() => {
    o.width = v.width
    o.offset = v.offset
  })
}

function setKind(kind: RoomKind) {
  const r = room.value!
  mutate(() => {
    const oldLabel = ROOM_KINDS[r.kind].label
    if (!r.name || r.name === oldLabel || r.name.startsWith(oldLabel)) r.name = ROOM_KINDS[kind].label
    r.kind = kind
  })
}

function setRectSize(w: number, h: number) {
  const s = rectSize.value
  if (!s || !(w > 0) || !(h > 0)) return
  mutate(() => {
    room.value!.points = rectPoints(s.b.x0, s.b.y0, s.b.x0 + w, s.b.y0 + h)
  })
}

</script>

<template>
  <aside class="panel">
    <!-- 房间 -->
    <template v-if="room">
      <header class="ico-label"><JIcon :icon="ROOM_ICONS[room.kind]" class="ico-muted" />{{ t('房间') }}</header>
      <label>{{ t('名称') }}<input :value="roomName(room.name)" @change="mutate(() => (room!.name = str($event)))" /></label>
      <label
        >{{ t('类型') }}
        <span class="ico-select">
          <JIcon :icon="ROOM_ICONS[room.kind]" />
          <select :value="room.kind" :title="room.kind === 'void' ? t('挑空：这一块没有楼板，下层在这里通高（下层的外墙一直砌到这一层的天花）。') : undefined" @change="setKind(str($event) as RoomKind)">
            <option v-for="(k, key) in ROOM_KINDS" :key="key" :value="key">{{ roomName(k.label) }}</option>
          </select>
        </span>
      </label>
      <label v-if="room.kind === 'balcony'"
        >{{ t('扶手墙') }}
        <select :value="room.railing ?? 'mixed'" @change="mutate(() => (room!.railing = str($event) as RailingKind))">
          <option v-for="(label, k) in RAILING_KINDS" :key="k" :value="k">{{ label }}</option>
        </select>
      </label>
      <!-- 房间灯（3D 沙盘夜里的灯光）：自动 = 跟随全局；色温不填跟随全局 -->
      <div class="row">
        <label
          >{{ t('灯') }}
          <select :value="room.light ?? 'auto'" @change="setRoomLight(room!.id, str($event) as LightMode)">
            <option v-for="m in LIGHT_MODES" :key="m" :value="m">{{ t(LIGHT_LABELS[m]) }}</option>
          </select>
        </label>
        <label
          >{{ t('色温') }}
          <select class="num" :value="room.lightK ?? ''" @change="setRoomLightK(room!.id, str($event) ? Number(str($event)) : undefined)">
            <option value="">{{ t('跟随全局') }}</option>
            <option v-for="k in ROOM_K_PRESETS" :key="k" :value="k">{{ k }} K</option>
          </select>
        </label>
      </div>
      <template v-if="rectSize">
        <div class="row">
          <label>{{ t('宽 cm') }}<input type="number" step="10" :value="rectSize.w" @change="setRectSize(num($event), rectSize!.h)" /></label>
          <label>{{ t('深 cm') }}<input type="number" step="10" :value="rectSize.h" @change="setRectSize(rectSize!.w, num($event))" /></label>
        </div>
      </template>
      <dl>
        <dt>{{ t('面积') }}</dt>
        <dd class="num">{{ fmtArea(area(room.points)) }}<template v-if="!plan.region || plan.region === 'jp'"> · {{ fmtJo(area(room.points)) }}</template></dd>
        <dt>{{ t('周长') }}</dt>
        <dd class="num">{{ (perimeter(room.points) / 100).toFixed(2) }} m</dd>
        <dt>{{ t('顶点') }}</dt>
        <dd class="num">{{ room.points.length }}</dd>
      </dl>
      <div class="actions">
        <button @click="duplicateSelection"><JIcon :icon="ICONS.duplicate" />{{ t('复制') }} <kbd>Ctrl D</kbd></button>
        <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }} <kbd>Del</kbd></button>
      </div>
    </template>

    <!-- 顶点 -->
    <template v-else-if="vertex">
      <header>{{ t('顶点') }} · {{ roomName(vertex.room.name) }}</header>
      <div class="row">
        <label
          >X<input type="number" step="10" :value="vertex.p.x" @change="mutate(() => (vertex!.room.points[vertex!.index].x = num($event)))"
        /></label>
        <label
          >Y<input type="number" step="10" :value="vertex.p.y" @change="mutate(() => (vertex!.room.points[vertex!.index].y = num($event)))"
        /></label>
      </div>
      <div class="actions">
        <button class="danger" :disabled="vertex.room.points.length <= 3" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除顶点') }} <kbd>Del</kbd></button>
      </div>
    </template>

    <!-- 一面墙：墙纸、内收柱 -->
    <template v-else-if="wall">
      <header class="ico-label"><JIcon :icon="ICONS.wallFace" class="ico-muted" />{{ t('墙面') }} · {{ roomName(wall.room.name) }}</header>
      <WallEditor :key="wall.room.id + ':' + wall.edge" :room="wall.room" :edge="wall.edge" />
      <div class="actions">
        <button @click="selection = { type: 'room', id: wall.room.id }"><JIcon :icon="ROOM_ICONS[wall.room.kind]" />{{ t('选中整个房间') }}</button>
      </div>
    </template>

    <!-- 门窗 -->
    <template v-else-if="opening">
      <header class="ico-label"><JIcon :icon="opening.o.kind === 'window' ? TOOL_ICONS.window : TOOL_ICONS.door" class="ico-muted" />{{ t(OPENING_LABELS[opening.o.kind]) }} · {{ roomName(opening.room.name) }}</header>
      <label
        >{{ t('类型') }}
        <select :value="opening.o.kind" @change="mutate(() => (opening!.o.kind = str($event) as OpeningKind))">
          <option v-for="(label, key) in OPENING_LABELS" :key="key" :value="key">{{ t(label) }}</option>
        </select>
      </label>
      <div class="row">
        <label
          >{{ t('宽 cm') }}<input
            type="number"
            step="5"
            min="30"
            :max="Math.floor(opening.edgeLen)"
            :value="opening.o.width"
            @change="setOpeningWidth(num($event))"
        /></label>
        <label
          >{{ t('位置 cm') }}<input type="number" step="10" :value="Math.round(opening.o.offset)" @change="mutate(() => (opening!.o.offset = num($event)))"
        /></label>
      </div>
      <OpeningWidthPresets :opening="opening.o" />
      <WindowStylePicker v-if="opening.o.kind === 'window'" :opening="opening.o" />
      <div v-if="opening.o.kind === 'door' || opening.o.kind === 'folding'" class="actions">
        <button @click="mutate(() => (opening!.o.hinge = opening!.o.hinge === 'start' ? 'end' : 'start'))">{{ t('左右翻转') }}</button>
        <button @click="mutate(() => (opening!.o.swing = opening!.o.swing === 'in' ? 'out' : 'in'))">{{ t('内外翻转') }}</button>
      </div>
      <DoorStylePicker v-if="opening.o.kind !== 'window'" :opening="opening.o" />
      <div class="actions">
        <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }} <kbd>Del</kbd></button>
      </div>
    </template>

    <!-- 设备 -->
    <template v-else-if="fixture">
      <header class="ico-label"><JIcon :icon="FIXTURE_ICONS[fixture.kind]" class="ico-muted" />{{ t(FIXTURES[fixture.kind].label) }}</header>
      <FixtureEditor :key="fixture.id" :fixture="fixture" />
    </template>

    <!-- 整体 -->
    <template v-else>
      <header>{{ t('户型') }}</header>
      <label>{{ t('名称') }}<input :value="plan.name" @change="mutate((p) => (p.name = str($event)))" /></label>
      <div class="row">
        <label>{{ t('隔墙厚 cm') }}<input type="number" min="4" max="40" :value="plan.wall" @change="mutate((p) => (p.wall = num($event)))" /></label>
        <label>{{ t('外墙厚 cm') }}<input type="number" min="4" max="60" :value="plan.wallOuter" @change="mutate((p) => (p.wallOuter = num($event)))" /></label>
      </div>
      <label>{{ t('网格 cm') }}<input type="number" min="1" v-model.number="settings.grid" /></label>
      <label class="check"><input type="checkbox" v-model="settings.snap" />{{ t('吸附（网格 / 顶点对齐）') }}</label>
      <div class="actions">
        <button :title="t('房门向房间内开、トイレ外开、玄関外开；门扇贴墙、开扇互不打架')" @click="tidyDoors"><JIcon :icon="ICONS.tidyDoors" />{{ t('整理门的开向') }}</button>
      </div>
      <dl>
        <dt :title="t('面积按墙中心线计（壁芯面積），1帖 = 1.62㎡。')">{{ t('专有面积') }}</dt>
        <dd class="num">{{ fmtArea(stats.total) }}</dd>
        <template v-for="s in floorStats" :key="s.f.id">
          <dt class="sub">· {{ s.f.name }}</dt>
          <dd class="num">{{ fmtArea(s.area) }}</dd>
        </template>
        <dt>{{ t('房间') }}</dt>
        <dd class="num">{{ stats.count }}</dd>
      </dl>
      <ul class="rooms">
        <li v-for="r in sortedRooms" :key="r.id" @click="selection = { type: 'room', id: r.id }">
          <i :style="{ background: ROOM_KINDS[r.kind].fill }" />
          <span>{{ roomName(r.name) }}</span>
          <span class="num dim">{{ r.kind === 'balcony' ? fmtArea(area(r.points)) : fmtRoomArea(area(r.points), plan.region) }}</span>
        </li>
      </ul>
    </template>
  </aside>
</template>

<style scoped>
.panel {
  width: 290px;
  flex: none;
  border-left: 1px solid var(--border);
  background: var(--surface-2);
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
header {
  font-weight: 700;
  font-size: var(--fs-md);
  letter-spacing: 0.04em;
  color: var(--text);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
input:not([type='checkbox']),
select {
  font: inherit;
  font-size: var(--fs-base);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  height: var(--control-h);
  padding: 0 8px;
  min-width: 0;
  width: 100%;
}
input[type='number'] {
  font-variant-numeric: tabular-nums;
}
input:focus,
select:focus {
  outline: 2px solid var(--accent-ring);
  border-color: var(--accent);
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  text-align: right;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.actions button {
  min-height: var(--control-h);
}
/* 下拉框左侧压一个当前选项的图标（原生 select 里放不了图标） */
.ico-select {
  position: relative;
  display: block;
  color: var(--text);
}
.ico-select > svg {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
.ico-select select {
  padding-left: 30px;
}
.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--fs-sm);
}
.rooms li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.rooms li:hover {
  background: var(--hover);
}
.rooms i {
  width: 10px;
  height: 10px;
  border: 1px solid var(--text-muted);
  flex: none;
}
.rooms span:nth-child(2) {
  flex: 1;
}
.dim {
  color: var(--text-muted);
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin: 2px 0 6px;
}
.sw {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.sw.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.swatches input[type='color'] {
  width: 24px;
  height: 22px;
  padding: 0;
  border: none;
  background: none;
}
/* 手机：放在底部抽屉里（BottomSheet），不再是固定宽度的侧栏；滚动交给抽屉的内容区 */
:root.compact .panel {
  width: auto;
  border-left: 0;
  background: transparent;
  overflow: visible;
  padding: 4px 16px 20px;
}
/* 触屏：房间列表行高 ≥ 44px，好点 */
:root.coarse .rooms li {
  min-height: 44px;
}
</style>
