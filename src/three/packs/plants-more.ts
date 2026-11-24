// 室内绿植补充包：白掌、红掌、金钱树、波士顿蕨（高脚花架）、鹿角蕨（壁挂）、芦荟、君子兰、柠檬树、文竹、网纹草、
// 铜钱草（水培）、孔雀竹芋、风信子（水培）、茉莉花架、枫树盆景、香草立体墙。约定见 kit.ts 开头。
//
// 约定补充：
//   - id 用 pm- 前缀，type 都是 plant（落地的绿植贴墙时枝叶会被 house.ts 的 bendToWalls 往回弯：底部 25% 当花盆硬限位，
//     往上的顶点软夹紧）。所以枝叶一律收在声明的 w / d 以内：叶柄 + 叶片的伸出长度按占地自动缩短（fitLen）。
//   - 花盆都是空心的（cup / 空心车削），土面在口沿下 1.5cm 左右。配色只换盆（和托盘 / 腰线），叶子颜色固定。
//   - 大叶片用挤出的薄叶形（flatLeaf：叶基在原点、沿 +z 伸出、叶面朝 +y），成片的小叶用低段数的扁椭球（oval）。
//   - 叶面花纹（竹芋的孔雀斑、网纹草的叶脉）用 paintPanel 画的贴花，按叶形抠出（alphaTest），浮在叶面上 0.06cm。

import * as THREE from 'three'
import { ball, cached, cloneWithHooks, cup, cyl, markWater, rbox, shade, torus, tray } from '../toon'
import { C, paintPanel, rng, type AssetDef } from '../kit'
import { fitGroup, fitWall, G, ghost, lathe, mesh, noOutline, PI, rod3, taperRod3, tube, type V2, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, R, PROP, define, type Pal } from '../packkit'

const SOIL = '#7f5f45'
const TERRA = '#c8794e'
const STEM = '#5f8f4a'
const MOSS = '#7fae4e'
/** 扁叶片：纬线 2 段（上下两个扇面），正面还是 12 边形 */
const LEAF_LO: [number, number] = [12, 2]
/** 成片的细小羽片 / 花瓣 */
const PIN: [number, number] = [6, 2]
/** 小颗粒（叶齿、石子、花芯） */
const TINY: [number, number] = [6, 4]

// ---------- 向量小工具 ----------

const UPV: V3 = [0, 1, 0]
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
/** 方位角 a（x = cos a、z = sin a）、仰角 e（正值朝上）的单位方向 */
const dirAE = (a: number, e: number): V3 => [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
/** 任意阶贝塞尔（de Casteljau） */
function bez(ps: V3[], t: number): V3 {
  let q = ps
  while (q.length > 1) q = q.slice(1).map((p, i) => lerp3(q[i], p, t))
  return q[0]
}
/** 贝塞尔的单位切向 */
const bezTan = (ps: V3[], t: number) => unit(sub(bez(ps, Math.min(1, t + 0.01)), bez(ps, Math.max(0, t - 0.01))))
/** 和 n 垂直的一对单位向量 */
function perp(n: V3): [V3, V3] {
  const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? UPV : [1, 0, 0]))
  return [u, cross(n, u)]
}

const _basis = new THREE.Matrix4()
/** 局部 +z 对准 dir、局部 +y 尽量朝 up，放在 at（叶片、花瓣、蕨叶分叉都用它摆） */
function orient<T extends THREE.Object3D>(o: T, at: V3, dir: V3, up: V3 = UPV): T {
  const z = new THREE.Vector3(...dir).normalize()
  const y = new THREE.Vector3(...up)
  y.addScaledVector(z, -y.dot(z))
  // up 和 dir 平行时随便取一个垂直方向
  if (y.lengthSq() < 1e-6) {
    y.set(Math.abs(z.y) < 0.9 ? 0 : 1, Math.abs(z.y) < 0.9 ? 1 : 0, 0)
    y.addScaledVector(z, -y.dot(z))
  }
  y.normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  o.quaternion.setFromRotationMatrix(_basis.makeBasis(x, y, z))
  o.position.set(...at)
  return o
}

/** 扁椭球叶：叶基在 base，沿 dir 伸出 len；叶面法线大致朝 up；wide / thick 是宽、厚占长度的比例 */
function oval(len: number, color: string, base: V3, dir: V3, up: V3 = UPV, wide = 0.45, thick = 0.12, seg: [number, number] = LEAF_LO) {
  return orient(ball(len / 2, color, {}, [wide, thick, 1], seg), add(base, unit(dir), len / 2), dir, up)
}

/**
 * 叶柄 + 叶片总长的缩放系数：叶尖（加 pad 的余量）不出 |x| ≤ lx、|z| ≤ lz。
 * parts 是从 base 出发依次走的 [方向, 长度]，按水平位移估算（叶片都是从中心往外长的）。
 */
function fitLen(base: V3, parts: [V3, number][], pad: number, lx: number, lz: number) {
  let dx = 0
  let dz = 0
  for (const [d, l] of parts) {
    const n = unit(d)
    dx += n[0] * l
    dz += n[2] * l
  }
  let k = 1
  if (Math.abs(dx) > 1e-6) k = Math.min(k, (lx - pad - Math.abs(base[0])) / Math.abs(dx))
  if (Math.abs(dz) > 1e-6) k = Math.min(k, (lz - pad - Math.abs(base[2])) / Math.abs(dz))
  return Math.max(0.3, k)
}

// ---------- 挤出的薄叶形 ----------

type LeafKind = 'lance' | 'oval' | 'heart' | 'strap' | 'spathe' | 'lobe'
/** 叶形右半边的轮廓：[x（占叶宽的比例，最大 0.5）, y（占叶长的比例）]，从叶基（x = 0）走到叶尖（x = 0） */
const OUTLINE: Record<LeafKind, V2[]> = {
  // 白掌：长椭圆、尖头
  lance: [[0, 0], [0.2, 0.05], [0.38, 0.2], [0.44, 0.42], [0.38, 0.64], [0.25, 0.83], [0.1, 0.95], [0, 1]],
  // 竹芋、网纹草：宽椭圆、钝头
  oval: [[0, 0], [0.24, 0.03], [0.42, 0.14], [0.5, 0.36], [0.48, 0.6], [0.38, 0.8], [0.2, 0.94], [0, 1]],
  // 红掌：叶柄接在心形的凹口，两片叶耳往后伸
  heart: [[0, 0], [0.14, -0.1], [0.32, -0.13], [0.46, -0.03], [0.5, 0.15], [0.43, 0.4], [0.3, 0.66], [0.14, 0.88], [0, 1]],
  // 君子兰：宽带状，叶尖圆钝
  strap: [[0, 0], [0.44, 0], [0.5, 0.06], [0.5, 0.84], [0.42, 0.95], [0.22, 1], [0, 1]],
  // 白掌的佛焰苞：宽卵形
  spathe: [[0, 0], [0.24, 0.07], [0.44, 0.28], [0.5, 0.5], [0.42, 0.72], [0.24, 0.9], [0, 1]],
  // 鹿角蕨的分叉：基部略窄、末端圆
  lobe: [[0, 0], [0.38, 0.02], [0.46, 0.25], [0.5, 0.6], [0.44, 0.86], [0.26, 0.99], [0, 1]],
}

function leafShape(kind: LeafKind, wid: number, len: number) {
  const pts = OUTLINE[kind]
  const s = new THREE.Shape()
  s.moveTo(pts[0][0] * wid, pts[0][1] * len)
  s.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x * wid, y * len)))
  s.splineThru(pts.slice(0, -1).reverse().map(([x, y]) => new THREE.Vector2(-x * wid, y * len)))
  return s
}

const q5 = (v: number) => Math.max(0.5, Math.round(v * 2) / 2)

/**
 * 薄叶片：叶基在原点、沿 +z 伸出 len、宽 wid，叶面（y = 0）朝 +y、厚度往下。
 * rib：叶面上浅色的主脉；decal / under：叶面 / 叶背的贴花材质（只给叶基在 y = 0 的叶形用：oval）。
 */
function flatLeaf(kind: LeafKind, len: number, wid: number, color: string, o: { t?: number; rib?: string; decal?: THREE.Material; under?: THREE.Material } = {}) {
  const L = q5(len)
  const W = q5(wid)
  const t = o.t ?? 0.25
  const geo = cached(`pm-lf-${kind}-${L}-${W}-${t}`, () => {
    const gg = new THREE.ExtrudeGeometry(leafShape(kind, W, L), { depth: t, bevelEnabled: false, curveSegments: 2 })
    // 形状的 y（叶长）转到 +z，挤出的厚度转到 -y：叶面正好在 y = 0
    gg.rotateX(PI / 2)
    return gg
  })
  const g = G(mesh(geo, color))
  if (o.rib) {
    const rb = cyl(0.13, 0.13, L * 0.78, o.rib, {}, 4)
    rb.rotation.x = PI / 2
    rb.position.set(0, 0.03, L * 0.47)
    g.add(noOutline(rb))
  }
  if (o.decal) {
    const d = new THREE.Mesh(
      cached(`pm-dc-${L}-${W}`, () => new THREE.PlaneGeometry(W, L).rotateX(-PI / 2).translate(0, 0.06, L / 2)),
      o.decal,
    )
    d.userData.noOutline = true
    d.receiveShadow = true
    g.add(d)
  }
  if (o.under) {
    // 叶背的贴花：朝下，画布顶边同样对着叶基（绕 z 转半圈只是左右镜像，叶形左右对称）
    const d = new THREE.Mesh(
      cached(`pm-du-${L}-${W}-${t}`, () => new THREE.PlaneGeometry(W, L).rotateX(-PI / 2).rotateZ(PI).translate(0, -t - 0.06, L / 2)),
      o.under,
    )
    d.userData.noOutline = true
    d.receiveShadow = true
    g.add(d)
  }
  return g
}

/** 叶面贴花的材质：paintPanel 画好的贴图按叶形抠出（透明处 alphaTest 掉），tint 乘在贴图上（白色笔画 → 任意颜色） */
const decalCache = new Map<string, THREE.Material>()
function decalMat(key: string, tint: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  const k = `${key}|${tint}`
  let m = decalCache.get(k)
  if (!m) {
    const src = paintPanel(20, 40, `pm-${key}`, draw).material as THREE.MeshToonMaterial
    const c = cloneWithHooks(src)
    c.alphaTest = 0.5
    c.color.set(tint)
    decalCache.set(k, (m = c))
  }
  return m
}
/** 画布上的叶形路径（和 flatLeaf 的挤出轮廓一致：画布顶边 = 叶基，底边 = 叶尖） */
function leafPath(g: CanvasRenderingContext2D, kind: LeafKind, W: number, H: number) {
  const pts = leafShape(kind, W, H).getPoints(10)
  g.beginPath()
  pts.forEach((p, i) => (i ? g.lineTo(W / 2 + p.x, p.y) : g.moveTo(W / 2 + p.x, p.y)))
  g.closePath()
}

