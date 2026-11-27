// 衣物补充（gx- 前缀）：袜子、文胸、睡衣、皮带、毛线手套、浴袍、防尘衣罩、内裤、打底裤、针织耳罩。约定见 kit.ts 开头和 garments.ts 开头。
//   - 叠好 / 平放形态原点在底面中心（build 末尾 fitGroup 落地居中）。
//   - 挂起形态和现有衣物（garments-pack.ts）一致：原点 = 挂点，模型都在原点下方，衣服朝 +z。
//     衣架用 garments.ts 的 buildHanger（返回 [衣架本体, 钩]），自己做的衣物加进衣架本体里——本体坐标系里衣架平面在 z = 0，
//     夹子衣架的夹口在 y = CLIP_Y，夹子中心在 x = ±clipX(hw)。睡衣上衣、浴袍、防尘袋里的西装直接用 buildGarment。
//   - 同一件东西的两种形态是同一个 series，靠 form 区分；type 都是 clothing。

import * as THREE from 'three'
import { buildGarment, buildHanger, garment } from '../garments'
import { ball, box, cyl, nub, rbox, shade, torus } from '../toon'
import { C, type AssetDef } from '../kit'
import { G, P, PI, batten, box3, cappedTube, cylZ, fitGroup, ghost, latheAt, mesh, rod3, tube, type V2, type V3 } from '../geo'
import { I, J, M, N, R, define, type Pal } from '../packkit'

const METAL = '#c3c7cc'
const CLIP_WHITE = '#f4f1ec'
const HOLE = '#3a302a'
const SHIRT = '#e8edf3'

/** 夹子衣架的夹口：衣物顶边在这里（garments.ts 的 CLIP_TOP） */
const CLIP_Y = -9
/** 肩形衣架：脖子落点和肩条斜率（garments.ts 的 NECK_Y / SLOPE） */
const NECK_Y = -5.4
const SLOPE = 0.42
/** 夹子衣架两只夹子的 x：clipBar 里 cx = hw × 0.85 − 2.5 */
const clipX = (hw: number) => hw * 0.85 - 2.5
/** 植绒衣架（肩条厚 0.8）在 x 处的肩条顶面 */
const velvetTop = (x: number) => NECK_Y - SLOPE * Math.abs(x) - 0.16 + 0.43

/** xy 平面内的剪影板（布片）：厚 t，z 居中，带一点倒角（轮廓不外扩） */
function flat(pts: V2[], t: number, color: string, z = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const b = Math.min(0.15, t * 0.3)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - b * 2), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 4 })
  geo.translate(0, 0, -t / 2 + b)
  return P(mesh(geo, color), 0, 0, z)
}

/** 圆弧上的点（xy 平面，角度 a0 → a1，n 段） */
function arcXY(cx: number, cy: number, r: number, a0: number, a1: number, n: number): V2[] {
  const out: V2[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}

const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/** 圆角矩形的闭合路径（xy 平面，中心 (0, cy)，z 固定）：只给四个角点的话闭合样条会往外鼓，所以每个角给一段圆弧 */
function loop3(hw: number, hh: number, r: number, cy: number, z: number): V3[] {
  const pts: V3[] = []
  const corners: V3[] = [[hw - r, hh - r, 0], [-hw + r, hh - r, PI / 2], [-hw + r, -hh + r, PI], [hw - r, -hh + r, PI * 1.5]]
  for (const [x, y, a0] of corners)
    for (let i = 0; i <= 3; i++) {
      const a = a0 + (i / 3) * (PI / 2)
      pts.push([x + Math.cos(a) * r, cy + y + Math.sin(a) * r, z])
    }
  return pts
}
const flipX = (pts: V2[], sx: number): V2[] => pts.map(([x, y]): V2 => [x * sx, y])

/** 夹子衣架 + 夹着的衣物（衣物写在衣架本体坐标系里） */
function clipHang(hw: number, ...cloth: THREE.Object3D[]) {
  const h = buildHanger('clip', 'plastic', CLIP_WHITE, { hw })
  h.children[0].add(...cloth)
  return h
}

/** 衣物通用的挂起参数（和 garments-pack 一致：一个台面最多摆 30 件） */
const LIMIT = { limit: { scope: 'surface' as const, max: 30 } }

// ---------- 袜子：一双卷成一团（袜口翻过来包住另一只）/ 两只各夹一只夹子挂起 ----------

const SOCK_PAL: Pal[] = [
  ['nordic', [N.linen, N.blue, N.oak]],
  ['modern', [M.char, M.light, M.gray]],
  ['cute', [C.sakura, C.white, C.red]],
  ['retro', [R.mustard, R.cream, R.teal]],
]

/**
 * 一团卷好的袜子：先在「轴沿 y、截面是圆」的坐标里做——袜身是长椭球，翻过来的袜口（罗纹）是罩住一头、比袜身厚 0.35 的壳，
 * 壳口一圈卷边、壳上几道罗纹；另一头露出异色的袜尖。最后把轴转到 x、前后拉宽成扁的一团。
 */
const SOCK_L = 4.6
const SOCK_R = 2.4
/** 袜身往外长出 grow 的那层椭球壳在 y 处的半径（grow = 0 就是袜身） */
const sockRad = (y: number, grow = 0) => (SOCK_R + grow) * Math.sqrt(Math.max(0, 1 - (y / (SOCK_L + grow)) ** 2))
/** 一团袜子的截面直径只有五六厘米：一圈 16 段，贴着它的卷边、罗纹用同样的段数 */
const SOCK_SEG = 16
/**
 * 罩在袜身一头的壳：比袜身大 grow 的椭球面，从 y0 到尖端（按角度取点，尖端是圆头；按 y 等距取点的话尖端会成一个锥）。
 * 起点在袜身里面，开口藏在袜身里
 */
function sockCap(y0: number, grow: number, dir: 1 | -1, n: number): V2[] {
  const pts: V2[] = [[sockRad(y0) - 0.3, y0]]
  const t0 = Math.acos((dir * y0) / (SOCK_L + grow))
  for (let i = 0; i < n; i++) {
    const t = t0 * (1 - i / n)
    pts.push([(SOCK_R + grow) * Math.sin(t), dir * (SOCK_L + grow) * Math.cos(t)])
  }
  // 尖端收到轴上（不然顶上留个小洞，看得见里面的袜身）
  pts.push([0.01, dir * (SOCK_L + grow)])
  return dir > 0 ? pts : pts.reverse()
}
function sockBall(p: string[]) {
  const [main, cuff, toe] = p
  const s = new THREE.Group()
  const body: V2[] = []
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * PI
    body.push([Math.max(0.01, SOCK_R * Math.sin(t)), -SOCK_L * Math.cos(t)])
  }
  s.add(latheAt(body, main, {}, SOCK_SEG))
  // 翻过来的袜口：从 y = 0.4 罩到这一头
  const y0 = 0.4
  s.add(latheAt(sockCap(y0, 0.35, 1, 6), cuff, {}, SOCK_SEG))
  s.add(torus(sockRad(y0, 0.3), 0.32, cuff, { y: y0, rx: PI / 2 }, PI * 2, [6, SOCK_SEG]))
  // 罗纹：几道略深的细环（半埋在袜口的壳里）
  for (const y of [1.5, 2.4, 3.3]) s.add(torus(sockRad(y, 0.35) + 0.03, 0.1, shade(cuff, -0.12), { y, rx: PI / 2 }, PI * 2, [4, SOCK_SEG]))
  // 另一头的袜尖
  s.add(latheAt(sockCap(-3.3, 0.15, -1, 4), toe, {}, SOCK_SEG))
  s.rotation.z = -PI / 2
  s.scale.z = 1.5
  return fitGroup(G(s))
}

