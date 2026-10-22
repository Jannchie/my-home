// 调宽深时让开墙和旁边的东西（resizeFit.ts）：往空的一侧挪、夹到放得下的最大尺寸、原本重叠的不挡、背面贴墙。
import { describe, expect, test } from 'vitest'
import { emptyPlan, type Furniture, type Plan } from '/src/model'
import { innerRoom } from '/src/place'
import { furnitureBox } from '/src/snap'
import { fitResize } from '/src/resizeFit'
import { ASSET_MAP } from '/src/three/assets'
import { parseResized, resizeRange } from '/src/three/resize'

const SHELF = ASSET_MAP.get('bookshelf')!

/** 一间 400 × 300 的房间；返回户型和墙内侧的范围 */
function room() {
  const plan: Plan = emptyPlan()
  plan.rooms.push({ id: 'r', name: '房间', kind: 'living', points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] })
  const ps = innerRoom(plan.rooms[0], plan).points
  const xs = ps.map((p) => p.x)
  const ys = ps.map((p) => p.y)
  return { plan, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}
/** 背靠上面那堵墙（正面朝 +y），左边缘在 left */
function shelfAt(plan: Plan, id: string, left: number, top: number, asset = 'bookshelf'): Furniture {
  const d = ASSET_MAP.get(asset)!
  const f: Furniture = { id, asset, x: left + d.w / 2, y: top + d.d / 2, rot: 0 }
  plan.furniture.push(f)
  return f
}
const size = (asset: string) => {
  const p = parseResized(asset)
  return p ? { w: p.w, d: p.d } : { w: ASSET_MAP.get(asset)!.w, d: ASSET_MAP.get(asset)!.d }
}

describe('fitResize', () => {
  test('左边贴墙：加宽时往右挪，左边缘不动', () => {
    const { plan, x0, y0 } = room()
    const f = shelfAt(plan, 'a', x0, y0)
    const r = fitResize(plan, f, SHELF.w + 40, SHELF.d)!
    expect(size(r.asset).w).toBe(Math.round(SHELF.w + 40))
    expect(r.clamped).toBe(false)
    expect(furnitureBox(r.asset, r.x, r.y, 0).x0).toBeCloseTo(x0, 0)
  })

  test('两侧都被挡住：夹到缝隙那么宽', () => {
    const { plan, x0, y0 } = room()
    const f = shelfAt(plan, 'a', x0, y0)
    shelfAt(plan, 'b', x0 + SHELF.w + 10, y0)
    const r = fitResize(plan, f, SHELF.w + 60, SHELF.d)!
    expect(r.clamped).toBe(true)
    const w = size(r.asset).w
    expect(w).toBeGreaterThanOrEqual(Math.round(SHELF.w) + 9)
    expect(w).toBeLessThanOrEqual(Math.round(SHELF.w) + 11)
    const b = furnitureBox(r.asset, r.x, r.y, 0)
    expect(b.x0).toBeGreaterThanOrEqual(x0 - 0.5)
    expect(b.x1).toBeLessThanOrEqual(x0 + SHELF.w + 10 + 1.5)
  })

  test('加深：背面贴墙不动；前面有东西就夹到碰上为止', () => {
    const { plan, x0, y0 } = room()
    const f = shelfAt(plan, 'a', x0 + 100, y0)
    const free = fitResize(plan, f, SHELF.w, SHELF.d + 20)!
    expect(size(free.asset).d).toBe(Math.round(SHELF.d + 20))
    expect(furnitureBox(free.asset, free.x, free.y, 0).y0).toBeCloseTo(y0, 0)
    // 正前方 10cm 处放一个柜子
    plan.furniture.push({ id: 'c', asset: 'bookshelf', x: f.x, y: y0 + SHELF.d + 10 + SHELF.d / 2, rot: 0 })
    const r = fitResize(plan, f, SHELF.w, SHELF.d + 30)!
    expect(r.clamped).toBe(true)
    expect(size(r.asset).d).toBeLessThanOrEqual(Math.round(SHELF.d) + 11)
    expect(furnitureBox(r.asset, r.x, r.y, 0).y0).toBeCloseTo(y0, 0)
  })

  test('调整前就重叠的东西不挡；缩小不检查', () => {
    const { plan, x0, y0 } = room()
    const f = shelfAt(plan, 'a', x0 + 150, y0)
    // 一个凳子已经压在书架前沿上
    plan.furniture.push({ id: 's', asset: 'bookshelf', x: f.x, y: f.y + SHELF.d - 5, rot: 0 })
    const r = fitResize(plan, f, SHELF.w + 30, SHELF.d)!
    expect(r.clamped).toBe(false)
    expect(r.x).toBeCloseTo(f.x, 1)
    const s = fitResize(plan, f, SHELF.w - 20, SHELF.d - 5)!
    expect(size(s.asset)).toEqual({ w: Math.round(SHELF.w - 20), d: Math.round(SHELF.d - 5) })
    expect(furnitureBox(s.asset, s.x, s.y, 0).y0).toBeCloseTo(y0, 0)
  })

  test('转了 90° 的也按家具自己的左右挪', () => {
    const { plan, x0, y0 } = room()
    // 背靠左墙、正面朝 +x（rot 270：局部 +z → 世界 +x），上边贴着上墙
    const f: Furniture = { id: 'a', asset: 'bookshelf', x: x0 + SHELF.d / 2, y: y0 + SHELF.w / 2, rot: 270 }
    plan.furniture.push(f)
    const r = fitResize(plan, f, SHELF.w + 40, SHELF.d)!
    expect(r.clamped).toBe(false)
    const b = furnitureBox(r.asset, r.x, r.y, 270)
    expect(b.y0).toBeCloseTo(y0, 0)
    expect(b.x0).toBeCloseTo(x0, 0)
  })
  test('壁挂的薄东西：可调范围包含原尺寸，加宽不会被顺带加深', () => {
    const { plan, x0, y0 } = room()
    const key = ASSET_MAP.get('wall-key-rack')!
    const r0 = resizeRange(key)!
    expect(r0.d[0]).toBeLessThanOrEqual(Math.round(key.d))
    const f: Furniture = { id: 'k', asset: 'wall-key-rack', x: x0 + 100, y: y0 + key.d / 2, rot: 0 }
    plan.furniture.push(f)
    const r = fitResize(plan, f, key.w + 20, key.d)!
    expect(r.clamped).toBe(false)
    expect(size(r.asset)).toEqual({ w: Math.round(key.w + 20), d: Math.round(key.d) })
    expect(furnitureBox(r.asset, r.x, r.y, 0).y0).toBeCloseTo(y0, 0)
  })
})
