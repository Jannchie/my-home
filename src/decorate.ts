// 一键布置家具：按房间用途挑家具，靠墙的复用设备的贴墙摆放（place.ts），
// 居中的（茶几、餐桌、被炉）在房间里找空地。

import {
  add,
  area,
  bbox,
  centroid,
  fixtureDepth,
  boxOverlaps,
  dist,
  fixtureBox,
  mul,
  pointInPolygon,
  uid,
  type Box,
  type Fixture,
  type Furniture,
  type Plan,
  type Room,
  type Vec,
} from './model'
import { boxInsideWalls, firstDoorCenter, isSashWindow, placeCandidates, type PlaceSpec } from './place'
import { fixFloor, type CheckItem } from './checklist'
import { ASSETS, ASSET_MAP, STYLE_LABELS, type AssetDef, type StyleTag } from './three/assets'
import { rng, type Poly } from './three/kit'
import { paletteStyle } from './three/catalog'
import { derivedIndex, hasDerived } from './three/stylePalettes'
import { fitsOnFixture, fitsOnSurface, fixtureTop, toLocal, toWorld } from './surface'
import { COMPETITIVE, INTEREST_TIERS, JOBS, interestFloor, interestProps, interestStickers, interestWall, jobDeskProps, levelOf, topLevel, type Household, type InterestId, type Member, type Tier } from './household'
import { furnitureBox } from './snap'
import { floorOf } from './floors'
import { deskExtras, settleDesks, workstations } from './workstation'
import { appliancesOn, isApplianceOf, isMainAppliance, poseOnSpot, type SpotKind } from './appliance'
import { cornerSpots, showerBoxes, showerSpot } from './bathroom'
import { lidSizeFor } from './three/packs/bath-extra'
import { openingsOn, rotFacingWall } from './model'
import { isWallOwner, snapToHook } from './surface'
import { sharedIntervals, wallThicknessAt } from './walls'
import { edgesOf, projectToSegment } from './model'
import type { Wardrobe } from './three/garments'
import { PIPE, PIPE_WIDTHS, ROW_LENGTHS } from './three/packs/garments-pack'
import { floorY, roomAt } from './three/house'
import { openingGeom, regionOf, type Region } from './model'
import { gameWeight } from './three/packs/games-more'
import { homeCams } from './homecams'
import { cabinetsOnSpots, stowAll } from './stow'
import { spotInRoom } from './cabinet'
import { fixtureSpans } from './curtains'
import { hasTag, matchSel, selKey, type Sel, type Tag } from './three/tags'
import { allocateRooms, type Allocation, type RoomPurpose } from './household'
import { baseFloorId, floorViews, isMultiFloor, riseOf, stampFloor } from './floors'
import { stairFootprint, stairToWorld, stairUnderZone, stairWalk, withStairKeepout } from './stairs'
import { NavGrid } from './nav'
import { arrange, bedSides, pickWidth, twinCenters, type Pick, type Slot } from './arrange'
import { HARD_ZONES, OPENING_ZONES, Occupancy, STAIR_ZONES, SWING_ZONES, bodyCenter, boxesOverlap, footprint, type PlaceOpts, type ZoneKind } from './occupancy'

export type { RoomPurpose }

/**
 * 多层户型按层布置时的全户信息：
 *   alloc  全户统一的房间分配（allocateRooms(整份户型)），每层都用它；
 *   prior  别的楼层已经摆好的家具：全户限量的东西（游戏机、路由器…）、冰箱 / 洗衣机算上它们，不每层都放；
 *   fixtures 整份户型的设备：别的楼层有洗衣机位 / 冰箱位时，这一层不靠墙另放。
 */
export interface HouseCtx {
  alloc?: Allocation
  prior?: Furniture[]
  fixtures?: Fixture[]
  /** 整份户型和这一层的 id：校验主要通道时要算上这一层的楼梯起步处 / 出梯口 */
  plan?: Plan
  floorId?: string
}

/** 楼梯下储物角放的东西：抽屉柜、收纳篮、纸箱、矮柜、立着的行李箱、回收箱 */
const UNDER_STAIR = /^(st-drawer-3|st-baskets|int-cartons-[23]|sb-drawer-cab-[34]|sb-door-cab-closed|sw-fh-baskets|int-suitcase-standing|chore-recycle-crate)$/

type Rand = () => number

/** 家具在平面上的朝向向量（局部 +y = 正面） */
function frontDir(rot: number): Vec {
  const a = (rot * Math.PI) / 180
  return { x: -Math.sin(a), y: Math.cos(a) }
}

/** 家具当作一件 PS 设备参与 placeCandidates 的避让（PS 没有使用空间） */
function asFixture(f: Furniture): Fixture {
  const def = ASSET_MAP.get(f.asset)!
  const c = bodyCenter(f.asset, f.x, f.y, f.rot)
  return { id: f.id, kind: 'ps', x: c.x, y: c.y, w: def.w, d: def.d, rot: Math.round(f.rot / 90) * 90 }
}

/**
 * 按选择器（语义标签 / 锚定 id 的正则，见 three/tags.ts）在全部素材（不含设备）里找，结果按选择器缓存：一次布置要调几百次 find。
 * 成套摆放专用的部件（双人桌 hg-duo-*、成对的棋罐 hg-go-bowl-*、相机展示柜 / 防潮柜，标签 set-piece）不进按标签的通用查询，
 * 只有用 id 正则点名时才返回。ASSETS 加载后不再增减；带 g / y 标志的正则有状态，不缓存。
 */
const findCache = new Map<string, AssetDef[]>()
/** 装相机的柜子（成套部件，按 id 点名） */
const CAMERA_CASE = /^of-(camera-showcase|dry-)/
const selHit = (d: AssetDef, sel: Sel): boolean => (typeof sel === 'string' ? !hasTag(d, 'set-piece') && hasTag(d, sel) : sel instanceof RegExp ? matchSel(d, sel) : sel.some((x) => selHit(d, x)))
function findBySel(sel: Sel) {
  const scan = () => ASSETS.filter((d) => !d.fixture && selHit(d, sel))
  const key = selKey(sel)
  if (key === null) return scan()
  let hit = findCache.get(key)
  if (!hit) findCache.set(key, (hit = scan()))
  return hit
}
/** 全部可摆的素材（不含设备、成套部件） */
const ALL = () => findBySel([/^/]).filter((d) => !hasTag(d, 'set-piece'))

class Decorator {
  out: Furniture[] = []
  /** 地毯之类可以被压在下面的，不参与碰撞 */
  flat = new Set<string>()
  /** 每个居室住着谁 */
  occupants = new Map<string, Member[]>()
  /** 多出来的居室：给谁当书房 / 兴趣房 */
  studyOf = new Map<string, Member>()
  /** 没人住的居室做什么用：书房、电竞房、音乐室、影音室、手作室、健身房、游戏室、客房、衣帽间 */
  purposeOf = new Map<string, RoomPurpose>()
  /** 当前房间的风格（住户各自的房间风格可以不同） */
  style: StyleTag

  constructor(
    private plan: Plan,
    private rand: Rand,
    /** 公共空间的风格 */
    private baseStyle: StyleTag,
    private household?: Household,
    /** 多层户型按层布置时的全户信息（见 HouseCtx）；单层不给 */
    private house?: HouseCtx,
  ) {
    this.style = baseStyle
    this.occ = new Occupancy(plan, () => this.out, this.flat, this.parentOf)
  }

  /** 统一的空间占用表：所有「这里能不能放」的规则都在 occupancy.ts */
  occ: Occupancy

  /** 立体上能不能放（规则见 Occupancy.canPlace）；数量限制另由 allow 管。校验后重摆时，拿掉之前的位置不再用 */
  canPlace(asset: string, x: number, y: number, rot: number, z?: number, opts?: PlaceOpts) {
    if (this.avoidPose?.has(`${asset}|${Math.round(x)}|${Math.round(y)}|${Math.round(rot) % 360}`)) return false
    if (this.avoid?.length) {
      const b = footprint(asset, bodyCenter(asset, x, y, rot).x, bodyCenter(asset, x, y, rot).y, rot)
      if (this.avoid.some((a) => boxesOverlap(a, b))) return false
    }
    return this.occ.fits(asset, x, y, rot, z, opts)
  }

  // ---------- 统一校验 + 局部重摆 ----------

  /** 每件东西是怎么摆上去的（贴墙 / 找空地 / 挂墙 / 贴墙面）：校验发现问题时拿掉它，照原来的摆法换个位置再摆 */
  private recipes = new Map<string, () => Furniture | null>()
  /** 不挪的：冰箱 / 洗衣机、收纳位上的柜子、楼梯下储物角的东西、按打分挑好位置的大件 */
  private fixed = new Set<string>()
  /** 重摆时要避开的地方（之前那几次的位置） */
  private avoid: Box[] | null = null
  /** 重摆大件时不再用的位置（素材 + 位置 + 朝向）：大件可以挪一点、换小一号，只是不能原样放回 */
  private avoidPose: Set<string> | null = null
  private poseKey = (f: Furniture) => `${f.asset}|${Math.round(f.x)}|${Math.round(f.y)}|${Math.round(f.rot) % 360}`

  private remember(f: Furniture | null, again: () => Furniture | null) {
    if (f && !this.recipes.has(f.id)) this.recipes.set(f.id, again)
    return f
  }

  /** 成组摆的（餐桌和围着它的椅子、被炉和坐垫、牌桌和座位）：组员 → 主件。拿掉 / 重摆主件时组员跟着走 */
  private groupOf = new Map<string, string>()

  /** 一组：主件的重摆就是整组重摆 */
  group(leader: Furniture, members: Furniture[], again: () => Furniture | null) {
    for (const m of members) this.groupOf.set(m.id, leader.id)
    this.recipes.set(leader.id, again)
  }

  /** 拿掉一件东西，连同摆在它上面 / 挂在它上面的东西、和它成组的东西 */
  removeTree(f: Furniture) {
    const gone = new Set([f.id])
    for (let grew = true; grew; ) {
      grew = false
      for (const o of this.out) if (!gone.has(o.id) && (gone.has(this.parentOf.get(o.id) ?? '') || gone.has(this.groupOf.get(o.id) ?? ''))) (gone.add(o.id), (grew = true))
    }
    this.out = this.out.filter((o) => !gone.has(o.id))
    for (const id of gone) {
      this.flat.delete(id)
      this.parentOf.delete(id)
      this.occ.release(id)
    }
  }

  /**
   * 局部重摆：拿掉 id 这件，照原来的摆法换个位置再摆（避开之前的位置），新位置要满足 ok；最多试 3 次（大件 6 次），都不行就不摆了。
   * 按打分摆的大件（床）不删：换不到更好的位置就放回原处。返回新摆的那件（没摆成返回 null）。
   */
  relocate(id: string, ok: (f: Furniture) => boolean): Furniture | null {
    let cur = this.out.find((o) => o.id === id)
    const kids = cur ? this.kidsOf([cur]) : []
    try {
      return this.relocateOnce(id, cur, ok)
    } finally {
      this.replaceProps(kids)
    }
  }

  private relocateOnce(id: string, cur: Furniture | undefined, ok: (f: Furniture) => boolean): Furniture | null {
    const again = this.recipes.get(id)
    const keep = this.fixed.has(id) ? this.checkpoint() : null
    const fail = () => {
      if (keep) this.restore(keep)
      else if (cur && this.out.includes(cur)) this.removeTree(cur)
      return null
    }
    const avoid: Box[] = []
    const poses = new Set<string>()
    // 大件（床）多试几个位置：它挪不走的话别的东西怎么挪都没用
    for (let t = 0; t < (keep ? 6 : 3) && cur; t++) {
      const c = bodyCenter(cur.asset, cur.x, cur.y, cur.rot)
      avoid.push(footprint(cur.asset, c.x, c.y, cur.rot))
      poses.add(this.poseKey(cur))
      this.removeTree(cur)
      this.relocated++
      if (!again) return fail()
      // 大件只排除试过的那几个位置；小件避开之前占过的整块地方
      if (keep) this.avoidPose = poses
      else this.avoid = avoid
      let g: Furniture | null = null
      try {
        g = again()
      } finally {
        this.avoid = null
        this.avoidPose = null
      }
      if (!g) return fail()
      if (ok(g)) {
        this.recipes.set(g.id, again)
        return g
      }
      cur = g
    }
    return fail()
  }

  /** 布置状态的存档点（重摆大件失败时整个放回去） */
  private checkpoint() {
    return {
      out: [...this.out],
      flat: [...this.flat],
      parentOf: [...this.parentOf],
      groupOf: [...this.groupOf],
      beds: [...this.beds],
      fixed: [...this.fixed],
      held: this.occ.heldState(),
    }
  }
  private restore(c: ReturnType<Decorator['checkpoint']>) {
    this.out = c.out
    // 占用表拿着这几个集合的引用：原地换内容
    this.flat.clear()
    for (const x of c.flat) this.flat.add(x)
    this.parentOf.clear()
    for (const [k, v] of c.parentOf) this.parentOf.set(k, v)
    this.groupOf = new Map(c.groupOf)
    this.beds = new Map(c.beds)
    this.fixed = new Set(c.fixed)
    this.occ.setHeld(c.held)
  }
  /** 校验时挪过几次（测试 / 统计用） */
  relocated = 0

  /**
   * 布置结束时的统一校验（和测试同一套检查）：立体碰撞、设备、窗帘、留空区（Occupancy.audit），主要通道可达（clearPassages）。
   * 有问题的那件（冲突里后摆、不固定的那件）拿掉后照原来的摆法换个位置重摆（最多 3 次），实在放不下才删掉。
   */
  validate() {
    const before = this.relocated
    for (let round = 0; round < 3; round++) {
      const victims = new Set<string>()
      for (const c of this.occ.audit(undefined, this.fixed)) {
        const v = !this.fixed.has(c.a) ? c.a : c.b && !this.fixed.has(c.b) && this.out.some((o) => o.id === c.b) ? c.b : null
        if (v) victims.add(v)
      }
      if (!victims.size) break
      for (const id of victims) this.relocate(id, (g) => !this.occ.audit(g, this.fixed).length)
    }
    this.clearPassages()
    // 重摆过的书架、展示柜里的东西跟着拿掉了：开放格子再补一遍
    if (this.relocated > before) this.fillCompartments()
  }

  /** 主要通道的端点：起居房间（客厅、居室、走廊、厨房、餐厅）的门口内外 30，和这一层的楼梯起步处 / 出梯口 */
  private passageKeys(): Vec[] {
    const keys: Vec[] = []
    for (const o of this.plan.openings) {
      if (o.kind === 'window') continue
      const g = openingGeom(this.plan.rooms, o)
      if (!g) continue
      for (const k of [30, -30]) {
        const q = add(g.center, mul(g.e.out, k))
        const room = this.plan.rooms.find((x) => pointInPolygon(q, x.points))
        if (room && PASSAGE_ROOMS.has(room.kind)) keys.push(q)
      }
    }
    const full = this.house?.plan
    const floorId = this.house?.floorId
    if (full && floorId)
      for (const f of full.fixtures) {
        if (f.kind !== 'stairs') continue
        const w = stairWalk(full, f)
        if (!w) continue
        if (w.from === floorId) keys.push(w.entry)
        if (w.to === floorId) keys.push(w.exit)
      }
    return keys
  }

  /** 走不到的端点：以第一个能站的端点为起点，宽 2 × PASSAGE_R 的格子导航（和测试同一套） */
  private unreachable(keys: Vec[], without: Furniture[] = [], r = PASSAGE_R): Vec[] {
    // 楼梯口留空区这类伪设备不是实物；楼梯洞口按洞口多边形算
    const fixtures = this.plan.fixtures.filter((f) => !f.id.startsWith('stair-clear-') && !f.id.startsWith('void-rail-') && !f.id.endsWith('~hole'))
    const holes = this.plan.fixtures.filter((f) => f.id.endsWith('~hole')).map((f) => stairFootprint(f))
    const gone = new Set(without.map((f) => f.id))
    const g = new NavGrid({ ...this.plan, fixtures, furniture: gone.size ? this.out.filter((o) => !gone.has(o.id)) : this.out }, { holes })
    const pts = keys.map((k) => ({ k, at: g.nearest('pet', k, r, 40) }))
    const hub = pts.find((p) => p.at)
    if (!hub) return []
    return pts.filter((p) => p !== hub && (!p.at || !g.path('pet', hub.at!, p.at, r))).map((p) => p.k)
  }

