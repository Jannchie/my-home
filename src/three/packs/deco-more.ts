// 小摆设、和风小物、软装：雪花球、八音盒、牛顿摆、帆船模型、瓶中船、套娃、桌面枯山水、水晶球、捕梦网、暖帘、千纸鹤、
// 小芥子、剑玉、刀架、石膏胸像、蒲苇花瓶、抱枕组、叠毯、沙画瓶、地球仪酒柜。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。桌面摆件带 PROP；壁挂件（捕梦网、暖帘、千纸鹤）按离地高度建、背面贴墙（fitWall）。
// type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, box, cached, cup, cyl, face, markMirror, nub, rbox, shade, toon, torus, tray } from '../toon'
import { C, ellipsePoly, type AssetDef } from '../kit'
import { G, P, PI, UP, bakeMeshes, cylX, cylZ, fitGroup, fitWall, ghost, lathe, lit, mesh, noOutline, rod3, soft, taperRod3, tube, type V2, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const BRASS = '#c9a25a'
const GLASS = '#cfe8f5'
const SB_GLASS = '#b9dccb'
const SNOW = '#ffffff'
const PAPER = '#fbf7f1'
const THREAD = '#efe6d2'
const SKIN = '#fde3cf'
const HAIR = '#3a2a2a'
const CORK = '#c9a06a'
const PINE = '#4f9e5b'
const RIG = '#5a4a3e'

// ---------- 共用小件 ----------

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** 车削轮廓在高度 y 处的半径（线性插值，只看 y 递增的那几段） */
function radiusAt(pts: V2[], y: number) {
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1]
    const [r1, y1] = pts[i]
    if (y1 > y0 && y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return pts[pts.length - 1][0]
}

/** 凸多面体的三角面（顶点顺序随意）→ 顶点坐标数组，每个面按形心翻成朝外 */
function convexTris(tris: V3[][]): number[] {
  let cx = 0
  let cy = 0
  let cz = 0
  let n = 0
  for (const t of tris)
    for (const q of t) {
      cx += q[0]
      cy += q[1]
      cz += q[2]
      n++
    }
  cx /= n
  cy /= n
  cz /= n
  const out: number[] = []
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const d = (uy * vz - uz * vy) * (a[0] - cx) + (uz * vx - ux * vz) * (a[1] - cy) + (ux * vy - uy * vx) * (a[2] - cz)
    out.push(...a, ...(d >= 0 ? [...b, ...c] : [...c, ...b]))
  }
  return out
}

/** 顶点坐标数组 → 平直着色的几何（每个三角面自己的法线） */
function facetGeo(pos: number[]) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}

/** 三角片的面：三个顶点 + 厚度 t（沿法线两侧各一半）的薄三棱柱 */
function triSlab(a: V3, b: V3, c: V3, t: number): V3[][] {
  const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize().multiplyScalar(t / 2)
  const up = (q: V3): V3 => [q[0] + n.x, q[1] + n.y, q[2] + n.z]
  const dn = (q: V3): V3 => [q[0] - n.x, q[1] - n.y, q[2] - n.z]
  const out: V3[][] = [
    [up(a), up(b), up(c)],
    [dn(a), dn(b), dn(c)],
  ]
  for (const [s, e] of [
    [a, b],
    [b, c],
    [c, a],
  ])
    out.push([dn(s), dn(e), up(e)], [dn(s), up(e), up(s)])
  return out
}

/** 一片有厚度的三角片（三角帆、小旗） */
const triPlate = (a: V3, b: V3, c: V3, t: number, color: string) => mesh(facetGeo(convexTris(triSlab(a, b, c, t))), color)

/** 朝 +z 的小圆片（眼睛、花瓣、纹样），(x, y, z) 是中心，不描边。都是不到 1cm 的小点：默认 6 段 */
const dot = (r: number, t: number, color: string, x: number, y: number, z: number, seg = 6) => noOutline(cylZ(r, t, color, x, y, z, seg))

/** 沿 dir 方向拉长的椭球（蒲苇穗、羽毛）：center 是中心，r 是粗细半径，len 是全长 */
function ellipsoidAlong(center: V3, dir: THREE.Vector3, r: number, len: number, color: string, flat = 1, seg?: [number, number]) {
  const m = ball(r, color, {}, [1, len / 2 / r, flat], seg)
  m.position.set(...center)
  m.quaternion.setFromUnitVectors(UP, dir.clone().normalize())
  return m
}

// ---------- 帆船（帆船模型和瓶中船共用） ----------

/** 船身俯视的收窄：u = -1 船尾 … +1 船头（船头收成尖的，船尾略收） */
const hullPlan = (u: number) => (u > 0 ? 1 - Math.pow(u, 2.4) * 0.96 : 1 - Math.pow(-u, 3) * 0.35)
/** 甲板高度系数：船头船尾往上翘 */
const deckRise = (u: number) => 1 + 0.28 * u * u

/**
 * 船身：长 L（沿 x，船头朝 +x）、型深 H、宽 W，船底在 y = 0。把一只细分过的盒子捏成船形——
 * 俯视两头收窄、横截面往龙骨收窄、甲板和龙骨在两头翘起。v1 < 1 只做水线以下的那一截，fat 让它比船身略胖一圈（另一种颜色的船底）。
 * seg：盒子沿 长 / 高 / 宽 的细分（瓶中船只有十厘米长，用粗一档的）。
 */
function hullGeo(L: number, H: number, W: number, v1 = 1, fat = 0, seg: V3 = [12, 3, 4]) {
  const geo = new THREE.BoxGeometry(L, H, W, ...seg)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (L / 2)
    const v = (pos.getY(i) / H + 0.5) * v1
    const sec = 0.35 + 0.65 * Math.pow(v, 0.7)
    const keel = 0.5 * Math.pow(Math.max(0, u), 3) + 0.22 * Math.pow(Math.max(0, -u), 3)
    // 船头的上沿往前探一点
    const rake = u > 0 ? v * 0.04 * L * u : 0
    pos.setXYZ(i, (pos.getX(i) + rake) * (1 + fat * 0.15), v * H * deckRise(u) + (1 - v) * H * keel - fat * H, pos.getZ(i) * hullPlan(u) * sec * (1 + fat))
  }
  geo.computeVertexNormals()
  return geo
}

