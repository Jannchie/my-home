// 门、抽屉各自的开合（three/openers.ts、doorMotion.ts）：每个部件单独开关、调开合程度、带动画；
// 房门的 3D 门扇和漫游挡人的门板线段是同一份几何；关着的门走不过去，开着的走得过去。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { rectPoints, type Opening, type Plan } from '/src/model'
import { buildHouse, furnitureModel, openingInfos, poseOpening } from '/src/three/house'
import { defaultDoorOpen, doorSegments } from '/src/doorMotion'
import { Openers, doorKey, furnKey } from '/src/three/openers'
import { doorParts } from '/src/three/kit'
import { Walker } from '/src/three/walk'

/** 洋室（400 × 300）和东边的洋室之间一扇门（隔墙 x = 400，门中心 (400, 150)） */
function testPlan(door: Partial<Opening> = {}): Plan {
  return {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: 't',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'a', name: '洋室', kind: 'western', points: rectPoints(0, 0, 400, 300) },
      { id: 'b', name: '洋室', kind: 'western', points: rectPoints(400, 0, 700, 300) },
    ],
    openings: [{ id: 'd1', kind: 'door', roomId: 'a', edge: 1, offset: 150, width: 90, hinge: 'start', swing: 'in', ...door }],
    fixtures: [],
    furniture: [],
  }
}

const KINDS: Partial<Opening>[] = [{ kind: 'door' }, { kind: 'sliding' }, { kind: 'sliding', doorStyle: 'barn' }, { kind: 'folding' }]

/** 门洞口的组（带 doorPart 标记的） */
const doorObjs = (root: THREE.Object3D) => {
  const out: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.userData.doorPart) out.push(o)
  })
  return out
}

/** 从房间 a 里沿 y 朝东（+x）走 secs 秒，返回走到的 x */
function walkEast(plan: Plan, open: number, y = 150, secs = 4) {
  const info = openingInfos(plan)[0]
  const w = new Walker(plan, new THREE.PerspectiveCamera(), { lift: () => 0, onFloor: () => {}, blockers: () => doorSegments(info, open) })
  w.pos = { x: 320, y }
  w.yaw = -Math.PI / 2
  w.hold('w', true)
  for (let i = 0; i < secs * 60; i++) w.update(1 / 60)
  return w.pos.x
}

