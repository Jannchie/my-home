// 收纳与多形态素材包：洞洞板、各种架子（多层 surfaces / 挂钩层）、可以平放 / 挂起 / 叠好…的多形态物品、桌面小日用。
//
// 约定补充：
//   - id 统一用 sf- 前缀，避免和其他素材包撞名。
//   - 挂起形态（form: 'hanging'）的原点 = 挂点：模型都在原点下方（y ≤ 0），本体在原点前方（z ≥ 0.3），
//     只有自带的钩子钩尾往 -z 插进板里约 1cm。J 形钩（洞洞板钩）的横臂在 y = -2；S 形钩上端钩环的内顶在 y ≈ -0.5。
//   - 洞洞板的挂点带 y = 孔排高度 + 2，这样 J 钩的横臂正好穿过那一排孔。
//   - 架子各层 surfaces 的 y 就是模型层板顶面（壁挂物为离地高度），层板上不摆东西。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, glow, rectPoly, rng, slab, type AssetCategory, type AssetDef, type FormTag, type Poly } from '../kit'
import { G, P, PI, UP, box3, ghost, type V3 } from '../geo'
import { I, J, M, N, R, type Build, type Dims, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const PAGE = '#fbf6ea'
const SCREEN = '#bfe3ff'
const WHITE = '#ffffff'

// ---------- 定义 ----------

function asset(id: string, name: string, category: AssetCategory, [w, d, h]: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}

const prop = (id: string, name: string, category: AssetCategory, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) =>
  asset(id, name, category, dims, pals, build, { prop: true, ...extra })

interface FormSpec {
  id: string
  form: FormTag
  dims: Dims
  build: Build
  extra?: Partial<AssetDef>
}

/** 一个 family 的多种形态：配色、名字、规格都相同，只有 form 不同 */
function forms(family: string, name: string, category: AssetCategory, pals: Pal[], list: FormSpec[]): AssetDef[] {
  return list.map((f) => prop(f.id, name, category, f.dims, pals, f.build, { family, form: f.form, ...f.extra }))
}

// ---------- 小工具 ----------

/** 沿 x 的横圆柱，给中心 */
const cylX = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) => P(cyl(r, r, len, color, {}, seg), x, y, z, 0, 0, PI / 2)
/** 沿 z 的圆柱，给中心 */
const cylZ = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 20) => P(cyl(r, r, len, color, {}, seg), x, y, z, PI / 2)

/** 两点之间的细杆 */
function stick(a: V3, b: V3, r: number, color: string, seg = 8) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = cyl(r, r, dir.length(), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return m
}

/** 两点之间的扁条（截面 w × t，w 沿 x） */
function bar(a: V3, b: V3, w: number, t: number, color: string) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = rbox(w, dir.length(), t, color, {}, Math.min(0.3, t * 0.4, w * 0.4))
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return m
}

/** 平滑管子（钩子、线、提手），两端加圆头 */
function tube(pts: V3[], r: number, color: string, closed = false, seg?: number) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
    'centripetal',
  )
  const geo = new THREE.TubeGeometry(curve, seg ?? Math.max(12, pts.length * 6), r, 8, closed)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  if (closed) return m
  return G(m, ball(r, color, { x: pts[0][0], y: pts[0][1], z: pts[0][2] }), ball(r, color, { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], z: pts[pts.length - 1][2] }))
}

/** 圆弧上的点；'yz' 平面里 z = cos a、y = sin a；'xy' 平面里 x = cos a、y = sin a */
function arc(c: V3, r: number, a0: number, a1: number, n: number, plane: 'xy' | 'yz' = 'xy'): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push(plane === 'xy' ? [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]] : [c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r])
  }
  return out
}

/** 半球（开口朝下），y 是底面 */
function dome(r: number, color: string, x: number, y: number, z: number, sy = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(color))
  m.position.set(x, y, z)
  m.scale.y = sy
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 环形筒（卷纸、胶带）：外径 rO、内径 rI、高 h，底面在 y */
function ring(rO: number, rI: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const pts = [new THREE.Vector2(rI, 0), new THREE.Vector2(rO - 0.3, 0), new THREE.Vector2(rO, 0.3), new THREE.Vector2(rO, h - 0.3), new THREE.Vector2(rO - 0.3, h), new THREE.Vector2(rI, h), new THREE.Vector2(rI, 0)]
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), toon(color))
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 落地居中：包围盒底面在 y = 0、xz 居中 */
function ground<T extends THREE.Object3D>(o: T): T {
  const b = box3(o)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.y -= b.min.y
  o.position.z -= (b.min.z + b.max.z) / 2
  return o
}

/**
 * 挂起：把本体移到挂点下方。topY = 本体顶面的高度；zc = 本体 z 中心（不给就让本体背面贴 z = 0.3）；
 * 本体背面始终不小于 z = 0.3（不穿进板里）。xOff：本体居中后再沿 x 平移（让某个挂环对准钩子）。
 */
function hangAt<T extends THREE.Object3D>(o: T, topY: number, zc?: number, xOff = 0): T {
  const b = box3(o)
  o.position.x += xOff - (b.min.x + b.max.x) / 2
  o.position.y += topY - b.max.y
  let dz = zc === undefined ? 0.3 - b.min.z : zc - (b.min.z + b.max.z) / 2
  if (b.min.z + dz < 0.3) dz = 0.3 - b.min.z
  o.position.z += dz
  return o
}

/** 把模型转个方向后落地（平放、横放） */
function laid(o: THREE.Object3D, rx: number, ry = 0, rz = 0) {
  o.rotation.set(rx, ry, rz)
  return ground(G(o))
}

/** 转个方向（不落地），给 hangAt 用 */
function turned(o: THREE.Object3D, rx: number, ry = 0, rz = 0) {
  o.rotation.set(rx, ry, rz)
  return G(o)
}

// ---------- 钩子零件 ----------

/** J 钩横臂的高度；挂在横臂上的东西顶面在 J_UNDER，套在横臂上的环顶面约在 -0.6 */
const J_ARM = -2
const J_UNDER = -2.35
/** 洞洞板 J 形钩：钩尾往 -z 插进板 1cm，横臂沿 +z 伸出 L，末端上翘 */
function jHook(L = 6, color = STEEL) {
  const r = 0.32
  return G(
    stick([0, J_ARM, -1], [0, J_ARM, L], r, color),
    stick([0, J_ARM, L], [0, -r, L], r, color),
    ball(r, color, { y: J_ARM, z: L }),
    ball(r, color, { y: -r, z: L }),
    cylZ(0.7, 0.3, color, 0, J_ARM, 0.15, 12),
  )
}

/** S 形钩：上环开口朝后（内顶在 y ≈ -0.5，后沿 z = -1），下环开口朝前，下环最低点 (0, S_LOW, S_Z) */
const S_LOW = -6.4
const S_Z = 2.6
const S_UNDER = S_LOW - 0.3
function sHook(color = STEEL) {
  const top = arc([0, -1.45, 0.2], 1.2, PI * 1.15, 0, 8, 'yz')
  const bottom = arc([0, -5.2, S_Z], 1.2, PI, PI * 2.2, 8, 'yz')
  return tube([...top, ...bottom], 0.25, color, false, 48)
}

/** 衣架钩：钩环内顶在 y ≈ -0.5，脖子落到 (0, -5, zc) */
function hangerHook(zc: number, color = STEEL) {
  const top = arc([0, -1.45, 0.2], 1.2, PI * 1.2, -PI * 0.15, 8, 'yz')
  return tube([...top, [0, -3.2, (1.4 + zc) / 2], [0, -4.4, zc], [0, -5.4, zc]], 0.22, color, false, 40)
}

// ---------- 配色 ----------

const PEG_PALS: Pal[] = [
  ['nordic', [N.oak, shade(N.oak, -0.12), N.oakL]],
  ['modern', [M.white, M.light, M.white]],
  ['industrial', [M.silver, I.iron, I.walnut]],
  ['modern', [M.black, M.char, M.walnut]],
  ['cute', [C.mint, C.white, C.woodL]],
  ['japanese', [J.hinoki, J.wood, J.hinoki]],
]

const ACC_PALS: Pal[] = [
  ['modern', [M.white, M.light, STEEL]],
  ['modern', [M.black, M.char, M.gray]],
  ['nordic', [N.oak, N.white, STEEL]],
  ['cute', [C.pink, C.white, STEEL]],
  ['industrial', [I.iron, I.steel, I.rust]],
]

const SHELF_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.oakL]],
  ['modern', [M.white, M.char, M.light]],
  ['industrial', [I.walnut, I.iron, I.steel]],
  ['cute', [C.woodL, C.mint, C.pink]],
  ['japanese', [J.hinoki, J.dark, J.washi]],
]

const WIRE_PALS: Pal[] = [
  ['modern', [M.silver, M.black, M.gray]],
  ['modern', [M.black, M.char, M.gray]],
  ['nordic', [N.white, N.gray, N.oak]],
  ['cute', [C.mint, C.white, C.pink]],
  ['industrial', [I.iron, I.steel, I.walnut]],
]

// ---------- 洞洞板 ----------

const PEG_D = 3

function pegGrid(w: number, h: number, sp: number) {
  const cols = Math.floor((w - 5) / sp)
  const rows = Math.floor((h - 5) / sp)
  const xs = Array.from({ length: cols + 1 }, (_, i) => -(cols * sp) / 2 + i * sp)
  const ys = Array.from({ length: rows + 1 }, (_, j) => (h - rows * sp) / 2 + j * sp)
  return { xs, ys }
}

/** 洞洞板面板：八边形小孔（比 holePanel 的圆孔轻得多，几百个孔也不重），几何按规格缓存 */
const panelCache = new Map<string, THREE.BufferGeometry>()
function pegPanelGeo(w: number, h: number, t: number, sp: number) {
  const key = `${w},${h},${t},${sp}`
  let geo = panelCache.get(key)
  if (geo) return geo
  const r = 1
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, 0)
  s.lineTo(w / 2 - r, 0)
  s.quadraticCurveTo(w / 2, 0, w / 2, r)
  s.lineTo(w / 2, h - r)
  s.quadraticCurveTo(w / 2, h, w / 2 - r, h)
  s.lineTo(-w / 2 + r, h)
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - r)
  s.lineTo(-w / 2, r)
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0)
  const { xs, ys } = pegGrid(w, h, sp)
  for (const x of xs)
    for (const y of ys) {
      const p = new THREE.Path()
      for (let k = 0; k < 8; k++) {
        const a = -((k + 0.5) / 8) * PI * 2
        const px = x + Math.cos(a) * 0.45
        const py = y + Math.sin(a) * 0.45
        if (k === 0) p.moveTo(px, py)
        else p.lineTo(px, py)
      }
      p.closePath()
      s.holes.push(p)
    }
  const bevel = 0.2
  geo = new THREE.ExtrudeGeometry(s, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 3 })
  geo.translate(0, 0, -t / 2 + bevel)
  // 模块级缓存、多件家具共用：标记共享，disposeUnshared 不释放
  geo.userData.shared = true
  panelCache.set(key, geo)
  return geo
}

/** 洞洞板本体：背面贴 zb，板厚 1.2，背后 1.8 的垫条 */
function pegboardPart(w: number, h: number, mount: number, sp: number, board: string, batten: string, zb = -PEG_D / 2) {
  const g = new THREE.Group()
  const m = new THREE.Mesh(pegPanelGeo(w, h, 1.2, sp), toon(board))
  m.position.set(0, mount, zb + 1.8 + 0.6)
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  for (const yy of [3, h - 6]) g.add(rbox(w - 6, 3, 1.7, batten, { y: mount + yy, z: zb + 0.85 }, 0.4))
  return g
}

/** 每隔两排孔一条挂点带（板前方 3cm 宽）；skip 里的高度区间不放 */
function pegBands(w: number, h: number, mount: number, sp: number, zFront: number, skip: [number, number][] = [], shelfTop = -1) {
  const { ys } = pegGrid(w, h, sp)
  const out: { y: number; shape: Poly[]; kind: 'hook'; h: number }[] = []
  for (let j = ys.length - 2; j >= 1; j -= 2) {
    const y = mount + ys[j] + 2
    if (skip.some(([a, b]) => y > a && y < b)) continue
    out.push({ y: Math.round(y * 10) / 10, shape: [rectPoly(-w / 2 + 2, zFront, w / 2 - 2, zFront + 3)], kind: 'hook', h: Math.round((shelfTop > 0 && y > shelfTop ? y - shelfTop - 1 : y - 2) * 10) / 10 })
  }
  return out
}

const PEG_SIZES: { label: string; w: number; h: number; mount: number; sp: number }[] = [
  { label: '40×60', w: 40, h: 60, mount: 110, sp: 5 },
  { label: '60×90', w: 60, h: 90, mount: 95, sp: 6 },
  { label: '90×120', w: 90, h: 120, mount: 80, sp: 6 },
  { label: '120×60', w: 120, h: 60, mount: 100, sp: 6 },
]

const PEGBOARDS: AssetDef[] = PEG_SIZES.map((s) =>
  asset(`sf-pegboard-${s.w}x${s.h}`, '洞洞板', 'storage', [s.w, PEG_D, s.h], PEG_PALS, (p) => pegboardPart(s.w, s.h, s.mount, s.sp, p[0], p[1]), {
    family: 'pegboard',
    sizeLabel: s.label,
    mount: s.mount,
    surfaces: pegBands(s.w, s.h, s.mount, s.sp, PEG_D / 2),
  }),
)

/** 洞洞板套装：板 + 一块小层板（层板上空着） */
const SET_D = 15
const SET_SIZES = [
  { label: '60×90', w: 60, h: 90, mount: 95, sp: 6, shelfY: 30 },
  { label: '90×120', w: 90, h: 120, mount: 80, sp: 6, shelfY: 42 },
]
const SHELF_T = 1.5
function pegSet(s: (typeof SET_SIZES)[number]): Build {
  return (p) => {
    const [board, batten, shelf] = p
    const zb = -SET_D / 2
    const zf = zb + PEG_D
    const g = pegboardPart(s.w, s.h, s.mount, s.sp, board, batten, zb)
    const y = s.mount + s.shelfY
    const sw = s.w - 12
    g.add(rbox(sw, SHELF_T, SET_D / 2 - zf, shelf, { y, z: (zf + SET_D / 2) / 2 }, 0.5))
    for (const sx of [-1, 1]) {
      const x = sx * (sw / 2 - 5)
      g.add(rbox(1.2, 9, 0.6, STEEL, { x, y: y - 9, z: zf + 0.3 }, 0.2))
      g.add(stick([x, y - 8.4, zf + 0.6], [x, y - 0.2, SET_D / 2 - 2], 0.3, STEEL))
      g.add(stick([x, y - 1, zf - 1], [x, y - 1, zf + 0.4], 0.3, STEEL))
    }
    // 前沿挡条
    g.add(stick([-sw / 2 + 1, y + SHELF_T + 1.2, SET_D / 2 - 0.6], [sw / 2 - 1, y + SHELF_T + 1.2, SET_D / 2 - 0.6], 0.3, STEEL))
    for (const sx of [-1, 1]) g.add(stick([sx * (sw / 2 - 1), y + SHELF_T - 0.2, SET_D / 2 - 0.6], [sx * (sw / 2 - 1), y + SHELF_T + 1.2, SET_D / 2 - 0.6], 0.3, STEEL))
    return g
  }
}

const PEG_SETS: AssetDef[] = SET_SIZES.map((s) => {
  const zf = -SET_D / 2 + PEG_D
  const sw = s.w - 12
  const top = s.mount + s.shelfY + SHELF_T
  return asset(`sf-pegboard-set-${s.w}x${s.h}`, '洞洞板套装（带层板）', 'storage', [s.w, SET_D, s.h], PEG_PALS, pegSet(s), {
    family: 'pegboard-set',
    sizeLabel: s.label,
    mount: s.mount,
    surfaces: [
      { y: top, h: 30, shape: [rectPoly(-sw / 2 + 1, zf + 0.5, sw / 2 - 1, SET_D / 2 - 1.2)] },
      ...pegBands(s.w, s.h, s.mount, s.sp, zf, [[s.mount + s.shelfY - 2, s.mount + s.shelfY + 24]], top),
    ],
  })
})

// ---------- 洞洞板配件（多形态） ----------

/** 洞洞板小层板：挂起时原点在钩子处，两根插脚 + 三角托架 */
function pegShelfBody(p: string[]) {
  const [main, , metal] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.2, 12, main, { y: -2.2, z: 6.5 }, 0.4)) // z 0.5..12.5，顶面 -1.0
  for (const sx of [-1, 1]) {
    const x = sx * 11
    g.add(rbox(1.4, 9, 0.6, metal, { x, y: -11.2, z: 0.6 }, 0.2))
    g.add(stick([x, -10.6, 0.9], [x, -2.3, 10.5], 0.3, metal))
    for (const y of [-3.2, -9.8]) g.add(stick([x, y, -1], [x, y, 0.6], 0.3, metal))
  }
  g.add(stick([-14.2, -0.55, 12], [14.2, -0.55, 12], 0.25, metal))
  return g
}

function pegCupBody(p: string[], hang: boolean) {
  const [main, , metal] = p
  const g = new THREE.Group()
  g.add(cup(3.8, 3.4, 10, 0.4, main, { y: -12.5, z: 5 })) // z 1.2..8.8
  g.add(rbox(5, 8, 0.8, main, { y: -11.5, z: 0.7 }, 0.3))
  g.add(rbox(2.4, 6, 1.2, main, { y: -10.5, z: 1.4 }, 0.3))
  if (hang) for (const sx of [-1, 1]) g.add(stick([sx * 1.5, -4.2, -1], [sx * 1.5, -4.2, 0.4], 0.28, metal))
  return g
}

