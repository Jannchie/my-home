// 拖手柄调内收柱（src/beamDrag.ts）：各手柄的换算、吸附、夹紧，射线到拖动直线的参数
import { describe, expect, test } from 'vitest'
import { emptyPlan, rectPoints, uid } from '/src/model'
import { axisParam, beamFrame, dragBeam } from '/src/beamDrag'

const L = 400
const s = { w: 200, d: 30, h: 40, offset: 200 }

describe('dragBeam', () => {
  test('两端：拖的那端跟着走，另一端不动；靠近墙端吸过去', () => {
    expect(dragBeam(s, 'start', -30, L, 239)).toEqual({ w: 230, d: 30, h: 40, offset: 185 })
    expect(dragBeam(s, 'end', 50, L, 239)).toEqual({ w: 250, d: 30, h: 40, offset: 225 })
    // 起点端拖到离墙端 3 cm：吸到 0
    expect(dragBeam(s, 'start', -97, L, 239)).toMatchObject({ w: 300, offset: 150 })
    // 拖过另一端：最短 BEAM_MIN
    expect(dragBeam(s, 'end', -500, L, 239).w).toBe(5)
  })

  test('梁身：沿墙挪，不出墙，靠墙端吸过去', () => {
    expect(dragBeam(s, 'move', 40, L, 239).offset).toBe(240)
    expect(dragBeam(s, 'move', 500, L, 239).offset).toBe(300)
    expect(dragBeam(s, 'move', -97, L, 239).offset).toBe(100)
  })

  test('正面改深、底面改高（往下拖 = 垂得更多），按 step 取整、夹到墙高', () => {
    expect(dragBeam(s, 'front', 12, L, 239).d).toBe(42)
    expect(dragBeam(s, 'front', 12, L, 239, 5).d).toBe(40)
    expect(dragBeam(s, 'bottom', -20, L, 239).h).toBe(60)
    expect(dragBeam(s, 'bottom', 100, L, 239).h).toBe(5)
    expect(dragBeam(s, 'bottom', -500, L, 120).h).toBe(120)
  })
})

describe('beamFrame', () => {
  test('手柄在梁的端面、正面、底面上，包围盒和梁一样大', () => {
    const p = emptyPlan()
    const room = { id: uid('r'), name: 'A', kind: 'western' as const, points: rectPoints(0, 0, 400, 300) }
    p.rooms = [room]
    // 第 0 面墙是上边 y = 0，朝室内是 +y
    const f = beamFrame(room, 0, s, 5, 240)
    expect(f.size).toEqual({ w: 200, h: 40, d: 30 })
    expect(f.grips.front.z).toBeCloseTo(35)
    expect(f.grips.bottom.y).toBe(200)
    expect(Math.abs(f.grips.end.x - f.grips.start.x)).toBeCloseTo(200)
    expect(f.axes.front.x + 0).toBe(0)
    expect(f.axes.front.z).toBe(1)
  })
})

describe('axisParam', () => {
  test('射线离直线最近处的参数；平行时 null', () => {
    // 直线：x 轴；射线从 (3, 5, 0) 朝 -y 打下去
    expect(axisParam({ x: 3, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(3)
    expect(axisParam({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull()
  })
})
