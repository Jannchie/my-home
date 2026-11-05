// 点落在哪个房间、房间地面比标准地面低多少（玄関土间、阳台）。平面图和 3D 共用；three/house.ts 原样转出。

import { pointInPolygon, type Plan, type Room, type RoomKind, type Vec } from './model'
import { isIndoor } from './walls'

/** 地面高度：玄関土间、阳台比室内低 */
const FLOOR_Y: Partial<Record<RoomKind, number>> = { entrance: -12, balcony: -15 }
export const floorY = (r: Room | undefined) => (r ? (r.flush ? 0 : (FLOOR_Y[r.kind] ?? 0)) : 0)

export function roomAt(plan: Pick<Plan, 'rooms'>, p: Vec, floor?: string | null) {
  // 阳台和户内重叠时户内优先；floor 给定（多层户型）时只看那一层的房间（undefined 字段 = 最底层，传 null 表示最底层）
  const hits = plan.rooms.filter((r) => (floor === undefined || (r.floor ?? null) === floor) && pointInPolygon(p, r.points))
  return hits.find(isIndoor) ?? hits[0]
}
