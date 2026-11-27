// 儿童房补充：城堡游戏帐、手工桌、长颈鹿身高尺、收银台玩具、木工台、摇摇船、小沙发、蒙氏玩具架、小屋地床、
// 木质婴儿健身架、哺乳摇椅、婴儿看护三件套、墙贴、字母拼图地垫。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；能摆东西的（手工桌、玩具架）本体留空并声明 surface / surfaces；
// 身高尺是壁挂件（fitWall），墙贴是贴附物（stick：原点在背面中心，往 +z 伸出，上下居中）。
// 都是儿童用品（for-kids）；家里有婴儿才用得上的（健身架、哺乳椅、看护三件套）再加 for-baby。

import * as THREE from 'three'
import { ball, box, cyl, puck, rbox, shade, torus, tray } from '../toon'
import { duvet, pillowMesh } from '../bedding'
import { C, glow, holePanel, paintPanel, rectPoly, type AssetDef, type Hole } from '../kit'
import { P, PI, batten, box3, cappedTube, cylX, cylZ, fitGroup, fitWall, lit, litOutlined, mesh, noOutline, rod3, sideSlab, tiltFrame, tube, type V2, type V3 } from '../geo'
import { CL, J, M, N, R, define, PROP, type Pal } from '../packkit'

const WHITE = '#fbf8f2'
const DARK = '#2e2f33'
const STEEL = '#c3c7cc'
const CORD = '#e9e2d2'
/** 身高尺的刻度色块（固定的彩虹色，每 10cm 换一色） */
const RAINBOW = ['#ff8f86', '#ffb35c', '#ffe08f', '#8fd49a', '#8cc4f0', '#c4a8f0']
/** 小夜灯的暖光 */
const NIGHT = '#ffe2a0'

// =====================================================================
// 小工具
// =====================================================================

/** 平面轮廓挤出的板：轮廓在 xy 平面（x 朝右、y 朝上），厚 t 沿 z、z 居中；倒角往里收，轮廓不变大 */
function flatPlate(shape: THREE.Shape | THREE.Shape[], t: number, color: string, bevel = 0.3, seg = 12) {
  const b = Math.min(bevel, t * 0.2)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, t - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: seg })
  geo.translate(0, 0, -t / 2 + b)
  return mesh(geo, color)
}

/** 多边形轮廓（可带挖空的洞）→ Shape */
function polyShape(pts: V2[], holes: V2[][] = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
  return s
}

/** 五角星轮廓：中心 (cx, cy)，外半径 ro、内半径 ri，一个尖朝上（转 rot） */
function starPts(cx: number, cy: number, ro: number, ri: number, rot = 0): V2[] {
  return Array.from({ length: 10 }, (_, i): V2 => {
    const a = PI / 2 + rot + (i * PI) / 5
    const r = i % 2 ? ri : ro
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  })
}

/** 两圆的交点里离 (ox, oy) 远的那个（云朵相邻两团鼓包的外侧交点） */
function outerMeet(a: [number, number, number], b: [number, number, number], ox: number, oy: number): V2 {
  const [x1, y1, r1] = a
  const [x2, y2, r2] = b
  const d = Math.hypot(x2 - x1, y2 - y1)
  const l = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - l * l))
  const mx = x1 + ((x2 - x1) * l) / d
  const my = y1 + ((y2 - y1) * l) / d
  const px = (-(y2 - y1) / d) * h
  const py = ((x2 - x1) / d) * h
  const p1: V2 = [mx + px, my + py]
  const p2: V2 = [mx - px, my - py]
  return Math.hypot(p1[0] - ox, p1[1] - oy) > Math.hypot(p2[0] - ox, p2[1] - oy) ? p1 : p2
}

/** 云朵鼓包（单位尺寸，底边在 y = 0，从右到左）：[cx, cy, r] */
const CLOUD_BUMPS: [number, number, number][] = [
  [10, 4, 4],
  [4, 8, 5.5],
  [-4, 9, 6.5],
  [-10, 4.5, 4.5],
]

/** 云朵轮廓：平底 + 四团鼓包，底边中点在 (cx, cy)，缩放 s（单位尺寸约 28.5 × 15.5） */
function cloudPts(cx: number, cy: number, s: number): V2[] {
  const out: V2[] = [[-10, 0]]
  const n = CLOUD_BUMPS.length
  for (let i = 0; i < n; i++) {
    const [x, y, r] = CLOUD_BUMPS[i]
    const angOf = ([px, py]: V2) => Math.atan2(py - y, px - x)
    // 每团鼓包从和前一团的外交点画到和后一团的外交点（第一团从底边右端起、最后一团画回底边左端）
    const a0 = i === 0 ? -PI / 2 : angOf(outerMeet(CLOUD_BUMPS[i - 1], CLOUD_BUMPS[i], 0, 3))
    let a1 = i === n - 1 ? PI * 1.5 : angOf(outerMeet(CLOUD_BUMPS[i], CLOUD_BUMPS[i + 1], 0, 3))
    while (a1 <= a0) a1 += PI * 2
    const k = Math.max(4, Math.ceil(((a1 - a0) * r) / 1.2))
    for (let j = 0; j <= k; j++) {
      const a = a0 + ((a1 - a0) * j) / k
      out.push([x + Math.cos(a) * r, y + Math.sin(a) * r])
    }
  }
  // 去掉和起点重合的最后一点
  out.pop()
  return out.map(([x, y]): V2 => [cx + x * s, cy + y * s])
}

/** 轮廓点平移 + 旋转 + 缩放 */
const placePts = (pts: V2[], cx: number, cy: number, s = 1, rot = 0): V2[] =>
  pts.map(([x, y]): V2 => [cx + (x * Math.cos(rot) - y * Math.sin(rot)) * s, cy + (x * Math.sin(rot) + y * Math.cos(rot)) * s])

// =====================================================================
// 城堡游戏帐：四面布墙（正面拱门、两侧小拱窗）+ 城垛，四角圆塔楼戴尖顶、插小旗，门口两片挽起的门帘
// =====================================================================

