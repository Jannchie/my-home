// 3D 沙盘里点选设备：命中网格 → 设备 id（楼梯的踏步 / 扶手 / 侧板、浴缸上的淋浴都算）、
// 和门窗 / 墙比远近（被墙挡住、窗在前面先选窗）、从上一层的楼梯洞口点楼梯、选中框尺寸、
// 和平面图共用的 selection（旋转 / 改尺寸一步撤销）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { fixtureBox, type Plan } from '/src/model'
import { buildBuilding } from '/src/three/building'
import { findFixtureModel, firstHouseHit, fixtureFrame, fixtureIdOf, furnitureLimit } from '/src/three/fixturePick'
import { openingIdOf } from '/src/three/openingPick'
import { openingInfos } from '/src/three/house'
import { floorView } from '/src/floors'
import { checkpoint, mutate, plan, rotateSelectedFixture, selection, undo } from '/src/store'
import { twoStoryPlan } from './twoStory'

const visible = (o: THREE.Object3D) => {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false
  return true
}
/** 同 Sandbox3D.opaqueHit：半透明（玻璃、让开的墙）不挡 */
const opaque = (h: THREE.Intersection) => {
  const m = (h.object as THREE.Mesh).material
  return (Array.isArray(m) ? m : [m]).some((x) => x && x.colorWrite !== false && !(x.transparent && x.opacity < 0.5))
}

function build(p: Plan) {
  const { root, floors } = buildBuilding(p, 240)
  root.updateMatrixWorld(true)
  const g = (id: string) => floors.find((f) => f.floor.id === id)!.group
  return { root, g1: g('1f'), g2: g('2f') }
}

function cast(roots: THREE.Object3D[], from: THREE.Vector3, to: THREE.Vector3, allow?: Parameters<typeof firstHouseHit>[3]) {
  const rc = new THREE.Raycaster(from, to.clone().sub(from).normalize())
  const hits = roots.flatMap((r) => rc.intersectObject(r, true)).sort((a, b) => a.distance - b.distance)
  return firstHouseHit(hits, visible, opaque, allow)
}

describe('命中网格 → 设备', () => {
  const p = twoStoryPlan()
  p.fixtures.find((f) => f.id === 'tub')!.shower = true
  const { g1, g2 } = build(p)

  test('每层设备的网格都找得回自己的设备；墙、门窗不是设备', () => {
    const ids = (g: THREE.Object3D) => {
      const seen = new Set<string>()
      g.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return
        const id = fixtureIdOf(o)
        if (id) {
          seen.add(id)
          expect(openingIdOf(o)).toBeNull()
        }
      })
      return [...seen].sort()
    }
    expect(ids(g1)).toEqual(['basin', 'k', 'stairs', 'tub', 'wc'])
    expect(ids(g2)).toEqual(['wc2f'])
    const wall = g1.children.find((c) => c.userData.part === 'wall')!
    wall.traverse((o) => expect(fixtureIdOf(o)).toBeNull())
    expect(fixtureIdOf(null)).toBeNull()
  })

  test('楼梯模型的每个部件（踏步、扶手、侧板…）都映射到楼梯', () => {
    const stairs = findFixtureModel(g1, 'stairs')!
    expect(stairs).not.toBeNull()
    let meshes = 0
    stairs.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes++
        expect(fixtureIdOf(o)).toBe('stairs')
      }
    })
    expect(meshes).toBeGreaterThan(0)
  })

  test('浴缸上的淋浴、浴帘点中也选浴缸，但选中框只找浴缸本体', () => {
    const extras: THREE.Object3D[] = []
    g1.traverse((o) => {
      if (o.userData.fixtureExtra) extras.push(o)
    })
    expect(extras.length).toBeGreaterThan(0)
    for (const e of extras) expect(fixtureIdOf(e)).toBe('tub')
    expect(findFixtureModel(g1, 'tub')!.userData.fixtureExtra).toBeUndefined()
  })
})

describe('射线：远近、遮挡', () => {
  const p = twoStoryPlan()
  const { g1, g2 } = build(p)

  test('从上面看马桶、厨房台面：选中设备', () => {
    expect(cast([g1], new THREE.Vector3(480, 200, 740), new THREE.Vector3(480, 0, 760))?.id).toBe('wc')
    const k = cast([g1], new THREE.Vector3(730, 200, 60), new THREE.Vector3(730, 0, 40))
    expect(k).toMatchObject({ kind: 'fixture', id: 'k' })
  })

  test('隔着墙看设备：被墙挡住', () => {
    // 从 LDK 里平视卫生间的马桶（中间隔着 LDK / 卫生间的隔墙 y = 500）
    expect(cast([g1], new THREE.Vector3(480, 40, 300), new THREE.Vector3(480, 40, 760))).toBeNull()
  })

  test('门窗在设备前面：先选门窗（厨房窗下就是厨房台面）', () => {
    // 从屋外斜着往下看厨房的窗（北墙 y = 0，窗中心 x = 730）：这条线穿过窗后落到台面上
    const info = openingInfos(floorView(p, '1f')).find((i) => i.o.roomId === 'kit' && i.o.kind === 'window')!
    const ym = (info.y0 + info.y1) / 2
    const win = new THREE.Vector3(730, ym, 0)
    const counter = new THREE.Vector3(730, 85, 40)
    const from = win.clone().sub(counter.clone().sub(win).multiplyScalar(10))
    // 没有窗时这条线确实打在台面上
    expect(cast([g1], from, counter, (kind) => kind !== 'opening')?.id).toBe('k')
    expect(cast([g1], from, counter)?.kind).toBe('opening')
  })

  test('家具优先：家具命中距离在设备之前（贴着设备面也算）就选家具', () => {
    expect(furnitureLimit(null)).toBe(Infinity)
    expect(furnitureLimit({ kind: 'opening', id: 'w', dist: 100 })).toBe(100)
    expect(furnitureLimit({ kind: 'fixture', id: 'k', dist: 100 })).toBeGreaterThan(100)
    expect(furnitureLimit({ kind: 'fixture', id: 'k', dist: 100 })).toBeLessThan(102)
  })

  test('不能选的设备（别的楼层的）当成墙：挡住，不返回它', () => {
    const h = cast([g1], new THREE.Vector3(480, 200, 740), new THREE.Vector3(480, 0, 760), (kind, id) => !(kind === 'fixture' && id === 'wc'))
    expect(h).toBeNull()
  })

  test('在 2F：从楼梯洞口看下去点中 1F 的楼梯；隔着楼板点不到 1F 的马桶', () => {
    // 2F 能选的：本层的设备、门窗，加上 1F 的楼梯
    const allow = (kind: string, id: string) => kind === 'opening' || id === 'wc2f' || id === 'stairs'
    // 楼梯 x 800..890、y 425..785；从 2F 上方往洞口里看
    const top = 270 + 400
    const h = cast([g2, g1], new THREE.Vector3(845, top, 620), new THREE.Vector3(845, 150, 600), allow)
    expect(h).toMatchObject({ kind: 'fixture', id: 'stairs' })
    // 1F 马桶正上方是 2F 卫生间的楼板（2F 马桶在 x = 445，旁边点地板）
    expect(cast([g2, g1], new THREE.Vector3(500, top, 700), new THREE.Vector3(500, 0, 760), allow)).toBeNull()
  })
})