/**
 * 孔雀竹芋的叶面花纹：底色、细密的侧脉、主脉两侧一大一小交替的深色羽状斑、深色叶缘、浅色主脉。
 * 叶面是浅绿 / 深绿，叶背是同样的花纹换成紫红（叶背的斑透出来是深紫）。
 */
const calatheaPaint = (c: { base: string; vein: string; spot: string; edge: string; rib: string }) => (g: CanvasRenderingContext2D, W: number, H: number) => {
  leafPath(g, 'oval', W, H)
  g.save()
  g.clip()
  g.fillStyle = c.base
  g.fillRect(0, 0, W, H)
  g.strokeStyle = c.vein
  g.lineWidth = Math.max(1, W * 0.012)
  for (let i = 0; i < 26; i++) {
    const y = H * (0.06 + i * 0.035)
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(W / 2, y)
      g.lineTo(W / 2 + s * W * 0.5, y + H * 0.09)
      g.stroke()
    }
  }
  g.fillStyle = c.spot
  for (let k = 0; k < 7; k++) {
    const y = H * (0.13 + k * 0.115)
    const big = k % 2 === 0
    for (const s of [-1, 1]) {
      g.save()
      g.translate(W / 2 + s * W * (big ? 0.17 : 0.12), y)
      g.rotate(s * 0.55)
      g.beginPath()
      g.ellipse(0, 0, W * (big ? 0.13 : 0.075), H * (big ? 0.038 : 0.026), 0, 0, PI * 2)
      g.fill()
      g.restore()
    }
  }
  leafPath(g, 'oval', W, H)
  g.strokeStyle = c.edge
  g.lineWidth = W * 0.09
  g.stroke()
  g.strokeStyle = c.rib
  g.lineWidth = W * 0.022
  g.beginPath()
  g.moveTo(W / 2, 0)
  g.lineTo(W / 2, H * 0.97)
  g.stroke()
  g.restore()
}

/** 网纹草叶脉：只画白色的网状叶脉（主脉、五对侧脉、侧脉之间的细横脉、叶缘），其余透明 */
function drawVeins(g: CanvasRenderingContext2D, W: number, H: number) {
  leafPath(g, 'oval', W, H)
  g.save()
  g.clip()
  g.strokeStyle = '#ffffff'
  g.lineCap = 'round'
  g.lineWidth = W * 0.05
  g.beginPath()
  g.moveTo(W / 2, H * 0.02)
  g.lineTo(W / 2, H * 0.97)
  g.stroke()
  g.lineWidth = W * 0.035
  const lat: [number, number][] = []
  for (let k = 0; k < 5; k++) lat.push([H * (0.12 + k * 0.16), H * (0.24 + k * 0.15)])
  for (const s of [-1, 1]) {
    for (const [y0, y1] of lat) {
      g.beginPath()
      g.moveTo(W / 2, y0)
      g.quadraticCurveTo(W / 2 + s * W * 0.3, y0 + (y1 - y0) * 0.3, W / 2 + s * W * 0.5, y1)
      g.stroke()
    }
    // 侧脉之间的细横脉：网格感
    g.lineWidth = W * 0.022
    for (let k = 0; k < lat.length - 1; k++)
      for (const f of [0.35, 0.7]) {
        const xa = W / 2 + s * W * 0.5 * f
        g.beginPath()
        g.moveTo(xa, lat[k][0] + (lat[k][1] - lat[k][0]) * f * 0.8)
        g.lineTo(xa + s * W * 0.04, lat[k + 1][0] + (lat[k + 1][1] - lat[k + 1][0]) * f * 0.8)
        g.stroke()
      }
    g.lineWidth = W * 0.035
  }
  leafPath(g, 'oval', W, H)
  g.lineWidth = W * 0.05
  g.stroke()
  g.restore()
}

/**
 * 叶柄 + 叶片：从 base 沿方位 a、仰角 eStem 伸出叶柄 sl，叶片沿仰角 eLeaf 伸出 ll、宽 wid；
 * 叶尖超出 |x| ≤ lx、|z| ≤ lz 时叶柄和叶片按比例缩短（贴墙弯曲之前就不穿出占地）。返回叶柄顶端。
 */
function stalkLeaf(
  g: THREE.Group,
  base: V3,
  a: number,
  eStem: number,
  sl: number,
  eLeaf: number,
  ll: number,
  wid: number,
  color: string,
  kind: LeafKind,
  lx: number,
  lz: number,
  o: { rib?: string; decal?: THREE.Material; under?: THREE.Material; stemR?: number; stemC?: string; up?: V3 } = {},
) {
  const ds = dirAE(a, eStem)
  const dl = dirAE(a, eLeaf)
  const k = Math.min(1, fitLen(base, [[ds, sl], [dl, ll]], wid / 2, lx, lz))
  const tip = add(base, ds, sl * k)
  g.add(noOutline(rod3(base, tip, o.stemR ?? 0.22, o.stemC ?? STEM, 5)))
  g.add(orient(flatLeaf(kind, ll * k, wid * k, color, o), tip, dl, o.up ?? UPV))
  return tip
}

/** 五瓣小白花（茉莉、柠檬花）：花心在 at，花面朝 n */
function star5(g: THREE.Group, at: V3, n: V3, s: number, petal: string, center: string) {
  const [u, v] = perp(unit(n))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2
    const d = add(add([0, 0, 0], u, Math.cos(a)), v, Math.sin(a))
    g.add(oval(s, petal, add(at, n, 0.1), add(d, n, 0.25), n, 0.62, 0.16, PIN))
  }
  g.add(noOutline(ball(s * 0.24, center, { x: at[0] + n[0] * 0.2, y: at[1] + n[1] * 0.2, z: at[2] + n[2] * 0.2 }, undefined, TINY)))
}

// ---------- 花盆 ----------

interface Pot {
  g: THREE.Group
  /** 土面顶 y */
  soil: number
  /** 土面半径 */
  r: number
  /** 口沿顶 y */
  top: number
}

/** 圆形土面：顶面在 top */
const soilDisc = (r: number, top: number, color = SOIL) => cyl(r, r - 0.05, 0.8, color, { y: top - 0.8 }, 20)

/** 实心环带（素烧盆加厚的口沿） */
function band(rOB: number, rOT: number, rIB: number, rIT: number, h: number, color: string, y = 0) {
  const m = lathe([[rIB, 0], [rOB, 0], [rOT, h], [rIT, h], [rIB, 0]], color)
  m.position.y = y
  return m
}
/** 外轮廓 [r, y] 上的半径插值 */
function rAt(prof: V2[], y: number) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1]
    const [r1, y1] = prof[i]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1)
  }
  return prof[prof.length - 1][0]
}
/** 任意外轮廓的空心旋转体（鼓肚盆、木桶、水培瓶）：外轮廓从底到口沿，壁厚 t */
function hollowLathe(prof: V2[], t: number, color: string, seg = 32) {
  const pts: V2[] = [[0, 0], ...prof]
  const [rt, yt] = prof[prof.length - 1]
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * PI
    pts.push([rt - t / 2 + (Math.cos(a) * t) / 2, yt + (Math.sin(a) * t) / 2])
  }
  pts.push([rt - t, yt])
  for (let i = prof.length - 2; i >= 0; i--) {
    const [r, y] = prof[i]
    if (y <= t + 0.2) break
    pts.push([Math.max(0.1, r - t), y])
  }
  pts.push([Math.max(0.1, rAt(prof, t) - t), t], [0, t])
  return lathe(pts, color, seg)
}

/** 北欧白瓷盆：直筒 + 浅托盘 */
function ceramicPot(R: number, h: number, body: string, saucer: string): Pot {
  const g = new THREE.Group()
  const t = 0.8
  const rB = R * 0.92
  const y0 = 1.2
  g.add(cyl(rB + 1.4, rB + 0.8, y0, saucer, {}, 24))
  g.add(cup(R, rB, h, t, body, { y: y0 }))
  const soil = y0 + h - 1.6
  const sr = rB + ((R - rB) * (h - 1.6)) / h - t - 0.25
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: y0 + h }
}

/** 素烧陶盆：锥形盆身 + 加厚口沿 + 盆托 */
function terraPot(rTop: number, h: number, color: string, saucer: string): Pot {
  const g = new THREE.Group()
  const rBot = rTop * 0.72
  const t = Math.max(0.7, rTop * 0.085)
  const rs = rBot + 2.2
  g.add(cup(rs, rs - 0.9, 2.2, 0.7, saucer))
  const y0 = 0.7
  const hb = Math.max(2, h * 0.2)
  const r1 = rTop - 0.7
  g.add(cup(r1, rBot, h - hb + 0.6, t, color, { y: y0 }))
  const rIn = r1 - t
  g.add(band(rTop - 0.1, rTop, rIn - 0.05, rIn + 0.1, hb, color, y0 + h - hb))
  const soil = y0 + h - 1.6
  g.add(soilDisc(rIn - 0.25, soil))
  return { g, soil, r: rIn - 0.25, top: y0 + h }
}

/** 上釉陶盆：鼓肚轮廓 + 口沿下一道釉色腰线 */
function glazedPot(R: number, h: number, color: string, accent: string): Pot {
  const t = 0.8
  const prof: V2[] = [[R * 0.62, 0], [R * 0.82, h * 0.16], [R * 0.97, h * 0.42], [R, h * 0.62], [R * 0.94, h * 0.86], [R * 0.91, h - t / 2]]
  const g = G(hollowLathe(prof, t, color))
  const yr = h - 1.6
  g.add(torus(rAt(prof, yr) + 0.05, 0.42, accent, { y: yr, rx: PI / 2 }))
  const soil = h - 1.6
  const sr = rAt(prof, soil) - t - 0.3
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: h }
}

/** 高筒水泥 / 陶盆：厚壁直筒，下部一道腰线 */
function tallPot(R: number, h: number, color: string, accent: string): Pot {
  const t = 1.4
  const rB = R * 0.9
  const g = G(cup(R, rB, h, t, color))
  const yb = h * 0.18
  g.add(torus(rB + ((R - rB) * yb) / h + 0.05, 0.6, accent, { y: yb, rx: PI / 2 }))
  const soil = h - 1.8
  const sr = rB + ((R - rB) * soil) / h - t - 0.25
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: h }
}

