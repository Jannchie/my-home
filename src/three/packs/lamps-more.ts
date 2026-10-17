// 灯具扩充包：9 种风格（可爱 / 北欧 / 现代 / 和风 / 工业 / 复古 / 新中式 / 欧式古典 / 美式乡村）的落地灯、台灯、壁灯。
// id 一律 lp- 前缀。约定见 kit.ts 开头。
//
// 发光部件：灯罩、和纸、绢纱、玻璃、灯泡用 emissive ≥ 0.3 的材质（lights.ts 的 prepareLamp 按这个识别，夜里按开关 / 色温加亮）；
// 木框、骨架、底座、灯杆一律普通材质，不发光。
// 系列：落地灯 'floor-lamp'、床头 / 边几台灯 'table-lamp'、书桌作业灯 'desk-lamp'、壁灯 'wall-lamp'——
// 素材库里各合成一张卡片，一键布置按房间风格从系列里挑款（decorate.ts 的 lampPick）。

import * as THREE from 'three'
import { ball, cup, cyl, face, puck, rbox, toon, torus } from '../toon'
import { C, type AssetDef } from '../kit'
import { G, P, lit, litOutlined, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, R, type PalFlat } from '../packkit'

const BRASS = '#d4b25a'
const CHROME = '#d0d5db'
const WARM = '#ffe2a0'
const OPAL = '#f7f2e6'
const BAMBOO = '#d6b46e'
const RATTAN = '#c99a5b'
const STONE = '#b7b2a7'
const CRYSTAL = '#e6f3ff'

type Kind = 'floor' | 'table' | 'desk' | 'wall'
const FAMILY: Record<Kind, string> = { floor: 'floor-lamp', table: 'table-lamp', desk: 'desk-lamp', wall: 'wall-lamp' }
/** 壁灯底边离地高度 */
const WALL_Y = 150

function def(id: string, name: string, kind: Kind, sizeLabel: string, [w, d, h]: [number, number, number], pals: PalFlat[], build: (p: string[]) => THREE.Group, mount = WALL_Y): AssetDef {
  return {
    id,
    name,
    category: 'lighting',
    w,
    d,
    h,
    palettes: pals.map((x) => x.slice(1) as string[]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    family: FAMILY[kind],
    sizeLabel,
    ...(kind === 'table' || kind === 'desk' ? { prop: true } : {}),
    ...(kind === 'wall' ? { mount } : {}),
  }
}

// ---------- 小工具 ----------

/** 灯泡 / 火苗：小、亮、不描边 */
const bulb = (r: number, x: number, y: number, z: number, sy = 1) => P(lit(ball(r, WARM, {}, [1, sy, 1]), WARM, 0.85), x, y, z)

/** 开口的灯罩（筒、锥）：双面、发光，at.y 为下沿 */
function shadeOpen(rTop: number, rBot: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}, k = 0.42, seg = 32) {
  const mat = toon(color, { emissive: k }).clone()
  mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true), mat)
  m.position.set(at.x ?? 0, (at.y ?? 0) + h / 2, at.z ?? 0)
  m.castShadow = true
  return m
}

/** 褶皱布罩：半径按角度交替起伏，发光 */
function pleated(rTop: number, rBot: number, h: number, color: string, y: number, folds = 22, k = 0.4) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, folds * 2, 1, true)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    const seg = Math.round(((a + Math.PI) / (Math.PI * 2)) * folds * 2)
    const s = seg % 2 ? 1 : 0.93
    pos.setX(i, pos.getX(i) * s)
    pos.setZ(i, pos.getZ(i) * s)
  }
  geo.computeVertexNormals()
  const mat = toon(color, { emissive: k }).clone()
  mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(geo, mat)
  m.position.y = y + h / 2
  m.castShadow = true
  return m
}

/** 旋转体：profile 为 [半径, 高]；k > 0 时发光（双面） */
function lathe(profile: [number, number][], color: string, at: { x?: number; y?: number; z?: number } = {}, seg = 24, k = 0) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg)
  const mat = k > 0 ? toon(color, { emissive: k }).clone() : toon(color)
  if (k > 0) mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(geo, mat)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 两端已知的细杆 */
function rod3(a: V3, b: V3, r: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 沿控制点的细管（弯杆、电线、铁艺卷草） */
function tube(pts: V3[], r: number, color: string, seg = 40, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
  )
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, closed), toon(color))
  m.castShadow = true
  return m
}

/** 水平圆环（灯罩口沿、竹篾箍），at.y 为环心 */
const ring = (r: number, t: number, color: string, y: number, x = 0, z = 0) => P(torus(r, t, color), x, y, z, Math.PI / 2)

/** 倒扣的灯罩（cup 翻转，开口朝下）：yTop 为罩顶 */
function dome(r: number, h: number, color: string, yTop: number, rTop = r * 0.3, k = 0, x = 0, z = 0) {
  const m = cup(r, rTop, h, 0.7, color)
  if (k > 0) m.material = toon(color, { emissive: k })
  m.rotation.x = Math.PI
  m.position.set(x, yTop, z)
  return m
}

/** 壁挂件：xz 居中，最低点放到离地 y */
function mountAt(g: THREE.Group, y: number) {
  const box = new THREE.Box3().setFromObject(g, true)
  g.position.x -= (box.min.x + box.max.x) / 2
  g.position.z -= (box.min.z + box.max.z) / 2
  g.position.y += y - box.min.y
  return G(g)
}

/** xz 居中、落地 */
function centered(g: THREE.Group) {
  const box = new THREE.Box3().setFromObject(g, true)
  g.position.x -= (box.min.x + box.max.x) / 2
  g.position.z -= (box.min.z + box.max.z) / 2
  g.position.y -= box.min.y
  return G(g)
}

/**
 * 纸 / 绢方灯箱：w × h × d 的发光箱体，四角立柱 + 每面的木格（nx 列、ny 行），底面在 y。
 * 木格浮出纸面 0.3，不和纸面共面。
 */
function paperBox(w: number, h: number, d: number, paper: string, wood: string, y: number, nx = 2, ny = 3, post = 1.8, k = 0.42) {
  const g = new THREE.Group()
  g.add(litOutlined(rbox(w - 0.6, h, d - 0.6, paper, { y }, 0.4), paper, k))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(post, h + 0.4, post, wood, { x: (sx * (w - post)) / 2, y: y - 0.2, z: (sz * (d - post)) / 2 }, 0.3))
  const bar = 0.55
  for (const [len, other, rot] of [
    [w, d, 0],
    [d, w, Math.PI / 2],
  ] as const) {
    for (const s of [-1, 1]) {
      const face = new THREE.Group()
      for (let i = 1; i < nx; i++) face.add(rbox(bar, h - 0.4, bar, wood, { x: -len / 2 + (len * i) / nx, y: y + 0.2 }, 0.2))
      for (let j = 1; j < ny; j++) face.add(rbox(len - post * 2 + 0.2, bar, bar, wood, { y: y + (h * j) / ny - bar / 2 }, 0.2))
      face.position.z = s * (other / 2 - 0.05)
      const wrap = G(face)
      wrap.rotation.y = rot
      g.add(wrap)
    }
  }
  return g
}

/** 一圈方框（四根横梁），底面在 y */
function squareRim(w: number, d: number, t: number, color: string, y: number) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(w, t, t, color, { y, z: (s * (d - t)) / 2 }, t * 0.3))
    g.add(rbox(t, t, d - t * 2, color, { x: (s * (w - t)) / 2, y }, t * 0.3))
  }
  return g
}

/** 竹竿：带竹节的圆杆，底面在 y */
function bambooPole(r: number, len: number, color: string, y: number, every = 18, x = 0, z = 0) {
  const g = new THREE.Group()
  g.add(cyl(r, r, len, color, { x, y, z }, 12))
  for (let t = every; t < len - 2; t += every) g.add(ring(r + 0.25, 0.32, color, y + t, x, z))
  return g
}

/** 彩色玻璃罩（蒂芙尼）：n 片扇形，每片各自发光的颜色，片与片之间是铅条 */
function stainedShade(rTop: number, rBot: number, h: number, colors: string[], lead: string, y: number, n = 12) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length]
    const mat = toon(c, { emissive: 0.45 }).clone()
    mat.side = THREE.DoubleSide
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 3, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n)
    const m = new THREE.Mesh(geo, mat)
    m.position.y = y + h / 2
    g.add(m)
    const a = (i / n) * Math.PI * 2
    g.add(rod3([Math.sin(a) * rBot, y, Math.cos(a) * rBot], [Math.sin(a) * rTop, y + h, Math.cos(a) * rTop], 0.3, lead, 6))
  }
  g.add(ring(rBot, 0.45, lead, y))
  g.add(ring(rTop, 0.4, lead, y + h))
  g.add(ring((rTop + rBot) / 2, 0.3, lead, y + h / 2))
  return g
}

/** 一簇发光的球拼成的云朵（中心在原点，沿 x 展开） */
function cloud(w: number, color: string, k = 0.45, depth = 1) {
  const g = new THREE.Group()
  const r = w / 5
  const balls: [number, number, number][] = [
    [-w / 2 + r, 0, r * 0.95],
    [-w / 4, r * 0.55, r * 1.25],
    [w / 10, r * 0.7, r * 1.4],
    [w / 2 - r * 1.05, r * 0.2, r * 1.1],
    [0, -r * 0.15, r * 1.15],
  ]
  for (const [x, y, rr] of balls) g.add(litOutlined(ball(rr, color, { x, y }, [1, 0.92, depth]), color, k))
  return g
}

/** 五角星挤出体（正面朝 +z），中心在原点 */
function star(R0: number, t: number, color: string, k = 0.5) {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? R0 * 0.48 : R0
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i) s.lineTo(x, y)
    else s.moveTo(x, y)
  }
  s.closePath()
  const bevel = Math.min(1.2, t * 0.3)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2 })
  geo.translate(0, 0, -t / 2 + bevel)
  const m = new THREE.Mesh(geo, toon(color, { emissive: k }))
  m.castShadow = true
  return m
}

/** 流苏：一圈细穗挂在 y 处（半径 r） */
function fringe(r: number, y: number, len: number, color: string, n = 28) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.add(cyl(0.28, 0.2, len, color, { x: Math.sin(a) * r, y: y - len, z: Math.cos(a) * r }, 5))
  }
  return g
}

/** 回纹窗格：正面（+z）的一圈方框 + 中间一个回字，贴在 z 处 */
function huiFrame(w: number, h: number, color: string, y: number, z: number, t = 0.7) {
  const g = new THREE.Group()
  for (const [ww, hh] of [
    [w, h],
    [w * 0.5, h * 0.5],
  ]) {
    const y0 = y + (h - hh) / 2
    g.add(rbox(ww, t, t, color, { y: y0, z }, 0.2))
    g.add(rbox(ww, t, t, color, { y: y0 + hh - t, z }, 0.2))
    for (const s of [-1, 1]) g.add(rbox(t, hh, t, color, { x: (s * (ww - t)) / 2, y: y0, z }, 0.2))
  }
  return g
}

// =====================================================================
// 和风
// =====================================================================

/** 角行灯：四脚木框 + 和纸方箱，木格分格，顶上提梁 */
function kakuAndon(p: string[]) {
  const [wood, paper, dark] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.6, 9, 2.6, wood, { x: sx * 12.5, z: sz * 12.5 }, 0.5))
  g.add(squareRim(28, 28, 2.2, wood, 7))
  g.add(rbox(25, 0.8, 25, dark, { y: 7.6 }, 0.3))
  g.add(paperBox(26, 44, 26, paper, wood, 9.2, 3, 4, 2))
  g.add(squareRim(28, 28, 2.2, wood, 53.4))
  for (const s of [-1, 1]) g.add(rbox(1.8, 11, 1.8, wood, { x: s * 10, y: 55.4 }, 0.4))
  g.add(rbox(23, 1.8, 2.6, wood, { y: 66.2 }, 0.6))
  return g
}

/** 竹编落地灯：竹节灯杆 + 竹篾编的椭圆灯笼（里面是一层发光的和纸） */
function bambooFloor(p: string[]) {
  const [bamboo, paper, base] = p
  const g = new THREE.Group()
  g.add(puck(15, 3, base))
  g.add(bambooPole(1.4, 96, bamboo, 3, 24))
  const cy = 120
  const ry = 22
  const rx = 13
  g.add(litOutlined(ball(rx, paper, { y: cy }, [1, ry / rx, 1]), paper, 0.42))
  // 竹篾：竖向的弧条 + 三道箍
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2
    const pts: V3[] = []
    for (let i = 0; i <= 8; i++) {
      const t = -0.95 + (1.9 * i) / 8
      const r = rx * Math.sqrt(1 - t * t) + 0.45
      pts.push([Math.sin(a) * r, cy + t * ry, Math.cos(a) * r])
    }
    g.add(tube(pts, 0.32, bamboo, 16))
  }
  for (const t of [-0.55, 0, 0.55]) g.add(ring(rx * Math.sqrt(1 - t * t) + 0.6, 0.4, bamboo, cy + t * ry))
  g.add(cyl(2.4, 3.2, 2.4, bamboo, { y: cy + ry - 1 }, 12))
  return g
}

/** 石灯笼造型：六角基座、竿、中台、火袋（四面和纸窗）、笠、宝珠 */
function ishidoro(p: string[]) {
  const [stone, paper, dark] = p
  const g = new THREE.Group()
  g.add(cyl(15, 17, 7, stone, {}, 6))
  g.add(cyl(5.5, 6.5, 26, stone, { y: 7 }, 8))
  g.add(cyl(14, 9, 6, stone, { y: 33 }, 6))
  // 火袋：四根石柱 + 发光的纸窗 + 窗格
  g.add(litOutlined(rbox(15, 17, 15, paper, { y: 39.2 }, 0.4), paper, 0.42))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 18, 4, stone, { x: sx * 8, y: 39, z: sz * 8 }, 0.8))
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = G(rbox(0.6, 16, 0.6, dark, { y: 39.5, z: 7.8 }, 0.2), rbox(12, 0.6, 0.6, dark, { y: 47.5, z: 7.8 }, 0.2))
    f.rotation.y = rot
    g.add(f)
  }
  g.add(cyl(13, 13, 2, stone, { y: 57 }, 6))
  // 笠：六角、四角翘起
  g.add(cyl(4, 22, 8, stone, { y: 59 }, 6))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    g.add(ball(2.2, stone, { x: Math.sin(a) * 21, y: 60, z: Math.cos(a) * 21 }))
  }
  g.add(cyl(2.6, 3.2, 3, stone, { y: 67 }, 8))
  g.add(ball(4.2, stone, { y: 73.5 }, [1, 1.1, 1]))
  g.add(cyl(0.1, 1.4, 2.5, stone, { y: 77.6 }, 8))
  return g
}

