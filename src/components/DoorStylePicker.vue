<script setup lang="ts">
// 门窗检查器 / 3D 沙盘浮动卡片里门的款式：门扇样式用带 3D 预览图的格子选（同窗的款式），颜色用色块 + 自选，
// 把手、把手颜色、开门旁的侧窗 / 亮子、折れ戸的折数用下拉 / 色块。每次改动一步撤销。不选款式（「标准」）、不选颜色 = 旧存档的样子。
import { computed, watchEffect } from 'vue'
import { t } from '../i18n'
import { DOOR_COLORS, DOOR_HANDLES, DOOR_LITES, DOOR_STYLES, FOLD_LEAVES, HANDLE_FINISHES, type DoorHandle, type DoorLeafStyle, type DoorLites, type FoldLeaves, type HandleFinish, type Opening } from '../model'
import { floorPlan, mutate } from '../store'
import { openingInfos } from '../three/house'
import { useSitePreviews, type SitePreview } from '../three/siteThumbs'
import { STYLES_FOR, doorColor, doorHandleOf, handleColor, isDoorKind, type DoorKind } from '../doorStyles'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'

/** card：3D 沙盘里点中门浮出的卡片（手机上格子排成一行横向滑） */
const props = withDefaults(defineProps<{ opening: Opening; variant?: 'panel' | 'card' }>(), { variant: 'panel' })

type DoorKey = 'doorStyle' | 'doorColor' | 'doorHandle' | 'handleFinish' | 'doorLites' | 'foldLeaves'
const FINISHES = Object.keys(HANDLE_FINISHES) as HandleFinish[]
const HANDLES = Object.keys(DOOR_HANDLES) as DoorHandle[]
const LITES = Object.keys(DOOR_LITES) as DoorLites[]
const FOLDS = [2, 3, 4] as const

const kind = computed<DoorKind>(() => (isDoorKind(props.opening.kind) ? props.opening.kind : 'door'))
const info = computed(() => openingInfos(floorPlan.value).find((i) => i.o.id === props.opening.id) ?? null)
/** 入户门（玄关外墙上的开门）：不填颜色时是浅蓝 */
const entrance = computed(() => kind.value === 'door' && info.value?.owner.kind === 'entrance' && info.value.wall > 12)

/** 改一个门字段：缺省值（undefined / 不锈钢把手）直接删掉，存档保持干净 */
function set<K extends DoorKey>(key: K, v: Opening[K] | undefined) {
  const id = props.opening.id
  mutate((p) => {
    const o = p.openings.find((x) => x.id === id)
    if (!o) return
    if (v === undefined || (key === 'handleFinish' && v === 'silver')) delete o[key]
    else o[key] = v
  })
}

const color = computed(() => doorColor(props.opening, entrance.value))
const hColor = computed(() => handleColor(props.opening))

interface Tile {
  slot: string
  label: string
  on: boolean
  preview: SitePreview
  pick: () => void
}
const styleTiles = computed<Tile[]>(() => {
  const o = props.opening
  const cur = o.doorStyle ?? 'std'
  const choices: (DoorLeafStyle | 'std')[] = ['std', ...STYLES_FOR[kind.value]]
  // 当前款式不在这种门的列表里（比如从推拉门改成开门）：也列出来，免得选中的格子看不见
  if (o.doorStyle && !choices.includes(o.doorStyle)) choices.push(o.doorStyle)
  return choices.map((k) => {
    const style = k === 'std' ? undefined : k
    const look = { kind: kind.value, doorStyle: style, doorColor: o.doorColor, doorHandle: o.doorHandle }
    return {
      slot: `door:${kind.value}:${k}`,
      label: k === 'std' ? '标准' : DOOR_STYLES[k],
      on: cur === k,
      preview: { t: 'door', kind: kind.value, style, color: doorColor(look, entrance.value), handle: doorHandleOf(look), handleColor: hColor.value, lites: kind.value === 'door' ? o.doorLites : undefined },
      pick: () => set('doorStyle', style),
    }
  })
})

const { previews, want } = useSitePreviews()
watchEffect(() => {
  for (const tile of styleTiles.value) want(tile.slot, tile.preview)
})

const val = (e: Event) => (e.target as HTMLInputElement).value
</script>

