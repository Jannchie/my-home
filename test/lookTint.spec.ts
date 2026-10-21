import { describe, expect, it } from 'vitest'
import { hueTint, lookValue, resolveLook } from '/src/three/post'

describe('分离色调的色相 / 强度调整', () => {
  it('色相、强度换算回去不变', () => {
    const def = resolveLook('none', { shadowHue: 250, shadowAmt: 0.03 })
    expect(lookValue(def, 'shadowHue')).toBe(250)
    expect(lookValue(def, 'shadowAmt')).toBeCloseTo(0.03, 3)
  })

  it('偏移量不改亮度（三个通道加起来是 0）', () => {
    for (const h of [0, 90, 200, 300]) {
      const t = hueTint(h, 0.05)
      expect(t[0] + t[1] + t[2]).toBeCloseTo(0, 6)
    }
  })

  it('色相 240 偏蓝、0 偏红', () => {
    const blue = hueTint(240, 0.05)
    expect(blue[2]).toBeGreaterThan(blue[0])
    const red = hueTint(0, 0.05)
    expect(red[0]).toBeGreaterThan(red[2])
  })

  it('只改强度时沿用预设的色相', () => {
    const base = resolveLook('anime')
    const hue = lookValue(base, 'shadowHue')
    const def = resolveLook('anime', { shadowAmt: 0.06 })
    expect(lookValue(def, 'shadowHue')).toBe(hue)
    expect(lookValue(def, 'shadowAmt')).toBeCloseTo(0.06, 3)
  })

  it('没有色调的预设：强度 0、色相给默认值', () => {
    const def = resolveLook('none')
    expect(lookValue(def, 'shadowAmt')).toBe(0)
    expect(lookValue(def, 'shadowHue')).toBe(250)
  })
})
