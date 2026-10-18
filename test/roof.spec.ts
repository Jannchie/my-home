// 屋顶几何：生成的户建 × 四种屋顶形式、以及手画式的复杂直角轮廓（U / T / 十字 / Z / 回字形下屋）。
// 检查：每块要盖的地方都有屋面（没有洞）、屋面不低于它盖住的墙顶（不下沉）、不超出外轮廓 + 出檐、
// 下屋不伸进上层（不穿上层外墙）、不挡上层的窗、屋面三角网没有裂缝（外缘都在屋顶边上）、
// 屋脊 / 斜脊 / 天沟不在屋面中间断头（没有多出来的一段屋脊）、山墙补墙不顶出屋面、3D 搭建不出 NaN。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { roofParts, type RoofPart } from '/src/exterior'
import { creaseLines, polyCells, roofHeightAt, roofShape, ROOF_T, type RoofInput, type RoofShape } from '/src/roof'
import { floorOutline, floorView, planFloors } from '/src/floors'
import { pointInPolygon, type Plan, type RoofKind, type Vec } from '/src/model'
import { buildRoof } from '/src/three/exterior'
import { JP_OPTS, range } from './helpers'

const KINDS: RoofKind[] = ['gable', 'hip', 'shed', 'flat']
const REGIONS = ['jp', 'west', 'cn'] as const
const SEEDS = range(1, 16)
const base = new Map(REGIONS.flatMap((region) => SEEDS.map((seed) => [`${region}/${seed}`, generatePlan({ ...JP_OPTS, seed, region, dwelling: 'house' }).plan] as const)))
const withRoof = (p: Plan, roof: RoofKind): Plan => ({ ...p, exterior: { ...p.exterior!, roof } })

interface Ctx {
  /** 本层外轮廓、上层外轮廓、上层阳台 */
  outline: Vec[]
  above: Vec[][]
  balconies: Vec[][]
  top: number
  oe: number
  upperRise?: number
}

/** 屋面三角网的外缘边（只属于一个三角形） */
function boundaryEdges(tris: number[]) {
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
  const m = new Map<string, { a: number[]; b: number[]; c: number[]; n: number }>()
  for (let k = 0; k < tris.length; k += 9)
    for (let i = 0; i < 3; i++) {
      const a = tris.slice(k + i * 3, k + i * 3 + 3)
      const b = tris.slice(k + ((i + 1) % 3) * 3, k + ((i + 1) % 3) * 3 + 3)
      const c = tris.slice(k + ((i + 2) % 3) * 3, k + ((i + 2) % 3) * 3 + 3)
      const ka = key(a[0], a[1], a[2])
      const kb = key(b[0], b[1], b[2])
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const e = m.get(ek)
      if (e) e.n++
      else m.set(ek, { a, b, c, n: 1 })
    }
  return [...m.values()]
}

