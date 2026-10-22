// 可摆放面：桌、柜的顶面，以及柜内层板（surfaces）。负责「点在不在某一层上」「射线落在哪一层」「一件家具上摆着哪些东西」。

import * as THREE from 'three'
import { fixtureDepth, kitchenSlots, pointInPolygon, type Fixture, type Furniture, type Plan, type Vec } from './model'
import { floorOf } from './floors'
import { ASSET_MAP } from './three/assets'
import { floorY, roomAt } from './three/house'
import { CLIP_DROP, isWallMounted, type Poly, type SurfaceKind } from './three/kit'

/** 平面坐标 → 家具局部坐标（x, z）；rot 为顺时针角度 */
export function toLocal(f: Pick<Furniture, 'x' | 'y' | 'rot'>, p: Vec) {
  const a = (f.rot * Math.PI) / 180
  const dx = p.x - f.x
  const dy = p.y - f.y
  return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) }
}

/** 家具局部坐标 → 平面坐标 */
export function toWorld(f: Pick<Furniture, 'x' | 'y' | 'rot'>, lx: number, lz: number): Vec {
  const a = (f.rot * Math.PI) / 180
  return { x: f.x + lx * Math.cos(a) - lz * Math.sin(a), y: f.y + lx * Math.sin(a) + lz * Math.cos(a) }
}

export interface Level {
  /** 离家具底面的高度 */
  y: number
  polys: Poly[]
  kind: SurfaceKind
  /** 净高：放进去的东西不能比它高 */
  h: number
  /** 在柜门里 / 抽屉里：柜子关着时不能往里放（见 SurfaceDef.inside） */
  inside?: boolean
  /** 浴缸边沿：围着开口的一圈窄带，东西可以横跨开口压在相对的两条边沿上（见 straddles） */
  rim?: Rim
}

/** 开口外沿 w × d（局部坐标居中）、边沿带宽 band；横跨的东西最多伸出外沿 over */
export interface Rim {
  w: number
  d: number
  band: number
  over: number
}
/** 横跨浴缸的东西（卷起的盖子比浴缸窄边长几厘米）最多伸出浴缸外沿多少 */
export const RIM_OVERHANG = 10

/**
 * 一件素材的所有可摆放层：顶面 + 柜内层板。
 * open：可开合的柜子开着——抽屉格（slide）随抽屉往前拉出。
 */
export function levels(asset: string, open = false): Level[] {
  const def = ASSET_MAP.get(asset)
  if (!def) return []
  const full: Poly = [
    [-def.w / 2, -def.d / 2],
    [def.w / 2, -def.d / 2],
    [def.w / 2, def.d / 2],
    [-def.w / 2, def.d / 2],
  ]
  const out: Level[] = []
  if (def.surface) out.push({ y: def.surface, polys: def.surfaceShape ?? [full], kind: 'shelf', h: Infinity })
  for (const s of def.surfaces ?? []) {
    const dz = open && s.slide ? s.slide : 0
    const dx = open && s.slideX ? s.slideX : 0
    const polys = s.shape ?? [full]
    out.push({ y: s.y, polys: dz || dx ? polys.map((pl) => pl.map(([x, z]): [number, number] => [x + dx, z + dz])) : polys, kind: s.kind ?? 'shelf', h: s.h ?? Infinity, inside: !!s.inside && !s.glass })
  }
  return out
}


/** 点在这几块多边形合起来的外框里 */
function inBounds(polys: Poly[], p: Vec) {
  const xs = polys.flatMap((pl) => pl.map((q) => q[0]))
  const zs = polys.flatMap((pl) => pl.map((q) => q[1]))
  return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.y >= Math.min(...zs) && p.y <= Math.max(...zs)
}

/** 离点最近的多边形（按到各条边的距离） */
function nearestPoly(polys: Poly[], p: Vec) {
  const segDist = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dz) / (dx * dx + dz * dz || 1)))
    return Math.hypot(p.x - a[0] - dx * t, p.y - a[1] - dz * t)
  }
  const dist = (pl: Poly) => Math.min(...pl.map((q, i) => segDist(q, pl[(i + 1) % pl.length])))
  return polys.reduce((best, pl) => (dist(pl) < dist(best) ? pl : best))
}

const rect = (x0: number, z0: number, x1: number, z1: number): Poly => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

