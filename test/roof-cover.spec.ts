// 屋面材料：每种材料 × 每种屋顶都搭得出来（没有 NaN、面数有限、对不上的按素面），瓦面的 UV 跟着坡向走
// （u 沿檐口、v 沿流水线往上，相邻坡面同一高度的瓦行对齐），读档校验、分享往返，新生成的户建按地区写上缺省材料，
// 旧存档（没有 roofCover）搭出来和以前一样。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { roofParts } from '/src/exterior'
import { roofShape, type RoofInput } from '/src/roof'
import { ROOF_COVERS, type Plan, type RoofCover, type RoofKind, type Vec } from '/src/model'
import { COVER_SPECS, FLAT_COVERS, PITCHED_COVERS, activeCover, coverFits, coverHeight, coverSheet, defaultRoofCover, slopeFrame } from '/src/roofCover'
import { buildRoof } from '/src/three/exterior'
import { previewKey, previewObject } from '/src/three/siteThumbs'
import { coverChoice, coverChoices } from '/src/siteEdit'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare } from '/src/share'
import { JP_OPTS, range } from './helpers'

const KINDS: RoofKind[] = ['gable', 'hip', 'shed', 'flat']
const COVERS = Object.keys(ROOF_COVERS) as RoofCover[]
const house = (seed: number, region: 'jp' | 'west' | 'cn' = 'jp') => generatePlan({ ...JP_OPTS, seed, region, dwelling: 'house' }).plan

/** 一组的统计：三角面数、有没有 NaN、用了瓦面材质（带贴图）的网格数 */
function stats(g: THREE.Object3D) {
  let tris = 0
  let sheets = 0
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.isOutline) return
    const pos = m.geometry.getAttribute('position')
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error('NaN')
    const n = m.geometry.getAttribute('normal')
    if (n) for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) throw new Error('NaN normal')
    tris += pos.count / 3
    if (m.userData.roofCover) sheets++
  })
  return { tris, sheets }
}