/** 平铺的一只袜子（xy 平面，袜口顶边在 y = 0，脚尖朝 sx） */
function sockFlat(p: string[], sx: number) {
  const [main, cuff, toe] = p
  const toeArc = arcXY(11, -14.15, 3.35, PI / 2, -PI / 2, 8)
  const body: V2[] = [[-3.5, 0], [3.5, 0], [3.5, -10], ...toeArc, [-1, -18], [-2.4, -17.6], [-3.3, -16.6], [-3.5, -15]]
  const g = new THREE.Group()
  g.add(flat(flipX(body, sx), 0.5, main))
  // 袜口罗纹：顶边比袜身高 0.2（两个顶面齐平会闪），整圈比袜身宽一点
  g.add(flat(flipX(rect(-3.8, -3.2, 3.8, 0.2), sx), 0.8, cuff))
  // 一道条纹 + 脚跟、脚尖的异色块（都比袜身轮廓往外多 0.15–0.3，侧面不和袜身共面）
  g.add(flat(flipX(rect(-3.75, -6.6, 3.75, -5.4), sx), 0.7, toe))
  g.add(flat(flipX([[-3.8, -13.5], [0.5, -14.2], [0.8, -18.35], [-1.1, -18.35], [-2.6, -17.9], [-3.65, -16.7]], sx), 0.7, toe))
  g.add(flat(flipX([[9, -10.35], [11.2, -10.5], ...arcXY(11, -14.15, 3.7, PI / 2 - 0.05, -PI / 2 + 0.05, 8).slice(1, -1), [11.2, -17.85], [9, -17.95]], sx), 0.7, toe))
  return g
}

function socksHanging(p: string[]) {
  const hw = 8
  return clipHang(hw, ...[-1, 1].map((sx) => P(sockFlat(p, sx), sx * clipX(hw), CLIP_Y, 0)))
}

// ---------- 文胸：两只罩杯 + 钢圈边 + 中间的小蝴蝶结 + 下围 + 肩带；平放 / 肩带挂在植绒衣架上 ----------

const BRA_PAL: Pal[] = [
  ['cute', [C.sakura, '#f7c2d0', '#e88aa0']],
  ['nordic', ['#efe6da', N.oak, N.sage]],
  ['modern', [M.black, M.char, M.silver]],
  ['classic', ['#cfd9e6', '#9fb0c8', '#f4ede0']],
]
const CUP_R = 5.8
const CUP_H = 4.6
/** 罩杯一圈的段数；贴着杯沿的钢圈包边用同样的段数（不然折线对不上，包边一截截陷进杯沿） */
const CUP_SEG = 20
/** 罩杯：底面封口的扁圆顶（车削体，轴沿 y，底面在 y = 0） */
function cupDome(color: string, at: { x?: number; y?: number; z?: number }) {
  const pts: V2[] = [[0.01, 0], [CUP_R, 0]]
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (PI / 2)
    pts.push([Math.max(0.01, CUP_R * Math.cos(a)), CUP_H * Math.sin(a)])
  }
  return latheAt(pts, color, at, CUP_SEG)
}

function braLying(p: string[]) {
  const [main, trim, acc] = p
  const g = new THREE.Group()
  const cx = 6.1
  for (const s of [-1, 1]) {
    g.add(cupDome(main, { x: s * cx }))
    // 罩杯底边的钢圈包边
    g.add(torus(CUP_R, 0.3, trim, { x: s * cx, y: 0.3, rx: PI / 2 }, PI * 2, [6, CUP_SEG]))
    // 两侧的侧比（下围）+ 背扣（都是几毫米厚的布片，用直角盒）
    g.add(box(4, 0.6, 3.2, trim, { x: s * 13.8, z: -1.2 }))
    g.add(nub(1, 0.8, 2.6, acc, { x: s * 15.4, z: -1.2 }))
    // 肩带：从罩杯上沿往后绕一圈，接到背扣上（末端埋进背扣里）
    g.add(tube([[s * 7.6, 3, -3], [s * 9, 3.2, -5.5], [s * 12.5, 1.2, -6.3], [s * 15.1, 0.5, -3.3], [s * 15.3, 0.4, -2]], 0.32, trim, { seg: 14, radial: 6 }))
  }
  // 中间的鸡心：夹在两只罩杯最近的地方、两头埋进罩杯（原先单独立在罩杯前面 2cm 处，哪边都不挨）；上面一只小蝴蝶结
  g.add(rbox(2.4, 2.2, 2.6, trim, { z: 1 }, 0.4))
  g.add(ball(0.75, acc, { y: 2.3, z: 1.8 }, [1.6, 1, 0.8], [8, 6]))
  return fitGroup(g)
}

