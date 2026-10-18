// 户建的外观：屋顶（双坡 / 四坡 / 单坡 / 平屋顶带女儿墙）、外墙材质、窗套、入口雨棚 / 门廊、用地（草地、通道、车位、车、围挡）。
//
// 坐标：平面 (x, y) → three (x, z)，高度 → three y。屋顶和窗套放在各层的组里（层局部坐标，本层地面 y = 0），
// 用地放在最底层的组里。屋顶的组打上 userData.roof，沙盘按视图开关显示 / 隐藏（Sandbox3D.vue）。

import * as THREE from 'three'
import { FENCE_STYLE, type CarKind, type Exterior, type Plan, type Site, type Vec } from '../model'
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
