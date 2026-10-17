// 数码 / 游戏 / 主播 / 相机 / 办公 / 通讯 / 电脑主机 / 网络存储 / 防潮柜 素材包。
// 原点在占地中心底面，正面朝 +z。小件都是 prop；落地的大件（机箱、复合机、落地补光灯、三脚架、柜子）不设 prop。
// build 统一经过 fit()：按实际包围盒把模型挪到「x/z 居中、底面贴 y = 0（壁挂贴 mount）」，w/d/h 与包围盒一致。
// 柜子类（防潮柜、展示柜）不 fit，按 surfaces 精确建模。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus } from '../toon'
import { C, CLIP_DROP, G, SWING_OPEN, clipLevels, glow, movable, rng, shell, rectPoly, type AssetCategory, type AssetDef, type SurfaceDef } from '../kit'
import { I, J, M, N, R, hasDeclaredCoords, shiftDeclared, type Pal } from '../packkit'
import { P, PI, cylX, cylZ, ghostOutlined, litOutlined, noOutline, rod3 } from '../geo'

const SCREEN = '#bfe3ff'
const DARK = '#2c2e34'
const BLACK = '#1f2024'
const RUBBER = '#3a3b40'
const GREEN = '#7dffa8'
const BLUE = '#6fd3ff'
const RED = '#ff6b6b'
const AMBER = '#ffc04d'
const PAPER = '#fbfaf6'
const LCD = '#cfe0b4'

// ---------- 定义 ----------

function def(
  id: string,
  name: string,
  category: AssetCategory,
  [w, d, h]: [number, number, number],
  pals: Pal[],
  build: (p: string[]) => THREE.Group,
  extra: Partial<AssetDef> = {},
  exact = false,
): AssetDef {
  const mount = extra.mount ?? 0
  // fit 会把模型重定心：手写的 surface / surfaces / screens 写在 build 的坐标系里，要跟着平移同样的量
  // （之前没跟：一体机的夹式摄像头 / 便签离屏幕 1.5cm，电竞曲面屏 0.66cm）
  if (!exact && hasDeclaredCoords(extra)) extra = shiftDeclared(extra, fitOffset(build(pals[0][1]), mount))
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build: exact ? build : (p) => fit(build(p), mount),
    prop: true,
    ...extra,
  }
}

/** fit 对模型的平移量：x/z 居中，底面落到 mount 高度 */
function fitOffset(g: THREE.Group, mount = 0): [number, number, number] {
  const box = new THREE.Box3().setFromObject(g, true)
  const c = box.getCenter(new THREE.Vector3())
  return [-c.x, mount - box.min.y, -c.z]
}

/** 按包围盒居中：x/z 居中，底面落到 mount 高度 */
function fit(g: THREE.Group, mount = 0) {
  g.position.set(...fitOffset(g, mount))
  return G(g)
}

// ---------- 小工具 ----------

/** 指示灯小球 */
const led = (x: number, y: number, z: number, color: string, r = 0.3) => noOutline(litOutlined(ball(r, color, { x, y, z }), color, 0.9))

/** 水平的发光面（平放的屏幕），y 是底面 */
function flat(w: number, d: number, color: string, x: number, y: number, z: number, k = 0.55, t = 0.3) {
  const m = rbox(w, t, d, color, { x, y, z }, Math.min(0.12, t * 0.4))
  m.material = toon(color, { emissive: k })
  m.userData.noOutline = true
  return m
}

/** 绕 x 轴转 a 后局部点 (y, z) 的新坐标 */
const rotX = (a: number, y: number, z: number): [number, number] => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]

/** 两点之间的扁板（支架、纸张托板） */
function strut3(a: [number, number, number], b: [number, number, number], w: number, t: number, color: string) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const dir = B.clone().sub(A)
  const m = rbox(w, dir.length(), t, color, {}, Math.min(0.3, t * 0.4))
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return m
}

/** 三脚架腿：顶点 (0, top, 0)，脚落在半径 r 的圆上 */
function tripodLegs(g: THREE.Group, r: number, top: number, rr: number, color: string, a0 = PI / 2) {
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * PI * 2
    const fx = Math.cos(a) * r
    const fz = Math.sin(a) * r
    g.add(rod3([fx, rr, fz], [0, top, 0], rr, color))
    g.add(ball(rr * 1.4, RUBBER, { x: fx, y: rr * 1.4, z: fz }))
  }
}

/** 屏幕上的应用图标网格（竖直屏幕，z 为图标层） */
function appIcons(g: THREE.Group, gw: number, gh: number, y0: number, z: number, n: number, m: number, accent: string) {
  const cols = ['#ffffff', accent, '#fff3b0', '#c9f0dc', '#ffd6e0', '#d6e4ff']
  const cs = Math.min(gw / (n * 1.8), gh / (m * 2))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      g.add(glow(cs, cs, cols[(i + j * n) % cols.length], { x: (i - (n - 1) / 2) * cs * 1.6, y: y0 + gh * 0.88 - (j + 1) * cs * 1.6, z }, 0.6))
}

/** 平放屏幕上的图标（y 为图标底面） */
function flatIcons(g: THREE.Group, gw: number, gd: number, y: number, n: number, m: number, accent: string, cx = 0, cz = 0) {
  const cols = ['#ffffff', accent, '#fff3b0', '#c9f0dc', '#ffd6e0', '#d6e4ff']
  const cs = Math.min(gw / (n * 1.8), gd / (m * 2))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      g.add(flat(cs, cs, cols[(i + j * n) % cols.length], cx + (i - (n - 1) / 2) * cs * 1.6, y, cz - gd * 0.4 + j * cs * 1.6 + cs / 2, 0.6, 0.2))
}

/** 按键网格（平放），keys 落在 y 上 */
function keyGrid(g: THREE.Group, n: number, m: number, pitch: number, size: number, color: string, x0: number, y: number, z0: number, accent?: string) {
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const last = accent && i === n - 1 && j === m - 1
      g.add(rbox(size, Math.min(0.5, size * 0.4), size * 0.8, last ? accent! : color, { x: x0 + i * pitch, y, z: z0 + j * pitch }, Math.min(0.2, size * 0.2)))
    }
}

/** 竖直面上的按键网格（朝 +z） */
function keyGridZ(g: THREE.Group, n: number, m: number, pitch: number, size: number, color: string, x0: number, y0: number, z: number) {
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) g.add(rbox(size, size * 0.75, 0.4, color, { x: x0 + i * pitch, y: y0 - j * pitch, z }, 0.15))
}

/** 卷曲电话线：从 a 到 b 一串小圆环 */
function coil(g: THREE.Group, a: [number, number, number], b: [number, number, number], color: string, r = 0.55, n = 10) {
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = a[0] + (b[0] - a[0]) * t
    const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * 1.5
    const z = a[2] + (b[2] - a[2]) * t
    g.add(torus(r, 0.16, color, { x, y, z, ry: Math.atan2(b[0] - a[0], b[2] - a[2]) }))
  }
}

/** 电话听筒（沿 z 躺着），中心 (x, y, z)，y 是听筒底面 */
function handsetZ(g: THREE.Group, color: string, x: number, y: number, z: number, len = 15) {
  g.add(P(capsule(1.3, len - 5, color), x, y + 2.2, z, PI / 2))
  for (const s of [-1, 1]) g.add(ball(2.2, color, { x, y: y + 1.8, z: z + s * (len / 2 - 2) }, [1, 0.8, 1.15]))
}

// ====================================================================
// 游戏 / 音频
// ====================================================================

/** 头戴耳机（平放）：[外壳, 耳垫, 点缀] */
function headphones(p: string[]) {
  const [body, pad, acc] = p
  const g = new THREE.Group()
  const sx = 7
  for (const s of [-1, 1]) {
    g.add(puck(4.3, 2.8, body, { x: s * sx }))
    g.add(puck(3.5, 1.4, pad, { x: s * sx, y: 2.5 }))
    g.add(rbox(1.6, 1.6, 2.4, acc, { x: s * sx, y: 0.6, z: -4.9 }, 0.5))
  }
  g.add(torus(sx, 0.75, body, { y: 1.4, z: -5.4, rx: -PI / 2 }, PI))
  g.add(torus(sx, 0.95, pad, { y: 1.4, z: -5.4, rx: -PI / 2, rz: PI * 0.3 }, PI * 0.4))
  return g
}

/** 游戏耳麦（立着）：[外壳, RGB, 耳垫] */
function gamingHeadset(p: string[]) {
  const [body, rgb, pad] = p
  const g = new THREE.Group()
  const cy = 5.2
  const sx = 7.6
  for (const s of [-1, 1]) {
    g.add(cylX(5, 3.6, body, s * sx, cy, 0, 28))
    g.add(cylX(4.2, 1.4, pad, s * (sx - 2.4), cy, 0, 24))
    g.add(noOutline(litOutlined(torus(3.3, 0.45, rgb, { x: s * (sx + 1.85), y: cy, ry: PI / 2 }), rgb, 0.85)))
    g.add(cylX(1.2, 0.8, shade(body, -0.1), s * (sx + 2.0), cy, 0, 16))
  }
  g.add(torus(sx, 1.0, body, { y: cy + 0.4 }, PI))
  g.add(torus(sx - 1.6, 0.8, pad, { y: cy + 0.4 }, PI))
  // 麦克风杆：从左耳罩前下方伸出
  const mx = -sx - 2.2
  g.add(rod3([mx, cy - 1.5, 2.5], [mx + 1.5, 2.2, 9.5], 0.35, BLACK))
  g.add(capsule(0.75, 1.2, BLACK, { x: mx + 1.6, y: 1.5, z: 10 }))
  g.add(led(mx + 1.6, 3.4, 10.7, RED, 0.22))
  return g
}

/** 真无线耳机盒 + 两只耳机：[盒子, 耳机, 指示灯] */
function earbuds(p: string[]) {
  const [body, bud, l] = p
  const g = new THREE.Group()
  g.add(rbox(6.4, 2.3, 3, body, {}, 1.1))
  g.add(rbox(6.4, 1.5, 3, body, { y: 2.35 }, 0.7))
  g.add(led(0, 1.4, 1.55, l, 0.2))
  for (let i = 0; i < 2; i++) {
    const x = 5.4 + i * 2.8
    g.add(ball(1.1, bud, { x, y: 1.1, z: -0.4 }, [1, 0.95, 1]))
    g.add(P(capsule(0.45, 1.8, bud), x, 0.45, 1.3, PI / 2))
  }
  return g
}

/** PS 风手柄（平放）：[机身, 摇杆帽, 按键] */
function padPS(body: string, acc: string, btn: string) {
  const g = new THREE.Group()
  g.add(rbox(10, 2.4, 6.2, body, { y: 0.9, z: -0.8 }, 1.1))
  for (const s of [-1, 1]) {
    g.add(ball(2.7, body, { x: s * 4.5, y: 2.1, z: -1.0 }, [1.1, 0.45, 1.05]))
    const grip = ball(2.3, body, { x: s * 5.3, y: 1.75, z: 1.9 }, [1, 0.76, 1.65])
    grip.rotation.y = s * 0.35
    g.add(grip)
    g.add(rbox(2.6, 0.9, 1, shade(body, -0.12), { x: s * 4.5, y: 2.0, z: -4.1 }, 0.4))
    g.add(cyl(0.55, 0.55, 0.7, BLACK, { x: s * 1.9, y: 3.1, z: 0.9 }, 12))
    g.add(puck(1.05, 0.6, acc, { x: s * 1.9, y: 3.75, z: 0.9 }))
  }
  g.add(rbox(2.0, 0.5, 0.65, btn, { x: -4.5, y: 3.05, z: -1.0 }, 0.2))
  g.add(rbox(0.65, 0.5, 2.0, btn, { x: -4.5, y: 3.05, z: -1.0 }, 0.2))
  const fc = ['#6fd3a8', '#ff8f86', '#8fb8ff', '#ffb3e0']
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2
    g.add(ball(0.42, fc[k], { x: 4.5 + Math.cos(a) * 0.95, y: 3.35, z: -1.0 + Math.sin(a) * 0.95 }))
  }
  g.add(rbox(4.4, 0.4, 2.4, shade(body, -0.06), { y: 3.15, z: -2.3 }, 0.2))
  g.add(noOutline(litOutlined(rbox(3.4, 0.3, 0.3, acc, { y: 3.2, z: -3.65 }, 0.1), acc, 0.8)))
  return g
}

/** Xbox 风手柄（平放）：[机身, 摇杆, 西瓜键发光] */
function padXbox(p: string[]) {
  const [body, stick, glowc] = p
  const g = new THREE.Group()
  g.add(ball(5.4, body, { y: 2.2, z: -0.6 }, [1.45, 0.4, 0.95]))
  for (const s of [-1, 1]) {
    const grip = ball(2.6, body, { x: s * 5.2, y: 2.0, z: 2.2 }, [1, 0.75, 1.5])
    grip.rotation.y = s * 0.4
    g.add(grip)
    g.add(rbox(3.4, 1.0, 1.2, shade(body, -0.12), { x: s * 3.8, y: 2.2, z: -5.4 }, 0.45))
  }
  const sticks: [number, number, number][] = [
    [-3.6, -1.6, 4.0],
    [1.9, 1.2, 4.1],
  ]
  for (const [x, z, y] of sticks) {
    g.add(cyl(0.55, 0.55, 0.8, BLACK, { x, y: y - 0.3, z }, 12))
    g.add(puck(1.15, 0.6, stick, { x, y: y + 0.45, z }))
  }
  g.add(rbox(2.0, 0.5, 0.65, BLACK, { x: -1.9, y: 3.95, z: 1.2 }, 0.2))
  g.add(rbox(0.65, 0.5, 2.0, BLACK, { x: -1.9, y: 3.95, z: 1.2 }, 0.2))
  const fc = ['#6cc070', '#e85d5d', '#4a90e2', '#f2c94c']
  const off: [number, number][] = [
    [0, 0.95],
    [0.95, 0],
    [-0.95, 0],
    [0, -0.95],
  ]
  for (let k = 0; k < 4; k++) g.add(ball(0.45, fc[k], { x: 3.6 + off[k][0], y: 4.15, z: -1.6 + off[k][1] }))
  g.add(noOutline(litOutlined(ball(0.7, glowc, { y: 4.1, z: -3.3 }, [1, 0.5, 1]), glowc, 0.9)))
  return g
}

/** 单只分体手柄（平放），side = -1 左 / 1 右 */
function joyCon(col: string, side: number) {
  const g = new THREE.Group()
  g.add(rbox(3.6, 1.4, 10.2, col, {}, 1.0))
  const zs = side < 0 ? -2.0 : 1.6
  const zb = side < 0 ? 1.6 : -2.0
  g.add(cyl(0.5, 0.5, 0.5, BLACK, { y: 1.3, z: zs }, 12))
  g.add(puck(0.95, 0.5, shade(col, -0.35), { y: 1.7, z: zs }))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2
    g.add(ball(0.36, BLACK, { x: Math.cos(a) * 0.75, y: 1.4, z: zb + Math.sin(a) * 0.75 }))
  }
  g.add(rbox(0.6, 0.3, 0.6, BLACK, { x: side * -0.6, y: 1.3, z: -4.0 }, 0.12))
  g.add(rbox(3.0, 0.8, 0.8, shade(col, -0.12), { y: 0.3, z: -5.35 }, 0.3))
  return g
}

/** 分体手柄一对：[左, 右, 腕带] */
function joyConPair(p: string[]) {
  const [l, r, strap] = p
  const g = new THREE.Group()
  g.add(P(joyCon(l, -1), -2.3, 0, 0))
  g.add(P(joyCon(r, 1), 2.3, 0, 0))
  g.add(P(joyCon(strap, 1), 8.4, 0, 0.6, 0, -0.25))
  return g
}

function padPSDef(p: string[]) {
  return padPS(p[0], p[1], p[2])
}

/** 手柄充电座 + 两个手柄：[底座, 手柄, 摇杆帽] */
function padDock(p: string[]) {
  const [base, body, acc] = p
  const g = new THREE.Group()
  g.add(rbox(34, 3, 8, base, {}, 1.2))
  g.add(noOutline(litOutlined(rbox(30, 0.4, 0.3, BLUE, { y: 1.2, z: 4.05 }, 0.1), BLUE, 0.8)))
  const th = PI / 2 - 0.25
  for (const s of [-1, 1]) {
    const pad = padPS(body, acc, BLACK)
    // 手柄竖起来、握把朝下插进底座
    g.add(P(pad, s * 8.4, 3 + 5.0, -2.2, th))
  }
  return g
}

/** Switch 风掌机（平放）：[左手柄, 右手柄, 屏幕点缀] */
function handheld(p: string[]) {
  const [l, r, acc] = p
  const g = new THREE.Group()
  g.add(rbox(17, 1.3, 10.2, DARK, {}, 0.6))
  g.add(flat(14.4, 8.2, SCREEN, 0, 1.1, 0, 0.5))
  flatIcons(g, 12, 7, 1.4, 4, 2, acc)
  g.add(P(joyCon(l, -1), -10.3, 0, 0))
  g.add(P(joyCon(r, 1), 10.3, 0, 0))
  return g
}

/** 一体式掌机 + 充电支架：[机身, 支架, 屏幕点缀] */
function handheldStand(p: string[]) {
  const [body, stand, acc] = p
  const g = new THREE.Group()
  const dev = new THREE.Group()
  dev.add(rbox(18.6, 1.4, 9.2, body, {}, 1.2))
  dev.add(rbox(11.8, 0.4, 7.2, DARK, { y: 1.2 }, 0.2))
  dev.add(flat(10.6, 6.2, SCREEN, 0, 1.45, 0, 0.5))
  flatIcons(dev, 9, 5, 1.75, 3, 2, acc)
  for (const s of [-1, 1]) {
    const zs = s < 0 ? -1.6 : 1.4
    dev.add(cyl(0.5, 0.5, 0.5, BLACK, { x: s * 7.6, y: 1.3, z: s < 0 ? zs : -zs }, 12))
    dev.add(puck(0.95, 0.5, shade(body, -0.35), { x: s * 7.6, y: 1.7, z: s < 0 ? zs : -zs }))
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2
    dev.add(ball(0.36, BLACK, { x: 7.6 + Math.cos(a) * 0.75, y: 1.45, z: 1.6 + Math.sin(a) * 0.75 }))
    dev.add(rbox(0.6, 0.3, 0.6, BLACK, { x: -7.6 + Math.cos(a) * 0.75, y: 1.3, z: 1.6 + Math.sin(a) * 0.75 }, 0.12))
  }
  const th = PI / 2 - 0.3
  g.add(rbox(12, 1, 7, stand, { z: -0.5 }, 0.5))
  // 设备底边：局部 (z = 4.6, y = 0) → 世界 y' = -4.6 sinθ
  const gy = 1 + 4.6 * Math.sin(th)
  g.add(P(dev, 0, gy, 0, th))
  g.add(rbox(12, 1.4, 0.8, stand, { y: 1, z: 4.6 * Math.cos(th) + 1.4 * Math.sin(th) + 0.45 }, 0.3))
  const [by, bz] = rotX(th, -0.35, -1.5)
  g.add(strut3([0, 1, -3.4], [0, gy + by, bz], 6, 0.6, stand))
  return g
}

