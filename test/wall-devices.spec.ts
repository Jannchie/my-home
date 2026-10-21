// 墙上的设备（three/wallDevices.ts）：自动摆的可视对讲、遥控面板接管成挂墙家具后不再自动画，位置和自动摆的一样
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { buildHouse, openingInfos } from '/src/three/house'
import { takeOverDevices, wallDeviceSpots, DEVICE_ASSET } from '/src/three/wallDevices'
import { ASSET_MAP } from '/src/three/assets'
import { furnitureModel } from '/src/three/house'
import { checklist } from '/src/checklist'
import { genJp, range } from './helpers'

/** 房子里自动画的、能接管的设备 */
const autoDevices = (root: THREE.Object3D) => {
  const out: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.userData.wallDevice) out.push(o)
  })
  return out
}

describe('墙上设备接管成家具', () => {
  const plans = range(1, 8)
    .map((s) => genJp(s))
    .filter((p) => p.rooms.some((r) => r.kind === 'ldk'))

  test('接管后：对讲、遥控面板变成挂墙家具，房子里不再自动画；灯开关照旧', () => {
    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans.map((p) => structuredClone(p))) {
      const before = autoDevices(buildHouse(plan, 240))
      expect(before.length).toBeGreaterThanOrEqual(2)
      const switches = wallDeviceSpots(plan, openingInfos(plan)).filter((s) => s.kind === 'switch').length
      const made = takeOverDevices(plan)
      expect(made.length).toBe(before.length)
      expect(plan.devicesAsFurniture).toBe(true)
      expect(made.map((f) => f.asset)).toContain(DEVICE_ASSET.intercom)
      expect(autoDevices(buildHouse(plan, 240)).length).toBe(0)
      expect(wallDeviceSpots(plan, openingInfos(plan)).filter((s) => s.kind === 'switch').length).toBe(switches)
      // 再接管一次不会重复加
      expect(takeOverDevices(plan)).toEqual([])
    }
  })

  test('接管出来的家具摆在自动摆的位置上（高度、离墙一样）', () => {
    const plan = structuredClone(plans[0])
    const root = buildHouse(plan, 240)
    root.updateMatrixWorld(true)
    const auto = autoDevices(root).map((o) => ({ kind: o.userData.wallDevice as keyof typeof DEVICE_ASSET, box: new THREE.Box3().setFromObject(o) }))
    for (const f of takeOverDevices(plan)) {
      const def = ASSET_MAP.get(f.asset)!
      const g = new THREE.Group()
      const m = furnitureModel(f)
      g.add(m)
      m.position.set(f.x, 0, f.y)
      m.rotation.y = (-f.rot * Math.PI) / 180
      g.updateMatrixWorld(true)
      const b = new THREE.Box3().setFromObject(m)
      const a = auto.find((x) => DEVICE_ASSET[x.kind] === f.asset)!
      expect(def.mount).toBeDefined()
      const ca = a.box.getCenter(new THREE.Vector3())
      const cb = b.getCenter(new THREE.Vector3())
      expect(ca.distanceTo(cb), f.asset).toBeLessThan(2.5)
    }
  })

  test('检查清单：接管前是内置，接管后删掉对讲就算缺', () => {
    const plan = structuredClone(plans[0])
    const label = '可视对讲 / 热水器遥控'
    expect(checklist(plan).find((c) => c.label === label)?.builtin).toBe(true)
    takeOverDevices(plan)
    expect(checklist(plan).find((c) => c.label === label)?.have).toBe(1)
    plan.furniture = plan.furniture.filter((f) => f.asset !== DEVICE_ASSET.intercom)
    expect(checklist(plan).find((c) => c.label === label)?.have).toBe(0)
  })
})
