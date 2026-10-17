// 墙体分析：把每个房间的边切成「外墙 / 户内隔墙 / 敞开边界」三类线段。
//   外墙  ：边外侧不是任何户内房间（阳台算户外）→ 躯体，厚墙
//   隔墙  ：两侧都是户内房间 → 薄墙
//   敞开  ：玄関与廊下 / K / DK 之间没有墙，只画上り框线

import { add, edgesOf, mul, pointInPolygon, type EdgeInfo, type Plan, type Room, type RoomKind, type Vec } from './model'

const OPEN_PAIRS: [RoomKind, RoomKind][] = [
  ['entrance', 'hall'],
  ['entrance', 'kitchen'],
]

export function isOpenPair(a: RoomKind, b: RoomKind) {
  return OPEN_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

/** 室内洗濯機置場：朝 K / 玄関 / 廊下 敞开的凹位，不砌墙 */
const ALCOVE_OPEN_TO: RoomKind[] = ['kitchen', 'ldk', 'entrance', 'hall']
const isAlcoveOpen = (a: Room, b: Room) => a.name === '洗濯機置場' && ALCOVE_OPEN_TO.includes(b.kind)

/** 两个相邻房间之间是否敞开（不砌墙） */
export function isOpenBetween(a: Room, b: Room) {
  return isOpenPair(a.kind, b.kind) || isAlcoveOpen(a, b) || isAlcoveOpen(b, a) || (!!a.openGroup && a.openGroup === b.openGroup)
}

/** 户内房间（阳台、挑空不算） */
export const isIndoor = (r: Room) => r.kind !== 'balcony' && r.kind !== 'void'
/** 挑空（多层户型里上层标出来的通高区域：没有楼板，下层的外墙在这里通高） */
export const isVoid = (r: Pick<Room, 'kind'>) => r.kind === 'void'

/** 边 e 上与 other 房间共用的区间（沿 e 的距离） */
export function sharedIntervals(e: EdgeInfo, other: Room): [number, number][] {
  const out: [number, number][] = []
  for (const f of edgesOf(other.points)) {
    if (Math.abs(e.dir.x * f.dir.y - e.dir.y * f.dir.x) > 1e-6) continue // 不平行
    const off = (f.a.x - e.a.x) * e.dir.y - (f.a.y - e.a.y) * e.dir.x
    if (Math.abs(off) > 1) continue // 不共线
    const ta = (f.a.x - e.a.x) * e.dir.x + (f.a.y - e.a.y) * e.dir.y
    const tb = (f.b.x - e.a.x) * e.dir.x + (f.b.y - e.a.y) * e.dir.y
    const lo = Math.max(0, Math.min(ta, tb))
    const hi = Math.min(e.length, Math.max(ta, tb))
    if (hi - lo > 1) out.push([lo, hi])
  }
  return out
}

export type WallKind = 'outer' | 'inner' | 'open'

export interface WallSegment {
  a: Vec
  b: Vec
  kind: WallKind
}

/** 把 [0, L] 按若干带标签区间切开，未覆盖部分标为 fallback */
function splitEdge(L: number, tagged: { lo: number; hi: number; kind: WallKind }[], fallback: WallKind) {
  const cuts = new Set([0, L])
  for (const t of tagged) {
    cuts.add(t.lo)
    cuts.add(t.hi)
  }
  const xs = [...cuts].sort((a, b) => a - b)
  const out: { lo: number; hi: number; kind: WallKind }[] = []
  for (let i = 0; i + 1 < xs.length; i++) {
    const lo = xs[i]
    const hi = xs[i + 1]
    if (hi - lo < 0.5) continue
    const m = (lo + hi) / 2
    // 敞开优先于隔墙：同一段只要和玄関敞开相邻就不画墙
    const hit = tagged.filter((t) => t.lo <= m && m <= t.hi)
    const kind = hit.some((t) => t.kind === 'open') ? 'open' : hit.length ? 'inner' : fallback
    const prev = out[out.length - 1]
    if (prev && prev.kind === kind && Math.abs(prev.hi - lo) < 0.5) prev.hi = hi
    else out.push({ lo, hi, kind })
  }
  return out
}

/**
 * 所有户内房间边界的墙段（共用墙两侧各出一份，位置重合，不影响绘制）。
 * 多层户型的房间按楼层（Room.floor）分开各算各的：不同楼层的房间互不当作邻居。
 */
export function wallSegments(rooms: Room[]): WallSegment[] {
  const first = rooms[0]?.floor
  if (rooms.some((r) => r.floor !== first)) {
    const groups = new Map<string, Room[]>()
    for (const r of rooms) {
      const k = r.floor ?? ''
      groups.set(k, [...(groups.get(k) ?? []), r])
    }
    return [...groups.values()].flatMap(floorWallSegments)
  }
  return floorWallSegments(rooms)
}

function floorWallSegments(rooms: Room[]): WallSegment[] {
  const indoor = rooms.filter(isIndoor)
  const segs: WallSegment[] = []
  for (const r of indoor) {
    for (const e of edgesOf(r.points)) {
      const tagged: { lo: number; hi: number; kind: WallKind }[] = []
      for (const o of indoor) {
        if (o === r) continue
        const kind: WallKind = isOpenBetween(r, o) ? 'open' : 'inner'
        for (const [lo, hi] of sharedIntervals(e, o)) tagged.push({ lo, hi, kind })
      }
      for (const s of splitEdge(e.length, tagged, 'outer')) {
        segs.push({ a: add(e.a, mul(e.dir, s.lo)), b: add(e.a, mul(e.dir, s.hi)), kind: s.kind })
      }
    }
  }
  return segs
}

/** 挨着挑空时装栏杆、不砌墙的房间：走廊、起居（卧室、卫生间照样是墙） */
const RAIL_KINDS = new Set<RoomKind>(['hall', 'ldk', 'dining', 'kitchen'])

/**
 * 挑空边上装栏杆的地方：同层的走廊 / 起居房间和挑空共用的边（中心线上的线段）。
 * 这些边在墙段推导里仍是外墙（导航、靠墙摆放照旧当墙），3D 里不砌墙、改成栏杆，从上层能俯视下面的客厅。
 */
export function voidRailSegments(rooms: Room[]): { a: Vec; b: Vec; room: Room }[] {
  const out: { a: Vec; b: Vec; room: Room }[] = []
  const voids = rooms.filter(isVoid)
  if (!voids.length) return out
  for (const r of rooms) {
    if (!RAIL_KINDS.has(r.kind)) continue
    for (const v of voids) {
      if (v.floor !== r.floor) continue
      for (const e of edgesOf(r.points)) for (const [lo, hi] of sharedIntervals(e, v)) out.push({ a: add(e.a, mul(e.dir, lo)), b: add(e.a, mul(e.dir, hi)), room: r })
    }
  }
  return out
}

/**
 * 边上某点的墙厚：外侧紧挨着户内房间就是隔墙，否则是外墙。
 * 从阳台这一侧看，背后的户内房间隔着的是建筑外墙（wallSegments 里也是 outer），按外墙算。
 */
export function wallThicknessAt(plan: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>, p: Vec, out: Vec, self?: Room) {
  if (self && !isIndoor(self)) return plan.wallOuter
  const probe = add(p, mul(out, 3))
  const inner = plan.rooms.some((r) => r !== self && isIndoor(r) && (!self || r.floor === self.floor) && pointInPolygon(probe, r.points))
  return inner ? plan.wall : plan.wallOuter
}
