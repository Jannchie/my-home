<script setup lang="ts">
// 「我的户型」面板：保存 / 另存为、存档卡片网格（打开 / 重命名 / 复制 / 删除）、自动快照恢复，
// 以及全局的应用内确认框和提示条。常驻挂载，面板开关由 saved.panelOpen 控制。
import { computed, nextTick, ref, watch } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS, VIEW_ICONS } from '../ui/icons'
import { lang, t } from '../i18n'
import { plan } from '../store'
import {
  ask,
  currentSaved,
  deleteSaved,
  duplicateSaved,
  openSaved,
  renameSaved,
  restoreSnapshot,
  saveCurrent,
  saved,
  thumbUrl,
  toast,
  type SavedMeta,
  type SnapshotMeta,
} from '../saved'

const emit = defineEmits<{ opened: [] }>()

/** 确认框出现时把焦点放到主按钮上（Enter 确认、Esc 取消） */
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

const tab = ref<'plans' | 'snapshots'>('plans')
const query = ref('')
const saveName = ref('')
const nameInput = ref<HTMLInputElement>()
const root = ref<HTMLElement>()

const linked = computed(() => currentSaved())

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return saved.list
  return saved.list.filter((m) => m.name.toLowerCase().includes(q) || m.layout.toLowerCase().includes(q))
})

const status = computed(() => {
  const m = linked.value
  if (!m) return { text: t('还没有保存过'), kind: 'new' }
  if (saved.dirty) return { text: t('「{name}」有未保存的修改', { name: m.name }), kind: 'dirty' }
  return { text: t('已保存到「{name}」', { name: m.name }), kind: 'clean' }
})

// 面板打开：名字输入框填上默认名（关联存档的名字，否则户型名），按需聚焦
watch(
  () => saved.panelOpen,
  async (open) => {
    if (!open) return
    saveName.value = linked.value?.name ?? plan.value.name
    query.value = ''
    await nextTick()
    root.value?.focus()
  },
)
watch(
  () => saved.focusSave,
  async () => {
    tab.value = 'plans'
    await nextTick()
    nameInput.value?.focus()
    nameInput.value?.select()
  },
)

function close() {
  if (saved.confirm) return
  saved.panelOpen = false
  renaming.value = null
}

// ---------- 保存 ----------

async function doSave() {
  const id = await saveCurrent({ name: saveName.value })
  if (id) saveName.value = linked.value?.name ?? saveName.value
}
async function doSaveAs() {
  const id = await saveCurrent({ name: saveName.value, asNew: true })
  if (id) saveName.value = linked.value?.name ?? saveName.value
}
function onNameEnter() {
  if (linked.value) void doSave()
  else void doSaveAs()
}

// ---------- 打开 ----------

/** 有未保存的修改时确认；返回 false 表示用户取消（或「先保存」失败） */
async function confirmReplace(title: string): Promise<boolean> {
  if (!saved.dirty) return true
  const m = linked.value
  const c = await ask({
    title,
    // 中日文句子之间不加空格，英文加
    message: [m ? t('「{name}」有未保存的修改。', { name: m.name }) : t('当前户型还没有保存。'), t('直接打开也没关系：可以用「撤销」找回，自动快照里也会留一份。')].join(lang.value === 'en' ? ' ' : ''),
    ok: t('直接打开'),
    alt: t('先保存再打开'),
  })
  if (c === 'cancel') return false
  if (c === 'alt') return !!(await saveCurrent(m ? {} : { asNew: true }))
  return true
}

async function open(m: SavedMeta) {
  if (saved.busy) return
  if (m.id === saved.currentId && !saved.dirty) {
    close()
    return
  }
  if (!(await confirmReplace(t('打开「{name}」？', { name: m.name })))) return
  if (await openSaved(m.id)) {
    saved.panelOpen = false
    toast(t('已打开「{name}」', { name: m.name }))
    emit('opened')
  }
}

