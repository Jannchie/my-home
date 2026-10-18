// 椅凳素材包：各式餐椅、办公 / 书房椅、休闲椅、和式座椅、凳子、儿童椅、户外椅。
// 布面（坐垫、靠背布、帆布、皮面、网面）直接用配色槽位的颜色，不再 shade：主程序按「材质颜色 == 配色槽颜色」识别布面并允许加花纹。
// 框架、腿可以用 shade 过的颜色。每个 build 最后经 fit() 把包围盒对齐到占地中心、底面贴 y = 0。

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { ball, capsule, cyl, puck, rbox, shade, toon, torus, tray, useAnisotropy } from '../toon'
import { C, G, ellipsePoly, holePanel, legs, slab, type AssetDef, type Hole } from '../kit'
import { UP, cappedTube, fitChildren, mesh, strut, strutBox, tube, type TubeOpts, type V2, type V3 } from '../geo'
import { I, J, M, N, R, pal } from '../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = { seg: { per: 10, min: 16 } }

// ---------- 配色 ----------

const CHROME = M.silver
const INK = M.black

// ---------- 小工具 ----------

/** 把一条 2D 中心线（先样条平滑）加厚 t，得到闭合轮廓 */
function strip(pts: V2[], t: number, n = 40): V2[] {
  const curve = new THREE.SplineCurve(pts.map(([a, b]) => new THREE.Vector2(a, b)))
  const ps = curve.getSpacedPoints(n)
  const outer: V2[] = []
  const inner: V2[] = []
  ps.forEach((p, i) => {
    const a = ps[Math.max(0, i - 1)]
    const b = ps[Math.min(ps.length - 1, i + 1)]
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / l
    const ny = (b.x - a.x) / l
    outer.push([p.x + (nx * t) / 2, p.y + (ny * t) / 2])
    inner.push([p.x - (nx * t) / 2, p.y - (ny * t) / 2])
  })
  return [...outer, ...inner.reverse()]
}

/** 圆弧中心线：(R sinθ, -R cosθ)，θ 从 t0 到 t1 */
function arcLine(r: number, t0: number, t1: number, n = 24): V2[] {
  return Array.from({ length: n + 1 }, (_, i): V2 => {
    const t = t0 + ((t1 - t0) * i) / n
    return [r * Math.sin(t), -r * Math.cos(t)]
  })
}

/**
 * 侧面轮廓（[z, y] 闭合多边形）沿 x 挤出宽 w，x 居中。
 * dish：两侧边缘朝 dishTo（[z, y]）方向卷起的量（壳椅的兜形）；flare(y)：按高度缩放宽度。
 */
function extrudeX(poly: V2[], w: number, color: string, opts: { steps?: number; dish?: number; dishTo?: V2; flare?: (y: number) => number } = {}) {
  const bevel = 0.3
  const shape = new THREE.Shape(poly.map(([z, y]) => new THREE.Vector2(z, y)))
  let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, w - bevel * 2),
    steps: opts.steps ?? 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
  })
  geo.rotateY(-Math.PI / 2)
  geo.translate(w / 2 - bevel, 0, 0)
  if (opts.dish || opts.flare) {
    const pos = geo.attributes.position
    const [cz, cy] = opts.dishTo ?? [0, 60]
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i)
      let y = pos.getY(i)
      let z = pos.getZ(i)
      if (opts.dish) {
        const k = (x / (w / 2)) ** 2
        const dy = cy - y
        const dz = cz - z
        const l = Math.hypot(dy, dz) || 1
        y += (opts.dish * k * dy) / l
        z += (opts.dish * k * dz) / l
      }
      if (opts.flare) x *= opts.flare(pos.getY(i))
      pos.setXYZ(i, x, y, z)
    }
  }
  geo.deleteAttribute('normal')
  geo.deleteAttribute('uv')
  geo = mergeVertices(geo, 1e-3)
  geo.computeVertexNormals()
  return mesh(geo, color)
}

/** 俯视呈圆弧的竖板（弯靠背）：外半径 r、厚 t、高 h，弧的最后点在原点，两侧各张开 half 弧度伸向 +z；底在 y = 0 */
function arcWall(r: number, t: number, half: number, h: number, color: string, n = 20) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const a = -half + (2 * half * i) / n
    pts.push(new THREE.Vector2(r * Math.sin(a), -(r - r * Math.cos(a))))
  }
  for (let i = n; i >= 0; i--) {
    const a = -half + (2 * half * i) / n
    pts.push(new THREE.Vector2((r - t) * Math.sin(a), -(r - (r - t) * Math.cos(a))))
  }
  const b = Math.min(0.3, t * 0.25)
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1 })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, b, 0)
  return mesh(geo, color)
}

/** 闭合轮廓（[r, y]）绕 y 轴旋转成实心壳；不满一圈时两端封口。φ = 0 指向 +z */
function revolve(poly: V2[], color: string, phi0 = 0, phiLen = Math.PI * 2, seg = 40) {
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    area += x0 * y1 - x1 * y0
  }
  const pts = (area < 0 ? [...poly].reverse() : poly).map(([r, y]) => new THREE.Vector2(Math.max(0.01, r), y))
  const lathe = new THREE.LatheGeometry([...pts, pts[0]], seg, phi0, phiLen)
  if (phiLen >= Math.PI * 2 - 1e-6) return mesh(lathe, color)
  const shape = new THREE.Shape(pts)
  const cap = (phi: number, flip: boolean) => {
    const g = new THREE.ShapeGeometry(shape)
    if (flip) {
      const idx = g.index!
      for (let i = 0; i < idx.count; i += 3) {
        const t = idx.getX(i + 1)
        idx.setX(i + 1, idx.getX(i + 2))
        idx.setX(i + 2, t)
      }
      const nrm = g.attributes.normal
      for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i))
    }
    g.rotateY(phi - Math.PI / 2)
    return g
  }
  const geo = mergeGeometries([lathe, cap(phi0, false), cap(phi0 + phiLen, true)])
  return mesh(geo ?? lathe, color)
}

/** 圆角矩形顶面 */
function rrPoly(w: number, d: number, r: number, n = 5): V2[] {
  const pts: V2[] = []
  const hx = w / 2 - r
  const hz = d / 2 - r
  const cs: V3[] = [
    [hx, hz, 0],
    [-hx, hz, Math.PI / 2],
    [-hx, -hz, Math.PI],
    [hx, -hz, (Math.PI * 3) / 2],
  ]
  for (const [cx, cz, a0] of cs)
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((i / n) * Math.PI) / 2
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)])
    }
  return pts
}

/** 方格绗缝软垫：底垫 + nx × nz 块小方包，躺平，原点在底面中心，顶在 h */
function tufted(w: number, h: number, d: number, nx: number, nz: number, color: string) {
  const g = G(rbox(w, h * 0.55, d, color, {}, 1.5))
  const pw = w / nx
  const pd = d / nz
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) g.add(rbox(pw - 0.5, h * 0.6, pd - 0.5, color, { x: -w / 2 + pw * (i + 0.5), y: h * 0.4, z: -d / 2 + pd * (j + 0.5) }, 1.8))
  return g
}

/** 办公椅五星脚：脚轮 + 气压杆，气压杆顶在 top */
function starBase(R0: number, top: number, frame: string, n = 5) {
  const g = G(cyl(5, 6.5, 5, frame, { y: 6 }, 16))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const sx = Math.sin(a)
    const sz = Math.cos(a)
    g.add(strutBox([0, 8.5, 0], [sx * R0, 7, sz * R0], 3.6, 3.6, frame))
    g.add(cyl(0.9, 0.9, 2.4, INK, { x: sx * R0, y: 4.6, z: sz * R0 }, 8))
    g.add(ball(2.6, INK, { x: sx * R0, y: 2.6, z: sz * R0 }))
  }
  g.add(cyl(3.2, 3.6, Math.min(18, top - 14), INK, { y: 10 }, 14))
  g.add(cyl(2.2, 2.2, top - 11, CHROME, { y: 11 }, 12))
  return g
}

// ---------- 餐椅 ----------

/** 温莎椅：鞍形厚座、外撇四腿 + H 撑、弓背 + 梳背细杆 */
function windsor(p: string[]) {
  const [wood, cushion] = p
  const leg = shade(wood, -0.08)
  const g = G(slab(ellipsePoly(23, 21, 0, 0, 32), 4.5, wood, 40.5))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(strut([sx * 20, 0, sz * 18], [sx * 15, 41, sz * 13], 1.4, leg, 1.9))
  const k = 16 / 41
  const lx = 20 - 5 * k
  const lz = 18 - 5 * k
  for (const sx of [-1, 1]) g.add(strut([sx * lx, 16, -lz], [sx * lx, 16, lz], 1.1, leg))
  g.add(strut([-lx, 16, 0], [lx, 16, 0], 1.1, leg))
  const bow = (t: number): V3 => [Math.cos(t) * (15 + 5 * Math.sin(t)), 43 + 46 * Math.sin(t), -13 - 9 * Math.sin(t)]
  g.add(tube(Array.from({ length: 17 }, (_, i) => bow((i / 16) * Math.PI)), 1.6, wood, TUBE))
  for (let i = 0; i < 7; i++) {
    const [x, y, z] = bow(Math.PI / 2 + (i - 3) * 0.17)
    g.add(strut([x * 0.92, 44, -12], [x, y - 0.5, z], 0.8, wood))
  }
  g.add(rbox(32, 3, 27, cushion, { y: 45, z: 3.5 }, 1.4))
  return g
}

/** Y 椅：弯背横梁 + Y 形靠背板 + 纸绳编织座面 */
function wishbone(p: string[]) {
  const [wood, cord] = p
  const g = G()
  const bl = (y: number): V3 => [21.5 + (1.2 * y) / 66.5, y, -18.5 - (2 * y) / 66.5]
  const fl = (y: number): V3 => [22 + (0.5 * y) / 44, y, 20 - (0.5 * y) / 44]
  for (const s of [-1, 1]) {
    const m = (v: V3): V3 => [s * v[0], v[1], v[2]]
    g.add(strut(m(fl(0)), m(fl(44)), 1.5, wood, 1.8))
    g.add(strut(m(bl(0)), m(bl(66.5)), 1.5, wood, 1.7))
    g.add(strut(m(bl(42)), m(fl(42)), 1.3, wood))
    g.add(strut(m(bl(15)), m(fl(15)), 1, wood))
  }
  g.add(strut([-fl(42)[0], 42, fl(42)[2]], [fl(42)[0], 42, fl(42)[2]], 1.3, wood))
  g.add(strut([-bl(42)[0], 42, bl(42)[2]], [bl(42)[0], 42, bl(42)[2]], 1.3, wood))
  g.add(strut([-fl(20)[0], 20, fl(20)[2]], [fl(20)[0], 20, fl(20)[2]], 1, wood))
  // 编织座面：底 + 纵横两层纸绳
  g.add(rbox(43, 1.4, 38, cord, { y: 42.3 }, 0.5))
  for (let i = 0; i < 10; i++) g.add(strut([-20.5, 43.9, -17 + i * 3.78], [20.5, 43.9, -17 + i * 3.78], 0.55, cord, 0.55, 6))
  for (let j = 0; j < 11; j++) g.add(strut([-19.5 + j * 3.9, 44.4, -17.8], [-19.5 + j * 3.9, 44.4, 17.8], 0.55, cord, 0.55, 6))
  // 弯背横梁：两端落在后腿顶
  g.add(
    cappedTube([
        [-23.5, 64, -15],
        [-22.7, 66.5, -20.5],
        [-17, 68.5, -25],
        [0, 69.5, -27],
        [17, 68.5, -25],
        [22.7, 66.5, -20.5],
        [23.5, 64, -15],
      ], 1.8, wood, TUBE),
  )
  for (const s of [-1, 1]) g.add(strutBox([s * 9, 69.2, -26.4], [0, 55, -23.8], 4, 1.4, wood))
  g.add(strutBox([0, 56, -23.8], [0, 42.5, -20], 4.5, 1.4, wood))
  return g
}

