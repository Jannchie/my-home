<script setup lang="ts">
// 「生成选项」的表单：桌面是顶栏下的弹层，手机是底部面板（App.vue 决定外壳），这里只管字段。
import { computed } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { REGION_LABELS } from '../model'
import { LAYOUT_TYPES, STYLE_LABELS } from '../generate'
import { DWELLING_LABELS, dwellingsFor, houseBedrooms, type Dwelling } from '../generate-house'
import { jp, t } from '../i18n'
import { ICONS } from '../ui/icons'
import { chooseRegion, genOptions, sandbox } from '../store'

const emit = defineEmits<{ generate: [newSeed: boolean] }>()

// 面积输入：空字符串表示不限
const areaModel = (key: 'minArea' | 'maxArea') =>
  computed({
    get: () => genOptions[key] ?? '',
    set: (v: string | number) => {
      const n = Number(v)
      genOptions[key] = v === '' || !Number.isFinite(n) || n <= 0 ? null : n
    },
  })
const minArea = areaModel('minArea')
const maxArea = areaModel('maxArea')
// 住宅类型：公寓 / 户建 / 复式（欧美没有复式）；随机 = 按种子，公寓为主
const dwellings = computed<Dwelling[]>(() => (genOptions.region === 'cn' || genOptions.region === 'jp' ? dwellingsFor(genOptions.region) : genOptions.region === 'west' ? dwellingsFor('west') : ['apartment', 'house', 'duplex']))
const flat = computed(() => !genOptions.dwelling || genOptions.dwelling === 'apartment' || genOptions.dwelling === 'random')
const isApartment = computed(() => !genOptions.dwelling || genOptions.dwelling === 'apartment')
const jpRegion = computed(() => genOptions.region !== 'cn' && genOptions.region !== 'west' && flat.value)
// 户建 / 复式的卧室数：随地区（中式最多 5 间）
const houseBeds = computed(() => houseBedrooms(genOptions.region === 'cn' || genOptions.region === 'west' ? genOptions.region : 'jp'))
</script>

<template>
  <div class="gen-form">
    <label class="field">
      <span>{{ t('地区 / 风格') }}</span>
      <select :value="genOptions.region" @change="chooseRegion(($event.target as HTMLSelectElement).value as never)">
        <option v-for="(label, key) in REGION_LABELS" :key="key" :value="key">{{ t(label) }}</option>
        <option value="random">{{ t('随机地区') }}</option>
      </select>
    </label>
    <label class="field">
      <span>{{ t('住宅类型') }}</span>
      <select v-model="genOptions.dwelling" :title="t('随机：按种子出公寓或户建，公寓为主')">
        <option value="random">{{ t('随机类型') }}</option>
        <option v-for="d in dwellings" :key="d" :value="d">{{ t(DWELLING_LABELS[d]) }}</option>
      </select>
    </label>
    <label v-if="!flat" class="field">
      <span>{{ t('层数') }}</span>
      <select disabled :title="t('目前只支持两层')">
        <option>{{ t('{n} 层', { n: 2 }) }}</option>
      </select>
    </label>
    <label v-if="!flat" class="field">
      <span>{{ t('卧室数') }}</span>
      <select v-model="genOptions.bedrooms">
        <option value="random">{{ t('随机户型') }}</option>
        <option v-for="n in houseBeds" :key="n" :value="n">{{ genOptions.region === 'cn' ? t('{n} 室', { n }) : genOptions.region === 'west' ? t('{n} 卧', { n }) : `${n}LDK` }}</option>
      </select>
    </label>
    <label v-else-if="!jpRegion" class="field">
      <span>{{ t('卧室数') }}</span>
      <select v-model="genOptions.bedrooms">
        <option value="random">{{ t('随机户型') }}</option>
        <option v-for="n in [1, 2, 3, 4]" :key="n" :value="n">{{ genOptions.region === 'cn' ? t('{n} 室', { n }) : t('{n} 卧', { n }) }}</option>
      </select>
    </label>
    <label v-if="jpRegion" class="field">
      <span>{{ t('间取り') }}</span>
      <select v-model="genOptions.type">
        <option value="random">{{ t('随机户型') }}</option>
        <option v-for="lt in LAYOUT_TYPES" :key="lt" :value="lt">{{ lt }}</option>
      </select>
    </label>
    <label v-if="jpRegion" class="field">
      <span>{{ t('骨架') }}</span>
      <select v-model="genOptions.style">
        <option value="random">{{ t('随机骨架') }}</option>
        <option v-for="(label, key) in STYLE_LABELS" :key="key" :value="key">{{ jp(label) }}</option>
      </select>
    </label>
    <label v-if="jpRegion" class="field">
      <span>{{ t('居室入口') }}</span>
      <select v-model="genOptions.access">
        <option value="random">{{ t('入口随机') }}</option>
        <option value="hall">{{ t('廊下进') }}</option>
        <option value="living">{{ t('リビングイン') }}</option>
      </select>
    </label>
    <label v-if="isApartment || genOptions.dwelling === 'random'" class="field">
      <span>{{ t('住户位置') }}</span>
      <select v-model="genOptions.corner" :title="t('角部屋（侧墙开窗）')">
        <option value="random">{{ t('位置随机') }}</option>
        <option value="no">{{ t('中部屋') }}</option>
        <option value="yes">{{ t('角部屋') }}</option>
      </select>
    </label>
    <div class="field">
      <span>{{ isApartment ? t('专有面积') : t('建筑面积') }} ㎡</span>
      <span class="area num">
        <input v-model="minArea" type="number" inputmode="decimal" min="0" :placeholder="t('不限')" :title="t('最小专有面积 ㎡')" :aria-label="t('最小专有面积 ㎡')" />
        <span>–</span>
        <input v-model="maxArea" type="number" inputmode="decimal" min="0" :placeholder="t('不限')" :title="t('最大专有面积 ㎡')" :aria-label="t('最大专有面积 ㎡')" />
      </span>
    </div>
    <label class="field">
      <span>{{ t('种子') }}</span>
      <input v-model.number="genOptions.seed" type="number" inputmode="numeric" class="seed num" @change="emit('generate', false)" />
    </label>
    <label class="furnish"><input v-model="sandbox.autoFurnish" type="checkbox" /><JIcon :icon="ICONS.autoFurnishToggle" class="ico-muted" />{{ t('生成户型时自动布置家具') }}</label>
  </div>
</template>

<style scoped>
.gen-form {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px 12px;
}
.field {
  display: contents;
}
.field > span:first-child {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  white-space: nowrap;
}
select,
input:not([type='checkbox']) {
  height: var(--control-h);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1;
  border-radius: var(--radius-sm);
  padding: 0 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  width: 100%;
  min-width: 0;
}
.area {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}
.area input {
  flex: 1;
  min-width: 0;
  width: 0;
}
.furnish {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--text);
  padding-top: 8px;
  border-top: 1px solid var(--border);
  min-height: 32px;
}
/* 触屏：控件加高到 44px，iOS 输入框字号 ≥16px 才不会自动放大页面 */
:root.coarse .gen-form select,
:root.coarse .gen-form input:not([type='checkbox']) {
  height: 44px;
  font-size: 16px;
}
:root.coarse .furnish input {
  width: 20px;
  height: 20px;
}
</style>
