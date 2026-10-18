// 收纳位 + 柜体家具、可开合的柜子：素材结构、旧存档迁移、开关柜门时里面的东西、一键布置在收纳位上放柜子并往柜里收东西
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { cabinetsOn, LEGACY_OPEN_FORMS, legacyCabinet, migrateCabinets, setOpen } from '/src/cabinet'
import { checklist } from '/src/checklist'
import { applyFixes, decorate } from '/src/decorate'
import { generatePlan } from '/src/generate-region'
import { generateHousehold } from '/src/household'
import { pointInPolygon, rectPoints, type Fixture, type Furniture, type Plan } from '/src/model'
import { isPersonal, isPlateLike } from '/src/stow'
import { normalizePlan } from '/src/store'
import { fitsOnSurface, levels, pickSurface, propsOn, supportOf, toLocal, toWorld } from '/src/surface'
import { furnitureBox } from '/src/snap'
import { doorSwings } from '/src/place'
import { fixtureBox } from '/src/model'
import { ASSET_MAP, ASSETS } from '/src/three/assets'
import { countDoors, poseDoors } from '/src/three/kit'
import { hasTag } from '/src/three/tags'
import { floorY, furnitureModel, roomAt } from '/src/three/house'
import { JP_OPTS, range } from './helpers'

const OPENABLE = ASSETS.filter((a) => a.openable)
const CB = ASSETS.filter((a) => a.id.startsWith('cb-'))

describe('可开合柜子的素材', () => {
  test('收纳位柜体（cb-）都可开合、带类型标签，鞋柜 / 衣柜 / 食品柜三类都有', () => {
    expect(CB.length).toBeGreaterThan(20)
    for (const a of CB) {
      expect(a.openable, a.id).toBe(true)
      expect(a.tags, a.id).toContain(a.type)
    }
    expect(new Set(CB.map((a) => a.type))).toEqual(new Set(['shoe-storage', 'wardrobe', 'pantry']))
  })

  test('可开合的素材：模型里有会动的部件，至少一层在门里；打开再关上回到原样', () => {
    const bad: string[] = []
    for (const a of OPENABLE) {
      const g = a.build(a.palettes[0])
      if (!countDoors(g)) bad.push(`${a.id} 没有会动的部件`)
      if (!(a.surfaces ?? []).some((s) => s.inside)) bad.push(`${a.id} 没有门里的层`)
      g.updateMatrixWorld(true)
      const closed = new THREE.Box3().setFromObject(g, true)
      poseDoors(g, true)
      g.updateMatrixWorld(true)
      // 推拉门推到相邻门前面时整体包围盒可能不变：看会动的部件本身有没有挪
      let moved = false
      g.traverse((o) => {
        const b = o.userData.doorBase as { p: THREE.Vector3; r: THREE.Euler } | undefined
        if (b && (o.position.distanceTo(b.p) > 0.5 || Math.abs(o.rotation.x - b.r.x) + Math.abs(o.rotation.y - b.r.y) > 0.1)) moved = true
      })
      if (!moved) bad.push(`${a.id} 打开后没有变化`)
      poseDoors(g, false)
      g.updateMatrixWorld(true)
      const back = new THREE.Box3().setFromObject(g, true)
      if (back.min.distanceTo(closed.min) > 0.01 || back.max.distanceTo(closed.max) > 0.01) bad.push(`${a.id} 关上后没有复原`)
    }
    expect(bad).toEqual([])
  })

  test('不可开合的素材没有会动的部件、也没有门里的层', () => {
    const bad = ASSETS.filter((a) => !a.openable && (a.surfaces ?? []).some((s) => s.inside || s.slide || s.slideX)).map((a) => a.id)
    expect(bad).toEqual([])
  })

  test('门里的层合法：在占地范围内、净高为正；抽屉格的拉出距离为正；挂杆层有形状', () => {
    const bad: string[] = []
    for (const a of OPENABLE)
      for (const [i, s] of (a.surfaces ?? []).entries()) {
        if (!s.inside) continue
        const tag = `${a.id}#${i}`
        if (!(s.h! > 0)) bad.push(`${tag} 净高 ${s.h}`)
        if (s.slide !== undefined && !(s.slide > 0)) bad.push(`${tag} slide ${s.slide}`)
        if (s.kind === 'hook' && !s.shape?.length) bad.push(`${tag} 挂杆没有形状`)
        // 壁挂柜的层 y 是离地高度
        if (s.y < (a.mount ?? 0) || s.y > (a.mount ?? 0) + a.h) bad.push(`${tag} 高度 ${s.y} 超出柜子`)
        for (const pl of s.shape ?? []) for (const [x, z] of pl) if (Math.abs(x) > a.w / 2 + 0.5 || Math.abs(z) > a.d / 2 + 0.5) bad.push(`${tag} 层超出占地 (${x}, ${z})`)
      }
    expect(bad).toEqual([])
  })
})

