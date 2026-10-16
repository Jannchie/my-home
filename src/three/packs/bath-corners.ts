// 浴室转角收纳素材包：转角架（三角 / 扇形 / 圆角三角 / L 形 / 靠角矩形 / 深篮 / 吸盘 / 带毛巾杆 / 带挂钩 / 伸缩杆落地）
// 和几款普通壁挂浴室置物架（直排篮、玻璃板 + 毛巾杆、壁龛感搁板、柚木挂钩板）。
//
// 约定补充：
//   - id 统一用 bc- 前缀。转角款都归 family 'bath-corner-shelf'（和 wet.ts / storage-forms.ts 的老款同一张卡片），
//     普通壁挂款归 'bath-wall-shelf'。
//   - 转角款的直角在局部左后：背面（-z）和左侧（-x）各贴一面墙，层板多边形的第 0 个点就是墙角，其余点是朝外的「前沿」。
//   - 壁挂款按绝对高度建模（mount = 模型最低点），层板 y 也是绝对高度；伸缩杆款是落地家具（不 mount），原点在地面。
//   - 尺寸、mount 用 build 后实测的包围盒（见文件末尾的 DIMS 表，改造型后用 scratchpad 的测量脚本重新量）。

import * as THREE from 'three'
import { ball, cyl, puck, rbox, toon, torus } from '../toon'
import { C, S, type AssetDef, type Poly, type StyleTag } from '../kit'

const PI = Math.PI
type V3 = [number, number, number]
type Pal = [StyleTag, string[]]
type Build = (p: string[]) => THREE.Group
/** 层板形状：ins 为向内收的距离（摆放区域用），0 为实际轮廓 */
type Shape = (ins?: number) => Poly

const M = S.modern
const N = S.nordic
const J = S.japanese
const I = S.industrial
const R = S.retro
const CH = S.chinese
const CL = S.classic
const F = S.farmhouse

// ---------- 材质色 ----------
const STEEL = '#d4d8dd'
const STEEL_D = '#9aa0a8'
const NICKEL = '#c4bfb5'
const NICKEL_D = '#8f8a82'
const WHITE = '#f6f6f3'
const ABS_G = '#c9ccd0'
const BAMBOO = '#dcc189'
const BAMBOO_D = '#b8955a'
const TEAK = '#a8703f'
const TEAK_D = '#7a4e2a'
const MARBLE = '#f1eee8'
const STONE_D = '#5d6166'
const BRASS = CH.brass
const BRASS_D = '#9c7a3c'
const GLASS = '#dff2fb'
const TILE = '#e9eef0'

// ---------- 小工具 ----------

function stick(a: V3, b: V3, r: number, color: string, seg = 8) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 半透明（玻璃、亚克力） */
function glassy<T extends THREE.Object3D>(o: T, color = GLASS, k = 0.4): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = toon(color, { transparent: k })
  })
  return o
}

/** 按多边形挤出一块板（同 kit.slab，但倒角更小，薄板也不会变形） */
function plank(poly: Poly, t: number, color: string, y: number) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const bevel = Math.min(0.4, t * 0.25)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.05, t - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 4 })
  geo.rotateX(-PI / 2)
  geo.translate(0, bevel, 0)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.y = y
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 一条水平线（z = v 或 x = v）与多边形相交的区间 */
function spansAt(poly: Poly, v: number, axis: 'z' | 'x'): [number, number][] {
  const P = axis === 'z' ? poly : poly.map(([x, z]): [number, number] => [z, x])
  const xs: number[] = []
  for (let k = 0; k < P.length; k++) {
    const [x0, z0] = P[k]
    const [x1, z1] = P[(k + 1) % P.length]
    if (z0 <= v !== z1 <= v) xs.push(x0 + ((v - z0) / (z1 - z0)) * (x1 - x0))
  }
  xs.sort((a, b) => a - b)
  const out: [number, number][] = []
  for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]])
  return out
}
/** 两组区间的交集（板条有宽度：取板条两条边上的公共部分，保证不出界） */
function intersect(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = []
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0)
      const hi = Math.min(a1, b1)
      if (hi - lo > 0.5) out.push([lo, hi])
    }
  return out
}
const range = (poly: Poly, k: 0 | 1) => [Math.min(...poly.map((p) => p[k])), Math.max(...poly.map((p) => p[k]))]

