// 性能调试浮窗（PerfHud.vue）的数据：F3 或网址带 ?perf 打开，记在 localStorage（my-home:perf）。
//   - 帧率：requestAnimationFrame 的频率（loop 每次调 perfTick）和真正重画的频率（沙盘静止时不重画）；
//   - CPU：stage.render() 这一调用本身的耗时（提交命令，不含 GPU 执行）；
//   - GPU：EXT_disjoint_timer_query_webgl2 量的整帧 GPU 耗时（含阴影、倒影、后处理各遍），结果晚几帧才拿得到；不支持的显卡不显示；
//   - draw call / 三角形：一帧里所有 renderer.render（主画面、阴影、倒影、遮蔽的法线那一遍……）的合计。
// 关着时 perfFrame 直接调 fn，不多做任何事。

import { reactive } from 'vue'
import type * as THREE from 'three'

const KEY = 'my-home:perf'

function initialOn() {
  try {
    if (new URLSearchParams(location.search).has('perf')) return true
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const perf = reactive({
  on: initialOn(),
  /** rAF 帧率 / 重画帧率 */
  fps: 0,
  drawFps: 0,
  /** 最近一次重画的耗时（ms，平滑后） */
  cpu: 0,
  gpu: null as number | null,
  calls: 0,
  tris: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  size: '',
})

export function togglePerf(on = !perf.on) {
  perf.on = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* 隐私模式等：不记 */
  }
}

/** 平滑：指数滑动平均，数字不会每帧乱跳 */
const ema = (prev: number, v: number) => (prev ? prev * 0.85 + v * 0.15 : v)
/** 界面上的数字隔这么久刷新一次（ms），不每帧触发 Vue 更新 */
const PUBLISH = 250

let frames = 0
let draws = 0
let windowStart = 0
let lastPublish = 0
const acc = { cpu: 0, gpu: 0 }

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
let timerGl: WebGL2RenderingContext | null = null
let timerExt: TimerExt | null | undefined
const pending: WebGLQuery[] = []

function timer(gl: WebGL2RenderingContext) {
  if (timerGl !== gl) {
    timerGl = gl
    timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null
    pending.length = 0
  }
  return timerExt
}

/** 收已经出结果的 GPU 计时（按提交顺序，前面的没好后面的也不看） */
function pollGpu(gl: WebGL2RenderingContext, ext: TimerExt) {
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
  while (pending.length) {
    const q = pending[0]
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
    pending.shift()
    const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number
    gl.deleteQuery(q)
    if (!disjoint) acc.gpu = ema(acc.gpu, ns / 1e6)
  }
}

/** 每个 rAF 调一次（不管这一帧画不画） */
export function perfTick(now: number) {
  if (!perf.on) return
  frames++
  if (!windowStart) windowStart = now
  const span = now - windowStart
  if (span >= 1000) {
    perf.fps = Math.round((frames * 1000) / span)
    perf.drawFps = Math.round((draws * 1000) / span)
    frames = 0
    draws = 0
    windowStart = now
  }
}

/** 包住一次重画：量 CPU / GPU 耗时、统计这一帧的 draw call */
export function perfFrame(renderer: THREE.WebGLRenderer, fn: () => void) {
  if (!perf.on) return fn()
  const gl = renderer.getContext() as WebGL2RenderingContext
  const ext = timer(gl)
  if (ext) pollGpu(gl, ext)
  const info = renderer.info
  const autoReset = info.autoReset
  info.autoReset = false
  info.reset()
  // 同时只能有一个计时查询：上一帧的还没出结果太多时（GPU 跟不上）先不开新的
  const q = ext && pending.length < 8 ? gl.createQuery() : null
  if (q && ext) gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
  const t0 = performance.now()
  try {
    fn()
  } finally {
    acc.cpu = ema(acc.cpu, performance.now() - t0)
    if (q && ext) {
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      pending.push(q)
    }
    info.autoReset = autoReset
    draws++
    const now = performance.now()
    if (now - lastPublish > PUBLISH) {
      lastPublish = now
      perf.cpu = acc.cpu
      perf.gpu = ext ? acc.gpu || null : null
      perf.calls = info.render.calls
      perf.tris = info.render.triangles
      perf.geometries = info.memory.geometries
      perf.textures = info.memory.textures
      perf.programs = info.programs?.length ?? 0
      perf.size = `${renderer.domElement.width}×${renderer.domElement.height}`
    }
  }
}
