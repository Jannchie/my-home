// 多楼层：楼层表、按层取子户型（floorView）、楼层增删时的数据整理。
//
// 数据约定（model.ts）：Plan.floors 不填 = 单层户型；房间 / 设备 / 家具的 floor 不填 = 最底层，
// 门窗跟着所在房间走。单层户型里所有函数都退化成原来的行为（floorView 直接返回原户型）。
//
// 大部分户型逻辑（墙体推导、吸附、检查、一键布置、3D 搭建…）只认识「一层」：多层户型按层取出
// floorView(plan, floorId)，当作一份独立的单层户型交给它们。子户型里的房间、设备、家具和原户型是同一批对象，
// 直接改它们的字段会写回原户型；但往子户型的数组里增删不会，增删要走原户型（store 的 addRoom 等会打上当前楼层）。

import { area, bbox, dist, rectPoints, signedArea, type Floor, type Plan, type Region, type Room, type Vec } from './model'
import { wallSegments } from './walls'

/** 楼板厚（cm）：上层地面到下层天花之间 */
export const SLAB = 30
/** 新楼层的默认墙高（层高，楼板底到地面）：日式公寓常见的 2.4 m */
export const DEFAULT_FLOOR_H = 240
/** 各地区的默认层高：中式、欧美住宅普遍更高（约 2.7 m）。单层户型没存楼层表时按户型的地区取 */
export const regionFloorH = (r: Region | undefined) => (r === 'cn' || r === 'west' ? 270 : DEFAULT_FLOOR_H)
/** 单层户型隐含的那一层 */
export const BASE_FLOOR_ID = '1f'
export const baseFloor = (height = DEFAULT_FLOOR_H): Floor => ({ id: BASE_FLOOR_ID, name: '1F', elevation: 0, height })

type FloorsOf = Pick<Plan, 'floors'> & Partial<Pick<Plan, 'region'>>
interface OnFloor {
  floor?: string
}

/** 户型的楼层表（从低到高）；单层户型给出隐含的 1F */
export function planFloors(p: FloorsOf): Floor[] {
  return p.floors?.length ? p.floors : [baseFloor(regionFloorH(p.region))]
}

export const isMultiFloor = (p: FloorsOf) => (p.floors?.length ?? 0) > 1
export const baseFloorId = (p: FloorsOf) => planFloors(p)[0].id

/** 物件所在楼层 id（不填 = 最底层） */
export const floorOf = (p: FloorsOf, x: OnFloor) => x.floor ?? baseFloorId(p)

export const floorById = (p: FloorsOf, id: string) => planFloors(p).find((f) => f.id === id)

/** 某层的层高（墙满高）；找不到这层就按最底层 */
export const floorHeight = (p: FloorsOf, id?: string) => (id ? floorById(p, id) : undefined)?.height ?? planFloors(p)[0].height

/** 某层的上一层 / 下一层（按 elevation） */
export function floorAbove(p: FloorsOf, id: string): Floor | undefined {
  const fs = planFloors(p)
  const i = fs.findIndex((f) => f.id === id)
  return i >= 0 ? fs[i + 1] : undefined
}
export function floorBelow(p: FloorsOf, id: string): Floor | undefined {
  const fs = planFloors(p)
  const i = fs.findIndex((f) => f.id === id)
  return i > 0 ? fs[i - 1] : undefined
}

export const floorElevation = (p: FloorsOf, id: string) => floorById(p, id)?.elevation ?? 0

/** 门窗所在楼层：跟着所在房间 */
export function openingFloor(p: Pick<Plan, 'floors' | 'rooms'>, o: { roomId: string; floor?: string }) {
  const r = p.rooms.find((x) => x.id === o.roomId)
  return r ? floorOf(p, r) : floorOf(p, o)
}

/** 给物件打上楼层标记：最底层不写字段（和单层户型、旧存档一致） */
export function stampFloor<T extends OnFloor>(p: FloorsOf, x: T, id: string): T {
  if (!isMultiFloor(p) || id === baseFloorId(p)) delete x.floor
  else x.floor = id
  return x
}

/**
 * 某一层的子户型：rooms / openings / fixtures / furniture 只留这一层的，其余字段（墙厚、地区、住户、楼层表…）照抄。
 * 单层户型直接返回原户型（引用相同）。
 */
export function floorView(p: Plan, id: string): Plan {
  if (!isMultiFloor(p)) return id === baseFloorId(p) ? p : { ...p, rooms: [], openings: [], fixtures: [], furniture: [] }
  const base = baseFloorId(p)
  const on = (x: OnFloor) => (x.floor ?? base) === id
  const rooms = p.rooms.filter(on)
  const ids = new Set(rooms.map((r) => r.id))
  return { ...p, rooms, openings: p.openings.filter((o) => ids.has(o.roomId)), fixtures: p.fixtures.filter(on), furniture: p.furniture.filter(on) }
}

/** 每一层的子户型（从低到高） */
export const floorViews = (p: Plan) => planFloors(p).map((f) => ({ floor: f, view: floorView(p, f.id) }))

/**
 * 把按层分别算出来的家具合回一份：每件打上所在楼层。fn 拿到一层的子户型，返回这一层的家具。
 * 一键布置、检查清单补漏都按层跑（每层当作独立户型）。
 */
