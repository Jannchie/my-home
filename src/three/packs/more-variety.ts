// 更多款式：伞架（并入 umbrella-stand 系列）、懒人沙发（并入 beanbag 系列）、墙上艺术品（装饰画 / 照片墙 / 立体壁饰）。
//
// 约定同 kit.ts：
//   - 落地素材原点在占地中心的地面上，背面朝 -z。
//   - 壁挂（mount）：模型按离地高度建，最低点 = mount，背面贴墙在 z = -d/2（settle 统一摆正）。
//   - 伞架是空心的容器，伞尖落在内底上、伞身真的插在筒里。
//   - 装饰画按画框分系列、按尺寸分规格；同一系列里每组配色对应一幅不同的画（配色名里的风格就是画的风格）。

import * as THREE from 'three'
import { ball, cup, cyl, rbox, shade, torus, tray } from '../toon'
import { C, G, holePanel, paintAbstract, paintFlower, paintLandscape, paintPanel, rng, shell, type AssetCategory, type AssetDef, type StyleTag } from '../kit'
import { PI, clearDeep, cylZFrom, fitGroup, mesh, noOutlineDeep, tube, type TubeOpts, type V3 } from '../geo'
import { I, J, M, N, R, type Build, type Pal } from '../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = { radial: 6 }

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

const GOLD = '#d6ad55'
const BRASS = '#c9a45c'
const CHROME = '#cfd3d8'

// ======================================================================
// 小工具
// ======================================================================

/** 两点之间的一根杆（可以两端不同粗：圆锥） */
function bar(a: V3, b: V3, r: number, color: string, seg = 8, r2 = r) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = mesh(new THREE.CylinderGeometry(r2, r, dir.length(), seg), color)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return m
}
/** 低多边形的锥段（鹿头）：法线按面算，棱角分明 */
function facet(a: V3, b: V3, ra: number, rb: number, color: string, seg = 5) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), seg).toNonIndexed()
  geo.computeVertexNormals()
  const m = mesh(geo, color)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return m
}
/** 平面轮廓挤出的薄片：轮廓在 xy 平面，厚度沿 +z 从 z0 开始 */
function flat(pts: [number, number][], t: number, color: string, z0 = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const m = mesh(new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }), color)
  m.position.z = z0
  return m
}
/** 圆形画面：圆心 (x, y)，正面朝 +z */
function paintDisc(r: number, key: string, draw: Draw, x: number, y: number, z: number) {
  const src = paintPanel(r * 2, r * 2, key, draw)
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), src.material)
  m.position.set(x, y, z)
  m.userData.noOutline = true
  m.receiveShadow = true
  return m
}
/** 空心旋转体（陶瓷筒、铸铁筒）：外轮廓 [r, y]（自下而上），壁厚 t，口沿圆润 */
function vessel(outer: [number, number][], t: number, color: string, seg = 32) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
  for (const [r, y] of outer) pts.push(new THREE.Vector2(r, y))
  const [rT, yT] = outer[outer.length - 1]
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * PI
    pts.push(new THREE.Vector2(rT - t / 2 + (Math.cos(a) * t) / 2, yT + (Math.sin(a) * t) / 2))
  }
  for (let i = outer.length - 1; i >= 0; i--) {
    const [r, y] = outer[i]
    if (y <= t + 0.5) break
    pts.push(new THREE.Vector2(r - t, y))
  }
  pts.push(new THREE.Vector2(rAt(outer, t + 0.5) - t, t + 0.5), new THREE.Vector2(rAt(outer, t) - t - 0.5, t), new THREE.Vector2(0, t))
  return mesh(new THREE.LatheGeometry(pts, seg), color)
}
/** 外轮廓在高度 y 处的半径 */
function rAt(outer: [number, number][], y: number) {
  for (let i = 1; i < outer.length; i++) {
    const [r0, y0] = outer[i - 1]
    const [r1, y1] = outer[i]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0)
  }
  return outer[outer.length - 1][0]
}
/** 简单字符串哈希（画面里的确定性随机） */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// ---------- 定义工具 ----------

function A(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((p) => p[1]),
    paletteStyles: pals.map((p) => p[0]),
    styles: [...new Set(pals.map((p) => p[0]))],
    ...extra,
    build: (p) => fitGroup(build(p), extra.mount ?? 0),
  }
}

// ======================================================================
// 布料软团：单位球按函数变形 + 一点褶皱，接缝处法线取平均
// ======================================================================

function smoothNormals(geo: THREE.BufferGeometry) {
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

/** 超椭球坐垫：w × h × d，底在 y = 0；e 越小越方，puff 为中间鼓起的比例 */
function cushionFn(w: number, h: number, d: number, e = 0.35, puff = 0.12): SoftFn {
  const sp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e)
  return (x, y, z) => {
    const sx = sp(x)
    const sy = sp(y)
    const sz = sp(z)
    const bul = 1 + puff * (1 - sx * sx) * (1 - sz * sz)
    return [(sx * w) / 2, h / 2 + ((sy * h) / 2) * (sy > 0 ? bul : 1), (sz * d) / 2]
  }
}

// ======================================================================
// 伞架（并入 umbrella-stand 系列）
// ======================================================================

/** 合拢的长柄伞：原点在伞尖底端，沿 +y；顶部是 J 形弯柄（向 +x 弯） */
function longUmb(canopy: string, handle: string, len = 84) {
  const g = new THREE.Group()
  g.add(cyl(0.45, 0.45, 5, '#4a4446', {}, 6))
  g.add(cyl(2.7, 0.6, 50, canopy, { y: 4 }, 12))
  g.add(cyl(1.1, 2.7, 3, canopy, { y: 54 }, 12))
  // 收伞的魔术贴带
  g.add(torus(2.05, 0.45, shade(canopy, -0.15), { y: 36, rx: PI / 2 }))
  g.add(cyl(0.5, 0.5, len - 66, '#8d9096', { y: 56.5 }, 6))
  g.add(cyl(1.05, 1.05, 10, handle, { y: len - 10 }, 10))
  g.add(torus(2.6, 1.05, handle, { x: 2.6, y: len }, PI))
  return g
}
/** 折叠伞（伞面卷好、带扣带）：原点在底部，高约 27 */
function foldUmb(canopy: string, handle: string) {
  const g = new THREE.Group()
  g.add(cyl(2.2, 1.6, 2, canopy, {}, 12))
  g.add(cyl(2.3, 2.2, 18, canopy, { y: 2 }, 12))
  g.add(torus(2.3, 0.4, shade(canopy, -0.18), { y: 12, rx: PI / 2 }))
  g.add(cyl(1.3, 1.3, 7, handle, { y: 20 }, 10))
  g.add(torus(0.9, 0.25, '#4a4446', { y: 27.2 }))
  return g
}
/** 把伞插进容器：伞尖放在 (x, y, z)，向 (dx, dz) 方向倾斜 tilt 弧度，绕自身转 spin */
function plant(u: THREE.Group, x: number, y: number, z: number, tilt: number, dirA: number, spin = 0) {
  const q = new THREE.Group()
  u.rotation.y = spin
  q.add(u)
  q.position.set(x, y, z)
  // 绕水平轴 (sin, 0, -cos) 倾斜：顶端朝 (cos dirA, sin dirA) 方向
  q.rotation.set(Math.sin(dirA) * tilt, 0, -Math.cos(dirA) * tilt)
  return q
}

/** 陶瓷圆筒：腰部略鼓、口沿外翻，上釉的色带 [筒, 釉带, 伞 1, 伞 2] */
function umbCeramic(p: string[]) {
  const [body, band, u1, u2] = p
  const outer: [number, number][] = [
    [9.5, 0],
    [10.5, 1],
    [12.4, 10],
    [12.9, 26],
    [12, 42],
    [10.8, 50],
    [11.6, 53],
  ]
  const g = G(vessel(outer, 1.2, body))
  for (const y of [44, 47]) g.add(torus(rAt(outer, y) + 0.05, 0.45, band, { y, rx: PI / 2 }))
  g.add(torus(rAt(outer, 8) + 0.05, 0.6, shade(body, -0.12), { y: 8, rx: PI / 2 }))
  g.add(plant(longUmb(u1, C.woodD), -3, 1.2, 1, 0.06, PI - 0.3))
  g.add(plant(longUmb(u2, '#3a3436', 80), 3, 1.2, -1.5, 0.05, -0.3, PI))
  return g
}

/** 金属网格方筒：四根立柱 + 三道方框 + 细网格，底下接水盘 [框, 接水盘, 伞] */
function umbMesh(p: string[]) {
  const [frame, base, u1] = p
  const g = new THREE.Group()
  const s = 11
  const H = 50
  g.add(tray(23.4, 2, 23.4, 0.8, base, {}, 0.3))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.65, 0.65, H, frame, { x: sx * s, z: sz * s }, 8))
  for (const y of [2.5, 25, H - 0.7]) {
    for (const sz of [-1, 1]) g.add(bar([-s, y, sz * s], [s, y, sz * s], 0.45, frame, 6))
    for (const sx of [-1, 1]) g.add(bar([sx * s, y, -s], [sx * s, y, s], 0.45, frame, 6))
  }
  // 细网：竖线在面上，横线外移 0.3 不和竖线共面
  for (let k = -3; k <= 3; k++) {
    const v = k * 2.75
    for (const sz of [-1, 1]) g.add(bar([v, 2.5, sz * s], [v, H - 0.7, sz * s], 0.18, frame, 5))
    for (const sx of [-1, 1]) g.add(bar([sx * s, 2.5, v], [sx * s, H - 0.7, v], 0.18, frame, 5))
  }
  for (let y = 7.5; y < H - 3; y += 5) {
    for (const sz of [-1, 1]) g.add(bar([-s, y, sz * (s + 0.3)], [s, y, sz * (s + 0.3)], 0.18, frame, 5))
    for (const sx of [-1, 1]) g.add(bar([sx * (s + 0.3), y, -s], [sx * (s + 0.3), y, s], 0.18, frame, 5))
  }
  g.add(plant(longUmb(u1, '#3a3436'), 1, 0.8, 1, 0.09, 3.6))
  return g
}

/** 木质格栅：四腿 + 四面竖条 + 顶板开四个圆孔（伞从孔里插下去）+ 金属接水盘 [木, 接水盘, 伞 1, 伞 2] */
function umbSlat(p: string[]) {
  const [wood, pan, u1, u2] = p
  const g = new THREE.Group()
  const s = 11.5
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, 53, 3, wood, { x: sx * s, z: sz * s }, 0.6))
  for (let k = -2; k <= 2; k++) {
    const v = k * 4.2
    for (const sz of [-1, 1]) g.add(rbox(2.2, 44, 1.2, wood, { x: v, y: 6, z: sz * (s + 0.4) }, 0.3))
    for (const sx of [-1, 1]) g.add(rbox(1.2, 44, 2.2, wood, { x: sx * (s + 0.4), y: 6, z: v }, 0.3))
  }
  // 下框（托接水盘）
  for (const sz of [-1, 1]) g.add(rbox(20, 2.4, 1.6, shade(wood, -0.06), { y: 3.4, z: sz * (s - 0.6) }, 0.3))
  for (const sx of [-1, 1]) g.add(rbox(1.6, 2.4, 20, shade(wood, -0.06), { x: sx * (s - 0.6), y: 3.4 }, 0.3))
  g.add(tray(20.4, 2.4, 20.4, 0.6, pan, { y: 5.8 }, 0.25))
  // 顶板：2 × 2 圆孔
  const holes = [-6, 6].flatMap((x) => [7, 19].map((y) => ({ kind: 'circle' as const, x, y, r: 4.2 })))
  g.add(holePanel(26, 26, 2, wood, holes, { y: 54, z: 13, rx: -PI / 2 }, 1.5))
  g.add(plant(longUmb(u1, C.woodD), -6, 6.4, 6, 0.03, 0.8))
  g.add(plant(longUmb(u2, '#3a3436', 80), 6, 6.4, -6, 0.03, 3.9, PI * 0.8))
  return g
}

/** 磁吸细架：吸在玄关门 / 铁墙上的细背板 + 上下两个半圆伞圈 + 地上的小接水盒 [架, 接水盒, 伞] */
function umbMagnet(p: string[]) {
  const [body, box, u1] = p
  const g = new THREE.Group()
  const zb = -4.4
  g.add(rbox(4.6, 50, 1.2, body, { y: 3, z: zb + 0.6 }, 0.4))
  // 背面的磁铁块
  for (const y of [10, 44]) g.add(rbox(3.6, 3.6, 0.6, '#3a3a3c', { y, z: zb - 0.2 }, 0.2))
  for (const y of [30, 50]) {
    g.add(torus(6, 0.45, body, { y, z: zb + 1.2, rx: PI / 2 }, PI))
  }
  g.add(tray(16, 3.2, 9.6, 0.6, box, { z: -0.4 }, 0.3))
  g.add(plant(longUmb(u1, C.woodD), 0, 0.6, -0.4, 0, 0))
  return g
}

