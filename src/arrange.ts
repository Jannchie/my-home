// 大件家具按「候选 + 打分」摆：一个房间里的几样主要大件（床、衣柜 / 大柜、书桌、沙发 + 电视柜…）各自生成若干贴墙候选位置
// （placeCandidates，取分散开的前 N 个），按规则打分，再在组合上做小规模的 beam search，取总分最高的组合。
//
// 打分规则（分数越高越好，见各 score* 函数）：
//   床：床头靠实墙（不靠窗、不靠门所在的墙），不正对门、床尾不堵门；双人床两侧都能下床，单人床一侧靠墙也行；床头边放得下床头柜；离门远一点；
//   沙发：背靠墙、离厨房远一点、面朝房间；电视柜：和沙发相对、居中，距离 2–3m（按房间大小缩放），中间没有大件挡着；
//   书桌：靠窗（窗下）或侧对窗采光，坐着时背后不正对门，椅子拉得开；
//   衣柜 / 大柜：放在长而完整的墙段上（越长越好、靠墙角加分），不挨着窗；
//   整体：主要通道（门到门、门到落地窗）留出 60 宽能走通，左右大致均衡。
// 布置结果仍由种子决定：候选的随机扰动来自布置器的随机序列。

import { add, bbox, dist, mul, openingsOn, pointInPolygon, type Box, type Fixture, type Plan, type Room, type Vec } from './model'
import { boxInsideWalls, isSashWindow, placeCandidates, type PlaceSpec } from './place'
import { ASSET_MAP } from './three/assets'
import { hasTag } from './three/tags'
import { HARD_ZONES, boxesOverlap, footprint, type Occupancy, type WallFace } from './occupancy'

/** 一个候选位置（或选定的位置） */
export interface Pick {
  asset: string
  x: number
  y: number
  rot: number
}

/** 一样大件：几个备选（素材 + 贴墙规则，按偏好排，bias 是偏好分），以及打分时按哪类算 */
export interface Slot {
  kind: 'bed' | 'sofa' | 'tv' | 'desk' | 'cabinet' | 'other'
  options: { asset: string; spec?: Partial<PlaceSpec>; bias?: number }[]
  /** 放不下也行（扣 miss 分）；不是 optional 的放不下同样跳过，只是扣得多 */
  miss?: number
  /** 沙发：离这个点（厨房）远一点 */
  far?: Vec
}

export interface ArrangeEnv {
  plan: Plan
  room: Room
  occ: Occupancy
  rand: () => number
  /** 现有的户型 + 已摆实体家具当设备（placeCandidates 用） */
  ctx: Plan
  /** 立体上能不能放（墙上已挂的东西、窗帘…） */
  canPlace: (asset: string, x: number, y: number, rot: number) => boolean
}

/** 每样大件取多少个候选、beam 宽多少 */
const PER_SLOT = 10
const WIDTH = 6

const frontDir = (rot: number): Vec => {
  const a = (rot * Math.PI) / 180
  return { x: -Math.sin(a), y: Math.cos(a) }
}
const sideDir = (rot: number): Vec => {
  const f = frontDir(rot)
  return { x: f.y, y: -f.x }
}
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const rect = (c: Vec, u: Vec, v: Vec, hu: number, hv: number): Box =>
  bbox([add(add(c, mul(u, hu)), mul(v, hv)), add(add(c, mul(u, -hu)), mul(v, -hv)), add(add(c, mul(u, hu)), mul(v, -hv)), add(add(c, mul(u, -hu)), mul(v, hv))])

const asPs = (p: Pick, i: number): Fixture => {
  const d = ASSET_MAP.get(p.asset)!
  return { id: `arrange-${i}`, kind: 'ps', x: p.x, y: p.y, w: d.w, d: d.d, rot: Math.round(p.rot / 90) * 90 }
}
const boxOfPick = (p: Pick) => footprint(p.asset, p.x, p.y, p.rot)
const boxPs = (b: Box, i: number): Fixture => ({ id: `arrange-held-${i}`, kind: 'ps', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, d: b.y1 - b.y0, rot: 0 })

/** 一个房间的打分要用的静态信息 */
class Scene {
  doors: { c: Vec; w: number }[] = []
  windows: { c: Vec; w: number }[] = []
  hard: Box[]
  solids: Box[]
  faces: WallFace[]
  center: Vec
  minDim: number
  constructor(public env: ArrangeEnv) {
    const { plan, room, occ } = env
    for (const { o, owner, e, center } of openingsOn(room, plan)) {
      if (o.kind !== 'window') this.doors.push({ c: center, w: o.width })
      else if (isSashWindow(plan, owner, e, center)) this.doors.push({ c: center, w: o.width })
      else this.windows.push({ c: center, w: o.width })
    }
    this.hard = occ.zoneBoxes(room, [HARD_ZONES])
    this.solids = occ.solids(room)
    this.faces = occ.wallSpans(room)
    const b = bbox(room.points)
    this.center = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    this.minDim = Math.min(b.x1 - b.x0, b.y1 - b.y0)
  }