function wireBasket(w: number, d: number, h: number, color: string, step = 2.4) {
  const g = new THREE.Group()
  const r = 0.22
  const x1 = w / 2 - r
  const z1 = d / 2 - r
  const rim = (y: number) => {
    g.add(stick([-x1, y, -z1], [x1, y, -z1], r, color), stick([-x1, y, z1], [x1, y, z1], r, color), stick([-x1, y, -z1], [-x1, y, z1], r, color), stick([x1, y, -z1], [x1, y, z1], r, color))
  }
  rim(r)
  rim(h - r)
  rim(h * 0.5)
  const nx = Math.max(2, Math.round(w / step))
  const nz = Math.max(2, Math.round(d / step))
  for (let i = 0; i <= nx; i++) {
    const x = -x1 + (2 * x1 * i) / nx
    for (const z of [-z1, z1]) g.add(stick([x, r, z], [x, h - r, z], r * 0.8, color, 6))
    g.add(stick([x, r, -z1], [x, r, z1], r * 0.8, color, 6))
  }
  for (let i = 1; i < nz; i++) {
    const z = -z1 + (2 * z1 * i) / nz
    for (const x of [-x1, x1]) g.add(stick([x, r, z], [x, h - r, z], r * 0.8, color, 6))
  }
  return g
}

function pegBasketBody(p: string[], hang: boolean) {
  const [main] = p
  const g = new THREE.Group()
  const b = wireBasket(24, 10, 9, main)
  b.position.set(0, -12, 5.6) // z 0.6..10.6
  g.add(b)
  if (hang)
    for (const sx of [-1, 1]) {
      const x = sx * 8
      g.add(tube([[x, -3.2, 0.8], [x, -2.6, 0.2], [x, -2.6, -1]], 0.25, main, false, 10))
    }
  return g
}

const PEG_SHELF_SURF = (dz: number, dy: number) => ({ surface: -1.0 + dy, surfaceShape: [rectPoly(-14, 1 + dz, 14, 11.8 + dz)] })

const PEG_ACCESSORIES: AssetDef[] = [
  ...forms('peg-shelf', '洞洞板小层板', 'storage', ACC_PALS, [
    // 立放：整体抬高 11.2（托架底在地面），z 方向居中（包围盒 z -1..12.5 → 中心 5.75）
    { id: 'sf-peg-shelf-standing', form: 'standing', dims: [30, 13.5, 10.9], build: (p) => P(pegShelfBody(p), 0, 11.2, -5.75), extra: PEG_SHELF_SURF(-5.75, 11.2) },
    { id: 'sf-peg-shelf-hanging', form: 'hanging', dims: [30, 13.5, 10.9], build: (p) => pegShelfBody(p), extra: PEG_SHELF_SURF(0, 0) },
  ]),
  ...forms('peg-cup', '洞洞板收纳杯', 'storage', ACC_PALS, [
    { id: 'sf-peg-cup-standing', form: 'standing', dims: [7.6, 8.4, 10], build: (p) => ground(pegCupBody(p, false)) },
    { id: 'sf-peg-cup-hanging', form: 'hanging', dims: [7.6, 9.8, 10.2], build: (p) => pegCupBody(p, true) },
  ]),
  ...forms('peg-basket', '洞洞板挂篮', 'storage', ACC_PALS, [
    { id: 'sf-peg-basket-standing', form: 'standing', dims: [24, 10, 9], build: (p) => ground(pegBasketBody(p, false)) },
    { id: 'sf-peg-basket-hanging', form: 'hanging', dims: [24, 11.85, 9.7], build: (p) => pegBasketBody(p, true) },
  ]),
]

// ---------- 架子 ----------

/** 壁挂搁板：n 层，层距 gap，托架在每层板下 */
const TIER_W = 60
const TIER_D = 20
const TIER_GAP = 28
const TIER_BR = 6 // 托架高度（最下层板底离 mount）
function wallTier(n: number, mount: number): Build {
  return (p) => {
    const [board, metal] = p
    const g = new THREE.Group()
    const zb = -TIER_D / 2
    for (let i = 0; i < n; i++) {
      const y = mount + TIER_BR + i * TIER_GAP
      g.add(rbox(TIER_W, 2, TIER_D, board, { y }, 0.6))
      for (const sx of [-1, 1]) {
        const x = sx * (TIER_W / 2 - 8)
        g.add(rbox(2.4, 0.6, TIER_D - 3, metal, { x, y: y - 0.6, z: zb + (TIER_D - 3) / 2 + 0.6 }, 0.2))
        g.add(stick([x, y - TIER_BR + 0.8, zb + 0.9], [x, y - 0.5, zb + TIER_D - 6], 0.35, metal))
      }
    }
    for (const sx of [-1, 1]) g.add(rbox(2.4, TIER_BR + (n - 1) * TIER_GAP, 0.6, metal, { x: sx * (TIER_W / 2 - 8), y: mount, z: zb + 0.3 }, 0.2))
    return g
  }
}
const TIER_SPECS = [
  { n: 1, label: '单层', mount: 120 },
  { n: 2, label: '双层', mount: 105 },
  { n: 3, label: '三层', mount: 90 },
]
const WALL_TIERS: AssetDef[] = TIER_SPECS.map((t) => {
  const h = TIER_BR + (t.n - 1) * TIER_GAP + 2
  return asset(`sf-wall-shelf-${t.n}`, '壁挂搁板', 'storage', [TIER_W, TIER_D, h], SHELF_PALS, wallTier(t.n, t.mount), {
    family: 'wall-tier-shelf',
    sizeLabel: t.label,
    mount: t.mount,
    surface: t.mount + h,
    surfaces: Array.from({ length: t.n - 1 }, (_, i) => ({ y: t.mount + TIER_BR + i * TIER_GAP + 2, h: TIER_GAP - 2 })),
  })
})

/** 梯子架：两根斜靠的侧梁，4 层板从墙边一直到梁前 */
const LAD = { w: 60, d: 40, h: 160, ys: [10, 50, 90, 130] }
const ladZ = (y: number) => 18 - (36 * y) / LAD.h
function ladderShelf(p: string[]) {
  const [board, frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(bar([sx * (LAD.w / 2 - 1.5), 0.34, 18.5], [sx * (LAD.w / 2 - 1.5), LAD.h + 0.34, -18.5], 3, 3, frame))
  for (const y of LAD.ys) {
    const zf = Math.min(19, ladZ(y) + 3)
    g.add(rbox(LAD.w - 6, 2, zf + 19, board, { y, z: (zf - 19) / 2 }, 0.5))
  }
  return g
}
const LADDER = asset('sf-ladder-shelf', '梯子架', 'storage', [LAD.w, LAD.d, 160.7], SHELF_PALS, ladderShelf, {
  surfaces: LAD.ys.map((y, i) => ({ y: y + 2, h: i < LAD.ys.length - 1 ? 38 : 30, shape: [rectPoly(-LAD.w / 2 + 4, -18.5, LAD.w / 2 - 4, Math.min(19, ladZ(y) + 3) - 0.5)] })),
})

/** 转角架：四分之一圆，直角靠在左后角 */
const CORNER = { r: 32, ys: [2, 30, 58, 86, 114] }
function quarterPoly(r: number, inset = 0): Poly {
  const cx = -16
  const cz = -16
  const pts: Poly = [[cx + inset, cz + inset]]
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (PI / 2)
    pts.push([cx + inset + Math.cos(a) * (r - inset * 2), cz + inset + Math.sin(a) * (r - inset * 2)])
  }
  return pts
}
function cornerShelf(p: string[]) {
  const [board, frame] = p
  const g = new THREE.Group()
  for (const y of CORNER.ys) g.add(slab(quarterPoly(CORNER.r), 2, board, y))
  const posts: [number, number][] = [
    [-14.5, -14.5],
    [-14.5, 14.2],
    [14.2, -14.5],
    [-16 + Math.cos(PI / 4) * 30, -16 + Math.sin(PI / 4) * 30],
  ]
  for (const [x, z] of posts) g.add(cyl(1, 1, CORNER.ys[4], frame, { x, z }, 10))
  return g
}
const CORNER_SHELF = asset('sf-corner-shelf', '转角架', 'storage', [32, 32, 116], SHELF_PALS, cornerShelf, {
  surface: 116,
  surfaceShape: [quarterPoly(CORNER.r, 1)],
  surfaces: CORNER.ys.slice(0, 4).map((y) => ({ y: y + 2, h: 26, shape: [quarterPoly(CORNER.r, 1)] })),
})

/** 开放式层架：四柱 + n 层板（宽的加中柱） */
function rackYs(h: number, n: number) {
  return Array.from({ length: n }, (_, i) => 6 + (i * (h - 8)) / (n - 1))
}
function openRack(w: number, d: number, h: number, n: number): Build {
  return (p) => {
    const [board, frame] = p
    const g = new THREE.Group()
    const xs = w >= 100 ? [-1, 0, 1] : [-1, 1]
    for (const sx of xs)
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 1.5)
        g.add(rbox(3, h - 0.3, 3, frame, { x, z: sz * (d / 2 - 1.5) }, 0.4)) // 立柱顶藏进顶板，不与顶板顶面共面
      }
    for (const y of rackYs(h, n)) g.add(rbox(w - 0.4, 2, d - 0.4, board, { y }, 0.5))
    // 背后 X 撑
    const zb = -d / 2 + 0.6
    g.add(stick([-w / 2 + 3, 8, zb], [w / 2 - 3, h - 2.5, zb], 0.3, frame))
    g.add(stick([w / 2 - 3, 8, zb], [-w / 2 + 3, h - 2.5, zb], 0.3, frame))
    return g
  }
}
const RACK_SPECS = [
  { label: '60×30 · 3 层', w: 60, d: 30, h: 90, n: 3 },
  { label: '80×35 · 4 层', w: 80, d: 35, h: 120, n: 4 },
  { label: '120×35 · 5 层', w: 120, d: 35, h: 180, n: 5 },
]
const OPEN_RACKS: AssetDef[] = RACK_SPECS.map((s) =>
  asset(`sf-open-rack-${s.w}`, '开放式层架', 'storage', [s.w, s.d, s.h], SHELF_PALS, openRack(s.w, s.d, s.h, s.n), {
    family: 'open-rack',
    sizeLabel: s.label,
    surface: s.h,
    surfaceShape: [rectPoly(-s.w / 2 + 3, -s.d / 2 + 3, s.w / 2 - 3, s.d / 2 - 3)],
    surfaces: rackYs(s.h, s.n)
      .slice(0, -1)
      .map((y) => ({ y: y + 2, h: Math.round(((s.h - 8) / (s.n - 1) - 2) * 10) / 10, shape: [rectPoly(-s.w / 2 + 3, -s.d / 2 + 3, s.w / 2 - 3, s.d / 2 - 3)] })),
  }),
)

/** 金属线网架：圆柱 + 脚轮，层板是线网，层顶 = y + 0.4 */
const WIRE_R = 0.4
function wireShelf(g: THREE.Group, w: number, d: number, y: number, color: string) {
  const x1 = w / 2 - 1.5
  const z1 = d / 2 - 1.5
  g.add(stick([-x1, y, -z1], [x1, y, -z1], WIRE_R, color), stick([-x1, y, z1], [x1, y, z1], WIRE_R, color))
  g.add(stick([-x1, y, -z1], [-x1, y, z1], WIRE_R, color), stick([x1, y, -z1], [x1, y, z1], WIRE_R, color))
  const n = Math.round((2 * x1) / 3.5)
  for (let i = 1; i < n; i++) {
    const x = -x1 + (2 * x1 * i) / n
    g.add(stick([x, y, -z1], [x, y, z1], 0.25, color, 6))
  }
  for (const z of [-z1 + 4, z1 - 4]) g.add(stick([-x1, y - 0.6, z], [x1, y - 0.6, z], 0.3, color, 6))
}
function wireYs(h: number, n: number) {
  return Array.from({ length: n }, (_, i) => 12 + (i * (h - 12.4 - 12)) / (n - 1))
}
function wireRack(w: number, d: number, h: number, n: number): Build {
  return (p) => {
    const [wire, caster] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 1.5)
        const z = sz * (d / 2 - 1.5)
        g.add(cyl(1.3, 1.3, h - 5, wire, { x, y: 5, z }, 12))
        g.add(cyl(1.6, 1.6, 1, caster, { x, y: 4, z }, 12))
        g.add(rbox(1.2, 2, 2.4, caster, { x, y: 2, z }, 0.3))
        g.add(cylX(2, 1.4, caster, x, 2, z))
      }
    for (const y of wireYs(h, n)) wireShelf(g, w, d, y, wire)
    return g
  }
}
const WIRE_SPECS = [
  { label: '60×35 · 3 层', w: 60, d: 35, h: 90, n: 3 },
  { label: '90×45 · 4 层', w: 90, d: 45, h: 150, n: 4 },
  { label: '120×45 · 5 层', w: 120, d: 45, h: 180, n: 5 },
]
const WIRE_RACKS: AssetDef[] = WIRE_SPECS.map((s) => {
  const ys = wireYs(s.h, s.n)
  const shape = [rectPoly(-s.w / 2 + 3, -s.d / 2 + 2, s.w / 2 - 3, s.d / 2 - 2)]
  return asset(`sf-wire-rack-${s.w}`, '金属线网架', 'storage', [s.w + 0.2, s.d + 1, s.h], WIRE_PALS, wireRack(s.w, s.d, s.h, s.n), {
    family: 'wire-rack',
    sizeLabel: s.label,
    surface: Math.round((ys[ys.length - 1] + WIRE_R) * 10) / 10,
    surfaceShape: shape,
    surfaces: ys.slice(0, -1).map((y) => ({ y: Math.round((y + WIRE_R) * 10) / 10, h: Math.round((ys[1] - ys[0] - 1) * 10) / 10, shape })),
  })
})

/** 厨房置物架：木层板 + 黑铁架，顶层下面前沿一根挂杆（挂杯子、锅铲） */
const KR = { w: 60, d: 40, h: 130, ys: [8, 40, 72, 104, 128] }
const KR_BAR_Y = 118
function kitchenRack(p: string[]) {
  const [board, frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(2.5, KR.h - 0.3, 2.5, frame, { x: sx * (KR.w / 2 - 1.25), z: sz * (KR.d / 2 - 1.25) }, 0.4))
  for (const y of KR.ys) g.add(rbox(KR.w - 0.4, 2, KR.d - 0.4, board, { y }, 0.5))
  // 挂杆：从两根前柱伸出
  for (const sx of [-1, 1]) g.add(stick([sx * (KR.w / 2 - 1.25), KR_BAR_Y, KR.d / 2 - 1], [sx * (KR.w / 2 - 1.25), KR_BAR_Y, KR.d / 2 + 2.2], 0.5, frame))
  g.add(stick([-KR.w / 2 + 1.25, KR_BAR_Y, KR.d / 2 + 2.2], [KR.w / 2 - 1.25, KR_BAR_Y, KR.d / 2 + 2.2], 0.6, frame))
  return ground(g)
}
const KITCHEN_RACK = asset('sf-kitchen-rack', '厨房置物架', 'storage', [KR.w, 42.8, KR.h], SHELF_PALS, kitchenRack, {
  surface: KR.h,
  surfaces: [
    ...KR.ys.slice(0, -1).map((y) => ({ y: y + 2, h: 30, shape: [rectPoly(-KR.w / 2 + 3, -19.6, KR.w / 2 - 3, 16.8)] })),
    // 挂杆：杆顶 + 2.32（让 J 钩横臂搭在杆上）；ground 后 z 整体偏移 -1.4
    { y: KR_BAR_Y + 0.6 + 2.32, kind: 'hook' as const, h: Math.round((KR_BAR_Y + 0.6 + 2.32 - KR.ys[3] - 2) * 10) / 10, shape: [rectPoly(-KR.w / 2 + 3, KR.d / 2 + 2.2 - 1.4 - 1.5, KR.w / 2 - 3, KR.d / 2 + 2.2 - 1.4 + 1.5)] },
  ],
})

