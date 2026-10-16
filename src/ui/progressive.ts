// 长列表按需渲染：素材 / 家具网格一次只挂前几十张卡片，滚到底部的哨兵元素进入视口时再追加一批。
// 列表（筛选条件）变化时回到第一批。比真正的虚拟滚动简单，卡片高度不固定也没问题；
// 1500+ 张卡片从一次性挂载（几万个 DOM 节点）变成按滚动逐批挂载。
//
// 用法：const { shown, more, vSentinel } = useProgressive(() => list.value, 60)
//       模板里 v-for="g in shown"，列表末尾放 <div v-if="more" v-sentinel class="sentinel" />
import { computed, onBeforeUnmount, ref, watch, type Directive } from 'vue'

export function useProgressive<T>(source: () => T[], step = 60) {
  const limit = ref(step)
  watch(source, () => (limit.value = step))
  const shown = computed(() => source().slice(0, limit.value))
  const more = computed(() => source().length > limit.value)

  let io: IntersectionObserver | null = null
  const grow = () => {
    if (more.value) limit.value += step
  }
  const vSentinel: Directive<HTMLElement> = {
    mounted(el) {
      if (typeof IntersectionObserver === 'undefined') {
        limit.value = Infinity
        return
      }
      io?.disconnect()
      // 提前 600px 追加：快速滑动时也不容易看到空白
      io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && grow(), { rootMargin: '600px' })
      io.observe(el)
    },
    updated(el) {
      // 追加完哨兵还在视口里（屏幕很高 / 一批太少）：继续追加
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight + 600 && r.bottom > -600 && el.offsetParent) grow()
      })
    },
    unmounted() {
      io?.disconnect()
      io = null
    },
  }
  onBeforeUnmount(() => io?.disconnect())
  return { shown, more, limit, vSentinel }
}