/** 一块屋顶的几何问题清单 */
function problems(s: RoofShape, c: Ctx): string[] {
  const out: string[] = []
  const { tris } = s
  if (!tris.length) return ['没有屋面']
  const inAbove = (p: Vec) => c.above.some((q) => pointInPolygon(p, q))
  const inBalc = (p: Vec) => c.balconies.some((q) => pointInPolygon(p, q))
  const R = polyCells([c.outline, ...c.above, ...c.balconies], (p) => pointInPolygon(p, c.outline) && !inAbove(p) && !inBalc(p))
  // 1. 盖全、不下沉：R 里的取样点上面都有屋面，而且不低于墙顶
  let holes = 0
  let sunk = 0
  for (const r of R.rects())
    for (let x = r.x0 + 3; x < r.x1 - 2; x += 17)
      for (let y = r.y0 + 3; y < r.y1 - 2; y += 17) {
        const z = roofHeightAt(tris, { x, y })
        if (z === null) holes++
        else if (z < c.top) sunk++
      }
  if (holes) out.push(`${holes} 个取样点上面没有屋面`)
  if (sunk) out.push(`${sunk} 个取样点的屋面低于墙顶`)
  // 2. 不超出外轮廓 + 出檐；下屋不伸进上层
  const xs = c.outline.map((p) => p.x)
  const ys = c.outline.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs) - c.oe - 1, Math.max(...xs) + c.oe + 1, Math.min(...ys) - c.oe - 1, Math.max(...ys) + c.oe + 1]
  for (let k = 0; k < tris.length; k += 3)
    if (tris[k] < x0 || tris[k] > x1 || tris[k + 1] < y0 || tris[k + 1] > y1) {
      out.push(`屋面顶点超出外轮廓 + 出檐：${tris[k].toFixed(1)}, ${tris[k + 1].toFixed(1)}`)
      break
    }
  for (let k = 0; k < tris.length; k += 9) {
    const g = { x: (tris[k] + tris[k + 3] + tris[k + 6]) / 3, y: (tris[k + 1] + tris[k + 4] + tris[k + 7]) / 3 }
    if (inAbove(g)) {
      out.push(`下屋伸进了上层：${g.x.toFixed(1)}, ${g.y.toFixed(1)}`)
      break
    }
  }
  // 3. 下屋不挡上层的窗（窗台离上层地面 ≥ 80）
  if (c.upperRise !== undefined && s.kind !== 'flat') {
    let zmax = -Infinity
    for (let k = 2; k < tris.length; k += 3) zmax = Math.max(zmax, tris[k])
    if (zmax > c.upperRise + 80 + 0.5) out.push(`下屋太高（${zmax.toFixed(1)}），会挡上层的窗`)
  }
  // 4. 三角网没有裂缝：外缘边往外一点没有屋面、往里一点有
  let cracks = 0
  for (const e of boundaryEdges(tris)) {
    if (e.n !== 1) continue
    const m = { x: (e.a[0] + e.b[0]) / 2, y: (e.a[1] + e.b[1]) / 2 }
    const d = { x: e.b[0] - e.a[0], y: e.b[1] - e.a[1] }
    const L = Math.hypot(d.x, d.y)
    if (L < 1e-6) continue
    let n = { x: -d.y / L, y: d.x / L }
    if (n.x * (e.c[0] - m.x) + n.y * (e.c[1] - m.y) > 0) n = { x: -n.x, y: -n.y }
    if (roofHeightAt(tris, { x: m.x + n.x * 0.3, y: m.y + n.y * 0.3 }) !== null) cracks++
  }
  if (cracks) out.push(`屋面有 ${cracks} 条内部裂缝`)
  // 5. 折线（屋脊 / 斜脊 / 天沟）在屋面上，端点要么在屋面外缘，要么至少三条折线交在一起（不在屋面中间断头）
  if (s.kind !== 'flat' && s.kind !== 'shed') {
    const creases = creaseLines(tris)
    const k3 = (p: number[]) => `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`
    const rim = new Set(boundaryEdges(tris).filter((e) => e.n === 1).flatMap((e) => [k3(e.a), k3(e.b)]))
    const deg = new Map<string, number>()
    for (const cr of creases) for (const p of [cr.a, cr.b]) deg.set(k3(p), (deg.get(k3(p)) ?? 0) + 1)
    for (const cr of creases) {
      const mid = { x: (cr.a[0] + cr.b[0]) / 2, y: (cr.a[1] + cr.b[1]) / 2 }
      const z = roofHeightAt(tris, mid)
      if (z === null || Math.abs(z - (cr.a[2] + cr.b[2]) / 2) > 0.01) out.push(`${cr.kind} 不在屋面上`)
      for (const p of [cr.a, cr.b]) if (!rim.has(k3(p)) && (deg.get(k3(p)) ?? 0) < 3) out.push(`${cr.kind} 在屋面中间断头：${p.map((v) => v.toFixed(1)).join(', ')}`)
    }
  }
  // 6. 补墙不顶出屋面
  for (const w of s.walls)
    for (const t of [0, 0.5, 1]) {
      const p = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }
      const z = roofHeightAt(tris, p)
      const zw = w.za + (w.zb - w.za) * t
      if (z === null || zw > z - ROOF_T + 0.01) out.push(`补墙顶出屋面：${p.x.toFixed(1)}, ${p.y.toFixed(1)}`)
    }
  return out
}

