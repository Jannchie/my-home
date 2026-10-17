// 运动 / 户外装备素材包：球类、登山攀岩、露营、瑜伽普拉提辅具、其他运动装备、装备收纳。
// 约定见 kit.ts 开头；id 统一用 gr- 前缀。
//   - 挂起形态（form: 'hanging'）沿用 storage-forms 的约定：原点 = 挂点，模型在原点下方，本体在 z ≥ 0.3；
//     自带 S 钩（上环内顶 y ≈ -0.5），挂件的环套在 S 钩下环（y ≈ -6.4）上。
//   - 球的接缝用浮出表面的细管 / 贴片（sphPatch，离表面 ≥ 0.3）。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, ellipsePoly, holePanel, rectPoly, slab, type AssetCategory, type AssetDef, type Poly } from '../kit'
import { P, PI, cylX, cylZ, fitBuild, ghost, lit, noOutline, rod3, taperRod3, type V3 } from '../geo'
import { I, M, N, R, definer, type Build, type PalFlat } from '../packkit'

/** 落地、无层板的素材 build 之后按包围盒居中、贴地 */
const def = definer({}, (b, e) => (e.form !== 'hanging' && e.mount === undefined && !e.surfaces ? fitBuild(b) : b))

const STEEL = '#c3c7cc'
const DARK = '#2e2f33'
const RUBBER = '#3a3b40'
const WHITE = '#fbfaf6'
const LAMP = '#fff2b8'
const GLASS = '#cfe8f5'
const STITCH = '#d8473a'
const TENNIS = '#d8ec4a'
const WOOD = '#d9b98c'
const PAPER = '#f1ead2'

// ---------- 定义 ----------

const prop = (id: string, name: string, category: AssetCategory, dims: V3, pals: PalFlat[], build: Build, extra: Partial<AssetDef> = {}) =>
  def(id, name, category, dims, pals, build, { prop: true, ...extra })

// ---------- 小工具 ----------

/** 双面材质（开口的壳：头盔、帐篷、飞盘） */
function dbl<T extends THREE.Mesh>(m: T): T {
  const mat = (m.material as THREE.Material).clone()
  mat.side = THREE.DoubleSide
  m.material = mat
  return m
}

/** 平放的圆环（在 xz 平面），给中心 */
const ringFlat = (r: number, t: number, color: string, x: number, y: number, z: number, arc = PI * 2) => torus(r, t, color, { x, y, z, rx: PI / 2 }, arc)

/** 沿平滑曲线的管子（绳、带子、把手、钩子） */
function tubeLine(pts: V3[], r: number, color: string, closed = false, seg?: number) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
    'centripetal',
  )
  const geo = new THREE.TubeGeometry(curve, seg ?? pts.length * 10, r, 8, closed)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** yz 平面里的圆弧点：z = cz + r cos a，y = cy + r sin a */
function arcYZ(cy: number, cz: number, r: number, a0: number, a1: number, n: number, x = 0): V3[] {
  return Array.from({ length: n + 1 }, (_, i): V3 => {
    const a = a0 + ((a1 - a0) * i) / n
    return [x, cy + Math.sin(a) * r, cz + Math.cos(a) * r]
  })
}

/** 挂起形态自带的 S 钩：上环内顶 y ≈ -0.5（挂在杆上），下环底 y ≈ -6.4、z = 2.6 */
const HOOK_Y = -6.65
const HOOK_Z = 2.6
function sHook(color = STEEL) {
  const top = arcYZ(-1.45, 0.2, 1.2, PI * 1.15, 0, 8)
  const bottom = arcYZ(-5.2, HOOK_Z, 1.2, PI, PI * 2.2, 8)
  return tubeLine([...top, ...bottom], 0.25, color, false, 60)
}

/** 球面贴片（SphereGeometry 的一部分），phi 绕 y 轴（phi = π/2 朝 +z），theta 从 +y 极往下 */
function sphPatch(r: number, color: string, phi0: number, dphi: number, th0: number, dth: number, seg = 32) {
  const geo = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg / 2)), phi0, dphi, th0, dth)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 让物体的局部 x 轴对齐 s、局部 z 轴对齐 f */
function orientFS<T extends THREE.Object3D>(o: T, f: V3, s: V3): T {
  const F = new THREE.Vector3(...f).normalize()
  const Sv = new THREE.Vector3(...s).normalize()
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Sv, F.clone().cross(Sv), F))
  return o
}

/** 网球 / 棒球的接缝曲线（在半径 R 的球面上） */
function seam(R: number, color: string, tube = 0.3, a = 0.7) {
  const b = 1 - a
  const c = 2 * Math.sqrt(a * b)
  const pts: V3[] = []
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * PI * 2
    pts.push([(a * Math.cos(t) + b * Math.cos(3 * t)) * R, (a * Math.sin(t) - b * Math.sin(3 * t)) * R, c * Math.sin(2 * t) * R])
  }
  return noOutline(tubeLine(pts, tube, color, true, 160))
}

/** 带接缝的小球（棒球、垒球、网球），球心在 (x, r, z) */
function seamBall(r: number, color: string, seamColor: string, x = 0, z = 0, ry = 0) {
  const g = G(ball(r, color), seam(r, seamColor, Math.max(0.18, r * 0.05)))
  return P(g, x, r, z, 0.4, ry, 0.3)
}

/** 把一个物体放在球面某个方向上（沿法线），dist 为离球心距离 */
function onSphere<T extends THREE.Object3D>(o: T, dir: V3, dist: number, center: V3 = [0, 0, 0]): T {
  const d = new THREE.Vector3(...dir).normalize()
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
  o.position.set(center[0] + d.x * dist, center[1] + d.y * dist, center[2] + d.z * dist)
  return o
}

/** 球面上均匀分布的方向 */
function fib(n: number): V3[] {
  const out: V3[] = []
  const ga = PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const rr = Math.sqrt(1 - y * y)
    out.push([Math.cos(ga * i) * rr, y, Math.sin(ga * i) * rr])
  }
  return out
}

/** 开口的半球壳（头盔、泳帽），开口在 y = 0，DoubleSide */
function dome(r: number, color: string, scale: V3, thMax = PI / 2) {
  const m = dbl(sphPatch(r, color, 0, PI * 2, 0, thMax))
  m.scale.set(...scale)
  return m
}

/** 登山杖 / 滑雪杖：从 a（杖尖）到 b（握把顶） */
function pole(a: V3, b: V3, shaft: string, grip: string, strap: string, o: { r?: number; basket?: number; sections?: boolean; lying?: boolean } = {}) {
  const r = o.r ?? 0.9
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const L = A.distanceTo(B)
  const u = B.clone().sub(A).normalize()
  const at = (t: number): V3 => {
    const v = A.clone().addScaledVector(u, t)
    return [v.x, v.y, v.z]
  }
  const g = G()
  g.add(taperRod3(at(0), at(6), 0.22, 0.55, DARK))
  if (o.sections !== false) {
    g.add(rod3(at(6), at(L * 0.42), r * 0.75, shaft))
    g.add(rod3(at(L * 0.42), at(L * 0.72), r * 0.88, shaft))
    g.add(rod3(at(L * 0.72), at(L - 13), r, shaft))
    g.add(rod3(at(L * 0.42 - 1), at(L * 0.42 + 1.4), r * 0.88 + 0.35, strap))
    g.add(rod3(at(L * 0.72 - 1), at(L * 0.72 + 1.4), r + 0.35, strap))
  } else g.add(rod3(at(6), at(L - 13), r, shaft))
  const bk = o.basket ?? 2.6
  g.add(taperRod3(at(7.2), at(7.9), bk, bk, grip, 16))
  g.add(taperRod3(at(L - 14), at(L - 1.5), 1.6, 1.85, grip, 12))
  g.add(ball(1.85, grip, { x: at(L - 1.5)[0], y: at(L - 1.5)[1], z: at(L - 1.5)[2] }))
  // 腕带：从握把顶垂下的一个扁环
  // 立着时腕带往下垂；平放时腕带摊在地上（往 +z 伸、略往下贴地）
  const t0 = at(L - 3)
  const off = (side: number, down: number, out: number): V3 =>
    o.lying ? [t0[0] - down * 0.6, t0[1] - Math.min(down * 0.15, 1.4), t0[2] + side + out] : [t0[0] + side, t0[1] - down, t0[2] + out]
  g.add(tubeLine([t0, off(2.2, 3, 1.2), off(2.6, 9, 1.6), off(0.8, 10.5, 1.8), off(0.4, 5, 1.2)], 0.35, strap, true))
  return g
}

/** 登山扣：竖直的椭圆环（xy 平面），中心在原点 */
function biner(col: string, r = 2.6, t = 0.42, lock = false) {
  const ring = torus(r, t, col)
  ring.scale.set(0.62, 1, 1)
  const g = G(ring)
  if (lock) g.add(rod3([r * 0.62, -r * 0.35, 0], [r * 0.62, r * 0.3, 0], t + 0.35, '#e3b549'))
  return g
}

/** 快挂：上扣顶在 y = 2.6，往下约 17cm */
function quickdraw(sling: string, b1: string, b2: string) {
  return G(biner(b1), rbox(1.8, 10.6, 0.7, sling, { y: -12.6 }, 0.3), P(biner(b2), 0, -15, 0))
}

/** 网球拍（竖着，拍柄底在 y = 0，拍面在 xy 平面） */
function tennisRacket(frame: string, grip: string, str: string) {
  const g = G()
  const head = torus(13, 0.8, frame, { y: 52 })
  head.scale.set(0.82, 1, 1)
  g.add(head)
  const face = ghost(P(cyl(12.4, 12.4, 0.3, str, {}, 32), 0, 52, 0, PI / 2), str, 0.45)
  face.scale.set(0.82, 1, 1)
  g.add(face)
  for (let i = -3; i <= 3; i++) {
    const x = i * 2.6
    const hh = 12 * Math.sqrt(Math.max(0, 1 - (x / 10.1) ** 2))
    g.add(noOutline(cyl(0.12, 0.12, hh * 2, str, { x, y: 52 - hh }, 6)))
  }
  for (const s of [-1, 1]) g.add(rod3([s * 1.4, 30, 0], [s * 7, 41.5, 0], 0.7, frame))
  g.add(rod3([-5.8, 40.2, 0], [5.8, 40.2, 0], 0.6, frame))
  g.add(rbox(2.8, 30, 2.4, grip, {}, 0.8))
  g.add(rbox(3.2, 1.4, 2.8, frame, {}, 0.5))
  return g
}

/** 羽毛球拍（竖着，拍柄底在 y = 0） */
function badmintonRacket(frame: string, grip: string, str: string) {
  const g = G()
  const head = torus(11, 0.5, frame, { y: 55.5 })
  head.scale.set(0.85, 1, 1)
  g.add(head)
  const face = ghost(P(cyl(10.6, 10.6, 0.2, str, {}, 32), 0, 55.5, 0, PI / 2), str, 0.4)
  face.scale.set(0.85, 1, 1)
  g.add(face)
  g.add(cyl(0.45, 0.45, 22, frame, { y: 22.5 }, 8))
  g.add(cyl(0.5, 1.2, 4, frame, { y: 20 }, 10))
  g.add(rbox(2.6, 20, 2.2, grip, {}, 0.8))
  return g
}

// ====================================================================
// 球类
// ====================================================================