const CT = { half: 46, wall: 84, r: 12, tower: 100 }
function castleTent(p: string[]) {
  const [wall, roof, acc] = p
  const g = new THREE.Group()
  const { half, r } = CT
  const span = half * 2
  const t = 1.2
  // 帐篷里的地垫（四角伸进塔楼）
  g.add(rbox(span - 2, 1.5, span - 2, shade(wall, -0.12), {}, 0.6))
  // 四面布墙：两端伸进塔楼里
  g.add(holePanel(span, CT.wall, t, wall, [{ kind: 'arch', x: 0, y: 2, w: 40, h: 58 }], { z: half }, 0))
  g.add(holePanel(span, CT.wall, t, wall, [], { z: -half }, 0))
  for (const s of [-1, 1]) g.add(holePanel(span, CT.wall, t, wall, [{ kind: 'arch', x: 0, y: 40, w: 18, h: 22 }], { x: s * half, ry: PI / 2 }, 0))
  // 顶棚：略低于墙顶，藏在城垛后面
  g.add(rbox(span - 2, 1, span - 2, roof, { y: CT.wall - 1.6 }, 0.4))
  for (const s of [-1, 1]) {
    // 墙顶城垛（比墙厚，压进墙顶一点）
    for (const m of [-26, -13, 0, 13, 26]) {
      g.add(rbox(7, 6, 2, wall, { x: m, y: CT.wall - 0.5, z: s * half }, 0.5))
      g.add(rbox(2, 6, 7, wall, { x: s * half, y: CT.wall - 0.5, z: m }, 0.5))
    }
    // 墙上沿一圈色带
    g.add(rbox(70, 4, t + 0.8, acc, { y: 74, z: s * half }, 0.4))
    g.add(rbox(t + 0.8, 4, 70, acc, { x: s * half, y: 74 }, 0.4))
  }
  // 四角塔楼：圆筒 + 两道色带 + 一道箭窗 + 尖顶 + 旗杆小旗
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * half
      const z = sz * half
      g.add(cyl(r, r, CT.tower, wall, { x, z }, 24))
      for (const y of [76, CT.tower - 2]) g.add(torus(r + 0.2, 0.9, acc, { x, y, z, rx: PI / 2 }, PI * 2, [6, 24]))
      const dx = sx / Math.SQRT2
      const dz = sz / Math.SQRT2
      g.add(P(rbox(2.6, 8, 1.2, shade(wall, -0.35), {}, 0.4), x + dx * (r - 0.2), 88, z + dz * (r - 0.2), 0, Math.atan2(dx, dz)))
      g.add(cyl(0.4, r + 2.5, 32, roof, { x, y: CT.tower, z }, 24))
      g.add(cyl(0.45, 0.45, 8, C.woodD, { x, y: CT.tower + 31, z }, 8))
      g.add(ball(0.9, acc, { x, y: CT.tower + 39.4, z }, undefined, [8, 6]))
      g.add(box(7, 4.5, 0.3, acc, { x: x + sx * 3.7, y: CT.tower + 33.5, z }))
    }
  // 门帘：两片挽在门两侧，各系一道带子；门头一条门楣
  const zc = half + t / 2 + 0.45
  for (const s of [-1, 1]) {
    g.add(rbox(11, 60, 1, roof, { x: s * 25.5, y: 2, z: zc }, 0.4))
    g.add(rbox(12, 2.2, 1.8, acc, { x: s * 25.5, y: 28, z: zc }, 0.5))
  }
  g.add(rbox(48, 6, 1.6, acc, { y: 59, z: zc + 0.2 }, 0.5))
  return fitGroup(g)
}

// =====================================================================
// 儿童手工桌：一端架着卷纸筒（纸拉到桌面上），两侧桌腿是收纳格（下层放布筐），前后各塞一把小椅子
// =====================================================================

const ART = { w: 92, d: 46, top: 50, cx: 34 }
/** 小椅子：座面高 26，靠背在 -z（靠背顶 44.8，比桌面底低，推进桌下不顶台面） */
function kidChair(wood: string, seat: string) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.2, 1.1, 24, wood, { x: sx * 11.2, z: sz * 10.2 }, 10))
  g.add(rbox(27, 2.2, 25, seat, { y: 24 }, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(2, 18.6, 2, wood, { x: sx * 11.2, y: 26.2, z: -11.3 }, 0.5))
  g.add(rbox(26.6, 8, 1.8, seat, { y: 35.6, z: -11.3 }, 0.6))
  return g
}
function artTable(p: string[]) {
  const [wood, bin, seat] = p
  const g = new THREE.Group()
  const y1 = ART.top - 2.5
  g.add(rbox(ART.w, 2.5, ART.d, wood, { y: y1 }, 0.8))
  // 两侧收纳格：两块侧板夹两层隔板，中间一块竖隔板分出前后格；下层前后各一只布筐
  for (const s of [-1, 1]) {
    const c = s * ART.cx
    for (const k of [-1, 1]) g.add(rbox(1.6, y1, 42, wood, { x: c + k * 10.2 }, 0.4))
    g.add(rbox(19, 1.6, 41, wood, { x: c, y: 3 }, 0.3))
    g.add(rbox(19, 1.6, 41, wood, { x: c, y: 24 }, 0.3))
    g.add(rbox(19, y1 - 3, 1.2, shade(wood, -0.06), { x: c, y: 3 }, 0.3))
    for (const k of [-1, 1]) g.add(tray(15.5, 10, 17, 0.8, k > 0 ? bin : seat, { x: c, y: 4.6, z: k * 10.5 }))
  }
  // 卷纸架：一端两只支架 + 轴 + 纸卷，纸拉出一截铺在桌面上
  const px = -ART.w / 2 + 3
  for (const z of [-17, 17]) g.add(rbox(2, 6, 2.4, bin, { x: px, y: ART.top, z }, 0.5))
  g.add(cylZ(0.6, 35, STEEL, px, ART.top + 3.6, 0, 10))
  g.add(cylZ(2.6, 31.6, WHITE, px, ART.top + 3.6, 0, 20))
  g.add(rbox(16, 0.2, 30, WHITE, { x: px + 7, y: ART.top }, 0.05))
  // 两把小椅子面朝桌子塞在桌下
  for (const s of [-1, 1]) g.add(P(kidChair(wood, seat), 0, 0, s * 16, 0, s > 0 ? PI : 0))
  return g
}
/** 收纳格上层（前后各一格）的可摆放区 */
const ART_CUBBIES = [-1, 1].flatMap((s) => [rectPoly(s * ART.cx - 9.2, 0.8, s * ART.cx + 9.2, 20.3), rectPoly(s * ART.cx - 9.2, -20.3, s * ART.cx + 9.2, -0.8)])

// =====================================================================
// 长颈鹿身高尺：长脖子就是木尺，顶上是长颈鹿的脑袋（角、耳朵、眼睛、鼻头），左半边每 10cm 一块彩色刻度，右半边几块斑点
// =====================================================================

const GIRAFFE: V2[] = [
  [-6, 0],
  [6, 0],
  [6, 114],
  [10, 118],
  [16, 120],
  [18, 124],
  [17.5, 129],
  [14, 132],
  [6, 135],
  [0, 136],
  [-4, 138],
  [-10, 139],
  [-9, 135],
  [-6, 132],
]
function heightChart(p: string[]) {
  const [body, spot] = p
  const g = new THREE.Group()
  const T = 1.8
  const zf = T / 2
  g.add(flatPlate(polyShape(GIRAFFE), T, body, 0.4))
  // 刻度：每 10cm 一块色块（块之间留缝就是整十刻度），中间一道短横线是半刻度
  for (let i = 0; i < 11; i++) {
    g.add(noOutline(box(4.4, 9.2, 0.6, RAINBOW[i % RAINBOW.length], { x: -3.4, y: i * 10 + 0.4, z: zf + 0.1 })))
    g.add(noOutline(box(2.4, 0.8, 0.6, shade(body, -0.35), { x: 0.6, y: i * 10 + 4.6, z: zf + 0.1 })))
  }
  // 脖子上的斑点
  for (const [x, y, r] of [
    [3.3, 18, 1.7],
    [3, 37, 2.1],
    [3.6, 56, 1.6],
    [3, 73, 2],
    [3.4, 91, 1.7],
    [2.9, 107, 1.9],
    [3, 126, 1.6],
  ])
    g.add(ball(r, spot, { x, y, z: zf }, [1, 1.15, 0.22], [10, 6]))
  // 脑袋：浅色鼻头 + 鼻孔、眼睛、耳朵里、两只角
  g.add(ball(3.4, shade(body, 0.12), { x: 15, y: 125, z: zf }, [1, 0.85, 0.28]))
  g.add(noOutline(ball(0.5, DARK, { x: 16.6, y: 126.2, z: zf + 0.85 })))
  g.add(noOutline(ball(1.1, DARK, { x: 9.5, y: 129.5, z: zf }, [1, 1.1, 0.45])))
  g.add(noOutline(ball(0.35, '#ffffff', { x: 9.8, y: 130, z: zf + 0.45 })))
  g.add(ball(1.4, spot, { x: -7.4, y: 136.8, z: zf }, [1.4, 0.8, 0.25]))
  for (const x of [0.5, 4.5]) {
    g.add(cyl(0.8, 0.9, 9, body, { x, y: 133 }, 10))
    g.add(ball(1.2, spot, { x, y: 142.4 }, [1, 1, 0.75]))
  }
  return fitWall(g, 50, 3.1)
}

