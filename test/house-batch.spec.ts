// 房体合批：门窗、边饰、墙体按材质 / 高度合并后，让开 / 压低 / 设计图依赖的标记仍然完整。只做结构性断言。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { genJp } from './helpers'
import { applyCutaway, buildHouse, stepCutaway } from '/src/three/house'

const plan = genJp(3)
// 每个室内房间都贴上带竖条腰壁、踢脚线、顶角线的墙纸，覆盖所有边饰
for (const r of plan.rooms) r.wallpaper = { color: '#f4efe6', trim: { base: { h: 8, color: '#ffffff' }, wainscot: { h: 90, color: '#c9b79c', kind: 'batten' }, crown: { h: 6, color: '#ffffff' } } }
const H = 240
const root = buildHouse(plan, H)
const partOf = (k: string) => root.children.find((c) => c.userData.part === k)!
const meshesIn = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = []
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh && !c.userData.isOutline) out.push(c as THREE.Mesh)
  })
  return out
}

describe('房体合批', () => {
  test('设计图依赖的 part 标记都在', () => {
    for (const k of ['floor', 'wall', 'opening', 'trim', 'curtain']) expect(partOf(k), k).toBeTruthy()
  })

  test('门窗：每个洞口一个组（带 info 和 fade），组内每种不透明材质只剩一个网格', () => {
    const ops = partOf('opening')
    expect(ops.children.length).toBeGreaterThan(0)
    for (const g of ops.children) {
      expect(g.userData.info).toBeTruthy()
      expect(g.userData.fade).toBeTruthy()
      // 折叠门的两扇、谷仓门的门板、落地窗的推拉 / 平开扇各自开合，各自合并：按会动的那一扇分开数
      const leafOf = (m: THREE.Object3D) => {
        for (let o: THREE.Object3D | null = m; o && o !== g; o = o.parent) if (o.userData.foldLeaf !== undefined || o.userData.barnPanel || o.userData.winMove) return o.id
        return 0
      }
      const mats = meshesIn(g)
        .filter((m) => !(m.material as THREE.Material).transparent)
        .map((m) => `${leafOf(m)}|${(m.material as THREE.Material).uuid}`)
      expect(new Set(mats).size).toBe(mats.length)
    }
  })

  test('边饰：按墙段 + 类型分组，标记在组上，组内每种材质只剩一个网格', () => {
    const trims = partOf('trim')
    expect(trims.children.length).toBeGreaterThan(0)
    let battens = 0
    for (const g of trims.children) {
      expect(g.userData.wall, '组上有 wall').toBeTruthy()
      expect(g.userData.fade, '组上有 fade').toBeTruthy()
      const ms = meshesIn(g)
      for (const m of ms) expect(Object.keys(m.userData).length, '饰条本身不带业务标记').toBe(0)
      const mats = ms.map((m) => (m.material as THREE.Material).uuid)
      expect(new Set(mats).size).toBe(mats.length)
      if (g.userData.wall.h === 87) battens++
    }
    expect(battens).toBeGreaterThan(0)
  })

  test('墙体：让开的墙块都带 wall / fade；外墙同朝向同高度的只有一个', () => {
    const walls = partOf('wall')
    const seen = new Set<string>()
    for (const m of walls.children) {
      if (!m.userData.fade) continue
      expect(m.userData.wall).toBeTruthy()
      const f = m.userData.fade
      if (!f.outer) continue
      const k = `${f.nx.toFixed(3)},${f.ny.toFixed(3)}|${m.userData.wall.y0}|${m.userData.wall.h}`
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
    }
  })

  test('全部压低成矮墙：墙体和边饰（含竖条）的顶都不高于剖切高度', () => {
    const cut = 60
    applyCutaway(root, { x: 0, y: 0 }, null, null, true)
    stepCutaway(root, 10, { style: 'cut', opacity: 0, cut }, true)
    root.updateMatrixWorld(true)
    const bad: string[] = []
    for (const k of ['wall', 'trim']) {
      partOf(k).traverse((o) => {
        if (!o.userData.fade || !o.visible) return
        const box = new THREE.Box3().setFromObject(o)
        if (box.max.y > cut + 0.5) bad.push(`${k} 顶 ${box.max.y.toFixed(1)}`)
      })
    }
    expect(bad).toEqual([])
    // 恢复：墙回到满高
    applyCutaway(root, { x: 0, y: 0 }, null, null, false)
    stepCutaway(root, 10, { style: 'cut', opacity: 0, cut }, true)
    root.updateMatrixWorld(true)
    const top = new THREE.Box3().setFromObject(partOf('wall')).max.y
    expect(top).toBeGreaterThan(H - 1)
  })
})
