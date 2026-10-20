// 户建的外观：屋顶（双坡 / 四坡 / 单坡 / 平屋顶带女儿墙）、外墙材质、窗套、入口雨棚 / 门廊、用地（草地、通道、车位、车、围挡）。
//
// 坐标：平面 (x, y) → three (x, z)，高度 → three y。屋顶和窗套放在各层的组里（层局部坐标，本层地面 y = 0），
// 用地放在最底层的组里。屋顶的组打上 userData.roof，沙盘按视图开关显示 / 隐藏（Sandbox3D.vue）。

import * as THREE from 'three'
import { FENCE_STYLE, onBoundary, pointInPolygon, signedArea, type CarKind, type Exterior, type Floor, type Plan, type Site, type Vec } from '../model'
import { floorOutline, floorView, planFloors, SLAB } from '../floors'
import { roofExterior, roofParts, type RoofPart, type Side, porchShape, roomInFront } from '../exterior'
import { PARAPET, ROOF_T, roofHeightAt, tessellate, type P3, type RoofRect } from '../roof'
import { subtractSpan } from '../stairs'
import { addOutlines, cyl, mergeMeshes, pullDepth, rbox, shade, toon, useAnisotropy } from './toon'
import { BASE, floorY, openingInfos, WALL_PULL } from './house'
import { archRise, roundDiameter } from '../windows'
import { injectLightMask } from './lightMask'
import { tagMat } from './mats'
import { activeCover } from '../roofCover'
import { coverCaps, coverMeshes, valleyLift } from './roofCover'

// ---------- 外墙材质 ----------

/** 一张贴图对应的实际尺寸（cm） */
const TILE = 120
const facadeCache = new Map<string, THREE.Material>()

function facadeTexture(kind: Exterior['facade'], color: string) {
  const cv = document.createElement('canvas')
  const S = 256
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  g.fillStyle = color
  g.fillRect(0, 0, S, S)
  if (kind === 'siding') {
    // 横向板材：每块 20cm，上沿亮一点、下沿压一道影
    const n = TILE / 20
    const h = S / n
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(color, 0.03)
      g.fillRect(0, i * h, S, h * 0.25)
      g.fillStyle = shade(color, -0.09)
      g.fillRect(0, (i + 1) * h - 3, S, 3)
    }
  } else if (kind === 'brick') {
    // 顺砌：砖 24 × 6，灰缝 1
    const bw = (S * 24) / TILE
    const bh = (S * 7.5) / TILE
    g.fillStyle = shade(color, 0.22, -0.3)
    g.fillRect(0, 0, S, S)
    let row = 0
    for (let y = 0; y < S; y += bh, row++) {
      const off = row % 2 ? bw / 2 : 0
      for (let x = -bw; x < S + bw; x += bw) {
        const k = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1
        g.fillStyle = shade(color, (k - 0.5) * 0.08)
        g.fillRect(x + off + 1.5, y + 1.5, bw - 3, bh - 3)
      }
    }
  } else {
    // 抹灰：细小的明暗斑点
    for (let i = 0; i < 900; i++) {
      const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * S
      const y = (Math.sin(i * 47.3 + 1.3) * 0.5 + 0.5) * S
      g.fillStyle = shade(color, i % 2 ? 0.035 : -0.035)
      g.fillRect(x, y, 2, 2)
    }
  }
  const t = new THREE.CanvasTexture(cv as unknown as HTMLCanvasElement)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  useAnisotropy(t)
  return t
}

