// shade.ts 的纯计算版必须和 three.js Color 的结果逐个一致（toon.ts 的 shade 先走它，自动墙纸也直接用它）
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { shadeHex } from '/src/three/shade'

function viaThree(color: string, dl: number, ds: number) {
  const c = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return new THREE.Color().setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + ds)), Math.max(0, Math.min(1, hsl.l + dl))).getHexString()
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