export function perFloorFurniture(p: Plan, fn: (view: Plan, floor: Floor) => Plan['furniture']): Plan['furniture'] {
  if (!isMultiFloor(p)) return fn(p, planFloors(p)[0])
  return floorViews(p).flatMap(({ floor, view }) => fn(view, floor).map((f) => stampFloor(p, f, floor.id)))
}

// ---------- 外轮廓 ----------

const key = (v: Vec) => `${Math.round(v.x)},${Math.round(v.y)}`

/**
 * 一层的外轮廓：户内房间（阳台、挑空不算）外墙段首尾相接成的闭合多边形，取面积最大的一圈；
 * 共线的点合并掉。接不成环（房间没对齐）时退化成户内房间的包围盒。没有户内房间返回 null。
 */
export function floorOutline(rooms: Room[]): Vec[] | null {
  const indoor = rooms.filter((r) => r.kind !== 'balcony' && r.kind !== 'void')
  if (!indoor.length) return null
  const segs = wallSegments(indoor).filter((s) => s.kind === 'outer' && dist(s.a, s.b) > 0.5)
  const adj = new Map<string, { p: Vec; to: string[] }>()
  const node = (v: Vec) => {
    const k = key(v)
    let n = adj.get(k)
    if (!n) adj.set(k, (n = { p: { x: Math.round(v.x), y: Math.round(v.y) }, to: [] }))
    return k
  }
  for (const s of segs) {
    const a = node(s.a)
    const b = node(s.b)
    if (a === b) continue
    adj.get(a)!.to.push(b)
    adj.get(b)!.to.push(a)
  }
  const used = new Set<string>()
  const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  let best: Vec[] | null = null
  for (const [start, n0] of adj) {
    for (const first of n0.to) {
      if (used.has(ekey(start, first))) continue
      const loop: string[] = [start]
      let prev = start
      let cur = first
      used.add(ekey(start, first))
      let ok = false
      for (let guard = 0; guard < 4000; guard++) {
        if (cur === start) {
          ok = true
          break
        }
        loop.push(cur)
        const nx = adj.get(cur)!.to.find((t) => t !== prev && !used.has(ekey(cur, t))) ?? (adj.get(cur)!.to.includes(start) && prev !== start ? start : undefined)
        if (!nx) break
        used.add(ekey(cur, nx))
        prev = cur
        cur = nx
      }
      if (!ok || loop.length < 3) continue
      const pts = simplify(loop.map((k) => adj.get(k)!.p))
      if (pts.length >= 3 && (!best || area(pts) > area(best))) best = pts
    }
  }
  if (best && signedArea(best) < 0) best.reverse()
  if (best) return best
  const b = bbox(indoor.flatMap((r) => r.points))
  return rectPoints(b.x0, b.y0, b.x1, b.y1)
}

/** 去掉共线的中间点 */
function simplify(pts: Vec[]): Vec[] {
  const out = [...pts]
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]
      const b = out[i]
      const c = out[(i + 1) % out.length]
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
      if (Math.abs(cross) < 1e-6 || dist(a, b) < 0.5) {
        out.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return out
}

// ---------- 楼层表的整理（读档 / 增删楼层） ----------

const finite = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/**
 * 读档时整理楼层：坏数据丢掉，按 elevation 排序，id 去重；只剩一层（或没有）时删掉 floors，所有物件回到单层的样子。
 * 物件的 floor 指向不存在的楼层、或就是最底层时删掉字段；门窗的 floor 同步成所在房间的楼层。
 */
export function normalizeFloors(p: Plan) {
  let fs: Floor[] = []
  if (Array.isArray(p.floors)) {
    const seen = new Set<string>()
    for (const f of p.floors as unknown[]) {
      if (!f || typeof f !== 'object') continue
      const o = f as Record<string, unknown>
      const id = typeof o.id === 'string' && o.id ? o.id : ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      fs.push({ id, name: typeof o.name === 'string' ? o.name : id.toUpperCase(), elevation: finite(o.elevation, 0), height: Math.min(600, Math.max(150, finite(o.height, DEFAULT_FLOOR_H))) })
    }
    fs.sort((a, b) => a.elevation - b.elevation)
  }
  if (fs.length <= 1) {
    delete p.floors
    fs = []
  } else p.floors = fs
  const ids = new Set(fs.map((f) => f.id))
  const base = fs[0]?.id
  const tidy = (x: OnFloor) => {
    if (x.floor === undefined) return
    if (!ids.has(x.floor) || x.floor === base) delete x.floor
  }
  p.rooms.forEach(tidy)
  p.fixtures.forEach(tidy)
  p.furniture.forEach(tidy)
  const roomFloor = new Map(p.rooms.map((r) => [r.id, r.floor]))
  for (const o of p.openings) {
    const f = roomFloor.get(o.roomId)
    if (f) o.floor = f
    else delete o.floor
  }
}

/** 新楼层的 id：nF（n 取第一个没用过的） */
export function nextFloorId(p: FloorsOf) {
  const used = new Set(planFloors(p).map((f) => f.id))
  for (let n = 2; ; n++) if (!used.has(`${n}f`)) return `${n}f`
}

/** 两层之间的高度差（楼梯要爬的高度）：上一层地面 - 本层地面；没有上一层时按本层墙高 + 楼板 */
export function riseOf(p: FloorsOf, id: string) {
  const f = floorById(p, id) ?? planFloors(p)[0]
  const up = floorAbove(p, id)
  return up ? Math.max(60, up.elevation - f.elevation) : f.height + SLAB
}
