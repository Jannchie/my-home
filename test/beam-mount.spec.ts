// 壁挂物挂到内收柱（梁）上（src/beamMount.ts）：贴墙吸附、改梁时跟着挪、一键布置收尾
import { describe, expect, test } from 'vitest'
import { emptyPlan, rectPoints, uid, type Plan } from '/src/model'
import { patchWallFace } from '/src/wallFace'
import { beamStandoff, reseatOnBeam, seatOnBeams } from '/src/beamMount'
import { snapToWall } from '/src/snap'
import { normalizePlan } from '/src/store'

/** 一间洋室 0..400 × 0..300，第 0 面墙是上边（y = 0） */
function plan(): Plan {
  const p = emptyPlan()
  p.rooms = [{ id: uid('r'), name: 'A', kind: 'western', points: rectPoints(0, 0, 400, 300) }]
  return p
}
/** snapToWall 取整到 1 cm，其余取到 0.1 cm */
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.6)
const beam = { w: 200, d: 30, h: 40, offset: 100 }

describe('beamStandoff', () => {
  test('沿墙、高度都重叠才挂到梁正面', () => {
    // 墙高 240，梁占离地 200..240、沿墙 0..200
    expect(beamStandoff(beam, 240, 50, 150, 205, 233)).toBe(30)
    expect(beamStandoff(beam, 240, 250, 350, 205, 233)).toBe(0)
    expect(beamStandoff(beam, 240, 50, 150, 100, 150)).toBe(0)
    expect(beamStandoff(undefined, 240, 50, 150, 205, 233)).toBe(0)
  })
})

describe('snapToWall', () => {
  test('空调吸到有梁的那段墙上：背面贴梁正面；梁外的那段照旧贴墙', () => {
    const p = plan()
    const bare = snapToWall(p, 'aircon', 100, 30)!
    patchWallFace(p.rooms[0], 0, { beam })
    const on = snapToWall(p, 'aircon', 100, 30)!
    near(on.y - bare.y, 30)
    expect(on.rot).toBe(bare.rot)
    near(snapToWall(p, 'aircon', 330, 30)!.y, bare.y)
  })
})

describe('reseatOnBeam', () => {
  test('加梁挪到梁正面，改深跟着挪，去掉梁贴回墙面；特意挪开的不动', () => {
    const p = plan()
    const r = p.rooms[0]
    const s = snapToWall(p, 'aircon', 100, 30)!
    const ac = { id: uid('u'), asset: 'aircon', x: s.x, y: s.y, rot: s.rot }
    const away = { id: uid('u'), asset: 'aircon', x: 100, y: s.y + 80, rot: s.rot }
    p.furniture = [ac, away]
    patchWallFace(r, 0, { beam })
    reseatOnBeam(p, r, 0, undefined, beam)
    near(ac.y, s.y + 30)
    const deeper = { ...beam, d: 50 }
    reseatOnBeam(p, r, 0, beam, deeper)
    near(ac.y, s.y + 50)
    reseatOnBeam(p, r, 0, deeper, undefined)
    near(ac.y, s.y)
    expect(away.y).toBe(s.y + 80)
  })

  test('梁缩短到碰不到空调：贴回墙面', () => {
    const p = plan()
    const r = p.rooms[0]
    patchWallFace(r, 0, { beam })
    const s = snapToWall(p, 'aircon', 100, 30)!
    const ac = { id: uid('u'), asset: 'aircon', x: s.x, y: s.y, rot: s.rot }
    p.furniture = [ac]
    const short = { ...beam, w: 20, offset: 10 }
    reseatOnBeam(p, r, 0, beam, short)
    near(ac.y, s.y - 30)
  })
})

describe('seatOnBeams', () => {
  test('贴着墙面挂、碰到梁的挪到梁正面，已经在梁上的不再挪', () => {
    const p = plan()
    const s = snapToWall(p, 'aircon', 100, 30)!
    patchWallFace(p.rooms[0], 0, { beam })
    const fs = [{ id: uid('u'), asset: 'aircon', x: s.x, y: s.y, rot: s.rot }]
    seatOnBeams(p, fs)
    near(fs[0].y, s.y + 30)
    seatOnBeams(p, fs)
    near(fs[0].y, s.y + 30)
  })
})

describe('墙角：相邻墙伸出来的梁', () => {
  test('吸到侧墙靠墙角处：沿墙让开上边那面墙的梁，不戳进去', () => {
    const p = plan()
    const bare = snapToWall(p, 'aircon', 10, 40)!
    patchWallFace(p.rooms[0], 0, { beam: { w: 400, d: 30, h: 40, offset: 200 } })
    const on = snapToWall(p, 'aircon', 10, 40)!
    expect(on.rot).toBe(bare.rot)
    near(on.x, bare.x)
    near(on.y - bare.y, 30)
    // 离墙角远的地方照旧
    near(snapToWall(p, 'aircon', 10, 200)!.y, 200)
  })

  test('梁加到墙角：侧墙上挂着的空调跟着让开', () => {
    const p = plan()
    const s = snapToWall(p, 'aircon', 10, 40)!
    const ac = { id: uid('u'), asset: 'aircon', x: s.x, y: s.y, rot: s.rot }
    p.furniture = [ac]
    patchWallFace(p.rooms[0], 0, { beam: { w: 400, d: 30, h: 40, offset: 200 } })
    seatOnBeams(p, p.furniture, false)
    near(ac.x, s.x)
    near(ac.y - s.y, 30)
  })
})

describe('读旧存档', () => {
  test('梁位置上穿在梁里的空调挂到梁正面', () => {
    const p = plan()
    const s = snapToWall(p, 'aircon', 100, 30)!
    patchWallFace(p.rooms[0], 0, { beam })
    p.furniture = [{ id: uid('u'), asset: 'aircon', x: s.x, y: s.y, rot: s.rot }]
    const q = normalizePlan(JSON.parse(JSON.stringify(p)))!
    near(q.furniture[0].y, s.y + 30)
  })
})
