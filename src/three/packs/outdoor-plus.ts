// 庭院与阳台：球形炭烤炉、燃气烧烤炉、庭院遮阳伞、充气泳池、篝火盆、户外藤编沙发 / 茶几、喂鸟器、手推割草机、花园小矮人、
// 蹲踞、鹿威し、儿童沙坑、立式信箱、花园拱门、太阳能地插灯、沙滩躺椅、花箱长椅。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。带台面的（藤编茶几）声明 surface；type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { ball, cached, capsule, cup, cyl, face, markWater, puck, rbox, shade, torus, tray } from '../toon'
import { C, rectPoly, rng, slab, type AssetDef, type Fx, type Poly } from '../kit'
import { batten, clearMat, cylX, cylZ, dist, fitGroup, G, ghost, lathe, lit, mesh, noOutline, P, PI, rod3, sideSlab, taperRod3, tube, type V2, type V3 } from '../geo'
import { CL, F, I, J, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#2b2c30'
const RUBBER = '#2e2f33'
const WATER = '#9fd6ee'
const CONCRETE = '#b5b2ac'
const SOIL = '#6b4a3a'
const SAND = '#ecd9a6'
const GRASS = '#7fbf6a'
const ASH = '#4a4644'
const EMBER = '#ff8a3d'
const DUCK = '#ffd23f'
const SKIN = '#f6c9a8'
const BEARD = '#f7f5f0'
const BOOT = '#6b4a35'
const BELT = '#4a3528'
const SEED = '#d9b27a'
const ENGINE = '#3b3d42'
const NACHI = '#3a3a3c'
const BAMBOO_IN = '#5a4a2e'
const VINE = '#5f8a4a'
const PANEL = '#2c3f66'

// ---------- 共用小件 ----------

/** 敞口的碗形薄壳（车削）：口沿在 y = 0、半径 r，往下深 depth，壁厚 t。绕 x 轴转过来就是穹顶盖 */
function bowlShell(r: number, depth: number, t: number, color: string, seg = 32) {
  const n = 10
  const pts: V2[] = []
  // 外壁：从碗底中心到口沿
  for (let i = 0; i <= n; i++) {
    const a = (-PI / 2) * (1 - i / n)
    pts.push([r * Math.cos(a), depth * Math.sin(a)])
  }
  // 内壁：从口沿回到碗底中心
  for (let i = n; i >= 0; i--) {
    const a = (-PI / 2) * (1 - i / n)
    pts.push([(r - t) * Math.cos(a), (depth - t) * Math.sin(a)])
  }
  return lathe(pts, color, seg)
}

/** 充气环 / 圆管圈（车削，比 torus 体素圆）：环心半径 R、管半径 r，环面水平、中心在 y */
function ringTube(R: number, r: number, color: string, y: number, seg = 48) {
  const pts: V2[] = []
  for (let i = 0; i <= 14; i++) {
    const a = -PI / 2 + (i / 14) * PI * 2
    pts.push([R + r * Math.cos(a), r * Math.sin(a)])
  }
  return P(lathe(pts, color, seg), 0, y, 0)
}

/** 轮子（轴沿 x）：橡胶胎 + 轮毂，(x, y, z) 为中心 */
function wheelX(r: number, t: number, hub: string, x: number, y: number, z: number) {
  return G(cylX(r, t, RUBBER, x, y, z, 20), cylX(r * 0.55, t + 0.7, hub, x, y, z, 14))
}

/**
 * 两圈点数相同的多边形 a、b 之间围成的凸薄板（伞布、垂边）：每个面都是平的（不共用顶点），
 * 三角面的朝向按「背离质心」自动摆正，所以两圈点按什么方向给都行。
 */
function flatSolid(a: V3[], b: V3[], color: string) {
  const n = a.length
  const tris: [V3, V3, V3][] = []
  for (let i = 1; i < n - 1; i++) tris.push([a[0], a[i], a[i + 1]], [b[0], b[i], b[i + 1]])
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    tris.push([a[i], a[j], b[j]], [a[i], b[j], b[i]])
  }
  const c = new THREE.Vector3()
  for (const v of [...a, ...b]) c.add(new THREE.Vector3(...v))
  c.multiplyScalar(1 / (n * 2))
  const pos: number[] = []
  const [u, v, w, m] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  for (const [p0, p1, p2] of tris) {
    u.set(...p0)
    v.set(...p1)
    w.set(...p2)
    m.copy(u).add(v).add(w).multiplyScalar(1 / 3).sub(c)
    const out = new THREE.Vector3().subVectors(v, u).cross(new THREE.Vector3().subVectors(w, u)).dot(m) >= 0
    pos.push(...p0, ...(out ? p1 : p2), ...(out ? p2 : p1))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return mesh(geo, color)
}

const stoneCache = new Map<number, THREE.BufferGeometry>()
/**
 * 不规则石块，归一化到 1 × 1 × 1 的盒子里（x / z 居中、底面压平在 y = 0）：二十面体细分后按种子叠几道低频起伏。
 * 用的时候按 [宽, 高, 深] 缩放。
 */
function stoneGeo(seed: number) {
  let geo = stoneCache.get(seed)
  if (!geo) {
    let g0: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2)
    g0.deleteAttribute('normal')
    g0.deleteAttribute('uv')
    g0 = mergeVertices(g0)
    const r = rng(seed * 7919 + 13)
    const waves = Array.from({ length: 3 }, () => ({ d: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), f: 1.6 + r() * 1.6, ph: r() * 6.28 }))
    const pos = g0.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      let k = 1
      for (const w of waves) k += 0.11 * Math.sin(v.dot(w.d) * w.f * 2 + w.ph)
      v.multiplyScalar(k)
      // 底面压平：石头是半埋在地里的
      if (v.y < -0.45) v.y = -0.45 + (v.y + 0.45) * 0.12
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g0.computeBoundingBox()
    const bb = g0.boundingBox!
    g0.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2)
    g0.scale(1 / (bb.max.x - bb.min.x), 1 / (bb.max.y - bb.min.y), 1 / (bb.max.z - bb.min.z))
    g0.computeVertexNormals()
    // 模块级缓存、多件家具共用：标记共享，disposeUnshared 不释放
    g0.userData.shared = true
    stoneCache.set(seed, (geo = g0))
  }
  return geo
}

/** 一块石头：size = [宽, 高, 深]，底面在 y，绕竖轴转 ry */
function pebble(size: V3, color: string, seed: number, x: number, z: number, ry = 0, y = 0) {
  const m = mesh(stoneGeo(seed), color)
  m.scale.set(...size)
  return P(m, x, y, z, 0, ry)
}

/** 一根竹子：a → b 的圆杆，每隔 every 一圈深色的竹节 */
function bambooRod(a: V3, b: V3, r: number, color: string, every = 13) {
  const g = G(rod3(a, b, r, color, 12))
  const len = dist(a, b)
  const d: V3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]
  const at = (t: number): V3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]
  for (let t = every * 0.6; t < len - 2; t += every) g.add(rod3(at(t - 0.35), at(t + 0.35), r + 0.22, shade(color, -0.14), 12))
  return g
}

/** 一截木柴：树皮色的圆木，两头露出浅色的截面 */
function logRod(a: V3, b: V3, r: number, bark: string) {
  const len = dist(a, b)
  const d: V3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]
  const cut = shade(bark, 0.3, -0.1)
  const g = G(rod3(a, b, r, bark, 10))
  g.add(noOutline(rod3([a[0] - d[0] * 0.25, a[1] - d[1] * 0.25, a[2] - d[2] * 0.25], a, r * 0.8, cut, 10)))
  g.add(noOutline(rod3(b, [b[0] + d[0] * 0.25, b[1] + d[1] * 0.25, b[2] + d[2] * 0.25], r * 0.8, cut, 10)))
  return g
}

/** 低模叶片：压扁的小椭球（6 × 4 段，每片 36 个三角面），从 at 朝 (yaw, pitch) 方向伸出 len */
function leafAt(at: V3, len: number, color: string, yaw: number, pitch: number, roll = 0) {
  const m = mesh(
    cached('od-leaf', () => new THREE.SphereGeometry(1, 6, 4)),
    color,
  )
  m.scale.set(len * 0.3, len * 0.09, len * 0.5)
  m.rotation.order = 'YXZ'
  m.rotation.set(pitch, yaw, roll)
  // 局部 z 是叶片的长轴：叶柄端贴着 at
  const cp = Math.cos(pitch)
  m.position.set(at[0] + Math.sin(yaw) * cp * len * 0.42, at[1] - Math.sin(pitch) * len * 0.42, at[2] + Math.cos(yaw) * cp * len * 0.42)
  return m
}

/** 一圈圈藤编纹：比本体四周各大 0.35cm 的薄片，从 y0 到 y1 每隔 step 一道（本体是 w × d 的盒子，中心在 x / z） */
function wickerBands(w: number, d: number, y0: number, y1: number, color: string, x = 0, z = 0, step = 5) {
  const g = new THREE.Group()
  for (let y = y0 + step / 2; y < y1 - 0.8; y += step) g.add(noOutline(rbox(w + 0.7, 1.1, d + 0.7, color, { x, y: y - 0.55, z }, 0.3)))
  return g
}

// ---------- 球形炭烤炉：三条腿（后面两条带轮）托着半球炉身，里面是炭和烤网，半球盖挂在炉身背后，底下一只灰盘 ----------

