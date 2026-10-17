// 一键布置里和柜子有关的两步（decorate.ts 调用）：
//   1. cabinetsOnSpots：每个空着的收纳位（鞋柜位 / 衣柜位 / 食品柜位）上放一件尺寸合适的柜子，款式按地区、风格挑；
//   2. stowAll：往有柜门 / 抽屉的柜子里收东西——衣柜挂衣服、叠衣服、收纳箱，鞋柜放鞋，食器棚放碗盘杯，
//      食品柜放食品罐头调味料，洗面柜放洗剂卷纸，电视柜 / 斗柜 / 床头柜放收纳盒和日用杂物；最后少数柜子开着门展示里面。
//
// 柜内收纳是额外的：放在所有外面的摆设之后，只用日常收纳类的东西。能体现住户个性的物品（兴趣、收藏、手办、奖杯、乐器、
// 相机、绿植、装饰摆件、书…）不往关着门的柜子里放，留在外面看得到的地方（isPersonal）。

import * as THREE from 'three'
import { edgesOf, fixtureBox, pointInPolygon, projectToSegment, uid, type Fixture, type Furniture, type Plan, type Room } from './model'
import { propsOn, toWorld } from './surface'
import { furnitureBox } from './snap'
import { poseDoors } from './three/kit'
import { isIndoor } from './walls'
import { clearances } from './place'
import { cabinetsOn, fitsSpot, poseOnStorageSpot, setOpen, SPOT_CABINET_TYPES } from './cabinet'
import { ASSET_MAP, ASSETS, type AssetDef, type StyleTag } from './three/assets'
import type { Region } from './model'
import type { Member } from './household'
import type { Wardrobe } from './three/garments'
import { hasTag, type Sel, type Tag } from './three/tags'

export interface StowHost {
  out: Furniture[]
  style: StyleTag
  readonly region: Region
  styleFor(room: Room): StyleTag
  pick<T>(xs: T[]): T
  shuffle<T>(xs: T[]): T[]
  weighted<T>(items: [T, number][]): T | undefined
  find(sel: Sel, filter?: (d: AssetDef) => boolean): AssetDef[]
  colorFor(def: AssetDef): number
  onLevel(parent: Furniture, asset: string, fx: number, fz: number, lrot?: number, level?: number): Furniture | null
  wardrobesFor(people?: Member[]): Wardrobe[]
  peopleIn(room: Room): Member[]
  hangRows(owner: { id: string; x: number; y: number; rot: number }, cx: number, cz: number, len: number, hookZ: number, wds: Wardrobe[], maxH: number, maxD: number, room?: Room): Furniture[]
  /** 收进柜子：这期间放开「门里的层不能放」和同类数量限制 */
  stowing<T>(fn: () => T): T
}
export interface StowCtx {
  d: StowHost
  plan: Plan
  rand: () => number
}

const roomOf = (plan: Plan, p: { x: number; y: number }) => plan.rooms.find((r) => pointInPolygon(p, r.points))

// ---------- 收纳位上的柜子 ----------

/** 各种收纳位的款式权重（系列 id → 权重），按地区；recessed 为嵌墙壁龛 */
function seriesWeights(fx: Fixture, region: Region, room?: Room): [string, number][] {
  const t = fx.builtinType ?? 'shoe'
  if (t === 'shoe') {
    if (region === 'jp')
      return fx.recessed
        ? [['cb-shoe-tall', 5], ['cb-shoe-low', 1], ['cb-shoe-louver', 1]]
        : [['cb-shoe-low', 3], ['cb-shoe-tall', 2], ['cb-shoe-louver', 2], ['cb-shoe-flip', 1]]
    if (region === 'cn') return [['cb-shoe-low', 2], ['cb-shoe-flip', 2], ['cb-shoe-tall', 2], ['cb-shoe-louver', 1]]
    return [['cb-shoe-louver', 2], ['cb-shoe-low', 1], ['cb-shoe-tall', 1]]
  }
  if (t === 'closet') {
    const wa = room?.kind === 'japanese' ? 3 : 0
    if (region === 'jp') return [['cb-closet-sliding', 2], ['cb-closet-hinged', 1], ['cb-oshiire', 1 + wa]]
    if (region === 'cn') return [['cb-closet-hinged', 3], ['cb-closet-sliding', 2], ['cb-closet-mirror', 1]]
    return [['cb-closet-sliding', 3], ['cb-closet-mirror', 2], ['cb-closet-hinged', 1]]
  }
  if (region === 'west') return [['cb-pantry-frame', 3], ['cb-pantry-glass', 2], ['cb-pantry-drawer', 1]]
  return [['cb-pantry-glass', 2], ['cb-pantry-drawer', 2], ['cb-pantry-frame', 1]]
}