// ======================================================================
// 1. 白掌：深绿长椭圆叶丛 + 几支白色佛焰苞
// ======================================================================

// ---------- 白掌：白瓷盆里一丛向外斜展的深绿长叶，四支白色佛焰苞高出叶丛，苞前一根奶黄色肉穗 ----------
function peaceLily(p: string[]) {
  const [potC, saucer] = p
  const P = ceramicPot(10, 15, potC, saucer)
  const g = P.g
  const y = P.soil
  const rand = rng(301)
  const LIM = 19.4
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39996 + rand() * 0.3
    const inner = i < 5
    const base: V3 = [Math.cos(a) * 1.2, y - 0.3, Math.sin(a) * 1.2]
    stalkLeaf(
      g,
      base,
      a,
      inner ? 1.38 : 1.18 + rand() * 0.14,
      inner ? 13 + rand() * 3 : 8 + rand() * 5,
      inner ? 0.95 : 0.32 + rand() * 0.35,
      16 + rand() * 4,
      5.6 + rand() * 1.4,
      i % 2 ? '#2f6b3a' : '#3a7d44',
      'lance',
      LIM,
      LIM,
      { rib: '#6aa564' },
    )
  }
  // 花：花葶从叶丛中心伸出，顶上一片白色苞片（开口朝外），苞前立一根肉穗
  for (const [a, hgt] of [[0.6, 31], [2.3, 34], [3.9, 29], [5.3, 33]] as [number, number][]) {
    const base: V3 = [Math.cos(a) * 0.8, y - 0.3, Math.sin(a) * 0.8]
    const top: V3 = [Math.cos(a) * 5, y + hgt, Math.sin(a) * 5]
    g.add(noOutline(rod3(base, top, 0.24, STEM, 5)))
    const sp = flatLeaf('spathe', 8.5, 4.8, '#f7f6ef', { t: 0.3 })
    sp.add(taperRod3([0, 0.35, 0.8], [0, 1.0, 3.8], 0.5, 0.38, '#efe3a6', 8))
    g.add(orient(sp, top, dirAE(a, 1.22), [Math.cos(a), 0, Math.sin(a)]))
  }
  return fitGroup(g)
}

// ======================================================================
// 2. 红掌（火鹤）
// ======================================================================

// ---------- 红掌：鼓肚釉盆、一丛长柄心形亮绿叶，四片红色心形佛焰苞，苞心斜伸出一根黄色肉穗 ----------
function anthurium(p: string[]) {
  const [potC, band] = p
  const P = glazedPot(8.5, 13, potC, band)
  const g = P.g
  const y = P.soil
  const rand = rng(311)
  const LIM = 16.8
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996 + 0.4
    const inner = i < 3
    const base: V3 = [Math.cos(a) * 0.8, y - 0.3, Math.sin(a) * 0.8]
    const ll = 11 + rand() * 2.5
    stalkLeaf(g, base, a, inner ? 1.35 : 1.15 + rand() * 0.12, inner ? 17 + rand() * 3 : 10 + rand() * 5, inner ? 0.2 : -0.25 + rand() * 0.3, ll, ll * 0.74, i % 2 ? '#2f7d3a' : '#3a8a44', 'heart', LIM, LIM, { rib: '#6fae62' })
  }
  // 花：比叶子高的花茎，红色心形苞片几乎水平地朝外张开，肉穗从凹口斜向上伸出
  for (const [a, hgt] of [[0.3, 27], [1.9, 31], [3.5, 25], [5.0, 29]] as [number, number][]) {
    const base: V3 = [Math.cos(a) * 0.6, y - 0.3, Math.sin(a) * 0.6]
    const top: V3 = [Math.cos(a) * 6, y + hgt, Math.sin(a) * 6]
    g.add(noOutline(rod3(base, top, 0.2, STEM, 5)))
    const sp = flatLeaf('heart', 6.8, 5.8, '#e3343c', { t: 0.3 })
    sp.add(taperRod3([0, 0.2, 0.4], [0, 2.8, 2.6], 0.42, 0.22, '#f2cf4a', 8))
    g.add(orient(sp, top, dirAE(a, 0.35)))
  }
  return fitGroup(g)
}

// ======================================================================
// 3. 金钱树（ZZ）
// ======================================================================

// ---------- 金钱树：高筒盆里几根直立微弯的羽状叶柄，基部膨大，两侧对生厚实的深绿椭圆小叶，顶端一片 ----------
function zzPlant(p: string[]) {
  const [potC, band] = p
  const P = tallPot(13, 26, potC, band)
  const g = P.g
  const y = P.soil
  const rand = rng(321)
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996 + rand() * 0.3
    const inner = i < 3
    const L = inner ? 46 + rand() * 6 : 34 + rand() * 9
    // 叶柄先直立、上半段往外拱；顶端的水平半径不超过 17（小叶还要往两侧、往外伸 6cm）
    const lean = Math.min(inner ? 0.12 + rand() * 0.1 : 0.36 + rand() * 0.16, Math.asin(16 / L))
    const out: V3 = [Math.cos(a), 0, Math.sin(a)]
    const base: V3 = [Math.cos(a) * 2, y - 0.4, Math.sin(a) * 2]
    const ctrl: V3[] = [base, add(add(base, UPV, L * 0.6), out, L * Math.sin(lean) * 0.15), add(add(base, UPV, L * Math.cos(lean)), out, L * Math.sin(lean))]
    g.add(tube(Array.from({ length: 7 }, (_, k) => bez(ctrl, k / 6)), 0.55, '#5a8a3e', { seg: 14, radial: 6 }))
    // 膨大的叶柄基部（半埋在土里）
    g.add(ball(1.5, '#7f9a4a', { x: base[0], y: y - 0.1, z: base[2] }, [1, 1.5, 1], [10, 6]))
    const side = unit(cross(out, UPV))
    for (let k = 0; k < 7; k++) {
      const t = 0.34 + k * 0.1
      const pos = bez(ctrl, t)
      const T = bezTan(ctrl, t)
      for (const sd of [-1, 1]) {
        const dir = unit(add(add([0, 0, 0], side, sd * 0.85), T, 0.5))
        g.add(oval(6.4 - k * 0.25, (k + sd) % 3 ? '#2e6b35' : '#3b7f40', pos, dir, add(out, UPV, 0.3), 0.48, 0.16, [12, 3]))
      }
    }
    const tip = bez(ctrl, 1)
    g.add(oval(5.4, '#3b7f40', add(tip, bezTan(ctrl, 1), -0.6), bezTan(ctrl, 1), out, 0.48, 0.16, [12, 3]))
  }
  return fitGroup(g)
}

// ======================================================================
// 4. 波士顿蕨（高脚花架）
// ======================================================================

// ---------- 波士顿蕨：四脚木花架托着白瓷盆，二十来片细长的羽状蕨叶先向上拱起、再越过盆沿垂到花架腰部 ----------
function bostonFern(p: string[]) {
  const [potC, wood] = p
  const g = new THREE.Group()
  // 花架：顶上一圈箍住花盆的木环，四条外撇的腿，腰上一道撑环，环内一块托板
  const top = 58
  const R = 12
  const rB = 10.5
  const H = 16
  const ringY = top + 5
  const ringR = rB + ((R - rB) * 5) / H + 0.75
  const footR = 19
  const legR = (yy: number) => ringR + ((footR - ringR) * (ringY - yy)) / ringY
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2
    g.add(rod3([Math.cos(a) * ringR, ringY, Math.sin(a) * ringR], [Math.cos(a) * footR, 0, Math.sin(a) * footR], 1.1, wood, 8))
  }
  g.add(torus(ringR, 0.8, wood, { y: ringY, rx: PI / 2 }))
  g.add(torus(legR(22), 0.7, wood, { y: 22, rx: PI / 2 }))
  g.add(cyl(legR(top) - 0.2, legR(top) - 0.2, 1.6, shade(wood, -0.06), { y: top - 1.6 }, 24))
  g.add(cup(R, rB, H, 0.8, potC, { y: top }))
  const soil = top + H - 1.6
  g.add(soilDisc(rB + ((R - rB) * (H - 1.6)) / H - 1.05, soil))
  // 蕨叶：三次贝塞尔的叶轴，两侧对生细小羽片（越靠叶尖越短）
  const rand = rng(331)
  const n = 22
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rand() * 0.25
    const inner = i % 4 === 0
    const c = Math.cos(a)
    const s = Math.sin(a)
    const at = (r: number, yy: number): V3 => [c * r, yy, s * r]
    const rise = inner ? 19 + rand() * 4 : 12 + rand() * 7
    const reach = inner ? 14 + rand() * 3 : 21 + rand() * 4
    const drop = inner ? -6 : 3 + rand() * 13
    const ctrl: V3[] = [at(1.4, soil - 0.3), at(reach * 0.3, soil + rise), at(reach * 0.95, soil + rise * 0.7), at(reach, soil - drop)]
    g.add(noOutline(tube(Array.from({ length: 9 }, (_, k) => bez(ctrl, k / 8)), 0.18, '#5f8f4a', { seg: 14, radial: 4 })))
    const green = i % 3 ? '#5fae4f' : '#6fbd58'
    const m = 20
    for (let k = 0; k < m; k++) {
      const t = 0.08 + (k * 0.9) / (m - 1)
      const pos = bez(ctrl, t)
      const T = bezTan(ctrl, t)
      let S = cross(T, UPV)
      if (Math.hypot(...S) < 0.05) S = cross([c, 0, s], UPV)
      S = unit(S)
      const nrm = cross(S, T)
      // 羽片中段最长，叶基和叶尖收短：整片蕨叶是细长的剑形
      const len = 1.4 + 3 * Math.sin(PI * Math.min(1, t * 1.15))
      for (const sd of [-1, 1]) g.add(oval(len, k % 2 ? green : shade(green, -0.05), pos, add(add([0, 0, 0], S, sd), T, 0.35), nrm, 0.36, 0.14, PIN))
    }
  }
  return fitGroup(g)
}

// ======================================================================
// 5. 鹿角蕨（壁挂）
// ======================================================================

