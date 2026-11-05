// 3D 里用鼠标射线找落点：台面 / 层板 / 挂钩 / 屏幕顶边（pickSurface，规则见 surface.ts）和浴缸边沿（pickTub，见 tubTop.ts）。
// 要用 three.js 的射线运算，所以和平面图共用的 surface.ts、tubTop.ts 分开放。

import * as THREE from 'three'
import { fixtureDepth, pointInPolygon, type Plan } from '../model'
import { floorY, roomAt } from '../roomAt'
import { fixtureTop, inBounds, nearestPoly, owners, toLocal, toWorld } from '../surface'
import { isRimTub, tubTopPose, TUB_REACH, type TubPose } from '../tubTop'
import { CLIP_DROP, type Poly, type SurfaceKind } from './assetMeta'

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


/**
 * 射线指着哪个浴缸：和浴缸边沿高度的水平面求交，交点在浴缸外沿（放宽 TUB_REACH）里就算；
 * 返回吸附后的位置和射线距离 t（和 pickSurface 的 t 可比），都没指着、或摆件放不上去返回 null。
 */
export function pickTub(plan: Plan, ray: THREE.Ray, asset: string, rot: number): (TubPose & { t: number }) | null {
  let best: (TubPose & { t: number }) | null = null
  const hit = new THREE.Vector3()
  for (const tub of plan.fixtures) {
    if (!isRimTub(tub)) continue
    const top = fixtureTop(tub)
    if (top === null) continue
    const y = floorY(roomAt(plan, tub)) + top
    if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit)) continue
    const p = { x: hit.x, y: hit.z }
    const l = toLocal(tub, p)
    if (Math.abs(l.x) > tub.w / 2 + TUB_REACH || Math.abs(l.y) > fixtureDepth(tub) / 2 + TUB_REACH) continue
    const pose = tubTopPose(tub, asset, p, rot)
    if (!pose) continue
    const t = hit.distanceTo(ray.origin)
    if (!best || t < best.t) best = { ...pose, t }
  }
  return best
}