/** 壳椅：PP 一体壳，两侧兜起 */
const SHELL = strip(
  [
    [21, 41.5],
    [17.5, 44.6],
    [8, 45.4],
    [-4, 45],
    [-13, 47],
    [-18.5, 54],
    [-21, 66],
    [-23.5, 80],
  ],
  1.6,
  48,
)
function shellChair(base: 'wood' | 'eiffel', p: string[]) {
  const [shellC, wood, metal] = p
  const g = G(extrudeX(SHELL, 46, shellC, { steps: 14, dish: 5, dishTo: [0, 62] }))
  g.add(rbox(26, 2.5, 24, metal, { y: 42.2 }, 1))
  if (base === 'wood') {
    const leg = (sx: number, sz: number, y: number): V3 => [sx * (20 - (9 * y) / 43), y, sz * (19 - (9 * y) / 43)]
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(strut(leg(sx, sz, 0), leg(sx, sz, 43), 1.3, wood, 1.6))
    g.add(strut(leg(-1, -1, 26), leg(1, 1, 26), 0.5, metal, 0.5, 6))
    g.add(strut(leg(1, -1, 26), leg(-1, 1, 26), 0.5, metal, 0.5, 6))
    g.add(strut([0, 26, 0], [0, 42.4, 0], 0.5, metal, 0.5, 6))
  } else {
    const leg = (sx: number, sz: number, y: number): V3 => [sx * (19 - (9 * (y - 1)) / 41.5), y, sz * (18 - (9 * (y - 1)) / 41.5)]
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        g.add(strut(leg(sx, sz, 1.2), leg(sx, sz, 42.5), 0.7, metal, 0.7, 8))
        g.add(puck(1.4, 1.5, INK, { x: sx * 19, z: sz * 18 }))
      }
    // 底部方环 + 四面交叉斜撑（埃菲尔铁塔式）
    const ring: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]
    for (let i = 0; i < 4; i++) {
      const [ax, az] = ring[i]
      const [bx, bz] = ring[(i + 1) % 4]
      g.add(strut(leg(ax, az, 18), leg(bx, bz, 18), 0.6, metal, 0.6, 6))
      g.add(strut(leg(ax, az, 18), leg(bx, bz, 42), 0.45, metal, 0.45, 6))
      g.add(strut(leg(bx, bz, 18), leg(ax, az, 42), 0.45, metal, 0.45, 6))
    }
  }
  return g
}

/** 胶合板椅：分体的座板、弯背板，弯木脊梁和 U 形腿 */
function plywoodChair(p: string[]) {
  const [ply] = p
  const edge = shade(ply, -0.08)
  const g = G(slab(rrPoly(46, 42, 12), 1.8, ply, 43.5))
  const back = arcWall(40, 1.6, 0.58, 20, ply)
  back.position.set(0, 61, -24)
  back.rotation.x = -0.12
  g.add(back)
  g.add(strutBox([0, 42.6, -4], [0, 42.6, -22], 5, 1.8, edge))
  g.add(strutBox([0, 42, -21.5], [0, 72, -25.8], 5, 1.8, edge))
  for (const [zf, zt] of [
    [19, 13],
    [-20, -15],
  ]) {
    for (const s of [-1, 1]) g.add(strutBox([s * 19, 0, zf], [s * 15.5, 42.8, zt], 2, 3.6, edge))
    g.add(strutBox([-16.5, 42.6, zt], [16.5, 42.6, zt], 1.8, 4, edge))
  }
  return g
}

/** Tolix 风铁皮椅：冲压座盘、外撇方腿、方环撑、弯背板 */
function tolix(p: string[]) {
  const [metal] = p
  const dk = shade(metal, -0.1)
  const g = G(tray(38, 3, 38, 0.8, metal, { y: 45.5, rx: Math.PI }))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(strutBox([sx * 17, 45, sz * 17], [sx * 22, 0, sz * 22], 3, 3, metal))
  const r = 22 - (5 * 14) / 45
  for (const s of [-1, 1]) {
    g.add(strut([-r, 14, s * r], [r, 14, s * r], 0.6, dk))
    g.add(strut([s * r, 14, -r], [s * r, 14, r], 0.6, dk))
    g.add(strut([s * 16.5, 45, -17], [s * 15.5, 72, -17], 0.9, dk))
  }
  const back = arcWall(26, 1.2, 0.8, 18, metal)
  back.position.set(0, 63, -20)
  back.rotation.x = -0.15
  g.add(back)
  return g
}

/** Panton 风一体 S 形悬臂椅 */
const PANTON = strip(
  [
    [-19, 84],
    [-17.5, 70],
    [-14, 55],
    [-9, 46],
    [0, 43],
    [12, 43],
    [19.5, 41.5],
    [22, 37],
    [18, 28],
    [9, 18],
    [-3, 8.5],
    [-13, 2.6],
    [-22, 1.2],
    [-27, 1.2],
  ],
  2.4,
  64,
)
function panton(p: string[]) {
  return G(extrudeX(PANTON, 48, p[0], { steps: 14, dish: 3, dishTo: [0, 70], flare: (y) => 1 + 0.08 * Math.max(0, (30 - y) / 30) }))
}

/** 圈椅：马蹄形扶手圈从背后一路落到前端外撇，S 形靠背板 */
function quanyi(p: string[]) {
  const [wood, cushion] = p
  const dk = shade(wood, -0.06)
  const g = G()
  const Rr = 26
  const railY = (a: number) => 68 + 26 * Math.pow((1 + Math.cos(a)) / 2, 1.5)
  const railPt = (a: number): V3 => [Rr * Math.sin(a), railY(a), -Rr * Math.cos(a)]
  const pts: V3[] = [[-16, 67, 26]]
  for (let i = 0; i <= 12; i++) pts.push(railPt(-2.6 + (5.2 * i) / 12))
  pts.push([16, 67, 26])
  g.add(cappedTube(pts, 1.7, wood, TUBE))
  for (const s of [-1, 1]) {
    const bp = railPt(s * 0.8)
    const fp = railPt(s * 2.2)
    const mp = railPt(s * 1.6)
    g.add(strut([bp[0], 0, bp[2]], bp, 1.6, wood))
    g.add(strut([fp[0], 0, fp[2]], fp, 1.6, wood))
    g.add(strut([s * 21, 47, mp[2]], mp, 0.9, wood))
    g.add(strutBox([fp[0] - s * 0.1, 41, fp[2]], [bp[0] + s * 0.1, 41, bp[2]], 2, 6, dk))
    g.add(strut([fp[0], 14, fp[2]], [bp[0], 14, bp[2]], 1, dk))
  }
  const fp = railPt(2.2)
  const bp = railPt(0.8)
  g.add(rbox(48, 4, 42, wood, { y: 44, z: -1.5 }, 1.2))
  g.add(rbox(42, 2.5, 36, cushion, { y: 47.8, z: -1 }, 1))
  g.add(rbox(fp[0] * 2, 6, 2, dk, { y: 38, z: fp[2] }, 0.8))
  g.add(rbox(bp[0] * 2, 6, 2, dk, { y: 38, z: bp[2] }, 0.8))
  g.add(rbox(fp[0] * 2 + 2, 2.5, 4.5, dk, { y: 6, z: fp[2] }, 0.8))
  g.add(strut([-bp[0], 18, bp[2]], [bp[0], 18, bp[2]], 1, dk))
  g.add(
    extrudeX(
      strip(
        [
          [-19.5, 47],
          [-21, 62],
          [-23.5, 76],
          [-25, 90.5],
          [-25.6, 93.5],
        ],
        1.6,
        30,
      ),
      16,
      wood,
    ),
  )
  return g
}

/** 藤编悬臂椅（Cesca 风）：镀铬悬臂管 + 木框藤面 */
function cesca(p: string[]) {
  const [cane, wood, tubeC] = p
  const g = G()
  for (const s of [-1, 1]) {
    const x = s * 20.25
    g.add(
      tube([
          [x, 1.2, -20],
          [x, 1.2, 12],
          [x, 4, 20],
          [x, 20, 23],
          [x, 37, 21],
          [x, 42.5, 15],
          [x, 42.5, -13],
          [x, 46, -18.5],
          [x, 62, -21],
          [x, 82, -22],
        ], 1.2, tubeC, TUBE),
    )
    g.add(ball(1.2, tubeC, { x, y: 1.2, z: -20 }), ball(1.2, tubeC, { x, y: 82, z: -22 }))
  }
  g.add(strut([-20.25, 1.2, -20], [20.25, 1.2, -20], 1.2, tubeC))
  // 座：木框 + 藤面
  for (const s of [-1, 1]) {
    g.add(rbox(44, 3.5, 3.5, wood, { y: 43.7, z: s * 19.25 }, 1))
    g.add(rbox(3.5, 3.5, 35, wood, { x: s * 20.25, y: 43.7 }, 1))
  }
  const seatHoles: Hole[] = []
  for (let i = 0; i < 14; i++) for (let j = 0; j < 13; j++) seatHoles.push({ kind: 'circle', x: -16.9 + i * 2.6, y: 2.4 + j * 2.6, r: 0.85 })
  g.add(holePanel(38, 36, 0.8, cane, seatHoles, { y: 45.6, z: 18, rx: -Math.PI / 2 }, 1))
  // 背：木框 + 藤面
  g.add(holePanel(42, 20, 2, wood, [{ kind: 'rect', x: 0, y: 2.5, w: 36, h: 15, r: 1.5 }], { y: 60, z: -20.2 }, 3))
  const backHoles: Hole[] = []
  for (let i = 0; i < 13; i++) for (let j = 0; j < 5; j++) backHoles.push({ kind: 'circle', x: -15.6 + i * 2.6, y: 2.6 + j * 2.6, r: 0.85 })
  g.add(holePanel(37, 16, 0.6, cane, backHoles, { y: 62, z: -20.2 }, 1))
  return g
}

