// 家务 / 清洁用品素材包：吸尘器、扫地机器人基站、拖把扫帚、分类垃圾桶、资源回收、清洁剂和小工具、晾衣夹衣架。
// 约定见 kit.ts 开头；id 统一用 chore- 前缀（ch- 已被 chairs 用掉）。
//   - 挂起形态（form: 'hanging'）沿用 storage-forms 的约定：原点 = 挂点，模型在原点下方，本体在 z ≥ 0.3；
//     自带 S 钩（上环内顶 y ≈ -0.5），挂件的环套在 S 钩下环上。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray, type At } from '../toon'
import { C, G, glow, paintPanel, rectPoly, rng, shell, type AssetCategory, type AssetDef, type Fx } from '../kit'
import { P, PI, cappedTube, clearMat, cylX, cylZ, lit, noOutline, rod3, type TubeOpts, type V3 } from '../geo'
import { I, J, M, N, R, type Build, type Dims, type Pal } from '../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = { seg: { per: 6, min: 12 }, radial: 10 }

const STEEL = '#c3c7cc'
const HOSE = '#6f737a'

// ---------- 定义 ----------

function def(id: string, name: string, category: AssetCategory, [w, d, h]: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  // 普通形态统一在 xz 上居中、最低点贴地（壁挂的只居中）；挂起形态、带特效点或层板坐标的保持原样
  if (extra.form !== 'hanging' && !extra.fx && !extra.surfaces) build = normalizeLoose(build, !extra.mount)
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
    build,
    ...extra,
  }
}
const prop = (id: string, name: string, category: AssetCategory, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) =>
  def(id, name, category, dims, pals, build, { prop: true, ...extra })

// ---------- 小工具 ----------

function normalizeLoose(build: Build, toFloor: boolean): Build {
  return (p) => {
    const g = build(p)
    const b = box3Loose(g)
    g.position.x -= (b.min.x + b.max.x) / 2
    g.position.z -= (b.min.z + b.max.z) / 2
    if (toFloor) g.position.y -= b.min.y
    return G(g)
  }
}

/** 竖直的多边形板（xy 平面内的轮廓，沿 z 挤出 t，z 居中） */
function vpoly(pts: [number, number][], t: number, color: string, at: At = {}) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const bevel = Math.min(0.3, t * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1 })
  geo.translate(0, 0, -t / 2 + bevel)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return P(m, at.x, at.y, at.z, at.rx, at.ry, at.rz)
}

/** 圆弧上的点（yz 平面：z = cos a、y = sin a） */
function arcYZ(c: V3, r: number, a0: number, a1: number, n: number): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r])
  }
  return out
}

function box3Loose(o: THREE.Object3D) {
  o.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(o)
}

/** 落地并在 xz 上居中（平放形态用） */
function ground(o: THREE.Object3D) {
  const b = box3Loose(o)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.z -= (b.min.z + b.max.z) / 2
  o.position.y -= b.min.y
  return G(o)
}

/** 往上抬，让最低点贴地（斜靠的东西用） */
function lift(o: THREE.Object3D) {
  const b = box3Loose(o)
  o.position.y -= b.min.y
  return o
}

/** S 钩：上环内顶在 y ≈ -0.5（后沿 z ≈ -1），下环最低点 (0, S_LOW, bz) */
const S_LOW = -6.4
/** 挂在 S 钩下环上的小环：环心高度（环内顶压在钩线顶上） */
const RING_Y = (r: number, t: number) => S_LOW + 0.25 - (r - t)
function sHook(bz: number, color = STEEL) {
  const top = arcYZ([0, -1.45, 0.2], 1.2, PI * 1.15, 0, 8)
  const bottom = arcYZ([0, -5.2, bz], 1.2, PI, PI * 2.2, 8)
  return cappedTube([...top, ...bottom], 0.25, color, { ...TUBE, seg: 48 })
}

// ---------- 标签画 ----------

const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic","Microsoft YaHei",sans-serif'
type Line = [text: string, y: number, size: number, color: string]

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, maxW: number) {
  g.font = `bold ${px}px ${FONT}`
  const w = g.measureText(s).width
  if (w > maxW && w > 0) g.font = `bold ${(px * maxW) / w}px ${FONT}`
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(s, x, y)
}

/** 通用标签：底色 + 上色带 + 几行字（y / size 都是相对画面高度的比例） */
function drawLabel(bg: string, band: string | null, lines: Line[], bandH = 0.2) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    if (band) {
      g.fillStyle = band
      g.fillRect(0, 0, W, H * bandH)
      g.fillRect(0, H * (1 - bandH * 0.4), W, H * bandH * 0.4)
    }
    for (const [s, y, size, color] of lines) text(g, s, W / 2, H * y, H * size, color, W * 0.88)
  }
}

/** 圆点图案（洗洁精上的水果 / 泡泡） */
function drawBubbleLabel(bg: string, dot: string, title: string, sub: string, ink: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = dot
    for (const [x, y, r] of [
      [0.5, 0.3, 0.2],
      [0.24, 0.16, 0.08],
      [0.78, 0.2, 0.1],
    ]) {
      g.beginPath()
      g.arc(W * x, H * y, Math.min(W, H) * r * 1.3, 0, PI * 2)
      g.fill()
    }
    text(g, title, W / 2, H * 0.62, H * 0.16, ink, W * 0.86)
    text(g, sub, W / 2, H * 0.82, H * 0.09, ink, W * 0.8)
  }
}

// ======================================================================
// 吸尘器
// ======================================================================

/** 卧式（罐式）吸尘器：机身在后，地刷在前，金属管立着，软管从握把绕回机身 */
function canisterVac(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(26, 21, 32, main, { y: 2.5, z: -13 }, 8))
  g.add(rbox(18, 2, 16, sub, { y: 22.6, z: -15 }, 1.5))
  g.add(cappedTube([[0, 24, -21], [0, 28, -18.5], [0, 28, -11.5], [0, 24, -9]], 1.1, sub, TUBE))
  for (const s of [-1, 1]) {
    g.add(cylX(7.5, 3, sub, s * 13.5, 7.5, -20, 28))
    g.add(cylX(3.4, 3.3, acc, s * 13.6, 7.5, -20, 20))
  }
  g.add(ball(2.5, M.char, { y: 2.5, z: -2 }))
  g.add(cylZ(3.2, 2.4, sub, 0, 14, 3.6, 20))
  g.add(lit(ball(0.8, acc, { x: -6, y: 24.4, z: -9 }), acc, 0.7))
  // 地刷 + 金属管 + 握把
  g.add(rbox(28, 4, 9, sub, { z: 25 }, 1.8))
  g.add(rbox(28.4, 1.2, 1.4, acc, { y: 0.4, z: 28.9 }, 0.5))
  g.add(ball(2.4, sub, { y: 5, z: 23.5 }))
  g.add(rod3([0, 5, 23.5], [0, 76, 15], 1.5, STEEL, 14))
  g.add(rod3([0, 76, 15], [0, 82, 13.5], 2.3, main, 14))
  g.add(cappedTube([[0, 82, 13.5], [0, 87, 12.4], [0, 91.5, 9.6]], 1.6, main, TUBE))
  g.add(rbox(2.6, 2.4, 1.6, acc, { y: 84.5, z: 13.2 }, 0.6))
  // 软管：从机身吸口绕到握把
  g.add(cappedTube([[0, 14, 4.2], [4, 16, 10], [9, 28, 13], [10.5, 48, 12.5], [8, 66, 11.5], [0.6, 79, 13.8]], 1.8, HOSE, { ...TUBE, seg: 60 }))
  return g
}

/** 手持无线吸尘器：吸嘴朝下插在充电座上 */
function handyVac(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(12, 3, 12, sub, { z: 0.9 }, 2.5))
  g.add(cyl(2.2, 1.6, 10, M.char, { y: 2, z: 0.9 }, 16))
  g.add(cyl(3.5, 3.5, 1, acc, { y: 11, z: 0.9 }))
  g.add(clearMat(cyl(3.3, 3.3, 9, C.glass, { y: 11.5, z: 0.9 }, 20), C.glass, 0.5))
  g.add(cyl(3.5, 3.5, 8.5, main, { y: 20.5, z: 0.9 }))
  g.add(puck(3.5, 2, main, { y: 28.5, z: 0.9 }))
  g.add(cappedTube([[0, 22, -1.8], [0, 23.5, -5.4], [0, 29.5, -6.2], [0, 32, -4.2], [0, 29.8, -1.6]], 1.3, sub, TUBE))
  g.add(lit(ball(0.5, acc, { y: 26, z: 4.3 }), acc, 0.7))
  return g
}

/** 无线吸尘器本体：原点在地刷底面，金属管立直 */
function cordlessVacBody(main: string, sub: string, acc: string) {
  const g = new THREE.Group()
  g.add(rbox(25, 4.5, 10, sub, { z: 3 }, 2))
  g.add(cylX(1.6, 22, acc, 0, 2.2, 8))
  g.add(ball(2.4, sub, { y: 5.2, z: 1 }))
  g.add(rod3([0, 5.2, 1], [0, 66, -1], 1.3, STEEL, 14))
  g.add(rbox(8, 18, 10, main, { y: 64, z: -1 }, 3))
  g.add(clearMat(cyl(3.6, 3.6, 13, C.glass, { y: 65, z: 7.2 }, 20), C.glass, 0.5))
  g.add(cyl(3.8, 3.8, 1.4, acc, { y: 78, z: 7.2 }, 20))
  g.add(cyl(3.2, 3.2, 1, M.char, { y: 64.4, z: 7.2 }, 20))
  g.add(rbox(5, 8, 4, sub, { y: 70, z: -7.6 }, 1.2))
  g.add(rod3([0, 81, -4], [0, 98, -7.5], 1.5, main, 12))
  g.add(rod3([0, 98, -7.5], [0, 81.5, 2], 1.2, main, 12))
  g.add(ball(1.5, main, { y: 98, z: -7.5 }))
  g.add(lit(ball(0.6, acc, { y: 79, z: 4.1 }), acc, 0.7))
  return g
}