describe('搭建', () => {
  const plans = [...range(1, 6).map((s) => house(s, 'jp')), ...range(1, 3).map((s) => house(s, 'west')), ...range(1, 3).map((s) => house(s, 'cn'))]

  test('每种材料 × 每种屋顶：搭得出来、面数有限；对得上的才铺瓦面', () => {
    for (const roof of KINDS)
      for (const cover of COVERS)
        for (const p0 of plans) {
          const p: Plan = { ...p0, exterior: { ...p0.exterior!, roof, roofCover: cover } }
          for (const part of roofParts(p)) {
            const { tris, sheets } = stats(buildRoof(part, p.exterior!, p.wallOuter))
            expect(tris, `${roof} ${cover}`).toBeLessThan(15000)
            expect(sheets > 0, `${roof} ${cover}`).toBe(coverFits(cover, roof))
          }
        }
  })

  const poly = (...xy: number[]): Vec[] => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] }))
  const L = poly(0, 0, 1000, 0, 1000, 400, 500, 400, 500, 900, 0, 900)
  const inp = (kind: RoofKind): RoofInput => ({ kind, outline: L, above: [], aboveBalconies: [], top: 240, wallOuter: 15, pitch: 0.45, eave: 45 })

  test('L 形：瓦面盖满整个屋面（投影面积一致），瓦面整体在屋面之上、不超过截面高度', () => {
    for (const kind of ['gable', 'hip', 'shed'] as RoofKind[]) {
      const s = roofShape(inp(kind))!
      let zE = Infinity
      for (let k = 2; k < s.tris.length; k += 3) zE = Math.min(zE, s.tris[k])
      const planArea = (t: number[]) => {
        let a = 0
        for (let k = 0; k < t.length; k += 9) a += Math.abs((t[k + 3] - t[k]) * (t[k + 7] - t[k + 1]) - (t[k + 6] - t[k]) * (t[k + 4] - t[k + 1])) / 2
        return a
      }
      for (const cover of PITCHED_COVERS) {
        const sh = coverSheet(s.tris, cover, zE)
        expect(planArea(sh.pos) / planArea(s.tris), `${kind} ${cover}`).toBeCloseTo(1, 4)
        // 每个顶点在屋面上方 lift .. (lift + 截面高) / cos
        const cos = 1 / Math.hypot(1, s.pitch)
        for (let k = 0; k < sh.pos.length; k += 3) {
          const p = { x: sh.pos[k], y: sh.pos[k + 1] }
          let z0: number | null = null
          for (let t = 0; t < s.tris.length && z0 === null; t += 9) {
            const [x0, y0, a0, x1, y1, a1, x2, y2, a2] = s.tris.slice(t, t + 9)
            const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            const l0 = ((y1 - y2) * (p.x - x2) + (x2 - x1) * (p.y - y2)) / d
            const l1 = ((y2 - y0) * (p.x - x2) + (x0 - x2) * (p.y - y2)) / d
            const l2 = 1 - l0 - l1
            if (l0 > -1e-6 && l1 > -1e-6 && l2 > -1e-6) z0 = l0 * a0 + l1 * a1 + l2 * a2
          }
          expect(z0).not.toBeNull()
          const dz = sh.pos[k + 2] - z0!
          expect(dz).toBeGreaterThan(COVER_SPECS[cover].lift * 0.99)
          expect(dz).toBeLessThan(coverHeight(cover) / cos + 0.01)
        }
        // 瓦头：只在外缘（檐口、山墙边），竖直
        for (let k = 0; k < sh.edgeNrm.length; k += 3) expect(Math.abs(sh.edgeNrm[k + 2])).toBeLessThan(1e-9)
        expect(sh.edgePos.length).toBeGreaterThan(0)
      }
    }
  })

  test('脊瓦：四坡的屋脊、斜脊都有，和瓦的双坡在山墙端有鬼瓦', () => {
    const p0 = house(2)
    for (const roof of ['gable', 'hip'] as RoofKind[]) {
      const p: Plan = { ...p0, exterior: { ...p0.exterior!, roof, roofCover: 'kawara' } }
      const part = roofParts(p).find((x) => !x.lower && x.creases.length)!
      const g = buildRoof(part, p.exterior!, p.wallOuter)
      const box = new THREE.Box3().setFromObject(g)
      let top = -Infinity
      for (let k = 2; k < part.tris.length; k += 3) top = Math.max(top, part.tris[k])
      // 冠瓦顶在屋脊上方 瓦面高 + 7 + 8 左右
      expect(box.max.y).toBeGreaterThan(top + coverHeight('kawara') + 12)
    }
  })

  test('预览图：每种材料的预览房子都搭得出来，缓存键带材料', () => {
    const ex = house(1).exterior!
    const keys = new Set<string>()
    for (const roof of KINDS)
      for (const k of coverChoices(roof)) {
        const e = { ...ex, roof, roofCover: k === 'plain' ? undefined : k }
        const spec = { t: 'house' as const, focus: 'cover' as const, ex: e }
        keys.add(previewKey(spec))
        expect(stats(previewObject(spec)).tris).toBeGreaterThan(0)
      }
    expect(keys.size).toBe(KINDS.reduce((s, r) => s + coverChoices(r).length, 0))
  })
})