/** 软包餐椅：整体包布的高背椅，背面一排包扣 */
function upholstered(p: string[]) {
  const [fab, wood, btn] = p
  const g = G()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.9, 1.4, 37, wood, { x: sx * 19, z: sz * 19 }, 12))
  g.add(rbox(46, 9, 48, fab, { y: 36 }, 3))
  const back = G(rbox(46, 52, 8, fab, { z: 0 }, 3))
  for (const x of [-12, 0, 12]) for (const y of [24, 38]) back.add(ball(1.1, btn, { x, y, z: 4.1 }))
  back.position.set(0, 43, -20)
  back.rotation.x = -0.07
  g.add(back)
  return g
}

/** 靠背高脚吧椅：外撇四腿 + 脚踏环 + 软包座和靠背 */
function barChair(sh: number, p: string[]) {
  const [fab, frame] = p
  const g = G()
  const top = sh - 6.5
  const lp = (sx: number, sz: number, y: number): V3 => [sx * (19 - (3.5 * y) / top), y, sz * (19 - (3.5 * y) / top)]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(strut(lp(sx, sz, 0), lp(sx, sz, top), 1.3, frame, 1.5))
  const fy = sh - 46
  g.add(strut(lp(-1, 1, fy), lp(1, 1, fy), 1.2, frame))
  g.add(strut(lp(-1, -1, fy), lp(1, -1, fy), 0.9, frame))
  for (const s of [-1, 1]) g.add(strut(lp(s, -1, fy), lp(s, 1, fy), 0.9, frame))
  g.add(rbox(38, 3, 37, frame, { y: sh - 8 }, 1))
  g.add(rbox(38, 5, 37, fab, { y: sh - 5, z: 0.5 }, 2))
  for (const s of [-1, 1]) g.add(strut([s * 15.5, sh - 7, -15.5], [s * 16, sh + 27, -19.5], 1.2, frame))
  g.add(rbox(36, 13, 4, fab, { y: sh + 14, z: -19.5, rx: -0.1 }, 2))
  return g
}

/** 折叠椅：metal = 圆管 + 整片座 / 背；wood = 方料 + 条板。open = 展开，否则收起 */
function foldingChair(wood: boolean, open: boolean, p: string[]) {
  const [seatC, frameC] = p
  const post = (a: V3, b: V3) => (wood ? strutBox(a, b, 3, 3, frameC, 0.6) : strut(a, b, 1.2, frameC))
  const g = G()
  if (open) {
    const up = (y: number) => -19 + (4 * y) / 82
    const fr = (y: number) => 21 - (15 * y) / 43.5
    for (const s of [-1, 1]) {
      g.add(post([s * 19, 0, -19], [s * 19, 82, -15]))
      g.add(post([s * 18, 0, 21], [s * 18, 43.5, 6]))
      g.add(post([s * 18, 43.5, up(43.5) - 0.6], [s * 18, 43.5, 18]))
    }
    g.add(post([-19, 8, up(8)], [19, 8, up(8)]))
    g.add(post([-18, 8, fr(8)], [18, 8, fr(8)]))
    if (wood) {
      for (let i = 0; i < 5; i++) g.add(rbox(38, 2, 5.6, seatC, { y: 45, z: -14 + i * 7 }, 0.8))
      for (const y of [60, 70]) g.add(rbox(35, 6, 1.8, seatC, { y, z: up(y + 3) }, 0.8))
    } else {
      g.add(rbox(36, 2.5, 34, seatC, { y: 44.6, z: 0.5 }, 1.2))
      g.add(rbox(36, 14, 2, seatC, { y: 64, z: up(71) }, 1))
    }
  } else {
    for (const s of [-1, 1]) {
      g.add(post([s * 19, 0, -2.5], [s * 19, 84, -2.5]))
      g.add(post([s * 16.5, 0, 2.5], [s * 16.5, 52, 2.5]))
    }
    g.add(post([-19, 8, -2.5], [19, 8, -2.5]))
    g.add(post([-16.5, 8, 2.5], [16.5, 8, 2.5]))
    if (wood) {
      for (let i = 0; i < 5; i++) g.add(rbox(32, 5.6, 1.6, seatC, { y: 40 + i * 7, z: 0 }, 0.6))
      // 翻起的座面边框，搭在前腿上（以前座面木条和腿之间没有连接）
      for (const s of [-1, 1]) g.add(post([s * 15.6, 38.5, 0.4], [s * 15.6, 75.5, 0.4]))
      for (const y of [64, 74]) g.add(rbox(35, 6, 1.8, seatC, { y, z: -2.5 }, 0.8))
    } else {
      g.add(rbox(32, 34, 2, seatC, { y: 40, z: 0 }, 1))
      g.add(rbox(36, 14, 2, seatC, { y: 66, z: -2.5 }, 1))
    }
  }
  return g
}

// ---------- 办公 / 书房 ----------

/**
 * 网布靠背贴片：编织底纹 + 隔行错开的冲孔，整块只有两个三角面。
 * 以前用 12×14 = 168 个真孔，远景孔洞缩成一层透光的白点，深色椅背读不出来；
 * 改成贴图后 mipmap 把孔纹平均成深色，远景是深色网面，近景仍能看出织纹和孔。
 */
const meshSheetMats = new Map<string, THREE.MeshToonMaterial>()
function meshSheetMaterial(w: number, h: number, color: string) {
  const key = `${w}x${h}|${color}`
  const cached = meshSheetMats.get(key)
  if (cached) return cached
  const ppc = 16 // 每厘米像素
  const W = Math.round(w * ppc)
  const H = Math.round(h * ppc)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  // 底布：直接用配色槽的深色，和框架同一明度，远景平均下来仍是深色网面（不能提亮成浅灰板）
  g.fillStyle = color
  g.fillRect(0, 0, W, H)
  // 经纬织纹（近景看是布纹，远景被 mipmap 平均掉）
  g.strokeStyle = shade(color, 0.11)
  g.globalAlpha = 0.5
  g.lineWidth = 0.14 * ppc
  for (let x = 0.4; x < w; x += 0.85) {
    g.beginPath()
    g.moveTo(x * ppc, 0)
    g.lineTo(x * ppc, H)
    g.stroke()
  }
  for (let y = 0.4; y < h; y += 0.85) {
    g.beginPath()
    g.moveTo(0, y * ppc)
    g.lineTo(W, y * ppc)
    g.stroke()
  }
  g.globalAlpha = 1
  // 冲孔：9 列 × 11 行，隔行错半格，孔径 2.5、孔距约 4.4
  const cols = 9
  const rows = 11
  const px = w / cols
  const py = h / rows
  const hole = 2.5
  const r = 0.8
  const rrect = (x: number, y: number, ww: number, hh: number, rad: number) => {
    g.beginPath()
    g.moveTo(x + rad, y)
    g.arcTo(x + ww, y, x + ww, y + hh, rad)
    g.arcTo(x + ww, y + hh, x, y + hh, rad)
    g.arcTo(x, y + hh, x, y, rad)
    g.arcTo(x, y, x + ww, y, rad)
    g.closePath()
  }
  g.fillStyle = shade(color, -0.28)
  for (let j = 0; j < rows; j++) {
    const off = (px / 2) * (j % 2)
    for (let i = 0; i < cols; i++) {
      const cx = px * (i + 0.5) + off
      const cy = py * (j + 0.5)
      if (cx + hole / 2 > w - 0.8 || cx - hole / 2 < 0.8) continue
      rrect((cx - hole / 2) * ppc, (cy - hole / 2) * ppc, hole * ppc, hole * ppc, r * ppc)
      g.fill()
      // 孔口的一圈亮边，近景能看出是孔
      g.strokeStyle = shade(color, 0.05)
      g.lineWidth = 0.14 * ppc
      g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  useAnisotropy(tex)
  const mat = new THREE.MeshToonMaterial({ map: tex, color: '#ffffff', gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap, side: THREE.DoubleSide })
  meshSheetMats.set(key, mat)
  return mat
}

/** 带贴图的网布板（局部坐标：板中心在原点，正面朝 +z） */
function meshSheet(w: number, h: number, color: string) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), meshSheetMaterial(w, h, color))
  m.castShadow = true
  m.receiveShadow = true
  m.userData.noOutline = true
  return m
}

/** 人体工学网椅：网背 + 腰托 + 头枕 + T 形扶手 + 五星脚轮 */
function meshChair(p: string[]) {
  const [fab, meshC, frame] = p
  const g = G(starBase(31, 38, frame))
  g.add(rbox(22, 3, 22, INK, { y: 37 }, 1))
  g.add(rbox(50, 3, 47, frame, { y: 40, z: 1 }, 1.2))
  g.add(rbox(48, 6, 46, fab, { y: 42.5, z: 1.5 }, 2.6))
  const back = G(holePanel(46, 52, 2.4, frame, [{ kind: 'rect', x: 0, y: 3, w: 40, h: 46, r: 5 }], {}, 7))
  const sheet = meshSheet(41, 47, meshC)
  sheet.position.set(0, 2.5 + 47 / 2, 0)
  back.add(sheet)
  back.add(rbox(30, 6, 2.4, frame, { y: 12, z: 1.6 }, 1.2))
  back.add(strutBox([0, -8, -2.6], [0, 24, -2.6], 5, 2.4, frame))
  for (const s of [-1, 1]) back.add(strut([s * 6, 50, -0.6], [s * 6, 58, -0.6], 0.8, frame))
  back.add(rbox(28, 11, 5, fab, { y: 56, z: 0.6 }, 2.4))
  back.position.set(0, 47, -24)
  back.rotation.x = -0.12
  g.add(back)
  g.add(strutBox([0, 39.5, -8], [0, 39.5, -25.8], 5, 2.5, frame))
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 21, 41, -2], [s * 23, 63, -4], 3.4, 4, frame))
    g.add(rbox(7, 2.6, 24, INK, { x: s * 23, y: 63, z: -2 }, 1.2))
  }
  return g
}

