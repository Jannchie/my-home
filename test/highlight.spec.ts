// 高亮叠加层（three/highlight.ts）：不碰目标自己的材质；目标被别的系统换了材质、被移出场景、挪动了，叠加层都跟得上。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { Highlight } from '/src/three/highlight'

function wall() {
  const scene = new THREE.Scene()
  const g = new THREE.Group()
  // 外墙一类的多材质网格
  const mats = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]
  const m = new THREE.Mesh(new THREE.BoxGeometry(100, 240, 18), mats)
  g.add(m)
  scene.add(g)
  scene.updateMatrixWorld(true)
  return { scene, g, m, mats }
}

describe('高亮叠加层', () => {
  test('高亮、取消都不改目标网格的材质', () => {
    const { m, mats } = wall()
    const hl = new Highlight()
    hl.set([m])
    expect(m.material).toBe(mats)
    expect(hl.root.children).toHaveLength(1)
    hl.clear()
    expect(m.material).toBe(mats)
    expect(hl.root.children).toHaveLength(0)
  })

  test('高亮期间别的系统换了材质（如楼层淡出拿一份新数组还原）：取消后也不会留下提亮的材质', () => {
    const { m, mats } = wall()
    const hl = new Highlight()
    hl.set([m])
    // 另一个系统把「当时的材质」记成原件，再换回一份新数组：以前提亮材质会被当成原件存住
    const snapshot = m.material as THREE.Material[]
    m.material = snapshot.map((x) => x)
    hl.clear()
    for (const x of m.material as THREE.Material[]) expect(mats).toContain(x)
  })

  test('目标被移出场景（房子重搭）：叠加层隐藏；目标挪动：叠加层跟着走', () => {
    const { scene, g, m } = wall()
    const hl = new Highlight()
    hl.set([m])
    const ov = hl.root.children[0] as THREE.Mesh
    expect(ov.visible).toBe(true)
    expect(ov.geometry).toBe(m.geometry)
    g.position.set(50, 0, 30)
    scene.updateMatrixWorld(true)
    expect(hl.sync()).toBe(true)
    expect(ov.matrixWorld.equals(m.matrixWorld)).toBe(true)
    expect(hl.sync()).toBe(false)
    scene.remove(g)
    expect(hl.sync()).toBe(true)
    expect(ov.visible).toBe(false)
  })

  test('目标淡到快透明（墙体让开）或被藏起来时，叠加层不显示', () => {
    const { m, mats } = wall()
    const hl = new Highlight()
    hl.set([m])
    const ov = hl.root.children[0]
    mats.forEach((x) => ((x.transparent = true), (x.opacity = 0.1)))
    hl.sync()
    expect(ov.visible).toBe(false)
    mats.forEach((x) => ((x.transparent = false), (x.opacity = 1)))
    m.visible = false
    hl.sync()
    expect(ov.visible).toBe(false)
    m.visible = true
    hl.sync()
    expect(ov.visible).toBe(true)
  })

  test('描边外壳不加叠加层；叠加网格不参与拾取、不投影', () => {
    const { m } = wall()
    const hull = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial())
    hull.userData.isOutline = true
    m.add(hull)
    const hl = new Highlight()
    hl.set([m])
    expect(hl.root.children).toHaveLength(1)
    const ov = hl.root.children[0] as THREE.Mesh
    expect(ov.castShadow).toBe(false)
    const hits: THREE.Intersection[] = []
    ov.raycast(new THREE.Raycaster(new THREE.Vector3(0, 0, 500), new THREE.Vector3(0, 0, -1)), hits)
    expect(hits).toHaveLength(0)
  })
})
