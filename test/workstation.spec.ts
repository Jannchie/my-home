// 电脑工位 / 屏幕摄像头 / 便签：seed 1..40 × 日式 / 中式 / 欧美
import { beforeAll, describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { dist, type Furniture, type Plan } from '/src/model'
import { fitsOnSurface, toLocal } from '/src/surface'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { pinwheelWalls } from '/src/three/kit'
import { isMonitor, isTower } from '/src/workstation'
import { JP_OPTS, range } from './helpers'

interface Case {
  tag: string
  plan: Plan
  f: Furniture[]
  people: number
}
const cases: Case[] = []
const def = (x: Furniture) => ASSET_MAP.get(x.asset)!
const DESK = /desk|书桌|电竞桌|工作台|L 形|tbl-desk/

beforeAll(() => {
  for (const region of ['jp', 'cn', 'west'] as const)
    for (const seed of range(1, 40)) {
      const plan = generatePlan({ seed, ...JP_OPTS, region }).plan
      const hh = generateHousehold(plan, seed)
      plan.household = hh
      plan.furniture = decorate(plan, seed, 'auto', hh)
      cases.push({ tag: `${region}${seed}`, plan, f: plan.furniture, people: hh.members.length })
    }
}, 600_000)

/** 主机旁边（桌上，或桌下 / 紧挨着桌子一侧）的书桌 */
function desksNear(f: Furniture[], t: Furniture) {
  return f.filter((d) => {
    const dd = def(d)
    if (d.z || !dd.surface || dd.prop || !DESK.test(`${d.asset} ${dd.name}`)) return false
    const l = toLocal(d, t)
    return Math.abs(l.x) <= dd.w / 2 + def(t).w + 4 && Math.abs(l.y) <= dd.d / 2 + 1
  })
}

describe('电脑工位', () => {
  test('每台台式主机都在一张书桌上 / 桌下，而且那张桌上有显示器', () => {
    const bad = cases.flatMap(({ tag, f }) =>
      f
        .filter((t) => isTower(def(t)))
        .flatMap((t) => {
          const desks = desksNear(f, t)
          if (!desks.length) return [`${tag}: ${t.asset} 不在书桌旁`]
          const desk = desks[0]
          const mon = desks.some((dk) => f.some((m) => isMonitor(def(m)) && Math.abs((m.z ?? 0) - (dk.z ?? 0) - def(dk).surface!) < 1 && dist(m, dk) < Math.max(def(dk).w, def(dk).d)))
          return mon ? [] : [`${tag}: ${desk.asset} 上有主机 ${t.asset} 没有显示器`]
        }),
    )
    expect(bad).toEqual([])
  })

  test('全屋台式主机不超过住户人数（每人最多一台）', () => {
    const bad = cases.filter(({ f, people }) => f.filter((t) => isTower(def(t))).length > people).map((c) => c.tag)
    expect(bad).toEqual([])
  })

  test('显示器不会单独散在书架、柜子上（都在书桌上）', () => {
    const bad = cases.flatMap(({ tag, f }) =>
      f
        .filter((m) => isMonitor(def(m)))
        .filter((m) => !f.some((d) => !d.z && !!def(d).surface && !def(d).prop && DESK.test(`${d.asset} ${def(d).name}`) && Math.abs((m.z ?? 0) - (d.z ?? 0) - def(d).surface!) < 1 && fitsOnSurface(d, m.z ?? 0, m.asset, m.x, m.y, m.rot)))
        .map((m) => `${tag}: ${m.asset}`),
    )
    expect(bad).toEqual([])
  })
})

describe('屏幕顶边的摄像头', () => {
  test('夹式 / 条形机顶摄像头都夹在显示器或电视的顶边（clip 层）上', () => {
    let n = 0
    const bad = cases.flatMap(({ tag, f }) =>
      f
        .filter((c) => def(c).screenClip)
        .flatMap((c) => {
          n++
          const on = f.find((s) => (def(s).surfaces ?? []).some((l) => l.kind === 'clip' && Math.abs((s.z ?? 0) + l.y - (c.z ?? 0)) < 0.5) && fitsOnSurface(s, c.z ?? 0, c.asset, c.x, c.y, c.rot))
          return on && def(on).screens?.length ? [] : [`${tag}: ${c.asset} 不在屏幕顶上`]
        }),
    )
    expect(bad).toEqual([])
    expect(n).toBeGreaterThan(5)
  })


  test('摄像头能放进每块屏幕的夹挂层（夹式、条形都放得下）', () => {
    for (const a of ASSETS.filter((x) => x.screens?.length)) {
      const owner: Furniture = { id: 's', asset: a.id, x: 0, y: 0, rot: 30 }
      for (const l of (a.surfaces ?? []).filter((x) => x.kind === 'clip')) {
        const poly = l.shape![0]
        const cx = poly.reduce((s, q) => s + q[0], 0) / 4
        const cz = poly.reduce((s, q) => s + q[1], 0) / 4
        const ang = (Math.atan2(poly[1][1] - poly[0][1], poly[1][0] - poly[0][0]) * 180) / Math.PI
        const p = { x: cx * Math.cos(Math.PI / 6) - cz * Math.sin(Math.PI / 6), y: cx * Math.sin(Math.PI / 6) + cz * Math.cos(Math.PI / 6) }
        expect(fitsOnSurface(owner, l.y, 'of-webcam', p.x, p.y, 30 + ang), a.id).toBe(true)
      }
    }
  })
})

describe('麻将牌墙', () => {
  test('风车形四条牌墙互不重叠', () => {
    const rect = (w: { x: number; z: number; ry: number }, L: number, th: number) => {
      const u = [Math.cos(w.ry), -Math.sin(w.ry)]
      const o = [Math.sin(w.ry), Math.cos(w.ry)]
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [w.x + (a * L * u[0]) / 2 + (b * th * o[0]) / 2, w.z + (a * L * u[1]) / 2 + (b * th * o[1]) / 2])
    }
    const separated = (A: number[][], B: number[][]) =>
      [A, B].some((P) =>
        P.some((p, i) => {
          const q = P[(i + 1) % 4]
          const n = [q[1] - p[1], p[0] - q[0]]
          const pa = A.map((v) => v[0] * n[0] + v[1] * n[1])
          const pb = B.map((v) => v[0] * n[0] + v[1] * n[1])
          return Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)
        }),
      )
    for (const L of [33.8, 39, 44.2])
      for (let seed = 0; seed < 200; seed++) {
        const r = pinwheelWalls(L, 3.5, seed).map((w) => rect(w, L, 3.5))
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(separated(r[i], r[j]), `L=${L} seed=${seed}`).toBe(true)
      }
  })
})