/** 收纳位上放哪件柜子：按权重挑款式（当前风格适合的加倍），取放得进的最宽一档；挑中的款都放不进就在同类里找 */
export function cabinetFor(c: StowCtx, fx: Fixture): AssetDef | undefined {
  const { d } = c
  const room = roomOf(c.plan, fx)
  const type = fx.builtinType ?? 'shoe'
  const sizes = (series: string) => ASSETS.filter((a) => a.series === series && fitsSpot(a, fx)).sort((a, b) => b.w - a.w)
  const opts = seriesWeights(fx, d.region, room)
    .map(([s, w]): [string, number] => {
      const one = ASSETS.find((a) => a.series === s)
      return [s, sizes(s).length ? w * (one?.styles?.includes(d.style) ? 2 : 1) : 0]
    })
    .filter(([, w]) => w > 0)
  const s = d.weighted(opts)
  if (s) return sizes(s)[0]
  // 都放不进：同类里放得进的最宽一件
  return ASSETS.filter((a) => !a.prop && !a.mount && !!a.type && SPOT_CABINET_TYPES[type].includes(a.type) && fitsSpot(a, fx)).sort((a, b) => b.w - a.w)[0]
}

/** 每个空着的收纳位上放一件柜子（only：只补某一种位） */
export function cabinetsOnSpots(c: StowCtx, only?: Fixture['builtinType']) {
  const { d } = c
  const base = d.style
  for (const fx of c.plan.fixtures) {
    if (fx.kind !== 'builtin' || (only && (fx.builtinType ?? 'shoe') !== only)) continue
    if (cabinetsOn(d.out, fx).length) continue
    const room = roomOf(c.plan, fx)
    d.style = room ? d.styleFor(room) : base
    const def = cabinetFor(c, fx)
    if (!def) continue
    d.out.push({ id: uid('u'), asset: def.id, ...poseOnStorageSpot(fx, def.id), color: d.colorFor(def) })
  }
  d.style = base
}

// ---------- 往柜子里收东西 ----------

/** 体现住户个性的东西：留在外面展示，不收进关着门的柜子 */
export function isPersonal(def: AssetDef) {
  return (
    (def.tags ?? []).some((t) => t.startsWith('hobby:')) ||
    hasTag(def, 'collectible', 'curio-ok', 'decor', 'figure', 'plush', 'trophy', 'acrylic-stand', 'gacha', 'toy', 'plant', 'vase', 'wall-art', 'book', 'manga', 'magazine', 'instrument', 'camera', 'lens', 'model', 'puzzle', 'record', 'mineral', 'coin', 'stamp', 'clock', 'tabletop-game', 'video-game', 'game-console')
  )
}

type StowKind = 'clothes' | 'folded' | 'shoes' | 'food' | 'dishes' | 'wet' | 'sundries'

/** 这件柜子里该收什么 */
function stowKind(def: AssetDef, room?: Room): StowKind {
  if (hasTag(def, 'shoe-storage')) return 'shoes'
  if (hasTag(def, 'pantry')) return 'food'
  if (hasTag(def, 'wardrobe')) return 'clothes'
  if (hasTag(def, 'dresser')) return 'folded'
  if (hasTag(def, 'wet-supply') || room?.kind === 'wash' || room?.kind === 'bath' || room?.kind === 'toilet') return 'wet'
  if (hasTag(def, 'tv-stand', 'nightstand', 'bookshelf')) return 'sundries'
  if (def.category === 'kitchenware' || def.category === 'dining' || room?.kind === 'kitchen' || room?.kind === 'dining') return 'dishes'
  if (room?.kind === 'western' || room?.kind === 'japanese') return 'folded'
  return 'sundries'
}