/** 桌面两层置物架（prop） */
function counterRack(p: string[]) {
  const [board, frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(cyl(0.7, 0.7, sz < 0 ? 36.6 : 34, frame, { x: sx * 21.5, z: sz * 9.5 }, 10))
  for (const y of [2, 32]) g.add(rbox(44, 2, 20, board, { y }, 0.5))
  // 后排立柱加高到顶层挡杆（以前挡杆比立柱高出 2cm，顶上那根悬空）
  g.add(stick([-21.5, 6, -9.5], [21.5, 6, -9.5], 0.3, frame))
  g.add(stick([-21.5, 36, -9.5], [21.5, 36, -9.5], 0.3, frame))
  return g
}
const COUNTER_RACK = prop('sf-counter-rack', '桌面置物架', 'storage', [44.6, 20.6, 36.6], SHELF_PALS, (p) => ground(counterRack(p)), {
  surface: 34,
  surfaces: [{ y: 4, h: 28, shape: [rectPoly(-20.5, -8.5, 20.5, 9)] }],
})

/** 浴室角架：壁挂三层三角网篮，直角在左后 */
const BATH = { s: 24, mount: 90, ys: [0, 24, 48], t: 1 }
function triPoly(s: number, inset = 0): Poly {
  const c = -s / 2 + inset
  return [
    [c, c],
    [s / 2 - inset * 2.4, c],
    [c, s / 2 - inset * 2.4],
  ]
}
function bathCorner(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  for (const y0 of BATH.ys) {
    const y = BATH.mount + y0
    g.add(slab(triPoly(BATH.s), BATH.t, main, y))
    // 斜边挡条
    const a: V3 = [BATH.s / 2 - 2, y + 3, -BATH.s / 2 + 0.8]
    const b: V3 = [-BATH.s / 2 + 0.8, y + 3, BATH.s / 2 - 2]
    g.add(stick(a, b, 0.3, sub))
    for (const t of [0.15, 0.5, 0.85]) {
      const x = a[0] + (b[0] - a[0]) * t
      const z = a[2] + (b[2] - a[2]) * t
      g.add(stick([x, y + BATH.t - 0.2, z], [x, y + 3, z], 0.25, sub, 6))
    }
  }
  g.add(rbox(2, 50, 0.6, sub, { x: -BATH.s / 2 + 1.5, y: BATH.mount, z: -BATH.s / 2 + 0.3 }, 0.2))
  return g
}
// 和 wet.ts / bath-corners.ts 的各款转角架同一系列
const BATH_CORNER = asset('sf-bath-corner', '浴室转角架', 'storage', [24, 24, 51.3], WIRE_PALS, bathCorner, {
  family: 'bath-corner-shelf',
  sizeLabel: '三角网篮 3 层',
  mount: BATH.mount,
  surfaces: BATH.ys.map((y, i) => ({ y: BATH.mount + y + BATH.t, h: i < 2 ? 23 : 30, shape: [triPoly(BATH.s, 1)] })),
})

/** 壁挂展示格：3 × 2 格 */
const DC = { w: 90, d: 18, h: 60, mount: 120, t: 1.6 }
function displayCube(p: string[]) {
  const [board, back] = p
  const g = new THREE.Group()
  const y0 = DC.mount
  g.add(rbox(DC.w - 2, DC.h - 2, 0.6, back, { y: y0 + 1, z: -DC.d / 2 + 0.3 }, 0.2))
  for (const y of [0, (DC.h - DC.t) / 2, DC.h - DC.t]) g.add(rbox(DC.w, DC.t, DC.d, board, { y: y0 + y }, 0.4))
  for (const x of [-1, -1 / 3, 1 / 3, 1]) g.add(rbox(DC.t, DC.h - DC.t * 2 + 0.2, DC.d - 0.2, board, { x: (x * (DC.w - DC.t)) / 2, y: y0 + DC.t - 0.1 }, 0.3))
  return g
}
const DISPLAY_CUBE = asset('sf-display-cube', '壁挂展示格', 'storage', [DC.w, DC.d, DC.h], SHELF_PALS, displayCube, {
  mount: DC.mount,
  surface: DC.mount + DC.h,
  surfaces: [{ y: DC.mount + DC.t, h: (DC.h - DC.t * 3) / 2 }, { y: DC.mount + (DC.h - DC.t) / 2 + DC.t, h: (DC.h - DC.t * 3) / 2 }],
})

/** 鞋架：每层三根横杆，顶上一块板 */
function shoeYs(n: number) {
  return Array.from({ length: n }, (_, i) => 8 + i * 18)
}
function shoeRack(w: number, d: number, h: number, n: number): Build {
  return (p) => {
    const [board, frame] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 1.5)
      for (const sz of [-1, 1]) g.add(rbox(3, h - 2, 3, frame, { x, z: sz * (d / 2 - 1.5) }, 0.4))
      for (const y of shoeYs(n)) g.add(rbox(3, 2, d - 3, frame, { x, y: y - 2.5, z: 0 }, 0.4))
    }
    for (const y of shoeYs(n))
      for (const z of [-d / 3, 0, d / 3]) g.add(cylX(1, w - 3, board, 0, y - 1, z))
    g.add(rbox(w, 2, d, board, { y: h - 2 }, 0.5))
    return g
  }
}
const SHOE_SPECS = [
  { label: '2 层', w: 60, d: 28, h: 40, n: 1 },
  { label: '4 层', w: 80, d: 30, h: 80, n: 3 },
]
const SHOE_RACKS: AssetDef[] = SHOE_SPECS.map((s) =>
  asset(`sf-shoe-rack-${s.n + 1}`, '鞋架', 'storage', [s.w, s.d, s.h], SHELF_PALS, shoeRack(s.w, s.d, s.h, s.n), {
    family: 'shoe-rack',
    sizeLabel: s.label,
    surface: s.h,
    surfaces: shoeYs(s.n).map((y) => ({ y, h: s.n === 1 ? s.h - 2 - y : 16, shape: [rectPoly(-s.w / 2 + 3, -s.d / 2 + 2, s.w / 2 - 3, s.d / 2 - 2)] })),
  }),
)

/** 挂衣杆：底部一层置物、顶上横杆（挂钩层：衣架钩内顶搭在杆上） */
const GR = { d: 45, h: 156.2, railY: 155, railR: 1.2, shelfY: 20 }
function garmentRail(w: number): Build {
  return (p) => {
    const [main, frame] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 2)
      g.add(rbox(3, 2.4, GR.d - 4, frame, { x, y: 3, z: 0 }, 0.6))
      for (const sz of [-1, 1]) {
        g.add(cyl(1.6, 1.6, 1.2, frame, { x, y: 1.8, z: sz * (GR.d / 2 - 3) }, 12))
        g.add(ball(1.8, M.black, { x, y: 1.8, z: sz * (GR.d / 2 - 3) }))
      }
      g.add(cyl(1.2, 1.2, GR.railY - 5, frame, { x, y: 5 }, 12))
      g.add(ball(1.2, frame, { x, y: GR.railY }))
    }
    g.add(cylX(GR.railR, w - 4, frame, 0, GR.railY, 0))
    for (const z of [-12, -4, 4, 12]) g.add(rbox(w - 6, 1.6, 6, main, { y: GR.shelfY - 1.6, z }, 0.4))
    // 层板木条下的两根托架（以前木条只搭在立柱上的一个点，大部分悬空）
    for (const s of [-1, 1]) g.add(rbox(2, 1.8, 32, frame, { x: s * (w / 2 - 4), y: GR.shelfY - 3.3 }, 0.5))
    return ground(g)
  }
}
const GARMENT_RAILS: AssetDef[] = [80, 120].map((w) =>
  asset(`sf-garment-rail-${w}`, '挂衣杆', 'storage', [w - 0.4, 42.6, GR.h], SHELF_PALS, garmentRail(w), {
    family: 'garment-rail',
    sizeLabel: `${w}`,
    surfaces: [
      { y: GR.shelfY, h: 40, shape: [rectPoly(-w / 2 + 5, -14, w / 2 - 5, 14)] },
      { y: GR.railY + GR.railR + 0.45, kind: 'hook', h: GR.railY - GR.shelfY - 2, shape: [rectPoly(-w / 2 + 5, -1.7, w / 2 - 5, 1.3)] },
    ],
  }),
)

/** 毛巾杆：壁挂，杆中心离墙 6cm */
const TB = { w: 60, d: 6.2, mount: 100, barZ: 1.9, barR: 1 }
function towelBar(n: number): Build {
  return (p) => {
    const [main, metal] = p
    const g = new THREE.Group()
    for (let i = 0; i < n; i++) {
      const y = TB.mount + 2.6 + i * 26
      for (const sx of [-1, 1]) {
        const x = sx * (TB.w / 2 - 3)
        g.add(cylZ(2.6, 1, metal, x, y, -TB.d / 2 + 0.5))
        g.add(cylZ(0.9, TB.barZ + TB.d / 2 - 1, metal, x, y, (-TB.d / 2 + 1 + TB.barZ) / 2))
      }
      g.add(cylX(TB.barR, TB.w - 4, main, 0, y, TB.barZ))
      for (const sx of [-1, 1]) g.add(ball(1.2, main, { x: sx * (TB.w / 2 - 2), y, z: TB.barZ }))
    }
    return g
  }
}
const TOWEL_BARS: AssetDef[] = [1, 2].map((n) =>
  asset(`sf-towel-bar-${n}`, '毛巾杆', 'storage', [59.2, TB.d, 5.2 + (n - 1) * 26], WIRE_PALS, towelBar(n), {
    family: 'towel-bar',
    sizeLabel: n === 1 ? '单杆' : '双层',
    mount: TB.mount,
    surfaces: Array.from({ length: n }, (_, i) => ({
      y: TB.mount + 2.6 + i * 26 + TB.barR + 0.5,
      kind: 'hook' as const,
      h: TB.mount + i * 26,
      shape: [rectPoly(-TB.w / 2 + 5, TB.barZ - 1.7, TB.w / 2 - 5, TB.barZ + 1.3)],
    })),
  }),
)

/** 墙上挂钩排：木条 + 圆头木钉；每颗木钉一块挂点（J 钩横臂搭在木钉上） */
const HR = { mount: 150, h: 9, pegY: 3.5, pegR: 0.8, pegL: 5 }
function hookRail(w: number, n: number): Build {
  return (p) => {
    const [board, peg] = p
    const g = new THREE.Group()
    // 木条 z -3.7..-1.9；木钉 z -2.1..2.9，圆头到 3.68
    g.add(rbox(w, HR.h, 1.8, board, { y: HR.mount, z: -2.8 }, 0.5))
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * (w / n)) / 2 + i * (w / n)
      g.add(cylZ(HR.pegR, HR.pegL, peg, x, HR.mount + HR.pegY, 0.4))
      g.add(ball(1.3, peg, { x, y: HR.mount + HR.pegY, z: 2.9 }, [1, 1, 0.6]))
    }
    return g
  }
}
function railHooks(w: number, n: number, zPeg: number, yTop: number) {
  return [
    {
      y: yTop,
      kind: 'hook' as const,
      h: Math.round(yTop - 5),
      shape: Array.from({ length: n }, (_, i) => {
        const x = -((n - 1) * (w / n)) / 2 + i * (w / n)
        return rectPoly(x - 2.5, zPeg - 1.5, x + 2.5, zPeg + 1.5)
      }),
    },
  ]
}
const HOOK_RAILS: AssetDef[] = [
  { w: 50, n: 4 },
  { w: 80, n: 6 },
].map((s) =>
  asset(`sf-hook-rail-${s.n}`, '墙上挂钩排', 'storage', [s.w, 7.4, HR.h], SHELF_PALS, hookRail(s.w, s.n), {
    family: 'hook-rail',
    sizeLabel: `${s.n} 钩`,
    mount: HR.mount,
    surfaces: railHooks(s.w, s.n, -0.4, HR.mount + HR.pegY + HR.pegR + 2.32),
  }),
)

/** 门后挂钩：上端钩住门顶（往 -z 绕过门板），竖条上 5 个钩 */
const DH = { mount: 150, w: 10, h: 48 }
function doorHooks(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  const y0 = DH.mount
  g.add(rbox(2.4, DH.h - 2, 0.6, main, { y: y0, z: 0.3 }, 0.2))
  // 门顶钩：越过 4cm 门板再往下
  g.add(rbox(2.4, 0.6, 5, main, { y: y0 + DH.h - 2, z: -2.2 }, 0.2))
  g.add(rbox(2.4, 4, 0.6, main, { y: y0 + DH.h - 5.4, z: -4.4 }, 0.2))
  for (let i = 0; i < 5; i++) {
    const y = y0 + 4 + i * 9
    for (const sx of [-1, 1]) {
      g.add(tube([[sx * 1.6, y + 3, 0.6], [sx * 3, y + 1, 1.5], [sx * 3.6, y, 3], [sx * 3.8, y + 1.5, 3.8]], 0.3, main, false, 12))
    }
  }
  return g
}
const DOOR_HOOKS = asset('sf-door-hooks', '门后挂钩', 'storage', [8.2, 8.8, 46.6], ACC_PALS, doorHooks, {
  mount: DH.mount,
  surfaces: Array.from({ length: 5 }, (_, i) => ({
    y: DH.mount + 4 + i * 9 + 0.3 + 2.32,
    kind: 'hook' as const,
    h: DH.mount + i * 9,
    shape: [rectPoly(-4.6, 2.3 - 1.5, -2.6, 2.3 + 1.5), rectPoly(2.6, 2.3 - 1.5, 4.6, 2.3 + 1.5)],
  })),
})

/** 伞挂：一块小木板 + 三个大 J 钩 */
const UH = { mount: 110, w: 40 }
function umbrellaHook(p: string[]) {
  const [board, metal] = p
  const g = new THREE.Group()
  g.add(rbox(UH.w, 8, 1.6, board, { y: UH.mount + 4, z: -4.2 }, 0.5))
  for (const x of [-12, 0, 12]) g.add(tube([[x, UH.mount + 8, -3.4], [x, UH.mount + 6, -1.5], [x, UH.mount + 4, 1.5], [x, UH.mount + 3.6, 3.8], [x, UH.mount + 5.2, 4.8]], 0.5, metal, false, 14))
  return g
}
const UMBRELLA_HOOK = asset('sf-umbrella-hook', '伞挂', 'storage', [UH.w, 10.3, 9], SHELF_PALS, umbrellaHook, {
  mount: UH.mount + 3,
  surfaces: [{ y: UH.mount + 3.6 + 0.5 + 2.32, kind: 'hook', h: UH.mount, shape: [-12, 0, 12].map((x) => rectPoly(x - 2.5, 1.2, x + 2.5, 4.2)) }],
})

/** 厨房挂杆：壁挂一根圆杆，S 钩可以挂满一排 */
const KB = { w: 60, mount: 140, barZ: 2.35, barR: 0.8 }
function kitchenBar(p: string[]) {
  const [, metal] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * (KB.w / 2 - 3)
    g.add(cylZ(2, 0.8, metal, x, KB.mount + 2, -2.75))
    g.add(cylZ(0.6, 4.7, metal, x, KB.mount + 2, 0))
  }
  g.add(cylX(KB.barR, KB.w, metal, 0, KB.mount + 2, KB.barZ))
  return g
}
const KITCHEN_BAR = asset('sf-kitchen-bar', '厨房挂杆', 'storage', [KB.w, 6.3, 4], WIRE_PALS, kitchenBar, {
  mount: KB.mount,
  surfaces: [{ y: KB.mount + 2 + KB.barR + 0.5, kind: 'hook', h: 50, shape: [rectPoly(-KB.w / 2 + 3, KB.barZ - 1.7, KB.w / 2 - 3, KB.barZ + 1.3)] }],
})

// ---------- 多形态物品 ----------

// 耳机 / 耳麦：挂起时头梁搭在 J 钩横臂上
const HP_PALS: Pal[] = [
  ['modern', [M.black, M.char, M.silver]],
  ['modern', [M.white, M.light, M.silver]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['nordic', [N.sage, N.linen, N.oak]],
  ['retro', [R.caramel, R.cream, R.mustard]],
]
function phonesBody(p: string[], mic: boolean) {
  const [band, pad, acc] = p
  const g = new THREE.Group()
  const Rr = 8
  g.add(torus(Rr, 0.9, band, {}, PI))
  g.add(torus(Rr - 1.1, 0.6, pad, { rz: PI * 0.3 }, PI * 0.4))
  for (const s of [-1, 1]) {
    const x = s * Rr
    g.add(rbox(1.6, 4, 1.4, acc, { x, y: -4 }, 0.4))
    g.add(cylX(4.2, 3, band, x + s * 0.4, -7.5, 0, 24))
    g.add(cylX(3.5, 1.4, pad, x - s * 1.6, -7.5, 0, 24))
    g.add(cylX(2.2, 0.4, acc, x + s * 2.0, -7.5, 0, 24))
  }
  if (mic) {
    g.add(tube([[-Rr - 2, -8.5, 1], [-Rr - 2.2, -11.5, 3.5], [-Rr + 0.5, -14.2, 6], [-Rr + 3.2, -14.8, 6.6]], 0.35, band))
    g.add(capsule(0.9, 1, acc, { x: -Rr + 4.2, y: -14.8 - 1.9, z: 6.6 }))
  }
  return g
}
const phonesHang = (p: string[], mic: boolean) => G(hangAt(phonesBody(p, mic), -0.2, 4.5), jHook(mic ? 10 : 8))
const phonesLying = (p: string[], mic: boolean) => laid(phonesBody(p, mic), -PI / 2)

// 网络摄像头
const CAM_PALS: Pal[] = [
  ['modern', [M.black, M.char, '#4a5a6a']],
  ['modern', [M.white, M.light, '#4a5a6a']],
  ['cute', [C.sky, C.white, C.pink]],
  ['retro', [R.cream, R.caramel, R.teal]],
]
function camHead(p: string[]) {
  const [body, trim, lens] = p
  return G(
    P(capsule(1.6, 6.4, body), 0, 0, 0, 0, 0, PI / 2),
    cylZ(1.15, 0.6, trim, 0, 0, 1.4),
    cylZ(0.75, 0.4, lens, 0, 0, 1.7),
    ball(0.25, '#7ee08a', { x: 2.4, y: 0.6, z: 1.35 }),
  )
}
function camStanding(p: string[]) {
  const [, trim] = p
  const g = new THREE.Group()
  g.add(P(camHead(p), 0, 12.2, 0))
  g.add(rbox(2.4, 1.4, 2.4, trim, { y: 9.9 }, 0.4))
  g.add(ball(0.8, trim, { y: 9.6 }))
  g.add(cyl(0.5, 0.5, 3.2, trim, { y: 6.2 }, 10))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2
    g.add(stick([0, 6.6, 0], [Math.cos(a) * 5.5, 0.35, Math.sin(a) * 5.5], 0.35, trim))
    g.add(ball(0.5, M.black, { x: Math.cos(a) * 5.5, y: 0.5, z: Math.sin(a) * 5.5 }))
  }
  return ground(g)
}
function camLying(p: string[]) {
  const [, trim] = p
  const g = new THREE.Group()
  g.add(P(camHead(p), 0, 1.7, 0.6))
  g.add(rbox(4.2, 0.8, 4.4, trim, { y: 0, z: -1.6 }, 0.3))
  g.add(cylX(0.5, 3, trim, 0, 0.8, -1.2))
  return ground(g)
}