/** 复古掌机（Game Boy 风，立着）：[机身, A/B 键, 屏框] */
function gameBoy(p: string[]) {
  const [body, ab, bezel] = p
  const g = new THREE.Group()
  g.add(rbox(9, 14.8, 3.2, body, {}, 0.8))
  g.add(rbox(7.6, 6, 0.4, bezel, { y: 7.8, z: 1.75 }, 0.5))
  g.add(glow(4.8, 4.3, '#b6c95a', { y: 8.6, z: 2.15 }, 0.35))
  g.add(led(-3.1, 10.8, 2.0, RED, 0.22))
  g.add(P(rbox(2.4, 0.8, 0.8, BLACK, {}, 0.2), -2.4, 4.6, 1.8))
  g.add(P(rbox(0.8, 2.4, 0.8, BLACK, {}, 0.2), -2.4, 4.6, 1.8))
  g.add(cylZ(0.8, 0.8, ab, 1.6, 4.0, 1.8))
  g.add(cylZ(0.8, 0.8, ab, 3.3, 4.9, 1.8))
  for (const s of [-1, 1]) g.add(P(rbox(1.4, 0.4, 0.5, M.gray, {}, 0.15), s * 0.9, 2.2, 1.75, 0, 0, 0.45))
  for (let i = 0; i < 5; i++) g.add(noOutline(P(rbox(0.3, 1.8, 0.3, shade(body, -0.15), {}, 0.1), 2.3 + i * 0.5, 1.3, 1.65, 0, 0, -0.45)))
  return g
}

/** VR 头显（放在桌上）：[机身, 面板, 头带] */
function vrHeadset(p: string[]) {
  const [body, face, strap] = p
  const g = new THREE.Group()
  g.add(rbox(18, 10, 8.5, body, { z: 2 }, 3))
  g.add(rbox(16.4, 8.6, 1, face, { y: 0.7, z: 6.5 }, 2.4))
  for (const sx of [-1, 1]) for (const sy of [0, 1]) g.add(cylZ(0.5, 0.4, BLACK, sx * 6.2, 2.2 + sy * 5.8, 7.15, 12))
  g.add(rbox(15.6, 7.6, 2, shade(strap, -0.1), { y: 1.2, z: -3.2 }, 2))
  const band = torus(9.2, 0.9, strap, { y: 1.0, z: -8.5, rx: PI / 2 })
  band.scale.set(1, 1.15, 1)
  g.add(band)
  g.add(rbox(8, 4.5, 3, strap, { y: 0, z: -18.5 }, 1.2))
  return g
}

/** 街机摇杆：[机身, 面板, 按键] */
function arcadeStick(p: string[]) {
  const [body, panel, btn] = p
  const g = new THREE.Group()
  g.add(rbox(34, 5.5, 20, body, {}, 1.4))
  g.add(rbox(32.6, 0.5, 18.6, panel, { y: 5.3 }, 0.25))
  g.add(cyl(2.3, 2.3, 0.3, BLACK, { x: -9.5, y: 5.8 }, 20))
  g.add(cyl(0.45, 0.45, 6, M.silver, { x: -9.5, y: 6.1 }, 10))
  g.add(ball(1.9, btn, { x: -9.5, y: 13.2 }))
  const cols = [btn, C.sky, C.lemon, C.mint, btn, C.sky, C.lemon, C.mint]
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 4; i++) {
      const x = 0 + i * 3.6
      const z = -2 + row * 3.6 + (i === 0 ? 0.9 : i === 1 ? 0 : 0.3)
      g.add(cyl(1.5, 1.5, 0.4, BLACK, { x, y: 5.8, z }, 20))
      g.add(puck(1.25, 0.7, cols[row * 4 + i], { x, y: 6.1, z }))
    }
  g.add(cyl(0.7, 0.7, 0.5, M.light, { x: 14, y: 5.8, z: -7.6 }, 14))
  return g
}

/** 电竞鼠标 + 大桌垫：[桌垫, 鼠标, RGB] */
function mouseMat(p: string[]) {
  const [mat, body, rgb] = p
  const g = new THREE.Group()
  const W = 80
  const D = 35
  g.add(rbox(W, 0.4, D, mat, {}, 0.2))
  for (const s of [-1, 1]) {
    g.add(noOutline(litOutlined(rbox(W + 0.4, 0.5, 0.5, rgb, { z: s * (D / 2), y: 0 }, 0.2), rgb, 0.8)))
    g.add(noOutline(litOutlined(rbox(0.5, 0.5, D - 0.6, rgb, { x: s * (W / 2), y: 0 }, 0.2), rgb, 0.8)))
  }
  const mx = 28
  const mz = 3
  g.add(ball(3.2, body, { x: mx, y: 2.3, z: mz }, [1, 0.6, 1.95]))
  g.add(cylX(0.65, 0.8, rgb, mx, 3.95, mz - 2.6, 16))
  g.add(noOutline(litOutlined(ball(0.7, rgb, { x: mx, y: 3.6, z: mz + 2.8 }, [1, 0.35, 1]), rgb, 0.9)))
  for (let i = 0; i < 2; i++) g.add(rbox(0.5, 0.6, 1.3, BLACK, { x: mx - 3.05, y: 2.1, z: mz - 1.6 + i * 1.6 }, 0.2))
  return g
}

/**
 * 机械键盘：60% / TKL / 全尺寸。
 * 朴素版 [外壳, 键帽, 点缀键]；RGB 版 [外壳, 键帽, 点缀键, 灯色1, 灯色2, 灯色3]（键帽下逐行渐变透光 + 三面灯带）
 */
function mechKeyboard(kind: '60' | 'tkl' | 'full', rgb = false) {
  return (p: string[]) => {
    const [cs, key, acc] = p
    const lights = [p[3] ?? BLUE, p[4] ?? p[3] ?? BLUE, p[5] ?? p[3] ?? BLUE]
    const g = new THREE.Group()
    const U = 1.9
    const B = 1.0
    const MAIN: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
      [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
      [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
      [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
      [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
    ]
    const FROW = [1, -1, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1]
    const NAV: number[][] = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [], [-1, 1, -1], [1, 1, 1]]
    const PAD: number[][] = [[], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1]]
    const fr = kind !== '60'
    const units = kind === '60' ? 15 : kind === 'tkl' ? 18.5 : 23
    const rowsU = fr ? 6.25 : 5
    const W = units * U + B * 2
    const D = rowsU * U + B * 2
    g.add(rbox(W, 2.4, D, cs, {}, 0.8))
    const mod = shade(key, -0.1)
    const rowZ = (ri: number) => -D / 2 + B + (ri + 0.5) * U + (fr && ri > 0 ? 0.25 * U : 0)
    const nRows = fr ? 6 : 5
    if (rgb) {
      // 键帽下面一层发光板（每行一种颜色，渐变感），从键帽缝里透出来
      for (let ri = 0; ri < nRows; ri++) {
        const col = lights[Math.min(2, Math.floor((ri / nRows) * 3))]
        g.add(noOutline(litOutlined(rbox(W - 2 * B + 0.2, 0.4, U, col, { y: 2.3, z: rowZ(ri) }, 0.1), col, 0.85)))
      }
      g.add(noOutline(litOutlined(rbox(W - 2, 0.5, 0.4, lights[0], { y: 0.6, z: D / 2 + 0.1 }, 0.1), lights[0], 0.85)))
      for (const s of [-1, 1]) g.add(noOutline(litOutlined(rbox(0.4, 0.5, D - 2, lights[s < 0 ? 1 : 2], { x: s * (W / 2 + 0.1), y: 0.6 }, 0.1), lights[s < 0 ? 1 : 2], 0.85)))
    } else if (kind === 'full') {
      for (let k = 0; k < 3; k++) g.add(led(W / 2 - B - 5.6 + k * 1.9, 2.55, rowZ(0), GREEN, 0.18))
    }
    const put = (row: number[], ri: number, x0: number, special?: (i: number, w: number) => string | null) => {
      let x = x0
      row.forEach((w, i) => {
        if (w < 0) {
          x += -w * U
          return
        }
        const col = special?.(i, w) ?? (w > 1.1 && w < 6 ? mod : key)
        g.add(rbox(w * U - 0.3, 1.0, U - 0.3, col, { x: x + (w * U) / 2, y: 2.0, z: rowZ(ri) }, 0.3))
        x += w * U
      })
    }
    const x0 = -W / 2 + B
    if (fr) put(FROW, 0, x0, (i) => (i === 0 ? acc : null))
    MAIN.forEach((row, r) =>
      put(row, r + (fr ? 1 : 0), x0, (i, w) => {
        if (!fr && r === 0 && i === 0) return acc
        if (r === 2 && i === row.length - 1) return acc
        if (w === 6.25) return key
        return null
      }),
    )
    if (kind !== '60') NAV.forEach((row, r) => put(row, r, x0 + 15.5 * U))
    if (kind === 'full') PAD.forEach((row, r) => put(row, r, x0 + 19 * U, (i) => (r === 5 && i === 2 ? acc : null)))
    return g
  }
}

/** USB 电容麦（桌面支架 + 防震架）：[麦身, 网罩, 支架] */
function micCondenser(p: string[]) {
  const [body, grill, stand] = p
  const g = new THREE.Group()
  g.add(puck(6, 1.6, stand))
  g.add(cyl(0.6, 0.6, 8, stand, { y: 1.6 }, 12))
  // 防震架：两个圆环 + 竖向连杆
  const cy = 17
  g.add(rbox(1.4, 1.2, 1.4, stand, { y: 9.4 }, 0.3))
  g.add(rod3([0, 10.4, 0], [0, cy - 4.2, -3.3], 0.4, stand))
  for (const yy of [cy - 3, cy + 3]) g.add(torus(3.3, 0.3, stand, { y: yy, rx: PI / 2 }))
  for (const s of [-1, 1]) g.add(rod3([s * 3.3, cy - 3, 0], [s * 3.3, cy + 3, 0], 0.25, stand))
  g.add(rod3([0, cy - 3, -3.3], [0, cy + 3, -3.3], 0.25, stand))
  g.add(capsule(2.4, 8, body, { y: cy - 6.4 }))
  g.add(capsule(2.5, 2.4, grill, { y: cy + 0.4 }))
  g.add(torus(2.5, 0.3, shade(body, 0.15), { y: cy + 0.3, rx: PI / 2 }))
  g.add(led(0, cy - 1.2, 2.4, GREEN, 0.25))
  return g
}

/** 动圈麦（桌面短支架，横着）：[麦身, 防风罩, 支架] */
function micDynamic(p: string[]) {
  const [body, foam, stand] = p
  const g = new THREE.Group()
  g.add(puck(6.5, 1.8, stand))
  g.add(cyl(0.7, 0.7, 7, stand, { y: 1.8 }, 12))
  const cy = 12
  g.add(torus(3.2, 0.35, stand, { y: cy, rz: PI, ry: 0 }, PI))
  for (const s of [-1, 1]) g.add(cylX(0.9, 0.6, M.silver, s * 3.3, cy, 0, 14))
  g.add(P(capsule(2.6, 9, body), 0, cy, -1, PI / 2 - 0.15))
  g.add(ball(3.1, foam, { y: cy + 0.9, z: 6.4 }, [1, 1, 0.9]))
  g.add(cylZ(1.0, 1.6, M.silver, 0, cy - 1.0, -8.4))
  return g
}

/** 悬臂支架麦：[支架, 麦身, 网罩] */
function micBoom(p: string[]) {
  const [arm, body, grill] = p
  const g = new THREE.Group()
  const z0 = -16
  g.add(rbox(6, 3, 8, arm, { z: z0 }, 0.8))
  g.add(cyl(1.0, 1.0, 6, arm, { y: 3, z: z0 }, 14))
  g.add(cyl(1.6, 1.6, 2, shade(arm, -0.1), { y: 8.5, z: z0 }, 16))
  const e: [number, number, number] = [0, 36, z0 + 14]
  const t: [number, number, number] = [0, 30, z0 + 30]
  for (const dx of [-0.9, 0.9]) {
    g.add(rod3([dx, 10, z0], [dx, e[1], e[2]], 0.5, arm))
    g.add(rod3([dx, e[1], e[2]], [dx, t[1], t[2]], 0.45, arm))
  }
  g.add(rod3([0, 14, z0 + 1.5], [0, 28, z0 + 10], 0.25, M.silver))
  g.add(cylX(1.4, 3, shade(arm, -0.1), 0, e[1], e[2]))
  g.add(cylX(1.1, 3, shade(arm, -0.1), 0, t[1], t[2]))
  // 防震架 + 倒挂的麦
  g.add(rod3([0, t[1], t[2]], [0, t[1] - 3.5, t[2]], 0.4, arm))
  g.add(torus(3.4, 0.3, arm, { y: t[1] - 5, z: t[2], rx: PI / 2 }))
  g.add(torus(3.4, 0.3, arm, { y: t[1] - 12, z: t[2], rx: PI / 2 }))
  for (const s of [-1, 1]) g.add(rod3([s * 3.4, t[1] - 12, t[2]], [s * 3.4, t[1] - 5, t[2]], 0.25, arm))
  g.add(capsule(2.4, 9, body, { y: t[1] - 18.2, z: t[2] }))
  g.add(capsule(2.5, 2, grill, { y: t[1] - 18.4, z: t[2] }))
  return g
}

/** 领夹麦（无线发射器 ×2 + 接收器）：[机身, 点缀, 屏幕] */
function lavalier(p: string[]) {
  const [body, acc, scr] = p
  const g = new THREE.Group()
  g.add(rbox(6, 1.8, 7.2, shade(body, -0.06), {}, 0.6))
  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * 2.9
    g.add(rbox(2.6, 2.4, 3.2, body, { x, y: 1.8, z: -1 }, 0.6))
    g.add(rbox(1.2, 1, 1.2, acc, { x, y: 4.2, z: -1 }, 0.4))
    g.add(led(x, 3.2, 0.62, GREEN, 0.18))
  }
  g.add(rbox(3.4, 2.2, 1.2, body, { x: 6, z: -1.5 }, 0.4))
  g.add(glow(2.4, 1.3, scr, { x: 6, y: 0.5, z: -0.6 }, 0.6))
  g.add(cyl(0.4, 0.4, 2.2, acc, { x: 6.6, y: 2.2, z: -1.5 }, 10))
  // 夹子小麦 + 线
  g.add(P(capsule(0.35, 0.8, BLACK), 1.0, 0.35, 5.6, 0, 0, PI / 2))
  g.add(torus(1.5, 0.12, BLACK, { x: 3.4, y: 0.15, z: 5.4, rx: PI / 2 }))
  return g
}

/** 枪麦（带防震架和小底座，横着）：[麦身, 防风毛, 支架] */
function shotgunMic(p: string[]) {
  const [body, fur, stand] = p
  const g = new THREE.Group()
  g.add(rbox(7, 1.4, 5, stand, {}, 0.5))
  g.add(cyl(0.5, 0.5, 4, stand, { y: 1.4 }, 10))
  g.add(rbox(5, 1, 3, stand, { y: 5.2 }, 0.3))
  for (const s of [-1, 1]) g.add(torus(1.6, 0.25, stand, { y: 7.4, z: s * 1.8 }))
  g.add(cylZ(1.05, 14, body, 0, 7.4, 1.5, 20))
  g.add(cylZ(1.2, 1.4, M.silver, 0, 7.4, -6.2, 20))
  g.add(P(capsule(1.5, 6, fur), 0, 7.4, 7.8, PI / 2))
  return g
}

/**
 * 网络摄像头（夹式）：夹在显示器 / 电视顶边上——后脚贴着屏幕背面往下扣 CLIP_DROP，顶板搭在顶边上，前唇扣住屏幕正面上沿。
 * 原点在后脚底端（= 顶边往下 CLIP_DROP），后脚和前唇之间留 2.6 的缝夹住面板。[机身, 镜头圈, 夹脚]
 */
function webcamClip(p: string[]) {
  const [body, ring, foot] = p
  const g = new THREE.Group()
  const D = CLIP_DROP
  g.add(rbox(3.6, D + 0.6, 0.6, foot, { z: -1.6 }, 0.25))
  g.add(rbox(3.6, 0.6, 3.9, foot, { y: D, z: 0 }, 0.25))
  g.add(rbox(3.6, 1.4, 0.5, foot, { y: D - 0.8, z: 1.55 }, 0.2))
  g.add(cyl(0.7, 0.7, 1.2, foot, { y: D + 0.6, z: 0 }, 12))
  const cy = D + 3.4
  g.add(P(capsule(1.6, 6.4, body), 0, cy, 0, 0, 0, PI / 2))
  g.add(cylZ(1.15, 0.6, ring, 0, cy, 1.45))
  g.add(cylZ(0.7, 0.5, '#28466b', 0, cy, 1.75))
  for (const s of [-1, 1]) g.add(noOutline(cylZ(0.35, 0.3, BLACK, s * 2.4, cy, 1.5, 12)))
  g.add(led(1.3, cy + 1.1, 1.25, GREEN, 0.15))
  return g
}

/** 网络摄像头（迷你三脚架）：[机身, 镜头圈, 三脚架] */
function webcamTripod(p: string[]) {
  const [body, ring, leg] = p
  const g = new THREE.Group()
  tripodLegs(g, 5, 7, 0.35, leg)
  g.add(cyl(0.6, 0.6, 2, leg, { y: 7 }, 12))
  g.add(ball(1, leg, { y: 9.4 }))
  g.add(rbox(9, 3.4, 3.4, body, { y: 10.2 }, 1.4))
  g.add(cylZ(1.3, 0.6, ring, 0, 11.9, 1.95))
  g.add(cylZ(0.8, 0.5, '#28466b', 0, 11.9, 2.25))
  g.add(led(2.6, 12.6, 1.8, GREEN, 0.18))
  return g
}

/** 电视机顶摄像头（条形）：和夹式摄像头一样扣在屏幕顶边上（原点在后脚底端），缝宽 3.2 夹得住电视面板 [机身, 夹座, 镜头圈] */
function tvCamera(p: string[]) {
  const [body, foot, ring] = p
  const g = new THREE.Group()
  const D = CLIP_DROP
  g.add(rbox(8, D + 0.6, 0.6, foot, { z: -1.9 }, 0.25))
  g.add(rbox(8, 0.6, 4.4, foot, { y: D, z: 0 }, 0.25))
  g.add(rbox(8, 1.4, 0.5, foot, { y: D - 0.8, z: 1.85 }, 0.2))
  const y = D + 0.6
  g.add(rbox(22, 3.4, 4.4, body, { y, z: 0.3 }, 1.2))
  g.add(cylZ(1.3, 0.5, ring, 0, y + 1.7, 2.65))
  g.add(cylZ(0.8, 0.4, '#28466b', 0, y + 1.7, 2.9))
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(noOutline(cylZ(0.2, 0.4, BLACK, s * (5 + i * 0.9), y + 1.7, 2.55, 8)))
  g.add(led(3, y + 2.6, 2.5, BLUE, 0.15))
  return g
}

/** 采集卡：[机身, 灯条, 线材] */
function captureCard(p: string[]) {
  const [body, l, cable] = p
  const g = new THREE.Group()
  g.add(rbox(11, 2.2, 7.5, body, {}, 0.8))
  g.add(noOutline(litOutlined(rbox(6, 0.3, 0.3, l, { y: 2.1, z: 2.6 }, 0.1), l, 0.9)))
  for (const s of [-1, 1]) {
    g.add(rbox(1.8, 0.9, 1.2, BLACK, { x: s * 2.5, y: 0.6, z: -4.3 }, 0.2))
    g.add(rbox(1.6, 0.8, 2.4, cable, { x: s * 2.5, y: 0.65, z: -6.1 }, 0.25))
    g.add(cylZ(0.35, 3, cable, s * 2.5, 1.05, -8.8, 10))
  }
  return g
}

/** Stream Deck 风按键面板：[机身, 支架, 键色] */
function streamDeck(p: string[]) {
  const [body, stand, acc] = p
  const g = new THREE.Group()
  g.add(rbox(10, 1, 7, stand, {}, 0.4))
  const th = 0.6
  const dev = new THREE.Group()
  dev.add(rbox(12, 8.4, 1.8, body, {}, 0.8))
  const cols = [acc, '#ffffff', '#fff3b0', '#c9f0dc', '#ffd6e0', BLUE, acc, '#d6e4ff']
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) dev.add(glow(1.6, 1.6, cols[(i + j * 5) % cols.length], { x: (i - 2) * 2.2, y: 1.4 + j * 2.2, z: 1.1 }, 0.7))
  g.add(P(dev, 0, 1, 0.8, -th))
  const [sy, sz] = rotX(-th, 6.8, -1.2)
  g.add(strut3([0, 1, -3.2], [0, 1 + sy, 0.8 + sz], 6, 0.6, stand))
  return g
}

