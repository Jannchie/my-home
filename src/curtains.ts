// 设备的立体块、窗帘占的空间：一键布置的立体避让（decorate.ts）和窗帘模型（three/house.ts）共用。

import { add, bbox, edgesOf, fixtureBox, fixtureDepth, mul, pointInPolygon, type Box, type Fixture, type Plan } from './model'
import { wallThicknessAt } from './walls'

/** 设备局部坐标 → 平面坐标（同 surface.ts 的 toWorld；这里单独写一份，免得 three/house.ts 和 surface.ts 循环引用） */
function at(f: Pick<Fixture, 'x' | 'y' | 'rot'>, lx: number, lz: number) {
  const a = (f.rot * Math.PI) / 180
  return { x: f.x + lx * Math.cos(a) - lz * Math.sin(a), y: f.y + lx * Math.sin(a) + lz * Math.cos(a) }
}

/**
 * 设备的立体块（和 assets.ts 里的设备模型一致）：[平面包围盒, 底, 顶]（相对房间地面）。
 * 厨房 = 台面柜 + 灶台上方的抽油烟机（中岛还有背面吊柜）；冰箱位 / 洗衣机位 / 收纳位只是预留的空间，不算（上面的机器、柜子是家具）。
 */
export function fixtureSpans(fx: Fixture): [Box, number, number][] {
  const d = fixtureDepth(fx)
  const w = fx.w
  const part = (x0: number, x1: number, z0: number, z1: number, lo: number, hi: number): [Box, number, number] => [bbox([at(fx, x0, z0), at(fx, x1, z1)]), lo, hi]
  const full = (hi: number) => [part(-w / 2, w / 2, -d / 2, d / 2, 0, hi)]
  switch (fx.kind) {
    case 'kitchen': {
      const hx = w / 2 - 48
      const hood = part(hx - 30, hx + 30, -d / 2, -d / 2 + 50, 161, 300)
      if (fx.variant !== 'facing') return [part(-w / 2, w / 2, -d / 2, d / 2, 0, 90), hood]
      // 对面式：背面食器棚 + 主台面（吧台立板高到 110）
      const out = [part(-w / 2, w / 2, -d / 2, -d / 2 + 46, 0, 92), part(-w / 2, w / 2, d / 2 - 65, d / 2, 0, 110)]
      if (fx.island) {
        out.push(hood)
        if (w - 84 > 30) out.push(part(-w / 2, w / 2 - 84, -d / 2, -d / 2 + 34, 119, 181))
      }
      return out
    }
    case 'bathtub':
      return full(fx.shower ? 190 : 55)
    case 'toilet':
      return [part(-w / 2 - 3, w / 2 + 3, -d / 2, d / 2, 0, 78)]
    case 'basin':
      return full(90)
    case 'outdoor':
      return full(60)
    case 'ps':
      return full(300)
    // 楼梯：人从下层走到上层，整段（含上楼时的头顶空间）都不挂东西
    case 'stairs':
      return full(400)
    default:
      return []
  }
}

/** 柜子可以比收纳位略深 / 略出一点（cabinet.ts fitsSpot） */
const grow = (b: Box, k: number): Box => ({ x0: b.x0 - k, y0: b.y0 - k, x1: b.x1 + k, y1: b.y1 + k })
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5

/** 窗帘：杆比窗宽两侧各 15，帘子贴着墙面（离墙面 0..11） */
export const CURTAIN = { over: 15, depth: 11 }

export interface CurtainSpec {
  /** 帘子占的平面包围盒 */
  box: Box
  /** 杆高、下摆高（相对房间地面） */
  rodY: number
  bottom: number
}

/**
 * 一扇窗的窗帘：落地窗垂到地面，腰窗垂到窗台下 15；窗下有设备（厨房台面、洗面台、浴缸…）时下摆收到设备顶面以上，
 * 不插进台面里。center / out：窗中心（墙体中心线上）和墙的外法线；width：窗宽；wall：墙厚。
 */
export function curtainSpec(plan: Pick<Plan, 'fixtures'>, o: { center: { x: number; y: number }; dir: { x: number; y: number }; out: { x: number; y: number }; width: number; wall: number; y0: number; y1: number; sash: boolean }, H: number): CurtainSpec | null {
  const rodY = Math.min(o.y1 + 12, H - 4)
  if (rodY < 60) return null
  let bottom = o.sash ? 1 : Math.max(0, o.y0 - 15)
  const face = add(o.center, mul(o.out, -o.wall / 2))
  const half = o.width / 2 + CURTAIN.over
  const ends = [add(face, mul(o.dir, -half)), add(face, mul(o.dir, half))]
  const box = bbox([...ends, ...ends.map((p) => add(p, mul(o.out, -CURTAIN.depth)))])
  // 冰箱位 / 洗衣机位 / 收纳位上总会放冰箱、洗衣机、柜子（家具），按它们的大致高度算
  const spots = (fx: Fixture): [Box, number, number][] =>
    fx.kind === 'fridge' ? [[fixtureBox(fx), 0, 185]] : fx.kind === 'washer' ? [[fixtureBox(fx), 0, 105]] : fx.kind === 'builtin' ? [[grow(fixtureBox(fx), 8), 0, 230]] : fixtureSpans(fx)
  for (const fx of plan.fixtures) for (const [b, lo, hi] of spots(fx)) if (lo < bottom + 1 && overlaps(b, box)) bottom = Math.max(bottom, hi + 1)
  // 下摆抬到快碰到杆了：这扇窗就不挂
  if (rodY - bottom < 25) return null
  return { box, rodY, bottom }
}

/** 窗的高度范围（和 house.ts 的 openingSpan 一致） */
export function windowSpan(owner: { kind: string }, sash: boolean) {
  if (sash) return { y0: 0, y1: 200 }
  if (owner.kind === 'bath' || owner.kind === 'toilet' || owner.kind === 'wash') return { y0: 110, y1: 180 }
  return { y0: 90, y1: 190 }
}

/** 全屋会挂窗帘的窗（居室默认挂、和室不挂，房间的 curtain 设定优先），同 house.ts 的 buildCurtains */
export function curtainSpecs(plan: Plan, H = 240): CurtainSpec[] {
  const out: CurtainSpec[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const owner = plan.rooms.find((r) => r.id === o.roomId)
    if (!owner || o.edge >= owner.points.length) continue
    const color = owner.curtain === false ? null : (owner.curtain ?? (owner.kind === 'ldk' || owner.kind === 'western' ? 'auto' : null))
    if (!color) continue
    const e = edgesOf(owner.points)[o.edge]
    const w = Math.min(o.width, e.length)
    const c = e.length <= w ? e.length / 2 : Math.max(w / 2, Math.min(e.length - w / 2, o.offset))
    const center = add(e.a, mul(e.dir, c))
    const wall = wallThicknessAt(plan, center, e.out, owner)
    const sash = plan.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(add(center, mul(e.out, wall / 2 + 15)), x.points))
    const spec = curtainSpec(plan, { center, dir: e.dir, out: e.out, width: w, wall, sash, ...windowSpan(owner, sash) }, H)
    if (spec) out.push(spec)
  }
  return out
}
