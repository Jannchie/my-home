// 用水房间的形状和设备：
//   - 日式トイレ（平层各骨架、户建、复式）：净宽只够一个马桶 + 侧墙卷纸架（78～95），净深 120～170，不长不宽；
//     马桶背靠一面短墙、朝着长向（门那边）；
//   - 中式公卫：大部分户型有玻璃淋浴房，和马桶、洗手台在同一间；
//   - 淋浴房的玻璃：贴墙的边不装，其余每一边都装（墙角、贴一面墙、四面不贴墙，四个朝向），平面符号和 3D 一致。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { stallWalls, type StallWalls } from '/src/bathroom'
import { innerRoom } from '/src/place'
import { bbox, pointInPolygon, rectPoints, type Fixture, type Plan, type Region, type Room } from '/src/model'
import { floorOf } from '/src/floors'
import { showerStallModel } from '/src/three/assets'
import { range } from './helpers'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null, bedrooms: 'random' } as const
const gen = (seed: number, region: Region, dwelling: 'apartment' | 'house' | 'duplex') => generatePlan({ ...OPTS, seed, region, dwelling }).plan
const fixturesIn = (plan: Plan, r: Room) => plan.fixtures.filter((f) => floorOf(plan, f) === floorOf(plan, r) && pointInPolygon(f, r.points))

describe('日式トイレ的尺寸', () => {
  const cases: [string, Plan][] = [
    ...range(1, 80).map((s): [string, Plan] => [`apt#${s}`, gen(s, 'jp', 'apartment')]),
    ...range(1, 24).map((s): [string, Plan] => [`house#${s}`, gen(s, 'jp', 'house')]),
    ...range(1, 16).map((s): [string, Plan] => [`duplex#${s}`, gen(s, 'jp', 'duplex')]),
  ]

  test('净宽 78～95、净深 120～170（扣掉墙厚）', () => {
    const bad: string[] = []
    let n = 0
    for (const [key, plan] of cases)
      for (const r of plan.rooms.filter((x) => x.kind === 'toilet')) {
        n++
        const b = bbox(innerRoom(r, plan).points)
        const w = Math.min(b.x1 - b.x0, b.y1 - b.y0)
        const d = Math.max(b.x1 - b.x0, b.y1 - b.y0)
        if (w < 78 || w > 95 || d < 120 || d > 170) bad.push(`${key} ${Math.round(w)}×${Math.round(d)}`)
      }
    expect(n).toBeGreaterThan(80)
    expect(bad).toEqual([])
  })

  test('马桶背靠短墙、朝着长向，门开得下（不窄于 55）', () => {
    const bad: string[] = []
    for (const [key, plan] of cases)
      for (const r of plan.rooms.filter((x) => x.kind === 'toilet')) {
        const t = fixturesIn(plan, r).find((f) => f.kind === 'toilet')
        if (!t) {
          bad.push(`${key} 没有马桶`)
          continue
        }
        const b = bbox(r.points)
        const longX = b.x1 - b.x0 > b.y1 - b.y0
        // 朝向（局部 +y）沿长向
        const facesX = Math.round(t.rot / 90) % 2 === 1
        if (facesX !== longX) bad.push(`${key} 马桶朝短向`)
        const door = plan.openings.find((o) => o.roomId === r.id && o.kind !== 'window')
        if (!door || door.width < 55) bad.push(`${key} 门 ${door?.width}`)
      }
    expect(bad).toEqual([])
  })
})

describe('中式公卫的淋浴房', () => {
  test('多数户型的公卫 / 卫生间里有淋浴房，和马桶、洗手台同一间', () => {
    let plans = 0
    let withShower = 0
    const bad: string[] = []
    for (const dwelling of ['apartment', 'house'] as const)
      for (const s of range(1, 30)) {
        const plan = gen(s, 'cn', dwelling)
        plans++
        let any = false
        for (const r of plan.rooms.filter((x) => x.kind === 'bath')) {
          const fs = fixturesIn(plan, r)
          if (!fs.some((f) => f.kind === 'bathtub' && f.shower)) continue
          any = true
          if (!fs.some((f) => f.kind === 'toilet') || !fs.some((f) => f.kind === 'basin')) bad.push(`${dwelling}#${s} ${r.name}`)
        }
        if (any) withShower++
      }
    expect(bad).toEqual([])
    expect(withShower / plans).toBeGreaterThan(0.6)
  })
})

