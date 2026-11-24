// 家里的代步与搬运工具：儿童滑板车 / 平衡车 / 三轮车 / 带辅助轮的童车、电动滑板车、妈妈自行车、折叠车、电助力车、小踏板摩托、
// 买菜拖车、搬运手推车、露营拖车、自行车停放架、维修架、室内骑行台、头盔与滑板壁挂。约定见 kit.ts 开头。
// 朝向和 misc.ts 的「自行车」一致：车身沿 x、车头朝 +x，车轮在 xy 平面里（轮轴沿 z），牙盘链条在 +z 一侧；
// 所以占地是 [车长, 车宽, 高]，靠墙停放时车身和墙平行。拖车 / 手推车这类「背靠墙立着」的，拉杆在 -z、正面朝 +z。
// 车轮不逐根建辐条（面数会爆）：轮胎 + 轮圈 + 轮毂 + 几根辐条，小轮子用实心轮芯。

import * as THREE from 'three'
import { ball, cyl, plate, rbox, shade, torus, tray } from '../toon'
import { C, shell, type AssetDef } from '../kit'
import { G, P, PI, cappedTube, cylX, cylZ, fitGroup, fitWall, lit, mesh, noOutline, rod3, strutBox, tube, type V2, type V3 } from '../geo'
import { F, I, J, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const CHROME = '#d9dee6'
const DARK = '#24252a'
const RUBBER = '#2e2f33'
const WHITE = '#f6f4ee'
/** 车灯（暖白）/ 尾灯（红）/ 转向灯（橙）/ 仪表屏 */
const LAMP = '#fff3c4'
const TAIL = '#ff5a4a'
const BLINK = '#ffa64d'
const SCREEN = '#7fd4ff'

// ---------- 共用小件 ----------

interface WheelOpts {
  /** 胎粗（轮胎截面半径），默认 1.6 */
  tire?: number
  /** 轮圈、轮毂、辐条的颜色，默认镀铬 */
  rim?: string
  /** 辐条根数，默认 6 */
  spokes?: number
  /** 辐条半径，默认 0.28（塑料轮的粗辐条给 0.8 左右） */
  spokeR?: number
  /** 轮毂半径 / 轴向长度，默认 1.8 / 6 */
  hub?: number
  hubLen?: number
  /** 轮面所在的 z，默认 0 */
  z?: number
}

/** 辐条车轮：轮面在 xy 平面（轮轴沿 z），(x, y) 为轮心、r 为外半径（含胎）。轮胎 + 轮圈 + 轮毂 + 几根辐条 */
function spokeWheel(x: number, y: number, r: number, o: WheelOpts = {}) {
  const tire = o.tire ?? 1.6
  const rim = o.rim ?? CHROME
  const z = o.z ?? 0
  const n = o.spokes ?? 6
  // 轮圈贴在轮胎内侧，略微嵌进胎里
  const rr = r - tire * 2 + 0.3
  const g = G(torus(r - tire, tire, RUBBER, { x, y, z }), torus(rr, 0.7, rim, { x, y, z }), cylZ(o.hub ?? 1.8, o.hubLen ?? 6, rim, x, y, z, 12))
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + 0.3
    g.add(noOutline(rod3([x, y, z], [x + Math.cos(a) * rr, y + Math.sin(a) * rr, z], o.spokeR ?? 0.28, rim, 5)))
  }
  return g
}

/**
 * 胖胎小轮（滑板车、辅助轮、踏板摩托、拖车）：圆胎 + 实心轮芯 + 中心盖。(x, y, z) 为轮心，r 外半径，w 胎宽；
 * 轮轴默认沿 z，axis 'x' 时沿 x（买菜车、手推车这类正面朝 +z 的）。
 */
function discWheel(x: number, y: number, z: number, r: number, w: number, core: string, axis: 'x' | 'z' = 'z', cap = STEEL) {
  const g = G(torus(r - w / 2, w / 2, RUBBER), cylZ(r - w * 0.8, w * 0.66, core, 0, 0, 0, 20), cylZ(Math.max(0.8, (r - w) * 0.42), w * 0.66 + 0.8, cap, 0, 0, 0, 12))
  return P(g, x, y, z, 0, axis === 'x' ? PI / 2 : 0)
}

/** 挡泥板：罩在轮子上方的一段圆弧（管截面沿 z 拉宽成扁片）。r 是弧的半径，a0 起始角（从 +x 逆时针量），arc 扫过的角度，wide 拉宽倍数 */
function fender(x: number, y: number, r: number, color: string, a0: number, arc: number, wide = 2.4, z = 0) {
  const m = torus(r, 0.7, color, { x, y, z, rz: a0 }, arc)
  m.scale.z = wide
  return m
}

/** 车座：后宽前窄，鼻尖朝 +x；(x, y, z) 为座面中心，len 长、wid 最宽处 */
function saddle(x: number, y: number, len: number, wid: number, color: string, z = 0) {
  return G(
    ball(wid / 2, color, { x: x - len * 0.2, y, z }, [(len * 0.6) / wid, 3.4 / wid, 1]),
    ball(wid / 4, color, { x: x + len * 0.18, y: y - 0.2, z }, [(len * 0.64) / (wid / 2), 2.8 / (wid / 2), 1]),
  )
}

/** 一字车把：横杆沿 z、两头握把；(x, y) 为把心，half 是半宽 */
function flatBar(x: number, y: number, half: number, bar: string, grip: string, gripLen = 8, r = 1) {
  const g = G(cylZ(r, half * 2 - 1, bar, x, y, 0, 10))
  for (const s of [-1, 1]) g.add(cylZ(r + 0.7, gripLen, grip, x, y, s * (half - gripLen / 2), 12))
  return g
}

/**
 * 牙盘 + 曲柄 + 脚踏：中轴在 (x, y)，牙盘在 +z 一侧（z = zc；ring 为 0 时不画牙盘——被链罩盖住的车）。
 * arm 曲柄长，a 是右曲柄的角度（左曲柄反向）。
 */
function crankset(x: number, y: number, ring: number, arm: number, zc: number, a: number, metal: string, pedal = DARK) {
  const g = G(cylZ(1.4, zc * 2 + 2.4, metal, x, y, 0, 8))
  if (ring > 0) g.add(cylZ(ring, 0.6, metal, x, y, zc, 20))
  for (const s of [1, -1]) {
    const ang = s > 0 ? a : a + PI
    const ex = x + Math.cos(ang) * arm
    const ey = y + Math.sin(ang) * arm
    const z = s * (zc + 1)
    g.add(rod3([x, y, z], [ex, ey, z], 0.8, metal, 6))
    g.add(rbox(7, 1.6, 5, pedal, { x: ex, y: ey - 0.8, z: z + s * 3 }, 0.5))
  }
  return g
}

/** 多边形 → 圆角轮廓（每个拐角用二次曲线抹圆，半径不超过相邻边的一半） */
function roundedShape(pts: V2[], r: number) {
  const s = new THREE.Shape()
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i + n - 1) % n]
    const [cx, cy] = pts[i]
    const [nx, ny] = pts[(i + 1) % n]
    const l0 = Math.hypot(cx - px, cy - py)
    const l1 = Math.hypot(nx - cx, ny - cy)
    const k = Math.min(r, l0 / 2, l1 / 2)
    const ax = cx + ((px - cx) / l0) * k
    const ay = cy + ((py - cy) / l0) * k
    if (i === 0) s.moveTo(ax, ay)
    else s.lineTo(ax, ay)
    s.quadraticCurveTo(cx, cy, cx + ((nx - cx) / l1) * k, cy + ((ny - cy) / l1) * k)
  }
  s.closePath()
  return s
}

/** 侧面轮廓（xy 平面）沿 z 挤出厚 t 的实心体（z 居中），边缘倒圆 */
function profileZ(shape: THREE.Shape, t: number, color: string, bevel = 2) {
  const b = Math.min(bevel, t * 0.3)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 8 })
  geo.translate(0, 0, -t / 2 + b)
  return mesh(geo, color)
}

// ---------- 儿童滑板车（三轮）：两前一后三只彩色小轮、一块踏板、细立杆顶着 T 形把手，后轮上一片脚刹挡泥板 ----------

function kickScooter(p: string[]) {
  const [body, wheelC, grip] = p
  const g = new THREE.Group()
  // 踏板 + 防滑垫
  g.add(rbox(36, 2.6, 12, body, { x: -1, y: 5 }, 1.2))
  g.add(noOutline(rbox(27, 0.6, 8.6, DARK, { x: -2, y: 7.4 }, 0.3)))
  // 前横梁 + 两只前轮
  g.add(rbox(7, 4.4, 21.6, body, { x: 20, y: 3.8 }, 1.8))
  g.add(cylZ(0.8, 27, STEEL, 21, 6, 0, 8))
  for (const s of [-1, 1]) g.add(discWheel(21, 6, s * 12.2, 6, 2.6, wheelC))
  // 后轮：踏板尾部两片叉夹着，上面一片脚刹挡泥板
  for (const s of [-1, 1]) g.add(rbox(11, 2, 1.2, body, { x: -23, y: 4.4, z: s * 2.6 }, 0.5))
  g.add(cylZ(0.7, 6.6, STEEL, -25, 4.5, 0, 8))
  g.add(discWheel(-25, 4.5, 0, 4.5, 3, wheelC))
  g.add(fender(-25, 4.5, 5.8, body, 0.14 * PI, 0.62 * PI, 2.6))
  // 立杆：底座 + 铝管 + 调高卡箍，顶上 T 形把手
  g.add(cyl(2.3, 2.8, 5, body, { x: 19.4, y: 7.6 }, 14))
  g.add(rod3([19.2, 11, 0], [16.4, 76, 0], 1.3, STEEL, 10))
  g.add(rod3([18.1, 38, 0], [17.9, 43, 0], 2, body, 12))
  g.add(ball(2.1, body, { x: 16.4, y: 76.6 }))
  g.add(flatBar(16.4, 76.6, 13.6, STEEL, grip, 7, 1.1))
  return fitGroup(g)
}

// ---------- 儿童平衡车：没有脚踏的小两轮车——一根主梁、低车座、一字把和车头的号码牌 ----------