// =====================================================================
// 超市收银台玩具：带开口储物格的小柜台，右边一台收银机（钱箱、斜键盘、顾客显示屏），中间立着扫码枪，左边传送带上几样玩具食品
// =====================================================================

function checkoutToy(p: string[]) {
  const [body, top, reg] = p
  const g = new THREE.Group()
  // 柜台：空心箱，正面一个大开口，里面一层隔板；顶上一块台面。
  // 箱体和 kit 的 shell(50, 28, 28, 1.4, { top: false }) 同样的拼法，只是板的圆角细分压到 4 段（shell 用默认 16 段，一块板五百多个三角面）
  const ct = 1.4
  const pane = (w: number, holes: Hole[], at: { x?: number; y?: number; z?: number; ry?: number }) => holePanel(w, 28 - ct, ct, body, holes, at, 1.5, { seg: 4 })
  g.add(pane(50, [{ kind: 'rect', x: 0, y: 4 - ct, w: 40, h: 19, r: 2 }], { y: ct, z: 14 - ct / 2 }))
  g.add(pane(50, [], { y: ct, z: -14 + ct / 2, ry: PI }))
  for (const s of [-1, 1]) g.add(pane(28 - ct * 2, [], { x: s * (25 - ct / 2), y: ct, ry: (s * PI) / 2 }))
  g.add(rbox(50, ct, 28, body, {}, Math.min(ct * 0.4, 1)))
  g.add(rbox(47.4, 1.2, 25, shade(body, -0.06), { y: 13 }, 0.3))
  g.add(rbox(50, 2, 30, top, { y: 28 }, 0.8))
  // 传送带 + 两头的滚筒
  g.add(rbox(18, 0.6, 24, DARK, { x: -15, y: 30 }, 0.25))
  for (const x of [-23.7, -6.3]) g.add(cylZ(0.7, 24.4, STEEL, x, 30.4, 0, 10))
  // 玩具食品：苹果、牛奶盒、香蕉、罐头
  g.add(ball(2.6, '#e8483f', { x: -20, y: 33, z: 5 }))
  g.add(cyl(0.25, 0.25, 1.4, C.woodD, { x: -20, y: 35.2, z: 5 }, 6))
  g.add(ball(1.5, C.leaf, { x: -19.1, y: 36.1, z: 5 }, [1, 0.35, 0.6]))
  g.add(rbox(4.6, 7, 4.6, WHITE, { x: -14, y: 30.6, z: 6 }, 0.3))
  g.add(rbox(4.8, 2.6, 4.8, '#5b8def', { x: -14, y: 32.4, z: 6 }, 0.3))
  const gable = sideSlab(
    [
      [-2.3, 0],
      [2.3, 0],
      [0, 2],
    ],
    4.6,
    WHITE,
    -14,
    { bevel: 0.2 },
  )
  gable.position.set(-14, 37.5, 6)
  g.add(gable)
  g.add(rbox(4.6, 1, 0.6, WHITE, { x: -14, y: 39.2, z: 6 }, 0.2))
  g.add(
    cappedTube(
      [
        [-21, 31.6, -4],
        [-18, 31.2, -6],
        [-14.5, 31.4, -6.6],
        [-12, 32.2, -5.2],
      ],
      1.1,
      '#f5d14a',
      { seg: 16 },
    ),
  )
  g.add(cyl(2, 2, 5, '#f2c230', { x: -9.4, y: 30.6, z: 5 }, 20))
  g.add(cyl(2.1, 2.1, 2.4, '#e8483f', { x: -9.4, y: 31.9, z: 5 }, 20))
  g.add(cyl(1.7, 1.7, 0.6, STEEL, { x: -9.4, y: 35.4, z: 5 }, 20))
  // 扫码枪：立在小托座上，枪头朝前，前面一块红色发光窗
  g.add(rbox(5, 3, 6, reg, { x: -2.6, y: 30, z: -6 }, 0.8))
  g.add(rbox(2.2, 7, 3, DARK, { x: -2.6, y: 32.6, z: -6.4 }, 0.8))
  g.add(rbox(3.4, 3.6, 6.5, DARK, { x: -2.6, y: 39, z: -4.9 }, 1))
  g.add(rbox(1, 2, 1.2, reg, { x: -2.6, y: 37, z: -4.4 }, 0.3))
  g.add(lit(rbox(2.4, 2, 0.4, '#ff5a4f', { x: -2.6, y: 39.8, z: -1.6 }, 0.15), '#ff5a4f', 0.7))
  // 收银机：钱箱（一道抽屉缝、一只圆钮）+ 斜面键盘座 + 立杆上的顾客显示屏
  const rx = 11.5
  g.add(rbox(22, 6, 18, reg, { x: rx, y: 30, z: -1 }, 1))
  g.add(noOutline(rbox(17, 0.7, 0.4, shade(reg, -0.25), { x: rx, y: 32.6, z: 8.05 }, 0.15)))
  g.add(ball(0.8, WHITE, { x: rx, y: 34.2, z: 8 }))
  const wedge = sideSlab(
    [
      [-9, 0],
      [8, 0],
      [8, 2],
      [-9, 7],
    ],
    20,
    reg,
    rx,
  )
  wedge.position.set(rx, 36, -1)
  g.add(wedge)
  // 键盘：沿斜面摆 3 × 4 个数字键 + 一只长回车键
  const { g: kf } = tiltFrame([-10, 43], [7, 38], 'z')
  kf.position.x = rx
  for (const x of [-6.5, -3, 0.5])
    for (const zl of [4, 7.5, 11, 14.5]) kf.add(noOutline(box(2.8, 0.9, 2.6, '#fffdf5', { x, y: -0.4, z: zl })))
  kf.add(noOutline(rbox(4.5, 0.9, 6.2, '#ff8f86', { x: 5.2, y: -0.4, z: 12.2 }, 0.3)))
  kf.add(noOutline(rbox(4.5, 0.9, 2.6, '#8fd49a', { x: 5.2, y: -0.4, z: 4.8 }, 0.3)))
  g.add(kf)
  g.add(cyl(0.9, 0.9, 5, STEEL, { x: rx + 4, y: 42, z: -8 }, 10))
  g.add(rbox(12, 4.2, 2.2, reg, { x: rx + 3, y: 46, z: -8 }, 0.6))
  g.add(glow(9.4, 2.6, '#7fe0c8', { x: rx + 3, y: 46.8, z: -6.65 }))
  return fitGroup(g)
}

// =====================================================================
// 儿童木工台：四腿桌 + 下层搁板（放一只零件盒），后面一块洞洞板挂着锤子、锯子、扳手；台面上一块插着大木螺丝的木块、一把螺丝刀和一台小台钳
// =====================================================================

