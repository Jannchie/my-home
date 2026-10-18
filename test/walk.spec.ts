// 第一人称漫游（three/walk.ts）：走动时不穿墙、不穿家具，能沿楼梯上下楼，能走到阳台。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { MouseFilter, Walker, ceilings } from '/src/three/walk'
import { slabHoles, type StairWalk } from '/src/stairs'
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

/**
 * 像玩家一样上下楼：每帧把视角转向楼梯路线（stairWalk.pts）前方一小段的点，按住前进键。
 * 走楼梯本身不再帮忙转向，拐角平台得自己转过去。
 */
const steer = (w: Walker, link: StairWalk, up: boolean) => {
  const pts = up ? link.pts : [...link.pts].reverse()
  let at = 0
  return () => {
    for (let i = at; i < Math.min(pts.length, at + 12); i++) if (Math.hypot(pts[i].x - w.pos.x, pts[i].y - w.pos.y) < Math.hypot(pts[at].x - w.pos.x, pts[at].y - w.pos.y)) at = i
    const t = pts[Math.min(pts.length - 1, at + 4)]
    w.yaw = Math.atan2(-(t.x - w.pos.x), -(t.y - w.pos.y))
  }
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
    // duplex seed 3：直梯在挑空里，出梯口紧挨着挑空边，上层网格离出梯口一拃多才站得下
    const cases = [...(['jp', 'cn', 'west'] as const).map((region) => ({ region, seed: 1, dwelling: 'house' as const })), { region: 'jp' as const, seed: 3, dwelling: 'duplex' as const }]
    for (const { region, seed, dwelling } of cases) {
      const plan = generatePlan({ ...JP_OPTS, seed, region, dwelling }).plan
      plan.furniture = decorateHouse(plan, seed)
      expect(isMultiFloor(plan)).toBe(true)
      const { w, floors } = walkerOf(plan)
      const link = w.nav.links[0]
      expect(link, region).toBeTruthy()
      // 站到起步口外侧，面朝楼梯
      w.floor = link.from
      w.pos = w.nav.grid(link.from).nearest('walk', link.entry, 18, 60)!
      let turn = steer(w, link, true)
      w.hold('w', true)
      for (let i = 0; i < 1200 && w.floor !== link.to; i++) {
        turn()
        w.update(1 / 60)
      }
      expect(w.floor, `${region} 上楼`).toBe(link.to)
      expect(floors).toEqual([link.to])
      w.hold('w', false)
      for (let i = 0; i < 30; i++) w.update(1 / 60)
      // 回到出梯口外侧，面朝楼梯往下走
      w.pos = w.nav.grid(link.to).nearest('walk', link.exit, 18, 60)!
      turn = steer(w, link, false)
      w.hold('w', true)
      for (let i = 0; i < 1200 && (w.floor !== link.from || w.onStairs); i++) {
        turn()
        w.update(1 / 60)
      }
      expect(w.floor, `${region} 下楼`).toBe(link.from)
      expect(w.onStairs, `${region} 下楼`).toBe(false)
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

  test('从楼梯口旁边横着走过（比如去旁边的门）：不会被吸上楼梯，镜头朝向不变', () => {
    const plan = generatePlan({ ...JP_OPTS, seed: 1, region: 'jp', dwelling: 'house' }).plan
    const { w } = walkerOf(plan)
    const link = w.nav.links[0]
    w.floor = link.from
    w.pos = w.nav.grid(link.from).nearest('walk', link.entry, 15, 60)!
    // 楼梯走向的垂直方向
    const t = { x: link.pts[3].x - link.entry.x, y: link.pts[3].y - link.entry.y }
    const side = { x: -t.y, y: t.x }
    w.yaw = Math.atan2(-side.x, -side.y)
    const yaw0 = w.yaw
    w.hold('w', true)
    for (let i = 0; i < 90; i++) {
      w.update(1 / 60)
      expect(w.onStairs).toBe(false)
    }
    expect(w.yaw).toBe(yaw0)
  })

  test('楼梯上不沿路线拉着走、不自动转向：横着朝扶手走就停在扶手前', () => {
    for (const region of ['jp', 'cn', 'west'] as const) {
      const plan = generatePlan({ ...JP_OPTS, seed: 1, region, dwelling: 'house' }).plan
      const { w } = walkerOf(plan)
      const link = w.nav.links[0]
      w.floor = link.from
      w.pos = w.nav.grid(link.from).nearest('walk', link.entry, 15, 60)!
      w.yaw = Math.atan2(-(link.pts[8].x - w.pos.x), -(link.pts[8].y - w.pos.y))
      w.hold('w', true)
      for (let i = 0; i < 50; i++) w.update(1 / 60)
      expect(w.onStairs, region).toBe(true)
      // 转 90° 朝梯段侧面走
      const t = { x: link.pts[8].x - link.entry.x, y: link.pts[8].y - link.entry.y }
      const tl = Math.hypot(t.x, t.y)
      w.yaw += Math.PI / 2
      const yaw0 = w.yaw
      const p0 = { ...w.pos }
      for (let i = 0; i < 120; i++) w.update(1 / 60)
      expect(w.yaw, region).toBe(yaw0)
      expect(w.onStairs, region).toBe(true)
      // 沿楼梯方向几乎没动（不会被拉着上楼），横向被扶手 / 墙挡住，走不了多远
      expect(Math.abs(((w.pos.x - p0.x) * t.x + (w.pos.y - p0.y) * t.y) / tl), region).toBeLessThan(15)
      expect(Math.hypot(w.pos.x - p0.x, w.pos.y - p0.y), region).toBeLessThan(60)
    }
  })

  test('鼠标位移过滤：锁定后的头一下、单次几百像素的毛刺丢掉，正常移动和快速甩动保留', () => {
    const f = new MouseFilter()
    f.reset(0)
    expect(f.accept(5, 3, 50)).toBe(false)
    expect(f.accept(5, 3, 200)).toBe(true)
    for (let i = 0; i < 10; i++) f.accept(12, 4, 210 + i)
    expect(f.accept(0, 640, 230)).toBe(false)
    expect(f.accept(900, 0, 231)).toBe(false)
    // 逐渐加快的快速甩动不当毛刺
    let ok = 0
    for (let v = 20; v <= 200; v += 15) if (f.accept(v, 0, 240 + v)) ok++
    expect(ok).toBe(13)
  })

  test('楼梯走到一半掉头（视角转 180°）再按前进：往回走下楼', () => {
    const plan = generatePlan({ ...JP_OPTS, seed: 1, region: 'jp', dwelling: 'house' }).plan
    const { w } = walkerOf(plan)
    const link = w.nav.links[0]
    w.floor = link.from
    w.pos = w.nav.grid(link.from).nearest('walk', link.entry, 15, 60)!
    w.yaw = Math.atan2(-(link.pts[3].x - w.pos.x), -(link.pts[3].y - w.pos.y))
    w.hold('w', true)
    for (let i = 0; i < 50; i++) w.update(1 / 60)
    expect(w.onStairs).toBe(true)
    w.look(-Math.PI / 0.0042, 0)
    for (let i = 0; i < 1200 && w.onStairs; i++) w.update(1 / 60)
    expect(w.onStairs).toBe(false)
    expect(w.floor).toBe(link.from)
  })

  test('上楼梯时头顶是上层楼板的那一段：镜头不钻进楼板（低一下头）', () => {
    for (const region of ['jp', 'cn', 'west'] as const) {
      const plan = generatePlan({ ...JP_OPTS, seed: 1, region, dwelling: 'house' }).plan
      const cam = new THREE.PerspectiveCamera()
      const w = new Walker(plan, cam, { lift: (id) => floorById(plan, id)?.elevation ?? 0, onFloor: () => {} })
      const link = w.nav.links[0]
      const holes = slabHoles(plan, link.to)
      const slabBottom = floorById(plan, link.to)!.elevation - 30
      w.floor = link.from
      w.pos = w.nav.grid(link.from).nearest('walk', link.entry, 15, 60)!
      const turn = steer(w, link, true)
      w.hold('shift', true)
      w.hold('w', true)
      let under = 0
      for (let i = 0; i < 1200 && w.floor !== link.to; i++) {
        turn()
        w.update(1 / 60)
        // 已经换到上层（踩上上层地面）的那一帧不算
        if (w.floor === link.to) break
        const p = { x: cam.position.x, y: cam.position.z }
        if (holes.some((h) => pointInPolygon(p, h))) continue
        // 脚已经到上层楼板以上（最后一步跨上上层地面）：头顶不是这块楼板
        if (cam.position.y - 150 >= slabBottom) continue
        under++
        expect(cam.position.y, `${region} 第 ${i} 帧`).toBeLessThan(slabBottom - 5)
      }
      expect(w.floor).toBe(link.to)
      expect(under).toBeGreaterThan(0)
    }
  })
})
