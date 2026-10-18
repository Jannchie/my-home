// 一键布置：seed 1..40 的摆放质量
import { beforeAll, describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { decorate, decorateHouse, isOpenShelf } from '/src/decorate'
import { allocateRooms, generateHousehold, type Household } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { baseFloorId, floorOf } from '/src/floors'
import { hasTag } from '/src/three/tags'
import { edgesOf, fixtureBox, onBoundary, openingsOn, pointInPolygon, type Furniture, type Plan } from '/src/model'
import { supportOf, toLocal } from '/src/surface'
import { cabinetsOn, spotOf } from '/src/cabinet'
import { ASSET_MAP, type AssetDef } from '/src/three/assets'
import { bendToWalls, furnitureModel, isPlant, placeFurniture } from '/src/three/house'
import { wallThicknessAt } from '/src/walls'
import { NavGrid } from '/src/nav'
import { JP_OPTS, genJp, penetration, range, rectCorners } from './helpers'

const SEEDS = range(1, 40)

/** 淋浴台面（decorate.bathExtras 摆在离地 60.4 的位置）不是 surface 层，supportOf 找不到支撑面，单独放过 */
const SHOWER_COUNTER_Z = 60.4

interface Case {
  seed: number
  plan: Plan
  f: Furniture[]
  error?: string
}
const cases: Case[] = []

beforeAll(() => {
  for (const seed of SEEDS) {
    const plan = genJp(seed)
    const hh = generateHousehold(plan, seed)
    try {
      plan.household = hh
      plan.furniture = decorate(plan, seed, 'auto', hh)
      cases.push({ seed, plan, f: plan.furniture })
    } catch (e) {
      cases.push({ seed, plan, f: [], error: (e as Error).stack ?? String(e) })
    }
  }
}, 300_000)

const def = (x: Furniture) => ASSET_MAP.get(x.asset)!
/** 落地、占地的实体家具：去掉壁挂、贴附、挂起、桌面上的，以及地毯这类薄片 */
const isFloor = (x: Furniture) => !x.z && !def(x).mount && !def(x).stick && def(x).form !== 'hanging' && def(x).h > 3
const footprint = (x: Furniture) => rectCorners(x, def(x).w, def(x).d, x.rot)
/** 椅子、坐垫可以塞到桌子底下；主机也可以 */
const SEAT = /chair|stool|zabuton|bench|^ch-|^c2-|椅|坐垫|凳|座布団/
/** 主机机箱可以放在书桌底下（比桌面矮） */
const tucked = (a: AssetDef, b: Furniture) => !!a.surface && (SEAT.test(b.asset + def(b).name) || (def(b).type === 'pc' && def(b).h < a.surface))
/** 洗衣机上方置物架跨在洗衣机 / 干衣机（家具）上 */
const straddles = (a: Furniture, b: Furniture) => def(a).type === 'washer-rack' && ['washer', 'dryer'].includes(def(b).type ?? '')
const all = (fn: (c: Case) => string[]) => cases.filter((c) => !c.error).flatMap((c) => fn(c).map((m) => `seed ${c.seed}: ${m}`))

describe('一键布置 seed 1..40', () => {
  test('不抛错', () => {
    expect(cases.filter((c) => c.error).map((c) => `seed ${c.seed}: ${c.error}`)).toEqual([])
  })

  test('落地家具互不重叠（穿插 > 4cm 算，桌下的椅子除外）', () => {
    const bad = all(({ f }) => {
      const out: string[] = []
      const fl = f.filter(isFloor)
      for (let i = 0; i < fl.length; i++)
        for (let j = i + 1; j < fl.length; j++) {
          if (tucked(def(fl[i]), fl[j]) || tucked(def(fl[j]), fl[i]) || straddles(fl[i], fl[j]) || straddles(fl[j], fl[i])) continue
          const p = penetration(footprint(fl[i]), footprint(fl[j]))
          if (p > 4) out.push(`${fl[i].asset} × ${fl[j].asset} ${p.toFixed(1)}cm`)
        }
      return out
    })
    expect(bad).toEqual([])
  })

  test('落地家具不压设备本体（冰箱 / 洗衣机放在冰箱位 / 洗衣机位上、洗衣机置物架跨在洗衣机位上除外）', () => {
    const bad = all(({ plan, f }) =>
      f.filter(isFloor).flatMap((x) =>
        plan.fixtures
          // 冰箱位 / 洗衣机位是给机器预留的空间：冰箱、洗衣机、干衣机本来就放在上面
          .filter((fx) => !(fx.kind === 'washer' && ['washer-rack', 'washer', 'dryer'].includes(def(x).type ?? '')) && !(fx.kind === 'fridge' && def(x).type === 'fridge'))
          // 收纳位是给柜子预留的空间：柜子本来就放在上面
          .filter((fx) => !(fx.kind === 'builtin' && cabinetsOn([x], fx).length))
          .flatMap((fx) => {
            const b = fixtureBox(fx)
            const p = penetration(footprint(x), [
              { x: b.x0, y: b.y0 },
              { x: b.x1, y: b.y0 },
              { x: b.x1, y: b.y1 },
              { x: b.x0, y: b.y1 },
            ])
            return p > 4 ? [`${x.asset} 压在 ${fx.kind} 上 ${p.toFixed(1)}cm`] : []
          }),
      ),
    )
    expect(bad).toEqual([])
  })

  test('落地家具在房间内', () => {
    const bad = all(({ plan, f }) =>
      f
        .filter(isFloor)
        // 嵌墙收纳位（壁龛）里的柜子伸进墙里
        .filter((x) => !spotOf(plan, x)?.recessed)
        .filter((x) => {
          const cs = rectCorners(x, def(x).w - 2, def(x).d - 2, x.rot)
          return !plan.rooms.some((r) => cs.every((c) => pointInPolygon(c, r.points) || onBoundary(r.points, c, 1)))
        })
        .map((x) => `${x.asset} 出了房间`),
    )
    expect(bad).toEqual([])
  })

  test('台面上的摆件有支撑面，且整块占地都在台面内（fitsOnSurface）', () => {
    const noSupport: string[] = []
    const overflow: string[] = []
    for (const { seed, plan, f, error } of cases) {
      if (error) continue
      for (const x of f.filter((x) => (x.z ?? 0) > 0.5 && !def(x).mount && !def(x).stick && def(x).form !== 'hanging')) {
        const sp = supportOf(plan, x)
        if (!sp) {
          if (Math.abs((x.z ?? 0) - SHOWER_COUNTER_Z) > 0.01) noSupport.push(`seed ${seed}: ${x.asset} z=${x.z} 悬空`)
        } else if (!sp.fits) {
          const owner = f.find((o) => o.id === sp.ownerId)?.asset ?? plan.fixtures.find((q) => q.id === sp.ownerId)?.kind
          overflow.push(`seed ${seed}: ${x.asset} 超出 ${owner} 的台面`)
        }
      }
    }
    expect(noSupport).toEqual([])
    expect(overflow).toEqual([])
  })


  test('有洗面所的户都有体重秤', () => {
    const bad = all(({ plan, f }) => (plan.rooms.some((r) => r.kind === 'wash') && !f.some((x) => /body-scale|fit-scale|^scale-/.test(x.asset)) ? ['没有体重秤'] : []))
    expect(bad).toEqual([])
  })

  test('有浴室的户都有洗发水和沐浴露', () => {
    // 同一组瓶子（洗发水 / 护发素 / 沐浴露同属 bath-bottle 一组）都算
    const fam = (id: string) => ASSET_MAP.get(id)?.limitGroup
    const has = (f: Furniture[], id: string) => f.some((x) => x.asset === id || (!!fam(id) && fam(x.asset) === fam(id)))
    const bad = all(({ plan, f }) =>
      plan.rooms.some((r) => r.kind === 'bath')
        ? [!has(f, 'wet-shampoo') && '没有洗发水', !has(f, 'wet-body-soap') && '没有沐浴露'].filter((x): x is string => !!x)
        : [],
    )
    expect(bad).toEqual([])
  })

  test('门口脚垫铺在玄关里、贴着大门（外墙上的门）内侧', () => {
    let n = 0
    const bad = all(({ plan, f }) =>
      f
        .filter((x) => /^lm-doormat-/.test(x.asset))
        .flatMap((x) => {
          n++
          const room = plan.rooms.find((r) => pointInPolygon(x, r.points))
          if (room?.kind !== 'entrance') return [`${x.asset} 不在玄关（${room?.kind}）`]
          const near = openingsOn(room, plan).some(({ o, e, center }) => o.kind === 'door' && wallThicknessAt(plan, center, e.out, room) >= plan.wallOuter && Math.hypot(x.x - center.x, x.y - center.y) < 45)
          return near ? [] : [`${x.asset} 离大门太远`]
        }),
    )
    expect(bad).toEqual([])
    // 不是空转：40 户里总有一些玄关铺了脚垫
    expect(n).toBeGreaterThan(0)
  })

  test('玄关留出宽 60 的通道：大门到各个内门走得通（玄关本身窄到走不通的除外）', () => {
    let n = 0
    const bad = all(({ plan, f }) =>
      plan.rooms
        .filter((r) => r.kind === 'entrance')
        .flatMap((room) => {
          const keys = openingsOn(room, plan)
            .filter(({ o }) => o.kind !== 'window')
            .map(({ e, center }) => {
              const into = pointInPolygon({ x: center.x + e.out.x * 10, y: center.y + e.out.y * 10 }, room.points) ? 1 : -1
              return { x: center.x + e.out.x * 30 * into, y: center.y + e.out.y * 30 * into }
            })
          if (keys.length < 2) return []
          const fixtures = plan.fixtures.filter((x) => !x.id.startsWith('stair-clear-') && !x.id.startsWith('void-rail-') && !x.id.endsWith('~hole'))
          const blocked = (furniture: Furniture[]) => {
            const g = new NavGrid({ ...plan, fixtures, furniture })
            const at = keys.map((k) => g.nearest('pet', k, 30, 40))
            return !at[0] || at.slice(1).some((a) => !a || !g.path('pet', at[0]!, a, 30))
          }
          // 空玄关也走不通（太窄，或门口被设备挡着）：不算家具的问题
          if (blocked(f.filter((x) => !pointInPolygon(x, room.points)))) return []
          n++
          return blocked(f) ? [`玄关 ${room.name} 被家具挤得过不去`] : []
        }),
    )
    expect(bad).toEqual([])
    expect(n).toBeGreaterThan(0)
  })

  test('走廊不被挤窄：矩形走廊里的落地家具旁边还留着 60 以上的通道', () => {
    const bad = all(({ plan, f }) =>
      plan.rooms
        .filter((r) => r.kind === 'hall' && r.points.length === 4)
        .flatMap((r) => {
          const xs = r.points.map((p) => p.x)
          const ys = r.points.map((p) => p.y)
          const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)
          // 窄边的净宽（墙中心线减墙厚）
          const width = (alongX ? Math.max(...ys) - Math.min(...ys) : Math.max(...xs) - Math.min(...xs)) - plan.wall
          return f
            .filter((x) => isFloor(x) && pointInPolygon(x, r.points))
            .flatMap((x) => {
              const cs = footprint(x).map((p) => (alongX ? p.y : p.x))
              const left = width - (Math.max(...cs) - Math.min(...cs))
              return left < 60 ? [`${x.asset} 只留 ${left.toFixed(0)}cm`] : []
            })
        }),
    )
    expect(bad).toEqual([])
  })

  test('多宝格、书架、展示柜的开放格子每一格都放了东西', () => {
    const bad = all(({ f }) =>
      f.flatMap((p) => {
        const pd = def(p)
        if (p.z || !isOpenShelf(pd)) return []
        // 柜门里的层（关着门看不见）不要求放满
        return pd.surfaces!.flatMap((lv) =>
          lv.kind === 'hook' || (lv.inside && !lv.glass)
            ? []
            : (lv.shape?.length ? lv.shape : [[[-pd.w / 2, -pd.d / 2], [pd.w / 2, pd.d / 2]] as [number, number][]]).flatMap((cell) => {
                const xs = cell.map((q) => q[0])
                const zs = cell.map((q) => q[1])
                const has = f.some((o) => {
                  if (o.z === undefined || Math.abs(o.z - lv.y) > 0.6) return false
                  const l = toLocal(p, o)
                  return l.x >= Math.min(...xs) - 1 && l.x <= Math.max(...xs) + 1 && l.y >= Math.min(...zs) - 1 && l.y <= Math.max(...zs) + 1
                })
                return has ? [] : [`${p.asset} y=${lv.y} 的格子是空的`]
              }),
        )
      }),
    )
    expect(bad).toEqual([])
  })

  test('落地绿植弯折后没有顶点穿进墙体', () => {
    const v = new THREE.Vector3()
    const bad = all(({ plan, f }) => {
      const out: string[] = []
      for (const x of f.filter((x) => isPlant(x.asset) && !def(x).prop && !def(x).mount && !x.z)) {
        const room = plan.rooms.find((r) => pointInPolygon(x, r.points))
        if (!room) continue
        const o = furnitureModel(x)
        placeFurniture(o, plan, x)
        bendToWalls(o, plan, x)
        o.updateMatrixWorld(true)
        const edges = edgesOf(room.points)
        const halfs = edges.map((e) => wallThicknessAt(plan, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, e.out, room) / 2)
        let over = 0
        o.traverse((m) => {
          const mesh = m as THREE.Mesh
          if (!mesh.isMesh || mesh.userData.isOutline) return
          const p = mesh.geometry.attributes.position
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)
            edges.forEach((e, k) => {
              const t = (v.x - e.a.x) * e.dir.x + (v.z - e.a.y) * e.dir.y
              if (t < 0 || t > e.length) return
              // 墙体中心线外侧半个墙厚以外才算穿出墙
              const s = (v.x - e.a.x) * e.out.x + (v.z - e.a.y) * e.out.y + halfs[k]
              if (s > over) over = s
            })
          }
        })
        if (over > 0.5) out.push(`${x.asset} 穿墙 ${over.toFixed(1)}cm`)
      }
      return out
    })
    expect(bad).toEqual([])
  })
})