/** 前沿折线（层板第 0 个点是墙角，其余点依次是朝外的轮廓） */
const chainOf = (poly: Poly) => poly.slice(1)
function chainLen(ch: Poly) {
  let s = 0
  for (let k = 1; k < ch.length; k++) s += Math.hypot(ch[k][0] - ch[k - 1][0], ch[k][1] - ch[k - 1][1])
  return s
}
/** 沿前沿等距取点（含两端） */
function samples(ch: Poly, step: number): [number, number][] {
  const L = chainLen(ch)
  const n = Math.max(1, Math.round(L / step))
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    let s = (L * i) / n
    for (let k = 1; k < ch.length; k++) {
      const seg = Math.hypot(ch[k][0] - ch[k - 1][0], ch[k][1] - ch[k - 1][1])
      if (s <= seg + 1e-6 || k === ch.length - 1) {
        const t = seg ? Math.min(1, s / seg) : 0
        out.push([ch[k - 1][0] + (ch[k][0] - ch[k - 1][0]) * t, ch[k - 1][1] + (ch[k][1] - ch[k - 1][1]) * t])
        break
      }
      s -= seg
    }
  }
  return out
}
/** 把点朝多边形重心挪一点（挡杆、立柱不要正好压在板边上） */
function toward(poly: Poly, [x, z]: [number, number], k: number): [number, number] {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length
  const l = Math.hypot(cx - x, cz - z) || 1
  return [x + ((cx - x) / l) * k, z + ((cz - z) / l) * k]
}
/** 沿折线连杆 */
function polyline(g: THREE.Group, pts: Poly, y: number, r: number, color: string, closed = false) {
  const n = closed ? pts.length : pts.length - 1
  for (let k = 0; k < n; k++) {
    const a = pts[k]
    const b = pts[(k + 1) % pts.length]
    g.add(stick([a[0], y, a[1]], [b[0], y, b[1]], r, color, 6))
  }
  for (const p of pts) g.add(ball(r * 1.05, color, { x: p[0], y, z: p[1] }))
}
/** 沿一段边立一块薄板（深篮、挡边） */
function panel(g: THREE.Group, a: [number, number], b: [number, number], y: number, h: number, t: number, color: string) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  if (len < 0.2) return
  g.add(rbox(len + t * 0.6, h, t, color, { x: (a[0] + b[0]) / 2, y, z: (a[1] + b[1]) / 2, ry: Math.atan2(-dz, dx) }, Math.min(0.3, t * 0.45)))
}

// ---------- 层板形状（墙角在 (cx, cz)） ----------

const triS =
  (cx: number, cz: number, L: number): Shape =>
  (i = 0) => {
    const l = L - i * 3.4
    return [
      [cx + i, cz + i],
      [cx + i + l, cz + i],
      [cx + i, cz + i + l],
    ]
  }
const fanS =
  (cx: number, cz: number, Rr: number, n = 12): Shape =>
  (i = 0) => {
    const r = Rr - i * 2.4
    const pts: Poly = [[cx + i, cz + i]]
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * (PI / 2)
      pts.push([cx + i + Math.cos(a) * r, cz + i + Math.sin(a) * r])
    }
    return pts
  }
/** 圆角三角：前沿是外鼓的弧（介于直角三角和扇形之间），两个尖角削圆 */
const rtriS =
  (cx: number, cz: number, L: number, n = 10): Shape =>
  (i = 0) => {
    const l = L - i * 3
    const x0 = cx + i
    const z0 = cz + i
    const cut = l * 0.1
    const pts: Poly = [
      [x0, z0],
      [x0 + l - cut, z0],
    ]
    // 二次贝塞尔：(l, cut) → 控制点 (0.66l, 0.66l) → (cut, l)
    const A: [number, number] = [x0 + l, z0 + cut]
    const Bc: [number, number] = [x0 + l * 0.66, z0 + l * 0.66]
    const D: [number, number] = [x0 + cut, z0 + l]
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const u = 1 - t
      pts.push([u * u * A[0] + 2 * u * t * Bc[0] + t * t * D[0], u * u * A[1] + 2 * u * t * Bc[1] + t * t * D[1]])
    }
    pts.push([x0, z0 + l - cut])
    return pts
  }
/** L 形：沿背墙一条（长 A）、沿左墙一条（长 B），臂宽 a，在墙角相交 */
const lS =
  (cx: number, cz: number, A: number, B: number, a: number): Shape =>
  (i = 0) => [
    [cx + i, cz + i],
    [cx + A - i, cz + i],
    [cx + A - i, cz + a - i],
    [cx + a - i, cz + a - i],
    [cx + a - i, cz + B - i],
    [cx + i, cz + B - i],
  ]
/** 矩形：只贴背墙、左端顶到侧墙 */
const rectS =
  (cx: number, cz: number, W: number, D: number): Shape =>
  (i = 0) => [
    [cx + i, cz + i],
    [cx + W - i, cz + i],
    [cx + W - i, cz + D - i],
    [cx + i, cz + D - i],
  ]

// ---------- 通用转角架 ----------

type Deck = 'wire' | 'slab' | 'slat' | 'glass' | 'acrylic'
type Rim = { h: number; kind: 'rail' | 'gallery' | 'panel' | 'wirewall' | 'lip' }
type Hold = 'rod' | 'plates' | 'brackets' | 'suction' | 'tile' | 'frame' | 'pole' | 'none'

