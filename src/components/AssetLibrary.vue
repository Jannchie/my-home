<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ASSETS, ASSET_MAP, CATEGORY_LABELS, STYLE_LABELS, type AssetCategory, type StyleTag } from '../three/assets'
import { SIZE_LABELS, browse, cardName, categoriesOf, countByCategory, displayName, paletteFor, paletteStyle, siblings, sizeClass, typesIn, variantLabel, type Filter, type SizeClass } from '../three/catalog'
import { typeLabel } from '../three/typeLabels'
import { disposeUnshared } from '../three/toon'
import { furnitureModel } from '../three/house'
import { createStage, fitSun, frameCamera, type Stage } from '../three/stage'
import { useThumbs } from '../three/thumbs'
import { FxLayer } from '../three/fx'
import type { PatternSpec } from '../three/patterns'
import ColorEditor from './ColorEditor.vue'
import BottomSheet, { type SheetSnap } from './BottomSheet.vue'
import { device, lowPower } from '../ui/device'
import { useProgressive } from '../ui/progressive'
import { JIcon } from '@jannchie/icons-vue'
import { CATEGORY_ICONS, ICONS, STYLE_ICONS } from '../ui/icons'
import { placing, selection, viewMode } from '../store'
import { lang, t } from '../i18n'
import { routeAsset } from '../router'

const filter = reactive<Filter>({ category: 'all', type: 'all', style: 'all', size: 'all', query: '', fixtures: true })
// 细分类型：换分类时回到「全部」；只在选了某个分类时列出（全部分类下类型太多）
watch(
  () => filter.category,
  () => (filter.type = 'all'),
)
const types = computed(() => (filter.category === 'all' ? [] : typesIn(filter)))
const categories = categoriesOf(true)
const styleKeys = Object.keys(STYLE_LABELS) as StyleTag[]
const sizeKeys = Object.keys(SIZE_LABELS) as SizeClass[]
const list = computed(() => browse(filter))
// 1500+ 张卡片按滚动逐批挂载（每批 60 张），筛选变化时回到第一批
const { shown, more, vSentinel } = useProgressive(() => list.value, 60)
/** 手机：详情是底部抽屉（收起时只露出名字和「放进 3D 沙盘」） */
const sheet = ref<SheetSnap>('peek')
// 各分类的数量：一次算完缓存起来（以前模板里每个分类按钮每次重渲染都跑一遍 browse）
const counts = computed(() => countByCategory(filter))
const countOf = (c: AssetCategory) => counts.value.m.get(c) ?? 0
const total = computed(() => counts.value.all)

// 地址里带了素材 id（/en/library/sofa-3p）就打开它；选中的素材写回地址（router.ts）
const selectedId = ref(routeAsset.value && ASSET_MAP.has(routeAsset.value) ? routeAsset.value : ASSETS[0].id)
const color = ref(0)
const def = computed(() => ASSET_MAP.get(selectedId.value)!)
const sizes = computed(() => siblings(def.value))

/** 自定义配色（放进沙盘时一起带过去） */
const customColors = ref<string[] | undefined>()
const customPatterns = ref<(PatternSpec | null)[] | undefined>()

function select(id: string) {
  customColors.value = undefined
  customPatterns.value = undefined
  selectedId.value = id
  color.value = paletteFor(ASSET_MAP.get(id)!, filter.style)
}
watch(selectedId, (id) => (routeAsset.value = id))
watch(routeAsset, (id) => id && id !== selectedId.value && ASSET_MAP.has(id) && select(id))
/** 换规格：保留当前配色（新规格配色数不够时取同风格的） */
function pickSize(id: string) {
  const st = paletteStyle(def.value, color.value)
  selectedId.value = id
  const d = ASSET_MAP.get(id)!
  if (color.value >= d.palettes.length || paletteStyle(d, color.value) !== st) color.value = paletteFor(d, st)
}


// ---------- 缩略图：卡片用当前风格的配色 ----------

// 缩略图只渲染滚到可见处的卡片（v-thumb）
const { thumbs, want, vThumb } = useThumbs()
// 抽屉标题栏的小图：选中的素材按当前配色要一张缩略图
watch([selectedId, color], () => device.compact && want(selectedId.value, color.value), { immediate: true })
const cardColor = (id: string) => paletteFor(ASSET_MAP.get(id)!, filter.style)