function volleyball(p: string[]) {
  const [a, b, c] = p
  const r = 10.5
  const g = G(ball(r, a, { y: r }))
  const faces: [V3, V3, string][] = [
    [[0, 0, 1], [1, 0, 0], b],
    [[0, 0, -1], [1, 0, 0], b],
    [[1, 0, 0], [0, 1, 0], c],
    [[-1, 0, 0], [0, 1, 0], c],
    [[0, 1, 0], [0, 0, 1], b],
    [[0, -1, 0], [0, 0, 1], c],
  ]
  for (const [f, s, col] of faces) {
    const m = noOutline(orientFS(sphPatch(r + 0.3, col, PI / 2 - 0.66, 1.32, PI / 2 - 0.27, 0.54), f, s))
    m.position.y = r
    g.add(m)
  }
  return g
}

function rugby(p: string[]) {
  const [a, b, c] = p
  const R0 = 14
  const k = 0.65
  const cy = R0 * k
  const g = G(ball(R0, a, { y: cy }, [1, k, k]))
  const sg = G(torus(R0, 0.3, b), torus(R0, 0.3, b, { rx: PI / 2 }))
  sg.scale.set(1.01, k + 0.025, k + 0.025)
  sg.position.y = cy
  g.add(sg)
  g.add(rbox(8.5, 0.6, 1.4, c, { y: 2 * cy - 0.25 }, 0.25))
  for (let i = 0; i < 6; i++) g.add(rbox(0.5, 0.5, 2.6, c, { x: -3.5 + i * 1.4, y: 2 * cy - 0.05 }, 0.2))
  return g
}

function softballs(p: string[]) {
  const [a, b] = p
  return G(seamBall(4.85, a, b, -5.2, 0, 0), seamBall(4.85, a, b, 5.2, 1.5, 1.4))
}

function tennisCan(p: string[]) {
  const [can, lid, bc] = p
  const r = 3.8
  const h = 21
  const g = G(ghost(cup(r, r, h, 0.2, GLASS), GLASS, 0.3))
  g.add(cyl(r + 0.3, r + 0.3, 0.9, lid, {}, 28))
  g.add(puck(r + 0.35, 1.4, lid, { y: h - 0.3 }))
  g.add(cyl(r + 0.3, r + 0.3, 3, can, { y: 1.2 }, 28))
  for (let i = 0; i < 3; i++) g.add(P(G(ball(3.2, bc), seam(3.2, WHITE, 0.2)), 0, 0.9 + 3.25 + i * 6.5, 0, 0.3 * i, i))
  g.add(seamBall(3.35, bc, WHITE, 8, 2))
  return g
}

function paddle(rubber: string, back: string, wood: string) {
  const blade = G(cyl(7.5, 7.5, 0.6, wood, { y: -0.3 }, 28), cyl(7.4, 7.4, 0.25, rubber, { y: 0.28 }, 28), cyl(7.4, 7.4, 0.25, back, { y: -0.53 }, 28))
  blade.scale.set(1, 1, 1.06)
  return G(blade, rbox(2.9, 1.8, 10, wood, { y: -0.9, z: -12.6 }, 0.7), rbox(3.4, 1.4, 2.4, wood, { y: -0.7, z: -7.8 }, 0.5))
}
function pingpong(p: string[]) {
  const [a, b, c] = p
  const g = G(P(paddle(a, RUBBER, WOOD), -9, 0.9, 0, 0, 0.25), P(paddle(b, RUBBER, WOOD), 9, 0.9, -1, 0, -0.3))
  for (const [x, z] of [
    [-3, 12],
    [1.5, 13],
    [5.5, 11.5],
  ])
    g.add(ball(2, c, { x, y: 2, z }))
  return g
}

function shuttle(cork: string) {
  return G(cup(3.2, 1.2, 6, 0.15, WHITE, { y: 1.1 }), ball(1.25, cork, { y: 1.1 }), torus(1.3, 0.25, STITCH, { y: 1.6, rx: PI / 2 }))
}
function shuttleTube(p: string[]) {
  const [a, b, c] = p
  const g = G(cylX(4.2, 30, a, 0, 4.5, 0, 20), cylX(4.5, 3, b, -15.5, 4.5, 0, 20), cylX(4.5, 3, b, 15.5, 4.5, 0, 20), cylX(4.5, 7, c, 0, 4.5, 0, 20))
  g.add(P(shuttle('#e8d2b0'), -4, 1.4, 10, 0, 0.3, PI / 2 - 0.25))
  return g
}

function golfBox(p: string[]) {
  const [a, b, c] = p
  const g = G(tray(16, 5, 11.5, 0.4, a))
  g.add(rbox(10, 1.6, 0.4, b, { y: 1.6, z: 5.9 }, 0.15))
  for (const x of [-5, 0, 5]) for (const z of [-2.6, 2.6]) g.add(ball(2.15, WHITE, { x, y: 0.4 + 2.15, z }))
  g.add(P(rbox(16, 11.5, 0.4, b, {}, 0.15), 0, 5.6, -7.6, -0.18))
  g.add(ball(2.15, WHITE, { x: 4, y: 2.15, z: 9.5 }))
  for (const [x, z, ry] of [
    [-4, 9, 0.2],
    [-2, 11, -0.4],
  ])
    g.add(P(cyl(0.65, 0.22, 5.4, c, {}, 10), x, 0.65, z, 0, ry, PI / 2))
  return g
}

function bowlingBall(p: string[]) {
  const [a, b] = p
  const r = 10.9
  const g = G(ball(r, a, { y: r }))
  const rnd = [
    [0.3, 0.9, 0.5, 0.4],
    [2.4, 0.7, 1.4, 0.35],
    [4.2, 1.1, 2.0, 0.5],
    [5.4, 0.6, 0.9, 0.3],
  ]
  for (const [ph, dph, th, dth] of rnd) {
    const m = noOutline(sphPatch(r + 0.3, b, ph, dph, th, dth, 24))
    m.position.y = r
    g.add(m)
  }
  for (const d of [
    [-0.24, 0.72, 0.65],
    [0.24, 0.72, 0.65],
    [0, 0.32, 0.95],
  ] as V3[])
    g.add(onSphere(cyl(1.15, 1.15, 1.0, DARK, {}, 16), d, r - 0.15, [0, r, 0]))
  return g
}

function bowlingBag(p: string[]) {
  const [a, b, c] = p
  const g = G(rbox(30, 26, 22, a, {}, 9))
  for (const s of [-1, 1]) g.add(P(rbox(1, 20, 16, b, {}, 5), s * 15.2, 13, 0))
  g.add(tubeLine([[-12, 26.2, 0], [0, 26.35, 0], [12, 26.2, 0]], 0.35, c))
  g.add(rbox(1.2, 2.4, 0.8, c, { x: 8, y: 25.2, z: 0.7 }, 0.3))
  for (const z of [-4.5, 4.5]) g.add(tubeLine([[-6, 25.4, z], [-4.5, 33, z * 0.8], [4.5, 33, z * 0.8], [6, 25.4, z]], 0.8, b))
  g.add(rbox(14, 6, 0.8, c, { y: 8, z: 11.2 }, 0.4))
  return g
}

function dodgeball(p: string[]) {
  const [a, b, c] = p
  const r = 10.5
  return G(ball(r, a, { y: r }), torus(r + 0.1, 0.5, b, { y: r }), torus(r + 0.1, 0.5, b, { y: r, ry: PI / 2 }), onSphere(cyl(3, 3, 0.6, c, {}, 20), [0.5, 0.6, 0.62], r - 0.05, [0, r, 0]))
}

function kidsBalls(p: string[]) {
  const [a, b, c] = p
  const g = G()
  for (const [r, col, x, z, tilt] of [
    [7.5, a, -6, -1, 0.3],
    [6, b, 8, -3, -0.5],
    [5, c, 2, 9, 0.9],
  ] as [number, string, number, number, number][]) {
    g.add(ball(r, col, { x, y: r, z }))
    g.add(torus(r, 0.32, WHITE, { x, y: r, z, rx: PI / 2 + tilt, ry: tilt }))
    g.add(torus(r, 0.32, WHITE, { x, y: r, z, rx: tilt, ry: PI / 2 }))
  }
  return g
}

/** 网兜里的一列球：网口在 y = 0，往 -y 装三个球 */
function netColumn(a: string, b: string, net: string) {
  const r = 10.5
  const g = G()
  const ys = [-13, -34.5, -56]
  ys.forEach((y, i) => {
    g.add(ball(r, i === 1 ? b : a, { y }))
    g.add(torus(r + 0.05, 0.3, i === 1 ? a : b, { y, rx: 0.5 + i, ry: i * 0.7 }))
  })
  const prof: [number, number][] = [
    [0.8, 0],
    [6, -4],
    [11, -13],
    [9.6, -23.75],
    [11, -34.5],
    [9.6, -45.25],
    [11, -56],
    [6, -65],
    [0.8, -67.6],
  ]
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * PI * 2
    g.add(noOutline(tubeLine(prof.map(([rr, y]): V3 => [Math.cos(t) * rr, y, Math.sin(t) * rr]), 0.18, net)))
  }
  for (const y of ys) g.add(noOutline(torus(11, 0.18, net, { y, rx: PI / 2 })))
  for (const y of [-23.75, -45.25]) g.add(noOutline(torus(9.6, 0.18, net, { y, rx: PI / 2 })))
  g.add(torus(1.2, 0.35, net, { y: 0.2, rx: PI / 2 }))
  return g
}
function ballNetHanging(p: string[]) {
  const [a, b, c] = p
  const g = G(sHook())
  g.add(torus(1.2, 0.3, c, { y: HOOK_Y - 1.2 + 0.3, z: HOOK_Z }))
  g.add(tubeLine([[0, HOOK_Y - 2.1, HOOK_Z], [0, -10, 6], [0, -12, 11.8]], 0.22, c))
  g.add(P(netColumn(a, b, c), 0, -12.2, 11.8))
  return g
}
function ballNetLying(p: string[]) {
  const [a, b, c] = p
  return G(P(netColumn(a, b, c), 0, 0, 0, 0, 0, PI / 2), tubeLine([[-1, 0.2, 0], [-6, -5, 4], [-12, -10.5, 2]], 0.22, c))
}

const RACK_TIERS = [8, 43, 78]
function ballRack(p: string[]) {
  const [a, b, c] = p
  const g = G()
  for (const x of [-38, 38]) for (const z of [-15, 15]) g.add(rbox(3.5, 100, 3.5, a, { x, z }, 0.8))
  for (const x of [-38, 38]) for (const z of [-15, 15]) g.add(ball(2.2, a, { x, y: 101, z }))
  RACK_TIERS.forEach((y, i) => {
    for (const z of [-8, 8]) g.add(cylX(1.2, 76, a, 0, y, z, 12))
    for (const x of [-38, 38]) g.add(cylZ(1.2, 30, a, x, y, 0, 12))
    const cols = [
      [b, c],
      [WHITE, b],
      [c, WHITE],
    ][i]
    ;[-24, 0].forEach((x, j) => {
      const col = cols[j]
      const cy = y + 9.21
      g.add(ball(11, col, { x, y: cy }))
      g.add(torus(11.05, 0.32, col === WHITE ? c : shade(col, -0.25), { x, y: cy, rx: PI / 2 + 0.4 * j, ry: 0.5 * i }))
      g.add(torus(11.05, 0.32, col === WHITE ? c : shade(col, -0.25), { x, y: cy, ry: PI / 2 + 0.3 * i }))
    })
  })
  return g
}