/** 玩具大螺丝：插在木块里的螺杆（两道螺纹）+ 十字头 */
function toyScrew(g: THREE.Group, x: number, y: number, z: number, color: string) {
  g.add(cyl(1, 1, 4.6, color, { x, y: y - 0.8, z }, 12))
  for (const dy of [1.2, 2.5]) g.add(torus(1, 0.35, color, { x, y: y + dy, z, rx: PI / 2 }, PI * 2, [4, 12]))
  g.add(puck(2.1, 1.4, color, { x, y: y + 3.6, z }))
  g.add(noOutline(box(2.6, 0.5, 0.5, DARK, { x, y: y + 4.8, z })))
}
function kidWorkbench(p: string[]) {
  const [wood, board, tool] = p
  const g = new THREE.Group()
  const top = 50
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, top - 3, 4, wood, { x: sx * 27, z: sz * 13 }, 0.8))
  g.add(rbox(60, 3, 32, wood, { y: top - 3 }, 0.8))
  g.add(rbox(50.4, 4, 2, wood, { y: top - 7, z: 13 }, 0.5))
  g.add(rbox(50.4, 1.8, 26.4, wood, { y: 12 }, 0.4))
  // 洞洞板：两根立柱夹着，顶上一根横梁
  const holes = []
  for (let i = 0; i < 9; i++) for (const y of [3, 9.5, 16]) holes.push({ kind: 'circle' as const, x: -24 + i * 6, y, r: 0.55, n: 8 })
  g.add(holePanel(56.4, 18.4, 1.6, board, holes, { y: top, z: -14 }, 0, { bevel: 0 }))
  for (const sx of [-1, 1]) g.add(rbox(3, 20, 3, wood, { x: sx * 28.5, y: top, z: -14 }, 0.6))
  g.add(rbox(60, 2, 3, wood, { y: top + 18, z: -14 }, 0.6))
  // 板上挂的工具（背面贴着洞洞板正面 z = -13.2）
  g.add(rbox(1.6, 11, 1.2, C.woodD, { x: -17, y: 53, z: -12.55 }, 0.4))
  g.add(rbox(6.5, 2.6, 2.6, tool, { x: -17, y: 62.5, z: -12 }, 0.6))
  const teeth: V2[] = []
  for (let x = 6.5; x > -7; x -= 1.5) teeth.push([x, 1.2], [x - 0.75, 0])
  g.add(P(flatPlate(polyShape([[-7, 4.6], [6.5, 6], ...teeth, [-7, 1.2]]), 0.5, STEEL, 0.1), 2, 54, -12.9))
  g.add(rbox(4.5, 6.5, 1.6, tool, { x: 10.5, y: 54.2, z: -12.6 }, 0.8))
  g.add(rbox(1.8, 9, 0.8, STEEL, { x: 20, y: 55, z: -12.75 }, 0.3))
  g.add(torus(1.7, 0.6, STEEL, { x: 20, y: 65.2, z: -12.75 }, PI * 2, [6, 16]))
  // 台面：插着三颗大螺丝的木块
  g.add(rbox(16, 4, 9, shade(wood, 0.08), { x: -10, y: top, z: 4 }, 0.6))
  ;[-15, -10, -5].forEach((x, i) => toyScrew(g, x, top + 4, 4, [tool, board, C.lemon][i]))
  // 螺丝刀（平放）、两颗六角螺母
  g.add(cylX(1.3, 7, tool, 12, top + 1.3, 7, 12))
  g.add(cylX(0.45, 6, STEEL, 18.3, top + 1.3, 7, 8))
  for (const [x, z] of [
    [3, 9],
    [6.5, 11],
  ])
    g.add(cyl(1.5, 1.5, 1, C.lemon, { x, y: top, z }, 6))
  // 台钳：底座 + 两片钳口 + 丝杆和手柄
  g.add(rbox(10, 3, 7, board, { x: 21, y: top, z: 10 }, 0.6))
  for (const z of [7.2, 12.6]) g.add(rbox(10, 4.5, 1.6, board, { x: 21, y: top + 2.6, z }, 0.4))
  g.add(cylZ(0.6, 8, STEEL, 21, top + 4.5, 15, 8))
  g.add(cylX(0.4, 7, STEEL, 21, top + 4.5, 19, 8))
  for (const s of [-1, 1]) g.add(ball(0.8, tool, { x: 21 + s * 3.6, y: top + 4.5, z: 19 }, undefined, [6, 4]))
  // 下层：零件盒里几颗螺母
  g.add(tray(18, 6, 11, 0.8, board, { x: -12, y: 13.8 }))
  for (const x of [-16, -12.5, -9]) g.add(cyl(1.4, 1.4, 1, C.lemon, { x, y: 14.6, z: (x % 2) * 1.5 }, 6))
  return fitGroup(g)
}

// =====================================================================
// 摇摇船：两块月牙形侧板（底边是摇弧，上沿是凹弧，两头各一个把手孔）夹着一排板条；翻过来就是小台阶
// =====================================================================