  /**
   * 主要通道可达：走不通时，按离走不到的门口由近到远（最多 30 件）找拿掉就能走通（或少堵一处）的那件，换个位置重摆；
   * 重摆的位置还堵就再换，最多 3 次，不行就不摆了。几件一起堵住的，先挪离门口最近的（最多挪 3 件这样的）。最多处理 8 件。
   */
  clearPassages() {
    const keys = this.passageKeys()
    if (keys.length < 2) return
    // 挪过的不再挪（挪不动的大件会放回原处，下一轮别又挑中它）
    const tried = new Set<string>()
    for (let guard = 0; guard < 6; guard++) {
      const miss = this.unreachable(keys)
      if (!miss.length) return
      const near = (f: Furniture) => Math.min(...miss.map((m) => dist(m, f)))
      // 候选：不固定的落地家具（离走不到的门口由近到远，最多 30 件），排在后面的是有重摆办法的大件（床）
      const loose = this.out
        .filter((f) => {
          const d = ASSET_MAP.get(f.asset)
          return !!d && !f.z && !d.mount && !d.stick && d.h >= 3 && !this.fixed.has(f.id) && !tried.has(f.id)
        })
        .sort((a, b) => near(a) - near(b))
        .slice(0, 30)
      const majors = this.out.filter((f) => this.fixed.has(f.id) && this.recipes.has(f.id) && !tried.has(f.id)).sort((a, b) => near(a) - near(b))
      const pool = [...loose, ...majors]
      // 全拿掉也走不通：挪家具没用
      if (!pool.length || this.unreachable(keys, pool).length >= miss.length) return
      // 二分：拿掉前 k 件就能少堵一处的最小 k（每试一次要重建一遍导航格子，逐件试太慢）
      let lo = 1
      let hi = pool.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (this.unreachable(keys, pool.slice(0, mid)).length < miss.length) hi = mid
        else lo = mid + 1
      }
      // 第 k 件单独拿掉就行的话只挪它；否则前 k 件是一起把路堵死的，一起挪
      const last = pool[lo - 1]
      let group = this.unreachable(keys, [last]).length < miss.length ? [last] : pool.slice(0, lo)
      const target = this.unreachable(keys, group).length
      for (const f of group) tried.add(f.id)
      const ok = () => this.unreachable(keys).length <= target
      const moved = this.relocateGroup(group, ok)
      for (const g of moved) tried.add(g.id)
      // 堵路的里面有大件、单挪又挪不开（房间里别的位置都被小件占了，或者是大件和小件一起把路堵死）：
      // 连同这个房间里不固定的落地家具一起重摆，大件先挑位置（原来的位置也可以用），小件再找不堵路的地方
      const major = group.find((f) => this.fixed.has(f.id))
      if (!moved.length && major) {
        group = [major]
        const room = this.plan.rooms.find((r) => pointInPolygon(group[0], r.points))
        const inRoom = (f: Furniture) => !!room && f !== group[0] && pointInPolygon(f, room.points)
        // 同屋能重摆的大件（衣柜）排在小件前面
        const mates = [...majors.filter(inRoom), ...loose.filter(inRoom)]
        if (mates.length) for (const g of this.relocateGroup([group[0], ...mates], ok, new Set([group[0].id]))) tried.add(g.id)
      }
    }
  }

  /**
   * 一起挪几件：先全拿掉，再一件件照原来的摆法换个位置重摆（避开之前的位置），每件的新位置要立体上不冲突、并满足 ok；
   * 一件最多试 3 次（大件 6 次），不行就不摆了——有大件挪不动时整组放回原处。返回新摆的。
   */
  relocateGroup(group: Furniture[], ok: () => boolean, samePose?: ReadonlySet<string>): Furniture[] {
    const kids = this.kidsOf(group)
    try {
      return this.relocateGroupOnce(group, ok, samePose)
    } finally {
      this.replaceProps(kids)
    }
  }

  /** 摆在这几件上面的摆件（挪家具时它们跟着被拿掉）：[素材, 所在房间] */
  private kidsOf(group: Furniture[]): [string, Room][] {
    const ids = new Set(group.map((f) => f.id))
    const out: [string, Room][] = []
    for (const o of this.out) {
      if (!o.z || ids.has(o.id)) continue
      const chain = this.occ.chainOf(this.parentOf.get(o.id))
      if (![...chain].some((p) => ids.has(p))) continue
      const d = ASSET_MAP.get(o.asset)
      const room = this.plan.rooms.find((r) => pointInPolygon(o, r.points))
      // 显示器、电脑这类只摆在书桌上的不另找地方（工位那一步管）
      if (d?.prop && !d.stick && d.form !== 'hanging' && !d.screens?.length && d.type !== 'pc' && room) out.push([o.asset, room])
    }
    return out
  }

  /**
   * 挪家具时跟着被拿掉的摆件，在同一个房间里另找台面 / 层板放（洗发水、沐浴露这类卫浴用品放不上就靠墙放地上），
   * 已经有了的（家具挪成功、摆件跟着重新摆上的）不重复放
   */
  private replaceProps(kids: [string, Room][]) {
    for (const [asset, room] of kids) {
      if (this.out.some((o) => o.asset === asset && pointInPolygon(o, room.points))) continue
      const def = ASSET_MAP.get(asset)!
      let done = false
      for (let k = 0; k < 6 && !done; k++) {
        const before = this.out.length
        this.scatter(room, [def], 1)
        done = this.out.length > before
      }
      if (!done && hasTag(def, 'wet-supply')) this.wall(room, asset) ?? this.freePush(room, asset, 0, centroid(room.points))
    }
  }

  private relocateGroupOnce(group: Furniture[], ok: () => boolean, samePose?: ReadonlySet<string>): Furniture[] {
    const keep = group.some((f) => this.fixed.has(f.id)) ? this.checkpoint() : null
    const plans = group.map((f) => {
      const c = bodyCenter(f.asset, f.x, f.y, f.rot)
      // samePose 里的（整屋重摆时的大件）原来的位置也可以再用
      const poses = samePose?.has(f.id) ? new Set<string>() : new Set([this.poseKey(f)])
      return { f, again: this.recipes.get(f.id), avoid: [footprint(f.asset, c.x, c.y, f.rot)], poses, fixed: this.fixed.has(f.id) }
    })
    for (const { f } of plans) this.removeTree(f)
    const placed: Furniture[] = []
    for (const p of plans) {
      this.relocated++
      let got: Furniture | null = null
      for (let t = 0; t < (p.fixed ? 6 : 3) && p.again && !got; t++) {
        // 大件只排除试过的那几个位置；小件避开之前占过的整块地方
        if (p.fixed) this.avoidPose = p.poses
        else this.avoid = p.avoid
        let g: Furniture | null = null
        try {
          g = p.again()
        } finally {
          this.avoid = null
          this.avoidPose = null
        }
        if (!g) break
        if (!this.occ.audit(g, this.fixed).length && ok()) got = g
        else {
          const c = bodyCenter(g.asset, g.x, g.y, g.rot)
          p.avoid.push(footprint(g.asset, c.x, c.y, g.rot))
          p.poses.add(this.poseKey(g))
          this.removeTree(g)
        }
      }
      if (got) {
        this.recipes.set(got.id, p.again!)
        placed.push(got)
      } else if (p.fixed && keep) {
        this.restore(keep)
        return []
      }
    }
    return placed
  }

  /** 别的楼层已经摆好的家具（全户限量的东西要算上它们） */
  get prior(): Furniture[] {
    return this.house?.prior ?? []
  }

  /** 多层户型的上层（不是最底层）：走廊收纳、每层垃圾桶等按层的东西 */
  get upper() {
    return isMultiFloor(this.plan) && this.plan.rooms.length > 0 && floorOf(this.plan, this.plan.rooms[0]) !== baseFloorId(this.plan)
  }

  /** 东西多少的系数（住户性格决定） */
  get clutter() {
    return this.household?.clutter ?? 1
  }

  /** 按住户分配居室：夫妻住最大的，长辈优先和室，孩子、室友各一间，多余的做书房 / 兴趣房 */
  assign() {
    const hh = this.household
    if (!hh) return
    // 多层户型按层布置时用全户统一的分配（同一个人不会在两层都有房间）
    const a = this.house?.alloc ?? allocateRooms(this.plan, hh)
    this.occupants = a.occupants
    this.studyOf = a.studyOf
    this.purposeOf = a.purposeOf
  }

  /** 这个人的房间（住的或书房）在这一层：返回它；在别的层：null；没分到房间：undefined */
  homeOf(m: Member): Room | null | undefined {
    const here = this.plan.rooms.find((r) => this.occupants.get(r.id)?.includes(m) || this.studyOf.get(r.id) === m)
    if (here) return here
    for (const [, ms] of this.occupants) if (ms.includes(m)) return null
    for (const [, o] of this.studyOf) if (o === m) return null
    return undefined
  }

  /** 这个房间用谁的风格 */
  styleFor(room: Room): StyleTag {
    const occ = this.occupants.get(room.id)
    if (occ?.length) return occ[0].style
    return this.studyOf.get(room.id)?.style ?? this.baseStyle
  }

  /** 房间里的人（含书房的主人） */
  peopleIn(room: Room) {
    const occ = this.occupants.get(room.id) ?? []
    const st = this.studyOf.get(room.id)
    return st ? [...occ, st] : occ
  }

  /** 按选择器（语义标签 / 锚定 id 的正则）在素材里找 */
  find(sel: Sel, filter: (d: AssetDef) => boolean = () => true) {
    return findBySel(sel).filter(filter)
  }

  /** 摆件放在哪件家具上（同一台面的数量限制用） */
  parentOf = new Map<string, string>()

  /** limitOf 的结果缓存：allow 里会对已摆的每件家具反复查（每件都要跑一遍 LIMITS 正则） */
  private limits = new Map<AssetDef, ReturnType<Decorator['computeLimit']>>()
  /** 这件素材的数量规则 */
  limitOf(def: AssetDef) {
    let r = this.limits.get(def)
    if (r === undefined) this.limits.set(def, (r = this.computeLimit(def)))
    return r
  }
  private computeLimit(def: AssetDef) {
    const group = def.limitGroup ?? def.series ?? def.id
    if (def.limit) return { group: def.limit.group ?? group, scope: def.limit.scope, max: def.limit.max }
    // 灯具按细分类型算：落地灯每间一盏、壁灯每间一对、台灯每个台面一盏
    const lamp = def.type ? LAMP_TYPES[def.type] : undefined
    if (lamp) return { group: def.type!, scope: lamp.scope, max: lamp.max }
    // 牙刷杯、漱口杯是洗漱用品，不算进全家的杯子数（cup 标签不含它们）
    const r = LIMITS.find(([, tag]) => hasTag(def, ...[tag].flat()))
    // 没有专门规则的：可以多摆的（multi-ok）不限，其余同款（同系列）每个房间一个
    if (!r) return hasTag(def, 'multi-ok') ? null : { group, scope: 'room' as const, max: 1 }
    const max = r[3] === 0 ? (this.household?.members.length ?? 2) + 1 : r[3]
    return { group: r[0], scope: r[2], max }
  }

  /** 一键布置时还能不能再摆这件（手动摆放不经过这里） */
  allow(asset: string, at: Vec, parentId?: string) {
    const def = ASSET_MAP.get(asset)
    if (!def) return false
    if (this.noLimit) return true
    const lim = this.limitOf(def)
    if (!lim) return true
    const same = this.out.filter((o) => {
      const d = ASSET_MAP.get(o.asset)
      const l = d && this.limitOf(d)
      return !!l && l.group === lim.group
    })
    if (lim.scope === 'house') {
      // 全户限量：别的楼层已经有的也算
      const elsewhere = this.prior.length
        ? this.prior.filter((o) => {
            const d = ASSET_MAP.get(o.asset)
            const l = d && this.limitOf(d)
            return !!l && l.group === lim.group
          }).length
        : 0
      return same.length + elsewhere < lim.max
    }
    if (lim.scope === 'surface') return same.filter((o) => this.parentOf.get(o.id) === parentId).length < lim.max
    const room = this.plan.rooms.find((r) => pointInPolygon(at, r.points))
    return same.filter((o) => room && pointInPolygon(o, room.points)).length < lim.max
  }

  /** 按风格挑一组配色：有原生配色就从中挑；没有就用该风格的派生配色（1000 + 风格序号）；都不行才随便挑 */
  colorFor(def: AssetDef) {
    const ok = def.palettes.map((_, i) => i).filter((i) => paletteStyle(def, i) === this.style)
    if (ok.length) return this.pick(ok)
    const r = this.rand() // 保持随机序列的消耗不变
    return hasDerived(def, this.style) ? derivedIndex(this.style) : Math.floor(r * def.palettes.length)
  }

  ctx() {
    return this.occ.ctx()
  }

  /** 占地整块在房间的墙面轮廓内（房间多边形是墙体中心线，直接用它会让家具嵌进半个墙厚） */
  inside(fp: Box, room: Room) {
    return boxInsideWalls(fp, room, this.plan)
  }

  /** 候选位置里前 k 个立体上不冲突的（canPlace），随机挑一个；一个都没有返回 undefined */
  pickClear(c: Fixture[], asset: string, k: number) {
    const ok: Fixture[] = []
    for (const f of c) {
      if (this.canPlace(asset, f.x, f.y, f.rot)) ok.push(f)
      if (ok.length >= k) break
    }
    return ok[Math.floor(this.rand() * ok.length)]
  }

  pick<T>(xs: T[]) {
    return xs[Math.floor(this.rand() * xs.length)]
  }

  push(asset: string, x: number, y: number, rot: number, flat = false) {
    const def = ASSET_MAP.get(asset)!
    const f: Furniture = { id: uid('u'), asset, x: Math.round(x), y: Math.round(y), rot, color: this.colorFor(def) }
    this.out.push(f)
    if (flat) this.flat.add(f.id)
    return f
  }

  /** 贴墙摆一件；返回摆好的家具 */
  wall(room: Room, asset: string, opts: Partial<PlaceSpec> = {}): Furniture | null {
    return this.remember(this.wallOnce(room, asset, opts), () => this.wall(room, asset, opts))
  }

  private wallOnce(room: Room, asset: string, opts: Partial<PlaceSpec> = {}) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)!
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, sash: true, guardFront: true, ...opts }
    const c = placeCandidates(room, this.ctx(), spec)
    // 前几名里随机挑一个，每次布置都有点不一样（不顶到墙上已挂的东西）
    const f = this.pickClear(c, asset, 3)
    if (f && !this.allow(asset, f)) return null
    if (f) return this.push(asset, f.x, f.y, f.rot)
    // 小东西（马桶刷、伞架、垃圾桶…）在挤的小房间里：不管门前 / 设备前的活动空间，只要不撞上实物就行
    return Math.max(def.w, def.d) <= 70 ? this.squeeze(room, asset) : null
  }

  /**
   * 挤一挤：在房间里找一处贴墙、不和设备本体 / 立着的家具重叠的位置（门开合范围、设备前方的活动空间可以占用），
   * 背面朝最近的墙。给检查清单补齐和小房间里的小东西兜底用。
   */
  squeeze(room: Room, asset: string) {
    const def = ASSET_MAP.get(asset)
    if (!def || !this.allow(asset, centroid(room.points))) return null
    const solid = [
      // 设备本体、楼梯口留空区、门扇的开合范围（平开门、折门扫过的地方）、已摆的实体家具
      ...this.hardIn(room, [SWING_ZONES]),
      // 门洞正前方的通道（门宽 × 进深 60）：门的开合范围可以占，但不能堵在门口。通往阳台的落地窗同样是出入口
      ...openingsOn(room, this.plan)
        .filter(({ o, owner, e, center }) => o.kind !== 'window' || isSashWindow(this.plan, owner, e, center))
        .map(({ o, e, center }) => {
          // 门洞可能记在隔壁房间的墙上（法线朝隔壁外侧）：通道一律朝本房间一侧
          const into = pointInPolygon(add(center, mul(e.out, 10)), room.points) ? e.out : mul(e.out, -1)
          const pts = [-1, 1].flatMap((sd) => [0, 60].map((k) => add(add(center, mul(e.dir, (sd * o.width) / 2)), mul(into, k))))
          return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) }
        }),
    ]
    const b = bbox(room.points)
    const edges = edgesOf(room.points)
    const spots: { p: Vec; rot: number; score: number }[] = []
    for (let x = b.x0; x <= b.x1; x += 5)
      for (let y = b.y0; y <= b.y1; y += 5) {
        const p = { x, y }
        // 离最近的墙多远；背面朝那面墙
        let best: { d: number; out: Vec } | null = null
        for (const e of edges) {
          const pr = projectToSegment(p, e.a, e.b)
          if (!best || pr.d < best.d) best = { d: pr.d, out: e.out }
        }
        if (!best) continue
        const rot = rotFacingWall(best.out)
        const fp = footprint(asset, x, y, rot)
        if (!this.inside(fp, room) || solid.some((o) => boxOverlaps(o, fp)) || !this.canPlace(asset, x, y, rot)) continue
        spots.push({ p, rot, score: best.d + this.rand() * 8 })
      }
    spots.sort((a, b) => a.score - b.score)
    const s = spots[0]
    return s ? this.push(asset, s.p.x, s.p.y, s.rot) : null
  }

  /** 地上摆东西要让开的：禁放区（门窗前、落地窗前、楼梯口、设备本体和使用空间）+ 已摆的实体家具 */
  obstacles(room: Room) {
    return this.occ.floorBlockers(room)
  }

  /**
   * 「硬」障碍：设备本体、楼梯口 / 洞口 / 挑空栏杆留空区、已摆的实体家具（门前通道、设备使用空间可以占）。
   * extra：再加上哪些种类的禁放区（门扇开合范围…）
   */
  hardIn(room: Room, extra: ReadonlySet<ZoneKind>[] = []) {
    return [...this.occ.zoneBoxes(room, [HARD_ZONES, ...extra]), ...this.occ.solids(room)]
  }

  /** 在房间里找一块空地，离 target 越近越好；margin 是四周要留的走道 */
  free(room: Room, asset: string, rot: number, target: Vec, margin = 0) {
    const obs = this.obstacles(room)
    const b = bbox(room.points)
    let best: Vec | null = null
    let bd = Infinity
    for (let x = b.x0; x <= b.x1; x += 10)
      for (let y = b.y0; y <= b.y1; y += 10) {
        const fp = footprint(asset, x, y, rot)
        const grown = { x0: fp.x0 - margin, y0: fp.y0 - margin, x1: fp.x1 + margin, y1: fp.y1 + margin }
        if (!this.inside(fp, room)) continue
        if (obs.some((o) => boxOverlaps(o, grown))) continue
        const d = dist({ x, y }, target)
        if (d < bd && this.canPlace(asset, x, y, rot)) {
          bd = d
          best = { x, y }
        }
      }
    return best
  }

  freePush(room: Room, asset: string, rot: number, target: Vec, margin = 0, flat = false): Furniture | null {
    return this.remember(this.freePushOnce(room, asset, rot, target, margin, flat), () => this.freePush(room, asset, rot, target, margin, flat))
  }

  private freePushOnce(room: Room, asset: string, rot: number, target: Vec, margin = 0, flat = false) {
    asset = this.vary(asset)
    if (!this.allow(asset, target)) return null
    const p = this.free(room, asset, rot, target, margin)
    // flat（可以被压在下面、不参与碰撞）只给真的扁平的东西：地毯、垫子；豆袋沙发、茶几这类立着的照样要挡住后来的家具
    return p ? this.push(asset, p.x, p.y, rot, flat && ASSET_MAP.get(asset)!.h <= 3) : null
  }

  /**
   * 壁挂空调：挂在墙上不占地，只避开门窗、不和别的家具碰撞。
   * 优先挂在外墙附近、离门远的墙上（冷暖风吹满整个房间）。
   */
  /** 全屋的空调是同一批装的：第一次挑定款式，之后都用它 */
  private acModel: string | null = null
  aircon(room: Room) {
    this.acModel ??= this.vary('aircon')
    const id = this.acModel
    const def = ASSET_MAP.get(id)!
    const door = firstDoorCenter(room, this.plan)
    // 贴墙候选只先避开已经挂上墙的东西（平面错开）；高度上的规则交给占用表：空调连同下方到 170 的空间不能碰到高家具（衣柜、高书柜、冰箱）、
    // 别的壁挂物、设备（吊柜、抽油烟机、楼梯），也不挂在设备上方
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, far: door, centered: true }
    const f = placeCandidates(room, { ...this.plan, fixtures: this.mountedIn(room) }, spec).find((c) => this.canPlace(id, c.x, c.y, c.rot, undefined, { walls: true, room, inside: false, fixtureFree: true }))
    // 找不到空墙段就不挂（宁可这间没有空调，也不嵌进柜子里）
    if (f) this.push(id, f.x, f.y, f.rot, true)
  }

  /** 挂到墙上：只避开门窗和别的壁挂物，不和地上的家具冲突 */
  mount(room: Room, asset: string): Furniture | null {
    return this.remember(this.mountOnce(room, asset), () => this.mount(room, asset))
  }

  private mountOnce(room: Room, asset: string) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)
    if (!def?.mount) return null
    // 已经挂上墙 / 贴在墙上的东西（贴附物：门边的磁吸挂钩、海报）
    const mounted = this.out.filter((o) => (ASSET_MAP.get(o.asset)?.mount || ASSET_MAP.get(o.asset)?.stick) && pointInPolygon(o, room.points)).map(asFixture)
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, centered: this.rand() < 0.5 }
    const c = placeCandidates(room, { ...this.plan, fixtures: mounted }, spec)
    // 不压到下面的高家具、台面上的东西和设备（吊柜、内置收纳…）
    const f = this.pickClear(c, asset, 4)
    if (f && !this.allow(asset, f)) return null
    return f ? this.push(asset, f.x, f.y, f.rot, true) : null
  }

  /** 房间里能摆东西的家具 */
  surfacesIn(room: Room) {
    return this.out.filter((o) => {
      const d = ASSET_MAP.get(o.asset)
      return !!d && !d.prop && (!!d.surface || !!d.surfaces?.length) && d.h > 5 && pointInPolygon(o, room.points)
    })
  }

  /** 把摆件随机放到房间里的某个台面 / 层板上，放不下就算了 */
  scatter(room: Room, assets: AssetDef[], n: number) {
    const parents = this.surfacesIn(room)
    if (!parents.length || !assets.length) return
    const pool = [...assets]
    for (let k = 0; k < n && pool.length; k++) {
      const a = pool.splice(Math.floor(this.rand() * pool.length), 1)[0]
      for (let t = 0; t < 8; t++) {
        const parent = this.pick(parents)
        const pd = ASSET_MAP.get(parent.asset)!
        // 高处（> 140，书柜顶、吊柜）只放书、绿植、收纳盒、装饰品，不放耳机、手柄、电器之类
        const high = (y: number) => (parent.z ?? 0) + y > 140
        const okHigh = hasTag(a, 'high-ok')
        // 床面只放玩偶、书、手机这类随手放的软东西，不放棋牌、电器
        if (isBed(pd) && !hasTag(a, 'bed-ok')) continue
        const levels = [...(pd.surface && (okHigh || !high(pd.surface)) ? [undefined] : []), ...(pd.surfaces ?? []).flatMap((l, i) => ((okHigh || !high(l.y)) && !(l.inside && !l.glass) ? [i] : []))]
        if (!levels.length) continue
        const lv = this.pick(levels)
        if (this.onLevel(parent, a.id, (this.rand() - 0.5) * 0.7, (this.rand() - 0.5) * 0.6, Math.round((this.rand() - 0.5) * 40), lv)) break
      }
    }
  }

  /** 同一细分类型里「同一尺寸、不同造型」的各款（宽深差在 10% 以内；尺寸规格不同的——床、书桌、餐桌的大小——不算） */
  private siblings = new Map<string, AssetDef[]>()
  /**
   * 换款：经常出现的东西每次都挑同一细分类型（type）里的不同造型，优先当前房间的风格。
   * 只在尺寸几乎一样的款之间换，所以按尺寸挑好的规格（单人床 / 双人床、110 / 140 书桌）不会被换掉。
   */
  vary(asset: string) {
    const def = ASSET_MAP.get(asset)
    if (!def?.type) return asset
    if (LAMP_TYPES[def.type]) return this.lampPick(def.type)
    let sib = this.siblings.get(asset)
    if (!sib) {
      const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.1 + 2
      sib = ASSETS.filter(
        (a) => a.type === def.type && a.form === def.form && !!a.mount === !!def.mount && !!a.prop === !!def.prop && !!a.stick === !!def.stick && near(a.w, def.w) && near(a.d, def.d) && Math.abs(a.h - def.h) <= def.h * 0.35 + 5,
      )
      this.siblings.set(asset, sib)
    }
    // 只在常换款的细分类型上换（见 VARY_TYPES / ALWAYS_VARY）
    if (sib.length < 2 || !(ALWAYS_VARY.has(def.type) || (VARY_TYPES.has(def.type) && def.sizeLabel === '标准'))) return asset
    const styled = sib.filter((a) => a.styles?.includes(this.style))
    return this.pick(styled.length && this.rand() < 0.75 ? styled : sib).id
  }

  private lampPools = new Map<string, AssetDef[]>()
  /**
   * 灯具换款：从同一细分类型（书桌灯还可以用台灯）里均匀地挑，85% 挑当前房间风格的款。
   * 不按尺寸限制换款（各风格的灯高矮胖瘦差别大），只去掉占地太大的（弧形钓鱼灯）；放不下由调用方换一款再试。
   */
  lampPick(type: Tag) {
    const spec = LAMP_TYPES[type]!
    let pool = this.lampPools.get(type)
    if (!pool) {
      pool = ASSETS.filter((a) => !!a.type && spec.pool.includes(a.type) && !a.fixture && Math.max(a.w, a.d) <= spec.maxSide)
      this.lampPools.set(type, pool)
    }
    const styled = pool.filter((a) => a.styles?.includes(this.style))
    const r = this.rand()
    return this.pick(styled.length && r < 0.85 ? styled : pool).id
  }

  /** 房间里要让开的高处障碍：设备（造作收纳、厨房吊柜）和高过壁灯的家具 */
  private tallBoxes(room: Room) {
    return [
      ...this.plan.fixtures.filter((f) => pointInPolygon(f, room.points)).map(fixtureBox),
      ...this.out
        .filter((o) => !o.z && pointInPolygon(o, room.points))
        .filter((o) => {
          const d = ASSET_MAP.get(o.asset)
          return !!d && !d.mount && !d.stick && d.h > 130
        })
        .map((o) => footprint(o.asset, o.x, o.y, o.rot)),
    ]
  }

  /** 床头两侧各一盏壁灯（同一款）；挂不上就算了 */
  bedSconces(room: Room, bed: Furniture) {
    const def = ASSET_MAP.get(bed.asset)
    if (!def) return
    const id = this.lampPick('wall-lamp')
    const lamp = ASSET_MAP.get(id)!
    const fd = frontDir(bed.rot)
    const side = { x: fd.y, y: -fd.x }
    const head = add({ x: bed.x, y: bed.y }, mul(fd, -def.d / 2))
    const extra = this.tallBoxes(room)
    for (const s of [-1, 1]) {
      const l = this.mountAvoiding(room, id, extra, add(head, mul(side, s * (def.w / 2 + lamp.w / 2 + 12))), 45)
      // 壁灯跟着床：床被挪走时一起拿掉
      if (l) this.groupOf.set(l.id, bed.id)
    }
  }

  /** 一定要摆上的小东西：先找台面 / 层板，摆不上就靠墙放地上 */
  must(room: Room, asset: string) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)
    if (!def) return null
    for (let k = 0; k < 6; k++) {
      const before = this.out.length
      this.scatter(room, [def], 1)
      if (this.out.length > before) return this.out[this.out.length - 1]
    }
    return this.wall(room, asset) ?? this.freePush(room, asset, 0, centroid(room.points))
  }

  /**
   * 挂在设备正上方的墙上（设备背面贴的那面墙）：lx 为沿设备宽度方向的偏移。
   * 和已经挂上的东西重叠就不挂。
   */
  mountAbove(fx: Fixture, asset: string, lx = 0) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)
    if (!def?.mount) return null
    const fd = fixtureDepth(fx)
    // 设备背面在墙上；对面式厨房的背面是食器棚，同样贴墙
    const p = toWorld(fx, lx, -fd / 2 + def.d / 2)
    // 不和已经挂上的东西重叠；比设备宽的搁板不能伸进旁边的墙里；也不能撞上吊柜、抽油烟机、旁边的高家具
    const room = this.plan.rooms.find((r) => pointInPolygon(p, r.points))
    if (!room || !this.canPlace(asset, p.x, p.y, fx.rot, undefined, { walls: true, room })) return null
    if (!this.allow(asset, p)) return null
    return this.push(asset, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, fx.rot, true)
  }

  /** 厨房台面上方：开放搁板 / 带挂杆的搁板 / 吊柜（壁挂式厨房避开灶台上方的抽油烟机） */
  kitchenWall(fx: Fixture) {
    const w = fx.w
    // 可挂的区段：壁挂式去掉灶台上方（抽油烟机 60 宽 + 两侧各留 5）；对面式背面食器棚整段
    const hob = w / 2 - 48
    const spans: [number, number][] = fx.variant === 'facing' ? [[-w / 2, w / 2]] : [[-w / 2, hob - 35]]
    const r = this.rand()
    const kind = r < 0.45 ? 'ws-kitchen-shelf' : r < 0.65 ? 'ws-kitchen-rail' : r < 0.9 ? 'ws-kitchen-cab' : null
    if (!kind) return
    for (const [a, b] of spans) {
      const len = b - a
      const fits = [...new Set(seriesIds(`${kind}-60`).concat(seriesIds(`${kind}2-60`)))].map((id) => ASSET_MAP.get(id)!).filter((d) => d.w <= len - 4).sort((x, y) => y.w - x.w)
      if (!fits.length) continue
      // 吊柜尽量占满；搁板随机挑一款
      const d = kind === 'ws-kitchen-cab' ? fits[0] : this.pick(fits.slice(0, 3))
      const shelf = this.mountAbove(fx, d.id, (a + b) / 2 + (this.rand() - 0.5) * Math.max(0, len - d.w - 4))
      // 搁板上摆调料瓶、罐子、杯子、小绿植
      if (shelf && d.surface) {
        const props = this.find('kitchen-shelf-ok', (a) => !!a.prop && a.h < 26 && a.w < d.w / 2 && !a.form?.includes('hanging'))
        const n = 1 + Math.floor(this.rand() * 3 * this.clutter + this.rand())
        for (const a of this.shuffle(props).slice(0, n)) for (let t = 0; t < 4; t++) if (this.onLevel(shelf, a.id, (this.rand() - 0.5) * 0.8, 0, 0, d.surfaces?.length && this.rand() < 0.5 ? 0 : undefined)) break
      }
    }
  }

  /** 马桶正上方：搁板或吊柜，放卷纸备用、芳香剂、小绿植 */
  toiletWall(fx: Fixture) {
    if (this.rand() > 0.7) return
    const id = this.pick(['ws-toilet-shelf', 'ws-toilet-shelf-1', 'ws-toilet-cab'])
    const shelf = this.mountAbove(fx, id)
    const d = shelf && ASSET_MAP.get(id)
    if (!shelf || !d) return
    const props = this.find('toilet-shelf-ok', (a) => !!a.prop && a.h < 20 && a.w < 30 && !a.form?.includes('hanging'))
    const levels = [...(d.surface ? [undefined] : []), ...(d.surfaces ?? []).map((_, i) => i)]
    for (const a of this.shuffle(props).slice(0, 1 + Math.floor(this.rand() * 3)))
      for (let t = 0; t < 4; t++) if (this.onLevel(shelf, a.id, (this.rand() - 0.5) * 0.7, 0, 0, this.pick(levels))) break
  }

  /** 摆一件东西到固定设备的台面上（厨房台面、洗面台、洗衣机顶、马桶水箱盖） */
  onFixture(fx: Fixture, asset: string, lx: number, lz: number, top?: number) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)
    const z = top ?? fixtureTop(fx)
    if (!def || z === null) return null
    const p = toWorld(fx, lx, lz)
    if (!this.allow(asset, p, fx.id)) return null
    const f: Furniture = { id: uid('u'), asset, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: fx.rot, color: this.colorFor(def), z }
    // 指定了高度（对面式厨房的背面食器棚）也要整块落在那一层上：不压到灶台、不悬在台面外
    if (!fitsOnFixture(fx, asset, f.x, f.y, f.rot, top)) return null
    // 不和台面上已有的东西重叠、不顶到墙上挂的东西
    if (!this.canPlace(asset, f.x, f.y, f.rot, z, { parent: fx.id })) return null
    this.out.push(f)
    this.flat.add(f.id)
    this.parentOf.set(f.id, fx.id)
    return f
  }

  /**
   * 厨房台面：烹饪用具优先摆这里。靠墙一排，避开水槽和炉灶；对面式厨房的大件家电放背面食器棚上。
   * 爱料理的人家摆得多，极简的摆得少。
   */
  kitchenDress(fx: Fixture, only?: Sel[]) {
    const w = fx.w
    const facing = fx.variant === 'facing'
    const d = facing ? 200 : 65
    const sx = -w / 2 + w * 0.3
    const bx = w / 2 - 48
    const cooks = this.household?.members.some((m) => m.interests.includes('cooking')) ?? false
    const coffee = this.household?.members.some((m) => m.interests.includes('coffee')) ?? false
    const want: Sel[] = [
      'rice-cooker',
      'electric-kettle',
      'cutting-board',
      'knife-block',
      'toaster',
      'microwave',
      'dish-rack',
      'spice',
      ...(cooks ? (['air-fryer', 'pressure-cooker', 'stand-mixer', 'oil-bottle', 'paper-towel'] as const) : []),
      ...(coffee ? (['coffee-gear'] as const) : []),
    ]
    // 中式 / 欧美厨房微波炉很常见：排到前面
    if (this.region !== 'jp') want.splice(2, 0, ...want.splice(5, 1))
    const n = only ? only.length : Math.round((cooks ? 7 : 4) * this.clutter)
    const blocked: [number, number][] = [
      [sx - 30, sx + 30],
      [bx - 28, bx + 28],
    ]
    let placed = 0
    for (const sel of only ?? want) {
      if (placed >= n) break
      const cand = this.find(sel, (a) => !!a.prop && a.form !== 'hanging')
      if (!cand.length) continue
      const a = this.pick(cand)
      // 大件家电（> 30cm 宽）在对面式厨房里放背面柜上
      const back = facing && a.w > 30
      const top = back ? 92 : 88
      const z0 = back ? -d / 2 : facing ? d / 2 - 65 : -d / 2
      const lz = z0 + a.d / 2 + 2
      const xs: number[] = []
      for (let x = -w / 2 + a.w / 2 + 2; x <= w / 2 - a.w / 2 - 2; x += 5) xs.push(x)
      const ok = xs.filter((x) => back || !blocked.some(([lo, hi]) => x + a.w / 2 > lo && x - a.w / 2 < hi))
      // 砧板放在水槽和炉灶之间
      const pref = hasTag(a, 'cutting-board') ? ok.sort((p, q) => Math.abs(p - (sx + bx) / 2) - Math.abs(q - (sx + bx) / 2)) : ok.sort(() => this.rand() - 0.5)
      for (const x of pref.slice(0, 12)) if (this.onFixture(fx, a.id, x, lz, top)) {
        placed++
        break
      }
    }
  }

  // ---------- 浴室 / 洗面所的补充布置（转角架进墙角、浴缸盖、门外地垫、毛巾挂钩） ----------

  /** 盒子当作一件不占使用空间的设备（壁挂物避让用） */
  private boxFixture(b: Box): Fixture {
    return { id: uid('b'), kind: 'ps', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, d: b.y1 - b.y0, rot: 0 }
  }

  /** 房间里已挂的壁挂物 + 额外要避开的盒子（淋浴） */
  private mountedIn(room: Room, extra: Box[] = []) {
    const mounted = this.out.filter((o) => (ASSET_MAP.get(o.asset)?.mount || ASSET_MAP.get(o.asset)?.stick) && pointInPolygon(o, room.points)).map(asFixture)
    return [...mounted, ...extra.map((b) => this.boxFixture(b))]
  }

  /** 挂到墙上（同 mount），但避开额外的盒子；near 给了就挂在那附近 */
  mountAvoiding(room: Room, asset: string, extra: Box[], near?: Vec, nearMax = 150): Furniture | null {
    return this.remember(this.mountAvoidingOnce(room, asset, extra, near, nearMax), () => this.mountAvoiding(room, asset, extra, near, nearMax))
  }

  private mountAvoidingOnce(room: Room, asset: string, extra: Box[], near?: Vec, nearMax = 150) {
    const def = ASSET_MAP.get(asset)
    if (!def?.mount) return null
    // placeCandidates 不处理 20 以下的长度：小挂钩按 20 找位置，中心不变
    const spec: PlaceSpec = { kind: 'ps', lengths: [Math.max(20, def.w)], depth: def.d, front: 0, centered: !near && this.rand() < 0.5, ...(near ? { near, nearMax } : {}) }
    const c = placeCandidates(room, { ...this.plan, fixtures: this.mountedIn(room, extra) }, spec)
    const f = this.pickClear(c, asset, near ? 2 : 4)
    if (!f || !this.allow(asset, f)) return null
    return this.push(asset, f.x, f.y, f.rot, true)
  }

  /**
   * 浴室墙上的收纳：约六成放转角架（bathCorner），两成多放普通壁挂置物架（直排篮、玻璃板 + 毛巾杆、壁龛感搁板、挂篮），
   * 其余时候不放——东西少的住户（clutter < 1.1）就空着，东西多的退回普通置物架。转角架放不进墙角也退回普通置物架。
   */
  bathStorage(room: Room) {
    const r = this.rand()
    if (r < 0.6 && this.bathCorner(room)) return
    if (r >= 0.85 && this.clutter < 1.1) return
    const cand = ASSETS.filter((a) => a.type === 'bath-wall-shelf' || a.id === 'wet-wire-basket')
    if (cand.length) this.mountAvoiding(room, this.styledPick(cand).id, showerBoxes(this.plan, room))
  }

  /** 在各款里均匀挑一款，七成偏向当前风格（款式本身的 styles 含当前风格的） */
  private styledPick(cand: AssetDef[]) {
    const styled = cand.filter((a) => a.styles?.includes(this.style))
    return this.pick(styled.length && this.rand() < 0.7 ? styled : cand)
  }

  /**
   * 浴室转角架（直角在局部左后）：从细分类型 bath-corner-shelf 的所有款式里挑（三角、扇形、圆角三角、L 形、靠角矩形、深篮、吸盘、
   * 带毛巾杆 / 挂钩、伸缩杆落地款），放进房间的阳角里，背面和左侧各贴一面墙（L 形两臂各贴一面，矩形款背贴墙、左端顶到侧墙）。
   * 壁挂款避开门窗前方、淋浴、已挂的东西、洗面台 / 马桶上方；浴缸上方的墙角排在洗身区墙角之后。
   * 伸缩杆款落地顶到天花板：墙角不能压到任何设备（含浴缸内部）、淋浴、门前通道、已挂的东西和已摆的家具，优先浴缸外侧的墙角。
   * 这一款放不进就换别的款再试两次，都不行返回 null（由调用方改放普通置物架）。
   */
  bathCorner(room: Room) {
    const all = ASSETS.filter((a) => a.type === 'bath-corner-shelf')
    if (!all.length) return null
    const shower = showerBoxes(this.plan, room)
    // 门窗前（含腰窗）、楼梯口
    const guards = this.occ.zoneBoxes(room, [OPENING_ZONES, STAIR_ZONES], { windows: true })
    const fixtures = this.plan.fixtures.filter((f) => pointInPolygon(f, room.points))
    const mounted = this.mountedIn(room).map(fixtureBox)
    const tubs = fixtures.filter((f) => f.kind === 'bathtub').map(fixtureBox)
    const tried = new Set<string>()
    for (let k = 0; k < 3; k++) {
      const pool = all.filter((a) => !tried.has(a.id))
      if (!pool.length) break
      const def = this.styledPick(pool)
      tried.add(def.id)
      const base = cornerSpots(this.plan, room, def.w, def.d)
        .filter((s) => this.inside(s.box, room))
        .filter((s) => ![...shower, ...guards, ...mounted].some((b) => boxOverlaps(b, s.box)))
      let spots: { s: (typeof base)[number]; score: number }[]
      if (def.mount) {
        // 浴缸上方的墙角可以挂，但整个架子要高过浴缸边沿（淋浴房的玻璃隔断更高），不能有一层伸进浴缸里
        const over = (f: Fixture) => f.kind === 'bathtub' && (def.mount ?? 0) >= Math.max(...fixtureSpans(f).map(([, , hi]) => hi)) + 2
        spots = base
          .filter((s) => !fixtures.some((f) => !over(f) && boxOverlaps(fixtureBox(f), s.box)))
          .map((s) => ({ s, score: (tubs.some((b) => boxOverlaps(b, s.box)) ? 10 : 0) + this.rand() }))
      } else {
        // 落地的伸缩杆：整块占地都要空着（设备、浴缸、已摆的落地家具都不能压），靠着浴缸外侧的墙角优先
        const solid = this.occ.solids(room)
        const near = (b: Box) => tubs.some((t) => b.x0 < t.x1 + 15 && b.x1 > t.x0 - 15 && b.y0 < t.y1 + 15 && b.y1 > t.y0 - 15)
        spots = base
          .filter((s) => ![...fixtures.map(fixtureBox), ...solid].some((b) => boxOverlaps(b, s.box)))
          .map((s) => ({ s, score: (near(s.box) ? 0 : 5) + this.rand() }))
      }
      spots.sort((a, b) => a.score - b.score)
      const best = spots[0]?.s
      if (best && this.allow(def.id, best)) return this.push(def.id, best.x, best.y, best.rot, !!def.mount)
    }
    return null
  }

  /** 摆到浴缸边沿上：lx / lz 为浴缸局部坐标，lrot 为相对浴缸的转角 */
  onTub(tub: Fixture, asset: string, lx: number, lz: number, lrot = 0) {
    const def = ASSET_MAP.get(asset)
    const top = fixtureTop(tub)
    if (!def || top === null) return null
    const p = toWorld(tub, lx, lz)
    const f: Furniture = { id: uid('u'), asset, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: (tub.rot + lrot) % 360, color: this.colorFor(def), z: top }
    if (!fitsOnFixture(tub, asset, f.x, f.y, f.rot)) return null
    if (!this.canPlace(asset, f.x, f.y, f.rot, top, { parent: tub.id })) return null
    this.out.push(f)
    this.flat.add(f.id)
    this.parentOf.set(f.id, tub.id)
    return f
  }

  /**
   * 浴缸盖：约四成盖着（卷帘 / 组合板，按浴缸尺寸挑规格），三成多卷起或叠好放在浴缸一端（离淋浴远的那端），其余不放。
   */
  bathLid(tub: Fixture) {
    // 浴缸盖是日式浴缸（保温）才有的；淋浴房没有浴缸
    if (tub.shower || this.region !== 'jp') return
    const d = tub.d ?? 75
    const r = this.rand()
    const size = lidSizeFor(tub.w, d)
    if (r < 0.4 && size) {
      const id = `bx-lid-${this.rand() < 0.55 ? 'roll' : 'panel'}-${size.w}x${size.d}`
      if (ASSET_MAP.has(id) && this.onTub(tub, id, 0, 0)) return
    }
    if (r < 0.78) {
      // 淋浴在哪一侧：放在另一端
      const s = showerSpot(this.plan, tub)
      const a = (tub.rot * Math.PI) / 180
      const side = s ? Math.sign((s.p.x - tub.x) * Math.cos(a) + (s.p.y - tub.y) * Math.sin(a)) || 1 : 1
      const end = s?.mode === 'over' ? side : -side
      const opts: [string, number][] = [
        ['wet-bath-lid-rolled', 9.5],
        ['bx-lid-rolled-60', 8.6],
        ['bx-lid-zigzag', 7.4],
        ['wet-bath-lid-folded', 23],
      ]
      for (const [id, half] of opts.sort(() => this.rand() - 0.5)) if (ASSET_MAP.has(id) && this.onTub(tub, id, end * (tub.w / 2 - half - 1), 0, 90)) return
    }
  }

  /** 挂到挂钩层上：挂点吸附同手动摆放（snapToHook），z = 挂钩层高度 */
  hangOn(parent: Furniture, asset: string) {
    const pd = ASSET_MAP.get(parent.asset)
    const def = ASSET_MAP.get(asset)
    const hooks = (pd?.surfaces ?? []).filter((l) => l.kind === 'hook' && l.shape?.length)
    if (!pd || !def || !hooks.length) return null
    const first = this.pick(hooks)
    // 随机挑的那个钩子挂不下（毛巾垂到下面的东西上、横着伸进墙角），就换别的钩子
    for (const lv of [first, ...hooks.filter((h) => h !== first)]) {
      const poly = lv.shape![0]
      const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
      const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length
      const s = snapToHook({ ...parent, wall: isWallOwner(parent.asset) }, poly, toWorld(parent, cx, cz))
      const z = (parent.z ?? 0) + lv.y
      if (!this.hangFits(asset, s.x, s.y, s.rot, z, parent.id)) continue
      const f: Furniture = { id: uid('u'), asset, x: s.x, y: s.y, rot: s.rot, color: this.colorFor(def), z }
      this.out.push(f)
      this.flat.add(f.id)
      this.parentOf.set(f.id, parent.id)
      return f
    }
    return null
  }

  /**
   * 挂起的东西（毛巾、袋子、衣服）垂下来的范围：不碰到下面的家具、台面上的东西、设备、窗帘，也不横着穿进墙里。
   * parentId（挂在谁身上）不算，可以是家具也可以是设备（壁内收纳的挂衣杆）。规则见 Occupancy.canPlace 的挂件一条。
   */
  hangFits(asset: string, x: number, y: number, rot: number, z: number, parentId: string) {
    const room = this.plan.rooms.find((r) => pointInPolygon({ x, y }, r.points))
    return this.canPlace(asset, x, y, rot, z, { parent: parentId, hang: true, room })
  }

  /**
   * 扁平的小东西（体重秤、地垫）放在设备正前方的两侧：门的开合范围、设备前方的活动空间都可以踩，
   * 只避开真正立着的东西（家具、设备本体）。
   */
  flatNear(room: Room, asset: string, near: Fixture[]) {
    const def = ASSET_MAP.get(asset)
    if (!def) return null
    const solid = this.hardIn(room)
    for (const fx of this.shuffle(near))
      for (const s of this.shuffle([-1, 1])) {
        const p = toWorld(fx, s * (fx.w / 2 - def.w / 2), fixtureDepth(fx) / 2 + def.d / 2 + 6)
        const fp = footprint(asset, p.x, p.y, fx.rot)
        if (!this.inside(fp, room) || solid.some((o) => boxOverlaps(o, fp))) continue
        return this.push(asset, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, fx.rot, true)
      }
    return null
  }

  /**
   * 电脑工位（见 workstation.ts）：台式主机全部收走、按想要主机的房间重新分到书桌座位上（每人最多一台），
   * 有主机就一定配显示器（单 / 双 / 三屏、竖屏、横竖组合，按职业兴趣挑、桌宽不够减屏），主机放桌上一侧或桌下；
   * 其余办公椅、电竞椅前的桌子补笔记本或主机；夹式 / 条形摄像头夹到显示器、电视的顶边。
   */
  computersForChairs() {
    workstations({ d: this, plan: this.plan, rand: this.rand, household: this.household })
  }

  /** 挂到某件家具的挂钩层上、沿杆的 lx 位置（局部坐标） */
  hangAt(parent: Furniture, asset: string, lx: number) {
    const pd = ASSET_MAP.get(parent.asset)
    const def = ASSET_MAP.get(asset)
    const lv = pd?.surfaces?.find((l) => l.kind === 'hook' && l.shape?.length)
    if (!pd || !def || !lv) return null
    const s = snapToHook({ ...parent, wall: isWallOwner(parent.asset) }, lv.shape![0], toWorld(parent, lx, 1))
    if (!this.hangFits(asset, s.x, s.y, s.rot, (parent.z ?? 0) + lv.y, parent.id)) return null
    const f: Furniture = { id: uid('u'), asset, x: s.x, y: s.y, rot: s.rot, color: this.colorFor(def), z: (parent.z ?? 0) + lv.y }
    this.out.push(f)
    this.flat.add(f.id)
    this.parentOf.set(f.id, parent.id)
    return f
  }

  /** 晾衣架上随手晾几件：T 恤、裤子、毛巾、夹着袜子的夹架……件数和位置都随机，不排得太整齐 */
  laundryOn(stand: Furniture) {
    const pd = ASSET_MAP.get(stand.asset)
    const lv = pd?.surfaces?.find((l) => l.kind === 'hook' && l.shape?.length)
    if (!pd || !lv || this.rand() < 0.15) return
    const xs = lv.shape![0].map((q) => q[0])
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    const clothes = this.find('line-dry', (a) => a.form === 'hanging' && a.h <= lv.h! - 5)
    const towels = this.find(/^gm-towel-[a-z0-9-]*-bar$/, (a) => a.h <= lv.h! - 5)
    const pinch = this.find(/^laundry-pinch-full$/)
    // 先抽类型再挑款式：夹着袜子的夹架几乎家家都有，毛巾其次，其余是衣服
    const kind = () => {
      const r = this.rand()
      const list = r < 0.3 && pinch.length ? pinch : r < 0.5 && towels.length ? towels : clothes
      return list.length ? this.pick(list) : null
    }
    let x = x0 + this.rand() * 12
    const n = 2 + Math.floor(this.rand() * 3)
    let pinched = false
    for (let k = 0; k < n; k++) {
      let a = kind()
      // 夹架一个就够
      if (a && pinch.includes(a) && pinched) a = clothes.length ? this.pick(clothes) : null
      if (!a) continue
      if (pinch.includes(a)) pinched = true
      const w = Math.max(a.w, 14)
      if (x + w > x1) break
      this.hangAt(stand, a.id, x + w / 2)
      x += w + 2 + this.rand() * 10
    }
  }

  /** 浴室门（非窗的开口）和门外一侧：into = 从浴室指向门外的单位法线 */
  private bathDoors(bath: Room) {
    return openingsOn(bath, this.plan)
      .filter(({ o }) => o.kind !== 'window')
      .map(({ o, e, center }) => {
        const into = pointInPolygon(add(center, mul(e.out, 5)), bath.points) ? mul(e.out, -1) : e.out
        const half = wallThicknessAt(this.plan, center, into, bath) / 2
        const outside = this.plan.rooms.find((r) => r.id !== bath.id && pointInPolygon(add(center, mul(into, half + 15)), r.points))
        return { o, e, center, into, half, outside }
      })
      .filter((d) => !!d.outside)
  }

  /** 浴室门外正前方的地垫（硅藻土 / 毛巾地垫…）：贴着门洞，避开设备，放不下就沿墙挪一点 */
  bathMat(bath: Room) {
    const mats = this.find('bath-mat', (a) => !!a.prop && a.h < 4)
    if (!mats.length) return
    const diatom = mats.filter((a) => hasTag(a, 'diatomite'))
    for (const door of this.bathDoors(bath)) {
      const room = door.outside!
      const fixtures = this.hardIn(room)
      const pool = diatom.length && this.rand() < 0.5 ? diatom : mats
      const order = [this.pick(pool), ...mats.sort((a, b) => a.w * a.d - b.w * b.d)]
      const rot = rotFacingWall(mul(door.into, -1))
      placed: for (const def of order) {
        const base = add(door.center, mul(door.into, door.half + def.d / 2 + 1))
        for (const k of [0, 5, -5, 10, -10, 15, -15, 20, -20, 30, -30]) {
          const p = add(base, mul(door.e.dir, k))
          const fp = footprint(def.id, p.x, p.y, rot)
          if (!this.inside(fp, room) || fixtures.some((b) => boxOverlaps(b, fp))) continue
          this.push(def.id, p.x, p.y, rot, true)
          break placed
        }
      }
    }
  }

  /** 浴室门外（洗面所一侧）门边的毛巾挂钩 / 毛巾环，挂一条毛巾 */
  towelHookByBath(bath: Room) {
    const hooks = this.find(/^bx-towel-(hook|ring)/, (a) => !!a.mount)
    if (!hooks.length) return
    for (const door of this.bathDoors(bath)) {
      const room = door.outside!
      if (room.kind !== 'wash') continue
      const h = this.mountAvoiding(room, this.pick(hooks).id, [], door.center, door.o.width / 2 + 90)
      if (!h) continue
      const towels = this.find(/^(bx-face-towel-hanging|wet-bath-towel-hanging)/, (a) => a.form === 'hanging')
      if (towels.length && this.rand() < 0.85) this.hangOn(h, this.pick(towels).id)
    }
  }

  /** 浴室里：浴缸盖、浴室毛巾杆（挂面巾）、淋浴台面上的小东西 */
  bathExtras(room: Room) {
    const shower = showerBoxes(this.plan, room)
    for (const tub of this.plan.fixtures.filter((f) => f.kind === 'bathtub' && pointInPolygon(f, room.points))) {
      this.bathLid(tub)
      const s = showerSpot(this.plan, tub)
      if (s?.mode === 'side' && s.full) {
        // 台面（离地 60.4）靠淋浴滑杆一侧，避开水栓
        const along = { x: s.n.y * s.sx, y: -s.n.x * s.sx }
        const items = ['wet-face-wash', 'wet-bath-pouf', 'wet-razor', 'wet-conditioner'].filter((id) => ASSET_MAP.has(id)).sort(() => this.rand() - 0.5)
        const n = this.rand() < 0.5 ? 1 : 2
        for (let i = 0; i < n && i < items.length; i++) {
          const p = add(add(s.p, mul(along, 50 + i * 9)), mul(s.n, 6.5))
          const f = this.push(items[i], p.x, p.y, rotFacingWall(mul(s.n, -1)), true)
          f.z = 60.4
        }
      }
    }
    if (this.rand() < 0.6) {
      const bar = this.mountAvoiding(room, 'bx-towel-bar-bath', shower)
      if (bar && this.rand() < 0.7) this.hangOn(bar, 'bx-face-towel-hanging')
    }
  }

  /** 卫浴、洗衣：设备台面上的日用品 + 墙上的卷纸架、毛巾杆等 */
  wetDress(room: Room) {
    const fixtures = this.plan.fixtures.filter((f) => pointInPolygon(f, room.points))
    const put = (fx: Fixture, sels: Sel[]) => {
      for (const sel of sels) {
        const cand = this.find(sel, (a) => !!a.prop && a.form !== 'hanging')
        if (!cand.length) continue
        const a = this.pick(cand)
        const d = fx.kind === 'kitchen' ? 65 : (fx.d ?? 50)
        for (let t = 0; t < 10; t++) if (this.onFixture(fx, a.id, (this.rand() - 0.5) * (fx.w - a.w - 4), (this.rand() - 0.5) * Math.max(0, d - a.d - 4))) break
      }
    }
    for (const fx of fixtures) {
      if (fx.kind === 'basin') put(fx, ['toothbrush', 'hand-soap', 'skincare'])
      if (fx.kind === 'toilet') put(fx, ['toilet-paper', 'air-freshener'])
    }
    // 洗衣液、柔软剂放在洗衣机（家具）顶上
    const washers = this.washersIn(room)
    if (washers.length) for (const sel of ['detergent', 'softener'] as const) this.onWasher(washers[0], sel)
    const mountOne = (sel: Sel) => {
      const cand = this.find(sel, (a) => !!a.mount)
      if (cand.length) this.mount(room, this.pick(cand).id)
    }
    const floorOne = (sel: Sel) => {
      const cand = this.find(sel, (a) => !a.mount && a.form !== 'hanging' && Math.max(a.w, a.d) < 70)
      if (cand.length) this.wall(room, this.pick(cand).id)
    }
    if (room.kind === 'toilet') {
      floorOne('toilet-brush')
      if (this.rand() < 0.6) floorOne('sanitary-bin')
    } else if (room.kind === 'bath') {
      // 浴室墙上的收纳：转角架（多种造型）/ 普通壁挂置物架 / 不放（bathStorage）
      this.bathStorage(room)
      if (this.region === 'jp') {
        floorOne('bath-stool')
        // 洗澡用的小桶（洗面桶 / 風呂桶）；别挑到拖把水桶、爆米花桶这类同样叫 bucket 的东西
        if (this.rand() < 0.6) floorOne('bath-pail')
      } else {
        // 中式 / 欧美没有日式洗い場（浴凳、洗面桶）；马桶、洗手台和淋浴同在一间：补马桶刷、毛巾杆
        if (fixtures.some((f) => f.kind === 'toilet')) {
          floorOne('toilet-brush')
          const tp = this.find('toilet-paper', (a) => !!a.prop && a.form !== 'hanging')
          if (tp.length && !this.out.some((o) => pointInPolygon(o, room.points) && hasTag(ASSET_MAP.get(o.asset), 'toilet-paper'))) this.must(room, this.pick(tp).id)
        }
        mountOne('towel-bar')
      }
      // 洗发水、沐浴露必备各一瓶（放浴室架上，没地方就靠墙放地上），护发素看运气
      for (const id of ['wet-shampoo', 'wet-body-soap', ...(this.rand() < 0.6 ? ['wet-conditioner'] : [])]) this.must(room, id)
      // 浴缸盖、浴室毛巾杆、淋浴台面小物；门外一定铺浴室地垫，洗面所一侧门边挂毛巾挂钩
      this.bathExtras(room)
      this.bathMat(room)
      if (this.rand() < 0.75) this.towelHookByBath(room)
    } else if (room.kind === 'wash') {
      this.rackOverWasher(room)
      mountOne('towel-bar')
      // 体重秤：洗面所必备，靠墙放地上（同系列里挑一款；有婴儿时偶尔多一台婴儿秤）
      const scales = this.find('body-scale')
      if (scales.length) {
        const flat = scales.filter((d) => d.h < 10)
        const first = this.pick(scales)
        // 贴墙放不下就换扁平款、少留一点前方空间再试，最后在空地上找个角落
        this.wall(room, first.id, { front: 20 }) ??
          this.wall(room, this.pick(flat).id, { front: 0 }) ??
          this.flatNear(room, this.pick(flat).id, fixtures.filter((f) => f.kind === 'basin' || f.kind === 'washer'))
      }
      if (this.household?.members.some((m) => m.age < 2) && this.rand() < 0.5) this.wall(room, 'scale-baby', { front: 20 })
      floorOne('hamper')
      this.scatter(room, this.find(['laundry-supply', 'towel'], (a) => !!a.prop && a.form !== 'hanging'), 3)
    }
  }

  /**
   * 按住户的职业和兴趣布置：兴趣家具（落地，phase = floor，和别的落地家具一起在挂墙之前摆），
   * 工作台上的设备、兴趣摆件（散放到台面 / 层板上）、墙上挂的东西（phase = items，在功能性的东西之后）。
   * 东西多少看性格（clutter）。
   */
  personalize(room: Room, phase: Phase) {
    const people = this.peopleIn(room)
    if (!people.length) return
    const k = this.clutter
    const items = phase === 'items'
    for (const m of people) {
      if (m.age < 3) continue
      const desk = this.out.find((o) => pointInPolygon(o, room.points) && hasTag(ASSET_MAP.get(o.asset), 'table') && ASSET_MAP.get(o.asset)?.surface)
      const deskProps = jobDeskProps(m.job)
      if (items && desk && deskProps.length) for (let i = 0; i < 2; i++) this.onLevel(desk, this.pick(deskProps).id, (this.rand() - 0.5) * 0.6, (this.rand() - 0.5) * 0.4, 0)
      // 等级套装和奖杯证书只摆一处：有自己的兴趣房 / 书房就摆在那里，卧室里不重复
      if (!this.ownsHobbyRoom(m, room)) {
        for (const it of m.interests) {
          const tiers = INTEREST_TIERS[it]
          if (tiers) this.tierItems(room, tiers.slice(0, levelOf(m, it) || 1), phase)
        }
        this.honors(room, m, phase)
      }
      // 益智小物：益智 / 棋牌爱好者、学生、程序员偶尔在桌上 / 架子上放一件
      if (items && !m.interests.includes('puzzles') && (m.interests.includes('boardgames') || ['student', 'schoolkid', 'programmer'].includes(m.job)) && this.rand() < 0.3) this.scatter(room, interestProps('puzzles'), 1)
      for (const it of m.interests) {
        const lv = levelOf(m, it) || 1
        if (!items) {
          const floor = interestFloor(it)
          if (floor.length && this.rand() < (0.45 + 0.15 * lv) * k) this.wall(room, this.pick(floor).id, { front: 40 })
          continue
        }
        const props = it === 'boardgames' ? this.regionalGames(interestProps(it)) : interestProps(it)
        if (props.length) this.scatter(room, props, Math.max(1, Math.round((0.5 + 0.5 * lv) * k)))
        const wall = interestWall(it)
        if (wall.length && this.rand() < 0.5 * k) this.mount(room, this.pick(wall).id)
        const stickers = interestStickers(it)
        if (stickers.length && this.rand() < 0.6 * k) this.stickWall(room, this.pick(stickers).id)
      }
    }
    // 墙上的装饰：挂钟、挂画（不按兴趣）
    if (items && this.rand() < 0.5 * k) {
      const deco = this.find(['wall-art', 'clock'], (a) => !!a.mount)
      if (deco.length) this.mount(room, this.pick(deco).id)
    }
  }

  /** 这个人另有一间兴趣房 / 书房（不住人），等级套装摆到那里 */
  ownsHobbyRoom(m: Member, room: Room) {
    for (const [rid, o] of this.studyOf)
      if (o === m && rid !== room.id && !this.occupants.get(rid)?.length && HOBBY_PURPOSES.includes(this.purposeOf.get(rid) ?? 'guest')) return true
    return false
  }

  /** 按等级套装摆：每一级的落地、摆件、壁挂各挑一件 */
  tierItems(room: Room, tiers: Tier[], phase: Phase = 'all') {
    // 住人的卧室里只放小件落地设备（主机、小防潮柜）；绿幕、机柜、大展示柜、钢琴这类大件要有专门的兴趣房
    const bedroom = !!this.occupants.get(room.id)?.length
    const small = (a: AssetDef) => Math.max(a.w, a.d) <= 70 && a.h <= 120
    for (const t of tiers) {
      if (phase !== 'items')
        for (const sel of t.floor ?? []) {
          const f = this.floorOf(room, sel, { front: 40 }, bedroom ? (a) => small(a) || (CAMERA_CASE.test(a.id) && area(room.points) / 10000 >= 10) : undefined)
          // 相机展示柜 / 防潮柜：先把每一层每一格装满相机和镜头
          if (f && CAMERA_CASE.test(f.asset)) this.fillCameras(f)
        }
      if (phase === 'floor') continue
      for (const sel of t.props ?? []) {
        const c = this.find(sel, (a) => !!a.prop && !a.stick && !a.form?.includes('hanging'))
        // 棋牌按地区加权（中式军旗 / 斗地主、日式花札 / 双六、欧美跳棋 / 拼字…）；其他素材权重都是 1，等同均匀挑
        const a = this.gamePick(c)
        if (a) this.scatter(room, [a], 1)
      }
      for (const sel of t.wall ?? []) {
        const c = this.find(sel, (a) => !!a.mount)
        if (c.length) this.mount(room, this.pick(c).id)
      }
    }
  }

  /** 布置展示柜时临时放开同类数量限制（一柜子相机，同款机身可以有好几台） */
  private noLimit = false
  /** 专用柜（相机展示柜 / 防潮柜）：只放 fillCameras 摆的东西，别的摆件不往里塞 */
  private reserved = new Set<string>()

  /**
   * 相机展示柜 / 防潮柜：每一层的每一格从左到右排满——机身优先（无反、单反、胶片机、运动相机），
   * 每隔两台点缀一支镜头或一台拍立得；格子太矮放不下机身时放镜头。不放无关的摆件。
   */
  fillCameras(cab: Furniture) {
    const pd = ASSET_MAP.get(cab.asset)
    if (!pd?.surfaces?.length) return
    const ok = (a: AssetDef) => !!a.prop && !a.stick && a.form !== 'hanging'
    const bodies = this.find(/^of-camera-(mirrorless|dslr|film)$|^of-action-cam$/, ok)
    const extras = this.find(['lens', /^of-camera-instant$/], ok)
    this.reserved.add(cab.id)
    this.noLimit = true
    try {
      // 矮柜的顶面也摆一台
      if (pd.surface && pd.surface < 110 && bodies.length) this.onLevel(cab, this.pick(bodies).id, 0, 0, Math.round((this.rand() - 0.5) * 40))
      pd.surfaces.forEach((lv, i) => {
        if (lv.kind === 'hook') return
        const cells: Poly[] = lv.shape?.length ? lv.shape : [[[-pd.w / 2, -pd.d / 2], [pd.w / 2, -pd.d / 2], [pd.w / 2, pd.d / 2], [-pd.w / 2, pd.d / 2]]]
        for (const cell of cells) {
          const xs = cell.map((q) => q[0])
          const zs = cell.map((q) => q[1])
          const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
          const fits = (a: AssetDef) => a.h <= (lv.h ?? 40) - 1 && a.d <= z1 - z0 - 1
          const n = Math.max(1, Math.floor((x1 - x0) / 15))
          for (let k = 0; k < n; k++) {
            const cx = x0 + ((x1 - x0) * (k + 0.5)) / n
            const pool = (k % 3 === 2 ? [...extras, ...bodies] : [...bodies, ...extras]).filter(fits)
            const first = this.shuffle(pool.filter((a) => (k % 3 === 2 ? extras : bodies).includes(a)))
            for (const a of [...first, ...this.shuffle(pool)]) if (this.onLevel(cab, a.id, cx / pd.w, (z0 + z1) / 2 / pd.d, 0, i)) break
          }
        }
      })
    } finally {
      this.noLimit = false
    }
  }

  /**
   * 荣誉展示：会拿奖的兴趣到了 Lv.3 / Lv.4，摆奖杯（多了先放一个展示柜）、奖牌、证书；
   * 上学的孩子常有奖状（中式更常见）；上过大学的大人偶尔把毕业证书挂起来，更多是收在证书夹 / 筒 / 盒里。
   */
  honors(room: Room, m: Member, phase: Phase = 'all') {
    const comp = m.interests.filter((it) => COMPETITIVE.includes(it) && levelOf(m, it) >= 3)
    const n = comp.reduce((a, it) => a + levelOf(m, it) - 2, 0)
    const walls = (sel: Sel) => this.find(sel, (a) => !!a.mount)
    if (phase === 'floor') {
      // 落地的只有奖杯展示柜
      if (n >= 2 && this.rand() < 0.6 && (!this.occupants.get(room.id)?.length || area(room.points) / 10000 >= 12)) this.floorOf(room, /^(col-lit-showcase|lv-display)$/, { front: 40 })
      return
    }
    if (n) {
      if (phase === 'all' && n >= 2 && this.rand() < 0.6 && (!this.occupants.get(room.id)?.length || area(room.points) / 10000 >= 12)) this.floorOf(room, /^(col-lit-showcase|lv-display)$/, { front: 40 })
      const cups = this.find('trophy', (a) => !!a.prop)
      this.scatter(room, this.shuffle(cups).slice(0, n + 2), n + 1)
      if (comp.some((it) => ['sports', 'fitness', 'outdoor', 'boardgames', 'puzzles', 'gaming'].includes(it))) {
        if (this.rand() < 0.5) this.scatter(room, this.find(/^hg-medal-(gold|silver|bronze)$/), 1 + Math.floor(this.rand() * 2))
        else {
          const w = walls(/^(hg-medal-frame|int-medal-rack)$/)
          if (w.length) this.mount(room, this.pick(w).id)
        }
      }
      if (this.rand() < 0.5) {
        const c = walls(/^hg-cert-(cert|award)-m$/)
        if (c.length) this.mount(room, this.pick(c).id)
      }
    }
    if (m.age >= 6 && m.age < 18 && this.rand() < (this.region === 'cn' ? 0.7 : 0.3)) {
      const c = walls(/^hg-cert-award-(s|m)$/)
      for (let i = 0; i < (this.region === 'cn' ? 2 : 1) && c.length; i++) this.mount(room, this.pick(c).id)
    }
    if (m.age >= 23 && ['programmer', 'engineer', 'designer', 'teacher', 'researcher', 'nurse', 'office', 'photographer'].includes(m.job) && this.rand() < 0.35) {
      if (this.rand() < (this.region === 'west' || this.style === 'classic' ? 0.6 : 0.3)) {
        const c = walls(/^hg-cert-(diploma-l|cert-m)$/)
        if (c.length) this.mount(room, this.pick(c).id)
      } else {
        const c = this.find(/^hg-cert-(folder|stack|tube|box)$/, (a) => !!a.prop)
        if (c.length) this.scatter(room, [this.pick(c)], 1)
      }
    }
  }

  /** 双人并排电竞台（两个人都爱打游戏：一个 Lv.3 以上、另一个至少 Lv.2）：两把电竞椅、各自一套外设，两台主机，墙上六边形灯板 */
  duoGaming(room: Room) {
    const gamers = (this.household?.members ?? []).filter((m) => levelOf(m, 'gaming') >= 2)
    if (gamers.length < 2 || !gamers.some((m) => levelOf(m, 'gaming') >= 3)) return null
    const before = this.out.length
    const duo = this.wall(room, 'hg-duo-gaming-desk', { front: 80 })
    if (!duo) return null
    if (!this.fitsFree(room, duo)) {
      this.out.splice(before)
      return null
    }
    const dd = ASSET_MAP.get(duo.asset)!
    const fd = frontDir(duo.rot)
    const side = { x: fd.y, y: -fd.x }
    const chairs = this.find('gaming-chair', (a) => !a.prop && a.category !== 'tabletop')
    for (const s of [-1, 1]) {
      const q = add(add({ x: duo.x, y: duo.y }, mul(fd, dd.d / 2 + 12)), mul(side, s * dd.w * 0.25))
      this.push(chairs.length ? this.pick(chairs).id : this.chairAsset(), q.x, q.y, (duo.rot + 180) % 360)
      for (const re of [/^of-monitor-gaming$/, /^of-kb-.*-rgb$/, /^of-mouse-rgb$/, /^of-headset-stand-rgb$/]) {
        const c = this.find(re, (a) => !!a.prop && a.form !== 'hanging')
        if (c.length) this.onLevel(duo, this.pick(c).id, s * 0.25 + (this.rand() - 0.5) * 0.15, (this.rand() - 0.5) * 0.3, 0)
      }
    }
    for (let i = 0; i < 2; i++) this.floorOf(room, /^of-pc-(mid|full)$/, { front: 30 })
    this.mount(room, 'hg-hex-lights')
    return duo
  }

  /** 摆好的家具整块在房间内，也不压着被褥、坐垫这类「软」的落地物（它们不参与常规碰撞） */
  fitsFree(room: Room, f: Furniture) {
    const fp = footprint(f.asset, f.x, f.y, f.rot)
    if (!this.inside(fp, room)) return false
    return !this.out.some((o) => {
      if (o === f || o.z || !this.flat.has(o.id)) return false
      const d = ASSET_MAP.get(o.asset)
      return !!d && d.h > 3 && !d.mount && !d.stick && boxOverlaps(fp, footprint(o.asset, o.x, o.y, o.rot))
    })
  }

  /** 房间中央找空地放一件（四周留 margin），压到软物就撤掉 */
  freeFit(room: Room, asset: string, margin: number) {
    this.style = this.styleFor(room)
    const before = this.out.length
    const f = this.freePush(room, asset, 0, centroid(room.points), margin)
    if (f && !this.fitsFree(room, f)) {
      this.out.splice(before)
      return null
    }
    return f
  }

  /** 椅子 / 坐垫围着桌子摆：sides 指定哪几边（0 正面、1 右、2 背面、3 左），放不下的边跳过 */
  seatAround(room: Room, table: Furniture, seat: string, sides = [0, 1, 2, 3], gap = 6, got: Furniture[] = []) {
    const td = ASSET_MAP.get(table.asset)!
    const sd = ASSET_MAP.get(seat)
    if (!sd) return 0
    const tb = footprint(table.asset, table.x, table.y, table.rot)
    const obs = this.obstacles(room).filter((o) => !boxOverlaps(o, tb))
    let n = 0
    for (const k of sides) {
      const dir = frontDir(table.rot + k * 90)
      const half = (k % 2 ? td.w : td.d) / 2
      const p = add({ x: table.x, y: table.y }, mul(dir, half + sd.d / 2 - 4 + gap))
      const rot = (table.rot + k * 90 + 180) % 360
      const fp = footprint(seat, p.x, p.y, rot)
      // canPlace 再查一遍楼梯口等留空区（它们可能登记在隔壁房间，不在 obstacles 里）
      if (!this.inside(fp, room) || obs.some((o) => boxOverlaps(o, fp)) || !this.canPlace(seat, p.x, p.y, rot)) continue
      const s = this.push(seat, p.x, p.y, rot)
      if (!this.fitsFree(room, s)) {
        this.out.pop()
        continue
      }
      got.push(s)
      n++
    }
    return n
  }

  /** 牌桌 / 棋桌：找空地（四周留出入座的空间），再围一圈座位；座位放不满两个就撤掉 */
  gameTable(room: Room, asset: string, seat: string, sides = [0, 1, 2, 3], margin = 50, dress?: (t: Furniture) => void) {
    this.style = this.styleFor(room)
    const before = this.out.length
    const t = this.freePush(room, asset, 0, centroid(room.points), margin)
    if (!t) return null
    const seats: Furniture[] = []
    if (!this.fitsFree(room, t) || this.seatAround(room, t, seat, sides, 6, seats) < Math.min(2, sides.length)) {
      this.out.splice(before)
      return null
    }
    dress?.(t)
    this.group(t, seats, () => this.gameTable(room, asset, seat, sides, margin, dress))
    return t
  }

  /** 摆一件同系列里随机的款（按 id 正则），放在台面 (fx, fz) 处 */
  onLevelAny(parent: Furniture, sel: Sel, fx = 0, fz = 0, lrot = 0) {
    for (const a of this.shuffle(this.find(sel, (d) => !!d.prop))) if (this.onLevel(parent, a.id, fx, fz, lrot)) return true
    return false
  }

  /** 围棋：棋盘居中，黑白两只棋罐放在棋盘两侧的对角（各在一位棋手一侧）；材质（木 / 藤编）成对 */
  goSet(table: Furniture) {
    if (!this.onLevelAny(table, /^hg-go-board/)) return
    const td = ASSET_MAP.get(table.asset)!
    const rattan = this.rand() < 0.35 ? 'rattan-' : ''
    const fx = Math.min(0.45, (45 / 2 + 7) / td.w)
    const fz = 0.3
    this.onLevel(table, `hg-go-bowl-${rattan}black`, fx, fz, 0)
    this.onLevel(table, `hg-go-bowl-${rattan}white`, -fx, -fz, 180)
  }

  /** 象棋 / 国际象棋 / 将棋（平板）：从同类棋盘的各种棋局状态里挑一款，居中放在桌上 */
  boardSet(table: Furniture, kind: 'xiangqi' | 'chess' | 'shogi') {
    this.onLevelAny(table, new RegExp(`^int-${kind}(-|$)`))
  }

  /** 麻将：普通麻将桌上放牌墙 / 牌局（不带垫的放绒面桌，带垫的放普通桌） */
  mahjongSet(table: Furniture) {
    const felt = /^(hg-jantaku|hg-mj-fold)$/.test(table.asset)
    this.onLevelAny(table, felt ? /^hg-mj-(walls|hands)$/ : /^int-mahjong-mat-/)
  }

  /**
   * 落地小件（足付き碁盤旁的棋笥）：贴地放在 p，整块在房间内、不和任何落地物（含坐垫这类软物）重叠才放
   */
  floorBeside(room: Room, asset: string, p: Vec, rot: number) {
    if (!ASSET_MAP.has(asset)) return null
    const fp = footprint(asset, p.x, p.y, rot)
    if (!this.inside(fp, room)) return null
    const hit = this.out.some((o) => {
      if (o.z) return false
      const d = ASSET_MAP.get(o.asset)
      return !!d && !d.mount && !d.stick && d.h > 1 && boxOverlaps(fp, footprint(o.asset, o.x, o.y, o.rot))
    })
    if (hit || this.obstacles(room).some((o) => boxOverlaps(o, fp))) return null
    return this.push(asset, p.x, p.y, rot)
  }

  /** 足付き碁盤：两位棋手对坐（坐垫），棋笥放在各自右手边的榻榻米上 */
  goBanSet(ban: Furniture, room: Room) {
    const bd = ASSET_MAP.get(ban.asset)!
    const fd = frontDir(ban.rot)
    const side = { x: fd.y, y: -fd.x }
    for (const [s, stone] of [[1, 'black'], [-1, 'white']] as const) {
      const p = add(add({ x: ban.x, y: ban.y }, mul(side, s * (bd.w / 2 + 9))), mul(fd, s * (bd.d / 2 - 6)))
      this.floorBeside(room, `hg-go-bowl-${stone}`, p, (ban.rot + (s > 0 ? 0 : 180)) % 360)
    }
  }

  /** 牌桌的座位：和室坐垫，中式方凳，其余餐椅 */
  seatFor(room: Room) {
    if (room.kind === 'japanese') return 'zabuton'
    if (this.style === 'chinese') {
      const ids = ['ch-square-stool', 'c2-frame-stool'].filter((id) => ASSET_MAP.has(id))
      if (ids.length) return this.pick(ids)
    }
    return this.vary('dining-chair')
  }

  /**
   * 地区特色：中式的自动麻将桌、围棋 / 象棋桌、茶台；日式和室的手积麻将桌、足付き碁盤 / 将棋盤、神棚；
   * 欧美的台球桌、飞镖盘、国际象棋桌。按地区和住户（长辈、棋牌等级、茶道…）概率出现，放不下就算了。
   */
  specialties() {
    const hh = this.household
    if (!hh) return
    const elder = hh.members.some((m) => m.role === 'elder' || m.age >= 60)
    const bg = topLevel(hh, 'boardgames')
    const big = (r: Room) => area(r.points) / 10000
    const ldk = this.plan.rooms.filter((r) => r.kind === 'ldk').sort((a, b) => big(b) - big(a))[0]
    const spare = this.plan.rooms.filter((r) => ['cards', 'hobby', 'guest', 'library', 'gaming', 'study'].includes(this.purposeOf.get(r.id) ?? ''))
    // 和室：没人住的优先
    const washitsu = this.plan.rooms.filter((r) => r.kind === 'japanese').sort((a, b) => Number(!!this.occupants.get(a.id)?.length) - Number(!!this.occupants.get(b.id)?.length))
    const hasCards = [...this.purposeOf.values()].includes('cards')
    const tryRooms = (rooms: (Room | undefined)[], fn: (r: Room) => unknown) => {
      for (const r of rooms) if (r && fn(r)) return true
      return false
    }
    const traditional = hh.members.some((m) => m.traits.includes('traditional'))
    if (this.region === 'cn') {
      // 自动麻将桌（棋牌室里已经有了就不再摆）；棋牌兴趣不高时多是折叠麻将桌
      if (!hasCards && this.rand() < 0.12 + (elder ? 0.3 : 0) + (bg >= 3 ? 0.35 : bg >= 2 ? 0.15 : 0) + (hh.kind === 'three-gen' ? 0.1 : 0)) {
        // 自动麻将机是一体机（成品）；折叠麻将桌只是桌子，牌另摆
        const fold = bg < 3 && this.rand() < 0.4
        const tables = fold ? ['hg-mj-fold'] : this.find(/^(int-mahjong-(table|shuffle|walls|win)|hg-mj-covered)$/).map((a) => a.id)
        tryRooms([...spare, ldk && big(ldk) >= 15 ? ldk : undefined, ...this.plan.rooms.filter((r) => r.kind === 'dining' && big(r) >= 15)], (r) => this.gameTable(r, this.pick(tables), this.seatFor(r), [0, 1, 2, 3], 50, fold ? (t) => this.mahjongSet(t) : undefined))
      }
      // 围棋 / 象棋：中式方桌，两人对坐
      if (this.rand() < 0.08 + (elder ? 0.3 : 0) + (bg >= 2 ? 0.25 : 0)) {
        // 中式方桌式棋桌 + 平板棋盘（围棋带一对棋罐 / 象棋），两人对坐
        // 不是围棋时：一半象棋，一半军旗 / 五子棋 / 斗兽棋 / 跳棋
        const go = this.rand() < 0.5
        tryRooms([...spare, ldk], (r) => this.gameTable(r, 'hg-qizhuo', this.seatFor(r), [0, 2], 40, (t) => (go ? this.goSet(t) : this.rand() < 0.5 ? this.boardSet(t, 'xiangqi') : this.onLevelAny(t, /^(bg-(junqi-(setup|mid|flip)|gomoku|doushou)|int-chinese-checkers)(-|$)/))))
      }
      // 斗地主 / 掼蛋：方桌四面坐人，桌上一局扑克
      if (this.rand() < 0.05 + (bg >= 2 ? 0.2 : 0) + (elder ? 0.05 : 0)) tryRooms([...spare, ldk], (r) => this.gameTable(r, 'hg-qizhuo', this.seatFor(r), [0, 1, 2, 3], 45, (t) => this.onLevelAny(t, /^bg-poker-(ddz|guandan)$/)))
      // 茶台
      if (ldk && this.rand() < 0.1 + (topLevel(hh, 'tea') ? 0.35 : 0) + (elder ? 0.15 : 0) + (hh.style === 'chinese' ? 0.2 : 0)) {
        this.style = this.styleFor(ldk)
        this.wall(ldk, 'sw-cn-chatai', { front: 90 })
      }
    } else if (this.region === 'jp') {
      if (this.rand() < 0.06 + (bg >= 3 ? 0.4 : 0) + (elder ? 0.12 : 0)) tryRooms(washitsu, (r) => this.gameTable(r, 'hg-jantaku', 'zabuton', [0, 1, 2, 3], 40, (t) => this.mahjongSet(t)))
      // 足付き碁盤 / 将棋盤：直接放在榻榻米上，两人对坐
      if (this.rand() < 0.08 + (elder ? 0.3 : 0) + (bg >= 2 ? 0.25 : 0)) {
        const go = this.rand() < 0.55
        tryRooms(washitsu, (r) => this.gameTable(r, go ? 'hg-go-ban' : 'hg-shogi-ban', 'zabuton', [0, 2], 30, go ? (t) => this.goBanSet(t, r) : undefined))
      }
      // 花札：和室榻榻米上铺一块座布团对局，两人对坐
      if (this.rand() < 0.05 + (bg >= 2 ? 0.2 : 0) + (elder ? 0.1 : 0)) tryRooms([...washitsu, ldk], (r) => this.gameTable(r, 'bg-hanafuda-mat', 'zabuton', [0, 2], 30))
      if (this.rand() < 0.12 + (elder || traditional ? 0.35 : 0)) {
        const r = washitsu[0] ?? ldk
        if (r) {
          this.style = this.styleFor(r)
          this.mount(r, 'ss-kamidana')
        }
      }
    } else {
      const sporty = Math.max(bg, topLevel(hh, 'sports'), topLevel(hh, 'gaming'))
      if (this.rand() < 0.15 + (bg >= 3 || topLevel(hh, 'sports') >= 3 ? 0.3 : 0)) {
        tryRooms([...spare.filter((r) => big(r) >= 13), ldk && big(ldk) >= 40 ? ldk : undefined], (r) => {
          this.style = this.styleFor(r)
          return this.freeFit(r, 'hg-pool-table', 60)
        })
      }
      if (this.rand() < 0.15 + (sporty >= 2 ? 0.25 : 0)) {
        const id = this.rand() < 0.5 ? 'hg-dartboard' : 'hg-dart-cabinet'
        tryRooms([...spare.filter((r) => ['gaming', 'hobby', 'cards'].includes(this.purposeOf.get(r.id) ?? '')), ldk], (r) => {
          this.style = this.styleFor(r)
          return this.mount(r, id)
        })
      }
      if (this.rand() < 0.1 + (bg >= 2 ? 0.3 : 0) + (elder ? 0.15 : 0)) tryRooms([...spare.filter((r) => this.purposeOf.get(r.id) === 'library'), ldk], (r) => this.gameTable(r, 'hg-game-table-round', this.vary('dining-chair'), [0, 2], 40, (t) => (this.rand() < 0.55 ? this.boardSet(t, 'chess') : this.onLevelAny(t, /^(bg-checkers|int-backgammon)(-|$)/))))
    }
    this.gameNight()
    this.style = this.baseStyle
  }

  /**
   * 桌游之夜：爱玩棋牌的人家（Lv.2 起）偶尔在餐桌 / 被炉 / 矮桌上摊着一局（座位就是桌边原有的椅子 / 坐垫），
   * 按地区挑：中式斗地主 / 掼蛋 / 飞行棋 / 军旗，日式黑白棋 / 双六 / 花札，欧美地产桌游 / 拼字 / 德州扑克 / 多米诺。
   */
  gameNight() {
    const bg = topLevel(this.household, 'boardgames')
    if (bg < 2 || this.rand() >= 0.2 + (bg >= 3 ? 0.2 : 0)) return
    const tables = this.shuffle(
      this.out.filter((o) => {
        const d = ASSET_MAP.get(o.asset)
        return !o.z && !!d?.surface && !d.prop && hasTag(d, 'dining-table', 'low-table')
      }),
    )
    const pool = this.find(/^(bg-(poker-|feixing|junqi-(mid|flip)|gomoku|paijiu-reveal|sugoroku$|property$|words$|holdem|dominoes|checkers-mid)|int-(reversi|hanafuda-dealing|poker-dealing|uno-dealing|card-game|mahjong-mat|bg-|chess-(study|endgame)|backgammon$))/, (a) => !!a.prop)
    for (const t of tables.slice(0, 2)) {
      this.style = this.styleFor(this.plan.rooms.find((r) => pointInPolygon(t, r.points)) ?? this.plan.rooms[0])
      for (let k = 0; k < 4; k++) {
        const a = this.gamePick(pool)
        if (a && this.onLevel(t, a.id, 0, 0, 0)) return
      }
    }
  }

  /** 全家共同的兴趣放在客厅：养猫、园艺、水族、乐器、鸟笼 / 小动物笼（笼子全屋限一只，主人房间里已经有了就不再摆） */
  shared(room: Room, phase: Phase) {
    const hh = this.household
    if (!hh) return
    const all = new Set<InterestId>(hh.members.flatMap((m) => m.interests))
    // 茶几 / 电视柜上的益智小物
    if (phase === 'items') {
      if ((all.has('puzzles') || all.has('boardgames')) && this.rand() < 0.3) this.scatter(room, interestProps('puzzles'), 1)
      return
    }
    for (const it of ['cats', 'dogs', 'plants', 'aquarium', 'music', 'birds', 'smallpets'] as InterestId[]) {
      if (!all.has(it)) continue
      if ((it === 'birds' || it === 'smallpets') && this.rand() < 0.4) continue
      // 会走动的宠物本体（act- 角色）不进随机池，下面单独放一只
      const floor = interestFloor(it).filter((a) => a.actor?.role !== 'body')
      if (floor.length) this.wall(room, this.pick(floor).id, { front: 50 })
      if (it === 'cats' || it === 'dogs') {
        const pets = ASSETS.filter((a) => a.id.startsWith('act-') && a.actor?.role === 'body' && a.actor.kind === (it === 'cats' ? 'cat' : 'dog'))
        if (pets.length) this.wall(room, this.pick(pets).id, { front: 30 })
      }
    }
  }

  /** 餐桌周围补餐椅，补到 n 把 */
  chairsUpTo(room: Room, n: number) {
    // 一张桌子周围的椅子是同一款（换款只换一次）
    const chairId = this.vary('dining-chair')
    const table = this.out.find((f) => pointInPolygon(f, room.points) && hasTag(ASSET_MAP.get(f.asset), 'dining-table'))
    if (!table) return
    const def = ASSET_MAP.get(table.asset)!
    const fd = frontDir(table.rot)
    const side = { x: fd.y, y: -fd.x }
    const isChair = (f: Furniture) => hasTag(ASSET_MAP.get(f.asset), 'chair') && dist(f, table) < Math.max(def.w, def.d)
    let have = this.out.filter(isChair).length
    const per = def.w > 140 ? 3 : 2
    const obs = this.obstacles(room).filter((o) => !boxOverlaps(o, footprint(table.asset, table.x, table.y, table.rot)))
    for (const s of [-1, 1])
      for (let i = 0; i < per && have < n; i++) {
        const along = (i - (per - 1) / 2) * 52
        const p = add(add({ x: table.x, y: table.y }, mul(fd, s * (def.d / 2 + 6))), mul(side, along))
        if (this.out.some((f) => isChair(f) && dist(f, p) < 20)) continue
        const rot = s > 0 ? (table.rot + 180) % 360 : table.rot
        const fp = footprint(chairId, p.x, p.y, rot)
        if (!this.inside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
        this.push(chairId, p.x, p.y, rot)
        have++
      }
  }

  /** 补一张床：按住户 / 面积挑规格、按床的打分规则挑位置（放不下就换小一号），床头柜跟着床 */
  bedIn(room: Room) {
    const [bed] = this.major(room, [this.bedSlot(room, 30)])
    if (bed) this.bedPlaced(room, bed)
    return !!bed
  }

  /** 床上的毛绒玩偶：不是必有；有的话从各种玩偶里随机挑 1–3 只，位置、朝向都随意，别摆得太规整 */
  plushOnBed(bed: Furniture, people: Member[]) {
    const def = ASSET_MAP.get(bed.asset)
    if (!def?.surface) return
    const young = people.some((m) => m.age < 30)
    const chance = 0.2 + (this.style === 'cute' ? 0.3 : 0) + (young ? 0.15 : 0)
    if (this.rand() > chance) return
    const pool = this.find('plush', (a) => !!a.prop && !a.form?.includes('hanging') && a.w <= def.w * 0.8)
    const n = 1 + Math.floor(this.rand() * this.rand() * 3)
    for (const a of this.shuffle(pool).slice(0, n))
      for (let k = 0; k < 4; k++) if (this.onLevel(bed, a.id, (this.rand() - 0.5) * 0.7, this.rand() * 0.45, Math.round(this.rand() * 360))) break
  }

  shuffle<T>(a: T[]) {
    const b = [...a]
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1))
      ;[b[i], b[j]] = [b[j], b[i]]
    }
    return b
  }

  /** 补书桌 + 椅子 */
  deskIn(room: Room) {
    const desk = this.wall(room, 'desk', { front: 60 })
    if (!desk) return false
    this.seatAt(room, desk, this.chairAsset(), 38)
    return true
  }

  /**
   * 书桌前放椅子（离桌子中心 dist，面朝桌子）：不压别的家具和设备、不嵌进墙里、不堵门（门的开合范围、门前通道、落地窗前）。
   * 放不下就往桌下多塞一点，再不行就不放。
   */
  seatAt(room: Room, desk: Furniture, chair: string, dist: number) {
    const fd = frontDir(desk.rot)
    const rot = (desk.rot + 180) % 360
    // 设备本体、已摆的家具（书桌本身除外）、门窗前和楼梯口；设备前方的使用空间可以占
    const obs = this.occ.floorBlockers(room, { fronts: false, except: new Set([desk.id]) })
    for (const k of [0, -6, -12]) {
      const p = add({ x: desk.x, y: desk.y }, mul(fd, dist + k))
      const fp = footprint(chair, p.x, p.y, rot)
      if (!this.inside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
      return this.push(chair, p.x, p.y, rot)
    }
    return null
  }

  /** 书桌椅：可爱风用猫耳椅，其余风格挑朴素的办公椅 / 书桌椅 */
  chairAsset() {
    // 家里有在家办公的人：多半配一把人体工学椅（网背 / 带头枕 / 带脚托 / 简约网椅），优先同风格配色的款式
    const wfh = this.household?.members.some((m) => m.role !== 'child' && JOBS[m.job]?.wfh) ?? false
    if (wfh && this.rand() < 0.65) {
      const ergo = this.find('ergonomic-chair', (a) => !a.prop && a.category === 'study' && a.form !== 'closed')
      const fit = ergo.filter((a) => (a.styles ?? []).includes(this.style))
      if (ergo.length) return this.pick(fit.length ? fit : ergo).id
    }
    if (this.style === 'cute' && this.rand() < 0.6) return 'desk-chair'
    const plain = this.find('office-chair', (a) => !a.prop && (a.category === 'study' || a.category === 'dining') && a.id !== 'desk-chair' && (a.styles ?? []).includes(this.style))
    const any = plain.length ? plain : this.find('office-chair', (a) => !a.prop && a.id !== 'desk-chair')
    return any.length ? this.pick(any).id : 'dining-chair'
  }

  /** 贴到墙上（海报、照片）：靠墙找个空位，贴在离地约 150 的高度 */
  stickWall(room: Room, asset: string): Furniture | null {
    return this.remember(this.stickWallOnce(room, asset), () => this.stickWall(room, asset))
  }

  private stickWallOnce(room: Room, asset: string) {
    const def = ASSET_MAP.get(asset)
    if (!def?.stick) return null
    const mounted = this.out.filter((o) => (ASSET_MAP.get(o.asset)?.mount || ASSET_MAP.get(o.asset)?.stick) && pointInPolygon(o, room.points)).map(asFixture)
    const c = placeCandidates(room, { ...this.plan, fixtures: mounted }, { kind: 'ps', lengths: [def.w], depth: Math.max(1, def.d), front: 0, centered: this.rand() < 0.5 })
    // 原点在背面中心：中心高度 150（大海报再高一点，避免碰到家具）
    const z = Math.max(150, def.h / 2 + 100)
    const ok: Fixture[] = []
    for (const q of c) {
      if (this.canPlace(asset, q.x, q.y, q.rot, z)) ok.push(q)
      if (ok.length >= 4) break
    }
    const f = ok[Math.floor(this.rand() * ok.length)]
    if (!f || !this.allow(asset, f)) return null
    const out = this.push(asset, f.x, f.y, f.rot, true)
    out.z = z
    return out
  }

  /** 冰箱（家具）门上的冰箱贴、便签、照片：东西多的人家贴得多 */
  fridgeMagnets(fr: Furniture) {
    const fd = ASSET_MAP.get(fr.asset)
    if (!fd) return
    const cand = this.find('fridge-door', (a) => !!a.stick)
    if (!cand.length) return
    const kids = this.household?.members.some((m) => m.role === 'child' && m.age < 12) ?? false
    const n = Math.round((1 + this.rand() * 3) * this.clutter)
    const top = fd.h
    // 已经贴上的（门面上的横向位置 lx、高度 z、宽、高）：互相错开 1cm，找不到空位就少贴一张
    const placed: [number, number, number, number][] = []
    for (let i = 0; i < n; i++) {
      const pool = kids ? cand : cand.filter((c) => !hasTag(c, 'for-kids'))
      const def = this.pick(pool.length ? pool : cand)
      let spot: [number, number] | null = null
      for (let k = 0; k < 10 && !spot; k++) {
        const lx = (this.rand() - 0.5) * (fd.w - 20)
        // 贴在冰箱门上：高度在冰箱顶以下（两门小冰箱、迷你冰箱矮）
        const z = Math.min(top - 15, 95 + this.rand() * 60) - (top < 140 ? Math.min(40, top - 50) * this.rand() : 0)
        if (placed.every(([x, y, w, h]) => Math.abs(lx - x) >= (w + def.w) / 2 + 1 || Math.abs(z - y) >= (h + def.h) / 2 + 1)) spot = [lx, z]
      }
      if (!spot) continue
      const [lx, z] = spot
      placed.push([lx, z, def.w, def.h])
      // 冰箱门面在素材前沿往里 3cm（appliances.ts fridgeModel），贴附物浮出 0.3
      const p = toWorld(fr, lx, fd.d / 2 - 3 + 0.3)
      const f = this.push(def.id, p.x, p.y, fr.rot, true)
      // push 会把坐标取整：贴附物要精确贴在门面上
      f.x = Math.round(p.x * 10) / 10
      f.y = Math.round(p.y * 10) / 10
      f.z = z
    }
  }

  // ---------- 冰箱、洗衣机（家具，摆在冰箱位 / 洗衣机位上） ----------

  /** 按地区加权挑一件棋牌（gameWeight；非棋牌权重 1） */
  gamePick(c: AssetDef[]) {
    return this.weighted(c.map((a) => [a, gameWeight(a.id, this.region)] as [AssetDef, number]))
  }
  /** 随机池里去掉这个地区少见的棋牌（权重 < 1 的），只剩本地常见的和通用的 */
  regionalGames(c: AssetDef[]) {
    return c.filter((a) => gameWeight(a.id, this.region) >= 1)
  }

  /** 按权重随机挑一个 */
  weighted<T>(items: [T, number][]): T | undefined {
    const ok = items.filter(([, w]) => w > 0)
    let r = this.rand() * ok.reduce((s, [, w]) => s + w, 0)
    for (const [v, w] of ok) if ((r -= w) <= 0) return v
    return ok[ok.length - 1]?.[0]
  }

  /** 全屋面积（㎡，不含阳台）：小户型挑小冰箱、小洗衣机 */
  get homeArea() {
    return this.plan.rooms.filter((r) => r.kind !== 'balcony').reduce((s, r) => s + area(r.points), 0) / 10000
  }

  /** 宽度 maxW 以内放得下的素材（id 存在且不比位宽） */
  private fits(ids: [string, number][], maxW: number): [string, number][] {
    return ids.filter(([id]) => {
      const d = ASSET_MAP.get(id)
      return !!d && d.w <= maxW + 1
    })
  }

  /** 冰箱款式：日式小户型两门 / 单门，大户型三门 / 法式六门；中式法式、对开门为主；欧美对开门 / 法式；复古、可爱风偏爱复古圆角 */
  fridgeFor(maxW: number) {
    const small = this.homeArea < 35 || (this.household?.members.length ?? 2) <= 1
    const w: [string, number][] =
      this.region === 'west'
        ? [['ap2-fridge-side', 3], ['ap2-fridge-french', 2], ['ap2-fridge-3door', 0.5]]
        : this.region === 'cn'
          ? this.homeArea > 90
            ? [['ap2-fridge-french', 2], ['ap2-fridge-side', 1], ['ap2-fridge-3door', 1]]
            : [['ap2-fridge-3door', 2], ['ap2-fridge-french', 1], ['ap2-fridge-2door', 1]]
          : small
            ? [['ap2-fridge-2door', 6], ['ap2-fridge-3door', 2], ['ap2-fridge-mini', 1], ['ap2-fridge-retro', 1]]
            : [['ap2-fridge-3door', 4], ['ap2-fridge-french', 3], ['ap2-fridge-retro', 0.6], ['ap2-fridge-side', 0.8], ['ap2-fridge-2door', 0.4]]
    const boost = this.style === 'retro' ? 6 : this.style === 'cute' || this.style === 'farmhouse' ? 2 : 1
    const ok = this.fits(
      w.map(([id, k]): [string, number] => [id, id === 'ap2-fridge-retro' ? k * boost : k]),
      maxW,
    )
    // 位太窄：挑两门小冰箱，再不行用单门迷你冰箱
    return this.weighted(ok) ?? (this.fits([['ap2-fridge-2door', 1]], maxW).length ? 'ap2-fridge-2door' : 'ap2-fridge-mini')
  }

  /** 洗衣机（可能是两台：并排的洗衣机 + 烘干机）：返回 [素材, 沿位宽度的偏移] */
  washersFor(maxW: number): [string, number][] {
    if (this.region === 'west') {
      // 欧美洗衣房：宽的位并排放洗衣机 + 烘干机，窄的放叠放款
      const us = ASSET_MAP.get('ap2-washer-us')!
      const eu = ASSET_MAP.get('ap2-washer-drum')!
      if (maxW >= us.w * 2 + 2) return [['ap2-washer-us', -(us.w / 2 + 1)], ['ap2-dryer-us', us.w / 2 + 1]]
      if (maxW >= eu.w * 2 + 2) return [['ap2-washer-drum', -(eu.w / 2 + 1)], ['ap2-dryer', eu.w / 2 + 1]]
      return [[this.fits([['ap2-washer-stack', 1]], maxW).length ? 'ap2-washer-stack' : 'ap2-washer-compact', 0]]
    }
    const small = this.homeArea < 35 || (this.household?.members.length ?? 2) <= 1
    const w: [string, number][] =
      this.region === 'cn'
        ? [['ap2-washer-drum', 2], ['ap2-washer-top', 1], ['ap2-washer-twin', this.style === 'retro' ? 0.6 : 0.1]]
        : small
          ? [['ap2-washer-compact', 5], ['ap2-washer-top', 3], ['ap2-washer-drum', 1.5], ['ap2-washer-twin', 0.3]]
          : [['ap2-washer-drum', 4], ['ap2-washer-top', 4], ['ap2-washer-stack', 1], ['ap2-washer-twin', 0.3]]
    return [[this.weighted(this.fits(w, maxW)) ?? (maxW >= 52 ? 'ap2-washer-compact' : 'ap2-washer-mini'), 0]]
  }

  /** 冰箱位 / 洗衣机位上放的机器 */
  appliancesFor(fx: Fixture): [string, number][] {
    return fx.kind === 'fridge' ? [[this.fridgeFor(fx.w), 0]] : this.washersFor(fx.w)
  }

  /**
   * 冰箱、洗衣机：每个空着的冰箱位 / 洗衣机位上放一台（按户型大小、住户风格挑款式和配色）；
   * 全屋没有位（用户自己画的户型）就在厨房旁 / 洗面所（阳台、浴室）靠墙找个地方放一台。
   */
  appliances(only?: SpotKind) {
    const base = this.style
    for (const kind of ['fridge', 'washer'] as const) {
      if (only && only !== kind) continue
      const spots = this.plan.fixtures.filter((f) => f.kind === kind)
      for (const fx of spots) {
        if (appliancesOn(this.out, fx).length) continue
        const room = this.plan.rooms.find((r) => pointInPolygon(fx, r.points))
        this.style = room ? this.styleFor(room) : base
        const picks = this.appliancesFor(fx)
        // 同一处的几台（洗衣机 + 烘干机）用同一套颜色
        const color = this.colorFor(ASSET_MAP.get(picks[0][0])!)
        for (const [id, lx] of picks) this.out.push({ id: uid('u'), asset: id, ...poseOnSpot(fx, id, lx), color })
      }
      if (spots.length || this.out.some((f) => isApplianceOf(f, kind))) continue
      // 全户一台：别的楼层有这种位或已经放了一台，这一层就不靠墙另放
      if (this.house?.fixtures?.some((f) => f.kind === kind) || this.prior.some((f) => isApplianceOf(f, kind))) continue
      // 没有位：冰箱贴着厨房，洗衣机放洗面所（中式生活阳台、浴室、阳台）
      if (kind === 'fridge') {
        const k = this.plan.fixtures.find((f) => f.kind === 'kitchen')
        const room = k && this.plan.rooms.find((r) => pointInPolygon(k, r.points))
        if (!k || !room) continue
        this.style = this.styleFor(room)
        this.wall(room, this.fridgeFor(90), { near: { x: k.x, y: k.y }, nearMax: k.w / 2 + 250, front: 50 })
      } else {
        const rs = this.plan.rooms
        const room = rs.find((r) => r.kind === 'wash') ?? rs.find((r) => r.kind === 'balcony' && r.name === '生活阳台') ?? rs.find((r) => r.kind === 'bath') ?? rs.find((r) => r.kind === 'balcony')
        if (!room) continue
        this.style = this.styleFor(room)
        this.wall(room, this.washersFor(70)[0][0], { front: 45 })
      }
    }
    this.style = base
  }

  /** 收纳位上的柜子：每个空着的鞋柜位 / 衣柜位 / 食品柜位放一件尺寸合适的（款式按地区、风格挑） */
  cabinets(only?: Fixture['builtinType']) {
    cabinetsOnSpots({ d: this, plan: this.plan, rand: this.rand }, only)
  }

  /** 正在往柜子里收东西（stowAll）：放开「门里的层不能放」和同类数量限制 */
  private isStowing = false
  stowing<T>(fn: () => T): T {
    const [a, b] = [this.isStowing, this.noLimit]
    this.isStowing = true
    this.noLimit = true
    try {
      return fn()
    } finally {
      this.isStowing = a
      this.noLimit = b
    }
  }

  /** 房间里的洗衣机（家具，不含干衣机） */
  washersIn(room: Room) {
    return this.out.filter((f) => !f.z && isMainAppliance(ASSET_MAP.get(f.asset), 'washer') && pointInPolygon(f, room.points))
  }

  /** 洗衣机顶上摆一件（洗衣液、柔软剂） */
  onWasher(washer: Furniture, sel: Sel) {
    const cand = this.find(sel, (a) => !!a.prop && a.form !== 'hanging')
    if (!cand.length) return null
    const a = this.pick(cand)
    for (let t = 0; t < 10; t++) {
      const f = this.onLevel(washer, a.id, (this.rand() - 0.5) * 0.7, (this.rand() - 0.5) * 0.6)
      if (f) return f
    }
    return null
  }

  /** 洗衣机上方置物架：跨在洗衣机（家具）上，背面贴墙；架子要比洗衣机宽、最低一层高过洗衣机 */
  rackOverWasher(room: Room) {
    const washer = this.washersIn(room)[0]
    const wd = washer && ASSET_MAP.get(washer.asset)
    if (!washer || !wd) return null
    const lowest = (a: AssetDef) => Math.min(a.surface ?? Infinity, ...(a.surfaces ?? []).map((l) => l.y))
    const racks = this.find('washer-rack', (a) => !a.prop && !a.mount && a.w >= wd.w + 6 && lowest(a) > wd.h + 8)
    if (!racks.length) return null
    const rack = racks[0]
    // 架子比洗衣机宽：洗衣机在墙角时往外挪，两侧都不能伸进墙里、压到旁边的设备（洗面台、管道井）
    const others = this.plan.fixtures.filter((f) => f.kind !== 'washer').map(fixtureBox)
    const slack = (rack.w - wd.w) / 2
    for (const lx of [0, slack, -slack, slack / 2, -slack / 2]) {
      const p = toWorld(washer, lx, -wd.d / 2 + rack.d / 2)
      const fp = furnitureBox(rack.id, p.x, p.y, washer.rot)
      if (!this.inside(fp, room)) continue
      if (others.some((b) => boxesOverlap(b, fp))) continue
      // 旁边已经摆着的洗衣篮之类（洗衣机、烘干机本来就在架子下面）
      if (this.out.some((o) => !o.z && !this.flat.has(o.id) && !isApplianceOf(o, 'washer') && boxesOverlap(fp, footprint(o.asset, o.x, o.y, o.rot)))) continue
      // 架子高：不顶到墙上挂的东西、不插进窗帘
      if (!this.canPlace(rack.id, p.x, p.y, washer.rot)) continue
      return this.push(rack.id, p.x, p.y, washer.rot)
    }
    return null
  }

  /** 角落小物：盆栽、猫爬架 */
  corner(room: Room, assets: string[]) {
    return this.wall(room, this.pick(assets), { centered: false })
  }

  // ---------- 各类房间 ----------

  ldk(room: Room) {
    const kitchen = this.plan.fixtures.find((f) => f.kind === 'kitchen' && pointInPolygon({ x: f.x, y: f.y }, room.points))
    const kc = kitchen ? { x: kitchen.x, y: kitchen.y } : undefined
    const size = this.household?.members.length ?? 2
    const big = area(room.points) / 10000 > 14 || size >= 3
    // 欧美客厅：L 形转角沙发（sectional）优先
    const sectional = this.region === 'west' ? this.shuffle(['lm-corner-sofa-l', 'lm-corner-sofa-r', 'lv-sofa-l-left', 'lv-sofa-l-right'].filter((id) => ASSET_MAP.has(id))) : []
    // 沙发和电视柜一起挑位置（arrange.ts）：沙发背靠墙、离厨房远，电视柜和沙发相对、隔 2–3m、中间不被大件挡住
    const sofas: Slot['options'] = [
      ...sectional.map((id, i) => ({ asset: id, spec: { front: 120 }, bias: -i })),
      { asset: big ? 'sofa3' : 'sofa2', spec: { front: 150 }, bias: sectional.length ? -10 : 0 },
      { asset: 'sofa2', spec: { front: 110 }, bias: -15 },
    ]
    const [sofa, tv] = this.major(room, [
      { kind: 'sofa', options: sofas, far: kc, miss: 150 },
      { kind: 'tv', options: [{ asset: this.vary('tv-board'), spec: { front: 120, centered: true } }], miss: 90 },
    ])
    if (sofa) {
      const fd = frontDir(sofa.rot)
      const def = ASSET_MAP.get(sofa.asset)!
      // 茶几、地毯在沙发前 60；电视柜正对着、离得近时放在两者之间
      let ahead = 60
      if (tv && Math.round(Math.abs(tv.rot - sofa.rot)) === 180) {
        const gap = Math.abs((tv.x - sofa.x) * fd.x + (tv.y - sofa.y) * fd.y) - def.d / 2 - ASSET_MAP.get(tv.asset)!.d / 2
        ahead = Math.min(60, Math.max(35, gap * 0.4))
      }
      const tableAt = add({ x: sofa.x, y: sofa.y }, mul(fd, def.d / 2 + ahead))
      const rugAsset = this.rand() < 0.5 ? 'rug-round' : 'rug'
      // 地毯铺在茶几位置；贴到墙边时往房间里挪，不让边缘压进墙里
      const rug = this.vary(rugAsset)
      const mid = centroid(room.points)
      for (let k = 0; k <= 60; k += 5) {
        const t = Math.min(1, k / Math.max(1, dist(tableAt, mid)))
        const p = add(tableAt, mul(add(mid, mul(tableAt, -1)), t))
        if (!this.inside(footprint(rug, p.x, p.y, sofa.rot), room)) continue
        this.push(rug, p.x, p.y, sofa.rot, true)
        break
      }
      this.freePush(room, 'coffee-table', 0, tableAt, 10)
      if (this.rand() < 0.7) this.freePush(room, 'beanbag', 0, add(tableAt, mul({ x: fd.y, y: -fd.x }, 110)), 5)
      // 沙发旁的落地灯：贴着沙发扶手、靠墙（锚在沙发上），两侧都放不下才在附近靠墙找
      if (this.rand() < 0.55) {
        const s = this.rand() < 0.5 ? 1 : -1
        const lamp = this.vary('floor-lamp')
        const ld = ASSET_MAP.get(lamp)!
        const back = add({ x: sofa.x, y: sofa.y }, mul(fd, -def.d / 2 + ld.d / 2 + 1))
        const side = { x: fd.y, y: -fd.x }
        const at = (k: number) => add(back, mul(side, k * (def.w / 2 + ld.w / 2 + 4)))
        if (!this.anchored(room, lamp, at(s).x, at(s).y, sofa.rot) && !this.anchored(room, lamp, at(-s).x, at(-s).y, sofa.rot))
          this.wall(room, 'floor-lamp', { near: add({ x: sofa.x, y: sofa.y }, mul(side, s * (def.w / 2 + 25))), nearMax: 90, centered: false })
      }
    }
    // 中式 / 欧美有独立的餐厅（客餐厅一体但分区）：餐桌摆在餐厅里
    if (!this.plan.rooms.some((r) => r.kind === 'dining')) this.dining(room, kitchen)
    const cats = this.household?.members.some((m) => m.interests.includes('cats')) ?? false
    this.corner(room, ['monstera', 'monstera', 'floor-lamp', ...(cats ? ['cat-tower'] : [])])
    if (this.rand() < 0.6) this.corner(room, ['bookshelf', 'monstera'])
  }

  dining(room: Room, kitchen?: Fixture, small = false, want?: string): Furniture | null {
    // 一张桌子周围的椅子是同一款（换款只换一次）
    const chairId = this.vary('dining-chair')
    let target: Vec
    let rot = 0
    if (kitchen) {
      const kd = kitchen.kind === 'kitchen' && kitchen.variant === 'facing' ? 200 : 65
      const fd = frontDir(kitchen.rot)
      target = add({ x: kitchen.x, y: kitchen.y }, mul(fd, kd / 2 + 110))
      rot = kitchen.rot % 180
    } else {
      const b = bbox(room.points)
      target = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    }
    const size = this.household?.members.length ?? (small ? 2 : 4)
    const asset = want ?? (size > 4 ? 'dining-table-l' : 'dining-table')
    // 四周留 45 的走道；放不下（落地窗前、门口都要留通道）就换标准尺寸、再把走道收窄到 30
    const table =
      this.freePush(room, asset, rot, target, 45) ?? (asset !== 'dining-table' ? this.freePush(room, 'dining-table', rot, target, 45) : null) ?? this.freePush(room, 'dining-table', rot, target, 30) ?? this.freePush(room, 'dining-table', (rot + 90) % 180, target, 30)
    if (!table) return null
    const chairs: Furniture[] = []
    const def = ASSET_MAP.get(table.asset)!
    // 长边两侧各两把椅子，椅背朝外（按家里人数，最多每边 3 把）
    const fd = frontDir(table.rot)
    const side = { x: fd.y, y: -fd.x }
    const obs = this.obstacles(room).filter((o) => !boxOverlaps(o, footprint(table.asset, table.x, table.y, table.rot)))
    const n = Math.max(1, Math.min(def.w > 140 ? 3 : 2, Math.ceil(size / 2)))
    for (const s of [-1, 1])
      for (let i = 0; i < n; i++) {
        if (s > 0 && i >= size - n && size > 1 && n * 2 > size) continue
        const along = n === 1 ? 0 : (i - (n - 1) / 2) * 52
        const p = add(add({ x: table.x, y: table.y }, mul(fd, s * (def.d / 2 + 6))), mul(side, along))
        const rot = s > 0 ? (table.rot + 180) % 360 : table.rot
        const fp = footprint(chairId, p.x, p.y, rot)
        if (!this.inside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
        chairs.push(this.push(chairId, p.x, p.y, rot))
      }
    // 桌子和椅子是一组：校验时整组换个位置重摆
    this.group(table, chairs, () => this.dining(room, kitchen, small, want))
    return table
  }

  /** 落地放一件：按选择器在素材里挑（不含摆件、壁挂） */
  floorOf(room: Room, sel: Sel, opts: Partial<PlaceSpec> = {}, filter: (a: AssetDef) => boolean = () => true) {
    const cand = this.find(sel, (a) => !a.prop && !a.mount && !a.stick && !a.fixture && Math.max(a.w, a.d) <= 240 && filter(a))
    for (const a of this.shuffle(cand).slice(0, 4)) {
      const f = this.wall(room, a.id, opts)
      if (f) return f
    }
    return null
  }

  /** 摆件撒在房间里的台面 / 层板上 */
  propsOf(room: Room, sel: Sel, n: number) {
    this.scatter(room, this.find(sel, (a) => !!a.prop && !a.stick && !a.form?.includes('hanging')), n)
  }

  /** 功能房：按用途布置；房主的职业 / 兴趣摆件之后由 personalize 补上 */
  funcRoom(room: Room) {
    const p = this.purposeOf.get(room.id) ?? 'study'
    const owner = this.studyOf.get(room.id)
    const b = bbox(room.points)
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    const seat = (desk: Furniture | null, gaming = false) => {
      if (!desk) return
      const g = gaming ? this.find('gaming-chair', (a) => !a.prop && a.category !== 'tabletop') : []
      this.seatAt(room, desk, g.length ? this.pick(g).id : this.chairAsset(), ASSET_MAP.get(desk.asset)!.d / 2 + 12)
    }
    switch (p) {
      case 'study':
        return this.study(room)
      case 'library':
        this.study(room)
        this.floorOf(room, 'bookshelf', { front: 40 })
        this.floorOf(room, 'bookshelf', { front: 40 })
        this.floorOf(room, 'armchair', { front: 50 })
        this.freePush(room, 'floor-lamp', 0, c, 0)
        this.propsOf(room, ['book', 'manga'], 6)
        break
      case 'gaming': {
        // 两个人都爱打游戏（一个 Lv.3 以上、另一个至少 Lv.2）：双人并排电竞台，两把电竞椅
        const duo = this.duoGaming(room)
        const desk = duo ?? this.floorOf(room, 'gaming-desk', { front: 80 }) ?? this.wall(room, 'desk', { front: 70 })
        if (!duo) seat(desk, true)
        if (desk && !duo) {
          for (const sel of ['monitor', 'keyboard', 'mouse', 'headset'] as const)
            for (const a of this.shuffle(this.find(sel, (a) => !!a.prop && a.form !== 'hanging')).slice(0, 2)) if (this.onLevel(desk, a.id, (this.rand() - 0.5) * 0.6, (this.rand() - 0.5) * 0.3, 0)) break
        }
        this.floorOf(room, 'pc', { front: 30 })
        this.floorOf(room, 'tv-stand', { front: 80 })
        this.freePush(room, this.pick(['beanbag', 'beanbag', 'rug-round']), 0, c, 20, true)
        this.floorOf(room, ['display-cabinet', 'figure'], { front: 40 })
        this.propsOf(room, ['video-game', 'figure'], 5)
        break
      }
      case 'music': {
        const owned = owner?.interests.includes('music') ? interestFloor('music') : []
        for (const a of this.shuffle(owned).slice(0, 3)) this.wall(room, a.id, { front: 60 })
        this.floorOf(room, 'music-stand', { front: 40 })
        this.floorOf(room, 'guitar', { front: 30 })
        this.floorOf(room, 'stool', { front: 30 })
        this.floorOf(room, ['bookshelf', 'record-shelf'], { front: 40 })
        this.propsOf(room, ['music-accessory', 'record', 'headset'], 4)
        break
      }
      case 'theater': {
        // 沙发和电视柜 / 音响相对摆（同客厅的打分规则）
        const sofaIds = this.shuffle(this.find('sofa', (a) => !a.prop && !a.mount && !a.stick && !a.fixture && a.w <= 200)).slice(0, 3)
        const tvIds = this.shuffle(this.find(['tv-stand', 'hifi'], (a) => !a.prop && !a.mount && !a.stick && !a.fixture && Math.max(a.w, a.d) <= 240)).slice(0, 2)
        const [sofa] = this.major(room, [
          { kind: 'sofa', options: sofaIds.map((a, i) => ({ asset: a.id, spec: { front: 120 }, bias: -i })), miss: 60 },
          { kind: 'tv', options: tvIds.map((a, i) => ({ asset: a.id, spec: { front: 120 }, bias: -i })), miss: 30 },
        ])
        const screen = this.find('projector-screen', (a) => !!a.mount)
        if (screen.length) this.mount(room, this.pick(screen).id)
        if (sofa) this.freePush(room, this.pick(['coffee-table', 'rug-round']), 0, c, 10, true)
        this.floorOf(room, ['record-shelf', 'bookshelf'], { front: 40 })
        this.propsOf(room, 'home-theater', 4)
        break
      }
      case 'hobby': {
        const it = owner?.interests.find((i) => ['maker', 'models', 'crafts', 'collecting', 'otaku', 'boardgames', 'photo'].includes(i))
        const desk = this.floorOf(room, it === 'maker' ? 'workbench' : ['desk', 'workbench'], { front: 70, underWindow: true })
        seat(desk)
        if (it) for (const a of this.shuffle(interestFloor(it)).slice(0, 3)) this.wall(room, a.id, { front: 40 })
        this.floorOf(room, 'shelving', { front: 40 })
        // 棋牌按地区（regionalGames 对非棋牌不起作用）
        const pool = it ? this.regionalGames(interestProps(it)) : []
        if (it && desk) for (const a of this.shuffle(pool).slice(0, 4)) this.onLevel(desk, a.id, (this.rand() - 0.5) * 0.7, (this.rand() - 0.5) * 0.4, Math.round((this.rand() - 0.5) * 40))
        if (it) this.scatter(room, pool, 4)
        break
      }
      case 'cards': {
        // 棋牌室：按地区摆牌桌 / 棋桌 + 四个座位，边上茶台、落地灯，柜子上撒棋牌
        const ids =
          this.region === 'cn'
            ? [...this.find(/^(int-mahjong-(table|shuffle|walls|win)|hg-mj-covered)$/).map((a) => a.id), 'hg-mj-fold']
            : this.region === 'jp'
              ? [room.kind === 'japanese' ? 'hg-jantaku' : 'int-mahjong-table']
              : ['hg-pool-table', 'hg-game-table-round']
        for (const id of this.shuffle(ids)) {
          const ok =
            id === 'hg-pool-table'
              ? this.freeFit(room, id, 60)
              : id === 'hg-game-table-round'
                ? this.gameTable(room, id, this.seatFor(room), [0, 2], 40, (t) => this.boardSet(t, 'chess'))
                : this.gameTable(room, id, this.seatFor(room), [0, 1, 2, 3], 50, /^(hg-jantaku|hg-mj-fold)$/.test(id) ? (t) => this.mahjongSet(t) : undefined)
          if (ok) break
        }
        if (this.region === 'cn') this.floorOf(room, /^sw-cn-chatai$/, { front: 60 })
        this.floorOf(room, 'shelving', { front: 40 })
        this.freePush(room, 'floor-lamp', 0, c, 0)
        this.scatter(room, this.regionalGames(this.find(/^(int-(poker|mahjong-case|boardgame|chess|xiangqi|shogi|reversi|hanafuda|backgammon)|hg-go-board|bg-(junqi|gomoku|box-stack|chip-case|dice|score-pad|words-boxed|property-boxed|sugoroku-rolled))/, (a) => !!a.prop)), 4)
        break
      }
      case 'gym': {
        // 成套的家庭健身房：一台有氧器械（跑步机 / 动感单车 / 划船机 / 椭圆机）+ 一件力量器械（卧推凳 / 深蹲架，房间小不放深蹲架）
        // + 哑铃架，墙边一面落地镜，地上铺瑜伽垫或拼接地垫；房间大再加瑜伽球 / 瑜伽垫架、拳击沙袋。哑铃、毛巾、水壶撒在架子上
        const m2 = area(room.points) / 10000
        const fit = (a: AssetDef) => !a.mount && Math.max(a.w, a.d) <= 220
        this.floorOf(room, 'cardio', { front: 50 }, fit)
        this.floorOf(room, 'strength', { front: 60 }, (a) => fit(a) && (m2 >= 12 || Math.max(a.w, a.d) <= 130))
        this.floorOf(room, 'weights', { front: 50 }, (a) => fit(a) && !!a.surface)
        this.floorOf(room, 'floor-mirror', { front: 40 })
        const mats = this.find(['yoga-mat', 'play-mat'], (a) => a.h <= 3 && hasTag(a, 'sports-gear'))
        this.freePush(room, mats.length ? this.pick(mats).id : 'rug-round', 0, c, 10, true)
        if (this.rand() < 0.6) this.floorOf(room, 'yoga', { front: 30 }, (a) => fit(a) && a.h > 3)
        if (m2 >= 9 && this.rand() < 0.3) this.floorOf(room, /^fit-punching-bag$/, { front: 60 })
        this.propsOf(room, ['weights', 'towel', 'water-bottle'], 4)
        break
      }
      case 'play': {
        // 儿童游戏室：中间铺地垫，靠墙玩具收纳柜 + 绘本架，一套儿童桌椅；再挑两三件大玩具（帐篷、滑梯、木马、球池、过家家厨房…），
        // 家里有婴儿才放游戏围栏、学步车这类
        const baby = !!this.household?.members.some((m) => m.age < 3)
        const mats = this.find(['play-mat', 'rug'], (a) => a.h <= 3 && (hasTag(a, 'play-mat') || a.category === 'kids') && !hasTag(a, 'sports-gear'))
        this.freePush(room, mats.length ? this.pick(mats).id : 'rug-round', 0, c, 0, true)
        this.floorOf(room, /^(lm-toy-shelf|kid-toybox)$/, { front: 50 })
        if (this.rand() < 0.7) this.floorOf(room, /^(fm|lm)-book-sling$/, { front: 40 })
        if (!this.floorOf(room, /^lm-kids-table-set$/, { front: 50 }) && this.rand() < 0.6) {
          const desk = this.floorOf(room, 'desk', { front: 50 }, (a) => hasTag(a, 'for-kids'))
          if (desk) this.seatAt(room, desk, this.find('chair', (a) => hasTag(a, 'for-kids') && !a.prop && a.h <= 70)[0]?.id ?? this.chairAsset(), ASSET_MAP.get(desk.asset)!.d / 2 + 12)
        }
        const babyOnly = /^lm-(playpen|walker|stroller|pikler)/
        const toys = ALL().filter((a) => a.category === 'kids' && hasTag(a, 'toy') && !a.prop && !a.mount && Math.max(a.w, a.d) <= 160 && (baby || !babyOnly.test(a.id)))
        let n = 2 + Math.floor(this.rand() * 2)
        for (const a of this.shuffle(toys)) {
          if (n <= 0) break
          if (this.wall(room, a.id, { front: 50 })) n--
        }
        this.propsOf(room, 'toy', 6)
        break
      }
      case 'guest': {
        let bed: Furniture | null = null
        if (room.kind === 'japanese') this.wall(room, 'futon', { front: 20 })
        else {
          // 客房的床：同样按床的规则挑位置，床头柜跟着床
          bed = this.major(room, [{ kind: 'bed', options: [{ asset: this.pick(['bed-single', 'bed-semi-double', 'lv-sofa-bed']), spec: { front: 45 } }, { asset: 'bed-semi-single', spec: { front: 30 }, bias: -30 }], miss: BED_MISS }])[0]
          if (bed) this.bedPlaced(room, bed)
        }
        if (room.kind === 'japanese') this.wall(room, 'nightstand', { front: 30 })
        // 客人用的：立着的旅行箱，挂外套的衣帽架 / 挂衣架，床尾叠好的一套毛巾；地方大放一把单人椅
        this.floorOf(room, 'luggage', { front: 30 }, (a) => a.form === 'standing')
        const rail = this.floorOf(room, ['clothes-rail', 'coat-rack'], { front: 40 }, (a) => !hasTag(a, 'wardrobe', 'seat'))
        const rd = rail && ASSET_MAP.get(rail.asset)
        if (rail && hasTag(rd, 'coat-rack') && !hasTag(rd, 'clothes-rail')) this.coatsOn(rail, 1 + Math.floor(this.rand() * 2))
        if (bed && this.rand() < 0.6) {
          const towels = this.find(/^gm-towel-(stack|bath[a-z-]*-folded)/, (a) => !!a.prop)
          if (towels.length) this.onLevel(bed, this.pick(towels).id, (this.rand() - 0.5) * 0.4, 0.3)
        }
        if (area(room.points) / 10000 >= 8 && this.rand() < 0.4) this.floorOf(room, 'armchair', { front: 50 }, (a) => a.w <= 90)
        break
      }
      case 'closet': {
        // 衣帽间：一两个衣柜（大房间两个）+ 一排落地挂衣杆（wearDress 挂满衣服），斗柜、落地镜，偶尔一棵衣帽架；收纳箱、帽子、包撒在柜顶
        const m2 = area(room.points) / 10000
        const notHall = (a: AssetDef) => a.category !== 'entrance'
        for (let i = 0; i < (m2 >= 9 ? 2 : 1); i++) this.floorOf(room, 'wardrobe', { front: 60 }, notHall)
        this.floorOf(room, 'garment-rail', { front: 50 })
        this.floorOf(room, 'dresser', { front: 50 })
        this.floorOf(room, 'floor-mirror', { front: 40 })
        if (this.rand() < 0.35) this.coatTree(room)
        this.propsOf(room, ['storage-box', 'hat', 'bag'], 4)
        break
      }
    }
    if (room.kind === 'western' && this.rand() < 0.6) this.corner(room, ['monstera', 'floor-lamp', 'beanbag'])
  }

  /** 书房 / 兴趣房：没有床，大书桌 + 椅子 + 书架 */
  study(room: Room) {
    const desks = this.find(/^(tbl-desk-(120|140|160|l-left|l-right)|desk$)/, (a) => !a.prop)
    // 书桌和书架一起挑位置（书桌靠窗 / 侧对窗、背后不对门；书架占完整的墙段）
    const [desk] = this.major(room, [
      {
        kind: 'desk',
        options: [
          { asset: desks.length ? this.pick(desks).id : 'desk', spec: { front: 80, underWindow: true } },
          { asset: 'desk', spec: { front: 70 }, bias: -5 },
          { asset: 'desk', spec: { front: 45, underWindow: true }, bias: -10 },
        ],
        miss: 100,
      },
      { kind: 'cabinet', options: [{ asset: this.vary(this.pick(['bookshelf', 'bookshelf', 'dresser'])), spec: { front: 50 } }], miss: 20 },
    ])
    if (desk) {
      const owner = this.studyOf.get(room.id)
      const gaming = owner?.interests.includes('gaming') ? this.find('gaming-chair', (a) => !a.prop) : []
      this.seatAt(room, desk, gaming.length ? this.pick(gaming).id : this.chairAsset(), ASSET_MAP.get(desk.asset)!.d / 2 + 12)
    }
  }

  western(room: Room) {
    if (this.studyOf.has(room.id) && !this.occupants.get(room.id)?.length) return this.funcRoom(room)
    const m2 = area(room.points) / 10000
    const people = this.occupants.get(room.id) ?? []
    const kid = people.length === 1 && people[0].role === 'child' ? people[0] : null
    // 中式 / 欧美的卧室没有日式的押入れ / クローゼット：没有嵌入式衣柜和衣帽间时要放衣柜
    const hasCloset = this.plan.fixtures.some((x) => x.kind === 'builtin' && x.builtinType === 'closet' && pointInPolygon(x, room.points)) || this.plan.rooms.some((o) => o.kind === 'storage' && edgesOf(room.points).some((e) => sharedIntervals(e, o).length > 0))
    const earlyWardrobe = this.region !== 'jp' && !hasCloset
    const needsDesk = !people.length || people.some((m) => JOBS[m.job].wfh || m.job === 'student' || m.job === 'schoolkid') || this.rand() < 0.4
    const kidDesk = kid && kid.age >= 6 && kid.age < 13 && ASSET_MAP.has('kid-desk')
    const deskId = kidDesk ? 'kid-desk' : 'desk'
    const slots: Slot[] = [this.bedSlot(room)]
    // 两个人住：双人床、并排的两张都放不下（或放了会堵门）、只放得下一张单人床时，再找个地方放第二张单人床，各睡各的
    const second = this.sharedRoom(room) ? this.secondBedSlot() : null
    if (second) slots.push(second)
    if (earlyWardrobe)
      slots.push({
        kind: 'cabinet',
        options: [
          { asset: this.vary('wardrobe'), spec: { front: 60 } },
          { asset: this.vary('dresser'), spec: { front: 50 }, bias: -8 },
          { asset: this.vary('wardrobe'), spec: { front: 0 }, bias: -15 },
        ],
        miss: 40,
      })
    // 房间挤（落地窗前、门的开合范围都不能占）：桌前少留一点空间也行，椅子照样放得下
    if (needsDesk && !(kid && kid.age < 6))
      slots.push({
        kind: 'desk',
        options: [
          { asset: deskId, spec: { front: 70, underWindow: true } },
          { asset: deskId, spec: { front: 45, underWindow: true }, bias: -6 },
        ],
        miss: 110,
      })
    if (!earlyWardrobe && m2 >= 7.5) slots.push({ kind: 'cabinet', options: [{ asset: this.vary(this.pick(['wardrobe', 'dresser', 'bookshelf'])), spec: { front: 60 } }], miss: 15 })
    const got = this.major(room, slots)
    const bed = got[0]
    const desk = got[slots.findIndex((x) => x.kind === 'desk')] ?? null
    const bed2 = second ? got[slots.indexOf(second)] : null
    // 四面墙都被门窗占着、哪儿都靠不了床的小洋室：日式人家铺被褥睡（白天也就这么铺着），几个人住铺几床
    if (!bed && this.region === 'jp' && people.length) this.futons(room, Math.min(2, people.length))
    if (bed2 && second) this.bedPlaced(room, bed2, second)
    if (bed) {
      this.bedPlaced(room, bed, slots[0])
      const def = ASSET_MAP.get(bed.asset)!
      const head = add({ x: bed.x, y: bed.y }, mul(frontDir(bed.rot), -def.d / 2))
      if (this.rand() < 0.6) this.wall(room, 'bear', { near: head, nearMax: def.w / 2 + 80 })
    }
    if (desk) {
      const gamer = people.some((m) => m.interests.includes('gaming'))
      const gaming = gamer ? this.find('gaming-chair', (a) => !a.prop) : []
      this.seatAt(room, desk, kidDesk && ASSET_MAP.has('kid-chair') ? 'kid-chair' : gaming.length ? this.pick(gaming).id : this.chairAsset(), 38)
    }
    const b = bbox(room.points)
    this.freePush(room, 'rug-round', 0, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, 0, true)
    // 猫爬架只给养猫的人家（猫本身由会动的角色负责，不再随手摆不会动的猫摆件）
    const cats = this.household?.members.some((m) => m.interests.includes('cats')) ?? false
    this.corner(room, ['monstera', 'stand-mirror', ...(cats ? ['cat-tower'] : []), 'beanbag', 'floor-lamp'])
  }

  /** 第二张单人床（只在第一张是单人床时才放，见 Slot.afterSingle） */
  secondBedSlot(): Slot {
    const options: Slot['options'] = ['bed-single', 'bed-semi-single'].flatMap((id, i) => [
      { asset: id, spec: { front: 45 }, bias: -10 * i },
      { asset: id, spec: { front: 45 }, bias: -10 * i - 15, side: true },
      { asset: id, spec: { front: 10 }, bias: -10 * i - 25 },
    ])
    return { kind: 'bed', options, miss: 60, afterSingle: true }
  }

  /** 在房间中间的空地上并排铺 n 床被褥（找不到地方就少铺） */
  futons(room: Room, n: number) {
    const def = ASSET_MAP.get('futon')
    if (!def) return
    const c = centroid(room.points)
    for (const rot of [0, 90]) {
      const first = this.freePush(room, 'futon', rot, c, 0)
      if (!first) continue
      this.fixed.add(first.id)
      const side = frontDir(rot + 90)
      for (let k = 1; k < n; k++)
        for (const s of [1, -1]) {
          const p = add({ x: first.x, y: first.y }, mul(side, s * k * (def.w + 4)))
          const f = this.anchored(room, 'futon', p.x, p.y, rot)
          if (f) {
            this.fixed.add(f.id)
            break
          }
        }
      return
    }
  }

  /** 每个居室的床（之后挂床头壁灯、摆床上的玩偶用） */
  beds = new Map<string, Furniture>()

  /** 床的位置（并排的两张床按合起来的那一块记）：床边留空、床头柜按它算 */
  private bedPick = new Map<string, Pick>()

  /** 两个人住的房间（夫妻、两人同住）：双人床一侧靠墙也行，放不下双人床先考虑两张单人床并排 */
  sharedRoom(room: Room) {
    return (this.occupants.get(room.id)?.length ?? 0) >= 2
  }

  /** 床的那一格：备选见 bedOptions */
  bedSlot(room: Room, front?: number): Slot {
    const options = this.bedOptions(room).map((o) => (front === undefined ? o : { ...o, spec: { ...o.spec, front } }))
    return { kind: 'bed', options, miss: BED_MISS, shared: this.sharedRoom(room) }
  }

  /**
   * 床的备选：按住户和面积挑规格（夫妻 double / queen，小孩婴儿床 / 儿童床，其余按面积），越往后扣分越多：
   *   两个人住：双人床（两侧都能下床优先，arrange 里一侧靠墙也行）→ 双人床长边贴墙（床头顶墙角）→ 双人床床尾少留空间 → 两张单人床并排 → 单人床；
   *   一个人住：放不下就换小一号（双人床两侧都要能下床），再不行单人床长边贴墙。
   * 最后是少留床前空间的小单人床
   */
  bedOptions(room: Room): Slot['options'] {
    const m2 = area(room.points) / 10000
    const people = this.occupants.get(room.id) ?? []
    const couple = people.filter((m) => m.role === 'self' || m.role === 'partner').length >= 2
    const kid = people.length === 1 && people[0].role === 'child' ? people[0] : null
    const sizes = ['bed-semi-single', 'bed-single', 'bed-semi-double', 'bed-double', 'bed-queen']
    let want = m2 < 7 ? 0 : m2 < 9 ? 1 : m2 < 11 ? 2 : m2 < 13.5 ? 3 : 4
    if (couple) want = Math.max(this.region === 'west' ? 4 : 3, want)
    else if (people.length) want = Math.min(want, this.region === 'west' ? 3 : 2)
    const beds: Slot['options'] = []
    // 婴儿床 / 儿童床有多种款式：同系列里随便挑几款
    if (kid && kid.age < 3) for (const v of this.shuffle(sameType('kid-crib')).slice(0, 3)) beds.push({ asset: v, spec: { front: 40 } })
    if (kid && kid.age < 10) for (const v of this.shuffle(sameType('kid-bed')).slice(0, 3)) beds.push({ asset: v, spec: { front: 40 }, bias: -5 })
    const pre = beds.length ? 10 : 0
    if (this.sharedRoom(room) && want >= 2) {
      for (let i = want; i >= 2; i--) beds.push({ asset: sizes[i], spec: { front: 45 }, bias: -12 * (want - i) - pre })
      for (let i = want; i >= 2; i--) beds.push({ asset: sizes[i], spec: { front: 45 }, bias: -12 * (want - i) - 15 - pre, side: true })
      // 床尾少留一点（两侧能下床就行）
      for (let i = want; i >= 2; i--) beds.push({ asset: sizes[i], spec: { front: 10 }, bias: -12 * (want - i) - 25 - pre })
      for (const id of ['bed-single', 'bed-semi-single']) beds.push({ asset: id, spec: { front: 45 }, bias: -45 - pre, twin: true })
      for (let i = 1; i >= 0; i--) beds.push({ asset: sizes[i], spec: { front: 45 }, bias: -80 - 12 * (1 - i) - pre })
    } else {
      for (let i = want; i >= 0; i--) beds.push({ asset: sizes[i], spec: { front: 45 }, bias: -12 * (want - i) - pre })
      for (let i = Math.min(want, 1); i >= 0; i--) beds.push({ asset: sizes[i], spec: { front: 45 }, bias: -30 - 12 * (want - i) - pre, side: true })
    }
    beds.push({ asset: 'bed-semi-single', spec: { front: 30 }, bias: -100 })
    beds.push({ asset: 'bed-semi-single', spec: { front: 30 }, bias: -110, side: true })
    return beds
  }

  /**
   * 床摆好之后：记下来、登记下床的空间（双人床两侧，单人床空着的那一侧），床头柜跟着床放。
   * 校验时床挡了通道，就按同样的备选和打分在这个房间里另挑一个位置（床头柜跟着走）
   */
  bedPlaced(room: Room, bed: Furniture, slot?: Slot) {
    this.beds.set(room.id, bed)
    if (slot) {
      // 挪床时不换成更窄的床（夫妻的双人床不会因为让通道变成单人床）：挪不开就放回原处
      const w = pickWidth(this.bedPick.get(bed.id) ?? bed)
      const same = { ...slot, options: slot.options.filter((o) => (ASSET_MAP.get(o.asset)?.w ?? 0) * (o.twin ? 2 : 1) >= w - 1) }
      this.recipes.set(bed.id, () => {
        const [b] = this.major(room, [same])
        if (b) this.bedPlaced(room, b, slot)
        return b
      })
    }
    const hard = this.hardIn(room)
    const pick = this.bedPick.get(bed.id) ?? bed
    // 空着的那几侧登记成下床的空间（双人床在一个人住的房间里两侧都空着，两个人住的房间里至少一侧）
    for (const b of bedSides(pick).filter((b) => this.inside(b, room) && !hard.some((h) => boxesOverlap(h, b)))) this.occ.hold(room, b, 'bedside', bed.id)
    this.nightstands(room, bed, pick)
  }

  /**
   * 大件按「候选 + 打分」摆（arrange.ts）：几样大件一起挑位置，返回和 slots 对应的家具（放不下的为 null）。
   */
  major(room: Room, slots: Slot[]): (Furniture | null)[] {
    const picks = arrange({ plan: this.plan, room, occ: this.occ, rand: this.rand, ctx: this.ctx(), canPlace: (a, x, y, r) => this.canPlace(a, x, y, r) }, slots)
    return picks.map((p, i) => {
      if (p?.twin) {
        // 两张单人床并排：第一张当「这张床」，第二张跟着它（一起挪、一起拿掉）
        const [a, b] = twinCenters(p)
        const f = this.push(p.asset, a.x, a.y, p.rot)
        const g = this.push(p.asset, b.x, b.y, p.rot)
        this.groupOf.set(g.id, f.id)
        this.fixed.add(f.id)
        this.fixed.add(g.id)
        this.bedPick.set(f.id, p)
        return f
      }
      // 床不走同款数量限制（两个人住的房间可以有两张同款单人床）
      const f = p && (slots[i].kind === 'bed' || this.allow(p.asset, p)) ? this.push(p.asset, p.x, p.y, p.rot) : null
      if (f) this.fixed.add(f.id)
      // 衣柜 / 大柜：校验时可以按同样的规则在这个房间里另挑位置（床由 bedPlaced 另设；书桌、沙发、电视柜上摆着电脑、电视，不挪）
      if (f && slots[i].kind === 'cabinet') this.recipes.set(f.id, () => this.major(room, [slots[i]])[0])
      return f
    })
  }

  /**
   * 床头柜跟着床：贴着床头那面墙放在床的一侧（离门远的一侧优先），双人床两侧各一个（放得下的话）。
   * 两侧都放不下才退回在床头附近靠墙找空位。
   */
  nightstands(room: Room, bed: Furniture, pick: Pick = bed) {
    const def = { ...ASSET_MAP.get(bed.asset)!, w: pickWidth(pick) }
    const f = frontDir(bed.rot)
    const side = { x: f.y, y: -f.x }
    const back = add({ x: pick.x, y: pick.y }, mul(f, -def.d / 2))
    const door = firstDoorCenter(room, this.plan)
    const order = [-1, 1].sort((a, b) => (door ? dist(add(back, mul(side, b * def.w)), door) - dist(add(back, mul(side, a * def.w)), door) : 0))
    const id = this.vary('nightstand')
    const nd = ASSET_MAP.get(id)!
    const want = (def.w >= 120 && !hasTag(def, 'crib')) || pick.twin ? 2 : 1
    let n = 0
    for (const k of order) {
      if (n >= want) break
      const p = add(add(back, mul(f, nd.d / 2 + 1)), mul(side, k * (def.w / 2 + nd.w / 2 + 3)))
      const ns = this.anchored(room, id, p.x, p.y, bed.rot)
      if (ns) {
        this.groupOf.set(ns.id, bed.id)
        n++
      }
    }
    if (!n) {
      const ns = this.wall(room, 'nightstand', { near: back, nearMax: def.w / 2 + 40 })
      if (ns) this.groupOf.set(ns.id, bed.id)
    }
  }

  /**
   * 跟着主件放的配套件：在 (x, y, rot) 这个锚点放 asset，要整块在房间里、不压禁放区（门窗前、设备和它的使用空间、楼梯口）和已摆的家具，
   * 立体上不冲突、数量限制允许。放下了返回家具。
   */
  anchored(room: Room, asset: string, x: number, y: number, rot: number) {
    const fp = footprint(asset, x, y, rot)
    if (!this.inside(fp, room) || this.obstacles(room).some((o) => boxOverlaps(o, fp))) return null
    if (!this.canPlace(asset, x, y, rot) || !this.allow(asset, { x, y })) return null
    return this.push(asset, x, y, rot)
  }

  japanese(room: Room) {
    const pp = this.purposeOf.get(room.id)
    if (this.studyOf.has(room.id) && !this.occupants.get(room.id)?.length && pp && pp !== 'guest' && pp !== 'study' && pp !== 'library') return this.funcRoom(room)
    // 住人的和室：铺被褥
    if (this.occupants.get(room.id)?.length) this.wall(room, 'futon', { front: 20 })
    this.lowTable(room, this.rand() < 0.65)
    // 和室的落地灯：多半挑和风的款（行灯、角行灯、障子灯、石灯笼…）
    const st = this.style
    if (this.rand() < 0.7) this.style = 'japanese'
    this.corner(room, ['andon'])
    this.style = st
    if (this.rand() < 0.5) this.corner(room, ['cactus'])
  }

  /** 和室的被炉 / 座卓 + 坐垫（一组） */
  lowTable(room: Room, kotatsu: boolean): Furniture | null {
    const b = bbox(room.points)
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    const table = this.freePush(room, kotatsu ? 'kotatsu' : 'chabudai', 0, c, 30)
    if (!table) return null
    const def = ASSET_MAP.get(table.asset)!
    const seats: [Vec, number][] = [
      [{ x: 0, y: 1 }, 180],
      [{ x: 0, y: -1 }, 0],
      [{ x: 1, y: 0 }, 90],
    ]
    const got: Furniture[] = []
    for (const [d, rot] of seats.slice(0, kotatsu ? 2 : 3)) {
      const p = add({ x: table.x, y: table.y }, mul(d, def.w / 2 + (kotatsu ? 10 : 20)))
      const fp = footprint('zabuton', p.x, p.y, 0)
      if (this.inside(fp, room)) got.push(this.push('zabuton', p.x, p.y, rot))
    }
    this.group(table, got, () => this.lowTable(room, kotatsu))
    return table
  }

  kitchen(room: Room) {
    const kitchen = this.plan.fixtures.find((f) => f.kind === 'kitchen' && pointInPolygon({ x: f.x, y: f.y }, room.points))
    if (this.plan.rooms.some((r) => r.kind === 'dining')) {
      // 有独立餐厅：厨房里不摆餐桌；中岛朝房间一侧摆吧凳
      if (kitchen?.island) this.islandStools(room, kitchen)
      return
    }
    if (area(room.points) / 10000 >= 7) this.dining(room, kitchen, area(room.points) / 10000 < 9)
  }

  /** 地区：jp 日式 / cn 中式 / west 欧美 */
  get region(): Region {
    return regionOf(this.plan)
  }

  /** 独立餐厅（中式 / 欧美）：中式常见圆桌，欧美六人长桌 */
  diningRoom(room: Room) {
    const size = this.household?.members.length ?? 4
    const opts =
      this.region === 'west'
        ? ['tbl-dining-180', 'dining-table-l', 'dining-table']
        : size <= 4 && this.rand() < 0.5
          ? ['tbl-dining-round-110', 'tbl-dining-round-90', 'dining-table']
          : [size > 4 ? 'dining-table-l' : 'tbl-dining-135', 'dining-table']
    const before = this.out.length
    for (const id of opts.filter((x) => ASSET_MAP.has(x))) {
      this.dining(room, undefined, false, id)
      if (this.out.length > before) break
    }
    if (this.rand() < 0.5) this.corner(room, ['monstera', 'bookshelf'])
  }

  /** 中岛吧凳：岛台出挑一侧（厨房模型的房间一侧）排 2–3 把 */
  islandStools(room: Room, k: Fixture) {
    const stools = ['ch-swivel-bar-high', 'c2-wood-bar-75', 'c2-iron-stool-75'].filter((id) => ASSET_MAP.has(id))
    if (!stools.length) return
    const id = this.pick(stools)
    const fd = frontDir(k.rot)
    const side = { x: fd.y, y: -fd.x }
    const n = k.w >= 240 ? 3 : 2
    const obs = this.obstacles(room).filter((o) => !boxOverlaps(o, fixtureBox(k)))
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 55
      const p = add(add({ x: k.x, y: k.y }, mul(fd, fixtureDepth(k) / 2 + 22)), mul(side, along))
      const rot = (k.rot + 180) % 360
      const fp = footprint(id, p.x, p.y, rot)
      if (!this.inside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
      this.push(id, p.x, p.y, rot)
    }
  }

  /** 欧美入口（Foyer）：室内穿鞋，放一张窄边桌 / 穿鞋长凳 / 挂衣柜，伞架看运气 */
  foyer(room: Room) {
    const from = this.out.length
    let main: Furniture | null = null
    for (const id of this.shuffle(['tbl-console', 'tbl-console', 'fm-genkan-bench', 'sf-hall-tree']).filter((x) => ASSET_MAP.has(x))) if ((main = this.wall(room, id, { front: 50 }))) break
    if (this.rand() < 0.5) this.wall(room, 'umbrella-stand')
    if (this.rand() < 0.4) this.corner(room, ['monstera', 'floor-lamp'])
    if (this.rand() < 0.35) this.mountAvoiding(room, this.lampPick('wall-lamp'), this.tallBoxes(room))
    // 进门的脚垫；窄边桌上方挂一面镜子（钥匙盘、花在 dress 里摆），挂衣柜上挂外套，长凳上方装一排挂钩
    if (this.rand() < 0.8) this.doormat(room)
    const md = main && ASSET_MAP.get(main.asset)
    if (main && md && hasTag(md, 'table') && this.rand() < 0.6) this.mirrorAbove(room, main)
    if (main && md && hasTag(md, 'clothes-rail')) this.coatsOn(main, 1 + Math.floor(this.rand() * 3))
    else if (main && md && hasTag(md, 'seat') && this.rand() < 0.6) {
      const rail = this.mountAvoiding(room, this.pick(this.find('hook-rack', (a) => !!a.mount && a.series === 'hook-rail')).id, this.tallBoxes(room), main, 40)
      if (rail) this.coatsOn(rail, 1 + Math.floor(this.rand() * 3))
    }
    // 宽敞的入口：一棵衣帽架、一个矮鞋架（摆上常穿的鞋），偶尔一个运动装备架
    if (this.rand() < 0.35) this.coatTree(room)
    if (this.rand() < 0.3) this.shoeRack(room)
    if (area(room.points) / 10000 >= 5 && this.rand() < 0.2) this.floorOf(room, /^gr-gear-rack$/, { front: 50 })
    this.entryClear(room, from, main)
  }

  /** 日式 / 中式玄关：鞋柜、伞架、穿鞋凳、壁灯，门内脚垫、壁镜、钥匙挂架 / 挂钩排（挂外套、帽子、包），宽敞的再放矮鞋架或衣帽架 */
  genkan(room: Room) {
    const from = this.out.length
    // 有造作鞋柜就不再放鞋柜家具
    const cabinet = this.plan.fixtures.some((x) => x.kind === 'builtin' && spotInRoom(x, room.points)) ? null : this.wall(room, 'shoe-cabinet')
    if (this.rand() < 0.7) this.wall(room, 'umbrella-stand')
    // 偶尔放一张小穿鞋凳（放不下 wall 会自动跳过）
    if (this.rand() < 0.35 && ASSET_MAP.has('c2-shoe-bench-60')) this.wall(room, 'c2-shoe-bench-60', { front: 40 })
    if (this.rand() < 0.3) this.mountAvoiding(room, this.lampPick('wall-lamp'), this.tallBoxes(room))
    if (this.rand() < 0.75) this.doormat(room)
    // 中式入户大多比日式玄关宽敞：矮鞋架、衣帽架
    const m2 = area(room.points) / 10000
    if (m2 >= 2.2 && this.rand() < (this.region === 'cn' ? 0.4 : 0.25)) this.shoeRack(room)
    if (m2 >= 2.4 && this.rand() < (this.region === 'cn' ? 0.35 : 0.2)) this.coatTree(room)
    // 墙上：出门前照一下的镜子、钥匙挂架、挂外套 / 帽子 / 包的挂钩排
    const tall = this.tallBoxes(room)
    const mirrors = this.find('mirror', (a) => !!a.mount && !hasTag(a, 'wet-supply') && a.w <= 80)
    if (mirrors.length && this.rand() < 0.35) this.mountAvoiding(room, this.styledPick(mirrors).id, tall)
    if (this.rand() < 0.3 && ASSET_MAP.has('wall-key-rack')) this.mountAvoiding(room, 'wall-key-rack', tall)
    if (this.rand() < 0.3) {
      const rail = this.mountAvoiding(room, this.pick(this.find('hook-rack', (a) => !!a.mount && a.series === 'hook-rail' && a.w <= 60)).id, tall)
      if (rail) this.coatsOn(rail, 1 + Math.floor(this.rand() * 2))
    }
    this.entryClear(room, from, cabinet)
  }

  /**
   * 玄关 / 入口留出宽 2 × ENTRY_R 的通道（大门 → 各个内门）：全屋的主要通道只要求宽 40，玄关两侧都摆了东西时还是挤不过去。
   * 堵住时按后摆先撤的顺序拿掉这一步摆的落地小件（连同上面挂的、摆的），鞋柜 / 主家具不撤；全撤了也走不通（玄关本来就窄）就不撤
   */
  private entryClear(room: Room, from: number, keep: Furniture | null) {
    const keys: Vec[] = []
    for (const { o, e, center } of openingsOn(room, this.plan)) {
      if (o.kind === 'window') continue
      const into = pointInPolygon(add(center, mul(e.out, 10)), room.points) ? e.out : mul(e.out, -1)
      keys.push(add(center, mul(into, 30)))
    }
    if (keys.length < 2 || !this.unreachable(keys, [], ENTRY_R).length) return
    const loose = this.out.slice(from).filter((f) => {
      const d = ASSET_MAP.get(f.asset)
      return f !== keep && !!d && !f.z && !d.mount && !d.stick && d.h >= 3
    })
    if (!loose.length || this.unreachable(keys, loose, ENTRY_R).length) return
    for (const f of loose.reverse()) {
      this.removeTree(f)
      if (!this.unreachable(keys, [], ENTRY_R).length) return
    }
  }

  /** 大门（外墙上的门）内侧居中铺一块门口脚垫：避开设备和立着的家具，放不下就不铺 */
  doormat(room: Room) {
    const mats = this.find(/^lm-doormat-/)
    if (!mats.length) return null
    const def = this.styledPick(mats)
    for (const { o, e, center } of openingsOn(room, this.plan)) {
      if (o.kind !== 'door' || o.width < def.w + 4) continue
      const t = wallThicknessAt(this.plan, center, e.out, room)
      if (t < this.plan.wallOuter) continue
      // 门洞可能记在隔壁房间的墙上（法线朝隔壁外侧）：一律朝本房间一侧
      const into = pointInPolygon(add(center, mul(e.out, 10)), room.points) ? e.out : mul(e.out, -1)
      const p = add(center, mul(into, t / 2 + def.d / 2 + 2))
      const rot = rotFacingWall(mul(into, -1))
      const fp = footprint(def.id, p.x, p.y, rot)
      if (!this.inside(fp, room) || this.hardIn(room).some((b) => boxOverlaps(b, fp))) continue
      // 不叠在别的地毯 / 地垫上
      if (this.out.some((f) => this.flat.has(f.id) && !f.z && (ASSET_MAP.get(f.asset)?.h ?? 9) <= 3 && boxOverlaps(fp, footprint(f.asset, f.x, f.y, f.rot)))) continue
      if (!this.allow(def.id, p)) return null
      return this.push(def.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, rot, true)
    }
    return null
  }

  /** 桌子正上方的墙上挂一面镜子（窄边桌背面要贴墙） */
  mirrorAbove(room: Room, table: Furniture) {
    const td = ASSET_MAP.get(table.asset)
    const mirrors = this.find('mirror', (a) => !!a.mount && !hasTag(a, 'wet-supply') && !!td && a.w <= td.w - 10)
    if (!td || !mirrors.length) return null
    const back = add({ x: table.x, y: table.y }, mul(frontDir(table.rot), -td.d / 2))
    return this.mountAvoiding(room, this.styledPick(mirrors).id, this.tallBoxes(room), back, 30)
  }

  /** 挂钩排 / 衣帽架 / 挂衣柜上挂几样出门用的：外套、雨衣、围巾、帽子、包 */
  coatsOn(parent: Furniture, n: number) {
    // 墙上的挂钩排离墙很近：只挂贴着墙垂下来的薄东西（外套、围巾、托特包），帽子、鼓的包会顶进墙里
    const onWall = !!ASSET_MAP.get(parent.asset)?.mount
    const pool = this.find([/^sf-(coat|down|raincoat|hoodie|cardigan|scarf)-hanging$/, 'hat', 'bag'], (a) => !!a.prop && a.form === 'hanging' && (!onWall || a.d <= 8))
    let k = 0
    for (let t = 0; t < n * 3 && k < n && pool.length; t++) if (this.hangOn(parent, this.pick(pool).id)) k++
    return k
  }

  /** 靠墙一棵衣帽架，挂上外套、帽子 */
  coatTree(room: Room) {
    // 立式衣帽架（梯子形挂衣架靠在墙上，挂钩朝墙，不算）
    const trees = this.find('coat-rack', (a) => !a.prop && !a.mount && !hasTag(a, 'clothes-rail') && Math.max(a.w, a.d) <= 55)
    for (const a of this.shuffle(trees).slice(0, 2)) {
      const f = this.wall(room, a.id, { front: 30, centered: false })
      if (f) {
        this.coatsOn(f, 1 + Math.floor(this.rand() * 3))
        return f
      }
    }
    return null
  }

  /** 开放的矮鞋架：每层摆上一两双常穿的鞋 */
  shoeRack(room: Room) {
    const rack = this.floorOf(room, /^sb-rack-(wood|metal)-[234]$/, { front: 40 })
    if (rack) this.shoesOn(rack)
    return rack
  }

  /** 开放鞋架的每一层（含顶面）随手摆几双鞋：按住户挑男 / 女 / 儿童鞋，没有住户就随便挑 */
  shoesOn(rack: Furniture) {
    const def = ASSET_MAP.get(rack.asset)
    if (!def) return
    const hh = this.household?.members ?? []
    const want = new Set<string>(hh.length ? hh.map((m) => (m.age < 12 ? 'k' : this.femaleOf(m) ? 'f' : 'm')) : ['m', 'f', 'k'])
    // 鞋款系列的 id 以 -m / -f / -k 结尾（男 / 女 / 儿童）
    const shoes = this.find(new RegExp(`^sb-shoe-[a-z-]+-(${[...want].join('|')})$`), (a) => !!a.prop && a.form !== 'hanging')
    if (!shoes.length) return
    const levels = [...(def.surface ? [undefined] : []), ...(def.surfaces ?? []).flatMap((l, i) => (l.kind === 'hook' || l.inside ? [] : [i]))]
    for (const lv of levels) {
      const n = 1 + Math.floor(this.rand() * 3)
      for (let k = 0, t = 0; k < n && t < 8; t++) if (this.onLevel(rack, this.pick(shoes).id, -0.35 + (k + this.rand() * 0.3) * 0.33, 0, 0, lv)) k++
    }
  }

  /** 走廊宽度（房间包围盒的短边减去墙厚）：L 形走廊按包围盒算会偏大，主要通道最后由校验兜底 */
  private passWidth(room: Room) {
    const b = bbox(room.points)
    return Math.min(b.x1 - b.x0, b.y1 - b.y0) - this.plan.wall
  }

  /**
   * 底层的走廊：主要通道（宽 75 以上）一定留出来。够宽的走廊靠墙放一张窄边桌 / 矮薄柜；
   * 长地毯、挂画、壁灯在装饰那一步（passDecor）。
   */
  hall(room: Room) {
    const m2 = area(room.points) / 10000
    if (m2 < 2.5 || this.passWidth(room) < 115 || this.rand() > 0.55) return
    const pool = this.find(['table', 'storage-cabinet', 'bookshelf', 'shelving'], (d) => !d.prop && !d.mount && !d.stick && !hasTag(d, 'desk', 'dining-table', 'coffee-table', 'for-kids') && d.d <= 32 && d.w >= 40 && d.w <= 110 && d.h >= 55 && d.h <= 100)
    const styled = pool.filter((d) => d.styles?.includes(this.style))
    for (const d of this.shuffle(styled.length >= 3 ? styled : pool).slice(0, 4)) if (this.wall(room, d.id, { front: 80 })) return
  }

  /**
   * 走廊 / 欧美入口的装饰：长走廊顺着铺一条长地毯，墙上挂一两件小画 / 照片，偶尔一盏壁灯。
   * 地毯只避开设备、楼梯口和立着的家具，不叠在浴室门外的地垫上；挂画的规则同居室（artFree）。
   */
  passDecor(room: Room) {
    const b = bbox(room.points)
    const long = Math.max(b.x1 - b.x0, b.y1 - b.y0) - this.plan.wall
    if (long >= 260 && this.passWidth(room) >= 85 && this.rand() < 0.45) this.runner(room)
    const art = this.find(/^mv-(art|photo|deco)-/, (a) => !!a.mount && a.w <= 70)
    const styled = art.filter((a) => a.styles?.includes(this.style))
    const n = this.rand() < 0.55 ? 1 + (long >= 500 && this.rand() < 0.4 ? 1 : 0) : 0
    for (let k = 0; k < n && art.length; k++) if (!this.artFree(room, styled.length >= 3 ? styled : art)) break
    if (long >= 300 && this.rand() < 0.25) this.mountAvoiding(room, this.lampPick('wall-lamp'), this.tallBoxes(room))
  }

  /** 顺着走廊的长边铺一条长地毯（离房间中心越近越好） */
  runner(room: Room) {
    const rugs = this.find(/^lm-rug-runner/, (a) => a.h <= 3)
    if (!rugs.length) return null
    const def = this.pick(rugs)
    const b = bbox(room.points)
    const rot = b.x1 - b.x0 > b.y1 - b.y0 ? 90 : 0
    const solid = this.hardIn(room)
    const flats = this.out.filter((f) => this.flat.has(f.id) && !f.z && (ASSET_MAP.get(f.asset)?.h ?? 9) <= 3 && pointInPolygon(f, room.points)).map((f) => footprint(f.asset, f.x, f.y, f.rot))
    const c = centroid(room.points)
    let best: Vec | null = null
    let bd = Infinity
    for (let x = b.x0; x <= b.x1; x += 10)
      for (let y = b.y0; y <= b.y1; y += 10) {
        const d = dist({ x, y }, c)
        if (d >= bd) continue
        const fp = footprint(def.id, x, y, rot)
        if (!this.inside(fp, room) || solid.some((o) => boxOverlaps(o, fp)) || flats.some((o) => boxOverlaps(o, fp))) continue
        bd = d
        best = { x, y }
      }
    if (!best || !this.allow(def.id, best)) return null
    return this.push(def.id, best.x, best.y, rot, true)
  }

  /**
   * 洗面所的洗衣用品：靠墙立一块折起来的熨衣板，熨斗放在架子上；
   * 地方大（欧美的 laundry room）再放一个开放架摆洗衣用品和收纳篮。
   */
  laundryExtras(room: Room) {
    if (this.rand() < 0.35) {
      const boards = this.find(/^wet-ironing-board-folded$/)
      if (boards.length) this.wall(room, boards[0].id, { front: 0 })
    }
    if (this.rand() < 0.3) {
      const irons = this.find(/^wet-iron$/, (a) => !!a.prop)
      if (irons.length) this.scatter(room, irons, 1)
    }
    if (area(room.points) / 10000 >= 4.5 && this.rand() < 0.4) {
      const racks = this.find('open-rack', (a) => !a.prop && !a.mount && (a.surfaces?.length ?? 0) >= 2 && a.d <= 40 && a.w <= 90)
      for (const r of this.shuffle(racks).slice(0, 3)) {
        const f = this.wall(room, r.id, { front: 50 })
        if (!f) continue
        const items = this.find(['laundry-supply', 'detergent', 'softener', 'storage-box'], (a) => !!a.prop && a.form !== 'hanging' && a.form !== 'open' && (hasTag(a, 'storage-box') ? a.category === 'storage' : true))
        const def = ASSET_MAP.get(f.asset)!
        for (let i = -1; i < (def.surfaces?.length ?? 0); i++) for (let t = 0; t < 3; t++) if (items.length) this.onLevel(f, this.pick(items).id, (this.rand() - 0.5) * 0.6, 0, 0, i < 0 ? undefined : i)
        break
      }
    }
  }

  /**
   * 收纳间里挂杆、衣服之外的东西：
   *   シューズIN / 靴 / Mudroom：开放鞋架摆满鞋、伞架、运动装备架；
   *   納戸 / 储藏间 / Storage：旅行箱、纸箱、吸尘器、换季的电扇 / 取暖器、开放架上的收纳箱、清洁工具架（挑几样，放不下就算了）。
   */
  storageExtras(room: Room) {
    if (/シューズ|靴|下駄|Mud/.test(room.name)) {
      for (let i = 0; i < 3; i++) if (!this.shoeRack(room)) break
      if (this.rand() < 0.6) this.wall(room, 'umbrella-stand')
      if (this.rand() < 0.3) this.floorOf(room, /^gr-gear-rack$/, { front: 40 })
      return
    }
    if (!/納戸|储藏|Storage|物置/.test(room.name)) return
    const tries: (() => unknown)[] = [
      () => this.floorOf(room, 'luggage', { front: 0 }, (a) => a.form === 'standing'),
      () => this.floorOf(room, /^int-cartons-[23]$/, { front: 0 }),
      () => this.floorOf(room, 'vacuum', { front: 0 }, (a) => !hasTag(a, 'robot') && a.h >= 60),
      () => this.floorOf(room, ['fan', 'heater'], { front: 0 }, (a) => Math.max(a.w, a.d) <= 60 && !hasTag(a, 'high-ok')),
      () => this.floorOf(room, /^chore-tool-rack$/, { front: 0 }),
      () => {
        const rack = this.floorOf(room, 'open-rack', { front: 40 }, (a) => (a.surfaces?.length ?? 0) >= 2 && a.d <= 50)
        if (!rack) return
        const boxes = this.find('storage-box', (a) => !!a.prop && a.category === 'storage' && a.form !== 'open' && a.form !== 'hanging')
        const def = ASSET_MAP.get(rack.asset)!
        for (let i = -1; i < (def.surfaces?.length ?? 0); i++) for (let t = 0; t < 2; t++) if (boxes.length) this.onLevel(rack, this.pick(boxes).id, (this.rand() - 0.5) * 0.6, 0, 0, i < 0 ? undefined : i)
      },
    ]
    const n = 2 + Math.floor(this.rand() * 3)
    for (const f of this.shuffle(tries).slice(0, n)) f()
  }

  /**
   * 阳台的小物件：花箱旁的浇水壶，深一点的阳台放一张小椅子 / 户外储物柜，偶尔一盆落地绿植。
   * 晾衣阳台（日式、中式生活阳台）和景观阳台都用。
   */
  balconyExtras(room: Room) {
    const b = bbox(room.points)
    const depth = Math.min(b.x1 - b.x0, b.y1 - b.y0) - this.plan.wall
    if (this.rand() < 0.45) {
      const cans = this.find(/^gd-can-/, (a) => !!a.prop)
      if (cans.length) this.wall(room, this.pick(cans).id, { front: 0 })
    }
    if (depth >= 120 && this.rand() < 0.3) this.floorOf(room, /^(ch-bistro|ch-director|c2-camp-arm)$/, { front: 40 })
    const box = depth >= 150 && this.rand() < 0.25 ? this.floorOf(room, /^out-storage$/, { front: 50 }) : null
    if (box) {
      // 户外储物柜：不让收纳那一步往里塞屋里的日用品、也不让别的摆件占顶面；顶上放一两件园艺用品（浇水壶、喷壶、手套…）
      this.reserved.add(box.id)
      const tools = this.find('garden-tool', (a) => !!a.prop && a.form !== 'hanging')
      const k = 1 + Math.floor(this.rand() * 2)
      if (tools.length)
        this.stowing(() => {
          for (let i = 0, t = 0; i < k && t < 6; t++) if (this.onLevel(box, this.pick(tools).id, (this.rand() - 0.5) * 0.6, (this.rand() - 0.5) * 0.3)) i++
        })
    }
    if (this.rand() < 0.3) this.floorOf(room, 'plant', { front: 20 }, (a) => !hasTag(a, 'planter', 'curio-ok', 'curio-shelf') && Math.max(a.w, a.d) <= 50 && a.h >= 40)
  }

  /**
   * 中式 / 欧美的阳台：欧美 Patio 放户外桌椅、躺椅和花槽；中式景观阳台放休闲椅和绿植（有生活阳台时不在这里晾衣）。
   * 返回 false 表示照日式的晾衣阳台布置。
   */
  outdoorLiving(room: Room) {
    const service = this.plan.rooms.some((r) => r.kind === 'balcony' && r !== room && r.name === '生活阳台')
    if (this.region === 'cn' && (room.name === '生活阳台' || !service)) return false
    const sets = this.region === 'west' ? ['out-folding-set', 'ch-lounge', 'c2-camp-arm', 'mv-bean-outdoor'] : ['ch-lounge', 'c2-camp-arm', 'mv-bean-outdoor']
    for (const id of this.shuffle(sets.filter((x) => ASSET_MAP.has(x))).slice(0, 2)) this.wall(room, id, { front: 40 })
    this.wall(room, 'planter')
    if (this.rand() < 0.6) this.wall(room, 'planter')
    // 大露台：落地秋千椅；爱园艺的人家放一张园艺工作台
    const m2 = area(room.points) / 10000
    if (this.region === 'west' && m2 >= 12 && this.rand() < 0.2) this.floorOf(room, /^ch-swing$/, { front: 50 })
    if (m2 >= 8 && this.rand() < (this.household?.members.some((m) => m.interests.includes('plants')) ? 0.5 : 0.12)) this.floorOf(room, /^gd-potting-bench$/, { front: 60 })
    this.balconyExtras(room)
    return true
  }

  // ---------- 衣物（garments.ts）：收纳间 / 壁内收纳 / 挂衣杆上一排排衣服、毛巾、化妆台、内衣柜 ----------

  /** 推测一个人穿女装还是男装：爱美妆的偏女装，其余按名字和种子定；伴侣大多和户主相反 */
  femaleOf(m: Member): boolean {
    const hh = this.household
    if (m.interests.includes('beauty')) return true
    if (m.role === 'partner' && hh) {
      const self = hh.members.find((x) => x.role === 'self')
      if (self && h01(`${hh.seed}|${m.name}`) < 0.85) return !this.femaleOf(self)
    }
    return h01(`${hh?.seed ?? 7}|${m.id}|${m.name}`) < 0.5
  }

  /** 一个人的衣柜主题 */
  wardrobeOf(m: Member): Wardrobe {
    if (m.age < 13) return 'kids'
    if (m.age < 23 && h01(m.id + m.name) < 0.4) return 'casual'
    return this.femaleOf(m) ? 'women' : 'men'
  }

  /** 收纳间该挂谁的衣服：没有住户设定时随便混搭 */
  wardrobesFor(people?: Member[]): Wardrobe[] {
    const ms = people ?? this.household?.members ?? []
    const out = [...new Set(ms.map((m) => this.wardrobeOf(m)))]
    return out.length ? out : (['women', 'men', 'casual'] as Wardrobe[]).sort(() => this.rand() - 0.5).slice(0, 2)
  }

  /**
   * 沿一根杆挂满一排排衣服（「一排衣服」素材首尾相接）：owner 为杆所属的家具 / 设备的位姿，杆在局部 (cx, cz)、沿局部 x，长 len；
   * hookZ 为挂钩层高度（相对房间地面），maxH / maxD 为杆下净空和可用进深。返回挂上去的排。
   */
  hangRows(owner: { id: string; x: number; y: number; rot: number }, cx: number, cz: number, len: number, hookZ: number, wds: Wardrobe[], maxH: number, maxD: number, room?: Room) {
    const lens = [...ROW_LENGTHS].sort((a, b) => b - a)
    // 衣服垂下来的范围不碰别的东西（规则见 Occupancy.canPlace 的挂件一条）：落地挂衣杆的衣服比杆架宽，不能碰到旁边的家具、
    // 墙上挂的东西，也不能穿墙（给了 room 才查墙）；柜子里挂衣服时，下摆不能垂到柜子里已经放好的收纳箱、鞋盒上。
    // 碰到了就换短一点的衣服，都不行这段就空着
    const placed: Furniture[] = []
    let x = -len / 2
    let k = Math.floor(this.rand() * wds.length)
    for (;;) {
      const rest = len / 2 - x
      const L = lens.find((l) => l <= rest)
      if (!L) break
      // 同一个人的衣服挂一段，再换下一个人；挂不下（太长 / 太宽）就换休闲款、童装
      const fallback: Wardrobe[] = [wds[k % wds.length], 'casual', 'kids']
      const p = toWorld(owner, cx + x + L / 2, cz)
      const def = fallback
        .map((wd) => ASSET_MAP.get(`gm-row-${wd}-${L}-hanging`))
        .find((d) => !!d && d.h <= maxH && d.d <= maxD && this.canPlace(d.id, p.x, p.y, owner.rot, hookZ, { parent: owner.id, hang: true, room }))
      if (def) {
        const f: Furniture = { id: uid('u'), asset: def.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: owner.rot, color: this.colorFor(def), z: hookZ }
        this.out.push(f)
        this.flat.add(f.id)
        this.parentOf.set(f.id, owner.id)
        placed.push(f)
      }
      x += L + 1
      if (this.rand() < 0.6 || L >= 90) k++
    }
    return placed
  }

  /** 挂杆下面放收纳箱 / 抽屉柜：只放在这一排衣服最低处以下，贴墙（owner 局部 z = wallZ） */
  underRows(room: Room, owner: Furniture, rows: Furniture[], wallZ: number) {
    const cands = this.find(/^(sb-drawer-cab-\d|sb-plastic-box-l-closed|sb-fabric-box-std|sb-rattan-box-closed)/, (a) => !a.mount)
    const obs = this.obstacles(room)
    const taken: Box[] = []
    for (const row of rows) {
      const rd = ASSET_MAP.get(row.asset)!
      const clear = (row.z ?? 0) - 0.5 - rd.h - 3
      const fit = cands.filter((a) => a.h <= clear && a.w <= rd.w).sort((a, b) => b.h - a.h)
      if (!fit.length || this.rand() < 0.25) continue
      const a = fit[Math.floor(this.rand() * Math.min(2, fit.length))]
      const lr = toLocalXY(owner, row)
      const n = Math.max(1, Math.floor((rd.w - 2) / (a.w + 2)))
      for (let i = 0; i < n; i++) {
        const lx = lr.x - rd.w / 2 + (rd.w / n) * (i + 0.5)
        const p = toWorld(owner, lx, wallZ + a.d / 2 + 1)
        const fp = furnitureBox(a.id, p.x, p.y, owner.rot)
        if (!this.inside(fp, room) || obs.some((o) => boxOverlaps(o, fp)) || taken.some((t) => boxesOverlap(t, fp))) continue
        taken.push(fp)
        this.push(a.id, p.x, p.y, owner.rot)
      }
    }
  }

  /** 收纳间（WIC / クローゼット / 収納 / 押入）：靠墙装枕棚挂杆，挂满一排排衣服，枕棚上叠衣服，杆下放收纳箱；リネン庫 / 太浅的放架子 */
  closetDress(room: Room) {
    if (/シューズ|靴|下駄|Pantry|食品/.test(room.name)) return
    const b = bbox(room.points)
    const short = Math.min(b.x1 - b.x0, b.y1 - b.y0) - this.plan.wall
    if (/リネン|^Linen/.test(room.name) || short < PIPE.d - 0.5) return this.linenDress(room)
    const couple = this.household?.members.filter((m) => m.role === 'self' || m.role === 'partner')
    const wic = /WIC|Walk-in|衣帽间/.test(room.name)
    const wds = this.wardrobesFor(wic && couple?.length ? couple : undefined)
    const two = wic && short >= PIPE.d * 2 + 50
    for (let n = 0; n < (two ? 2 : 1); n++) {
      const pipe = this.mountPipe(room)
      if (!pipe) break
      const pd = ASSET_MAP.get(pipe.asset)!
      const hook = pd.surfaces!.find((s) => s.kind === 'hook')!
      const rows = this.hangRows(pipe, 0, 0, pd.w - 8, hook.y, wds, hook.y - 0.5 - 2, PIPE.d)
      // 枕棚上：叠好的衣服一排 + 收纳盒
      const fl = [...ROW_LENGTHS].reverse().find((l) => l <= pd.w - 30) ?? 30
      const zf = (-PIPE.d / 2 + PIPE.shelfD / 2) / PIPE.d
      if (this.onLevel(pipe, `gm-row-${this.pick(wds)}-${fl}-folded`, (-pd.w / 2 + 3 + fl / 2) / pd.w, zf) && pd.w - fl > 45) {
        const box = this.find(/^(sb-fabric-box-(std|low)|sb-rattan-box-closed)/, (a) => a.h < 28)
        if (box.length) this.onLevel(pipe, this.pick(box).id, (pd.w / 2 - 22) / pd.w, zf)
      }
      this.underRows(room, pipe, rows, -PIPE.d / 2)
    }
  }

  /**
   * 收纳间里装一根枕棚挂杆：贴一面没有门的墙、居中、尽量长。
   * 收纳间的推拉门 / 折门几乎占满一面墙，门前的通行空间就是挂衣服的地方，所以不走 placeCandidates 的门前避让，
   * 只避开门所在的墙、嵌进来的设备（玄关鞋柜的柜体）和已经装好的挂杆。
   */
  mountPipe(room: Room) {
    const doors = openingsOn(room, this.plan).map((d) => d.center)
    // 开向收纳间里的门扇（平开门 / 折门）扫过的范围：挂杆和衣服不能挡着门
    const swings = this.occ.zoneBoxes(room, [SWING_ZONES])
    const blocks: Box[] = [
      ...this.plan.fixtures.filter((f) => boxOverlaps(fixtureBox(f), bbox(room.points))).map((f) => {
        const b = fixtureBox(f)
        return { x0: b.x0 - 6, y0: b.y0 - 6, x1: b.x1 + 6, y1: b.y1 + 6 }
      }),
      ...this.out.filter((o) => o.asset.startsWith('gm-closet-pipe') && pointInPolygon(o, room.points)).map((o) => furnitureBox(o.asset, o.x, o.y, o.rot)),
      ...swings,
    ]
    const sides = edgesOf(room.points)
      .filter((e) => Math.abs(e.dir.x) < 1e-6 || Math.abs(e.dir.y) < 1e-6)
      .filter((e) => !doors.some((c) => projectToSegment(c, e.a, e.b).d < 5))
      .sort((a, b) => b.length - a.length)
    for (const e of sides) {
      const inward = mul(e.out, -1)
      const a = (Math.atan2(-inward.x, inward.y) * 180) / Math.PI
      const rot = Math.round((a + 360) % 360)
      // 背面贴墙面：按这面墙的实际墙厚内缩（外墙比内墙厚）
      const inset = wallThicknessAt(this.plan, add(e.a, mul(e.dir, e.length / 2)), e.out, room) / 2
      for (const w of [...PIPE_WIDTHS].sort((p, q) => q - p)) {
        if (w > e.length - this.plan.wall - 1 || !ASSET_MAP.has(`gm-closet-pipe-${w}`)) continue
        // 居中优先，放不下（被门扇挡住）就沿墙往两边挪
        const slack = Math.max(0, (e.length - this.plan.wallOuter - w) / 2)
        const offs = [0, ...Array.from({ length: Math.floor(slack / 10) }, (_, k) => [(k + 1) * 10, -(k + 1) * 10]).flat()]
        for (const off of offs) {
          const c = add(add(e.a, mul(e.dir, e.length / 2 + off)), mul(inward, inset + PIPE.d / 2))
          const fp = furnitureBox(`gm-closet-pipe-${w}`, c.x, c.y, rot)
          if (!this.inside(fp, room) || blocks.some((b) => boxOverlaps(b, fp))) continue
          return this.push(`gm-closet-pipe-${w}`, c.x, c.y, rot, true)
        }
      }
    }
    return null
  }

  /** リネン庫 / 浅的収納：开放架子上摆叠好的毛巾、叠好的衣服 */
  linenDress(room: Room) {
    const racks = this.find('open-rack', (a) => !a.prop && !a.mount && (a.surfaces?.length ?? 0) >= 2 && a.d <= 50)
    let rack: Furniture | null = null
    for (const r of racks.slice().sort(() => this.rand() - 0.5)) if ((rack = this.wall(room, r.id))) break
    if (!rack) return
    const def = ASSET_MAP.get(rack.asset)!
    const linen = /リネン|^Linen/.test(room.name)
    const towels = this.find(/^gm-towel-(stack|.*-folded)/, (a) => !!a.prop)
    const rows = [30, 45].map((l) => `gm-row-${this.pick(this.wardrobesFor())}-${l}-folded`)
    for (let i = -1; i < (def.surfaces?.length ?? 0); i++) {
      for (let t = 0; t < 4; t++) {
        const a = linen || this.rand() < 0.4 ? this.pick(towels).id : this.pick(rows)
        this.onLevel(rack, a, (this.rand() - 0.5) * 0.6, 0, 0, i < 0 ? undefined : i)
      }
    }
  }

  /** 已经摆好的挂衣杆 / 衣桁 / 壁内收纳挂满衣服；毛巾杆上搭毛巾（还没挂东西的才挂） */
  wearDress() {
    // 柜门里的挂衣杆（衣柜）由 stowAll 挂衣服
    for (const f of [...this.out]) {
      const def = ASSET_MAP.get(f.asset)
      const hooks = (def?.surfaces ?? []).filter((l) => l.kind === 'hook' && l.shape?.length && !l.inside)
      if (!def || !hooks.length || this.out.some((o) => this.parentOf.get(o.id) === f.id && ASSET_MAP.get(o.asset)?.form === 'hanging')) continue
      const room = this.plan.rooms.find((r) => pointInPolygon(f, r.points))
      if (hasTag(def, 'kimono-rack')) {
        const ki = this.find(/^gm-kimono-s\d-hanging/)
        if (ki.length) this.hangOn(f, this.pick(ki).id)
      } else if (hasTag(def, 'garment-rail')) {
        // 落地挂衣杆：杆在局部 z = 0；衣服的进深受背后的墙限制
        const lv = hooks[0]
        const xs = lv.shape![0].map((q) => q[0])
        const back = room ? this.backRoom(room, f) : def.d / 2
        const hookZ = (f.z ?? 0) + lv.y
        // 下层板上已经摆了东西：衣服下摆不能碰到它们
        const below = this.out.filter((o) => this.parentOf.get(o.id) === f.id).map((o) => (o.z ?? 0) + (ASSET_MAP.get(o.asset)?.h ?? 0))
        const maxH = Math.min(lv.h ?? 150, hookZ - 0.5 - Math.max(0, ...below) - 1)
        this.hangRows(f, (Math.max(...xs) + Math.min(...xs)) / 2, 0, Math.max(...xs) - Math.min(...xs), hookZ, this.wardrobesFor(room ? this.peopleIn(room) : undefined), maxH, Math.min(back, 40) * 2, room)
      } else if (room && hasTag(def, 'towel-rail')) this.towelsOn(f, hooks)
    }
  }

  /** 家具背后（局部 -z）到墙面的距离：从中心往背后探测房间边界 */
  backRoom(room: Room, f: Furniture) {
    for (let k = 0; k < 80; k += 1) if (!pointInPolygon(toWorld(f, 0, -k), room.points)) return Math.max(0, k - this.plan.wall / 2 - 1)
    return 80
  }

  /** 毛巾杆 / 毛巾架的每根杆：长的搭浴巾、中等的搭面巾，短的（毛巾环、挂钩）吊擦手巾 */
  towelsOn(f: Furniture, hooks: NonNullable<AssetDef['surfaces']>) {
    const placed: Box[] = []
    for (const lv of hooks)
      for (const poly of lv.shape!) {
        const xs = poly.map((q) => q[0])
        const zs = poly.map((q) => q[1])
        const L = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
        const v = L >= 46 ? 'bath' : L >= 26 ? 'face' : 'hand'
        const cand = this.find(new RegExp(`^gm-towel-${v}(-[a-z]+)?-${L >= 18 ? 'bar' : 'hook'}$`))
        if (!cand.length || this.rand() < 0.15) continue
        const a = this.pick(cand)
        const cx = xs.reduce((s, q) => s + q, 0) / xs.length
        const cz = zs.reduce((s, q) => s + q, 0) / zs.length
        const s = snapToHook({ ...f, wall: isWallOwner(f.asset) }, poly, toWorld(f, cx, cz))
        const z = (f.z ?? 0) + lv.y
        const box = furnitureBox(a.id, s.x, s.y, s.rot)
        // 下面的杆被上面垂下来的毛巾挡住、或这里已经挂了东西就跳过
        if (placed.some((b) => boxesOverlap(b, box)) || this.out.some((o) => Math.abs((o.z ?? 0) - z) < 1 && dist(o, s) < 10)) continue
        if (!this.hangFits(a.id, s.x, s.y, s.rot, z, f.id)) continue
        placed.push(box)
        const t: Furniture = { id: uid('u'), asset: a.id, x: s.x, y: s.y, rot: s.rot, color: this.colorFor(a), z }
        this.out.push(t)
        this.flat.add(t.id)
        this.parentOf.set(t.id, f.id)
      }
  }

  /** 洗面所 / 浴室的层板上叠放毛巾 */
  foldedTowels(room: Room) {
    // 毛巾放高处（洗衣机上方的架子）也很自然，不走 scatter 的高处限制
    const towels = this.find(/^gm-towel-(stack|(bath|face|hand)[a-z-]*-folded)/, (a) => !!a.prop)
    const parents = this.surfacesIn(room)
    let n = Math.max(1, Math.round(2 * this.clutter))
    for (let t = 0; t < 12 && n > 0 && towels.length && parents.length; t++) {
      const p = this.pick(parents)
      const pd = ASSET_MAP.get(p.asset)!
      const levels = [...(pd.surface ? [undefined] : []), ...(pd.surfaces ?? []).flatMap((l, i) => (l.kind === 'hook' || (l.inside && !l.glass) ? [] : [i]))]
      if (levels.length && this.onLevel(p, this.pick(towels).id, (this.rand() - 0.5) * 0.6, (this.rand() - 0.5) * 0.3, 0, this.pick(levels))) n--
    }
  }

  /** 卧室：化妆台（爱美妆、女性；长辈 / 和室用鏡台）+ 化妆凳 + 化妆品；内衣柜。面积不够就省略 */
  bedroomExtras(room: Room, phase: Phase) {
    if (phase === 'items') return this.vanityDress(room)
    const people = this.occupants.get(room.id) ?? []
    const m2 = area(room.points) / 10000
    if (!people.length || m2 < 6) return
    const grown = people.filter((m) => m.age >= 13)
    const beauty = grown.some((m) => m.interests.includes('beauty'))
    const female = grown.some((m) => this.femaleOf(m))
    const elder = people.some((m) => m.role === 'elder' || m.traits.includes('traditional'))
    const vanityP = beauty ? 0.95 : female ? 0.55 : 0.08
    if (m2 >= 7 && this.rand() < vanityP) {
      const byStyle: Record<StyleTag, string[]> = {
        cute: ['be-vanity-hollywood', 'be-vanity-tri', 'be-vanity-fold-open', 'bd-vanity'],
        nordic: ['be-vanity-wall', 'be-vanity-fold-open'],
        modern: ['be-vanity-fold-open', 'be-vanity-hollywood', 'be-vanity-wall'],
        japanese: ['be-kyodai', 'be-vanity-wall'],
        industrial: ['be-vanity-fold-closed', 'be-vanity-wall'],
        retro: ['be-vanity-tri', 'be-kyodai'],
        chinese: ['be-vanity-wall', 'be-vanity-fold-closed'],
        classic: ['be-vanity-tri', 'be-vanity-hollywood', 'be-vanity-wall'],
        farmhouse: ['be-vanity-wall', 'be-vanity-tri'],
      }
      const list = (room.kind === 'japanese' || elder ? ['be-kyodai'] : byStyle[this.style]).filter((id) => ASSET_MAP.has(id))
      // 喜欢的款放不下就换小一点的（北欧圆镜小桌 / 和风鏡台最省地方）
      let v: Furniture | null = null
      for (const id of [...list.sort(() => this.rand() - 0.5), ...(room.kind === 'japanese' || this.style === 'japanese' ? ['be-kyodai'] : ['be-vanity-wall'])]) if (ASSET_MAP.has(id) && (v = this.wall(room, id, { front: 50 }))) break
      if (v) {
        const vd = ASSET_MAP.get(v.asset)!
        if (v.asset !== 'be-kyodai' && ASSET_MAP.has('be-vanity-stool')) {
          const p = add({ x: v.x, y: v.y }, mul(frontDir(v.rot), vd.d / 2 + 14))
          const fp = footprint('be-vanity-stool', p.x, p.y, v.rot)
          if (this.inside(fp, room) && !this.obstacles(room).some((o) => boxOverlaps(o, fp))) this.push('be-vanity-stool', p.x, p.y, (v.rot + 180) % 360)
        }
        this.vanities.set(room.id, { v, beauty })
      }
    }
    // 落地挂衣杆（衣服多的人）：离墙挪出一点，侧挂的衣服不顶墙；衣服在 wearDress 里挂
    if (m2 >= 8 && grown.length && this.rand() < 0.25 * this.clutter) {
      const rail = this.find(/^sf-garment-rail-\d+/).sort((a, b) => b.w - a.w).find((a) => this.wall(room, a.id, { front: 50 }))
      const f = rail && this.out[this.out.length - 1]
      if (f && f.asset === rail.id) {
        const p = add({ x: f.x, y: f.y }, mul(frontDir(f.rot), 6))
        const fp = footprint(f.asset, p.x, p.y, f.rot)
        const obs = this.obstacles(room).filter((o) => !boxOverlaps(o, footprint(f.asset, f.x, f.y, f.rot)))
        if (this.inside(fp, room) && !obs.some((o) => boxOverlaps(o, fp))) Object.assign(f, { x: Math.round(p.x), y: Math.round(p.y) })
      }
    }
    // 内衣柜：窄高，靠墙
    if (m2 >= 6.5 && grown.length && this.rand() < (female ? 0.6 : 0.3)) {
      // 抽屉开合由 stowAll 统一决定（少数开着）
      const opts = this.find(/^be-lingerie-\d+/, (a) => a.form !== 'open')
      if (opts.length) this.wall(room, this.pick(opts).id, { front: 45 })
    }
  }

  /** 每个居室的化妆台（化妆品在个人物件那一步再摆） */
  vanities = new Map<string, { v: Furniture; beauty: boolean }>()

  /** 化妆台上的化妆品、小抽屉 */
  vanityDress(room: Room) {
    const got = this.vanities.get(room.id)
    if (!got) return
    const { v, beauty } = got
    const cos = this.find('cosmetics', (a) => !!a.prop && a.form !== 'hanging' && a.category === 'toiletry')
    let n = Math.round((beauty ? 5 : 3) * this.clutter)
    for (let i = 0; i < 20 && n > 0 && cos.length; i++) if (this.onLevel(v, this.pick(cos).id, (this.rand() - 0.5) * 0.8, 0.05 + this.rand() * 0.3, Math.round((this.rand() - 0.5) * 30))) n--
    if (this.rand() < 0.4) this.onLevel(v, this.pick(['be-mini-drawers-3-closed', 'be-mini-drawers-3-open']), (this.rand() < 0.5 ? -1 : 1) * 0.3, 0.1)
  }

  // ---------- 购物袋（packs/shopping-bags.ts） ----------

  shoppingBags() {
    if (!ASSET_MAP.has('bag-set-mag-eco')) return
    for (const r of this.plan.rooms) {
      if (r.kind === 'entrance' && this.rand() < 0.5) this.bagOnEntranceDoor(r)
      if ((r.kind === 'ldk' || r.kind === 'kitchen') && this.plan.fixtures.some((f) => f.kind === 'kitchen' && pointInPolygon(f, r.points)) && this.rand() < 0.4) this.kitchenBag(r)
    }
  }

  /**
   * 玄关大门门扇内侧（关门时朝屋里的那一面）贴一个挂着环保袋的磁吸挂钩。
   * 门扇几何和 house.ts 的 buildOpenings 一致：铰链端 + 往开启方向偏 2，开到 62°，扇宽 w - 4、厚 3.6、y 从 1 到 197（世界高度）。
   */
  bagOnEntranceDoor(room: Room) {
    for (const o of this.plan.openings) {
      if (o.kind !== 'door' || o.roomId !== room.id) continue
      const g = openingGeom(this.plan.rooms, o)
      if (!g) continue
      const { e } = g
      // 门洞中心：同 house.ts 的 openingInfos（宽度不超过边长，中心夹在边内）
      const w = Math.min(o.width, e.length)
      const c = e.length <= w ? e.length / 2 : Math.max(w / 2, Math.min(e.length - w / 2, o.offset))
      const center = add(e.a, mul(e.dir, c))
      // 只要户外门（外墙上的门）
      if (wallThicknessAt(this.plan, center, e.out, room) < this.plan.wallOuter) continue
      const id = this.rand() < 0.8 ? 'bag-set-mag-eco' : 'bag-set-mag-regi'
      const def = ASSET_MAP.get(id)
      if (!def || w - 4 < def.w + 8) continue
      if (o.swing !== 'in') {
        // 外开门：门扇画在室外，挂钩改贴在门把手一侧、门框旁边的室内墙上
        const latch = o.hinge === 'start' ? 1 : -1
        const along = c + latch * (w / 2 + def.w / 2 + 8)
        // 两端让开相邻墙的半个墙厚（贴在墙角里会伸进侧墙）
        const side = this.plan.wallOuter / 2 + 1
        if (along - def.w / 2 < side || along + def.w / 2 > e.length - side) continue
        const half = wallThicknessAt(this.plan, center, e.out, room) / 2
        const p = add(add(e.a, mul(e.dir, along)), mul(e.out, -(half + 0.05)))
        const n = mul(e.out, -1)
        const z = Math.round((155 - def.h / 2) * 10) / 10
        const rot = Math.round((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360
        if (!this.canPlace(id, p.x, p.y, rot, z, { walls: true })) continue
        const f: Furniture = { id: uid('u'), asset: id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot, color: this.colorFor(def), z }
        this.out.push(f)
        this.flat.add(f.id)
        return f
      }
      const hinge = add(center, mul(e.dir, ((o.hinge === 'start' ? -1 : 1) * w) / 2))
      const u = o.hinge === 'start' ? e.dir : mul(e.dir, -1)
      const sw = o.swing === 'in' ? mul(e.out, -1) : e.out
      const a = (62 * Math.PI) / 180
      const d = add(mul(u, Math.cos(a)), mul(sw, Math.sin(a)))
      // 内侧面的法线：关门时是 -out，跟着门扇一起转
      const k = o.swing === 'in' ? 1 : -1
      const n = mul(add(mul(u, -Math.sin(a)), mul(sw, Math.cos(a))), k)
      const p = add(add(add(hinge, mul(sw, 2)), mul(d, (w - 4) / 2)), mul(n, 1.8 + 0.05))
      // 挂钩顶离土间地面约 155：世界高度 = 玄関地面 + 155；贴附物的 z 是中心高度、相对贴附点所在处的地面
      const top = floorY(room) + 155
      const z = Math.round((top - def.h / 2 - floorY(roomAt(this.plan, p))) * 10) / 10
      const rot = Math.round((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360
      const f: Furniture = { id: uid('u'), asset: id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot, color: this.colorFor(def), z }
      this.out.push(f)
      this.flat.add(f.id)
      return f
    }
    return null
  }

  /** 厨房 / LDK：冰箱旁边地上放一个装着东西的购物袋，或者在厨房附近的墙上挂钩里挂一个袋中袋 */
  kitchenBag(room: Room) {
    const kitchen = this.plan.fixtures.find((f) => f.kind === 'kitchen' && pointInPolygon(f, room.points))
    if (!kitchen) return
    // 冰箱（家具）旁边；没有冰箱就放厨房旁边
    const fridge = this.out.find((f) => !f.z && isMainAppliance(ASSET_MAP.get(f.asset), 'fridge') && pointInPolygon(f, room.points))
    const fridgeDef = fridge && ASSET_MAP.get(fridge.asset)
    if (this.rand() < 0.6) {
      const bags = this.find('shopping-bag', (a) => !!a.prop && !a.stick && (a.form === 'open' || a.form === 'closed' || a.form === 'standing') && Math.max(a.w, a.d) <= 40)
      if (!bags.length) return
      const def = this.pick(bags)
      const base = fridge && fridgeDef ? fridge : kitchen
      const half = (fridgeDef ? fridgeDef.w : kitchen.w) / 2
      const depth = fridgeDef ? fridgeDef.d : fixtureDepth(kitchen)
      const side = this.rand() < 0.5 ? -1 : 1
      // 靠墙（冰箱 / 设备背面那堵墙）贴着侧面
      const target = toWorld(base, side * (half + def.w / 2 + 4), -depth / 2 + def.d / 2 + 2)
      const at = this.free(room, def.id, base.rot, target)
      if (at && dist(at, target) < 60) this.push(def.id, at.x, at.y, base.rot)
      return
    }
    const stock = this.find(/^bag-(regi|konbini)-hanging/)
    if (!stock.length || !ASSET_MAP.has('bx-towel-hook')) return
    // 高的设备（冰箱、造作收纳）前面的墙不挂
    const tall = [
      ...this.plan.fixtures.filter((f) => (f.kind === 'fridge' || f.kind === 'builtin') && pointInPolygon(f, room.points)).map(fixtureBox),
      ...this.out.filter((f) => !f.z && isApplianceOf(f, 'fridge') && pointInPolygon(f, room.points)).map((f) => furnitureBox(f.asset, f.x, f.y, f.rot)),
    ]
    const hook = this.mountAvoiding(room, 'bx-towel-hook', tall, { x: kitchen.x, y: kitchen.y }, kitchen.w / 2 + 120)
    if (hook) this.hangOn(hook, this.pick(stock).id)
  }

  // ---------- 墙上的艺术品（more-variety 包：装饰画 / 照片墙 / 立体壁饰） ----------

  /**
   * 居室 / LDK 的墙上挂 1–3 件艺术品（东西多的人家多挂，现代简约少挂）：
   * 先在沙发 / 床 / 书桌正上方居中挂一幅大画，剩下的照片墙、壁饰、小画挂在空墙上。
   * 避开门窗、设备、已有的壁挂 / 贴墙物和高家具（有台面的家具按之后会摆上东西的高度算）。
   */
  artWall(room: Room) {
    const all = this.find(/^mv-(art|photo|deco)-/, (a) => !!a.mount)
    if (!all.length) return
    const styled = (xs: AssetDef[]) => {
      const f = xs.filter((a) => (a.styles ?? []).includes(this.style))
      return f.length ? f : xs
    }
    const inRoom = (o: Furniture) => pointInPolygon(o, room.points)
    const have = this.out.filter((o) => inRoom(o) && hasTag(ASSET_MAP.get(o.asset), 'wall-art')).length
    const want = Math.max(1, Math.min(3, Math.round((0.8 + this.rand() * 1.7) * this.clutter - (this.style === 'modern' ? 0.5 : 0))))
    let n = Math.max(0, Math.min(want - have, 3))
    if (!n && !have) n = 1
    if (!n) return
    // 1. 大画挂在沙发 / 床 / 书桌上方（婴儿床上方不挂）
    const rank = (d: AssetDef) => (hasTag(d, 'sofa') && d.type !== 'floor-cushion' ? 0 : isBed(d) && d.type !== 'crib' ? 1 : isDeskish(d) && d.surface ? 2 : -1)
    const anchors = this.out
      .filter((o) => inRoom(o) && !this.flat.has(o.id) && !ASSET_MAP.get(o.asset)?.prop && rank(ASSET_MAP.get(o.asset)!) >= 0)
      .sort((a, b) => rank(ASSET_MAP.get(a.asset)!) - rank(ASSET_MAP.get(b.asset)!))
    const big = styled(all.filter((a) => a.id.startsWith('mv-art-')))
    for (const anc of anchors.slice(0, 2)) {
      if (n <= 0) break
      if (this.artAbove(room, anc, big)) n--
    }
    // 2. 照片墙 / 壁饰 / 小画挂在空墙上
    const free = styled(all.filter((a) => !a.id.startsWith('mv-art-') || a.w <= 60))
    for (let k = 0; k < n; k++) if (!this.artFree(room, free)) break
  }

  /** 挂在 anchor 正上方的墙上居中：anchor 的背面要贴着墙，画的宽度不超过 anchor */
  private artAbove(room: Room, anchor: Furniture, pool: AssetDef[]) {
    const ad = ASSET_MAP.get(anchor.asset)!
    const fd = frontDir(anchor.rot)
    const back = add({ x: anchor.x, y: anchor.y }, mul(fd, -ad.d / 2))
    const onWall = edgesOf(room.points).some((e) => e.out.x * -fd.x + e.out.y * -fd.y > 0.99 && projectToSegment(back, e.a, e.b).d < this.plan.wallOuter / 2 + 6)
    if (!onWall) return null
    const top = Math.max(ad.h, ad.surface ? ad.surface + (isBed(ad) ? 35 : 60) : 0)
    const fits = pool.filter((a) => a.w <= ad.w - 10 && (a.mount ?? 0) >= top + 8 && (a.mount ?? 0) + a.h <= 215)
    for (const a of this.shuffle(fits).slice(0, 8)) {
      const p = add(back, mul(fd, a.d / 2))
      if (!this.allow(a.id, p) || !this.artClear(room, a.id, p.x, p.y, anchor.rot)) continue
      return this.push(a.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, anchor.rot, true)
    }
    return null
  }

  /** 在空墙上找位置挂一件：前几个立面上不冲突的候选里随机挑 */
  private artFree(room: Room, pool: AssetDef[]) {
    for (const a of this.shuffle(pool).slice(0, 8)) {
      const c = placeCandidates(room, { ...this.plan, fixtures: [] }, { kind: 'ps', lengths: [a.w], depth: a.d, front: 0, centered: this.rand() < 0.6 })
      const ok: Fixture[] = []
      for (const f of c) {
        if (this.artClear(room, a.id, f.x, f.y, f.rot)) ok.push(f)
        if (ok.length >= 3) break
      }
      const f = ok.length ? this.pick(ok) : null
      if (!f || !this.allow(a.id, f)) continue
      return this.push(a.id, f.x, f.y, f.rot, true)
    }
    return null
  }

  /**
   * 挂画能不能挂在 (x, y, rot)：平面上重叠的东西在立面上也要错开 3cm（有台面的家具按以后会摆上东西的高度算），
   * 不挂在设备上方，离门窗两侧各留 15（规则见 Occupancy.canPlace）
   */
  private artClear(room: Room, asset: string, x: number, y: number, rot: number) {
    return this.canPlace(asset, x, y, rot, undefined, { walls: true, reserve: true, gap: 3, room, inside: false, fixtureFree: true, openings: 15 })
  }

  /**
   * 楼梯下敞开的储物角（楼梯 under = 'open'）：顺着储物角摆两三件矮柜 / 收纳箱，正面朝开口那一侧
   * （开口外 30cm 在同一个房间里的那一侧）。楼梯是设备、平常摆家具时是障碍，这里直接按储物角的矩形摆。
   */
  underStairs() {
    for (const f of this.plan.fixtures) {
      if (f.kind !== 'stairs' || f.under !== 'open' || f.id.endsWith('~hole')) continue
      const z = stairUnderZone(f, riseOf(this.plan, floorOf(this.plan, f)))
      if (!z) continue
      const w = stairToWorld(f)
      const mid = { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 }
      const home = this.plan.rooms.find((r) => pointInPolygon(w(mid), r.points))
      if (!home) continue
      // 开口外侧 30cm 要在同一个房间里，且没被设备（冰箱位、厨房…）挡住
      const others = this.plan.fixtures.filter((x) => x !== f && x.kind !== 'ps' && !x.id.endsWith('~hole')).map(fixtureBox)
      const open = (q: Vec) => pointInPolygon(q, home.points) && !others.some((b) => q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1)
      const n = z.fronts.find((q) => {
        const edge = q.x > 0 ? z.x1 : z.x0
        return [mid.y, z.y0 + 10, z.y1 - 10].every((y) => open(w({ x: edge + q.x * 30, y })))
      })
      if (!n) continue
      const depthMax = z.x1 - z.x0 - 4
      const pool = this.shuffle(this.find(UNDER_STAIR, (d) => d.h <= z.clear && d.d <= depthMax))
      if (!pool.length) continue
      this.style = this.styleFor(home)
      // 世界坐标里的开口方向 → 家具朝向（正面 = 局部 +y）
      const o = w({ x: 0, y: 0 })
      const nw = { x: w(n).x - o.x, y: w(n).y - o.y }
      const rot = (Math.round((Math.atan2(-nw.x, nw.y) * 180) / Math.PI / 90) * 90 + 360) % 360
      const edge = n.x > 0 ? z.x1 : z.x0
      let y = z.y0 + 3
      let k = 0
      for (const d of pool) {
        if (k >= 3) break
        if (y + d.w > z.y1 - 3) continue
        const p = w({ x: edge - n.x * (d.d / 2 + 2), y: y + d.w / 2 })
        this.push(d.id, p.x, p.y, rot)
        y += d.w + 4
        k++
      }
      this.style = this.baseStyle
    }
  }

  /** 多层户型上层的走廊：靠墙一件薄的收纳柜 / 书架（留出 70 的通道） */
  upperHall(room: Room) {
    if (area(room.points) / 10000 < 3 || this.rand() > 0.75) return
    const pool = this.find(['storage-cabinet', 'bookshelf', 'storage-box'], (d) => !d.prop && !d.mount && !d.stick && d.d <= 32 && d.w >= 40 && d.w <= 120 && d.h <= 130 && d.h >= 50)
    for (const d of this.shuffle(pool).slice(0, 4)) if (this.wall(room, d.id, { front: 70 })) return
  }

  /** 多层户型：每层至少一个垃圾桶（这一层还没有就放到走廊或最大的居室里） */
  floorTrash() {
    const has = this.out.some((f) => hasTag(ASSET_MAP.get(f.asset), 'trash-bin') && this.plan.rooms.some((r) => pointInPolygon(f, r.points)))
    if (has) return
    const rooms = this.plan.rooms.filter((r) => r.kind === 'hall' || r.kind === 'western' || r.kind === 'japanese' || r.kind === 'ldk').sort((a, b) => Number(b.kind === 'hall') - Number(a.kind === 'hall') || area(b.points) - area(a.points))
    const ids = ['vb-bin-square', 'vb-bin-pedal', 'of-waste-basket'].filter((id) => ASSET_MAP.has(id))
    for (const r of rooms) for (const id of ids) if (this.wall(r, id, { front: 30 })) return
  }

  /**
   * 一键布置的流程：
   *   0. 冰箱 / 洗衣机、收纳位上的柜子、楼梯下储物角（后面的东西都要避开它们）；
   *   1. 每个房间的落地家具：大件按候选 + 打分一起挑位置（arrange.ts），配套件跟着主件放，再放其他落地的；
   *   2. 墙上的东西（空调、床头壁灯）；3. 功能性的小件；4. 个人和兴趣物件；5. 装饰；6. 柜内收纳、便签。
   */
  run() {
    this.assign()
    // 冰箱、洗衣机先放：后面的冰箱贴、洗衣液、置物架、购物袋都要找它们
    this.appliances()
    // 收纳位上的柜子（鞋柜、衣柜、食品柜）也先放：后面靠墙的家具要避开它们
    this.cabinets()
    // 楼梯下敞开的储物角
    this.underStairs()
    for (const f of this.out) this.fixed.add(f.id)
    for (const r of this.plan.rooms) {
      this.style = this.styleFor(r)
      switch (r.kind) {
        case 'ldk':
          this.ldk(r)
          break
        case 'kitchen':
          this.kitchen(r)
          break
        case 'dining':
          this.diningRoom(r)
          break
        case 'western':
          this.western(r)
          break
        case 'japanese':
          this.japanese(r)
          break
        case 'entrance':
          if (this.region === 'west') {
            this.foyer(r)
            break
          }
          this.genkan(r)
          break
        case 'wash':
          this.wall(r, 'laundry-basket')
          this.wetDress(r)
          this.laundryExtras(r)
          break
        case 'hall':
          if (this.upper) this.upperHall(r)
          else this.hall(r)
          break
        case 'toilet':
        case 'bath':
          this.wetDress(r)
          break
        case 'balcony': {
          if (this.region !== 'jp' && this.outdoorLiving(r)) break
          let stand = this.wall(r, 'laundry-stand')
          if (!stand && this.region === 'cn') for (const o of this.plan.rooms.filter((x) => x.kind === 'balcony' && x !== r)) if ((stand = this.wall(o, 'laundry-stand'))) break
          if (stand) this.laundryOn(stand)
          this.wall(r, 'planter')
          if (this.rand() < 0.5) this.wall(r, 'planter')
          this.balconyExtras(r)
          break
        }
      }
      // 衣物：收纳间装挂杆挂满衣服；卧室的化妆台、挂衣杆、内衣柜；兴趣家具；客厅的宠物用品
      if (r.kind === 'storage') {
        this.closetDress(r)
        this.storageExtras(r)
      }
      if (r.kind === 'western' || r.kind === 'japanese') this.bedroomExtras(r, 'floor')
      if (r.kind === 'western' || r.kind === 'japanese') this.personalize(r, 'floor')
      if (r.kind === 'ldk') this.shared(r, 'floor')
    }
    this.style = this.baseStyle
    if (isMultiFloor(this.plan)) this.floorTrash()
    // 地区特色：牌桌、棋桌、茶台、神棚…
    this.specialties()

    // 2. 落地的都定好之后再挂墙上的东西：空调（欧美住宅多是中央空调，不挂壁挂机）、床头壁灯。
    //    空调在占用表里连同下方到 170 的空间一起登记，之后不会再有高家具摆到它下面
    for (const r of this.plan.rooms) {
      this.style = this.styleFor(r)
      if ((r.kind === 'ldk' || r.kind === 'western' || r.kind === 'japanese') && this.region !== 'west') this.aircon(r)
      const bed = this.beds.get(r.id)
      // 床头两侧的壁灯：古典 / 和 / 中式 / 乡村 / 复古多一些
      if (bed && this.rand() < (SCONCE_STYLES.has(this.style) ? 0.4 : 0.22)) this.bedSconces(r, bed)
    }
    this.style = this.baseStyle

    // 3. 功能性的小件：书桌上的电脑（在别的摆件之前，免得桌面先被占满）、厨房吊柜 / 搁板和厨具、马桶上方的搁板、
    //    桌柜上的主角（电视、台灯、笔记本…）、挂衣杆上的衣服 / 毛巾杆上的毛巾、层板上叠放的毛巾
    this.computersForChairs()
    for (const fx of this.plan.fixtures) if (fx.kind === 'kitchen') this.kitchenWall(fx)
    for (const fx of this.plan.fixtures) if (fx.kind === 'toilet') this.toiletWall(fx)
    for (const fx of this.plan.fixtures) if (fx.kind === 'kitchen') this.kitchenDress(fx)
    this.dress()
    this.wearDress()
    for (const r of this.plan.rooms) if (r.kind === 'wash' || r.kind === 'bath') this.foldedTowels(r)

    // 4. 个人和兴趣物件：职业 / 兴趣摆件、等级套装、奖杯证书、墙上的兴趣挂件和贴纸、化妆品、全家共同的小物，机器人、摄像头
    for (const r of this.plan.rooms) {
      this.style = this.styleFor(r)
      if (r.kind === 'western' || r.kind === 'japanese') {
        this.bedroomExtras(r, 'items')
        this.personalize(r, 'items')
      }
      if (r.kind === 'ldk') this.shared(r, 'items')
    }
    this.style = this.baseStyle
    this.robots()
    // 摄像头：宠物区的宠物摄像头、婴儿床边的婴儿监视器、玄关 / 客厅的安防摄像头、门口的可视门铃 / 猫眼
    homeCams({ d: this, plan: this.plan, rand: this.rand, household: this.household })
    // 兴趣摆件里新出现的主机交给书桌、夹式摄像头夹到屏幕顶边
    settleDesks({ d: this, plan: this.plan, rand: this.rand, household: this.household })

    // 5. 装饰：墙上的艺术品、床上的玩偶、冰箱贴、购物袋，开放格子每一格补一件
    for (const r of this.plan.rooms) {
      this.style = this.styleFor(r)
      if (r.kind === 'ldk' || r.kind === 'western' || r.kind === 'japanese') this.artWall(r)
      // 走廊 / 欧美入口：长地毯、挂画、壁灯（浴室门外的地垫、垃圾桶都摆好之后）
      if (r.kind === 'hall' || (r.kind === 'entrance' && this.region === 'west')) this.passDecor(r)
      const bed = this.beds.get(r.id)
      if (bed && this.out.includes(bed)) this.plushOnBed(bed, this.occupants.get(r.id) ?? [])
    }
    this.style = this.baseStyle
    for (const fr of this.out.filter((f) => !f.z && isMainAppliance(ASSET_MAP.get(f.asset), 'fridge'))) if (this.rand() < 0.4 + 0.4 * this.clutter) this.fridgeMagnets(fr)
    // 购物袋：玄关门扇内侧的磁吸挂钩 + 环保袋，厨房地上的购物袋 / 墙上挂钩里的袋中袋
    this.shoppingBags()
    // 多宝格、书架、展示柜这类开放格子：最后补一遍，每一格都至少放一件
    this.fillCompartments()

    // 6. 柜门里 / 抽屉里收东西（外面的摆设都放完之后，只收日常用品）；少数柜子开着门。最后贴便签
    stowAll({ d: this, plan: this.plan, rand: this.rand }, (f) => this.reserved.has(f.id))
    deskExtras({ d: this, plan: this.plan, rand: this.rand, household: this.household })

    // 7. 统一校验：有问题的那件换个位置重摆，实在放不下才删
    this.validate()
    return this.out
  }

  /**
   * 无人机 / 机器人：住户里有数码、电子手工、游戏、摄影爱好或工程师类职业的，按概率摆一两样——
   * 航拍无人机（收纳箱放地上，或客厅里一块停机坪垫，预览时会有无人机从上面起飞）、桌面机器人小玩意、
   * 工作台 / 书桌上的机械臂、口袋云台；全家偶尔有一只机器狗（充电座）或陪伴机器人（充电窝）。
   */
  robots() {
    const hh = this.household
    if (!hh) return
    const FANS: InterestId[] = ['tech', 'maker', 'gaming', 'photo']
    const ENG = ['engineer', 'programmer', 'researcher']
    const fans = hh.members.filter((m) => m.age >= 8 && (m.interests.some((i) => FANS.includes(i)) || ENG.includes(m.job)))
    if (!fans.length) return
    const living = this.plan.rooms.filter((r) => r.kind === 'ldk').sort((a, b) => area(b.points) - area(a.points))[0]
    // 房间在别的楼层的人：那一层布置时再摆
    const roomOf = (m: Member) => {
      const h = this.homeOf(m)
      return h === null ? undefined : (h ?? living)
    }
    const desksIn = (room: Room) => this.out.filter((o) => !o.z && pointInPolygon(o, room.points) && !!ASSET_MAP.get(o.asset)?.surface && isDeskish(ASSET_MAP.get(o.asset)!))
    const onDesk = (room: Room, ids: string[]) => {
      for (const d of desksIn(room)) for (let t = 0; t < 4; t++) if (this.onLevel(d, this.pick(ids), (this.rand() - 0.5) * 0.7, (this.rand() - 0.5) * 0.4, Math.round((this.rand() - 0.5) * 40))) return true
      return false
    }
    const scatterOne = (room: Room, id: string) => ASSET_MAP.has(id) && this.scatter(room, [ASSET_MAP.get(id)!], 1)
    let drone = false
    for (const m of fans.slice(0, 2)) {
      const room = roomOf(m)
      if (!room) continue
      const it = new Set(m.interests)
      // 航拍无人机：摄影爱好者多半有一台
      if (!drone && this.rand() < (it.has('photo') ? 0.7 : 0.3)) {
        drone = true
        if (this.rand() < 0.5 || !living) this.wall(room, this.rand() < 0.5 ? 'rb-drone-case' : 'rb-drone-case-closed', { front: 30 })
        else if (this.freePush(living, 'rb-drone-pad', 0, centroid(living.points), 30, true) && this.rand() < 0.6) scatterOne(room, 'rb-drone-rc')
        if (this.rand() < 0.5) scatterOne(room, 'rb-drone-charger')
      }
      // 桌面机器人小玩意
      if (this.rand() < (it.has('tech') || it.has('gaming') ? 0.6 : 0.35)) onDesk(room, ['rb-emo-bot', 'rb-code-car', 'rb-transform', 'rb-tin', 'rb-drone-selfie'])
      // 机械臂：电子手工 / 硬件工程师
      if ((it.has('maker') || m.job === 'engineer') && this.rand() < 0.55) onDesk(room, ['rb-arm'])
      if (it.has('photo') && this.rand() < 0.5) onDesk(room, ['rb-gimbal'])
    }
    // 全家一只机器狗（客厅里的充电座，预览时它会起来到处走）；偶尔是陪伴机器人
    if (living && this.rand() < 0.3) this.wall(living, this.rand() < 0.65 ? 'rb-dog-dock' : 'rb-companion-nest', { front: 60 })
  }

  /** 摆到 parent 的某一层：level 为 surfaces 的下标，不给就是顶面；层板净高不够的东西放不进去 */
  onLevel(parent: Furniture, asset: string, fx: number, fz: number, lrot = 0, level?: number) {
    const type = ASSET_MAP.get(asset)?.type
    if (type && LAMP_TYPES[type]) {
      // 灯：挑中的款放不下（台面太小、层板太矮）就换一款再试，最后退回原款
      for (let k = 0; k < 4; k++) {
        const f = this.onLevelAs(parent, this.vary(asset), fx, fz, lrot, level)
        if (f) return f
      }
      return this.onLevelAs(parent, asset, fx, fz, lrot, level)
    }
    return this.onLevelAs(parent, this.vary(asset), fx, fz, lrot, level)
  }

  /** onLevel 本体：不换款 */
  private onLevelAs(parent: Furniture, asset: string, fx: number, fz: number, lrot = 0, level?: number) {
    const pd = ASSET_MAP.get(parent.asset)
    const def = ASSET_MAP.get(asset)
    if (!pd || !def) return null
    if (this.reserved.has(parent.id) && !this.noLimit) return null
    const lv: { y: number; h?: number; inside?: boolean; glass?: boolean } | undefined = level === undefined ? (pd.surface ? { y: pd.surface, h: Infinity } : pd.surfaces?.[0]) : pd.surfaces?.[level]
    if (!lv || def.h > (lv.h ?? Infinity)) return null
    // 柜门里 / 抽屉里：只有收纳那一步（stowAll）往里放日常用品，别的摆设都放在外面看得到的地方
    if (lv.inside && !lv.glass && !this.isStowing) return null
    const p = toWorld(parent, fx * pd.w, fz * pd.d)
    if (!this.allow(asset, p, parent.id)) return null
    const f: Furniture = { id: uid('u'), asset, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: (parent.rot + lrot + 360) % 360, color: this.colorFor(def), z: (parent.z ?? 0) + lv.y }
    // 整个占地在台面内
    if (!fitsOnSurface(parent, f.z!, asset, f.x, f.y, f.rot)) return null
    // 立体上不冲突（Occupancy.canPlace）：不顶到天花板、不和同一台面上已摆的东西重叠、不顶到上方墙上挂的东西、
    // 不顶进设备本体（抽油烟机、吊柜…；支撑链上的设备除外）、不插进窗帘
    if (!this.canPlace(asset, f.x, f.y, f.rot, f.z, { parent: parent.id })) return null
    this.out.push(f)
    this.flat.add(f.id)
    this.parentOf.set(f.id, parent.id)
    return f
  }

  /**
   * 开放格子不留空：多宝格、书架、展示柜、开放搁架的每一层（每一格）至少放一件。
   * 已经有东西的格子跳过；按家具挑合适的东西——多宝格放瓷器、茶具、盆景、奇石，书架放书和小摆件，其他放收纳盒、绿植、相框。
   */
  fillCompartments() {
    const ok = (a: AssetDef) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging'
    const pools = {
      chinese: this.find('curio-ok', ok),
      books: this.find(['book', 'manga', 'magazine'], ok),
      // 棋牌（花札盒之类）按地区：中式 / 欧美的格子里不塞花札
      // 厕所、浴室、洗衣用品（除臭盒、洗剂……）不进柜架格子
      deco: this.regionalGames(this.find('high-ok', (a) => ok(a) && !hasTag(a, 'wet-supply'))),
      // 展示柜、收藏柜：放收藏品，不放收纳盒、牌盒
      collection: this.find('collectible', ok),
    }
    for (const parent of [...this.out]) {
      const pd = ASSET_MAP.get(parent.asset)
      if (!pd || pd.prop || !pd.surfaces?.length || parent.z) continue
      // 相机展示柜这类专用柜由 fillCameras 摆满，这里不碰
      if (!isOpenShelf(pd) || this.reserved.has(parent.id)) continue
      const kids = this.out.filter((o) => this.parentOf.get(o.id) === parent.id)
      const chineseShelf = hasTag(pd, 'curio-shelf')
      const collectionShelf = hasTag(pd, 'collection-shelf')
      // 收藏柜像相机展示柜一样放开同类数量限制：同类收藏品可以摆好几件
      this.noLimit = collectionShelf
      pd.surfaces.forEach((lv, i) => {
        // 挂钩、柜门里的层（关着门看不见，不要求放满）不管
        if (lv.kind === 'hook' || (lv.inside && !lv.glass)) return
        const z = (parent.z ?? 0) + lv.y
        // 这一层的每个格子（shape 里的每个多边形；没有 shape 就是整层）
        const cells: Poly[] = lv.shape?.length ? lv.shape : [[[-pd.w / 2, -pd.d / 2], [pd.w / 2, -pd.d / 2], [pd.w / 2, pd.d / 2], [-pd.w / 2, pd.d / 2]]]
        for (const cell of cells) {
          const xs = cell.map((q) => q[0])
          const zs = cell.map((q) => q[1])
          const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
          const inCell = (o: Furniture) => {
            if (Math.abs((o.z ?? 0) - z) > 0.5) return false
            const l = toLocal(parent, o)
            return l.x >= x0 - 1 && l.x <= x1 + 1 && l.y >= z0 - 1 && l.y <= z1 + 1
          }
          if (kids.some(inCell) || this.out.some((o) => o.z !== undefined && this.parentOf.get(o.id) === parent.id && inCell(o))) continue
          const roomH = lv.h ?? 40
          const fits = (a: AssetDef) => a.h <= roomH - 1.5 && a.w <= x1 - x0 - 1 && a.d <= z1 - z0 - 1
          const pool = (
            chineseShelf && this.rand() < 0.8
              ? pools.chinese
              : collectionShelf
                ? pools.collection
                : hasTag(pd, 'bookshelf') && this.rand() < 0.65
                  ? pools.books
                  : pools.deco
          ).filter(fits)
          // 收藏柜：先收藏品，再是小摆件、书；收纳盒、牌盒 / 桌游盒这类「盒子」不进展示柜（放不下就空着）
          const fallback = (collectionShelf ? [...this.shuffle(pools.collection), ...this.shuffle(pools.deco.filter((a) => !hasTag(a, 'storage-box', 'tabletop-game'))), ...this.shuffle(pools.books)] : [...pools.deco, ...pools.books]).filter(fits)
          const n = x1 - x0 > 45 && this.rand() < 0.5 + 0.3 * this.clutter ? 2 : 1
          let placed = 0
          // 同一件柜子里同款只放一次（小格子多的柜子不会被同一样东西塞满）；实在没有别的放得下才重复
          const used = new Set(kids.map((k) => k.asset))
          const cands = [...this.shuffle(pool), ...(collectionShelf ? fallback : this.shuffle(fallback))]
          // 收藏柜：重复只在收藏品里重复（一格一辆小汽车、一个手办都自然），不重复牌盒之类
          const repeats = cands.filter((c) => used.has(c.id) && (!collectionShelf || pools.collection.includes(c)))
          for (const a of [...cands.filter((c) => !used.has(c.id)), ...repeats]) {
            if (placed >= n) break
            const cx = (x0 + x1) / 2 + (n > 1 ? (placed ? 0.25 : -0.25) * (x1 - x0) : (this.rand() - 0.5) * 0.3 * (x1 - x0 - a.w))
            const cz = (z0 + z1) / 2
            // 格子中间被旁边斜放的东西占了一角：再试贴着格子四角放
            const ex = Math.max(0, (x1 - x0 - a.w) / 2 - 0.5)
            const ez = Math.max(0, (z1 - z0 - a.d) / 2 - 0.5)
            const spots: [number, number][] = placed || n > 1 ? [[cx, cz]] : [[cx, cz], [(x0 + x1) / 2 + ex, cz - ez], [(x0 + x1) / 2 - ex, cz - ez], [(x0 + x1) / 2 + ex, cz + ez], [(x0 + x1) / 2 - ex, cz + ez]]
            let f: Furniture | null = null
            for (const [sx, sz] of spots) if ((f = this.onLevel(parent, a.id, sx / pd.w, sz / pd.d, 0, i))) break
            if (f) {
              kids.push(f)
              placed++
            }
          }
        }
      })
    }
    this.noLimit = false
  }

  /** 给桌、柜摆上东西 */
  dress() {
    const base = this.style
    for (const f of [...this.out]) {
      const def = ASSET_MAP.get(f.asset)
      if (!def?.surface || def.prop) continue
      const rules = DRESS[f.asset] ?? dressFor(def)
      if (!rules) continue
      // 按家具所在房间的风格挑款、配色（卧室的床头灯跟着房间主人的风格）
      const room = this.plan.rooms.find((r) => pointInPolygon(f, r.points))
      this.style = room ? this.styleFor(room) : base
      // 每组的第一件是主角（电视、笔记本、台灯…）必摆，其余随机点缀；床头柜的台灯八成五的概率摆
      const list = typeof rules === 'function' ? rules(def) : rules
      list.forEach(([asset, fx, fz, rot, must], i) => {
        const lead = i === 0 && !(def.type === 'nightstand' && this.rand() >= 0.85)
        if (lead || (i > 0 && (must || this.rand() < 0.8))) this.onLevel(f, asset, fx, fz, rot)
      })
    }
    this.style = base
  }
}

/** 开放格子的柜架（多宝格、书架、展示柜、开放搁架）：一键布置会保证每一格都放了东西。鞋柜、厨卫、衣物、宠物等有专门的摆法，不算 */
export function isOpenShelf(d: AssetDef) {
  return !d.prop && !!d.surfaces?.length && hasTag(d, 'open-shelf')
}

/**
 * 同类数量规则：[分组, 标签, 范围, 上限]（按顺序取第一条命中的）。同一分组按功能归类（不同款的电饭煲算一类）。
 * 上限为 0 表示「按住户人数 + 1」（杯子）。没匹配上的不限（书、绿植、手办、鞋、贴纸…）。
 */
const LIMITS: [string, Tag | Tag[], 'house' | 'room' | 'surface', number][] = [
  ['tv', 'tv', 'room', 1],
  ['console', 'game-console', 'house', 2],
  ['rice-cooker', 'rice-cooker', 'house', 1],
  ['kettle', 'kettle', 'house', 1],
  ['microwave', ['microwave', 'steam-oven'], 'house', 1],
  ['toaster', 'toaster', 'house', 1],
  ['coffee', 'coffee-maker', 'house', 1],
  ['air-fryer', 'air-fryer', 'house', 1],
  ['pressure', 'pressure-cooker', 'house', 1],
  ['blender', 'blender', 'house', 1],
  ['vacuum', 'vacuum', 'house', 1],
  ['router', 'router', 'house', 1],
  ['nas', 'nas', 'house', 1],
  ['piano', 'piano', 'house', 1],
  ['drums', 'drums', 'house', 1],
  ['aquarium', 'aquarium', 'house', 1],
  ['clock', 'clock', 'room', 1],
  ['floor-mirror', 'floor-mirror', 'room', 1],
  ['humidifier', 'humidifier', 'room', 1],
  ['purifier', 'purifier', 'room', 1],
  ['dehumidifier', 'dehumidifier', 'room', 1],
  ['trash', 'trash-bin', 'room', 1],
  ['laptop', 'laptop', 'surface', 1],
  ['desk-lamp', 'desk-lamp', 'surface', 1],
  ['table-lamp', 'table-lamp', 'surface', 1],
  ['monitor', 'monitor', 'surface', 1],
  ['tea-set', 'tea-set', 'surface', 1],
  ['fruit', 'fruit-bowl', 'surface', 1],
  ['vase', 'vase', 'surface', 1],
  ['key-tray', 'key-tray', 'surface', 1],
  ['makeup-mirror', 'makeup-mirror', 'surface', 1],
  ['keyboard', 'keyboard', 'surface', 1],
  ['cup', 'cup', 'house', 0],
]

/** 居室里放不下床的扣分：比通道堵住（每个出入口 150 + 30）扣得还多，床一定要摆，通道交给校验再挪别的东西 */
const BED_MISS = 1000

/** 主要通道检查的房间（起居的地方）和通道半宽（宽 40 的人能侧身走过） */
const PASSAGE_ROOMS = new Set(['ldk', 'western', 'japanese', 'hall', 'kitchen', 'dining'])
const PASSAGE_R = 20
/** 玄关 / 入口的通道半宽（宽 60：正面走过去，不用侧身） */
const ENTRY_R = 30

/** 分步布置：floor = 落地家具那一步，items = 摆件 / 壁挂那一步，all = 一步做完（检查清单补齐等单独调用） */
type Phase = 'floor' | 'items' | 'all'

/** 兴趣类的功能房：主人的等级套装、奖杯证书摆在这里 */
const HOBBY_PURPOSES: RoomPurpose[] = ['study', 'library', 'gaming', 'music', 'theater', 'hobby', 'gym', 'cards']
export const PURPOSE_LABELS: Record<RoomPurpose, string> = {
  study: '书房',
  library: '书房 · 阅读室',
  gaming: '电竞房',
  music: '音乐室',
  theater: '影音室',
  hobby: '手作 / 兴趣室',
  gym: '健身房',
  play: '儿童游戏室',
  guest: '客房',
  closet: '衣帽间',
  cards: '棋牌室',
}

/** 床（含儿童床、婴儿床） */
const isBed = (d: AssetDef) => hasTag(d, 'bed')

/** 同款系列（同一造型的各尺寸）的成员，不含挂起形态；没有系列就只有自己 */
function seriesIds(id: string) {
  const s = ASSET_MAP.get(id)?.series
  return s ? ASSETS.filter((a) => a.series === s && !a.form?.includes('hanging')).map((a) => a.id) : []
}
/** 同一细分类型的各款各尺寸（婴儿床的各种造型、小一号的衣柜…），不含挂起形态；没有类型就只有自己 */
function sameType(id: string) {
  const t = ASSET_MAP.get(id)?.type
  return t ? ASSETS.filter((a) => a.type === t && !a.fixture && !a.form?.includes('hanging')).map((a) => a.id) : ASSET_MAP.has(id) ? [id] : []
}

/**
 * 灯具：换款时从哪些细分类型里挑（书桌上也可以摆普通台灯）、占地上限（太大的不随机挑），以及同类数量上限。
 */
const LAMP_TYPES: Partial<Record<Tag, { pool: Tag[]; maxSide: number; scope: 'room' | 'surface'; max: number }>> = {
  'floor-lamp': { pool: ['floor-lamp'], maxSide: 62, scope: 'room', max: 1 },
  'table-lamp': { pool: ['table-lamp'], maxSide: 40, scope: 'surface', max: 1 },
  'desk-lamp': { pool: ['desk-lamp', 'table-lamp'], maxSide: 40, scope: 'surface', max: 1 },
  'wall-lamp': { pool: ['wall-lamp'], maxSide: 40, scope: 'room', max: 2 },
}

/** 爱在床头挂壁灯的风格 */
const SCONCE_STYLES = new Set<StyleTag>(['classic', 'japanese', 'chinese', 'farmhouse', 'retro'])

/**
 * 常换款的细分类型：摆到这一类的默认款（sizeLabel「标准」的那件，代码里点名的 'bookshelf'、'prop-mug' 这类）时，
 * 在同类型、尺寸几乎一样的各款里换一个造型；always 的类型不论摆的是哪一款都换（餐椅、床头柜、伞架…每次都不一样）。
 * 不在表里的（书桌、床、餐桌这类按尺寸挑的，或者洗发水 / 护发素这类功能不同的）不换；特意挑中的某一款也不换
 */
const VARY_TYPES = new Set<Tag>([
  'coffee-table', 'rug', 'bookshelf', 'plant', 'dresser', 'laundry-basket', 'shoe-storage', 'planter', 'aircon', 'trash-bin', 'book', 'mug', 'coffee-cup',
  'vase', 'fruit-bowl', 'key-tray', 'electric-kettle', 'perfume', 'toothbrush', 'knife-block', 'storage-box', 'toilet-brush', 'hamper', 'washer-rack', 'bath-pail',
])
const ALWAYS_VARY = new Set<Tag>(['dining-chair', 'body-scale', 'bath-mat', 'kid-bed', 'crib', 'umbrella-stand', 'floor-cushion', 'nightstand', 'laundry-stand', 'plush'])

/** 书桌 / 工作台 */
const isDeskish = (d: AssetDef) => hasTag(d, 'desk', 'workbench')

/** 家具顶面高度（相对地面）；没有顶面返回 -1 */
function surfaceTopOf(f: Furniture) {
  const d = ASSET_MAP.get(f.asset)
  return d?.surface ? (f.z ?? 0) + d.surface : -1
}

/** 桌柜上摆什么：[prop id, x 比例, z 比例, 相对旋转, 必摆] —— 第一件和标了必摆的一定摆，其余随机点缀 */
type Dress = [string, number, number, number?, boolean?][]
const DESK: Dress = [
  ['prop-laptop', -0.12, 0.08],
  ['prop-mug', 0.22, 0.22, 0, true],
  ['prop-desk-lamp', 0.36, -0.22],
]
const NIGHTSTAND: Dress = [['prop-table-lamp', 0, -0.08]]
const DINING: Dress = [
  ['prop-vase-flowers', 0, 0],
  ['prop-coffee-cup', -0.28, 0.22, 0, true],
  ['prop-coffee-cup', 0.28, -0.22, 180, true],
  ['prop-fruit-bowl', 0.26, 0.12],
]
const COFFEE: Dress = [
  ['prop-mug', 0.2, 0.15, 0, true],
  ['prop-book-stack', -0.18, -0.12, 20],
]
const CONSOLE: Dress = [
  ['prop-key-tray', -0.3, 0],
  ['prop-vase-flowers', 0.28, 0],
]
function tvDress(def: AssetDef): Dress {
  return [
    [def.w >= 160 ? 'prop-tv-55' : 'prop-tv-43', 0, -0.12],
    ['prop-game-console', -0.36, 0.15],
  ]
}
const DRESS: Record<string, Dress | ((def: AssetDef) => Dress)> = {
  desk: DESK,
  'coffee-table': COFFEE,
  'dining-table': DINING,
  'dining-table-l': DINING,
  nightstand: NIGHTSTAND,
  'tv-board': tvDress,
  chabudai: [['prop-tea-set', 0, 0]],
  kotatsu: [['prop-mikan-basket', 0, 0]],
  'shoe-cabinet': [
    ['prop-key-tray', -0.24, 0],
    ['prop-vase-flowers', 0.28, 0],
  ],
  dresser: [
    ['prop-makeup-mirror', -0.2, -0.12],
    ['prop-perfume', 0.25, 0.05],
  ],
  // 入口 / 走廊的窄边桌：钥匙盘、花
  'tbl-console': CONSOLE,
  'sw-cl-console': CONSOLE,
}
/** 素材包里新加的桌柜：按标签套用 */
function dressFor(def: AssetDef): Dress | null {
  if (hasTag(def, 'nightstand')) return NIGHTSTAND
  if (hasTag(def, 'tv-stand', 'tv')) return tvDress(def)
  if (def.category === 'study' && hasTag(def, 'table')) return DESK
  if (def.category === 'dining' && hasTag(def, 'table')) return DINING
  if (hasTag(def, 'coffee-table')) return COFFEE
  // 玄关的矮鞋柜：台面上放钥匙盘、花
  if (hasTag(def, 'shoe-storage') && def.surface && def.surface >= 80 && def.surface <= 125) return DRESS['shoe-cabinet'] as Dress
  return null
}

/** 每个居室主人的风格（按住户分配房间后）：自动墙纸用 */
export function roomStyles(plan: Plan, household?: Household) {
  const d = new Decorator({ ...plan, furniture: [] }, Math.random, household?.style ?? 'nordic', household)
  d.assign()
  const out = new Map<string, StyleTag>()
  for (const r of plan.rooms) if (d.occupants.get(r.id)?.length || d.studyOf.has(r.id)) out.set(r.id, d.styleFor(r))
  return out
}

/**
 * 检查清单补齐：在现有家具基础上只补缺的东西（不动已经摆好的）。
 */
export function applyFixes(plan: Plan, items: CheckItem[], household?: Household, seed = Date.now(), house?: HouseCtx): Furniture[] {
  const rand = rng(seed)
  const d = new Decorator({ ...plan, furniture: [] }, rand, household?.style ?? 'cute', household, house)
  d.out = plan.furniture.map((f) => ({ ...f }))
  for (const f of d.out) {
    const def = ASSET_MAP.get(f.asset)
    if (!def || f.z || def.mount || def.prop || def.h <= 3) d.flat.add(f.id)
  }
  d.assign()
  for (const f of d.out) {
    if (!f.z) continue
    const parent = d.out.find((o) => o !== f && Math.abs(surfaceTopOf(o) - (f.z ?? 0)) < 0.6 && dist(o, f) < Math.max(ASSET_MAP.get(o.asset)?.w ?? 0, ASSET_MAP.get(o.asset)?.d ?? 0))
    if (parent) d.parentOf.set(f.id, parent.id)
  }
  const roomOf = (id: string | null) => (id ? plan.rooms.find((r) => r.id === id) : undefined)
  for (const it of items) {
    const fix = it.fix
    if (!fix) continue
    const room = roomOf(it.roomId)
    if (room) d.style = d.styleFor(room)
    switch (fix.how) {
      case 'wall': {
        const base = d.find(fix.sel, (a) => !a.mount)
        const target = room ?? plan.rooms.find((r) => r.kind === 'ldk') ?? plan.rooms.find((r) => r.kind === 'western')
        if (!base.length || !target) break
        // 同一细分类型的其他款（小一号的衣柜、单人沙发、两人餐桌…）也算数
        const ids = [...new Set(base.flatMap((a) => sameType(a.id)))].map((id) => ASSET_MAP.get(id)!).filter((a) => !a.mount && !a.form?.includes('hanging'))
        const bySize = [...ids].sort((a, b) => a.w * a.d - b.w * b.d)
        const tries = [d.pick(base), ...d.shuffle(ids).slice(0, 3), ...bySize]
        let done = false
        for (const a of tries) if ((done = !!(d.wall(target, a.id, { front: 30 }) ?? d.wall(target, a.id, { front: 0 })))) break
        if (!done) for (const a of bySize.slice(0, 3)) if ((done = !!d.squeeze(target, a.id))) break
        // 玄关太小：伞架、鞋架放到相邻的走廊里（进门就能拿到）
        if (!done && target.kind === 'entrance') {
          const hall = plan.rooms.find((o) => o.kind === 'hall' && edgesOf(target.points).some((e) => sharedIntervals(e, o).length > 0))
          if (hall) for (const a of bySize.slice(0, 3)) if (d.wall(hall, a.id, { front: 0 }) ?? d.squeeze(hall, a.id)) break
        }
        break
      }
      case 'mount':
        if (room) {
          const cand = d.find(fix.sel, (a) => !!a.mount)
          if (cand.length) d.mount(room, d.pick(cand).id)
        }
        break
      case 'scatter':
        if (room) {
          const cand = d.find(fix.sel, (a) => !!a.prop && a.form !== 'hanging')
          if (cand.length) d.must(room, d.pick(cand).id)
        }
        break
      case 'fixture': {
        if (fix.fixture === 'washer') {
          // 洗衣用品放在洗衣机（家具）顶上；房间里没有洗衣机就放到房间里的台面 / 地上
          const washer = room ? d.washersIn(room)[0] : undefined
          if (!(washer && d.onWasher(washer, fix.sel)) && room) {
            const cand = d.find(fix.sel, (a) => !!a.prop && a.form !== 'hanging')
            if (cand.length) d.must(room, d.pick(cand).id)
          }
          break
        }
        const fxs = plan.fixtures.filter((f) => f.kind === fix.fixture && (!room || fix.fixture === 'kitchen' || pointInPolygon(f, room.points)))
        const fx = fxs[0]
        if (!fx) break
        if (fx.kind === 'kitchen') {
          const before = d.out.length
          d.kitchenDress(fx, [fix.sel])
          // 台面放满了：放到厨房里别的台面 / 层板（微波炉架、食器柜、冰箱顶）上，再不行放地上
          if (d.out.length === before) {
            const cand = d.find(fix.sel, (a) => !!a.prop && a.form !== 'hanging')
            const kr = plan.rooms.find((r) => pointInPolygon(fx, r.points))
            if (cand.length && kr) d.must(kr, d.pick(cand).id)
          }
        } else {
          const cand = d.find(fix.sel, (a) => !!a.prop && a.form !== 'hanging')
          if (!cand.length) break
          const a = d.pick(cand)
          const dd = fixtureDepth(fx)
          let ok = false
          for (let t = 0; t < 12 && !ok; t++) ok = !!d.onFixture(fx, a.id, (rand() - 0.5) * (fx.w - a.w - 4), (rand() - 0.5) * Math.max(0, dd - a.d - 4))
          const fr = plan.rooms.find((r) => pointInPolygon(fx, r.points))
          if (!ok && fr) d.must(fr, a.id)
        }
        break
      }
      case 'aircon':
        if (room) d.aircon(room)
        break
      case 'appliance':
        // 冰箱 / 洗衣机：补到空着的位上，没有位就靠墙放
        d.appliances(fix.kind)
        break
      case 'spot':
        // 柜子：放到空着的收纳位上
        d.cabinets(fix.type)
        break
      case 'chairs':
        for (const r of plan.rooms.filter((r) => r.kind === 'ldk' || r.kind === 'kitchen' || r.kind === 'dining')) d.chairsUpTo(r, household?.members.length ?? 4)
        break
      case 'bed':
        for (const r of plan.rooms.filter((r) => (r.kind === 'western' || r.kind === 'japanese') && (d.occupants.get(r.id)?.length ?? 0) > 0)) {
          const hasBed = d.out.some((f) => pointInPolygon(f, r.points) && hasTag(ASSET_MAP.get(f.asset), 'bed', 'bedding'))
          if (!hasBed) d.bedIn(r)
        }
        break
      case 'desk':
        for (const r of plan.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese')) {
          const people = d.peopleIn(r)
          if (!people.some((m) => JOBS[m.job].wfh || m.job === 'student' || m.job === 'schoolkid')) continue
          if (!d.out.some((f) => pointInPolygon(f, r.points) && hasTag(ASSET_MAP.get(f.asset), 'desk'))) d.deskIn(r)
        }
        break
    }
  }
  return d.out
}

/**
 * style：'auto' = 跟随住户设定（没有住户时随机）；'random' = 随机挑一个；或指定风格（公共空间和各房间统一用它）。
 * household：住户设定，决定房间分配、床、餐椅数、职业工作台、兴趣家具和摆件。
 */
export function decorate(plan: Plan, seed = Date.now(), style: StyleTag | 'random' | 'auto' = 'auto', household?: Household, house?: HouseCtx): Furniture[] {
  const rand = rng(seed)
  const styles = Object.keys(STYLE_LABELS) as StyleTag[]
  const st = style === 'auto' ? (household?.style ?? styles[Math.floor(rand() * styles.length)]) : style === 'random' ? styles[Math.floor(rand() * styles.length)] : style
  // 指定了风格就全屋统一；跟随住户时各房间用各自主人的风格
  const hh = household && style !== 'auto' ? { ...household, members: household.members.map((m) => ({ ...m, style: st })) } : household
  // 指定了统一风格时，全户分配里的成员也换成改过风格的那份（按 id 对上）
  const alloc = house?.alloc && hh && hh !== household ? remapAlloc(house.alloc, hh) : house?.alloc
  return new Decorator({ ...plan, furniture: [] }, rand, st, hh, house && { ...house, alloc }).run()
}

/** 分配表里的成员换成另一份住户里同 id 的成员 */
function remapAlloc(a: Allocation, hh: Household): Allocation {
  const by = new Map(hh.members.map((m) => [m.id, m]))
  const sw = (m: Member) => by.get(m.id) ?? m
  return {
    occupants: new Map([...a.occupants].map(([k, ms]) => [k, ms.map(sw)])),
    studyOf: new Map([...a.studyOf].map(([k, m]) => [k, sw(m)])),
    purposeOf: a.purposeOf,
  }
}

/**
 * 多层户型的一键布置：按楼层从下往上逐层布置（每层当作一份子户型，楼梯洞口和楼梯口留空的地方当障碍），
 * 房间分配全户统一，全户限量的东西算上已经布置好的楼层。家具打上所在楼层。单层户型就是 decorate。
 * seedFor：每层的种子（缺省最底层用 seed，其余加上楼层的 elevation）。
 */
export function decorateHouse(plan: Plan, seed = Date.now(), style: StyleTag | 'random' | 'auto' = 'auto', household?: Household): Furniture[] {
  if (!isMultiFloor(plan)) return decorate(plan, seed, style, household)
  const alloc = household ? allocateRooms(plan, household) : undefined
  const base = baseFloorId(plan)
  const out: Furniture[] = []
  for (const { floor, view } of floorViews(plan)) {
    const v = withStairKeepout(plan, view, floor.id)
    // 楼梯口和各房间门口之间走不走得通，由每层布置最后的统一校验（Decorator.validate）负责
    const fs = decorate(v, floor.id === base ? seed : seed + Math.round(floor.elevation), style, household, { alloc, prior: out, fixtures: plan.fixtures, plan, floorId: floor.id })
    for (const f of fs) out.push(stampFloor(plan, f, floor.id))
  }
  return out
}

/**
 * 多层户型的检查清单补齐：每个条目交给 fixFloor 指定的那层（房间条目 → 房间所在层，每层的条目 → 那层，
 * 床 / 书桌 → 每层，其余全户条目 → 最底层），房间分配全户统一。单层户型就是 applyFixes。
 */
export function applyFixesHouse(plan: Plan, items: CheckItem[], household?: Household, seed = Date.now()): Furniture[] {
  if (!isMultiFloor(plan)) return applyFixes(plan, items, household, seed)
  const alloc = household ? allocateRooms(plan, household) : undefined
  const done = new Map<string, Furniture[]>()
  for (const { floor, view } of floorViews(plan)) {
    const mine = items.filter((it) => {
      const t = fixFloor(plan, it)
      return t === '*' || t === floor.id
    })
    if (!mine.length) {
      done.set(floor.id, view.furniture)
      continue
    }
    // 别的楼层的家具（已经补过的用补过的）：全户限量的东西算上它们
    const prior = floorViews(plan)
      .filter((x) => x.floor.id !== floor.id)
      .flatMap((x) => done.get(x.floor.id) ?? x.view.furniture)
    const fs = applyFixes(withStairKeepout(plan, view, floor.id), mine, household, seed + Math.round(floor.elevation), { alloc, prior, fixtures: plan.fixtures })
    done.set(floor.id, fs.map((f) => stampFloor(plan, f, floor.id)))
  }
  return floorViews(plan).flatMap(({ floor }) => done.get(floor.id) ?? [])
}

/** 字符串 → [0, 1) 的稳定小随机数（推测衣柜主题用） */
function h01(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967296
}

/** 平面坐标 → 某个位姿的局部坐标（x, 局部 z 记作 y） */
function toLocalXY(pose: { x: number; y: number; rot: number }, p: Vec) {
  const a = (pose.rot * Math.PI) / 180
  const dx = p.x - pose.x
  const dy = p.y - pose.y
  return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) }
}
