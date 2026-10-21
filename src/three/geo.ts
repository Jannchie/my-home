// 素材包共用的几何小工具（唯一实现）。依赖方向：toon → geo → kit → packs。
// 这里只放「和具体素材无关」的建模小件：摆放、描边 / 发光 / 半透明标记、两点之间的杆和条、弯管、包围盒对齐。
// 素材包不要再在自己文件里复制这些函数：同名不同义（参数顺序、默认值不同）是最大的隐患——
// 改一个包里 bar 的参数顺序，另一个包的调用就悄悄变成另一种几何。语义不同的函数在这里用不同的名字区分，
// test/packs-hygiene.spec.ts 会检查各包没有再定义与这里同名的顶层函数。
import * as THREE from 'three'
import { ball, cyl, rbox, toon } from './toon'

export const PI = Math.PI
/** 三维点 [x, y, z]，cm */
export type V3 = [number, number, number]
/** 二维点 [x, y]，cm */
export type V2 = [number, number]
/** 只读的 y 轴单位向量（不要修改它） */
export const UP = new THREE.Vector3(0, 1, 0)
/** 只读的 z 轴单位向量（不要修改它） */
export const ZAX = new THREE.Vector3(0, 0, 1)

/** 两点距离 */
export const dist = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

// ---------- 摆放 / 分组 ----------

/** 就地设置位置和欧拉角，返回原对象 */
export function P<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}

/** 把若干对象放进一个新 Group */
export function G(...c: THREE.Object3D[]) {
  const g = new THREE.Group()
  for (const o of c) g.add(o)
  return g
}

/** 任意几何 + toon 材质，投影并接收阴影 */
export function mesh(geo: THREE.BufferGeometry, color: string) {
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 任意几何 + 指定材质，投影并接收阴影 */
export function meshWith(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 精确包围盒（先更新世界矩阵） */
export function box3(o: THREE.Object3D) {
  o.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(o, true)
}

// ---------- 描边 / 发光 / 半透明 ----------

/** 只给这个对象本身标「不描边」（子节点不管） */
export const noOutline = <T extends THREE.Object3D>(o: T): T => {
  o.userData.noOutline = true
  return o
}

/** 整棵子树的每个节点都标「不描边」 */
export function noOutlineDeep<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    c.userData.noOutline = true
  })
  return o
}

/** 发光件（屏幕、指示灯、灯泡）：自发光材质，不描边 */
export function lit<T extends THREE.Mesh>(m: T, color: string, k = 0.6): T {
  m.material = toon(color, { emissive: k })
  m.userData.noOutline = true
  return m
}

/** 发光件，但保留描边（大块的发光面板、灯罩） */
export function litOutlined<T extends THREE.Mesh>(m: T, color: string, k = 0.6): T {
  m.material = toon(color, { emissive: k })
  return m
}

/** 整棵子树的网格都换成自发光材质并标「不描边」 */
export function litDeep<T extends THREE.Object3D>(o: T, color: string, k = 0.8): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    m.material = toon(color, { emissive: k })
    m.userData.noOutline = true
  })
  return o
}

/** 半透明件（玻璃、亚克力、水）：半透明材质，不投影，不描边 */
export function ghost<T extends THREE.Mesh>(m: T, color: string, a = 0.35): T {
  m.material = toon(color, { transparent: a })
  m.castShadow = false
  m.userData.noOutline = true
  return m
}

/** 半透明件，不投影，但保留描边标记（描边阶段本来就跳过半透明材质） */
export function ghostOutlined<T extends THREE.Mesh>(m: T, color: string, a = 0.35): T {
  m.material = toon(color, { transparent: a })
  m.castShadow = false
  return m
}

/** 整棵子树的网格都换成半透明材质、不投影 */
export function ghostDeep<T extends THREE.Object3D>(o: T, color: string, a = 0.35): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (m.isMesh) {
      m.material = toon(color, { transparent: a })
      m.castShadow = false
    }
  })
  return o
}

/** 只换成半透明材质（投影、描边标记不动） */
export function clearMat<T extends THREE.Mesh>(m: T, color: string, a = 0.35): T {
  m.material = toon(color, { transparent: a })
  return m
}

/** 整棵子树的网格都换成半透明材质（投影、描边标记不动） */
export function clearDeep<T extends THREE.Object3D>(o: T, color: string, a = 0.4): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = toon(color, { transparent: a })
  })
  return o
}