/** 鼓着风的横帆：上宽 wt、下宽 wb、高 h，底边在 y = 0、x 居中，中间往 +z 鼓出 bulge（上下两边不鼓，贴着帆桁）。seg：横 / 竖的细分 */
function sailGeo(wt: number, wb: number, h: number, bulge: number, seg: [number, number] = [6, 4]) {
  const geo = new THREE.BoxGeometry(1, h, Math.max(0.1, bulge * 0.14), seg[0], seg[1], 1)
  geo.translate(0, h / 2, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2
    const v = pos.getY(i) / h
    pos.setX(i, (u * (wb + (wt - wb) * v)) / 2)
    pos.setZ(i, pos.getZ(i) + bulge * (1 - u * u) * Math.pow(Math.max(0, Math.sin(v * PI)), 0.6))
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * 一艘三桅帆船（船底在 y = 0，船头朝 +x）：两色船身、三根桅杆、每根两三面鼓着的横帆（帆桁斜着拉，侧面也看得到帆面）、
 * 船头的斜桅和三角帆、船尾的斜桁帆。tall 是桅杆高度系数（瓶中船要矮一些）；fine 加上支索、小旗、尾楼这些细节。
 */
function sailShip(L: number, tall: number, hullC: string, sailC: string, trim: string, fine: boolean) {
  const s = L / 32
  const H = 5 * s
  const W = 7.4 * s
  const g = new THREE.Group()
  // 小的那艘（瓶中船）船身和帆的细分都降一档
  const hullSeg: V3 = fine ? [12, 3, 4] : [8, 2, 3]
  const sailSeg: [number, number] = fine ? [6, 4] : [4, 3]
  g.add(mesh(hullGeo(L, H, W, 1, 0, hullSeg), hullC))
  g.add(mesh(hullGeo(L, H, W, 0.42, 0.06, hullSeg), trim))
  const spar = shade(hullC, -0.12)
  const mr = Math.max(0.13, 0.3 * s)
  const yr = Math.max(0.1, 0.2 * s)
  const line = fine ? 0.07 : 0.05
  const cloth = Math.max(0.12, 0.2 * s)
  const deck = (x: number) => H * deckRise(x / (L / 2))
  // 三根桅杆：[x, 高, 帆宽系数, 几面横帆]（前桅、主桅、后桅）
  const masts: [number, number, number, number][] = [
    [0.26 * L, 21 * s * tall, 0.9, fine ? 3 : 2],
    [0, 24 * s * tall, 1, fine ? 3 : 2],
    [-0.27 * L, 18 * s * tall, 0.8, 2],
  ]
  // 横帆自下而上：[底边高度占比, 帆高占比, 下宽, 上宽]
  const rows = [
    [0.1, 0.36, 9.5, 8.2],
    [0.5, 0.3, 7.6, 6.2],
    [0.83, 0.15, 5.6, 4.6],
  ]
  for (const [mx, mh, k, n] of masts) {
    const y0 = deck(mx) - 0.4 * s
    g.add(taperRod3([mx, y0, 0], [mx, y0 + mh + 0.5 * s, 0], mr, mr * 0.6, spar, 8))
    for (let i = 0; i < n; i++) {
      const [b, hh, wb, wt] = rows[i]
      const h = mh * hh
      const sg = G(mesh(sailGeo(wt * s * k, wb * s * k, h, 1.5 * s * k, sailSeg), sailC), cylX(yr, wt * s * k + 1.2 * s, spar, 0, h, 0, 6))
      // 帆面本来朝 +z：转到朝船头，再斜拉约 26°。桅杆往上收细：帆桁按它所在高度的桅杆粗细贴上去（原来按桅根的粗细摆，上面几根帆桁离桅杆有一道缝）
      const mastR = mr * (1 - (0.4 * (mh * b + h)) / (mh + 0.5 * s))
      g.add(P(sg, mx + mastR + yr - 0.04, y0 + mh * b, 0, 0, PI / 2 - 0.45))
    }
    // 两侧的支索：桅杆上段拉到船舷
    if (fine) for (const sz of [-1, 1]) g.add(noOutline(rod3([mx, y0 + mh * 0.82, 0], [mx - 1.8 * s, deck(mx) - 0.1, sz * (W / 2) * hullPlan(mx / (L / 2)) * 0.9], line, RIG, 5)))
  }
  // 船首斜桅、前支索和三角帆
  const [fx, fh] = masts[0]
  const fy = deck(fx) - 0.4 * s
  const root: V3 = [0.36 * L, deck(0.36 * L) - 0.3 * s, 0]
  const tip: V3 = [0.68 * L, H * 1.28 + 2.4 * s, 0]
  g.add(taperRod3(root, tip, mr * 0.9, mr * 0.5, spar, 8))
  const stayTop: V3 = [fx, fy + fh * 0.95, 0]
  g.add(noOutline(rod3(stayTop, tip, line, RIG, 5)))
  g.add(triPlate(lerp3(stayTop, tip, 0.14), lerp3(stayTop, tip, 0.94), [fx + 0.11 * L, deck(fx + 0.11 * L) + 1.8 * s, 0], cloth, sailC))
  if (fine) {
    // 里面一道支索和第二面三角帆（往后错开一点，不和外面那面叠在同一个平面上）
    const z = -0.5 * s
    const a: V3 = [fx, fy + fh * 0.64, z]
    const b: V3 = [...lerp3(root, tip, 0.55).slice(0, 2), z] as V3
    g.add(noOutline(rod3(a, b, line, RIG, 5)))
    g.add(triPlate(lerp3(a, b, 0.12), lerp3(a, b, 0.92), [fx + 0.085 * L, deck(fx + 0.085 * L) + 1.3 * s, z], cloth, sailC))
  }
  // 船尾的斜桁帆：后桅后面一面四边形的纵帆，上下各一根桁
  const [zx, zh] = masts[2]
  const zy = deck(zx) - 0.4 * s
  const q1: V3 = [zx - mr, zy + zh * 0.14, 0]
  const q2: V3 = [zx - mr, zy + zh * 0.66, 0]
  const q3: V3 = [zx - 5.6 * s, zy + zh * 0.84, 0]
  const q4: V3 = [zx - 6.8 * s, zy + zh * 0.17, 0]
  g.add(triPlate(q1, q2, q3, cloth, sailC))
  g.add(triPlate(q1, q3, q4, cloth, sailC))
  g.add(rod3(q1, lerp3(q1, q4, 1.06), yr, spar, 6))
  g.add(rod3(q2, lerp3(q2, q3, 1.08), yr, spar, 6))
  if (fine) {
    // 主桅顶的小旗、尾楼
    const [, mh] = masts[1]
    const top = deck(0) - 0.4 * s + mh
    g.add(triPlate([0, top - 1.5 * s, 0], [0, top, 0], [-3.4 * s, top - 0.75 * s, 0], cloth, trim))
    g.add(rbox(4.4 * s, 1.7 * s, W * 0.56, shade(hullC, 0.1), { x: -0.37 * L, y: deck(-0.37 * L) - 0.35 * s }, 0.3 * s))
  }
  return g
}

// ---------- 雪花球：台阶形底座托着一只玻璃球，球里一座红顶小屋、一棵小松树，底下一层雪，空中几点雪花 ----------

function snowGlobe(p: string[]) {
  const [base, roof, band] = p
  const g = new THREE.Group()
  // 底座（车削）和腰上一圈色带
  g.add(
    lathe(
      [
        [0, 0],
        [4.9, 0],
        [5, 0.5],
        [4.8, 1.2],
        [4.3, 1.6],
        [4.1, 3.2],
        [3.75, 4.6],
        [0, 4.6],
      ],
      base,
      20,
    ),
  )
  g.add(noOutline(cyl(4.34, 4.46, 0.9, band, { y: 1.9 }, 20)))
  // 雪地：压扁的雪堆，下半埋在底座里
  g.add(ball(3.45, SNOW, { y: 4.9 }, [1, 0.3, 1], [16, 8]))
  // 小屋：白墙、四坡顶、一扇门
  g.add(rbox(2.2, 1.9, 1.9, '#f6ead8', { x: -0.9, y: 5.6, z: 0.2 }, 0.2))
  g.add(cyl(0.01, 1.9, 1.5, roof, { x: -0.9, y: 7.4, z: 0.2, ry: PI / 4 }, 4))
  g.add(noOutline(rbox(0.6, 1, 0.3, roof, { x: -0.9, y: 5.75, z: 1.2 }, 0.1)))
  // 小松树：树干 + 两层树冠
  g.add(cyl(0.25, 0.3, 0.9, '#8a5a3a', { x: 1.7, y: 5.4, z: -0.3 }, 6))
  g.add(cyl(0.01, 1.3, 1.6, PINE, { x: 1.7, y: 6.1, z: -0.3 }, 8))
  g.add(cyl(0.01, 1, 1.4, PINE, { x: 1.7, y: 7.1, z: -0.3 }, 8))
  // 飘着的雪花
  for (const [x, y, z] of [
    [-2.6, 9.2, 1.2],
    [0.4, 10.9, -1.4],
    [2.4, 9.6, 1.6],
    [-1.2, 11.4, 0.8],
    [1.2, 8.8, 2.6],
    [-2.8, 7.6, -1.8],
  ])
    g.add(noOutline(ball(0.22, SNOW, { x, y, z }, undefined, [4, 2])))
  // 玻璃球：下沿坐进底座的收口里
  g.add(ghost(ball(4.8, GLASS, { y: 8.1 }), GLASS, 0.26))
  return g
}

// ---------- 八音盒：掀开盖子的木盒，盖内一面小镜子，盒里立着一只转圈的小芭蕾舞者，右侧一把发条钥匙 ----------

const MB = { w: 13, d: 9, h: 4.6 }
function musicBox(p: string[]) {
  const [wood, lining, dress] = p
  const g = new THREE.Group()
  // 底下一圈线脚，盒体坐在上面
  g.add(rbox(MB.w + 0.6, 0.9, MB.d + 0.6, shade(wood, -0.1), {}, 0.3))
  g.add(tray(MB.w, MB.h, MB.d, 0.8, wood, { y: 0.5 }))
  const top = 0.5 + MB.h
  // 盒里的绒布台面（机芯藏在下面）和一道隔板
  const fy = 3.8
  g.add(rbox(MB.w - 1.7, 2.6, MB.d - 1.7, lining, { y: 1.2 }, 0.3))
  g.add(rbox(0.5, 1, MB.d - 1.7, wood, { x: 2, y: fy - 0.2 }, 0.2))
  // 隔板右边放着三颗珍珠
  for (const [x, z] of [
    [3.4, 1.2],
    [4.3, 0.4],
    [3.7, -0.6],
  ])
    g.add(ball(0.45, PAPER, { x, y: fy + 0.4, z }))
  // 正面的铜搭扣
  g.add(rbox(1.4, 1.2, 0.5, BRASS, { y: top - 1.3, z: MB.d / 2 + 0.1 }, 0.2))
  // 盖子：绕后上沿的合页掀开，略往后仰；内面一面小镜子
  const lid = new THREE.Group()
  lid.position.set(0, top, -MB.d / 2)
  lid.rotation.x = -0.14
  lid.add(rbox(MB.w, MB.d, 0.9, wood, { z: -0.45 }, 0.3))
  // 镜子的背面嵌进盖板一点（原来悬在盖板内面外 0.05）
  lid.add(markMirror(noOutline(rbox(MB.w - 2.6, MB.d - 2.6, 0.3, '#d8ecf2', { y: 1.3, z: 0.1 }, 0.1))))
  g.add(lid)
  for (const s of [-1, 1]) g.add(cylX(0.32, 1.6, BRASS, s * 3.8, top, -MB.d / 2 - 0.1, 8))
  // 小芭蕾舞者：圆台座、并拢的腿、蓬蓬裙、上身、头和发髻、举过头顶的双臂
  const dx = -2.6
  g.add(cyl(1.5, 1.5, 0.4, BRASS, { x: dx, y: fy }, 16))
  for (const s of [-1, 1]) g.add(cyl(0.2, 0.2, 2.1, SKIN, { x: dx + s * 0.22, y: fy + 0.3 }, 6))
  g.add(cyl(0.5, 2, 0.7, dress, { x: dx, y: fy + 2.2 }, 12))
  g.add(cyl(0.5, 0.42, 1.6, dress, { x: dx, y: fy + 2.8 }, 10))
  g.add(ball(0.8, SKIN, { x: dx, y: fy + 5.1 }))
  g.add(ball(0.42, HAIR, { x: dx, y: fy + 5.9, z: -0.2 }))
  for (const s of [-1, 1]) {
    g.add(rod3([dx + s * 0.45, fy + 4.2, 0], [dx + s * 1.25, fy + 5.3, 0.2], 0.16, SKIN, 6))
    g.add(rod3([dx + s * 1.25, fy + 5.3, 0.2], [dx + s * 0.3, fy + 6.5, 0.1], 0.16, SKIN, 6))
  }
  // 发条钥匙：从右侧板伸出一根轴，末端一只环形的柄
  g.add(cylX(0.3, 1.5, BRASS, MB.w / 2 + 0.65, 2.7, 0.8, 8))
  g.add(torus(0.8, 0.25, BRASS, { x: MB.w / 2 + 2.1, y: 2.7, z: 0.8 }, PI * 2, [6, 10]))
  return fitGroup(g)
}

// ---------- 牛顿摆：底板上两副门形金属架，五颗钢球各用两根细线吊在两根横梁之间，最左边一颗拉了起来 ----------

function newtonCradle(p: string[]) {
  const [base, frame, steel] = p
  const g = new THREE.Group()
  g.add(rbox(18, 1.5, 11, base, {}, 0.5))
  const ry = 15.3
  for (const sz of [-1, 1]) {
    const z = sz * 4.4
    for (const sx of [-1, 1]) {
      g.add(cyl(0.4, 0.4, ry - 1.3, frame, { x: sx * 7.6, y: 1.3, z }, 10))
      g.add(cyl(0.7, 0.8, 0.5, frame, { x: sx * 7.6, y: 1.5, z }, 10))
      g.add(ball(0.5, frame, { x: sx * 7.6, y: ry, z }, undefined, [6, 4]))
    }
    g.add(cylX(0.4, 15.2, frame, 0, ry, z, 10))
  }
  // 五颗球：线长 9.7，最左边一颗摆起约 29°
  const len = 9.7
  for (let i = 0; i < 5; i++) {
    const px = (i - 2) * 2.6
    const a = i === 0 ? 0.5 : 0
    const x = px - Math.sin(a) * len
    const y = ry - Math.cos(a) * len
    g.add(ball(1.3, steel, { x, y }))
    for (const sz of [-1, 1]) g.add(noOutline(rod3([x, y, 0], [px, ry, sz * 4.4], 0.07, '#d8d8d8', 4)))
  }
  return fitGroup(g)
}

// ---------- 帆船模型：木底座的两只支架托着一艘三桅帆船，多片鼓着的白帆、船头三角帆、桅顶小旗，底座正面一块铜铭牌 ----------

function shipModel(p: string[]) {
  const [hull, sailC, trim, stand] = p
  const g = new THREE.Group()
  g.add(rbox(24, 1, 8, stand, {}, 0.4))
  for (const x of [-6.5, 6.5]) g.add(rbox(1.2, 3.8, 5.4, stand, { x, y: 0.8 }, 0.4))
  g.add(noOutline(rbox(5, 0.5, 0.5, BRASS, { y: 0.25, z: 4 }, 0.1)))
  g.add(P(sailShip(32, 1, hull, sailC, trim, true), 0, 3.7, 0))
  return fitGroup(g)
}

// ---------- 瓶中船：横放的玻璃瓶里一小片海和一艘小帆船，瓶口塞着软木塞，底下两只带凹口的木托 ----------

/** 瓶子的车削轮廓（竖着画，瓶底在 y = 0；建好后放倒，瓶口朝 +x） */
const SB_BOTTLE: V2[] = [
  [0, 0],
  [4, 0],
  [4.5, 0.6],
  [4.5, 16.5],
  [4.1, 18.5],
  [2.4, 21],
  [1.6, 22],
  [1.6, 26],
  [1.9, 26.1],
  [1.9, 26.9],
  [1.3, 26.9],
]
function shipBottle(p: string[]) {
  const [wood, hull, sea] = p
  const g = new THREE.Group()
  const cy = 7.5
  const x0 = -13.5
  // 木托：两块横板（两头翘起卡住瓶身）+ 两根连杆。瓶身直径 9，瓶底正好落在横板上；两头翘起的高度让圆角刚好贴着瓶身、不插进玻璃里
  for (const x of [-10.5, 0]) {
    g.add(rbox(1.4, 3, 9, wood, { x }, 0.5))
    for (const s of [-1, 1]) g.add(rbox(1.4, 4.3, 1.6, wood, { x, z: s * 3.7 }, 0.5))
  }
  for (const s of [-1, 1]) g.add(cylX(0.5, 11.6, wood, -5.25, 1.1, s * 3.2, 8))
  // 瓶里的海和小船
  g.add(rbox(14.5, 1.3, 5, sea, { x: -5.4, y: cy - 3.7 }, 0.4))
  g.add(P(sailShip(10.4, 0.62, hull, PAPER, shade(hull, -0.18), false), -6.2, cy - 2.75, 0))
  // 玻璃瓶和软木塞
  // 玻璃带一点绿，瓶口一圈厚一些的唇口，透明的瓶身也能看出轮廓、软木塞不像飘着
  g.add(P(ghost(lathe(SB_BOTTLE, SB_GLASS, 20), SB_GLASS, 0.36), x0, cy, 0, 0, 0, -PI / 2))
  g.add(ghost(cylX(2.05, 0.9, SB_GLASS, x0 + 26.45, cy, 0, 20), SB_GLASS, 0.6))
  g.add(cylX(1.3, 2.4, CORK, x0 + 27.4, cy, 0, 12))
  return fitGroup(g)
}

// ---------- 俄罗斯套娃：五只由大到小排成一排，头巾里露出圆脸，肚子上一块花肚兜 ----------

/** 套娃的车削轮廓（按身高归一：[半径, 高度]） */
const MT_PROFILE: V2[] = [
  [0, 0],
  [0.215, 0],
  [0.255, 0.04],
  [0.28, 0.2],
  [0.27, 0.38],
  [0.215, 0.55],
  [0.185, 0.64],
  [0.2, 0.74],
  [0.195, 0.85],
  [0.14, 0.95],
  [0.06, 0.995],
  [0, 1],
]
const MT_HEIGHTS = [16, 13, 10.4, 8.2, 6.3]
function nestingDoll(h: number, body: string, apron: string, flower: string) {
  const g = new THREE.Group()
  g.add(lathe(MT_PROFILE.map(([r, y]): V2 => [r * h, y * h]), body, h >= 13 ? 18 : 12))
  // 圆脸：一只球从头巾里探出一个圆面
  const fy = 0.775 * h
  const fz = 0.09 * h
  const fr = 0.135 * h
  // 上下 6 段、一圈 12 段：正前方和赤道上都有顶点，贴在脸上的眼睛、腮红不会悬空
  g.add(ball(fr, SKIN, { y: fy, z: fz }, undefined, fr < 1 ? [8, 6] : [12, 6]))
  /** 脸球上 (x, fy + dy) 处的表面 z */
  const onFace = (x: number, dy: number) => fz + Math.sqrt(Math.max(0, fr * fr - x * x - dy * dy))
  const t = 0.2
  // 刘海、眼睛、腮红、小嘴
  g.add(noOutline(ball(0.07 * h, HAIR, { y: fy + 0.09 * h, z: fz + 0.085 * h }, [1.5, 0.6, 0.7], [8, 6])))
  for (const s of [-1, 1]) {
    g.add(dot(0.018 * h, t, HAIR, s * 0.045 * h, fy + 0.012 * h, onFace(0.045 * h, 0.012 * h)))
    g.add(dot(0.024 * h, t, '#ff9db0', s * 0.078 * h, fy - 0.03 * h, onFace(0.078 * h, 0.03 * h)))
  }
  g.add(dot(0.013 * h, t, '#d8483f', 0, fy - 0.048 * h, onFace(0, 0.048 * h)))
  // 下巴底下的头巾结
  g.add(ball(0.035 * h, flower, { y: 0.655 * h, z: 0.19 * h }, undefined, [6, 4]))
  // 花肚兜：鼓出肚子表面的一块椭圆，上面一朵五瓣花
  g.add(ball(0.2 * h, apron, { y: 0.3 * h, z: 0.115 * h }, [0.85, 1.1, 0.9]))
  const az = 0.293 * h
  g.add(dot(0.022 * h, 0.25, '#ffd24a', 0, 0.3 * h, az + 0.05))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + PI / 2
    g.add(dot(0.026 * h, 0.25, flower, Math.cos(a) * 0.046 * h, 0.3 * h + Math.sin(a) * 0.046 * h, az))
  }
  return g
}
function matryoshka(p: string[]) {
  const [body, apron, flower] = p
  const g = new THREE.Group()
  let x = 0
  MT_HEIGHTS.forEach((h, i) => {
    const w = 0.56 * h
    // 隔一只换一次主色和花色，排成一排更热闹
    g.add(P(i % 2 ? nestingDoll(h, flower, apron, body) : nestingDoll(h, body, apron, flower), x + w / 2, 0, 0))
    x += w + 0.9
  })
  return fitGroup(g)
}

// ---------- 桌面枯山水：浅木盘里铺着白沙，左边绕着主石耙出三圈同心纹，右边一排平行纹，三块石头，前面搁着一把小木耙 ----------

function zenGarden(p: string[]) {
  const [wood, sand, stone] = p
  const g = new THREE.Group()
  g.add(tray(30, 3, 20, 1, wood, {}, 0.4))
  const top = 2.2
  g.add(rbox(28.2, top - 0.9, 18.2, sand, { y: 0.9 }, 0.2))
  const ridge = shade(sand, -0.1)
  // 同心纹：绕着主石的三圈
  const sx = -7.5
  const sz = -1.5
  for (const r of [3.6, 4.9, 6.2]) g.add(noOutline(torus(r, 0.26, ridge, { x: sx, y: top, z: sz, rx: PI / 2 }, PI * 2, [6, 24])))
  // 平行纹：右半边的一排沙垄（半埋在沙里）
  for (let k = 0; k < 9; k++) g.add(noOutline(cylX(0.26, 14.4, ridge, 6.4, top, -7.6 + k * 1.4, 6)))
  // 三块石头
  g.add(P(ball(2.7, stone, {}, [1, 0.85, 0.8]), sx, top + 1.2, sz, 0, 0.5, 0.1))
  g.add(P(ball(1.5, shade(stone, 0.08), {}, [1, 0.8, 1.1]), sx + 2, top + 0.6, sz + 1.6, 0, 0.3, 0))
  g.add(P(ball(1.9, shade(stone, -0.06), {}, [1.2, 0.7, 0.9]), 8, top + 0.7, -3.4, 0, -0.4, 0))
  // 小木耙：长柄 + 一排耙齿，平放在前面的沙上
  const rake = new THREE.Group()
  rake.add(cylX(0.3, 11, wood, 5.5, 0.3, 0, 8))
  rake.add(rbox(0.7, 0.6, 3.6, wood, { x: 11.2 }, 0.2))
  for (let k = 0; k < 4; k++) rake.add(nub(0.3, 0.8, 0.3, wood, { x: 11.2, y: -0.6, z: -1.35 + k * 0.9 }))
  g.add(P(rake, -3, top, 6.8, 0, 0.12, 0))
  return g
}

// ---------- 水晶球：车削的雕花底座伸出三只爪托着一只大玻璃球，球心一团雾状的光 ----------

function crystalBall(p: string[]) {
  const [base, tint, glow] = p
  const g = new THREE.Group()
  g.add(
    lathe(
      [
        [0, 0],
        [6.4, 0],
        [6.7, 0.5],
        [6.3, 1.3],
        [4.4, 2],
        [3.1, 3.2],
        [2.9, 4.2],
        [3.6, 5.2],
        [5, 5.9],
        [5.3, 6.6],
        [4.6, 6.9],
        [3.8, 6.3],
        // 托盘中间比球底（y = 5.6）略低：球坐在托盘里，不陷进盘面
        [0, 5.45],
      ],
      base,
      24,
    ),
  )
  g.add(torus(3.25, 0.5, shade(base, 0.12), { y: 3.7, rx: PI / 2 }, PI * 2, [6, 24]))
  const cy = 11.6
  // 三只爪：贴着球面往上弯（各点都在球面外 0.5 左右，爪子不插进玻璃球里），末端一颗小球
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(
      tube(
        [
          [5 * c, 6.4, 5 * s],
          [5.48 * c, 8.2, 5.48 * s],
          [6.25 * c, 9.8, 6.25 * s],
          [6.5 * c, 11.3, 6.5 * s],
        ],
        0.42,
        base,
        { seg: 8, radial: 6 },
      ),
    )
    g.add(ball(0.5, base, { x: 6.5 * c, y: 11.5, z: 6.5 * s }))
  }
  // 球心的雾光：一颗发光的核 + 两团半透明的雾
  g.add(lit(ball(1.5, glow, { y: cy - 0.3 }), glow, 0.8))
  for (const [r, x, y, z, a] of [
    [3.3, 0, cy - 0.4, 0, 0.3],
    [2.2, 1, cy + 1, -0.6, 0.22],
  ]) {
    const m = noOutline(ball(r, glow, { x, y, z }))
    m.material = toon(glow, { emissive: 0.5, transparent: a })
    m.castShadow = false
    g.add(m)
  }
  g.add(ghost(ball(6, tint, { y: cy }), tint, 0.3))
  return g
}

