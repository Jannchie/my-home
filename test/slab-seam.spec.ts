// 楼层之间的接缝：楼梯间里一楼的墙一直砌到二楼地面，楼板洞口的侧面是收口色（不是层与层之间露出的截面色）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { buildBuilding } from '/src/three/building'
import { generatePlan } from '/src/generate-region'
import { stairHoles } from '/src/stairs'
import { floorAbove, planFloors } from '/src/floors'
import { edgesOf, projectToSegment } from '/src/model'
import { floorView } from '/src/floors'
import { wallSegments } from '/src/walls'
import { JP_OPTS } from './helpers'

describe('楼层之间的接缝', () => {
  // 三个地区合起来至少检查到几条贴墙的洞口边（有的户型楼梯在敞开的走廊中间，洞口边都没有墙）
  let nearAll = 0
  for (const region of ['jp', 'cn', 'west'] as const)
    test(`${region} 户建：贴着楼梯洞口的一楼墙砌到二楼地面，洞口侧面用收口色`, () => {
      const plan = generatePlan({ ...JP_OPTS, seed: 1, region, dwelling: 'house' }).plan
      const [f1] = planFloors(plan)
      const f2 = floorAbove(plan, f1.id)!
      const holes = stairHoles(plan, f2.id).map((h) => h.poly)
      expect(holes.length).toBeGreaterThan(0)
      const { floors } = buildBuilding(plan, 240)
      const g1 = floors.find((f) => f.floor.id === f1.id)!.group
      const g2 = floors.find((f) => f.floor.id === f2.id)!.group
      // 一楼：洞口的每条边上如果有墙，那里要有一段墙顶接到二楼地面（墙按材质批量合并成网格，按包围盒找覆盖这一点的）
      const view = floorView(plan, f1.id)
      const walls: { box: THREE.Box3; top: number }[] = []
      g1.traverse((o) => {
        const w = o.userData.wall as { y0: number; h: number } | undefined
        if (w) walls.push({ box: new THREE.Box3().setFromObject(o), top: w.y0 + w.h })
      })
      let near = 0
      for (const h of holes)
        for (const e of edgesOf(h)) {
          const m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
          if (!wallSegments(view.rooms).some((sg) => sg.kind !== 'open' && projectToSegment(m, sg.a, sg.b).d < 1)) continue
          near++
          const hit = walls.some((w) => w.top >= f2.elevation - f1.elevation - 0.5 && w.box.min.x - 1 <= m.x && m.x <= w.box.max.x + 1 && w.box.min.z - 1 <= m.y && m.y <= w.box.max.z + 1)
          expect(hit, `${region} 洞口边 (${m.x}, ${m.y}) 上的墙没有接到二楼地面`).toBe(true)
        }
      nearAll += near
      // 二楼的结构楼板：洞口那几面侧面在第 3 个材质组（收口色），外侧仍是截面色
      let lined = 0
      g2.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || !Array.isArray(m.material) || m.material.length !== 3) return
        for (const gr of m.geometry.groups) if (gr.materialIndex === 2) lined += gr.count
        expect(m.geometry.groups.some((gr) => gr.materialIndex === 1 && gr.count > 0)).toBe(true)
        // 洞口侧面朝洞里（站在楼梯间里看得见；朝里的话是背面，被剔掉，看穿过去成一道黑缝）
        const pos = m.geometry.attributes.position
        const v = [0, 1, 2].map(() => new THREE.Vector3())
        for (const gr of m.geometry.groups) {
          if (gr.materialIndex !== 2) continue
          for (let i = gr.start; i < gr.start + gr.count; i += 3) {
            v.forEach((p, k) => p.fromBufferAttribute(pos, i + k))
            const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]))
            const c = { x: (v[0].x + v[1].x + v[2].x) / 3, y: (v[0].z + v[1].z + v[2].z) / 3 }
            const h = holes.find((q) => edgesOf(q).some((e) => projectToSegment(c, e.a, e.b).d < 2))
            if (!h) continue // 挑空的洞口
            const hc = h.reduce((s, p) => ({ x: s.x + p.x / h.length, y: s.y + p.y / h.length }), { x: 0, y: 0 })
            expect(n.x * (hc.x - c.x) + n.z * (hc.y - c.y), `${region} 洞口侧面 (${c.x.toFixed(0)}, ${c.y.toFixed(0)}) 朝着楼板里面`).toBeGreaterThan(0)
          }
        }
      })
      expect(lined).toBeGreaterThan(0)
    })
  test('至少检查到贴墙的洞口边', () => expect(nearAll).toBeGreaterThan(0))
})