/** 玄关 + 卧室 + 厨房的最小户型，三种收纳位各一个 */
function spotPlan(fixtures: Fixture[]): Plan {
  return {
    version: 1,
    name: 'old',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'r1', name: '玄関', kind: 'entrance', points: rectPoints(0, 0, 300, 300) },
      { id: 'r2', name: '洋室', kind: 'western', points: rectPoints(300, 0, 800, 400) },
      { id: 'r3', name: 'K', kind: 'kitchen', points: rectPoints(800, 0, 1200, 400) },
    ],
    openings: [],
    fixtures,
    furniture: [],
  }
}
const spot = (id: string, builtinType: Fixture['builtinType'], x: number, w: number, d: number, open?: boolean): Fixture => ({ id, kind: 'builtin', builtinType, x, y: d / 2, w, d, rot: 0, ...(open ? { open } : {}) })

describe('旧存档迁移', () => {
  test('内置收纳 → 位上生成同类柜子，柜门开关继承，收纳位上的 open 清掉；重复迁移不再生成', () => {
    const plan = spotPlan([spot('s', 'shoe', 150, 90, 38, true), spot('c', 'closet', 550, 180, 60), spot('p', 'pantry', 1000, 90, 40, true)])
    expect(migrateCabinets(plan)).toBe(3)
    for (const fx of plan.fixtures) {
      const on = cabinetsOn(plan.furniture, fx)
      expect(on.length, fx.id).toBe(1)
      const def = ASSET_MAP.get(on[0].asset)!
      expect(def.w).toBeLessThanOrEqual(fx.w)
      expect(def.openable).toBe(true)
      expect(fx.open).toBeUndefined()
    }
    expect(cabinetsOn(plan.furniture, plan.fixtures[0])[0].open).toBe(true)
    expect(cabinetsOn(plan.furniture, plan.fixtures[1])[0].open).toBeUndefined()
    expect(plan.cabinetsAsFurniture).toBe(true)
    expect(migrateCabinets(plan)).toBe(0)
    expect(plan.furniture.length).toBe(3)
  })

  test('读档（normalizePlan）时迁移；旧内置收纳里的鞋、挂着的衣服仍落在新柜子的层板 / 挂衣杆上', () => {
    const old = spotPlan([spot('s', 'shoe', 150, 90, 38, true), spot('c', 'closet', 550, 180, 60, true)])
    // 旧鞋柜 y = 26 的层板上一双鞋；旧壁内收纳的挂衣杆（局部 z = 0.9，挂钩层 y = 171.85）上挂一排衣服
    old.furniture.push({ id: 'shoe', asset: 'sb-shoe-sneaker-f', x: 150, y: 19, rot: 0, z: 26 })
    old.furniture.push({ id: 'row', asset: 'gm-row-women-60-hanging', x: 550, y: 30.9, rot: 0, z: 171.85 })
    const p = normalizePlan(JSON.parse(JSON.stringify(old)))!
    const cab = (id: string) => cabinetsOn(p.furniture, p.fixtures.find((f) => f.id === id)!)[0]
    expect(supportOf(p, p.furniture.find((f) => f.id === 'shoe')!)?.ownerId).toBe(cab('s').id)
    expect(supportOf(p, p.furniture.find((f) => f.id === 'row')!)?.ownerId).toBe(cab('c').id)
  })

  test('以前「打开」形态的另一件素材 → 同一件可开合素材 + open（位置、配色照旧）', () => {
    const old = spotPlan([])
    old.furniture.push({ id: 'a', asset: 'sb-shoe-cab-open', x: 150, y: 40, rot: 90, color: 1 }, { id: 'b', asset: 'fm-storage-bed-open', x: 500, y: 200, rot: 0 })
    const p = normalizePlan(JSON.parse(JSON.stringify(old)))!
    for (const [id, asset] of Object.entries(LEGACY_OPEN_FORMS)) {
      expect(ASSET_MAP.has(id), id).toBe(false)
      expect(ASSET_MAP.get(asset)?.openable, asset).toBe(true)
    }
    expect(p.furniture.map((f) => [f.id, f.asset, f.open, f.x, f.y, f.color])).toEqual([
      ['a', 'sb-shoe-cab-closed', true, 150, 40, 1],
      ['b', 'fm-storage-bed', true, 500, 200, undefined],
    ])
  })

  test('放不进位的宽度时退到最窄的一档', () => {
    const f = legacyCabinet(spot('s', 'shoe', 150, 40, 38))!
    expect(ASSET_MAP.get(f.asset)!.series).toBe('cb-shoe-tall')
  })
})

