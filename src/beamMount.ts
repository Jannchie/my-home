// 壁挂物和内收柱（梁）：挂的位置（沿墙范围、离地高度）和梁重叠的，挂在梁的正面，而不是穿进梁里贴墙面。
// 贴墙吸附（snap.ts snapToWall）、一键布置收尾、改梁（store.setWallFace）都走这里。

import { ASSET_MAP } from './three/assets'
import { add, edgeInfo, mul, pointInPolygon, type Furniture, type Plan, type Room, type WallBeam } from './model'
import { floorHeight, floorOf } from './floors'
import { wallThicknessAt } from './walls'
import { beamsOf, clampBeam, wallFace } from './wallFace'

/** 沿墙、离地方向重叠超过这么多才算挂在梁上（擦边不算） */
const OVERLAP = 1
/** 背面离应在的位置这么近才算挂在这面墙上（改梁时据此找要跟着挪的东西） */
const TOL = 2

/**
 * 壁挂物背面离墙面多远：沿墙 [lo, hi]（到边起点的距离）、离地 [z0, z1] 都和梁重叠就挂在梁正面（梁深），否则贴墙面（0）。
 * 梁顶贴着天花：墙高 wallH，梁占离地 [wallH - h, wallH]
 */
export function beamStandoff(beam: WallBeam | undefined, wallH: number, lo: number, hi: number, z0: number, z1: number) {
  if (!beam) return 0
  const along = Math.min(hi, beam.offset + beam.w / 2) - Math.max(lo, beam.offset - beam.w / 2)
  const up = Math.min(z1, wallH) - Math.max(z0, wallH - beam.h)
  return along > OVERLAP && up > OVERLAP ? beam.d : 0
}

/** 这间房的墙高 */
export const roomWallH = (plan: Pick<Plan, 'floors'>, room: Room) => floorHeight(plan, floorOf(plan, room))

/** 房间第 edge 面墙上要挂一件 asset，沿墙中心在 along 处：背面离墙面多远（梁按墙长夹过） */
export function mountStandoff(plan: Pick<Plan, 'floors'>, room: Room, edge: number, asset: string, along: number) {
  const def = ASSET_MAP.get(asset)
  const beam = wallFace(room, edge)?.beam
  if (!def?.mount || def.ceiling || !beam) return 0
  const b = clampBeam(beam, edgeInfo(room.points, edge).length)
  return beamStandoff(b, roomWallH(plan, room), along - def.w / 2, along + def.w / 2, def.mount, def.mount + def.h)
}

/**
 * 这间房第 edge 面墙上挂着的壁挂物（朝着房间里、背面离墙面 0 ~ maxGap）：件、沿墙中心位置、背面离墙面的距离。
 * anyFloor：不看家具的楼层（一键布置按层跑，刚摆的还没打楼层）
 */
function mountedOn(plan: Plan, room: Room, edge: number, furniture: Furniture[], maxGap: number, anyFloor = false) {
  const e = edgeInfo(room.points, edge)
  const inward = mul(e.out, -1)
  const fl = floorOf(plan, room)
  // 墙厚按边中点取（和 snapToWall 一致）
  const face = wallThicknessAt(plan, mul(add(e.a, e.b), 0.5), e.out, room) / 2
  const out: { f: Furniture; along: number; gap: number; face: number }[] = []
  for (const f of furniture) {
    const def = ASSET_MAP.get(f.asset)
    if (!def?.mount || def.ceiling || f.z || (!anyFloor && floorOf(plan, f) !== fl) || !pointInPolygon(f, room.points)) continue
    // 正面朝房间里：局部 +y 是正面
    const a = (f.rot * Math.PI) / 180
    if (-Math.sin(a) * inward.x + Math.cos(a) * inward.y < 0.99) continue
    const along = (f.x - e.a.x) * e.dir.x + (f.y - e.a.y) * e.dir.y
    if (along < 0 || along > e.length) continue
    const gap = (f.x - e.a.x) * inward.x + (f.y - e.a.y) * inward.y - face - def.d / 2
    if (gap > -TOL && gap < maxGap + TOL) out.push({ f, along, gap, face })
  }
  return out
}

/** 把件挪到背面离墙面 gap 处（沿墙位置不动） */
function moveTo(room: Room, edge: number, f: Furniture, along: number, face: number, gap: number) {
  const e = edgeInfo(room.points, edge)
  const def = ASSET_MAP.get(f.asset)!
  const c = add(add(e.a, mul(e.dir, along)), mul(e.out, -(face + gap + def.d / 2)))
  f.x = Math.round(c.x * 10) / 10
  f.y = Math.round(c.y * 10) / 10
}

/**
 * 改了第 edge 面墙的梁（before → after，没有就是 undefined）：原来按 before 挂好的壁挂物（贴墙面或挂在旧梁正面）按 after 重新挂。
 * 位置不是 before 该在的地方的（用户特意挪开的）不动。直接改 plan.furniture
 */
export function reseatOnBeam(plan: Plan, room: Room, edge: number, before: WallBeam | undefined, after: WallBeam | undefined) {
  const L = edgeInfo(room.points, edge).length
  const b0 = before && clampBeam(before, L)
  const b1 = after && clampBeam(after, L)
  const wallH = roomWallH(plan, room)
  for (const { f, along, gap, face } of mountedOn(plan, room, edge, plan.furniture, b0?.d ?? 0)) {
    const def = ASSET_MAP.get(f.asset)!
    const span = [along - def.w / 2, along + def.w / 2, def.mount!, def.mount! + def.h] as const
    if (Math.abs(gap - beamStandoff(b0, wallH, ...span)) > TOL) continue
    const want = beamStandoff(b1, wallH, ...span)
    if (Math.abs(gap - want) > 0.05) moveTo(room, edge, f, along, face, want)
  }
}

/** 一键布置收尾（plan 是一层的子户型）：贴着墙面挂的壁挂物，碰到梁的都挪到梁正面（furniture 就地改） */
export function seatOnBeams(plan: Plan, furniture: Furniture[]) {
  for (const bi of beamsOf(plan)) {
    const wallH = roomWallH(plan, bi.room)
    for (const { f, along, gap, face } of mountedOn(plan, bi.room, bi.edge, furniture, 0, true)) {
      const def = ASSET_MAP.get(f.asset)!
      const want = beamStandoff(bi.beam, wallH, along - def.w / 2, along + def.w / 2, def.mount!, def.mount! + def.h)
      if (want && Math.abs(gap) <= TOL) moveTo(bi.room, bi.edge, f, along, face, want)
    }
  }
}

/** 立面图用：这面墙上挂着的壁挂物（沿墙中心、宽、离地高度范围），包括挂在梁正面的 */
export function wallMounted(plan: Plan, room: Room, edge: number) {
  const beam = wallFace(room, edge)?.beam
  return mountedOn(plan, room, edge, plan.furniture, beam?.d ?? 0).map(({ f, along }) => {
    const def = ASSET_MAP.get(f.asset)!
    return { id: f.id, along, w: def.w, z0: def.mount!, z1: def.mount! + def.h }
  })
}
