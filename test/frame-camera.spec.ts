// 沙盘在没有尺寸的画布上挂载（后台标签页、隐藏的面板）：取景不能把镜头算成 NaN / 无穷远（整个场景全黑、恢复不了）
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { frameCamera } from '/src/three/stage'

describe('frameCamera', () => {
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(800, 240, 600))
  for (const aspect of [0, NaN, Infinity]) {
    test(`宽高比 ${aspect} 时镜头位置仍是有限值，并对着包围盒中心`, () => {
      const cam = new THREE.PerspectiveCamera(30, aspect, 5, 20000)
      const c = frameCamera(cam, box)
      expect(cam.position.toArray().every(Number.isFinite)).toBe(true)
      expect(c.toArray()).toEqual([400, 120, 300])
      expect(cam.position.distanceTo(c)).toBeGreaterThan(0)
    })
  }

  test('宽高比正常时：越宽的画面镜头离得越近（横向不再是限制）', () => {
    const narrow = new THREE.PerspectiveCamera(30, 0.6, 5, 20000)
    const wide = new THREE.PerspectiveCamera(30, 1.8, 5, 20000)
    const c = frameCamera(narrow, box)
    frameCamera(wide, box)
    expect(wide.position.distanceTo(c)).toBeLessThan(narrow.position.distanceTo(c))
  })
})
