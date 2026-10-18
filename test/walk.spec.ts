// 第一人称漫游（three/walk.ts）：走动时不穿墙、不穿家具，能沿楼梯上下楼，能走到阳台。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { Walker } from '/src/three/walk'
import { decorate } from '/src/decorate'
import { floorById, isMultiFloor } from '/src/floors'
import { pointInPolygon, type Plan } from '/src/model'
import { genJp } from './helpers'
import { generatePlan } from '/src/generate-region'
import { decorateHouse } from '/src/decorate'
import { JP_OPTS } from './helpers'

const walkerOf = (plan: Plan) => {
  const floors: string[] = []
  const w = new Walker(plan, new THREE.PerspectiveCamera(), { lift: (id) => floorById(plan, id)?.elevation ?? 0, onFloor: (id) => floors.push(id) })
  return { w, floors }
}

describe('第一人称漫游', () => {
  test('乱走 30 秒：脚下始终站得下（不卡进墙里、家具里）', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = genJp(seed)
      plan.furniture = decorate(plan, seed)
      const { w } = walkerOf(plan)
      const g = () => w.nav.grid(w.floor)
      expect(g().canStand('walk', w.pos, 12), `seed ${seed} 出生点`).toBe(true)
      w.hold('w', true)
      for (let i = 0; i < 1800; i++) {
        // 每隔一阵转个向，撞墙后会沿墙滑
        if (i % 90 === 0) w.look(((i * 7919) % 400) - 200, 0)
        w.update(1 / 60)
        if (!w.onStairs) expect(g().canStand('walk', w.pos, 11.9), `seed ${seed} 第 ${i} 帧 (${w.pos.x.toFixed(0)}, ${w.pos.y.toFixed(0)})`).toBe(true)
      }
    }
  })

  test('走到楼梯口朝楼梯走：上到二楼，再掉头下到一楼', () => {
    for (const region of ['jp', 'cn', 'west'] as const) {
      const plan = generatePlan({ ...JP_OPTS, seed: 1, region, dwelling: 'house' }).plan
      plan.furniture = decorateHouse(plan, 1)
      expect(isMultiFloor(plan)).toBe(true)
      const { w, floors } = walkerOf(plan)
      const link = w.nav.links[0]
      expect(link, region).toBeTruthy()
      // 站到起步口外侧，面朝楼梯
      w.floor = link.from
      w.pos = w.nav.grid(link.from).nearest('walk', link.entry, 18, 60)!
      const face = (q: { x: number; y: number }) => (w.yaw = Math.atan2(-(q.x - w.pos.x), -(q.y - w.pos.y)))
      face(link.pts[3])
      w.hold('w', true)
      for (let i = 0; i < 1200 && w.floor !== link.to; i++) w.update(1 / 60)
      expect(w.floor, `${region} 上楼`).toBe(link.to)
      expect(floors).toEqual([link.to])
      w.hold('w', false)
      for (let i = 0; i < 30; i++) w.update(1 / 60)
      // 回到出梯口外侧，面朝楼梯往下走
      w.pos = w.nav.grid(link.to).nearest('walk', link.exit, 18, 60)!
      face(link.pts[link.pts.length - 4])
      w.hold('w', true)
      for (let i = 0; i < 1200 && w.floor !== link.from; i++) w.update(1 / 60)
      expect(w.floor, `${region} 下楼`).toBe(link.from)
    }
  })

  test('阳台从落地窗走得到', () => {
    let checked = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plan = genJp(seed)
      const balcony = plan.rooms.find((r) => r.kind === 'balcony')
      if (!balcony) continue
      const { w } = walkerOf(plan)
      const g = w.nav.grid(w.floor)
      const inside = g.nearest('walk', w.pos, 18, 60)!
      const spot = plan.rooms
        .filter((r) => r.kind === 'balcony')
        .map((r) => g.randomSpot('walk', 18, Math.random, undefined, Infinity, 0))
        .find((p) => p && pointInPolygon(p, balcony.points))
      const target = spot ?? g.nearest('walk', { x: balcony.points.reduce((s, p) => s + p.x, 0) / balcony.points.length, y: balcony.points.reduce((s, p) => s + p.y, 0) / balcony.points.length }, 18, 80)
      expect(target, `seed ${seed} 阳台上没有能站的地方`).toBeTruthy()
      expect(g.path('walk', inside, target!, 18), `seed ${seed} 走不到阳台`).toBeTruthy()
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})
