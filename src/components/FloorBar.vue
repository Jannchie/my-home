<script setup lang="ts">
// 楼层切换条：1F / 2F … / + 新楼层；当前楼层的设置（重命名、层高、从下层复制外轮廓、删除）收在一个小浮层里。
// 平面图画布左上角（variant = canvas）和 3D 沙盘的场景页 / 手机抽屉（variant = panel，另带楼层显示方式）共用。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import { t } from '../i18n'
import { baseFloorId, floorBelow, isMultiFloor, planFloors } from '../floors'
import { stairHoleConflicts } from '../stairs'
import { FLOOR_SHOWS, activeFloor, addFloor, copyOutlineFromBelow, deleteFloor, floorShow, plan, renameFloor, setFloor, setFloorHeight, type FloorShow } from '../store'

const props = withDefaults(defineProps<{ variant?: 'canvas' | 'panel' }>(), { variant: 'canvas' })

const floors = computed(() => planFloors(plan.value))
const multi = computed(() => isMultiFloor(plan.value))
const active = computed(() => floors.value.find((f) => f.id === activeFloor.value) ?? floors.value[0])
const canDelete = computed(() => multi.value && active.value.id !== baseFloorId(plan.value))
const hasBelow = computed(() => !!floorBelow(plan.value, activeFloor.value))
/** 楼梯洞口压到房间的提示（只看当前层） */
const conflicts = computed(() => stairHoleConflicts(plan.value).filter((c) => c.floor === activeFloor.value).length)

const open = ref(false)
const root = ref<HTMLElement>()
const nameDraft = ref('')
watch(open, (v) => {
  if (v) nameDraft.value = active.value.name
})
function onDocDown(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
watch(open, async (v) => {
  await nextTick()
  if (v) document.addEventListener('pointerdown', onDocDown, true)
  else document.removeEventListener('pointerdown', onDocDown, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true))

function commitName() {
  if (multi.value) renameFloor(active.value.id, nameDraft.value)
}
function onHeight(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) setFloorHeight(active.value.id, v)
}
function add() {
  addFloor()
  open.value = false
}
function remove() {
  deleteFloor(active.value.id)
  open.value = false
}
function copyOutline() {
  copyOutlineFromBelow()
  open.value = false
}
const SHOW_ICONS: Record<FloorShow, (typeof ICONS)[keyof typeof ICONS]> = { all: ICONS.floorAll, upto: ICONS.floorUpto, explode: ICONS.floorExplode }
</script>

<template>
  <div ref="root" class="floorbar" :class="['fb-' + props.variant, { multi }]">
    <div class="chips" role="tablist" :aria-label="t('楼层')">
      <JIcon v-if="props.variant === 'canvas'" :icon="ICONS.floors" :size="14" class="ico-muted lead" />
      <button
        v-for="f in floors"
        :key="f.id"
        role="tab"
        class="chip"
        :class="{ on: f.id === activeFloor }"
        :aria-selected="f.id === activeFloor"
        :title="t('切换到 {name}', { name: f.name })"
        @click="f.id === activeFloor ? (open = !open) : setFloor(f.id)"
      >
        {{ f.name }}
      </button>
      <button class="chip icon-only" :title="t('加一层')" :aria-label="t('加一层')" @click="add"><JIcon :icon="ICONS.floorAdd" :size="14" /></button>
      <button v-if="multi" class="chip icon-only" :class="{ on: open }" :title="t('楼层设置')" :aria-label="t('楼层设置')" :aria-expanded="open" @click="open = !open"><JIcon :icon="ICONS.generateOptions" :size="14" /></button>
    </div>
    <span v-if="conflicts" class="warn" :title="t('楼梯洞口压到了卧室等房间：把洞口所在的地方改成走廊或挑空，或者挪开楼梯')">{{ t('楼梯洞口和房间重叠') }}</span>
    <div v-if="props.variant === 'panel' && multi" class="seg shows" :title="t('楼层显示')">
      <button v-for="m in FLOOR_SHOWS" :key="m.id" :class="{ on: floorShow === m.id }" :title="t(m.label)" :aria-label="t(m.label)" @click="floorShow = m.id">
        <JIcon :icon="SHOW_ICONS[m.id]" :size="15" /><span>{{ t(m.label) }}</span>
      </button>
    </div>
    <div v-if="open && multi" class="pop" role="dialog" :aria-label="t('楼层设置')">
      <label class="row">
        <span>{{ t('名称') }}</span>
        <input v-model="nameDraft" maxlength="12" @change="commitName" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      </label>
      <label class="row">
        <span>{{ t('层高') }}</span>
        <input class="num" type="number" min="200" max="400" step="10" :value="active.height" @change="onHeight" />
        <span class="unit">cm</span>
      </label>
      <button v-if="hasBelow" class="wide" @click="copyOutline"><JIcon :icon="ICONS.copy" :size="14" />{{ t('从下层复制外轮廓') }}</button>
      <button v-if="canDelete" class="wide danger" @click="remove"><JIcon :icon="ICONS.delete" :size="14" />{{ t('删除这一层') }}</button>
    </div>
  </div>
</template>

<style scoped>
.floorbar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.floorbar.fb-canvas {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
}
.chips {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.fb-panel .chips {
  background: var(--surface);
  box-shadow: none;
}
.lead {
  margin: 0 4px 0 5px;
}
.chip {
  height: var(--control-h-sm);
  min-width: 34px;
  padding: 0 9px;
  border-color: transparent;
  background: transparent;
  font-variant-numeric: tabular-nums;
}
.chip.icon-only {
  min-width: 0;
  width: var(--control-h-sm);
  padding: 0;
}
.chip.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  font-weight: 600;
}
.warn {
  padding: 3px 9px;
  font-size: var(--fs-xs);
  color: var(--danger);
  background: var(--danger-weak);
  border-radius: 999px;
}
.shows {
  display: flex;
  width: 100%;
  gap: 2px;
  padding: 3px;
  background: var(--hover);
  border-radius: var(--radius);
}
.shows button {
  flex: 1;
  height: var(--control-h-sm);
  padding: 0 6px;
  font-size: var(--fs-xs);
  border-color: transparent;
  background: transparent;
}
.shows button.on {
  background: var(--surface);
  border-color: var(--border);
  color: var(--accent-strong);
}
.pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 240px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
}
.row > span:first-child {
  width: 48px;
  color: var(--text-muted);
}
.row input {
  flex: 1;
  min-width: 0;
  height: var(--control-h-sm);
  padding: 0 8px;
  font: inherit;
  font-size: var(--fs-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.unit {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.wide {
  width: 100%;
  justify-content: center;
}
:root.compact .floorbar.fb-canvas {
  top: 10px;
  left: 10px;
}
:root.compact .chip {
  height: 36px;
  min-width: 40px;
}
:root.compact .chip.icon-only {
  width: 36px;
}
</style>
