// 房门的开合几何：开门、推拉门、谷仓门、折叠门开到某个程度（0 = 关上，1 = 开到底）时各扇门板在哪。
// 3D（three/house.ts poseOpening）按它摆门扇，第一人称漫游（three/walk.ts）按它的门板线段挡人，两边同一份算法。
//
//   door    开门：门扇绕铰链转 0..90°
//   sliding 引き戸：两扇各自推拉（门扇 0 = 前轨、靠起点一侧，往终点推；门扇 1 = 后轨、靠终点一侧，往起点推）
//   barn    谷仓门：整扇沿墙面上的明装轨道推开一整个门宽
//   folding 折れ戸：两扇对折，靠铰链一侧那扇绕铰链转、另一扇的末端沿轨道滑向铰链
//   window  通往阳台的落地窗（当门用）：两扇推拉扇各自推到另一扇那边、平开扇往户外推开到 90°；固定窗等开不了的款式一直挡着
// 门板线段都是平面坐标，沿门板宽度方向（不计厚度）。
// 推拉的两扇分开开合：open 是门扇 0（和别的门一样的那个开合），back 是门扇 1（后轨那扇，没动过时关着）。

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

type DoorMotionKind = 'door' | 'sliding' | 'barn' | 'folding' | 'window'

function doorMotionKind(o: Pick<Opening, 'kind' | 'doorStyle'>, sash = false): DoorMotionKind | null {
  if (o.kind === 'door') return 'door'
  if (o.kind === 'sliding') return o.doorStyle === 'barn' ? 'barn' : 'sliding'
  if (o.kind === 'folding') return 'folding'
  if (o.kind === 'window' && sash) return 'window'
  return null
}

/** 落地窗的模型款式（three/windows.ts WindowModelStyle）：不填款式的是旧的落地推拉窗 */
export const sashStyle = (o: Pick<Opening, 'windowStyle'>) => o.windowStyle ?? 'legacySash'

/** 开门、落地窗的平开扇开到底的角度 */
export const SWING_MAX = Math.PI / 2
/** 折叠门折到底的角度（两扇差不多贴在一起） */
export const FOLD_MAX = (86 * Math.PI) / 180

/**
 * 没动过的门开着多少：开门半开（62°，看得出是门又不挡视线），推拉 / 谷仓 / 折叠门、落地窗开到底（人走得过去，同以前）；
 * 推拉的后轨那扇（leaf = 1）关着
 */
export function defaultDoorOpen(o: Pick<Opening, 'kind' | 'doorStyle'>, leaf = 0) {
  if (leaf) return 0
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

/** 推拉门的两扇：板宽、离墙中线的偏移（前轨 +，后轨 -）、两扇中心沿墙的位置（前轨那扇随 open、后轨那扇随 back 动） */
export function slidingPose(g: DoorGeom, open: number, back = 0) {
  const w = g.width
  const t = Math.max(2, g.wall / 4)
  return {
    pw: w / 2 + 2,
    off: [t / 2 + 0.5, -(t / 2 + 0.5)],
    along: [-w / 4 + (clamp01(open) * w) / 2, w / 4 - (clamp01(back) * w) / 2],
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

/** 开到 open（推拉的后轨那扇开到 back）时挡路的门板线段（平面坐标）：门扇、推拉扇、折扇，以及开门旁固定的侧窗 */
export function doorSegments(g: DoorGeom, open: number, back = 0): [Vec, Vec][] {
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
    const s = slidingPose(g, open, back)
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
  if (kind === 'window') return windowSegments(g, open, back)
  return []
}

/**
 * 落地窗各扇的几何（three/windows.ts windowModel 按它建模型、windowSegments 按它挡人）。
 * 局部坐标：x 沿墙（窗中心 0）、z 横穿墙，z 按户外在 +z 给（用的时候乘上户外那一侧的符号）。
 *   slide：推拉扇（下标 = 门扇 0 / 1），中心在 x、宽 pw、轨道 z；x1 = 开到底时推到哪（推到另一扇那边）
 *   swing：平开扇 x0..x1，铰链在 left ? x0 : x1、贴着户外墙面（z）；ajar = 摆成固定样子时推开着的那扇
 *   fixed：中间固定的玻璃（组合窗）
 * 开不了的款式（固定窗等）返回 null。
 */
export function windowLeaves(style: string, w: number, wall: number, hinge?: 'start' | 'end') {
  if (style === 'legacySash' || style === 'sliding') {
    const legacy = style === 'legacySash'
    const t = Math.max(2, wall / 4)
    const inner = legacy ? w : w - 8
    const pw = inner / 2 + 2
    const z = t / 2 + 0.5
    const a1 = legacy ? w / 4 : inner / 4 - 1
    const a0 = legacy ? -w / 4 : -inner / 4 + 1
    return { inner, slide: [{ x: a0, x1: a1, z, pw }, { x: a1, x1: a0, z: -z, pw }], swing: [], fixed: null }
  }
  if (style === 'casement' || style === 'casement2' || style === 'combo') {
    const inner = w - 8
    const z = wall / 2 - 3.2 / 2
    const leaf = (x0: number, x1: number, left: boolean, ajar: boolean) => ({ x0, x1, left, ajar, z })
    if (style === 'casement') return { inner, slide: [], swing: [leaf(-inner / 2, inner / 2, hinge !== 'end', true)], fixed: null }
    if (style === 'casement2') return { inner, slide: [], swing: [leaf(-inner / 2, 0, true, true), leaf(0, inner / 2, false, false)], fixed: null }
    const side = Math.min(inner * 0.26, 60)
    return { inner, slide: [], swing: [leaf(-inner / 2, -inner / 2 + side, true, false), leaf(inner / 2 - side, inner / 2, false, true)], fixed: [-inner / 2 + side, inner / 2 - side] as [number, number] }
  }
  return null
}

/** 落地窗挡路的扇（几何见 windowLeaves） */
function windowSegments(g: DoorGeom, open: number, back: number): [Vec, Vec][] {
  const { center, dir, out, width: w, wall } = g
  const n0 = { x: -dir.y, y: dir.x }
  const sgn = out.x * n0.x + out.y * n0.y >= 0 ? 1 : -1
  const P = (x: number, z: number) => add(add(center, mul(dir, x)), mul(n0, z * sgn))
  const L = windowLeaves(sashStyle(g.o), w, wall, g.o.hinge)
  // 固定窗等开不了的款式：整个洞口挡着
  if (!L) return [[P(-w / 2, 0), P(w / 2, 0)]]
  const v = clamp01(open)
  const a = v * SWING_MAX
  const segs: [Vec, Vec][] = L.slide.map((p, k) => {
    const x = p.x + (p.x1 - p.x) * (k ? clamp01(back) : v)
    return [P(x - p.pw / 2, p.z), P(x + p.pw / 2, p.z)]
  })
  for (const f of L.swing) {
    const lw = f.x1 - f.x0
    const hx = f.left ? f.x0 : f.x1
    segs.push([P(hx, f.z), P(hx + (f.left ? 1 : -1) * lw * Math.cos(a), f.z + lw * Math.sin(a))])
  }
  if (L.fixed) segs.push([P(L.fixed[0], 0), P(L.fixed[1], 0)])
  return segs
}
