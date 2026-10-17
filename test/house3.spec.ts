// 多层住宅第三期：全户统一分配房间、按层布置的协调（全户一份 / 每层一份 / 楼梯口留空 / 楼梯下收纳）、
// 楼梯寻路、户建的楼梯形式、挑空栏杆、院子物件的碰撞。只做结构性断言（不写随机分布的阈值）。
// 注意：户型名、房间名会按运行环境的语言翻译，这里不比较名字。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { allocateRooms, generateHousehold, lowMobility, memberRooms, type Household, type Member } from '/src/household'
import { applyFixesHouse, decorateHouse } from '/src/decorate'
import { checklist } from '/src/checklist'
import { baseFloorId, floorOf, floorView, planFloors } from '/src/floors'
import { stairClearZones, stairFootprint, stairUnderZone, stairWalk, underZonePoly } from '/src/stairs'
import { HouseNav } from '/src/nav'
import { voidRailSegments } from '/src/walls'
import { bbox, pointInPolygon, type Furniture, type Plan, type Region } from '/src/model'
import { furnitureBox, overlapsOthers, yardBlocked } from '/src/snap'
import { yardFurniture } from '/src/yard'
import { isMainAppliance } from '/src/appliance'
import { ASSET_MAP } from '/src/three/assets'
import { hasTag } from '/src/three/tags'
import { buildBuilding } from '/src/three/building'
import { furnitureModel, placeFurniture } from '/src/three/house'
import { ActorLayer } from '/src/three/actors'
import { JP_OPTS, range } from './helpers'

type Combo = { region: Region; dwelling: 'house' | 'duplex' }
const COMBOS: Combo[] = [
  { region: 'jp', dwelling: 'house' },
  { region: 'west', dwelling: 'house' },
  { region: 'cn', dwelling: 'house' },
  { region: 'jp', dwelling: 'duplex' },
  { region: 'cn', dwelling: 'duplex' },
]
const SEEDS = range(1, 10)

/** 住户里加一位长辈（确定性：复制户主改成 75 岁的长辈），用来检查「长辈住 1F」 */
function withElder(hh: Household): Household {
  if (hh.members.some((m) => m.role === 'elder')) return hh
  const head = hh.members[0]
  const elder: Member = { ...head, id: 'm-elder', role: 'elder', age: 75, job: 'retired', interests: ['tea'], levels: { tea: 1 } }
  return { ...hh, kind: 'three-gen', members: [...hh.members, elder] }
}

interface Case {
  key: string
  c: Combo
  plan: Plan
}
const cases: Case[] = COMBOS.flatMap((c) =>
  SEEDS.map((seed) => {
    const plan = generatePlan({ ...JP_OPTS, seed, region: c.region, dwelling: c.dwelling }).plan
    const hh = withElder(generateHousehold(plan, seed))
    plan.household = hh
    plan.furniture = [...decorateHouse(plan, seed, 'auto', hh), ...yardFurniture(plan, seed)]
    return { key: `${c.region}/${c.dwelling}#${seed}`, c, plan }
  }),
)
const each = (check: (k: Case) => string[]) => cases.flatMap((k) => check(k).map((m) => `${k.key}: ${m}`))
const bedroom = (k: string) => k === 'western' || k === 'japanese'

