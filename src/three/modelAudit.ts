// 素材模型体检（几何层面的自动检查），scripts/audit-models.mts 和 test/model-audit.spec.ts 共用。不进应用打包（只有脚本 / 测试引用）。
//   island：悬空零件——和其他零件都不挨着、又不落地的一组网格。
//           「挨着」：方正的零件（盒、柱、球）按各自的有向包围盒相交；圆环、弯管、车削、挤出这类空心 / 弯曲的零件包围盒不准
//           （灯罩凭空套在灯杆外也算相交），改成按顶点到对方表面的距离判断。
//   zfight：共面闪烁——两个不同颜色的零件有朝向相同、几乎共面且互相重叠的平面。朝下的单独记（多半压在别的零件上看不见）
//   sink  ：落地件沉到地面以下
//   black ：纯黑（#000000）的零件，多半是 shade() 把深色调暗过头（shade 现在有软下限，这里兜底）
//   heavy ：三角面数偏多（小摆件 > 12k、其余 > 45k）
//   near  ：差一点没贴上——island 的容差是 0.4cm、方正零件按包围盒算，离主体零点几厘米悬着的零件（没压到笼沿的盖子、
//           没够到框的合页、浮在碗上方的碗盖）都算「挨着」放过了。这里逐三角面量真实距离：和别的零件都不接触（> 0.05cm）、
//           离最近的零件又不到 3cm 的一组零件。贴片（平面，按约定浮出一点防共面）、柜门抽屉、各自落地 / 贴墙的不算。
//           同一项里顺带查落地件离地（lift）：最低点比地面高出 0.15cm 以上——多半是往下鼓的弯管、圆角把整件垫了起来。
//           比别的检查慢（全库约一分钟），脚本里默认不做（--checks near）；测试里照做
import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import type { AssetDef } from './kit'

export const AUDIT_CHECKS = ['island', 'zfight', 'sink', 'black', 'heavy', 'near'] as const
export type AuditCheck = (typeof AUDIT_CHECKS)[number]

export interface AuditOptions {
  /** 共面判定的最大间距（cm），默认 0.03 */
  gap?: number
  /** 共面面积下限（cm²），默认 1.5 */
  minArea?: number
  /** 要做的检查，默认全部 */
  checks?: Set<AuditCheck>
  /** 用第几组配色建模，默认 0 */
  palette?: number
}

/** 零件之间算「挨着」的容差（cm） */
const TOUCH = 0.4
/** 落地判定：最低点不高于这个值 */
const GROUND = 0.6
/** 包围盒可以代表形状的几何（凸的、实心的） */
const SOLID = new Set(['BoxGeometry', 'RoundedBoxGeometry', 'CylinderGeometry', 'SphereGeometry', 'CapsuleGeometry', 'PlaneGeometry', 'CircleGeometry'])

interface Part {
  /** 弯曲 / 空心的几何：按顶点和三角面判断挨着 */
  curved: boolean
  /** 世界坐标的顶点（取样，最多约 400 个） */
  verts?: THREE.Vector3[]
  /** 世界坐标的三角面（curved 才算），和每个三角面的包围盒（预筛用） */
  tris3?: THREE.Triangle[]
  triBoxes?: THREE.Box3[]
  /** 量真实距离用的采样点（near） */
  samples?: THREE.Vector3[]
  /** 有向包围盒的体积（不含容差）：挑主体用 */
  vol: number
  /** 在会动的部件（柜门、抽屉）里：和柜体之间本来就留缝 */
  door: boolean
  mesh: THREE.Mesh
  obb: OBB
  box: THREE.Box3
  color: string
  tris: number
}

/** 网格的（第一个）材质 */
const mat0 = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshToonMaterial

/** 落在地上的素材（不是壁挂、贴附、挂起、吸顶的） */
export const isFloorStanding = (def: AssetDef) => def.mount === undefined && !def.stick && def.form !== 'hanging' && !def.ceiling