function balanceBike(p: string[]) {
  const [frame, seat, rim] = p
  const g = new THREE.Group()
  const r = 15
  const ax = 27
  for (const x of [-ax, ax]) g.add(spokeWheel(x, r, r, { tire: 2, rim, spokes: 5, spokeR: 0.8, hub: 2.4, hubLen: 7 }))
  // 头管、主梁、夹着后轮的两片后叉
  g.add(rod3([21.6, 32, 0], [18.6, 45, 0], 2.2, frame, 10))
  g.add(rod3([20, 38.5, 0], [-6, 25, 0], 2, frame, 10))
  g.add(cylZ(2, 7, frame, -6, 25, 0, 10))
  for (const s of [-1, 1]) g.add(rod3([-5, 25.4, s * 2.4], [-ax, r, s * 4], 1, frame, 8))
  // 前叉
  g.add(cylZ(1.3, 9.4, frame, 21.5, 32.6, 0, 8))
  for (const s of [-1, 1]) g.add(rod3([21.5, 32.6, s * 3.8], [ax, r, s * 4], 1.1, frame, 8))
  // 座管 + 座杆 + 车座
  g.add(rod3([-3, 26.5, 0], [-6.4, 38, 0], 1.7, frame, 10))
  g.add(rod3([-6.4, 38, 0], [-7.4, 41.5, 0], 1, STEEL, 8))
  g.add(saddle(-8, 42.6, 17, 10, seat))
  // 把立 + 车把 + 号码牌
  g.add(rod3([18.6, 45, 0], [17.8, 50.5, 0], 1.2, STEEL, 8))
  g.add(flatBar(17.8, 51, 17, STEEL, seat, 8, 1))
  g.add(rbox(1, 9, 11, rim, { x: 20.4, y: 43.5 }, 0.5))
  // 小脚撑
  g.add(rod3([-ax + 3, r - 1, 4.6], [-ax + 9, 0.8, 9.5], 0.7, STEEL, 6))
  return fitGroup(g)
}

// ---------- 儿童三轮车：前面一只带脚踏的大轮、后面两只小轮，带靠背的小座椅，后轴上一块踏脚板和一只小筐 ----------

function tricycle(p: string[]) {
  const [frame, seat, acc] = p
  const g = new THREE.Group()
  const FX = 24
  const FR = 12.5
  const RX = -26
  const RR = 8.5
  // 前大轮：轮轴两头直接装曲柄和脚踏
  g.add(spokeWheel(FX, FR, FR, { tire: 2.2, rim: WHITE, spokes: 5, spokeR: 0.9, hub: 2.6, hubLen: 7 }))
  g.add(cylZ(0.9, 16, STEEL, FX, FR, 0, 8))
  for (const s of [-1, 1]) {
    const a = s > 0 ? -0.5 : PI - 0.5
    const ex = FX + Math.cos(a) * 6.5
    const ey = FR + Math.sin(a) * 6.5
    g.add(rod3([FX, FR, s * 7.4], [ex, ey, s * 7.4], 0.8, STEEL, 6))
    g.add(rbox(6.5, 1.8, 5.4, acc, { x: ex, y: ey - 0.9, z: s * 10.6 }, 0.6))
  }
  // 前叉、挡泥板、头管
  g.add(cylZ(1.3, 11.8, frame, FX - 4.6, 33.4, 0, 8))
  for (const s of [-1, 1]) g.add(rod3([FX - 4.6, 33.4, s * 4.8], [FX, FR, s * 4.8], 1.1, frame, 8))
  g.add(fender(FX, FR, FR + 1.7, frame, 0.22 * PI, 0.62 * PI, 3.2))
  g.add(rod3([FX - 4.4, 32.4, 0], [FX - 6.8, 43.5, 0], 2, frame, 10))
  // 把立、车把、车铃
  g.add(rod3([FX - 6.8, 43.5, 0], [FX - 7.8, 52, 0], 1.1, STEEL, 8))
  g.add(flatBar(FX - 7.8, 52.6, 20, STEEL, acc, 7.5, 1))
  g.add(ball(1.7, CHROME, { x: FX - 7.8, y: 54, z: -9 }, [1, 0.7, 1]))
  // 主梁：从头管弯下去接后轴
  g.add(
    cappedTube(
      [
        [FX - 5.4, 37, 0],
        [8, 31, 0],
        [-8, 18, 0],
        [RX, RR + 1.5, 0],
      ],
      1.8,
      frame,
      { seg: 16, radial: 8 },
    ),
  )
  // 后轴、两只后轮、踏脚板、小筐
  g.add(cylZ(1.1, 40, STEEL, RX, RR, 0, 8))
  for (const s of [-1, 1]) g.add(discWheel(RX, RR, s * 20.5, RR, 4.2, acc))
  g.add(rbox(11, 1.6, 31, frame, { x: RX, y: RR + 1 }, 0.6))
  g.add(tray(13, 9, 22, 1, seat, { x: RX - 1.5, y: RR + 2.6 }, 0.5))
  // 座椅：坐垫 + 略微后仰的靠背
  g.add(rod3([-9, 19, 0], [-10, 27, 0], 1.5, frame, 8))
  g.add(rbox(15, 3.6, 17, seat, { x: -10, y: 26.6 }, 1.6))
  g.add(rbox(3.2, 13, 16, seat, { x: -17.6, y: 28, rz: 0.16 }, 1.4))
  return fitGroup(g)
}

// ---------- 儿童自行车：16 寸小车，低跨车架、整片链罩、后轮两侧的辅助轮、车头的小筐和车铃 ----------

function kidsBike(p: string[]) {
  const [frame, trim, acc] = p
  const g = new THREE.Group()
  const r = 20
  const ax = 37.5
  const bb: V3 = [-5, 19, 0]
  for (const x of [-ax, ax]) g.add(spokeWheel(x, r, r, { tire: 2.2, spokes: 8 }))
  // 车架：立管、头管、低跨的上管、下管、五通，后上叉 / 后下叉 / 前叉
  g.add(rod3(bb, [-12, 47, 0], 1.6, frame, 10))
  g.add(rod3([27, 44, 0], [24.2, 56, 0], 2, frame, 10))
  g.add(rod3([25.6, 50, 0], [-10.4, 40.5, 0], 1.6, frame, 10))
  g.add(rod3([26.4, 46.5, 0], bb, 1.8, frame, 10))
  g.add(cylZ(2.4, 6.4, frame, bb[0], bb[1], 0, 12))
  for (const s of [-1, 1]) {
    g.add(rod3([-5, 19, s * 2.6], [-ax, r, s * 4.2], 0.9, frame, 8))
    g.add(rod3([-11.4, 44.5, s * 2.2], [-ax, r, s * 4.2], 0.9, frame, 8))
    g.add(rod3([27.2, 43, s * 3.6], [ax, r, s * 4.2], 1.1, frame, 8))
  }
  g.add(cylZ(1.3, 9.4, frame, 27.2, 43.2, 0, 8))
  // 前后挡泥板 + 后反光片
  g.add(fender(ax, r, 22.7, trim, 0.3 * PI, 0.6 * PI, 2.6))
  g.add(fender(-ax, r, 22.7, trim, 0.08 * PI, 0.95 * PI, 2.6))
  g.add(noOutline(rbox(1, 3, 2.6, TAIL, { x: -ax - 23.3, y: r - 3.6 }, 0.4)))
  // 车座
  g.add(rod3([-12, 47, 0], [-13.2, 53, 0], 1.1, STEEL, 8))
  g.add(saddle(-13.8, 54.6, 18, 12, trim))
  // 把立 + 上扬的车把 + 握把 + 车铃
  g.add(rod3([24.2, 56, 0], [23, 65, 0], 1.2, STEEL, 8))
  g.add(
    tube(
      [
        [20.5, 71, -20],
        [22.6, 71, -11],
        [23, 65.5, -3.5],
        [23, 65.5, 3.5],
        [22.6, 71, 11],
        [20.5, 71, 20],
      ],
      1,
      STEEL,
      { seg: 24, radial: 6 },
    ),
  )
  for (const s of [-1, 1]) g.add(rod3([21.8, 71, s * 13], [20.2, 71, s * 21], 1.7, trim, 10))
  g.add(ball(1.9, CHROME, { x: 22.8, y: 72.4, z: -8.5 }, [1, 0.7, 1]))
  // 车筐：挂在车头前面，两根撑杆落到前轴
  g.add(tray(16, 13, 23, 1, acc, { x: 36.4, y: 49 }, 0.5))
  g.add(rbox(5, 2, 4, STEEL, { x: 27.4, y: 53 }, 0.5))
  g.add(cylZ(0.9, 13.6, STEEL, ax, r, 0, 8))
  for (const s of [-1, 1]) g.add(rod3([37.4, 49.4, s * 6], [ax, r, s * 6.2], 0.5, STEEL, 6))
  // 链罩（整片盖住牙盘和链条）+ 曲柄脚踏
  g.add(rbox(34, 8.4, 2, acc, { x: -22, y: 15.3, z: 5.8 }, 0.9))
  g.add(cylZ(6.6, 2, acc, -5, 19, 5.8, 20))
  g.add(crankset(-5, 19, 0, 8.5, 6.6, -0.6, STEEL))
  // 辅助轮：后轴两侧各一根斜撑 + 小轮
  for (const s of [-1, 1]) {
    g.add(rod3([-ax, r, s * 5], [-ax, 6.4, s * 13.6], 0.8, STEEL, 6))
    g.add(cylZ(0.7, 5, STEEL, -ax, 6, s * 14.5, 6))
    g.add(discWheel(-ax, 6, s * 16.2, 6, 2.6, acc))
  }
  return fitGroup(g)
}

// ---------- 电动滑板车：又厚又宽的电池踏板、前后两只小胖轮、带折叠关节的后仰立杆、车把中间一块仪表屏、后挡泥板带尾灯 ----------

