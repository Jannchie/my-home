// 一键布置的家用摄像头（素材见 three/packs/cameras-home.ts）：
//   宠物摄像头：养猫 / 狗 / 小动物 / 鸟的人家大概率在宠物活动区（猫爬架、宠物窝、猫砂盆、笼子、喂食区）附近的台面上放 1–2 台，镜头朝着宠物区；
//     狗多配零食投喂款，猫多配激光逗猫 / 猫耳款。
//   婴儿监视器：有 3 岁以下孩子、摆了婴儿床的，摄像头放在婴儿床边的柜子 / 台面上朝着婴儿床，接收器放到父母卧室（父母和宝宝同屋就放客厅）。
//   安防摄像头：部分人家（欧美、中式多些，独居多些）在玄关 / 客厅墙角高处挂一台半球 / 枪机，或在客厅柜顶放一台桌面云台 / 磁吸小方块。
//   门口：欧美常见可视门铃（装在大门外墙，和默认门铃同一位置，house.ts 见到它就不再画默认门铃），中式常见猫眼摄像头（室内屏挂在门边）。
//   运动相机套装：户外 / 运动 / 摄影爱好者偶尔放一套在自己房间的架子上。
// 数量受素材的 limit 约束（宠物摄像头全屋 2 台、安防 2 台、婴儿监视器各 1…）。由 decorate.ts 的 Decorator 在 robots() 之后调用。

import { add, dist, edgeInfo, mul, pointInPolygon, type Box, type Furniture, type Plan, type Region, type Room, type Vec } from './model'
import { ASSET_MAP, type AssetDef, type StyleTag } from './three/assets'
import { toWorld } from './surface'
import { wallThicknessAt } from './walls'
import type { Household, InterestId, Member } from './household'
import { hasTag } from './three/tags'

/** Decorator 里这里要用到的部分（都是公开成员） */
export interface CamHost {
  out: Furniture[]
  occupants: Map<string, Member[]>
  studyOf: Map<string, Member>
  style: StyleTag
  readonly region: Region
  styleFor(room: Room): StyleTag
  pick<T>(xs: T[]): T
  push(asset: string, x: number, y: number, rot: number, flat?: boolean): Furniture
  allow(asset: string, at: Vec, parentId?: string): boolean
  onLevel(parent: Furniture, asset: string, fx: number, fz: number, lrot?: number, level?: number): Furniture | null
  mount(room: Room, asset: string): Furniture | null
  mountAvoiding(room: Room, asset: string, extra: Box[], near?: Vec, nearMax?: number): Furniture | null
  surfacesIn(room: Room): Furniture[]
  weighted<T>(items: [T, number][]): T | undefined
}
export interface CamCtx {
  d: CamHost
  plan: Plan
  rand: () => number
  household?: Household
}

const def = (f: Furniture) => ASSET_MAP.get(f.asset)
const isBed = (d?: AssetDef) => hasTag(d, 'bed', 'bedding')
/** 宠物活动区：宠物分类的落地物（窝、爬架、猫砂盆、笼子、围栏、会走动的宠物），不含机器宠物和水族箱 */
const isPetSpot = (d?: AssetDef) => !!d && d.category === 'pets' && !d.prop && !d.mount && !d.id.startsWith('rb-') && !hasTag(d, 'aquarium')
/** 朝向：让素材正面（+z）朝向世界方向 v 的 rot（度） */
const rotToward = (v: Vec) => ((Math.atan2(-v.x, v.y) * 180) / Math.PI + 360) % 360

/**
 * 把一件摄像头放到 room 里离 target 最近的几个台面上，镜头朝 target。
 * 台面限高 35–190（不放床上、宠物家具上、和室地面上的矮几也行），距离 maxDist 以内；放不下返回 null。
 */
function camOnSurface(c: CamCtx, room: Room, asset: string, target: Vec, maxDist = 450, exclude?: Furniture) {
  const { d } = c
  const parents = d
    .surfacesIn(room)
    .filter((p) => {
      const pd = def(p)
      if (!pd?.surface || p === exclude || isBed(pd) || pd.category === 'pets') return false
      const top = (p.z ?? 0) + pd.surface
      return top >= 35 && top <= 190 && dist(p, target) <= maxDist
    })
    .sort((a, b) => dist(a, target) - dist(b, target))
    .slice(0, 5)
  for (const p of parents) {
    const pd = def(p)!
    // 台面上几处候选，离目标近的先试
    const spots: [number, number][] = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.25], [0, -0.25], [0.35, 0.3], [-0.35, 0.3], [0.35, -0.3], [-0.35, -0.3]]
    spots.sort((u, v) => dist(toWorld(p, u[0] * pd.w, u[1] * pd.d), target) - dist(toWorld(p, v[0] * pd.w, v[1] * pd.d), target))
    for (const [fx, fz] of spots) {
      const at = toWorld(p, fx * pd.w, fz * pd.d)
      const rot = rotToward({ x: target.x - at.x, y: target.y - at.y })
      // 台面摆件按 90° 取整算占地（fitsOnSurface），这里也把朝向取整到最近的 45°，看起来是「转过去对着」
      const lrot = Math.round((rot - p.rot) / 45) * 45
      const f = d.onLevel(p, asset, fx, fz, lrot)
      if (f) return f
    }
  }
  return null
}

