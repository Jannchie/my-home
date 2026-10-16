<script setup lang="ts">
import { computed } from 'vue'
import { FIXTURES, OPENING_LABELS, ROOM_KINDS, area, bbox, edgeInfo, fixtureDepth, fmtArea, fmtJo, fmtRoomArea, isAxisRect, perimeter, rectPoints, type KitchenVariant, type OpeningKind, type RoomKind, TOILET_TYPES, type ToiletType, BUILTIN_TYPES, type BuiltinType, WASHER_STYLES, FRIDGE_STYLES, APPLIANCE_COLORS } from '../model'
import { planArea } from '../generate'
import { RAILING_KINDS, type RailingKind } from '../model'
import { isIndoor } from '../walls'
import { deleteSelection, duplicateSelection, findFixture, findRoom, mutate, plan, rotateSelectedFixture, selection, settings, tidyDoors } from '../store'
import { roomName, t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import { FIXTURE_ICONS, ICONS, ROOM_ICONS, TOOL_ICONS } from '../ui/icons'

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

const sortedRooms = computed(() => [...plan.value.rooms].sort((a, b) => area(b.points) - area(a.points)))

const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const str = (e: Event) => (e.target as HTMLInputElement).value

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

/** 嵌墙切换：柜子沿正面方向挪一个柜深（嵌墙时柜体退到墙后，正面和墙面齐平） */
function toggleRecessed() {
  const f = fixture.value
  if (!f) return
  mutate(() => {
    const a = (f.rot * Math.PI) / 180
    const k = (f.recessed ? 1 : -1) * fixtureDepth(f)
    f.x = Math.round(f.x - Math.sin(a) * k)
    f.y = Math.round(f.y + Math.cos(a) * k)
    f.recessed = !f.recessed
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
          <select :value="room.kind" @change="setKind(str($event) as RoomKind)">
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
      <p class="hint">{{ t('拖边可整体推墙；双击边插入顶点；拖角点改形状。') }}</p>
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
            @change="mutate(() => (opening!.o.width = Math.min(num($event), opening!.edgeLen)))"
        /></label>
        <label
          >{{ t('位置 cm') }}<input type="number" step="10" :value="Math.round(opening.o.offset)" @change="mutate(() => (opening!.o.offset = num($event)))"
        /></label>
      </div>
      <div v-if="opening.o.kind === 'door' || opening.o.kind === 'folding'" class="actions">
        <button @click="mutate(() => (opening!.o.hinge = opening!.o.hinge === 'start' ? 'end' : 'start'))">{{ t('左右翻转') }}</button>
        <button @click="mutate(() => (opening!.o.swing = opening!.o.swing === 'in' ? 'out' : 'in'))">{{ t('内外翻转') }}</button>
      </div>
      <div class="actions">
        <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }} <kbd>Del</kbd></button>
      </div>
      <p class="hint">{{ t('拖动可沿墙移动，靠近别的墙会吸附过去。') }}</p>
    </template>

    <!-- 设备 -->
    <template v-else-if="fixture">
      <header class="ico-label"><JIcon :icon="FIXTURE_ICONS[fixture.kind]" class="ico-muted" />{{ t(FIXTURES[fixture.kind].label) }}</header>
      <label v-if="fixture.kind === 'kitchen'"
        >{{ t('样式') }}
        <select :value="fixture.variant" @change="mutate(() => (fixture!.variant = str($event) as KitchenVariant))">
          <option value="wall">{{ t('壁付け（台面贴墙）') }}</option>
          <option value="facing">{{ t('対面（背面柜 + 通道 + 主台面）') }}</option>
        </select>
      </label>
      <template v-if="fixture.kind === 'builtin'">
        <label
          >{{ t('类型') }}
          <select :value="fixture.builtinType ?? 'shoe'" @change="mutate(() => (fixture!.builtinType = str($event) as BuiltinType))">
            <option v-for="(label, k) in BUILTIN_TYPES" :key="k" :value="k">{{ t(label) }}</option>
          </select>
        </label>
        <label class="inline"><input type="checkbox" :checked="!!fixture.recessed" @change="toggleRecessed" /> {{ t('嵌在墙里（不占房间）') }}</label>
        <label class="inline"><input type="checkbox" :checked="!!fixture.open" @change="mutate(() => (fixture!.open = !fixture!.open))" /> {{ t('柜门打开（可往里放东西）') }}</label>
      </template>
      <template v-if="fixture.kind === 'fridge' || fixture.kind === 'washer'">
        <label
          >{{ t('款式') }}
          <select :value="fixture.style ?? (fixture.kind === 'fridge' ? '3door' : 'drum')" @change="mutate(() => (fixture!.style = str($event) as never))">
            <option v-for="(label, k) in fixture.kind === 'fridge' ? FRIDGE_STYLES : WASHER_STYLES" :key="k" :value="k">{{ t(label) }}</option>
          </select>
        </label>
        <div class="swatches">
          <button v-for="c in APPLIANCE_COLORS" :key="c" class="sw" :class="{ on: fixture.color === c }" :style="{ background: c }" :title="c" @click="mutate(() => (fixture!.color = c))" />
          <input type="color" :value="fixture.color ?? '#f6f6f3'" :title="t('自定义颜色')" @change="mutate(() => (fixture!.color = str($event)))" />
        </div>
      </template>
      <label v-if="fixture.kind === 'toilet'"
        >{{ t('类型') }}
        <select :value="fixture.toiletType ?? 'washlet'" @change="mutate(() => (fixture!.toiletType = str($event) as ToiletType))">
          <option v-for="(label, k) in TOILET_TYPES" :key="k" :value="k">{{ t(label) }}</option>
        </select>
      </label>
      <label v-if="fixture.kind === 'kitchen'"
        >{{ t('灶头') }}
        <select :value="fixture.burners ?? (fixture.w < 200 ? 2 : 3)" @change="mutate(() => (fixture!.burners = Number(str($event)) as 2 | 3))">
          <option :value="2">{{ t('两口') }}</option>
          <option :value="3">{{ t('三口') }}</option>
        </select>
      </label>
      <div class="row">
        <label
          >{{ t('长 cm') }}<input type="number" step="5" min="20" :value="fixture.w" @change="mutate(() => (fixture!.w = Math.max(20, num($event))))"
        /></label>
        <label v-if="fixture.kind !== 'kitchen'"
          >{{ t('深 cm') }}<input type="number" step="5" min="10" :value="fixtureDepth(fixture)" @change="mutate(() => (fixture!.d = Math.max(10, num($event))))"
        /></label>
      </div>
      <div class="actions">
        <button @click="rotateSelectedFixture"><JIcon :icon="ICONS.rotateCw" />{{ t('旋转 90°') }} <kbd>Q</kbd></button>
        <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }} <kbd>Del</kbd></button>
      </div>
      <p v-if="fixture.kind === 'kitchen'" class="hint">{{ t('日式间取り里厨房一般画在 LDK 内，面积计入 LDK 的帖数。要独立厨房，可以画一个「キッチン」类型的房间。') }}</p>
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
        <dt>{{ t('专有面积') }}</dt>
        <dd class="num">{{ fmtArea(stats.total) }}</dd>
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
      <p class="hint">{{ t('面积按墙中心线计（壁芯面積），1帖 = 1.62㎡。') }}</p>
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
.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
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
</style>
