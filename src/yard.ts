// 户建院子里的户外物件（一键布置时摆几件）：
//   南院：一套户外桌椅 / 吊椅，靠南边围挡一排菜园箱、花箱，角上堆肥桶；贴着房子南墙放园艺工作台（台面上几盆苗、浇水壶）、
//         水管卷盘、户外储物柜，日式户建偶尔一个晾被架，偶尔一辆园艺推车；
//   入口：门前通道两旁各一个花箱、门口一辆自行车，再在通道外侧补一两盆。
// 按用地的矩形区域算位置；件数和款式都由种子决定，爱园艺的住户（household.plants）摆得更多。
//
// 院子里的东西不在任何房间里：3D 里落在用地地面上（house.ts groundY），楼层是最底层（floor 不写）。

import { mulberry32 } from './generate'
import { bbox, boxOverlaps, uid, type Furniture, type Plan } from './model'
import { floorOf, floorView, planFloors } from './floors'
import { furnitureBox, yardBlocked } from './snap'
import { ASSETS, ASSET_MAP } from './three/assets'
import { hasTag } from './three/tags'

/** 院子里要摆的户外物件（不含已有家具；没有用地返回空） */
export function yardFurniture(plan: Plan, seed: number): Furniture[] {
  const site = plan.site
  if (!site) return []
  const rand = mulberry32((seed ^ 0x7a11) >>> 0)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
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
  const add = (asset: string, x: number, y: number, rot: number): Furniture | null => {
    if (!ASSET_MAP.has(asset)) return null
    const f = { id: uid('u'), asset, x: Math.round(x), y: Math.round(y), rot }
    // 和沙盘的穿模提示同一套规则：不出用地、不压房子和车位、院子里的东西互相不重叠
    const b = furnitureBox(asset, f.x, f.y, rot)
    if (yardBlocked(view, b, f)) return null
    if (out.some((o) => !o.z && boxOverlaps(b, furnitureBox(o.asset, o.x, o.y, o.rot)))) return null
    out.push(f)
    return f
  }
  /** 摆到台面上（z = 台面高度）：只要求整块在台面里，不和同一台面上的东西重叠 */
  const onTop = (parent: Furniture, asset: string, lx: number) => {
    const pd = ASSET_MAP.get(parent.asset)
    const d = ASSET_MAP.get(asset)
    if (!pd?.surface || !d || Math.abs(lx) + d.w / 2 > pd.w / 2 - 2 || d.d > pd.d - 4) return null
    // 院子里的东西都是 rot 0 / 180：局部 x 沿世界 x（180 时反向）
    const x = parent.x + (parent.rot === 180 ? -lx : lx)
    const f = { id: uid('u'), asset, x: Math.round(x * 10) / 10, y: parent.y, rot: parent.rot, z: pd.surface }
    const b = furnitureBox(asset, f.x, f.y, f.rot)
    if (out.some((o) => o.z === f.z && boxOverlaps(b, furnitureBox(o.asset, o.x, o.y, o.rot)))) return null
    out.push(f)
    return f
  }
  const green = !!plan.household?.members.some((m) => m.interests.includes('plants'))
  const planters = ASSETS.filter((a) => hasTag(a, 'planter') && !a.prop && !a.mount && !a.fixture).map((a) => a.id)
  // 南院：户外桌椅（离房子一点距离），沿南边围挡一排菜园箱、花箱
  if (gardenY1 - lot.y0 > 180) {
    const cx = (house.x0 + house.x1) / 2 + (rand() - 0.5) * 160
    add(rand() < 0.5 ? 'out-folding-set' : 'out-hanging-chair', cx, (gardenY1 + lot.y0) / 2 + 20, 0)
    const n = 1 + Math.floor(rand() * 2)
    for (let i = 0; i < n; i++) add('out-garden-box', lot.x0 + 90 + i * 110, lot.y0 + 45, 0)
    if (plan.region === 'jp' && rand() < 0.6) add('out-futon-rack', house.x1 - 120, gardenY1 - 60, 0)
    // 菜园箱旁边接着排一两个花箱，东南角一个堆肥桶
    const more = (green ? 2 : 1) + (rand() < 0.5 ? 1 : 0) - 1
    for (let i = 0; i < more && planters.length; i++) add(pick(planters), lot.x0 + 90 + n * 110 + i * 80 - 10, lot.y0 + 20, 0)
    if (rand() < (green ? 0.8 : 0.45)) add('gd-compost-bin', lot.x1 - 40, lot.y0 + 40, 0)
    // 贴着房子南墙：园艺工作台（台面上一两盆苗、浇水壶）、水管卷盘、户外储物柜
    const wallY = (d: number) => gardenY1 - d / 2 - 5
    if (rand() < (green ? 0.8 : 0.4)) {
      const bench = add('gd-potting-bench', house.x0 + 80 + rand() * 40, wallY(50), 180)
      if (bench) {
        const props = ASSETS.filter((a) => a.prop && !a.form?.includes('hanging') && /^gd-(terra|cement|glazed|seed-tray|herb|succulent|lavender|strawberry|can-small|soil-bag|gloves|trowel)/.test(a.id)).map((a) => a.id)
        const k = 1 + Math.floor(rand() * 3)
        for (let i = 0; i < k && props.length; i++) onTop(bench, pick(props), -32 + i * 32 + (rand() - 0.5) * 6)
      }
    }
    if (rand() < 0.55) add('gd-hose-reel', house.x0 + 190 + rand() * 30, wallY(52), 180)
    if (rand() < 0.3) add('out-storage', house.x0 + 290 + rand() * 30, wallY(53), 180)
    if (rand() < 0.25) add('gd-garden-cart', lot.x0 + 90 + rand() * 60, lot.y0 + 120, 0)
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
    // 花箱外侧再补一盆（换个款式）
    if (planters.length && rand() < (green ? 0.7 : 0.35)) add(pick(planters), side < 0 ? pb.x1 + 115 : pb.x0 - 115, y, 180)
  }
  return out
}
