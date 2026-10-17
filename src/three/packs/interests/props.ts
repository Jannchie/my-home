// 兴趣素材包的摆件建模（漫画、宅物、运动、棋牌、手作、学习、收藏、生活气息、钓鱼）
// 只放建模函数和它们用到的常量，素材表在 ../interests.ts（PACKS 只收集 packs/ 下一层的文件）。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../../toon'
import { C, paintLandscape, paintPanel, pinwheelWalls, rng } from '../../kit'
import { G, P, PI, cylX, cylZ, fitGroup, ghostOutlined, lathe, litOutlined, noOutline, rod3, taperRod3, type V2, type V3 } from '../../geo'
import { J } from '../../packkit'
import { DARK, GLASS, GOLD, IVORY, METAL, PAPER, RUBBER, flat, paintTop, sheet, sym, taperPath, type Draw } from './common'

// =====================================================================
// 兴趣摆件
// =====================================================================

const SKIN = '#ffe3d1'
const SOIL = '#8b6a4f'

/** 叶片 / 花瓣：从 (x,y,z) 朝水平方向 a 伸出，仰角 p */
function petal(len: number, color: string, x: number, y: number, z: number, a: number, p: number, sw = 0.45, st = 0.18) {
  const m = ball(len / 2, color, {}, [sw, st, 1])
  m.rotation.order = 'YXZ'
  m.rotation.set(-p, Math.atan2(Math.cos(a), Math.sin(a)), 0)
  const r = (Math.cos(p) * len) / 2
  m.position.set(x + Math.cos(a) * r, y + (Math.sin(p) * len) / 2, z + Math.sin(a) * r)
  return m
}

// ---------- 漫画 / 宅物 ----------

/** 平放的书：书脊朝 +z（spineBack 时朝 -z），底面中心 (x,y,z) */
function bookFlat(w: number, t: number, d: number, cover: string, x: number, y: number, z: number, ry = 0, spineBack = false) {
  const s = spineBack ? -1 : 1
  const b = G(
    rbox(w, 0.2, d, cover, {}, 0.08),
    rbox(w, 0.2, d, cover, { y: t - 0.2 }, 0.08),
    rbox(w - 0.4, t - 0.4, d - 0.5, PAPER, { y: 0.2, z: s * -0.05 }, 0.08),
    rbox(w, t, 0.3, cover, { z: s * (d / 2 - 0.15) }, 0.1),
  )
  return P(b, x, y, z, 0, ry)
}

/** 漫画书堆：n 本单行本（17.6 × 11.3 × 1.5）[主色, 副色, 点缀] */
export const mangaStack = (n: number) => (p: string[]) => {
  const r = rng(n * 31 + 7)
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const c = shade(p[Math.floor(r() * 3)], (r() - 0.5) * 0.25)
    const x = (r() - 0.5) * 0.8
    const z = (r() - 0.5) * 0.6
    const ry = (r() - 0.5) * 0.08
    const book = bookFlat(17.6, 1.5, 11.3, c, 0, 0, 0)
    book.add(noOutline(rbox(3.2, 0.9, 0.2, '#ffffff', { x: -5, y: 0.3, z: 5.75 }, 0.05)))
    g.add(P(book, x, i * 1.5, z, 0, ry))
  }
  return fitGroup(g)
}

/** 漫画全套（一排立放 + 书挡）：书脊画在一张贴图上 [系列 A, 系列 B, 书挡] */
export function mangaRow(p: string[]) {
  const [a, b, end] = p
  const g = new THREE.Group()
  const n = 34
  const t = 1.6
  const x0 = (-n * t) / 2
  for (let i = 0; i < n; i++) g.add(rbox(t - 0.04, 17.6, 11.3, i < 21 ? a : b, { x: x0 + t / 2 + i * t }, 0.15))
  g.add(paintPanel(n * t, 17.4, `int-manga-row-${a}-${b}`, (c, W, H) => {
    const bw = W / n
    for (let i = 0; i < n; i++) {
      const col = i < 21 ? a : b
      const x = i * bw
      c.fillStyle = shade(col, ((i % 21) % 3) * 0.03)
      c.fillRect(x, 0, bw, H)
      c.fillStyle = '#ffffff'
      c.fillRect(x + bw * 0.12, H * 0.06, bw * 0.76, H * 0.36)
      c.fillStyle = shade(col, -0.25)
      for (let k = 0; k < 4; k++) c.fillRect(x + bw * 0.3, H * (0.1 + k * 0.075), bw * 0.4, H * 0.05)
      c.fillStyle = i % 2 ? shade(col, 0.25) : shade(i < 21 ? b : a, 0.1)
      c.beginPath()
      c.arc(x + bw / 2, H * 0.6, bw * 0.32, 0, PI * 2)
      c.fill()
      c.fillStyle = '#ffffff'
      c.fillRect(x + bw * 0.15, H * 0.82, bw * 0.7, H * 0.1)
      c.fillStyle = '#333333'
      c.font = `bold ${Math.floor(bw * 0.5)}px sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(String(i < 21 ? i + 1 : i - 20), x + bw / 2, H * 0.875)
      c.fillStyle = 'rgba(0,0,0,0.25)'
      c.fillRect(x + bw - 1, 0, 1, H)
    }
  }, { x: 0, y: 0.1, z: 11.3 / 2 + 0.3 }))
  for (const s of [-1, 1]) {
    g.add(rbox(0.4, 15, 11, end, { x: s * ((n * t) / 2 + 0.25) }, 0.15))
    g.add(rbox(5, 0.4, 11, end, { x: s * ((n * t) / 2 + 2.7) }, 0.15))
  }
  return fitGroup(g)
}

/** 无脸小人偶（少女型），站在底座上，高约 11 */
function figGirl(hair: string, dress: string, base: string) {
  const g = new THREE.Group()
  g.add(puck(2.6, 0.6, base))
  for (const s of [-1, 1]) g.add(capsule(0.35, 2.4, SKIN, { x: s * 0.55, y: 0.6 }))
  g.add(cyl(0.9, 2.4, 3, dress, { y: 2.9 }, 16))
  g.add(capsule(0.85, 1.2, dress, { y: 5.4 }))
  for (const s of [-1, 1]) g.add(P(capsule(0.3, 2.2, SKIN), s * 1.25, 6.2, 0, 0, 0, s * 0.3))
  g.add(ball(1.7, SKIN, { y: 9.2 }))
  g.add(ball(1.85, hair, { y: 9.5, z: -0.3 }))
  for (const s of [-1, 1]) g.add(P(capsule(0.55, 2.4, hair), s * 1.9, 8, -0.5, 0, 0, s * 0.2))
  g.add(ball(0.5, base, { x: 1, y: 11, z: 0.6 }))
  return g
}

/** 机器人模型，高约 11 */
function figRobot(main: string, acc: string, base: string) {
  const g = new THREE.Group()
  g.add(rbox(5, 0.6, 4, base, {}, 0.2))
  for (const s of [-1, 1]) {
    g.add(rbox(1.2, 3.6, 1.6, main, { x: s * 0.9, y: 0.6 }, 0.3))
    g.add(rbox(1.5, 0.8, 2, acc, { x: s * 0.9, y: 0.6, z: 0.2 }, 0.2))
    g.add(rbox(1, 3, 1.1, main, { x: s * 2.3, y: 5 }, 0.3))
    g.add(rbox(1.6, 1.2, 1.6, acc, { x: s * 2.3, y: 7.6 }, 0.3))
  }
  g.add(rbox(3.6, 3.4, 2.4, main, { y: 4.2 }, 0.4))
  g.add(rbox(2.2, 1, 0.4, acc, { y: 6, z: 1.2 }, 0.15))
  g.add(rbox(2.4, 2.2, 2.2, main, { y: 7.7 }, 0.4))
  g.add(litOutlined(rbox(1.8, 0.5, 0.3, '#7fe3ff', { y: 8.6, z: 1.1 }, 0.1), '#7fe3ff', 0.7))
  g.add(cyl(0.12, 0.12, 1.2, acc, { x: 0.6, y: 9.9 }, 6), ball(0.3, acc, { x: 0.6, y: 11.2 }))
  return g
}

/** Q 版大头人偶（猫耳），高约 9 */
function figChibi(main: string, acc: string, base: string) {
  const g = new THREE.Group()
  g.add(puck(2.4, 0.6, base))
  g.add(cyl(1, 1.6, 2.6, main, { y: 0.6 }, 16))
  g.add(ball(2.5, SKIN, { y: 5.6 }))
  g.add(ball(2.65, acc, { y: 6, z: -0.35 }))
  for (const s of [-1, 1]) g.add(P(cyl(0.01, 0.9, 1.6, acc, {}, 4), s * 1.6, 8.3, -0.3, 0, 0, -s * 0.35))
  return g
}

/** 手办展示柜（亚克力罩 + 三层手办）：[框架, 手办主色, 手办副色] */
export function figureCase(p: string[]) {
  const [frame, a, b] = p
  const g = new THREE.Group()
  g.add(rbox(40, 3, 25, frame, {}, 0.8))
  g.add(rbox(40, 2.5, 25, frame, { y: 43.5 }, 0.8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.2, 40.5, 1.2, frame, { x: sx * 19.4, y: 3, z: sz * 11.9 }, 0.3))
  g.add(ghostOutlined(rbox(38.6, 40.5, 0.3, GLASS, { y: 3, z: 12.2 }, 0.1), GLASS, 0.18))
  g.add(rbox(38.6, 40.5, 0.4, shade(frame, -0.1), { y: 3, z: -12.1 }, 0.1))
  for (const s of [-1, 1]) g.add(ghostOutlined(rbox(0.3, 40.5, 23.6, GLASS, { x: s * 19.5, y: 3 }, 0.1), GLASS, 0.18))
  for (const y of [16, 29.5]) g.add(ghostOutlined(rbox(38.6, 0.6, 23.6, GLASS, { y }, 0.2), GLASS, 0.4))
  g.add(litOutlined(rbox(36, 0.4, 1, '#fff4d0', { y: 43.1, z: 10 }, 0.15), '#fff4d0', 0.8))
  const tiers = [3, 16.6, 30.1]
  const makers = [() => figGirl(shade(a, 0.1), b, METAL), () => figRobot(b, a, DARK), () => figChibi(a, shade(b, -0.1), METAL)]
  tiers.forEach((y, ti) => {
    for (let k = 0; k < 3; k++) g.add(P(makers[(ti + k) % 3](), -12 + k * 12, y, (k % 2) * 2 - 1, 0, (k - 1) * -0.25))
  })
  return g
}

/** 痛包：透明窗里排满吧唧 [包身, 吧唧主色, 提手] */
export function itaBag(p: string[]) {
  const [bag, badge, trim] = p
  const g = new THREE.Group()
  g.add(rbox(30, 24, 10, bag, {}, 2.5))
  g.add(rbox(25, 18, 0.6, shade(bag, 0.15), { y: 3, z: 5.1 }, 0.3))
  const cols = [badge, shade(badge, 0.2), '#ffffff', shade(badge, -0.15), C.lemon, C.sky, badge, shade(badge, 0.25), C.mint]
  for (let i = 0; i < 9; i++) {
    const x = -7.6 + (i % 3) * 7.6
    const y = 6.2 + Math.floor(i / 3) * 5.8
    g.add(cylZ(2.6, 0.5, cols[i], x, y, 5.65))
    g.add(noOutline(cylZ(1.7, 0.2, shade(cols[i], i % 2 ? -0.18 : 0.15), x, y + 0.2, 6.0, 20)))
    g.add(noOutline(ball(0.7, SKIN, { x, y: y + 0.4, z: 6.1 }, [1, 1, 0.3])))
  }
  g.add(ghostOutlined(rbox(25, 18, 0.3, GLASS, { y: 3, z: 6.4 }, 0.15), GLASS, 0.25))
  for (const s of [-1, 1]) g.add(torus(6, 0.6, trim, { y: 24, z: s * 3 }, PI))
  g.add(rbox(30.4, 2, 10.4, trim, { y: 0 }, 0.8))
  g.add(taperRod3([13, 22, 4], [15.2, 17, 5.2], 0.12, 0.12, METAL, 6))
  g.add(ball(1.8, badge, { x: 15.4, y: 15.4, z: 5.4 }))
  for (const s of [-1, 1]) g.add(ball(0.6, badge, { x: 15.4 + s * 1.2, y: 16.8, z: 5.4 }))
  return fitGroup(g)
}

/** 亚克力立牌：[底色, 角色发色, 角色衣服] */
export function acrylicStand(p: string[]) {
  const [bg, hair, dress] = p
  const g = new THREE.Group()
  g.add(ghostOutlined(rbox(9, 0.5, 5.5, GLASS, {}, 0.2), GLASS, 0.5))
  g.add(rbox(8.6, 0.12, 5.1, shade(bg, 0.1), { y: 0.05 }, 0.04))
  g.add(ghostOutlined(rbox(8.6, 14.5, 0.3, GLASS, { y: 0.5 }, 0.3), GLASS, 0.4))
  g.add(paintPanel(8, 13.8, `int-acsta-${bg}-${hair}-${dress}`, (c, W, H) => {
    c.fillStyle = shade(bg, 0.12)
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#ffffff'
    for (let k = 0; k < 8; k++) {
      c.beginPath()
      c.arc(W * ((k * 0.37) % 1), H * ((k * 0.23 + 0.05) % 0.9), W * 0.03, 0, PI * 2)
      c.fill()
    }
    const cx = W / 2
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.arc(cx, H * 0.3, W * 0.3, 0, PI * 2)
    c.fill()
    c.beginPath()
    c.moveTo(cx - W * 0.36, H * 0.95)
    c.lineTo(cx + W * 0.36, H * 0.95)
    c.lineTo(cx + W * 0.16, H * 0.45)
    c.lineTo(cx - W * 0.16, H * 0.45)
    c.fill()
    c.fillStyle = dress
    c.beginPath()
    c.moveTo(cx - W * 0.3, H * 0.92)
    c.lineTo(cx + W * 0.3, H * 0.92)
    c.lineTo(cx + W * 0.12, H * 0.48)
    c.lineTo(cx - W * 0.12, H * 0.48)
    c.fill()
    c.fillStyle = hair
    c.beginPath()
    c.arc(cx, H * 0.3, W * 0.26, 0, PI * 2)
    c.fill()
    c.fillRect(cx - W * 0.26, H * 0.3, W * 0.12, H * 0.3)
    c.fillRect(cx + W * 0.14, H * 0.3, W * 0.12, H * 0.3)
    c.fillStyle = SKIN
    c.beginPath()
    c.arc(cx, H * 0.33, W * 0.18, 0, PI)
    c.fill()
  }, { y: 0.85, z: 0.2 }))
  return g
}

/** 应援棒（三支平放）：三色发光 */
export function penlights(p: string[]) {
  const g = new THREE.Group()
  p.slice(0, 3).forEach((c, i) => {
    const z = (i - 1) * 3.4
    const x = (i - 1) * 1.2
    g.add(cylX(1.3, 9, DARK, x - 6.5, 1.3, z, 14))
    g.add(cylX(1.4, 1, METAL, x - 1.5, 1.4, z, 14))
    g.add(litOutlined(cylX(1.15, 11, c, x + 4.5, 1.15, z, 14), c, 0.7))
    g.add(litOutlined(ball(1.15, c, { x: x + 10, y: 1.15, z }), c, 0.7))
    g.add(rbox(1.6, 0.6, 0.6, shade(c, -0.2), { x: x - 6, y: 2.4, z }, 0.2))
  })
  return fitGroup(g)
}

/** 海报筒（两支立放）：[主色, 副色, 盖] */
export function posterTubes(p: string[]) {
  const [a, b, capC] = p
  const g = new THREE.Group()
  g.add(cyl(4, 4, 68, a, { x: -2.6 }, 20), cyl(4.3, 4.3, 4, capC, { x: -2.6, y: 66 }, 20), cyl(4.3, 4.3, 3, capC, { x: -2.6 }, 20))
  g.add(cyl(3.2, 3.2, 54, b, { x: 5, z: 1.4 }, 20), cyl(3.5, 3.5, 3.5, capC, { x: 5, y: 52, z: 1.4 }, 20), cyl(3.5, 3.5, 2.5, capC, { x: 5, z: 1.4 }, 20))
  g.add(cyl(4.15, 4.15, 2, DARK, { x: -2.6, y: 40 }, 20))
  g.add(taperRod3([-2.6, 41, 4.1], [-2.6, 66, 4.2], 0.5, 0.5, DARK, 6))
  return fitGroup(g)
}

// ---------- 运动 ----------

export function basketball(p: string[]) {
  const [main, seam] = p
  const r = 12.2
  const g = new THREE.Group()
  g.add(ball(r, main, { y: r }))
  g.add(noOutline(torus(r + 0.03, 0.2, seam, { y: r })), noOutline(torus(r + 0.03, 0.2, seam, { y: r, ry: PI / 2 })), noOutline(torus(r + 0.03, 0.2, seam, { y: r, rx: PI / 2 })))
  for (const k of [-1, 1]) g.add(noOutline(torus(r * 0.75, 0.2, seam, { x: k * r * 0.66, y: r, ry: PI / 2 })))
  return g
}

export function soccerBall(p: string[]) {
  const [main, patch] = p
  const r = 11
  const g = new THREE.Group()
  g.add(ball(r, main, { y: r }))
  const phi = (1 + Math.sqrt(5)) / 2
  const vs: V3[] = []
  for (const a of [-1, 1]) for (const b of [-1, 1]) vs.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a])
  const up = new THREE.Vector3(0, 1, 0)
  for (const v of vs) {
    const n = new THREE.Vector3(...v).normalize()
    const m = noOutline(new THREE.Mesh(new THREE.SphereGeometry(r + 0.15, 5, 2, 0, PI * 2, 0, 0.32), toon(patch)))
    m.position.set(0, r, 0)
    m.quaternion.setFromUnitVectors(up, n)
    g.add(m)
  }
  return g
}

/** 平放的球拍：拍头中心在原点（椭圆半径 a 沿 x、b 沿 z），手柄朝 -x */
function racket(frame: string, grip: string, a: number, b: number, handleLen: number, shaftLen: number, tubeR: number) {
  const g = new THREE.Group()
  const n = 40
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * PI * 2
    pts.push([Math.cos(t) * a, tubeR, Math.sin(t) * b])
  }
  for (let i = 1; i <= n; i++) g.add(taperRod3(pts[i - 1], pts[i], tubeR, tubeR, frame, 8))
  const ia = a - tubeR
  const ib = b - tubeR
  for (let z = -ib + 1.2; z < ib - 0.6; z += 1.3) {
    const half = ia * Math.sqrt(Math.max(0, 1 - (z / ib) ** 2))
    g.add(noOutline(rbox(half * 2, 0.08, 0.1, '#f4f4f0', { y: tubeR - 0.1, z }, 0.03)))
  }
  for (let x = -ia + 1.2; x < ia - 0.6; x += 1.3) {
    const half = ib * Math.sqrt(Math.max(0, 1 - (x / ia) ** 2))
    g.add(noOutline(rbox(0.1, 0.08, half * 2, '#f4f4f0', { x, y: tubeR + 0.02 }, 0.03)))
  }
  const hx = -a
  const sx = hx - shaftLen
  const hr = shaftLen > 12 ? 1.2 : 1.5
  if (shaftLen > 12) g.add(rod3([hx + 0.5, tubeR, 0], [sx, hr, 0], tubeR * 0.5, frame))
  else for (const s of [-1, 1]) g.add(rod3([hx + 1.5, tubeR, s * b * 0.45], [sx, hr, 0], tubeR * 0.9, frame))
  g.add(P(cyl(hr, hr, handleLen, grip, {}, 8), sx - handleLen / 2, hr, 0, 0, 0, PI / 2))
  g.add(cylX(hr + 0.2, 0.8, DARK, sx - handleLen, hr, 0, 8))
  return g
}

/** 网球拍 + 球：[拍框, 握把, 球] */
export function tennis(p: string[]) {
  const [frame, grip, ballC] = p
  const g = new THREE.Group()
  g.add(P(racket(frame, grip, 15, 12, 20, 9, 0.9), 16, 0, -2))
  g.add(ball(3.3, ballC, { x: -14, y: 3.3, z: 9 }))
  g.add(noOutline(P(torus(3.0, 0.15, '#ffffff', {}), -14, 3.3, 9, 0.6, 0, 0.4)))
  return fitGroup(g)
}

/** 羽毛球拍 + 球：[拍框, 握把, 羽毛] */
export function badminton(p: string[]) {
  const [frame, grip, feather] = p
  const g = new THREE.Group()
  g.add(P(racket(frame, grip, 12, 10, 18, 26, 0.6), 18, 0, -2))
  const sh = new THREE.Group()
  sh.add(ball(1.4, IVORY, { y: 1.4 }))
  sh.add(cup(3.3, 1.3, 6.5, 0.15, feather, { y: 1.4 }))
  g.add(P(fitGroup(P(G(sh), 0, 0, 0, 0, 0, -(PI / 2 + 0.28))), -10, 0, 9))
  return fitGroup(g)
}

/** 棒球手套 + 球棒 + 球：[手套皮, 球棒木, 缝线] */
export function baseball(p: string[]) {
  const [leather, wood, stitch] = p
  const g = new THREE.Group()
  const bat = G(cyl(3.2, 1.4, 82, wood, {}, 18), puck(2.2, 1.4, wood, { y: -1.2 }), cyl(1.5, 1.5, 22, DARK, { y: 0.2 }, 12))
  const e = Math.asin((3.2 - 1.4) / 82)
  g.add(P(fitGroup(P(G(bat), 0, 0, 0, 0, 0, -PI / 2 + e)), 0, 0, 9))
  const glove = new THREE.Group()
  glove.add(ball(7, leather, { y: 3.9 }, [1, 0.55, 1.1]))
  for (let i = 0; i < 4; i++) glove.add(P(capsule(1.5, 5, leather), -4.2 + i * 2.6, 6, -8.2 + Math.abs(i - 1.5) * 0.6, -PI / 2 + 0.5))
  glove.add(P(capsule(1.7, 5, leather), 7, 5.2, -2.5, -PI / 2 + 0.3, 0, -0.9))
  glove.add(rbox(4, 4, 0.8, shade(leather, -0.1), { x: 5.2, y: 5, z: -4.5 }, 0.3))
  glove.add(P(cyl(5, 5, 2.4, shade(leather, -0.1), {}, 16), 0, 4, 7.5, PI / 2))
  glove.add(ball(3.7, '#fbf8f0', { x: 0.5, y: 10, z: -1.5 }))
  glove.add(noOutline(P(torus(3.4, 0.14, stitch, {}), 0.5, 10, -1.5, 0.4, 0.3, 0)))
  for (let i = 0; i < 3; i++) glove.add(noOutline(P(torus(0.6, 0.15, stitch, {}), -3 + i * 3, 7.6, 3.2, 0.3)))
  glove.scale.setScalar(1.5)
  // 手套的腕口圆筒最低到 -1（×1.5 = -1.5）：抬起 1.5 贴地，否则 fit 会把整体抬高、球棒悬空
  g.add(P(glove, -24, 1.5, -9))
  return fitGroup(g)
}

/** 滑板（平放）：[板面底色, 砂纸, 轮子] */
export function skateboardFlat(p: string[]) {
  const [deck, grip, wheel] = p
  const g = new THREE.Group()
  const yb = 7.6
  g.add(rbox(56, 1.2, 20, deck, { y: yb }, 0.5))
  g.add(noOutline(rbox(55.4, 0.3, 19.4, grip, { y: yb + 1.2 }, 0.1)))
  for (const s of [-1, 1]) {
    const tail = G(rbox(13, 1.2, 20, deck, { x: s * 6.2 }, 0.5), noOutline(rbox(12.4, 0.3, 19.4, grip, { x: s * 6.2, y: 1.2 }, 0.1)))
    g.add(P(tail, s * 28, yb, 0, 0, 0, s * 0.26))
    const tx = s * 20
    g.add(rbox(6, 1, 7, METAL, { x: tx, y: yb - 1 }, 0.3))
    g.add(rbox(3, 3.6, 3, METAL, { x: tx, y: yb - 4.4 }, 0.6))
    g.add(rbox(3, 1.6, 15, METAL, { x: tx, y: 2 }, 0.6))
    for (const sz of [-1, 1]) g.add(cylZ(2.7, 3.2, wheel, tx, 2.7, sz * 9.1, 18))
  }
  return g
}

/** 滑板（立靠墙）：板面贴墙，轮子朝外 */
export function skateboardStand(p: string[]) {
  return fitGroup(P(G(skateboardFlat(p)), 0, 0, 0, -0.14, -PI / 2, PI / 2))
}

/** 冲浪板（靠墙）：[板色, 条纹, 尾鳍] */
export function surfboard(p: string[]) {
  const [board, stripe, fin] = p
  const pts = sym([[0, 0], [12, 0.5], [21, 10], [25.5, 45], [26, 80], [24, 115], [17, 150], [8, 172], [0, 180]])
  const b = new THREE.Group()
  b.add(flat(pts, 6, board, true, 2))
  b.add(P(flat(pts.map(([x, y]): V2 => [x * 0.86, y * 0.94 + 5]), 0.4, shade(board, 0.06), true, 0.1), 0, 0, 3.05))
  b.add(noOutline(rbox(1.2, 160, 0.3, stripe, { y: 10, z: 3.35 }, 0.1)))
  b.add(P(flat(pts.map(([x, y]): V2 => [x * 0.55, y * 0.06 + 120]), 0.4, stripe, true, 0.1), 0, 0, 3.3))
  for (const [x, y, s] of [[0, 6, 1], [-11, 18, 0.85], [11, 18, 0.85]] as V3[]) b.add(P(flat([[0, 0], [9 * s, 0], [3 * s, 9 * s]], 0.8, fin, false, 0.2), x, y, 3, 0, -PI / 2))
  return fitGroup(P(G(b), 0, 0, 0, -0.1))
}

/** 滑雪板（靠墙）：[板色, 固定器, 绑带] */
export function snowboard(p: string[]) {
  const [board, binding, strap] = p
  const pts = sym([[0, 0], [9, 0.4], [13.5, 4], [14, 10], [12.5, 40], [12, 75], [12.5, 110], [14, 140], [13.5, 146], [9, 149.6], [0, 150]])
  const b = new THREE.Group()
  b.add(flat(pts, 1.4, board, true, 0.5))
  b.add(P(flat(pts.map(([x, y]): V2 => [x * 0.8, y * 0.6 + 30]), 0.3, shade(board, 0.15), true, 0.1), 0, 0, 0.75))
  for (const [cy, ang] of [[50, 0.25], [100, -0.15]] as V2[]) {
    const bd = new THREE.Group()
    bd.add(rbox(10, 22, 1, binding, { y: -11, z: 0.5 }, 0.4))
    for (const s of [-1, 1]) bd.add(rbox(0.8, 22, 4.5, binding, { x: s * 4.6, y: -11, z: 1.2 }, 0.3))
    bd.add(rbox(10, 1, 12, binding, { y: -11, z: 6.5 }, 0.4))
    bd.add(rbox(10.4, 3.4, 1, strap, { y: 1, z: 4.6 }, 0.5), rbox(10.4, 3, 1, strap, { y: 7, z: 4 }, 0.5))
    b.add(P(bd, 0, cy, 0, 0, 0, ang))
  }
  return fitGroup(P(G(b), 0, 0, 0, -0.1))
}

/** 高尔夫球包：[包身, 饰边, 球杆套] */
export function golfBag(p: string[]) {
  const [bag, trim, cover] = p
  const g = new THREE.Group()
  g.add(cyl(13, 13, 4, trim, {}, 20))
  g.add(cyl(12.5, 12.5, 74, bag, { y: 4 }, 20))
  g.add(cup(13.5, 13, 8, 1.2, trim, { y: 76 }))
  g.add(rbox(14, 34, 5, trim, { y: 16, z: 11 }, 2.2))
  g.add(rbox(10, 14, 4, shade(bag, -0.1), { y: 52, z: 11.5 }, 1.8))
  g.add(rod3([-11, 70, -6], [-11, 30, -6], 1.6, DARK), rod3([-11, 70, -6], [-11.3, 50, -11], 1.2, DARK))
  for (const s of [-1, 1]) g.add(rod3([s * 6, 64, -12], [s * 9, 0.6, -24], 0.6, METAL))
  const clubs: [number, number, number][] = [[-5, -4, 0], [0, -6, 1], [5, -3, 2], [-3, 3, 3], [3, 4, 4], [7, 1, 5]]
  for (const [x, z, k] of clubs) {
    const top = 92 + (k % 3) * 4
    g.add(taperRod3([x * 0.8, 78, z * 0.8], [x, top, z], 0.4, 0.4, METAL, 6))
    if (k < 3) {
      g.add(ball(4, k === 1 ? cover : shade(cover, -0.15), { x, y: top + 3.4, z }, [1, 0.9, 1.1]))
      g.add(ball(1.6, k === 1 ? '#ffffff' : cover, { x, y: top + 7.2, z }))
    } else g.add(P(rbox(1.2, 3.6, 6, METAL, { y: -0.4 }, 0.3), x, top, z, 0, k * 0.7))
  }
  return fitGroup(g)
}

/** 拳击手套（一对）：[皮色, 护腕, 点缀] */
export function boxingGloves(p: string[]) {
  const [main, cuff, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 7.5
    g.add(ball(7, main, { x, y: 6.4, z: 2 }, [0.95, 0.9, 1.2]))
    g.add(P(capsule(2.2, 4.5, main), x - s * 5.4, 5.2, 0.5, PI / 2 - 0.3))
    g.add(P(cyl(5, 5, 8, cuff, {}, 18), x, 5.5, -8.5, PI / 2))
    g.add(P(cyl(5.2, 5.2, 2, acc, {}, 18), x, 5.5, -9, PI / 2))
    g.add(noOutline(rbox(4, 0.4, 3, acc, { x, y: 12.2, z: 3 }, 0.2)))
  }
  return fitGroup(g)
}

/** 半球（开口朝下），y 是底面 */
function dome(r: number, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, PI * 2, 0, PI / 2), toon(color))
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 自行车头盔：[壳, 条纹, 内衬] */
export function bikeHelmet(p: string[]) {
  const [shellC, stripe, inner] = p
  const g = new THREE.Group()
  g.add(dome(11, shellC, 0, 1.4, 0, 0.95, 0.95, 1.25))
  const rim = torus(11, 0.8, inner, { y: 0.8, rx: PI / 2 })
  rim.scale.set(0.95, 1.25, 1)
  g.add(rim)
  for (const x of [-4.5, 0, 4.5]) {
    const top = 1.4 + 10.45 * Math.sqrt(Math.max(0, 1 - (x / 10.45) ** 2))
    g.add(noOutline(ball(8, x === 0 ? stripe : shade(shellC, -0.3), { x, y: top - 0.7 }, [0.1, 0.06, 1])))
  }
  g.add(P(rbox(12, 0.5, 3.5, shellC, {}, 0.2), 0, 5, 13.2, 0.3))
  for (const s of [-1, 1]) g.add(taperRod3([s * 8, 1.2, 3], [s * 3, 0.4, 8], 0.4, 0.4, DARK, 6))
  g.add(rbox(3, 1, 2, DARK, { y: 0, z: 8 }, 0.3))
  return fitGroup(g)
}

// ---------- 桌游 / 棋牌 ----------

/** 棋盘网格 */
export function drawGrid(bg: string, line: string, n: number, stars: V2[] = [], margin = 0.04): Draw {
  return (c, W, H) => {
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    c.fillStyle = line
    const x0 = W * margin
    const y0 = H * margin
    const dx = (W - x0 * 2) / (n - 1)
    const dy = (H - y0 * 2) / (n - 1)
    const lw = Math.max(1, W * 0.004)
    for (let i = 0; i < n; i++) {
      c.fillRect(x0 + i * dx - lw / 2, y0, lw, H - y0 * 2)
      c.fillRect(x0, y0 + i * dy - lw / 2, W - x0 * 2, lw)
    }
    for (const [i, j] of stars) {
      c.beginPath()
      c.arc(x0 + i * dx, y0 + j * dy, lw * 2.5, 0, PI * 2)
      c.fill()
    }
  }
}

/** 将棋盘 + 棋子（开局后几步）：[棋盘木, 棋子木, 字色] */
export function shogi(p: string[]) {
  const [board, piece, ink] = p
  const g = new THREE.Group()
  const bw = 33.3
  const bd = 36.4
  g.add(rbox(bw, 3, bd, board, {}, 0.5))
  // 9×9 格：线画在格子边上（10 条线）
  g.add(paintTop(31, 34, `int-shogi-${board}-${ink}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    const lw = Math.max(1, W * 0.004)
    for (let i = 0; i <= 9; i++) {
      c.fillRect((i / 9) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 9) * (H - lw), W, lw)
    }
    for (const [i, j] of [[3, 3], [6, 3], [3, 6], [6, 6]]) {
      c.beginPath()
      c.arc((i / 9) * W, (j / 9) * H, lw * 2.5, 0, PI * 2)
      c.fill()
    }
  }, 0, 3.3, 0))
  const cw = 31 / 9
  const ch = 34 / 9
  const at = (col: number, row: number): V2 => [-15.5 + cw * (col + 0.5), -17 + ch * (row + 0.5)]
  const put = (col: number, row: number, mine: boolean, big = false) => {
    const [x, z] = at(col, row)
    const r = big ? 1.65 : 1.45
    const m = cyl(r * 0.8, r, 0.8, piece, { x, y: 3.3, z, ry: mine ? PI : 0 }, 5)
    m.scale.set(0.85, 1, 1)
    g.add(m)
    g.add(noOutline(rbox(0.8, 0.1, 1.1, ink, { x, y: 4.12, z }, 0.05)))
  }
  const back = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  for (const mine of [true, false]) {
    const r0 = mine ? 8 : 0
    const r1 = mine ? 7 : 1
    const r2 = mine ? 6 : 2
    for (const col of back) put(col, r0, mine, col === 4)
    put(mine ? 1 : 7, r1, mine, true)
    put(mine ? 7 : 1, r1, mine, true)
    for (const col of back) {
      const moved = mine ? col === 2 || col === 6 : col === 6
      put(col, moved ? (mine ? 5 : 3) : r2, mine)
    }
  }
  return g
}

