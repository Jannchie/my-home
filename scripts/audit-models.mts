// 素材模型体检：把每件素材 build 出来，自动找肉眼容易漏掉的几何问题。
//   island ：悬空零件——和其他零件都不挨着（按各自的有向包围盒，留 0.4cm 容差）、又不落地的一组网格
//   zfight ：共面闪烁——两个不同颜色的零件有朝向相同、几乎共面（默认 < 0.03cm；沙盘里近裁面跟着镜头距离走，0.05cm 的贴片不闪）且互相重叠的平面
//   heavy  ：三角面数偏多（小摆件 > 12k、其余 > 45k）
// 用法：vite-node scripts/audit-models.mts [--only <id 正则>] [--out <json>] [--gap 0.03] [--min-area 1.5] [--checks island,zfight,heavy]
// 只报告，不改任何东西；结果按问题严重程度排序打印，--out 另存完整 JSON。
import '../test/setup/stubdom'
import fs from 'node:fs'
import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import { ASSETS, type AssetDef } from '/src/three/assets'

const argv = process.argv.slice(2)
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const only = arg('--only') ? new RegExp(arg('--only')!) : null
const outFile = arg('--out')
const GAP = Number(arg('--gap') ?? 0.03)
const MIN_AREA = Number(arg('--min-area') ?? 1.5)
const checks = new Set((arg('--checks') ?? 'island,zfight,heavy').split(','))

/** 零件之间算「挨着」的容差（cm） */
const TOUCH = 0.4
/** 落地判定：最低点不高于这个值 */
const GROUND = 0.6

interface Part {
  /** 在会动的部件（柜门、抽屉）里：和柜体之间本来就留缝 */
  door: boolean
  mesh: THREE.Mesh
  obb: OBB
  box: THREE.Box3
  color: string
  tris: number
}

function colorOf(m: THREE.Mesh) {
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshToonMaterial
  const map = mat.map ? ':map' : ''
  const tr = mat.transparent ? `:a${mat.opacity.toFixed(2)}` : ''
  return `#${mat.color?.getHexString() ?? '??????'}${map}${tr}`
}

function partsOf(root: THREE.Object3D): Part[] {
  root.updateMatrixWorld(true)
  const out: Part[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.isOutline) return
    const g = m.geometry
    if (!g.attributes.position?.count) return
    if (!g.boundingBox) g.computeBoundingBox()
    // three 的 OBB.applyMatrix4 只把平移加到中心上、不旋转中心（包围盒中心不在局部原点时会算错），这里自己摆
    const lb = g.boundingBox!
    const obb = new OBB()
    lb.getCenter(obb.center).applyMatrix4(m.matrixWorld)
    lb.getSize(obb.halfSize).multiplyScalar(0.5)
    const e = m.matrixWorld.elements
    const sx = Math.hypot(e[0], e[1], e[2]) || 1
    const sy = Math.hypot(e[4], e[5], e[6]) || 1
    const sz = Math.hypot(e[8], e[9], e[10]) || 1
    obb.rotation.set(e[0] / sx, e[4] / sy, e[8] / sz, e[1] / sx, e[5] / sy, e[9] / sz, e[2] / sx, e[6] / sy, e[10] / sz)
    obb.halfSize.set(obb.halfSize.x * sx + TOUCH / 2, obb.halfSize.y * sy + TOUCH / 2, obb.halfSize.z * sz + TOUCH / 2)
    let door = false
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.userData.door) door = true
    out.push({ door, mesh: m, obb, box: g.boundingBox!.clone().applyMatrix4(m.matrixWorld), color: colorOf(m), tris: (g.index ? g.index.count : g.attributes.position.count) / 3 })
  })
  return out
}

// ---------- island ----------

interface Island {
  n: number
  size: number[]
  center: number[]
  minY: number
  gap: number
  colors: string[]
}

function boxGap(a: THREE.Box3, b: THREE.Box3) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x)
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y)
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z)
  return Math.hypot(dx, dy, dz)
}