// ---------- 捕梦网：一只缠线的圆环，环里细线编成八角星花，下面垂着三串珠子和羽毛，顶上一只挂环 ----------

function dreamcatcher(p: string[]) {
  const [hoop, feather, bead] = p
  const g = new THREE.Group()
  const r0 = 11
  const cy = 42
  g.add(torus(r0, 0.75, hoop, { y: cy }, PI * 2, [6, 32]))
  g.add(noOutline(torus(1.3, 0.2, THREAD, { y: cy + r0 + 1.7 }, PI * 2, [4, 12])))
  // 网：环上八个点，隔两个 / 隔三个各连一圈，叠成两层星花
  const pt = (i: number): V3 => {
    const a = PI / 8 + (i * PI) / 4
    return [Math.cos(a) * r0, cy + Math.sin(a) * r0, 0]
  }
  for (let i = 0; i < 8; i++) {
    g.add(noOutline(rod3(pt(i), pt(i + 3), 0.11, THREAD, 5)))
    g.add(noOutline(rod3(pt(i), pt(i + 2), 0.11, THREAD, 5)))
  }
  // 网上串着的两颗珠子（落在线的中点上）
  for (const [i, r] of [
    [1, 0.75],
    [5, 0.55],
  ]) {
    const m = lerp3(pt(i), pt(i + 3), 0.5)
    g.add(ball(r, bead, { x: m[0], y: m[1], z: 0.1 }))
  }
  // 三串坠子：细绳、三颗珠子、一根羽毛（羽尖颜色深一些，正面一根羽轴）
  const strand = (x: number, cord: number, len: number, tilt: number) => {
    const y0 = cy - Math.sqrt(r0 * r0 - x * x)
    const y1 = y0 - cord
    g.add(noOutline(rod3([x, y0 + 0.3, 0], [x, y1 - 0.6, 0], 0.13, THREAD, 5)))
    g.add(ball(0.9, bead, { x, y: y0 - cord * 0.45 }))
    g.add(ball(0.65, shade(bead, 0.14), { x, y: y0 - cord * 0.45 - 1.5 }))
    g.add(ball(0.75, hoop, { x, y: y1 + 0.4 }))
    const f = new THREE.Group()
    // 羽毛是很扁的一片：一圈 8 段
    f.add(ball(len / 2, feather, { y: -len / 2 }, [0.34, 1, 0.07], [8, 8]))
    f.add(ball(len * 0.3, shade(feather, -0.2), { y: -len * 0.7 }, [0.4, 1, 0.16], [8, 6]))
    f.add(noOutline(rod3([0, 0, len * 0.02], [0, -len * 0.96, len * 0.035], 0.12, THREAD, 5)))
    g.add(P(f, x, y1, 0, 0, 0, tilt))
  }
  strand(-6.6, 9, 10, -0.08)
  strand(0, 17.5, 12, 0.03)
  strand(6.6, 9, 10, 0.1)
  return fitWall(g, DC_MOUNT, 2)
}
const DC_MOUNT = 140