describe('全户统一分配房间', () => {
  test('每个成员恰好住一间居室（不跨层重复）；居室只分给洋室 / 和室', () => {
    expect(
      each(({ plan }) => {
        const out: string[] = []
        const a = allocateRooms(plan, plan.household!)
        const seen = new Map<string, number>()
        for (const [rid, ms] of a.occupants) {
          const r = plan.rooms.find((x) => x.id === rid)
          if (!r || !bedroom(r.kind)) out.push(`住进了 ${r?.kind}`)
          for (const m of ms) seen.set(m.id, (seen.get(m.id) ?? 0) + 1)
        }
        for (const m of plan.household!.members) if (seen.get(m.id) !== 1) out.push(`${m.role} 住了 ${seen.get(m.id) ?? 0} 间`)
        // 住户面板用的映射和分配一致
        if (memberRooms(plan, plan.household!).size !== plan.household!.members.length) out.push('memberRooms 不全')
        return out
      }),
    ).toEqual([])
  })

  test('长辈 / 行动不便者：有 1F 居室时住 1F', () => {
    expect(
      each(({ plan }) => {
        const base = baseFloorId(plan)
        if (!plan.rooms.some((r) => bedroom(r.kind) && floorOf(plan, r) === base)) return []
        const rooms = memberRooms(plan, plan.household!)
        return plan.household!.members.filter((m) => m.role === 'elder' && lowMobility(m) && floorOf(plan, rooms.get(m.id)!) !== base).map(() => '长辈不在 1F')
      }),
    ).toEqual([])
  })

  test('夫妻同室；孩子和父母同层或相邻层', () => {
    expect(
      each(({ plan }) => {
        const rooms = memberRooms(plan, plan.household!)
        const ms = plan.household!.members
        const parents = ms.filter((m) => m.role === 'self' || m.role === 'partner')
        const out: string[] = []
        if (parents.length === 2 && rooms.get(parents[0].id) !== rooms.get(parents[1].id)) out.push('夫妻分房')
        const fs = planFloors(plan).map((f) => f.id)
        const pr = rooms.get(parents[0].id)!
        for (const k of ms.filter((m) => m.role === 'child')) {
          const d = Math.abs(fs.indexOf(floorOf(plan, rooms.get(k.id)!)) - fs.indexOf(floorOf(plan, pr)))
          if (d > 1) out.push('孩子离父母隔了一层以上')
        }
        return out
      }),
    ).toEqual([])
  })
})