// ---------- 大预览：自动旋转 ----------

const host = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
let stage: Stage
let controls: OrbitControls
let current: THREE.Object3D | null = null
const fx = new FxLayer()
let last = performance.now()
let raf = 0
let ro: ResizeObserver | null = null
const spin = ref(true)

function showPreview() {
  if (!stage) return
  if (current) {
    stage.scene.remove(current)
    // 合并出来的几何体每次新建：换模型时释放，免得来回翻素材时显存一直涨
    disposeUnshared(current)
  }
  const d = def.value
  // 和沙盘里的家具同一个出口（house.ts furnitureModel）：合并同材质零件 → 描边 → 套花纹，走同一套模板缓存。
  // 近景版（closeUp）小零件也投影、描边，和沙盘的远景版是两份模板
  current = furnitureModel({ id: 'preview', asset: d.id, x: 0, y: 0, rot: 0, color: color.value, colors: customColors.value, patterns: customPatterns.value }, { closeUp: true })
  stage.scene.add(current)
  fx.set('preview', current, d.fx)
  stage.renderer.shadowMap.needsUpdate = true
  dirty = true
  const box = new THREE.Box3().setFromObject(current)
  fitSun(stage.sun, box)
  const c = frameCamera(stage.camera, box, new THREE.Vector3(0.8, 0.55, 1).normalize(), 1.05)
  controls.target.copy(c)
  controls.minDistance = box.getSize(new THREE.Vector3()).length() * 0.5
  controls.maxDistance = box.getSize(new THREE.Vector3()).length() * 5
  controls.update()
}

/** 预览需要重画（换素材、改尺寸）；转动视角和粒子另算 */
let dirty = true
function loop() {
  raf = requestAnimationFrame(loop)
  // 手机上详情抽屉收起时预览看不见：不转、不画；切到后台时 rAF 本身会停
  if (device.compact && sheet.value === 'peek') return
  controls.autoRotate = spin.value
  const moved = controls.update()
  const now = performance.now()
  const anim = fx.update(Math.min(0.1, (now - last) / 1000), stage.renderer.domElement.height)
  last = now
  // 静止时不重画；阴影只在换模型时重画（转的是镜头，投影不变）
  if (moved || anim || dirty) {
    stage.render()
    dirty = false
  }
}

onMounted(() => {
  stage = createStage(canvas.value!, { low: lowPower() })
  stage.renderer.shadowMap.autoUpdate = false
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.14 }))
  ground.receiveShadow = true
  stage.scene.add(ground, fx.group)
  controls = new OrbitControls(stage.camera, canvas.value!)
  controls.enableDamping = true
  controls.autoRotateSpeed = 1.6
  controls.maxPolarAngle = Math.PI * 0.49
  const r = host.value!.getBoundingClientRect()
  stage.resize(r.width, r.height)
  ro = new ResizeObserver(([e]) => {
    stage.resize(e.contentRect.width, e.contentRect.height)
    dirty = true
  })
  ro.observe(host.value!)
  showPreview()
  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  cancelAnimationFrame(previewRaf)
  if (current) disposeUnshared(current)
  ro?.disconnect()
  controls.dispose()
  stage.dispose()
})

// 取色器拖动时 @preview 一帧可能来好几次：合并到下一帧只重建一次
let previewRaf = 0
function schedulePreview() {
  if (previewRaf) return
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0
    showPreview()
  })
}
watch([selectedId, color, customColors, customPatterns], schedulePreview)

function placeInSandbox() {
  selection.value = null
  placing.value = { asset: def.value.id, color: color.value, colors: customColors.value, patterns: customPatterns.value }
  viewMode.value = '3d'
}

/** 双击卡片：直接放进沙盘（设备类只能在平面图里放，双击只选中） */
function quickPlace(id: string) {
  select(id)
  if (!ASSET_MAP.get(id)?.fixture) placeInSandbox()
}

const dims = (d: { w: number; d: number; h: number }) => `${d.w}×${d.d}×${d.h}`

