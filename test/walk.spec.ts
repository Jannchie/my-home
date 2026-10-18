// 第一人称漫游（three/walk.ts）：走动时不穿墙、不穿家具，能沿楼梯上下楼，能走到阳台。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { Walker, ceilings } from '/src/three/walk'
import { slabHoles } from '/src/stairs'
import { floorAbove, planFloors } from '/src/floors'
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

  test('从出生点走得进每个房间（卫生间、浴室这类窄门、阳台也进得去）', () => {
    const bad: string[] = []
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = genJp(seed)
      plan.furniture = decorate(plan, seed)
      const { w } = walkerOf(plan)
      const g = w.nav.grid(w.floor)
      for (const r of plan.rooms) {
        if (r.kind === 'void' || r.kind === 'storage') continue
        // 房间里有一处能站、走得过去就行（房间中央可能被床、桌子围住）
        const xs = r.points.map((p) => p.x)
        const ys = r.points.map((p) => p.y)
        const spots: { x: number; y: number }[] = []
        for (let x = Math.min(...xs) + 5; x < Math.max(...xs); x += 10)
          for (let y = Math.min(...ys) + 5; y < Math.max(...ys); y += 10) if (pointInPolygon({ x, y }, r.points) && g.canStand('walk', { x, y }, 12)) spots.push({ x, y })
        const step = Math.max(1, Math.floor(spots.length / 12))
        if (!spots.filter((_, i) => i % step === 0).some((p) => g.path('walk', w.pos, p, 12))) bad.push(`seed ${seed}: ${r.name}（${r.kind}）`)
      }
    }
    expect(bad).toEqual([])
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

  test('天花板在上层楼板开洞的地方（楼梯洞口）是空的，别处盖着', () => {
    for (const region of ['jp', 'cn', 'west'] as const) {
      const plan = generatePlan({ ...JP_OPTS, seed: 1, region, dwelling: 'house' }).plan
      const lift = (id: string) => floorById(plan, id)!.elevation
      const H = (id: string) => lift(id) + floorById(plan, id)!.height
      const root = ceilings(plan, H)
      root.traverse((n) => ((n as THREE.Mesh).isMesh ? ((n as THREE.Mesh).raycast = THREE.Mesh.prototype.raycast) : 0))
      root.updateMatrixWorld(true)
      const ray = new THREE.Raycaster()
      // 从这一层地面往上 100 打一条射线，碰到的第一块天花板要在这一层顶上
      const covered = (floor: string, x: number, y: number) => {
        ray.set(new THREE.Vector3(x, lift(floor) + 100, y), new THREE.Vector3(0, 1, 0))
        ray.far = H(floor) - lift(floor)
        return ray.intersectObject(root, true).length > 0
      }
      const f1 = planFloors(plan)[0].id
      const holes = slabHoles(plan, floorAbove(plan, f1)!.id)
      expect(holes.length, region).toBeGreaterThan(0)
      for (const h of holes) {
        const c = h.reduce((a, p) => ({ x: a.x + p.x / h.length, y: a.y + p.y / h.length }), { x: 0, y: 0 })
        expect(covered(f1, c.x, c.y), `${region} 楼梯洞口被天花板盖住`).toBe(false)
      }
      const ldk = plan.rooms.find((r) => (r.floor ?? f1) === f1 && r.kind === 'ldk' && !holes.some((h) => r.points.some((p) => pointInPolygon(p, h))))
      if (ldk) {
        const c = ldk.points.reduce((a, p) => ({ x: a.x + p.x / ldk.points.length, y: a.y + p.y / ldk.points.length }), { x: 0, y: 0 })
        if (pointInPolygon(c, ldk.points)) expect(covered(f1, c.x, c.y), `${region} 客厅没有天花板`).toBe(true)
      }
    }
  })
})