const RB = { L: 45, R: 90.4 }
const rbBottom = (x: number) => RB.R - Math.sqrt(RB.R * RB.R - x * x)
const rbTop = (x: number) => 14 + 21 * (x / RB.L) ** 2
/** 跑道形把手孔 */
function slotPts(cx: number, cy: number, hw: number, r: number): V2[] {
  const out: V2[] = []
  for (let i = 0; i <= 8; i++) {
    const a = -PI / 2 + (i * PI) / 8
    out.push([cx + hw + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  for (let i = 0; i <= 8; i++) {
    const a = PI / 2 + (i * PI) / 8
    out.push([cx - hw + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}
function rockingBoat(p: string[]) {
  const [side, slat] = p
  const g = new THREE.Group()
  const outline: V2[] = []
  for (let i = 0; i <= 18; i++) {
    const x = -RB.L + (i / 18) * RB.L * 2
    outline.push([x, rbBottom(x)])
  }
  for (let i = 18; i >= 0; i--) {
    const x = -RB.L + (i / 18) * RB.L * 2
    outline.push([x, rbTop(x)])
  }
  const shape = polyShape(outline, [slotPts(-34, 16.3, 2.4, 2.2), slotPts(34, 16.3, 2.4, 2.2)])
  for (const s of [-1, 1]) g.add(P(flatPlate(shape, 2.4, side, 0.5), 0, 0, s * 20))
  // 板条：沿上沿凹弧排开，顶面比侧板上沿低一点，两端插进侧板
  for (let i = 0; i < 9; i++) {
    const x = -34 + i * 8.5
    const a = Math.atan((2 * 21 * x) / (RB.L * RB.L))
    const off = 1.6
    g.add(P(rbox(6, 2, 40, slat, {}, 0.6), x + Math.sin(a) * off, rbTop(x) - Math.cos(a) * off, 0, 0, 0, a))
  }
  return fitGroup(g)
}

// =====================================================================
// 儿童小沙发：圆脚上的软底座，两块坐垫，粗圆扶手，靠背顶上两团云朵鼓包，一只圆抱枕
// =====================================================================

function kidSofa(p: string[]) {
  const [fab, leg, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2, 1.5, 6.5, leg, { x: sx * 33, z: sz * 15 }, 12))
  g.add(rbox(80, 12, 40, fab, { y: 6 }, 3))
  for (const sx of [-1, 1]) g.add(rbox(11, 28, 42, fab, { x: sx * 34.5, y: 6 }, 5))
  g.add(rbox(59, 24, 11, fab, { y: 16, z: -15.5 }, 4.5))
  for (const sx of [-1, 1]) {
    g.add(ball(14, fab, { x: sx * 14.6, y: 37, z: -15.5 }, [1.04, 0.62, 0.38]))
    g.add(rbox(28.6, 8, 30, shade(fab, 0.07), { x: sx * 14.4, y: 17.6, z: 4.6 }, 3.5))
  }
  g.add(P(puck(7, 4, acc), -18, 32, -7, PI / 2 - 0.25))
  return fitGroup(g)
}

// =====================================================================
// 蒙氏玩具架：矮矮的两层开放架，中间一块竖隔板分成四格，侧板上开一道提手孔，背板换个颜色
// =====================================================================

const MS = { w: 100, d: 30, h: 60, t: 1.8, base: 4, mid: 31 }
function montessoriShelf(p: string[]) {
  const [wood, back] = p
  const g = new THREE.Group()
  const { w, d, h, t, base } = MS
  const iw = w - t * 2
  for (const s of [-1, 1]) g.add(holePanel(d, h, t, wood, [{ kind: 'rect', x: 0, y: h - 9, w: 10, h: 3.6, r: 1.8 }], { x: s * (w / 2 - t / 2), ry: PI / 2 }, 4, { seg: 5 }))
  g.add(rbox(iw + 0.02, t, d, wood, { y: h - t }, 0.3))
  g.add(rbox(iw + 0.2, t, d - 1.4, wood, { y: base, z: 0.7 }, 0.3))
  g.add(rbox(iw, base, d - 6, shade(wood, -0.12), { z: -1 }, 0.3))
  g.add(rbox(iw, h - base - t * 2, 1.2, back, { y: base + t, z: -d / 2 + 0.6 }, 0.3))
  g.add(rbox(iw + 0.2, 1.6, d - 2.6, wood, { y: MS.mid - 1.6, z: 0.6 }, 0.3))
  g.add(rbox(t, h - base - t * 2, d - 2.4, wood, { y: base + t, z: 0.6 }, 0.3))
  return g
}
/** 每层左右两格的摆放区 */
const msBays = (): [number, number][][] => [rectPoly(-MS.w / 2 + 2.2, -13, -1.4, 14), rectPoly(1.4, -13, MS.w / 2 - 2.2, 14)]

// =====================================================================
// 小屋地床：贴地的矮床框（床垫直接落在框里）+ 房子形的木架（四根立柱、檐梁、两端人字椽、屋脊），床头一段护栏，正面山墙挂一串三角彩旗
// =====================================================================

function floorBed(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  const X = 46.5
  const Z = 96.5
  // 床框：四边矮围边 + 床板 + 床垫
  for (const s of [-1, 1]) {
    g.add(rbox(4, 9, 194, frame, { x: s * 47 }, 1))
    g.add(rbox(98, 9, 4, frame, { z: s * 97 }, 1))
  }
  g.add(rbox(90.4, 2, 190.4, shade(frame, -0.08), { y: 1 }, 0.5))
  const top = 16
  g.add(rbox(87.6, 13, 187, WHITE, { y: 3 }, 4.5))
  g.add(pillowMesh(44, 8, 26, WHITE, { y: top - 0.5, z: -77 }))
  // 被子 + 翻折的被头
  const l = 112
  const zc = 34
  g.add(duvet({ w: 88.2, len: l, top: top + 6, z1: zc + l / 2, drop: 3, thick: 3, color: fab, seed: 7 }))
  g.add(pillowMesh(88.8, 3.6, 12, WHITE, { y: top + 4, z: zc - l / 2 + 6 }, 0.5))
  // 房子架：立柱、两侧檐梁、屋脊、两端人字椽
  const PH = 110
  const RY = 146
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, PH, 5, frame, { x: sx * X, z: sz * Z }, 1.2))
  for (const sx of [-1, 1]) g.add(rbox(5, 5, 198, frame, { x: sx * X, y: PH - 5 }, 1.2))
  g.add(rbox(5, 5, 198, frame, { y: RY - 2.5 }, 1.2))
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) g.add(batten([sx * X, PH - 2, sz * Z], [0, RY, sz * Z], 5, 5, frame))
  // 床头一段护栏：床头两道横栏，两侧各两道到中间的立柱
  for (const sx of [-1, 1]) {
    g.add(rbox(4, 32, 4, frame, { x: sx * X, z: -30 }, 1))
    for (const y of [20, 30]) g.add(rbox(3, 3.5, 65, frame, { x: sx * X, y, z: -62 }, 0.8))
  }
  for (const y of [20, 30]) g.add(rbox(88.4, 3.5, 3, frame, { y, z: -Z }, 0.8))
  // 正面山墙上一串三角彩旗：绳子两端系在两根椽上，中间垂下
  const sag = (x: number) => 101 + 12.3 * (x / 40) ** 2
  const rope: V3[] = []
  for (let i = 0; i <= 8; i++) rope.push([-40 + i * 10, sag(-40 + i * 10), Z])
  g.add(tube(rope, 0.25, '#8a7a6a', { seg: 16, radial: 5 }))
  const flagColors = [acc, fab, shade(acc, 0.25)]
  const tri = polyShape([
    [-3, 0],
    [3, 0],
    [0, -6.5],
  ])
  for (let i = 0; i < 7; i++) {
    const x = -27 + i * 9
    g.add(P(flatPlate(tri, 0.3, flagColors[i % 3], 0.05), x, sag(x) + 0.15, Z, 0, 0, Math.atan((2 * 12.3 * x) / 1600)))
  }
  return fitGroup(g)
}

// =====================================================================
// 木质婴儿健身架：两副 A 字木腿顶着一根横杆，杆上用棉绳吊着木环、星星和一串木珠
// =====================================================================

function babyGymWood(p: string[]) {
  const [wood, toyA, toyB] = p
  const g = new THREE.Group()
  const H = 52
  const X = 27
  const Z = 23
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rod3([sx * X, 0.7, sz * Z], [sx * X, H, 0], 1.6, wood, 12))
    g.add(ball(2.4, wood, { x: sx * X, y: H }))
  }
  g.add(cylX(1.5, 58, wood, 0, H, 0, 14))
  const hang = (x: number, y1: number) => g.add(cyl(0.22, 0.22, H - 1.2 - y1, CORD, { x, y: y1 }, 6))
  // 木环
  hang(-13, 36.8)
  g.add(torus(3.6, 0.9, toyA, { x: -13, y: 33 }, PI * 2, [8, 20]))
  // 星星
  hang(0, 36)
  g.add(P(flatPlate(polyShape(starPts(0, 0, 4.6, 2.1)), 1.6, toyB, 0.3), 0, 32, 0))
  // 一串木珠，底下一颗大的
  hang(13, 40)
  g.add(ball(1.8, toyA, { x: 13, y: 39 }))
  g.add(ball(1.8, toyB, { x: 13, y: 35.6 }))
  g.add(ball(3, wood, { x: 13, y: 31 }))
  return fitGroup(g)
}

// =====================================================================
// 哺乳摇椅：两条弧形摇脚上立着木腿，宽厚的软包扶手、厚坐垫、后仰的高靠背和一只腰枕；前面一只配套搁脚凳
// =====================================================================