const KG = { r: 28, rim: 72, depth: 22 }
function kettleGrill(p: string[]) {
  const [enamel, handle, metal] = p
  const g = new THREE.Group()
  const { r, rim, depth } = KG
  // 炉身：半球碗 + 口沿一圈亮边
  g.add(P(bowlShell(r, depth, 1.2, enamel), 0, rim, 0))
  g.add(torus(r - 0.3, 0.6, metal, { y: rim, rx: PI / 2 }))
  // 炭层：一层灰 + 几块炭，中间两三块烧红的
  g.add(cyl(21.5, 19.5, 2.5, ASH, { y: rim - 13.8 }, 24))
  const coals: [number, number, number][] = [
    [-9, -6, 0.3],
    [3, -10, 1.1],
    [11, 2, 0.7],
    [-2, 3, 0.2],
    [-12, 8, 1.4],
    [5, 12, 0.9],
  ]
  coals.forEach(([x, z, ry], i) => {
    g.add(rbox(5, 3, 4.6, '#2b2829', { x, y: rim - 11.8, z, ry }, 1))
    if (i % 2 === 0) g.add(lit(ball(1.3, EMBER, { x: x + 0.8, y: rim - 8.9, z: z + 0.6 }, [1.4, 0.5, 1.2]), EMBER, 0.9))
  })
  // 烤网：一圈外框 + 一排横条
  const gy = rim - 2.6
  g.add(torus(26, 0.4, STEEL, { y: gy, rx: PI / 2 }))
  for (let z = -22; z <= 22.01; z += 4.4) g.add(noOutline(cylX(0.28, 2 * Math.sqrt(26 * 26 - z * z), STEEL, 0, gy, z, 6)))
  // 炉身正面的提手
  g.add(cylX(1.2, 13, handle, 0, rim - 5, r + 3, 10))
  for (const s of [-1, 1]) g.add(rod3([s * 5.5, rim - 5, r - 1.5], [s * 5.5, rim - 5, r + 3], 0.55, metal, 6))
  // 三条腿：前面一条带橡胶脚，后面两条架着轮轴
  const hipY = rim - 20.5
  g.add(rod3([0, hipY, 13], [0, 1.6, 26], 1.1, metal, 8))
  g.add(ball(1.6, RUBBER, { y: 1.6, z: 26 }))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 12, hipY, -7], [s * 23, 7.5, -17], 1.1, metal, 8))
    g.add(wheelX(7.5, 3.5, '#e9e7e2', s * 26.5, 7.5, -17))
  }
  g.add(cylX(0.7, 50, STEEL, 0, 7.5, -17, 8))
  // 腿之间的三角铁丝置物架
  const sy = 23
  const kf = (hipY - sy) / (hipY - 1.6)
  const kb = (hipY - sy) / (hipY - 7.5)
  const fr: V3 = [0, sy, 13 + 13 * kf]
  const bl: V3 = [-(12 + 11 * kb), sy, -7 - 10 * kb]
  const br: V3 = [12 + 11 * kb, sy, -7 - 10 * kb]
  g.add(rod3(fr, bl, 0.45, STEEL, 6), rod3(fr, br, 0.45, STEEL, 6), rod3(bl, br, 0.45, STEEL, 6))
  for (const t of [0.3, 0.55, 0.8]) {
    const l: V3 = [bl[0] * t, sy, bl[2] + (fr[2] - bl[2]) * (1 - t)]
    g.add(noOutline(rod3(l, [-l[0], l[1], l[2]], 0.3, STEEL, 6)))
  }
  // 灰盘：炉底一根短柱吊着一只浅盘，前面伸出拨灰的拉杆
  g.add(cyl(1.3, 1.3, 10.5, metal, { y: rim - depth - 9.5 }, 10))
  g.add(cup(9.5, 7, 3.5, 0.5, metal, { y: rim - depth - 10 }))
  g.add(rod3([0, rim - depth - 3.5, 0], [0, rim - depth - 4.5, 13], 0.4, STEEL, 6))
  g.add(ball(0.9, handle, { y: rim - depth - 4.5, z: 13 }))
  // 盖子：穹顶挂在炉身背后（口朝炉身），顶上是提手和一只风门
  const lid = new THREE.Group()
  lid.add(bowlShell(r + 0.4, 19, 1.1, enamel))
  for (const s of [-1, 1]) lid.add(rod3([s * 5, -17.5, 0], [s * 5, -23.5, 0], 0.55, metal, 6))
  lid.add(cylX(1.3, 14, handle, 0, -24, 0, 10))
  // 风门：沿穹顶表面法线嵌进去的一只扁圆盘，中间一颗深色旋钮
  const vs: V3 = [0, -13.2, -20.4]
  const vn: V3 = [0, -0.822, -0.569]
  const along = (k: number): V3 => [vs[0] + vn[0] * k, vs[1] + vn[1] * k, vs[2] + vn[2] * k]
  lid.add(rod3(along(-0.6), along(0.6), 4.2, metal, 16))
  lid.add(noOutline(rod3(along(0.4), along(0.9), 1.2, shade(metal, -0.25), 8)))
  g.add(P(lid, 0, rim - 2, -(r + 0.9), PI / 2))
  // 挂盖架：两根钢丝从炉身口沿背后竖上去，顶上一根横档勾住盖子的上沿
  for (const s of [-1, 1]) g.add(rod3([s * 6, rim - 1, -(r - 1.2)], [s * 6, rim + 26.3, -(r + 0.6)], 0.45, STEEL, 6))
  g.add(cylX(0.45, 13, STEEL, 0, rim + 26.6, -(r + 0.9), 6))
  return fitGroup(g)
}

// ---------- 燃气烧烤炉：带脚轮的底柜上架着炉膛和拱形翻盖，正面三只旋钮，两侧各一块置物板，右板底下立着煤气罐 ----------

const GG = { cab: 62, cabD: 48, y0: 9, box: 67, lid: 82 }
/** 翻盖的侧面轮廓（[z, y]）：后背直、顶上一道弧、正面直 */
const GG_LID: V2[] = [
  [-25, 82],
  [-25, 97],
  [-22, 103],
  [-16, 107.5],
  [-8, 110],
  [4, 110],
  [13, 107.5],
  [20, 103],
  [23.5, 97],
  [23.5, 82],
]
function gasGrill(p: string[]) {
  const [body, shelf, tank] = p
  const g = new THREE.Group()
  // 脚轮
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(wheelX(4, 3, STEEL, sx * 26, 4, sz * 19 - 1))
      g.add(rbox(5, 1.6, 5, DARK, { x: sx * 26, y: 7.6, z: sz * 19 - 1 }, 0.4))
    }
  // 底柜 + 两扇门
  g.add(rbox(GG.cab, GG.box - GG.y0, GG.cabD, body, { y: GG.y0, z: -1 }, 1.5))
  for (const s of [-1, 1]) {
    g.add(rbox(29.6, 51, 1.2, body, { x: s * 15.2, y: 12.5, z: 23.5 }, 0.5))
    g.add(rbox(1.2, 16, 1.4, STEEL, { x: s * 2.8, y: 42, z: 24.7 }, 0.4))
  }
  // 炉膛 + 控制面板：三只旋钮、一颗点火钮
  g.add(rbox(66, GG.lid - GG.box, 50, DARK, { y: GG.box, z: -1 }, 2))
  g.add(rbox(66, 9, 3, '#d5d8dc', { y: GG.box + 2.5, z: 25 }, 1))
  for (const x of [-18, 0, 18]) {
    g.add(cylZ(2.3, 2.4, DARK, x, GG.box + 7, 27.5, 14))
    g.add(noOutline(rbox(0.5, 2, 0.4, '#f2f2ee', { x, y: GG.box + 7.2, z: 28.7 }, 0.1)))
  }
  g.add(cylZ(1.1, 1.6, '#d8483f', 27, GG.box + 7, 27.2, 10))
  // 翻盖：拱形盖身 + 两端深色的铸铝端盖，正面一根横把手和温度计
  g.add(sideSlab(GG_LID, 62, body))
  const capPts = GG_LID.map(([z, y]): V2 => [(z + 0.75) * 1.03 - 0.75, 82 + (y - 82) * 1.03])
  for (const s of [-1, 1]) g.add(sideSlab(capPts, 2.4, DARK, s * 32.2))
  g.add(cylX(1.3, 52, STEEL, 0, 89, 29, 12))
  for (const s of [-1, 1]) g.add(cylZ(0.9, 5.6, STEEL, s * 22, 89, 26.2, 8))
  g.add(cylZ(2.4, 1.2, STEEL, 0, 94.2, 23.9, 16))
  g.add(noOutline(cylZ(1.9, 0.4, '#f6f6f2', 0, 94.2, 24.6, 16)))
  // 两侧置物板：板 + 底下两根托臂 + 斜撑
  for (const s of [-1, 1]) {
    g.add(rbox(30, 2.6, 42, shelf, { x: s * 48, y: GG.lid - 2.6, z: -1 }, 1))
    for (const z of [-15, 13]) {
      g.add(rbox(30.6, 2, 2.4, DARK, { x: s * 47.9, y: GG.lid - 4.6, z }, 0.5))
      g.add(rod3([s * 32.6, GG.box + 1, z], [s * 57, GG.lid - 4, z], 0.8, DARK, 6))
    }
  }
  // 左板前沿的三只挂钩，中间挂着一把铲子
  for (const x of [-40, -48, -56]) {
    g.add(rod3([x, GG.lid - 1.6, 19], [x, GG.lid - 1.6, 22.6], 0.4, STEEL, 6))
    g.add(rod3([x, GG.lid - 1.4, 22.6], [x, GG.lid - 4.6, 22.6], 0.4, STEEL, 6))
  }
  g.add(rbox(1.8, 12, 1, DARK, { x: -48, y: 66.4, z: 22.6 }, 0.4))
  g.add(rod3([-48, 67, 22.6], [-48, 59, 22.6], 0.35, STEEL, 6))
  g.add(rbox(7, 9.5, 0.5, STEEL, { x: -48, y: 50, z: 22.6 }, 0.2))
  // 煤气罐：底圈、罐身、护圈、阀门，胶管接到炉膛侧面
  const tx = 48
  const tz = -1
  g.add(cyl(10.5, 10.5, 3, shade(tank, -0.12), { x: tx, z: tz }, 20))
  g.add(capsule(13.5, 15, tank, { x: tx, y: 2.5, z: tz }))
  g.add(noOutline(cyl(13.65, 13.65, 6, '#f6f4ee', { x: tx, y: 21, z: tz }, 24)))
  g.add(cup(8.5, 8.5, 7, 0.8, shade(tank, -0.12), { x: tx, y: 42, z: tz }))
  g.add(cyl(1.6, 1.6, 5.5, '#c9a25a', { x: tx, y: 43.5, z: tz }, 10))
  g.add(cyl(2.8, 2.8, 1.2, DARK, { x: tx, y: 49, z: tz }, 12))
  g.add(
    tube(
      [
        [tx, 47.5, tz],
        [tx + 6, 57, tz - 5],
        [tx - 3, 68, tz - 8],
        [33.4, 73, tz - 8],
      ],
      0.7,
      DARK,
      { seg: 20, radial: 6 },
    ),
  )
  return g
}

