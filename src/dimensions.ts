// 设计图的标注数据（纯数据，不依赖 three）：外墙尺寸线、楼面标高、房间名与面积。
// 3D 设计图（three/blueprint.ts）按它画尺寸线和文字；测试直接检查这里的数值。
//
// 约定：
// - 尺寸按墙中心线（芯々）量：户型坐标本身就是中心线，外包总长 = 中心线包围盒的长宽，和沙盘面板里的「户型尺寸」一致。
// - 每层四条边各一组：第一道（内侧）是外轮廓转角之间的分段尺寸，第二道（外侧）是总长；
//   外轮廓只有两个转角落在这条边的方向上（矩形的边）时分段就是总长，只出总长一道。
// - 尺寸线放在外墙外皮外侧，距离按户型大小取（大户型拉得远一点）。
// - 标高相对最底层地面：±0、+2,700…；最上面一层再标墙顶。

import { area, bbox, edgesOf, labelPointAvoiding, signedArea, type Box, type Plan, type Region, type Room, type Vec } from './model'
import { floorAbove, floorOutline, floorView, planFloors, riseOf } from './floors'

/** 尺寸单位：毫米（日式 / 中式图纸的习惯）或厘米 */
export type DimUnit = 'mm' | 'cm'

/** 地区默认单位：欧美户型用厘米，其余用毫米 */
export const unitFor = (region: Region | undefined): DimUnit => (region === 'west' ? 'cm' : 'mm')

/** 千分位：3640 → 3,640 */
const group = (n: number) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 尺寸数值（输入 cm）：mm 取整到 1mm 并带千分位，cm 取整到 1cm */
export function fmtDim(cm: number, unit: DimUnit) {
  return unit === 'mm' ? group(Math.round(cm * 10)) : group(Math.round(cm))
}

/** 标高（输入 cm，相对最底层地面）：±0、+2,700、−300 */
export function fmtLevel(cm: number, unit: DimUnit) {
  const v = unit === 'mm' ? Math.round(cm * 10) : Math.round(cm)
  if (v === 0) return '±0'
  return (v > 0 ? '+' : '−') + group(v)
}

/** 平面图上的四条边：x0 = 左（x 最小）、x1 = 右、y0 = 上（平面 y 最小）、y1 = 下 */
export type Side = 'x0' | 'x1' | 'y0' | 'y1'
export const SIDES: Side[] = ['x0', 'x1', 'y0', 'y1']
/** 边的外法线（平面坐标） */
export const SIDE_NORMAL: Record<Side, Vec> = { x0: { x: -1, y: 0 }, x1: { x: 1, y: 0 }, y0: { x: 0, y: -1 }, y1: { x: 0, y: 1 } }

/** 一条尺寸：a / b 是尺寸线两端（已经放到外墙外侧），fromA / fromB 是尺寸界线的起点（建筑那一头） */
export interface DimLine {
  side: Side
  /** 0 = 分段（内侧），1 = 总长（外侧） */
  tier: 0 | 1
  a: Vec
  b: Vec
  fromA: Vec
  fromB: Vec
  /** 量出来的长度（cm） */
  value: number
}

export interface RoomTag {
  id: string
  name: string
  kind: Room['kind']
  /** 面积（cm²，按中心线多边形） */
  area: number
  /** 文字的锚点（平面坐标） */
  at: Vec
}

export interface FloorAnno {
  floorId: string
  name: string
  /** 楼面标高（相对最底层地面，cm） */
  level: number
  /** 这一层的地面到上一层地面（最上层 = 墙高），竖向尺寸用 */
  rise: number
  /** 墙高 */
  height: number
  /** 外轮廓（中心线），没有户内房间时为 null */
  outline: Vec[] | null
  /** 外墙外皮（外轮廓外扩半个外墙厚） */
  face: Vec[] | null
  /** 中心线包围盒（尺寸的总长按它） */
  box: Box | null
  dims: DimLine[]
  rooms: RoomTag[]
}

/** 尺寸线离外墙外皮的距离：第一道、两道之间（按户型大小取，cm） */
export function dimOffsets(size: number) {
  const first = Math.min(110, Math.max(55, size * 0.07))
  const step = Math.min(80, Math.max(40, size * 0.05))
  return { first, step }
}