/** 座敷行灯：矮脚方灯，四面和纸，顶上铁提手 */
function zashikiAndon(p: string[]) {
  const [wood, paper, dark] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(2, wood, { x: sx * 12, y: 2, z: sz * 12 }, [1, 0.8, 1]))
  g.add(rbox(30, 3, 30, wood, { y: 3 }, 0.8))
  g.add(paperBox(26, 27, 26, paper, wood, 6, 2, 2, 2.2))
  g.add(squareRim(29, 29, 2.4, wood, 33))
  g.add(tube([[-11, 35, 0], [-8, 41, 0], [0, 43.5, 0], [8, 41, 0], [11, 35, 0]], 0.7, dark, 24))
  return g
}

/** 球形和纸台灯（akari 风）：三根铁丝脚 + 带竹篾的纸球 */
function akariTable(p: string[]) {
  const [paper, wire, rib] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(rod3([Math.cos(a) * 8, 0.4, Math.sin(a) * 8], [0, 9, 0], 0.4, wire, 6))
  }
  const cy = 21
  g.add(litOutlined(ball(11, paper, { y: cy }, [1, 1.08, 1]), paper, 0.42))
  for (let i = -3; i <= 3; i++) {
    const dy = i * 3.4
    const r = 11 * Math.sqrt(Math.max(0, 1 - (dy / 11.9) ** 2)) + 0.15
    if (r > 3) g.add(ring(r, 0.18, rib, cy + dy))
  }
  g.add(cyl(0.5, 0.5, 2.6, wire, { y: cy + 11.6 }, 6))
  return g
}

/** 提灯台灯：木支架挑出一盏竹骨纸提灯 */
function chochinTable(p: string[]) {
  const [paper, wood, ink] = p
  const g = new THREE.Group()
  g.add(rbox(16, 2, 14, wood, {}, 0.6))
  g.add(rbox(1.8, 34, 1.8, wood, { x: -6, y: 2 }, 0.4))
  g.add(rbox(10, 1.8, 1.8, wood, { x: -1.6, y: 34 }, 0.4))
  const x = 2.2
  const cy = 19.5
  g.add(cyl(0.18, 0.18, 4.2, ink, { x, y: 29.8 }, 4))
  g.add(cyl(3.2, 3.2, 1.4, ink, { x, y: 28.4 }, 16))
  g.add(litOutlined(ball(6.6, paper, { x, y: cy }, [1, 1.32, 1]), paper, 0.45))
  for (let i = -3; i <= 3; i++) {
    const dy = i * 2.4
    const r = 6.6 * Math.sqrt(Math.max(0, 1 - (dy / 8.7) ** 2)) + 0.12
    if (r > 2) g.add(ring(r, 0.13, ink, cy + dy, x))
  }
  g.add(cyl(3.2, 3.2, 1.4, ink, { x, y: 10.2 }, 16))
  return g
}

/** 组子木格台灯：方灯箱，每面麻叶式斜格 */
function kumikoTable(p: string[]) {
  const [wood, paper, dark] = p
  const g = new THREE.Group()
  g.add(rbox(18, 3, 18, wood, {}, 0.6))
  g.add(litOutlined(rbox(14, 20, 14, paper, { y: 3 }, 0.3), paper, 0.42))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.8, 20.4, 1.8, wood, { x: sx * 7.2, y: 2.8, z: sz * 7.2 }, 0.3))
  const ang = Math.atan2(14, 20)
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    // 两根斜格交叉在灯箱正面中心，加一根竖格
    const f = G(
      P(rbox(0.5, 23, 0.5, dark, {}, 0.15), 0, 13, 7.25, 0, 0, ang),
      P(rbox(0.5, 23, 0.5, dark, {}, 0.15), 0, 13, 7.25, 0, 0, -ang),
      rbox(0.5, 19.6, 0.5, dark, { y: 3.2, z: 7.25 }, 0.15),
    )
    f.rotation.y = rot
    g.add(f)
  }
  g.add(rbox(18, 2, 18, wood, { y: 23 }, 0.5))
  return g
}

/** 木框和纸壁灯：贴墙的长方灯箱，正面木格 */
function washiSconce(p: string[]) {
  const [wood, paper, dark] = p
  const g = new THREE.Group()
  g.add(rbox(18, 30, 1.6, wood, { z: -5.2 }, 0.5))
  g.add(litOutlined(rbox(14, 26, 7, paper, { y: 2, z: -1 }, 0.3), paper, 0.42))
  for (const s of [-1, 1]) g.add(rbox(1.8, 28, 1.8, wood, { x: s * 7.6, y: 1, z: 2.4 }, 0.4))
  for (const y of [1, 27.2]) g.add(rbox(16.6, 1.8, 1.8, wood, { y, z: 2.4 }, 0.4))
  g.add(rbox(0.6, 25, 0.6, dark, { y: 2.5, z: 2.65 }, 0.2))
  for (const y of [10, 19]) g.add(rbox(13.4, 0.6, 0.6, dark, { y, z: 2.65 }, 0.2))
  return mountAt(g, WALL_Y)
}

/** 壁挂提灯：木托臂挑出一盏纸提灯 */
function chochinWall(p: string[]) {
  const [paper, wood, ink] = p
  const g = new THREE.Group()
  g.add(rbox(6, 16, 1.6, wood, { y: 20, z: -12 }, 0.5))
  g.add(rbox(2, 2, 13, wood, { y: 30, z: -5.4 }, 0.5))
  g.add(rod3([0, 22, -11], [0, 30, -2], 0.7, wood))
  g.add(cyl(0.18, 0.18, 2.6, ink, { y: 27.6, z: 0 }, 4))
  g.add(cyl(3, 3, 1.3, ink, { y: 26.4 }, 16))
  const cy = 18
  g.add(litOutlined(ball(6.4, paper, { y: cy }, [1, 1.3, 1]), paper, 0.45))
  for (let i = -3; i <= 3; i++) {
    const dy = i * 2.3
    const r = 6.4 * Math.sqrt(Math.max(0, 1 - (dy / 8.3) ** 2)) + 0.12
    if (r > 2) g.add(ring(r, 0.13, ink, cy + dy))
  }
  g.add(cyl(3, 3, 1.3, ink, { y: 8.4 }, 16))
  return mountAt(g, 140)
}

/** 竹编半罩壁灯：贴墙的半个竹篓罩，里面一层发光和纸 */
function bambooWall(p: string[]) {
  const [bamboo, paper, wood] = p
  const g = new THREE.Group()
  g.add(rbox(20, 30, 1.4, wood, { z: -0.7 }, 0.5))
  const prof: [number, number][] = [
    [6, 0],
    [8.5, 6],
    [9, 13],
    [8, 20],
    [6.5, 26],
  ]
  const mat = toon(paper, { emissive: 0.42 }).clone()
  mat.side = THREE.DoubleSide
  // 半个旋转体：只朝前（+z）的一半
  const half = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20, -Math.PI / 2, Math.PI), mat)
  half.position.y = 2
  g.add(half)
  for (let k = 0; k <= 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI
    g.add(tube(prof.map(([r, y]): V3 => [Math.sin(a) * (r + 0.4), y + 2, Math.cos(a) * (r + 0.4)]), 0.3, bamboo, 12))
  }
  for (const [r, y] of [prof[0], prof[2], prof[4]]) {
    const t = torus(r + 0.5, 0.4, bamboo, {}, Math.PI)
    t.rotation.set(Math.PI / 2, 0, 0)
    t.position.y = y + 2
    g.add(t)
  }
  g.add(bulb(2.2, 0, 14, 3))
  return mountAt(g, 145)
}

// =====================================================================
// 北欧
// =====================================================================

/** PH 风三层罩落地灯：细杆 + 三层由大到小的弧形罩，罩内侧反光发亮 */
function phFloor(p: string[]) {
  const [shadeC, metal, base] = p
  const g = new THREE.Group()
  g.add(puck(15, 3, base))
  g.add(cyl(0.9, 0.9, 132, metal, { y: 3 }, 10))
  g.add(dome(19, 8, shadeC, 154, 5.5, 0.38))
  g.add(dome(14, 6.5, shadeC, 146.5, 8, 0.38))
  g.add(dome(9.5, 5, shadeC, 140.5, 6.5, 0.38))
  g.add(bulb(3.2, 0, 141, 0))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(rod3([Math.sin(a) * 4, 135, Math.cos(a) * 4], [Math.sin(a) * 4, 154, Math.cos(a) * 4], 0.25, metal, 4))
  }
  return g
}

/** 木腿三脚落地灯：三根张开的原木腿 + 大鼓形布罩 */
function tripodWood(p: string[]) {
  const [shadeC, wood, metal] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6
    g.add(rod3([Math.sin(a) * 18, 0, Math.cos(a) * 18], [Math.sin(a) * 2, 112, Math.cos(a) * 2], 1.4, wood, 10))
  }
  g.add(cyl(2.6, 2.6, 5, metal, { y: 108 }, 12))
  g.add(cyl(0.8, 0.8, 12, metal, { y: 113 }, 8))
  g.add(shadeOpen(16, 19, 24, shadeC, { y: 116 }))
  g.add(ring(19, 0.35, shadeC, 116))
  g.add(ring(16, 0.35, shadeC, 140))
  g.add(bulb(3.4, 0, 127, 0))
  return g
}

/** 双球落地灯：细杆两侧高低两个乳白玻璃球 */
function doubleGlobe(p: string[]) {
  const [glass, metal, base] = p
  const g = new THREE.Group()
  g.add(cyl(13, 14, 2.5, base, {}, 32))
  g.add(cyl(0.9, 0.9, 142, metal, { y: 2.5 }, 10))
  g.add(rod3([0, 112, 0], [8, 116, 0], 0.6, metal))
  g.add(litOutlined(ball(8, glass, { x: 8, y: 124 }), glass, 0.45))
  g.add(cyl(2, 2, 2, metal, { x: 8, y: 115 }, 12))
  g.add(rod3([0, 136, 0], [-7, 140, 0], 0.6, metal))
  g.add(litOutlined(ball(10, glass, { x: -7, y: 150 }), glass, 0.45))
  g.add(cyl(2.2, 2.2, 2, metal, { x: -7, y: 139 }, 12))
  return g
}

/** 蘑菇台灯：喇叭形灯座 + 半球罩 */
function mushroomNordic(p: string[]) {
  const [shadeC, base] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [9, 0], [9, 1.2], [3.2, 4], [1.8, 12], [1.6, 20], [0, 20]], base, {}, 28))
  g.add(lathe([[0.5, 0], [12, 0], [11.6, 2.2], [10, 5], [7, 7.2], [3.5, 8.4], [0, 8.8]], shadeC, { y: 19.5 }, 32, 0.38))
  g.add(bulb(2.6, 0, 18.5, 0))
  return g
}

/** PH 风三层罩台灯 */
function phTable(p: string[]) {
  const [shadeC, metal, base] = p
  const g = new THREE.Group()
  g.add(puck(8, 2, base))
  g.add(cyl(0.7, 0.7, 26, metal, { y: 2 }, 8))
  g.add(dome(12, 5, shadeC, 35, 3.5, 0.38))
  g.add(dome(9, 4, shadeC, 30.5, 5, 0.38))
  g.add(dome(6, 3, shadeC, 26.5, 4.2, 0.38))
  g.add(bulb(2.2, 0, 26.5, 0))
  return g
}

/** 原木折臂书桌灯：方木底座、两节木臂、锥形罩朝前下方 */
function oakArm(p: string[]) {
  const [shadeC, wood, metal] = p
  const g = new THREE.Group()
  g.add(rbox(14, 3, 14, wood, { z: -5 }, 1))
  g.add(rod3([0, 3, -6], [0, 26, -3], 1.1, wood))
  g.add(ball(1.6, metal, { y: 26, z: -3 }))
  g.add(rod3([0, 26, -3], [0, 29, 10], 1, wood))
  const head = G(cyl(1.4, 1.4, 3, metal, { y: 7 }, 10), shadeOpen(2.6, 6.5, 8, shadeC, {}, 0.4), ring(6.5, 0.3, shadeC, 0), bulb(2, 0, 3, 0))
  head.rotation.x = -0.55
  head.position.set(0, 21, 12.5)
  g.add(head)
  return centered(g)
}

/** 摇臂壁灯：木底座、水平长臂，末端挂锥形布罩 */
function swingWall(p: string[]) {
  const [shadeC, wood, metal] = p
  const g = new THREE.Group()
  g.add(rbox(8, 12, 2, wood, { y: 8, z: -1 }, 0.8))
  g.add(cyl(1, 1, 4, metal, { y: 12, z: 2 }, 8))
  g.add(rod3([0, 16, 1.5], [0, 18, 24], 0.6, metal))
  g.add(cyl(0.2, 0.2, 4, metal, { y: 14, z: 24 }, 4))
  g.add(shadeOpen(4, 8, 10, shadeC, { y: 4, z: 24 }))
  g.add(cyl(1.2, 1.2, 1.6, metal, { y: 13.4, z: 24 }, 8))
  g.add(bulb(2.2, 0, 7.5, 24))
  return mountAt(g, 145)
}

/** 乳白球壁灯：圆木底盘 + 短臂 + 乳白玻璃球 */
function opalWall(p: string[]) {
  const [glass, metal, wood] = p
  const g = new THREE.Group()
  g.add(P(cyl(6.5, 6.5, 2, wood, {}, 28), 0, 10, 1, Math.PI / 2))
  g.add(rod3([0, 10, 2], [0, 10, 8], 0.8, metal))
  g.add(cyl(2.4, 2.4, 2.4, metal, { y: 12.4, z: 9.5 }, 12))
  g.add(litOutlined(ball(7.5, glass, { y: 20, z: 9.5 }), glass, 0.45))
  return mountAt(g, WALL_Y)
}

