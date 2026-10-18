// 贴附物（便签、贴纸）的 spin：在贴着的面里绕正中转，朝向（rot）和中心位置不变。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { placeFurniture } from '/src/three/house'
import { ASSET_MAP } from '/src/three/assets'
import { rectPoints, type Plan } from '/src/model'

const plan = { rooms: [{ id: 'r', name: 'r', kind: 'western', points: rectPoints(0, 0, 400, 400) }], openings: [], fixtures: [], furniture: [], wall: 12, wallOuter: 18 } as unknown as Plan

describe('贴附物的 spin', () => {
  const def = ASSET_MAP.get('sn-heart-l')!
  test('心形便签是贴附物，没有歪着的造型变体', () => {
    expect(def.stick).toBe(true)
    expect(ASSET_MAP.get('sn-heart-r')!.sizeLabel).not.toMatch(/倾/)
  })

  test('转 spin 后中心不动、厚度方向（朝向）不变，上方向在面里转了相应角度', () => {
    const at = (spin: number) => {
      const o = new THREE.Object3D()
      placeFurniture(o, plan, { asset: def.id, x: 120, y: 80, rot: 90, z: 150, spin })
      o.updateMatrixWorld(true)
      const center = new THREE.Vector3(0, def.h / 2, 0).applyMatrix4(o.matrixWorld)
      const q = new THREE.Quaternion()
      o.getWorldQuaternion(q)
      return { center, normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q) }
    }
    const a = at(0)
    const b = at(30)
    expect(b.center.distanceTo(a.center)).toBeLessThan(1e-6)
    expect(b.normal.angleTo(a.normal)).toBeLessThan(1e-6)
    expect((b.up.angleTo(a.up) * 180) / Math.PI).toBeCloseTo(30, 5)
  })
})