describe('按层布置的协调', () => {
  test('冰箱、洗衣机全户各一台（不每层都放）', () => {
    expect(
      each(({ plan }) => {
        const n = (kind: 'fridge' | 'washer') => plan.furniture.filter((f) => isMainAppliance(ASSET_MAP.get(f.asset), kind)).length
        return [n('fridge') !== 1 ? `冰箱 ${n('fridge')} 台` : '', n('washer') !== 1 ? `洗衣机 ${n('washer')} 台` : ''].filter(Boolean)
      }),
    ).toEqual([])
  })

  test('楼梯口（起步处、出梯口外侧）留出通道：没有落地家具', () => {
    expect(
      each(({ plan }) => {
        const out: string[] = []
        for (const fl of planFloors(plan))
          for (const z of stairClearZones(plan, fl.id))
            for (const f of plan.furniture) {
              if (floorOf(plan, f) !== fl.id || f.z) continue
              const d = ASSET_MAP.get(f.asset)
              if (!d || d.mount || d.stick || d.h <= 3) continue
              const b = furnitureBox(f.asset, f.x, f.y, f.rot)
              if (b.x0 < z.x1 - 1 && z.x0 < b.x1 - 1 && b.y0 < z.y1 - 1 && z.y0 < b.y1 - 1) out.push(`${fl.id} 楼梯口有 ${f.asset}`)
            }
        return out
      }),
    ).toEqual([])
  })

  test('楼梯下敞开的储物角：放的东西都在储物角里、不高于它，沙盘里也不算撞到楼梯', () => {
    const withOpen = cases.filter(({ plan }) => plan.fixtures.some((f) => f.kind === 'stairs' && f.under === 'open'))
    expect(withOpen.length).toBeGreaterThan(0)
    expect(
      withOpen.flatMap(({ key, plan }) => {
        const st = plan.fixtures.find((f) => f.kind === 'stairs')!
        const z = stairUnderZone(st, 270)
        if (!z) return [`${key}: 没有储物角`]
        const zb = bbox(underZonePoly(st, z))
        const view = floorView(plan, floorOf(plan, st))
        // 楼梯上方的墙上不挂东西（空调、神棚会挡住上楼的人）
        const hung = view.furniture.filter((f) => (ASSET_MAP.get(f.asset)?.mount !== undefined || ASSET_MAP.get(f.asset)?.stick) && pointInPolygon(f, stairFootprint(st))).map((f) => `${key}: 楼梯上方挂了 ${f.asset}`)
        return view.furniture
          .filter((f) => !f.z && !ASSET_MAP.get(f.asset)?.mount && !ASSET_MAP.get(f.asset)?.stick && pointInPolygon(f, underZonePoly(st, z)))
          .flatMap((f) => {
            const b = furnitureBox(f.asset, f.x, f.y, f.rot)
            const out: string[] = []
            if (b.x0 < zb.x0 - 1 || b.x1 > zb.x1 + 1 || b.y0 < zb.y0 - 1 || b.y1 > zb.y1 + 1) out.push(`${key}: ${f.asset} 伸出储物角`)
            if ((ASSET_MAP.get(f.asset)?.h ?? 0) > z.clear) out.push(`${key}: ${f.asset} 太高`)
            if (overlapsOthers(view, f.id, f.asset, f.x, f.y, f.rot)) out.push(`${key}: ${f.asset} 判成穿模`)
            return out
          })
          .concat(hung)
      }),
    ).toEqual([])
  })

  test('检查清单：按层的条目每层一份；一键补齐补到正确的楼层', () => {
    expect(
      each(({ plan }) => {
        const out: string[] = []
        const items = checklist(plan, plan.household)
        for (const fl of planFloors(plan)) if (!items.some((i) => i.perFloor && i.floor === fl.id)) out.push(`${fl.id} 没有按层的条目`)
        // 拿掉 2F 的垃圾桶，补齐后应该补回 2F
        const top = planFloors(plan)[1].id
        const p2: Plan = { ...plan, furniture: plan.furniture.filter((f) => !(floorOf(plan, f) === top && hasTag(ASSET_MAP.get(f.asset), 'trash-bin'))) }
        const miss = checklist(p2, p2.household).filter((i) => i.perFloor && i.floor === top && i.have < i.need)
        if (!miss.length) out.push('2F 垃圾桶没报缺')
        const fixed = applyFixesHouse(p2, miss, p2.household, 1)
        const added = fixed.filter((f) => !p2.furniture.some((o) => o.id === f.id))
        if (!added.some((f) => floorOf(plan, f) === top && hasTag(ASSET_MAP.get(f.asset), 'trash-bin'))) out.push('垃圾桶没补到 2F')
        if (added.some((f) => floorOf(plan, f) !== top)) out.push('补到了别的楼层')
        return out
      }),
    ).toEqual([])
  })
})