/** 电竞椅：赛车座椅造型，座面侧翼、高背肩翼、安全带孔、头枕腰枕 */
function gamingChair(p: string[]) {
  const [main, accent, pillow] = p
  const g = G(starBase(34, 39, INK))
  g.add(rbox(24, 3, 24, INK, { y: 38 }, 1))
  g.add(rbox(52, 9, 50, main, { y: 41, z: 1 }, 3))
  for (const s of [-1, 1]) {
    g.add(rbox(9, 6, 48, main, { x: s * 22, y: 47, z: 1, rz: -s * 0.25 }, 3))
    g.add(rbox(3, 0.8, 42, accent, { x: s * 10, y: 49.8, z: 1 }, 0.3))
  }
  const back = G(
    holePanel(
      54,
      84,
      8,
      main,
      [
        { kind: 'rect', x: -14, y: 66, w: 5, h: 9, r: 2 },
        { kind: 'rect', x: 14, y: 66, w: 5, h: 9, r: 2 },
      ],
      {},
      14,
    ),
  )
  for (const s of [-1, 1]) {
    back.add(rbox(8, 46, 12, main, { x: s * 25, y: 2, z: 2, ry: -s * 0.35 }, 3))
    back.add(rbox(4, 56, 0.8, accent, { x: s * 14, y: 6, z: 4.2 }, 0.3))
  }
  back.add(rbox(18, 11, 7, pillow, { y: 68, z: 6 }, 3.4))
  back.add(rbox(30, 12, 8, pillow, { y: 12, z: 6 }, 3.8))
  back.position.set(0, 49, -25)
  back.rotation.x = -0.1
  g.add(back)
  g.add(strutBox([0, 39.5, -6], [0, 39.5, -27], 6, 3, INK))
  g.add(strutBox([0, 39, -27], [0, 53, -27.5], 5, 3, INK))
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 18, 40.5, -3], [s * 30, 40.5, -3], 3, 4, INK))
    g.add(strutBox([s * 30, 40, -3], [s * 30, 66, -4], 4, 4.5, INK))
    g.add(rbox(8, 3, 26, INK, { x: s * 30, y: 66, z: -2 }, 1.2))
  }
  return g
}

/** 简约办公椅：无扶手，J 形钢背杆托着小靠背 */
function taskChair(p: string[]) {
  const [fab, frame] = p
  const g = G(starBase(29, 39, frame))
  g.add(rbox(20, 3, 20, INK, { y: 38 }, 1))
  g.add(rbox(46, 3, 44, frame, { y: 40.5 }, 1.2))
  g.add(rbox(46, 6, 44, fab, { y: 43, z: 0.5 }, 2.8))
  g.add(strutBox([0, 41.5, -6], [0, 41.5, -24], 5, 2.5, frame))
  g.add(strutBox([0, 41, -24], [0, 72, -26], 5, 2.5, frame))
  g.add(rbox(42, 28, 6, fab, { y: 58, z: -22.5, rx: -0.08 }, 3))
  return g
}

/** 绘图高椅：加长气压杆 + 脚踏圈 */
function draftingChair(p: string[]) {
  const [fab, frame] = p
  const g = G(starBase(30, 64, frame))
  g.add(torus(21, 1.1, CHROME, { y: 42, rx: Math.PI / 2 }))
  g.add(cyl(4, 4, 3, INK, { y: 40.5 }, 14))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3
    g.add(strut([Math.sin(a) * 3, 42, Math.cos(a) * 3], [Math.sin(a) * 21, 42, Math.cos(a) * 21], 0.8, CHROME))
  }
  g.add(rbox(20, 3, 20, INK, { y: 63 }, 1))
  g.add(rbox(44, 3, 42, frame, { y: 65.5 }, 1.2))
  g.add(rbox(44, 6, 42, fab, { y: 68 }, 2.8))
  g.add(strutBox([0, 67, -6], [0, 67, -22], 5, 2.5, frame))
  g.add(strutBox([0, 66.5, -22], [0, 94, -24], 5, 2.5, frame))
  g.add(rbox(36, 18, 5, fab, { y: 80, z: -21.5, rx: -0.06 }, 2.4))
  return g
}

/** 跪姿椅：弧形摇脚，前倾座垫 + 膝垫 */
function kneelingChair(p: string[]) {
  const [pad, wood] = p
  const g = G()
  const ry = (z: number) => 1.8 + 4 * (z / 30) ** 2
  for (const s of [-1, 1]) {
    const x = s * 19
    g.add(tube(Array.from({ length: 9 }, (_, i): V3 => [x, ry(-30 + i * 7.5), -30 + i * 7.5]), 1.8, wood, TUBE))
    g.add(strutBox([x, ry(-14), -14], [x, 52, 2], 3, 5, wood))
    g.add(strutBox([x, ry(12), 12], [x, 30, 18], 3, 4.5, wood))
  }
  g.add(strut([-19, ry(-14), -14], [19, ry(-14), -14], 1.4, wood))
  g.add(strut([-19, ry(12), 12], [19, ry(12), 12], 1.4, wood))
  g.add(strut([-19, 51, 1.5], [19, 51, 1.5], 1.4, wood))
  g.add(rbox(44, 7, 34, pad, { y: 51.5, z: 1, rx: 0.28 }, 3))
  g.add(rbox(44, 6, 18, pad, { y: 29, z: 19, rx: -0.5 }, 3))
  return g
}

/** 平衡球椅：脚轮架托住瑜伽球，背后一根小靠背 */
function ballSeat(p: string[]) {
  const [ballC, frame] = p
  const g = G(torus(20, 1.4, frame, { y: 14, rx: Math.PI / 2 }))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 14.1
      const z = sz * 14.1
      g.add(strut([sx * 18, 5.5, sz * 18], [x, 14, z], 1.2, frame))
      g.add(ball(2.6, INK, { x: sx * 18, y: 2.6, z: sz * 18 }))
    }
  g.add(ball(26, ballC, { y: 30.6 }))
  for (const s of [-1, 1])
    g.add(
      tube([
          [s * 10, 14, -17.3],
          [s * 10, 16, -24],
          [s * 10, 30, -29],
          [s * 10, 48, -28.5],
        ], 1.1, frame, TUBE),
    )
  g.add(rbox(28, 9, 3, frame, { y: 42, z: -29.5, rx: 0.08 }, 1.4))
  return g
}

// ---------- 休闲 ----------

/** 贵妃椅：一头高起的卷枕扶手，半截靠背，配圆柱抱枕 */
function chaise(p: string[]) {
  const [fab, bolster, wood] = p
  const g = G()
  for (const x of [-72, 0, 72]) for (const z of [-26, 26]) g.add(cyl(2.2, 1.6, 12, wood, { x, z }, 12))
  g.add(rbox(160, 16, 64, fab, { y: 12 }, 5))
  g.add(rbox(132, 9, 56, fab, { x: 12, y: 26, z: 2 }, 4))
  g.add(rbox(24, 30, 64, fab, { x: -68, y: 26 }, 8))
  g.add(cyl(11, 11, 64, fab, { x: -66, y: 56 - 32, rx: Math.PI / 2 }, 24))
  g.add(rbox(96, 30, 12, fab, { x: -22, y: 26, z: -26, rx: -0.12 }, 6))
  g.add(cyl(8, 8, 40, bolster, { x: -47, y: 43 - 20, z: 2, rx: Math.PI / 2 }, 20))
  return g
}

/** 蛋椅：蛋壳形高背包住头肩，前面敞开，四星旋转脚 */
const EGG_BOWL = strip(
  [
    [0, 38],
    [16, 38.6],
    [28, 41],
    [36, 46],
    [39.5, 51],
  ],
  3,
)
const EGG_BACK = strip(
  [
    [39, 47],
    [42.5, 60],
    [43.5, 76],
    [40, 92],
    [31, 105],
    [17, 112],
    [0, 114.4],
  ],
  3,
)
function eggChair(p: string[]) {
  const [shellC, cushion, base] = p
  const g = G(revolve(EGG_BOWL, shellC), revolve(EGG_BACK, shellC, Math.PI - 1.9, 3.8, 48))
  g.add(puck(26, 7, cushion, { y: 41, z: 2 }))
  g.add(ball(22, cushion, { y: 72, z: -29 }, [1.1, 1.2, 0.35]))
  g.add(cyl(5, 6, 4, base, { y: 1.5 }, 16), cyl(3, 3, 34, base, { y: 4 }, 14))
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    g.add(strutBox([0, 3.5, 0], [Math.sin(a) * 32, 2.6, Math.cos(a) * 32], 3.4, 3.4, base))
    g.add(puck(2.4, 1.5, INK, { x: Math.sin(a) * 32, z: Math.cos(a) * 32 }))
  }
  return g
}

/** 球椅：球壳挖去前脸，内衬软垫，喇叭底座 */
const BALL_SHELL = strip(arcLine(50, 0, 2.2), 3)
const BALL_LINER = strip(arcLine(47.6, 0, 2.15), 1.6)
function ballChair(p: string[]) {
  const [shellC, liner, base] = p
  const yc = 59.5
  const g = G(cyl(9, 30, 9, base, {}, 32))
  for (const [poly, c] of [
    [BALL_SHELL, shellC],
    [BALL_LINER, liner],
  ] as const) {
    const m = revolve(poly, c, 0, Math.PI * 2, 40)
    m.rotation.x = Math.PI / 2
    m.position.y = yc
    g.add(m)
  }
  g.add(ball(30, liner, { y: yc - 34 }, [1, 0.4, 1]))
  g.add(ball(22, liner, { y: yc - 5, z: -36 }, [1, 1, 0.4]))
  return g
}

/** 蝴蝶椅（BKF）：两只交叉铁架撑起四角，皮面兜在上面 */
const BKF = strip(
  [
    [31, 62],
    [24, 50],
    [14, 38],
    [2, 31],
    [-10, 34],
    [-20, 48],
    [-26, 66],
    [-30, 88],
  ],
  0.8,
)
function butterfly(p: string[]) {
  const [leather, frame] = p
  const g = G(extrudeX(BKF, 68, leather, { steps: 12, flare: (y) => 0.72 + 0.28 * Math.min(1, Math.max(0, (y - 31) / 28)) }))
  g.add(strut([-34, 62, 31], [34, 62, 31], 0.8, frame))
  g.add(strut([-34, 88, -30], [34, 88, -30], 0.8, frame))
  for (const s of [-1, 1]) {
    g.add(strut([s * 34, 62, 31], [s * 32, 0.8, -14], 0.8, frame))
    g.add(strut([s * 34, 88, -30], [s * 32, 0.8, 16], 0.8, frame))
    g.add(strut([s * 32, 0.8, -14], [s * 32, 0.8, 16], 0.8, frame))
    for (const [y, z] of [
      [62, 31],
      [88, -30],
      [0.8, -14],
      [0.8, 16],
    ])
      g.add(ball(0.8, frame, { x: s * (y > 1 ? 34 : 32), y, z }))
  }
  return g
}

