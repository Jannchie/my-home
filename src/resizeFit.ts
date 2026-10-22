// 调宽深时让开墙和旁边的东西（store.ts resizeFurniture 用）：变大以后会嵌进墙、压到别的家具或设备，
// 就先试着往空的一侧挪（宽：最多挪到一侧边缘不动；深：背面往后退），挪了也放不下再逐 cm 减小，取放得下的最大尺寸。
// 缩小不会新撞到东西，不检查。调整前就已经和这件重叠的东西（塞在桌下的椅子、站在收纳位上的柜子）不算障碍；
// 本来就嵌进墙里的不查墙。壁挂、摆在台面上的只查墙。

import { boxOverlaps, fixtureBox, pointInPolygon, type Box, type Furniture, type Plan } from './model'
import { furnitureBox } from './snap'
import { boxInside, innerRoom } from './place'
import { floorOf } from './floors'
import { toWorld } from './surface'
import { ASSET_MAP } from './three/assets'
import { baseAssetId, resizedId } from './three/resize'

const EDGE = 0.99

export interface ResizeFit {
  asset: string
  x: number
  y: number
  /** 放不下要求的尺寸、被减小了 */
  clamped: boolean
}

/** 把 f 调成 (w, d) 后的素材和位置：宽以中心为准、深以背面为准，撞了就挪或减小 */
export function fitResize(plan: Plan, f: Furniture, w: number, d: number): ResizeFit | null {
  const cur = ASSET_MAP.get(f.asset)
  const base = ASSET_MAP.get(baseAssetId(f.asset))
  if (!cur || !base) return null
  const want = ASSET_MAP.get(resizedId(base, w, d))!
  const w0 = cur.w
  const d0 = cur.d
  /** 局部偏移 (sx, sz)（相对现在的中心）、尺寸 (ww, dd) 时的素材和位置 */
  const at = (ww: number, dd: number, sx: number, sz: number) => {
    const asset = resizedId(base, ww, dd)
    const p = toWorld(f, sx, sz)
    return { asset, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }
  }
  const blocked = obstacles(plan, f)
  const free = (c: { asset: string; x: number; y: number }) => !blocked(furnitureBox(c.asset, c.x, c.y, f.rot))

  // 宽：从要求的宽往现在的宽减，每个宽度先试不挪、再往两侧挪（挪得少的优先）
  let ww = w0
  let sx = 0
  const tw = Math.round(want.w)
  if (tw <= w0) ww = tw
  else
    width: for (let cw = tw; cw > w0; cw--)
      for (const s of shifts((cw - w0) / 2))
        if (free(at(cw, d0, s, 0))) {
          ww = cw
          sx = s
          break width
        }

  // 深：背面不动（中心往前挪一半增量）；前面撞了就往后退，退不下再减
  let dd = d0
  let sz = 0
  const td = Math.round(want.d)
  if (td <= d0) {
    dd = td
    sz = (td - d0) / 2
  } else
    depth: for (let cd = td; cd > d0; cd--) {
      const grow = cd - d0
      for (let back = 0; back <= grow; back++) {
        const z = grow / 2 - back
        if (free(at(ww, cd, sx, z))) {
          dd = cd
          sz = z
          break depth
        }
      }
    }

  const r = at(ww, dd, sx, sz)
  const clamped = ww < tw || dd < td
  // 取整后和原来一样（只差零点几 cm）：原地不动
  return r.asset === f.asset ? { asset: f.asset, x: f.x, y: f.y, clamped } : { ...r, clamped }
}

/** 宽度变大时试的平移：不挪、再往两侧逐 cm，最多挪到一侧边缘不动（room = 增量的一半） */
function shifts(room: number) {
  const out = [0]
  for (let s = 1; s < room; s++) out.push(s, -s)
  if (room > 0) out.push(room, -room)
  return out
}

/** 往外放 e */
const grow = (b: Box, e: number): Box => ({ x0: b.x0 - e, y0: b.y0 - e, x1: b.x1 + e, y1: b.y1 + e })

/**
 * 这件家具变大时会撞到的东西：box → 是否撞上。
 * boxOverlaps / boxInside 各有 1cm 容差：候选占地往外放 EDGE 再查，贴上可以、嵌进去不行；
 * 现在的占地放大后就已经算嵌墙的（壁挂的背面贴进墙面一点点），查墙时不放大
 */
function obstacles(plan: Plan, f: Furniture): (b: Box) => boolean {
  const floor = floorOf(plan, f)
  const me = furnitureBox(f.asset, f.x, f.y, f.rot)
  const def = ASSET_MAP.get(f.asset)
  const room = plan.rooms.find((r) => floorOf(plan, r) === floor && pointInPolygon(f, r.points))
  const inner = room && innerRoom(room, plan)
  // 本来就嵌进墙里的不查墙（不然一点都调不大）
  const walls = inner && boxInside(me, inner) ? inner : null
  const wallPad = walls && boxInside(grow(me, EDGE), walls) ? EDGE : 0
  const onlyWalls = def?.mount !== undefined || !!f.z
  const boxes: Box[] = []
  if (!onlyWalls) {
    for (const o of plan.furniture) {
      if (o.id === f.id || o.z || floorOf(plan, o) !== floor) continue
      const od = ASSET_MAP.get(o.asset)
      if (!od || od.mount !== undefined || od.stick || od.ceiling || od.h <= 3) continue
      boxes.push(furnitureBox(o.asset, o.x, o.y, o.rot))
    }
    for (const fx of plan.fixtures) if (floorOf(plan, fx) === floor) boxes.push(fixtureBox(fx))
  }
  // 调整前就已经和这件重叠的不算障碍
  const solid = boxes.filter((b) => !boxOverlaps(b, me))
  return (b) => (!!walls && !boxInside(grow(b, wallPad), walls)) || solid.some((o) => boxOverlaps(grow(b, EDGE), o))
}
