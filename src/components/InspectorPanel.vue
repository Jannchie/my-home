<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_STAIR_STYLE, STAIR_STYLES } from '../stairStyles'
import { FIXTURES, OPENING_LABELS, ROOM_KINDS, area, bbox, edgeInfo, fixtureDepth, fmtArea, fmtJo, fmtRoomArea, isAxisRect, perimeter, rectPoints, type KitchenVariant, type OpeningKind, type RoomKind, TOILET_TYPES, type ToiletType, BUILTIN_TYPES, type BuiltinType } from '../model'
import { planArea } from '../generate'
import { RAILING_KINDS, type RailingKind } from '../model'
import { isIndoor } from '../walls'
import { deleteSelection, duplicateSelection, findFixture, findRoom, mutate, plan, floorPlan, rotateSelectedFixture, selection, settings, tidyDoors, setRoomLight, setRoomLightK } from '../store'
import { STAIRS_VARIANTS, type StairsVariant } from '../model'
import { floorAbove, floorOf, isMultiFloor, planFloors, riseOf, floorView } from '../floors'
import { MAX_RISER, STAIRS_SIZE, stairsVariant } from '../stairs'
import { cabinetsOn, setOpen } from '../cabinet'
import { propsOn } from '../surface'
import { ASSET_MAP } from '../three/assets'
import { displayName } from '../three/catalog'
import { LIGHT_MODES, type LightMode } from '../three/lights'
import { roomName, t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import WindowStylePicker from './WindowStylePicker.vue'
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

/** 楼梯：通到哪一层、级数、踢面高 */
const stairInfo = computed(() => {
  const f = fixture.value
  if (f?.kind !== 'stairs') return null
  const from = floorOf(plan.value, f)
  const rise = riseOf(plan.value, from)
  const n = Math.max(3, Math.ceil(rise / MAX_RISER))
  return { to: floorAbove(plan.value, from), rise, n, riser: rise / n }
})
/** 换楼梯形式：占地换成这种形式的默认尺寸（中心不动） */
function setStairs(v: StairsVariant) {
  const f = fixture.value
  if (!f) return
  mutate(() => {
    f.stairs = v
    f.w = STAIRS_SIZE[v].w
    f.d = STAIRS_SIZE[v].d
    if (v === 'straight') delete f.turn
    if (v !== 'l') delete f.run
    if (v !== 'straight' && v !== 'l') delete f.under
  })
}
/** 楼梯下的用法：'' = 按外观样式 */
function setUnder(v: string) {
  const f = fixture.value
  if (!f) return
  mutate(() => {
    if (v === 'open') f.under = v
    else delete f.under
  })
}

/** 换楼梯外观样式（经典 = 缺省，不写字段） */
function setStairStyle(v: string) {
  const f = fixture.value
  if (!f) return
  mutate(() => {
    if (v === DEFAULT_STAIR_STYLE) delete f.stairStyle
    else f.stairStyle = v
  })
}

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

/** 嵌墙切换：收纳位沿正面方向挪一个位深（嵌墙时退到墙后，正面和墙面齐平）；位上的柜子和柜里的东西一起挪 */
function toggleRecessed() {
  const f = fixture.value
  if (!f) return
  mutate((p) => {
    const a = (f.rot * Math.PI) / 180
    const k = (f.recessed ? 1 : -1) * fixtureDepth(f)
    const dx = Math.round(-Math.sin(a) * k)
    const dy = Math.round(Math.cos(a) * k)
    const cabs = cabinetsOn(p.furniture, f)
    for (const o of new Set([...cabs, ...cabs.flatMap((c) => propsOn(p, c))])) {
      o.x += dx
      o.y += dy
    }
    f.x += dx
    f.y += dy
    f.recessed = !f.recessed
  })
}

/** 收纳位上放着的、能开合的柜子（平面图里在收纳位的属性里开关柜门） */
const spotCabinets = computed(() => {
  const f = fixture.value
  return f?.kind === 'builtin' ? cabinetsOn(plan.value.furniture, f).filter((c) => ASSET_MAP.get(c.asset)?.openable) : []
})
function setSpotOpen(open: boolean) {
  const cabs = spotCabinets.value
  if (!cabs.length || cabs.every((c) => !!c.open === open)) return
  mutate((p) => {
    for (const c of cabs) setOpen(p, c, open)
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
      <p v-if="room.kind === 'void'" class="hint">{{ t('挑空：这一块没有楼板，下层在这里通高（下层的外墙一直砌到这一层的天花）。') }}</p>
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
      <WindowStylePicker v-if="opening.o.kind === 'window'" :opening="opening.o" />
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
        <label v-if="spotCabinets.length" class="inline"
          ><input type="checkbox" :checked="spotCabinets.every((c) => c.open)" @change="setSpotOpen(!spotCabinets.every((c) => c.open))" />
          {{ t('柜门打开（{name}）', { name: displayName(ASSET_MAP.get(spotCabinets[0].asset)!) }) }}</label
        >
        <p class="hint">{{ t('收纳位只是预留的空间（嵌墙的是墙里的壁龛）。柜子本身是家具：一键布置会按位的尺寸放一件鞋柜 / 衣柜 / 食品柜，也可以在 3D 沙盘或素材库里自己换款式和颜色。') }}</p>
      </template>
      <template v-if="fixture.kind === 'stairs'">
        <label
          >{{ t('形式') }}
          <select :value="stairsVariant(fixture)" @change="setStairs(str($event) as StairsVariant)">
            <option v-for="(label, k) in STAIRS_VARIANTS" :key="k" :value="k">{{ t(label) }}</option>
          </select>
        </label>
        <label
          >{{ t('样式') }}
          <select :value="fixture.stairStyle ?? DEFAULT_STAIR_STYLE" @change="setStairStyle(str($event))">
            <option v-for="(st, k) in STAIR_STYLES" :key="k" :value="k">{{ t(st.label) }}</option>
          </select>
        </label>
        <label v-if="stairsVariant(fixture) !== 'straight'"
          >{{ t('上楼方向') }}
          <select :value="fixture.turn ?? 'left'" @change="mutate(() => (fixture!.turn = str($event) as 'left' | 'right'))">
            <option value="left">{{ t('往左拐') }}</option>
            <option value="right">{{ t('往右拐') }}</option>
          </select>
        </label>
        <label v-if="stairsVariant(fixture) === 'l'"
          >{{ t('梯段宽 cm') }}<input type="number" step="5" min="60" max="150" :value="fixture.run ?? 90" @change="mutate(() => (fixture!.run = Math.max(60, num($event))))"
        /></label>
        <label v-if="stairsVariant(fixture) === 'straight' || stairsVariant(fixture) === 'l'"
          >{{ t('楼梯下') }}
          <select :value="fixture.under ?? ''" @change="setUnder(str($event))">
            <option value="">{{ t('按外观样式') }}</option>
            <option value="open">{{ t('储物角（敞开）') }}</option>
          </select>
        </label>
        <dl v-if="stairInfo">
          <dt>{{ t('通到') }}</dt>
          <dd>{{ stairInfo.to?.name ?? t('（上面还没有楼层）') }}</dd>
          <dt>{{ t('级数') }}</dt>
          <dd class="num">{{ t('{n} 级 · 每级 {r} cm', { n: stairInfo.n, r: stairInfo.riser.toFixed(1) }) }}</dd>
        </dl>
        <p class="hint">{{ t('楼梯放在下层，通到上面一层；上层对应的位置自动开出楼梯洞口。旋转 90° 改朝向，起步处是小圆、箭头指向上楼方向。') }}</p>
      </template>
      <p v-if="fixture.kind === 'fridge'" class="hint">{{ t('冰箱位只是预留的空间。冰箱本身是家具：一键布置会按户型和住户风格放一台，也可以在 3D 沙盘或素材库里自己挑款式和颜色。') }}</p>
      <p v-if="fixture.kind === 'washer'" class="hint">{{ t('洗衣机位是防水盘和给排水口。洗衣机本身是家具：一键布置会按户型和住户风格放一台，也可以在 3D 沙盘或素材库里自己挑款式和颜色。') }}</p>
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