// ---------- 搜索：按 / 聚焦，Esc 清空；没有结果时一键清除筛选 ----------
const searchInput = ref<HTMLInputElement>()
const filtered = computed(() => !!filter.query || filter.category !== 'all' || filter.type !== 'all' || filter.style !== 'all' || filter.size !== 'all')
function clearFilters() {
  Object.assign(filter, { category: 'all', type: 'all', style: 'all', size: 'all', query: '' })
}
function onSlash(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (e.key !== '/' || e.ctrlKey || e.metaKey || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return
  e.preventDefault()
  searchInput.value?.focus()
  searchInput.value?.select()
}
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    filter.query = ''
    ;(e.target as HTMLInputElement).blur()
  }
}
onMounted(() => window.addEventListener('keydown', onSlash))
onBeforeUnmount(() => window.removeEventListener('keydown', onSlash))
</script>

<template>
  <div class="lib">
    <nav class="cats">
      <label class="search-box">
        <JIcon :icon="ICONS.search" :size="14" class="ico-muted" />
        <input ref="searchInput" v-model="filter.query" class="search" :placeholder="t('搜索名称 / 规格…')" :aria-label="t('搜索名称 / 规格…')" @keydown="onSearchKey" />
        <kbd v-if="!filter.query" class="slash" :title="t('按 / 搜索')">/</kbd>
      </label>
      <button :class="{ on: filter.category === 'all' }" @click="filter.category = 'all'">
        <JIcon :icon="ICONS.allCategories" /><span class="cat-name">{{ t('全部') }}</span><span class="num">{{ total }}</span>
      </button>
      <button v-for="c in categories" :key="c" :class="{ on: filter.category === c }" :title="t(CATEGORY_LABELS[c])" @click="filter.category = c">
        <JIcon :icon="CATEGORY_ICONS[c]" /><span class="cat-name">{{ t(CATEGORY_LABELS[c]) }}</span><span class="num">{{ countOf(c) }}</span>
      </button>
    </nav>

    <div class="main">
      <div class="filters">
        <div v-if="types.length > 1" class="chips">
          <span class="label">{{ t('类型') }}</span>
          <button :class="{ on: filter.type === 'all' }" @click="filter.type = 'all'">{{ t('全部') }}</button>
          <button v-for="x in types" :key="x.type" :class="{ on: filter.type === x.type }" @click="filter.type = x.type">
            {{ t(typeLabel(x.type)) }}<span class="num">{{ x.n }}</span>
          </button>
        </div>
        <div class="chips">
          <span class="label">{{ t('风格') }}</span>
          <button :class="{ on: filter.style === 'all' }" @click="filter.style = 'all'">{{ t('全部') }}</button>
          <button v-for="s in styleKeys" :key="s" :class="['style-' + s, { on: filter.style === s }]" @click="filter.style = s"><JIcon :icon="STYLE_ICONS[s]" :size="14" />{{ t(STYLE_LABELS[s]) }}</button>
        </div>
        <div class="chips">
          <span class="label">{{ t('尺寸') }}</span>
          <button :class="{ on: filter.size === 'all' }" @click="filter.size = 'all'">{{ t('全部') }}</button>
          <button v-for="s in sizeKeys" :key="s" :class="{ on: filter.size === s }" @click="filter.size = s">{{ t(SIZE_LABELS[s]) }}</button>
        </div>
      </div>
      <div class="grid">
        <button
          v-for="g in shown"
          :key="g.rep.id"
          v-memo="[g, thumbs[`${g.rep.id}#${cardColor(g.rep.id)}`], g.rep.id === selectedId || g.rep.series === def.series, lang]"
          v-thumb="[g.rep.id, cardColor(g.rep.id)]"
          class="card"
          :class="{ on: g.rep.id === selectedId || g.rep.series === def.series }"
          :title="g.rep.fixture ? undefined : t('双击放进 3D 沙盘')"
          @click="select(g.rep.id)"
          @dblclick="quickPlace(g.rep.id)">
          <img v-if="thumbs[`${g.rep.id}#${cardColor(g.rep.id)}`]" :src="thumbs[`${g.rep.id}#${cardColor(g.rep.id)}`]" alt="" />
          <span v-else class="ph" />
          <span class="name" :title="cardName(g.rep)">{{ cardName(g.rep) }}</span>
          <span class="size num">{{ g.sizes > 1 ? t('{n} 种规格', { n: g.sizes }) : dims(g.rep) }}</span>
          <span v-if="g.rep.prop" class="badge">{{ t('摆件') }}</span>
          <span v-else-if="g.rep.surface" class="badge">{{ t('可摆放') }}</span>
        </button>
        <div v-if="!list.length" class="none">
          {{ t('没有匹配的素材') }}
          <button v-if="filtered" class="clear" @click="clearFilters"><JIcon :icon="ICONS.reset" :size="14" />{{ t('清除筛选') }}</button>
        </div>
        <div v-if="more" v-sentinel class="sentinel" aria-hidden="true" />
      </div>
    </div>

    <BottomSheet v-model="sheet" :enabled="device.compact" class="detail" :label="displayName(def)">
      <template v-if="device.compact" #header>
        <div class="peek">
          <img v-if="thumbs[`${def.id}#${color}`]" :src="thumbs[`${def.id}#${color}`]" alt="" class="peek-img" />
          <span class="peek-name">
            <b>{{ displayName(def) }}</b>
            <span class="num">{{ t('宽 {w} · 深 {d} · 高 {h} cm', { w: def.w, d: def.d, h: def.h }) }}</span>
          </span>
          <button v-if="!def.fixture" class="primary" @click="placeInSandbox"><JIcon :icon="ICONS.placeInSandbox" />{{ t('放进沙盘') }}</button>
        </div>
      </template>
      <div ref="host" class="preview">
        <canvas ref="canvas" />
        <label class="spin"><input v-model="spin" type="checkbox" /><JIcon :icon="ICONS.autoRotate" :size="14" />{{ t('自动旋转') }}</label>
      </div>
      <div class="info">
        <div class="title">
          <h2>{{ displayName(def) }}</h2>
          <span class="tag">{{ t(CATEGORY_LABELS[def.category]) }}</span>
          <span v-if="def.type" class="tag">{{ t(typeLabel(def.type)) }}</span>
          <span class="tag">{{ t(SIZE_LABELS[sizeClass(def)]) }}</span>
        </div>
        <div class="dims num">
          {{ t('宽 {w} · 深 {d} · 高 {h} cm', { w: def.w, d: def.d, h: def.h }) }}
          <template v-if="def.surface"> · {{ t('顶面 {n} cm', { n: def.surface }) }}</template>
          <template v-if="def.mount"> · {{ t('离地 {n} cm（壁挂）', { n: def.mount }) }}</template>
        </div>

        <template v-if="sizes.length > 1">
          <div class="label">{{ t('规格') }}</div>
          <div class="sizes">
            <button v-for="s in sizes" :key="s.id" :class="{ on: s.id === selectedId }" :title="dims(s)" @click="pickSize(s.id)">
              {{ variantLabel(s) }}
            </button>
          </div>
        </template>

        <template v-if="!def.fixture">
          <div class="label">{{ t('配色') }}</div>
          <ColorEditor
            :def="def"
            :color="color"
            :colors="customColors"
            :patterns="customPatterns"
            @preset="(i) => ((color = i), (customColors = undefined))"
            @preview="(c) => (customColors = c)"
            @commit="(c) => (customColors = c)"
            @patterns="(p) => (customPatterns = p)"
          />
          <button class="primary go" @click="placeInSandbox"><JIcon :icon="ICONS.placeInSandbox" />{{ t('放进 3D 沙盘') }}</button>
          <p v-if="def.prop" class="note">{{ t('摆件：放到桌子、柜子顶面上会自动落在台面上，拖动桌子时会跟着走。') }}</p>
        </template>
        <p v-else class="note">{{ t('设备类：在 2D 平面图里放置对应设备（厨房、浴缸、马桶…），3D 沙盘会按实际尺寸自动生成。') }}</p>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
