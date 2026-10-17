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
  frontBox,
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
import { boxInside, clearances, firstDoorCenter, placeCandidates, type PlaceSpec } from './place'
import type { CheckItem } from './checklist'
import { ASSETS, ASSET_MAP, STYLE_LABELS, type AssetDef, type StyleTag } from './three/assets'
import { rng, type Poly } from './three/kit'
import { paletteStyle } from './three/catalog'
import { derivedIndex, hasDerived } from './three/stylePalettes'
import { fitsOnFixture, fitsOnSurface, fixtureTop, toLocal, toWorld } from './surface'
import { COMPETITIVE, INTEREST_TIERS, JOBS, interestFloor, interestProps, interestStickers, interestWall, jobDeskProps, levelOf, topLevel, type Household, type InterestId, type Member, type Tier } from './household'
import { furnitureBox } from './snap'
import { deskExtras, workstations } from './workstation'
import { appliancesOn, isApplianceOf, isMainAppliance, poseOnSpot, type SpotKind } from './appliance'
import { cornerSpots, showerBoxes, showerSpot } from './bathroom'
import { lidSizeFor } from './three/packs/bath-extra'
import { openingsOn, rotFacingWall } from './model'
import { snapToHook } from './surface'
import { sharedIntervals, wallThicknessAt } from './walls'
import { CLOSET_PIPE } from './three/assets'
import { edgesOf, projectToSegment } from './model'
import type { Wardrobe } from './three/garments'
import { PIPE, PIPE_WIDTHS, ROW_LENGTHS } from './three/packs/garments-pack'
import { floorY, isPlant, roomAt } from './three/house'
import { openingGeom, regionOf, type Region } from './model'
import { gameWeight } from './three/packs/games-more'
import { homeCams } from './homecams'
import { hasTag, matchSel, selKey, type Sel, type Tag } from './three/tags'

type Rand = () => number

/** 家具在平面上的朝向向量（局部 +y = 正面） */
function frontDir(rot: number): Vec {
  const a = (rot * Math.PI) / 180
  return { x: -Math.sin(a), y: Math.cos(a) }
}

function footprint(asset: string, x: number, y: number, rot: number): Box {
  const def = ASSET_MAP.get(asset)!
  const vertical = Math.round(rot / 90) % 2 === 1
  const hw = (vertical ? def.d : def.w) / 2
  const hh = (vertical ? def.w : def.d) / 2
  return { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh }
}