/**
 * 固定设备的台面（和 assets.ts 里设备模型的尺寸一致）：厨房台面、洗面台、马桶水箱盖、空调外机顶。
 * 冰箱位 / 洗衣机位没有台面：上面摆的冰箱、洗衣机是家具，顶面由素材的 surface 声明。
 * 设备的局部坐标和家具一样，背面朝 -y（= 模型的 -z）。
 */
/** 长 w 的台面（-w/2..w/2）扣掉几段（[lo, hi]）后剩下的各段 */
function gaps(w: number, cut: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  let x = -w / 2
  for (const [lo, hi] of [...cut].sort((a, b) => a[0] - b[0])) {
    out.push([x, lo])
    x = hi
  }
  out.push([x, w / 2])
  return out
}

function fixtureLevels(f: Fixture): Level[] {
  const w = f.w
  const d = fixtureDepth(f)
  const L = (y: number, poly: Poly): Level => ({ y, polys: [poly], kind: 'shelf', h: Infinity })
  switch (f.kind) {
    case 'kitchen': {
      // 台面扣掉水槽和灶台（位置和 kitchenModel 一致），东西不会落进水槽、压在灶上
      const { sink: sx, hob: bx } = kitchenSlots(f)
      const z0 = f.variant === 'facing' ? d / 2 - 65 : -d / 2
      const z1 = f.variant === 'facing' ? d / 2 - 6 : d / 2
      // 中岛：灶在背面柜台上，岛台只扣水槽
      const island = f.variant === 'facing' && !!f.island
      const spans = gaps(w, island ? [[sx - 27, sx + 27]] : [[sx - 27, sx + 27], [bx - 31, bx + 31]])
      const counter: Level = { y: 88, polys: spans.filter(([a, b]) => b - a > 8).map(([a, b]) => rect(a, z0, b, z1)), kind: 'shelf', h: Infinity }
      // 对面式厨房：背面食器棚顶面整块可用（中岛的背面柜台扣掉灶）
      if (island) return [counter, { y: 92, polys: gaps(w, [[bx - 31, bx + 31]]).filter(([a, b]) => b - a > 8).map(([a, b]) => rect(a, -d / 2, b, -d / 2 + 44)), kind: 'shelf', h: Infinity }]
      return f.variant === 'facing' ? [counter, L(92, rect(-w / 2, -d / 2, w / 2, -d / 2 + 44))] : [counter]
    }
    case 'basin': {
      // 台面扣掉洗脸盆的椭圆开口（中心 z = 3，半径 r，x 方向拉长 1.25 倍；和 basinModel 一致）和后方的龙头：
      // 只剩后沿左右两段、盆两侧两条，东西不会掉进盆里、压在龙头上
      const r = Math.min(w * 0.3, d * 0.34)
      const bx = r * 1.25 + 1.5
      const back = 3 - r - 1
      const polys = [
        rect(-w / 2 + 1, -d / 2 + 1, -8, back),
        rect(8, -d / 2 + 1, w / 2 - 1, back),
        rect(-w / 2 + 1, back, -bx, d / 2 - 1),
        rect(bx, back, w / 2 - 1, d / 2 - 1),
      ].filter((pl) => Math.abs(pl[1][0] - pl[0][0]) > 4 && Math.abs(pl[2][1] - pl[1][1]) > 4)
      return [{ y: 83, polys, kind: 'shelf', h: Infinity }]
    }
    case 'toilet':
      // 无水箱马桶没有水箱盖可以摆东西
      return f.toiletType === 'tankless' ? [] : [L(78, rect(-(w + 6) / 2, -d / 2, (w + 6) / 2, -d / 2 + 20))]
    case 'outdoor':
      return [L(60, rect(-(w - 2) / 2, -(d - 2) / 2, (w - 2) / 2, (d - 2) / 2))]
    case 'bathtub': {
      // 淋浴房（矮底盘 + 玻璃隔断）：没有能摆东西的边沿
      if (f.shower) return []
      // 浴缸边沿（bathtubModel：tray 高 55、壁厚 7）：四条边沿带，中间是水面，不能放东西。
      // 盖子、浴缸架板、卷起的浴缸盖横跨浴缸时四个角都落在边沿带上
      // 卷起的盖子、架板比浴缸窄边长一点也行：两端压住边沿、伸出外沿不超过 RIM_OVERHANG（rim / straddles）
      const r = 7.5
      return [
        {
          y: 55,
          polys: [rect(-w / 2, -d / 2, w / 2, -d / 2 + r), rect(-w / 2, d / 2 - r, w / 2, d / 2), rect(-w / 2, -d / 2, -w / 2 + r, d / 2), rect(w / 2 - r, -d / 2, w / 2, d / 2)],
          kind: 'shelf',
          h: Infinity,
          rim: { w, d, band: r, over: RIM_OVERHANG },
        },
      ]
    }
    default:
      return []
  }
}

