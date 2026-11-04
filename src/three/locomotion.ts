// 会走路的角色（宠物、机器人：actors.ts；VRM 住户：residents.ts）共用的移动：原地转身、沿导航网格走一步、
// 把跨层的目标展开成「走到楼梯口 → 走楼梯 → 走到目标」、沿楼梯路线爬升、走楼梯时按两层之间的位置摆高度。
// 各层只给自己的步态参数（转身多快、多偏才停下来转、快到了怎么减速），行为本身只有这一份。
// 单位：厘米、秒、弧度。平面坐标 (x, y)，y 对应 3D 的 z；朝向 h = 0 面朝 +y。

import type { Vec } from '../model'
import type { FloorPoint, HouseNav, NavClass, NavGrid } from '../nav'
import type { StairWalk } from '../stairs'

export const TAU = Math.PI * 2
/** 角度收到 -π..π */
export const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI
export const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** 朝向 h（弧度）在平面上的单位向量 */
export const fwd = (h: number): Vec => ({ x: Math.sin(h), y: Math.cos(h) })

/** 移动要用到的角色状态 */
export interface Mover {
  pos: Vec
  /** 朝向 */
  h: number
  speed: number
  /** 所在楼层 */
  fl: string
  /** 脚底离本层地面的高度 */
  yW: number
  /** 走楼梯时脚下那一级踏面的高度（离下层地面） */
  stairZ: number
}

/** 步态参数 */
export interface Gait {
  /** 原地转身的角速度（弧度 / 秒） */
  turn: number
  /** 朝向和去向夹角的余弦低于它就先站住转身，高于它再加 0.4 走到全速 */
  align: number
  /** 快到时限速 = 剩下的距离 × 3 + brake（cm/s），停得稳 */
  brake: number
}

/** 转向 h，转一帧；返回是否已经对准 */
export function turnToward(m: Mover, h: number, rate: number, dt: number) {
  const d = wrap(h - m.h)
  m.h += Math.max(-rate * dt, Math.min(rate * dt, d))
  return Math.abs(d) < 0.03
}

/**
 * 朝 target 走一帧：偏得多先原地转身、快到了减速。check = false 时不管障碍（进出窝、座位前那一小段）。
 * 返回剩下的距离；被挡住返回 -1（速度清零）
 */
export function stepToward(m: Mover, nav: NavGrid, cls: NavClass, target: Vec, vmax: number, dt: number, r: number, gait: Gait, check = true) {
  const dx = target.x - m.pos.x
  const dy = target.y - m.pos.y
  const d = Math.hypot(dx, dy)
  if (d < 0.5) return 0
  const diff = wrap(Math.atan2(dx, dy) - m.h)
  turnToward(m, m.h + diff, gait.turn, dt)
  const v = Math.min(vmax * Math.max(0, Math.min(1, (Math.cos(diff) - gait.align) / 0.4)), d * 3 + gait.brake)
  m.speed += (v - m.speed) * Math.min(1, dt * 5)
  const f = fwd(m.h)
  const step = Math.min(m.speed * dt, d)
  const next = { x: m.pos.x + f.x * step, y: m.pos.y + f.y * step }
  // clearance 按 10cm 格子算，有半格左右的误差，这里放宽一点免得卡在格子边上；已经卡在窄处时只要不更窄就能走
  if (!check || nav.clearAt(cls, next) >= r - 4 || nav.clearAt(cls, next) >= nav.clearAt(cls, m.pos)) {
    m.pos = next
    return d - step
  }
  m.speed = 0
  return -1
}

/** 一段路：本层沿折线走（先走到折线起点），或者走一趟楼梯 */
export type Leg = { t: 'go'; to: Vec; path: Vec[]; i: number; rr: number } | { t: 'stairs'; walk: StairWalk; up: boolean }

/**
 * 跨层的目标按 HouseNav.route 展开成几段；按半径 r 找不到路再按 rTight 找一次。到不了返回 null。
 * rr：沿折线走时按多宽判断挡没挡住（不超过 body）
 */
