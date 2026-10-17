// 家具吸附：拖动 / 放置时，边缘贴墙面，或和其他家具、设备的边线、中线对齐。

import { ASSET_MAP } from './three/assets'
import { bbox, edgesOf, fixtureBox, isAxisEdge, mul, add, rotFacingWall, type Box, type Fixture, type Plan, type Vec } from './model'
import { floorOf, riseOf } from './floors'
import { stairUnderZone, underZonePoly } from './stairs'
import { wallThicknessAt } from './walls'
import { roomAt } from './three/house'

/** 吸附参考线：axis = 'x' 表示竖线 x = v（沿 y 从 a 到 b） */
export interface Guide {
  axis: 'x' | 'y'
  v: number
  a: number
  b: number
  wall: boolean
}

const WALL_T = 18
const ALIGN_T = 8
const NEAR = 300

/** 旋转后的占地包围盒 */
export function furnitureBox(asset: string, x: number, y: number, rot: number): Box {
  const def = ASSET_MAP.get(asset)
  const w = def?.w ?? 40
  const d = def?.d ?? 40
  const a = (rot * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  const hw = (w * c + d * s) / 2
  const hh = (w * s + d * c) / 2
  return { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh }
}

interface Cand {
  delta: number
  score: number
  guide: Guide
}

export function snapFurniture(plan: Plan, selfId: string | null, asset: string, x: number, y: number, rot: number) {
  const me = furnitureBox(asset, x, y, rot)
  const best: { x?: Cand; y?: Cand } = {}
  const offer = (axis: 'x' | 'y', c: Cand) => {
    const cur = best[axis]
    if (!cur || c.score < cur.score) best[axis] = c
  }

  // 1. 墙面：所在房间的轴向边，往里收半个墙厚就是墙面
  const room = roomAt(plan, { x, y })
  if (room) {
    for (const e of edgesOf(room.points)) {
      if (!isAxisEdge(e)) continue
      const mid = mul(add(e.a, e.b), 0.5)
      const face = add(e.a, mul(e.out, -wallThicknessAt(plan, mid, e.out, room) / 2))
      if (Math.abs(e.dir.y) > 0.5) {
        // 竖墙：x = face.x
        const lo = Math.min(e.a.y, e.b.y)
        const hi = Math.max(e.a.y, e.b.y)
        if (me.y1 < lo || me.y0 > hi) continue
        const edge = e.out.x > 0 ? me.x1 : me.x0
        const delta = face.x - edge
        if (Math.abs(delta) < WALL_T) offer('x', { delta, score: Math.abs(delta) * 0.5, guide: { axis: 'x', v: face.x, a: me.y0, b: me.y1, wall: true } })
      } else {
        const lo = Math.min(e.a.x, e.b.x)
        const hi = Math.max(e.a.x, e.b.x)
        if (me.x1 < lo || me.x0 > hi) continue
        const edge = e.out.y > 0 ? me.y1 : me.y0
        const delta = face.y - edge
        if (Math.abs(delta) < WALL_T) offer('y', { delta, score: Math.abs(delta) * 0.5, guide: { axis: 'y', v: face.y, a: me.x0, b: me.x1, wall: true } })
      }
    }
  }

  // 2. 其他家具和设备：边对边、贴边、中线
  const others: Box[] = [
    // 只和地上的家具对齐：桌上的摆件、壁挂的不算
    ...plan.furniture.filter((f) => f.id !== selfId && !f.z && ASSET_MAP.has(f.asset) && !ASSET_MAP.get(f.asset)!.mount).map((f) => furnitureBox(f.asset, f.x, f.y, f.rot)),
    ...plan.fixtures.map(fixtureBox),
  ]
  for (const o of others) {
    const ox = (o.x0 + o.x1) / 2
    const oy = (o.y0 + o.y1) / 2
    if (Math.abs(ox - x) > NEAR || Math.abs(oy - y) > NEAR) continue
    const mx = (me.x0 + me.x1) / 2
    const my = (me.y0 + me.y1) / 2
    const pairsX: [number, number][] = [
      [me.x0, o.x0],
      [me.x1, o.x1],
      [me.x0, o.x1],
      [me.x1, o.x0],
      [mx, ox],
    ]
    for (const [m, t] of pairsX) {
      const delta = t - m
      if (Math.abs(delta) < ALIGN_T)
        offer('x', { delta, score: Math.abs(delta), guide: { axis: 'x', v: t, a: Math.min(me.y0, o.y0), b: Math.max(me.y1, o.y1), wall: false } })
    }
    const pairsY: [number, number][] = [
      [me.y0, o.y0],
      [me.y1, o.y1],
      [me.y0, o.y1],
      [me.y1, o.y0],
      [my, oy],
    ]
    for (const [m, t] of pairsY) {
      const delta = t - m
      if (Math.abs(delta) < ALIGN_T)
        offer('y', { delta, score: Math.abs(delta), guide: { axis: 'y', v: t, a: Math.min(me.x0, o.x0), b: Math.max(me.x1, o.x1), wall: false } })
    }
  }

  const grid = (v: number) => Math.round(v / 5) * 5
  const p: Vec = {
    x: best.x ? x + best.x.delta : grid(x),
    y: best.y ? y + best.y.delta : grid(y),
  }
  // 参考线的范围按吸附后的位置修正
  const guides = [best.x, best.y].filter((c): c is Cand => !!c).map((c) => c.guide)
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, guides }
}

