// 一键布置的统一空间占用表：每层（一份户型 / 按层布置时的子户型）一张，所有「这里能不能放」的规则只写在这里。
//
// 静态部分（布置开始时按需算一次、缓存）：
//   平面禁放区 zones()：门扇扫过的范围、门前通道、通往阳台的落地窗前（腰窗按需）、设备本体和前方使用空间、
//     楼梯起步处 / 储物角开口前（stairKeepOut）、按层布置时塞进子户型的楼梯口留空区和通道（stair-clear-*）、楼梯洞口、挑空栏杆里侧；
//   墙面区段 wallSpans()：每面墙上被门窗（按高度区间）、敞开边、贴墙设备占掉的区段，剩下的就是能靠家具 / 能挂东西的地方；
//   设备的立体块（fixtureSpans）、窗帘、层高。
// 动态部分：已经摆好的东西（落地件、壁挂件、挂件的下垂范围、台面摆件），按 3D 包围盒算（贴附物按本体中心，见 bodyBox）。
//   直接读布置器的家具表：摆上去就算登记了占用，拿掉就释放，不需要另外同步。
//
// 查询接口 canPlace(asset, x, y, rot, z, opts) 返回能不能放和原因；各种摆法（贴墙、壁挂、台面、挂钩、找空地）都走它。

import {
  boxOverlaps,
  edgesOf,
  fixtureBox,
  frontBox,
  isAxisEdge,
  openingsOn,
  pointInPolygon,
  add,
  mul,
  type Box,
  type Fixture,
  type Furniture,
  type Plan,
  type Room,
  type Vec,
} from './model'
import { ASSET_MAP, type AssetDef } from './three/assets'
import { hasTag } from './three/tags'
import { boxInsideWalls, clearanceZones, innerRoom, isSashWindow } from './place'
import { furnitureBox } from './snap'
import { toWorld } from './surface'
import { curtainSpecs, fixtureSpans, windowSpan } from './curtains'
import { DEFAULT_FLOOR_H, floorById, floorOf } from './floors'
import { isOpenBetween, sharedIntervals, wallThicknessAt } from './walls'

// ---------- 几何小工具（布置器各处共用） ----------

/** 平面包围盒重叠（各边留 0.5 的容差：贴着放不算） */
export const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5

/** 点集的包围盒 */
const boxOf = (pts: Vec[]): Box => ({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) })

/** 点到线段的距离 */
function distToSeg(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}

/** 平面包围盒按 k 往外扩（k < 0 往里收） */
export const grow = (b: Box, k: number): Box => ({ x0: b.x0 - k, y0: b.y0 - k, x1: b.x1 + k, y1: b.y1 + k })

/** 按 90° 取整的占地（家具都是横平竖直摆的） */
export function footprint(asset: string, x: number, y: number, rot: number): Box {
  const def = ASSET_MAP.get(asset)!
  const vertical = Math.round(rot / 90) % 2 === 1
  const hw = (vertical ? def.d : def.w) / 2
  const hh = (vertical ? def.w : def.d) / 2
  return { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh }
}

/**
 * 一件东西本体的平面中心：贴附物（磁吸挂钩、冰箱贴…）的位置是贴附面上的点，模型从那里往前（局部 +z）伸出 d，
 * 本体中心在前面 d / 2；其他东西的位置就是中心。
 */
export function bodyCenter(asset: string, x: number, y: number, rot: number) {
  const def = ASSET_MAP.get(asset)
  return def?.stick ? toWorld({ x, y, rot }, 0, def.d / 2) : { x, y }
}

/** 一件东西本体的平面包围盒（贴附物按实际伸出的方向算，见 bodyCenter） */
export function bodyBox(asset: string, x: number, y: number, rot: number): Box {
  const c = bodyCenter(asset, x, y, rot)
  return furnitureBox(asset, c.x, c.y, rot)
}

/**
 * 一件东西在高度上的范围 [底, 顶]（相对房间地面）。
 * 带挂钩的壁挂物（毛巾杆、挂钩）往下多算 45：会挂上毛巾；壁挂空调下方到 AC_CLEAR 都留空（出风口不能被高家具顶住）。
 */