/** 围棋盘 + 两个棋罐：[棋盘木, 棋罐, 线色] */
export function goBoard(p: string[]) {
  const [board, bowl, line] = p
  const g = new THREE.Group()
  g.add(rbox(42.4, 5, 45.5, board, {}, 0.6))
  const st: V2[] = [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
  g.add(paintTop(41.4, 44.5, `int-go-${board}-${line}`, drawGrid(board, line, 19, st, 0.05), 0, 5.3, 0))
  const r = rng(19)
  const gx = (41.4 * 0.9) / 18
  const gz = (44.5 * 0.9) / 18
  for (let k = 0; k < 34; k++) {
    const i = Math.floor(r() * 13) + 3
    const j = Math.floor(r() * 13) + 3
    g.add(ball(1.1, k % 2 ? '#f8f6f0' : '#26262a', { x: -41.4 * 0.45 + i * gx, y: 5.3 + 0.5, z: -44.5 * 0.45 + j * gz }, [1, 0.45, 1]))
  }
  for (const [s, c] of [[-1, '#26262a'], [1, '#f8f6f0']] as [number, string][]) {
    const x = s * 30.5
    g.add(ball(6.5, bowl, { x, y: 4.4, z: 14 }, [1, 0.68, 1]))
    g.add(puck(5.4, 1.8, bowl, { x, y: 8 + (s > 0 ? 0 : 0), z: 14 }))
    if (s < 0) for (let k = 0; k < 3; k++) g.add(ball(1.1, c, { x: x + 4 + k * 1.6, y: 0.5, z: 20 - k }, [1, 0.45, 1]))
  }
  return fitGroup(g)
}

/** 国际象棋棋子 */
export function chessPiece(kind: 'p' | 'r' | 'n' | 'b' | 'q' | 'k', color: string, facing = 0) {
  const g = new THREE.Group()
  const baseP: V2[] = [[0, 0], [1.4, 0], [1.4, 0.45], [1.0, 0.85]]
  if (kind === 'p') {
    g.add(lathe([...baseP, [0.55, 2.3], [0.95, 2.5], [0.45, 2.7], [0, 2.7]], color, 20))
    g.add(ball(0.8, color, { y: 3.3 }))
  } else if (kind === 'r') {
    g.add(lathe([...baseP, [0.85, 3.1], [1.15, 3.3], [1.15, 4.1], [0, 4.1]], color, 20))
  } else if (kind === 'b') {
    g.add(lathe([...baseP, [0.55, 3.0], [1.0, 3.2], [0.5, 3.4], [0, 3.4]], color, 20))
    g.add(ball(0.75, color, { y: 4.2 }, [1, 1.35, 1]), ball(0.28, color, { y: 5.4 }))
  } else if (kind === 'n') {
    g.add(lathe([...baseP, [0.9, 1.4], [0, 1.4]], color, 20))
    const head = G(rbox(1.3, 3.2, 1.6, color, { y: 0 }, 0.5), rbox(1.2, 1.2, 2.2, color, { y: 2, z: 0.8 }, 0.4))
    g.add(P(head, 0, 1.3, -0.2, 0.2))
  } else {
    const tall = kind === 'k' ? 4.6 : 4.2
    g.add(lathe([...baseP, [0.6, tall - 0.8], [1.1, tall - 0.6], [0.7, tall - 0.4], [1.05, tall + 0.3], [0, tall + 0.3]], color, 20))
    if (kind === 'q') g.add(ball(0.42, color, { y: tall + 0.6 }))
    else g.add(rbox(0.4, 1.5, 0.4, color, { y: tall + 0.3 }, 0.1), rbox(1.2, 0.4, 0.4, color, { y: tall + 1 }, 0.1))
  }
  g.rotation.y = facing
  return g
}

/** 国际象棋（中局）：[棋盘框, 白子, 黑子] */
export function chess(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  g.add(rbox(36, 2, 36, frame, {}, 0.5))
  g.add(paintTop(32, 32, `int-chess-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
      }
  }, 0, 2.3, 0))
  const sq = (f: number, r: number): V2 => [-14 + f * 4, 14 - r * 4]
  const pieces: [string, number, number, boolean][] = [
    ['k', 6, 0, true], ['r', 5, 0, true], ['q', 3, 1, true], ['b', 2, 3, true], ['n', 5, 2, true], ['p', 0, 1, true], ['p', 1, 1, true], ['p', 4, 3, true], ['p', 5, 1, true], ['p', 6, 1, true], ['p', 7, 2, true],
    ['k', 6, 7, false], ['r', 0, 7, false], ['r', 5, 7, false], ['q', 4, 6, false], ['n', 2, 5, false], ['b', 6, 6, false], ['p', 0, 6, false], ['p', 1, 5, false], ['p', 4, 4, false], ['p', 5, 6, false], ['p', 6, 5, false], ['p', 7, 6, false],
  ]
  for (const [k, f, r, w] of pieces) {
    const [x, z] = sq(f, r)
    g.add(P(chessPiece(k as 'p', w ? white : black, w ? PI : 0), x, 2.35, z))
  }
  // 被吃掉的黑象躺在棋盘边（沿 +z 平放，底座半径 1.4 → 抬 1.4 正好贴地；以前 translateY 在旋转后的局部系里，象一半陷进地面，整盘被 fit 抬高）
  g.add(P(chessPiece('b', black), 21, 1.4, 1.8, PI / 2))
  g.add(P(chessPiece('p', white), 20.5, 0, -6), P(chessPiece('n', white, 0.8), 21, 0, -1))
  return fitGroup(g)
}

/** 麻将牌面：rows × cols 张牌 */
export function drawTiles(cols: number, rows: number, seed: number, face: string): Draw {
  return (c, W, H) => {
    const r = rng(seed)
    const tw = W / cols
    const th = H / rows
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * tw
        const y = j * th
        c.fillStyle = shade(face, -0.15)
        c.fillRect(x, y, tw, th)
        c.fillStyle = face
        c.fillRect(x + tw * 0.06, y + th * 0.04, tw * 0.88, th * 0.92)
        const kind = Math.floor(r() * 3)
        const n = 1 + Math.floor(r() * 5)
        if (kind === 0) {
          for (let k = 0; k < n; k++) {
            c.fillStyle = k % 2 ? '#3d6fb8' : '#c8473a'
            c.beginPath()
            c.arc(x + tw * (0.3 + (k % 2) * 0.4), y + th * (0.2 + Math.floor(k / 2) * 0.28), tw * 0.15, 0, PI * 2)
            c.fill()
          }
        } else if (kind === 1) {
          c.fillStyle = '#2f8a4a'
          for (let k = 0; k < n; k++) c.fillRect(x + tw * (0.2 + (k % 3) * 0.24), y + th * (0.15 + Math.floor(k / 3) * 0.4), tw * 0.12, th * 0.32)
        } else {
          c.fillStyle = '#26262a'
          c.fillRect(x + tw * 0.25, y + th * 0.18, tw * 0.5, th * 0.07)
          c.fillRect(x + tw * 0.45, y + th * 0.18, tw * 0.1, th * 0.36)
          c.fillStyle = '#c8473a'
          c.fillRect(x + tw * 0.28, y + th * 0.62, tw * 0.44, th * 0.18)
        }
      }
  }
}

/** 麻将桌（一局进行中）：[桌框, 桌布, 牌背] */
export function mahjong(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 68, 5, frame, { x: sx * 38, z: sz * 38 }, 1))
  g.add(rbox(88, 3, 88, frame, { y: 68 }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(88, 2.4, 4, frame, { y: 71, z: s * 42 }, 0.8))
    g.add(rbox(4, 2.4, 80, frame, { x: s * 42, y: 71 }, 0.8))
  }
  g.add(rbox(80, 0.5, 80, felt, { y: 71 }, 0.2))
  const fy = 71.5
  const tw = 2.6
  const th = 3.5
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group()
    // 手牌：13 张立着，牌面朝外
    const HL = 13 * tw
    side.add(rbox(HL, th, 1.2, IVORY, { z: 33.4 }, 0.25))
    side.add(rbox(HL, th, 0.7, back, { z: 32.45 }, 0.25))
    side.add(paintPanel(HL - 0.2, th - 0.2, `int-mj-hand-${k}`, drawTiles(13, 1, 30 + k, IVORY), { y: 0.1, z: 34.3 }))
    // 舍牌：两排 6 张，牌面朝上
    side.add(rbox(6 * tw, 0.7, 2 * th, back, { z: 9 }, 0.25))
    side.add(rbox(6 * tw, 1.2, 2 * th, IVORY, { y: 0.7, z: 9 }, 0.25))
    side.add(paintTop(6 * tw - 0.2, 2 * th - 0.2, `int-mj-river-${k}`, drawTiles(6, 2, 50 + k, IVORY), 0, 2.2, 9))
    g.add(P(side, 0, fy, 0, 0, (k * PI) / 2))
  }
  // 牌山：四面各 17 墩 × 2 层，风车形围成方框（彼此不重叠）
  mjRing(g, 17, back, fy, 11)
  g.add(rbox(9, 0.6, 9, DARK, { y: fy }, 0.3))
  for (const [x, z] of [[-1.2, 0.5], [1.4, -0.8]] as V2[]) g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x, y: fy + 0.6, z }, 0.3))
  return g
}

/** 扑克牌 + 筹码：[桌垫, 牌背, 筹码主色] */
export function poker(p: string[]) {
  const [mat, cardBack, chip] = p
  const g = new THREE.Group()
  g.add(rbox(32, 0.3, 22, mat, {}, 0.15))
  g.add(rbox(6.3, 1.6, 8.8, '#ffffff', { x: -10, y: 0.3, z: -3 }, 0.3))
  g.add(noOutline(rbox(5.7, 0.1, 8.2, cardBack, { x: -10, y: 1.9, z: -3 }, 0.05)))
  const suits = ['♠', '♥', '♦', '♣', '♥']
  const ranks = ['A', 'K', 'Q', 'J', '10']
  for (let i = 0; i < 5; i++) {
    const card = G(rbox(6.3, 0.12, 8.8, '#ffffff', {}, 0.05), paintTop(6, 8.5, `int-card-${i}`, (c, W, H) => {
      c.fillStyle = '#ffffff'
      c.fillRect(0, 0, W, H)
      c.fillStyle = i % 4 === 0 || i === 3 ? '#26262a' : '#c8473a'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `${Math.floor(H * 0.4)}px serif`
      c.fillText(suits[i], W / 2, H * 0.55)
      c.font = `bold ${Math.floor(H * 0.14)}px sans-serif`
      c.fillText(ranks[i], W * 0.16, H * 0.1)
    }, 0, 0.42, 0))
    g.add(P(card, -1 + i * 2.2, 0.3 + i * 0.13, 4 - Math.abs(i - 2) * 0.4, 0, (2 - i) * 0.18))
  }
  const cols = [chip, '#ffffff', '#26262a', shade(chip, 0.25)]
  const stacks: [number, number, number][] = [[7, -5, 9], [11.5, -5, 6], [9.2, -1, 12], [13, 2.5, 4]]
  stacks.forEach(([x, z, n], i) => {
    const c = cols[i % cols.length]
    const h = n * 0.34
    g.add(cyl(2, 2, h, c, { x, y: 0.3, z }, 20))
    for (let k = 1; k < n; k += 2) g.add(noOutline(cyl(2.02, 2.02, 0.12, i % 4 === 1 ? chip : '#ffffff', { x, y: 0.3 + k * 0.34, z }, 20)))
  })
  g.add(cyl(2, 2, 0.34, chip, { x: 4, y: 0.3, z: 8, rz: 0.1 }, 20))
  return fitGroup(g)
}

/** 桌游盒子堆：[盒色 1, 盒色 2, 盒色 3] */
export function boardGames(p: string[]) {
  const g = new THREE.Group()
  const boxes: [number, number, number, number][] = [
    [30, 7, 30, 0.03],
    [27, 6, 27, -0.06],
    [29, 7.5, 15, 0.08],
    [19, 5.5, 19, -0.1],
  ]
  let y = 0
  boxes.forEach(([w, h, d, ry], i) => {
    const c = p[i % 3]
    const box = G(
      rbox(w, h, d, c, {}, 0.4),
      rbox(w + 0.1, 0.5, d + 0.1, shade(c, -0.15), { y: h - 1.5 }, 0.2),
      paintTop(w - 1, d - 1, `int-bg-${i}-${c}`, (cv, W, H) => {
        cv.fillStyle = c
        cv.fillRect(0, 0, W, H)
        cv.fillStyle = shade(c, 0.22)
        cv.beginPath()
        cv.arc(W * 0.65, H * 0.55, Math.min(W, H) * 0.32, 0, PI * 2)
        cv.fill()
        cv.fillStyle = shade(c, -0.25)
        for (let k = 0; k < 3; k++) cv.fillRect(W * (0.1 + k * 0.12), H * (0.6 - k * 0.12), W * 0.1, H * (0.3 + k * 0.12))
        cv.fillStyle = '#ffffff'
        cv.fillRect(W * 0.08, H * 0.08, W * 0.6, H * 0.14)
        cv.fillStyle = shade(c, -0.35)
        cv.fillRect(W * 0.12, H * 0.12, W * 0.45, H * 0.06)
      }, 0, h + 0.3, 0),
    )
    g.add(P(box, i === 2 ? -4 : 0, y, i === 2 ? 4 : 0, 0, ry))
    y += h
  })
  return fitGroup(g)
}

// ---------- 手作 ----------

/** 毛线篮（毛线球 + 棒针）：[篮子, 毛线 1, 毛线 2] */
export function knittingBasket(p: string[]) {
  const [basket, y1, y2] = p
  const g = new THREE.Group()
  g.add(cup(15, 12, 16, 1.2, basket))
  for (const y of [4, 8, 12]) g.add(torus(12 + (3 * y) / 16 + 0.15, 0.35, shade(basket, -0.12), { y, rx: PI / 2 }))
  g.add(ball(8, y2, { y: 9.5 }))
  const yarn = (r: number, c: string, x: number, y: number, z: number, seed: number) => {
    g.add(ball(r, c, { x, y, z }))
    const rr = rng(seed)
    for (let k = 0; k < 3; k++) g.add(noOutline(P(torus(r * 0.99, 0.18, shade(c, -0.12), {}), x, y, z, rr() * PI, rr() * PI, 0)))
  }
  yarn(5.5, y1, -5, 13, -3, 1)
  yarn(5, y2, 5, 12.5, 2, 2)
  yarn(4.5, shade(y1, 0.2), -1, 14, 7, 3)
  for (const s of [-1, 1]) {
    g.add(taperRod3([-5 + s, 13, -3], [-12 + s * 2, 30, -9], 0.35, 0.3, METAL, 8))
    g.add(ball(0.8, shade(y2, -0.2), { x: -12 + s * 2, y: 30, z: -9 }))
  }
  yarn(4.5, y1, 20, 4.5, 8, 4)
  g.add(noOutline(taperRod3([12, 15.5, 4], [17, 1, 8], 0.15, 0.15, y1, 4)))
  return fitGroup(g)
}

/** 缝纫机：[机身, 点缀, 线] */
export function sewingMachine(p: string[]) {
  const [body, acc, thread] = p
  const g = new THREE.Group()
  g.add(rbox(40, 5, 18, body, {}, 1.5))
  g.add(rbox(14, 0.4, 8, METAL, { x: -12, y: 5, z: 2 }, 0.2))
  g.add(rbox(11, 20, 14, body, { x: 13.5, y: 5 }, 2.2))
  g.add(rbox(38, 8, 13, body, { y: 22 }, 2.5))
  g.add(rbox(9, 10, 12, body, { x: -14.5, y: 13 }, 2))
  g.add(cyl(0.4, 0.4, 6, METAL, { x: -15, y: 7 }, 8))
  g.add(rbox(2.4, 0.6, 3, METAL, { x: -15, y: 5.4, z: 0.6 }, 0.2))
  g.add(cylX(5, 2.4, acc, 20.4, 18, 0, 24))
  g.add(cylX(2, 2.6, shade(acc, -0.15), 20.6, 18, 0, 16))
  g.add(cyl(0.3, 0.3, 4, METAL, { x: 8, y: 30 }, 6))
  g.add(puck(1.6, 0.4, thread, { x: 8, y: 30.2 }), cyl(1.2, 1.2, 2.4, thread, { x: 8, y: 30.6 }, 14), puck(1.6, 0.4, thread, { x: 8, y: 33 }))
  g.add(rbox(28, 1.4, 0.4, acc, { x: -2, y: 26, z: 6.6 }, 0.2))
  g.add(cylZ(1.8, 1.2, acc, 13.5, 14, 7.4, 16))
  g.add(noOutline(taperRod3([8, 33, 0], [-14, 29.8, 4], 0.06, 0.06, thread, 4)))
  g.add(rbox(16, 0.3, 10, shade(thread, 0.3), { x: -8, y: 5.4, z: 3 }, 0.1))
  return fitGroup(g)
}

/** 刺绣绷（绣好的花）+ 绣线 + 剪刀：[木绷, 布, 线] */
export function embroidery(p: string[]) {
  const [wood, cloth, thread] = p
  const g = new THREE.Group()
  const hx = -5
  g.add(torus(9, 0.7, wood, { x: hx, y: 0.7, rx: PI / 2 }))
  g.add(torus(8.4, 0.5, shade(wood, -0.08), { x: hx, y: 0.5, rx: PI / 2 }))
  g.add(cyl(8.6, 8.6, 0.15, cloth, { x: hx, y: 0.6 }, 32))
  g.add(paintTop(11.4, 11.4, `int-embroid-${cloth}-${thread}`, (c, W, H) => {
    c.fillStyle = cloth
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#4f9e5b'
    c.lineWidth = W * 0.03
    c.beginPath()
    c.moveTo(W * 0.5, H * 0.95)
    c.quadraticCurveTo(W * 0.42, H * 0.6, W * 0.5, H * 0.38)
    c.stroke()
    c.fillStyle = '#78c47a'
    for (const s of [-1, 1]) {
      c.beginPath()
      c.ellipse(W * (0.5 + s * 0.12), H * 0.7, W * 0.1, H * 0.045, -s * 0.6, 0, PI * 2)
      c.fill()
    }
    const fl = (cx: number, cy: number, r: number, col: string) => {
      c.fillStyle = col
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * PI * 2
        c.beginPath()
        c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.75, 0, PI * 2)
        c.fill()
      }
      c.fillStyle = '#ffe08f'
      c.beginPath()
      c.arc(cx, cy, r * 0.7, 0, PI * 2)
      c.fill()
    }
    fl(W * 0.5, H * 0.3, W * 0.09, thread)
    fl(W * 0.25, H * 0.5, W * 0.06, shade(thread, 0.15))
    fl(W * 0.76, H * 0.48, W * 0.06, shade(thread, -0.1))
  }, hx, 0.98, 0))
  g.add(rbox(1.6, 1.6, 2.2, METAL, { x: hx, y: 0.2, z: -10 }, 0.4))
  const skeins = [thread, shade(thread, 0.2), C.sky, C.lemon]
  skeins.forEach((c, i) => {
    g.add(P(capsule(0.7, 4.4, c), 9.5 + i * 1.7, 0.7, -3 + (i % 2) * 0.8, 0, 0, PI / 2 + 0.25))
    g.add(noOutline(cylX(0.75, 1, '#ffffff', 9.5 + i * 1.7, 0.7, -3 + (i % 2) * 0.8, 10)))
  })
  for (const s of [-1, 1]) {
    g.add(P(rbox(6, 0.3, 0.7, METAL, {}, 0.1), 11.5, 0.2 + (s > 0 ? 0.3 : 0), 6, 0, s * 0.12))
    g.add(torus(1, 0.3, thread, { x: 7.2, y: 0.35, z: 6 + s * 1.4, rx: PI / 2 }))
  }
  return fitGroup(g)
}

/** 书法套装：毛毡 + 半纸 + 砚台 + 毛笔 + 文镇 [毛毡, 墨, 笔杆] */
export function calligraphy(p: string[]) {
  const [felt, ink, bamboo] = p
  const g = new THREE.Group()
  g.add(rbox(46, 0.4, 36, felt, {}, 0.15))
  g.add(sheet(24.2, 33.3, J.washi, -8, 0.4, 0, 0.1))
  g.add(paintTop(24, 33, `int-shodo-${ink}`, (c, W, H) => {
    c.fillStyle = J.washi
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${Math.floor(W * 0.62)}px "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif`
    c.fillText('夢', W * 0.5, H * 0.3)
    c.fillText('翔', W * 0.5, H * 0.7)
    c.fillStyle = '#d65a3c'
    c.fillRect(W * 0.08, H * 0.86, W * 0.08, W * 0.08)
  }, -8, 0.82, 0))
  g.add(rbox(24, 1, 1.6, J.sumi, { x: -8, y: 0.5, z: -15.4 }, 0.3))
  g.add(rbox(9, 2, 16, '#3a3a40', { x: 12, y: 0.4, z: -6 }, 0.6))
  g.add(noOutline(rbox(6.4, 0.2, 4.2, '#15161a', { x: 12, y: 2.35, z: -11.2 }, 0.1)))
  g.add(rbox(1.6, 1.2, 5.5, '#26262a', { x: 12, y: 2.4, z: -3 }, 0.3))
  g.add(rbox(4, 1, 2, J.wood, { x: 12, y: 0.4, z: 8 }, 0.3))
  g.add(taperRod3([6.5, 1.6, 12], [19, 1.6, 7], 0.45, 0.42, bamboo))
  g.add(taperRod3([6.5, 1.6, 12], [3.8, 1.2, 13.2], 0.55, 0.12, '#1e1e22'))
  g.add(puck(2, 1.6, J.washi, { x: 18, y: 0.4, z: 13 }))
  return fitGroup(g)
}

