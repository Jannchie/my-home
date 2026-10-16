<script setup lang="ts">
// 快捷键帮助：按 ? 或点顶栏的键盘按钮打开，按当前视图把对应分组排在前面。
import { computed, nextTick, ref, watch } from 'vue'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'
import { overlays } from '../ui/feedback'
import { viewMode } from '../store'
import { t } from '../i18n'
import { device } from '../ui/device'

/** 鼠标 / 触控板动作：显示成文字按键 */
const MOUSE: Record<string, { label: string }> = {
  drag: { label: '拖动' },
  rdrag: { label: '右键拖动' },
  rclick: { label: '右键' },
  wheel: { label: '滚轮' },
  dbl: { label: '双击' },
  pinch: { label: '双指捏合' },
  swipe: { label: '双指滑动' },
  click: { label: '点击' },
  tap: { label: '点按' },
  press: { label: '长按' },
  drag1: { label: '单指拖动' },
  drag2: { label: '双指拖动' },
  twist: { label: '双指拧转' },
}
const ARROWS = '↑ ↓ ← →'

interface Row {
  keys: string[][] // 多组按键之间是「或」
  label: string
}
interface Group {
  id: 'common' | '2d' | '3d' | 'touch'
  label: string
  rows: Row[]
}

/** 触屏手势（手机 / 平板上排在最前面） */
const TOUCH: Group = {
  id: 'touch',
  label: '触屏手势',
  rows: [
    { keys: [['drag1']], label: '平面图：拖动空白处移动画布；3D：旋转视角' },
    { keys: [['pinch'], ['drag2']], label: '缩放 / 平移视图' },
    { keys: [['tap']], label: '选中房间、门窗、设备或家具；点空白处取消选中' },
    { keys: [['press']], label: '弹出快捷菜单（复制 / 删除 / 旋转…）' },
    { keys: [['tap', 'drag1']], label: '3D：选中家具后按住拖动来移动它' },
    { keys: [['twist']], label: '3D：拖着家具时再放一根手指拧转，旋转家具' },
    { keys: [['press', 'drag1']], label: '长按家具栏的卡片，直接拖进场景' },
    { keys: [['tap']], label: '多边形房间：逐点点按，点「完成」闭合' },
  ],
}

const GROUPS: Group[] = [
  {
    id: 'common',
    label: '通用',
    rows: [
      { keys: [['1'], ['2'], ['3']], label: '切换到平面图 / 3D 沙盘 / 素材库' },
      { keys: [['Ctrl', 'S']], label: '保存到「我的户型」' },
      { keys: [['Ctrl', 'Shift', 'S']], label: '另存为' },
      { keys: [['Ctrl', 'Z']], label: '撤销' },
      { keys: [['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']], label: '重做' },
      { keys: [['Ctrl', 'D']], label: '复制选中的物体' },
      { keys: [['Del'], ['Backspace']], label: '删除选中的物体' },
      { keys: [['?']], label: '打开 / 关闭快捷键帮助' },
    ],
  },
  {
    id: '2d',
    label: '平面图',
    rows: [
      { keys: [['V'], ['R'], ['P']], label: '选择 / 矩形房间 / 多边形房间' },
      { keys: [['D'], ['W'], ['K']], label: '门 / 窗 / 设备' },
      { keys: [['F']], label: '适应视图' },
      { keys: [['G']], label: '随机生成' },
      { keys: [['Q']], label: '旋转选中的设备' },
      { keys: [[ARROWS]], label: '微移选中的房间 / 设备 / 门窗（Shift 加大步长）' },
      { keys: [['Space', 'drag'], ['rdrag'], ['swipe']], label: '平移画布' },
      { keys: [['wheel'], ['pinch']], label: '以光标为中心缩放' },
      { keys: [['dbl']], label: '在房间边上插入顶点' },
      { keys: [['Enter'], ['dbl']], label: '闭合多边形' },
      { keys: [['Shift']], label: '画多边形时保持正交' },
      { keys: [['Esc']], label: '取消绘制 / 回到选择 / 取消选中' },
    ],
  },
  {
    id: '3d',
    label: '3D 沙盘',
    rows: [
      { keys: [['drag']], label: '旋转视角' },
      { keys: [['rdrag']], label: '平移视角' },
      { keys: [['wheel']], label: '缩放视角' },
      { keys: [['dbl']], label: '聚焦到家具' },
      { keys: [['rclick']], label: '家具的快捷菜单' },
      { keys: [['P']], label: '布置 / 预览' },
      { keys: [['F']], label: '重置视角' },
      { keys: [['C']], label: '切换墙体显示' },
      { keys: [['Q'], ['E']], label: '旋转 90°（按住 Shift 为 15°）' },
      { keys: [['R', 'drag']], label: '自由旋转（按住 Shift 每 15° 吸附）' },
      { keys: [[ARROWS]], label: '按视角方向微移家具（Shift 加大步长）' },
      { keys: [['Alt', 'drag']], label: '拖动时临时关闭吸附' },
      { keys: [['Shift', 'click']], label: '连续摆放同一件家具' },
      { keys: [['Esc']], label: '取消摆放 / 取消选中' },
    ],
  },
]