export function vrange(o: Pick<Furniture, 'z'>, d: AssetDef): [number, number] {
  if (d.mount !== undefined) {
    const hooks = (d.surfaces ?? []).filter((l) => l.kind === 'hook').map((l) => l.y)
    const lo = Math.min(d.mount, ...hooks.map((y) => y - 45))
    return [d.type === 'aircon' ? Math.min(lo, AC_CLEAR) : lo, d.mount + d.h]
  }
  if (d.stick) {
    const z = o.z ?? 150
    return [z - d.h / 2, z + d.h / 2]
  }
  if (d.form === 'hanging') return [(o.z ?? 0) - d.h, o.z ?? 0]
  return [o.z ?? 0, (o.z ?? 0) + d.h]
}

/** 壁挂空调下方要留空到的高度：高过它的家具（衣柜、高书柜）不能摆在空调下面 */
export const AC_CLEAR = 170

/** 碰撞用的设备：马桶水箱比座便宽（toiletModel 的水箱 w + 6），按实际宽度算，旁边的马桶刷、垃圾桶不会贴进水箱里 */
export const solidFixture = (f: Fixture): Fixture => (f.kind === 'toilet' ? { ...f, w: f.w + 6 } : f)

/** 按层布置时塞进子户型的留空区（楼梯口 / 出梯口和通道、挑空栏杆里侧，见 stairs.ts withStairKeepout） */
const isKeepout = (f: Fixture) => f.id.startsWith('stair-clear-') || f.id.startsWith('void-rail-')

// ---------- 占用的分层 ----------

/**
 * 一件东西在占用表里属于哪一层：
 *   wall  壁挂物、贴附物（贴在墙 / 家具表面上）；
 *   hang  挂起的东西（毛巾、衣服、袋子）：和壁挂物同一层，往下垂；
 *   prop  台面 / 层板上的东西（z > 0）；
 *   flat  地毯、垫子这类薄片（不挡别的东西）；
 *   floor 落地家具。
 */
export type Layer = 'floor' | 'flat' | 'prop' | 'wall' | 'hang'
export function layerOf(d: AssetDef, z?: number): Layer {
  if (d.mount !== undefined || d.stick) return 'wall'
  if (d.form === 'hanging') return 'hang'
  if ((z ?? 0) > 0.5) return 'prop'
  return d.h <= 3 ? 'flat' : 'floor'
}
/** 高处那一层（壁挂物 + 挂件）：和地上的东西、台面上的东西交错 */
const upper = (l: Layer) => l === 'wall' || l === 'hang'

export interface Body {
  f: Furniture
  def: AssetDef
  layer: Layer
  /** 本体的平面包围盒（贴附物按本体中心） */
  box: Box
  /** 按位置算的平面包围盒（同一台面上的东西比较用） */
  fbox: Box
  lo: number
  hi: number
  /** 地毯这类薄片（不挡高处的东西） */
  thin: boolean
}

/** 占用体按家具对象缓存：位置 / 朝向 / 高度变了（个别步骤会挪动已摆的东西）就重算 */
const bodyCache = new WeakMap<Furniture, { x: number; y: number; rot: number; z?: number; asset: string; b: Body }>()
export function bodyOf(f: Furniture): Body | null {
  const hit = bodyCache.get(f)
  if (hit && hit.x === f.x && hit.y === f.y && hit.rot === f.rot && hit.z === f.z && hit.asset === f.asset) return hit.b
  const def = ASSET_MAP.get(f.asset)
  if (!def) return null
  const [lo, hi] = vrange(f, def)
  const layer = layerOf(def, f.z)
  const b: Body = { f, def, layer, box: bodyBox(f.asset, f.x, f.y, f.rot), fbox: furnitureBox(f.asset, f.x, f.y, f.rot), lo, hi, thin: !upper(layer) && def.h <= 3 }
  bodyCache.set(f, { x: f.x, y: f.y, rot: f.rot, z: f.z, asset: f.asset, b })
  return b
}

// ---------- 平面禁放区 ----------

export type ZoneKind =
  /** 门扇扫过的范围（开向本房间的平开门 / 折门） */
  | 'door-swing'
  /** 门前通道（门宽 × 50） */
  | 'door-front'
  /** 通往阳台的落地窗前 */
  | 'sash'
  /** 腰窗前（只在 windows 选项打开时） */
  | 'window'
  /** 楼梯起步处、储物角开口前、出梯口外侧，以及它们到门的通道 */
  | 'stair'
  /** 上层的楼梯洞口 */
  | 'stair-hole'
  /** 挑空栏杆里侧 35 */
  | 'void-rail'
  /** 设备本体 */
  | 'fixture'
  /** 设备前方的使用空间 */
  | 'fixture-front'
  /** 床边下床的空间（摆床时登记，之后的落地家具不能占） */
  | 'bedside'

