<script setup lang="ts">
// 3D 设计图的工具条：纸面、墙体、家具、楼层排法、单位、正交 / 透视、重置视角、导出 PNG。
// 桌面放在右上角；手机放到底部横向滚动（和预览模式的工具条一样）。
import { computed } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import { t } from '../i18n'
import { blueprint } from '../blueprintPrefs'
import { unitFor } from '../dimensions'
import { isMultiFloor } from '../floors'
import { plan } from '../store'

defineProps<{ busy?: boolean }>()
const emit = defineEmits<{ reset: []; export: [] }>()

const multi = computed(() => isMultiFloor(plan.value))
const autoUnit = computed(() => unitFor(plan.value.region))
</script>

<template>
  <div class="bp-bar" role="toolbar" :aria-label="t('设计图')">
    <label :title="t('纸面')">
      <span class="lb">{{ t('纸面') }}</span>
      <select v-model="blueprint.paper" :aria-label="t('纸面')">
        <option value="white">{{ t('白纸') }}</option>
        <option value="blue">{{ t('晒图') }}</option>
      </select>
    </label>
    <label :title="t('墙体')">
      <span class="lb">{{ t('墙体') }}</span>
      <select v-model="blueprint.walls" :aria-label="t('墙体')">
        <option value="cut">{{ t('剖切') }}</option>
        <option value="full">{{ t('完整墙高') }}</option>
      </select>
    </label>
    <label :title="t('家具')">
      <span class="lb">{{ t('家具') }}</span>
      <select v-model="blueprint.furniture" :aria-label="t('家具')">
        <option value="all">{{ t('全部') }}</option>
        <option value="large">{{ t('只显示大件') }}</option>
        <option value="none">{{ t('隐藏') }}</option>
      </select>
    </label>
    <label v-if="multi" :title="t('楼层')">
      <span class="lb">{{ t('楼层') }}</span>
      <select v-model="blueprint.layout" :aria-label="t('楼层')">
        <option value="explode">{{ t('分层拉开') }}</option>
        <option value="stack">{{ t('叠放') }}</option>
      </select>
    </label>
    <label :title="t('尺寸单位')">
      <span class="lb">{{ t('单位') }}</span>
      <select v-model="blueprint.unit" :aria-label="t('尺寸单位')">
        <option value="auto">{{ t('自动（{u}）', { u: autoUnit }) }}</option>
        <option value="mm">mm</option>
        <option value="cm">cm</option>
      </select>
    </label>
    <button :class="{ on: blueprint.ortho }" :aria-pressed="blueprint.ortho" :title="blueprint.ortho ? t('正交轴测（点击切换到透视）') : t('透视（点击切换到正交轴测）')" @click="blueprint.ortho = !blueprint.ortho">
      <JIcon :icon="blueprint.ortho ? ICONS.ortho : ICONS.perspective" />{{ blueprint.ortho ? t('轴测') : t('透视') }}
    </button>
    <button :title="t('重置视角') + ' (F)'" @click="emit('reset')"><JIcon :icon="ICONS.resetView" />{{ t('重置视角') }}</button>
    <button class="primary" :disabled="busy" :title="t('导出高分辨率 PNG')" @click="emit('export')"><JIcon :icon="ICONS.exportPng" />{{ t('导出 PNG') }}</button>
  </div>
</template>

<style scoped>
.bp-bar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 12px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  font-size: var(--fs-sm);
  z-index: 1;
  max-width: calc(100% - 24px - 330px);
  overflow-x: auto;
  scrollbar-width: none;
}
.bp-bar::-webkit-scrollbar {
  display: none;
}
.bp-bar > * {
  flex: none;
}
.bp-bar label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.lb {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.bp-bar select {
  height: 30px;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 6px;
}
.bp-bar button {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.bp-bar button.on {
  background: var(--accent-weak);
  border-color: var(--accent-ring);
  color: var(--accent-strong);
}
.bp-bar button.primary {
  background: var(--text);
  border-color: var(--text);
  color: var(--text-inverse);
}
.bp-bar button.primary:hover:not(:disabled) {
  background: #3d423f;
}
/* 窄一点的桌面：工具条换到模式切换下面一行 */
@media (max-width: 1180px) {
  .bp-bar {
    top: 58px;
    left: 12px;
    right: auto;
    max-width: calc(100% - 24px);
  }
}
/* 手机：放到底部，横向滚动 */
:root.compact .bp-bar {
  top: auto;
  left: 10px;
  right: 10px;
  max-width: none;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  padding: 6px 8px;
}
:root.compact .bp-bar .lb {
  display: none;
}
:root.coarse .bp-bar button,
:root.coarse .bp-bar select {
  height: 40px;
}
</style>