/** 可折叠伞架：两侧 X 形折叠腿 + 顶框，挂一只帆布筒袋，地上接水盘 [框, 布, 接水盘, 伞 1, 伞 2] */
function umbFold(p: string[]) {
  const [frame, cloth, pan, u1, u2] = p
  const g = new THREE.Group()
  const hx = 12
  const hz = 9
  const top = 48
  g.add(tray(26, 2, 20, 0.6, pan, {}, 0.3))
  for (const sx of [-1, 1]) {
    g.add(bar([sx * hx, 2, -hz], [sx * hx, top, hz], 0.6, frame))
    g.add(bar([sx * hx, 2, hz], [sx * hx, top, -hz], 0.6, frame))
    g.add(ball(0.9, frame, { x: sx * hx, y: (top + 2) / 2 }))
  }
  for (const sz of [-1, 1]) g.add(bar([-hx, top, sz * hz], [hx, top, sz * hz], 0.6, frame))
  for (const sx of [-1, 1]) g.add(bar([sx * hx, top, -hz], [sx * hx, top, hz], 0.6, frame))
  // 帆布筒袋：上口翻折包住顶框
  g.add(shell(22.6, 40, 16.6, 0.5, cloth, { top: false }))
  g.children[g.children.length - 1].position.y = 7
  const hem = shell(24.4, 3, 18.4, 0.6, shade(cloth, -0.1), { top: false, bottom: false })
  hem.position.y = top - 2.2
  g.add(hem)
  g.add(plant(longUmb(u1, C.woodD), -4, 7.5, 2, 0.06, PI - 0.3))
  g.add(plant(longUmb(u2, '#3a3436', 80), 4, 7.5, -2, 0.06, -0.2, PI))
  return g
}

/** 和风竹筒：粗竹一节（空心）坐在木台上，竹节一圈 [竹, 木台, 伞 1, 伞 2] */
function umbBamboo(p: string[]) {
  const [bam, base, u1, u2] = p
  const g = new THREE.Group()
  g.add(rbox(24, 3, 24, base, {}, 1))
  g.add(cup(9.5, 9.5, 54, 1.3, bam, { y: 3 }))
  for (const y of [21, 41]) {
    g.add(torus(9.6, 0.55, shade(bam, -0.12), { y, rx: PI / 2 }))
    g.add(torus(9.75, 0.25, shade(bam, 0.12), { y: y + 1.2, rx: PI / 2 }))
  }
  // 麻绳绑一圈
  for (const y of [49, 50.2]) g.add(torus(9.65, 0.35, '#c9b48a', { y, rx: PI / 2 }))
  g.add(plant(longUmb(u1, J.dark, 86), -2.5, 4.3, 1.5, 0.04, PI))
  g.add(plant(longUmb(u2, J.dark, 82), 2.5, 4.3, -1.5, 0.04, 0, PI))
  return g
}

/** 带接水托盘的铸铁筒：三只小脚坐在圆托盘里，筒身两道装饰箍 [铸铁, 托盘, 伞 1, 伞 2] */
function umbCastIron(p: string[]) {
  const [iron, pan, u1, u2] = p
  const g = new THREE.Group()
  g.add(cup(15.5, 14.5, 3.2, 0.8, pan))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 6
    g.add(ball(1.6, iron, { x: Math.cos(a) * 7.5, y: 2.4, z: Math.sin(a) * 7.5 }, [1, 1, 1]))
  }
  const outer: [number, number][] = [
    [8.6, 0],
    [9.6, 1],
    [9.6, 4],
    [8.4, 6],
    [8.4, 44],
    [9.8, 47],
    [10.4, 50],
  ]
  const body = vessel(outer, 1, iron)
  body.position.y = 3.2
  g.add(body)
  for (const y of [16, 34]) {
    g.add(torus(8.5, 0.55, shade(iron, 0.1), { y: y + 3.2, rx: PI / 2 }))
    g.add(torus(8.5, 0.35, shade(iron, 0.1), { y: y + 4.8, rx: PI / 2 }))
  }
  g.add(plant(longUmb(u1, C.woodD), -2, 4.3, 1.5, 0.04, PI))
  g.add(plant(longUmb(u2, '#3a3436', 80), 2.5, 4.3, -1.5, 0.04, 0, PI))
  return g
}

/** 插着伞的款：圆筒里两把长柄伞，侧面挂的小筒里插一把折叠伞 [筒, 小筒, 长伞 1, 长伞 2, 折叠伞] */
function umbWith(p: string[]) {
  const [body, pocket, u1, u2, u3] = p
  const g = new THREE.Group()
  g.add(cup(12, 11, 42, 1.2, body))
  g.add(torus(11.75, 0.5, shade(body, -0.12), { y: 6, rx: PI / 2 }))
  // 侧挂小筒：挂钩搭在口沿上
  g.add(cup(4.6, 4.2, 14, 0.6, pocket, { x: 16.4, y: 26 }))
  g.add(bar([12.6, 39.6, 0], [12.6, 43.2, 0], 0.4, pocket), bar([12.6, 43.2, 0], [10.1, 43.2, 0], 0.4, pocket), bar([10.1, 43.2, 0], [10.1, 39, 0], 0.4, pocket))
  g.add(plant(longUmb(u1, C.woodD), -3, 1.2, 2, 0.08, PI - 0.3))
  g.add(plant(longUmb(u2, '#3a3436', 80), 3, 1.2, -2.5, 0.08, -0.3, PI))
  g.add(plant(foldUmb(u3, '#3a3436'), 16.4, 26.6, 0, 0.06, PI / 2))
  return g
}

/** 杆式伞架：底座接水盘 + 中心立杆 + 顶上带三个孔的圆托 [金属, 底盘, 伞 1, 伞 2] */
function umbPole(p: string[]) {
  const [metal, base, u1, u2] = p
  const g = new THREE.Group()
  g.add(cup(14, 14, 3, 0.8, base))
  g.add(cyl(0.9, 0.9, 57, metal, { y: 0.8 }, 12))
  const holes = [0, 1, 2].map((k) => {
    const a = (k / 3) * PI * 2 + PI / 2
    return { kind: 'circle' as const, x: Math.cos(a) * 6.5, y: 11 + Math.sin(a) * 6.5, r: 3.6 }
  })
  g.add(holePanel(22, 22, 1.2, metal, holes, { y: 58, z: 11, rx: -PI / 2 }, 11))
  g.add(cyl(1.6, 1.6, 2, metal, { y: 57 }, 12))
  // 孔 0（a = 90°）在 z = 11 - (11 + 6.5) = -6.5；孔 1、2 在前左 / 前右
  const at = (k: number) => {
    const a = (k / 3) * PI * 2 + PI / 2
    return [Math.cos(a) * 6.5, -Math.sin(a) * 6.5] as const
  }
  const [x0, z0] = at(0)
  const [x1, z1] = at(1)
  g.add(plant(longUmb(u1, C.woodD), x0, 0.8, z0, 0, 0))
  g.add(plant(longUmb(u2, '#3a3436', 80), x1, 0.8, z1, 0, 0, PI * 0.7))
  return g
}

const UMB_CERAMIC: Pal[] = [
  ['japanese', [J.washi, J.ai, J.shu, J.sumi]],
  ['nordic', [N.white, N.blue, N.mustard, N.gray]],
  ['modern', [M.char, M.silver, M.black, M.light]],
  ['retro', [R.teal, R.cream, R.orange, R.mustard]],
  ['cute', [C.sakura, C.white, C.sky, C.lemon]],
]
const UMB_MESH: Pal[] = [
  ['industrial', [I.iron, I.steel, I.rust]],
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.black, M.char, M.silver]],
  ['nordic', [N.white, N.oak, N.sage]],
  ['cute', [C.mint, C.white, C.pink]],
]
const UMB_SLAT: Pal[] = [
  ['nordic', [N.oak, M.silver, N.blue, N.mustard]],
  ['japanese', [J.hinoki, J.sumi, J.ai, J.shu]],
  ['industrial', [I.walnut, I.iron, I.rust, I.concrete]],
  ['retro', [R.caramel, R.cream, R.teal, R.red]],
]
const UMB_MAGNET: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.black, M.char, M.light]],
  ['nordic', [N.white, N.oak, N.sage]],
  ['industrial', [I.iron, I.steel, I.leather]],
]
const UMB_FOLD: Pal[] = [
  ['nordic', [N.oak, N.linen, M.silver, N.blue, N.mustard]],
  ['industrial', [I.iron, '#8a8a6a', I.steel, I.rust, I.concrete]],
  ['modern', [M.char, M.light, M.silver, M.black, M.white]],
  ['cute', [C.white, C.sakura, C.white, C.sky, C.lemon]],
]
const UMB_BAMBOO: Pal[] = [
  ['japanese', ['#b9b56a', J.dark, J.shu, J.ai]],
  ['japanese', ['#d8c48e', J.wood, J.sumi, J.washi]],
  ['nordic', ['#c8c48a', N.oak, N.blue, N.sage]],
]
const UMB_IRON: Pal[] = [
  ['industrial', [I.iron, I.steel, I.rust, I.concrete]],
  ['retro', ['#3f5b52', R.caramel, R.red, R.mustard]],
  ['modern', [M.black, M.char, M.silver, M.light]],
  ['japanese', [J.sumi, J.dark, J.shu, J.washi]],
]
const UMB_WITH: Pal[] = [
  ['cute', [C.white, C.sakura, C.pink, C.sky, C.lemon]],
  ['nordic', [N.linen, N.oak, N.blue, N.mustard, N.sage]],
  ['modern', [M.char, M.gray, M.black, M.light, M.silver]],
  ['retro', [R.cream, R.teal, R.orange, R.red, R.mustard]],
  ['industrial', [I.concrete, I.iron, I.leather, I.rust, I.steel]],
]
const UMB_POLE: Pal[] = [
  ['modern', [CHROME, M.black, M.char, M.light]],
  ['industrial', [I.iron, I.iron, I.rust, I.concrete]],
  ['retro', [BRASS, R.caramel, R.red, R.teal]],
  ['nordic', [M.white, N.oak, N.blue, N.mustard]],
]

const UMB = (sizeLabel: string) => ({ family: 'umbrella-stand', sizeLabel })

export const MV_UMBRELLA: AssetDef[] = [
  A('mv-umb-ceramic', '伞架', 'entrance', [25.8, 25.8, 88.8], UMB_CERAMIC, umbCeramic, UMB('陶瓷圆筒')),
  A('mv-umb-mesh', '伞架', 'entrance', [23.4, 23.4, 88.3], UMB_MESH, umbMesh, UMB('金属网格方筒')),
  A('mv-umb-slat', '伞架', 'entrance', [26, 26, 94], UMB_SLAT, umbSlat, UMB('木质格栅')),
  A('mv-umb-magnet', '伞架', 'entrance', [16, 9.6, 88.3], UMB_MAGNET, umbMagnet, UMB('磁吸细架（贴门边）')),
  A('mv-umb-fold', '伞架', 'entrance', [26, 20, 95.1], UMB_FOLD, umbFold, UMB('可折叠')),
  A('mv-umb-bamboo', '伞架', 'entrance', [24, 24, 94], UMB_BAMBOO, umbBamboo, UMB('和风竹筒')),
  A('mv-umb-castiron', '伞架', 'entrance', [31, 31, 92], UMB_IRON, umbCastIron, UMB('铸铁 · 带接水托盘')),
  A('mv-umb-with', '伞架', 'entrance', [33.2, 24.4, 88.8], UMB_WITH, umbWith, UMB('圆筒 · 插着长柄伞和折叠伞')),
  A('mv-umb-pole', '伞架', 'entrance', [28, 28, 88.5], UMB_POLE, umbPole, UMB('杆式三孔')),
]

// ======================================================================
// 懒人沙发（并入 beanbag 系列）
// ======================================================================

/** 球面点的经向分量 */
const dirOf = (x: number, z: number): [number, number] => {
  const q = Math.hypot(x, z)
  return q > 1e-6 ? [x / q, z / q] : [0, 0]
}

/** 水滴形：底部饱满、顶端尖并往后倒，前面坐出一个浅窝；顶上一个提手 [布, 提手] */
const dropF: SoftFn = (x, y, z) => {
  const t = (y + 1) / 2
  const [c, s] = dirOf(x, z)
  let r = 38 * Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.8)
  r *= 1 - 0.16 * Math.exp(-(((t - 0.6) / 0.13) ** 2)) * Math.max(0, s) ** 2
  return [c * r, Math.max(0, 112 * t - 20), s * r - 16 * t ** 3]
}
function beanDrop(p: string[]) {
  const [cloth, acc] = p
  return G(soft(cloth, dropF, { wrinkle: 0.9, seed: 2 }), torus(4, 0.9, acc, { y: 90.5, z: -15.6, ry: PI / 2 }, PI))
}