  /** 背后贴着的那面墙，以及占了那面墙的哪一段 */
  backFace(p: Pick) {
    const d = ASSET_MAP.get(p.asset)!
    const f = frontDir(p.rot)
    const back = add(p, mul(f, -d.d / 2))
    for (const face of this.faces) {
      if (dot(face.e.out, f) > -0.99) continue
      const off = -dot(sub(back, face.e.a), face.e.out)
      if (Math.abs(off - face.inset) > 6) continue
      const t = dot(sub(back, face.e.a), face.e.dir)
      return { face, t0: t - d.w / 2, t1: t + d.w / 2 }
    }
    return null
  }

  /** 床边要登记成留空区的下床空间：双人床两侧；单人床空着的那几侧（不贴墙、不压设备和已摆的家具） */
  heldSides(p: Pick) {
    const sides = bedSides(p)
    return isDoubleBed(p.asset) ? sides : sides.filter((b) => this.free(b, []))
  }

  /** 平面上这块地方空着：在墙面轮廓里，不压设备 / 楼梯口、已摆的家具和这一轮已选的大件 */
  free(b: Box, state: Pick[], skip?: Pick) {
    if (!boxInsideWalls(b, this.env.room, this.env.plan)) return false
    if (this.hard.some((h) => boxesOverlap(h, b)) || this.solids.some((h) => boxesOverlap(h, b))) return false
    return !state.some((p) => p !== skip && boxesOverlap(boxOfPick(p), b))
  }
}

// ---------- 各类大件的打分 ----------

/** 双人床（两侧都要能下床）：宽 120 以上的床，婴儿床除外 */
export function isDoubleBed(asset: string) {
  const d = ASSET_MAP.get(asset)
  return !!d && hasTag(d, 'bed') && !hasTag(d, 'crib', 'loft') && d.w >= 120
}

/** 床两侧下床的空间：离床头 46（让开床头柜）到床身 85%，宽 50 */
export function bedSides(p: Pick): Box[] {
  const d = ASSET_MAP.get(p.asset)!
  const f = frontDir(p.rot)
  const side = sideDir(p.rot)
  const a = 46
  const b = Math.max(a + 30, d.d * 0.85)
  return [-1, 1].map((k) => rect(add(add(p, mul(f, -d.d / 2 + (a + b) / 2)), mul(side, k * (d.w / 2 + 25))), side, f, 25, (b - a) / 2))
}

function scoreBed(s: Scene, p: Pick, state: Pick[]) {
  const d = ASSET_MAP.get(p.asset)!
  const f = frontDir(p.rot)
  const side = sideDir(p.rot)
  let score = 0
  const bf = s.backFace(p)
  if (bf) {
    // 床头靠窗 / 靠门所在的墙
    if (bf.face.spans.some((sp) => sp.kind === 'window' && sp.t0 < bf.t1 + 10 && bf.t0 - 10 < sp.t1)) score -= 40
    if (bf.face.spans.some((sp) => sp.kind === 'door')) score -= 15
  } else score -= 30
  const foot = add(p, mul(f, d.d / 2))
  for (const door of s.doors) {
    const v = sub(door.c, p)
    // 正对门（门在床尾方向、横向在床宽范围里）
    if (dot(v, f) > 0 && Math.abs(dot(v, side)) < d.w / 2 + 20) score -= 20
    if (dist(foot, door.c) < 90) score -= 10
  }
  // 两侧下床的空间（bedSides）：双人床两侧都要有（放不下就换小一号的床），单人床一侧靠墙也行
  const sideFree = bedSides(p).filter((b) => s.free(b, state, p)).length
  if (isDoubleBed(p.asset)) {
    if (sideFree < 2) return -Infinity
  } else score += sideFree === 0 ? -40 : sideFree === 1 ? 4 : 0
  // 床头柜放得下（床头一侧 45 × 40）
  const ns = [-1, 1].some((k) => s.free(rect(add(add(p, mul(f, -d.d / 2 + 21)), mul(side, k * (d.w / 2 + 25))), side, f, 22, 20), state, p))
  if (ns) score += 6
  // 离门远一点
  const near = Math.min(600, ...s.doors.map((door) => dist(p, door.c)))
  return score + near / 50
}