/** 水彩套装：画本 + 颜料盒 + 画笔 + 洗笔杯 [盒色, 天色, 山色] */
export function watercolor(p: string[]) {
  const [tin, sky, hill] = p
  const g = new THREE.Group()
  g.add(rbox(22, 1, 16, '#ffffff', { x: -6, z: -2 }, 0.3))
  g.add(paintTop(20.4, 14.4, `int-wc-${sky}-${hill}`, paintLandscape(sky, hill, '#ffd27a'), -6, 1.3, -2))
  g.add(tray(13, 1.2, 8, 0.4, tin, { x: 12, z: -4 }))
  const pans = ['#d64545', '#e8873a', '#f0cf4a', '#5aa55a', '#3d8fd0', '#3a4a9a', '#8a4fb0', '#7a4a2a', '#26262a', '#f2a0b8', '#58c0b0', '#c0a070']
  pans.forEach((c, i) => g.add(rbox(1.7, 0.6, 2.6, c, { x: 12 - 5.2 + (i % 6) * 2.08, y: 0.4, z: -4 - 1.6 + Math.floor(i / 6) * 3.2 }, 0.2)))
  g.add(tray(13, 1, 8, 0.4, tin, { x: 12, z: 4.6 }))
  g.add(rbox(12, 0.3, 7, '#ffffff', { x: 12, y: 0.4, z: 4.6 }, 0.1))
  for (const [x, z, c] of [[9, 3.6, sky], [14, 5.6, hill]] as [number, number, string][]) g.add(noOutline(ball(1.4, c, { x, y: 0.75, z }, [1, 0.12, 0.8])))
  const brush = (z: number, c: string, r: number) => {
    g.add(taperRod3([-14, r, z], [4, r, z + 1], r, r * 0.6, c, 8))
    g.add(taperRod3([-14, r, z], [-16, r, z - 0.1], r * 1.05, r * 1.05, METAL, 8))
    g.add(taperRod3([-16, r, z - 0.1], [-19, r * 0.8, z - 0.2], r * 0.9, 0.08, '#3a2a20', 8))
  }
  brush(8.5, '#c8473a', 0.45)
  brush(10.5, '#26262a', 0.35)
  const jx = -22
  g.add(ghostOutlined(cup(3.2, 3, 8, 0.3, GLASS, { x: jx, z: 0 }), GLASS, 0.35))
  g.add(cyl(2.8, 2.7, 5, shade(sky, 0.15), { x: jx, y: 0.3, z: 0 }, 20))
  g.add(taperRod3([jx, 3, 0], [jx + 2.5, 11, 1], 0.3, 0.3, hill, 8))
  return fitGroup(g)
}

/** 陶艺转盘：[机身, 托盘, 陶泥] */
export function potteryWheel(p: string[]) {
  const [body, pan, clay] = p
  const g = new THREE.Group()
  g.add(rbox(46, 26, 50, body, {}, 6))
  g.add(cup(19, 17, 9, 1, pan, { y: 26, z: 2 }))
  g.add(cyl(13, 13, 2, METAL, { y: 27, z: 2 }, 32))
  g.add(lathe([[0, 0], [6, 0], [7.2, 2], [7.6, 6], [6.2, 10], [4.2, 13], [4.8, 14.2], [4, 14.4], [3.4, 13], [5.5, 9], [6.4, 5], [5.6, 2], [0, 1.4]], clay, 28).translateY(29).translateZ(2))
  g.add(rbox(10, 3, 14, body, { x: 16, z: 30 }, 1.2))
  g.add(rbox(8, 1, 10, RUBBER, { x: 16, y: 3, z: 30 }, 0.4))
  g.add(noOutline(taperRod3([16, 1, 23], [12, 1, 25], 0.4, 0.4, DARK, 6)))
  g.add(cylZ(2, 1.5, DARK, -14, 18, 25.6, 16))
  g.add(rbox(12, 1.5, 14, pan, { x: -29, y: 22 }, 0.5))
  g.add(rbox(5, 2.5, 4, C.lemon, { x: -30, y: 23.5, z: -2 }, 1))
  g.add(taperRod3([-27, 24.2, 4], [-33, 24.2, 3], 0.3, 0.3, METAL, 6))
  return fitGroup(g)
}

// ---------- 学习 / 研究 ----------

/** 显微镜：[机身, 金属, 灯] */
export function microscope(p: string[]) {
  const [body, metal, lamp] = p
  const g = new THREE.Group()
  g.add(rbox(14, 3, 18, body, { z: 1 }, 1.5))
  g.add(taperRod3([0, 3, -6], [0, 20, -7.5], 2, 1.8, body))
  g.add(ball(1.8, body, { y: 20, z: -7.5 }))
  g.add(taperRod3([0, 20, -7.5], [0, 26, -3], 1.8, 1.6, body))
  g.add(rbox(11, 1, 10, DARK, { y: 12, z: 2 }, 0.4))
  g.add(rbox(4, 9, 4, body, { y: 3, z: -4 }, 0.8))
  g.add(litOutlined(cyl(1.5, 1.5, 1, lamp, { y: 3, z: 2 }, 16), lamp))
  for (const s of [-1, 1]) g.add(cylX(2.2, 1.4, DARK, s * 2.6, 9, -6, 16))
  g.add(rbox(5, 5, 7, body, { y: 23, z: -2 }, 1))
  g.add(cyl(2.6, 2.2, 1.6, metal, { y: 20.6, z: 1.4 }, 16))
  for (const [dx, dz, l] of [[0, 1.2, 3.5], [-1.1, -0.6, 3], [1.1, -0.6, 2.5]] as V3[]) g.add(cyl(0.7, 0.55, l, metal, { x: dx, y: 20.7 - l, z: 1.4 + dz }, 10))
  g.add(taperRod3([0, 27.6, -2], [0, 31.5, -5.5], 1.1, 1.1, metal, 12))
  g.add(taperRod3([0, 31.5, -5.5], [0, 33, -6.8], 1.35, 1.35, DARK, 12))
  g.add(noOutline(rbox(7, 0.15, 2.5, '#eaf4ff', { y: 13, z: 2 }, 0.05)))
  return fitGroup(g)
}