function colorOf(m: THREE.Mesh) {
  const mat = mat0(m)
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
    // 隐藏的网格（关着的指示灯、不画的分组）不算；在会动的部件（柜门、抽屉）里的记下来
    let door = false
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      if (!p.visible) return
      if (p.userData.door) door = true
    }
    if (!mat0(m).visible) return
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
    obb.halfSize.set(obb.halfSize.x * sx, obb.halfSize.y * sy, obb.halfSize.z * sz)
    const vol = Math.max(0.001, obb.halfSize.x * obb.halfSize.y * obb.halfSize.z * 8)
    obb.halfSize.addScalar(TOUCH / 2)
    out.push({ curved: !SOLID.has(g.type), vol, door, mesh: m, obb, box: g.boundingBox!.clone().applyMatrix4(m.matrixWorld), color: colorOf(m), tris: (g.index ? g.index.count : g.attributes.position.count) / 3 })
  })
  return out
}

// ---------- island ----------

export interface Island {
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

const _c = new THREE.Vector3()

function vertsOf(p: Part) {
  if (p.verts) return p.verts
  const pos = p.mesh.geometry.attributes.position
  const step = Math.max(1, Math.floor(pos.count / 400))
  const out: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld))
  // 弯曲 / 挤出的零件顶点可能很稀（扇形层板只有轮廓上的点）：沿三角形的边每 2cm 补一个采样点，接触点不在顶点上也能找到
  if (p.curved) {
    const extra: THREE.Vector3[] = []
    for (const t of trisOf(p)) {
      for (const [a, b] of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ]) {
        const k = Math.floor(a.distanceTo(b) / 2)
        for (let i = 1; i <= k; i++) extra.push(new THREE.Vector3().lerpVectors(a, b, i / (k + 1)))
      }
    }
    const st = Math.max(1, Math.floor(extra.length / 1600))
    for (let i = 0; i < extra.length; i += st) out.push(extra[i])
  }
  return (p.verts = out)
}

function trisOf(p: Part) {
  if (p.tris3) return p.tris3
  const g = p.mesh.geometry
  const pos = g.attributes.position
  const idx = g.index
  const n = idx ? idx.count : pos.count
  const out: THREE.Triangle[] = []
  const boxes: THREE.Box3[] = []
  const at = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(p.mesh.matrixWorld)
  for (let i = 0; i < n; i += 3) {
    const t = new THREE.Triangle(at(i), at(i + 1), at(i + 2))
    out.push(t)
    boxes.push(new THREE.Box3().setFromPoints([t.a, t.b, t.c]))
  }
  p.triBoxes = boxes
  return (p.tris3 = out)
}

/** p 的某个顶点贴着 / 嵌进 q */
function reaches(p: Part, q: Part) {
  const qb = q.box.clone().expandByScalar(TOUCH)
  for (const v of vertsOf(p)) {
    if (!qb.containsPoint(v)) continue
    if (!q.curved) {
      if (q.obb.containsPoint(v)) return true
      continue
    }
    const tris = trisOf(q)
    const boxes = q.triBoxes!
    for (let k = 0; k < tris.length; k++) {
      // 离这个三角面的包围盒都超过容差，就不用算最近点了
      const b = boxes[k]
      if (v.x < b.min.x - TOUCH || v.x > b.max.x + TOUCH || v.y < b.min.y - TOUCH || v.y > b.max.y + TOUCH || v.z < b.min.z - TOUCH || v.z > b.max.z + TOUCH) continue
      tris[k].closestPointToPoint(v, _c)
      if (_c.distanceToSquared(v) <= TOUCH * TOUCH) return true
    }
    // 嵌在对方的实心壁里（土面圆片的边沿插进花盆壁）：离表面可能比容差远，按射线穿过的面数奇偶判断在不在里面
    if (inside(v, q)) return true
  }
  return false
}