// =====================================================================
// 现代
// =====================================================================

/** 极简杆落地灯：薄圆盘底座、细直杆、斜切的小圆柱灯头 */
function minimalPole(p: string[]) {
  const [metal, light, base] = p
  const g = new THREE.Group()
  g.add(cyl(13, 13, 1.4, base, {}, 40))
  g.add(cyl(0.8, 0.8, 150, metal, { y: 1.4 }, 10))
  const head = G(cyl(4, 4, 12, metal, {}, 20), lit(cyl(3.5, 3.5, 0.6, light, { y: -0.4 }, 20), light))
  head.rotation.x = -0.7
  head.position.set(0, 147, 3.5)
  g.add(head)
  return g
}

/** LED 线条落地灯：细铝框，内侧一条发光灯带 */
function ledLine(p: string[]) {
  const [metal, light, base] = p
  const g = new THREE.Group()
  g.add(rbox(28, 2, 16, base, {}, 0.8))
  for (const s of [-1, 1]) g.add(rbox(1.6, 150, 1.6, metal, { x: s * 12, y: 2 }, 0.4))
  g.add(rbox(25.6, 1.6, 1.6, metal, { y: 151 }, 0.4))
  g.add(lit(rbox(0.8, 146, 1.1, light, { x: -10.8, y: 4 }, 0.2), light))
  g.add(lit(rbox(21, 0.8, 1.1, light, { y: 149.8 }, 0.2), light))
  return g
}

/** 圆柱落地灯：磨砂发光圆柱 + 金属底盘和顶盖 */
function columnFloor(p: string[]) {
  const [metal, light] = p
  const g = new THREE.Group()
  g.add(cyl(12, 13, 3, metal, {}, 36))
  g.add(litOutlined(cyl(8.5, 8.5, 108, light, { y: 3 }, 32), light, 0.42))
  g.add(cyl(9, 9, 2, metal, { y: 111 }, 32))
  return g
}

/** 磨砂玻璃筒台灯 */
function tubeTable(p: string[]) {
  const [metal, light] = p
  const g = new THREE.Group()
  g.add(cyl(7, 7.4, 2, metal, {}, 28))
  g.add(litOutlined(cyl(5.4, 5.4, 24, light, { y: 2 }, 28), light, 0.45))
  g.add(cyl(5.8, 5.8, 1, metal, { y: 26 }, 28))
  return g
}

/** LED 光环台灯：立在底座上的发光圆环 */
function ringTable(p: string[]) {
  const [metal, light] = p
  const g = new THREE.Group()
  g.add(rbox(14, 2, 8, metal, {}, 0.8))
  g.add(rbox(2, 3, 2, metal, { y: 2 }, 0.4))
  g.add(litOutlined(torus(10, 1.2, light, { y: 15.8 }), light))
  return g
}

/** 极简书桌灯：圆底座、立杆、水平长臂，臂端扁平灯头底面发光 */
function modernArm(p: string[]) {
  const [metal, light] = p
  const g = new THREE.Group()
  g.add(cyl(7.5, 7.5, 1.6, metal, { z: -7 }, 28))
  g.add(cyl(0.7, 0.7, 34, metal, { y: 1.6, z: -7 }, 10))
  g.add(rod3([0, 35, -7], [0, 35, 3], 0.6, metal))
  g.add(rbox(4, 1.8, 16, metal, { y: 34.2, z: 9 }, 0.6))
  g.add(lit(rbox(3, 0.4, 13.6, light, { y: 33.9, z: 9.6 }, 0.15), light))
  return g
}

/** 竖条 LED 壁灯 */
function ledBarWall(p: string[]) {
  const [metal, light] = p
  const g = new THREE.Group()
  g.add(rbox(4, 40, 2.6, metal, { z: -0.3 }, 0.8))
  g.add(lit(rbox(1.6, 36, 0.6, light, { y: 2, z: 1.1 }, 0.2), light))
  return mountAt(g, 140)
}

/** 上下照圆筒壁灯：两端各一圈发光 */
function upDownWall(p: string[]) {
  const [metal, light] = p
  const g = new THREE.Group()
  g.add(rbox(7, 16, 1.2, metal, { z: -6 }, 0.4))
  g.add(rbox(2, 2, 3, metal, { y: 7, z: -4 }, 0.4))
  g.add(cyl(4, 4, 18, metal, { y: -1, z: 0 }, 24))
  g.add(lit(cyl(3.5, 3.5, 0.6, light, { y: -1.3 }, 24), light))
  g.add(lit(cyl(3.5, 3.5, 0.6, light, { y: 16.7 }, 24), light))
  return mountAt(g, WALL_Y)
}

// =====================================================================
// 工业
// =====================================================================

/** 铁丝笼罩：竖丝 + 三道箍，罩着一颗爱迪生灯泡（cy 为灯泡中心） */
function cage(r: number, h: number, metal: string, cy: number, x = 0, z = 0) {
  const g = new THREE.Group()
  const n = 8
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const pts: V3[] = []
    for (let i = 0; i <= 6; i++) {
      const t = -1 + (2 * i) / 6
      const rr = r * Math.sqrt(1 - 0.75 * t * t)
      pts.push([x + Math.sin(a) * rr, cy + (t * h) / 2, z + Math.cos(a) * rr])
    }
    g.add(tube(pts, 0.28, metal, 12))
  }
  for (const t of [-0.6, 0, 0.6]) g.add(ring(r * Math.sqrt(1 - 0.75 * t * t), 0.35, metal, cy + (t * h) / 2, x, z))
  g.add(bulb(3.6, x, cy, z, 1.35))
  return g
}

/** 铁笼罩落地灯 */
function cageFloor(p: string[]) {
  const [metal, base, accent] = p
  const g = new THREE.Group()
  g.add(cyl(13, 14.5, 3.5, base, {}, 32))
  g.add(cyl(1.2, 1.2, 130, metal, { y: 3.5 }, 10))
  g.add(P(torus(2.4, 0.7, accent), 0, 80, 1.6))
  g.add(cyl(2.2, 2.2, 5, accent, { y: 133 }, 12))
  g.add(cage(9, 20, metal, 147.5))
  g.add(cyl(1.4, 1.4, 1.6, metal, { y: 157.5 }, 8))
  return g
}

/** 测量三脚架探照灯：三根金属腿 + 横放的鼓形灯头，前面发光的灯面 */
function surveyor(p: string[]) {
  const [metal, light, leg] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(rod3([Math.sin(a) * 20, 0, Math.cos(a) * 20], [Math.sin(a) * 1.5, 116, Math.cos(a) * 1.5], 1.1, leg, 8))
    g.add(cyl(1.6, 1.6, 2, metal, { x: Math.sin(a) * 20, z: Math.cos(a) * 20 }, 10))
  }
  g.add(cyl(3, 3, 4, metal, { y: 114 }, 12))
  for (const s of [-1, 1]) g.add(rbox(1.2, 14, 3, metal, { x: s * 12.2, y: 117 }, 0.4))
  g.add(P(cyl(11, 11, 20, metal, {}, 28), 0, 130, -2, Math.PI / 2))
  g.add(P(cyl(11.6, 11.6, 2, metal, {}, 28), 0, 130, 8.6, Math.PI / 2))
  g.add(P(lit(cyl(10, 10, 0.6, light, {}, 28), light), 0, 130, 9.4, Math.PI / 2))
  return centered(g)
}

/** 水管落地灯：法兰底座、竖管、弯头、横管、三通往下吊一颗灯泡，管上一个阀门手轮 */
function pipeFloor(p: string[]) {
  const [pipe, accent, socket] = p
  const g = new THREE.Group()
  g.add(cyl(8, 8, 1.6, pipe, {}, 20))
  g.add(cyl(2.4, 2.4, 2.4, pipe, { y: 1.6 }, 16))
  g.add(cyl(1.7, 1.7, 124, pipe, { y: 4 }, 14))
  g.add(cyl(2.3, 2.3, 3, pipe, { y: 62 }, 16))
  g.add(P(torus(4.5, 0.6, accent), 0, 63.5, 3.2))
  g.add(rod3([0, 63.5, 0], [0, 63.5, 3.2], 0.6, accent))
  g.add(ball(2.6, pipe, { y: 129 }))
  g.add(P(cyl(1.7, 1.7, 24, pipe, {}, 14), 12, 129, 0, 0, 0, Math.PI / 2))
  g.add(ball(2.6, pipe, { x: 24, y: 129 }))
  g.add(cyl(1.7, 1.7, 6, pipe, { x: 24, y: 121 }, 14))
  g.add(cyl(2.2, 2.2, 4, socket, { x: 24, y: 117 }, 14))
  g.add(bulb(3.8, 24, 112, 0, 1.3))
  return centered(g)
}

/** 铁笼台灯：方木块底座 + 黄铜灯头 + 铁丝笼 */
function cageTable(p: string[]) {
  const [metal, wood, brass] = p
  const g = new THREE.Group()
  g.add(rbox(12, 6, 12, wood, {}, 1))
  g.add(cyl(2, 2.2, 4, brass, { y: 6 }, 14))
  g.add(cage(6.2, 14, metal, 17.5))
  g.add(cyl(1, 1, 1.4, metal, { y: 24.5 }, 8))
  return g
}

/** 水管台灯：法兰底、竖管、弯头、横管吊一颗灯泡 */
function pipeTable(p: string[]) {
  const [pipe, socket] = p
  const g = new THREE.Group()
  g.add(cyl(5.5, 5.5, 1.4, pipe, {}, 18))
  g.add(cyl(1.3, 1.3, 20, pipe, { y: 1.4 }, 12))
  g.add(ball(1.8, pipe, { y: 22 }))
  g.add(P(cyl(1.3, 1.3, 11, pipe, {}, 12), 5.5, 22, 0, 0, 0, Math.PI / 2))
  g.add(ball(1.8, pipe, { x: 11, y: 22 }))
  g.add(cyl(1.7, 1.7, 3.2, socket, { x: 11, y: 18 }, 12))
  g.add(bulb(2.8, 11, 14.2, 0, 1.3))
  return centered(g)
}

/** 摇臂建筑师台灯：两节平行弹簧臂 + 金属斗罩（罩内一圈发光） */
function architect(p: string[]) {
  const [metal, spring, base] = p
  const g = new THREE.Group()
  g.add(cyl(8, 9, 2.6, base, { z: -8 }, 28))
  g.add(cyl(1.4, 1.4, 4, metal, { y: 2.6, z: -8 }, 10))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 1, 6, -8], [s * 1, 30, -3], 0.45, metal))
    g.add(rod3([s * 1, 30, -3], [s * 1, 31, 12], 0.45, metal))
  }
  g.add(rod3([0, 10, -7], [0, 22, -5], 0.7, spring, 6))
  g.add(ball(1.3, metal, { y: 30, z: -3 }))
  const head = G(dome(6.5, 8, metal, 8, 1.8), lit(cyl(5.6, 5.6, 0.5, WARM, { y: 0.4 }, 24), WARM, 0.5), bulb(2.2, 0, 3, 0), cyl(1.4, 1.4, 3, metal, { y: 8 }, 10))
  head.rotation.x = -0.45
  head.position.set(0, 23, 14)
  g.add(head)
  return centered(g)
}

/** 铁笼壁灯 */
function cageWall(p: string[]) {
  const [metal, plate] = p
  const g = new THREE.Group()
  g.add(P(cyl(5, 5, 1.6, plate, {}, 20), 0, 10, -8, Math.PI / 2))
  g.add(rod3([0, 10, -7], [0, 10, -2], 1, metal))
  g.add(ball(1.6, metal, { y: 10, z: -1.5 }))
  g.add(cyl(1.8, 1.8, 3, plate, { y: 11, z: 0 }, 12))
  g.add(cage(5.6, 13, metal, 21))
  return mountAt(g, WALL_Y)
}

/** 水管壁灯：墙上法兰、伸出的管、弯头朝下、灯泡 */
function pipeWall(p: string[]) {
  const [pipe, socket] = p
  const g = new THREE.Group()
  g.add(P(cyl(4.5, 4.5, 1.4, pipe, {}, 18), 0, 20, -10, Math.PI / 2))
  g.add(P(cyl(1.3, 1.3, 12, pipe, {}, 12), 0, 20, -3.4, Math.PI / 2))
  g.add(ball(1.8, pipe, { y: 20, z: 3 }))
  g.add(cyl(1.3, 1.3, 4, pipe, { y: 16, z: 3 }, 12))
  g.add(cyl(1.7, 1.7, 3, socket, { y: 13, z: 3 }, 12))
  g.add(bulb(2.8, 0, 9.2, 3, 1.3))
  return mountAt(g, 145)
}

// =====================================================================
// 复古
// =====================================================================

/** 流苏罩落地灯：车削木杆 + 钟形布罩 + 一圈流苏 */
function fringeFloor(p: string[]) {
  const [shadeC, pole, tassel] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [15, 0], [15, 2], [9, 5], [4, 7], [2.4, 12], [2.4, 60], [3.6, 63], [2.2, 66], [2.2, 124], [3, 126], [0, 126]], pole, {}, 24))
  g.add(cyl(0.5, 0.5, 10, BRASS, { y: 126 }, 8))
  g.add(lathe([[19, 0], [18, 4], [14, 12], [10, 20], [9, 24]], shadeC, { y: 122 }, 32, 0.42))
  g.add(ring(19, 0.5, tassel, 122))
  g.add(fringe(18.8, 122, 6, tassel, 34))
  g.add(bulb(3.2, 0, 132, 0))
  g.add(ball(1.4, BRASS, { y: 147.5 }))
  return g
}

