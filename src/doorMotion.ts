// 房门的开合几何：开门、推拉门、谷仓门、折叠门开到某个程度（0 = 关上，1 = 开到底）时各扇门板在哪。
// 3D（three/house.ts poseOpening）按它摆门扇，第一人称漫游（three/walk.ts）按它的门板线段挡人，两边同一份算法。
//
//   door    开门：门扇绕铰链转 0..90°
//   sliding 引き戸：靠起点一侧那扇（前轨）推到另一扇前面，另一扇不动
//   barn    谷仓门：整扇沿墙面上的明装轨道推开一整个门宽
//   folding 折れ戸：两扇对折，靠铰链一侧那扇绕铰链转、另一扇的末端沿轨道滑向铰链
//   window  通往阳台的落地窗（当门用）：推拉扇推到另一扇前面、平开扇往户外推开到 90°；固定窗等开不了的款式一直挡着
// 门板线段都是平面坐标，沿门板宽度方向（不计厚度）。

import { add, mul, type Opening, type Vec } from './model'
import { hasSidelight, sidelightWidth } from './doorStyles'

/** 求开合几何要的门洞信息（three/house.ts OpeningInfo 的一部分） */
export interface DoorGeom {
  o: Pick<Opening, 'id' | 'kind' | 'hinge' | 'swing' | 'doorStyle' | 'doorLites' | 'windowStyle'>
  center: Vec
  dir: Vec
  out: Vec
  width: number
  wall: number
  /** 窗：通往阳台的落地窗（three/house.ts OpeningInfo.sash），只有它当门用 */
  sash?: boolean
}

export type DoorMotionKind = 'door' | 'sliding' | 'barn' | 'folding' | 'window'

export function doorMotionKind(o: Pick<Opening, 'kind' | 'doorStyle'>, sash = false): DoorMotionKind | null {
  if (o.kind === 'door') return 'door'
  if (o.kind === 'sliding') return o.doorStyle === 'barn' ? 'barn' : 'sliding'
  if (o.kind === 'folding') return 'folding'
  if (o.kind === 'window' && sash) return 'window'
  return null
}

/** 落地窗的模型款式（three/windows.ts WindowModelStyle）：不填款式的是旧的落地推拉窗 */
export const sashStyle = (o: Pick<Opening, 'windowStyle'>) => o.windowStyle ?? 'legacySash'

/** 落地窗里能开合的款式（推拉、平开）；别的款式（固定窗等）开不了 */
export const windowMovable = (style: string) => style === 'legacySash' || style === 'sliding' || style === 'casement' || style === 'casement2' || style === 'combo'

/** 落地窗的平开扇开到底的角度 */
export const WIN_SWING_MAX = Math.PI / 2

/** 开门开到底的角度 */
export const SWING_MAX = Math.PI / 2
/** 折叠门折到底的角度（两扇差不多贴在一起） */
export const FOLD_MAX = (86 * Math.PI) / 180

/**
 * 没动过的门开着多少：开门半开（62°，看得出是门又不挡视线），推拉 / 谷仓 / 折叠门、落地窗开到底（人走得过去，同以前）
 */
