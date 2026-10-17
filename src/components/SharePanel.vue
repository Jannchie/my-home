<script setup lang="ts">
// 「分享链接」小面板：户型压进地址的 hash（src/share.ts），可选只户型 / 含家具，复制或调起系统分享。
import { computed, nextTick, ref, toRaw, watch } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import { lang, t } from '../i18n'
import { plan } from '../store'
import { toast } from '../saved'
import { encodeShare, SHARE_WARN_LENGTH, shareUrl, stripShareHash, type ShareMode } from '../share'

const open = defineModel<boolean>({ required: true })
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

const mode = ref<ShareMode>('full')
const links = ref<Record<ShareMode, string>>({ plan: '', full: '' })
const busy = ref(false)
const failed = ref(false)
const input = ref<HTMLInputElement>()
const hasFurniture = computed(() => plan.value.furniture.length > 0)
const link = computed(() => links.value[mode.value])
const tooLong = computed(() => link.value.length > SHARE_WARN_LENGTH)
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const fmtLen = (n: number) => n.toLocaleString(lang.value === 'zh' ? 'zh-CN' : lang.value)

/** 打开时把两种模式都编码好（几毫秒），切换时长度即时可见 */
async function build() {
  busy.value = true
  failed.value = false
  try {
    const p = JSON.parse(JSON.stringify(toRaw(plan.value)))
    // 当前地址（语言 + 视图路径 + 查询参数），去掉别的 #p
    const base = stripShareHash(location.href)
    const [a, b] = await Promise.all([encodeShare(p, 'plan'), encodeShare(p, 'full')])
    links.value = { plan: shareUrl(a, base), full: shareUrl(b, base) }
    // 默认含家具；没有家具或太长时默认只户型
    mode.value = hasFurniture.value && links.value.full.length <= SHARE_WARN_LENGTH ? 'full' : 'plan'
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
watch(open, (v) => v && void build(), { immediate: true })

async function copy() {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value)
    toast(t('已复制分享链接'))
    open.value = false
  } catch {
    // 剪贴板不可用（非安全上下文、权限被拒）：选中输入框里的链接让用户手动复制
    await nextTick()
    input.value?.focus()
    input.value?.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    if (ok) {
      toast(t('已复制分享链接'))
      open.value = false
    } else toast(t('没能自动复制，请手动复制选中的链接'), 'error')
  }
}

async function share() {
  if (!link.value) return
  try {
    await navigator.share({ title: plan.value.name || t('未命名户型'), url: link.value })
    open.value = false
  } catch (e) {
    // 用户取消分享不提示
    if ((e as Error)?.name !== 'AbortError') toast(t('分享失败：{msg}', { msg: (e as Error)?.message || String(e) }), 'error')
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
  }
  // 面板里的按键不触发编辑器快捷键
  e.stopPropagation()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sh-backdrop" @pointerdown.self="open = false" @keydown="onKey">
      <section class="sh" role="dialog" aria-modal="true" :aria-label="t('分享链接')">
        <header class="sh-head">
          <b class="ico-label"><JIcon :icon="ICONS.shareLink" class="ico-muted" />{{ t('分享链接') }}</b>
          <button class="icon-only sh-close" :aria-label="t('关闭')" @click="open = false"><JIcon :icon="ICONS.close" /></button>
        </header>
        <p class="sh-note">{{ t('户型数据都写在链接里，不经过服务器。对方打开链接就能看到这套户型。') }}</p>

        <div class="seg" role="radiogroup" :aria-label="t('分享内容')">
          <button role="radio" :aria-checked="mode === 'plan'" :class="{ on: mode === 'plan' }" @click="mode = 'plan'">
            <span>{{ t('只户型') }}</span>
            <small class="num">{{ links.plan ? t('{n} 字符', { n: fmtLen(links.plan.length) }) : '…' }}</small>
          </button>
          <button role="radio" :aria-checked="mode === 'full'" :class="{ on: mode === 'full' }" :disabled="!hasFurniture" :title="hasFurniture ? '' : t('当前户型里没有家具')" @click="mode = 'full'">
            <span>{{ t('包含家具') }}</span>
            <small class="num">{{ links.full && hasFurniture ? t('{n} 字符', { n: fmtLen(links.full.length) }) : '—' }}</small>
          </button>
        </div>
        <p class="sh-desc">{{ mode === 'plan' ? t('房间、门窗、设备、墙厚和朝向；不含家具、住户和墙纸。') : t('户型加上家具、配色、墙纸和住户设定。') }}</p>

        <p v-if="failed" class="sh-warn">{{ t('生成链接失败：这个浏览器不支持压缩。可以改用「导出 JSON」。') }}</p>
        <p v-else-if="tooLong" class="sh-warn">{{ t('链接很长（超过 {n} 字符），部分聊天软件可能截断。建议改用「只户型」，或用「导出 JSON」发送文件。', { n: fmtLen(SHARE_WARN_LENGTH) }) }}</p>

        <input ref="input" class="sh-link" readonly :value="busy ? '' : link" :placeholder="busy ? t('正在生成链接…') : ''" :aria-label="t('分享链接')" spellcheck="false" @focus="($event.target as HTMLInputElement).select()" />

        <div class="sh-actions">
          <button v-if="canShare" :disabled="busy || !link" @click="share"><JIcon :icon="ICONS.share" />{{ t('分享…') }}</button>
          <button v-focus class="primary" :disabled="busy || !link" @click="copy"><JIcon :icon="ICONS.copy" />{{ t('复制链接') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sh-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(32, 38, 34, 0.28);
}
.sh {
  width: min(440px, 100%);
  padding: 14px 18px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 48px rgba(32, 38, 34, 0.2);
}
.sh-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.sh-head b {
  font-size: var(--fs-md);
}
.sh-close {
  width: var(--control-h);
  height: var(--control-h);
  padding: 0;
  border-color: transparent;
  background: transparent;
}
.sh-note,
.sh-desc {
  margin: 0 0 12px;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-muted);
}
.sh-desc {
  margin: 8px 0 12px;
  font-size: var(--fs-xs);
}
.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 2px;
  background: var(--hover);
  border-radius: var(--radius);
}
.seg button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: auto;
  padding: 7px 8px;
  border-color: transparent;
  background: transparent;
  border-radius: var(--radius-sm);
}
.seg button.on {
  background: var(--surface);
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
  text-shadow: 0 0 0.6px currentColor;
}
.seg small {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-shadow: none;
}
.sh-warn {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border-radius: var(--radius-sm);
}
.sh-link {
  width: 100%;
  height: var(--control-h);
  padding: 0 10px;
  font: inherit;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-overflow: ellipsis;
}
.sh-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.sh-actions button {
  height: var(--control-h);
  gap: 6px;
}
:root.coarse .sh-actions button,
:root.coarse .sh-link,
:root.coarse .sh-close {
  height: 44px;
}
:root.coarse .sh-close {
  width: 44px;
}
:root.coarse .sh-link {
  font-size: 16px;
}
</style>