/** 鹿角蕨的一片孢子叶：从 base 沿 dir 伸出，末端二叉分开（depth 层），每层变短变窄 */
function antler(g: THREE.Group, base: V3, dir: V3, nrm: V3, len: number, wid: number, depth: number, colors: string[]) {
  const n = unit(sub(nrm, add([0, 0, 0], unit(dir), dot(nrm, unit(dir)))))
  g.add(orient(flatLeaf('lobe', len, wid, colors[colors.length - 1 - depth], { t: 0.3 }), base, dir, n))
  if (!depth) return
  const tip = add(base, unit(dir), len * 0.86)
  const side = cross(n, unit(dir))
  for (const s of [-1, 1]) {
    const th = s * 0.42
    const d = unit(add(add([0, 0, 0], unit(dir), Math.cos(th)), side, Math.sin(th)))
    // 两个分叉各绕自己的走向扭一点：和母叶、彼此都不在同一平面上（叠在一起会闪）
    const tw = s * 0.22
    const n2 = add(add([0, 0, 0], n, Math.cos(tw)), cross(d, n), Math.sin(tw))
    antler(g, tip, d, n2, len * 0.6, wid * 0.74, depth - 1, colors)
  }
}

// ---------- 鹿角蕨：竖挂的木板上一团苔藓，上面两片圆盾形的包叶贴着木板，五片银绿色的鹿角状孢子叶向两侧和下方伸出、末端两次分叉 ----------
function staghorn(p: string[]) {
  const [wood, wire] = p
  const g = new THREE.Group()
  // 木板（背面贴墙）+ 顶边一根挂绳
  g.add(rbox(30, 38, 2.2, wood, { y: 12, z: -8.9 }, 1))
  g.add(noOutline(tube([[-8, 49.6, -8.9], [-4, 54, -8.9], [0, 55.4, -8.9], [4, 54, -8.9], [8, 49.6, -8.9]], 0.25, wire, { seg: 12, radial: 5 })))
  for (const s of [-1, 1]) g.add(cyl(0.7, 0.7, 0.5, '#c9a25a', { x: s * 8, y: 49.3, z: -7.95, rx: PI / 2 }, 10))
  // 苔藓团
  g.add(ball(7.5, '#8f9a5a', { y: 27, z: -6.6 }, [1, 0.85, 0.45]))
  const rand = rng(341)
  for (let i = 0; i < 9; i++) {
    const a = rand() * PI * 2
    g.add(noOutline(ball(1.6 + rand(), i % 2 ? '#7f8f4e' : '#a3a86a', { x: Math.cos(a) * 5.2, y: 27 + Math.sin(a) * 4.6, z: -4.4 }, [1, 1, 0.5], [8, 6])))
  }
  // 盾状包叶：老的一片褐色、新的一片绿色，从苔藓上方贴着木板往上包
  // 老包叶的上缘是起伏的几瓣（三片错开的扁圆叠成），不是一整个圆盘
  for (const [x, yy, r, z] of [[-5, 34, 8, -7.2], [5, 35, 8.4, -7.4], [0, 38.5, 7, -7.6]] as [number, number, number, number][]) g.add(ball(r, '#a8875a', { x, y: yy, z }, [1, 1, 0.14]))
  const shield = ball(8, '#9fb274', { x: 1.5, y: 31, z: -5.4 }, [1.15, 0.85, 0.16])
  shield.rotation.x = -0.2
  g.add(shield)
  // 孢子叶：细长的叶身，末端两次二叉分开
  const cols = ['#b2cb96', '#9fbe84', '#8ab072']
  const base: V3 = [0, 25, -3.6]
  const fronds: [V3, V3, number, number][] = [
    [[-0.55, -0.62, 0.3], [0, 0.35, 1], 14, 4.4],
    [[0.55, -0.6, 0.3], [0, 0.35, 1], 14.5, 4.4],
    [[-0.92, 0.12, 0.28], [0, 0.6, 1], 12, 3.8],
    [[0.94, 0.05, 0.28], [0, 0.6, 1], 11.5, 3.8],
    [[0.06, -0.95, 0.22], [0, 0.2, 1], 16, 4.8],
  ]
  for (const [d, nrm, len, wid] of fronds) antler(g, base, d, nrm, len, wid, 2, cols)
  return fitWall(g, 140, 16.5)
}

// ======================================================================
// 6. 芦荟
// ======================================================================

/** 芦荟叶的车削轮廓：[半径, 沿叶长的位置]，基部宽厚、往叶尖收尖 */
const ALOE_PROF: V2[] = [[0, 0], [0.85, 0.02], [1, 0.12], [0.92, 0.35], [0.7, 0.6], [0.4, 0.82], [0.12, 0.96], [0, 1]]
const aloeGeo = () => cached('pm-aloe-blade', () => new THREE.LatheGeometry(ALOE_PROF.map(([r, y]) => new THREE.Vector2(r, y)), 6).rotateX(PI / 2))

/** 一片芦荟叶：截面压扁的纺锤体，两侧叶缘一排浅色小齿，叶面几点白斑 */
function aloeLeaf(len: number, color: string) {
  const hw = 1.45
  const ht = 0.6
  const lg = new THREE.Group()
  const m = mesh(aloeGeo(), color)
  m.scale.set(hw, ht, len)
  lg.add(m)
  for (const t of [0.22, 0.4, 0.58, 0.74]) {
    const r = rAt(ALOE_PROF, t)
    for (const s of [-1, 1]) lg.add(noOutline(ball(0.22, '#e6efcf', { x: s * (hw * r + 0.05), z: t * len }, undefined, [5, 3])))
  }
  for (const [x, t] of [[0.35, 0.3], [-0.3, 0.5]] as [number, number][]) {
    const r = rAt(ALOE_PROF, t)
    lg.add(noOutline(ball(0.4, '#c6dbb4', { x, y: ht * r * 0.92, z: t * len }, [1, 0.3, 1.6], PIN)))
  }
  return lg
}

// ---------- 芦荟：素烧盆里一丛肉质剑形叶，中心的直立、外圈的斜展，叶缘有浅色小齿 ----------
function aloe(p: string[]) {
  const [potC, saucer] = p
  const P = terraPot(8, 10, potC, saucer)
  const g = P.g
  const y = P.soil
  const LIM = 11.6
  const rings: [number, number, number, number][] = [
    [3, 1.32, 19, 0.4],
    [5, 1.02, 16.5, 1.1],
    [6, 0.6, 13, 1.7],
  ]
  rings.forEach(([n, e, len, r0], j) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * PI * 2 + j * 0.6
      const base: V3 = [Math.cos(a) * r0, y + 0.2, Math.sin(a) * r0]
      const d = dirAE(a, e)
      const L = len * Math.min(1, fitLen(base, [[d, len]], 1.6, LIM, LIM))
      g.add(orient(aloeLeaf(L, (k + j) % 2 ? '#7fae7a' : '#8cb886'), base, d))
    }
  })
  return fitGroup(g)
}

// ======================================================================
// 7. 君子兰
// ======================================================================

// ---------- 君子兰：两列对生的宽带状叶左右扇开、叶尖弯垂，中间一根粗花葶顶着一簇橙色喇叭花 ----------
function clivia(p: string[]) {
  const [potC, band] = p
  const P = glazedPot(9, 14, potC, band)
  const g = P.g
  const y = P.soil
  const rand = rng(371)
  // 叶基：压扁的假鳞茎
  const stem = cyl(2.2, 2.8, 4, '#8cb86a', { y: y - 0.6 }, 14)
  stem.scale.z = 0.6
  g.add(stem)
  const LX = 19.6
  const LZ = 13.4
  // 两列叶排在同一个竖直面（xy 面）里：叶面朝前后，正面看是一把扇开的宽带，侧面看只是窄窄一片
  const FRONT: V3 = [0, 0, 1]
  for (let i = 0; i < 10; i++) {
    const s = i % 2 ? 1 : -1
    const j = Math.floor(i / 2)
    const e = 0.72 + j * 0.13
    const a = (s > 0 ? 0 : PI) + (rand() - 0.5) * 0.4
    const len = 31 - j * 2 + rand() * 2
    const base: V3 = [s * (0.4 + (4 - j) * 0.25), y + 1 + j * 0.5, (rand() - 0.5) * 1.6]
    const d1 = dirAE(a, e + 0.35)
    const d2 = dirAE(a, e - 0.25)
    const k = fitLen(base, [[d1, len * 0.42], [d2, len * 0.6]], 2.2, LX, LZ)
    const color = j % 2 ? '#2f6e3a' : '#3a7d42'
    g.add(orient(flatLeaf('strap', len * 0.45 * k, 4.4, color, { t: 0.3 }), base, d1, FRONT))
    const mid = add(base, d1, len * 0.42 * k)
    g.add(orient(flatLeaf('strap', len * 0.6 * k, 4.2, color, { t: 0.3, rib: '#5e9a5a' }), add(mid, d2, -0.4), d2, FRONT))
  }
  // 花葶 + 伞形花序
  const top: V3 = [0.4, y + 30, 0.8]
  g.add(taperRod3([0, y - 0.3, 0.3], top, 0.65, 0.5, '#7aa04a', 8))
  const n = 14
  for (let k = 0; k < n; k++) {
    const yv = 0.12 + 0.86 * (k / (n - 1))
    const rr = Math.sqrt(1 - yv * yv)
    const d: V3 = [Math.cos(k * 2.4) * rr, yv, Math.sin(k * 2.4) * rr]
    g.add(noOutline(rod3(top, add(top, d, 2.4), 0.12, '#7aa04a', 4)))
    g.add(taperRod3(add(top, d, 2.2), add(top, d, 4.8), 0.35, 1.35, k % 3 ? '#f07a2a' : '#f5933a', 7))
    g.add(noOutline(ball(0.6, '#ffd257', { x: top[0] + d[0] * 4.7, y: top[1] + d[1] * 4.7, z: top[2] + d[2] * 4.7 }, undefined, TINY)))
  }
  return fitGroup(g)
}

// ======================================================================
// 8. 柠檬树
// ======================================================================

