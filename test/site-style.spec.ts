// 用地 / 外观样式：围挡款式、颜色、高度，车型、车色，外观字段的读档校验和分享链接往返。
// 旧存档（不带新字段）搭出来的几何必须和改动前一模一样：用几何签名（网格数、顶点、包围盒、颜色）比对。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { CAR_KINDS, FENCE_HEIGHT_MAX, FENCE_KINDS, FENCE_STYLE, type CarKind, type FenceKind, type Site } from '/src/model'
import { buildSite, carModel } from '/src/three/exterior'
import { BASE } from '/src/three/house'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare } from '/src/share'
import { generatePlan } from '/src/generate-region'
import { JP_OPTS } from './helpers'

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

const baseSite = (fence: Site['fence']): Site => ({
  points: rect(-200, -400, 1200, 1300),
  fence,
  gates: [[{ x: 300, y: 1300 }, { x: 420, y: 1300 }]],
  paths: [rect(300, 1000, 420, 1300)],
  parking: [{ points: rect(600, 800, 850, 1300), rot: 0, car: true, carColor: '#3b5b8c' }],
})

/** 几何签名：每个网格的顶点数、世界包围盒、材质颜色，排序后拼成字符串再求个短哈希 */
function geoSig(g: THREE.Object3D) {
  g.updateMatrixWorld(true)
  const rows: string[] = []
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const box = new THREE.Box3().setFromObject(m)
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshToonMaterial[]
    const r = (v: number) => Math.round(v * 10) / 10
    rows.push([m.geometry.attributes.position.count, r(box.min.x), r(box.min.y), r(box.min.z), r(box.max.x), r(box.max.y), r(box.max.z), mats.map((x) => x.color?.getHexString() ?? '-').join('/'), m.visible ? 1 : 0].join(','))
  })
  rows.sort()
  let h = 2166136261
  for (const c of rows.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return `${rows.length}:${h.toString(16)}`
}

describe('用地样式：旧存档几何不变', () => {
  test('签名', () => {
    const out = Object.fromEntries((['hedge', 'fence', 'wall', 'none'] as const).map((k) => [k, geoSig(buildSite(baseSite(k)))]))
    // 改动前的代码搭出来的签名
    expect(out).toEqual({ hedge: '29:6742d637', fence: '31:6f5174df', wall: '31:fff8eb7d', none: '27:f56958fc' })
  })

  test('显式写上缺省值和不写一样', () => {
    for (const k of ['hedge', 'fence', 'wall'] as const) {
      const s = { ...baseSite(k), fenceHeight: FENCE_STYLE[k].height }
      s.parking = [{ ...s.parking[0], carKind: 'compact' }]
      expect(geoSig(buildSite(s))).toBe(geoSig(buildSite(baseSite(k))))
    }
  })
})

/** 围挡组（userData.sitePick.kind === 'fence'）的世界包围盒 */
function fenceBox(g: THREE.Object3D) {
  g.updateMatrixWorld(true)
  let f: THREE.Object3D | undefined
  g.traverse((o) => {
    if (o.userData.sitePick?.kind === 'fence') f = o
  })
  return new THREE.Box3().setFromObject(f!)
}