function islands(def: AssetDef, parts: Part[]): Island[] {
  const n = parts.length
  if (n < 2) return []
  const parent = parts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue
      const a = parts[i]
      const b = parts[j]
      if (boxGap(a.box, b.box) > TOUCH) continue
      if (a.obb.intersectsOBB(b.obb)) parent[find(i)] = find(j)
    }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }
  if (groups.size < 2) return []
  const list = [...groups.values()].map((idx) => {
    const box = new THREE.Box3()
    for (const i of idx) box.union(parts[i].box)
    return { idx, box, vol: idx.reduce((s, i) => s + parts[i].tris, 0) }
  })
  // 主体：三角面最多的那组
  list.sort((a, b) => b.vol - a.vol)
  const floorStanding = def.mount === undefined && !def.stick && def.form !== 'hanging' && !def.ceiling
  const whole = new THREE.Box3()
  for (const p of parts) whole.union(p.box)
  const out: Island[] = []
  for (const g of list.slice(1)) {
    if (floorStanding && g.box.min.y <= GROUND) continue
    // 壁挂件：各自贴着墙（模型背面）的几块不算悬空（一组搁板、一排挂钩）；吸顶 / 吊装的贴着顶面的同理
    if (def.mount !== undefined && !def.ceiling && g.box.min.z <= whole.min.z + 1) continue
    if (def.ceiling && g.box.max.y >= whole.max.y - 1) continue
    // 柜门 / 抽屉和柜体之间留着缝，不算悬空
    if (g.idx.every((i) => parts[i].door)) continue
    let gap = Infinity
    for (const o of list) if (o !== g) for (const i of g.idx) for (const j of o.idx) gap = Math.min(gap, boxGap(parts[i].box, parts[j].box))
    const s = g.box.getSize(new THREE.Vector3())
    const c = g.box.getCenter(new THREE.Vector3())
    out.push({ n: g.idx.length, size: [s.x, s.y, s.z].map(r1), center: [c.x, c.y, c.z].map(r1), minY: r1(g.box.min.y), gap: r2(gap), colors: [...new Set(g.idx.map((i) => parts[i].color))].slice(0, 3) })
  }
  return out
}

const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100

// ---------- zfight ----------

interface Tri {
  part: number
  /** 平面内坐标的三个顶点 */
  p: [number, number, number, number, number, number]
  d: number
}

interface ZFight {
  a: string
  b: string
  normal: number[]
  at: number[]
  area: number
  gap: number
}

/** 两个凸多边形（平面内）的交叠面积：Sutherland–Hodgman 裁剪 */
function overlapArea(a: number[], b: number[]) {
  let poly: number[] = a.slice()
  const orient = (b[2] - b[0]) * (b[5] - b[1]) - (b[3] - b[1]) * (b[4] - b[0]) >= 0 ? 1 : -1
  for (let e = 0; e < 3 && poly.length >= 6; e++) {
    const x0 = b[e * 2]
    const y0 = b[e * 2 + 1]
    const x1 = b[((e + 1) % 3) * 2]
    const y1 = b[((e + 1) % 3) * 2 + 1]
    const side = (x: number, y: number) => orient * ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0))
    const next: number[] = []
    for (let i = 0; i < poly.length; i += 2) {
      const cx = poly[i]
      const cy = poly[i + 1]
      const nx = poly[(i + 2) % poly.length]
      const ny = poly[(i + 3) % poly.length]
      const sc = side(cx, cy)
      const sn = side(nx, ny)
      if (sc >= 0) next.push(cx, cy)
      if (sc >= 0 !== sn >= 0) {
        const t = sc / (sc - sn)
        next.push(cx + (nx - cx) * t, cy + (ny - cy) * t)
      }
    }
    poly = next
  }
  let area = 0
  for (let i = 0; i < poly.length; i += 2) area += poly[i] * poly[(i + 3) % poly.length] - poly[(i + 2) % poly.length] * poly[i + 1]
  return Math.abs(area) / 2
}