// ---------- 暖帘：一根横杆穿过一排布环，挂着上端连在一起、下面开两道缝的三幅短布帘，中间一幅上一个圆形纹样，下摆一道色带 ----------

const NR = { w: 90, mount: 150, pw: 27.8 }
function noren(p: string[]) {
  const [cloth, crest, pole] = p
  const g = new THREE.Group()
  const py = 60.2
  g.add(cylX(1.3, NR.w - 1.6, pole, 0, py, 0, 12))
  for (const s of [-1, 1]) g.add(cylX(1.6, 1.2, shade(pole, -0.12), s * (NR.w / 2 - 0.6), py, 0, 12))
  // 布环（乳）：套在杆上
  for (let k = -3; k <= 3; k++) g.add(rbox(4.4, 5.4, 3.4, cloth, { x: k * 12.3, y: 56.6 }, 1.4))
  // 上端连成一片的那一截
  const split = 44.2
  g.add(rbox(84, 57.6 - split + 0.4, 0.5, cloth, { y: split - 0.4 }, 0.2))
  // 三幅帘布：各自从接缝处垂下来，前后略微错开一点
  const sway = [0.02, 0, -0.02]
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.Group()
    pg.position.set((i - 1) * (NR.pw + 0.3), split, 0)
    pg.rotation.x = sway[i]
    pg.add(rbox(NR.pw, split, 0.5, cloth, { y: -split }, 0.2))
    // 下摆的色带（比布略宽略厚，两面都看得到）
    pg.add(noOutline(rbox(NR.pw + 0.2, 4, 0.75, crest, { y: -split + 3 }, 0.2)))
    if (i === 1) {
      // 圆形纹样（丸に点）：色圆、留白的环、中心一点，层层略微凸出，正反两面一样
      pg.add(cylZ(9.2, 1.1, crest, 0, -22, 0, 32))
      pg.add(noOutline(cylZ(6.8, 1.4, cloth, 0, -22, 0, 32)))
      pg.add(noOutline(cylZ(3.3, 1.7, crest, 0, -22, 0, 24)))
    }
    g.add(pg)
  }
  return fitWall(g, NR.mount, 3.4)
}

// ---------- 千纸鹤串：一根横杆吊着六串彩色小纸鹤，每串八九只、颜色轮换，底下各坠一颗珠子 ----------

/** 一只纸鹤（翼展约 4.6，身体中心在原点，头朝 +z）：菱形的身体、两片上扬的翅膀、竖起的颈和尾、折下来的喙 */
function craneGeo() {
  return cached('dm-crane', () => {
    const top: V3 = [0, 0.45, 0]
    const bottom: V3 = [0, -0.75, 0]
    const ring: V3[] = [
      [0, -0.1, 0.9],
      [0.5, -0.05, 0],
      [0, -0.1, -0.9],
      [-0.5, -0.05, 0],
    ]
    const body: V3[][] = []
    for (let i = 0; i < 4; i++) body.push([top, ring[i], ring[(i + 1) % 4]], [bottom, ring[i], ring[(i + 1) % 4]])
    const pos = convexTris(body)
    for (const s of [-1, 1]) pos.push(...convexTris(triSlab([s * 0.2, 0.1, 0.75], [s * 0.2, 0.1, -0.75], [s * 2.3, 1.05, -0.1], 0.14)))
    pos.push(...convexTris(triSlab([0, -0.35, 0.55], [0, 0.3, 0.55], [0, 1.55, 1.7], 0.22)))
    pos.push(...convexTris(triSlab([0, 1.55, 1.7], [0, 1.2, 1.42], [0, 0.95, 2.1], 0.2)))
    pos.push(...convexTris(triSlab([0, -0.35, -0.55], [0, 0.3, -0.55], [0, 1.7, -1.8], 0.22)))
    return facetGeo(pos)
  })
}
const SZ = { mount: 110, bar: 73 }
/** 六串的最低点（长短错落） */
const SZ_ENDS = [8, 2, 6, 0.5, 5, 9]
function senbazuru(p: string[]) {
  const [bar, ...cols] = p
  const g = new THREE.Group()
  g.add(cylX(0.55, 30, bar, 0, SZ.bar, 0, 10))
  for (const s of [-1, 1]) {
    g.add(ball(0.85, bar, { x: s * 15, y: SZ.bar }))
    g.add(noOutline(rod3([s * 11, SZ.bar, 0], [0, SZ.bar + 5, 0], 0.12, THREAD, 5)))
  }
  g.add(noOutline(torus(0.9, 0.18, THREAD, { y: SZ.bar + 5.7 }, PI * 2, [4, 12])))
  SZ_ENDS.forEach((end, i) => {
    const x = -12.5 + i * 5
    g.add(noOutline(rod3([x, SZ.bar, 0], [x, end, 0], 0.07, THREAD, 5)))
    g.add(ball(0.55, cols[i % cols.length], { x, y: end }))
    const n = Math.floor((SZ.bar - 6 - end - 3) / 7.2) + 1
    for (let k = 0; k < n; k++) {
      const m = mesh(craneGeo(), cols[(i + k) % cols.length])
      // 每只转一个不同的角度，整串看起来是活的
      g.add(P(m, x, SZ.bar - 6 - k * 7.2, 0, 0, (((i * 7 + k * 3) % 5) - 2) * 0.32))
    }
  })
  return fitWall(g, SZ.mount, 5)
}

// ---------- 小芥子：圆头圆柱身的木偶一大一小，黑发、小发髻、笑脸，身上几道彩色环纹和一朵花 ----------

const KK_BODY: V2[] = [
  [0, 0],
  [2.5, 0],
  [2.85, 0.35],
  [2.9, 1],
  [2.5, 6],
  [2.25, 10.6],
  [2.45, 11.8],
  [1.7, 12.3],
  [0, 12.3],
]
function kokeshiDoll(wood: string, c1: string, c2: string) {
  const g = new THREE.Group()
  g.add(lathe(KK_BODY, wood, 16))
  // 环纹：上下各两道，贴着身体略微凸出（和身体一样 16 段）
  for (const [y, h, c] of [
    [1.2, 0.9, c1],
    [2.4, 0.45, c2],
    [9.2, 0.45, c2],
    [10, 0.9, c1],
  ] as [number, number, string][])
    g.add(noOutline(cyl(radiusAt(KK_BODY, y + h) + 0.1, radiusAt(KK_BODY, y) + 0.1, h, c, { y }, 16)))
  // 肚子上的花：三片花瓣 + 两片叶
  const fz = radiusAt(KK_BODY, 6) - 0.04
  for (const [x, y, rz, c] of [
    [0, 6.6, 0, c1],
    [-0.75, 5.7, 0.9, c1],
    [0.75, 5.7, -0.9, c1],
    [-0.55, 4.4, -0.7, c2],
    [0.55, 4.4, 0.7, c2],
  ] as [number, number, number, string][]) {
    const m = dot(0.5, 0.3, c, x, y, fz)
    m.scale.set(1, 1, 1.7)
    m.rotation.set(PI / 2, rz, 0)
    g.add(m)
  }
  // 头、盖住头顶和后脑的黑发、发髻和头绳、脸
  g.add(ball(3.5, wood, { y: 15.2 }, [1, 0.94, 1]))
  g.add(ball(3.62, HAIR, { y: 15.9, z: -0.35 }, [1.02, 0.84, 0.985]))
  g.add(ball(0.95, HAIR, { y: 19 }, undefined, [8, 6]))
  g.add(noOutline(torus(0.6, 0.2, c1, { y: 18.6, rx: PI / 2 }, PI * 2, [4, 10])))
  g.add(face(3.4, { y: 15, z: 3.36 }))
  return g
}
function kokeshi(p: string[]) {
  const [wood, c1, c2] = p
  const g = new THREE.Group()
  g.add(P(kokeshiDoll(wood, c1, c2), -3.8, 0, 0))
  const small = P(kokeshiDoll(wood, c2, c1), 4.85, 0, 0.3, 0, -0.2)
  small.scale.setScalar(0.72)
  g.add(small)
  return fitGroup(g)
}

// ---------- 剑玉 + 纸气球：立着的剑玉（十字木柄、两侧的皿、尖上顶着一颗带线的球），旁边一只彩色瓣的纸气球 ----------

/** 剑（柄）：底下的中皿、细腰、往上收成剑尖 */
const KD_KEN: V2[] = [
  [0, 0.5],
  [1.3, 0.45],
  [1.95, 0],
  [2.05, 0.35],
  [1.5, 1.7],
  [1.05, 3.6],
  [1, 5.6],
  [1.25, 7.6],
  [1.3, 9.6],
  [0.75, 10.6],
  [0.5, 12.4],
  [0.25, 13.1],
  [0, 13.1],
]
/** 皿胴（横着的那一截，沿轴画）：一头大皿一头小皿，都是凹口 */
const KD_SARA: V2[] = [
  [0, -3],
  [1.5, -3.3],
  [2.15, -3.6],
  [2.2, -3.2],
  [1.45, -1.7],
  [1.3, 0],
  [1.3, 1.5],
  [1.75, 3],
  [1.8, 3.4],
  [1.25, 3.15],
  [0, 2.9],
]
function kendama(p: string[]) {
  const [wood, tama, ga, gb] = p
  const g = new THREE.Group()
  const kx = -4.6
  g.add(P(lathe(KD_KEN, wood, 12), kx, 0, 0))
  g.add(P(lathe(KD_SARA, wood, 12), kx, 8.6, 0, 0, 0, -PI / 2))
  // 球坐在剑尖上，一根线从皿胴垂下来再绕回球上
  const by = 14.8
  g.add(ball(3, tama, { x: kx, y: by }))
  // 球上的色环和球一样一圈 16 段
  g.add(noOutline(torus(2.75, 0.2, shade(tama, 0.2), { x: kx, y: by + 1.25, rx: PI / 2 }, PI * 2, [4, 16])))
  g.add(
    noOutline(
      tube(
        [
          [kx + 1.1, 8.9, 0.9],
          [kx + 2.8, 5.2, 2.2],
          [kx + 4.6, 8.6, 2.2],
          [kx + 2.1, by - 1.9, 1],
        ],
        0.09,
        THREAD,
        { seg: 14, radial: 5 },
      ),
    ),
  )
  // 纸气球：八片纸瓣（两色和白色相间）拼成略扁的球，上下各一块圆贴纸
  const br = 4.3
  const pts: V2[] = []
  for (let k = 0; k <= 8; k++) {
    const t = 0.22 + (k / 8) * (PI - 0.5)
    pts.push([br * Math.sin(t), -br * Math.cos(t) * 0.88])
  }
  const cyb = br * Math.cos(0.22) * 0.88
  const bx = 5.6
  for (let k = 0; k < 8; k++) g.add(P(lathe(pts, k % 2 ? PAPER : k % 4 ? gb : ga, 3, [(k * PI) / 4, PI / 4]), bx, cyb, 0.3))
  g.add(cyl(1.05, 1.05, 0.2, '#d9dee6', { x: bx, z: 0.3 }, 12))
  g.add(cyl(1.3, 1.3, 0.2, '#d9dee6', { x: bx, y: cyb + br * Math.cos(0.28) * 0.88 - 0.1, z: 0.3 }, 12))
  return fitGroup(g)
}

