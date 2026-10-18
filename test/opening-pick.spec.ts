// 3D 沙盘里点选门窗：命中网格 → 洞口 id、射线被墙挡住、选中框尺寸、卡片里的宽度 / 位置微调、
// 和平面图共用的 selection（撤销一步一改、洞口没了 / 换楼层时取消）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { rectPoints, type Opening, type Plan } from '/src/model'
import { buildHouse, openingInfos } from '/src/three/house'
import { firstOpeningHit, openingFrame, openingIdOf } from '/src/three/openingPick'
import { OPENING_MIN_W, clampOffset, nudgedOpening, openingEdgeLength } from '/src/openingEdit'
import { checkpoint, mutate, plan, selection, undo } from '/src/store'

/** 一间洋室：东墙（边 1，外墙）一扇窗，北墙（边 0）一扇门 */
function testPlan(win: Partial<Opening> = {}): Plan {
  return {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: 't',
    wall: 10,
    wallOuter: 18,
    rooms: [{ id: 'a', name: '洋室', kind: 'western', points: rectPoints(0, 0, 400, 300) }],
    openings: [
      { id: 'w1', kind: 'window', roomId: 'a', edge: 1, offset: 150, width: 160, hinge: 'start', swing: 'in', ...win },
      { id: 'd1', kind: 'door', roomId: 'a', edge: 0, offset: 100, width: 80, hinge: 'start', swing: 'in' },
    ],
    fixtures: [],
    furniture: [],
  }
}

const visible = (o: THREE.Object3D) => {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false
  return true
}
/** 同 Sandbox3D.opaqueHit：半透明（玻璃、让开的墙）不挡 */
const opaque = (h: THREE.Intersection) => {
  const m = (h.object as THREE.Mesh).material
  return (Array.isArray(m) ? m : [m]).some((x) => x && x.colorWrite !== false && !(x.transparent && x.opacity < 0.5))
}

function castAt(root: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const rc = new THREE.Raycaster(from, to.clone().sub(from).normalize())
  return firstOpeningHit(rc.intersectObject(root, true), visible, opaque)
}

describe('命中网格 → 洞口', () => {
  const p = testPlan({ windowStyle: 'casement', grid: 'colonial' })
  const root = buildHouse(p, 240)
  root.updateMatrixWorld(true)

  test('窗框、玻璃、门扇里的每个网格都能找回自己的洞口；墙不是门窗', () => {
    const seen = new Set<string>()
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      const id = openingIdOf(o)
      if (id) seen.add(id)
    })
    expect([...seen].sort()).toEqual(['d1', 'w1'])
    const wall = root.children.find((c) => c.userData.part === 'wall')!
    let wallMesh: THREE.Object3D | null = null
    wall.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !wallMesh) wallMesh = o
    })
    expect(wallMesh).not.toBeNull()
    expect(openingIdOf(wallMesh)).toBeNull()
    expect(openingIdOf(null)).toBeNull()
  })

  test('射线：从外面、从屋里点窗都选中它；点在窗旁的墙上被挡住', () => {
    const info = openingInfos(p).find((i) => i.o.id === 'w1')!
    const ym = (info.y0 + info.y1) / 2
    // 外面往西看窗中心
    expect(castAt(root, new THREE.Vector3(1000, ym, 150), new THREE.Vector3(400, ym, 150))?.id).toBe('w1')
    // 屋里往东看
    expect(castAt(root, new THREE.Vector3(200, ym, 150), new THREE.Vector3(400, ym, 150))?.id).toBe('w1')
    // 窗洞以外的墙（z = 30，窗在 70..230）
    expect(castAt(root, new THREE.Vector3(1000, ym, 30), new THREE.Vector3(400, ym, 30))).toBeNull()
    // 命中距离：墙外皮附近（平开窗的窗扇往外推开一些）
    const d = castAt(root, new THREE.Vector3(1000, ym, 150), new THREE.Vector3(400, ym, 150))!.dist
    expect(d).toBeGreaterThan(450)
    expect(d).toBeLessThan(600 + info.wall)
  })

  test('门扇也能点中（开到一半伸进房间）', () => {
    // 门在北墙 x = 60..140，铰链在起点、往屋里开：从屋子上方斜着往门洞看
    const hit = castAt(root, new THREE.Vector3(80, 120, 200), new THREE.Vector3(80, 100, 0))
    expect(hit?.id).toBe('d1')
  })

  test('藏起来的窗（跟着墙让开）点不中，射线穿到后面', () => {
    const win = root.children.find((c) => c.userData.part === 'opening')!.children.find((c) => openingIdOf(c) === 'w1')!
    win.visible = false
    const info = openingInfos(p).find((i) => i.o.id === 'w1')!
    const ym = (info.y0 + info.y1) / 2
    // 窗没了：从外面看过去先碰到对面（西）墙
    expect(castAt(root, new THREE.Vector3(1000, ym, 150), new THREE.Vector3(400, ym, 150))).toBeNull()
    win.visible = true
  })
})

