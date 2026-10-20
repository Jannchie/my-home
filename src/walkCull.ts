// 漫游时的可见性：从镜头所在的房间看得到哪些房间、哪些楼层。
// 室内漫游时视锥里大半是墙后面的东西（隔壁房间的家具、楼上整层），它们一个像素都看不到，却照样每帧提交绘制（主画面、法线、倒影各一遍）。
//
// 做法是平面上的门洞视锥（portal culling）：房间之间的「门洞」是门、窗的开口和敞开相连的共边。
// 从镜头出发，视锥是水平视野；穿过一个门洞时视锥收窄成「门洞在镜头里占的那一段角度」，再看门洞那边的房间的门洞，一层层往外走。
// 镜头贴着门洞（站在门口）时门洞占的角度不可靠，视锥原样穿过去。
// 楼层：看得到的房间里有楼梯洞口 / 挑空、洞口又在视锥里时，洞口那一层（上一层或下一层）也算看得到：
// 从那一层和洞口重叠的房间出发，视锥收窄成透过洞口看得到的角度，同样穿过那一层的门洞往外找。
// 只用平面数据，不碰 three：Sandbox3D 按结果把看不到的东西移出渲染层。

import { edgesOf, openingGeom, pointInPolygon, projectToSegment, type Plan, type Room, type Vec } from './model'
import { floorAbove, floorBelow, floorOf } from './floors'
import { isOpenBetween, sharedIntervals } from './walls'
import { overlapArea, slabHoles } from './stairs'
import { roomAcross } from './doorStyles'

/** 镜头离门洞这么近（cm）时视锥原样穿过 */
const NEAR = 45
/** 最多穿过几道门洞 */
const MAX_DEPTH = 6
/** 视锥两边各放宽一点（rad）：走动、转头时不用每帧重算（Sandbox3D 按它决定多少变化才重算） */
export const CULL_MARGIN = 0.12

export interface Portal {
  a: string
  b: string
  p: Vec
  q: Vec
}

export interface WalkVisibility {
  rooms: Set<string>
  floors: Set<string>
}

/** 一层的门洞：敞开相连的共边、门窗的开口（两侧各是哪个房间） */
export function portalsOf(plan: Plan, floor: string): Portal[] {
  const rooms = plan.rooms.filter((r) => floorOf(plan, r) === floor)
  const out: Portal[] = []
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]
      const b = rooms[j]
      if (!isOpenBetween(a, b)) continue
      for (const e of edgesOf(a.points)) {
        for (const [lo, hi] of sharedIntervals(e, b)) {
          out.push({ a: a.id, b: b.id, p: { x: e.a.x + e.dir.x * lo, y: e.a.y + e.dir.y * lo }, q: { x: e.a.x + e.dir.x * hi, y: e.a.y + e.dir.y * hi } })
        }
      }
    }
  }
  for (const o of plan.openings) {
    const geo = openingGeom(rooms, o)
    if (!geo) continue
    const other = roomAcross({ rooms }, o, geo.owner)
    if (!other) continue
    const c = geo.center
    const h = o.width / 2
    out.push({ a: geo.owner.id, b: other.id, p: { x: c.x - geo.e.dir.x * h, y: c.y - geo.e.dir.y * h }, q: { x: c.x + geo.e.dir.x * h, y: c.y + geo.e.dir.y * h } })
  }
  return out
}

/**
 * 按户型缓存各层的门洞、楼板洞口和与每个洞口重叠的房间（户型变了换一个新的）。
 * walkVisibility 每次镜头动都会调用，这些只和户型有关的东西不用每次重算
 */
export class CullCache {
  private portals = new Map<string, Portal[]>()
  private holes = new Map<string, { hole: Vec[]; rooms: Map<string, Room[]> }[]>()
  constructor(readonly plan: Plan) {}

  portalsOf(floor: string) {
    let p = this.portals.get(floor)
    if (!p) this.portals.set(floor, (p = portalsOf(this.plan, floor)))
    return p
  }

  /** slab 层楼板上的洞口，和每个洞口重叠的房间（按楼层分组，共边不算重叠） */
  holesOf(slab: string) {
    let h = this.holes.get(slab)
    if (!h) {
      h = slabHoles(this.plan, slab).map((hole) => {
        const rooms = new Map<string, Room[]>()
        for (const r of this.plan.rooms) {
          if (overlapArea(r.points, hole) <= 1) continue
          const fl = floorOf(this.plan, r)
          rooms.set(fl, [...(rooms.get(fl) ?? []), r])
        }
        return { hole, rooms }
      })
      this.holes.set(slab, h)
    }
    return h
  }
}