function scoreDesk(s: Scene, p: Pick, state: Pick[]) {
  const d = ASSET_MAP.get(p.asset)!
  const f = frontDir(p.rot)
  const side = sideDir(p.rot)
  let score = 0
  const bf = s.backFace(p)
  if (bf?.face.spans.some((sp) => sp.kind === 'window' && sp.t0 < bf.t1 && bf.t0 < sp.t1)) score += 15
  else if (s.windows.some((w) => Math.abs(dot(sub(w.c, p), side)) < d.w / 2 + 120 && Math.abs(dot(sub(w.c, p), f)) < 150 && Math.abs(dot(sub(w.c, p), side)) > d.w / 2 - 5)) score += 10
  // 坐着时背后正对门
  for (const door of s.doors) {
    const v = sub(door.c, p)
    if (dot(v, f) > d.d / 2 && Math.abs(dot(v, side)) < 90) score -= 12
  }
  // 椅子拉得开
  const chair = rect(add(p, mul(f, d.d / 2 + 28)), side, f, 25, 25)
  if (!s.free(chair, state, p)) score -= 25
  return score
}

function scoreCabinet(s: Scene, p: Pick) {
  const d = ASSET_MAP.get(p.asset)!
  const bf = s.backFace(p)
  if (!bf) return -10
  const { face, t0, t1 } = bf
  // 所在墙段的完整长度：包含它的、不被门窗 / 敞开边 / 设备打断的那一段
  let lo = face.inset
  let hi = face.e.length - face.inset
  for (const sp of face.spans) {
    if (sp.z0 >= d.h || sp.z1 <= 0) continue
    if (sp.t1 <= t0 + 1) lo = Math.max(lo, sp.t1)
    else if (sp.t0 >= t1 - 1) hi = Math.min(hi, sp.t0)
  }
  let score = Math.min(hi - lo, 400) / 40
  if (t0 - lo < 8 || hi - t1 < 8) score += 5
  if (face.spans.some((sp) => sp.kind === 'window' && sp.t0 < t1 + 40 && t0 - 40 < sp.t1)) score -= 10
  return score
}

function scoreSofa(s: Scene, p: Pick, far?: Vec) {
  let score = far ? Math.min(dist(p, far), 600) / 60 : 0
  const f = frontDir(p.rot)
  // 面朝房间中间
  if (dot(sub(s.center, p), f) > 0) score += 4
  const bf = s.backFace(p)
  if (bf?.face.spans.some((sp) => sp.kind === 'door')) score -= 5
  return score
}

function scoreTv(s: Scene, p: Pick, state: Pick[], slots: Slot[]) {
  const i = slots.findIndex((x) => x.kind === 'sofa')
  const sofa = i >= 0 ? state[i] : null
  if (!sofa) return 0
  const sd = ASSET_MAP.get(sofa.asset)!
  const td = ASSET_MAP.get(p.asset)!
  const fs = frontDir(sofa.rot)
  const ft = frontDir(p.rot)
  let score = 0
  // 电视柜要和沙发相对（tvFacesSofa），不满足就不放
  if (!tvFacesSofa(sofa, p)) return -Infinity
  // 距离：沙发前沿到电视柜前沿，理想 2–3m（按房间短边缩放）
  const a = add(sofa, mul(fs, sd.d / 2))
  const b = add(p, mul(ft, td.d / 2))
  const D = dot(sub(b, a), fs)
  const ideal = Math.max(200, Math.min(300, s.minDim * 0.55))
  score -= Math.abs(D - ideal) / 8
  // 横向居中
  score -= Math.abs(dot(sub(p, sofa), sideDir(sofa.rot))) / 8
  // 中间被大件挡住
  {
    const mid = mul(add(a, b), 0.5)
    const corridor = rect(mid, sideDir(sofa.rot), fs, Math.min(sd.w, 120) / 2, Math.max(1, D / 2 - 10))
    const others = state.filter((x, k) => x && k !== i && x !== p).map(boxOfPick)
    if ([...s.solids, ...others].some((h) => boxesOverlap(h, corridor))) score -= 25
  }
  return score
}

/**
 * 电视柜和沙发相对：朝向相反，电视柜在沙发正前方（横向偏离不超过 120），两者前沿相距 TV_GAP 范围内。
 * 测试里按同样的规则检查。
 */
export const TV_GAP: [number, number] = [130, 400]
export function tvFacesSofa(sofa: Pick, tv: Pick) {
  const sd = ASSET_MAP.get(sofa.asset)
  const td = ASSET_MAP.get(tv.asset)
  if (!sd || !td) return false
  const fs = frontDir(sofa.rot)
  const ft = frontDir(tv.rot)
  if (dot(fs, ft) > -0.99) return false
  const D = dot(sub(add(tv, mul(ft, td.d / 2)), add(sofa, mul(fs, sd.d / 2))), fs)
  return D >= TV_GAP[0] && D <= TV_GAP[1] && Math.abs(dot(sub(tv, sofa), sideDir(sofa.rot))) <= 120
}