const POOL_TAGS: Record<Exclude<StowKind, 'clothes'>, Tag[]> = {
  folded: ['clothing', 'storage-box'],
  shoes: ['shoe'],
  food: ['food', 'drink', 'spice', 'oil-bottle'],
  dishes: ['tableware', 'cup', 'mug', 'teacup', 'coffee-cup', 'tea-set'],
  wet: ['toilet-paper', 'detergent', 'softener', 'towel', 'laundry-supply', 'shampoo', 'body-soap', 'wet-supply'],
  sundries: ['storage-box', 'sundries', 'stationery', 'personal-care', 'electronics', 'cleaning'],
}

/** 可以收进柜子的东西：摆件、不挂起不壁挂不贴附、不是个性物品；衣服只要叠好的；不会发光的 */
const stowable = (a: AssetDef) => !!a.prop && !a.mount && !a.stick && a.form !== 'hanging' && !a.screenClip && !isPersonal(a) && !hasTag(a, 'light') && (!hasTag(a, 'clothing') || a.form === 'folded')

/** 食品柜放能久放的东西（罐头、调味料、米、干货、瓶装饮料、零食），不放做好的饭菜、水果 */
const PANTRY = /^(kf-(cans|seasonings|rice-sack-\d+|canisters|spice-(carousel|shelf)|cup-noodle|snacks|chips-(bag|tube)|candy-jar|pet-(bottles|500|2l)|bottle-[a-z]+|can|can-(short|slim|6|case)|tetra-(1l|200|125)|water-(500|2l|case-closed|case-24)|isshobin|beer-6|onion-bags|bread-bag)|prop-(spice-jars|condiments|oil-bottles|spice-rack)|int-coffee-canisters)$/
/** 收纳箱 / 盒里适合放进衣柜、斗柜的（不要厨房、餐桌、洗护类的盒子） */
const clothesBox = (a: AssetDef) => !hasTag(a, 'storage-box') || !['kitchenware', 'tabletop', 'toiletry', 'dining'].includes(a.category)
const KIND_FILTER: Partial<Record<StowKind, (a: AssetDef) => boolean>> = {
  clothes: clothesBox,
  folded: clothesBox,
  food: (a) => PANTRY.test(a.id),
  dishes: (a) => !hasTag(a, 'food', 'cookware', 'appliance'),
  sundries: (a) => !hasTag(a, 'food', 'drink', 'tableware', 'cookware', 'wet-supply'),
}

const poolCache = new Map<string, AssetDef[]>()
function poolFor(c: StowCtx, kind: StowKind): AssetDef[] {
  if (kind === 'clothes') {
    const k = 'clothes'
    let p = poolCache.get(k)
    if (!p) poolCache.set(k, (p = c.d.find(['clothing', 'storage-box'], (a) => stowable(a) && clothesBox(a) && (hasTag(a, 'storage-box') ? a.form !== 'open' : true))))
    return p
  }
  let p = poolCache.get(kind)
  const extra = KIND_FILTER[kind] ?? (() => true)
  if (!p) poolCache.set(kind, (p = c.d.find(kind === 'food' ? [PANTRY, ...POOL_TAGS.food] : POOL_TAGS[kind], (a) => stowable(a) && a.form !== 'open' && extra(a))))
  return p
}