// ---------- 柠檬树：鼓肚木桶花盆（两道铁箍、桶板缝），一根主干撑起球形树冠，冠上挂着黄柠檬，点缀几朵白花 ----------
function lemonTree(p: string[]) {
  const [woodC, hoop] = p
  const g = new THREE.Group()
  const prof: V2[] = [[17.5, 0], [19.4, 8], [20, 16], [19.4, 24], [18.4, 31.4]]
  g.add(hollowLathe(prof, 1.6, woodC))
  for (const yy of [5.5, 26]) g.add(torus(rAt(prof, yy) + 0.15, 0.6, hoop, { y: yy, rx: PI / 2 }))
  // 桶板缝：沿桶身轮廓的深色细线
  const seam = shade(woodC, -0.2)
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * PI * 2 + 0.1
    const pt = (yy: number): V3 => [Math.cos(a) * (rAt(prof, yy) + 0.05), yy, Math.sin(a) * (rAt(prof, yy) + 0.05)]
    g.add(noOutline(tube([pt(1.2), pt(8), pt(16), pt(24), pt(30.6)], 0.12, seam, { seg: 8, radial: 3 })))
  }
  const soil = 30
  g.add(soilDisc(rAt(prof, soil) - 1.9, soil))
  // 主干 + 分枝
  const bark = '#8a6f52'
  const fork: V3 = [0.8, 84, -0.4]
  g.add(taperRod3([0, soil - 1, 0], fork, 2.4, 1.6, bark, 10))
  const c0: V3 = [0, 108, 0]
  const blobs: [V3, number][] = [[c0, 17]]
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2 + 0.3
    blobs.push([[Math.cos(a) * 14.5, 108 + (k % 2 ? 3 : -4), Math.sin(a) * 14.5], 12.5])
  }
  blobs.push([[2, 121, -1], 11.5])
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6 + 0.5
    g.add(taperRod3(fork, [Math.cos(a) * 9, 97 + k * 2, Math.sin(a) * 9], 1.1, 0.7, bark, 7))
  }
  const LEAF_A = '#3f8a3a'
  const LEAF_B = '#4a9440'
  blobs.forEach(([c, r], i) => g.add(ball(r, i % 2 ? LEAF_B : LEAF_A, { x: c[0], y: c[1], z: c[2] }, undefined, [16, 12])))
  const reach = (d: V3) => {
    let best = 0
    for (const [c, r] of blobs) {
      const o = sub(c, c0)
      const b = dot(o, d)
      const disc = b * b - dot(o, o) + r * r
      if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc))
    }
    return best
  }
  const fib = (i: number, n: number, off = 0): V3 => {
    const yy = 1 - (2 * (i + 0.5)) / n
    const rr = Math.sqrt(1 - yy * yy)
    const a = i * 2.39996 + off
    return [Math.cos(a) * rr, yy, Math.sin(a) * rr]
  }
  const rand = rng(381)
  // 探出冠面的叶片
  for (let i = 0; i < 44; i++) {
    const d = fib(i, 44, 0.7)
    if (d[1] < -0.75) continue
    const at = add(c0, d, reach(d) - 0.6)
    const ld = unit(add(d, [rand() - 0.5, rand() - 0.3, rand() - 0.5], 0.9))
    g.add(oval(5.2, i % 2 ? '#3a8436' : '#57a24a', at, ld, d, 0.5, 0.12))
  }
  // 柠檬：大半个露在冠外，底端一个小尖
  for (let i = 0; i < 13; i++) {
    const d = fib(i, 13, 2.1)
    if (d[1] > 0.6) continue
    const at = add(c0, d, reach(d) - 0.4)
    g.add(ball(2.7, i % 4 ? '#f5d63a' : '#eccb2a', { x: at[0], y: at[1], z: at[2] }, [0.85, 1.12, 0.85], [12, 8]))
    g.add(noOutline(ball(0.55, '#e3c22a', { x: at[0], y: at[1] - 2.9, z: at[2] }, undefined, TINY)))
  }
  // 白花
  for (let i = 0; i < 8; i++) {
    const d = fib(i, 8, 4.4)
    star5(g, add(c0, d, reach(d) - 0.1), d, 1.5, '#fbf8f1', '#f2d45a')
  }
  return fitGroup(g)
}

// ======================================================================
// 9. 文竹
// ======================================================================

/** 文竹的一片云：一层水平铺开的细碎羽叶（很多细长的小扁片，朝各个方向），中间略厚、边上薄 */
function cloudPad(g: THREE.Group, c: V3, rp: number, rand: () => number) {
  // 薄薄的一层底（细枝分出的小枝在下面连成一片），碎叶都长在它上面
  g.add(ball(rp * 0.82, '#7ab85a', { x: c[0], y: c[1], z: c[2] }, [1, 0.09, 0.85], [10, 3]))
  for (let k = 0; k < 16; k++) {
    const a = rand() * PI * 2
    const d = Math.sqrt(rand()) * rp * 0.88
    const m = ball(0.9 + rand() * 0.5, k % 3 ? '#8cc868' : '#a3d67a', { x: c[0] + Math.cos(a) * d, y: c[1] + (rand() - 0.5) * 0.9 * (1 - d / rp), z: c[2] + Math.sin(a) * d }, [1, 0.2, 0.32], [8, 2])
    m.rotation.y = rand() * PI
    g.add(m)
  }
}

// ---------- 文竹：小白瓷盆里几根细茎直立、微微折曲，茎节上横伸出细枝，枝头一层层水平的云片状细羽叶 ----------
function asparagusFern(p: string[]) {
  const [potC, saucer] = p
  const P = ceramicPot(7, 11, potC, saucer)
  const g = P.g
  const y = P.soil
  const rand = rng(391)
  const LIM = 16.2
  for (let s = 0; s < 5; s++) {
    const a = s * 1.26 + 0.3
    const H = 21 + s * 3.3
    const lean = 2 + rand() * 3
    const pts: V3[] = []
    for (let k = 0; k <= 4; k++) {
      const f = k / 4
      const zig = k % 2 ? 0.8 : -0.8
      pts.push([Math.cos(a) * (0.8 + lean * f) + Math.cos(a + PI / 2) * zig * (k ? 1 : 0), y - 0.3 + H * f, Math.sin(a) * (0.8 + lean * f) + Math.sin(a + PI / 2) * zig * (k ? 1 : 0)])
    }
    g.add(noOutline(tube(pts, 0.16, '#6a8f45', { seg: 16, radial: 4 })))
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, 'centripetal')
    for (const [f, side] of [[0.45, 1], [0.66, -1], [0.86, 1]] as [number, number][]) {
      const q = curve.getPoint(f)
      const node: V3 = [q.x, q.y, q.z]
      const ba = a + side * (0.9 + rand() * 0.4)
      const rp = 4.6 - f * 1.6
      const bl = Math.max(1.5, Math.min(5.5, LIM - rp - Math.hypot(node[0], node[2]) - 0.5))
      const c: V3 = [node[0] + Math.cos(ba) * bl, node[1] + 0.4, node[2] + Math.sin(ba) * bl]
      g.add(noOutline(rod3(node, c, 0.08, '#6a8f45', 4)))
      cloudPad(g, c, rp, rand)
    }
    const tip = pts[pts.length - 1]
    cloudPad(g, add(tip, [0, 0.2, 0]), 2.6, rand)
  }
  return fitGroup(g)
}

// ======================================================================
// 10. 网纹草
// ======================================================================

// ---------- 网纹草：小盆里一团贴着盆沿铺开的圆叶，深绿叶面上白色（或粉色）的网状叶脉 ----------
function fittonia(p: string[]) {
  const [potC, saucer, vein] = p
  const P = ceramicPot(5.5, 6, potC, saucer)
  const g = P.g
  const y = P.soil
  const mat = decalMat('fittonia', vein, drawVeins)
  const rand = rng(401)
  const LIM = 7.8
  // 三圈叶：中心的直立、中圈斜展、外圈从盆沿上方平伸出去（叶基高过口沿，不会插进盆壁）
  const rings: [number, number, number, number, number][] = [
    [6, 1.0, 3.2, 0.6, 2.4],
    [8, 0.5, 3.7, 1.8, P.top - y + 0.3],
    [10, -0.05, 3.9, 3.2, P.top - y + 0.7],
  ]
  rings.forEach(([n, e, len, r0, h0], j) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * PI * 2 + j * 0.5 + rand() * 0.3
      const root: V3 = [Math.cos(a) * r0 * 0.4, y - 0.2, Math.sin(a) * r0 * 0.4]
      const base: V3 = [Math.cos(a) * r0, y + h0, Math.sin(a) * r0]
      g.add(noOutline(rod3(root, base, 0.12, '#6f8f4a', 4)))
      const d = dirAE(a, e)
      const L = len * fitLen(base, [[d, len]], len * 0.4, LIM, LIM)
      g.add(orient(flatLeaf('oval', L, L * 0.78, (k + j) % 2 ? '#2f6a3a' : '#3a7642', { t: 0.2, decal: mat }), base, d))
    }
  })
  return fitGroup(g)
}

// ======================================================================
// 11. 铜钱草（水培）
// ======================================================================

// ---------- 铜钱草：玻璃缸里铺一层石子、半缸清水，几十根细长叶柄从水里伸出，顶上一片片圆盾形的「铜钱」叶 ----------
function pennywort(p: string[]) {
  const [glass, pebble] = p
  const g = new THREE.Group()
  const R = 9
  const H = 15
  const t = 0.5
  g.add(ghost(cup(R, R - 0.5, H, t, glass), glass, 0.3))
  // 水：缸里的水体 + 水面（开着反射时换成会动的水）
  const wy = 10.4
  g.add(ghost(cyl(R - 1.1, R - 1.5, wy - 0.8, '#9fd4ef', { y: 0.6 }, 24), '#9fd4ef', 0.22))
  g.add(markWater(ghost(cyl(R - 1, R - 1, 0.2, '#9fd4ef', { y: wy }, 24), '#9fd4ef', 0.3)))
  const rand = rng(411)
  for (let i = 0; i < 22; i++) {
    const a = rand() * PI * 2
    const d = Math.sqrt(rand()) * 6.6
    g.add(ball(0.8 + rand() * 0.35, i % 3 ? pebble : shade(pebble, -0.08), { x: Math.cos(a) * d, y: 1.25, z: Math.sin(a) * d }, [1, 0.7, 0.9], [8, 6]))
  }
  // 叶：叶柄从石子里伸出（在缸口以下不碰缸壁），叶片是平展的圆盾形，叶柄接在叶背中心
  const n = 28
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996
    const r0 = Math.sqrt((i + 0.5) / n) * 4.2
    const hgt = 17 + rand() * 10
    // 叶柄是直的：缸口（y = H）处离中心的距离要小于缸内壁，顶端的半径照此封顶
    const tr = Math.min(8.4, r0 + 2 + rand() * 4, r0 + ((R - 1.3 - r0) * (hgt - 1.4)) / (H - 1.4))
    const base: V3 = [Math.cos(a) * r0, 1.4, Math.sin(a) * r0]
    const tip: V3 = [Math.cos(a) * tr, hgt, Math.sin(a) * tr]
    g.add(noOutline(rod3(base, tip, 0.12, '#8fbf5a', 4)))
    const lr = Math.min(1.6 + rand() * 0.7, 10.8 - tr)
    const lf = cyl(lr, lr, 0.2, i % 3 ? '#5fb04a' : '#72bf55', {}, 12)
    lf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a) * 0.35 + (rand() - 0.5) * 0.3, 1, Math.sin(a) * 0.35 + (rand() - 0.5) * 0.3).normalize())
    lf.position.set(tip[0], tip[1] + 0.1, tip[2])
    g.add(lf)
    g.add(noOutline(ball(0.28, '#a6d67a', { x: tip[0], y: tip[1] + 0.22, z: tip[2] }, [1, 0.4, 1], TINY)))
  }
  return fitGroup(g)
}