/** 能摆东西的一切：家具 + 固定设备 */
interface Owner {
  id: string
  x: number
  y: number
  rot: number
  z: number
  levels: Level[]
  /** 可开合的柜子关着门（门里的层不能往里放） */
  closed?: boolean
  /** 挂在墙上 / 贴在竖直面上的（挂钩排、洞洞板、毛巾杆）：挂起的东西一律朝正前方 */
  wall?: boolean
}
/** 素材是不是挂在墙上 / 贴在竖直面上的 */
export const isWallOwner = (asset: string) => {
  const d = ASSET_MAP.get(asset)
  return !!d && isWallMounted(d)
}
function owners(plan: Plan): Owner[] {
  return [
    ...plan.furniture.map((f) => ({ id: f.id, x: f.x, y: f.y, rot: f.rot, z: f.z ?? 0, levels: levels(f.asset, !!f.open), closed: !f.open, wall: isWallOwner(f.asset) })),
    ...plan.fixtures.map((f) => ({ id: f.id, x: f.x, y: f.y, rot: f.rot, z: 0, levels: fixtureLevels(f) })),
  ].filter((o) => o.levels.length)
}

/** 设备台面高度（相对房间地面）；没有台面返回 null。布置卫浴、厨房小物用 */
export function fixtureTop(f: Fixture) {
  return fixtureLevels(f)[0]?.y ?? null
}
/** 摆件整个占地都在设备台面内；z 给了就用这个高度的那一层（对面式厨房背面食器棚 92），否则用第一层 */
export function fitsOnFixture(f: Fixture, asset: string, x: number, y: number, rot: number, z?: number) {
  const all = fixtureLevels(f)
  const lv = z === undefined ? all[0] : all.find((l) => Math.abs(l.y - z) < 0.5)
  return !!lv && onLevel(f, lv, asset, x, y, rot)
}

/** 摆件整块落在这一层上：四角都在同一块区域里（不横跨麻将桌的桌角、水槽这类分开的几块），或横跨浴缸开口压在边沿上 */
function onLevel(o: Pick<Furniture, 'x' | 'y' | 'rot'>, lv: Level, asset: string, x: number, y: number, rot: number) {
  return allInOnePoly(o, lv.polys, corners(asset, x, y, rot)) || (!!lv.rim && straddles(o, lv.rim, asset, x, y, rot))
}

/**
 * 横跨开口：摆件在某个方向上两端都压住相对的两条边沿（各压进至少 1cm、伸出外沿不超过 over），
 * 另一个方向不出外沿（压在两条侧边沿上），或者也横跨（盖子四边都压着）。
 */
export function straddles(o: Pick<Furniture, 'x' | 'y' | 'rot'>, rim: Rim, asset: string, x: number, y: number, rot: number) {
  const def = ASSET_MAP.get(asset)
  if (!def) return false
  const cs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => toLocal(o, toWorld({ x, y, rot }, (sx * def.w) / 2, (sz * def.d) / 2)))
  const xs = cs.map((c) => c.x)
  const ys = cs.map((c) => c.y)
  const e = 0.05
  const span = (a0: number, a1: number, half: number) => a0 <= -half + rim.band - 1 && a0 >= -half - rim.over - e && a1 >= half - rim.band + 1 && a1 <= half + rim.over + e
  const inside = (a0: number, a1: number, half: number) => a0 >= -half - e && a1 <= half + e
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = span(x0, x1, rim.w / 2)
  const sy = span(y0, y1, rim.d / 2)
  return (sx || sy) && (sx || inside(x0, x1, rim.w / 2)) && (sy || inside(y0, y1, rim.d / 2))
}