const roomOf = (plan: Plan, p: Vec) => plan.rooms.find((r) => pointInPolygon(p, r.points))

/** 宠物摄像头 */
function petCams(c: CamCtx) {
  const { d, plan, rand, household: hh } = c
  if (!hh) return
  const all = new Set<InterestId>(hh.members.flatMap((m) => m.interests))
  const kinds = (['cats', 'dogs', 'smallpets', 'birds'] as InterestId[]).filter((k) => all.has(k))
  if (!kinds.length) return
  const spots = d.out.filter((f) => !f.z && isPetSpot(def(f)))
  if (!spots.length) return
  const p = 0.65 + (kinds.length > 1 ? 0.15 : 0) + (all.has('cats') || all.has('dogs') ? 0.1 : 0)
  if (rand() >= p) return
  const n = rand() < 0.35 ? 2 : 1
  const used = new Set<string>()
  for (let k = 0; k < n; k++) {
    const pool = spots.filter((s) => !used.has(roomOf(plan, s)?.id ?? ''))
    if (!pool.length) break
    const spot = d.pick(pool)
    const room = roomOf(plan, spot)
    if (!room) continue
    used.add(room.id)
    d.style = d.styleFor(room)
    const sd = def(spot)!
    const dog = hasTag(sd, 'dog') || (all.has('dogs') && !all.has('cats'))
    const cat = hasTag(sd, 'cat') || (all.has('cats') && !all.has('dogs'))
    const choice = d.weighted<string>([
      ['hc-pet-dome', 3],
      ['hc-pet-ears', cat ? 2 : 1],
      ['hc-pet-treat', dog ? 3 : 1],
      ['hc-pet-laser', cat ? 2.5 : 0],
      ['hc-pet-screen', 1],
    ])
    if (choice) camOnSurface(c, room, choice, spot)
  }
}

/** 婴儿监视器：摄像头在婴儿床边，接收器在父母卧室 */
function babyMonitor(c: CamCtx) {
  const { d, plan, rand, household: hh } = c
  if (!hh?.members.some((m) => m.age < 3)) return
  const crib = d.out.find((f) => !f.z && def(f)?.family === 'kid-crib')
  if (!crib || rand() >= 0.75) return
  const room = roomOf(plan, crib)
  if (!room) return
  d.style = d.styleFor(room)
  if (!camOnSurface(c, room, 'hc-baby-cam', crib, 320)) return
  // 接收器：父母卧室（和宝宝同屋就放客厅）
  const parents = plan.rooms.find((r) => d.occupants.get(r.id)?.some((m) => m.role === 'self' || m.role === 'partner'))
  const ldk = plan.rooms.filter((r) => r.kind === 'ldk')[0]
  const target = parents && parents !== room ? parents : ldk
  if (!target) return
  d.style = d.styleFor(target)
  const bed = d.out.find((f) => !f.z && pointInPolygon(f, target.points) && isBed(def(f)))
  camOnSurface(c, target, 'hc-baby-recv', bed ?? centerOf(target), 600)
}

const centerOf = (r: Room): Vec => ({ x: r.points.reduce((s, p) => s + p.x, 0) / r.points.length, y: r.points.reduce((s, p) => s + p.y, 0) / r.points.length })

