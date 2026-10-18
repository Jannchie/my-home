// 外观视图（沙盘按 O）：每种户型都有屋顶（没有外观设定的现推缺省屋顶，不写进户型）、屋顶坐在墙顶上；
// 内墙不穿出外墙内皮、顶面在屋面底下且不和屋面底共面；墙纸 / 边饰 / 外墙面不用随倾斜放大的 polygonOffset；
// 上层阳台挑出去的部分有支柱，柱脚落在下层屋面 / 阳台 / 地面上（不悬空、不穿过屋面）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { roofExterior, roofParts, type RoofPart } from '/src/exterior'
import { CLEAR, ROOF_T, roofHeightAt } from '/src/roof'
import { floorOutline, floorView, planFloors, SLAB } from '/src/floors'
import { onBoundary, pointInPolygon, type Plan, type RoofKind, type Vec } from '/src/model'
import { buildBuilding, type FloorGroup } from '/src/three/building'
import { balconyPosts, POST } from '/src/three/exterior'
import { BASE } from '/src/three/house'
import { JP_OPTS, range } from './helpers'

const REGIONS = ['jp', 'cn', 'west'] as const
const DWELLINGS = ['apartment', 'house', 'duplex'] as const
const gen = (region: (typeof REGIONS)[number], dwelling: (typeof DWELLINGS)[number], seed: number) => generatePlan({ ...JP_OPTS, seed, region, dwelling }).plan
/** 各地区能生成的住宅类型 × 几个种子 */
const PLANS: [string, Plan][] = REGIONS.flatMap((region) =>
  DWELLINGS.filter((d) => region !== 'west' || d !== 'duplex').flatMap((d) => range(1, 4).map((seed) => [`${region}/${d}/${seed}`, gen(region, d, seed)] as [string, Plan])),
)

const solidMeshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = []
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh && !c.userData.isOutline) out.push(c as THREE.Mesh)
  })
  return out
}
/** 网格的顶点（换到楼层组的局部坐标：x, y = 平面，z = 离本层地面的高度） */
function localVerts(m: THREE.Mesh, fg: FloorGroup): { x: number; y: number; z: number }[] {
  fg.group.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(fg.group.matrixWorld).invert()
  const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)
  const pos = m.geometry.getAttribute('position')
  const v = new THREE.Vector3()
  const out: { x: number; y: number; z: number }[] = []
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw)
    out.push({ x: v.x, y: v.z, z: v.y })
  }
  return out
}
/** 内墙的墙块（墙压低 / 透明的那套标记：fade.outer = false 且带 wall 信息） */
const innerWalls = (fg: FloorGroup) => solidMeshes(fg.group).filter((m) => m.userData.wall && (m.userData.fade as { outer?: boolean } | undefined)?.outer === false && !inRoof(m))
const inRoof = (o: THREE.Object3D) => {
  for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.userData.roof) return true
  return false
}
/** 点到多边形边界的距离 */
function edgeDist(poly: Vec[], p: Vec) {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2)) : 0
    d = Math.min(d, Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y)))
  }
  return d
}
/** 屋面底的高度（本层局部坐标）；p 不在这块屋顶下面返回 null */
function undersideAt(r: RoofPart, p: Vec): number | null {
  const z = roofHeightAt(r.tris, p)
  if (z === null) return null
  return r.flat ? r.flat.slabBottom : z - ROOF_T
}