/**
 * 壁挂物贴墙：找鼠标所在房间里最近的一面墙，背面贴墙面、朝向房间内，沿墙滑动时不超出墙段。
 * 壁挂物不能浮空，所以总是吸到墙上（Alt 也不例外）。没有房间时返回 null。
 */
export function snapToWall(plan: Plan, asset: string, x: number, y: number) {
  const def = ASSET_MAP.get(asset)
  const room = roomAt(plan, { x, y })
  if (!def || !room) return null
  let best: { x: number; y: number; rot: number; d: number; guide: Guide } | null = null
  for (const e of edgesOf(room.points)) {
    if (!isAxisEdge(e)) continue
    const mid = mul(add(e.a, e.b), 0.5)
    const half = wallThicknessAt(plan, mid, e.out, room) / 2
    // 沿墙方向的位置，留出半个宽度不伸进墙角
    const along = (x - e.a.x) * e.dir.x + (y - e.a.y) * e.dir.y
    const lo = Math.min(def.w / 2 + half, e.length / 2)
    const t = Math.max(lo, Math.min(e.length - lo, along))
    const onWall = add(e.a, mul(e.dir, t))
    const dist = Math.hypot(x - onWall.x, y - onWall.y)
    if (best && dist >= best.d) continue
    const c = add(onWall, mul(e.out, -(half + def.d / 2)))
    const horiz = Math.abs(e.dir.x) > 0.5
    best = {
      x: Math.round(c.x),
      y: Math.round(c.y),
      rot: rotFacingWall(e.out),
      d: dist,
      guide: horiz
        ? { axis: 'y', v: onWall.y + e.out.y * -half, a: c.x - def.w / 2, b: c.x + def.w / 2, wall: true }
        : { axis: 'x', v: onWall.x + e.out.x * -half, a: c.y - def.w / 2, b: c.y + def.w / 2, wall: true },
    }
  }
  return best && { x: best.x, y: best.y, rot: best.rot, guides: [best.guide] }
}

/**
 * 地上的家具是否和别的家具 / 设备重叠（穿模提示用）。
 * 不算：桌上的东西（z > 0）、壁挂物、地毯这类很薄的东西、selfId 自己。
 */
export function overlapsOthers(plan: Plan, selfId: string | null, asset: string, x: number, y: number, rot: number) {
  const def = ASSET_MAP.get(asset)
  if (!def || def.mount || def.h <= 3) return false
  const me = shrink(furnitureBox(asset, x, y, rot), 2)
  // 洗衣机上方置物架本来就跨在洗衣机 / 干衣机上
  const straddle = (x?: string, y?: string) => (x === 'washer-rack' && (y === 'washer' || y === 'dryer')) || (y === 'washer-rack' && (x === 'washer' || x === 'dryer'))
  const solid = (id: string, a: string, z?: number) => {
    const d = ASSET_MAP.get(a)
    return id !== selfId && !z && !!d && !d.mount && d.h > 3 && !straddle(def.type, d.type)
  }
  if (plan.furniture.some((f) => solid(f.id, f.asset, f.z) && boxHit(me, shrink(furnitureBox(f.asset, f.x, f.y, f.rot), 2)))) return true
  // 冰箱位 / 洗衣机位 / 收纳位只是预留的空间，冰箱、洗衣机、柜子（以及别的家具）可以放在上面
  return plan.fixtures.some((f) => f.kind !== 'outdoor' && f.kind !== 'fridge' && f.kind !== 'washer' && f.kind !== 'builtin' && boxHit(me, fixtureBox(f)) && !underStairs(plan, f, me, def.h))
}

/** 楼梯下敞开的储物角里放得下的东西（整块在储物角里、不高于它）不算撞到楼梯 */
function underStairs(plan: Plan, f: Fixture, me: Box, h: number) {
  if (f.kind !== 'stairs' || f.under !== 'open' || f.id.endsWith('~hole')) return false
  const z = stairUnderZone(f, riseOf(plan, floorOf(plan, f)))
  if (!z || h > z.clear) return false
  const b = bbox(underZonePoly(f, z))
  return me.x0 >= b.x0 - 1 && me.x1 <= b.x1 + 1 && me.y0 >= b.y0 - 1 && me.y1 <= b.y1 + 1
}

const shrink = (b: Box, k: number): Box => ({ x0: b.x0 + k, y0: b.y0 + k, x1: b.x1 - k, y1: b.y1 - k })
const boxHit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