/** 可变形大豆袋（坐下凹陷形态）：中间被坐出深窝，后背鼓起，四周的布往外溢 */
const sunkF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 34
  if (y > 0) Y -= 26 * Math.exp(-((x / 0.5) ** 2 + ((z - 0.2) / 0.5) ** 2)) * y
  if (z < 0) Y += 30 * z * z * Math.max(0, y)
  return [x * 52 * (1 + 0.06 * Math.max(0, -y)), Math.max(0, Y - 8), z * 50 * (1 + 0.06 * Math.max(0, -y))]
}
function beanSunk(p: string[]) {
  const [cloth, acc] = p
  const g = G(soft(cloth, sunkF, { wrinkle: 1.3, freq: 1.3, seed: 5 }))
  // 侧面的拉手
  g.add(torus(3.5, 0.8, acc, { x: 51.8, y: 24, rz: -PI / 2 }, PI))
  return g
}

/** 猫耳款：圆胖的身子 + 头顶一对三角耳 + 背后一条尾巴（家具不加脸） [布, 耳内] */
const catF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 32
  if (y > 0) Y -= 12 * Math.exp(-((x / 0.5) ** 2 + ((z - 0.2) / 0.5) ** 2)) * y
  if (z < 0) Y += 16 * z * z * Math.max(0, y)
  return [x * 38, Math.max(0, Y - 6), z * 36]
}
function beanCat(p: string[]) {
  const [cloth, inner] = p
  const g = G(soft(cloth, catF, { wrinkle: 0.6, seed: 3 }))
  for (const s of [-1, 1]) {
    const ear = new THREE.Group()
    ear.add(cyl(0.5, 9.5, 17, cloth, { ry: PI }, 3))
    ear.add(cyl(0.4, 6, 12, inner, { z: 2.2, ry: PI }, 3))
    ear.position.set(s * 17, 51.5, -15)
    ear.rotation.set(-0.25, 0, -s * 0.28)
    g.add(ear)
  }
  g.add(tube([[6, 10, -33], [14, 12, -40], [22, 24, -40], [20, 36, -36], [14, 40, -35]], 2.6, cloth, { ...TUBE, seg: 24, radial: 8 }))
  g.add(ball(2.8, inner, { x: 14, y: 40, z: -35 }))
  return g
}

/** 带靠背的地板沙发：厚坐垫 + 往后倒的靠背垫 + 两侧圆枕扶手，拉扣点 [布, 扣] */
function beanFloor(p: string[]) {
  const [cloth, btn] = p
  const g = new THREE.Group()
  const sw = 104
  const sd = 70
  const sh = 18
  const seat = soft(cloth, cushionFn(sw, sh, sd, 0.35, 0.14), { wrinkle: 0.5, seed: 7 })
  seat.position.z = 8
  g.add(seat)
  const back = soft(cloth, cushionFn(sw, 54, 16, 0.4, 0.16), { wrinkle: 0.5, seed: 8 })
  const bk = new THREE.Group()
  bk.add(back)
  bk.position.set(0, 12, -22)
  bk.rotation.x = -0.32
  g.add(bk)
  for (const s of [-1, 1]) {
    const arm = soft(cloth, cushionFn(16, 30, 74, 0.55, 0.1), { wrinkle: 0.4, seed: 9 + s })
    arm.position.set(s * (sw / 2 + 4), 0, 4)
    g.add(arm)
  }
  // 拉扣：坐垫顶面
  const topY = (X: number, Z: number) => (sh / 2) * (2 + 0.14 * (1 - (X / (sw / 2)) ** 2) * (1 - (Z / (sd / 2)) ** 2))
  for (const X of [-30, 0, 30]) for (const Z of [-12, 12]) g.add(ball(1.3, btn, { x: X, y: topY(X, Z) - 0.4, z: Z + 8 }, [1, 0.6, 1]))
  return g
}

/** 毛绒长毛款：圆墩墩的团子，表面是很密的小起伏（长毛） */
const shagF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 31
  if (y > 0) Y -= 10 * Math.exp(-((x / 0.55) ** 2 + ((z - 0.15) / 0.55) ** 2)) * y
  return [x * 36, Math.max(0, Y - 6), z * 36]
}
function beanShag(p: string[]) {
  const [fur] = p
  return G(soft(fur, shagF, { wrinkle: 1.2, freq: 4.5, seed: 11, seg: [96, 64] }))
}

/** 户外防水款：前低后高的楔形，后背顶上提手、两侧织带环，底下一层耐磨底布 [布, 织带] */
const outF = (x: number, y: number, z: number): V3 => {
  const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e)
  const sx = sp(x, 0.45)
  const sy = sp(y, 0.45)
  const sz = sp(z, 0.45)
  const H = 28 + 40 * Math.pow((1 - sz) / 2, 1.6)
  return [sx * 40, ((sy + 1) / 2) * H, sz * 50]
}
function beanOutdoor(p: string[]) {
  const [cloth, strap] = p
  const g = G(soft(cloth, outF, { wrinkle: 0.5, seed: 13 }))
  g.add(soft(shade(cloth, -0.18), cushionFn(80.6, 6, 100.6, 0.3, 0), { wrinkle: 0 }))
  g.add(torus(6, 1.1, strap, { y: 57.5, z: -44 }, PI))
  for (const s of [-1, 1]) g.add(torus(3, 0.7, strap, { x: s * 39.8, y: 18, z: 10, rz: (-s * PI) / 2 }, PI))
  return g
}

/** 儿童小号：小水滴团子 + 一圈圆点（小鼓包）+ 提手 [布, 圆点] */
const kidF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 26
  if (y > 0) Y -= 7 * Math.exp(-((x / 0.5) ** 2 + ((z - 0.25) / 0.5) ** 2)) * y
  if (z < 0) Y += 9 * z * z * Math.max(0, y)
  return [x * 23, Math.max(0, Y - 4), z * 23]
}
function beanKid(p: string[]) {
  const [cloth, dot] = p
  const g = G(soft(cloth, kidF, { wrinkle: 0.4, seed: 17 }))
  // 圆点按黄金角撒在上部（底下贴地的一圈不放）
  for (let k = 0; k < 18; k++) {
    const y = 0.85 - (k / 17) * 1.2
    const yaw = k * 2.39996
    const q = Math.sqrt(1 - y * y)
    const [X, Y, Z] = kidF(Math.cos(yaw) * q, y, Math.sin(yaw) * q)
    g.add(ball(1.7, dot, { x: X, y: Y, z: Z }))
  }
  const [, ty, tz] = kidF(0, 0.92, -0.39)
  g.add(torus(3, 0.7, dot, { y: ty - 0.6, z: tz, ry: PI / 2 }, PI))
  return g
}

/** 两人位超大款：一大张软团，坐出两个窝 [布, 拉手] */
const duoF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 33
  if (y > 0) for (const cx of [-0.42, 0.42]) Y -= 18 * Math.exp(-(((x - cx) / 0.3) ** 2 + ((z - 0.2) / 0.5) ** 2)) * y
  if (z < 0) Y += 22 * z * z * Math.max(0, y)
  return [x * 76, Math.max(0, Y - 8), z * 55]
}
function beanDuo(p: string[]) {
  const [cloth, acc] = p
  const g = G(soft(cloth, duoF, { wrinkle: 1.4, freq: 1.4, seed: 19, seg: [64, 36] }))
  for (const s of [-1, 1]) g.add(torus(3.6, 0.8, acc, { x: s * 75.6, y: 22, rz: (-s * PI) / 2 }, PI))
  return g
}

/** 带脚凳的组合：靠背豆袋 + 前面一只圆脚凳 [布, 脚凳] */
const chairF: SoftFn = (x, y, z) => {
  let Y = (y + 1) * 36
  if (y > 0) Y -= 20 * Math.exp(-((x / 0.5) ** 2 + ((z - 0.25) / 0.5) ** 2)) * y
  if (z < 0) Y += 28 * z * z * Math.max(0, y)
  return [x * 42, Math.max(0, Y - 8), z * 40]
}
const stoolF: SoftFn = (x, y, z) => [x * 25, Math.max(0, (y + 1) * 16 - 4), z * 22]
function beanOttoman(p: string[]) {
  const [cloth, stoolC] = p
  const chair = soft(cloth, chairF, { wrinkle: 1, seed: 23 })
  chair.position.z = -18
  const stool = soft(stoolC, stoolF, { wrinkle: 0.6, seed: 29 })
  stool.position.z = 46
  return G(chair, stool)
}

/** 平铺大枕：一张超大的方枕，后半段塞得更鼓，像斜靠的躺垫 [布, 织标] */
const padF = (x: number, y: number, z: number): V3 => {
  const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e)
  const sx = sp(x, 0.3)
  const sy = sp(y, 0.4)
  const sz = sp(z, 0.3)
  const H = 20 + 34 * Math.pow(Math.max(0, (-sz + 0.1) / 1.1), 2) * (1 - 0.3 * sx * sx)
  return [sx * 62, ((sy + 1) / 2) * H, sz * 85]
}
function beanPad(p: string[]) {
  const [cloth, tag] = p
  const g = G(soft(cloth, padF, { wrinkle: 0.9, seed: 31, seg: [56, 36] }))
  g.add(rbox(6, 4, 1.2, tag, { x: -40, y: 6, z: 85.2 }, 0.4))
  return g
}

const BEAN_A: Pal[] = [
  ['nordic', [N.linen, N.oak]],
  ['modern', [M.char, M.light]],
  ['industrial', [I.leather, I.iron]],
  ['retro', [R.mustard, R.caramel]],
  ['japanese', [J.ai, J.washi]],
]
const BEAN_B: Pal[] = [
  ['nordic', [N.gray, N.mustard]],
  ['modern', [M.light, M.char]],
  ['retro', [R.teal, R.cream]],
  ['cute', [C.lilac, C.white]],
  ['industrial', ['#6f6a5c', I.leather]],
]
const BEAN_CAT: Pal[] = [
  ['cute', [C.white, C.pink]],
  ['nordic', [N.gray, N.linen]],
  ['modern', [M.black, M.gray]],
  ['retro', [R.caramel, R.cream]],
]
const BEAN_FLOOR: Pal[] = [
  ['japanese', [J.tatami, J.dark]],
  ['japanese', [J.ai, J.washi]],
  ['nordic', [N.sage, N.oak]],
  ['modern', [M.gray, M.black]],
  ['industrial', [I.leather, I.iron]],
]
const BEAN_SHAG: Pal[] = [
  ['nordic', ['#efe8da']],
  ['modern', ['#9a9ca1']],
  ['cute', ['#f5cfd6']],
  ['retro', ['#c98f5a']],
  ['modern', ['#2f3034']],
]
const BEAN_OUT: Pal[] = [
  ['industrial', ['#7d7a4e', I.iron]],
  ['nordic', [N.blue, N.white]],
  ['retro', [R.orange, R.cream]],
  ['modern', [M.char, M.silver]],
]
const BEAN_KID: Pal[] = [
  ['cute', [C.sky, C.white]],
  ['cute', [C.lemon, C.pink]],
  ['nordic', [N.sage, N.white]],
  ['retro', [R.red, R.cream]],
]
const BEAN_OTTO: Pal[] = [
  ['nordic', [N.linen, N.sage]],
  ['modern', [M.char, M.gray]],
  ['industrial', [I.leather, I.concrete]],
  ['retro', [R.mustard, R.teal]],
  ['cute', [C.sakura, C.white]],
]
const BEAN_PAD: Pal[] = [
  ['modern', [M.light, M.char]],
  ['nordic', [N.blue, N.mustard]],
  ['industrial', ['#5f6650', I.rust]],
  ['retro', [R.red, R.cream]],
]

const BEAN = (sizeLabel: string) => ({ family: 'beanbag', sizeLabel })

export const MV_BEANBAG: AssetDef[] = [
  A('mv-bean-drop', '懒人沙发', 'living', [76.3, 75.5, 95.4], BEAN_A, beanDrop, BEAN('水滴 · 尖顶提手')),
  A('mv-bean-sunk', '懒人沙发', 'living', [109.1, 101.2, 60.4], BEAN_B, beanSunk, BEAN('可变形大豆袋（坐下凹陷）')),
  A('mv-bean-cat', '懒人沙发', 'living', [75.6, 79.6, 67.5], BEAN_CAT, beanCat, BEAN('猫耳')),
  A('mv-bean-floor', '懒人沙发', 'living', [128.9, 87.9, 68.2], BEAN_FLOOR, beanFloor, BEAN('带靠背地板沙发')),
  A('mv-bean-shag', '懒人沙发', 'living', [75.2, 74.6, 50.7], BEAN_SHAG, beanShag, BEAN('毛绒长毛')),
  A('mv-bean-outdoor', '懒人沙发', 'outdoor', [87, 100.6, 64.6], BEAN_OUT, beanOutdoor, BEAN('户外防水')),
  A('mv-bean-kid', '懒人沙发', 'kids', [47.6, 46.7, 49], BEAN_KID, beanKid, BEAN('儿童小号')),
  A('mv-bean-duo', '懒人沙发', 'living', [160, 110.4, 57.7], BEAN_B, beanDuo, BEAN('两人位超大')),
  A('mv-bean-ottoman', '懒人沙发', 'living', [82.5, 126.2, 64.3], BEAN_OTTO, beanOttoman, BEAN('带脚凳组合')),
  A('mv-bean-pad', '懒人沙发', 'living', [124.5, 171, 45.4], BEAN_PAD, beanPad, BEAN('平铺大枕')),
]