describe('淋浴房的玻璃隔断', () => {
  // 一间 300 × 300 的浴室（四面都是外墙，墙厚 18：墙面在 9 / 291）
  const room: Room = { id: 'r1', kind: 'bath', name: 'bath', points: rectPoints(0, 0, 300, 300) }
  const ctx = (f: Fixture): Plan => ({ version: 1, name: '', wall: 10, wallOuter: 18, rooms: [room], openings: [], fixtures: [f], furniture: [] })
  const stall = (x: number, y: number, rot: number): Fixture => ({ id: 'f', kind: 'bathtub', shower: true, x, y, w: 100, d: 90, rot })
  const W = (back: boolean, front: boolean, left: boolean, right: boolean): StallWalls => ({ back, front, left, right })
  // rot：背面朝向 0 = -y、90 = +x、180 = +y、270 = -x；局部 left = -x 方向
  const cases: [string, Fixture, StallWalls][] = [
    ['墙角 rot0', stall(59, 54, 0), W(true, false, true, false)],
    ['墙角 rot0 另一侧', stall(241, 54, 0), W(true, false, false, true)],
    ['墙角 rot90', stall(246, 59, 90), W(true, false, true, false)],
    ['墙角 rot180', stall(241, 246, 180), W(true, false, true, false)],
    ['墙角 rot270', stall(54, 241, 270), W(true, false, true, false)],
    ['贴一面墙 rot0', stall(150, 54, 0), W(true, false, false, false)],
    ['贴一面墙 rot90', stall(246, 150, 90), W(true, false, false, false)],
    ['贴一面墙 rot180', stall(150, 246, 180), W(true, false, false, false)],
    ['贴一面墙 rot270', stall(54, 150, 270), W(true, false, false, false)],
    ['四面不贴墙', stall(150, 150, 0), W(false, false, false, false)],
    ['四面不贴墙 rot90', stall(150, 150, 90), W(false, false, false, false)],
  ]

  test.each(cases)('贴墙判定：%s', (_k, f, want) => {
    expect(stallWalls(ctx(f), f)).toEqual(want)
  })

  test('凹位：两侧和背面贴墙，只有正面不贴', () => {
    // 宽 100 的凹位：房间 118 宽，两侧墙面（9 / 109）正好贴着淋浴房
    const niche: Room = { id: 'n', kind: 'bath', name: 'n', points: rectPoints(0, 0, 118, 300) }
    const f = stall(59, 54, 0)
    const p: Plan = { version: 1, name: '', wall: 10, wallOuter: 18, rooms: [niche], openings: [], fixtures: [f], furniture: [] }
    expect(stallWalls(p, f)).toEqual(W(true, false, true, true))
  })

  /** 3D 模型里的玻璃（半透明材质的板）：按所在平面归到哪一边 */
  function glassSides(walls: StallWalls) {
    const g = showerStallModel(100, 90, walls)
    g.updateMatrixWorld(true)
    const sides = new Set<string>()
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || !(m.material as THREE.Material).transparent) return
      const b = new THREE.Box3().setFromObject(m)
      const sx = b.max.x - b.min.x
      const sz = b.max.z - b.min.z
      const cx = (b.max.x + b.min.x) / 2
      const cz = (b.max.z + b.min.z) / 2
      if (sz < 2 && cz > 40) sides.add('front')
      else if (sz < 2 && cz < -40) sides.add('back')
      else if (sx < 2 && cx > 45) sides.add('right')
      else if (sx < 2 && cx < -45) sides.add('left')
      else sides.add(`?${cx.toFixed(0)},${cz.toFixed(0)}`)
    })
    return [...sides].sort()
  }

  test.each(cases)('3D：不贴墙的每一边都有玻璃、贴墙的边没有：%s', (_k, f, want) => {
    const open = (['back', 'front', 'left', 'right'] as const).filter((s) => !want[s]).sort()
    expect(glassSides(stallWalls(ctx(f), f))).toEqual(open)
  })

  test('生成的户型里：淋浴房背面贴墙，不贴墙的边都有玻璃', () => {
    const bad: string[] = []
    let n = 0
    for (const region of ['cn', 'west'] as const)
      for (const s of range(1, 20)) {
        const plan = gen(s, region, 'apartment')
        for (const f of plan.fixtures.filter((x) => x.kind === 'bathtub' && x.shower)) {
          n++
          const w = stallWalls(plan, f)
          if (!w.back) bad.push(`${region}#${s} 背面没贴墙`)
          const open = (['back', 'front', 'left', 'right'] as const).filter((k) => !w[k]).sort()
          if (!open.length) bad.push(`${region}#${s} 四面都贴墙`)
          const got = glassSides(w)
          if (got.join() !== open.join()) bad.push(`${region}#${s} 玻璃 ${got} ≠ ${open}`)
        }
      }
    expect(n).toBeGreaterThan(10)
    expect(bad).toEqual([])
  })
})