function bat(col: string, grip: string) {
  const prof: [number, number][] = [
    [0, 0],
    [2.9, 0],
    [3.3, 1],
    [3.3, 36],
    [2.4, 50],
    [1.5, 60],
    [1.3, 79],
    [2.1, 80],
    [2.2, 81.5],
    [0, 82],
  ]
  const geo = new THREE.LatheGeometry(
    prof.map(([x, y]) => new THREE.Vector2(x, y)),
    20,
  )
  const m = new THREE.Mesh(geo, toon(col))
  m.castShadow = true
  return G(m, cyl(1.62, 1.62, 15, grip, { y: 63 }, 14))
}
function batRack(p: string[]) {
  const [a, b, c] = p
  const g = G(rbox(56, 3, 28, a, {}, 1))
  g.add(rbox(40, 82, 2.5, a, { x: -6, y: 3, z: -12 }, 0.8))
  g.add(rbox(40, 3, 12, a, { x: -6, y: 74, z: -6 }, 0.8))
  for (const [x, col] of [
    [-19, WOOD],
    [-6, b],
    [7, DARK],
  ] as [number, string][])
    g.add(P(bat(col, x === -6 ? DARK : c), x, 3, -4))
  g.add(cup(7.5, 6.5, 15, 0.5, c, { x: 18, y: 3, z: 3 }))
  g.add(seamBall(3.65, WHITE, STITCH, 15.2, 3))
  g.add(seamBall(3.65, WHITE, STITCH, 20.6, 2.2))
  g.add(P(G(ball(3.65, WHITE), seam(3.65, STITCH, 0.2)), 18, 3 + 0.5 + 3.65 + 5.8, 4, 1, 0.5))
  return g
}

// ====================================================================
// 登山 / 攀岩 / 露营
// ====================================================================

function bigPack(open: boolean) {
  return (p: string[]) => {
    const [a, b, c] = p
    const bodyH = open ? 56 : 62
    const g = G(rbox(32, bodyH, 24, a, {}, 6))
    g.add(rbox(32.6, 6, 24.6, c, {}, 3))
    g.add(rbox(24, 30, 3, b, { y: 9, z: 11.8 }, 1.4))
    for (const s of [-1, 1]) g.add(rbox(3, 16, 15, b, { x: s * 16.6, y: 4 }, 1.3))
    g.add(rbox(26, 50, 3, c, { y: 8, z: -12.8 }, 1.4))
    for (const s of [-1, 1]) {
      g.add(
        tubeLine(
          [
            [s * 6, 57, -13.5],
            [s * 7.5, 50, -16.6],
            [s * 9, 34, -16.8],
            [s * 11, 18, -15],
          ],
          1.4,
          c,
        ),
      )
      g.add(P(rbox(12, 7, 3, c, {}, 1.4), s * 14.5, 13.5, -12.5, 0, s * 0.5))
    }
    for (const y of [26, 42]) g.add(rbox(33, 1.6, 1, c, { y, z: 12.3 }, 0.4))
    g.add(tubeLine([[-4, bodyH - 1, -11.8], [0, bodyH + 2.5, -12.6], [4, bodyH - 1, -11.8]], 0.7, c))
    if (!open) {
      g.add(rbox(31, 9, 25, b, { y: 58, z: 0.5 }, 4))
      for (const s of [-1, 1]) g.add(rbox(2, 16, 1, c, { x: s * 8, y: 44, z: 12.9 }, 0.4))
    } else {
      g.add(tray(30, 12, 22, 0.8, c, { y: bodyH - 2 }, 0.35))
      g.add(ball(8, shade(b, 0.12), { y: bodyH + 1.5 }))
      g.add(ball(5, STITCH, { x: 6, y: bodyH + 2, z: 3 }))
      const lid = G(rbox(31, 4, 24, b, { y: -2, z: 12 }, 2))
      lid.position.set(0, bodyH + 10, -11)
      lid.rotation.x = -PI * 0.85
      g.add(lid)
    }
    return g
  }
}

function summitPack(p: string[]) {
  const [a, b, c] = p
  const g = G(rbox(24, 40, 13, a, {}, 5))
  g.add(rbox(18, 24, 1, b, { y: 5, z: 6.8 }, 0.45))
  g.add(torus(10, 0.35, c, { y: 26, z: 6.6 }, PI))
  g.add(rbox(2, 22, 0.6, c, { y: 7, z: 7.5 }, 0.25))
  for (const s of [-1, 1])
    g.add(
      tubeLine(
        [
          [s * 5, 37, -6.2],
          [s * 6, 30, -8.6],
          [s * 7, 16, -8.6],
          [s * 9, 5, -7],
        ],
        1.1,
        c,
      ),
    )
  g.add(tubeLine([[-3, 39, -3], [0, 42, -3], [3, 39, -3]], 0.5, c))
  return g
}

function trekPolesLean(p: string[]) {
  const [a, b, c] = p
  return G(pole([-4, 0.3, 8], [-5.5, 118, -8], a, b, c), pole([4, 0.3, 8], [5.5, 118, -8], a, b, c))
}
function trekPolesShort(p: string[]) {
  const [a, b, c] = p
  return G(pole([-33, 1.9, -2.5], [33, 1.9, -2.5], a, b, c, { r: 1.1, lying: true }), pole([-31, 1.9, 2.5], [35, 1.9, 2.5], a, b, c, { r: 1.1, lying: true }))
}

function ropeCoil(p: string[]) {
  const [a, b] = p
  const g = G()
  const r2 = rngLite(3)
  for (let i = 0; i < 10; i++) g.add(torus(16.6 + (i % 3) * 0.45, 0.55, i % 2 ? a : shade(a, -0.1), { y: 0.6 + i * 0.95, rx: PI / 2 + (r2() - 0.5) * 0.03, rz: (r2() - 0.5) * 0.03 }))
  g.add(rbox(3.6, 11, 7, b, { x: 17, y: -0.2 }, 1.2))
  g.add(tubeLine([[17.2, 10.2, -2.5], [20, 8, 2], [23, 2, 6], [26, 0.55, 10], [30, 0.55, 9]], 0.55, b))
  return g
}