// ======================================================================
// 画面（新画种）
// ======================================================================

function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()

/** 一笔画线描人像：侧脸轮廓 + 闭着的眼睛，背后一团色块 */
function paintFace(ground: string, line: string, accent: string): Draw {
  return (g, W, H) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    g.fillStyle = accent
    g.beginPath()
    g.ellipse(W * 0.6, H * 0.42, W * 0.26, H * 0.2, 0.3, 0, PI * 2)
    g.fill()
    g.strokeStyle = line
    g.lineWidth = Math.max(2, W * 0.012)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const P = (x: number, y: number): [number, number] => [W * x, H * y]
    g.beginPath()
    g.moveTo(...P(0.3, 0.92))
    g.bezierCurveTo(...P(0.34, 0.8), ...P(0.4, 0.72), ...P(0.42, 0.64))
    g.bezierCurveTo(...P(0.46, 0.62), ...P(0.5, 0.62), ...P(0.5, 0.58))
    g.bezierCurveTo(...P(0.49, 0.56), ...P(0.52, 0.55), ...P(0.52, 0.53))
    g.bezierCurveTo(...P(0.5, 0.52), ...P(0.53, 0.5), ...P(0.58, 0.47))
    g.bezierCurveTo(...P(0.54, 0.45), ...P(0.53, 0.42), ...P(0.54, 0.37))
    g.bezierCurveTo(...P(0.55, 0.3), ...P(0.5, 0.2), ...P(0.4, 0.2))
    g.bezierCurveTo(...P(0.26, 0.2), ...P(0.18, 0.32), ...P(0.22, 0.46))
    g.bezierCurveTo(...P(0.25, 0.56), ...P(0.33, 0.5), ...P(0.34, 0.44))
    g.bezierCurveTo(...P(0.35, 0.38), ...P(0.3, 0.4), ...P(0.31, 0.47))
    g.bezierCurveTo(...P(0.32, 0.6), ...P(0.24, 0.7), ...P(0.18, 0.92))
    g.stroke()
    // 闭眼
    g.beginPath()
    g.moveTo(...P(0.45, 0.4))
    g.quadraticCurveTo(...P(0.48, 0.43), ...P(0.51, 0.4))
    g.stroke()
  }
}

/** 包豪斯几何：格子里随机放圆、四分之一圆、三角、半圆、方块 */
function paintGeo(ground: string, a: string, b: string): Draw {
  return (g, W, H) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    const cols = W > H * 1.6 ? 5 : 3
    const rows = Math.max(2, Math.round((cols * H) / W))
    const cw = W / cols
    const ch = H / rows
    const s = Math.min(cw, ch)
    const r = rng(hash(ground + a + b))
    const cs = [a, b, shade(a, -0.22), shade(b, 0.12), shade(ground, -0.3)]
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = i * cw
        const y = j * ch
        const k = Math.floor(r() * 5)
        g.fillStyle = cs[Math.floor(r() * cs.length)]
        g.save()
        g.beginPath()
        g.rect(x, y, cw, ch)
        g.clip()
        g.beginPath()
        if (k === 0) g.arc(x + cw / 2, y + ch / 2, s * 0.42, 0, PI * 2)
        else if (k === 1) {
          const cx = r() < 0.5 ? x : x + cw
          const cy = r() < 0.5 ? y : y + ch
          g.moveTo(cx, cy)
          g.arc(cx, cy, s * 0.95, 0, PI * 2)
        } else if (k === 2) {
          g.moveTo(x, y + ch)
          g.lineTo(x + cw / 2, y)
          g.lineTo(x + cw, y + ch)
        } else if (k === 3) g.arc(x + cw / 2, y + ch, s * 0.48, PI, 0)
        else g.rect(x + cw * 0.18, y + ch * 0.18, cw * 0.64, ch * 0.64)
        g.fill()
        g.restore()
      }
  }
}

/** 字体排版海报：一个大号符号 + 粗横线 + 几行假装是正文的细条（不写可读的品牌） */
function paintType(ground: string, ink: string, accent: string): Draw {
  return (g, W, H) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    g.fillStyle = accent
    g.beginPath()
    g.arc(W * 0.66, H * 0.3, Math.min(W, H) * 0.28, 0, PI * 2)
    g.fill()
    g.fillStyle = ink
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.font = `bold ${Math.round(Math.min(H * 0.5, W * 0.8))}px Georgia, serif`
    g.fillText('&', W * 0.42, H * 0.62)
    g.fillRect(W * 0.08, H * 0.69, W * 0.84, Math.max(2, H * 0.012))
    for (let k = 0; k < 6; k++) g.fillRect(W * 0.08, H * (0.74 + k * 0.035), W * (0.32 + ((k * 37) % 50) / 100), Math.max(1, H * 0.011))
    g.textAlign = 'left'
    g.font = `bold ${Math.round(H * 0.05)}px sans-serif`
    g.fillText('No. 07', W * 0.08, H * 0.09)
  }
}

/** 植物标本：一枝压平的草本，胶带固定，右下角一张手写标签 */
function paintHerb(paper: string, leaf: string, bloom: string): Draw {
  return (g, W, H) => {
    g.fillStyle = paper
    g.fillRect(0, 0, W, H)
    const x0 = W * 0.45
    const y0 = H * 0.86
    const x1 = W * 0.52
    const y1 = H * 0.16
    g.strokeStyle = shade(leaf, -0.2)
    g.lineWidth = Math.max(2, W * 0.012)
    g.beginPath()
    g.moveTo(x0, y0)
    g.bezierCurveTo(W * 0.4, H * 0.6, W * 0.58, H * 0.4, x1, y1)
    g.stroke()
    for (let k = 0; k < 7; k++) {
      const t = 0.12 + k * 0.11
      const px = cubic(x0, W * 0.4, W * 0.58, x1, t)
      const py = cubic(y0, H * 0.6, H * 0.4, y1, t)
      const side = k % 2 ? 1 : -1
      const sz = 1 - t * 0.5
      g.fillStyle = k % 3 ? leaf : shade(leaf, 0.1)
      g.beginPath()
      g.ellipse(px + side * W * 0.1 * sz, py, W * 0.11 * sz, H * 0.024 * sz, -side * 0.55, 0, PI * 2)
      g.fill()
    }
    g.fillStyle = bloom
    for (const [dx, dy] of [
      [0, 0],
      [-0.04, 0.03],
      [0.04, 0.025],
    ]) {
      g.beginPath()
      g.arc(x1 + W * dx, y1 + H * dy, Math.min(W, H) * 0.035, 0, PI * 2)
      g.fill()
    }
    g.globalAlpha = 0.6
    g.fillStyle = '#efe4c4'
    g.fillRect(W * 0.36, H * 0.78, W * 0.2, H * 0.035)
    g.fillRect(W * 0.42, H * 0.46, W * 0.18, H * 0.03)
    g.globalAlpha = 1
    g.fillStyle = '#fffdf5'
    g.fillRect(W * 0.6, H * 0.84, W * 0.32, H * 0.1)
    g.strokeStyle = shade(paper, -0.3)
    g.lineWidth = 1
    g.strokeRect(W * 0.6, H * 0.84, W * 0.32, H * 0.1)
    g.fillStyle = shade(paper, -0.45)
    for (let k = 0; k < 3; k++) g.fillRect(W * 0.63, H * (0.865 + k * 0.025), W * (0.24 - k * 0.05), Math.max(1, H * 0.006))
  }
}

/** 地图：海、几块陆地、经纬线、一条虚线航线和指北针 */
function paintMap(sea: string, land: string, line: string): Draw {
  return (g, W, H) => {
    g.fillStyle = sea
    g.fillRect(0, 0, W, H)
    g.strokeStyle = shade(sea, -0.12)
    g.lineWidth = 1
    for (let k = 1; k < 6; k++) {
      g.beginPath()
      g.moveTo((W * k) / 6, 0)
      g.lineTo((W * k) / 6, H)
      g.moveTo(0, (H * k) / 6)
      g.lineTo(W, (H * k) / 6)
      g.stroke()
    }
    const r = rng(hash(sea + land + line))
    const spots: [number, number, number][] = [
      [0.28, 0.32, 0.2],
      [0.7, 0.28, 0.14],
      [0.62, 0.7, 0.18],
      [0.2, 0.78, 0.09],
    ]
    for (const [cx, cy, rr] of spots) {
      g.fillStyle = land
      g.strokeStyle = shade(land, -0.25)
      g.lineWidth = Math.max(1, W * 0.004)
      g.beginPath()
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * PI * 2
        const R0 = Math.min(W, H) * rr * (0.65 + 0.45 * r())
        const px = W * cx + Math.cos(a) * R0
        const py = H * cy + Math.sin(a) * R0
        if (k) g.lineTo(px, py)
        else g.moveTo(px, py)
      }
      g.closePath()
      g.fill()
      g.stroke()
    }
    g.strokeStyle = line
    g.lineWidth = Math.max(2, W * 0.008)
    g.setLineDash([W * 0.025, W * 0.018])
    g.beginPath()
    g.moveTo(W * 0.28, H * 0.32)
    g.quadraticCurveTo(W * 0.5, H * 0.12, W * 0.7, H * 0.28)
    g.quadraticCurveTo(W * 0.85, H * 0.5, W * 0.62, H * 0.7)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = line
    for (const [x, y] of [
      [0.28, 0.32],
      [0.7, 0.28],
      [0.62, 0.7],
    ]) {
      g.beginPath()
      g.arc(W * x, H * y, Math.min(W, H) * 0.018, 0, PI * 2)
      g.fill()
    }
    // 指北针
    const cx = W * 0.86
    const cy = H * 0.88
    const s = Math.min(W, H) * 0.06
    g.beginPath()
    g.moveTo(cx, cy - s)
    g.lineTo(cx + s * 0.35, cy)
    g.lineTo(cx, cy + s)
    g.lineTo(cx - s * 0.35, cy)
    g.closePath()
    g.fill()
    g.strokeStyle = shade(sea, -0.35)
    g.lineWidth = Math.max(2, W * 0.006)
    g.strokeRect(W * 0.03, H * 0.03, W * 0.94, H * 0.94)
  }
}

/** 浮世绘风的大浪：卷起的浪头、爪子一样的浪花，远处一座雪顶的山 */
function paintWave(paper: string, wave: string, foam: string): Draw {
  return (g, W, H) => {
    g.fillStyle = paper
    g.fillRect(0, 0, W, H)
    // 远山
    g.fillStyle = shade(wave, 0.22)
    g.beginPath()
    g.moveTo(W * 0.5, H * 0.66)
    g.lineTo(W * 0.66, H * 0.44)
    g.lineTo(W * 0.82, H * 0.66)
    g.closePath()
    g.fill()
    g.fillStyle = foam
    g.beginPath()
    g.moveTo(W * 0.66, H * 0.44)
    g.lineTo(W * 0.62, H * 0.5)
    g.lineTo(W * 0.7, H * 0.5)
    g.closePath()
    g.fill()
    // 大浪
    const crest: [number, number, number, number, number, number, number, number] = [0, 0.58, 0.14, 0.2, 0.44, 0.08, 0.58, 0.28]
    g.fillStyle = wave
    g.beginPath()
    g.moveTo(0, H)
    g.lineTo(0, H * crest[1])
    g.bezierCurveTo(W * crest[2], H * crest[3], W * crest[4], H * crest[5], W * crest[6], H * crest[7])
    g.bezierCurveTo(W * 0.63, H * 0.38, W * 0.52, H * 0.44, W * 0.46, H * 0.36)
    g.bezierCurveTo(W * 0.42, H * 0.5, W * 0.52, H * 0.72, W * 0.72, H * 0.74)
    g.bezierCurveTo(W * 0.86, H * 0.76, W * 0.94, H * 0.68, W, H * 0.72)
    g.lineTo(W, H)
    g.closePath()
    g.fill()
    // 浪里的浅色纹
    g.strokeStyle = shade(wave, 0.18)
    g.lineWidth = Math.max(2, W * 0.008)
    for (let k = 1; k < 4; k++) {
      g.beginPath()
      g.moveTo(0, H * (crest[1] + k * 0.09))
      g.bezierCurveTo(W * 0.15, H * (0.3 + k * 0.1), W * 0.35, H * (0.22 + k * 0.1), W * (0.45 - k * 0.02), H * (0.4 + k * 0.08))
      g.stroke()
    }
    // 浪花爪子
    g.fillStyle = foam
    for (let k = 0; k <= 12; k++) {
      const t = 0.25 + (k / 12) * 0.75
      const x = W * cubic(crest[0], crest[2], crest[4], crest[6], t)
      const y = H * cubic(crest[1], crest[3], crest[5], crest[7], t)
      g.beginPath()
      g.arc(x, y, Math.min(W, H) * (0.018 + (k % 3) * 0.006), 0, PI * 2)
      g.fill()
    }
    for (let k = 0; k < 10; k++) {
      g.beginPath()
      g.arc(W * (0.36 + k * 0.03), H * (0.06 + (k % 3) * 0.03), Math.min(W, H) * 0.01, 0, PI * 2)
      g.fill()
    }
    // 近处的小浪
    g.strokeStyle = foam
    for (let k = 0; k < 4; k++) {
      g.beginPath()
      g.arc(W * (0.6 + k * 0.12), H * 0.9, W * 0.05, PI, PI * 1.9)
      g.stroke()
    }
  }
}