function cordlessVacStand(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.5, 26, sub, { z: -1 }, 0.7))
  g.add(P(cordlessVacBody(main, sub, acc), 0, 1.5, 1))
  g.add(rbox(5, 96, 3, sub, { y: 1.5, z: -12.5 }, 1.2))
  g.add(ball(2.2, sub, { y: 97.5, z: -12.5 }))
  g.add(rbox(5, 4, 3.5, sub, { y: 73, z: -10 }, 1))
  // 立柱侧面的配件夹 + 缝隙吸嘴
  g.add(rbox(3.4, 3, 2.4, sub, { x: 3.6, y: 46, z: -12.5 }, 0.6))
  g.add(cyl(1.2, 0.7, 12, M.char, { x: 5.6, y: 38, z: -12.5 }, 12))
  return g
}

const CV_MOUNT = 8
function cordlessVacWall(p: string[]) {
  const [main, sub, acc] = p
  const y0 = CV_MOUNT
  const g = new THREE.Group()
  g.add(P(cordlessVacBody(main, sub, acc), 0, y0, 1))
  g.add(rbox(8, 18, 1.5, sub, { y: y0 + 64, z: -12.25 }, 0.6))
  g.add(rbox(5, 4, 3.4, sub, { y: y0 + 71, z: -10 }, 1))
  g.add(rbox(4, 12, 1.4, sub, { x: 9, y: y0 + 34, z: -12.3 }, 0.5))
  g.add(cyl(1.2, 0.7, 12, M.char, { x: 9, y: y0 + 30, z: -10.4 }, 12))
  g.add(lit(ball(0.5, '#7fe0a8', { y: y0 + 80, z: -11.4 }), '#7fe0a8', 0.7))
  return g
}

/** 扫地机器人（和 ap-robot-vac 同造型），原点在底面 */
function robot(main: string, sub: string, acc: string) {
  const g = new THREE.Group()
  g.add(puck(17, 7, main, { y: 1 }))
  g.add(torus(17, 1.3, sub, { y: 4, rx: PI / 2 }, PI))
  g.add(puck(11, 1.2, shade(main, -0.08), { y: 7.6 }))
  g.add(cyl(3.6, 3.6, 1.4, acc, { y: 8.6, z: -7 }, 20))
  g.add(lit(ball(1, '#7fe0a8', { y: 8.9, z: 4 }, [1, 0.4, 1]), '#7fe0a8', 0.8))
  return g
}

/** 自动集尘座 + 机器人 */
function robotStation(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(30, 40, 16, main, { z: -18 }, 4))
  g.add(rbox(30.4, 3, 16.4, sub, { y: 40, z: -18 }, 1.5))
  g.add(rbox(10, 0.6, 3, shade(sub, -0.15), { y: 42.8, z: -18 }, 0.3))
  g.add(glow(6, 0.8, '#7fe0a8', { y: 34, z: -9.8 }))
  g.add(rbox(26, 1, 14, sub, { z: -4 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(3, 1.4, 1, STEEL, { x: s * 5, y: 3, z: -9.7 }, 0.3))
  // 机器人本体标成 actorPart：预览时它离座去扫地（actors.ts）
  g.add(P(robot(main, sub, acc), 0, 0.3, 9)).children.at(-1)!.userData.actorPart = true
  return g
}

/** 全能基站：洗拖布、清水箱 / 污水箱，机器人开进下面 */
function robotStationMop(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(42, 44, 22, main, { z: -17 }, 4))
  g.add(rbox(42, 6, 18, main, { y: 38, z: 3 }, 3))
  g.add(rbox(40, 1.6, 30, sub, { z: 9 }, 0.6))
  g.add(glow(8, 1.2, acc, { y: 40.4, z: 12.1 }))
  for (const [x, c] of [
    [-10.5, '#bfe3f5'],
    [10.5, '#c9c2b5'],
  ] as [number, string][]) {
    g.add(rbox(19, 12.6, 18, shade(main, -0.04), { x, y: 44, z: -17 }, 2.5))
    g.add(rbox(4, 8, 0.6, c, { x, y: 46, z: -7.9 }, 0.3))
    g.add(rbox(19.4, 1.6, 18.4, sub, { x, y: 56.4, z: -17 }, 0.8))
    g.add(cappedTube([[x - 5, 58, -17], [x - 3.5, 60, -17], [x + 3.5, 60, -17], [x + 5, 58, -17]], 0.7, sub, TUBE))
  }
  g.add(P(robot(main, sub, acc), 0, 0.9, 11)).children.at(-1)!.userData.actorPart = true
  return g
}

/** 擦窗机器人：方形机身 + 安全绳 */
function windowRobot(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(27, 3, 27, sub, {}, 3))
  g.add(rbox(26, 4.5, 26, main, { y: 2.6 }, 5))
  g.add(puck(9, 1.4, shade(main, -0.06), { y: 6.6 }))
  g.add(rbox(14, 1.6, 3, sub, { y: 7.4 }, 0.8))
  g.add(lit(ball(0.6, acc, { x: 9, y: 7.1, z: 9 }, [1, 0.5, 1]), acc, 0.7))
  g.add(cappedTube([[0, 4.5, -12.8], [0, 3.5, -15.5], [2, 0.5, -18], [4, 0.45, -18.8]], 0.4, '#e05a3a', TUBE))
  g.add(torus(3.6, 0.45, '#e05a3a', { x: 7.4, y: 0.45, z: -18.6, rx: PI / 2 }))
  g.add(torus(2.6, 0.45, '#e05a3a', { x: 7.4, y: 1.3, z: -18.6, rx: PI / 2 }))
  return g
}

/** 蒸汽拖把 */
function steamMop(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(28.6, 1.2, 13.6, C.white, { z: 1.5 }, 0.5))
  g.add(rbox(28, 3.5, 13, sub, { y: 0.9, z: 1.5 }, 1.8))
  g.add(ball(2.4, sub, { y: 5.4, z: 1 }))
  g.add(rod3([0, 5.4, 1], [0, 30, -1], 1.8, main))
  g.add(rbox(10, 34, 8, main, { y: 28, z: -1.5 }, 3.5))
  g.add(clearMat(rbox(7, 16, 1.2, C.glass, { y: 36, z: 2.4 }, 0.5), C.glass, 0.55))
  g.add(lit(ball(0.7, acc, { y: 56, z: 2.5 }), acc, 0.7))
  g.add(rod3([0, 62, -1.5], [0, 104.5, -3.1], 1.3, STEEL, 14))
  g.add(rbox(4, 10, 4, main, { y: 104, z: -3.2 }, 1.5))
  g.add(cylX(1.4, 12, main, 0, 115, -3.2))
  // 电线挂钩 + 绕好的线
  for (const y of [70, 92]) g.add(rbox(2.4, 1.6, 3, sub, { y, z: -4.2 }, 0.5))
  g.add(rbox(3, 21, 1.6, M.char, { y: 71, z: -5.8 }, 0.7))
  return g
}

/** 立式挂烫机：水箱底座 + 伸缩杆 + 衣架 + 软管和喷头 */
function garmentSteamer(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(30, 8, 26, sub, {}, 3))
  g.add(rbox(22, 22, 18, main, { y: 7.5, z: -1 }, 4))
  g.add(clearMat(rbox(14, 12, 1, C.glass, { y: 10, z: 7.9 }, 0.4), C.glass, 0.5))
  g.add(glow(5, 2, acc, { y: 24, z: 8.1 }))
  g.add(rbox(5, 1.2, 4, acc, { x: 9, y: 7.6, z: 9.5 }, 0.5))
  g.add(cyl(1.2, 1.2, 120, STEEL, { y: 29, z: -6 }, 12))
  g.add(cyl(1.6, 1.6, 4, sub, { y: 88, z: -6 }, 12))
  g.add(ball(1.4, sub, { y: 149, z: -6 }))
  g.add(cappedTube([[-18, 141, -6], [-9, 147, -6], [0, 149, -6], [9, 147, -6], [18, 141, -6]], 0.8, sub, TUBE))
  // 喷头架 + 喷头
  g.add(rbox(4, 5, 4, sub, { y: 108, z: -3.2 }, 1))
  g.add(rbox(8, 12, 6, main, { y: 100, z: 1.5 }, 2.5))
  g.add(rbox(7, 10, 0.8, sub, { y: 101, z: 4.5 }, 0.3))
  g.add(cappedTube([[6, 29, 3], [10, 45, 8], [9, 75, 8], [4, 94, 4], [0, 101, 1.5]], 1.2, HOSE, { ...TUBE, seg: 48 }))
  return g
}