/** 小型线性同余随机数 */
function rngLite(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function harness(p: string[]) {
  const [a, b, c] = p
  const g = G(ringFlat(13, 1.1, a, 0, 1.1, -2))
  for (const s of [-1, 1]) {
    g.add(ringFlat(8, 0.9, a, s * 7.8, 0.9, 17))
    g.add(rbox(2, 0.8, 7, c, { x: s * 3.6, y: 0.5, z: 11 }, 0.3))
    g.add(P(torus(2.6, 0.32, c, {}, PI), s * 13.6, 0.9, -5, PI / 2, 0, s > 0 ? -PI / 2 : PI / 2))
  }
  g.add(ringFlat(3.2, 0.65, b, 0, 1.3, 11.5))
  g.add(rbox(5, 1.6, 2.6, STEEL, { y: 0.4, z: -15 }, 0.4))
  g.add(P(biner(b, 2.6, 0.42, true), 13.8, 0.45, -1, -PI / 2))
  return g
}

function quickdrawsLying(p: string[]) {
  const [a, b, c] = p
  const g = G(P(biner(c, 4.2, 0.5, true), 0, 0.55, -14, -PI / 2))
  for (let i = 0; i < 5; i++) g.add(P(quickdraw(i % 2 ? a : b, STEEL, c), -8 + i * 4, 0.5, -10, -PI / 2, 0, (i - 2) * 0.12))
  return g
}
function quickdrawsHanging(p: string[]) {
  const [a, b, c] = p
  const g = G(sHook())
  const by = HOOK_Y - (4.2 - 0.5)
  g.add(P(biner(c, 4.2, 0.5, true), 0, by, HOOK_Z))
  for (let i = 0; i < 5; i++) g.add(P(quickdraw(i % 2 ? a : b, STEEL, c), (i - 2) * 0.8, by - 4.2 - 2.4, HOOK_Z + (i - 2) * 0.7, 0, 0.15 * (i - 2), (i - 2) * 0.07))
  return g
}

function climbShoe(a: string, b: string, c: string) {
  const g = G(rbox(8.4, 1.2, 23, RUBBER, { z: 0.3 }, 0.5))
  g.add(ball(5.8, a, { y: 3.8, z: 0.5 }, [0.72, 0.55, 2.0]))
  g.add(ball(5.8, RUBBER, { y: 2.7, z: 6.6 }, [0.76, 0.42, 0.95]))
  g.add(ball(4.2, RUBBER, { y: 3.6, z: -8.2 }, [1, 0.88, 0.72]))
  g.add(P(puck(2.8, 1.2, DARK), 0, 7.0, -4.5))
  for (const z of [-1, 3]) {
    const k = Math.sqrt(1 - ((z - 0.5) / 11.6) ** 2)
    const st = torus(1, 0.13, b, { y: 3.8, z }, PI)
    st.scale.set(4.18 * k + 0.35, 3.19 * k + 0.35, 1)
    g.add(st)
  }
  g.add(torus(1.2, 0.3, c, { y: 7, z: -10.6, ry: PI / 2 }))
  return g
}
function climbShoes(p: string[]) {
  const [a, b, c] = p
  return G(P(climbShoe(a, b, c), -5.4, 0, 0, 0, 0.12), P(climbShoe(a, b, c), 5.4, 0, 1.5, 0, -0.12))
}

function chalkBag(p: string[]) {
  const [a, b, c] = p
  const g = G(cup(6.4, 6.8, 15, 0.5, a))
  g.add(torus(6.4, 1.1, b, { y: 15, rx: PI / 2 }))
  g.add(ball(4.4, WHITE, { y: 5.2 }))
  g.add(rbox(1.4, 2.4, 1.2, c, { x: 3.5, y: 15.4, z: 6.6 }, 0.4))
  g.add(tubeLine([[2.6, 16, 6.2], [3.5, 15, 7.4], [4, 12, 7.6]], 0.2, c))
  g.add(cyl(1.1, 1.1, 10, c, { x: -7.6, y: 3 }, 12))
  g.add(cyl(0.6, 0.6, 5, WOOD, { x: -7.6, y: 12.5 }, 10))
  g.add(cyl(0.9, 0.6, 1.6, WHITE, { x: -7.6, y: 17.5 }, 10))
  g.add(rbox(10, 2.6, 1, c, { y: 6, z: -7.2 }, 0.4))
  return g
}

function climbHelmet(p: string[]) {
  const [a, b, c] = p
  const g = G(dome(11, a, [0.95, 0.85, 1.12]))
  const rim = torus(11, 0.6, b, { y: 0.6, rx: PI / 2 })
  rim.scale.set(0.97, 1.13, 1)
  g.add(rim)
  for (const [x, z] of [
    [-3, -1],
    [3, -1],
    [0, 3.5],
    [0, -5],
  ])
    g.add(rbox(1.4, 0.9, 4, DARK, { x, y: 9.35 * Math.sqrt(Math.max(0, 1 - (x / 10.45) ** 2 - (z / 12.3) ** 2)) - 0.4, z }, 0.3))
  for (const z of [-12.4, 12.4]) g.add(rbox(2.4, 1.6, 1.2, c, { y: 1.6, z }, 0.4))
  g.add(
    tubeLine(
      [
        [9.8, 1.4, 1],
        [10.5, 0.45, 4],
        [6, 0.35, 9.5],
        [0, 0.35, 10.5],
        [-6, 0.35, 9.5],
        [-10.5, 0.45, 4],
        [-9.8, 1.4, 1],
      ],
      0.35,
      c,
    ),
  )
  return g
}

function headlamp(p: string[]) {
  const [a, b, c] = p
  const band = torus(8.5, 0.5, a, { y: 1.3, rx: PI / 2 })
  band.scale.set(1, 1, 2.6)
  const g = G(band)
  g.add(rbox(6.2, 3.6, 3, b, { y: 0, z: 10.4 }, 0.9))
  g.add(lit(cylZ(1.3, 0.6, LAMP, -0.8, 1.8, 12.1, 20), LAMP, 0.8))
  g.add(lit(cylZ(0.5, 0.6, STITCH, 1.8, 1.8, 12.1, 20), STITCH, 0.5))
  g.add(rbox(1.6, 0.6, 1.2, c, { y: 3.5, z: 10.4 }, 0.25))
  g.add(rbox(5, 3, 2.2, b, { y: 0, z: -9.8 }, 0.6))
  return g
}

function iceAxe(p: string[]) {
  const [a, b, c] = p
  const g = G(taperRod3([-30, 1.5, 0], [8, 1.5, 0], 1.3, 1.3, a, 14), taperRod3([8, 1.5, 0], [26, 1.5, -0.8], 1.3, 1.3, a, 14))
  g.add(taperRod3([-29, 1.5, 0], [-15, 1.5, 0], 1.55, 1.55, b, 14))
  g.add(taperRod3([-30, 1.5, 0], [-35, 1.5, 0], 1.2, 0.15, STEEL))
  g.add(rbox(4.2, 2.6, 6, STEEL, { x: 26.6, y: 0.2, z: -0.8 }, 0.5))
  g.add(
    tubeLine(
      [
        [26.6, 1.5, 1.6],
        [27.4, 1.5, 7],
        [26.2, 1.5, 13],
        [23, 1.5, 18],
      ],
      0.7,
      STEEL,
    ),
  )
  g.add(rbox(6, 0.8, 7, STEEL, { x: 26.6, y: 1.1, z: -7.3 }, 0.3))
  g.add(ringFlat(4, 0.4, c, -10, 0.4, 4))
  return g
}

function crampon(a: string, b: string) {
  const g = G(rbox(9, 0.5, 13, STEEL, { y: 2.6, z: 5 }, 0.2), rbox(8, 0.5, 8, STEEL, { y: 2.6, z: -9 }, 0.2), rbox(1.4, 0.4, 9, STEEL, { y: 2.65, z: -1.5 }, 0.15))
  for (const [x, z] of [
    [-3.6, 9],
    [3.6, 9],
    [-3.8, 4],
    [3.8, 4],
    [-3.6, 0],
    [3.6, 0],
    [-3.2, -7],
    [3.2, -7],
    [-3.2, -11.5],
    [3.2, -11.5],
  ])
    g.add(cyl(0.38, 0.03, 2.65, STEEL, { x, z }, 8))
  for (const x of [-1.6, 1.6]) g.add(P(cyl(0.03, 0.38, 3, STEEL, {}, 8), x, 2.4, 12.6, PI / 2))
  g.add(torus(3.8, 0.35, a, { y: 3, z: 7 }, PI))
  g.add(torus(3.4, 0.35, a, { y: 3, z: -11, rx: -0.3 }, PI))
  g.add(ringFlat(5.5, 0.45, b, 0, 3.4, -3))
  return g
}
function crampons(p: string[]) {
  const [a, b] = p
  return G(P(crampon(a, b), -6.5, 0, 0, 0, 0.1), P(crampon(a, b), 6.5, 0, 1, 0, -0.1))
}

function sleepingBagRolled(p: string[]) {
  const [a, b, c] = p
  const g = G(P(puck(13, 38, a), 0, 13, 0, 0, 0, PI / 2))
  for (const x of [-10, 10]) g.add(torus(13.25, 0.5, b, { x, y: 13, ry: PI / 2 }))
  g.add(tubeLine([[-10, 26.1, 0], [0, 26.3, 0], [10, 26.1, 0]], 0.5, b))
  g.add(rbox(1.2, 2.6, 1.6, c, { x: 19.6, y: 11.6 }, 0.4))
  g.add(tubeLine([[19.2, 13, -0.5], [20.2, 13, 0], [20.2, 12, 0.6]], 0.2, c))
  return g
}

const MUMMY: Poly = (() => {
  const right: [number, number][] = [
    [0, -104],
    [20, -100],
    [33, -88],
    [39, -62],
    [37, -20],
    [32, 25],
    [26, 70],
    [20, 92],
    [10, 102],
    [0, 104],
  ]
  return [...right, ...right.slice(1, -1).reverse().map(([x, z]): [number, number] => [-x, z])]
})()
function mummyWidth(z: number) {
  const r = MUMMY.slice(0, 10)
  for (let i = 1; i < r.length; i++) {
    if (z <= r[i][1]) {
      const [x0, z0] = r[i - 1]
      const [x1, z1] = r[i]
      return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0)
    }
  }
  return 0
}
function sleepingBagOpen(p: string[]) {
  const [a, b, c] = p
  const g = G(slab(MUMMY, 8, a, 0))
  for (let z = -50; z <= 90; z += 16) g.add(rbox(mummyWidth(z) * 2 - 6, 0.7, 1, shade(a, -0.12), { y: 7.8, z }, 0.3))
  const hole = puck(12, 1.4, DARK, { y: 7.4, z: -80 })
  hole.scale.set(1, 1, 0.75)
  g.add(hole)
  const hood = torus(12.6, 1.3, b, { y: 8.6, z: -80, rx: PI / 2 })
  hood.scale.set(1, 0.78, 1)
  g.add(hood)
  g.add(rbox(0.9, 0.8, 110, c, { x: 30, y: 7.5, z: 0 }, 0.3))
  g.add(rbox(1.6, 1.2, 2.6, c, { x: 30, y: 7.8, z: 52 }, 0.4))
  return g
}

function sleepPad(p: string[]) {
  const [a, b] = p
  const g = G(cylX(9, 56, a, 0, 9, 0, 28))
  for (const s of [-1, 1]) {
    for (const r of [2.6, 5, 7.4]) g.add(noOutline(torus(r, 0.22, shade(a, -0.18), { x: s * 28.1, y: 9, ry: PI / 2 })))
    g.add(torus(9.3, 0.5, b, { x: s * 18, y: 9, ry: PI / 2 }))
  }
  g.add(rbox(56.4, 0.8, 4, shade(a, -0.08), { y: 0, z: 6.6 }, 0.3))
  return g
}

function tentBag(p: string[]) {
  const [a, b, c] = p
  const g = G(P(puck(9, 44, a), 0, 9, 0, 0, 0, PI / 2))
  for (const x of [-12, 12]) g.add(torus(9.25, 0.45, b, { x, y: 9, ry: PI / 2 }))
  g.add(P(puck(3, 42, c), 0, 3, 12.4, 0, 0, PI / 2))
  g.add(P(puck(3.2, 14, b), -10, 3.2, 19.2, 0, 0.1, PI / 2))
  return g
}

function tentPitched(p: string[]) {
  const [a, b, c] = p
  const SX = 105
  const SY = 98
  const SZ = 70
  const g = G(slab(ellipsePoly(SX * 1.03, SZ * 1.05, 0, 0, 40), 1.5, c, 0))
  const body = dome(1, a, [SX, SY, SZ])
  body.position.y = 1
  g.add(body)
  const door = noOutline(dbl(sphPatch(1, b, PI / 2 - 0.45, 0.9, 0.55, PI / 2 - 0.58)))
  door.scale.set(SX * 1.008, SY * 1.008, SZ * 1.012)
  door.position.y = 1
  g.add(door)
  const vent = noOutline(dbl(sphPatch(1, b, 0, PI * 2, 0, 0.22)))
  vent.scale.set(SX * 1.008, SY * 1.008, SZ * 1.012)
  vent.position.y = 1
  g.add(vent)
  for (const az of [-0.62, 0.62]) {
    const pts: V3[] = []
    for (let i = 0; i <= 24; i++) {
      const e = (i / 24) * PI
      pts.push([SX * 1.014 * Math.cos(az) * Math.cos(e), 1 + SY * 1.014 * Math.sin(e), SZ * 1.014 * Math.sin(az) * Math.cos(e)])
    }
    g.add(tubeLine(pts, 0.8, c, false, 80))
  }
  for (const [az, e] of [
    [0.3, 0.75],
    [PI - 0.3, 0.75],
    [PI + 0.3, 0.75],
    [-0.3, 0.75],
  ]) {
    const s: V3 = [SX * Math.cos(az) * Math.cos(e), 1 + SY * Math.sin(e), SZ * Math.sin(az) * Math.cos(e)]
    const t: V3 = [SX * 1.28 * Math.cos(az), 0.4, SZ * 1.35 * Math.sin(az)]
    g.add(taperRod3(s, t, 0.18, 0.18, N.linen, 6))
    g.add(cyl(0.5, 0.2, 3, STEEL, { x: t[0], y: 0, z: t[2] }, 8))
  }
  return g
}

function campStove(p: string[]) {
  const [a, b, c] = p
  const g = G(cyl(5.5, 5.5, 8, a, {}, 24), ball(5.5, a, { y: 8 }, [1, 0.35, 1]), cyl(5.8, 5.8, 4, b, { y: 2 }, 24))
  g.add(cyl(1.4, 1.4, 3, STEEL, { y: 9.4 }, 12))
  g.add(cyl(2.8, 1.8, 1.6, STEEL, { y: 12.4 }, 16))
  g.add(tubeLine([[1.4, 11, 0], [3.5, 11.4, 1], [4.6, 10.6, 2.4]], 0.3, c))
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * PI * 2
    g.add(rod3([Math.cos(t) * 1.6, 12.6, Math.sin(t) * 1.6], [Math.cos(t) * 5, 14.6, Math.sin(t) * 5], 0.25, STEEL))
  }
  g.add(cup(6.5, 6.5, 9, 0.3, STEEL, { y: 14.7 }))
  g.add(puck(6.8, 1, c, { y: 23.4 }))
  g.add(puck(1.2, 1, DARK, { y: 24.2 }))
  g.add(torus(4, 0.3, c, { x: 6.8, y: 20, ry: PI / 2 }, PI))
  g.add(cup(7, 6.5, 8, 0.3, c, { x: 15 }))
  g.add(cup(5, 5, 7, 0.3, b, { x: 15, y: 0.35 }))
  g.add(P(torus(3.5, 0.3, STEEL, {}, PI), 22.2, 5, 0, 0, PI / 2, -PI / 2))
  return g
}

function lantern(p: string[]) {
  const [a, b, c] = p
  const g = G(cyl(6, 6.5, 3, a, {}, 24))
  g.add(ghost(cyl(5, 5, 12, GLASS, { y: 3 }, 24), GLASS, 0.3))
  g.add(lit(cyl(2.2, 2.2, 9, LAMP, { y: 4.5 }, 16), LAMP, 0.9))
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * PI * 2 + PI / 4
    g.add(cyl(0.35, 0.35, 12, b, { x: Math.cos(t) * 5.35, y: 3, z: Math.sin(t) * 5.35 }, 6))
  }
  g.add(cyl(5.6, 6, 2.5, a, { y: 15 }, 24))
  g.add(puck(3, 1.2, b, { y: 17.2 }))
  g.add(torus(5, 0.35, c, { y: 17.8 }, PI))
  return g
}