/** 水彩：几团半透明的颜色叠在一起，一道横向的湿画晕染 */
function paintWater(ground: string, a: string, b: string): Draw {
  return (g, W, H) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    const r = rng(hash(ground + a + b + 'w'))
    const cs = [a, b, shade(a, 0.15), shade(b, -0.1)]
    g.globalAlpha = 0.35
    for (let k = 0; k < 16; k++) {
      g.fillStyle = cs[k % 4]
      g.beginPath()
      g.arc(W * (0.1 + 0.8 * r()), H * (0.1 + 0.7 * r()), Math.min(W, H) * (0.08 + 0.18 * r()), 0, PI * 2)
      g.fill()
    }
    g.globalAlpha = 0.45
    g.fillStyle = b
    g.fillRect(0, H * 0.7, W, H * 0.05)
    g.fillStyle = a
    g.fillRect(0, H * 0.78, W, H * 0.02)
    g.globalAlpha = 1
  }
}

/** 黑白摄影：渐变的天、水平线、一棵孤树和它的倒影，四角压暗 */
function paintBW(light: string, dark: string, mid: string): Draw {
  return (g, W, H) => {
    for (let k = 0; k < 12; k++) {
      g.fillStyle = mix(mid, light, k / 11)
      g.fillRect(0, (H * 0.62 * k) / 12, W, (H * 0.62) / 12 + 1)
    }
    g.fillStyle = mix(light, mid, 0.35)
    g.fillRect(0, H * 0.62, W, H * 0.38)
    g.fillStyle = dark
    g.fillRect(0, H * 0.615, W, Math.max(1, H * 0.006))
    // 孤树
    const tx = W * 0.64
    g.fillRect(tx - W * 0.008, H * 0.42, W * 0.016, H * 0.2)
    for (const [dx, dy, rr] of [
      [0, 0.36, 0.09],
      [-0.06, 0.4, 0.06],
      [0.06, 0.41, 0.065],
    ]) {
      g.beginPath()
      g.arc(tx + W * dx, H * dy, Math.min(W, H) * rr, 0, PI * 2)
      g.fill()
    }
    g.globalAlpha = 0.35
    g.fillRect(tx - W * 0.008, H * 0.62, W * 0.016, H * 0.14)
    g.beginPath()
    g.arc(tx, H * 0.84, Math.min(W, H) * 0.08, 0, PI * 2)
    g.fill()
    g.globalAlpha = 0.18
    const v = Math.min(W, H) * 0.12
    g.fillRect(0, 0, W, v * 0.4)
    g.fillRect(0, H - v * 0.4, W, v * 0.4)
    g.fillRect(0, 0, v * 0.4, H)
    g.fillRect(W - v * 0.4, 0, v * 0.4, H)
    g.globalAlpha = 1
  }
}

/** 儿童涂鸦：蜡笔太阳、房子、两个火柴人、草地和一颗心 */
function paintKid(paper: string, a: string, b: string): Draw {
  return (g, W, H) => {
    g.fillStyle = paper
    g.fillRect(0, 0, W, H)
    const lw = Math.max(2, Math.min(W, H) * 0.022)
    g.lineWidth = lw
    g.lineCap = 'round'
    g.lineJoin = 'round'
    // 太阳
    g.fillStyle = '#f6c445'
    g.strokeStyle = '#f0a020'
    g.beginPath()
    g.arc(W * 0.8, H * 0.17, Math.min(W, H) * 0.09, 0, PI * 2)
    g.fill()
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * PI * 2
      const r0 = Math.min(W, H) * 0.12
      g.beginPath()
      g.moveTo(W * 0.8 + Math.cos(an) * r0, H * 0.17 + Math.sin(an) * r0)
      g.lineTo(W * 0.8 + Math.cos(an) * r0 * 1.5, H * 0.17 + Math.sin(an) * r0 * 1.5)
      g.stroke()
    }
    // 房子
    g.strokeStyle = a
    g.strokeRect(W * 0.12, H * 0.48, W * 0.36, H * 0.3)
    g.fillStyle = b
    g.beginPath()
    g.moveTo(W * 0.08, H * 0.5)
    g.lineTo(W * 0.3, H * 0.3)
    g.lineTo(W * 0.52, H * 0.5)
    g.closePath()
    g.fill()
    g.strokeRect(W * 0.26, H * 0.62, W * 0.08, H * 0.16)
    g.strokeRect(W * 0.16, H * 0.54, W * 0.07, H * 0.06)
    // 火柴人
    g.strokeStyle = '#4a4a5a'
    for (const [x, s] of [
      [0.66, 1],
      [0.8, 0.75],
    ]) {
      const hx = W * x
      const top = H * (0.86 - 0.32 * s)
      const hr = Math.min(W, H) * 0.04 * s
      g.beginPath()
      g.arc(hx, top + hr, hr, 0, PI * 2)
      g.moveTo(hx, top + hr * 2)
      g.lineTo(hx, H * (0.86 - 0.1 * s))
      g.lineTo(hx - W * 0.04 * s, H * 0.86)
      g.moveTo(hx, H * (0.86 - 0.1 * s))
      g.lineTo(hx + W * 0.04 * s, H * 0.86)
      g.moveTo(hx - W * 0.05 * s, top + hr * 3)
      g.lineTo(hx + W * 0.05 * s, top + hr * 2.4)
      g.stroke()
    }
    // 草地
    g.strokeStyle = '#5bb85d'
    g.beginPath()
    g.moveTo(0, H * 0.88)
    for (let k = 1; k <= 20; k++) g.lineTo((W * k) / 20, H * (k % 2 ? 0.84 : 0.88))
    g.stroke()
    // 心
    g.fillStyle = '#ef5b6b'
    const hx = W * 0.58
    const hy = H * 0.22
    const s = Math.min(W, H) * 0.05
    g.beginPath()
    g.moveTo(hx, hy + s)
    g.bezierCurveTo(hx - s * 1.6, hy - s * 0.2, hx - s * 0.5, hy - s * 1.2, hx, hy - s * 0.3)
    g.bezierCurveTo(hx + s * 0.5, hy - s * 1.2, hx + s * 1.6, hy - s * 0.2, hx, hy + s)
    g.fill()
  }
}

/** 人像照片：纯色背景前的半身像剪影 */
function paintPortrait(bg: string, shirt: string, hair: string): Draw {
  return (g, W, H) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = shirt
    g.beginPath()
    g.ellipse(W * 0.5, H * 1.02, W * 0.42, H * 0.36, 0, 0, PI * 2)
    g.fill()
    g.fillStyle = '#f2d2b8'
    g.fillRect(W * 0.44, H * 0.52, W * 0.12, H * 0.16)
    g.beginPath()
    g.ellipse(W * 0.5, H * 0.42, W * 0.17, H * 0.16, 0, 0, PI * 2)
    g.fill()
    g.fillStyle = hair
    g.beginPath()
    g.ellipse(W * 0.5, H * 0.36, W * 0.19, H * 0.13, 0, PI, PI * 2)
    g.fill()
  }
}

type PicKind = 'land' | 'flower' | 'abstract' | 'face' | 'geo' | 'type' | 'herb' | 'map' | 'wave' | 'water' | 'bw' | 'kid' | 'portrait'
function drawOf(kind: PicKind, a: string, b: string, c: string): Draw {
  switch (kind) {
    case 'land':
      return paintLandscape(a, b, c)
    case 'flower':
      return paintFlower(a, b, c)
    case 'abstract':
      return paintAbstract(a, b, c)
    case 'face':
      return paintFace(a, b, c)
    case 'geo':
      return paintGeo(a, b, c)
    case 'type':
      return paintType(a, b, c)
    case 'herb':
      return paintHerb(a, b, c)
    case 'map':
      return paintMap(a, b, c)
    case 'wave':
      return paintWave(a, b, c)
    case 'water':
      return paintWater(a, b, c)
    case 'bw':
      return paintBW(a, b, c)
    case 'kid':
      return paintKid(a, b, c)
    case 'portrait':
      return paintPortrait(a, b, c)
  }
}
/** 每种画面的三种颜色 */
const PIC: Record<string, [PicKind, string, string, string]> = {
  herbN: ['herb', '#f3ecdc', '#7d9a72', '#d9a441'],
  herbC: ['herb', '#fbf4ea', '#8fbf8a', '#f2a7b8'],
  faceN: ['face', '#f2eee6', '#3a3a3c', '#e9c9a8'],
  faceM: ['face', '#f4f4f2', '#24252a', '#d7d8db'],
  faceR: ['face', '#f4e7c8', '#7a3e22', '#e2702f'],
  waveJ: ['wave', '#efe2c4', '#2f4f7a', '#f6f0e1'],
  waveM: ['wave', '#e9e7e2', '#3d3f44', '#ffffff'],
  waterC: ['water', '#fdf8f4', '#f4a9c0', '#a8d4f4'],
  waterN: ['water', '#f7f5f0', '#9fb4c7', '#a9bfa3'],
  mapR: ['map', '#d9e6df', '#e8cf98', '#c8473a'],
  mapI: ['map', '#bfc4c2', '#8a6a4a', '#3a3a3c'],
  bwM: ['bw', '#f2f2f2', '#1e1e20', '#8a8c90'],
  bwSepia: ['bw', '#f1e6d2', '#3b2c22', '#a08566'],
  typeI: ['type', '#e9e4d8', '#2e2e30', '#c46a3a'],
  typeM: ['type', '#f4f4f2', '#24252a', '#e3b549'],
  typeR: ['type', '#f4e7c8', '#2f8f8a', '#e2702f'],
  geoM: ['geo', '#f1efea', '#24252a', '#c9ccd1'],
  geoR: ['geo', '#f4e7c8', '#e0a526', '#2f8f8a'],
  geoN: ['geo', '#f7f5f0', '#9fb4c7', '#e3b549'],
  geoC: ['geo', '#fff6ee', '#ffb6c8', '#a6e3cc'],
  kidC: ['kid', '#fffdf6', '#5a8be0', '#ff8f86'],
  landR: ['land', '#ffd9a8', '#8c8c3a', '#e2702f'],
  landN: ['land', '#dfe8ee', '#a9bfa3', '#fff6d6'],
  flowerR: ['flower', '#f4e7c8', '#c8473a', '#e0a526'],
  flowerC: ['flower', '#fff1f4', '#ffb6c8', '#ffe08f'],
  abstractM: ['abstract', '#efeeea', '#3d3f44', '#c3a46b'],
  abstractN: ['abstract', '#f7f5f0', '#a9bfa3', '#d9b98c'],
  abstractR: ['abstract', '#f4e7c8', '#e2702f', '#2f8f8a'],
}

/** 配色 → 画面：同一系列里每组配色对应一幅画；用户改了颜色找不到就用系列的默认画种 */
const PIC_OF = new Map<string, PicKind>()
/** 画框配色表：[风格, 框色, 画面] */
function artPals(list: [StyleTag, string, keyof typeof PIC][]): Pal[] {
  return list.map(([st, frame, k]) => {
    const [kind, a, b, c] = PIC[k]
    const p = [frame, a, b, c]
    PIC_OF.set(p.join(), kind)
    return [st, p]
  })
}
function picOf(p: string[], fallback: PicKind) {
  return PIC_OF.get(p.join()) ?? fallback
}

// ======================================================================
// 画框
// ======================================================================

type FrameKind = 'wood' | 'black' | 'gold' | 'canvas' | 'acrylic'

