// 两层户建 / 复式：每层规约、跨层可达（经楼梯）、楼梯上下对齐、2F 不超出 1F、屋顶盖住外轮廓、3D 搭建不报错；
// 住宅类型不选（或选公寓）时平层生成和以前一样。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan, dwellingFor } from '/src/generate-region'
import { houseViolations } from '/src/generate-house'
import { floorOf, floorOutline, floorView, planFloors } from '/src/floors'
import { stairHoleConflicts, stairHoles, stairLinks, stairFootprint, overlapArea as stairOverlap } from '/src/stairs'
import { roofCovers, roofParts } from '/src/exterior'
import { area, edgeInfo, onBoundary, pointInPolygon, type Plan, type Region } from '/src/model'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare } from '/src/share'
import { buildBuilding } from '/src/three/building'
import { yardFurniture } from '/src/yard'
import { JP_OPTS, normalizeIds, overlapArea, range } from './helpers'

type Combo = { region: Region; dwelling: 'house' | 'duplex' }
const COMBOS: Combo[] = [
  { region: 'jp', dwelling: 'house' },
  { region: 'west', dwelling: 'house' },
  { region: 'cn', dwelling: 'house' },
  { region: 'jp', dwelling: 'duplex' },
  { region: 'cn', dwelling: 'duplex' },
]
const SEEDS = range(1, 24)
const key = (c: Combo) => `${c.region}/${c.dwelling}`
const plans = new Map<string, Map<number, Plan>>(COMBOS.map((c) => [key(c), new Map(SEEDS.map((s) => [s, generatePlan({ ...JP_OPTS, seed: s, region: c.region, dwelling: c.dwelling }).plan]))]))

function collect(c: Combo, check: (p: Plan) => string[]) {
  return SEEDS.flatMap((s) => check(plans.get(key(c))!.get(s)!).map((m) => `${key(c)} seed ${s}: ${m}`))
}