function eScooter(p: string[]) {
  const [body, acc, mat] = p
  const g = new THREE.Group()
  const r = 10.8
  const ax = 42
  for (const x of [-ax, ax]) g.add(discWheel(x, r, 0, r, 4.6, shade(body, -0.08), 'z', acc))
  // 踏板（电池仓）+ 防滑垫
  g.add(rbox(56, 5, 15, body, { x: -6, y: 6.8 }, 2))
  g.add(noOutline(rbox(46, 0.6, 11.6, mat, { x: -7, y: 11.6 }, 0.3)))
  // 后叉 + 后轴 + 后挡泥板 + 尾灯
  for (const s of [-1, 1]) g.add(rbox(15, 3, 1.6, body, { x: -38.5, y: 9.3, z: s * 3.8 }, 0.6))
  g.add(cylZ(0.9, 9.6, STEEL, -ax, r, 0, 8))
  g.add(fender(-ax, r, 12.5, body, 0.04 * PI, 0.82 * PI, 3.4))
  g.add(lit(rbox(1.4, 2.4, 4.6, TAIL, { x: -ax - 11.6, y: 14.4 }, 0.5), TAIL, 0.6))
  // 车头：从踏板前端翘起的颈部、前轮上方的转向头管、前叉、前挡泥板
  g.add(rod3([19, 9.6, 0], [37.6, 33, 0], 2.6, body, 10))
  g.add(rod3([40.5, 25, 0], [37.5, 40, 0], 3, body, 12))
  for (const s of [-1, 1]) g.add(rod3([40.4, 26, s * 3.8], [ax, r, s * 3.8], 1.2, body, 8))
  g.add(cylZ(0.9, 9.6, STEEL, ax, r, 0, 8))
  g.add(fender(ax, r, 12.5, body, 0.16 * PI, 0.62 * PI, 3.4))
  // 折叠关节 + 扳手 + 立杆
  g.add(rbox(7.6, 5, 7.6, DARK, { x: 37.4, y: 38.6 }, 1.6))
  g.add(rbox(1.4, 6.4, 2.6, acc, { x: 41.6, y: 36.4 }, 0.5))
  g.add(rod3([37.2, 42, 0], [27, 112, 0], 2, body, 12))
  // 车把 + 握把 + 仪表屏（朝骑车的人略微仰起）
  g.add(flatBar(27, 112.6, 21, body, RUBBER, 10, 1.3))
  g.add(P(G(rbox(8, 2.2, 6, DARK, {}, 0.9), lit(rbox(4.6, 0.5, 3.2, SCREEN, { y: 1.9 }, 0.2), SCREEN, 0.7)), 26.6, 113.6, 0, 0, 0, 0.14))
  // 刹车把、拇指油门、车铃
  g.add(rod3([28.6, 112.4, -13], [30.6, 110.6, -20.5], 0.5, STEEL, 6))
  g.add(rbox(2.6, 2.2, 3, acc, { x: 28.2, y: 110.6, z: 12.4 }, 0.6))
  g.add(ball(1.5, CHROME, { x: 27, y: 114.6, z: -8 }, [1, 0.7, 1]))
  // 前灯
  g.add(rbox(3, 3.4, 4.4, DARK, { x: 30.4, y: 102 }, 0.8))
  g.add(lit(P(cyl(1.5, 1.5, 0.6, LAMP, {}, 12), 32.1, 103.7, 0, 0, 0, -PI / 2), LAMP, 0.8))
  // 侧脚撑
  g.add(rod3([-6, 7.6, 7], [-11, 0.6, 12.6], 0.7, STEEL, 6))
  return fitGroup(g)
}

// ---------- 妈妈自行车：弯梁的女式车架、车头的大车筐、后货架上的儿童座椅（高靠背 + 护腿板）、全包链罩、挡泥板和双脚撑 ----------

function mamachari(p: string[]) {
  const [frame, sub, acc] = p
  const g = new THREE.Group()
  const r = 33
  const ax = 54
  const bb: V3 = [-6, 30, 0]
  for (const x of [-ax, ax]) g.add(spokeWheel(x, r, r, { tire: 1.9, spokes: 8, hubLen: 8 }))
  // 弯梁车架：头管、两根往下弯的梁、立管、五通，后上叉 / 后下叉 / 前叉
  g.add(rod3([38, 71, 0], [34.6, 87, 0], 2.1, frame, 10))
  g.add(
    tube(
      [
        [36.8, 75, 0],
        [25, 53, 0],
        [9, 36.5, 0],
        [-6, 30, 0],
      ],
      1.9,
      frame,
      { seg: 18, radial: 8 },
    ),
  )
  g.add(
    tube(
      [
        [35.8, 81.5, 0],
        [22, 60, 0],
        [5, 47.5, 0],
        [-9.4, 45, 0],
      ],
      1.5,
      frame,
      { seg: 18, radial: 8 },
    ),
  )
  g.add(rod3(bb, [-17, 78, 0], 1.7, frame, 10))
  g.add(cylZ(2.6, 7, frame, bb[0], bb[1], 0, 12))
  for (const s of [-1, 1]) {
    g.add(rod3([-6, 30, s * 2.8], [-ax, r, s * 4.6], 1, frame, 8))
    g.add(rod3([-15.8, 73, s * 2.2], [-ax, r, s * 4.6], 0.9, frame, 8))
    g.add(rod3([38.1, 70.4, s * 3.8], [ax, r, s * 4.6], 1.2, frame, 8))
  }
  g.add(cylZ(1.4, 10, frame, 38.1, 70.6, 0, 8))
  // 前后挡泥板 + 后反光片
  g.add(fender(ax, r, 35.7, frame, 0.2 * PI, 0.72 * PI, 2.8))
  g.add(fender(-ax, r, 35.7, frame, -0.03 * PI, 1.06 * PI, 2.8))
  g.add(noOutline(rbox(1.2, 4.4, 3.6, TAIL, { x: -ax - 36.5, y: 27.4 }, 0.5)))
  // 全包链罩（从牙盘一直包到后轴）+ 曲柄脚踏
  g.add(rbox(49, 8, 2.2, STEEL, { x: -30, y: 27.5, z: 6.6, rz: -0.062 }, 1))
  g.add(cylZ(8.6, 2.2, STEEL, -6, 30, 6.6, 20))
  g.add(cylZ(4.6, 2.2, STEEL, -ax, r, 6.6, 14))
  g.add(crankset(-6, 30, 0, 16, 7.8, -0.9, STEEL))
  // 车座（宽大的舒适座）
  g.add(rod3([-17, 78, 0], [-18.6, 85.5, 0], 1.2, STEEL, 8))
  g.add(saddle(-19.6, 87.4, 26, 21, acc))
  // 把立 + 往后弯的燕把 + 握把 + 车铃
  g.add(rod3([34.6, 87, 0], [33.6, 97, 0], 1.3, STEEL, 8))
  g.add(
    tube(
      [
        [21, 100, -27],
        [29, 100.6, -23],
        [36, 99, -11],
        [33.8, 97.4, 0],
        [36, 99, 11],
        [29, 100.6, 23],
        [21, 100, 27],
      ],
      1.1,
      STEEL,
      { seg: 32, radial: 6 },
    ),
  )
  for (const s of [-1, 1]) g.add(rod3([27.5, 100.5, s * 23.8], [19.6, 99.9, s * 27.6], 1.8, acc, 10))
  g.add(ball(2.1, CHROME, { x: 34.6, y: 101.4, z: -15 }, [1, 0.7, 1]))
  // 前车筐：筐托接头管，两根撑杆落到前轴，筐底挂着车灯
  g.add(tray(27, 22, 35, 1.2, sub, { x: 57, y: 72.5 }, 1))
  g.add(rbox(8, 2.4, 5, STEEL, { x: 40.5, y: 80 }, 0.6))
  g.add(cylZ(1, 14, STEEL, ax, r, 0, 8))
  for (const s of [-1, 1]) g.add(rod3([56.5, 73, s * 6.4], [ax, r, s * 6.4], 0.55, STEEL, 6))
  g.add(rbox(4.4, 4.4, 4.6, STEEL, { x: 67, y: 68.2 }, 1))
  g.add(lit(P(cyl(1.6, 1.6, 0.7, LAMP, {}, 12), 69.4, 70.4, 0, 0, 0, -PI / 2), LAMP, 0.8))
  // 后货架
  g.add(rbox(34, 1.6, 14, STEEL, { x: -58, y: 70 }, 0.6))
  for (const s of [-1, 1]) g.add(rod3([-68, 70.4, s * 6], [-ax, r, s * 6.2], 0.6, STEEL, 6))
  g.add(rod3([-41.5, 70.8, 0], [-16, 73.6, 0], 0.8, STEEL, 6))
  // 儿童座椅：座兜、高靠背、两侧护翼、坐垫 / 靠背垫、前面的扶手杠、垂到车轮两侧的护腿板和脚踏
  g.add(rbox(27, 5, 30, sub, { x: -57, y: 71.4 }, 2))
  g.add(rbox(5, 33, 30, sub, { x: -70, y: 73, rz: 0.1 }, 2.4))
  for (const s of [-1, 1]) g.add(rbox(25, 13, 2.6, sub, { x: -58, y: 74, z: s * 14 }, 1.2))
  g.add(rbox(19, 2.4, 21, acc, { x: -56.5, y: 75 }, 1))
  g.add(rbox(1.8, 20, 21, acc, { x: -67.6, y: 79.5, rz: 0.1 }, 0.8))
  g.add(
    tube(
      [
        [-46.5, 86, -14],
        [-42.5, 95, -11],
        [-42.5, 95, 11],
        [-46.5, 86, 14],
      ],
      0.9,
      STEEL,
      { seg: 16, radial: 6 },
    ),
  )
  for (const s of [-1, 1]) {
    g.add(rbox(8, 27, 2.4, sub, { x: -47, y: 46, z: s * 13.8 }, 1.1))
    g.add(rbox(8, 2, 6, sub, { x: -47, y: 46, z: s * 15.6 }, 0.8))
  }
  // 双脚撑：后轴两侧各一条腿，脚下一根横杆
  for (const s of [-1, 1]) g.add(rod3([-ax, r, s * 7.4], [-70, 1, s * 13], 0.9, STEEL, 6))
  g.add(cylZ(0.9, 27.8, STEEL, -70, 1, 0, 8))
  return fitGroup(g)
}

// ---------- 折叠自行车（折叠状态）：车架从中间对折，两只小轮并排，座杆缩到底当支脚，把立折下来贴在车轮外侧 ----------

