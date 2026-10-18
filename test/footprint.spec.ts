// 外轮廓变形（src/footprint.ts）：切角 / 凹阳台 / 凸窗 / 户建 L 形。
//   - 网格布尔运算、切角时门窗重挂、挂不上的门让整次变形放弃；
//   - 各生成器的外轮廓有变化（一部分种子不是矩形），房间都在外轮廓里、拼起来没有缝（外墙连续成一圈）；
//   - 窗只开在外墙上，变形过的户型一键布置不出房间、3D 照常搭建。
import { describe, expect, test } from 'vitest'
import { bump, carve, gridPolygon } from '/src/footprint'
import { generatePlan } from '/src/generate-region'
import { floorOutline, floorView, planFloors } from '/src/floors'
import { add, area, edgeInfo, isAxisRect, mul, onBoundary, pointInPolygon, rectPoints, type Opening, type Plan, type Region, type Room } from '/src/model'
import { isIndoor } from '/src/walls'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { furnitureBox } from '/src/snap'
import { ASSET_MAP } from '/src/three/assets'
import { buildBuilding } from '/src/three/building'
import { JP_OPTS, range } from './helpers'

const room = (id: string, kind: Room['kind'], x0: number, y0: number, x1: number, y1: number): Room => ({ id, kind, name: id, points: rectPoints(x0, y0, x1, y1) })
const op = (roomId: string, kind: Opening['kind'], edge: number, offset: number, width: number): Opening => ({ id: `o-${roomId}-${edge}-${offset}`, kind, roomId, edge, offset, width, hinge: 'start', swing: 'in' })
const center = (rooms: Room[], o: Opening) => {
  const r = rooms.find((x) => x.id === o.roomId)!
  const e = edgeInfo(r.points, o.edge)
  return add(e.a, mul(e.dir, o.offset))
}

describe('网格运算与切角', () => {
  test('矩形减去一角是 L 形（6 个点、面积对）；挖到中间断开 / 有洞返回 null', () => {
    const r = rectPoints(0, 0, 400, 300)
    const l = gridPolygon([r, rectPoints(250, 200, 400, 300)], (p) => pointInPolygon(p, r) && !(p.x > 250 && p.y > 200))!
    expect(l).toHaveLength(6)
    expect(area(l)).toBe(400 * 300 - 150 * 100)
    expect(gridPolygon([r, rectPoints(100, 100, 200, 200)], (p) => pointInPolygon(p, r) && !(p.x > 100 && p.x < 200 && p.y > 100 && p.y < 200))).toBeNull()
    expect(gridPolygon([r, rectPoints(100, 0, 200, 300)], (p) => pointInPolygon(p, r) && !(p.x > 100 && p.x < 200))).toBeNull()
  })

  test('切角：房间变 L 形，窗挂到同一朝向的外墙上，门留在原处', () => {
    const a = room('a', 'western', 0, 0, 400, 360)
    const b = room('b', 'hall', 400, 0, 520, 360)
    const win = op('a', 'window', 2, 200, 160) // 北墙正中
    const door = op('a', 'door', 1, 300, 75) // 东墙（通走廊）
    const t = { rooms: [a, b], openings: [win, door] }
    const before = center(t.rooms, door)
    expect(carve(t, { x0: 0, y0: 240, x1: 180, y1: 360 }, () => ({ mode: 'any', minArm: 150, minArea: 0 }))).toBe(true)
    expect(a.points).toHaveLength(6)
    expect(center(t.rooms, door)).toEqual(before)
    const c = center(t.rooms, win)
    expect(c.y).toBe(360)
    expect(c.x - win.width / 2).toBeGreaterThanOrEqual(180)
  })

  test('切角会让别的房间的门通向空处：放弃，什么都不改', () => {
    const a = room('a', 'western', 0, 0, 300, 360)
    const b = room('b', 'western', 300, 0, 600, 360)
    const door = op('b', 'door', 3, 60, 75) // b 的西墙靠北（边 3：(300,360)→(300,0)）
    const t = { rooms: [a, b], openings: [door] }
    const pts = a.points
    expect(carve(t, { x0: 0, y0: 240, x1: 300, y1: 360 }, () => ({ mode: 'any', minArm: 100, minArea: 0 }))).toBe(false)
    expect(a.points).toBe(pts)
  })

  test('凸窗：南墙中间凸出一块，窗挪到凸出部分的外墙', () => {
    const a = room('a', 'western', 0, 0, 400, 360)
    const win = op('a', 'window', 0, 200, 180)
    const t = { rooms: [a], openings: [win] }
    expect(bump(t, a, 's', 100, 300, 70)).toBe(true)
    expect(a.points).toHaveLength(8)
    expect(center(t.rooms, win).y).toBe(-70)
    expect(win.width).toBeLessThanOrEqual(150)
  })
})

