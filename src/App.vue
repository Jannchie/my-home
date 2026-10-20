<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PlanCanvas from './components/PlanCanvas.vue'
import FloorBar from './components/FloorBar.vue'
import FloorRail from './components/FloorRail.vue'
import FixturePlacer from './components/FixturePlacer.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import Sandbox3D from './components/Sandbox3D.vue'
import AssetLibrary from './components/AssetLibrary.vue'
import SavedPlans from './components/SavedPlans.vue'
import TooltipLayer from './components/TooltipLayer.vue'
import ShortcutHelp from './components/ShortcutHelp.vue'
import Onboarding from './components/Onboarding.vue'
import GenOptions from './components/GenOptions.vue'
import BottomSheet, { type SheetSnap } from './components/BottomSheet.vue'
import ContextMenu, { type MenuEntry } from './components/ContextMenu.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import ChangelogPanel from './components/ChangelogPanel.vue'
import { APP_VERSION } from './changelog'
import SharePanel from './components/SharePanel.vue'
import { AUTHOR, REPO_URL } from './seo'
import { currentSaved, detachSaved, initSaved, openPanel, openSharedPlan, quickSave, saved, toast } from './saved'
import { initRouter } from './router'
import { decodeShare, payloadFromHash, stripShareHash } from './share'
import { busy, nextPaint, overlays, runBusy } from './ui/feedback'
import { device, layout } from './ui/device'
import { FIXTURES, OPENING_LABELS, dot, edgeInfo, type Plan } from './model'
import { isTyping } from './dom'
import { LANGS, lang, roomName, setLang, t, type Lang } from './i18n'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS, TOOL_ICONS, VIEW_ICONS } from './ui/icons'
import {
  deleteSelection,
  duplicateSelection,
  findFixture,
  findRoom,
  genMessage,
  generate,
  historyState,
  mutate,
  newPlan,
  normalizePlan,
  placePicker,
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
  select: '拖动房间 / 边 / 角点 / 门窗 · 点边中点的 + 或双击边加角点 · 空格或右键拖动平移 · 滚轮缩放',
  rect: '拖拽画出矩形房间',
  poly: '逐点点击，点回起点 / 双击 / Enter 闭合 · Shift 正交 · Esc 取消',
  door: '点击墙上放门',
  window: '点击墙上放窗',
  fixture: '点击放设备，靠近墙会自动贴墙 · 选中后 Q 旋转',
}
/** 触屏上的工具提示（选择工具不提示：单指拖空白平移、双指缩放是常识） */
const touchHints: Partial<Record<Tool, string>> = {
  rect: '手指拖拽画出矩形房间 · 双指移动画布',
  poly: '逐点点按添加顶点，点「完成」闭合 · 拖动空白处移动画布',
  door: '点按墙放门',
  window: '点按墙放窗',
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

// ---------- 分享链接：顶栏「更多」里打开面板；带 #p= 的地址打开时导入户型 ----------
const shareOpen = ref(false)
let importing = false
async function openFromHash() {
  const payload = payloadFromHash(location.hash)
  if (!payload || importing) return
  importing = true
  // 不管打没打开都把 #p 从地址里去掉：刷新时不会再导入一次
  const clear = () => history.replaceState(history.state, '', stripShareHash(location.href))
  try {
    const res = await decodeShare(payload)
    if (!res.ok) {
      clear()
      toast(res.error === 'version' ? t('这个分享链接来自更新版本的 My Home，刷新页面后再试。') : t('分享链接已损坏或不完整，没能打开户型。'), 'error')
      return
    }
    const opened = await openSharedPlan(res.plan)
    clear()
    if (!opened) return
    await nextTick()
    canvas.value?.fit()
    toast(t('已打开分享的户型「{name}」', { name: res.plan.name || t('未命名户型') }))
  } finally {
    importing = false
  }
}
function onHashChange() {
  void openFromHash()
}

// 视图和地址栏同步（/en/3d、/library…，浏览器前进 / 后退切换视图）
initRouter(viewMode)

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
  if (saved.panelOpen || saved.confirm || shareOpen.value) return
  if (isTyping(e)) return
  // ?：快捷键帮助（帮助开着时其他快捷键都不响应，Esc 关闭）
  if (e.key === '?' && !mod) {
    e.preventDefault()
    overlays.help = !overlays.help
    return
  }
  if (overlays.help) {
    // 关帮助的这次 Esc 到此为止：别再传给沙盘 / 画布（否则顺带取消了选中）
    if (e.key === 'Escape') {
      overlays.help = false
      e.stopImmediatePropagation()
    }
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

// 「生成选项」：桌面是顶栏下的弹层，精简顶栏（手机 / 平板）时是底部面板；点外面或按 Esc 收起
const genOpen = ref(false)
const genBox = ref<HTMLElement>()
const genSheet = ref<HTMLElement>()
function onDocPointer(e: PointerEvent) {
  if (!genOpen.value) return
  const n = e.target as Node
  if (genBox.value?.contains(n) || genSheet.value?.contains(n)) return
  // 手机上点「生成选项」按钮本身由按钮自己切换
  if ((e.target as Element).closest?.('[data-gen-toggle]')) return
  genOpen.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') genOpen.value = false
}

// ---------- 顶栏高度：底部抽屉全屏时停在顶栏下面 ----------
const topBar = ref<HTMLElement>()
let topRo: ResizeObserver | null = null

// ---------- 「更多」菜单（精简顶栏）：生成、文件、语言、帮助 ----------
const moreBtn = ref<HTMLElement>()
const deskMoreBtn = ref<HTMLElement>()
const moreMenu = ref<{ x: number; y: number } | null>(null)
let menuClosedAt = 0
function closeMore() {
  moreMenu.value = null
  menuClosedAt = performance.now()
}
function toggleMore() {
  // 菜单开着时点按钮：菜单在 pointerdown 时已经自己关了，这次 click 不要再打开
  if (!moreMenu.value && performance.now() - menuClosedAt < 300) return
  if (moreMenu.value) {
    moreMenu.value = null
    return
  }
  const r = (moreBtn.value ?? deskMoreBtn.value)!.getBoundingClientRect()
  moreMenu.value = { x: r.right - 240, y: r.bottom + 6 }
}
/** 桌面顶栏的「更多」：只放帮助和链接（文件、语言按钮都在顶栏上） */
/** 更新日志面板；版本变了（不是第一次来）时提示一次 */
const changelogOpen = ref(false)
const SEEN_KEY = 'my-home:seen-version'
onMounted(() => {
  try {
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen && seen !== APP_VERSION) toast(t('已更新到 v{v}，可在「更多 → 更新日志」查看', { v: APP_VERSION }))
    localStorage.setItem(SEEN_KEY, APP_VERSION)
  } catch {
    // 读写不了就不提示
  }
})
const changelogItem = computed<MenuEntry>(() => ({ label: t('更新日志'), icon: ICONS.changelog, keys: `v${APP_VERSION}`, action: () => (changelogOpen.value = true) }))
const deskMoreItems = computed<MenuEntry[]>(() => [
  { label: t('分享链接'), icon: ICONS.shareLink, action: () => (shareOpen.value = true) },
  'sep',
  { label: t('快捷键'), icon: ICONS.keyboard, keys: '?', action: () => (overlays.help = true) },
  { label: t('新手引导'), icon: ICONS.tip, action: () => (overlays.onboarding = true) },
  changelogItem.value,
  'sep',
  { label: t('作者的 X'), brand: 'x', action: () => openLink(AUTHOR.x) },
  { label: t('GitHub 仓库'), icon: ICONS.github, action: () => openLink(REPO_URL) },
])
const moreItems = computed<MenuEntry[]>(() => [
  ...(viewMode.value !== 'lib'
    ? ([
        { label: t('生成选项'), icon: ICONS.generateOptions, action: () => (genOpen.value = true) },
        'sep',
        // 顶栏外面放的是随机生成，保存在这里
        { label: t('保存'), icon: ICONS.save, action: () => quickSave() },
      ] as MenuEntry[])
    : []),
  { label: t('我的户型'), icon: ICONS.savedPlans, action: () => openPanel() },
  { label: t('新建'), icon: ICONS.newPlan, action: doNew },
  { label: t('导入'), icon: ICONS.import, action: () => fileInput.value?.click() },
  { label: t('导出 JSON'), icon: ICONS.exportJson, action: exportJson },
  ...(viewMode.value === '2d' ? [{ label: t('导出 PNG'), icon: ICONS.exportPng, action: () => canvas.value?.exportPng() }] : []),
  { label: t('分享链接'), icon: ICONS.shareLink, action: () => (shareOpen.value = true) },
  'sep',
  { header: t('界面语言') },
  ...LANGS.map((l) => ({ label: l.label, icon: l.id === lang.value ? ICONS.check : undefined, action: () => setLang(l.id as Lang) })),
  'sep',
  { label: t(device.coarse ? '手势与快捷键' : '快捷键'), icon: ICONS.keyboard, keys: device.coarse ? undefined : '?', action: () => (overlays.help = true) },
  { label: t('新手引导'), icon: ICONS.tip, action: () => (overlays.onboarding = true) },
  changelogItem.value,
  'sep',
  { label: t('作者的 X'), brand: 'x', action: () => openLink(AUTHOR.x) },
  { label: t('GitHub 仓库'), icon: ICONS.github, action: () => openLink(REPO_URL) },
])
function openLink(url: string) {
  window.open(url, '_blank', 'noopener')
}

// ---------- 手机：平面图的底部抽屉、选中物体的浮动操作条、多边形绘制控件 ----------
const sheet2d = ref<SheetSnap>('peek')
watch(viewMode, () => (sheet2d.value = 'peek'))
// 开始画东西时收起抽屉，把画布让出来
watch(tool, (v, old) => {
  if (v !== 'select' && device.compact) sheet2d.value = 'peek'
  // 切到「设备」工具：先打开设备面板挑要放什么；离开时收起
  if (v === 'fixture' && old !== 'fixture') placePicker.value = true
  if (v !== 'fixture') placePicker.value = false
})

const selLabel = computed(() => {
  const s = selection.value
  if (!s) return ''
  if (s.type === 'room') return roomName(findRoom(s.id)?.name ?? '')
  if (s.type === 'vertex') return t('顶点')
  if (s.type === 'fixture') {
    const f = findFixture(s.id)
    return f ? t(FIXTURES[f.kind].label) : ''
  }
  if (s.type === 'opening') {
    const o = plan.value.openings.find((x) => x.id === s.id)
    return o ? t(OPENING_LABELS[o.kind]) : ''
  }
  return ''
})
const show2dBar = computed(() => device.compact && shownView.value === '2d' && !!selLabel.value && tool.value === 'select' && sheet2d.value === 'peek')
const barBottom = computed(() => (device.landscape ? 12 + layout.safeBottom : layout.sheetH + 10) + 'px')

// 提示条（toast）让开底部抽屉
watch(
  () => layout.sheetH,
  (h) => document.documentElement.style.setProperty('--toast-bottom', (h ? h + 12 : 28) + 'px'),
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keydown', onEsc)
  document.addEventListener('pointerdown', onDocPointer)
  window.addEventListener('hashchange', onHashChange)
  void openFromHash()
  topRo = new ResizeObserver(() => {
    if (!topBar.value) return
    layout.topBar = topBar.value.getBoundingClientRect().bottom
    document.documentElement.style.setProperty('--topbar', layout.topBar + 'px')
  })
  if (topBar.value) topRo.observe(topBar.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keydown', onEsc)
  document.removeEventListener('pointerdown', onDocPointer)
  window.removeEventListener('hashchange', onHashChange)
  topRo?.disconnect()
})
</script>

<template>
  <div class="app">
    <header ref="topBar" class="top">
      <!-- 品牌：鼠尾草绿圆角块里放平面图图标 + 产品名（和页面标题、OG 图一致） -->
      <div class="brand">
        <span class="logo" aria-hidden="true"><JIcon :icon="VIEW_ICONS['2d']" :size="18" weight="bold" /></span>
        <span class="brand-text">
          <b>My Home</b>
        </span>
      </div>

      <div class="views" role="tablist">
        <button v-for="(v, i) in views" :key="v.id" role="tab" :aria-selected="viewMode === v.id" :class="{ on: viewMode === v.id }" :title="`${t(v.label)} (${i + 1})`" :aria-label="t(v.label)" @click="viewMode = v.id"><JIcon :icon="VIEW_ICONS[v.id]" /><span class="lbl">{{ t(v.label) }}</span></button>
      </div>

      <!-- 平面图工具：手机上放进底部抽屉的标题栏 -->
      <div v-if="viewMode === '2d' && !device.compact" class="group">
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
      </div>

      <div class="group hist">
        <button :disabled="!historyState.canUndo" :title="t('撤销') + ' (Ctrl Z)'" :aria-label="t('撤销')" @click="undo"><JIcon :icon="ICONS.undo" /><span class="lbl">{{ t('撤销') }}</span></button>
        <button :disabled="!historyState.canRedo" :title="t('重做') + ' (Ctrl Shift Z)'" :aria-label="t('重做')" @click="redo"><JIcon :icon="ICONS.redo" /><span class="lbl">{{ t('重做') }}</span></button>
        <button v-if="viewMode === '2d' && !device.compactBar" class="fit-btn" :title="t('适应视图') + ' (F)'" :aria-label="t('适应视图')" @click="canvas?.fit()"><JIcon :icon="ICONS.fit" /><span class="lbl">{{ t('适应') }}</span></button>
      </div>

      <!-- 户型生成：主按钮 + 「生成选项」弹层（参数多，平铺在顶栏会挤成两行）；精简顶栏时收进「更多」 -->
      <div v-if="viewMode !== 'lib' && !device.compactBar" ref="genBox" class="group gen">
        <button class="primary" :title="t('随机生成') + ' (G)'" @click="doGenerate()"><JIcon :icon="ICONS.generate" />{{ t('随机生成') }}</button>
        <button class="gen-toggle" :class="{ on: genOpen }" :title="t('生成选项')" :aria-label="t('生成选项')" :aria-expanded="genOpen" @click="genOpen = !genOpen">
          <JIcon :icon="ICONS.generateOptions" />
          <span class="lbl">{{ t('生成选项') }}</span>
          <JIcon :icon="genOpen ? ICONS.collapse : ICONS.expand" :size="14" class="ico-muted" />
        </button>
        <div v-if="genOpen" class="gen-pop" role="dialog" :aria-label="t('生成选项')">
          <GenOptions @generate="doGenerate" />
        </div>
      </div>
      <!-- 平板横屏：生成按钮留在顶栏（只有图标） -->
      <div v-else-if="viewMode !== 'lib' && !device.compact" class="group">
        <button class="primary icon-only gen-icon" :title="t('随机生成')" :aria-label="t('随机生成')" @click="doGenerate()"><JIcon :icon="ICONS.generate" /></button>
        <button class="icon-only" data-gen-toggle :class="{ on: genOpen }" :title="t('生成选项')" :aria-label="t('生成选项')" @click="genOpen = !genOpen"><JIcon :icon="ICONS.generateOptions" /></button>
      </div>

      <div v-if="!device.compactBar" class="group right file">
        <button class="save-btn" :class="{ dirty: saved.dirty && !!saved.currentId }" :title="saveTitle" :aria-label="t('保存')" :disabled="saved.busy" @click="quickSave"><JIcon :icon="ICONS.save" /><span class="lbl">{{ t('保存') }}</span></button>
        <button :title="t('我的户型')" :aria-label="t('我的户型')" @click="openPanel()"><JIcon :icon="ICONS.savedPlans" /><span class="lbl">{{ t('我的户型') }}</span></button>
        <button :title="t('新建')" :aria-label="t('新建')" @click="doNew"><JIcon :icon="ICONS.newPlan" /><span class="lbl">{{ t('新建') }}</span></button>
        <button :title="t('导入')" :aria-label="t('导入')" @click="fileInput?.click()"><JIcon :icon="ICONS.import" /><span class="lbl">{{ t('导入') }}</span></button>
        <button :title="t('导出 JSON')" :aria-label="t('导出 JSON')" @click="exportJson"><JIcon :icon="ICONS.exportJson" /><span class="lbl">{{ t('导出 JSON') }}</span></button>
        <button v-if="viewMode === '2d'" :title="t('导出 PNG')" :aria-label="t('导出 PNG')" @click="canvas?.exportPng()"><JIcon :icon="ICONS.exportPng" /><span class="lbl">{{ t('导出 PNG') }}</span></button>
      </div>
      <!-- 精简顶栏：随机生成（手机上最常点，放在外面）+ 「更多」；保存收进「更多」。素材库里没有生成，留保存 -->
      <div v-else class="group right file">
        <button v-if="viewMode !== 'lib'" class="primary icon-only gen-icon" :title="t('随机生成')" :aria-label="t('随机生成')" @click="doGenerate()"><JIcon :icon="ICONS.generate" /></button>
        <button v-else class="save-btn icon-only" :class="{ dirty: saved.dirty && !!saved.currentId }" :title="saveTitle" :aria-label="t('保存')" :disabled="saved.busy" @click="quickSave"><JIcon :icon="ICONS.save" /></button>
        <button ref="moreBtn" class="icon-only more-btn" :class="{ on: !!moreMenu }" :title="t('更多')" :aria-label="t('更多')" :aria-expanded="!!moreMenu" @click="toggleMore"><JIcon :icon="ICONS.more" /></button>
      </div>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importJson" />

      <!-- 界面语言：首次按浏览器语言推断，选择后记在 localStorage（my-home:lang） -->
      <div v-if="!device.compactBar" class="group lang">
        <JIcon :icon="ICONS.language" class="ico-muted" />
        <select :value="lang" :title="t('界面语言')" aria-label="Language" @change="setLang(($event.target as HTMLSelectElement).value as Lang)">
          <option v-for="l in LANGS" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
        <!-- 快捷键、新手引导、作者 X、GitHub 仓库收在一个「更多」里，顶栏在 1280px 以上三语都能一行放下 -->
        <button ref="deskMoreBtn" class="icon-only more-btn" :class="{ on: !!moreMenu }" :title="t('更多')" :aria-label="t('更多')" :aria-expanded="!!moreMenu" @click="toggleMore"><JIcon :icon="ICONS.more" /></button>
      </div>
    </header>

    <!-- 视图内容比顶栏的高亮晚两帧切换：先画出「处理中」再搭 WebGL 场景 -->
    <main v-if="shownView === '2d'">
      <div class="stage">
        <PlanCanvas ref="canvas" />
        <!-- 楼层切换（多层户型）：左上角是带设置的楼层条，右侧是竖排的快速切换 -->
        <FloorBar />
        <FloorRail :style="{ '--sheet-h': layout.sheetH + 'px' }" />
        <!-- 放设备：设备面板 + 放置条（预览在画布里） -->
        <FixturePlacer :touch="device.coarse" :bottom="barBottom" @picked="device.coarse && canvas?.centerGhost()" @confirm="canvas?.confirmPlace()" />
        <!-- 缩放控件：滚轮 / 捏合之外的可见入口；点百分比回到 100% -->
        <div class="zoom">
          <button class="icon-only" :title="t('缩小')" :aria-label="t('缩小')" @click="canvas?.zoomBy(1 / 1.25)"><JIcon :icon="ICONS.zoomOut" :size="15" /></button>
          <button class="pct num" :title="t('回到 100%')" @click="canvas?.zoomReset()">{{ Math.round((canvas?.view.s ?? 1) * 100) }}%</button>
          <button class="icon-only" :title="t('放大')" :aria-label="t('放大')" @click="canvas?.zoomBy(1.25)"><JIcon :icon="ICONS.zoomIn" :size="15" /></button>
          <button class="icon-only" :title="t('适应视图') + ' (F)'" :aria-label="t('适应视图')" @click="canvas?.fit()"><JIcon :icon="ICONS.fit" :size="15" /></button>
        </div>
        <footer v-if="!device.compact" class="status">
          <span>{{ t(device.coarse ? (touchHints[tool] ?? '单指拖动空白处平移 · 双指缩放 · 点按选中，选中后拖动 · 长按弹出菜单') : hints[tool]) }}<b v-if="genMessage" class="warn"> · {{ genMessage }}</b></span>
          <span class="num">{{ canvas?.cursorInfo }}</span>
        </footer>
        <!-- 手机：画图工具的提示条 + 多边形的「撤销一点 / 取消 / 完成」 -->
        <div v-if="device.compact && (touchHints[tool] || genMessage)" class="touch-hint">
          <span v-if="touchHints[tool]">{{ t(touchHints[tool]!) }}</span>
          <b v-if="genMessage" class="warn">{{ genMessage }}</b>
        </div>
        <div v-if="tool === 'poly' && (device.coarse || device.compact)" class="poly-bar" :style="{ bottom: barBottom }">
          <span class="num poly-n">{{ t('{n} 个顶点', { n: canvas?.draftCount ?? 0 }) }}</span>
          <button :disabled="!canvas?.draftCount" @click="canvas?.undoPoint()"><JIcon :icon="ICONS.undo" />{{ t('撤销一点') }}</button>
          <button @click="canvas?.cancelDraft()"><JIcon :icon="ICONS.close" />{{ t('取消') }}</button>
          <button class="primary" :disabled="(canvas?.draftCount ?? 0) < 3" @click="canvas?.finishPoly()"><JIcon :icon="ICONS.check" />{{ t('完成') }}</button>
        </div>
        <!-- 手机：选中物体的浮动操作条 -->
        <div v-if="show2dBar" class="sel-bar" :style="{ bottom: barBottom }">
          <span class="sel-name">{{ selLabel }}</span>
          <button v-if="selection?.type === 'fixture'" class="icon-only" :title="t('旋转 90°')" :aria-label="t('旋转 90°')" @click="rotateSelectedFixture()"><JIcon :icon="ICONS.rotateCw" /></button>
          <button v-if="selection?.type === 'room'" class="icon-only" :title="t('复制')" :aria-label="t('复制')" @click="duplicateSelection()"><JIcon :icon="ICONS.duplicate" /></button>
          <button class="icon-only danger" :title="t('删除')" :aria-label="t('删除')" @click="deleteSelection()"><JIcon :icon="ICONS.delete" /></button>
          <button class="props-btn" @click="sheet2d = 'half'"><JIcon :icon="ICONS.generateOptions" />{{ t('属性') }}</button>
        </div>
      </div>
      <BottomSheet v-model="sheet2d" :enabled="device.compact" :label="t('属性')" class="sheet2d">
        <template v-if="device.compact" #header>
          <div class="tools2d">
            <button class="primary gen-btn" :title="t('随机生成')" @click="doGenerate()"><JIcon :icon="ICONS.generate" /><span>{{ t('生成') }}</span></button>
            <button class="icon-only" data-gen-toggle :class="{ on: genOpen }" :title="t('生成选项')" :aria-label="t('生成选项')" @click="genOpen = !genOpen"><JIcon :icon="ICONS.generateOptions" /></button>
            <span class="vsep" />
            <button v-for="tl in tools" :key="tl.id" class="icon-only tool" :class="{ on: tool === tl.id }" :title="t(tl.label)" :aria-label="t(tl.label)" :aria-pressed="tool === tl.id" @click="tool = tl.id">
              <JIcon :icon="TOOL_ICONS[tl.id]" :size="18" />
            </button>
          </div>
        </template>
        <InspectorPanel />
      </BottomSheet>
    </main>
    <main v-else-if="shownView === '3d'">
      <Sandbox3D />
    </main>
    <main v-else>
      <AssetLibrary />
    </main>

    <!-- 生成选项（精简顶栏）：底部面板 / 平板上的浮层 -->
    <Transition name="gs">
      <div v-if="genOpen && device.compactBar" class="gen-layer" @pointerdown.self="genOpen = false">
        <div ref="genSheet" class="gen-sheet" role="dialog" :aria-label="t('生成选项')">
          <header class="gen-head">
            <b class="ico-label"><JIcon :icon="ICONS.generateOptions" class="ico-muted" />{{ t('生成选项') }}</b>
            <button class="icon-only" :aria-label="t('关闭')" @click="genOpen = false"><JIcon :icon="ICONS.close" /></button>
          </header>
          <GenOptions @generate="doGenerate" />
          <button class="primary gen-go" @click="(genOpen = false), doGenerate()"><JIcon :icon="ICONS.generate" />{{ t('随机生成') }}</button>
        </div>
      </div>
    </Transition>
    <ContextMenu v-if="moreMenu" :x="moreMenu.x" :y="moreMenu.y" :items="device.compactBar ? moreItems : deskMoreItems" class="more-menu" @close="closeMore" />

    <SavedPlans @opened="onSavedOpened" />
    <SharePanel v-model="shareOpen" />
    <!-- 处理中：淡入带延迟，很快的操作不会闪；转圈是合成线程动画，主线程忙时也在转 -->
    <div v-if="busy.count" class="busy" role="status" aria-live="polite">
      <JIcon :icon="ICONS.loading" :size="16" class="spin" />
      <span>{{ busy.text }}</span>
    </div>
    <TooltipLayer />
    <ShortcutHelp />
    <Onboarding />
    <UpdatePrompt />
    <ChangelogPanel v-if="changelogOpen" @close="changelogOpen = false" />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  height: 100dvh;
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
/*
 * 顶栏要在一行放下：按宽度逐级把按钮收成纯图标（title / aria-label 仍有文字）。
 * 撤销 / 重做 / 适应一直是纯图标；工具和文件按钮 ≥2880px 才显示文字（日文 / 英文的按钮文字长，低于这个宽度会挤成两行）。
 */
.hist .lbl {
  display: none;
}
.hist button {
  padding: 0 8px;
}
@media (max-width: 2879px) {
  .tool span {
    display: none;
  }
  .tool {
    padding: 0 8px;
  }
}
@media (max-width: 2879px) {
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
.gen-toggle.on,
.more-btn.on,
[data-gen-toggle].on {
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
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
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
  max-width: calc(100vw - 32px);
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

/* ---------- 精简顶栏（手机 / 平板）：一行放下品牌、视图、撤销重做、保存、更多 ---------- */
:root.compact-bar .top {
  flex-wrap: nowrap;
  /* 状态栏下面再留 8px：贴着状态栏的话，iOS 全屏 / PWA 里系统的渐变磨砂会盖住顶栏上沿 */
  padding-top: calc(env(safe-area-inset-top, 0px) + 8px);
  padding-left: max(10px, env(safe-area-inset-left, 0px));
  padding-right: max(10px, env(safe-area-inset-right, 0px));
}
/* 主屏幕独立窗口（iPhone PWA，状态栏样式 default）：页面从状态栏下方开始，顶部安全区报告为 0，
   但系统会在状态栏下沿叠一层渐变磨砂压住页面最上面一小段——顶栏再往下让 10px */
@media (display-mode: standalone) {
  :root.compact-bar .top {
    padding-top: calc(env(safe-area-inset-top, 0px) + 18px);
  }
}
:root.compact-bar .top .views button.on .lbl {
  display: inline;
}
:root.compact-bar .top .icon-only {
  width: var(--control-h);
  padding: 0;
}
:root.compact-bar .gen-icon {
  color: var(--text-inverse);
}
/* 手机：顶栏空间留给视图切换和操作按钮，不放 logo */
:root.compact .brand {
  display: none;
}
:root.compact .top {
  gap: 6px;
}
:root.compact .group {
  border-left: 0;
  padding-left: 0;
  gap: 2px;
}
:root.compact .views {
  flex: 1 1 auto;
  min-width: 0;
}
:root.compact .top .views button {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 6px;
}
:root.compact .top .views button.on {
  flex: 2 1 auto;
}
:root.compact .top .views .lbl {
  overflow: hidden;
  text-overflow: ellipsis;
}
:root.compact .hist button {
  width: 40px;
  padding: 0;
  border-color: transparent;
  background: transparent;
}
/* 很窄（≤360px）：当前视图也只留图标 */
@media (max-width: 360px) {
  :root.compact .top .views button.on .lbl {
    display: none;
  }
}

/* ---------- 手机：平面图 ---------- */
:root.compact .zoom {
  top: 76px;
  right: 10px;
  bottom: auto;
  flex-direction: column;
  padding: 3px;
}
:root.compact .zoom button {
  width: 40px;
  height: 40px;
}
:root.compact .zoom .pct {
  min-width: 0;
  padding: 0;
  font-size: 11px;
}
:root:not(.compact) .sheet2d :deep(.panel) {
  height: 100%;
}
.tools2d {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tools2d::-webkit-scrollbar {
  display: none;
}
.tools2d button {
  flex: none;
  height: 44px;
  min-width: 44px;
  border-radius: 10px;
}
.tools2d .tool {
  border-color: transparent;
  background: transparent;
}
.tools2d .tool.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
}
.tools2d .gen-btn {
  padding: 0 14px;
  gap: 6px;
}
/* 很窄的手机：「生成选项」收进「更多」菜单，让六个工具一行放下 */
@media (max-width: 419px) {
  .tools2d [data-gen-toggle] {
    display: none;
  }
}
.tools2d .kind {
  flex: none;
  height: 44px;
  max-width: 150px;
  font: inherit;
  font-size: 16px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
}
.vsep {
  flex: none;
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--border);
}
.touch-hint {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  max-width: calc(100% - 120px);
  padding: 6px 12px;
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--text-muted);
  text-align: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border);
  border-radius: 99px;
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}
.touch-hint .warn {
  display: block;
}
.poly-bar,
.sel-bar {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 20px);
  padding: 4px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  transition: bottom 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.poly-bar button,
