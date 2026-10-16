// 开门方向的自动决定：对每扇开门试「铰链在哪端 × 往哪边开」四种组合，按日式住宅的常规打分取最好的。
//
// 开向规则（违反就扣分，玄関门例外：必须外开）：
//   - 不往廊下、玄関开：开着的门会堵住通道
//   - トイレ外开：人在里面倒下也推得开
//   - 收纳门往外开：里面是放东西的
//   - LDK 与居室之间的门往居室里开
// 几何规则：
//   - 门扇开到底要贴着侧墙（铰链靠墙角），不挡进门的路线
//   - 开扇范围不能超出房间、不能和别的门的开扇打架、不能扫过别的门洞、不能扫到设备
// 怎么转都避不开冲突的门（以及只能内开的トイレ门）改成引き戸。

import { add, dot, edgesOf, fixtureBox, inBox, mul, openingGeom, pointInPolygon, projectToSegment, sub, type Opening, type Plan, type Room, type Vec } from './model'

interface Swing {
  hinge: Vec
  /** 门扇开到底的方向（单位向量，指向开启侧房间） */
  n: Vec
  /** 铰链指向另一端（单位向量，沿墙） */
  u: Vec
  w: number
  /** 开启侧的房间；null 表示户外 */
  room: Room | null
}

function swingOf(plan: Plan, o: Opening, hinge: Opening['hinge'], swing: Opening['swing']): Swing | null {
  const g = openingGeom(plan.rooms, o)
  if (!g) return null
  const { owner, e, center } = g
  const h = add(center, mul(e.dir, (hinge === 'start' ? -1 : 1) * (o.width / 2)))
  const u = hinge === 'start' ? e.dir : mul(e.dir, -1)
  const n = swing === 'in' ? mul(e.out, -1) : e.out
  const probe = add(center, mul(n, 8))
  const room = swing === 'in' ? owner : (plan.rooms.find((r) => r !== owner && pointInPolygon(probe, r.points)) ?? null)
  return { hinge: h, n, u, w: o.width, room }
}

/** 开扇（四分之一圆）内的采样点；角度避开 0° / 90°，否则点正好落在墙线上，内外判断不稳定 */
function discSamples(s: Swing): Vec[] {
  const pts: Vec[] = []
  for (const k of [0.35, 0.65, 0.95])
    for (let a = 8; a <= 82; a += 14.8) {
      const t = (a * Math.PI) / 180
      pts.push(add(s.hinge, add(mul(s.n, Math.cos(t) * s.w * k), mul(s.u, Math.sin(t) * s.w * k))))
    }
  return pts
}

function inDisc(p: Vec, s: Swing) {
  const v = sub(p, s.hinge)
  return dot(v, s.n) > 1 && dot(v, s.u) > 1 && Math.hypot(v.x, v.y) < s.w - 1
}

/** 门扇开到底时离侧墙多远（越小越好：贴墙） */
function leafWallGap(s: Swing): number {
  if (!s.room) return 0
  // 只看和门扇平行的墙（门所在的墙和它垂直，不算）
  const walls = edgesOf(s.room.points).filter((e) => Math.abs(dot(e.dir, s.n)) >= 0.99)
  let sum = 0
  for (const k of [0.25, 0.5, 0.75, 1]) {
    const p = add(s.hinge, mul(s.n, s.w * k))
    const m = Math.min(...walls.map((e) => projectToSegment(p, e.a, e.b).d))
    // 封顶：大房间中间的门没有墙可贴，不该因此压过开向规则
    sum += Math.min(m, 120)
  }
  return sum / 4
}

/** 开向本身的扣分；Infinity 表示不允许 */
function directionPenalty(plan: Plan, o: Opening, s: Swing): number {
  const owner = plan.rooms.find((r) => r.id === o.roomId)!
  const isFront = owner.kind === 'entrance' && !swingOf(plan, o, o.hinge, 'out')?.room
  if (isFront) return s.room ? Infinity : 0 // 玄関门：必须外开
  if (!s.room) return Infinity // 其它门不能开到户外
  const k = s.room.kind
  let p = 0
  // トイレ门本来就要开向廊下，不受「别往廊下开」约束
  if ((k === 'hall' || k === 'entrance') && owner.kind !== 'toilet') p += 300
  if (k === 'toilet') p += 250
  // 收纳门往外开；WIC 人能走进去，可以内开
  if (k === 'storage' && s.room.name !== 'WIC') p += 300
  // LDK 和居室之间的门往居室里开
  if (k === 'ldk') p += 60
  return p
}

/** 几何冲突的扣分：开扇超出房间、和别的门打架、扫过别的门洞、扫到设备 */
function conflictPenalty(plan: Plan, o: Opening, s: Swing, others: Swing[]): number {
  let p = 0
  const pts = discSamples(s)
  if (s.room) p += 150 * pts.filter((q) => !pointInPolygon(q, s.room!.points)).length
  for (const t of others) if (pts.some((q) => inDisc(q, t)) || discSamples(t).some((q) => inDisc(q, s))) p += 400
  for (const x of plan.openings) {
    if (x === o || x.kind === 'window') continue
    const g = openingGeom(plan.rooms, x)
    if (!g) continue
    const { e, center } = g
    if ([0, 20, -20].some((k) => inDisc(add(center, mul(e.out, k)), s))) p += 400
  }
  for (const f of plan.fixtures) {
    const b = fixtureBox(f)
    if (pts.some((q) => inBox(q, b))) p += 300
  }
  return p
}

/** 原地改写所有开门的 hinge / swing */
export function orientDoors(plan: Plan) {
  const doors = plan.openings.filter((o) => o.kind === 'door')
  const othersOf = (o: Opening) =>
    doors
      .filter((x) => x !== o && x.kind === 'door')
      .map((x) => swingOf(plan, x, x.hinge, x.swing))
      .filter((s): s is Swing => !!s)
  // 两遍：第二遍时每扇门都能看到其它门的最终朝向
  for (let pass = 0; pass < 2; pass++) {
    for (const o of doors) {
      const others = othersOf(o)
      let best: { v: number; hinge: Opening['hinge']; swing: Opening['swing'] } | null = null
      for (const hinge of ['start', 'end'] as const)
        for (const swing of ['in', 'out'] as const) {
          const s = swingOf(plan, o, hinge, swing)
          if (!s) continue
          const dir = directionPenalty(plan, o, s)
          const v = Number.isFinite(dir) ? dir + conflictPenalty(plan, o, s, others) + leafWallGap(s) : dir
          if (!best || v < best.v) best = { v, hinge, swing }
        }
      if (best && Number.isFinite(best.v)) {
        o.hinge = best.hinge
        o.swing = best.swing
      }
    }
  }
  // 怎么转都会和别的门打架、扫出房间，或者トイレ只能内开：改成引き戸
  for (const o of doors) {
    const owner = plan.rooms.find((r) => r.id === o.roomId)
    const s = swingOf(plan, o, o.hinge, o.swing)
    if (!owner || !s) continue
    if (owner.kind === 'entrance' && !s.room) continue
    if (s.room?.kind === 'toilet' || conflictPenalty(plan, o, s, othersOf(o)) >= 300) o.kind = 'sliding'
  }
}