/** 除湿机 */
function dehumidifier(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(34, 50, 22, main, { y: 1.5 }, 4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(1.5, M.char, { x: sx * 13, y: 1.5, z: sz * 8 }))
  g.add(rbox(28, 0.8, 13, sub, { y: 51.2, z: 1 }, 0.4))
  for (let i = 0; i < 5; i++) g.add(noOutline(rbox(26, 0.4, 0.8, shade(sub, -0.2), { y: 51.8, z: -3.6 + i * 2.3 }, 0.2)))
  g.add(rbox(14, 1, 3, shade(main, -0.15), { y: 51.2, z: -8.4 }, 0.4))
  // 前面水箱
  g.add(rbox(30, 20, 1, shade(main, -0.04), { y: 4, z: 10.8 }, 0.5))
  g.add(rbox(10, 1.6, 1, sub, { y: 20.5, z: 11.2 }, 0.5))
  g.add(clearMat(rbox(2, 13, 0.8, C.glass, { x: 12, y: 6, z: 11.3 }, 0.3), C.glass, 0.6))
  // 操作面板
  g.add(rbox(20, 6, 0.8, sub, { y: 42, z: 10.9 }, 0.4))
  g.add(glow(6, 2.6, acc, { x: -5, y: 43.7, z: 11.3 }))
  for (const x of [3, 6, 9]) g.add(rbox(1.6, 1.6, 0.6, shade(sub, 0.15), { x, y: 44.2, z: 11.3 }, 0.3))
  g.add(rbox(24, 26, 0.8, sub, { y: 14, z: -11.1 }, 0.4))
  return g
}

/** 除螨仪：熨斗形机身、顶部集尘盒、提把 */
function miteVac(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(13, 1, 18, M.char, { z: 2 }, 0.4))
  g.add(rbox(15, 7, 28, main, { y: 0.6 }, 3.5))
  g.add(clearMat(rbox(10, 5, 8, C.glass, { y: 7.2, z: -8 }, 2), C.glass, 0.5))
  g.add(rbox(10.4, 1, 1.2, sub, { y: 7.2, z: -12.4 }, 0.4))
  g.add(cappedTube([[0, 7.3, -2.6], [0, 12.6, -1], [0, 14.4, 4.5], [0, 12.6, 9.5], [0, 7.3, 11]], 1.4, sub, TUBE))
  g.add(lit(ball(0.6, acc, { x: 4.5, y: 7.6, z: 10 }), acc, 0.7))
  g.add(cappedTube([[0, 3.5, -13.8], [0, 3, -15.5], [0, 0.5, -17], [2.5, 0.5, -18]], 0.45, M.char, TUBE))
  return g
}

// ======================================================================
// 拖把 / 扫除
// ======================================================================

/** 平板拖把（クイックル式），原点在拖布底面 */
function flatMopModel(main: string, sub: string, lean = 4) {
  const g = new THREE.Group()
  g.add(rbox(26.4, 0.8, 10.4, C.white, {}, 0.3))
  g.add(rbox(26, 2.4, 10, main, { y: 0.5 }, 1))
  for (const s of [-1, 1]) g.add(rbox(3, 0.4, 3, shade(main, -0.15), { x: s * 10.5, y: 2.8 }, 0.3))
  g.add(ball(1.5, sub, { y: 3.8 }))
  const top: V3 = [0, 116, -lean]
  g.add(rod3([0, 3.8, 0], top, 1.1, sub, 12))
  for (const t of [0.35, 0.68]) g.add(rod3([0, 3.8 + 112.2 * t - 0.8, -lean * t], [0, 3.8 + 112.2 * t + 0.8, -lean * t], 1.4, shade(sub, -0.12), 12))
  g.add(rod3([0, 96, -lean * 0.82], top, 1.6, main, 12))
  g.add(ball(1.6, main, { y: 116, z: -lean }))
  return g
}
function flatMop(p: string[]) {
  return flatMopModel(p[0], p[1])
}

/** 海绵拖把：挤水杆 + 海绵头 */
function spongeMop(p: string[]) {
  const [main, sponge, acc] = p
  const g = new THREE.Group()
  g.add(rbox(27, 5, 6, sponge, {}, 1))
  g.add(rbox(28, 2, 7, main, { y: 4.6 }, 0.8))
  g.add(rod3([0, 6.6, 0], [0, 118, -3], 1.2, STEEL, 12))
  g.add(rod3([0, 6.5, 1.9], [0, 56, 1.2], 0.5, STEEL, 8))
  g.add(rbox(3, 14, 2.4, acc, { y: 44, z: 1.4 }, 0.8))
  g.add(rod3([0, 100, -2.5], [0, 118, -3], 1.6, main, 12))
  g.add(torus(1.2, 0.35, main, { y: 120.2, z: -3 }))
  return g
}

/** 长柄扫帚：原点在刷毛底面中心，刷毛宽 bw */
function broomModel(handle: string, head: string, bristle: string, L: number, bw = 26) {
  const g = new THREE.Group()
  const b = bw / 2
  g.add(vpoly([[-b, 0], [b, 0], [b - 2, 11], [-b + 2, 11]], 3.2, bristle))
  for (const y of [3.5, 7]) g.add(noOutline(rbox(bw - 4 - y * 0.3, 0.5, 3.5, shade(bristle, -0.18), { y }, 0.2)))
  g.add(rbox(bw - 3, 3, 4.2, head, { y: 10.5 }, 1))
  g.add(cyl(1.3, 2.2, 5, head, { y: 13 }, 14))
  g.add(cyl(1.1, 1.1, L - 19.5, handle, { y: 17.5 }, 12))
  g.add(cyl(1.4, 1.4, 2.5, head, { y: L - 2.5 }, 12))
  g.add(torus(1, 0.3, head, { y: L + 0.6 }))
  return g
}

/** 自立式长柄簸箕：原点在底面中心，盘口朝 +z */
function dustpanModel(main: string, acc: string, H = 80) {
  const g = new THREE.Group()
  g.add(rbox(26, 0.8, 20, main, { z: 2 }, 0.3))
  g.add(rbox(26, 10, 1, main, { z: -8 }, 0.4))
  for (const s of [-1, 1]) g.add(vpoly([[-12, 0], [8.5, 0], [8.5, 10], [1, 10]], 0.9, main, { x: s * 12.6, ry: PI / 2 }))
  g.add(rbox(26, 0.8, 8.4, main, { y: 9.4, z: -4.4 }, 0.3))
  g.add(rbox(26.2, 0.5, 1.6, acc, { y: 0.1, z: 11.4 }, 0.2))
  g.add(cyl(1.2, 1.2, H - 10, main, { y: 10, z: -8 }, 12))
  g.add(rbox(3, 8, 3, acc, { y: H - 8, z: -8 }, 1))
  return g
}

/** 扫帚簸箕套装（自立式）：扫帚扣在簸箕柄上，刷毛收进簸箕里 */
function broomSetStanding(p: string[]) {
  const [main, bristle, acc] = p
  const g = new THREE.Group()
  g.add(dustpanModel(main, acc))
  g.add(P(broomModel(main, acc, bristle, 90, 22), 0, 0.8, 3.2))
  g.add(rbox(3, 3, 11.4, acc, { y: 66, z: -2.4 }, 0.8))
  return g
}

/** 扫帚簸箕（靠墙）：扫帚斜靠在墙上，簸箕立在旁边 */
function broomSetLeaning(p: string[]) {
  const [main, bristle, acc] = p
  const g = new THREE.Group()
  const br = broomModel(main, acc, bristle, 96)
  br.rotation.x = -0.2
  g.add(lift(P(G(br), -12, 0, 4)))
  g.add(P(dustpanModel(main, acc), 14, 0, 0))
  return g
}

/** 和式扫帚（座敷ほうき）+ 张子簸箕（はりこ塵取り） */
function jpBroom(p: string[]) {
  const [straw, thread, pan] = p
  const g = new THREE.Group()
  const br = new THREE.Group()
  br.add(vpoly([[-16, 0], [16, 0], [8.5, 26], [5, 40], [-5, 40], [-8.5, 26]], 2.6, straw))
  for (const y of [8, 15]) br.add(noOutline(rbox(30 - y * 0.6, 0.4, 2.9, shade(straw, -0.2), { y }, 0.15)))
  for (const [y, w] of [
    [27, 16.6],
    [31, 14.6],
    [35, 12.2],
  ]) br.add(rbox(w, 1.4, 3.4, thread, { y }, 0.4))
  br.add(cyl(1.4, 1.4, 86, J.hinoki, { y: 39 }, 12))
  for (const y of [58, 80, 102]) br.add(torus(1.45, 0.25, shade(J.hinoki, -0.15), { y, rx: PI / 2 }))
  br.add(cyl(1.6, 1.6, 2, thread, { y: 123 }, 12))
  br.add(torus(1.3, 0.3, thread, { y: 126.2 }))
  br.rotation.x = -0.15
  g.add(lift(P(G(br), -8, 0, 3)))
  // 张子簸箕：柿涩纸 + 黑边
  const dp = new THREE.Group()
  dp.add(rbox(24, 0.6, 18, pan, { z: 2 }, 0.3))
  dp.add(rbox(24, 9, 0.8, pan, { z: -7 }, 0.3))
  for (const s of [-1, 1]) dp.add(vpoly([[-11, 0], [7.4, 0], [7.4, 9], [2, 9]], 0.8, pan, { x: s * 11.6, ry: PI / 2 }))
  dp.add(rbox(24.4, 0.7, 1.2, J.sumi, { z: 10.5 }, 0.3))
  dp.add(rbox(24.4, 1, 1, J.sumi, { y: 8.6, z: -7 }, 0.3))
  dp.add(rbox(6, 1.2, 4, pan, { y: 7.6, z: -9 }, 0.5))
  g.add(P(dp, 12, 0, 1))
  return g
}

