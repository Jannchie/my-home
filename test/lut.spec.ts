import { describe, expect, it } from 'vitest'
import { vividGrade, oklabToSrgb, srgbToOklab } from '/src/three/lut'

describe('lut', () => {
  it('OKLab 往返误差很小', () => {
    for (const c of [[0.2, 0.5, 0.8], [0.9, 0.3, 0.1], [0.5, 0.5, 0.5], [0, 0, 0], [1, 1, 1]] as const) {
      const back = oklabToSrgb(...srgbToOklab(...c))
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(c[i], 4)
    }
  })

  it('黑白位不动', () => {
    for (const v of vividGrade(0, 0, 0)) expect(v).toBeLessThan(0.02)
    for (const v of vividGrade(1, 1, 1)) expect(v).toBeGreaterThan(0.97)
  })

  it('灰阶亮度单调、只带一点冷暖', () => {
    let last = -1
    for (let i = 0; i <= 20; i++) {
      const g = i / 20
      const [r, gg, b] = vividGrade(g, g, g)
      const L = srgbToOklab(r, gg, b)[0]
      expect(L).toBeGreaterThan(last)
      last = L
      expect(Math.max(r, gg, b) - Math.min(r, gg, b)).toBeLessThan(0.08)
    }
  })

  it('天蓝更饱和、暗部偏冷', () => {
    const sky = [0.45, 0.65, 0.9] as const
    const C = (c: readonly number[]) => Math.hypot(...srgbToOklab(c[0], c[1], c[2]).slice(1))
    expect(C(vividGrade(...sky))).toBeGreaterThan(C(sky))
    const dark = vividGrade(0.15, 0.15, 0.15)
    expect(dark[2]).toBeGreaterThan(dark[0])
  })
})