function foldingBike(p: string[]) {
  const [frame, trim, acc] = p
  const g = new THREE.Group()
  const r = 20.5
  // 对折以后：后半车架在 z = ZR，前半车架折回来在 z = ZF，两只轮子并排
  const ZR = 6
  const ZF = -6
  const RX = -16
  const FX = -13
  const bb: V3 = [20, 26, ZR]
  g.add(spokeWheel(RX, r, r, { tire: 1.8, spokes: 6, z: ZR }))
  g.add(spokeWheel(FX, r, r, { tire: 1.8, spokes: 6, z: ZF }))
  // 两只轮轴之间的磁吸扣
  g.add(cylZ(1.2, 6.4, STEEL, -14.5, r, 0, 8))
  // 后半：五通、立管、后下叉 / 后上叉、主梁后段
  g.add(cylZ(2.4, 6.4, frame, bb[0], bb[1], ZR, 12))
  g.add(rod3(bb, [14, 50, ZR], 1.8, frame, 10))
  for (const s of [-1, 1]) {
    g.add(rod3([20, 26, ZR + s * 2.4], [RX, r, ZR + s * 4], 0.9, frame, 8))
    g.add(rod3([15, 46, ZR + s * 2.2], [RX, r, ZR + s * 4], 0.8, frame, 8))
  }
  g.add(rod3([17, 38.5, ZR - 0.6], [34.4, 40.5, 3.2], 2.3, frame, 10))
  // 座杆缩到底：上面只露一小截，下端穿过五通落地当支脚
  g.add(rod3([14, 50, ZR], [12.6, 56, ZR], 1.2, STEEL, 8))
  g.add(saddle(12, 57.8, 24, 14, trim, ZR))
  g.add(rod3(bb, [26.2, 1.2, ZR], 1.2, STEEL, 8))
  g.add(cyl(1.6, 1.8, 1.4, RUBBER, { x: 26.3, y: 0, z: ZR }, 8))
  // 折叠关节（对折点，在最前面）+ 扳手
  g.add(rbox(4.4, 7.6, 10.4, DARK, { x: 36, y: 36.6 }, 1.2))
  g.add(rbox(1.2, 5, 2.2, acc, { x: 38.6, y: 38, z: 2 }, 0.4))
  // 前半：主梁前段折回来、头管、前叉
  g.add(rod3([34.4, 40.5, -3.2], [-1.6, 50.5, ZF], 2.3, frame, 10))
  g.add(rod3([-4, 44, ZF], [0, 57, ZF], 2.2, frame, 10))
  g.add(cylZ(1.3, 8.4, frame, -4.1, 43.6, ZF, 8))
  for (const s of [-1, 1]) g.add(rod3([-4.1, 43.6, ZF + s * 3.4], [FX, r, ZF + s * 4], 1, frame, 8))
  // 把立从头管顶上折下来，贴在车轮外侧；车把横在最下面
  g.add(cylZ(1.9, 6, DARK, 0.2, 57.6, -8.6, 10))
  g.add(rod3([0.6, 57.6, -11], [5.5, 15, -12.4], 1.4, STEEL, 8))
  g.add(cylX(1.1, 42, STEEL, 5, 14, -12.6, 8))
  for (const x of [-11.7, 21.7]) g.add(cylX(1.8, 9.4, trim, x, 14, -12.6, 10))
  // 两片挡泥板
  g.add(fender(RX, r, 22.4, acc, 0.1 * PI, 0.85 * PI, 2.4, ZR))
  g.add(fender(FX, r, 22.4, acc, 0.12 * PI, 0.8 * PI, 2.4, ZF))
  // 牙盘、曲柄、折起来的脚踏、链条、后飞轮
  const zc = ZR + 4.4
  g.add(cylZ(1.4, 13.6, STEEL, 20, 26, ZR + 0.2, 8))
  g.add(cylZ(7.6, 0.6, STEEL, 20, 26, zc, 20))
  g.add(rod3([20, 26, zc + 1.3], [15, 19.1, zc + 1.3], 0.8, STEEL, 6))
  g.add(rbox(6.5, 5, 1.6, DARK, { x: 15, y: 16.6, z: zc + 2.8 }, 0.5))
  g.add(rod3([20, 26, 0.2], [25, 32.9, 0.2], 0.8, STEEL, 6))
  g.add(rbox(6.5, 5, 1.6, DARK, { x: 25, y: 30.4, z: -1.3 }, 0.5))
  g.add(cylZ(2.8, 1, STEEL, RX, r, 9.5, 12))
  g.add(noOutline(rod3([20, 33.4, zc - 0.2], [RX, r + 2.7, 9.8], 0.35, DARK, 5)))
  g.add(noOutline(rod3([20, 18.6, zc - 0.2], [RX, r - 2.7, 9.8], 0.35, DARK, 5)))
  return fitGroup(g)
}

// ---------- 电助力自行车：粗下管里嵌着电池、五通处一坨中置电机、避震前叉、后货架和尾灯、车头灯、把上的仪表 ----------

function eBike(p: string[]) {
  const [frame, pack, trim] = p
  const g = new THREE.Group()
  const r = 35
  const ax = 56
  const bb: V3 = [-6, 31, 0]
  for (const x of [-ax, ax]) {
    g.add(spokeWheel(x, r, r, { tire: 2.4, rim: DARK, spokes: 8, hub: 2.2, hubLen: 8 }))
    // 碟刹盘
    g.add(noOutline(cylZ(7.5, 0.4, STEEL, x, r, -4.4, 16)))
  }
  // 车架：立管、头管、上管、下管，下管外面包着电池
  g.add(rod3(bb, [-18, 80, 0], 1.9, frame, 10))
  g.add(rod3([39.6, 78, 0], [35.8, 96, 0], 2.4, frame, 12))
  g.add(rod3([37.2, 89.5, 0], [-16.6, 74.5, 0], 1.9, frame, 10))
  g.add(rod3([38.6, 82, 0], bb, 2.3, frame, 10))
  g.add(strutBox([33, 76.3, 0], [3, 40.2, 0], 6.4, 7.2, pack, 1.8))
  // 中置电机
  g.add(cylZ(8, 9.6, pack, bb[0], bb[1], 0, 20))
  g.add(strutBox([-6, 31, 0], [5, 43.6, 0], 12, 9.4, pack, 2.5))
  for (const s of [-1, 1]) {
    g.add(rod3([-6, 31, s * 3.2], [-ax, r, s * 5.4], 1.1, frame, 8))
    g.add(rod3([-16.8, 75.4, s * 2.4], [-ax, r, s * 5.4], 1, frame, 8))
    // 避震前叉：上面细的内管、下面粗的外管
    g.add(rod3([40, 76.5, s * 4.8], [48.2, 55, s * 4.8], 1.3, STEEL, 8))
    g.add(rod3([47.6, 56.6, s * 4.8], [ax, r, s * 4.8], 2, DARK, 10))
  }
  g.add(cylZ(1.9, 13, DARK, 39.9, 76.8, 0, 10))
  // 挡泥板、后货架、尾灯
  g.add(fender(ax, r, 37.9, DARK, 0.25 * PI, 0.62 * PI, 3.2))
  g.add(fender(-ax, r, 37.9, DARK, 0.03 * PI, 0.95 * PI, 3.2))
  g.add(rbox(38, 1.6, 13, DARK, { x: -62, y: 75 }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rod3([-73, 75.4, s * 5.8], [-ax, r, s * 6.4], 0.7, DARK, 6))
    g.add(rod3([-43.5, 75.8, s * 4], [-17, 76.5, s * 2], 0.7, DARK, 6))
  }
  g.add(lit(rbox(1.4, 3, 8, TAIL, { x: -81.4, y: 73.6 }, 0.5), TAIL, 0.6))
  // 车座
  g.add(rod3([-18, 80, 0], [-20.6, 93, 0], 1.3, STEEL, 8))
  g.add(saddle(-21.6, 95, 25, 15, trim))
  // 把立、一字把、握把、刹把、仪表
  g.add(rod3([35.8, 96, 0], [41, 102.6, 0], 1.6, DARK, 8))
  g.add(flatBar(41, 103, 30, DARK, trim, 11, 1.2))
  for (const s of [-1, 1]) g.add(rod3([42.6, 102.6, s * 17], [45, 101, s * 26], 0.5, STEEL, 6))
  g.add(P(G(rbox(7, 1.4, 5, DARK, {}, 0.5), lit(rbox(5, 0.4, 3.4, SCREEN, { y: 1.2 }, 0.15), SCREEN, 0.7)), 40.6, 103.7, 0, 0, 0, 0.35))
  // 车头灯
  g.add(rbox(4.6, 4.4, 5, DARK, { x: 43, y: 80 }, 1.2))
  g.add(lit(P(cyl(1.7, 1.7, 0.7, LAMP, {}, 12), 45.5, 82.2, 0, 0, 0, -PI / 2), LAMP, 0.8))
  // 牙盘、曲柄、链条、飞轮、后拨
  g.add(crankset(bb[0], bb[1], 7.6, 17, 5.6, -0.6, DARK))
  g.add(noOutline(rod3([-6, 38.4, 5.6], [-ax, 38.6, 3.8], 0.35, DARK, 5)))
  g.add(noOutline(rod3([-6, 23.6, 5.6], [-ax + 1, 27.5, 3.8], 0.35, DARK, 5)))
  g.add(cylZ(3.8, 2.4, STEEL, -ax, r, 3.6, 14))
  g.add(rbox(2, 9, 1.4, DARK, { x: -ax + 1, y: 24, z: 4 }, 0.5))
  // 侧脚撑
  g.add(rod3([-36, 33.5, -5], [-42, 0.8, -14], 0.9, DARK, 6))
  return fitGroup(g)
}

// ---------- 小型踏板摩托：圆润的车壳——前挡板、平踏板、座垫下的大肚子车身，车头一只圆灯和一对后视镜，后面驮着后备箱 ----------