/** 化学烧瓶组：试管架 + 锥形瓶 + 烧杯 [木架, 液体 1, 液体 2] */
export function chemSet(p: string[]) {
  const [wood, l1, l2] = p
  const g = new THREE.Group()
  g.add(rbox(22, 1, 6, wood, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(1, 9, 6, wood, { x: s * 10.5, y: 1 }, 0.3))
  const holes = [-8, -4, 0, 4, 8].map((x) => ({ kind: 'circle' as const, x, y: 3, r: 1.3 }))
  const top = holePanelH(22, 6, 0.8, wood, holes)
  g.add(P(top, 0, 9.6, 3, -PI / 2))
  const cols = [l1, l2, shade(l1, 0.2), '#ffd27a', shade(l2, -0.15)]
  ;[-8, -4, 0, 4, 8].forEach((x, i) => {
    const lh = 4 + (i % 3) * 2.5
    g.add(cyl(0.95, 0.95, lh, cols[i], { x, y: 1.6 }, 12), ball(0.95, cols[i], { x, y: 1.95 }))
    g.add(ghostOutlined(cyl(1.1, 1.1, 13, GLASS, { x, y: 1.9 }, 12), GLASS, 0.3))
  })
  const fx = 16
  g.add(cyl(3.4, 4.7, 4, l1, { x: fx, y: 0.2 }, 20))
  g.add(ghostOutlined(cyl(1.4, 5, 10, GLASS, { x: fx }, 20), GLASS, 0.3))
  g.add(ghostOutlined(cyl(1.3, 1.3, 4, GLASS, { x: fx, y: 10 }, 16), GLASS, 0.3))
  const bx = -16
  g.add(cyl(3.2, 3.2, 5, l2, { x: bx, y: 0.3 }, 20))
  g.add(ghostOutlined(cup(3.5, 3.5, 9, 0.2, GLASS, { x: bx }), GLASS, 0.3))
  for (let k = 0; k < 3; k++) g.add(noOutline(rbox(1.4, 0.15, 0.1, '#ffffff', { x: bx, y: 3 + k * 2, z: 3.55 }, 0.03)))
  return fitGroup(g)
}

/** 水平放的带洞板：在 xz 平面，宽 w、深 d */
function holePanelH(w: number, d: number, t: number, color: string, holes: { kind: 'circle'; x: number; y: number; r: number }[]) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, d)
  s.lineTo(-w / 2, d)
  s.lineTo(-w / 2, 0)
  for (const h of holes) {
    const path = new THREE.Path()
    path.absarc(h.x, h.y, h.r, 0, PI * 2, true)
    s.holes.push(path)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 12 })
  geo.translate(0, 0, -t / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export const STAR_MOUNT = 120
/** 天文星图（挂墙）：[画框, 底色, 星色] */
export function starChart(p: string[]) {
  const [frame, bg, star] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(70, 2.5, 2.5, frame, { y: s > 0 ? 47.5 : 0 }, 0.6))
    g.add(rbox(2.5, 45, 2.5, frame, { x: s * 33.75, y: 2.5 }, 0.6))
  }
  g.add(rbox(66, 46, 0.6, shade(bg, -0.1), { y: 2, z: -0.9 }, 0.2))
  g.add(paintPanel(65, 45, `int-star-${bg}-${star}`, (c, W, H) => {
    const r = rng(77)
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    c.strokeStyle = shade(bg, 0.12)
    c.lineWidth = Math.max(1, W * 0.002)
    const cx = W / 2
    const cy = H / 2
    for (const k of [0.15, 0.28, 0.41]) {
      c.beginPath()
      c.arc(cx, cy, H * k, 0, PI * 2)
      c.stroke()
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2
      c.beginPath()
      c.moveTo(cx, cy)
      c.lineTo(cx + Math.cos(a) * H * 0.41, cy + Math.sin(a) * H * 0.41)
      c.stroke()
    }
    c.fillStyle = star
    const pts: V2[] = []
    for (let k = 0; k < 160; k++) {
      const x = r() * W
      const y = r() * H
      const s = r() < 0.12 ? 2.2 : r() < 0.4 ? 1.3 : 0.8
      c.beginPath()
      c.arc(x, y, s * W * 0.002, 0, PI * 2)
      c.fill()
      if (s > 2) pts.push([x, y])
    }
    c.strokeStyle = star
    c.globalAlpha = 0.6
    for (let k = 0; k + 2 < pts.length; k += 3) {
      c.beginPath()
      c.moveTo(pts[k][0], pts[k][1])
      c.lineTo(pts[k + 1][0], pts[k + 1][1])
      c.lineTo(pts[k + 2][0], pts[k + 2][1])
      c.stroke()
    }
    c.globalAlpha = 1
    c.fillStyle = shade(star, -0.1)
    c.beginPath()
    c.arc(W * 0.82, H * 0.2, H * 0.06, 0, PI * 2)
    c.fill()
  }, { y: 2.5, z: -0.3 }))
  return fitGroup(g, STAR_MOUNT)
}

/** 地图卷轴（摊开）：[纸色, 墨色, 轴木] */
export function mapScroll(p: string[]) {
  const [paper, ink, wood] = p
  const g = new THREE.Group()
  g.add(sheet(36, 26, paper, 0, 0, 0, 0.2))
  g.add(paintTop(35, 25, `int-map-${paper}-${ink}`, (c, W, H) => {
    const r = rng(5)
    c.fillStyle = paper
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(paper, -0.12)
    for (let k = 0; k < 4; k++) {
      const cx = W * (0.2 + k * 0.2 + r() * 0.08)
      const cy = H * (0.3 + r() * 0.4)
      for (let j = 0; j < 6; j++) {
        c.beginPath()
        c.ellipse(cx + (r() - 0.5) * W * 0.12, cy + (r() - 0.5) * H * 0.2, W * (0.04 + r() * 0.05), H * (0.05 + r() * 0.08), r() * PI, 0, PI * 2)
        c.fill()
      }
    }
    c.strokeStyle = ink
    c.lineWidth = Math.max(1, W * 0.004)
    c.setLineDash([W * 0.012, W * 0.01])
    c.beginPath()
    c.moveTo(W * 0.15, H * 0.75)
    c.bezierCurveTo(W * 0.35, H * 0.2, W * 0.6, H * 0.9, W * 0.82, H * 0.35)
    c.stroke()
    c.setLineDash([])
    c.strokeStyle = '#c8473a'
    c.lineWidth = W * 0.008
    const x = W * 0.82
    const y = H * 0.35
    const s = W * 0.02
    c.beginPath()
    c.moveTo(x - s, y - s)
    c.lineTo(x + s, y + s)
    c.moveTo(x + s, y - s)
    c.lineTo(x - s, y + s)
    c.stroke()
    c.strokeStyle = ink
    c.lineWidth = Math.max(1, W * 0.003)
    c.beginPath()
    c.arc(W * 0.12, H * 0.2, H * 0.09, 0, PI * 2)
    c.moveTo(W * 0.12, H * 0.06)
    c.lineTo(W * 0.12, H * 0.34)
    c.moveTo(W * 0.12 - H * 0.14, H * 0.2)
    c.lineTo(W * 0.12 + H * 0.14, H * 0.2)
    c.stroke()
  }, 0, 0.5, 0))
  for (const s of [-1, 1]) {
    g.add(cylZ(2.2, 28, shade(paper, -0.05), s * 19.6, 2.2, 0, 20))
    for (const z of [-1, 1]) g.add(cylZ(1, 2.4, wood, s * 19.6, 2.2, z * 15.2, 12))
  }
  return fitGroup(g)
}

/** 参考书堆 + 便签：[书色 1, 书色 2, 便签] */
export function refBooks(p: string[]) {
  const [a, b, note] = p
  const g = new THREE.Group()
  const books: [number, number, number, string, number][] = [
    [26, 4.5, 19, a, 0.02],
    [24, 3.5, 17, b, -0.05],
    [25, 5.5, 18.5, shade(a, -0.15), 0.06],
    [21, 3, 15, shade(b, 0.15), -0.03],
  ]
  let y = 0
  const tabs = [note, C.pink, C.sky, C.mint, C.lemon]
  books.forEach(([w, t, d, c, ry], i) => {
    const bk = bookFlat(w, t, d, c, 0, 0, 0, 0, true)
    for (let k = 0; k < 3 + (i % 2); k++) bk.add(rbox(1.4, 0.1, 2.4, tabs[(i + k) % tabs.length], { x: -w / 2 + 3 + k * (w / 4), y: 0.6 + (k % 3) * (t - 1.2) / 3, z: d / 2 + 0.5 }, 0.04))
    g.add(P(bk, (i % 2) * 1.2 - 0.6, y, 0, 0, ry))
    y += t
  })
  g.add(rbox(7.5, 1, 7.5, note, { x: 4, y, z: 2 }, 0.2))
  g.add(taperRod3([-8, y + 0.5, 4], [4, y + 0.5, -4], 0.5, 0.5, DARK, 8))
  return fitGroup(g)
}

// ---------- 收藏 ----------

/** 唱片封面画 */
function drawSleeve(a: string, b: string, seed: number): Draw {
  return (c, W, H) => {
    const r = rng(seed)
    c.fillStyle = a
    c.fillRect(0, 0, W, H)
    c.fillStyle = b
    c.beginPath()
    c.arc(W * (0.3 + r() * 0.4), H * (0.35 + r() * 0.3), W * 0.28, 0, PI * 2)
    c.fill()
    c.fillStyle = shade(a, -0.25)
    for (let k = 0; k < 5; k++) c.fillRect(0, H * (0.72 + k * 0.05), W, H * 0.02)
    c.fillStyle = '#ffffff'
    c.fillRect(W * 0.08, H * 0.08, W * 0.4, H * 0.05)
  }
}

/** 唱片收藏（一排立着 + 一张封面朝外）：[色 1, 色 2, 书挡] */
export function recordRow(p: string[]) {
  const [a, b, end] = p
  const g = new THREE.Group()
  const r = rng(12)
  const n = 48
  const step = 0.58
  const x0 = (-n * step) / 2
  const pal = [a, b, '#26262a', '#f4efe4', shade(a, 0.2), shade(b, -0.2), C.lemon, '#c8473a']
  for (let i = 0; i < n; i++) g.add(rbox(0.52, 31.4, 31.4, pal[Math.floor(r() * pal.length)], { x: x0 + step / 2 + i * step, z: 0 }, 0.12))
  for (const s of [-1, 1]) {
    g.add(rbox(0.4, 18, 14, end, { x: s * ((n * step) / 2 + 0.25), z: 8 }, 0.15))
    g.add(rbox(5, 0.4, 14, end, { x: s * ((n * step) / 2 + 2.7), z: 8 }, 0.15))
  }
  const cover = G(rbox(31.4, 31.4, 0.5, a, {}, 0.12), paintPanel(30.6, 30.6, `int-sleeve-${a}-${b}`, drawSleeve(a, b, 3), { y: 0.4, z: 0.3 }))
  cover.add(P(cyl(15, 15, 0.3, '#1e1e22', {}, 32), 6, 15.7, -0.05, PI / 2))
  g.add(P(cover, 0, 0, 15.7 + 31.4 * Math.sin(0.08) + 0.6, -0.08))
  return fitGroup(g)
}

/** 黑胶唱片架（2×2 格，塞满唱片）：[柜体, 唱片色 1, 唱片色 2] */
export function vinylRack(p: string[]) {
  const [body, a, b] = p
  const g = new THREE.Group()
  const T = 2
  const IN = 34
  const W = T * 3 + IN * 2
  const legH = 5
  const H = legH + T * 3 + IN * 2
  const D = 36
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.3, legH, shade(body, -0.2), { x: sx * (W / 2 - 4), z: sz * (D / 2 - 4) }, 10))
  g.add(rbox(W, T, D, body, { y: legH }, 0.6))
  g.add(rbox(W - T * 2, T, D - 1, body, { y: legH + T + IN, z: 0.5 }, 0.5))
  g.add(rbox(W, T, D, body, { y: H - T }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(T, H - legH - T * 2, D, body, { x: s * (W / 2 - T / 2), y: legH + T }, 0.5))
  g.add(rbox(T, H - legH - T * 2, D - 1, body, { y: legH + T, z: 0.5 }, 0.5))
  g.add(rbox(W - T * 2, H - legH - T * 2, 1, shade(body, -0.06), { y: legH + T, z: -D / 2 + 0.5 }, 0.3))
  const r = rng(4)
  const pal = [a, b, '#26262a', '#f4efe4', shade(a, 0.2), shade(b, -0.2), C.lemon, '#c8473a']
  for (let cx = 0; cx < 2; cx++)
    for (let cy = 0; cy < 2; cy++) {
      const x0 = -W / 2 + T + cx * (IN + T)
      const y0 = legH + T + cy * (IN + T)
      const n = 18 + Math.floor(r() * 8)
      for (let i = 0; i < n; i++) g.add(rbox(1, 31.4, 31.4, pal[Math.floor(r() * pal.length)], { x: x0 + 1 + i * 1.08, y: y0, z: 1 }, 0.15))
      const lean = G(rbox(1, 31.4, 31.4, pal[Math.floor(r() * pal.length)], { x: -0.5 }, 0.15))
      g.add(P(lean, x0 + IN - 0.3, y0, 1, 0, 0, 0.2))
    }
  return g
}

/** 奖杯·杯形：[底座, 金属, 铭牌] */
export function trophyCup(p: string[]) {
  const [base, metal, plate] = p
  const g = new THREE.Group()
  g.add(rbox(14, 3, 10, base, {}, 0.6), rbox(11, 3, 8, shade(base, 0.08), { y: 3 }, 0.6))
  g.add(noOutline(rbox(6, 1.6, 0.2, plate, { y: 0.8, z: 5.05 }, 0.05)))
  g.add(cyl(1, 2.4, 3, metal, { y: 6 }, 16), ball(1.6, metal, { y: 10 }), cyl(0.8, 1.2, 3, metal, { y: 11 }, 12))
  g.add(cup(6.5, 2.4, 10, 0.4, metal, { y: 13.5 }))
  for (const s of [-1, 1]) g.add(torus(3, 0.5, metal, { x: s * 6.2, y: 19, rz: -s * PI / 2 }, PI))
  return g
}

/** 奖杯·星形：[底座, 金属, 铭牌] */
export function trophyStar(p: string[]) {
  const [base, metal, plate] = p
  const g = new THREE.Group()
  g.add(rbox(10, 3, 7, base, {}, 0.6))
  g.add(noOutline(rbox(5, 1.4, 0.2, plate, { y: 0.8, z: 3.55 }, 0.05)))
  g.add(cyl(1, 1.4, 11, metal, { y: 3 }, 12))
  const R0 = 6
  const pts: V2[] = []
  for (let k = 0; k < 10; k++) {
    const a = PI / 2 + (k / 10) * PI * 2
    const rr = k % 2 ? R0 * 0.42 : R0
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  g.add(P(flat(pts, 1.8, metal, false, 0.4), 0, 14 + R0 * 0.81 - 1.2, 0))
  return g
}

/** 奖杯·小立柱：[底座, 金属, 铭牌] */
export function trophyColumn(p: string[]) {
  const [base, metal, plate] = p
  const g = new THREE.Group()
  g.add(rbox(8, 2, 8, base, {}, 0.5))
  g.add(rbox(4.4, 12, 4.4, shade(base, 0.1), { y: 2 }, 0.4))
  g.add(noOutline(rbox(3, 2, 0.2, plate, { y: 6, z: 2.25 }, 0.05)))
  g.add(cyl(0.7, 1.5, 1.5, metal, { y: 14 }, 12))
  g.add(cup(3, 1, 4, 0.3, metal, { y: 15.5 }))
  return g
}

export const MEDAL_MOUNT = 140
/** 奖牌挂架：[挂板, 缎带 1, 缎带 2] */
export function medalRack(p: string[]) {
  const [plate, r1, r2] = p
  const g = new THREE.Group()
  g.add(rbox(60, 8, 1.2, plate, { y: 28.5 }, 0.4))
  g.add(paintPanel(56, 5, `int-medal-plate-${plate}`, (c, W, H) => {
    c.fillStyle = plate
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(plate, -0.3)
    for (let k = 0; k < 5; k++) {
      c.beginPath()
      const cx = W * (0.1 + k * 0.2)
      c.arc(cx, H / 2, H * 0.22, 0, PI * 2)
      c.fill()
    }
    c.fillRect(0, H * 0.46, W, H * 0.08)
  }, { y: 30, z: 0.9 }))
  const metals = [GOLD, '#c9ced6', '#c8875a', GOLD, '#c9ced6']
  for (let i = 0; i < 5; i++) {
    const x = -24 + i * 12
    g.add(taperRod3([x, 29, 0.4], [x, 29, 2.4], 0.35, 0.35, METAL, 6))
    const rc = i % 2 ? r2 : r1
    const len = 14 + (i % 3) * 3
    for (const s of [-1, 1]) g.add(P(G(rbox(2.2, len, 0.2, s > 0 ? rc : shade(rc, -0.12), { y: -len }, 0.05)), x + s * 1.1, 29.5, 1.8 + (s > 0 ? 0.25 : 0), 0, 0, -s * 0.08))
    const my = 29.5 - len - 3.2
    g.add(cylZ(3.4, 0.6, metals[i], x, my, 2.2))
    g.add(noOutline(cylZ(2.4, 0.2, shade(metals[i], -0.12), x, my, 2.6, 20)))
  }
  return fitGroup(g, MEDAL_MOUNT)
}

/** 明信片画 */
function drawPostcard(kind: number, a: string, b: string): Draw {
  if (kind === 0) return paintLandscape(a, b, '#ffd27a')
  return (c, W, H) => {
    c.fillStyle = a
    c.fillRect(0, 0, W, H)
    if (kind === 1) {
      c.fillStyle = b
      c.fillRect(0, H * 0.6, W, H * 0.4)
      c.fillStyle = '#ffffff'
      for (let k = 0; k < 3; k++) c.fillRect(0, H * (0.68 + k * 0.1), W, H * 0.02)
      c.fillStyle = '#ffb36b'
      c.beginPath()
      c.arc(W * 0.5, H * 0.6, H * 0.22, PI, 0)
      c.fill()
    } else if (kind === 2) {
      c.fillStyle = b
      for (let k = 0; k < 7; k++) {
        const h = H * (0.3 + ((k * 37) % 50) / 100)
        c.fillRect(W * (k / 7), H - h, W / 7 - W * 0.01, h)
      }
      c.fillStyle = '#fff2b8'
      for (let k = 0; k < 12; k++) c.fillRect(W * ((k * 0.083) % 1) + W * 0.02, H * (0.72 + (k % 3) * 0.08), W * 0.02, H * 0.03)
    } else {
      c.fillStyle = b
      c.beginPath()
      c.moveTo(0, H)
      c.lineTo(W * 0.5, H * 0.25)
      c.lineTo(W, H)
      c.fill()
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.moveTo(W * 0.38, H * 0.47)
      c.lineTo(W * 0.5, H * 0.25)
      c.lineTo(W * 0.62, H * 0.47)
      c.fill()
      c.fillStyle = '#ff8f86'
      c.beginPath()
      c.arc(W * 0.8, H * 0.22, H * 0.1, 0, PI * 2)
      c.fill()
    }
  }
}

export const POSTCARD_MOUNT = 110
/** 明信片墙（铁丝网格 + 夹子 + 串灯）：[网格, 夹子, 灯] */
export function postcardWall(p: string[]) {
  const [grid, clip, light] = p
  const g = new THREE.Group()
  const W = 90
  const H = 60
  for (let i = 0; i <= 6; i++) g.add(taperRod3([-W / 2, i * 10, 0], [W / 2, i * 10, 0], 0.25, 0.25, grid, 6))
  for (let i = 0; i <= 9; i++) g.add(taperRod3([-W / 2 + i * 10, 0, 0.5], [-W / 2 + i * 10, H, 0.5], 0.25, 0.25, grid, 6))
  const cards: [number, number, boolean, number, string, string][] = [
    [-30, 44, true, 0, '#a8d4f4', '#78c47a'],
    [-8, 47, false, 1, '#ffc6a0', '#3d5a80'],
    [16, 44, true, 2, '#3d4a6a', '#26262a'],
    [34, 40, false, 3, '#cfe8f5', '#9fb4c7'],
    [-33, 18, false, 1, '#ffe08f', '#2f8f8a'],
    [-10, 20, true, 3, '#ffd6e0', '#a9bfa3'],
    [14, 16, true, 0, '#fff1dc', '#e2702f'],
  ]
  cards.forEach(([x, y, land, kind, a, b], i) => {
    const w = land ? 14.8 : 10
    const h = land ? 10 : 14.8
    const card = G(rbox(w, h, 0.2, '#ffffff', { y: -h / 2 }, 0.05), paintPanel(w - 1, h - 1, `int-postcard-${i}-${a}`, drawPostcard(kind, a, b), { y: -h / 2 + 0.5, z: 0.4 }))
    card.add(rbox(1.2, 3, 0.8, clip, { y: h / 2 - 2 }, 0.2))
    g.add(P(card, x, y, 1.1, 0, 0, ((i % 3) - 1) * 0.06))
  })
  const n = 12
  for (let i = 0; i < n; i++) {
    const t0 = i / n
    const t1 = (i + 1) / n
    const yA = H - 3 - Math.sin(t0 * PI) * 7
    const yB = H - 3 - Math.sin(t1 * PI) * 7
    g.add(noOutline(taperRod3([-W / 2 + t0 * W, yA, 1.6], [-W / 2 + t1 * W, yB, 1.6], 0.12, 0.12, DARK, 4)))
    if (i > 0) g.add(litOutlined(ball(0.9, light, { x: -W / 2 + t0 * W, y: yA - 1, z: 1.6 }, [1, 1.3, 1]), light, 0.8))
  }
  return fitGroup(g, POSTCARD_MOUNT)
}

/** 多肉组合（木托盘 + 四个小盆）：[托盘, 盆色, 多肉色] */
export function succulentSet(p: string[]) {
  const [wood, pot, leafC] = p
  const g = new THREE.Group()
  g.add(tray(32, 3, 12, 0.8, wood))
  const xs = [-11.5, -4, 3.5, 11]
  xs.forEach((x, i) => {
    const pc = i % 2 ? pot : shade(pot, -0.12)
    g.add(cup(3.2, 2.6, 5.5, 0.4, pc, { x, y: 0.8 }))
    g.add(cyl(2.85, 2.85, 0.4, SOIL, { x, y: 5.6 }, 16))
  })
  const ry = 6
  // 莲座
  for (let ring = 0; ring < 3; ring++) {
    const n = 5 + ring * 2
    for (let k = 0; k < n; k++) g.add(petal(3.4 - ring * 0.8, shade(leafC, ring * 0.06), xs[0], ry, 0, (k / n) * PI * 2 + ring * 0.4, 0.35 + ring * 0.35, 0.55, 0.25))
  }
  // 小仙人掌
  g.add(capsule(1.5, 4, '#5aa36a', { x: xs[1], y: ry - 0.4 }))
  g.add(capsule(0.8, 1.6, '#5aa36a', { x: xs[1] + 1.6, y: ry + 1.6, rz: -0.5 }))
  g.add(ball(0.7, C.pink, { x: xs[1], y: ry + 6.7 }))
  // 十二卷
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2
    g.add(P(cyl(0.01, 0.6, 4, shade(leafC, -0.18), {}, 6), xs[2] + Math.cos(a) * 0.9, ry + 1.6, Math.sin(a) * 0.9, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4))
  }
  // 球形
  g.add(ball(2.2, shade(leafC, 0.1), { x: xs[3], y: ry + 1.8 }, [1, 0.9, 1]))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(noOutline(ball(2.2, shade(leafC, -0.05), { x: xs[3] + Math.cos(a) * 0.2, y: ry + 1.8, z: Math.sin(a) * 0.2 }, [0.25, 0.9, 1.02]).rotateY(a)))
  }
  g.add(ball(0.6, C.lemon, { x: xs[3], y: ry + 3.9 }))
  return fitGroup(g)
}