interface Unit {
  w: number
  d: number
  shape: Shape
  /** 各层层板底面高度（绝对） */
  ys: number[]
  deck: Deck
  t?: number
  rim?: Rim
  hold: Hold
  /** 只贴背墙（普通壁挂款）：支架、贴砖只做背墙那面 */
  backOnly?: boolean
  hooks?: boolean
  /** 毛巾杆高度（沿背墙） */
  towel?: number
  /** 伸缩杆总高 */
  pole?: number
  /** 最上层的净高（有顶板的壁龛款）；不给按 32 */
  topH?: number
}

const deckTop = (u: Unit) => (u.deck === 'wire' ? 0.8 : (u.t ?? 1.2))

/**
 * 配色约定：p[0] 层板 / 主体，p[1] 五金（立杆、支架、挡杆），p[2] 可选：挡边 / 贴砖色。
 * 玻璃、亚克力层板的颜色固定（亚克力取 p[0] 作色调），p[0] 用作金属边框。
 */
function unit(u: Unit): Build {
  return (p) => {
    const [main, acc, third = acc] = p
    const g = new THREE.Group()
    const t = u.t ?? 1.2
    const top = deckTop(u)
    const poly0 = u.shape(0)
    const cx = poly0[0][0]
    const cz = poly0[0][1]
    const ch = chainOf(poly0)
    const backLen = ch[0][0] - cx
    const leftLen = ch[ch.length - 1][1] - cz
    const yTop = u.ys[u.ys.length - 1]

    for (const y of u.ys) {
      // 层板
      if (u.deck === 'wire') {
        const r = 0.26
        polyline(g, toward0(poly0, 0.35), y + 0.4, 0.38, main, true)
        const [z0, z1] = range(poly0, 1)
        for (let z = z0 + 1.4; z < z1 - 0.5; z += 2.1) for (const [a, b] of spansAt(poly0, z, 'z')) if (b - a > 1.2) g.add(stick([a + 0.3, y + r, z], [b - 0.3, y + r, z], r, main, 6))
      } else if (u.deck === 'slat') {
        const sw = 2.4
        const [z0, z1] = range(poly0, 1)
        for (let z = z0 + sw / 2 + 0.1; z <= z1 - sw / 2; z += sw + 0.8) {
          for (const [a, b] of intersect(spansAt(poly0, z - sw / 2, 'z'), spansAt(poly0, z + sw / 2, 'z'))) if (b - a > 1.5) g.add(rbox(b - a, t, sw, main, { x: (a + b) / 2, y, z }, 0.3))
        }
        // 底下两根托条（沿 z）
        const [x0, x1] = range(poly0, 0)
        for (const x of [x0 + 2.2, x0 + (x1 - x0) * 0.45]) for (const [a, b] of intersect(spansAt(poly0, x - 0.8, 'x'), spansAt(poly0, x + 0.8, 'x'))) g.add(rbox(1.6, 1, b - a - 0.6, u.hold === 'frame' ? main : acc, { x, y: y - 1, z: (a + b) / 2 }, 0.2))
      } else if (u.deck === 'glass' || u.deck === 'acrylic') {
        g.add(glassy(plank(poly0, t, u.deck === 'acrylic' ? main : GLASS, y), u.deck === 'acrylic' ? main : GLASS, u.deck === 'acrylic' ? 0.55 : 0.4))
        // 玻璃前沿包一圈金属边（亚克力不包）
        if (u.deck === 'glass') polyline(g, ch.map((q) => toward(poly0, q, 0.2)), y + t / 2, 0.32, main)
      } else {
        g.add(plank(poly0, t, main, y))
      }

      // 挡边
      const rim = u.rim
      if (rim) {
        const yb = y + top
        const front = ch.map((q) => toward(poly0, q, 0.4))
        if (rim.kind === 'rail' || rim.kind === 'gallery') {
          const metal = u.deck === 'glass' ? main : acc
          polyline(g, front, yb + rim.h, 0.3, metal)
          const posts = rim.kind === 'gallery' ? samples(front, 1.8) : samples(front, 9)
          for (const [x, z] of posts) g.add(cyl(rim.kind === 'gallery' ? 0.2 : 0.28, rim.kind === 'gallery' ? 0.2 : 0.28, rim.h, metal, { x, y: yb - 0.1, z }, 6))
          if (rim.kind === 'gallery') {
            polyline(g, front, yb + rim.h * 0.45, 0.2, metal)
            for (const q of [front[0], front[front.length - 1]]) g.add(ball(0.75, metal, { x: q[0], y: yb + rim.h + 0.6, z: q[1] }))
          }
        } else if (rim.kind === 'wirewall') {
          for (const [x, z] of samples(front, 1.9)) g.add(cyl(0.22, 0.22, rim.h, main, { x, y: yb - 0.2, z }, 6))
          polyline(g, front, yb + rim.h, 0.34, main)
          polyline(g, front, yb + rim.h * 0.5, 0.24, main)
        } else {
          // panel = 深篮的实心挡板，前沿 + 贴墙两边都有；lip = 只有前沿一圈矮挡边
          const tk = rim.kind === 'panel' ? 0.7 : 0.6
          const pts = rim.kind === 'panel' ? [...toward0(poly0, tk / 2), toward0(poly0, tk / 2)[0]] : ch.map((q) => toward(poly0, q, tk / 2))
          const wall = new THREE.Group()
          for (let k = 1; k < pts.length; k++) panel(wall, pts[k - 1], pts[k], yb - 0.1, rim.h, tk, u.deck === 'acrylic' ? main : third)
          g.add(u.deck === 'acrylic' ? glassy(wall, main, 0.55) : wall)
        }
      }

      // 每层的支撑
      if (u.hold === 'brackets') {
        const spots: [number, number, 'b' | 'l'][] = u.backOnly
          ? [
              [cx + 3, cz, 'b'],
              [cx + backLen - 3, cz, 'b'],
            ]
          : [
              [cx + backLen * 0.62, cz, 'b'],
              [cx, cz + leftLen * 0.62, 'l'],
            ]
        for (const [x, z, s] of spots) {
          if (s === 'b') {
            g.add(rbox(1.4, 6, 0.6, acc, { x, y: y - 6, z: z + 0.3 }, 0.2))
            g.add(stick([x, y - 5.4, z + 0.6], [x, y - 0.2, z + 5], 0.32, acc, 6))
          } else {
            g.add(rbox(0.6, 6, 1.4, acc, { x: x + 0.3, y: y - 6, z }, 0.2))
            g.add(stick([x + 0.6, y - 5.4, z], [x + 5, y - 0.2, z], 0.32, acc, 6))
          }
        }
      } else if (u.hold === 'suction') {
        const cups: [number, number, boolean][] = [[cx + backLen * 0.5, cz, true]]
        if (!u.backOnly) cups.push([cx, cz + leftLen * 0.5, false])
        for (const [x, z, back] of cups) {
          const yc = y + 3.2
          if (back) {
            g.add(cyl(2.3, 2.3, 0.7, acc, { x, y: yc - 0.35, z: z + 0.36, rx: PI / 2 }, 16))
            g.add(ball(0.9, acc, { x, y: yc, z: z + 1.3 }))
            g.add(stick([x, yc, z + 1.3], [x, y + 0.3, z + 3.2], 0.35, acc, 6))
          } else {
            g.add(cyl(2.3, 2.3, 0.7, acc, { x: x + 0.36, y: yc - 0.35, z, rz: PI / 2 }, 16))
            g.add(ball(0.9, acc, { x: x + 1.3, y: yc, z }))
            g.add(stick([x + 1.3, yc, z], [x + 3.2, y + 0.3, z], 0.35, acc, 6))
          }
        }
      } else if (u.hold === 'pole') {
        // 层板根部的夹环
        g.add(cyl(2.3, 2.3, 3, acc, { x: cx + 2.6, y: y - 1.5, z: cz + 2.6 }, 14))
      }

      // 挂钩：每层前沿下面三只 J 钩
      if (u.hooks) {
        const pts = samples(ch.map((q) => toward(poly0, q, 1.2)), 6).filter((_, i, a) => i > 0 && i < a.length - 1)
        const pick = pts.length > 3 ? [pts[Math.floor(pts.length * 0.2)], pts[Math.floor(pts.length / 2)], pts[Math.floor(pts.length * 0.8)]] : pts
        for (const [x, z] of pick) {
          g.add(stick([x, y + 0.1, z], [x, y - 3, z], 0.22, acc, 6))
          g.add(torus(0.7, 0.22, acc, { x: x + 0.7, y: y - 3, z, rz: PI }, PI))
          g.add(stick([x + 1.4, y - 3, z], [x + 1.4, y - 2, z], 0.22, acc, 6))
        }
      }
    }

    // 整体固定方式
    if (u.hold === 'rod') {
      const y0 = u.ys[0] - 3
      const y1 = yTop + 6
      g.add(cyl(0.9, 0.9, y1 - y0, acc, { x: cx + 1.1, y: y0, z: cz + 1.1 }, 10))
      for (const y of [y0, y1]) g.add(ball(1.3, acc, { x: cx + 1.1, y, z: cz + 1.1 }))
    } else if (u.hold === 'plates') {
      const y0 = u.ys[0] - 4
      const hh = yTop - y0 + 8
      g.add(rbox(2.4, hh, 0.6, acc, { x: cx + backLen * 0.55, y: y0, z: cz + 0.3 }, 0.25))
      if (!u.backOnly) g.add(rbox(0.6, hh, 2.4, acc, { x: cx + 0.3, y: y0, z: cz + leftLen * 0.55 }, 0.25))
      else g.add(rbox(2.4, hh, 0.6, acc, { x: cx + backLen * 0.12, y: y0, z: cz + 0.3 }, 0.25))
    } else if (u.hold === 'tile') {
      // 嵌墙感：背后（和左侧）贴一块瓷砖面板，层板像是从墙里伸出来
      const y0 = u.backOnly ? u.ys[0] : u.ys[0] - 6
      const hh = u.backOnly ? yTop + top + (u.topH ?? 24) + 1.8 - y0 : yTop - y0 + 22
      g.add(rbox(backLen + 0.8, hh, 0.8, third, { x: cx - 0.8 + (backLen + 0.8) / 2, y: y0, z: cz - 0.4 }, 0.25))
      if (!u.backOnly) g.add(rbox(0.8, hh, leftLen + 0.8, third, { x: cx - 0.4, y: y0, z: cz - 0.8 + (leftLen + 0.8) / 2 }, 0.25))
      else {
        // 壁龛框：两侧挡板 + 顶板，和层板同材质；顶板下留 topH 的净高
        const dd = leftLen
        const yc = yTop + top + (u.topH ?? 24)
        for (const x of [cx + 0.9, cx + backLen - 0.9]) g.add(rbox(1.8, yc + 1.8 - u.ys[0], dd, main, { x, y: u.ys[0], z: cz + dd / 2 }, 0.4))
        g.add(rbox(backLen, 1.8, dd, main, { x: cx + backLen / 2, y: yc, z: cz + dd / 2 }, 0.4))
      }
    } else if (u.hold === 'frame') {
      // 木框：每个顶点一根立柱
      const y0 = u.ys[0] - 4
      const y1 = yTop + top + 3
      for (const q of poly0) {
        const [x, z] = toward(poly0, q, 0.9)
        g.add(rbox(1.5, y1 - y0, 1.5, main, { x, y: y0, z }, 0.3))
      }
    } else if (u.hold === 'pole' && u.pole) {
      // 顶天立地伸缩杆：地面脚垫 + 杆 + 伸缩接头 + 顶盖
      const x = cx + 2.6
      const z = cz + 2.6
      const H = u.pole
      g.add(puck(2.6, 2.2, STONE_D, { x, y: 0, z }))
      g.add(cyl(1.3, 1.3, H * 0.62, acc, { x, y: 1.6, z }, 14))
      g.add(cyl(1.05, 1.05, H * 0.4, acc, { x, y: H * 0.6, z }, 14))
      g.add(cyl(1.7, 1.7, 3.2, STONE_D, { x, y: H * 0.6 - 1, z }, 14))
      g.add(puck(2.6, 2.2, STONE_D, { x, y: H - 2.2, z }))
    }

    // 毛巾杆（沿背墙，在最下层下面）
    if (u.towel !== undefined) {
      const x0 = cx + 3
      const x1 = u.w / 2 - 2
      const z = cz + 5.2
      for (const x of [x0, x1]) {
        g.add(cyl(1.4, 1.4, 0.6, acc, { x, y: u.towel - 0.3, z: cz + 0.3, rx: PI / 2 }, 12))
        g.add(stick([x, u.towel, cz + 0.5], [x, u.towel, z], 0.45, acc, 8))
      }
      g.add(stick([x0, u.towel, z], [x1, u.towel, z], 0.55, acc, 10))
    }
    return g
  }
}
/** 整个多边形（含墙角那两条边）朝内收：钢丝外框、深篮挡板贴墙的两边不要压在墙面上 */
function toward0(poly: Poly, k: number): Poly {
  return poly.map((q) => toward(poly, q, k))
}

