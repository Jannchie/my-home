<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PlanCanvas from './components/PlanCanvas.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import Sandbox3D from './components/Sandbox3D.vue'
import AssetLibrary from './components/AssetLibrary.vue'
import SavedPlans from './components/SavedPlans.vue'
import TooltipLayer from './components/TooltipLayer.vue'
import ShortcutHelp from './components/ShortcutHelp.vue'
import Onboarding from './components/Onboarding.vue'
import { currentSaved, detachSaved, initSaved, openPanel, quickSave, saved, toast } from './saved'
import { busy, nextPaint, overlays, runBusy } from './ui/feedback'
import { FIXTURES, REGION_LABELS, dot, edgeInfo, type Plan } from './model'
import { LAYOUT_TYPES, STYLE_LABELS } from './generate'
import { isTyping } from './dom'
import { LANGS, jp, lang, setLang, t, type Lang } from './i18n'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS, TOOL_ICONS, VIEW_ICONS } from './ui/icons'
import {
  deleteSelection,
  duplicateSelection,
  findRoom,
  genMessage,
  chooseRegion,
  genOptions,
  generate,
  historyState,
  mutate,
  newPlan,
  normalizePlan,
  placeKind,
  rotateSelectedFixture,
  sandbox,
  plan,
  redo,
  replacePlan,
  selection,
  settings,
  tool,
  undo,
  viewMode,
  type Tool,
  type ViewMode,
} from './store'

const views: { id: ViewMode; label: string }[] = [
  { id: '2d', label: '平面图' }, // label 是中文原文，显示时过 t()
  { id: '3d', label: '3D 沙盘' },
  { id: 'lib', label: '素材库' },
]

const canvas = ref<InstanceType<typeof PlanCanvas>>()

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

// 图标见 TOOL_ICONS[id]（src/ui/icons.ts）
const tools: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: '选择', key: 'V' },
  { id: 'rect', label: '矩形房间', key: 'R' },
  { id: 'poly', label: '多边形房间', key: 'P' },
  { id: 'door', label: '门', key: 'D' },
  { id: 'window', label: '窗', key: 'W' },
  { id: 'fixture', label: '设备', key: 'K' },
]

const hints: Record<Tool, string> = {
  select: '拖动房间 / 边 / 角点 / 门窗 · 空格或右键拖动平移 · 滚轮缩放',
  rect: '拖拽画出矩形房间',
  poly: '逐点点击，点回起点 / 双击 / Enter 闭合 · Shift 正交 · Esc 取消',
  door: '点击墙上放门',
  window: '点击墙上放窗',
  fixture: '点击放设备，靠近墙会自动贴墙 · 选中后 Q 旋转',
}

async function doGenerate(newSeed = true) {
  // 生成（含自动布置）要算一会儿：先画出「处理中」，生成完报一下户型名
  await runBusy(t(sandbox.autoFurnish ? '正在生成户型并布置家具…' : '正在生成户型…'), () => {
    generate(newSeed)
    detachSaved()
  })
  canvas.value?.fit()
  toast(t('已生成「{name}」', { name: plan.value.name || t('未命名户型') }))
}

async function doNew() {
  newPlan()
  detachSaved()
  await nextTick()
  canvas.value?.fit()
}

