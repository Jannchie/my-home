// 中式节庆与年节摆设：春联、福字、中国结、红灯笼（壁挂一对 / 落地架）、年桔、鞭炮、红包、攒盒、月饼礼盒、粽子、汤圆、兔子灯、舞狮头、年画。
// 约定见 kit.ts 开头：原点在占地中心底面，正面朝 +z；壁挂件最低点 = mount、背面贴 z = -d/2（fitWall）。
// 字迹一律用横竖笔画示意，不写真字（换语言不用翻译）；会亮的灯笼只用自发光材质，不接灯光系统。

import * as THREE from 'three'
import { ball, cached, cup, cyl, face, plate, rbox, shade, torus } from '../toon'
import { C, paintPanel, rng, shell, type AssetDef } from '../kit'
import { G, P, PI, cylX, cylZ, fitGroup, fitWall, lathe, litOutlined, mesh, noOutline, rod3, soft, strutBox, taperRod3, tube, type V2, type V3 } from '../geo'
import { CN, J, PROP, define, type Pal } from '../packkit'

const WHITE = '#fbf7f1'
const INK = '#221d1c'
const GOLD = '#f2c84b'
const LEAF = '#3f8a4a'
const LEAF_L = '#62ab5a'
const KUMQUAT = '#f59a23'
const BARK = '#7a5a3c'
const SOIL = '#4a3a2e'
const DATE = '#8f2a1f'
/** 粽叶（煮过的箬叶偏橄榄绿）、糯米 */
const ZLEAF = '#6f9440'
const ZLEAF_D = '#5c8136'
const RICE = '#f7f2e3'
/** 月饼的饼皮和压花 */
const CAKE = '#d49a45'
const CAKE_D = '#a8692a'

/** 竖直贴花：朝 +z 的薄片（不描边、不投影），(x, y) 是中心，rot 是面内转角 */
function decal(w: number, h: number, color: string, x: number, y: number, z: number, rot = 0) {
  return plate(w, h, color, { x, y, z, rx: PI / 2, ry: rot })
}

/** 小圆粒（糖果、绒球、花瓣…）：低面数的球，s 是三个方向的缩放；lo = 更省面的 6×4 段 */
function pip(r: number, color: string, x: number, y: number, z: number, s: V3 = [1, 1, 1], lo = false) {
  const geo = lo ? cached('cnf-pip-lo', () => new THREE.SphereGeometry(1, 6, 4)) : cached('cnf-pip', () => new THREE.SphereGeometry(1, 8, 6))
  const m = mesh(geo, color)
  m.position.set(x, y, z)
  m.scale.set(r * s[0], r * s[1], r * s[2])
  return m
}

/** 示意的「字」的几种笔画排法：[中心 x, 中心 y, 宽, 高]，都在 ±0.5 的方格里 */
const GLYPHS: [number, number, number, number][][] = [
  [
    [0, 0.38, 0.9, 0.13],
    [0, 0.02, 0.6, 0.13],
    [0, -0.38, 1, 0.13],
    [0, 0, 0.13, 0.76],
  ],
  [
    [0, 0.38, 0.8, 0.13],
    [0, -0.38, 0.8, 0.13],
    [-0.34, 0, 0.13, 0.76],
    [0.34, 0, 0.13, 0.76],
    [0, 0, 0.56, 0.12],
  ],
  [
    [0, 0.4, 1, 0.13],
    [-0.22, 0.12, 0.13, 0.5],
    [0.22, 0.12, 0.13, 0.5],
    [0, -0.14, 0.7, 0.13],
    [0, -0.42, 0.9, 0.13],
  ],
  [
    [-0.36, 0, 0.14, 0.9],
    [0.14, 0.36, 0.6, 0.13],
    [0.14, 0.02, 0.5, 0.13],
    [0.14, -0.36, 0.66, 0.13],
    [0.14, 0, 0.13, 0.7],
  ],
]
/** 示意的一个「字」：几道横竖笔画拼成方块字的样子（不是真字），占 s × s，中心在 (x, y)，贴在 z 处朝 +z */
function glyph(s: number, color: string, x: number, y: number, z: number, k: number) {
  const g = new THREE.Group()
  for (const [cx, cy, w, h] of GLYPHS[k % GLYPHS.length]) g.add(decal(w * s, h * s, color, cx * s, cy * s, 0))
  return P(g, x, y, z)
}

// ---------- 春联：左右两条红底竖联 + 上方一条横批，纸上是金色的示意字和一圈细边线 ----------

const CP = { w: 110, h: 110, mount: 100, strip: 17, stripH: 92, top: 58, topH: 15, t: 0.6 }
function couplets(p: string[]) {
  const [paper, ink, edge] = p
  const g = new THREE.Group()
  const fz = CP.t / 2 + 0.12
  // 一张红纸：底边在 y，四周往里一圈细边线
  const sheet = (w: number, h: number, x: number, y: number) => {
    g.add(rbox(w, h, CP.t, paper, { x, y }, 0.2))
    const iw = w - 2.4
    const ih = h - 2.4
    for (const s of [-1, 1]) {
      g.add(decal(0.4, ih, edge, x + (s * iw) / 2, y + h / 2, fz))
      g.add(decal(iw + 0.4, 0.4, edge, x, y + h / 2 + (s * ih) / 2, fz))
    }
  }
  for (const s of [-1, 1]) {
    const x = s * (CP.w / 2 - CP.strip / 2)
    sheet(CP.strip, CP.stripH, x, 0)
    // 每联七个字
    for (let i = 0; i < 7; i++) g.add(glyph(10, ink, x, CP.stripH - 9.1 - i * 12.3, fz, i + (s > 0 ? 2 : 0)))
  }
  // 横批四个字
  const ty = CP.h - CP.topH
  sheet(CP.top, CP.topH, 0, ty)
  for (let i = 0; i < 4; i++) g.add(glyph(10, ink, -19.5 + i * 13, ty + CP.topH / 2, fz, i + 1))
  return fitWall(g, CP.mount, 1)
}

// ---------- 福字斗方：一张正方红纸转 45° 贴成菱形，内圈金边和回纹角，中间金圈里一朵八瓣团花（示意，不写字） ----------

const FU = { s: 24, mount: 140, t: 0.6 }
function fuSquare(p: string[]) {
  const [paper, gold, pale] = p
  const g = new THREE.Group()
  const fz = FU.t / 2 + 0.12
  const sq = new THREE.Group()
  sq.add(P(rbox(FU.s, FU.s, FU.t, paper, {}, 0.2), 0, 0, 0))
  const e = FU.s / 2 - 1.6
  for (const s of [-1, 1]) {
    sq.add(decal(0.45, e * 2 + 0.45, gold, s * e, 0, fz))
    sq.add(decal(e * 2 + 0.45, 0.45, gold, 0, s * e, fz))
  }
  // 四角的回纹：贴着内边再折一个小直角
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      sq.add(decal(3.2, 0.45, gold, sx * (e - 3), sy * (e - 1.4), fz))
      sq.add(decal(0.45, 3.2, gold, sx * (e - 1.4), sy * (e - 3), fz))
    }
  sq.rotation.z = PI / 4
  g.add(sq)
  // 中间：压扁的金圈 + 团花（长短两种花瓣交替）+ 花心
  const ring = noOutline(torus(7.4, 0.5, gold, { z: FU.t / 2 }))
  ring.scale.z = 0.5
  g.add(ring)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    const m = pip(i % 2 ? 1.5 : 2.2, i % 2 ? pale : gold, Math.cos(a) * 3.7, Math.sin(a) * 3.7, FU.t / 2 + 0.05, [0.5, 1, 0.12], true)
    m.rotation.z = a - PI / 2
    g.add(noOutline(m))
  }
  g.add(noOutline(pip(1.6, pale, 0, 0, FU.t / 2 + 0.1, [1, 1, 0.2], true)))
  g.add(noOutline(pip(0.8, gold, 0, 0, FU.t / 2 + 0.32, [1, 1, 0.2], true)))
  return fitWall(g, FU.mount, 1)
}

// ---------- 中国结：横竖各四股红绳编成的盘长结（菱形网格，四边带耳翼），上面挂环，下面两束流苏 ----------

