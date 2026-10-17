// 户建院子里的户外物件（一键布置时摆几件）：南边院子一套户外桌椅、靠围挡的菜园箱，入口两旁的花箱、门口一辆自行车。
// 第一期只摆这几件、按用地的矩形区域算位置；院子的细化布置（第三期）可以从这里接着做。
//
// 院子里的东西不在任何房间里：3D 里落在用地地面上（house.ts groundY），楼层是最底层（floor 不写）。

import { mulberry32 } from './generate'
import { bbox, boxOverlaps, uid, type Furniture, type Plan } from './model'
import { floorOf, floorView, planFloors } from './floors'
import { furnitureBox, yardBlocked } from './snap'
import { ASSET_MAP } from './three/assets'

/** 院子里要摆的户外物件（不含已有家具；没有用地返回空） */
export function yardFurniture(plan: Plan, seed: number): Furniture[] {
  const site = plan.site
  if (!site) return []
  const rand = mulberry32((seed ^ 0x7a11) >>> 0)
  const base = planFloors(plan)[0].id
  const rooms = plan.rooms.filter((r) => floorOf(plan, r) === base && r.kind !== 'balcony')
  if (!rooms.length) return []
  const house = bbox(rooms.flatMap((r) => r.points))
  const lot = bbox(site.points)
  // 上层阳台挑出去的部分下面别摆（y < 0 的那一条）
  const overhang = Math.min(0, ...plan.rooms.filter((r) => r.kind === 'balcony').flatMap((r) => r.points.map((p) => p.y)))
  const gardenY1 = Math.min(house.y0, overhang) - 40
  const out: Furniture[] = []
  const view = floorView(plan, base)
  const add = (asset: string, x: number, y: number, rot: number) => {
    if (!ASSET_MAP.has(asset)) return
    const f = { id: uid('u'), asset, x: Math.round(x), y: Math.round(y), rot }
    // 和沙盘的穿模提示同一套规则：不出用地、不压房子和车位、院子里的东西互相不重叠
    const b = furnitureBox(asset, f.x, f.y, rot)
    if (yardBlocked(view, b, f)) return
    if (out.some((o) => boxOverlaps(b, furnitureBox(o.asset, o.x, o.y, o.rot)))) return
    out.push(f)
  }
  // 南院：户外桌椅（离房子一点距离），沿南边围挡一排菜园箱
  if (gardenY1 - lot.y0 > 180) {
    const cx = (house.x0 + house.x1) / 2 + (rand() - 0.5) * 160
    add(rand() < 0.5 ? 'out-folding-set' : 'out-hanging-chair', cx, (gardenY1 + lot.y0) / 2 + 20, 0)
    const n = 1 + Math.floor(rand() * 2)
    for (let i = 0; i < n; i++) add('out-garden-box', lot.x0 + 90 + i * 110, lot.y0 + 45, 0)
    if (plan.region === 'jp' && rand() < 0.6) add('out-futon-rack', house.x1 - 120, gardenY1 - 60, 0)
  }
  // 入口：门前通道两旁各一个花箱，门边一辆自行车
  const path = site.paths[0]
  if (path) {
    const pb = bbox(path)
    const y = house.y1 + 30
    add('planter', pb.x0 - 40, y, 180)
    add('planter', pb.x1 + 40, y, 180)
    const park = site.parking[0] ? bbox(site.parking[0].points) : null
    // 自行车：通道和车位都不挡的那一侧，靠着房子北墙
    const side = park && park.x0 > pb.x1 ? -1 : 1
    const bx = side < 0 ? pb.x0 - 150 : pb.x1 + 150
    if (bx - 90 > lot.x0 && bx + 90 < lot.x1 && lot.y1 - house.y1 > 90) add('out-bike', bx, house.y1 + 45, 180)
  }
  return out
}