/** 巴塞罗那椅：X 形扁钢腿，方格绗缝皮垫 */
function barcelona(p: string[]) {
  const [leather, frame] = p
  const g = G()
  for (const s of [-1, 1]) {
    const x = s * 35
    g.add(
      tube([
          [x, 1.3, 32],
          [x, 14, 18],
          [x, 26, 0],
          [x, 34, -16],
          [x, 44, -24],
          [x, 60, -29],
          [x, 78, -34],
        ], 1.3, frame, TUBE),
    )
    g.add(
      tube([
          [x, 1.3, -32],
          [x, 14, -20],
          [x, 26, -4],
          [x, 34, 14],
          [x, 37, 30],
        ], 1.3, frame, TUBE),
    )
  }
  g.add(strut([-35, 44, -24], [35, 44, -24], 1.1, frame))
  g.add(strut([-35, 78, -34], [35, 78, -34], 1.1, frame))
  g.add(strut([-35, 34, 14], [35, 34, 14], 1.1, frame))
  g.add(strut([-35, 37, 30], [35, 37, 30], 1.1, frame))
  const seat = tufted(68, 10, 54, 3, 4, leather)
  seat.position.set(0, 34, 4)
  seat.rotation.x = -0.08
  g.add(seat)
  const pad = tufted(68, 10, 40, 3, 3, leather)
  pad.rotation.x = Math.PI / 2
  pad.position.set(0, 20, 0)
  const back = G(pad)
  back.position.set(0, 43, -23.5)
  back.rotation.x = -0.29
  g.add(back)
  return g
}

/** 躺椅（伊姆斯风）：胶合板壳 + 皮垫，低矮旋转星脚；withOttoman 时前面配一只脚凳 */
function loungeChair(withOttoman: boolean, p: string[]) {
  const [leather, ply, base] = p
  const g = G(cyl(5, 6, 6, base, { y: 2 }, 16), cyl(3, 3, 16, base, { y: 8 }, 14))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.add(strutBox([0, 5, 0], [Math.sin(a) * 34, 2.6, Math.cos(a) * 34], 3.6, 3.6, base))
    g.add(puck(2.4, 1.5, INK, { x: Math.sin(a) * 34, z: Math.cos(a) * 34 }))
  }
  const seat = G(rbox(70, 4, 62, ply, {}, 1.5), rbox(62, 10, 56, leather, { y: 3, z: 2 }, 4.5))
  seat.position.set(0, 24, 4)
  seat.rotation.x = -0.1
  g.add(seat)
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 31, 25, -6], [s * 31, 45, -8], 3, 5, ply))
    const arm = rbox(10, 5, 42, leather, { x: s * 31, y: 44, z: 0, rx: -0.08 }, 2.5)
    g.add(arm)
  }
  const back = G(rbox(66, 44, 4, ply, { z: -2 }, 1.5), rbox(60, 40, 10, leather, { y: 2, z: 3 }, 4.5))
  back.position.set(0, 27, -26)
  back.rotation.x = -0.38
  g.add(back)
  const head = G(rbox(60, 24, 4, ply, { z: -2 }, 1.5), rbox(54, 22, 9, leather, { y: 1, z: 2.5 }, 4))
  head.position.set(0, 27 + 46 * Math.cos(0.38), -26 - 46 * Math.sin(0.38))
  head.rotation.x = -0.25
  g.add(head)
  // 背后两根铝脊条把头枕连到靠背上（以前头枕和靠背之间隔着 1.6cm，头枕悬空）
  for (const s of [-1, 1]) back.add(rbox(4, 24, 2.4, base, { x: s * 18, y: 28, z: -4.2 }, 0.8))
  g.add(strutBox([0, 24, -14], [0, 36, -28.5], 6, 2.2, base))
  if (withOttoman) {
    const z0 = 72
    g.add(cyl(4, 5, 4, base, { y: 2, z: z0 }, 14), cyl(2.6, 2.6, 18, base, { y: 6, z: z0 }, 12))
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2
      g.add(strutBox([0, 4, z0], [Math.sin(a) * 24, 2.6, z0 + Math.cos(a) * 24], 3.4, 3.4, base))
      g.add(puck(2.2, 1.5, INK, { x: Math.sin(a) * 24, z: z0 + Math.cos(a) * 24 }))
    }
    const ott = G(rbox(56, 4, 46, ply, {}, 1.5), rbox(52, 10, 42, leather, { y: 3 }, 4.5))
    ott.position.set(0, 23.5, z0)
    ott.rotation.x = 0.05
    g.add(ott)
  }
  return g
}

// ---------- 和式 ----------

/** 高背座椅子：无腿、加厚坐垫、扶手、可后仰的高靠背 */
function highZaisu(p: string[]) {
  const [fab, frame] = p
  const dk = shade(frame, -0.1)
  const g = G(rbox(52, 3, 50, dk, { z: 4 }, 1.2))
  g.add(rbox(52, 10, 48, fab, { y: 2.5, z: 5 }, 4))
  for (const s of [-1, 1]) g.add(rbox(9, 15, 42, fab, { x: s * 25.5, y: 2.5, z: 4 }, 4))
  const back = G(rbox(50, 64, 10, fab, {}, 4.5), rbox(48, 60, 2, dk, { y: 2, z: -5.6 }, 0.8), rbox(44, 13, 6, fab, { y: 50, z: 6 }, 3))
  back.position.set(0, 5, -17)
  back.rotation.x = -0.32
  g.add(back)
  for (const s of [-1, 1]) g.add(cyl(3, 3, 1, frame, { x: s * 26, y: 7.5, z: -16, rz: Math.PI / 2 }, 16))
  return g
}

/** 正座椅子：跪坐时垫在臀下的小矮凳，前低后高 */
function seizaChair(p: string[]) {
  const [wood, cushion] = p
  const g = G(rbox(36, 2.5, 18, wood, { y: 14, rx: 0.08 }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(2.5, 14.7, 16, wood, { x: s * 14 }, 0.6))
  g.add(rbox(32, 3, 16, cushion, { y: 16.3, rx: 0.08 }, 1.2))
  return g
}

// ---------- 凳子 ----------

/** 小板凳：两片外撇板腿 + 横撑 */
function plankStool(p: string[]) {
  const [wood] = p
  const dk = shade(wood, -0.08)
  const g = G(rbox(34, 3.5, 16, wood, { y: 22 }, 1))
  for (const s of [-1, 1]) g.add(strutBox([s * 14, 0, 0], [s * 11, 22.5, 0], 2.5, 12, dk))
  g.add(rbox(26.8, 3, 2.5, dk, { y: 7 }, 0.6))
  return g
}

/** 方凳：四腿 + 牙板 + 低横撑，顶面可以摆东西 */
function squareStool(p: string[]) {
  const [top, frame] = p
  const g = G(rbox(34, 3, 34, top, { y: 43 }, 1), legs(30, 30, 43, frame, 1.8, 3, false))
  for (const s of [-1, 1]) {
    g.add(rbox(24, 6, 2, frame, { y: 37, z: s * 12 }, 0.6), rbox(2, 6, 24, frame, { x: s * 12, y: 37 }, 0.6))
    g.add(rbox(24, 2, 2, frame, { y: 12, z: s * 12 }, 0.5))
  }
  return g
}

/** 两步梯凳：L 形侧板 + 两级踏板 */
function stepStool(p: string[]) {
  const [step, side] = p
  const poly: V2[] = [
    [-18, 0],
    [18, 0],
    [18, 23],
    [2, 23],
    [2, 47],
    [-18, 47],
  ]
  const g = G()
  for (const s of [-1, 1]) {
    const m = extrudeX(poly, 2, side)
    m.position.x = s * 19
    g.add(m)
  }
  g.add(rbox(42, 2.5, 22, step, { y: 47, z: -8 }, 0.8))
  g.add(rbox(42, 2.5, 18, step, { y: 23, z: 10 }, 0.8))
  g.add(rbox(36, 8, 2, side, { y: 2, z: 17 }, 0.6), rbox(36, 8, 2, side, { y: 2, z: -17 }, 0.6))
  return g
}

/** 三脚凳（阿尔托 Stool 60 风）：圆座 + L 形弯木腿 */
function stool60(p: string[]) {
  const [top, leg] = p
  const g = G(puck(17.5, 4, top, { y: 40 }))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI
    const pt = (r: number, y: number): V3 => [r * Math.sin(a), y, r * Math.cos(a)]
    g.add(tube([pt(14.5, 0), pt(14.5, 30), pt(14, 36), pt(12, 39), pt(8.5, 40.8)], 1.7, leg, TUBE))
  }
  return g
}

/** 蘑菇凳：粗柄 + 圆顶伞盖，盖上一圈圆点 */
function mushroomStool(p: string[]) {
  const [cap, stem, dot] = p
  const g = G(cyl(8, 10, 26, stem, {}, 24))
  const a = 20
  const b = 11
  const yc = 30
  g.add(ball(a, cap, { y: yc }, [1, b / a, 1]))
  const pts: [number, number][] = [[0, 0]]
  for (let i = 0; i < 6; i++) pts.push([0.75, (i / 6) * Math.PI * 2])
  for (let i = 0; i < 9; i++) pts.push([1.25, (i / 9) * Math.PI * 2 + 0.3])
  for (const [th, ph] of pts) {
    const x = a * Math.sin(th) * Math.cos(ph)
    const z = a * Math.sin(th) * Math.sin(ph)
    const y = yc + b * Math.cos(th)
    const n = new THREE.Vector3(x / (a * a), (y - yc) / (b * b), z / (a * a)).normalize()
    const d = ball(2.6, dot, { x: x - n.x * 0.3, y: y - n.y * 0.3, z: z - n.z * 0.3 }, [1, 0.35, 1])
    d.quaternion.setFromUnitVectors(UP, n)
    g.add(d)
  }
  return g
}

/** 旋转吧凳：圆底盘 + 气压升降杆 + 脚踏圈 + 圆座 */
function swivelStool(sh: number, p: string[]) {
  const [seat, frame] = p
  const g = G(puck(22, 2.5, frame), cyl(3.4, 4.4, 6, frame, { y: 2 }, 16))
  g.add(cyl(3.6, 3.6, 16, frame, { y: 4 }, 16), cyl(2.6, 2.6, sh - 12, CHROME, { y: 6 }, 14))
  const fy = sh - 46
  g.add(torus(16, 1, CHROME, { y: fy, rx: Math.PI / 2 }))
  g.add(cyl(4.2, 4.2, 3, INK, { y: fy - 1.5 }, 14))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    g.add(strut([Math.sin(a) * 3.5, fy, Math.cos(a) * 3.5], [Math.sin(a) * 16, fy, Math.cos(a) * 16], 0.8, CHROME))
  }
  g.add(cyl(8, 6, 4, frame, { y: sh - 10 }, 16))
  g.add(puck(19, 3, frame, { y: sh - 7 }))
  g.add(puck(19, 6, seat, { y: sh - 6 }))
  return g
}