/** 竖直的玻璃板（柜门玻璃、展示柜）：薄圆角盒 + 半透明（默认色同 kit.ts 的 C.glass） */
export function glassPane(w: number, h: number, t: number, at: { x?: number; y: number; z: number }, color = '#bfe6ff') {
  const m = rbox(w, h, t, color, at, 0.2)
  m.material = toon(color, { transparent: 0.32 })
  return m
}

// ---------- 两点之间的杆 / 条 ----------

/**
 * 两点之间的圆杆（cyl 体素，尺寸量化、几何共享）：最短弧旋转，不控制绕轴的扭转。长度至少 0.01。
 */
export function rod3(a: V3, b: V3, r: number, color: string, seg = 10) {
  return taperRod3(a, b, r, r, color, seg)
}

/** 两点之间的锥杆：a 端半径 ra，b 端半径 rb */
export function taperRod3(a: V3, b: V3, ra: number, rb: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = cyl(rb, ra, Math.max(0.01, dir.length()), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return m
}

/**
 * 两点之间的方料（圆角盒）：截面 w（局部 x）× t（局部 z），最短弧旋转。圆角默认 min(w, t) × 0.25。
 */
export function batten(a: V3, b: V3, w: number, t: number, color: string, radius = Math.min(w, t) * 0.25) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = rbox(w, va.distanceTo(vb), t, color, {}, radius)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, vb.clone().sub(va).normalize())
  return m
}

/**
 * 把对象的局部 y 轴对准 a → b，并控制绕轴的扭转：局部 z 尽量朝世界 z（杆接近竖直 z 时改朝世界 y），位置放到中点。
 * 椅子框架的方料要求截面朝向稳定，用它而不是最短弧旋转。
 */
export function orientBasis<T extends THREE.Object3D>(m: T, a: V3, b: V3): T {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const y = vb.clone().sub(va).normalize()
  const ref = Math.abs(y.dot(ZAX)) > 0.9 ? UP : ZAX
  const z = ref.clone().addScaledVector(y, -ref.dot(y)).normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  m.position.copy(va.add(vb).multiplyScalar(0.5))
  return m
}

/** 两点之间的圆管（不量化的圆柱几何，扭转受控，见 orientBasis）：a 端半径 r，b 端半径 rb */
export function strut(a: V3, b: V3, r: number, color: string, rb = r, seg = 10) {
  return orientBasis(mesh(new THREE.CylinderGeometry(rb, r, dist(a, b), seg), color), a, b)
}

/** 两点之间的方料（扭转受控，见 orientBasis）：截面 sx × sz，圆角不超过 round */
export function strutBox(a: V3, b: V3, sx: number, sz: number, color: string, round = 0.6) {
  return orientBasis(rbox(sx, dist(a, b), sz, color, {}, Math.min(round, sx / 2 - 0.05, sz / 2 - 0.05)), a, b)
}

// ---------- 横放的圆柱 ----------

/** 沿 x 轴横放的圆柱，(x, y, z) 为中心 */
export const cylX = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) => P(cyl(r, r, len, color, {}, seg), x, y, z, 0, 0, PI / 2)

/** 沿 z 轴横放的圆柱，(x, y, z) 为中心 */
export const cylZ = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 24) => P(cyl(r, r, len, color, {}, seg), x, y, z, PI / 2)

/**
 * 旧写法的横放圆柱（bath-extra / variants-a / wet 用）：先按「底面在 y - len / 2」摆，再绕 z / x 轴转 90°。
 * 体素长度量化到 0.1cm，所以中心比 y 偏 (q(len) - len) / 2（≤ 0.025cm）。新代码用 cylX / cylZ；
 * 这里保留是为了让已有模型逐顶点不变。
 */
export function cylXLegacy(r: number, len: number, color: string, x: number, y: number, z: number, seg = 12) {
  return cyl(r, r, len, color, { x, y: y - len / 2, z, rz: PI / 2 }, seg)
}
/** 见 cylXLegacy */
export function cylZLegacy(r: number, len: number, color: string, x: number, y: number, z: number, seg = 12) {
  return cyl(r, r, len, color, { x, y: y - len / 2, z, rx: PI / 2 }, seg)
}

/** 沿 z 轴横放的圆柱，从 z0 往 +z 伸出 len（(x, y) 为轴心） */
export const cylZFrom = (r: number, len: number, color: string, x: number, y: number, z0: number, seg = 20) => P(cyl(r, r, len, color, {}, seg), x, y, z0 + len / 2, PI / 2)