function planCtx(p: Plan, r: RoofPart): Ctx {
  const fs = planFloors(p)
  const k = fs.findIndex((f) => f.id === r.floor)
  const views = fs.map((f) => floorView(p, f.id).rooms)
  const above = views.slice(k + 1).map((rs) => floorOutline(rs)).filter((o): o is Vec[] => !!o)
  return {
    outline: floorOutline(views[k])!,
    above,
    balconies: above.length ? views.slice(k + 1).flatMap((rs) => rs.filter((x) => x.kind === 'balcony').map((x) => x.points)) : [],
    top: fs[k].height,
    oe: p.wallOuter / 2 + (p.exterior!.eave ?? 45),
    upperRise: fs[k + 1] ? fs[k + 1].elevation - fs[k].elevation : undefined,
  }
}

describe.each(KINDS)('生成的户建：%s', (kind) => {
  test('盖全、不下沉、不出界、不穿上层、没有裂缝、没有断头的屋脊', () => {
    const bad: string[] = []
    for (const [name, p0] of base) {
      const p = withRoof(p0, kind)
      const parts = roofParts(p)
      if (!parts.some((r) => r.floor === planFloors(p).at(-1)!.id)) bad.push(`${name}: 最上层没有屋顶`)
      for (const r of parts) for (const m of problems(r, planCtx(p, r))) bad.push(`${name} ${r.floor}: ${m}`)
    }
    expect(bad).toEqual([])
  })
})

describe('屋顶形式', () => {
  test('双坡的矩形户型：一条屋脊、两头山墙补墙；四坡：没有补墙', () => {
    for (const [name, p0] of base) {
      const o = floorOutline(floorView(p0, planFloors(p0).at(-1)!.id).rooms)!
      if (o.length !== 4) continue
      const top = (kind: RoofKind) => roofParts(withRoof(p0, kind)).find((r) => !r.lower)!
      const g = top('gable')
      expect(creaseLines(g.tris).filter((c) => c.kind === 'ridge'), name).toHaveLength(1)
      expect(g.walls.length, name).toBeGreaterThan(0)
      expect(top('hip').walls, name).toEqual([])
    }
  })

  test('L 形的四坡：一整片屋面，屋脊都由斜脊 / 天沟收住（没有两块屋顶交叠出来的多余屋脊）', () => {
    const ls = [...base.values()].filter((p) => floorOutline(floorView(p, planFloors(p).at(-1)!.id).rooms)!.length === 6)
    expect(ls.length).toBeGreaterThan(3)
    for (const p0 of ls) {
      const r = roofParts(withRoof(p0, 'hip')).find((x) => !x.lower)!
      const cs = creaseLines(r.tris)
      expect(cs.filter((c) => c.kind === 'valley').length).toBeGreaterThan(0)
      expect(cs.filter((c) => c.kind === 'ridge').length).toBeLessThanOrEqual(2)
    }
  })

  test('3D：每块屋顶都能搭出来，没有 NaN，面数有限', () => {
    for (const kind of KINDS)
      for (const [name, p0] of [...base].slice(0, 12)) {
        const p = withRoof(p0, kind)
        for (const r of roofParts(p)) {
          const g = buildRoof(r, p.exterior!, p.wallOuter)
          let tris = 0
          g.traverse((o) => {
            const m = o as THREE.Mesh
            if (!m.isMesh || m.userData.isOutline) return
            const pos = m.geometry.getAttribute('position')
            for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error(`${name} ${kind}: NaN`)
            tris += pos.count / 3
          })
          expect(tris, `${name} ${kind}`).toBeLessThan(6000)
        }
      }
  })
})

// ---------- 手画式的复杂轮廓 ----------