describe.each(COMBOS)('$region $dwelling', (c) => {
  test('两层、每层都有房间；户建有用地和外观，复式没有', () => {
    expect(
      collect(c, (p) => {
        const out: string[] = []
        if (planFloors(p).length !== 2) out.push(`楼层数 ${planFloors(p).length}`)
        for (const f of planFloors(p)) if (!floorView(p, f.id).rooms.length) out.push(`${f.name} 没有房间`)
        if (c.dwelling === 'house' && (!p.site || !p.exterior)) out.push('户建缺用地 / 外观')
        if (c.dwelling === 'duplex' && (p.site || p.exterior)) out.push('复式不该有用地 / 外观')
        if (c.dwelling === 'duplex' && !p.rooms.some((r) => r.kind === 'void' && floorOf(p, r) !== planFloors(p)[0].id)) out.push('复式没有挑空')
        return out
      }),
    ).toEqual([])
  })

  test('合规：每层规约、跨层可达（玄关 → 门 / 楼梯 → 所有房间）、设备齐全', () => {
    expect(collect(c, (p) => houseViolations({ plan: p, want: 0 }, true))).toEqual([])
  })

  test('同层房间两两不重叠', () => {
    expect(
      collect(c, (p) => {
        const out: string[] = []
        for (const f of planFloors(p)) {
          const rs = floorView(p, f.id).rooms
          for (let i = 0; i < rs.length; i++)
            for (let j = i + 1; j < rs.length; j++) {
              const s = overlapArea(rs[i].points, rs[j].points)
              if (s > 1) out.push(`${f.name} ${rs[i].name} 与 ${rs[j].name} 重叠 ${s}cm²`)
            }
        }
        return out
      }),
    ).toEqual([])
  })

  test('门窗落在所在边上', () => {
    expect(
      collect(c, (p) =>
        p.openings.flatMap((o) => {
          const r = p.rooms.find((x) => x.id === o.roomId)
          if (!r) return ['门窗所属房间不存在']
          const L = edgeInfo(r.points, o.edge).length
          return o.offset - o.width / 2 < -0.5 || o.offset + o.width / 2 > L + 0.5 ? [`${r.name} 的 ${o.kind} 超出边`] : []
        }),
      ),
    ).toEqual([])
  })

  test('楼梯上下对齐：1F 一部楼梯，2F 洞口 = 楼梯占地、落在走廊里，上下两端都接着房间', () => {
    expect(
      collect(c, (p) => {
        const out: string[] = []
        const st = p.fixtures.filter((f) => f.kind === 'stairs')
        if (st.length !== 1) return [`楼梯 ${st.length} 部`]
        if (floorOf(p, st[0]) !== '1f') out.push('楼梯不在 1F')
        const holes = stairHoles(p, '2f')
        if (holes.length !== 1) return [...out, `2F 洞口 ${holes.length} 个`]
        const fp = stairFootprint(st[0])
        if (Math.abs(stairOverlap(holes[0].poly, fp) - area(fp)) > 1) out.push('洞口和楼梯占地不重合')
        if (stairHoleConflicts(p).length) out.push('洞口压到卧室等房间')
        const hall2 = floorView(p, '2f').rooms.find((r) => pointInPolygon({ x: st[0].x, y: st[0].y }, r.points))
        if (hall2?.kind !== 'hall') out.push(`洞口所在房间是 ${hall2?.kind}`)
        const [link] = stairLinks(p)
        if (!link?.lower || !link.upper) out.push('楼梯上下端没接到房间')
        return out
      }),
    ).toEqual([])
  })

  test('2F 外轮廓不超出 1F（阳台是悬挑，不算外轮廓）', () => {
    expect(
      collect(c, (p) => {
        const o1 = floorOutline(floorView(p, '1f').rooms)!
        const o2 = floorOutline(floorView(p, '2f').rooms)!
        const outside = o2.filter((v) => !pointInPolygon(v, o1) && !onBoundary(o1, v, 1))
        return outside.length ? [`2F 轮廓顶点在 1F 外：${JSON.stringify(outside)}`] : stairOverlap(o1, o2) < area(o2) - 1 ? ['2F 轮廓有部分在 1F 外'] : []
      }),
    ).toEqual([])
  })

  if (c.dwelling === 'house') {
    test('屋顶：盖住最上层外轮廓；部分二阶时 1F 露出的部分也盖住', () => {
      expect(
        collect(c, (p) => {
          const parts = roofParts(p)
          const out: string[] = []
          const o2 = floorOutline(floorView(p, '2f').rooms)!
          const o1 = floorOutline(floorView(p, '1f').rooms)!
          if (!roofCovers(parts.filter((r) => r.floor === '2f').map((r) => r.rect), o2)) out.push('2F 屋顶没盖全')
          if (!roofCovers(parts.map((r) => r.rect), o1)) out.push('1F 露出部分没盖屋顶')
          // 下层的屋顶不伸到上层的范围里
          for (const r of parts.filter((x) => x.floor === '1f')) {
            const rp = [{ x: r.rect.x0, y: r.rect.y0 }, { x: r.rect.x1, y: r.rect.y0 }, { x: r.rect.x1, y: r.rect.y1 }, { x: r.rect.x0, y: r.rect.y1 }]
            if (stairOverlap(rp, o2) > 1) out.push('1F 屋顶伸进了 2F')
          }
          return out
        }),
      ).toEqual([])
    })
  }
})

describe('部分二阶', () => {
  test('日式户建里有部分二阶：2F 外轮廓比 1F 小，1F 露出的部分有单坡屋顶贴着 2F', () => {
    const ps = [...plans.get('jp/house')!.values()].filter((p) => area(floorOutline(floorView(p, '2f').rooms)!) < area(floorOutline(floorView(p, '1f').rooms)!) - 1)
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      const low = roofParts(p).filter((r) => r.floor === '1f')
      expect(low.length).toBeGreaterThan(0)
      if (p.exterior!.roof !== 'flat') expect(low.every((r) => r.kind === 'shed' && r.against)).toBe(true)
    }
  })
})

describe('院子', () => {
  test('一键布置的户外物件都在用地里、不在 1F 房间里，也不压车位和通道', () => {
    const bad: string[] = []
    for (const c of COMBOS.filter((x) => x.dwelling === 'house'))
      for (const s of SEEDS.slice(0, 8)) {
        const p = plans.get(key(c))!.get(s)!
        const items = yardFurniture(p, s)
        if (!items.length) bad.push(`${key(c)} ${s}: 没摆东西`)
        const rooms1 = floorView(p, '1f').rooms
        for (const f of items) {
          if (!pointInPolygon(f, p.site!.points)) bad.push(`${key(c)} ${s}: ${f.asset} 在用地外`)
          if (rooms1.some((r) => pointInPolygon(f, r.points))) bad.push(`${key(c)} ${s}: ${f.asset} 在房间里`)
          if ([...p.site!.paths, ...p.site!.parking.map((k) => k.points)].some((q) => pointInPolygon(f, q))) bad.push(`${key(c)} ${s}: ${f.asset} 压到通道 / 车位`)
          if (f.floor) bad.push('院子物件不该有楼层标记')
        }
      }
    expect(bad).toEqual([])
  })
})

