// 可见性回归：壁炉的拱门必须真的开孔（曾因 holePanel 的 arch 洞底贴板底 + bevel 被填死）。
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSET_MAP } from '/src/three/assets'

test('sw-fh-fireplace: 拱门开孔，能打到炉膛而不是石墙', () => {
  const def = ASSET_MAP.get('sw-fh-fireplace')!
  expect(def).toBeTruthy()
  const g = def.build(def.palettes[0] ?? [])
  g.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(g, true)
  const size = box.getSize(new THREE.Vector3())
  expect([size.x, size.z, size.y].map((v) => Math.round(v))).toEqual([170, 50, 132])
  expect(box.min.y).toBeCloseTo(0, 1)

  const rc = new THREE.Raycaster()
  const firstZ = (y: number) => {
    rc.set(new THREE.Vector3(0, y, 200), new THREE.Vector3(0, 0, -1))
    const hit = rc.intersectObject(g, true)[0]
    expect(hit).toBeTruthy()
    return 200 - hit.distance
  }
  // 开口内：第一面应是深处的炉膛背板（z 约 -20），不是正面石墙（z 约 +11）
  for (const y of [20, 40, 60]) expect(firstZ(y)).toBeLessThan(-10)
  // 开口上方：仍是石头过梁，不能通到背后
  expect(firstZ(80)).toBeGreaterThan(0)
})
