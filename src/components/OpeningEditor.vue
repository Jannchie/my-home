<script setup lang="ts">
// 3D 沙盘里点中门窗时浮出的编辑卡片内容：类型、宽度 / 位置微调、门的开向、窗 / 门的款式（复用 WindowStylePicker / DoorStylePicker）、删除。
// 每次改动一步撤销；宽度 / 位置顶到头时点按钮不记撤销。
import { computed } from 'vue'
import { OPENING_LABELS, type Opening, type OpeningKind } from '../model'
import { deleteSelection, mutate, plan } from '../store'
import { OFFSET_STEP, OPENING_MIN_W, WIDTH_STEP, nudgedOpening, openingEdgeLength } from '../openingEdit'
import { t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import WindowStylePicker from './WindowStylePicker.vue'
import DoorStylePicker from './DoorStylePicker.vue'
import OpeningWidthPresets from './OpeningWidthPresets.vue'

const props = defineProps<{ opening: Opening }>()

const edgeLen = computed(() => openingEdgeLength(plan.value, props.opening) ?? props.opening.width)
const KINDS = Object.keys(OPENING_LABELS) as OpeningKind[]

function edit(fn: (o: Opening) => void) {
  const id = props.opening.id
  mutate((p) => {
    const o = p.openings.find((x) => x.id === id)
    if (o) fn(o)
  })
}
function setKind(k: OpeningKind) {
  if (k !== props.opening.kind) edit((o) => (o.kind = k))
}
function nudge(dw: number, doff: number) {
  const v = nudgedOpening(plan.value, props.opening, dw, doff)
  if (!v) return
  edit((o) => {
    o.width = v.width
    o.offset = v.offset
  })
}
const canWider = computed(() => props.opening.width < Math.floor(edgeLen.value))
const canNarrower = computed(() => props.opening.width > Math.min(OPENING_MIN_W, edgeLen.value))
const half = computed(() => Math.min(props.opening.width, edgeLen.value) / 2)
const canBack = computed(() => props.opening.offset > half.value + 0.5)
const canFwd = computed(() => props.opening.offset < edgeLen.value - half.value - 0.5)
const swings = computed(() => props.opening.kind === 'door' || props.opening.kind === 'folding')
</script>

<template>
  <div class="op-ed">
    <label class="row">
      <span class="k">{{ t('类型') }}</span>
      <select :value="opening.kind" :aria-label="t('类型')" @change="setKind(($event.target as HTMLSelectElement).value as OpeningKind)">
        <option v-for="k in KINDS" :key="k" :value="k">{{ t(OPENING_LABELS[k]) }}</option>
      </select>
    </label>
    <div class="row">
      <span class="k">{{ t('宽 cm') }}</span>
      <div class="step">
        <button class="icon-only" :disabled="!canNarrower" :title="t('变窄')" :aria-label="t('变窄')" @click="nudge(-WIDTH_STEP, 0)"><JIcon :icon="ICONS.stepDown" :size="14" /></button>
        <span class="v num">{{ Math.round(opening.width) }}</span>
        <button class="icon-only" :disabled="!canWider" :title="t('变宽')" :aria-label="t('变宽')" @click="nudge(WIDTH_STEP, 0)"><JIcon :icon="ICONS.stepUp" :size="14" /></button>
      </div>
    </div>
    <OpeningWidthPresets :opening="opening" />
    <div class="row">
      <span class="k">{{ t('位置 cm') }}</span>
      <div class="step">
        <button class="icon-only" :disabled="!canBack" :title="t('沿墙往回挪')" :aria-label="t('沿墙往回挪')" @click="nudge(0, -OFFSET_STEP)"><JIcon :icon="ICONS.stepDown" :size="14" /></button>
        <span class="v num">{{ Math.round(opening.offset) }}</span>
        <button class="icon-only" :disabled="!canFwd" :title="t('沿墙往前挪')" :aria-label="t('沿墙往前挪')" @click="nudge(0, OFFSET_STEP)"><JIcon :icon="ICONS.stepUp" :size="14" /></button>
      </div>
    </div>
    <div v-if="swings" class="acts">
      <button @click="edit((o) => (o.hinge = o.hinge === 'start' ? 'end' : 'start'))"><JIcon :icon="ICONS.doorFlip" :size="14" />{{ t('左右翻转') }}</button>
      <button @click="edit((o) => (o.swing = o.swing === 'in' ? 'out' : 'in'))"><JIcon :icon="ICONS.doorFlip" :size="14" />{{ t('内外翻转') }}</button>
    </div>
    <WindowStylePicker v-if="opening.kind === 'window'" :opening="opening" variant="card" />
    <DoorStylePicker v-else :opening="opening" variant="card" />
    <div class="acts">
      <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" :size="14" />{{ t('删除') }}</button>
    </div>
  </div>
</template>

<style scoped>
.op-ed {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: var(--fs-sm);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.k {
  flex: 0 0 auto;
  min-width: 4.5em;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.row select {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  height: var(--control-h);
  padding: 0 8px;
}
.step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}
.step .v {
  flex: 1;
  text-align: center;
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.acts button {
  flex: 1;
}
</style>