/** 条框（木 / 黑）：背面 z = 0，外框 w × h，底边 y = 0；mat 给了就带白卡纸 */
function barFrame(w: number, h: number, b: number, t: number, color: string, key: string, draw: Draw, mat?: string) {
  const g = new THREE.Group()
  g.add(rbox(w, b, t, color, { z: t / 2 }, 0.3))
  g.add(rbox(w, b, t, color, { y: h - b, z: t / 2 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(b, h - b * 2, t, color, { x: s * (w / 2 - b / 2), y: b, z: t / 2 }, 0.3))
  g.add(rbox(w - b * 2 + 0.4, h - b * 2 + 0.4, 0.4, shade(color, -0.15), { y: b - 0.2, z: 0.2 }, 0.1))
  const iw = w - b * 2
  const ih = h - b * 2
  if (mat) {
    g.add(noOutlineDeep(rbox(iw, ih, 0.3, mat, { y: b, z: 0.6 }, 0.05)))
    g.add(paintPanel(iw * 0.74, ih * 0.74, key, draw, { y: b + ih * 0.13, z: 1.05 }))
  } else g.add(paintPanel(iw, ih, key, draw, { y: b, z: 0.75 }))
  return g
}
/** 金框：宽框 + 外沿凸起的珠边 + 内沿一圈亚麻衬条 */
function goldFrame(w: number, h: number, color: string, key: string, draw: Draw, mat?: string) {
  const b = Math.min(4.5, Math.max(3, w * 0.07))
  const t = 3
  // 框体比外沿珠边各缩 0.2，侧面不和珠边共面
  const body = barFrame(w - 0.4, h - 0.4, b - 0.2, t, color, key, draw, mat)
  body.position.y = 0.2
  const g = G(body)
  const bead = shade(color, 0.12)
  const e = 0.9
  g.add(rbox(w, e, t + 0.6, bead, { y: 0, z: (t + 0.6) / 2 }, 0.35))
  g.add(rbox(w, e, t + 0.6, bead, { y: h - e, z: (t + 0.6) / 2 }, 0.35))
  for (const s of [-1, 1]) g.add(rbox(e, h - e * 2, t + 0.6, bead, { x: s * (w / 2 - e / 2), y: e, z: (t + 0.6) / 2 }, 0.35))
  // 内沿衬条（比画面高出一点，压住画面边缘）
  const iw = w - b * 2
  const ih = h - b * 2
  const l = 0.9
  const lin = '#efe6d2'
  g.add(rbox(iw, l, 1.2, lin, { y: b, z: 1.6 }, 0.2))
  g.add(rbox(iw, l, 1.2, lin, { y: h - b - l, z: 1.6 }, 0.2))
  for (const s of [-1, 1]) g.add(rbox(l, ih - l * 2, 1.2, lin, { x: s * (iw / 2 - l / 2), y: b + l, z: 1.6 }, 0.2))
  return g
}
/** 无框画布：画布绷在 3.5cm 厚的内框上，侧面是画面的底色 */
function canvasFrame(w: number, h: number, side: string, key: string, draw: Draw) {
  return G(rbox(w, h, 3.5, side, { z: 1.75 }, 0.3), paintPanel(w - 0.4, h - 0.4, key, draw, { y: 0.2, z: 3.8 }))
}
/** 亚克力夹：两层透明板夹住画，四角金属钉把它撑离墙面 */
function acrylicFrame(w: number, h: number, metal: string, key: string, draw: Draw) {
  const g = new THREE.Group()
  g.add(clearDeep(rbox(w, h, 0.4, '#eef6fa', { z: 1.8 }, 0.2), '#eef6fa', 0.25))
  g.add(paintPanel(w - 4, h - 4, key, draw, { y: 2, z: 2.3 }))
  g.add(clearDeep(rbox(w, h, 0.4, '#eef6fa', { z: 2.8 }, 0.2), '#eef6fa', 0.25))
  for (const sx of [-1, 1])
    for (const y of [2.2, h - 2.2]) {
      g.add(cylZFrom(0.8, 1.6, metal, sx * (w / 2 - 2.2), y, 0, 12))
      g.add(cylZFrom(1.15, 0.7, metal, sx * (w / 2 - 2.2), y, 3, 16))
    }
  return g
}
/** 按画框种类组一幅画 */
function framed(kind: FrameKind, w: number, h: number, p: string[], pic: PicKind, matKinds: PicKind[] = []) {
  const [frame, a, b, c] = p
  const draw = drawOf(pic, a, b, c)
  const key = `mv|${pic}|${a}|${b}|${c}`
  const mat = matKinds.includes(pic) ? '#fbf8f1' : undefined
  if (kind === 'wood') return barFrame(w, h, 1.8, 2.4, frame, key, draw, mat)
  if (kind === 'black') return barFrame(w, h, 1.4, 2.2, frame, key, draw, mat)
  if (kind === 'gold') return goldFrame(w, h, frame, key, draw, mat)
  if (kind === 'canvas') return canvasFrame(w, h, a, key, draw)
  return acrylicFrame(w, h, frame, key, draw)
}

const MAT_KINDS: PicKind[] = ['face', 'herb', 'bw', 'type']

/** 一组同框不同尺寸的装饰画 */
function artFamily(
  fam: string,
  name: string,
  kind: FrameKind,
  depth: number,
  pals: Pal[],
  fallback: PicKind,
  sizes: [string, string, number, number, number][],
): AssetDef[] {
  return sizes.map(([suffix, label, w, h, mount]) =>
    A(`mv-art-${fam}-${suffix}`, name, 'deco', [w, depth, h], pals, (p) => framed(kind, w, h, p, picOf(p, fallback), kind === 'wood' || kind === 'black' || kind === 'gold' ? MAT_KINDS : []), {
      mount,
      family: `mv-art-${fam}`,
      sizeLabel: label,
    }),
  )
}

const WOOD_ART = artPals([
  ['nordic', N.oak, 'herbN'],
  ['japanese', J.hinoki, 'waveJ'],
  ['cute', C.woodL, 'waterC'],
  ['retro', R.caramel, 'mapR'],
  ['nordic', N.white, 'faceN'],
])
const BLACK_ART = artPals([
  ['modern', M.black, 'bwM'],
  ['industrial', I.iron, 'typeI'],
  ['modern', M.black, 'geoM'],
  ['industrial', I.iron, 'mapI'],
  ['nordic', M.char, 'faceM'],
])
const GOLD_ART = artPals([
  ['retro', GOLD, 'landR'],
  ['retro', GOLD, 'flowerR'],
  ['modern', '#c9b27a', 'abstractM'],
  ['cute', '#e8cf9a', 'flowerC'],
  ['japanese', '#b8955a', 'bwSepia'],
])
const CANVAS_ART = artPals([
  ['nordic', '#ffffff', 'waterN'],
  ['modern', '#ffffff', 'abstractM'],
  ['retro', '#ffffff', 'geoR'],
  ['japanese', '#ffffff', 'waveJ'],
  ['cute', '#ffffff', 'waterC'],
])
const ACRYLIC_ART = artPals([
  ['modern', CHROME, 'typeM'],
  ['cute', BRASS, 'kidC'],
  ['nordic', CHROME, 'geoN'],
  ['industrial', '#3a3a3c', 'bwM'],
  ['retro', BRASS, 'typeR'],
])

export const MV_FRAMED: AssetDef[] = [
  ...artFamily('wood', '装饰画·细木框', 'wood', 2.4, WOOD_ART, 'herb', [
    ['a4', 'A4', 25, 34, 133],
    ['a3', 'A3', 33, 46, 130],
    ['b2', 'B2', 55, 77, 112],
  ]),
  ...artFamily('black', '装饰画·黑框', 'black', 2.2, BLACK_ART, 'bw', [
    ['a3', 'A3', 33, 46, 130],
    ['b2', 'B2', 55, 77, 112],
    ['wide', '横幅 100', 100, 40, 128],
  ]),
  ...artFamily('gold', '装饰画·金框', 'gold', 3.6, GOLD_ART, 'land', [
    ['sq', '方形 50', 50, 50, 125],
    ['a3', 'A3', 38, 50, 128],
    ['b2', 'B2', 60, 82, 110],
  ]),
  ...artFamily('canvas', '装饰画·无框画布', 'canvas', 3.8, CANVAS_ART, 'water', [
    ['sq', '方形 60', 60, 60, 120],
    ['wide', '横幅 120', 120, 45, 125],
    ['tall', '竖幅 100', 45, 100, 100],
  ]),
  ...artFamily('acrylic', '装饰画·亚克力夹', 'acrylic', 3.7, ACRYLIC_ART, 'type', [
    ['a4', 'A4', 25, 33, 133],
    ['a3', 'A3', 33, 45, 130],
    ['b2', 'B2', 55, 76, 112],
  ]),
]

// ======================================================================
// 照片墙
// ======================================================================

const SKIES = ['#bfe3ff', '#ffd9b8', '#d7ecd0', '#f4d6e6', '#c9d4f0', '#fff1c4', '#d8f0ec', '#e9e0f5']
/** 第 i 张小照片的画面：风景 / 人像 / 花 / 黑白轮换 */
function snap(i: number, tone: string): [string, Draw] {
  const sky = SKIES[i % SKIES.length]
  switch (i % 4) {
    case 0:
      return [`l${i}${tone}`, paintLandscape(sky, tone, '#ffffff')]
    case 1:
      return [`p${i}${tone}`, paintPortrait(sky, tone, '#4a3a32')]
    case 2:
      return [`f${i}${tone}`, paintFlower(sky, tone, '#ffe08f')]
    default:
      return [`b${i}`, paintBW('#f2f2f2', '#2a2a2c', '#8a8c90')]
  }
}
/** 无框的小照片（白边）：背面 z = 0，底边 y = 0；bottom 是拍立得的下宽边 */
function print(w: number, h: number, i: number, tone: string, border = '#ffffff', edge = 0.6, bottom = edge) {
  const [key, draw] = snap(i, tone)
  return G(rbox(w, h, 0.25, border, { z: 0.125 }, 0.05), paintPanel(w - edge * 2, h - edge - bottom, `mvp|${key}`, draw, { y: bottom, z: 0.55 }))
}

/** 不规则排列的多相框组：大小、框色不一的七个框 + 一个圆框 [主框色, 副框色, 照片色调] */
function photoSalon(p: string[]) {
  const [fa, fb, tone] = p
  const g = new THREE.Group()
  const L: [number, number, number, number, 'wood' | 'black' | 'gold'][] = [
    [40, 52, -44, 16, 'gold'],
    [28, 22, -4, 48, 'black'],
    [24, 32, 32, 38, 'wood'],
    [36, 28, -2, 14, 'wood'],
    [22, 22, 31, 8, 'black'],
    [20, 26, -82, 40, 'wood'],
    [26, 20, -82, 10, 'black'],
  ]
  L.forEach(([w, h, x, y, k], i) => {
    const [key, draw] = snap(i, tone)
    const color = k === 'gold' ? GOLD : i % 2 ? fa : fb
    const f = k === 'gold' ? goldFrame(w, h, color, `mvs|${key}`, draw) : barFrame(w, h, k === 'wood' ? 1.8 : 1.4, 2.2, color, `mvs|${key}`, draw, i % 3 === 0 ? '#fbf8f1' : undefined)
    f.position.set(x, y, 0)
    g.add(f)
  })
  // 圆框
  const [key, draw] = snap(5, tone)
  g.add(cylZFrom(10.5, 0.4, shade(fa, -0.15), 58, 52, 0, 32))
  g.add(torus(10, 1.1, fa, { x: 58, y: 52, z: 1.1 }))
  g.add(paintDisc(9.2, `mvs|c${key}`, draw, 58, 52, 0.75))
  return g
}

/** 拍立得夹线：两根麻绳在两颗钉子之间垂成弧线，木夹子夹着小照片 [麻绳, 夹子, 照片色调] */
function photoPolaroid(p: string[]) {
  const [rope, peg, tone] = p
  const g = new THREE.Group()
  const half = 58
  const lines: [number, number][] = [
    [50, 7],
    [24, 6],
  ]
  lines.forEach(([top, sag], li) => {
    const yAt = (x: number) => top - sag * (1 - (x / half) ** 2)
    const pts: V3[] = []
    for (let k = 0; k <= 12; k++) {
      const x = -half + (k / 12) * half * 2
      pts.push([x, yAt(x), 1.2])
    }
    g.add(tube(pts, 0.22, rope, { ...TUBE, seg: 48, radial: 5 }))
    for (const s of [-1, 1]) {
      g.add(cylZFrom(0.25, 1.6, '#9a9ca1', s * (half + 0.6), top + 0.2, 0, 6))
      g.add(cylZFrom(0.6, 0.3, '#9a9ca1', s * (half + 0.6), top + 0.2, 1.6, 12))
    }
    const xs = li === 0 ? [-42, -21, 0, 21, 42] : [-32, -10, 12, 34]
    xs.forEach((x, i) => {
      const k = li * 5 + i
      const y = yAt(x)
      const ph = G(print(8.8, 10.6, k, tone, '#ffffff', 0.6, 2.2))
      const rz = ((k * 7) % 5) * 0.03 - 0.06
      ph.position.set(x, y - 10.6 - 0.8, 0.45)
      ph.rotation.z = rz
      g.add(ph)
      // 木夹子：两片夹住绳子和照片上沿
      g.add(rbox(1.3, 4.6, 0.7, peg, { x, y: y - 2.8, z: 0.95 }, 0.2))
      g.add(rbox(1.3, 4.6, 0.7, peg, { x, y: y - 2.8, z: 1.65 }, 0.2))
      g.add(rbox(1.5, 0.6, 1.6, '#9a9ca1', { x, y: y - 1.2, z: 1.3 }, 0.15))
    })
  })
  return g
}

/** 竖版铁网照片架：粗外框 + 细网格，夹子夹照片和明信片，下面挂三只 S 钩和一块小木牌 [铁网, 夹子, 照片色调] */
function photoGridTall(p: string[]) {
  const [wire, clip, tone] = p
  const g = new THREE.Group()
  const W0 = 60
  const H0 = 90
  for (let k = 0; k <= 10; k++) {
    const x = -W0 / 2 + k * 6
    g.add(bar([x, 0, 0.5], [x, H0, 0.5], k % 10 === 0 ? 0.5 : 0.22, wire, 6))
  }
  for (let k = 0; k <= 15; k++) {
    const y = k * 6
    g.add(bar([-W0 / 2, y, 0.95], [W0 / 2, y, 0.95], k % 15 === 0 ? 0.5 : 0.22, wire, 6))
  }
  const shots: [number, number, number, number, number][] = [
    [-14, 84, 15, 11, 0.05],
    [10, 86, 11, 14, -0.07],
    [-12, 64, 11, 14, -0.04],
    [12, 62, 16, 11, 0.06],
    [-10, 42, 18, 12, 0.03],
    [14, 40, 10, 13, -0.05],
  ]
  shots.forEach(([x, y, w, h, rz], i) => {
    const ph = G(print(w, h, i + 2, tone))
    ph.add(rbox(1.4, 3, 1, clip, { y: h - 1.5, z: 0.5 }, 0.3))
    ph.position.set(x, y - h + 1.5, 1.45)
    ph.rotation.z = rz
    g.add(ph)
  })
  // S 钩 + 小木牌
  for (const x of [-18, 0, 18]) {
    g.add(torus(1.2, 0.2, wire, { x, y: 17.2, z: 1.3, ry: PI / 2 }, PI))
    g.add(torus(1.2, 0.2, wire, { x, y: 14.8, z: 1.3, ry: PI / 2, rz: PI }, PI))
  }
  g.add(rbox(12, 6, 0.8, '#d9b98c', { x: 0, y: 7.4, z: 1.7 }, 0.3))
  return g
}

/** 圆形软木板：软木圆盘 + 木圈边，图钉钉着照片和便签 [软木, 边框, 图钉 / 便签] */
function photoCork(p: string[]) {
  const [cork, rim, acc] = p
  const g = new THREE.Group()
  const R0 = 30
  g.add(cylZFrom(R0, 2, cork, 0, R0, 0, 48))
  g.add(torus(R0, 1.1, rim, { y: R0, z: 1.1 }))
  const items: [number, number, number, number, number, 'photo' | 'note'][] = [
    [-12, 40, 14, 10, 0.08, 'photo'],
    [8, 42, 10, 13, -0.06, 'photo'],
    [-2, 22, 15, 11, 0.04, 'photo'],
    [-18, 22, 8, 8, -0.1, 'note'],
    [16, 22, 8, 8, 0.12, 'note'],
    [4, 6, 9, 7, -0.05, 'note'],
  ]
  items.forEach(([x, y, w, h, rz, kind], i) => {
    const it = kind === 'photo' ? G(print(w, h, i + 1, shade(acc, -0.1))) : G(rbox(w, h, 0.2, i % 2 ? '#fff4a8' : shade(acc, 0.35), { z: 0.1 }, 0.05))
    if (kind === 'note') for (let k = 0; k < 3; k++) it.add(noOutlineDeep(rbox(w * 0.7, 0.25, 0.1, '#8a7a6a', { y: h * (0.25 + k * 0.2), z: 0.25 }, 0.03)))
    it.add(ball(0.75, acc, { x: 0, y: h - 1.4, z: 1.0 }))
    it.add(cyl(0.3, 0.3, 0.8, acc, { y: h - 1.4 - 0.4, z: 0.4, rx: PI / 2 }, 8))
    it.position.set(x, y - h / 2, 2.3)
    it.rotation.z = rz
    g.add(it)
  })
  return g
}

/** 心形照片排列：小方照片沿心形摆一圈，中间再放三张 [白边, 照片色调 1, 照片色调 2] */
function photoHeart(p: string[]) {
  const [border, t1, t2] = p
  const g = new THREE.Group()
  const n = 16
  const k = 2.35
  // 按弧长等距取点（参数等分会在尖角处挤成一堆）
  const curve = (t: number): [number, number] => [16 * Math.sin(t) ** 3 * k, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k]
  const dense = Array.from({ length: 401 }, (_, i) => curve((i / 400) * PI * 2))
  const cum = [0]
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]))
  const L = cum[cum.length - 1]
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) pts.push(dense[cum.findIndex((c) => c >= (i / n) * L)])
  pts.push([-12, 8], [12, 8], [0, -6])
  pts.forEach(([x, y], i) => {
    const s = i >= n ? 11 : 9
    const ph = G(print(s, s, i, i % 2 ? t1 : t2, border, 0.7))
    ph.position.set(x, y - s / 2, 0)
    ph.rotation.z = (((i * 5) % 7) - 3) * 0.03
    g.add(ph)
  })
  return g
}

