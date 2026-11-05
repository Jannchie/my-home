// 楼层动画（three/floorStack.ts）：楼层显示方式 → 各层目标、缓动到位、藏起来的层、整层淡入淡出换材质再换回。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { EXPLODE_GAP, FloorStack, HIDE_LIFT, fadeFloor } from '/src/three/floorStack'
import type { FloorGroup } from '/src/three/building'

const FLOORS = [{ id: 'f1', elevation: 0 }, { id: 'f2', elevation: 300 }, { id: 'f3', elevation: 600 }]
/** 推到停下（最多 10 秒） */
function settle(s: FloorStack) {
  for (let i = 0; i < 600 && s.moving; i++) s.step(1 / 60)
}

describe('楼层动画', () => {
  test('只到当前层：上面的层往上滑走、淡出，停下后藏起来', () => {
    const s = new FloorStack(new THREE.Group())
    s.targets(FLOORS, 'f1', 'all', true)
    s.targets(FLOORS, 'f2', 'upto')
    expect(s.anyHidden()).toBe(true)
    expect(s.hiding('f3')).toBe(true)
    // 隐藏动画结束前仍看得见
    s.step(1 / 60)
    expect(s.shown('f3')).toBe(true)
    expect(s.alpha('f3')).toBeLessThan(1)
    settle(s)
    expect(s.shown('f3')).toBe(false)
    expect(s.extra('f3')).toBe(HIDE_LIFT)
    expect(s.alpha('f3')).toBe(0)
    expect([s.shown('f1'), s.shown('f2'), s.extra('f2')]).toEqual([true, true, 0])
    // 停下后不再推进
    expect(s.step(1 / 60)).toBe(false)
  })

  test('分层拉开按层序拉开；snap 直接到位；单层户型不动', () => {
    const s = new FloorStack(new THREE.Group())
    s.targets(FLOORS, 'f1', 'explode', true)
    expect(FLOORS.map((f) => s.extra(f.id))).toEqual([0, EXPLODE_GAP, 2 * EXPLODE_GAP])
    s.targets([{ id: 'f1', elevation: 0 }], 'f1', 'upto', true)
    expect([s.extra('f1'), s.shown('f1'), s.anyHidden()]).toEqual([0, true, false])
    // 户型里没有了的层不再记
    expect(s.extra('f2')).toBe(0)
  })

  test('pose：楼层组和家具组按偏移摆高度、按显示切 visible', () => {
    const root = new THREE.Group()
    const s = new FloorStack(root)
    const furn = s.furnLayer('f2')
    expect(s.furnLayer('f2')).toBe(furn)
    expect(furn.parent).toBe(root)
    const fg = { floor: { id: 'f2', elevation: 300 }, group: new THREE.Group() } as unknown as FloorGroup
    s.targets([{ id: 'f1', elevation: 0 }, { id: 'f2', elevation: 300 }], 'f1', 'upto', true)
    s.setGroups([fg])
    s.pose()
    expect([fg.group.position.y, fg.group.visible, furn.position.y, furn.visible]).toEqual([300 + HIDE_LIFT, false, HIDE_LIFT, false])
    // 角色的楼层钩子：elevation + 动画偏移
    expect([s.elevOf('f2'), s.lift('f2'), s.lift('nope')]).toEqual([300, 300 + HIDE_LIFT, 0])
  })
})

describe('整层淡入淡出', () => {
  test('淡出时换成透明副本、挂深度替身、藏描边；不透明后全部换回', () => {
    const mat = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    mesh.castShadow = true
    const outline = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    outline.userData.isOutline = true
    const root = new THREE.Group().add(mesh, outline)

    fadeFloor(root, 'f1', 0.4)
    const ghost = mesh.material as THREE.Material
    expect(ghost).not.toBe(mat)
    expect([ghost.transparent, ghost.opacity, ghost.userData.floorSource]).toEqual([true, 0.4, mat])
    expect(mesh.castShadow).toBe(false)
    expect(mesh.children).toHaveLength(1)
    expect(outline.visible).toBe(false)
    // 同一层再淡一次：复用副本、不再多挂替身
    fadeFloor(root, 'f1', 0.8)
    expect(mesh.material).toBe(ghost)
    expect(ghost.opacity).toBeCloseTo(0.8)
    expect(mesh.children).toHaveLength(1)

    fadeFloor(root, 'f1', 1)
    expect(mesh.material).toBe(mat)
    expect(mesh.castShadow).toBe(true)
    expect(mesh.children).toHaveLength(0)
    expect(outline.visible).toBe(true)
    expect(root.userData.floorFaded).toBe(false)
  })

  test('syncFades：不透明度和场景都没变时不再遍历', () => {
    const s = new FloorStack(new THREE.Group())
    s.targets(FLOORS, 'f1', 'all', true)
    const layer = s.furnLayer('f1')
    let walks = 0
    layer.traverse = ((fn: (o: THREE.Object3D) => void) => {
      walks++
      fn(layer)
    }) as typeof layer.traverse
    // 第一次：记下不透明度（完全不透明、没淡过的层直接跳过遍历）
    s.syncFades()
    s.targets(FLOORS, 'f1', 'all', true)
    layer.userData.floorFaded = true
    s.bump()
    s.syncFades()
    expect(walks).toBe(1)
    s.syncFades()
    expect(walks).toBe(1)
  })
})