const KN = { mount: 110 }
function chineseKnot(p: string[]) {
  const [cord, gold, tasselC] = p
  const g = new THREE.Group()
  const r = 0.85
  const pitch = 3.2
  const half = pitch * 1.5
  const len = half * 2 + 3.2
  const cy = 42
  // 盘长结：两个方向的绳前后错开一点，每边相邻两股在头上弯成一个耳翼，再整体转 45°
  const k = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const o = -half + i * pitch
    k.add(cylX(r, len, cord, 0, o, 0.4, 8))
    k.add(P(cyl(r, r, len, cord, {}, 8), o, 0, -0.4))
  }
  for (const s of [-1, 1])
    for (const j of [0, 2]) {
      const o = -half + (j + 0.5) * pitch
      k.add(P(torus(pitch / 2, r, cord, {}, PI), (s * len) / 2, o, 0.4, 0, 0, (-s * PI) / 2))
      k.add(P(torus(pitch / 2, r, cord, {}, PI), o, (s * len) / 2, -0.4, 0, 0, s > 0 ? 0 : PI))
    }
  k.rotation.z = PI / 4
  k.position.y = cy
  g.add(k)
  // 菱形四个尖角处绳头离中心的距离
  const tip = (len / 2 + half) / Math.SQRT2
  // 左右两个尖角各套一只圆耳
  for (const s of [-1, 1]) g.add(torus(1.3, r, cord, { x: s * (tip + 1.1), y: cy }))
  // 上：金珠、一段绳、挂环、钉子
  g.add(ball(1.25, gold, { y: cy + tip + 0.7 }))
  g.add(cyl(0.5, 0.5, 5, cord, { y: cy + tip + 1.5 }, 8))
  g.add(torus(2, 0.5, cord, { y: cy + tip + 8.2 }))
  g.add(cylZ(0.6, 2.4, gold, 0, cy + tip + 10, -0.9, 8))
  // 下：金珠分出两股，各吊一束流苏（金箍 + 上细下粗的穗子）
  g.add(ball(1.25, gold, { y: cy - tip - 0.7 }))
  for (const s of [-1, 1]) {
    const x = s * 3.2
    g.add(rod3([0, cy - tip - 1.4, 0], [x, cy - tip - 5.2, 0], 0.4, cord, 6))
    g.add(cyl(1.3, 1.3, 2.2, gold, { x, y: cy - tip - 7.2 }, 10))
    g.add(cyl(1.25, 2.1, 26.5, tasselC, { x, y: cy - tip - 33.7 }, 10))
    g.add(noOutline(cyl(1.5, 1.5, 0.7, gold, { x, y: cy - tip - 10 }, 10)))
  }
  return fitWall(g, KN.mount, 4.2)
}

// ---------- 红灯笼（共用）：压扁的球形灯身（自发光）+ 过两极的竖向棱线 + 上下金色口沿 + 底下一颗珠子和一束黄流苏 ----------

/** 一只红灯笼，原点在灯身中心。top：上口沿顶面离中心多高；bottom：流苏底离中心多低 */
function lantern(r: number, body: string, gold: string, tassel: number) {
  const g = new THREE.Group()
  const sy = 0.86
  g.add(litOutlined(ball(r, body, {}, [1, sy, 1]), body, 0.45))
  const ribs = r >= 13 ? 6 : 5
  for (let i = 0; i < ribs; i++) {
    const t = noOutline(torus(r + 0.08, r * 0.03, shade(body, -0.14), {}))
    t.scale.set(1, sy, 1)
    t.rotation.y = (i / ribs) * PI
    g.add(t)
  }
  const capR = r * 0.4
  const capH = r * 0.22
  const top = r * sy * 0.9 + capH
  for (const s of [-1, 1]) g.add(cyl(capR, capR, capH, gold, { y: s > 0 ? top - capH : -top }, 16))
  g.add(ball(r * 0.13, gold, { y: -top - r * 0.1 }))
  g.add(cyl(r * 0.09, r * 0.2, tassel, shade(gold, 0.1), { y: -top - r * 0.2 - tassel }, 10))
  return { g, top, bottom: top + r * 0.2 + tassel }
}

// ---------- 红灯笼一对：墙上两只挑臂托着一根横杆，杆下各吊一只红灯笼 ----------

const LP = { mount: 150, r: 12, gap: 21, out: 13 }
function lanternPair(p: string[]) {
  const [body, gold, wood] = p
  const g = new THREE.Group()
  // 横杆（y = 0，fitWall 会把最低点挪到 mount）：两头各一颗金珠
  g.add(cylX(1.1, 66, wood, 0, 0, 0, 12))
  for (const s of [-1, 1]) g.add(ball(1.7, gold, { x: s * 33.2 }))
  // 两只墙座：贴墙的竖板 + 伸出来托住横杆的挑臂 + 一根斜撑
  for (const s of [-1, 1]) {
    const x = s * 7
    g.add(rbox(3.4, 12, 1.2, wood, { x, y: -9.5, z: -LP.out }, 0.4))
    g.add(rod3([x, 0, -LP.out], [x, 0, 0.6], 1, wood, 8))
    g.add(rod3([x, -8, -LP.out + 0.4], [x, -0.6, -3], 0.7, wood, 8))
  }
  for (const s of [-1, 1]) {
    const x = s * LP.gap
    const l = lantern(LP.r, body, gold, 15)
    g.add(P(l.g, x, -4.1 - l.top, 0))
    // 挂环套在杆上，一小段挂绳吊着灯笼
    g.add(P(torus(1.7, 0.35, gold, {}), x, 0, 0, 0, PI / 2))
    g.add(cyl(0.3, 0.3, 3.2, gold, { x, y: -4.3 }, 6))
  }
  return fitWall(g, LP.mount, 26)
}

// ---------- 落地红灯笼架：工字底座上一根高立柱，柱顶往前挑出一根翘头的挑臂，臂下吊一只大红灯笼 ----------

const LF = { r: 14 }
function lanternFloor(p: string[]) {
  const [body, gold, wood] = p
  const g = new THREE.Group()
  const pz = -15
  const dark = shade(wood, -0.08)
  // 工字底座：后横档（立柱立在它中间）、往前的纵档、前横档，四个端头各垫一只脚
  g.add(rbox(36, 3.6, 5, wood, { y: 1, z: pz }, 1))
  g.add(rbox(5, 3.6, 30, wood, { y: 1, z: 0 }, 1))
  g.add(rbox(22, 3.6, 5, wood, { y: 1, z: 15 }, 1))
  for (const [x, z] of [
    [-15.5, pz],
    [15.5, pz],
    [-8.5, 15],
    [8.5, 15],
  ])
    g.add(rbox(4.4, 1.4, 5.6, dark, { x, z }, 0.5))
  // 立柱 + 左右斜撑 + 往前的斜撑
  g.add(rbox(4, 140, 4, wood, { y: 3, z: pz }, 0.8))
  for (const s of [-1, 1]) g.add(strutBox([s * 12, 4, pz], [s * 1.2, 24, pz], 2.2, 2.2, dark))
  g.add(strutBox([0, 4, pz + 11], [0, 24, pz + 1.2], 2.2, 2.2, dark))
  // 挑臂：从柱顶往前伸，头上翘起一小截顶一颗金珠，底下一根斜撑
  const ay = 137
  g.add(rbox(3.2, 3.2, 21, wood, { y: ay, z: pz + 8 }, 0.7))
  g.add(strutBox([0, ay + 2.2, pz + 17], [0, ay + 6.5, pz + 20.5], 2.6, 2.6, wood))
  g.add(ball(1.5, gold, { y: ay + 7.2, z: pz + 21 }))
  g.add(strutBox([0, ay - 13, pz + 1.5], [0, ay + 0.6, pz + 12], 2, 2, dark))
  // 柱顶的金色宝珠
  g.add(cyl(2.6, 2.6, 1, gold, { y: 142.6, z: pz }, 12))
  g.add(ball(2.2, gold, { y: 145.6, z: pz }))
  // 灯笼吊在挑臂下面（离立柱留出灯身半径）
  const l = lantern(LF.r, body, gold, 30)
  const hz = pz + 17.5
  g.add(cyl(0.35, 0.35, 4.4, gold, { y: ay - 4.2, z: hz }, 6))
  g.add(P(l.g, 0, ay - 4 - l.top, hz))
  return fitGroup(g)
}

// ---------- 年桔盆栽：陶盆 + 短树干 + 下宽上窄的一团树冠，满树小金桔，枝头挂着几只小红包 ----------