.lib {
  flex: 1;
  display: flex;
  min-height: 0;
}
.cats {
  width: 210px;
  flex: none;
  padding: 14px 12px;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.search {
  font: inherit;
  font-size: var(--fs-sm);
  width: 100%;
  height: var(--control-h);
  padding: 0 8px 0 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}
/* 搜索框：放大镜图标压在输入框左侧 */
.search-box {
  position: relative;
  display: block;
  margin-bottom: 8px;
}
.search-box > svg {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
.cats button {
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  border-color: transparent;
  background: transparent;
  min-height: var(--control-h);
  padding: 0 10px;
  border-radius: var(--radius-sm);
}
.cats button > svg {
  color: var(--text-muted);
}
.cats button.on > svg {
  color: var(--text);
}
.cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cats button .num {
  color: var(--text-muted);
}
.cats button.on {
  background: var(--surface);
  border-color: var(--border);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
}
.filters {
  padding: 12px 16px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.chips .label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  min-width: 4.5em;
  line-height: 1;
  white-space: nowrap;
}
.chips button {
  gap: 4px;
  height: var(--control-h-sm);
  padding: 0 12px;
  border-radius: 999px;
  font-size: var(--fs-sm);
}
.chips button .num {
  margin-left: 2px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.chips button.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.grid {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 12px;
  align-content: start;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px 10px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  background: var(--surface) !important;
}
.card.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.card img,
.ph {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  display: block;
}
.ph {
  background: var(--hover);
  border-radius: 10px;
}
.name {
  font-weight: 600;
  font-size: var(--fs-sm);
  /* 译名（英文）可能比中文长：单行省略，完整名字在 title 里 */
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.size {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.badge {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: var(--fs-xs);
  padding: 0 6px;
  border-radius: 999px;
  background: var(--hover);
  color: var(--text-muted);
}
.none {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 0;
  color: var(--text-muted);
}
.search-box .slash {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  margin: 0;
  padding: 0 5px;
  line-height: 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  pointer-events: none;
}
.detail {
  width: 380px;
  flex: none;
  border-left: 1px solid var(--border);
  background: var(--surface-2);
}
.sentinel {
  grid-column: 1 / -1;
  height: 1px;
}
/* 手机：抽屉收起时露出的一行（缩略图 + 名字 + 放进沙盘） */
.peek {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px 10px;
}
.peek-img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex: none;
}
.peek-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.peek-name b {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.peek-name span {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.peek button {
  flex: none;
  height: 44px;
  gap: 6px;
  border-radius: 10px;
}
.preview {
  position: relative;
  height: 340px;
  flex: none;
  background: radial-gradient(ellipse at 50% 40%, #fdfdfb 0%, #f1f3ef 65%, #e5eae6 100%);
}
.preview canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.spin {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
.info {
  padding: 14px 16px;
}
.title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
h2 {
  margin: 0;
  font-size: var(--fs-lg);
}
.tag {
  font-size: var(--fs-xs);
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--hover);
  color: var(--text-muted);
}
.dims {
  margin: 6px 0 14px;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-bottom: 6px;
}
.sizes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 14px;
}
.sizes button {
  height: var(--control-h-sm);
  padding: 0 12px;
  border-radius: 6px;
}
.sizes button.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.pal-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pal-style {
  width: 56px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  flex: none;
}
.swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sw {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border);
}
.sw.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.go {
  width: 100%;
  padding: 8px;
  font-size: var(--fs-base);
  margin-top: 10px;
}
.note {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  line-height: 1.6;
}
/* ---------- 手机 / 平板竖屏 ---------- */
:root.compact .lib {
  flex-direction: column;
  min-width: 0;
}
:root.compact .main {
  min-width: 0;
  width: 100%;
}
/* 搜索 + 分类：顶部一条横向滚动的胶囊 */
:root.compact .cats {
  width: auto;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-right: 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  flex: none;
}
:root.compact .cats::-webkit-scrollbar {
  display: none;
}
:root.compact .search-box {
  flex: none;
  width: 170px;
  margin: 0;
}
:root.compact .search-box .slash {
  display: none;
}
:root.compact .cats button {
  flex: none;
  min-height: 40px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 99px;
  padding: 0 12px;
}
:root.compact .cats button.on {
  background: var(--accent-weak);
  border-color: var(--accent-ring);
  color: var(--accent-strong);
}
:root.compact .cat-name {
  flex: none;
}
:root.compact .filters {
  padding: 8px 12px 0;
}
:root.compact .chips {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
:root.compact .chips::-webkit-scrollbar {
  display: none;
}
:root.compact .chips > * {
  flex: none;
}
:root.compact .chips .label {
  min-width: 0;
}
:root.compact .main {
  min-height: 0;
}
:root.compact .grid {
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 8px;
  padding: 10px 12px calc(110px + env(safe-area-inset-bottom, 0px));
}
:root.compact .card {
  padding: 6px 4px 8px;
}
:root.compact .card:hover {
  transform: none;
  box-shadow: none;
}
:root.compact .detail {
  width: auto;
}
:root.compact .preview {
  height: 240px;
}
:root.coarse .chips button,
:root.coarse .sizes button {
  height: 36px;
}
:root.coarse .go {
  height: 48px;
}
</style>