describe('楼梯寻路', () => {
  /** 1F 上随机几个能站的点 → 2F 每间卧室：路径存在，且经过楼梯（往上） */
  test('从 1F 可达点到 2F 卧室的路径存在且经过楼梯', () => {
    expect(
      each(({ plan }) => {
        const nav = new HouseNav(plan)
        const out: string[] = []
        if (nav.links.length !== 1) return [`楼梯连接 ${nav.links.length} 条`]
        const [lo, hi] = planFloors(plan).map((f) => f.id)
        let s = 1
        const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
        const g1 = nav.grid(lo)
        // 1F 上和楼梯口连通的点（玄关土间、被家具围住的角落不算）
        const entry = g1.nearest('pet', nav.links[0].entry, 12, 60)
        if (!entry) return ['楼梯起步处站不下']
        const starts = range(1, 12)
          .map(() => g1.randomSpot('pet', 12, rand))
          .filter((p): p is NonNullable<typeof p> => !!p && !!g1.path('pet', p, entry, 12))
          .slice(0, 4)
        if (!starts.length) out.push('1F 没有可达点')
        const exit = nav.grid(hi).nearest('pet', nav.links[0].exit, 12, 60)
        if (!exit) return [...out, '出梯口站不下']
        let goals = 0
        for (const r of floorView(plan, hi).rooms.filter((x) => bedroom(x.kind))) {
          const c = bbox(r.points)
          const goal = nav.grid(hi).nearest('pet', { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 }, 12, 150)
          // 卧室里被家具堵住、本层从出梯口也走不进去的不算（那是布置的问题，不是楼梯寻路的）
          if (!goal || !nav.grid(hi).path('pet', exit, goal, 12)) continue
          goals++
          for (const p of starts) {
            const legs = nav.route('pet', { floor: lo, p }, { floor: hi, p: goal }, 12)
            if (!legs) out.push(`到不了 2F 卧室`)
            else if (!legs.some((l) => l.t === 'stairs' && l.up)) out.push('没经过楼梯')
          }
        }
        if (!goals) out.push('2F 没有走得进去的卧室')
        return [...new Set(out)]
      }),
    ).toEqual([])
  })

  test('走楼梯的路线：从下层地面走到上层地面，高度不下降、最后等于层间高', () => {
    expect(
      each(({ plan }) => {
        const st = plan.fixtures.find((f) => f.kind === 'stairs')!
        const w = stairWalk(plan, st)
        if (!w) return ['没有路线']
        const out: string[] = []
        if (w.pts[0].z !== 0) out.push('起点不在地面')
        if (Math.abs(w.pts[w.pts.length - 1].z - w.rise) > 0.01) out.push('终点不在上层地面')
        for (let i = 1; i < w.pts.length; i++) if (w.pts[i].z < w.pts[i - 1].z - 0.01) out.push('高度往下掉')
        return [...new Set(out)]
      }),
    ).toEqual([])
  })

  test('预览模式：猫会经楼梯走到 2F（走楼梯时高度在两层之间、身体抬头）', () => {
    const k = cases.find((x) => x.c.region === 'jp' && x.c.dwelling === 'house')!
    const plan: Plan = { ...k.plan, furniture: [...k.plan.furniture] }
    const lo = baseFloorId(plan)
    const hi = planFloors(plan)[1].id
    // 1F 的楼梯口附近放一只猫
    const nav = new HouseNav(plan)
    const p = nav.grid(lo).nearest('pet', nav.links[0].entry, 14, 200)!
    const cat: Furniture = { id: 'test-cat', asset: 'act-cat-tabby', x: Math.round(p.x), y: Math.round(p.y), rot: 0 }
    if (!ASSET_MAP.has(cat.asset)) cat.asset = [...ASSET_MAP.values()].find((d) => d.actor?.kind === 'cat' && d.actor.role === 'body')!.id
    plan.furniture.push(cat)
    const objs = new Map<string, THREE.Object3D>()
    const getObj = (id: string) => {
      let o = objs.get(id)
      const f = plan.furniture.find((x) => x.id === id)
      if (!o && f) {
        o = furnitureModel(f)
        placeFurniture(o, plan, f)
        objs.set(id, o)
      }
      return o
    }
    const layer = new ActorLayer(getObj)
    layer.lift = (id) => planFloors(plan).find((f) => f.id === id)!.elevation
    layer.elevOf = layer.lift
    layer.sync(plan, true)
    const goal = nav.grid(hi).nearest('pet', nav.links[0].exit, 14, 200)!
    expect(layer.sendTo('test-cat', hi, { x: goal.x + 0, y: goal.y })).toBe(true)
    let sawStairs = false
    let midway = false
    let lookUp = false
    for (let i = 0; i < 60 * 90; i++) {
      layer.update(1 / 60)
      const me = layer.snapshot().find((s) => s.id === 'test-cat')!
      if (me.task === 'stairs') {
        sawStairs = true
        if (me.z > 60 && me.z < 200) midway = true
        if (me.pitch < -0.1) lookUp = true
      }
      if (me.fl === hi && sawStairs && me.task !== 'stairs' && me.task !== 'go') break
    }
    const me = layer.snapshot().find((s) => s.id === 'test-cat')!
    expect({ fl: me.fl, sawStairs, midway, lookUp }).toEqual({ fl: hi, sawStairs: true, midway: true, lookUp: true })
  })
})