function exportJson() {
  const blob = new Blob([JSON.stringify(plan.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${plan.value.name || 'plan'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const fileInput = ref<HTMLInputElement>()
async function importJson(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const p = normalizePlan(JSON.parse(await f.text()) as Plan)
    if (!p) throw new Error(t('格式不对'))
    replacePlan(p)
    detachSaved()
    await nextTick()
    canvas.value?.fit()
    toast(t('已导入「{name}」', { name: p.name || t('未命名户型') }))
  } catch (err) {
    // 用应用内提示代替浏览器 alert（不打断操作）
    toast(t('导入失败：{msg}', { msg: (err as Error).message }), 'error')
  }
  ;(e.target as HTMLInputElement).value = ''
}

// 「我的户型」：初始化（读关联存档、开自动快照）；打开存档后让平面图适应视图
initSaved()
const saveTitle = computed(() => {
  const m = currentSaved()
  return (m ? t('保存到「{name}」', { name: m.name }) : t('保存到「我的户型」')) + ' (Ctrl S)'
})
async function onSavedOpened() {
  await nextTick()
  canvas.value?.fit()
}

function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  // Ctrl / Cmd + S：保存到「我的户型」（输入框里也生效，并拦住浏览器的「保存网页」）；加 Shift 是另存为
  if (mod && k === 's' && !e.altKey) {
    e.preventDefault()
    if (e.shiftKey) openPanel(true)
    else quickSave()
    return
  }
  // 面板 / 确认框开着时不响应编辑器快捷键
  if (saved.panelOpen || saved.confirm) return
  if (isTyping(e)) return
  // ?：快捷键帮助（帮助开着时其他快捷键都不响应，Esc 关闭）
  if (e.key === '?' && !mod) {
    e.preventDefault()
    overlays.help = !overlays.help
    return
  }
  if (overlays.help) {
    if (e.key === 'Escape') overlays.help = false
    return
  }
  if (mod && k === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (mod && k === 'y') {
    e.preventDefault()
    redo()
  } else if (mod && k === 'd') {
    e.preventDefault()
    duplicateSelection()
  } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
    deleteSelection()
  } else if (!mod && !e.altKey && !e.shiftKey && (k === '1' || k === '2' || k === '3')) {
    // 1 / 2 / 3：切换平面图 / 3D 沙盘 / 素材库
    viewMode.value = views[+k - 1].id
  } else if (!mod && !e.altKey && viewMode.value === '2d') {
    const tl = tools.find((x) => x.key.toLowerCase() === k)
    if (tl) tool.value = tl.id
    else if (k === 'f') canvas.value?.fit()
    else if (k === 'g') doGenerate()
    else if (k === 'q') rotateSelectedFixture()
    else if (e.key.startsWith('Arrow')) nudge(e)
  }
}

/**
 * 方向键微移选中的房间 / 设备 / 门窗（门窗沿所在墙移动）。
 * 连按（含按住不放）只记一步撤销：距上次微移超过 800ms 才开新的一步。
 */
let lastNudge = 0
function nudge(e: KeyboardEvent) {
  const s = selection.value
  if (!s || (s.type !== 'room' && s.type !== 'fixture' && s.type !== 'opening')) return
  const step = e.shiftKey ? settings.grid * 10 : settings.grid || 1
  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
  const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
  let apply: (() => void) | null = null
  if (s.type === 'room') {
    const r = findRoom(s.id)
    if (r) apply = () => (r.points = r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })))
  } else if (s.type === 'fixture') {
    const f = plan.value.fixtures.find((x) => x.id === s.id)
    if (f) apply = () => ((f.x += dx), (f.y += dy))
  } else {
    const o = plan.value.openings.find((x) => x.id === s.id)
    const r = o && findRoom(o.roomId)
    if (o && r) {
      const ed = edgeInfo(r.points, o.edge)
      const d = dot({ x: dx, y: dy }, ed.dir)
      // 和墙垂直的方向键不动
      if (Math.abs(d) > 0.5) apply = () => (o.offset = ed.length <= o.width ? ed.length / 2 : Math.max(o.width / 2, Math.min(ed.length - o.width / 2, o.offset + d)))
    }
  }
  if (!apply) return
  e.preventDefault()
  const now = performance.now()
  if (now - lastNudge > 800) mutate(apply)
  else apply()
  lastNudge = now
}

// ---------- 视图切换：3D 沙盘 / 素材库要建 WebGL 场景，先画出「处理中」再挂载 ----------
const shownView = ref<ViewMode>(viewMode.value)
watch(viewMode, async (v) => {
  if (v === shownView.value) return
  if (v === '2d') {
    shownView.value = v
    return
  }
  busy.count++
  busy.text = t(v === '3d' ? '正在搭建 3D 沙盘…' : '正在准备素材库…')
  try {
    await nextPaint()
    if (viewMode.value !== v) return
    shownView.value = v
    await nextTick()
  } finally {
    busy.count--
  }
})