/** 门窗前的几类：门扇扫过的范围、门前通道、落地窗前、腰窗前 */
export const OPENING_ZONES: ReadonlySet<ZoneKind> = new Set<ZoneKind>(['door-swing', 'door-front', 'sash', 'window'])
/** 「硬」的几类（门前通道、设备使用空间可以临时占，这些不行）：设备本体、楼梯口留空区、楼梯洞口、挑空栏杆里侧 */
export const HARD_ZONES: ReadonlySet<ZoneKind> = new Set<ZoneKind>(['fixture', 'stair', 'stair-hole', 'void-rail', 'bedside'])
/** 门洞前（门扇扫过的范围、门前通道）：人要进出的地方 */
export const DOOR_ZONES: ReadonlySet<ZoneKind> = new Set<ZoneKind>(['door-swing', 'door-front'])
/** 楼梯起步处 / 储物角开口前 / 出梯口和它们的通道 */
export const STAIR_ZONES: ReadonlySet<ZoneKind> = new Set<ZoneKind>(['stair'])
/** 落地的东西一律不能压的留空区（Occupancy.canPlace 直接查） */
export const KEEP_ZONES: ReadonlySet<ZoneKind> = new Set<ZoneKind>(['stair', 'stair-hole', 'void-rail', 'bedside'])
/** 门扇扫过的范围 */
export const SWING_ZONES: ReadonlySet<ZoneKind> = new Set<ZoneKind>(['door-swing'])

export interface Zone {
  box: Box
  kind: ZoneKind
  /** 来自哪个设备 / 门窗 */
  id?: string
}

/** 墙面上被占掉的一段：沿边的 [t0, t1]（从边起点算）× 高度 [z0, z1] */
export interface WallSpan {
  t0: number
  t1: number
  z0: number
  z1: number
  kind: 'door' | 'window' | 'open' | 'fixture'
}
export interface WallFace {
  edge: number
  e: ReturnType<typeof edgesOf>[number]
  /** 墙面离墙体中心线的距离（半个墙厚） */
  inset: number
  spans: WallSpan[]
}

// ---------- 查询 ----------

export interface PlaceOpts {
  /** 支撑者（家具或设备的 id）：它本身、以及它的支撑链上的设备不算冲突 */
  parent?: string
  /** 额外不算冲突的东西 */
  ignore?: ReadonlySet<string>
  /** 挂件：从 parent 的挂钩上垂下来（不给就按素材本身判断层） */
  hang?: boolean
  /** 壁挂 / 贴附物：也不和别的壁挂 / 贴附物 / 挂件在立面上重叠（贴墙挂的走 placeCandidates 已经平面错开了，不用开） */
  walls?: boolean
  /** 有台面的家具按之后会摆上东西的高度算（台面以上再留 60，床留 35）：挂画不能被以后摆上去的东西挡住 */
  reserve?: boolean
  /** 立面上至少错开多少（默认 -1：重叠不超过 1cm 就行） */
  gap?: number
  /** 不在 room 里任何设备的平面范围上方（挂画不挂在设备上方） */
  fixtureFree?: boolean
  /** 离 room 的门窗两侧至少这么远（沿墙方向；墙面前后 25 以内算） */
  openings?: number
  /** 落地件：也不和别的落地家具在平面上重叠（贴墙摆的走 placeCandidates 已经错开了，不用开） */
  solid?: boolean
  /** 所在房间：默认要整块在它的墙面轮廓里（inside = false 时只给 fixtureFree / openings 用） */
  room?: Room
  inside?: boolean
  /** 同一台面上已有东西的重叠容差（默认 0.5） */
  surfaceTol?: number
  /** 台面摆件不查同一台面上的其他东西（厨房台面、浴缸边沿另有规则） */
  noSurface?: boolean
}

export type Verdict = { ok: true } | { ok: false; reason: string; with?: string }
const OK: Verdict = { ok: true }
const no = (reason: string, w?: string): Verdict => ({ ok: false, reason, with: w })

export class Occupancy {
  constructor(
    private plan: Plan,
    /** 当前已摆的东西（布置器的 out，可能被整个换掉，所以每次都现取） */
    private items: () => Furniture[],
    /** 可以被压在下面 / 不占地的（地毯、摆件、壁挂物…）：不算平面上的实体 */
    private flat: ReadonlySet<string>,
    /** 摆件 → 支撑者 */
    private parentOf: ReadonlyMap<string, string>,
  ) {}