// 托特包
const TOTE_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.blue]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['cute', [C.sakura, C.pink, C.white]],
  ['industrial', [I.concrete, I.leather, I.iron]],
  ['retro', [R.mustard, R.caramel, R.cream]],
]
function toteBody(p: string[]) {
  const [cloth, , acc] = p
  return G(tray(34, 36, 10, 0.6, cloth, {}, 0.28), rbox(14, 10, 0.6, acc, { y: 12, z: 5.1 }, 0.2))
}
function toteStanding(p: string[]) {
  const [, strap] = p
  const g = toteBody(p)
  for (const z of [-4.7, 4.7]) g.add(torus(7, 0.6, strap, { y: 35.4, z }, PI))
  return ground(g)
}
function toteHanging(p: string[]) {
  const [, strap] = p
  const top = -6.4 + 0.25 + 0.6 - 22
  const body = toteBody(p)
  body.position.set(0, top - 36, 0.3 + 5)
  const g = G(body, sHook())
  for (const z of [0.3 + 0.3 + 0.4, 0.3 + 10 - 0.6 - 0.4])
    g.add(tube([[-7, top - 0.5, z], [-3.5, top + 11, (z + S_Z) / 2], [0, -5.55, S_Z], [3.5, top + 11, (z + S_Z) / 2], [7, top - 0.5, z]], 0.6, strap, false, 30))
  return g
}

// 双肩包
const BP_PALS: Pal[] = [
  ['modern', [M.char, M.black, M.silver]],
  ['nordic', [N.sage, N.oak, N.linen]],
  ['cute', [C.lilac, C.pink, C.white]],
  ['industrial', [I.leather, I.walnut, I.iron]],
  ['retro', [R.teal, R.mustard, R.cream]],
]
/** 双肩包本体：背带在 -z，底面 y = 0 */
function backpackBody(p: string[], handle: boolean) {
  const [main, trim, acc] = p
  const g = new THREE.Group()
  g.add(rbox(28, 40, 14, main, {}, 5))
  g.add(rbox(20, 14, 4, trim, { y: 4, z: 7.4 }, 1.8))
  g.add(ball(0.6, acc, { x: 6, y: 16.6, z: 9.2 }))
  g.add(rbox(16, 1, 0.6, acc, { y: 30, z: 6.9 }, 0.2))
  if (handle) g.add(torus(3, 0.5, trim, { y: 39.6, z: -4 }, PI))
  for (const s of [-1, 1]) g.add(tube([[s * 7, 37, -6.6], [s * 8.5, 28, -9.2], [s * 9, 14, -9.2], [s * 8, 4, -6.6]], 1, trim))
  return g
}
function backpackHanging(p: string[]) {
  const [, trim] = p
  const body = backpackBody(p, false)
  const top = -14
  body.position.set(0, top - 40, 0.3 + 10.2)
  const g = G(body, sHook())
  g.add(tube([[-3, top - 0.6, 6.5], [-2.2, -8, (6.5 + S_Z) / 2 + 0.5], [0, -5.65, S_Z], [2.2, -8, (6.5 + S_Z) / 2 + 0.5], [3, top - 0.6, 6.5]], 0.5, trim, false, 24))
  return g
}

// 帽子（棒球帽）
const HAT_PALS: Pal[] = [
  ['modern', [M.char, M.black, M.white]],
  ['nordic', [N.linen, N.oak, N.blue]],
  ['cute', [C.lemon, C.white, C.pink]],
  ['retro', [R.red, R.cream, R.mustard]],
  ['japanese', [J.ai, J.washi, J.shu]],
]
function capBody(p: string[]) {
  const [main, trim, acc] = p
  const g = new THREE.Group()
  g.add(dome(9, main, 0, 0, 0, 0.78))
  const brim = ball(1, trim, { y: 0.3, z: 10.5 }, [8, 0.5, 6])
  brim.rotation.x = 0.12
  g.add(brim)
  g.add(ball(0.8, acc, { y: 6.9 }))
  g.add(rbox(4, 1.6, 1.2, acc, { y: 0.6, z: -8.6 }, 0.3))
  return g
}

// 围巾
const SCARF_PALS: Pal[] = [
  ['nordic', [N.blue, N.linen, N.mustard]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['retro', [R.red, R.cream, R.mustard]],
  ['japanese', [J.ai, J.washi, J.shu]],
  ['industrial', [I.concrete, I.iron, I.rust]],
]
function fringe(g: THREE.Group, x0: number, x1: number, y: number, z: number, color: string, len = 2.4) {
  for (let i = 0; i < 7; i++) {
    const x = x0 + ((x1 - x0) * i) / 6
    g.add(rbox(0.8, len, 0.5, color, { x, y: y - len + 0.3, z }, 0.2))
  }
}
function scarfFolded(p: string[]) {
  const [main, sec, acc] = p
  const g = new THREE.Group()
  g.add(rbox(22, 2, 16, main, { y: 0 }, 0.9))
  g.add(rbox(21.6, 2, 15.6, main, { y: 1.8 }, 0.9))
  g.add(rbox(22, 2, 16, main, { y: 3.6 }, 0.9))
  for (const x of [-6, 0, 6]) g.add(rbox(1.6, 5.9, 16.3, sec, { x, y: -0.05 }, 0.4))
  for (let i = 0; i < 6; i++) g.add(rbox(2.4, 0.5, 0.8, acc, { x: 12, y: 2.5, z: -6 + i * 2.4 }, 0.2))
  return ground(g)
}
function scarfHanging(p: string[]) {
  const [main, sec, acc] = p
  const g = G(sHook())
  const top = -6.0
  const zc = S_Z
  g.add(cylX(1.0, 16, main, 0, top, zc))
  g.add(rbox(16, 60, 0.7, main, { y: top - 60, z: zc + 0.6 }, 0.3))
  g.add(rbox(16, 50, 0.7, main, { y: top - 50, z: zc - 0.6 }, 0.3))
  g.add(rbox(16.3, 2.4, 1.1, sec, { y: top - 56, z: zc + 0.6 }, 0.4))
  g.add(rbox(16.3, 2.4, 1.1, sec, { y: top - 46, z: zc - 0.6 }, 0.4))
  fringe(g, -7, 7, top - 60, zc + 0.6, acc)
  fringe(g, -7, 7, top - 50, zc - 0.6, acc)
  return g
}

// 毛巾
const TOWEL_PALS: Pal[] = [
  ['nordic', [N.white, N.blue, N.gray]],
  ['cute', [C.mint, C.white, C.pink]],
  ['modern', [M.light, M.char, M.white]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['retro', [R.mustard, R.cream, R.orange]],
]
function towelFolded(p: string[]) {
  const [main, sec] = p
  const g = new THREE.Group()
  g.add(rbox(32, 2.2, 20, main, { y: 0 }, 1))
  g.add(rbox(31.6, 2.2, 19.6, main, { y: 2.1 }, 1))
  g.add(rbox(32, 2.2, 20, main, { y: 4.2 }, 1))
  g.add(rbox(3, 6.6, 20.4, sec, { x: 10, y: -0.1 }, 0.5))
  return ground(g)
}
function towelHanging(p: string[]) {
  const [main, sec, acc] = p
  const g = G(sHook())
  // 小挂环套在 S 钩下环上
  g.add(torus(1.2, 0.3, acc, { y: S_LOW - 0.6, z: S_Z }))
  const top = S_LOW - 1.6
  g.add(rbox(34, 60, 1.4, main, { y: top - 60, z: S_Z }, 0.6))
  for (const y of [top - 55, top - 51]) g.add(rbox(34.4, 2, 1.8, sec, { y, z: S_Z }, 0.4))
  return g
}

// T 恤 / 裤子：叠好 / 挂在衣架上
const CLOTH_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.blue]],
  ['modern', [M.char, M.black, M.light]],
  ['cute', [C.sky, C.woodL, C.pink]],
  ['retro', [R.mustard, R.caramel, R.red]],
  ['japanese', [J.ai, J.hinoki, J.washi]],
]
const GARM_Z = 2.2
function shirtFolded(p: string[]) {
  const [main, , acc] = p
  const g = new THREE.Group()
  g.add(rbox(26, 3.6, 32, main, {}, 1.2))
  g.add(torus(3.4, 0.5, main, { y: 3.6, z: -12, rx: PI / 2 }, PI))
  g.add(rbox(4, 0.5, 4, acc, { x: 6, y: 3.4, z: 2 }, 0.2))
  return ground(g)
}
/** 衣架：钩 + 两根斜肩条（+ 底杆）；肩条中心在 z = GARM_Z */
function hangerFrame(wood: string, withBar: boolean, zc = GARM_Z) {
  const g = G(hangerHook(zc))
  const y0 = -5.4
  for (const s of [-1, 1]) g.add(bar([0, y0, zc], [s * 19, y0 - 8, zc], 1.4, 0.8, wood))
  g.add(rbox(3, 1.6, 0.9, wood, { y: y0 - 0.9, z: zc }, 0.3))
  if (withBar) {
    g.add(stick([-18.6, y0 - 8.4, zc], [18.6, y0 - 8.4, zc], 0.45, wood))
  }
  return g
}
function shirtHanging(p: string[]) {
  const [main, wood, acc] = p
  const g = hangerFrame(wood, false)
  const y0 = -5.4
  const ang = Math.atan2(8, 19)
  // 肩：沿肩条斜放，把肩条包在里面
  for (const s of [-1, 1]) {
    const sh = rbox(20, 4, 2.8, main, {}, 1)
    sh.position.set(s * 10.6, y0 - 4.6, GARM_Z)
    sh.rotation.z = s * -ang
    g.add(sh)
    const sl = rbox(10, 16, 2.2, main, {}, 1)
    sl.position.set(s * 21.2, y0 - 25, GARM_Z)
    sl.rotation.z = s * 0.45
    g.add(sl)
  }
  g.add(rbox(40, 60.4, 2.4, main, { y: y0 - 62, z: GARM_Z }, 1))
  g.add(torus(3.2, 0.55, acc, { y: y0 - 2.9, z: GARM_Z + 1.4, rz: PI }, PI))
  g.add(rbox(7, 7, 0.6, acc, { x: 10, y: y0 - 24, z: GARM_Z + 1.4 }, 0.3))
  return g
}
function pantsFolded(p: string[]) {
  const [, , acc] = p
  const main = p[1] === p[0] ? p[0] : shade(p[2], -0.05)
  const g = new THREE.Group()
  g.add(rbox(28, 4.4, 34, main, {}, 1.4))
  g.add(rbox(4, 4.8, 34.4, shade(main, -0.08), { x: -8, y: -0.2 }, 0.6))
  void acc
  return ground(g)
}
function pantsHanging(p: string[]) {
  const [, wood] = p
  const main = shade(p[2], -0.05)
  const g = hangerFrame(wood, true)
  const by = -5.4 - 8.4
  g.add(cylX(1.6, 40, main, 0, by, GARM_Z))
  g.add(rbox(40, 48, 1.2, main, { y: by - 48, z: GARM_Z + 0.85 }, 0.5))
  g.add(rbox(40, 42, 1.2, main, { y: by - 42, z: GARM_Z - 0.85 }, 0.5))
  g.add(rbox(0.5, 46, 0.4, shade(main, -0.12), { y: by - 47, z: GARM_Z + 1.6 }, 0.15))
  return g
}

// 马克杯：挂起时把手套在 J 钩横臂上，杯口朝 -x
const MUG_PALS: Pal[] = [
  ['nordic', [N.white, N.blue, N.oak]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['retro', [R.teal, R.cream, R.mustard]],
  ['modern', [M.char, M.white, M.silver]],
]
function mugBody(p: string[]) {
  const [main, sec] = p
  return G(cup(4, 3.8, 9.5, 0.45, main), torus(4.02, 0.28, sec, { y: 7, rx: PI / 2 }), torus(2.4, 0.55, main, { x: 3.9, y: 5, rz: -PI / 2 }, PI))
}
const mugHanging = (p: string[]) => G(hangAt(turned(mugBody(p), 0, 0, PI / 2), J_ARM + 0.32 + 1.1 + 0.1, 4.6), jHook(8))

// 工具：在 xy 平面里建模（挂孔在上），平放时转平
const TOOL_PALS: Pal[] = [
  ['modern', [M.char, M.silver, M.black]],
  ['industrial', [I.rust, I.steel, I.iron]],
  ['cute', [C.pink, C.steel, C.white]],
  ['nordic', [N.mustard, M.silver, N.oak]],
  ['retro', [R.red, M.silver, R.cream]],
]
function scissorsBody(p: string[]) {
  const [grip, metal, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(torus(1.9, 0.55, grip, { x: s * 2.4, y: -2.45 }))
    g.add(stick([s * 2.1, -4.3, s * 0.25], [0, -7.2, s * 0.25], 0.55, grip))
    const b = rbox(1.3, 13, 0.4, metal, {}, 0.15)
    b.position.set(-s * 0.35, -13.2, s * 0.25)
    b.rotation.z = s * 0.06
    g.add(b)
  }
  g.add(cylZ(0.55, 1.2, acc, 0, -7.2, 0, 12))
  return g
}
function pliersBody(p: string[]) {
  const [grip, metal, acc] = p
  const g = new THREE.Group()
  // 挂绳环在手柄尾端
  g.add(torus(1.5, 0.25, acc, { x: -1.0, y: -1.8 }))
  for (const s of [-1, 1]) {
    g.add(bar([s * 1.0, -3.4, 0], [s * 0.9, -12, 0], 1.6, 1.2, grip))
    g.add(bar([s * 0.8, -12, 0], [s * 0.45, -16, 0], 1.1, 0.8, metal))
    g.add(bar([s * 0.45, -16, 0], [s * 0.25, -20, 0], 0.8, 0.7, metal))
  }
  g.add(cylZ(0.9, 1.1, metal, 0, -15.6, 0, 12))
  return g
}
function wrenchBody(p: string[]) {
  const [grip, metal] = p
  const g = new THREE.Group()
  g.add(torus(1.4, 0.55, metal, { y: -2 }))
  g.add(bar([0, -3.6, 0], [0, -16, 0], 1.6, 0.6, metal))
  g.add(rbox(1.7, 6, 0.8, grip, { y: -12 }, 0.3))
  g.add(torus(1.7, 0.75, metal, { y: -18.6, rz: PI * 0.75 }, PI * 1.5))
  return g
}
function tapeBody(p: string[]) {
  const [grip, metal, acc] = p
  const g = new THREE.Group()
  g.add(torus(1.3, 0.25, acc, { y: -1.5 }))
  g.add(rbox(1.6, 1.2, 1, acc, { y: -3.4 }, 0.3))
  g.add(rbox(7.4, 7.4, 3.6, grip, { y: -10.6 }, 2))
  g.add(cylZ(2.4, 0.4, metal, 0, -6.9, 1.9))
  g.add(rbox(1.6, 1.8, 2.4, metal, { x: 3.6, y: -10.6 }, 0.3))
  return g
}
/** 螺丝刀：手柄在上，竖直 */
function driver(len: number, grip: string, metal: string) {
  return G(capsule(0.9, 4.6, grip, { y: -6.4 }), cyl(0.95, 0.95, 1.6, shade(grip, -0.15), { y: -5.2 }, 12), cyl(0.25, 0.25, len, metal, { y: -6.2 - len }, 8), cyl(0.12, 0.25, 0.8, metal, { y: -7 - len }, 8))
}
const DRV_LEN = [6, 8, 10, 8, 6]
function driversLying(p: string[]) {
  const [grip, metal, acc] = p
  const g = new THREE.Group()
  DRV_LEN.forEach((len, i) => {
    const d = driver(len, i % 2 ? acc : grip, metal)
    d.rotation.x = PI / 2
    d.position.set(-5.2 + i * 2.6, 0.95, -4)
    g.add(d)
  })
  return ground(g)
}
function driversHanging(p: string[]) {
  const [grip, metal, acc] = p
  const g = new THREE.Group()
  const by = -9.6
  g.add(rbox(16, 1.8, 3.6, acc, { y: by - 1.8, z: 2.5 }, 0.4))
  for (const x of [-6, 6]) {
    g.add(rbox(1.4, 4, 0.6, metal, { x, y: by - 2.8, z: 0.6 }, 0.2))
    g.add(stick([x, by - 1, -1], [x, by - 1, 0.6], 0.3, metal))
  }
  DRV_LEN.forEach((len, i) => {
    const d = driver(len, i % 2 ? acc : grip, metal)
    d.position.set(-5.6 + i * 2.8, by + 0.2 + 6.4 - 0.1, 2.6)
    g.add(d)
  })
  return g
}
const toolHang = (body: THREE.Group, ring: boolean, xOff = 0, zc = 2.8) => G(hangAt(body, ring ? J_ARM + 0.32 + 1.0 + 0.1 : J_UNDER, zc, xOff), jHook(6))

// 数据线
const CABLE_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.silver]],
  ['modern', [M.black, M.char, M.silver]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['retro', [R.orange, R.cream, R.teal]],
]
function cableBody(p: string[]) {
  const [main, plug, acc] = p
  const g = new THREE.Group()
  g.add(torus(4.5, 0.32, main, { z: 0 }))
  g.add(torus(4.2, 0.32, main, { x: 0.4, y: -0.3, z: 0.65 }))
  g.add(torus(4.6, 0.32, main, { x: -0.3, y: -0.2, z: 1.3 }))
  g.add(rbox(2.2, 1.6, 2.4, acc, { y: 3.4, z: 0.65 }, 0.4))
  g.add(stick([2.8, -3.6, 1.3], [3.6, -8.8, 1.4], 0.32, main))
  g.add(rbox(1.4, 2.6, 0.8, plug, { x: 3.6, y: -11.2, z: 1.4 }, 0.3))
  g.add(stick([-3, -3.4, 0], [-2.2, -7.4, 0.2], 0.32, main))
  g.add(rbox(1.8, 3, 1, plug, { x: -2.2, y: -10.2, z: 0.2 }, 0.3))
  return g
}