function braHanging(p: string[]) {
  const [main, trim, acc] = p
  const h = buildHanger('shoulder', 'velvet', '#d9d2d6', { hw: 13 })
  const body = h.children[0]
  const cx = 6.1
  const yc = -21
  for (const s of [-1, 1]) {
    // 罩杯朝前鼓（车削轴转到 +z），底面贴在衣架平面上
    const cup = cupDome(main, { x: s * cx, y: yc, z: 0 })
    cup.rotation.x = PI / 2
    body.add(cup)
    // 罩杯下半圈的钢圈包边
    body.add(torus(CUP_R, 0.3, trim, { x: s * cx, y: yc, z: 0.3, rz: PI }, PI, [6, CUP_SEG / 2]))
    // 肩带：罩杯上沿 → 往上搭过肩条 → 从背后垂下来接到下围的端头
    const ax = s * 9.6
    const top = velvetTop(9.6) + 0.22
    body.add(tube([[s * 8.9, yc + 4.4, 1.1], [s * 9.4, -13, 0.75], [s * 9.5, top - 0.5, 0.55], [ax, top, 0], [s * 9.7, top - 0.5, -0.55], [s * 12.5, yc, -0.7], [s * 14.9, yc - 5.6, 0.3]], 0.3, trim, { seg: 28, radial: 6 }))
    body.add(nub(1, 2.4, 0.9, acc, { x: s * 15, y: yc - 7, z: 0.45 }))
  }
  // 下围、鸡心、蝴蝶结
  // （背面比罩杯底面往前 0.1：两个背面在同一平面上会闪）
  body.add(rbox(31, 2.2, 0.7, trim, { y: yc - 7, z: 0.45 }, 0.25))
  body.add(rbox(1.6, 5, 0.9, trim, { y: yc - 5.6, z: 0.55 }, 0.3))
  body.add(ball(0.75, acc, { y: yc - 1.2, z: 1.1 }, [1.6, 1, 0.8], [8, 6]))
  return h
}

// ---------- 睡衣套装：叠好的上衣压在叠好的裤子上（滚边 + 纽扣）/ 挂起的上衣（衬衫领 + 撞色袖口下摆） ----------

const PJ_PAL: Pal[] = [
  ['nordic', [N.blue, N.white, N.white]],
  ['cute', [C.sakura, C.white, C.red]],
  ['modern', [M.light, M.char, M.char]],
  ['retro', [R.cream, R.red, R.red]],
]
const pjSpec = (p: string[]) => garment('shirt', { main: p[0], sub: p[1], accent: p[2], collar: 'shirt', buttons: 5, sleeve: 56, fit: 0.6, len: 68, width: 46, thick: 1.4, hanger: 'wood' })

function pajamasFolded(p: string[]) {
  const [main, pipe, btn] = p
  const g = new THREE.Group()
  const fold = shade(main, -0.08)
  // 裤子：叠成一块，前沿露出两只裤脚的滚边，后沿是松紧腰 + 抽绳
  g.add(rbox(30, 3.6, 33, main, {}, 1))
  g.add(nub(30.4, 0.8, 0.6, pipe, { y: 1.4, z: 16.5 }))
  g.add(rbox(30.4, 2.6, 4, pipe, { y: 0.5, z: -14.8 }, 0.6))
  // 抽绳：从腰头里穿出来、贴着腰头后面垂下（原先离腰头后面半厘米多悬着）
  g.add(tube([[-2, 2.6, -16.3], [-1.5, 2.3, -16.95], [-1.8, 1.1, -16.95]], 0.22, btn, { seg: 8, radial: 5 }))
  // 上衣：叠好压在上面（往后错一点），领子在后沿，门襟纽扣，前沿是下摆的滚边
  const y1 = 3.5
  const top = y1 + 3.8
  g.add(rbox(28, 3.8, 30, main, { y: y1, z: -1 }, 1))
  const zb = -16
  // 领圈两头扎进衣服里（弯管两端不封口：停在面上的话从后面能看进管子里）
  g.add(tube([[-5.2, top - 0.7, zb + 1.5], [-3.4, top, zb + 3.8], [0, top, zb + 5], [3.4, top, zb + 3.8], [5.2, top - 0.7, zb + 1.5]], 0.5, pipe, { seg: 16, radial: 6 }))
  for (const s of [-1, 1]) g.add(box(3.4, 0.5, 4, pipe, { x: s * 2.6, y: top - 0.2, z: zb + 4.2, ry: s * 0.5 }))
  for (let i = 0; i < 3; i++) g.add(cyl(0.55, 0.55, 0.3, btn, { y: top - 0.1, z: zb + 10 + i * 6 }, 8))
  g.add(nub(28.4, 0.8, 0.6, pipe, { y: y1 + 1.4, z: 14.2 }))
  // 两侧袖子折进去压出的折线
  for (const s of [-1, 1]) g.add(nub(0.4, 0.25, 26, fold, { x: s * 8, y: top - 0.1, z: -1 }))
  return fitGroup(g)
}

/**
 * 挂起的睡衣上衣：衬衫版型，再加撞色的袖口、下摆滚边（不用 garments 的 rib：衬衫门襟和罗纹下摆的正面只差 0.03，会闪）。
 * 袖口、下摆的位置按 garments.ts buildTop 的版型算（衣身坐标，z = 0 居中）。
 */
