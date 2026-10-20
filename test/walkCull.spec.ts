// 漫游的可见性剔除（walkCull.ts）：只穿过视野里看得到的门洞往外走。
import { describe, expect, test } from 'vitest'
import { portalsOf, walkVisibility } from '/src/walkCull'
import type { Opening, Plan, Room } from '/src/model'
import { genJp } from './helpers'

const box = (id: string, x0: number, x1: number, extra: Partial<Room> = {}): Room => ({ id, kind: 'western', name: id, points: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 300 }, { x: x0, y: 300 }], ...extra }) as Room
const door = (id: string, roomId: string): Opening => ({ id, kind: 'door', roomId, edge: 1, offset: 150, width: 80, hinge: 'start', swing: 'in' }) as Opening

/** 三间房排成一排，A–B、B–C 之间各一扇门（都在房间的第 1 条边，x = 300 / 600 处） */
const row = (): Plan => ({ ...genJp(1), floors: undefined, rooms: [box('A', 0, 300), box('B', 300, 600), box('C', 600, 900)], openings: [door('d1', 'A'), door('d2', 'B')], furniture: [] }) as Plan

describe('walkVisibility', () => {
  test('门洞连起相邻的房间', () => {
    const ps = portalsOf(row(), '1f')
    expect(ps.map((p) => [p.a, p.b].sort().join('-')).sort()).toEqual(['A-B', 'B-C'])
  })

  test('朝着门看：穿过两道对齐的门看得到最里面的房间', () => {
    const v = walkVisibility(row(), '1f', 'A', { x: 150, y: 150 }, { x: 1, y: 0 }, 0.6)!
    expect([...v.rooms].sort()).toEqual(['A', 'B', 'C'])
  })

  test('背对门：只看得到自己所在的房间', () => {
    const v = walkVisibility(row(), '1f', 'A', { x: 150, y: 150 }, { x: -1, y: 0 }, 0.6)!
    expect([...v.rooms]).toEqual(['A'])
  })

  test('门在视野外：隔壁也剔掉', () => {
    // 朝 +y 看（门在正右方，水平半视角 0.5 rad 外）
    const v = walkVisibility(row(), '1f', 'A', { x: 150, y: 150 }, { x: 0, y: 1 }, 0.5)!
    expect([...v.rooms]).toEqual(['A'])
  })

  test('站在挑空下面：上一层透过门看得到的房间也算', () => {
    // 1F 走廊 H1 正上方是 2F 走廊 H2，H2 里有一块挑空（楼板的洞），H2 的门通到 2F 的 R2
    const hole = { id: 'V', kind: 'void', name: 'V', floor: '2f', points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }] } as Room
    const plan = {
      ...row(),
      floors: [
        { id: '1f', name: '1F', elevation: 0, height: 240 },
        { id: '2f', name: '2F', elevation: 270, height: 240 },
      ],
      rooms: [box('H1', 0, 300, { kind: 'hall' }), box('H2', 0, 300, { kind: 'hall', floor: '2f' }), hole, box('R2', 300, 600, { floor: '2f' }), box('R3', 600, 900, { floor: '2f' })],
      openings: [door('d2', 'H2')],
    } as Plan
    const v = walkVisibility(plan, '1f', 'H1', { x: 150, y: 150 }, { x: 1, y: 0 }, 0.6)!
    expect([...v.floors].sort()).toEqual(['1f', '2f'])
    expect(v.rooms.has('R2')).toBe(true)
    // R3 和 R2 之间没有门：看不到
    expect(v.rooms.has('R3')).toBe(false)
  })

  test('不在任何房间里：不剔除', () => {
    expect(walkVisibility(row(), '1f', null, { x: -50, y: 150 }, { x: 1, y: 0 }, 0.6)).toBeNull()
  })
})