describe('UV 跟着坡向', () => {
  test('单个坡面：v 沿流水线往上（每 cm 斜长 1 / texH），u 沿檐口，流水线方向上 u 不变', () => {
    // 朝南（+y）下坡的双坡一侧：z = 300 - 0.5·(y - 0)，y 从 0 到 400
    const tri = [0, 0, 300, 600, 0, 300, 600, 400, 100, 0, 0, 300, 600, 400, 100, 0, 400, 100]
    for (const cover of PITCHED_COVERS) {
      const sh = coverSheet(tri, cover, 100)
      const spec = COVER_SPECS[cover]
      const slope = Math.hypot(1, 0.5) // sin(坡角) = 0.5 / slope
      for (let k = 0, t = 0; k < sh.pos.length; k += 3, t += 2) {
        const [x, y] = [sh.pos[k], sh.pos[k + 1]]
        const zPlane = 300 - 0.5 * y
        // v = 从檐口往上量的斜长
        expect(sh.uv[t + 1] * spec.texH).toBeCloseTo((zPlane - 100) / (0.5 / slope), 3)
        // u 只和 x 有关（坡向朝 ±y，檐口沿 x）
        expect(Math.abs(sh.uv[t] * spec.texW)).toBeCloseTo(Math.abs(x), 3)
      }
    }
  })

  test('坡向：檐口方向 U 垂直于下坡方向，下坡方向是法线的水平分量', () => {
    const f = slopeFrame([0, 0, 300], [600, 0, 300], [600, 400, 100])!
    expect(f.flat).toBe(false)
    if (f.flat) return
    expect(f.down.x).toBeCloseTo(0)
    expect(f.down.y).toBeCloseTo(1)
    expect(Math.abs(f.U.x)).toBeCloseTo(1)
    expect(f.sin).toBeCloseTo(0.5 / Math.hypot(1, 0.5))
  })

  test('四坡：斜脊两侧的坡面在同一高度上 v 相同（瓦行在斜脊上对齐），檐口 v = 0', () => {
    const s = roofShape({ kind: 'hip', outline: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }], above: [], aboveBalconies: [], top: 240, wallOuter: 15, pitch: 0.45, eave: 45 })!
    let zE = Infinity
    for (let k = 2; k < s.tris.length; k += 3) zE = Math.min(zE, s.tris[k])
    for (const cover of ['shingle', 'kawara'] as RoofCover[]) {
      const sh = coverSheet(s.tris, cover, zE)
      const spec = COVER_SPECS[cover]
      const byPoint = new Map<string, Set<string>>()
      // 屋面上同一点（按平面坐标）在不同坡面上的 v
      for (let k = 0, t = 0; k < sh.pos.length; k += 3, t += 2) {
        const key = `${sh.pos[k].toFixed(2)},${sh.pos[k + 1].toFixed(2)}`
        let set = byPoint.get(key)
        if (!set) byPoint.set(key, (set = new Set()))
        set.add((sh.uv[t + 1] * spec.texH).toFixed(2))
      }
      let shared = 0
      for (const set of byPoint.values()) {
        expect(set.size).toBe(1)
        shared++
      }
      expect(shared).toBeGreaterThan(4)
      // 檐口（最低处）的 v 是 0
      let minV = Infinity
      for (let t = 1; t < sh.uv.length; t += 2) minV = Math.min(minV, sh.uv[t])
      expect(minV).toBeCloseTo(0, 5)
    }
  })

  test('和瓦 / 金属板的截面：法线朝上、单位长度；平屋顶材料按平面取 UV', () => {
    const tri = [0, 0, 300, 600, 0, 300, 600, 400, 100]
    for (const cover of ['kawara', 'spanish', 'metal'] as RoofCover[]) {
      const sh = coverSheet(tri, cover, 100)
      for (let k = 0; k < sh.nrm.length; k += 3) {
        expect(Math.hypot(sh.nrm[k], sh.nrm[k + 1], sh.nrm[k + 2])).toBeCloseTo(1, 5)
        expect(sh.nrm[k + 2]).toBeGreaterThan(cover === 'metal' ? 0.1 : 0.3)
      }
      // 起伏：瓦面的高度不全一样（同一条流水线上的点高度差是坡度造成的，横向才有截面）
      const lifts = new Set<string>()
      for (let k = 0; k < sh.pos.length; k += 3) lifts.add((sh.pos[k + 2] - (300 - 0.5 * sh.pos[k + 1])).toFixed(1))
      expect(lifts.size).toBeGreaterThan(cover === 'metal' ? 1 : 3)
    }
    const flat = [0, 0, 300, 500, 0, 300, 500, 500, 300]
    for (const cover of FLAT_COVERS) {
      const sh = coverSheet(flat, cover, 300)
      const spec = COVER_SPECS[cover]
      for (let k = 0, t = 0; k < sh.pos.length; k += 3, t += 2) {
        expect(sh.uv[t] * spec.texW).toBeCloseTo(sh.pos[k], 4)
        expect(sh.pos[k + 2]).toBeCloseTo(300 + spec.lift, 5)
      }
    }
  })
})

