// 一键布置的穿模检查：jp / cn / west 各 seed 1..20，按实际模型包围盒查「不应该发生」的穿插。
// 只做结构性断言（没有统计阈值）；个别按设计允许的情况在下面注明。
import { beforeAll, describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { add, edgeInfo, edgesOf, mul, openingsOn, pointInPolygon, type Furniture, type Plan, type Region } from '/src/model'
import { supportOf, toLocal, toWorld } from '/src/surface'
import { ASSET_MAP, type AssetDef } from '/src/three/assets'
import { hasTag } from '/src/three/tags'
import { curtainSpecs, fixtureSpans } from '/src/curtains'
import { isOpenBetween, isIndoor, wallThicknessAt } from '/src/walls'
import { penetration, range } from './helpers'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const
const REGIONS: Region[] = ['jp', 'cn', 'west']
const SEEDS = range(1, 20)

interface Case {
  key: string
  plan: Plan
}
const cases: Case[] = []

beforeAll(() => {
  for (const region of REGIONS)
    for (const seed of SEEDS) {
      const plan = generatePlan({ seed, ...OPTS, region }).plan
      const hh = generateHousehold(plan, seed)
      plan.household = hh
      plan.furniture = decorate(plan, seed, 'auto', hh)
      cases.push({ key: `${region}#${seed}`, plan })
    }
}, 600_000)

// ---------- 实际模型包围盒（按素材缓存） ----------
const boxes = new Map<string, THREE.Box3>()
function lbox(asset: string) {
  let b = boxes.get(asset)
  if (!b) {
    const d = ASSET_MAP.get(asset)!
    const g = d.build(d.palettes[0] ?? [])
    g.updateMatrixWorld(true)
    b = new THREE.Box3().setFromObject(g, true)
    boxes.set(asset, b)
  }
  return b
}

type Role = 'floor' | 'prop' | 'wall' | 'hang' | 'flat'
interface Item {
  f: Furniture
  d: AssetDef
  role: Role
  poly: { x: number; y: number }[]
  y0: number
  y1: number
}
function itemOf(f: Furniture): Item {
  const d = ASSET_MAP.get(f.asset)!
  const b = lbox(f.asset)
  const role: Role = d.mount !== undefined || d.stick ? 'wall' : d.form === 'hanging' ? 'hang' : (f.z ?? 0) > 0.5 ? 'prop' : d.h <= 3 || b.max.y - b.min.y <= 3.5 ? 'flat' : 'floor'
  const poly = [
    [b.min.x, b.min.z],
    [b.max.x, b.min.z],
    [b.max.x, b.max.z],
    [b.min.x, b.max.z],
  ].map(([x, z]) => toWorld(f, x, z))
  return { f, d, role, poly, y0: (f.z ?? 0) + b.min.y, y1: (f.z ?? 0) + b.max.y }
}
const rectPoly = (b: { x0: number; y0: number; x1: number; y1: number }) => [
  { x: b.x0, y: b.y0 },
  { x: b.x1, y: b.y0 },
  { x: b.x1, y: b.y1 },
  { x: b.x0, y: b.y1 },
]
const vert = (a: { y0: number; y1: number }, b: { y0: number; y1: number }) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)

/** 挂在钩子上的东西挂在谁身上（钩子层附近 4cm 以内，柜子里的挂衣杆也算） */
function hookOwner(plan: Plan, f: Furniture) {
  for (const o of plan.furniture) {
    if (o.id === f.id) continue
    for (const l of ASSET_MAP.get(o.asset)?.surfaces ?? []) {
      if ((l.kind !== 'hook' && l.kind !== 'clip') || Math.abs((o.z ?? 0) + l.y - (f.z ?? 0)) > 0.6) continue
      const lp = toLocal(o, f)
      for (const pl of l.shape ?? []) {
        const xs = pl.map((q) => q[0])
        const zs = pl.map((q) => q[1])
        if (lp.x > Math.min(...xs) - 4 && lp.x < Math.max(...xs) + 4 && lp.y > Math.min(...zs) - 4 && lp.y < Math.max(...zs) + 4) return o.id
      }
    }
  }
  return null
}

