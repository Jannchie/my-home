// 设备挪动 / 转向 / 改尺寸时，摆在它台面上的东西跟着走（浴缸边沿上的盖子、厨房台面 / 洗面台 / 马桶水箱上的小物，连同上面再叠的）。
//
// 用法：改设备之前 captureFixtureProps 记下台面上的东西在设备局部坐标里的位置，改完调 applyFixtureCarry 按新的位置 / 朝向摆回去。
// 横跨浴缸的东西（盖子、架板）摆回去后若压不住边沿（浴缸改小 / 改长），按原来的纵向位置重新吸一次（tubTopPose，盖着的盖子换成配套规格）；
// 还是放不上（浴缸改成淋浴房、改得比盖子还小）就留在原来的相对位置，不擅自删掉——用户能看到它悬着，自己挪走。

import type { Fixture, Furniture, Plan } from './model'
import { fitsOnFixture, propsOn, propsOnFixture, toLocal, toWorld } from './surface'
import { tubTopPose } from './tubTop'

interface CarriedProp {
  id: string
  /** 设备局部坐标 */
  lx: number
  ly: number
  /** 相对设备的转角 */
  lrot: number
  /** 直接摆在设备台面上的（不是叠在别的摆件上的） */
  direct: boolean
  /** 叠在哪件直接摆件上（跟着它一起被重新吸附） */
  base?: string
}
export interface FixtureCarry {
  fixture: string
  props: CarriedProp[]
}

/** 记下设备台面上的东西（相对设备的位置），挪动设备前调用 */
export function captureFixtureProps(plan: Pick<Plan, 'furniture' | 'floors'>, fx: Fixture): FixtureCarry {
  const out: CarriedProp[] = []
  const rel = (o: Furniture, direct: boolean, base?: string) => {
    const l = toLocal(fx, o)
    out.push({ id: o.id, lx: l.x, ly: l.y, lrot: o.rot - fx.rot, direct, base })
  }
  const seen = new Set<string>()
  for (const o of propsOnFixture(plan, fx)) {
    if (seen.has(o.id)) continue
    seen.add(o.id)
    rel(o, true)
    for (const k of propsOn(plan, o)) {
      if (seen.has(k.id)) continue
      seen.add(k.id)
      rel(k, false, o.id)
    }
  }
  return { fixture: fx.id, props: out }
}

/** 设备左右翻转（厨房）时，记下的东西也沿局部 x 镜像：跟着水槽、灶一起对调（灶边的水壶还在灶边，不会落进对调过来的水槽） */
export function mirrorFixtureCarry(carry: FixtureCarry) {
  for (const c of carry.props) {
    c.lx = -c.lx
    c.lrot = -c.lrot
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10
const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360

/** 按设备现在的位置 / 朝向把记下的东西摆回去 */
export function applyFixtureCarry(plan: Pick<Plan, 'furniture'>, fx: Fixture, carry: FixtureCarry) {
  const byId = new Map(plan.furniture.map((o) => [o.id, o]))
  // 直接摆件被重新吸附时的额外位移（叠在上面的东西跟着平移）
  const shift = new Map<string, { x: number; y: number }>()
  const order = [...carry.props.filter((c) => c.direct), ...carry.props.filter((c) => !c.direct)]
  for (const c of order) {
    const o = byId.get(c.id)
    if (!o) continue
    const w = toWorld(fx, c.lx, c.ly)
    let x = w.x
    let y = w.y
    let rot = norm(fx.rot + c.lrot)
    if (c.direct && fx.kind === 'bathtub' && !fitsOnFixture(fx, o.asset, r1(x), r1(y), rot)) {
      // 盖着的盖子换成和新尺寸配套的规格（tubTopPose 里 lidFor）
      const s = tubTopPose(fx, o.asset, { x, y }, rot)
      if (s) {
        shift.set(o.id, { x: s.x - x, y: s.y - y })
        x = s.x
        y = s.y
        rot = s.rot
        o.asset = s.asset
      }
    }
    const d = c.base ? shift.get(c.base) : undefined
    o.x = r1(x + (d?.x ?? 0))
    o.y = r1(y + (d?.y ?? 0))
    o.rot = rot
  }
}