/** 一层的局部包围盒 */
function bounds(def: AssetDef, i: number) {
  const s = def.surfaces![i]
  const pl = s.shape?.[0] ?? [
    [-def.w / 2, -def.d / 2],
    [def.w / 2, def.d / 2],
  ]
  const xs = pl.map((q) => q[0])
  const zs = pl.map((q) => q[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
}

/** 沿一层从左往右摆一排东西（不要求摆满，fill 为大约摆到几成） */
function fillLevel(c: StowCtx, cab: Furniture, def: AssetDef, i: number, pool: AssetDef[], fill: number) {
  const { d, rand } = c
  const lv = def.surfaces![i]
  const b = bounds(def, i)
  const depth = b.z1 - b.z0
  const width = b.x1 - b.x0
  const fits = (a: AssetDef) => a.h <= (lv.h ?? 40) - 0.5 && Math.min(a.w, a.d) <= depth - 0.5 && Math.min(a.w, a.d) <= width - 0.5
  const cands = d.shuffle(pool.filter(fits))
  if (!cands.length) return 0
  let x = b.x0 + 0.5 + rand() * 2
  const stop = b.x0 + width * fill
  let n = 0
  let miss = 0
  while (x < stop && miss < 4) {
    const a = cands[(n + miss) % cands.length]
    // 放不下就转 90° 再试（翻斗鞋柜比鞋短）
    const rot = a.d <= depth - 0.5 && a.w <= b.x1 - x - 0.5 ? 0 : a.w <= depth - 0.5 && a.d <= b.x1 - x - 0.5 ? 90 : -1
    if (rot < 0) {
      miss++
      continue
    }
    const span = rot ? a.d : a.w
    const lx = x + span / 2
    const lz = (b.z0 + b.z1) / 2
    const f = d.onLevel(cab, a.id, lx / def.w, lz / def.d, rot, i)
    if (f) {
      const fd = ASSET_MAP.get(f.asset)!
      x += (rot ? fd.d : fd.w) + 0.8
      n++
      miss = 0
    } else {
      miss++
      x += 2
    }
  }
  return n
}

/** 一件柜子里收东西：每个门里的层按概率摆一些，衣柜的挂衣杆挂衣服 */
function stowInto(c: StowCtx, cab: Furniture, wds: Wardrobe[], room?: Room) {
  const { d, rand } = c
  const def = ASSET_MAP.get(cab.asset)!
  const kind = stowKind(def, room)
  const pool = poolFor(c, kind)
  let n = 0
  ;(def.surfaces ?? []).forEach((lv, i) => {
    if (!lv.inside || lv.glass) return
    if (lv.kind === 'hook') {
      if (kind !== 'clothes' || rand() < 0.1) return
      const b = bounds(def, i)
      // 挂点带：杆在带子靠后 1.7 处（kit.pipeHook）
      const rows = d.hangRows(cab, (b.x0 + b.x1) / 2, b.z0 + 1.7, b.x1 - b.x0 - 4, (cab.z ?? 0) + lv.y, wds, (lv.h ?? 150) - 2, def.d - 6)
      n += rows.length
      return
    }
    if (lv.kind === 'clip') return
    // 衣柜挂衣杆下面的地板只放矮的收纳箱 / 叠好的衣服（衣服下摆在上面）
    const hang = kind === 'clothes' && (def.surfaces ?? []).some((h) => h.kind === 'hook' && h.y > lv.y && h.y - (h.h ?? 0) - 2 < lv.y + (lv.h ?? 0))
    const p = hang ? pool.filter((a) => a.h <= 40) : pool
    if (rand() < (kind === 'shoes' || kind === 'clothes' ? 0.85 : 0.65)) n += fillLevel(c, cab, def, i, p, 0.45 + rand() * 0.5)
  })
  return n
}

/**
 * 往全屋有柜门 / 抽屉的柜子里收东西，然后让少数柜子开着门（开着的展示里面）。
 * 摆在别的东西上的柜子（z > 0）、预留给专用摆法的柜子（相机防潮柜）不碰。
 */
export function stowAll(c: StowCtx, skip: (f: Furniture) => boolean = () => false) {
  const { d, rand } = c
  const cabs = d.out.filter((f) => !f.z && ASSET_MAP.get(f.asset)?.openable && !skip(f))
  d.stowing(() => {
    for (const cab of cabs) {
      const room = roomOf(c.plan, cab)
      const base = d.style
      if (room) d.style = d.styleFor(room)
      const people = room ? d.peopleIn(room) : []
      stowInto(c, cab, d.wardrobesFor(people.length ? people : undefined), room)
      d.style = base
    }
  })
  // 默认多数关着门；少数开着（开着的展示里面）。门扇 / 抽屉打开后扫过的地方碰到墙、别的家具、设备的不开
  for (const cab of cabs) if (rand() < 0.2 && canOpen(c, cab)) setOpen({ furniture: d.out }, cab, true)
}

/** 素材关着 / 开着的实际模型包围盒（局部坐标，按素材缓存） */
const openBoxes = new Map<string, { closed: THREE.Box3; open: THREE.Box3 }>()
function boxesOf(asset: string) {
  let b = openBoxes.get(asset)
  if (!b) {
    const def = ASSET_MAP.get(asset)!
    const g = def.build(def.palettes[0] ?? [])
    g.updateMatrixWorld(true)
    const closed = new THREE.Box3().setFromObject(g, true)
    poseDoors(g, true)
    g.updateMatrixWorld(true)
    openBoxes.set(asset, (b = { closed, open: new THREE.Box3().setFromObject(g, true) }))
  }
  return b
}

/**
 * 柜子能不能开着：打开后伸出柜体的部分（门扇、抽屉）每 4cm 取一个点，都要在室内、离墙面有半个墙厚，
 * 且不碰到别的东西（落地家具、壁挂物、设备；高度范围有重叠才算）。柜子自己和里面的东西不算。
 */
export function canOpen(c: StowCtx, cab: Furniture) {
  const { d, plan } = c
  const { closed, open } = boxesOf(cab.asset)
  const base = cab.z ?? 0
  const y0 = base + open.min.y
  const y1 = base + open.max.y
  const mine = new Set([cab.id, ...propsOn({ furniture: d.out }, cab).map((o) => o.id)])
  const half = Math.max(plan.wall, plan.wallOuter ?? plan.wall) / 2
  const others = d.out
    .filter((o) => !mine.has(o.id))
    .flatMap((o) => {
      const od = ASSET_MAP.get(o.asset)
      if (!od || od.h <= 3) return []
      const z0 = od.mount ?? o.z ?? 0
      if (Math.min(y1, z0 + od.h) - Math.max(y0, z0) <= 2) return []
      return [furnitureBox(o.asset, o.x, o.y, o.rot)]
    })
  const solid = plan.fixtures.filter((fx) => fx.kind !== 'builtin' && fx.kind !== 'fridge' && fx.kind !== 'washer').map(fixtureBox)
  // 门扇开合范围、门口前的通道（clearances）也不能挡
  const doorZones = new Map<string, ReturnType<typeof clearances>>()
  const zonesOf = (r: Room) => doorZones.get(r.id) ?? doorZones.set(r.id, clearances(r, plan, false)).get(r.id)!
  const inBox = (b: { x0: number; y0: number; x1: number; y1: number }, p: { x: number; y: number }) => p.x > b.x0 + 1 && p.x < b.x1 - 1 && p.y > b.y0 + 1 && p.y < b.y1 - 1
  for (let x = open.min.x; x <= open.max.x + 0.01; x += Math.max(1, Math.min(4, open.max.x - open.min.x)))
    for (let z = open.min.z; z <= open.max.z + 0.01; z += Math.max(1, Math.min(4, open.max.z - open.min.z))) {
      if (x > closed.min.x - 0.5 && x < closed.max.x + 0.5 && z > closed.min.z - 0.5 && z < closed.max.z + 0.5) continue
      const p = toWorld(cab, x, z)
      const room = plan.rooms.find((r) => isIndoor(r) && pointInPolygon(p, r.points))
      if (!room || edgesOf(room.points).some((e) => projectToSegment(p, e.a, e.b).d < half)) return false
      if (others.some((b) => inBox(b, p)) || solid.some((b) => inBox(b, p)) || zonesOf(room).some((b) => inBox(b, p))) return false
    }
  return true
}