/** 郁金香三头落地灯：圆底座、立杆、三根弯臂，每根顶一只朝上的郁金香玻璃罩 */
function tulipFloor(p: string[]) {
  const [glass, metal, base] = p
  const g = new THREE.Group()
  g.add(cyl(14, 15, 3, base, {}, 32))
  g.add(cyl(1, 1, 122, metal, { y: 3 }, 10))
  const heads: [number, number][] = [
    [0, 150],
    [(2 * Math.PI) / 3, 140],
    [(4 * Math.PI) / 3, 132],
  ]
  for (const [a, y] of heads) {
    const ex = Math.sin(a) * 13
    const ez = Math.cos(a) * 13
    g.add(tube([[0, 120, 0], [ex * 0.3, y - 14, ez * 0.3], [ex * 0.9, y - 6, ez * 0.9], [ex, y - 2, ez]], 0.6, metal, 24))
    g.add(cyl(1.6, 1.6, 2, metal, { x: ex, y: y - 2.5, z: ez }, 10))
    g.add(lathe([[0, 0], [2.4, 0.4], [5.4, 4], [6.6, 8.5], [6.2, 11]], glass, { x: ex, y: y - 0.8, z: ez }, 28, 0.45))
    g.add(bulb(2, ex, y + 3, ez))
  }
  return centered(g)
}

/** 蒂芙尼彩玻璃落地灯：古铜立柱 + 锥形彩色玻璃罩 */
function tiffanyFloor(p: string[]) {
  const [c1, c2, bronze, c3] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [14, 0], [14, 1.8], [10, 4], [5, 6], [2.6, 10], [2, 120], [3, 122], [0, 122]], bronze, {}, 20))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(rod3([0, 124, 0], [Math.sin(a) * 9, 130, Math.cos(a) * 9], 0.4, bronze, 6))
  }
  g.add(stainedShade(6, 22, 16, [c1, c2, c1, c3], bronze, 122, 16))
  g.add(cyl(6.4, 6.4, 1.2, bronze, { y: 138 }, 16))
  g.add(ball(1.8, bronze, { y: 140.5 }))
  g.add(bulb(3, 0, 127, 0))
  return g
}

/** 流苏台灯：圆鼓陶瓷座 + 带流苏的钟形罩 */
function fringeTable(p: string[]) {
  const [shadeC, base, tassel] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [6, 0], [7.5, 3], [8, 7], [6, 12], [2.4, 15], [1.6, 17], [0, 17]], base, {}, 24))
  g.add(cyl(0.5, 0.5, 9, BRASS, { y: 17 }, 8))
  g.add(lathe([[12.5, 0], [12, 3], [9, 8], [6.5, 13], [6, 14.5]], shadeC, { y: 22 }, 28, 0.42))
  g.add(ring(12.5, 0.4, tassel, 22))
  g.add(fringe(12.3, 22, 3.6, tassel, 26))
  g.add(bulb(2.4, 0, 28, 0))
  return g
}

/** 熔岩灯：锥形金属座、发光的玻璃瓶里漂着几团亮色的蜡 */
function lavaLamp(p: string[]) {
  const [liquid, blob, metal] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [6.5, 0], [6.4, 1], [4.2, 11], [0, 11]], metal, {}, 24))
  g.add(lathe([[0, 0], [4.2, 0], [5.2, 6], [5.4, 12], [3.6, 20], [2.6, 23], [0, 23]], liquid, { y: 11 }, 24, 0.42))
  for (const [x, y, r, sy] of [
    [0.6, 14.5, 2.6, 1.3],
    [-1.2, 22.5, 1.8, 1.4],
    [1.4, 28.5, 1.2, 1.2],
  ] as const)
    g.add(lit(ball(r, blob, { x, y }, [1, sy, 1]), blob))
  g.add(lathe([[0, 0], [2.8, 0], [1.4, 6], [0, 6.4]], metal, { y: 33.6 }, 20))
  return g
}

/** 彩玻璃蘑菇台灯：古铜座 + 半球形彩玻璃罩 */
function tiffanyMushroom(p: string[]) {
  const [c1, c2, bronze, c3] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [8.5, 0], [8, 1.6], [4, 3.4], [2, 6], [1.6, 22], [0, 22]], bronze, {}, 20))
  const n = 12
  const colors = [c1, c2, c3, c2]
  for (let i = 0; i < n; i++) {
    const mat = toon(colors[i % colors.length], { emissive: 0.45 }).clone()
    mat.side = THREE.DoubleSide
    const geo = new THREE.SphereGeometry(13, 4, 8, (i / n) * Math.PI * 2, (Math.PI * 2) / n, 0, Math.PI / 2)
    const m = new THREE.Mesh(geo, mat)
    m.scale.set(1, 0.72, 1)
    m.position.y = 21
    g.add(m)
    const a = (i / n) * Math.PI * 2
    const arc: V3[] = []
    for (let j = 0; j <= 6; j++) {
      const t = (j / 6) * (Math.PI / 2)
      arc.push([Math.sin(a) * Math.sin(t) * 13.1, 21 + Math.cos(t) * 9.45, Math.cos(a) * Math.sin(t) * 13.1])
    }
    g.add(tube(arc, 0.28, bronze, 10))
  }
  g.add(ring(13, 0.45, bronze, 21))
  g.add(ball(1.6, bronze, { y: 30.6 }))
  g.add(bulb(2.4, 0, 20.5, 0))
  return g
}

/** 乳白玻璃钟罩壁灯：黄铜底座、鹅颈、带棱的钟形罩 */
function milkBellWall(p: string[]) {
  const [glass, brass] = p
  const g = new THREE.Group()
  g.add(P(cyl(5.5, 5.5, 1.6, brass, {}, 24), 0, 24, -10, Math.PI / 2))
  g.add(tube([[0, 24, -9], [0, 25.5, -3], [0, 24, 2], [0, 21, 4]], 0.7, brass, 20))
  g.add(cyl(2, 2, 2.4, brass, { y: 18.6, z: 4 }, 12))
  const bell = lathe([[8.6, 0], [8.2, 2], [6.6, 6], [4.2, 9.4], [2.2, 10.4]], glass, { y: 8.6, z: 4 }, 16, 0.45)
  g.add(bell)
  g.add(ring(8.6, 0.35, brass, 8.6, 0, 4))
  g.add(bulb(2.4, 0, 12.5, 4))
  return mountAt(g, 145)
}

/** 郁金香玻璃壁灯：黄铜圆盘 + 弯臂托一只朝上的郁金香罩 */
function tulipWall(p: string[]) {
  const [glass, brass] = p
  const g = new THREE.Group()
  g.add(P(cyl(4.5, 4.5, 1.6, brass, {}, 20), 0, 6, -8, Math.PI / 2))
  g.add(tube([[0, 6, -7], [0, 5, -1], [0, 8, 3], [0, 13, 4]], 0.7, brass, 20))
  g.add(cyl(1.6, 1.6, 2, brass, { y: 12.8, z: 4 }, 10))
  g.add(lathe([[0, 0], [2.4, 0.4], [5.6, 4], [7, 8.5], [6.6, 11.5]], glass, { y: 14.2, z: 4 }, 28, 0.45))
  g.add(bulb(2, 0, 18.5, 4))
  return mountAt(g, WALL_Y)
}

// =====================================================================
// 可爱
// =====================================================================

/** 云朵落地灯：圆木底座、粉彩灯杆，顶上一朵发光的云 */
function cloudFloor(p: string[]) {
  const [cloudC, pole, base] = p
  const g = new THREE.Group()
  g.add(puck(14, 3.5, base))
  g.add(cyl(1.4, 1.4, 118, pole, { y: 3 }, 12))
  const c = cloud(34, cloudC, 0.45, 0.85)
  c.position.y = 128
  g.add(c)
  return centered(g)
}

/** 熊熊落地灯：坐着的小熊抱着灯杆，顶上带波浪边的鼓形罩 */
function bearFloor(p: string[]) {
  const [shadeC, bear, pole] = p
  const g = new THREE.Group()
  g.add(puck(16, 3, pole))
  g.add(cyl(1.3, 1.3, 120, pole, { y: 3, z: -4 }, 12))
  // 小熊
  g.add(ball(9, bear, { y: 12, z: 2 }, [1, 0.95, 0.9]))
  g.add(ball(7, bear, { y: 26, z: 3 }))
  for (const s of [-1, 1]) {
    g.add(ball(2.6, bear, { x: s * 5.2, y: 31.5, z: 2 }))
    g.add(ball(3, bear, { x: s * 6, y: 4.5, z: 7 }, [1, 0.8, 1.3]))
    g.add(ball(2.4, bear, { x: s * 4.2, y: 16, z: -1.5 }, [1, 1.4, 1]))
  }
  g.add(ball(2.6, '#fff4e6', { y: 24.5, z: 9 }, [1, 0.8, 0.6]))
  g.add(face(10, { y: 27, z: 9.6 }))
  // 灯罩
  g.add(shadeOpen(14, 17, 20, shadeC, { y: 116, z: -4 }))
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2
    g.add(lit(ball(1.6, shadeC, { x: Math.sin(a) * 17, y: 116, z: -4 + Math.cos(a) * 17 }), shadeC, 0.42))
  }
  g.add(bulb(3, 0, 126, -4))
  return centered(g)
}

/** 菌盖轮廓（[半径, 高]）：落地款、台灯款 */
const CAP_FLOOR: [number, number][] = [[5, 0], [20, 0], [20.5, 3], [19, 9], [14, 16], [7, 20], [0, 21]]
const CAP_SMALL: [number, number][] = [[3, 0], [8.5, 0], [8.8, 1.4], [7.8, 4.2], [5, 7.2], [0, 8.2]]

/** 菌盖上的白点：沿轮廓外表面（跳过底面那段）取 t ∈ [0, 1] 处，按外法线方向压扁贴上 */
function capDot(prof: [number, number][], y0: number, a: number, t: number, r: number, color: string) {
  const pts = prof.slice(1)
  const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]))
  let d = t * lens.reduce((x, y) => x + y, 0)
  let i = 0
  while (i < lens.length - 1 && d > lens[i]) d -= lens[i++]
  const [r0, h0] = pts[i]
  const [r1, h1] = pts[i + 1]
  const k = d / lens[i]
  const pr = r0 + (r1 - r0) * k
  const ph = h0 + (h1 - h0) * k
  // 外法线（轮廓切线转 90°）
  const n2 = new THREE.Vector2(h1 - h0, -(r1 - r0)).normalize()
  const n = new THREE.Vector3(Math.sin(a) * n2.x, n2.y, Math.cos(a) * n2.x)
  const m = lit(ball(r, color, {}, [1, 0.3, 1]), color, 0.45)
  m.position.set(Math.sin(a) * pr, y0 + ph, Math.cos(a) * pr).addScaledVector(n, 0.25)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
  return m
}

/** 大蘑菇落地灯：粗白杆 + 带白点的发光菌盖 */
function mushroomFloor(p: string[]) {
  const [cap, stem, dot] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [12, 0], [12.5, 3], [9, 6], [6.5, 12], [5.5, 60], [5, 96], [0, 96]], stem, {}, 28))
  g.add(lathe(CAP_FLOOR, cap, { y: 94 }, 36, 0.42))
  for (const [a, t] of [
    [0.3, 0.3],
    [1.5, 0.5],
    [2.6, 0.25],
    [3.7, 0.55],
    [4.8, 0.35],
    [5.6, 0.6],
    [0.9, 0.75],
    [3.2, 0.8],
  ] as const)
    g.add(capDot(CAP_FLOOR, 94, a, t, 2.6 - t * 1.2, dot))
  g.add(bulb(3, 0, 98, 0))
  return g
}

/** 雨云台灯：小木座上一朵发光的云，下面挂几颗发光的雨滴 */
function rainCloud(p: string[]) {
  const [cloudC, drop, wood] = p
  const g = new THREE.Group()
  g.add(rbox(18, 2.4, 9, wood, {}, 1))
  g.add(cyl(0.6, 0.6, 16, wood, { y: 2.4 }, 8))
  const c = cloud(22, cloudC, 0.45, 0.6)
  c.position.y = 20
  g.add(c)
  for (const [x, l] of [
    [-6, 6],
    [-1, 9],
    [5, 5],
  ] as const) {
    g.add(cyl(0.12, 0.12, l, '#9aa7b8', { x, y: 17 - l }, 4))
    g.add(lit(ball(1.1, drop, { x, y: 16.4 - l }, [1, 1.4, 1]), drop))
  }
  return centered(g)
}

/** 兔子台灯：整只软胶兔子发光（身体、头、耳朵） */
function bunnyTable(p: string[]) {
  const [body, ear, base] = p
  const g = new THREE.Group()
  g.add(puck(7.5, 2, base))
  g.add(litOutlined(ball(6.5, body, { y: 8.5 }, [1, 1, 0.9]), body, 0.42))
  g.add(litOutlined(ball(5.2, body, { y: 18 }), body, 0.42))
  for (const s of [-1, 1]) {
    const e = litOutlined(ball(1.6, body, {}, [1, 3.2, 0.7]), body, 0.42)
    P(e, s * 2.4, 26.5, -0.5, 0, 0, -s * 0.2)
    g.add(e)
    const inner = ball(0.9, ear, {}, [1, 2.6, 0.4])
    P(inner, s * 2.45, 26.5, 0.55, 0, 0, -s * 0.2)
    inner.userData.noOutline = true
    g.add(inner)
  }
  g.add(face(7, { y: 18.4, z: 5 }))
  return g
}

/** 彩虹台灯：四道发光的彩虹弧，两端各一朵小云 */
function rainbowTable(p: string[]) {
  const [c1, c2, cloudC, c3] = p
  const g = new THREE.Group()
  const colors = [c1, c2, c3, '#a8d4f4']
  colors.forEach((c, i) => g.add(litOutlined(torus(11 - i * 2, 0.9, c, { y: 2.5 }, Math.PI), c, 0.5)))
  for (const s of [-1, 1]) {
    const cl = cloud(9, cloudC, 0.42, 0.7)
    cl.position.set(s * 8, 2.6, 0)
    g.add(cl)
  }
  g.add(rbox(26, 1.6, 7, cloudC, {}, 0.6))
  return centered(g)
}

/** 小蘑菇台灯：带白点的发光菌盖 */
function mushroomCute(p: string[]) {
  const [cap, stem, dot] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [6, 0], [6.4, 1.6], [4, 3], [3.2, 6], [3, 11], [0, 11]], stem, {}, 24))
  g.add(lathe(CAP_SMALL, cap, { y: 10 }, 28, 0.42))
  for (const [a, t] of [
    [0.4, 0.3],
    [1.9, 0.5],
    [3.3, 0.35],
    [4.6, 0.55],
    [5.6, 0.25],
  ] as const)
    g.add(capDot(CAP_SMALL, 10, a, t, 1.5 - t * 0.6, dot))
  return g
}