/** 座垫下面的车身侧面轮廓（x 朝车头、y 朝上）：前面从踏板立起来，顶上托着座垫，尾巴往后上方翘，底边让出后轮 */
const MOPED_BODY: V2[] = [
  [10, 20],
  [12, 54],
  [4, 63],
  [-60, 63],
  [-80, 59],
  [-83, 50],
  [-72, 38],
  [-30, 30],
  [-22, 20],
]
function moped(p: string[]) {
  const [body, seat, box] = p
  const g = new THREE.Group()
  const r = 20
  const FX = 58
  const RX = -52
  for (const x of [RX, FX]) g.add(discWheel(x, r, 0, r, 8, STEEL, 'z', DARK))
  // 车身 + 侧面的镀铬饰条
  g.add(profileZ(roundedShape(MOPED_BODY, 7), 32, body, 3))
  g.add(noOutline(rbox(42, 1.2, 32.6, CHROME, { x: -40, y: 47 }, 0.5)))
  // 平踏板 + 脚垫
  g.add(rbox(44, 6, 30, body, { x: 28, y: 17 }, 2.4))
  g.add(noOutline(rbox(28, 0.6, 22, DARK, { x: 27, y: 22.8 }, 0.3)))
  // 前挡板（往后仰）+ 一对转向灯
  g.add(rbox(8, 66, 34, body, { x: 48, y: 19, rz: 0.12 }, 3.5))
  for (const s of [-1, 1]) g.add(lit(ball(2.2, BLINK, { x: 50.2, y: 62, z: s * 11 }, [0.5, 1, 1]), BLINK, 0.5))
  // 前叉、前轴、前挡泥板
  for (const s of [-1, 1]) g.add(rod3([52, 44, s * 6.5], [FX, r, s * 6.5], 1.6, DARK, 8))
  g.add(cylZ(1.2, 15, STEEL, FX, r, 0, 8))
  g.add(fender(FX, r, 21.8, body, 0.15 * PI, 0.72 * PI, 4.6))
  // 车头：龙头罩、圆车灯、车把和握把、后视镜
  g.add(ball(9, body, { x: 43, y: 90 }, [1, 0.75, 1.5]))
  g.add(P(torus(5.4, 0.9, CHROME, {}), 50.6, 90, 0, 0, PI / 2))
  g.add(lit(ball(5, LAMP, { x: 50, y: 90 }, [0.5, 1, 1]), LAMP, 0.7))
  g.add(cylZ(1.3, 58, DARK, 42, 90, 0, 10))
  for (const s of [-1, 1]) {
    g.add(cylZ(2, 10, RUBBER, 42, 90, s * 25, 12))
    g.add(rod3([42, 90.6, s * 16], [41, 103, s * 25], 0.6, DARK, 6))
    g.add(ball(4, DARK, { x: 41, y: 104, z: s * 27 }, [0.35, 0.8, 1.2]))
    g.add(noOutline(ball(3.4, '#cfe3ee', { x: 40.2, y: 104, z: s * 27 }, [0.3, 0.8, 1.2])))
  }
  // 座垫
  g.add(rbox(60, 9, 27, seat, { x: -28, y: 60 }, 4))
  // 后货架 + 后备箱（箱盖一圈缝、前面一块靠垫、后面一条反光片）
  g.add(rbox(22, 2, 20, DARK, { x: -74, y: 62.5 }, 0.8))
  g.add(rbox(30, 26, 34, box, { x: -74, y: 64.5 }, 5))
  g.add(noOutline(rbox(30.6, 0.8, 34.6, shade(box, -0.15), { x: -74, y: 79 }, 0.3)))
  g.add(rbox(2, 10, 18, seat, { x: -58.4, y: 72 }, 0.8))
  g.add(noOutline(rbox(0.8, 3, 16, TAIL, { x: -89.2, y: 70 }, 0.3)))
  // 尾灯、后转向灯、挡泥皮和车牌
  g.add(lit(rbox(2.4, 5, 14, TAIL, { x: -81, y: 50 }, 1), TAIL, 0.6))
  for (const s of [-1, 1]) g.add(lit(ball(2, BLINK, { x: -79.5, y: 46, z: s * 11.5 }), BLINK, 0.5))
  g.add(strutBox([-72, 41, 0], [-77, 24, 0], 2, 14, DARK, 0.6))
  g.add(noOutline(strutBox([-74.2, 37.2, 0], [-77.5, 26.8, 0], 0.8, 11, WHITE, 0.3)))
  // 发动机 / 传动箱 + 排气管
  g.add(rbox(34, 14, 22, DARK, { x: -34, y: 18 }, 3))
  g.add(cylX(3.6, 34, STEEL, -52, 19, 12.5, 14))
  g.add(cylX(2, 4, DARK, -70.6, 19, 12.5, 10))
  // 中撑
  for (const s of [-1, 1]) g.add(rod3([-18, 20, s * 7], [-24, 1, s * 12], 1, DARK, 6))
  g.add(cylZ(1, 25, DARK, -24, 1, 0, 8))
  return fitGroup(g)
}

// ---------- 买菜拖车：两只轮子的钢管架上绑着一只带翻盖和前袋的大布袋，前面一只小支脚让它自己立着 ----------

function shoppingTrolley(p: string[]) {
  const [bag, trim, frame] = p
  const g = new THREE.Group()
  // 钢管架：一根弯管从左轮绕过顶上的把手回到右轮
  g.add(
    tube(
      [
        [-12, 8, -9],
        [-12, 60, -11.5],
        [-12, 88, -13],
        [-8, 95, -13.5],
        [8, 95, -13.5],
        [12, 88, -13],
        [12, 60, -11.5],
        [12, 8, -9],
      ],
      1,
      frame,
      { seg: 40, radial: 6 },
    ),
  )
  g.add(cylX(1.7, 12, RUBBER, 0, 95.6, -13.6, 10))
  // 轮轴 + 两只轮子
  g.add(cylX(0.8, 33, frame, 0, 8, -9, 8))
  for (const s of [-1, 1]) g.add(discWheel(s * 16.5, 8, -9, 8, 3, WHITE, 'x'))
  // 托底板 + 前支脚
  g.add(rbox(28, 1.6, 22, frame, { y: 6.4, z: 2 }, 0.6))
  g.add(
    cappedTube(
      [
        [-9, 6.8, 12],
        [-9, 0.8, 14.5],
        [9, 0.8, 14.5],
        [9, 6.8, 12],
      ],
      0.8,
      frame,
      { seg: 14, radial: 6 },
    ),
  )
  // 布袋：袋身、翻盖（顶 + 前面垂下来的一片）、搭扣、前袋
  g.add(rbox(30, 54, 21, bag, { y: 8, z: 1.8 }, 5))
  g.add(rbox(31, 9, 22, trim, { y: 55, z: 1.8 }, 4))
  g.add(rbox(31, 16, 1.6, trim, { y: 46, z: 12.4 }, 0.7))
  g.add(rbox(4, 3, 0.8, STEEL, { y: 47.5, z: 13.4 }, 0.3))
  g.add(rbox(20, 16, 2.4, shade(bag, -0.07), { y: 16, z: 12.4 }, 1))
  g.add(noOutline(rbox(20.6, 1.4, 3.2, trim, { y: 30.2, z: 12.4 }, 0.5)))
  // 把袋子绑在架子上的两对系带
  for (const s of [-1, 1]) for (const y of [30, 52]) g.add(rbox(3, 2.4, 4, trim, { x: s * 12, y, z: -9.6 }, 0.8))
  return fitGroup(g)
}

// ---------- 搬运手推车：L 形钢管架、一块铲板、两只轮子，上面摞着两只封了胶带的纸箱，用两道捆扎带勒在架子上 ----------

function handTruck(p: string[]) {
  const [frame, strap, box] = p
  const g = new THREE.Group()
  const zf = -14
  const tape = shade(box, 0.14)
  // 钢管架：一根弯管绕成两根立柱和顶上往后弯的把手，中间三根横档和一条竖板
  g.add(
    tube(
      [
        [-15, 2, zf],
        [-15, 50, zf],
        [-15, 86, zf],
        [-12, 97, zf - 3.4],
        [12, 97, zf - 3.4],
        [15, 86, zf],
        [15, 50, zf],
        [15, 2, zf],
      ],
      1.3,
      frame,
      { seg: 48, radial: 8 },
    ),
  )
  for (const y of [28, 56, 84]) g.add(cylX(1, 29, frame, 0, y, zf, 8))
  g.add(rbox(3.4, 82, 0.9, frame, { y: 3, z: zf }, 0.4))
  g.add(cylX(1.9, 13, RUBBER, 0, 97.6, zf - 3.5, 10))
  // 铲板
  g.add(rbox(36, 1.2, 28, STEEL, { y: 0, z: -1 }, 0.4))
  // 轮轴支架 + 轮轴 + 两只轮子
  for (const s of [-1, 1]) {
    g.add(rbox(1.8, 14, 9, frame, { x: s * 15, y: 3, z: zf - 3 }, 0.6))
    g.add(discWheel(s * 19.6, 8, zf - 4.5, 8, 3.6, strap, 'x'))
  }
  g.add(cylX(1, 40, STEEL, 0, 8, zf - 4.5, 8))
  // 两只纸箱：下面的大、上面的小而且歪一点；封箱胶带绕一圈，下面那只贴一张标签
  const bz = -0.8
  g.add(rbox(34, 28, 24, box, { y: 1.2, z: bz }, 0.6))
  g.add(noOutline(rbox(5, 28.7, 24.7, tape, { y: 0.85, z: bz }, 0.6)))
  g.add(noOutline(rbox(9, 6, 0.5, WHITE, { x: 9.5, y: 6, z: bz + 12.1 }, 0.2)))
  g.add(P(G(rbox(30, 22, 22, shade(box, 0.04), {}, 0.6), noOutline(rbox(5, 22.7, 22.7, tape, { y: -0.35 }, 0.6))), 0, 29.2, bz - 0.4, 0, 0.07, 0))
  // 两道捆扎带：从立柱后面绕过箱子正面
  for (const [y, hw, zfr] of [
    [17, 17.4, bz + 12.5],
    [41, 16.4, bz + 12.3],
  ]) {
    g.add(rbox(hw * 2 + 0.7, 1.8, 0.7, strap, { y, z: zfr }, 0.3))
    for (const s of [-1, 1]) {
      g.add(rbox(0.7, 1.8, zfr - zf + 2.3, strap, { x: s * hw, y, z: (zfr + zf - 1.6) / 2 }, 0.3))
      g.add(rbox(hw - 13, 1.8, 0.7, strap, { x: s * (hw + 13.6) * 0.5, y, z: zf - 1.6 }, 0.3))
    }
  }
  // 棘轮扣
  g.add(rbox(4.4, 3, 1.2, STEEL, { x: -7, y: 16.4, z: bz + 13 }, 0.4))
  return fitGroup(g)
}

