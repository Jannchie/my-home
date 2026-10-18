// 门口和楼梯：生成的户建 / 复式里，没有门的通行区、开门扇形压到楼梯梯段、扶手、上层洞口和洞口栏杆；出梯口外侧、起步前方都走得到。
// 3D 的楼梯扶手在门洞前断开（手动改出来的户型兜底）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { add, mul, pointInPolygon, type Plan, type Region, type Room, type Vec } from '/src/model'
import { floorOf, floorView, riseOf } from '/src/floors'
import { STAIR_CLEAR, lerpV, stairLayout, stairLinks, stairToWorld } from '/src/stairs'
import { doorStairConflicts } from '/src/stairDoors'
import { isOpenBetween } from '/src/walls'
import { cutRailAtDoors, stairWalls, stairsModel } from '/src/three/stairs3d'
import { JP_OPTS, range } from './helpers'
import { twoStoryPlan } from './twoStory'

const CASES: [Region, 'house' | 'duplex'][] = [
  ['jp', 'house'],
  ['jp', 'duplex'],
  ['cn', 'house'],
  ['cn', 'duplex'],
  ['west', 'house'],
]
const SEEDS = range(1, 40)
const plans = CASES.flatMap(([region, dwelling]) => SEEDS.map((seed) => [`${region}/${dwelling}/${seed}`, generatePlan({ ...JP_OPTS, seed, region, dwelling, bedrooms: 'random' }).plan] as [string, Plan]))

describe('生成的户型：门不被楼梯挡住', () => {
  test('覆盖到各种楼梯形式和部分二层', () => {
    const kinds = new Set(plans.map(([, p]) => p.fixtures.find((f) => f.kind === 'stairs')?.stairs))
    expect([...kinds].sort()).toEqual(['l', 'straight', 'u'])
    // 部分二层：2F 没有房间叠在 1F 的西北角上
    expect(plans.some(([, p]) => p.rooms.filter((r) => r.floor === '2f').length < p.rooms.filter((r) => !r.floor).length - 1)).toBe(true)
  })

  test.each(plans)('%s：门洞通行区、开门扇形不碰楼梯梯段 / 扶手 / 洞口 / 栏杆', (_, p) => {
    const hits = doorStairConflicts(p).map((h) => `${h.floor} ${p.rooms.find((r) => r.id === h.opening.roomId)?.name} ${h.opening.kind}: ${h.what}/${h.zone}`)
    expect(hits).toEqual([])
  })

  test.each(plans)('%s：出梯口外侧、起步前方在同一片地面上（没被墙隔开）', (_, p) => {
    for (const s of stairLinks(p)) {
      expect(s.lower, '起步处的房间').toBeTruthy()
      expect(s.upper, '出梯口外侧的房间').toBeTruthy()
      const f = s.stair
      const L = stairLayout(f, riseOf(p, floorOf(p, f)))
      const w = stairToWorld(f)
      const [a, b] = L.arrival
      const mid = lerpV(a, b, 0.5)
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      let out = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
      if (out.x * mid.x + out.y * mid.y < 0) out = mul(out, -1)
      // 出梯口外侧 STAIR_CLEAR 深的一片：每个采样点都在出梯口外那间房（或和它敞开相连的房间）里
      const upRooms = p.rooms.filter((r) => floorOf(p, r) === s.to && r.kind !== 'void')
      const ok = (q: Vec, home: Room, rooms: Room[]) => {
        const r = rooms.find((x) => pointInPolygon(q, x.points))
        return !!r && (r === home || isOpenBetween(r, home))
      }
      for (const k of [0.1, 0.5, 0.9])
        for (const dpt of [10, STAIR_CLEAR / 2, STAIR_CLEAR - 10]) {
          const q = w(add(lerpV(a, b, k), mul(out, dpt)))
          expect(ok(q, s.upper!, upRooms), `出梯口外 ${k}/${dpt}`).toBe(true)
        }
    }
  })
})

describe('检查器本身', () => {
  test('开在楼梯侧面墙上的门会被查出来', () => {
    const p = twoStoryPlan()
    expect(doorStairConflicts(p)).toEqual([])
    // 走廊东墙（外墙）上、正对直跑楼梯侧面开一扇门
    p.openings.push({ id: 'bad', kind: 'door', roomId: 'hall1', edge: 1, offset: 300, width: 80, hinge: 'start', swing: 'out' })
    const hits = doorStairConflicts(p).filter((h) => h.opening.id === 'bad')
    expect(hits.map((h) => h.what)).toContain('flight')
    expect(hits.map((h) => h.what)).toContain('stairRail')
  })

  test('上层：门正对楼梯洞口会被查出来', () => {
    const p = twoStoryPlan()
    // 2F 走廊东墙上正对洞口
    p.openings.push({ id: 'bad2', kind: 'sliding', roomId: 'hall2', edge: 1, offset: 300, width: 80, hinge: 'start', swing: 'in', floor: '2f' })
    expect(doorStairConflicts(p).filter((h) => h.opening.id === 'bad2').map((h) => h.what)).toContain('hole')
  })
})

describe('3D：楼梯扶手在门洞前断开', () => {
  test('cutRailAtDoors 去掉门洞那一截，高度按比例插值', () => {
    const pts = [
      { x: 0, y: 0, h: 0 },
      { x: 0, y: 300, h: 300 },
    ]
    const pieces = cutRailAtDoors(pts, [[{ x: -10, y: 100 }, { x: -10, y: 180 }]])
    expect(pieces).toHaveLength(2)
    expect(pieces[0][pieces[0].length - 1].y).toBeCloseTo(95)
    expect(pieces[1][0].y).toBeCloseTo(185)
    expect(pieces[1][0].h).toBeCloseTo(185)
    // 离得远的门（另一面墙）不影响
    expect(cutRailAtDoors(pts, [[{ x: -100, y: 100 }, { x: -100, y: 180 }]])).toHaveLength(1)
  })

  test('楼梯旁边墙上有门：扶手的杆件都不落在门洞范围里', () => {
    const p = twoStoryPlan()
    p.openings.push({ id: 'bad', kind: 'door', roomId: 'hall1', edge: 1, offset: 300, width: 80, hinge: 'start', swing: 'out' })
    const view = floorView(p, '1f')
    const f = p.fixtures.find((x) => x.kind === 'stairs')!
    const g = stairsModel(f, 270, stairWalls(view))
    g.position.set(f.x, 0, f.y)
    g.rotation.y = (-f.rot * Math.PI) / 180
    g.updateMatrixWorld(true)
    // 门洞：x = 900 的墙上 y 560..640；扶手（细杆）的中心不能落在门前 40 以内、门宽范围里
    const bad: string[] = []
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || !(m.geometry instanceof THREE.CylinderGeometry)) return
      const c = new THREE.Vector3()
      m.getWorldPosition(c)
      if (c.x > 860 && c.y > 0 && c.z > 562 && c.z < 638) bad.push(`${c.x.toFixed(0)},${c.y.toFixed(0)},${c.z.toFixed(0)}`)
    })
    expect(bad).toEqual([])
  })
})