// 钥匙串
const KEY_PALS: Pal[] = [
  ['modern', [M.silver, M.char, '#e0b84a']],
  ['cute', [C.steel, C.pink, C.lemon]],
  ['retro', [M.silver, R.red, R.mustard]],
  ['industrial', [I.steel, I.leather, I.rust]],
]
function key(color: string, head: string) {
  return G(rbox(2.4, 2.4, 0.3, head, { y: -2.6 }, 0.6), rbox(0.8, 4.2, 0.25, color, { y: -6.6 }, 0.1), rbox(0.7, 0.6, 0.24, color, { x: 0.5, y: -5.4 }, 0.1), rbox(0.7, 0.5, 0.24, color, { x: 0.5, y: -6.6 }, 0.1))
}
function keysBody(p: string[]) {
  const [metal, fob, acc] = p
  const g = new THREE.Group()
  g.add(torus(1.4, 0.2, metal, { y: -1.6 }))
  const k1 = key(metal, metal)
  k1.position.set(-0.4, -1.2, 0.3)
  k1.rotation.z = 0.25
  const k2 = key(acc, shade(acc, 0.1))
  k2.position.set(0.4, -1.2, -0.3)
  k2.rotation.z = -0.2
  g.add(k1, k2)
  g.add(torus(0.6, 0.15, metal, { x: 0, y: -3.4, z: 0.8 }))
  g.add(rbox(3, 4, 0.8, fob, { y: -8.2, z: 0.8 }, 0.6))
  return g
}

// 折叠伞：竖直建模（挂绳环在上）
const UMB_PALS: Pal[] = [
  ['modern', [M.char, M.black, M.silver]],
  ['nordic', [N.blue, N.oak, N.white]],
  ['cute', [C.pink, C.white, C.sakura]],
  ['retro', [R.mustard, R.caramel, R.cream]],
  ['japanese', [J.ai, J.dark, J.washi]],
]
function umbrellaBody(p: string[]) {
  const [main, handle, acc] = p
  const g = new THREE.Group()
  g.add(torus(2, 0.25, acc, { y: -2.2 }))
  g.add(capsule(1.5, 4.5, handle, { y: -11 }))
  g.add(capsule(2.6, 17, main, { y: -33.6 }))
  g.add(rbox(5.6, 2.2, 5.6, acc, { y: -22 }, 1))
  g.add(cyl(0.3, 0.6, 1.6, handle, { y: -35 }, 8))
  return g
}

// 收纳篮（布 / 藤）
const BASKET_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.gray]],
  ['japanese', [J.hinoki, J.dark, J.washi]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['industrial', [I.leather, I.walnut, I.iron]],
  ['modern', [M.light, M.char, M.white]],
]
function band4(g: THREE.Group, w: number, d: number, y: number, h: number, color: string) {
  g.add(rbox(w + 0.4, h, 0.6, color, { y, z: d / 2 - 0.1 }, 0.2), rbox(w + 0.4, h, 0.6, color, { y, z: -d / 2 + 0.1 }, 0.2))
  g.add(rbox(0.6, h, d - 0.4, color, { x: w / 2 - 0.1, y }, 0.2), rbox(0.6, h, d - 0.4, color, { x: -w / 2 + 0.1, y }, 0.2))
}
function basketBody(p: string[]) {
  const [main, sec] = p
  const g = new THREE.Group()
  g.add(tray(26, 14, 18, 0.8, main, {}, 0.35))
  band4(g, 26, 18, 4, 1, sec)
  band4(g, 26, 18, 12.6, 1.4, sec)
  return g
}
function basketStanding(p: string[]) {
  const [, sec] = p
  const g = basketBody(p)
  for (const s of [-1, 1]) g.add(torus(2.2, 0.4, sec, { x: s * 13.6, y: 13, ry: PI / 2 }, PI))
  return ground(g)
}
function basketHanging(p: string[]) {
  const [, sec] = p
  const body = basketBody(p)
  const top = -16
  body.position.set(0, top - 14, 0.3 + 9.3)
  const g = G(body, sHook())
  g.add(tube([[-8, top - 0.6, 0.9], [-4, -10, 1.8], [0, -5.55, S_Z], [4, -10, 1.8], [8, top - 0.6, 0.9]], 0.4, sec, false, 24))
  return g
}

// 书
const BOOK_PALS: Pal[] = [
  ['nordic', [N.blue, PAGE, N.mustard]],
  ['retro', [R.red, PAGE, R.mustard]],
  ['japanese', [J.ai, PAGE, J.shu]],
  ['cute', [C.lilac, PAGE, C.lemon]],
  ['modern', [M.char, PAGE, M.silver]],
]
/** 平放的书：书脊在 -x */
function bookFlat(w: number, d: number, t: number, cover: string, page: string, acc: string) {
  const g = new THREE.Group()
  g.add(rbox(w, 0.3, d, cover, {}, 0.1))
  g.add(rbox(w, 0.3, d, cover, { y: t - 0.3 }, 0.1))
  g.add(rbox(0.5, t, d, cover, { x: -w / 2 + 0.25 }, 0.2))
  g.add(rbox(w - 0.6, t - 0.5, d - 0.6, page, { y: 0.25 }, 0.1))
  g.add(rbox(w * 0.5, 0.4, d * 0.2, acc, { x: 0.5, y: t - 0.3, z: -d * 0.15 }, 0.1))
  return g
}
const bookOne = (p: string[]) => bookFlat(15, 21, 2.4, p[0], p[1], p[2])
function bookStanding(p: string[]) {
  const inner = bookOne(p)
  inner.rotation.y = PI / 2
  const outer = G(inner)
  outer.rotation.z = PI / 2
  return ground(G(outer))
}
function bookStack(p: string[]) {
  const [cover, page, acc] = p
  const g = new THREE.Group()
  const specs: [number, number, number, string, number][] = [
    [22, 28, 2.8, shade(cover, -0.12), 0.05],
    [18, 24, 3.2, acc, -0.08],
    [15, 21, 2.4, cover, 0.12],
    [13, 18, 2, shade(acc, 0.12), -0.04],
  ]
  let y = 0
  for (const [w, d, t, c, rot] of specs) {
    const b = bookFlat(w, d, t, c, page, page === c ? acc : shade(c, 0.25))
    b.position.y = y
    b.rotation.y = rot
    g.add(b)
    y += t + 0.02
  }
  return ground(g)
}

// 笔记本电脑
const LAP_PALS: Pal[] = [
  ['modern', [M.silver, M.char, SCREEN]],
  ['modern', [M.char, M.black, SCREEN]],
  ['cute', [C.sakura, C.white, SCREEN]],
  ['nordic', [N.white, N.gray, SCREEN]],
  ['retro', [R.cream, R.caramel, SCREEN]],
]
function laptopClosed(p: string[]) {
  const [main, sec] = p
  const g = new THREE.Group()
  g.add(rbox(32, 1, 22, main, { y: 0.2 }, 0.4))
  g.add(rbox(32, 0.7, 22, main, { y: 1.25 }, 0.3))
  g.add(cyl(1.4, 1.4, 0.3, sec, { y: 1.8 }, 20))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.6, 0.6, 0.3, M.black, { x: sx * 13, z: sz * 8.5 }, 10))
  return ground(g)
}
function laptopOpen(p: string[]) {
  const [main, sec, scr] = p
  const g = new THREE.Group()
  g.add(rbox(32, 1, 22, main, { y: 0.2 }, 0.4))
  g.add(rbox(28, 0.35, 10, sec, { y: 1, z: -3 }, 0.1))
  g.add(rbox(10, 0.3, 6, shade(main, -0.06), { y: 1, z: 6.5 }, 0.2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.6, 0.6, 0.3, M.black, { x: sx * 13, z: sz * 8.5 }, 10))
  const lid = G(rbox(32, 21.5, 0.7, main, { z: 0 }, 0.3), glow(29, 18, scr, { y: 2, z: 0.6 }))
  lid.position.set(0, 1.2, -10.6)
  lid.rotation.x = -0.26
  g.add(lid)
  return ground(g)
}

// 收纳盒：合盖 / 打开（看得到里面叠好的衣物）
const BOX_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.blue]],
  ['modern', [M.white, M.light, M.char]],
  ['cute', [C.mint, C.white, C.pink]],
  ['japanese', [J.washi, J.wood, J.ai]],
  ['industrial', [I.concrete, I.walnut, I.rust]],
]
function boxShell(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  g.add(tray(36, 22, 26, 0.8, main, {}, 0.35))
  for (const s of [-1, 1]) g.add(rbox(0.6, 2.4, 8, shade(main, -0.25), { x: s * 18.1, y: 16 }, 0.3))
  g.add(rbox(9, 4.5, 0.4, PAGE, { y: 11, z: 13.1 }, 0.15))
  return g
}
function boxClosed(p: string[]) {
  const [, lid] = p
  const g = boxShell(p)
  g.add(rbox(37, 2, 27, lid, { y: 22 }, 0.7))
  return ground(g)
}
function boxOpen(p: string[]) {
  const [, lidC, acc] = p
  const g = boxShell(p)
  const lid = G(rbox(37, 2, 27, lidC, { z: 13.5 }, 0.7))
  lid.position.set(0, 22, -13.5)
  lid.rotation.x = -1.75
  g.add(lid)
  // 里面的东西
  g.add(rbox(15, 6, 22, shade(acc, 0.25), { x: -8.5, y: 0.8 }, 1))
  g.add(rbox(14, 4, 21, shade(acc, 0.1), { x: -8.5, y: 6.8 }, 1))
  g.add(cylZ(3.2, 21, shade(lidC, 0.15), 4.6, 0.8 + 3.2, 0))
  g.add(cylZ(3.2, 21, shade(acc, 0.35), 11.6, 0.8 + 3.2, 0))
  g.add(cylZ(3, 20, shade(lidC, -0.05), 8.1, 0.8 + 6.4 + 2.8, 0))
  return ground(g)
}

const FORM_ITEMS: AssetDef[] = [
  ...forms('headphones', '耳机', 'tabletop', HP_PALS, [
    { id: 'sf-headphones-lying', form: 'lying', dims: [20.4, 20.6, 8.4], build: (p) => phonesLying(p, false) },
    { id: 'sf-headphones-hanging', form: 'hanging', dims: [20.4, 9.7, 20.7], build: (p) => phonesHang(p, false) },
  ]),
  ...forms('headset', '头戴耳麦', 'tabletop', HP_PALS, [
    { id: 'sf-headset-lying', form: 'lying', dims: [20.9, 25.6, 11.7], build: (p) => phonesLying(p, true) },
    { id: 'sf-headset-hanging', form: 'hanging', dims: [20.9, 13, 25.7], build: (p) => phonesHang(p, true) },
  ]),
  ...forms('webcam', '网络摄像头', 'tabletop', CAM_PALS, [
    { id: 'sf-webcam-standing', form: 'standing', dims: [10.5, 9.3, 13.8], build: camStanding },
    { id: 'sf-webcam-lying', form: 'lying', dims: [9.6, 6.3, 3.3], build: camLying },
  ]),
  ...forms('tote-bag', '托特包', 'deco', TOTE_PALS, [
    { id: 'sf-tote-standing', form: 'standing', dims: [34, 10.6, 43], build: toteStanding },
    { id: 'sf-tote-hanging', form: 'hanging', dims: [34, 11.9, 63.5], build: toteHanging },
  ]),
  ...forms('backpack', '双肩包', 'deco', BP_PALS, [
    { id: 'sf-backpack-standing', form: 'standing', dims: [28, 20.4, 43.1], build: (p) => ground(backpackBody(p, true)) },
    { id: 'sf-backpack-hanging', form: 'hanging', dims: [28, 21.5, 54], build: backpackHanging },
  ]),
  ...forms('cap', '棒球帽', 'deco', HAT_PALS, [
    { id: 'sf-cap-lying', form: 'lying', dims: [18, 25.7, 8.3], build: (p) => ground(capBody(p)) },
    { id: 'sf-cap-hanging', form: 'hanging', dims: [18, 9.8, 32.3], build: (p) => G(hangAt(turned(capBody(p), PI / 2), S_UNDER + 0.1), sHook()) },
  ]),
  ...forms('scarf', '围巾', 'deco', SCARF_PALS, [
    { id: 'sf-scarf-folded', form: 'folded', dims: [24.2, 16.3, 5.9], build: scarfFolded },
    { id: 'sf-scarf-hanging', form: 'hanging', dims: [16.3, 5.3, 68.1], build: scarfHanging },
  ]),
  ...forms('towel', '毛巾', 'deco', TOWEL_PALS, [
    { id: 'sf-towel-folded', form: 'folded', dims: [32, 20.4, 6.6], build: towelFolded },
    { id: 'sf-towel-hanging', form: 'hanging', dims: [34.4, 5.4, 68], build: towelHanging },
  ]),
  ...forms('tshirt', 'T 恤', 'deco', CLOTH_PALS, [
    { id: 'sf-tshirt-folded', form: 'folded', dims: [26, 32, 4.1], build: shirtFolded },
    { id: 'sf-tshirt-hanging', form: 'hanging', dims: [57.7, 5.3, 67.4], build: shirtHanging },
  ]),
  ...forms('pants', '裤子', 'deco', CLOTH_PALS, [
    { id: 'sf-pants-folded', form: 'folded', dims: [28, 34.4, 4.8], build: pantsFolded },
    { id: 'sf-pants-hanging', form: 'hanging', dims: [40, 5.2, 61.8], build: pantsHanging },
  ]),
  ...forms('hang-mug', '马克杯', 'tabletop', MUG_PALS, [
    { id: 'sf-mug-standing', form: 'standing', dims: [10.9, 8.6, 9.5], build: (p) => ground(mugBody(p)) },
    { id: 'sf-mug-hanging', form: 'hanging', dims: [9.5, 9.6, 11.3], build: mugHanging },
  ]),
  ...forms('scissors', '剪刀', 'tabletop', TOOL_PALS, [
    { id: 'sf-scissors-lying', form: 'lying', dims: [9.7, 19.7, 1.6], build: (p) => laid(scissorsBody(p), -PI / 2) },
    { id: 'sf-scissors-hanging', form: 'hanging', dims: [9.9, 7.3, 20.1], build: (p) => toolHang(scissorsBody(p), true, 2.4) },
  ]),
  ...forms('pliers', '钳子', 'tabletop', TOOL_PALS, [
    { id: 'sf-pliers-lying', form: 'lying', dims: [4.6, 20.1, 1.5], build: (p) => laid(pliersBody(p), -PI / 2) },
    { id: 'sf-pliers-hanging', form: 'hanging', dims: [4.5, 7.3, 20.5], build: (p) => toolHang(pliersBody(p), true, 1.0) },
  ]),
  ...forms('screwdrivers', '螺丝刀组', 'tabletop', TOOL_PALS, [
    { id: 'sf-drivers-lying', form: 'lying', dims: [12.3, 17, 1.9], build: driversLying },
    { id: 'sf-drivers-hanging', form: 'hanging', dims: [16, 5.3, 17], build: driversHanging },
  ]),
  ...forms('tape-measure', '卷尺', 'tabletop', TOOL_PALS, [
    { id: 'sf-tape-lying', form: 'lying', dims: [8.1, 10.6, 3.9], build: (p) => laid(tapeBody(p), -PI / 2) },
    { id: 'sf-tape-hanging', form: 'hanging', dims: [8.1, 7.3, 11.2], build: (p) => toolHang(tapeBody(p), true) },
  ]),
  ...forms('wrench', '扳手', 'tabletop', TOOL_PALS, [
    { id: 'sf-wrench-lying', form: 'lying', dims: [4.9, 21.3, 1.5], build: (p) => laid(wrenchBody(p), -PI / 2) },
    { id: 'sf-wrench-hanging', form: 'hanging', dims: [4.9, 7.3, 21.3], build: (p) => toolHang(wrenchBody(p), true) },
  ]),
  ...forms('cable', '数据线', 'tabletop', CABLE_PALS, [
    { id: 'sf-cable-lying', form: 'lying', dims: [10.1, 16.2, 2.4], build: (p) => laid(cableBody(p), -PI / 2) },
    { id: 'sf-cable-hanging', form: 'hanging', dims: [10.1, 7.3, 16.7], build: (p) => toolHang(cableBody(p), true) },
  ]),
  ...forms('keychain', '钥匙串', 'tabletop', KEY_PALS, [
    { id: 'sf-keys-lying', form: 'lying', dims: [3.6, 8.2, 1.7], build: (p) => laid(keysBody(p), -PI / 2) },
    { id: 'sf-keys-hanging', form: 'hanging', dims: [3.6, 7.3, 8.7], build: (p) => toolHang(keysBody(p), true) },
  ]),
  ...forms('folding-umbrella', '折叠伞', 'deco', UMB_PALS, [
    { id: 'sf-umbrella-lying', form: 'lying', dims: [35.4, 5.6, 5.6], build: (p) => laid(umbrellaBody(p), PI / 2, 0, PI / 2) },
    { id: 'sf-umbrella-hanging', form: 'hanging', dims: [5.6, 7.1, 39.9], build: (p) => G(hangAt(umbrellaBody(p), -5.6 + 0.7, S_Z), sHook()) },
  ]),
  ...forms('hang-basket', '收纳篮', 'storage', BASKET_PALS, [
    { id: 'sf-basket-standing', form: 'standing', dims: [28, 18.4, 15.6], build: basketStanding },
    { id: 'sf-basket-hanging', form: 'hanging', dims: [26.4, 20, 30], build: basketHanging },
  ]),
  ...forms('book', '书', 'tabletop', BOOK_PALS, [
    { id: 'sf-book-standing', form: 'standing', dims: [2.4, 15, 21], build: bookStanding },
    { id: 'sf-book-lying', form: 'lying', dims: [15, 21, 2.4], build: (p) => ground(bookOne(p)) },
    { id: 'sf-book-stacked', form: 'stacked', dims: [23.4, 29.1, 10.6], build: bookStack },
  ]),
  ...forms('laptop-fold', '笔记本电脑', 'tabletop', LAP_PALS, [
    { id: 'sf-laptop-open', form: 'open', dims: [32, 27.5, 22.2], build: laptopOpen },
    { id: 'sf-laptop-closed', form: 'closed', dims: [32, 22, 2.1], build: laptopClosed },
  ]),
  ...forms('storage-box', '收纳盒', 'storage', BOX_PALS, [
    { id: 'sf-storage-box-closed', form: 'boxed', dims: [37, 27, 24], build: boxClosed },
    { id: 'sf-storage-box-open', form: 'open', dims: [37, 33.5, 48.4], build: boxOpen },
  ]),
]