function inPolys(f: Pick<Furniture, 'x' | 'y' | 'rot'>, polys: Poly[], p: Vec) {
  const l = toLocal(f, p)
  return polys.some((poly) => pointInPolygon(l, poly.map(([x, z]) => ({ x, y: z }))))
}

/** 几个点是否全都落在同一个多边形里（四角分别落在不同的格子 / 桌角里不算：那样会横跨中间的隔板、水槽、麻将牌） */
function allInOnePoly(f: Pick<Furniture, 'x' | 'y' | 'rot'>, polys: Poly[], ps: Vec[]) {
  return polys.some((poly) => ps.every((p) => inPolys(f, [poly], p)))
}

/** 贴附物离家具侧面多远（cm，往里往外都算）还算贴在这个面上：冰箱门面在素材前沿往里 3cm（一键布置的冰箱贴） */
const STUCK_GAP = 4

/**
 * 贴在一件家具侧面上的贴附物（冰箱门上的冰箱贴、便签，柜子侧面的挂钩）：贴附点落在某个侧面上（离面不超过 STUCK_GAP、
 * 不超出这个面的左右范围），高度在家具的高度范围里，朝向和那个面的外法线一致。
 * 贴附物不记贴在谁身上（拖着贴时吸到射线打中的任何竖直面），只能按位置认；靠墙放的家具旁边、墙上的贴纸朝向相反，不算
 */
function stuckOn(sticks: Furniture[], f: Furniture): Furniture[] {
  const def = ASSET_MAP.get(f.asset)
  if (!def || def.stick) return []
  const base = f.z ?? 0
  const hw = def.w / 2
  const hd = def.d / 2
  return sticks.filter((o) => {
    if (o.id === f.id || o.floor !== f.floor) return false
    const z = o.z ?? 0
    if (z < base - 1 || z > base + def.h + 1) return false
    const l = toLocal(f, o)
    // 贴附物的外法线 (-sin rot, cos rot)（Sandbox3D locate），转到家具局部
    const a = (o.rot * Math.PI) / 180
    const n = toLocal({ x: 0, y: 0, rot: f.rot }, { x: -Math.sin(a), y: Math.cos(a) })
    const on = (along: number, across: number, half: number, span: number, sign: number) => Math.abs(across - sign * half) <= STUCK_GAP && Math.abs(along) <= span + 1
    return (
      (n.y > 0.9 && on(l.x, l.y, hd, hw, 1)) ||
      (n.y < -0.9 && on(l.x, l.y, hd, hw, -1)) ||
      (n.x > 0.9 && on(l.y, l.x, hw, hd, 1)) ||
      (n.x < -0.9 && on(l.y, l.x, hw, hd, -1))
    )
  })
}

/** 一件家具上（含柜内各层）摆着的东西，递归：托盘上的杯子也算 */
export function propsOn(plan: Pick<Plan, 'furniture'>, f: Furniture, depth = 0): Furniture[] {
  const lv = levels(f.asset, !!f.open)
  if (depth > 3 || !lv.length) return []
  const base = f.z ?? 0
  // 多层户型：只看同一层的东西（上层同一位置桌上的摆件不算在下层的桌子上）
  const direct = plan.furniture.filter((o) => o.id !== f.id && o.floor === f.floor && lv.some((l) => Math.abs((o.z ?? 0) - (base + l.y)) < 0.5 && inPolys(f, l.polys, o)))
  return direct.flatMap((o) => [o, ...propsOn(plan, o, depth + 1)])
}

/**
 * 搬动一件家具时要跟着走的东西：摆在上面、柜子里的（propsOn），加上贴在它和这些东西侧面上的贴附物（冰箱门上的冰箱贴）。
 * 移动、旋转、微调、删除、复制都用它
 */
export function carriedBy(plan: Pick<Plan, 'furniture'>, f: Furniture): Furniture[] {
  const on = propsOn(plan, f)
  const sticks = plan.furniture.filter((o) => ASSET_MAP.get(o.asset)?.stick)
  if (!sticks.length) return on
  const out = new Set(on)
  for (const n of [f, ...on]) for (const s of stuckOn(sticks, n)) out.add(s)
  return [...out]
}

/**
 * 直接摆在设备台面上的东西（浴缸边沿上的盖子、厨房台面 / 洗面台上的小物）：高度对得上，
 * 且中心在台面区域内、或四角都压在台面上（横跨浴缸的盖子中心在水面上）。只算直接的一层，上面再叠的用 propsOn。
 */