/** 家具当作一件 PS 设备参与碰撞（PS 没有使用空间） */
function asFixture(f: Furniture): Fixture {
  const def = ASSET_MAP.get(f.asset)!
  return { id: f.id, kind: 'ps', x: f.x, y: f.y, w: def.w, d: def.d, rot: Math.round(f.rot / 90) * 90 }
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
  ) {
    this.style = baseStyle
  }

  /** 东西多少的系数（住户性格决定） */
  get clutter() {
    return this.household?.clutter ?? 1
  }

  /** 按住户分配居室：夫妻住最大的，长辈优先和室，孩子、室友各一间，多余的做书房 / 兴趣房 */
  assign() {
    const hh = this.household
    if (!hh) return
    const rooms = this.plan.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').sort((a, b) => area(b.points) - area(a.points))
    // 欧美的 Office 是书房，最后才拿来住人
    if (this.region === 'west') rooms.sort((a, b) => Number(a.name === 'Office') - Number(b.name === 'Office'))
    const free = [...rooms]
    const take = (prefer?: (r: Room) => boolean) => {
      const i = prefer ? free.findIndex(prefer) : -1
      return free.splice(i >= 0 ? i : 0, 1)[0]
    }
    const couple = hh.members.filter((m) => m.role === 'self' || m.role === 'partner')
    const groups: Member[][] = []
    if (hh.kind === 'roommates') for (const m of hh.members) groups.push([m])
    else {
      groups.push(couple)
      for (const m of hh.members.filter((m) => m.role === 'elder')) groups.push([m])
      for (const m of hh.members.filter((m) => m.role === 'child').sort((a, b) => b.age - a.age)) groups.push([m])
    }
    for (const g of groups) {
      if (!free.length) {
        // 房间不够：小孩和父母睡，长辈 / 大孩子挤进最大的孩子房
        const room = rooms[0]
        if (room) this.occupants.set(room.id, [...(this.occupants.get(room.id) ?? []), ...g])
        continue
      }
      const elder = g[0]?.role === 'elder'
      const room = take(elder ? (r) => r.kind === 'japanese' : (r) => r.kind === 'western')
      this.occupants.set(room.id, g)
    }
    // 剩下的居室不留空：按住户的工作和兴趣排出功能房，一间一种用途
    const adults = hh.members.filter((m) => m.age >= 18)
    const has = (it: InterestId) => hh.members.filter((m) => m.interests.includes(it))
    const wanted: [RoomPurpose, Member | undefined][] = []
    const want = (p: RoomPurpose, who: Member[] | Member | undefined) => {
      const m = Array.isArray(who) ? who[0] : who
      if (m && !wanted.some(([q]) => q === p)) wanted.push([p, m])
    }
    // 骨灰级（Lv.4）的兴趣先挑一整间专用房
    const lv4 = (it: InterestId) => hh.members.filter((m) => levelOf(m, it) >= 4)
    want('cards', lv4('boardgames'))
    want('gaming', lv4('gaming').concat(lv4('streaming')))
    want('music', lv4('music'))
    want('gym', lv4('fitness'))
    want('library', lv4('reading'))
    want('hobby', [...lv4('otaku'), ...lv4('collecting'), ...lv4('photo'), ...lv4('tech')])
    want('study', adults.find((m) => JOBS[m.job].wfh))
    want('gaming', has('gaming').concat(has('streaming')))
    want('music', has('music'))
    want('theater', has('movies'))
    want('hobby', [...has('maker'), ...has('models'), ...has('crafts'), ...has('collecting'), ...has('otaku'), ...has('boardgames'), ...has('photo')])
    want('gym', [...has('fitness'), ...has('sports'), ...has('outdoor')])
    want('play', hh.members.filter((m) => m.role === 'child' && m.age < 10))
    want('library', has('reading'))
    want('study', adults[0])
    want('guest', adults[0] ?? hh.members[0])
    want('closet', adults[0] ?? hh.members[0])
    for (const r of free) {
      // 和室优先当客房 / 茶室式的书房，洋室按顺序分
      const i = r.kind === 'japanese' ? Math.max(0, wanted.findIndex(([p]) => p === 'guest' || p === 'study' || p === 'library')) : 0
      const [p, m] = wanted.splice(i, 1)[0] ?? ['guest', hh.members[0]]
      this.purposeOf.set(r.id, p)
      if (m) this.studyOf.set(r.id, m)
    }
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
    if (def.limit) return { group: def.limit.group ?? def.family ?? def.id, scope: def.limit.scope, max: def.limit.max }
    // 灯具按系列算：落地灯每间一盏、壁灯每间一对、台灯每个台面一盏
    const lamp = def.family ? LAMP_FAMILIES[def.family] : undefined
    if (lamp) return { group: def.family!, scope: lamp.scope, max: lamp.max }
    // 牙刷杯、漱口杯是洗漱用品，不算进全家的杯子数（cup 标签不含它们）
    const r = LIMITS.find(([, tag]) => hasTag(def, ...[tag].flat()))
    // 没有专门规则的：可以多摆的（multi-ok）不限，其余同款（同系列）每个房间一个
    if (!r) return hasTag(def, 'multi-ok') ? null : { group: def.family ?? def.id, scope: 'room' as const, max: 1 }
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
    if (lim.scope === 'house') return same.length < lim.max
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
    const solid = this.out.filter((f) => !this.flat.has(f.id)).map(asFixture)
    return { ...this.plan, fixtures: [...this.plan.fixtures, ...solid] }
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
  wall(room: Room, asset: string, opts: Partial<PlaceSpec> = {}) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)!
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, ...opts }
    const c = placeCandidates(room, this.ctx(), spec)
    // 前几名里随机挑一个，每次布置都有点不一样
    const f = c[Math.floor(this.rand() * Math.min(3, c.length))]
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
    const plant = isPlant(asset)
    const solid = [
      ...this.plan.fixtures.filter((f) => pointInPolygon(f, room.points)).map(fixtureBox),
      ...this.out.filter((o) => !this.flat.has(o.id) && !o.z && pointInPolygon(o, room.points)).map((o) => footprint(o.asset, o.x, o.y, o.rot)),
      // 门洞正前方的通道（门宽 × 进深 60）：门的开合范围可以占，但不能堵在门口
      ...openingsOn(room, this.plan)
        .filter(({ o }) => o.kind !== 'window')
        .map(({ o, e, center }) => {
          // 门洞可能记在隔壁房间的墙上（法线朝隔壁外侧）。绿植按本房间一侧算通道（枝叶会伸进门洞、穿到墙外）；
          // 其余小件沿用原来的规则（隔壁的门不占本房间）
          const into = plant && pointInPolygon(add(center, mul(e.out, 10)), room.points) ? e.out : mul(e.out, -1)
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
        if (!boxInside(fp, room) || solid.some((o) => boxOverlaps(o, fp))) continue
        spots.push({ p, rot, score: best.d + this.rand() * 8 })
      }
    spots.sort((a, b) => a.score - b.score)
    const s = spots[0]
    return s ? this.push(asset, s.p.x, s.p.y, s.rot) : null
  }

  obstacles(room: Room) {
    const ctx = this.ctx()
    const inRoom = ctx.fixtures.filter((f) => pointInPolygon({ x: f.x, y: f.y }, room.points))
    return [...inRoom.map(fixtureBox), ...inRoom.map(frontBox).filter((b): b is Box => !!b), ...clearances(room, ctx, false)]
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
        if (!boxInside(fp, room)) continue
        if (obs.some((o) => boxOverlaps(o, grown))) continue
        const d = dist({ x, y }, target)
        if (d < bd) {
          bd = d
          best = { x, y }
        }
      }
    return best
  }

  freePush(room: Room, asset: string, rot: number, target: Vec, margin = 0, flat = false) {
    asset = this.vary(asset)
    if (!this.allow(asset, target)) return null
    const p = this.free(room, asset, rot, target, margin)
    return p ? this.push(asset, p.x, p.y, rot, flat) : null
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
    const ctx = { ...this.plan, fixtures: [] }
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, far: door, centered: true }
    const f = placeCandidates(room, ctx, spec)[0]
    if (f) this.push(id, f.x, f.y, f.rot, true)
  }

  /** 挂到墙上：只避开门窗和别的壁挂物，不和地上的家具冲突 */
  mount(room: Room, asset: string) {
    asset = this.vary(asset)
    const def = ASSET_MAP.get(asset)
    if (!def?.mount) return null
    const mounted = this.out.filter((o) => ASSET_MAP.get(o.asset)?.mount && pointInPolygon(o, room.points)).map(asFixture)
    const spec: PlaceSpec = { kind: 'ps', lengths: [def.w], depth: def.d, front: 0, centered: this.rand() < 0.5 }
    const c = placeCandidates(room, { ...this.plan, fixtures: mounted }, spec)
    const f = c[Math.floor(this.rand() * Math.min(4, c.length))]
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
        const levels = [...(pd.surface && (okHigh || !high(pd.surface)) ? [undefined] : []), ...(pd.surfaces ?? []).flatMap((l, i) => (okHigh || !high(l.y) ? [i] : []))]
        if (!levels.length) continue
        const lv = this.pick(levels)
        if (this.onLevel(parent, a.id, (this.rand() - 0.5) * 0.7, (this.rand() - 0.5) * 0.6, Math.round((this.rand() - 0.5) * 40), lv)) break
      }
    }
  }

  /** 同系列里「同一尺寸、不同造型」的各款（宽深差在 10% 以内；尺寸规格不同的——床、书桌、餐桌的大小——不算） */
  private siblings = new Map<string, AssetDef[]>()
  /**
   * 换款：经常出现的东西每次都挑同系列里的不同造型，优先当前房间的风格。
   * 只在尺寸几乎一样的款之间换，所以按尺寸挑好的规格（单人床 / 双人床、110 / 140 书桌）不会被换掉。
   */
  vary(asset: string) {
    const def = ASSET_MAP.get(asset)
    if (!def?.family) return asset
    if (LAMP_FAMILIES[def.family]) return this.lampPick(def.family)
    let sib = this.siblings.get(asset)
    if (!sib) {
      const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.1 + 2
      sib = ASSETS.filter(
        (a) => a.family === def.family && a.form === def.form && !!a.mount === !!def.mount && !!a.prop === !!def.prop && !!a.stick === !!def.stick && near(a.w, def.w) && near(a.d, def.d) && Math.abs(a.h - def.h) <= def.h * 0.35 + 5,
      )
      this.siblings.set(asset, sib)
    }
    // 只在「同功能、不同造型」的系列里换：原款标了「标准」、或系列里有款式包（va- / vb- / mv-）做的新款、或明确列出的系列。
    // 同系列里功能不同的（洗发水 / 护发素 / 沐浴露、洗衣液 / 柔软剂）不能互换
    if (sib.length < 2 || !(def.sizeLabel === '标准' || STYLE_FAMILIES.has(def.family) || sib.some((a) => /^(va|vb|mv)-/.test(a.id)))) return asset
    const styled = sib.filter((a) => a.styles?.includes(this.style))
    return this.pick(styled.length && this.rand() < 0.75 ? styled : sib).id
  }

  private lampPools = new Map<string, AssetDef[]>()
  /**
   * 灯具换款：从系列（书桌灯还可以用台灯）里均匀地挑，85% 挑当前房间风格的款。
   * 不按尺寸限制换款（各风格的灯高矮胖瘦差别大），只去掉占地太大的（弧形钓鱼灯）；放不下由调用方换一款再试。
   */
  lampPick(family: string) {
    const spec = LAMP_FAMILIES[family]
    let pool = this.lampPools.get(family)
    if (!pool) {
      pool = ASSETS.filter((a) => spec.pool.includes(a.family ?? '') && !a.fixture && Math.max(a.w, a.d) <= spec.maxSide)
      this.lampPools.set(family, pool)
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
    for (const s of [-1, 1]) this.mountAvoiding(room, id, extra, add(head, mul(side, s * (def.w / 2 + lamp.w / 2 + 12))), 45)
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
    const box = furnitureBox(asset, p.x, p.y, fx.rot)
    if (this.out.some((o) => ASSET_MAP.get(o.asset)?.mount && boxesOverlap(box, furnitureBox(o.asset, o.x, o.y, o.rot)))) return null
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
      const fits = variantsOf(`${kind}-60`).concat(variantsOf(`${kind}2-60`)).map((id) => ASSET_MAP.get(id)!).filter((d) => d.w <= len - 4).sort((x, y) => y.w - x.w)
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
    if (top === undefined && !fitsOnFixture(fx, asset, f.x, f.y, f.rot)) return null
    const box = furnitureBox(asset, f.x, f.y, f.rot)
    if (this.out.some((o) => o.z === z && boxesOverlap(box, furnitureBox(o.asset, o.x, o.y, o.rot)))) return null
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
    const mounted = this.out.filter((o) => ASSET_MAP.get(o.asset)?.mount && pointInPolygon(o, room.points)).map(asFixture)
    return [...mounted, ...extra.map((b) => this.boxFixture(b))]
  }

  /** 挂到墙上（同 mount），但避开额外的盒子；near 给了就挂在那附近 */
  mountAvoiding(room: Room, asset: string, extra: Box[], near?: Vec, nearMax = 150) {
    const def = ASSET_MAP.get(asset)
    if (!def?.mount) return null
    // placeCandidates 不处理 20 以下的长度：小挂钩按 20 找位置，中心不变
    const spec: PlaceSpec = { kind: 'ps', lengths: [Math.max(20, def.w)], depth: def.d, front: 0, centered: !near && this.rand() < 0.5, ...(near ? { near, nearMax } : {}) }
    const c = placeCandidates(room, { ...this.plan, fixtures: this.mountedIn(room, extra) }, spec)
    const f = c[Math.floor(this.rand() * Math.min(near ? 2 : 4, c.length))]
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
    const cand = ASSETS.filter((a) => a.family === 'bath-wall-shelf' || a.id === 'wet-wire-basket')
    if (cand.length) this.mountAvoiding(room, this.styledPick(cand).id, showerBoxes(this.plan, room))
  }

  /** 在各款里均匀挑一款，七成偏向当前风格（款式本身的 styles 含当前风格的） */
  private styledPick(cand: AssetDef[]) {
    const styled = cand.filter((a) => a.styles?.includes(this.style))
    return this.pick(styled.length && this.rand() < 0.7 ? styled : cand)
  }

  /**
   * 浴室转角架（直角在局部左后）：从 family 'bath-corner-shelf' 的所有款式里挑（三角、扇形、圆角三角、L 形、靠角矩形、深篮、吸盘、
   * 带毛巾杆 / 挂钩、伸缩杆落地款），放进房间的阳角里，背面和左侧各贴一面墙（L 形两臂各贴一面，矩形款背贴墙、左端顶到侧墙）。
   * 壁挂款避开门窗前方、淋浴、已挂的东西、洗面台 / 马桶上方；浴缸上方的墙角排在洗身区墙角之后。
   * 伸缩杆款落地顶到天花板：墙角不能压到任何设备（含浴缸内部）、淋浴、门前通道、已挂的东西和已摆的家具，优先浴缸外侧的墙角。
   * 这一款放不进就换别的款再试两次，都不行返回 null（由调用方改放普通置物架）。
   */
  bathCorner(room: Room) {
    const all = ASSETS.filter((a) => a.family === 'bath-corner-shelf')
    if (!all.length) return null
    const shower = showerBoxes(this.plan, room)
    const guards = clearances(room, this.plan, true)
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
        .filter((s) => boxInside(s.box, room))
        .filter((s) => ![...shower, ...guards, ...mounted].some((b) => boxOverlaps(b, s.box)))
      let spots: { s: (typeof base)[number]; score: number }[]
      if (def.mount) {
        spots = base
          .filter((s) => !fixtures.some((f) => f.kind !== 'bathtub' && boxOverlaps(fixtureBox(f), s.box)))
          .map((s) => ({ s, score: (tubs.some((b) => boxOverlaps(b, s.box)) ? 10 : 0) + this.rand() }))
      } else {
        // 落地的伸缩杆：整块占地都要空着（设备、浴缸、已摆的落地家具都不能压），靠着浴缸外侧的墙角优先
        const solid = this.out.filter((o) => !this.flat.has(o.id) && pointInPolygon(o, room.points)).map((o) => fixtureBox(asFixture(o)))
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
    const box = furnitureBox(asset, f.x, f.y, f.rot)
    if (this.out.some((o) => o.z === top && boxesOverlap(box, furnitureBox(o.asset, o.x, o.y, o.rot)))) return null
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
    const lv = this.pick(hooks)
    const poly = lv.shape![0]
    const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
    const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length
    const s = snapToHook(parent, poly, toWorld(parent, cx, cz))
    const f: Furniture = { id: uid('u'), asset, x: s.x, y: s.y, rot: s.rot, color: this.colorFor(def), z: (parent.z ?? 0) + lv.y }
    this.out.push(f)
    this.flat.add(f.id)
    this.parentOf.set(f.id, parent.id)
    return f
  }

  /**
   * 扁平的小东西（体重秤、地垫）放在设备正前方的两侧：门的开合范围、设备前方的活动空间都可以踩，
   * 只避开真正立着的东西（家具、设备本体）。
   */
  flatNear(room: Room, asset: string, near: Fixture[]) {
    const def = ASSET_MAP.get(asset)
    if (!def) return null
    const solid = [...this.plan.fixtures.filter((f) => pointInPolygon(f, room.points)).map(fixtureBox), ...this.out.filter((o) => !this.flat.has(o.id) && pointInPolygon(o, room.points)).map((o) => footprint(o.asset, o.x, o.y, o.rot))]
    for (const fx of this.shuffle(near))
      for (const s of this.shuffle([-1, 1])) {
        const p = toWorld(fx, s * (fx.w / 2 - def.w / 2), fixtureDepth(fx) / 2 + def.d / 2 + 6)
        const fp = footprint(asset, p.x, p.y, fx.rot)
        if (!boxInside(fp, room) || solid.some((o) => boxOverlaps(o, fp))) continue
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
    const s = snapToHook(parent, lv.shape![0], toWorld(parent, lx, 1))
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
      const fixtures = this.plan.fixtures.filter((f) => pointInPolygon(f, room.points)).map(fixtureBox)
      const pool = diatom.length && this.rand() < 0.5 ? diatom : mats
      const order = [this.pick(pool), ...mats.sort((a, b) => a.w * a.d - b.w * b.d)]
      const rot = rotFacingWall(mul(door.into, -1))
      placed: for (const def of order) {
        const base = add(door.center, mul(door.into, door.half + def.d / 2 + 1))
        for (const k of [0, 5, -5, 10, -10, 15, -15, 20, -20, 30, -30]) {
          const p = add(base, mul(door.e.dir, k))
          const fp = footprint(def.id, p.x, p.y, rot)
          if (!boxInside(fp, room) || fixtures.some((b) => boxOverlaps(b, fp))) continue
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
   * 按住户的职业和兴趣布置：工作台上的设备、兴趣家具（落地）、兴趣摆件（散放到台面 / 层板上）、墙上挂的东西。
   * 东西多少看性格（clutter）。
   */
  personalize(room: Room) {
    const people = this.peopleIn(room)
    if (!people.length) return
    const k = this.clutter
    for (const m of people) {
      if (m.age < 3) continue
      const desk = this.out.find((o) => pointInPolygon(o, room.points) && hasTag(ASSET_MAP.get(o.asset), 'table') && ASSET_MAP.get(o.asset)?.surface)
      const deskProps = jobDeskProps(m.job)
      if (desk && deskProps.length) for (let i = 0; i < 2; i++) this.onLevel(desk, this.pick(deskProps).id, (this.rand() - 0.5) * 0.6, (this.rand() - 0.5) * 0.4, 0)
      // 等级套装和奖杯证书只摆一处：有自己的兴趣房 / 书房就摆在那里，卧室里不重复
      if (!this.ownsHobbyRoom(m, room)) {
        for (const it of m.interests) {
          const tiers = INTEREST_TIERS[it]
          if (tiers) this.tierItems(room, tiers.slice(0, levelOf(m, it) || 1))
        }
        this.honors(room, m)
      }
      // 益智小物：益智 / 棋牌爱好者、学生、程序员偶尔在桌上 / 架子上放一件
      if (!m.interests.includes('puzzles') && (m.interests.includes('boardgames') || ['student', 'schoolkid', 'programmer'].includes(m.job)) && this.rand() < 0.3) this.scatter(room, interestProps('puzzles'), 1)
      for (const it of m.interests) {
        const lv = levelOf(m, it) || 1
        const floor = interestFloor(it)
        if (floor.length && this.rand() < (0.45 + 0.15 * lv) * k) this.wall(room, this.pick(floor).id, { front: 40 })
        const props = it === 'boardgames' ? this.regionalGames(interestProps(it)) : interestProps(it)
        if (props.length) this.scatter(room, props, Math.max(1, Math.round((0.5 + 0.5 * lv) * k)))
        const wall = interestWall(it)
        if (wall.length && this.rand() < 0.5 * k) this.mount(room, this.pick(wall).id)
        const stickers = interestStickers(it)
        if (stickers.length && this.rand() < 0.6 * k) this.stickWall(room, this.pick(stickers).id)
      }
    }
    // 墙上的装饰：挂钟、挂画（不按兴趣）
    if (this.rand() < 0.5 * k) {
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
  tierItems(room: Room, tiers: Tier[]) {
    // 住人的卧室里只放小件落地设备（主机、小防潮柜）；绿幕、机柜、大展示柜、钢琴这类大件要有专门的兴趣房
    const bedroom = !!this.occupants.get(room.id)?.length
    const small = (a: AssetDef) => Math.max(a.w, a.d) <= 70 && a.h <= 120
    for (const t of tiers) {
      for (const sel of t.floor ?? []) {
        const f = this.floorOf(room, sel, { front: 40 }, bedroom ? (a) => small(a) || (CAMERA_CASE.test(a.id) && area(room.points) / 10000 >= 10) : undefined)
        // 相机展示柜 / 防潮柜：先把每一层每一格装满相机和镜头
        if (f && CAMERA_CASE.test(f.asset)) this.fillCameras(f)
      }
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
  honors(room: Room, m: Member) {
    const comp = m.interests.filter((it) => COMPETITIVE.includes(it) && levelOf(m, it) >= 3)
    const n = comp.reduce((a, it) => a + levelOf(m, it) - 2, 0)
    const walls = (sel: Sel) => this.find(sel, (a) => !!a.mount)
    if (n) {
      if (n >= 2 && this.rand() < 0.6 && (!this.occupants.get(room.id)?.length || area(room.points) / 10000 >= 12)) this.floorOf(room, /^(col-lit-showcase|lv-display)$/, { front: 40 })
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
    if (!boxInside(fp, room)) return false
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
  seatAround(room: Room, table: Furniture, seat: string, sides = [0, 1, 2, 3], gap = 6) {
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
      if (!boxInside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
      const s = this.push(seat, p.x, p.y, rot)
      if (!this.fitsFree(room, s)) {
        this.out.pop()
        continue
      }
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
    if (!this.fitsFree(room, t) || this.seatAround(room, t, seat, sides) < Math.min(2, sides.length)) {
      this.out.splice(before)
      return null
    }
    dress?.(t)
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
    if (!boxInside(fp, room)) return null
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
  shared(room: Room) {
    const hh = this.household
    if (!hh) return
    const all = new Set<InterestId>(hh.members.flatMap((m) => m.interests))
    // 茶几 / 电视柜上的益智小物
    if ((all.has('puzzles') || all.has('boardgames')) && this.rand() < 0.3) this.scatter(room, interestProps('puzzles'), 1)
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
        if (!boxInside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
        this.push(chairId, p.x, p.y, rot)
        have++
      }
  }

  /** 补一张床：按住户 / 面积挑规格，放不下就换小一号 */
  bedIn(room: Room) {
    const sizes = ['bed-semi-single', 'bed-single', 'bed-semi-double', 'bed-double', 'bed-queen']
    const people = this.occupants.get(room.id) ?? []
    const couple = people.filter((m) => m.role === 'self' || m.role === 'partner').length >= 2
    const m2 = area(room.points) / 10000
    let want = m2 < 7 ? 0 : m2 < 9 ? 1 : m2 < 11 ? 2 : m2 < 13.5 ? 3 : 4
    if (couple) want = Math.max(3, want)
    for (let i = want; i >= 0; i--) if (this.wall(room, sizes[i], { front: 30 })) return true
    return false
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
    const p = add({ x: desk.x, y: desk.y }, mul(frontDir(desk.rot), 38))
    this.push(this.chairAsset(), p.x, p.y, (desk.rot + 180) % 360)
    return true
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
  stickWall(room: Room, asset: string) {
    const def = ASSET_MAP.get(asset)
    if (!def?.stick) return null
    const mounted = this.out.filter((o) => (ASSET_MAP.get(o.asset)?.mount || ASSET_MAP.get(o.asset)?.stick) && pointInPolygon(o, room.points)).map(asFixture)
    const c = placeCandidates(room, { ...this.plan, fixtures: mounted }, { kind: 'ps', lengths: [def.w], depth: Math.max(1, def.d), front: 0, centered: this.rand() < 0.5 })
    const f = c[Math.floor(this.rand() * Math.min(4, c.length))]
    if (!f || !this.allow(asset, f)) return null
    const out = this.push(asset, f.x, f.y, f.rot, true)
    // 原点在背面中心：中心高度 150（大海报再高一点，避免碰到家具）
    out.z = Math.max(150, def.h / 2 + 100)
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
    for (let i = 0; i < n; i++) {
      const pool = kids ? cand : cand.filter((c) => !hasTag(c, 'for-kids'))
      const def = this.pick(pool.length ? pool : cand)
      const lx = (this.rand() - 0.5) * (fd.w - 20)
      // 冰箱门面在素材前沿往里 3cm（appliances.ts fridgeModel），贴附物浮出 0.3
      const p = toWorld(fr, lx, fd.d / 2 - 3 + 0.3)
      const f = this.push(def.id, p.x, p.y, fr.rot, true)
      // push 会把坐标取整：贴附物要精确贴在门面上
      f.x = Math.round(p.x * 10) / 10
      f.y = Math.round(p.y * 10) / 10
      // 贴在冰箱门上：高度在冰箱顶以下（两门小冰箱、迷你冰箱矮）
      f.z = Math.min(top - 15, 95 + this.rand() * 60) - (top < 140 ? Math.min(40, top - 50) * this.rand() : 0)
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
    const p = toWorld(washer, 0, -wd.d / 2 + rack.d / 2)
    return this.push(rack.id, p.x, p.y, washer.rot)
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
    let sofa: Furniture | null = null
    for (const id of sectional) if ((sofa = this.wall(room, id, { front: 120, far: kc }))) break
    sofa ??= this.wall(room, big ? 'sofa3' : 'sofa2', { front: 150, far: kc }) ?? this.wall(room, 'sofa2', { front: 110, far: kc })
    if (sofa) {
      const fd = frontDir(sofa.rot)
      const def = ASSET_MAP.get(sofa.asset)!
      const tableAt = add({ x: sofa.x, y: sofa.y }, mul(fd, def.d / 2 + 60))
      const rugAsset = this.rand() < 0.5 ? 'rug-round' : 'rug'
      this.push(this.vary(rugAsset), tableAt.x, tableAt.y, sofa.rot, true)
      this.freePush(room, 'coffee-table', 0, tableAt, 10)
      this.wall(room, 'tv-board', { front: 120, near: add({ x: sofa.x, y: sofa.y }, mul(fd, 320)), nearMax: 600, centered: true })
      if (this.rand() < 0.7) this.freePush(room, 'beanbag', 0, add(tableAt, mul({ x: fd.y, y: -fd.x }, 110)), 5)
      // 沙发旁的落地灯（扶手边，靠墙）
      if (this.rand() < 0.55) {
        const s = this.rand() < 0.5 ? 1 : -1
        this.wall(room, 'floor-lamp', { near: add({ x: sofa.x, y: sofa.y }, mul({ x: fd.y, y: -fd.x }, s * (def.w / 2 + 25))), nearMax: 90, centered: false })
      }
    }
    // 中式 / 欧美有独立的餐厅（客餐厅一体但分区）：餐桌摆在餐厅里
    if (!this.plan.rooms.some((r) => r.kind === 'dining')) this.dining(room, kitchen)
    const cats = this.household?.members.some((m) => m.interests.includes('cats')) ?? false
    this.corner(room, ['monstera', 'monstera', 'floor-lamp', ...(cats ? ['cat-tower'] : [])])
    if (this.rand() < 0.6) this.corner(room, ['bookshelf', 'monstera'])
  }

  dining(room: Room, kitchen?: Fixture, small = false, want?: string) {
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
    const table = this.freePush(room, asset, rot, target, 45) ?? (asset !== 'dining-table' ? this.freePush(room, 'dining-table', rot, target, 45) : null)
    if (!table) return
    const def = ASSET_MAP.get(table.asset)!
    // 长边两侧各两把椅子，椅背朝外（按家里人数，最多每边 3 把）
    const fd = frontDir(table.rot)
    const side = { x: fd.y, y: -fd.x }
    const obs = this.obstacles(room).filter((o) => !boxOverlaps(o, footprint(asset, table.x, table.y, table.rot)))
    const n = Math.max(1, Math.min(def.w > 140 ? 3 : 2, Math.ceil(size / 2)))
    for (const s of [-1, 1])
      for (let i = 0; i < n; i++) {
        if (s > 0 && i >= size - n && size > 1 && n * 2 > size) continue
        const along = n === 1 ? 0 : (i - (n - 1) / 2) * 52
        const p = add(add({ x: table.x, y: table.y }, mul(fd, s * (def.d / 2 + 6))), mul(side, along))
        const rot = s > 0 ? (table.rot + 180) % 360 : table.rot
        const fp = footprint(chairId, p.x, p.y, rot)
        if (!boxInside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
        this.push(chairId, p.x, p.y, rot)
      }
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
      const q = add({ x: desk.x, y: desk.y }, mul(frontDir(desk.rot), ASSET_MAP.get(desk.asset)!.d / 2 + 12))
      this.push(g.length ? this.pick(g).id : this.chairAsset(), q.x, q.y, (desk.rot + 180) % 360)
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
        const sofa = this.floorOf(room, 'sofa', { front: 120 }, (a) => a.w <= 200)
        this.floorOf(room, ['tv-stand', 'hifi'], { front: 120 })
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
      case 'gym':
        for (const a of this.shuffle(ALL().filter((a) => a.category === 'fitness' && !a.prop && !a.mount && Math.max(a.w, a.d) <= 220)).slice(0, 4)) this.wall(room, a.id, { front: 50 })
        this.floorOf(room, 'mirror', { front: 40 })
        this.freePush(room, this.find('yoga-mat')[0]?.id ?? 'rug-round', 0, c, 10, true)
        this.propsOf(room, ['weights', 'towel', 'water-bottle'], 4)
        break
      case 'play':
        this.freePush(room, this.find('play-mat')[0]?.id ?? 'rug-round', 0, c, 0, true)
        for (const a of this.shuffle(ALL().filter((a) => a.category === 'kids' && !a.prop && !a.mount && !hasTag(a, 'crib', 'kid-bed'))).slice(0, 4)) this.wall(room, a.id, { front: 50 })
        this.propsOf(room, 'toy', 6)
        break
      case 'guest':
        if (room.kind === 'japanese') this.wall(room, 'futon', { front: 20 })
        else this.wall(room, this.pick(['bed-single', 'bed-semi-double', 'lv-sofa-bed']), { front: 45 }) ?? this.wall(room, 'bed-semi-single', { front: 30 })
        this.wall(room, 'nightstand', { front: 30 })
        this.floorOf(room, 'luggage', { front: 30 })
        this.floorOf(room, ['clothes-rail', 'coat-rack'], { front: 40 })
        break
      case 'closet':
        for (let i = 0; i < 3; i++) this.floorOf(room, ['wardrobe', 'clothes-rail', 'storage-cabinet'], { front: 60 })
        this.floorOf(room, 'mirror', { front: 40 })
        this.propsOf(room, ['storage-box', 'hat', 'bag'], 4)
        break
    }
    if (room.kind === 'western' && this.rand() < 0.6) this.corner(room, ['monstera', 'floor-lamp', 'beanbag'])
  }

  /** 书房 / 兴趣房：没有床，大书桌 + 椅子 + 书架 */
  study(room: Room) {
    const desks = this.find(/^(tbl-desk-(120|140|160|l-left|l-right)|desk$)/, (a) => !a.prop)
    const desk = this.wall(room, desks.length ? this.pick(desks).id : 'desk', { front: 80, underWindow: true }) ?? this.wall(room, 'desk', { front: 70 })
    if (desk) {
      const owner = this.studyOf.get(room.id)
      const gaming = owner?.interests.includes('gaming') ? this.find('gaming-chair', (a) => !a.prop) : []
      const p = add({ x: desk.x, y: desk.y }, mul(frontDir(desk.rot), ASSET_MAP.get(desk.asset)!.d / 2 + 12))
      this.push(gaming.length ? this.pick(gaming).id : this.chairAsset(), p.x, p.y, (desk.rot + 180) % 360)
    }
    this.wall(room, this.pick(['bookshelf', 'bookshelf', 'dresser']), { front: 50 })
  }

  western(room: Room) {
    if (this.studyOf.has(room.id) && !this.occupants.get(room.id)?.length) return this.funcRoom(room)
    const door = firstDoorCenter(room, this.plan)
    const m2 = area(room.points) / 10000
    const people = this.occupants.get(room.id) ?? []
    const couple = people.filter((m) => m.role === 'self' || m.role === 'partner').length >= 2
    const kid = people.length === 1 && people[0].role === 'child' ? people[0] : null
    // 按住户和面积挑床：夫妻 double / queen，小孩婴儿床 / 儿童床，其余按面积；放不下就换小一号
    const sizes = ['bed-semi-single', 'bed-single', 'bed-semi-double', 'bed-double', 'bed-queen']
    let want = m2 < 7 ? 0 : m2 < 9 ? 1 : m2 < 11 ? 2 : m2 < 13.5 ? 3 : 4
    if (couple) want = Math.max(this.region === 'west' ? 4 : 3, want)
    else if (people.length) want = Math.min(want, this.region === 'west' ? 3 : 2)
    let bed: Furniture | null = null
    // 婴儿床 / 儿童床有多种款式：同系列里随便挑一款，放不下再换
    const tryKid = (id: string) => {
      for (const v of this.shuffle(variantsOf(id))) if ((bed = this.wall(room, v, { front: 40, far: door }))) return
    }
    if (kid && kid.age < 3) tryKid('kid-crib')
    if (!bed && kid && kid.age < 10) tryKid('kid-bed')
    for (let i = want; i >= 0 && !bed; i--) bed = this.wall(room, sizes[i], { front: 45, far: door })
    bed ??= this.wall(room, 'bed-semi-single', { front: 30 })
    if (bed) {
      const def = ASSET_MAP.get(bed.asset)!
      const head = add({ x: bed.x, y: bed.y }, mul(frontDir(bed.rot), -def.d / 2))
      this.wall(room, 'nightstand', { near: head, nearMax: def.w / 2 + 40 })
      if (this.rand() < 0.6) this.wall(room, 'bear', { near: head, nearMax: def.w / 2 + 80 })
      // 床头两侧的壁灯：古典 / 和 / 中式 / 乡村 / 复古多一些
      if (this.rand() < (SCONCE_STYLES.has(this.style) ? 0.4 : 0.22)) this.bedSconces(room, bed)
      this.plushOnBed(bed, people)
    }
    // 中式 / 欧美的卧室没有日式的押入れ / クローゼット：没有嵌入式衣柜和衣帽间时先放衣柜（在书桌之前占墙）
    const hasCloset = this.plan.fixtures.some((x) => x.kind === 'builtin' && x.builtinType === 'closet' && pointInPolygon(x, room.points)) || this.plan.rooms.some((o) => o.kind === 'storage' && edgesOf(room.points).some((e) => sharedIntervals(e, o).length > 0))
    const earlyWardrobe = this.region !== 'jp' && !hasCloset
    if (earlyWardrobe) this.wall(room, 'wardrobe', { front: 60 }) ?? this.wall(room, 'dresser', { front: 50 }) ?? this.wall(room, 'wardrobe', { front: 0 })
    const needsDesk = !people.length || people.some((m) => JOBS[m.job].wfh || m.job === 'student' || m.job === 'schoolkid') || this.rand() < 0.4
    const kidDesk = kid && kid.age >= 6 && kid.age < 13 && ASSET_MAP.has('kid-desk')
    const desk = needsDesk && !(kid && kid.age < 6) ? this.wall(room, kidDesk ? 'kid-desk' : 'desk', { front: 70, underWindow: true }) : null
    if (desk) {
      const p = add({ x: desk.x, y: desk.y }, mul(frontDir(desk.rot), 38))
      const gamer = people.some((m) => m.interests.includes('gaming'))
      const gaming = gamer ? this.find('gaming-chair', (a) => !a.prop) : []
      this.push(kidDesk && ASSET_MAP.has('kid-chair') ? 'kid-chair' : gaming.length ? this.pick(gaming).id : this.chairAsset(), p.x, p.y, (desk.rot + 180) % 360)
    }
    if (!earlyWardrobe && m2 >= 7.5) this.wall(room, this.pick(['wardrobe', 'dresser', 'bookshelf']), { front: 60 })
    const b = bbox(room.points)
    this.freePush(room, 'rug-round', 0, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, 0, true)
    // 猫爬架只给养猫的人家（猫本身由会动的角色负责，不再随手摆不会动的猫摆件）
    const cats = this.household?.members.some((m) => m.interests.includes('cats')) ?? false
    this.corner(room, ['monstera', 'stand-mirror', ...(cats ? ['cat-tower'] : []), 'beanbag', 'floor-lamp'])
  }

  japanese(room: Room) {
    const pp = this.purposeOf.get(room.id)
    if (this.studyOf.has(room.id) && !this.occupants.get(room.id)?.length && pp && pp !== 'guest' && pp !== 'study' && pp !== 'library') return this.funcRoom(room)
    const b = bbox(room.points)
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    // 住人的和室：铺被褥
    if (this.occupants.get(room.id)?.length) this.wall(room, 'futon', { front: 20 })
    const kotatsu = this.rand() < 0.65
    const table = this.freePush(room, kotatsu ? 'kotatsu' : 'chabudai', 0, c, 30)
    if (table) {
      const def = ASSET_MAP.get(table.asset)!
      const seats: [Vec, number][] = [
        [{ x: 0, y: 1 }, 180],
        [{ x: 0, y: -1 }, 0],
        [{ x: 1, y: 0 }, 90],
      ]
      for (const [d, rot] of seats.slice(0, kotatsu ? 2 : 3)) {
        const p = add({ x: table.x, y: table.y }, mul(d, def.w / 2 + (kotatsu ? 10 : 20)))
        const fp = footprint('zabuton', p.x, p.y, 0)
        if (boxInside(fp, room)) this.push('zabuton', p.x, p.y, rot)
      }
    }
    // 和室的落地灯：多半挑和风的款（行灯、角行灯、障子灯、石灯笼…）
    const st = this.style
    if (this.rand() < 0.7) this.style = 'japanese'
    this.corner(room, ['andon'])
    this.style = st
    if (this.rand() < 0.5) this.corner(room, ['cactus'])
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
      if (!boxInside(fp, room) || obs.some((o) => boxOverlaps(o, fp))) continue
      this.push(id, p.x, p.y, rot)
    }
  }

  /** 欧美入口（Foyer）：室内穿鞋，放一张窄边桌 / 穿鞋长凳 / 挂衣柜，伞架看运气 */
  foyer(room: Room) {
    for (const id of this.shuffle(['tbl-console', 'tbl-console', 'fm-genkan-bench', 'sf-hall-tree']).filter((x) => ASSET_MAP.has(x))) if (this.wall(room, id, { front: 50 })) break
    if (this.rand() < 0.5) this.wall(room, 'umbrella-stand')
    if (this.rand() < 0.4) this.corner(room, ['monstera', 'floor-lamp'])
    if (this.rand() < 0.35) this.mountAvoiding(room, this.lampPick('wall-lamp'), this.tallBoxes(room))
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
    // 落地挂衣杆：侧挂的衣服比杆架宽，不能碰到旁边的家具和墙上挂的东西（room 给了才查）
    const mounted = room ? this.out.filter((o) => ASSET_MAP.get(o.asset)?.mount && pointInPolygon(o, room.points)).map(asFixture) : []
    const solid = room ? [...this.ctx().fixtures, ...mounted].filter((f) => f.id !== owner.id && pointInPolygon(f, room.points)).map(fixtureBox) : []
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
        .find((d) => !!d && d.h <= maxH && d.d <= maxD && !solid.some((b) => boxesOverlap(b, furnitureBox(d.id, p.x, p.y, owner.rot))))
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
        if (!boxInside(fp, room) || obs.some((o) => boxOverlaps(o, fp)) || taken.some((t) => boxesOverlap(t, fp))) continue
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
    const inset = this.plan.wall / 2
    const doors = openingsOn(room, this.plan).map((d) => d.center)
    const blocks: Box[] = [
      ...this.plan.fixtures.filter((f) => boxOverlaps(fixtureBox(f), bbox(room.points))).map((f) => {
        const b = fixtureBox(f)
        return { x0: b.x0 - 6, y0: b.y0 - 6, x1: b.x1 + 6, y1: b.y1 + 6 }
      }),
      ...this.out.filter((o) => o.asset.startsWith('gm-closet-pipe') && pointInPolygon(o, room.points)).map((o) => furnitureBox(o.asset, o.x, o.y, o.rot)),
    ]
    const sides = edgesOf(room.points)
      .filter((e) => Math.abs(e.dir.x) < 1e-6 || Math.abs(e.dir.y) < 1e-6)
      .filter((e) => !doors.some((c) => projectToSegment(c, e.a, e.b).d < 5))
      .sort((a, b) => b.length - a.length)
    for (const e of sides) {
      const inward = mul(e.out, -1)
      const a = (Math.atan2(-inward.x, inward.y) * 180) / Math.PI
      const rot = Math.round((a + 360) % 360)
      for (const w of [...PIPE_WIDTHS].sort((p, q) => q - p)) {
        if (w > e.length - this.plan.wall - 1 || !ASSET_MAP.has(`gm-closet-pipe-${w}`)) continue
        const c = add(add(e.a, mul(e.dir, e.length / 2)), mul(inward, inset + PIPE.d / 2))
        const fp = furnitureBox(`gm-closet-pipe-${w}`, c.x, c.y, rot)
        const grown = { x0: fp.x0 - inset + 0.5, y0: fp.y0 - inset + 0.5, x1: fp.x1 + inset - 0.5, y1: fp.y1 + inset - 0.5 }
        if (!boxInside(grown, room) || blocks.some((b) => boxOverlaps(b, fp))) continue
        return this.push(`gm-closet-pipe-${w}`, c.x, c.y, rot, true)
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
    const wds = this.wardrobesFor()
    // 壁内收纳（クローゼット）：门里的挂衣杆，杆在柜内进深中间（局部 z = 0.9）
    for (const fx of this.plan.fixtures) {
      if (fx.kind !== 'builtin' || fx.builtinType !== 'closet') continue
      this.hangRows(fx, 0, 0.9, fx.w - 3.6 - 6, CLOSET_PIPE.y + CLOSET_PIPE.r + 0.45, wds, CLOSET_PIPE.y - 10, fixtureDepth(fx) - 5)
    }
    for (const f of [...this.out]) {
      const def = ASSET_MAP.get(f.asset)
      const hooks = (def?.surfaces ?? []).filter((l) => l.kind === 'hook' && l.shape?.length)
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
        const s = snapToHook(f, poly, toWorld(f, cx, cz))
        const z = (f.z ?? 0) + lv.y
        const box = furnitureBox(a.id, s.x, s.y, s.rot)
        // 下面的杆被上面垂下来的毛巾挡住、或这里已经挂了东西就跳过
        if (placed.some((b) => boxesOverlap(b, box)) || this.out.some((o) => Math.abs((o.z ?? 0) - z) < 1 && dist(o, s) < 10)) continue
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
      const levels = [...(pd.surface ? [undefined] : []), ...(pd.surfaces ?? []).flatMap((l, i) => (l.kind === 'hook' ? [] : [i]))]
      if (levels.length && this.onLevel(p, this.pick(towels).id, (this.rand() - 0.5) * 0.6, (this.rand() - 0.5) * 0.3, 0, this.pick(levels))) n--
    }
  }

  /** 卧室：化妆台（爱美妆、女性；长辈 / 和室用鏡台）+ 化妆凳 + 化妆品；内衣柜。面积不够就省略 */
  bedroomExtras(room: Room) {
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
          if (boxInside(fp, room) && !this.obstacles(room).some((o) => boxOverlaps(o, fp))) this.push('be-vanity-stool', p.x, p.y, (v.rot + 180) % 360)
        }
        const cos = this.find('cosmetics', (a) => !!a.prop && a.form !== 'hanging' && a.category === 'toiletry')
        let n = Math.round((beauty ? 5 : 3) * this.clutter)
        for (let i = 0; i < 20 && n > 0 && cos.length; i++) if (this.onLevel(v, this.pick(cos).id, (this.rand() - 0.5) * 0.8, 0.05 + this.rand() * 0.3, Math.round((this.rand() - 0.5) * 30))) n--
        if (this.rand() < 0.4) this.onLevel(v, this.pick(['be-mini-drawers-3-closed', 'be-mini-drawers-3-open']), (this.rand() < 0.5 ? -1 : 1) * 0.3, 0.1)
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
        if (boxInside(fp, room) && !obs.some((o) => boxOverlaps(o, fp))) Object.assign(f, { x: Math.round(p.x), y: Math.round(p.y) })
      }
    }
    // 内衣柜：窄高，靠墙
    if (m2 >= 6.5 && grown.length && this.rand() < (female ? 0.6 : 0.3)) {
      const open = this.rand() < 0.3
      const opts = this.find(/^be-lingerie-\d+-(open|closed)/, (a) => (a.form === 'open') === open)
      if (opts.length) this.wall(room, this.pick(opts).id, { front: 45 })
    }
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
        if (along - def.w / 2 < 2 || along + def.w / 2 > e.length - 2) continue
        const half = wallThicknessAt(this.plan, center, e.out, room) / 2
        const p = add(add(e.a, mul(e.dir, along)), mul(e.out, -(half + 0.05)))
        const n = mul(e.out, -1)
        const z = Math.round((155 - def.h / 2) * 10) / 10
        const rot = Math.round((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360
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
    const rank = (d: AssetDef) => (hasTag(d, 'sofa') && d.family !== 'beanbag' ? 0 : isBed(d) && d.family !== 'kid-crib' ? 1 : isDeskish(d) && d.surface ? 2 : -1)
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

  /** 壁挂物在 (x, y, rot) 能不能挂：平面上重叠的东西在立面上也不能重叠；不压设备，离门窗两侧各留 15 */
  private artClear(room: Room, asset: string, x: number, y: number, rot: number) {
    const def = ASSET_MAP.get(asset)!
    const box = furnitureBox(asset, x, y, rot)
    const lo = def.mount ?? 0
    const hi = lo + def.h
    for (const o of this.out) {
      const d = ASSET_MAP.get(o.asset)
      if (!d || !boxesOverlap(box, furnitureBox(o.asset, o.x, o.y, o.rot))) continue
      let z0 = d.mount ?? o.z ?? 0
      let z1 = z0 + d.h
      if (d.stick) {
        z0 = (o.z ?? 150) - d.h / 2
        z1 = z0 + d.h
      } else if (d.form === 'hanging') {
        z0 = (o.z ?? 0) - d.h
        z1 = o.z ?? 0
      } else if (d.surface && !d.prop && !d.mount) z1 = Math.max(z1, z0 + d.surface + (isBed(d) ? 35 : 60))
      if (z0 < hi + 3 && lo - 3 < z1) return false
    }
    if (this.plan.fixtures.some((f) => pointInPolygon(f, room.points) && boxesOverlap(box, fixtureBox(f)))) return false
    for (const op of openingsOn(room, this.plan)) {
      const half = op.o.width / 2 + 15
      const a = add(op.center, mul(op.e.dir, -half))
      const b = add(op.center, mul(op.e.dir, half))
      if (boxesOverlap(box, bbox([add(a, mul(op.e.out, 25)), add(b, mul(op.e.out, -25))]))) return false
    }
    return true
  }

  run() {
    this.assign()
    // 冰箱、洗衣机先放：后面的冰箱贴、洗衣液、置物架、购物袋都要找它们
    this.appliances()
    for (const r of this.plan.rooms) {
      this.style = this.styleFor(r)
      // 欧美住宅多是中央空调，不挂壁挂机
      if ((r.kind === 'ldk' || r.kind === 'western' || r.kind === 'japanese') && this.region !== 'west') this.aircon(r)
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
          // 有造作鞋柜就不再放鞋柜家具
          if (!this.plan.fixtures.some((x) => x.kind === 'builtin' && pointInPolygon(x, r.points))) this.wall(r, 'shoe-cabinet')
          if (this.rand() < 0.7) this.wall(r, 'umbrella-stand')
          // 偶尔放一张小穿鞋凳（放不下 wall 会自动跳过）
          if (this.rand() < 0.35 && ASSET_MAP.has('c2-shoe-bench-60')) this.wall(r, 'c2-shoe-bench-60', { front: 40 })
          if (this.rand() < 0.3) this.mountAvoiding(r, this.lampPick('wall-lamp'), this.tallBoxes(r))
          break
        case 'wash':
          this.wall(r, 'laundry-basket')
          this.wetDress(r)
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
          break
        }
      }
      // 衣物：收纳间挂满衣服；卧室的化妆台、内衣柜；洗面所层板上叠放毛巾
      if (r.kind === 'storage') this.closetDress(r)
      if (r.kind === 'western' || r.kind === 'japanese') this.bedroomExtras(r)
      if (r.kind === 'wash' || r.kind === 'bath') this.foldedTowels(r)
      if (r.kind === 'western' || r.kind === 'japanese') this.personalize(r)
      if (r.kind === 'ldk') this.shared(r)
      if (r.kind === 'ldk' || r.kind === 'western' || r.kind === 'japanese') this.artWall(r)
    }
    this.style = this.baseStyle
    this.specialties()
    // 厨房台面：烹饪用具优先摆这里
    for (const fx of this.plan.fixtures) if (fx.kind === 'kitchen') this.kitchenWall(fx)
    for (const fx of this.plan.fixtures) if (fx.kind === 'toilet') this.toiletWall(fx)
    for (const fx of this.plan.fixtures) if (fx.kind === 'kitchen') this.kitchenDress(fx)
    for (const fr of this.out.filter((f) => !f.z && isMainAppliance(ASSET_MAP.get(f.asset), 'fridge'))) if (this.rand() < 0.4 + 0.4 * this.clutter) this.fridgeMagnets(fr)
    // 购物袋：玄关门扇内侧的磁吸挂钩 + 环保袋，厨房地上的购物袋 / 墙上挂钩里的袋中袋
    this.shoppingBags()
    // 挂衣杆、衣桁、壁内收纳挂衣服，毛巾杆搭毛巾
    this.wearDress()
    // 电脑椅前面的桌上要有电脑（在 dress 之前补，免得桌面先被摆件占满）
    this.computersForChairs()
    this.robots()
    // 摄像头：宠物区的宠物摄像头、婴儿床边的婴儿监视器、玄关 / 客厅的安防摄像头、门口的可视门铃 / 猫眼
    homeCams({ d: this, plan: this.plan, rand: this.rand, household: this.household })
    this.dress()
    // 多宝格、书架、展示柜这类开放格子：最后补一遍，每一格都至少放一件
    this.fillCompartments()
    // 便签：贴屏幕边框、桌后墙、冰箱门，书桌上散几张
    deskExtras({ d: this, plan: this.plan, rand: this.rand, household: this.household })
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
    const roomOf = (m: Member) => this.plan.rooms.find((r) => this.occupants.get(r.id)?.includes(m) || this.studyOf.get(r.id) === m) ?? living
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
    const fam = ASSET_MAP.get(asset)?.family
    if (fam && LAMP_FAMILIES[fam]) {
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
    const lv = level === undefined ? (pd.surface ? { y: pd.surface, h: Infinity } : pd.surfaces?.[0]) : pd.surfaces?.[level]
    if (!lv || def.h > (lv.h ?? Infinity)) return null
    const p = toWorld(parent, fx * pd.w, fz * pd.d)
    if (!this.allow(asset, p, parent.id)) return null
    const f: Furniture = { id: uid('u'), asset, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: (parent.rot + lrot + 360) % 360, color: this.colorFor(def), z: (parent.z ?? 0) + lv.y }
    // 不穿模：整个占地在台面内，且不和同一台面上已摆的东西重叠
    if (!fitsOnSurface(parent, f.z!, asset, f.x, f.y, f.rot)) return null
    const box = furnitureBox(asset, f.x, f.y, f.rot)
    const clash = this.out.some((o) => o.z === f.z && o !== parent && ASSET_MAP.get(o.asset)?.prop && boxesOverlap(box, furnitureBox(o.asset, o.x, o.y, o.rot)))
    if (clash) return null
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
        if (lv.kind === 'hook') return
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
            const f = this.onLevel(parent, a.id, cx / pd.w, cz / pd.d, 0, i)
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
        const lead = i === 0 && !(def.family === 'nightstand' && this.rand() >= 0.85)
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

/** 空居室的用途 */
export type RoomPurpose = 'study' | 'library' | 'gaming' | 'music' | 'theater' | 'hobby' | 'gym' | 'play' | 'guest' | 'closet' | 'cards'
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

/** 同系列（family）的各款；没有系列就只有自己 */
function variantsOf(id: string) {
  const fam = ASSET_MAP.get(id)?.family
  return fam ? ASSETS.filter((a) => a.family === fam && !a.form?.includes('hanging')).map((a) => a.id) : ASSET_MAP.has(id) ? [id] : []
}

/** 款式不同、功能相同的系列（可以随机换款） */
/**
 * 灯具系列：换款时从哪些系列里挑（书桌上也可以摆普通台灯）、占地上限（太大的不随机挑），以及同类数量上限。
 */
const LAMP_FAMILIES: Record<string, { pool: string[]; maxSide: number; scope: 'room' | 'surface'; max: number }> = {
  'floor-lamp': { pool: ['floor-lamp'], maxSide: 62, scope: 'room', max: 1 },
  'table-lamp': { pool: ['table-lamp'], maxSide: 40, scope: 'surface', max: 1 },
  'desk-lamp': { pool: ['desk-lamp', 'table-lamp'], maxSide: 40, scope: 'surface', max: 1 },
  'wall-lamp': { pool: ['wall-lamp'], maxSide: 40, scope: 'room', max: 2 },
}

/** 爱在床头挂壁灯的风格 */
const SCONCE_STYLES = new Set<StyleTag>(['classic', 'japanese', 'chinese', 'farmhouse', 'retro'])

const STYLE_FAMILIES = new Set(['dining-chair', 'body-scale', 'bath-mat', 'kid-bed', 'kid-crib', 'umbrella-stand', 'beanbag', 'nightstand', 'laundry-stand'])

/** 书桌 / 工作台 */
const isDeskish = (d: AssetDef) => hasTag(d, 'desk', 'workbench')

/** 家具顶面高度（相对地面）；没有顶面返回 -1 */
function surfaceTopOf(f: Furniture) {
  const d = ASSET_MAP.get(f.asset)
  return d?.surface ? (f.z ?? 0) + d.surface : -1
}

const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5

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
}
/** 素材包里新加的桌柜：按标签套用 */
function dressFor(def: AssetDef): Dress | null {
  if (hasTag(def, 'nightstand')) return NIGHTSTAND
  if (hasTag(def, 'tv-stand', 'tv')) return tvDress(def)
  if (def.category === 'study' && hasTag(def, 'table')) return DESK
  if (def.category === 'dining' && hasTag(def, 'table')) return DINING
  if (hasTag(def, 'coffee-table')) return COFFEE
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
export function applyFixes(plan: Plan, items: CheckItem[], household?: Household, seed = Date.now()): Furniture[] {
  const rand = rng(seed)
  const d = new Decorator({ ...plan, furniture: [] }, rand, household?.style ?? 'cute', household)
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
        // 同系列的其他款（小一号的衣柜、单人沙发、两人餐桌…）也算数
        const ids = [...new Set(base.flatMap((a) => variantsOf(a.id)))].map((id) => ASSET_MAP.get(id)!).filter((a) => !a.mount && !a.form?.includes('hanging'))
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
export function decorate(plan: Plan, seed = Date.now(), style: StyleTag | 'random' | 'auto' = 'auto', household?: Household): Furniture[] {
  const rand = rng(seed)
  const styles = Object.keys(STYLE_LABELS) as StyleTag[]
  const st = style === 'auto' ? (household?.style ?? styles[Math.floor(rand() * styles.length)]) : style === 'random' ? styles[Math.floor(rand() * styles.length)] : style
  // 指定了风格就全屋统一；跟随住户时各房间用各自主人的风格
  const hh = household && style !== 'auto' ? { ...household, members: household.members.map((m) => ({ ...m, style: st })) } : household
  return new Decorator({ ...plan, furniture: [] }, rand, st, hh).run()
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