  // ---------- 静态部分 ----------

  private ceilingH: number | null = null
  /** 这一层的层高（按层布置时 plan 是一层的子户型，房间都在同一层；单层户型 = 默认墙高） */
  get ceiling() {
    if (this.ceilingH === null) {
      const r = this.plan.rooms[0]
      this.ceilingH = (r && floorById(this.plan, floorOf(this.plan, r))?.height) || DEFAULT_FLOOR_H
    }
    return this.ceilingH
  }

  private spanCache: [Box, number, number, string][] | null = null
  /** 设备的立体块：[平面包围盒, 底, 顶, 设备 id] */
  get fixtureBlocks() {
    return (this.spanCache ??= this.plan.fixtures.flatMap((fx) => fixtureSpans(fx).map(([b, lo, hi]): [Box, number, number, string] => [b, lo, hi, fx.id])))
  }

  private curtainCache: [Box, number, number][] | null = null
  /** 窗帘占的立体块：[平面包围盒, 底, 顶]，规则同 house.ts 的 buildCurtains */
  get curtains() {
    return (this.curtainCache ??= curtainSpecs(this.plan).map((c): [Box, number, number] => [c.box, c.bottom, c.rodY + 2.5]))
  }

  private zoneCache = new Map<string, Zone[]>()
  /** 布置过程中登记的留空区（床边下床的空间…），按房间 */
  private held = new Map<string, Zone[]>()

  /** 登记一块留空区：之后地上的东西都要让开（zones / floorBlockers / ctx 都带上它） */
  hold(room: Room, box: Box, kind: ZoneKind, id?: string) {
    const z = this.held.get(room.id) ?? []
    z.push({ box, kind, id })
    this.held.set(room.id, z)
  }

  /** 撤掉某件东西登记的留空区（那件东西被拿掉时） */
  release(id: string) {
    for (const [k, z] of this.held) this.held.set(k, z.filter((x) => x.id !== id))
  }
  /**
   * 房间的平面禁放区。sash：通往阳台的落地窗前也留出通行空间（家具默认留）；windows：腰窗前也留（设备的 avoidWindows）。
   * 设备（含按层布置时塞进来的楼梯留空区、洞口）按设备中心在不在房间里算，和 placeCandidates 一致。
   */
  zones(room: Room, o: { sash?: boolean; windows?: boolean } = {}): Zone[] {
    const held = this.held.get(room.id)
    const base = this.staticZones(room, o)
    return held?.length ? [...base, ...held] : base
  }

  private staticZones(room: Room, o: { sash?: boolean; windows?: boolean }): Zone[] {
    const sash = o.sash ?? true
    const key = `${room.id}|${sash ? 1 : 0}${o.windows ? 1 : 0}`
    let z = this.zoneCache.get(key)
    if (z) return z
    z = []
    // 门窗前（门扇扫过的范围、门前通道、落地窗前、腰窗前）和楼梯的起步处 / 储物角开口前：规则在 place.ts 的 clearanceZones
    for (const c of clearanceZones(room, this.plan, !!o.windows, sash)) z.push({ box: c.box, kind: c.kind })
    // 按层布置时塞进来的楼梯口留空区 / 通道、挑空栏杆里侧可能跨好几个房间：切到每个房间里的那一块
    for (const piece of this.keepoutPieces()) if (piece.room === room.id) z.push({ box: piece.box, kind: piece.kind, id: piece.id })
    for (const f of this.plan.fixtures) {
      if (isKeepout(f) || !pointInPolygon({ x: f.x, y: f.y }, room.points)) continue
      const box = fixtureBox(solidFixture(f))
      const kind: ZoneKind = f.id.endsWith('~hole') ? 'stair-hole' : 'fixture'
      z.push({ box, kind, id: f.id })
      const fb = frontBox(f)
      if (fb) z.push({ box: fb, kind: 'fixture-front', id: f.id })
    }
    this.zoneCache.set(key, z)
    return z
  }