describe('数据', () => {
  test('对不上的材料按素面：平屋顶配瓦、坡屋顶配碎石', () => {
    expect(activeCover({ roof: 'flat', roofCover: 'kawara' })).toBeNull()
    expect(activeCover({ roof: 'gable', roofCover: 'gravel' })).toBeNull()
    expect(activeCover({ roof: 'hip', roofCover: 'slate' })).toBe('slate')
    expect(activeCover({ roof: 'hip' })).toBeNull()
    expect(coverChoice({ roof: 'flat', roofCover: 'kawara' })).toBe('plain')
    expect(coverChoices('flat')).toEqual(['plain', ...FLAT_COVERS])
    expect(coverChoices('shed')).toEqual(['plain', ...PITCHED_COVERS])
  })

  test('缺省材料：每个地区、每种屋顶给的都对得上', () => {
    for (const region of ['jp', 'west', 'cn'] as const)
      for (const roof of KINDS)
        for (let h = 0; h < 1; h += 0.05) expect(coverFits(defaultRoofCover(region, roof, h), roof), `${region} ${roof} ${h}`).toBe(true)
    expect(defaultRoofCover('jp', 'shed', 0.5)).toBe('metal')
    expect(defaultRoofCover('west', 'gable', 0.1)).toBe('shingle')
  })

  test('新生成的户建写上按地区的材料（日式有和瓦和石板瓦，欧美多是沥青瓦）', () => {
    const got: Record<string, RoofCover[]> = { jp: [], west: [], cn: [] }
    for (const region of ['jp', 'west', 'cn'] as const)
      for (const seed of range(1, 14)) {
        const ex = house(seed, region).exterior!
        expect(ex.roofCover, `${region}/${seed}`).toBeDefined()
        expect(coverFits(ex.roofCover!, ex.roof)).toBe(true)
        got[region].push(ex.roofCover!)
      }
    expect(got.jp).toContain('slate')
    expect(got.jp.some((c) => c === 'kawara' || c === 'metal')).toBe(true)
    expect(got.west.filter((c) => c === 'shingle').length).toBeGreaterThan(got.west.length / 3)
    expect(got.cn.some((c) => c === 'cement' || c === 'spanish')).toBe(true)
  })

  test('读档：合法的保留，乱写的丢掉，旧存档不多出字段', () => {
    const p = house(3)
    p.exterior!.roofCover = 'spanish'
    expect(normalizePlan(JSON.parse(JSON.stringify(p))).exterior!.roofCover).toBe('spanish')
    const bad = JSON.parse(JSON.stringify(p))
    bad.exterior.roofCover = 'thatch'
    expect(normalizePlan(bad).exterior!.roofCover).toBeUndefined()
    const proto = JSON.parse(JSON.stringify(p))
    proto.exterior.roofCover = 'toString'
    expect(normalizePlan(proto).exterior!.roofCover).toBeUndefined()
    const old = JSON.parse(JSON.stringify(p))
    delete old.exterior.roofCover
    expect('roofCover' in normalizePlan(old).exterior!).toBe(false)
  })

  test('分享链接往返带上屋面材料', async () => {
    for (const cover of ['kawara', 'green'] as RoofCover[]) {
      const p = house(4)
      p.exterior = { ...p.exterior!, roof: cover === 'green' ? 'flat' : 'gable', roofCover: cover }
      for (const mode of ['plan', 'full'] as const) {
        const r = await decodeShare(await encodeShare(p, mode))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.plan.exterior).toEqual(p.exterior)
      }
    }
  })

  test('没有 roofCover 的屋顶和素面一样：不多出瓦面、脊瓦', () => {
    const p0 = house(5)
    const ex = { ...p0.exterior! }
    delete ex.roofCover
    for (const roof of KINDS) {
      const p: Plan = { ...p0, exterior: { ...ex, roof } }
      const q: Plan = { ...p0, exterior: { ...ex, roof, roofCover: roof === 'flat' ? 'kawara' : 'gravel' } }
      for (const [a, b] of roofParts(p).map((part, i) => [part, roofParts(q)[i]] as const)) {
        const sa = stats(buildRoof(a, p.exterior!, p.wallOuter))
        const sb = stats(buildRoof(b, q.exterior!, q.wallOuter))
        expect(sa).toEqual(sb)
        expect(sa.sheets).toBe(0)
      }
    }
  })
})