/**
 * 从镜头（平面坐标 cam、水平朝向 fwd（单位向量）、水平半视角 half）看得到的房间和楼层。
 * roomId：镜头所在的房间（在 floor 层）；为 null（室外、阳台外）时返回 null = 不剔除。
 */
export function walkVisibility(plan: Plan, floor: string, roomId: string | null, cam: Vec, fwd: Vec, half: number, cache = new CullCache(plan)): WalkVisibility | null {
  if (!roomId) return null
  // 角度都相对镜头正前方（-π, π]；左正右负
  const ang = (v: Vec) => {
    const dx = v.x - cam.x
    const dy = v.y - cam.y
    return Math.atan2(fwd.x * dy - fwd.y * dx, fwd.x * dx + fwd.y * dy)
  }
  const lim = half + CULL_MARGIN
  /** 每个房间被哪些视锥看到（角度区间）；看得到的房间就是它的键。楼梯洞口要落在视锥里才算看得到上下层 */
  const cones = new Map<string, [number, number][]>()
  /** 记下视锥；已经被这间房更宽的视锥盖住时返回 false（不用再往外走：房间成环、两间房之间有两个门洞时不会重复走） */
  const addCone = (id: string, l: number, h: number) => {
    const list = cones.get(id)
    if (!list) {
      cones.set(id, [[l, h]])
      return true
    }
    if (list.some(([a, b]) => a <= l && b >= h)) return false
    list.push([l, h])
    return true
  }
  const walk = (id: string, lo: number, hi: number, via: Portal | null, depth: number, list: Portal[]) => {
    if (depth > MAX_DEPTH) return
    for (const pt of list) {
      if (pt === via || (pt.a !== id && pt.b !== id)) continue
      const next = pt.a === id ? pt.b : pt.a
      let l = lo
      let h = hi
      if (projectToSegment(cam, pt.p, pt.q).d > NEAR) {
        const a0 = ang(pt.p)
        const a1 = ang(pt.q)
        // 门洞跨过镜头背后（两端角度差超过 π）：从这里看不到它的正面
        if (Math.abs(a0 - a1) > Math.PI) continue
        l = Math.max(lo, Math.min(a0, a1))
        h = Math.min(hi, Math.max(a0, a1))
        if (l >= h) continue
      }
      if (addCone(next, l, h)) walk(next, l, h, pt, depth + 1, list)
    }
  }
  addCone(roomId, -lim, lim)
  walk(roomId, -lim, lim, null, 0, cache.portalsOf(floor))
  /** 透过这个房间的视锥看洞口，看得到的那段角度（洞口跨过镜头背后、或镜头就在洞口里时是整个视野）；看不到返回空 */
  const holeCones = (id: string, hole: Vec[]): [number, number][] => {
    if (pointInPolygon(cam, hole)) return [[-lim, lim]]
    const as = hole.map(ang)
    let lo = Math.min(...as)
    let hi = Math.max(...as)
    if (hi - lo > Math.PI) {
      lo = -Math.PI
      hi = Math.PI
    }
    return (cones.get(id) ?? []).map(([a, b]): [number, number] => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => a < b)
  }
  const floors = new Set([floor])
  // 上一层：本层看得到的房间顶上有洞（上层楼板的洞）；下一层：本层楼板的洞。
  // 那一层从和洞口重叠的房间（楼梯间的走廊）出发，视锥是透过洞口看得到的那段角度，照样穿过那一层的门洞往外找：
  // 站在楼梯口往上看，透过二楼走廊敞开的门看得到的房间也要画
  const other = (fl: string | undefined, slab: string | undefined) => {
    if (!fl || !slab) return
    for (const { hole, rooms } of cache.holesOf(slab)) {
      const seen = (rooms.get(floor) ?? []).filter((r) => cones.has(r.id)).flatMap((r) => holeCones(r.id, hole))
      if (!seen.length) continue
      floors.add(fl)
      for (const r of rooms.get(fl) ?? []) {
        for (const [a, b] of seen) if (addCone(r.id, a, b)) walk(r.id, a, b, null, 1, cache.portalsOf(fl))
      }
    }
  }
  const up = floorAbove(plan, floor)?.id
  other(up, up)
  other(floorBelow(plan, floor)?.id, floor)
  return { rooms: new Set(cones.keys()), floors }
}
