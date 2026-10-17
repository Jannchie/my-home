// 户建的外观：屋顶（双坡 / 四坡 / 单坡 / 平屋顶带女儿墙）、外墙材质、窗套、入口雨棚 / 门廊、用地（草地、通道、车位、车、围挡）。
//
// 坐标：平面 (x, y) → three (x, z)，高度 → three y。屋顶和窗套放在各层的组里（层局部坐标，本层地面 y = 0），
// 用地放在最底层的组里。屋顶的组打上 userData.roof，沙盘按视图开关显示 / 隐藏（Sandbox3D.vue）。

import * as THREE from 'three'
import type { Exterior, Plan, Site, Vec } from '../model'
import { roofParts, type RoofPart, type Side } from '../exterior'
import { subtractSpan } from '../stairs'
import { addOutlines, cyl, mergeMeshes, rbox, shade, toon, useAnisotropy } from './toon'
import { BASE, openingInfos } from './house'
import { injectLightMask } from './lightMask'

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
  // 和墙纸一样压过相邻墙段的端面，转角处不闪
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -1
  mat.polygonOffsetUnits = -2
  m = mat
  facadeCache.set(key, m)
  return m
}

// ---------- 凸多面体（屋面、山墙） ----------

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

/** 屋面厚度 */
const T = 10

/**
 * 一块屋顶（层局部坐标）。在 (u, v) 局部框架里算：u 沿屋脊，v 横跨；ridge 决定 u 是 x 还是 y。
 */