interface Blob {
  c: V3
  r: number
  /** 竖向压扁 / 拉长 */
  sy?: number
}
/** 从树冠中心沿方向 d 走，穿出这一团球的最远距离（树冠表面在这个方向上的半径） */
function blobReach(d: V3, blobs: Blob[]) {
  let far = 0
  for (const b of blobs) {
    // 换到这只椭球的单位球空间里解二次方程
    const sy = b.sy ?? 1
    const dy = d[1] / sy
    const cy = b.c[1] / sy
    const A = d[0] * d[0] + dy * dy + d[2] * d[2]
    const B = d[0] * b.c[0] + dy * cy + d[2] * b.c[2]
    const K = b.c[0] * b.c[0] + cy * cy + b.c[2] * b.c[2] - b.r * b.r
    const disc = B * B - A * K
    if (disc >= 0) far = Math.max(far, (B + Math.sqrt(disc)) / A)
  }
  return far
}
/** 树冠：主体 + 往上收的两团 + 四周的几团（坐标相对树冠中心） */
const KQ_BLOBS: Blob[] = [
  { c: [0, 0, 0], r: 21, sy: 1.15 },
  { c: [0, 18, 0], r: 14 },
  { c: [0, 31, 0], r: 8 },
  { c: [13, -4, 4], r: 10.5 },
  { c: [-12, -2, 7], r: 10 },
  { c: [3, 1, -14], r: 10.5 },
  { c: [-9, -8, -11], r: 10 },
  { c: [8, -9, 12], r: 10 },
  { c: [-4, 12, 10], r: 9 },
  { c: [7, 14, -8], r: 9 },
]
const KQ = { cy: 70 }
/** 红包挂在树冠的哪些方向：[绕竖轴的角度（0 = 正面）, 方向的 y 分量] */
const KQ_ENVELOPES: [number, number][] = [
  [0.45, -0.05],
  [1.9, -0.3],
  [3.2, -0.1],
  [4.5, -0.32],
  [5.5, -0.08],
  [2.6, 0.05],
]
function kumquat(p: string[]) {
  const [pot, band, envC] = p
  const g = new THREE.Group()
  // 陶盆：空心，腰上一道箍，里面是土；正面贴一张小斗方
  g.add(cup(15, 11, 24, 1.6, pot))
  g.add(torus(14, 0.7, band, { y: 18, rx: PI / 2 }))
  g.add(noOutline(cyl(13.2, 13.2, 1, SOIL, { y: 20.5 }, 20)))
  const tag = new THREE.Group()
  tag.add(P(rbox(5.4, 5.4, 0.5, envC, {}, 0.15), 0, 0, 0, 0, 0, PI / 4))
  tag.add(noOutline(pip(1.2, band, 0, 0, 0.2, [1, 1, 0.25], true)))
  g.add(P(tag, 0, 9.5, 12.65, 0.165))
  // 树干
  g.add(cyl(1.9, 2.5, 30.5, BARK, { y: 20 }, 10))
  // 树冠
  KQ_BLOBS.forEach((b, i) => g.add(ball(b.r, i % 2 ? shade(LEAF, 0.035) : LEAF, { x: b.c[0], y: KQ.cy + b.c[1], z: b.c[2] }, [1, b.sy ?? 1, 1])))
  const at = (d: V3, off: number): V3 => {
    const t = blobReach(d, KQ_BLOBS) + off
    return [d[0] * t, KQ.cy + d[1] * t, d[2] * t]
  }
  const rand = rng(88)
  // 金桔：按斐波那契球面均匀撒一圈（树冠底下朝着树干的那一小块不放），大半个露在叶面外
  const N = 46
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N
    if (y < -0.82) continue
    const rad = Math.sqrt(1 - y * y)
    const a = i * 2.39996
    const [fx, fy, fz] = at([Math.cos(a) * rad, y, Math.sin(a) * rad], -0.4)
    g.add(pip(2.1, KUMQUAT, fx, fy, fz, [1, 1.15, 1]))
  }
  // 探出来的叶片：浅一号的绿，朝向打乱
  const M = 30
  for (let i = 0; i < M; i++) {
    const y = 1 - (2 * (i + 0.5)) / M
    if (y < -0.8) continue
    const rad = Math.sqrt(1 - y * y)
    const a = i * 2.39996 + 1.2
    const [lx, ly, lz] = at([Math.cos(a) * rad, y, Math.sin(a) * rad], 0.1)
    const m = pip(3.5, LEAF_L, lx, ly, lz, [0.42, 0.16, 1], true)
    m.rotation.set(rand() * 1.4 - 0.7, rand() * PI * 2, rand() * 1.4 - 0.7)
    g.add(m)
  }
  // 小红包：一根金线从叶面垂下来，红包面朝外
  for (const [a, y] of KQ_ENVELOPES) {
    const rad = Math.sqrt(1 - y * y)
    const d: V3 = [Math.sin(a) * rad, y, Math.cos(a) * rad]
    const s = at(d, -0.6)
    const ex = s[0] + Math.sin(a) * 2.2
    const ez = s[2] + Math.cos(a) * 2.2
    const ey = s[1] - 5.6
    g.add(rod3([ex, ey + 2.6, ez], s, 0.15, band, 5))
    const env = new THREE.Group()
    env.add(P(rbox(3.6, 5.4, 0.4, envC, {}, 0.12), 0, 0, 0))
    env.add(noOutline(pip(0.9, band, 0, 0.3, 0.16, [1, 1, 0.25], true)))
    g.add(P(env, ex, ey, ez, 0, a, 0))
  }
  return g
}

// ---------- 鞭炮挂串：顶上挂环和金色菱形牌，一根引线两侧交错斜插着两列红色小鞭炮，最底下吊一只大的 ----------

const FC = { mount: 110, tilt: 0.95 }
function firecrackers(p: string[]) {
  const [red, gold, cordC] = p
  const g = new THREE.Group()
  // 顶上：挂环 + 金色菱形牌（中间嵌一块红心，两面各一颗金点）
  g.add(torus(1.7, 0.4, gold, { y: 77.9 }))
  const tag = new THREE.Group()
  tag.add(P(rbox(8.6, 8.6, 1.2, gold, {}, 0.5), 0, 0, 0))
  tag.add(P(rbox(5.4, 5.4, 1.7, red, {}, 0.4), 0, 0, 0))
  tag.rotation.z = PI / 4
  tag.position.y = 70.2
  g.add(tag)
  for (const s of [-1, 1]) g.add(noOutline(pip(1.1, gold, 0, 70.2, s * 0.8, [1, 1, 0.35], true)))
  // 引线
  g.add(rod3([0, 65, 0], [0, 11.2, 0], 0.4, cordC, 6))
  // 小鞭炮：左右交错，里头朝上贴着引线、外头朝下朝外；前后也错开一点，显得是一把一把编上去的
  for (let i = 0; i < 22; i++) {
    const s = i % 2 ? 1 : -1
    const c = new THREE.Group()
    c.add(P(cyl(1.25, 1.25, 6, red, {}, 10), 0, 0, 0))
    for (const e of [-1, 1]) c.add(noOutline(P(cyl(1.33, 1.33, 0.6, gold, {}, 10), 0, e * 2.6, 0)))
    g.add(P(c, s * 3.2, 61 - i * 2.2, (i % 4 < 2 ? 1 : -1) * 0.7, 0, 0, s * FC.tilt))
  }
  // 最底下的大鞭炮：上下金箍 + 腰上一道金带、带中间一条红线
  g.add(cyl(2.9, 2.9, 11.5, red, {}, 16))
  g.add(noOutline(cyl(3, 3, 1, gold, { y: 0.5 }, 16)))
  g.add(noOutline(cyl(3, 3, 1, gold, { y: 10 }, 16)))
  g.add(noOutline(cyl(3, 3, 3.6, gold, { y: 3.95 }, 16)))
  g.add(noOutline(cyl(3.06, 3.06, 0.5, red, { y: 5.5 }, 16)))
  return fitWall(g, FC.mount, 6.2)
}

// ---------- 红包堆：四只红包摊成扇形（一只压一只），第五只横着压在扇柄上，旁边几枚金币 ----------

const RE = { w: 7.6, l: 11.6, t: 0.3, step: 0.34 }
/** 一只平躺的红包（长边沿 z，封口那头朝 -z），底面在 y = 0：封口盖的深色条 + 底边一道金线 + 金色图案（k 选花样） */
function envelope(red: string, gold: string, k: number) {
  const g = new THREE.Group()
  g.add(rbox(RE.w, RE.t, RE.l, red, {}, 0.12))
  const y = RE.t + 0.06
  g.add(plate(RE.w - 0.5, 2.4, shade(red, -0.09), { y, z: -RE.l / 2 + 1.45 }))
  g.add(plate(RE.w - 1.4, 0.45, gold, { y, z: RE.l / 2 - 1.3 }))
  if (k % 3 === 0) {
    // 铜钱：金圆 + 方孔
    g.add(noOutline(cyl(2, 2, 0.14, gold, { y: RE.t - 0.02, z: 0.6 }, 16)))
    g.add(plate(1.3, 1.3, red, { y: RE.t + 0.18, z: 0.6 }))
  } else if (k % 3 === 1) {
    // 套在一起的三层菱形
    g.add(plate(3.6, 3.6, gold, { y, z: 0.6, ry: PI / 4 }))
    g.add(plate(2.2, 2.2, red, { y: y + 0.06, z: 0.6, ry: PI / 4 }))
    g.add(plate(0.8, 0.8, gold, { y: y + 0.12, z: 0.6, ry: PI / 4 }))
  } else {
    // 三道长短不一的金线 + 一颗金点
    for (let i = 0; i < 3; i++) g.add(plate(3.8 - i * 0.9, 0.45, gold, { y, z: -0.6 + i * 1.1 }))
    g.add(noOutline(cyl(0.7, 0.7, 0.14, gold, { y: RE.t - 0.02, z: 3 }, 10)))
  }
  return g
}
function redEnvelopes(p: string[]) {
  const [red, gold, alt] = p
  const g = new THREE.Group()
  // 扇形：都绕靠近底边的一点转开，从左到右一只比一只高一层
  const fan = [-0.62, -0.17, 0.24, 0.66]
  fan.forEach((a, i) => {
    const e = P(envelope(i % 2 ? alt : red, gold, i), 0, 0, -RE.l / 2 + 1.2)
    g.add(P(G(e), 0, i * RE.step, 3.4, 0, a, 0))
  })
  // 横着压在扇柄上的一只
  g.add(P(envelope(red, gold, 1), 0.8, fan.length * RE.step, 2.3, 0, PI / 2 - 0.22, 0))
  // 金币：一枚在最上面那只红包上，两枚落在桌上（其中一枚搭着另一枚）
  const coin = (x: number, y: number, z: number, rx = 0, rz = 0) => {
    const c = new THREE.Group()
    c.add(cyl(1.5, 1.5, 0.32, gold, {}, 14))
    c.add(noOutline(cyl(1.05, 1.05, 0.4, shade(gold, -0.1), { y: 0.06 }, 12)))
    g.add(P(c, x, y, z, rx, 0, rz))
  }
  coin(-2.2, (fan.length + 1) * RE.step - 0.03, 2.6)
  coin(-6.6, 0, 5)
  coin(-4.8, 0.2, 5.6, 0, 0.16)
  return fitGroup(g)
}