describe('外观视图的屋顶', () => {
  test('每种生成的户型都有屋顶（最上层盖满），没有外观设定的现推缺省屋顶、不写进户型', () => {
    const bad: string[] = []
    for (const [name, plan] of PLANS) {
      const before = JSON.stringify(plan)
      const { floors } = buildBuilding(plan, 240, undefined, { defaultRoof: true })
      const top = floors.at(-1)!
      if (!top.roof || !solidMeshes(top.roof).length) bad.push(`${name}: 最上层没有屋顶`)
      if (!plan.exterior && top.roof && !top.roof.userData.derived) bad.push(`${name}: 缺省屋顶没有标成 derived`)
      if (JSON.stringify(plan) !== before) bad.push(`${name}: 搭建改了户型数据`)
    }
    expect(bad).toEqual([])
  })

  test('缺省屋顶按住宅类型：有用地的四坡，其余（公寓 / 复式）平屋顶带女儿墙', () => {
    const apt = gen('jp', 'apartment', 1)
    expect(apt.exterior).toBeUndefined()
    expect(roofExterior(apt).roof).toBe('flat')
    expect(roofParts(apt).every((r) => r.flat && r.flat.parapet.length > 0)).toBe(true)
    const house = gen('jp', 'house', 1)
    expect(roofExterior({ site: house.site })).toMatchObject({ roof: 'hip' })
    expect(roofExterior(house)).toBe(house.exterior)
  })

  test('不要缺省屋顶时（缩略图、设计图）没有外观设定的户型照旧没有屋顶', () => {
    const { floors } = buildBuilding(gen('jp', 'apartment', 2), 240)
    expect(floors.some((f) => f.roof)).toBe(false)
  })

  test('屋顶坐在实际的墙顶上：层高和外观视图的墙高不一样时也是', () => {
    const p = gen('jp', 'apartment', 3)
    p.floors = [{ id: 'f1', name: '1F', elevation: 0, height: 265 }]
    for (const r of p.rooms) r.floor = 'f1'
    const { floors } = buildBuilding(p, 240, undefined, { defaultRoof: true })
    const box = new THREE.Box3().setFromObject(floors[0].roof!)
    // 平屋顶：女儿墙从墙顶往下 1 坐在外墙上，屋面板底在墙顶上方 CLEAR
    expect(box.min.y).toBeCloseTo(239, 1)
    for (const r of roofParts(p, roofExterior(p), () => 240)) {
      expect(r.top).toBe(240)
      expect(r.flat!.slabBottom).toBeCloseTo(240 + CLEAR, 5)
    }
  })
})

