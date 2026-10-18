<script setup lang="ts">
// 户建外观的一个编辑对象（围挡 / 车位上的车 / 屋顶 / 外墙）的编辑器：款式用带 3D 预览图的格子选，颜色用色块，尺寸用滑杆。
// 3D 沙盘里点中对象时浮出的卡片、侧栏「外观」页展开的一项都用它（逻辑只有这一份）。
// 每次改动一步撤销；滑杆一次拖动一步（siteEdit.ts liveEdit）。
import { computed, watchEffect } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { t } from '../i18n'
import { FACADE_KINDS, FENCE_HEIGHT_MAX, FENCE_HEIGHT_MIN, FENCE_KINDS, PORCH_KINDS, ROOF_KINDS } from '../model'
import { checkpoint, plan, setExterior, setParking, setSite, settle } from '../store'
import { fenceLook } from '../three/exterior'
import { useSitePreviews, type SitePreview } from '../three/siteThumbs'
import { ICONS } from '../ui/icons'
import {
  CAR_CHOICES,
  CAR_COLORS,
  CAR_DEFAULT_COLOR,
  FACADE_CHOICES,
  FENCE_CHOICES,
  FENCE_COLORS,
  PORCH_CHOICES,
  ROOF_CHOICES,
  ROOF_COLORS,
  TRIM_COLORS,
  WALL_COLORS,
  carChoice,
  carLabel,
  coverChoice,
  coverChoices,
  coverLabel,
  carPatch,
  liveEdit,
  parkingIndex,
  type CarChoice,
  type SiteTarget,
} from '../siteEdit'

const props = withDefaults(defineProps<{ target: SiteTarget; variant?: 'card' | 'panel' }>(), { variant: 'panel' })

interface Tile {
  /** 预览格子的编号（同一编辑器里唯一） */
  slot: string
  label: string
  on: boolean
  /** null：「不要」这一项，显示图标 */
  preview: SitePreview | null
  pick: () => void
}

const site = computed(() => plan.value.site)
const ex = computed(() => plan.value.exterior)
const spotIndex = computed(() => parkingIndex(props.target))
const spot = computed(() => (spotIndex.value === null ? undefined : site.value?.parking[spotIndex.value]))
const look = computed(() => (site.value ? fenceLook(site.value) : null))
/** 坡度（升高 / 水平）→ 角度 */
const pitchDeg = computed(() => Math.round((Math.atan(ex.value?.pitch ?? 0.45) * 180) / Math.PI))

const live = liveEdit(checkpoint, settle)
const num = (e: Event) => +(e.target as HTMLInputElement).value
const val = (e: Event) => (e.target as HTMLInputElement).value

const fenceTiles = computed<Tile[]>(() => {
  const s = site.value
  if (!s) return []
  return FENCE_CHOICES.map((k) => ({
    slot: `fence:${k}`,
    label: FENCE_KINDS[k],
    on: s.fence === k,
    preview: k === 'none' ? null : { t: 'fence', kind: k, color: s.fenceColor, height: s.fenceHeight },
    pick: () => setSite({ fence: k }),
  }))
})
const carTiles = computed<Tile[]>(() => {
  const sp = spot.value
  const i = spotIndex.value
  if (!sp || i === null) return []
  const cur = carChoice(sp)
  return CAR_CHOICES.map((k: CarChoice) => ({
    slot: `car:${k}`,
    label: carLabel(k),
    on: cur === k,
    preview: k === 'none' ? null : { t: 'car', kind: k, color: sp.carColor ?? CAR_DEFAULT_COLOR },
    pick: () => setParking(i, carPatch(k, sp)),
  }))
})
const roofTiles = computed<Tile[]>(() => {
  const e = ex.value
  if (!e) return []
  return ROOF_CHOICES.map((k) => ({ slot: `roof:${k}`, label: ROOF_KINDS[k], on: e.roof === k, preview: { t: 'house', focus: 'roof', ex: { ...e, roof: k } }, pick: () => setExterior({ roof: k }) }))
})
const coverTiles = computed<Tile[]>(() => {
  const e = ex.value
  if (!e) return []
  const cur = coverChoice(e)
  return coverChoices(e.roof).map((k) => ({
    slot: `cover:${k}`,
    label: coverLabel(k),
    on: cur === k,
    preview: { t: 'house', focus: 'cover', ex: { ...e, roofCover: k === 'plain' ? undefined : k } },
    pick: () => setExterior({ roofCover: k === 'plain' ? undefined : k }),
  }))
})
const facadeTiles = computed<Tile[]>(() => {
  const e = ex.value
  if (!e) return []
  return FACADE_CHOICES.map((k) => ({ slot: `facade:${k}`, label: FACADE_KINDS[k], on: e.facade === k, preview: { t: 'house', focus: 'facade', ex: { ...e, facade: k } }, pick: () => setExterior({ facade: k }) }))
})
const porchTiles = computed<Tile[]>(() => {
  const e = ex.value
  if (!e) return []
  const cur = e.porch ?? 'canopy'
  return PORCH_CHOICES.map((k) => ({
    slot: `porch:${k}`,
    label: PORCH_KINDS[k],
    on: cur === k,
    preview: { t: 'house', focus: 'entrance', ex: { ...e, porch: k } },
    pick: () => setExterior({ porch: k === 'canopy' ? undefined : k }),
  }))
})

