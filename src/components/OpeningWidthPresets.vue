<script setup lang="ts">
// 门窗的常用宽度：一排按钮，点一下换成这个宽度（中心不动、夹在墙边内，一步撤销）。平面图检查器、3D 门窗卡片共用。
import { computed } from 'vue'
import type { Opening } from '../model'
import { mutate, plan } from '../store'
import { WIDTH_PRESETS, openingEdgeLength, resizedOpening } from '../openingEdit'
import { t } from '../i18n'

const props = defineProps<{ opening: Opening }>()

const edgeLen = computed(() => openingEdgeLength(plan.value, props.opening) ?? Infinity)
const presets = computed(() => WIDTH_PRESETS[props.opening.kind].filter((w) => w <= edgeLen.value))

function pick(width: number) {
  const id = props.opening.id
  const v = resizedOpening(plan.value, props.opening, width)
  if (!v) return
  mutate((p) => {
    const o = p.openings.find((x) => x.id === id)
    if (!o) return
    o.width = v.width
    o.offset = v.offset
  })
}
</script>

<template>
  <div v-if="presets.length" class="presets" role="group" :aria-label="t('常用宽度')">
    <span class="k">{{ t('常用宽度') }}</span>
    <button v-for="w in presets" :key="w" class="num" :class="{ on: Math.round(opening.width) === w }" :aria-pressed="Math.round(opening.width) === w" @click="pick(w)">{{ w }}</button>
  </div>
</template>

<style scoped>
.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.k {
  color: var(--muted, #6b665d);
  font-size: 12px;
  margin-right: 2px;
}
button {
  padding: 2px 8px;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
button.on {
  background: var(--accent, #3f6652);
  color: #fff;
  border-color: transparent;
}
</style>
