// 拖手柄调家具宽深（3D 沙盘的选中框、平面图的选中家具共用）：左右两侧的手柄改宽（以中心为准，两边一起动），
// 正面的手柄改深（背面不动）。拖动时只预览，松手才 resizeFurniture 记一次撤销。
import type { Furniture, Vec } from './model'
import type { SizeRange } from './three/resize'

/** 手柄：左 / 右改宽，前改深（家具局部 -x / +x / +z，正面朝 +z） */
export type ResizeSide = 'left' | 'right' | 'front'
export const RESIZE_SIDES: readonly ResizeSide[] = ['left', 'right', 'front']

/** 按住 Shift 时的吸附步长（cm） */
export const RESIZE_SNAP = 5

export interface ResizeDrag {
  id: string
  side: ResizeSide
  /** 按下时的家具（位置、朝向）和尺寸 */
  f: Pick<Furniture, 'x' | 'y' | 'rot'>
  w0: number
  d0: number
  /** 按下的点（平面坐标） */
  at0: Vec
  range: SizeRange
}

/** 平面坐标的位移换到家具局部（x 向右、z 向前），同 surface.ts toWorld 的逆 */
export function toLocal(f: Pick<Furniture, 'rot'>, dx: number, dy: number) {
  const a = (f.rot * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: dx * c + dy * s, z: -dx * s + dy * c }
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

/** 指针拖到 at（平面坐标）时的新宽深：取整，snap 时按 RESIZE_SNAP 吸附，夹到可调范围里 */
export function dragSize(g: ResizeDrag, at: Vec, snap: boolean): { w: number; d: number } {
  const l = toLocal(g.f, at.x - g.at0.x, at.y - g.at0.y)
  const q = (v: number) => (snap ? Math.round(v / RESIZE_SNAP) * RESIZE_SNAP : Math.round(v))
  let w = g.w0
  let d = g.d0
  if (g.side === 'front') d = clamp(q(g.d0 + l.z), g.range.d)
  else w = clamp(q(g.w0 + 2 * (g.side === 'right' ? l.x : -l.x)), g.range.w)
  return { w, d }
}

/** 手柄在家具局部的位置（占地边缘往外让出 pad），w × d 是占地 */
export function handleLocal(side: ResizeSide, w: number, d: number, pad = 0) {
  if (side === 'front') return { x: 0, z: d / 2 + pad }
  return { x: (side === 'right' ? 1 : -1) * (w / 2 + pad), z: 0 }
}