// ======================================================================
// 12. 孔雀竹芋
// ======================================================================

// ---------- 孔雀竹芋：白瓷盆里一丛长柄椭圆大叶斜向上举，叶面浅绿带深绿羽状斑，叶背紫红 ----------
function calathea(p: string[]) {
  const [potC, saucer] = p
  const P = ceramicPot(11, 17, potC, saucer)
  const g = P.g
  const y = P.soil
  const mat = decalMat('calathea', '#ffffff', calatheaPaint({ base: '#b3d98f', vein: '#8fc072', spot: '#356b35', edge: '#2f6230', rib: '#e4f2c8' }))
  const back = decalMat('calathea-back', '#ffffff', calatheaPaint({ base: '#9a5274', vein: '#86456a', spot: '#5e2a48', edge: '#6b3352', rib: '#c48aa6' }))
  const rand = rng(421)
  const LIM = 21.6
  for (let i = 0; i < 13; i++) {
    const a = i * 2.39996 + rand() * 0.2
    const inner = i < 4
    const base: V3 = [Math.cos(a) * 1.4, y - 0.3, Math.sin(a) * 1.4]
    const ll = 15 + rand() * 4
    // 叶片绕自身中脉侧转一些（左右交替）：斜举的叶子从外面也看得到正面的花纹，不是一片片紫红的叶背
    const sd = i % 2 ? 1 : -1
    const up: V3 = [-Math.sin(a) * sd * 1.3, 1, Math.cos(a) * sd * 1.3]
    stalkLeaf(g, base, a, inner ? 1.42 : 1.2 + rand() * 0.15, inner ? 17 + rand() * 3 : 10 + rand() * 7, inner ? 0.55 : 0.15 + rand() * 0.35, ll, ll * 0.6, '#86476a', 'oval', LIM, LIM, {
      decal: mat,
      under: back,
      stemC: '#7f8f4a',
      stemR: 0.26,
      up,
    })
  }
  return fitGroup(g)
}

// ======================================================================
// 13. 风信子（水培）
// ======================================================================

/** 风信子水培瓶外轮廓：下面圆肚盛水，中间细颈，上面一只托球茎的小杯 */
const HY_PROF: V2[] = [[3.2, 0], [4.6, 1.5], [5.2, 4], [4.9, 7], [3.6, 10], [2.4, 12.5], [2.3, 13.5], [3.2, 15], [3.9, 16.6], [4.0, 17.4]]

// ---------- 风信子：玻璃水培瓶（圆肚、细颈、杯口），杯里坐着球茎，白根垂进水里，几片带状叶围着一串紫色小花穗 ----------
function hyacinth(p: string[]) {
  const [glass, flower] = p
  const g = new THREE.Group()
  const t = 0.35
  g.add(ghost(hollowLathe(HY_PROF, t, glass), glass, 0.42))
  // 水：瓶肚到细颈里的水 + 颈口的水面
  const water: V2[] = [[0.1, t + 0.1]]
  for (const [r, yy] of HY_PROF) if (yy > t + 0.2 && yy <= 12.6) water.push([r - t - 0.2, yy])
  water.push([rAt(HY_PROF, 12.6) - t - 0.2, 12.6], [0.1, 12.6])
  g.add(ghost(lathe(water, '#a8d8f0', 24), '#a8d8f0', 0.22))
  g.add(markWater(ghost(cyl(1.6, 1.6, 0.1, '#a8d8f0', { y: 12.75 }, 16), '#a8d8f0', 0.3)))
  // 根：从球茎底收进细颈，在瓶肚里散开
  const rand = rng(431)
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const end = 2.4 + rand() * 3.4
    g.add(noOutline(tube([[c * 0.8, 15.6, s * 0.8], [c * 0.9, 13.2, s * 0.9], [c * 1.6, 10.2, s * 1.6], [c * 2.6 + (rand() - 0.5), 6.5, s * 2.6], [c * 2.4, end, s * 2.4]], 0.11, '#f3efe2', { seg: 14, radial: 4 })))
  }
  // 球茎：外皮紫褐，顶端收尖
  g.add(ball(2.9, '#a07a8a', { y: 17.6 }, [1, 0.9, 1], [14, 10]))
  g.add(taperRod3([0, 19.4, 0], [0, 21.4, 0], 1.6, 0.9, '#b59a80', 10))
  // 叶：带状，从球茎顶斜伸
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + 0.3
    g.add(oval(9 + rand() * 2.5, k % 2 ? '#4f9a4a' : '#5aa850', [Math.cos(a) * 0.6, 20.6, Math.sin(a) * 0.6], dirAE(a, 0.98 + rand() * 0.16), [Math.cos(a), 0, Math.sin(a)], 0.22, 0.07))
  }
  // 花葶 + 花穗：一圈圈螺旋排开的小花，越往上越细
  g.add(cyl(0.5, 0.55, 10.5, '#6fa04a', { y: 20.8 }, 8))
  // 小花：一只只朝外、略朝下开口的小钟（开口一圈浅色），螺旋排开，越往上越小；顶上几颗没开的花苞
  const n = 34
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1)
    const a = k * 2.4
    const s = 1 - f * 0.4
    const yy = 23.2 + f * 7.2
    const d = dirAE(a, -0.35 + f * 0.5)
    const b0: V3 = [0, yy, 0]
    const col = k % 3 ? flower : shade(flower, 0.05)
    g.add(taperRod3(add(b0, d, 0.3), add(b0, d, 2.1 * s), 0.3 * s, 0.85 * s, col, 6))
    g.add(noOutline(ball(0.5 * s, shade(flower, 0.14), { x: d[0] * 2.05 * s, y: yy + d[1] * 2.05 * s, z: d[2] * 2.05 * s }, [1, 1, 1], PIN)))
  }
  for (let k = 0; k < 5; k++) g.add(ball(0.42, shade(flower, 0.08), { x: Math.cos(k * 1.3) * 0.5, y: 30.8 + k * 0.25, z: Math.sin(k * 1.3) * 0.5 }, undefined, TINY))
  return fitGroup(g)
}

// ======================================================================
// 14. 茉莉花架
// ======================================================================

// ---------- 茉莉花架：素烧盆里插两根支杆托一个竖直的大铁圈，两根藤沿支杆螺旋爬上、绕着圆圈缠满，叶间开满白色小花 ----------
function jasmine(p: string[]) {
  const [potC, wire] = p
  const P = terraPot(14, 24, potC, shade(potC, -0.06))
  const g = P.g
  const y = P.soil
  const RR = 17
  const yc = 87
  const sx = 6
  const yJoin = yc - Math.sqrt(RR * RR - sx * sx)
  for (const s of [-1, 1]) g.add(rod3([s * sx, y - 6, 0], [s * sx, yJoin + 0.2, 0], 0.4, wire, 6))
  g.add(torus(RR, 0.4, wire, { y: yc }))
  const rand = rng(441)
  const VINE = '#6b8a3a'
  const nodes: [V3, V3][] = []
  for (const s of [-1, 1]) {
    const pts: V3[] = []
    // 沿支杆螺旋上爬
    for (let k = 0; k <= 16; k++) {
      const f = k / 16
      const ph = f * PI * 6
      pts.push([s * sx + Math.cos(ph) * 0.9, y + f * (yJoin - y), Math.sin(ph) * 0.9])
    }
    // 绕着圆圈缠：从支杆顶上到顶点再过去一点
    const th0 = Math.atan2(yJoin - yc, s * sx)
    const th1 = s > 0 ? PI / 2 + 0.35 : PI / 2 - 0.35
    const span = s > 0 ? th1 - th0 : th1 - (th0 < 0 ? th0 + PI * 2 : th0)
    const steps = 30
    for (let k = 1; k <= steps; k++) {
      const th = th0 + (span * k) / steps
      const ps = k * 0.9
      const radial: V3 = [Math.cos(th), Math.sin(th), 0]
      const off = add(add([0, 0, 0], radial, Math.cos(ps) * 0.9), [0, 0, 1], Math.sin(ps) * 0.9)
      pts.push(add([RR * Math.cos(th), yc + RR * Math.sin(th), 0], off))
    }
    g.add(noOutline(tube(pts, 0.25, VINE, { seg: 90, radial: 4 })))
    for (let k = 3; k < pts.length - 1; k++) {
      const q = pts[k]
      const out: V3 = k > 16 ? unit([q[0], q[1] - yc, 0]) : [s, 0, 0]
      nodes.push([q, out])
    }
  }
  // 节上的叶片和花
  const leafC = ['#3f8a3a', '#4f9a45', '#5aa64c']
  nodes.forEach(([q, out], i) => {
    for (const sd of [-1, 1]) {
      const d = unit(add(add([0, 0, 0], out, 0.5 + rand() * 0.4), [0, 0, 1], sd * (0.7 + rand() * 0.4)))
      g.add(oval(3 + rand() * 0.8, leafC[(i + sd + 3) % 3], q, add(d, [0, 0.2, 0]), out, 0.5, 0.12))
    }
    if (i % 2 === 0) {
      const fz = i % 4 ? 1 : -1
      const fc = add(add(q, out, 1.4), [0, 0, fz], 0.9)
      g.add(noOutline(rod3(q, fc, 0.08, VINE, 4)))
      star5(g, fc, unit(add(out, [0, 0, fz], 1.2)), 1.7, '#fbf8f1', '#f2e3a0')
    } else if (i % 4 === 1) {
      g.add(ball(0.5, '#f4f0e4', { x: q[0] + out[0] * 0.9, y: q[1] + out[1] * 0.9 + 0.4, z: q[2] + 0.5 }, [1, 1.4, 1], TINY))
    }
  })
  // 盆里的一丛矮枝
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * PI * 2 + 0.2
    const base: V3 = [Math.cos(a) * 2, y - 0.2, Math.sin(a) * 2]
    const tip = add(base, dirAE(a, 1.05), 9 + rand() * 4)
    g.add(noOutline(rod3(base, tip, 0.18, VINE, 4)))
    for (const f of [0.5, 0.8, 1]) {
      const q = lerp3(base, tip, f)
      for (const sd of [-1, 1]) g.add(oval(2.8, leafC[Math.floor(k + f * 3) % 3], q,dirAE(a + sd * 1.2, 0.2), UPV, 0.5, 0.12))
    }
    if (k % 2) star5(g, add(tip, [0, 0.4, 0]), [Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5], 1.2, '#fbf8f1', '#f2e3a0')
  }
  return fitGroup(g)
}