/** 矿石标本盒（4×3 格）：[木盒, 点缀, 衬底] */
export function mineralBox(p: string[]) {
  const [wood, acc, pad] = p
  const g = new THREE.Group()
  g.add(tray(30, 3.5, 22, 0.8, wood))
  for (const x of [-7.1, 0, 7.1]) g.add(rbox(0.5, 3, 20.4, wood, { x, y: 0.8 }, 0.15))
  for (const z of [-3.5, 3.5]) g.add(rbox(28.4, 3, 0.5, wood, { y: 0.8, z }, 0.15))
  const minerals = ['#c7a3ff', '#ffffff', '#ffd27a', '#9fd8e8', acc, '#ff9fb4', '#6a6d74', '#b8e0a0', '#e2b74a', '#d65a3c', '#bfe6ff', shade(acc, 0.2)]
  const r = rng(9)
  for (let i = 0; i < 12; i++) {
    const cx = -10.6 + (i % 4) * 7.1
    const cz = -7 + Math.floor(i / 4) * 7
    g.add(rbox(5.6, 0.4, 5.4, pad, { x: cx, y: 0.8, z: cz }, 0.15))
    const c = minerals[i]
    const kind = i % 4
    if (kind === 0) {
      for (let k = 0; k < 4; k++) {
        const h = 2.6 + r() * 1.6
        g.add(P(cyl(0.01, 0.7, h, c, {}, 6), cx + (k - 1.5) * 0.9, 1.2 + h / 2 - 0.3, cz + (k % 2) * 0.6, (r() - 0.5) * 0.5, 0, (k - 1.5) * 0.25))
      }
    } else if (kind === 1) {
      g.add(ball(1.8, '#8a7a6a', { x: cx, y: 1.2, z: cz }, [1, 0.7, 1]))
      g.add(noOutline(ball(1.3, c, { x: cx, y: 2.25, z: cz }, [1, 0.25, 1])))
    } else if (kind === 2) {
      g.add(ball(1.6, c, { x: cx, y: 2.2, z: cz }, [1.2, 0.65, 0.9]))
    } else {
      g.add(P(rbox(2, 2, 2, c, {}, 0.15), cx, 1.2, cz, 0, 0.5))
      g.add(P(rbox(1.2, 1.2, 1.2, c, {}, 0.1), cx + 1.4, 1.2, cz + 0.8, 0, 0.2))
    }
  }
  return g
}

// ---------- 生活气息 ----------

/** 猫抓板（波浪形）+ 逗猫棒 + 玩具老鼠：[纸板, 逗猫棒, 羽毛] */
export function catToys(p: string[]) {
  const [card, wand, feather] = p
  const g = new THREE.Group()
  const top = (x: number) => 5 + 4 * (x / 24) ** 2
  const pts: V2[] = [[-24, 0], [24, 0]]
  for (let i = 0; i <= 24; i++) {
    const x = 24 - (i / 24) * 48
    pts.push([x, top(x)])
  }
  g.add(flat(pts, 22, card, false, 0.6))
  for (const s of [-1, 1]) g.add(rbox(48.4, 3, 0.4, shade(card, -0.3), { y: 0.5, z: s * 11.1 }, 0.1))
  for (let i = 0; i < 9; i++) {
    const x = -20 + i * 5
    g.add(noOutline(rbox(0.3, 0.1, 21, shade(card, -0.15), { x, y: top(x) + 0.05 }, 0.04)))
  }
  g.add(ball(1.5, '#9aa0a8', { x: 0, y: 6.3, z: 2 }, [1, 0.8, 1.5]))
  for (const s of [-1, 1]) g.add(noOutline(ball(0.6, C.pink, { x: s * 0.8, y: 7.5, z: 3.4 }, [1, 1, 0.3])))
  g.add(noOutline(taperRod3([0, 5.6, -0.2], [2, 5.4, -3.5], 0.12, 0.08, C.pink, 4)))
  g.add(taperRod3([-24, 0.5, 15], [14, 0.5, 13], 0.5, 0.4, wand, 8))
  g.add(noOutline(taperRod3([14, 0.4, 13], [20, 0.3, 17], 0.08, 0.08, '#ffffff', 4)))
  g.add(ball(1.6, feather, { x: 21, y: 1.6, z: 17.5 }))
  for (let k = 0; k < 4; k++) g.add(petal(5, k % 2 ? feather : shade(feather, 0.2), 21.5, 1.2, 17.5, -0.8 + k * 0.5, 0.25, 0.3, 0.12))
  return fitGroup(g)
}

/** 旅行箱（立放）：[箱色, 点缀, 贴纸] */
export function suitcaseStand(p: string[]) {
  const [main, acc, sticker] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(40, 60, 11.6, main, { y: 4, z: s * 6.2 }, 3))
  g.add(rbox(39, 59, 1.4, DARK, { y: 4.5 }, 0.5))
  for (const x of [-12, -4, 4, 12]) g.add(rbox(2, 52, 0.6, shade(main, -0.06), { x, y: 8, z: 12.1 }, 0.3))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(3, 2.6, 3.6, DARK, { x: sx * 16.5, y: 2.4, z: sz * 8.5 }, 0.6))
      g.add(cylX(1.8, 1.4, RUBBER, sx * 16.5, 1.8, sz * 8.5, 14))
    }
  g.add(rbox(20, 1, 4, DARK, { y: 64, z: -8 }, 0.4))
  for (const s of [-1, 1]) g.add(cyl(0.6, 0.6, 6, METAL, { x: s * 8, y: 64.5, z: -8 }, 8))
  g.add(rbox(19, 2, 3, DARK, { y: 70, z: -8 }, 0.8))
  g.add(rbox(12, 1.5, 3, acc, { y: 64.4, z: 3 }, 0.6))
  g.add(rbox(1, 3, 10, acc, { x: 20.3, y: 40 }, 0.4))
  g.add(P(rbox(0.3, 6, 4, sticker, {}, 0.1), 20.9, 32, 2, 0, 0, 0.08))
  for (const [x, y, r, c] of [[-10, 50, 3, sticker], [6, 22, 2.4, acc], [11, 54, 2, C.white]] as [number, number, number, string][]) g.add(noOutline(cylZ(r, 0.2, c, x, y, 12.55, 20)))
  return fitGroup(g)
}

/** 旅行箱（打开平放）：[箱色, 内衬, 衣物] */
export function suitcaseOpen(p: string[]) {
  const [main, lining, cloth] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(tray(40, 11, 62, 1.4, main, { x: s * 20.6 }))
    g.add(rbox(37, 0.6, 59, lining, { x: s * 20.6, y: 1.4 }, 0.2))
  }
  g.add(cylZ(0.9, 60, DARK, 0, 1.2, 0, 10))
  const folds: [number, number, string][] = [[-14, -15, cloth], [-14, 6, shade(cloth, 0.2)], [-28, -10, C.white], [-28, 12, shade(cloth, -0.15)]]
  for (const [x, z, c] of folds) for (let k = 0; k < 2; k++) g.add(rbox(14, 2.6, 18, k ? shade(c, 0.05) : c, { x, y: 2 + k * 2.6, z }, 1))
  g.add(P(capsule(3, 10, C.sky), -21, 5, 25, 0, 0, PI / 2))
  g.add(ghostOutlined(rbox(36, 4, 28, '#9fb4c7', { x: 20.6, y: 2, z: -14 }, 0.8), '#9fb4c7', 0.45))
  g.add(rbox(14, 3, 10, C.pink, { x: 16, y: 2, z: -14 }, 1))
  for (const s of [-1, 1]) g.add(noOutline(P(rbox(1.6, 0.3, 36, DARK, {}, 0.1), 20.6, 2.2, 14, 0, s * 0.5)))
  for (const s of [-1, 1]) g.add(cylX(1.8, 1.4, RUBBER, -20.6 + s * 14, 3, -32.6, 14))
  return fitGroup(g)
}

export const RAINCOAT_MOUNT = 95
/** 雨衣（挂在墙钩上）：[雨衣, 扣子, 墙钩] */
export function raincoat(p: string[]) {
  const [coat, btn, hook] = p
  const g = new THREE.Group()
  const top = 92
  g.add(rbox(5, 7, 1.2, hook, { y: top - 4, z: 0.6 }, 0.4))
  g.add(taperRod3([0, top - 1.5, 1.2], [0, top - 2, 6], 0.5, 0.5, hook, 8))
  g.add(ball(0.8, hook, { y: top - 1.6, z: 6.2 }))
  g.add(torus(1.4, 0.3, coat, { y: top - 3, z: 5.5 }))
  g.add(taperRod3([0, top - 4.2, 5.6], [0, top - 12, 7.5], 0.6, 0.6, shade(coat, -0.1), 6))
  g.add(ball(8, shade(coat, -0.06), { y: top - 22, z: 3.5 }, [1, 1.1, 0.5]))
  const coatBody = cyl(13, 20, 68, coat, { y: top - 84, z: 9 }, 24)
  coatBody.scale.z = 0.45
  g.add(coatBody)
  g.add(ball(13.5, coat, { y: top - 17, z: 9 }, [1, 0.45, 0.45]))
  for (const s of [-1, 1]) g.add(P(capsule(3.4, 44, shade(coat, -0.05)), s * 15.5, top - 44, 9, 0, 0, s * 0.1))
  for (let k = 0; k < 5; k++) {
    const y = top - 26 - k * 12
    const rr = 13 + ((top - 16 - y) / 68) * 7
    g.add(ball(0.9, btn, { x: 1.2, y, z: 9 + rr * 0.45 + 0.2 }, [1, 1, 0.5]))
  }
  for (const s of [-1, 1]) g.add(noOutline(rbox(7, 1.2, 0.4, shade(coat, -0.12), { x: s * 8, y: top - 62, z: 9 + 18 * 0.45 + 0.4 }, 0.2)))
  return fitGroup(g, RAINCOAT_MOUNT)
}

/** 一个快递纸箱：底面中心 */
function carton(w: number, h: number, d: number, color: string, seed: number) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, color, {}, 0.6))
  const tape = shade(color, 0.12)
  g.add(rbox(5, 0.25, d + 0.2, tape, { y: h - 0.1 }, 0.08))
  for (const s of [-1, 1]) g.add(rbox(5, 6, 0.25, tape, { y: h - 6, z: s * (d / 2 + 0.05) }, 0.08))
  g.add(rbox(10, 6.5, 0.2, '#ffffff', { x: w / 4, y: h * 0.4, z: d / 2 + 0.05 }, 0.05))
  g.add(paintPanel(9, 5.5, `int-label-${seed}`, (c, W, H) => {
    const r = rng(seed)
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#26262a'
    for (let k = 0; k < 4; k++) c.fillRect(W * 0.06, H * (0.1 + k * 0.12), W * (0.3 + r() * 0.5), H * 0.05)
    for (let x = W * 0.06; x < W * 0.94; x += W * 0.025) if (r() > 0.35) c.fillRect(x, H * 0.66, W * 0.012, H * 0.26)
  }, { x: w / 4, y: h * 0.4 + 0.5, z: d / 2 + 0.4 }))
  g.add(noOutline(rbox(w * 0.3, 0.1, 0.1, '#5a4646', { x: -w / 4, y: h * 0.75, z: d / 2 + 0.02 }, 0.03)))
  return g
}

/** 快递纸箱堆：n = 1 / 2 / 3 箱 [纸板色] */
export const cartons = (n: number) => (p: string[]) => {
  const c = p[0]
  const g = new THREE.Group()
  const spec: [number, number, number, number][] = n === 1 ? [[34, 20, 24, 0]] : n === 2 ? [[45, 30, 35, 0], [34, 20, 24, 0.1]] : [[55, 35, 40, 0], [45, 30, 35, -0.06], [34, 20, 24, 0.12]]
  let y = 0
  spec.forEach(([w, h, d, ry], i) => {
    g.add(P(carton(w, h, d, i % 2 ? shade(c, 0.05) : c, n * 10 + i), 0, y, 0, 0, ry))
    y += h
  })
  return fitGroup(g)
}

/** 零食堆：薯片袋 + 饼干棒 + 糖果 + 杯面 [袋色, 盒色, 点缀] */
export function snackPile(p: string[]) {
  const [bag, box, acc] = p
  const g = new THREE.Group()
  // 薯片袋：P 会覆盖 rbox 自带的位置，所以这里直接给袋子中心高度 2.25（底面贴地）
  g.add(P(rbox(16, 4.5, 22, bag, {}, 2.2), 0, 2.25, 0, 0, 0.15))
  g.add(P(G(paintTop(11, 13, `int-chips-${bag}-${acc}`, (c, W, H) => {
    c.fillStyle = bag
    c.fillRect(0, 0, W, H)
    c.fillStyle = acc
    c.beginPath()
    c.ellipse(W / 2, H * 0.55, W * 0.35, H * 0.22, 0.3, 0, PI * 2)
    c.fill()
    c.fillStyle = '#ffffff'
    c.fillRect(W * 0.15, H * 0.12, W * 0.7, H * 0.14)
  }, 0, 4.8, 0)), 0, 0, 0, 0, 0.15))
  // 袋子两端的封口压边（包一层 grp 再转，免得 P 把 z 覆盖成 0、两条叠在中间）
  for (const s of [-1, 1]) g.add(P(G(rbox(16.4, 1.4, 1.4, shade(bag, -0.15), { y: 1.6, z: s * 10.8 }, 0.4)), 0, 0, 0, 0, 0.15))
  g.add(rbox(4, 2, 15, box, { x: 12, z: 0 }, 0.3), P(rbox(4, 2, 15, shade(box, 0.15), {}, 0.3), 12.5, 2, 0.5, 0, 0.2))
  const cc = [acc, C.pink, C.sky, C.lemon, C.mint]
  cc.forEach((c, i) => {
    const x = -4 + i * 3
    const z = 13 + (i % 2) * 2
    g.add(ball(1.2, c, { x, y: 1.2, z }, [1.3, 1, 1]))
    for (const s of [-1, 1]) g.add(P(cyl(0.2, 0.9, 1, c, {}, 8), x + s * 2, 1.2, z, 0, 0, s * PI / 2))
  })
  g.add(cyl(4.5, 3.4, 9.5, '#ffffff', { x: -14, z: -6 }, 20), puck(4.7, 0.5, METAL, { x: -14, y: 9.5, z: -6 }), cyl(4.15, 3.95, 2.5, acc, { x: -14, y: 5, z: -6 }, 20))
  return fitGroup(g)
}

/** 能量饮料罐堆（3-2-1 金字塔 + 一罐）：[罐色, 条纹, 拉环] */
export function energyCans(p: string[]) {
  const [body, band, top] = p
  const g = new THREE.Group()
  const can = (x: number, y: number, z: number) => {
    g.add(cyl(2.65, 2.65, 13, body, { x, y, z }, 20))
    g.add(cyl(2.3, 2.6, 0.5, top, { x, y: y + 13, z }, 20))
    g.add(cyl(2.4, 2.6, 0.4, top, { x, y: y - 0.0, z }, 20).translateY(0))
    g.add(cyl(2.68, 2.68, 3, band, { x, y: y + 5, z }, 20))
    g.add(noOutline(rbox(1.6, 0.1, 0.8, top, { x, y: y + 13.5, z: z + 0.8 }, 0.05)))
  }
  const hh = 13.5
  for (let i = 0; i < 3; i++) can(-5.4 + i * 5.4, 0, 0)
  for (let i = 0; i < 2; i++) can(-2.7 + i * 5.4, hh, 0)
  can(0, hh * 2, 0)
  can(9.5, 0, 5)
  return fitGroup(g)
}