/** 清洁工具收纳架：接水底盘 + 双立柱，左边夹着平板拖把和扫帚，右边一根挂杆（S 钩挂小工具） */
const TR = { w: 64, barY: 92, barZ: -3.5, barR: 0.8, barX0: 18, barX1: 31 }
function toolRack(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(tray(TR.w, 3, 22, 1, sub))
  for (const s of [-1, 1]) g.add(rbox(3, 112, 3, main, { x: s * 30, y: 1, z: -9 }, 0.8))
  g.add(rbox(63, 4, 3, main, { y: 100, z: -9 }, 1))
  g.add(rbox(63, 3, 3, main, { y: 78, z: -9 }, 1))
  // 夹子：从横梁伸出来的臂 + 套环
  for (const x of [-17.5, 6]) {
    g.add(rbox(3.4, 2.5, 11, acc, { x, y: 78.2, z: -3.5 }, 0.8))
    g.add(torus(1.6, 0.45, acc, { x, y: 79.5, z: 3, rx: PI / 2 }))
  }
  g.add(P(flatMopModel(main, sub, 0), -17.5, 1, 3))
  g.add(P(broomModel(sub, main, C.lemon, 104, 22), 6, 1, 3))
  // 右边挂杆
  g.add(rbox(3, 4, 6, main, { x: TR.barX1 - 1.5, y: TR.barY - 2, z: -6 }, 0.6))
  g.add(cylX(TR.barR, TR.barX1 - TR.barX0, STEEL, (TR.barX0 + TR.barX1) / 2, TR.barY, TR.barZ))
  g.add(ball(1.2, acc, { x: TR.barX0, y: TR.barY, z: TR.barZ }))
  return g
}

// ======================================================================
// 垃圾桶 / 资源回收
// ======================================================================

const SORT_KINDS = [
  { t: '可燃ごみ', s: 'もえるごみ', c: '#e2574c' },
  { t: 'プラ', s: 'プラスチック', c: '#e8a52c' },
  { t: 'びん・かん', s: '資源ごみ', c: '#3fa267' },
  { t: '不燃ごみ', s: 'もえないごみ', c: '#4a7fc1' },
]
const SORT_SETS: Record<number, number[]> = { 2: [0, 1], 3: [0, 1, 2], 4: [0, 3, 1, 2] }
const SB = { uw: 22, d: 38, h: 56 }

function drawSort(k: (typeof SORT_KINDS)[number]) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = k.c
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffffff'
    g.fillRect(W * 0.06, H * 0.62, W * 0.88, H * 0.3)
    text(g, k.t, W / 2, H * 0.33, H * 0.36, '#ffffff', W * 0.86)
    text(g, k.s, W / 2, H * 0.77, H * 0.18, k.c, W * 0.8)
  }
}

/** 分类垃圾桶组：并排 n 个翻盖桶，正面贴分类标签 */
function sortingBins(p: string[], n: number) {
  const [main, lid, acc] = p
  const g = new THREE.Group()
  const kinds = SORT_SETS[n]
  kinds.forEach((k, i) => {
    const x = (i - (n - 1) / 2) * (SB.uw + 0.6)
    g.add(P(shell(SB.uw, SB.h, SB.d, 1.2, main, { top: false }), x))
    g.add(rbox(SB.uw + 0.4, 2.6, SB.d + 0.4, lid, { x, y: SB.h }, 1))
    g.add(rbox(10, 1.2, 1, shade(lid, -0.15), { x, y: SB.h + 0.7, z: SB.d / 2 - 0.1 }, 0.4))
    g.add(rbox(SB.uw - 4, 0.5, 0.8, acc, { x, y: SB.h - 4, z: SB.d / 2 + 0.2 }, 0.2))
    g.add(paintPanel(16, 11, `chore-sort-${k}`, drawSort(SORT_KINDS[k]), { x, y: 34, z: SB.d / 2 + 0.35 }))
  })
  return g
}

/** 脚踏垃圾桶（圆桶） */
function pedalBin(p: string[]) {
  const [main, lid, acc] = p
  const g = new THREE.Group()
  g.add(cyl(12.2, 12.2, 1.2, M.char, {}, 28))
  g.add(cup(13, 12, 38, 1, main, { y: 1 }))
  g.add(puck(13.4, 3, lid, { y: 38.6 }))
  g.add(rbox(5, 2.4, 3, lid, { y: 37.8, z: -13.6 }, 0.8))
  g.add(rbox(9, 1.6, 5, acc, { y: 1.4, z: 13.4 }, 0.6))
  return g
}