describe('柜门 / 抽屉子树合并网格', () => {
  const solid = (root: THREE.Object3D) => {
    let n = 0
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) n++
    })
    return n
  }
  test('合并后会动的部件还在、开关后的外形和未合并的模型一致，网格数下降', () => {
    const bad: string[] = []
    let rawMeshes = 0
    let mergedMeshes = 0
    for (const a of OPENABLE) {
      const raw = a.build(a.palettes[0])
      for (const open of [false, true]) {
        const g = furnitureModel({ id: 'x', asset: a.id, x: 0, y: 0, rot: 0, open })
        if (countDoors(g) !== countDoors(raw)) bad.push(`${a.id} 会动的部件数变了`)
        poseDoors(raw, open)
        raw.updateMatrixWorld(true)
        g.updateMatrixWorld(true)
        const rb = new THREE.Box3().setFromObject(raw, true)
        const gb = new THREE.Box3().setFromObject(g, true)
        if (rb.min.distanceTo(gb.min) > 0.05 || rb.max.distanceTo(gb.max) > 0.05) bad.push(`${a.id} open=${open} 外形不一致`)
        // 每个门 / 抽屉子树里：同材质的零件只剩一个网格
        g.traverse((o) => {
          if (!o.userData.door) return
          const mats = new Map<string, number>()
          const walk = (x: THREE.Object3D) => {
            for (const c of x.children) {
              if (c.userData.door || c.userData.isOutline) continue
              const m = c as THREE.Mesh
              if (m.isMesh && !Object.keys(c.userData).some((k) => k !== 'noOutline') && !Array.isArray(m.material) && !m.material.transparent) {
                const k = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${!!c.userData.noOutline}`
                mats.set(k, (mats.get(k) ?? 0) + 1)
              }
              if (!Object.keys(c.userData).some((k) => k !== 'noOutline')) walk(c)
            }
          }
          walk(o)
          for (const [k, n] of mats) if (n > 1 && !k.includes('undefined')) bad.push(`${a.id} 门里同材质还有 ${n} 个网格`)
        })
        if (!open) {
          rawMeshes += solid(raw)
          mergedMeshes += solid(g)
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
    expect(mergedMeshes).toBeLessThan(rawMeshes * 0.5)
  })
})

describe('静态矩阵', () => {
  test('家具模型内部是静态矩阵；对静态模型 poseDoors 后矩阵和位姿一致', () => {
    const a = OPENABLE.find((x) => x.id.startsWith('cb-'))!
    const g = furnitureModel({ id: 'x', asset: a.id, x: 0, y: 0, rot: 0 })
    let auto = 0
    g.children[0].traverse((o) => {
      if (o.matrixAutoUpdate) auto++
    })
    expect(auto).toBe(0)
    poseDoors(g, true)
    const L = new THREE.Matrix4()
    let doors = 0
    g.traverse((o) => {
      if (!o.userData.door) return
      doors++
      L.compose(o.position, o.quaternion, o.scale)
      expect(o.matrix.equals(L), a.id).toBe(true)
    })
    expect(doors).toBeGreaterThan(0)
  })
})

describe('打开 / 关上', () => {
  /** 一件柜子 + 门里层板上一件 + 抽屉里一件（上面再叠一件） */
  function setup() {
    const cab: Furniture = { id: 'cab', asset: 'cb-pantry-drawer-60', x: 500, y: 200, rot: 90 }
    const def = ASSET_MAP.get(cab.asset)!
    const shelf = def.surfaces!.findIndex((s) => s.inside && !s.slide && s.kind !== 'hook')
    const drawer = def.surfaces!.findIndex((s) => !!s.slide)
    const at = (i: number) => {
      const pl = def.surfaces![i].shape![0]
      const cx = (pl[0][0] + pl[2][0]) / 2
      const cz = (pl[0][1] + pl[2][1]) / 2
      const a = (cab.rot * Math.PI) / 180
      return { x: cab.x + cx * Math.cos(a) - cz * Math.sin(a), y: cab.y + cx * Math.sin(a) + cz * Math.cos(a), z: def.surfaces![i].y }
    }
    const inShelf: Furniture = { id: 'jar', asset: 'sb-shoe-ballet-k', ...at(shelf), rot: 90 }
    const inDrawer: Furniture = { id: 'box', asset: 'sb-shoe-ballet-k', ...at(drawer), rot: 90 }
    const plan = { ...spotPlan([]), furniture: [cab, inShelf, inDrawer] }
    return { plan, cab, inShelf, inDrawer, slide: def.surfaces![drawer].slide! }
  }

  test('打开：id、位置不变，门里的东西不动，抽屉里的东西跟着抽屉拉出且仍有支撑；关上复原', () => {
    const { plan, cab, inShelf, inDrawer, slide } = setup()
    const before = JSON.parse(JSON.stringify(plan.furniture)) as Furniture[]
    expect(supportOf(plan, inDrawer)?.ownerId).toBe('cab')
    setOpen(plan, cab, true)
    expect(cab.open).toBe(true)
    expect(plan.furniture.map((f) => f.id)).toEqual(before.map((f) => f.id))
    expect({ x: cab.x, y: cab.y, rot: cab.rot }).toEqual({ x: before[0].x, y: before[0].y, rot: before[0].rot })
    expect({ x: inShelf.x, y: inShelf.y, z: inShelf.z }).toEqual({ x: before[1].x, y: before[1].y, z: before[1].z })
    const l0 = toLocal(cab, before[2])
    const l1 = toLocal(cab, inDrawer)
    expect(l1.y - l0.y).toBeCloseTo(slide, 0)
    expect(supportOf(plan, inShelf)?.ownerId).toBe('cab')
    expect(supportOf(plan, inDrawer)?.ownerId).toBe('cab')
    expect(propsOn(plan, cab).map((f) => f.id).sort()).toEqual(['box', 'jar'])
    setOpen(plan, cab, false)
    expect(cab.open).toBeUndefined()
    expect(plan.furniture).toEqual(before)
  })

  test('关着门时射线放不进门里的层，打开后可以', () => {
    const { plan, cab } = setup()
    plan.furniture = [cab]
    const def = ASSET_MAP.get(cab.asset)!
    const lv = def.surfaces!.find((s) => s.inside && !s.slide && s.kind !== 'hook')!
    // 从柜子正前方斜着往下打向门里那一层的中心（rot 90：正面朝世界 -x）
    const fy = floorY(roomAt(plan, cab))
    const target = new THREE.Vector3(cab.x, fy + lv.y, cab.y)
    const origin = new THREE.Vector3(cab.x - 200, fy + lv.y + 40, cab.y)
    const ray = new THREE.Ray(origin, target.clone().sub(origin).normalize())
    const hitClosed = pickSurface(plan, ray, new Set())
    expect(hitClosed?.z === lv.y && hitClosed.owner === 'cab').toBe(false)
    setOpen(plan, cab, true)
    const hitOpen = pickSurface(plan, ray, new Set())
    expect(hitOpen?.owner).toBe('cab')
  })
})

describe('一键布置', () => {
  const regions = ['jp', 'cn', 'west'] as const
  const plans = regions.flatMap((region) =>
    range(1, 6).map((seed) => {
      const plan = generatePlan({ seed, ...JP_OPTS, region }).plan
      plan.household = generateHousehold(plan, seed)
      plan.furniture = decorate(plan, seed, 'auto', plan.household)
      return { region, seed, plan }
    }),
  )

  test('有收纳位的户型里出现过三种收纳位', () => {
    const kinds = new Set(plans.flatMap(({ plan }) => plan.fixtures.filter((f) => f.kind === 'builtin').map((f) => f.builtinType ?? 'shoe')))
    expect(kinds).toEqual(new Set(['shoe', 'closet', 'pantry']))
  })

  test('每个收纳位上都放着一件同类、不比位宽的柜子', () => {
    const bad: string[] = []
    for (const { region, seed, plan } of plans)
      for (const fx of plan.fixtures.filter((f) => f.kind === 'builtin')) {
        const on = cabinetsOn(plan.furniture, fx)
        if (on.length !== 1) bad.push(`${region} ${seed}: ${fx.builtinType} 位上有 ${on.length} 件柜子`)
        for (const c of on) if (ASSET_MAP.get(c.asset)!.w > fx.w + 1) bad.push(`${region} ${seed}: ${c.asset} 比位（${fx.w}）宽`)
      }
    expect(bad).toEqual([])
  })

  test('关着门的柜子里：只有日常收纳类的东西，没有兴趣 / 收藏 / 装饰等个性物品', () => {
    const bad: string[] = []
    for (const { region, seed, plan } of plans)
      for (const cab of plan.furniture.filter((f) => ASSET_MAP.get(f.asset)?.openable && !f.open)) {
        const def = ASSET_MAP.get(cab.asset)!
        const hidden = (def.surfaces ?? []).filter((s) => s.inside && !s.glass).map((s) => (cab.z ?? 0) + s.y)
        for (const o of propsOn(plan, cab)) {
          const od = ASSET_MAP.get(o.asset)!
          if (supportOf(plan, o)?.ownerId !== cab.id || !hidden.some((z) => Math.abs((o.z ?? 0) - z) < 0.5)) continue
          if ((od.tags ?? []).some((t) => t.startsWith('hobby:')) || od.tags?.includes('collectible') || isPersonal(od)) bad.push(`${region} ${seed}: ${cab.asset} 里有 ${o.asset}`)
        }
      }
    expect(bad).toEqual([])
  })

  test('柜子里收了东西（鞋柜里有鞋、衣柜里挂着衣服），也有开着门的柜子', () => {
    const all = plans.flatMap(({ plan }) => plan.furniture.filter((f) => ASSET_MAP.get(f.asset)?.openable).map((cab) => ({ plan, cab })))
    const inside = (type: string, tag: string) =>
      all.some(({ plan, cab }) => ASSET_MAP.get(cab.asset)!.type === type && propsOn(plan, cab).some((o) => ASSET_MAP.get(o.asset)!.tags?.includes(tag as never)))
    expect(inside('shoe-storage', 'shoe')).toBe(true)
    expect(inside('wardrobe', 'clothing')).toBe(true)
    expect(all.some(({ cab }) => cab.open)).toBe(true)
  })

  /** 厨房一带的收纳：厨房吊柜、餐厨类柜子（食器棚、餐边柜）、食品柜 */
  const kitchenCabs = plans.flatMap(({ region, seed, plan }) =>
    plan.furniture
      .filter((f) => {
        const d = ASSET_MAP.get(f.asset)!
        return !f.z && d.openable && (f.asset.startsWith('ws-kitchen-cab') || d.type === 'pantry' || d.category === 'dining')
      })
      .map((cab) => ({ region, seed, plan, cab, kids: propsOn(plan, cab).filter((o) => supportOf(plan, o)?.ownerId === cab.id) })),
  )

  test('厨房一带的柜子里收着餐具，盘子、碗优先；厨房吊柜里只有餐具、锅具，没有日用杂物', () => {
    const bad: string[] = []
    let plates = 0
    let cups = 0
    for (const { region, seed, cab, kids } of kitchenCabs)
      for (const o of kids) {
        const od = ASSET_MAP.get(o.asset)!
        if (isPlateLike(od)) plates++
        else if (hasTag(od, 'cup', 'mug', 'teacup', 'coffee-cup', 'tea-set')) cups++
        if (cab.asset.startsWith('ws-kitchen-cab') && !hasTag(od, 'tableware', 'cup', 'mug', 'teacup', 'coffee-cup', 'tea-set', 'cookware')) bad.push(`${region} ${seed}: ${cab.asset} 里有 ${o.asset}`)
        if (hasTag(od, 'toothbrush', 'wet-supply')) bad.push(`${region} ${seed}: ${cab.asset} 里有 ${o.asset}`)
      }
    expect(bad).toEqual([])
    expect(kitchenCabs.some(({ cab }) => cab.asset.startsWith('ws-kitchen-cab'))).toBe(true)
    // 每件厨房吊柜都收了东西
    for (const { cab, kids } of kitchenCabs) if (cab.asset.startsWith('ws-kitchen-cab')) expect(kids.length, cab.asset).toBeGreaterThan(0)
    expect(plates).toBeGreaterThan(cups)
    // 食品柜里既有食品也有碗盘（齐腰到齐眼高的层、玻璃门里放碗盘）
    const pantries = kitchenCabs.filter(({ cab }) => ASSET_MAP.get(cab.asset)!.type === 'pantry')
    expect(pantries.some(({ kids }) => kids.some((o) => isPlateLike(ASSET_MAP.get(o.asset)!)) && kids.some((o) => hasTag(ASSET_MAP.get(o.asset)!, 'food', 'drink')))).toBe(true)
  })

  test('柜子里收的东西整件落在那一层里、不高过层高、彼此不重叠', () => {
    const bad: string[] = []
    for (const { region, seed, plan } of plans)
      for (const cab of plan.furniture.filter((f) => ASSET_MAP.get(f.asset)?.openable)) {
        const lvs = levels(cab.asset, !!cab.open)
        const kids = propsOn(plan, cab).filter((o) => supportOf(plan, o)?.ownerId === cab.id)
        const boxes = kids.map((o) => ({ o, b: furnitureBox(o.asset, o.x, o.y, o.rot) }))
        for (const o of kids) {
          const od = ASSET_MAP.get(o.asset)!
          // 同一高度可能有好几格（多宝格左右两列层高不同）：落在哪一格按中心算
          const l = toLocal(cab, o)
          const lv = lvs.find((v) => Math.abs((cab.z ?? 0) + v.y - (o.z ?? 0)) < 0.5 && v.polys.some((pl) => pointInPolygon(l, pl.map(([x, z]) => ({ x, y: z })))))
          if (!lv || lv.kind === 'hook' || lv.kind === 'clip') continue
          if (!fitsOnSurface(cab, o.z ?? 0, o.asset, o.x, o.y, o.rot)) bad.push(`${region} ${seed}: ${o.asset} 伸出 ${cab.asset} 的层`)
          if (od.h > lv.h + 0.01) bad.push(`${region} ${seed}: ${o.asset}（高 ${od.h}）顶到 ${cab.asset} 的上一层（层高 ${lv.h}）`)
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const [p, q] = [boxes[i], boxes[j]]
            if (Math.abs((p.o.z ?? 0) - (q.o.z ?? 0)) > 0.5) continue
            const ox = Math.min(p.b.x1, q.b.x1) - Math.max(p.b.x0, q.b.x0)
            const oy = Math.min(p.b.y1, q.b.y1) - Math.max(p.b.y0, q.b.y0)
            if (ox > 1 && oy > 1 && (ASSET_MAP.get(cab.asset)!.surfaces ?? []).some((s) => s.inside && Math.abs((cab.z ?? 0) + s.y - (p.o.z ?? 0)) < 0.5)) bad.push(`${region} ${seed}: ${cab.asset} 里 ${p.o.asset} 和 ${q.o.asset} 重叠`)
          }
      }
    expect(bad).toEqual([])
  })

  test('开着的柜子：门扇 / 抽屉伸出柜体的部分不压别的家具、设备，不挡房门的开合范围', () => {
    const bad: string[] = []
    for (const { region, seed, plan } of plans)
      for (const cab of plan.furniture.filter((f) => f.open && !f.z)) {
        const def = ASSET_MAP.get(cab.asset)!
        const g = def.build(def.palettes[0])
        g.updateMatrixWorld(true)
        const closed = new THREE.Box3().setFromObject(g, true)
        poseDoors(g, true)
        g.updateMatrixWorld(true)
        const open = new THREE.Box3().setFromObject(g, true)
        const mine = new Set([cab.id, ...propsOn(plan, cab).map((o) => o.id)])
        const others = plan.furniture.filter((o) => !mine.has(o.id) && !o.z && !ASSET_MAP.get(o.asset)!.mount && ASSET_MAP.get(o.asset)!.h > 3).map((o) => ({ o, b: furnitureBox(o.asset, o.x, o.y, o.rot) }))
        const fixtures = plan.fixtures.filter((fx) => !['builtin', 'fridge', 'washer'].includes(fx.kind)).map(fixtureBox)
        const swings = plan.rooms.flatMap((r) => doorSwings(r, plan))
        const inB = (b: { x0: number; y0: number; x1: number; y1: number }, p: { x: number; y: number }) => p.x > b.x0 + 2 && p.x < b.x1 - 2 && p.y > b.y0 + 2 && p.y < b.y1 - 2
        for (let x = open.min.x; x <= open.max.x; x += 5)
          for (let z = open.min.z; z <= open.max.z; z += 5) {
            if (x > closed.min.x - 1 && x < closed.max.x + 1 && z > closed.min.z - 1 && z < closed.max.z + 1) continue
            const p = toWorld(cab, x, z)
            const hit = others.find(({ b }) => inB(b, p))
            if (hit) bad.push(`${region} ${seed}: 开着的 ${cab.asset} 压到 ${hit.o.asset}`)
            if (fixtures.some((b) => inB(b, p))) bad.push(`${region} ${seed}: 开着的 ${cab.asset} 压到设备`)
            if (swings.some((b) => inB(b, p))) bad.push(`${region} ${seed}: 开着的 ${cab.asset} 挡房门`)
          }
      }
    expect([...new Set(bad)]).toEqual([])
  })

  test('检查清单：收纳位上的柜子按家具计数；拿掉后一键补齐放回位上', () => {
    const c = plans.find(({ plan }) => plan.fixtures.some((f) => f.kind === 'builtin' && (f.builtinType ?? 'shoe') === 'shoe'))!
    const { plan, seed } = c
    const fx = plan.fixtures.find((f) => f.kind === 'builtin' && (f.builtinType ?? 'shoe') === 'shoe')!
    const cab = cabinetsOn(plan.furniture, fx)[0]
    const gone = new Set([cab.id, ...propsOn(plan, cab).map((o) => o.id)])
    plan.furniture = plan.furniture.filter((f) => !gone.has(f.id))
    const item = checklist(plan, plan.household).find((i) => i.label === '鞋柜 / 鞋架' && i.fix?.how === 'spot')
    expect(item).toBeTruthy()
    plan.furniture = applyFixes(plan, [item!], plan.household, seed)
    expect(cabinetsOn(plan.furniture, fx).length).toBe(1)
  })
})