/** 马扎：两只 U 形框交叉成 X，中间兜一块布；open = 撑开，否则收拢 */
function mazha(open: boolean, p: string[]) {
  const [fab, frame] = p
  const dk = shade(frame, -0.08)
  const g = G()
  if (open) {
    for (const s of [-1, 1]) {
      g.add(strut([s * 15, 0.9, 12], [s * 15, 28, -10], 0.9, frame))
      g.add(strut([s * 12.6, 0.9, -12], [s * 12.6, 28, 10], 0.9, frame))
      g.add(cyl(1.2, 1.2, 1.2, dk, { x: s * 14.4, y: 14.9 - 0.6, z: 0.4, rz: Math.PI / 2 }, 10))
    }
    g.add(strut([-15.9, 28, -10], [15.9, 28, -10], 0.9, dk), strut([-13.5, 28, 10], [13.5, 28, 10], 0.9, dk))
    g.add(strut([-15.9, 0.9, 12], [15.9, 0.9, 12], 0.9, dk), strut([-13.5, 0.9, -12], [13.5, 0.9, -12], 0.9, dk))
    g.add(
      extrudeX(
        strip(
          [
            [-10, 28.6],
            [0, 26.4],
            [10, 28.6],
          ],
          0.6,
          16,
        ),
        24,
        fab,
      ),
    )
  } else {
    for (const s of [-1, 1]) {
      g.add(strut([s * 15, 0.9, -1.5], [s * 15, 35, -1.5], 0.9, frame))
      g.add(strut([s * 12.6, 0.9, 1.5], [s * 12.6, 35, 1.5], 0.9, frame))
    }
    g.add(strut([-15.9, 35, -1.5], [15.9, 35, -1.5], 0.9, dk), strut([-13.5, 35, 1.5], [13.5, 35, 1.5], 0.9, dk))
    g.add(strut([-15.9, 0.9, -1.5], [15.9, 0.9, -1.5], 0.9, dk), strut([-13.5, 0.9, 1.5], [13.5, 0.9, 1.5], 0.9, dk))
    g.add(
      extrudeX(
        strip(
          [
            [-1.5, 35.4],
            [-0.9, 26],
            [0, 23.5],
            [0.9, 26],
            [1.5, 35.4],
          ],
          0.5,
          24,
        ),
        22,
        fab,
      ),
    )
  }
  return g
}

/** 浴室凳（风吕椅）：U 形缺口座面 + 带提手孔的侧板 */
function bathStool(p: string[]) {
  const [main] = p
  const dk = shade(main, -0.06)
  const seat: V2[] = [
    [-18, -13],
    [18, -13],
    [18, 13],
    [4.5, 13],
    [4.5, 5],
    [-4.5, 5],
    [-4.5, 13],
    [-18, 13],
  ]
  const g = G(slab(seat, 3, main, 26))
  for (const s of [-1, 1]) g.add(holePanel(24, 26.2, 1.8, dk, [{ kind: 'arch', x: 0, y: 4, w: 12, h: 13 }], { x: s * 14.5, ry: Math.PI / 2 }, 3))
  return g
}

// ---------- 儿童 ----------

/** 儿童高脚餐椅（成长椅）：斜立侧梁 + 可调座板和脚踏板 */
function highChair(p: string[]) {
  const [wood, cushion] = p
  const g = G()
  const uz = (y: number) => 26 - (46 * y) / 79
  for (const s of [-1, 1]) {
    const x = s * 21
    g.add(strutBox([x, 1.5, -24], [x, 1.5, 30], 2.6, 3, wood))
    g.add(strutBox([x, 0, 26], [x, 79, -20], 2.6, 6, wood))
  }
  g.add(rbox(44.6, 3, 3, wood, { z: -22 }, 0.8))
  g.add(rbox(40, 2, 25, wood, { y: 47, z: 12.5 }, 0.8))
  g.add(rbox(40, 2, 18, wood, { y: 23, z: 23 }, 0.8))
  g.add(rbox(40, 6, 2, wood, { y: 63, z: uz(66) }, 0.8))
  g.add(rbox(40, 5, 2, wood, { y: 72, z: uz(74.5) }, 0.8))
  g.add(rbox(34, 2.5, 22, cushion, { y: 49, z: 12 }, 1))
  return g
}

/** 动物靠背小椅：圆形「头」靠背 + 耳朵（不画脸） */
function animalChair(kind: 'bear' | 'bunny' | 'cat', p: string[]) {
  const [main, sub, wood] = p
  const g = G(legs(28, 26, 26, wood, 1.6, 3.5))
  g.add(rbox(32, 3, 30, wood, { y: 26 }, 1.2))
  g.add(rbox(28, 3, 26, sub, { y: 28.8, z: 1 }, 1.4))
  for (const s of [-1, 1]) g.add(strut([s * 9, 28, -12.8], [s * 9, 38, -13], 1.2, wood))
  g.add(puck(16, 3, main, { y: 46.5, z: -13, rx: Math.PI / 2 }))
  for (const s of [-1, 1]) {
    if (kind === 'bear') {
      const x = s * 11.3
      const y = 59.3
      g.add(puck(5.5, 3, main, { x, y: y - 1.5, z: -13.4, rx: Math.PI / 2 }))
      g.add(puck(3.2, 1.2, sub, { x, y: y - 0.6, z: -11.4, rx: Math.PI / 2 }))
    } else if (kind === 'bunny') {
      const ear = capsule(3.6, 12, main, { x: s * 6, y: 58, z: -13.3, rz: -s * 0.12 })
      ear.scale.z = 0.45
      const inner = capsule(1.8, 9, sub, { x: s * 6.2, y: 60.5, z: -11.6, rz: -s * 0.12 })
      inner.scale.z = 0.3
      g.add(ear, inner)
    } else {
      const ear = cyl(0.3, 7, 11, main, { x: s * 10, y: 57, z: -13, rz: -s * 0.4 }, 4)
      ear.scale.z = 0.45
      g.add(ear)
    }
  }
  return g
}

// ---------- 户外 ----------

/** 沙滩折叠椅：两副木框交叉，帆布兜在顶梁和前梁之间 */
function deckChair(p: string[]) {
  const [canvas, wood] = p
  const g = G()
  const az = (y: number) => 32 - (62 * y) / 92
  const bz = (y: number) => -40 + (62 * y) / 42
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 27, 0, 32], [s * 27, 92, -30], 2.4, 4, wood))
    g.add(strutBox([s * 24, 0, -40], [s * 24, 42, 22], 2.4, 4, wood))
    g.add(strut([s * 22.6, 33.5, 9.4], [s * 28.6, 33.5, 9.4], 0.7, INK))
  }
  g.add(strut([-28.5, 92, -30], [28.5, 92, -30], 1.6, wood))
  g.add(strut([-25.5, 42, 22], [25.5, 42, 22], 1.6, wood))
  g.add(strut([-25.5, 10, bz(10)], [25.5, 10, bz(10)], 1.4, wood))
  g.add(strut([-28.5, 10, az(10)], [28.5, 10, az(10)], 1.4, wood))
  g.add(
    extrudeX(
      strip(
        [
          [-30, 90.6],
          [-16, 64],
          [-2, 45],
          [10, 38.5],
          [18, 39.5],
          [22.5, 43.4],
        ],
        0.6,
      ),
      44,
      canvas,
    ),
  )
  return g
}

/** 落地秋千椅：A 字钢架 + 吊着的双人长椅 */
function swingBench(p: string[]) {
  const [cushion, wood, frame] = p
  const g = G()
  const H = 182
  for (const s of [-1, 1]) {
    for (const z of [-46, 46]) g.add(strut([s * 84, 1, z], [s * 80, H - 2, 0], 2.2, frame))
    g.add(strut([s * 84, 1, -46], [s * 84, 1, 46], 1.6, frame))
    g.add(ball(2.2, frame, { x: s * 84, y: 1.6, z: -46 }), ball(2.2, frame, { x: s * 84, y: 1.6, z: 46 }))
    g.add(strut([s * 83.1, 40, -35.8], [s * 83.1, 40, 35.8], 1.2, frame))
  }
  g.add(strut([-83, H, 0], [83, H, 0], 3, frame))
  g.add(rbox(124, 4, 50, wood, { y: 44, z: 2 }, 1.2))
  g.add(rbox(124, 40, 4, wood, { y: 48, z: -22, rx: -0.2 }, 1.2))
  for (const s of [-1, 1]) g.add(rbox(4, 20, 46, wood, { x: s * 62, y: 48 }, 1))
  g.add(rbox(116, 7, 44, cushion, { y: 48, z: 3 }, 3))
  g.add(rbox(116, 30, 7, cushion, { y: 54, z: -18, rx: -0.2 }, 3))
  for (const s of [-1, 1]) {
    g.add(strut([s * 58, H - 3, 0], [s * 61, 67.5, 21], 0.45, INK, 0.45, 6))
    g.add(strut([s * 58, H - 3, 0], [s * 60, 86, -25.5], 0.45, INK, 0.45, 6))
  }
  return g
}

/** 阳台小椅（法式小酒馆折叠椅）：细铁管框 + 木条座面和弯背条 */
function bistroChair(p: string[]) {
  const [slat, metal] = p
  const g = G()
  const pz = (y: number) => (y < 66 ? -16 - ((y - 44) / 22) * 1 : -17 - ((y - 66) / 18) * 3)
  for (const s of [-1, 1]) {
    g.add(strut([s * 20, 0, 18], [s * 19.2, 44, 14], 1.1, metal))
    g.add(
      cappedTube([
          [s * 20, 0, -20],
          [s * 19.2, 44, -16],
          [s * 19, 66, -17],
          [s * 18.5, 84, -20],
        ], 1.1, metal, TUBE),
    )
    g.add(strut([s * 19.2, 43.5, -16.5], [s * 19.2, 43.5, 16], 1, metal))
    g.add(strut([s * 19.6, 16, 16.8], [s * 19.6, 34, -17.4], 0.7, metal))
  }
  for (let i = 0; i < 6; i++) g.add(rbox(40, 1.8, 4.6, slat, { y: 44.4, z: -14 + i * 5.6 }, 0.8))
  for (const y of [60, 68, 76]) {
    const w = arcWall(30, 1.6, 0.68, 5, slat)
    w.position.set(0, y, pz(y + 2.5) - 6.9)
    g.add(w)
  }
  return g
}