// ---------- 折叠露营拖车：四只胖轮的折叠钢架（两侧 X 形交叉撑）兜着布车厢，拉杆竖起来卡在车头，里面放着保温箱和野餐垫卷 ----------

function campWagon(p: string[]) {
  const [fabric, frame, cooler, mat] = p
  const g = new THREE.Group()
  const L = 90
  const W = 48
  const y0 = 22
  const H = 28
  // 布兜：敞口的空心箱
  g.add(P(shell(L, H, W, 1.5, fabric, { top: false }), 0, y0, 0))
  // 折叠钢架：四角立柱、底边横梁、两侧的 X 形交叉撑
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(2.4, 37, 2.4, frame, { x: sx * (L / 2 + 0.2), y: 15, z: sz * (W / 2 + 0.2) }, 0.6))
    g.add(rbox(2, 2, W, frame, { x: sx * (L / 2 - 1), y: y0 - 2 }, 0.5))
  }
  for (const sz of [-1, 1]) {
    const z = sz * (W / 2 + 0.9)
    g.add(rbox(L, 2, 2, frame, { y: y0 - 2, z: sz * (W / 2 - 1) }, 0.5))
    g.add(rod3([-L / 2, y0 + 1, z], [L / 2, y0 + H - 2, z], 0.8, frame, 6))
    g.add(rod3([-L / 2, y0 + H - 2, z], [L / 2, y0 + 1, z], 0.8, frame, 6))
  }
  // 前后轮轴 + 支柱 + 四只胖轮
  for (const x of [-33, 33]) {
    g.add(cylZ(1.1, 44, frame, x, 9, 0, 8))
    for (const sz of [-1, 1]) {
      g.add(rbox(2.4, 13.8, 2.4, frame, { x, y: 8.6, z: sz * 15 }, 0.6))
      g.add(discWheel(x, 9, sz * 21, 9, 5.5, M.light, 'z', DARK))
    }
  }
  // 拉杆：从前轴探出来再竖起，卡在车头的卡扣上，顶上一只 T 形把手
  g.add(rod3([33, 9, 0], [48, 13.5, 0], 1.3, frame, 8))
  g.add(ball(1.6, frame, { x: 48, y: 13.5 }))
  g.add(rod3([48, 13.5, 0], [49.6, 95, 0], 1.2, frame, 8))
  g.add(cylZ(1.7, 17, RUBBER, 49.7, 96, 0, 10))
  g.add(rbox(4.6, 2.2, 3.4, frame, { x: 47, y: 47 }, 0.6))
  // 车里：保温箱（白盖 + 提手）和一卷野餐垫
  const fy = y0 + 1.5
  g.add(rbox(32, 21, 24, cooler, { x: -24, y: fy, z: -4 }, 2.5))
  g.add(rbox(33.4, 6, 25.4, WHITE, { x: -24, y: fy + 20.4, z: -4 }, 2))
  g.add(
    tube(
      [
        [-37, 49, -4],
        [-24, 55.5, -4],
        [-11, 49, -4],
      ],
      0.8,
      WHITE,
      { seg: 12, radial: 6 },
    ),
  )
  g.add(cylX(6.2, 36, mat, 20, fy + 6.2, 10, 20))
  g.add(noOutline(cylX(2.2, 36.6, shade(mat, -0.2), 20, fy + 6.2, 10, 12)))
  for (const x of [8, 20, 32]) g.add(noOutline(cylX(6.5, 2.6, WHITE, x, fy + 6.2, 10, 20)))
  for (const x of [13, 27]) g.add(noOutline(cylX(6.7, 1.2, DARK, x, fy + 6.2, 10, 20)))
  return fitGroup(g)
}

// ---------- 自行车停放架：落地的钢管架，一排三个卡位——每个卡位是两片并排的拱形管，车轮从中间插进去 ----------

function bikeRack(p: string[]) {
  const [frame, cap] = p
  const g = new THREE.Group()
  // 底框：前后两根长梁 + 两端短梁，四角垫脚
  for (const sz of [-1, 1]) g.add(rbox(80, 2.6, 2.6, frame, { y: 0.8, z: sz * 17 }, 0.6))
  for (const sx of [-1, 1]) {
    g.add(rbox(2.6, 2.6, 36.6, frame, { x: sx * 38.7, y: 0.8 }, 0.6))
    for (const sz of [-1, 1]) g.add(rbox(5, 1.2, 5, cap, { x: sx * 38.7, y: 0, z: sz * 17 }, 0.5))
  }
  // 三个卡位：后面立得高、前面斜着落下来
  for (const cx of [-25, 0, 25])
    for (const s of [-1, 1]) {
      const x = cx + s * 3.4
      g.add(
        tube(
          [
            [x, 2.1, -17],
            [x, 30, -15.5],
            [x, 38, -9],
            [x, 31, -2],
            [x, 2.1, 17],
          ],
          0.9,
          frame,
          { seg: 20, radial: 6 },
        ),
      )
    }
  // 把一排拱顶串起来的横杆
  g.add(cylX(0.8, 58, frame, 0, 37.6, -9, 8))
  for (const sx of [-1, 1]) g.add(ball(1.2, cap, { x: sx * 29, y: 37.6, z: -9 }))
  return fitGroup(g)
}

// ---------- 自行车维修架：三脚底座、伸缩立柱和快拆卡箍，顶上一只伸出来的夹头，立柱上挂着工具盘 ----------

function repairStand(p: string[]) {
  const [frame, acc, trayC] = p
  const g = new THREE.Group()
  // 三脚底座：三条腿 + 三根小撑杆
  for (let k = 0; k < 3; k++) {
    const a = PI / 2 + (k * PI * 2) / 3
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(rod3([c * 2.5, 36, s * 2.5], [c * 37, 1.6, s * 37], 1.4, frame, 8))
    g.add(cyl(2, 2.3, 1.6, RUBBER, { x: c * 37.4, z: s * 37.4 }, 10))
    g.add(rod3([c * 2, 9, s * 2], [c * 21, 18.4, s * 21], 0.8, frame, 6))
  }
  // 伸缩立柱：粗的下管、细的上管，腿座 / 撑杆座 / 快拆卡箍
  g.add(cyl(2.5, 2.5, 86, frame, { y: 6 }, 14))
  g.add(cyl(3.4, 3.4, 6, DARK, { y: 33 }, 14))
  g.add(cyl(3.2, 3.2, 3.4, DARK, { y: 6 }, 14))
  g.add(cyl(1.8, 1.8, 56, STEEL, { y: 88 }, 12))
  g.add(cyl(3.3, 3.3, 4.6, DARK, { y: 88.6 }, 14))
  g.add(rbox(1.4, 2, 7, acc, { x: 3.6, y: 89.8, z: 2.4 }, 0.5))
  // 夹头：头座、往前伸的夹臂、上下两片夹爪（中间垫着橡胶）、后面的夹紧旋钮
  g.add(rbox(7, 9, 9, DARK, { y: 141 }, 2))
  g.add(cylZ(2.3, 18, DARK, 0, 145.5, 12, 12))
  g.add(rbox(8, 3.4, 7, acc, { y: 141.4, z: 23.5 }, 1))
  g.add(rbox(8, 3.4, 7, acc, { y: 146.6, z: 23.5 }, 1))
  g.add(noOutline(rbox(7, 0.7, 6, RUBBER, { y: 144.6, z: 23.9 }, 0.2)))
  g.add(noOutline(rbox(7, 0.7, 6, RUBBER, { y: 146.1, z: 23.9 }, 0.2)))
  g.add(cylZ(1, 9, STEEL, 0, 145.5, -8.5, 8))
  g.add(ball(2.4, acc, { y: 145.5, z: -14 }))
  // 工具盘：一把扳手、一瓶链条油
  g.add(rbox(4, 2, 5, DARK, { y: 100, z: 3.4 }, 0.6))
  g.add(tray(24, 3.2, 12, 0.8, trayC, { y: 100, z: 11.6 }, 0.4))
  g.add(rbox(13, 0.8, 1.8, STEEL, { x: -3, y: 100.8, z: 10.6, ry: 0.35 }, 0.3))
  g.add(cyl(1.5, 1.5, 5, acc, { x: 7.5, y: 100.8, z: 13 }, 10))
  g.add(cyl(0.4, 0.9, 2, WHITE, { x: 7.5, y: 105.8, z: 13 }, 8))
  return fitGroup(g)
}

// ---------- 室内骑行台：一辆卸了后轮的公路车架在直驱骑行台上（后叉夹着骑行台的塔轮，左侧一只大飞轮盘），前轮踩着垫块 ----------