/** 声卡（音频接口）：[机身, 面板, 旋钮] */
function audioInterface(p: string[]) {
  const [body, panel, knob] = p
  const g = new THREE.Group()
  g.add(rbox(18, 4.6, 11, body, {}, 1))
  g.add(rbox(17, 3.8, 0.4, panel, { y: 0.4, z: 5.6 }, 0.2))
  g.add(cylZ(1.6, 1.4, knob, 0, 2.3, 6.4, 28))
  g.add(torus(1.9, 0.18, GREEN, { y: 2.3, z: 6.0 }))
  for (const s of [-1, 1]) {
    g.add(cylZ(0.9, 0.8, knob, s * 4.0, 2.6, 6.1))
    g.add(cylZ(1.1, 0.6, BLACK, s * 7.0, 2.3, 6.0))
    g.add(led(s * 4.0, 1.0, 5.95, s < 0 ? GREEN : AMBER, 0.2))
  }
  return g
}

/** 小型调音台：[机身, 面板, 推子帽] */
function mixer(p: string[]) {
  const [body, panel, cap] = p
  const g = new THREE.Group()
  g.add(rbox(28, 3, 22, body, {}, 1))
  g.add(rbox(28, 3, 8, body, { y: 2, z: -7 }, 1))
  g.add(rbox(26.4, 0.3, 20, panel, { y: 2.9, z: 0.4 }, 0.1))
  for (let i = 0; i < 6; i++) {
    const x = -11 + i * 3.6
    for (let k = 0; k < 3; k++) g.add(cyl(0.6, 0.6, 0.9, k === 0 ? C.red : M.light, { x, y: 3.1, z: -5.5 + k * 2.6 }, 14))
    g.add(noOutline(rbox(0.3, 0.3, 7, BLACK, { x, y: 3.15, z: 5.5 }, 0.1)))
    g.add(rbox(1.4, 0.9, 1, cap, { x, y: 3.2, z: 4 + (i % 3) * 1.4 }, 0.25))
    g.add(cylZ(0.8, 0.6, BLACK, x, 3.5, -10.2))
  }
  for (let k = 0; k < 6; k++) g.add(led(11.6, 3.35, 4 - k * 1.1, k < 2 ? RED : k < 3 ? AMBER : GREEN, 0.25))
  return g
}

/** 环形补光灯（桌面款，带手机夹）：[支架, 灯圈外壳, 灯光] */
function ringLightDesk(p: string[]) {
  const [stand, ring, light] = p
  const g = new THREE.Group()
  tripodLegs(g, 9, 8, 0.45, stand)
  g.add(cyl(0.7, 0.7, 13, stand, { y: 7.6 }, 12))
  const cy = 20.6 + 13.5
  g.add(torus(13, 1.5, ring, { y: cy, z: -0.4 }))
  g.add(noOutline(litOutlined(torus(13, 1.05, light, { y: cy, z: 0.5 }), light, 0.9)))
  g.add(rbox(1.2, 13.5, 1, stand, { y: 20.6, z: -0.2 }, 0.3))
  g.add(rbox(7.4, 14.6, 0.9, DARK, { y: cy - 7.3, z: 0.6 }, 0.5))
  g.add(glow(6.6, 13.4, SCREEN, { y: cy - 6.7, z: 1.15 }, 0.5))
  return g
}

/** 环形补光灯（落地款）：[支架, 灯圈外壳, 灯光] */
function ringLightFloor(p: string[]) {
  const [stand, ring, light] = p
  const g = new THREE.Group()
  tripodLegs(g, 32, 60, 0.9, stand)
  g.add(cyl(1.4, 1.4, 70, stand, { y: 58 }, 14))
  g.add(cyl(1.0, 1.0, 40, M.silver, { y: 127 }, 12))
  g.add(cyl(1.8, 1.8, 3, shade(stand, -0.1), { y: 126 }, 14))
  const cy = 167 + 23
  g.add(torus(23, 2.2, ring, { y: cy, z: -0.5 }))
  g.add(noOutline(litOutlined(torus(23, 1.6, light, { y: cy, z: 0.9 }), light, 0.9)))
  g.add(rbox(2, 23, 1.6, stand, { y: 167, z: -0.3 }, 0.5))
  g.add(rbox(8, 16, 1, DARK, { y: cy - 8, z: 0.7 }, 0.5))
  g.add(glow(7.2, 14.8, SCREEN, { y: cy - 7.4, z: 1.3 }, 0.5))
  return g
}

/** 柔光箱灯（落地）：[支架, 柔光箱, 柔光布] */
function softbox(p: string[]) {
  const [stand, box, cloth] = p
  const g = new THREE.Group()
  tripodLegs(g, 34, 55, 0.9, stand)
  g.add(cyl(1.3, 1.3, 70, stand, { y: 53 }, 14))
  g.add(cyl(0.9, 0.9, 40, M.silver, { y: 122 }, 12))
  const cy = 170
  g.add(cylZ(3.5, 8, DARK, 0, cy, -14))
  g.add(rod3([0, 160, 0], [0, cy - 3.5, -12], 0.9, stand))
  // 方形柔光箱：前大后小的棱台（4 段圆台转 45° 成方形）
  const m = new THREE.Mesh(new THREE.CylinderGeometry(41.4, 10, 26, 4, 1), toon(box))
  m.position.set(0, cy, 0)
  m.rotation.set(PI / 2, PI / 4, 0)
  m.castShadow = true
  g.add(m)
  const front = rbox(58.5, 58.5, 0.6, cloth, { y: cy - 29.25, z: 13.2 }, 1)
  front.material = toon(cloth, { emissive: 0.5 })
  g.add(front)
  return g
}

/** 绿幕（落地卷轴款）：[卷轴盒, 幕布, 撑杆] */
function greenScreen(p: string[]) {
  const [caseC, cloth, pole] = p
  const g = new THREE.Group()
  g.add(rbox(150, 9, 12, caseC, {}, 2.5))
  for (const s of [-1, 1]) g.add(rbox(6, 1.6, 40, caseC, { x: s * 70 }, 0.6))
  g.add(rbox(144, 175, 0.6, cloth, { y: 7.5, z: 0.5 }, 0.3))
  g.add(rbox(146, 2, 2, pole, { y: 182, z: 0.5 }, 0.8))
  g.add(cyl(1, 1, 176, pole, { y: 8, z: -2 }, 12))
  return g
}

/** 监听音箱一对：[箱体, 低音单元, 点缀圈] */
function studioMonitors(p: string[]) {
  const [body, cone, ring] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 20
    const k = new THREE.Group()
    k.add(rbox(17, 25, 20, body, {}, 1.8))
    k.add(cylZ(6, 0.8, BLACK, 0, 9, 10.2, 32))
    k.add(cylZ(5, 0.8, cone, 0, 9, 10.5, 32))
    k.add(ball(1.6, shade(cone, -0.15), { y: 9, z: 10.8 }, [1, 1, 0.5]))
    k.add(cylZ(2.6, 0.8, BLACK, 0, 19.5, 10.2, 24))
    k.add(cylZ(1.4, 0.8, ring, 0, 19.5, 10.5, 20))
    k.add(rbox(10, 1.2, 0.4, ring, { y: 1.6, z: 10.1 }, 0.2))
    k.add(led(5.6, 23, 10.2, BLUE, 0.25))
    g.add(P(k, x, 0, 0, 0, -s * 0.15))
  }
  return g
}

/** 手机直播支架（桌面，带小补光灯）：[支架, 手机, 补光灯] */
function phoneLiveStand(p: string[]) {
  const [stand, phone, light] = p
  const g = new THREE.Group()
  g.add(puck(6, 1.2, stand))
  g.add(cyl(0.6, 0.6, 22, stand, { y: 1.2 }, 12))
  g.add(cyl(0.45, 0.45, 8, M.silver, { y: 23 }, 12))
  // 手机夹 + 竖屏手机
  g.add(rbox(3, 2, 2, stand, { y: 30.5, z: 0 }, 0.4))
  g.add(rbox(7.6, 16, 0.9, phone, { y: 31.5, z: 1.4 }, 0.6))
  g.add(glow(6.8, 15, SCREEN, { y: 32, z: 2.05 }, 0.5))
  g.add(rbox(8.2, 1.4, 1.8, stand, { y: 31, z: 1.4 }, 0.4))
  // 侧边小补光灯
  g.add(rod3([0, 26, 0], [9, 32, 0], 0.4, stand))
  g.add(rbox(6, 6, 1.6, stand, { x: 10.5, y: 31, z: 0.2 }, 0.8))
  g.add(glow(5, 5, light, { x: 10.5, y: 31.5, z: 1.2 }, 0.85))
  return g
}

// ====================================================================
// 相机 / 镜头
// ====================================================================

interface LensOpt {
  len: number
  rm: number
  rf: number
  hood?: number
  bulb?: boolean
  rings?: number
  stripe?: boolean
}

/** 竖放镜头（卡口朝下、前盖朝上），原点在后盖底面。[镜身, 对焦环, 点缀环] */
function lensBody(o: LensOpt, body: string, ring: string, acc: string, withCap = true, rear = true) {
  const g = new THREE.Group()
  if (rear) g.add(cyl(o.rm * 0.95, o.rm * 0.95, 1.2, BLACK, {}, 28))
  const yr = rear ? 1.2 : 0
  g.add(cyl(o.rm * 0.98, o.rm * 0.98, 0.6, M.silver, { y: yr }, 28))
  const L = o.len
  const y0 = yr + 0.6
  // 镜身：后段细、前段粗
  g.add(cyl(o.rm, o.rm, L * 0.35, body, { y: y0 }, 32))
  g.add(cyl(o.rf, o.rm, L * 0.12, body, { y: y0 + L * 0.35 }, 32))
  g.add(cyl(o.rf, o.rf, L * 0.53, body, { y: y0 + L * 0.47 }, 32))
  const nr = o.rings ?? 1
  for (let i = 0; i < nr; i++) {
    const yy = y0 + L * (nr === 1 ? 0.6 : 0.5 + i * 0.25)
    const rr = yy > y0 + L * 0.47 ? o.rf : o.rm
    g.add(cyl(rr + 0.15, rr + 0.15, L * 0.16, ring, { y: yy }, 32))
  }
  if (o.stripe) g.add(cyl(o.rf + 0.05, o.rf + 0.05, 0.4, acc, { y: y0 + L - 1.6 }, 32))
  const top = y0 + L
  if (o.bulb) g.add(ball(o.rf * 0.9, '#9fc6e8', { y: top - o.rf * 0.5 }, [1, 0.7, 1]))
  if (!withCap && !o.bulb) g.add(cyl(o.rf * 0.78, o.rf * 0.78, 0.3, '#28466b', { y: top - 0.1 }, 28))
  if (withCap && !o.bulb) {
    g.add(cyl(o.rf - 0.1, o.rf - 0.1, 0.7, BLACK, { y: top }, 32))
    g.add(torus(o.rf * 0.55, 0.12, M.gray, { y: top + 0.72, rx: PI / 2 }))
  }
  if (o.hood) {
    const hr = o.rf + 0.4
    g.add(cup(o.bulb ? hr + 1.2 : hr + 0.8, hr, o.hood, 0.4, BLACK, { y: top - 1.2 }))
  }
  return g
}

function lensDef(o: LensOpt) {
  return (p: string[]) => lensBody(o, p[0], p[1], p[2])
}

/** 相机机身（无反 / 单反）+ 镜头。[机身, 握把皮纹, 点缀] */
function camera(kind: 'mirrorless' | 'dslr') {
  return (p: string[]) => {
    const [body, grip, acc] = p
    const g = new THREE.Group()
    const dslr = kind === 'dslr'
    const W = dslr ? 14.6 : 12.8
    const H = dslr ? 10.4 : 8.4
    const D = dslr ? 7.6 : 4.6
    g.add(rbox(W, H - 1, D, body, {}, 1.2))
    g.add(rbox(W - 0.6, H - 4, D + 0.6, grip, { y: 1.4 }, 0.8))
    // 握把（从正面看在左侧）
    g.add(rbox(3.2, H - 1.4, D + (dslr ? 2.2 : 2.6), body, { x: -W / 2 + 1.8, z: 0.9 }, 1.3))
    // 取景器凸起
    g.add(rbox(dslr ? 6 : 4.6, dslr ? 3 : 2.4, D - 1, body, { y: H - 1.6, z: -0.3 }, 0.8))
    g.add(cyl(1.1, 1.1, 0.9, M.char, { x: -W / 2 + 2, y: H - 1.05, z: 0.6 }, 20))
    g.add(cyl(0.55, 0.55, 0.5, acc, { x: -W / 2 + 2.3, y: H - 0.15, z: 2.2 }, 14))
    g.add(cyl(1.0, 1.0, 0.8, M.char, { x: W / 2 - 2.2, y: H - 1.05, z: 0 }, 20))
    // 背屏
    g.add(glow(W * 0.55, H * 0.5, SCREEN, { x: 0.6, y: 1.4, z: -D / 2 - 0.6, ry: PI }, 0.4))
    // 镜头：卡口贴在机身正面，水平朝前
    const lensO: LensOpt = dslr ? { len: 9.6, rm: 3.4, rf: 4.1, rings: 2, stripe: true } : { len: 5.6, rm: 2.9, rf: 3.0, rings: 1 }
    const lx = 0.8
    const ly = H / 2 - 0.2
    g.add(cylZ(lensO.rm + 0.4, 0.4, M.silver, lx, ly, D / 2 + 0.2, 28))
    g.add(P(lensBody(lensO, BLACK, RUBBER, acc, false, false), lx, ly, D / 2 + 0.4, PI / 2))
    return g
  }
}

/** 复古胶片相机（旁轴）：[上下盖, 蒙皮, 点缀] */
function filmCamera(p: string[]) {
  const [chrome, leather, acc] = p
  const g = new THREE.Group()
  g.add(rbox(13.6, 1.4, 3.6, chrome, {}, 0.6))
  g.add(rbox(13.4, 4.4, 3.4, leather, { y: 1.3 }, 0.5))
  g.add(rbox(13.6, 2.2, 3.6, chrome, { y: 5.6 }, 0.6))
  g.add(rbox(3.4, 1.0, 0.4, '#a8c4d8', { x: -4.4, y: 6.2, z: 1.85 }, 0.15))
  g.add(rbox(1.4, 1.0, 0.4, '#a8c4d8', { x: 4.6, y: 6.2, z: 1.85 }, 0.15))
  g.add(cyl(1.0, 1.0, 1.0, chrome, { x: -4.6, y: 7.8 }, 18))
  g.add(cyl(0.9, 0.9, 0.8, chrome, { x: 4.4, y: 7.8 }, 18))
  g.add(cyl(0.4, 0.4, 0.5, acc, { x: 3.0, y: 7.8, z: 0.6 }, 12))
  g.add(cylZ(2.6, 0.8, chrome, 0.4, 3.8, 2.1))
  g.add(cylZ(2.2, 2.4, BLACK, 0.4, 3.8, 3.7))
  g.add(cylZ(2.35, 0.6, chrome, 0.4, 3.8, 4.4))
  g.add(cylZ(1.4, 0.3, '#28466b', 0.4, 3.8, 4.85))
  return g
}

/** 拍立得：[机身, 镜头圈, 点缀] */
function instantCamera(p: string[]) {
  const [body, ring, acc] = p
  const g = new THREE.Group()
  g.add(rbox(11, 12, 6.6, body, {}, 2))
  g.add(cylZ(3.6, 1.0, ring, -0.6, 5.2, 3.6, 32))
  g.add(cylZ(2.8, 1.2, BLACK, -0.6, 5.2, 4.3, 32))
  g.add(cylZ(1.5, 0.3, '#28466b', -0.6, 5.2, 5.0))
  g.add(rbox(2.6, 3.4, 0.5, '#f2f2ee', { x: 3.4, y: 7.6, z: 3.45 }, 0.3))
  g.add(rbox(1.6, 1.2, 0.5, '#a8c4d8', { x: 3.4, y: 3.2, z: 3.45 }, 0.3))
  g.add(cylZ(0.7, 0.5, acc, 3.6, 1.4, 3.4, 14))
  // 吐出一半的相纸
  g.add(rbox(5.4, 4, 0.2, PAPER, { x: -0.6, y: 12, z: 1.2 }, 0.05))
  g.add(noOutline(rbox(4.4, 2.6, 0.1, '#2b2b33', { x: -0.6, y: 13.2, z: 1.36 }, 0.03)))
  return g
}

/** 运动相机（带小三脚架）：[机身, 镜头圈, 三脚架] */
function actionCamera(p: string[]) {
  const [body, ring, leg] = p
  const g = new THREE.Group()
  tripodLegs(g, 4, 4.5, 0.3, leg)
  g.add(cyl(0.5, 0.5, 1.2, leg, { y: 4.4 }, 10))
  g.add(rbox(6.6, 4.6, 3.4, body, { y: 5.6 }, 0.6))
  g.add(rbox(2.6, 2.6, 0.6, BLACK, { x: -1.6, y: 6.6, z: 1.9 }, 0.4))
  g.add(cylZ(1.0, 0.6, ring, -1.6, 7.9, 2.5))
  g.add(cylZ(0.6, 0.3, '#28466b', -1.6, 7.9, 2.9))
  g.add(glow(2.0, 1.6, SCREEN, { x: 1.6, y: 7.0, z: 1.95 }, 0.5))
  g.add(led(2.5, 9.6, 1.0, RED, 0.2))
  return g
}

/** 手机云台稳定器（折叠站立）：[手柄, 臂, 手机] */
function gimbal(p: string[]) {
  const [handle, arm, phone] = p
  const g = new THREE.Group()
  tripodLegs(g, 5, 4, 0.35, BLACK)
  g.add(cyl(1.7, 1.6, 15, handle, { y: 3.6 }, 20))
  g.add(cylZ(0.7, 0.4, M.light, 0, 13, 1.65))
  g.add(cylZ(0.4, 0.4, RED, 0, 10.8, 1.65, 12))
  g.add(cyl(1.8, 1.8, 2, arm, { y: 18.6 }, 20))
  g.add(rbox(1.6, 9, 1.6, arm, { y: 20, x: 2.4 }, 0.6))
  g.add(rbox(6, 1.6, 1.6, arm, { y: 27.4, x: 0.2 }, 0.6))
  g.add(cylZ(1.4, 2.0, arm, -2.6, 28.2, 0.8))
  g.add(rbox(15, 7.4, 0.8, phone, { x: -2.6, y: 24.5, z: 2.2 }, 0.6))
  g.add(glow(14, 6.6, SCREEN, { x: -2.6, y: 24.9, z: 2.85 }, 0.5))
  return g
}

/** 三脚架（落地）：[腿, 云台, 点缀] */
function tripod(p: string[]) {
  const [leg, head, acc] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i / 3) * PI * 2
    const fx = Math.cos(a) * 34
    const fz = Math.sin(a) * 34
    g.add(rod3([fx, 1, fz], [fx * 0.5, 70, fz * 0.5], 0.7, leg))
    g.add(rod3([fx * 0.5, 70, fz * 0.5], [Math.cos(a) * 3, 128, Math.sin(a) * 3], 1.0, leg))
    g.add(ball(1.2, RUBBER, { x: fx, y: 1.2, z: fz }))
    g.add(cyl(1.3, 1.3, 2.4, acc, { x: fx * 0.5, y: 69 - 1.2, z: fz * 0.5 }, 12))
  }
  g.add(cyl(4.2, 3.2, 4, head, { y: 126 }, 20))
  g.add(cyl(1.0, 1.0, 14, M.silver, { y: 116 }, 12))
  g.add(ball(2.6, head, { y: 132 }))
  g.add(rbox(6, 1.6, 7, head, { y: 134 }, 0.5))
  g.add(rod3([0, 132, 0], [0, 128, 14], 0.6, head))
  return g
}

