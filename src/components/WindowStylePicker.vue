<script setup lang="ts">
// 门窗检查器里窗的款式：开法 / 形状用带 3D 预览图的格子选（同外观编辑器），窗框颜色用色块，格条也用预览格子，
// 窗台高度、外墙百叶护窗板用下拉 / 勾选。每次改动一步撤销。不选款式（「标准」）= 旧存档的样子。
import { computed, watchEffect } from 'vue'
import { t } from '../i18n'
import { WINDOW_FRAMES, WINDOW_GRIDS, WINDOW_SILLS, WINDOW_STYLES, type Opening, type WindowFrame, type WindowGrid, type WindowSill, type WindowStyle } from '../model'
import { floorPlan, mutate } from '../store'
import { openingInfos } from '../three/house'
import { useSitePreviews, type SitePreview } from '../three/siteThumbs'
import { frameColor, gridAllowed, shutterColor } from '../windows'

/** card：3D 沙盘里点中窗浮出的卡片（手机上格子排成一行横向滑） */
const props = withDefaults(defineProps<{ opening: Opening; variant?: 'panel' | 'card' }>(), { variant: 'panel' })

type StyleChoice = WindowStyle | 'std'
const STYLE_CHOICES: StyleChoice[] = ['std', ...(Object.keys(WINDOW_STYLES) as WindowStyle[])]
const FRAMES = Object.keys(WINDOW_FRAMES) as WindowFrame[]
const GRIDS = Object.keys(WINDOW_GRIDS) as WindowGrid[]
const SILLS = Object.keys(WINDOW_SILLS) as WindowSill[]

const info = computed(() => openingInfos(floorPlan.value).find((i) => i.o.id === props.opening.id) ?? null)
/** 朝阳台的落地推拉窗（「标准」= 两扇推拉的落地窗） */
const sash = computed(() => !!info.value?.sash)
const outer = computed(() => !!info.value?.outer)

/** 改一个窗字段：缺省值（undefined / 白框 / 无格条 / false）直接删掉，存档保持干净 */
function set<K extends 'windowStyle' | 'frame' | 'grid' | 'sill' | 'shutters'>(key: K, v: Opening[K] | undefined) {
  const id = props.opening.id
  mutate((p) => {
    const o = p.openings.find((x) => x.id === id)
    if (!o) return
    if (v === undefined || v === false || (key === 'frame' && v === 'white') || (key === 'grid' && v === 'none')) delete o[key]
    else o[key] = v
  })
}

const look = computed(() => ({ frame: frameColor(props.opening), grid: props.opening.grid, shutters: props.opening.shutters ? shutterColor(props.opening) : undefined }))
const modelStyle = (k: StyleChoice) => (k === 'std' ? (sash.value ? 'legacySash' : 'plain') : k)

interface Tile {
  slot: string
  label: string
  on: boolean
  preview: SitePreview
  pick: () => void
}
const styleTiles = computed<Tile[]>(() => {
  const cur = props.opening.windowStyle ?? 'std'
  return STYLE_CHOICES.map((k) => ({
    slot: `win:${k}`,
    label: k === 'std' ? '标准' : WINDOW_STYLES[k],
    on: cur === k,
    preview: { t: 'window', style: modelStyle(k), frame: look.value.frame, grid: gridAllowed(k === 'std' ? undefined : k) ? look.value.grid : undefined, shutters: look.value.shutters },
    pick: () => set('windowStyle', k === 'std' ? undefined : k),
  }))
})
const canGrid = computed(() => gridAllowed(props.opening.windowStyle))
const gridTiles = computed<Tile[]>(() => {
  if (!canGrid.value) return []
  const cur = props.opening.grid ?? 'none'
  const style = modelStyle(props.opening.windowStyle ?? 'std')
  return GRIDS.map((k) => ({
    slot: `grid:${k}`,
    label: WINDOW_GRIDS[k],
    on: cur === k,
    preview: { t: 'window', style, frame: look.value.frame, grid: k, shutters: undefined },
    pick: () => set('grid', k),
  }))
})

const { previews, want } = useSitePreviews()
watchEffect(() => {
  for (const tile of [...styleTiles.value, ...gridTiles.value]) want(tile.slot, tile.preview)
})
</script>

<template>
  <div class="win-ed" :class="`v-${variant}`">
    <span class="lbl">{{ t('窗的款式') }}</span>
    <div class="tiles" role="group" :aria-label="t('窗的款式')">
      <button v-for="tile in styleTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
        <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
        <span class="tl">{{ t(tile.label) }}</span>
      </button>
    </div>
    <span class="lbl">{{ t('窗框') }}</span>
    <div class="swatches" role="group" :aria-label="t('窗框')">
      <button
        v-for="k in FRAMES"
        :key="k"
        class="sw"
        :class="{ on: (opening.frame ?? 'white') === k }"
        :style="{ background: WINDOW_FRAMES[k].color }"
        :title="t(WINDOW_FRAMES[k].label)"
        :aria-label="t(WINDOW_FRAMES[k].label)"
        :aria-pressed="(opening.frame ?? 'white') === k"
        @click="set('frame', k)"
      />
      <span class="dim">{{ t(WINDOW_FRAMES[opening.frame ?? 'white'].label) }}</span>
    </div>
    <template v-if="canGrid">
      <span class="lbl">{{ t('格条') }}</span>
      <div class="tiles" role="group" :aria-label="t('格条')">
        <button v-for="tile in gridTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
    </template>
    <label
      >{{ t('窗台高度') }}
      <select :value="opening.sill ?? ''" @change="set('sill', (($event.target as HTMLSelectElement).value || undefined) as WindowSill | undefined)">
        <option value="">{{ sash ? t('自动（落地推拉窗）') : t('自动') }}</option>
        <option v-for="k in SILLS" :key="k" :value="k">{{ t(WINDOW_SILLS[k]) }}</option>
      </select>
    </label>
    <label class="check" :class="{ dim: !outer }" :title="outer ? undefined : t('只有外墙上的窗才有护窗板')"
      ><input type="checkbox" :checked="!!opening.shutters" @change="set('shutters', ($event.target as HTMLInputElement).checked)" />{{ t('百叶护窗板（外墙一侧）') }}</label
    >
  </div>
</template>

<style scoped>
.win-ed {
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
.sw.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.dim {
  color: var(--text-muted);
  font-size: var(--fs-xs);
  margin-left: 4px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: var(--fs-sm);
}
label.check.dim {
  color: var(--text-muted);
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
/* 浮动卡片窄：格子小一点，一行排四个，卡片别太高 */
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