export function routeLegs(house: HouseNav, cls: NavClass, from: FloorPoint, to: FloorPoint, r: number, rTight: number, body: number): Leg[] | null {
  const legs = house.route(cls, from, to, r) ?? house.route(cls, from, to, rTight)
  if (!legs) return null
  return legs.map((l): Leg => (l.t === 'stairs' ? { t: 'stairs', walk: l.walk, up: l.up } : { t: 'go', to: l.path[l.path.length - 1], path: l.path, i: 0, rr: Math.min(r, body) }))
}

/** 走楼梯的任务（进度存在任务上：路线点、累计路程、已走的路程） */
export interface StairsTask {
  t: 'stairs'
  walk: StairWalk
  up: boolean
  pts?: { x: number; y: number; z: number }[]
  cum?: number[]
  s?: number
}

/** 路线上走了 s 的地方（z 取那一级踏面，不在两级之间插值：一级一级地起伏） */
export function stairAt(t: StairsTask, s: number) {
  const pts = t.pts!
  const cum = t.cum!
  s = Math.max(0, Math.min(cum[cum.length - 1], s))
  let i = 1
  while (i < cum.length - 1 && cum[i] < s) i++
  const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, z: k < 0.5 ? pts[i - 1].z : pts[i].z }
}

/**
 * 沿楼梯路线（下楼倒过来）走一帧：朝向对准前方 ahead cm，偏得多先原地转过来；脚下高度写进 stairZ（调用方平滑过去）。
 * 下楼一开始就换到下层（高度 + 层间高），上楼走完才换到上层（高度 − 层间高），高度连续。
 * elapsed 是这个任务做了多久：超过 90 秒（卡住了）直接走完。返回是否走完
 */
export function climbStairs(m: Mover, t: StairsTask, vmax: number, gait: Gait, ahead: number, dt: number, elapsed: number) {
  const w = t.walk
  if (!t.pts) {
    // 从现在的位置先走到路线起点（楼梯口外侧）
    t.pts = [{ x: m.pos.x, y: m.pos.y, z: t.up ? 0 : w.rise }, ...(t.up ? w.pts : [...w.pts].reverse())]
    t.cum = [0]
    for (let i = 1; i < t.pts.length; i++) t.cum.push(t.cum[i - 1] + Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].y - t.pts[i - 1].y))
    t.s = 0
    if (!t.up) {
      m.fl = w.from
      m.yW += w.rise
    }
  }
  const total = t.cum![t.cum!.length - 1]
  const a = stairAt(t, t.s! + ahead)
  const dh = wrap(Math.atan2(a.x - m.pos.x, a.y - m.pos.y) - m.h)
  if (Math.hypot(a.x - m.pos.x, a.y - m.pos.y) > 1) turnToward(m, m.h + dh, gait.turn, dt)
  const v = vmax * Math.max(0, Math.min(1, (Math.cos(dh) - 0.3) / 0.5))
  m.speed += (v - m.speed) * Math.min(1, dt * 5)
  t.s = Math.min(total, t.s! + m.speed * dt)
  const q = stairAt(t, t.s)
  m.pos = { x: q.x, y: q.y }
  m.stairZ = q.z
  if (t.s < total - 0.5 && elapsed <= 90) return false
  const end = t.pts[t.pts.length - 1]
  m.pos = { x: end.x, y: end.y }
  if (t.up) {
    m.fl = w.to
    m.yW -= w.rise
  } else m.yW = Math.min(m.yW, 1)
  m.stairZ = 0
  return true
}

/**
 * 角色所在楼层地面的世界高度和按哪一层显示 / 淡出：走楼梯时在两层之间按爬到的高度插值（过了一半算上层），
 * 不然就是所在楼层。lift：楼层地面的世界高度（分层拉开时会变）
 */
export function floorPlacement(m: Mover, task: { t: string } | undefined, lift: (floor: string) => number): { baseY: number; fl: string } {
  if (task?.t === 'stairs' && (task as StairsTask).pts) {
    const w = (task as StairsTask).walk
    const k = Math.max(0, Math.min(1, m.yW / w.rise))
    const lo = lift(w.from)
    return { baseY: lo + (lift(w.to) - lo - w.rise) * k, fl: k > 0.5 ? w.to : w.from }
  }
  return { baseY: lift(m.fl), fl: m.fl }
}
