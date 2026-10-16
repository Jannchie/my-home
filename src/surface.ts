// 可摆放面：桌、柜的顶面，以及柜内层板（surfaces）。负责「点在不在某一层上」「射线落在哪一层」「一件家具上摆着哪些东西」。

import * as THREE from 'three'
import { fixtureDepth, pointInPolygon, type Fixture, type Furniture, type Plan, type Vec } from './model'
import { ASSET_MAP, builtinShelves, CLOSET_PIPE } from './three/assets'
import { floorY, roomAt } from './three/house'
import { CLIP_DROP, type Poly, type SurfaceKind } from './three/kit'

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

interface Level {
  /** 离家具底面的高度 */
  y: number
  polys: Poly[]
  kind: SurfaceKind
  /** 净高：放进去的东西不能比它高 */
  h: number
}

/** 一件素材的所有可摆放层：顶面 + 柜内层板 */
function levels(asset: string): Level[] {
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
  for (const s of def.surfaces ?? []) out.push({ y: s.y, polys: s.shape ?? [full], kind: s.kind ?? 'shelf', h: s.h ?? Infinity })
  return out
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
function fixtureLevels(f: Fixture): Level[] {
  const w = f.w
  const d = fixtureDepth(f)
  const L = (y: number, poly: Poly): Level => ({ y, polys: [poly], kind: 'shelf', h: Infinity })
  switch (f.kind) {
    case 'kitchen': {
      // 台面扣掉水槽和灶台（位置和 kitchenModel 一致），东西不会落进水槽、压在灶上
      const sx = -w / 2 + w * 0.3
      const bx = w / 2 - 48
      const z0 = f.variant === 'facing' ? d / 2 - 65 : -d / 2
      const z1 = f.variant === 'facing' ? d / 2 - 6 : d / 2
      // 中岛：灶在背面柜台上，岛台只扣水槽
      const island = f.variant === 'facing' && !!f.island
      const spans: [number, number][] = island
        ? [
            [-w / 2, sx - 27],
            [sx + 27, w / 2],
          ]
        : [
            [-w / 2, sx - 27],
            [sx + 27, bx - 31],
            [bx + 31, w / 2],
          ]
      const counter: Level = { y: 88, polys: spans.filter(([a, b]) => b - a > 8).map(([a, b]) => rect(a, z0, b, z1)), kind: 'shelf', h: Infinity }
      // 对面式厨房：背面食器棚顶面整块可用（中岛的背面柜台扣掉灶）
      if (island) return [counter, { y: 92, polys: [rect(-w / 2, -d / 2, bx - 31, -d / 2 + 44), rect(bx + 31, -d / 2, w / 2, -d / 2 + 44)].filter((pl) => Math.abs(pl[1][0] - pl[0][0]) > 8), kind: 'shelf', h: Infinity }]
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
    case 'builtin': {
      // 柜内层板：门打开时都能放；关着时只有下駄箱中间的开放台面（y = 90）能放
      const t = f.builtinType ?? 'shoe'
      const inner = rect(-w / 2 + 2, -d / 2 + 2, w / 2 - 2, d / 2 - 1)
      const ys = builtinShelves(t, 230)
      const shown = f.open ? ys : t === 'shoe' ? [90] : []
      const out: Level[] = shown.map((y, i) => ({ y, polys: [inner], kind: 'shelf' as const, h: (ys[ys.indexOf(y) + 1] ?? 230) - y - 2 + 0 * i }))
      // 壁内收纳的挂衣杆（门打开时能挂）：挂点带和挂衣杆一样，钩环内顶搭在杆顶
      if (t === 'closet' && f.open) out.push({ y: CLOSET_PIPE.y + CLOSET_PIPE.r + 0.45, polys: [rect(-w / 2 + 4, 0.9 - 1.7, w / 2 - 4, 0.9 + 1.3)], kind: 'hook', h: CLOSET_PIPE.y - 10 })
      return out
    }
    case 'outdoor':
      return [L(60, rect(-(w - 2) / 2, -(d - 2) / 2, (w - 2) / 2, (d - 2) / 2))]
    case 'bathtub': {
      // 淋浴房（矮底盘 + 玻璃隔断）：没有能摆东西的边沿
      if (f.shower) return []
      // 浴缸边沿（bathtubModel：tray 高 55、壁厚 7）：四条边沿带，中间是水面，不能放东西。
      // 盖子、浴缸架板、卷起的浴缸盖横跨浴缸时四个角都落在边沿带上
      const r = 7.5
      return [
        {
          y: 55,
          polys: [rect(-w / 2, -d / 2, w / 2, -d / 2 + r), rect(-w / 2, d / 2 - r, w / 2, d / 2), rect(-w / 2, -d / 2, -w / 2 + r, d / 2), rect(w / 2 - r, -d / 2, w / 2, d / 2)],
          kind: 'shelf',
          h: Infinity,
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
}
function owners(plan: Plan): Owner[] {
  return [
    ...plan.furniture.map((f) => ({ id: f.id, x: f.x, y: f.y, rot: f.rot, z: f.z ?? 0, levels: levels(f.asset) })),
    ...plan.fixtures.map((f) => ({ id: f.id, x: f.x, y: f.y, rot: f.rot, z: 0, levels: fixtureLevels(f) })),
  ].filter((o) => o.levels.length)
}

/** 设备台面高度（相对房间地面）；没有台面返回 null。布置卫浴、厨房小物用 */
export function fixtureTop(f: Fixture) {
  return fixtureLevels(f)[0]?.y ?? null
}
/** 摆件整个占地都在设备台面内 */
export function fitsOnFixture(f: Fixture, asset: string, x: number, y: number, rot: number) {
  const lv = fixtureLevels(f)[0]
  return !!lv && corners(asset, x, y, rot).every((c) => inPolys(f, lv.polys, c))
}

function inPolys(f: Pick<Furniture, 'x' | 'y' | 'rot'>, polys: Poly[], p: Vec) {
  const l = toLocal(f, p)
  return polys.some((poly) => pointInPolygon(l, poly.map(([x, z]) => ({ x, y: z }))))
}

/** 一件家具上（含柜内各层）摆着的东西，递归：托盘上的杯子也算 */
export function propsOn(plan: Plan, f: Furniture, depth = 0): Furniture[] {
  const lv = levels(f.asset)
  if (depth > 3 || !lv.length) return []
  const base = f.z ?? 0
  const direct = plan.furniture.filter((o) => o.id !== f.id && lv.some((l) => Math.abs((o.z ?? 0) - (base + l.y)) < 0.5 && inPolys(f, l.polys, o)))
  return direct.flatMap((o) => [o, ...propsOn(plan, o, depth + 1)])
}

/**
 * 射线落到哪一层：返回最近的命中点（平面坐标）、层高（相对房间地面）和所属家具；都没打中返回 null。
 * 对着柜子正面点时，射线在顶面高度上的交点落在柜子前方（不算），往下才落进柜内层板。
 * exclude 里的家具（正在拖的自己和它上面的东西）不算。
 */
/** 鼠标射线离挂钩多近（cm）就算挂上去 */
const HOOK_REACH = 12

export function pickSurface(plan: Plan, ray: THREE.Ray, exclude: Set<string>, accept: (kind: SurfaceKind, h: number) => boolean = () => true) {
  let best: { x: number; y: number; z: number; owner: string; t: number; kind: SurfaceKind; pose: { x: number; y: number; rot: number }; poly: Poly } | null = null
  const plane = new THREE.Plane()
  const hit = new THREE.Vector3()
  for (const f of owners(plan)) {
    if (exclude.has(f.id)) continue
    const floor = floorY(roomAt(plan, { x: f.x, y: f.y }))
    for (const l of f.levels) {
      if (!accept(l.kind, l.h)) continue
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
          if (!best || t < best.t) best = { x: onSeg.x, y: onSeg.z, z, owner: f.id, t, kind: l.kind, pose: { x: f.x, y: f.y, rot: f.rot }, poly: pl }
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
          if (!best || t < best.t) best = { x: onSeg.x, y: onSeg.z, z, owner: f.id, t, kind: l.kind, pose: { x: f.x, y: f.y, rot: f.rot }, poly: pl }
        }
        continue
      }
      plane.set(new THREE.Vector3(0, 1, 0), -(floor + z))
      if (!ray.intersectPlane(plane, hit)) continue
      const p = { x: hit.x, y: hit.z }
      const lp = toLocal(f, p)
      const poly = l.polys.find((pl) => pointInPolygon(lp, pl.map(([px, pz]) => ({ x: px, y: pz }))))
      if (!poly) continue
      const t = hit.distanceTo(ray.origin)
      if (!best || t < best.t) best = { x: p.x, y: p.y, z, owner: f.id, t, kind: l.kind, pose: { x: f.x, y: f.y, rot: f.rot }, poly }
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
  const poly = lv.polys.find((pl) => pointInPolygon(l, pl.map(([px, pz]) => ({ x: px, y: pz })))) ?? lv.polys[0]
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
  return levels(owner.asset).some((l) => Math.abs((owner.z ?? 0) + l.y - z) < 0.5 && cs.every((c) => inPolys(owner, l.polys, c)))
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
      const fits = lv.kind === 'hook' ? inPolys(o, lv.polys, f) : corners(f.asset, f.x, f.y, f.rot).every((c) => inPolys(o, lv.polys, c))
      if (!fits && !inPolys(o, lv.polys, f)) continue
      if (fits) return { ownerId: o.id, fits }
      found ??= { ownerId: o.id, fits }
    }
  }
  return found
}

/**
 * 挂钩吸附：挂起的东西朝向「从家具中心指向这块挂点带」的方向（洞洞板就是正前方，树形衣帽架是各个钩子朝外），
 * 位置吸到挂点带靠家具一侧的边上（钩尾正好插进板 / 搭在杆上）。返回平面坐标和朝向。
 */
export function snapToHook(pose: { x: number; y: number; rot: number }, poly: Poly, p: Vec) {
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
  const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length
  const len = Math.hypot(cx, cz) || 1
  const dx = cx / len
  const dz = cz / len
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
