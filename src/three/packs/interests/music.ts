// 兴趣素材包的乐器建模（钢琴、吉他、鼓、管乐等）
// 只放建模函数和它们用到的常量，素材表在 ../interests.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../../toon'
import { paintPanel } from '../../kit'
import { G, P, PI, cylX, cylZ, fitGroup, litOutlined, noOutline, rod3, taperRod3, type V2, type V3 } from '../../geo'
import { N } from '../../packkit'
import { DARK, GOLD, IVORY, METAL, PAPER, RUBBER, drawFretboard, drawKeys, drawScore, flat, paintTop, sym, taperPath } from './common'

// =====================================================================
// 乐器
// =====================================================================

/** 立式钢琴 150×62×125：[琴身, 白键, 金属] */
export function uprightPiano(p: string[]) {
  const [body, white, metal] = p
  const g = new THREE.Group()
  g.add(rbox(146, 122.5, 34, body, { z: -14 }, 1.2))
  g.add(rbox(150, 2.5, 35.5, body, { y: 122.5, z: -13.25 }, 0.8))
  g.add(rbox(120, 45, 0.6, shade(body, 0.05), { y: 12, z: 3.2 }, 0.3))
  // 键盘
  g.add(rbox(134, 8, 22, shade(body, -0.04), { y: 62, z: 13 }, 0.8))
  g.add(rbox(128, 1.6, 15, white, { y: 70, z: 16 }, 0.3))
  g.add(paintTop(127.4, 14.4, `int-keys52-${white}`, drawKeys(52, white, '#26262a', 5, 0.62), 0, 71.9, 16))
  g.add(rbox(128, 5, 2, body, { y: 71.6, z: 7.5 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(6, 14, 22, body, { x: s * 67, y: 62, z: 13 }, 1))
    g.add(rbox(5, 62, 5, body, { x: s * 67, z: 21 }, 1))
    g.add(rbox(7, 4, 30, body, { x: s * 67, z: 16 }, 1))
  }
  // 谱架 + 乐谱
  g.add(rbox(100, 2, 5, body, { y: 84, z: 5.5 }, 0.5))
  g.add(paintPanel(42, 28, `int-score-${PAPER}`, drawScore(PAPER, '#333', 3), { y: 86, z: 3.4 }))
  // 踏板
  g.add(rbox(30, 6, 4, shade(body, -0.06), { y: 0, z: 5 }, 0.8))
  for (const x of [-6, 0, 6]) g.add(rbox(2.2, 1.2, 7, metal, { x, y: 2.5, z: 9.5 }, 0.4))
  return g
}

/** 三角钢琴：琴盖撑开 [琴身, 白键, 金属] */
export function grandPiano(p: string[]) {
  const [body, white, metal] = p
  const g = new THREE.Group()
  // 俯视轮廓（左侧直边，右侧 S 形曲线），z 从 -82（尾）到 60（键盘端）
  const curve = new THREE.CatmullRomCurve3(
    ([[75, 60], [75, 36], [66, 14], [48, -8], [30, -36], [14, -64], [-8, -80], [-34, -82], [-58, -78], [-75, -62]] as V2[]).map(([x, z]) => new THREE.Vector3(x, z, 0)),
    false,
    'centripetal',
  )
  const outline: V2[] = [[-75, 60], ...curve.getPoints(40).map((v): V2 => [v.x, v.y])]
  // 用 flat 挤出（xy 平面），再放平：x→x，y→-z
  const lay = (m: THREE.Mesh, y: number) => P(m, 0, y, 0, PI / 2)
  const caseM = lay(flat(outline.map(([x, z]): V2 => [x, z]), 34, body, false, 0.8), 75)
  g.add(caseM)
  // 琴盖：以左侧直边为轴撑开
  const lidAng = 0.45
  const lid = lay(flat(outline.map(([x, z]): V2 => [x + 75, z]), 2, shade(body, 0.04), false, 0.4), 1)
  g.add(P(G(lid), -75, 92, 0, 0, 0, lidAng))
  // 内部音板（金色铁骨）
  const inner = lay(flat(outline.map(([x, z]): V2 => [x * 0.9 + 1, z * 0.9 - 2]), 1, metal, false, 0.3), 90.6)
  g.add(inner)
  // 琴盖撑杆
  const sx = 40
  const lx = (sx + 75) / Math.cos(lidAng)
  g.add(rod3([sx, 91, -6], [sx, 92 + lx * Math.sin(lidAng) - 0.5, -6], 0.8, body))
  // 键盘
  g.add(rbox(134, 6, 22, shade(body, -0.04), { y: 62, z: 71 }, 0.8))
  g.add(rbox(128, 1.6, 15, white, { y: 68, z: 73.5 }, 0.3))
  g.add(paintTop(127.4, 14.4, `int-keys52-${white}`, drawKeys(52, white, '#26262a', 5, 0.62), 0, 69.9, 73.5))
  g.add(rbox(128, 6, 2, body, { y: 69.6, z: 65 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(6, 12, 22, body, { x: s * 67, y: 62, z: 71 }, 1))
  // 谱架
  g.add(rbox(76, 2, 6, body, { y: 92, z: 50 }, 0.5))
  const desk = G(rbox(72, 22, 1.4, body, {}, 0.4), paintPanel(40, 16, `int-score-${PAPER}`, drawScore(PAPER, '#333', 5), { y: 4, z: 0.9 }))
  g.add(P(desk, 0, 93.5, 50, -0.22))
  // 腿 + 踏板
  for (const [x, z] of [[-64, 46], [60, 40], [-38, -66]] as V2[]) {
    g.add(cyl(4.5, 3.5, 54, body, { x, y: 4, z }, 16))
    g.add(ball(3, metal, { x, y: 3, z }))
  }
  g.add(rbox(14, 48, 4, body, { y: 10, z: 56 }, 1))
  g.add(rbox(22, 4, 9, body, { y: 6, z: 58.5 }, 1))
  for (const x of [-6, 0, 6]) g.add(rbox(2.2, 1.2, 6, metal, { x, y: 7.5, z: 65 }, 0.4))
  return g
}

/** 电钢琴 + 琴凳：[琴身, 白键, 琴凳垫] */
export function digitalPiano(p: string[]) {
  const [body, white, seat] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(4, 72, 33, body, { x: s * 66, z: -22.5 }, 0.8))
    g.add(rbox(6, 8, 18, body, { x: s * 65, y: 78, z: -14 }, 0.8))
  }
  g.add(rbox(128, 30, 1.5, body, { y: 30, z: -38 }, 0.4))
  g.add(rbox(136, 6, 35, body, { y: 72, z: -22.5 }, 0.8))
  g.add(rbox(124, 14, 17, body, { y: 78, z: -31.5 }, 0.8))
  g.add(rbox(124, 1.6, 15, white, { y: 78, z: -15.5 }, 0.3))
  g.add(paintTop(123.4, 14.4, `int-keys52-${white}`, drawKeys(52, white, '#26262a', 5, 0.62), 0, 79.9, -15.5))
  g.add(litOutlined(rbox(8, 0.4, 3, '#9fe0c8', { x: -40, y: 92, z: -27 }, 0.15), '#9fe0c8'))
  g.add(rbox(70, 3, 2, body, { y: 92, z: -36 }, 0.4))
  g.add(rbox(30, 3, 8, shade(body, -0.1), { z: -30 }, 0.6))
  // 琴凳
  const bench = shade(body, 0.02)
  // 座面高约 48（腿 39 + 框 4 + 垫 5）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, 39, 3, bench, { x: sx * 26, z: 25 + sz * 11 }, 0.6))
  g.add(rbox(60, 4, 30, bench, { y: 39, z: 25 }, 0.8))
  g.add(rbox(56, 5, 26, seat, { y: 43, z: 25 }, 2))
  return g
}

/** 一面鼓：轴沿 y，给底面中心 */
function drum(r: number, h: number, shellC: string, head: string, hoop: string) {
  const g = new THREE.Group()
  g.add(cyl(r, r, h, shellC, {}, 28))
  // 鼓皮比鼓圈顶略低（鼓圈顶在 h + 0.3），不和鼓圈顶共面
  g.add(cyl(r * 0.97, r * 0.97, 0.3, head, { y: h - 0.15 }, 28))
  g.add(torus(r, 0.5, hoop, { y: h - 0.2, rx: PI / 2 }))
  g.add(torus(r, 0.5, hoop, { y: 0.2, rx: PI / 2 }))
  return g
}

/** 镲片：给中心 */
function cymbal(r: number, color: string, x: number, y: number, z: number, tilt = 0) {
  const m = cyl(1.2, r, 1.4, color, {}, 28)
  return P(G(m, cyl(1.6, 2, 0.8, color, { y: 1.2 }, 12)), x, y, z, tilt)
}

/** 架子鼓：[鼓身, 鼓皮, 金属] */
export function drumKit(p: string[]) {
  const [shellC, head, metal] = p
  const g = new THREE.Group()
  // 底鼓（轴朝前）
  const kick = drum(28, 40, shellC, head, metal)
  g.add(P(kick, 0, 30, 15, PI / 2))
  g.add(litOutlined(cylZ(9, 0.4, shade(shellC, 0.25), 0, 30, 55.4, 20), shade(shellC, 0.25), 0.1))
  for (const s of [-1, 1]) g.add(rod3([s * 20, 12, 30], [s * 32, 0.6, 38], 0.8, metal))
  // 嗵鼓
  for (const s of [-1, 1]) g.add(P(drum(10, 16, shellC, head, metal), s * 13, 62, 26, -0.45, 0, -s * 0.15))
  g.add(rod3([0, 57, 28], [0, 65, 24], 1, metal))
  // 落地嗵
  g.add(drum(16, 40, shellC, head, metal).translateX(46).translateY(16).translateZ(-16))
  for (const a of [0.3, 2.4, 4.4]) g.add(rod3([46 + Math.cos(a) * 17, 30, -16 + Math.sin(a) * 17], [46 + Math.cos(a) * 21, 0.6, -16 + Math.sin(a) * 21], 0.6, metal))
  // 军鼓 + 架
  g.add(drum(17, 13, shellC, head, metal).translateX(-28).translateY(52).translateZ(-22))
  for (const a of [0.6, 2.7, 4.8]) g.add(rod3([-28, 52, -22], [-28 + Math.cos(a) * 18, 0.6, -22 + Math.sin(a) * 18], 0.6, metal))
  // 踩镲
  g.add(rod3([-60, 0, -14], [-60, 96, -14], 0.8, metal))
  for (const a of [0.9, 3, 5.1]) g.add(rod3([-60, 30, -14], [-60 + Math.cos(a) * 14, 0.6, -14 + Math.sin(a) * 14], 0.6, metal))
  g.add(cymbal(17, GOLD, -60, 88, -14), cymbal(17, GOLD, -60, 90.2, -14))
  // 吊镲 / 叮叮镲
  g.add(rod3([-50, 0, 24], [-50, 112, 24], 0.8, metal))
  for (const a of [1, 3.1, 5.2]) g.add(rod3([-50, 30, 24], [-50 + Math.cos(a) * 14, 0.6, 24 + Math.sin(a) * 14], 0.6, metal))
  g.add(cymbal(19, GOLD, -50, 112, 24, 0.25))
  g.add(rod3([56, 0, 18], [56, 100, 18], 0.8, metal))
  for (const a of [0.2, 2.3, 4.4]) g.add(rod3([56, 30, 18], [56 + Math.cos(a) * 14, 0.6, 18 + Math.sin(a) * 14], 0.6, metal))
  g.add(cymbal(22, GOLD, 56, 100, 18, -0.2))
  // 鼓凳 + 踏板 + 鼓棒
  g.add(cyl(1.5, 1.5, 44, metal, { z: -50 }))
  for (const a of [0.5, 2.6, 4.7]) g.add(rod3([0, 18, -50], [Math.cos(a) * 16, 0.6, -50 + Math.sin(a) * 16], 0.7, metal))
  g.add(puck(17, 6, DARK, { y: 44, z: -50 }))
  g.add(rbox(8, 2, 22, metal, { z: -6 }, 0.5))
  // 鼓棒：交叉搁在鼓凳座面上
  g.add(rod3([-7, 50.5, -45], [7, 50.5, -55], 0.5, '#e8c89a'), rod3([-7, 51.4, -54], [7, 51.4, -46], 0.5, '#e8c89a'))
  return g
}

/** 电子鼓：[架子, 鼓垫, 点缀] */
export function eDrum(p: string[]) {
  const [rack, pad, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rod3([s * 50, 0, -5], [s * 50, 96, -5], 1.6, rack))
    g.add(rod3([s * 50, 0.8, -26], [s * 50, 0.8, 16], 1.2, rack))
    g.add(rod3([s * 50, 72, -5], [s * 36, 72, 24], 1.2, rack))
  }
  g.add(rod3([-50, 72, -5], [50, 72, -5], 1.4, rack))
  const padAt = (r: number, x: number, y: number, z: number, tilt = 0.25) => {
    const m = G(puck(r, 3, RUBBER), cyl(r * 0.88, r * 0.88, 0.4, pad, { y: 2.9 }, 24))
    return P(m, x, y, z, tilt)
  }
  g.add(padAt(12, -22, 70, 14), padAt(10, 2, 76, 8), padAt(10, 22, 76, 8), padAt(13, 36, 66, 22))
  g.add(rod3([-22, 72, 8], [-22, 72, -4], 0.8, rack))
  for (const x of [2, 22]) g.add(rod3([x, 72, -5], [x, 76.5, 7], 0.8, rack))
  // 底鼓塔
  g.add(rbox(18, 34, 14, rack, { y: 0, z: 18 }, 1.5))
  g.add(cylZ(7, 1.6, pad, 0, 20, 25.4, 20))
  // 镲垫
  const cym = (r: number, x: number, y: number, z: number) => P(G(cyl(1.5, r, 1.2, RUBBER, {}, 24), torus(r - 1, 0.3, acc, { y: 0.9, rx: PI / 2 })), x, y, z, 0.2)
  g.add(rod3([-50, 96, -5], [-42, 108, 4], 0.8, rack), cym(16, -42, 108, 4))
  g.add(rod3([50, 96, -5], [44, 112, 2], 0.8, rack), cym(16, 44, 112, 2))
  g.add(rod3([-50, 80, -5], [-38, 88, 20], 0.8, rack), cym(12, -38, 88, 20))
  // 音源
  g.add(rbox(18, 13, 4, DARK, { x: 50, y: 80, z: -2 }, 1))
  g.add(litOutlined(rbox(10, 4, 0.4, '#8fe3ff', { x: 50, y: 86, z: 0.1 }, 0.15), '#8fe3ff'))
  g.add(cylZ(1.3, 1, acc, 46, 82, 0.5, 20), cylZ(1.3, 1, acc, 54, 82, 0.5, 20))
  // 凳
  g.add(cyl(1.4, 1.4, 44, rack, { z: -46 }))
  for (const a of [0.5, 2.6, 4.7]) g.add(rod3([0, 18, -46], [Math.cos(a) * 15, 0.6, -46 + Math.sin(a) * 15], 0.7, rack))
  g.add(puck(16, 6, DARK, { y: 44, z: -46 }))
  return g
}