// ---------- 糖果攒盒：八角红漆盒，中间一格、四周八格，各盛一样糖果瓜子；盒盖一边搭在盒沿上斜靠在旁边 ----------

const CB = { R: 8.66, H: 5, t: 0.9 }
/** 八角形的车削体：8 段，起始角错开 22.5° 让一条平边朝正面（转在几何里而不是网格上，包围盒才贴身） */
function octLathe(pts: V2[], color: string) {
  return lathe(pts, color, 8, [PI / 8, PI * 2])
}
/** 八格里各放什么：两三种颜色交替，s 是一粒的缩放 [横, 高, 纵]，r 是粒径 */
const CANDY: { c: string[]; s: V3; r: number }[] = [
  // 瓜子
  { c: ['#2f2a28', '#4a423d'], s: [0.55, 0.3, 1], r: 1 },
  // 红纸、金纸包的糖
  { c: ['#d42a20', GOLD], s: [1.25, 0.8, 0.8], r: 0.8 },
  // 花生
  { c: ['#d9b98a', '#c9a574'], s: [0.7, 0.7, 1.35], r: 0.8 },
  // 金币巧克力
  { c: [GOLD, '#e3b23a'], s: [1, 0.3, 1], r: 1.05 },
  // 开心果
  { c: ['#b9c98a', '#d8cfa8'], s: [0.85, 0.8, 1.1], r: 0.75 },
  // 奶糖
  { c: ['#f7f3ea', '#8fb8e8'], s: [0.7, 0.7, 1.3], r: 0.8 },
  // 蜜饯金桔
  { c: [KUMQUAT, '#f7b34a'], s: [1, 0.9, 1], r: 0.85 },
  // 水果软糖
  { c: ['#ff9db0', '#a6e3cc', '#ffe08f'], s: [0.9, 0.7, 0.9], r: 0.8 },
]
/** 一格里每粒的位置：[离盒心的距离, 横向偏移, 高度] */
const CANDY_SPOTS: V3[] = [
  [3.8, 0, 2.7],
  [5, -0.9, 2.8],
  [5, 0.9, 2.8],
  [6.2, -1.6, 2.6],
  [6.2, 0, 2.8],
  [6.2, 1.6, 2.6],
  [4.4, 0, 3.5],
  [5.6, -0.8, 3.5],
  [5.6, 0.8, 3.5],
]
function candyBox(p: string[]) {
  const [box, gold, inner] = p
  const g = new THREE.Group()
  const { R, H, t } = CB
  // 盒身：空心八角盒，口沿下面一道金线
  g.add(
    octLathe(
      [
        [0, 0],
        [R - 0.5, 0],
        [R, 0.5],
        [R, H - 0.25],
        [R - 0.25, H],
        [R - t + 0.25, H],
        [R - t, H - 0.25],
        [R - t, 0.9],
        [0, 0.9],
      ],
      box,
    ),
  )
  g.add(
    noOutline(
      octLathe(
        [
          [R + 0.06, H - 1.6],
          [R + 0.06, H - 1.1],
        ],
        gold,
      ),
    ),
  )
  // 中间的小圆格 + 八道隔板（从圆格到八个角）
  const rc = 2.7
  g.add(
    lathe(
      [
        [rc, 0.8],
        [rc, H - 0.9],
        [rc - 0.5, H - 0.9],
        [rc - 0.5, 0.8],
      ],
      inner,
      12,
    ),
  )
  for (let k = 0; k < 8; k++) {
    const a = PI / 8 + (k * PI) / 4
    g.add(P(rbox(5.1, H - 1.8, 0.5, inner, {}, 0.12), Math.sin(a) * 5.15, 0.8 + (H - 1.8) / 2, Math.cos(a) * 5.15, 0, a - PI / 2, 0))
  }
  // 八格糖果：每格先垫一团同色的底，再摆几粒看得清形状的
  const rand = rng(21)
  CANDY.forEach((kind, k) => {
    const cell = new THREE.Group()
    cell.add(noOutline(pip(1, shade(kind.c[0], -0.08), 0, 2, 5.05, [1.75, 1.05, 2.2], true)))
    CANDY_SPOTS.forEach(([rho, u, y], i) => {
      const m = pip(kind.r, kind.c[i % kind.c.length], u, y, rho, kind.s, true)
      m.rotation.y = rand() * PI
      cell.add(m)
    })
    cell.rotation.y = (k * PI) / 4
    g.add(cell)
  })
  // 中间一格：红枣
  g.add(noOutline(pip(1, shade(DATE, -0.06), 0, 2, 0, [2.1, 1, 2.1], true)))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = pip(0.85, DATE, Math.cos(a) * 1.15, 2.9, Math.sin(a) * 1.15, [0.8, 0.8, 1.2], true)
    m.rotation.y = rand() * PI
    g.add(m)
  }
  g.add(pip(0.85, shade(DATE, 0.05), 0, 3.6, 0, [1.2, 0.8, 0.8], true))
  // 盒盖：扁扁的八角盖，顶上一圈金线、一朵金花和一颗盖钮；一边搭在盒沿上、另一边落在桌面
  const RL = R + 0.35
  const lid = new THREE.Group()
  lid.add(
    octLathe(
      [
        [0, 1.5],
        [RL - 0.9, 1.25],
        [RL - 0.6, 0],
        [RL, 0],
        [RL, 1.2],
        [RL - 0.5, 1.75],
        [RL - 2.6, 2.1],
        [0, 2.25],
      ],
      box,
    ),
  )
  lid.add(
    noOutline(
      octLathe(
        [
          [RL - 3, 2.02],
          [RL - 3, 2.32],
          [RL - 3.6, 2.32],
          [RL - 3.6, 2.02],
        ],
        gold,
      ),
    ),
  )
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    const m = pip(1.2, gold, Math.sin(a) * 2.5, 2.2, Math.cos(a) * 2.5, [0.5, 0.16, 1], true)
    m.rotation.y = a
    lid.add(noOutline(m))
  }
  lid.add(pip(1.15, gold, 0, 2.6, 0, [1, 0.75, 1]))
  // 盖沿平边到盖心的距离；高的一边刚好搭上盒沿
  const fl = RL * Math.cos(PI / 8)
  const th = Math.asin((H + 0.05) / (fl * 2))
  g.add(P(lid, 7.6 + fl * Math.cos(th), fl * Math.sin(th), 0, 0, 0, -th))
  return fitGroup(g)
}

// ---------- 月饼礼盒：盒盖口朝上垫在最下面，盒身坐在盖子里，金色内托上 2×2 四只花边月饼（顶面压着团花） ----------

