// 多楼层：旧存档读入为单层、存档 / 分享链接往返、按层的墙段推导、楼梯洞口与上层房间的冲突、3D 多层搭建
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare } from '/src/share'
import { wallSegments } from '/src/walls'
import { floorOf, floorOutline, floorView, isMultiFloor, planFloors, riseOf, SLAB } from '/src/floors'
import { stairHoleConflicts, stairHoles, stairLayout, slabHoles, STAIRS_SIZE } from '/src/stairs'
import { area, rectPoints, type Plan } from '/src/model'
import { buildBuilding } from '/src/three/building'
import { buildHouse } from '/src/three/house'
import { checklist } from '/src/checklist'
import { JP_OPTS } from './helpers'
import { twoStoryPlan } from './twoStory'

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const segKey = (s: { a: { x: number; y: number }; b: { x: number; y: number }; kind: string }) => `${s.kind}:${Math.round(s.a.x)},${Math.round(s.a.y)}-${Math.round(s.b.x)},${Math.round(s.b.y)}`

describe('旧存档 = 单层户型', () => {
  test('没有 floors 的存档读入后是单层，所有物件没有 floor 字段，floorView 返回原户型', () => {
    for (const region of ['jp', 'cn', 'west'] as const) {
      const p = normalizePlan(clone(generatePlan({ seed: 7, ...JP_OPTS, region }).plan))!
      expect(p.floors).toBeUndefined()
      expect(isMultiFloor(p)).toBe(false)
      expect(planFloors(p).map((f) => f.id)).toEqual(['1f'])
      for (const x of [...p.rooms, ...p.fixtures, ...p.furniture, ...p.openings]) expect(x.floor).toBeUndefined()
      expect(floorView(p, '1f')).toBe(p)
    }
  })

  test('只有一层的 floors、指向不存在楼层的 floor 都会被整理掉', () => {
    const p = clone(generatePlan({ seed: 3, ...JP_OPTS }).plan)
    p.floors = [{ id: '1f', name: '1F', elevation: 0, height: 240 }]
    p.rooms[0].floor = 'nope'
    const n = normalizePlan(p)!
    expect(n.floors).toBeUndefined()
    expect(n.rooms[0].floor).toBeUndefined()
  })
})

describe('多层存档往返', () => {
  test('JSON 存档往返：楼层表、各物件的楼层不变，门窗跟着房间', () => {
    const p = normalizePlan(twoStoryPlan())!
    expect(p.floors!.map((f) => f.id)).toEqual(['1f', '2f'])
    const back = normalizePlan(clone(p))!
    expect(back.floors).toEqual(p.floors)
    expect(back.rooms.map((r) => floorOf(back, r))).toEqual(p.rooms.map((r) => floorOf(p, r)))
    expect(back.fixtures.map((f) => floorOf(back, f))).toEqual(p.fixtures.map((f) => floorOf(p, f)))
    for (const o of back.openings) expect(o.floor).toBe(back.rooms.find((r) => r.id === o.roomId)!.floor)
    // 最底层不写 floor
    expect(back.rooms.filter((r) => r.floor === '1f')).toEqual([])
  })

  test('分享链接往返：楼层表、各层的房间 / 设备 / 门窗数一致', async () => {
    const p = normalizePlan(twoStoryPlan())!
    for (const mode of ['plan', 'full'] as const) {
      const r = await decodeShare(await encodeShare(p, mode))
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      const q = r.plan
      expect(q.floors).toEqual(p.floors)
      for (const f of planFloors(p)) {
        const a = floorView(p, f.id)
        const b = floorView(q, f.id)
        expect([b.rooms.length, b.fixtures.length, b.openings.length]).toEqual([a.rooms.length, a.fixtures.length, a.openings.length])
        expect(b.rooms.map((x) => x.name)).toEqual(a.rooms.map((x) => x.name))
      }
    }
  })
})

describe('按层的墙段推导', () => {
  test('整份户型的墙段 = 各层子户型的墙段之和（上下层同一位置的房间不互相当邻居）', () => {
    const p = normalizePlan(twoStoryPlan())!
    const all = wallSegments(p.rooms).map(segKey).sort()
    const per = planFloors(p)
      .flatMap((f) => wallSegments(floorView(p, f.id).rooms))
      .map(segKey)
      .sort()
    expect(all).toEqual(per)
  })

  test('1F 的墙不受 2F 影响：删掉 2F 后 1F 的墙段完全一样', () => {
    const p = normalizePlan(twoStoryPlan())!
    const one = wallSegments(floorView(p, '1f').rooms).map(segKey).sort()
    const q = clone(p)
    q.rooms = q.rooms.filter((r) => r.floor !== '2f')
    expect(wallSegments(q.rooms).map(segKey).sort()).toEqual(one)
  })

  test('上下层完全重合的两个房间：各自四面都是外墙（不会被当成隔墙）', () => {
    const p: Plan = { ...normalizePlan(twoStoryPlan())!, rooms: [{ id: 'a', name: 'A', kind: 'western', points: rectPoints(0, 0, 300, 300) }, { id: 'b', name: 'B', kind: 'western', points: rectPoints(0, 0, 300, 300), floor: '2f' }], openings: [] }
    const segs = wallSegments(p.rooms)
    expect(segs.length).toBe(8)
    expect(segs.every((s) => s.kind === 'outer')).toBe(true)
  })

  test('外轮廓：1F 外轮廓是 900 × 800 的矩形', () => {
    const p = normalizePlan(twoStoryPlan())!
    const o = floorOutline(floorView(p, '1f').rooms)!
    expect(o.length).toBe(4)
    expect(area(o)).toBe(900 * 800)
  })
})