/** 外墙外侧的材质：按世界坐标投影（墙段长短不一，花纹大小一致；墙压低时也不拉伸） */
export function facadeMaterial(ex: Pick<Exterior, 'facade' | 'wallColor'>): THREE.Material {
  const key = `${ex.facade}|${ex.wallColor}`
  let m = facadeCache.get(key)
  if (m) return m
  const base = toon('#ffffff') as THREE.MeshToonMaterial
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', map: facadeTexture(ex.facade, ex.wallColor), gradientMap: base.gradientMap })
  mat.onBeforeCompile = (sh) => {
    injectLightMask(sh)
    sh.vertexShader = 'varying vec3 vFacPos;\nvarying vec3 vFacNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFacPos = (modelMatrix * vec4(position, 1.0)).xyz;\n  vFacNrm = mat3(modelMatrix) * normal;')
    sh.fragmentShader =
      'varying vec3 vFacPos;\nvarying vec3 vFacNrm;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec3 fn = abs(normalize(vFacNrm));
  vec2 fuv = (fn.y > max(fn.x, fn.z)) ? vFacPos.xz : ((fn.x > fn.z) ? vFacPos.zy : vFacPos.xy);
  diffuseColor *= texture2D(map, fuv / ${TILE.toFixed(1)});`,
      )
  }
  mat.customProgramCacheKey = () => 'facade-world'
  mat.shadowSide = THREE.FrontSide
  // 和墙纸一样压过相邻墙段的端面，转角处不闪（按距离的深度偏移；polygonOffset 掠射角下没有上限，会把墙面拉到屋面、窗套前面）
  pullDepth(mat, WALL_PULL)
  m = mat
  facadeCache.set(key, m)
  return m
}

// ---------- 凸多面体（山墙、屋脊压条、平屋顶的板） ----------

/** 凸多边形 P 和 P + off 之间的实心棱柱（法线朝外，平面着色） */
function convexPrism(P: THREE.Vector3[], off: THREE.Vector3, mat: THREE.Material) {
  const Q = P.map((p) => p.clone().add(off))
  const tris: THREE.Vector3[][] = []
  for (let i = 1; i + 1 < P.length; i++) {
    tris.push([P[0], P[i], P[i + 1]])
    tris.push([Q[0], Q[i + 1], Q[i]])
  }
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length
    tris.push([P[i], Q[i], Q[j]], [P[i], Q[j], P[j]])
  }
  const c = new THREE.Vector3()
  for (const p of [...P, ...Q]) c.add(p)
  c.multiplyScalar(1 / (P.length * 2))
  const pos: number[] = []
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  for (const t of tris) {
    ab.subVectors(t[1], t[0])
    ac.subVectors(t[2], t[0])
    const n = ab.clone().cross(ac)
    if (n.lengthSq() < 1e-8) continue
    const m = t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1 / 3)
    const tt = n.dot(m.sub(c)) < 0 ? [t[0], t[2], t[1]] : t
    for (const v of tt) pos.push(v.x, v.y, v.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** 屋面三角形（平面 x, y, 高度）→ 有厚度的实心屋面：上表面、下表面（往下 ROOF_T）、四周的封檐板 */
export function roofSolid(tris: number[], mat: THREE.Material, T = ROOF_T): THREE.Mesh {
  const pos: number[] = []
  const P = (k: number, dz = 0) => new THREE.Vector3(tris[k], tris[k + 2] + dz, tris[k + 1])
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  /** 按期望的法线方向 want 定绕向 */
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3) => {
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    const n = ab.clone().cross(ac)
    if (n.lengthSq() < 1e-10) return
    const [p, q, r] = n.dot(want) < 0 ? [a, c, b] : [a, b, c]
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z)
  }
  const up = new THREE.Vector3(0, 1, 0)
  const down = new THREE.Vector3(0, -1, 0)
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
  const edges = new Map<string, { a: number; b: number; c: number; n: number }>()
  for (let k = 0; k < tris.length; k += 9) {
    tri(P(k), P(k + 3), P(k + 6), up)
    tri(P(k, -T), P(k + 3, -T), P(k + 6, -T), down)
    for (let m = 0; m < 3; m++) {
      const a = k + m * 3
      const b = k + ((m + 1) % 3) * 3
      const c = k + ((m + 2) % 3) * 3
      const ka = key(tris[a], tris[a + 1], tris[a + 2])
      const kb = key(tris[b], tris[b + 1], tris[b + 2])
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const e = edges.get(ek)
      if (e) e.n++
      else edges.set(ek, { a, b, c, n: 1 })
    }
  }
  // 只属于一个三角形的边是屋面外缘：竖着补一圈封檐板，法线朝离开三角形的方向
  for (const e of edges.values()) {
    if (e.n !== 1) continue
    const a = P(e.a)
    const b = P(e.b)
    const c = P(e.c)
    const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z)
    const out = new THREE.Vector3(-d.z, 0, d.x)
    if (out.dot(new THREE.Vector3(c.x - a.x, 0, c.z - a.z)) > 0) out.negate()
    const a2 = P(e.a, -T)
    const b2 = P(e.b, -T)
    tri(a, b, b2, out)
    tri(a, b2, a2, out)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const roofMatCache = new Map<string, THREE.Material>()
/**
 * 屋面材质：和 toon 一样，但室内灯的遮罩取一个不存在的房间编号（所有受遮罩的室内灯都不照）。屋面在最上层房间的正上方，
 * 按高度会被归到那一层的房间里，房间灯就会在屋面上照出一个个光斑。
 */
function roofMaterial(color: string): THREE.Material {
  let m = roofMatCache.get(color)
  if (m) return m
  const base = toon(color) as THREE.MeshToonMaterial
  const mat = new THREE.MeshToonMaterial({ color: base.color.clone(), gradientMap: base.gradientMap })
  mat.onBeforeCompile = (sh) => {
    injectLightMask(sh)
    sh.fragmentShader = sh.fragmentShader.replace('lmCell = vec4( lmF, lmFetch( lmP.xz, lmF ) );', `lmCell = vec4( lmF, 250.0, 0.0, 0.0 );`)
  }
  mat.customProgramCacheKey = () => 'roof-outdoor'
  m = mat
  roofMatCache.set(color, m)
  return m
}

const outdoorCache = new Map<string, THREE.Material>()
/** 外墙材质的「户外」版本（女儿墙内侧也不被房间灯照亮），做法同 roofMaterial */
function outdoorFacade(mat: THREE.Material): THREE.Material {
  let m = outdoorCache.get(mat.uuid)
  if (m) return m
  const c = mat.clone()
  const key = mat.customProgramCacheKey()
  c.onBeforeCompile = (sh, r) => {
    mat.onBeforeCompile(sh, r)
    sh.fragmentShader = sh.fragmentShader.replace('lmCell = vec4( lmF, lmFetch( lmP.xz, lmF ) );', 'lmCell = vec4( lmF, 250.0, 0.0, 0.0 );')
  }
  c.customProgramCacheKey = () => `${key}-outdoor`
  m = c
  outdoorCache.set(mat.uuid, m)
  return m
}

const valleyCache = new Map<string, THREE.LineBasicMaterial>()
const valleyMaterial = (color: string) => {
  let m = valleyCache.get(color)
  if (!m) valleyCache.set(color, (m = new THREE.LineBasicMaterial({ color })))
  return m
}

/** 一层的屋顶（层局部坐标）：屋面、屋脊压条、屋面下补齐的外墙；平屋顶是屋面板 + 女儿墙 + 压顶 */
export function buildRoof(part: RoofPart, ex: Exterior, wallOuter: number): THREE.Group {
  const g = new THREE.Group()
  const wallMat = facadeMaterial(ex)
  const o = wallOuter / 2
  // 屋面材料（瓦、金属板、平屋顶的碎石 / 绿化…）：铺在屋面实体上面的一层，见 three/roofCover.ts
  const cover = activeCover(ex)
  if (part.flat) {
    const f = part.flat
    // 每一层做成一整块实心（相邻的矩形之间不留描边接缝）
    const flatSolid = (rs: RoofRect[], z: number, depth: number, mat: THREE.Material) => {
      if (rs.length) g.add(roofSolid(tessellate(rs.map((r) => [[r.x0, r.y0, z], [r.x1, r.y0, z], [r.x1, r.y1, z], [r.x0, r.y1, z]] as P3[])), mat, depth))
    }
    flatSolid(f.slab, f.slabTop, f.slabTop - f.slabBottom, roofMaterial(shade(ex.roofColor, 0.25)))
    if (cover && f.slab.length) for (const m of coverMeshes(tessellate(f.slab.map((r) => [[r.x0, r.y0, f.slabTop], [r.x1, r.y0, f.slabTop], [r.x1, r.y1, f.slabTop], [r.x0, r.y1, f.slabTop]] as P3[])), cover, ex.roofColor)) g.add(m)
    flatSolid(f.parapet, f.slabTop + PARAPET, f.slabTop + PARAPET - f.parapetBottom, outdoorFacade(wallMat))
    flatSolid(f.coping, f.slabTop + PARAPET + 5, 5, roofMaterial(ex.trimColor))
    return finish(g, part)
  }
  g.add(roofSolid(part.tris, roofMaterial(ex.roofColor)))
  if (cover) for (const m of [...coverMeshes(part.tris, cover, ex.roofColor), ...coverCaps(part.creases, cover, ex.roofColor)]) g.add(m)
  // 屋面下补齐的外墙（山墙三角、单坡的高墙、下屋两端）：沿墙中心线、墙厚 wallOuter
  for (const w of part.walls) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const L = Math.hypot(dx, dy)
    if (L < 0.5) continue
    const n = { x: -dy / L, y: dx / L }
    const pt = (p: Vec, z: number) => new THREE.Vector3(p.x - n.x * o, z, p.y - n.y * o)
    // 底边往下埋进墙顶 1：底面不和墙顶（以及顶到外墙内皮的内墙顶）共面
    g.add(convexPrism([pt(w.a, part.top - 1), pt(w.b, part.top - 1), pt(w.b, w.zb), pt(w.a, w.za)], new THREE.Vector3(n.x * wallOuter, 0, n.y * wallOuter), wallMat))
  }
  // 屋脊、斜脊：压条（很薄，描边会糊成一道黑线：不描边）；天沟：一道深色细线
  const cap = toon(shade(ex.roofColor, 0.06))
  const valley: number[] = []
  for (const c of part.creases) {
    const A = new THREE.Vector3(c.a[0], c.a[2], c.a[1])
    const B = new THREE.Vector3(c.b[0], c.b[2], c.b[1])
    if (c.kind === 'valley') {
      const up = 0.6 + valleyLift(cover)
      valley.push(A.x, A.y + up, A.z, B.x, B.y + up, B.z)
      continue
    }
    if (cover) continue // 脊瓦由 coverCaps 搭
    const u = B.clone().sub(A)
    const side = new THREE.Vector3(-u.z, 0, u.x).normalize().multiplyScalar(c.kind === 'ridge' ? 7 : 6)
    const lift = new THREE.Vector3(0, 1, 0)
    const m = convexPrism([A.clone().sub(side).add(lift), B.clone().sub(side).add(lift), B.clone().add(side).add(lift), A.clone().add(side).add(lift)], new THREE.Vector3(0, c.kind === 'ridge' ? 6 : 5, 0), cap)
    m.userData.noOutline = true
    g.add(m)
  }
  if (valley.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(valley, 3))
    const lines = new THREE.LineSegments(geo, valleyMaterial(shade(ex.roofColor, -0.25)))
    lines.raycast = () => {}
    g.add(lines)
  }
  return finish(g, part)
}

function finish(g: THREE.Group, part: RoofPart) {
  // 同材质的块合成一个网格（外墙补块、平屋顶的板 / 女儿墙），再描边
  mergeMeshes(g)
  addOutlines(g)
  g.userData.roofPart = part
  return g
}

/** 某一层上的屋顶（层局部坐标），没有就返回 null */
export function roofGroup(plan: Plan, floorId: string, parts = roofParts(plan), ex: Exterior = roofExterior(plan)): THREE.Group | null {
  const mine = parts.filter((p) => p.floor === floorId)
  if (!mine.length) return null
  const g = new THREE.Group()
  for (const p of mine) g.add(buildRoof(p, ex, plan.wallOuter))
  g.userData.roof = true
  // 户型没有外观设定、现推的缺省屋顶（外观面板不能选中它，预览模式也不盖）
  if (!plan.exterior) g.userData.derived = true
  return g
}

// ---------- 上层阳台的支柱 ----------

/** 阳台支柱的截面边长（cm） */
export const POST = 10.5
/** 柱间距上限：挑出的边比它长就在中间加柱 */
const POST_GAP = 360

export interface BalconyPost {
  /** 阳台所在的楼层（支柱放进这一层的组，跟着它显示 / 拉开） */
  floor: string
  x: number
  y: number
  /** 从房体往外的水平方向（跟着外墙一起透明） */
  out: Vec
  /** 柱顶（阳台板底）、柱脚，都是离 1F 地面的高度 */
  top: number
  bottom: number
  /** 柱脚落在：下层屋面 / 下层阳台 / 地面 */
  on: 'roof' | 'balcony' | 'ground'
  /** 落在屋面上时，是哪一层的屋顶（柱子放进那块屋顶的组，跟着屋顶显示 / 隐藏） */
  roofFloor?: string
}

/**
 * 上层阳台挑出下层外轮廓的部分：在挑出去的阳角（和挑出边上每隔 POST_GAP）立柱，柱脚落在正下方实际承托它的面上——
 * 下层的屋面（按屋面高度；坡屋面取柱子占地范围内最低处，柱脚不悬空，上坡一侧只埋进屋面几 cm）、下层的阳台地面、
 * 或者地面（户建的用地 / 展示底座范围内）。下面什么都没有（楼里的复式、底座外）就不立柱，阳台照旧悬挑。
 * parts：各层的屋顶（roofParts，和 3D 用的同一份）；heightOf：各层实际墙高。
 */
export function balconyPosts(plan: Plan, parts: RoofPart[], heightOf: (f: Floor) => number = (f) => f.height): BalconyPost[] {
  const fs = planFloors(plan)
  if (fs.length < 2) return []
  const views = fs.map((f) => floorView(plan, f.id).rooms)
  const outlines = views.map((rs) => floorOutline(rs))
  // 地面：用地范围内；没有用地时是展示底座的台面（最底层房间外框往外 70，见 house.ts buildHouse）
  const pts0 = views[0].flatMap((r) => r.points)
  if (!pts0.length) return []
  const bx = pts0.map((p) => p.x)
  const by = pts0.map((p) => p.y)
  const pad = 70 - POST
  const onGround = (p: Vec) => (plan.site ? pointInPolygon(p, plan.site.points) : p.x > Math.min(...bx) - pad && p.x < Math.max(...bx) + pad && p.y > Math.min(...by) - pad && p.y < Math.max(...by) + pad)
  /** p 正下方（k 层以下）承托面的高度（离 1F 地面）；没有返回 null */
  const surfaceAt = (p: Vec, k: number): { z: number; on: BalconyPost['on']; roofFloor?: string } | null => {
    for (let j = k - 1; j >= 0; j--) {
      const f = fs[j]
      let z: number | null = null
      for (const r of parts) {
        if (r.floor !== f.id) continue
        // 柱子占地四角 + 中心，取最低的屋面（坡屋面上柱脚不悬空）
        for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const q = { x: p.x + (dx * POST) / 2, y: p.y + (dy * POST) / 2 }
          let h = roofHeightAt(r.tris, q)
          if (h === null) continue
          // 平屋顶的女儿墙 / 压顶上：落在压顶顶面
          if (r.flat && r.flat.coping.some((b) => q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1)) h = r.flat.slabTop + PARAPET + 5
          z = z === null ? h : Math.min(z, h)
        }
      }
      if (z !== null) return { z: f.elevation + z, on: 'roof', roofFloor: f.id }
      const bal = views[j].find((r) => r.kind === 'balcony' && pointInPolygon(p, r.points))
      if (bal) return { z: f.elevation + floorY(bal), on: 'balcony' }
      // 落在下层房体顶上却没有屋顶（不该出现）：不立柱
      if (outlines[j] && pointInPolygon(p, outlines[j]!)) return null
    }
    return onGround(p) ? { z: fs[0].elevation + BASE, on: 'ground' } : null
  }
  const out: BalconyPost[] = []
  fs.forEach((f, k) => {
    const below = outlines[k - 1]
    if (k === 0 || !below) return
    const free = (p: Vec) => !pointInPolygon(p, below) && !onBoundary(below, p, 1)
    const top = f.elevation - SLAB
    const add = (p: Vec, o: Vec) => {
      const s = surfaceAt(p, k)
      if (!s || top - s.z < 5) return
      out.push({ floor: f.id, x: p.x, y: p.y, out: o, top, bottom: s.z, on: s.on, ...(s.roofFloor ? { roofFloor: s.roofFloor } : {}) })
    }
    for (const r of views[k]) {
      if (r.kind !== 'balcony') continue
      const P = r.points
      const sg = Math.sign(signedArea(P))
      const n = P.length
      const isFree = P.map(free)
      const unit = (a: Vec, b: Vec) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
        return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      }
      const inset = POST / 2 + 3
      for (let i = 0; i < n; i++) {
        const v = P[i]
        const a = P[(i + n - 1) % n]
        const b = P[(i + 1) % n]
        const ua = unit(v, a)
        const ub = unit(v, b)
        // 只在挑出去的阳角立柱（阴角、贴着下层外墙的角不立）
        const convex = Math.sign((v.x - a.x) * (b.y - v.y) - (v.y - a.y) * (b.x - v.x)) === sg
        if (isFree[i] && convex) {
          const o = { x: -(ua.x + ub.x), y: -(ua.y + ub.y) }
          const L = Math.hypot(o.x, o.y) || 1
          add({ x: v.x + (ua.x + ub.x) * inset, y: v.y + (ua.y + ub.y) * inset }, { x: o.x / L, y: o.y / L })
        }
        // 两头都挑出去的长边：中间按间距加柱
        if (isFree[i] && isFree[(i + 1) % n]) {
          const L = Math.hypot(b.x - v.x, b.y - v.y)
          const m = Math.ceil(L / POST_GAP)
          // 边的内法线：沿 v→b 转 90°，朝多边形里面
          const inward = { x: -ub.y * sg, y: ub.x * sg }
          for (let s = 1; s < m; s++) {
            const t = (L * s) / m
            add({ x: v.x + ub.x * t + inward.x * inset, y: v.y + ub.y * t + inward.y * inset }, { x: -inward.x, y: -inward.y })
          }
        }
      }
    }
  })
  return out
}

/** 一层的阳台支柱（层局部坐标，elev = 这一层的 elevation）：方柱 + 落地的柱墩 / 落在屋面上的柱脚金属 */
export function buildBalconyPosts(posts: BalconyPost[], elev: number): THREE.Group {
  const g = new THREE.Group()
  const metal = '#c9ccd0'
  for (const p of posts) {
    const item = new THREE.Group()
    const y0 = p.bottom - elev
    const y1 = p.top - elev
    let foot = 0
    if (p.on === 'ground') {
      // 地面：一个柱墩（束石）
      foot = 12
      item.add(rbox(24, foot + 4, 24, '#cfc9be', { x: p.x, y: y0 - 4, z: p.y }, 2))
    } else {
      // 屋面 / 阳台上：柱脚的底板
      foot = 2
      item.add(rbox(POST + 8, foot, POST + 8, shade(metal, -0.1), { x: p.x, y: y0, z: p.y }, 0.6))
    }
    item.add(rbox(POST, y1 - y0 - foot, POST, metal, { x: p.x, y: y0 + foot, z: p.y }, 1.2))
    // 柱头的托板：顶在阳台板底
    item.add(rbox(POST + 6, 3, POST + 6, shade(metal, -0.06), { x: p.x, y: y1 - 3, z: p.y }, 0.6))
    mergeMeshes(item)
    tagWall(item, { x: p.x, y: p.y }, p.out)
    item.userData.balconyPost = true
    g.add(item)
  }
  addOutlines(g)
  return g
}

// ---------- 窗套、雨棚 / 门廊 ----------

/** 跟着所在外墙淡出（墙压低 / 前墙透明时一起藏起来） */
function tagWall(o: THREE.Object3D, c: Vec, n: Vec) {
  o.userData.fade = { x: c.x, y: c.y, nx: n.x, ny: n.y, outer: true }
}

/** 一层的外墙装饰（层局部坐标）：外墙窗的窗套，最底层入户门的雨棚 / 门廊 */
export function facadeExtras(view: Plan, H: number, ex: Exterior, ground: boolean): THREE.Group {
  const g = new THREE.Group()
  const trim = ex.trimColor
  for (const info of openingInfos(view)) {
    if (!info.outer || info.owner.kind === 'balcony') continue
    const { center, dir, out, width: w, wall, o } = info
    const yaw = Math.atan2(-dir.y, dir.x)
    const face = { x: center.x + out.x * (wall / 2), y: center.y + out.y * (wall / 2) }
    const piece = (pw: number, ph: number, pd: number, along: number, y: number, outBy: number) => {
      const m = rbox(pw, ph, pd, trim, {}, 1)
      m.position.set(face.x + dir.x * along + out.x * outBy, y + ph / 2, face.y + dir.y * along + out.y * outBy)
      m.rotation.y = yaw
      return m
    }
    const item = new THREE.Group()
    if (o.kind === 'window' && !info.sash) {
      const y0 = info.y0
      const y1 = Math.min(info.y1, H - 2)
      if (o.windowStyle === 'round' && info.y1 <= H - 1) {
        // 圆窗：只在圆的下沿托一块窗台
        const d = roundDiameter(w, info.y1 - y0)
        const yb = (y0 + info.y1) / 2 - d / 2
        item.add(piece(d * 0.7, 5, 8, 0, yb - 5, 4))
      } else if (o.windowStyle === 'arched' && info.y1 <= H - 1) {
        // 拱顶窗：两侧窗套到拱脚，拱顶一块拱心石
        const ys = info.y1 - archRise(w, info.y1 - y0)
        item.add(piece(w + 20, 6, 9, 0, y0 - 6, 4.5))
        for (const s of [-1, 1]) item.add(piece(7, ys - y0, 4, s * (w / 2 + 3.5), y0, 2))
        item.add(piece(14, 16, 5, 0, info.y1 - 9, 2.5))
      } else {
        item.add(piece(w + 14, 7, 4, 0, y1, 2))
        item.add(piece(w + 20, 6, 9, 0, y0 - 6, 4.5))
        for (const s of [-1, 1]) item.add(piece(7, y1 - y0, 4, s * (w / 2 + 3.5), y0, 2))
      }
    } else if (ground && o.kind === 'door' && info.owner.kind === 'entrance') {
      // 入户门：门框 + 雨棚（或带柱子的门廊）。尺寸按门前到用地边界的空间收（src/exterior.ts porchShape），不会压到围挡
      // 门框高度跟着墙洞（带亮子的门洞更高）
      for (const s of [-1, 1]) item.add(piece(8, info.y1 + 5, 5, s * (w / 2 + 4), 0, 2.5))
      item.add(piece(w + 16, 8, 5, 0, info.y1 + 3, 2.5))
      const ps = porchShape(ex.porch ?? 'canopy', w, roomInFront(view.site, face, out))
      if (ps.kind === 'porch') {
        item.add(piece(ps.width, 12, ps.depth, 0, 245, ps.depth / 2))
        for (const s of [-1, 1]) {
          const at = { x: face.x + dir.x * (s * (ps.width / 2 - 16)) + out.x * (ps.depth - 16), y: face.y + dir.y * (s * (ps.width / 2 - 16)) + out.y * (ps.depth - 16) }
          const col = cyl(8, 9, 245 - BASE, trim, { x: at.x, y: BASE, z: at.y }, 14)
          item.add(col)
        }
      } else if (ps.kind === 'canopy') item.add(piece(ps.width, 8, ps.depth, 0, Math.max(228, info.y1 + 12), ps.depth / 2))  // 雨棚压在门框上面（带亮子的门洞更高）
      if (ps.stepD > 0) {
        // 门前的台阶（从院子地面到室内地面）
        const step = rbox(ps.stepW, -BASE - 1, ps.stepD, '#d9d3c7', {}, 2)
        step.position.set(face.x + out.x * (ps.stepD / 2), BASE + (-BASE - 1) / 2, face.y + out.y * (ps.stepD / 2))
        step.rotation.y = yaw
        item.add(step)
      }
    } else continue
    // 窗套 / 门框的几块板同色：合成一个网格（每扇窗 4 块板 + 4 个描边壳 → 1 + 1 个 draw call）
    mergeMeshes(item)
    tagWall(item, center, out)
    g.add(item)
  }
  addOutlines(g)
  return g
}

// ---------- 用地 ----------

const toV2 = (pts: Vec[]) => pts.map((p) => new THREE.Vector2(p.x, -p.y))

/** 平面多边形挤出成薄板：y0 到 y1 */
function flat(pts: Vec[], y0: number, y1: number, top: THREE.Material, side: THREE.Material) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(toV2(pts)), { depth: y1 - y0, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(geo, [top, side])
  m.position.y = y0
  m.receiveShadow = true
  // 多材质的网格不描边（描边取单一填充色）
  m.userData.noOutline = true
  return m
}

/** 各车型的尺寸：车身、玻璃舱、车顶、轮子（cm；compact 是旧存档的那一款，数值不能动） */
const CAR_SPECS: Record<CarKind, { w: number; L: number; y: number; h: number; cw: number; ch: number; cl: number; cz: number; rl: number; r: number; wx: number; wz: number; rails?: boolean }> = {
  compact: { w: 176, L: 420, y: 20, h: 56, cw: 150, ch: 44, cl: 220, cz: 25, rl: 180, r: 31, wx: 80, wz: 135 },
  kei: { w: 148, L: 340, y: 20, h: 64, cw: 140, ch: 70, cl: 250, cz: 20, rl: 236, r: 26, wx: 64, wz: 112 },
  sedan: { w: 180, L: 480, y: 22, h: 48, cw: 152, ch: 40, cl: 220, cz: 15, rl: 170, r: 31, wx: 82, wz: 155 },
  suv: { w: 186, L: 460, y: 34, h: 68, cw: 164, ch: 54, cl: 280, cz: 40, rl: 250, r: 37, wx: 84, wz: 145, rails: true },
  minivan: { w: 182, L: 470, y: 24, h: 68, cw: 168, ch: 78, cl: 370, cz: 35, rl: 350, r: 30, wx: 82, wz: 160 },
}
/** 车身占地（宽 × 长，cm）：沙盘选中车时脚下的框 */
export function carSize(kind: CarKind = 'compact') {
  const s = CAR_SPECS[kind] ?? CAR_SPECS.compact
  return { w: s.w, L: s.L }
}

/** 卡通小汽车：车头朝局部 -z */
export function carModel(color: string, kind: CarKind = 'compact'): THREE.Group {
  const s = CAR_SPECS[kind] ?? CAR_SPECS.compact
  const g = new THREE.Group()
  g.add(rbox(s.w, s.h, s.L, color, { y: s.y }, 16))
  const gy = s.y + s.h - 6
  g.add(rbox(s.cw, s.ch, s.cl, '#a9c8d8', { y: gy, z: s.cz }, 10))
  g.add(rbox(s.cw - 4, 8, s.rl, color, { y: gy + s.ch - 2, z: s.cz }, 4))
  if (s.rails) for (const sx of [-1, 1]) g.add(rbox(5, 5, s.rl - 30, '#3a3d42', { x: sx * (s.cw / 2 - 12), y: gy + s.ch + 6, z: s.cz }, 2))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = cyl(s.r, s.r, 24, '#2c2c2e', {}, 18)
      w.rotation.z = Math.PI / 2
      w.position.set(sx * s.wx, s.r, sz * s.wz)
      g.add(w)
    }
  for (const sx of [-1, 1]) {
    g.add(rbox(30, 12, 4, '#fff6cf', { x: sx * (s.w / 2 - 30), y: s.y + 28, z: -(s.L / 2 + 1) }, 2))
    g.add(rbox(28, 10, 4, '#d9534f', { x: sx * (s.w / 2 - 28), y: s.y + 30, z: s.L / 2 + 1 }, 2))
  }
  return g
}

/** 围挡实际用的主色和高度（没写就按款式缺省） */
export function fenceLook(site: Pick<Site, 'fence' | 'fenceColor' | 'fenceHeight'>) {
  if (site.fence === 'none') return null
  const d = FENCE_STYLE[site.fence]
  return { color: site.fenceColor ?? d.color, height: site.fenceHeight ?? d.height, custom: !!site.fenceColor }
}

/** 一段围挡（沿局部 x 轴，长 len，从 x = 0 起；y = 0 是用地地面；z × zs 朝用地里面）。外观编辑器的预览图也用它 */
export function fenceSpan(kind: Exclude<Site['fence'], 'none'>, len: number, c: string, h: number, custom: boolean, zs: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  const bar = (w: number, bh: number, d: number, color: string, x: number, y: number, z: number, r?: number) => out.push(rbox(w, bh, d, color, { x, y, z: z * zs }, r))
  const mid = len / 2
  /** 沿长度均匀分布的立柱位置（两端都有）；w = 柱宽，两端往里收半个柱宽（木栅栏是旧款，柱子压在端点上不动） */
  const posts = (step: number, w = 0) => {
    const n = Math.max(1, Math.round(len / step))
    const span = Math.max(0, len - w)
    return Array.from({ length: n + 1 }, (_, k) => w / 2 + (span * k) / n)
  }
  switch (kind) {
    case 'hedge':
      bar(len, h, 44, c, mid, 0, 24, 18)
      // 写实光照（写实、动画感）下按灌木画：完全哑光、不加边缘光（realistic.ts）
      tagMat(out[out.length - 1], 'foliage')
      break
    case 'wall':
      bar(len, h, 14, c, mid, 0, 9, 2)
      bar(len + 2, 6, 20, custom ? shade(c, -0.12) : '#b8ad9c', mid, h, 9, 2)
      break
    case 'fence': {
      const post = custom ? shade(c, -0.1) : '#9c7a56'
      for (const x of posts(150)) bar(9, h, 9, post, x, 0, 6, 2)
      for (const y of [0.35, 0.8]) bar(len, 8, 4, c, mid, h * y - 4, 6, 1)
      break
    }
    case 'block': {
      // ブロック塀：20cm 一层的砌块，横缝压一道深色；顶上一道压顶
      bar(len, h, 12, c, mid, 0, 8, 1)
      const joint = shade(c, -0.12)
      for (let y = 20; y < h - 4; y += 20) bar(len, 1.2, 12.8, joint, mid, y - 0.6, 8, 0.3)
      bar(len + 2, 5, 15, shade(c, 0.04), mid, h, 8, 1.5)
      break
    }
    case 'louver': {
      // 铝百叶目隠しフェンス：两层砌块基础上立柱、横向百叶
      const base = h >= 100 ? 40 : 0
      if (base) bar(len, base, 12, '#b9bab4', mid, 0, 8, 1)
      for (const x of posts(180, 7)) bar(7, h - base, 7, shade(c, -0.08), x, base, 8, 1.5)
      for (let y = base + 6; y + 9 <= h; y += 14) bar(len, 9, 3, c, mid, y, 8, 1)
      break
    }
    case 'brick': {
      // 矮砖墙 + 铁艺栏杆，隔一段一根砖柱
      const b = Math.min(60, Math.round(h * 0.55))
      const iron = '#33363b'
      bar(len, b, 20, c, mid, 0, 12, 1.5)
      bar(len + 2, 5, 24, '#d8d0c4', mid, b, 12, 1.5)
      const top = h - 4
      if (top - b > 15) {
        bar(len, 4, 4, iron, mid, top, 12, 1)
        bar(len, 3, 3, iron, mid, b + 12, 12, 1)
        const n = Math.max(1, Math.round(len / 16))
        for (let k = 1; k < n; k++) bar(2, top - b - 5, 2, iron, (len * k) / n, b + 5, 12, 0.5)
      }
      for (const x of posts(320, 30)) {
        bar(30, h + 4, 30, c, x, 0, 15, 2)
        bar(32, 5, 32, '#d8d0c4', x, h + 4, 15, 1.5)
      }
      break
    }
    case 'picket': {
      // 尖桩栅栏：两道横撑在后，前面一排窄板
      for (const x of posts(180, 9)) bar(9, h + 4, 9, c, x, 0, 6, 2)
      for (const y of [0.3, 0.72]) bar(len, 7, 3, shade(c, -0.05), mid, h * y - 3.5, 8, 1)
      const n = Math.max(1, Math.round(len / 14))
      for (let k = 0; k < n; k++) bar(8, h - 6, 2, c, (len * (k + 0.5)) / n, 0, 5, 0.8)
      break
    }
  }
  return out
}

/** 用地：草地、铺装通道、车位（和车）、围挡；放在最底层的组里（地面在底座高度 BASE） */
export function buildSite(site: Site): THREE.Group {
  const g = new THREE.Group()
  g.userData.site = true
  const xs = site.points.map((p) => p.x)
  const ys = site.points.map((p) => p.y)
  const bx0 = Math.min(...xs)
  const bx1 = Math.max(...xs)
  const by0 = Math.min(...ys)
  const by1 = Math.max(...ys)
  // 展示底座（和公寓的一样是两层台子）+ 草地
  const base = rbox(bx1 - bx0 + 50, 30, by1 - by0 + 50, '#d9c3a5', { x: (bx0 + bx1) / 2, y: BASE - 62, z: (by0 + by1) / 2 }, 14)
  base.receiveShadow = true
  g.add(base)
  g.add(flat(site.points, BASE - 32, BASE, toon('#b9d39c'), toon('#9b7c5c')))
  for (const p of site.paths) g.add(flat(p, BASE, BASE + 2.5, toon('#e2dccf'), toon('#c9c0b0')))
  site.parking.forEach((s, i) => {
    g.add(flat(s.points, BASE, BASE + 2, toon('#d3d0ca'), toon('#b9b5ad')))
    if (s.car) {
      const car = carModel(s.carColor ?? '#d9534f', s.carKind)
      const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length
      const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length
      car.position.set(cx, BASE + 2, cy + 20)
      car.rotation.y = (-s.rot * Math.PI) / 180
      // 沙盘里点车 → 外观面板里对应的车位（Sandbox3D pickSite）
      car.userData.sitePick = { kind: 'car', index: i }
      g.add(car)
    }
  })
  // 围挡：沿边界一圈，出入口断开
  const fence = new THREE.Group()
  const look = fenceLook(site)
  if (look && site.fence !== 'none') {
    const kind = site.fence
    const pts = site.points
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 1) continue
      let spans: [number, number][] = [[0, L]]
      for (const gt of site.gates) spans = spans.flatMap(([lo, hi]) => subtractSpan(a, b, gt).map(([x, y]): [number, number] => [Math.max(lo, x), Math.min(hi, y)]).filter(([x, y]) => y - x > 1))
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const yaw = Math.atan2(-d.y, d.x)
      // 围挡往用地里面收一点
      const inward = { x: -d.y, y: d.x }
      const cxy = { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2 }
      const sgn = (cxy.x - a.x) * inward.x + (cxy.y - a.y) * inward.y > 0 ? 1 : -1
      for (const [lo, hi] of spans) {
        // 每段在自己的局部坐标里搭（x 沿边、z 朝里），再摆到边上
        const span = new THREE.Group()
        // 转过 yaw 之后局部 +z 正好是 inward（= (-d.y, d.x)），sgn 决定朝不朝用地里面
        for (const m of fenceSpan(kind, hi - lo, look.color, look.height, look.custom, sgn)) span.add(m)
        span.position.set(a.x + d.x * lo, BASE, a.y + d.y * lo)
        span.rotation.y = yaw
        fence.add(span)
      }
    }
  }
  mergeMeshes(fence)
  fence.userData.sitePick = { kind: 'fence' }
  g.add(fence)
  addOutlines(g)
  return g
}

export type { Side }