// ---------- 日本刀架：黑漆木架的两根立柱各伸出两只托钩，上面横架一把打刀、下面一把胁差（带弧度的鞘、镡、柄卷、下绪） ----------

const KT = { len: 100, armLo: 14, armHi: 25, post: 19 }
/** 一把带鞘的刀（沿 x 横放，柄在 -x 一端，刃朝上所以中间略微拱起 sori）：局部 y = 0 是两端的轴线高度 */
function sword(len: number, hilt: number, rr: number, sori: number, saya: string, ito: string, cord: string) {
  const g = new THREE.Group()
  const f = (x: number) => sori * (1 - Math.pow((2 * x) / len, 2))
  const xh = -len / 2 + hilt
  const line = (x0: number, x1: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i): V3 => {
      const x = x0 + ((x1 - x0) * i) / n
      return [x, f(x), 0]
    })
  // 截面是竖着的椭圆：鞘、柄、柄头、缘、下绪的绳圈放在一组里一起压扁
  const flat = new THREE.Group()
  flat.scale.z = 0.66
  flat.add(tube(line(xh + 0.3, len / 2 - rr, 6), rr, saya, { seg: 14, radial: 8 }))
  flat.add(ball(rr, saya, { x: len / 2 - rr, y: f(len / 2 - rr) }, undefined, [8, 6]))
  flat.add(tube(line(-len / 2 + rr, xh - 0.3, 3), rr * 0.9, ito, { seg: 6, radial: 8 }))
  flat.add(ball(rr * 0.98, BRASS, { x: -len / 2 + rr, y: f(-len / 2 + rr) }, undefined, [8, 6]))
  flat.add(cylX(rr * 1.02, 1.2, BRASS, xh - 0.9, f(xh - 0.9), 0, 12))
  const cx = xh + len * 0.1
  flat.add(P(torus(rr + 0.2, 0.34, cord, {}, PI * 2, [6, 12]), cx, f(cx), 0, 0, PI / 2))
  g.add(flat)
  // 下绪的结、镡
  g.add(P(rbox(3, 1, 1, cord, {}, 0.4), cx + 1.3, f(cx) - 0.3, rr * 0.66 + 0.2))
  g.add(cylX(rr * 2.1, 0.5, '#3a3a3c', xh, f(xh), 0, 20))
  // 柄卷：菱形的空隙里露出白鲛皮（正反两面各一排）
  const n = Math.floor((hilt - 4) / 3)
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 3 + i * 3
    for (const s of [-1, 1]) g.add(noOutline(P(box(1.5, 1.5, 0.7, PAPER), x, f(x), s * (rr * 0.9 * 0.66 - 0.04), 0, 0, PI / 4)))
  }
  return g
}
function katanaStand(p: string[]) {
  const [stand, saya, ito, cord] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * KT.post
    // 横脚、立柱、两只托钩（一段横臂 + 上翘的钩头）
    g.add(rbox(4, 2.2, 16, stand, { x }, 0.9))
    g.add(rbox(2.6, 30, 4.2, stand, { x, y: 1.8, z: -3.4 }, 0.8))
    for (const top of [KT.armLo, KT.armHi]) {
      g.add(rbox(2.6, 2.4, 7, stand, { x, y: top - 2.4, z: 1.2 }, 0.8))
      g.add(rbox(2.6, 4.4, 1.8, stand, { x, y: top - 2.4, z: 4 }, 0.7))
    }
  }
  // 两根立柱之间：下面一块嵌板（中间一枚铜纹章）、上面一根横档
  g.add(rbox(38, 7, 1.4, stand, { y: 3.5, z: -3.4 }, 0.5))
  g.add(dot(2.2, 0.5, BRASS, 0, 7, -2.65, 20))
  g.add(rbox(38, 2, 1.4, stand, { y: 28.5, z: -3.4 }, 0.5))
  // 上面打刀、下面胁差：鞘的下沿正好落在托钩上
  const rest = (len: number, sori: number) => sori * (1 - Math.pow((2 * KT.post) / len, 2))
  g.add(P(sword(KT.len, 26, 1.5, 1.8, saya, ito, cord), 0, KT.armHi + 1.5 - rest(KT.len, 1.8), 0.9))
  g.add(P(sword(62, 16, 1.35, 1, saya, ito, cord), 0, KT.armLo + 1.35 - rest(62, 1), 0.9))
  return g
}

// ---------- 石膏胸像：方底座和圆台座上的古典半身像——宽肩、收窄的胸、脖子、椭圆的头，眉弓、鼻梁、嘴唇，满头发卷 ----------

function bust(p: string[]) {
  const [plaster, plinth] = p
  const g = new THREE.Group()
  g.add(rbox(13, 3.2, 13, plinth, {}, 0.5))
  g.add(
    lathe(
      [
        [0, 3],
        [5.6, 3],
        [5.8, 3.5],
        [4.4, 4.4],
        [3.5, 6.2],
        [3.9, 8.2],
        [5, 9.4],
        [0, 9.4],
      ],
      plinth,
      24,
    ),
  )
  // 胸（往下收窄）、肩、脖子
  const chest = cyl(8, 4.6, 6.6, plaster, { y: 9.2 }, 20)
  chest.scale.z = 0.72
  g.add(chest)
  g.add(P(rbox(22, 9.5, 11.5, plaster, {}, 4.2), 0, 19.6, -0.3))
  g.add(cyl(3, 3.7, 7, plaster, { y: 23 }, 16))
  // 头和下颌
  const hc: V3 = [0, 34.2, 0]
  const hr: V3 = [5.5, 6.7, 6.2]
  g.add(ball(6.2, plaster, { y: hc[1] }, [hr[0] / 6.2, hr[1] / 6.2, 1]))
  g.add(ball(4.5, plaster, { y: 30.8, z: 1.4 }, [0.92, 0.9, 0.95]))
  // 眉弓、鼻梁（一只楔形）、嘴唇
  for (const s of [-1, 1]) g.add(ball(1, plaster, { x: s * 1.55, y: 35.3, z: 5.15 }, [1.7, 0.55, 0.8], [8, 6]))
  const nt: V3 = [0, 35.8, 6]
  const nn: V3 = [0, 32.2, 8.3]
  const nl: V3 = [-1.25, 31.8, 5.6]
  const nr: V3 = [1.25, 31.8, 5.6]
  g.add(mesh(facetGeo(convexTris([[nt, nn, nl], [nt, nn, nr], [nn, nl, nr], [nt, nl, nr]])), plaster))
  g.add(rbox(2.8, 0.8, 1.2, plaster, { y: 30, z: 5.5 }, 0.4))
  // 发卷：沿头顶、两鬓和后脑一圈圈排开的小球（脸前面留空）。[极角, 方位角们（0 = 正前方）]
  const deg = PI / 180
  const rings: [number, number[]][] = [
    [0, [0]],
    [0.6, [0, 60, 120, 180, 240, 300]],
    [1.1, [60, 100, 140, 180, 220, 260, 300]],
    [1.6, [100, 140, 180, 220, 260]],
    [2.05, [140, 180, 220]],
  ]
  for (const [polar, azs] of rings)
    for (const az of azs) {
      const d: V3 = [Math.sin(polar) * Math.sin(az * deg), Math.cos(polar), Math.sin(polar) * Math.cos(az * deg)]
      // 二十多颗发卷，一半埋在头里：8 × 6 段
      g.add(ball(1.9, plaster, { x: hc[0] + d[0] * hr[0] * 0.93, y: hc[1] + d[1] * hr[1] * 0.93, z: hc[2] + d[2] * hr[2] * 0.93 }, undefined, [8, 6]))
    }
  return fitGroup(g)
}

// ---------- 大花瓶 + 蒲苇：落地的高陶瓶里插着五支蓬松的蒲苇穗和三根带小芽的干枝，高低错落往四周散开 ----------

const PV_VASE: V2[] = [
  [0, 0],
  [8.5, 0],
  [9.6, 0.8],
  [12.2, 13],
  [12.8, 24],
  [11, 37],
  [7.4, 47],
  [6.4, 51.5],
  [7.4, 54.6],
  [7.1, 55.2],
  [6.3, 54.8],
  [5.4, 51.5],
  [5.8, 46],
  [0, 45],
]
/** 蒲苇：[方位角, 倾角（离竖直）, 秆长, 穗长, 穗粗] */
const PV_PLUMES = [
  [0.3, 0.1, 53, 34, 4.6],
  [1.5, 0.24, 42, 30, 4.2],
  [2.7, 0.18, 47, 32, 4.4],
  [3.9, 0.27, 36, 28, 4],
  [5.1, 0.15, 56, 30, 4.2],
]
/** 干枝：[方位角, 倾角, 长] */
const PV_TWIGS = [
  [0.9, 0.3, 70],
  [3.3, 0.33, 62],
  [4.5, 0.2, 78],
]
function pampasVase(p: string[]) {
  const [vase, plume, twig] = p
  const g = new THREE.Group()
  // 瓶身和腰上的色带同样 24 段
  g.add(lathe(PV_VASE, vase, 24))
  g.add(noOutline(cyl(radiusAt(PV_VASE, 31) + 0.12, radiusAt(PV_VASE, 28) + 0.12, 3, shade(vase, -0.12), { y: 28 }, 24)))
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const add = (a: THREE.Vector3, d: THREE.Vector3, k: number): V3 => [a.x + d.x * k, a.y + d.y * k, a.z + d.z * k]
  for (const [az, lean, stem, len, r] of PV_PLUMES) {
    const out = v(Math.cos(az), 0, Math.sin(az))
    const dir = v(Math.sin(lean) * out.x, Math.cos(lean), Math.sin(lean) * out.z)
    const side = v(-out.z, 0, out.x)
    // 秆根插进瓶口里的内底（内底在 r = 1.8 处高约 45.3）；原来从 46 起，整束悬在瓶口里
    const s0 = v(out.x * 1.8, 45, out.z * 1.8)
    const end = v(...add(s0, dir, stem))
    g.add(rod3([s0.x, s0.y, s0.z], add(end, dir, len * 0.3), 0.38, shade(plume, -0.22), 5))
    // 穗：沿一条往外垂的弧排开一串蓬松的绒团，中下段最粗、往梢上收细，左右交错，轮廓毛茸茸的
    const at = (t: number) => v(...add(end, dir, len * t)).addScaledVector(out, len * 0.22 * t * t)
    const n = 9
    for (let k = 0; k < n; k++) {
      const t = 0.03 + (k / (n - 1)) * 0.9
      const tan = at(t + 0.02).sub(at(t - 0.02))
      const rr = r * (0.42 + 0.62 * Math.sin(PI * Math.pow(t, 0.75)))
      const c = at(t).addScaledVector(side, (k % 2 ? 1 : -1) * r * 0.22)
      // 四十五团互相叠着（两头都埋在相邻的绒团里）：每团 10 × 6 段
      g.add(ellipsoidAlong([c.x, c.y, c.z], tan, rr, rr * 2.6, k % 2 ? plume : shade(plume, -0.05), 1, [10, 6]))
    }
  }
  for (const [az, lean, len] of PV_TWIGS) {
    const out = v(Math.cos(az), 0, Math.sin(az))
    const dir = v(Math.sin(lean) * out.x, Math.cos(lean), Math.sin(lean) * out.z)
    const side = v(-out.z, 0, out.x)
    const s0 = v(out.x * 2.6, 45, out.z * 2.6)
    g.add(taperRod3([s0.x, s0.y, s0.z], add(s0, dir, len), 0.5, 0.22, twig, 5))
    g.add(ball(0.75, shade(twig, 0.22), { x: s0.x + dir.x * len, y: s0.y + dir.y * len, z: s0.z + dir.z * len }, undefined, [6, 4]))
    // 三根岔枝，左右交替，梢上各一颗小芽
    ;[0.5, 0.68, 0.84].forEach((t, k) => {
      const a = v(...add(s0, dir, len * t))
      const d = dir.clone().multiplyScalar(0.75).addScaledVector(side, k % 2 ? 0.55 : -0.55).addScaledVector(out, 0.2)
      const b = add(a, d, len * 0.2)
      g.add(taperRod3([a.x, a.y, a.z], b, 0.3, 0.16, twig, 5))
      g.add(ball(0.7, shade(twig, 0.22), { x: b[0], y: b[1], z: b[2] }, undefined, [6, 4]))
    })
  }
  return fitGroup(g)
}