const MB = { w: 28, lid: 3, bw: 26.4, bh: 5.6, t: 0.6 }
/** 花边月饼的饼身：十二瓣花边的轮廓竖着挤出，上下带倒角。底面在 y = 0，高 3 */
function mooncakeGeo() {
  return cached('cnf-mooncake', () => {
    const s = new THREE.Shape()
    const n = 36
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2
      const r = 3.95 + 0.3 * Math.cos(a * 12)
      if (i === 0) s.moveTo(r, 0)
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 1 })
    geo.rotateX(-PI / 2)
    geo.translate(0, 0.4, 0)
    return geo
  })
}
/** 一只月饼：饼身 + 顶面的压花（一圈边线、六瓣团花、花心），底面在 y = 0 */
function mooncake() {
  const g = new THREE.Group()
  g.add(mesh(mooncakeGeo(), CAKE))
  g.add(
    noOutline(
      lathe(
        [
          [3.4, 2.9],
          [3.4, 3.18],
          [3, 3.18],
          [3, 2.9],
        ],
        CAKE_D,
        16,
      ),
    ),
  )
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    const m = pip(1.2, CAKE_D, Math.sin(a) * 1.75, 3, Math.cos(a) * 1.75, [0.5, 0.17, 1], true)
    m.rotation.y = a
    g.add(noOutline(m))
  }
  g.add(noOutline(cyl(0.8, 0.8, 0.3, CAKE_D, { y: 2.9 }, 10)))
  return g
}
/** 贴着方盒外壁的一圈薄带：盒子边长 w，带高 h，底边在 y */
function hoop(w: number, h: number, color: string, y: number) {
  const g = new THREE.Group()
  const o = w / 2 + 0.05
  for (const s of [-1, 1]) {
    g.add(noOutline(rbox(w + 0.4, h, 0.3, color, { y, z: s * o }, 0.1)))
    g.add(noOutline(rbox(0.3, h, w + 0.4, color, { x: s * o, y }, 0.1)))
  }
  return g
}
function mooncakeBox(p: string[]) {
  const [box, gold, band] = p
  const g = new THREE.Group()
  const { w, lid, bw, bh, t } = MB
  // 盖子口朝上垫在最下面，盒身坐进盖子里
  g.add(shell(w, lid, w, t, box, { top: false }))
  g.add(P(shell(bw, bh, bw, t, box, { top: false }), 0, t, 0))
  // 盖子侧面一圈金线；盒身露出来的那截围一圈缎带
  g.add(hoop(w, 0.5, gold, 1.25))
  g.add(hoop(bw, 1.3, band, t + bh - 2.1))
  // 金色内托 + 四只月饼，各垫一只深一号的纸托
  const ty = t + 3
  g.add(rbox(bw - t * 2 + 0.2, 0.6, bw - t * 2 + 0.2, gold, { y: ty - 0.6 }, 0.15))
  let k = 0
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 6.1
      const z = sz * 6.1
      g.add(cyl(5, 4.7, 1.3, shade(gold, -0.14), { x, y: ty - 0.05, z }, 14))
      g.add(P(mooncake(), x, ty + 0.1, z, 0, k++ * 0.37, 0))
    }
  return g
}

// ---------- 粽子盘：竹匾里三只绑着细绳的粽子，上面再叠一只，前面一只剥开露出白糯米、粽叶摊在底下 ----------

/** 一面朝下的正四面体的四个面法线 */
const TETRA_N: V3[] = [[0, -1, 0], ...[0, 1, 2].map((k): V3 => [(Math.cos(PI / 2 + (k * PI * 2) / 3) * Math.sqrt(8)) / 3, 1 / 3, (Math.sin(PI / 2 + (k * PI * 2) / 3) * Math.sqrt(8)) / 3])]
/** 圆角四面体在方向 (x, y, z)（单位向量）上的半径，内切球半径为 1：四个面法线的 p 范数软最大，棱和角自然是圆的 */
function tetraR(x: number, y: number, z: number) {
  let s = 0
  for (const [a, b, c] of TETRA_N) {
    const d = x * a + y * b + z * c
    if (d > 0) s += d ** 5
  }
  return s ** -0.2
}
/** 粽子形的软团：内切半径 R，底面在 y = 0，尖朝上 */
function tetraBlob(R: number, color: string) {
  return soft(
    color,
    (x, y, z) => {
      const r = R * tetraR(x, y, z)
      return [x * r, y * r + R, z * r]
    },
    { wrinkle: 0, seg: [16, 10] },
  )
}
/** 粽子表面上（往外浮出一点）沿方向 (x, y, z) 的点 */
function tetraAt(R: number, x: number, y: number, z: number, lift = 0.08): V3 {
  const l = Math.hypot(x, y, z)
  const r = R * tetraR(x / l, y / l, z / l) * 1.02 + lift
  return [(x / l) * r, (y / l) * r + R, (z / l) * r]
}
/** 一只包好的粽子：粽叶团 + 两道细绳（一道水平绕腰，一道竖着兜过顶和底）+ 一个绳结 */
function zongzi(R: number, leafC: string, string: string) {
  const g = new THREE.Group()
  g.add(tetraBlob(R, leafC))
  const n = 18
  const waist: V3[] = []
  const over: V3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    waist.push(tetraAt(R, Math.cos(a), 0.3, Math.sin(a)))
    over.push(tetraAt(R, Math.cos(a) * 0.25, Math.sin(a), Math.cos(a) * 0.97))
  }
  g.add(noOutline(tube(waist, 0.16, string, { closed: true, seg: 30, radial: 4 })))
  g.add(noOutline(tube(over, 0.16, string, { closed: true, seg: 30, radial: 4 })))
  const [kx, ky, kz] = tetraAt(R, 0.25, 0.3, 0.97, 0.2)
  g.add(noOutline(pip(0.4, string, kx, ky, kz, [1, 1, 1], true)))
  return g
}
/** 剥开的一只：白糯米团（嵌两颗红枣）坐在摊开的粽叶上，背面还贴着一片叶子 */
function zongziOpen(R: number) {
  const g = new THREE.Group()
  const Rr = R * 0.93
  const rice = tetraBlob(Rr, RICE)
  rice.rotation.y = PI
  g.add(rice)
  for (const [x, y, z] of [
    [0.5, 0.25, 0.8],
    [-0.75, 0.5, 0.35],
  ]) {
    const [dx, dy, dz] = tetraAt(Rr, x, y, z, -0.15)
    g.add(noOutline(pip(0.55, DATE, dx, dy, dz, [1, 1, 1], true)))
  }
  // 摊在底下的三片叶子
  for (const [yaw, c, i] of [
    [-0.9, ZLEAF, 0],
    [0.1, ZLEAF_D, 1],
    [1, ZLEAF, 2],
  ] as [number, string, number][]) {
    const m = pip(R * 2.7, c, Math.sin(yaw) * R * 1.3, 0.12 + i * 0.06, Math.cos(yaw) * R * 1.3, [0.4, 0.04, 1], true)
    m.rotation.y = yaw
    g.add(m)
  }
  // 贴在背面那一面上的叶子（那一面的法线朝后上方，叶子顺着它斜立）
  const back = pip(R * 1.9, ZLEAF_D, 0, Rr * 1.33 + 0.05, -Rr * 0.943 - 0.16, [0.62, 0.05, 1], true)
  back.rotation.x = -1.23
  g.add(back)
  return g
}
function zongziPlate(p: string[]) {
  const [tray, string, rim] = p
  const g = new THREE.Group()
  // 竹匾：浅浅的圆盘 + 一圈粗边 + 底上经纬两个方向的篾条
  g.add(cup(13, 12.2, 2.4, 0.7, tray))
  g.add(torus(12.75, 0.55, rim, { y: 2.3, rx: PI / 2 }))
  for (let i = -3; i <= 3; i++) {
    const o = i * 3.1
    const len = 2 * Math.sqrt(11.2 ** 2 - o * o)
    g.add(plate(len, 0.5, shade(tray, -0.07), { y: 0.76, z: o }))
    g.add(plate(0.5, len, shade(tray, 0.06), { x: o, y: 0.82 }))
  }
  const R = 1.75
  const y0 = 0.7
  g.add(P(zongzi(R, ZLEAF, string), -4.4, y0, -2.2, 0, 0.4, 0))
  g.add(P(zongzi(R, ZLEAF_D, string), 2.4, y0, -6, 0, 1.9, 0))
  g.add(P(zongzi(R, ZLEAF, string), 5.4, y0, 0.4, 0, 3.3, 0))
  // 叠在三只中间的一只，歪着
  g.add(P(zongzi(R, ZLEAF_D, string), 1, y0 + 3, -2.5, 0.35, 0.9, -0.3))
  g.add(P(zongziOpen(R), -2.6, y0, 6, 0, 0.35, 0))
  return g
}

// ---------- 汤圆碗：带圈足的青花碗（口沿和圈足各一道色带、碗腰一圈花瓣点），甜汤里几颗白汤圆，一只瓷勺搭在碗沿上 ----------