/** 横放的圆台：axis 'x'（rTop 朝 +x）或 'z'（rTop 朝 -z），(x, y, z) 为中心 */
export function hcyl(rTop: number, rBottom: number, len: number, color: string, x: number, y: number, z: number, axis: 'x' | 'z' = 'x', seg = 16) {
  const m = cyl(rTop, rBottom, len, color, {}, seg)
  m.position.set(x, y, z)
  if (axis === 'x') m.rotation.z = -PI / 2
  else m.rotation.x = PI / 2
  return m
}

// ---------- 弯管 ----------

/** 弯管段数：固定值，或按控制点数自适应 { per, min } → max(min, 点数 × per) */
export type TubeSeg = number | { per: number; min: number }

export interface TubeOpts {
  /** 沿路径的段数，默认 24 */
  seg?: TubeSeg
  /** 截面段数，默认 8 */
  radial?: number
  /** 闭合路径，默认 false */
  closed?: boolean
  /** 接收阴影，默认 true（投影总是开） */
  receive?: boolean
  /** cappedTube：两端加球帽，默认 true（闭合路径没有球帽） */
  caps?: boolean
  /** cappedTube：没有球帽时也包一层 Group，默认 false */
  group?: boolean
}

/** 过控制点的弯管（centripetal Catmull-Rom 曲线），两端开口 */
export function tube(pts: V3[], r: number, color: string, o: TubeOpts = {}) {
  const closed = o.closed ?? false
  const s = o.seg ?? 24
  const seg = typeof s === 'number' ? s : Math.max(s.min, pts.length * s.per)
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
    'centripetal',
  )
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, o.radial ?? 8, closed), toon(color))
  m.castShadow = true
  if (o.receive ?? true) m.receiveShadow = true
  return m
}

/**
 * 两端带球帽的弯管：开口路径返回 Group(管, 球, 球)；闭合路径（或 caps: false）没有球帽，
 * group 为 true 时仍包一层 Group，否则直接返回管。
 */
export function cappedTube(pts: V3[], r: number, color: string, o: TubeOpts = {}): THREE.Object3D {
  const m = tube(pts, r, color, o)
  if (o.closed || o.caps === false) return o.group ? G(m) : m
  const a = pts[0]
  const b = pts[pts.length - 1]
  return G(m, ball(r, color, { x: a[0], y: a[1], z: a[2] }), ball(r, color, { x: b[0], y: b[1], z: b[2] }))
}

// ---------- 车削体 ----------

/** 车削体：轮廓点 [半径, 高度] 绕 y 轴旋转；phi = [起始角, 扫过的角度]。投影并接收阴影 */
export function lathe(pts: V2[], color: string, seg = 32, phi: [number, number] = [0, PI * 2]) {
  return mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi[0], phi[1]), color)
}

/** 车削体并放到 at；半径小于 minR 的轮廓点抬到 minR（避免轴上退化三角形） */
export function latheAt(pts: V2[], color: string, at: { x?: number; y?: number; z?: number } = {}, seg = 32, minR = 0) {
  const m = mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(minR, r), y)), seg), color)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return m
}

// ---------- 按包围盒对齐（几种语义不同，名字区分） ----------

/**
 * 外包一层 Group，把 g 挪到「x / z 居中、底面贴 y0」（keepZ 时 z 不动）。返回外层 Group，g 自身的变换被改写。
 */
export function fitGroup(g: THREE.Object3D, y0 = 0, keepZ = false) {
  const outer = new THREE.Group()
  outer.add(g)
  outer.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(outer, true)
  g.position.x -= (b.min.x + b.max.x) / 2
  if (!keepZ) g.position.z -= (b.min.z + b.max.z) / 2
  g.position.y += y0 - b.min.y
  return outer
}

/** 壁挂物：背面（最小 z）贴到 -d/2，水平居中，最低点 = mount（素材的 mount / d 对得上模型） */
export function fitWall(g: THREE.Object3D, mount: number, d: number) {
  const outer = fitGroup(g, mount, true)
  outer.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(outer, true)
  g.position.z += -d / 2 - b.min.z
  return outer
}

/** 不包新层：把 g 的每个子节点平移，使整体 x / z 居中、底面贴 y0。返回 g */
export function fitChildren<T extends THREE.Object3D>(g: T, y0 = 0): T {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  const off = new THREE.Vector3(-(b.min.x + b.max.x) / 2, y0 - b.min.y, -(b.min.z + b.max.z) / 2)
  for (const c of g.children) c.position.add(off)
  return g
}

