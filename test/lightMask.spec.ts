// 室内灯遮罩的房间编号图（three/lightMask.ts）：房间内、墙体、户外、敞开边相连、楼梯洞口 / 挑空上下放行
import { describe, expect, test } from 'vitest'
import { rectPoints, type Plan, type Room } from '/src/model'
import { LM_OUTDOOR, LM_PUSH, LM_WALL, buildLightMask, lightMaskKey, maskAt, maskPass } from '/src/three/lightMask'
import { twoStoryPlan } from './twoStory'

const room = (id: string, kind: Room['kind'], x0: number, y0: number, x1: number, y1: number, extra: Partial<Room> = {}): Room => ({ id, name: id, kind, points: rectPoints(x0, y0, x1, y1), ...extra })

/** 单层：两间洋室中间一道隔墙，南侧阳台 */
function flat(): Plan {
  return {
    version: 1,
    name: 'flat',
    wall: 10,
    wallOuter: 18,
    rooms: [room('a', 'western', 0, 0, 400, 400), room('b', 'western', 400, 0, 800, 400), room('bal', 'balcony', 0, 400, 800, 520)],
    openings: [],
    fixtures: [],
    furniture: [],
  }
}

describe('房间编号图：单层', () => {
  const p = flat()
  const m = buildLightMask(p)!
  const A = m.rooms.get('a')!
  const B = m.rooms.get('b')!

  test('房间内是各自的编号，墙体是 0，户外和阳台是 1', () => {
    expect(A.group).toBeGreaterThan(LM_OUTDOOR)
    expect(B.group).toBeGreaterThan(LM_OUTDOOR)
    expect(A.group).not.toBe(B.group)
    expect(m.rooms.get('bal')!.group).toBe(LM_OUTDOOR)
    expect(maskAt(m, 0, { x: 200, y: 200 }).id).toBe(A.group)
    expect(maskAt(m, 0, { x: 600, y: 200 }).id).toBe(B.group)
    // 隔墙中心、外墙中心
    expect(maskAt(m, 0, { x: 400, y: 200 }).id).toBe(LM_WALL)
    expect(maskAt(m, 0, { x: 200, y: 0 }).id).toBe(LM_WALL)
    // 户外、阳台、图外
    expect(maskAt(m, 0, { x: 200, y: -40 }).id).toBe(LM_OUTDOOR)
    expect(maskAt(m, 0, { x: 200, y: 470 }).id).toBe(LM_OUTDOOR)
    expect(maskAt(m, 0, { x: -5000, y: 0 }).id).toBe(LM_OUTDOOR)
  })

  test('墙面上的点沿法线外推后落进它面向的房间：隔墙两侧各归各的灯', () => {
    // 隔墙厚 10：墙面在 x = 395 / 405，外推 LM_PUSH
    const left = { x: 395 - LM_PUSH, y: 200 }
    const right = { x: 405 + LM_PUSH, y: 200 }
    expect(maskPass(m, A, 0, left)).toBe(true)
    expect(maskPass(m, A, 0, right)).toBe(false)
    expect(maskPass(m, B, 0, right)).toBe(true)
    expect(maskPass(m, B, 0, left)).toBe(false)
    // 墙体本身（墙顶、门洞）两边的灯都放行
    expect(maskPass(m, A, 0, { x: 400, y: 200 })).toBe(true)
    expect(maskPass(m, B, 0, { x: 400, y: 200 })).toBe(true)
  })

  test('阳台灯只照阳台和户外（外墙外侧）', () => {
    const bal = m.rooms.get('bal')!
    expect(maskPass(m, bal, 0, { x: 200, y: 470 })).toBe(true)
    expect(maskPass(m, bal, 0, { x: 200, y: 400 + 9 + LM_PUSH })).toBe(true)
    expect(maskPass(m, bal, 0, { x: 200, y: 400 - 9 - LM_PUSH })).toBe(false)
    expect(maskPass(m, A, 0, { x: 200, y: 470 })).toBe(false)
  })

  test('指纹：家具变了不变，房间变了才变', () => {
    const k = lightMaskKey(p)
    expect(lightMaskKey({ ...p, furniture: [{ id: 'f', asset: 'x', x: 1, y: 1, rot: 0 } as Plan['furniture'][number]] })).toBe(k)
    const q = flat()
    q.rooms[0].points = rectPoints(0, 0, 380, 400)
    expect(lightMaskKey(q)).not.toBe(k)
  })
})

