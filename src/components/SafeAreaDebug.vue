<script setup lang="ts">
// 临时诊断：iPhone 主屏幕 Web App（PWA）里系统实际报告的安全区与视口尺寸，用来排查顶栏 / 底部抽屉被系统磨砂盖住的问题。
// 从「更多」菜单打开（只在 iOS 的独立窗口模式下出现）。
import { onMounted, ref } from 'vue'
import { layout } from '../ui/device'

const emit = defineEmits<{ close: [] }>()
const rows = ref<[string, string][]>([])

function inset(side: 'top' | 'right' | 'bottom' | 'left') {
  const d = document.createElement('div')
  d.style.cssText = `position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-${side},0px);visibility:hidden`
  document.body.appendChild(d)
  const h = d.offsetHeight
  d.remove()
  return h
}

onMounted(() => {
  const vv = window.visualViewport
  const top = document.querySelector('.top') as HTMLElement | null
  const sheet = document.querySelector('.bs.on') as HTMLElement | null
  const cs = (el: HTMLElement | null, k: string) => (el ? getComputedStyle(el).getPropertyValue(k) : '-')
  rows.value = [
    ['safe-area top / right / bottom / left', `${inset('top')} / ${inset('right')} / ${inset('bottom')} / ${inset('left')}`],
    ['display-mode standalone', String(matchMedia('(display-mode: standalone)').matches)],
    ['navigator.standalone', String((navigator as { standalone?: boolean }).standalone)],
    ['innerWidth × innerHeight', `${innerWidth} × ${innerHeight}`],
    ['visualViewport', vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)} @ ${Math.round(vv.offsetTop)}` : '-'],
    ['screen', `${screen.width} × ${screen.height}`],
    ['documentElement client', `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`],
    ['devicePixelRatio', String(devicePixelRatio)],
    ['layout.safeBottom / --safe-b', `${layout.safeBottom} / ${getComputedStyle(document.documentElement).getPropertyValue('--safe-b') || '-'}`],
    ['header padding-top / top', `${cs(top, 'padding-top')} / ${top ? Math.round(top.getBoundingClientRect().top) : '-'}`],
    ['sheet padding-bottom / bottom', `${cs(sheet, 'padding-bottom')} / ${sheet ? Math.round(innerHeight - sheet.getBoundingClientRect().bottom) : '-'}`],
    ['status-bar-style', document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') ?? '-'],
    ['viewport', document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '-'],
    ['userAgent', navigator.userAgent],
  ]
})
</script>

<template>
  <div class="sad" role="dialog" @click.self="emit('close')">
    <div class="box">
      <div class="head">
        <b>Safe area</b>
        <button class="icon-only" aria-label="Close" @click="emit('close')">×</button>
      </div>
      <dl>
        <template v-for="[k, v] in rows" :key="k">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.sad {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: rgba(20, 24, 22, 0.35);
}
.box {
  width: min(92vw, 420px);
  max-height: 80vh;
  overflow: auto;
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
dl {
  margin: 0;
  font-size: var(--fs-xs);
}
dt {
  color: var(--text-muted);
  margin-top: 6px;
}
dd {
  margin: 0;
  font-family: var(--font-mono);
  word-break: break-all;
}
</style>