const va = new THREE.Vector3()
const vb = new THREE.Vector3()
const vc = new THREE.Vector3()
const vn = new THREE.Vector3()
const e1 = new THREE.Vector3()
const e2 = new THREE.Vector3()

function zfights(parts: Part[]): ZFight[] {
  // 法线量化到约 0.6°，平面常数按 GAP 分桶（再查相邻桶）
  const buckets = new Map<string, Tri[]>()
  const basisCache = new Map<string, [THREE.Vector3, THREE.Vector3, THREE.Vector3]>()
  parts.forEach((part, pi) => {
    const mat = (Array.isArray(part.mesh.material) ? part.mesh.material[0] : part.mesh.material) as THREE.Material
    if (!mat.visible) return
    const g = part.mesh.geometry
    const pos = g.attributes.position
    const idx = g.index
    const n = idx ? idx.count : pos.count
    const mw = part.mesh.matrixWorld
    const flip = mw.determinant() < 0 ? -1 : 1
    for (let i = 0; i < n; i += 3) {
      va.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mw)
      vb.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(mw)
      vc.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(mw)
      e1.subVectors(vb, va)
      e2.subVectors(vc, va)
      vn.crossVectors(e1, e2)
      const area = vn.length() / 2
      if (area < 0.25) continue
      vn.multiplyScalar(flip / (area * 2))
      const qx = Math.round(vn.x * 100)
      const qy = Math.round(vn.y * 100)
      const qz = Math.round(vn.z * 100)
      // 贴着地面朝下的底面看不见
      if (qy <= -99 && Math.max(va.y, vb.y, vc.y) < 0.2) continue
      const nk = `${qx},${qy},${qz}`
      let basis = basisCache.get(nk)
      if (!basis) {
        const nn = new THREE.Vector3(qx, qy, qz).normalize()
        const u = new THREE.Vector3().crossVectors(Math.abs(nn.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), nn).normalize()
        const v = new THREE.Vector3().crossVectors(nn, u)
        basis = [nn, u, v]
        basisCache.set(nk, basis)
      }
      const [nn, u, v] = basis
      const d = (va.dot(nn) + vb.dot(nn) + vc.dot(nn)) / 3
      const tri: Tri = { part: pi, p: [va.dot(u), va.dot(v), vb.dot(u), vb.dot(v), vc.dot(u), vc.dot(v)], d }
      const key = `${nk}|${Math.floor(d / GAP)}`
      let list = buckets.get(key)
      if (!list) buckets.set(key, (list = []))
      list.push(tri)
    }
  })
  const pairArea = new Map<string, { area: number; gap: number; at: THREE.Vector3; n: THREE.Vector3 }>()
  const seen = new Set<string>()
  for (const [key, list] of buckets) {
    const [nk, bk] = key.split('|')
    const next = buckets.get(`${nk}|${Number(bk) + 1}`)
    const all = next ? list.concat(next) : list
    const partsHere = new Set(all.map((t) => t.part))
    if (partsHere.size < 2) continue
    const [nn, u, v] = basisCache.get(nk)!
    for (let i = 0; i < list.length; i++) {
      const A = list[i]
      for (let j = i + 1; j < all.length; j++) {
        const B = all[j]
        if (A.part === B.part) continue
        const gap = Math.abs(A.d - B.d)
        if (gap > GAP) continue
        if (parts[A.part].color === parts[B.part].color) continue
        // 包围盒快速排除
        const ax0 = Math.min(A.p[0], A.p[2], A.p[4])
        const ax1 = Math.max(A.p[0], A.p[2], A.p[4])
        const bx0 = Math.min(B.p[0], B.p[2], B.p[4])
        const bx1 = Math.max(B.p[0], B.p[2], B.p[4])
        if (ax1 <= bx0 || bx1 <= ax0) continue
        const ay0 = Math.min(A.p[1], A.p[3], A.p[5])
        const ay1 = Math.max(A.p[1], A.p[3], A.p[5])
        const by0 = Math.min(B.p[1], B.p[3], B.p[5])
        const by1 = Math.max(B.p[1], B.p[3], B.p[5])
        if (ay1 <= by0 || by1 <= ay0) continue
        const area = overlapArea(A.p as unknown as number[], B.p as unknown as number[])
        if (area < 0.02) continue
        const tk = `${A.part},${B.part},${i},${j},${key}`
        if (seen.has(tk)) continue
        seen.add(tk)
        const pk = A.part < B.part ? `${A.part}|${B.part}|${nk}` : `${B.part}|${A.part}|${nk}`
        let rec = pairArea.get(pk)
        if (!rec) {
          const cx = (Math.max(ax0, bx0) + Math.min(ax1, bx1)) / 2
          const cy = (Math.max(ay0, by0) + Math.min(ay1, by1)) / 2
          pairArea.set(pk, (rec = { area: 0, gap, at: new THREE.Vector3().addScaledVector(u, cx).addScaledVector(v, cy).addScaledVector(nn, A.d), n: nn }))
        }
        rec.area += area
        rec.gap = Math.min(rec.gap, gap)
      }
    }
  }
  const out: ZFight[] = []
  for (const [pk, rec] of pairArea) {
    if (rec.area < MIN_AREA) continue
    const [a, b] = pk.split('|').map(Number)
    out.push({ a: parts[a].color, b: parts[b].color, normal: [rec.n.x, rec.n.y, rec.n.z].map(r2), at: [rec.at.x, rec.at.y, rec.at.z].map(r1), area: r1(rec.area), gap: Math.round(rec.gap * 1000) / 1000 })
  }
  return out.sort((x, y) => y.area - x.area)
}