function thermos(p: string[]) {
  const [a, b, c] = p
  const g = G(cyl(4.3, 4.3, 24, a, {}, 28), cyl(4.6, 4.6, 2.5, c, {}, 28), cyl(3.6, 4.3, 1.5, a, { y: 24 }, 28), cyl(4.65, 4.45, 7, b, { y: 24.4 }, 28))
  g.add(rbox(1.4, 12, 1.2, c, { y: 7, z: 4.6 }, 0.5))
  g.add(torus(1.6, 0.35, c, { y: 21, z: 5.2 }))
  return g
}

function compassMap(p: string[]) {
  const [paper, a, b] = p
  const g = G(rbox(22, 0.6, 30, paper, {}, 0.2))
  const greens = ['#9cc08a', '#c9a36a', '#b0855a']
  for (const [x, z, rs] of [
    [-4, -6, [3, 5.5, 8]],
    [5, 8, [2.5, 4.5]],
  ] as [number, number, number[]][])
    rs.forEach((r, i) => {
      const m = noOutline(torus(r, 0.13, greens[i], { x, y: 0.75, z, rx: PI / 2 }))
      m.scale.set(1, 0.7, 1)
      g.add(m)
    })
  g.add(noOutline(tubeLine([[-11, 0.73, 4], [-5, 0.73, 6], [0, 0.73, 2], [6, 0.73, -3], [11, 0.73, -2]], 0.18, '#7fb3d8')))
  for (let i = 0; i < 6; i++) g.add(noOutline(rbox(0.9, 0.2, 0.4, STITCH, { x: -8 + i * 2.6, y: 0.62, z: -12 + i * 1.6 }, 0.08)))
  g.add(ghost(rbox(6, 0.4, 11, GLASS, { x: 6, y: 0.6, z: 5 }, 0.3), GLASS, 0.5))
  g.add(puck(2.9, 1, a, { x: 6, y: 1, z: 6 }))
  g.add(puck(2.3, 0.4, WHITE, { x: 6, y: 1.8, z: 6 }))
  g.add(rbox(0.5, 0.25, 1.8, STITCH, { x: 6, y: 2.15, z: 5.1 }, 0.1))
  g.add(rbox(0.5, 0.25, 1.8, DARK, { x: 6, y: 2.15, z: 6.9 }, 0.1))
  g.add(tubeLine([[6, 0.8, 10.6], [8, 0.5, 13], [11, 0.4, 13.5], [12.5, 0.35, 11]], 0.2, b))
  return g
}

// ====================================================================
// 瑜伽 / 普拉提辅具
// ====================================================================

function yogaBlocks(p: string[]) {
  const [a, b] = p
  return G(rbox(23, 7.6, 15, a, {}, 1.8), rbox(23, 7.6, 15, b, { y: 7.6, ry: PI / 2 + 0.15 }, 1.8))
}

function yogaStrap(p: string[]) {
  const [a, b] = p
  const g = G(puck(4.6, 3.8, a))
  for (const r of [1.4, 2.5, 3.6]) g.add(noOutline(torus(r, 0.15, shade(a, -0.18), { y: 3.95, rx: PI / 2 })))
  g.add(rbox(3.8, 0.3, 22, a, { z: 15 }, 0.12))
  for (const z of [26.6, 28]) g.add(ringFlat(2.1, 0.3, b, 0, 0.3 + (z - 26.6) * 0.3, z))
  return g
}

function bolster(p: string[]) {
  const [a, b, c] = p
  const g = G(cylX(11.5, 62, a, 0, 11.5, 0, 28))
  for (const s of [-1, 1]) g.add(P(puck(11.6, 2.4, b), s * 31, 11.6, 0, 0, 0, PI / 2))
  for (const x of [-12, 12]) g.add(cylX(11.8, 3, c, x, 11.5, 0, 28))
  g.add(P(torus(3, 0.6, c, {}, PI), 32.3, 11.6, 0, 0, 0, -PI / 2))
  return g
}

function meditationSet(p: string[]) {
  const [a, b, c] = p
  const g = G(rbox(68, 6, 68, b, {}, 2.5))
  g.add(puck(17, 14, a, { y: 6 }))
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * PI * 2
    g.add(noOutline(rbox(0.9, 8, 0.9, shade(a, -0.12), { x: Math.cos(t) * 17.05, y: 9, z: Math.sin(t) * 17.05, ry: -t }, 0.3)))
  }
  g.add(puck(2, 1, c, { y: 19.7 }))
  return g
}

function pilatesRing(p: string[]) {
  const [a, b] = p
  const g = G(ringFlat(18.5, 1.1, a, 0, 1.1, 0))
  for (const s of [-1, 1]) {
    g.add(P(capsule(2.2, 6, b), s * 18.5, 2.2, 0, PI / 2))
    g.add(P(capsule(1.8, 4, b), s * 15.2, 1.8, 0, PI / 2))
  }
  return g
}

function massageBalls(p: string[]) {
  const [a, b, c] = p
  const g = G(ball(3.2, a, { x: -9, y: 3.2, z: 1 }))
  const cy = 4.8
  g.add(ball(3.8, b, { x: 0, y: cy }))
  for (const d of fib(26)) g.add(onSphere(cyl(0.05, 0.55, 1.1, b, {}, 6), d, 3.8 + 0.4, [0, cy, 0]))
  g.add(ball(3.6, c, { x: 9.5, y: 3.6, z: -3.3 }), ball(3.6, c, { x: 9.5, y: 3.6, z: 3.3 }), cylZ(2.9, 5, c, 9.5, 3.6, 0, 20))
  return g
}

function matRack(p: string[]) {
  const [a, b, c] = p
  const g = G(rbox(72, 4, 26, a, {}, 1))
  for (const s of [-1, 1]) g.add(rbox(4, 62, 22, a, { x: s * 34, y: 4 }, 0.8))
  const xs = [-24, -12, 0, 12, 24]
  g.add(holePanel(64.2, 20, 2.4, a, xs.map((x) => ({ kind: 'circle' as const, x, y: 10, r: 5.4 })), { rx: -PI / 2, y: 56.2, z: 10 }))
  const cols = [b, c, shade(b, 0.12), shade(c, -0.1)]
  ;[-24, -12, 12, 24].forEach((x, i) => {
    const col = cols[i]
    g.add(cyl(4.6, 4.6, 61, col, { x, y: 4 }, 20))
    g.add(noOutline(torus(2.4, 0.2, shade(col, -0.2), { x, y: 65.2, rx: PI / 2 })))
    g.add(torus(4.85, 0.3, shade(col, -0.25), { x, y: 22, rx: PI / 2 }))
  })
  return g
}

// ====================================================================
// 其他运动装备
// ====================================================================

function skiHelmet(p: string[]) {
  const [a, b, c] = p
  const sc: V3 = [0.92, 0.95, 1.12]
  const r = 12
  const g = G(dome(r, a, sc, PI * 0.56))
  for (const s of [-1, 1]) g.add(P(puck(4.2, 2, shade(a, -0.15)), s * 11.4, 0.2, 0.5, 0, 0, PI / 2))
  const strap = torus(1, 0.08, b, { y: 3, rx: PI / 2 })
  strap.scale.set(10.95, 13.25, 25)
  g.add(strap)
  const frame = sphPatch(r + 0.65, DARK, PI / 2 - 0.78, 1.56, 1.04, 0.5)
  frame.scale.set(...sc)
  g.add(noOutline(frame))
  const lens = sphPatch(r + 1.0, c, PI / 2 - 0.68, 1.36, 1.1, 0.38)
  lens.scale.set(...sc)
  lens.material = toon(c, { emissive: 0.15 })
  g.add(noOutline(lens))
  for (const x of [-3, 0, 3]) g.add(rbox(1, 0.7, 4, DARK, { x, y: r * sc[1] * Math.sqrt(1 - (x / (r * sc[0])) ** 2) - 0.45, z: -2 }, 0.3))
  g.position.y = -r * sc[1] * Math.cos(PI * 0.56)
  return G(g)
}

function skiPoles(p: string[]) {
  const [a, b, c] = p
  return G(pole([-4, 0.3, 9], [-5, 120, -9], a, b, c, { sections: false, basket: 4.2, r: 0.85 }), pole([4, 0.3, 9], [5, 120, -9], a, b, c, { sections: false, basket: 4.2, r: 0.85 }))
}

function binding(a: string, b: string, c: string) {
  const g = G(rbox(13, 1.6, 24, a, {}, 0.6))
  for (const s of [-1, 1]) g.add(rbox(1.2, 6, 14, a, { x: s * 6.2, y: 1.6, z: -4 }, 0.4))
  g.add(P(torus(6.4, 0.7, a, {}, PI), 0, 4, -10.2, -PI / 2))
  g.add(P(rbox(13, 20, 1.5, b, {}, 0.6), 0, 12.5, -13.5, -0.3))
  const ankle = torus(5.8, 0.55, c, { y: 4.6, z: -2 }, PI)
  ankle.scale.set(1, 1, 3.5)
  g.add(ankle)
  const toe = torus(5.2, 0.5, c, { y: 2.8, z: 8 }, PI)
  toe.scale.set(1, 1, 2.6)
  g.add(toe)
  for (const z of [-2, 8]) g.add(rbox(1.6, 1.4, 2.6, STEEL, { x: z < 0 ? 6.2 : 5.6, y: z < 0 ? 4.6 : 2.8, z }, 0.3))
  return g
}
function bindings(p: string[]) {
  const [a, b, c] = p
  return G(P(binding(a, b, c), -9, 0, 0, 0, 0.25), P(binding(a, b, c), 9, 0, 0, 0, -0.25))
}

function skate(a: string, b: string, c: string) {
  const g = G()
  for (const s of [-1, 1]) g.add(rbox(0.6, 4.5, 32, STEEL, { x: s * 1.7, y: 3.2 }, 0.2))
  for (const z of [-12, -4, 4, 12]) {
    g.add(cylX(3.9, 2.2, b, 0, 3.9, z, 20))
    g.add(cylX(1.6, 2.7, STEEL, 0, 3.9, z, 12))
  }
  g.add(rbox(9, 1.5, 28, DARK, { y: 7.6, z: 0.5 }, 0.5))
  g.add(rbox(9.4, 9, 27, a, { y: 8.6, z: 0.5 }, 3.5))
  g.add(rbox(10.4, 12, 13, a, { y: 15, z: -6.5 }, 3.5))
  const op = puck(3.8, 1.2, DARK, { y: 26.4, z: -6.5 })
  op.scale.set(1, 1, 1.3)
  g.add(op)
  g.add(rbox(10.8, 2, 2.4, c, { y: 22, z: -6.5 }, 0.6))
  g.add(rbox(9.8, 1.2, 3, c, { y: 17.1, z: 4 }, 0.4))
  g.add(rbox(3, 5, 4, DARK, { y: 1.5, z: -17.6 }, 0.6))
  return g
}
function inlineSkates(p: string[]) {
  const [a, b, c] = p
  return G(P(skate(a, b, c), -6.5, 0, 0, 0, 0.06), P(skate(a, b, c), 6.5, 0, 1.5, 0, -0.06))
}