export function buildRoof(part: RoofPart, ex: Exterior, wallOuter: number): THREE.Group {
  const g = new THREE.Group()
  const roofMat = toon(ex.roofColor)
  const wallMat = facadeMaterial(ex)
  const H = part.top
  const o = wallOuter / 2
  const e = ex.eave ?? 45
  const pitch = ex.pitch ?? 0.45
  const { x0, y0, x1, y1 } = part.rect
  // 单坡按高的一边选框架：v 沿坡度方向
  const alongX = part.kind === 'shed' ? part.high === 'n' || part.high === 's' : part.ridge === 'x'
  const [u0, u1, v0, v1] = alongX ? [x0, x1, y0, y1] : [y0, y1, x0, x1]
  const P = (u: number, v: number, z: number) => (alongX ? new THREE.Vector3(u, z, v) : new THREE.Vector3(v, z, u))
  const uAxis = alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const zFace = H + 2

  /** 竖直的山墙片：(v, z) 凸多边形，放在 u = uc 的墙中心线上，厚 wallOuter */
  const gableWall = (uc: number, vz: [number, number][]) => {
    const pts = vz.map(([v, z]) => P(uc - o, v, z))
    g.add(convexPrism(pts, uAxis.clone().multiplyScalar(wallOuter), wallMat))
  }

  if (part.kind === 'flat') {
    const k = o + Math.min(e, 12)
    const slab = convexPrism([P(u0 - k, v0 - k, H + 14), P(u1 + k, v0 - k, H + 14), P(u1 + k, v1 + k, H + 14), P(u0 - k, v1 + k, H + 14)], new THREE.Vector3(0, -14, 0), toon(shade(ex.roofColor, 0.25)))
    g.add(slab)
    // 女儿墙：沿外墙一圈，高 60，顶上压一道点缀色的压顶
    const ph = 60
    const edges: [number, number, number, number][] = [
      [u0 - o, v0 - o, u1 + o, v0 + o],
      [u0 - o, v1 - o, u1 + o, v1 + o],
      [u0 - o, v0 + o, u0 + o, v1 - o],
      [u1 - o, v0 + o, u1 + o, v1 - o],
    ]
    for (const [a0, b0, a1, b1] of edges) {
      g.add(convexPrism([P(a0, b0, H + 14), P(a1, b0, H + 14), P(a1, b1, H + 14), P(a0, b1, H + 14)], new THREE.Vector3(0, ph, 0), wallMat))
      g.add(convexPrism([P(a0 - 2, b0 - 2, H + 14 + ph), P(a1 + 2, b0 - 2, H + 14 + ph), P(a1 + 2, b1 + 2, H + 14 + ph), P(a0 - 2, b1 + 2, H + 14 + ph)], new THREE.Vector3(0, 5, 0), toon(ex.trimColor)))
    }
    return finish(g, part)
  }

  const U0 = u0 - o - e
  const U1 = u1 + o + e
  if (part.kind === 'shed') {
    const hiPos = part.high === 'n' || part.high === 'e'
    const lowFace = hiPos ? v0 - o : v1 + o
    const highFace = part.against ? (hiPos ? v1 - o : v0 + o) : hiPos ? v1 + o : v0 - o
    const Vlow = hiPos ? lowFace - e : lowFace + e
    const Vhigh = part.against ? (hiPos ? v1 - o : v0 + o) : hiPos ? highFace + e : highFace - e
    const span = Math.abs(Vhigh - Vlow)
    const p = Math.min(pitch, 150 / Math.max(1, span))
    const zLow = zFace - p * e
    const zAt = (v: number) => zLow + p * Math.abs(v - Vlow)
    g.add(convexPrism([P(U0, Vlow, zLow), P(U1, Vlow, zLow), P(U1, Vhigh, zAt(Vhigh)), P(U0, Vhigh, zAt(Vhigh))], new THREE.Vector3(0, -T, 0), roofMat))
    // 两侧的梯形山墙
    const vHiWall = part.against ? Vhigh : highFace
    for (const uc of [u0, u1]) gableWall(uc, [[lowFace, H], [vHiWall, H], [vHiWall, Math.max(H, zAt(vHiWall) - T - 1)], [lowFace, Math.max(H, zAt(lowFace) - T - 1)]])
    // 高的一边（不贴上层时）：墙顶以上补一道墙到屋面下
    if (!part.against) {
      const vc = hiPos ? v1 : v0
      const top = zAt(highFace) - T - 1
      if (top > H + 1) g.add(convexPrism([P(u0 - o, vc - o, H), P(u1 + o, vc - o, H), P(u1 + o, vc + o, H), P(u0 - o, vc + o, H)], new THREE.Vector3(0, top - H, 0), wallMat))
    }
    return finish(g, part)
  }

  const V0 = v0 - o - e
  const V1 = v1 + o + e
  const Vm = (V0 + V1) / 2
  const zE = zFace - pitch * e
  const zr = zE + pitch * (Vm - V0)
  const cap = toon(shade(ex.roofColor, 0.06))
  // 屋脊压条很薄，描边会糊成一道黑线：不描边
  const ridgeCap = (ua: number, ub: number) => {
    const m = convexPrism([P(ua, Vm - 7, zr + 1), P(ub, Vm - 7, zr + 1), P(ub, Vm + 7, zr + 1), P(ua, Vm + 7, zr + 1)], new THREE.Vector3(0, 6, 0), cap)
    m.userData.noOutline = true
    g.add(m)
  }
  if (part.kind === 'gable') {
    g.add(convexPrism([P(U0, V0, zE), P(U1, V0, zE), P(U1, Vm, zr), P(U0, Vm, zr)], new THREE.Vector3(0, -T, 0), roofMat))
    g.add(convexPrism([P(U0, V1, zE), P(U0, Vm, zr), P(U1, Vm, zr), P(U1, V1, zE)], new THREE.Vector3(0, -T, 0), roofMat))
    for (const uc of [u0, u1]) gableWall(uc, [[v0 - o, H], [v1 + o, H], [(v0 + v1) / 2, zr - T - 1]])
    ridgeCap(U0, U1)
  } else {
    const hs = (V1 - V0) / 2
    let ua = U0 + hs
    let ub = U1 - hs
    if (ua > ub) ua = ub = (U0 + U1) / 2
    g.add(convexPrism([P(U0, V0, zE), P(U1, V0, zE), P(ub, Vm, zr), P(ua, Vm, zr)], new THREE.Vector3(0, -T, 0), roofMat))
    g.add(convexPrism([P(U1, V1, zE), P(U0, V1, zE), P(ua, Vm, zr), P(ub, Vm, zr)], new THREE.Vector3(0, -T, 0), roofMat))
    g.add(convexPrism([P(U0, V1, zE), P(U0, V0, zE), P(ua, Vm, zr)], new THREE.Vector3(0, -T, 0), roofMat))
    g.add(convexPrism([P(U1, V0, zE), P(U1, V1, zE), P(ub, Vm, zr)], new THREE.Vector3(0, -T, 0), roofMat))
    if (ub - ua > 1) ridgeCap(ua, ub)
  }
  return finish(g, part)
}

function finish(g: THREE.Group, part: RoofPart) {
  addOutlines(g)
  g.userData.roofPart = part
  return g
}

