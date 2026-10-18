// 两层户建 / 复式：每层规约、跨层可达（经楼梯）、楼梯上下对齐、2F 不超出 1F、屋顶盖住外轮廓、3D 搭建不报错；
// 住宅类型不选（或选公寓）时平层生成和以前一样。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan, dwellingFor, regionFor } from '/src/generate-region'
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

  test('楼梯上下对齐：1F 一部楼梯，2F 洞口 = 楼梯占地、落在走廊里（复式的客厅楼梯在挑空里），上下两端都接着房间', () => {
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
        if (hall2?.kind !== 'hall' && !(c.dwelling === 'duplex' && hall2?.kind === 'void')) out.push(`洞口所在房间是 ${hall2?.kind}`)
        // 出梯口外侧接着 2F 走廊（客厅楼梯的洞口在走廊或挑空边）
        if (stairLinks(p)[0]?.upper?.kind !== 'hall') out.push(`出梯口接着 ${stairLinks(p)[0]?.upper?.kind}`)
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

  test('半透明件（窗玻璃、纱帘、阳台玻璃）不投影、仍接收阴影；有窗玻璃', () => {
    const p = normalizePlan(JSON.parse(JSON.stringify(plans.get('jp/house')!.get(3)!)))!
    const { root } = buildBuilding(p, 240)
    let glass = 0
    const bad: string[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      if (!mats.every((x) => x.transparent)) return
      glass++
      if (m.castShadow) bad.push(`${o.parent?.userData.part ?? o.parent?.type} 透明件投影`)
    })
    expect(glass).toBeGreaterThan(0)
    expect(bad).toEqual([])
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

describe('户建的多样性', () => {
  test('2F 并排的次卧不会被摊成一样宽', () => {
    const pairs: [number, number][] = []
    for (const c of COMBOS)
      for (const p of plans.get(key(c))!.values()) {
        const top = planFloors(p)[1].id
        const beds = p.rooms
          .filter((r) => floorOf(p, r) === top && r.kind === 'western' && Math.min(...r.points.map((q) => q.y)) < 1)
          .map((r) => Math.max(...r.points.map((q) => q.x)) - Math.min(...r.points.map((q) => q.x)))
        // 第一间（主卧）权重固定，只比后面并排的次卧
        for (let i = 2; i < beds.length; i++) pairs.push([beds[i - 1], beds[i]])
      }
    expect(pairs.length).toBeGreaterThan(5)
    expect(pairs.filter(([a, b]) => a !== b).length / pairs.length).toBeGreaterThan(0.5)
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

  test('住宅类型随机：落到公寓时，用结果种子直接选公寓得到同一方案；以公寓为主', () => {
    let apt = 0
    for (let k = 0; k < 40; k++) {
      const seed = k * 1000 + 17
      for (const region of regions) {
        const d = dwellingFor({ seed, dwelling: 'random', maxArea: null }, region)
        if (d !== 'apartment') continue
        apt++
        if (k % 8) continue
        // 随机类型往后试种子时只试散列到公寓的种子，起始种子没抽中时结果种子会往后挪
        const a = generatePlan({ ...JP_OPTS, seed, region, dwelling: 'random' })
        const b = generatePlan({ ...JP_OPTS, seed: a.seed, region }).plan
        expect(dwellingFor({ seed: a.seed, dwelling: 'random', maxArea: null }, region)).toBe('apartment')
        expect(JSON.stringify(normalizeIds(a.plan))).toBe(JSON.stringify(normalizeIds(b)))
      }
    }
    expect(apt).toBeGreaterThan(60)
  })

  test('随机地区 / 类型按种子散列：相邻种子不扎堆；结果种子重新生成是同一地区、同一方案', () => {
    const got = new Set(range(0, 29).map((s) => `${regionFor({ seed: 5000 + s, region: 'random' })}/${dwellingFor({ seed: 5000 + s, dwelling: 'random', maxArea: null }, 'jp')}`))
    expect(got.size).toBeGreaterThanOrEqual(6)
    for (const seed of [11, 4242, 90001]) {
      const opts = { ...JP_OPTS, seed, region: 'random' as const, dwelling: 'random' as const, minArea: 60, maxArea: 85 }
      const a = generatePlan(opts)
      expect(regionFor({ seed: a.seed, region: 'random' })).toBe(regionFor(opts))
      expect(dwellingFor({ ...opts, seed: a.seed }, regionFor(opts))).toBe(dwellingFor(opts, regionFor(opts)))
      const b = generatePlan({ ...opts, seed: a.seed })
      expect(b.seed).toBe(a.seed)
      expect(JSON.stringify(normalizeIds(b.plan))).toBe(JSON.stringify(normalizeIds(a.plan)))
    }
  })

  test('平层生成的指纹固定（同一种子的结果不会无意中变掉）', () => {
    // 名字（户型名、房间名）按运行环境的语言翻译，CI 和本机不同：只比结构，不比显示文字
    const fp = (p: Plan) => {
      const s = JSON.stringify(normalizeIds(p), (k, v) => (k === 'name' ? undefined : v))
      let h = 2166136261
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
      return h.toString(16)
    }
    const got = regions.map((region) => [3, 77, 500].map((seed) => fp(generatePlan({ ...JP_OPTS, seed, region }).plan)).join(','))
    expect(got).toEqual(FINGERPRINTS)
  })
})

/**
 * 平层生成的指纹（不含名字）：jp / cn / west 各取种子 3、77、500。
 * v1.7 之后为了户型更多样（宽度随机摊、窗位偏移、更多排法）有意更新过一次：这些变化用第二条随机序列，房间布置大多不变，
 * 窗位、宽度、排法跟着变（jp 500 / cn 500 恰好没有可变的地方，指纹和以前相同）。
 */
const FINGERPRINTS = ['9aac4bf8,8ce92b42,ed6abb68', '18726c55,ce1decaf,4fe977f4', '8083dded,295fc497,1d09702a']