const _ray = new THREE.Ray()
const _hit = new THREE.Vector3()
/** 点在闭合网格内部（射线奇偶法；方向故意偏一点，避开正好擦过棱的情况） */
function inside(v: THREE.Vector3, q: Part) {
  _ray.set(v, _dir)
  const tris = trisOf(q)
  const boxes = q.triBoxes!
  let n = 0
  for (let k = 0; k < tris.length; k++) {
    // 射线几乎沿 +x：在点左边的、y / z 上够不着的三角面跳过（偏离量按 x 方向走出的距离放宽）
    const b = boxes[k]
    if (b.max.x < v.x) continue
    const slack = (b.max.x - v.x) * 0.02 + 1e-6
    if (v.y < b.min.y - slack || v.y > b.max.y + slack || v.z < b.min.z - slack || v.z > b.max.z + slack) continue
    const t = tris[k]
    if (_ray.intersectTriangle(t.a, t.b, t.c, false, _hit)) n++
  }
  return n % 2 === 1
}
const _dir = new THREE.Vector3(1, 0.0137, 0.0071).normalize()

const _m = new THREE.Matrix3()
const _t = new THREE.Triangle()
const _lb = new THREE.Box3()
const _tb = new THREE.Box3()
/** 实心零件（有向包围盒，已含容差）和弯曲零件的某个三角面相交：杆子穿过挤出板的面中间、搁板压在车削体上都算挨着 */
function boxHitsTris(solid: Part, curved: Part) {
  const o = solid.obb
  _m.copy(o.rotation).transpose()
  _lb.min.copy(o.halfSize).negate()
  _lb.max.copy(o.halfSize)
  const wb = solid.box.clone().expandByScalar(TOUCH)
  const local = (v: THREE.Vector3, out: THREE.Vector3) => out.subVectors(v, o.center).applyMatrix3(_m)
  for (const t of trisOf(curved)) {
    _tb.setFromPoints([t.a, t.b, t.c])
    if (!_tb.intersectsBox(wb)) continue
    local(t.a, _t.a)
    local(t.b, _t.b)
    local(t.c, _t.c)
    if (_lb.intersectsTriangle(_t)) return true
  }
  return false
}

function touching(a: Part, b: Part) {
  if (boxGap(a.box, b.box) > TOUCH) return false
  if (!a.curved && !b.curved) return a.obb.intersectsOBB(b.obb)
  // 实心零件整个埋在弯曲零件的实体里（杆子插在厚框里、一个面都不碰）也算
  if (!a.curved) return boxHitsTris(a, b) || inside(a.obb.center, b)
  if (!b.curved) return boxHitsTris(b, a) || inside(b.obb.center, a)
  return reaches(a, b) || reaches(b, a)
}

function islands(def: AssetDef, parts: Part[]): Island[] {
  const n = parts.length
  if (n < 2) return []
  const parent = parts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  // 两遍：先连便宜的实心 × 实心（有向包围盒），再查带弯曲零件的配对——已经连通的就不用逐三角面算了。并查集结果和顺序无关
  for (const pass of [false, true])
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if ((parts[i].curved || parts[j].curved) !== pass || find(i) === find(j)) continue
        if (touching(parts[i], parts[j])) parent[find(i)] = find(j)
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
    return { idx, box, vol: idx.reduce((s, i) => s + parts[i].vol, 0) }
  })
  // 主体：体积最大的那组（按三角面数挑的话，面数多的悬空笼子会被当成主体）
  list.sort((a, b) => b.vol - a.vol)
  const floorStanding = isFloorStanding(def)
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

// ---------- near ----------

export interface Near {
  /** 这一组有几个零件 */
  n: number
  size: number[]
  center: number[]
  /** 到最近的别的零件的真实距离（cm） */
  gap: number
  /** 这一组里离得最近的零件、对面的零件（几何类型 + 颜色 + 位置） */
  a: string
  b: string
}

/** 真实接触的容差：尺寸量化到 0.1cm，差 0.05 以内算贴着 */
const NEAR_EPS = 0.05
/** 只量这么近以内的零件对；更远的悬空归 island 管 */
const NEAR_CAP = 3
/** 平面贴片（标签、屏幕画面、地板花纹）：按约定浮出表面一点，不算没贴上 */
const FLAT = new Set(['PlaneGeometry', 'CircleGeometry', 'ShapeGeometry'])