// ---------- 素材 ----------

/** 实测尺寸 [w, d, h, mount]（mount 为模型最低点；落地款 mount = 0）。改了造型就重新量 */
const DIMS: Record<string, [number, number, number, number]> = {
  'bc-tri-wire-1': [23.5, 23.5, 11.6, 103.7],
  'bc-tri-black-4': [30.3, 30.3, 84, 66],
  'bc-rtri-abs-2': [26.1, 26.1, 39, 88],
  'bc-fan-glass-2': [25.4, 25.4, 34.8, 92],
  'bc-fan-acrylic-1': [21, 21, 5.5, 110],
  'bc-fan-brass-3': [23.9, 23.9, 63.6, 79.7],
  'bc-l-teak-2': [35, 35, 34.6, 86],
  'bc-l-nickel-1': [34.2, 30.2, 9.3, 100],
  'bc-rect-bamboo-2': [30, 14.3, 36.6, 85.9],
  'bc-rect-stone-1': [29, 13, 28, 98],
  'bc-basket-wire-2': [26.5, 26.5, 45.5, 81.7],
  'bc-basket-pp-1': [25.3, 25.3, 13.1, 100],
  'bc-mini-suction': [20.1, 20.1, 5.5, 114],
  'bc-towel-tri-2': [44.5, 24.5, 44.7, 90.6],
  'bc-hook-fan-3': [24, 24, 62, 76],
  'bc-tri-teak-3': [28.7, 28.7, 60.6, 76],
  'bc-fan-ceramic-2': [23.1, 23.1, 55, 88],
  'bc-rtri-glass-3': [24.4, 24.4, 61.6, 79.7],
  'bc-pole-3': [30.5, 30.5, 238, 0],
  'bc-pole-4': [30.3, 30.3, 238, 0],
  'bc-wall-wire-2': [40.2, 12.6, 39, 92],
  'bc-wall-glass-towel': [50.3, 14.6, 13.2, 99.6],
  'bc-wall-niche': [40.1, 12, 54.4, 97.9],
  'bc-wall-teak-hook': [40, 12, 7.6, 100],
}