// ======================================================================
// 15. 枫树盆景
// ======================================================================

/** 一片掌状小枫叶：五片裂片从叶柄端放射开 */
function mapleLeaf(g: THREE.Group, at: V3, n: V3, s: number, color: string) {
  const [u, v] = perp(n)
  for (let k = 0; k < 5; k++) {
    const a = -PI / 2 + ((k - 2) * PI) / 3.4
    const d = add(add([0, 0, 0], u, Math.cos(a)), v, Math.sin(a))
    g.add(oval(s * (k === 2 ? 1.15 : k % 4 ? 1 : 0.7), color, at, d, n, 0.42, 0.14, PIN))
  }
}

// ---------- 枫树盆景：浅长方紫砂盆、土面铺苔，一株向右斜出的枫树（根盘、曲干、几根侧枝），枝头一团团红色掌状小叶 ----------
function bonsaiMaple(p: string[]) {
  const [potC] = p
  const g = new THREE.Group()
  const W = 34
  const D = 22
  const H = 7
  g.add(tray(W, H - 0.8, D, 0.9, potC, { y: 0.8 }, 0.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.8, 0.8, 2, shade(potC, -0.05), { x: sx * (W / 2 - 3), z: sz * (D / 2 - 2.5) }, 0.3))
  const y = H - 1.4
  g.add(rbox(W - 2.1, 0.8, D - 2.1, SOIL, { y: y - 0.8 }, 0.2))
  for (const [x, z, r] of [[-11, 5, 2.6], [-3, 6, 2], [6, -5.5, 2.8], [-12, -5, 1.9], [11, 5, 2.2], [2, 3, 1.6]]) g.add(ball(r, MOSS, { x, y, z }, [1, 0.32, 0.9], [10, 5]))
  g.add(ball(2.2, '#9a958c', { x: 12, y: y + 0.4, z: -3 }, [1.2, 0.65, 0.9]))
  // 根盘 + 斜干
  const bark = '#6e5a4a'
  g.add(ball(3, bark, { x: -7, y, z: 0.5 }, [1.4, 0.45, 1.2]))
  for (const a of [0.4, 2.2, 3.6, 5.2]) g.add(taperRod3([-7, y + 0.3, 0.5], [-7 + Math.cos(a) * 5, y - 0.2, 0.5 + Math.sin(a) * 4], 1.1, 0.35, bark, 6))
  const trunk: [V3, number][] = [
    [[-7, y - 0.3, 0.5], 2.2],
    [[-4.5, y + 6, 1.2], 1.8],
    [[-0.5, y + 11, 0.3], 1.45],
    [[3.5, y + 16.5, -0.6], 1.15],
    [[7.5, y + 21, 0], 0.9],
    [[10, y + 25, 0.5], 0.7],
  ]
  for (let i = 0; i < trunk.length - 1; i++) {
    g.add(taperRod3(trunk[i][0], trunk[i + 1][0], trunk[i][1], trunk[i + 1][1], bark, 10))
    g.add(ball(trunk[i + 1][1], bark, { x: trunk[i + 1][0][0], y: trunk[i + 1][0][1], z: trunk[i + 1][0][2] }, undefined, [10, 8]))
  }
  // 叶团：先一团压扁的红色底，再在顶面、侧面撒掌状小叶
  const REDS = ['#d8452f', '#e8613a', '#c23a2a', '#ef8a3a']
  const pads: [number, V3, number][] = [
    [1, [-11, y + 13, 1.5], 0.85],
    [2, [-3, y + 18.5, -3.5], 0.9],
    [3, [9, y + 17.5, 3], 0.9],
    [4, [12.5, y + 26.5, -1.5], 0.85],
    [5, [6, y + 29, 1.5], 1],
  ]
  const rand = rng(451)
  for (const [ti, c, s] of pads) {
    g.add(rod3(trunk[ti][0], [c[0], c[1] - 0.6, c[2]], 0.4, bark, 6))
    // 底：三小团深红叠成起伏的云片（单独一个扁球像蘑菇伞）
    for (const [dx, dy, dz, r] of [[0, 0, 0, 3.4], [-2.4, -0.3, 1, 2.6], [2.3, 0.2, -0.8, 2.7]] as [number, number, number, number][])
      g.add(ball(r * s, shade(REDS[2], -0.05), { x: c[0] + dx * s, y: c[1] + dy * s, z: c[2] + dz * s }, [1.1, 0.55, 0.9], [8, 5]))
    // 掌状小叶：顶面一圈、外缘一圈（叶面朝外上方），盖住大半个底团
    for (let k = 0; k < 10; k++) {
      const a = k * 2.39996 + rand() * 0.4
      const top = k % 3 !== 2
      const rr = (top ? 2.6 * Math.sqrt((k + 0.5) / 10) : 4.6) * s
      const at: V3 = [c[0] + Math.cos(a) * rr * 1.1, c[1] + (top ? 1.7 : 0.2) * s, c[2] + Math.sin(a) * rr * 0.85]
      const n = unit(top ? [(rand() - 0.5) * 0.8, 2, (rand() - 0.5) * 0.8] : [Math.cos(a), 0.7, Math.sin(a)])
      mapleLeaf(g, at, n, 2 * s, REDS[(k + ti) % 4])
    }
  }
  return fitGroup(g)
}

// ======================================================================
// 16. 香草立体墙
// ======================================================================

/** 小陶盆（16 段的空心车削，口沿加厚一圈）：返回土面顶 y */
function herbPot(g: THREE.Group, x: number, y0: number, z: number, color: string) {
  const prof: V2[] = [[3.8, 0], [4.9, 7], [5.5, 7.2], [5.5, 8.7]]
  const m = hollowLathe(prof, 0.6, color, 16)
  m.position.set(x, y0, z)
  g.add(m)
  const soil = y0 + 7.6
  const sd = cyl(4.3, 4.25, 0.8, SOIL, { x, y: soil - 0.8, z }, 16)
  g.add(sd)
  return soil
}

/** 小盆香草：罗勒（宽叶对生）/ 薄荷（小圆叶、有几枝垂出盆沿）/ 迷迭香（直立的针叶枝） */
function miniHerb(g: THREE.Group, kind: 'basil' | 'mint' | 'rosemary', x: number, y: number, z: number, rand: () => number) {
  if (kind === 'basil') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + rand()
      const base: V3 = [x + Math.cos(a) * 1.2, y - 0.2, z + Math.sin(a) * 1.2]
      const tip = add(base, dirAE(a, 1.3), 6.5 + rand() * 1.5)
      g.add(noOutline(rod3(base, tip, 0.2, '#6f9a4a', 5)))
      for (const f of [0.38, 0.7]) {
        const q = lerp3(base, tip, f)
        const yaw = a + (f > 0.5 ? 0 : PI / 2)
        for (const s of [0, PI]) g.add(oval(3.4 - f, f > 0.5 ? '#5cb84f' : '#4aa346', q, dirAE(yaw + s, -0.05), UPV, 0.62, 0.18))
      }
      for (let k = 0; k < 3; k++) g.add(oval(1.9, '#7cc85e', tip, dirAE(a + (k * PI * 2) / 3, 0.9), UPV, 0.6, 0.2))
    }
  } else if (kind === 'mint') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + rand() * 0.4
      const base: V3 = [x + Math.cos(a) * 1.6, y - 0.2, z + Math.sin(a) * 1.6]
      // 朝前的几枝翻过盆沿往下垂
      const trail = Math.sin(a) > 0.55
      const dir = trail ? dirAE(a, -0.35) : dirAE(a, 1.05 + rand() * 0.3)
      const L = trail ? 6 : 4.5 + rand() * 2
      const mid = add(base, dirAE(a, 0.7), trail ? 3 : 0.01)
      const tip = add(mid, dir, L - (trail ? 3 : 0))
      g.add(noOutline(rod3(base, mid, 0.15, '#6b8f4a', 4)))
      g.add(noOutline(rod3(mid, tip, 0.15, '#6b8f4a', 4)))
      for (const f of [0.45, 0.75, 1]) {
        const q = lerp3(mid, tip, f)
        for (const s of [-1, 1]) g.add(oval(f === 1 ? 1.8 : 2.3, i % 2 ? '#6cc06a' : '#58ab5a', q, dirAE(a + s * 1.3, 0.25), UPV, 0.66, 0.14))
      }
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + rand() * 0.4
      const base: V3 = [x + Math.cos(a) * 1.4, y - 0.2, z + Math.sin(a) * 1.4]
      const dir = dirAE(a, 1.35 + rand() * 0.12)
      const L = 8.5 + rand() * 2
      g.add(noOutline(rod3(base, add(base, dir, L), 0.18, '#7a7a50', 4)))
      for (let f = 0.3; f < 1.01; f += 0.12) {
        const q = add(base, dir, L * f)
        for (let k = 0; k < 3; k++) g.add(noOutline(oval(1.7, k % 2 ? '#5d7d5a' : '#6f8f68', q, dirAE((k * PI * 2) / 3 + f * 5, 0.75), UPV, 0.2, 0.2, [5, 2])))
      }
    }
  }
}