// ---------- 庭院遮阳伞：混凝土圆底座上一根立杆，撑开八片伞布（带垂边），底下八根伞骨和撑杆，顶上一只透气顶帽 ----------

const PS = { r: 135, rim: 198, top: 240 }
function parasol(p: string[]) {
  const [canvas, trim, pole] = p
  const g = new THREE.Group()
  const { r, rim, top } = PS
  // 底座：混凝土圆饼 + 套管 + 紧固螺栓
  g.add(puck(26, 9, CONCRETE))
  g.add(cyl(4, 4.6, 14, DARK, { y: 8.5 }, 16))
  g.add(cylZ(0.8, 5, STEEL, 0, 17, 5.5, 8))
  g.add(ball(1.5, DARK, { y: 17, z: 8.4 }))
  // 立杆 + 摇柄盒
  g.add(cyl(2.2, 2.2, top - 3, pole, { y: 9 }, 14))
  g.add(rbox(6.4, 9, 6.4, DARK, { y: 106 }, 1.2))
  g.add(cylZ(0.6, 5, STEEL, 0, 110.5, 5, 6))
  g.add(rod3([0, 110.5, 7.3], [5.5, 107, 7.3], 0.6, STEEL, 6))
  g.add(cylZ(1, 4, DARK, 5.5, 107, 9.2, 8))
  // 伞布：八片三角形薄板交替两色，外沿各垂下一条垂边
  const rimAt = (i: number, y: number, k = 1): V3 => [Math.cos((i * PI) / 4) * r * k, y, Math.sin((i * PI) / 4) * r * k]
  for (let i = 0; i < 8; i++) {
    const color = i % 2 ? trim : canvas
    const t = 0.8
    g.add(flatSolid([[0, top, 0], rimAt(i, rim), rimAt(i + 1, rim)], [[0, top - t, 0], rimAt(i, rim - t), rimAt(i + 1, rim - t)], color))
    const k = 1 - 0.7 / r
    g.add(
      flatSolid(
        [rimAt(i, rim - t), rimAt(i + 1, rim - t), rimAt(i + 1, rim - t - 10), rimAt(i, rim - t - 10)],
        [rimAt(i, rim - t, k), rimAt(i + 1, rim - t, k), rimAt(i + 1, rim - t - 10, k), rimAt(i, rim - t - 10, k)],
        shade(color, -0.07),
      ),
    )
  }
  // 伞骨：顶毂到八个角；撑杆：滑套到伞骨中段
  g.add(cyl(4.5, 4.5, 5, DARK, { y: top - 7 }, 14))
  g.add(cyl(4.2, 4.2, 6, DARK, { y: 163 }, 14))
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4
    const tip: V3 = [Math.cos(a) * r * 0.99, rim - 1.8, Math.sin(a) * r * 0.99]
    g.add(rod3([0, top - 2.4, 0], tip, 0.7, pole, 6))
    g.add(rod3([Math.cos(a) * 3.5, 166, Math.sin(a) * 3.5], [tip[0] * 0.5, (top - 2.4 + tip[1]) / 2 - 0.6, tip[2] * 0.5], 0.6, pole, 6))
  }
  // 顶帽：小一号的八角锥盖在顶上，尖上一颗圆头
  g.add(cyl(0.6, 30, 9, trim, { y: top - 5 }, 8))
  g.add(ball(2.6, pole, { y: top + 7 }))
  return g
}

// ---------- 充气泳池：三圈充气环叠成的圆池，里面一层水，水上漂着一只小黄鸭和一只充气球 ----------

const KP = { r: 68, tube: 7, water: 24 }
function kiddiePool(p: string[]) {
  const [ringA, ringB, floor] = p
  const g = new THREE.Group()
  const ys = [7, 19.5, 32]
  ys.forEach((y, i) => g.add(ringTube(KP.r, KP.tube, i % 2 ? ringB : ringA, y)))
  g.add(cyl(66, 66, 1.2, floor, { y: 0.4 }, 48))
  // 水面
  g.add(markWater(noOutline(clearMat(cyl(63.2, 63.2, 0.4, WATER, { y: KP.water - 0.4 }, 48), WATER, 0.6))))
  // 气嘴
  g.add(cyl(1.1, 1.1, 1.4, '#f6f4ee', { x: Math.cos(2.2) * KP.r, y: 38.6, z: Math.sin(2.2) * KP.r }, 10))
  // 小黄鸭：身子、翘尾巴、脑袋、扁嘴、两只眼睛
  const duck = new THREE.Group()
  duck.add(ball(6.5, DUCK, { y: 2.4 }, [1, 0.8, 1.25]))
  duck.add(ball(2.6, DUCK, { y: 5, z: -7 }, [0.9, 0.8, 1.2]))
  for (const s of [-1, 1]) duck.add(ball(3.2, shade(DUCK, -0.06), { x: s * 5.6, y: 3, z: -0.5 }, [0.45, 0.7, 1.2]))
  duck.add(ball(4.2, DUCK, { y: 9.4, z: 4.6 }))
  duck.add(ball(1.7, '#ff8a3d', { y: 8.6, z: 8.8 }, [1.2, 0.55, 1]))
  for (const s of [-1, 1]) duck.add(noOutline(ball(0.6, '#3a2a2a', { x: s * 1.9, y: 10.6, z: 8.1 })))
  g.add(P(duck, -24, KP.water, 12, 0, 0.7))
  // 充气球：六瓣球面拼成，白色和三种颜色交替
  const bb = new THREE.Group()
  const gore = cached('od-gore', () => new THREE.SphereGeometry(1, 3, 10, 0, PI / 3))
  ;['#fbf7f1', ringA, '#fbf7f1', ringB, '#fbf7f1', floor].forEach((c, k) => {
    const m = mesh(gore, c)
    m.scale.setScalar(9)
    m.rotation.y = (k * PI) / 3
    bb.add(m)
  })
  g.add(P(bb, 22, KP.water + 6.8, -16, 0.5, 0.3, 0.4))
  return g
}

// ---------- 篝火盆：三条撇腿托着一只浅钢盆，盆里一层灰、两根横柴上搭着三根立柴，火苗交给粒子特效 ----------

const FP = { r: 33, rim: 30, depth: 14 }
function firePit(p: string[]) {
  const [bowl, frame, wood] = p
  const g = new THREE.Group()
  g.add(P(bowlShell(FP.r, FP.depth, 1.4, bowl), 0, FP.rim, 0))
  g.add(torus(FP.r, 1.1, frame, { y: FP.rim, rx: PI / 2 }))
  // 三条腿 + 一圈拉撑
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 6
    g.add(rod3([Math.cos(a) * 21, 20, Math.sin(a) * 21], [Math.cos(a) * 30, 0.6, Math.sin(a) * 30], 1.3, frame, 8))
    g.add(cyl(2.4, 2.4, 0.8, frame, { x: Math.cos(a) * 30, z: Math.sin(a) * 30 }, 10))
  }
  g.add(torus(25.6, 0.6, frame, { y: 10, rx: PI / 2 }))
  // 灰层 + 中间一片烧红的炭
  g.add(cyl(21, 13, 2.6, ASH, { y: 18.5 }, 24))
  g.add(lit(cyl(9, 9, 0.5, '#e8622a', { y: 21 }, 16), '#e8622a', 0.8))
  for (const [x, z] of [
    [-8, 6],
    [9, 3],
    [2, -9],
    [-4, -3],
  ])
    g.add(lit(ball(1.6, EMBER, { x, y: 21.9, z }, [1.4, 0.6, 1.2]), EMBER, 0.95))
  // 两根横柴交叠着垫底，三根立柴搭成尖堆
  g.add(logRod([-17, 23.8, -5], [17, 24.4, 3], 2.8, wood))
  g.add(logRod([-4, 25.6, -17], [5, 27.4, 16], 2.8, shade(wood, -0.06)))
  for (let k = 0; k < 3; k++) {
    const b = 0.5 + k * 2.1
    g.add(logRod([Math.cos(b) * 19, 24, Math.sin(b) * 19], [-Math.cos(b) * 3, 35.5, -Math.sin(b) * 3], 2.5, shade(wood, k === 1 ? 0.05 : -0.03)))
  }
  return g
}
const FP_FX: Fx[] = [
  { kind: 'flame', x: 0, y: 28, z: 0, scale: 2.6 },
  { kind: 'flame', x: -7, y: 25.5, z: 4, scale: 1.4 },
  { kind: 'flame', x: 7, y: 25.5, z: -5, scale: 1.4 },
]

// ---------- 户外藤编双人沙发：一圈圈藤编纹的箱形底座、扶手和靠背，两块厚坐垫、两块靠垫和一只抱枕 ----------

const RS = { w: 150, d: 80, seat: 28, arm: 58, back: 66, t: 14 }
function rattanSofa(p: string[]) {
  const [rattan, cushion, pillow] = p
  const g = new THREE.Group()
  const weave = shade(rattan, -0.13)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 4.4, 6, DARK, { x: sx * (RS.w / 2 - 7), z: sz * (RS.d / 2 - 7) }, 1))
  // 底座、两只扶手、靠背
  g.add(rbox(RS.w, RS.seat - 4, RS.d, rattan, { y: 4 }, 2))
  g.add(wickerBands(RS.w, RS.d, 4.5, RS.seat, weave))
  for (const s of [-1, 1]) {
    const x = s * (RS.w / 2 - RS.t / 2)
    g.add(rbox(RS.t, RS.arm - 4, RS.d, rattan, { x, y: 4 }, 2.5))
    g.add(wickerBands(RS.t, RS.d, RS.seat, RS.arm - 1, weave, x))
  }
  const bz = -RS.d / 2 + RS.t / 2
  g.add(rbox(RS.w, RS.back - 4, RS.t, rattan, { y: 4, z: bz }, 2.5))
  g.add(wickerBands(RS.w, RS.t, RS.seat, RS.back - 1, weave, 0, bz))
  // 坐垫、靠垫（略微后仰）、一只斜靠着的抱枕
  for (const s of [-1, 1]) {
    g.add(rbox(60.5, 12, 64, cushion, { x: s * 30.5, y: RS.seat, z: 6 }, 4))
    g.add(P(rbox(60, 30, 13, cushion, {}, 5), s * 30.5, RS.seat + 12 + 14.6, -19.5, -0.14))
  }
  g.add(P(rbox(30, 30, 9, pillow, {}, 4.2), -40, RS.seat + 12 + 13.6, -7, -0.4, 0.25, 0.12))
  return g
}