// ====================================================================
// 移动设备
// ====================================================================

/** 手机平放：[机身, 点缀, 壁纸] */
function phoneFlat(p: string[]) {
  const [body, acc, wall] = p
  const g = new THREE.Group()
  g.add(rbox(7.5, 0.8, 16, body, {}, 0.38))
  g.add(flat(6.9, 15.2, wall, 0, 0.62, 0, 0.45))
  flatIcons(g, 6, 12, 0.92, 4, 5, acc)
  g.add(flat(5.4, 1.4, '#ffffff', 0, 0.92, 6.4, 0.4, 0.2))
  g.add(noOutline(ball(0.22, BLACK, { y: 0.95, z: -7.0 })))
  g.add(rbox(0.3, 0.4, 1.8, body, { x: 3.8, y: 0.2, z: -3 }, 0.12))
  return g
}

/** 手机立着（手机壳自带支架）：[机身, 点缀, 壁纸] */
function phoneStanding(p: string[]) {
  const [body, acc, wall] = p
  const g = new THREE.Group()
  const th = 0.22
  const dev = new THREE.Group()
  dev.add(rbox(7.5, 16, 0.9, body, {}, 0.42))
  dev.add(glow(6.9, 15.2, wall, { y: 0.4, z: 0.6 }, 0.45))
  appIcons(dev, 6, 14, 0.4, 1.1, 4, 5, acc)
  dev.add(rbox(3, 3, 0.4, shade(body, -0.1), { x: -1.8, y: 12.2, z: -0.6 }, 0.6))
  for (const yy of [13.6, 12.2]) dev.add(cylZ(0.5, 0.4, BLACK, -2.4, yy + 0.3, -0.95, 14))
  g.add(P(dev, 0, 0, 0, -th))
  // 支架片：从机背中部撑到地面
  const [by, bz] = rotX(-th, 7, -0.75)
  g.add(strut3([0, by, bz], [0, 0.25, bz - 4.6], 4.4, 0.5, acc))
  return g
}

/** 折叠屏手机（半开立着）：[机身, 铰链, 壁纸] */
function foldPhone(p: string[]) {
  const [body, hinge, wall] = p
  const g = new THREE.Group()
  g.add(rbox(7.2, 0.75, 8.4, body, { z: 4.2 }, 0.35))
  g.add(flat(6.6, 7.6, wall, 0, 0.6, 4.3, 0.45))
  flatIcons(g, 5.6, 6.2, 0.9, 4, 3, hinge, 0, 4.5)
  g.add(cylX(0.5, 7.2, hinge, 0, 0.5, 0))
  const top = new THREE.Group()
  top.add(rbox(7.2, 8.4, 0.75, body, { z: -0.375 }, 0.35))
  top.add(glow(6.6, 7.6, wall, { y: 0.4, z: 0.15 }, 0.45))
  top.add(glow(3.2, 2.2, SCREEN, { x: 1.2, y: 5.4, z: -1.05, ry: PI }, 0.55))
  for (const xx of [-1.6, -0.4]) top.add(cylZ(0.45, 0.4, BLACK, xx, 6.9, -0.85, 14))
  g.add(P(top, 0, 0.5, 0, -0.18))
  return g
}

/** 平板（平放 / 带手写笔）：[机身, 点缀, 壁纸] */
function tabletFlat(pen: boolean) {
  return (p: string[]) => {
    const [body, acc, wall] = p
    const g = new THREE.Group()
    g.add(rbox(24.5, 0.7, 17.8, body, {}, 0.33))
    g.add(flat(23.3, 16.6, wall, 0, 0.52, 0, 0.45))
    if (pen) {
      // 手写画面：几道彩色笔触
      const cols = [acc, '#ff8fa8', '#7bc8ff', '#ffd27a']
      for (let i = 0; i < 4; i++) g.add(noOutline(flat(10 - i * 1.5, 0.5, cols[i], -2 + i, 0.84, -4 + i * 2.2, 0.6, 0.15)))
      g.add(flat(3, 12, '#ffffff', -10, 0.84, 0, 0.45, 0.15))
      // 笔
      g.add(P(cyl(0.45, 0.45, 15.4, '#f7f7f5', {}, 12), 14.2, 0.45, 0, PI / 2))
      g.add(P(cyl(0.12, 0.45, 1.4, '#e6e6e2', {}, 12), 14.2, 0.45, 8.4, PI / 2))
      g.add(rbox(0.6, 0.6, 4, acc, { x: 14.2, y: 0.6, z: -4 }, 0.2))
    } else {
      flatIcons(g, 20, 14, 0.84, 6, 3, acc)
      g.add(flat(12, 1.6, '#ffffff', 0, 0.84, 7, 0.4, 0.15))
    }
    return g
  }
}

/** 平板 + 键盘支架：[机身, 键盘, 壁纸] */
function tabletKeyboard(p: string[]) {
  const [body, keys, wall] = p
  const g = new THREE.Group()
  g.add(rbox(25, 0.9, 18.4, keys, { z: 2 }, 0.4))
  g.add(rbox(23, 0.3, 8.6, shade(keys, -0.1), { y: 0.8, z: -0.2 }, 0.12))
  keyGrid(g, 12, 4, 1.9, 1.5, shade(keys, 0.12), -10.45, 1.0, -3.2)
  g.add(rbox(8, 0.3, 4.4, shade(keys, -0.06), { y: 0.8, z: 7.6 }, 0.15))
  // 背撑 + 平板
  const th = 0.32
  const dev = new THREE.Group()
  dev.add(rbox(24.5, 17.8, 0.7, body, {}, 0.33))
  dev.add(glow(23.3, 16.6, wall, { y: 0.6, z: 0.45 }, 0.45))
  appIcons(dev, 20, 15, 0.6, 0.9, 6, 3, keys)
  g.add(P(dev, 0, 0.9, -7.2, -th))
  g.add(rbox(25, 1.4, 0.8, keys, { y: 0.9, z: -6.6 }, 0.3))
  const [hy, hz] = rotX(-th, 11, -0.65)
  g.add(strut3([0, 0.2, -16.8], [0, 0.9 + hy, -7.2 + hz], 22, 0.5, keys))
  return g
}

/** 电子书阅读器（保护套翻开）：[机身, 保护套, 点缀] */
function eReader(p: string[]) {
  const [body, cover, acc] = p
  const g = new THREE.Group()
  g.add(rbox(11.8, 0.5, 16.2, cover, { x: -6.1 }, 0.2))
  g.add(rbox(11.8, 0.5, 16.2, cover, { x: 6.1 }, 0.2))
  g.add(rbox(11.5, 0.8, 16, body, { x: 6.1, y: 0.5 }, 0.36))
  g.add(flat(9.6, 12.8, '#ece9df', 6.1, 1.12, -0.6, 0.15))
  for (let i = 0; i < 9; i++) g.add(noOutline(rbox(i % 4 === 3 ? 5 : 8, 0.15, 0.35, '#77736a', { x: 6.1 - (i % 4 === 3 ? 1.5 : 0), y: 1.42, z: -5.6 + i * 1.2 }, 0.05)))
  g.add(rbox(0.8, 0.3, 4, acc, { x: -1.2, y: 0.5, z: 0 }, 0.12))
  return g
}

/** 智能手表充电座：[底座, 表带, 表盘] */
function watchDock(p: string[]) {
  const [base, strap, faceC] = p
  const g = new THREE.Group()
  g.add(puck(4.6, 1.4, base))
  const th = 0.35
  const w = new THREE.Group()
  w.add(rbox(4.2, 4.8, 1.2, BLACK, {}, 0.8))
  w.add(glow(3.4, 4.0, '#1a1c22', { y: 0.4, z: 0.55 }, 0.2))
  w.add(noOutline(litOutlined(torus(1.3, 0.15, faceC, { y: 2.4, z: 0.95 }), faceC, 0.8)))
  w.add(glow(1.2, 0.5, '#ffffff', { y: 2.2, z: 1.1 }, 0.7))
  w.add(cylZ(0.35, 0.6, M.silver, 2.2, 3.2, 0))
  const band = torus(2.4, 0.55, strap, { y: 2.4, z: -2.0, ry: PI / 2 })
  band.scale.set(1, 1.35, 1)
  w.add(band)
  g.add(P(w, 0, 2.6, 1.2, -th))
  g.add(rbox(2.4, 2.4, 2.4, base, { y: 1.2, z: -0.6 }, 0.8))
  return g
}

/** 移动电源 + 线：[机身, 指示灯, 线] */
function powerBank(p: string[]) {
  const [body, l, cable] = p
  const g = new THREE.Group()
  g.add(rbox(7, 1.6, 14, body, {}, 0.6))
  for (let i = 0; i < 4; i++) g.add(led(-1.5 + i * 1, 0.8, 7.0, i < 3 ? l : '#555', 0.18))
  g.add(rbox(1.4, 0.6, 1.4, cable, { x: 2.2, y: 0.5, z: 7.6 }, 0.25))
  for (let i = 0; i < 3; i++) g.add(torus(2.4, 0.22, cable, { x: 7.0, y: 0.22 + i * 0.44, z: 4 + i * 0.3, rx: PI / 2 }))
  return g
}

// ====================================================================
// 电话
// ====================================================================

/** 家用无绳电话（亲机 + 子机）：[机身, 按键, 液晶] */
function cordlessPhone(p: string[]) {
  const [body, key, lcd] = p
  const g = new THREE.Group()
  // 亲机
  g.add(rbox(20, 3.6, 16, body, {}, 1.4))
  g.add(rbox(8, 1.2, 14, shade(body, -0.06), { x: -5.4, y: 3.2 }, 0.6))
  handsetZ(g, body, -5.4, 4.4, 0, 15)
  g.add(flat(6.6, 2.6, lcd, 4.2, 3.5, -4.6, 0.4))
  keyGrid(g, 3, 4, 1.8, 1.3, key, 2.4, 3.5, -1.6)
  coil(g, [-9.4, 4, 6], [-10, 1.2, 0], shade(body, -0.15), 0.5, 7)
  // 子机 + 充电座
  const cx = 16
  g.add(rbox(6.4, 2.4, 6.4, body, { x: cx }, 1))
  const hs = new THREE.Group()
  hs.add(rbox(4.6, 15, 2.2, body, {}, 1))
  hs.add(glow(3.4, 2.4, lcd, { y: 10.4, z: 1.15 }, 0.45))
  keyGridZ(hs, 3, 4, 1.15, 0.85, key, -1.15, 8.3, 1.25)
  hs.add(noOutline(rbox(1.8, 0.3, 0.3, BLACK, { y: 13.5, z: 1.15 }, 0.1)))
  g.add(P(hs, cx, 1.2, 0.2, -0.12))
  g.add(led(cx + 2.4, 1.2, 3.25, GREEN, 0.2))
  return g
}

/** 办公电话：[机身, 按键, 液晶] */
function officePhone(p: string[]) {
  const [body, key, lcd] = p
  const g = new THREE.Group()
  g.add(rbox(22, 3.4, 20, body, {}, 1.4))
  g.add(rbox(14.5, 4, 9, body, { x: 3.75, y: 2.4, z: -5.5 }, 1.4))
  g.add(rbox(7, 1.2, 18, shade(body, -0.06), { x: -7, y: 3.0 }, 0.6))
  handsetZ(g, body, -7, 4.2, 0, 17)
  g.add(glow(9, 2.4, lcd, { x: 4, y: 3.8, z: -0.7 }, 0.4))
  keyGrid(g, 3, 4, 1.9, 1.4, key, 0.8, 3.3, 1.6)
  for (let j = 0; j < 5; j++) {
    g.add(rbox(2.2, 0.5, 1.1, key, { x: 8.4, y: 3.3, z: 0.8 + j * 1.6 }, 0.2))
    g.add(led(6.8, 3.6, 0.8 + j * 1.6, j === 1 ? RED : GREEN, 0.18))
  }
  coil(g, [-10.4, 3.6, 8], [-11.4, 1.0, -2], shade(body, -0.15), 0.5, 9)
  return g
}

/** 复古按键电话：[机身, 按键, 中心] */
function retroPushPhone(p: string[]) {
  const [body, key, center] = p
  const g = new THREE.Group()
  g.add(rbox(18, 5, 22, body, {}, 2))
  g.add(rbox(18, 6, 12, body, { y: 4, z: -5 }, 2.4))
  const kp = new THREE.Group()
  kp.add(rbox(10, 0.5, 9, center, {}, 0.3))
  keyGrid(kp, 3, 4, 2.4, 1.8, key, -2.4, 0.4, -3.6)
  g.add(P(kp, 0, 5.4, 5.2, 0.35))
  for (const s of [-1, 1]) g.add(rbox(2, 2.2, 3, shade(body, -0.1), { x: s * 5, y: 9.8, z: -5 }, 0.6))
  g.add(P(capsule(1.6, 11, body), 0, 12, -5, 0, 0, PI / 2))
  for (const s of [-1, 1]) g.add(ball(2.6, body, { x: s * 7.6, y: 11.4, z: -5 }, [1, 0.75, 1.2]))
  for (let i = 0; i < 5; i++) g.add(torus(0.8, 0.25, shade(body, -0.1), { x: -9.6 - i * 0.7, y: 2.5, z: -7, ry: PI / 2 }))
  return g
}

/** 竖直拨盘（朝 +z） */
function dialZ(r: number, color: string, center: string) {
  const d = new THREE.Group()
  d.add(cylZ(r, 0.8, color, 0, 0, 0, 32))
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 1.7 + 0.6
    d.add(cylZ(r * 0.12, 0.3, shade(color, 0.25), Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68, 0.5, 12))
  }
  d.add(cylZ(r * 0.32, 0.3, center, 0, 0, 0.5, 20))
  return d
}

/** 公衆電話风（ピンク電話）：[机身, 拨盘, 铭牌] */
function pinkPhone(p: string[]) {
  const [body, dial, plate] = p
  const g = new THREE.Group()
  g.add(rbox(22, 18, 20, body, {}, 2.5))
  g.add(rbox(22, 6, 11, body, { y: 15, z: -4.5 }, 2.5))
  g.add(P(dialZ(5, dial, plate), 0, 9.5, 10.4))
  g.add(rbox(12, 2.8, 0.5, plate, { y: 3, z: 10.1 }, 0.3))
  for (let i = 0; i < 4; i++) g.add(noOutline(rbox(1.6, 1.6, 0.2, '#c8473a', { x: -4.2 + i * 2.8, y: 3.6, z: 10.4 }, 0.1)))
  g.add(rbox(4, 0.4, 1.2, BLACK, { x: 6.5, y: 18, z: 4 }, 0.15))
  g.add(rbox(3.6, 2.4, 1.2, shade(body, -0.12), { x: 7, y: 14.5, z: 9.6 }, 0.4))
  // 听筒横放在顶上
  g.add(P(capsule(1.5, 12, BLACK), 0, 22.6, -4.5, 0, 0, PI / 2))
  for (const s of [-1, 1]) g.add(ball(2.5, BLACK, { x: s * 8, y: 22.2, z: -4.5 }, [1.15, 0.8, 1]))
  coil(g, [-11, 18, -6], [-11.6, 6, -8], BLACK, 0.55, 8)
  return g
}

/** 壁挂电话（mount）：[机身, 听筒, 按键] */
function wallPhone(p: string[]) {
  const [body, hs, key] = p
  const g = new THREE.Group()
  g.add(rbox(13, 22, 3, body, {}, 1.2))
  // 听筒竖挂在正面左侧
  g.add(P(capsule(1.3, 13, hs), -2.5, 11, 2.8))
  for (const s of [-1, 1]) g.add(rbox(4.2, 3.6, 2.6, hs, { x: -2.5, y: 11 + s * 8 - 1.8, z: 2.6 }, 1.1))
  g.add(glow(3.4, 1.8, LCD, { x: 3.8, y: 17.4, z: 1.6 }, 0.4))
  keyGridZ(g, 2, 6, 1.6, 1.2, key, 3.0, 15, 1.7)
  coil(g, [-2.5, 2.4, 3.2], [2.5, 1.6, 3.2], hs, 0.5, 6)
  return g
}

/** 对讲门铃室内机（mount）：[面板, 屏框, 按键] */
function intercom(p: string[]) {
  const [panel, frame, key] = p
  const g = new THREE.Group()
  g.add(rbox(18, 13, 2.4, panel, {}, 1.2))
  g.add(rbox(9.6, 7.2, 0.4, frame, { x: -3.2, y: 4.2, z: 1.3 }, 0.4))
  g.add(glow(8.4, 6, '#9ad7ff', { x: -3.2, y: 4.8, z: 1.6 }, 0.5))
  g.add(glow(3.4, 2.6, '#fff3b0', { x: -3.2, y: 6, z: 2.0 }, 0.5))
  g.add(cylZ(1.6, 0.6, key, 5.2, 8, 1.4, 28))
  g.add(noOutline(litOutlined(torus(1.8, 0.16, GREEN, { x: 5.2, y: 8, z: 1.3 }), GREEN, 0.9)))
  for (let i = 0; i < 3; i++) g.add(rbox(1.6, 0.8, 0.4, key, { x: 3.4 + i * 1.8, y: 4.4, z: 1.3 }, 0.2))
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.add(noOutline(cylZ(0.18, 0.3, shade(panel, -0.3), -6 + i * 0.8, 1.6 + j * 0.8, 1.25, 8)))
  return g
}

// ====================================================================
// 办公
// ====================================================================

/** 传真机（带听筒 + 出纸）：[机身, 按键, 液晶] */
function faxMachine(p: string[]) {
  const [body, key, lcd] = p
  const g = new THREE.Group()
  g.add(rbox(32, 10, 24, body, {}, 2))
  g.add(rbox(7, 1.4, 20, shade(body, -0.06), { x: -11.5, y: 9.6 }, 0.6))
  handsetZ(g, body, -11.5, 11, 0, 17)
  g.add(flat(9, 2.6, lcd, 4, 9.9, 5.5, 0.4))
  keyGrid(g, 3, 4, 1.8, 1.3, key, 1.0, 9.9, -2.4)
  for (let j = 0; j < 4; j++) g.add(rbox(2.2, 0.5, 1.1, shade(key, -0.12), { x: 11, y: 9.9, z: -2.4 + j * 1.8 }, 0.2))
  // 进纸托 + 纸
  g.add(strut3([4, 9.5, -11.5], [4, 19, -19], 18, 0.5, body))
  g.add(strut3([4, 10.2, -11.8], [4, 19.4, -18.8], 15, 0.15, PAPER))
  // 出纸
  g.add(noOutline(rbox(16, 0.6, 0.4, BLACK, { x: 4, y: 4.5, z: 12.05 }, 0.1)))
  g.add(strut3([4, 4.8, 12.3], [4, 0.2, 20.5], 15, 0.15, PAPER))
  return g
}