const poly = (...xy: number[]): Vec[] => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] }))
const SHAPES: Record<string, Vec[]> = {
  U: poly(0, 0, 900, 0, 900, 800, 600, 800, 600, 300, 300, 300, 300, 800, 0, 800),
  T: poly(0, 0, 1000, 0, 1000, 350, 650, 350, 650, 900, 350, 900, 350, 350, 0, 350),
  plus: poly(300, 0, 600, 0, 600, 300, 900, 300, 900, 600, 600, 600, 600, 900, 300, 900, 300, 600, 0, 600, 0, 300, 300, 300),
  Z: poly(0, 0, 600, 0, 600, 300, 1000, 300, 1000, 700, 400, 700, 400, 400, 0, 400),
  bay: poly(0, 0, 400, 0, 400, -90, 640, -90, 640, 0, 1000, 0, 1000, 700, 0, 700),
  stair: poly(0, 0, 400, 0, 400, 200, 700, 200, 700, 450, 1000, 450, 1000, 800, 0, 800),
}
const inp = (kind: RoofKind, outline: Vec[], above: Vec[][] = []): RoofInput => ({ kind, outline, above, aboveBalconies: [], top: 240, upperRise: above.length ? 270 : undefined, wallOuter: 15, pitch: 0.45, eave: 45 })
const ctx = (outline: Vec[], above: Vec[][] = []): Ctx => ({ outline, above, balconies: [], top: 240, oe: 7.5 + 45, upperRise: above.length ? 270 : undefined })

describe('复杂轮廓', () => {
  test.each(Object.keys(SHAPES))('%s：四种屋顶都没有问题', (name) => {
    const bad: string[] = []
    for (const kind of KINDS) {
      const s = roofShape(inp(kind, SHAPES[name]))
      if (!s) bad.push(`${kind}: 没有屋顶`)
      else for (const m of problems(s, ctx(SHAPES[name]))) bad.push(`${kind}: ${m}`)
    }
    expect(bad).toEqual([])
  })

  const LOWER: Record<string, [Vec[], Vec[]]> = {
    回字形: [poly(0, 0, 1000, 0, 1000, 900, 0, 900), poly(200, 200, 800, 200, 800, 700, 200, 700)],
    转角: [poly(0, 0, 900, 0, 900, 800, 0, 800), poly(0, 300, 600, 300, 600, 800, 0, 800)],
    两侧: [poly(0, 0, 1200, 0, 1200, 800, 0, 800), poly(300, 0, 900, 0, 900, 800, 300, 800)],
    L形上层: [poly(0, 0, 1000, 0, 1000, 800, 0, 800), poly(0, 0, 1000, 0, 1000, 400, 500, 400, 500, 800, 0, 800)],
    单层翼: [poly(0, 0, 800, 0, 800, 300, 1400, 300, 1400, 650, 800, 650, 800, 800, 0, 800), poly(0, 0, 800, 0, 800, 800, 0, 800)],
  }
  test.each(Object.keys(LOWER))('下屋：%s', (name) => {
    const [o1, o2] = LOWER[name]
    const bad: string[] = []
    for (const kind of KINDS) {
      const s = roofShape(inp(kind, o1, [o2]))
      if (!s) bad.push(`${kind}: 没有屋顶`)
      else for (const m of problems(s, ctx(o1, [o2]))) bad.push(`${kind}: ${m}`)
    }
    expect(bad).toEqual([])
  })

  test('下屋贴着上层外墙升高：最高处在上层外墙边上', () => {
    const [o1, o2] = LOWER['两侧']
    for (const kind of ['gable', 'hip', 'shed'] as RoofKind[]) {
      const s = roofShape(inp(kind, o1, [o2]))!
      let top = -Infinity
      for (let k = 2; k < s.tris.length; k += 3) top = Math.max(top, s.tris[k])
      expect(roofHeightAt(s.tris, { x: 299, y: 400 })!, kind).toBeGreaterThan(top - 1)
      expect(roofHeightAt(s.tris, { x: 901, y: 400 })!, kind).toBeGreaterThan(top - 1)
    }
  })
})
