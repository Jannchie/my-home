// 整栋房子：单层户型就是 buildHouse；多层户型每层按 floorView 取子户型单独搭一份（house.ts 的 HouseOpts 补上楼板、
// 楼梯洞口、挑空通高），各层的组放在自己的 elevation 上。3D 沙盘、「我的户型」缩略图、测试共用。

import * as THREE from 'three'
import type { Floor, Plan } from '../model'
import { floorAbove, floorOutline, floorView, isMultiFloor, planFloors, riseOf } from '../floors'
import { slabHoles, stairHoles } from '../stairs'
import { buildHouse } from './house'

export interface FloorGroup {
  floor: Floor
  /** 这一层的模型（局部坐标：本层地面 y = 0），position.y = elevation */
  group: THREE.Group
  /** 这一层实际用的墙高 */
  wallH: number
}

/**
 * 搭整栋房子。wallH：单层户型的墙高（沙盘的「墙高」滑杆）；多层户型每层用 Floor.height，
 * wallHFor 可以按层改（例如当前层跟着滑杆压低）。
 */
export function buildBuilding(plan: Plan, wallH: number, wallHFor?: (f: Floor) => number): { root: THREE.Group; floors: FloorGroup[] } {
  const root = new THREE.Group()
  const fs = planFloors(plan)
  if (!isMultiFloor(plan)) {
    const group = buildHouse(plan, wallH)
    group.userData.floorId = fs[0].id
    root.add(group)
    return { root, floors: [{ floor: fs[0], group, wallH }] }
  }
  const out: FloorGroup[] = []
  fs.forEach((f, i) => {
    const view = floorView(plan, f.id)
    const H = wallHFor?.(f) ?? f.height
    const above = floorAbove(plan, f.id)
    const voids = above ? floorView(plan, above.id).rooms.filter((r) => r.kind === 'void') : []
    const group = buildHouse(view, H, {
      upper: i > 0,
      outline: i > 0 ? floorOutline(view.rooms) : null,
      holes: slabHoles(plan, f.id),
      stairHoles: stairHoles(plan, f.id),
      tall: above && voids.length ? { zones: voids.map((r) => r.points), extra: above.elevation + above.height - (f.elevation + H) } : undefined,
      rise: riseOf(plan, f.id),
    })
    group.position.y = f.elevation
    group.userData.floorId = f.id
    root.add(group)
    out.push({ floor: f, group, wallH: H })
  })
  return { root, floors: out }
}