/** 导演椅：前后 X 形木腿，帆布座面和靠背带 */
function directorChair(p: string[]) {
  const [canvas, wood] = p
  const g = G()
  const zF = 19
  const zB = -19
  for (const z of [zF, zB]) {
    g.add(strutBox([-24, 0, z], [22, 44, z], 2.8, 2.4, wood), strutBox([24, 0, z], [-22, 44, z], 2.8, 2.4, wood))
    g.add(cyl(1, 1, 3.4, INK, { y: 21.1 - 1.7, z: z - 0, rx: Math.PI / 2 }, 10))
  }
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 22.5, 44, zB - 1.5], [s * 22.5, 44, zF + 1.5], 3, 3, wood))
    g.add(strutBox([s * 24, 1.4, zB - 1.5], [s * 24, 1.4, zF + 1.5], 2.6, 2.8, wood))
    g.add(strutBox([s * 23, 44, zF], [s * 23, 66, zF], 2.6, 2.6, wood))
    g.add(strutBox([s * 23, 44, zB], [s * 23, 88, zB - 2], 2.6, 2.6, wood))
    g.add(rbox(5, 2.4, 44, wood, { x: s * 23, y: 66, z: 0 }, 0.8))
  }
  const sling = extrudeX(
    strip(
      [
        [-22, 45.6],
        [0, 43.6],
        [22, 45.6],
      ],
      0.6,
      20,
    ),
    38,
    canvas,
  )
  sling.rotation.y = Math.PI / 2
  g.add(sling)
  g.add(rbox(48, 18, 0.8, canvas, { y: 68, z: -20.1 }, 0.3))
  return g
}

// ---------- 配色 ----------

/** 木椅：[木, 坐垫布, 点缀] */
const WOOD_PAL = pal(
  ['nordic', [N.oak, N.gray, N.white]],
  ['nordic', [N.white, N.sage, N.oak]],
  ['retro', [R.caramel, R.mustard, R.cream]],
  ['japanese', [J.wood, J.ai, J.washi]],
  ['cute', [C.woodL, C.pink, C.white]],
  ['modern', [M.walnut, M.char, M.black]],
  ['farmhouse', ['#2f2d2b', '#b5443a', '#c99a63']],
  ['farmhouse', ['#c99a63', '#9caf8f', '#f2ede2']],
)
/** Y 椅：[木, 纸绳] */
const WISH_PAL = pal(
  ['nordic', [N.oak, N.linen]],
  ['nordic', [N.white, N.linen]],
  ['japanese', [J.hinoki, J.washi]],
  ['modern', [M.black, J.hinoki]],
  ['retro', [R.caramel, R.cream]],
)
/** 壳椅：[壳, 木腿, 金属] */
const SHELL_PAL = pal(
  ['nordic', [N.white, N.oak, CHROME]],
  ['nordic', [N.sage, N.oakL, CHROME]],
  ['cute', [C.sakura, C.woodL, CHROME]],
  ['cute', [C.lemon, C.wood, M.white]],
  ['modern', [M.black, M.walnut, M.black]],
  ['retro', [R.mustard, R.caramel, M.char]],
)
/** 胶合板：单一木色 */
const PLY_PAL = pal(['nordic', [N.oak]], ['nordic', [N.oakL]], ['modern', [M.walnut]], ['modern', [M.black]], ['retro', [R.caramel]], ['cute', [C.wood]])
/** 铁皮椅：单一漆色 */
const TOLIX_PAL = pal(['industrial', [I.iron]], ['industrial', [I.steel]], ['industrial', [I.rust]], ['retro', [R.red]], ['retro', [R.teal]], ['cute', [C.mint]])
/** Panton：单一塑料色 */
const PANTON_PAL = pal(['modern', [M.white]], ['modern', [M.black]], ['retro', [R.red]], ['retro', [R.orange]], ['cute', [C.lemon]], ['cute', [C.pink]])
/** 圈椅：[木, 坐垫] */
const QUANYI_PAL = pal(['japanese', ['#7a3b2a', J.shu]], ['japanese', [J.dark, J.ai]], ['japanese', [J.wood, J.tatami]], ['retro', [R.caramel, R.red]], ['nordic', [N.oak, N.linen]], ['chinese', ['#6b2f22', '#c9a66b']], ['chinese', ['#b9773f', '#9fbfa8']])
/** 藤编悬臂椅：[藤, 木框, 管] */
const CANE_PAL = pal(
  ['modern', [J.hinoki, M.black, CHROME]],
  ['nordic', [N.linen, N.oak, CHROME]],
  ['retro', [R.cream, R.caramel, CHROME]],
  ['industrial', [J.hinoki, I.walnut, I.iron]],
  ['japanese', [J.washi, J.dark, M.char]],
)
/** 软包：[布, 木 / 框, 点缀] */
const SOFT_PAL = pal(
  ['nordic', [N.gray, N.oak, N.white]],
  ['nordic', [N.sage, N.oakL, N.white]],
  ['modern', [M.char, M.black, M.silver]],
  ['cute', [C.pink, C.woodL, C.white]],
  ['retro', [R.teal, R.caramel, R.mustard]],
  ['industrial', [I.leather, I.iron, I.steel]],
)
/** 折叠椅（金属）：[座背, 管] */
const FOLD_METAL_PAL = pal(['modern', [M.char, CHROME]], ['modern', [M.white, M.black]], ['industrial', [I.iron, I.steel]], ['retro', [R.mustard, R.cream]], ['cute', [C.sky, M.white]])
/** 折叠椅（木）：[条板, 框] */
const FOLD_WOOD_PAL = pal(['nordic', [N.oakL, N.oak]], ['nordic', [N.white, N.white]], ['japanese', [J.hinoki, J.wood]], ['industrial', [I.walnut, I.iron]], ['retro', [R.cream, R.teal]])
/** 办公椅：[座布, 网面, 框] */
const OFFICE_PAL = pal(
  ['modern', [M.char, M.black, M.black]],
  ['modern', [M.light, M.gray, M.white]],
  ['nordic', [N.blue, N.gray, N.white]],
  ['cute', [C.pink, C.sakura, M.white]],
  ['industrial', [I.leather, I.iron, I.iron]],
)
/** 电竞椅：[主色, 撞色条, 枕] */
const GAMING_PAL = pal(
  ['modern', [M.black, R.red, M.black]],
  ['modern', [M.black, J.ai, M.char]],
  ['modern', [M.char, C.mint, M.white]],
  ['cute', [M.white, C.pink, C.pink]],
  ['cute', [C.lilac, M.white, C.sky]],
)
/** [布, 框] 的简洁椅 */
const TASK_PAL = pal(['modern', [M.char, M.black]], ['modern', [M.light, M.white]], ['nordic', [N.sage, N.white]], ['cute', [C.sky, M.white]], ['retro', [R.mustard, M.char]])
/** 皮 / 布 + 金属框 的休闲椅：[面, 框] */
const LOUNGE_PAL = pal(['modern', [M.black, CHROME]], ['modern', [M.white, CHROME]], ['industrial', [I.leather, I.iron]], ['retro', [R.caramel, M.char]], ['nordic', [N.linen, N.oak]])
/** 贵妃椅：[布, 抱枕, 木腿] */
const CHAISE_PAL = pal(
  ['nordic', [N.linen, N.sage, N.oak]],
  ['modern', [M.char, M.light, M.black]],
  ['retro', [R.teal, R.mustard, R.caramel]],
  ['cute', [C.sakura, C.white, C.woodL]],
  ['industrial', [I.leather, I.concrete, I.iron]],
)
/** 蛋椅 / 球椅：[壳, 垫, 底座] */
const EGG_PAL = pal(
  ['modern', [M.white, M.char, CHROME]],
  ['modern', [M.black, M.light, CHROME]],
  ['retro', [R.orange, R.cream, CHROME]],
  ['retro', [R.red, R.red, M.white]],
  ['cute', [C.lemon, C.white, M.white]],
  ['nordic', [N.gray, N.linen, CHROME]],
)
/** 躺椅：[皮, 胶合板, 底座] */
const EAMES_PAL = pal(['modern', [M.black, M.walnut, M.black]], ['modern', [M.white, M.walnut, CHROME]], ['industrial', [I.leather, I.walnut, I.iron]], ['retro', [R.caramel, R.caramel, M.char]], ['nordic', [N.gray, N.oak, CHROME]])
/** 和式软座：[布, 框] */
const ZAISU_PAL = pal(['japanese', [J.ai, J.dark]], ['japanese', [J.tatami, J.wood]], ['japanese', [J.shu, J.sumi]], ['cute', [C.pink, C.woodL]], ['nordic', [N.gray, N.oak]], ['modern', [M.char, M.black]])
/** 正座椅子：[木, 坐垫] */
const SEIZA_PAL = pal(['japanese', [J.hinoki, J.ai]], ['japanese', [J.dark, J.shu]], ['japanese', [J.wood, J.tatami]], ['nordic', [N.oak, N.gray]], ['cute', [C.woodL, C.pink]])
/** 单色木作 */
const WOODS = pal(['nordic', [N.oak, N.oak]], ['nordic', [N.white, N.oakL]], ['japanese', [J.hinoki, J.wood]], ['retro', [R.caramel, R.caramel]], ['cute', [C.woodL, C.wood]], ['modern', [M.black, M.walnut]])
/** [顶面, 框] 的凳子 */
const STOOL_PAL = pal(['nordic', [N.oak, N.white]], ['japanese', [J.hinoki, J.dark]], ['industrial', [I.walnut, I.iron]], ['retro', [R.mustard, R.caramel]], ['cute', [C.mint, C.white]], ['modern', [M.white, M.black]])
/** 蘑菇凳：[伞盖, 柄, 圆点] */
const MUSHROOM_PAL = pal(['cute', [C.red, C.cream, C.white]], ['cute', [C.pink, C.white, C.white]], ['cute', [C.lemon, C.cream, C.white]], ['retro', [R.orange, R.cream, R.cream]], ['nordic', [N.mustard, N.white, N.white]])
/** 吧凳：[座, 框] */
const BAR_PAL = pal(['modern', [M.black, M.black]], ['modern', [M.white, CHROME]], ['industrial', [I.leather, I.iron]], ['retro', [R.red, CHROME]], ['retro', [R.teal, CHROME]], ['cute', [C.pink, M.white]])
/** 布 + 框（马扎、导演椅、沙滩椅）：[布, 框] */
const CANVAS_PAL = pal(['nordic', [N.linen, N.oak]], ['nordic', [N.blue, N.white]], ['industrial', [I.concrete, I.walnut]], ['retro', [R.orange, R.caramel]], ['cute', [C.sky, C.woodL]], ['japanese', [J.ai, J.wood]])
/** 浴室凳：单色 */
const BATH_PAL = pal(['cute', [C.white]], ['cute', [C.sakura]], ['cute', [C.sky]], ['japanese', [J.hinoki]], ['modern', [M.char]], ['modern', [M.light]])
/** 儿童：[木 / 主色, 坐垫] */
const KID_PAL = pal(['cute', [C.white, C.pink]], ['cute', [C.woodL, C.sky]], ['cute', [C.mint, C.lemon]], ['nordic', [N.oak, N.gray]], ['nordic', [N.white, N.sage]], ['modern', [M.char, M.light]])
/** 动物椅：[头, 内耳 / 坐垫, 木] */
const ANIMAL_PAL = pal(['cute', [C.peach, C.pink, C.woodL]], ['cute', [C.white, C.sakura, C.wood]], ['cute', ['#c99a6e', C.cream, C.woodL]], ['cute', [C.sky, C.white, C.white]], ['nordic', [N.gray, N.linen, N.oak]])
/** 秋千：[坐垫, 木, 钢架] */
const SWING_PAL = pal(['nordic', [N.linen, N.oak, N.white]], ['modern', [M.light, M.walnut, M.char]], ['industrial', [I.concrete, I.walnut, I.iron]], ['retro', [R.mustard, R.caramel, R.cream]], ['cute', [C.sakura, C.woodL, C.white]])
/** 阳台小椅：[木条, 铁框] */
const BISTRO_PAL = pal(['retro', [R.cream, R.teal]], ['retro', [R.caramel, R.mustard]], ['industrial', [I.walnut, I.iron]], ['nordic', [N.oak, N.sage]], ['cute', [C.woodL, C.pink]], ['modern', [M.walnut, M.black]])

