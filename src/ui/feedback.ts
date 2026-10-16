// 操作反馈：耗时的同步操作（搭 3D 场景、一键布置、随机生成）前先把「处理中」提示画出来，再开始算。
// 提示的淡入和转圈都是纯 CSS（opacity / transform），主线程被占住时合成线程也能继续播；
// 淡入带一点延迟，很快就完成的操作不会闪一下。
import { nextTick, reactive } from 'vue'

export const busy = reactive({ text: '', count: 0 })

/** 界面层的开关：快捷键帮助、新手引导 */
export const overlays = reactive({ help: false, onboarding: false })

/** 等浏览器真正画出一帧（两次 rAF：第一次在绘制前，第二次在绘制后） */
export function nextPaint() {
  return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
}

/**
 * 显示「处理中」后执行 fn（可以是异步），等 Vue 把结果渲染完再收起提示。
 * 嵌套调用时以最外层为准。
 */
export async function runBusy<T>(text: string, fn: () => T | Promise<T>): Promise<T> {
  busy.count++
  busy.text = text
  try {
    await nextPaint()
    const r = await fn()
    await nextTick()
    return r
  } finally {
    busy.count--
  }
}