/** 厨房大垃圾桶（45L，带脚轮的方形翻盖） */
function kitchenBin(p: string[]) {
  const [main, lid, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(1, M.char, { x: sx * 12, y: 1, z: sz * 18 }))
  g.add(P(shell(30, 60, 44, 1.2, main, { top: false }), 0, 1.6))
  g.add(rbox(30.6, 3, 44.6, lid, { y: 61.4 }, 1.4))
  g.add(rbox(24, 0.5, 19, shade(lid, -0.08), { y: 64.2, z: 9 }, 0.3))
  g.add(rbox(6, 1.6, 1.4, acc, { y: 62.2, z: 22.4 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(0.8, 3, 12, shade(main, -0.12), { x: s * 15.2, y: 52 }, 0.3))
  g.add(paintPanel(9, 4, `chore-45l-${acc}`, drawLabel('#ffffff', null, [['45L', 0.52, 0.7, acc]]), { y: 50, z: 22.35 }))
  return g
}

/** 带盖小垃圾桶（翻转盖） */
function swingBin(p: string[]) {
  const [main, lid, acc] = p
  const g = new THREE.Group()
  g.add(cup(11, 10, 24, 0.8, main))
  g.add(torus(11.1, 0.5, acc, { y: 23.4, rx: PI / 2 }))
  g.add(puck(11.4, 6, lid, { y: 23 }))
  g.add(rbox(13, 0.6, 9, shade(lid, -0.12), { y: 28.6, z: 1 }, 0.3))
  g.add(rbox(3, 0.8, 1.2, acc, { y: 28.9, z: 5 }, 0.3))
  return g
}

/** 垃圾袋盒：抽取式，袋子从顶上露出来 */
function bagBox(p: string[]) {
  const [box, bag, acc] = p
  const g = new THREE.Group()
  g.add(rbox(26, 10, 11, box, {}, 0.8))
  g.add(noOutline(rbox(16, 0.4, 2, shade(box, -0.35), { y: 9.9 }, 0.2)))
  g.add(clearMat(rbox(12, 5, 0.3, bag, { y: 9.4, z: 0.3, rx: -0.25 }, 0.1), bag, 0.75))
  g.add(paintPanel(22, 7, `chore-bag-${box}-${acc}`, drawLabel(box, acc, [['ゴミ袋', 0.5, 0.38, '#3e3a39'], ['45L · 30枚', 0.82, 0.16, '#3e3a39']], 0.22), { y: 1.4, z: 5.85 }))
  return g
}

/** 资源回收箱（瓶罐）：镂空塑料筐 + 空瓶、空罐 */
function bottleCrate(p: string[]) {
  const [crate, can, acc] = p
  const g = new THREE.Group()
  const long = [-13, 0, 13].map((x) => ({ kind: 'rect' as const, x, y: 7, w: 9, h: 11, r: 1.5 }))
  const short = [-6.5, 6.5].map((x) => ({ kind: 'rect' as const, x, y: 7, w: 8, h: 11, r: 1.5 }))
  g.add(shell(44, 22, 32, 1.4, crate, { top: false, front: long, back: long, left: short, right: short }))
  const bottle = (x: number, z: number, c: string) => {
    g.add(cyl(3.4, 3.4, 15, c, { x, y: 1.4, z }, 18))
    g.add(cyl(1.2, 3.4, 4, c, { x, y: 16.4, z }, 18))
    g.add(cyl(1.2, 1.2, 4.6, c, { x, y: 20.4, z }, 12))
    g.add(cyl(1.35, 1.35, 0.8, STEEL, { x, y: 25, z }, 12))
  }
  bottle(-15, -8, '#5f9e6e')
  bottle(-7, -7.6, '#8a5a33')
  bottle(1, -8.2, '#cfe6e0')
  bottle(14, -7.8, '#5f9e6e')
  const tin = (x: number, z: number, band: string) => {
    g.add(cyl(3.3, 3.3, 12, can, { x, y: 1.4, z }, 18))
    g.add(cyl(3.42, 3.42, 5, band, { x, y: 4.8, z }, 18))
    g.add(cyl(2.7, 3.3, 0.8, can, { x, y: 13.4, z }, 18))
  }
  tin(-15, 7, acc)
  tin(-7.4, 7.6, C.red)
  tin(0.4, 6.8, acc)
  tin(8.2, 7.4, '#4a7fc1')
  tin(15.4, 7, C.lemon)
  return g
}

function drawNews(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#f2efe6'
  g.fillRect(0, 0, W, H)
  text(g, '新聞', W * 0.8, H * 0.13, H * 0.16, '#3e3a39', W * 0.3)
  g.fillStyle = '#3e3a39'
  g.fillRect(W * 0.06, H * 0.06, W * 0.56, H * 0.12)
  g.fillStyle = '#9a9690'
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 9; r++) {
      const x = W * (0.06 + c * 0.225)
      const y = H * (0.28 + r * 0.075)
      if (c === 1 && r > 1 && r < 6) continue
      g.fillRect(x, y, W * 0.19, H * 0.025)
    }
  g.fillStyle = '#c9c4ba'
  g.fillRect(W * 0.29, H * 0.43, W * 0.19, H * 0.27)
}

function drawCarton(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#c8a06a'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#e88a2c'
  g.beginPath()
  g.arc(W * 0.3, H * 0.45, H * 0.2, 0, PI * 2)
  g.fill()
  g.fillStyle = '#5f9e4a'
  g.fillRect(W * 0.28, H * 0.2, W * 0.04, H * 0.08)
  text(g, 'みかん', W * 0.66, H * 0.45, H * 0.22, '#7a4e2a', W * 0.42)
  g.fillStyle = '#9a7650'
  g.fillRect(0, H * 0.8, W, H * 0.04)
}

/** 绑好的报纸 / 纸箱捆：一摞叠好的纸 + 十字捆绳 */
function paperBundle(p: string[], kind: 'news' | 'carton') {
  const [paper, string] = p
  const news = kind === 'news'
  const [w, d, t, n] = news ? [40, 27, 2.6, 6] : [50, 36, 1.2, 9]
  const g = new THREE.Group()
  const rand = rng(news ? 7 : 11)
  for (let i = 0; i < n; i++) {
    const top = i === n - 1
    const c = news ? (i % 2 ? shade(paper, -0.04) : paper) : i % 2 ? '#c8a06a' : '#bf975f'
    g.add(rbox(w, t, d, c, { y: i * t, x: top ? 0 : (rand() - 0.5) * 1.6, z: top ? 0 : (rand() - 0.5) * 1.6, ry: top ? 0 : (rand() - 0.5) * 0.04 }, Math.min(0.5, t * 0.3)))
  }
  const H = n * t
  g.add(paintPanel(w - 2, d - 2, news ? 'chore-news' : 'chore-carton', news ? drawNews : drawCarton, { y: H + 0.3, z: (d - 2) / 2, rx: -PI / 2 }))
  // 十字捆绳（绳子压在最上面）
  g.add(rbox(w + 1.4, 0.6, 1, string, { y: H }, 0.25))
  g.add(rbox(1, 0.6, d + 1.4, string, { y: H }, 0.25))
  for (const s of [-1, 1]) {
    g.add(rbox(0.6, H, 1, string, { x: s * (w / 2 + 0.6), y: 0.05 }, 0.25))
    g.add(rbox(1, H, 0.6, string, { z: s * (d / 2 + 0.6), y: 0.05 }, 0.25))
  }
  g.add(ball(1.2, string, { y: H + 0.6 }, [1.4, 0.7, 1.4]))
  g.add(cappedTube([[0, H + 0.8, 0], [3, H + 0.7, 2.5], [5, H + 0.6, 2]], 0.3, string, TUBE))
  return g
}

// ======================================================================
// 清洁剂 / 小工具（prop）
// ======================================================================

/** 多用途清洁喷雾：扁瓶 + 扳机喷头 */
function sprayBottle(p: string[]) {
  const [body, head, lab] = p
  const g = new THREE.Group()
  g.add(rbox(8, 15, 5, body, {}, 1.2))
  g.add(cyl(2.4, 3, 2.4, body, { y: 14.4 }, 20))
  g.add(cyl(1.7, 1.7, 1.6, head, { y: 16.6 }, 16))
  g.add(rbox(3.2, 4, 7.5, head, { y: 18, z: 1.8 }, 1.2))
  g.add(rbox(1.4, 1.4, 1.2, M.char, { y: 19.8, z: 5.9 }, 0.4))
  g.add(rbox(1.8, 4.5, 1.2, head, { y: 13.8, z: 4.4, rx: 0.2 }, 0.5))
  g.add(paintPanel(5.4, 7.6, `chore-spray-${lab}`, drawLabel('#ffffff', lab, [['マルチ', 0.42, 0.15, '#3e3a39'], ['クリーナー', 0.6, 0.12, '#3e3a39'], ['除菌', 0.8, 0.1, lab]], 0.2), { y: 3.4, z: 2.8 }))
  return g
}

/** 厨房泡沫清洁剂：圆瓶 + 泡沫喷头 */
function foamBottle(p: string[]) {
  const [body, head, lab] = p
  const g = new THREE.Group()
  g.add(cyl(3.6, 3.6, 17, body, {}, 28))
  g.add(cyl(1.8, 3.6, 2.5, body, { y: 17 }, 28))
  g.add(cyl(1.8, 1.8, 1.4, head, { y: 19.3 }, 16))
  g.add(rbox(3.6, 4.4, 7, head, { y: 20.6, z: 1.6 }, 1.4))
  g.add(cylZ(1.3, 1.6, C.white, 0, 22.8, 5.6, 14))
  g.add(rbox(1.8, 4.5, 1.2, head, { y: 16.4, z: 4.8, rx: 0.2 }, 0.5))
  g.add(rbox(5.2, 8.4, 1.6, C.white, { y: 3.6, z: 3.1 }, 0.4))
  g.add(paintPanel(4.6, 7.8, `chore-foam-${lab}`, drawLabel('#ffffff', lab, [['キッチン', 0.4, 0.12, '#3e3a39'], ['泡', 0.62, 0.24, lab], ['クリーナー', 0.84, 0.1, '#3e3a39']], 0.18), { y: 3.9, z: 4.2 }))
  return g
}

/** 洗洁精：扁圆瓶 + 翻盖 */
function dishSoap(p: string[]) {
  const [body, cap, lab] = p
  const g = new THREE.Group()
  g.add(rbox(7, 15, 4.4, body, {}, 1.4))
  g.add(cyl(1.6, 2.2, 1.6, body, { y: 14.6 }, 16))
  g.add(cyl(1.7, 1.7, 2.4, cap, { y: 16 }, 16))
  g.add(cyl(0.5, 0.6, 1, cap, { y: 18.4, z: 0.6 }, 10))
  g.add(paintPanel(4.2, 7.4, `chore-dish-${body}-${lab}`, drawBubbleLabel('#ffffff', body, '食器用', '洗剤', lab), { y: 3.2, z: 2.5 }))
  return g
}

/** 洗洁精补充装：自立袋 + 斜口 */
function soapPouch(p: string[]) {
  const [body, cap, lab] = p
  const g = new THREE.Group()
  g.add(rbox(12.4, 5, 4.4, body, {}, 1.6))
  g.add(vpoly([[-6, 1], [6, 1], [6, 14], [4.5, 18], [-6, 18]], 2.2, body))
  const dir = new THREE.Vector2(4, 1.5).normalize()
  const cx = 5.25 + dir.x * 1.2
  const cy = 16 + dir.y * 1.2
  g.add(cyl(0.9, 0.9, 2, cap, { x: cx, y: cy - 1, rz: -Math.atan2(dir.x, dir.y) }, 12))
  g.add(paintPanel(9, 9, `chore-pouch-${body}-${lab}`, drawBubbleLabel('#ffffff', body, 'つめかえ用', '食器用洗剤', lab), { x: -0.5, y: 6, z: 1.45 }))
  return g
}

/** 海绵 + 海绵架 */
function spongeHolder(p: string[]) {
  const [rack, sponge, scrub] = p
  const g = new THREE.Group()
  g.add(tray(12, 4, 8, 0.5, rack, {}, 0.25))
  for (const z of [-2, 0, 2]) g.add(rbox(11, 0.6, 0.5, rack, { y: 0.5, z }, 0.2))
  g.add(rbox(9.4, 3, 6.4, sponge, { y: 1.1 }, 0.8))
  g.add(rbox(9.4, 1, 6.4, scrub, { y: 4.1 }, 0.4))
  return g
}

/** 一只橡胶手套：手指朝上立在 xy 平面里，原点在袖口底面 */
function glove(c: string) {
  const g = new THREE.Group()
  g.add(rbox(9.4, 1.2, 2.4, shade(c, -0.06), {}, 0.5))
  g.add(rbox(9, 9, 1.8, c, { y: 0.6 }, 0.8))
  g.add(rbox(8.6, 9, 2.2, c, { y: 8.6 }, 1))
  ;[
    [-3, 4.8],
    [-1, 6],
    [1, 5.8],
    [3, 4.6],
  ].forEach(([x, len]) => g.add(capsule(0.95, len, c, { x, y: 16.4 })))
  const tl = 4.2
  g.add(capsule(1.05, tl, c, { x: 5.4, y: 13 - (tl / 2 + 1.05), rz: -0.7 }))
  return g
}

function glovesLying(p: string[]) {
  const [c] = p
  const a = glove(c)
  a.rotation.set(-PI / 2, 0, 0)
  const b = glove(c)
  b.rotation.set(PI / 2, 0, PI + 0.12)
  b.position.set(10.5, 0.2, -2)
  return ground(G(a, b))
}

function glovesHanging(p: string[]) {
  const [c, , acc] = p
  const bz = 3
  const g = G(sHook(bz))
  const clipY = RING_Y(0.9, 0.25)
  g.add(torus(0.9, 0.25, acc, { y: clipY, z: bz }))
  g.add(rbox(3.2, 3.4, 2.6, acc, { y: clipY - 4, z: bz }, 0.6))
  for (const [x, z] of [
    [-3, bz - 1],
    [3, bz + 1.2],
  ]) {
    const gl = glove(c)
    gl.rotation.z = PI
    gl.position.set(x, clipY - 2.4, z)
    g.add(gl)
  }
  return g
}

/** 抹布挂架（ふきんハンガー）：四根伸臂各搭一条抹布 */
function clothHanger(p: string[]) {
  const [frame, c1, c2] = p
  const g = new THREE.Group()
  g.add(puck(6.5, 1.6, frame))
  g.add(cyl(0.6, 0.6, 30, frame, { y: 1.4 }, 10))
  g.add(ball(1.2, frame, { y: 31.4 }))
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group()
    const c = i % 2 ? c2 : c1
    arm.add(cylX(0.4, 11, frame, 6.5, 31.4, 0, 8))
    arm.add(cylX(1.1, 9, c, 7.2, 31.4, 0, 14))
    for (const s of [-1, 1]) arm.add(rbox(9, 14, 0.4, c, { x: 7.2, y: 17.4, z: s * 0.85 }, 0.15))
    arm.add(noOutline(rbox(9.1, 0.8, 1.9, shade(c, -0.15), { x: 7.2, y: 19.5 }, 0.2)))
    arm.rotation.y = PI / 4 + (i * PI) / 2
    g.add(arm)
  }
  return g
}