/** 碎纸机：落地款 / 桌面小款。[机身, 机头, 点缀] */
function shredder(w: number, d: number, h: number) {
  return (p: string[]) => {
    const [body, head, acc] = p
    const g = new THREE.Group()
    const hh = Math.min(10, h * 0.3)
    const bh = h - hh
    const t = 1
    // 纸篓：正面开窗，看得见碎纸
    g.add(shell(w, bh, d, t, body, { top: false, front: [{ kind: 'rect', x: 0, y: bh * 0.18, w: w * 0.55, h: bh * 0.6, r: 1.5 }] }))
    g.add(ghostOutlined(rbox(w * 0.55 + 1.6, bh * 0.6 + 1.6, 0.3, C.glass, { y: bh * 0.18 - 0.8, z: d / 2 - t - 0.2 }, 0.3), C.glass, 0.3))
    const r = rng(w * 7 + h)
    for (let i = 0; i < Math.round(w * 1.4); i++)
      g.add(rbox(0.5, 0.15, 4 + r() * 3, i % 5 === 0 ? '#dfe8f0' : PAPER, { x: (r() - 0.5) * (w - 4), y: t + r() * bh * 0.4, z: (r() - 0.5) * (d - 6), rx: r() * 0.8, ry: r() * PI }, 0.05))
    // 机头：中间留一道投纸口
    const hw = w + 0.6
    const hd = d + 0.6
    g.add(rbox(hw, hh - 2, hd, head, { y: bh }, 1))
    const half = hd / 2 - 0.6
    g.add(rbox(hw, 2, half, head, { y: h - 2, z: -hd / 2 + half / 2 }, 0.8))
    g.add(rbox(hw, 2, half, head, { y: h - 2, z: hd / 2 - half / 2 }, 0.8))
    g.add(noOutline(rbox(w * 0.75, 0.3, 1.2, BLACK, { y: h - 1.9 }, 0.1)))
    g.add(rbox(w * 0.55, 6, 0.15, PAPER, { y: h - 1.6 }, 0.05))
    g.add(rbox(3, 0.6, 1.6, acc, { x: hw / 2 - 3, y: h, z: -hd / 2 + 2 }, 0.25))
    g.add(led(hw / 2 - 6, h + 0.2, -hd / 2 + 2, GREEN, 0.22))
    return g
  }
}

/** 喷墨打印机：[机身, 顶盖, 点缀] */
function inkjetPrinter(p: string[]) {
  const [body, lid, acc] = p
  const g = new THREE.Group()
  g.add(rbox(44, 13, 32, body, {}, 2))
  g.add(rbox(42, 1, 30, lid, { y: 12.8 }, 0.5))
  g.add(strut3([0, 13, -13], [0, 26, -19], 30, 0.6, body))
  g.add(strut3([0, 13.7, -13.4], [0, 27, -18.8], 21, 0.15, PAPER))
  g.add(noOutline(rbox(30, 1.4, 0.4, BLACK, { y: 3.5, z: 16.05 }, 0.1)))
  g.add(rbox(26, 0.5, 9, shade(body, -0.05), { y: 3.2, z: 20.4 }, 0.2))
  g.add(rbox(21, 0.15, 7, PAPER, { y: 3.72, z: 20 }, 0.05))
  g.add(glow(5, 2.6, SCREEN, { x: -14, y: 8.6, z: 16.1 }, 0.5))
  g.add(cylZ(0.8, 0.6, acc, -9, 9.8, 16.2, 16))
  g.add(led(-9, 7.6, 16.2, GREEN, 0.25))
  return g
}

/** 激光打印机：[机身, 出纸槽, 点缀] */
function laserPrinter(p: string[]) {
  const [body, tray, acc] = p
  const g = new THREE.Group()
  g.add(rbox(38, 26, 36, body, {}, 2))
  g.add(rbox(28, 0.5, 20, tray, { y: 25.9, z: -3 }, 0.2))
  g.add(rbox(21, 0.15, 17, PAPER, { y: 26.45, z: -3.5 }, 0.05))
  g.add(rbox(36, 6, 0.5, shade(body, -0.06), { y: 1.2, z: 18.1 }, 0.4))
  g.add(noOutline(rbox(10, 0.8, 0.3, BLACK, { y: 5.6, z: 18.4 }, 0.1)))
  g.add(noOutline(rbox(34, 0.2, 0.2, shade(body, -0.2), { y: 14, z: 18.05 }, 0.05)))
  g.add(rbox(10, 1, 6, tray, { x: 11, y: 25.9, z: 13 }, 0.3))
  g.add(flat(4.6, 2.4, SCREEN, 9.4, 26.8, 13.2, 0.5))
  g.add(led(14.2, 27.1, 12.6, GREEN, 0.25))
  g.add(cyl(0.6, 0.6, 0.5, acc, { x: 14.2, y: 26.9, z: 14.4 }, 12))
  return g
}

/** 复合机（落地大型）：[机身, 纸盒面板, 点缀] */
function mfp(p: string[]) {
  const [body, drawer, acc] = p
  const g = new THREE.Group()
  const W = 58
  const D = 62
  g.add(rbox(W, 50, D, body, { y: 2 }, 1.5))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(2, RUBBER, { x: sx * 25, y: 2, z: sz * 27 }))
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 11.5
    g.add(rbox(W - 3, 10.5, 0.6, drawer, { y, z: D / 2 + 0.3 }, 0.5))
    g.add(noOutline(rbox(12, 1, 0.4, shade(drawer, -0.25), { y: y + 8, z: D / 2 + 0.8 }, 0.2)))
  }
  g.add(rbox(W, 30, D, body, { y: 52 }, 1.5))
  g.add(noOutline(rbox(W - 4, 0.25, 0.25, shade(body, -0.2), { y: 66, z: D / 2 + 0.05 }, 0.05)))
  // 出纸仓：后侧立柱撑起扫描单元，中间是空的
  g.add(rbox(W, 12, 14, body, { y: 82, z: -D / 2 + 7 }, 1))
  g.add(rbox(14, 12, D - 14, body, { x: W / 2 - 7, y: 82, z: 7 }, 1))
  g.add(rbox(24, 0.3, 32, PAPER, { x: -6, y: 82.1, z: 6 }, 0.05))
  g.add(rbox(24, 0.3, 32, PAPER, { x: -6, y: 82.5, z: 6.4, ry: 0.04 }, 0.05))
  g.add(rbox(W, 10, D, body, { y: 94 }, 1.5))
  // 自动送稿器
  g.add(rbox(W - 2, 5, D - 6, shade(body, 0.05), { y: 104, z: -2 }, 1.5))
  g.add(strut3([-2, 109, -10], [-2, 112, 10], 26, 0.5, drawer))
  g.add(strut3([-2, 109.5, -9], [-2, 112.3, 9], 21, 0.15, PAPER))
  // 操作面板
  const pn = new THREE.Group()
  pn.add(rbox(24, 1.4, 12, DARK, {}, 0.6))
  pn.add(flat(15, 9, SCREEN, -3, 1.2, 0, 0.5))
  flatIcons(pn, 13, 7, 1.5, 4, 2, acc, -3, 0)
  pn.add(led(9.6, 1.6, -3, GREEN, 0.3))
  g.add(P(pn, 12, 97, D / 2 + 4, 0.45))
  g.add(rbox(8, 6, 6, body, { x: 12, y: 93, z: D / 2 + 1 }, 1))
  return g
}

/** 平板扫描仪（盖子打开）：[机身, 盖, 点缀] */
function scanner(p: string[]) {
  const [body, lid, acc] = p
  const g = new THREE.Group()
  g.add(rbox(27, 4, 38, body, {}, 1.2))
  g.add(flat(23, 31, '#d4ecff', 0, 3.85, 1, 0.3))
  const lg = new THREE.Group()
  lg.add(rbox(27, 1.6, 38, lid, { z: 19 }, 0.7))
  g.add(P(lg, 0, 4, -19, -1.75))
  for (let i = 0; i < 3; i++) g.add(cyl(0.5, 0.5, 0.4, i === 0 ? acc : M.light, { x: -9 + i * 2, y: 3.9, z: 18 }, 12))
  g.add(led(10, 4.1, 18, GREEN, 0.2))
  return g
}

/** 标签打印机（带键盘）：[机身, 按键, 胶带] */
function labelPrinter(p: string[]) {
  const [body, key, tape] = p
  const g = new THREE.Group()
  g.add(rbox(12, 4.6, 20, body, {}, 1.4))
  g.add(flat(8, 2.8, LCD, -0.6, 4.5, -6.4, 0.35))
  g.add(ghostOutlined(rbox(5.4, 0.3, 4, C.glass, { x: 0, y: 4.55, z: -1.6 }, 0.1), C.glass, 0.45))
  // 色带顶面在机身顶面之上、玻璃窗之内，不和机身顶面共面
  g.add(rbox(4.6, 0.55, 3.4, tape, { y: 4.2, z: -1.6 }, 0.2))
  keyGrid(g, 6, 4, 1.6, 1.2, key, -4, 4.5, 2.2, C.red)
  g.add(rbox(4.2, 0.5, 1.2, key, { y: 4.5, z: 8.6 }, 0.2))
  // 侧面吐出标签
  g.add(rbox(6, 1.4, 0.15, tape, { x: 8.9, y: 2.4, z: -6 }, 0.05))
  for (let i = 0; i < 4; i++) g.add(noOutline(rbox(0.6, 0.6, 0.1, BLACK, { x: 7.4 + i * 0.9, y: 2.8, z: -5.9 }, 0.03)))
  return g
}

/** 计算器：[机身, 按键, 点缀键] */
function calculator(p: string[]) {
  const [body, key, acc] = p
  const g = new THREE.Group()
  g.add(rbox(10, 1.4, 15.5, body, {}, 0.6))
  g.add(rbox(7, 0.3, 1.6, '#4a3c34', { x: 0.8, y: 1.3, z: -6.2 }, 0.1))
  g.add(flat(8.4, 2.8, LCD, 0, 1.3, -3.9, 0.15))
  for (let i = 0; i < 8; i++) g.add(noOutline(rbox(0.6, 0.12, 1.4, '#3a4a34', { x: 3.4 - i * 0.85, y: 1.62, z: -3.9 }, 0.04)))
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 5; j++) {
      const col = i === 3 && j === 4 ? acc : j === 0 ? shade(key, -0.15) : key
      g.add(rbox(1.7, 0.5, 1.3, col, { x: -3.3 + i * 2.2, y: 1.3, z: -0.8 + j * 1.85 }, 0.25))
    }
  return g
}

/** 废纸篓：[桶身, 口沿, 废纸] */
function wasteBasket(p: string[]) {
  const [body, rim, paper] = p
  const g = new THREE.Group()
  g.add(cup(13, 11, 30, 0.8, body))
  g.add(torus(12.8, 0.6, rim, { y: 29.6, rx: PI / 2 }))
  g.add(torus(11.5, 0.4, rim, { y: 4, rx: PI / 2 }))
  g.add(puck(11.8, 4, paper, { y: 18 }))
  const r = rng(9)
  for (let i = 0; i < 7; i++) {
    const a = r() * PI * 2
    const rr = r() * 6
    g.add(ball(2.6, paper, { x: Math.cos(a) * rr, y: 22 + r() * 4.5, z: Math.sin(a) * rr }, [1, 0.85, 0.95]))
  }
  return g
}

// ====================================================================
// 电脑主机
// ====================================================================

/**
 * 台式机机箱。
 * 朴素版 [机箱, 电源灯色, 前面板]：实心侧板 + 侧面散热孔，素色前面板，无灯光。
 * RGB 版 [机箱, 灯色1, 主板, 灯色2, 灯色3]：侧透玻璃，风扇灯圈每个一种颜色，内存灯条、前面板灯带。
 */
function pcTower(w: number, d: number, h: number, rgb: boolean, fans: number) {
  return (p: string[]) => {
    const [body, l1, inner] = p
    const lights = [l1, p[3] ?? l1, p[4] ?? l1]
    const g = new THREE.Group()
    const t = 1.2
    const foot = 1.5
    const c = new THREE.Group()
    if (rgb) {
      c.add(shell(w, h, d, t, body, { right: [{ kind: 'rect', x: 0, y: 2.5, w: d - 2 * t - 3, h: h - 5, r: 1 }] }))
      c.add(ghostOutlined(rbox(0.4, h - 2, d - 2, C.glass, { x: w / 2 + 0.25, y: 1 }, 0.2), C.glass, 0.22))
      const ix = -w / 2 + t
      c.add(rbox(0.5, h * 0.62, d * 0.62, inner, { x: ix + 0.3, y: h * 0.3, z: -d * 0.12 }, 0.2))
      c.add(rbox(w - 2 * t, h * 0.2, d - 2 * t, shade(body, -0.06), { y: t }, 0.4))
      c.add(noOutline(litOutlined(rbox(0.3, 0.6, d - 2 * t - 2, lights[1], { x: w / 2 - t - 0.6, y: t + h * 0.2 }, 0.1), lights[1], 0.85)))
      // 显卡 + 侧边灯条
      c.add(rbox(w * 0.5, 4, d * 0.55, DARK, { x: ix + 0.6 + w * 0.25, y: h * 0.42, z: -d * 0.05 }, 0.5))
      c.add(noOutline(litOutlined(rbox(0.3, 0.8, d * 0.45, lights[2], { x: ix + 0.75 + w * 0.5, y: h * 0.42 + 2.6, z: -d * 0.05 }, 0.1), lights[2], 0.9)))
      // CPU 散热 + 风扇环
      const cx = ix + 0.6 + w * 0.18
      c.add(rbox(w * 0.36, 9, 4, M.silver, { x: cx, y: h * 0.62, z: -d * 0.12 }, 0.4))
      c.add(noOutline(litOutlined(torus(3.4, 0.35, lights[0], { x: cx, y: h * 0.62 + 4.5, z: -d * 0.12 + 2.3 }), lights[0], 0.9)))
      // 内存条：顶上一条灯
      for (let i = 0; i < 2; i++) {
        const z = -d * 0.12 + 4 + i * 1.2
        c.add(rbox(0.5, 4, 0.5, DARK, { x: ix + 1.2, y: h * 0.58, z }, 0.1))
        c.add(noOutline(litOutlined(rbox(0.6, 0.8, 0.6, lights[1 + i], { x: ix + 1.2, y: h * 0.58 + 4, z }, 0.1), lights[1 + i], 0.9)))
      }
      // 前置风扇：每个一种颜色
      const fr = Math.min(4.4, w * 0.22)
      for (let i = 0; i < fans; i++) {
        const fy = h * 0.32 + i * ((h * 0.6) / Math.max(1, fans))
        c.add(noOutline(litOutlined(torus(fr, 0.45, lights[i % 3], { y: fy + 5, z: d / 2 - t - 1.6 }), lights[i % 3], 0.9)))
        c.add(cylZ(1.2, 0.8, DARK, 0, fy + 5, d / 2 - t - 1.6, 14))
      }
      c.add(noOutline(litOutlined(torus(fr, 0.45, lights[2], { y: h * 0.72, z: -d / 2 + t + 1.6 }), lights[2], 0.9)))
      c.add(cylZ(1.2, 0.8, DARK, 0, h * 0.72, -d / 2 + t + 1.6, 14))
      // 网孔前面板 + 两侧灯带
      c.add(rbox(w - 1, h - 4, 0.6, shade(body, -0.1), { y: 2, z: d / 2 + 0.35 }, 0.3))
      for (let i = 0; i < 7; i++) c.add(noOutline(rbox(w - 5, 0.4, 0.3, shade(body, -0.22), { y: h * 0.2 + i * h * 0.09, z: d / 2 + 0.75 }, 0.1)))
      for (const s of [-1, 1]) c.add(noOutline(litOutlined(rbox(0.5, h - 7, 0.4, lights[s < 0 ? 0 : 1], { x: s * (w / 2 - 1.3), y: 3.5, z: d / 2 + 0.8 }, 0.1), lights[s < 0 ? 0 : 1], 0.9)))
      c.add(cyl(0.9, 0.9, 0.4, M.light, { y: h, z: d / 2 - 3 }, 16))
      c.add(noOutline(litOutlined(torus(1.0, 0.15, lights[0], { y: h + 0.15, z: d / 2 - 3, rx: PI / 2 }), lights[0], 0.9)))
      for (const s of [-1, 1]) c.add(rbox(1.4, 0.3, 0.6, BLACK, { x: s * 2.6, y: h, z: d / 2 - 3 }, 0.1))
    } else {
      // 朴素版：实心机箱，侧面一排散热孔，平整前面板
      c.add(rbox(w, h, d, body, {}, 1.2))
      for (let i = 0; i < 6; i++) c.add(noOutline(rbox(0.4, h * 0.3, 1.2, shade(body, -0.12), { x: w / 2 + 0.1, y: h * 0.45, z: -d * 0.3 + i * d * 0.08 }, 0.1)))
      c.add(rbox(w - 1, h - 3, 0.6, inner, { y: 1.5, z: d / 2 + 0.35 }, 0.3))
      for (const yy of [h * 0.7, h * 0.66]) c.add(noOutline(rbox(w - 4, 0.25, 0.3, shade(inner, -0.15), { y: yy, z: d / 2 + 0.7 }, 0.08)))
      if (h > 40) {
        c.add(rbox(w - 5, 3, 0.4, shade(inner, -0.08), { y: h - 8, z: d / 2 + 0.8 }, 0.3))
        c.add(noOutline(rbox(w - 9, 0.4, 0.3, BLACK, { y: h - 6.7, z: d / 2 + 1.0 }, 0.1)))
      }
      c.add(cylZ(0.9, 0.5, shade(inner, -0.1), 0, h - 3.2, d / 2 + 0.85, 18))
      c.add(led(2, h - 3.2, d / 2 + 0.8, l1, 0.2))
      for (const s of [-1, 1]) c.add(noOutline(rbox(1.4, 0.5, 0.3, BLACK, { x: s * 2.6, y: h - 5.6, z: d / 2 + 0.75 }, 0.1)))
    }
    g.add(P(c, 0, foot, 0))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, foot, 3, BLACK, { x: sx * (w / 2 - 2.5), z: sz * (d / 2 - 3) }, 0.5))
    return g
  }
}

// ---------- RGB 电竞外设 ----------

/** 电竞鼠标（单独）：[机身, 灯色1, 灯色2] */
function gamingMouse(p: string[]) {
  const [body, l1, l2] = p
  const g = new THREE.Group()
  g.add(ball(3.2, body, { y: 1.95 }, [1, 0.6, 1.95]))
  const ring = noOutline(litOutlined(torus(3.05, 0.22, l2, { y: 0.75, rx: PI / 2 }), l2, 0.85))
  ring.scale.set(1, 1.95, 1)
  g.add(ring)
  g.add(cylX(0.65, 0.8, l1, 0, 3.55, -2.6, 16))
  g.add(noOutline(litOutlined(ball(0.7, l1, { y: 3.25, z: 2.8 }, [1, 0.35, 1]), l1, 0.9)))
  for (let i = 0; i < 2; i++) g.add(rbox(0.5, 0.6, 1.3, BLACK, { x: -3.05, y: 1.75, z: -1.6 + i * 1.6 }, 0.2))
  return g
}

/** RGB 电竞桌垫（单独）：[垫面, 灯色1, 灯色2, 灯色3] */
function rgbMousepad(p: string[]) {
  const [mat, a, b, c] = p
  const g = new THREE.Group()
  const W = 90
  const D = 40
  g.add(rbox(W, 0.4, D, mat, {}, 0.2))
  const edge = (col: string, w: number, d: number, x: number, z: number) => g.add(noOutline(litOutlined(rbox(w, 0.5, d, col, { x, z }, 0.2), col, 0.85)))
  edge(a, W / 2, 0.5, -W / 4, D / 2)
  edge(b, W / 2, 0.5, W / 4, D / 2)
  edge(b, W / 2, 0.5, -W / 4, -D / 2)
  edge(c, W / 2, 0.5, W / 4, -D / 2)
  edge(a, 0.5, D - 0.6, -W / 2, 0)
  edge(c, 0.5, D - 0.6, W / 2, 0)
  g.add(noOutline(litOutlined(rbox(5, 0.2, 2, b, { x: W / 2 - 6, y: 0.38, z: D / 2 - 3 }, 0.1), b, 0.7)))
  return g
}

