// 浴室墙面设备的几何：淋浴（水栓 + 滑杆 + 镜子 + 台面）装在哪面墙、墙角在哪。
// 3D（house.ts 生成淋浴）和一键布置（decorate.ts 避开淋浴、把转角架放进墙角）共用，纯平面计算，不依赖 three。

import { add, bbox, edgesOf, fixtureDepth, mul, openingsOn, rotFacingWall, type Box, type Fixture, type Plan, type Room, type Vec } from './model'
import { wallThicknessAt } from './walls'

type Ctx = Pick<Plan, 'rooms' | 'openings' | 'fixtures' | 'wall' | 'wallOuter'>

/**
 * 淋浴的安装位置：
 *   side：在来 / 普通ユニットバス —— 装在浴缸短边一端的侧墙上、洗身区一侧（浴缸前方），
 *         从浴缸边往外依次是：台面（カウンター）+ 恒温混水龙头 + 上方镜子，再往外是淋浴滑杆；
 *   over：3点ユニット（同室有马桶）或侧墙够不着 —— 装在浴缸背后的墙上、浴缸一端，配浴帘杆。
 * 模型原点 p 在墙面上（地面高度），+z = n（朝房间里），+x 沿墙；sx = ±1 表示模型的 +x 要不要翻成 -x
 * （side 模式下模型的 +x 指向远离浴缸的方向；over 模式下指向浴缸中部）。
 */
export interface ShowerSpot {
  mode: 'side' | 'over'
  p: Vec
  n: Vec
  sx: 1 | -1
  /** 这面墙是外墙（透明化分组用） */
  outer: boolean
  /** 外法线（指向墙里），tagFade 用 */
  wallOut: Vec
  /** side：可用的沿墙长度不够时只装水栓 + 滑杆（不装镜子、台面） */
  full: boolean
  /** 墙上这一段有窗（窗台 110 以上）：滑杆、镜子不装，花洒挂在水栓旁的低位支架上 */
  low: boolean
  /** over：浴帘杆两端（墙面上） */
  rail?: [Vec, Vec]
}

/** 淋浴模型的沿墙占用（side 模式从原点往 +x；over 模式以原点为中心） */
export const SHOWER_SPAN = { full: 66, compact: 44, over: 44 }

/** 从 q 沿 dir 打到房间边界：返回墙面距离（已扣半墙厚）和撞到的边 */
function rayWall(ctx: Ctx, room: Room, q: Vec, dir: Vec) {
  let best: { t: number; half: number; e: ReturnType<typeof edgesOf>[number] } | null = null
  for (const e of edgesOf(room.points)) {
    const den = dir.x * -e.dir.y + dir.y * e.dir.x
    if (Math.abs(den) < 1e-6) continue
    const ex = e.a.x - q.x
    const ey = e.a.y - q.y
    const t = (ex * -e.dir.y + ey * e.dir.x) / den
    const u = (ex * dir.y - ey * dir.x) / den
    if (t <= 0 || u > 0.5 || u < -e.length - 0.5) continue
    const half = wallThicknessAt(ctx, add(q, mul(dir, t)), dir, room) / 2
    if (!best || t - half < best.t) best = { t: t - half, half, e }
  }
  return best
}

/** 边 e 上 [lo, hi]（沿边距离）范围内的门窗：door = 有门 / 敞口，window = 有窗 */
function openingHits(ctx: Ctx, room: Room, e: ReturnType<typeof edgesOf>[number], lo: number, hi: number) {
  let door = false
  let window = false
  for (const { o, center } of openingsOn(room, ctx)) {
    // 只看这条边上的
    const off = (center.x - e.a.x) * e.dir.x + (center.y - e.a.y) * e.dir.y
    const dev = Math.abs((center.x - e.a.x) * e.dir.y - (center.y - e.a.y) * e.dir.x)
    if (dev > 2 || off < -1 || off > e.length + 1) continue
    if (off + o.width / 2 + 5 < lo || off - o.width / 2 - 5 > hi) continue
    if (o.kind === 'window') window = true
    else door = true
  }
  return { door, window }
}