/** 钢丝球 + 小碟 */
function steelWool(p: string[]) {
  const [dish, wool, pad] = p
  const g = new THREE.Group()
  g.add(cup(5.4, 4.4, 2.2, 0.4, dish))
  const balls: V3[] = [
    [-1.7, 2.1, 0.5],
    [1.9, 2.2, -0.7],
  ]
  balls.forEach(([x, y, z], i) => {
    g.add(ball(2, wool, { x, y, z }, [1, 0.8, 1]))
    for (let k = 0; k < 2; k++) g.add(noOutline(torus(1.75, 0.12, shade(wool, -0.22), { x, y, z, rx: 0.6 + k * 1.1 + i, ry: k * 0.9 })))
  })
  g.add(rbox(4, 1.2, 2.8, pad, { x: 0.6, y: 2.9, z: 2.1, ry: 0.4, rx: -0.2 }, 0.4))
  return g
}

/** 去污粉：纸筒 + 撒粉盖 */
function cleanser(p: string[]) {
  const [can, cap, lab] = p
  const g = new THREE.Group()
  g.add(cyl(3.8, 3.8, 14, can, {}, 28))
  g.add(cyl(3.9, 3.9, 1.2, cap, { y: 13.4 }, 28))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    g.add(noOutline(cyl(0.35, 0.35, 0.3, M.char, { x: Math.cos(a) * 1.8 - 0.6, y: 14.5, z: Math.sin(a) * 1.8 }, 8)))
  }
  g.add(rbox(2, 0.5, 1.6, cap, { x: 2.2, y: 14.5, z: 0 }, 0.2))
  g.add(rbox(5.6, 8.4, 1.6, can, { y: 2.6, z: 3.3 }, 0.4))
  g.add(paintPanel(5, 7.8, `chore-cleanser-${can}-${lab}`, drawLabel(can, lab, [['クレンザー', 0.42, 0.13, '#3e3a39'], ['みがき粉', 0.66, 0.16, lab]], 0.2), { y: 2.9, z: 4.4 }))
  return g
}

/** 置き型除臭剂：透明方罐里一块凝胶 + 通风盖 */
function deodorizer(p: string[]) {
  const [gel, cap, lab] = p
  const g = new THREE.Group()
  g.add(rbox(6.8, 4.4, 4.8, gel, { y: 0.4 }, 0.8))
  g.add(clearMat(rbox(7.6, 7, 5.6, C.glass, {}, 1), C.glass))
  g.add(rbox(8, 3, 6, cap, { y: 6.6 }, 1))
  for (const x of [-2.2, 0, 2.2]) g.add(noOutline(rbox(1, 0.3, 4, shade(cap, -0.25), { x, y: 9.5 }, 0.15)))
  g.add(paintPanel(6, 2.2, `chore-deo-${cap}-${lab}`, drawLabel(cap, null, [['消臭', 0.5, 0.62, lab]]), { y: 7, z: 3.35 }))
  return g
}

/** 自动喷香机：定时喷香的小机身（换芯式），可以摆台面也可以放架子上 */
function autoFreshener(p: string[]) {
  const [body, cap, lab] = p
  const g = new THREE.Group()
  g.add(rbox(9, 17, 7, body, {}, 1.6))
  g.add(rbox(9.4, 4, 7.4, cap, { y: 16.6 }, 1.6))
  g.add(cylZ(0.9, 0.6, M.char, 0, 18.6, 3.65, 14))
  g.add(lit(ball(0.45, '#7fe0a8', { x: 3, y: 14.6, z: 3.5 }), '#7fe0a8', 0.7))
  g.add(rbox(3, 0.8, 1, shade(body, -0.12), { y: 1.2, z: 3.3 }, 0.3))
  g.add(paintPanel(5.6, 6, `chore-fresh-${body}-${lab}`, drawBubbleLabel(body, lab, 'アロマ', 'AUTO SPRAY', '#3e3a39'), { y: 5, z: 3.85 }))
  return g
}

/** 粘毛滚筒本体：滚筒在下、手柄朝上，原点在滚筒底面；顶上有挂绳环 */
const LR_TOP = 20.4
function linterBody(handle: string, paper = '#fbf7ec') {
  const g = new THREE.Group()
  g.add(cylX(3.3, 10.2, paper, 0, 3.3, 0, 24))
  g.add(cylX(1.2, 10.8, handle, 0, 3.3, 0, 12))
  g.add(rod3([5.2, 3.3, 0], [5.2, 7.4, 0], 0.6, handle, 8))
  g.add(rod3([5.2, 7.4, 0], [0, 9, 0], 0.6, handle, 8))
  g.add(cyl(1.1, 1.3, 10.6, handle, { y: 8.6 }, 14))
  g.add(ball(1.1, handle, { y: 19.2 }))
  g.add(torus(0.9, 0.25, handle, { y: LR_TOP - 0.3 }))
  return g
}
function linterStanding(p: string[]) {
  const [caseC, handle] = p
  const g = new THREE.Group()
  g.add(tray(13.4, 7.6, 8.4, 0.6, caseC, {}, 0.3))
  g.add(P(linterBody(handle), 0, 0.6, 0))
  return g
}
function linterHanging(p: string[]) {
  const [, handle] = p
  const bz = 3.9
  return G(sHook(bz), P(linterBody(handle), 0, RING_Y(0.9, 0.25) - (LR_TOP - 0.3), bz))
}

/** 除尘掸子（静电纤维）：原点在手柄底端（底端有挂绳环） */
function dusterBody(fluff: string, handle: string) {
  const g = new THREE.Group()
  g.add(torus(0.9, 0.25, handle, { y: -0.6 }))
  g.add(cyl(0.8, 0.9, 18, handle, { y: 0 }, 12))
  g.add(cyl(1.4, 1.1, 2, handle, { y: 17.4 }, 12))
  g.add(capsule(2.8, 14, fluff, { y: 18.6 }))
  const rand = rng(5)
  for (let i = 0; i < 14; i++) {
    const a = rand() * PI * 2
    const y = 21 + rand() * 13
    g.add(ball(1.4, i % 3 ? fluff : shade(fluff, -0.08), { x: Math.cos(a) * 2.4, y, z: Math.sin(a) * 2.4 }))
  }
  return g
}
function dusterStanding(p: string[]) {
  const [fluff, handle, holder] = p
  const g = new THREE.Group()
  g.add(cup(3.2, 2.8, 9, 0.4, holder))
  g.add(P(dusterBody(fluff, handle), 0, 2, 0))
  return g
}
function dusterHanging(p: string[]) {
  const [fluff, handle] = p
  const bz = 5
  const body = dusterBody(fluff, handle)
  body.rotation.z = PI
  // 翻转后挂环中心在 y = +0.6
  body.position.set(0, RING_Y(0.9, 0.25) - 0.6, bz)
  return G(sHook(bz), body)
}

