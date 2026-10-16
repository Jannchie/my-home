<script setup lang="ts">
// PWA 更新提示：新版本已下载好时在底部弹一条，点「刷新」切到新版本；第一次缓存完成时提示可以离线使用。
import { watch } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import { applyUpdate, dismissUpdate, pwa } from '../ui/pwa'
import { toast } from '../saved'
import { t } from '../i18n'

watch(
  () => pwa.offlineReady,
  (v) => {
    if (v) toast(t('已缓存，可以离线使用'))
  },
)
</script>

<template>
  <Transition name="up">
    <div v-if="pwa.needRefresh" class="up" role="status" aria-live="polite">
      <JIcon :icon="ICONS.refresh" class="ico" />
      <span class="msg">{{ t('有新版本可用') }}</span>
      <button class="primary" @click="applyUpdate">{{ t('刷新') }}</button>
      <button class="icon-only x" :aria-label="t('稍后')" :title="t('稍后')" @click="dismissUpdate"><JIcon :icon="ICONS.close" :size="14" /></button>
    </div>
  </Transition>
</template>

<style scoped>
.up {
  position: fixed;
  left: 50%;
  top: calc(var(--topbar, 56px) + 10px);
  transform: translateX(-50%);
  z-index: 115;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 24px);
  padding: 6px 6px 6px 14px;
  font-size: var(--fs-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 99px;
  box-shadow: var(--shadow);
}
.ico {
  color: var(--accent);
}
.msg {
  white-space: nowrap;
}
/* Nunito 的下沉区留得多，字形落在行框偏上约 0.13em：文字往下挪一点，笔画中心才和图标、关闭键对齐 */
.msg {
  transform: translateY(0.13em);
}
.up button {
  height: 32px;
  border-radius: 99px;
  /* 按钮固定高度：内容要真正垂直居中（默认是块级，文字贴着上内边距排） */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-top: 0;
  padding-bottom: 0;
}
.up .primary {
  padding-top: 0.26em;
}
:root.coarse .up button {
  height: 36px;
  min-width: 36px;
}
.x {
  border-color: transparent;
  background: transparent;
}
.up-enter-active,
.up-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.up-enter-from,
.up-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}
</style>