describe('第二期的补齐', () => {
  test('户建有 U 形以外的楼梯（L 形、客厅楼梯）；客厅楼梯在 1F 起居房间里，出梯口接 2F 走廊', () => {
    const kinds = new Set<string>()
    const bad: string[] = []
    for (const region of ['jp', 'west', 'cn'] as const)
      for (const seed of range(1, 16)) {
        const plan = generatePlan({ ...JP_OPTS, seed, region, dwelling: 'house' }).plan
        const st = plan.fixtures.find((f) => f.kind === 'stairs')!
        kinds.add(st.stairs ?? 'straight')
        if (st.stairs === 'straight') {
          const r = floorView(plan, '1f').rooms.find((x) => pointInPolygon(st, x.points))
          if (r?.kind !== 'ldk') bad.push(`${region}#${seed}: 客厅楼梯在 ${r?.kind}`)
        }
      }
    expect(bad).toEqual([])
    expect([...kinds].sort()).toEqual(['l', 'straight', 'u'])
  })

  test('复式挑空：上层走廊一侧装栏杆（不砌墙）', () => {
    expect(
      each(({ c, plan }) => {
        if (c.dwelling !== 'duplex') return []
        const top = planFloors(plan)[1].id
        const segs = voidRailSegments(floorView(plan, top).rooms)
        if (!segs.length) return ['没有挑空栏杆段']
        const { floors } = buildBuilding(plan, 240)
        const g = floors.find((f) => f.floor.id === top)!.group
        let rails = 0
        g.traverse((o) => {
          if (o.userData.voidRails) rails += o.children.length
        })
        const out: string[] = []
        if (!rails) out.push('3D 里没有栏杆')
        // 栏杆段中点 1.5m 高处没有墙
        g.updateMatrixWorld(true)
        const boxes: THREE.Box3[] = []
        g.traverse((o) => {
          let p: THREE.Object3D | null = o
          while (p && !p.userData.voidRails) p = p.parent
          if ((o as THREE.Mesh).isMesh && !p) boxes.push(new THREE.Box3().setFromObject(o))
        })
        for (const s of segs) {
          const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
          if (len < 60) continue
          const m = new THREE.Vector3((s.a.x + s.b.x) / 2, g.position.y + 150, (s.a.y + s.b.y) / 2)
          if (boxes.some((b) => b.containsPoint(m))) out.push('挑空边还有墙')
        }
        return [...new Set(out)]
      }),
    ).toEqual([])
  })

  test('院子物件：在用地里、不压房子和车位、互相不重叠；压到外墙的会被判成穿模', () => {
    expect(
      each(({ c, plan }) => {
        if (c.dwelling !== 'house') return []
        const view = floorView(plan, baseFloorId(plan))
        // 落地的院子物件（门外墙上的可视门铃这类贴墙物不算）
        const yard = view.furniture.filter((f) => !view.rooms.some((r) => pointInPolygon(f, r.points)) && !ASSET_MAP.get(f.asset)?.mount && !ASSET_MAP.get(f.asset)?.stick && !f.z)
        const out: string[] = []
        for (const f of yard) {
          const b = furnitureBox(f.asset, f.x, f.y, f.rot)
          if (yardBlocked(view, b, f)) out.push(`${f.asset} 出界 / 压房子`)
          if (overlapsOthers(view, f.id, f.asset, f.x, f.y, f.rot)) out.push(`${f.asset} 穿模`)
        }
        // 反例：贴着外墙中心线放一件 → 穿模
        const hb = bbox(view.rooms.flatMap((r) => r.points))
        const probe = { x: (hb.x0 + hb.x1) / 2, y: hb.y1 + 10 }
        if (!overlapsOthers(view, null, 'planter', probe.x, probe.y, 0)) out.push('压外墙没判出来')
        return out
      }),
    ).toEqual([])
  })
})