// ---------- 户外藤编茶几：藤编围边的箱形桌身，四角包边，顶上一圈边框托着一块玻璃面 ----------

const RT = { w: 90, d: 50, h: 40 }
function rattanTable(p: string[]) {
  const [rattan, trim, glass] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 3.4, 5, DARK, { x: sx * (RT.w / 2 - 6), z: sz * (RT.d / 2 - 6) }, 0.8))
  g.add(rbox(RT.w - 2, RT.h - 5.8, RT.d - 2, rattan, { y: 3 }, 1.2))
  g.add(wickerBands(RT.w - 2, RT.d - 2, 3.5, RT.h - 3, shade(rattan, -0.13)))
  // 四角的包边立柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3.4, RT.h - 5.8, 3.4, trim, { x: sx * (RT.w / 2 - 2.2), y: 3, z: sz * (RT.d / 2 - 2.2) }, 0.8))
  // 顶框 + 玻璃面
  g.add(rbox(RT.w, 2, RT.d, trim, { y: RT.h - 2.8 }, 0.8))
  g.add(ghost(rbox(RT.w - 3, 0.8, RT.d - 3, glass, { y: RT.h - 0.8 }, 0.3), glass, 0.5))
  return g
}

// ---------- 立杆喂鸟器：立杆顶上一只带矮边的木托盘，四根角柱撑起人字屋顶，中间一只装满鸟食的透明料斗，托盘边上站着一只小鸟 ----------

const BF = { tray: 139, ridge: 166, a: 0.6, post: 10.5 }
function birdFeeder(p: string[]) {
  const [wood, roof, bird] = p
  const g = new THREE.Group()
  const { tray: ty, ridge, a } = BF
  const floor = ty + 1.2
  // 地上一块圆底座、立杆、托盘下的法兰
  g.add(puck(9, 2.5, DARK))
  g.add(cyl(1.8, 1.8, ty - 2, DARK, { y: 2 }, 12))
  g.add(cyl(4, 2.2, 2.5, DARK, { y: ty - 2.5 }, 12))
  // 托盘 + 撒在盘里的一层鸟食
  g.add(tray(26, 3.2, 26, 1.2, wood, { y: ty }))
  g.add(noOutline(rbox(22, 0.8, 22, SEED, { y: ty + 1 }, 0.3)))
  // 料斗：透明的方筒里装着大半筒鸟食
  const eave = ridge - 8
  g.add(rbox(10.6, 9, 10.6, SEED, { y: floor + 0.1 }, 0.6))
  g.add(ghost(rbox(12, eave - 1.6 - floor, 12, '#dff2fb', { y: floor }, 0.4), '#dff2fb', 0.3))
  // 四根角柱 + 前后两道檐梁，檐梁上是山墙三角板（正面开一只圆洞）
  const k = BF.post
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.6, ridge - 7.7 - floor, 1.6, wood, { x: sx * k, y: floor, z: sz * k }, 0.4))
  for (const sz of [-1, 1]) {
    g.add(rbox(22.6, 1.6, 1.6, wood, { y: eave - 1.6, z: sz * k }, 0.4))
    const tri = (z: number): V3[] => [
      [-k, eave, z],
      [k, eave, z],
      [0, ridge - 1, z],
    ]
    g.add(flatSolid(tri(sz * k - 0.5), tri(sz * k + 0.5), wood))
  }
  g.add(noOutline(cylZ(2, 1.4, shade(wood, -0.3), 0, eave + 2.6, k, 14)))
  // 人字屋顶：两块斜板在屋脊相交，屋脊盖一根圆脊
  for (const s of [-1, 1]) g.add(P(rbox(20, 1.4, 32, roof, {}, 0.5), s * 10 * Math.cos(a), ridge - 10 * Math.sin(a), 0, 0, 0, -s * a))
  g.add(cylZ(1.2, 33, shade(roof, -0.1), 0, ridge + 0.7, 0, 12))
  // 小鸟：圆身子、脑袋、尖嘴、翘尾巴、两只翅膀、细脚，站在托盘前沿上
  const b = new THREE.Group()
  b.add(ball(2.6, bird, { y: 3.2 }, [0.85, 0.8, 1.15]))
  b.add(ball(2.1, '#fbf3e4', { y: 2.8, z: 1.4 }, [0.75, 0.7, 0.9]))
  b.add(ball(1.9, bird, { y: 5.6, z: 1.6 }))
  b.add(P(cyl(0, 0.55, 1.2, '#f0a23a', {}, 8), 0, 5.4, 3.9, PI / 2))
  b.add(P(rbox(2.2, 0.5, 3.2, shade(bird, -0.12), {}, 0.2), 0, 3.9, -3.3, 0.5))
  for (const s of [-1, 1]) {
    b.add(ball(1.6, shade(bird, -0.08), { x: s * 1.9, y: 3.4, z: -0.3 }, [0.4, 0.7, 1.2]))
    b.add(rod3([s * 0.8, 1.6, 0.3], [s * 0.8, 0, 0.3], 0.18, '#d08a3a', 4))
  }
  b.add(face(2.6, { y: 6, z: 3.2 }))
  g.add(P(b, 6, ty + 3.2, 12.4, 0, 0.3))
  return g
}

// ---------- 手推割草机：四轮的圆鼓机壳上坐着一台小汽油机，后面挂一只集草袋，两根长把手斜伸到后上方，顶上横握把和安全拉杆 ----------

const LM = { z0: 40, hx: 21 }
function lawnMower(p: string[]) {
  const [deck, bag, trim] = p
  const g = new THREE.Group()
  const { z0, hx } = LM
  // 机壳：底下一圈裙边 + 上面圆鼓的壳
  g.add(rbox(46, 8, 52, deck, { y: 7, z: z0 }, 3))
  g.add(rbox(42, 7, 46, deck, { y: 13, z: z0 + 1 }, 5))
  // 轮子：前小后大
  for (const s of [-1, 1]) {
    g.add(wheelX(9, 4, trim, s * 25.5, 9, z0 + 18))
    g.add(wheelX(10, 4, trim, s * 25.5, 10, z0 - 18))
  }
  // 汽油机：机体、启动器罩、油箱盖、侧面的空滤盒
  g.add(cyl(10, 11, 9, ENGINE, { y: 19.5, z: z0 + 2 }, 20))
  g.add(puck(9.5, 4, shade(deck, -0.12), { y: 28, z: z0 + 2 }))
  g.add(cyl(2.2, 2.2, 2, '#d8483f', { x: -4.5, y: 31.6, z: z0 + 4.5 }, 12))
  g.add(rbox(8, 7, 6, DARK, { x: 9, y: 21, z: z0 + 10 }, 1.2))
  // 集草袋：布袋挂在机壳后口，顶上一圈硬塑料框和提手
  g.add(rbox(38, 24, 50, bag, { y: 9, z: -10 }, 6))
  g.add(rbox(40, 3, 52, DARK, { y: 32, z: -10 }, 1.2))
  const grip: V3[] = [
    [-8, 34.5, -12],
    [-6, 38.5, -12],
    [6, 38.5, -12],
    [8, 34.5, -12],
  ]
  g.add(tube(grip, 0.9, DARK, { seg: 12, radial: 6 }))
  // 把手：两根斜管从机壳后侧伸到后上方，中间一颗折叠旋钮，顶上横握把（套着泡棉）和安全拉杆
  const lo = (s: number): V3 => [s * hx, 14, 18]
  const hi = (s: number): V3 => [s * hx, 97, -71]
  const at = (s: number, t: number): V3 => {
    const [a, b] = [lo(s), hi(s)]
    return [a[0], a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }
  for (const s of [-1, 1]) {
    g.add(rbox(3, 6, 5, DARK, { x: s * hx, y: 12, z: 17 }, 0.8))
    g.add(rod3(lo(s), hi(s), 1.2, trim, 10))
    const m = at(s, 0.5)
    g.add(cylX(2.2, 2.2, DARK, m[0] + s * 1.6, m[1], m[2], 12))
    const q = at(s, 0.9)
    g.add(rod3([q[0] - s * 1.1, q[1], q[2]], [s * (hx - 1.2), 94, -68], 0.5, STEEL, 6))
  }
  g.add(cylX(1.3, hx * 2 + 2.4, trim, 0, 97, -71, 12))
  g.add(cylX(1.9, 30, RUBBER, 0, 97, -71, 12))
  g.add(cylX(0.6, (hx - 1.2) * 2, STEEL, 0, 94, -68, 8))
  // 启动拉绳：从启动器拉到右边把手上的导绳钩
  const cord: V3[] = [
    [6, 30, z0 - 3],
    [12, 34, 10],
    [hx - 1, 44, at(1, 0.36)[2]],
  ]
  g.add(tube(cord, 0.3, '#e9e4d4', { seg: 12, radial: 4 }))
  return fitGroup(g)
}

// ---------- 花园小矮人：草皮圆座上站着的小矮人，尖尖的红帽子、白胡子盖住胸口、大鼻子，双手叉在肚子前，腰上一根皮带 ----------

function gnome(p: string[]) {
  const [hat, coat, pants] = p
  const g = new THREE.Group()
  g.add(puck(9, 2, GRASS))
  // 靴子、裤腿
  for (const s of [-1, 1]) {
    g.add(ball(2.6, BOOT, { x: s * 2.8, y: 3.4, z: 1.2 }, [1, 0.6, 1.4]))
    g.add(cyl(2.1, 2.3, 4, pants, { x: s * 2.4, y: 3.4 }, 12))
  }
  // 身子（上衣）+ 圆肩、皮带和铜扣
  g.add(cyl(4.6, 6.6, 11, coat, { y: 6.5 }, 20))
  g.add(ball(4.8, coat, { y: 17 }, [1, 0.6, 0.95]))
  g.add(torus(5.9, 0.7, BELT, { y: 10.5, rx: PI / 2 }))
  g.add(rbox(2.4, 2, 0.8, '#e0b84a', { y: 9.5, z: 6.3 }, 0.3))
  // 两只胳膊从肩膀垂下来，手搭在肚子前
  for (const s of [-1, 1]) {
    g.add(rod3([s * 4.8, 16.2, 0], [s * 4.4, 11.8, 4.4], 1.6, coat, 10))
    g.add(ball(1.6, coat, { x: s * 4.8, y: 16.2 }))
    g.add(ball(1.7, SKIN, { x: s * 4, y: 11.3, z: 5.3 }))
  }
  // 脑袋、白胡子（一大团盖住胸口 + 两腮 + 两撇小胡子）、大鼻子、眼睛
  g.add(ball(4.4, SKIN, { y: 21.5, z: 0.4 }))
  g.add(ball(4.2, BEARD, { y: 17.6, z: 3.2 }, [1.05, 1.25, 0.6]))
  for (const s of [-1, 1]) {
    g.add(ball(2.8, BEARD, { x: s * 2.6, y: 19.4, z: 2.6 }))
    g.add(ball(1.5, BEARD, { x: s * 1.3, y: 20.1, z: 4.4 }, [1.3, 0.7, 0.8]))
  }
  g.add(ball(1.4, shade(SKIN, -0.06, 0.1), { y: 21, z: 4.8 }))
  g.add(face(5, { y: 22.5, z: 4.35 }))
  // 尖帽子：帽檐、圆锥帽身、往前耷拉的帽尖
  g.add(cyl(5, 5.2, 1.4, hat, { y: 23.6 }, 20))
  g.add(cyl(1.8, 4.9, 10, hat, { y: 25 }, 20))
  g.add(taperRod3([0, 34.6, 0], [0, 40.2, 2.8], 1.9, 0.5, hat, 12))
  g.add(ball(0.7, hat, { y: 40.2, z: 2.8 }))
  return g
}

// ---------- 蹲踞：碎石铺的「海」里一只圆形石手水钵，背后竹筧引水注入，钵沿横搁一把竹勺；前石、手烛石、汤桶石三块役石围着 ----------

/** 椭圆多边形（[x, z]），中心在原点 */
const ovalPoly = (rx: number, rz: number, n = 24): Poly => Array.from({ length: n }, (_, i): [number, number] => [Math.cos((i / n) * PI * 2) * rx, Math.sin((i / n) * PI * 2) * rz])

/** 竹管的开口：沿 a → b 方向在 b 端塞一片深色的圆片（看上去是空心的） */
function bambooMouth(a: V3, b: V3, r: number) {
  const len = dist(a, b)
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]
  const p = (t: number): V3 => [b[0] + d[0] * t, b[1] + d[1] * t, b[2] + d[2] * t]
  return noOutline(rod3(p(-0.4), p(0.12), r, BAMBOO_IN, 10))
}