/** 多边形各边沿外法线平移 d（直角外轮廓外扩半个墙厚；斜边按两边交点） */
export function offsetOutline(pts: Vec[], d: number): Vec[] {
  const es = edgesOf(pts)
  const n = es.length
  return es.map((q, i) => {
    const p = es[(i + n - 1) % n]
    const pa = { x: p.a.x + p.out.x * d, y: p.a.y + p.out.y * d }
    const qa = { x: q.a.x + q.out.x * d, y: q.a.y + q.out.y * d }
    const den = p.dir.x * q.dir.y - p.dir.y * q.dir.x
    if (Math.abs(den) < 1e-6) return qa
    const t = ((qa.x - pa.x) * q.dir.y - (qa.y - pa.y) * q.dir.x) / den
    return { x: pa.x + p.dir.x * t, y: pa.y + p.dir.y * t }
  })
}

/** 排序去重（相差不到 tol 的合成一个） */
function uniq(xs: number[], tol = 2) {
  const s = [...xs].sort((a, b) => a - b)
  const out: number[] = []
  for (const x of s) if (!out.length || x - out[out.length - 1] > tol) out.push(x)
  return out
}

/**
 * 一层外轮廓的尺寸线。outline 是中心线外轮廓，wallOuter 外墙厚。
 * 分段的分点 = 外轮廓所有转角在这条边方向上的投影；尺寸界线从离这条边最近的那个转角（外皮）引出。
 */
export function outlineDims(outline: Vec[], wallOuter: number): DimLine[] {
  const b = bbox(outline)
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0)
  const { first, step } = dimOffsets(size)
  const half = wallOuter / 2
  /** 尺寸界线离外皮留的空隙 */
  const gap = 12
  const out: DimLine[] = []
  for (const side of SIDES) {
    const alongX = side === 'y0' || side === 'y1'
    const sign = side === 'x1' || side === 'y1' ? 1 : -1
    // 这条边的外皮位置（沿法线的坐标）
    const faceAt = (alongX ? (sign > 0 ? b.y1 : b.y0) : sign > 0 ? b.x1 : b.x0) + sign * half
    const ticks = uniq(outline.map((p) => (alongX ? p.x : p.y)))
    /** 位置 u 上离这条边最近的转角（法线坐标），外推半个墙厚 + 空隙 */
    const nearest = (u: number) => {
      const vs = outline.filter((p) => Math.abs((alongX ? p.x : p.y) - u) <= 2).map((p) => (alongX ? p.y : p.x))
      const v = vs.length ? (sign > 0 ? Math.max(...vs) : Math.min(...vs)) : faceAt - sign * half
      return v + sign * (half + gap)
    }
    const pt = (u: number, v: number): Vec => (alongX ? { x: u, y: v } : { x: v, y: u })
    const tiers: number[][] = []
    if (ticks.length > 2) tiers.push(ticks)
    tiers.push([ticks[0], ticks[ticks.length - 1]])
    tiers.forEach((ts, k) => {
      const tier = (ticks.length > 2 ? k : 1) as 0 | 1
      const line = faceAt + sign * (first + (tier === 1 && ticks.length > 2 ? step : 0))
      for (let i = 0; i + 1 < ts.length; i++) {
        const u0 = ts[i]
        const u1 = ts[i + 1]
        out.push({ side, tier, a: pt(u0, line), b: pt(u1, line), fromA: pt(u0, nearest(u0)), fromB: pt(u1, nearest(u1)), value: u1 - u0 })
      }
    })
  }
  return out
}

/**
 * 整个户型每层的标注。avoid：某层的文字要避开的矩形（家具占地），房间名放在空地上。
 */
export function floorAnnotations(plan: Plan, avoid?: (floorId: string) => Box[]): FloorAnno[] {
  const fs = planFloors(plan)
  const base = fs[0].elevation
  return fs.map((f) => {
    const view = floorView(plan, f.id)
    const outline = floorOutline(view.rooms)
    const face = outline ? offsetOutline(outline, plan.wallOuter / 2) : null
    const boxes = avoid?.(f.id) ?? []
    const rooms: RoomTag[] = view.rooms
      .filter((r) => r.kind !== 'void' && r.points.length >= 3 && Math.abs(signedArea(r.points)) > 1)
      .map((r) => ({ id: r.id, name: r.name, kind: r.kind, area: area(r.points), at: labelPointAvoiding(r.points, boxes) }))
    return {
      floorId: f.id,
      name: f.name,
      level: f.elevation - base,
      rise: floorAbove(plan, f.id) ? riseOf(plan, f.id) : f.height,
      height: f.height,
      outline,
      face,
      box: outline ? bbox(outline) : null,
      dims: outline ? outlineDims(outline, plan.wallOuter) : [],
      rooms,
    }
  })
}

/** 最上面一层的墙顶标高（相对最底层地面，cm） */
export function topLevel(plan: Plan) {
  const fs = planFloors(plan)
  const top = fs[fs.length - 1]
  return top.elevation + top.height - fs[0].elevation
}