describe('3D 搭建户建', () => {
  test.each(COMBOS)('$region $dwelling：不报错；户建有屋顶组和用地，屋顶在最上层墙顶之上', (c) => {
    const p = normalizePlan(JSON.parse(JSON.stringify(plans.get(key(c))!.get(3)!)))!
    const { root, floors } = buildBuilding(p, 240)
    root.updateMatrixWorld(true)
    expect(floors.length).toBe(2)
    if (c.dwelling === 'house') {
      const top = floors[1]
      expect(top.roof).toBeTruthy()
      const box = new THREE.Box3().setFromObject(top.roof!)
      expect(box.max.y).toBeGreaterThan(top.floor.elevation + top.floor.height)
      let site = false
      root.traverse((o) => {
        if (o.userData.site) site = true
      })
      expect(site).toBe(true)
    } else expect(floors.every((f) => !f.roof)).toBe(true)
  })
})

describe('存档 / 分享', () => {
  test('户建的用地、外观经 JSON 存档、分享链接往返不变', async () => {
    const p = normalizePlan(JSON.parse(JSON.stringify(plans.get('jp/house')!.get(5)!)))!
    const back = normalizePlan(JSON.parse(JSON.stringify(p)))!
    expect(back.site).toEqual(p.site)
    expect(back.exterior).toEqual(p.exterior)
    const r = await decodeShare(await encodeShare(p, 'plan'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.plan.exterior).toEqual(p.exterior)
      expect(r.plan.site?.points).toEqual(p.site!.points)
      expect(r.plan.floors).toEqual(p.floors)
    }
  })

  test('坏的用地 / 外观数据读档时整理掉', () => {
    const p = JSON.parse(JSON.stringify(plans.get('jp/house')!.get(5)!))
    p.site = { points: 'x' }
    p.exterior = { roof: 'dome' }
    const n = normalizePlan(p)!
    expect(n.site).toBeUndefined()
    expect(n.exterior).toBeUndefined()
  })
})

describe('平层公寓不受影响', () => {
  const regions: Region[] = ['jp', 'cn', 'west']
  test('不填住宅类型 = 公寓：同一种子结果相同（屏蔽 id）', () => {
    for (const region of regions)
      for (const seed of [1, 7, 42, 1234]) {
        const a = generatePlan({ ...JP_OPTS, seed, region }).plan
        const b = generatePlan({ ...JP_OPTS, seed, region, dwelling: 'apartment' }).plan
        expect(JSON.stringify(normalizeIds(b))).toBe(JSON.stringify(normalizeIds(a)))
        expect(a.floors).toBeUndefined()
      }
  })

  test('住宅类型随机：落到公寓的种子和直接选公寓结果相同；以公寓为主', () => {
    let apt = 0
    for (let k = 0; k < 40; k++) {
      const seed = k * 1000 + 17
      for (const region of regions) {
        const d = dwellingFor({ seed, dwelling: 'random', maxArea: null }, region)
        if (d !== 'apartment') continue
        apt++
        if (k % 8) continue
        const a = generatePlan({ ...JP_OPTS, seed, region, dwelling: 'random' }).plan
        const b = generatePlan({ ...JP_OPTS, seed, region }).plan
        expect(JSON.stringify(normalizeIds(a))).toBe(JSON.stringify(normalizeIds(b)))
      }
    }
    expect(apt).toBeGreaterThan(60)
  })

  test('平层生成的指纹和改动前一致', () => {
    const fp = (p: Plan) => {
      const s = JSON.stringify(normalizeIds(p))
      let h = 2166136261
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
      return h.toString(16)
    }
    const got = regions.map((region) => [3, 77, 500].map((seed) => fp(generatePlan({ ...JP_OPTS, seed, region }).plan)).join(','))
    expect(got).toEqual(FINGERPRINTS)
  })
})

/** 改动前（v1.3.0）平层生成的指纹：jp / cn / west 各取种子 3、77、500 */
const FINGERPRINTS = ['3b971347,d87f3a7a,343df5d1', '2140434,5989588e,cfbb568c', 'a3f1a2e4,1e4fdfc5,76259b47']
