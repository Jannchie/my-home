// 横跨浴缸摆的东西（浴缸盖盖着 / 卷起 / 叠好、浴缸架板）：吸到浴缸边沿上。
//
// 浴缸边沿只是四条 7.5cm 宽的窄带（surface.ts fixtureLevels），中间是水面。普通的「射线落在哪一层」只有正好指着窄带才算，
// 而且只会把摆件往窄带中心收，不会转向，盖子之类横跨浴缸的东西几乎放不上去。这里换个思路：
//   - 指针指在浴缸范围里（边沿高度的水平面上）就算指着这个浴缸；
//   - 朝向只取「和浴缸平行 / 垂直」四种，挑离当前朝向最近、能压在边沿上的那种（surface.fitsOnFixture：四角在边沿带上，或横跨开口）；
//   - 横向居中，纵向跟着指针滑动（夹在浴缸两端之间），靠近一端时吸到那一端；
//     比浴缸窄边还长的（73cm 的卷起盖子放在 65 / 70 深的浴缸上）背面和浴缸外沿齐平、往前（洗身区那侧）伸出，不顶进背后的墙；
//   - 盖着的盖子（bx-lid-roll / bx-lid-panel 按尺寸分规格）换成和这个浴缸配套的规格（lidSizeFor，和一键布置一样）；
//   - 高度 = 边沿顶面。
// 放得下的就是「浴缸上的东西」：不按素材 id 列名单，任何能横跨压上边沿的摆件都适用（瓶子之类小东西中心落在水面上，放不上，还是走普通台面逻辑）。
// 手动摆放（Sandbox3D locate）和自动布置（decorate.ts bathLid）共用 tubTopPose，两边算出来的位置一致。

import * as THREE from 'three'
import { fixtureDepth, type Fixture, type Plan, type Vec } from './model'
import type { Guide } from './snap'
import { fitsOnFixture, fixtureTop, toLocal, toWorld } from './surface'
import { ASSET_MAP } from './three/assets'
import { lidSizeFor } from './three/packs/bath-extra'
import { floorY, roomAt } from './three/house'

/** 离浴缸一端多近（cm）就吸到那一端 */
export const TUB_END_SNAP = 12
/** 指针在浴缸外沿外多远以内还算指着浴缸 */
const TUB_REACH = 8

export interface TubPose {
  x: number
  y: number
  rot: number
  /** 边沿顶面高度（相对房间地面） */
  z: number
  /** 浴缸（设备）id */
  tub: string
  /** 实际摆的素材（盖着的盖子换成配套规格） */
  asset: string
}

/** 盖着的盖子换成和浴缸配套的规格；不是分规格的盖子、或没有配套规格时原样返回 */
export function lidFor(tub: Fixture, asset: string) {
  const m = /^bx-lid-(roll|panel)-\d+x\d+$/.exec(asset)
  const s = m && lidSizeFor(tub.w, fixtureDepth(tub))
  const id = s ? `bx-lid-${m![1]}-${s.w}x${s.d}` : asset
  return ASSET_MAP.has(id) ? id : asset
}

/** 能摆东西的浴缸（淋浴房的矮底盘没有边沿） */
export const isRimTub = (f: Fixture) => f.kind === 'bathtub' && !f.shower

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * 摆件横跨在浴缸边沿上的位置：p 是指针（平面坐标），rot 是想要的朝向（缺省和浴缸平行）。
 * 横向居中、纵向跟着 p 滑（靠近一端 TUB_END_SNAP 以内吸到端头，端头留 1cm），朝向取和浴缸平行 / 垂直里离 rot 最近、四角都压在边沿带上的；
 * 放不上（太小会掉进水里、太大压不住边沿、不是浴缸）返回 null。
 */
export function tubTopPose(tub: Fixture, asset: string, p: Vec, rot = tub.rot): TubPose | null {
  asset = lidFor(tub, asset)
  const def = ASSET_MAP.get(asset)
  const top = fixtureTop(tub)
  if (!def?.prop || !isRimTub(tub) || top === null) return null
  const l = toLocal(tub, p)
  const want = (((rot - tub.rot) % 360) + 360) % 360
  const gap = (a: number) => Math.min(Math.abs(a - want), 360 - Math.abs(a - want))
  const turns = [0, 90, 180, 270].sort((a, b) => gap(a) - gap(b))
  for (const lr of turns) {
    // 沿浴缸长边方向的长度
    const along = lr % 180 === 0 ? def.w : def.d
    const lim = Math.max(0, tub.w / 2 - along / 2 - 1)
    // 几乎和浴缸一样长（盖着的盖子）：居中；能滑动的：靠近端头吸到端头
    let lx = lim < 3 ? 0 : Math.max(-lim, Math.min(lim, l.x))
    if (lim >= TUB_END_SNAP && lim - Math.abs(lx) < TUB_END_SNAP) lx = Math.sign(lx || 1) * lim
    // 横向：居中；比浴缸窄边还长时背面和外沿齐平（伸出的部分在前面洗身区那侧，不顶进背后的墙）
    const across = lr % 180 === 0 ? def.d : def.w
    const d = fixtureDepth(tub)
    const w = toWorld(tub, lx, across > d ? across / 2 - d / 2 : 0)
    const pose = { x: r1(w.x), y: r1(w.y), rot: (tub.rot + lr) % 360, z: top, tub: tub.id, asset }
    if (fitsOnFixture(tub, asset, pose.x, pose.y, pose.rot)) return pose
  }
  return null
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

/** 吸到浴缸上时的提示线：沿浴缸长边的中线（浴缸摆正时才画，参考线只有横竖两种） */
export function tubGuides(tub: Fixture): Guide[] {
  const r = ((tub.rot % 180) + 180) % 180
  if (r !== 0 && r !== 90) return []
  const a = toWorld(tub, -tub.w / 2, 0)
  const b = toWorld(tub, tub.w / 2, 0)
  return r === 0 ? [{ axis: 'y', v: tub.y, a: Math.min(a.x, b.x) + 20, b: Math.max(a.x, b.x) - 20, wall: false }] : [{ axis: 'x', v: tub.x, a: Math.min(a.y, b.y) + 20, b: Math.max(a.y, b.y) - 20, wall: false }]
}
