// 门窗卡片（3D 沙盘里点中门窗浮出的编辑卡片）里的宽度 / 位置微调：按所在墙边的长度夹住，没变化时不记撤销。
import { edgeInfo, type Opening, type OpeningKind, type Plan } from './model'

/** 洞口最窄（cm），同平面图检查器的输入下限 */
export const OPENING_MIN_W = 30
export const WIDTH_STEP = 10
export const OFFSET_STEP = 10

/** 洞口中心离边起点的距离夹在墙边内（洞口比墙边还宽时居中），同平面图拖动 */
export function clampOffset(offset: number, width: number, L: number) {
  if (L <= width) return L / 2
  return Math.max(width / 2, Math.min(L - width / 2, offset))
}

/** 洞口所在墙边的长度；房间或边没了返回 null */
export function openingEdgeLength(p: Pick<Plan, 'rooms'>, o: Pick<Opening, 'roomId' | 'edge'>): number | null {
  const r = p.rooms.find((x) => x.id === o.roomId)
  if (!r || o.edge >= r.points.length) return null
  return edgeInfo(r.points, o.edge).length
}

/**
 * 宽度 / 位置各挪 dw / doff（cm）后的新值：宽度夹在 [OPENING_MIN_W, 墙边长]，位置夹在墙边内。
 * 和现在一样（已经顶到头）返回 null，调用方就不记撤销。
 */
export function nudgedOpening(p: Pick<Plan, 'rooms'>, o: Pick<Opening, 'roomId' | 'edge' | 'width' | 'offset'>, dw: number, doff: number): { width: number; offset: number } | null {
  const L = openingEdgeLength(p, o)
  if (L === null) return null
  const width = Math.round(Math.max(Math.min(OPENING_MIN_W, L), Math.min(L, o.width + dw)))
  const offset = Math.round(clampOffset(o.offset + doff, width, L))
  if (width === o.width && Math.abs(offset - o.offset) < 0.5) return null
  return { width, offset }
}

/** 各类门窗的常用宽度（cm）：单开门、推拉门、折叠门、窗（检查器 / 门窗卡片里点一下就换） */
export const WIDTH_PRESETS: Record<OpeningKind, number[]> = {
  door: [70, 80, 90, 120],
  sliding: [80, 120, 160, 180],
  folding: [60, 80, 120, 160],
  window: [60, 90, 120, 165, 180],
}

/**
 * 改成宽 width 后的宽度和位置：中心尽量不动，宽度夹在 [OPENING_MIN_W, 墙边长]，位置夹在墙边内。
 * 和现在一样返回 null（调用方不记撤销）
 */
export function resizedOpening(p: Pick<Plan, 'rooms'>, o: Pick<Opening, 'roomId' | 'edge' | 'width' | 'offset'>, width: number): { width: number; offset: number } | null {
  const L = openingEdgeLength(p, o)
  if (L === null) return null
  const w = Math.round(Math.max(Math.min(OPENING_MIN_W, L), Math.min(L, width)))
  const offset = Math.round(clampOffset(o.offset, w, L))
  if (w === o.width && Math.abs(offset - o.offset) < 0.5) return null
  return { width: w, offset }
}

/**
 * 拖洞口的一端改宽度：另一端（fixed，离边起点的距离）不动，拖到 t（离边起点的距离，已吸附）。
 * 宽度不小于 OPENING_MIN_W、不超出墙边
 */
export function openingFromEnds(fixed: number, t: number, L: number): { width: number; offset: number } {
  const lo = Math.max(0, Math.min(fixed, t))
  const hi = Math.min(L, Math.max(fixed, t))
  let width = hi - lo
  if (width < OPENING_MIN_W) {
    width = Math.min(OPENING_MIN_W, L)
    const start = t < fixed ? fixed - width : fixed
    return { width, offset: Math.max(width / 2, Math.min(L - width / 2, start + width / 2)) }
  }
  return { width, offset: (lo + hi) / 2 }
}