// ---------------------------------------------------------------------------

const REGIONS: Region[] = ['jp', 'cn', 'west']
const APT_SEEDS = range(1, 60)
const HOUSE_SEEDS = range(1, 24)
const gen = (region: Region, seed: number, dwelling: 'apartment' | 'house') => generatePlan({ ...JP_OPTS, seed, region, dwelling, bedrooms: 'random' }).plan
const apts = new Map(REGIONS.map((r) => [r, APT_SEEDS.map((s) => gen(r, s, 'apartment'))]))
const houses = new Map(REGIONS.map((r) => [r, HOUSE_SEEDS.map((s) => gen(r, s, 'house'))]))
const all = () => [...apts.values(), ...houses.values()].flat()

/** 某一层的外轮廓不是矩形 */
const shaped = (p: Plan) => planFloors(p).some((f) => (floorOutline(floorView(p, f.id).rooms)?.length ?? 4) > 4)

describe('生成器的外轮廓', () => {
  test('外轮廓有变化：每种生成器都有一部分（不是全部）种子不是矩形', () => {
    for (const [r, ps] of [...apts].map(([r, ps]) => [`${r} 公寓`, ps] as const).concat([...houses].map(([r, ps]) => [`${r} 户建`, ps] as const))) {
      const n = ps.filter(shaped).length
      expect(n / ps.length, r).toBeGreaterThan(0.12)
      expect(n / ps.length, r).toBeLessThan(0.8)
    }
  })

  test('各种变形都出现：L 形阳台（日式）、凹阳台（中式）、凸窗（欧美）、户建 L 形两层对齐', () => {
    expect(apts.get('jp')!.some((p) => p.rooms.some((r) => r.kind === 'balcony' && r.points.length === 6))).toBe(true)
    expect(apts.get('cn')!.some((p) => p.rooms.some((r) => r.kind === 'balcony' && Math.min(...r.points.map((q) => q.y)) <= 0 && Math.max(...r.points.map((q) => q.y)) > 0))).toBe(true)
    expect(apts.get('west')!.some((p) => p.rooms.some((r) => isIndoor(r) && r.points.length === 8 && Math.min(...r.points.map((q) => q.y)) < 0))).toBe(true)
    // 户建：1F、2F 的外轮廓在切掉的那个角上一致（2F 不会伸到 1F 没有的地方）
    const L = [...houses.values()].flat().filter((p) => {
      const [o1, o2] = planFloors(p).map((f) => floorOutline(floorView(p, f.id).rooms))
      return o1 && o2 && o1.length > 4 && o2.every((q) => pointInPolygon(q, o1) || onBoundary(o1, q))
    })
    expect(L.length).toBeGreaterThan(3)
  })

  test('房间都在外轮廓里，拼起来没有缝：外墙连成一圈（面积 = 房间面积之和）', () => {
    const bad: string[] = []
    for (const p of all())
      for (const f of planFloors(p)) {
        const rooms = floorView(p, f.id).rooms.filter(isIndoor)
        const o = floorOutline(rooms)
        if (!o) {
          bad.push(`${p.name} ${f.id}: 外墙不成圈`)
          continue
        }
        const sum = rooms.reduce((s, r) => s + area(r.points), 0)
        if (Math.abs(area(o) - sum) > 1) bad.push(`${p.name} ${f.id}: 外轮廓 ${area(o)} ≠ 房间合计 ${sum}`)
        for (const r of rooms) if (!r.points.every((q) => pointInPolygon(q, o) || onBoundary(o, q))) bad.push(`${p.name} ${f.id}: ${r.name} 出了外轮廓`)
        // 直角多边形、没有重复点
        for (const r of rooms) if (r.points.some((q, i) => { const n = r.points[(i + 1) % r.points.length]; return q.x !== n.x && q.y !== n.y })) bad.push(`${p.name}: ${r.name} 有斜边`)
      }
    expect(bad).toEqual([])
  })

  test('窗只开在外墙上（外侧不是户内房间），门窗都在所在边的范围里', () => {
    const bad: string[] = []
    for (const p of all())
      for (const o of p.openings) {
        const r = p.rooms.find((x) => x.id === o.roomId)!
        const e = edgeInfo(r.points, o.edge)
        if (o.offset - o.width / 2 < -0.5 || o.offset + o.width / 2 > e.length + 0.5) bad.push(`${p.name}: ${r.name} 的 ${o.kind} 超出边`)
        if (o.kind !== 'window') continue
        const same = p.rooms.filter((x) => x !== r && isIndoor(x) && (x.floor ?? '') === (r.floor ?? ''))
        for (const k of [-0.4, 0, 0.4]) {
          const q = add(add(e.a, mul(e.dir, o.offset + k * o.width)), mul(e.out, 15))
          if (same.some((x) => pointInPolygon(q, x.points))) bad.push(`${p.name}: ${r.name} 的窗开在隔墙上`)
        }
      }
    expect([...new Set(bad)]).toEqual([])
  })

  test('和室切完仍是矩形（榻榻米）', () => {
    expect(all().flatMap((p) => p.rooms.filter((r) => r.kind === 'japanese' && !isAxisRect(r.points)).map((r) => `${p.name}: ${r.name}`))).toEqual([])
  })
})