interface Spec {
  id: string
  name: string
  label: string
  u: Unit
  pals: Pal[]
  floor?: boolean
  family?: string
}

function def(s: Spec): AssetDef {
  const { u } = s
  const top = deckTop(u)
  const ins = u.rim?.kind === 'panel' || u.rim?.kind === 'wirewall' ? 1.4 : u.rim ? 1.1 : 0.8
  const [w, d, h, mount] = DIMS[s.id] ?? [u.w, u.d, u.ys[u.ys.length - 1] + 10 - u.ys[0], u.ys[0] - 5]
  return {
    id: s.id,
    name: s.name,
    category: 'storage',
    w,
    d,
    h,
    palettes: s.pals.map((x) => x[1]),
    paletteStyles: s.pals.map((x) => x[0]),
    styles: [...new Set(s.pals.map((x) => x[0]))],
    family: s.family ?? 'bath-corner-shelf',
    sizeLabel: s.label,
    ...(s.floor ? {} : { mount }),
    surfaces: u.ys.map((y, i) => ({
      y: Math.round((y + top) * 10) / 10,
      h: i < u.ys.length - 1 ? Math.floor((u.ys[i + 1] - y - top) * 10) / 10 : (u.topH ?? 32),
      shape: [u.shape(ins)],
    })),
    build: unit(u),
  }
}

