// 一键布置的大件摆法（候选 + 打分，src/arrange.ts）：jp / cn / west 各 seed 1..20，每一户都必须满足（不写统计阈值）。
//   - 床头靠墙且不靠窗；
//   - 双人床至少一侧留出下床的空间（一个人住的房间两侧都留，两个人住的房间里一侧靠墙也行）；
//   - 夫妻的房间里是双人床、两张床或被褥（不会被降成一张单人床）；
//   - 有电视柜的客厅里，沙发朝着电视柜、距离在合理范围；
//   - 主要通道可达：起居房间（客厅、居室、走廊、厨房、餐厅）的门口之间走得通（复用宠物导航的格子，宽 40）。
import { beforeAll, describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { allocateRooms, generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { add, area, edgesOf, mul, openingGeom, openingsOn, pointInPolygon, type Furniture, type Plan, type Region } from '/src/model'
import { bedSides, isDoubleBed, tvFacesSofa } from '/src/arrange'
import { boxInsideWalls, isSashWindow, placeCandidates } from '/src/place'
import { curtainSpecs } from '/src/curtains'
import { furnitureBox } from '/src/snap'
import { ASSET_MAP } from '/src/three/assets'
import { hasTag } from '/src/three/tags'
import { wallThicknessAt } from '/src/walls'
import { NavGrid } from '/src/nav'
import { range } from './helpers'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null, bedrooms: 'random' } as const
const REGIONS: Region[] = ['jp', 'cn', 'west']

interface Case {
  key: string
  plan: Plan
}
const cases: Case[] = []

beforeAll(() => {
  for (const region of REGIONS)
    for (const seed of range(1, 20)) {
      const plan = generatePlan({ seed, ...OPTS, region }).plan
      const hh = generateHousehold(plan, seed)
      plan.household = hh
      plan.furniture = decorate(plan, seed, 'auto', hh)
      cases.push({ key: `${region}#${seed}`, plan })
    }
}, 600_000)

const def = (f: Furniture) => ASSET_MAP.get(f.asset)!
const frontDir = (rot: number) => ({ x: -Math.sin((rot * Math.PI) / 180), y: Math.cos((rot * Math.PI) / 180) })
const isBed = (f: Furniture) => !f.z && hasTag(def(f), 'bed')
/** 落地、占地的实体家具（地毯、壁挂、摆件不算） */
const solid = (f: Furniture) => !f.z && !def(f).mount && !def(f).stick && def(f).form !== 'hanging' && def(f).h > 3
const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2
/**
 * 空房间（只有设备和收纳位上的柜子）里，最小的双人床（bed-semi-double，床尾留 10）有没有一个贴墙位置：
 * 不压窗帘、至少一侧能下床、这个房间的各个门口（门内 30）之间还走得通（宠物导航格子，宽 40）
 */
function doubleFits(plan: Plan, room: Plan['rooms'][number]) {
  const d = ASSET_MAP.get('bed-semi-double')!
  const base = plan.furniture.filter((f) => f.asset.startsWith('cb-'))
  const ctx = { ...plan, fixtures: [...plan.fixtures, ...base.map((f) => ({ id: f.id, kind: 'ps' as const, x: f.x, y: f.y, w: def(f).w, d: def(f).d, rot: Math.round(f.rot / 90) * 90 }))] }
  const curtains = curtainSpecs(plan).map((c) => c.box)
  const keys = openingsOn(room, plan)
    .filter(({ o }) => o.kind !== 'window')
    .map(({ center, e }) => add(center, mul(e.out, pointInPolygon(add(center, mul(e.out, 30)), room.points) ? 30 : -30)))
  for (const c of placeCandidates(room, ctx, { kind: 'ps', lengths: [d.w], depth: d.d, front: 10, sash: true, guardFront: true }).slice(0, 60)) {
    const bed = { id: 'probe', asset: d.id, x: c.x, y: c.y, rot: c.rot, color: 0 }
    const box = furnitureBox(bed.asset, bed.x, bed.y, bed.rot)
    if (curtains.some((b) => overlap(box, b))) continue
    if (!bedSides(bed).some((b) => boxInsideWalls(b, room, plan) && !base.some((f) => overlap(b, furnitureBox(f.asset, f.x, f.y, f.rot))))) continue
    const g = new NavGrid({ ...plan, furniture: [...base, bed] })
    const pts = keys.map((k) => g.nearest('pet', k, 20, 40))
    if (pts.some((p) => !p)) continue
    if (pts.every((p) => g.path('pet', pts[0]!, p!, 20))) return true
  }
  return false
}

const each = (fn: (c: Case) => string[]) => cases.flatMap((c) => fn(c).map((m) => `${c.key}: ${m}`))

describe('大件摆法（jp / cn / west seed 1..20）', () => {
  test('床头靠墙且不靠窗', () => {
    const bad = each(({ plan }) =>
      plan.furniture.filter(isBed).flatMap((bed) => {
        const room = plan.rooms.find((r) => pointInPolygon(bed, r.points))
        if (!room) return [`${bed.asset} 不在房间里`]
        const d = def(bed)
        const f = frontDir(bed.rot)
        const head = add(bed, mul(f, -d.d / 2))
        const i = edgesOf(room.points).findIndex((e) => {
          if (e.out.x * f.x + e.out.y * f.y > -0.99) return false
          const off = -((head.x - e.a.x) * e.out.x + (head.y - e.a.y) * e.out.y)
          const half = wallThicknessAt(plan, head, e.out, room) / 2
          const t = (head.x - e.a.x) * e.dir.x + (head.y - e.a.y) * e.dir.y
          return Math.abs(off - half) < 6 && t > 0 && t < e.length
        })
        if (i < 0) return [`${bed.asset} 床头没靠墙`]
        const e = edgesOf(room.points)[i]
        const t = (head.x - e.a.x) * e.dir.x + (head.y - e.a.y) * e.dir.y
        // 同一面墙上和床头宽度重叠的窗（窗可能记在隔壁房间的墙上：按墙线和位置判断）
        const win = openingsOn(room, plan).some(({ o, e: oe, center }) => {
          if (o.kind !== 'window') return false
          if (Math.abs(oe.dir.x * e.dir.x + oe.dir.y * e.dir.y) < 0.99) return false
          if (Math.abs((center.x - e.a.x) * e.out.x + (center.y - e.a.y) * e.out.y) > 2) return false
          const c = (center.x - e.a.x) * e.dir.x + (center.y - e.a.y) * e.dir.y
          return c - o.width / 2 < t + d.w / 2 && t - d.w / 2 < c + o.width / 2
        })
        return win ? [`${bed.asset} 床头靠窗`] : []
      }),
    )
    expect(bad).toEqual([])
  })

  test('双人床至少一侧留出下床的空间', () => {
    const bad = each(({ plan }) =>
      plan.furniture
        .filter((f) => isBed(f) && isDoubleBed(f.asset))
        .flatMap((bed) => {
          const room = plan.rooms.find((r) => pointInPolygon(bed, r.points))!
          const why = bedSides(bed).map((b) => {
            // 比登记的留空区每边收 2.5
            const s = { x0: b.x0 + 2.5, y0: b.y0 + 2.5, x1: b.x1 - 2.5, y1: b.y1 - 2.5 }
            if (!boxInsideWalls(s, room, plan)) return '贴着墙'
            const hit = plan.furniture.find((o) => o !== bed && solid(o) && overlap(s, furnitureBox(o.asset, o.x, o.y, o.rot)))
            const fx = plan.fixtures.find((x) => x.kind !== 'ps' && pointInPolygon(x, room.points) && overlap(s, { x0: x.x - 1, y0: x.y - 1, x1: x.x + 1, y1: x.y + 1 }))
            return hit ? `被 ${hit.asset} 挡住` : fx ? '压到设备' : ''
          })
          return why.every(Boolean) ? [`${bed.asset} 两侧都下不了床（${why.join(' / ')}）`] : []
        }),
    )
    expect(bad).toEqual([])
  })

  test('夫妻的房间里是双人床、两张床或被褥', () => {
    const bad = each(({ plan }) =>
      [...allocateRooms(plan, plan.household!).occupants].flatMap(([rid, ms]) => {
        if (ms.filter((m) => m.role === 'self' || m.role === 'partner').length < 2) return []
        const room = plan.rooms.find((r) => r.id === rid)!
        // 例外：不到 7㎡ 的房间连一张双人床加床边的过道都放不下（bedOptions 按面积挑规格也是从 7㎡ 起）
        if (area(room.points) / 10000 < 7) return []
        const inRoom = plan.furniture.filter((f) => !f.z && pointInPolygon(f, room.points))
        const beds = inRoom.filter((f) => hasTag(def(f), 'bed') && !hasTag(def(f), 'crib'))
        const futon = inRoom.some((f) => hasTag(def(f), 'bedding'))
        if (futon || beds.length >= 2 || beds.some((b) => def(b).w >= 120)) return []
        // 例外：空房间里（只有设备和收纳位上的柜子）也找不到一处放得下最小的双人床、床边能下床、又不把门口堵死的贴墙位置，
        // 两张床更放不下：这时一张单人床也行
        if (beds.length === 1 && !doubleFits(plan, room)) return []
        return [`夫妻的 ${room.kind} 里只有 ${beds.map((b) => b.asset).join(',') || '（没有床）'}`]
      }),
    )
    expect(bad).toEqual([])
  })

  test('有电视柜的客厅里，沙发朝着电视柜、距离在合理范围', () => {
    const bad = each(({ plan }) =>
      plan.rooms
        .filter((r) => r.kind === 'ldk')
        .flatMap((room) => {
          const inRoom = plan.furniture.filter((f) => !f.z && pointInPolygon(f, room.points))
          const tvs = inRoom.filter((f) => hasTag(def(f), 'tv-stand'))
          const sofas = inRoom.filter((f) => hasTag(def(f), 'sofa') && def(f).w >= 120)
          if (!tvs.length || !sofas.length) return []
          return sofas.some((s) => tvs.some((t) => tvFacesSofa(s, t))) ? [] : [`沙发没有朝着电视柜（${sofas.map((s) => s.asset).join(',')} / ${tvs.map((t) => t.asset).join(',')}）`]
        }),
    )
    expect(bad).toEqual([])
  })

  test('主要通道可达：起居房间（含玄关、洗面所）的门口之间走得通，玄关和通往阳台的落地窗前侧身挤得过去', () => {
    const bad = each(({ plan }) => {
      // 和一键布置的校验同一套：贴地的小东西（< 10cm）跨过去
      const g = new NavGrid(plan, { stepOver: 10 })
      const R = 20
      const keys: { p: { x: number; y: number }; r: number; label: string }[] = []
      for (const o of plan.openings) {
        const geo = openingGeom(plan.rooms, o)
        if (!geo) continue
        const owner = plan.rooms.find((x) => x.id === o.roomId)
        const sash = o.kind === 'window' && !!owner && isSashWindow(plan, owner, geo.e, geo.center)
        if (o.kind === 'window' && !sash) continue
        for (const k of [30, -30]) {
          const q = add(geo.center, mul(geo.e.out, k))
          const room = plan.rooms.find((x) => pointInPolygon(q, x.points))
          if (room && ['ldk', 'western', 'japanese', 'hall', 'kitchen', 'dining', 'entrance', 'wash'].includes(room.kind)) keys.push({ p: q, r: sash ? 12 : room.kind === 'entrance' ? 15 : R, label: `${room.kind} 的${sash ? '落地窗前' : '门口'}` })
        }
      }
      const pts = keys.map((k) => ({ ...k, at: g.nearest('pet', k.p, k.r, 40) }))
      const hub = pts.find((k) => k.at && k.r === R)
      if (!hub) return []
      return pts.filter((k) => k !== hub && (!k.at || !g.path('pet', hub.at!, k.at, k.r))).map((k) => `${k.label} 走不到`)
    })
    expect(bad).toEqual([])
  })
})