/** 提琴类轮廓 */
function bowedOutline(L: number, lower: number, upper: number, waist: number): V2[] {
  const a = lower / 2
  const b = upper / 2
  const c = waist / 2
  return sym([[0, 0], [a * 0.72, L * 0.02], [a * 0.98, L * 0.15], [a, L * 0.27], [a * 0.84, L * 0.41], [c, L * 0.5], [c * 1.04, L * 0.57], [b * 0.9, L * 0.68], [b, L * 0.78], [b * 0.8, L * 0.93], [0, L]])
}

/** 小提琴：沿 y 立着（底部 y = 0），正面 +z，背面 z = -1.6。[木色, 黑件] */
function violin(wood: string, dark: string) {
  const g = new THREE.Group()
  const ol = bowedOutline(35.5, 20.5, 16.5, 11)
  g.add(flat(ol, 3.2, shade(wood, -0.08), true, 0.6))
  g.add(P(flat(ol.map(([x, y]): V2 => [x * 0.9, y * 0.94 + 1]), 1.2, wood, true, 0.5), 0, 0, 1.6))
  g.add(rbox(2.4, 13, 2.8, shade(wood, -0.05), { y: 35, z: 0.8 }, 0.6))
  g.add(rbox(2.2, 8, 2.4, shade(wood, -0.05), { y: 48, z: 0.4 }, 0.6))
  g.add(ball(1.6, shade(wood, -0.05), { y: 57, z: 0.4 }, [0.8, 1, 1.1]))
  for (const y of [50, 53]) g.add(cylX(0.35, 6, dark, 0, y, 0.4, 8))
  g.add(rbox(2.6, 27, 0.7, dark, { y: 22, z: 2.6 }, 0.3))
  g.add(rbox(3.2, 10, 0.7, dark, { y: 2.5, z: 2.7 }, 0.3))
  g.add(rbox(4.2, 0.5, 2, '#f0d9b0', { y: 13.2, z: 3.2 }, 0.2))
  for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(noOutline(taperRod3([x * 1.2, 12, 3.2], [x * 0.6, 48.5, 3.05], 0.05, 0.05, '#e8e8e8', 4)))
  for (const s of [-1, 1]) g.add(noOutline(P(rbox(0.5, 5, 0.3, '#3a2a20', {}, 0.15), s * 4.2, 11.5, 2.2, 0, 0, s * 0.15)))
  g.add(puck(2.6, 1, dark, { x: -5, y: 1.2, z: 2.2 }))
  return g
}