/** 晾衣夹衣架（方形ピンチハンガー） */
const PH = { s: 30, zc: 16.2, y: -17 }
function pinchFrame(frame: string, pin: string, hanging: boolean) {
  const g = new THREE.Group()
  const h = PH.s / 2
  const corners: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ]
  corners.forEach(([x, z], i) => {
    const [x2, z2] = corners[(i + 1) % 4]
    g.add(rod3([x, 0, z], [x2, 0, z2], 0.5, frame, 8))
    g.add(ball(0.6, frame, { x, z }))
  })
  g.add(rod3([-h, 0, 0], [h, 0, 0], 0.35, frame, 8))
  g.add(rod3([0, 0, -h], [0, 0, h], 0.35, frame, 8))
  const ts = [-10.5, -3.5, 3.5, 10.5]
  for (const t of ts)
    for (const [x, z, ax] of [
      [t, -h, 'z'],
      [t, h, 'z'],
      [-h, t, 'x'],
      [h, t, 'x'],
    ] as [number, number, 'x' | 'z'][]) {
      if (hanging) {
        g.add(cyl(0.22, 0.22, 1.6, frame, { x, y: -1.6, z }, 6))
        g.add(rbox(ax === 'z' ? 1.8 : 1, 4.6, ax === 'z' ? 1 : 1.8, pin, { x, y: -6.2, z }, 0.35))
      } else {
        const out = 2.2
        const ox = ax === 'x' ? Math.sign(x) * out : 0
        const oz = ax === 'z' ? Math.sign(z) * out : 0
        g.add(rbox(ax === 'x' ? 4.6 : 1.8, 1, ax === 'x' ? 1.8 : 4.6, pin, { x: x + ox, y: -1.5, z: z + oz }, 0.35))
      }
    }
  return g
}
function pinchHangerLying(p: string[]) {
  const [frame, pin] = p
  const g = new THREE.Group()
  g.add(P(pinchFrame(frame, pin, false), 0, 1.5, 0))
  g.add(ball(0.9, frame, { y: 2.2 }))
  g.add(rod3([0, 2.4, 0], [0, 2.4, -8], 0.35, frame, 8))
  g.add(torus(1.3, 0.35, frame, { y: 2.4, z: -9.3, rx: PI / 2 }))
  return ground(g)
}
function pinchHangerHanging(p: string[]) {
  const [frame, pin] = p
  const g = new THREE.Group()
  const { zc, y } = PH
  const top = arcYZ([0, -1.45, 0.2], 1.2, PI * 1.2, -PI * 0.15, 8)
  g.add(cappedTube([...top, [0, -3.4, 3.5], [0, -6, 9.5], [0, -8.6, zc - 1], [0, -10.4, zc]], 0.35, frame, { ...TUBE, seg: 40 }))
  g.add(ball(0.8, frame, { y: -10.6, z: zc }))
  const h = PH.s / 2
  for (const [x, z] of [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ]) g.add(rod3([0, -10.6, zc], [x, y, zc + z], 0.25, frame, 6))
  g.add(P(pinchFrame(frame, pin, true), 0, y, zc))
  return g
}

// ======================================================================
// 配色
// ======================================================================

