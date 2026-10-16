<script setup lang="ts">
// 新手引导：第一次打开时在右下角弹一张小卡片，三步说明主要流程，点哪一步就直接去哪。
// 关掉后记在 localStorage（my-home:welcomed），之后可以从快捷键帮助里再看到这些操作。
import { computed, onMounted } from 'vue'
import { device } from '../ui/device'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS, VIEW_ICONS } from '../ui/icons'
import { overlays } from '../ui/feedback'
import { viewMode, type ViewMode } from '../store'
import { t } from '../i18n'

const KEY = 'my-home:welcomed'

// 触屏上的说法换成「点按 / 长按 / 双指」
const steps = computed<{ view: ViewMode; label: string; desc: string }[]>(() => [
  { view: '2d', label: '画户型', desc: device.coarse ? '在平面图里画房间、放门窗，或者点「生成」先来一套；单指拖动画布，双指缩放。' : '在平面图里画房间、放门窗，或者点「随机生成」先来一套。' },
  { view: '3d', label: '布置家具', desc: device.coarse ? '到 3D 沙盘点「一键布置家具」；点家具选中，再按住拖动，双指拧转旋转，长按弹出菜单。' : '到 3D 沙盘点「一键布置家具」，再拖动、旋转、换配色。' },
  { view: 'lib', label: '挑素材', desc: device.coarse ? '在素材库按风格和尺寸挑家具，点「放进沙盘」摆进 3D 沙盘。' : '在素材库按风格和尺寸挑家具，双击卡片放进沙盘。' },
])

onMounted(() => {
  try {
    if (!localStorage.getItem(KEY)) overlays.onboarding = true
  } catch {
    /* 存储不可用：不打扰 */
  }
})

function dismiss() {
  overlays.onboarding = false
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* 存不了就下次再提示 */
  }
}
function go(v: ViewMode) {
  viewMode.value = v
}
function openHelp() {
  overlays.help = true
  dismiss()
}
</script>

<template>
  <Transition name="ob">
    <aside v-if="overlays.onboarding" class="ob" role="dialog" :aria-label="t('欢迎使用 My Home')">
      <header>
        <JIcon :icon="ICONS.tip" class="ico-accent" />
        <b>{{ t('欢迎使用 My Home') }}</b>
        <button class="icon-only x" :aria-label="t('关闭')" @click="dismiss"><JIcon :icon="ICONS.close" :size="14" /></button>
      </header>
      <ol>
        <li v-for="(s, i) in steps" :key="s.view">
          <button class="step" :class="{ on: viewMode === s.view }" @click="go(s.view)">
            <span class="n num">{{ i + 1 }}</span>
            <JIcon :icon="VIEW_ICONS[s.view]" class="ico-muted" />
            <span class="txt">
              <b>{{ t(s.label) }}</b>
              <span>{{ t(s.desc) }}</span>
            </span>
          </button>
        </li>
      </ol>
      <footer>
        <button @click="openHelp"><JIcon :icon="ICONS.keyboard" />{{ device.coarse ? t('查看手势') : t('查看快捷键') }}</button>
        <button class="primary" @click="dismiss">{{ t('开始使用') }}</button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.ob {
  position: fixed;
  /* 左下角：压在画布上，不挡右侧属性面板 */
  left: 16px;
  bottom: 40px;
  z-index: 40;
  width: 340px;
  max-width: calc(100vw - 32px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 14px 40px rgba(32, 38, 34, 0.16);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 8px 16px;
}
header b {
  font-size: var(--fs-md);
}
.ico-accent {
  color: var(--accent);
}
.x {
  margin-left: auto;
  border-color: transparent;
  background: transparent;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0 8px;
}
.step {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  text-align: left;
  white-space: normal;
  border-color: transparent;
  background: transparent;
  line-height: 1.45;
}
.step.on {
  background: var(--accent-weak);
}
.step > svg {
  margin-top: 2px;
}
.n {
  flex: none;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-inverse);
  background: var(--accent);
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.txt span {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px 14px;
}
.ob-enter-active,
.ob-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.ob-enter-from,
.ob-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
/* 手机：贴底部的整宽卡片，压在底部抽屉上面 */
:root.compact .ob {
  left: 8px;
  right: 8px;
  bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-width: none;
  z-index: 45;
}
:root.coarse .step {
  min-height: 52px;
}
:root.coarse footer button,
:root.coarse .x {
  height: 44px;
  min-width: 44px;
}
</style>
