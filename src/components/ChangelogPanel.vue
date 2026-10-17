<script setup lang="ts">
// 更新日志：只显示当前界面语言的那一份
import { JIcon } from '@jannchie/icons-vue'
import { CHANGELOG } from '../changelog'
import { lang, t } from '../i18n'
import { ICONS } from '../ui/icons'

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="cl-backdrop" @pointerdown.self="emit('close')" @keydown.esc="emit('close')">
    <div class="cl" role="dialog" aria-modal="true" :aria-label="t('更新日志')">
      <header>
        <b>{{ t('更新日志') }}</b>
        <button class="icon-only" :title="t('关闭')" :aria-label="t('关闭')" @click="emit('close')"><JIcon :icon="ICONS.close" :size="16" /></button>
      </header>
      <div class="body">
        <section v-for="r in CHANGELOG" :key="r.version">
          <h3>
            <span>v{{ r.version }}</span>
            <time class="num" :datetime="r.date">{{ r.date }}</time>
          </h3>
          <ul>
            <li v-for="(n, i) in r.notes[lang]" :key="i">{{ n }}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cl-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(30, 34, 32, 0.32);
}
.cl {
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.body {
  overflow: auto;
  padding: 4px 16px 16px;
}
h3 {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 16px 0 6px;
  font-size: var(--fs-md);
}
time {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--text-faint);
}
ul {
  margin: 0;
  padding-left: 1.2em;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-muted);
}
li + li {
  margin-top: 2px;
}
/* 手机：整屏，避开状态栏 / 底部横条 */
:root.compact .cl-backdrop {
  padding: 0;
}
:root.compact .cl {
  width: 100%;
  height: 100%;
  max-height: none;
  border: 0;
  border-radius: 0;
  padding-top: calc(env(safe-area-inset-top, 0px) + 8px);
  padding-bottom: var(--safe-b, env(safe-area-inset-bottom, 0px));
}
@media (display-mode: standalone) {
  :root.compact .cl {
    padding-top: calc(env(safe-area-inset-top, 0px) + 18px);
  }
}
</style>