/** 星星壁灯：一颗发光的星星，背后短托 */
function starWall(p: string[]) {
  const [starC, plate] = p
  const g = new THREE.Group()
  g.add(rbox(4, 4, 2.4, plate, { y: 8, z: -2.2 }, 0.8))
  g.add(P(star(10, 3.4, starC, 0.5), 0, 10, 0.6))
  return mountAt(g, 150)
}

/** 月亮小熊壁灯：弯月发光，月牙上趴着一只小熊 */
function moonWall(p: string[]) {
  const [moonC, bear, plate] = p
  const g = new THREE.Group()
  g.add(rbox(5, 5, 2, plate, { x: -6.5, y: 10, z: -2.4 }, 0.8))
  const s = new THREE.Shape()
  s.absarc(0, 0, 11, Math.PI * 0.3, Math.PI * 1.7, false)
  s.absarc(4.5, 0, 8.5, Math.PI * 1.55, Math.PI * 0.45, true)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2, curveSegments: 24 })
  geo.translate(0, 0, -1.1)
  const moon = new THREE.Mesh(geo, toon(moonC, { emissive: 0.5 }))
  moon.position.set(0, 12, 0)
  g.add(moon)
  g.add(ball(2.6, bear, { x: -4, y: 4.2, z: 1 }, [1.2, 0.9, 0.9]))
  g.add(ball(2, bear, { x: -6.6, y: 6.4, z: 1.2 }))
  for (const sx of [-1, 1]) g.add(ball(0.8, bear, { x: -6.6 + sx * 1.4, y: 8.2, z: 1 }))
  return mountAt(g, 148)
}

// =====================================================================
// 新中式
// =====================================================================

/** 木框绢纱方灯落地灯：四根细高立柱撑起一只绢纱方灯，上下各一层框，下面一块搁板 */
function silkSquareFloor(p: string[]) {
  const [wood, silk, accent] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 150, 2.4, wood, { x: sx * 13, z: sz * 13 }, 0.5))
  g.add(squareRim(30, 30, 2.4, wood, 22))
  g.add(rbox(26, 1, 26, wood, { y: 23.4 }, 0.3))
  g.add(litOutlined(rbox(23.4, 54, 23.4, silk, { y: 92 }, 0.3), silk, 0.42))
  g.add(squareRim(30, 30, 2.6, wood, 89.6))
  g.add(squareRim(30, 30, 2.6, wood, 146))
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = huiFrame(18, 40, wood, 99, 11.9, 0.8)
    f.rotation.y = rot
    g.add(f)
  }
  // 顶上四角起翘
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(P(rbox(2, 2, 7, accent, {}, 0.5), sx * 15, 149, sz * 15, 0.35 * -sz, Math.atan2(sx, sz), 0))
  return centered(g)
}

/** 竹节落地灯：方石底座、竹节灯杆、圆筒绢纱罩 */
function bambooNodeFloor(p: string[]) {
  const [bamboo, silk, base] = p
  const g = new THREE.Group()
  g.add(rbox(26, 4, 26, base, {}, 1.2))
  g.add(bambooPole(1.8, 124, bamboo, 4, 20))
  g.add(cyl(1, 1, 8, bamboo, { y: 128 }, 8))
  g.add(shadeOpen(15, 15, 26, silk, { y: 124 }))
  g.add(ring(15, 0.6, bamboo, 124))
  g.add(ring(15, 0.6, bamboo, 150))
  g.add(bulb(3.2, 0, 136, 0))
  return g
}

/** 荷叶落地灯：圆底座、一根弯成荷梗的杆，梗头一片倒扣的发光荷叶 */
function lotusFloor(p: string[]) {
  const [leaf, stem, base] = p
  const g = new THREE.Group()
  g.add(cyl(14, 15, 3, base, {}, 36))
  g.add(tube([[0, 3, -8], [0, 60, -9], [0, 120, -7], [0, 148, -2], [0, 153, 6], [0, 150, 10]], 1.3, stem, 48))
  const leafG = new THREE.Group()
  leafG.add(lathe([[1.5, 0], [20, -0.2], [19, 3], [14, 6.5], [7, 9], [0, 10]], leaf, {}, 36, 0.42))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    leafG.add(rod3([0, 9.8, 0], [Math.sin(a) * 19.4, 0.3, Math.cos(a) * 19.4], 0.25, stem, 4))
  }
  leafG.position.set(0, 140, 10)
  g.add(leafG)
  g.add(bulb(3, 0, 144, 10))
  return centered(g)
}

/** 宫灯台灯：六角绢纱灯体、上下木檐，六角挂小流苏 */
function gongTable(p: string[]) {
  const [wood, silk, tassel] = p
  const g = new THREE.Group()
  g.add(cyl(9, 10, 2.4, wood, {}, 6))
  g.add(cyl(3, 5, 3, wood, { y: 2.4 }, 6))
  g.add(cyl(8, 8, 1.6, wood, { y: 5.4 }, 6))
  g.add(litOutlined(cyl(7, 7, 18, silk, { y: 7 }, 6), silk, 0.45))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    g.add(cyl(0.6, 0.6, 18, wood, { x: Math.sin(a) * 7.4, y: 7, z: Math.cos(a) * 7.4 }, 6))
    g.add(rod3([Math.sin(a) * 7.5, 26.5, Math.cos(a) * 7.5], [Math.sin(a) * 11, 28, Math.cos(a) * 11], 0.5, wood, 6))
    g.add(cyl(0.6, 1, 3.2, tassel, { x: Math.sin(a) * 11, y: 24.4, z: Math.cos(a) * 11 }, 6))
  }
  g.add(cyl(8.4, 8.4, 1.6, wood, { y: 25 }, 6))
  g.add(cyl(3, 7.5, 3, wood, { y: 26.6 }, 6))
  g.add(ball(1.4, BRASS, { y: 30.6 }))
  return g
}

/** 木框绢纱台灯：长方木框，正面回纹，中间绢纱发光 */
function silkFrameTable(p: string[]) {
  const [wood, silk, accent] = p
  const g = new THREE.Group()
  g.add(rbox(22, 3, 12, wood, {}, 0.8))
  for (const s of [-1, 1]) for (const z of [-1, 1]) g.add(rbox(1.8, 30, 1.8, wood, { x: s * 9.6, y: 3, z: z * 4.6 }, 0.4))
  g.add(litOutlined(rbox(18, 26, 8, silk, { y: 4.5 }, 0.3), silk, 0.42))
  for (const z of [-1, 1]) {
    const f = huiFrame(14, 20, accent, 7.5, 4.15, 0.6)
    f.rotation.y = z > 0 ? 0 : Math.PI
    g.add(f)
  }
  g.add(rbox(23, 2.2, 12.6, wood, { y: 32.6 }, 0.6))
  return g
}

/** 竹节台灯：竹节灯身 + 圆筒绢纱罩 */
function bambooTable(p: string[]) {
  const [bamboo, silk, base] = p
  const g = new THREE.Group()
  g.add(cyl(7, 7.5, 2.4, base, {}, 24))
  g.add(bambooPole(1.6, 26, bamboo, 2.4, 7))
  g.add(shadeOpen(10, 11, 13, silk, { y: 24 }))
  g.add(ring(11, 0.4, bamboo, 24))
  g.add(ring(10, 0.4, bamboo, 37))
  g.add(bulb(2.4, 0, 30, 0))
  return g
}

/** 陶瓷瓶台灯：青花梅瓶灯座 + 黄铜颈 + 鼓形绢罩 */
function vaseTable(p: string[]) {
  const [vase, silk, pattern] = p
  const g = new THREE.Group()
  g.add(cyl(5.5, 6, 1.6, CN.rosewood, {}, 24))
  g.add(lathe([[0, 0], [5, 0], [6, 2], [8.5, 12], [9, 16], [6.5, 20], [3, 22], [2.4, 24], [3.2, 25], [0, 25]], vase, { y: 1.6 }, 32))
  for (const y of [8, 13]) g.add(ring(y === 8 ? 7.6 : 8.9, 0.35, pattern, 1.6 + y))
  g.add(ring(6.9, 0.35, pattern, 1.6 + 19.6))
  g.add(cyl(0.6, 0.6, 9, BRASS, { y: 26.6 }, 8))
  g.add(shadeOpen(9, 12, 14, silk, { y: 30 }))
  g.add(ring(12, 0.4, pattern, 30))
  g.add(bulb(2.4, 0, 36, 0))
  return g
}

/** 方形木格壁灯：贴墙的木框方灯箱，正面绢纱 + 回纹 */
function latticeWall(p: string[]) {
  const [wood, silk, accent] = p
  const g = new THREE.Group()
  g.add(rbox(20, 26, 1.6, wood, { z: -5 }, 0.5))
  g.add(litOutlined(rbox(16, 22, 6.4, silk, { y: 2, z: -1 }, 0.3), silk, 0.42))
  for (const s of [-1, 1]) g.add(rbox(2, 24, 2, wood, { x: s * 8.4, y: 1, z: 1.6 }, 0.4))
  for (const y of [0, 24]) g.add(rbox(20, 2, 8.4, wood, { y, z: -1.6 }, 0.5))
  g.add(huiFrame(12, 16, accent, 5, 2.4, 0.6))
  return mountAt(g, 145)
}

/** 挂宫灯壁灯：回纹托臂挑出一盏六角小宫灯，下坠流苏 */
function hexPalaceWall(p: string[]) {
  const [wood, silk, tassel] = p
  const g = new THREE.Group()
  g.add(rbox(5, 18, 1.6, wood, { y: 18, z: -14 }, 0.5))
  g.add(rbox(2, 2, 15, wood, { y: 34, z: -6.5 }, 0.5))
  g.add(rod3([0, 20, -13], [0, 34, -4], 0.8, wood))
  g.add(cyl(0.2, 0.2, 3, tassel, { y: 31, z: 0 }, 4))
  const y0 = 14
  g.add(cyl(3, 6.4, 2.4, wood, { y: y0 + 14.6 }, 6))
  g.add(litOutlined(cyl(5.6, 5.6, 14, silk, { y: y0 }, 6), silk, 0.45))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    g.add(cyl(0.5, 0.5, 14, wood, { x: Math.sin(a) * 5.9, y: y0, z: Math.cos(a) * 5.9 }, 6))
  }
  g.add(cyl(6.4, 6.4, 1.2, wood, { y: y0 - 1.2 }, 6))
  g.add(cyl(6.4, 3, 2.4, wood, { y: y0 - 3.6 }, 6))
  g.add(cyl(0.25, 0.25, 3, tassel, { y: y0 - 6.4 }, 4))
  g.add(cyl(0.8, 1.6, 6, tassel, { y: y0 - 12.4 }, 8))
  return mountAt(g, 135)
}

// =====================================================================
// 欧式古典
// =====================================================================

/** 褶皱布罩铜座落地灯：车削黄铜立柱 + 褶皱布罩 */
function pleatBrassFloor(p: string[]) {
  const [shadeC, brass, base] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [15, 0], [15, 2.4], [12, 4], [6, 7], [3.6, 10], [2.4, 16], [2.2, 70], [4.2, 73], [2.4, 77], [2.2, 118], [3.4, 121], [2.4, 124], [0, 124]], brass, {}, 24))
  g.add(cyl(13, 15, 1.6, base, {}, 32))
  g.add(pleated(13, 20, 26, shadeC, 120, 26))
  g.add(ring(20, 0.5, brass, 120))
  g.add(ring(13, 0.45, brass, 146))
  g.add(ball(1.8, brass, { y: 149 }))
  g.add(bulb(3.4, 0, 132, 0))
  return g
}

/** 三头烛台落地灯：高脚黄铜立柱，顶上三支烛台臂，每支插一根白烛、烛焰灯泡 */
function candelabraFloor(p: string[]) {
  const [brass, candle, drip] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [14, 0], [13, 2], [8, 4], [4, 8], [2.6, 14], [2.2, 128], [3.6, 131], [0, 131]], brass, {}, 24))
  const arms: [number, number][] = [
    [0, 0],
    [-1, 15],
    [1, 15],
  ]
  for (const [s, r] of arms) {
    const x = s * r
    if (s) g.add(tube([[0, 129, 0], [s * 6, 127, 0], [s * 13, 132, 0], [x, 139, 0]], 0.8, brass, 24))
    const y = s ? 139 : 132
    g.add(cyl(3, 2, 2.2, brass, { x, y }, 16))
    g.add(cyl(1.8, 1.8, s ? 12 : 18, candle, { x, y: y + 2 }, 14))
    g.add(cyl(1.9, 1.9, 1, drip, { x, y: y + 1.8 }, 14))
    g.add(bulb(1.3, x, y + (s ? 15.6 : 21.6), 0, 1.7))
  }
  // 两颗水晶坠
  for (const s of [-1, 1]) g.add(ball(1, CRYSTAL, { x: s * 7, y: 125.5 }, [1, 1.6, 1]))
  return centered(g)
}

/** 欧式上照落地灯：叶饰立柱顶着一只雪花石膏碗，向上发光 */
function torchiere(p: string[]) {
  const [bowl, metal, base] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [13, 0], [12.4, 2.4], [8, 4], [4, 9], [2.4, 16], [2, 150], [0, 150]], metal, {}, 24))
  g.add(cyl(14, 14, 1.4, base, {}, 32))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const leaf = ball(3.6, metal, {}, [0.5, 1.4, 0.18])
    leaf.position.set(Math.sin(a) * 3.4, 92, Math.cos(a) * 3.4)
    leaf.rotation.set(0, a, 0)
    leaf.rotateX(0.35)
    g.add(leaf)
  }
  g.add(cyl(4, 2.4, 4, metal, { y: 148 }, 16))
  g.add(lathe([[0, 0], [5, 0], [12, 3], [16, 7], [17.6, 11], [17, 11.6]], bowl, { y: 151 }, 36, 0.42))
  g.add(ring(17.4, 0.5, metal, 162))
  g.add(bulb(3, 0, 158, 0))
  return g
}