function pajamasHanging(p: string[]) {
  const s = pjSpec(p)
  const h = buildGarment(s, 'hanging')
  const body = h.children[0]
  const T = s.thick
  const sw = s.width
  const k = sw / 44
  const nw = Math.max(4, Math.min(8, sw * 0.16))
  const yN = NECK_Y - SLOPE * nw + 1.6
  const yS = NECK_Y - SLOPE * (sw / 2) + 1.6
  const bw = sw * (1.02 + s.fit * 0.12)
  const yB = yN - s.len
  // 下摆滚边：比衣身宽 0.4、前后各凸出 0.4（压过门襟和纽扣下沿）
  body.add(rbox(bw + 0.4, 2, T + 0.8, s.sub, { y: yB - 0.1 }, 0.3))
  // 袖口：沿袖子末端的一圈，比袖子宽出 0.3、长出一点
  const th = 0.1 + s.fit * 0.05
  const d: V2 = [Math.sin(th), -Math.cos(th)]
  const n: V2 = [Math.cos(th), Math.sin(th)]
  const cuff = (9 + s.fit * 2.5) * Math.max(0.7, k)
  const e = 0.3
  for (const sx of [-1, 1]) {
    const A: V2 = [sw / 2 - 0.6, yS + 0.5]
    const B: V2 = [A[0] + d[0] * s.sleeve, A[1] + d[1] * s.sleeve]
    const Cc: V2 = [B[0] - n[0] * cuff, B[1] - n[1] * cuff]
    const q: V2[] = [
      [B[0] - d[0] * 3 + n[0] * e, B[1] - d[1] * 3 + n[1] * e],
      [B[0] + (n[0] + d[0]) * e, B[1] + (n[1] + d[1]) * e],
      [Cc[0] - (n[0] - d[0]) * e, Cc[1] - (n[1] - d[1]) * e],
      [Cc[0] - d[0] * 3 - n[0] * e, Cc[1] - d[1] * 3 - n[1] * e],
    ]
    body.add(flat(flipX(q, sx), T + 1, s.sub))
  }
  return h
}

// ---------- 皮带：卷成一卷立着放（皮带头在外圈）/ 皮带头挂在 S 钩上垂下来 ----------

const BELT_PAL: Pal[] = [
  ['industrial', [I.leather, METAL, HOLE]],
  ['modern', [M.black, M.silver, '#5b5e66']],
  ['retro', [R.caramel, '#d6b25e', HOLE]],
  ['nordic', ['#c7a47a', '#d9d4cc', '#6b5236']],
]
const BELT_W = 3.5
const BELT_T = 0.45

/** 卷起的皮带：带面立着绕成三圈的螺线（xz 平面内挤出，往上高 BELT_W），外圈尾端接皮带扣（扣框比带面宽，和带子一起落在桌面上） */
function beltCoil(p: string[]) {
  const [leather, buckle, holes] = p
  const g = new THREE.Group()
  const r0 = 1.6
  const pitch = 1.05
  const turns = 3
  // 每圈 20 段（最外圈直径不到 10cm）
  const n = 60
  const rAt = (a: number) => r0 + (pitch * a) / (2 * PI)
  const outer: V2[] = []
  const inner: V2[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * turns * 2 * PI
    const r = rAt(a)
    outer.push([Math.cos(a) * (r + BELT_T / 2), Math.sin(a) * (r + BELT_T / 2)])
    inner.push([Math.cos(a) * (r - BELT_T / 2), Math.sin(a) * (r - BELT_T / 2)])
  }
  const shape = new THREE.Shape([...outer, ...inner.reverse()].map(([x, y]) => new THREE.Vector2(x, y)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: BELT_W, bevelEnabled: false, curveSegments: 2 })
  // 挤出方向（局部 z）转到世界 +y：x 不变，形状的 y 变成世界 -z
  g.add(P(mesh(geo, leather), 0, 0, 0, -PI / 2))
  // 皮带扣：带子的尾端接在扣框的一条竖边上，扣框沿尾端的切线方向伸出去，扣针从这条边搭到对边上。
  // （原先扣框整个浮在带面外侧 0.4cm 处、哪儿都不挨，而且扣框比带面宽，把整卷带子顶离了桌面 0.6cm）
  const aE = turns * 2 * PI
  const rE = rAt(aE)
  const pE = new THREE.Vector3(Math.cos(aE) * rE, 0, -Math.sin(aE) * rE)
  const tan = new THREE.Vector3(-Math.sin(aE), 0, -Math.cos(aE)).normalize()
  const fr = new THREE.Group()
  const hw = 1.8
  const hh = (BELT_W + 0.6) / 2
  fr.add(tube(loop3(hw, hh, 0.6, 0, 0), 0.3, buckle, { closed: true, seg: 24, radial: 6 }))
  // 扣框局部 +z 朝卷的外侧：扣针压在对边的外面
  fr.add(rod3([-hw, 0, 0.1], [hw + 0.1, 0, 0.4], 0.18, buckle, 6))
  // 扣框平面 = 切线 × 竖直；靠带子的竖边压住带子尾端 0.1，扣框底边落在桌面上
  const c = pE.clone().addScaledVector(tan, hw + 0.2)
  fr.position.set(c.x, hh + 0.3, c.z)
  fr.rotation.y = Math.atan2(-tan.z, tan.x)
  g.add(fr)
  // 皮带孔：外圈靠尾端的三只（贴着外表面的深色小圆片）
  for (let i = 0; i < 3; i++) {
    const a = aE - 1.1 - i * 0.32
    const r = rAt(a) + BELT_T / 2
    const hole = cyl(0.22, 0.22, 0.3, holes, {}, 6)
    hole.position.set(Math.cos(a) * r, BELT_W / 2, -Math.sin(a) * r)
    hole.rotation.set(0, a, PI / 2)
    g.add(hole)
  }
  return fitGroup(g)
}