const TB = { bz: -8, y0: 0.6 }
/** 石手水钵的车削轮廓：上口一圈平沿，中间挖一只碗形的水穴 */
const TB_BASIN: V2[] = [
  [0, 0],
  [14.5, 0],
  [17, 3],
  [18, 9],
  [17.8, 20],
  [17, 24.5],
  [16, 26],
  [9.5, 26],
  [8.5, 25],
  [8, 20.5],
  [0, 20.5],
]
function tsukubai(p: string[]) {
  const [stone, bamboo, gravel] = p
  const g = new THREE.Group()
  const { bz, y0 } = TB
  const top = y0 + 26
  // 碎石铺地 + 几颗黑色的那智石
  g.add(slab(ovalPoly(37, 31), 1.2, gravel))
  const r = rng(41)
  for (let i = 0; i < 9; i++) {
    const a = 0.4 + i * 0.68 + r() * 0.2
    const d = 22 + r() * 5
    g.add(pebble([3.2 + r() * 1.4, 1.5, 2.6 + r() * 1.2], NACHI, 20 + i, Math.cos(a) * d * 1.1, bz + Math.sin(a) * d, r() * 3, 0.9))
  }
  // 石手水钵 + 水面
  g.add(P(lathe(TB_BASIN, stone, 32), 0, y0, bz))
  g.add(markWater(noOutline(clearMat(cyl(8.3, 8.3, 0.4, WATER, { y: y0 + 23.4, z: bz }, 24), WATER, 0.6))))
  // 竹筧：背后一根竹立柱，侧面伸出一根细竹管，水从管口落进钵里
  const post: [V3, V3] = [
    [10, 0.5, -30],
    [10, 46, -30],
  ]
  g.add(bambooRod(post[0], post[1], 2.2, bamboo))
  g.add(bambooMouth(post[0], post[1], 1.7))
  const pipe: [V3, V3] = [
    [10, 43, -28.4],
    [2, 38, -12],
  ]
  g.add(bambooRod(pipe[0], pipe[1], 1.3, bamboo, 9))
  g.add(bambooMouth(pipe[0], pipe[1], 0.9))
  g.add(noOutline(clearMat(rod3([1.8, 37.2, -11.6], [1.8, y0 + 23.6, -11.6], 0.35, WATER, 8), WATER, 0.5)))
  // 竹勺（柄杓）：勺头立在钵沿上，长柄横搁过水穴
  const cx = -12
  const cz = bz + 3.5
  g.add(cup(3, 2.8, 3.6, 0.4, shade(bamboo, 0.05), { x: cx, y: top, z: cz }))
  g.add(rod3([cx + 2.6, top + 2.2, cz - 1.1], [11, top + 0.55, bz - 7], 0.55, shade(bamboo, 0.05), 8))
  // 役石：前石扁平宽大、手烛石高、汤桶石矮一点
  const yaku = shade(stone, -0.08)
  g.add(pebble([30, 7, 18], yaku, 3, 0, 22, 0.15))
  g.add(pebble([18, 20, 16], yaku, 5, -28, -4, 0.4))
  g.add(pebble([16, 13, 15], yaku, 7, 27, -2, -0.3))
  return fitGroup(g)
}

// ---------- 鹿威し：两根竹支柱夹着一根斜竹筒，筒口朝上接竹筧落下的水，筒尾搁在击石上；底下铺一片碎石 ----------

const SO = { piv: [2, 26] as [number, number], tilt: PI / 6, back: 25.3, front: 20.7 }
function shishiOdoshi(p: string[]) {
  const [bamboo, stone, gravel] = p
  const g = new THREE.Group()
  const [px, py] = SO.piv
  const c = Math.cos(SO.tilt)
  const s = Math.sin(SO.tilt)
  g.add(slab(ovalPoly(30, 19), 1.2, gravel))
  // 击石：筒尾落下来敲的那块石头，另有两块小石点缀
  g.add(pebble([14, 10.5, 13], stone, 11, -19, 0, 0.3, 0.6))
  g.add(pebble([9, 5, 8], shade(stone, 0.06), 13, -6, 11, 1.1, 0.6))
  g.add(pebble([7, 4, 6], shade(stone, -0.05), 17, 10, -11, 2, 0.6))
  // 竹筒：尾端封口（竹节），筒口朝上
  const tail: V3 = [px - SO.back * c, py - SO.back * s, 0]
  const mouth: V3 = [px + SO.front * c, py + SO.front * s, 0]
  g.add(bambooRod(tail, mouth, 3.2, bamboo, 15))
  g.add(bambooMouth(tail, mouth, 2.6))
  // 支柱 + 横穿竹筒的轴
  for (const z of [-5.2, 5.2]) g.add(bambooRod([px, 0.6, z], [px, 31, z], 1.7, shade(bamboo, -0.05), 12))
  g.add(cylZ(0.6, 13.6, shade(bamboo, -0.35), px, py, 0, 8))
  // 竹筧：右后方一根高竹柱，细竹管伸到筒口正上方
  const post: [V3, V3] = [
    [24, 0.6, -9],
    [24, 58, -9],
  ]
  g.add(bambooRod(post[0], post[1], 2.3, bamboo))
  g.add(bambooMouth(post[0], post[1], 1.8))
  const pipe: [V3, V3] = [
    [23.6, 54, -7.6],
    [19.4, 46, -0.4],
  ]
  g.add(bambooRod(pipe[0], pipe[1], 1.3, bamboo, 9))
  g.add(bambooMouth(pipe[0], pipe[1], 0.9))
  g.add(noOutline(clearMat(rod3([19.2, 45, 0], [19.2, mouth[1] + 1.5, 0], 0.3, WATER, 8), WATER, 0.5)))
  return fitGroup(g)
}

// ---------- 儿童沙坑：四块木板围成的方框，四角各一块三角坐板，里面铺满沙子，堆着沙堡和沙丘，放着小桶和小铲 ----------