export function defaultDoorOpen(o: Pick<Opening, 'kind' | 'doorStyle'>) {
  return doorMotionKind(o) === 'door' ? (62 * Math.PI) / 180 / SWING_MAX : 1
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** 开门：门扇组的原点（铰链处，往门洞里 0.5、往开启侧挪 2）、门扇方向（单位向量，铰链指向门扇另一端）、门扇宽 */
export function swingPose(g: DoorGeom, open: number) {
  const { o, center, dir, out, width: w } = g
  const hinge = add(center, mul(dir, ((o.hinge === 'start' ? -1 : 1) * w) / 2))
  const u = o.hinge === 'start' ? dir : mul(dir, -1)
  const sw = o.swing === 'in' ? mul(out, -1) : out
  const a = clamp01(open) * SWING_MAX
  const d = add(mul(u, Math.cos(a)), mul(sw, Math.sin(a)))
  // 带侧窗时门扇让出锁一侧的侧窗宽度（同 house.ts）
  const side = hasSidelight(o) ? sidelightWidth(w) : 0
  // 门扇两侧各留 0.5 的缝：从铰链往里 0.5 起，宽 w - 1（减去侧窗）
  return { origin: add(add(hinge, mul(u, 0.5)), mul(sw, 2)), d, leaf: w - 1 - side, side }
}

/** 推拉门的两扇：板宽、离墙中线的偏移（前轨 +，后轨 -）、两扇中心沿墙的位置（第一扇随开合动） */
export function slidingPose(g: DoorGeom, open: number) {
  const w = g.width
  const t = Math.max(2, g.wall / 4)
  return {
    pw: w / 2 + 2,
    off: [t / 2 + 0.5, -(t / 2 + 0.5)],
    along: [-w / 4 + (clamp01(open) * w) / 2, w / 4],
  }
}

/** 谷仓门：门板宽、门板中心离门洞中心沿墙推开多少、离墙中线（开向一侧）多远 */
export function barnPose(g: DoorGeom, open: number) {
  const w = g.width
  return { pw: w + 8, slide: clamp01(open) * w, off: g.wall / 2 + 3.6 / 2 + 1.5, face: g.o.swing === 'out' ? g.out : mul(g.out, -1) }
}

/** 折叠门两扇的端点：铰链 → 折角 → 滑动端 */
export function foldPose(g: DoorGeom, open: number): [Vec, Vec, Vec] {
  const { o, center, dir, out, width: w } = g
  const into = o.swing === 'in' ? mul(out, -1) : out
  const h = add(center, mul(dir, ((o.hinge === 'start' ? -1 : 1) * w) / 2))
  const v = o.hinge === 'start' ? dir : mul(dir, -1)
  const L = w / 2
  const a = clamp01(open) * FOLD_MAX
  const apex = add(h, add(mul(v, L * Math.cos(a)), mul(into, L * Math.sin(a))))
  return [h, apex, add(h, mul(v, 2 * L * Math.cos(a)))]
}

/** 开到 open 时挡路的门板线段（平面坐标）：门扇、推拉扇、折扇，以及开门旁固定的侧窗 */
export function doorSegments(g: DoorGeom, open: number): [Vec, Vec][] {
  const kind = doorMotionKind(g.o, g.sash)
  const { center, dir, out, width: w } = g
  if (kind === 'door') {
    const s = swingPose(g, open)
    const segs: [Vec, Vec][] = [[s.origin, add(s.origin, mul(s.d, s.leaf))]]
    if (s.side) {
      // 侧窗在门扇的另一端（锁一侧），固定在墙洞里
      const k = g.o.hinge === 'start' ? 1 : -1
      segs.push([add(center, mul(dir, (k * w) / 2)), add(center, mul(dir, k * (w / 2 - s.side)))])
    }
    return segs
  }
  if (kind === 'sliding') {
    const s = slidingPose(g, open)
    return [0, 1].map((k) => {
      const c = add(add(center, mul(dir, s.along[k])), mul(out, s.off[k]))
      return [add(c, mul(dir, -s.pw / 2)), add(c, mul(dir, s.pw / 2))] as [Vec, Vec]
    })
  }
  if (kind === 'barn') {
    const s = barnPose(g, open)
    const c = add(add(center, mul(s.face, s.off)), mul(dir, s.slide))
    return [[add(c, mul(dir, -s.pw / 2)), add(c, mul(dir, s.pw / 2))]]
  }
  if (kind === 'folding') {
    const [a, b, c] = foldPose(g, open)
    return [
      [a, b],
      [b, c],
    ]
  }
  if (kind === 'window') return windowSegments(g, open)
  return []
}

/** 落地窗挡路的扇（几何同 three/windows.ts windowModel：局部 x 沿墙、z 横穿墙，户外在 out 一侧） */
function windowSegments(g: DoorGeom, open: number): [Vec, Vec][] {
  const { center, dir, out, width: w, wall } = g
  const style = sashStyle(g.o)
  const n0 = { x: -dir.y, y: dir.x }
  const sgn = out.x * n0.x + out.y * n0.y >= 0 ? 1 : -1
  const P = (x: number, z: number) => add(add(center, mul(dir, x)), mul(n0, z))
  const v = clamp01(open)
  if (style === 'legacySash' || style === 'sliding') {
    const legacy = style === 'legacySash'
    const t = Math.max(2, wall / 4)
    const inner = legacy ? w : w - 8
    const pw = inner / 2 + 2
    const a0 = legacy ? -w / 4 : -inner / 4 + 1
    const a1 = legacy ? w / 4 : inner / 4 - 1
    return [a0 + (a1 - a0) * v, a1].map((along, k) => {
      const off = (k === 0 ? 1 : -1) * (t / 2 + 0.5) * sgn
      return [P(along - pw / 2, off), P(along + pw / 2, off)] as [Vec, Vec]
    })
  }
  if (style === 'casement' || style === 'casement2' || style === 'combo') {
    const inner = w - 8
    const z = sgn * (wall / 2 - 3.2 / 2)
    const a = v * WIN_SWING_MAX
    const leaves: { x0: number; x1: number; left: boolean }[] = []
    const segs: [Vec, Vec][] = []
    if (style === 'casement') leaves.push({ x0: -inner / 2, x1: inner / 2, left: g.o.hinge !== 'end' })
    else if (style === 'casement2') leaves.push({ x0: -inner / 2, x1: 0, left: true }, { x0: 0, x1: inner / 2, left: false })
    else {
      const side = Math.min(inner * 0.26, 60)
      leaves.push({ x0: -inner / 2, x1: -inner / 2 + side, left: true }, { x0: inner / 2 - side, x1: inner / 2, left: false })
      segs.push([P(-inner / 2 + side, 0), P(inner / 2 - side, 0)])
    }
    for (const L of leaves) {
      const lw = L.x1 - L.x0
      const hx = L.left ? L.x0 : L.x1
      segs.push([P(hx, z), P(hx + (L.left ? 1 : -1) * lw * Math.cos(a), z + sgn * lw * Math.sin(a))])
    }
    return segs
  }
  // 固定窗等开不了的款式：整个洞口挡着
  return [[P(-w / 2, 0), P(w / 2, 0)]]
}