// ---------- 桌面日用 ----------

const TISSUE_PALS: Pal[] = [
  ['nordic', [N.white, N.sage, N.oak]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['modern', [M.light, M.char, M.white]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['retro', [R.cream, R.teal, R.orange]],
]
function puff(g: THREE.Group, y: number, s = 1) {
  const a = ball(2.6 * s, WHITE, { y: y + 1.4 * s, x: -0.6 * s }, [1, 1, 0.3])
  a.rotation.set(0.2, 0.3, 0.25)
  const b = ball(2.2 * s, WHITE, { y: y + 1.1 * s, x: 1 * s }, [1, 1, 0.3])
  b.rotation.set(-0.15, -0.4, -0.3)
  g.add(a, b)
}
function tissueCube(p: string[]) {
  const [main, sec] = p
  const g = G(rbox(12, 13, 12, main, {}, 1), rbox(12.4, 4, 12.4, sec, { y: 3 }, 0.8))
  const hole = cyl(1, 1, 0.3, shade(main, -0.25), { y: 12.85 }, 24)
  hole.scale.set(3.2, 1, 1.6)
  g.add(hole)
  puff(g, 12.6)
  return ground(g)
}
function tissueRect(p: string[]) {
  const [main, sec, acc] = p
  const g = G(rbox(24, 9, 12, main, {}, 1), rbox(5, 9.4, 12.4, sec, { x: -7, y: -0.2 }, 0.6), rbox(14, 0.4, 3, shade(main, -0.25), { y: 8.85 }, 0.15))
  g.add(ball(0.8, acc, { x: 9, y: 4, z: 6 }, [1, 1, 0.4]))
  puff(g, 8.6)
  return ground(g)
}
function tissueSoft(p: string[]) {
  const [main, sec] = p
  const g = G(ball(1, main, { y: 3.2 }, [9.5, 3.2, 5.5]), ball(1, sec, { y: 3.2, x: -5 }, [3, 3.4, 5.7]), rbox(9, 0.4, 2.2, shade(main, -0.25), { y: 6.15 }, 0.15))
  puff(g, 5.9, 0.8)
  return ground(g)
}
const ROLL_PALS: Pal[] = [
  ['nordic', [N.white, '#c8a982', N.white]],
  ['cute', [C.sakura, '#c8a982', WHITE]],
  ['retro', [R.cream, '#c8a982', R.cream]],
  ['modern', [M.white, '#c8a982', M.white]],
]
function toiletRoll(p: string[]) {
  const [paper, core] = p
  const g = G(ring(5.5, 2.2, 10, paper), ring(2.2, 1.9, 10.05, core, { y: -0.03 }))
  const tail = rbox(7, 0.15, 6, paper, { y: 0, z: 7.6 }, 0.05)
  g.add(tail)
  g.add(bar([0, 0.1, 5.2], [0, 6, 5.4], 7, 0.15, paper))
  return ground(g)
}
const WIPE_PALS: Pal[] = [
  ['modern', [M.white, '#4f9fd8', M.white]],
  ['cute', [C.white, C.mint, C.pink]],
  ['nordic', [N.white, N.blue, N.sage]],
  ['retro', [R.cream, R.teal, R.orange]],
]
function wipesCanister(p: string[]) {
  const [main, sec, acc] = p
  const g = G(cyl(4.5, 4.5, 15, main, {}, 32), cyl(4.8, 4.8, 6, sec, { y: 4 }, 32), puck(4.8, 2.4, acc === main ? sec : acc, { y: 15 }))
  const s = ball(2.2, WHITE, { y: 19.2, z: 0.4 }, [1, 1.4, 0.25])
  s.rotation.set(0.25, 0.2, 0.15)
  g.add(s, cyl(0.6, 0.9, 1, WHITE, { y: 17.2 }, 12))
  return ground(g)
}
function wipesPouch(p: string[]) {
  const [main, sec] = p
  const g = G(ball(1, main, { y: 2 }, [10, 2, 6]), rbox(8, 0.6, 4.6, sec, { y: 3.6 }, 0.3), rbox(6, 0.3, 2.8, shade(sec, -0.2), { y: 4.0 }, 0.15))
  return ground(g)
}
function maskBox(p: string[]) {
  const [main, sec] = p
  const g = G(rbox(19, 10, 9.5, main, {}, 0.6), rbox(19.4, 3, 9.9, sec, { y: 2 }, 0.4), rbox(10, 0.3, 5, shade(main, -0.25), { y: 9.85 }, 0.12))
  g.add(ball(1, WHITE, { y: 10.2 }, [4, 0.9, 2]))
  return ground(g)
}
function swabCase(p: string[]) {
  const [, sec] = p
  const g = new THREE.Group()
  g.add(ghost(cyl(3.8, 3.8, 8, C.glass, {}, 24), C.glass))
  g.add(cyl(3.9, 3.9, 0.6, sec, {}, 24))
  g.add(puck(4, 1.4, sec, { y: 8 }))
  const r = rng(7)
  for (let i = 0; i < 12; i++) {
    const a = r() * PI * 2
    const d = 0.6 + r() * 2.4
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const top = 6.6 + r() * 0.8
    g.add(stick([x, 0.7, z], [x * 1.05, top, z * 1.05], 0.12, WHITE, 5))
    g.add(ball(0.32, WHITE, { x: x * 1.05, y: top, z: z * 1.05 }, [1, 1.4, 1]))
  }
  return ground(g)
}
const CARE_PALS: Pal[] = [
  ['nordic', [N.white, N.sage, N.oak]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['japanese', [J.washi, J.shu, J.ai]],
  ['modern', [M.white, M.char, M.silver]],
]
function handCream(p: string[]) {
  const [main, sec] = p
  const g = G(rbox(4.6, 1.8, 11, main, {}, 0.8), rbox(5, 0.4, 1.2, main, { y: 0.7, z: -5.6 }, 0.15), rbox(2.4, 0.3, 4, sec, { y: 1.65 }, 0.1), cylZ(1.3, 2.2, sec, 0, 0.9, 6.5))
  return ground(g)
}
function eyeDrops(p: string[]) {
  const [main, sec] = p
  const g = G(cyl(1.2, 1.2, 4.2, main, {}, 16), cyl(0.7, 1.2, 0.8, main, { y: 4.2 }, 16), cyl(0.95, 0.95, 2.2, sec, { y: 4.5 }, 16), cyl(1.25, 1.25, 1.6, sec, { y: 1.2 }, 16))
  return ground(g)
}
function pillBox(p: string[]) {
  const [main, sec, acc] = p
  const g = G(rbox(18, 2, 4.6, main, {}, 0.5))
  const cols = [sec, acc, shade(sec, 0.12), shade(acc, 0.12), sec, acc, shade(sec, -0.1)]
  cols.forEach((c, i) => g.add(rbox(2.3, 0.6, 4.2, c, { x: -7.8 + i * 2.6, y: 1.95 }, 0.2)))
  return ground(g)
}
function sanitizer(p: string[]) {
  const [main, sec] = p
  const g = G(ghost(cyl(3, 3, 12, '#d8f0ff', {}, 24), '#d8f0ff', 0.5), cyl(2.8, 2.8, 7, shade(sec, 0.2), { y: 0.3 }, 24), cyl(1.4, 1.6, 1.2, main, { y: 12 }, 16), cyl(0.5, 0.5, 2.4, main, { y: 13 }, 8), rbox(1.6, 1.2, 4.4, main, { y: 15, z: 1.2 }, 0.4))
  return ground(g)
}
const REMOTE_PALS: Pal[] = [
  ['modern', [M.black, M.char, '#e05a3a']],
  ['modern', [M.white, M.light, '#e05a3a']],
  ['cute', [C.white, C.sky, C.pink]],
  ['retro', [R.cream, R.caramel, R.red]],
]
function remoteTV(p: string[]) {
  const [main, sec, acc] = p
  const g = G(rbox(5, 1.8, 18, main, {}, 0.8))
  g.add(cyl(0.45, 0.45, 0.5, acc, { x: -1.4, y: 1.5, z: -7.4 }, 12))
  g.add(torus(1.1, 0.3, sec, { y: 1.75, z: -2.6, rx: PI / 2 }))
  g.add(cyl(0.5, 0.5, 0.5, sec, { y: 1.5, z: -2.6 }, 12))
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.add(cyl(0.38, 0.38, 0.5, sec, { x: (c - 1) * 1.4, y: 1.5, z: 1.6 + r * 1.6 }, 10))
  return ground(g)
}
function remoteAC(p: string[]) {
  const [main, sec, acc] = p
  const g = G(rbox(5.5, 2, 13, main, {}, 0.9), rbox(4, 0.35, 3.6, '#cfe3c8', { y: 1.8, z: -3.4 }, 0.1))
  g.add(cyl(0.6, 0.6, 0.5, acc, { x: 1.4, y: 1.7, z: 0.4 }, 12))
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) g.add(rbox(1.6, 0.5, 1, sec, { x: (c - 0.5) * 2.2, y: 1.7, z: 2.2 + r * 1.8 }, 0.2))
  return ground(g)
}
function remoteLight(p: string[]) {
  const [main, sec, acc] = p
  const g = G(puck(3.5, 1.4, main), cyl(1.6, 1.6, 0.4, sec, { y: 1.2 }, 20), cyl(0.5, 0.5, 0.4, acc, { x: 2.3, y: 1.2 }, 10), cyl(0.5, 0.5, 0.4, sec, { x: -2.3, y: 1.2 }, 10))
  return ground(g)
}
function charger(p: string[]) {
  const [main, sec] = p
  const g = G(rbox(4.6, 3, 4.6, main, {}, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(0.3, 0.8, 1.6, STEEL, { x: sx * 0.9, y: 1, z: -3 }, 0.1))
  g.add(cyl(0.6, 0.6, 1, sec, { x: 0, y: 0.9, z: 2.3, rx: PI / 2 }, 10))
  g.add(torus(3, 0.25, main, { x: 6.6, y: 0.25, rx: PI / 2 }))
  g.add(torus(2.7, 0.25, main, { x: 6.8, y: 0.75, rx: PI / 2 }))
  g.add(stick([2.3, 0.5, 2.6], [4.4, 0.25, 2.2], 0.25, main))
  g.add(rbox(1.2, 0.7, 2.4, sec, { x: 7.6, y: 0, z: 4.2 }, 0.25))
  return ground(g)
}
function nailClipper(p: string[]) {
  const [, , acc] = p
  const metal = STEEL
  const g = G(rbox(1.5, 0.6, 5.8, metal, {}, 0.2), rbox(1.3, 0.3, 5.2, metal, { y: 0.9, z: -0.1 }, 0.1))
  const lever = rbox(1.2, 0.25, 5.4, acc, {}, 0.1)
  lever.position.set(0, 1.9, 0.6)
  lever.rotation.x = 0.12
  g.add(lever, cyl(0.25, 0.25, 1.6, metal, { y: 0.4, z: 2.3 }, 8), torus(0.6, 0.15, metal, { z: -3.3, y: 0.3, rx: PI / 2 }))
  return ground(g)
}
const REMOTE_EXTRA = (label: string) => ({ family: 'remote', sizeLabel: label })
const TISSUE_EXTRA = (label: string) => ({ family: 'tissue', sizeLabel: label })

const DAILY: AssetDef[] = [
  prop('sf-tissue-cube', '抽纸盒', 'tabletop', [12.4, 12.4, 16.5], TISSUE_PALS, tissueCube, TISSUE_EXTRA('方形')),
  prop('sf-tissue-rect', '抽纸盒', 'tabletop', [24, 12.5, 12.7], TISSUE_PALS, tissueRect, TISSUE_EXTRA('长方形')),
  prop('sf-tissue-soft', '抽纸盒', 'tabletop', [19, 11.4, 9.3], TISSUE_PALS, tissueSoft, TISSUE_EXTRA('软抽')),
  prop('sf-toilet-roll', '卷纸', 'tabletop', [11, 16.1, 10.1], ROLL_PALS, toiletRoll),
  prop('sf-wipes-canister', '桶装酒精湿巾', 'tabletop', [9.6, 9.6, 22.2], WIPE_PALS, wipesCanister),
  prop('sf-wipes-pouch', '湿巾袋装', 'tabletop', [20, 12, 4.3], WIPE_PALS, wipesPouch),
  prop('sf-mask-box', '口罩盒', 'tabletop', [19.4, 9.9, 11.1], WIPE_PALS, maskBox),
  prop('sf-swab-case', '棉签盒', 'tabletop', [8, 8, 9.4], CARE_PALS, swabCase),
  prop('sf-hand-cream', '护手霜', 'tabletop', [5, 13.8, 2.6], CARE_PALS, handCream),
  prop('sf-eye-drops', '眼药水', 'tabletop', [2.5, 2.5, 6.7], CARE_PALS, eyeDrops),
  prop('sf-pill-box', '小药盒', 'tabletop', [18, 4.6, 2.55], CARE_PALS, pillBox),
  prop('sf-sanitizer', '按压洗手液', 'tabletop', [6, 6.4, 16.2], CARE_PALS, sanitizer),
  prop('sf-remote-tv', '遥控器', 'tabletop', [5, 18, 2], REMOTE_PALS, remoteTV, REMOTE_EXTRA('电视')),
  prop('sf-remote-ac', '遥控器', 'tabletop', [5.5, 13, 2.2], REMOTE_PALS, remoteAC, REMOTE_EXTRA('空调')),
  prop('sf-remote-light', '遥控器', 'tabletop', [7, 7, 1.6], REMOTE_PALS, remoteLight, REMOTE_EXTRA('灯')),
  prop('sf-charger', '充电器和线', 'tabletop', [12.1, 9.2, 3], REMOTE_PALS, charger),
  prop('sf-nail-clipper', '指甲剪', 'tabletop', [1.5, 7.1, 2.3], TOOL_PALS, nailClipper),
]

// ---------- 衣帽架 ----------

/** 树形衣帽架：上一圈 4 钩（正方向）、下一圈 4 钩（斜 45°） */
const CT = { upY: 168, lowY: 146, upR: 15.5, lowR: 13.5 }
const CT_UP = [0, 1, 2, 3].map((k) => (k * PI) / 2)
const CT_LOW = CT_UP.map((a) => a + PI / 4)
function treeHook(a: number, y: number, r: number, color: string) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const pt = (d: number, yy: number): V3 => [c * d, yy, s * d]
  return tube([pt(1.4, y + 5), pt(r * 0.55, y + 1.6), pt(r, y), pt(r + 1.5, y + 1), pt(r + 2, y + 3.2)], 0.5, color, false, 24)
}
function coatTree(p: string[]) {
  const [wood, metal, acc] = p
  const g = new THREE.Group()
  g.add(cyl(4, 4.6, 4, wood, { y: 0.6 }, 20))
  for (const a of CT_LOW) {
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(stick([0, 3, 0], [c * 21, 1.4, s * 21], 1.4, wood))
    g.add(ball(1.4, acc, { x: c * 21, y: 1.4, z: s * 21 }))
  }
  g.add(cyl(1.6, 1.9, 176, wood, { y: 4 }, 16))
  g.add(ball(2.2, acc, { y: 180 }))
  for (const a of CT_UP) g.add(treeHook(a, CT.upY, CT.upR, metal))
  for (const a of CT_LOW) g.add(treeHook(a, CT.lowY, CT.lowR, metal))
  return g
}
const treeBand = (angles: number[], r: number): Poly[] => angles.map((a) => rectPoly(Math.cos(a) * r - 2, Math.sin(a) * r - 2, Math.cos(a) * r + 2, Math.sin(a) * r + 2))
const COAT_TREE = asset('sf-coat-tree', '树形衣帽架', 'entrance', [36, 36, 182.2], SHELF_PALS, coatTree, {
  surfaces: [
    { y: CT.upY + 1, kind: 'hook', h: 150, shape: treeBand(CT_UP, CT.upR) },
    { y: CT.lowY + 1, kind: 'hook', h: 130, shape: treeBand(CT_LOW, CT.lowR) },
  ],
})

/** 梯子形挂衣架：斜靠墙，横杆都是挂钩层（下面的横杆更靠前，挂上去的东西不会碰到） */
const LH = { w: 50, h: 170, rungs: [40, 80, 120, 160] }
const lhZ = (y: number) => 15.5 - (31 * (y - 0.34)) / LH.h
function ladderHanger(p: string[]) {
  const [wood, , acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(bar([sx * (LH.w / 2 - 1.5), 0.34, 15.5], [sx * (LH.w / 2 - 1.5), LH.h + 0.34, -15.5], 3, 3, wood))
  for (const y of LH.rungs) g.add(cylX(1.2, LH.w - 3, y === LH.rungs[LH.rungs.length - 1] ? acc : wood, 0, y, lhZ(y)))
  return g
}
const LADDER_HANGER = asset('sf-ladder-hanger', '梯子形挂衣架', 'bedroom', [50, 34, 170.7], SHELF_PALS, ladderHanger, {
  surfaces: LH.rungs.map((y) => ({ y: y + 1.2 + 0.5, kind: 'hook' as const, h: y - 3, shape: [rectPoly(-LH.w / 2 + 4, lhZ(y) - 1.7, LH.w / 2 - 4, lhZ(y) + 1.3)] })),
})

/** 玄关挂衣柜（hall tree）：长凳 + 鞋层 + 背板挂钩 + 顶部帽架 */
const HT = { w: 90, d: 40, h: 185, seat: 46, shoe: 12, hookY: 160, hatY: 177 }
const HT_HOOKS = [-32, -16, 0, 16, 32]
function hallTree(p: string[]) {
  const [wood, metal, acc] = p
  const g = new THREE.Group()
  const zb = -HT.d / 2
  for (const sx of [-1, 1]) {
    const x = sx * (HT.w / 2 - 1)
    g.add(rbox(2, HT.seat, HT.d, wood, { x }, 0.5))
    g.add(rbox(2, HT.h - HT.seat - 3, 8, wood, { x, y: HT.seat - 0.5, z: zb + 4 }, 0.5))
  }
  g.add(rbox(HT.w - 4, 3, HT.d - 2, wood, { y: HT.seat - 3, z: 1 }, 0.6))
  g.add(rbox(HT.w - 4, 2, HT.d - 4, wood, { y: HT.shoe - 2 }, 0.5))
  g.add(rbox(HT.w - 4, HT.h - HT.seat - 3, 1.5, shade(wood, 0.06), { y: HT.seat, z: zb + 0.75 }, 0.3))
  g.add(rbox(HT.w, 3, 10, wood, { y: HT.h - 3, z: zb + 5 }, 0.6))
  g.add(rbox(HT.w - 4, 2, 22, wood, { y: HT.hatY - 2, z: zb + 1.5 + 11 }, 0.5))
  for (const x of HT_HOOKS) {
    g.add(cylZ(1.2, 0.6, acc, x, HT.hookY + 4, zb + 1.8, 12))
    g.add(tube([[x, HT.hookY + 4, zb + 1.6], [x, HT.hookY + 1.4, zb + 4.5], [x, HT.hookY, zb + 6.8], [x, HT.hookY + 1, zb + 8.4], [x, HT.hookY + 2.6, zb + 8.8]], 0.45, metal, false, 20))
  }
  return g
}
const HALL_TREE = asset('sf-hall-tree', '玄关挂衣柜', 'entrance', [HT.w, HT.d, HT.h], SHELF_PALS, hallTree, {
  surface: HT.seat,
  surfaceShape: [rectPoly(-HT.w / 2 + 3, -HT.d / 2 + 2.5, HT.w / 2 - 3, HT.d / 2 - 1.5)],
  surfaces: [
    { y: HT.shoe, h: HT.seat - 3 - HT.shoe, shape: [rectPoly(-HT.w / 2 + 3, -HT.d / 2 + 3, HT.w / 2 - 3, HT.d / 2 - 3)] },
    { y: HT.hatY, h: 40, shape: [rectPoly(-HT.w / 2 + 3, -HT.d / 2 + 11, HT.w / 2 - 3, -HT.d / 2 + 23)] },
    { y: HT.hookY + 0.45 + 0.5, kind: 'hook', h: HT.hookY - HT.seat - 2, shape: HT_HOOKS.map((x) => rectPoly(x - 2.5, -HT.d / 2 + 5.3, x + 2.5, -HT.d / 2 + 8.3)) },
  ],
})

/** 门后挂衣架：挂在门顶的横条 + 6 个钩 */
const DR = { w: 45, mount: 170 }
const DR_X = [-18.75, -11.25, -3.75, 3.75, 11.25, 18.75]
function doorRack(p: string[]) {
  const [main, metal] = p
  const g = new THREE.Group()
  const y0 = DR.mount - 2.85
  g.add(rbox(DR.w, 2.4, 1.2, main, { y: y0 + 7, z: 0 }, 0.4))
  for (const sx of [-1, 1]) {
    const x = sx * 18
    g.add(rbox(2.4, 3, 0.6, metal, { x, y: y0 + 9, z: -0.3 }, 0.2))
    g.add(rbox(2.4, 0.6, 4.6, metal, { x, y: y0 + 11.4, z: -2.6 }, 0.2))
    g.add(rbox(2.4, 3, 0.6, metal, { x, y: y0 + 8.4, z: -4.6 }, 0.2))
  }
  for (const x of DR_X) g.add(tube([[x, y0 + 7.4, 0.5], [x, y0 + 5, 1.6], [x, y0 + 3.2, 3.2], [x, y0 + 4.2, 4.6], [x, y0 + 5.6, 5]], 0.35, metal, false, 16))
  return g
}
const DOOR_RACK = asset('sf-door-rack', '门后挂衣架', 'entrance', [45, 10.3, 9.1], ACC_PALS, doorRack, {
  mount: DR.mount,
  surfaces: [{ y: DR.mount + 0.35 + 0.35 + 0.5, kind: 'hook', h: 160, shape: DR_X.map((x) => rectPoly(x - 2, 1.7, x + 2, 4.7)) }],
})

/** 双杆挂衣架：上杆靠后、下杆靠前（长短衣物互不干扰），底部一层置物 */
const DRL = { w: 100, d: 50, upY: 165, lowY: 105, upZ: -12, lowZ: 12, shelfY: 18 }
function doubleRail(p: string[]) {
  const [main, frame] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * (DRL.w / 2 - 2)
    g.add(rbox(3, 2.4, DRL.d - 4, frame, { x, y: 3 }, 0.6))
    for (const sz of [-1, 1]) {
      g.add(cyl(1.6, 1.6, 1.2, frame, { x, y: 1.8, z: sz * (DRL.d / 2 - 3) }, 12))
      g.add(ball(1.8, M.black, { x, y: 1.8, z: sz * (DRL.d / 2 - 3) }))
    }
    g.add(cyl(1.2, 1.2, DRL.upY - 5, frame, { x, y: 5, z: DRL.upZ }, 12))
    g.add(ball(1.2, frame, { x, y: DRL.upY, z: DRL.upZ }))
    g.add(stick([x, DRL.lowY, DRL.upZ], [x, DRL.lowY, DRL.lowZ], 0.9, frame))
    g.add(stick([x, DRL.lowY - 22, DRL.upZ], [x, DRL.lowY, DRL.lowZ - 3], 0.7, frame))
    g.add(ball(1.2, frame, { x, y: DRL.lowY, z: DRL.lowZ }))
  }
  g.add(cylX(1.2, DRL.w - 4, frame, 0, DRL.upY, DRL.upZ))
  g.add(cylX(1.2, DRL.w - 4, frame, 0, DRL.lowY, DRL.lowZ))
  for (const z of [-15, -5, 5, 15]) g.add(rbox(DRL.w - 6, 1.6, 7, main, { y: DRL.shelfY - 1.6, z }, 0.4))
  // 层板木条下的托架，前后接到立柱和底座上（以前木条悬空 2~11cm）
  for (const s of [-1, 1]) g.add(rbox(2, 1.8, 40, frame, { x: s * (DRL.w / 2 - 4), y: DRL.shelfY - 3.3 }, 0.5))
  return g
}
const DOUBLE_RAIL = asset('sf-double-rail', '双杆挂衣架', 'bedroom', [99.6, 47.6, 166.2], SHELF_PALS, doubleRail, {
  surfaces: [
    { y: DRL.shelfY, h: 50, shape: [rectPoly(-DRL.w / 2 + 5, -18, DRL.w / 2 - 5, 18)] },
    { y: DRL.upY + 1.2 + 0.45, kind: 'hook', h: DRL.upY - DRL.shelfY - 2, shape: [rectPoly(-DRL.w / 2 + 5, DRL.upZ - 1.7, DRL.w / 2 - 5, DRL.upZ + 1.3)] },
    { y: DRL.lowY + 1.2 + 0.45, kind: 'hook', h: DRL.lowY - DRL.shelfY - 2, shape: [rectPoly(-DRL.w / 2 + 5, DRL.lowZ - 1.7, DRL.w / 2 - 5, DRL.lowZ + 1.3)] },
  ],
})

/** 和风衣桁（衣桁 / 着物掛け）：笠木下方前面一根细挂杆，和服用衣架杆展开挂在上面 */
const IK = { post: 68, top: 162, rodY: 158, rodZ: 3.4 }
const IKOU_PALS: Pal[] = [
  ['japanese', [J.dark, J.wood, '#c9a45c']],
  ['japanese', [J.shu, J.sumi, '#c9a45c']],
  ['nordic', [N.oak, N.oakL, STEEL]],
  ['retro', [R.caramel, R.cream, R.mustard]],
]
function ikou(p: string[]) {
  const [wood, sub, metal] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * IK.post
    g.add(rbox(5, 5, 40, wood, { x }, 0.8))
    g.add(rbox(4, IK.top - 5, 4, wood, { x, y: 5 }, 0.5))
    g.add(cylZ(0.9, 2.4, metal, x, IK.rodY, 2.4))
  }
  g.add(rbox(160, 4, 4.4, wood, { y: IK.top }, 0.8))
  g.add(rbox(132, 3, 3, sub, { y: 120, z: -3 }, 0.5))
  g.add(rbox(132, 3, 3, sub, { y: 25, z: -3 }, 0.5))
  g.add(cylX(0.8, IK.post * 2 + 2, metal, 0, IK.rodY, IK.rodZ))
  return g
}
const IKOU = asset('sf-ikou', '衣桁（和服架）', 'japanese', [160, 40, 166], IKOU_PALS, ikou, {
  surfaces: [{ y: IK.rodY + 0.8 + 0.45, kind: 'hook', h: IK.rodY - 4, shape: [rectPoly(-60, IK.rodZ - 1.7, 60, IK.rodZ + 1.3)] }],
})

// ---------- 衣物：挂在衣架上 / 叠好 ----------

interface GSpec {
  sw: number
  cw: number
  hw: number
  L: number
  T: number
  sleeve: number
  short?: boolean
  collar: 'round' | 'shirt' | 'lapel' | 'turtle' | 'v' | 'hood'
  buttons?: number
  zip?: boolean
  quilt?: number
  belt?: boolean
  pockets?: boolean
  kanga?: boolean
  rib?: boolean
}
const GY0 = -5.4
/** 肩线：比衣架肩条高 1.6，肩条完全包在衣服里 */
const edgeY = (x: number) => GY0 - 0.42 * x + 1.6
const torsoCache = new Map<string, THREE.BufferGeometry>()
function torsoGeo(g: GSpec) {
  const key = `${g.sw},${g.cw},${g.hw},${g.L},${g.T}`
  let geo = torsoCache.get(key)
  if (geo) return geo
  const yN = edgeY(4)
  const yS = edgeY(g.sw / 2)
  const yB = yN - g.L
  const pts: [number, number][] = [
    [-4, yN],
    [-g.sw / 2, yS],
    [-g.cw / 2, yS - 7],
    [-g.hw / 2, yB],
    [g.hw / 2, yB],
    [g.cw / 2, yS - 7],
    [g.sw / 2, yS],
    [4, yN],
  ]
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const b = 0.4
  geo = new THREE.ExtrudeGeometry(s, { depth: g.T - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2 })
  geo.translate(0, 0, -g.T / 2 + b)
  // 模块级缓存、多件家具共用：标记共享，disposeUnshared 不释放
  geo.userData.shared = true
  torsoCache.set(key, geo)
  return geo
}
const garmentZ = (g: GSpec) => 0.6 + g.T / 2 + (g.collar === 'hood' ? 1.6 : 0)
function garmentHang(p: string[], g: GSpec) {
  const [main, wood, acc] = p
  const zc = garmentZ(g)
  const out = hangerFrame(wood, false, zc)
  const m = new THREE.Mesh(torsoGeo(g), toon(main))
  m.position.z = zc
  m.castShadow = true
  m.receiveShadow = true
  out.add(m)
  const yN = edgeY(4)
  const yS = edgeY(g.sw / 2)
  const yB = yN - g.L
  const front = zc + g.T / 2
  const dark = shade(main, -0.08)
  // 袖子
  for (const s of [-1, 1]) {
    if (g.short) {
      const sl = rbox(11, 12, g.T + 0.4, main, {}, 1)
      sl.position.set(s * (g.sw / 2 + 0.5), yS - 5.5, zc)
      sl.rotation.z = s * 0.5
      out.add(sl)
    } else {
      const sl = rbox(8.5, g.sleeve, g.T + 0.4, main, {}, 1.2)
      sl.position.set(s * (g.sw / 2 - 4), yS - 1.2 - g.sleeve / 2, zc)
      sl.rotation.z = s * 0.04
      out.add(sl)
      if (g.rib) {
        const cf = rbox(8.9, 3, g.T + 0.8, dark, {}, 0.6)
        cf.position.set(s * (g.sw / 2 - 4) + s * Math.sin(0.04) * (g.sleeve / 2 - 1.5), yS - 1.2 - g.sleeve + 1.5, zc)
        cf.rotation.z = s * 0.04
        out.add(cf)
      }
    }
  }
  // 领子
  if (g.collar === 'round') out.add(torus(3.6, 0.5, acc, { y: yN - 0.3, z: front + 0.15, rz: PI }, PI))
  if (g.collar === 'shirt')
    for (const s of [-1, 1]) {
      const c = rbox(5.4, 3.4, 0.5, shade(main, 0.05), {}, 0.2)
      c.position.set(s * 2.8, yN - 1.6, front + 0.2)
      c.rotation.z = s * 0.55
      out.add(c)
    }
  if (g.collar === 'lapel') {
    for (const s of [-1, 1]) {
      const l = rbox(3.6, 20, 0.5, dark, {}, 0.2)
      l.position.set(s * 5.5, yN - 10, front + 0.2)
      l.rotation.z = s * 0.25
      out.add(l)
    }
    out.add(rbox(5, 12, 0.4, acc, { y: yN - 13, z: front + 0.05 }, 0.15))
  }
  if (g.collar === 'turtle') out.add(rbox(11, 4.5, g.T + 1.2, dark, { y: yN - 2.5, z: zc }, 1))
  if (g.collar === 'v')
    for (const s of [-1, 1]) {
      const v = rbox(1.6, 16, 0.4, acc, {}, 0.15)
      v.position.set(s * 2, yN - 7.5, front + 0.1)
      v.rotation.z = -s * 0.26
      out.add(v)
    }
  if (g.collar === 'hood') {
    out.add(ball(1, main, { y: yN - 9, z: zc - g.T / 2 - 0.3 }, [11, 12, 1]))
    for (const s of [-1, 1]) out.add(stick([s * 2, yN - 1, front + 0.2], [s * 2.3, yN - 16, front + 0.2], 0.25, acc, 6))
  }
  // 前襟
  if (g.buttons) {
    const y1 = g.collar === 'lapel' ? yN - 22 : yN - 5
    const step = Math.min(9, (y1 - (yB + 8)) / Math.max(1, g.buttons - 1))
    for (let i = 0; i < g.buttons; i++) out.add(ball(0.55, acc, { y: y1 - i * step, z: front + 0.05 }))
  }
  if (g.zip) out.add(rbox(0.7, g.L - 3, 0.5, acc, { y: yB + 1, z: front + 0.1 }, 0.15))
  if (g.quilt)
    for (let i = 1; i <= g.quilt; i++) out.add(rbox(g.hw + 0.3, 0.7, g.T + 0.6, dark, { y: yB + (i * (yS - 7 - yB)) / (g.quilt + 1), z: zc }, 0.3))
  if (g.belt) {
    const wy = yS - 16
    const k = (yS - 7 - wy) / (yS - 7 - yB)
    out.add(rbox(g.cw + (g.hw - g.cw) * k + 0.6, 3, g.T + 0.6, acc, { y: wy, z: zc }, 0.4))
  }
  if (g.pockets) for (const s of [-1, 1]) out.add(rbox(9, 9, 0.5, dark, { x: s * g.hw * 0.25, y: yB + g.L * 0.1, z: front + 0.1 }, 0.3))
  if (g.kanga) out.add(rbox(22, 11, 0.5, dark, { y: yB + 8, z: front + 0.1 }, 0.5))
  if (g.rib) out.add(rbox(g.hw + 0.4, 4, g.T + 0.6, dark, { y: yB - 0.2, z: zc }, 0.6))
  return out
}
type FoldKind = 'collar' | 'hood' | 'quilt' | 'buttons'
function foldedG(p: string[], w: number, d: number, h: number, kind: FoldKind) {
  const [main, , acc] = p
  const g = new THREE.Group()
  const r = Math.min(1.2, h * 0.25)
  g.add(rbox(w, h * 0.55, d, main, {}, r))
  g.add(rbox(w - 0.8, h * 0.5, d - 0.8, main, { y: h * 0.5 }, r))
  if (kind === 'collar') g.add(torus(3.8, 0.5, shade(main, -0.08), { y: h, z: -d / 2 + 5, rx: PI / 2 }, PI))
  if (kind === 'hood') g.add(ball(1, shade(main, -0.04), { y: h, z: -d / 2 + 6 }, [8, 1.4, 5]))
  if (kind === 'quilt') for (let i = 1; i < 4; i++) g.add(rbox(w - 1.4, 0.7, 0.7, shade(main, -0.08), { y: h - 0.4, z: -d / 2 + (i * d) / 4 }, 0.3))
  if (kind === 'buttons') for (let i = 0; i < 4; i++) g.add(ball(0.55, acc, { y: h, z: -d / 2 + 5 + i * ((d - 10) / 3) }))
  return ground(g)
}

const GARMENT_PALS: Record<string, Pal[]> = {
  coat: [['nordic', ['#c49a6c', N.oak, N.white]], ['modern', [M.char, M.black, M.silver]], ['industrial', ['#6b5a4a', I.iron, I.rust]], ['retro', [R.olive, R.caramel, R.cream]], ['japanese', [J.ai, J.wood, J.washi]]],
  down: [['modern', [M.black, M.char, M.silver]], ['nordic', [N.sage, N.oak, N.white]], ['cute', [C.lilac, C.white, C.pink]], ['retro', [R.orange, R.caramel, R.cream]], ['industrial', ['#5d6b5a', I.iron, I.rust]]],
  suit: [['modern', [M.char, M.black, '#e8edf3']], ['modern', ['#3c4a63', M.black, '#e8edf3']], ['nordic', [N.gray, N.oak, N.white]], ['retro', [R.caramel, R.caramel, R.cream]], ['industrial', [I.walnut, I.iron, I.concrete]]],
  hoodie: [['modern', [M.gray, M.black, M.white]], ['cute', [C.pink, C.white, C.white]], ['nordic', [N.sage, N.oak, N.white]], ['retro', [R.mustard, R.caramel, R.cream]], ['industrial', [I.iron, I.steel, I.rust]]],
  cardigan: [['nordic', [N.linen, N.oak, N.oak]], ['cute', [C.mint, C.white, C.white]], ['retro', [R.mustard, R.caramel, R.cream]], ['japanese', [J.washi, J.wood, J.ai]], ['modern', [M.light, M.black, M.char]]],
  dress: [['cute', [C.sakura, C.white, C.pink]], ['nordic', [N.blue, N.oak, N.white]], ['retro', [R.red, R.caramel, R.cream]], ['modern', [M.black, M.char, M.silver]], ['japanese', [J.ai, J.wood, J.washi]]],
  shirt: [['nordic', [N.white, N.oak, N.blue]], ['modern', ['#e8edf3', M.black, M.char]], ['cute', [C.sky, C.white, C.white]], ['retro', [R.cream, R.caramel, R.teal]], ['industrial', ['#7d8fa3', I.iron, I.rust]]],
  sweater: [['nordic', [N.mustard, N.oak, N.white]], ['cute', [C.lilac, C.white, C.white]], ['retro', [R.red, R.caramel, R.cream]], ['modern', [M.char, M.black, M.gray]], ['japanese', [J.ai, J.wood, J.washi]]],
  raincoat: [['cute', [C.lemon, C.white, C.sky]], ['modern', [M.char, M.black, M.silver]], ['nordic', [N.blue, N.oak, N.white]], ['retro', [R.mustard, R.caramel, R.red]], ['industrial', ['#5d6b5a', I.iron, I.rust]]],
}
const GARMENT_LIST: [string, string, GSpec, [number, number, number, FoldKind]][] = [
  ['coat', '大衣', { sw: 46, cw: 46, hw: 54, L: 100, T: 3.2, sleeve: 58, collar: 'lapel', buttons: 4, pockets: true }, [36, 42, 8, 'collar']],
  ['down', '羽绒服', { sw: 48, cw: 48, hw: 48, L: 68, T: 5, sleeve: 56, collar: 'turtle', zip: true, quilt: 5 }, [36, 40, 12, 'quilt']],
  ['suit', '西装外套', { sw: 44, cw: 42, hw: 42, L: 70, T: 2.4, sleeve: 58, collar: 'lapel', buttons: 2, pockets: true }, [32, 40, 6, 'collar']],
  ['hoodie', '卫衣', { sw: 46, cw: 46, hw: 44, L: 64, T: 2.6, sleeve: 56, collar: 'hood', kanga: true, rib: true }, [32, 36, 7, 'hood']],
  ['cardigan', '开衫', { sw: 44, cw: 42, hw: 42, L: 62, T: 2, sleeve: 54, collar: 'v', buttons: 5, rib: true }, [30, 34, 5, 'buttons']],
  ['dress', '连衣裙', { sw: 41, cw: 32, hw: 60, L: 100, T: 1.6, sleeve: 0, short: true, collar: 'round', belt: true }, [30, 38, 5, 'collar']],
  ['shirt', '衬衫', { sw: 44, cw: 44, hw: 44, L: 70, T: 1.4, sleeve: 58, collar: 'shirt', buttons: 6 }, [28, 36, 4, 'buttons']],
  ['sweater', '毛衣', { sw: 46, cw: 46, hw: 44, L: 62, T: 2.8, sleeve: 54, collar: 'turtle', rib: true }, [32, 34, 7, 'collar']],
  ['raincoat', '雨衣', { sw: 48, cw: 48, hw: 56, L: 96, T: 1.8, sleeve: 58, collar: 'hood', buttons: 4, pockets: true }, [30, 36, 6, 'hood']],
]
const GDIMS: Record<string, Dims> = {
  'sf-coat-folded': [36, 42, 8.5],
  'sf-coat-hanging': [54, 5.6, 105.4],
  'sf-down-folded': [36, 40, 12.3],
  'sf-down-hanging': [50.6, 7.4, 73.4],
  'sf-suit-folded': [32, 40, 6.5],
  'sf-suit-hanging': [46.7, 4.8, 75.4],
  'sf-hoodie-folded': [32, 36, 8.4],
  'sf-hoodie-hanging': [49.1, 6.5, 70.8],
  'sf-cardigan-folded': [30, 34, 5.6],
  'sf-cardigan-hanging': [47, 4.4, 68.4],
  'sf-dress-folded': [30, 38, 5.5],
  'sf-dress-hanging': [60, 4, 105.4],
  'sf-shirt-folded': [28, 36, 4.6],
  'sf-shirt-hanging': [46.7, 3.8, 75.4],
  'sf-sweater-folded': [32, 34, 7.5],
  'sf-sweater-hanging': [49, 5.2, 68.8],
  'sf-raincoat-folded': [30, 36, 7.4],
  'sf-raincoat-hanging': [56, 5.8, 101.4],
}
const GARMENT_ITEMS: AssetDef[] = GARMENT_LIST.flatMap(([key, name, spec, [fw, fd, fh, fk]]) =>
  forms(key, name, 'deco', GARMENT_PALS[key], [
    { id: `sf-${key}-folded`, form: 'folded', dims: GDIMS[`sf-${key}-folded`], build: (p) => foldedG(p, fw, fd, fh, fk) },
    { id: `sf-${key}-hanging`, form: 'hanging', dims: GDIMS[`sf-${key}-hanging`], build: (p) => garmentHang(p, spec) },
  ]),
)

// 和服 / 浴衣：挂起时用和服衣架杆穿过两袖，展开成 T 形
const KIMONO_PALS: Pal[] = [
  ['japanese', [J.ai, J.dark, J.washi]],
  ['japanese', [J.shu, J.dark, J.washi]],
  ['cute', [C.sakura, C.woodD, C.white]],
  ['nordic', [N.blue, N.oak, N.white]],
  ['retro', [R.teal, R.caramel, R.cream]],
]
function kimonoHanging(p: string[]) {
  const [main, wood, acc] = p
  const T = 1.6
  const zc = 0.6 + T / 2
  const g = G(hangerHook(zc))
  const ry = -5.6
  const top = ry + 1.2
  const front = zc + T / 2
  g.add(cylX(0.5, 132, wood, 0, ry, zc))
  for (const s of [-1, 1]) g.add(ball(1.1, wood, { x: s * 66, y: ry, z: zc }))
  g.add(rbox(64, 136, T, main, { y: top - 136, z: zc }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(33, 48, T - 0.2, main, { x: s * (31.8 + 16.5), y: top - 48, z: zc }, 0.6))
  for (const s of [-1, 1]) {
    const e = rbox(4, 70, 0.5, acc, {}, 0.2)
    e.position.set(s * 4.2, top - 35, front + 0.2)
    e.rotation.z = -s * 0.08
    g.add(e)
  }
  g.add(rbox(64.4, 4, T + 0.4, shade(main, -0.1), { y: top - 136.2, z: zc }, 0.4))
  const flowers: [number, number][] = [
    [-20, top - 110],
    [14, top - 122],
    [-6, top - 95],
    [22, top - 80],
    [-48, top - 38],
    [48, top - 30],
  ]
  for (const [x, y] of flowers) g.add(cylZ(2.2, 0.4, acc, x, y, front + 0.1, 16))
  return g
}
function kimonoFolded(p: string[]) {
  const [main, , acc] = p
  return ground(G(rbox(40, 4, 86, main, {}, 1), rbox(4, 0.4, 60, acc, { x: -10, y: 3.9, z: -8 }, 0.15), cyl(2.2, 2.2, 0.4, acc, { x: 8, y: 3.9, z: 18 }, 16)))
}

// 围裙：挂起时脖带套在 S 钩上
const APRON_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.blue]],
  ['japanese', [J.ai, J.dark, J.washi]],
  ['cute', [C.pink, C.white, C.white]],
  ['industrial', [I.leather, I.iron, I.steel]],
  ['retro', [R.red, R.caramel, R.cream]],
]
function apronHanging(p: string[]) {
  const [main, strap, acc] = p
  const g = G(sHook())
  const bibTop = -16
  const waist = bibTop - 22
  g.add(tube([[-10, bibTop - 0.5, S_Z], [-6, -9, S_Z], [0, S_LOW + 0.25 + 0.3, S_Z], [6, -9, S_Z], [10, bibTop - 0.5, S_Z]], 0.3, strap, false, 24))
  g.add(rbox(24, 22, 0.8, main, { y: waist, z: S_Z }, 0.3))
  g.add(rbox(54, 46, 1.0, main, { y: waist - 45, z: S_Z }, 0.4))
  g.add(rbox(20, 10, 0.4, acc, { y: waist - 22, z: S_Z + 0.6 }, 0.15))
  for (const s of [-1, 1]) g.add(bar([s * 26, waist - 1, S_Z + 0.2], [s * 24.5, waist - 30, S_Z + 0.2], 1.4, 0.3, strap))
  return g
}
function apronFolded(p: string[]) {
  const [main, strap, acc] = p
  return ground(G(rbox(24, 2.4, 22, main, {}, 0.8), rbox(10, 0.4, 6, acc, { y: 2.3, z: 5 }, 0.15), rbox(1.4, 0.4, 22.4, strap, { x: -6, y: 2.3 }, 0.15)))
}