/** 室内安防摄像头：玄关 / 客厅墙上高处一台，或客厅柜顶一台 */
function security(c: CamCtx) {
  const { d, plan, rand, household: hh } = c
  const base = { jp: 0.12, cn: 0.25, west: 0.3 }[d.region]
  const p = base + (hh?.kind === 'single' ? 0.1 : 0) + (hh?.members.some((m) => m.interests.includes('tech')) ? 0.1 : 0)
  if (rand() >= p) return
  const entrance = plan.rooms.find((r) => r.kind === 'entrance')
  const ldk = plan.rooms.filter((r) => r.kind === 'ldk').sort((a, b) => area(b) - area(a))[0]
  if (rand() < 0.5) {
    const id = rand() < 0.6 ? 'hc-sec-wall-dome' : 'hc-sec-wall-bullet'
    for (const r of rand() < 0.5 ? [entrance, ldk] : [ldk, entrance]) {
      if (!r) continue
      d.style = d.styleFor(r)
      if (d.mount(r, id)) return
    }
  } else if (ldk) {
    d.style = d.styleFor(ldk)
    camOnSurface(c, ldk, rand() < 0.55 ? 'hc-sec-pt' : 'hc-sec-cube', centerOf(ldk), 2000)
  }
}
const area = (r: Room) => {
  let s = 0
  for (let i = 0; i < r.points.length; i++) {
    const a = r.points[i]
    const b = r.points[(i + 1) % r.points.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** 大门：外侧没有房间的玄关门 */
function frontDoors(plan: Plan) {
  const out: { room: Room; center: Vec; dir: Vec; outer: Vec; width: number; latch: number; wall: number }[] = []
  for (const room of plan.rooms.filter((r) => r.kind === 'entrance')) {
    for (const o of plan.openings) {
      if (o.kind === 'window' || o.roomId !== room.id || o.edge >= room.points.length) continue
      const e = edgeInfo(room.points, o.edge)
      const w = Math.min(o.width, e.length)
      const cc = e.length <= w ? e.length / 2 : Math.max(w / 2, Math.min(e.length - w / 2, o.offset))
      const center = add(e.a, mul(e.dir, cc))
      const wall = wallThicknessAt(plan, center, e.out, room)
      // 门外一侧没有房间（和 house.ts 判断门铃的位置一致）
      for (const sgn of [-1, 1]) {
        const side = mul(e.out, sgn)
        if (plan.rooms.some((r) => pointInPolygon(add(center, mul(side, wall / 2 + 20)), r.points))) continue
        if (wall < plan.wallOuter) continue
        out.push({ room, center, dir: e.dir, outer: side, width: w, latch: o.kind === 'door' ? (o.hinge === 'start' ? 1 : -1) : 1, wall })
      }
    }
  }
  return out
}
/** 默认门铃的位置（house.ts buildWallDevices 用同一公式）：门把手一侧、门外墙面上 */
export function doorbellSpot(center: Vec, dir: Vec, outer: Vec, width: number, latch: number, wall: number, depth = 0): Vec {
  return add(add(center, mul(dir, latch * (width / 2 + 10) + 6)), mul(outer, wall / 2 + 0.3 + depth / 2))
}

/** 可视门铃 / 猫眼摄像头 */
function doorCams(c: CamCtx) {
  const { d, plan, rand } = c
  const doors = frontDoors(plan)
  if (!doors.length) return
  const door = doors[0]
  const pBell = { jp: 0.15, cn: 0.1, west: 0.45 }[d.region]
  const pPeep = { jp: 0.05, cn: 0.35, west: 0.05 }[d.region]
  const r = rand()
  if (r < pBell) {
    const bd = ASSET_MAP.get('hc-doorbell-video')
    if (!bd) return
    const p = doorbellSpot(door.center, door.dir, door.outer, door.width, door.latch, door.wall, bd.d)
    if (!d.allow('hc-doorbell-video', p)) return
    d.style = d.styleFor(door.room)
    d.push('hc-doorbell-video', p.x, p.y, rotToward(door.outer), true)
  } else if (r < pBell + pPeep) {
    d.style = d.styleFor(door.room)
    d.mountAvoiding(door.room, 'hc-peephole', [], door.center, 120)
  }
}

/** 运动相机套装：户外 / 运动 / 摄影爱好者的房间架子上 */
function actionKit(c: CamCtx) {
  const { d, plan, rand, household: hh } = c
  if (!hh) return
  const fan = hh.members.find((m) => m.interests.some((i) => i === 'outdoor' || i === 'sports' || i === 'photo'))
  if (!fan || rand() >= 0.3) return
  const room = plan.rooms.find((r) => d.occupants.get(r.id)?.includes(fan) || d.studyOf.get(r.id) === fan)
  if (!room) return
  d.style = d.styleFor(room)
  const shelves = d.surfacesIn(room).filter((p) => {
    const pd = def(p)
    return !!pd && !isBed(pd) && (!!pd.surfaces?.length || hasTag(pd, 'cabinet'))
  })
  for (const p of shelves) {
    const pd = def(p)!
    const levels = (pd.surfaces ?? []).map((l, i) => (l.kind ? -1 : i)).filter((i) => i >= 0)
    for (const lv of [...levels, undefined]) if (d.onLevel(p, 'hc-action-kit', (rand() - 0.5) * 0.5, 0, 0, lv)) return
  }
}

export function homeCams(c: CamCtx) {
  const keep = c.d.style
  petCams(c)
  babyMonitor(c)
  security(c)
  doorCams(c)
  actionKit(c)
  c.d.style = keep
}
