// 拖手柄调家具宽深（furnitureResize.ts）：局部坐标换算、左右改宽（两边一起动）、正面改深、Shift 吸附、夹到范围。
import { describe, expect, test } from 'vitest'
import { dragSize, handleLocal, toLocal, type ResizeDrag } from '/src/furnitureResize'
import { toWorld } from '/src/surface'

/** 120 × 45 的柜子，按在 side 手柄上 */
function drag(side: ResizeDrag['side'], rot = 0): ResizeDrag {
  const f = { x: 100, y: 200, rot }
  const h = handleLocal(side, 120, 45)
  return { id: 'f1', side, f, w0: 120, d0: 45, at0: toWorld(f, h.x, h.z), range: { w: [48, 300], d: [23, 90] } }
}

describe('furnitureResize', () => {
  test('toLocal 是 toWorld 的逆', () => {
    for (const rot of [0, 90, 180, 270, 33]) {
      const f = { x: 10, y: -20, rot }
      const p = toWorld(f, 17, -9)
      const l = toLocal(f, p.x - f.x, p.y - f.y)
      expect(l.x).toBeCloseTo(17)
      expect(l.z).toBeCloseTo(-9)
    }
  })

  test('右手柄往外拖 10cm 宽加 20，左手柄往外拖同样加宽；深不变', () => {
    const r = drag('right')
    expect(dragSize(r, { x: r.at0.x + 10, y: r.at0.y + 3 }, false)).toEqual({ w: 140, d: 45 })
    const l = drag('left')
    expect(dragSize(l, { x: l.at0.x + 10, y: l.at0.y }, false)).toEqual({ w: 100, d: 45 })
  })

  test('正面手柄按家具朝向改深；转了 90° 时沿平面 -x 是往前', () => {
    const f = drag('front')
    expect(dragSize(f, { x: f.at0.x, y: f.at0.y + 12.4 }, false)).toEqual({ w: 120, d: 57 })
    const g = drag('front', 90)
    expect(dragSize(g, { x: g.at0.x - 10, y: g.at0.y }, false)).toEqual({ w: 120, d: 55 })
  })

  test('Shift 按 5cm 吸附，超出可调范围夹住', () => {
    const r = drag('right')
    expect(dragSize(r, { x: r.at0.x + 3.6, y: r.at0.y }, true)).toEqual({ w: 125, d: 45 })
    expect(dragSize(r, { x: r.at0.x + 500, y: r.at0.y }, false).w).toBe(300)
    expect(dragSize(r, { x: r.at0.x - 500, y: r.at0.y }, false).w).toBe(48)
  })
})
