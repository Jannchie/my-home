// 整栋房子：单层户型就是 buildHouse；多层户型每层按 floorView 取子户型单独搭一份（house.ts 的 HouseOpts 补上楼板、
// 楼梯洞口、挑空通高），各层的组放在自己的 elevation 上。3D 沙盘、「我的户型」缩略图、测试共用。
// 户建（Plan.exterior / site）另外加：外墙材质、窗套和雨棚、各层露在外面的屋顶（userData.roof 的组）、最底层的用地。

import * as THREE from 'three'
import type { Floor, Plan } from '../model'
import { floorAbove, floorOutline, floorView, isMultiFloor, planFloors, riseOf } from '../floors'
import { slabHoles, stairHoles } from '../stairs'
import { roofParts } from '../exterior'
import { buildHouse, type HouseOpts } from './house'
import { buildSite, facadeExtras, facadeMaterial, roofGroup } from './exterior'

export interface FloorGroup {
  floor: Floor
  /** 这一层的模型（局部坐标：本层地面 y = 0），position.y = elevation */
  group: THREE.Group
  /** 这一层实际用的墙高 */
  wallH: number
  /** 盖在这一层上的屋顶（户建；按楼层的满墙高搭，墙压低时由沙盘隐藏） */
  roof?: THREE.Group
}

/**
 * 搭整栋房子。wallH：单层户型的墙高（沙盘的「墙高」滑杆）；多层户型每层用 Floor.height，
 * wallHFor 可以按层改（例如当前层跟着滑杆压低）。
 * bare：3D 设计图用的「素模」——不搭展示底座和用地；墙压低（剖切）的楼层不加外墙装饰、挑空旁的外墙也不通高。
 */
export function buildBuilding(plan: Plan, wallH: number, wallHFor?: (f: Floor) => number, opts: { bare?: boolean } = {}): { root: THREE.Group; floors: FloorGroup[] } {
  const root = new THREE.Group()
  const fs = planFloors(plan)
  const ex = plan.exterior
  const facade = ex ? facadeMaterial(ex) : undefined
  const parts = ex ? roofParts(plan) : []
  /** 户建的附加部分：外墙装饰、屋顶、用地 */
  const dress = (fg: FloorGroup, view: Plan, i: number) => {
    if (ex && !(opts.bare && fg.wallH < fg.floor.height)) fg.group.add(facadeExtras(view, fg.wallH, ex, i === 0))
    const roof = roofGroup(plan, fg.floor.id, parts)
    if (roof) {
      fg.group.add(roof)
      fg.roof = roof
    }
    if (plan.site && i === 0 && !opts.bare) fg.group.add(buildSite(plan.site))
  }
  const extra: HouseOpts = { facade, noBase: !!plan.site || !!opts.bare }
  if (!isMultiFloor(plan)) {
    const group = buildHouse(plan, wallH, extra)
    group.userData.floorId = fs[0].id
    root.add(group)
    const fg: FloorGroup = { floor: fs[0], group, wallH }
    dress(fg, plan, 0)
    return { root, floors: [fg] }
  }
  const out: FloorGroup[] = []
  fs.forEach((f, i) => {
    const view = floorView(plan, f.id)
    const H = wallHFor?.(f) ?? f.height
    const above = floorAbove(plan, f.id)
    const voids = above ? floorView(plan, above.id).rooms.filter((r) => r.kind === 'void') : []
    const group = buildHouse(view, H, {
      ...extra,
      upper: i > 0,
      outline: i > 0 ? floorOutline(view.rooms) : null,
      holes: slabHoles(plan, f.id),
      stairHoles: stairHoles(plan, f.id),
      tall: above && voids.length && !(opts.bare && H < f.height) ? { zones: voids.map((r) => r.points), extra: above.elevation + above.height - (f.elevation + H) } : undefined,
      rise: riseOf(plan, f.id),
    })
    group.position.y = f.elevation
    group.userData.floorId = f.id
    root.add(group)
    const fg: FloorGroup = { floor: f, group, wallH: H }
    dress(fg, view, i)
    out.push(fg)
  })
  return { root, floors: out }
}
