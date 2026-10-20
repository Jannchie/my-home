// 门窗改宽度：拖一端（另一端不动）、常用宽度（中心不动），都夹在墙边内。
import { describe, expect, test } from 'vitest'
import { OPENING_MIN_W, openingFromEnds, resizedOpening } from '/src/openingEdit'
import type { Plan } from '/src/model'

const plan = { rooms: [{ id: 'r', kind: 'western', name: 'r', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] }] } as unknown as Plan
const door = { roomId: 'r', edge: 0, width: 80, offset: 150 }

describe('openingFromEnds', () => {
  test('拖右端：左端不动', () => {
    expect(openingFromEnds(110, 230, 300)).toEqual({ width: 120, offset: 170 })
  })
  test('拖过另一端：两端对调，宽度照算', () => {
    expect(openingFromEnds(110, 50, 300)).toEqual({ width: 60, offset: 80 })
  })
  test('太窄：保持最小宽度，从不动的那一端往拖的方向长', () => {
    const v = openingFromEnds(110, 120, 300)
    expect(v.width).toBe(OPENING_MIN_W)
    expect(v.offset - v.width / 2).toBe(110)
  })
  test('拖出墙边：夹在墙边内', () => {
    expect(openingFromEnds(200, 400, 300)).toEqual({ width: 100, offset: 250 })
  })
})

describe('resizedOpening', () => {
  test('中心不动', () => {
    expect(resizedOpening(plan, door, 120)).toEqual({ width: 120, offset: 150 })
  })
  test('靠墙角的门加宽：往里挪，不伸出墙边', () => {
    expect(resizedOpening(plan, { ...door, offset: 50 }, 160)).toEqual({ width: 160, offset: 80 })
  })
  test('比墙边还宽：夹到墙边长', () => {
    expect(resizedOpening(plan, door, 500)?.width).toBe(300)
  })
  test('没变化：返回 null（不记撤销）', () => {
    expect(resizedOpening(plan, door, 80)).toBeNull()
  })
})
