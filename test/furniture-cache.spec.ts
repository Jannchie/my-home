// 家具模板缓存：同一套模板的实例共用几何、互不影响；引用计数和 LRU 淘汰时才释放几何。只做结构性断言。
import { afterEach, describe, expect, test } from 'vitest'
import * as THREE from 'three'
import type { Furniture } from '/src/model'
import { ASSETS } from '/src/three/assets'
import { clearFurnitureTemplates, furnitureModel, furnitureTemplateInfo, setFurnitureTemplateLimit } from '/src/three/house'
import { disposeUnshared } from '/src/three/toon'

const fu = (asset: string, extra: Partial<Furniture> = {}): Furniture => ({ id: 'x', asset, x: 0, y: 0, rot: 0, ...extra })
const geos = (o: THREE.Object3D) => {
  const s = new Set<THREE.BufferGeometry>()
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) s.add((c as THREE.Mesh).geometry)
  })
  return s
}
/** 记下哪些几何体被 dispose 了 */
function watchDispose(gs: Iterable<THREE.BufferGeometry>) {
  const hit = new Set<THREE.BufferGeometry>()
  for (const g of gs) g.addEventListener('dispose', () => hit.add(g))
  return hit
}
const OPENABLE = ASSETS.find((a) => a.openable)!.id

afterEach(() => {
  clearFurnitureTemplates()
  setFurnitureTemplateLimit(256)
})

describe('家具模板缓存', () => {
  test('同一键的两个实例：对象树不同，几何共用且都标了 shared；第二次命中缓存', () => {
    clearFurnitureTemplates()
    const before = furnitureTemplateInfo()
    const a = furnitureModel(fu('sofa3'))
    const b = furnitureModel(fu('sofa3'))
    const info = furnitureTemplateInfo()
    expect(info.misses - before.misses).toBe(1)
    expect(info.hits - before.hits).toBe(1)
    expect(a.children[0]).not.toBe(b.children[0])
    const ga = geos(a)
    const gb = geos(b)
    expect([...ga].every((g) => gb.has(g))).toBe(true)
    expect([...ga].every((g) => g.userData.shared)).toBe(true)
    // 配色不同就是另一套模板
    const c = furnitureModel(fu('sofa3', { color: 1 }))
    expect([...geos(c)].some((g) => !ga.has(g))).toBe(true)
  })

  test('描边外壳在实例上也不可拾取（clone 不复制 raycast）', () => {
    const a = furnitureModel(fu('sofa3'))
    a.updateMatrixWorld(true)
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 40, 300), new THREE.Vector3(0, 0, -1))
    const hits = rc.intersectObject(a, true)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => !h.object.userData.isOutline)).toBe(true)
  })

  test('柜门在实例上摆：打开一件不影响同模板的另一件', () => {
    const closed = furnitureModel(fu(OPENABLE))
    const open = furnitureModel(fu(OPENABLE, { open: true }))
    const pose = (o: THREE.Object3D) => {
      const out: string[] = []
      o.traverse((c) => {
        if (c.userData.door) out.push(c.position.toArray().map((v) => v.toFixed(2)).join(',') + c.rotation.y.toFixed(2) + c.rotation.x.toFixed(2))
      })
      return out.join(' ')
    }
    const fresh = furnitureModel(fu(OPENABLE))
    expect(pose(closed)).toBe(pose(fresh))
    expect(pose(open)).not.toBe(pose(closed))
  })

  test('实例被丢弃时不释放模板几何；模板被挤出缓存、且最后一个实例丢弃后才释放', () => {
    setFurnitureTemplateLimit(1)
    const a1 = furnitureModel(fu('sofa3'))
    const a2 = furnitureModel(fu('sofa3'))
    const hit = watchDispose(geos(a1))
    disposeUnshared(a1)
    expect(hit.size).toBe(0)
    // 换一件：sofa3 的模板被挤出，但 a2 还在用
    const b = furnitureModel(fu('bed-semi-double'))
    expect(furnitureTemplateInfo().size).toBe(1)
    expect(hit.size).toBe(0)
    disposeUnshared(a2)
    // 合并出来的几何体（模板自己的）这时才释放；toon.ts 的体素缓存几何不会被释放
    expect(hit.size).toBeGreaterThan(0)
    disposeUnshared(b)
  })

  test('上限为 0：不缓存，实例丢弃就释放', () => {
    setFurnitureTemplateLimit(0)
    const a = furnitureModel(fu('sofa3'))
    expect(furnitureTemplateInfo().size).toBe(0)
    const hit = watchDispose(geos(a))
    disposeUnshared(a)
    expect(hit.size).toBeGreaterThan(0)
  })
})