// 帽子：挂起时帽檐后沿搭在 S 钩上，帽顶朝外
const STRAW_PALS: Pal[] = [
  ['japanese', ['#e9cf8f', J.dark, J.shu]],
  ['nordic', ['#e6d3a3', N.oak, N.blue]],
  ['cute', ['#f3e2b0', C.pink, C.pink]],
  ['retro', ['#e0c27a', R.caramel, R.red]],
]
function beanie(p: string[]) {
  const [main, sec, acc] = p
  return G(dome(8.5, main, 0, 3.6, 0, 1.15), cyl(8.8, 8.8, 4, sec, {}, 32), ball(3, acc, { y: 3.6 + 9.775 + 2.2 }))
}
function strawHat(p: string[]) {
  const [main, , acc] = p
  const g = G(puck(17, 0.8, main), cyl(6.2, 6.8, 8, main, { y: 0.6 }, 28), puck(6.2, 1.4, main, { y: 8 }), cyl(7.2, 7.2, 1.8, acc, { y: 1.2 }, 28))
  g.add(ball(1.4, acc, { x: 7.2, y: 2.1 }, [0.6, 1, 1.4]))
  return g
}
function bucketHat(p: string[]) {
  const [main, sec] = p
  return G(cyl(8.2, 11.5, 3, main, {}, 28), cyl(7, 7.6, 6.5, main, { y: 2.6 }, 28), puck(7, 1.2, main, { y: 8.5 }), cyl(7.9, 7.9, 1, sec, { y: 3.1 }, 28))
}
function topHat(p: string[]) {
  const [main, sec] = p
  return G(puck(15, 1, main), cyl(9, 8.6, 15, main, { y: 0.8 }, 28), cyl(9.1, 9.1, 3, sec, { y: 1 }, 28))
}
const hatHang = (hat: THREE.Group) => G(hangAt(turned(hat, PI / 2), S_UNDER + 0.1), sHook())