// ---------- 主流程 ----------

interface Report {
  id: string
  name: string
  tris: number
  meshes: number
  islands?: Island[]
  zfight?: ZFight[]
  heavy?: boolean
  error?: string
}

const reports: Report[] = []
const t0 = Date.now()
for (const def of ASSETS as AssetDef[]) {
  if (only && !only.test(def.id)) continue
  const rep: Report = { id: def.id, name: def.name, tris: 0, meshes: 0 }
  try {
    const g = def.build(def.palettes[0] ?? [])
    const parts = partsOf(g)
    rep.meshes = parts.length
    rep.tris = Math.round(parts.reduce((s, p) => s + p.tris, 0))
    if (checks.has('island') && !def.fixture) {
      const is = islands(def, parts)
      if (is.length) rep.islands = is
    }
    if (checks.has('zfight')) {
      const z = zfights(parts)
      if (z.length) rep.zfight = z
    }
    if (checks.has('heavy') && rep.tris > (def.prop ? 12000 : 45000)) rep.heavy = true
  } catch (e) {
    rep.error = (e as Error).message
  }
  if (rep.islands || rep.zfight || rep.heavy || rep.error) reports.push(rep)
}

const count = (f: (r: Report) => unknown) => reports.filter(f).length
console.log(`体检完成 ${((Date.now() - t0) / 1000).toFixed(1)}s：悬空 ${count((r) => r.islands)} 件，共面 ${count((r) => r.zfight)} 件，面数偏多 ${count((r) => r.heavy)} 件，出错 ${count((r) => r.error)} 件`)
for (const r of reports) {
  const bits: string[] = []
  if (r.error) bits.push(`ERROR ${r.error}`)
  if (r.heavy) bits.push(`${r.tris}△`)
  if (r.islands) bits.push(`悬空×${r.islands.length} ` + r.islands.slice(0, 3).map((i) => `[${i.n}件 ${i.size.join('×')} @${i.center.join(',')} 距${i.gap} ${i.colors[0]}]`).join(' '))
  if (r.zfight) bits.push(`共面×${r.zfight.length} ` + r.zfight.slice(0, 3).map((z) => `[${z.a}/${z.b} n=${z.normal.join(',')} @${z.at.join(',')} ${z.area}cm² Δ${z.gap}]`).join(' '))
  console.log(`${r.id}\t${r.name}\t${bits.join(' | ')}`)
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(reports, null, 1))