/** 琴弓：沿 x，给中心，弓杆在上 */
function bowStick(len: number, x: number, y: number, z: number, stickC: string) {
  return G(
    cylX(0.35, len, stickC, x, y + 1.2, z, 8),
    noOutline(rbox(len * 0.92, 0.15, 0.8, '#f6f2e8', { x, y, z }, 0.05)),
    rbox(4, 2, 1.2, DARK, { x: x - len / 2 + 4, y: y - 0.2, z }, 0.3),
  )
}

/** 小提琴（打开的琴盒）：[琴盒, 内衬, 琴木色] */
export function violinCase(p: string[]) {
  const [shellC, lining, wood] = p
  const g = new THREE.Group()
  g.add(tray(78, 8, 24, 1.2, shellC, { z: 2 }))
  g.add(rbox(75.4, 1.5, 21.4, lining, { y: 1.2, z: 2 }, 0.5))
  const v = P(G(violin(wood, DARK)), 0, 4.3, 0, -PI / 2)
  g.add(P(G(v), 29.3, 0, 2, 0, PI / 2))
  g.add(rbox(12, 3, 8, shade(lining, -0.1), { x: -33, y: 2.7, z: 2 }, 1))
  // 立起的盒盖
  const lid = G(rbox(78, 24, 4, shellC, { z: -2 }, 1.2), rbox(75, 21.6, 0.6, lining, { y: 1.2, z: 0.3 }, 0.3), bowStick(70, 0, 12, 1.2, '#7a4a2a'))
  g.add(P(lid, 0, 8, -10, -0.18))
  g.add(rbox(10, 1.4, 1.6, DARK, { y: 4, z: 14.6 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2.4, 2, 0.8, METAL, { x: s * 20, y: 5.5, z: 14.3 }, 0.3))
  return g
}

/** 小提琴（支架）：[支架, 琴木色, 黑件] */
export function violinStand(p: string[]) {
  const [stand, wood, dark] = p
  const g = new THREE.Group()
  const t = 0.16
  g.add(P(G(violin(wood, dark)), 0, 8, 3, -t))
  for (const a of [PI / 2, PI / 2 + 2.1, PI / 2 - 2.1]) g.add(rod3([0, 8, -2], [Math.cos(a) * 13, 0.6, -2 - Math.sin(a) * 13], 0.6, stand))
  g.add(rod3([-6, 7.4, 3], [6, 7.4, 3], 0.7, stand))
  for (const s of [-1, 1]) g.add(rod3([s * 6, 7.4, 3], [s * 6, 9.5, 5], 0.5, stand))
  g.add(rod3([0, 8, -2], [0, 46, -8], 0.6, stand))
  g.add(rod3([-2.5, 46, -8], [2.5, 46, -8], 0.5, stand))
  for (const s of [-1, 1]) g.add(rod3([s * 2.5, 46, -8], [s * 2.5, 46, -2.5], 0.45, stand))
  return g
}

/** 大提琴（支架）：[琴木色, 支架, 黑件] */
export function celloStand(p: string[]) {
  const [wood, stand, dark] = p
  const g = new THREE.Group()
  const t = 0.18
  const k = 2.1
  const vc = violin(wood, dark)
  vc.scale.setScalar(k)
  const body = G(vc, cyl(0.5, 0.5, 12, METAL, { y: -12 }, 8))
  g.add(P(body, 0, 12, 8, -t))
  g.add(puck(3, 1.2, RUBBER, { y: 0, z: 8 }))
  // 底座托架 + 后撑杆
  g.add(rbox(50, 2.5, 30, stand, { y: 0, z: -2 }, 1))
  for (const s of [-1, 1]) g.add(rod3([s * 22, 2.5, 2], [s * 20, 22, 6], 1, stand))
  g.add(rod3([0, 2.5, -14], [0, 92, -14], 1.2, stand))
  g.add(rod3([-4, 92, -14], [4, 92, -14], 0.8, stand))
  for (const s of [-1, 1]) g.add(rod3([s * 4, 92, -14], [s * 4, 92, -10], 0.6, stand))
  return g
}

/** 电吉他 / 电贝斯：沿 y 立着，背面 z = -2.2。[琴身, 护板, 指板木, 金属] */
function eGuitar(bodyC: string, guard: string, neckC: string, metal: string, bass = false) {
  const g = new THREE.Group()
  const k = bass ? 1.08 : 1
  const pts: V2[] = ([[0, 0], [9, 1], [15, 5], [16, 12], [13.5, 20], [12.5, 25], [14, 32], [15.5, 39], [14, bass ? 50 : 45], [11.5, bass ? 51 : 46], [9.5, 41], [6, 36.5], [-4, 36.5], [-7.5, 39], [-10.5, bass ? 45 : 42], [-12.5, bass ? 44 : 40.5], [-12.5, 33], [-11.5, 26], [-13.5, 20], [-16, 12], [-15, 5], [-9, 1]] as V2[]).map(([x, y]) => [x * k, y * k])
  g.add(flat(pts, 4.4, bodyC, true, 0.8))
  g.add(P(flat(pts.map(([x, y]): V2 => [x * 0.72 - 1, y * 0.8 + 4]), 0.3, guard, true, 0.1), 0, 0, 2.35))
  const top = bass ? 96 : 82
  const n0 = 34 * k
  const nw = bass ? 4.6 : 5
  g.add(rbox(nw, top - n0, 2.2, neckC, { y: n0, z: 0.4 }, 0.6))
  g.add(paintPanel(nw - 0.2, top - n0 - 1, `int-fret-${neckC}-${bass}`, drawFretboard(shade(neckC, -0.25), '#c9c9c9', bass ? 20 : 22), { y: n0 + 1, z: 1.55 }))
  // 琴头
  const head = flat(bass ? [[-3, 0], [3, 0], [5, 6], [6, 20], [3, 23], [0, 22], [-3, 14]] : [[-3, 0], [3, 0], [4.5, 5], [5, 17], [2.5, 19], [-1, 17], [-3.5, 10]], 1.6, neckC, true, 0.4)
  g.add(P(head, 0, top - 0.5, 0))
  const nTun = bass ? 4 : 6
  for (let i = 0; i < nTun; i++) {
    const y = top + 3 + i * (bass ? 4.6 : 2.4)
    g.add(cylZ(0.6, 1.6, metal, 3.2 - i * 0.15, y, -1.4, 8))
  }
  // 拾音器、琴桥、旋钮
  const pick = bass ? [18, 26] : [12, 19, 26]
  for (const y of pick) g.add(rbox(8, 2, 0.6, DARK, { y: y * k, z: 2.5 }, 0.3))
  g.add(rbox(8, 3, 0.7, metal, { y: 7 * k, z: 2.5 }, 0.3))
  for (const [x, y] of [[8, 8], [10, 12], [11.5, 16]] as V2[]) g.add(cylZ(0.9, 1, DARK, x * k, y * k, 2.9, 12))
  for (let i = 0; i < nTun; i++) {
    const x = (i - (nTun - 1) / 2) * (bass ? 1.1 : 0.8)
    g.add(noOutline(taperRod3([x * 1.1, 8 * k, 3.1], [x * 0.7, top, 1.9], 0.05, 0.05, '#e8e8e8', 4)))
  }
  return { g, top: top + (bass ? 23 : 19) }
}

/** 吉他支架（A 字），琴往后仰 t。返回琴的放置参数 */
function guitarOnStand(inst: THREE.Group, top: number, stand: string) {
  const g = new THREE.Group()
  const t = 0.24
  const yb = 12
  const zb = 6
  g.add(P(G(inst), 0, yb, zb, -t))
  // 琴颈靠点（沿琴身 L 处的背面）
  const L = top * 0.66
  const ny = yb + L * Math.cos(t) - 2.2 * Math.sin(t)
  const nz = zb - L * Math.sin(t) - 2.2 * Math.cos(t)
  // 前脚托
  g.add(rod3([-12, yb - 1.4, zb + 2], [12, yb - 1.4, zb + 2], 1, RUBBER))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 12, yb - 1.4, zb + 2], [s * 16, 0.8, zb + 8], 0.9, stand))
    g.add(rod3([s * 12, yb - 1.4, zb + 2], [s * 4, ny - 2, nz - 1.2], 0.9, stand))
    g.add(rod3([s * 12, yb - 1.4, zb + 4.2], [s * 12, yb + 1.5, zb + 4.2], 0.8, RUBBER))
  }
  g.add(rod3([0, ny - 2, nz - 1.2], [0, 0.8, nz - 16], 0.9, stand))
  // 颈托
  g.add(rod3([-3.5, ny - 2, nz - 1.2], [3.5, ny - 2, nz - 1.2], 0.9, RUBBER))
  return g
}