function tangyuan(p: string[]) {
  const [china, blue, soup] = p
  const g = new THREE.Group()
  // 碗：圈足 + 弧形碗壁 + 微微外撇的口沿，车削成空心
  g.add(
    lathe(
      [
        [0, 0.5],
        [2.1, 0.5],
        [2.2, 0],
        [2.7, 0],
        [2.8, 0.9],
        [3.7, 1.4],
        [5.2, 2.6],
        [6.1, 4.2],
        [6.5, 6],
        [6.62, 6.35],
        [6.45, 6.5],
        [6.22, 6.3],
        [5.85, 4.3],
        [4.95, 2.9],
        [3.4, 1.9],
        [0, 1.6],
      ],
      china,
      28,
    ),
  )
  // 口沿下和圈足上的色带（贴着碗壁浮出一点的一圈薄片）
  g.add(
    noOutline(
      lathe(
        [
          [6.34, 5],
          [6.5, 5.75],
        ],
        blue,
        28,
      ),
    ),
  )
  g.add(
    noOutline(
      lathe(
        [
          [2.86, 0.15],
          [2.86, 0.8],
        ],
        blue,
        28,
      ),
    ),
  )
  // 碗腰一圈花瓣点（顺着碗壁的斜度贴）
  for (let i = 0; i < 9; i++) {
    const d = pip(0.85, blue, 0, 3.3, 5.62, [1, 0.75, 0.16], true)
    d.rotation.x = 0.51
    g.add(P(G(noOutline(d)), 0, 0, 0, 0, (i / 9) * PI * 2, 0))
  }
  // 甜汤 + 汤圆（一颗粉的）+ 几粒枸杞
  g.add(noOutline(cyl(6.12, 6.12, 0.3, soup, { y: 5.1 }, 28)))
  const balls: [number, number, string][] = [
    [-3.1, -1.4, WHITE],
    [-0.7, -3.4, WHITE],
    [-2.4, 2.3, '#ffd3dc'],
    [-0.2, 0.3, WHITE],
    [1, 3.5, WHITE],
    [2.9, -2.6, WHITE],
  ]
  for (const [x, z, c] of balls) g.add(ball(1.5, c, { x, y: 5.75, z }))
  for (const [x, z] of [
    [-4.6, 0.8],
    [2.2, -5],
    [-0.8, 5],
  ])
    g.add(noOutline(pip(0.36, '#d8342a', x, 5.42, z, [1, 0.6, 1.4], true)))
  // 瓷勺：勺头浸在汤里（里面盛着一点汤），勺柄搭着碗沿斜着伸出去
  const yaw = -0.25
  const ux = Math.cos(yaw)
  const uz = -Math.sin(yaw)
  const sx = 3.6
  const sz = 0.9
  g.add(ball(1.5, china, { x: sx, y: 5.5, z: sz, ry: yaw }, [1.3, 0.5, 0.9]))
  const fill = pip(1.5, soup, sx, 5.96, sz, [1, 0.22, 0.62])
  fill.rotation.y = yaw
  g.add(noOutline(fill))
  g.add(strutBox([sx + ux * 1.4, 6.1, sz + uz * 1.4], [sx + ux * 5.6, 8.03, sz + uz * 5.6], 0.45, 1.25, china, 0.2))
  g.add(noOutline(pip(0.42, blue, sx + ux * 5, 7.98, sz + uz * 5, [1, 0.3, 1], true)))
  return fitGroup(g)
}

// ---------- 兔子灯：白纸糊的兔子（圆身、圆头、长耳、绒球尾巴）坐在四只小轮的木板车上，头扭向正面，车头斜插一根提杆 ----------

function rabbitLantern(p: string[]) {
  const [paper, red, wood] = p
  const g = new THREE.Group()
  // 纸灯：微微自发光
  const glowing = (m: THREE.Mesh) => litOutlined(m, paper, 0.22)
  // 小车：木板 + 两根轴座 + 四只轮子（带轮毂）
  g.add(rbox(20, 1, 8.4, wood, { x: -1, y: 3.4 }, 0.4))
  for (const x of [-8, 6]) {
    g.add(rbox(1.6, 1.6, 7.6, shade(wood, -0.1), { x, y: 1.9 }, 0.3))
    for (const s of [-1, 1]) {
      g.add(cylZ(2.4, 1.2, red, x, 2.4, s * 4.6, 16))
      g.add(noOutline(cylZ(0.8, 1.5, wood, x, 2.4, s * 4.6, 10)))
    }
  }
  // 身子、头、尾巴、四只小脚
  g.add(glowing(ball(7.2, paper, { x: -1.5, y: 10.4 }, [1.3, 0.86, 0.8])))
  g.add(glowing(ball(5.2, paper, { x: 6.6, y: 15.4 }, [1, 0.95, 0.95])))
  g.add(glowing(ball(1.9, paper, { x: -11.2, y: 12 })))
  for (const x of [-6, 3.2]) for (const s of [-1, 1]) g.add(ball(1.5, paper, { x, y: 5.3, z: s * 2.6 }))
  // 长耳朵：往后倒、往两边分开一点，外侧一片粉色的耳心
  for (const s of [-1, 1]) {
    const ear = new THREE.Group()
    ear.add(glowing(ball(1.6, paper, {}, [0.8, 2.5, 0.45])))
    ear.add(noOutline(pip(1.6, C.pink, 0.1, 0, s * 0.6, [0.48, 1.9, 0.2])))
    g.add(P(ear, 5, 22.2, s * 2, s * 0.15, 0, 0.3))
  }
  // 脸朝右前方（头扭向正面一点）：眼睛、腮红、小鼻子
  const turn = 0.55
  const fx = Math.cos(turn)
  const fz = Math.sin(turn)
  const f = face(6.2, { x: 6.6 + fx * 4.6, y: 15.6, z: fz * 4.6 })
  f.rotation.y = PI / 2 - turn
  g.add(f)
  g.add(noOutline(pip(0.45, C.pink, 6.6 + fx * 5, 14.5, fz * 5, [1, 0.8, 1], true)))
  // 身子两侧各一朵红纸花
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3
      g.add(noOutline(pip(0.95, red, -2.5 + Math.cos(a) * 1.3, 11.4 + Math.sin(a) * 1.3, s * 5.5, [1, 1, 0.3], true)))
    }
    g.add(noOutline(pip(0.7, GOLD, -2.5, 11.4, s * 5.72, [1, 1, 0.4], true)))
  }
  // 提杆：从车头斜着往上，杆头一颗红珠
  g.add(rod3([9, 4.2, 0], [14.2, 22.5, 0], 0.35, wood, 8))
  g.add(ball(0.9, red, { x: 14.3, y: 23, z: 0 }))
  return fitGroup(g)
}

// ---------- 舞狮头摆件：木座上的南狮头——大圆头、鼓出来的大眼睛和白毛眼眶、额头的小镜子、独角、张开的大嘴和白胡须、脑后一圈毛边 ----------

const LION = { wood: CN.rosewood, mouth: '#7a1f1f', tongue: '#ff7f8f', mirror: '#dfe7ec' }
function lionHead(p: string[]) {
  const [main, fur, trim, pom] = p
  const g = new THREE.Group()
  // 木座：两级台 + 短颈
  g.add(rbox(16, 1.6, 13, LION.wood, { z: 0.5 }, 0.5))
  g.add(rbox(13, 0.8, 10, shade(LION.wood, 0.06), { y: 1.5, z: 0.5 }, 0.3))
  g.add(cyl(2.4, 3, 3.6, LION.wood, { y: 2.2, z: -0.5 }, 12))
  // 头
  const hy = 13.6
  const hz = -0.5
  g.add(ball(8.6, main, { y: hy, z: hz }, [1.08, 0.95, 0.98]))
  // 头顶到鼻梁的一道饰带、脑后的一圈毛边
  const stripe = noOutline(torus(8.5, 0.4, trim, { y: hy, z: hz, ry: PI / 2 }))
  stripe.scale.set(0.985, 0.955, 1)
  g.add(stripe)
  const mane = torus(7.7, 1.4, fur, { y: hy, z: hz - 4.9 })
  mane.scale.set(1, 0.9, 1)
  g.add(mane)
  // 狮头是空壳：毛边圈里露出深色的内腔（压扁的深色半球盖住后脑那块红色）
  g.add(noOutline(ball(6.9, LION.mouth, { y: hy, z: hz - 4.9 }, [1, 0.88, 0.62])))
  // 上颚（宽扁的吻部）、嘴里、下颚（往下张开）、舌头
  g.add(ball(5.6, main, { y: 10.8, z: 6.4 }, [1.45, 0.55, 0.85]))
  g.add(noOutline(ball(4.8, LION.mouth, { y: 7.9, z: 6.2 }, [1.35, 0.42, 0.8])))
  g.add(ball(5, main, { y: 5.6, z: 6.4, rx: 0.22 }, [1.3, 0.36, 0.84]))
  g.add(noOutline(pip(1, LION.tongue, 0, 7.2, 9, [2.3, 0.5, 1.7])))
  // 上唇一排白毛、下巴一排胡须
  for (let i = -4; i <= 4; i++) {
    const x = i * 1.7
    g.add(pip(1.05, fur, x, 8.6, 6.4 + 4.76 * Math.sqrt(1 - (x / 8.12) ** 2) * 0.86, [1, 1.1, 1]))
  }
  for (let i = -2; i <= 2; i++) g.add(pip(1.1, fur, i * 1.9, 3.7, 9.4 - Math.abs(i) * 0.5, [1, 1.7, 1]))
  // 鼻头
  g.add(ball(1.9, pom, { y: 12.4, z: 10.8 }, [1.25, 0.9, 0.8]))
  // 眼睛：鼓出来的白眼球 + 黑眼珠和高光 + 一道白毛眼眶
  for (const s of [-1, 1]) {
    g.add(ball(2.9, '#ffffff', { x: s * 4.4, y: 16.6, z: 6 }))
    g.add(noOutline(pip(1.5, INK, s * 4.2, 16.4, 8.45, [1, 1, 0.5])))
    g.add(noOutline(pip(0.45, '#ffffff', s * 4.2 + 0.5, 17, 9.15, [1, 1, 0.5], true)))
    g.add(P(torus(3, 0.8, fur, {}, PI), s * 4.4, 16.9, 6.9, -0.25, 0, s * -0.12))
  }
  // 额头的小镜子（顺着额头的弧度仰着）
  g.add(P(cyl(2.05, 2.05, 0.35, trim, {}, 16), 0, 19.43, 5.26, PI / 2 - 0.82))
  g.add(P(cyl(1.7, 1.7, 0.5, LION.mirror, {}, 16), 0, 19.61, 5.43, PI / 2 - 0.82))
  // 独角 + 两颗绒球
  g.add(taperRod3([0, 20.4, 1.2], [0, 24.4, 0.2], 2, 1, trim, 10))
  g.add(ball(1.15, trim, { y: 24.6, z: 0.15 }))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 3.4, 19.8, 3.2], [s * 4.6, 22.6, 3.8], 0.25, trim, 5))
    g.add(ball(1.35, pom, { x: s * 4.7, y: 23.2, z: 3.9 }))
  }
  // 两只往外支着的耳朵（正面一片白耳心）、两颊的金点
  for (const s of [-1, 1]) {
    g.add(P(ball(2.7, main, {}, [0.85, 1, 0.4]), s * 9.4, 16.8, -1, 0, 0, s * -0.4))
    g.add(noOutline(P(pip(1.7, fur, 0, 0, 0, [0.75, 0.95, 0.3]), s * 9.6, 16.9, -0.2, 0, 0, s * -0.4)))
    g.add(noOutline(pip(1.1, trim, s * 7, 12.4, 4.9, [1, 1, 0.6])))
  }
  return fitGroup(g)
}