const roomOfFixture = (ctx: Ctx, f: Fixture) => ctx.rooms.find((r) => r.kind === 'bath' && pointInRoom(r, f)) ?? ctx.rooms.find((r) => pointInRoom(r, f))
function pointInRoom(r: Room, p: Vec) {
  let inside = false
  const pts = r.points
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function showerSpot(ctx: Ctx, tub: Fixture): ShowerSpot | null {
  const room = roomOfFixture(ctx, tub)
  if (!room) return null
  const a = (tub.rot * Math.PI) / 180
  const R = { x: Math.cos(a), y: Math.sin(a) }
  const F = { x: -Math.sin(a), y: Math.cos(a) }
  const d = fixtureDepth(tub)
  const c = { x: tub.x, y: tub.y }
  const unit3 = ctx.fixtures.some((f) => f.kind === 'toilet' && pointInRoom(room, f))
  const sxOf = (n: Vec, want: Vec): 1 | -1 => (n.y * want.x - n.x * want.y >= 0 ? 1 : -1)

  if (tub.shower) {
    // 淋浴房：水栓 + 滑杆装在底盘背后那面墙的中间，有玻璃隔断，不要浴帘杆
    const back = rayWall(ctx, room, c, mul(F, -1))
    const half = back ? back.half : ctx.wall / 2
    const p = back ? add(c, mul(F, -(back.t - 0.2))) : add(c, mul(F, -d / 2))
    let low = false
    if (back) {
      const tp = (p.x - back.e.a.x) * back.e.dir.x + (p.y - back.e.a.y) * back.e.dir.y
      low = openingHits(ctx, room, back.e, tp - SHOWER_SPAN.over / 2, tp + SHOWER_SPAN.over / 2).window
    }
    return { mode: 'over', p, n: F, sx: 1, outer: half * 2 >= ctx.wallOuter, wallOut: mul(F, -1), full: false, low }
  }

  if (!unit3) {
    // 侧墙：从浴缸前沿往左右打
    const q = add(c, mul(F, d / 2 + 1))
    const opts: (ShowerSpot & { score: number })[] = []
    for (const s of [-1, 1]) {
      const dir = mul(R, s)
      const hit = rayWall(ctx, room, q, dir)
      if (!hit || hit.t > tub.w / 2 + 40) continue
      const e = hit.e
      const p = add(q, mul(dir, hit.t - 0.2))
      const tp = (p.x - e.a.x) * e.dir.x + (p.y - e.a.y) * e.dir.y
      const forward = e.dir.x * F.x + e.dir.y * F.y > 0
      const rem = (forward ? e.length - tp : tp) - ctx.wall / 2 - 4
      if (rem < SHOWER_SPAN.compact) continue
      const full = rem >= SHOWER_SPAN.full
      const span = full ? SHOWER_SPAN.full : SHOWER_SPAN.compact
      const [lo, hi] = forward ? [tp, tp + span] : [tp - span, tp]
      const hits = openingHits(ctx, room, e, lo, hi)
      if (hits.door) continue
      const n = mul(dir, -1)
      opts.push({ mode: 'side', p, n, sx: sxOf(n, F), outer: hit.half * 2 >= ctx.wallOuter, wallOut: dir, full, low: hits.window, score: (hits.window ? 100 : 0) + (full ? 0 : 50) + hit.t })
    }
    opts.sort((x, y) => x.score - y.score)
    if (opts[0]) {
      const { score: _s, ...spot } = opts[0]
      void _s
      return spot
    }
  }

  // 浴缸背后的墙：装在离马桶远的一端
  const toilet = ctx.fixtures.find((f) => f.kind === 'toilet' && pointInRoom(room, f))
  let end = 1
  if (toilet) {
    const k = (toilet.x - c.x) * R.x + (toilet.y - c.y) * R.y
    end = k > 0 ? -1 : 1
  }
  const back = rayWall(ctx, room, c, mul(F, -1))
  const half = back ? back.half : ctx.wall / 2
  const wallP = back ? add(c, mul(F, -(back.t - 0.2))) : add(c, mul(F, -d / 2))
  const p = add(wallP, mul(R, end * (tub.w / 2 - 22)))
  const e = back?.e
  let low = false
  if (e) {
    const tp = (p.x - e.a.x) * e.dir.x + (p.y - e.a.y) * e.dir.y
    low = openingHits(ctx, room, e, tp - SHOWER_SPAN.over / 2, tp + SHOWER_SPAN.over / 2).window
  }
  // 浴帘杆：沿浴缸前沿，两端顶到侧墙（侧墙够不着就按浴缸长度）
  const q = add(c, mul(F, d / 2))
  const ends = [-1, 1].map((s) => {
    const h = rayWall(ctx, room, q, mul(R, s))
    const t = h && h.t < tub.w / 2 + 30 ? h.t - 0.2 : tub.w / 2
    return add(q, mul(R, s * t))
  }) as [Vec, Vec]
  return { mode: 'over', p, n: F, sx: sxOf(F, mul(R, -end)), outer: half * 2 >= ctx.wallOuter, wallOut: mul(F, -1), full: false, low, rail: ends }
}

/** 淋浴在墙上占的平面范围（进深 16），一键布置的壁挂物要避开 */
export function showerBox(s: ShowerSpot): Box {
  const along = { x: s.n.y * s.sx, y: -s.n.x * s.sx }
  const span = s.mode === 'over' ? SHOWER_SPAN.over : s.full ? SHOWER_SPAN.full : SHOWER_SPAN.compact
  const a = s.mode === 'over' ? add(s.p, mul(along, -span / 2)) : s.p
  const b = add(a, mul(along, span))
  return bbox([a, b, add(a, mul(s.n, 16)), add(b, mul(s.n, 16))])
}

/** 房间里所有浴缸的淋浴范围 */
export function showerBoxes(ctx: Ctx, room: Room): Box[] {
  return ctx.fixtures.filter((f) => f.kind === 'bathtub' && pointInRoom(room, f)).flatMap((f) => {
    const s = showerSpot(ctx, f)
    return s ? [showerBox(s)] : []
  })
}

/**
 * 房间的阳角（凸角）里能放 w × d 壁挂物的位置：背面贴一面墙、左侧（局部 -x）贴另一面墙。
 * 适用于直角在左后（局部 -x、-z）的转角架。返回中心、朝向和占地。
 */
export function cornerSpots(ctx: Ctx, room: Room, w: number, d: number) {
  const es = edgesOf(room.points)
  const out: { x: number; y: number; rot: number; box: Box; walls: [number, number]; v: Vec }[] = []
  for (let i = 0; i < es.length; i++) {
    const eA = es[(i - 1 + es.length) % es.length]
    const eB = es[i]
    const v = eB.a
    // 凸角：下一条边朝本边的里侧拐
    if (eB.dir.x * eA.out.x + eB.dir.y * eA.out.y > -0.5) continue
    for (const [back, other, bi, oi] of [
      [eA, eB, (i - 1 + es.length) % es.length, i],
      [eB, eA, i, (i - 1 + es.length) % es.length],
    ] as const) {
      const rot = rotFacingWall(back.out)
      const a = (rot * Math.PI) / 180
      const right = { x: Math.cos(a), y: Math.sin(a) }
      // 局部 -x 要指向另一面墙（即从角点沿 back 往回）
      if (-right.x * other.out.x - right.y * other.out.y < 0.5) continue
      const hb = wallThicknessAt(ctx, add(v, mul(back.dir, back === eA ? -20 : 20)), back.out, room) / 2
      const ho = wallThicknessAt(ctx, add(v, mul(other.dir, other === eA ? -20 : 20)), other.out, room) / 2
      const vin = add(add(v, mul(back.out, -hb)), mul(other.out, -ho))
      const cen = add(add(vin, mul(right, w / 2)), mul(back.out, -d / 2))
      const half = Math.round(rot / 90) % 2 === 1 ? { x: d / 2, y: w / 2 } : { x: w / 2, y: d / 2 }
      out.push({ x: cen.x, y: cen.y, rot, box: { x0: cen.x - half.x, y0: cen.y - half.y, x1: cen.x + half.x, y1: cen.y + half.y }, walls: [bi, oi], v })
    }
  }
  return out
}

/** 角点附近（各墙 len 以内）有没有门窗 */
export function cornerBlocked(ctx: Ctx, room: Room, v: Vec, len: number) {
  return openingsOn(room, ctx).some(({ o, center }) => Math.hypot(center.x - v.x, center.y - v.y) - o.width / 2 < len)
}