function roadHelmet(p: string[]) {
  const [a, b, c] = p
  const sc: V3 = [0.85, 0.7, 1.18]
  const r = 12
  const g = G(dome(r, a, sc, PI * 0.53))
  const ex = r * sc[0]
  const ey = r * sc[1]
  const ez = r * sc[2]
  const surf = (x: number, z: number, off = 0.15): V3 => [x, ey * Math.sqrt(Math.max(0, 1 - (x / ex) ** 2 - (z / ez) ** 2)) + off, z]
  for (const x of [-5.5, -2.6, 2.6, 5.5]) {
    for (const [z0, z1] of [
      [-10, -2.5],
      [1.5, 9],
    ]) {
      const pts: V3[] = []
      for (let i = 0; i <= 6; i++) pts.push(surf(x, z0 + ((z1 - z0) * i) / 6))
      g.add(noOutline(tubeLine(pts, 0.6, DARK)))
    }
  }
  const mid: V3[] = []
  for (let i = 0; i <= 10; i++) mid.push(surf(0, -12 + i * 2.4, 0.2))
  g.add(tubeLine(mid, 0.65, b))
  g.add(
    tubeLine(
      [
        [9.6, 0.4, 1],
        [10.6, -0.3, 4],
        [6, -0.4, 10],
        [0, -0.4, 11],
        [-6, -0.4, 10],
        [-10.6, -0.3, 4],
        [-9.6, 0.4, 1],
      ],
      0.35,
      c,
    ),
  )
  return g
}

function bikeBottles(p: string[]) {
  const [a, b, c] = p
  const bottle = (col: string, x: number, z: number) =>
    G(cyl(3.7, 3.7, 7, col, { x, z }, 24), cyl(3.4, 3.4, 6, b, { x, y: 7, z }, 24), cyl(3.7, 3.7, 7, col, { x, y: 13, z }, 24), cyl(2.6, 3.7, 1.5, col, { x, y: 20, z }, 24), cyl(2.6, 2.6, 2, c, { x, y: 21.5, z }, 20), cyl(0.9, 1.2, 1.6, c, { x, y: 23.5, z }, 12))
  return G(bottle(a, -4.2, 0), bottle(WHITE, 4.2, 1))
}

function duffel(p: string[]) {
  const [a, b, c] = p
  const g = G(rbox(54, 28, 28, a, {}, 9))
  for (const s of [-1, 1]) g.add(P(rbox(1.2, 22, 22, b, {}, 6), s * 27.1, 14, 0))
  g.add(tubeLine([[-22, 28.25, 0], [0, 28.4, 0], [22, 28.25, 0]], 0.35, c))
  g.add(rbox(1.2, 0.8, 3, c, { x: 10, y: 28.2, z: 1.6 }, 0.3))
  for (const z of [-5, 5]) g.add(tubeLine([[-8, 27.6, z], [-6, 35, z * 0.9], [6, 35, z * 0.9], [8, 27.6, z]], 0.9, c))
  g.add(rbox(20, 14, 2, b, { y: 6, z: 14.2 }, 1.5))
  g.add(tubeLine([[-26.5, 22, 9], [-24, 6, 17], [-14, 0.6, 21], [0, 0.6, 22], [14, 0.6, 21], [24, 6, 17], [26.5, 22, 9]], 0.8, c))
  return g
}

function pad(w: number, d: number, a: string, b: string, c: string) {
  const g = G(rbox(w, 4.5, d, a, {}, 2))
  g.add(ball(1, b, { y: 3.8 }, [w * 0.4, 2, d * 0.36]))
  for (const z of [-d / 2 + 3, d / 2 - 3]) g.add(rbox(w + 0.6, 4.9, 2.2, c, { y: -0.2, z }, 0.6))
  return g
}
function padsSet(p: string[]) {
  const [a, b, c] = p
  return G(P(pad(12, 20, a, b, c), -8, 0, -6, 0, 0.15), P(pad(12, 20, a, b, c), 8, 0, -6, 0, -0.15), P(pad(9.5, 15, a, b, c), -7, 0, 13, 0, 0.4), P(pad(9.5, 15, a, b, c), 7, 0, 14, 0, -0.3))
}

function runBelt(p: string[]) {
  const [a, b, c] = p
  const band = torus(12.5, 0.5, a, { y: 2, rx: PI / 2 })
  band.scale.set(1, 1, 4)
  const g = G(band)
  g.add(P(capsule(3.3, 13, b), 0, 3.3, 15.6, 0, 0, PI / 2))
  g.add(tubeLine([[-8, 6.7, 15.6], [0, 6.75, 15.6], [8, 6.7, 15.6]], 0.3, c))
  g.add(rbox(10, 0.8, 0.5, c, { y: 2.6, z: 18.9 }, 0.2))
  g.add(rbox(4, 2.6, 1.6, DARK, { y: 0.7, z: -13 }, 0.4))
  return g
}

function swimSet(p: string[]) {
  const [a, b, c] = p
  const capG = G(dome(10, a, [0.9, 0.85, 1.05]))
  const logo = noOutline(sphPatch(10.35, b, PI / 2 - 0.35, 0.7, 0.75, 0.45))
  logo.scale.set(0.9, 0.85, 1.05)
  capG.add(logo)
  const goggles = G()
  for (const s of [-1, 1]) {
    goggles.add(ghost(puck(2.3, 1.4, c, { x: s * 3.1, y: 0.2 }), c, 0.6))
    goggles.add(ringFlat(2.4, 0.38, b, s * 3.1, 1.0, 0))
  }
  goggles.add(rod3([-0.8, 1, 0], [0.8, 1, 0], 0.28, b))
  const strap = ringFlat(7.5, 0.35, b, 0, 0.35, -5)
  strap.scale.set(1, 0.55, 1)
  goggles.add(strap)
  return G(P(capG, -9, 0, 0), P(goggles, 9, 0, 3, 0, -0.2))
}

function fin(a: string, b: string) {
  const blade: Poly = [
    [-6, -10],
    [6, -10],
    [11, 38],
    [0, 35],
    [-11, 38],
  ]
  const g = G(slab(blade, 1, b, 0))
  g.add(rbox(10, 5.5, 17, a, { z: -18 }, 2.5))
  for (const s of [-1, 1]) g.add(rod3([s * 5.6, 1, -10], [s * 10.4, 1, 37], 0.7, a))
  return g
}
function snorkelFins(p: string[]) {
  const [a, b, c] = p
  const g = G(P(fin(a, b), -12, 0, 0, 0, 0.08), P(fin(a, b), 12, 0, 1, 0, -0.08))
  const mask = G(rbox(15, 4, 9, a, {}, 2.5), tray(15.4, 1.6, 9.4, 0.8, c, { y: 3.8 }, 0.4))
  mask.add(ghost(rbox(13.8, 0.4, 7.8, GLASS, { y: 4.4 }, 0.15), GLASS, 0.5))
  const st = ringFlat(9, 0.5, a, 0, 0.5, -6)
  st.scale.set(1, 0.6, 1)
  mask.add(st)
  g.add(P(mask, 34, 0, -14))
  g.add(tubeLine([[30, 1.2, -2], [30, 1.2, 26], [31, 1.2, 31], [34, 1.2, 33]], 1.1, c))
  g.add(rbox(3, 2, 3, RUBBER, { x: 35.5, y: 0.2, z: 33 }, 0.6))
  return g
}

function beachBall(p: string[]) {
  const [a, b, c] = p
  const r = 20
  const cols = [a, WHITE, b, WHITE, c, WHITE]
  const g = G()
  cols.forEach((col, i) => g.add(sphPatch(r, col, (i * PI) / 3, PI / 3, 0, PI, 12)))
  g.add(sphPatch(r + 0.3, WHITE, 0, PI * 2, 0, 0.26), sphPatch(r + 0.3, WHITE, 0, PI * 2, PI - 0.26, 0.26))
  g.add(onSphere(cyl(0.9, 0.9, 1.4, WHITE, {}, 10), [0.7, 0.2, 0.68], r))
  g.position.y = r
  return G(g)
}

function frisbee(p: string[]) {
  const [a, b, c] = p
  const prof: [number, number][] = [
    [0, 2.6],
    [10, 2.4],
    [12.4, 1.8],
    [12.4, 0.4],
    [13.0, 0],
    [13.45, 0.3],
    [13.5, 1.4],
    [12.8, 2.2],
    [10.5, 2.7],
    [6, 2.95],
    [0, 3.0],
  ]
  const geo = new THREE.LatheGeometry(
    prof.map(([x, y]) => new THREE.Vector2(x, y)),
    40,
  )
  const m = dbl(new THREE.Mesh(geo, toon(a)))
  m.castShadow = true
  const g = G(m)
  g.add(noOutline(torus(8.5, 0.25, b, { y: 2.98, rx: PI / 2 })))
  g.add(puck(3, 0.5, c, { y: 2.78 }))
  return g
}