export function propsOnFixture(plan: Pick<Plan, 'furniture' | 'floors'>, fx: Fixture): Furniture[] {
  const lv = fixtureLevels(fx)
  if (!lv.length) return []
  const fl = floorOf(plan, fx)
  return plan.furniture.filter(
    (o) => (o.z ?? 0) > 0 && floorOf(plan, o) === fl && lv.some((l) => Math.abs((o.z ?? 0) - l.y) < 0.5 && (inPolys(fx, l.polys, o) || onLevel(fx, l, o.asset, o.x, o.y, o.rot))),
  )
}

/**
 * 射线落到哪一层：返回最近的命中点（平面坐标）、层高（相对房间地面）和所属家具；都没打中返回 null。
 * 对着柜子正面点时，射线在顶面高度上的交点落在柜子前方（不算），往下才落进柜内层板。
 * exclude 里的家具（正在拖的自己和它上面的东西）不算。
 */
/** 鼠标射线离挂钩多近（cm）就算挂上去 */
const HOOK_REACH = 12

export function pickSurface(plan: Plan, ray: THREE.Ray, exclude: Set<string>, accept: (kind: SurfaceKind, h: number) => boolean = () => true) {
  let best: { x: number; y: number; z: number; owner: string; t: number; kind: SurfaceKind; pose: { x: number; y: number; rot: number; wall?: boolean }; poly: Poly } | null = null
  const plane = new THREE.Plane()
  const hit = new THREE.Vector3()
  for (const f of owners(plan)) {
    if (exclude.has(f.id)) continue
    const floor = floorY(roomAt(plan, { x: f.x, y: f.y }))
    for (const l of f.levels) {
      if (!accept(l.kind, l.h)) continue
      // 关着门的柜子：门里的层板放不进去（先打开柜门）
      if (l.inside && f.closed) continue
      const z = f.z + l.y
      if (l.kind === 'clip') {
        // 屏幕顶边：算射线到顶边中线（窄带两条短边中点的连线，抬到真正的顶边高度）的距离，够近就吸上去
        for (const pl of l.polys) {
          if (pl.length < 4) continue
          const mid = (i: number, j: number) => toWorld(f, (pl[i][0] + pl[j][0]) / 2, (pl[i][1] + pl[j][1]) / 2)
          const a = mid(0, 3)
          const b = mid(1, 2)
          const y = floor + z + CLIP_DROP
          const onRay = new THREE.Vector3()
          const onSeg = new THREE.Vector3()
          const d2 = ray.distanceSqToSegment(new THREE.Vector3(a.x, y, a.y), new THREE.Vector3(b.x, y, b.y), onRay, onSeg)
          if (d2 > HOOK_REACH * HOOK_REACH) continue
          const t = onRay.distanceTo(ray.origin) - 40
          if (!best || t < best.t) best = { x: onSeg.x, y: onSeg.z, z, owner: f.id, t, kind: l.kind, pose: { x: f.x, y: f.y, rot: f.rot, wall: f.wall }, poly: pl }
        }
        continue
      }
      if (l.kind === 'hook') {
        // 挂钩是一条细线：算射线到这条线的 3D 最近距离，HOOK_REACH 以内就算点中（比求平面交点宽容得多）
        for (const pl of l.polys) {
          const xs = pl.map((q) => q[0])
          const zs = pl.map((q) => q[1])
          const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
          const along = x1 - x0 >= z1 - z0
          const a = along ? toWorld(f, x0, (z0 + z1) / 2) : toWorld(f, (x0 + x1) / 2, z0)
          const b = along ? toWorld(f, x1, (z0 + z1) / 2) : toWorld(f, (x0 + x1) / 2, z1)
          const y = floor + z
          const onRay = new THREE.Vector3()
          const onSeg = new THREE.Vector3()
          const d2 = ray.distanceSqToSegment(new THREE.Vector3(a.x, y, a.y), new THREE.Vector3(b.x, y, b.y), onRay, onSeg)
          if (d2 > HOOK_REACH * HOOK_REACH) continue
          // 挂钩优先于它身后的层板 / 地面：距离打个折扣
          const t = onRay.distanceTo(ray.origin) - 40
          if (!best || t < best.t) best = { x: onSeg.x, y: onSeg.z, z, owner: f.id, t, kind: l.kind, pose: { x: f.x, y: f.y, rot: f.rot, wall: f.wall }, poly: pl }
        }
        continue
      }
      plane.set(new THREE.Vector3(0, 1, 0), -(floor + z))
      if (!ray.intersectPlane(plane, hit)) continue
      const p = { x: hit.x, y: hit.z }
      const lp = toLocal(f, p)
      // 点在层的外框里、却落在几块区域之间（麻将桌中间的牌、床头的枕头、台面上的水槽）：吸到最近的那块，fitOnSurface 再整件收进去
      const poly = l.polys.find((pl) => pointInPolygon(lp, pl.map(([px, pz]) => ({ x: px, y: pz })))) ?? (l.polys.length && inBounds(l.polys, lp) ? nearestPoly(l.polys, lp) : undefined)
      if (!poly) continue
      const t = hit.distanceTo(ray.origin)
      if (!best || t < best.t) best = { x: p.x, y: p.y, z, owner: f.id, t, kind: l.kind, pose: { x: f.x, y: f.y, rot: f.rot, wall: f.wall }, poly }
    }
  }
  return best
}