// ---------- 年画：上下两根木轴的挂画，画心是「连年有余」——水波、荷叶荷花和一条大红鲤鱼（不写字） ----------

const NH = { mount: 120, pw: 36, ph: 46, bw: 41 }
function nianhuaPaint(ground: string, fish: string) {
  return (c: CanvasRenderingContext2D, W: number, H: number) => {
    const u = W / 100
    c.fillStyle = ground
    c.fillRect(0, 0, W, H)
    // 一粗一细两道边框
    c.strokeStyle = fish
    c.lineWidth = u * 2.2
    c.strokeRect(u * 3.5, u * 3.5, W - u * 7, H - u * 7)
    c.lineWidth = u * 0.7
    c.strokeRect(u * 7, u * 7, W - u * 14, H - u * 14)
    // 水波
    c.strokeStyle = '#8fc0d6'
    c.lineWidth = u * 1.2
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 5; k++) {
        c.beginPath()
        c.arc(u * (16 + k * 17 + (r % 2) * 8.5), H - u * (9 + r * 7), u * 7, PI * 1.15, PI * 1.85)
        c.stroke()
      }
    // 荷叶：缺一个口的圆 + 叶脉
    const pad = (x: number, y: number, r: number) => {
      c.fillStyle = '#4f9e5b'
      c.beginPath()
      c.moveTo(x, y)
      c.arc(x, y, r, -0.35, PI * 2 - 0.95)
      c.closePath()
      c.fill()
      c.strokeStyle = '#3b7d47'
      c.lineWidth = u * 0.6
      for (let k = 0; k < 6; k++) {
        const a = -0.35 + ((PI * 2 - 0.6) * (k + 0.5)) / 6
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82)
        c.stroke()
      }
    }
    pad(u * 25, H - u * 33, u * 15)
    pad(u * 76, H - u * 27, u * 12)
    // 荷花：一根弯茎 + 五片花瓣 + 花心
    const fxp = u * 72
    const fyp = u * 31
    c.strokeStyle = '#4f9e5b'
    c.lineWidth = u * 1.4
    c.beginPath()
    c.moveTo(fxp, fyp)
    c.quadraticCurveTo(u * 88, u * 62, u * 78, H - u * 30)
    c.stroke()
    for (const k of [-2, 2, -1, 1, 0]) {
      c.save()
      c.translate(fxp, fyp)
      c.rotate(k * 0.5)
      c.fillStyle = k % 2 ? '#f6a5b8' : '#fbc4d0'
      c.beginPath()
      c.ellipse(0, -u * 8, u * 3.8, u * 8.5, 0, 0, PI * 2)
      c.fill()
      c.restore()
    }
    c.fillStyle = GOLD
    c.beginPath()
    c.arc(fxp, fyp - u * 1.5, u * 2.4, 0, PI * 2)
    c.fill()
    // 鲤鱼：头朝左上、尾巴甩向右下
    c.save()
    c.translate(W * 0.45, H * 0.52)
    c.rotate(0.6)
    c.fillStyle = shade(fish, -0.1)
    // 背鳍、胸鳍、尾巴
    c.beginPath()
    c.moveTo(-12 * u, -10 * u)
    c.quadraticCurveTo(-1 * u, -24 * u, 11 * u, -8 * u)
    c.fill()
    c.beginPath()
    c.moveTo(-13 * u, 9 * u)
    c.quadraticCurveTo(-9 * u, 21 * u, 0, 11 * u)
    c.fill()
    c.beginPath()
    c.moveTo(14 * u, 0)
    c.quadraticCurveTo(24 * u, -5 * u, 32 * u, -15 * u)
    c.quadraticCurveTo(27 * u, 0, 32 * u, 15 * u)
    c.quadraticCurveTo(24 * u, 5 * u, 14 * u, 0)
    c.fill()
    // 鱼身
    c.fillStyle = fish
    c.beginPath()
    c.moveTo(-28 * u, 0)
    c.bezierCurveTo(-22 * u, -16 * u, 2 * u, -15 * u, 17 * u, -3 * u)
    c.lineTo(17 * u, 3 * u)
    c.bezierCurveTo(2 * u, 15 * u, -22 * u, 14 * u, -28 * u, 0)
    c.fill()
    // 肚皮
    c.fillStyle = 'rgba(255, 255, 255, 0.8)'
    c.beginPath()
    c.ellipse(-7 * u, 6.5 * u, 14 * u, 4 * u, -0.06, 0, PI * 2)
    c.fill()
    // 鳞片（金色的小弧）和鳃线
    c.strokeStyle = GOLD
    c.lineWidth = u * 0.9
    for (let r = -1; r <= 1; r++)
      for (let k = 0; k < 5; k++) {
        c.beginPath()
        c.arc(-10 * u + k * 5.6 * u + (r ? 2.8 * u : 0), r * 4.6 * u - 2 * u, 3.3 * u, -PI * 0.42, PI * 0.42)
        c.stroke()
      }
    c.lineWidth = u * 1.1
    c.beginPath()
    c.arc(-24 * u, 0, 9.5 * u, -0.95, 0.95)
    c.stroke()
    // 眼睛
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.arc(-21 * u, -3.4 * u, 2.7 * u, 0, PI * 2)
    c.fill()
    c.fillStyle = INK
    c.beginPath()
    c.arc(-21.4 * u, -3.4 * u, 1.4 * u, 0, PI * 2)
    c.fill()
    c.restore()
    // 鱼嘴边的一串泡泡
    c.strokeStyle = GOLD
    c.lineWidth = u * 0.9
    for (const [x, y, r] of [
      [17, 30, 3],
      [24, 21, 2.2],
      [15, 19, 1.5],
    ]) {
      c.beginPath()
      c.arc(u * x, u * y, u * r, 0, PI * 2)
      c.stroke()
    }
  }
}
function nianhua(p: string[]) {
  const [silk, ground, fish, wood] = p
  const g = new THREE.Group()
  // 地杆（粗一些）+ 两头的轴头
  g.add(cylX(1, 42.4, wood, 0, 1, 0, 12))
  for (const s of [-1, 1]) g.add(cylX(1.3, 1.9, shade(wood, -0.12), s * 22, 1, 0, 12))
  // 裱边 + 画心上下各一道深色的隔水
  g.add(rbox(NH.bw, 57.6, 0.4, silk, { y: 1.2 }, 0.1))
  for (const y of [5.9, 54.9]) g.add(decal(NH.bw - 0.6, 1.3, shade(silk, -0.14), 0, y, 0.3))
  // 画心
  g.add(paintPanel(NH.pw, NH.ph, `cnf-nianhua|${ground}|${fish}`, nianhuaPaint(ground, fish), { y: 7.4, z: 0.3 }))
  // 天杆 + 挂绳 + 钉子
  g.add(cylX(0.7, 42, wood, 0, 58.9, 0, 10))
  for (const s of [-1, 1]) g.add(rod3([s * 15, 59.3, 0], [0, 64.6, -0.2], 0.18, shade(silk, -0.2), 5))
  g.add(pip(0.7, CN.brass, 0, 64.8, -0.3, [1, 1, 1], true))
  return fitWall(g, NH.mount, 2.6)
}

