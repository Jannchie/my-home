<script setup lang="ts">
// 选中一面墙时的编辑内容（平面图检查器、3D 沙盘的浮动卡片共用）：这面墙的墙纸（缺省跟随房间）、墙顶内收柱（梁）的长 / 深 / 高 / 位置。
// 每次改动一步撤销（store.setWallFace）。
import { computed } from 'vue'
import { edgeInfo, roomWallpaper, type Room, type WallBeam, type Wallpaper } from '../model'
import { plan, setWallFace } from '../store'
import { BEAM_MAX_H, BEAM_MIN, clampBeam, newBeam, wallFace } from '../wallFace'
import { patternWallpaper, WP_COLORS, WP_PATTERNS } from '../wallpaper'
import { patternPreview } from '../three/fabric'
import { t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'

const props = defineProps<{ room: Room; edge: number }>()

const L = computed(() => edgeInfo(props.room.points, props.edge).length)
const face = computed(() => wallFace(props.room, props.edge))
/** 这面墙现在实际的墙纸（没设自己的就是房间 / 全屋的） */
const curWp = computed(() => face.value?.wallpaper ?? roomWallpaper(plan.value, props.room))
const own = computed(() => !!face.value?.wallpaper)
const beam = computed(() => face.value?.beam)

function setWp(wp: Wallpaper | undefined) {
  setWallFace(props.room.id, props.edge, { wallpaper: wp })
}
/** 边饰跟着现在的墙纸走（换颜色 / 花纹不丢边饰） */
const pickColor = (c: string) => setWp({ color: c, trim: curWp.value?.trim })
const pickPattern = (k: (typeof WP_PATTERNS)[number]) => setWp(patternWallpaper(k, curWp.value?.color ?? '#fbf7f1', curWp.value?.trim))
/** 花纹缩略图：只跟底色变 */
const patternThumbs = computed(() => {
  const base = curWp.value?.color ?? '#fbf7f1'
  return WP_PATTERNS.map((k) => ({ k, src: patternPreview(patternWallpaper(k, base).pattern!, 32) }))
})

function setBeam(b: WallBeam | undefined) {
  setWallFace(props.room.id, props.edge, { beam: b && clampBeam(b, L.value) })
}
function patchBeam<K extends keyof WallBeam>(k: K, v: WallBeam[K]) {
  // 改长度时中心不动（clampBeam 再把整根夹回墙内）
  if (beam.value && Number.isFinite(v)) setBeam({ ...beam.value, [k]: v })
}
/** 新加的梁缺省占满整面墙 */
const addBeam = () => setBeam(newBeam(L.value))
const num = (e: Event) => Number((e.target as HTMLInputElement).value)
</script>

<template>
  <div class="wall-ed">
    <div class="row">
      <span class="k">{{ t('墙长') }}</span>
      <span class="num">{{ Math.round(L) }} cm</span>
    </div>

    <div class="sub ico-label">
      <JIcon :icon="ICONS.wallpaper" :size="14" />{{ t('墙纸') }}
      <span class="spacer" />
      <button class="mini" :disabled="!own" :title="t('去掉这面墙自己的墙纸，跟随房间')" @click="setWp(undefined)"><JIcon :icon="ICONS.wallpaperDefault" :size="14" />{{ t('跟随房间') }}</button>
    </div>
    <div class="sw-row">
      <button v-for="c in WP_COLORS" :key="c" class="sw" :class="{ on: own && curWp?.color === c && !curWp?.pattern }" :style="{ background: c }" :title="c" @click="pickColor(c)" />
    </div>
    <div class="sw-row">
      <button v-for="p in patternThumbs" :key="p.k" class="pat" :class="{ on: own && curWp?.pattern?.kind === p.k }" :title="p.k" @click="pickPattern(p.k)">
        <img :src="p.src" alt="" />
      </button>
    </div>

    <div class="sub">
      {{ t('内收柱') }}
      <span class="spacer" />
      <button v-if="beam" class="mini" @click="setBeam(undefined)"><JIcon :icon="ICONS.delete" :size="14" />{{ t('去掉内收柱') }}</button>
      <button v-else class="mini" :title="t('沿墙顶部横着走的梁：从天花往下垂、往室内突出')" @click="addBeam"><JIcon :icon="ICONS.stepUp" :size="14" />{{ t('加内收柱') }}</button>
    </div>
    <template v-if="beam">
      <div class="grid">
        <label>{{ t('高 cm') }}<input type="number" :min="BEAM_MIN" :max="BEAM_MAX_H" step="5" :value="beam.h" :title="t('从天花往下垂的高度')" @change="patchBeam('h', num($event))" /></label>
        <label>{{ t('深 cm') }}<input type="number" :min="BEAM_MIN" step="5" :value="beam.d" :title="t('从墙面往室内突出的深度')" @change="patchBeam('d', num($event))" /></label>
      </div>
      <div class="grid">
        <label>{{ t('长 cm') }}<input type="number" :min="BEAM_MIN" :max="Math.floor(L)" step="5" :value="beam.w" :title="t('沿墙方向的长度')" @change="patchBeam('w', num($event))" /></label>
        <label
          >{{ t('位置 cm') }}<input
            type="number"
            step="5"
            :min="beam.w / 2"
            :max="Math.floor(L - beam.w / 2)"
            :value="Math.round(beam.offset)"
            :title="t('内收柱中心到这面墙起点的距离')"
            @change="patchBeam('offset', num($event))"
        /></label>
      </div>
      <div class="acts">
        <button :disabled="beam.w >= Math.floor(L)" @click="setBeam({ ...beam, w: L, offset: L / 2 })">{{ t('整面墙') }}</button>
        <button @click="patchBeam('offset', 0)">{{ t('靠起点') }}</button>
        <button @click="patchBeam('offset', L)">{{ t('靠终点') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wall-ed {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: var(--fs-sm);
}
.row,
.sub {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub {
  margin-top: 4px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
}
.spacer {
  flex: 1;
}
.k {
  min-width: 4.5em;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.sw-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sw,
.pat {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  overflow: hidden;
}
.pat img {
  width: 100%;
  height: 100%;
  display: block;
}
.sw.on,
.pat.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.grid label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.grid input {
  width: 100%;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.acts {
  display: flex;
  gap: 6px;
}
.acts button {
  flex: 1;
}
</style>