describe('房间编号图：两层户建', () => {
  const p = twoStoryPlan()
  const m = buildLightMask(p)!
  const g = (id: string) => m.rooms.get(id)!

  test('楼层序号和每层的编号', () => {
    expect(m.floors).toBe(2)
    expect(g('ldk').floor).toBe(0)
    expect(g('bed1').floor).toBe(1)
    // 编号全户唯一
    const ids = ['ldk', 'hall1', 'bath', 'wash', 'wc1', 'hall2', 'bed1', 'bed2', 'bed3', 'wc2'].map((id) => g(id).group)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('敞开边相连（同 openGroup 的 LDK 和厨房）共用编号，敞开边上没有墙', () => {
    expect(g('kit').group).toBe(g('ldk').group)
    // LDK 与厨房的分界 x = 560, y ∈ (0, 300)
    expect(maskAt(m, 0, { x: 560, y: 150 }).id).toBe(g('ldk').group)
    expect(maskPass(m, g('ldk'), 0, { x: 730, y: 150 })).toBe(true)
    // 走廊和 LDK 之间是墙
    expect(maskPass(m, g('hall1'), 0, { x: 300, y: 250 })).toBe(false)
  })

  test('楼层带：2F 的灯不照 1F，1F 的灯不照 2F', () => {
    expect(maskPass(m, g('bed1'), 0, { x: 300, y: 200 })).toBe(false)
    expect(maskPass(m, g('ldk'), 1, { x: 300, y: 200 })).toBe(false)
    // 墙体放行只限同层
    expect(maskPass(m, g('bed1'), 0, { x: 560, y: 600 })).toBe(false)
  })

  test('楼梯洞口上下相通：1F 走廊的灯照到楼梯上半段，2F 走廊的灯照到楼梯下半段；别的房间不行', () => {
    const s = { x: 845, y: 605 }
    expect(maskAt(m, 1, s)).toMatchObject({ id: g('hall2').group, down: g('hall1').group })
    expect(maskAt(m, 0, s)).toMatchObject({ id: g('hall1').group, up: g('hall2').group })
    expect(maskPass(m, g('hall1'), 1, s)).toBe(true)
    expect(maskPass(m, g('hall2'), 0, s)).toBe(true)
    expect(maskPass(m, g('bed3'), 0, s)).toBe(false)
    expect(maskPass(m, g('ldk'), 1, s)).toBe(false)
    // 洞口以外的 2F 走廊：1F 的灯照不到
    expect(maskPass(m, g('hall1'), 1, { x: 700, y: 350 })).toBe(false)
  })

  test('挑空：下层房间的灯照得到挑空里（通高的墙），挑空正下方仍是下层房间', () => {
    const q = twoStoryPlan()
    // 把 2F 的 bed1 改成挑空（在 LDK 上方）
    q.rooms.find((r) => r.id === 'bed1')!.kind = 'void'
    const v = buildLightMask(q)!
    const c = { x: 280, y: 200 }
    const ldk = v.rooms.get('ldk')!
    expect(maskAt(v, 1, c).down).toBe(ldk.group)
    expect(maskPass(v, ldk, 1, c)).toBe(true)
    expect(maskAt(v, 0, c).id).toBe(ldk.group)
    // 2F 别的房间的灯不会因此照到 1F
    expect(maskPass(v, v.rooms.get('bed2')!, 0, c)).toBe(false)
  })
})