/** 咖啡豆罐：铁罐 + 陶罐 + 玻璃罐 + 量勺 [铁罐, 陶罐, 标签] */
export function coffeeCanisters(p: string[]) {
  const [tin, ceramic, label] = p
  const g = new THREE.Group()
  const BEAN = '#6b4128'
  g.add(cyl(5, 5, 14, tin, { x: -9 }, 24), puck(5.2, 2, shade(tin, -0.1), { x: -9, y: 13.5 }), cyl(5.05, 5.05, 5, label, { x: -9, y: 4 }, 24))
  g.add(cyl(4.5, 4.5, 11, ceramic, { x: 1.5, z: -1 }, 24), puck(4.6, 1.6, J.wood, { x: 1.5, y: 11, z: -1 }), ball(0.9, J.wood, { x: 1.5, y: 13, z: -1 }))
  const gx = 11
  g.add(cyl(3.7, 3.7, 8, BEAN, { x: gx, y: 0.3, z: 1 }, 20))
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9
    g.add(ball(0.7, BEAN, { x: gx + Math.cos(a) * 2.2, y: 8.4, z: 1 + Math.sin(a) * 2.2 }, [1, 0.6, 1.3]))
  }
  g.add(ghostOutlined(cyl(4, 4, 12, GLASS, { x: gx, z: 1 }, 20), GLASS, 0.3))
  g.add(puck(4.2, 1.4, METAL, { x: gx, y: 12, z: 1 }))
  g.add(cup(1.8, 1.6, 1.6, 0.2, METAL, { x: -2, z: 7 }))
  g.add(taperRod3([-0.5, 0.9, 7], [5, 0.6, 8.5], 0.35, 0.35, METAL, 6))
  for (let k = 0; k < 4; k++) g.add(ball(0.7, BEAN, { x: -4.5 + k * 1.1, y: 0.4, z: 9.5 + (k % 2) }, [1, 0.6, 1.3]))
  return fitGroup(g)
}

// ---------- 钓鱼 ----------

/** 钓竿沿线的点：底端在原点，往 -z 后仰 lean，竿梢最后 30% 往前垂 bend */
function rodPath(L: number, lean: number, bend: number, n = 16): V3[] {
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const k = s > 0.7 ? ((s - 0.7) / 0.3) ** 2 : 0
    pts.push([0, s * L * Math.cos(lean) - k * bend * 0.3, -s * L * Math.sin(lean) + k * bend])
  }
  return pts
}

/** 一根钓竿（沿给定路径）：握把、卷线器、导环 [竿色, 握把, 卷线器] */
function rodAlong(pts: V3[], blank: string, grip: string, reel: string, sea: boolean) {
  const g = new THREE.Group()
  g.add(taperPath(pts, sea ? 1.1 : 0.8, 0.12, blank, 8))
  const at = (s: number): THREE.Vector3 => {
    const f = s * (pts.length - 1)
    const i = Math.min(pts.length - 2, Math.floor(f))
    return new THREE.Vector3(...pts[i]).lerp(new THREE.Vector3(...pts[i + 1]), f - i)
  }
  const gripLen = sea ? 0.2 : 0.14
  const a = at(0.01)
  const b = at(gripLen)
  g.add(taperRod3([a.x, a.y, a.z], [b.x, b.y, b.z], sea ? 1.6 : 1.3, sea ? 1.4 : 1.1, grip, 12))
  g.add(ball(sea ? 1.7 : 1.4, DARK, { x: a.x, y: Math.max(a.y, sea ? 1.7 : 1.4), z: a.z }))
  // 卷线器：挂在竿的前面（+z 侧，即离墙一侧）
  const rp = at(gripLen + 0.02)
  const rr = sea ? 4.2 : 3
  g.add(taperRod3([rp.x, rp.y, rp.z], [rp.x, rp.y - 0.5, rp.z + 3.5], 0.5, 0.5, reel, 8))
  g.add(P(cyl(rr, rr, sea ? 4 : 3, reel, {}, 20), rp.x, rp.y - 0.8, rp.z + 3.5 + rr * 0.6, 0, 0, PI / 2))
  g.add(cylX(rr * 0.6, sea ? 4.6 : 3.4, shade(reel, -0.2), rp.x, rp.y - 0.8, rp.z + 3.5 + rr * 0.6, 14))
  g.add(cylX(0.3, 3, METAL, rp.x + (sea ? 3.5 : 2.6), rp.y - 0.8, rp.z + 3.5 + rr * 0.6, 6))
  // 导环
  for (const s of [0.36, 0.5, 0.62, 0.72, 0.8, 0.87, 0.93, 0.98]) {
    const c = at(s)
    const r = 0.5 + (1 - s) * (sea ? 2.4 : 1.6)
    g.add(noOutline(P(torus(r, 0.12, METAL, {}), c.x, c.y, c.z + r + 0.3, PI / 2)))
  }
  return g
}

/** 钓竿（靠墙立着）：底端贴地、上端靠墙、竿梢略弯 */
export const rodStanding = (sea: boolean) => (p: string[]) => {
  const L = sea ? 240 : 195
  const lean = sea ? 0.075 : 0.085
  const g = rodAlong(rodPath(L, lean, sea ? 7 : 6), p[0], p[1], p[2], sea)
  return fitGroup(g)
}

/** 竿袋（平放）：[袋色, 拉链, 带子] */
export const rodBag = (sea: boolean) => (p: string[]) => {
  const [bag, zip, strap] = p
  const L = sea ? 150 : 128
  const g = new THREE.Group()
  g.add(rbox(L, 10, 14, bag, {}, 4.5))
  g.add(noOutline(rbox(L - 8, 0.3, 0.8, zip, { y: 9.9, z: 2 }, 0.1)))
  g.add(rbox(10, 2.4, 8, shade(bag, -0.12), { x: L / 2 - 8, y: 1, z: 0 }, 1).translateY(0))
  g.add(rbox(30, 7, 1.6, shade(bag, -0.1), { x: -L / 4, y: 1.5, z: 7.4 }, 1.2))
  g.add(rbox(16, 1.2, 3, strap, { y: 10 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2.4, 1, 14.4, strap, { x: s * (L / 2 - 14), y: 4 }, 0.4))
  g.add(noOutline(taperRod3([-(L / 2 - 14), 5, 7.3], [L / 2 - 14, 5, 7.3], 0.5, 0.5, strap, 6)))
  return fitGroup(g)
}

export const ROD_RACK_MOUNT = 150
/** 壁挂钓竿架（横挂 3 根）：[支架木, 竿色, 卷线器] */
export function rodRack(p: string[]) {
  const [wood, blank, reel] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(6, 34, 2, wood, { x: s * 55, z: 1 }, 0.8))
    for (let k = 0; k < 3; k++) {
      g.add(rbox(6, 1.6, 7, wood, { x: s * 55, y: 4 + k * 11, z: 5 }, 0.5))
      g.add(rbox(6, 2.2, 1.2, wood, { x: s * 55, y: 4 + k * 11, z: 8 }, 0.4))
    }
  }
  const lens = [196, 210, 182]
  const cols = [blank, shade(blank, 0.15), shade(blank, -0.15)]
  for (let k = 0; k < 3; k++) {
    const L = lens[k]
    const y = 5.6 + 1 + k * 11
    const pts: V3[] = [[-L / 2, 0, 0], [L / 2, 0, 0]]
    const rod = rodAlong(pts, cols[k], k === 1 ? '#3a3b40' : '#c8a070', reel, k === 1)
    g.add(P(rod, 0, y, 5.5))
  }
  return fitGroup(g, ROD_RACK_MOUNT)
}

/** 拟饵：小鱼形 + 钩 */
function lure(color: string, x: number, y: number, z: number, ry = 0) {
  return P(G(ball(0.6, color, { y: 0.6 }, [2.4, 1, 0.9]), noOutline(ball(0.2, '#ffffff', { x: 1, y: 0.75, z: 0.45 })), P(torus(0.35, 0.06, METAL, {}), 0, 0.2, 0.6, 0)), x, y, z, 0, ry)
}

/** 渔具箱：open = 打开（盖子掀到后面，上层隔板里是拟饵）[箱色, 扣件, 拟饵主色] */
export const tackleBox = (open: boolean) => (p: string[]) => {
  const [box, latch, lureC] = p
  const g = new THREE.Group()
  const W = 36
  const D = 20
  if (!open) {
    g.add(rbox(W, 12, D, box, {}, 1.2))
    g.add(rbox(W + 0.4, 6, D + 0.4, shade(box, -0.08), { y: 12 }, 1.2))
    for (const s of [-1, 1]) g.add(rbox(3, 3, 1, latch, { x: s * 11, y: 10.5, z: D / 2 + 0.4 }, 0.4))
    for (const s of [-1, 1]) g.add(rbox(2, 3, 3, DARK, { x: s * 8, y: 18 }, 0.5))
    g.add(rbox(18, 1.6, 3, DARK, { y: 20.4 }, 0.6))
    return fitGroup(g)
  }
  g.add(tray(W, 12, D, 1, box))
  g.add(rbox(W - 2, 1, D - 2, shade(box, 0.15), { y: 9 }, 0.3))
  for (let i = 1; i < 6; i++) g.add(rbox(0.5, 3, D - 2, shade(box, 0.15), { x: -W / 2 + 1 + i * ((W - 2) / 6), y: 9 }, 0.15))
  g.add(rbox(W - 2, 3, 0.5, shade(box, 0.15), { y: 9 }, 0.15))
  const lc = [lureC, C.lemon, '#c8473a', C.sky, C.mint, '#ffffff', shade(lureC, 0.2), C.pink, '#f0a040', C.lilac, lureC, C.lemon]
  for (let i = 0; i < 12; i++) {
    const x = -W / 2 + 1 + ((i % 6) + 0.5) * ((W - 2) / 6)
    const z = i < 6 ? -4.5 : 4.5
    g.add(lure(lc[i], x, 10, z, PI / 2 + (i % 3) * 0.3))
  }
  const lid = G(tray(W, 6, D, 1, shade(box, -0.08), { y: 0, rx: PI }).translateY(6), rbox(W - 2, 0.6, D - 2, shade(box, 0.2), { y: 1 }, 0.3))
  for (let i = 0; i < 6; i++) lid.add(lure(lc[11 - i], -W / 2 + 4 + i * 5.6, 1.6, 0, PI / 2))
  g.add(P(lid, 0, 12, -D / 2, -(PI / 2 + 0.25)).translateZ(0))
  for (const s of [-1, 1]) g.add(rbox(3, 3, 1, latch, { x: s * 11, y: 8.5, z: D / 2 + 0.4 }, 0.4))
  return fitGroup(g)
}

/** 钓鱼冷藏箱：[箱体, 盖, 把手] */
export function fishCooler(p: string[]) {
  const [body, lid, handle] = p
  const g = new THREE.Group()
  g.add(rbox(50, 26, 30, body, {}, 3))
  g.add(rbox(51, 6, 31, lid, { y: 26 }, 2.5))
  g.add(rbox(20, 0.6, 12, shade(lid, -0.1), { x: -10, y: 32 }, 0.3))
  g.add(rbox(12, 2.4, 8, shade(lid, 0.1), { x: 15, y: 31 }, 1))
  for (const s of [-1, 1]) {
    g.add(cylX(1.2, 2, DARK, s * 25.6, 22, 0, 10))
    g.add(taperRod3([s * 26.8, 22, -12], [s * 26.8, 22, 12], 0.9, 0.9, handle, 8))
    g.add(taperRod3([s * 26.2, 22, -12], [s * 26.8, 22, -12], 0.9, 0.9, handle, 8), taperRod3([s * 26.2, 22, 12], [s * 26.8, 22, 12], 0.9, 0.9, handle, 8))
  }
  g.add(rbox(10, 6, 0.6, '#ffffff', { x: -12, y: 8, z: 15.1 }, 0.3))
  g.add(cylZ(1.2, 1.4, DARK, 18, 3, 15.4, 12))
  for (const s of [-1, 1]) g.add(rbox(3, 4, 1.2, DARK, { x: s * 18, y: 24, z: 15.4 }, 0.4))
  return fitGroup(g)
}

/** 折叠钓鱼凳（三脚）：[凳面, 腿] */
export function fishingStool(p: string[]) {
  const [seat, leg] = p
  const g = new THREE.Group()
  const top = 40
  const feet: V2[] = []
  for (let k = 0; k < 3; k++) {
    const a = PI / 2 + (k / 3) * PI * 2
    feet.push([Math.cos(a) * 15, Math.sin(a) * 15])
  }
  for (let k = 0; k < 3; k++) {
    const [fx, fz] = feet[k]
    const [tx, tz] = feet[(k + 1) % 3]
    g.add(taperRod3([fx, 0.8, fz], [-tx * 0.85, top - 1, -tz * 0.85], 0.9, 0.9, leg, 8))
    g.add(ball(1, RUBBER, { x: fx, y: 1, z: fz }))
  }
  const tri = flat(feet.map(([x, z]): V2 => [-x * 0.95, -z * 0.95]), 1.2, seat, true, 0.3)
  g.add(P(tri, 0, top + 0.6, 0, PI / 2))
  return fitGroup(g)
}

/** 鱼篓（竹编，背面平）：[竹色, 盖, 皮带] */
export function fishCreel(p: string[]) {
  const [bamboo, lid, strap] = p
  const g = new THREE.Group()
  const body = cup(13, 10, 22, 1, bamboo)
  body.scale.z = 0.62
  g.add(body)
  for (const y of [5, 10, 15, 19]) {
    const t = torus(10 + (3 * y) / 22 + 0.15, 0.35, shade(bamboo, -0.15), { y, rx: PI / 2 })
    t.scale.y = 0.62
    g.add(t)
  }
  const lidM = puck(13.3, 2, lid, { y: 21.5 })
  lidM.scale.z = 0.62
  g.add(lidM)
  g.add(cup(2.6, 2.2, 2, 0.4, lid, { x: 4, y: 23.3 }))
  g.add(taperRod3([-11.5, 20, 0], [-6, 34, 0], 0.8, 0.8, strap, 8), taperRod3([11.5, 20, 0], [6, 34, 0], 0.8, 0.8, strap, 8), taperRod3([-6, 34, 0], [6, 34, 0], 0.8, 0.8, strap, 8))
  g.add(rbox(3, 3, 0.8, METAL, { y: 17, z: 8.2 }, 0.3))
  return fitGroup(g)
}

/** 抄网（靠墙立着）：[杆色, 网框, 网] */
export function landingNet(p: string[]) {
  const [pole, hoop, net] = p
  const g = new THREE.Group()
  const lean = 0.1
  const L = 120
  const top: V3 = [0, L * Math.cos(lean), -L * Math.sin(lean)]
  g.add(taperRod3([0, 0, 0], top, 1.2, 1, pole))
  g.add(taperRod3([0, 0, 0], [0, 30 * Math.cos(lean), -30 * Math.sin(lean)], 1.6, 1.5, DARK))
  const R = 20
  const hoopG = new THREE.Group()
  hoopG.add(torus(R, 0.6, hoop, { y: R }))
  hoopG.add(taperRod3([0, -2, 0], [0, 1, 0], 1.1, 1.1, hoop, 8))
  const bag = ghostOutlined(cup(R - 0.3, 3, 30, 0.2, net), net, 0.55)
  bag.position.set(0, R, 30)
  bag.rotation.set(-PI / 2, 0, 0)
  hoopG.add(bag)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2
    hoopG.add(noOutline(taperRod3([Math.cos(a) * R, R + Math.sin(a) * R, 0], [Math.cos(a) * 3, R + Math.sin(a) * 3, 30], 0.1, 0.1, shade(net, -0.25), 4)))
  }
  hoopG.position.set(...top)
  hoopG.rotation.x = -lean
  g.add(hoopG)
  return fitGroup(g)
}

// ---------- 桌游扩充：盒子、摆开的桌游、更多棋牌 ----------

/** 贴花：画面贴在表面上方 0.02，用 polygonOffset 防闪（卡牌、骰子这类很薄的东西） */
export function decal<T extends THREE.Mesh>(m: T): T {
  const mat = m.material as THREE.Material
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  mat.polygonOffsetUnits = -2
  return m
}

/** 平放的薄卡片：底面中心在原点，正面画 draw（不给就是纯色背面） */
export function card(w: number, d: number, edge: string, key: string, draw?: Draw, t = 0.1) {
  const g = G(rbox(w, t, d, edge, {}, Math.min(0.04, t * 0.4)))
  if (draw) g.add(decal(paintTop(w - 0.1, d - 0.1, key, draw, 0, t + 0.02, 0)))
  return g
}

/** 一叠卡：n 张高 */
export function cardStack(w: number, d: number, n: number, side: string, top: string, key: string, draw?: Draw) {
  const h = n * 0.08
  const g = G(rbox(w, h, d, side, {}, 0.05))
  if (draw) g.add(decal(paintTop(w - 0.1, d - 0.1, key, draw, 0, h + 0.02, 0)))
  else g.add(decal(paintTop(w - 0.1, d - 0.1, `${key}-plain`, (c, W, H) => {
    c.fillStyle = top
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffff'
    c.lineWidth = W * 0.06
    c.strokeRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84)
  }, 0, h + 0.02, 0)))
  return g
}

/** 骰子点数 */
function drawPips(n: number, face: string, pip: string): Draw {
  const spots: Record<number, V2[]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  }
  return (c, W, H) => {
    c.fillStyle = face
    c.fillRect(0, 0, W, H)
    c.fillStyle = n === 1 && pip === '#26262a' ? '#c8473a' : pip
    for (const [x, y] of spots[n]) {
      c.beginPath()
      c.arc(x * W, y * H, W * (n === 1 ? 0.14 : 0.1), 0, PI * 2)
      c.fill()
    }
  }
}

/** 骰子：顶面 top 点、正面 front 点，底面中心在原点 */
export function die(s: number, face: string, pip: string, top: number, front: number, ry = 0) {
  const g = G(rbox(s, s, s, face, {}, s * 0.16))
  g.add(decal(paintTop(s * 0.84, s * 0.84, `int-pip-${top}-${face}-${pip}`, drawPips(top, face, pip), 0, s + 0.02, 0)))
  g.add(decal(paintPanel(s * 0.84, s * 0.84, `int-pip-${front}-${face}-${pip}`, drawPips(front, face, pip), { y: s * 0.08, z: s / 2 + 0.02 })))
  g.rotation.y = ry
  return g
}

/** 小棋子（圆锥身 + 球头），高约 2.6 */
function pawn(color: string, x: number, y: number, z: number, k = 1) {
  return P(G(cyl(0.45 * k, 0.85 * k, 1.8 * k, color, {}, 14), ball(0.6 * k, color, { y: 2 * k })), x, y, z)
}

/** 小房子（方块 + 四棱锥屋顶） */
function house(color: string, x: number, y: number, z: number, s = 1, ry = 0) {
  return P(G(rbox(1.2 * s, 0.9 * s, 1.2 * s, color, {}, 0.1 * s), cyl(0.01, 1.05 * s, 0.7 * s, shade(color, -0.15), { y: 0.9 * s, ry: PI / 4 }, 4)), x, y, z, 0, ry)
}

/** 桌游盒：盒盖有抽象图案（不写品牌名），底面中心在原点 */
function bgBox(w: number, h: number, d: number, c: string, seed: number) {
  const box = G(
    rbox(w, h, d, c, {}, Math.min(0.4, h * 0.1)),
    rbox(w + 0.1, Math.min(0.5, h * 0.12), d + 0.1, shade(c, -0.15), { y: h * 0.72 }, 0.15),
  )
  box.add(paintTop(w - 0.6, d - 0.6, `int-bgbox-${seed}-${c}-${Math.round(w)}x${Math.round(d)}`, (cv, W, H) => {
    const r = rng(seed)
    cv.fillStyle = c
    cv.fillRect(0, 0, W, H)
    cv.fillStyle = shade(c, 0.22)
    cv.beginPath()
    cv.arc(W * (0.45 + r() * 0.3), H * (0.45 + r() * 0.2), Math.min(W, H) * 0.3, 0, PI * 2)
    cv.fill()
    cv.fillStyle = shade(c, -0.25)
    for (let k = 0; k < 3; k++) cv.fillRect(W * (0.08 + k * 0.13), H * (0.6 - k * 0.1), W * 0.1, H * (0.32 + k * 0.1))
    cv.fillStyle = r() > 0.5 ? '#ffe08f' : '#ffffff'
    for (let k = 0; k < 4; k++) {
      cv.beginPath()
      cv.arc(W * r(), H * (0.3 + r() * 0.6), Math.min(W, H) * 0.04, 0, PI * 2)
      cv.fill()
    }
    cv.fillStyle = '#ffffff'
    cv.fillRect(W * 0.08, H * 0.07, W * 0.62, H * 0.15)
    cv.fillStyle = shade(c, -0.35)
    cv.fillRect(W * 0.12, H * 0.11, W * 0.42, H * 0.07)
  }, 0, h + 0.3, 0))
  return box
}

/** 桌游盒（单个，多种尺寸）[盒色] */
export const bgBoxSingle = (w: number, h: number, d: number, seed: number) => (p: string[]) => bgBox(w, h, d, p[0], seed)