async function restore(s: SnapshotMeta) {
  if (!(await confirmReplace(t('恢复这个快照？')))) return
  if (await restoreSnapshot(s.id)) {
    saved.panelOpen = false
    toast(t('已恢复 {time} 的快照', { time: fmtTime(s.createdAt) }))
    emit('opened')
  }
}

// ---------- 重命名 / 复制 / 删除 ----------

const renaming = ref<string | null>(null)
const renameText = ref('')
async function startRename(m: SavedMeta) {
  renaming.value = m.id
  renameText.value = m.name
  await nextTick()
  const el = root.value?.querySelector<HTMLInputElement>('.rename')
  el?.focus()
  el?.select()
}
async function commitRename() {
  const id = renaming.value
  if (!id) return
  renaming.value = null
  await renameSaved(id, renameText.value)
  if (id === saved.currentId) saveName.value = linked.value?.name ?? saveName.value
}

async function remove(m: SavedMeta) {
  const c = await ask({
    title: t('删除「{name}」？', { name: m.name }),
    message: t('删除后无法恢复。当前正在编辑的户型不受影响。'),
    ok: t('删除'),
    danger: true,
  })
  if (c === 'ok') {
    await deleteSaved(m.id)
    toast(t('已删除「{name}」', { name: m.name }))
  }
}

// ---------- 键盘 ----------

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (saved.confirm) saved.confirm.resolve('cancel')
    else if (renaming.value) renaming.value = null
    else close()
  }
  // Ctrl / Cmd + S 交给 App 统一处理；其他按键不往外传，免得触发编辑器快捷键（删除选中物体等）
  if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) e.stopPropagation()
}

// ---------- 显示 ----------

