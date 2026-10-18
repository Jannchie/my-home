<script setup lang="ts">
// 3D 沙盘画布右侧的竖排楼层切换（像地图 App 的室内楼层选择）：最高层在上，当前层高亮，点一下切换；顶部「+」加一层。
// 下面一组是显示方式：全部楼层 / 只到当前层 / 分层拉开 / 外观（单层户型是室内 / 外观），和楼层放在一起。
// 设置（改名、层高、删除）仍在 FloorBar 里。
import { computed } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import { t } from '../i18n'
import { isMultiFloor, planFloors } from '../floors'
import { activeFloor, addFloor, floorView3d, floorViews, plan, setFloor, setFloorView, type FloorView } from '../store'

const multi = computed(() => isMultiFloor(plan.value))
/** 最高层在上 */
const floors = computed(() => [...planFloors(plan.value)].sort((a, b) => b.elevation - a.elevation))
const views = computed(() => floorViews(multi.value))
const VIEW_ICONS: Record<FloorView, (typeof ICONS)[keyof typeof ICONS]> = { all: ICONS.floorAll, upto: ICONS.floorUpto, explode: ICONS.floorExplode, interior: ICONS.floorAll, exterior: ICONS.exteriorView }
/** 单层户型的「室内」：不是外观就算选中 */
const isOn = (v: FloorView) => (v === 'interior' ? floorView3d.value !== 'exterior' : floorView3d.value === v)
</script>

<template>
  <nav class="rail" role="tablist" :aria-label="t('楼层')" :aria-orientation="'vertical'">
    <button class="add" :title="t('加一层')" :aria-label="t('加一层')" @click="addFloor()"><JIcon :icon="ICONS.floorAdd" :size="14" /></button>
    <template v-if="multi">
      <button
        v-for="f in floors"
        :key="f.id"
        role="tab"
        class="lv"
        :class="{ on: f.id === activeFloor }"
        :aria-selected="f.id === activeFloor"
        :title="f.name"
        @click="setFloor(f.id)"
      >
        {{ f.name }}
      </button>
    </template>
    <div class="views" role="radiogroup" :aria-label="t('楼层显示')">
      <button
        v-for="v in views"
        :key="v.id"
        role="radio"
        class="vw"
        :class="{ on: isOn(v.id) }"
        :aria-checked="isOn(v.id)"
        :title="t(v.label) + (v.id === 'exterior' ? ' (O)' : '')"
        :aria-label="t(v.label)"
        @click="setFloorView(v.id)"
      >
        <JIcon :icon="VIEW_ICONS[v.id]" :size="15" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  position: absolute;
  right: 12px;
  /* 竖直居中在可见区域：手机上让开底部抽屉 */
  top: calc((100% - var(--sheet-h, 0px)) / 2);
  transform: translateY(-50%);
  z-index: 4;
  display: flex;
  flex-direction: column;
  width: 40px;
  padding: 3px;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.rail button {
  height: 32px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rail .add {
  color: var(--text-faint);
}
/* 「加一层」和楼层之间的分隔线画在「+」下沿，当前层高亮时不会被盖住 */
.rail .add:not(:last-child) {
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  margin-bottom: 2px;
}
.rail .lv.on {
  background: var(--accent);
  color: var(--accent-contrast, #fff);
  border-radius: var(--radius-sm);
}
.views {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
.rail .vw.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
}
.rail .vw:not(.on):hover,
.rail .lv:not(.on):hover {
  background: var(--surface-2);
  color: var(--text);
}
:root.coarse .rail {
  width: 44px;
}
:root.coarse .rail button {
  height: 40px;
}
</style>