// ---------- 抱枕组：一只方枕平放（四角带穗），上面斜搭一只条纹腰枕，旁边一只圆枕（中间一颗扣）斜靠在枕堆上 ----------

const sp = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e)
/** 方枕平面的圆角程度（指数越小越方）和厚度方向的鼓度 */
const CU_E = 0.55
const CU_PUFF = 0.8
/** 抱枕：平面是圆角方形（round 为圆形），中间鼓、四边收成一道缝；中心在原点，厚度沿 y */
function pillow(w: number, d: number, h: number, color: string, round = false) {
  const e = round ? 1 : CU_E
  return soft(color, (x, y, z) => [(w / 2) * sp(x, e), (h / 2) * sp(y, CU_PUFF), (d / 2) * sp(z, e)], { wrinkle: 0, seg: [24, 14] })
}
/** 方枕上绕一圈的条纹：在 x = x0 处照着枕头的截面放大一点点的一条带子（两头收进枕头里），露出来的宽度约 bw × 0.7 */
function pillowBand(w: number, d: number, h: number, x0: number, bw: number, color: string) {
  return soft(
    color,
    (x, y, z) => {
      const X = x0 + (bw / 2) * x
      const c = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs((2 * X) / w), 2 / CU_E)))
      const cap = Math.sqrt(Math.max(0, 1 - Math.pow(x, 8)))
      const k = Math.hypot(y, z) || 1
      return [X, (h / 2) * Math.pow(c, CU_PUFF) * sp(y / k, CU_PUFF) * 1.06 * cap, (d / 2) * Math.pow(c, CU_E) * sp(z / k, CU_E) * 1.03 * cap]
    },
    { wrinkle: 0, seg: [16, 8] },
  )
}
function cushions(p: string[]) {
  const [ca, cb, cc, acc] = p
  const g = new THREE.Group()
  // 方枕：平放，四角各一只垂到地上的穗
  const sq = G(pillow(40, 40, 11, ca))
  const k = 20 * Math.pow(Math.SQRT1_2, CU_E)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      sq.add(ball(0.9, cc, { x: sx * k, z: sz * k }))
      sq.add(taperRod3([sx * k, 0, sz * k], [sx * (k + 2), -4.2, sz * (k + 2)], 0.45, 1, cc, 8))
    }
  g.add(P(sq, -7, 5.5, -1, 0, 0.18, 0))
  // 腰枕：斜搭在方枕上，四道条纹
  const lum = G(pillow(44, 23, 10, cb))
  for (const x of [-15, -5, 5, 15]) lum.add(pillowBand(44, 23, 10, x, 4.2, acc))
  g.add(P(lum, -5, 14.2, 1, 0.06, -0.4, 0.05))
  // 圆枕：斜靠在枕堆右边，两面中间各一颗扣
  const rnd = G(pillow(32, 32, 10, cc, true))
  for (const s of [-1, 1]) rnd.add(ball(1.3, acc, { y: s * 4.6 }, [1, 0.5, 1]))
  g.add(P(rnd, 19.5, 14.7, 2, 0, 0, -1.1))
  return fitGroup(g)
}

// ---------- 叠好的毯子：两条对折再对折的针织毯摞在一起，前面是圆滚滚的折边，上面一条有棱纹，两侧露出流苏 ----------

/** 竖直面（y-z 平面）里的一段圆弧，从正上方往 +z 绕下去（裹住折边的棱纹） */
function foldArc(r: number, tubeR: number, color: string, x: number, y: number, z: number, arc: number) {
  // 管截面 6 段，和毯面上的直棱一样
  const m = torus(r, tubeR, color, {}, arc, [6, 8])
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)))
  m.position.set(x, y, z)
  return m
}
/** 一条叠好的毯子：n 层（每层厚 t），前面（+z）是折边，底面在 y = 0；ribs 加棱纹 */
function foldedThrow(w: number, d: number, n: number, t: number, color: string, fringe: string, ribs: boolean) {
  const g = new THREE.Group()
  const pitch = t * 0.94
  const H = (n - 1) * pitch + t
  const rf = H / 2
  for (let k = 0; k < n; k++) g.add(rbox(w, t, d - rf, color, { y: k * pitch, z: -rf / 2 }, t * 0.48))
  g.add(rbox(w - 0.2, H, rf * 2, color, { z: d / 2 - rf }, rf))
  if (ribs) {
    const rib = shade(color, -0.07)
    for (let x = -w / 2 + 1.7; x < w / 2 - 1; x += 2.6) {
      g.add(noOutline(cylZ(0.42, d - rf - 0.8, rib, x, H - 0.05, (0.8 - rf) / 2, 6)))
      g.add(noOutline(foldArc(rf - 0.05, 0.42, rib, x, rf, d / 2 - rf, PI * 0.8)))
    }
  }
  // 流苏：最上面一层的两侧各一排，往外往下垂
  const fy = (n - 1) * pitch + t / 2
  let i = 0
  for (let z = -d / 2 + 1.6; z < d / 2 - rf - 0.6; z += 2.2, i++)
    for (const s of [-1, 1]) g.add(noOutline(taperRod3([s * (w / 2 - 0.4), fy, z], [s * (w / 2 + 2.3), fy - 1.7, z + (i % 2 ? 0.35 : -0.35)], 0.32, 0.2, fringe, 5)))
  return g
}
function throwBlanket(p: string[]) {
  const [top, bottom, fringe] = p
  const g = new THREE.Group()
  g.add(foldedThrow(40, 32, 3, 2.7, bottom, fringe, false))
  // 上面一条略微转开、压进下面一条里一点：连棱纹不超过 15 高，转开后不超出下面那条的进深
  g.add(P(foldedThrow(36, 28, 3, 2.6, top, fringe, true), 0.6, 7.15, 0.3, 0, 0.08, 0))
  return fitGroup(g)
}

// ---------- 沙画瓶 + 贝壳盘：软木塞的圆肚玻璃瓶里一层层歪歪斜斜的彩沙，旁边一只小瓷碟盛着海星、扇贝和小海螺 ----------

const SA_BOTTLE: V2[] = [
  [0, 0],
  [3.5, 0],
  [4, 0.5],
  [4.2, 4.5],
  [3.9, 7.5],
  [2.6, 9.8],
  [1.5, 11],
  [1.5, 12.8],
  [1.85, 13],
  [1.85, 13.7],
  [1.3, 13.7],
]
/** 沙层的分界面：[中间高度, 倾斜幅度, 倾斜朝向]（最下面一层是平的瓶底） */
const SA_LEVELS = [
  [0.35, 0, 0],
  [2.1, 0.5, 0.4],
  [3.5, 0.7, 2.6],
  [5, 0.45, 4.4],
  [6.3, 0.75, 1.3],
  [7.9, 0.5, 3.4],
  [9.2, 0.25, 5.2],
]
/** 瓶里的一层沙：贴着瓶壁内侧的一圈，上下两个面各自歪着（lo / hi 给出方位角 a 处的高度） */
function sandLayer(lo: (a: number) => number, hi: (a: number) => number, color: string) {
  const N = 20
  const rad = (y: number) => Math.max(0.2, radiusAt(SA_BOTTLE, y) - 0.28)
  const pos: number[] = []
  const idx: number[] = []
  // 侧面：每个方位三圈点（下沿、中间、上沿），跟着瓶身的弧度
  for (let i = 0; i < N; i++) {
    const a = (i / N) * PI * 2
    const y0 = lo(a)
    const y1 = hi(a)
    for (const y of [y0, (y0 + y1) / 2, y1]) pos.push(rad(y) * Math.cos(a), y, rad(y) * Math.sin(a))
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    for (let k = 0; k < 2; k++) idx.push(i * 3 + k, i * 3 + k + 1, j * 3 + k, j * 3 + k, i * 3 + k + 1, j * 3 + k + 1)
  }
  // 上下两个盖（单独的顶点，法线不和侧面平均）
  for (const [f, up] of [
    [lo, false],
    [hi, true],
  ] as [(a: number) => number, boolean][]) {
    const base = pos.length / 3
    let mean = 0
    for (let i = 0; i < N; i++) {
      const a = (i / N) * PI * 2
      const y = f(a)
      mean += y / N
      pos.push(rad(y) * Math.cos(a), y, rad(y) * Math.sin(a))
    }
    pos.push(0, mean, 0)
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      idx.push(base + N, base + (up ? j : i), base + (up ? i : j))
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return mesh(geo, color)
}
/** 海星：五角星挤出一点厚度，平躺（中心在原点，底面在 y = 0） */
function starfish(r: number, color: string) {
  const s = new THREE.Shape()
  for (let k = 0; k < 10; k++) {
    const a = (k * PI) / 5 - PI / 2
    const q = k % 2 ? r * 0.45 : r
    if (k) s.lineTo(Math.cos(a) * q, Math.sin(a) * q)
    else s.moveTo(Math.cos(a) * q, Math.sin(a) * q)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelOffset: -0.15, bevelSegments: 1 })
  geo.rotateX(-PI / 2)
  geo.translate(0, 0.15, 0)
  return mesh(geo, color)
}
function sandArt(p: string[]) {
  const [sa, sb, sc, dish] = p
  const g = new THREE.Group()
  const bx = -5.6
  const cols = [sa, PAPER, sb, sc, PAPER, sa]
  const level = (i: number) => (a: number) => SA_LEVELS[i][0] + SA_LEVELS[i][1] * Math.cos(a - SA_LEVELS[i][2])
  for (let i = 0; i < cols.length; i++) g.add(P(sandLayer(level(i), level(i + 1), cols[i]), bx, 0, 0))
  g.add(P(ghost(lathe(SA_BOTTLE, GLASS, 24), GLASS, 0.22), bx, 0, 0))
  // 瓶口一圈厚一些的唇口（和瓶中船一样）：瓶颈几乎是透明的，没有它软木塞像飘在瓶子上方；扎口的细绳系在唇口底下
  g.add(ghost(cyl(2, 2, 0.9, GLASS, { x: bx, y: 12.9 }, 16), GLASS, 0.6))
  g.add(cyl(1.25, 1.4, 1.8, CORK, { x: bx, y: 12.9 }, 12))
  g.add(noOutline(torus(1.62, 0.18, THREAD, { x: bx, y: 12.6, rx: PI / 2 }, PI * 2, [4, 12])))
  // 贝壳盘：浅瓷碟里一只海星、一只扇贝、一只小海螺
  const dx = 6
  const dz = 0.6
  g.add(cup(4.6, 3, 1.7, 0.4, dish, { x: dx, z: dz }, 20))
  g.add(P(starfish(1.9, '#f08a5d'), dx - 0.8, 0.45, dz + 0.3, 0.06, 0.4, 0))
  g.add(ball(1.2, '#f6e3d3', { x: dx + 1.9, y: 0.85, z: dz + 1 }, [1, 0.4, 0.85]))
  g.add(taperRod3([dx + 0.6, 0.95, dz - 2], [dx + 2.3, 1.3, dz - 2.6], 0.7, 0.1, '#e8b9a0', 8))
  g.add(ball(0.7, '#e8b9a0', { x: dx + 0.6, y: 0.95, z: dz - 2 }))
  return fitGroup(g)
}