describe('内墙不穿模', () => {
  const KINDS: RoofKind[] = ['gable', 'hip', 'shed', 'flat']
  /** 生成的户建换成四种屋顶，加上公寓 / 复式的缺省屋顶 */
  const cases: [string, Plan][] = [
    ...PLANS.filter(([n]) => !n.includes('/house/')),
    ...REGIONS.flatMap((region) => range(1, 5).flatMap((seed) => KINDS.map((k) => [`${region}/house/${seed}/${k}`, (() => {
      const p = gen(region, 'house', seed)
      return { ...p, exterior: { ...p.exterior!, roof: k } }
    })()] as [string, Plan]))),
  ]

  test('内墙在外墙内皮以内、顶面在屋面底下（取样所有顶点）', () => {
    const bad: string[] = []
    for (const [name, plan] of cases) {
      const parts = roofParts(plan)
      const { floors } = buildBuilding(plan, 240, undefined, { defaultRoof: true })
      for (const fg of floors) {
        const outline = floorOutline(floorView(plan, fg.floor.id).rooms)
        if (!outline) continue
        const mine = parts.filter((r) => r.floor === fg.floor.id)
        let out = 0
        let poke = 0
        let worst = ''
        for (const m of innerWalls(fg))
          for (const v of localVerts(m, fg)) {
            // 外墙内皮：外轮廓（墙中心线）往里半个外墙厚；内墙端头嵌进外墙 0.05
            const inside = pointInPolygon(v, outline) && !onBoundary(outline, v, 0.01)
            if (!inside || edgeDist(outline, v) < plan.wallOuter / 2 - 0.1) out++
            for (const r of mine) {
              const u = undersideAt(r, v)
              if (u !== null && v.z > u - CLEAR / 2) {
                poke++
                worst = `${v.x.toFixed(1)},${v.y.toFixed(1)} 墙顶 ${v.z.toFixed(1)} 屋面底 ${u.toFixed(1)}`
              }
            }
          }
        if (out) bad.push(`${name} ${fg.floor.id}: ${out} 个内墙顶点在外墙内皮外`)
        if (poke) bad.push(`${name} ${fg.floor.id}: ${poke} 个内墙顶点伸进屋面底（${worst}）`)
      }
    }
    expect(bad).toEqual([])
  })

  test('屋面朝下的水平面不和内墙顶面共面', () => {
    const bad: string[] = []
    for (const [name, plan] of cases) {
      const { floors } = buildBuilding(plan, 240, undefined, { defaultRoof: true })
      for (const fg of floors) {
        if (!fg.roof) continue
        const tops = new Set<number>()
        for (const m of innerWalls(fg)) for (const v of localVerts(m, fg)) tops.add(Math.round(v.z * 100) / 100)
        const wallTop = Math.max(...tops)
        if (!Number.isFinite(wallTop)) continue
        const n = new THREE.Vector3()
        for (const m of solidMeshes(fg.roof)) {
          const vs = localVerts(m, fg)
          const idx = m.geometry.getIndex()
          const tri = (k: number) => (idx ? idx.getX(k) : k)
          const count = idx ? idx.count : vs.length
          for (let k = 0; k + 2 < count; k += 3) {
            const [a, b, c] = [vs[tri(k)], vs[tri(k + 1)], vs[tri(k + 2)]]
            // 法线（three 坐标：x, 高度, 平面 y）
            n.crossVectors(new THREE.Vector3(b.x - a.x, b.z - a.z, b.y - a.y), new THREE.Vector3(c.x - a.x, c.z - a.z, c.y - a.y)).normalize()
            if (n.y > -0.99) continue
            if (Math.abs(a.z - wallTop) < 0.1) {
              bad.push(`${name} ${fg.floor.id}: 屋面底 ${a.z.toFixed(2)} 和内墙顶 ${wallTop} 共面`)
              break
            }
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  test('墙纸、边饰、外墙面不用 polygonOffset（掠射角下偏移没有上限，会被拉到外墙 / 屋面前面）', () => {
    const p = gen('jp', 'house', 1)
    for (const r of p.rooms) if (r.kind !== 'balcony') r.wallpaper = { color: '#ff00ff', trim: { crown: { h: 6, color: '#00ff00' }, base: { h: 8, color: '#00ff00' }, wainscot: { h: 90, color: '#00ff00', kind: 'plain' } } }
    const { root } = buildBuilding(p, 240)
    const offset: string[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat.polygonOffset && mat.polygonOffsetFactor !== 0) offset.push(mat.type)
    })
    expect(offset).toEqual([])
  })
})

// ---------- 阳台支柱 ----------

const rect = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
/** 三层退台：1F 宽、2F / 3F 窄，3F 的阳台挑出 2F 外墙，正下方是 1F 的下屋 */
function terraced(roof: RoofKind): Plan {
  const p = gen('jp', 'house', 1)
  return {
    ...p,
    rooms: [
      { id: 'a', name: 'A', kind: 'western', points: rect(0, 0, 1000, 800), floor: '1f' },
      { id: 'b', name: 'B', kind: 'western', points: rect(0, 0, 600, 800), floor: '2f' },
      { id: 'c', name: 'C', kind: 'western', points: rect(0, 0, 600, 800), floor: '3f' },
      { id: 'd', name: 'D', kind: 'balcony', railing: 'bars', points: rect(600, 200, 760, 600), floor: '3f' },
    ],
    openings: [],
    fixtures: [],
    furniture: [],
    floors: [
      { id: '1f', name: '1F', elevation: 0, height: 240 },
      { id: '2f', name: '2F', elevation: 240 + SLAB, height: 240 },
      { id: '3f', name: '3F', elevation: 2 * (240 + SLAB), height: 240 },
    ],
    exterior: { ...p.exterior!, roof },
  }
}

/** 支柱柱脚处承托面的问题 */
function postProblems(plan: Plan): string[] {
  const out: string[] = []
  const fs = planFloors(plan)
  const parts = roofParts(plan)
  for (const q of balconyPosts(plan, parts)) {
    const f = fs.find((x) => x.id === q.floor)!
    const at = `${q.floor} ${q.x.toFixed(0)},${q.y.toFixed(0)}`
    if (Math.abs(q.top - (f.elevation - SLAB)) > 0.01) out.push(`${at}: 柱顶没顶到阳台板底`)
    // 柱子不立在下层房体里
    const k = fs.indexOf(f)
    const below = floorOutline(floorView(plan, fs[k - 1].id).rooms)!
    if (pointInPolygon(q, below)) out.push(`${at}: 柱子在下层房体里`)
    if (q.on === 'ground' && Math.abs(q.bottom - (fs[0].elevation + BASE)) > 0.01) out.push(`${at}: 柱脚没落在地面`)
    if (q.on === 'roof') {
      const lf = fs.find((x) => x.id === q.roofFloor)!
      const r = parts.filter((x) => x.floor === lf.id)
      // 柱子占地范围内的屋面：柱脚不高于最低处（不悬空），最多埋进坡度 × 柱宽（不穿过屋面板）
      const zs = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([dx, dy]) => r.map((x) => roofHeightAt(x.tris, { x: q.x + (dx * POST) / 2, y: q.y + (dy * POST) / 2 })).filter((z): z is number => z !== null))
      if (!zs.length) out.push(`${at}: 说落在屋面上，下面却没有屋面`)
      else {
        const lo = lf.elevation + Math.min(...zs)
        const hi = lf.elevation + Math.max(...zs)
        if (q.bottom > lo + 0.01) out.push(`${at}: 柱脚悬在屋面上方 ${(q.bottom - lo).toFixed(1)}`)
        if (hi - q.bottom > ROOF_T - 1) out.push(`${at}: 柱脚埋进屋面 ${(hi - q.bottom).toFixed(1)}，穿过屋面板`)
      }
    }
  }
  return out
}

describe('阳台支柱', () => {
  test('生成的户建：挑出去的阳台都有支柱，柱脚落地、柱顶顶住阳台板', () => {
    const bad: string[] = []
    let n = 0
    for (const region of REGIONS)
      for (const seed of range(1, 8)) {
        const p = gen(region, 'house', seed)
        const posts = balconyPosts(p, roofParts(p))
        n += posts.length
        for (const m of postProblems(p)) bad.push(`${region}/${seed} ${m}`)
        // 每个挑出下层的阳台至少两根（两个阳角）
        const fs = planFloors(p)
        for (const f of fs.slice(1)) {
          const below = floorOutline(floorView(p, fs[fs.indexOf(f) - 1].id).rooms)!
          for (const b of floorView(p, f.id).rooms.filter((r) => r.kind === 'balcony'))
            if (b.points.some((v) => !pointInPolygon(v, below) && !onBoundary(below, v, 1)) && posts.filter((q) => pointInPolygon(q, b.points)).length < 2) bad.push(`${region}/${seed}: 挑出的阳台 ${b.id} 少于两根柱`)
        }
      }
    expect(bad).toEqual([])
    expect(n).toBeGreaterThan(20)
  })

  test.each(['hip', 'gable', 'shed', 'flat'] as RoofKind[])('退台的上层阳台（%s）：柱脚落在下层屋面上，不悬空、不穿过屋面', (kind) => {
    const p = terraced(kind)
    // 隔着一层的阳台不在下屋上开洞（以前所有上层阳台都从屋顶里扣掉，下屋露出一个洞看见室内）
    const low = roofParts(p).filter((r) => r.floor === '1f')
    for (let x = 610; x < 760; x += 25) for (let y = 210; y < 600; y += 40) expect(low.some((r) => roofHeightAt(r.tris, { x, y }) !== null), `${x},${y}`).toBe(true)
    const posts = balconyPosts(p, roofParts(p))
    expect(posts.length).toBeGreaterThanOrEqual(2)
    expect(posts.every((q) => q.on === 'roof' && q.roofFloor === '1f')).toBe(true)
    expect(postProblems(p)).toEqual([])
    // 3D：柱子放在 1F 屋顶的组里（屋顶藏起来时一起藏），网格底面就在柱脚高度
    const { floors } = buildBuilding(p, 240)
    const roof = floors[0].roof!
    const items: THREE.Object3D[] = []
    roof.traverse((o) => {
      if (o.userData.balconyPost) items.push(o)
    })
    expect(items).toHaveLength(posts.length)
    for (const [i, it] of items.entries()) {
      const box = new THREE.Box3().setFromObject(it)
      expect(box.min.y).toBeCloseTo(posts[i].bottom, 1)
      expect(box.max.y).toBeCloseTo(posts[i].top, 1)
    }
  })

  test('楼里的复式、底座外面：不立柱（下面没有承托面）', () => {
    for (const seed of range(1, 6)) {
      const p = gen('jp', 'duplex', seed)
      for (const q of balconyPosts(p, roofParts(p))) expect(q.on).not.toBe('ground')
    }
  })
})