/** 整体：主要通道走得通、左右均衡 */
function scoreFinal(s: Scene, state: (Pick | null)[]) {
  const picks = state.filter((p): p is Pick => !!p)
  const boxes = picks.map(boxOfPick)
  const blocked = s.env.occ.blockedEntrances(s.env.room, [...s.hard, ...s.solids, ...boxes])
  let score = -40 * blocked
  // 均衡：占地面积加权的重心离房间中心的距离
  let A = 0
  let cx = 0
  let cy = 0
  for (const b of [...boxes, ...s.solids]) {
    const a = (b.x1 - b.x0) * (b.y1 - b.y0)
    A += a
    cx += ((b.x0 + b.x1) / 2) * a
    cy += ((b.y0 + b.y1) / 2) * a
  }
  if (A > 0) score -= dist({ x: cx / A, y: cy / A }, s.center) / 40
  return score
}

/**
 * 在一个房间里给几样大件挑位置：每样取 PER_SLOT 个分散开的贴墙候选，beam search（宽 WIDTH）按总分取最好的组合。
 * 返回和 slots 一一对应的选定位置（放不下的为 null）。
 */
export function arrange(env: ArrangeEnv, slots: Slot[]): (Pick | null)[] {
  const s = new Scene(env)
  type State = { picks: (Pick | null)[]; score: number }
  let beam: State[] = [{ picks: [], score: 0 }]
  for (const slot of slots) {
    const next: State[] = []
    for (const st of beam) {
      const placed = st.picks.filter((p): p is Pick => !!p)
      // 已选的大件当设备避让；床边下床的空间也要留着（和 Decorator.bedPlaced 登记的一致）
      const held = placed.flatMap((p) => (hasTag(ASSET_MAP.get(p.asset)!, 'bed') ? s.heldSides(p) : [])).map(boxPs)
      const ctx = placed.length ? { ...env.ctx, fixtures: [...env.ctx.fixtures, ...placed.map(asPs), ...held] } : env.ctx
      const cands = candidates(env, ctx, slot)
      for (const { p, bias } of cands) {
        const state = [...st.picks, p]
        const flat = state.filter((x): x is Pick => !!x)
        let sc = bias + env.rand() * 3
        if (slot.kind === 'bed') sc += scoreBed(s, p, flat)
        else if (slot.kind === 'desk') sc += scoreDesk(s, p, flat)
        else if (slot.kind === 'cabinet') sc += scoreCabinet(s, p)
        else if (slot.kind === 'sofa') sc += scoreSofa(s, p, slot.far)
        else if (slot.kind === 'tv') sc += scoreTv(s, p, state as Pick[], slots)
        if (sc === -Infinity) continue
        next.push({ picks: state, score: st.score + sc })
      }
      next.push({ picks: [...st.picks, null], score: st.score - (slot.miss ?? 60) })
    }
    next.sort((a, b) => b.score - a.score)
    beam = next.slice(0, WIDTH)
  }
  let best: State | null = null
  let bs = -Infinity
  for (const st of beam) {
    const sc = st.score + scoreFinal(s, st.picks)
    if (sc > bs) ((bs = sc), (best = st))
  }
  return best?.picks ?? slots.map(() => null)
}

/** 一样大件的候选：按备选顺序，第一个放得下的素材和下一个备选，各取分散开的前若干个（立体上不冲突的） */
function candidates(env: ArrangeEnv, ctx: Plan, slot: Slot): { p: Pick; bias: number }[] {
  const out: { p: Pick; bias: number }[] = []
  let hits = 0
  for (const opt of slot.options) {
    const def = ASSET_MAP.get(opt.asset)
    if (!def) continue
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, sash: true, guardFront: true, ...opt.spec }
    const kept: Pick[] = []
    for (const f of placeCandidates(env.room, ctx, spec)) {
      if (kept.length >= PER_SLOT) break
      // 分散开：同一朝向、离已取的候选不到 40 的跳过
      if (kept.some((k) => k.rot === f.rot && Math.hypot(k.x - f.x, k.y - f.y) < 40)) continue
      if (!pointInPolygon(f, env.room.points) || !env.canPlace(opt.asset, f.x, f.y, f.rot)) continue
      kept.push({ asset: opt.asset, x: f.x, y: f.y, rot: f.rot })
    }
    for (const p of kept) out.push({ p, bias: opt.bias ?? 0 })
    if (kept.length && ++hits >= 2) break
  }
  return out
}