function nursingChair(p: string[]) {
  const [fab, wood, acc] = p
  const g = new THREE.Group()
  const zc = -14
  // 摇脚：侧视轮廓（z 朝前），底边是弧
  const run: V2[] = []
  for (let i = 0; i <= 12; i++) {
    const z = zc - 31 + (i * 62) / 12
    run.push([z, 4 * ((z - zc) / 31) ** 2])
  }
  for (let i = 12; i >= 0; i--) {
    const z = zc - 31 + (i * 62) / 12
    run.push([z, 4 * ((z - zc) / 31) ** 2 + 4.5])
  }
  for (const sx of [-1, 1]) {
    g.add(sideSlab(run, 3.6, wood, sx * 30))
    for (const dz of [-22, 22]) g.add(rbox(4, 26, 4, wood, { x: sx * 30, y: 4, z: zc + dz }, 0.8))
  }
  g.add(rbox(64, 4, 56, wood, { y: 28, z: zc }, 1))
  // 软包：扶手、坐垫、后仰靠背、腰枕
  for (const sx of [-1, 1]) g.add(rbox(14, 34, 58, fab, { x: sx * 33, y: 30, z: zc }, 5))
  g.add(rbox(52.4, 14, 52, shade(fab, 0.05), { y: 31, z: zc + 2 }, 5))
  g.add(P(rbox(52.4, 60, 13, fab, {}, 6), 0, 40 + 30 * Math.cos(0.18), -33 - 30 * Math.sin(0.18), -0.18))
  g.add(P(rbox(36, 18, 7, acc, {}, 3), 0, 55.4, -26.7, -0.18))
  // 搁脚凳：四条木腿 + 框 + 软垫，中间一颗包扣
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.3, 24, wood, { x: sx * 17, z: 31 + sz * 8 }, 10))
  g.add(rbox(44, 3, 22, wood, { y: 23, z: 31 }, 0.8))
  g.add(rbox(46, 11, 25, fab, { y: 25, z: 31 }, 4.5))
  g.add(noOutline(ball(1, acc, { y: 36, z: 31 })))
  return fitGroup(g)
}

// =====================================================================
// 婴儿看护三件套：兔耳朵硅胶小夜灯、白噪音机（顶上一圈圈出声孔）、带天线的看护器显示屏
// =====================================================================

function babyMonitorSet(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  // 小夜灯
  const nx = -9
  g.add(puck(4.6, 2, sub, { x: nx }))
  g.add(litOutlined(ball(4.2, NIGHT, { x: nx, y: 6.2 }, [1, 1.08, 1]), NIGHT, 0.5))
  for (const s of [-1, 1]) g.add(litOutlined(ball(1.6, NIGHT, { x: nx + s * 1.9, y: 11.6, rz: -s * 0.25 }, [0.6, 1.6, 0.5], [10, 8]), NIGHT, 0.5))
  g.add(noOutline(ball(0.5, acc, { x: nx, y: 1, z: 4.3 }, undefined, [6, 4])))
  // 白噪音机
  const wx = 1
  g.add(cyl(4.8, 5, 5, main, { x: wx }, 32))
  g.add(cyl(4.4, 4.4, 0.5, shade(main, -0.12), { x: wx, y: 4.8 }, 32))
  for (const [r, n] of [
    [1.6, 6],
    [3.1, 12],
  ])
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2
      g.add(noOutline(ball(0.3, DARK, { x: wx + Math.cos(a) * r, y: 5.3, z: Math.sin(a) * r }, [1, 0.5, 1], [6, 4])))
    }
  g.add(lit(ball(0.45, '#9fe8ff', { x: wx, y: 2.6, z: 4.85 }), '#9fe8ff', 0.6))
  // 看护器显示屏：底座 + 往后仰的机身，屏上是夜视画面，右上一根天线
  const mx = 11
  g.add(rbox(7, 1.2, 5, main, { x: mx, z: -0.5 }, 0.5))
  const scr = new THREE.Group()
  scr.add(rbox(9, 7, 1.6, acc, {}, 0.6))
  scr.add(
    paintPanel(
      6.6,
      4.8,
      'kr-monitor-night',
      (c, W, H) => {
        c.fillStyle = '#2f4a3f'
        c.fillRect(0, 0, W, H)
        c.fillStyle = '#4f7564'
        c.fillRect(0, H * 0.62, W, H * 0.38)
        c.strokeStyle = '#7fa890'
        c.lineWidth = Math.max(2, W * 0.02)
        for (let i = 0; i < 7; i++) {
          const x = W * (0.12 + i * 0.125)
          c.beginPath()
          c.moveTo(x, H * 0.2)
          c.lineTo(x, H * 0.66)
          c.stroke()
        }
        c.fillStyle = '#cfe8d8'
        c.beginPath()
        c.arc(W * 0.42, H * 0.72, H * 0.1, 0, PI * 2)
        c.fill()
        c.fillStyle = '#a9cbb8'
        c.beginPath()
        c.ellipse(W * 0.62, H * 0.76, W * 0.16, H * 0.08, 0, 0, PI * 2)
        c.fill()
      },
      { y: 1.1, z: 0.86 },
      0.55,
    ),
  )
  scr.add(cyl(0.45, 0.45, 5, acc, { x: 3.4, y: 6.6, z: -0.2 }, 8))
  scr.add(ball(0.7, acc, { x: 3.4, y: 11.7, z: -0.2 }))
  g.add(P(scr, mx, 0.9, 0.4, -0.2))
  return fitGroup(g)
}

// =====================================================================
// 儿童房墙贴：左边一朵大云挂着一颗星星，右边一朵小云，一架小飞机从大云旁拖着航迹飞向小云；几颗星星贴在云边上
// 底层（云）贴墙，上层（星星、航迹、飞机）叠在底层上面，所有贴片连成一片
// =====================================================================

/** 小飞机侧影（机头朝 +x，机翼往后掠到机身下方），单位尺寸约 20 × 10 */
const PLANE: V2[] = [
  [8, 0],
  [9.6, 0.4],
  [10.2, 1.2],
  [9.6, 2],
  [8.4, 2.4],
  [-5, 2.4],
  [-7.8, 6.4],
  [-9.8, 6.4],
  [-9, 2],
  [-9.6, 0.6],
  [-8.5, 0],
  [-1, 0],
  [-4.6, -3.6],
  [-2.4, -3.6],
  [2.2, 0],
]
function wallDecals(p: string[]) {
  const [cloud, star, plane] = p
  const g = new THREE.Group()
  // 两层：底层 z 0..0.35 贴墙，上层 z 0.35..0.65
  const low = (pts: V2[], c: string) => P(flatPlate(polyShape(pts), 0.35, c, 0.07), 0, 0, 0.175)
  const up = (pts: V2[], c: string) => P(flatPlate(polyShape(pts), 0.3, c, 0.06), 0, 0, 0.5)
  g.add(low(cloudPts(-14, -4, 1), cloud))
  g.add(low(cloudPts(20, -6, 0.7), cloud))
  // 星星：两颗压在云边，一颗用细绳挂在大云下面
  g.add(up(starPts(-24, 9.5, 3.2, 1.4, 0.2), star))
  g.add(up(starPts(27, -5.5, 2.4, 1.05, -0.3), star))
  g.add(up(starPts(-12, -13, 2.8, 1.2), star))
  g.add(up(placePts([[-0.18, 0], [0.18, 0], [0.18, 8.6], [-0.18, 8.6]], -12, -11), star))
  // 航迹：从大云右上方弯弯地拖到飞机尾巴
  const trail: V2[] = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    trail.push([-7 + t * 13.4, 7.5 - t * 1.4 + Math.sin(t * PI * 2) * 1.6])
  }
  const half = 0.45
  const left: V2[] = []
  const right: V2[] = []
  trail.forEach(([x, y], i) => {
    const [ax, ay] = trail[Math.max(0, i - 1)]
    const [bx, by] = trail[Math.min(trail.length - 1, i + 1)]
    const l = Math.hypot(bx - ax, by - ay)
    const nx = (-(by - ay) / l) * half
    const ny = ((bx - ax) / l) * half
    left.push([x + nx, y + ny])
    right.push([x - nx, y - ny])
  })
  g.add(up([...left, ...right.reverse()], shade(star, 0.25)))
  // 飞机：机身 + 一排圆窗
  const pr = 0.22
  g.add(up(placePts(PLANE, 15, 6.5, 1, pr), plane))
  for (const x of [-3, 0, 3, 6]) {
    const [[wx, wy]] = placePts([[x, 1.3]], 15, 6.5, 1, pr)
    g.add(noOutline(cylZ(0.55, 0.14, WHITE, wx, wy, 0.69, 10)))
  }
  // 上下居中、左右居中（背面贴墙 z = 0 不动）
  const b = box3(g)
  const dx = -(b.min.x + b.max.x) / 2
  const dy = -(b.min.y + b.max.y) / 2
  for (const c of g.children) {
    c.position.x += dx
    c.position.y += dy
  }
  return g
}