/** 挂起的皮带：扣框的活动边卡在 S 钩下环里，皮带从扣框另一边垂下 */
function beltHanging(p: string[]) {
  const [leather, buckle, holes] = p
  const h = buildHanger('shook', 'wire', METAL)
  const zc = 2.6
  // S 钩下环内底在 y ≈ -6.15，扣框顶边（半径 0.3）压在上面
  const yTop = -5.85
  const fh = 4.4
  const hw = 2.5
  h.add(tube(loop3(hw, fh / 2, 0.6, yTop - fh / 2, zc), 0.3, buckle, { closed: true, seg: 24, radial: 6 }))
  // 扣针：从下边往上搭在顶边前面
  h.add(rod3([0, yTop - fh, zc + 0.15], [0, yTop - 0.6, zc + 0.35], 0.18, buckle, 6))
  // 带身：顶端包住扣框下边，尾端圆头
  const len = 100
  const y0 = yTop - fh + 0.6
  const strap: V2[] = [[-BELT_W / 2, y0], [BELT_W / 2, y0], ...arcXY(0, y0 - len + BELT_W / 2, BELT_W / 2, 0, -PI, 8)]
  h.add(flat(strap, BELT_T, leather, zc))
  // 皮带圈（护扣）+ 五个孔
  h.add(rbox(BELT_W + 0.4, 1.2, BELT_T + 0.5, leather, { y: y0 - 3.5, z: zc }, 0.3))
  for (let i = 0; i < 5; i++) h.add(cylZ(0.22, BELT_T + 0.2, holes, 0, y0 - len + 9 + i * 2.5, zc, 6))
  return h
}

// ---------- 毛线手套：一双五指手套叠着平放 / 两只各夹在夹子上、手指朝下挂起 ----------

const GLOVE_PAL: Pal[] = [
  ['nordic', [N.linen, N.gray, '#c8473a']],
  ['cute', [C.lilac, C.white, C.lemon]],
  ['retro', [R.teal, R.cream, R.mustard]],
  ['modern', [M.gray, M.char, M.white]],
]

/**
 * 一根手指：直管 + 指尖的半球头，前后压扁成 k。a 端埋在手掌里不封口，b 端是指尖。
 * （直径 2cm 的小件：一圈 8 段；toon.ts 的 capsule 固定 16 × 6 段，一根 416 个三角面，十根手指就四千多）
 */
function finger(a: V3, b: V3, color: string, k: number) {
  const g = G(tube([a, b], 1, color, { seg: 1, radial: 8 }), ball(1, color, { x: b[0], y: b[1], z: b[2] }, undefined, [8, 4]))
  g.scale.z = k
  return g
}

/**
 * 一只手套：立在 xy 平面里，罗纹袖口顶边在 y = 0、手指朝下，大拇指在 sx 一侧。
 * t = 手掌厚；袖口厚 t + 0.2（挂起时要夹进夹子：袖口薄一点）。
 */
function glove(p: string[], sx: number, t: number) {
  const [main, cuff, band] = p
  const g = new THREE.Group()
  // 手指比手掌薄 0.1：埋在手掌里的那一截不会从掌面上冒出来
  const k = (t - 0.1) / 2
  g.add(rbox(9.4, 6, t + 0.2, cuff, { y: -6 }, 0.3))
  // 手掌：顶边伸进袖口 0.5
  g.add(rbox(8.6, 9.5, t, main, { y: -15 }, Math.min(1, t / 2 - 0.05)))
  // 手背上一道异色针织条（比手掌宽、厚一点）
  g.add(nub(8.9, 1.4, t + 0.25, band, { y: -10.2 }))
  // 四根手指：根部埋进手掌 0.6
  const fingers: [number, number][] = [[-3.15, 5], [-1.05, 6.5], [1.05, 7], [3.15, 6]]
  for (const [x, len] of fingers) g.add(finger([sx * x, -14.4, 0], [sx * x, -15.4 - len, 0], main, k))
  // 大拇指：斜着从手掌侧边伸出（根部一直埋到手掌里面，开口不露在外面）
  g.add(finger([sx * 3.2, -9.5, 0], [sx * 5.9, -14.45, 0], main, k))
  return g
}

function glovesLying(p: string[]) {
  const g = new THREE.Group()
  // 下面一只：转平（手指朝 +z），上面一只镜像（拇指在另一侧），错开一点压在上面
  const a = glove(p, 1, 1.2)
  a.rotation.x = -PI / 2
  a.position.y = 0.7
  const b = glove(p, -1, 1.2)
  b.rotation.x = -PI / 2
  const holder = G(b)
  holder.position.set(1.6, 2, 0.8)
  holder.rotation.y = 0.12
  g.add(a, holder)
  // 手指朝 +x
  g.rotation.y = PI / 2
  return fitGroup(G(g))
}

function glovesHanging(p: string[]) {
  const hw = 10
  return clipHang(hw, ...[-1, 1].map((sx) => P(glove(p, sx, 0.8), sx * clipX(hw), CLIP_Y + 0.3, 0)))
}

// ---------- 浴袍：叠好（青果领 + 腰带横在上面）/ 挂在厚肩木衣架上（青果领滚边 + 系好的腰带垂下两条带尾） ----------

