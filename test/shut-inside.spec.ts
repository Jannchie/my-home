// 关着的柜子里看不见的东西不画：收在柜内层上的家具（surface.ts shutAll，沙盘 applyShut 按它藏），
// 和模型自己抽屉里码着的东西（kit.ts innards，poseDoor 按开合管可见性）
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { decorate } from '/src/decorate'
import { generatePlan } from '/src/generate-region'
import { generateHousehold } from '/src/household'
import { levels, propsOn, propsOnTop, shutAll, toLocal } from '/src/surface'
import { ASSET_MAP } from '/src/three/assets'
import { doorParts, poseDoor } from '/src/three/kit'
import { furnitureModel } from '/src/three/house'
import { triCount } from '/src/three/geo'
import { JP_OPTS } from './helpers'
import { pointInPolygon, type Furniture, type Plan } from '/src/model'
import type { Poly } from '/src/three/assetMeta'

/** o 的中心落在 f 的某块区域里（f 的局部坐标） */
const toLocalIn = (f: Furniture, polys: Poly[], o: Furniture) => polys.some((pl) => pointInPolygon(toLocal(f, o), pl.map(([x, z]) => ({ x, y: z }))))

/** 对照实现：不分桶，逐件扫整个户型（shutAll 必须和它一致） */
function shutInside(plan: Pick<Plan, 'furniture'>, f: Furniture): Furniture[] {
  const lv = levels(f.asset).filter((l) => l.inside)
  if (!lv.length) return []
  const base = f.z ?? 0
  const direct = plan.furniture.filter((o) => o.id !== f.id && o.floor === f.floor && lv.some((l) => Math.abs((o.z ?? 0) - (base + l.y)) < 0.5 && toLocalIn(f, l.polys, o)))
  return direct.flatMap((o) => [o, ...propsOn(plan, o, 1)])
}

/** 画得出来的三角面（祖先里有一个不可见就不算） */
function visibleTris(root: THREE.Object3D) {
  let n = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return
    n += triCount(m.geometry)
  })
  return n
}

describe('收在柜子里的东西', () => {
  const plan = generatePlan({ seed: 5, ...JP_OPTS, region: 'jp' }).plan
  plan.furniture = decorate(plan, 5, 'auto', generateHousehold(plan, 5))

  test('一键布置后有柜子里收着东西；收着的都在柜内（非玻璃门）的层上，柜顶上摆的不算', () => {
    let hosts = 0
    for (const f of plan.furniture) {
      const inside = shutInside(plan, f)
      if (!inside.length) continue
      hosts++
      const ys = levels(f.asset)
        .filter((l) => l.inside)
        .map((l) => (f.z ?? 0) + l.y)
      const top = new Set(propsOnTop(plan, f).map((o) => o.id))
      for (const o of inside) expect(top.has(o.id), `${f.asset} 顶上的 ${o.asset}`).toBe(false)
      // 直接收在层上的（叠在上面的另算）高度对得上某一层
      expect(inside.some((o) => ys.some((y) => Math.abs((o.z ?? 0) - y) < 0.5))).toBe(true)
    }
    expect(hosts).toBeGreaterThan(0)
  })

  test('整户一次算（shutAll）和逐件算（shutInside）结果一样', () => {
    for (const [region, seed] of [['jp', 5], ['cn', 3], ['west', 1]] as const) {
      const p = generatePlan({ seed, ...JP_OPTS, region }).plan
      p.furniture = decorate(p, seed, 'auto', generateHousehold(p, seed))
      const all = shutAll(p)
      const each = new Map(p.furniture.map((f) => [f.id, shutInside(p, f).map((o) => o.id)] as const).filter(([, ids]) => ids.length))
      expect(new Map([...all].map(([k, v]) => [k, [...v].sort()])), `${region}#${seed}`).toEqual(new Map([...each].map(([k, v]) => [k, [...v].sort()])))
    }
  })

  test('没有柜内层的家具（桌子、床）不藏东西', () => {
    for (const f of plan.furniture) {
      if (levels(f.asset).some((l) => l.inside)) continue
      expect(shutInside(plan, f), f.asset).toEqual([])
    }
  })
})

describe('抽屉里码着的东西（innards）', () => {
  test('内衣柜关着时抽屉里的衣物不画，拉开一格只露出那一格', () => {
    const def = ASSET_MAP.get('be-lingerie-48-closed')!
    const closed = furnitureModel({ id: 'a', asset: def.id, x: 0, y: 0, rot: 0 })
    const open = furnitureModel({ id: 'b', asset: def.id, x: 0, y: 0, rot: 0, open: true })
    const tc = visibleTris(closed)
    const to = visibleTris(open)
    expect(tc).toBeLessThan(to / 4)
    const parts = doorParts(closed)
    poseDoor(parts[0], 0.3)
    const one = visibleTris(closed)
    expect(one).toBeGreaterThan(tc)
    expect(one).toBeLessThan(to)
    poseDoor(parts[0], 0)
    expect(visibleTris(closed)).toBe(tc)
  })

  test('模板（素材直接 build）里的东西都在：体检、尺寸测量照样看得到', () => {
    const def = ASSET_MAP.get('be-lingerie-48-closed')!
    const g = def.build(def.palettes[0])
    let hidden = 0
    g.traverse((o) => {
      if (!o.visible) hidden++
    })
    expect(hidden).toBe(0)
  })
})