/** 一排竖插的桌游盒（侧面朝前） [色 1, 色 2, 色 3] */
export function bgShelfRow(p: string[]) {
  const g = new THREE.Group()
  const specs: [number, number, number][] = [[7, 30, 30], [8, 30, 30], [6, 27, 27], [9, 30, 30], [5, 22, 22], [7.5, 30, 30], [6.5, 26, 26], [8, 30, 30]]
  const tw = specs.reduce((s, [t]) => s + t + 0.1, 0)
  let x = -tw / 2
  specs.forEach(([t, h, d], i) => {
    const c = shade(p[i % 3], ((i * 7) % 5) * 0.04 - 0.08)
    const b = G(rbox(t, h, d, c, {}, 0.3))
    b.add(paintPanel(t - 0.4, h - 0.6, `int-bgspine-${i}-${c}`, (cv, W, H) => {
      cv.fillStyle = c
      cv.fillRect(0, 0, W, H)
      cv.fillStyle = '#ffffff'
      cv.fillRect(W * 0.18, H * 0.08, W * 0.64, H * 0.45)
      cv.fillStyle = shade(c, -0.3)
      for (let k = 0; k < 3; k++) cv.fillRect(W * 0.3, H * (0.12 + k * 0.12), W * 0.4, H * 0.07)
      cv.fillStyle = shade(c, 0.25)
      cv.beginPath()
      cv.arc(W / 2, H * 0.75, W * 0.3, 0, PI * 2)
      cv.fill()
    }, { y: 0.3, z: d / 2 + 0.3 }))
    g.add(P(b, x + t / 2, 0, (30 - d) / 2))
    x += t + 0.1
  })
  return fitGroup(g)
}

/** 六角地块版图（摆开在玩）：[海, 点缀, 骰子] */
export function bgHex(p: string[]) {
  const [sea, acc, dieC] = p
  const g = new THREE.Group()
  const R = 4.1
  g.add(cyl(21, 21, 0.5, sea, { ry: PI / 6 }, 6))
  const terrain = ['#78c47a', '#4f9e5b', '#e8c55a', '#c8704a', '#a8a8a0', '#d8c890']
  const r = rng(3)
  const centers: V2[] = []
  for (let q = -2; q <= 2; q++)
    for (let rr = -2; rr <= 2; rr++) {
      if (Math.abs(q + rr) > 2) continue
      const x = R * Math.sqrt(3) * (q + rr / 2) * 1.02
      const z = R * 1.5 * rr * 1.02
      centers.push([x, z])
      const t = q === 0 && rr === 0 ? '#e8d8a0' : terrain[Math.floor(r() * terrain.length)]
      g.add(cyl(R, R, 0.6, t, { x, y: 0.5, z }, 6))
      if (q || rr) {
        g.add(puck(1.1, 0.25, IVORY, { x, y: 1.1, z }))
        g.add(noOutline(cyl(0.35, 0.35, 0.05, k2(r()), { x, y: 1.36, z }, 10)))
      }
    }
  function k2(v: number) {
    return v > 0.7 ? '#c8473a' : '#26262a'
  }
  // 小房子与道路（放在地块交界）
  const cols = [acc, '#3d6fb8', '#ffffff']
  for (let k = 0; k < 6; k++) {
    const [x, z] = centers[(k * 5 + 2) % centers.length]
    const a = (k * PI) / 3 + PI / 6
    const hx = x + Math.cos(a) * R
    const hz = z + Math.sin(a) * R
    g.add(house(cols[k % 3], hx, 1.1, hz, 1))
    const a2 = a + PI / 3
    const ex = x + Math.cos(a2) * R
    const ez = z + Math.sin(a2) * R
    const road = rbox(Math.hypot(ex - hx, ez - hz) - 1.4, 0.5, 0.6, cols[k % 3], {}, 0.1)
    g.add(P(G(road), (hx + ex) / 2, 1.1, (hz + ez) / 2, 0, -Math.atan2(ez - hz, ex - hx)))
  }
  g.add(P(die(1.6, dieC, '#26262a', 5, 2, 0.3), 22, 0, 10), P(die(1.6, dieC, '#26262a', 3, 6, -0.4), 24.5, 0, 11.5))
  for (let k = 0; k < 4; k++) g.add(P(cardStack(4.4, 6.6, 6 + k * 2, '#ffffff', terrain[k], `int-hexcard-${k}`), -26 + (k % 2) * 5.2, 0, -8 + Math.floor(k / 2) * 7.4))
  return fitGroup(g)
}

/** 铁路地图版图：[版图底, 火车色 1, 火车色 2] */
export function bgTrain(p: string[]) {
  const [land, t1, t2] = p
  const g = new THREE.Group()
  const BW = 50
  const BD = 34
  g.add(rbox(BW, 0.4, BD, '#ffffff', {}, 0.15))
  const cities: V2[] = [[-20, -12], [-8, -10], [6, -13], [19, -9], [-17, 2], [-3, 0], [12, 1], [21, 8], [-14, 12], [2, 11], [14, 13]]
  const routes: [number, number, string][] = [[0, 1, t1], [1, 2, '#ffffff'], [2, 3, t2], [0, 4, '#ffffff'], [1, 5, t1], [5, 6, t2], [6, 3, '#ffffff'], [4, 8, t2], [5, 9, '#ffffff'], [9, 10, t1], [6, 7, t1], [8, 9, '#ffffff']]
  const toPx = (x: number, z: number, W: number, H: number): V2 => [((x + BW / 2) / BW) * W, ((z + BD / 2) / BD) * H]
  g.add(decal(paintTop(BW - 0.2, BD - 0.2, `int-train-${land}-${t1}-${t2}`, (c, W, H) => {
    c.fillStyle = '#9ccbe8'
    c.fillRect(0, 0, W, H)
    c.fillStyle = land
    c.beginPath()
    c.ellipse(W * 0.5, H * 0.5, W * 0.47, H * 0.44, 0, 0, PI * 2)
    c.fill()
    c.fillStyle = shade(land, -0.08)
    c.beginPath()
    c.ellipse(W * 0.3, H * 0.4, W * 0.15, H * 0.12, 0.4, 0, PI * 2)
    c.fill()
    for (const [a, b, col] of routes) {
      const [x0, y0] = toPx(...cities[a], W, H)
      const [x1, y1] = toPx(...cities[b], W, H)
      const n = 4
      for (let k = 0; k < n; k++) {
        const f0 = (k + 0.1) / n
        const f1 = (k + 0.9) / n
        c.strokeStyle = '#555555'
        c.lineWidth = W * 0.016
        c.beginPath()
        c.moveTo(x0 + (x1 - x0) * f0, y0 + (y1 - y0) * f0)
        c.lineTo(x0 + (x1 - x0) * f1, y0 + (y1 - y0) * f1)
        c.stroke()
        c.strokeStyle = col === '#ffffff' ? '#e8e0c8' : col
        c.lineWidth = W * 0.011
        c.stroke()
      }
    }
    c.fillStyle = '#c8473a'
    for (const [x, z] of cities) {
      const [px, py] = toPx(x, z, W, H)
      c.beginPath()
      c.arc(px, py, W * 0.012, 0, PI * 2)
      c.fill()
    }
  }, 0, 0.42, 0)))
  // 已经占领的路线上摆小火车车厢
  const claimed: [number, number, string][] = [[0, 1, t1], [5, 6, t2], [9, 10, t1], [4, 8, t2]]
  for (const [a, b, col] of claimed) {
    const [x0, z0] = cities[a]
    const [x1, z1] = cities[b]
    const ang = -Math.atan2(z1 - z0, x1 - x0)
    const len = Math.hypot(x1 - x0, z1 - z0) / 4
    for (let k = 0; k < 4; k++) {
      const f = (k + 0.5) / 4
      g.add(P(rbox(len * 0.75, 0.9, 0.9, col, {}, 0.15), x0 + (x1 - x0) * f, 0.44, z0 + (z1 - z0) * f, 0, ang))
    }
  }
  // 牌堆 + 散落的车厢
  g.add(P(cardStack(5.6, 8.6, 14, '#ffffff', t2, 'int-traincards'), BW / 2 + 4, 0, -6))
  for (let k = 0; k < 4; k++) g.add(P(rbox(2, 0.9, 0.9, k % 2 ? t1 : t2, {}, 0.15), BW / 2 + 2.5 + (k % 2) * 3, 0, 4 + k * 1.6, 0, k * 0.5))
  return fitGroup(g)
}

/** 卡牌面：彩色边框 + 中央图形 + 角标 */
export function drawPlayCard(col: string, n: number): Draw {
  return (c, W, H) => {
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, W, H)
    c.fillStyle = col
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.ellipse(W / 2, H / 2, W * 0.3, H * 0.36, 0.5, 0, PI * 2)
    c.fill()
    c.fillStyle = col
    c.font = `bold ${Math.floor(H * 0.38)}px sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(n), W / 2, H * 0.53)
    c.fillStyle = '#ffffff'
    c.font = `bold ${Math.floor(H * 0.13)}px sans-serif`
    c.fillText(String(n), W * 0.2, H * 0.14)
  }
}

/** 扇形手牌（平放）：n 张，中心 (x, z)，朝 +z 的玩家 */
function fanHand(n: number, cols: string[], x: number, z: number, faceUp: boolean, back: string, seed: number, facing = 0) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.16
    const col = cols[(i + seed) % cols.length]
    const cd = faceUp ? card(5.7, 8.8, '#ffffff', `int-pc-${col}-${(i * 3 + seed) % 10}`, drawPlayCard(col, (i * 3 + seed) % 10)) : card(5.7, 8.8, '#ffffff', `int-pcback-${back}`, (c, W, H) => {
      c.fillStyle = '#26262a'
      c.fillRect(0, 0, W, H)
      c.fillStyle = back
      c.beginPath()
      c.ellipse(W / 2, H / 2, W * 0.32, H * 0.38, 0.5, 0, PI * 2)
      c.fill()
    })
    const pivot = G(P(cd, 0, 0, -5))
    g.add(P(pivot, 0, i * 0.11, 0, 0, a))
  }
  g.position.set(x, 0, z)
  g.rotation.y = facing
  return g
}

export const UNO_COLS = ['#d64545', '#f0c030', '#3fa05a', '#3d7fd0']

/** 卡牌游戏摊开：牌堆 + 弃牌堆 + 两手扇形手牌 [牌背, 桌垫, —] */
export function cardGame(p: string[]) {
  const [back, mat] = p
  const g = new THREE.Group()
  g.add(rbox(44, 0.3, 32, mat, {}, 0.15))
  const y = 0.3
  g.add(P(cardStack(5.7, 8.8, 30, '#ffffff', back, `int-cg-deck-${back}`), -4, y, -2))
  const r = rng(8)
  for (let k = 0; k < 6; k++) {
    const col = UNO_COLS[Math.floor(r() * 4)]
    const n = Math.floor(r() * 10)
    g.add(P(card(5.7, 8.8, '#ffffff', `int-pc-${col}-${n}`, drawPlayCard(col, n)), 4 + (r() - 0.5) * 1.5, y + k * 0.11, -2 + (r() - 0.5) * 1.5, 0, (r() - 0.5) * 1.2))
  }
  const hand = fanHand(7, UNO_COLS, 0, 12, true, back, 1)
  hand.position.y = y
  g.add(hand)
  const opp = fanHand(6, UNO_COLS, 0, -14, false, back, 2, PI)
  opp.position.y = y
  g.add(opp)
  return fitGroup(g)
}

/** UNO 风卡牌（一副 + 几张摊开）[牌背, —, —] */
export function unoCards(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(P(cardStack(5.7, 8.8, 40, '#ffffff', back, `int-uno-deck-${back}`), -7, 0, 0))
  g.add(rbox(6.4, 2.4, 9.5, back, { x: -15, z: 0 }, 0.4))
  const r = rng(21)
  for (let k = 0; k < 5; k++) {
    const col = UNO_COLS[k % 4]
    const n = Math.floor(r() * 10)
    g.add(P(card(5.7, 8.8, '#ffffff', `int-pc-${col}-${n}`, drawPlayCard(col, n)), 2 + k * 3.2, k * 0.11, (k % 2) * 1.5, 0, (k - 2) * 0.15))
  }
  return fitGroup(g)
}

/** 骰子游戏：毛毡骰盘 + 骰盅 + 五颗骰子 [骰盅, 毡, 骰子] */
export function diceGame(p: string[]) {
  const [cupC, felt, dieC] = p
  const g = new THREE.Group()
  g.add(cup(13, 13, 3, 1.2, shade(cupC, -0.1)))
  g.add(cyl(11.9, 11.9, 0.4, felt, { y: 1 }, 32))
  const pos: [number, number, number, number, number][] = [[-4, -3, 5, 2, 0.3], [2, -5, 3, 1, -0.5], [5, 1, 6, 4, 0.9], [-1, 3, 1, 5, 0.1], [-6, 4, 4, 3, -0.8]]
  for (const [x, z, t, f, ry] of pos) g.add(P(die(1.8, dieC, '#26262a', t, f, ry), x, 1.4, z))
  // 骰盅倒扣在旁边
  g.add(P(G(cup(4.4, 3.8, 10, 0.5, cupC), torus(4.3, 0.35, shade(cupC, 0.2), { y: 9.8, rx: PI / 2 })), 19, 10.2, 0, PI))
  return fitGroup(g)
}

/** 大富翁式环形棋盘：[版图底, 地产色, 点缀] */
export function bgLoop(p: string[]) {
  const [base, prop, acc] = p
  const g = new THREE.Group()
  const S0 = 50
  g.add(rbox(S0, 0.5, S0, '#ffffff', {}, 0.2))
  const props = [prop, '#3d7fd0', '#e2702f', '#c8473a', '#f0c030', '#3fa05a', '#8a4fb0', '#58c0e0']
  g.add(decal(paintTop(S0 - 0.2, S0 - 0.2, `int-loop-${base}-${prop}`, (c, W, H) => {
    c.fillStyle = base
    c.fillRect(0, 0, W, H)
    const n = 11
    const cw = W / n
    c.fillStyle = shade(base, 0.08)
    c.fillRect(cw, cw, W - cw * 2, H - cw * 2)
    c.strokeStyle = '#26262a'
    c.lineWidth = Math.max(1, W * 0.003)
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < n; i++) {
        let x = 0
        let y = 0
        if (side === 0) [x, y] = [i * cw, H - cw]
        else if (side === 1) [x, y] = [0, H - cw - i * cw]
        else if (side === 2) [x, y] = [i * cw, 0]
        else [x, y] = [W - cw, i * cw]
        c.strokeRect(x, y, cw, cw)
        if (i > 0 && i < n - 1 && i % 3 !== 0) {
          c.fillStyle = props[(side * 2 + Math.floor(i / 3)) % props.length]
          const bh = cw * 0.28
          if (side === 0) c.fillRect(x, y, cw, bh)
          else if (side === 2) c.fillRect(x, y + cw - bh, cw, bh)
          else if (side === 1) c.fillRect(x + cw - bh, y, bh, cw)
          else c.fillRect(x, y, bh, cw)
        }
      }
    }
    c.fillStyle = acc
    c.save()
    c.translate(W / 2, H / 2)
    c.rotate(-0.6)
    c.fillRect(-W * 0.28, -H * 0.07, W * 0.56, H * 0.14)
    c.fillStyle = '#ffffff'
    c.fillRect(-W * 0.24, -H * 0.03, W * 0.48, H * 0.06)
    c.restore()
  }, 0, 0.52, 0)))
  const cw = S0 / 11
  const edge = S0 / 2 - cw / 2
  for (let k = 0; k < 5; k++) g.add(house('#3fa05a', -edge + cw * (2 + k * 0.6), 0.52, edge - cw * 0.15, 0.7))
  g.add(P(rbox(1.6, 1, 1, '#c8473a', {}, 0.1), edge + cw * 0.15, 0.52, -edge + cw * 4))
  const pc = [acc, '#3d7fd0', '#ffffff', '#26262a']
  pc.forEach((c, i) => g.add(pawn(c, -edge + (i % 2) * 1.6, 0.52, edge - (i > 1 ? 1.6 : 0), 0.8)))
  g.add(P(die(1.5, '#ffffff', '#26262a', 4, 2, 0.4), 4, 0.52, 3), P(die(1.5, '#ffffff', '#26262a', 6, 3, -0.2), 6.5, 0.52, 4.5))
  const money = ['#f4f4f2', '#ffd6e0', '#ffe08f', '#a6e3cc', '#a8d4f4', '#e0c08a']
  money.forEach((c, i) => g.add(rbox(10, 0.3 + (i % 3) * 0.2, 5, c, { x: S0 / 2 + 7, z: -16 + i * 6 }, 0.05)))
  return fitGroup(g)
}

/** 推理桌游：房间版图 + 角色棋子 + 线索卡 [版图色, 墙色, 点缀] */
export function bgMystery(p: string[]) {
  const [floor, wall, acc] = p
  const g = new THREE.Group()
  const S0 = 48
  g.add(rbox(S0, 0.5, S0, '#ffffff', {}, 0.2))
  g.add(decal(paintTop(S0 - 0.2, S0 - 0.2, `int-mystery-${floor}-${wall}`, (c, W, H) => {
    c.fillStyle = shade(floor, 0.15)
    c.fillRect(0, 0, W, H)
    c.strokeStyle = shade(floor, -0.05)
    c.lineWidth = 1
    const n = 24
    for (let i = 0; i <= n; i++) {
      c.beginPath()
      c.moveTo((i * W) / n, 0)
      c.lineTo((i * W) / n, H)
      c.moveTo(0, (i * H) / n)
      c.lineTo(W, (i * H) / n)
      c.stroke()
    }
    const rooms: [number, number, number, number][] = [[0, 0, 7, 6], [9, 0, 7, 7], [18, 0, 6, 6], [0, 9, 6, 6], [18, 9, 6, 7], [0, 18, 7, 6], [9, 18, 6, 6], [17, 18, 7, 6]]
    rooms.forEach(([x, y, w, h], i) => {
      c.fillStyle = i % 2 ? floor : shade(floor, -0.08)
      c.fillRect((x * W) / n, (y * H) / n, (w * W) / n, (h * H) / n)
      c.strokeStyle = wall
      c.lineWidth = W * 0.008
      c.strokeRect((x * W) / n, (y * H) / n, (w * W) / n, (h * H) / n)
    })
    c.fillStyle = wall
    c.fillRect((9 * W) / n, (9 * H) / n, (6 * W) / n, (6 * H) / n)
    c.fillStyle = acc
    c.fillRect((10 * W) / n, (11 * H) / n, (4 * W) / n, (2 * H) / n)
  }, 0, 0.52, 0)))
  const chars = ['#c8473a', '#f0c030', '#ffffff', '#3fa05a', '#3d7fd0', '#8a4fb0']
  const spots: V2[] = [[-14, 6], [-4, -6], [6, 15], [15, -14], [-16, -16], [3, 4]]
  chars.forEach((c, i) => g.add(pawn(c, spots[i][0], 0.52, spots[i][1], 1)))
  g.add(rbox(8, 0.6, 5, acc, { y: 0.52 }, 0.1))
  g.add(P(cardStack(4.4, 6.6, 10, '#ffffff', wall, 'int-mystery-cards'), S0 / 2 + 4, 0, -10))
  g.add(P(card(9, 13, PAPER, 'int-mystery-note', (c, W, H) => {
    c.fillStyle = PAPER
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#9a9a9a'
    for (let k = 0; k < 14; k++) c.fillRect(W * 0.08, H * (0.08 + k * 0.064), W * 0.84, 1)
    c.fillStyle = '#c8473a'
    for (let k = 0; k < 6; k++) c.fillRect(W * 0.75, H * (0.1 + k * 0.13), W * 0.08, H * 0.03)
  }), S0 / 2 + 6, 0, 6, 0, -0.2))
  g.add(taperRod3([S0 / 2 + 3, 0.4, 10], [S0 / 2 + 10, 0.4, 7], 0.35, 0.35, DARK, 6))
  return fitGroup(g)
}

/** 国际象棋（摆好的开局）：[棋盘框, 白子, 黑子] */
export function chessOpening(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  g.add(rbox(36, 2, 36, frame, {}, 0.5))
  g.add(paintTop(32, 32, `int-chess-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
      }
  }, 0, 2.3, 0))
  const order: ('r' | 'n' | 'b' | 'q' | 'k')[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let f = 0; f < 8; f++) {
    const x = -14 + f * 4
    g.add(P(chessPiece(order[f], white, PI), x, 2.35, 14), P(chessPiece('p', white, PI), x, 2.35, 10))
    g.add(P(chessPiece(order[f], black, 0), x, 2.35, -14), P(chessPiece('p', black, 0), x, 2.35, -10))
  }
  return fitGroup(g)
}