const ROBE_PAL: Pal[] = [
  ['nordic', ['#f7f5f0', N.blue, N.gray]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['modern', [M.light, M.char, M.gray]],
  ['japanese', [J.ai, J.washi, J.washi]],
]
/** 浴袍 = 带腰带的长外套：青果领（lapel）、没有纽扣、两只口袋，点缀色给成主色（腰带结、衣襟里衬和衣身同色） */
const robeSpec = (p: string[]) => garment('coat', { main: p[0], sub: p[1], accent: p[0], collar: 'lapel', buttons: 0, belt: true, pockets: true, len: 108, width: 46, sleeve: 56, fit: 0.8, hem: 1.05, thick: 2.4, hanger: 'wood' })

function robeHanging(p: string[]) {
  const [main, pipe] = p
  const s = robeSpec(p)
  const h = buildGarment(s, 'hanging')
  const body = h.children[0]
  // 按 garments.ts buildTop 的版型算出领口、腰线的位置（衣身坐标，z = 0 居中）
  const sw = s.width
  const k = sw / 44
  const nw = Math.max(4, Math.min(8, sw * 0.16))
  const yN = NECK_Y - SLOPE * nw + 1.6
  const yS = NECK_Y - SLOPE * (sw / 2) + 1.6
  const arm = (17 + s.fit * 5) * Math.max(0.7, k)
  const yW = yS - arm - 14 * k
  const L = 22 * k + 6
  const front = s.thick / 2
  const belt = shade(main, -0.09)
  // 青果领的滚边：沿驳领外沿
  for (const sx of [-1, 1]) {
    // 滚边压在驳领片（garments.ts，正面凸出衣身 0.8）的外沿上，半埋在领片和衣身里
    const pts: V3[] = [[sx * (nw + 0.5), yN + 0.4, front + 0.4], [sx * (nw + 4.5), yN - 7, front + 0.4], [sx * 3.5, yN - L - 1, front + 0.4]]
    // 两头带圆帽：上端在肩颈处朝上，不封口的话从上面能看进管子里
    body.add(cappedTube(pts, 0.48, pipe, { seg: 12, radial: 6, capSeg: [6, 4] }))
  }
  // 腰带结垂下的两条带尾（顶端埋进腰带结；半厘米厚的布带，直角条）
  body.add(batten([-0.6, yW - 1, front + 0.75], [-2.6, yW - 24, front + 0.75], 3, 0.5, belt, 0))
  body.add(batten([0.8, yW - 1, front + 0.7], [2.2, yW - 19, front + 0.7], 3, 0.5, belt, 0))
  return h
}

function robeFolded(p: string[]) {
  const [main, pipe] = p
  const g = new THREE.Group()
  const belt = shade(main, -0.09)
  g.add(rbox(36, 5, 30, main, {}, 1.4))
  g.add(rbox(35, 4.6, 29, main, { y: 4.9 }, 1.4))
  const top = 9.5
  // 青果领：后沿一道粗滚边围成 U 形
  // （两头扎进衣服里：弯管两端不封口，停在后沿的话从后面能看进管子里）
  g.add(tube([[-9, top - 1.2, -13.6], [-7.2, top - 0.1, -9.8], [-3, top + 0.15, -6.5], [0, top + 0.15, -6], [3, top + 0.15, -6.5], [7.2, top - 0.1, -9.8], [9, top - 1.2, -13.6]], 0.9, pipe, { seg: 20, radial: 8 }))
  // 腰带横搭在上面
  g.add(rbox(36.4, 0.6, 3.2, belt, { y: top - 0.1, z: 7 }, 0.25))
  // 前沿下摆滚边 + 口袋
  g.add(rbox(36.2, 0.8, 0.8, pipe, { y: 1.6, z: 14.9 }, 0.3))
  g.add(rbox(9, 3.2, 0.6, belt, { x: -8, y: 5.6, z: 14.55 }, 0.25))
  return fitGroup(g)
}

// ---------- 防尘衣罩：套着一件西装的挂衣袋——不透明的背板和侧边、半透明的前片看得见里面的西装，前面一条拉链 ----------

const BAG_PAL: Pal[] = [
  ['modern', [M.char, '#2e3a52', M.silver]],
  ['nordic', [N.linen, N.gray, N.oak]],
  ['classic', ['#3b4a66', '#24252a', '#c8a96a']],
  ['japanese', [J.sumi, '#6e4b33', J.washi]],
]
function garmentBag(p: string[]) {
  const [bag, suit, trim] = p
  const h = buildGarment(garment('blazer', { main: suit, sub: suit, accent: SHIRT, hanger: 'wood' }), 'hanging')
  const b = box3(h.children[0])
  // 袋子：60 宽、底到 -110；进深包住西装前后各留 1cm 以上
  const hw = 31
  const yTop = -4
  const yBot = -110
  const zBack = b.min.z - 1
  const zFront = Math.max(b.max.z + 1.4, zBack + 6)
  const D = zFront - zBack
  const outline = (inset: number): V2[] => [
    [0, yTop - inset],
    [hw - 6 - inset * 0.4, -14 - inset],
    ...arcXY(hw - 4, -18, 4 - inset, PI / 2, 0, 4),
    ...arcXY(hw - 5, yBot + 5, 5 - inset, 0, -PI / 2, 5),
    ...arcXY(-hw + 5, yBot + 5, 5 - inset, -PI / 2, -PI, 5),
    ...arcXY(-hw + 4, -18, 4 - inset, PI, PI / 2, 4),
    [-hw + 6 + inset * 0.4, -14 - inset],
  ]
  // 侧边：一圈带洞的挤出体（外轮廓 − 往里收 0.8）
  const sh = new THREE.Shape(outline(0).map(([x, y]) => new THREE.Vector2(x, y)))
  sh.holes.push(new THREE.Path(outline(0.8).map(([x, y]) => new THREE.Vector2(x, y))))
  const ring = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 4 })
  h.add(P(mesh(ring, bag), 0, 0, zBack))
  // 背板（在侧边里面 0.2，不和侧边后沿齐平）
  h.add(flat(outline(0.4), 0.4, bag, zBack + 0.4))
  // 半透明前片 + 前面正中一条拉链和拉头
  h.add(ghost(flat(outline(0.4), 0.4, bag, zFront - 0.4), '#e9eef2', 0.3))
  h.add(nub(0.9, 84, 0.5, trim, { y: yBot + 6, z: zFront - 0.15 }))
  h.add(rbox(1.6, 3, 0.8, trim, { y: -24, z: zFront + 0.05 }, 0.3))
  // 底边的一条织带 + 挂钩口的包边
  h.add(rbox(hw * 2 - 4, 2.4, D + 0.4, trim, { y: yBot + 0.6, z: (zBack + zFront) / 2 }, 0.4))
  h.add(cyl(1.4, 1.4, 0.8, trim, { y: yTop - 0.9, z: (zBack + zFront) / 2 }, 12))
  return h
}

// ---------- 内裤：三条叠好的一摞（腰头朝后）/ 一条夹在夹子衣架上 ----------

const BRIEF_PAL: Pal[] = [
  ['nordic', [N.white, N.blue, N.gray, N.oak]],
  ['cute', [C.sakura, C.sky, C.mint, C.white]],
  ['modern', [M.char, M.gray, M.light, M.black]],
  ['retro', [R.cream, R.teal, R.mustard, R.red]],
]

