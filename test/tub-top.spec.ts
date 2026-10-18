// 横跨浴缸的东西（浴缸盖、浴缸架板）吸到浴缸边沿上：手动摆放的吸附（tubTopPose / pickTub）、一键布置（decorate.bathLid）用同一套，
// 浴缸挪动 / 转向 / 改尺寸时盖子跟着走（fixtureCarry）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { fixtureDepth, pointInPolygon, type Fixture, type Furniture, type Plan } from '/src/model'
import { fitsOnFixture, propClash, propsOnFixture, supportOf, toLocal, toWorld } from '/src/surface'
import { pickTub, tubTopPose } from '/src/tubTop'
import { applyFixtureCarry, captureFixtureProps } from '/src/fixtureCarry'
import { showerSpot } from '/src/bathroom'
import { lidSizeFor } from '/src/three/packs/bath-extra'
import { ASSET_MAP } from '/src/three/assets'
import { genJp, range } from './helpers'

const tubAt = (rot = 0, extra: Partial<Fixture> = {}): Fixture => ({ id: 'tub', kind: 'bathtub', x: 200, y: 300, w: 140, d: 75, rot, ...extra })
const planWith = (tub: Fixture, furniture: Furniture[] = []): Plan =>
  ({ rooms: [], openings: [], fixtures: [tub], furniture, wall: 12, wallOuter: 18 }) as unknown as Plan
const closedLid = () => {
  const s = lidSizeFor(140, 75)!
  return `bx-lid-roll-${s.w}x${s.d}`
}
const local = (tub: Fixture, p: { x: number; y: number }) => toLocal(tub, p)