/** 摆件占地的四个角（平面坐标） */
function corners(asset: string, x: number, y: number, rot: number): Vec[] {
  const def = ASSET_MAP.get(asset)
  if (!def) return [{ x, y }]
  const hw = def.w / 2 - 0.5
  const hd = def.d / 2 - 0.5
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => toWorld({ x, y, rot }, lx, lz))
}

/**
 * 不穿模：把摆件往台面里收，直到占地的四个角都在这一层的区域内（L 形、圆形台面也适用）。
 * 收不进去（摆件比台面还大）就返回原位置。挂钩层不处理。
 */
export function fitOnSurface(plan: Plan, ownerId: string, z: number, asset: string, x: number, y: number, rot: number): Vec {
  const owner = owners(plan).find((f) => f.id === ownerId)
  const lv = owner && owner.levels.find((l) => Math.abs(owner.z + l.y - z) < 0.5)
  if (!owner || !lv || lv.kind !== 'shelf') return { x, y }
  // 往所在那块多边形的中心收
  const l = toLocal(owner, { x, y })
  const poly = lv.polys.find((pl) => pointInPolygon(l, pl.map(([px, pz]) => ({ x: px, y: pz })))) ?? nearestPoly(lv.polys, l)
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length
  const target = toWorld(owner, cx, cz)
  let p = { x, y }
  for (let i = 0; i < 12; i++) {
    if (corners(asset, p.x, p.y, rot).every((c) => inPolys(owner, [poly], c))) return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }
    p = { x: p.x + (target.x - p.x) * 0.2, y: p.y + (target.y - p.y) * 0.2 }
  }
  return { x, y }
}

/** 摆件整个占地都在台面内 */
export function fitsOnSurface(owner: Furniture, z: number, asset: string, x: number, y: number, rot: number) {
  // 同一高度可能有好几格（多宝格左右两列的底层、被竖隔板隔开的两小格）：整件落在其中任意一格里就行，不能横跨隔板
  const cs = corners(asset, x, y, rot)
  return levels(owner.asset, !!owner.open).some((l) => Math.abs((owner.z ?? 0) + l.y - z) < 0.5 && allInOnePoly(owner, l.polys, cs))
}

/**
 * 摆件（z > 0）的支撑面：在家具 / 设备的各层里找高度对得上、且摆件中心落在区域内的那一层。
 * 返回支撑者 id 和「占地四角是否都在这一层内」（挂钩层不要求）；找不到支撑面返回 null。校验 / 测试用。
 */
export function supportOf(plan: Plan, f: Furniture): { ownerId: string; fits: boolean } | null {
  const z = f.z ?? 0
  let found: { ownerId: string; fits: boolean } | null = null
  for (const o of owners(plan)) {
    if (o.id === f.id) continue
    for (const lv of o.levels) {
      if (Math.abs(o.z + lv.y - z) >= 0.5) continue
      // 四角都在层内（横跨浴缸边沿的盖子中心落在水面上，也算有支撑）；否则至少中心要在层内
      // 挂钩层：挂着的东西不要求四角都在层内，但中心要在挂钩范围里（不能随便挂到同高度别处的挂杆上）
      const fits = lv.kind === 'hook' ? inPolys(o, lv.polys, f) : onLevel(o, lv, f.asset, f.x, f.y, f.rot)
      if (!fits && !inPolys(o, lv.polys, f)) continue
      if (fits) return { ownerId: o.id, fits }
      found ??= { ownerId: o.id, fits }
    }
  }
  return found
}