function agilityLadder(p: string[]) {
  const [a, b, c] = p
  const g = G()
  for (let i = 0; i < 12; i++) g.add(rbox(42, 0.9, 4, a, { y: i * 1.0 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(rbox(2.6, 12.4, 5, b, { x: s * 22.3 }, 0.6))
    g.add(rbox(3, 1.6, 2, c, { x: s * 22.3, y: 12.2, z: 1 }, 0.4))
  }
  return g
}

// ====================================================================
// 装备收纳
// ====================================================================

const GEAR_RACK_HOOK_Y = 148.5
function gearRack(p: string[]) {
  const [a, b, c] = p
  const g = G()
  for (const x of [-48, 48]) for (const z of [-17, 17]) g.add(rbox(4, 180, 4, a, { x, z }, 0.8))
  for (const y of [8, 44, 80, 172]) g.add(rbox(100, 3, 38, b, { y }, 0.8))
  const holes = []
  for (let i = 0; i < 15; i++) for (let j = 0; j < 12; j++) holes.push({ kind: 'circle' as const, x: -42 + i * 6, y: 5 + j * 6, r: 0.6 })
  g.add(holePanel(92, 74, 1.5, c, holes, { y: 90, z: -17.5 }))
  g.add(rbox(92, 5, 2, a, { y: GEAR_RACK_HOOK_Y - 2.5, z: -15.8 }, 0.6))
  for (let i = 0; i < 6; i++) {
    const x = -37.5 + i * 15
    g.add(
      tubeLine(
        [
          [x, GEAR_RACK_HOOK_Y, -15],
          [x, GEAR_RACK_HOOK_Y, -9.5],
          [x, GEAR_RACK_HOOK_Y + 0.6, -7.8],
          [x, GEAR_RACK_HOOK_Y + 2.4, -7.2],
        ],
        0.5,
        STEEL,
      ),
    )
    g.add(ball(0.75, STEEL, { x, y: GEAR_RACK_HOOK_Y + 2.5, z: -7.2 }))
  }
  return g
}

const HELMET_MOUNT = 150
function helmetWall(p: string[]) {
  const [a, b] = p
  const d = 15
  const y0 = HELMET_MOUNT
  const g = G(rbox(60, 14, 2, a, { y: y0, z: -d / 2 + 1 }, 0.6))
  for (const x of [-20, 0, 20]) {
    g.add(cylZ(1.1, 10.5, b, x, y0 + 7, -d / 2 + 2 + 5.25, 14))
    g.add(ball(2.2, b, { x, y: y0 + 7, z: -d / 2 + 2 + 10.5 }))
  }
  return g
}

const RACKET_MOUNT = 110
function racketWall(p: string[]) {
  const [a, b, c] = p
  const d = 8
  const y0 = RACKET_MOUNT
  const zb = -d / 2 + 1
  const zr = -d / 2 + 2 + 2.2
  const g = G(rbox(60, 42, 2, a, { y: y0 + 20, z: zb }, 0.8))
  for (const x of [-14 - 3.4, -14 + 3.4, 14 - 3, 14 + 3]) g.add(cylZ(0.7, 5.6, b, x, y0 + (x < 0 ? 32.5 : 43.9), -d / 2 + 2 + 2.8, 10))
  g.add(P(tennisRacket(c, DARK, WHITE), -14, y0, zr))
  g.add(P(badmintonRacket(b, WHITE, WHITE), 14, y0 + 0.1, zr))
  return g
}

const SKATE_MOUNT = 100
const DECK: Poly = (() => {
  const pts: Poly = []
  for (let i = 0; i <= 12; i++) {
    const t = -PI / 2 + (i / 12) * PI
    pts.push([29 + Math.cos(t) * 10, Math.sin(t) * 10.25])
  }
  for (let i = 0; i <= 12; i++) {
    const t = PI / 2 + (i / 12) * PI
    pts.push([-29 + Math.cos(t) * 10, Math.sin(t) * 10.25])
  }
  return pts
})()
function skateWall(p: string[]) {
  const [a, b, c] = p
  const d = 24
  const y0 = SKATE_MOUNT
  const g = G()
  const zc = -d / 2 + 12.5
  for (const x of [-22, 22]) {
    g.add(rbox(5, 10, 1.2, b, { x, y: y0, z: -d / 2 + 0.6 }, 0.4))
    g.add(rbox(3, 2, 21, b, { x, y: y0 + 4, z: -d / 2 + 1.2 + 10.5 }, 0.5))
    g.add(rbox(3, 3, 1.2, b, { x, y: y0 + 4, z: d / 2 - 0.6 }, 0.4))
  }
  const deck = slab(DECK, 1.3, a, y0 + 6)
  deck.position.z = zc
  g.add(deck)
  for (const x of [-25, 25]) {
    g.add(rbox(5, 1, 7, STEEL, { x, y: y0 + 7.3, z: zc }, 0.3))
    g.add(rbox(2.4, 1.8, 4, STEEL, { x, y: y0 + 8.2, z: zc }, 0.5))
    g.add(cylZ(0.9, 16, STEEL, x, y0 + 10.4, zc, 10))
    for (const s of [-1, 1]) g.add(cylZ(2.7, 3.2, c, x, y0 + 10.4, zc + s * 9.3, 18))
  }
  return g
}

// ====================================================================
// 配色
// ====================================================================

const BALL_PALS: PalFlat[] = [
  ['modern', WHITE, '#3d5a80', '#ffd65a'],
  ['cute', C.white, C.pink, C.sky],
  ['retro', R.cream, R.teal, R.orange],
  ['nordic', N.white, N.blue, N.mustard],
]
const PACK_PALS: PalFlat[] = [
  ['industrial', '#5a6a4a', I.leather, '#26262a'],
  ['modern', '#3d3f44', '#c8473a', '#24252a'],
  ['nordic', N.blue, N.mustard, '#4a4f55'],
  ['retro', R.orange, R.mustard, '#3a3a3a'],
  ['cute', C.mint, C.lemon, '#5a4646'],
]
const POLE_PALS: PalFlat[] = [
  ['modern', '#3d3f44', '#24252a', '#c8473a'],
  ['industrial', I.steel, '#3a3a3c', I.rust],
  ['nordic', N.gray, '#4a4f55', N.mustard],
  ['retro', R.teal, '#3a3a3a', R.orange],
]
const CLIMB_PALS: PalFlat[] = [
  ['modern', '#3d5a80', '#ff7a3a', '#26262a'],
  ['industrial', I.rust, '#5a6a4a', I.iron],
  ['nordic', N.sage, N.mustard, '#4a4f55'],
  ['cute', C.lilac, C.lemon, '#5a4646'],
]
const CAMP_PALS: PalFlat[] = [
  ['industrial', '#5a6a4a', I.leather, I.iron],
  ['nordic', N.white, N.sage, N.oak],
  ['modern', '#3d3f44', '#c8473a', '#24252a'],
  ['retro', R.orange, R.mustard, R.caramel],
]
const YOGA_PALS: PalFlat[] = [
  ['nordic', N.sage, N.linen, N.oak],
  ['cute', C.lilac, C.sakura, C.mint],
  ['modern', '#3d3f44', M.light, M.black],
  ['japanese', '#c9cf8e', '#f6f0e1', '#6e4f37'],
]
const SPORT_PALS: PalFlat[] = [
  ['modern', '#26262a', '#5ad1ff', '#c3c7cc'],
  ['cute', C.pink, C.sky, C.white],
  ['nordic', N.blue, N.white, N.mustard],
  ['retro', R.teal, R.mustard, R.cream],
]
const RACK_PALS: PalFlat[] = [
  ['nordic', N.oak, N.oakL, N.white],
  ['industrial', I.iron, I.walnut, I.steel],
  ['modern', M.white, M.light, M.gray],
  ['retro', R.caramel, R.cream, R.mustard],
]

// ====================================================================
// 素材
// ====================================================================

const BALLS: AssetDef[] = [
  prop('gr-volleyball', '排球', 'fitness', [21.6, 21.6, 21.6], BALL_PALS, volleyball),
  prop('gr-rugby', '橄榄球', 'fitness', [29, 19.3, 19.3], [
    ['retro', '#a8683a', WHITE, WHITE],
    ['modern', WHITE, '#26262a', '#26262a'],
    ['industrial', I.leather, '#f4e7c8', '#f4e7c8'],
    ['cute', C.peach, C.white, C.white],
  ], rugby),
  prop('gr-softball', '垒球（2 个）', 'fitness', [20, 11.2, 9.8], [
    ['modern', '#f0ef6a', STITCH],
    ['retro', R.cream, R.red],
    ['cute', C.lemon, C.pink],
  ], softballs),
  prop('gr-tennis-can', '网球罐', 'fitness', [15.5, 9.7, 22.1], [
    ['modern', '#26262a', M.white, TENNIS],
    ['retro', R.red, R.cream, TENNIS],
    ['cute', C.pink, C.white, '#ffe08f'],
    ['nordic', N.blue, N.white, TENNIS],
  ], tennisCan),
  prop('gr-pingpong', '乒乓球拍 + 球', 'fitness', [33, 33, 4], [
    ['modern', '#d8473a', '#26262a', WHITE],
    ['retro', R.red, R.teal, R.orange],
    ['cute', C.pink, C.sky, WHITE],
  ], pingpong),
  prop('gr-shuttle-tube', '羽毛球筒', 'fitness', [34, 19.6, 9], [
    ['modern', '#26262a', '#c3c7cc', '#5ad1ff'],
    ['nordic', N.white, N.blue, N.mustard],
    ['retro', R.cream, R.red, R.teal],
    ['cute', C.white, C.mint, C.pink],
  ], shuttleTube),
  prop('gr-golf-box', '高尔夫球盒', 'fitness', [16, 21, 11.3], [
    ['modern', '#26262a', '#c3c7cc', WHITE],
    ['retro', R.cream, R.teal, R.red],
    ['nordic', N.white, N.sage, N.oak],
  ], golfBox),
  prop('gr-bowling-ball', '保龄球', 'fitness', [22, 22, 21.8], [
    ['retro', '#5a2e6a', '#e2702f'],
    ['modern', '#26262a', '#5ad1ff'],
    ['cute', C.pink, C.lilac],
    ['industrial', '#3a3a3c', I.rust],
  ], bowlingBall),
  prop('gr-bowling-bag', '保龄球袋', 'fitness', [31.4, 22.6, 35], [
    ['modern', '#26262a', '#3d3f44', '#c3c7cc'],
    ['retro', R.teal, R.cream, R.mustard],
    ['industrial', I.leather, I.iron, I.steel],
    ['cute', C.lilac, C.white, C.pink],
  ], bowlingBag),
  prop('gr-dodgeball', '躲避球', 'fitness', [22.2, 22.2, 22.2], [
    ['cute', C.pink, C.white, C.lemon],
    ['retro', R.red, R.cream, R.mustard],
    ['modern', '#3d5a80', WHITE, '#26262a'],
  ], dodgeball),
  prop('gr-kids-balls', '儿童彩色小皮球', 'kids', [27.5, 23.6, 15.6], [
    ['cute', C.pink, C.sky, C.lemon],
    ['retro', R.red, R.teal, R.mustard],
    ['nordic', N.sage, N.blue, N.mustard],
  ], kidsBalls),
  prop('gr-ball-net-hanging', '球网袋', 'fitness', [22.6, 24.3, 80], [
    ['modern', '#e2702f', WHITE, '#26262a'],
    ['retro', R.orange, R.cream, R.caramel],
    ['cute', C.pink, C.white, C.sky],
    ['nordic', N.mustard, N.white, N.gray],
  ], ballNetHanging, { family: 'gr-ball-net', form: 'hanging' }),
  prop('gr-ball-net', '球网袋', 'fitness', [80, 22.6, 22.6], [
    ['modern', '#e2702f', WHITE, '#26262a'],
    ['retro', R.orange, R.cream, R.caramel],
    ['cute', C.pink, C.white, C.sky],
    ['nordic', N.mustard, N.white, N.gray],
  ], ballNetLying, { family: 'gr-ball-net', form: 'lying' }),
  def('gr-ball-rack', '落地球架', 'fitness', [80.3, 34.3, 103.2], [
    ['industrial', I.iron, '#e2702f', '#3d5a80'],
    ['modern', M.char, '#e2702f', '#3d5a80'],
    ['nordic', N.oak, N.mustard, N.blue],
    ['cute', C.white, C.pink, C.sky],
  ], ballRack, {
    surfaces: RACK_TIERS.map((y, i) => ({ y: y + 1.2, shape: [rectPoly(13, -9.2, 36, 9.2)], h: i < 2 ? 32.6 : 30 })),
  }),
  def('gr-bat-rack', '球棒架 + 棒球', 'fitness', [56, 28, 85], [
    ['nordic', N.oak, STEEL, N.blue],
    ['industrial', I.walnut, I.steel, I.iron],
    ['retro', R.caramel, R.red, R.teal],
    ['modern', M.char, M.silver, M.black],
  ], batRack),
]

const CLIMB: AssetDef[] = [
  def('gr-backpack-60', '登山包', 'fitness', [40, 32, 67], PACK_PALS, bigPack(false), { family: 'gr-backpack-60', sizeLabel: '60L', form: 'standing' }),
  def('gr-backpack-60-open', '登山包', 'fitness', [40, 46, 78], PACK_PALS, bigPack(true), { family: 'gr-backpack-60', sizeLabel: '60L', form: 'open' }),
  prop('gr-summit-pack', '攻顶包', 'fitness', [24, 18, 42.5], PACK_PALS, summitPack),
  def('gr-trek-poles', '登山杖（一对）', 'fitness', [16, 19.3, 118], POLE_PALS, trekPolesLean, { family: 'gr-trek-poles', form: 'standing' }),
  prop('gr-trek-poles-short', '登山杖（一对）', 'fitness', [68.4, 12.3, 5.2], POLE_PALS, trekPolesShort, { family: 'gr-trek-poles', form: 'lying' }),
  prop('gr-rope-coil', '登山绳（盘好）', 'fitness', [48, 36, 11], [
    ['modern', '#3d8fd8', '#ff7a3a'],
    ['industrial', I.rust, '#5a6a4a'],
    ['cute', C.pink, C.lemon],
    ['nordic', N.blue, N.mustard],
  ], ropeCoil),
  prop('gr-harness', '攀岩安全带', 'fitness', [33.4, 42, 2.5], CLIMB_PALS, harness),
  prop('gr-quickdraws', '快挂 + 主锁', 'fitness', [27, 26.7, 1.7], CLIMB_PALS, quickdrawsLying, { family: 'gr-quickdraws', form: 'lying' }),
  prop('gr-quickdraws-hanging', '快挂 + 主锁', 'fitness', [10.9, 6.1, 35], CLIMB_PALS, quickdrawsHanging, { family: 'gr-quickdraws', form: 'hanging' }),
  prop('gr-climb-shoes', '攀岩鞋', 'fitness', [21.7, 25.7, 8.6], CLIMB_PALS, climbShoes),
  prop('gr-chalk-bag', '岩粉袋', 'fitness', [16.2, 15.5, 19.1], CLIMB_PALS, chalkBag),
  prop('gr-climb-helmet', '攀岩头盔', 'fitness', [22.5, 26.2, 9.5], CLIMB_PALS, climbHelmet),
  prop('gr-headlamp', '头灯', 'fitness', [18, 23.3, 4.1], [
    ['modern', '#26262a', '#3d3f44', '#c8473a'],
    ['industrial', '#5a6a4a', I.iron, I.rust],
    ['cute', C.mint, C.white, C.pink],
    ['nordic', N.blue, N.white, N.mustard],
  ], headlamp),
  prop('gr-ice-axe', '冰镐', 'fitness', [64.6, 29.2, 3], CLIMB_PALS, iceAxe),
  prop('gr-crampons', '冰爪', 'fitness', [25.4, 28.5, 7.2], [
    ['modern', '#c8473a', '#26262a'],
    ['industrial', I.rust, I.iron],
    ['nordic', N.mustard, N.gray],
  ], crampons),
  prop('gr-sleeping-bag', '睡袋', 'fitness', [39.5, 27.5, 27.5], CAMP_PALS, sleepingBagRolled, { family: 'gr-sleeping-bag', form: 'boxed' }),
  def('gr-sleeping-bag-open', '睡袋', 'bedroom', [78, 208, 9.8], CAMP_PALS, sleepingBagOpen, { family: 'gr-sleeping-bag', form: 'open' }),
  prop('gr-sleep-pad', '防潮垫（卷起）', 'fitness', [56.6, 19.6, 19.6], CAMP_PALS, sleepPad),
  prop('gr-tent-bag', '登山帐篷', 'outdoor', [44, 32.6, 19.6], CAMP_PALS, tentBag, { family: 'gr-tent', form: 'boxed' }),
  def('gr-tent', '登山帐篷', 'outdoor', [258, 147, 101], CAMP_PALS, tentPitched, { family: 'gr-tent', form: 'open' }),
  prop('gr-camp-stove', '露营炉 + 套锅', 'outdoor', [29.3, 14, 25.2], CAMP_PALS, campStove),
  prop('gr-lantern', '露营灯', 'outdoor', [13, 13, 23.1], CAMP_PALS, lantern),
  prop('gr-thermos', '户外保温壶', 'outdoor', [9.3, 10.2, 31.4], CAMP_PALS, thermos),
  prop('gr-compass-map', '指北针 + 地图', 'tabletop', [24.8, 30, 2.4], [
    ['nordic', PAPER, N.blue, N.mustard],
    ['industrial', PAPER, '#5a6a4a', I.rust],
    ['retro', R.cream, R.red, R.caramel],
  ], compassMap),
]

const YOGA: AssetDef[] = [
  prop('gr-yoga-blocks', '瑜伽砖（一对）', 'fitness', [23, 24.4, 15.2], YOGA_PALS, yogaBlocks),
  prop('gr-yoga-strap', '伸展带', 'fitness', [9.2, 35, 4.1], YOGA_PALS, yogaStrap),
  prop('gr-bolster', '瑜伽枕', 'fitness', [68, 23.6, 23.6], YOGA_PALS, bolster),
  def('gr-meditation-set', '冥想坐垫组', 'fitness', [68, 68, 20.7], YOGA_PALS, meditationSet),
  prop('gr-pilates-ring', '普拉提环', 'fitness', [41.4, 39.2, 4.4], YOGA_PALS, pilatesRing),
  prop('gr-massage-balls', '筋膜球组', 'fitness', [25.3, 13.8, 9.4], YOGA_PALS, massageBalls),
  def('gr-mat-rack', '瑜伽垫收纳架', 'fitness', [72, 26, 66], [
    ['nordic', N.oak, N.sage, N.blue],
    ['japanese', '#e9d2a6', '#c9cf8e', '#3d5a80'],
    ['modern', M.white, M.char, M.gray],
    ['cute', C.woodL, C.lilac, C.mint],
  ], matRack),
]

const SPORTS: AssetDef[] = [
  prop('gr-ski-helmet', '滑雪头盔 + 雪镜', 'fitness', [24.8, 28.8, 15.6], [
    ['modern', '#26262a', '#5ad1ff', '#ff9a3a'],
    ['nordic', N.white, N.blue, '#9fd0e8'],
    ['retro', R.teal, R.mustard, '#ff9a3a'],
    ['cute', C.lilac, C.pink, '#ffd0e8'],
  ], skiHelmet),
  def('gr-ski-poles', '滑雪杖（一对）', 'fitness', [16.5, 22.7, 120], POLE_PALS, skiPoles),
  prop('gr-bindings', '单板固定器', 'fitness', [38.8, 31.1, 22.1], [
    ['modern', '#26262a', '#3d3f44', '#5ad1ff'],
    ['retro', R.teal, '#3a3a3a', R.mustard],
    ['cute', C.white, C.lilac, C.pink],
    ['industrial', I.iron, I.rust, I.steel],
  ], bindings),
  prop('gr-inline-skates', '轮滑鞋', 'fitness', [24.6, 37.2, 27.6], [
    ['modern', '#26262a', '#5ad1ff', '#c3c7cc'],
    ['cute', C.white, C.pink, C.mint],
    ['retro', R.cream, R.orange, R.teal],
    ['nordic', N.white, N.mustard, N.blue],
  ], inlineSkates),
  prop('gr-road-helmet', '公路车头盔', 'fitness', [22, 28.3, 10], [
    ['modern', '#26262a', '#c8473a', '#3d3f44'],
    ['nordic', N.white, N.blue, N.gray],
    ['cute', C.sky, C.white, '#5a4646'],
    ['retro', R.mustard, R.teal, '#3a3a3a'],
  ], roadHelmet),
  prop('gr-bike-bottles', '骑行水壶（2 个）', 'fitness', [15.8, 8.4, 25.1], SPORT_PALS, bikeBottles),
  def('gr-duffel', '运动行李袋', 'fitness', [55.4, 36.8, 37.8], [
    ['modern', '#26262a', '#3d3f44', '#c8473a'],
    ['industrial', '#5a6a4a', I.leather, I.iron],
    ['nordic', N.blue, N.linen, N.oak],
    ['retro', R.mustard, R.teal, R.caramel],
    ['cute', C.lilac, C.white, C.pink],
  ], duffel),
  prop('gr-pads', '护膝护肘', 'fitness', [30.7, 38.6, 6], SPORT_PALS, padsSet),
  prop('gr-run-belt', '跑步腰包', 'fitness', [26, 33, 7.1], SPORT_PALS, runBelt),
  prop('gr-swim-set', '泳帽 + 泳镜', 'fitness', [35.7, 21, 8.5], [
    ['modern', '#26262a', '#5ad1ff', '#5ad1ff'],
    ['cute', C.pink, C.white, C.sky],
    ['nordic', N.blue, N.white, N.sage],
    ['retro', R.red, R.cream, R.teal],
  ], swimSet),
  prop('gr-snorkel-fins', '潜水面镜 + 脚蹼', 'fitness', [63.6, 66.4, 5.5], [
    ['modern', '#26262a', '#3d5a80', '#c3c7cc'],
    ['cute', C.sky, C.mint, C.pink],
    ['retro', R.orange, R.teal, R.mustard],
    ['nordic', N.gray, N.blue, N.white],
  ], snorkelFins),
  prop('gr-beach-ball', '沙滩球', 'outdoor', [40, 40, 40.6], [
    ['cute', C.pink, C.sky, C.lemon],
    ['retro', R.red, R.teal, R.mustard],
    ['nordic', N.blue, N.sage, N.mustard],
  ], beachBall),
  prop('gr-frisbee', '飞盘', 'outdoor', [27, 27, 3.3], [
    ['cute', C.mint, C.white, C.pink],
    ['retro', R.orange, R.cream, R.teal],
    ['modern', WHITE, '#26262a', '#5ad1ff'],
    ['nordic', N.mustard, N.white, N.blue],
  ], frisbee),
  prop('gr-agility-ladder', '敏捷梯（收起）', 'fitness', [47.6, 5, 13.8], [
    ['modern', '#f0d43a', '#26262a', '#c3c7cc'],
    ['retro', R.orange, R.caramel, R.cream],
    ['cute', C.pink, C.white, C.sky],
  ], agilityLadder),
]

const RACKS: AssetDef[] = [
  def('gr-gear-rack', '玄关运动装备架', 'entrance', [100, 38, 180], RACK_PALS, gearRack, {
    surface: 175,
    surfaces: [
      { y: 11, shape: [rectPoly(-46, -15, 46, 19)], h: 33 },
      { y: 47, shape: [rectPoly(-46, -15, 46, 19)], h: 33 },
      { y: 83, shape: [rectPoly(-46, -15, 46, 19)], h: 58 },
      { y: GEAR_RACK_HOOK_Y + 0.5, kind: 'hook', shape: [rectPoly(-44, -11, 44, -6)], h: GEAR_RACK_HOOK_Y - 83 },
    ],
  }),
  def('gr-helmet-wall', '头盔 / 帽子壁挂架', 'entrance', [60, 15, 14], RACK_PALS, helmetWall, {
    mount: HELMET_MOUNT,
    surfaces: [-20, 0, 20].map((x) => ({ y: HELMET_MOUNT + 8.2, kind: 'hook' as const, shape: [rectPoly(x - 1.5, 0.5, x + 1.5, 5.5)], h: 60 })),
  }),
  def('gr-racket-wall', '球拍壁挂架', 'fitness', [60, 8, 67.1], [
    ['nordic', N.oak, N.white, '#26262a'],
    ['industrial', I.walnut, I.steel, I.rust],
    ['modern', M.white, '#c8473a', '#26262a'],
    ['retro', R.cream, R.teal, R.red],
  ], racketWall, { mount: RACKET_MOUNT }),
  def('gr-skate-wall', '滑板壁挂架', 'hobby', [78, 24, 13.1], [
    ['retro', R.orange, '#3a3a3a', R.cream],
    ['cute', C.mint, C.white, C.pink],
    ['modern', '#26262a', '#8a8d93', '#f4f4f2'],
    ['industrial', I.walnut, I.iron, I.rust],
  ], skateWall, { mount: SKATE_MOUNT }),
]

export const GEAR: AssetDef[] = [...BALLS, ...CLIMB, ...YOGA, ...SPORTS, ...RACKS]