describe('tubTopPose：吸到浴缸边沿上', () => {
  test('盖着的浴缸盖：指在浴缸任何地方都盖在正中、和浴缸平行、高度 = 边沿顶', () => {
    for (const rot of [0, 90, 180, 270, 30]) {
      const tub = tubAt(rot)
      const id = closedLid()
      for (const [lx, ly] of [[0, 0], [40, 20], [-60, -30]]) {
        const s = tubTopPose(tub, id, toWorld(tub, lx, ly), 0)!
        expect(s, `rot ${rot} at ${lx},${ly}`).not.toBeNull()
        const l = local(tub, s)
        expect(Math.abs(l.x)).toBeLessThan(0.2)
        expect(Math.abs(l.y)).toBeLessThan(0.2)
        expect((s.rot - tub.rot + 360) % 180).toBe(0)
        expect(s.z).toBe(55)
        expect(fitsOnFixture(tub, id, s.x, s.y, s.rot)).toBe(true)
      }
    }
  })

  test('卷起 / 叠好的盖子、浴缸架板：转成横跨浴缸短边，横向居中，纵向跟着指针，靠近端头吸到端头', () => {
    for (const rot of [0, 90, 210]) {
      const tub = tubAt(rot)
      for (const id of ['wet-bath-lid-rolled', 'wet-bath-lid-folded', 'bx-lid-zigzag', 'wet-bath-caddy']) {
        const def = ASSET_MAP.get(id)!
        const mid = tubTopPose(tub, id, toWorld(tub, 10, 25), 0)!
        expect(mid, id).not.toBeNull()
        expect(((mid.rot - tub.rot + 360) % 180), id).toBe(90)
        const l = local(tub, mid)
        expect(Math.abs(l.y), id).toBeLessThan(0.2)
        expect(l.x, id).toBeCloseTo(10, 0)
        // 指到浴缸端头外：顶到端头，端头留 1cm
        const end = tubTopPose(tub, id, toWorld(tub, 66, 0), 0)!
        expect(local(tub, end).x, id).toBeCloseTo(tub.w / 2 - def.d / 2 - 1, 0)
        expect(fitsOnFixture(tub, id, end.x, end.y, end.rot), id).toBe(true)
      }
    }
  })

  test('比浴缸窄边长的卷起盖子（73cm 放在 65 / 70 深的浴缸上）：背面和外沿齐平、往前伸出，仍算压在边沿上', () => {
    for (const d of [65, 70]) {
      const tub = tubAt(90, { d })
      for (const id of ['wet-bath-lid-rolled', 'wet-bath-caddy', 'wet-bath-lid-folded']) {
        const def = ASSET_MAP.get(id)!
        const s = tubTopPose(tub, id, tub, 0)!
        expect(s, `${id} d=${d}`).not.toBeNull()
        const l = local(tub, s)
        // 背面（局部 -y）齐平外沿
        expect(l.y - def.w / 2).toBeCloseTo(-d / 2, 0)
        const lid: Furniture = { id: 'lid', asset: id, x: s.x, y: s.y, rot: s.rot, z: s.z, color: '#fff' }
        expect(supportOf(planWith(tub, [lid]), lid)).toEqual({ ownerId: 'tub', fits: true })
      }
    }
    // 伸出太多（50 深的浴缸放 73cm 的卷起盖子要伸出 23cm）：放不上
    const narrow = tubAt(0, { d: 50 })
    expect(tubTopPose(narrow, 'wet-bath-lid-rolled', narrow)).toBeNull()
  })

  test('盖着的盖子换成和浴缸配套的规格', () => {
    const tub = tubAt(0, { w: 127, d: 65 })
    const s = tubTopPose(tub, 'bx-lid-panel-180x70', tub)!
    expect(s.asset).toBe(`bx-lid-panel-${lidSizeFor(127, 65)!.w}x${lidSizeFor(127, 65)!.d}`)
    expect(local(tub, s).x).toBeCloseTo(0, 1)
  })

  test('小东西（瓶子）、淋浴房、非浴缸：不吸', () => {
    const tub = tubAt()
    const small = [...ASSET_MAP.values()].find((a) => a.prop && a.w < 15 && a.d < 15)!
    expect(tubTopPose(tub, small.id, tub)).toBeNull()
    expect(tubTopPose(tub, small.id, tub, 90)).toBeNull()
    expect(tubTopPose(tubAt(0, { shower: true }), closedLid(), { x: 200, y: 300 })).toBeNull()
    expect(tubTopPose({ ...tubAt(), kind: 'kitchen' }, closedLid(), { x: 200, y: 300 })).toBeNull()
    // 盖子比浴缸大：放不上
    expect(tubTopPose(tubAt(0, { w: 100 }), 'wet-bath-lid-folded', { x: 200, y: 300 }, 0)).not.toBeNull()
    expect(tubTopPose(tubAt(0, { w: 100, d: 20 }), 'wet-bath-lid-folded', { x: 200, y: 300 })).toBeNull()
  })

  test('pickTub：从上方指着浴缸中间（水面上）也能吸上去；指在浴缸外不算', () => {
    const tub = tubAt(90)
    const plan = planWith(tub)
    const down = (x: number, y: number) => new THREE.Ray(new THREE.Vector3(x, 400, y), new THREE.Vector3(0, -1, 0))
    const hit = pickTub(plan, down(205, 290), 'wet-bath-lid-rolled', 0)!
    expect(hit).not.toBeNull()
    expect(hit.tub).toBe('tub')
    expect(hit.z).toBe(55)
    expect(hit.t).toBeCloseTo(400 - 55, 3)
    expect(((hit.rot - 90 + 360) % 180)).toBe(90)
    expect(Math.abs(local(tub, hit).y)).toBeLessThan(0.2)
    expect(pickTub(plan, down(200 + 60, 300), 'wet-bath-lid-rolled', 0)).toBeNull()
    // 斜着看：射线和边沿平面的交点决定位置
    const oblique = new THREE.Ray(new THREE.Vector3(200, 255, 300 + 200), new THREE.Vector3(0, -1, -1).normalize())
    expect(pickTub(plan, oblique, closedLid(), 0)).not.toBeNull()
  })

  test('吸上去的盖子有支撑（supportOf 四角都压在边沿上），也算在浴缸台面上', () => {
    const tub = tubAt(0)
    for (const id of [closedLid(), 'wet-bath-lid-rolled', 'wet-bath-caddy']) {
      const s = tubTopPose(tub, id, tub)!
      const lid: Furniture = { id: 'lid', asset: id, x: s.x, y: s.y, rot: s.rot, z: s.z, color: '#fff' }
      const plan = planWith(tub, [lid])
      expect(supportOf(plan, lid)).toEqual({ ownerId: 'tub', fits: true })
      expect(propsOnFixture(plan, tub).map((o) => o.id)).toEqual(['lid'])
    }
  })
})