// ---------- 复古地球仪酒柜：四条旋木腿的木架托着一只大地球仪，上半球往后掀开，露出里面的酒瓶和酒杯，腿间一层圆托盘 ----------

const GB = { R: 22, cy: 56, open: 1.25, shelf: 16.8 }
/** 整体往前挪这么多：掀开的上半球往后探出去一截，挪过之后前后以原点对称 */
const GB_ZC = (GB.R + 0.35 - (GB.R + 0.35) * Math.cos(GB.open) + GB.R + 0.3 - (GB.R + 4)) / 2
/** 半球壳（碗口朝上，口沿在 y = 0）：外面是海、里面是衬里、口沿一圈铜边，外面贴几块陆地。lands：[纬度, 经度, 半张角] */
function hemisphere(ocean: string, land: string, lining: string, lands: number[][]) {
  const R = GB.R
  const g = new THREE.Group()
  const n = 8
  const outer: V2[] = []
  const inner: V2[] = []
  for (let i = 0; i <= n; i++) {
    const a = -PI / 2 + (PI / 2) * (i / n)
    outer.push([R * Math.cos(a), R * Math.sin(a)])
    inner.unshift([(R - 1) * Math.cos(a), (R - 1) * Math.sin(a)])
  }
  g.add(lathe(outer, ocean, 32))
  g.add(lathe(inner, lining, 32))
  g.add(
    lathe(
      [
        [R - 0.1, -1.3],
        [R + 0.35, -1.3],
        [R + 0.35, 0.12],
        [R - 1.2, 0.12],
      ],
      BRASS,
      32,
    ),
  )
  // 陆地：比球面高出 0.3 的球冠，边上一圈往里折、底面封口（实心的一片，压进球壳里，不是浮在球面外的薄片）
  for (const [lat, lon, ang] of lands) {
    const geo = cached(`dm-cap${R},${ang}`, () => {
      // 轮廓从底面中心往外、再沿球面收到极点（车削轮廓要由下往上走，面才朝外）
      const pts = [new THREE.Vector2(0, (R - 0.4) * Math.cos(ang)), new THREE.Vector2((R - 0.4) * Math.sin(ang), (R - 0.4) * Math.cos(ang))]
      for (let i = 3; i >= 0; i--) pts.push(new THREE.Vector2((R + 0.3) * Math.sin((ang * i) / 3), (R + 0.3) * Math.cos((ang * i) / 3)))
      return new THREE.LatheGeometry(pts, 10)
    })
    const m = noOutline(mesh(geo, land))
    m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)))
    g.add(m)
  }
  return g
}
/** 酒瓶的车削轮廓 */
const GB_BOTTLE: V2[] = [
  [0, 0],
  [3.2, 0],
  [3.5, 0.5],
  [3.5, 11],
  [2.6, 13.5],
  [1.2, 15.5],
  [1.1, 20],
  [1.4, 20.2],
  [1.4, 21.4],
  [0, 21.4],
]
/** 平底酒杯（空心） */
const GB_GLASS: V2[] = [
  [0, 0],
  [2.2, 0],
  [2.6, 6],
  [2.35, 6],
  [2, 0.6],
  [0, 0.6],
]
function globeBar(p: string[]) {
  const [wood, ocean, land, lining] = p
  const g = new THREE.Group()
  const { R, cy } = GB
  // 下半球坐在木架的水平环里
  g.add(
    P(
      hemisphere(ocean, land, lining, [
        [-0.42, 0.3, 0.3],
        [-0.72, 0.62, 0.22],
        [-0.36, 0.86, 0.17],
        [-0.5, 2.4, 0.28],
        [-0.82, 2.15, 0.2],
        [-0.36, 4.2, 0.22],
        [-0.62, 4.65, 0.3],
        [-1.22, 1.3, 0.28],
      ]),
      0,
      cy,
      0,
    ),
  )
  g.add(
    lathe(
      [
        [R + 0.2, cy - 3.2],
        [R + 3.6, cy - 3.2],
        [R + 4, cy - 2.4],
        // 环的顶面顶着下半球口沿的铜边（铜边底在 cy - 1.3）
        [R + 3.6, cy - 1.25],
        [R + 0.2, cy - 1.25],
      ],
      wood,
      32,
    ),
  )
  // 从左右两侧兜住球底的铜子午圈
  g.add(P(torus(R + 0.8, 0.5, BRASS, {}, PI, [6, 16]), 0, cy - 1.6, 0, 0, 0, PI))
  // 上半球：绕后沿的合页往后掀开
  const dome = new THREE.Group()
  dome.position.set(0, cy + 0.12, -(R + 0.35))
  dome.rotation.x = -GB.open
  dome.add(
    P(
      hemisphere(ocean, land, lining, [
        [-0.5, 0.2, 0.32],
        [-0.82, 0.6, 0.24],
        [-0.4, 1.6, 0.2],
        [-0.62, 2.9, 0.34],
        [-0.36, 3.45, 0.19],
        [-0.92, 4.4, 0.27],
        [-0.46, 5.2, 0.23],
      ]),
      0,
      0,
      R + 0.35,
      PI,
    ),
  )
  g.add(dome)
  g.add(rbox(3.4, 1.8, 1.6, BRASS, { y: cy - 1, z: -(R + 1) }, 0.4))
  // 球里的托板、三只酒瓶（带酒标）、四只酒杯
  const fy = cy - 7.5
  g.add(cyl(19.4, 19.4, 1.2, shade(lining, -0.12), { y: fy - 1.2 }, 32))
  for (const [az, c, k] of [
    [2.5, '#2f5d3a', 1],
    [4.1, '#7a4a22', 0.9],
    [5.5, '#5a1f2a', 0.96],
  ] as [number, string, number][]) {
    const x = Math.cos(az) * 5.6
    const z = Math.sin(az) * 5.6
    const b = P(lathe(GB_BOTTLE, c, 14), x, fy, z)
    b.scale.y = k
    g.add(b)
    g.add(noOutline(cyl(3.58, 3.58, 3.6 * k, '#f2ead8', { x, y: fy + 4 * k, z }, 14)))
  }
  // 四只酒杯烘成一个网格：半透明件不参与按材质合并，一只就是一次绘制
  g.add(
    ghost(
      bakeMeshes(
        [0.35, 1.2, 1.95, 2.8].map((az) => P(lathe(GB_GLASS, GLASS, 12), Math.cos(az) * 12, fy, Math.sin(az) * 12)),
        GLASS,
      ),
      GLASS,
      0.4,
    ),
  )
  // 四条旋木腿（略微外撇）：上端顶着水平环，中间一颗旋木球，脚下一只铜脚轮
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const top: V3 = [c * (R + 2.2), cy - 2.6, s * (R + 2.2)]
    const foot: V3 = [c * (R + 5), 3, s * (R + 5)]
    g.add(taperRod3(foot, top, 1, 1.5, wood, 10))
    const mid = lerp3(foot, top, 0.62)
    g.add(ball(2.1, wood, { x: mid[0], y: mid[1], z: mid[2] }, undefined, [10, 6]))
    g.add(ball(1.9, wood, { x: top[0], y: top[1] - 2.4, z: top[2] }, undefined, [10, 6]))
    g.add(cyl(1.3, 1.1, 1, BRASS, { x: foot[0], y: 2.6, z: foot[2] }, 10))
    g.add(ball(1.6, '#8a6a3a', { x: foot[0], y: 1.6, z: foot[2] }, undefined, [10, 6]))
  }
  // 腿间的圆托盘：一块圆板 + 一圈围栏
  g.add(cyl(25.4, 25.4, 1.6, wood, { y: GB.shelf - 1.6 }, 32))
  // 围栏连管粗不超出 52 的占地
  g.add(torus(25.1, 0.9, shade(wood, -0.1), { y: GB.shelf + 0.7, rx: PI / 2 }, PI * 2, [6, 32]))
  g.position.z = GB_ZC
  return G(g)
}

// ---------- 配色 ----------