describe('楼梯', () => {
  test('楼梯在上层开洞：洞口 = 楼梯占地，在 2F，不和 2F 的非走廊房间重叠', () => {
    const p = normalizePlan(twoStoryPlan())!
    const holes = stairHoles(p, '2f')
    expect(holes.length).toBe(1)
    expect(area(holes[0].poly)).toBeCloseTo(90 * 360, 3)
    expect(stairHoles(p, '1f')).toEqual([])
    expect(stairHoleConflicts(p)).toEqual([])
  })

  test('洞口压到卧室时报冲突；改成挑空 / 走廊就不报', () => {
    const p = normalizePlan(twoStoryPlan())!
    const q = clone(p)
    q.rooms.find((r) => r.id === 'hall2')!.kind = 'western'
    expect(stairHoleConflicts(q).map((c) => c.roomId)).toEqual(['hall2'])
    q.rooms.find((r) => r.id === 'hall2')!.kind = 'void'
    expect(stairHoleConflicts(q)).toEqual([])
  })

  test('四种形式：级数按层间高、最后一级和上层地面齐平、踏步都在占地里', () => {
    const p = normalizePlan(twoStoryPlan())!
    const rise = riseOf(p, '1f')
    expect(rise).toBe(270)
    for (const v of ['straight', 'l', 'u', 'spiral'] as const) {
      for (const turn of ['left', 'right'] as const) {
        const f = { id: 's', kind: 'stairs' as const, stairs: v, turn, x: 0, y: 0, rot: 0, ...STAIRS_SIZE[v] }
        const L = stairLayout(f, rise)
        expect(L.steps.length).toBe(Math.ceil(rise / 20))
        expect(L.steps[L.steps.length - 1].top).toBeCloseTo(rise, 6)
        for (let i = 1; i < L.steps.length; i++) expect(L.steps[i].top).toBeGreaterThan(L.steps[i - 1].top)
        for (const s of L.steps) for (const q of s.poly) expect(Math.abs(q.x) <= f.w / 2 + 1e-6 && Math.abs(q.y) <= f.d / 2 + 1e-6).toBe(true)
      }
    }
  })

  test('挑空房间也在楼板上挖空', () => {
    const p = normalizePlan(twoStoryPlan())!
    p.rooms.push({ id: 'v', name: '挑空', kind: 'void', points: rectPoints(0, 0, 200, 200), floor: '2f' })
    expect(slabHoles(p, '2f').length).toBe(2)
  })
})

describe('其他模块', () => {
  test('检查清单按层汇总：每个房间的条目只出现一次', () => {
    const p = normalizePlan(twoStoryPlan())!
    const items = checklist(p)
    const keys = items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(items.some((i) => i.roomId === 'bed1')).toBe(true)
    expect(items.some((i) => i.roomId === 'ldk')).toBe(true)
  })
})

describe('3D 多层搭建', () => {
  test('单层户型：和直接 buildHouse 一样只有一层组，在 y = 0', () => {
    const p = normalizePlan(clone(generatePlan({ seed: 5, ...JP_OPTS }).plan))!
    const { floors } = buildBuilding(p, 240)
    expect(floors.length).toBe(1)
    expect(floors[0].group.position.y).toBe(0)
    const a = new THREE.Box3().setFromObject(floors[0].group)
    const b = new THREE.Box3().setFromObject(buildHouse(p, 240))
    expect(a.min.toArray()).toEqual(b.min.toArray())
    expect(a.max.toArray()).toEqual(b.max.toArray())
  })

  test('两层户型：每层组放在自己的 elevation 上，2F 的模型顶在 2F 墙高附近，楼板底在 -SLAB', () => {
    const p = normalizePlan(twoStoryPlan())!
    const { floors } = buildBuilding(p, 240)
    expect(floors.map((f) => f.group.position.y)).toEqual([0, 270])
    const top = floors[1]
    const box = new THREE.Box3().setFromObject(top.group)
    expect(box.min.y).toBeCloseTo(270 - SLAB, 0)
    expect(box.max.y).toBeGreaterThanOrEqual(270 + 240 - 1)
    expect(box.max.y).toBeLessThan(270 + 240 + 5)
    // 楼梯在 1F 组里，顶到层间高
    let stairs: THREE.Object3D | null = null
    floors[0].group.traverse((o) => {
      if (o.userData.fixtureId === 'stairs') stairs = o
    })
    expect(stairs).not.toBeNull()
    const sb = new THREE.Box3().setFromObject(stairs!)
    expect(sb.max.y).toBeGreaterThan(270)
  })
})