/** 中国象棋：[棋盘木, 红方, 黑方] */
export function xiangqi(p: string[]) {
  const [board, red, black] = p
  const g = new THREE.Group()
  const BW = 40
  const BD = 44
  g.add(rbox(BW, 1.6, BD, board, {}, 0.4))
  const gx = 4.2
  const gz = 4.3
  const x0 = -gx * 4
  const z0 = -gz * 4.5
  g.add(paintTop(BW - 1, BD - 1, `int-xq-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    const px = (i: number) => ((x0 + i * gx + (BW - 1) / 2) / (BW - 1)) * W
    const pz = (j: number) => ((z0 + j * gz + (BD - 1) / 2) / (BD - 1)) * H
    c.strokeStyle = '#3a2a20'
    c.lineWidth = Math.max(1, W * 0.004)
    for (let j = 0; j < 10; j++) {
      c.beginPath()
      c.moveTo(px(0), pz(j))
      c.lineTo(px(8), pz(j))
      c.stroke()
    }
    for (let i = 0; i < 9; i++) {
      c.beginPath()
      if (i === 0 || i === 8) {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(9))
      } else {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(4))
        c.moveTo(px(i), pz(5))
        c.lineTo(px(i), pz(9))
      }
      c.stroke()
    }
    for (const j of [0, 7]) {
      c.beginPath()
      c.moveTo(px(3), pz(j))
      c.lineTo(px(5), pz(j + 2))
      c.moveTo(px(5), pz(j))
      c.lineTo(px(3), pz(j + 2))
      c.stroke()
    }
    c.lineWidth = Math.max(1, W * 0.007)
    c.strokeRect(px(0) - W * 0.012, pz(0) - W * 0.012, px(8) - px(0) + W * 0.024, pz(9) - pz(0) + W * 0.024)
  }, 0, 1.9, 0))
  const piece = (i: number, j: number, side: string) => {
    const x = x0 + i * gx
    const z = z0 + j * gz
    g.add(puck(1.8, 1, '#f2dcb0', { x, y: 1.6, z }))
    g.add(noOutline(torus(1.35, 0.1, side, { x, y: 2.62, z, rx: PI / 2 })))
    g.add(noOutline(rbox(1.1, 0.06, 0.25, side, { x, y: 2.6, z }, 0.03)), noOutline(rbox(0.25, 0.06, 1.1, side, { x, y: 2.6, z }, 0.03)))
  }
  for (const [side, back, cannon, pawnRow] of [[red, 9, 7, 6], [black, 0, 2, 3]] as [string, number, number, number][]) {
    for (let i = 0; i < 9; i++) piece(i, back, side)
    piece(1, cannon, side)
    piece(7, cannon, side)
    for (const i of [0, 2, 4, 6, 8]) piece(i, pawnRow, side)
  }
  return fitGroup(g)
}

/** 黑白棋（中局）：[棋盘, 黑子, 白子] */
export function reversi(p: string[]) {
  const [board, dark, light] = p
  const g = new THREE.Group()
  g.add(rbox(34, 1.6, 34, shade(board, -0.15), {}, 0.4))
  g.add(paintTop(32, 32, `int-reversi-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#1e2a1e'
    const lw = Math.max(1, W * 0.006)
    for (let i = 0; i <= 8; i++) {
      c.fillRect((i / 8) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 8) * (H - lw), W, lw)
    }
  }, 0, 1.9, 0))
  const r = rng(6)
  for (let i = 1; i < 7; i++)
    for (let j = 1; j < 7; j++) {
      if (r() < 0.45) continue
      const x = -14 + i * 4
      const z = -14 + j * 4
      const top = r() < 0.5 ? dark : light
      g.add(cyl(1.6, 1.6, 0.2, top === dark ? light : dark, { x, y: 1.6, z }, 20), cyl(1.6, 1.6, 0.2, top, { x, y: 1.8, z }, 20))
    }
  return fitGroup(g)
}

/** 跳棋（六角星盘 + 弹珠）：[盘色, 星色, 点缀] */
export function chineseCheckers(p: string[]) {
  const [plate, star, acc] = p
  const g = new THREE.Group()
  g.add(cyl(21.6, 21.6, 1.6, plate, {}, 48))
  const sp = 1.9
  const holes: V2[] = []
  const tri = (q: number, r: number) => [sp * (q + r / 2), sp * r * (Math.sqrt(3) / 2)] as V2
  for (let q = -8; q <= 8; q++)
    for (let r = -8; r <= 8; r++) {
      const s = -q - r
      const inA = q >= -4 && r >= -4 && s >= -4
      const inB = q <= 4 && r <= 4 && s <= 4
      if (inA || inB) holes.push(tri(q, r))
    }
  g.add(paintTop(30, 30, `int-cc-${plate}-${star}`, (c, W, H) => {
    c.fillStyle = plate
    c.fillRect(0, 0, W, H)
    c.fillStyle = star
    const k = W / 30
    const pts: V2[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + PI / 2
      const rr = i % 2 ? 7.6 : 14.4
      pts.push([W / 2 + Math.cos(a) * rr * k, H / 2 + Math.sin(a) * rr * k])
    }
    c.beginPath()
    c.moveTo(...pts[0])
    for (const pt of pts) c.lineTo(...pt)
    c.fill()
    c.fillStyle = shade(star, -0.3)
    for (const [x, z] of holes) {
      c.beginPath()
      c.arc(W / 2 + x * k, H / 2 + z * k, k * 0.45, 0, PI * 2)
      c.fill()
    }
  }, 0, 1.9, 0))
  const cols = [acc, '#3d7fd0', '#f0c030', '#3fa05a', '#ffffff', '#26262a']
  holes.forEach(([x, z]) => {
    const d = Math.hypot(x, z)
    if (d < sp * 4.6) return
    const a = Math.atan2(z, x)
    const sector = Math.round(((a + PI * 2) % (PI * 2)) / (PI / 3) - 0.5 + 6) % 6
    if (sector % 2 === 1 && sector !== 3) return
    g.add(ball(0.75, cols[sector], { x, y: 1.6 + 0.55, z }))
  })
  return fitGroup(g)
}

/** 双陆棋（打开的棋盒）：[框, 三角 1, 棋子 1] */
export function backgammon(p: string[]) {
  const [frame, tri, chk] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(tray(24, 2.4, 38, 1, frame, { x: s * 12.2 }))
  g.add(cylZ(0.5, 36, METAL, 0, 0.6, 0, 8))
  for (const s of [-1, 1])
    g.add(paintTop(21.8, 35.8, `int-bgm-${frame}-${tri}`, (c, W, H) => {
      c.fillStyle = shade(frame, 0.35)
      c.fillRect(0, 0, W, H)
      for (let i = 0; i < 6; i++) {
        for (const top of [true, false]) {
          c.fillStyle = (i + (top ? 0 : 1)) % 2 ? tri : '#f2e6cc'
          const x = (i / 6) * W
          c.beginPath()
          if (top) {
            c.moveTo(x, 0)
            c.lineTo(x + W / 6, 0)
            c.lineTo(x + W / 12, H * 0.42)
          } else {
            c.moveTo(x, H)
            c.lineTo(x + W / 6, H)
            c.lineTo(x + W / 12, H * 0.58)
          }
          c.fill()
        }
      }
    }, s * 12.2, 1.3, 0))
  const pw = 21.8 / 6
  const pt = (side: number, i: number, top: boolean, n: number, col: string) => {
    const x = side * 12.2 - 10.9 + pw * (i + 0.5)
    for (let k = 0; k < n; k++) g.add(cyl(1.5, 1.5, 0.6, col, { x, y: 1, z: (top ? -1 : 1) * (17.9 - 1.5 - k * 3) }, 18))
  }
  const other = '#f4f4f2'
  pt(-1, 0, true, 5, chk)
  pt(-1, 4, false, 3, other)
  pt(1, 0, false, 5, other)
  pt(1, 5, true, 2, chk)
  pt(-1, 0, false, 4, other)
  pt(1, 3, true, 3, chk)
  g.add(P(die(1.4, '#ffffff', '#26262a', 6, 3, 0.4), 5, 1, 0), P(die(1.4, '#ffffff', '#26262a', 2, 1, -0.3), 8, 1, 1.5))
  g.add(P(die(2, '#f4ead2', '#26262a', 2, 4, 0.2), -6, 1, 0))
  return fitGroup(g)
}

/** 花札（散开的小牌）：[牌背, 主色, 点缀] */
export function hanafuda(p: string[]) {
  const [back, a, acc] = p
  const g = new THREE.Group()
  const W0 = 3.3
  const D0 = 5.4
  const cardDraw = (k: number): Draw => (c, W, H) => {
    c.fillStyle = '#26262a'
    c.fillRect(0, 0, W, H)
    const sky = [a, '#f2e6cc', '#3d4a6a', '#e8a0a0'][k % 4]
    c.fillStyle = sky
    c.fillRect(W * 0.07, H * 0.05, W * 0.86, H * 0.9)
    if (k % 3 === 0) {
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.arc(W / 2, H * 0.35, W * 0.28, 0, PI * 2)
      c.fill()
    }
    c.fillStyle = k % 2 ? '#3a6a3a' : acc
    c.beginPath()
    c.moveTo(W * 0.07, H * 0.95)
    c.quadraticCurveTo(W * 0.5, H * (0.45 + (k % 3) * 0.08), W * 0.93, H * 0.95)
    c.fill()
    c.fillStyle = '#c8473a'
    for (let j = 0; j < 3; j++) {
      c.beginPath()
      c.arc(W * (0.3 + j * 0.2), H * (0.62 - (j % 2) * 0.1), W * 0.08, 0, PI * 2)
      c.fill()
    }
  }
  const backDraw: Draw = (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
  }
  g.add(P(cardStack(W0, D0, 20, '#26262a', back, `int-hana-back-${back}`, backDraw), -8, 0, -4))
  const r = rng(13)
  for (let k = 0; k < 8; k++) g.add(P(card(W0, D0, '#26262a', `int-hana-${k}-${a}-${acc}`, cardDraw(k), 0.08), -2 + (k % 4) * 4, 0, -5 + Math.floor(k / 4) * 6.2, 0, (r() - 0.5) * 0.2))
  for (let k = 0; k < 5; k++) g.add(P(card(W0, D0, '#26262a', `int-hana-${k + 8}-${a}-${acc}`, cardDraw(k + 8), 0.08), -3 + k * 1.6, k * 0.09, 9, 0, (k - 2) * 0.18))
  return fitGroup(g)
}

/** 百人一首 / かるた（散在榻榻米上的牌）：[榻榻米, 牌边, 字色] */
export function karuta(p: string[]) {
  const [tatami, edge, ink] = p
  const g = new THREE.Group()
  g.add(rbox(88, 1, 60, tatami, {}, 0.3))
  g.add(rbox(88, 1.02, 3, J.sumi, { z: -28.5 }, 0.3), rbox(88, 1.02, 3, J.sumi, { z: 28.5 }, 0.3))
  const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
  const r = rng(17)
  const cardDraw = (seed: number): Draw => (c, W, H) => {
    const rr = rng(seed)
    c.fillStyle = edge
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#fbf6e8'
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = ink
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${Math.floor(W * 0.24)}px "Yu Mincho", "Hiragino Mincho ProN", serif`
    for (let col = 0; col < 3; col++)
      for (let row = 0; row < 5; row++) {
        if (col === 2 && row > 2) continue
        c.fillText(kana[Math.floor(rr() * kana.length)], W * (0.75 - col * 0.25), H * (0.16 + row * 0.17))
      }
  }
  const place = (x: number, z: number, ry: number, seed: number) => g.add(P(card(5.3, 7.4, edge, `int-karuta-${seed}-${edge}`, cardDraw(seed), 0.12), x, 1, z, 0, ry))
  let seed = 0
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < 9; k++) {
        if (r() < 0.25) continue
        const x = -36 + k * 8.4 + (r() - 0.5) * 1.2
        const z = side * (7 + row * 9) + (r() - 0.5) * 1
        place(x, z, side > 0 ? 0 : PI + (r() - 0.5) * 0.1, seed++)
      }
  place(4, 0, 0.6, 99)
  return fitGroup(g)
}

/** 叠叠乐：stacked = 叠好的塔；否则倒塌散落 [木色, —, —] */
export const jenga = (stacked: boolean) => (p: string[]) => {
  const wood = p[0]
  const g = new THREE.Group()
  const L = 7.5
  const T = 1.5
  const Wb = 2.5
  const r = rng(stacked ? 1 : 2)
  const col = () => shade(wood, (r() - 0.5) * 0.1)
  if (stacked) {
    for (let lv = 0; lv < 18; lv++) {
      for (let k = 0; k < 3; k++) {
        if (lv > 3 && lv < 15 && r() < 0.12 && k !== 1) continue
        const off = (k - 1) * Wb
        const pull = lv === 9 && k === 1 ? 2.2 : 0
        const b = lv % 2 ? rbox(L, T, Wb - 0.05, col(), { x: pull, y: lv * T, z: off }, 0.15) : rbox(Wb - 0.05, T, L, col(), { x: off, y: lv * T, z: pull }, 0.15)
        g.add(b)
      }
    }
    g.add(rbox(L, T, Wb - 0.05, col(), { x: 6, y: 0, z: 6 }, 0.15))
  } else {
    // 剩下的半截塔 + 散落的木块
    for (let lv = 0; lv < 5; lv++) for (let k = 0; k < 3; k++) g.add(lv % 2 ? rbox(L, T, Wb - 0.05, col(), { y: lv * T, z: (k - 1) * Wb }, 0.15) : rbox(Wb - 0.05, T, L, col(), { x: (k - 1) * Wb, y: lv * T }, 0.15))
    const rings: [number, number][] = [[10.5, 10], [19, 14]]
    for (const [rad, n] of rings)
      for (let k = 0; k < n; k++) {
        if (r() < 0.15) continue
        const a = (k / n) * PI * 2 + (r() - 0.5) * 0.15
        const rr = rad + (r() - 0.5) * 1.5
        g.add(P(rbox(L, T, Wb - 0.05, col(), {}, 0.15), Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.85, 0, -a + (r() - 0.5) * 0.3))
      }
  }
  return fitGroup(g)
}

/** 拼图（拼到一半）：底板 + 已拼部分 + 散落拼块 + 盒盖 [底板, 天色, 山色] */
export function jigsaw(p: string[]) {
  const [base, sky, hill] = p
  const g = new THREE.Group()
  g.add(rbox(54, 0.4, 40, base, {}, 0.15))
  const pic = paintLandscape(sky, hill, '#ffd27a')
  g.add(rbox(50, 0.25, 36, '#d8d0c0', { y: 0.4 }, 0.05))
  g.add(decal(paintTop(50, 36, `int-jigsaw-${sky}-${hill}`, (c, W, H) => {
    pic(c, W, H)
    // 还没拼的区域
    c.fillStyle = '#d8d0c0'
    c.fillRect(W * 0.55, H * 0.4, W * 0.45, H * 0.6)
    c.fillRect(W * 0.3, H * 0.65, W * 0.25, H * 0.35)
    c.strokeStyle = 'rgba(0,0,0,0.18)'
    c.lineWidth = 1
    for (let i = 1; i < 20; i++) {
      c.beginPath()
      c.moveTo((i * W) / 20, 0)
      c.lineTo((i * W) / 20, H)
      c.stroke()
    }
    for (let j = 1; j < 14; j++) {
      c.beginPath()
      c.moveTo(0, (j * H) / 14)
      c.lineTo(W, (j * H) / 14)
      c.stroke()
    }
  }, 0, 0.67, 0)))
  const r = rng(31)
  const cols = [sky, hill, shade(hill, 0.18), '#ffffff', shade(sky, -0.1)]
  for (let k = 0; k < 22; k++) {
    const x = 6 + r() * 18
    const z = 2 + r() * 14
    const c = cols[Math.floor(r() * cols.length)]
    const pc = G(rbox(2.5, 0.25, 2.5, c, {}, 0.05), puck(0.55, 0.25, c, { x: 1.4 }), puck(0.55, 0.25, c, { z: 1.4 }))
    g.add(P(pc, x, 0.65, z, 0, r() * PI * 2))
  }
  return fitGroup(g)
}

/** 七巧板（木盘里拼好的正方形 + 两块拿出来） [盘, 色 1, 色 2] */
export function tangram(p: string[]) {
  const [tray0, a, b] = p
  const g = new THREE.Group()
  g.add(tray(18, 1.4, 18, 0.8, tray0))
  const S0 = 16
  const h = S0 / 2
  const pieces: [V2[], string][] = [
    [[[-h, -h], [h, -h], [0, 0]], a],
    [[[-h, -h], [0, 0], [-h, h]], b],
    [[[h, -h], [h, 0], [h / 2, -h / 2]], shade(a, 0.2)],
    [[[0, 0], [h / 2, -h / 2], [h, 0], [h / 2, h / 2]], C.lemon],
    [[[0, 0], [h / 2, h / 2], [0, h], [-h / 2, h / 2]], C.mint],
    [[[-h, h], [-h / 2, h / 2], [0, h]], shade(b, 0.2)],
    [[[h, 0], [h, h], [0, h], [h / 2, h / 2]], C.pink],
  ]
  pieces.forEach(([pts, c], i) => {
    const inset = pts.map(([x, z]): V2 => {
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length
      const cz = pts.reduce((s, q) => s + q[1], 0) / pts.length
      return [cx + (x - cx) * 0.94, cz + (z - cz) * 0.94]
    })
    const m = flat(inset.map(([x, z]): V2 => [x, z]), 0.8, c, false, 0.15)
    const lay = P(m, 0, 0.8 + 0.4, 0, PI / 2)
    if (i === 6) g.add(P(G(lay), 13.5, -0.8, 5, 0, 0.6))
    else if (i === 3) g.add(P(G(lay), 12.5, -0.8, -5, 0, -0.4))
    else g.add(lay)
  })
  return fitGroup(g)
}

/** 鲁班锁（六根榫木互锁）+ 拆下的一根 [木色] */
export function burrPuzzle(p: string[]) {
  const wood = p[0]
  const g = new THREE.Group()
  const L = 8
  const s = 1.6
  const o = s / 2
  const cy = L / 2
  const c = (k: number) => shade(wood, k * 0.05 - 0.05)
  for (const k of [-1, 1]) {
    g.add(rbox(L, s, s, c(0), { y: cy - o, z: k * o }, 0.12))
    g.add(rbox(s, L, s, c(1), { x: k * o, y: 0 }, 0.12))
    g.add(rbox(s, s, L, c(2), { x: 0, y: cy - o + k * o }, 0.12))
  }
  g.add(rbox(4, 0.6, 4, shade(wood, -0.2), { x: 9 }, 0.2))
  g.add(P(rbox(L, s, s, c(1), {}, 0.12), 10, 0, 4, 0, 0.4))
  return fitGroup(g)
}

/** 四条牌墙风车形围成方框：每条的一端顶着相邻那条的侧面，各自歪一点、错开一点，互不重叠（见 pinwheelWalls） */
export function mjRing(g: THREE.Group, n: number, back: string, y: number, seed: number) {
  for (const w of pinwheelWalls(n * MJ_TW, MJ_TH, seed)) g.add(P(mjWall(n, back), w.x, y, w.z, 0, w.ry))
}

export const MJ_TW = 2.6

export const MJ_TH = 3.5

/** 一段牌墙：n 墩 × 2 层，背面朝上；底面中心在原点，沿 x 排开，墙面朝 +z */
export function mjWall(n: number, back: string) {
  const L = n * MJ_TW
  const side = new THREE.Group()
  for (let l = 0; l < 2; l++) {
    side.add(rbox(L, 1.2, MJ_TH, IVORY, { y: l * MJ_TT }, 0.25))
    side.add(rbox(L, 0.7, MJ_TH, back, { y: l * MJ_TT + 1.2 }, 0.25))
  }
  side.add(paintPanel(L, 3.8, `int-mj-wall${n}-${back}`, (c, W, H) => {
    c.fillStyle = IVORY
    c.fillRect(0, 0, W, H)
    c.fillStyle = back
    c.fillRect(0, 0, W, H * 0.18)
    c.fillRect(0, H * 0.5, W, H * 0.18)
    c.fillStyle = 'rgba(0,0,0,0.25)'
    for (let i = 1; i < n; i++) c.fillRect((i * W) / n, 0, 1, H)
    c.fillRect(0, H * 0.5 - 1, W, 1)
  }, { y: 0, z: MJ_TH / 2 + 0.3 }))
  return side
}

const MJ_TT = 1.9
