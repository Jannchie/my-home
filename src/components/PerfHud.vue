<script setup lang="ts">
// 性能调试浮窗：F3 开关（沙盘的快捷键处理里，或网址带 ?perf），数据见 src/ui/perf.ts
import { perf } from '../ui/perf'

defineProps<{ look: string }>()

const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(0) + 'k' : String(n))
/** 帧耗时上色：60fps 以内正常，30fps 以内偏黄，再慢偏红 */
const tone = (ms: number | null) => (ms == null ? '' : ms > 33 ? 'bad' : ms > 16.7 ? 'warn' : '')
</script>

<template>
  <div v-if="perf.on" class="perf" aria-hidden="true">
    <div class="row head">
      <b>{{ perf.fps }}</b><span>fps</span>
      <span class="dim">draw {{ perf.drawFps }}/s</span>
    </div>
    <div class="row"><span class="k">CPU</span><span :class="tone(perf.cpu)">{{ perf.cpu.toFixed(1) }} ms</span></div>
    <div class="row"><span class="k">GPU</span><span :class="tone(perf.gpu)">{{ perf.gpu == null ? '—' : perf.gpu.toFixed(1) + ' ms' }}</span></div>
    <div class="row"><span class="k">Calls</span><span>{{ fmt(perf.calls) }}</span></div>
    <div class="row"><span class="k">Tris</span><span>{{ fmt(perf.tris) }}</span></div>
    <div class="row"><span class="k">Geo / Tex</span><span>{{ perf.geometries }} / {{ perf.textures }}</span></div>
    <div class="row"><span class="k">Programs</span><span>{{ perf.programs }}</span></div>
    <div class="row"><span class="k">Buffer</span><span>{{ perf.size }}</span></div>
    <div class="row"><span class="k">Look</span><span>{{ look }}</span></div>
    <div class="foot">F3</div>
  </div>
</template>

<style scoped>
.perf {
  position: absolute;
  z-index: 3;
  left: 14px;
  top: 64px;
  min-width: 150px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: rgba(20, 22, 26, 0.78);
  backdrop-filter: blur(6px);
  color: #e8eaee;
  font-size: var(--fs-xs);
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.row {
  display: flex;
  gap: 10px;
  justify-content: space-between;
}
.head {
  justify-content: flex-start;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 2px;
}
.head b {
  font-size: 18px;
}
.head .dim {
  margin-left: auto;
}
.k,
.dim,
.foot {
  color: #9aa0aa;
}
.foot {
  margin-top: 2px;
  text-align: right;
  font-size: 10px;
}
.warn {
  color: #f2c14e;
}
.bad {
  color: #f07167;
}
</style>