const LOCALES = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' } as const
const fmt = computed(() => ({
  thisYear: new Intl.DateTimeFormat(LOCALES[lang.value], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  other: new Intl.DateTimeFormat(LOCALES[lang.value], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
}))
function fmtTime(ms: number) {
  const d = new Date(ms)
  return (d.getFullYear() === new Date().getFullYear() ? fmt.value.thisYear : fmt.value.other).format(d)
}
const metaLine = (m: { area: number; layout: string; furniture: number }) =>
  [`${m.area.toFixed(1)} ㎡`, m.layout, t('家具 {n} 件', { n: m.furniture })].filter(Boolean).join(' · ')
</script>

<template>
  <Teleport to="body">
    <div class="sp-layer" @keydown="onKey">
      <div v-if="saved.panelOpen" class="sp-backdrop" @pointerdown.self="close">
        <section ref="root" class="sp" role="dialog" aria-modal="true" :aria-label="t('我的户型')" tabindex="-1">
          <header class="sp-head">
            <h2 class="ico-label"><JIcon :icon="ICONS.savedPlans" :size="20" />{{ t('我的户型') }}</h2>
            <span class="sp-where">{{ t('保存在这个浏览器里，换浏览器或清除网站数据后会丢失；重要的户型请另外「导出 JSON」。') }}</span>
            <button class="icon-only sp-close" :title="t('关闭') + ' (Esc)'" :aria-label="t('关闭')" @click="close"><JIcon :icon="ICONS.close" :size="18" /></button>
          </header>

          <p v-if="saved.unavailable" class="sp-banner" role="alert">{{ saved.unavailable }}</p>

          <!-- 保存当前户型 -->
          <div class="sp-save">
            <div class="cur">
              <span class="cur-label">{{ t('当前户型') }}</span>
              <span class="cur-state" :class="status.kind"><i class="dot" />{{ status.text }}</span>
            </div>
            <div class="save-row">
              <input
                ref="nameInput"
                v-model="saveName"
                class="name-input"
                :placeholder="t('户型名称')"
                :aria-label="t('户型名称')"
                maxlength="80"
                :disabled="!!saved.unavailable"
                @keydown.enter.prevent="onNameEnter"
              />
              <template v-if="linked">
                <button class="primary" :disabled="saved.busy || !!saved.unavailable" :title="t('覆盖「{name}」', { name: linked.name }) + ' (Ctrl S)'" @click="doSave"><JIcon :icon="ICONS.save" />{{ t('保存') }}</button>
                <button :disabled="saved.busy || !!saved.unavailable" :title="t('另存为一份新的户型') + ' (Ctrl Shift S)'" @click="doSaveAs"><JIcon :icon="ICONS.duplicate" />{{ t('另存为') }}</button>
              </template>
              <button v-else class="primary" :disabled="saved.busy || !!saved.unavailable" :title="t('保存为新户型') + ' (Ctrl S)'" @click="doSaveAs"><JIcon :icon="ICONS.save" />{{ t('保存为新户型') }}</button>
              <span v-if="saved.busy" class="busy">{{ t('保存中…') }}</span>
            </div>
          </div>

          <nav class="sp-tabs">
            <div class="seg" role="tablist">
              <button role="tab" :aria-selected="tab === 'plans'" :class="{ on: tab === 'plans' }" @click="tab = 'plans'">
                <JIcon :icon="ICONS.savedPlans" />{{ t('存档') }}<span class="cnt num">{{ saved.list.length }}</span>
              </button>
              <button role="tab" :aria-selected="tab === 'snapshots'" :class="{ on: tab === 'snapshots' }" @click="tab = 'snapshots'">
                <JIcon :icon="ICONS.restore" />{{ t('自动快照') }}<span class="cnt num">{{ saved.snapshots.length }}</span>
              </button>
            </div>
            <label v-if="tab === 'plans'" class="search">
              <JIcon :icon="ICONS.search" class="ico-muted" />
              <input v-model="query" type="search" :placeholder="t('搜索名称或房型')" :aria-label="t('搜索名称或房型')" />
            </label>
          </nav>

          <div class="sp-body">
            <template v-if="tab === 'plans'">
              <div v-if="saved.loaded && !saved.list.length" class="empty">
                <JIcon :icon="VIEW_ICONS['2d']" :size="40" class="ico-muted" />
                <p>{{ t('还没有保存的户型。') }}</p>
                <p class="hint">{{ t('在上面起个名字点「保存」，或随时按 Ctrl / ⌘ + S。') }}</p>
              </div>
              <div v-else-if="saved.list.length && !filtered.length" class="empty">
                <p>{{ t('没有找到匹配的户型') }}</p>
              </div>
              <div v-else class="grid">
                <article v-for="m in filtered" :key="m.id" class="card" :class="{ current: m.id === saved.currentId }">
                  <button class="thumb" :title="t('打开')" :aria-label="t('打开「{name}」', { name: m.name })" @click="open(m)">
                    <img v-if="m.thumb" :src="thumbUrl(m)" alt="" loading="lazy" />
                    <JIcon v-else :icon="VIEW_ICONS['2d']" :size="36" class="ico-muted" />
                    <span v-if="m.id === saved.currentId" class="badge">{{ saved.dirty ? t('编辑中 · 未保存') : t('编辑中') }}</span>
                  </button>
                  <div class="card-body">
                    <input
                      v-if="renaming === m.id"
                      v-model="renameText"
                      class="rename"
                      maxlength="80"
                      :aria-label="t('重命名')"
                      @keydown.enter.prevent="commitRename"
                      @blur="commitRename"
                    />
                    <h3 v-else class="name" :title="m.name" @dblclick="startRename(m)">{{ m.name }}</h3>
                    <p class="meta num">{{ metaLine(m) }}</p>
                    <p class="time num">{{ t('更新于 {time}', { time: fmtTime(m.updatedAt) }) }}</p>
                  </div>
                  <div class="card-actions">
                    <button class="open-btn" :disabled="saved.busy" @click="open(m)">{{ t('打开') }}</button>
                    <span class="spacer" />
                    <button class="icon-only" :title="t('重命名')" :aria-label="t('重命名')" @click="startRename(m)"><JIcon :icon="ICONS.rename" /></button>
                    <button class="icon-only" :title="t('复制')" :aria-label="t('复制')" @click="duplicateSaved(m.id)"><JIcon :icon="ICONS.duplicate" /></button>
                    <button class="icon-only danger" :title="t('删除')" :aria-label="t('删除')" @click="remove(m)"><JIcon :icon="ICONS.delete" /></button>
                  </div>
                </article>
              </div>
            </template>

            <template v-else>
              <p class="snap-note">{{ t('编辑时每隔几分钟自动记一份（内容有变化才记），打开别的户型前也会先记一份；只保留最近 5 份。') }}</p>
              <div v-if="!saved.snapshots.length" class="empty">
                <JIcon :icon="ICONS.restore" :size="36" class="ico-muted" />
                <p>{{ t('还没有自动快照') }}</p>
              </div>
              <ul v-else class="snaps">
                <li v-for="s in saved.snapshots" :key="s.id">
                  <span class="snap-time num">{{ fmtTime(s.createdAt) }}</span>
                  <span class="snap-main">
                    <b :title="s.name">{{ s.name }}</b>
                    <span class="meta num">{{ metaLine(s) }}</span>
                  </span>
                  <button @click="restore(s)"><JIcon :icon="ICONS.restore" />{{ t('恢复') }}</button>
                </li>
              </ul>
            </template>
          </div>
        </section>
      </div>

      <!-- 应用内确认框 -->
      <div v-if="saved.confirm" class="sp-backdrop confirm-layer" @pointerdown.self="saved.confirm.resolve('cancel')">
        <div class="confirm" role="alertdialog" aria-modal="true" :aria-label="saved.confirm.title">
          <h3>{{ saved.confirm.title }}</h3>
          <p>{{ saved.confirm.message }}</p>
          <div class="confirm-actions">
            <button @click="saved.confirm.resolve('cancel')">{{ t('取消') }}</button>
            <button v-if="saved.confirm.alt" @click="saved.confirm.resolve('alt')">{{ saved.confirm.alt }}</button>
            <button v-focus :class="saved.confirm.danger ? 'danger-solid' : 'primary'" @click="saved.confirm.resolve('ok')">{{ saved.confirm.ok }}</button>
          </div>
        </div>
      </div>
    </div>

    <Transition name="sp-toast">
      <div v-if="saved.toast" :key="saved.toast.id" class="sp-toast" :class="saved.toast.kind" role="status" aria-live="polite">{{ saved.toast.text }}</div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: rgba(36, 40, 37, 0.28);
}
.sp {
  width: min(1040px, 100%);
  height: min(780px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 48px rgba(32, 38, 34, 0.18);
  overflow: hidden;
  outline: none;
}
.sp-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px 12px;
}
.sp-head h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 700;
  gap: 8px;
  white-space: nowrap;
}
.sp-where {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.sp-close {
  border-color: transparent;
  background: transparent;
  height: var(--control-h);
  width: var(--control-h);
}
.sp-banner {
  margin: 0 20px 12px;
  padding: 10px 14px;
  font-size: var(--fs-sm);
  color: var(--danger);
  background: var(--danger-weak);
  border-radius: var(--radius);
}

/* 保存区 */
.sp-save {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin: 0 20px;
  padding: 14px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.cur {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 220px;
}
.cur-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.cur-state {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-base);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
}
.cur-state.clean .dot {
  background: var(--ok);
}
.cur-state.dirty .dot {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.save-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 420px;
  justify-content: flex-end;
}
.save-row button,
.name-input,
.search input,
.seg button,
.card-actions button,
.snaps button,
.confirm button {
  height: var(--control-h);
}
.name-input {
  flex: 1;
  min-width: 0;
  max-width: 360px;
  padding: 0 10px;
  font: inherit;
  font-size: var(--fs-base);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.busy {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

/* 标签页 + 搜索 */
.sp-tabs {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px 10px;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  height: var(--control-h);
  background: var(--hover);
  border-radius: var(--radius);
}
.seg button {
  height: 100%;
  border-color: transparent;
  background: transparent;
  padding: 0 12px;
}
.seg button.on {
  background: var(--surface);
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
  text-shadow: 0 0 0.6px currentColor;
}
.cnt {
  margin-left: 2px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  width: min(280px, 45%);
  padding-left: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text);
  padding: 0 8px 0 0;
}
.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}

/* 列表 */
.sp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 20px 20px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}
.card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.card.current {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-ring);
}
.thumb {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 10;
  width: 100%;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: linear-gradient(180deg, #f4f3ee 0%, #ecebe5 100%);
  overflow: hidden;
}
.thumb:hover:not(:disabled) {
  background: linear-gradient(180deg, #f4f3ee 0%, #ecebe5 100%);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-inverse);
  background: var(--accent);
  border-radius: 999px;
}
.card-body {
  padding: 10px 12px 4px;
  min-width: 0;
}
.name {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}
.rename {
  width: 100%;
  height: 28px;
  padding: 0 6px;
  margin: -2px 0 0 -7px;
  font: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.meta {
  margin: 4px 0 0;
  font-size: var(--fs-sm);
  color: var(--text);
}
.time {
  margin: 2px 0 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px 10px;
}
.card-actions .icon-only {
  width: var(--control-h);
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
}
.card-actions .icon-only:hover:not(:disabled) {
  color: var(--text);
}
.card-actions .icon-only.danger:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-weak);
}
.open-btn {
  padding: 0 16px;
}
.spacer {
  flex: 1;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 56px 0;
  color: var(--text);
  font-size: var(--fs-base);
}
.empty p {
  margin: 0;
}
.empty .hint {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

/* 快照 */
.snap-note {
  margin: 0 0 10px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.snaps {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.snaps li {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
}
.snaps li + li {
  border-top: 1px solid var(--border);
}
.snap-time {
  flex: none;
  min-width: 128px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.snap-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.snap-main b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.snap-main .meta {
  margin: 0;
  color: var(--text-muted);
}

/* 确认框 */
.confirm-layer {
  z-index: 110;
}
.confirm {
  width: min(420px, 100%);
  padding: 20px 22px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 48px rgba(32, 38, 34, 0.2);
}
.confirm h3 {
  margin: 0 0 8px;
  font-size: var(--fs-md);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.confirm p {
  margin: 0 0 18px;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-muted);
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.danger-solid {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--text-inverse);
  font-weight: 600;
}
.danger-solid:hover:not(:disabled) {
  background: #9e3a44;
  border-color: #9e3a44;
}

/* 提示条 */
.sp-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 120;
  transform: translateX(-50%);
  max-width: min(560px, calc(100vw - 32px));
  padding: 10px 16px;
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--text-inverse);
  background: #2f3631;
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(32, 38, 34, 0.22);
}
.sp-toast.error {
  background: var(--danger);
}
.sp-toast-enter-active,
.sp-toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.sp-toast-enter-from,
.sp-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (max-width: 640px) {
  .sp-backdrop {
    padding: 12px;
  }
  .sp-where {
    display: none;
  }
  .sp-head,
  .sp-tabs {
    padding-left: 14px;
    padding-right: 14px;
  }
  .sp-save {
    margin: 0 14px;
  }
  .sp-body {
    padding: 6px 14px 14px;
  }
  .sp-tabs {
    flex-wrap: wrap;
  }
  .search {
    width: 100%;
  }
  .save-row {
    flex-wrap: wrap;
  }
  .name-input {
    max-width: none;
    flex-basis: 100%;
  }
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }
  .snap-time {
    min-width: 0;
  }
}
/* 手机（compact）：整屏面板，避开刘海 / 底部横条；提示条让开底部抽屉 */
:root.compact .sp-backdrop:not(.confirm-layer) {
  padding: 0;
}
:root.compact .sp {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
:root.compact .sp-close {
  width: 44px;
  height: 44px;
  margin-left: auto;
}
:root.compact .grid {
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
:root.compact .card-actions .icon-only {
  width: 40px;
}
:root.coarse .save-row button,
:root.coarse .name-input,
:root.coarse .search input,
:root.coarse .seg button,
:root.coarse .card-actions button,
:root.coarse .snaps button,
:root.coarse .confirm button {
  height: 44px;
}
:root.compact .sp-toast {
  bottom: calc(var(--toast-bottom, 96px) + env(safe-area-inset-bottom, 0px));
}
</style>