function bikeTrainer(p: string[]) {
  const [frame, unit, acc] = p
  const g = new THREE.Group()
  const r = 34
  // 前轮垫高 3cm 和骑行台找平：两头的轴心都在 ay
  const ay = r + 3
  const fx = 50
  const rx = -50
  const bb: V3 = [-10, 30, 0]
  // 前轮 + 垫块
  g.add(spokeWheel(fx, ay, r, { tire: 1.3, rim: DARK, spokes: 8, spokeR: 0.22, hub: 1.5, hubLen: 8 }))
  g.add(rbox(28, 4.4, 13, unit, { x: fx, y: 0 }, 1.6))
  // 公路车架：立管、头管、上管、下管、五通，后上叉 / 后下叉 / 前叉
  g.add(rod3(bb, [-19, 78, 0], 1.6, frame, 10))
  g.add(rod3([36, 72, 0], [32.6, 86, 0], 2.1, frame, 10))
  g.add(rod3([-18.4, 75, 0], [33.2, 81.5, 0], 1.6, frame, 10))
  g.add(rod3([35.2, 75.5, 0], bb, 2.1, frame, 10))
  g.add(cylZ(2.6, 7, frame, bb[0], bb[1], 0, 12))
  for (const s of [-1, 1]) {
    g.add(rod3([-10, 30, s * 2.6], [rx, ay, s * 6.6], 0.9, frame, 8))
    g.add(rod3([-18.2, 74, s * 2], [rx, ay, s * 6.6], 0.8, frame, 8))
    g.add(rod3([36.2, 71.4, s * 3], [fx, ay, s * 4.4], 1.1, frame, 8))
  }
  g.add(cylZ(1.3, 8, frame, 36.2, 71.6, 0, 8))
  // 车座
  g.add(rod3([-19, 78, 0], [-21.8, 93.5, 0], 1.2, DARK, 8))
  g.add(saddle(-22.6, 95.4, 26, 13, DARK))
  // 把立 + 缠着把带的弯把 + 手变 + 码表
  g.add(rod3([32.6, 86, 0], [42, 88.6, 0], 1.5, DARK, 8))
  g.add(
    cappedTube(
      [
        [44, 76, -20],
        [51.5, 77.5, -20],
        [53.5, 84, -20],
        [50, 88.6, -20],
        [44, 88.6, -18.5],
        [42, 88.6, -12],
        [42, 88.6, 0],
        [42, 88.6, 12],
        [44, 88.6, 18.5],
        [50, 88.6, 20],
        [53.5, 84, 20],
        [51.5, 77.5, 20],
        [44, 76, 20],
      ],
      1.1,
      acc,
      { seg: 64, radial: 6 },
    ),
  )
  for (const s of [-1, 1]) {
    g.add(rbox(3, 7.5, 2.8, DARK, { x: 52, y: 86, z: s * 20, rz: -0.4 }, 1))
    g.add(rod3([53.6, 87, s * 20], [55, 77.5, s * 20.4], 0.5, STEEL, 6))
  }
  g.add(P(G(rbox(5, 1.2, 3.4, DARK, {}, 0.4), lit(rbox(3.6, 0.4, 2.4, '#bfe9c9', { y: 1 }, 0.1), '#bfe9c9', 0.6)), 45.4, 89.2, 0, 0, 0, 0.1))
  // 下管上的水壶
  g.add(rod3([1.8, 49.3, 0], [11.7, 59.3, 0], 3.3, acc, 12))
  g.add(rod3([11.7, 59.3, 0], [13.5, 61.1, 0], 2, WHITE, 10))
  // 牙盘曲柄、链条、后拨
  g.add(crankset(bb[0], bb[1], 9.4, 17, 4.8, -1, DARK))
  g.add(noOutline(rod3([-10, 39.2, 4.8], [rx, ay + 4.6, 4.4], 0.35, DARK, 5)))
  g.add(noOutline(rod3([-10, 20.8, 4.8], [rx + 1.5, 24.6, 4.8], 0.35, DARK, 5)))
  g.add(rbox(2.2, 11.5, 1.4, DARK, { x: rx + 1, y: 22.6, z: 4.8 }, 0.5))
  // 直驱骑行台：机身立柱夹在后叉之间，右侧是塔轮，左侧是大飞轮盘（两面各一道色圈）
  g.add(cylZ(2, 21, STEEL, rx, ay, -3.5, 10))
  g.add(P(cyl(2.4, 5.4, 3.6, STEEL, {}, 16), rx, ay, 3.2, PI / 2))
  g.add(rbox(11, 38, 5.2, unit, { x: rx, y: 2.4, z: -1.6 }, 2))
  g.add(cylZ(15, 4.4, DARK, rx, ay, -11, 28))
  for (const z of [-8.9, -13.1]) g.add(noOutline(torus(11.5, 0.9, acc, { x: rx, y: ay, z })))
  g.add(lit(ball(0.8, '#6fe08a', { x: rx + 5.6, y: 30, z: -1.6 }), '#6fe08a', 0.9))
  // 底脚：一根前后向的中梁 + 两条往外撇的腿，脚下垫着橡胶垫
  g.add(rbox(48, 3.4, 7, unit, { x: rx - 2, y: 0.4, z: -1.6 }, 1.2))
  for (const x of [rx - 23, rx + 19]) g.add(cyl(3, 3.4, 1.2, RUBBER, { x, z: -1.6 }, 12))
  for (const s of [-1, 1]) {
    const dx = -9
    const dz = s * 27
    g.add(rbox(Math.hypot(dx, dz), 3.2, 6, unit, { x: rx + dx / 2, y: 0.4, z: -1.6 + dz / 2, ry: Math.atan2(-dz, dx) }, 1.2))
    g.add(cyl(3.2, 3.6, 1.2, RUBBER, { x: rx + dx, z: -1.6 + dz }, 12))
  }
  return fitGroup(g)
}

// ---------- 头盔与滑板壁挂：一条木挂板，两只木钉上各扣一顶头盔（骑行盔 + 滑板盔），上面两只 L 形托架横架着一块滑板 ----------

/**
 * 头盔：半球壳 + 一圈盔沿 + 封住开口的内衬，底边在 y = 0、盔沿探到 -0.8。
 * slots 是骑行盔（前后拉长，顶上三道纵向的风槽），dots 是滑板盔（圆，几颗圆风孔）。
 */
function helmet(shellC: string, vents: 'slots' | 'dots') {
  const g = new THREE.Group()
  const [r, sx, sy, sz] = vents === 'slots' ? [10, 1.3, 1.25, 1] : [10.5, 1.06, 1.14, 0.95]
  const dome = mesh(new THREE.SphereGeometry(r, 20, 8, 0, PI * 2, 0, PI / 2), shellC)
  dome.scale.set(sx, sy, sz)
  g.add(dome)
  const rim = torus(r, 0.8, shade(shellC, -0.12), { rx: PI / 2 })
  rim.scale.set(sx, sz, 1)
  g.add(rim)
  const liner = cyl(r - 0.4, r - 0.4, 0.8, DARK, { y: -0.2 }, 20)
  liner.scale.set(sx, 1, sz)
  g.add(noOutline(liner))
  const dark = shade(shellC, -0.32)
  if (vents === 'slots') {
    // 风槽：顺着盔壳截面的椭圆弧，半埋在壳里
    for (const z of [-4.6, 0, 4.6]) {
      const k = Math.sqrt(1 - (z / (r * sz)) ** 2)
      const b = r * sy * k - 0.1
      const rib = torus(b, 0.5, dark, { z, rz: PI / 6 }, (PI * 2) / 3)
      rib.scale.x = (r * sx * k) / (r * sy * k)
      g.add(noOutline(rib))
    }
  } else {
    for (const [x, z] of [
      [-4.5, 6.5],
      [4.5, 6.5],
      [0, 1],
      [-4.5, -4.5],
      [4.5, -4.5],
    ]) {
      const y = r * sy * Math.sqrt(1 - (x / (r * sx)) ** 2 - (z / (r * sz)) ** 2)
      g.add(noOutline(ball(1.1, dark, { x: x * 0.98, y: y * 0.98, z: z * 0.98 })))
    }
  }
  return g
}

const HR_MOUNT = 120
const HR_D = 22
function helmetRack(p: string[]) {
  const [board, capA, capB, deck] = p
  const g = new THREE.Group()
  // 墙面在 zb
  const zb = -HR_D / 2
  const peg = shade(board, -0.12)
  // 木挂板 + 两只圆木钉，头盔扣在木钉上、后沿贴着挂板
  g.add(rbox(76, 20, 2, board, { y: 0, z: zb + 1 }, 0.6))
  for (const [x, c, kind] of [
    [-20, capA, 'slots'],
    [20, capB, 'dots'],
  ] as [number, string, 'slots' | 'dots'][]) {
    g.add(cylZ(1.4, 10, peg, x, 9.5, zb + 6.8, 10))
    g.add(ball(2, peg, { x, y: 9.5, z: zb + 12 }))
    g.add(P(helmet(c, kind), x, 1, zb + 12.1))
  }
  // 两只 L 形托架：竖片钉在挂板上，横臂往前伸，头上一个小挡头
  for (const x of [-11, 11]) {
    g.add(rbox(3, 13, 1, DARK, { x, y: 13, z: zb + 2.45 }, 0.3))
    g.add(rbox(3, 1.6, 19.6, DARK, { x, y: 24.4, z: zb + 11.3 }, 0.5))
    g.add(rbox(3, 3.6, 1.2, DARK, { x, y: 24.4, z: zb + 21.5 }, 0.4))
  }
  // 滑板：平的中段 + 两头翘起的圆头，板面贴砂纸，下面两副桥和四只轮子
  const by = 26
  const dz = 0.2
  g.add(rbox(44, 1.2, 19, deck, { y: by, z: dz }, 0.5))
  g.add(plate(43, 18.2, DARK, { y: by + 1.27, z: dz }))
  for (const s of [-1, 1]) {
    const tail = G(rbox(9, 1.2, 19, deck, { x: 4.2, y: -0.6 }, 0.5), cyl(9.5, 9.5, 1.2, deck, { x: 8.4, y: -0.6 }, 20), plate(14.5, 18.2, DARK, { x: 6.5, y: 0.67 }))
    g.add(P(tail, s * 21.8, by + 0.6, dz, 0, s > 0 ? 0 : PI, 0.32))
    const tx = s * 15.5
    g.add(rbox(4.4, 2.8, 5.4, STEEL, { x: tx, y: by - 2.8, z: dz }, 0.8))
    g.add(cylZ(1, 16.4, STEEL, tx, by - 2.9, dz, 8))
    for (const sz of [-1, 1]) g.add(cylZ(2.7, 3.2, WHITE, tx, by - 2.9, dz + sz * 8, 14))
  }
  return fitWall(g, HR_MOUNT, HR_D)
}

// ---------- 配色 ----------