/** 量距离用的采样点：顶点 + 棱上每隔一小段 + 每个三角面的重心 */
function samplesOf(p: Part) {
  if (p.samples) return p.samples
  const s = p.box.getSize(new THREE.Vector3())
  const step = Math.max(0.3, Math.max(s.x, s.y, s.z) / 40)
  const out: THREE.Vector3[] = []
  const seen = new Set<string>()
  const push = (v: THREE.Vector3) => {
    const k = `${Math.round(v.x * 20)},${Math.round(v.y * 20)},${Math.round(v.z * 20)}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(v)
  }
  for (const t of trisOf(p)) {
    for (const [a, b] of [
      [t.a, t.b],
      [t.b, t.c],
      [t.c, t.a],
    ]) {
      const k = Math.max(1, Math.ceil(a.distanceTo(b) / step))
      for (let j = 0; j < k; j++) push(new THREE.Vector3().lerpVectors(a, b, j / k))
    }
    push(t.getMidpoint(new THREE.Vector3()))
  }
  return (p.samples = out)
}

/** p 的采样点到 q 表面的最近距离，不超过 cap（点在 q 里面算 0） */
function distOneWay(p: Part, q: Part, cap: number, eps = NEAR_EPS) {
  let best = cap
  const qb = q.box.clone().expandByScalar(cap)
  const tris = trisOf(q)
  const boxes = q.triBoxes!
  const closed = !FLAT.has(q.mesh.geometry.type)
  for (const v of samplesOf(p)) {
    if (!qb.containsPoint(v)) continue
    if (closed && q.box.containsPoint(v) && inside(v, q)) return 0
    for (let k = 0; k < tris.length; k++) {
      const b = boxes[k]
      if (v.x < b.min.x - best || v.x > b.max.x + best || v.y < b.min.y - best || v.y > b.max.y + best || v.z < b.min.z - best || v.z > b.max.z + best) continue
      tris[k].closestPointToPoint(v, _c)
      const d = _c.distanceTo(v)
      if (d < best) best = d
      if (best <= eps) return best
    }
  }
  return best
}

const partName = (p: Part) => {
  const c = p.box.getCenter(new THREE.Vector3())
  const s = p.box.getSize(new THREE.Vector3())
  return `${p.mesh.geometry.type.replace('Geometry', '')} ${p.color} @${[c.x, c.y, c.z].map(r1).join(',')} ${[s.x, s.y, s.z].map(r1).join('×')}`
}

/** 两个零件的真实距离，不超过 cap（一边的采样点到另一边的表面，两个方向取小的） */
function partDist(a: Part, b: Part, cap: number, eps: number) {
  const d = distOneWay(a, b, cap, eps)
  return d > eps ? Math.min(d, distOneWay(b, a, d, eps)) : d
}

function nears(def: AssetDef, parts: Part[], eps = NEAR_EPS): Near[] {
  const n = parts.length
  if (n < 2) return []
  const parent = parts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  // 第一遍只管连通：已经连在一起的两个零件不用量（绝大多数零件都在主体那一组里，逐对量要慢几十倍）
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j) || boxGap(parts[i].box, parts[j].box) > eps) continue
      if (partDist(parts[i], parts[j], eps * 2, eps) <= eps) parent[find(i)] = find(j)
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
    return { idx, box, vol: idx.reduce((s, i) => s + parts[i].vol, 0) }
  })
  list.sort((a, b) => b.vol - a.vol)
  const floorStanding = isFloorStanding(def)
  const whole = new THREE.Box3()
  for (const p of parts) whole.union(p.box)
  const out: Near[] = []
  for (const g of list.slice(1)) {
    // 和 island 一样的豁免：各自落地的、各自贴墙 / 贴顶的、柜门抽屉；再加平面贴片
    if (floorStanding && g.box.min.y <= GROUND) continue
    // 贴附物（便签、贴纸）同理：各自贴在表面上的几片不算
    if ((def.mount !== undefined || def.stick) && !def.ceiling && g.box.min.z <= whole.min.z + 1) continue
    if (def.ceiling && g.box.max.y >= whole.max.y - 1) continue
    if (g.idx.every((i) => parts[i].door)) continue
    if (g.idx.every((i) => FLAT.has(parts[i].mesh.geometry.type))) continue
    // 第二遍：只给没连上的这几组量到别的零件的最近距离
    const inG = new Set(g.idx)
    let gap = NEAR_CAP
    let bi = -1
    let bj = -1
    for (const i of g.idx)
      for (let j = 0; j < n; j++) {
        // 柜门抽屉和柜体之间本来留着缝：不拿它们当「最近的零件」
        if (inG.has(j) || parts[j].door || boxGap(parts[i].box, parts[j].box) >= gap) continue
        const d = partDist(parts[i], parts[j], gap, eps)
        if (d < gap) {
          gap = d
          bi = i
          bj = j
        }
      }
    if (bi < 0) continue
    const s = g.box.getSize(new THREE.Vector3())
    const c = g.box.getCenter(new THREE.Vector3())
    out.push({ n: g.idx.length, size: [s.x, s.y, s.z].map(r1), center: [c.x, c.y, c.z].map(r1), gap: r2(gap), a: partName(parts[bi]), b: partName(parts[bj]) })
  }
  return out
}

// ---------- zfight ----------

interface Tri {
  part: number
  /** 平面内坐标的三个顶点 */
  p: [number, number, number, number, number, number]
  d: number
  /** 三角形的重心和真实法线：比较两片的间距用（量化后的法线在倾斜的长面上会累积出 0.1cm 以上的误差） */
  c: THREE.Vector3
  n: THREE.Vector3
}

export interface ZFight {
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

function zfights(parts: Part[], GAP: number, MIN_AREA: number): { up: ZFight[]; down: ZFight[] } {
  // 法线量化到约 0.6°，平面常数按 GAP 分桶（再查相邻桶）
  const buckets = new Map<string, Tri[]>()
  const basisCache = new Map<string, [THREE.Vector3, THREE.Vector3, THREE.Vector3]>()
  parts.forEach((part, pi) => {
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
      const trueN = vn.clone()
      const cen = new THREE.Vector3().add(va).add(vb).add(vc).divideScalar(3)
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
      const tri: Tri = { part: pi, p: [va.dot(u), va.dot(v), vb.dot(u), vb.dot(v), vc.dot(u), vc.dot(v)], d, c: cen, n: trueN }
      const key = `${nk}|${Math.floor(d / GAP)}`
      let list = buckets.get(key)
      if (!list) buckets.set(key, (list = []))
      list.push(tri)
    }
  })
  const pairArea = new Map<string, { area: number; gap: number; at: THREE.Vector3; n: THREE.Vector3 }>()
  for (const [key, list] of buckets) {
    const [nk, bk] = key.split('|')
    const next = buckets.get(`${nk}|${Number(bk) + 1}`)
    if (list.length + (next?.length ?? 0) < 2) continue
    const all = next ? list.concat(next) : list
    const partsHere = new Set(all.map((t) => t.part))
    if (partsHere.size < 2) continue
    const [nn, u, v] = basisCache.get(nk)!
    for (let i = 0; i < list.length; i++) {
      const A = list[i]
      for (let j = i + 1; j < all.length; j++) {
        const B = all[j]
        if (A.part === B.part) continue
        const gap = Math.abs(_c.subVectors(B.c, A.c).dot(A.n))
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
        const area = overlapArea(A.p, B.p)
        if (area < 0.02) continue
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
  const down: ZFight[] = []
  for (const [pk, rec] of pairArea) {
    if (rec.area < MIN_AREA) continue
    const [a, b] = pk.split('|').map(Number)
    ;(rec.n.y < -0.9 ? down : out).push({ a: parts[a].color, b: parts[b].color, normal: [rec.n.x, rec.n.y, rec.n.z].map(r2), at: [rec.at.x, rec.at.y, rec.at.z].map(r1), area: r1(rec.area), gap: Math.round(rec.gap * 1000) / 1000 })
  }
  return { up: out.sort((x, y) => y.area - x.area), down }
}


// ---------- 入口 ----------

export interface AuditReport {
  id: string
  name: string
  tris: number
  meshes: number
  islands?: Island[]
  /** 朝上 / 朝侧面的共面（看得见，要修） */
  zfight?: ZFight[]
  /** 朝下的共面（多半压在别的零件上看不见，只做参考） */
  zfightDown?: ZFight[]
  /** 落地件最低点（低于 -0.3 才记） */
  sink?: number
  /** 纯黑零件的个数 */
  black?: number
  heavy?: boolean
  /** 差一点没贴上的零件组 */
  near?: Near[]
  /** 落地件最低点离地多高（高于 0.15 才记） */
  lift?: number
  error?: string
}

/** 每项检查「有问题」的判定（脚本的统计、测试都用这一份；朝下的共面不算） */
export const PROBLEM: Record<AuditCheck, (r: AuditReport) => boolean> = {
  island: (r) => !!r.islands,
  zfight: (r) => !!r.zfight,
  sink: (r) => r.sink !== undefined,
  black: (r) => !!r.black,
  heavy: (r) => !!r.heavy,
  near: (r) => !!r.near || r.lift !== undefined,
}

/** 有没有要修的问题 */
export const hasProblem = (r: AuditReport) => !!r.error || AUDIT_CHECKS.some((k) => PROBLEM[k](r))

/** 默认做的检查：near 慢，要点名才做 */
const ALL_CHECKS = new Set<AuditCheck>(AUDIT_CHECKS.filter((k) => k !== 'near'))

export function auditAsset(def: AssetDef, opts: AuditOptions = {}): AuditReport {
  const checks = opts.checks ?? ALL_CHECKS
  const rep: AuditReport = { id: def.id, name: def.name, tris: 0, meshes: 0 }
  try {
    const g = def.build(def.palettes[Math.min(opts.palette ?? 0, def.palettes.length - 1)] ?? [])
    const parts = partsOf(g)
    rep.meshes = parts.length
    rep.tris = Math.round(parts.reduce((s, p) => s + p.tris, 0))
    if (checks.has('island') && !def.fixture) {
      const is = islands(def, parts)
      if (is.length) rep.islands = is
    }
    if (checks.has('zfight')) {
      const z = zfights(parts, opts.gap ?? 0.03, opts.minArea ?? 1.5)
      if (z.up.length) rep.zfight = z.up
      if (z.down.length) rep.zfightDown = z.down
    }
    if ((checks.has('sink') || checks.has('near')) && isFloorStanding(def) && parts.length) {
      // 逐顶点取最低点：变换后的局部包围盒在零件旋转时会放大（摇椅的弧脚、斜放的球），不能用
      let minY = Infinity
      for (const p of parts) {
        if (p.box.min.y > minY) continue
        const pos = p.mesh.geometry.attributes.position
        for (let i = 0; i < pos.count; i++) minY = Math.min(minY, _c.fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld).y)
      }
      if (checks.has('sink') && minY < -0.3) rep.sink = r2(minY)
      if (checks.has('near') && minY > 0.15) rep.lift = r2(minY)
    }
    if (checks.has('black')) {
      const n = parts.filter((p) => p.color === '#000000').length
      if (n) rep.black = n
    }
    if (checks.has('heavy') && rep.tris > (def.prop ? 12000 : 45000)) rep.heavy = true
    if (checks.has('near') && !def.fixture) {
      const ns = nears(def, parts)
      if (ns.length) rep.near = ns
    }
  } catch (e) {
    rep.error = (e as Error).message
  }
  return rep
}