// =====================================================================
// 字母数字拼图地垫：5 × 5 块 30cm 的泡沫拼块，接缝是互相咬合的燕尾齿，每块中间嵌一个色块拼成的字母 / 数字
// =====================================================================

const PZ = { n: 5, s: 30, t: 1.2 }
/** 一段接缝（长 30）上的两个燕尾齿：[沿缝位置 u, 垂直接缝的偏移]，sgn 为齿往哪边凸 */
const seamTeeth = (sgn: number): V2[] => {
  const d = 2.6 * sgn
  return [
    [7.5, 0],
    [6.5, d],
    [13.5, d],
    [12.5, 0],
    [17.5, 0],
    [16.5, d],
    [23.5, d],
    [22.5, 0],
  ]
}
/** 3 × 5 格的方块字形：[x, y, w, h]（格为单位，y 朝上） */
const GLYPHS: [number, number, number, number][][] = [
  [[0, 0, 1, 4], [2, 0, 1, 4], [0, 4, 3, 1], [1, 2, 1, 1]],
  [[0, 0, 1, 5], [1, 0, 2, 1], [1, 4, 2, 1]],
  [[0, 0, 1, 5], [1, 0, 2, 1], [1, 2, 1.6, 1], [1, 4, 2, 1]],
  [[1, 0, 1, 5], [0, 3.6, 1, 1]],
  [[0, 0, 1, 5], [2, 0, 1, 5], [1, 2, 1, 1]],
  [[0, 4, 3, 1], [2, 2, 1, 2], [0, 2, 2, 1], [0, 0, 1, 2], [1, 0, 2, 1]],
  [[0, 0, 1, 5], [1, 0, 2, 1]],
  [[0, 4, 3, 1], [1, 0, 1, 4]],
  [[0, 2, 1, 3], [2, 0, 1, 5], [1, 2, 1, 1]],
  [[0, 0, 1, 5], [2, 0, 1, 5], [1, 0, 1, 1]],
  [[0, 0, 1, 5], [1, 2, 1.6, 1], [1, 4, 2, 1]],
  [[0, 4, 3, 1], [2, 0, 1, 4]],
  [[0, 0, 1, 5], [2, 0, 1, 5], [1, 0, 1, 1], [1, 4, 1, 1]],
  [[0, 4, 3, 1], [0, 2, 1, 2], [1, 2, 2, 1], [2, 0, 1, 2], [0, 0, 2, 1]],
]
function puzzleMat(p: string[]) {
  const g = new THREE.Group()
  const { n, s, t } = PZ
  const o = (-n * s) / 2
  const seamSign = (k: number, m: number) => ((k + m) % 2 ? 1 : -1)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x0 = o + i * s
      const y0 = o + j * s
      const x1 = x0 + s
      const y1 = y0 + s
      const pts: V2[] = [[x0, y0]]
      if (j > 0) for (const [u, d] of seamTeeth(seamSign(j, i))) pts.push([x0 + u, y0 + d])
      pts.push([x1, y0])
      if (i < n - 1) for (const [u, d] of seamTeeth(seamSign(i + 1, j))) pts.push([x1 + d, y0 + u])
      pts.push([x1, y1])
      if (j < n - 1) for (const [u, d] of seamTeeth(seamSign(j + 1, i)).reverse()) pts.push([x0 + u, y1 + d])
      pts.push([x0, y1])
      if (i > 0) for (const [u, d] of seamTeeth(seamSign(i, j)).reverse()) pts.push([x0 + d, y0 + u])
      // 每块往自己中心收一点点，和相邻块之间留一道细缝
      const cx = x0 + s / 2
      const cy = y0 + s / 2
      const k = 1 - 0.08 / (s / 2)
      const tile = pts.map(([x, y]): V2 => [cx + (x - cx) * k, cy + (y - cy) * k])
      const ci = (i + j * 2) % 4
      g.add(P(flatPlate(polyShape(tile), t, p[ci], 0.25), 0, t / 2, 0, -PI / 2))
      // 中间的字形色块：嵌在拼块里，顶面高出一点
      const u = 3.4
      const glyph = GLYPHS[(i + j * n) % GLYPHS.length].map(([gx, gy, gw, gh]) => {
        const ax = cx - 1.5 * u + gx * u
        const ay = cy - 2.5 * u + gy * u
        return polyShape([
          [ax, ay],
          [ax + gw * u, ay],
          [ax + gw * u, ay + gh * u],
          [ax, ay + gh * u],
        ])
      })
      g.add(P(flatPlate(glyph, 0.42, shade(p[(ci + 2) % 4], -0.14), 0), 0, 0.9 + 0.21, 0, -PI / 2))
    }
  return g
}

// =====================================================================
// 配色
// =====================================================================