/** 儿童滑板车：[车身, 轮芯, 握把] */
const SCOOTER_PALS: Pal[] = [
  ['cute', [C.sky, C.lemon, C.pink]],
  ['cute', [C.pink, C.mint, C.lilac]],
  ['modern', [M.white, '#3f7fd8', M.char]],
  ['retro', [R.red, R.cream, R.mustard]],
]
/** 平衡车：[车架, 车座和握把, 轮圈和号码牌] */
const BALANCE_PALS: Pal[] = [
  ['cute', [C.mint, C.ink, C.white]],
  ['nordic', [N.mustard, M.char, N.white]],
  ['modern', [M.black, '#e8483f', M.silver]],
  ['retro', [R.red, R.caramel, R.cream]],
]
/** 三轮车：[车架, 座椅和小筐, 后轮 / 脚踏 / 握把] */
const TRIKE_PALS: Pal[] = [
  ['retro', ['#d8483f', WHITE, '#f2c230']],
  ['cute', [C.pink, C.white, C.mint]],
  ['cute', [C.sky, C.lemon, C.peach]],
  ['nordic', [N.sage, N.oakL, N.mustard]],
]
/** 儿童自行车：[车架, 车座 / 握把 / 挡泥板, 车筐 / 链罩 / 辅助轮] */
const KIDS_BIKE_PALS: Pal[] = [
  ['cute', [C.pink, C.white, C.lilac]],
  ['cute', [C.sky, C.white, C.lemon]],
  ['modern', ['#3f7fd8', M.black, '#f2c230']],
  ['retro', [R.teal, R.cream, R.orange]],
]
/** 电动滑板车：[车身, 点缀（轮盖 / 扳手 / 油门）, 脚垫] */
const E_SCOOTER_PALS: Pal[] = [
  ['modern', [M.char, '#e8483f', M.black]],
  ['modern', [M.white, '#3f7fd8', M.char]],
  ['industrial', [I.steel, I.rust, I.iron]],
  ['modern', ['#5f6f52', '#f2c230', M.black]],
]
/** 妈妈自行车：[车架和挡泥板, 车筐和儿童座椅, 车座 / 握把 / 座垫] */
const MAMACHARI_PALS: Pal[] = [
  ['japanese', [J.ai, '#8a6a4a', J.sumi]],
  ['modern', [M.silver, M.char, M.black]],
  ['retro', ['#8fc7b8', R.caramel, R.cream]],
  ['cute', [C.pink, C.woodL, '#8a6a52']],
  ['classic', ['#7a2e3a', '#e9dcc3', '#5a3b2a']],
]
/** 折叠自行车：[车架, 车座和握把, 挡泥板和扳手] */
const FOLDING_PALS: Pal[] = [
  ['modern', ['#e8483f', M.black, M.silver]],
  ['modern', [M.char, '#8a5a3a', '#f2c230']],
  ['nordic', ['#4f8fc0', M.char, N.white]],
  ['retro', ['#2f6f4e', R.caramel, R.cream]],
]
/** 电助力自行车：[车架, 电池和电机, 车座和握把] */
const E_BIKE_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.black]],
  ['modern', [M.char, M.black, '#8a5a3a']],
  ['industrial', ['#5f6f52', I.iron, I.leather]],
  ['nordic', [N.blue, M.char, '#8a6a52']],
]
/** 踏板摩托：[车壳, 座垫, 后备箱] */
const MOPED_PALS: Pal[] = [
  ['retro', ['#8fc7b8', '#8a5a3a', R.cream]],
  ['cute', [C.pink, C.ink, C.white]],
  ['modern', [M.white, M.black, M.char]],
  ['retro', [R.red, '#3a2a22', R.cream]],
  ['retro', [R.mustard, '#5a3b2a', '#3d3f44']],
]
/** 买菜拖车：[布袋, 翻盖和系带, 钢管架] */
const TROLLEY_PALS: Pal[] = [
  ['retro', [R.red, R.cream, M.silver]],
  ['nordic', ['#5d7fa3', N.linen, M.silver]],
  ['cute', [C.pink, C.white, C.steel]],
  ['modern', [M.char, '#e8483f', M.silver]],
  ['farmhouse', [F.sage, F.linen, F.iron]],
  ['japanese', [J.ai, J.washi, J.sumi]],
]
/** 手推车：[钢管架, 捆扎带和轮芯, 纸箱] */
const HAND_TRUCK_PALS: Pal[] = [
  ['modern', ['#3f7fd8', '#f2c230', '#c9a06a']],
  ['industrial', [I.iron, I.rust, '#b98d5a']],
  ['modern', [M.silver, '#e8483f', '#d1ac78']],
  ['retro', [R.red, R.teal, '#c49a62']],
]
/** 露营拖车：[布兜, 钢架, 保温箱, 野餐垫] */
const WAGON_PALS: Pal[] = [
  ['modern', ['#6b7358', M.black, '#3f7fd8', '#e8483f']],
  ['nordic', ['#c9b089', M.char, N.blue, N.mustard]],
  ['modern', [M.char, M.black, '#e8483f', M.light]],
  ['industrial', ['#7a6a52', I.iron, I.rust, I.concrete]],
  ['cute', [C.sky, C.white, C.pink, C.lemon]],
]
/** 停放架：[钢管, 垫脚和堵头] */
const RACK_PALS: Pal[] = [
  ['modern', [M.silver, M.black]],
  ['modern', [M.black, '#e8483f']],
  ['industrial', [I.iron, I.rust]],
  ['nordic', [N.white, N.gray]],
]
/** 维修架：[立柱和腿, 夹爪和旋钮, 工具盘] */
const STAND_PALS: Pal[] = [
  ['modern', [M.black, '#e8483f', M.char]],
  ['modern', [M.silver, '#3f7fd8', M.black]],
  ['industrial', [I.iron, '#f2c230', I.steel]],
]
/** 骑行台：[公路车车架, 骑行台和垫块, 把带 / 水壶 / 飞轮色圈] */
const TRAINER_PALS: Pal[] = [
  ['modern', [M.white, M.char, '#e8483f']],
  ['modern', [M.black, M.silver, '#3f7fd8']],
  ['modern', ['#e8483f', M.black, '#f2c230']],
  ['retro', ['#7fc8b8', M.char, WHITE]],
]
/** 头盔与滑板壁挂：[木挂板, 骑行盔, 滑板盔, 滑板] */
const HELMET_RACK_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.blue, N.mustard]],
  ['modern', [M.walnut, M.black, '#e8483f', M.light]],
  ['cute', [C.woodL, C.pink, C.mint, C.lilac]],
  ['industrial', [I.walnut, I.steel, I.rust, I.concrete]],
  ['retro', [R.caramel, R.cream, R.teal, R.orange]],
]

/** 孩子的乘骑玩具（儿童房一键布置会从 kids + toy 的落地件里挑） */
const KID_RIDE: Partial<AssetDef> = { type: 'toy', tags: ['for-kids'] }
/** 代步的车：和 misc.ts 的「自行车」同一个类型 */
const RIDE: Partial<AssetDef> = { type: 'sports-gear' }

export const RIDES: AssetDef[] = [
  define('ride-kick-scooter', '儿童滑板车', 'kids', [58, 28, 79], SCOOTER_PALS, kickScooter, { ...KID_RIDE, mats: ['plastic', 'plastic', 'plastic'] }),
  define('ride-balance-bike', '儿童平衡车', 'kids', [84, 36, 54], BALANCE_PALS, balanceBike, { ...KID_RIDE, mats: ['metal', 'plastic', 'plastic'] }),
  define('ride-tricycle', '儿童三轮车', 'kids', [71, 45, 56], TRIKE_PALS, tricycle, { ...KID_RIDE, mats: ['metal', 'plastic', 'plastic'] }),
  define('ride-kids-bike', '儿童自行车', 'kids', [119, 43, 74], KIDS_BIKE_PALS, kidsBike, { ...RIDE, tags: ['for-kids'], mats: ['metal', 'plastic', 'plastic'] }),
  define('ride-e-scooter', '电动滑板车', 'entrance', [108, 44, 117], E_SCOOTER_PALS, eScooter, { ...RIDE, mats: ['metal', 'plastic', 'plastic'] }),
  define('ride-mamachari', '妈妈自行车', 'outdoor', [178, 57, 107], MAMACHARI_PALS, mamachari, { ...RIDE, mats: ['metal', 'plastic', 'leather'] }),
  define('ride-folding-bike', '折叠自行车', 'entrance', [78, 29, 60], FOLDING_PALS, foldingBike, { ...RIDE, tags: ['hobby:sports'], mats: ['metal', 'leather', 'metal'] }),
  define('ride-ebike', '电助力自行车', 'outdoor', [186, 60, 107], E_BIKE_PALS, eBike, { ...RIDE, mats: ['metal', 'plastic', 'leather'] }),
  define('ride-moped', '小型踏板摩托', 'outdoor', [168, 64, 108], MOPED_PALS, moped, { ...RIDE, mats: ['plastic', 'leather', 'plastic'] }),
  define('ride-shopping-trolley', '买菜拖车', 'entrance', [36, 33, 99], TROLLEY_PALS, shoppingTrolley, { type: 'shopping-bag', mats: ['fabric', 'fabric', 'metal'] }),
  define('ride-hand-truck', '搬运手推车', 'storage', [43, 40, 100], HAND_TRUCK_PALS, handTruck, { type: 'tool', mats: ['metal', 'fabric', 'paper'] }),
  define('ride-wagon', '折叠露营拖车', 'outdoor', [98, 52, 98], WAGON_PALS, campWagon, { type: 'outdoor-gear', mats: ['fabric', 'metal', 'plastic', 'fabric'] }),
  define('ride-bike-rack', '自行车停放架', 'outdoor', [82, 39, 39], RACK_PALS, bikeRack, { ...RIDE, mats: ['metal', 'plastic'] }),
  define('ride-bike-stand', '自行车维修架', 'hobby', [70, 61, 150], STAND_PALS, repairStand, { type: 'tool', tags: ['hobby:sports'], mats: ['metal', 'plastic', 'metal'] }),
  define('ride-trainer', '室内骑行台', 'fitness', [160, 61, 98], TRAINER_PALS, bikeTrainer, { type: 'cardio', tags: ['sports-gear', 'hobby:sports'], mats: ['metal', 'plastic', 'plastic'] }),
  define('ride-helmet-rack', '头盔与滑板壁挂', 'entrance', [78, HR_D, 33], HELMET_RACK_PALS, helmetRack, {
    type: 'hook-rack',
    tags: ['sports-gear'],
    mount: HR_MOUNT,
    mats: ['wood', 'plastic', 'plastic', 'wood'],
  }),
]
