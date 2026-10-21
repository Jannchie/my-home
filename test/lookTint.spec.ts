import { describe, expect, it } from 'vitest'
import { bloomTintColor, hueTint, lookValue, resolveLook } from '/src/three/post'

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

describe('泛光颜色', () => {
  it('不染色时是白、亮度保持 1', () => {
    expect(bloomTintColor(undefined).toArray()).toEqual([1, 1, 1])
    const c = bloomTintColor({ hue: 20, amt: 1 })
    expect(0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z).toBeCloseTo(1, 5)
  })

  it('色相 20 偏橙红：红多、蓝少', () => {
    const c = bloomTintColor({ hue: 20, amt: 0.8 })
    expect(c.x).toBeGreaterThan(c.y)
    expect(c.y).toBeGreaterThan(c.z)
  })

  it('调整写进 bloomTint，界面读回来一致', () => {
    const def = resolveLook('anime', { bloomAmt: 0.6 })
    expect(def.bloomTint).toEqual({ hue: 25, amt: 0.6 })
    expect(lookValue(def, 'bloomHue')).toBe(25)
    expect(lookValue(resolveLook('anime'), 'bloomAmt')).toBe(0)
  })
})