/** 水晶烛台台灯：叠起的水晶球柱 + 黄铜托 + 鼓形布罩，罩沿挂一圈水晶坠 */
function crystalTable(p: string[]) {
  const [shadeC, metal, crystal] = p
  const g = new THREE.Group()
  const glass = toon(crystal, { transparent: 0.6 })
  g.add(cyl(7.5, 8, 2.4, metal, {}, 24))
  let y = 2.4
  for (const r of [4.6, 3.6, 4.2, 3]) {
    const b = ball(r, crystal, { y: y + r * 0.9 }, [1, 0.9, 1])
    b.material = glass
    g.add(b)
    y += r * 1.8
    g.add(cyl(1.6, 1.6, 0.8, metal, { y: y - 0.2 }, 12))
    y += 0.6
  }
  g.add(cyl(0.6, 0.6, 9, metal, { y }, 8))
  g.add(shadeOpen(9, 12.5, 14, shadeC, { y: y + 4 }))
  g.add(ring(12.5, 0.4, metal, y + 4))
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2
    const d = ball(0.7, crystal, { x: Math.sin(a) * 12.5, y: y + 2.6, z: Math.cos(a) * 12.5 }, [1, 1.7, 1])
    d.material = glass
    g.add(d)
  }
  g.add(bulb(2.6, 0, y + 10, 0))
  return g
}

/** 褶皱罩铜瓮台灯：黄铜双耳瓮形灯座 + 褶皱布罩 */
function pleatUrnTable(p: string[]) {
  const [shadeC, brass, base] = p
  const g = new THREE.Group()
  g.add(rbox(13, 2.4, 13, base, {}, 0.6))
  g.add(lathe([[0, 0], [4, 0], [3, 2], [6.5, 6], [7.4, 10], [5.6, 15], [2.6, 18], [3.4, 20], [0, 20]], brass, { y: 2.4 }, 28))
  for (const s of [-1, 1]) g.add(tube([[s * 5.5, 17, 0], [s * 9, 16, 0], [s * 9, 11, 0], [s * 7, 9.5, 0]], 0.5, brass, 16))
  g.add(cyl(0.6, 0.6, 9, brass, { y: 22.4 }, 8))
  g.add(pleated(9, 13, 16, shadeC, 27))
  g.add(ring(13, 0.4, brass, 27))
  g.add(bulb(2.6, 0, 34, 0))
  return g
}

/** 布约特（bouillotte）书桌灯：黄铜圆盘座、中杆、两支烛台臂、可升降的漆面圆锥罩 */
function bouillotte(p: string[]) {
  const [tole, brass, inner] = p
  const g = new THREE.Group()
  g.add(cup(11, 10.4, 3, 0.8, brass))
  g.add(cyl(0.8, 0.8, 40, brass, { y: 2 }, 8))
  g.add(ball(1.3, brass, { y: 42.6 }))
  for (const s of [-1, 1]) {
    g.add(tube([[0, 10, 0], [s * 4, 9, 0], [s * 7, 12, 0], [s * 7.4, 16, 0]], 0.55, brass, 16))
    g.add(cyl(1.4, 1, 1.6, brass, { x: s * 7.4, y: 16 }, 12))
    g.add(cyl(1, 1, 6, '#f4ede0', { x: s * 7.4, y: 17.4 }, 12))
    g.add(bulb(0.9, s * 7.4, 24.6, 0, 1.7))
  }
  g.add(dome(12.5, 6, tole, 36, 1.4))
  g.add(lit(cyl(11.4, 11.4, 0.3, inner, { y: 30.4 }, 32), inner, 0.4))
  g.add(ring(12.5, 0.4, brass, 30))
  return g
}

/** 壁式烛台：椭圆雕花背板、两支 S 形烛臂、烛焰灯泡、一颗水晶坠 */
function candleSconce(p: string[]) {
  const [metal, candle, plate] = p
  const g = new THREE.Group()
  g.add(P(cyl(5, 5, 1.4, plate, {}, 24), 0, 10, -8, Math.PI / 2, 0, 0))
  g.children[0].scale.set(1, 1, 1.8)
  g.add(ball(1.4, metal, { y: 21.5, z: -7 }))
  for (const s of [-1, 1]) {
    g.add(tube([[0, 8, -7], [s * 3, 5, -4], [s * 8, 6, -1], [s * 10, 10, 0]], 0.6, metal, 24))
    g.add(cyl(2.4, 1.6, 1.8, metal, { x: s * 10, y: 10 }, 14))
    g.add(cyl(1.4, 1.4, 7, candle, { x: s * 10, y: 11.6 }, 12))
    g.add(bulb(1, s * 10, 20, 0, 1.7))
  }
  const drop = ball(0.9, CRYSTAL, { y: 3, z: -5 }, [1, 1.8, 1])
  drop.material = toon(CRYSTAL, { transparent: 0.6 })
  g.add(drop)
  return mountAt(g, 145)
}

/** 小布罩壁灯：黄铜背板、弯臂、小褶皱罩 */
function shadeSconce(p: string[]) {
  const [shadeC, metal] = p
  const g = new THREE.Group()
  g.add(rbox(6, 16, 1.4, metal, { y: 2, z: -11 }, 0.6))
  g.add(tube([[0, 6, -10], [0, 5, -5], [0, 9, -1], [0, 13, 0]], 0.6, metal, 20))
  g.add(cyl(1.4, 1.2, 2, metal, { y: 12.6 }, 10))
  g.add(pleated(5.5, 8, 9, shadeC, 15, 16))
  g.add(ring(8, 0.3, metal, 15))
  g.add(bulb(1.8, 0, 18.5, 0))
  return mountAt(g, WALL_Y)
}

// =====================================================================
// 美式乡村
// =====================================================================

/** 藤编罩落地灯：原木杆 + 大号藤编圆罩（里面一层发光，外面交叉藤条） */
function rattanFloor(p: string[]) {
  const [rattan, wood, base] = p
  const g = new THREE.Group()
  g.add(puck(15, 3.5, base))
  g.add(cyl(1.6, 1.8, 118, wood, { y: 3 }, 12))
  const cy = 132
  g.add(lathe([[14, -10], [17, -4], [17.5, 2], [15, 9], [8, 14], [0.5, 15]], rattan, { y: cy }, 32, 0.38))
  for (let k = 0; k < 16; k++) {
    for (const dir of [-1, 1]) {
      const a0 = (k / 16) * Math.PI * 2
      const pts: V3[] = []
      for (let i = 0; i <= 8; i++) {
        const t = i / 8
        const yy = -10 + t * 22
        const r = (yy < 2 ? 14 + ((yy + 10) / 12) * 3.5 : 17.5 - ((yy - 2) / 10) * 6.5) + 0.4
        const a = a0 + dir * t * 0.6
        pts.push([Math.sin(a) * r, cy + yy, Math.cos(a) * r])
      }
      g.add(tube(pts, 0.25, rattan, 12))
    }
  }
  g.add(ring(14.2, 0.6, rattan, cy - 10))
  g.add(bulb(3.4, 0, cy - 1, 0))
  return g
}

/** 牧羊钩马灯落地灯：铁杆顶上弯钩，吊一盏马灯 */
function hookLantern(p: string[]) {
  const [iron, glass, base] = p
  const g = new THREE.Group()
  g.add(cyl(13, 14, 2.4, base, {}, 28))
  g.add(cyl(1, 1, 140, iron, { y: 2.4 }, 10))
  g.add(tube([[0, 142, 0], [0, 150, 0], [6, 156, 0], [13, 152, 0], [14, 146, 0]], 1, iron, 24))
  g.add(cyl(0.25, 0.25, 4, iron, { x: 14, y: 142 }, 4))
  g.add(lantern(iron, glass, 14, 117))
  return centered(g)
}

/** 马灯（飓风灯）：油壶底座、玻璃罩、护丝、顶盖与提手（y0 为底面） */
function lantern(metal: string, glass: string, x: number, y0: number, s = 1) {
  const g = new THREE.Group()
  g.add(cyl(6 * s, 6.4 * s, 4 * s, metal, { y: 0 }, 20))
  g.add(lathe([[3.2 * s, 0], [5.2 * s, 4 * s], [5.6 * s, 8 * s], [4.2 * s, 12.5 * s], [2.6 * s, 14 * s]], glass, { y: 4 * s }, 24, 0.42))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    g.add(tube([[Math.sin(a) * 6 * s, 4 * s, Math.cos(a) * 6 * s], [Math.sin(a) * 6.6 * s, 11 * s, Math.cos(a) * 6.6 * s], [Math.sin(a) * 3.6 * s, 18 * s, Math.cos(a) * 3.6 * s]], 0.3 * s, metal, 10))
  }
  g.add(cyl(2 * s, 4.4 * s, 2.6 * s, metal, { y: 17.6 * s }, 20))
  g.add(tube([[-4 * s, 19.5 * s, 0], [-3.4 * s, 24 * s, 0], [0, 25 * s, 0], [3.4 * s, 24 * s, 0], [4 * s, 19.5 * s, 0]], 0.3 * s, metal, 16))
  g.add(bulb(1.6 * s, 0, 9 * s, 0, 1.4))
  g.position.set(x, y0, 0)
  return g
}

/** 旋木柱落地灯：车削原木立柱 + 亚麻鼓罩 */
function turnedWoodFloor(p: string[]) {
  const [shadeC, wood, base] = p
  const g = new THREE.Group()
  g.add(rbox(28, 3, 28, base, {}, 1))
  g.add(lathe([[0, 0], [6, 0], [6, 3], [3.4, 6], [4.6, 10], [2.6, 14], [2.6, 50], [4.4, 56], [2.6, 62], [2.6, 96], [4, 100], [2.4, 104], [2.2, 122], [0, 122]], wood, { y: 3 }, 20))
  g.add(cyl(0.6, 0.6, 12, BRASS, { y: 125 }, 8))
  g.add(shadeOpen(17, 20, 26, shadeC, { y: 122 }))
  g.add(ring(20, 0.4, wood, 122))
  g.add(ring(17, 0.4, wood, 148))
  g.add(bulb(3.4, 0, 134, 0))
  return g
}

/** 马灯台灯 */
function hurricaneTable(p: string[]) {
  const [metal, glass] = p
  return centered(G(lantern(metal, glass, 0, 0, 1.1)))
}

/** 陶罐瓶灯：粗陶酒罐灯座（带小把手）+ 亚麻鼓罩 */
function jugTable(p: string[]) {
  const [jug, shadeC, band] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [6.5, 0], [8.4, 4], [8.8, 10], [7, 16], [3.2, 19], [2.6, 21], [3.2, 22], [0, 22]], jug, {}, 28))
  g.add(ring(8.6, 0.5, band, 7))
  g.add(tube([[2.8, 20, 0], [6.5, 20.5, 0], [7.6, 17, 0], [7.4, 14.5, 0]], 0.7, jug, 12))
  g.add(cyl(0.6, 0.6, 8, BRASS, { y: 22 }, 8))
  g.add(shadeOpen(10, 12.5, 15, shadeC, { y: 26 }))
  g.add(ring(12.5, 0.35, band, 26))
  g.add(bulb(2.6, 0, 33, 0))
  return g
}

/** 藤编罩台灯：木座 + 半球藤编罩 */
function rattanTable(p: string[]) {
  const [rattan, wood] = p
  const g = new THREE.Group()
  g.add(cyl(7, 7.5, 2.4, wood, {}, 24))
  g.add(cyl(1.2, 1.4, 16, wood, { y: 2.4 }, 12))
  const cy = 18
  g.add(lathe([[11, 0], [10.6, 4], [8.4, 8.6], [4, 11], [0.5, 11.6]], rattan, { y: cy }, 28, 0.38))
  for (let k = 0; k < 12; k++) {
    for (const dir of [-1, 1]) {
      const a0 = (k / 12) * Math.PI * 2
      const pts: V3[] = []
      for (let i = 0; i <= 6; i++) {
        const t = i / 6
        const ang = t * (Math.PI / 2) * 0.92
        const a = a0 + dir * t * 0.7
        pts.push([Math.sin(a) * Math.cos(ang) * 11.4, cy + Math.sin(ang) * 11.8, Math.cos(a) * Math.cos(ang) * 11.4])
      }
      g.add(tube(pts, 0.2, rattan, 10))
    }
  }
  g.add(ring(11, 0.45, rattan, cy))
  g.add(bulb(2.4, 0, cy + 3, 0))
  return g
}

/** 谷仓鹅颈壁灯：墙上圆盘、鹅颈弯臂伸出再朝下，金属谷仓罩，罩内一圈发光 */
function barnWall(p: string[]) {
  const [shadeC, metal, inner] = p
  const g = new THREE.Group()
  g.add(P(cyl(5, 5, 1.4, metal, {}, 20), 0, 18, -16, Math.PI / 2))
  g.add(tube([[0, 18, -15], [0, 24, -10], [0, 26, -2], [0, 24, 4], [0, 20, 6]], 0.8, metal, 24))
  g.add(cyl(1.6, 1.6, 2.4, metal, { y: 18, z: 6 }, 10))
  g.add(dome(11, 6.5, shadeC, 18.6, 2, 0, 0, 6))
  g.add(lit(cyl(10, 10, 0.3, inner, { y: 12.6, z: 6 }, 28), inner, 0.45))
  g.add(ring(11, 0.4, shadeC, 12.1, 0, 6))
  g.add(bulb(2.4, 0, 14.4, 6))
  return mountAt(g, 145)
}

/** 马车壁灯：铁艺托架挂一只方形玻璃灯箱 */
function coachWall(p: string[]) {
  const [metal, glass, cap] = p
  const g = new THREE.Group()
  g.add(rbox(6, 26, 1.6, metal, { z: -10 }, 0.6))
  g.add(rod3([0, 6, -9], [0, 10, -2], 0.7, metal))
  g.add(rbox(10, 2, 10, metal, { y: 8, z: 0 }, 0.6))
  g.add(litOutlined(rbox(8, 13, 8, glass, { y: 10 }, 0.3), glass, 0.42))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1, 14, 1, metal, { x: sx * 4.4, y: 9.6, z: sz * 4.4 }, 0.2))
  g.add(cyl(1.6, 7.4, 4, cap, { y: 23 }, 4))
  g.children[g.children.length - 1].rotation.y = Math.PI / 4
  g.add(ball(1, cap, { y: 27.8 }))
  return mountAt(g, 140)
}