function briefsStack(p: string[]) {
  const band = p[3]
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const y = i * 1.45
    const l = new THREE.Group()
    l.add(rbox(20, 1.5, 16, p[i], {}, 0.6))
    // 腰头：后沿一条，比布身高出一点
    l.add(rbox(20.4, 1.7, 2.4, band, { z: -6.9 }, 0.4))
    P(l, ((i * 37) % 3) * 0.4 - 0.4, y, ((i * 23) % 3) * 0.3 - 0.3, 0, (i - 1) * 0.05)
    g.add(l)
  }
  // 最上面一条的腰头正中一个小蝴蝶结
  g.add(ball(0.55, band, { x: 0, y: 2 * 1.45 + 1.75, z: -5.6 }, [1.6, 0.6, 1]))
  return fitGroup(g)
}

function briefsHanging(p: string[]) {
  const [main, , , band] = p
  const hw = 15
  const g = new THREE.Group()
  const right: V2[] = [[14, -8], [11, -13], [7.5, -18], [4.8, -22.5]]
  const body: V2[] = [[-14, 0], [14, 0], ...right, [4.5, -24], [-4.5, -24], ...right.slice().reverse().map(([x, y]): V2 => [-x, y])]
  g.add(flat(body, 0.5, main))
  // 腰头（顶边高出布身 0.2）+ 两侧裤脚包边 + 小蝴蝶结
  g.add(flat(rect(-14.3, -2.8, 14.3, 0.2), 0.9, band))
  // （包边比布身厚，两头露在外面：带圆帽）
  for (const s of [-1, 1]) g.add(cappedTube([[s * 14, -7.6, 0], [s * 11, -13, 0], [s * 7.5, -18, 0], [s * 4.7, -22.6, 0], [s * 4.5, -23.7, 0]], 0.33, band, { seg: 12, radial: 6, capSeg: [6, 4] }))
  g.add(ball(0.6, band, { y: -4.2, z: 0.45 }, [1.6, 1, 0.7]))
  return clipHang(hw, P(g, 0, CLIP_Y, 0))
}

// ---------- 打底裤：叠成一块（宽松紧腰头朝后）/ 对折搭在裤架横杆上 ----------

const LEG_PAL: Pal[] = [
  ['modern', [M.char, M.black, M.silver]],
  ['nordic', [N.gray, N.white, N.oak]],
  ['cute', [C.lilac, C.white, C.pink]],
  ['industrial', ['#5d6b4a', I.iron, I.concrete]],
]

function leggingsFolded(p: string[]) {
  const [main, band, acc] = p
  const g = new THREE.Group()
  g.add(rbox(25, 2, 20, main, {}, 0.8))
  g.add(rbox(24.4, 1.9, 19.4, main, { y: 1.95 }, 0.8))
  // 宽腰头横在上面靠后沿，前面露出一道裤脚
  g.add(rbox(24.8, 0.5, 5, band, { y: 3.8, z: -6.8 }, 0.2))
  g.add(box(2.4, 0.3, 1.2, acc, { x: 8, y: 4.25, z: -6.8 }))
  g.add(rbox(25.2, 0.6, 0.6, band, { y: 0.8, z: 9.85 }, 0.2))
  return fitGroup(g)
}

function leggingsHanging(p: string[]) {
  const [main, band, acc] = p
  const hw = 15
  const h = buildHanger('bar', 'wood', '#c99a66', { hw })
  const body = h.children[0]
  // 裤架横杆：y = 肩条末端再往下 1，半径 0.45
  const barY = NECK_Y - SLOPE * hw - 1
  const T = 0.6
  const r = 0.45 + T / 2 + 0.1
  const w = 12
  // 搭在杆上的弧顶（轴沿 x、鼓面朝上），前后两片从它的两条边垂下来（顶边伸进弧顶 0.05）
  const cap = mesh(new THREE.CylinderGeometry(r + T / 2, r + T / 2, w, 8, 1, false, 0, PI).rotateZ(PI / 2), main)
  body.add(P(cap, 0, barY, 0))
  const yt = barY + 0.05
  // 前片：腰那一头，往下变宽，末端是宽腰头
  body.add(flat([[-w / 2, yt], [w / 2, yt], [8, yt - 44], [-8, yt - 44]], T, main, r))
  body.add(flat(rect(-8.3, yt - 44.2, 8.3, yt - 39.5), T + 0.3, band, r))
  body.add(box(2.4, 1.2, 0.3, acc, { x: 5, y: yt - 42.4, z: r + T / 2 + 0.2 }))
  // 后片：裤脚那一头，往下收窄
  body.add(flat([[-w / 2, yt], [w / 2, yt], [3.6, yt - 40], [-3.6, yt - 40]], T, main, -r))
  return h
}

// ---------- 针织耳罩：一道头箍弯成拱形，两头各一只针织耳罩，耳罩外圈一圈绒毛边，平放时立在两只耳罩上 ----------

const MUFF_PAL: Pal[] = [
  ['cute', [C.sakura, C.white, C.red]],
  ['nordic', [N.linen, N.white, N.oak]],
  ['retro', [R.red, R.cream, R.mustard]],
  ['modern', [M.gray, M.light, M.char]],
]
function earmuffs(p: string[]) {
  const [knit, fur, acc] = p
  const g = new THREE.Group()
  const R0 = 6.4
  const yc = 4
  // 头箍：半圆弧，两端埋进耳罩
  const band: V3[] = arcXY(0, yc, R0, 0, PI, 16).map(([x, y]): V3 => [x, y, 0])
  g.add(tube(band, 0.8, knit, { seg: 20, radial: 8 }))
  // 头箍上的几道针织罗纹（圆环垂直于弧线）
  for (const a of [0.55, 1.05, 1.57, 2.09, 2.59]) {
    const ring = G(torus(0.8, 0.18, shade(knit, -0.1), { rx: PI / 2 }, PI * 2, [5, 10]))
    ring.position.set(Math.cos(a) * R0, yc + Math.sin(a) * R0, 0)
    ring.rotation.z = a + PI
    g.add(ring)
  }
  for (const s of [-1, 1]) {
    g.add(ball(4, knit, { x: s * R0, y: yc }, [0.6, 1, 1]))
    // 绒毛边：绕耳罩最宽处一圈
    g.add(torus(3.7, 0.75, fur, { x: s * R0, y: yc, ry: PI / 2 }, PI * 2, [6, 24]))
  }
  // 头箍顶上系一只小蝴蝶结（原先耳罩外侧正中各一颗小绒球，配上粉 / 肤色耳罩一看就像乳头，改放到头顶）
  const top = yc + R0 + 0.8
  for (const s of [-1, 1]) g.add(P(ball(1.5, acc, {}, [1, 0.6, 0.45], [8, 6]), s * 1.5, top + 0.1, 0, 0, 0, s * -0.35))
  g.add(ball(0.75, shade(acc, -0.1), { y: top + 0.1 }, [1, 1, 0.8], [8, 6]))
  return fitGroup(g)
}