/** 电吉他（支架）：[琴身, 护板, 琴颈木] */
export const eGuitarStand = (bass: boolean) => (p: string[]) => {
  const { g, top } = eGuitar(p[0], p[1], p[2], METAL, bass)
  return guitarOnStand(g, top, DARK)
}

export const E_GUITAR_MOUNT = 100
/** 电吉他（壁挂）：琴头挂在墙钩上，背面贴墙。[琴身, 护板, 琴颈木] */
export function eGuitarWall(p: string[]) {
  const { g: inst, top } = eGuitar(p[0], p[1], p[2], METAL)
  const g = new THREE.Group()
  g.add(P(G(inst), 0, 0, 2.2 + 3.4))
  // 墙板 + 挂钩（托住琴头下面的琴颈）
  g.add(rbox(8, 12, 1.6, shade(p[2], -0.1), { y: top - 26, z: 0.8 }, 0.6))
  for (const s of [-1, 1]) g.add(rod3([s * 3.6, top - 22, 1.6], [s * 3.6, top - 22.8, 7.6], 0.6, DARK), ball(0.9, RUBBER, { x: s * 3.6, y: top - 22.4, z: 7.8 }))
  return fitGroup(g, E_GUITAR_MOUNT)
}

/** 吉他音箱：[外皮, 网布, 面板] */
export function guitarAmp(p: string[]) {
  const [tolex, grille, panel] = p
  const g = new THREE.Group()
  g.add(rbox(50, 40, 26, tolex, { y: 1.5 }, 1.8))
  g.add(rbox(44, 27, 0.6, grille, { y: 4.5, z: 13 }, 0.4))
  for (let i = 0; i < 6; i++) g.add(noOutline(rbox(43, 0.3, 0.2, shade(grille, -0.12), { y: 6.5 + i * 4.2, z: 13.35 }, 0.1)))
  g.add(rbox(44, 7, 0.6, panel, { y: 33, z: 13 }, 0.3))
  for (let i = 0; i < 6; i++) g.add(cylZ(1, 1.4, DARK, -14 + i * 5.2, 36.5, 13.9, 12))
  g.add(litOutlined(cylZ(0.6, 0.6, '#ff6a5a', 18, 36.5, 13.6, 8), '#ff6a5a', 0.8))
  g.add(rbox(8, 1.6, 0.6, METAL, { x: -15, y: 25, z: 13.4 }, 0.3))
  g.add(rbox(16, 2, 3, DARK, { y: 41.5 }, 0.8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.6, 1.5, RUBBER, { x: sx * 21, z: sz * 9 }, 10))
  return g
}