// =====================================================================
// 素材表
// =====================================================================

export const LAMPS_MORE: AssetDef[] = [
  // 和风
  def('lp-jp-kaku-andon', '角行灯', 'floor', '角行灯', [30, 30, 68], [
    ['japanese', J.wood, J.washi, J.dark],
    ['japanese', J.dark, J.washi, J.sumi],
    ['japanese', J.hinoki, '#f3ead6', J.wood],
    ['nordic', N.oak, N.white, N.oak],
  ], kakuAndon),
  def('lp-jp-bamboo-floor', '竹编落地灯', 'floor', '竹编', [30, 30, 144], [
    ['japanese', BAMBOO, J.washi, J.dark],
    ['japanese', '#b98e4f', '#f3ead6', J.sumi],
    ['nordic', '#d9c08f', N.white, N.oak],
    ['farmhouse', RATTAN, F.linen, F.oak],
  ], bambooFloor),
  def('lp-jp-ishidoro', '石灯笼造型灯', 'floor', '石灯笼', [44, 44, 79], [
    ['japanese', STONE, J.washi, J.sumi],
    ['japanese', '#8f8c86', '#f3ead6', J.sumi],
    ['japanese', '#cfc8b8', J.washi, J.dark],
  ], ishidoro),
  def('lp-jp-zashiki-andon', '座敷行灯', 'floor', '座敷行灯', [30, 30, 45], [
    ['japanese', J.dark, J.washi, J.sumi],
    ['japanese', J.wood, '#f3ead6', J.sumi],
    ['japanese', '#3b2f2a', J.washi, J.shu],
    ['cute', C.woodL, C.cream, C.pink],
  ], zashikiAndon),
  def('lp-jp-akari-table', '球形和纸台灯', 'table', '和纸球', [22, 22, 34], [
    ['japanese', J.washi, J.sumi, '#d9ccb0'],
    ['japanese', '#f3ead6', J.dark, '#cbbd9e'],
    ['nordic', N.white, N.oak, '#d6d0c4'],
    ['modern', M.white, M.black, M.light],
  ], akariTable),
  def('lp-jp-chochin-table', '提灯台灯', 'table', '提灯', [16, 14, 36], [
    ['japanese', J.washi, J.wood, J.sumi],
    ['japanese', '#e8664a', J.dark, J.sumi],
    ['japanese', '#f3ead6', J.dark, J.ai],
    ['cute', C.sakura, C.woodL, C.pink],
  ], chochinTable),
  def('lp-jp-kumiko-table', '组子木格台灯', 'table', '组子', [18, 18, 25], [
    ['japanese', J.hinoki, J.washi, J.wood],
    ['japanese', J.dark, J.washi, J.dark],
    ['japanese', J.wood, '#f3ead6', J.dark],
    ['nordic', N.oakL, N.white, N.oak],
  ], kumikoTable),
  def('lp-jp-washi-sconce', '木框和纸壁灯', 'wall', '木框和纸', [18, 9.8, 30], [
    ['japanese', J.wood, J.washi, J.dark],
    ['japanese', J.dark, J.washi, J.sumi],
    ['japanese', J.hinoki, '#f3ead6', J.wood],
    ['chinese', CN.rosewood, CN.ivory, CN.ink],
  ], washiSconce),
  def('lp-jp-chochin-wall', '壁挂提灯', 'wall', '提灯', [13, 21, 31], [
    ['japanese', J.washi, J.dark, J.sumi],
    ['japanese', '#e8664a', J.dark, J.sumi],
    ['japanese', '#f3ead6', J.wood, J.ai],
  ], chochinWall, 140),
  def('lp-jp-bamboo-wall', '竹编半罩壁灯', 'wall', '竹编半罩', [20, 10, 30], [
    ['japanese', BAMBOO, J.washi, J.wood],
    ['japanese', '#b98e4f', '#f3ead6', J.dark],
    ['farmhouse', RATTAN, F.linen, F.oak],
    ['nordic', '#d9c08f', N.white, N.oak],
  ], bambooWall, 145),

  // 北欧
  def('lp-nd-ph-floor', 'PH 三层罩落地灯', 'floor', 'PH 三层罩', [38, 38, 154], [
    ['nordic', N.white, N.gray, N.white],
    ['nordic', '#e9c9b6', N.oak, N.white],
    ['nordic', N.sage, N.oak, N.white],
    ['modern', M.white, M.char, M.black],
  ], phFloor),
  def('lp-nd-tripod-wood', '木腿三脚落地灯', 'floor', '木腿三脚', [40, 40, 142], [
    ['nordic', N.linen, N.oak, '#cbb79a'],
    ['nordic', N.white, '#c99f6e', N.gray],
    ['nordic', N.blue, N.oak, N.white],
    ['farmhouse', F.linen, F.oak, F.iron],
  ], tripodWood),
  def('lp-nd-double-globe', '双球落地灯', 'floor', '双球', [36, 28, 160], [
    ['nordic', OPAL, N.oak, N.oak],
    ['nordic', OPAL, N.gray, N.white],
    ['modern', OPAL, M.black, M.black],
    ['retro', '#ffe7b0', BRASS, R.caramel],
  ], doubleGlobe),
  def('lp-nd-mushroom', '蘑菇台灯', 'table', '蘑菇', [24, 24, 28.5], [
    ['nordic', N.white, N.white],
    ['nordic', N.sage, N.white],
    ['nordic', '#e9c9b6', N.oakL],
    ['modern', M.white, M.char],
  ], mushroomNordic),
  def('lp-nd-ph-table', 'PH 三层罩台灯', 'table', 'PH 三层罩', [24, 24, 35], [
    ['nordic', N.white, N.gray, N.oak],
    ['nordic', N.blue, N.white, N.oak],
    ['nordic', N.mustard, N.white, N.white],
    ['retro', R.orange, BRASS, R.cream],
    ['industrial', I.iron, I.steel, I.walnut],
  ], phTable),
  def('lp-nd-oak-arm', '原木折臂书桌灯', 'desk', '原木折臂', [14, 25, 31], [
    ['nordic', N.white, N.oak, N.gray],
    ['nordic', N.sage, N.oak, N.white],
    ['nordic', N.mustard, '#c99f6e', N.white],
    ['cute', C.pink, C.woodL, C.white],
  ], oakArm),
  def('lp-nd-swing-wall', '摇臂壁灯', 'wall', '摇臂', [16, 32, 21], [
    ['nordic', N.linen, N.oak, N.gray],
    ['nordic', N.white, N.oak, BRASS],
    ['japanese', J.washi, J.wood, J.sumi],
    ['retro', R.cream, R.caramel, BRASS],
  ], swingWall, 145),
  def('lp-nd-opal-wall', '乳白球壁灯', 'wall', '乳白球', [15, 17, 24], [
    ['nordic', OPAL, BRASS, N.oak],
    ['nordic', OPAL, N.gray, N.oakL],
    ['modern', OPAL, M.black, M.black],
    ['cute', '#fff4fa', C.pink, C.woodL],
  ], opalWall),

  // 现代
  def('lp-md-minimal-pole', '极简杆落地灯', 'floor', '极简杆', [26, 26, 157], [
    ['modern', M.black, '#fff6e6', M.black],
    ['modern', M.white, '#fff6e6', M.white],
    ['modern', M.silver, '#fff6e6', M.char],
    ['industrial', I.iron, WARM, I.concrete],
  ], minimalPole),
  def('lp-md-led-line', 'LED 线条落地灯', 'floor', 'LED 线条', [28, 16, 153], [
    ['modern', M.black, '#fff6e6', M.black],
    ['modern', M.white, '#fff6e6', M.light],
    ['modern', M.silver, '#ffe9cf', M.char],
  ], ledLine),
  def('lp-md-column', '圆柱落地灯', 'floor', '圆柱', [26, 26, 113], [
    ['modern', M.black, OPAL],
    ['modern', M.white, OPAL],
    ['modern', M.walnut, '#f4ead8'],
    ['nordic', N.oak, N.white],
  ], columnFloor),
  def('lp-md-tube-table', '玻璃筒台灯', 'table', '玻璃筒', [15, 15, 27], [
    ['modern', M.black, OPAL],
    ['modern', M.silver, OPAL],
    ['modern', M.walnut, '#f4ead8'],
    ['nordic', N.oak, N.white],
    ['industrial', I.iron, '#f4ead8'],
  ], tubeTable),
  def('lp-md-ring-table', 'LED 光环台灯', 'table', '光环', [22.4, 8, 27], [
    ['modern', M.black, '#fff6e6'],
    ['modern', M.white, '#fff6e6'],
    ['cute', C.white, '#ffd6e0'],
  ], ringTable),
  def('lp-md-arm', '极简书桌灯', 'desk', '极简', [15, 30, 36], [
    ['modern', M.black, '#fff6e6'],
    ['modern', M.white, '#fff6e6'],
    ['modern', M.silver, '#fff6e6'],
    ['industrial', I.iron, WARM],
  ], modernArm),
  def('lp-md-led-bar-wall', '竖条 LED 壁灯', 'wall', '竖条 LED', [4, 3.6, 40], [
    ['modern', M.black, '#fff6e6'],
    ['modern', M.white, '#fff6e6'],
    ['modern', M.silver, '#ffe9cf'],
  ], ledBarWall, 140),
  def('lp-md-updown-wall', '上下照壁灯', 'wall', '上下照', [8, 11, 18], [
    ['modern', M.char, '#fff6e6'],
    ['modern', M.white, '#fff6e6'],
    ['industrial', I.steel, WARM],
  ], upDownWall),

  // 工业
  def('lp-in-cage-floor', '铁笼罩落地灯', 'floor', '铁笼罩', [29, 29, 159], [
    ['industrial', I.iron, I.iron, BRASS],
    ['industrial', I.iron, I.walnut, I.rust],
    ['industrial', I.steel, I.concrete, I.iron],
    ['farmhouse', F.iron, F.oak, BRASS],
  ], cageFloor),
  def('lp-in-surveyor', '三脚架探照灯', 'floor', '三脚架', [40, 40, 141], [
    ['industrial', I.iron, WARM, I.walnut],
    ['industrial', I.steel, WARM, I.iron],
    ['industrial', '#5b6b5a', WARM, I.walnut],
    ['modern', M.black, '#fff6e6', M.black],
  ], surveyor),
  def('lp-in-pipe-floor', '水管落地灯', 'floor', '水管', [32, 16, 131], [
    ['industrial', I.iron, I.rust, BRASS],
    ['industrial', I.steel, I.iron, I.iron],
    ['industrial', '#8a6a4a', I.iron, BRASS],
  ], pipeFloor),
  def('lp-in-cage-table', '铁笼台灯', 'table', '铁笼', [13, 13, 26], [
    ['industrial', I.iron, I.walnut, BRASS],
    ['industrial', I.iron, I.concrete, I.steel],
    ['industrial', I.steel, I.walnut, BRASS],
    ['farmhouse', F.iron, F.oak, BRASS],
  ], cageTable),
  def('lp-in-pipe-table', '水管台灯', 'table', '水管', [16, 11, 24], [
    ['industrial', I.iron, BRASS],
    ['industrial', I.steel, I.iron],
    ['industrial', '#8a6a4a', BRASS],
  ], pipeTable),
  def('lp-in-architect', '摇臂建筑师台灯', 'desk', '摇臂', [16, 33, 34], [
    ['industrial', I.iron, I.steel, I.iron],
    ['industrial', I.steel, I.iron, I.concrete],
    ['industrial', '#5b6b5a', I.steel, I.iron],
    ['modern', M.white, M.silver, M.white],
  ], architect),
  def('lp-in-cage-wall', '铁笼壁灯', 'wall', '铁笼', [11.8, 17, 25], [
    ['industrial', I.iron, I.iron],
    ['industrial', I.iron, BRASS],
    ['industrial', I.steel, I.iron],
    ['farmhouse', F.iron, F.iron],
  ], cageWall),
  def('lp-in-pipe-wall', '水管壁灯', 'wall', '水管', [9, 18, 22], [
    ['industrial', I.iron, BRASS],
    ['industrial', I.steel, I.iron],
    ['industrial', '#8a6a4a', BRASS],
  ], pipeWall, 145),

  // 复古
  def('lp-rt-fringe-floor', '流苏罩落地灯', 'floor', '流苏罩', [40, 40, 149], [
    ['retro', R.cream, R.caramel, R.mustard],
    ['retro', R.orange, '#7a4a2a', R.cream],
    ['retro', R.teal, R.caramel, R.cream],
    ['classic', CL.wine, CL.walnut, CL.gold],
  ], fringeFloor),
  def('lp-rt-tulip-floor', '郁金香三头落地灯', 'floor', '郁金香', [32, 30, 162], [
    ['retro', '#f4c47a', BRASS, R.caramel],
    ['retro', '#f2a0a0', BRASS, R.cream],
    ['retro', OPAL, BRASS, R.teal],
    ['classic', OPAL, CL.gold, CL.ivory],
  ], tulipFloor),
  def('lp-rt-tiffany-floor', '彩玻璃落地灯', 'floor', '彩玻璃', [44, 44, 142], [
    ['retro', '#e8a83c', '#5aa47a', '#7a5a3a', '#c8473a'],
    ['retro', '#d96a3a', '#f0c35a', '#5a4a3a', '#6a9ad0'],
    ['retro', '#7fb3a0', '#f2d58a', '#6a5a40', '#b85a6a'],
    ['classic', '#c8a0b0', '#f4e6c0', '#7a6040', '#8fa3b8'],
  ], tiffanyFloor),
  def('lp-rt-fringe-table', '流苏台灯', 'table', '流苏', [25, 25, 37], [
    ['retro', R.cream, R.teal, R.mustard],
    ['retro', R.orange, R.cream, R.caramel],
    ['retro', '#f2a0a0', R.cream, R.red],
    ['cute', C.sakura, C.white, C.pink],
  ], fringeTable),
  def('lp-rt-lava', '熔岩灯', 'table', '熔岩', [13, 13, 40], [
    ['retro', '#ffb46b', '#e2482f', CHROME],
    ['retro', '#9fd6c2', '#f0b33a', '#3a3a3c'],
    ['retro', '#d9b3f0', '#ff6fa0', CHROME],
    ['cute', '#bfe6ff', '#ff9ec4', '#ffffff'],
  ], lavaLamp),
  def('lp-rt-tiffany-mushroom', '彩玻璃蘑菇台灯', 'table', '彩玻璃蘑菇', [27, 27, 32], [
    ['retro', '#e8a83c', '#5aa47a', '#7a5a3a', '#c8473a'],
    ['retro', '#d96a3a', '#f0c35a', '#5a4a3a', '#6a9ad0'],
    ['retro', '#7fb3a0', '#f2d58a', '#6a5a40', '#b85a6a'],
  ], tiffanyMushroom),
  def('lp-rt-milk-bell-wall', '乳白钟罩壁灯', 'wall', '乳白钟罩', [17.2, 23, 22], [
    ['retro', OPAL, BRASS],
    ['retro', '#f4e2b8', R.caramel],
    ['farmhouse', OPAL, F.iron],
  ], milkBellWall, 145),
  def('lp-rt-tulip-wall', '郁金香壁灯', 'wall', '郁金香', [14, 20, 26], [
    ['retro', '#f4c47a', BRASS],
    ['retro', '#f2a0a0', BRASS],
    ['retro', OPAL, BRASS],
    ['classic', OPAL, CL.gold],
    ['cute', C.sakura, C.white],
  ], tulipWall),

  // 可爱
  def('lp-ct-cloud-floor', '云朵落地灯', 'floor', '云朵', [36, 28, 147], [
    ['cute', C.white, C.sky, C.woodL],
    ['cute', '#fff4fa', C.pink, C.white],
    ['cute', '#fffbea', C.lemon, C.woodL],
    ['nordic', N.white, N.oak, N.oak],
  ], cloudFloor),
  def('lp-ct-bear-floor', '熊熊落地灯', 'floor', '熊熊', [34, 36, 136], [
    ['cute', C.sakura, '#d9a77a', C.white],
    ['cute', C.lemon, '#e8c49a', C.white],
    ['cute', C.mint, '#cfa07a', C.woodL],
    ['cute', C.lilac, '#f4f0ea', C.white],
  ], bearFloor),
  def('lp-ct-mushroom-floor', '大蘑菇落地灯', 'floor', '大蘑菇', [41, 41, 115], [
    ['cute', '#ff8f86', C.white, C.white],
    ['cute', C.pink, C.cream, C.white],
    ['cute', C.lemon, C.white, C.orange],
    ['retro', R.orange, R.cream, R.cream],
  ], mushroomFloor),
  def('lp-ct-rain-cloud', '雨云台灯', 'table', '雨云', [22, 10, 25], [
    ['cute', C.white, C.sky, C.woodL],
    ['cute', '#fff4fa', C.pink, C.white],
    ['cute', '#fffbea', C.mint, C.woodL],
  ], rainCloud),
  def('lp-ct-bunny', '兔子台灯', 'table', '兔子', [15, 14, 30], [
    ['cute', '#fff6f0', C.pink, C.woodL],
    ['cute', C.sakura, '#ff9db0', C.white],
    ['cute', '#fff3c4', C.peach, C.woodL],
  ], bunnyTable),
  def('lp-ct-rainbow', '彩虹台灯', 'table', '彩虹', [26, 7, 15], [
    ['cute', '#ff8f86', C.lemon, C.white, C.mint],
    ['cute', C.pink, C.peach, '#fff4fa', C.lilac],
    ['cute', C.lilac, C.sky, C.white, C.mint],
  ], rainbowTable),
  def('lp-ct-mushroom', '小蘑菇台灯', 'table', '小蘑菇', [18, 18, 18.5], [
    ['cute', '#ff8f86', C.white, C.white],
    ['cute', C.pink, C.cream, C.white],
    ['cute', C.lilac, C.white, C.lemon],
    ['retro', R.orange, R.cream, R.cream],
  ], mushroomCute),
  def('lp-ct-star-wall', '星星壁灯', 'wall', '星星', [21, 5, 20], [
    ['cute', C.lemon, C.white],
    ['cute', C.pink, C.white],
    ['cute', C.sky, C.white],
    ['modern', '#fff6e6', M.white],
  ], starWall),
  def('lp-ct-moon-wall', '月亮小熊壁灯', 'wall', '月亮', [18, 6, 23], [
    ['cute', C.lemon, '#d9a77a', C.white],
    ['cute', '#fff4fa', '#e8c49a', C.white],
    ['cute', C.lilac, '#f4f0ea', C.white],
  ], moonWall, 148),

  // 新中式
  def('lp-cn-silk-square-floor', '木框绢纱落地灯', 'floor', '木框绢纱', [33, 33, 152], [
    ['chinese', CN.rosewood, CN.ivory, CN.lacquer],
    ['chinese', CN.walnut, '#f4e6c8', CN.brass],
    ['chinese', CN.ink, CN.ivory, CN.lacquer],
    ['japanese', J.dark, J.washi, J.sumi],
  ], silkSquareFloor),
  def('lp-cn-bamboo-floor', '竹节落地灯', 'floor', '竹节', [30, 30, 150], [
    ['chinese', '#8aa36a', CN.ivory, CN.ink],
    ['chinese', CN.walnut, '#f4e6c8', CN.ink],
    ['chinese', CN.brass, CN.ivory, CN.rosewood],
    ['japanese', BAMBOO, J.washi, J.sumi],
  ], bambooNodeFloor),
  def('lp-cn-lotus-floor', '荷叶落地灯', 'floor', '荷叶', [40, 40, 152], [
    ['chinese', '#9cc0a0', CN.ink, CN.ink],
    ['chinese', CN.celadon, CN.brass, CN.walnut],
    ['chinese', '#e8d4a8', CN.brass, CN.ink],
    ['modern', M.white, M.black, M.black],
  ], lotusFloor),
  def('lp-cn-gong-table', '宫灯台灯', 'table', '宫灯', [22, 25, 32], [
    ['chinese', CN.rosewood, CN.ivory, CN.lacquer],
    ['chinese', CN.walnut, '#f6dca8', CN.lacquer],
    ['chinese', CN.ink, '#e8463a', CN.brass],
  ], gongTable),
  def('lp-cn-silk-frame-table', '木框绢纱台灯', 'table', '木框绢纱', [23, 12.6, 35], [
    ['chinese', CN.rosewood, CN.ivory, CN.brass],
    ['chinese', CN.walnut, '#f4e6c8', CN.lacquer],
    ['chinese', CN.ink, CN.ivory, CN.jade],
  ], silkFrameTable),
  def('lp-cn-bamboo-table', '竹节台灯', 'table', '竹节', [22, 22, 37], [
    ['chinese', '#8aa36a', CN.ivory, CN.ink],
    ['chinese', CN.brass, CN.ivory, CN.rosewood],
    ['japanese', BAMBOO, J.washi, J.dark],
  ], bambooTable),
  def('lp-cn-vase-table', '陶瓷瓶台灯', 'table', '陶瓷瓶', [24, 24, 44], [
    ['chinese', '#f4f4f0', CN.ivory, '#2f5a9a'],
    ['chinese', CN.celadon, '#f4e6c8', CN.jade],
    ['chinese', CN.lacquer, CN.ivory, CN.brass],
    ['classic', CL.ivory, CL.cream, CL.blue],
  ], vaseTable),
  def('lp-cn-lattice-wall', '方形木格壁灯', 'wall', '方形木格', [20, 8.4, 26], [
    ['chinese', CN.rosewood, CN.ivory, CN.brass],
    ['chinese', CN.walnut, '#f4e6c8', CN.lacquer],
    ['chinese', CN.ink, CN.ivory, CN.jade],
  ], latticeWall, 145),
  def('lp-cn-palace-wall', '挂宫灯壁灯', 'wall', '挂宫灯', [13, 20, 36], [
    ['chinese', CN.rosewood, CN.ivory, CN.lacquer],
    ['chinese', CN.ink, '#e8463a', CN.brass],
    ['chinese', CN.walnut, '#f6dca8', CN.lacquer],
  ], hexPalaceWall, 135),

  // 欧式古典
  def('lp-cl-pleat-brass-floor', '褶皱布罩铜座落地灯', 'floor', '褶皱布罩', [40, 40, 150], [
    ['classic', CL.ivory, CL.gold, CL.walnut],
    ['classic', CL.blue, CL.gold, CL.ivory],
    ['classic', CL.sage, BRASS, CL.walnut],
    ['farmhouse', F.linen, BRASS, F.oak],
  ], pleatBrassFloor),
  def('lp-cl-candelabra-floor', '三头烛台落地灯', 'floor', '三头烛台', [34, 28, 156], [
    ['classic', CL.gold, CL.ivory, CL.cream],
    ['classic', '#a88a5a', '#f4ede0', CL.ivory],
    ['classic', '#3a3a3c', CL.ivory, CL.gold],
  ], candelabraFloor),
  def('lp-cl-torchiere', '欧式上照落地灯', 'floor', '上照', [36, 36, 163], [
    ['classic', '#f2e6d0', CL.gold, CL.walnut],
    ['classic', OPAL, BRASS, CL.ivory],
    ['classic', '#f4dcc0', '#7a6040', '#3a3a3c'],
    ['retro', '#f4c47a', BRASS, R.caramel],
  ], torchiere),
  def('lp-cl-crystal-table', '水晶烛台台灯', 'table', '水晶', [27, 27, 48], [
    ['classic', CL.ivory, CL.gold, CRYSTAL],
    ['classic', CL.blue, CHROME, CRYSTAL],
    ['classic', CL.wine, CL.gold, '#f4e0e8'],
  ], crystalTable),
  def('lp-cl-pleat-urn', '褶皱罩铜瓮台灯', 'table', '铜瓮', [27, 27, 44], [
    ['classic', CL.ivory, CL.gold, CL.walnut],
    ['classic', CL.sage, BRASS, CL.ivory],
    ['classic', CL.blue, CL.gold, CL.navy],
    ['farmhouse', F.linen, BRASS, F.oak],
  ], pleatUrnTable),
  def('lp-cl-bouillotte', '布约特书桌灯', 'desk', '布约特', [25, 25, 44], [
    ['classic', '#2f4a3a', CL.gold, '#f6e8c8'],
    ['classic', CL.navy, CL.gold, '#f6e8c8'],
    ['classic', CL.wine, BRASS, '#f6e8c8'],
    ['retro', '#3f8f5a', BRASS, R.cream],
  ], bouillotte),
  def('lp-cl-candle-sconce', '壁式烛台', 'wall', '双头烛台', [24.7, 11.1, 22], [
    ['classic', CL.gold, CL.ivory, CL.gold],
    ['classic', '#a88a5a', '#f4ede0', CL.walnut],
    ['classic', '#3a3a3c', CL.ivory, '#3a3a3c'],
  ], candleSconce, 145),
  def('lp-cl-shade-sconce', '小布罩壁灯', 'wall', '小布罩', [16, 20, 25], [
    ['classic', CL.ivory, CL.gold],
    ['classic', CL.blue, CL.gold],
    ['chinese', CN.ivory, CN.brass],
    ['retro', R.mustard, BRASS],
  ], shadeSconce),

  // 美式乡村
  def('lp-fh-rattan-floor', '藤编罩落地灯', 'floor', '藤编罩', [36, 36, 147], [
    ['farmhouse', RATTAN, F.oak, F.oak],
    ['farmhouse', '#d9b47e', F.white, F.oak],
    ['farmhouse', '#b98a50', F.iron, F.iron],
    ['nordic', '#d9c08f', N.oak, N.white],
  ], rattanFloor),
  def('lp-fh-hook-lantern', '马灯落地灯', 'floor', '钩挂马灯', [30, 28, 162], [
    ['farmhouse', F.iron, '#fff0c8', F.iron],
    ['farmhouse', F.barn, '#fff0c8', F.iron],
    ['farmhouse', F.navy, '#fff0c8', F.iron],
    ['industrial', I.iron, WARM, I.concrete],
  ], hookLantern),
  def('lp-fh-turned-wood', '旋木柱落地灯', 'floor', '旋木柱', [40, 40, 148], [
    ['farmhouse', F.linen, F.oak, F.oak],
    ['farmhouse', F.white, F.white, F.oak],
    ['farmhouse', F.butter, '#8a6a4a', F.iron],
    ['nordic', N.white, N.oak, N.oak],
  ], turnedWoodFloor),
  def('lp-fh-hurricane', '马灯台灯', 'table', '马灯', [14, 14, 28], [
    ['farmhouse', F.iron, '#fff0c8'],
    ['farmhouse', F.barn, '#fff0c8'],
    ['farmhouse', F.sage, '#fff0c8'],
    ['industrial', I.iron, WARM],
  ], hurricaneTable),
  def('lp-fh-jug', '陶罐瓶灯', 'table', '陶罐', [25, 25, 41], [
    ['farmhouse', F.white, F.linen, F.navy],
    ['farmhouse', '#c8a878', F.linen, F.barn],
    ['farmhouse', F.sage, F.white, F.oak],
  ], jugTable),
  def('lp-fh-rattan-table', '藤编罩台灯', 'table', '藤编罩', [23, 23, 30], [
    ['farmhouse', RATTAN, F.oak],
    ['farmhouse', '#d9b47e', F.white],
    ['nordic', '#d9c08f', N.oak],
    ['japanese', BAMBOO, J.dark],
  ], rattanTable),
  def('lp-fh-barn-wall', '谷仓鹅颈壁灯', 'wall', '谷仓鹅颈', [22.8, 34.1, 15.1], [
    ['farmhouse', F.barn, F.iron, F.butter],
    ['farmhouse', F.navy, F.iron, F.butter],
    ['farmhouse', F.white, F.iron, F.butter],
    ['industrial', I.iron, I.iron, WARM],
  ], barnWall, 145),
  def('lp-fh-coach-wall', '马车壁灯', 'wall', '马车', [10.5, 16, 28.8], [
    ['farmhouse', F.iron, '#fff0c8', F.iron],
    ['farmhouse', F.barn, '#fff0c8', F.iron],
    ['classic', CL.gold, '#fff0c8', CL.gold],
  ], coachWall, 140),
]