const SB = { w: 120, h: 21.5, t: 4, sand: 16 }
function sandbox(p: string[]) {
  const [wood, bucket, spade] = p
  const g = new THREE.Group()
  const { w, h, t, sand } = SB
  const half = w / 2
  g.add(tray(w, h, w, t, wood))
  // 四角的三角坐板
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(
        slab(
          [
            [sx * (half + 0.5), sz * (half + 0.5)],
            [sx * (half - 22), sz * (half + 0.5)],
            [sx * (half + 0.5), sz * (half - 22)],
          ],
          2.5,
          shade(wood, 0.04),
          h,
        ),
      )
  // 沙子：一整层 + 几个沙丘 + 一座沙堡
  g.add(rbox(w - t * 2 + 1, sand - 3, w - t * 2 + 1, SAND, { y: 3 }, 1))
  const wet = shade(SAND, -0.1)
  g.add(ball(14, SAND, { x: -22, y: sand - 1, z: 14 }, [1, 0.3, 0.8]))
  g.add(ball(10, SAND, { x: 26, y: sand - 1, z: 22 }, [1, 0.3, 1.1]))
  // 沙堡：矮墩子 + 一圈垛口 + 中间的圆塔和尖顶
  g.add(cyl(7, 8, 5, wet, { x: 8, y: sand - 0.5, z: -12 }, 16))
  g.add(cyl(3.2, 3.6, 3.5, wet, { x: 8, y: sand + 4.5, z: -12 }, 12))
  g.add(cyl(0, 3.6, 3, wet, { x: 8, y: sand + 8, z: -12 }, 12))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(rbox(2, 1.6, 2, wet, { x: 8 + Math.cos(a) * 6, y: sand + 4.3, z: -12 + Math.sin(a) * 6, ry: -a }, 0.4))
  }
  // 小桶（提梁放倒搭在桶沿上）和一把小铲子
  const [bx, bz] = [32, -26]
  g.add(cup(5.5, 4.2, 7.5, 0.5, bucket, { x: bx, y: sand - 0.2, z: bz }))
  g.add(torus(5.5, 0.3, shade(bucket, -0.15), { x: bx, y: sand + 7.6, z: bz, rx: PI / 2 }, PI))
  const yaw = 0.5
  const dir: V3 = [Math.sin(yaw), 0, Math.cos(yaw)]
  const [sx0, sz0] = [-30, -24]
  const along = (k: number, y: number): V3 => [sx0 + dir[0] * k, y, sz0 + dir[2] * k]
  g.add(rbox(6.5, 0.6, 8, spade, { x: sx0, y: sand - 0.1, z: sz0, ry: yaw }, 0.25))
  g.add(rod3(along(-3.6, sand + 0.4), along(-18, sand + 1.1), 0.7, spade, 8))
  g.add(ball(1.3, spade, { x: along(-18.6, 0)[0], y: sand + 1.2, z: along(-18.6, 0)[2] }))
  return g
}

// ---------- 立式信箱：木立柱顶上一块托板，托着一只拱顶的铁皮信箱，正面翻门带搭扣，侧面一面竖起的小红旗 ----------

/** 拱顶棱柱：截面是 w 宽、直壁高 wall 的方形上面接一个半圆，沿 z 挤出 len，z 居中、底面在 y = 0 */
function archPrism(w: number, wall: number, len: number, color: string) {
  const r = w / 2
  const s = new THREE.Shape()
  s.moveTo(-r, 0)
  s.lineTo(r, 0)
  s.lineTo(r, wall)
  s.absarc(0, wall, r, 0, PI, false)
  s.lineTo(-r, 0)
  const bevel = Math.min(0.5, len * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: len - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 12 })
  geo.translate(0, 0, -len / 2 + bevel)
  return mesh(geo, color)
}

const MB = { post: 89, box: 91, w: 18, wall: 11, len: 36 }
function mailbox(p: string[]) {
  const [box, post, flag] = p
  const g = new THREE.Group()
  const { w, wall, len } = MB
  // 底板、立柱、门牌、托板 + 两根斜撑
  g.add(rbox(14, 1.5, 14, DARK, {}, 0.4))
  g.add(rbox(8, MB.post - 1.5, 8, post, { y: 1.5 }, 0.8))
  g.add(rbox(6, 9, 0.6, '#f4f1e8', { y: 62, z: 4.1 }, 0.2))
  for (const x of [-1.4, 1.4]) g.add(noOutline(rbox(1.6, 5, 0.3, DARK, { x, y: 64, z: 4.4 }, 0.1)))
  g.add(rbox(14, 2, 30, post, { y: MB.post }, 0.6))
  for (const s of [-1, 1]) g.add(batten([0, 74, s * 3], [0, MB.post + 0.4, s * 12], 3, 3, post))
  // 信箱：拱顶箱身、前后两片略大一圈的门 / 背板、两道加强箍
  const y0 = MB.box
  g.add(P(archPrism(w, wall, len, box), 0, y0, 0))
  const ring = shade(box, -0.08)
  for (const z of [-len / 2 - 0.4, len / 2 + 0.4]) g.add(P(archPrism(w + 0.8, wall, 1.2, ring), 0, y0 - 0.4, z))
  for (const z of [-9, 9]) g.add(P(archPrism(w + 0.6, wall, 0.8, ring), 0, y0 - 0.3, z))
  // 门上的搭扣
  g.add(rbox(3.4, 1.4, 1.4, STEEL, { y: y0 + 15.5, z: len / 2 + 1.3 }, 0.4))
  // 小红旗：螺栓、旗杆、旗面（竖起来表示有信要寄）
  const fx = w / 2 + 1.3
  g.add(cylX(1, 2.6, STEEL, w / 2 + 0.9, y0 + 7, 8, 10))
  g.add(rbox(0.8, 13, 2, flag, { x: fx, y: y0 + 5, z: 8 }, 0.3))
  g.add(rbox(0.8, 5, 6.5, flag, { x: fx, y: y0 + 13, z: 11.5 }, 0.3))
  return fitGroup(g)
}

// ---------- 花园拱门：两侧各两根立柱夹着格子侧网，顶上前后两道半圆拱（内外双拱、辐条相连），藤蔓从柱脚爬上拱顶，开着花 ----------

const GA = { hx: 56, hz: 14, post: 160, r: 56, ri: 49 }
/** 绕着一条路径缠的藤：base(t) 是路径上的点，n1 / n2 是与路径垂直的两个方向，藤离路径中心 off、每单位 t 绕 turns 圈 */
function vinePath(base: (t: number) => V3, n1: (t: number) => V3, n2: (t: number) => V3, steps: number, off: number, turns: number) {
  const pts: V3[] = []
  const outs: V3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * turns * PI * 2
    const [b, u, v] = [base(t), n1(t), n2(t)]
    const o: V3 = [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)]
    pts.push([b[0] + o[0] * off, b[1] + o[1] * off, b[2] + o[2] * off])
    outs.push(o)
  }
  return { pts, outs }
}
function gardenArch(p: string[]) {
  const [frame, flower, flower2] = p
  const g = new THREE.Group()
  const { hx, hz, post, r, ri } = GA
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(1.3, 1.3, post, frame, { x: sx * hx, z: sz * hz }, 10))
      g.add(rbox(5, 1, 5, frame, { x: sx * hx, z: sz * hz }, 0.3))
      // 拱脚：外拱和内拱之间一小段横杆
      g.add(cylX(0.8, r - ri, frame, sx * (r + ri) * 0.5, post, sz * hz, 8))
    }
    // 侧网：五道横档 + 横档之间的交叉斜撑
    const ys = [12, 42, 72, 102, 132]
    for (const y of ys) g.add(cylZ(0.8, hz * 2, frame, sx * hx, y, 0, 8))
    for (let i = 0; i < ys.length - 1; i++) {
      g.add(rod3([sx * hx, ys[i], -hz], [sx * hx, ys[i + 1], hz], 0.6, frame, 6))
      g.add(rod3([sx * hx, ys[i], hz], [sx * hx, ys[i + 1], -hz], 0.6, frame, 6))
    }
  }
  // 顶上的双拱：前后各一道外拱、一道内拱，辐条相连；两道外拱之间横档相连
  for (const sz of [-1, 1]) {
    g.add(torus(r, 1.3, frame, { y: post, z: sz * hz }, PI))
    g.add(torus(ri, 0.9, frame, { y: post, z: sz * hz }, PI))
    for (let k = 1; k < 6; k++) {
      const a = (k / 6) * PI
      g.add(rod3([Math.cos(a) * ri, post + Math.sin(a) * ri, sz * hz], [Math.cos(a) * r, post + Math.sin(a) * r, sz * hz], 0.6, frame, 6))
    }
  }
  for (let k = 1; k < 12; k++) {
    const a = (k / 12) * PI
    g.add(cylZ(0.8, hz * 2, frame, Math.cos(a) * r, post + Math.sin(a) * r, 0, 8))
  }
  // 藤蔓：一根从左前柱脚缠上去、沿前拱爬过拱顶；一根从右后柱脚缠上去、爬到后拱一半
  const vines = [
    { sx: -1, sz: 1, a1: 0.25 * PI, seed: 3 },
    { sx: 1, sz: -1, a1: 0.5 * PI, seed: 9 },
  ]
  const xAx: V3 = [1, 0, 0]
  const zAx: V3 = [0, 0, 1]
  for (const v of vines) {
    const x0 = v.sx * hx
    const z0 = v.sz * hz
    // 左柱缠 7.5 圈、右柱 7 圈：爬到柱顶时正好转到外侧，和拱上那段的起点接上
    const up = vinePath((t) => [x0, 0.5 + t * (post - 0.5), z0], () => xAx, () => zAx, 60, 2.2, v.sx < 0 ? 7.5 : 7)
    const a0 = v.sx < 0 ? PI : 0
    const arc = vinePath(
      (t) => {
        const a = a0 + (v.a1 - a0) * t
        return [Math.cos(a) * r, post + Math.sin(a) * r, z0]
      },
      (t) => {
        const a = a0 + (v.a1 - a0) * t
        return [Math.cos(a), Math.sin(a), 0]
      },
      () => zAx,
      40,
      2.2,
      5,
    )
    const pts = [...up.pts, ...arc.pts.slice(1)]
    const outs = [...up.outs, ...arc.outs.slice(1)]
    g.add(tube(pts, 0.6, VINE, { seg: pts.length * 2, radial: 5 }))
    const rr = rng(v.seed)
    pts.forEach((q, i) => {
      if (i < 4 || i % 2) return
      const o = outs[i]
      const yaw = Math.atan2(o[0], o[2]) + (rr() - 0.5) * 0.8
      g.add(leafAt(q, 7 + rr() * 3, i % 4 ? GRASS : shade(GRASS, -0.12), yaw, -Math.asin(Math.max(-1, Math.min(1, o[1]))) * 0.6 + 0.2 + rr() * 0.3))
      if (i % 6 === 0 && i > 20) {
        const c = i % 12 ? flower : flower2
        const fp: V3 = [q[0] + o[0] * 2.2, q[1] + o[1] * 2.2 + 1, q[2] + o[2] * 2.2]
        g.add(ball(2.4, c, { x: fp[0], y: fp[1], z: fp[2] }, [1, 0.7, 1]))
        g.add(noOutline(ball(0.8, '#ffd86b', { x: fp[0] + o[0] * 1.3, y: fp[1] + o[1] * 1.3 + 0.6, z: fp[2] + o[2] * 1.3 })))
      }
    })
  }
  return g
}