.sel-bar button {
  height: 44px;
  min-width: 44px;
  border-radius: 10px;
  gap: 6px;
}
.sel-bar .icon-only {
  border-color: transparent;
  background: transparent;
}
.poly-n {
  padding: 0 8px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  white-space: nowrap;
}
.sel-name {
  max-width: 120px;
  padding: 0 6px 0 10px;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 非手机（平板横屏）的多边形控件：浮在画布底部 */
:root:not(.compact) .poly-bar {
  bottom: 44px !important;
}

/* ---------- 生成选项：底部面板（手机）/ 右上浮层（平板） ---------- */
.gen-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(32, 38, 34, 0.24);
}
.gen-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 86dvh;
  overflow-y: auto;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -10px 30px rgba(32, 38, 34, 0.16);
  overscroll-behavior: contain;
}
:root:not(.compact) .gen-sheet {
  left: auto;
  right: 16px;
  bottom: auto;
  top: calc(var(--topbar, 60px) + 8px);
  width: 360px;
  border-radius: var(--radius-lg);
  padding-bottom: 16px;
}
:root.landscape .gen-sheet {
  left: auto;
  right: 8px;
  width: min(440px, 60vw);
}
.gen-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 10px;
  margin-bottom: 4px;
  background: var(--surface);
}
.gen-head b {
  font-size: var(--fs-md);
}
.gen-head button {
  width: 44px;
  height: 44px;
  border-color: transparent;
  background: transparent;
}
.gen-go {
  width: 100%;
  height: 48px;
  margin-top: 14px;
  font-size: var(--fs-base);
  gap: 8px;
}
.gs-enter-active,
.gs-leave-active {
  transition: opacity 0.2s ease;
}
.gs-enter-active .gen-sheet,
.gs-leave-active .gen-sheet {
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gs-enter-from,
.gs-leave-to {
  opacity: 0;
}
:root.compact .gs-enter-from .gen-sheet,
:root.compact .gs-leave-to .gen-sheet {
  transform: translateY(40px);
}
:root.compact .busy {
  top: calc(var(--topbar, 56px) + 10px);
}
</style>