/** 萨克斯（支架）：[管身, 支架, 按键] */
export function saxStand(p: string[]) {
  const [brass, stand, key] = p
  const g = new THREE.Group()
  const sax = new THREE.Group()
  sax.add(taperPath([[-9, 72, 0], [-6, 74, 0], [-2, 71, 0], [0, 66, 0]], 0.6, 1.1, brass))
  sax.add(cyl(0.7, 0.9, 4, DARK, {}, 10).translateX(-10.5).translateY(71).rotateZ(1.2))
  sax.add(taperPath([[0, 66, 0], [0.3, 46, 0], [1, 24, 0], [3, 14, 0], [8, 11, 0], [12, 15, 0], [13, 24, 0], [13.6, 31, 0]], 1.4, 4.2, brass, 16))
  sax.add(cup(8, 4.3, 7, 0.4, brass, { x: 13.7, y: 30.5 }))
  for (let i = 0; i < 6; i++) sax.add(ball(0.8, key, { x: 0.6 - i * 0.05, y: 56 - i * 4.5, z: 1.8 + i * 0.25 }, [1, 1, 0.5]))
  for (let i = 0; i < 4; i++) sax.add(ball(1.2, brass, { x: 9 + i * 1.2, y: 15 + i * 3, z: 2.6 }, [1, 1, 0.5]))
  g.add(P(sax, -2, 4, 0))
  // 支架：三脚 + 底托 + 立杆
  for (const a of [PI / 2, PI / 2 + 2.1, PI / 2 - 2.1]) g.add(rod3([3, 9, 0], [3 + Math.cos(a) * 15, 0.6, Math.sin(a) * 15], 0.7, stand))
  g.add(P(torus(4.5, 0.7, stand, {}, PI), 4, 12.5, 0, 0, 0, PI))
  g.add(rod3([3, 9, 0], [3, 12.3, 0], 0.7, stand))
  g.add(rod3([3, 9, 0], [-6, 44, -5], 0.7, stand))
  g.add(rod3([-6, 44, -5], [-2, 44, -2.5], 0.6, RUBBER))
  return fitGroup(g)
}

/** 小号（平放）：[管身, 按键, 吹嘴] */
export function trumpet(p: string[]) {
  const [brass, key, mouth] = p
  const g = new THREE.Group()
  const y1 = 5
  const y2 = 9.5
  g.add(taperPath([[-17, y2, 0], [-6, y2, 0]], 0.55, 0.65, brass))
  g.add(taperPath([[-6, y1, 0], [10, y1, 0], [16, y1, 0]], 0.65, 1.2, brass))
  g.add(taperPath([[-6, y2, 0], [-10, y2 - 0.2, 0], [-12.5, (y1 + y2) / 2, 0], [-10, y1 + 0.2, 0], [-6, y1, 0]], 0.65, 0.65, brass))
  g.add(taperPath([[4, y2, 0], [12, y2, 0], [15, (y1 + y2) / 2, 0], [12, y1 + 0.2, 0]], 0.6, 0.6, brass))
  g.add(cup(6, 1.2, 14, 0.3, brass, { x: 16, y: y1, rz: -PI / 2 }))
  for (let i = 0; i < 3; i++) {
    const x = -3 + i * 2.6
    g.add(cyl(1.2, 1.2, 9, brass, { x, y: 2.5 }, 14))
    g.add(cyl(0.4, 0.4, 2, METAL, { x, y: 11.5 }, 8), puck(1, 0.8, key, { x, y: 13.4 }))
  }
  g.add(cylX(0.9, 3, mouth, -18.5, y2, 0, 12))
  return fitGroup(g)
}

/** 长笛（打开的琴盒）：[琴盒, 内衬, 笛身] */
export function fluteCase(p: string[]) {
  const [shellC, lining, silver] = p
  const g = new THREE.Group()
  g.add(tray(40, 4.5, 12, 0.8, shellC))
  g.add(rbox(38.4, 1.4, 10.4, lining, { y: 0.8 }, 0.4))
  const pieces: [number, number, number][] = [[33, -2.8, -1.5], [20, 0, -8], [12, 2.8, -12]]
  for (const [len, z, x] of pieces) g.add(cylX(0.95, len, silver, x, 3.15, z, 14))
  for (let i = 0; i < 8; i++) g.add(ball(0.55, silver, { x: -14 + i * 3.6, y: 4.1, z: -2.8 }, [1, 0.5, 1]))
  g.add(ball(0.5, silver, { x: -8, y: 4, z: 0 }, [1.4, 0.6, 1]))
  return fitGroup(g)
}

