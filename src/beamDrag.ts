// 拖手柄调内收柱（梁）：3D 沙盘、平面图共用的几何和换算。
// 手柄：两端改长（另一端不动）、正面改深、底面改下垂高度、梁身沿墙挪位置。

import { add, edgeInfo, mul, type Room, type WallBeam } from './model'
import { BEAM_MAX_H, BEAM_MIN, clampBeam } from './wallFace'

export type BeamGrip = 'start' | 'end' | 'front' | 'bottom' | 'move'
/** 有圆点手柄的几个（梁身靠直接按住拖） */
export const BEAM_GRIPS = ['start', 'end', 'front', 'bottom'] as const
/** 端头离墙端这么近就吸到墙端（cm） */
const END_SNAP = 5

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * 从拖动开始时的梁 s 出发，手柄沿它的方向挪了 delta（cm；start / end / move 沿墙方向，front 朝室内，bottom 朝上）后的梁。
 * L 墙长、maxH 梁最多垂多少（墙高 - 1），step 尺寸取整（1 或 5 cm）
 */
export function dragBeam(s: WallBeam, grip: BeamGrip, delta: number, L: number, maxH: number, step = 1): WallBeam {
  const r = (v: number) => Math.round(v / step) * step
  const toEnds = (v: number) => (v < END_SNAP ? 0 : L - v < END_SNAP ? L : v)
  const a0 = s.offset - s.w / 2
  const a1 = s.offset + s.w / 2
  const n = { ...s }
  if (grip === 'move') {
    let lo = clamp(r(a0 + delta), 0, Math.max(0, L - s.w))
    if (lo < END_SNAP) lo = 0
    if (L - s.w - lo < END_SNAP) lo = Math.max(0, L - s.w)
    n.offset = lo + s.w / 2
  } else if (grip === 'start') {
    const lo = clamp(toEnds(r(a0 + delta)), 0, a1 - BEAM_MIN)
    n.w = a1 - lo
    n.offset = (lo + a1) / 2
  } else if (grip === 'end') {
    const hi = clamp(toEnds(r(a1 + delta)), a0 + BEAM_MIN, L)
    n.w = hi - a0
    n.offset = (a0 + hi) / 2
  } else if (grip === 'front') n.d = Math.max(BEAM_MIN, r(s.d + delta))
  else n.h = clamp(r(s.h - delta), BEAM_MIN, Math.min(BEAM_MAX_H, maxH))
  return clampBeam(n, L)
}

/** 三维点（x、z 是平面坐标，y 是离地高度） */
export interface P3 {
  x: number
  y: number
  z: number
}

/**
 * 梁在房间（楼层组）局部坐标里的几何：face 墙面离边中线的距离（半个墙厚），top 梁顶高度（墙顶）。
 * 返回各手柄的位置、拖动方向（单位向量），以及包围盒的中心、尺寸、朝向（同 house.ts 里梁的网格）
 */
export function beamFrame(room: Room, edge: number, beam: WallBeam, face: number, top: number) {
  const e = edgeInfo(room.points, edge)
  const inward = mul(e.out, -1)
  const h = Math.min(beam.h, top - 1)
  const at = (along: number, k: number, y: number): P3 => {
    const p = add(add(e.a, mul(e.dir, along)), mul(inward, k))
    return { x: p.x, y, z: p.y }
  }
  const midK = face + beam.d / 2
  const midY = top - h / 2
  // 正面、底面的手柄沿梁错开：从正上方 / 正前方看时两个不叠在一起
  const grips: Record<Exclude<BeamGrip, 'move'>, P3> = {
    start: at(beam.offset - beam.w / 2, midK, midY),
    end: at(beam.offset + beam.w / 2, midK, midY),
    front: at(beam.offset - beam.w * 0.2, face + beam.d, midY),
    bottom: at(beam.offset + beam.w * 0.2, midK, top - h),
  }
  const axes: Record<BeamGrip, P3> = {
    start: { x: e.dir.x, y: 0, z: e.dir.y },
    end: { x: e.dir.x, y: 0, z: e.dir.y },
    move: { x: e.dir.x, y: 0, z: e.dir.y },
    front: { x: inward.x, y: 0, z: inward.y },
    bottom: { x: 0, y: 1, z: 0 },
  }
  return { grips, axes, center: at(beam.offset, midK, midY), size: { w: beam.w, h, d: beam.d }, rotY: Math.atan2(-e.dir.y, e.dir.x), length: e.length }
}

const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z
const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

/**
 * 射线（起点 o、单位方向 d）离直线（过 p、单位方向 u）最近处在直线上的参数；射线和直线几乎平行时返回 null。
 * 拖手柄时用它把指针换算成沿拖动方向挪了多少
 */
export function axisParam(o: P3, d: P3, p: P3, u: P3) {
  const b = dot(u, d)
  const den = 1 - b * b
  if (den < 1e-4) return null
  const w = sub(p, o)
  return (b * dot(d, w) - dot(u, w)) / den
}