// ---------- 太阳能地插灯（三只）：细杆插在小土堆里，顶上一圈磨砂灯罩（自发光）、圆帽，帽顶一块太阳能板 ----------

const SL: [number, number, number][] = [
  [-14, -8, 45],
  [0, 9, 38],
  [14, -6, 32],
]
function solarLight(h: number, body: string, glow: string) {
  const g = new THREE.Group()
  g.add(puck(3.2, 1.2, SOIL))
  g.add(cyl(0.8, 0.8, h - 10.5, body, { y: 0.6 }, 10))
  // 灯头：漏斗形底座、磨砂灯罩（四根细立筋）、帽子、太阳能板 + 两道栅线
  g.add(cyl(3.4, 1.2, 2, body, { y: h - 10 }, 16))
  g.add(lit(cyl(3.5, 3.2, 5.6, glow, { y: h - 8.2 }, 16), glow, 0.9))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4
    g.add(rod3([Math.cos(a) * 3.5, h - 8.4, Math.sin(a) * 3.5], [Math.cos(a) * 3.7, h - 2.4, Math.sin(a) * 3.7], 0.35, body, 6))
  }
  g.add(cyl(4.6, 4.2, 1.6, body, { y: h - 2.7 }, 16))
  g.add(rbox(5.6, 0.5, 5.6, PANEL, { y: h - 1.3 }, 0.15))
  for (const x of [-1, 1]) g.add(noOutline(rbox(0.2, 0.1, 5.2, '#8da2c0', { x: x * 0.95, y: h - 0.85 }, 0.04)))
  return g
}
function solarLights(p: string[]) {
  const [body, glow] = p
  return G(...SL.map(([x, z, h]) => P(solarLight(h, body, glow), x, 0, z)))
}

// ---------- 木质沙滩躺椅：两根长边梁上铺横条，后端靠背斜撑起来，后脚装两只小轮；铺一张长条纹的软垫，靠背顶上一只头枕 ----------

const DC = { rx: 27, top: 32, hinge: -28, tilt: 0.87 }
function deckChair(p: string[]) {
  const [wood, pad, stripe] = p
  const g = new THREE.Group()
  const { rx, top, hinge, tilt } = DC
  // 边梁、两头横梁、前腿、后腿 + 小轮
  for (const s of [-1, 1]) {
    g.add(rbox(4, 8, 190, wood, { x: s * rx, y: top - 8 }, 1))
    g.add(rbox(5, 24, 6, wood, { x: s * rx, z: 88 }, 1))
    g.add(rbox(5, 16, 6, wood, { x: s * rx, y: 8, z: -86 }, 1))
    g.add(wheelX(8, 3, shade(wood, -0.12), s * (rx + 4.2), 8, -86))
  }
  for (const z of [-93, 93]) g.add(rbox(rx * 2 - 3, 6, 4, wood, { y: top - 7, z }, 1))
  g.add(cylX(0.6, rx * 2 + 6, STEEL, 0, 8, -86, 8))
  // 躺面横条
  for (let z = hinge + 2; z <= 92; z += 6.5) g.add(rbox(rx * 2 + 4, 1.8, 4.8, wood, { y: top, z }, 0.6))
  // 靠背：局部坐标里平躺（从铰点往 -z 伸 62），绕 x 轴斜撑起来
  const bk = new THREE.Group()
  for (const s of [-1, 1]) bk.add(rbox(3.5, 3, 62, wood, { x: s * 23, z: -31 }, 0.8))
  for (let k = 0; k < 9; k++) bk.add(rbox(50, 1.6, 4.8, wood, { y: 3, z: -4 - k * 6.6 }, 0.5))
  bk.add(rbox(50, 3, 4, wood, { z: -60 }, 0.8))
  bk.add(rbox(54, 5, 58, pad, { y: 4.6, z: -31 }, 2.2))
  for (const x of [-15, 0, 15]) bk.add(rbox(6, 0.8, 53, stripe, { x, y: 9.2, z: -31 }, 0.2))
  bk.add(cylX(3.6, 50, pad, 0, 12.6, -54, 16))
  g.add(P(bk, 0, top + 0.2, hinge, tilt))
  // 靠背的撑脚：从靠背边框斜撑到一根卡在边梁之间的横档上
  g.add(rbox(rx * 2 - 3, 2, 4, wood, { y: top - 2, z: -62 }, 0.5))
  const lift = (z: number): V3 => [0, top + 0.2 - z * Math.sin(tilt), hinge + z * Math.cos(tilt)]
  const prop = lift(-40)
  for (const s of [-1, 1]) g.add(batten([s * 23, prop[1] - 1.5, prop[2] + 0.5], [s * 23, top - 0.5, -62], 3, 3, wood))
  // 躺垫 + 三道长条纹
  g.add(rbox(54, 5, 118, pad, { y: top + 1.8, z: 31 }, 2.2))
  for (const x of [-15, 0, 15]) g.add(rbox(6, 0.8, 113, stripe, { x, y: top + 6.4, z: 31 }, 0.2))
  return g
}

// ---------- 花箱长椅：两头各一只木花箱（四角包边、顶上压边、种着花草），中间架一段条板座面 ----------

const PB = { px: 70, pw: 40, d: 45, ph: 48, seat: 45 }
function planterBench(p: string[]) {
  const [wood, trim, flower] = p
  const g = new THREE.Group()
  const { px, pw, d, ph, seat } = PB
  const groove = shade(wood, -0.12)
  const r = rng(77)
  for (const s of [-1, 1]) {
    const x = s * px
    g.add(tray(pw, ph, d, 2.5, wood, { x }))
    // 四角立柱、顶上一圈压边、正背面的竖板缝
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, ph, 4, trim, { x: x + sx * (pw / 2 - 1.4), z: sz * (d / 2 - 1.4) }, 0.6))
    for (const sz of [-1, 1]) g.add(rbox(pw + 2, 2, 4, trim, { x, y: ph, z: sz * (d / 2 - 1) }, 0.6))
    for (const sx of [-1, 1]) g.add(rbox(4, 2, d - 4, trim, { x: x + sx * (pw / 2 - 1), y: ph }, 0.6))
    for (const sz of [-1, 1]) for (const k of [-6.5, 0, 6.5]) g.add(noOutline(rbox(0.6, ph - 6, 0.6, groove, { x: x + k, y: 3, z: sz * (d / 2 + 0.05) }, 0.1)))
    // 土面、两团矮灌木、几枝带叶的花
    const soil = ph - 4
    g.add(rbox(pw - 4.6, 1.2, d - 4.6, SOIL, { x, y: soil - 1.2 }, 0.3))
    g.add(ball(9, shade(GRASS, -0.08), { x: x - 6, y: soil, z: 5 }, [1.2, 0.75, 1.1]))
    g.add(ball(8, GRASS, { x: x + 7, y: soil, z: -6 }, [1.1, 0.8, 1.2]))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + r() * 0.6
      const base: V3 = [x + Math.cos(a) * (6 + r() * 6), soil, Math.sin(a) * (7 + r() * 7)]
      const tipH = soil + 18 + r() * 12
      const tip: V3 = [base[0] + Math.cos(a) * 3, tipH, base[2] + Math.sin(a) * 3]
      g.add(rod3(base, tip, 0.5, VINE, 6))
      for (let k = 0; k < 4; k++) {
        const t = 0.3 + k * 0.17
        const q: V3 = [base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t]
        g.add(leafAt(q, 7 + r() * 3, k % 2 ? GRASS : shade(GRASS, -0.1), a + (k % 2 ? 1.2 : -1.2) + r() * 0.4, -0.3 + r() * 0.3))
      }
      g.add(ball(2.6, i % 2 ? flower : shade(flower, 0.08), { x: tip[0], y: tip[1] + 1, z: tip[2] }, [1, 0.8, 1]))
      g.add(noOutline(ball(0.9, '#ffd86b', { x: tip[0], y: tip[1] + 2.9, z: tip[2] })))
    }
  }
  // 座面：四根条板两头插进花箱侧板，底下两根纵梁，中间一块立板撑着
  const inner = px - pw / 2
  for (const z of [-15.75, -5.25, 5.25, 15.75]) g.add(rbox(inner * 2 + 1, 3, 9.6, trim, { y: seat - 3, z }, 0.8))
  for (const z of [-12, 12]) g.add(rbox(inner * 2 + 1, 6, 4, wood, { y: seat - 9, z }, 0.8))
  g.add(rbox(5, seat - 9, 30, wood, {}, 0.8))
  return g
}

// ---------- 配色 ----------