// 包：斜挎包 / 手提包
const BAG_PALS: Pal[] = [
  ['industrial', [I.leather, I.walnut, '#c9a45c']],
  ['modern', [M.black, M.char, M.silver]],
  ['cute', [C.lilac, C.pink, C.lemon]],
  ['nordic', [N.linen, N.oak, STEEL]],
  ['retro', [R.mustard, R.caramel, '#c9a45c']],
]
function crossBody(p: string[]) {
  const [main, sec, acc] = p
  const g = G(rbox(22, 15, 7, main, {}, 2.4), rbox(22.4, 0.6, 7.6, sec, { y: 14.6 }, 0.25), rbox(22.4, 8, 0.6, sec, { y: 7, z: 3.7 }, 0.25), ball(0.8, acc, { y: 7.6, z: 4.1 }))
  for (const s of [-1, 1]) g.add(torus(0.9, 0.25, acc, { x: s * 11.3, y: 14, ry: PI / 2 }))
  return g
}
function crossStanding(p: string[]) {
  const [, sec] = p
  const g = crossBody(p)
  g.add(tube([[-11.3, 13.4, 0], [-14, 6, -6], [-12, 0.5, -14], [0, 0.5, -20], [12, 0.5, -14], [14, 6, -6], [11.3, 13.4, 0]], 0.5, sec, false, 40))
  return ground(g)
}
function crossHanging(p: string[]) {
  const [, sec] = p
  const body = crossBody(p)
  const top = -40
  body.position.set(0, top - 15, 0.3 + 3.8)
  const g = G(body, sHook())
  g.add(tube([[-11.3, top - 1.6, 4.1], [-8, top + 14, 3.4], [-3, -10, S_Z + 0.2], [0, -5.75, S_Z], [3, -10, S_Z + 0.2], [8, top + 14, 3.4], [11.3, top - 1.6, 4.1]], 0.5, sec, false, 40))
  return g
}
function handBag(p: string[]) {
  const [main, sec, acc] = p
  return G(rbox(30, 21, 12, main, { y: 1.6 }, 2.4), rbox(31, 2, 13, sec, {}, 0.6), rbox(4, 2.4, 0.6, acc, { y: 16, z: 6.2 }, 0.3))
}
function handStanding(p: string[]) {
  const [, sec] = p
  const g = handBag(p)
  for (const z of [-3.6, 3.6]) g.add(torus(8, 0.7, sec, { y: 22.2, z }, PI))
  return ground(g)
}
function handHanging(p: string[]) {
  const [, sec] = p
  const body = handBag(p)
  const top = -20
  body.position.set(0, top - 22.6, 0.3 + 6.5)
  const g = G(body, sHook())
  for (const z of [0.3 + 6.5 - 3.6, 0.3 + 6.5 + 3.6]) g.add(tube([[-8, top - 0.6, z], [-5, top + 8, (z + S_Z) / 2], [0, -5.6, S_Z], [5, top + 8, (z + S_Z) / 2], [8, top - 0.6, z]], 0.7, sec, false, 30))
  return g
}

const MORE_WEAR: AssetDef[] = [
  ...forms('kimono', '和服 / 浴衣', 'japanese', KIMONO_PALS, [
    { id: 'sf-kimono-folded', form: 'folded', dims: [40, 86, 4.3], build: kimonoFolded },
    { id: 'sf-kimono-hanging', form: 'hanging', dims: [134.2, 3.9, 140.6], build: kimonoHanging },
  ]),
  ...forms('apron', '围裙', 'deco', APRON_PALS, [
    { id: 'sf-apron-folded', form: 'folded', dims: [24, 22.4, 2.7], build: apronFolded },
    { id: 'sf-apron-hanging', form: 'hanging', dims: [54, 5.3, 83], build: apronHanging },
  ]),
  ...forms('beanie', '毛线帽', 'deco', HAT_PALS, [
    { id: 'sf-beanie-lying', form: 'lying', dims: [17.6, 17.6, 18.6], build: (p) => ground(beanie(p)) },
    { id: 'sf-beanie-hanging', form: 'hanging', dims: [17.6, 20.1, 24.2], build: (p) => hatHang(beanie(p)) },
  ]),
  ...forms('straw-hat', '草帽', 'deco', STRAW_PALS, [
    { id: 'sf-straw-hat-lying', form: 'lying', dims: [34, 34, 9.4], build: (p) => ground(strawHat(p)) },
    { id: 'sf-straw-hat-hanging', form: 'hanging', dims: [34, 10.9, 40.6], build: (p) => hatHang(strawHat(p)) },
  ]),
  ...forms('bucket-hat', '渔夫帽', 'deco', HAT_PALS, [
    { id: 'sf-bucket-hat-lying', form: 'lying', dims: [23, 23, 9.7], build: (p) => ground(bucketHat(p)) },
    { id: 'sf-bucket-hat-hanging', form: 'hanging', dims: [23, 11.2, 29.6], build: (p) => hatHang(bucketHat(p)) },
  ]),
  ...forms('top-hat', '礼帽', 'deco', HAT_PALS, [
    { id: 'sf-top-hat-lying', form: 'lying', dims: [30, 30, 15.8], build: (p) => ground(topHat(p)) },
    { id: 'sf-top-hat-hanging', form: 'hanging', dims: [30, 17.3, 36.6], build: (p) => hatHang(topHat(p)) },
  ]),
  ...forms('crossbody-bag', '斜挎包', 'deco', BAG_PALS, [
    { id: 'sf-crossbody-standing', form: 'standing', dims: [29.1, 25.4, 15.7], build: crossStanding },
    { id: 'sf-crossbody-hanging', form: 'hanging', dims: [23.6, 10.2, 55], build: crossHanging },
  ]),
  ...forms('handbag', '手提包', 'deco', BAG_PALS, [
    { id: 'sf-handbag-standing', form: 'standing', dims: [31, 13, 30.9], build: handStanding },
    { id: 'sf-handbag-hanging', form: 'hanging', dims: [31, 14.5, 42.6], build: handHanging },
  ]),
]

export const STORAGE_FORMS: AssetDef[] = [
  COAT_TREE,
  LADDER_HANGER,
  HALL_TREE,
  DOOR_RACK,
  DOUBLE_RAIL,
  IKOU,
  ...GARMENT_ITEMS,
  ...MORE_WEAR,
  ...PEGBOARDS,
  ...PEG_SETS,
  ...PEG_ACCESSORIES,
  ...WALL_TIERS,
  LADDER,
  CORNER_SHELF,
  ...OPEN_RACKS,
  ...WIRE_RACKS,
  KITCHEN_RACK,
  COUNTER_RACK,
  BATH_CORNER,
  DISPLAY_CUBE,
  ...SHOE_RACKS,
  ...GARMENT_RAILS,
  ...TOWEL_BARS,
  ...HOOK_RAILS,
  DOOR_HOOKS,
  UMBRELLA_HOOK,
  KITCHEN_BAR,
  ...FORM_ITEMS,
  ...DAILY,
]