const TENT_PALS: Pal[] = [
  ['cute', [C.sakura, C.lilac, C.pink]],
  ['cute', [C.white, C.sky, C.lemon]],
  ['nordic', [N.linen, N.sage, N.mustard]],
  ['retro', [R.cream, R.red, R.teal]],
  ['modern', [M.light, M.char, '#e8a33d']],
]
const ART_PALS: Pal[] = [
  ['nordic', [N.oakL, N.sage, N.mustard]],
  ['cute', [C.white, C.pink, C.sky]],
  ['cute', [C.woodL, C.mint, C.lemon]],
  ['modern', [M.white, '#5b8def', M.char]],
  ['japanese', [J.hinoki, J.ai, J.shu]],
]
const HEIGHT_PALS: Pal[] = [
  ['cute', ['#ffd77a', '#c9854a']],
  ['nordic', [N.oakL, N.oak]],
  ['cute', [C.woodL, C.peach]],
  ['retro', [R.cream, R.caramel]],
  ['japanese', [J.hinoki, J.wood]],
]
const REG_PALS: Pal[] = [
  ['cute', [C.white, C.pink, C.sky]],
  ['cute', [C.sky, C.white, C.pink]],
  ['nordic', [N.oakL, N.white, N.sage]],
  ['retro', [R.red, R.cream, R.teal]],
  ['modern', [M.white, M.light, '#5b8def']],
]
const WB_PALS: Pal[] = [
  ['cute', [C.woodL, C.sky, C.red]],
  ['nordic', [N.oak, N.white, N.mustard]],
  ['retro', [R.caramel, R.cream, R.teal]],
  ['modern', [M.white, M.light, '#e8483f']],
]
const BOAT_PALS: Pal[] = [
  ['cute', [C.mint, C.woodL]],
  ['cute', [C.pink, C.woodL]],
  ['nordic', [N.sage, N.oakL]],
  ['retro', [R.mustard, R.cream]],
  ['japanese', [J.hinoki, J.wood]],
]
const SOFA_PALS: Pal[] = [
  ['cute', [C.pink, C.woodL, C.lemon]],
  ['cute', [C.mint, C.white, C.pink]],
  ['cute', [C.sky, C.woodL, C.lemon]],
  ['nordic', [N.linen, N.oak, N.mustard]],
  ['retro', [R.mustard, R.caramel, R.teal]],
]
const SHELF_PALS: Pal[] = [
  ['nordic', [N.oakL, N.sage]],
  ['nordic', [N.oakL, N.white]],
  ['cute', [C.white, C.mint]],
  ['japanese', [J.hinoki, J.washi]],
  ['modern', [M.white, M.light]],
]
const BED_PALS: Pal[] = [
  ['nordic', [N.oakL, N.sage, N.mustard]],
  ['nordic', [N.white, N.blue, C.pink]],
  ['cute', [C.woodL, C.pink, C.sky]],
  ['japanese', [J.hinoki, J.ai, J.shu]],
  ['modern', [M.light, M.char, '#e8a33d']],
]
const GYM_PALS: Pal[] = [
  ['nordic', [N.oakL, N.sage, N.mustard]],
  ['cute', [C.woodL, C.pink, C.mint]],
  ['japanese', [J.hinoki, J.ai, J.shu]],
  ['modern', [M.white, M.gray, '#e8a33d']],
]
const NURSE_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.sage]],
  ['nordic', [N.gray, N.oakL, N.mustard]],
  ['modern', [M.light, M.walnut, M.char]],
  ['cute', [C.sakura, C.woodL, C.white]],
  ['classic', [CL.cream, CL.walnut, CL.sage]],
]
const MON_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['cute', [C.white, C.pink, C.sky]],
  ['nordic', [N.white, N.oak, N.gray]],
  ['cute', [C.mint, C.white, C.lilac]],
]
const DECAL_PALS: Pal[] = [
  ['cute', [C.sky, C.lemon, C.red]],
  ['cute', [C.white, C.lemon, C.sky]],
  ['nordic', [N.blue, N.mustard, N.white]],
  ['nordic', [N.gray, N.mustard, N.sage]],
  ['cute', [C.lilac, C.lemon, C.pink]],
]
const MAT_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.lemon, C.mint]],
  ['cute', [C.lilac, C.peach, C.mint, C.sky]],
  ['nordic', [N.sage, N.linen, N.blue, N.mustard]],
  ['modern', [M.light, M.gray, M.white, '#e8a33d']],
  ['retro', [R.teal, R.mustard, R.orange, R.cream]],
]

const KID_TOY: Partial<AssetDef> = { type: 'toy', tags: ['for-kids'] }
const BABY_TOY: Partial<AssetDef> = { type: 'toy', tags: ['for-kids', 'for-baby'] }

export const KIDS_ROOM: AssetDef[] = [
  define('kr-play-tent-castle', '城堡游戏帐', 'kids', [121, 121, 140], TENT_PALS, castleTent, { ...KID_TOY, mats: ['fabric', 'fabric', 'fabric'] }),
  define('kr-art-table', '儿童手工桌', 'kids', [ART.w, 57, 56], ART_PALS, artTable, {
    type: 'table',
    tags: ['for-kids'],
    mats: ['wood', 'fabric', 'plastic'],
    surface: ART.top,
    // 桌面：卷纸架那一端不放东西
    surfaceShape: [rectPoly(-38, -22, ART.w / 2 - 1, 22)],
    surfaces: [{ y: 25.6, h: 21.7, shape: ART_CUBBIES }],
  }),
  define('kr-height-chart', '长颈鹿身高尺', 'kids', [28.4, 3.1, 144], HEIGHT_PALS, heightChart, { type: 'decor', tags: ['for-kids'], mount: 50, mats: ['wood', 'paint'] }),
  define('kr-toy-kitchen-mini', '超市收银台玩具', 'kids', [50, 30, 50], REG_PALS, checkoutToy, { ...KID_TOY, mats: ['plastic', 'plastic', 'plastic'] }),
  define('kr-workbench-toy', '儿童木工台', 'kids', [60, 36, 70], WB_PALS, kidWorkbench, { ...KID_TOY, mats: ['wood', 'wood', 'plastic'] }),
  define('kr-rocking-boat', '摇摇船', 'kids', [90, 42.4, 35], BOAT_PALS, rockingBoat, { ...KID_TOY, mats: ['wood', 'wood'] }),
  // 不用 sofa / armchair：客厅、影音室按 sofa 挑主沙发，书房、客房会按 armchair 摆单人沙发，儿童小沙发不该被摆进去
  define('kr-kid-sofa', '儿童小沙发', 'kids', [80, 42, 46], SOFA_PALS, kidSofa, { type: 'seat', tags: ['for-kids'], mats: ['fabric', 'wood', 'fabric'] }),
  define('kr-montessori-shelf', '蒙氏玩具架', 'kids', [MS.w, MS.d, MS.h], SHELF_PALS, montessoriShelf, {
    type: 'shelving',
    tags: ['for-kids'],
    mats: ['wood', 'wood'],
    surface: MS.h,
    surfaceShape: [rectPoly(-MS.w / 2 + 1, -MS.d / 2 + 1, MS.w / 2 - 1, MS.d / 2 - 1)],
    surfaces: [
      { y: MS.base + MS.t, h: MS.mid - 1.6 - MS.base - MS.t, shape: msBays() },
      { y: MS.mid, h: MS.h - MS.t - MS.mid, shape: msBays() },
    ],
  }),
  define('kr-floor-bed', '小屋地床', 'kids', [98, 198, 149], BED_PALS, floorBed, { type: 'kid-bed', tags: ['bed', 'for-kids'], mats: ['wood', 'fabric', 'fabric'] }),
  define('kr-baby-gym-wood', '木质婴儿健身架', 'kids', [59, 49, 55], GYM_PALS, babyGymWood, { ...BABY_TOY, mats: ['wood', 'wood', 'wood'] }),
  define('kr-nursing-chair', '哺乳摇椅', 'kids', [80, 93, 99], NURSE_PALS, nursingChair, { type: 'armchair', tags: ['seat', 'for-kids', 'for-baby'], mats: ['fabric', 'wood', 'fabric'] }),
  define('kr-baby-monitor-stand', '婴儿看护三件套', 'kids', [29, 10.5, 14], MON_PALS, babyMonitorSet, { ...PROP, type: 'electronics', tags: ['for-kids', 'for-baby'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('kr-wall-decals', '儿童房墙贴', 'kids', [58.3, 0.7, 28], DECAL_PALS, wallDecals, { type: 'decor', tags: ['for-kids'], stick: true, mats: ['plastic', 'plastic', 'plastic'] }),
  define('kr-puzzle-mat', '字母数字拼图地垫', 'kids', [150, 150, 1.3], MAT_PALS, puzzleMat, { type: 'play-mat', tags: ['for-kids'], mats: ['plastic', 'plastic', 'plastic', 'plastic'] }),
]