<template>
  <div class="door-ed" :class="`v-${variant}`">
    <span class="lbl">{{ t('门的款式') }}</span>
    <div class="tiles" role="group" :aria-label="t('门的款式')">
      <button v-for="tile in styleTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
        <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
        <span class="tl">{{ t(tile.label) }}</span>
      </button>
    </div>
    <span class="lbl">{{ t('门的颜色') }}</span>
    <div class="swatches" role="group" :aria-label="t('门的颜色')">
      <button
        v-for="c in DOOR_COLORS"
        :key="c.color"
        class="sw"
        :class="{ on: opening.doorColor === c.color }"
        :style="{ background: c.color }"
        :title="t(c.label)"
        :aria-label="t(c.label)"
        :aria-pressed="opening.doorColor === c.color"
        @click="set('doorColor', c.color)"
      />
      <label class="sw pick" :class="{ on: !!opening.doorColor && !DOOR_COLORS.some((c) => c.color === opening.doorColor) }" :title="t('自选颜色')"
        ><input type="color" :value="color" :aria-label="t('门的颜色')" @change="set('doorColor', val($event).toLowerCase())"
      /></label>
      <button class="mini reset" :disabled="!opening.doorColor" :title="t('回到这款的默认颜色')" @click="set('doorColor', undefined)"><JIcon :icon="ICONS.wallpaperDefault" :size="14" />{{ t('默认') }}</button>
    </div>
    <div class="row2">
      <label
        >{{ t('把手') }}
        <select :value="opening.doorHandle ?? ''" @change="set('doorHandle', (($event.target as HTMLSelectElement).value || undefined) as DoorHandle | undefined)">
          <option value="">{{ t('自动') }}（{{ t(DOOR_HANDLES[doorHandleOf({ kind, doorStyle: opening.doorStyle })]) }}）</option>
          <option v-for="k in HANDLES" :key="k" :value="k">{{ t(DOOR_HANDLES[k]) }}</option>
        </select>
      </label>
      <div class="fin">
        <span class="lbl">{{ t('把手颜色') }}</span>
        <div class="swatches" role="group" :aria-label="t('把手颜色')">
          <button
            v-for="k in FINISHES"
            :key="k"
            class="sw"
            :class="{ on: (opening.handleFinish ?? 'silver') === k }"
            :style="{ background: HANDLE_FINISHES[k].color }"
            :title="t(HANDLE_FINISHES[k].label)"
            :aria-label="t(HANDLE_FINISHES[k].label)"
            :aria-pressed="(opening.handleFinish ?? 'silver') === k"
            @click="set('handleFinish', k)"
          />
        </div>
      </div>
    </div>
    <label v-if="kind === 'door'"
      >{{ t('侧窗 / 亮子') }}
      <select :value="opening.doorLites ?? ''" @change="set('doorLites', (($event.target as HTMLSelectElement).value || undefined) as DoorLites | undefined)">
        <option value="">{{ t('无') }}</option>
        <option v-for="k in LITES" :key="k" :value="k">{{ t(DOOR_LITES[k]) }}</option>
      </select>
    </label>
    <label v-if="kind === 'folding'"
      >{{ t('折数') }}
      <select :value="opening.foldLeaves ?? 2" @change="set('foldLeaves', (Number(($event.target as HTMLSelectElement).value) === 2 ? undefined : Number(($event.target as HTMLSelectElement).value)) as FoldLeaves | undefined)">
        <option v-for="k in FOLDS" :key="k" :value="k">{{ t(FOLD_LEAVES[k]) }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.door-ed {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--fs-sm);
}
.lbl {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
}
.tile {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  height: auto;
  padding: 3px 3px 4px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  cursor: pointer;
}
.tile:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.tile.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  background: var(--accent-weak);
  color: var(--text);
}
.tile:focus-visible {
  outline: 2px solid var(--accent-ring);
  outline-offset: 1px;
}
.pv {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  background: var(--hover);
  overflow: hidden;
}
.pv img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tl {
  line-height: 1.25;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.sw {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
}
:root.coarse .sw {
  width: 26px;
  height: 26px;
}
.sw.on {
  box-shadow: 0 0 0 2px var(--accent);
}
/* 自选颜色：彩色小方块，盖一个透明的取色器 */
.pick {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: conic-gradient(#e66 0 25%, #6c6 0 50%, #69e 0 75%, #ec6 0);
}
.pick input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.reset {
  height: var(--control-h-sm);
  padding: 0 8px;
  font-size: var(--fs-xs);
  gap: 4px;
  margin-left: 2px;
}
.row2 {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.row2 > label {
  flex: 1;
  min-width: 0;
}
.fin {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
select {
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  height: var(--control-h);
  padding: 0 8px;
  width: 100%;
}
/* 浮动卡片窄：格子小一点，卡片别太高 */
.v-card .tiles {
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
}
:root.compact .v-card .tiles {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  margin: 0 -2px;
  padding: 0 2px 2px;
}
:root.compact .v-card .tile {
  flex: 0 0 72px;
  scroll-snap-align: start;
}
:root.coarse .tile {
  min-height: 44px;
}
</style>