/** 单簧管（立在支架上）：[管身, 按键, 支架] */
export function clarinetStand(p: string[]) {
  const [body, key, stand] = p
  const g = new THREE.Group()
  for (const a of [0, 2.1, 4.2]) g.add(rod3([0, 4, 0], [Math.cos(a) * 6.5, 0.5, Math.sin(a) * 6.5], 0.5, stand))
  g.add(cyl(0.6, 0.6, 9, stand, { y: 3 }, 8))
  g.add(cup(3.4, 1.5, 7, 0.3, body, { y: 3 }))
  g.add(cyl(1.5, 1.5, 48, body, { y: 10 }, 16))
  for (const y of [10, 26, 42, 58]) g.add(cyl(1.62, 1.62, 1, key, { y }, 16))
  g.add(cyl(1.4, 1.1, 6, body, { y: 58 }, 16))
  g.add(cyl(1.1, 0.7, 3, DARK, { y: 64 }, 12))
  for (let i = 0; i < 8; i++) g.add(ball(0.5, key, { y: 15 + i * 5, z: 1.45 }, [1, 1, 0.5]))
  for (let i = 0; i < 4; i++) g.add(noOutline(rbox(0.4, 3, 0.4, key, { x: 1.2, y: 22 + i * 7, z: 0.9 }, 0.15)))
  return g
}

/** 口琴 + 盒：[盖板, 琴格, 盒] */
export function harmonica(p: string[]) {
  const [cover, comb, box] = p
  const g = new THREE.Group()
  g.add(tray(12, 2.4, 4.6, 0.4, box, { x: -1, z: -1.6 }))
  g.add(rbox(10.2, 0.8, 3.6, comb, { x: -1, y: 0.4, z: -1.6 }, 0.2))
  // 口琴斜靠在盒前
  const h = new THREE.Group()
  h.add(rbox(10.4, 1, 2.6, comb, { y: 0.6 }, 0.2))
  h.add(rbox(10.6, 0.6, 2.8, cover, {}, 0.25), rbox(10.6, 0.6, 2.8, cover, { y: 1.6 }, 0.25))
  for (let i = 0; i < 10; i++) h.add(noOutline(rbox(0.55, 0.5, 0.2, DARK, { x: -4.5 + i, y: 0.85, z: 1.25 }, 0.1)))
  g.add(P(h, 0.5, 0, 2.6))
  return fitGroup(g)
}

/** 手风琴（立放）：[琴身, 风箱, 点缀] */
export function accordion(p: string[]) {
  const [body, bellows, acc] = p
  const g = new THREE.Group()
  g.add(rbox(14, 40, 20, body, { x: 14, y: 1 }, 1.5))
  g.add(rbox(10, 38, 18, body, { x: -18, y: 2 }, 1.5))
  for (let i = 0; i < 9; i++) g.add(rbox(2.5, 36 - (i % 2) * 1.2, 17 - (i % 2) * 1.2, i % 2 ? shade(bellows, -0.12) : bellows, { x: -12.4 + i * 2.35, y: 3 + (i % 2) * 0.6 }, 0.4))
  g.add(rbox(5, 36, 1.2, IVORY, { x: 9.5, y: 3, z: 10.4 }, 0.3))
  g.add(paintPanel(4.6, 35, `int-acc-keys`, (c, W, H) => {
    c.fillStyle = IVORY
    c.fillRect(0, 0, W, H)
    const n = 20
    const kh = H / n
    c.fillStyle = '#999'
    for (let i = 1; i < n; i++) c.fillRect(0, i * kh, W, 1)
    c.fillStyle = '#26262a'
    for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) c.fillRect(0, (i + 1) * kh - kh * 0.3, W * 0.6, kh * 0.6)
  }, { x: 9.5, y: 3.5, z: 11.1 }))
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) g.add(ball(0.7, IVORY, { x: -21 + c * 3, y: 10 + r * 4.5 + c * 1.2, z: 9.2 }, [1, 1, 0.5]))
  // 装饰条比键盘面板靠后 0.3cm，避免共面闪烁
  g.add(rbox(10, 1.2, 1, acc, { x: 14, y: 30, z: 10.3 }, 0.3))
  for (const x of [-18, 14]) g.add(rbox(3, 4, 4, acc, { x, y: 41 }, 0.8))
  g.add(rbox(36, 1, 2.4, acc, { x: -2, y: 44, z: 0 }, 0.4))
  return g
}

/** 竖琴：[木色, 琴弦, 点缀] */
export function harp(p: string[]) {
  const [wood, str, acc] = p
  const g = new THREE.Group()
  g.add(rbox(34, 6, 30, wood, { x: -16 }, 1.5))
  g.add(taperRod3([-30, 5, 0], [-30, 150, 0], 2.6, 2.2, wood, 12))
  g.add(ball(3.4, acc, { x: -30, y: 152 }))
  // 共鸣箱：从柱脚附近斜升到肩
  const a: V2 = [-20, 10]
  const b: V2 = [30, 120]
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const sb = rbox(len, 12, 26, wood, { y: -6 }, 3)
  g.add(P(G(sb), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, 0, 0, ang))
  g.add(P(G(rbox(len - 8, 0.6, 3, shade(wood, -0.2), { y: 6 }, 0.2)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, 0, 0, ang))
  // 琴颈：贝塞尔曲线
  const neck = new THREE.QuadraticBezierCurve(new THREE.Vector2(30, 122), new THREE.Vector2(-2, 182), new THREE.Vector2(-30, 146))
  const np = neck.getPoints(12)
  for (let i = 1; i < np.length; i++) g.add(taperRod3([np[i - 1].x, np[i - 1].y, 0], [np[i].x, np[i].y, 0], 2.6, 2.6, wood))
  for (let i = 1; i < np.length - 1; i++) g.add(ball(2.6, wood, { x: np[i].x, y: np[i].y }))
  const neckY = (x: number) => {
    let best = np[0]
    for (const v of np) if (Math.abs(v.x - x) < Math.abs(best.x - x)) best = v
    return best.y
  }
  const n = 22
  for (let i = 0; i < n; i++) {
    const x = -24 + (i / (n - 1)) * 48
    const yb = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) + 6 / Math.cos(ang)
    const yt = neckY(x) - 2.4
    if (yt - yb < 4) continue
    const c = i % 7 === 0 ? '#d65a3c' : i % 7 === 3 ? '#3d5a80' : str
    g.add(noOutline(taperRod3([x, yb, 0], [x, yt, 0], 0.15, 0.15, c, 4)))
  }
  return fitGroup(g)
}