describe('浴缸挪动 / 转向 / 改尺寸：盖子跟着走', () => {
  const setup = (id: string, at = 0) => {
    const tub = tubAt(0)
    const s = tubTopPose(tub, id, toWorld(tub, at, 0))!
    const lid: Furniture = { id: 'lid', asset: id, x: s.x, y: s.y, rot: s.rot, z: s.z, color: '#fff' }
    return { tub, lid, plan: planWith(tub, [lid]) }
  }

  test('挪动、转 90°：相对位置不变，仍压在边沿上', () => {
    const { tub, lid, plan } = setup('wet-bath-lid-rolled', 40)
    const before = local(tub, lid)
    const carry = captureFixtureProps(plan, tub)
    tub.x += 57
    tub.y -= 33
    tub.rot = 90
    applyFixtureCarry(plan, tub, carry)
    const after = local(tub, lid)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)
    expect((lid.rot - tub.rot + 360) % 180).toBe(90)
    expect(supportOf(plan, lid)).toEqual({ ownerId: 'tub', fits: true })
  })

  test('浴缸改短：端头的盖子重新吸到新的端头；盖着的盖子仍在正中', () => {
    const a = setup('wet-bath-lid-folded', 70)
    const carry = captureFixtureProps(a.plan, a.tub)
    a.tub.w = 120
    applyFixtureCarry(a.plan, a.tub, carry)
    expect(local(a.tub, a.lid).x).toBeCloseTo(120 / 2 - 23 - 1, 0)
    expect(supportOf(a.plan, a.lid)?.fits).toBe(true)

    const b = setup(closedLid())
    const c2 = captureFixtureProps(b.plan, b.tub)
    b.tub.y += 100
    applyFixtureCarry(b.plan, b.tub, c2)
    expect(supportOf(b.plan, b.lid)).toEqual({ ownerId: 'tub', fits: true })
  })

  test('别处同高度的东西不跟着走', () => {
    const { tub, plan } = setup(closedLid())
    plan.furniture.push({ id: 'far', asset: 'wet-bath-lid-rolled', x: 600, y: 300, rot: 0, z: 55, color: '#fff' })
    expect(captureFixtureProps(plan, tub).props.map((p) => p.id)).toEqual(['lid'])
  })
})

describe('一键布置的浴缸盖和手动吸附一致', () => {
  test('盖子都横跨压在边沿上、位置 = tubTopPose 的结果，收起的盖子在远离淋浴的那一端', () => {
    let n = 0
    const bad: string[] = []
    for (const seed of range(1, 30)) {
      const plan = genJp(seed)
      const hh = generateHousehold(plan, seed)
      plan.household = hh
      plan.furniture = decorate(plan, seed, 'auto', hh)
      for (const tub of plan.fixtures.filter((f) => f.kind === 'bathtub' && !f.shower)) {
        const lids = plan.furniture.filter((o) => /lid|caddy/.test(o.asset) && o.z === 55 && Math.abs(toLocal(tub, o).x) <= tub.w / 2 && Math.abs(toLocal(tub, o).y) <= (tub.d ?? 75) / 2)
        for (const lid of lids) {
          n++
          const tag = `seed ${seed} ${lid.asset}`
          const s = tubTopPose(tub, lid.asset, lid, lid.rot)
          if (!s || Math.hypot(s.x - lid.x, s.y - lid.y) > 0.2 || s.rot !== lid.rot) bad.push(`${tag} 和吸附结果不一致`)
          if (supportOf(plan, lid)?.fits !== true) bad.push(`${tag} 没压在边沿上`)
          const l = toLocal(tub, lid)
          const across = (lid.rot - tub.rot + 360) % 180 === 0 ? ASSET_MAP.get(lid.asset)!.d : ASSET_MAP.get(lid.asset)!.w
          const d = fixtureDepth(tub)
          if (Math.abs(l.y - (across > d ? across / 2 - d / 2 : 0)) > 0.2) bad.push(`${tag} 横向位置不对 ${l.y.toFixed(1)} d=${d} across=${across}`)
          // 收起的盖子（横跨短边）：放在 bathLid 选的那一端（淋浴在侧墙 → 另一端）
          const sp = showerSpot(plan, tub)
          if ((lid.rot - tub.rot + 360) % 180 === 90 && sp?.mode === 'side') {
            const side = Math.sign(toLocal(tub, sp.p).x)
            if (Math.sign(l.x) === side) bad.push(`${tag} 在淋浴那一端`)
          }
          if (!plan.rooms.some((r) => pointInPolygon(lid, r.points))) bad.push(`${tag} 不在房间里`)
        }
      }
    }
    expect(bad).toEqual([])
    expect(n).toBeGreaterThan(3)
  })
})

describe('浴缸盖和台面摆放检查（propClash）', () => {
  test('一键布置放在浴缸上的盖子不被当成横跨到区域外（选中框不变红）', () => {
    let n = 0
    for (const seed of range(1, 30)) {
      const plan = genJp(seed)
      plan.household = generateHousehold(plan, seed)
      plan.furniture = decorate(plan, seed, 'auto', plan.household)
      for (const f of plan.furniture) {
        if (!f.z || !/lid|ふた|furo/i.test(f.asset + (ASSET_MAP.get(f.asset)?.name ?? ''))) continue
        if (!plan.fixtures.some((x) => x.kind === 'bathtub' && pointInPolygon(f, [
          { x: x.x - x.w, y: x.y - x.w }, { x: x.x + x.w, y: x.y - x.w }, { x: x.x + x.w, y: x.y + x.w }, { x: x.x - x.w, y: x.y + x.w },
        ]))) continue
        n++
        expect(propClash(plan, f), `seed ${seed} ${f.asset}`).toBe(false)
      }
    }
    expect(n).toBeGreaterThan(0)
  })
})