/** RGB 耳机架 + 游戏耳机：[支架, 灯色1, 灯色2, 耳垫] */
function headsetStandRGB(p: string[]) {
  const [stand, l1, l2, pad] = p
  const g = new THREE.Group()
  g.add(puck(7, 2, stand))
  g.add(noOutline(litOutlined(torus(6.9, 0.35, l1, { y: 0.9, rx: PI / 2 }), l1, 0.9)))
  g.add(cyl(1.0, 1.0, 22, stand, { y: 2 }, 14))
  g.add(rbox(5, 1.4, 4, stand, { y: 23.8 }, 0.6))
  g.add(noOutline(litOutlined(rbox(0.4, 18, 0.4, l2, { y: 4, z: 1.05 }, 0.1), l2, 0.85)))
  // 挂着的耳机：头梁搭在托架上，耳罩垂在两侧
  const cy = 18.4
  const shellC = stand === M.white ? M.light : DARK
  g.add(torus(7.6, 1.0, shellC, { y: cy }, PI))
  g.add(rbox(6, 1.2, 3.4, pad, { y: 25.2 }, 0.5))
  for (const s of [-1, 1]) {
    g.add(cylX(4.4, 3.2, shellC, s * 8.4, cy - 2, 0, 28))
    g.add(cylX(3.6, 1.2, pad, s * 6.4, cy - 2, 0, 24))
    g.add(noOutline(litOutlined(torus(2.9, 0.4, s < 0 ? l1 : l2, { x: s * 10.05, y: cy - 2, ry: PI / 2 }), s < 0 ? l1 : l2, 0.9)))
  }
  return g
}

/** 电竞曲面带鱼屏（34 寸）+ 背部灯环：[边框, 支架, 灯色] */
function gamingMonitor(p: string[]) {
  const [frame, stand, l] = p
  const g = new THREE.Group()
  // V 形底座
  for (const s of [-1, 1]) g.add(rod3([0, 1, -6], [s * 22, 1, 9], 1, stand))
  g.add(rbox(5, 1.2, 5, stand, { z: -6 }, 0.6))
  g.add(rbox(5, 24, 3, stand, { y: 1, z: -6.5 }, 1))
  g.add(noOutline(litOutlined(rbox(0.6, 18, 0.4, l, { y: 4, z: -4.85 }, 0.1), l, 0.85)))
  // 曲面屏：7 段沿圆弧排列
  const R = 150
  const n = 7
  const sw = 80 / n
  const y0 = 13
  const cols = ['#7ab8ff', '#9ad7ff', '#b4e4ff', '#c8ecff', '#b4e4ff', '#9ad7ff', '#7ab8ff']
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) * sw) / R
    const seg = new THREE.Group()
    seg.add(rbox(sw + 0.3, 36, 2.2, frame, {}, 0.3))
    seg.add(glow(sw + 0.05, 33.4, cols[i], { y: 1.6, z: 1.2 }, 0.5))
    if (i === 2) seg.add(glow(sw * 0.8, 8, '#fff3b0', { y: 22, z: 1.7 }, 0.7))
    if (i === 4) seg.add(glow(sw * 0.7, 12, l, { y: 6, z: 1.7 }, 0.7))
    seg.position.set(R * Math.sin(a), y0, -2 + R * (1 - Math.cos(a)))
    seg.rotation.y = -a
    g.add(seg)
  }
  g.add(rbox(30, 16, 3, shade(frame, -0.05), { y: y0 + 9, z: -4.2 }, 1.2))
  g.add(noOutline(litOutlined(torus(5.5, 0.5, l, { y: y0 + 17, z: -5.75 }), l, 0.9)))
  return g
}

/** 迷你主机：[机身, 顶盖, 指示灯] */
function miniPC(p: string[]) {
  const [body, top, l] = p
  const g = new THREE.Group()
  g.add(puck(5, 0.6, BLACK))
  g.add(rbox(13, 4.4, 13, body, { y: 0.4 }, 1.6))
  g.add(rbox(12, 0.3, 12, top, { y: 4.65 }, 1.4))
  g.add(led(4.6, 2.4, 6.5, l, 0.22))
  for (let i = 0; i < 2; i++) g.add(noOutline(rbox(1.2, 0.5, 0.3, BLACK, { x: -3 + i * 1.8, y: 2.2, z: 6.5 }, 0.1)))
  return g
}

/** 一体机（iMac 风）：[机身/下巴, 前框, 窗口点缀] */
function allInOne(p: string[]) {
  const [body, bezel, acc] = p
  const g = new THREE.Group()
  g.add(rbox(14, 0.8, 13.5, body, { z: -1.5 }, 0.35))
  g.add(strut3([0, 0.6, -7.4], [0, 16, -1.5], 12, 0.8, body))
  const pn = new THREE.Group()
  pn.add(rbox(54.7, 38.5, 1.2, body, {}, 0.6))
  pn.add(rbox(54.7, 32, 0.3, bezel, { y: 6.5, z: 0.75 }, 0.15))
  pn.add(glow(51.5, 29.5, SCREEN, { y: 7.8, z: 1.2 }, 0.5))
  pn.add(glow(21, 15, '#ffffff', { x: -9, y: 15, z: 1.7 }, 0.6))
  pn.add(glow(21, 2.4, acc, { x: -9, y: 30, z: 2.1 }, 0.6))
  pn.add(glow(15, 11, '#fff3b0', { x: 12, y: 12, z: 1.7 }, 0.6))
  pn.add(glow(48, 2, '#eef7ff', { y: 8.3, z: 1.7 }, 0.5))
  g.add(P(pn, 0, 8, -0.6))
  return g
}

/** 复古米色主机 + CRT 显示器 + 键盘：[米色, 键帽, 屏幕字色] */
function retroPC(p: string[]) {
  const [beige, key, txt] = p
  const g = new THREE.Group()
  const cz = -8
  g.add(rbox(42, 13, 36, beige, { z: cz }, 1.2))
  for (let i = 0; i < 2; i++) {
    g.add(rbox(14, 2.6, 0.4, shade(beige, -0.06), { x: 10, y: 3 + i * 4.4, z: cz + 18.1 }, 0.3))
    g.add(noOutline(rbox(9, 0.4, 0.3, BLACK, { x: 10, y: 4.1 + i * 4.4, z: cz + 18.4 }, 0.1)))
  }
  g.add(rbox(2, 2, 0.6, C.red, { x: -16, y: 5, z: cz + 18.2 }, 0.3))
  g.add(led(-12.6, 6, cz + 18.2, GREEN, 0.25))
  // CRT
  const ty = 13
  g.add(rbox(34, 30, 24, beige, { y: ty, z: cz + 4 }, 2))
  g.add(rbox(26, 23, 12, shade(beige, -0.05), { y: ty + 3.5, z: cz - 12 }, 3))
  g.add(rbox(29, 23, 0.5, shade(beige, -0.15), { y: ty + 4.5, z: cz + 16.2 }, 0.8))
  g.add(glow(26, 20, '#1d2a22', { y: ty + 6, z: cz + 16.6 }, 0.3))
  for (let i = 0; i < 5; i++) g.add(glow(i === 4 ? 4 : 10 + ((i * 7) % 9), 0.9, txt, { x: -12 + (i === 4 ? 2 : (10 + ((i * 7) % 9)) / 2), y: ty + 22 - i * 2.4, z: cz + 17.0 }, 0.9))
  g.add(led(13, ty + 2, cz + 16.3, GREEN, 0.3))
  // 键盘
  const kz = 18.5
  g.add(rbox(42, 2.4, 15, beige, { z: kz }, 0.8))
  for (let r = 0; r < 5; r++) for (let i = 0; i < 15; i++) g.add(rbox(2.2, 0.9, 2.2, r === 4 && i > 3 && i < 11 ? key : i === 0 || i === 14 ? shade(key, -0.12) : key, { x: -18.6 + i * 2.65, y: 2.1, z: kz - 5.6 + r * 2.7 }, 0.3))
  return g
}

/** 服务器小机柜（落地）：[柜体, 服务器, 指示灯] */
function serverRack(p: string[]) {
  const [body, unit, l] = p
  const g = new THREE.Group()
  const W = 56
  const D = 60
  const H = 100
  const t = 1.5
  const c = new THREE.Group()
  c.add(shell(W, H, D, t, body, { front: [{ kind: 'rect', x: 0, y: 4, w: W - 8, h: H - 8, r: 1 }] }))
  for (let i = 0; i < 6; i++) c.add(noOutline(rbox(W - 14, 0.3, 1.2, shade(body, -0.2), { y: H, z: -D / 2 + 8 + i * 8 }, 0.1)))
  const units = [8, 4, 4, 10, 4, 8, 4, 8]
  let y = 6
  units.forEach((uh, i) => {
    c.add(rbox(W - 10, uh - 0.6, D - 10, i === 3 ? shade(unit, 0.08) : unit, { y, z: -1 }, 0.4))
    for (let k = 0; k < (uh > 5 ? 8 : 4); k++) c.add(led(-W / 2 + 9 + k * 1.6, y + uh / 2 - 0.3, D / 2 - 5.8, k % 3 === 0 ? AMBER : l, 0.25))
    c.add(noOutline(rbox(14, uh * 0.4, 0.3, shade(unit, -0.2), { x: 12, y: y + uh * 0.2, z: D / 2 - 5.9 }, 0.1)))
    y += uh + 1.4
  })
  // 玻璃门
  c.add(ghostOutlined(rbox(W - 2, H - 4, 0.5, C.glass, { y: 2, z: D / 2 + 0.4 }, 0.3), C.glass, 0.25))
  c.add(rbox(1.2, 14, 1.4, M.silver, { x: W / 2 - 4, y: H / 2 - 7, z: D / 2 + 1.3 }, 0.5))
  g.add(P(c, 0, 4, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(rbox(4, 1.5, 4, BLACK, { x: sx * (W / 2 - 4), y: 2.5, z: sz * (D / 2 - 4) }, 0.4))
    g.add(cylX(1.25, 1.6, RUBBER, sx * (W / 2 - 4), 1.25, sz * (D / 2 - 4)))
  }
  return g
}

// ====================================================================
// 网络 / 存储
// ====================================================================

/** NAS：[机身, 硬盘托架, 指示灯] */
function nas(bays: number) {
  return (p: string[]) => {
    const [body, tray, l] = p
    const g = new THREE.Group()
    const bw = 3.8
    const W = 3.4 + bays * bw + 1
    const H = bays > 2 ? 20 : 17
    const D = 22
    g.add(rbox(W, H, D, body, {}, 1.2))
    for (let i = 0; i < bays; i++) {
      const x = -W / 2 + 3.4 + bw / 2 + i * bw
      g.add(rbox(bw - 0.4, H - 4, 0.8, tray, { x, y: 2, z: D / 2 + 0.2 }, 0.3))
      g.add(noOutline(rbox(1.2, H - 9, 0.3, shade(tray, -0.2), { x, y: 4, z: D / 2 + 0.7 }, 0.1)))
      g.add(led(x, H - 3.2, D / 2 + 0.7, i % 2 ? l : GREEN, 0.22))
    }
    const cx = -W / 2 + 1.8
    g.add(cylZ(0.8, 0.4, M.light, cx, H - 3, D / 2 + 0.2, 16))
    g.add(noOutline(litOutlined(torus(0.9, 0.12, BLUE, { x: cx, y: H - 3, z: D / 2 + 0.15 }), BLUE, 0.9)))
    for (let k = 0; k < 4; k++) g.add(led(cx, H - 6 - k * 1.4, D / 2 + 0.1, k === 0 ? BLUE : GREEN, 0.2))
    g.add(rbox(1.4, 0.6, 0.4, BLACK, { x: cx, y: 2.4, z: D / 2 + 0.1 }, 0.1))
    return g
  }
}

/** Wi-Fi 路由器（带天线）：[机身, 天线, 指示灯] */
function router(p: string[]) {
  const [body, ant, l] = p
  const g = new THREE.Group()
  g.add(rbox(22, 3.6, 15, body, {}, 1.4))
  for (let i = 0; i < 5; i++) g.add(noOutline(rbox(14, 0.3, 0.6, shade(body, -0.12), { y: 3.5, z: -4 + i * 1.6 }, 0.1)))
  for (let i = 0; i < 6; i++) g.add(led(-6 + i * 2.4, 1.8, 7.55, i === 0 ? BLUE : l, 0.22))
  const xs = [-9, -3.2, 3.2, 9]
  xs.forEach((x, i) => {
    g.add(cylX(0.7, 1.6, ant, x, 2.2, -7.6))
    const a = new THREE.Group()
    a.add(rbox(1.5, 15, 0.8, ant, { y: 0.4 }, 0.38))
    const tilt = (i - 1.5) * 0.12
    g.add(P(a, x, 2.2, -7.6, -0.08, 0, -tilt))
  })
  return g
}

/** 光猫（ONU，竖放）：[机身, 底座, 光纤] */
function onu(p: string[]) {
  const [body, foot, fiber] = p
  const g = new THREE.Group()
  g.add(rbox(15, 1.2, 7, foot, {}, 0.5))
  g.add(rbox(13, 17, 3.6, body, { y: 1 }, 1))
  for (let k = 0; k < 5; k++) g.add(led(-4.6, 14.6 - k * 1.6, 1.85, k === 3 ? AMBER : GREEN, 0.2))
  for (let k = 0; k < 5; k++) g.add(noOutline(rbox(2.4, 0.3, 0.2, shade(body, -0.25), { x: -2.4, y: 14.5 - k * 1.6, z: 1.85 }, 0.05)))
  g.add(noOutline(rbox(4, 1.2, 0.2, shade(body, -0.12), { x: 3, y: 3, z: 1.85 }, 0.1)))
  g.add(rbox(1, 1.6, 1.4, fiber, { x: 4, y: 17.6, z: 0 }, 0.3))
  g.add(torus(3, 0.22, fiber, { x: 7, y: 19, z: 0 }, PI))
  g.add(rod3([10, 19, 0], [10, 2, -2], 0.22, fiber))
  return g
}

/** UPS 不间断电源：[机身, 面板, 指示] */
function ups(p: string[]) {
  const [body, panel, l] = p
  const g = new THREE.Group()
  g.add(rbox(14, 21, 34, body, {}, 1.4))
  g.add(rbox(13, 19, 0.5, panel, { y: 1, z: 17.1 }, 0.5))
  g.add(glow(5.4, 3, '#a8e6ff', { y: 13, z: 17.5 }, 0.5))
  g.add(cylZ(1.2, 0.6, M.light, 0, 8.4, 17.6))
  g.add(noOutline(litOutlined(torus(1.35, 0.15, l, { y: 8.4, z: 17.5 }), l, 0.9)))
  for (let i = 0; i < 5; i++) g.add(noOutline(rbox(8, 0.4, 0.2, shade(panel, -0.2), { y: 2.4 + i * 0.9, z: 17.45 }, 0.05)))
  return g
}

/** 移动硬盘 + 线：[机身, 指示灯, 线] */
function portableHDD(p: string[]) {
  const [body, l, cable] = p
  const g = new THREE.Group()
  g.add(rbox(8, 1.5, 11.5, body, {}, 0.6))
  g.add(rbox(7, 0.2, 10.5, shade(body, -0.08), { y: 1.42 }, 0.3))
  g.add(led(2.6, 0.8, 5.8, l, 0.18))
  g.add(rbox(1.2, 0.6, 1.4, cable, { x: -1.6, y: 0.45, z: 6.3 }, 0.2))
  for (let i = 0; i < 3; i++) g.add(torus(2.2, 0.2, cable, { x: -6.6, y: 0.2 + i * 0.4, z: 3.5 + i * 0.3, rx: PI / 2 }))
  return g
}

/** 交换机（8 口）：[机身, 网口, 网线] */
function netSwitch(p: string[]) {
  const [body, port, cable] = p
  const g = new THREE.Group()
  g.add(rbox(25, 3, 10, body, {}, 0.6))
  for (let i = 0; i < 8; i++) {
    const x = -8.4 + i * 2.2
    g.add(noOutline(rbox(1.5, 1.2, 0.3, port, { x, y: 0.6, z: 5.15 }, 0.1)))
    g.add(led(x - 0.4, 2.3, 5.05, i % 3 === 2 ? AMBER : GREEN, 0.16))
    if (i < 3) {
      g.add(rbox(1.3, 1.0, 2, cable, { x, y: 0.7, z: 6.2 }, 0.25))
      g.add(rod3([x, 1.2, 7.2], [x + 1 + i, 0.3, 13], 0.25, cable))
    }
  }
  g.add(led(10.6, 2.0, 5.05, BLUE, 0.2))
  return g
}

// ====================================================================
// 防潮柜 / 展示柜（不 fit，精确对 surfaces）
// ====================================================================

/** 平开门：把一组部件（门板、把手…）收进以铰链竖线 (hx, hz) 为原点的 Group；left = 铰链在门的左边 */
function hinged(parts: THREE.Object3D[], hx: number, hz: number, left: boolean) {
  const g = new THREE.Group()
  g.position.set(hx, 0, hz)
  for (const o of parts) {
    o.position.x -= hx
    o.position.z -= hz
    g.add(o)
  }
  return movable(g, { kind: 'swing', angle: (left ? -1 : 1) * SWING_OPEN })
}

/** 电子防潮柜：w × d × h，n 块隔板，foot 是脚高。[柜体, 隔板, 数显] */
function dryCabinet(w: number, d: number, h: number, n: number, foot: number) {
  const t = 1.2
  const doorT = 1.2
  const dFront = d / 2 - 0.8
  const bodyD = d - 0.8 - doorT - 0.2
  const bz = -d / 2 + bodyD / 2
  const innerTop = h - t
  const floorY = foot + t
  const ys = Array.from({ length: n }, (_, i) => floorY + ((innerTop - floorY) * (i + 1)) / (n + 1))
  const shelfT = 0.6
  const x0 = -w / 2 + t + 0.5
  const z0 = -d / 2 + t + 0.5
  const z1 = -d / 2 + bodyD - 1.4
  const build = (p: string[]) => {
    const [body, shelf, disp] = p
    const g = new THREE.Group()
    const ch = h - foot
    // 柜体：背板、侧板、顶、底
    g.add(rbox(w, ch, t, body, { y: foot, z: -d / 2 + t / 2 }, 0.5))
    for (const s of [-1, 1]) g.add(rbox(t, ch, bodyD, body, { x: s * (w / 2 - t / 2), y: foot, z: bz }, 0.5))
    g.add(rbox(w, t, bodyD, body, { y: foot, z: bz }, 0.5))
    g.add(rbox(w, t, bodyD, body, { y: h - t, z: bz }, 0.5))
    // 隔板（离门留缝）
    for (const y of ys) {
      g.add(rbox(w - 2 * t - 0.2, shelfT, bodyD - t - 1, shelf, { y: y - shelfT, z: -d / 2 + t + (bodyD - t - 1) / 2 }, 0.2))
    }
    // 玻璃门：门框 + 半透明玻璃 + 把手 + 门上沿的湿度数显，左边铰链，可以打开
    const dz = dFront - doorT / 2
    const fw = 2.2
    const door: THREE.Object3D[] = [rbox(w, fw * 1.6, doorT, body, { y: h - fw * 1.6, z: dz }, 0.4), rbox(w, fw, doorT, body, { y: foot, z: dz }, 0.4)]
    for (const s of [-1, 1]) door.push(rbox(fw, ch - fw * 2.6, doorT, body, { x: s * (w / 2 - fw / 2), y: foot + fw, z: dz }, 0.3))
    door.push(ghostOutlined(rbox(w - fw * 2 + 0.6, ch - fw * 2.6 + 0.6, 0.4, C.glass, { y: foot + fw - 0.3, z: dz }, 0.1), C.glass, 0.2))
    door.push(rbox(1, Math.min(14, ch * 0.3), 1.0, M.silver, { x: w / 2 - fw / 2, y: foot + ch * 0.45, z: dFront + 0.3 }, 0.4))
    const sy = h - fw * 1.6 + 0.6
    door.push(glow(5.2, 1.8, disp, { x: -w / 2 + 6, y: sy, z: dFront + 0.1 }, 0.85))
    door.push(led(-w / 2 + 10.2, sy + 0.9, dFront + 0.15, GREEN, 0.25))
    g.add(hinged(door, -w / 2, dFront - doorT, true))
    if (foot > 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.4, 1.4, foot, BLACK, { x: sx * (w / 2 - 3), z: sz * (d / 2 - 3) }, 12))
    return g
  }
  const shape = [rectPoly(x0, z0, -x0, z1)]
  // 玻璃门里：关着也看得见（glass）
  const lv = [floorY, ...ys]
  const surfaces: SurfaceDef[] = lv.map((y, i) => ({ y, h: Math.round(((lv[i + 1] ?? innerTop + shelfT) - shelfT - y - 0.3) * 10) / 10, shape, inside: true, glass: true }))
  return { build, surface: h, surfaces }
}