/** 每件东西的支撑链（摆件 → 桌子 → …） */
function ancestry(plan: Plan, items: Item[]) {
  const parent = new Map<string, string>()
  for (const it of items) {
    if (it.role !== 'prop' && it.role !== 'hang') continue
    const p = supportOf(plan, it.f)?.ownerId ?? hookOwner(plan, it.f)
    if (p) parent.set(it.f.id, p)
  }
  const anc = new Map<string, Set<string>>()
  for (const it of items) {
    const s = new Set<string>()
    let p = parent.get(it.f.id)
    while (p && !s.has(p)) s.add(p), (p = parent.get(p))
    anc.set(it.f.id, s)
  }
  return anc
}

const all = (fn: (c: Case, items: Item[]) => string[]) =>
  cases.flatMap((c) => {
    const items = c.plan.furniture.map(itemOf)
    return fn(c, items).map((m) => `${c.key}: ${m}`)
  })

/** 椅子 / 坐垫 */
const isSeat = (d: AssetDef) => hasTag(d, 'chair', 'seat', 'stool', 'floor-cushion')
/** 桌子：椅子、比桌面矮的东西可以塞到下面 */
const isTable = (d: AssetDef) => !!d.surface && hasTag(d, 'table', 'desk', 'workbench', 'dining-table', 'low-table', 'coffee-table', 'kotatsu', 'vanity')
/** 主机机箱 */
const isTower = (d: AssetDef) => d.type === 'pc' || d.id === 'of-mini-pc'