/** 三味线（立在架上）：[木色, 皮面, 架子] */
export function shamisen(p: string[]) {
  const [wood, skin, stand] = p
  const inst = new THREE.Group()
  inst.add(rbox(20, 20, 9, wood, {}, 1.8))
  for (const s of [-1, 1]) inst.add(rbox(18.4, 18.4, 0.4, skin, { y: 0.8, z: s * 4.6 }, 0.2))
  inst.add(rbox(2.6, 76, 2.4, shade(wood, -0.1), { y: 19 }, 0.5))
  inst.add(P(G(rbox(3.4, 13, 2.4, shade(wood, -0.1), {}, 0.6)), 0, 94.5, -0.5, -0.35))
  for (let i = 0; i < 3; i++) inst.add(cylX(0.45, 8, IVORY, 0, 97 + i * 3.2, -1.6 - i * 1.1, 8))
  inst.add(rbox(4, 1, 1, IVORY, { y: 5, z: 5 }, 0.2))
  for (const x of [-0.6, 0, 0.6]) inst.add(noOutline(taperRod3([x * 1.5, 2, 5.1], [x, 94, 1.4], 0.05, 0.05, '#f2ecd8', 4)))
  const g = new THREE.Group()
  const t = 0.1
  g.add(rbox(26, 2, 24, stand, {}, 0.8))
  g.add(P(G(inst), 0, 2, 4, -t))
  const L = 62
  g.add(rbox(4, 2 + L * Math.cos(t) - 1, 3, stand, { y: 2, z: 4 - L * Math.sin(t) - 1.2 - 1.5 }, 0.8))
  g.add(rbox(8, 2, 4, stand, { y: 1 + L * Math.cos(t), z: 4 - L * Math.sin(t) - 1.2 - 1.5 }, 0.6))
  return fitGroup(g)
}

/** 筝（和风长琴）：[木色, 琴柱, 架] */
export function koto(p: string[]) {
  const [wood, bridge, stand] = p
  const g = new THREE.Group()
  for (const x of [-78, 78]) g.add(rbox(10, 6, 30, stand, { x }, 1))
  g.add(rbox(180, 6, 26, wood, { y: 6 }, 2.5))
  g.add(rbox(176, 1.2, 22, shade(wood, 0.05), { y: 11.4 }, 0.5))
  for (const x of [-84, 84]) g.add(rbox(3, 4, 24, shade(wood, -0.2), { x, y: 12 }, 0.6))
  const nS = 13
  for (let i = 0; i < nS; i++) {
    const z = -10.5 + (i / (nS - 1)) * 21
    g.add(noOutline(taperRod3([-84, 16.1, z], [84, 16.1, z], 0.06, 0.06, '#f6efd8', 4)))
    const x = 30 - i * 6 + Math.sin(i * 1.7) * 6
    g.add(cyl(0.5, 1.2, 3.5, bridge, { x, y: 12.6, z }, 6))
  }
  g.add(rbox(20, 0.8, 10, '#d65a3c', { x: -68, y: 12.6, z: 0 }, 0.3))
  return g
}

/** 桶身：轴沿 y、中间鼓起，底面在 0 */
function barrel(r0: number, bulge: number, h: number, color: string) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(r0 + bulge * Math.sin((i / 10) * PI), (i / 10) * h))
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 太鼓（台架上，鼓面斜朝前）：[鼓身, 鼓皮, 台架] */
export function taiko(p: string[]) {
  const [body, skin, stand] = p
  const g = new THREE.Group()
  const d = new THREE.Group()
  d.add(barrel(20, 3, 30, body))
  for (const y of [0, 30]) {
    d.add(cyl(20.8, 20.8, 0.6, skin, { y: y - 0.3 }, 28))
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * PI * 2
      d.add(ball(0.6, DARK, { x: Math.cos(a) * 19.6, y: y + (y ? -1.2 : 1.2), z: Math.sin(a) * 19.6 }))
    }
  }
  for (const s of [-1, 1]) d.add(torus(2.2, 0.6, METAL, { x: s * 23, y: 15, ry: PI / 2 }))
  g.add(P(d, 0, 48, -12, 1.15))
  for (const s of [-1, 1]) {
    g.add(rbox(4, 46, 6, stand, { x: s * 27, z: 6 }, 1))
    g.add(rbox(4, 36, 6, stand, { x: s * 27, z: -16 }, 1))
    g.add(rbox(4, 4, 34, stand, { x: s * 27, y: 0 }, 1))
    // 枢轴销对准鼓身两侧的吊环，再用短支架接到前立柱顶
    g.add(cylX(1.2, 4, METAL, s * 24.5, 48 + 15 * Math.cos(1.15), -12 + 15 * Math.sin(1.15), 10))
    g.add(rbox(4, 12, 4, stand, { x: s * 27, y: 44, z: 2.5 }, 1))
  }
  for (const z of [-16, 6]) g.add(rbox(58, 4, 4, stand, { y: 6, z }, 1))
  for (const s of [-1, 1]) g.add(rod3([s * 6, 1, 22], [s * 3, 1, 4], 1, '#e8c89a'))
  return fitGroup(g)
}

/** 尺八（插在座上）：[竹色, 节, 座] */
export function shakuhachi(p: string[]) {
  const [bamboo, node, base] = p
  const g = new THREE.Group()
  g.add(cyl(6, 6.5, 2, base, {}, 24))
  g.add(cup(3.4, 3.4, 5, 0.5, base, { y: 2 }))
  g.add(ball(3, bamboo, { y: 5.5 }, [1, 0.8, 1]))
  g.add(cyl(1.9, 2.6, 50, bamboo, { y: 5.5 }, 16))
  for (const y of [14, 24, 34, 44, 54]) g.add(cyl(2.7 - (y - 5) * 0.014, 2.7 - (y - 5) * 0.014, 0.8, node, { y }, 16))
  for (const y of [18, 22, 28, 32]) g.add(noOutline(ball(0.5, '#2a1e14', { y, z: 2.35 - y * 0.012 }, [1, 1, 0.4])))
  g.add(noOutline(P(rbox(1.6, 0.4, 1.2, '#f6efd8', {}, 0.1), 0, 55.3, 1.2, -0.4)))
  return g
}

/** 小乐器组：铃鼓、沙锤、卡祖笛、三角铁 [主色, 副色, 点缀] */
export function smallInstruments(p: string[]) {
  const [a, b, acc] = p
  const g = new THREE.Group()
  // 铃鼓
  g.add(cup(9, 9, 4.2, 0.8, a, { x: -8 }))
  g.add(cyl(8.6, 8.6, 0.3, IVORY, { x: -8, y: 3.6 }, 28))
  for (let k = 0; k < 5; k++) {
    const t = (k / 5) * PI * 2
    for (const y of [1.4, 2.2]) g.add(puck(1.4, 0.5, METAL, { x: -8 + Math.cos(t) * 9, y, z: Math.sin(t) * 9 }))
  }
  // 沙锤
  for (const [z, c] of [[-3, b], [3, acc]] as [number, string][]) {
    g.add(ball(3.4, c, { x: 6, y: 3.4, z }, [1, 1, 1]))
    g.add(cylX(0.8, 9, c, 13, 1.6, z * 1.3, 10))
  }
  // 卡祖笛
  g.add(cylX(1.1, 9, acc, 10, 1.1, 8, 12))
  g.add(cyl(0.9, 0.9, 1, a, { x: 10, y: 1.5, z: 8 }, 12))
  return fitGroup(g)
}

