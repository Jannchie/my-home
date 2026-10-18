// 厕所的一键布置：马桶刷 / 搋子 / 卫生桶挨着马桶放、日式厕所马桶上方的吊柜（卷纸、生理用品）、卷纸架在座位旁边
import { beforeAll, describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { fixtureBox, fixtureDepth, openingsOn, pointInPolygon, type Fixture, type Furniture, type Plan, type Region, type Room } from '/src/model'
import { toLocal } from '/src/surface'
import { ASSET_MAP, type AssetDef } from '/src/three/assets'
import { hasTag } from '/src/three/tags'
import { PAPER_HOLDER_Y, paperHolderSpot } from '/src/three/house'
import { vrange } from '/src/occupancy'
import { genJp, penetration, range, rectCorners } from './helpers'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const

interface Case {
  key: string
  region: Region
  plan: Plan
}
const cases: Case[] = []

beforeAll(() => {
  const add = (key: string, region: Region, plan: Plan, seed: number) => {
    const hh = generateHousehold(plan, seed)
    plan.household = hh
    plan.furniture = decorate(plan, seed, 'auto', hh)
    cases.push({ key, region, plan })
  }
  for (const seed of range(1, 40)) add(`jp#${seed}`, 'jp', genJp(seed), seed)
  for (const region of ['cn', 'west'] as Region[]) for (const seed of range(1, 15)) add(`${region}#${seed}`, region, generatePlan({ seed, ...OPTS, region }).plan, seed)
}, 600_000)

const def = (f: Furniture) => ASSET_MAP.get(f.asset)!
const roomOf = (plan: Plan, p: { x: number; y: number }) => plan.rooms.find((r) => pointInPolygon(p, r.points))
/** 每个马桶和它所在的房间、房间里的家具 */
function toilets(c: Case) {
  return c.plan.fixtures
    .filter((f) => f.kind === 'toilet')
    .flatMap((fx) => {
      const room = roomOf(c.plan, fx)
      return room ? [{ fx, room, items: c.plan.furniture.filter((f) => pointInPolygon(f, room.points)) }] : []
    })
}
/** 点到马桶本体（平面）的距离 */
function gapTo(fx: Fixture, f: Furniture) {
  const b = fixtureBox(fx)
  const d = def(f)
  const r = Math.min(d.w, d.d) / 2
  return Math.max(0, Math.hypot(Math.max(b.x0 - f.x, 0, f.x - b.x1), Math.max(b.y0 - f.y, 0, f.y - b.y1)) - r)
}
/** 马桶上方专用的吊柜 / 搁板（decorate.toiletWall 挂的那几款），离马桶中心不到 60 */
const TOILET_WALL = /^(wet-toilet-upper-cab-|ws-toilet-|wet-toilet-wall-cabinet$)/
const overToilet = (fx: Fixture, f: Furniture) => TOILET_WALL.test(f.asset) && Math.hypot(f.x - fx.x, f.y - fx.y) < 60
const isCabinet = (d: AssetDef) => !!d.openable
/** 柜里 / 搁板上的东西：中心在柜子占地内、高度在柜子范围内 */
function contents(cab: Furniture, items: Furniture[]) {
  const d = def(cab)
  const [lo, hi] = vrange(cab, d)
  return items.filter((f) => {
    if (f === cab || !def(f).prop || f.z === undefined || f.z < lo - 1 || f.z > hi) return false
    const l = toLocal(cab, f)
    return Math.abs(l.x) <= d.w / 2 && Math.abs(l.y) <= d.d / 2 + 2
  })
}

describe('马桶旁边的东西', () => {
  test('马桶刷、搋子、卫生桶挨着马桶放（离马桶本体 ≤ 45cm）', () => {
    const bad: string[] = []
    let n = 0
    let close = 0
    for (const c of cases)
      for (const { fx, room, items } of toilets(c))
        for (const f of items) {
          if (f.z || !hasTag(def(f), 'toilet-brush', 'plunger', 'sanitary-bin')) continue
          // 卫生桶在三件套卫浴里有时是普通垃圾桶顺带的标签：只看厕所里的和马桶刷 / 搋子
          if (room.kind !== 'toilet' && hasTag(def(f), 'sanitary-bin') && !hasTag(def(f), 'toilet-brush', 'plunger')) continue
          n++
          const g = gapTo(fx, f)
          if (g <= 40) close++
          if (g > 45) bad.push(`${c.key} ${room.kind} ${f.asset} 离马桶 ${Math.round(g)}cm`)
        }
    expect(bad).toEqual([])
    expect(n).toBeGreaterThan(60)
    expect(close / n).toBeGreaterThan(0.9)
  })

  test('不放在马桶正前方（坐下、起身的地方）', () => {
    const bad: string[] = []
    for (const c of cases)
      for (const { fx, items } of toilets(c))
        for (const f of items) {
          if (f.z || !hasTag(def(f), 'toilet-brush', 'plunger', 'sanitary-bin')) continue
          const l = toLocal(fx, f)
          const d = def(f)
          const fd = fixtureDepth(fx)
          // 占地和马桶正前方那一条（马桶宽、往前 60）有重叠
          const hw = Math.max(d.w, d.d) / 2
          if (Math.abs(l.x) - hw < fx.w / 2 && l.y + hw > fd / 2 && l.y - hw < fd / 2 + 60) bad.push(`${c.key} ${f.asset} @(${Math.round(l.x)}, ${Math.round(l.y)})`)
        }
    expect(bad).toEqual([])
  })

  test('独立厕所里马桶刷多半贴着马桶侧面（2–35cm、不超出马桶前沿）', () => {
    let n = 0
    let beside = 0
    for (const c of cases)
      for (const { fx, room, items } of toilets(c)) {
        if (room.kind !== 'toilet') continue
        for (const f of items.filter((x) => !x.z && hasTag(def(x), 'toilet-brush'))) {
          n++
          const l = toLocal(fx, f)
          const side = Math.abs(l.x) - fx.w / 2 - Math.min(def(f).w, def(f).d) / 2
          if (side >= 0 && side <= 35 && l.y <= fixtureDepth(fx) / 2) beside++
        }
      }
    expect(n).toBeGreaterThan(30)
    expect(beside / n).toBeGreaterThan(0.9)
  })
})

describe('马桶上方的吊柜 / 搁板', () => {
  test('日式独立厕所大多挂着吊柜，柜里放着卷纸和生理用品', () => {
    let rooms = 0
    let withCab = 0
    let withPaper = 0
    let withSanitary = 0
    for (const c of cases.filter((x) => x.region === 'jp'))
      for (const { fx, room, items } of toilets(c)) {
        if (room.kind !== 'toilet') continue
        rooms++
        const cab = items.find((f) => overToilet(fx, f) && isCabinet(def(f)))
        if (!cab) continue
        withCab++
        const inside = contents(cab, items)
        if (inside.some((f) => hasTag(def(f), 'toilet-paper'))) withPaper++
        if (inside.some((f) => hasTag(def(f), 'sanitary'))) withSanitary++
      }
    expect(rooms).toBeGreaterThan(30)
    expect(withCab / rooms).toBeGreaterThan(0.55)
    expect(withPaper / withCab).toBeGreaterThan(0.9)
    expect(withSanitary / withCab).toBeGreaterThan(0.5)
  })

  test('吊柜 / 搁板挂在 140 以上、不顶天花板、不碰窗和门洞、在房间里', () => {
    const bad: string[] = []
    for (const c of cases)
      for (const { fx, room, items } of toilets(c))
        for (const f of items.filter((x) => overToilet(fx, x))) {
          const d = def(f)
          const [lo, hi] = vrange(f, d)
          if (lo < 140) bad.push(`${c.key} ${f.asset} 底 ${lo}`)
          if (hi > 235) bad.push(`${c.key} ${f.asset} 顶 ${hi}`)
          const poly = rectCorners(f, d.w, d.d, f.rot)
          if (!poly.every((p) => pointInPolygon(p, room.points))) bad.push(`${c.key} ${f.asset} 出墙`)
          // 同一面墙上的门窗：柜子沿墙的范围和门窗洞（两侧各留 3）不重叠
          for (const { o, e, center } of openingsOn(room, c.plan)) {
            const along = poly.map((p) => (p.x - center.x) * e.dir.x + (p.y - center.y) * e.dir.y)
            const off = poly.map((p) => Math.abs((p.x - center.x) * e.out.x + (p.y - center.y) * e.out.y))
            if (Math.min(...off) > 20) continue
            if (Math.min(...along) < o.width / 2 + 3 && Math.max(...along) > -o.width / 2 - 3) bad.push(`${c.key} ${f.asset} 碰到${o.kind}`)
          }
        }
    expect(bad).toEqual([])
  })

  test('柜里 / 搁板上的东西互不重叠', () => {
    const bad: string[] = []
    for (const c of cases)
      for (const { fx, items } of toilets(c))
        for (const cab of items.filter((x) => overToilet(fx, x))) {
          const inside = contents(cab, items)
          for (let i = 0; i < inside.length; i++)
            for (let j = i + 1; j < inside.length; j++) {
              const a = inside[i]
              const b = inside[j]
              if (Math.abs((a.z ?? 0) - (b.z ?? 0)) > 0.5) continue
              const p = penetration(rectCorners(a, def(a).w, def(a).d, a.rot), rectCorners(b, def(b).w, def(b).d, b.rot))
              if (p > 0.6) bad.push(`${c.key} ${a.asset} × ${b.asset} ${p.toFixed(1)}`)
            }
        }
    expect(bad).toEqual([])
  })
})

describe('卷纸架', () => {
  const holderRooms = (c: Case) => toilets(c).filter(({ room }) => room.kind === 'toilet')
  test('独立厕所的卷纸架装在马桶侧面的墙上、座位旁边', () => {
    const bad: string[] = []
    for (const c of cases)
      for (const { fx } of holderRooms(c)) {
        const s = paperHolderSpot(c.plan, fx)
        if (!s) {
          bad.push(`${c.key} 没有卷纸架`)
          continue
        }
        const l = toLocal(fx, s.p)
        // 侧面（离马桶中心 ≤ 70）、在马桶中心和前沿之间
        if (Math.abs(l.x) < fx.w / 2 || Math.abs(l.x) > 70 || l.y < 0 || l.y > fixtureDepth(fx) / 2) bad.push(`${c.key} 卷纸架 @(${Math.round(l.x)}, ${Math.round(l.y)})`)
      }
    expect(bad).toEqual([])
  })

  test('卷纸架不和马桶边的东西、墙上的柜子撞', () => {
    const bad: string[] = []
    for (const c of cases)
      for (const { fx, items } of toilets(c)) {
        const s = paperHolderSpot(c.plan, fx)
        if (!s) continue
        // 卷纸架：离墙 13、宽 16，高 PAPER_HOLDER_Y-8 … +10
        const into = { x: -s.side.x, y: -s.side.y }
        const along = { x: -into.y, y: into.x }
        const holder = [
          [-8, 0],
          [8, 0],
          [8, 13],
          [-8, 13],
        ].map(([a, b]) => ({ x: s.p.x + along.x * a + into.x * b, y: s.p.y + along.y * a + into.y * b }))
        for (const f of items) {
          const d = def(f)
          const [lo, hi] = vrange(f, d)
          const z0 = d.mount !== undefined || d.stick || d.form === 'hanging' ? lo : (f.z ?? 0)
          const z1 = d.mount !== undefined || d.stick || d.form === 'hanging' ? hi : (f.z ?? 0) + d.h
          if (z1 <= PAPER_HOLDER_Y - 8 || z0 >= PAPER_HOLDER_Y + 10) continue
          if (penetration(holder, rectCorners(f, d.w, d.d, f.rot)) > 0.5) bad.push(`${c.key} 卷纸架 × ${f.asset}`)
        }
      }
    expect(bad).toEqual([])
  })
})