describe('用地样式：每种选项都能搭', () => {
  const kinds = Object.keys(FENCE_KINDS) as FenceKind[]
  test.each(kinds)('围挡 %s：缺省 / 改色 / 改高', (k) => {
    const g = buildSite(baseSite(k))
    const box = fenceBox(g)
    if (k === 'none') {
      expect(box.isEmpty()).toBe(true)
      return
    }
    // 高度大致等于缺省高度（砖柱、压顶略高一点）
    const h0 = box.max.y - BASE
    expect(h0).toBeGreaterThanOrEqual(FENCE_STYLE[k].height - 1)
    expect(h0).toBeLessThan(FENCE_STYLE[k].height + 12)
    // 围挡在用地里面（往里收，不出界；木栅栏是旧款，端点的柱子压在边界上，出去半根柱子）
    const tol = k === 'fence' ? 5 : 1
    expect(box.min.x).toBeGreaterThanOrEqual(-200 - tol)
    expect(box.max.x).toBeLessThanOrEqual(1200 + tol)
    expect(box.min.z).toBeGreaterThanOrEqual(-400 - tol)
    expect(box.max.z).toBeLessThanOrEqual(1300 + tol)
    const tall = fenceBox(buildSite({ ...baseSite(k), fenceHeight: 180 }))
    expect(tall.max.y - BASE).toBeGreaterThanOrEqual(179)
    const sig = geoSig(buildSite({ ...baseSite(k), fenceColor: '#123456' }))
    expect(sig).not.toBe(geoSig(g))
  })

  test.each(Object.keys(CAR_KINDS) as CarKind[])('车型 %s', (k) => {
    const car = carModel('#336699', k)
    const box = new THREE.Box3().setFromObject(car)
    const size = box.getSize(new THREE.Vector3())
    expect(size.z).toBeGreaterThan(300)
    expect(size.z).toBeLessThan(500)
    expect(size.x).toBeLessThan(200)
    expect(Math.abs(box.min.y)).toBeLessThan(1)
    const s = baseSite('none')
    s.parking = [{ ...s.parking[0], carKind: k }]
    let picked = 0
    buildSite(s).traverse((o) => {
      if (o.userData.sitePick?.kind === 'car') picked++
    })
    expect(picked).toBe(1)
  })

  test('车型不同，外形不同', () => {
    const sigs = (Object.keys(CAR_KINDS) as CarKind[]).map((k) => geoSig(carModel('#336699', k)))
    expect(new Set(sigs).size).toBe(sigs.length)
  })
})

describe('读档校验 / 分享链接', () => {
  const house = () => normalizePlan(JSON.parse(JSON.stringify(generatePlan({ ...JP_OPTS, seed: 5, region: 'jp', dwelling: 'house' }).plan)))!

  test('新字段读档保留，坏值整理掉', () => {
    const p = house()
    p.site!.fence = 'louver'
    p.site!.fenceColor = '#334455'
    p.site!.fenceHeight = 150
    p.site!.parking[0].carKind = 'suv'
    p.exterior!.porch = 'porch'
    const n = normalizePlan(JSON.parse(JSON.stringify(p)))!
    expect(n.site!.fence).toBe('louver')
    expect(n.site!.fenceColor).toBe('#334455')
    expect(n.site!.fenceHeight).toBe(150)
    expect(n.site!.parking[0].carKind).toBe('suv')
    expect(n.exterior!.porch).toBe('porch')

    const bad = JSON.parse(JSON.stringify(p))
    bad.site.fence = 'moat'
    bad.site.fenceColor = 'red'
    bad.site.fenceHeight = 9999
    bad.site.parking[0].carKind = 'tank'
    bad.exterior.porch = 'tower'
    const m = normalizePlan(bad)!
    expect(m.site!.fence).toBe('none')
    expect(m.site!.fenceColor).toBeUndefined()
    expect(m.site!.fenceHeight).toBe(FENCE_HEIGHT_MAX)
    expect(m.site!.parking[0].carKind).toBeUndefined()
    expect(m.exterior!.porch).toBeUndefined()
  })

  test('旧存档（没有新字段）读档后也不多出字段', () => {
    const p = house()
    expect(p.site!.fenceColor).toBeUndefined()
    expect(p.site!.fenceHeight).toBeUndefined()
    expect(p.site!.parking.every((s) => s.carKind === undefined)).toBe(true)
  })

  test('分享链接往返带上围挡 / 车型 / 外观', async () => {
    const p = house()
    p.site!.fence = 'brick'
    p.site!.fenceColor = '#8f5a4a'
    p.site!.fenceHeight = 130
    p.site!.parking[0] = { ...p.site!.parking[0], car: true, carKind: 'minivan', carColor: '#f2f2f2' }
    p.exterior = { ...p.exterior!, roof: 'hip', roofColor: '#6b4a3c', facade: 'brick', wallColor: '#b5654c', trimColor: '#222222', pitch: 0.6, eave: 30, porch: 'none' }
    for (const mode of ['plan', 'full'] as const) {
      const r = await decodeShare(await encodeShare(p, mode))
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.plan.site).toEqual(p.site)
      expect(r.plan.exterior).toEqual(p.exterior)
    }
    // 去掉车
    p.site!.parking[0] = { points: p.site!.parking[0].points, rot: p.site!.parking[0].rot }
    const r = await decodeShare(await encodeShare(p, 'plan'))
    expect(r.ok && r.plan.site!.parking[0].car).toBeFalsy()
  })
})