describe('房门的开合', () => {
  test('3D 门扇和门板线段对得上（关上、半开、开到底）', () => {
    for (const k of KINDS) {
      const plan = testPlan(k)
      const info = openingInfos(plan)[0]
      const root = buildHouse(plan, 240)
      const objs = doorObjs(root)
      expect(objs.length, JSON.stringify(k)).toBeGreaterThan(0)
      for (const v of [0, 0.5, 1]) {
        // 推拉门的两扇都摆到 v
        for (const o of objs) poseOpening(o, v)
        root.updateMatrixWorld(true)
        const box = new THREE.Box3()
        for (const o of objs) box.union(new THREE.Box3().setFromObject(o))
        box.expandByScalar(4)
        for (const [a, b] of doorSegments(info, v, v))
          for (const p of [a, b]) expect(box.containsPoint(new THREE.Vector3(p.x, 100, p.y)), `${JSON.stringify(k)} 开 ${v}：(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).toBe(true)
      }
    }
  })

  test('没动过的门开着，人走得过去', () => {
    for (const k of KINDS) {
      const o = { ...testPlan(k).openings[0] } as Opening
      expect(defaultDoorOpen(o), k.kind).toBeGreaterThan(0.5)
    }
  })

  test('关上的门走不过去，开到底的门走得过去', () => {
    for (const k of KINDS) {
      const plan = testPlan(k)
      // 推拉门、谷仓门推开后空出来的是起点一侧那一半：朝那一半走
      const y = k.kind === 'sliding' ? 150 - 90 / 4 : 150
      expect(walkEast(plan, 0, y), `${JSON.stringify(k)} 关着`).toBeLessThan(400)
      expect(walkEast(plan, 1, y), `${JSON.stringify(k)} 开着`).toBeGreaterThan(430)
    }
  })

  test('开合有动画：设定后一帧帧过去，最后停在目标上；toggle 开着的关上', () => {
    const root = buildHouse(testPlan(), 240)
    const op = new Openers()
    op.bindHouse(root)
    const key = doorKey('d1')
    expect(op.value(key)).toBeCloseTo(defaultDoorOpen({ kind: 'door' }), 5)
    op.toggle(key)
    expect(op.target(key)).toBe(0)
    expect(op.step(1 / 60)).toBe(true)
    const mid = op.value(key)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(defaultDoorOpen({ kind: 'door' }))
    for (let i = 0; i < 120 && op.step(1 / 60); i++);
    expect(op.value(key)).toBe(0)
    // 门板线段跟着现在的开合走：关上时沿着墙
    const segs = op.segments('')
    expect(segs.length).toBe(1)
    expect(Math.abs(segs[0][0].x - segs[0][1].x)).toBeLessThan(1)
    op.toggle(key)
    for (let i = 0; i < 120 && op.step(1 / 60); i++);
    expect(op.value(key)).toBe(1)
    // 重建房子后照样摆回去
    const again = buildHouse(testPlan(), 240)
    op.bindHouse(again)
    expect(op.value(key)).toBe(1)
  })

  test('推拉门两扇各自推拉：拾取认得出是哪一扇，后轨那扇推开后终点一侧走得过去', () => {
    const plan = testPlan({ kind: 'sliding' })
    const root = buildHouse(plan, 240)
    const op = new Openers()
    op.bindHouse(root)
    const front = doorKey('d1')
    const back = doorKey('d1', 1)
    expect(op.value(front)).toBe(1)
    expect(op.value(back)).toBe(0)
    const panels = doorObjs(root)
    expect(panels.map((o) => op.keyOf(o.children[0] ?? o)).sort()).toEqual([front, back].sort())
    const backPanel = panels.find((o) => op.keyOf(o) === back)!
    const x0 = backPanel.position.clone()
    // 前轨那扇关上、后轨那扇推开：只有后轨那扇动
    op.set(front, 0, false)
    op.set(back, 1, false)
    expect(backPanel.position.distanceTo(x0)).toBeGreaterThan(40)
    const walk = (y: number) => {
      const w = new Walker(plan, new THREE.PerspectiveCamera(), { lift: () => 0, onFloor: () => {}, blockers: () => op.segments('') })
      w.pos = { x: 320, y }
      w.yaw = -Math.PI / 2
      w.hold('w', true)
      for (let i = 0; i < 240; i++) w.update(1 / 60)
      return w.pos.x
    }
    expect(walk(150 + 90 / 4)).toBeGreaterThan(430)
    expect(walk(150 - 90 / 4)).toBeLessThan(400)
  })
})

describe('家具的柜门、抽屉', () => {
  test('每个抽屉单独开、开到一半，拾取认得出是哪一个', () => {
    const f = { id: 'n1', asset: 'nightstand', x: 0, y: 0, rot: 0 }
    const g = furnitureModel(f)
    const parts = doorParts(g)
    expect(parts.length).toBeGreaterThan(1)
    const calls: [number, number][] = []
    const op = new Openers((_, part, v) => calls.push([part, v]))
    op.bindFurniture('n1', g, false)
    const z0 = parts.map((p) => p.position.z)
    op.set(furnKey('n1', 1), 0.5, false)
    expect(parts[0].position.z).toBe(z0[0])
    expect(parts[1].position.z).toBeGreaterThan(z0[1])
    const half = parts[1].position.z - z0[1]
    op.set(furnKey('n1', 1), 1, false)
    expect(parts[1].position.z - z0[1]).toBeCloseTo(half * 2, 5)
    expect(calls.at(-1)).toEqual([1, 1])
    let mesh: THREE.Object3D | null = null
    parts[1].traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o
    })
    expect(op.keyOf(mesh)).toBe(furnKey('n1', 1))
    // 整体开关变了：动过的作废，跟着整体走
    op.unbindFurniture('n1')
    op.bindFurniture('n1', g, false)
    expect(op.target(furnKey('n1', 1))).toBe(0)
  })
})

describe('通往阳台的落地窗', () => {
  /** 洋室（400 × 300）东边是阳台，隔墙上一扇 160 宽的落地窗（不填窗台 = 落地） */
  const balconyPlan = (style?: Opening['windowStyle']): Plan => ({
    ...testPlan(),
    rooms: [
      { id: 'a', name: '洋室', kind: 'western', points: rectPoints(0, 0, 400, 300) },
      { id: 'b', name: '阳台', kind: 'balcony', points: rectPoints(400, 0, 560, 300) },
    ],
    openings: [{ id: 'w1', kind: 'window', roomId: 'a', edge: 1, offset: 150, width: 160, hinge: 'start', swing: 'in', ...(style ? { windowStyle: style } : {}) }],
  })
  const STYLES: (Opening['windowStyle'] | undefined)[] = [undefined, 'sliding', 'casement', 'casement2', 'combo']

  test('推拉、平开的落地窗能开合：3D 的扇和挡路线段对得上', () => {
    for (const style of STYLES) {
      const plan = balconyPlan(style)
      const info = openingInfos(plan)[0]
      expect(info.sash, String(style)).toBe(true)
      const root = buildHouse(plan, 240)
      const objs = doorObjs(root)
      expect(objs.length, String(style)).toBe(1)
      const op = new Openers()
      op.bindHouse(root)
      expect(op.has(doorKey('w1')), String(style)).toBe(true)
      for (const v of [0, 0.5, 1]) {
        for (const leaf of [0, 1]) poseOpening(objs[0], v, leaf)
        root.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(objs[0]).expandByScalar(4)
        for (const [a, b] of doorSegments(info, v, v))
          for (const p of [a, b]) expect(box.containsPoint(new THREE.Vector3(p.x, 100, p.y)), `${style} 开 ${v}：(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).toBe(true)
      }
    }
  })

  test('关着走不到阳台上，开着走得过去；固定窗开不了、一直挡着', () => {
    for (const style of STYLES) {
      const plan = balconyPlan(style)
      // 组合窗中间是固定玻璃：从侧扇那边走
      expect(walkEast(plan, 0, 94), `${style} 关着`).toBeLessThan(400)
      expect(walkEast(plan, 1, 94), `${style} 开着`).toBeGreaterThan(430)
    }
    // 推拉落地窗两扇各自开合：后轨那扇单独一个 key，只高亮它自己
    const op2 = new Openers()
    op2.bindHouse(buildHouse(balconyPlan('sliding'), 240))
    expect(op2.has(doorKey('w1', 1))).toBe(true)
    expect(op2.objects(doorKey('w1', 1)).length).toBe(1)
    expect(op2.value(doorKey('w1', 1))).toBe(0)
    const fixed = balconyPlan('fixed')
    const op = new Openers()
    op.bindHouse(buildHouse(fixed, 240))
    expect(op.has(doorKey('w1'))).toBe(false)
    expect(op.segments('').length).toBe(1)
    expect(walkEast(fixed, 1, 94)).toBeLessThan(400)
  })
})