/** 阶梯式相框组：沿楼梯斜线往上排的六个框（适合挂在楼梯边 / 斜顶下） [框色 1, 框色 2, 照片色调] */
function photoStair(p: string[]) {
  const [fa, fb, tone] = p
  const g = new THREE.Group()
  const L: [number, number][] = [
    [22, 28],
    [30, 40],
    [26, 26],
    [36, 28],
    [22, 30],
    [28, 28],
  ]
  let x = -70
  L.forEach(([w, h], i) => {
    const cx = x + w / 2
    const cy = 20 + (cx + 70) * 0.55
    const [key, draw] = snap(i + 3, tone)
    const f = barFrame(w, h, 1.6, 2.2, i % 2 ? fa : fb, `mvst|${key}`, draw, i % 2 ? undefined : '#fbf8f1')
    f.position.set(cx, cy - h / 2, 0)
    g.add(f)
    x += w + 5
  })
  return g
}

const SALON_PALS: Pal[] = [
  ['nordic', [N.oak, M.white, N.sage]],
  ['modern', [M.black, M.white, M.gray]],
  ['retro', [R.caramel, R.cream, R.orange]],
  ['industrial', [I.iron, I.walnut, I.rust]],
  ['cute', [C.woodL, C.white, C.pink]],
]
const POLA_PALS: Pal[] = [
  ['nordic', ['#c9b48a', N.oakL, N.blue]],
  ['cute', ['#e9d8b8', C.pink, C.pink]],
  ['industrial', ['#8a7a5a', I.walnut, I.rust]],
  ['retro', ['#c9b48a', R.mustard, R.teal]],
]
const GRIDT_PALS: Pal[] = [
  ['industrial', [I.iron, I.rust, I.leather]],
  ['modern', [M.white, M.char, M.gray]],
  ['nordic', [M.black, N.oak, N.sage]],
  ['cute', [C.white, C.pink, C.pink]],
]
const CORK_PALS: Pal[] = [
  ['nordic', ['#c9a274', N.oak, '#e06a5a']],
  ['industrial', ['#a8825a', I.iron, I.rust]],
  ['modern', ['#b89470', M.black, M.char]],
  ['cute', ['#d6b088', C.white, C.pink]],
]
const HEART_PALS: Pal[] = [
  ['cute', ['#ffffff', C.pink, C.sky]],
  ['nordic', ['#ffffff', N.sage, N.blue]],
  ['retro', ['#f4e7c8', R.orange, R.teal]],
  ['modern', [M.black, M.gray, M.char]],
]
const STAIR_PALS: Pal[] = [
  ['nordic', [N.oak, M.white, N.blue]],
  ['modern', [M.black, M.black, M.gray]],
  ['japanese', [J.wood, J.dark, J.ai]],
  ['industrial', [I.iron, I.walnut, I.leather]],
  ['retro', [R.caramel, GOLD, R.orange]],
]

export const MV_PHOTO: AssetDef[] = [
  A('mv-photo-salon', '照片墙·不规则相框组', 'deco', [164.1, 3.6, 62], SALON_PALS, photoSalon, { mount: 105 }),
  A('mv-photo-polaroid-line', '照片墙·拍立得夹线', 'deco', [118.4, 2.1, 44.2], POLA_PALS, photoPolaroid, { mount: 125 }),
  A('mv-photo-grid-tall', '照片墙·竖版铁网', 'deco', [60.9, 2.8, 90.9], GRIDT_PALS, photoGridTall, { mount: 105 }),
  A('mv-photo-cork-round', '照片墙·圆形软木板', 'deco', [62.2, 4.1, 62.2], CORK_PALS, photoCork, { mount: 115 }),
  A('mv-photo-heart', '照片墙·心形排列', 'deco', [83.6, 0.6, 77.4], HEART_PALS, photoHeart, { mount: 112 }),
  A('mv-photo-stair', '照片墙·阶梯式相框组', 'deco', [189, 2.2, 118.2], STAIR_PALS, photoStair, { mount: 95 }),
]

// ======================================================================
// 立体壁饰
// ======================================================================

/** 挂盘组：五只大小不一的瓷盘，盘心是花样 [盘, 纹样, 点缀] */
function decoPlates(p: string[]) {
  const [plateC, pat, acc] = p
  const g = new THREE.Group()
  const L: [number, number, number][] = [
    [15, 0, 30],
    [9.5, -27, 44],
    [9.5, 27, 20],
    [7.5, -25, 14],
    [7.5, 25, 46],
  ]
  L.forEach(([r, x, y], i) => {
    const prof: [number, number][] = [
      [0, 0],
      [r * 0.55, 0],
      [r * 0.6, 0.5],
      [r * 0.98, 1.4],
      [r, 1.8],
      [r * 0.92, 1.75],
      [r * 0.6, 0.9],
      [0, 0.9],
    ]
    const m = mesh(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 40), plateC)
    m.rotation.x = PI / 2
    m.position.set(x, y, 0)
    g.add(m)
    g.add(torus(r * 0.82, 0.25, i % 2 ? acc : pat, { x, y, z: 1.45 }))
    g.add(
      paintDisc(
        r * 0.58,
        `mvplate|${plateC}|${pat}|${acc}|${i % 4}`,
        (c, W, H) => {
          c.fillStyle = plateC
          c.fillRect(0, 0, W, H)
          c.fillStyle = pat
          c.strokeStyle = pat
          c.lineWidth = Math.max(2, W * 0.03)
          const cx = W / 2
          const cy = H / 2
          if (i % 4 === 0) {
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * PI * 2
              c.beginPath()
              c.ellipse(cx + Math.cos(a) * W * 0.22, cy + Math.sin(a) * H * 0.22, W * 0.12, H * 0.05, a, 0, PI * 2)
              c.fill()
            }
            c.fillStyle = acc
            c.beginPath()
            c.arc(cx, cy, W * 0.1, 0, PI * 2)
            c.fill()
          } else if (i % 4 === 1) {
            for (let k = 1; k < 4; k++) {
              c.beginPath()
              c.arc(cx, cy, W * 0.12 * k, 0, PI * 2)
              c.stroke()
            }
          } else if (i % 4 === 2) {
            c.fillStyle = acc
            for (let k = 0; k < 12; k++) {
              const a = (k / 12) * PI * 2
              c.beginPath()
              c.arc(cx + Math.cos(a) * W * 0.32, cy + Math.sin(a) * H * 0.32, W * 0.04, 0, PI * 2)
              c.fill()
            }
            c.fillStyle = pat
            c.beginPath()
            c.arc(cx, cy, W * 0.18, 0, PI * 2)
            c.fill()
          } else {
            for (let k = -3; k <= 3; k++) c.fillRect(cx + k * W * 0.11 - W * 0.02, H * 0.1, W * 0.04, H * 0.8)
          }
        },
        x,
        y,
        1.2,
      ),
    )
  })
  return g
}