// ---------- 定义 ----------

const CLOTH: Partial<AssetDef> = { type: 'clothing', ...LIMIT, prop: true }
const DRY: NonNullable<AssetDef['tags']> = ['clothing', 'decor', 'line-dry']

export const GARMENTS_MORE: AssetDef[] = [
  define('gx-socks-rolled', '袜子', 'deco', [10, 9, 6], SOCK_PAL, sockBall, { ...CLOTH, series: 'gx-socks', form: 'folded', formLabel: '卷好', tags: [...DRY, 'multi-ok'], mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-socks-hanging', '袜子', 'deco', [38, 3, 28], SOCK_PAL, socksHanging, { ...CLOTH, series: 'gx-socks', form: 'hanging', tags: [...DRY, 'multi-ok'], mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-bra-lying', '文胸', 'deco', [32, 13, 5], BRA_PAL, braLying, { ...CLOTH, series: 'gx-bra', form: 'lying', tags: DRY, mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-bra-hanging', '文胸', 'deco', [31, 7, 28], BRA_PAL, braHanging, { ...CLOTH, series: 'gx-bra', form: 'hanging', tags: DRY, mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-pajamas-folded', '睡衣套装', 'deco', [30.4, 34, 8], PJ_PAL, pajamasFolded, { ...CLOTH, series: 'gx-pajamas', form: 'folded', tags: [...DRY, 'bed-ok'], mats: ['fabric', 'fabric', 'plastic'] }),
  define('gx-pajamas-hanging', '睡衣套装', 'deco', [60, 4, 75], PJ_PAL, pajamasHanging, { ...CLOTH, series: 'gx-pajamas', form: 'hanging', formLabel: '挂起的上衣', tags: DRY, mats: ['fabric', 'fabric', 'plastic'] }),
  define('gx-belt-coiled', '皮带', 'deco', [10, 9, 5], BELT_PAL, beltCoil, { ...CLOTH, series: 'gx-belt', form: 'folded', formLabel: '卷起', tags: ['clothing', 'decor'], mats: ['leather', 'metal', 'leather'] }),
  define('gx-belt-hanging', '皮带', 'deco', [6, 5.5, 110], BELT_PAL, beltHanging, { ...CLOTH, series: 'gx-belt', form: 'hanging', tags: ['clothing', 'decor'], mats: ['leather', 'metal', 'leather'] }),
  define('gx-gloves-lying', '毛线手套', 'deco', [24.2, 13, 3], GLOVE_PAL, glovesLying, { ...CLOTH, series: 'gx-gloves', form: 'lying', tags: DRY, mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-gloves-hanging', '毛线手套', 'deco', [26, 3, 32.1], GLOVE_PAL, glovesHanging, { ...CLOTH, series: 'gx-gloves', form: 'hanging', tags: DRY, mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-robe-folded', '浴袍', 'deco', [36.4, 30.3, 10.6], ROBE_PAL, robeFolded, { ...CLOTH, series: 'gx-robe', form: 'folded', tags: [...DRY, 'bed-ok', 'wet-supply'], mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-robe-hanging', '浴袍', 'deco', [60.5, 6, 115], ROBE_PAL, robeHanging, { ...CLOTH, series: 'gx-robe', form: 'hanging', tags: [...DRY, 'wet-supply'], mats: ['fabric', 'fabric', 'fabric'] }),
  define('gx-garment-bag', '防尘衣罩', 'deco', [62, 7, 110], BAG_PAL, garmentBag, { ...CLOTH, form: 'hanging', tags: ['clothing', 'decor'], mats: ['fabric', 'fabric', 'plastic'] }),
  define('gx-briefs-stack', '内裤', 'deco', [21.6, 17.4, 5], BRIEF_PAL, briefsStack, { ...CLOTH, series: 'gx-briefs', form: 'stacked', formLabel: '叠好三条', tags: DRY, mats: ['fabric', 'fabric', 'fabric', 'fabric'] }),
  define('gx-briefs-hanging', '内裤', 'deco', [29, 3, 33], BRIEF_PAL, briefsHanging, { ...CLOTH, series: 'gx-briefs', form: 'hanging', tags: DRY, mats: ['fabric', 'fabric', 'fabric', 'fabric'] }),
  define('gx-leggings-folded', '打底裤', 'deco', [25.2, 20.2, 4.6], LEG_PAL, leggingsFolded, { ...CLOTH, series: 'gx-leggings', form: 'folded', tags: DRY, mats: ['fabric', 'fabric', 'plastic'] }),
  define('gx-leggings-hanging', '打底裤', 'deco', [30.5, 4, 57], LEG_PAL, leggingsHanging, { ...CLOTH, series: 'gx-leggings', form: 'hanging', formLabel: '搭在衣架横杆上', tags: DRY, mats: ['fabric', 'fabric', 'plastic'] }),
  define('gx-earmuffs', '针织耳罩', 'deco', [18, 9, 13], MUFF_PAL, earmuffs, { ...CLOTH, form: 'lying', tags: ['clothing', 'decor'], mats: ['fabric', 'pile', 'fabric'] }),
]