describe('功能房成套布置', () => {
  test('一个人住的大户建：健身房有有氧 / 力量器械，衣帽间衣柜不超过两个、有挂衣杆或斗柜，客房有床', () => {
    const got = new Set<string>()
    const bad: string[] = []
    for (const seed of range(1, 30)) {
      const plan = generatePlan({ ...JP_OPTS, seed, region: 'west', dwelling: 'house' }).plan
      const base = generateHousehold(plan, seed)
      // 一个爱健身的上班族：自己一间，剩下的依次是健身房、书房、客房、衣帽间
      const me = { ...base.members[0], role: 'self' as const, age: 35, job: 'office' as const, interests: ['fitness' as const], levels: {} }
      const hh: Household = { ...base, kind: 'single', members: [me] }
      plan.household = hh
      const pur = allocateRooms(plan, hh).purposeOf
      if (![...pur.values()].some((p) => p === 'gym' || p === 'closet')) continue
      const f = decorateHouse(plan, seed, 'auto', hh)
      for (const [rid, p] of pur) {
        const room = plan.rooms.find((r) => r.id === rid)!
        const inRoom = f.filter((x) => !x.z && pointInPolygon(x, room.points) && (x.floor ?? baseFloorId(plan)) === floorOf(plan, room) && !ASSET_MAP.get(x.asset)?.prop)
        const n = (...ts: Parameters<typeof hasTag>[1][]) => inRoom.filter((x) => hasTag(ASSET_MAP.get(x.asset), ...ts)).length
        got.add(p)
        if (p === 'gym' && !n('cardio', 'strength', 'weights')) bad.push(`seed ${seed}: 健身房没有器械`)
        if (p === 'closet') {
          if (n('wardrobe') > 2) bad.push(`seed ${seed}: 衣帽间 ${n('wardrobe')} 个衣柜`)
          if (!n('wardrobe', 'garment-rail', 'dresser')) bad.push(`seed ${seed}: 衣帽间没有衣柜 / 挂衣杆 / 斗柜`)
        }
        if (p === 'guest' && room.kind === 'western' && !n('bed')) bad.push(`seed ${seed}: 客房没有床`)
      }
    }
    expect(bad).toEqual([])
    expect(got.has('gym')).toBe(true)
  }, 300_000)
})