/** 合成器 / MIDI 键盘：[机身, 白键, 点缀] */
export const synth = (n: number, w: number, d: number, pads: boolean) => (p: string[]) => {
  const [body, white, acc] = p
  const g = new THREE.Group()
  const kd = d * 0.46
  const cheek = pads ? 0 : 3
  g.add(rbox(w - cheek * 2, 7, d, body, {}, 1.4))
  if (!pads) for (const s of [-1, 1]) g.add(rbox(cheek, 9, d, acc === GOLD ? N.oak : shade(body, -0.15), { x: s * (w / 2 - cheek / 2) }, 1))
  const kw = w - cheek * 2 - 6
  g.add(rbox(kw, 1.4, kd, white, { y: 7, z: d / 2 - kd / 2 - 1 }, 0.3))
  g.add(paintTop(kw - 0.4, kd - 0.4, `int-keys${n}-${white}`, drawKeys(n, white, '#26262a', 0, 0.62), 0, 8.7, d / 2 - kd / 2 - 1))
  const zc = -d / 2 + (d - kd) / 2 - 0.5
  g.add(litOutlined(rbox(w * 0.14, 0.4, d * 0.18, '#8fe3ff', { x: -w * 0.08, y: 7, z: zc }, 0.15), '#8fe3ff'))
  for (let i = 0; i < (pads ? 4 : 8); i++) g.add(cyl(1, 1, 1.4, DARK, { x: w * 0.12 + i * (pads ? 4 : 4.2), y: 7, z: zc - 2.2 }, 12), cyl(0.9, 0.9, 1.2, acc, { x: w * 0.12 + i * (pads ? 4 : 4.2), y: 7, z: zc + 2.4 }, 12))
  if (pads) {
    for (let i = 0; i < 8; i++) g.add(rbox(3.4, 0.8, 3.4, i % 2 ? acc : shade(acc, 0.2), { x: -w / 2 + 4 + (i % 4) * 4, y: 7, z: zc - 1.8 + Math.floor(i / 4) * 4 }, 0.5))
  } else {
    for (let i = 0; i < 5; i++) g.add(rbox(0.8, 0.8, 4, DARK, { x: w * 0.3 + i * 2.4, y: 7, z: zc }, 0.2))
    for (const x of [-w / 2 + 6, -w / 2 + 9.5]) g.add(cyl(1.2, 1.2, 1.2, DARK, { x, y: 7, z: d / 2 - kd / 2 - 1, rz: PI / 2 }, 12))
  }
  return g
}

/** DJ 控制器：[机身, 转盘, 点缀] */
export function djDeck(p: string[]) {
  const [body, platter, acc] = p
  const g = new THREE.Group()
  g.add(rbox(70, 4, 38, body, {}, 1.4))
  g.add(rbox(68, 0.6, 36, shade(body, -0.08), { y: 4 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(puck(9, 1.6, platter, { x: s * 21, y: 4.6, z: -3 }))
    g.add(noOutline(cyl(6, 6, 0.3, shade(platter, 0.25), { x: s * 21, y: 6.2, z: -3 }, 28)))
    g.add(cyl(1, 1, 0.6, acc, { x: s * 21, y: 6.4, z: -3 }, 12))
    for (let i = 0; i < 8; i++) g.add(litOutlined(rbox(3, 0.6, 2.4, i % 2 ? acc : shade(acc, 0.25), { x: s * 21 - 7.2 + (i % 4) * 4.8, y: 4.4, z: 10 + Math.floor(i / 4) * 3 }, 0.4), i % 2 ? acc : shade(acc, 0.25), 0.4))
  }
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 4; r++) g.add(cyl(0.9, 0.9, 1.2, DARK, { x: -2.5 + c * 5, y: 4.6, z: -14 + r * 4 }, 12))
    g.add(rbox(0.8, 0.4, 8, DARK, { x: -2.5 + c * 5, y: 4.6, z: 6 }, 0.2))
    g.add(rbox(1.6, 1.4, 1.2, METAL, { x: -2.5 + c * 5, y: 4.8, z: 5 + c * 2 }, 0.3))
  }
  g.add(rbox(10, 0.4, 0.8, DARK, { y: 4.6, z: 14 }, 0.2), rbox(1.4, 1.4, 1.4, METAL, { x: 1, y: 4.8, z: 14 }, 0.3))
  return g
}

/** 谱架（带乐谱）：[架子, 纸, 墨] */
export function musicStand(p: string[]) {
  const [stand, paper, ink] = p
  const g = new THREE.Group()
  for (const a of [PI / 2, PI / 2 + 2.1, PI / 2 - 2.1]) g.add(rod3([0, 26, 0], [Math.cos(a) * 22, 0.6, Math.sin(a) * 22], 0.8, stand))
  g.add(cyl(1, 1, 76, stand, { y: 24 }, 10))
  g.add(cyl(1.4, 1.4, 4, stand, { y: 60 }, 10))
  const desk = new THREE.Group()
  desk.add(rbox(50, 32, 1, stand, {}, 0.4))
  desk.add(rbox(50, 1.2, 3.6, stand, { z: 1.8 }, 0.4))
  desk.add(paintPanel(21, 28, `int-score-${paper}-a`, drawScore(paper, ink, 7), { x: -10.8, y: 1.6, z: 0.9 }))
  desk.add(paintPanel(21, 28, `int-score-${paper}-b`, drawScore(paper, ink, 11), { x: 10.8, y: 1.6, z: 0.9 }))
  g.add(P(desk, 0, 99, 0, -0.42))
  return fitGroup(g)
}

/** 节拍器：[机身, 刻度面, 摆锤] */
export function metronome(p: string[]) {
  const [body, face, weight] = p
  const g = new THREE.Group()
  g.add(rbox(11, 2, 10, body, {}, 0.6))
  const h = 19
  g.add(P(cyl(2.2, 6.6, h, body, {}, 4), 0, 2 + h / 2, 0, 0, PI / 4))
  const half = (y: number) => (6.6 + ((2.2 - 6.6) * (y - 2)) / h) * Math.SQRT1_2
  const ang = Math.atan2(6.6 - 2.2, h) * Math.SQRT1_2 * 1.4
  g.add(P(G(rbox(3, 12, 0.3, face, { y: 0 }, 0.1)), 0, 6, half(6) + 0.1, -ang))
  const a: V3 = [0, 5, half(5) + 0.5]
  const b: V3 = [2, 17, half(17) + 0.5]
  g.add(taperRod3(a, b, 0.18, 0.18, METAL, 6))
  g.add(P(rbox(1.6, 1.4, 1, weight, {}, 0.3), 1.5, 13.5, half(13.5) + 0.6, 0, 0, -Math.atan2(2, 12)))
  g.add(cylX(0.5, 2, METAL, 4.6, 7, 0, 8))
  return g
}