describe('变形过的户型：一键布置、3D', () => {
  // 每个地区取前两户变形过的公寓 + 一户 L 形户建
  const picks: Plan[] = []
  for (const r of REGIONS) {
    picks.push(...apts.get(r)!.filter(shaped).slice(0, 2))
    picks.push(...houses.get(r)!.filter(shaped).slice(0, 1))
  }

  test('一键布置：家具都在房间里，不伸到外轮廓外面', () => {
    expect(picks.length).toBeGreaterThanOrEqual(8)
    const bad: string[] = []
    for (const [i, p] of picks.entries()) {
      const plan: Plan = JSON.parse(JSON.stringify(p))
      plan.household = generateHousehold(plan, i + 1)
      plan.furniture = decorate(plan, i + 1, 'auto', plan.household)
      for (const f of plan.furniture) {
        const fl = f.floor ?? planFloors(plan)[0].id
        const rooms = floorView(plan, fl).rooms
        if (!rooms.some((r) => pointInPolygon(f, r.points))) {
          // 户建的院子物件（yard.ts）本来就在房子外面、用地里面
          const yard = !!plan.site && !f.floor && pointInPolygon(f, plan.site.points)
          if (!yard && !/doorbell|peephole/.test(f.asset)) bad.push(`${plan.name}: ${f.asset} 不在房间里`)
          continue
        }
        const def = ASSET_MAP.get(f.asset)
        if (!def || def.mount || f.z) continue
        // 落地家具：缩进 3cm 的包围盒四角都落在某个房间（含阳台）里
        const b = furnitureBox(f.asset, f.x, f.y, f.rot)
        const corners = [
          { x: b.x0 + 3, y: b.y0 + 3 },
          { x: b.x1 - 3, y: b.y0 + 3 },
          { x: b.x1 - 3, y: b.y1 - 3 },
          { x: b.x0 + 3, y: b.y1 - 3 },
        ]
        if (b.x1 - b.x0 > 8 && b.y1 - b.y0 > 8 && !corners.every((q) => rooms.some((r) => pointInPolygon(q, r.points))))
          bad.push(`${plan.name}: ${f.asset} 伸出房间`)
      }
    }
    expect(bad).toEqual([])
  }, 300_000)

  test('3D 搭建不报错，墙体有东西', () => {
    for (const p of picks) {
      const { root } = buildBuilding(p, 240)
      let meshes = 0
      root.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) meshes++
      })
      expect(meshes, p.name).toBeGreaterThan(10)
    }
  })
})