/** 某一层上的所有屋顶块（层局部坐标），没有就返回 null */
export function roofGroup(plan: Plan, floorId: string, parts = roofParts(plan)): THREE.Group | null {
  const ex = plan.exterior
  const mine = parts.filter((p) => p.floor === floorId)
  if (!ex || !mine.length) return null
  const g = new THREE.Group()
  for (const p of mine) g.add(buildRoof(p, ex, plan.wallOuter))
  g.userData.roof = true
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
      item.add(piece(w + 14, 7, 4, 0, y1, 2))
      item.add(piece(w + 20, 6, 9, 0, y0 - 6, 4.5))
      for (const s of [-1, 1]) item.add(piece(7, y1 - y0, 4, s * (w / 2 + 3.5), y0, 2))
    } else if (ground && o.kind === 'door' && info.owner.kind === 'entrance') {
      // 入户门：门框 + 雨棚（或带柱子的门廊）
      for (const s of [-1, 1]) item.add(piece(8, 205, 5, s * (w / 2 + 4), 0, 2.5))
      item.add(piece(w + 16, 8, 5, 0, 203, 2.5))
      const porch = ex.porch ?? 'canopy'
      if (porch === 'porch') {
        const pw = w + 180
        const pd = 160
        item.add(piece(pw, 12, pd, 0, 245, pd / 2))
        for (const s of [-1, 1]) {
          const at = { x: face.x + dir.x * (s * (pw / 2 - 16)) + out.x * (pd - 16), y: face.y + dir.y * (s * (pw / 2 - 16)) + out.y * (pd - 16) }
          const col = cyl(8, 9, 245 - BASE, trim, { x: at.x, y: BASE, z: at.y }, 14)
          item.add(col)
        }
        // 门前的台阶（从院子地面到室内地面）
        const step = rbox(pw, -BASE - 1, pd, '#d9d3c7', {}, 2)
        step.position.set(face.x + out.x * (pd / 2), BASE + (-BASE - 1) / 2, face.y + out.y * (pd / 2))
        step.rotation.y = yaw
        item.add(step)
      } else if (porch === 'canopy') {
        item.add(piece(w + 90, 8, 85, 0, 228, 42))
        const step = rbox(w + 60, -BASE - 1, 70, '#d9d3c7', {}, 2)
        step.position.set(face.x + out.x * 35, BASE + (-BASE - 1) / 2, face.y + out.y * 35)
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

/** 卡通小汽车：车头朝局部 -z */
export function carModel(color: string): THREE.Group {
  const g = new THREE.Group()
  g.add(rbox(176, 56, 420, color, { y: 20 }, 16))
  g.add(rbox(150, 44, 220, '#a9c8d8', { y: 70, z: 25 }, 10))
  g.add(rbox(146, 8, 180, color, { y: 112, z: 25 }, 4))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = cyl(31, 31, 24, '#2c2c2e', {}, 18)
      w.rotation.z = Math.PI / 2
      w.position.set(sx * 80, 31, sz * 135)
      g.add(w)
    }
  for (const sx of [-1, 1]) {
    g.add(rbox(30, 12, 4, '#fff6cf', { x: sx * 58, y: 48, z: -211 }, 2))
    g.add(rbox(28, 10, 4, '#d9534f', { x: sx * 60, y: 50, z: 211 }, 2))
  }
  return g
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
  for (const s of site.parking) {
    g.add(flat(s.points, BASE, BASE + 2, toon('#d3d0ca'), toon('#b9b5ad')))
    if (s.car) {
      const car = carModel(s.carColor ?? '#d9534f')
      const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length
      const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length
      car.position.set(cx, BASE + 2, cy + 20)
      car.rotation.y = (-s.rot * Math.PI) / 180
      g.add(car)
    }
  }
  // 围挡：沿边界一圈，出入口断开
  const fence = new THREE.Group()
  if (site.fence !== 'none') {
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
        const len = hi - lo
        const mid = (lo + hi) / 2
        const at = (t: number, k: number) => ({ x: a.x + d.x * t + inward.x * sgn * k, z: a.y + d.y * t + inward.y * sgn * k })
        if (site.fence === 'hedge') {
          const m = rbox(len, 80, 44, '#7fa86b', {}, 18)
          const p = at(mid, 24)
          m.position.set(p.x, BASE + 40, p.z)
          m.rotation.y = yaw
          fence.add(m)
        } else if (site.fence === 'wall') {
          const m = rbox(len, 105, 14, '#d3cbbd', {}, 2)
          const p = at(mid, 9)
          m.position.set(p.x, BASE + 52.5, p.z)
          m.rotation.y = yaw
          fence.add(m)
          const c = rbox(len + 2, 6, 20, '#b8ad9c', {}, 2)
          c.position.set(p.x, BASE + 108, p.z)
          c.rotation.y = yaw
          fence.add(c)
        } else {
          const n = Math.max(1, Math.round(len / 150))
          for (let k = 0; k <= n; k++) {
            const p = at(lo + (len * k) / n, 6)
            fence.add(rbox(9, 100, 9, '#9c7a56', { x: p.x, y: BASE, z: p.z }, 2))
          }
          for (const y of [35, 80]) {
            const p = at(mid, 6)
            const r = rbox(len, 8, 4, '#b48f68', {}, 1)
            r.position.set(p.x, BASE + y, p.z)
            r.rotation.y = yaw
            fence.add(r)
          }
        }
      }
    }
  }
  mergeMeshes(fence)
  g.add(fence)
  addOutlines(g)
  return g
}

export type { Side }