// ---------- 素材 ----------

type Def = Omit<AssetDef, 'palettes'> & ReturnType<typeof pal>
const A = (d: Def): AssetDef => ({ ...d, build: (p) => fitChildren(d.build(p)) })

export const CHAIRS: AssetDef[] = [
  // 餐椅
  A({ id: 'ch-windsor', name: '温莎椅', sizeLabel: '温莎', category: 'dining', w: 46, d: 45, h: 91, ...WOOD_PAL, build: windsor }),
  A({ id: 'ch-wishbone', name: 'Y 椅', category: 'dining', w: 51, d: 50, h: 71, ...WISH_PAL, build: wishbone }),
  A({ id: 'ch-shell-wood', name: '壳椅', sizeLabel: '木腿', category: 'dining', w: 46, d: 46, h: 81, ...SHELL_PAL, build: (p) => shellChair('wood', p) }),
  A({ id: 'ch-shell-eiffel', name: '壳椅', sizeLabel: '铁腿', category: 'dining', w: 46, d: 46, h: 80, ...SHELL_PAL, build: (p) => shellChair('eiffel', p) }),
  A({ id: 'ch-plywood', name: '胶合板椅', sizeLabel: '胶合板', category: 'dining', w: 46, d: 48, h: 82, ...PLY_PAL, build: plywoodChair }),
  A({ id: 'ch-tolix', name: '铁皮椅', sizeLabel: '铁皮', category: 'dining', w: 47, d: 47, h: 82, ...TOLIX_PAL, build: tolix }),
  A({ id: 'ch-panton', name: 'S 形一体椅', category: 'dining', w: 52, d: 50, h: 84, ...PANTON_PAL, build: panton }),
  A({ id: 'ch-quanyi', name: '圈椅', category: 'dining', w: 55, d: 55, h: 96, ...QUANYI_PAL, build: quanyi }),
  A({ id: 'ch-cesca', name: '藤编悬臂椅', sizeLabel: '藤编悬臂', category: 'dining', w: 44, d: 47, h: 84, ...CANE_PAL, build: cesca }),
  A({ id: 'ch-upholstered', name: '软包餐椅', category: 'dining', w: 46, d: 51, h: 95, ...SOFT_PAL, build: upholstered }),
  A({ id: 'ch-bar-back-75', name: '靠背吧椅', sizeLabel: '座高 75', category: 'dining', w: 40, d: 42, h: 102, ...SOFT_PAL, build: (p) => barChair(75, p) }),
  A({ id: 'ch-bar-back-65', name: '靠背吧椅', sizeLabel: '座高 65', category: 'dining', w: 40, d: 42, h: 92, ...SOFT_PAL, build: (p) => barChair(65, p) }),
  A({ id: 'ch-fold-metal', name: '折叠椅', form: 'open', category: 'dining', w: 40, d: 42, h: 82, ...FOLD_METAL_PAL, build: (p) => foldingChair(false, true, p) }),
  A({ id: 'ch-fold-metal-closed', name: '折叠椅', form: 'closed', category: 'dining', w: 40, d: 7, h: 84, ...FOLD_METAL_PAL, build: (p) => foldingChair(false, false, p) }),
  A({ id: 'ch-fold-wood', name: '木折叠椅', form: 'open', category: 'dining', w: 41, d: 43, h: 82, ...FOLD_WOOD_PAL, build: (p) => foldingChair(true, true, p) }),
  A({ id: 'ch-fold-wood-closed', name: '木折叠椅', form: 'closed', category: 'dining', w: 41, d: 8, h: 84, ...FOLD_WOOD_PAL, build: (p) => foldingChair(true, false, p) }),

  // 办公 / 书房
  A({ id: 'ch-mesh-office', name: '人体工学椅', category: 'study', w: 64, d: 67, h: 114, ...OFFICE_PAL, build: meshChair }),
  A({ id: 'ch-gaming', name: '电竞椅', category: 'study', w: 70, d: 74, h: 133, ...GAMING_PAL, build: gamingChair }),
  A({ id: 'ch-task', name: '简约办公椅', category: 'study', w: 60, d: 59, h: 86, ...TASK_PAL, build: taskChair }),
  A({ id: 'ch-drafting', name: '绘图高椅', category: 'study', w: 62, d: 59, h: 98, ...TASK_PAL, build: draftingChair }),
  A({ id: 'ch-kneeling', name: '跪姿椅', category: 'study', w: 44, d: 61, h: 62, ...TASK_PAL, build: kneelingChair }),
  A({ id: 'ch-ball-seat', name: '平衡球椅', category: 'study', w: 52, d: 57, h: 57, ...TASK_PAL, build: ballSeat }),

  // 休闲
  A({ id: 'ch-chaise', name: '贵妃椅', category: 'living', w: 160, d: 65, h: 67, ...CHAISE_PAL, build: chaise }),
  A({ id: 'ch-egg', name: '蛋椅', category: 'living', w: 90, d: 86, h: 116, ...EGG_PAL, build: eggChair }),
  A({ id: 'ch-ball', name: '球椅', category: 'living', w: 103, d: 82, h: 111, ...EGG_PAL, build: ballChair }),
  A({ id: 'ch-butterfly', name: '蝴蝶椅', category: 'living', w: 70, d: 63, h: 89, ...LOUNGE_PAL, build: butterfly }),
  A({ id: 'ch-barcelona', name: '巴塞罗那椅', category: 'living', w: 73, d: 68, h: 83, ...LOUNGE_PAL, build: barcelona }),
  A({ id: 'ch-lounge', name: '休闲躺椅', sizeLabel: '单椅', category: 'living', w: 72, d: 89, h: 93, ...EAMES_PAL, build: (p) => loungeChair(false, p) }),
  A({ id: 'ch-lounge-ottoman', name: '休闲躺椅', sizeLabel: '含脚凳', category: 'living', w: 72, d: 148, h: 93, ...EAMES_PAL, build: (p) => loungeChair(true, p) }),

  // 和式
  A({ id: 'ch-zaisu-high', name: '高背座椅子', category: 'japanese', w: 60, d: 72, h: 67, ...ZAISU_PAL, build: highZaisu }),
  A({ id: 'ch-seiza', name: '正座椅子', category: 'japanese', w: 36, d: 18, h: 20, ...SEIZA_PAL, build: seizaChair }),

  // 凳子
  A({ id: 'ch-plank-stool', name: '小板凳', category: 'living', w: 34, d: 16, h: 26, ...WOODS, build: plankStool }),
  A({ id: 'ch-square-stool', name: '方凳', category: 'dining', w: 34, d: 34, h: 46, surface: 46, ...STOOL_PAL, build: squareStool }),
  A({ id: 'ch-step-stool', name: '梯凳', category: 'living', w: 42, d: 38, h: 50, ...WOODS, build: stepStool }),
  A({ id: 'ch-stool-60', name: '三脚圆凳', category: 'living', w: 35, d: 35, h: 44, ...WOODS, build: stool60 }),
  A({ id: 'ch-mushroom', name: '蘑菇凳', category: 'kids', w: 40, d: 40, h: 42, ...MUSHROOM_PAL, build: mushroomStool }),
  A({ id: 'ch-swivel-bar-high', name: '旋转吧凳', sizeLabel: '高', category: 'dining', w: 44, d: 44, h: 75, ...BAR_PAL, build: (p) => swivelStool(75, p) }),
  A({ id: 'ch-swivel-bar-mid', name: '旋转吧凳', sizeLabel: '中', category: 'dining', w: 44, d: 44, h: 62, ...BAR_PAL, build: (p) => swivelStool(62, p) }),
  A({ id: 'ch-mazha', name: '马扎', form: 'open', category: 'living', w: 32, d: 26, h: 29, ...CANVAS_PAL, build: (p) => mazha(true, p) }),
  A({ id: 'ch-mazha-closed', name: '马扎', form: 'closed', category: 'living', w: 32, d: 5, h: 36, ...CANVAS_PAL, build: (p) => mazha(false, p) }),
  A({ id: 'ch-bath-stool', name: '浴室凳', category: 'toiletry', w: 36, d: 26, h: 29, ...BATH_PAL, build: bathStool }),

  // 儿童
  A({ id: 'ch-high-chair', name: '儿童高脚椅', category: 'kids', w: 45, d: 56, h: 82, ...KID_PAL, build: highChair }),
  A({ id: 'ch-animal-bear', name: '动物靠背椅', sizeLabel: '小熊', category: 'kids', w: 34, d: 30, h: 65, ...ANIMAL_PAL, build: (p) => animalChair('bear', p) }),
  A({ id: 'ch-animal-bunny', name: '动物靠背椅', sizeLabel: '兔子', category: 'kids', w: 32, d: 30, h: 77, ...ANIMAL_PAL, build: (p) => animalChair('bunny', p) }),
  A({ id: 'ch-animal-cat', name: '动物靠背椅', sizeLabel: '小猫', category: 'kids', w: 32, d: 31, h: 68, ...ANIMAL_PAL, build: (p) => animalChair('cat', p) }),

  // 户外
  A({ id: 'ch-deck', name: '沙滩折叠椅', category: 'outdoor', w: 57, d: 74, h: 95, ...CANVAS_PAL, build: deckChair }),
  A({ id: 'ch-swing', name: '落地秋千椅', category: 'outdoor', w: 172, d: 96, h: 185, ...SWING_PAL, build: swingBench }),
  A({ id: 'ch-bistro', name: '阳台小椅', category: 'outdoor', w: 42, d: 45, h: 86, ...BISTRO_PAL, build: bistroChair }),
  A({ id: 'ch-director', name: '导演椅', category: 'outdoor', w: 51, d: 44, h: 89, ...CANVAS_PAL, build: directorChair }),
]