const KG_PALS: Pal[] = [
  ['modern', [M.black, M.walnut, M.silver]],
  ['retro', [R.red, R.caramel, '#c9ccd1']],
  ['farmhouse', ['#2f6b55', F.oak, '#c9ccd1']],
  ['nordic', ['#5f86a6', N.oak, N.gray]],
]
const GG_PALS: Pal[] = [
  ['modern', [M.silver, M.walnut, '#e9e6df']],
  ['modern', [M.black, N.oak, '#c9ccd1']],
  ['retro', [R.red, R.caramel, R.cream]],
  ['industrial', [I.steel, I.walnut, I.rust]],
  ['farmhouse', ['#3f6b4f', F.oak, F.linen]],
]
const PS_PALS: Pal[] = [
  ['nordic', [N.linen, N.white, N.oak]],
  ['farmhouse', [F.sage, F.white, F.oak]],
  ['retro', [R.orange, R.cream, R.caramel]],
  ['modern', [M.char, M.gray, M.silver]],
  ['cute', [C.sky, C.white, C.woodL]],
]
const KP_PALS: Pal[] = [
  ['cute', [C.sky, C.white, '#c8ecf8']],
  ['cute', [C.pink, C.lemon, '#d6f1f7']],
  ['retro', [R.orange, R.cream, '#bfe3e0']],
  ['modern', ['#4f9fd8', '#f4f4f2', '#cfe8f5']],
  ['cute', [C.mint, C.peach, '#d6f1f7']],
]
const FP_PALS: Pal[] = [
  ['industrial', [I.iron, I.steel, '#8a5a3a']],
  ['industrial', [I.rust, I.iron, '#7b5236']],
  ['modern', [M.black, M.silver, '#9a6b45']],
  ['farmhouse', ['#a8643a', F.iron, F.oak]],
]
const RS_PALS: Pal[] = [
  ['nordic', ['#b98a56', N.linen, N.sage]],
  ['modern', ['#4a3a30', M.light, M.gray]],
  ['modern', ['#8a8a86', M.white, '#3d5a80']],
  ['farmhouse', ['#c9a878', F.white, F.navy]],
  ['retro', ['#a8683a', R.cream, R.mustard]],
]
const RT_PALS: Pal[] = [
  ['nordic', ['#b98a56', '#8a6238', '#bfe6ff']],
  ['modern', ['#4a3a30', '#2f2622', '#c9d3d8']],
  ['modern', ['#8a8a86', '#5c5d5a', '#bfe6ff']],
  ['farmhouse', ['#c9a878', '#9a7648', '#cfe8d8']],
  ['retro', ['#a8683a', '#6e4324', '#e6d2a8']],
]
/** 喂鸟器：[木头, 屋顶, 小鸟] */
const BF_PALS: Pal[] = [
  ['nordic', [N.oakL, N.sage, '#6f9fd0']],
  ['farmhouse', [F.white, F.barn, '#e0a23a']],
  ['cute', [C.woodL, C.pink, C.sky]],
  ['retro', [R.caramel, R.teal, R.mustard]],
  ['japanese', [J.hinoki, J.sumi, '#9a7a5a']],
]
/** 割草机：[机壳, 集草袋, 把手 / 轮毂] */
const LM_PALS: Pal[] = [
  ['modern', ['#3f8f4a', M.char, M.silver]],
  ['retro', [R.red, '#55575a', R.cream]],
  ['industrial', [I.rust, I.iron, I.steel]],
  ['modern', [M.char, '#6b747c', '#e2702f']],
  ['farmhouse', [F.navy, F.linen, F.white]],
]
/** 小矮人：[帽子, 上衣, 裤子] */
const GN_PALS: Pal[] = [
  ['cute', ['#e8473a', '#5b8fd8', '#7a5a43']],
  ['cute', [C.red, C.mint, C.woodD]],
  ['farmhouse', [F.barn, F.sage, F.navy]],
  ['retro', [R.red, R.teal, R.mustard]],
  ['classic', [CL.wine, CL.blue, CL.walnut]],
]
/** 蹲踞：[石头, 竹子, 碎石] */
const TB_PALS: Pal[] = [
  ['japanese', ['#8e908c', '#c9b36a', '#d9d5cc']],
  ['japanese', ['#6f706c', '#9fb06a', '#cfcac0']],
  ['japanese', ['#a39a8a', J.hinoki, '#e4dfd4']],
  ['japanese', ['#5f5d5a', '#b9a05a', '#bcb8ae']],
]
/** 鹿威し：[竹子, 石头, 碎石] */
const SO_PALS: Pal[] = [
  ['japanese', ['#c9b36a', '#7f817d', '#d9d5cc']],
  ['japanese', ['#9fb06a', '#6f706c', '#cfcac0']],
  ['japanese', [J.hinoki, '#a39a8a', '#e4dfd4']],
  ['japanese', ['#b9a05a', '#5f5d5a', '#bcb8ae']],
]
/** 沙坑：[木框, 小桶, 小铲] */
const SB_PALS: Pal[] = [
  ['cute', [C.woodL, C.pink, C.sky]],
  ['nordic', [N.oak, N.sage, N.mustard]],
  ['farmhouse', [F.oak, F.barn, F.navy]],
  ['retro', [R.caramel, R.orange, R.teal]],
  ['cute', [C.white, C.lemon, C.mint]],
]
/** 信箱：[箱身, 立柱, 小旗] */
const MB_PALS: Pal[] = [
  ['modern', [M.char, M.walnut, '#d8483f']],
  ['farmhouse', [F.navy, F.white, F.barn]],
  ['retro', [R.teal, R.cream, R.red]],
  ['industrial', [I.steel, I.walnut, I.rust]],
  ['cute', [C.sky, C.white, C.red]],
]
/** 花园拱门：[铁架, 花色, 另一种花色] */
const GA_PALS: Pal[] = [
  ['modern', [M.char, '#f28fb0', '#fbf3f0']],
  ['farmhouse', [F.white, '#e8576a', F.butter]],
  ['classic', [CL.ivory, '#c8475a', CL.cream]],
  ['industrial', [I.iron, '#d64a5a', '#f2e3d0']],
  ['cute', [C.white, C.pink, C.lilac]],
]
/** 太阳能地插灯：[灯身, 光色] */
const SL_PALS: Pal[] = [
  ['modern', [M.black, '#fff2c8']],
  ['modern', [M.silver, '#e8f4ff']],
  ['industrial', [I.iron, '#ffd9a0']],
  ['retro', [R.caramel, '#ffe6a8']],
  ['cute', [C.white, '#ffe9f4']],
]
/** 沙滩躺椅：[木头, 软垫, 条纹] */
const DC_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.blue]],
  ['farmhouse', [F.oak, F.white, F.navy]],
  ['retro', [R.caramel, R.cream, R.orange]],
  ['modern', [M.walnut, M.light, M.char]],
  ['cute', [C.woodL, C.white, C.pink]],
]
/** 花箱长椅：[花箱, 座板 / 包边, 花色] */
const PB_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL, '#f2b8c6']],
  ['farmhouse', [F.white, F.oak, '#e0566a']],
  ['industrial', [I.walnut, I.iron, '#f0c24a']],
  ['japanese', [J.wood, J.dark, '#c9a6e8']],
  ['modern', [M.gray, M.char, M.white]],
]

export const OUTDOOR_PLUS: AssetDef[] = [
  define('od-kettle-grill', '球形炭烤炉', 'outdoor', [58, 87, 99], KG_PALS, kettleGrill, {
    type: 'cookware',
    mats: ['metal', 'wood', 'metal'],
  }),
  define('od-gas-grill', '燃气烧烤炉', 'outdoor', [127, 58, 111], GG_PALS, gasGrill, {
    type: 'cookware',
    mats: ['metal', 'wood', 'metal'],
  }),
  define('od-parasol', '庭院遮阳伞', 'outdoor', [PS.r * 2, PS.r * 2, 250], PS_PALS, parasol, {
    type: 'outdoor-gear',
    mats: ['fabric', 'fabric', 'wood'],
  }),
  define('od-kiddie-pool', '充气泳池', 'outdoor', [150, 150, 40], KP_PALS, kiddiePool, {
    type: 'toy',
    tags: ['for-kids'],
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('od-fire-pit', '篝火盆', 'outdoor', [68, 68, 39], FP_PALS, firePit, {
    type: 'outdoor-gear',
    mats: ['metal', 'metal', 'wood'],
    fx: FP_FX,
  }),
  define('od-rattan-sofa', '户外藤编沙发', 'outdoor', [RS.w, RS.d, 72], RS_PALS, rattanSofa, {
    type: 'seat',
    sizeLabel: '双人',
    mats: ['wood', 'fabric', 'fabric'],
  }),
  define('od-rattan-table', '户外藤编茶几', 'outdoor', [RT.w, RT.d, RT.h], RT_PALS, rattanTable, {
    type: 'coffee-table',
    tags: ['table'],
    mats: ['wood', 'wood', 'glass'],
    surface: RT.h,
    surfaceShape: [rectPoly(-RT.w / 2 + 2, -RT.d / 2 + 2, RT.w / 2 - 2, RT.d / 2 - 2)],
  }),
  define('od-bird-feeder', '立杆喂鸟器', 'outdoor', [34, 34, 168], BF_PALS, birdFeeder, {
    type: 'decor',
    mats: ['wood', 'wood', 'paint'],
  }),
  define('od-lawn-mower', '手推割草机', 'outdoor', [56, 140, 99], LM_PALS, lawnMower, {
    type: 'garden-tool',
    mats: ['plastic', 'fabric', 'metal'],
  }),
  define('od-garden-gnome', '花园小矮人', 'outdoor', [18, 18, 41], GN_PALS, gnome, {
    type: 'decor',
    mats: ['ceramic', 'ceramic', 'ceramic'],
  }),
  define('od-tsukubai', '蹲踞', 'outdoor', [75, 66, 46], TB_PALS, tsukubai, {
    type: 'decor',
    mats: ['stone', 'wood', 'stone'],
  }),
  define('od-shishi-odoshi', '鹿威し', 'outdoor', [60, 38, 58], SO_PALS, shishiOdoshi, {
    type: 'decor',
    mats: ['wood', 'stone', 'stone'],
  }),
  define('od-sandbox', '儿童沙坑', 'outdoor', [121, 121, 27], SB_PALS, sandbox, {
    type: 'toy',
    tags: ['for-kids'],
    mats: ['wood', 'plastic', 'plastic'],
  }),
  define('od-mailbox', '立式信箱', 'outdoor', [21, 39, 111], MB_PALS, mailbox, {
    type: 'decor',
    mats: ['metal', 'wood', 'metal'],
  }),
  define('od-garden-arch', '花园拱门', 'outdoor', [132, 48, 223], GA_PALS, gardenArch, {
    type: 'decor',
    mats: ['metal', 'plant', 'plant'],
  }),
  define('od-solar-lights', '太阳能地插灯', 'outdoor', [37, 26, 45], SL_PALS, solarLights, {
    type: 'decor',
    sizeLabel: '三只装',
    tags: ['multi-ok'],
    mats: ['plastic', 'frosted'],
  }),
  define('od-deck-chair', '木质沙滩躺椅', 'outdoor', [66, 190, 85], DC_PALS, deckChair, {
    type: 'seat',
    mats: ['wood', 'fabric', 'fabric'],
  }),
  define('od-planter-bench', '花箱长椅', 'outdoor', [182, 47, 77], PB_PALS, planterBench, {
    type: 'seat',
    mats: ['wood', 'wood', 'plant'],
  }),
]