const SG_PALS: Pal[] = [
  ['classic', [CL.wine, '#c8473a', CL.gold]],
  ['nordic', [N.oak, '#c8473a', N.white]],
  ['modern', [M.char, '#3d5a80', M.silver]],
  ['cute', [C.pink, C.red, C.white]],
]
const MB_PALS: Pal[] = [
  ['classic', [CL.walnut, CL.wine, '#f7c6d4']],
  ['retro', [R.caramel, R.teal, R.cream]],
  ['cute', [C.sakura, C.lilac, C.white]],
  ['chinese', [CN.rosewood, CN.lacquer, CN.ivory]],
  ['nordic', [N.white, N.blue, '#f4b6c2']],
]
const NC_PALS: Pal[] = [
  ['modern', [M.black, M.silver, '#d5d9de']],
  ['nordic', [N.oak, M.silver, '#d5d9de']],
  ['industrial', [I.walnut, I.iron, I.steel]],
  ['classic', [CL.walnut, CL.gold, '#e3c98a']],
]
const SM_PALS: Pal[] = [
  ['classic', [CL.walnut, '#f6f0e1', CL.wine, '#5a3b2a']],
  ['nordic', [N.oak, N.white, N.blue, N.oakL]],
  ['retro', ['#3a2a22', R.cream, R.red, R.caramel]],
  ['farmhouse', [F.oak, F.white, F.navy, F.iron]],
]
const SB_PALS: Pal[] = [
  ['classic', [CL.walnut, '#7a4b32', '#5f9bc4']],
  ['nordic', [N.oak, '#a8683a', N.blue]],
  ['retro', [R.caramel, '#3a2a22', R.teal]],
  ['modern', [M.black, M.walnut, '#3d5a80']],
]
const MT_PALS: Pal[] = [
  ['retro', [R.red, '#f6dc8a', '#3f7fd8']],
  ['classic', [CL.navy, CL.cream, CL.wine]],
  ['cute', [C.pink, C.white, C.red]],
  ['farmhouse', ['#3f7a5a', F.butter, F.barn]],
  ['nordic', [N.blue, N.white, N.mustard]],
]
const ZG_PALS: Pal[] = [
  ['japanese', [J.dark, '#efe8d6', '#6e6e6a']],
  ['japanese', [J.hinoki, '#f4efe2', J.sumi]],
  ['modern', [M.black, '#f1f0ec', M.gray]],
  ['nordic', [N.oak, N.white, '#8a8f8a']],
]
const CB_PALS: Pal[] = [
  ['classic', [CL.gold, '#cfe3f5', '#b9a4ff']],
  ['retro', ['#5a3b2a', '#d9c8f0', '#ff9ad5']],
  ['modern', [M.black, '#cfe8f5', '#7fe0ff']],
  ['chinese', [CN.brass, '#cfeedd', '#8fe8c0']],
]
const DC_PALS: Pal[] = [
  ['farmhouse', [F.oak, F.white, '#3fa7a0']],
  ['nordic', [N.white, N.gray, N.mustard]],
  ['retro', [R.caramel, R.cream, R.orange]],
  ['cute', [C.pink, C.white, C.lilac]],
  ['modern', [M.black, M.light, '#7a5cff']],
]
const NR_PALS: Pal[] = [
  ['japanese', [J.ai, J.washi, J.wood]],
  ['japanese', [J.washi, J.sumi, J.dark]],
  ['japanese', [J.shu, J.washi, J.dark]],
  ['nordic', [N.linen, N.blue, N.oak]],
  ['modern', [M.char, M.white, M.walnut]],
]
const SZ_PALS: Pal[] = [
  ['japanese', [J.wood, '#e8483f', '#f2c230', '#4f9e5b', '#3f7fd8']],
  ['cute', [C.woodL, C.pink, C.lemon, C.mint, C.sky]],
  ['japanese', [J.dark, J.shu, J.washi, '#e8c36a', J.ai]],
  ['nordic', [N.oak, N.white, N.blue, N.sage, N.mustard]],
]
const KK_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.shu, J.sumi]],
  ['japanese', ['#f0dcb4', '#c8473a', '#3f7a5a']],
  ['cute', [C.woodL, C.pink, C.red]],
  ['nordic', [N.oakL, N.blue, N.mustard]],
]
const KD_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.shu, '#e8483f', '#3f7fd8']],
  ['nordic', [N.oak, N.blue, N.mustard, N.sage]],
  ['cute', [C.woodL, C.pink, C.sky, C.lemon]],
  ['modern', [M.walnut, M.black, '#f2c230', '#2f8f8a']],
]
const KT_PALS: Pal[] = [
  ['japanese', [J.sumi, '#7a1f1f', '#24252a', BRASS]],
  ['japanese', [J.dark, '#24252a', '#3d5a80', J.shu]],
  ['modern', [M.black, M.white, '#24252a', '#c8473a']],
  ['classic', [CL.walnut, CL.navy, CL.wine, CL.gold]],
]
const BU_PALS: Pal[] = [
  ['classic', [CL.ivory, '#3d3f44']],
  ['modern', [M.white, M.black]],
  ['classic', ['#8a6a43', '#5a3b2a']],
  ['nordic', [N.white, N.oak]],
  ['industrial', [I.concrete, I.iron]],
]
const PV_PALS: Pal[] = [
  ['nordic', [N.white, '#e8dcc4', '#8a6a4a']],
  ['japanese', [J.sumi, '#e9dcc0', J.dark]],
  ['farmhouse', ['#c98b6a', '#f1e6d0', F.iron]],
  ['modern', [M.char, '#f0c9c9', '#5a4a3a']],
  ['retro', [R.mustard, R.cream, R.caramel]],
]
const CU_PALS: Pal[] = [
  ['nordic', [N.linen, N.blue, N.mustard, N.white]],
  ['modern', [M.char, M.light, '#c8473a', M.white]],
  ['cute', [C.pink, C.white, C.lilac, C.lemon]],
  ['farmhouse', [F.sage, F.linen, F.navy, F.butter]],
  ['retro', [R.mustard, R.teal, R.orange, R.cream]],
]
const TB_PALS: Pal[] = [
  ['nordic', [N.linen, N.gray, N.white]],
  ['farmhouse', [F.barn, F.linen, F.white]],
  ['cute', [C.sakura, C.lilac, C.white]],
  ['modern', [M.light, M.char, M.gray]],
  ['retro', [R.mustard, R.teal, R.cream]],
]
const SA_PALS: Pal[] = [
  ['retro', [R.orange, R.teal, R.mustard, R.cream]],
  ['cute', [C.pink, C.sky, C.lemon, C.white]],
  ['nordic', [N.blue, N.mustard, N.sage, N.white]],
  ['modern', ['#3d5a80', '#c8473a', M.gray, M.white]],
]
const GB_PALS: Pal[] = [
  ['classic', [CL.walnut, '#d9c69a', '#a8783f', CL.wine]],
  ['retro', [R.caramel, '#e8dcb8', R.olive, '#7a2b2b']],
  ['classic', ['#5a3b2a', CL.navy, CL.gold, CL.wine]],
  ['industrial', [I.walnut, '#2f3a40', I.rust, I.leather]],
  ['nordic', [N.oak, '#cfe0ea', N.sage, N.linen]],
]

export const DECO_MORE: AssetDef[] = [
  define('dm-snow-globe', '雪花球', 'deco', [10, 10, 13], SG_PALS, snowGlobe, {
    ...PROP,
    type: 'decor',
    tags: ['high-ok', 'collectible'],
    mats: ['wood', 'paint', 'metal'],
  }),
  define('dm-music-box', '八音盒', 'deco', [16.5, 11.5, 14], MB_PALS, musicBox, {
    ...PROP,
    type: 'decor',
    tags: ['high-ok'],
    mats: ['wood', 'fabric', 'fabric'],
  }),
  define('dm-newton-cradle', '牛顿摆', 'tabletop', [20.5, 11, 16], NC_PALS, newtonCradle, {
    ...PROP,
    type: 'decor',
    mats: ['wood', 'metal', 'metal'],
  }),
  define('dm-ship-model', '帆船模型', 'deco', [38, 9, 33], SM_PALS, shipModel, {
    ...PROP,
    type: 'model',
    tags: ['collectible', 'high-ok', 'hobby:models'],
    mats: ['wood', 'fabric', 'paint', 'wood'],
  }),
  define('dm-ship-bottle', '瓶中船', 'deco', [29, 9, 13], SB_PALS, shipBottle, {
    ...PROP,
    type: 'decor',
    tags: ['collectible', 'high-ok'],
    mats: ['wood', 'wood', 'plastic'],
  }),
  define('dm-matryoshka', '俄罗斯套娃', 'deco', [34, 9.5, 16], MT_PALS, matryoshka, {
    ...PROP,
    type: 'decor',
    tags: ['collectible', 'high-ok'],
    mats: ['wood', 'wood', 'wood'],
  }),
  define('dm-zen-garden', '桌面枯山水', 'japanese', [30, 20, 6], ZG_PALS, zenGarden, {
    ...PROP,
    type: 'decor',
    mats: ['wood', 'stone', 'stone'],
  }),
  define('dm-crystal-ball', '水晶球', 'deco', [14, 14, 18], CB_PALS, crystalBall, {
    ...PROP,
    type: 'decor',
    tags: ['high-ok'],
    mats: ['metal', 'glass', 'glass'],
  }),
  define('dm-dreamcatcher', '捕梦网', 'deco', [24, 2, 56], DC_PALS, dreamcatcher, {
    type: 'decor',
    mount: DC_MOUNT,
    mats: ['fabric', 'fabric', 'plastic'],
  }),
  define('dm-noren', '暖帘', 'japanese', [NR.w, 3.4, 62], NR_PALS, noren, {
    type: 'curtain',
    tags: ['decor'],
    mount: NR.mount,
    mats: ['fabric', 'fabric', 'wood'],
  }),
  define('dm-senbazuru', '千纸鹤串', 'japanese', [32, 5, 80], SZ_PALS, senbazuru, {
    type: 'decor',
    mount: SZ.mount,
    mats: ['wood', 'paper', 'paper', 'paper', 'paper'],
  }),
  define('dm-kokeshi', '小芥子木偶', 'japanese', [15, 7.5, 20], KK_PALS, kokeshi, {
    ...PROP,
    type: 'decor',
    tags: ['collectible', 'high-ok'],
    mats: ['wood', 'paint', 'paint'],
  }),
  define('dm-kendama', '剑玉和纸气球', 'japanese', [18.5, 9, 18], KD_PALS, kendama, {
    ...PROP,
    type: 'toy',
    mats: ['wood', 'paint', 'paper', 'paper'],
  }),
  define('dm-katana-stand', '日本刀架', 'japanese', [KT.len, 16, 32], KT_PALS, katanaStand, {
    ...PROP,
    type: 'decor',
    tags: ['collectible'],
    mats: ['wood', 'paint', 'fabric', 'fabric'],
  }),
  define('dm-bust', '石膏胸像', 'deco', [22, 16, 42.5], BU_PALS, bust, {
    ...PROP,
    type: 'decor',
    mats: ['stone', 'stone'],
  }),
  define('dm-pampas-vase', '蒲苇落地花瓶', 'deco', [50, 48, 133], PV_PALS, pampasVase, {
    type: 'vase',
    tags: ['decor', 'leafy'],
    mats: ['ceramic', 'plant', 'wood'],
  }),
  define('dm-cushions', '抱枕组', 'deco', [58, 45, 30], CU_PALS, cushions, {
    ...PROP,
    type: 'decor',
    tags: ['bed-ok'],
    mats: ['fabric', 'fabric', 'fabric', 'fabric'],
  }),
  define('dm-throw-blanket', '叠好的毯子', 'deco', [45, 32, 15], TB_PALS, throwBlanket, {
    ...PROP,
    type: 'decor',
    tags: ['bed-ok'],
    mats: ['fabric', 'fabric', 'fabric'],
  }),
  define('dm-sand-art', '沙画瓶和贝壳盘', 'deco', [20.5, 9.5, 15], SA_PALS, sandArt, {
    ...PROP,
    type: 'decor',
    tags: ['high-ok'],
    mats: ['stone', 'stone', 'stone', 'ceramic'],
  }),
  define('dm-globe-bar', '地球仪酒柜', 'deco', [52, 64, 100], GB_PALS, globeBar, {
    type: 'decor',
    mats: ['wood', 'paint', 'paint', 'fabric'],
    // 腿间的圆托盘可以摆东西：到球底 17，正中间那道铜子午圈最低处离托盘 14.3，净高按它算
    surfaces: [{ y: GB.shelf, shape: [ellipsePoly(21, 21, 0, GB_ZC)], h: 14 }],
  }),
]