// 当前视图的分组排在通用之后、最显眼的位置；触屏设备把手势放最前面
const groups = computed(() => {
  const cur = viewMode.value === '2d' ? '2d' : '3d'
  const order = ['touch', 'common', cur, cur === '2d' ? '3d' : '2d']
  return [...(device.coarse ? [TOUCH] : []), ...GROUPS].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
})
const isCurrent = (g: Group) => g.id === (viewMode.value === '2d' ? '2d' : '3d')
const keyText = (k: string) => (MOUSE[k] ? t(MOUSE[k].label) : k)
const isMouse = (k: string) => !!MOUSE[k]

const closeBtn = ref<HTMLButtonElement>()
watch(
  () => overlays.help,
  async (v) => {
    if (v) {
      await nextTick()
      closeBtn.value?.focus()
    }
  },
)
function close() {
  overlays.help = false
}
</script>

<template>
  <Transition name="sh">
    <div v-if="overlays.help" class="sh-layer" @pointerdown.self="close" @keydown.esc.stop="close">
      <div class="sh" role="dialog" aria-modal="true" :aria-label="t('快捷键')">
        <header>
          <h2 class="ico-label"><JIcon :icon="ICONS.keyboard" class="ico-muted" />{{ device.coarse ? t('手势与快捷键') : t('快捷键') }}</h2>
          <span v-if="!device.coarse" class="sub">{{ t('在任意位置按 ? 打开') }}</span>
          <button ref="closeBtn" class="icon-only close" :aria-label="t('关闭')" @click="close"><JIcon :icon="ICONS.close" /></button>
        </header>
        <div class="cols">
          <section v-for="g in groups" :key="g.id" :class="{ cur: isCurrent(g) }">
            <h3>
              {{ t(g.label) }}<span v-if="isCurrent(g)" class="here">{{ t('当前') }}</span>
            </h3>
            <div v-for="(r, i) in g.rows" :key="i" class="row">
              <span class="keys">
                <template v-for="(combo, j) in r.keys" :key="j">
                  <span v-if="j" class="or">/</span>
                  <span class="combo">
                    <template v-for="(k, n) in combo" :key="n">
                      <span v-if="n" class="plus">+</span>
                      <kbd :class="{ mouse: isMouse(k) }">{{ keyText(k) }}</kbd>
                    </template>
                  </span>
                </template>
              </span>
              <span class="label">{{ t(r.label) }}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sh-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(32, 38, 34, 0.28);
}
.sh {
  width: min(1080px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 50px rgba(32, 38, 34, 0.18);
}
header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
h2 {
  margin: 0;
  font-size: var(--fs-lg);
}
.sub {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.close {
  margin-left: auto;
  border-color: transparent;
  background: transparent;
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0;
}
section {
  padding: 14px 18px 18px;
  border-right: 1px solid var(--border);
}
section:last-child {
  border-right: none;
}
section.cur {
  background: var(--surface-2);
}
h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: var(--fs-md);
}
.here {
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--accent-strong);
  background: var(--accent-weak);
  border-radius: 99px;
  padding: 0 8px;
  line-height: 20px;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 4px 12px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--border);
}
.row:last-child {
  border-bottom: none;
}
.keys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 128px;
}
.combo {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.or,
.plus {
  color: var(--text-faint);
  font-size: var(--fs-xs);
}
kbd {
  margin: 0;
  display: inline-block;
  min-width: 22px;
  padding: 0 6px;
  text-align: center;
  line-height: 20px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 5px;
  white-space: nowrap;
}
/* 鼠标动作是文字说明，不用等宽字体 */
kbd.mouse {
  font-family: var(--font-sans);
  color: var(--text-muted);
  background: var(--hover);
  border-color: var(--border);
}
.label {
  font-size: var(--fs-sm);
  color: var(--text);
}
.sh-enter-active,
.sh-leave-active {
  transition: opacity 0.15s ease;
}
.sh-enter-active .sh,
.sh-leave-active .sh {
  transition: transform 0.15s ease;
}
.sh-enter-from,
.sh-leave-to {
  opacity: 0;
}
.sh-enter-from .sh,
.sh-leave-to .sh {
  transform: translateY(6px) scale(0.99);
}
/* 手机：整屏，避开刘海与底部横条 */
:root.compact .sh-layer {
  padding: 0;
}
:root.compact .sh {
  width: 100%;
  height: 100%;
  max-height: none;
  border: 0;
  border-radius: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
:root.compact header {
  padding-top: max(14px, env(safe-area-inset-top, 0px));
}
:root.compact .cols {
  grid-template-columns: 1fr;
}
:root.compact section {
  border-right: 0;
  border-bottom: 1px solid var(--border);
}
:root.coarse .close {
  width: 44px;
  height: 44px;
}
</style>
