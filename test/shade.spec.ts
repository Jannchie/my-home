// shade.ts 的纯计算版必须和 three.js Color 的结果逐个一致（toon.ts 的 shade 先走它，自动墙纸也直接用它）；
// 调暗的软下限（dimLightness）两边用同一个函数。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { dimLightness, shadeHex } from '/src/three/shade'

function viaThree(color: string, dl: number, ds: number) {
  const c = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return new THREE.Color().setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + ds)), Math.max(0, Math.min(1, dimLightness(hsl.l, dl)))).getHexString()
}

describe('shadeHex 和 three.js 一致', () => {
  test('随机颜色 × 随机调整量', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const bad: string[] = []
    for (let i = 0; i < 20000; i++) {
      const hex = '#' + Math.floor(rand() * 0x1000000).toString(16).padStart(6, '0')
      const dl = (rand() - 0.5) * 0.6
      const ds = rand() < 0.5 ? 0 : (rand() - 0.5) * 0.4
      if (shadeHex(hex, dl, ds) !== viaThree(hex, dl, ds)) bad.push(`${hex} ${dl} ${ds}`)
    }
    expect(bad.slice(0, 10)).toEqual([])
  })

  test('灰色、黑白、三位写法', () => {
    for (const c of ['#000000', '#ffffff', '#808080', '#fff', '#abc', '#ff0000'])
      for (const dl of [-0.3, 0, 0.3]) expect(shadeHex(c, dl, 0.1), c).toBe(viaThree(c, dl, 0.1))
    expect(shadeHex('red', 0.1)).toBeNull()
  })
})

describe('调暗不会把颜色压成纯黑', () => {
  test('深色调暗仍保留色相，越调越暗但有下限', () => {
    for (const c of ['#6e4f37', '#3e3a39', '#24252a', '#3d3f44', '#34465e']) {
      const a = shadeHex(c, -0.1)!
      const b = shadeHex(c, -0.3)!
      expect(a, c).not.toBe('000000')
      expect(b, c).not.toBe('000000')
      // 单调：调得越多越暗
      const lum = (h: string) => parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)
      expect(lum(b), c).toBeLessThanOrEqual(lum(a))
      expect(lum(a), c).toBeLessThan(lum(c.slice(1)))
    }
  })
  test('浅色小幅调暗和以前一样（线性区）', () => {
    expect(dimLightness(0.5, -0.1)).toBeCloseTo(0.4)
    expect(dimLightness(0.2, -0.05)).toBeCloseTo(0.15)
  })
  test('软下限处连续', () => {
    const l0 = 0.2
    const at = l0 * 0.55
    expect(dimLightness(l0, -(l0 - at) + 1e-9)).toBeCloseTo(dimLightness(l0, -(l0 - at) - 1e-9), 6)
  })
})