/** 就地平移 o 自身，使 x / z 居中、底面贴 y0。返回 o */
export function fitInPlace<T extends THREE.Object3D>(o: T, y0 = 0): T {
  o.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(o, true)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.z -= (b.min.z + b.max.z) / 2
  o.position.y += y0 - b.min.y
  return o
}

/** fitInPlace / fitGroup 会给模型的平移量 [dx, dy, dz]（手写的 surface / screens 要跟着平移时用，见 packkit.shiftDeclared） */
export function fitOffset(o: THREE.Object3D, y0 = 0): [number, number, number] {
  const b = box3(o)
  return [-(b.min.x + b.max.x) / 2, y0 - b.min.y, -(b.min.z + b.max.z) / 2]
}

/** 只把 x / z 居中（高度不动），就地平移 o。返回 o */
export function centerXZInPlace<T extends THREE.Object3D>(o: T): T {
  o.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(o, true)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.z -= (b.min.z + b.max.z) / 2
  return o
}

/** 只把 x / z 居中（高度不动），再外包一层 Group 返回 */
export function centerGroup(g: THREE.Object3D) {
  return G(centerXZInPlace(g))
}

type BuildFn = (p: string[]) => THREE.Group
/** build 包装：每次建模后 fitGroup（x / z 居中、底面贴 y0） */
export const fitBuild =
  (build: BuildFn, y0 = 0): BuildFn =>
  (p) =>
    fitGroup(build(p), y0)
/** build 包装：每次建模后 fitChildren（不加新层） */
export const fitChildrenBuild =
  (build: BuildFn, y0 = 0): BuildFn =>
  (p) =>
    fitChildren(build(p), y0)
/** build 包装：每次建模后 centerGroup（只居中 x / z） */
export const centerBuild =
  (build: BuildFn): BuildFn =>
  (p) =>
    centerGroup(build(p))

/** 平面多边形按自身外接矩形缩放到 w × d、并居中（L 形、云朵形桌面） */
export function fitPoly(poly: [number, number][], w: number, d: number): [number, number][] {
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  return poly.map(([x, z]): [number, number] => [((x - x0) / (x1 - x0) - 0.5) * w, ((z - z0) / (z1 - z0) - 0.5) * d])
}

// ---------- 布料软团 ----------

/** 按位置把重合顶点（球面接缝）的法线取平均 */
export function smoothNormals(geo: THREE.BufferGeometry) {
  geo.computeVertexNormals()
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const key = (i: number) => `${Math.round(pos.getX(i) * 50)},${Math.round(pos.getY(i) * 50)},${Math.round(pos.getZ(i) * 50)}`
  const acc = new Map<string, THREE.Vector3>()
  for (let i = 0; i < pos.count; i++) {
    const k = key(i)
    let v = acc.get(k)
    if (!v) acc.set(k, (v = new THREE.Vector3()))
    v.x += nor.getX(i)
    v.y += nor.getY(i)
    v.z += nor.getZ(i)
  }
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(key(i))!.clone().normalize()
    nor.setXYZ(i, v.x, v.y, v.z)
  }
}

export type SoftFn = (x: number, y: number, z: number) => V3
/** 软团：f 把单位球上的点映射成模型坐标；wrinkle 为褶皱幅度（cm），freq 越大褶越密（长毛款用很密的小起伏） */
export function soft(color: string, f: SoftFn, opts: { wrinkle?: number; freq?: number; seed?: number; seg?: [number, number] } = {}) {
  const [ws, hs] = opts.seg ?? [48, 32]
  const geo = new THREE.SphereGeometry(1, ws, hs)
  const pos = geo.attributes.position
  const amp = opts.wrinkle ?? 0.7
  const F = opts.freq ?? 1
  const sd = opts.seed ?? 1
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    let [X, Y, Z] = f(x, y, z)
    if (amp && Y > 0.5) {
      const n = Math.sin(x * 7 * F + sd) * Math.sin(z * 6 * F + sd * 1.7) + 0.5 * Math.sin(y * 9 * F + x * 4 * F + sd * 0.6)
      const q = Math.hypot(x, z) || 1
      const k = amp * n * Math.min(1, Y / 4)
      X += (x / q) * k
      Z += (z / q) * k
      Y = Math.max(0, Y + y * k * 0.5)
    }
    pos.setXYZ(i, X, Y, Z)
  }
  smoothNormals(geo)
  return mesh(geo, color)
}