/** 这个编辑器里出现的全部格子（排队渲染预览图） */
const tiles = computed(() => {
  if (props.target === 'fence') return fenceTiles.value
  if (props.target === 'roof') return [...roofTiles.value, ...coverTiles.value]
  if (props.target === 'facade') return [...facadeTiles.value, ...porchTiles.value]
  return carTiles.value
})
const { previews, want } = useSitePreviews()
watchEffect(() => {
  for (const tile of tiles.value) if (tile.preview) want(tile.slot, tile.preview)
})
</script>

<template>
  <div class="site-ed" :class="`v-${variant}`">
    <!-- 围挡 -->
    <template v-if="target === 'fence' && site">
      <div class="tiles" role="group" :aria-label="t('围挡')">
        <button v-for="tile in fenceTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv">
            <img v-if="tile.preview && previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" />
            <JIcon v-else-if="!tile.preview" :icon="ICONS.extNone" :size="20" class="ico-muted" />
          </span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
      <template v-if="look">
        <div class="ed-row">
          <span class="ed-label">{{ t('颜色') }}</span>
          <div class="swatches" role="group" :aria-label="t('围挡颜色')">
            <button v-for="c in FENCE_COLORS" :key="c" class="sw" :class="{ on: look.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="look.color === c" @click="setSite({ fenceColor: c })" />
            <label class="sw pick" :title="t('自选颜色')"><input type="color" :value="look.color" :aria-label="t('围挡颜色')" @change="setSite({ fenceColor: val($event) })" /></label>
          </div>
        </div>
        <label class="ed-row">
          <span class="ed-label">{{ t('高度') }}</span>
          <input type="range" :min="FENCE_HEIGHT_MIN" :max="FENCE_HEIGHT_MAX" step="5" :value="look.height" @pointerdown="live.begin()" @input="live.begin(); setSite({ fenceHeight: num($event) }, false)" @change="live.end()" @blur="live.end()" />
          <span class="num val">{{ look.height }} cm</span>
        </label>
        <button class="mini reset" :disabled="!site.fenceColor && site.fenceHeight === undefined" :title="t('颜色、高度回到这款的默认值')" @click="setSite({ fenceColor: undefined, fenceHeight: undefined })"><JIcon :icon="ICONS.wallpaperDefault" :size="14" />{{ t('默认') }}</button>
      </template>
    </template>

    <!-- 车位上的车 -->
    <template v-else-if="spot && spotIndex !== null">
      <div class="tiles" role="group" :aria-label="t('车型')">
        <button v-for="tile in carTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv">
            <img v-if="tile.preview && previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" />
            <JIcon v-else-if="!tile.preview" :icon="ICONS.extNone" :size="20" class="ico-muted" />
          </span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
      <div v-if="spot.car" class="ed-row">
        <span class="ed-label">{{ t('颜色') }}</span>
        <div class="swatches" role="group" :aria-label="t('车身颜色')">
          <button v-for="c in CAR_COLORS" :key="c" class="sw" :class="{ on: (spot.carColor ?? CAR_DEFAULT_COLOR) === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="(spot.carColor ?? CAR_DEFAULT_COLOR) === c" @click="setParking(spotIndex, { carColor: c })" />
          <label class="sw pick" :title="t('自选颜色')"><input type="color" :value="spot.carColor ?? CAR_DEFAULT_COLOR" :aria-label="t('车身颜色')" @change="setParking(spotIndex, { carColor: val($event) })" /></label>
        </div>
      </div>
    </template>

    <!-- 屋顶 -->
    <template v-else-if="target === 'roof' && ex">
      <div class="tiles" role="group" :aria-label="t('屋顶')">
        <button v-for="tile in roofTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
      <div class="ed-sub">{{ t('屋面材料') }}</div>
      <div class="tiles" role="group" :aria-label="t('屋面材料')">
        <button v-for="tile in coverTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
      <div class="ed-row">
        <span class="ed-label">{{ t('颜色') }}</span>
        <div class="swatches" role="group" :aria-label="t('屋顶颜色')">
          <button v-for="c in ROOF_COLORS" :key="c" class="sw" :class="{ on: ex.roofColor === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="ex.roofColor === c" @click="setExterior({ roofColor: c })" />
          <label class="sw pick" :title="t('自选颜色')"><input type="color" :value="ex.roofColor" :aria-label="t('屋顶颜色')" @change="setExterior({ roofColor: val($event) })" /></label>
        </div>
      </div>
      <template v-if="ex.roof !== 'flat'">
        <label class="ed-row">
          <span class="ed-label">{{ t('坡度') }}</span>
          <input type="range" min="0.1" max="1.2" step="0.05" :value="ex.pitch ?? 0.45" @pointerdown="live.begin()" @input="live.begin(); setExterior({ pitch: num($event) }, false)" @change="live.end()" @blur="live.end()" />
          <span class="num val">{{ pitchDeg }}°</span>
        </label>
        <label class="ed-row">
          <span class="ed-label">{{ t('屋檐出挑') }}</span>
          <input type="range" min="0" max="120" step="5" :value="ex.eave ?? 45" @pointerdown="live.begin()" @input="live.begin(); setExterior({ eave: num($event) }, false)" @change="live.end()" @blur="live.end()" />
          <span class="num val">{{ ex.eave ?? 45 }} cm</span>
        </label>
      </template>
    </template>

    <!-- 外墙 + 入口 -->
    <template v-else-if="target === 'facade' && ex">
      <div class="tiles" role="group" :aria-label="t('外墙')">
        <button v-for="tile in facadeTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
      <div class="ed-row">
        <span class="ed-label">{{ t('颜色') }}</span>
        <div class="swatches" role="group" :aria-label="t('外墙颜色')">
          <button v-for="c in WALL_COLORS" :key="c" class="sw" :class="{ on: ex.wallColor === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="ex.wallColor === c" @click="setExterior({ wallColor: c })" />
          <label class="sw pick" :title="t('自选颜色')"><input type="color" :value="ex.wallColor" :aria-label="t('外墙颜色')" @change="setExterior({ wallColor: val($event) })" /></label>
        </div>
      </div>
      <div class="ed-row">
        <span class="ed-label" :title="t('窗套、门框点缀色')">{{ t('点缀色') }}</span>
        <div class="swatches" role="group" :aria-label="t('窗套、门框点缀色')">
          <button v-for="c in TRIM_COLORS" :key="c" class="sw" :class="{ on: ex.trimColor === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="ex.trimColor === c" @click="setExterior({ trimColor: c })" />
          <label class="sw pick" :title="t('自选颜色')"><input type="color" :value="ex.trimColor" :aria-label="t('窗套、门框点缀色')" @change="setExterior({ trimColor: val($event) })" /></label>
        </div>
      </div>
      <div class="ed-sub">{{ t('入口') }}</div>
      <div class="tiles" role="group" :aria-label="t('入口')">
        <button v-for="tile in porchTiles" :key="tile.slot" class="tile" :class="{ on: tile.on }" :aria-pressed="tile.on" :title="t(tile.label)" @click="tile.pick()">
          <span class="pv"><img v-if="previews[tile.slot]" :src="previews[tile.slot]" alt="" draggable="false" /></span>
          <span class="tl">{{ t(tile.label) }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.site-ed {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: var(--fs-sm);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 6px;
}
/* 手机上的浮动卡片：格子排成一行横向滑，卡片别太高挡住画面 */
:root.compact .v-card .tiles {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: 2px;
  margin: 0 -2px;
  padding-inline: 2px;
}
:root.compact .v-card .tile {
  flex: 0 0 80px;
  scroll-snap-align: start;
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
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  background: var(--hover);
  overflow: hidden;
}
/* 绝对定位铺满：网格里的百分比高度会退回图片本身的 256px，cover 就横向裁掉了 */
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
.ed-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ed-row input[type='range'] {
  flex: 1;
  min-width: 0;
}
.ed-label {
  flex: 0 0 auto;
  min-width: 3.5em;
  color: var(--text-muted);
}
.ed-sub {
  margin-top: 4px;
  color: var(--text-muted);
}
.val {
  min-width: 3.6em;
  text-align: right;
}
.swatches {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.sw {
  width: 21px;
  height: 21px;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
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
  align-self: flex-start;
  height: var(--control-h-sm);
  padding: 0 10px;
  font-size: var(--fs-xs);
  gap: 4px;
}
</style>
