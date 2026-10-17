<script setup lang="ts">
// 放设备：先在面板里挑（分组的图标 + 名字 + 尺寸），挑好后画面里出现跟手的预览，下方一条放置条。
// 桌面：预览跟着光标，点一下放下；触屏：预览先出现在画面中央，拖它或点画面挪过去，按「放下」确认。
// 预览本身由 PlanCanvas 画（ghost），这里只管选择和操作按钮。
import { computed } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { FIXTURE_ICONS, ICONS } from '../ui/icons'
import { t } from '../i18n'
import { FIXTURES, fixtureDepth, type FixtureKind } from '../model'
import { placeContinuous, placeKind, placePicker, placeRot, tool } from '../store'

defineProps<{ touch: boolean; bottom?: string }>()
const emit = defineEmits<{ confirm: []; picked: [] }>()

/** 面板分组（每种设备只出现一次） */
const GROUPS: { label: string; kinds: FixtureKind[] }[] = [
  { label: '厨卫', kinds: ['kitchen', 'bathtub', 'toilet', 'basin', 'washer'] },
  { label: '收纳与家电位', kinds: ['fridge', 'builtin'] },
  { label: '结构与室外', kinds: ['stairs', 'ps', 'outdoor'] },
]
const size = (k: FixtureKind) => {
  const d = fixtureDepth(k === 'kitchen' ? { kind: k, variant: 'wall' } : { kind: k })
  return `${FIXTURES[k].w} × ${d}`
}
const cur = computed(() => placeKind.value)

function pick(k: FixtureKind) {
  placeKind.value = k
  placeRot.value = 0
  placePicker.value = false
  tool.value = 'fixture'
  emit('picked')
}
function cancel() {
  placePicker.value = false
  tool.value = 'select'
}
</script>

<template>
  <!-- 设备面板 -->
  <div v-if="placePicker" class="picker" :class="{ touch }" :style="touch && bottom ? { bottom } : undefined" role="dialog" :aria-label="t('选择设备')">
    <header>
      <b>{{ t('选择设备') }}</b>
      <button class="icon-only" :title="t('取消')" :aria-label="t('取消')" @click="cancel"><JIcon :icon="ICONS.close" /></button>
    </header>
    <section v-for="g in GROUPS" :key="g.label">
      <h4>{{ t(g.label) }}</h4>
      <div class="grid">
        <button v-for="k in g.kinds" :key="k" class="item" :class="{ on: k === cur && tool === 'fixture' }" @click="pick(k)">
          <JIcon :icon="FIXTURE_ICONS[k]" :size="22" />
          <span class="name">{{ t(FIXTURES[k].label) }}</span>
          <span class="size">{{ size(k) }}</span>
        </button>
      </div>
    </section>
  </div>

  <!-- 放置条 -->
  <div v-else-if="tool === 'fixture'" class="placebar" :class="{ touch }" :style="touch && bottom ? { bottom } : undefined">
    <button class="what" :title="t('换设备')" @click="placePicker = true">
      <JIcon :icon="FIXTURE_ICONS[cur]" :size="18" />
      <span class="name">{{ t(FIXTURES[cur].label) }}</span>
      <span class="size">{{ size(cur) }}</span>
      <JIcon :icon="ICONS.expand" :size="14" class="caret" />
    </button>
    <span class="hint">{{ touch ? t('拖动预览，或点画面把它移过去') : t('点画面放置，靠近墙会自动贴墙') }}</span>
    <button class="icon-only" :title="t('旋转 90°') + (touch ? '' : ' (R)')" :aria-label="t('旋转 90°')" @click="placeRot = (placeRot + 90) % 360"><JIcon :icon="ICONS.rotateCw" /></button>
    <label class="cont" :title="t('放下后接着放同一种')"><input v-model="placeContinuous" type="checkbox" />{{ t('连续放置') }}</label>
    <button @click="cancel">{{ t('取消') }}</button>
    <button v-if="touch" class="primary" @click="emit('confirm')"><JIcon :icon="ICONS.check" />{{ t('放下') }}</button>
  </div>
</template>

<style scoped>
.picker,
.placebar {
  position: absolute;
  z-index: 6;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md, var(--shadow-sm));
}
/* 桌面：画布顶部居中 */
.picker {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(440px, calc(100% - 32px));
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 10px 12px 12px;
}
.picker header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.picker h4 {
  margin: 8px 0 6px;
  font-size: var(--fs-xs, 12px);
  font-weight: 500;
  color: var(--text-muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 6px;
}
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  height: auto;
  padding: 10px 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  background: var(--surface);
  color: var(--text);
}
.item:hover {
  background: var(--surface-2);
}
.item.on {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.name {
  font-size: var(--fs-sm);
  white-space: nowrap;
}
/* 面板格子里的名字可以折行（「PS（管道井）」这类长名字） */
.item .name {
  white-space: normal;
  text-align: center;
  line-height: 1.25;
}
.size {
  font-size: var(--fs-xs, 11px);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* 放置条：桌面在画布顶部居中 */
.placebar {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 4px;
  white-space: nowrap;
  max-width: calc(100% - 32px);
}
.placebar .what {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: var(--surface-2);
}
.placebar .caret {
  color: var(--text-faint);
}
.placebar .hint {
  font-size: var(--fs-xs, 12px);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.placebar .cont {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
/* 触屏：贴在底部抽屉上方，左右 16px 边距；放置条分两行 */
.picker.touch,
.placebar.touch {
  top: auto;
  left: 16px;
  right: 16px;
  transform: none;
  width: auto;
  max-width: none;
}
.picker.touch {
  max-height: 60vh;
}
.picker.touch .grid {
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
}
.placebar.touch {
  flex-wrap: wrap;
  padding: 8px;
  white-space: normal;
}
.placebar.touch .hint {
  order: 9;
  flex-basis: 100%;
  padding: 0 4px;
}
.placebar.touch .primary {
  margin-left: auto;
}
</style>