describe('选中框', () => {
  test('洞口宽 × 洞口高 × 墙厚（外扩一点），朝向同门窗模型', () => {
    const p = testPlan()
    const info = openingInfos(p).find((i) => i.o.id === 'w1')!
    const f = openingFrame(info, 240)
    expect(f.w).toBe(160)
    expect(f.h).toBeCloseTo(info.y1 - info.y0)
    expect(f.d).toBeGreaterThan(info.wall)
    expect(f.d).toBeLessThan(info.wall + 10)
    expect(f.x).toBeCloseTo(400)
    expect(f.z).toBeCloseTo(150)
    expect(f.y).toBeCloseTo((info.y0 + info.y1) / 2)
    // 东墙沿 +y（平面）走：模型 rotation.y = atan2(-dir.y, dir.x)
    expect(f.yaw).toBeCloseTo(Math.atan2(-info.dir.y, info.dir.x))
    const door = openingFrame(openingInfos(p).find((i) => i.o.id === 'd1')!, 240)
    expect(door.w).toBe(80)
    expect(door.y - door.h / 2).toBeCloseTo(0)
  })

  test('窗顶碰到天花（墙压低）时截到层高', () => {
    const info = openingInfos(testPlan()).find((i) => i.o.id === 'w1')!
    const low = openingFrame(info, info.y0 + 40)
    expect(low.h).toBeCloseTo(40)
    expect(low.y).toBeCloseTo(info.y0 + 20)
    // 整个窗都在墙顶以上：退化成很薄的框，不出负数
    expect(openingFrame(info, info.y0 - 10).h).toBeGreaterThan(0)
  })
})

describe('宽度 / 位置微调', () => {
  const p = testPlan()
  const w = p.openings[0]
  test('墙边长、位置夹在墙内', () => {
    expect(openingEdgeLength(p, w)).toBe(300)
    expect(openingEdgeLength(p, { roomId: 'x', edge: 0 })).toBeNull()
    expect(clampOffset(10, 160, 300)).toBe(80)
    expect(clampOffset(500, 160, 300)).toBe(220)
    expect(clampOffset(100, 400, 300)).toBe(150)
  })
  test('加宽 / 变窄 / 挪动，顶到头返回 null（不记撤销）', () => {
    expect(nudgedOpening(p, w, 10, 0)).toEqual({ width: 170, offset: 150 })
    expect(nudgedOpening(p, w, 0, -10)).toEqual({ width: 160, offset: 140 })
    // 挪到头
    expect(nudgedOpening(p, { ...w, offset: 80 }, 0, -10)).toBeNull()
    expect(nudgedOpening(p, { ...w, offset: 220 }, 0, 10)).toBeNull()
    // 宽到墙边那么长，再加宽不变；位置跟着夹回中间
    expect(nudgedOpening(p, { ...w, width: 300, offset: 150 }, 10, 0)).toBeNull()
    expect(nudgedOpening(p, { ...w, width: 290, offset: 150 }, 10, 0)).toEqual({ width: 300, offset: 150 })
    // 最窄 30
    expect(nudgedOpening(p, { ...w, width: OPENING_MIN_W }, -10, 0)).toBeNull()
    // 靠墙端的窗加宽：位置往里让，洞口不出墙
    expect(nudgedOpening(p, { ...w, offset: 80 }, 20, 0)).toEqual({ width: 180, offset: 90 })
  })
})

describe('选中：和平面图共用 selection', () => {
  test('3D 里选中门窗 → 改款式一步撤销，撤销后还是选中它；撤销到没有这个洞口就取消选中', () => {
    plan.value = testPlan()
    selection.value = { type: 'opening', id: 'w1' }
    mutate((p) => {
      p.openings[0].windowStyle = 'awning'
    })
    mutate((p) => {
      p.openings[0].width = 170
    })
    expect(plan.value.openings[0].width).toBe(170)
    undo()
    expect(plan.value.openings[0].width).toBe(160)
    expect(plan.value.openings[0].windowStyle).toBe('awning')
    expect(selection.value).toEqual({ type: 'opening', id: 'w1' })
    undo()
    expect(plan.value.openings[0].windowStyle).toBeUndefined()
    expect(selection.value).toEqual({ type: 'opening', id: 'w1' })

    // 加一扇新窗并选中，撤销后选中跟着取消
    checkpoint()
    plan.value.openings.push({ id: 'w2', kind: 'window', roomId: 'a', edge: 2, offset: 200, width: 120, hinge: 'start', swing: 'in' })
    selection.value = { type: 'opening', id: 'w2' }
    undo()
    expect(selection.value).toBeNull()
  })
})