describe('选中框', () => {
  const p = twoStoryPlan()
  const { g1, g2 } = build(p)

  test('马桶：占地宽 × 深（含描边误差），落在地上，朝向同模型', () => {
    const f = p.fixtures.find((x) => x.id === 'wc')!
    const obj = findFixtureModel(g1, 'wc')!
    const b = fixtureFrame(obj)!
    expect(b.w).toBeGreaterThan(30)
    expect(b.w).toBeLessThan(55)
    expect(b.d).toBeGreaterThan(50)
    expect(b.d).toBeLessThan(85)
    expect(b.h).toBeGreaterThan(30)
    expect(b.h).toBeLessThan(120)
    expect(b.yaw).toBeCloseTo((-f.rot * Math.PI) / 180)
    expect(b.c.x).toBeCloseTo(f.x, -1)
    expect(b.c.z).toBeCloseTo(f.y, -1)
  })

  test('楼梯：整段梯段（占地 90 × 360，高到上一层）', () => {
    const f = p.fixtures.find((x) => x.id === 'stairs')!
    const b = fixtureFrame(findFixtureModel(g1, 'stairs')!)!
    const box = fixtureBox(f)
    expect(b.w).toBeGreaterThan(80)
    expect(b.w).toBeLessThan(110)
    expect(b.d).toBeGreaterThan(330)
    expect(b.d).toBeLessThan(380)
    // 层间高 270：梯段顶到上层楼面，扶手再高一点
    expect(b.h).toBeGreaterThan(250)
    expect(b.h).toBeLessThan(400)
    expect(b.c.x).toBeGreaterThan(box.x0)
    expect(b.c.x).toBeLessThan(box.x1)
    expect(b.c.z).toBeGreaterThan(box.y0)
    expect(b.c.z).toBeLessThan(box.y1)
  })

  test('楼层抬升：2F 的马桶框在 2F 的高度', () => {
    const b = fixtureFrame(findFixtureModel(g2, 'wc2f')!)!
    expect(b.c.y).toBeGreaterThan(270)
    expect(b.c.y).toBeLessThan(270 + 120)
  })

  test('转 90° 的厨房：框的宽是台面长、yaw 跟着转', () => {
    const q = twoStoryPlan()
    const k = q.fixtures.find((x) => x.id === 'k')!
    k.rot = 90
    const { g1: h1 } = build(q)
    const b = fixtureFrame(findFixtureModel(h1, 'k')!)!
    expect(b.w).toBeGreaterThan(240)
    expect(b.w).toBeLessThan(275)
    expect(b.yaw).toBeCloseTo(-Math.PI / 2)
  })
})

describe('选中：和平面图共用 selection', () => {
  test('3D 里选中设备 → 逆时针转、改尺寸各一步撤销；撤销后还是选中它；设备没了就取消选中', () => {
    plan.value = twoStoryPlan()
    selection.value = { type: 'fixture', id: 'stairs' }
    rotateSelectedFixture(-90)
    expect(plan.value.fixtures.find((f) => f.id === 'stairs')!.rot).toBe(270)
    rotateSelectedFixture(90)
    rotateSelectedFixture(90)
    expect(plan.value.fixtures.find((f) => f.id === 'stairs')!.rot).toBe(90)
    mutate((p) => {
      p.fixtures.find((f) => f.id === 'stairs')!.w = 100
    })
    undo()
    expect(plan.value.fixtures.find((f) => f.id === 'stairs')!.w).toBe(90)
    undo()
    undo()
    expect(plan.value.fixtures.find((f) => f.id === 'stairs')!.rot).toBe(270)
    undo()
    expect(plan.value.fixtures.find((f) => f.id === 'stairs')!.rot).toBe(0)
    expect(selection.value).toEqual({ type: 'fixture', id: 'stairs' })

    checkpoint()
    plan.value.fixtures.push({ id: 'new', kind: 'toilet', x: 100, y: 100, w: 40, rot: 0 })
    selection.value = { type: 'fixture', id: 'new' }
    undo()
    expect(selection.value).toBeNull()
  })
})