// ---------- 香草立体墙：木框分成三行三格，每格的搁板上一只小陶盆（上排迷迭香、中排罗勒、下排薄荷），框底挂一条接水槽 ----------
function herbWall(p: string[]) {
  const [wood, potC, trough] = p
  const g = new THREE.Group()
  const W = 80
  const H = 70
  const zb = -9
  const dark = shade(wood, -0.1)
  // 两侧立柱、顶横梁、背后的横向板条（板条之间露出墙）
  for (const s of [-1, 1]) g.add(rbox(3, H, 5, wood, { x: s * (W / 2 - 1.5), z: zb + 2.5 }, 0.6))
  g.add(rbox(W - 6, 3, 5, wood, { y: H - 3, z: zb + 2.5 }, 0.6))
  for (let k = 0; k < 7; k++) g.add(rbox(W - 6, 6, 1.2, dark, { y: 9 + k * 8.4, z: zb + 0.6 }, 0.3))
  // 三层搁板（前沿一道挡条），两根竖隔条分成三格
  const shelves = [10, 29, 48]
  for (const sy of shelves) {
    g.add(rbox(W - 6, 1.6, 11.5, wood, { y: sy - 1.6, z: zb + 1.2 + 5.75 }, 0.4))
    g.add(rbox(W - 6, 2.6, 1, wood, { y: sy, z: zb + 1.2 + 11 }, 0.3))
  }
  for (const s of [-1, 1]) g.add(rbox(2, H - 13, 1.6, wood, { x: s * 12.5, y: 8.4, z: zb + 2 }, 0.4))
  // 接水槽：两只角码托着一条浅金属槽
  for (const s of [-1, 1]) g.add(rbox(1.2, 3, 9, shade(trough, -0.1), { x: s * (W / 2 - 3.6), y: 0.6, z: zb + 1.2 + 4.5 }, 0.3))
  g.add(tray(W - 8.4, 4.5, 9.5, 0.5, trough, { y: 3.6, z: zb + 1.2 + 4.75 }, 0.2))
  // 盆和香草
  const rand = rng(461)
  const kinds: ('mint' | 'basil' | 'rosemary')[] = ['mint', 'basil', 'rosemary']
  shelves.forEach((sy, row) => {
    for (const x of [-25, 0, 25]) {
      const soil = herbPot(g, x, sy, zb + 1.2 + 5.6, potC)
      miniHerb(g, kinds[row], x, soil, zb + 1.2 + 5.6, rand)
    }
  })
  return fitWall(g, 100, 14.5)
}

// ======================================================================
// 配色
// ======================================================================

/** 白瓷 / 素烧 / 水泥 / 上釉彩色 / 墨色：[盆, 托盘] */
const POT_PALS: Pal[] = [
  ['nordic', [N.white, N.linen]],
  ['retro', [TERRA, shade(TERRA, -0.08)]],
  ['industrial', [I.concrete, shade(I.concrete, -0.1)]],
  ['cute', [C.sky, C.white]],
  ['modern', [M.char, M.light]],
]
/** 上釉鼓肚盆：[盆, 腰线] */
const GLAZE_PALS: Pal[] = [
  ['modern', [M.white, '#c8473a']],
  ['japanese', [J.ai, J.washi]],
  ['nordic', [N.sage, N.white]],
  ['retro', [R.mustard, R.cream]],
  ['cute', [C.sakura, C.white]],
]
/** 高筒盆：[盆, 腰线] */
const TALL_PALS: Pal[] = [
  ['industrial', [I.concrete, I.steel]],
  ['nordic', [N.white, N.oak]],
  ['modern', [M.char, M.silver]],
  ['japanese', [J.sumi, J.shu]],
  ['cute', [C.mint, C.white]],
]
/** 素烧系：[盆, 盆托] */
const TERRA_PALS: Pal[] = [
  ['retro', [TERRA, shade(TERRA, -0.06)]],
  ['nordic', ['#e3c9b0', shade('#e3c9b0', -0.06)]],
  ['industrial', ['#b5654a', I.concrete]],
  ['cute', [C.peach, C.white]],
]
/** 波士顿蕨：[盆, 花架] */
const FERN_PALS: Pal[] = [
  ['nordic', [N.white, N.oak]],
  ['japanese', [J.washi, J.wood]],
  ['modern', [M.white, M.walnut]],
  ['industrial', [I.concrete, I.walnut]],
  ['cute', [C.mint, C.woodL]],
]
/** 鹿角蕨：[木板, 挂绳] */
const STAG_PALS: Pal[] = [
  ['nordic', [N.oak, N.linen]],
  ['industrial', [I.walnut, '#8c8984']],
  ['japanese', [J.dark, J.hinoki]],
  ['farmhouse', [F.white, F.oak]],
]
/** 柠檬树木桶：[桶, 铁箍] */
const BARREL_PALS: Pal[] = [
  ['farmhouse', [F.oak, F.iron]],
  ['retro', [R.caramel, '#5a5a5c']],
  ['nordic', [N.oak, N.gray]],
  ['industrial', [I.walnut, I.steel]],
  ['cute', [C.woodL, C.sky]],
]
/** 网纹草：[盆, 托盘, 叶脉] */
const FITT_PALS: Pal[] = [
  ['nordic', [N.white, N.linen, '#f4f1ea']],
  ['cute', [C.sakura, C.white, '#f58fb0']],
  ['retro', [TERRA, shade(TERRA, -0.08), '#f4f1ea']],
  ['modern', [M.char, M.light, '#f58fb0']],
]
/** 铜钱草：[玻璃, 石子] */
const PENNY_PALS: Pal[] = [
  ['modern', ['#cfeaf5', '#efebe3']],
  ['nordic', ['#dff0e8', '#a8a39a']],
  ['japanese', ['#e6f2f0', '#5a5654']],
  ['cute', ['#d8ecff', C.pink]],
]
/** 风信子：[玻璃, 花色] */
const HYA_PALS: Pal[] = [
  ['nordic', ['#cde8ee', '#8e6bbf']],
  ['cute', ['#f8cfdd', '#f59ac0']],
  ['modern', ['#c6daf0', '#6f8fe0']],
  ['retro', ['#e8b870', '#f4f0e6']],
]
/** 茉莉：[盆, 花架铁丝] */
const JAS_PALS: Pal[] = [
  ['retro', [TERRA, '#4f6b4a']],
  ['nordic', [N.white, N.gray]],
  ['industrial', [I.concrete, I.iron]],
  ['classic', [CL.ivory, CL.gold]],
  ['cute', [C.sakura, C.white]],
]
/** 盆景盆：[盆] */
const BONSAI_PALS: Pal[] = [
  ['japanese', ['#8a4a3a']],
  ['chinese', [CN.celadon]],
  ['japanese', [J.ai]],
  ['modern', ['#efe9dd']],
  ['chinese', [J.sumi]],
]
/** 香草墙：[木框, 陶盆, 接水槽] */
const HERB_PALS: Pal[] = [
  ['nordic', [N.oak, TERRA, N.white]],
  ['farmhouse', [F.white, TERRA, F.iron]],
  ['industrial', [I.walnut, I.concrete, I.steel]],
  ['japanese', [J.hinoki, '#b5654a', J.sumi]],
  ['cute', [C.woodL, C.sakura, C.mint]],
]

const PLANT: Partial<AssetDef> = { type: 'plant', tags: ['hobby:plants'] }
const SMALL: Partial<AssetDef> = { ...PROP, type: 'plant', tags: ['hobby:plants', 'multi-ok', 'potting-bench-ok'] }

export const PLANTS_MORE: AssetDef[] = [
  define('pm-peace-lily', '白掌', 'plants', [33.5, 33.5, 57], POT_PALS, peaceLily, { ...PROP, ...PLANT, mats: ['ceramic', 'ceramic'] }),
  define('pm-anthurium', '红掌', 'plants', [25, 25, 46], GLAZE_PALS, anthurium, { ...PROP, ...PLANT, mats: ['ceramic', 'ceramic'] }),
  define('pm-zz-plant', '金钱树', 'plants', [38.5, 38.5, 77.5], TALL_PALS, zzPlant, { ...PLANT, mats: ['ceramic', 'paint'] }),
  define('pm-boston-fern', '波士顿蕨（高脚花架）', 'plants', [46, 46.5, 88.5], FERN_PALS, bostonFern, { ...PLANT, mats: ['ceramic', 'wood'] }),
  define('pm-staghorn', '鹿角蕨挂板', 'plants', [39.5, 16.5, 58], STAG_PALS, staghorn, { ...PLANT, mount: 140, mats: ['wood', 'fabric'] }),
  define('pm-aloe', '芦荟', 'plants', [20, 20, 28], TERRA_PALS, aloe, { ...SMALL, tags: ['hobby:plants', 'multi-ok', 'potting-bench-ok', 'kitchen-shelf-ok'], mats: ['ceramic', 'ceramic'] }),
  define('pm-clivia', '君子兰', 'plants', [35.5, 18, 48], GLAZE_PALS, clivia, { ...PROP, ...PLANT, mats: ['ceramic', 'ceramic'] }),
  define('pm-lemon-tree', '柠檬树', 'plants', [61, 58.5, 136], BARREL_PALS, lemonTree, { ...PLANT, mats: ['wood', 'metal'] }),
  define('pm-asparagus-fern', '文竹', 'plants', [22, 21.5, 45.5], POT_PALS, asparagusFern, { ...PROP, ...PLANT, mats: ['ceramic', 'ceramic'] }),
  define('pm-fittonia', '网纹草', 'plants', [13.5, 14, 11], FITT_PALS, fittonia, { ...SMALL, mats: ['ceramic', 'ceramic', 'plant'] }),
  define('pm-pennywort', '铜钱草（水培）', 'plants', [20, 19.5, 28], PENNY_PALS, pennywort, { ...PROP, type: 'plant', tags: ['hobby:plants', 'multi-ok'], mats: ['glass', 'stone'] }),
  define('pm-calathea', '孔雀竹芋', 'plants', [39, 39, 48.5], POT_PALS, calathea, { ...PROP, ...PLANT, mats: ['ceramic', 'ceramic'] }),
  define('pm-hyacinth', '风信子（水培）', 'plants', [11, 11.5, 32.5], HYA_PALS, hyacinth, { ...PROP, type: 'plant', tags: ['hobby:plants', 'multi-ok'], mats: ['glass', 'plant'] }),
  define('pm-jasmine-trellis', '茉莉花架', 'plants', [41, 28, 108], JAS_PALS, jasmine, { ...PLANT, mats: ['ceramic', 'metal'] }),
  define('pm-bonsai-maple', '枫树盆景', 'plants', [34.5, 22, 37], BONSAI_PALS, bonsaiMaple, { ...PROP, type: 'plant', tags: ['hobby:plants', 'curio-ok'], mats: ['ceramic'] }),
  define('pm-herb-wall', '香草立体墙', 'plants', [80, 14.5, 70], HERB_PALS, herbWall, { ...PLANT, mount: 100, mats: ['wood', 'ceramic', 'metal'] }),
]