const VAC_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.char, M.black, '#9fd8ff']],
  ['cute', [C.lilac, C.white, C.pink]],
  ['cute', [C.mint, C.white, C.sky]],
  ['nordic', [N.sage, N.white, N.oak]],
]
const CANISTER_PALS: Pal[] = [
  ['modern', [M.white, M.char, '#e05a3a']],
  ['modern', [M.char, M.black, M.silver]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['retro', [R.red, R.cream, R.mustard]],
  ['nordic', [N.blue, N.white, N.oak]],
]
const ROBOT_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.black, M.char, M.silver]],
  ['cute', [C.white, C.sky, C.pink]],
  ['nordic', [N.white, N.gray, N.oak]],
]
const HOME_APPL_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#9fd8ff']],
  ['modern', [M.char, M.black, '#9fd8ff']],
  ['cute', [C.white, C.mint, '#7fe0a8']],
  ['nordic', [N.white, N.gray, N.mustard]],
]
const MOP_PALS: Pal[] = [
  ['cute', [C.sky, C.white, C.pink]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['modern', [M.white, M.gray, M.char]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['industrial', [I.steel, I.iron, I.walnut]],
]
const SPONGE_MOP_PALS: Pal[] = [
  ['cute', [C.sky, C.lemon, C.pink]],
  ['cute', [C.mint, '#ffd36b', C.white]],
  ['modern', [M.char, M.light, M.white]],
  ['nordic', [N.gray, N.mustard, N.white]],
]
const BROOM_PALS: Pal[] = [
  ['cute', [C.sky, C.lemon, C.pink]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['modern', [M.char, M.gray, M.white]],
  ['nordic', [N.oak, N.linen, N.sage]],
  ['industrial', [I.iron, '#c9a66b', I.walnut]],
]
const JP_BROOM_PALS: Pal[] = [
  ['japanese', ['#c9a65a', J.shu, '#8a4b2a']],
  ['japanese', ['#bfa261', J.ai, '#8a4b2a']],
  ['japanese', ['#c9a65a', '#3f7a52', J.sumi]],
  ['retro', ['#c79f55', R.red, R.caramel]],
]
const RACK_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.black, M.char, M.silver]],
  ['nordic', [N.oak, N.white, N.sage]],
  ['cute', [C.white, C.sky, C.pink]],
  ['industrial', [I.iron, I.steel, I.walnut]],
]
const BIN_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.char, M.black, M.silver]],
  ['nordic', [N.white, N.oak, N.gray]],
  ['cute', [C.white, C.sky, C.pink]],
]
const PEDAL_PALS: Pal[] = [
  ['modern', [M.silver, M.black, M.char]],
  ['modern', [M.white, M.white, M.char]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['retro', [R.mustard, R.cream, R.caramel]],
]
const KBIN_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.char, M.black, '#e05a3a']],
  ['nordic', [N.gray, N.white, N.oak]],
  ['cute', [C.mint, C.white, C.pink]],
]
const SWING_PALS: Pal[] = [
  ['cute', [C.pink, C.white, C.lemon]],
  ['cute', [C.sky, C.white, C.pink]],
  ['modern', [M.white, M.char, M.silver]],
  ['nordic', [N.linen, N.white, N.oak]],
  ['retro', [R.teal, R.cream, R.orange]],
]
const BAG_PALS: Pal[] = [
  ['modern', ['#f4f4f2', '#cfd6dc', '#4a7fc1']],
  ['cute', ['#fff1dc', '#d9eefb', '#ff8fa8']],
  ['nordic', ['#f7f5f0', '#e3e6e2', '#7a9b74']],
  ['retro', ['#f4e7c8', '#f0e6c8', '#c8473a']],
]
const CRATE_PALS: Pal[] = [
  ['modern', ['#3f6fb0', M.silver, '#e8a52c']],
  ['cute', [C.mint, C.steel, C.pink]],
  ['retro', [R.mustard, C.steel, R.red]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
const PAPER_PALS: Pal[] = [
  ['nordic', ['#f2efe6', '#e3d3ac']],
  ['japanese', ['#f2efe6', '#d9c38f']],
  ['modern', ['#eceae4', '#ffffff']],
  ['retro', ['#efe6cf', R.red]],
]
const SPRAY_PALS: Pal[] = [
  ['modern', ['#f4f4f2', M.char, '#3f8fd0']],
  ['cute', ['#d9f0ff', C.sky, '#3f8fd0']],
  ['cute', ['#ffe3ec', C.pink, '#e0507a']],
  ['nordic', ['#e8f0e4', N.sage, '#5c8a56']],
]
const FOAM_PALS: Pal[] = [
  ['modern', ['#f4f4f2', '#e2574c', '#e2574c']],
  ['cute', ['#fff4c9', C.orange, '#e88a2c']],
  ['cute', ['#e3f7ee', C.mint, '#2f9a6a']],
  ['nordic', ['#f7f5f0', N.blue, '#4f7396']],
]
const DISH_PALS: Pal[] = [
  ['cute', ['#8fd07a', C.white, '#3f8f45']],
  ['cute', ['#ffd36b', C.white, '#c98a10']],
  ['cute', ['#ffa64d', C.white, '#c8641a']],
  ['cute', ['#ffb6c8', C.white, '#d04a72']],
  ['modern', ['#9fc8e8', M.white, '#3f6fb0']],
]
const SPONGE_PALS: Pal[] = [
  ['modern', [M.silver, '#ffd36b', '#4f9e5b']],
  ['modern', [M.white, '#ffe08f', '#4f9e5b']],
  ['cute', [C.sakura, C.lemon, C.pink]],
  ['nordic', [N.oak, N.linen, N.sage]],
]
const GLOVE_PALS: Pal[] = [
  ['cute', ['#ffb6c8', C.white, C.pink]],
  ['cute', ['#ffe08f', C.white, C.sky]],
  ['modern', ['#7fa8d8', C.white, M.char]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['retro', [R.orange, R.cream, R.teal]],
]
const CLOTH_PALS: Pal[] = [
  ['modern', [M.silver, M.white, '#d7e4ee']],
  ['nordic', [N.oak, N.linen, N.sage]],
  ['cute', [C.white, C.sakura, C.sky]],
  ['japanese', [J.wood, J.washi, J.ai]],
]
const WOOL_PALS: Pal[] = [
  ['modern', [M.white, '#c9ced4', '#e88aa8']],
  ['nordic', [N.white, '#c9ced4', N.sage]],
  ['cute', [C.sakura, '#c9ced4', C.sky]],
  ['retro', [R.cream, '#c9ced4', R.teal]],
]
const CLEANSER_PALS: Pal[] = [
  ['retro', [R.cream, R.teal, R.red]],
  ['modern', [M.white, M.char, '#3f8fd0']],
  ['cute', ['#d9f0ff', C.white, '#3f8fd0']],
  ['nordic', [N.linen, N.white, '#5c8a56']],
]
const DEO_PALS: Pal[] = [
  ['cute', ['#b9e6c9', C.white, '#2f9a6a']],
  ['cute', ['#d8c8f3', C.white, '#7a58b8']],
  ['modern', ['#cfe6f4', M.white, '#3f6fb0']],
  ['nordic', ['#f3e3b0', N.white, '#b88a2a']],
]
const AEROSOL_PALS: Pal[] = [
  ['cute', [C.sakura, C.white, C.pink]],
  ['cute', ['#d9f0ff', C.white, C.sky]],
  ['modern', [M.white, M.silver, '#9fc8e8']],
  ['nordic', [N.linen, N.white, N.sage]],
]
const LINTER_PALS: Pal[] = [
  ['modern', [M.white, M.char]],
  ['cute', [C.sky, C.white]],
  ['cute', [C.pink, C.white]],
  ['nordic', [N.oak, N.white]],
]
const DUSTER_PALS: Pal[] = [
  ['modern', ['#f4f4f2', M.char, M.white]],
  ['cute', ['#ffd6e0', C.pink, C.white]],
  ['cute', ['#d9f0ff', C.sky, C.white]],
  ['nordic', ['#ece4d4', N.oak, N.white]],
]
const PINCH_PALS: Pal[] = [
  ['modern', [STEEL, M.white]],
  ['cute', [C.white, C.pink]],
  ['cute', [C.white, C.sky]],
  ['nordic', [N.white, N.sage]],
]

// ======================================================================
// 素材表
// ======================================================================

const STEAM_FX: Fx[] = [{ kind: 'steam', x: 0, y: 106, z: 5.6, scale: 0.8 }]

export const CHORES: AssetDef[] = [
  // ---------- 吸尘器 / 清洁家电 ----------
  def('chore-canister-vac', '卧式吸尘器', 'appliance', [30, 59, 93], CANISTER_PALS, canisterVac),
  prop('chore-handy-vac', '手持吸尘器', 'appliance', [12, 15, 33], VAC_PALS, handyVac),
  def('chore-cordless-vac-stand', '无线吸尘器', 'appliance', [30, 27, 101], VAC_PALS, cordlessVacStand, { family: 'cordless-vac', sizeLabel: '落地充电支架' }),
  def('chore-cordless-vac-wall', '无线吸尘器', 'appliance', [25, 25, 100], VAC_PALS, cordlessVacWall, { family: 'cordless-vac', sizeLabel: '壁挂充电座', mount: CV_MOUNT }),
  def('chore-robot-station', '扫地机器人基站', 'appliance', [37, 53, 43], ROBOT_PALS, robotStation, { family: 'robot-station', sizeLabel: '自动集尘座', actor: { kind: 'vacuum', role: 'home' } }),
  def('chore-robot-station-mop', '扫地机器人基站', 'appliance', [42, 57, 61], ROBOT_PALS, robotStationMop, { family: 'robot-station', sizeLabel: '全能基站（洗拖布）', actor: { kind: 'vacuum', role: 'home' } }),
  prop('chore-window-robot', '擦窗机器人', 'appliance', [27, 36, 9], ROBOT_PALS, windowRobot),
  def('chore-steam-mop', '蒸汽拖把', 'appliance', [29, 15, 116], MOP_PALS, steamMop),
  def('chore-garment-steamer', '立式挂烫机', 'appliance', [38, 26, 150], HOME_APPL_PALS, garmentSteamer, { fx: STEAM_FX }),
  def('chore-dehumidifier', '除湿机', 'appliance', [34, 23, 52], HOME_APPL_PALS, dehumidifier),
  prop('chore-mite-vac', '除螨仪', 'appliance', [15, 33, 16], VAC_PALS, miteVac),

  // ---------- 拖把 / 扫除 ----------
  def('chore-flat-mop', '平板拖把', 'storage', [26, 11, 118], MOP_PALS, flatMop),
  def('chore-sponge-mop', '海绵拖把', 'storage', [28, 8, 122], SPONGE_MOP_PALS, spongeMop),
  def('chore-broom-set', '扫帚簸箕', 'storage', [26, 22, 93], BROOM_PALS, broomSetStanding, { family: 'broom-set', sizeLabel: '自立式' }),
  def('chore-broom-set-lean', '扫帚簸箕', 'storage', [52, 29, 96], BROOM_PALS, broomSetLeaning, { family: 'broom-set', sizeLabel: '靠墙放' }),
  def('chore-jp-broom', '和式扫帚·塵取り', 'storage', [48, 29, 127], JP_BROOM_PALS, jpBroom),
  def('chore-tool-rack', '清洁工具收纳架', 'storage', [64, 22, 119], RACK_PALS, toolRack, {
    surfaces: [{ y: TR.barY + TR.barR + 0.5, kind: 'hook', h: TR.barY - 4, shape: [rectPoly(TR.barX0 + 2, TR.barZ - 1.7, TR.barX1 - 2, TR.barZ + 1.3)] }],
  }),

  // ---------- 垃圾桶 / 资源回收 ----------
  def('chore-sort-bin-2', '分类垃圾桶', 'storage', [45, 39, 59], BIN_PALS, (p) => sortingBins(p, 2), { family: 'sorting-bin', sizeLabel: '2 分类' }),
  def('chore-sort-bin-3', '分类垃圾桶', 'storage', [68, 39, 59], BIN_PALS, (p) => sortingBins(p, 3), { family: 'sorting-bin', sizeLabel: '3 分类' }),
  def('chore-sort-bin-4', '分类垃圾桶', 'storage', [90, 39, 59], BIN_PALS, (p) => sortingBins(p, 4), { family: 'sorting-bin', sizeLabel: '4 分类' }),
  def('chore-pedal-bin', '脚踏垃圾桶', 'storage', [27, 31, 42], PEDAL_PALS, pedalBin),
  def('chore-kitchen-bin', '厨房大垃圾桶', 'storage', [31, 45, 65], KBIN_PALS, kitchenBin),
  def('chore-swing-bin', '带盖小垃圾桶', 'storage', [23, 23, 30], SWING_PALS, swingBin, { family: 'chore-swing-bin', sizeLabel: '标准' }),
  prop('chore-bag-box', '垃圾袋盒', 'storage', [26, 11, 14], BAG_PALS, bagBox),
  def('chore-recycle-crate', '资源回收箱·瓶罐', 'storage', [44, 32, 26], CRATE_PALS, bottleCrate),
  def('chore-paper-bundle', '资源回收·纸捆', 'storage', [42, 29, 17], PAPER_PALS, (p) => paperBundle(p, 'news'), { family: 'paper-bundle', sizeLabel: '报纸' }),
  def('chore-carton-bundle', '资源回收·纸捆', 'storage', [52, 38, 12], PAPER_PALS, (p) => paperBundle(p, 'carton'), { family: 'paper-bundle', sizeLabel: '纸箱' }),

  // ---------- 清洁剂 / 小工具 ----------
  prop('chore-spray-cleaner', '多用途清洁喷雾', 'toiletry', [8, 10, 22], SPRAY_PALS, sprayBottle),
  prop('chore-foam-cleaner', '厨房泡沫清洁剂', 'tabletop', [7, 10, 25], FOAM_PALS, foamBottle),
  prop('chore-dish-soap', '洗洁精', 'tabletop', [7, 5, 19], DISH_PALS, dishSoap, { family: 'dish-soap', sizeLabel: '瓶装' }),
  prop('chore-dish-soap-refill', '洗洁精', 'tabletop', [14, 4, 18], DISH_PALS, soapPouch, { family: 'dish-soap', sizeLabel: '补充装' }),
  prop('chore-sponge-holder', '海绵 + 海绵架', 'tabletop', [12, 8, 5], SPONGE_PALS, spongeHolder),
  prop('chore-gloves', '橡胶手套', 'tabletop', [22, 26, 3], GLOVE_PALS, glovesLying, { family: 'rubber-gloves', form: 'lying' }),
  prop('chore-gloves-hanging', '橡胶手套', 'tabletop', [19, 7, 34], GLOVE_PALS, glovesHanging, { family: 'rubber-gloves', form: 'hanging' }),
  prop('chore-cloth-hanger', '抹布挂架', 'tabletop', [18, 18, 33], CLOTH_PALS, clothHanger),
  prop('chore-steel-wool', '钢丝球', 'tabletop', [11, 11, 5], WOOL_PALS, steelWool),
  prop('chore-cleanser', '去污粉', 'toiletry', [8, 8, 15], CLEANSER_PALS, cleanser),
  prop('chore-deodorizer', '凝胶消臭剂', 'toiletry', [8, 6, 10], DEO_PALS, deodorizer),
  prop('chore-auto-freshener', '自动喷香机', 'toiletry', [9, 8, 21], AEROSOL_PALS, autoFreshener),
  prop('chore-lint-roller', '粘毛滚筒', 'tabletop', [13, 8, 22], LINTER_PALS, linterStanding, { family: 'lint-roller', form: 'standing' }),
  prop('chore-lint-roller-hanging', '粘毛滚筒', 'tabletop', [11, 8, 27], LINTER_PALS, linterHanging, { family: 'lint-roller', form: 'hanging' }),
  prop('chore-duster', '除尘掸子', 'tabletop', [8, 8, 40], DUSTER_PALS, dusterStanding, { family: 'duster', form: 'standing' }),
  prop('chore-duster-hanging', '除尘掸子', 'tabletop', [8, 10, 46], DUSTER_PALS, dusterHanging, { family: 'duster', form: 'hanging' }),
  prop('chore-pinch-hanger', '晾衣夹衣架', 'outdoor', [39, 39, 3], PINCH_PALS, pinchHangerLying, { family: 'pinch-hanger', form: 'lying' }),
  prop('chore-pinch-hanger-hanging', '晾衣夹衣架', 'outdoor', [31, 33, 23], PINCH_PALS, pinchHangerHanging, { family: 'pinch-hanger', form: 'hanging' }),
]
