// 测试环境的极简 DOM 桩：素材 build / 花纹贴图会调用 document.createElement('canvas').getContext('2d')，
// i18n 会碰 document.documentElement / head。这里不追求行为正确，只保证不抛错。
// 2D 上下文用 Proxy 桩：任意属性都是可调用的空函数，少数需要返回值的方法单独给。

const noop: any = new Proxy(function () {}, {
  get: (_t, k) =>
    k === 'canvas'
      ? { width: 64, height: 64 }
      : k === 'measureText'
        ? () => ({ width: 1 })
        : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern'
          ? () => ({ addColorStop() {} })
          : k === 'getImageData'
            ? () => ({ data: new Uint8ClampedArray(4) })
            : noop,
  apply: () => undefined,
  set: () => true,
})

const g = globalThis as any
if (typeof g.document === 'undefined') {
  g.document = {
    documentElement: { lang: '', classList: { add() {}, remove() {}, toggle() {} }, style: { setProperty() {} }, dataset: {} },
    head: { appendChild() {}, querySelector: () => null, querySelectorAll: () => [] },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => noop, toDataURL: () => '' }),
  }
}
if (typeof g.window === 'undefined') g.window = globalThis

// 界面语言按 navigator.language 推断，而 Node 的 navigator.language 跟着系统区域设置（本机 ja-JP、CI 上 en-US）：
// 户型名、房间名等会随之变成不同语言，测试结果就看在哪台机器上跑。这里固定成日语，本机和 CI 一致。
{
  const nav = g.navigator as Record<string, unknown> | undefined
  const pinned = { hardwareConcurrency: nav?.hardwareConcurrency ?? 4, platform: nav?.platform ?? '', userAgent: nav?.userAgent ?? 'node', language: 'ja-JP', languages: ['ja-JP'] }
  Object.defineProperty(g, 'navigator', { value: pinned, configurable: true, writable: true })
}