// 「生成选项」弹层：只是界面开关，点外面或按 Esc 收起
const genOpen = ref(false)
const genBox = ref<HTMLElement>()
function onDocPointer(e: PointerEvent) {
  if (genOpen.value && genBox.value && !genBox.value.contains(e.target as Node)) genOpen.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') genOpen.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keydown', onEsc)
  document.addEventListener('pointerdown', onDocPointer)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keydown', onEsc)
  document.removeEventListener('pointerdown', onDocPointer)
})
</script>

<template>
  <div class="app">
    <header class="top">
      <!-- 品牌：鼠尾草绿圆角块里放平面图图标 + 产品名（和页面标题、OG 图一致） -->
      <div class="brand">
        <span class="logo" aria-hidden="true"><JIcon :icon="VIEW_ICONS['2d']" :size="18" weight="bold" /></span>
        <span class="brand-text">
          <b>My Home</b>
        </span>
      </div>

      <div class="views">
        <button v-for="(v, i) in views" :key="v.id" :class="{ on: viewMode === v.id }" :title="`${t(v.label)} (${i + 1})`" :aria-label="t(v.label)" @click="viewMode = v.id"><JIcon :icon="VIEW_ICONS[v.id]" /><span class="lbl">{{ t(v.label) }}</span></button>
      </div>

      <div v-if="viewMode === '2d'" class="group">
        <button
          v-for="tl in tools"
          :key="tl.id"
          class="tool"
          :class="{ on: tool === tl.id }"
          :title="`${t(tl.label)} (${tl.key})`"
          :aria-label="t(tl.label)"
          @click="tool = tl.id"
        >
          <JIcon :icon="TOOL_ICONS[tl.id]" />
          <span>{{ t(tl.label) }}</span>
        </button>
        <select v-model="placeKind" class="kind" :title="t('要放的设备')" @change="tool = 'fixture'">
          <option v-for="(spec, key) in FIXTURES" :key="key" :value="key">{{ t(spec.label) }}</option>
        </select>
      </div>

      <div class="group hist">
        <button :disabled="!historyState.canUndo" :title="t('撤销') + ' (Ctrl Z)'" :aria-label="t('撤销')" @click="undo"><JIcon :icon="ICONS.undo" /><span class="lbl">{{ t('撤销') }}</span></button>
        <button :disabled="!historyState.canRedo" :title="t('重做') + ' (Ctrl Shift Z)'" :aria-label="t('重做')" @click="redo"><JIcon :icon="ICONS.redo" /><span class="lbl">{{ t('重做') }}</span></button>
        <button v-if="viewMode === '2d'" class="fit-btn" :title="t('适应视图') + ' (F)'" :aria-label="t('适应视图')" @click="canvas?.fit()"><JIcon :icon="ICONS.fit" /><span class="lbl">{{ t('适应') }}</span></button>
      </div>

      <!-- 户型生成：主按钮 + 「生成选项」弹层（参数多，平铺在顶栏会挤成两行） -->
      <div v-if="viewMode !== 'lib'" ref="genBox" class="group gen">
        <button class="primary" :title="t('随机生成') + ' (G)'" @click="doGenerate()"><JIcon :icon="ICONS.generate" />{{ t('随机生成') }}</button>
        <button class="gen-toggle" :class="{ on: genOpen }" :title="t('生成选项')" :aria-label="t('生成选项')" :aria-expanded="genOpen" @click="genOpen = !genOpen">
          <JIcon :icon="ICONS.generateOptions" />
          <span class="lbl">{{ t('生成选项') }}</span>
          <JIcon :icon="genOpen ? ICONS.collapse : ICONS.expand" :size="14" class="ico-muted" />
        </button>
        <div v-if="genOpen" class="gen-pop" role="dialog" :aria-label="t('生成选项')">
          <label class="field">
            <span>{{ t('地区 / 风格') }}</span>
            <select :value="genOptions.region" @change="chooseRegion(($event.target as HTMLSelectElement).value as never)">
              <option v-for="(label, key) in REGION_LABELS" :key="key" :value="key">{{ t(label) }}</option>
              <option value="random">{{ t('随机地区') }}</option>
            </select>
          </label>
          <label v-if="genOptions.region === 'cn' || genOptions.region === 'west'" class="field">
            <span>{{ t('卧室数') }}</span>
            <select v-model="genOptions.bedrooms">
              <option value="random">{{ t('随机户型') }}</option>
              <option v-for="n in [1, 2, 3, 4]" :key="n" :value="n">{{ genOptions.region === 'cn' ? t('{n} 室', { n }) : t('{n} 卧', { n }) }}</option>
            </select>
          </label>
          <label v-if="genOptions.region !== 'cn' && genOptions.region !== 'west'" class="field">
            <span>{{ t('间取り') }}</span>
            <select v-model="genOptions.type">
              <option value="random">{{ t('随机户型') }}</option>
              <option v-for="lt in LAYOUT_TYPES" :key="lt" :value="lt">{{ lt }}</option>
            </select>
          </label>
          <label v-if="genOptions.region !== 'cn' && genOptions.region !== 'west'" class="field">
            <span>{{ t('骨架') }}</span>
            <select v-model="genOptions.style">
              <option value="random">{{ t('随机骨架') }}</option>
              <option v-for="(label, key) in STYLE_LABELS" :key="key" :value="key">{{ jp(label) }}</option>
            </select>
          </label>
          <label v-if="genOptions.region !== 'cn' && genOptions.region !== 'west'" class="field">
            <span>{{ t('居室入口') }}</span>
            <select v-model="genOptions.access">
              <option value="random">{{ t('入口随机') }}</option>
              <option value="hall">{{ t('廊下进') }}</option>
              <option value="living">{{ t('リビングイン') }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('住户位置') }}</span>
            <select v-model="genOptions.corner" :title="t('角部屋（侧墙开窗）')">
              <option value="random">{{ t('位置随机') }}</option>
              <option value="no">{{ t('中部屋') }}</option>
              <option value="yes">{{ t('角部屋') }}</option>
            </select>
          </label>
          <div class="field">
            <span>{{ t('专有面积') }} ㎡</span>
            <span class="area num">
              <input v-model="minArea" type="number" min="0" :placeholder="t('不限')" :title="t('最小专有面积 ㎡')" :aria-label="t('最小专有面积 ㎡')" />
              <span>–</span>
              <input v-model="maxArea" type="number" min="0" :placeholder="t('不限')" :title="t('最大专有面积 ㎡')" :aria-label="t('最大专有面积 ㎡')" />
            </span>
          </div>
          <label class="field">
            <span>{{ t('种子') }}</span>
            <input v-model.number="genOptions.seed" type="number" class="seed num" @change="doGenerate(false)" />
          </label>
          <label class="furnish"><input v-model="sandbox.autoFurnish" type="checkbox" /><JIcon :icon="ICONS.autoFurnishToggle" class="ico-muted" />{{ t('生成户型时自动布置家具') }}</label>
        </div>
      </div>

      <div class="group right file">
        <button class="save-btn" :class="{ dirty: saved.dirty && !!saved.currentId }" :title="saveTitle" :aria-label="t('保存')" :disabled="saved.busy" @click="quickSave"><JIcon :icon="ICONS.save" /><span class="lbl">{{ t('保存') }}</span></button>
        <button :title="t('我的户型')" :aria-label="t('我的户型')" @click="openPanel()"><JIcon :icon="ICONS.savedPlans" /><span class="lbl">{{ t('我的户型') }}</span></button>
        <button :title="t('新建')" :aria-label="t('新建')" @click="doNew"><JIcon :icon="ICONS.newPlan" /><span class="lbl">{{ t('新建') }}</span></button>
        <button :title="t('导入')" :aria-label="t('导入')" @click="fileInput?.click()"><JIcon :icon="ICONS.import" /><span class="lbl">{{ t('导入') }}</span></button>
        <button :title="t('导出 JSON')" :aria-label="t('导出 JSON')" @click="exportJson"><JIcon :icon="ICONS.exportJson" /><span class="lbl">{{ t('导出 JSON') }}</span></button>
        <button v-if="viewMode === '2d'" :title="t('导出 PNG')" :aria-label="t('导出 PNG')" @click="canvas?.exportPng()"><JIcon :icon="ICONS.exportPng" /><span class="lbl">{{ t('导出 PNG') }}</span></button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importJson" />
      </div>

      <!-- 界面语言：首次按浏览器语言推断，选择后记在 localStorage（my-home:lang） -->
      <div class="group lang">
        <JIcon :icon="ICONS.language" class="ico-muted" />
        <select :value="lang" :title="t('界面语言')" aria-label="Language" @change="setLang(($event.target as HTMLSelectElement).value as Lang)">
          <option v-for="l in LANGS" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
        <button class="help-btn" :title="t('快捷键') + ' (?)'" :aria-label="t('快捷键')" @click="overlays.help = true"><JIcon :icon="ICONS.keyboard" /></button>
      </div>
    </header>

    <!-- 视图内容比顶栏的高亮晚两帧切换：先画出「处理中」再搭 WebGL 场景 -->
    <main v-if="shownView === '2d'">
      <div class="stage">
        <PlanCanvas ref="canvas" />
        <!-- 缩放控件：滚轮 / 捏合之外的可见入口；点百分比回到 100% -->
        <div class="zoom">
          <button class="icon-only" :title="t('缩小')" :aria-label="t('缩小')" @click="canvas?.zoomBy(1 / 1.25)"><JIcon :icon="ICONS.zoomOut" :size="15" /></button>
          <button class="pct num" :title="t('回到 100%')" @click="canvas?.zoomReset()">{{ Math.round((canvas?.view.s ?? 1) * 100) }}%</button>
          <button class="icon-only" :title="t('放大')" :aria-label="t('放大')" @click="canvas?.zoomBy(1.25)"><JIcon :icon="ICONS.zoomIn" :size="15" /></button>
          <button class="icon-only" :title="t('适应视图') + ' (F)'" :aria-label="t('适应视图')" @click="canvas?.fit()"><JIcon :icon="ICONS.fit" :size="15" /></button>
        </div>
        <footer class="status">
          <span>{{ t(hints[tool]) }}<b v-if="genMessage" class="warn"> · {{ genMessage }}</b></span>
          <span class="num">{{ canvas?.cursorInfo }}</span>
        </footer>
      </div>
      <InspectorPanel />
    </main>
    <main v-else-if="shownView === '3d'">
      <Sandbox3D />
    </main>
    <main v-else>
      <AssetLibrary />
    </main>
    <SavedPlans @opened="onSavedOpened" />
    <!-- 处理中：淡入带延迟，很快的操作不会闪；转圈是合成线程动画，主线程忙时也在转 -->
    <div v-if="busy.count" class="busy" role="status" aria-live="polite">
      <JIcon :icon="ICONS.loading" :size="16" class="spin" />
      <span>{{ busy.text }}</span>
    </div>
    <TooltipLayer />
    <ShortcutHelp />
    <Onboarding />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex-wrap: wrap;
  row-gap: 8px;
  position: relative;
  z-index: 5;
}
/* 顶栏所有控件统一高度 / 圆角 / 字号，垂直居中 */
.top button,
.top select,
.top input:not([type='checkbox']) {
  height: var(--control-h);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1;
  border-radius: var(--radius-sm);
}
.top button {
  padding: 0 var(--control-px);
}
.top select,
.top input:not([type='checkbox']) {
  padding: 0 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
/* 窄屏：工具、文件按钮只留图标（title / aria-label 仍有文字） */
/*
 * 顶栏要在一行放下：按宽度逐级把按钮收成纯图标（title / aria-label 仍有文字）。
 * 撤销 / 重做 / 适应一直是纯图标；工具 ≥2200px、文件 ≥2000px 才显示文字。
 */
.hist .lbl {
  display: none;
}
.hist button {
  padding: 0 8px;
}
@media (max-width: 2200px) {
  .tool span {
    display: none;
  }
  .tool {
    padding: 0 8px;
  }
}
@media (max-width: 2000px) {
  .file .lbl {
    display: none;
  }
  .file button {
    padding: 0 8px;
  }
}
@media (max-width: 1760px) {
  /* 窄一些时只给当前视图留文字：一眼看出自己在哪，其余两个靠图标 + 提示 */
  .views button:not(.on) .lbl {
    display: none;
  }
  .views button:not(.on) {
    padding: 0 10px;
  }
  .gen-toggle .lbl {
    display: none;
  }
}
@media (max-width: 1440px) {
  .gen-toggle .lbl {
    display: none;
  }
  .top {
    gap: 8px;
  }
  .group {
    padding-left: 8px;
  }
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-right: 6px;
  padding-right: 16px;
  border-right: 1px solid var(--border);
  white-space: nowrap;
}
.logo {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: var(--text-inverse);
  background: linear-gradient(145deg, var(--accent) 0%, var(--accent-hover) 100%);
  box-shadow:
    0 1px 2px rgba(32, 38, 34, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.logo > svg {
  display: block;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.brand-text b {
  font-size: var(--fs-md);
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--text);
}
.views {
  display: flex;
  height: var(--control-h);
  padding: 2px;
  background: var(--hover);
  border-radius: var(--radius);
  gap: 2px;
}
.top .views button {
  height: 100%;
  gap: 6px;
  border-color: transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 0 12px;
}
.top .views button.on {
  background: var(--surface);
  border-color: var(--border);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
  box-shadow: var(--shadow-sm);
}
.group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
.group.right {
  margin-left: auto;
}
.tool.on,
.gen-toggle.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.lang {
  gap: 4px;
}
/* 设备下拉：日文 / 英文的设备名很长，限宽免得把顶栏挤成两行（展开的列表仍显示全名） */
.top .kind {
  max-width: 128px;
}
/* 保存按钮：有未保存的修改时右上角一个鼠尾草绿小圆点 */
.save-btn {
  position: relative;
}
.save-btn.dirty::after {
  content: '';
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
/* 生成选项弹层 */
.gen {
  position: relative;
}
.gen-pop {
  position: absolute;
  top: calc(100% + 8px);
  left: 12px;
  z-index: 20;
  width: 300px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px 12px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}
.field {
  display: contents;
}
.field > span:first-child {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  white-space: nowrap;
}
.gen-pop select,
.gen-pop .seed {
  width: 100%;
  min-width: 0;
}
.area {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}
.top .area input {
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
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
.warn {
  color: var(--danger);
  font-weight: 600;
}
main {
  flex: 1;
  display: flex;
  min-height: 0;
}
.stage {
  flex: 1;
  position: relative;
  min-width: 0;
}
.status {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 12px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: rgba(250, 250, 248, 0.88);
  border-top: 1px solid var(--border);
  pointer-events: none;
}
.help-btn {
  padding: 0 8px;
}
.zoom {
  position: absolute;
  right: 12px;
  bottom: 38px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.zoom button {
  height: 26px;
  border-color: transparent;
  background: transparent;
}
.zoom button:hover:not(:disabled) {
  border-color: transparent;
}
.zoom .pct {
  min-width: 52px;
  padding: 0 6px;
  font-size: var(--fs-xs);
}
/* 处理中提示：顶栏下方居中的小胶囊 */
.busy {
  position: fixed;
  top: 64px;
  left: 50%;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 99px;
  box-shadow: var(--shadow);
  transform: translateX(-50%);
  pointer-events: none;
  animation: busy-in 0.18s ease-out 0.08s both;
}
.busy .spin {
  color: var(--accent);
  animation: busy-spin 0.9s linear infinite;
}
@keyframes busy-in {
  from {
    opacity: 0;
    transform: translate(-50%, -4px);
  }
}
@keyframes busy-spin {
  to {
    transform: rotate(360deg);
  }
}
/* 更窄的屏幕：收起品牌文字、当前视图文字和顶栏里的「适应」（平面图右下角的缩放控件里也有），保持一行 */
@media (max-width: 1440px) {
  .brand {
    padding-right: 10px;
    margin-right: 0;
  }
  .brand-text {
    display: none;
  }
  .top .views button.on .lbl {
    display: none;
  }
  .hist .fit-btn {
    display: none;
  }
  .top {
    padding: 10px 12px;
  }
  .top .kind {
    max-width: 104px;
  }
  .lang > svg,
  .gen-toggle > svg:last-child {
    display: none;
  }
}
@media (max-width: 1180px) {
  .top {
    gap: 6px;
    padding: 8px 10px;
  }
  .group {
    padding-left: 6px;
    gap: 4px;
  }
  .lang > svg {
    display: none;
  }
  .top .kind {
    width: 88px;
  }
}
</style>