describe('一键布置不穿模（jp / cn / west seed 1..20）', () => {
  test('落地家具、摆件、壁挂物都不嵌进墙里（墙面按半个墙厚算，敞开的边和门洞除外）', () => {
    const bad = all(({ plan }, items) => {
      const out: string[] = []
      for (const it of items) {
        if (it.role === 'flat') continue
        const rooms = plan.rooms.filter((r) => pointInPolygon(it.f, r.points))
        const room = rooms.find(isIndoor) ?? rooms[0]
        // 可视门铃 / 猫眼本来就装在门外
        if (!room) {
          if (!/doorbell|peephole/.test(it.f.asset)) out.push(`${it.f.asset} 出了房间`)
          continue
        }
        const samples = it.poly.flatMap((a, k) => {
          const b = it.poly[(k + 1) % it.poly.length]
          const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5))
          return Array.from({ length: n }, (_, s) => ({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n }))
        })
        const doors = openingsOn(room, plan).filter(({ o }) => o.kind !== 'window')
        // 嵌墙收纳位（壁龛）：正面那段墙挖开了，里面的柜子和柜里的东西本来就伸进墙里
        const niches = plan.fixtures
          .filter((x) => x.kind === 'builtin' && x.recessed)
          .map((x) => {
            const a = (x.rot * Math.PI) / 180
            const d = x.d ?? 38
            return { c: { x: x.x - Math.sin(a) * (d / 2), y: x.y + Math.cos(a) * (d / 2) }, half: x.w / 2 + 1 }
          })
        let worst = 0
        for (const e of edgesOf(room.points)) {
          const half = wallThicknessAt(plan, add(e.a, mul(e.dir, e.length / 2)), e.out, room) / 2
          for (const p of samples) {
            const t = (p.x - e.a.x) * e.dir.x + (p.y - e.a.y) * e.dir.y
            if (t < 0.5 || t > e.length - 0.5) continue
            const din = -((p.x - e.a.x) * e.out.x + (p.y - e.a.y) * e.out.y)
            if (din >= half || din < -half - 30) continue
            const foot = add(e.a, mul(e.dir, t))
            const nb = plan.rooms.find((r) => r !== room && pointInPolygon(add(foot, mul(e.out, 5)), r.points))
            if (nb && isOpenBetween(room, nb)) continue
            if (doors.some(({ o, center }) => Math.hypot(foot.x - center.x, foot.y - center.y) < o.width / 2 + 1)) continue
            if (niches.some(({ c, half }) => Math.hypot(foot.x - c.x, foot.y - c.y) < half)) continue
            worst = Math.max(worst, half - din)
          }
        }
        if (worst > 2) out.push(`${it.f.asset} 嵌进墙 ${worst.toFixed(1)}cm`)
      }
      return out
    })
    expect(bad).toEqual([])
  })

  test('立体上互不穿插：落地 × 落地（桌下的椅子 / 矮东西、洗衣机上方置物架除外）、壁挂 / 挂件 × 其他、跨家具的摆件', () => {
    const bad = all(({ plan }, items) => {
      const anc = ancestry(plan, items)
      const byId = new Map(items.map((it) => [it.f.id, it]))
      const root = (it: Item) => {
        const a = [...anc.get(it.f.id)!]
        return byId.get(a[a.length - 1]) ?? it
      }
      const out: string[] = []
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i]
          const B = items[j]
          if (A.role === 'flat' || B.role === 'flat') continue
          if (anc.get(A.f.id)!.has(B.f.id) || anc.get(B.f.id)!.has(A.f.id)) continue
          // 贴附物（冰箱贴、便签）贴在别的东西表面上：只和壁挂物比
          const stickA = !!A.d.stick
          const stickB = !!B.d.stick
          if (stickA !== stickB && !(A.d.mount !== undefined || B.d.mount !== undefined)) continue
          // 同一件家具上的两件摆件由 onLevel 的同层检查管，这里不重复
          const ra = root(A)
          const rb = root(B)
          if (A.role === 'prop' && B.role === 'prop' && ra === rb) continue
          const v = vert(A, B)
          if (v <= 2) continue
          const p = penetration(A.poly, B.poly)
          if (p <= 2) continue
          if (ra.role === 'floor' && rb.role === 'floor' && ra !== rb) {
            const tuck = (t: Item, s: Item) => isTable(t.d) && (isSeat(s.d) || s.y1 <= t.y0 + (t.d.surface ?? 0) - 1)
            if (tuck(ra, rb) || tuck(rb, ra)) continue
            if (hasTag(ra.d, 'washer-rack') || hasTag(rb.d, 'washer-rack')) continue
            // 桌下的主机贴着椅子：workstation.floorTower 按设计把椅子收进 4cm 算（椅脚、扶手是斜的）
            if (((isSeat(A.d) && isTower(B.d)) || (isSeat(B.d) && isTower(A.d))) && p <= 5) continue
          }
          out.push(`${A.f.asset} × ${B.f.asset} ${Math.min(p, v).toFixed(1)}cm`)
        }
      return out
    })
    expect(bad).toEqual([])
  })

  test('家具、摆件、壁挂物不压设备本体（厨房台面 / 抽油烟机 / 吊柜、浴缸、马桶、洗面台、内置收纳；摆在设备上的除外）', () => {
    const bad = all(({ plan }, items) => {
      const anc = ancestry(plan, items)
      const out: string[] = []
      for (const it of items) {
        if (it.role === 'flat' || it.d.stick) continue
        for (const fx of plan.fixtures) {
          if (anc.get(it.f.id)!.has(fx.id)) continue
          for (const [b, lo, hi] of fixtureSpans(fx)) {
            const v = vert(it, { y0: lo, y1: hi })
            if (v <= 2) continue
            const p = penetration(it.poly, rectPoly(b))
            if (p > 2) out.push(`${it.f.asset} 压在 ${fx.kind} 上 ${Math.min(p, v).toFixed(1)}cm`)
          }
        }
      }
      return out
    })
    expect(bad).toEqual([])
  })

  test('门扇开合范围里没有落地家具和低处的壁挂物', () => {
    const bad = all(({ plan }, items) => {
      const out: string[] = []
      for (const o of plan.openings) {
        if (o.kind !== 'door' && o.kind !== 'folding') continue
        const owner = plan.rooms.find((r) => r.id === o.roomId)
        if (!owner || o.edge >= owner.points.length) continue
        const e = edgeInfo(owner.points, o.edge)
        const w = Math.min(o.width, e.length)
        const c = e.length <= w ? e.length / 2 : Math.max(w / 2, Math.min(e.length - w / 2, o.offset))
        const center = add(e.a, mul(e.dir, c))
        const wall = wallThicknessAt(plan, center, e.out, owner)
        const hinge = add(center, mul(e.dir, ((o.hinge === 'start' ? -1 : 1) * w) / 2))
        const u = o.hinge === 'start' ? e.dir : mul(e.dir, -1)
        const sw = o.swing === 'in' ? mul(e.out, -1) : e.out
        const R = o.kind === 'door' ? w - 4 : w / 2
        const pts: { x: number; y: number }[] = []
        for (let r = 6; r <= R; r += 4)
          for (let a = 0; a <= 90; a += 4) {
            const ang = (a * Math.PI) / 180
            const p = add(hinge, add(mul(u, Math.cos(ang) * r), mul(sw, Math.sin(ang) * r)))
            if ((p.x - hinge.x) * sw.x + (p.y - hinge.y) * sw.y > wall / 2 + 1) pts.push(p)
          }
        for (const it of items) {
          if ((it.role !== 'floor' && it.role !== 'wall') || it.y0 > 196 || it.d.stick) continue
          const b = lbox(it.f.asset)
          const shrunk = [
            [b.min.x + 2, b.min.z + 2],
            [b.max.x - 2, b.min.z + 2],
            [b.max.x - 2, b.max.z - 2],
            [b.min.x + 2, b.max.z - 2],
          ].map(([x, z]) => toWorld(it.f, x, z))
          if (pts.some((p) => pointInPolygon(p, shrunk))) out.push(`${it.f.asset} 挡住门扇（${owner.name}）`)
        }
      }
      return out
    })
    expect(bad).toEqual([])
  })

  test('通往阳台的落地窗前没有落地家具', () => {
    const bad = all(({ plan }, items) => {
      const out: string[] = []
      for (const o of plan.openings) {
        if (o.kind !== 'window') continue
        const owner = plan.rooms.find((r) => r.id === o.roomId)
        if (!owner || o.edge >= owner.points.length) continue
        const e = edgeInfo(owner.points, o.edge)
        const w = Math.min(o.width, e.length)
        const c = e.length <= w ? e.length / 2 : Math.max(w / 2, Math.min(e.length - w / 2, o.offset))
        const center = add(e.a, mul(e.dir, c))
        const wall = wallThicknessAt(plan, center, e.out, owner)
        if (!plan.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(add(center, mul(e.out, wall / 2 + 15)), x.points))) continue
        const p0 = add(center, mul(e.dir, -w / 2))
        const p1 = add(center, mul(e.dir, w / 2))
        for (const s of [1, -1]) {
          const n = mul(e.out, s)
          const zone = [add(p0, mul(n, wall / 2 + 1)), add(p1, mul(n, wall / 2 + 1)), add(p1, mul(n, wall / 2 + 35)), add(p0, mul(n, wall / 2 + 35))]
          for (const it of items) if (it.role === 'floor' && penetration(it.poly, zone) > 2) out.push(`${it.f.asset} 挡在落地窗前`)
        }
      }
      return out
    })
    expect(bad).toEqual([])
  })

  test('窗帘不插进家具、摆件和壁挂物', () => {
    const bad = all(({ plan }, items) =>
      curtainSpecs(plan).flatMap((c) =>
        items
          .filter((it) => it.role !== 'flat' && !it.d.stick && vert(it, { y0: c.bottom, y1: c.rodY + 2 }) > 2 && penetration(it.poly, rectPoly(c.box)) > 1)
          .map((it) => `${it.f.asset} 插进窗帘`),
      ),
    )
    expect(bad).toEqual([])
  })

  test('层板上的摆件不顶到上一层（按模型实际高度，容差 2cm）', () => {
    const bad = all(({ plan }, items) =>
      items.flatMap((it) => {
        if (it.role !== 'prop') return []
        const sp = supportOf(plan, it.f)
        const owner = sp && plan.furniture.find((o) => o.id === sp.ownerId)
        if (!owner) return []
        const lv = (ASSET_MAP.get(owner.asset)!.surfaces ?? []).find((l) => Math.abs((owner.z ?? 0) + l.y - (it.f.z ?? 0)) < 0.5 && l.kind !== 'hook' && l.kind !== 'clip')
        const h = it.y1 - it.y0
        return lv?.h !== undefined && h > lv.h + 2 ? [`${it.f.asset} 在 ${owner.asset} 里高 ${h.toFixed(1)}，层高 ${lv.h}`] : []
      }),
    )
    expect(bad).toEqual([])
  })
})