/** 相机展示柜（玻璃层板）：[框架, 层板玻璃, 灯带] */
function displayCabinet(w: number, d: number, h: number, n: number) {
  const t = 2
  const foot = 6
  const floorY = foot + t
  const top = h - t
  const ys = Array.from({ length: n }, (_, i) => floorY + ((top - floorY) * (i + 1)) / (n + 1))
  const x0 = -w / 2 + t + 0.8
  const z0 = -d / 2 + t + 0.8
  const z1 = d / 2 - t - 1.6
  const build = (p: string[]) => {
    const [frame, glassC, light] = p
    const g = new THREE.Group()
    g.add(rbox(w, foot, d, frame, {}, 0.8))
    g.add(rbox(w, t, d, frame, { y: foot }, 0.6))
    g.add(rbox(w, t, d, frame, { y: h - t }, 0.6))
    g.add(rbox(w - 2 * t, h - foot - 2 * t, 0.6, shade(frame, 0.08), { y: foot + t, z: -d / 2 + 0.3 }, 0.2))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(t, h - foot - 2 * t, t, frame, { x: sx * (w / 2 - t / 2), y: foot + t, z: sz * (d / 2 - t / 2) }, 0.4))
    // 侧面玻璃；正面两扇玻璃门（铰链在两侧立柱上，右扇带中缝压条）
    for (const s of [-1, 1]) g.add(ghostOutlined(rbox(0.4, h - foot - 2 * t, d - 2 * t, C.glass, { x: s * (w / 2 - t / 2), y: foot + t }, 0.1), C.glass, 0.2))
    const gw = (w - 2 * t) / 2
    for (const s of [-1, 1]) {
      const leaf: THREE.Object3D[] = [ghostOutlined(rbox(gw - 0.2, h - foot - 2 * t, 0.4, C.glass, { x: (s * gw) / 2, y: foot + t, z: d / 2 - t / 2 }, 0.1), C.glass, 0.2)]
      if (s > 0) leaf.push(rbox(0.4, h - foot - 2 * t, 0.6, frame, { y: foot + t, z: d / 2 - 0.3 }, 0.1))
      g.add(hinged(leaf, s * (w / 2 - t), d / 2 - t / 2 - 0.2, s < 0))
    }
    for (const y of ys) {
      g.add(ghostOutlined(rbox(w - 2 * t - 0.2, 0.8, d - 2 * t - 1.2, glassC, { y: y - 0.8, z: -0.6 }, 0.2), glassC, 0.45))
      g.add(rbox(w - 2 * t - 0.2, 0.3, 0.3, frame, { y: y - 0.8, z: d / 2 - t - 1.4 }, 0.1))
    }
    g.add(noOutline(litOutlined(rbox(w - 2 * t - 2, 0.4, 1.2, light, { y: h - t - 0.4, z: d / 2 - t - 3 }, 0.1), light, 0.9)))
    return g
  }
  const shape = [rectPoly(x0, z0, -x0, z1)]
  const lv = [floorY, ...ys]
  return { build, surface: h, surfaces: lv.map((y, i): SurfaceDef => ({ y, h: Math.round(((lv[i + 1] ?? top + 0.8) - 0.8 - y - 0.3) * 10) / 10, shape, inside: true, glass: true })) }
}

// ====================================================================
// 配色
// ====================================================================