/** 两个凸多边形（平面）是否相交超过 tol（分离轴） */
function polysOverlap(a: Vec[], b: Vec[], tol: number) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const L = Math.hypot(q.x - p.x, q.y - p.y)
      if (L < 1e-9) continue
      const n = { x: -(q.y - p.y) / L, y: (q.x - p.x) / L }
      const pa = a.map((v) => v.x * n.x + v.y * n.y)
      const pb = b.map((v) => v.x * n.x + v.y * n.y)
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= tol) return false
    }
  return true
}

/**
 * 台面上的摆件是否穿模（手动摆放的红框提示用）：落在某一层的外框里、却没有一块区域整个装得下
 * （横跨麻将桌中间的牌、水槽、格子隔板），或和同一台面上别的东西（麻将牌、棋盘、杯子…）重叠。
 * 挂着的、贴附的不算；不在台面上（z = 0）的交给 snap.overlapsOthers。plan 是单层的视图（Sandbox 的 fv()）。
 */
export function propClash(plan: Plan, f: Furniture): boolean {
  const z = f.z ?? 0
  const def = ASSET_MAP.get(f.asset)
  if (!z || !def || def.mount || def.stick || def.form?.includes('hanging')) return false
  const cs = corners(f.asset, f.x, f.y, f.rot)
  let outside = false
  let inside = false
  for (const o of owners(plan)) {
    if (o.id === f.id) continue
    for (const lv of o.levels) {
      if (lv.kind !== 'shelf' || Math.abs(o.z + lv.y - z) >= 0.5 || !inBounds(lv.polys, toLocal(o, f))) continue
      if (onLevel(o, lv, f.asset, f.x, f.y, f.rot)) inside = true
      else outside = true
    }
  }
  if (outside && !inside) return true
  return plan.furniture.some((o) => {
    if (o.id === f.id || Math.abs((o.z ?? 0) - z) >= 0.5) return false
    const d = ASSET_MAP.get(o.asset)
    return !!d && !d.mount && !d.stick && !d.form?.includes('hanging') && polysOverlap(cs, corners(o.asset, o.x, o.y, o.rot), 0.5)
  })
}

/**
 * 挂钩吸附：挂起的东西朝向「从家具中心指向这块挂点带」的方向（树形衣帽架是各个钩子朝外），
 * 墙上 / 门上的挂钩排、洞洞板、毛巾杆（pose.wall）一律朝正前方——否则两侧的钩子会让毛巾横过来插进墙里；
 * 位置吸到挂点带靠家具一侧的边上（钩尾正好插进板 / 搭在杆上）。返回平面坐标和朝向。
 */
export function snapToHook(pose: { x: number; y: number; rot: number; wall?: boolean }, poly: Poly, p: Vec) {
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
  const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length
  const len = Math.hypot(cx, cz) || 1
  const dx = pose.wall ? 0 : cx / len
  const dz = pose.wall ? 1 : cz / len
  const l = toLocal(pose, p)
  // 沿朝向方向取挂点带的最内侧，垂直方向保留鼠标位置
  const inner = Math.min(...poly.map(([qx, qz]) => qx * dx + qz * dz))
  const side = l.x * -dz + l.y * dx
  const lx = dx * inner + -dz * side
  const lz = dz * inner + dx * side
  const w = toWorld(pose, lx, lz)
  const rot = (pose.rot + (Math.atan2(-dx, dz) * 180) / Math.PI + 360) % 360
  return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10, rot: Math.round(rot) }
}

/**
 * 屏幕顶边吸附：夹式摄像头吸到窄带正中（= 顶边中间），朝向和面板一致（窄带第一条边就是面板方向，见 clipLevels）。
 */
export function snapToClip(pose: { x: number; y: number; rot: number }, poly: Poly) {
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
  const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length
  const w = toWorld(pose, cx, cz)
  const ang = (Math.atan2(poly[1][1] - poly[0][1], poly[1][0] - poly[0][0]) * 180) / Math.PI
  return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10, rot: Math.round((pose.rot + ang + 720) % 360) }
}