/** 层高序列 */
const tiers = (base: number, gap: number, n: number) => Array.from({ length: n }, (_, i) => base + i * gap)

// 常用配色
const P_STEEL: Pal = ['modern', [STEEL, STEEL_D]]
const P_BLACK: Pal = ['industrial', [M.black, I.iron]]
const P_BLACK_M: Pal = ['modern', [M.black, M.char]]
const P_GOLD: Pal = ['classic', [CL.gold, '#a8894c']]
const P_WHITE_W: Pal = ['nordic', [N.white, N.oak]]

const SPECS: Spec[] = [
  {
    id: 'bc-tri-wire-1',
    name: '浴室转角架',
    label: '三角钢丝 1 层',
    u: { w: 23, d: 23, shape: triS(-11.5, -11.5, 22.5), ys: [108], deck: 'wire', rim: { h: 3, kind: 'rail' }, hold: 'rod' },
    pals: [P_STEEL, P_BLACK, P_WHITE_W, ['cute', [C.white, C.pink]]],
  },
  {
    id: 'bc-tri-black-4',
    name: '浴室转角架',
    label: '三角铁艺 4 层',
    u: { w: 30, d: 30, shape: triS(-15, -15, 29.5), ys: tiers(70, 24, 4), deck: 'slab', t: 0.8, rim: { h: 2.6, kind: 'rail' }, hold: 'plates' },
    pals: [P_BLACK, P_BLACK_M, ['farmhouse', [F.iron, F.oak]], ['retro', [R.teal, R.cream]]],
  },
  {
    id: 'bc-rtri-abs-2',
    name: '浴室转角架',
    label: '圆角三角塑料 2 层',
    u: { w: 26, d: 26, shape: rtriS(-13, -13, 26), ys: tiers(92, 27, 2), deck: 'slab', t: 1.6, rim: { h: 1.8, kind: 'lip' }, hold: 'plates' },
    pals: [
      ['cute', [WHITE, C.sky, WHITE]],
      ['modern', [WHITE, ABS_G, WHITE]],
      ['nordic', [N.white, N.sage, N.white]],
    ],
  },
  {
    id: 'bc-fan-glass-2',
    name: '浴室转角架',
    label: '扇形玻璃 2 层',
    u: { w: 25, d: 25, shape: fanS(-12.5, -12.5, 24.6), ys: tiers(98, 28, 2), deck: 'glass', t: 0.8, hold: 'brackets' },
    pals: [P_STEEL, P_GOLD, ['industrial', [I.iron, I.iron]]],
  },
  {
    id: 'bc-fan-acrylic-1',
    name: '浴室转角架',
    label: '扇形亚克力 1 层（吸盘）',
    u: { w: 21, d: 21, shape: fanS(-10.5, -10.5, 20.6), ys: [110], deck: 'acrylic', t: 1, rim: { h: 2, kind: 'lip' }, hold: 'suction' },
    pals: [
      ['cute', ['#ffd3de', WHITE]],
      ['modern', ['#e8f4fa', WHITE]],
      ['nordic', ['#d6dcd8', N.white]],
    ],
  },
  {
    id: 'bc-fan-brass-3',
    name: '浴室转角架',
    label: '扇形黄铜围栏 3 层',
    u: { w: 23, d: 23, shape: fanS(-11.5, -11.5, 22.6), ys: tiers(84, 26, 3), deck: 'wire', rim: { h: 4, kind: 'gallery' }, hold: 'rod' },
    pals: [
      ['retro', [BRASS, BRASS_D]],
      ['classic', [CL.gold, '#a8894c']],
      ['chinese', [BRASS, CH.ink]],
    ],
  },
  {
    id: 'bc-l-teak-2',
    name: '浴室转角架',
    label: 'L 形柚木条格 2 层',
    u: { w: 35, d: 35, shape: lS(-17.5, -17.5, 35, 35, 12.5), ys: tiers(92, 27, 2), deck: 'slat', t: 1.6, hold: 'brackets' },
    pals: [
      ['nordic', [N.oak, STEEL_D]],
      ['japanese', [J.hinoki, J.sumi]],
      ['farmhouse', [F.oak, F.iron]],
      ['chinese', [TEAK, BRASS]],
    ],
  },
  {
    id: 'bc-l-nickel-1',
    name: '浴室转角架',
    label: 'L 形拉丝镍 1 层',
    u: { w: 34, d: 30, shape: lS(-17, -15, 34, 30, 12.5), ys: [106], deck: 'slab', t: 1, rim: { h: 2.4, kind: 'lip' }, hold: 'brackets' },
    pals: [
      ['modern', [NICKEL, NICKEL_D, NICKEL]],
      ['classic', [CL.gold, '#a8894c', CL.gold]],
      ['industrial', [M.black, I.iron, M.black]],
    ],
  },
  {
    id: 'bc-rect-bamboo-2',
    name: '浴室转角架',
    label: '靠角矩形竹 2 层',
    u: { w: 30, d: 13.5, shape: rectS(-15, -6.75, 30, 13.5), ys: tiers(90, 28, 2), deck: 'slat', t: 1.4, hold: 'frame' },
    pals: [
      ['japanese', [BAMBOO, BAMBOO_D]],
      ['nordic', ['#e6d2ad', N.oak]],
      ['farmhouse', [F.oak, F.iron]],
    ],
  },
  {
    id: 'bc-rect-stone-1',
    name: '浴室转角架',
    label: '靠角矩形人造石 1 层',
    u: { w: 29, d: 13, shape: rectS(-13.7, -5.7, 28.2, 12.2), ys: [104], deck: 'slab', t: 2.8, hold: 'tile' },
    pals: [
      ['classic', [MARBLE, CL.gold, TILE]],
      ['modern', [STONE_D, M.gray, M.light]],
      ['chinese', [CH.celadon, BRASS, CH.ivory]],
    ],
  },
  {
    id: 'bc-basket-wire-2',
    name: '浴室转角架',
    label: '三角深篮钢丝 2 层',
    u: { w: 26, d: 26, shape: triS(-13, -13, 25.5), ys: tiers(86, 31, 2), deck: 'wire', rim: { h: 9, kind: 'wirewall' }, hold: 'rod' },
    pals: [P_STEEL, P_BLACK, ['farmhouse', [F.white, F.iron]]],
  },
  {
    id: 'bc-basket-pp-1',
    name: '浴室转角架',
    label: '圆角深篮塑料 1 层',
    u: { w: 25, d: 25, shape: rtriS(-12.5, -12.5, 25), ys: [104], deck: 'slab', t: 1.2, rim: { h: 8, kind: 'panel' }, hold: 'plates' },
    pals: [
      ['cute', [C.pink, WHITE, C.pink]],
      ['cute', [C.mint, WHITE, C.mint]],
      ['retro', [R.mustard, R.cream, R.mustard]],
      ['nordic', [N.white, N.gray, N.white]],
    ],
  },
  {
    id: 'bc-mini-suction',
    name: '浴室转角架',
    label: '吸盘小托架 1 层',
    u: { w: 20, d: 20, shape: rtriS(-10, -10, 20), ys: [114], deck: 'slab', t: 1.2, rim: { h: 1.6, kind: 'lip' }, hold: 'suction' },
    pals: [
      ['cute', [C.pink, WHITE, C.pink]],
      ['cute', [C.mint, WHITE, C.mint]],
      ['modern', [WHITE, ABS_G, WHITE]],
    ],
  },
  {
    id: 'bc-towel-tri-2',
    name: '浴室转角架',
    label: '三角带毛巾杆 2 层',
    u: { w: 44, d: 24, shape: triS(-22, -12, 23.5), ys: tiers(102, 26, 2), deck: 'wire', rim: { h: 3, kind: 'rail' }, hold: 'rod', towel: 92 },
    pals: [P_STEEL, P_BLACK, P_GOLD],
  },
  {
    id: 'bc-hook-fan-3',
    name: '浴室转角架',
    label: '扇形带挂钩 3 层',
    u: { w: 24, d: 24, shape: fanS(-12, -12, 23.6), ys: tiers(80, 25, 3), deck: 'slab', t: 0.9, rim: { h: 2.4, kind: 'rail' }, hold: 'plates', hooks: true },
    pals: [
      ['modern', [WHITE, STEEL_D]],
      ['nordic', [N.white, N.oak]],
      ['industrial', [M.black, I.steel]],
    ],
  },
  {
    id: 'bc-tri-teak-3',
    name: '浴室转角架',
    label: '三角柚木条格 3 层',
    u: { w: 28, d: 28, shape: triS(-14, -14, 28), ys: tiers(80, 26, 3), deck: 'slat', t: 1.6, hold: 'frame' },
    pals: [
      ['nordic', [N.oak, N.oak]],
      ['japanese', [J.hinoki, J.wood]],
      ['farmhouse', [F.oak, F.oak]],
      ['chinese', [TEAK_D, TEAK_D]],
    ],
  },
  {
    id: 'bc-fan-ceramic-2',
    name: '浴室转角架',
    label: '扇形陶瓷嵌墙 2 层',
    u: { w: 23, d: 23, shape: fanS(-10.7, -10.7, 21.8), ys: tiers(94, 27, 2), deck: 'slab', t: 2.4, hold: 'tile' },
    pals: [
      ['classic', [MARBLE, CL.gold, TILE]],
      ['chinese', [CH.ivory, BRASS, CH.celadon]],
      ['modern', [WHITE, M.gray, M.light]],
      ['japanese', [J.washi, J.sumi, '#cfd6c4']],
    ],
  },
  {
    id: 'bc-rtri-glass-3',
    name: '浴室转角架',
    label: '圆角三角玻璃 3 层',
    u: { w: 24, d: 24, shape: rtriS(-12, -12, 24), ys: tiers(84, 25, 3), deck: 'glass', t: 0.8, hold: 'rod' },
    pals: [P_STEEL, P_BLACK_M, P_GOLD],
  },
  // 伸缩杆落地款（不贴墙挂，杆顶到天花板）
  {
    id: 'bc-pole-3',
    name: '伸缩杆转角架',
    label: '伸缩杆三角 3 层',
    floor: true,
    u: { w: 30, d: 30, shape: triS(-15, -15, 30), ys: [48, 86, 124], deck: 'wire', rim: { h: 4, kind: 'wirewall' }, hold: 'pole', pole: 238 },
    pals: [P_STEEL, P_BLACK, ['nordic', [N.white, STEEL_D]]],
  },
  {
    id: 'bc-pole-4',
    name: '伸缩杆转角架',
    label: '伸缩杆扇形 4 层',
    floor: true,
    u: { w: 30, d: 30, shape: fanS(-15, -15, 30), ys: [36, 70, 104, 138], deck: 'slab', t: 1.4, rim: { h: 3.5, kind: 'lip' }, hold: 'pole', pole: 238 },
    pals: [
      ['modern', [WHITE, STEEL, WHITE]],
      ['industrial', [M.black, I.iron, M.black]],
      ['cute', [C.mint, STEEL, C.mint]],
    ],
  },
  // 普通壁挂浴室置物架（不进墙角）
  {
    id: 'bc-wall-wire-2',
    name: '浴室置物架',
    label: '直排钢丝篮 2 层',
    family: 'bath-wall-shelf',
    u: { w: 40, d: 12, shape: rectS(-20, -6, 40, 12), ys: tiers(96, 27, 2), deck: 'wire', rim: { h: 6, kind: 'wirewall' }, hold: 'plates', backOnly: true },
    pals: [P_STEEL, P_BLACK, P_WHITE_W],
  },
  {
    id: 'bc-wall-glass-towel',
    name: '浴室置物架',
    label: '玻璃板 + 毛巾杆',
    family: 'bath-wall-shelf',
    u: { w: 50, d: 14, shape: rectS(-25, -7, 50, 14), ys: [112], deck: 'glass', t: 0.8, hold: 'brackets', backOnly: true, towel: 101 },
    pals: [P_STEEL, P_GOLD, P_BLACK_M],
  },
  {
    id: 'bc-wall-niche',
    name: '浴室置物架',
    label: '壁龛感搁板 2 层',
    family: 'bath-wall-shelf',
    u: { w: 40, d: 12, shape: rectS(-19.2, -5.2, 39.2, 11.2), ys: tiers(98, 26, 2), deck: 'slab', t: 2.4, hold: 'tile', backOnly: true, topH: 24 },
    pals: [
      ['classic', [MARBLE, CL.gold, TILE]],
      ['modern', [STONE_D, M.gray, M.light]],
      ['japanese', [J.washi, J.sumi, '#cfd6c4']],
      ['chinese', [CH.ivory, BRASS, CH.celadon]],
    ],
  },
  {
    id: 'bc-wall-teak-hook',
    name: '浴室置物架',
    label: '柚木搁板 + 挂钩',
    family: 'bath-wall-shelf',
    u: { w: 40, d: 12, shape: rectS(-20, -6, 40, 12), ys: [106], deck: 'slat', t: 1.6, hold: 'brackets', backOnly: true, hooks: true },
    pals: [
      ['nordic', [N.oak, STEEL_D]],
      ['farmhouse', [F.oak, F.iron]],
      ['japanese', [J.hinoki, J.sumi]],
      ['industrial', [I.walnut, I.iron]],
    ],
  },
]

export const BATH_CORNERS: AssetDef[] = SPECS.map(def)