const PHONE: Pal[] = [
  ['modern', [M.black, BLUE, '#9ad7ff']],
  ['modern', [M.silver, M.char, '#cfe6ff']],
  ['cute', [C.pink, C.white, '#ffd6e0']],
  ['cute', [C.lilac, C.white, '#e6dcff']],
  ['nordic', [N.sage, N.white, '#d9ecd3']],
]
const OFFICE: Pal[] = [
  ['modern', [M.white, M.light, M.gray]],
  ['modern', [M.char, M.black, M.gray]],
  ['nordic', [N.white, N.gray, N.sage]],
  ['cute', [C.white, C.sky, C.pink]],
]
const PHONE_SET: Pal[] = [
  ['modern', [M.white, M.light, LCD]],
  ['modern', [M.char, M.gray, '#a8e6ff']],
  ['cute', [C.sakura, C.white, LCD]],
  ['retro', [R.cream, '#e6d6b0', LCD]],
]
const NET: Pal[] = [
  ['modern', [M.white, M.light, GREEN]],
  ['modern', [M.black, M.char, BLUE]],
  ['cute', [C.white, C.sky, GREEN]],
  ['nordic', [N.white, N.gray, GREEN]],
]
const TOWER_RGB: Pal[] = [
  ['modern', [M.black, '#ff4fd8', M.char, '#4fe3ff', '#a46bff']],
  ['modern', [M.white, '#4fe3ff', M.light, '#7dffa8', '#a46bff']],
  ['modern', [M.char, '#ff5a4f', M.black, '#ffc04d', '#ff4fd8']],
  ['cute', [C.sakura, '#ff8fd0', C.white, '#c8a8ff', '#7cf0ff']],
  ['cute', [C.white, '#ff8fd0', C.sky, '#ffd27a', '#7cf0ff']],
]
const TOWER_PLAIN: Pal[] = [
  ['modern', [M.black, '#ffffff', M.char]],
  ['modern', [M.white, BLUE, M.light]],
  ['nordic', [N.white, GREEN, N.oakL]],
  ['japanese', [J.sumi, AMBER, J.wood]],
  ['retro', [R.cream, GREEN, '#e6d6b0']],
]
/** RGB 外设：[机身, 灯色1, 灯色2, 灯色3] */
const RGB_GEAR: Pal[] = [
  ['modern', [M.black, '#ff4fd8', '#4fe3ff', '#a46bff']],
  ['modern', [M.white, '#4fe3ff', '#7dffa8', '#a46bff']],
  ['modern', [M.char, '#ff5a4f', '#ffc04d', '#ff4fd8']],
  ['cute', [C.sakura, '#ff8fd0', '#c8a8ff', '#7cf0ff']],
  ['cute', [C.white, '#ff8fd0', '#ffd27a', '#7cf0ff']],
]
const KB_PLAIN: Pal[] = [
  ['modern', [M.white, M.white, M.light]],
  ['modern', [M.char, M.black, M.gray]],
  ['nordic', [N.white, N.linen, N.sage]],
  ['japanese', [J.washi, J.hinoki, J.shu]],
  ['retro', [R.cream, '#e6d6b0', R.orange]],
]
const KB_RGB: Pal[] = [
  ['modern', [M.black, M.char, M.gray, '#ff4fd8', '#a46bff', '#4fe3ff']],
  ['modern', [M.white, M.white, M.light, '#4fe3ff', '#7dffa8', '#ffc04d']],
  ['modern', [M.char, M.black, '#ff5a4f', '#ff5a4f', '#ffc04d', '#ff4fd8']],
  ['cute', [C.sakura, C.white, C.pink, '#ff8fd0', '#c8a8ff', '#7cf0ff']],
  ['cute', [C.white, C.sakura, C.lilac, '#ff8fd0', '#ffd27a', '#7cf0ff']],
]
const LENS: Pal[] = [
  ['modern', [BLACK, RUBBER, '#d64a3c']],
  ['modern', [M.char, RUBBER, '#e0a526']],
  ['retro', [M.silver, BLACK, R.red]],
]
const CAMERA: Pal[] = [
  ['modern', [M.black, RUBBER, '#d64a3c']],
  ['retro', [M.silver, '#4a3c34', R.red]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['nordic', [N.white, N.oak, N.sage]],
]
const STAND: Pal[] = [
  ['modern', [M.black, M.char, '#fff6e0']],
  ['modern', [M.white, M.light, '#fff6e0']],
  ['cute', [C.white, C.pink, '#fff0f4']],
  ['industrial', [I.iron, I.steel, '#ffe8c0']],
]
const DRY: Pal[] = [
  ['modern', [M.black, M.char, '#7dd3ff']],
  ['modern', [M.gray, M.light, '#7dffa8']],
  ['industrial', [I.iron, I.steel, '#ffc04d']],
  ['nordic', [N.white, N.gray, '#7dd3ff']],
]

const swap = (pals: Pal[], f: (c: string[]) => string[]): Pal[] => pals.map(([s, c]) => [s, f(c)])

// 防潮柜规格
const DRY30 = dryCabinet(30, 33, 40, 1, 0)
const DRY50 = dryCabinet(35, 36, 52, 1, 0)
const DRY100 = dryCabinet(40, 38, 75, 2, 0)
const DRY160 = dryCabinet(40, 40, 130, 3, 4)
const SHOWCASE = displayCabinet(60, 36, 160, 4)

export const PROPS_OFFICE: AssetDef[] = [
  // ---------- 游戏 / 音频 ----------
  def('of-headphones', '头戴耳机（平放）', 'tabletop', [22.5, 17.5, 4], [
    ['modern', [M.black, M.char, M.silver]],
    ['modern', [M.white, M.light, M.gray]],
    ['cute', [C.sakura, C.white, C.pink]],
    ['nordic', [N.white, N.linen, N.oak]],
    ['retro', [R.caramel, '#3a3330', R.mustard]],
  ], headphones),
  def('of-gaming-headset', '游戏耳麦', 'tabletop', [20, 16, 14], [
    ['modern', [M.black, '#a46bff', M.char]],
    ['modern', [M.white, '#4fe3ff', M.light]],
    ['cute', [C.pink, '#ff8fd0', C.white]],
    ['cute', [C.white, C.mint, C.sky]],
  ], gamingHeadset),
  def('of-earbuds', '真无线耳机', 'tabletop', [12.5, 4, 4], [
    ['modern', [M.white, M.white, GREEN]],
    ['modern', [M.black, M.char, GREEN]],
    ['cute', [C.sakura, C.white, '#ff8fd0']],
    ['nordic', [N.sage, N.white, GREEN]],
  ], earbuds),
  def('of-pad-ps', '游戏手柄（PS 风）', 'tabletop', [15.5, 10, 4.5], [
    ['modern', [M.white, M.black, M.char]],
    ['modern', [M.black, M.char, M.gray]],
    ['cute', [C.sakura, C.white, C.pink]],
    ['cute', [C.sky, C.white, C.lilac]],
    ['retro', [R.cream, R.red, R.teal]],
  ], padPSDef, { family: 'gamepad', sizeLabel: 'PS 风' }),
  def('of-pad-xbox', '游戏手柄（Xbox 风）', 'tabletop', [16, 12, 5], [
    ['modern', [M.black, M.char, '#7dff8a']],
    ['modern', [M.white, M.black, '#7dff8a']],
    ['cute', [C.mint, C.white, C.lemon]],
    ['cute', [C.lilac, C.white, C.pink]],
  ], padXbox, { family: 'gamepad', sizeLabel: 'Xbox 风' }),
  def('of-joycon', '分体手柄', 'tabletop', [15.5, 11.5, 2], [
    ['cute', ['#4cc3ea', '#ff6f61', C.lemon]],
    ['cute', [C.pink, C.mint, C.lilac]],
    ['modern', [M.char, M.char, M.gray]],
    ['retro', [R.teal, R.orange, R.mustard]],
  ], joyConPair, { family: 'gamepad', sizeLabel: '分体' }),
  def('of-pad-dock', '手柄充电座', 'tabletop', [34, 8, 13], [
    ['modern', [M.black, M.white, M.black]],
    ['modern', [M.white, M.black, M.char]],
    ['cute', [C.white, C.sakura, C.pink]],
    ['cute', [C.white, C.sky, C.lilac]],
  ], padDock),
  def('of-handheld', '掌机', 'tabletop', [24, 11, 2], [
    ['cute', ['#4cc3ea', '#ff6f61', C.lemon]],
    ['cute', [C.pink, C.mint, C.pink]],
    ['modern', [M.char, M.char, BLUE]],
    ['retro', [R.teal, R.orange, R.mustard]],
  ], handheld, { family: 'handheld', sizeLabel: '平放' }),
  def('of-handheld-stand', '掌机', 'tabletop', [18.5, 7.5, 10], [
    ['cute', ['#5ed0c4', C.white, C.pink]],
    ['cute', ['#ff8f86', C.white, C.lemon]],
    ['cute', [C.lemon, C.white, C.sky]],
    ['modern', [M.char, M.black, BLUE]],
  ], handheldStand, { family: 'handheld', sizeLabel: '带支架' }),
  def('of-gameboy', '复古掌机', 'tabletop', [9.5, 4, 15], [
    ['retro', ['#d8d4cb', '#a8325e', '#5b5f72']],
    ['retro', [R.mustard, R.red, '#5b5f72']],
    ['cute', [C.sky, C.pink, '#5b5f72']],
    ['cute', [C.mint, C.lilac, '#5b5f72']],
  ], gameBoy, { family: 'handheld', sizeLabel: '复古' }),
  def('of-vr', 'VR 头显', 'tabletop', [20, 27.5, 10], [
    ['modern', [M.white, M.black, M.light]],
    ['modern', [M.char, M.black, M.gray]],
    ['cute', [C.white, '#3a3b44', C.pink]],
  ], vrHeadset),
  def('of-arcade-stick', '街机摇杆', 'tabletop', [34, 20, 15], [
    ['modern', [M.black, M.char, '#ff5a5a']],
    ['cute', [C.white, C.sakura, C.pink]],
    ['retro', [R.cream, R.teal, R.red]],
    ['retro', [R.mustard, '#3a3330', R.orange]],
  ], arcadeStick),
  def('of-mouse-mat', '电竞鼠标 + 大桌垫', 'tabletop', [80.5, 35.5, 4.5], [
    ['modern', [M.black, M.black, '#a46bff']],
    ['modern', [M.char, M.white, '#4fe3ff']],
    ['cute', [C.sakura, C.white, '#ff8fd0']],
    ['nordic', [N.linen, N.white, '#ffd27a']],
  ], mouseMat),
  def('of-kb-60', '机械键盘', 'tabletop', [30.5, 11.5, 3], KB_PLAIN, mechKeyboard('60'), { family: 'mech-keyboard', sizeLabel: '60% · 朴素' }),
  def('of-kb-tkl', '机械键盘', 'tabletop', [37, 14, 3], KB_PLAIN, mechKeyboard('tkl'), { family: 'mech-keyboard', sizeLabel: 'TKL · 朴素' }),
  def('of-kb-full', '机械键盘', 'tabletop', [45.5, 14, 3], KB_PLAIN, mechKeyboard('full'), { family: 'mech-keyboard', sizeLabel: '全尺寸 · 朴素' }),
  def('of-kb-60-rgb', '机械键盘', 'tabletop', [31, 12, 3], KB_RGB, mechKeyboard('60', true), { family: 'mech-keyboard', sizeLabel: '60% · RGB' }),
  def('of-kb-tkl-rgb', '机械键盘', 'tabletop', [38, 14, 3], KB_RGB, mechKeyboard('tkl', true), { family: 'mech-keyboard', sizeLabel: 'TKL · RGB' }),
  def('of-kb-full-rgb', '机械键盘', 'tabletop', [46.5, 14, 3], KB_RGB, mechKeyboard('full', true), { family: 'mech-keyboard', sizeLabel: '全尺寸 · RGB' }),
  def('of-mouse-rgb', '电竞鼠标', 'tabletop', [6.5, 13, 4], RGB_GEAR, gamingMouse),
  def('of-mousepad-rgb', 'RGB 电竞桌垫', 'tabletop', [90.5, 40.5, 0.5], RGB_GEAR.map(([s, [a, b, c, d]]): Pal => [s, [a === M.white ? M.light : a === C.white ? C.sakura : a, b, c, d]]), rgbMousepad),
  def('of-headset-stand-rgb', 'RGB 耳机架 + 耳机', 'tabletop', [21, 14.5, 27], RGB_GEAR.map(([s, [a, b, c]]): Pal => [s, [a, b, c, a === M.black || a === M.char ? M.char : C.white]]), headsetStandRGB),
  def('of-monitor-gaming', '电竞曲面显示器', 'tabletop', [80, 18.5, 49], RGB_GEAR.map(([s, [a, b, c]]): Pal => [s, [a === C.sakura || a === C.white ? C.white : M.black, a === M.white ? M.light : M.char, b === '#ff8fd0' ? b : c]]), gamingMonitor, { screens: [{ x: 0, y: 13, z: -2, w: 80, h: 36, t: 2.2, bow: 5.3 }], surfaces: clipLevels([{ x: 0, y: 13, z: -2, w: 80, h: 36, t: 2.2 }]) }),

  // ---------- 主播设备 ----------
  def('of-mic-condenser', '麦克风', 'tabletop', [12, 12, 25], [
    ['modern', [M.black, M.char, M.char]],
    ['modern', [M.silver, M.gray, M.black]],
    ['cute', [C.white, C.sakura, C.pink]],
    ['retro', [R.cream, M.silver, R.caramel]],
  ], micCondenser, { family: 'mic', sizeLabel: 'USB 电容麦' }),
  def('of-mic-dynamic', '麦克风', 'tabletop', [13, 18.5, 16], [
    ['modern', [M.black, M.char, M.char]],
    ['modern', [M.char, M.black, M.silver]],
    ['cute', [C.white, C.pink, C.white]],
    ['industrial', [I.iron, I.leather, I.steel]],
  ], micDynamic, { family: 'mic', sizeLabel: '动圈麦' }),
  def('of-mic-boom', '麦克风', 'tabletop', [7.5, 37.5, 37.5], [
    ['modern', [M.black, M.char, M.gray]],
    ['modern', [M.white, M.light, M.gray]],
    ['cute', [C.white, C.sakura, C.pink]],
    ['industrial', [I.iron, I.steel, I.concrete]],
  ], micBoom, { family: 'mic', sizeLabel: '悬臂支架' }),
  def('of-mic-lav', '麦克风', 'tabletop', [10.5, 10.5, 5], [
    ['modern', [M.black, M.char, '#a8e6ff']],
    ['modern', [M.white, M.gray, '#a8e6ff']],
    ['cute', [C.sakura, C.pink, '#fff3b0']],
  ], lavalier, { family: 'mic', sizeLabel: '领夹麦' }),
  def('of-mic-shotgun', '麦克风', 'tabletop', [7, 19, 9.5], [
    ['modern', [M.black, M.char, M.black]],
    ['modern', [M.silver, '#8a7f74', M.char]],
    ['cute', [C.white, C.sakura, C.white]],
  ], shotgunMic, { family: 'mic', sizeLabel: '枪麦' }),
  def('of-webcam', '网络摄像头', 'tabletop', [9.6, 5, 10], [
    ['modern', [M.black, M.char, M.black]],
    ['modern', [M.white, M.light, M.gray]],
    ['cute', [C.white, C.pink, C.sakura]],
    ['cute', [C.sky, C.white, C.white]],
  ], webcamClip, { family: 'webcam', sizeLabel: '夹式', screenClip: true }),
  def('of-webcam-tripod', '网络摄像头', 'tabletop', [9.5, 8.5, 13.5], [
    ['modern', [M.black, M.char, M.char]],
    ['modern', [M.white, M.gray, M.black]],
    ['cute', [C.white, C.pink, C.white]],
  ], webcamTripod, { family: 'webcam', sizeLabel: '三脚架' }),
  def('of-tv-camera', '机顶摄像头', 'tabletop', [22, 6, 9], [
    ['modern', [M.black, M.char, M.char]],
    ['modern', [M.white, M.light, M.gray]],
    ['cute', [C.white, C.sakura, C.pink]],
  ], tvCamera, { screenClip: true }),
  def('of-capture-card', '采集卡', 'tabletop', [11, 14, 2.5], [
    ['modern', [M.black, '#a46bff', M.char]],
    ['modern', [M.white, '#4fe3ff', M.gray]],
    ['cute', [C.sakura, '#ff8fd0', C.white]],
  ], captureCard),
  def('of-stream-deck', '直播按键面板', 'tabletop', [12, 8, 8], [
    ['modern', [M.black, M.char, '#a46bff']],
    ['modern', [M.white, M.light, '#4fe3ff']],
    ['cute', [C.sakura, C.white, C.pink]],
  ], streamDeck),
  def('of-audio-interface', '声卡', 'tabletop', [18, 12.5, 4.5], [
    ['modern', [M.char, M.black, M.silver]],
    ['modern', ['#c8473a', M.black, M.silver]],
    ['cute', [C.white, C.sakura, C.pink]],
    ['retro', [R.mustard, R.cream, '#3a3330']],
  ], audioInterface),
  def('of-mixer', '调音台', 'tabletop', [28, 22, 5], [
    ['modern', [M.char, M.black, M.white]],
    ['modern', [M.light, M.white, M.black]],
    ['retro', [R.cream, '#3a3330', R.orange]],
    ['industrial', [I.iron, I.steel, I.rust]],
  ], mixer),
  def('of-ring-light', '环形补光灯', 'tabletop', [29, 15, 48.5], STAND, ringLightDesk, { family: 'ring-light', sizeLabel: '桌面款' }),
  def('of-ring-light-floor', '环形补光灯', 'appliance', [58, 50.5, 215], STAND, ringLightFloor, { family: 'ring-light', sizeLabel: '落地款', prop: undefined }),
  def('of-softbox', '柔光箱灯', 'appliance', [61.5, 53.5, 199.5], [
    ['modern', [M.black, M.black, '#fffaf0']],
    ['modern', [M.char, M.char, '#fff6e0']],
    ['industrial', [I.iron, I.iron, '#ffe8c0']],
  ], softbox, { prop: undefined }),
  def('of-green-screen', '绿幕', 'appliance', [150, 40, 184], [
    ['modern', [M.black, '#4fbf6a', M.silver]],
    ['modern', [M.char, '#3f9be0', M.silver]],
    ['cute', [M.white, '#6fd08a', M.silver]],
  ], greenScreen, { prop: undefined }),
  def('of-studio-monitors', '监听音箱', 'tabletop', [59.5, 22.5, 25], [
    ['modern', [M.black, '#e8c23a', M.char]],
    ['modern', [M.white, M.char, M.light]],
    ['cute', [C.white, C.pink, C.sakura]],
    ['nordic', [N.oak, M.char, N.white]],
  ], studioMonitors),
  def('of-phone-live-stand', '手机直播支架', 'tabletop', [19.5, 12, 47.5], [
    ['modern', [M.black, M.black, '#fff6e0']],
    ['modern', [M.white, M.silver, '#fff6e0']],
    ['cute', [C.white, C.pink, '#fff0f4']],
  ], phoneLiveStand),

  // ---------- 相机 / 镜头 ----------
  def('of-camera-mirrorless', '无反相机', 'tabletop', [13, 12.5, 9], CAMERA, camera('mirrorless')),
  def('of-camera-dslr', '单反相机', 'tabletop', [14.5, 19.5, 12], CAMERA, camera('dslr')),
  def('of-camera-film', '胶片相机', 'tabletop', [13.5, 7, 9], [
    ['retro', [M.silver, BLACK, R.red]],
    ['retro', [M.silver, R.caramel, R.mustard]],
    ['modern', [M.black, BLACK, M.silver]],
    ['cute', [M.silver, C.pink, C.sky]],
  ], filmCamera),
  def('of-camera-instant', '拍立得', 'tabletop', [11, 8.5, 16], [
    ['cute', [C.sky, C.white, C.pink]],
    ['cute', [C.pink, C.white, C.lemon]],
    ['cute', [C.mint, C.white, C.sky]],
    ['modern', [M.white, M.char, M.gray]],
    ['retro', [R.cream, BLACK, R.red]],
  ], instantCamera),
  def('of-action-cam', '运动相机', 'tabletop', [8, 7, 10], [
    ['modern', [M.black, M.char, BLACK]],
    ['modern', [M.light, M.char, BLACK]],
    ['cute', [C.sky, C.white, C.white]],
  ], actionCamera),
  def('of-gimbal', '手机稳定器', 'tabletop', [15, 8.5, 32], [
    ['modern', [M.black, M.char, M.black]],
    ['modern', [M.white, M.light, M.char]],
    ['cute', [C.sakura, C.white, C.pink]],
  ], gimbal),
  def('of-tripod', '三脚架', 'appliance', [61.5, 53.5, 135.5], [
    ['modern', [M.black, M.char, '#d64a3c']],
    ['modern', [M.silver, M.black, M.char]],
    ['industrial', [I.iron, I.walnut, I.rust]],
  ], tripod, { prop: undefined }),
  def('of-lens-pancake', '镜头', 'tabletop', [6, 6, 4.5], LENS, lensDef({ len: 2.0, rm: 2.9, rf: 2.9, rings: 1 }), { family: 'lens', sizeLabel: '饼干头' }),
  def('of-lens-35', '镜头', 'tabletop', [7, 7, 8.5], LENS, lensDef({ len: 5.8, rm: 3.1, rf: 3.3, rings: 1, stripe: true }), { family: 'lens', sizeLabel: '35mm 定焦' }),
  def('of-lens-wide', '镜头', 'tabletop', [11.5, 11.5, 13], LENS, lensDef({ len: 10, rm: 3.4, rf: 4.2, rings: 2, bulb: true, hood: 2.4 }), { family: 'lens', sizeLabel: '16-35 广角' }),
  def('of-lens-2470', '镜头', 'tabletop', [11, 11, 16], LENS, lensDef({ len: 12, rm: 3.6, rf: 4.2, rings: 2, stripe: true, hood: 3.6 }), { family: 'lens', sizeLabel: '24-70 标准变焦' }),
  def('of-lens-macro', '镜头', 'tabletop', [7.5, 7.5, 14.5], LENS, lensDef({ len: 12, rm: 3.4, rf: 3.6, rings: 1, stripe: true }), { family: 'lens', sizeLabel: '100mm 微距' }),
  def('of-lens-70200', '镜头', 'tabletop', [11.5, 11.5, 24.5], [
    ['modern', ['#f2f1ec', RUBBER, '#d64a3c']],
    ['modern', [BLACK, RUBBER, '#d64a3c']],
    ['modern', [M.char, RUBBER, '#e0a526']],
  ], lensDef({ len: 20, rm: 3.6, rf: 4.6, rings: 2, stripe: true, hood: 4 }), { family: 'lens', sizeLabel: '70-200 长焦' }),

  // ---------- 移动设备 ----------
  def('of-phone', '手机', 'tabletop', [7.5, 16, 1], PHONE, phoneFlat, { family: 'phone', sizeLabel: '平放', form: 'lying' }),
  def('of-phone-stand', '手机', 'tabletop', [7.5, 7.5, 15.5], PHONE, phoneStanding, { family: 'phone', sizeLabel: '立放', form: 'standing' }),
  def('of-phone-fold', '折叠屏手机', 'tabletop', [7, 11, 8.5], swap(PHONE, ([a, , c]) => [a, M.silver, c]), foldPhone),
  def('of-tablet', '平板电脑', 'tabletop', [24.5, 18, 1], PHONE, tabletFlat(false), { family: 'tablet', sizeLabel: '平放' }),
  def('of-tablet-pen', '平板电脑', 'tabletop', [27, 18, 1], PHONE, tabletFlat(true), { family: 'tablet', sizeLabel: '带手写笔' }),
  def('of-tablet-kb', '平板电脑', 'tabletop', [25, 28, 18], swap(PHONE, ([a, b, c]) => [a, b === BLUE ? M.char : b, c]), tabletKeyboard, { family: 'tablet', sizeLabel: '键盘支架' }),
  def('of-ereader', '电子书阅读器', 'tabletop', [24, 16, 1.5], [
    ['modern', [M.black, M.char, M.gray]],
    ['nordic', [M.char, N.sage, N.oak]],
    ['cute', [M.char, C.pink, C.sakura]],
    ['japanese', [M.black, J.ai, J.shu]],
  ], eReader),
  def('of-watch-dock', '智能手表充电座', 'tabletop', [9, 9, 8], [
    ['modern', [M.white, M.black, '#7dffa8']],
    ['modern', [M.char, '#c8473a', '#ffc04d']],
    ['cute', [C.white, C.pink, '#ff8fd0']],
    ['nordic', [N.oak, N.sage, '#7dd3ff']],
  ], watchDock),
  def('of-power-bank', '移动电源', 'tabletop', [13, 15.5, 1.5], [
    ['modern', [M.black, BLUE, M.char]],
    ['modern', [M.white, BLUE, M.light]],
    ['cute', [C.pink, '#ffffff', C.white]],
    ['cute', [C.mint, '#ffffff', C.white]],
  ], powerBank),

  // ---------- 电话 ----------
  def('of-cordless-phone', '家用无绳电话', 'tabletop', [30, 16, 16], PHONE_SET, cordlessPhone),
  def('of-office-phone', '办公电话', 'tabletop', [23, 20, 8], [
    ['modern', [M.char, M.light, LCD]],
    ['modern', [M.white, M.light, '#a8e6ff']],
    ['industrial', [I.iron, I.steel, AMBER]],
    ['nordic', [N.white, N.gray, LCD]],
  ], officePhone),
  def('of-retro-push-phone', '复古按键电话', 'tabletop', [23, 22, 13.5], [
    ['retro', [R.cream, M.white, '#e6d6b0']],
    ['retro', ['#7fb88f', M.white, '#cfe3c8']],
    ['retro', [R.mustard, R.cream, '#f0d58a']],
    ['retro', [R.red, R.cream, '#f0c0b0']],
    ['cute', [C.pink, C.white, C.sakura]],
  ], retroPushPhone),
  def('of-pink-phone', '公衆電話（ピンク電話）', 'tabletop', [23.5, 21, 24], [
    ['retro', ['#f2a0b4', M.white, R.cream]],
    ['retro', ['#d8483a', M.white, R.cream]],
    ['retro', ['#5aa86a', M.white, R.cream]],
    ['cute', [C.sakura, M.white, C.cream]],
  ], pinkPhone),
  def('of-wall-phone', '壁挂电话', 'study', [13, 5.5, 22], [
    ['modern', [M.white, M.white, M.light]],
    ['retro', [R.cream, R.cream, '#e6d6b0']],
    ['retro', ['#7fb88f', '#7fb88f', M.white]],
    ['modern', [M.char, M.char, M.gray]],
  ], wallPhone, { mount: 130, prop: undefined }),
  def('of-intercom', '对讲门铃室内机', 'entrance', [18, 3.5, 13], [
    ['modern', [M.white, M.char, M.light]],
    ['modern', [M.char, M.black, M.gray]],
    ['nordic', [N.white, N.gray, N.linen]],
  ], intercom, { mount: 140, prop: undefined }),

  // ---------- 办公 ----------
  def('of-fax', '传真机', 'study', [32, 39.5, 19.5], PHONE_SET, faxMachine),
  def('of-shredder-floor', '碎纸机', 'study', [37.5, 26.5, 60.5], OFFICE, shredder(36, 26, 56), { family: 'shredder', sizeLabel: '落地款', prop: undefined }),
  def('of-shredder-desk', '碎纸机', 'study', [24.5, 16.5, 32.5], OFFICE, shredder(24, 16, 28), { family: 'shredder', sizeLabel: '桌面小款' }),
  def('of-inkjet', '喷墨打印机', 'study', [44, 44, 27], OFFICE, inkjetPrinter),
  def('of-laser-printer', '激光打印机', 'study', [38, 36.5, 27.5], OFFICE, laserPrinter),
  def('of-mfp', '复合机', 'appliance', [58, 72, 112.5], [
    ['modern', [M.white, M.light, BLUE]],
    ['modern', [M.light, M.char, BLUE]],
    ['nordic', [N.white, N.gray, N.sage]],
  ], mfp, { prop: undefined }),
  def('of-scanner', '扫描仪', 'study', [27, 46, 41.5], OFFICE, scanner),
  def('of-label-printer', '标签打印机', 'study', [18, 20, 5], [
    ['modern', [M.white, M.light, C.lemon]],
    ['modern', [M.char, M.gray, C.lemon]],
    ['cute', [C.sakura, C.white, C.mint]],
    ['retro', [R.cream, R.teal, R.mustard]],
  ], labelPrinter),
  def('of-calculator', '计算器', 'study', [10, 15.5, 2], [
    ['modern', [M.black, M.char, R.orange]],
    ['modern', [M.white, M.light, BLUE]],
    ['cute', [C.pink, C.white, C.sky]],
    ['retro', [R.cream, '#e6d6b0', R.red]],
  ], calculator),
  def('of-waste-basket', '废纸篓', 'study', [27, 27, 30], [
    ['modern', [M.char, M.black, PAPER]],
    ['nordic', [N.white, N.oak, PAPER]],
    ['cute', [C.mint, C.white, PAPER]],
    ['industrial', [I.iron, I.walnut, PAPER]],
    ['japanese', [J.hinoki, J.dark, J.washi]],
  ], wasteBasket, { prop: undefined }),

  // ---------- 电脑主机 ----------
  def('of-pc-itx', '台式机机箱', 'appliance', [18.5, 33, 31.5], TOWER_PLAIN, pcTower(18, 32, 30, false, 0), { family: 'pc-tower', sizeLabel: '迷你 ITX · 朴素', prop: undefined }),
  def('of-pc-itx-rgb', '台式机机箱', 'appliance', [18.5, 33, 32], TOWER_RGB, pcTower(18, 32, 30, true, 1), { family: 'pc-tower', sizeLabel: '迷你 ITX · RGB', prop: undefined }),
  def('of-pc-mid-plain', '台式机机箱', 'appliance', [22.5, 46, 48.5], TOWER_PLAIN, pcTower(22, 45, 47, false, 0), { family: 'pc-tower', sizeLabel: '中塔 · 朴素', prop: undefined }),
  def('of-pc-mid', '台式机机箱', 'appliance', [22.5, 46, 49], TOWER_RGB, pcTower(22, 45, 47, true, 3), { family: 'pc-tower', sizeLabel: '中塔 · RGB', prop: undefined }),
  def('of-pc-full-plain', '台式机机箱', 'appliance', [24.5, 56, 60.5], TOWER_PLAIN, pcTower(24, 55, 59, false, 0), { family: 'pc-tower', sizeLabel: '全塔 · 朴素', prop: undefined }),
  def('of-pc-full', '台式机机箱', 'appliance', [24.5, 56, 61], TOWER_RGB, pcTower(24, 55, 59, true, 3), { family: 'pc-tower', sizeLabel: '全塔 · RGB', prop: undefined }),
  def('of-mini-pc', '迷你主机', 'tabletop', [13, 13, 5], [
    ['modern', [M.silver, M.light, M.white]],
    ['modern', [M.black, M.char, BLUE]],
    ['cute', [C.white, C.sakura, C.pink]],
    ['nordic', [N.white, N.oak, GREEN]],
  ], miniPC),
  def('of-aio', '一体机', 'tabletop', [54.5, 13.5, 46.5], [
    ['modern', [M.silver, M.white, M.gray]],
    ['cute', ['#9cc8f0', M.white, C.sky]],
    ['cute', ['#f5b7c6', M.white, C.pink]],
    ['cute', ['#a8dcc0', M.white, C.mint]],
    ['retro', ['#f2cf6a', M.white, R.orange]],
  ], allInOne, { screens: [{ x: 0, y: 8, z: -0.6, w: 54.7, h: 38.5, t: 1.2 }], surfaces: clipLevels([{ x: 0, y: 8, z: -0.6, w: 54.7, h: 38.5, t: 1.2 }]) }),
  def('of-retro-pc', '复古电脑套装', 'tabletop', [42, 52, 43], [
    ['retro', ['#e8dfc8', '#d6cbb0', '#7dff9a']],
    ['retro', [R.cream, '#e6d6b0', '#ffc04d']],
    ['modern', [M.light, M.white, '#7dff9a']],
  ], retroPC),
  def('of-server-rack', '服务器机柜', 'appliance', [56, 62, 104.5], [
    ['modern', [M.black, M.char, GREEN]],
    ['modern', [M.light, M.char, BLUE]],
    ['industrial', [I.iron, I.steel, GREEN]],
  ], serverRack, { prop: undefined }),

  // ---------- 网络 / 存储 ----------
  def('of-nas-2', 'NAS', 'tabletop', [12, 23, 17], NET.map(([s, [a, b, c]]): Pal => [s, [a === M.white ? M.char : a, b === M.light ? M.black : M.char, c === GREEN ? BLUE : c]]), nas(2), { family: 'nas', sizeLabel: '2 盘位' }),
  def('of-nas-4', 'NAS', 'tabletop', [19.5, 23, 20], NET.map(([s, [a, b, c]]): Pal => [s, [a === M.white ? M.char : a, b === M.light ? M.black : M.char, c === GREEN ? BLUE : c]]), nas(4), { family: 'nas', sizeLabel: '4 盘位' }),
  def('of-router', 'Wi-Fi 路由器', 'tabletop', [25, 17, 17.5], NET, router),
  def('of-onu', '光猫', 'tabletop', [17.5, 7, 22], NET, onu),
  def('of-ups', 'UPS 不间断电源', 'appliance', [14, 35, 21], [
    ['modern', [M.black, M.char, GREEN]],
    ['modern', [M.white, M.light, GREEN]],
    ['industrial', [I.iron, I.steel, AMBER]],
  ], ups),
  def('of-portable-hdd', '移动硬盘', 'tabletop', [13, 12.5, 1.5], [
    ['modern', [M.black, BLUE, M.char]],
    ['modern', [M.silver, GREEN, M.char]],
    ['cute', [C.sky, '#ffffff', C.white]],
    ['cute', [C.pink, '#ffffff', C.white]],
  ], portableHDD),
  def('of-switch', '交换机', 'tabletop', [25, 18, 3], [
    ['modern', [M.char, BLACK, '#4fa3e0']],
    ['modern', [M.white, BLACK, '#e0c040']],
    ['industrial', [I.iron, BLACK, I.rust]],
  ], netSwitch),

  // ---------- 防潮柜 / 展示柜 ----------
  def('of-dry-30', '防潮柜', 'storage', [30, 33, 40], DRY, DRY30.build, { family: 'dry-cabinet', sizeLabel: '30L 桌面', surface: DRY30.surface, surfaces: DRY30.surfaces, prop: undefined, openable: true }, true),
  def('of-dry-50', '防潮柜', 'storage', [35, 36, 52], DRY, DRY50.build, { family: 'dry-cabinet', sizeLabel: '50L', surface: DRY50.surface, surfaces: DRY50.surfaces, prop: undefined, openable: true }, true),
  def('of-dry-100', '防潮柜', 'storage', [40, 38, 75], DRY, DRY100.build, { family: 'dry-cabinet', sizeLabel: '100L', surface: DRY100.surface, surfaces: DRY100.surfaces, prop: undefined, openable: true }, true),
  def('of-dry-160', '防潮柜', 'storage', [40, 40, 130], DRY, DRY160.build, { family: 'dry-cabinet', sizeLabel: '160L 落地', surface: DRY160.surface, surfaces: DRY160.surfaces, prop: undefined, openable: true }, true),
  def('of-camera-showcase', '相机展示柜', 'storage', [60, 36, 160], [
    ['modern', [M.black, C.glass, '#fff6e0']],
    ['modern', [M.white, C.glass, '#fff6e0']],
    ['nordic', [N.oak, C.glass, '#fff2c8']],
    ['industrial', [I.walnut, C.glass, '#ffe8c0']],
  ], SHOWCASE.build, { surface: SHOWCASE.surface, surfaces: SHOWCASE.surfaces, prop: undefined, openable: true }, true),
]
