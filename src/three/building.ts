// 整栋房子：单层户型就是 buildHouse；多层户型每层按 floorView 取子户型单独搭一份（house.ts 的 HouseOpts 补上楼板、
// 楼梯洞口、挑空通高），各层的组放在自己的 elevation 上。3D 沙盘、「我的户型」缩略图、测试共用。
// 户建（Plan.exterior / site）另外加：外墙材质、窗套和雨棚、各层露在外面的屋顶（userData.roof 的组）、最底层的用地。

import * as THREE from 'three'
import type { Floor, Plan } from '../model'
import { floorAbove, floorOutline, floorView, isMultiFloor, planFloors, riseOf } from '../floors'
import { slabHoles, stairHoles } from '../stairs'
import { roofExterior, roofParts } from '../exterior'
import { buildHouse, type HouseOpts } from './house'
import { balconyPosts, buildBalconyPosts, buildSite, facadeExtras, facadeMaterial, roofGroup } from './exterior'
import { noTransparentShadows } from './toon'

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
export function buildBuilding(plan: Plan, wallH: number, wallHFor?: (f: Floor) => number, opts: { bare?: boolean; defaultRoof?: boolean } = {}): { root: THREE.Group; floors: FloorGroup[] } {
  const root = new THREE.Group()
  const fs = planFloors(plan)
  const ex = plan.exterior
  const facade = ex ? facadeMaterial(ex) : undefined
  const multi = isMultiFloor(plan)
  /** 各层实际的墙高：屋顶盖在墙顶上（单层户型就是 wallH） */
  const heightOf = (f: Floor) => (multi ? (wallHFor?.(f) ?? f.height) : wallH)
  // 屋顶：户建按外观设定；没有外观设定的户型（公寓、复式、手画的）要了才现推一份缺省的（沙盘的外观视图）
  const roofEx = ex ?? (opts.defaultRoof ? roofExterior(plan) : undefined)
  const parts = roofEx ? roofParts(plan, roofEx, heightOf) : []
  // 上层阳台挑出去的部分：支柱落到下层屋面 / 阳台 / 地面上
  const posts = opts.bare ? [] : balconyPosts(plan, parts, heightOf)
  /** 户建的附加部分：外墙装饰、屋顶、用地 */
  const dress = (fg: FloorGroup, view: Plan, i: number) => {
    if (ex && !(opts.bare && fg.wallH < fg.floor.height)) fg.group.add(facadeExtras(view, fg.wallH, ex, i === 0))
    const roof = roofEx ? roofGroup(plan, fg.floor.id, parts, roofEx) : null
    if (roof) {
      fg.group.add(roof)
      fg.roof = roof
      // 立在这块屋顶上的阳台支柱：放进屋顶的组（屋顶藏起来时不悬空）
      const onRoof = posts.filter((p) => p.roofFloor === fg.floor.id)
      if (onRoof.length) roof.add(buildBalconyPosts(onRoof, fg.floor.elevation))
    }
    const mine = posts.filter((p) => p.floor === fg.floor.id && !p.roofFloor)
    if (mine.length) fg.group.add(buildBalconyPosts(mine, fg.floor.elevation))
    if (plan.site && i === 0 && !opts.bare) fg.group.add(buildSite(plan.site))
    // 外墙装饰、屋顶里的玻璃同样不投影（buildHouse 已处理房体本身）
    noTransparentShadows(fg.group)
  }
  const extra: HouseOpts = { facade, noBase: !!plan.site || !!opts.bare }
  if (!multi) {
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
      // 楼梯间：贴着上层楼梯洞口的墙砌到上层地面（墙压低的那一层不砌）
      under: above && H >= f.height ? { zones: stairHoles(plan, above.id).map((h) => h.poly), extra: above.elevation - (f.elevation + H) } : undefined,
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