  private pieceCache: { box: Box; kind: ZoneKind; id: string; room: string }[] | null = null
  /** 留空区设备（stair-clear-* / void-rail-*）和每个房间包围盒的交集，交集中心在那个房间里的才算 */
  keepoutPieces() {
    if (this.pieceCache) return this.pieceCache
    const out: { box: Box; kind: ZoneKind; id: string; room: string }[] = []
    for (const f of this.plan.fixtures) {
      if (!isKeepout(f)) continue
      const b = fixtureBox(f)
      const kind: ZoneKind = f.id.startsWith('void-rail-') ? 'void-rail' : 'stair'
      for (const r of this.plan.rooms) {
        const rb = boxOf(r.points)
        const box = { x0: Math.max(b.x0, rb.x0), y0: Math.max(b.y0, rb.y0), x1: Math.min(b.x1, rb.x1), y1: Math.min(b.y1, rb.y1) }
        if (box.x1 - box.x0 < 1 || box.y1 - box.y0 < 1) continue
        if (!pointInPolygon({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, r.points)) continue
        out.push({ box, kind, id: f.id, room: r.id })
      }
    }
    return (this.pieceCache = out)
  }

  private faceCache = new Map<string, WallFace[]>()
  /**
   * 房间每面横平竖直的墙上被占掉的区段：门（0..200）、窗（窗台..窗顶，落地窗 0..200）、和隔壁敞开的边（整面高）、
   * 背贴这面墙的设备（按设备的立体块高度）。没被占的区段能靠家具，在某个高度区间里没被占的能挂东西。
   */
  wallSpans(room: Room): WallFace[] {
    let faces = this.faceCache.get(room.id)
    if (faces) return faces
    faces = []
    const ops = openingsOn(room, this.plan)
    const open = this.plan.rooms.filter((r) => r.id !== room.id && isOpenBetween(room, r))
    edgesOf(room.points).forEach((e, edge) => {
      if (!isAxisEdge(e)) return
      const inset = wallThicknessAt(this.plan, add(e.a, mul(e.dir, e.length / 2)), e.out, room) / 2
      const spans: WallSpan[] = []
      for (const { o, owner, e: oe, center } of ops) {
        // 同一条线上的门窗（可能记在隔壁房间的墙上）
        if (Math.abs(oe.dir.x * e.dir.x + oe.dir.y * e.dir.y) < 0.99) continue
        if (Math.abs((center.x - e.a.x) * e.out.x + (center.y - e.a.y) * e.out.y) > 2) continue
        const t = (center.x - e.a.x) * e.dir.x + (center.y - e.a.y) * e.dir.y
        if (t < -o.width / 2 || t > e.length + o.width / 2) continue
        const sash = o.kind === 'window' && isSashWindow(this.plan, owner, oe, center)
        const [z0, z1] = o.kind === 'window' ? (sash ? [0, 200] : [windowSpan(room, false).y0, windowSpan(room, false).y1]) : [0, 200]
        spans.push({ t0: t - o.width / 2, t1: t + o.width / 2, z0, z1, kind: o.kind === 'window' ? 'window' : 'door' })
      }
      for (const r of open) for (const [lo, hi] of sharedIntervals(e, r)) spans.push({ t0: lo, t1: hi, z0: 0, z1: 1000, kind: 'open' })
      for (const [b, lo, hi] of this.fixtureBlocks) {
        // 设备块贴着这面墙（离墙面 3cm 以内）
        const corners: Vec[] = [
          { x: b.x0, y: b.y0 },
          { x: b.x1, y: b.y1 },
        ]
        const ds = corners.map((p) => -((p.x - e.a.x) * e.out.x + (p.y - e.a.y) * e.out.y))
        if (Math.min(...ds) > inset + 3 || Math.max(...ds) < inset - 1) continue
        const ts = [b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((y) => (x - e.a.x) * e.dir.x + (y - e.a.y) * e.dir.y))
        const t0 = Math.max(0, Math.min(...ts))
        const t1 = Math.min(e.length, Math.max(...ts))
        if (t1 - t0 > 1) spans.push({ t0, t1, z0: lo, z1: hi, kind: 'fixture' })
      }
      faces!.push({ edge, e, inset, spans })
    })
    this.faceCache.set(room.id, faces)
    return faces
  }

  /** 墙面 [t0, t1] × [z0, z1] 这一块没被门窗、敞开边、贴墙设备占掉（margin：门窗两侧再让多少） */
  wallClear(face: WallFace, t0: number, t1: number, z0: number, z1: number, margin = 0) {
    return !face.spans.some((s) => s.t0 - margin < t1 && t0 < s.t1 + margin && s.z0 < z1 && z0 < s.z1)
  }

  // ---------- 动态部分 ----------

  /** 已摆的东西的占用体 */
  bodies(): Body[] {
    const out: Body[] = []
    for (const f of this.items()) {
      const b = bodyOf(f)
      if (b) out.push(b)
    }
    return out
  }

  /** 房间里平面上的实体家具（不含地毯、摆件、壁挂物这类 flat 的）的占地；except 里的不算 */
  solids(room?: Room, except?: ReadonlySet<string>): Box[] {
    return this.items()
      .filter((f) => !this.flat.has(f.id) && !except?.has(f.id) && (!room || pointInPolygon(f, room.points)))
      .map((f) => {
        const c = bodyCenter(f.asset, f.x, f.y, f.rot)
        return footprint(f.asset, c.x, c.y, Math.round(f.rot / 90) * 90)
      })
  }

  /** 实体家具当作 PS 设备（没有使用空间）塞进户型里：placeCandidates 等按设备避让的函数用 */
  ctx(): Plan {
    const solid = this.items()
      .filter((f) => !this.flat.has(f.id) && ASSET_MAP.has(f.asset))
      .map((f): Fixture => {
        const def = ASSET_MAP.get(f.asset)!
        const c = bodyCenter(f.asset, f.x, f.y, f.rot)
        return { id: f.id, kind: 'ps', x: c.x, y: c.y, w: def.w, d: def.d, rot: Math.round(f.rot / 90) * 90 }
      })
    // 登记的留空区、切到各房间里的楼梯口留空区（placeCandidates 按设备中心在不在房间里认）
    const boxes = [...[...this.held.values()].flat().map((z) => z.box), ...this.keepoutPieces().map((p) => p.box)]
    const held = boxes.map((b, i): Fixture => ({ id: `held-${i}`, kind: 'ps', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, d: b.y1 - b.y0, rot: 0 }))
    return { ...this.plan, fixtures: [...this.plan.fixtures.map(solidFixture), ...solid, ...held] }
  }

  /**
   * 地上摆东西时要让开的平面区域：禁放区（门窗前、楼梯口、设备本体 + 使用空间…）+ 已摆的实体家具。
   * fronts = false 时不含设备的使用空间（椅子可以拉到设备前面）。
   */
  floorBlockers(room: Room, o: { sash?: boolean; fronts?: boolean; except?: ReadonlySet<string> } = {}): Box[] {
    const zs = this.zones(room, { sash: o.sash ?? true }).filter((z) => (o.fronts ?? true) || z.kind !== 'fixture-front')
    return [...zs.map((z) => z.box), ...this.solids(room, o.except)]
  }

  /** 房间里某几类禁放区的平面包围盒（kinds 可以给多组，取并集） */
  zoneBoxes(room: Room, kinds: ReadonlySet<ZoneKind>[], o: { sash?: boolean; windows?: boolean } = {}): Box[] {
    return this.zones(room, o)
      .filter((z) => kinds.some((k) => k.has(z.kind)))
      .map((z) => z.box)
  }

  /** 支撑链：摆件 → 桌子 → … */
  chainOf(parent?: string) {
    const chain = new Set<string>()
    for (let p = parent; p && !chain.has(p); p = this.parentOf.get(p)) chain.add(p)
    return chain
  }

  /**
   * (asset, x, y, rot, z) 处能不能放一件东西。规则：
   *   - 台面摆件：整件低于层高 8cm；不和同一台面上的东西重叠；
   *   - 落地件 / 摆件 × 壁挂物 / 挂件（立体上错开，地毯这类薄片不算）；
   *   - 壁挂物 × 落地件 / 摆件 / 设备的立体块 / 窗帘；walls 时也不和别的壁挂 / 贴附物重叠；
   *   - 挂件：垂下来的范围不碰任何东西（挂在谁身上的那件除外）、设备、窗帘；
   *   - 摆件不顶进设备本体（抽油烟机、吊柜…），支撑链上的设备除外；
   *   - 高过 3cm 的东西不插进窗帘；
   *   - room：整块在房间的墙面轮廓里；solid：不和别的落地家具在平面上重叠。
   * 支撑者（parent）和 ignore 里的不算。
   */
  canPlace(asset: string, x: number, y: number, rot: number, z?: number, o: PlaceOpts = {}): Verdict {
    const def = ASSET_MAP.get(asset)
    if (!def) return OK
    const layer: Layer = o.hang ? 'hang' : layerOf(def, z)
    const [lo, hi] = vrange({ z }, def)
    const box = bodyBox(asset, x, y, rot)
    const gap = o.gap ?? -1
    const vclash = (a0: number, a1: number) => Math.min(hi, a1) - Math.max(lo, a0) > -gap
    if (o.room && o.inside !== false && !boxInsideWalls(furnitureBox(asset, x, y, rot), o.room, this.plan)) return no('wall')
    if (o.room && o.fixtureFree && this.zoneBoxes(o.room, [HARD_ZONES]).some((z) => boxesOverlap(box, z))) return no('over-fixture')
    if (o.room && o.openings !== undefined && this.nearOpening(o.room, box, o.openings)) return no('opening')
    if (layer === 'prop' && (z ?? 0) + def.h > this.ceiling - 8) return no('ceiling')
    // 落地的东西不压留空区：楼梯口 / 储物角开口 / 出梯口和通道、楼梯洞口、挑空栏杆里侧、床边下床的空间
    if (layer === 'floor') {
      const fp = footprint(asset, x, y, rot)
      for (const r of this.plan.rooms) {
        if (!boxesOverlap(fp, boxOf(r.points))) continue
        for (const z0 of this.zones(r)) if (KEEP_ZONES.has(z0.kind) && boxesOverlap(fp, z0.box)) return no(z0.kind)
      }
    }
    const thin = !upper(layer) && def.h <= 3
    const fbox = furnitureBox(asset, x, y, rot)
    const surface = layer === 'prop' && !o.noSurface
    const tol = o.surfaceTol ?? 0.5
    const solid = !!o.solid && (layer === 'floor' || layer === 'flat') && !thin
    const fp = solid ? footprint(asset, x, y, rot) : null
    for (const f of this.items()) {
      const id = f.id
      if (id === o.parent || o.ignore?.has(id)) continue
      const b = bodyOf(f)
      if (!b) continue
      if (surface && Math.abs((f.z ?? 0) - (z ?? 0)) < 0.6 && !b.def.stick) {
        // 同一台面上已经摆着的东西：摆件，以及放到桌上的主机这类非摆件（贴附物除外）
        const c = b.fbox
        if (fbox.x0 < c.x1 - tol && c.x0 < fbox.x1 - tol && fbox.y0 < c.y1 - tol && c.y0 < fbox.y1 - tol) return no('surface', id)
      }
      let pair: boolean
      if (layer === 'hang') pair = !b.thin
      else if (layer === 'wall') pair = b.layer === 'hang' || (b.layer === 'wall' ? !!o.walls : !b.thin || !!o.reserve)
      else pair = upper(b.layer)
      if (fp && !pair && b.layer === 'floor' && !this.flat.has(id)) {
        if (boxOverlaps(fp, footprint(f.asset, f.x, f.y, f.rot))) return no('solid', id)
      }
      if (!pair || !boxesOverlap(box, b.box)) continue
      const bhi = o.reserve && b.layer === 'floor' && b.def.surface && !b.def.prop ? Math.max(b.hi, b.lo + b.def.surface + (hasTag(b.def, 'bed') ? 35 : 60)) : b.hi
      if (!vclash(b.lo, bhi)) continue
      return no(b.layer === 'wall' || b.layer === 'hang' ? 'wall-item' : 'body', id)
    }
    // 设备的立体块：壁挂物、挂件、摆件都不能顶进去（落地件和设备的平面避让由 zones / placeCandidates 管）
    if (layer === 'wall' || layer === 'hang' || layer === 'prop') {
      const chain = this.chainOf(o.parent)
      for (const [b, a0, a1, id] of this.fixtureBlocks) if (!chain.has(id) && boxesOverlap(box, b) && vclash(a0, a1)) return no('fixture', id)
    }
    // 窗帘：帘子收在窗两侧、贴着墙面垂下来，高的家具、台面上的东西、壁挂物、挂件都不能插进去
    if (!thin) for (const [b, a0, a1] of this.curtains) if (boxesOverlap(box, b) && vclash(a0, a1)) return no('curtain')
    return OK
  }

  /** 盒子落在房间某个门窗两侧 margin 以内的墙面带上（墙面前后 25） */
  nearOpening(room: Room, box: Box, margin: number) {
    return openingsOn(room, this.plan).some((op) => {
      const half = op.o.width / 2 + margin
      const a = add(op.center, mul(op.e.dir, -half))
      const b = add(op.center, mul(op.e.dir, half))
      const p = [add(a, mul(op.e.out, 25)), add(b, mul(op.e.out, -25))]
      return boxesOverlap(box, { x0: Math.min(p[0].x, p[1].x), y0: Math.min(p[0].y, p[1].y), x1: Math.max(p[0].x, p[1].x), y1: Math.max(p[0].y, p[1].y) })
    })
  }

  private entryCache = new Map<string, Vec[]>()
  /**
   * 房间的出入口（主要通道的端点）：门洞、和隔壁敞开的边、通往阳台的落地窗，各取开口中点往房间里 35 的点。
   */
  entrances(room: Room): Vec[] {
    let pts = this.entryCache.get(room.id)
    if (pts) return pts
    pts = []
    for (const { o, owner, e, center } of openingsOn(room, this.plan)) {
      if (o.kind === 'window' && !isSashWindow(this.plan, owner, e, center)) continue
      const into = pointInPolygon(add(center, mul(e.out, 5)), room.points) ? e.out : mul(e.out, -1)
      pts.push(add(center, mul(into, 35)))
    }
    for (const r of this.plan.rooms) {
      if (r.id === room.id || !isOpenBetween(room, r)) continue
      for (const e of edgesOf(room.points))
        for (const [lo, hi] of sharedIntervals(e, r)) if (hi - lo > 60) pts.push(add(add(e.a, mul(e.dir, (lo + hi) / 2)), mul(e.out, -35)))
    }
    this.entryCache.set(room.id, pts)
    return pts
  }

  /**
   * 主要通道：房间里 blockers 之外，宽 2r 的人能不能从第一个出入口走到其余每个出入口（10cm 格子上的连通性，墙面按墙面轮廓算）。
   * 返回走不到的出入口个数。出入口附近 40 以内找最近的能站的格子当起止点（门洞两侧常有家具贴着）。
   */
  blockedEntrances(room: Room, blockers: Box[], r = 30, entries = this.entrances(room)): number {
    if (entries.length < 2) return 0
    const inner = innerRoom(room, this.plan)
    const b = boxOf(inner.points)
    const step = 10
    const nx = Math.max(1, Math.ceil((b.x1 - b.x0) / step))
    const ny = Math.max(1, Math.ceil((b.y1 - b.y0) / step))
    const free = new Uint8Array(nx * ny)
    const edges = edgesOf(inner.points)
    const grown = blockers.map((k) => grow(k, r - 2))
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const p = { x: b.x0 + (i + 0.5) * step, y: b.y0 + (j + 0.5) * step }
        if (!pointInPolygon(p, inner.points)) continue
        if (grown.some((k) => p.x > k.x0 && p.x < k.x1 && p.y > k.y0 && p.y < k.y1)) continue
        if (edges.some((e) => distToSeg(p, e.a, e.b) < r - 2)) continue
        free[j * nx + i] = 1
      }
    const cellOf = (p: Vec) => {
      let best = -1
      let bd = 40
      for (let j = Math.max(0, Math.floor((p.y - 40 - b.y0) / step)); j < Math.min(ny, Math.ceil((p.y + 40 - b.y0) / step)); j++)
        for (let i = Math.max(0, Math.floor((p.x - 40 - b.x0) / step)); i < Math.min(nx, Math.ceil((p.x + 40 - b.x0) / step)); i++) {
          if (!free[j * nx + i]) continue
          const d = Math.hypot(b.x0 + (i + 0.5) * step - p.x, b.y0 + (j + 0.5) * step - p.y)
          if (d < bd) ((bd = d), (best = j * nx + i))
        }
      return best
    }
    const cells = entries.map(cellOf)
    const start = cells.find((c) => c >= 0)
    if (start === undefined) return entries.length - 1
    const seen = new Uint8Array(nx * ny)
    const q = [start]
    seen[start] = 1
    while (q.length) {
      const c = q.pop()!
      const i = c % nx
      const j = (c - i) / nx
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di
        const k = j + dj
        if (a < 0 || k < 0 || a >= nx || k >= ny) continue
        const n = k * nx + a
        if (!free[n] || seen[n]) continue
        seen[n] = 1
        q.push(n)
      }
    }
    return cells.filter((c) => c !== start && (c < 0 || !seen[c])).length
  }

  /** canPlace 的布尔版 */
  fits(asset: string, x: number, y: number, rot: number, z?: number, o?: PlaceOpts) {
    return this.canPlace(asset, x, y, rot, z, o).ok
  }
}