/** 木质几何壁挂：蜂窝排列的六边形木块，厚薄不一，个别上色 [木, 深木, 点缀] */
function decoWoodGeo(p: string[]) {
  const [wood, dark, acc] = p
  const g = new THREE.Group()
  const r = 9
  const dx = Math.sqrt(3) * r + 0.8
  const dy = 1.5 * r + 0.7
  const cells: [number, number][] = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0.5, 1],
    [-0.5, 1],
    [1.5, 1],
    [0.5, -1],
    [-1.5, -1],
    [2, 0],
  ]
  cells.forEach(([cx, cy], i) => {
    const depth = 2 + ((i * 3) % 4)
    const color = i === 3 || i === 7 ? acc : i % 3 === 1 ? dark : wood
    g.add(cylZFrom(r, depth, color, cx * dx, 30 + cy * dy, 0, 6))
  })
  // 两个小三角：嵌进蜂窝边上的空位，和六边形连成一整块（原先离得太远，像掉出来的碎片）
  // 六边形平边到中心 r·cos30°，三角内切圆半径 = 外接半径 / 2，再留 0.4cm 缝
  const side = r * Math.cos(PI / 6) + 0.4
  g.add(cylZFrom(4, 3, acc, 1.5 * dx + side + 2, 30 + dy, 0, 3))
  g.add(cylZFrom(3.5, 2, dark, -dx - side - 1.75, 30, 0, 3))
  // 整体 xz 居中
  const bb = new THREE.Box3().setFromObject(g)
  const cx = (bb.min.x + bb.max.x) / 2
  for (const c of g.children) c.position.x -= cx
  return g
}

/** 圆环编织挂毯：同心藤圈 + 辐条 + 下半圈垂下的流苏，顶上挂绳 [主线, 副线, 珠子] */
function decoWeaveRound(p: string[]) {
  const [ca, cb, bead] = p
  const g = new THREE.Group()
  const cy = 50
  const R0 = 22
  for (let k = 1; k <= 5; k++) g.add(torus((R0 * k) / 5, k === 5 ? 1.2 : 0.9, k % 2 ? ca : cb, { y: cy, z: 1.2 }))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2
    g.add(bar([Math.cos(a) * 2, cy + Math.sin(a) * 2, 1], [Math.cos(a) * R0, cy + Math.sin(a) * R0, 1], 0.35, cb, 5))
  }
  g.add(ball(2.6, bead, { y: cy, z: 1.6 }, [1, 1, 0.6]))
  for (let k = 0; k < 11; k++) {
    const a = PI + 0.25 + (k / 10) * (PI - 0.5)
    const x = Math.cos(a) * R0
    const y = cy + Math.sin(a) * R0
    const len = 16 + 10 * Math.sin(((k + 0.5) / 11) * PI)
    g.add(bar([x, y, 1.2], [x * 1.04, y - len, 1.2], 0.45, k % 2 ? ca : cb, 5))
    if (k % 3 === 1) g.add(ball(1.1, bead, { x: x * 1.02, y: y - len * 0.45, z: 1.2 }))
  }
  g.add(tube([[-14, cy + 17, 1.2], [-6, cy + 26, 0.9], [0, cy + 30, 0.6], [6, cy + 26, 0.9], [14, cy + 17, 1.2]], 0.3, ca, { ...TUBE, seg: 20, radial: 5 }))
  g.add(cylZFrom(0.3, 1.2, '#9a9ca1', 0, cy + 30.4, 0, 6))
  return g
}

/** 干花挂环：黄铜圆环 + 左下方一簇干花（蒲苇、尤加利、小花）+ 缎带 [花 1, 花 2, 缎带] */
function decoHoop(p: string[]) {
  const [fa, fb, rib] = p
  const g = new THREE.Group()
  const cy = 22
  const R0 = 18
  g.add(torus(R0, 0.45, BRASS, { y: cy, z: 2 }))
  // 挂绳：从环顶到钉子
  g.add(bar([0, cy + R0, 2], [0, cy + R0 + 10, 0.4], 0.15, '#8a7a6a', 4))
  g.add(cylZFrom(0.3, 1, '#9a9ca1', 0, cy + R0 + 10, 0, 6))
  const at = (a: number, k = R0): V3 => [Math.cos(a) * k, cy + Math.sin(a) * k, 2]
  // 花茎沿环切线方向
  for (let k = 0; k < 6; k++) {
    const a0 = PI * 1.1 + k * 0.1
    const [x0, y0] = at(a0)
    const tx = -Math.sin(a0)
    const ty = Math.cos(a0)
    const len = 18 + (k % 3) * 4
    g.add(bar([x0, y0, 2.4], [x0 - tx * len, y0 - ty * len, 2.6 + (k % 2) * 0.6], 0.2, '#8a8a5a', 4))
  }
  // 蒲苇
  for (let k = 0; k < 3; k++) {
    const a0 = PI * 1.12 + k * 0.12
    const [x0, y0] = at(a0)
    const tx = -Math.sin(a0)
    const ty = Math.cos(a0)
    const len = 20 + k * 3
    const pl = ball(5, '#efe2c8', { x: x0 - tx * len, y: y0 - ty * len, z: 2.8 + k * 0.4 }, [0.32, 1, 0.32])
    pl.rotation.z = Math.atan2(-ty, -tx) - PI / 2
    g.add(pl)
  }
  // 尤加利圆叶
  for (let k = 0; k < 9; k++) {
    const a0 = PI * 1.25 + k * 0.07
    const [x0, y0] = at(a0, R0 + ((k % 3) - 1) * 2.5)
    g.add(ball(1.8, k % 2 ? '#8fa88c' : '#a3b8a0', { x: x0, y: y0, z: 2.6 + (k % 2) * 0.5 }, [1, 1, 0.3]))
  }
  // 小花
  for (let k = 0; k < 6; k++) {
    const a0 = PI * 1.15 + k * 0.11
    const [x0, y0] = at(a0, R0 - 3 + (k % 2) * 5)
    g.add(ball(1.4 + (k % 2) * 0.4, k % 3 ? fa : fb, { x: x0, y: y0, z: 3.4 }))
  }
  // 缎带蝴蝶结
  const [bx, by] = at(PI * 1.3)
  g.add(torus(1.6, 0.45, rib, { x: bx - 1.6, y: by, z: 3.2 }))
  g.add(torus(1.6, 0.45, rib, { x: bx + 1.6, y: by, z: 3.2 }))
  g.add(bar([bx, by, 3.2], [bx - 2, by - 6, 3.2], 0.35, rib, 5))
  g.add(bar([bx, by, 3.2], [bx + 1.5, by - 7, 3.2], 0.35, rib, 5))
  return g
}

/** 抽象几何鹿头：盾形底板 + 低多边形的头颈 + 分叉的角（不是真的动物标本） [头, 底板, 角] */
function decoDeer(p: string[]) {
  const [head, plaque, horn] = p
  const g = new THREE.Group()
  const shield: [number, number][] = [
    [-11, 34],
    [11, 34],
    [12, 22],
    [8, 10],
    [0, 2],
    [-8, 10],
    [-12, 22],
  ]
  g.add(flat(shield, 2, plaque, 0))
  g.add(facet([0, 17, 1.5], [0, 21, 12], 6, 4.6, head, 6))
  g.add(facet([0, 22, 10], [0, 15, 24], 5, 1.8, head, 5))
  g.add(facet([0, 16.5, 23], [0, 15.6, 25.2], 1.8, 0.8, shade(head, -0.3), 5))
  for (const s of [-1, 1]) {
    g.add(facet([s * 3.5, 24, 12], [s * 10, 27.5, 11], 2, 0.3, head, 3))
    g.add(bar([s * 2.5, 24.5, 12], [s * 6, 34, 11], 0.6, horn, 6))
    g.add(bar([s * 6, 34, 11], [s * 11, 42, 10], 0.5, horn, 6))
    g.add(bar([s * 6, 34, 11], [s * 4, 42, 11.5], 0.45, horn, 6))
    g.add(bar([s * 8.5, 38, 10.5], [s * 13, 37, 10], 0.4, horn, 6))
  }
  return g
}

/** 壁挂小搁板 + 小画：一条带挡边的窄搁板，靠墙立两幅小画和一只插花小瓶 [木, 画框, 画色调] */
function decoLedge(p: string[]) {
  const [wood, frame, tone] = p
  const g = new THREE.Group()
  const y0 = 8
  g.add(rbox(70, 2, 11, wood, { y: y0, z: 5.5 }, 0.5))
  g.add(rbox(70, 3.6, 1.2, wood, { y: y0 + 2, z: 10.4 }, 0.4))
  g.add(rbox(70, 4, 1, shade(wood, -0.08), { y: y0 + 2, z: 0.5 }, 0.3))
  // 三角托架：竖边贴墙、横边托住板底
  for (const x of [-24, 24]) {
    const tri = flat([[0, 0], [0, 8], [8, 8]], 1.6, shade(wood, -0.1), 0)
    tri.rotation.y = -PI / 2
    tri.position.x = x + 0.8
    g.add(tri)
  }
  const lean = (w: number, h: number, x: number, th: number, i: number) => {
    const [key, draw] = snap(i, tone)
    const f = barFrame(w, h, 1.4, 1.8, frame, `mvl|${key}`, draw, i % 2 ? '#fbf8f1' : undefined)
    const q = new THREE.Group()
    q.add(f)
    q.position.set(x, y0 + 2, h * Math.sin(th) + 0.05)
    q.rotation.x = -th
    return q
  }
  g.add(lean(22, 28, -20, 0.08, 1))
  g.add(lean(16, 20, 4, 0.08, 2))
  // 插花小瓶
  g.add(cup(2.2, 2.8, 9, 0.4, '#f4f4f2', { x: 24, y: y0 + 2, z: 5.5 }))
  for (const [dx, h] of [
    [-1.5, 8],
    [0.5, 11],
    [2, 7],
  ])
    g.add(bar([24 + dx * 0.3, y0 + 4, 5.5], [24 + dx * 1.5, y0 + 4 + h, 5.5], 0.15, '#7d9a72', 4))
  g.add(ball(1, C.pink, { x: 24 + 0.75, y: y0 + 15, z: 5.5 }))
  g.add(ball(0.9, C.lemon, { x: 24 - 2.25, y: y0 + 12, z: 5.5 }))
  return g
}

const PLATE_PALS: Pal[] = [
  ['japanese', ['#f6f0e1', J.ai, J.shu]],
  ['nordic', ['#f7f5f0', N.blue, N.mustard]],
  ['retro', [R.cream, R.teal, R.orange]],
  ['cute', ['#fffaf4', C.pink, C.mint]],
  ['modern', [M.white, M.black, M.gray]],
]
const WOODGEO_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL, N.sage]],
  ['industrial', [I.walnut, '#5a3a26', I.rust]],
  ['japanese', [J.hinoki, J.wood, J.shu]],
  ['modern', [M.walnut, M.black, M.white]],
]
const WEAVE_PALS: Pal[] = [
  ['nordic', ['#efe6d2', '#c9b48a', N.sage]],
  ['japanese', ['#d8c48e', '#8a6a4a', J.shu]],
  ['retro', [R.cream, R.mustard, R.teal]],
  ['cute', ['#fff6ee', C.sakura, C.mint]],
]
const HOOP_PALS: Pal[] = [
  ['nordic', ['#e8d8b8', '#c98a6a', '#e8e1d4']],
  ['cute', [C.pink, C.lilac, C.sakura]],
  ['retro', [R.orange, R.mustard, R.cream]],
  ['japanese', ['#d65a3c', '#f6f0e1', '#c9cf8e']],
]
const DEER_PALS: Pal[] = [
  ['nordic', [M.white, N.oak, N.oak]],
  ['modern', [M.black, M.walnut, GOLD]],
  ['industrial', [I.concrete, I.walnut, I.iron]],
  ['retro', [GOLD, R.caramel, GOLD]],
  ['cute', [C.sakura, C.woodL, C.white]],
]
const LEDGE_PALS: Pal[] = [
  ['nordic', [N.oak, M.white, N.sage]],
  ['modern', [M.black, M.black, M.gray]],
  ['industrial', [I.walnut, I.iron, I.leather]],
  ['japanese', [J.hinoki, J.dark, J.ai]],
  ['cute', [M.white, C.woodL, C.pink]],
]

export const MV_DECO: AssetDef[] = [
  A('mv-deco-plates', '挂盘组', 'deco', [73, 1.8, 47], PLATE_PALS, decoPlates, { mount: 120 }),
  A('mv-deco-wood-geo', '木质几何壁挂', 'deco', [89.7, 5, 46.4], WOODGEO_PALS, decoWoodGeo, { mount: 125 }),
  A('mv-deco-weave-round', '圆环编织挂毯', 'deco', [46.4, 3.2, 78.7], WEAVE_PALS, decoWeaveRound, { mount: 110 }),
  A('mv-deco-hoop', '干花挂环', 'deco', [51.3, 5.2, 50.1], HOOP_PALS, decoHoop, { mount: 128 }),
  A('mv-deco-deer', '几何鹿头壁饰', 'deco', [26.2, 26.1, 40.3], DEER_PALS, decoDeer, { mount: 138 }),
  A('mv-deco-ledge', '壁挂小搁板 + 小画', 'deco', [70, 11, 38], LEDGE_PALS, decoLedge, { mount: 115 }),
]