// ---------- 配色 ----------

const CP_PALS: Pal[] = [
  ['chinese', ['#d42a20', GOLD, '#f6d67a']],
  ['chinese', ['#c23a2b', CN.ink, CN.brass]],
  ['retro', ['#a8261f', '#f4e7c8', '#e0a526']],
  ['cute', ['#ff8f9c', '#fff6dc', C.lemon]],
]
const FU_PALS: Pal[] = [
  ['chinese', ['#d42a20', GOLD, '#fff0b8']],
  ['chinese', ['#c23a2b', CN.brass, CN.ivory]],
  ['retro', ['#a8261f', '#e0a526', '#f4e7c8']],
  ['cute', ['#ff8f9c', C.lemon, C.white]],
]
const KN_PALS: Pal[] = [
  ['chinese', ['#d42a20', GOLD, '#d42a20']],
  ['chinese', ['#b8352b', CN.jade, '#e8b23c']],
  ['retro', ['#c8473a', '#d9a441', '#8f1f24']],
  ['cute', ['#ff7f8f', C.lemon, C.pink]],
]
const LANTERN_PALS: Pal[] = [
  ['chinese', ['#d8291f', GOLD, CN.rosewood]],
  ['chinese', ['#c9402d', '#d9a441', CN.ink]],
  ['japanese', ['#d65a3c', '#e8c46a', J.dark]],
  ['cute', ['#ff8f9c', C.lemon, C.woodL]],
]
const KQ_PALS: Pal[] = [
  ['chinese', [CN.ivory, CN.brass, '#d42a20']],
  ['chinese', ['#34507a', '#f2eadb', '#d42a20']],
  ['retro', ['#b5653f', '#e0a526', '#c8473a']],
  ['cute', [C.pink, C.lemon, '#ff6f7d']],
]
const FC_PALS: Pal[] = [
  ['chinese', ['#d42a20', GOLD, '#8f1f1a']],
  ['chinese', ['#c9402d', '#d9a441', CN.ink]],
  ['retro', ['#a8261f', '#f4e7c8', '#e0a526']],
  ['cute', ['#ff8f9c', C.lemon, '#ff6f7d']],
]
const RE_PALS: Pal[] = [
  ['chinese', ['#d42a20', GOLD, '#b81f1f']],
  ['chinese', ['#c8402d', '#d9a441', '#e8b23c']],
  ['retro', ['#a8261f', '#f4e7c8', '#c8473a']],
  ['cute', ['#ff7f8f', C.lemon, C.pink]],
]
const CB_PALS: Pal[] = [
  ['chinese', [CN.lacquer, GOLD, '#8f2a22']],
  ['chinese', [CN.ink, CN.brass, CN.lacquer]],
  ['japanese', [J.dark, '#e8c46a', J.shu]],
  ['cute', [C.pink, C.lemon, C.white]],
]
const MB_PALS: Pal[] = [
  ['chinese', [CN.lacquer, '#e8c46a', GOLD]],
  ['classic', ['#2f4a6b', '#e8c46a', '#c8473a']],
  ['japanese', [J.sumi, '#d9b45a', J.shu]],
  ['cute', [C.pink, C.cream, C.lemon]],
]
const ZZ_PALS: Pal[] = [
  ['chinese', ['#c9a56a', '#d42a20', '#a8824a']],
  ['japanese', [J.wood, J.washi, J.dark]],
  ['chinese', [CN.celadon, '#e8b23c', CN.ivory]],
  ['cute', [C.woodL, C.pink, C.wood]],
]
const TY_PALS: Pal[] = [
  ['chinese', ['#f6f4ee', '#2f5fa8', '#f3e6c4']],
  ['chinese', ['#f6f1e6', '#c8402d', '#f0dfc0']],
  ['japanese', [CN.celadon, '#5f8f78', '#f3e9cf']],
  ['cute', ['#fff1f4', '#ff8fa8', '#fff3d8']],
]
const RL_PALS: Pal[] = [
  ['chinese', [WHITE, '#d42a20', CN.walnut]],
  ['chinese', ['#fff3d0', '#e8872a', CN.rosewood]],
  ['japanese', [J.washi, J.shu, J.wood]],
  ['cute', ['#fff1f4', C.pink, C.woodL]],
]
const LION_PALS: Pal[] = [
  ['chinese', ['#d42a20', WHITE, GOLD, '#2f8f5a']],
  ['chinese', ['#f2c230', WHITE, '#d42a20', '#2f6fb5']],
  ['chinese', [CN.ink, CN.ivory, '#d42a20', CN.brass]],
  ['cute', [C.pink, C.white, C.lemon, C.mint]],
]
const NH_PALS: Pal[] = [
  ['chinese', [CN.lacquer, '#f8ecd0', '#d8342a', CN.rosewood]],
  ['chinese', [CN.brass, '#fbf3df', '#e2572b', CN.walnut]],
  ['japanese', [J.ai, J.washi, J.shu, J.dark]],
  ['cute', [C.sakura, '#fff8ea', '#ff7f8f', C.woodL]],
]

/** 红纸金字的年节挂饰：红就是它本身的颜色，不派生别的风格配色 */
const FESTIVE: Partial<AssetDef> = { type: 'decor', tags: ['own-colors'] }
/** 节令吃食 */
const TREAT: Partial<AssetDef> = { ...PROP, type: 'food', tags: ['own-colors'] }

export const CN_FESTIVE: AssetDef[] = [
  define('cnf-couplets', '春联', 'deco', [CP.w, 1, CP.h], CP_PALS, couplets, { ...FESTIVE, mount: CP.mount, mats: ['paper', 'paint', 'paint'] }),
  define('cnf-fu', '福字斗方', 'deco', [34, 1, 34], FU_PALS, fuSquare, { ...FESTIVE, mount: FU.mount, mats: ['paper', 'paint', 'paint'] }),
  define('cnf-knot', '中国结', 'deco', [22.5, 4.2, 62], KN_PALS, chineseKnot, { ...FESTIVE, mount: KN.mount, mats: ['fabric', 'metal', 'fabric'] }),
  define('cnf-lantern-pair', '红灯笼一对', 'deco', [70, 26, 48], LANTERN_PALS, lanternPair, { ...FESTIVE, mount: LP.mount, mats: ['paper', 'metal', 'wood'] }),
  define('cnf-lantern-floor', '落地红灯笼架', 'deco', [36, 36, 148], LANTERN_PALS, lanternFloor, { ...FESTIVE, mats: ['paper', 'metal', 'wood'] }),
  define('cnf-kumquat', '年桔盆栽', 'plants', [49, 51, 109], KQ_PALS, kumquat, { type: 'plant', mats: ['ceramic', 'metal', 'paper'] }),
  define('cnf-firecrackers', '鞭炮挂串', 'deco', [13, 6.2, 80], FC_PALS, firecrackers, { ...FESTIVE, mount: FC.mount, mats: ['paper', 'paint', 'fabric'] }),
  define('cnf-red-envelopes', '红包堆', 'tabletop', [18, 14, 2], RE_PALS, redEnvelopes, { ...FESTIVE, ...PROP, mats: ['paper', 'paint', 'paper'] }),
  define('cnf-candy-box', '糖果攒盒', 'tabletop', [32, 17, 6.5], CB_PALS, candyBox, { ...TREAT, mats: ['paint', 'metal', 'paint'] }),
  define('cnf-mooncake-box', '月饼礼盒', 'tabletop', [28, 28, 7], MB_PALS, mooncakeBox, { ...TREAT, mats: ['paper', 'paper', 'fabric'] }),
  define('cnf-zongzi', '粽子盘', 'tabletop', [27, 27, 10], ZZ_PALS, zongziPlate, { ...TREAT, mats: ['wood', 'fabric', 'wood'] }),
  define('cnf-tangyuan', '汤圆碗', 'kitchenware', [16.5, 13.5, 8.5], TY_PALS, tangyuan, { ...TREAT, mats: ['ceramic', 'ceramic'] }),
  define('cnf-rabbit-lantern', '兔子灯', 'deco', [28, 12, 26], RL_PALS, rabbitLantern, { ...PROP, type: 'decor', mats: ['paper', 'paper', 'wood'] }),
  define('cnf-lion-head', '舞狮头摆件', 'deco', [24, 22, 26], LION_PALS, lionHead, { ...PROP, type: 'decor', mats: ['paper', 'pile', 'paint', 'pile'] }),
  define('cnf-nianhua', '年画', 'deco', [46, 2.6, 66], NH_PALS, nianhua, { type: 'decor', mount: NH.mount, mats: ['fabric', 'paper', 'paper', 'wood'] }),
]
