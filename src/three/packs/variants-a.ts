// 款式包 A：一键布置里经常出现、以前只有一种造型的东西，补上不同款式（不同结构 / 轮廓，不只是换色）。
//   空调室内机、晾衣架、花箱、马桶刷、床头柜、刀架、毛绒玩偶、花瓶插花、洗衣篮、脏衣篓、洗衣机置物架、刷牙杯、咖啡杯碟。
//
// 约定补充：
//   - id 统一用 va- 前缀；和原款放进同一个 family（原款的 family，没有就用原款 id），sizeLabel 写款式名。
//   - 尺寸和原款相近（宽深大致在 ±10% 以内），一键布置的「换款」（decorate.ts 的 vary）才会在它们之间互换。
//   - 空调沿用原款的挂墙高度：机身最低点离地 AIRCON_MOUNT。
//   - 晾衣架横杆上都有挂钩层（surfaces kind 'hook'）：y = 杆顶 + 0.5，shape 在杆的 z 往前 -0.5 ~ +2.5，h = 杆下净空。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, leaf, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, SWING_OPEN, ellipsePoly, movable, paintPanel, rectPoly, rng, shell, type AssetCategory, type AssetDef, type DoorMotion, type SurfaceDef } from '../kit'
import { PI, cylXLegacy, cylZLegacy, fitInPlace, lit, noOutlineDeep, rod3, taperRod3, type V3 } from '../geo'
import { I, J, M, N, R, define, type Build, type Dims, type Pal } from '../packkit'

const COFFEE = '#7a4a32'
const CREAM = '#fffaf2'
const WATER = '#cfeeff'
const GLASS = '#dff2fb'
const SOIL = '#7a5a43'
const DARK = '#3c3f46'

// ---------- 定义 ----------

const prop = (id: string, name: string, category: AssetCategory, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) =>
  define(id, name, category, dims, pals, build, { prop: true, ...extra })

// ---------- 小工具 ----------

/** 把 build 包一层：结果自动居中落地 */
const fitted = (b: Build, y0 = 0): Build => (p) => {
  const g = new THREE.Group()
  g.add(b(p))
  return fitInPlace(g, y0)
}

// ---------- 可开合：门、抽屉 ----------

/** 把一组部件包成会动的门 / 抽屉：pivot 为转轴 / 原点（部件的世界坐标不变） */
function moving(parts: THREE.Object3D[], pivot: V3, m: DoorMotion) {
  const g = new THREE.Group()
  g.position.set(...pivot)
  for (const o of parts) {
    o.position.x -= pivot[0]
    o.position.y -= pivot[1]
    o.position.z -= pivot[2]
    g.add(o)
  }
  return movable(g, m)
}
/** 抽屉盒（面板后面的箱子）：口宽 x0..x1，底 y，盒高 h，从 z1（面板背面）往后 depth */
function trayParts(x0: number, x1: number, y: number, h: number, z1: number, depth: number, color: string): THREE.Object3D[] {
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  const zc = z1 - depth / 2
  return [rbox(w, 1, depth, color, { x: cx, y, z: zc }, 0.2), rbox(1, h, depth, color, { x: x0 + 0.5, y, z: zc }, 0.2), rbox(1, h, depth, color, { x: x1 - 0.5, y, z: zc }, 0.2), rbox(w - 2, h, 1, color, { x: cx, y, z: z1 - depth + 0.5 }, 0.2)]
}
type Tray = readonly [number, number, number, number, number, number]
/** 抽屉格（和 trayParts 同样的参数），打开时随抽屉拉出 */
function trayLevel([x0, x1, y, h, z1, depth]: Tray): SurfaceDef {
  return { y: y + 1, h: Math.round((h - 1.5) * 10) / 10, inside: true, slide: Math.round(depth * 0.6), shape: [rectPoly(x0 + 1.2, z1 - depth + 1.2, x1 - 1.2, z1 - 0.4)] }
}
/** 一个抽屉：面板等部件 + 盒子，标好拉出动作 */
function drawer(face: THREE.Object3D[], [x0, x1, y, h, z1, depth]: Tray, color: string) {
  return moving([...face, ...trayParts(x0, x1, y, h, z1, depth, color)], [0, 0, 0], { kind: 'drawer', dz: Math.round(depth * 0.6) })
}

/** 半透明材质（透明的不描边） */
function glassFlat<T extends THREE.Object3D>(o: T, color = GLASS, k = 0.4): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      ;(c as THREE.Mesh).material = toon(color, { transparent: k })
      c.userData.noOutline = true
    }
  })
  return o
}
/** 车削体：pts 为 [半径, 高度]，自下而上；at.y 为底 */
function lathe(pts: [number, number][], color: string, at: { x?: number; y?: number; z?: number } = {}, seg = 28) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg), toon(color))
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
/** 有口的瓶 / 罐：外轮廓 out（[r, y]，最后一点是口沿外缘），壁厚 t，内壁往下 depth */
function vessel(out: [number, number][], t: number, depth: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const [rt, ht] = out[out.length - 1]
  const pts: [number, number][] = [[0, 0], ...out]
  for (let i = 1; i < 5; i++) {
    const a = (i / 5) * PI
    pts.push([rt - t / 2 + (Math.cos(a) * t) / 2, ht + (Math.sin(a) * t) / 2])
  }
  pts.push([rt - t, ht], [rt - t, ht - depth], [0, ht - depth])
  return lathe(pts, color, at)
}
/** 木纹：竖条纹 */
const woodGrain = (base: string) => (g: CanvasRenderingContext2D, W: number, H: number) => {
  g.fillStyle = base
  g.fillRect(0, 0, W, H)
  const r = rng(7)
  for (let i = 0; i < 26; i++) {
    g.fillStyle = shade(base, (r() - 0.5) * 0.12)
    const x = r() * W
    g.fillRect(x, 0, 1 + r() * W * 0.02, H)
  }
  g.strokeStyle = shade(base, -0.1)
  g.lineWidth = Math.max(1, H * 0.02)
  for (let i = 0; i < 6; i++) {
    const y = (i + 0.5) * (H / 6)
    g.beginPath()
    g.moveTo(0, y)
    for (let x = 0; x <= W; x += W / 12) g.lineTo(x, y + Math.sin(x * 0.05 + i) * H * 0.02)
    g.stroke()
  }
}

// =====================================================================
// 空调室内机：背面贴墙（-z），机身最低点离地 AIRCON_MOUNT（与 assets.ts 的 aircon 一致）
// =====================================================================

const AIRCON_MOUNT = 205

/** 运行指示灯 */
function airLed(x: number, y: number, z: number, color = '#7fe0a8') {
  return lit(ball(0.7, color, { x, y, z }), color, 0.8)
}

/** 薄型：方正扁平的整块前面板，底部一条细缝出风 */
function airSlim(p: string[]) {
  const [main, line] = p
  const w = 92
  const g = new THREE.Group()
  g.add(rbox(w, 24, 17, main, { z: -1.5 }, 2))
  g.add(rbox(w - 3, 16, 1.2, shade(main, 0.03), { y: 6.6, z: 7.4 }, 0.5))
  g.add(rbox(w - 3, 0.7, 0.9, line, { y: 5.2, z: 7.3 }, 0.25))
  g.add(noOutlineDeep(rbox(w - 12, 2.4, 1, DARK, { y: 1.6, z: 6.6 }, 0.4)))
  g.add(rbox(w - 14, 0.8, 4.6, shade(main, -0.05), { y: 0.6, z: 8.2, rx: 0.22 }, 0.3))
  g.add(airLed(w / 2 - 8, 5.55, 7.85))
  return fitInPlace(g, AIRCON_MOUNT)
}

/** 高端款：前面板鼓起、上方是感应眼、面板上有温度显示屏、双导风板 */
function airPremium(p: string[]) {
  const [main, panel, disp] = p
  const w = 98
  const g = new THREE.Group()
  g.add(rbox(w, 30, 20, main, { z: -3 }, 5))
  // 鼓起的亮面前板（压扁的圆角盒，前后厚度方向略倾斜）
  g.add(rbox(w - 6, 19, 3, panel, { y: 9, z: 6.6, rx: -0.06 }, 1.4))
  // 感应眼
  g.add(ball(2, '#2f3238', { y: 26, z: 6.5 }, [1, 1, 0.6]))
  // 显示屏：深色底 + 发光数字
  g.add(rbox(14, 4.4, 0.8, '#22252b', { x: 26, y: 14.6, z: 8.4 }, 0.4))
  g.add(
    paintPanel(
      12.6,
      3.4,
      'va-air-disp-' + disp,
      (c, W, H) => {
        c.fillStyle = '#22252b'
        c.fillRect(0, 0, W, H)
        c.fillStyle = disp
        c.font = `bold ${Math.round(H * 0.8)}px sans-serif`
        c.textBaseline = 'middle'
        c.fillText('26.5°', W * 0.08, H * 0.55)
        c.fillRect(W * 0.72, H * 0.3, W * 0.2, H * 0.12)
        c.fillRect(W * 0.72, H * 0.58, W * 0.14, H * 0.12)
      },
      { x: 26, y: 15.1, z: 9.1 },
      0.9,
    ),
  )
  // 出风口 + 双导风板
  g.add(noOutlineDeep(rbox(w - 16, 4.2, 1.2, DARK, { y: 3, z: 6.6 }, 0.5)))
  for (const [y, z, rx] of [
    [2.4, 8.3, 0.3],
    [0.4, 7.6, 0.5],
  ])
    g.add(rbox(w - 18, 0.9, 4.4, shade(main, -0.05), { y, z, rx }, 0.3))
  g.add(airLed(-w / 2 + 9, 8.2, 7.55, '#8fd3ff'))
  return fitInPlace(g, AIRCON_MOUNT)
}

/** 木纹面板：机身是素色，正面一整块木纹板，两端露出机身 */
function airWood(p: string[]) {
  const [main, wood, acc] = p
  const w = 94
  const g = new THREE.Group()
  g.add(rbox(w, 27, 19, main, { z: -2 }, 4))
  g.add(rbox(w - 10, 18, 1.4, wood, { y: 7.5, z: 7.8 }, 0.6))
  g.add(paintPanel(w - 12, 16.4, 'va-air-wood-' + wood, woodGrain(wood), { y: 8.3, z: 8.8 }))
  g.add(noOutlineDeep(rbox(w - 14, 3, 1, DARK, { y: 2.2, z: 7.1 }, 0.4)))
  g.add(rbox(w - 16, 1, 4.6, acc, { y: 1, z: 8.6, rx: 0.3 }, 0.3))
  g.add(airLed(w / 2 - 3, 8, 7.6))
  return fitInPlace(g, AIRCON_MOUNT)
}

/** 黑色：棱角分明的机身，上沿斜切，正面一条发光线 */
function airBlack(p: string[]) {
  const [main, trim, light] = p
  const w = 96
  const g = new THREE.Group()
  g.add(rbox(w, 22, 21, main, { z: -1 }, 1.2))
  // 斜切的上沿：一块向后倾的板压在机身顶上
  g.add(rbox(w, 8, 16, shade(main, 0.04), { y: 19, z: -3.2, rx: -0.28 }, 1))
  g.add(rbox(w - 4, 0.9, 1, trim, { y: 15.6, z: 9.7 }, 0.3))
  g.add(lit(rbox(30, 0.5, 0.6, light, { y: 12.2, z: 9.6 }, 0.2), light, 0.9))
  g.add(noOutlineDeep(rbox(w - 12, 3.6, 1, '#141518', { y: 2.4, z: 9.2 }, 0.4)))
  g.add(rbox(w - 14, 0.9, 5, trim, { y: 0.8, z: 10.6, rx: 0.3 }, 0.3))
  return fitInPlace(g, AIRCON_MOUNT)
}

/** 圆润可爱款：胶囊形机身，圆鼓鼓的前脸，彩色圆点按钮 */
function airRound(p: string[]) {
  const [main, sub, dot] = p
  const w = 88
  const g = new THREE.Group()
  g.add(rbox(w, 29, 22, main, { z: -1.5 }, 11))
  g.add(rbox(w - 12, 18, 3, shade(main, 0.04), { y: 7.5, z: 8.4 }, 1.5))
  // 半圆形出风口和圆弧导风板
  g.add(noOutlineDeep(rbox(w - 30, 3.6, 1, DARK, { y: 2.6, z: 9.2 }, 1.6)))
  g.add(rbox(w - 32, 1, 4, sub, { y: 1.4, z: 10.4, rx: 0.35 }, 0.45))
  // 两侧的圆鼓包（左右侧板）
  for (const s of [-1, 1]) g.add(ball(6, sub, { x: s * (w / 2 - 4.5), y: 14, z: 2 }, [0.6, 1.4, 1.2]))
  // 三颗圆点
  ;[dot, C.mint, C.lemon].forEach((c, i) => g.add(ball(1, c, { x: w / 2 - 22 + i * 3, y: 19.5, z: 9.9 }, [1, 1, 0.5])))
  g.add(airLed(-w / 2 + 18, 19.5, 9.9, '#ffb0c4'))
  return fitInPlace(g, AIRCON_MOUNT)
}

// =====================================================================
// 晾衣架：横杆上挂衣服 / 毛巾 / 夹架（挂钩层）
// =====================================================================

/** 横杆挂钩层：杆中心 (z, y)、杆半径 r、杆的 x 范围 */
function hookLayer(x0: number, x1: number, y: number, r: number, z: number, h?: number) {
  return { y: Math.round((y + r + 0.5) * 10) / 10, kind: 'hook' as const, ...(h ? { h } : {}), shape: [rectPoly(x0, z - 0.5, x1, z + 2.5)] }
}

// 伸缩落地款：带轮的 H 形底座，两根立柱，上下两层横杆
const TEL = { w: 150, d: 48, top: 160, low: 134, zLow: 14 }
function standTelescopic(p: string[]) {
  const [pole, joint] = p
  const { w, d, top, low, zLow } = TEL
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * 3
    g.add(cylZLegacy(1.6, d - 6, pole, x, 4.2, 0))
    for (const sz of [-1, 1]) g.add(puck(2.6, 2.6, DARK, { x, z: sz * (d / 2 - 2.6) }))
    // 立柱：下粗上细（伸缩管），中间一个锁扣
    g.add(cyl(1.6, 1.6, 90, pole, { x, y: 4.2 }, 12))
    g.add(cyl(1.25, 1.25, top - 92, pole, { x, y: 92 }, 12))
    g.add(cyl(2.2, 2.2, 4, joint, { x, y: 92 }, 12))
    g.add(ball(2, joint, { x, y: top + 1 }))
    // 下层横杆的伸出臂
    g.add(cylZLegacy(0.9, zLow + 1, pole, x, low, zLow / 2))
  }
  g.add(cylXLegacy(1.2, w - 6, pole, 0, top, 0))
  g.add(cylXLegacy(1, w - 6, pole, 0, low, zLow))
  g.add(cylXLegacy(1.2, w - 6, pole, 0, 12, 0))
  return g
}

// X 形折叠：两侧是 X 交叉的支腿，上面两根横杆
const XF = { w: 150, d: 50, top: 132, zs: 13 }
function standX(p: string[]) {
  const [pole, joint] = p
  const { w, d, top, zs } = XF
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * 2.5
    for (const sz of [-1, 1]) {
      g.add(rod3([x, 0.8, sz * (d / 2 - 2)], [x, top, -sz * zs], 1.2, pole))
      g.add(ball(1.8, DARK, { x, y: 1.2, z: sz * (d / 2 - 2) }, [1, 0.6, 1.2]))
    }
    // 交叉处的铆钉
    const yc = (top * (d / 2 - 2)) / (d / 2 - 2 + zs)
    g.add(cylXLegacy(2, 3.4, joint, x, yc, 0))
    // 底部的限位拉带
    g.add(cylZLegacy(0.5, d - 6, joint, x, 22, 0))
  }
  for (const sz of [-1, 1]) g.add(cylXLegacy(1.1, w - 2, pole, 0, top + 0.4, sz * zs))
  return g
}

// 阳台扶手式：后面两根立柱贴墙（扶手）落地，上方斜伸出两根挑臂，挑臂端头各一根横杆
const RAIL = { w: 148, d: 44, post: 104, z0: -20 }
function standRail(p: string[]) {
  const [pole, clamp] = p
  const { w, post, z0 } = RAIL
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * 3
    g.add(rbox(8, 2, 6, DARK, { x, z: z0 + 1 }, 0.8))
    g.add(cyl(1.6, 1.6, post, pole, { x, y: 2, z: z0 + 1 }, 12))
    // 扶手夹具
    for (const y of [70, 96]) g.add(rbox(5, 4.4, 5, clamp, { x, y, z: z0 + 1 }, 1))
    // 挑臂：从立柱顶斜伸向前上方，中段再一根斜撑
    g.add(rod3([x, post, z0 + 1], [x, post + 22, 20], 1.1, pole))
    g.add(rod3([x, 78, z0 + 1], [x, post + 11, 0], 0.8, pole, 8))
    g.add(ball(1.7, clamp, { x, y: post + 22, z: 20 }))
  }
  // 两根横杆：在挑臂中段（z = 0）和端头（z = 20）
  g.add(cylXLegacy(1.1, w - 4, pole, 0, post + 11, 0))
  g.add(cylXLegacy(1.1, w - 4, pole, 0, post + 22, 20))
  // 立柱之间的连接杆
  g.add(cylXLegacy(1.1, w - 6, pole, 0, 40, z0 + 1))
  return g
}

// 吊顶升降式（贴墙）：墙边两条立轨落地，上面的顶框向前伸，两根晾杆用钢丝吊着，侧面一个摇把盒
const LIFT = { w: 150, d: 44, top: 206, bar: 162, z1: -6, z2: 16 }
function standLift(p: string[]) {
  const [frame, bar, box] = p
  const { w, d, top, bar: by, z1, z2 } = LIFT
  const g = new THREE.Group()
  const zb = -d / 2 + 2
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * 2.5
    g.add(rbox(5, top - 4, 3.4, frame, { x, z: zb }, 0.8))
    g.add(rbox(6, 1.6, 8, DARK, { x, z: zb + 2 }, 0.5))
    // 顶框的挑梁
    g.add(rbox(5, 4, d - 2, frame, { x, y: top - 4, z: 1 }, 0.8))
    // 吊绳：两根晾杆各两根
    for (const z of [z1, z2]) {
      const xr = x - s * 6
      g.add(noOutlineDeep(cyl(0.18, 0.18, top - 3.4 - by, '#d0d4da', { x: xr, y: by, z }, 4)))
      g.add(rbox(3, 3, 3, frame, { x: xr, y: by - 1.6, z }, 0.8))
    }
  }
  g.add(rbox(w, 4, 4, frame, { y: top - 4, z: zb + 0.6 }, 0.8))
  g.add(rbox(w, 3, 3, frame, { y: top - 3.5, z: d / 2 - 3 }, 0.8))
  // 吊绳上端挂在顶框的两根横梁上
  for (const z of [z1, z2]) g.add(rbox(w - 5, 2.6, 3, frame, { y: top - 3.6, z }, 0.8))
  // 晾杆两端缩进吊块里 0.3cm，端面不和吊块侧面共面
  for (const z of [z1, z2]) g.add(cylXLegacy(1.2, w - 14.6, bar, 0, by, z))
  // 摇把盒（左侧立轨上）
  const bx = -w / 2 + 8.5
  g.add(rbox(7, 12, 5, box, { x: bx, y: 104, z: zb + 1 }, 1.2))
  g.add(cylZLegacy(0.8, 3, DARK, bx, 110, zb + 4.6))
  g.add(rbox(1.2, 6, 1.2, DARK, { x: bx, y: 104.5, z: zb + 6.1 }, 0.4))
  return g
}

// 和风竹竿式：两个圆墩底座（物干し台），立柱顶上是 Y 形托，托着一根带竹节的长竿
const BAM = { w: 162, d: 44, post: 156, len: 162 }
function standBamboo(p: string[]) {
  const [post, base, cane] = p
  const { w, post: py, len } = BAM
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = (s * (w - 44)) / 2
    g.add(cyl(19, 21, 7, base, { x }, 28))
    g.add(cyl(13, 15, 2, shade(base, -0.08), { x, y: 7 }, 28))
    g.add(cyl(1.8, 2, py - 9, post, { x, y: 9 }, 12))
    // Y 形托
    for (const sz of [-1, 1]) g.add(rod3([x, py - 2, 0], [x, py + 5, sz * 4.2], 0.9, post, 8))
    g.add(ball(1.9, post, { x, y: py - 1.5 }))
  }
  // 竹竿：一段段带节的圆管，竿两端在 Y 托之外伸出去
  const cy = py + 2.1
  g.add(cylXLegacy(1.5, len, cane, 0, cy, 0, 14))
  for (let i = 0; i < 7; i++) {
    const x = -len / 2 + 8 + i * ((len - 16) / 6)
    g.add(cylXLegacy(1.75, 1.2, shade(cane, -0.1), x, cy, 0, 14))
  }
  return g
}

// =====================================================================
// 阳台花箱
// =====================================================================

/** 一株小花：茎 + 叶 + 花头（五瓣），(x, y, z) 是茎底 */
function flower(g: THREE.Group, x: number, y: number, z: number, h: number, petal: string, center = C.lemon) {
  g.add(noOutlineDeep(cyl(0.45, 0.45, h, C.leafD, { x, y, z }, 4)))
  g.add(leaf(6, C.leaf, { x: x + 2.8, y: y + h * 0.4, z, ry: PI / 2, rz: 0.4 }))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + x
    g.add(ball(1.8, petal, { x: x + Math.cos(a) * 2, y: y + h, z: z + Math.sin(a) * 2 }, [1, 0.5, 1]))
  }
  g.add(ball(1.2, center, { x, y: y + h + 0.6, z }))
}
/** 一丛草叶：从 (x, y, z) 向上散开 */
function tuft(g: THREE.Group, x: number, y: number, z: number, h: number, color: string, n = 7, seed = 3) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    const lean = 0.25 + r() * 0.25
    g.add(taperRod3([x, y, z], [x + Math.cos(a) * h * lean, y + h * (0.8 + r() * 0.3), z + Math.sin(a) * h * lean * 0.5], 0.45, 0.1, color, 5))
  }
}

// 木条花箱：横木条拼的箱体，四条短腿，种着香草
function planterWood(p: string[]) {
  const [wood, leg, herb] = p
  const g = new THREE.Group()
  const w = 64
  const d = 26
  for (const s of [-1, 1]) {
    for (const sx of [-1, 1]) g.add(rbox(4, 26, 4, leg, { x: sx * (w / 2 - 2), z: s * (d / 2 - 2) }, 0.6))
  }
  // 箱底 + 三层横木条（前后、左右），条与条之间留缝
  g.add(rbox(w - 4, 1.6, d - 4, shade(wood, -0.12), { y: 6 }, 0.4))
  for (let i = 0; i < 3; i++) {
    const y = 6 + i * 6.4
    for (const s of [-1, 1]) {
      g.add(rbox(w - 8, 5.6, 1.6, wood, { y, z: s * (d / 2 - 1.1) }, 0.5))
      g.add(rbox(1.6, 5.6, d - 8, wood, { x: s * (w / 2 - 1.1), y }, 0.5))
    }
  }
  g.add(rbox(w - 7, 1.4, d - 7, SOIL, { y: 22 }, 0.5))
  const r = rng(11)
  for (let i = 0; i < 5; i++) {
    const x = -24 + i * 12
    const g2 = new THREE.Group()
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2 + r()
      g2.add(leaf(6, k % 2 ? herb : shade(herb, -0.1), { x: x + Math.cos(a) * 1.4, y: 26 + r() * 10, z: Math.sin(a) * 1.4, ry: -a, rz: 0.5 }))
    }
    g2.add(noOutlineDeep(cyl(0.4, 0.4, 14, C.leafD, { x, y: 23 }, 4)))
    g.add(g2)
  }
  return g
}

// 陶土椭圆长盆：车削的盆身压成椭圆，粗口沿，种郁金香
function planterTerracotta(p: string[]) {
  const [pot, rim, petal] = p
  const g = new THREE.Group()
  const sx = 2.55
  const body = cup(12, 9, 19, 1.2, pot)
  body.scale.set(sx, 1, 0.9)
  g.add(body)
  const lip = torus(11.8, 1.4, rim, { y: 18.4, rx: PI / 2 })
  lip.scale.set(sx, 1, 0.9)
  g.add(lip)
  const soil = cyl(10.4, 10.4, 0.6, SOIL, { y: 15.2 }, 28)
  soil.scale.set(sx, 1, 0.9)
  g.add(soil)
  for (let i = 0; i < 6; i++) {
    const x = -22 + i * 8.8
    const z = (i % 2 ? 2.5 : -2.5) * 0.9
    const h = 18 + (i % 3) * 4
    g.add(noOutlineDeep(cyl(0.45, 0.45, h, C.leafD, { x, y: 15.5, z }, 4)))
    g.add(leaf(10, C.leaf, { x: x + 1.2, y: 22, z, rz: -0.3, ry: 0.3 }))
    // 郁金香：杯形花头 + 三片花瓣
    g.add(cup(1.9, 1.3, 4.2, 0.3, petal, { x, y: 15.5 + h - 0.5, z }))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI * 2 + i
      g.add(ball(1.4, shade(petal, 0.05), { x: x + Math.cos(a) * 1.3, y: 15.5 + h + 2.4, z: z + Math.sin(a) * 1.3 }, [0.8, 1.5, 0.8]))
    }
  }
  return g
}

// 阶梯花架：两层台阶式小木架，摆三只小圆盆（多肉 / 香草 / 小花）
function planterTiered(p: string[]) {
  const [wood, pot, accent] = p
  const g = new THREE.Group()
  const w = 64
  const d = 26
  // 侧板（台阶形：后高前低）用两块板拼
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 1)
    g.add(rbox(2, 34, 12, wood, { x, z: -d / 2 + 6 }, 0.5))
    g.add(rbox(2, 18, 14, wood, { x, z: d / 2 - 7 }, 0.5))
  }
  g.add(rbox(w - 4, 1.8, 12, wood, { y: 32.2, z: -d / 2 + 6 }, 0.4))
  g.add(rbox(w - 4, 1.8, 14, wood, { y: 16.2, z: d / 2 - 7 }, 0.4))
  g.add(rbox(w - 4, 4, 1.6, shade(wood, -0.1), { y: 3, z: d / 2 - 1.2 }, 0.4))
  g.add(rbox(w - 4, 4, 1.6, shade(wood, -0.1), { y: 3, z: -d / 2 + 1.2 }, 0.4))
  const potAt = (x: number, y: number, z: number, kind: number) => {
    g.add(cup(5, 3.8, 8, 0.6, pot, { x, y, z }))
    g.add(noOutlineDeep(cyl(4.3, 4.3, 0.4, SOIL, { x, y: y + 6.6, z }, 18)))
    if (kind === 0) {
      // 多肉：一圈肥厚的叶
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * PI * 2
        g.add(ball(1.7, '#8fc7a0', { x: x + Math.cos(a) * 2, y: y + 8.2, z: z + Math.sin(a) * 2 }, [1, 0.6, 1.4]))
      }
      g.add(ball(1.5, '#a9d6b4', { x, y: y + 8.8, z }))
    } else if (kind === 1) tuft(g, x, y + 7, z, 12, C.leaf, 8, 5)
    else flower(g, x, y + 7, z, 9, accent)
  }
  potAt(-20, 34, -d / 2 + 6, 1)
  potAt(4, 34, -d / 2 + 6, 0)
  potAt(-6, 18, d / 2 - 7, 2)
  potAt(18, 18, d / 2 - 7, 0)
  return g
}

// 镀锌铁皮槽：两端带把手的金属长槽，薰衣草
function planterGalv(p: string[]) {
  const [metal, handleC, bloom] = p
  const g = new THREE.Group()
  const w = 62
  const d = 22
  g.add(tray(w, 22, d, 0.8, metal, {}, 0.3))
  // 上下两道加强筋
  for (const y of [3, 18]) {
    for (const s of [-1, 1]) {
      g.add(rbox(w + 0.4, 1.2, 0.6, shade(metal, 0.06), { y, z: s * (d / 2 + 0.05) }, 0.25))
      g.add(rbox(0.6, 1.2, d - 1, shade(metal, 0.06), { x: s * (w / 2 + 0.05), y }, 0.25))
    }
  }
  // 两端把手
  for (const s of [-1, 1]) g.add(torus(3, 0.5, handleC, { x: s * (w / 2 + 0.6), y: 16, ry: PI / 2 }, PI))
  g.add(rbox(w - 2, 1, d - 2, SOIL, { y: 17 }, 0.4))
  const r = rng(21)
  for (let i = 0; i < 7; i++) {
    const x = -26 + i * 8.6
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * PI * 2 + i
      const tx = x + Math.cos(a) * 4
      const tz = Math.sin(a) * 3.5
      const ty = 30 + r() * 8
      g.add(rod3([x, 18, 0], [tx, ty, tz], 0.3, C.leafD, 4))
      g.add(ball(1, bloom, { x: tx, y: ty + 1.8, z: tz }, [0.7, 2.4, 0.7]))
    }
  }
  return g
}

// 方块三连盆：长托盘上并排三只方盆：球形黄杨、虎尾兰、蓬松的草
function planterCubes(p: string[]) {
  const [pot, trayC, green] = p
  const g = new THREE.Group()
  g.add(rbox(62, 2, 22, trayC, {}, 0.8))
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 20.5
    g.add(tray(18, 17, 18, 1.2, pot, { x, y: 2 }, 0.6))
    g.add(rbox(15.4, 0.6, 15.4, SOIL, { x, y: 15.5 }, 0.2))
  }
  // 黄杨球
  g.add(noOutlineDeep(cyl(0.7, 0.7, 4, '#7a5a43', { x: -20.5, y: 16 }, 6)))
  g.add(ball(8.5, green, { x: -20.5, y: 27.5 }))
  // 虎尾兰：竖直的长叶
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(leaf(26, k % 2 ? '#5f8f4e' : '#7fae5a', { x: Math.cos(a) * 2.4, y: 29, z: Math.sin(a) * 2.4, rx: PI / 2 - 0.12 * Math.sin(a), ry: a, rz: 0.12 * Math.cos(a) }))
  }
  tuft(g, 20.5, 16, 0, 18, shade(green, 0.08), 10, 9)
  return g
}

// =====================================================================
// 马桶刷
// =====================================================================

// 方形纤薄款：方柱刷架，扁平硅胶刷头，刷柄顶上是方块帽
function brushSlim(p: string[]) {
  const [main, handleC, acc] = p
  const g = new THREE.Group()
  g.add(tray(8.6, 14, 7.4, 0.5, main, {}, 0.4))
  g.add(rbox(8.6, 0.8, 7.4, acc, { y: 0 }, 0.3))
  g.add(rbox(4.6, 6, 1.4, handleC, { y: 1.2 }, 0.6))
  g.add(rbox(1.2, 30, 0.9, handleC, { y: 6.8 }, 0.4))
  g.add(rbox(7.2, 3, 6, main, { y: 13.6 }, 0.8))
  g.add(rbox(2.6, 4.2, 1.6, acc, { y: 36.2 }, 0.6))
  return g
}

// 圆顶全包款：胖圆罐 + 半球盖，刷柄从盖顶穿出，顶上一颗圆球
function brushDome(p: string[]) {
  const [main, lid, knob] = p
  const g = new THREE.Group()
  g.add(cup(5, 4.6, 13, 0.5, main))
  const dome = ball(5.1, lid, { y: 13 }, [1, 0.7, 1])
  g.add(dome)
  g.add(torus(4.9, 0.45, shade(lid, -0.08), { y: 13, rx: PI / 2 }))
  g.add(ball(3, C.white, { y: 3.6 }, [1, 0.9, 1]))
  g.add(cyl(0.55, 0.55, 26, knob, { y: 5 }, 10))
  g.add(ball(2.2, knob, { y: 32.2 }))
  return g
}

// 木柄陶瓷款：直筒陶瓷罐，细长木柄带挂绳孔，柄头圆
function brushWood(p: string[]) {
  const [main, wood, band] = p
  const g = new THREE.Group()
  g.add(cup(4.3, 4.3, 15, 0.6, main))
  g.add(torus(4.35, 0.35, band, { y: 2, rx: PI / 2 }))
  g.add(ball(2.8, '#e8e2d6', { y: 3.6 }, [1, 1, 1]))
  g.add(cyl(0.65, 0.75, 33, wood, { y: 5 }, 10))
  g.add(capsule(1.05, 4, wood, { y: 37 }))
  g.add(torus(1, 0.25, band, { y: 43.3, rx: 0 }))
  return g
}

// 金属支架款：三脚细支架托着接水盘，刷子完全露在外面
function brushStand(p: string[]) {
  const [frame, dish, handleC] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    g.add(rod3([Math.cos(a) * 4.6, 0.3, Math.sin(a) * 4.6], [Math.cos(a) * 3.4, 18, Math.sin(a) * 3.4], 0.35, frame, 6))
    g.add(ball(0.6, frame, { x: Math.cos(a) * 4.6, y: 0.5, z: Math.sin(a) * 4.6 }))
  }
  g.add(cup(4.2, 3.2, 3.2, 0.4, dish, { y: 1 }))
  g.add(torus(3.5, 0.35, frame, { y: 18, rx: PI / 2 }))
  g.add(torus(3.6, 0.35, frame, { y: 9, rx: PI / 2 }))
  g.add(ball(2.6, '#f2f2f2', { y: 4.4 }, [1, 1.1, 1]))
  g.add(cyl(0.5, 0.5, 30, handleC, { y: 6.6 }, 10))
  g.add(rbox(2.2, 5, 2.2, handleC, { y: 36.4 }, 0.9))
  return g
}

// =====================================================================
// 床头柜（顶面空着，声明 surface；开放格声明 surfaces）
// =====================================================================

// 北欧开放格：一个抽屉 + 下方开放格，斜插的锥形木腿
const NS_OPEN = { w: 42, d: 34, h: 48, leg: 16 }
/** 北欧开放格床头柜：柜体往后收（d 33，中心 z = -1.25），上面一只抽屉 */
const NS_OPEN_Z = -1.25
const NS_OPEN_TRAY: Tray = [-NS_OPEN.w / 2 + 2.6, NS_OPEN.w / 2 - 2.6, NS_OPEN.leg + 18.9, 9.5, NS_OPEN_Z + 33 / 2 - 0.1, 29.5]
function nsOpen(p: string[]) {
  const [main, leg, knob] = p
  const { w, h, leg: lh } = NS_OPEN
  const d = 33
  const zc = NS_OPEN_Z
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(taperRod3([sx * (w / 2 - 3), 0, zc + sz * (d / 2 - 3)], [sx * (w / 2 - 7), lh + 0.5, zc + sz * (d / 2 - 7)], 0.9, 1.6, leg))
  // 柜体：下面开放格、上面抽屉口，中间一块隔板
  const hh = h - lh
  g.add(shell(w, hh, d, 1.8, main, { front: [{ kind: 'rect', x: 0, y: 1.8, w: w - 3.6, h: 15, r: 0.6 }, { kind: 'rect', x: 0, y: 18.6, w: w - 3.6, h: hh - 18.6 - 1.8, r: 0.3 }] }).translateY(lh).translateZ(zc))
  g.add(rbox(w - 3.6, 1.8, d - 3.6, main, { y: lh + 16.8, z: zc }, 0.4))
  // 抽屉
  const fz = zc + d / 2 + 0.7
  g.add(drawer([rbox(w - 3.8, hh - 20.6, 1.4, shade(main, 0.05), { y: lh + 18.7, z: fz }, 0.6), rbox(10, 1.2, 1.2, knob, { y: lh + 25, z: fz + 1.3 }, 0.5)], NS_OPEN_TRAY, shade(main, 0.08)))
  return g
}

// 圆柱款：圆桌面 + 鼓形柜身，正面开一个弧形口
const NS_ROUND = { r: 20, h: 46 }
function nsRound(p: string[]) {
  const [main, top, base] = p
  const { r, h } = NS_ROUND
  const g = new THREE.Group()
  g.add(cyl(r - 2, r - 2, 3, base, {}, 32))
  // 柜身：空心鼓（cup），正面挖口用一块深色弧板代替开口内壁
  g.add(cup(r - 1.5, r - 1.5, h - 5, 1.2, main, { y: 3 }))
  g.add(noOutlineDeep(cyl(r - 2.7, r - 2.7, 0.5, shade(main, -0.2), { y: 4.2 }, 32)))
  g.add(cyl(r, r, 2.4, top, { y: h - 2.4 }, 40))
  // 正面的弧形门：门缝两条竖线 + 圆拉手
  for (const a of [-0.42, 0.42]) g.add(rbox(0.5, 30, 0.6, shade(main, -0.2), { x: Math.sin(a) * (r - 1.35), y: 8, z: Math.cos(a) * (r - 1.35), ry: a }, 0.2))
  g.add(ball(1.3, top, { x: 4.6, y: 30, z: r - 1.1 }, [1, 1, 0.7]))
  // 中间一圈装饰线
  g.add(torus(r - 1.3, 0.4, top, { y: 22, rx: PI / 2 }))
  return g
}

// 金属推车款：方管框架 + 三层木板，带脚轮
const NS_WAGON = { w: 40, d: 32, h: 52, levels: [10, 30] }
function nsWagon(p: string[]) {
  const [frame, board] = p
  const { w, d, h, levels } = NS_WAGON
  const g = new THREE.Group()
  const px = w / 2 - 1.2
  const pz = d / 2 - 1.2
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(puck(2, 2.4, DARK, { x: sx * (px - 1.5), z: sz * (pz - 1.5) }))
      g.add(rbox(2.4, h - 3.4, 2.4, frame, { x: sx * px, y: 2.4, z: sz * pz }, 0.4))
    }
  for (const y of [...levels, h - 1.6]) {
    g.add(rbox(w - 1, 1.6, d - 1, board, { y }, 0.5))
    for (const sz of [-1, 1]) g.add(rbox(w - 4.8, 1.2, 1.2, frame, { y: y - 1.2, z: sz * pz }, 0.3))
  }
  // 中层的护栏
  for (const sx of [-1, 1]) g.add(cylZLegacy(0.4, d - 4.8, frame, sx * px, levels[1] + 5, 0))
  g.add(cylXLegacy(0.4, w - 4.8, frame, 0, levels[1] + 5, -pz))
  return g
}

// 和风小抽屉：低台座 + 三层抽屉，铁环拉手，四角包铁片
const NS_TANSU = { w: 44, d: 34, h: 42 }
const NS_TANSU_ROWS = [
  [7, 10],
  [18, 10],
  [29, 11.4],
] as const
const nsTansuTray = (y: number, hh: number): Tray => [-NS_TANSU.w / 2 + 2.2, NS_TANSU.w / 2 - 2.2, y + 0.3, hh - 2.5, NS_TANSU.d / 2 - 1.4, 30.5]
function nsTansu(p: string[]) {
  const [main, metal, base] = p
  const { w, d, h } = NS_TANSU
  const g = new THREE.Group()
  g.add(rbox(w - 2, 5, d - 2, base, {}, 0.6))
  // 空心柜体：两侧、背、顶、底
  const bz = -0.7
  const bd = d - 1.4
  for (const s of [-1, 1]) g.add(rbox(1.4, h - 5, bd, main, { x: s * (w / 2 - 0.7), y: 5, z: bz }, 0.4))
  g.add(rbox(w - 2.8, h - 5, 1.2, shade(main, -0.05), { y: 5, z: bz - bd / 2 + 0.6 }, 0.3))
  g.add(rbox(w - 2.8, 1.4, bd, main, { y: h - 1.4, z: bz }, 0.3))
  g.add(rbox(w - 2.8, 1.2, bd, main, { y: 5, z: bz }, 0.3))
  for (const [y, hh] of NS_TANSU_ROWS) {
    // 抽屉面 + 铁环拉手（底座 + 半圆环）
    const face = [
      rbox(w - 3, hh - 0.8, 1, shade(main, 0.05), { y, z: d / 2 - 0.9 }, 0.4),
      rbox(4, 2.4, 0.5, metal, { y: y + hh / 2 - 1.4, z: d / 2 + 0.25 }, 0.2),
      torus(1.8, 0.3, metal, { y: y + hh / 2 - 1.2, z: d / 2 + 0.75 }, PI).rotateZ(PI),
    ]
    g.add(drawer(face, nsTansuTray(y, hh), shade(main, 0.08)))
  }
  // 顶角包铁
  for (const s of [-1, 1]) g.add(rbox(3.4, 0.6, 3.4, metal, { x: s * (w / 2 - 1.7), y: h, z: d / 2 - 2.1 }, 0.2))
  return g
}

// 圆角糖果柜：大圆角柜身，两只抽屉，圆形拉手，弯脚
const NS_CANDY = { w: 40, d: 34, h: 46 }
/** 糖果柜整体往后挪一点，让圆拉手也落在声明的进深里（以前由 fitted 居中） */
const NS_CANDY_DZ = -1.1
const nsCandyTray = (y: number): Tray => [-NS_CANDY.w / 2 + 5, NS_CANDY.w / 2 - 5, y + 0.3, 9.5, NS_CANDY.d / 2 - 1.5 + NS_CANDY_DZ, 30]
const NS_CANDY_YS = [12.5, 26.5]
function nsCandy(p: string[]) {
  const [main, knob, leg] = p
  const { w, d, h } = NS_CANDY
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(ball(2.2, leg, { x: sx * (w / 2 - 6), y: 2, z: sz * (d / 2 - 6) }, [1, 0.9, 1]))
      g.add(cyl(1.6, 1.2, 7, leg, { x: sx * (w / 2 - 6), y: 3, z: sz * (d / 2 - 6) }, 12))
    }
  // 圆角柜身做成空心：圆角侧板、顶板，薄底板和背板
  for (const s of [-1, 1]) g.add(rbox(4, h - 9, d - 1, main, { x: s * (w / 2 - 2), y: 9, z: -0.5 }, 1.8))
  g.add(rbox(w, 4, d - 1, main, { y: h - 4, z: -0.5 }, 2))
  g.add(rbox(w - 8, 3, d - 1, main, { y: 9, z: -0.5 }, 1))
  g.add(rbox(w - 8, h - 16, 1.2, shade(main, -0.05), { y: 12, z: -d / 2 + 0.6 }, 0.4))
  for (const o of g.children) o.position.z += NS_CANDY_DZ
  for (const y of NS_CANDY_YS) g.add(drawer([rbox(w - 8, 11.6, 1.2, shade(main, 0.06), { y, z: d / 2 - 0.9 + NS_CANDY_DZ }, 3), ball(1.8, knob, { y: y + 5.8, z: d / 2 + 0.8 + NS_CANDY_DZ }, [1, 1, 0.8])], nsCandyTray(y), shade(main, 0.1)))
  return g
}

// =====================================================================
// 刀架
// =====================================================================

/** 一把刀：刀柄朝上（0..hl），刀身朝下（-bl..0），刀身在 xy 平面（薄边沿 z），宽 bw */
function knife(handleC: string, bl: number, hl: number, bw: number, blade = M.silver) {
  const g = new THREE.Group()
  const s = new THREE.Shape()
  s.moveTo(-bw / 2, 0)
  s.lineTo(bw / 2, 0)
  s.lineTo(bw / 2, -bl * 0.75)
  s.quadraticCurveTo(bw / 2, -bl, -bw / 2, -bl)
  s.lineTo(-bw / 2, 0)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false })
  geo.translate(0, 0, -0.1)
  const m = new THREE.Mesh(geo, toon(blade))
  m.castShadow = true
  g.add(m)
  g.add(rbox(Math.min(bw, 2.4), hl, 1.6, handleC, { y: -0.2 }, 0.6))
  for (const y of [hl * 0.3, hl * 0.7]) g.add(noOutlineDeep(ball(0.25, M.silver, { x: 0, y, z: 0.8 })))
  return g
}

// 磁吸立板款：一块竖立的厚木板，刀吸在板的两面
function knifeMagnet(p: string[]) {
  const [board, handleC, base] = p
  const g = new THREE.Group()
  g.add(rbox(9, 2.4, 20, base, {}, 0.8))
  g.add(rbox(3, 32, 18, board, { y: 2.4 }, 1))
  const spots: [number, number, number][] = [
    [1, -5.5, 12],
    [1, 0, 16],
    [1, 5.5, 14],
    [-1, -4, 16],
    [-1, 3.5, 11],
  ]
  for (const [sx, z, bl] of spots) {
    const k = knife(handleC, bl, 9, 3.2)
    k.rotation.y = PI / 2
    k.position.set(sx * 1.85, 6 + bl, z)
    g.add(k)
  }
  return g
}

// 椭圆插刀筒：填满细棒的椭圆筒，刀随意斜插
function knifeTub(p: string[]) {
  const [tub, handleC, band] = p
  const g = new THREE.Group()
  const body = cup(6, 5.6, 17, 0.6, tub)
  body.scale.set(1, 1, 1.6)
  g.add(body)
  const ring = torus(6.1, 0.4, band, { y: 4, rx: PI / 2 })
  ring.scale.set(1, 1.6, 1)
  g.add(ring)
  // 填充的细棒（顶面一层深色圆片表示）
  const fill = cyl(5.3, 5.3, 0.4, '#2a2a2e', { y: 15.4 }, 24)
  fill.scale.set(1, 1, 1.6)
  g.add(noOutlineDeep(fill))
  const spots: [number, number, number, number][] = [
    [-1.8, -5, 0.12, 15],
    [1.6, -2, -0.1, 13],
    [-1.2, 1.5, 0.08, 16],
    [2, 4.5, -0.14, 12],
    [0, 7, 0.18, 10],
  ]
  for (const [x, z, rz, bl] of spots) {
    const k = knife(handleC, bl, 9, 3)
    k.position.set(x, 15.8, z)
    k.rotation.set(-z * 0.025, 0, rz)
    g.add(k)
  }
  return g
}

// 和风刀台：横放的三层木托，刀平躺着露出刀身
function knifeRack(p: string[]) {
  const [wood, handleC, foot] = p
  const g = new THREE.Group()
  // 两侧是镂空的框（前后两根立柱 + 顶横木），从侧面也能看见刀
  for (const s of [-1, 1]) {
    for (const z of [-9.5, 9.5]) g.add(rbox(1.6, 23, 2.6, wood, { x: s * 5.2, z }, 0.5))
    g.add(rbox(1.6, 1.8, 16.4, wood, { x: s * 5.2, y: 21.2 }, 0.4))
    g.add(rbox(2.4, 1.6, 23, foot, { x: s * 5.2 }, 0.4))
  }
  const tiers = [4, 11, 18]
  tiers.forEach((y, i) => {
    for (const s of [-1, 1]) g.add(rbox(1.6, 1.2, 17, wood, { x: s * 5.2, y }, 0.3))
    g.add(rbox(8.8, 1.2, 2, wood, { y, z: -6 }, 0.3))
    g.add(rbox(8.8, 1.2, 2, wood, { y, z: 6 }, 0.3))
    const bl = [13, 11, 9][i]
    const k = knife(handleC, bl, 7, [4.2, 3.4, 2.6][i])
    // 平躺：刀身横向沿 z，刀刃朝前
    k.rotation.set(PI / 2, 0, 0)
    k.rotation.order = 'XYZ'
    k.position.set(0, y + 1.4, (bl - 7) / 2)
    g.add(k)
  })
  return g
}

// 透明亚克力：透明块体，刀身插在里面看得见
function knifeAcrylic(p: string[]) {
  const [glassC, handleC, base] = p
  const g = new THREE.Group()
  g.add(rbox(11, 1.6, 20, base, {}, 0.6))
  const block = rbox(10, 22, 18, glassC, { y: 1.6 }, 1.4)
  g.add(glassFlat(block, glassC, 0.35))
  const spots: [number, number][] = [
    [-2.6, -4],
    [0, -4],
    [2.6, -4],
    [-1.4, 3.5],
    [1.4, 3.5],
  ]
  spots.forEach(([x, z], i) => {
    const bl = 19 - (i % 3) * 2
    const k = knife(handleC, bl, 9, 3.2)
    k.position.set(x, 3 + bl, z)
    k.rotation.y = PI / 2
    g.add(k)
  })
  return g
}

// =====================================================================
// 毛绒玩偶（和小熊玩偶同系列）：坐姿，正面朝 +z
// =====================================================================

/** 坐着的身体：躯干 + 两只脚 + 两只手 */
function sitBody(g: THREE.Group, main: string, belly: string, r = 11.5) {
  g.add(ball(r, main, { y: r }, [1, 0.95, 0.9]))
  g.add(ball(r * 0.62, belly, { y: r * 0.95, z: r * 0.45 }, [1, 1.1, 0.6]))
  for (const sx of [-1, 1]) {
    g.add(ball(r * 0.38, main, { x: sx * r * 0.72, y: r * 0.38, z: r * 0.5 }, [1, 0.85, 1.2]))
    g.add(ball(r * 0.22, belly, { x: sx * r * 0.72, y: r * 0.36, z: r * 0.92 }, [1, 1, 0.4]))
    g.add(ball(r * 0.33, main, { x: sx * r * 0.88, y: r * 1.25, z: r * 0.25 }, [0.9, 1.3, 0.9]))
  }
}

// 兔子：长耳朵（内侧粉色），圆尾巴
function plushBunny(p: string[]) {
  const [main, belly, inner] = p
  const g = new THREE.Group()
  sitBody(g, main, belly, 11)
  g.add(ball(9.5, main, { y: 28 }, [1.05, 0.95, 0.95]))
  g.add(ball(3.2, belly, { y: 25.3, z: 7.4 }, [1.3, 0.85, 0.6]))
  g.add(ball(0.9, '#ff8fa8', { y: 26.6, z: 9.2 }))
  g.add(face(11, { y: 29, z: 8.6 }))
  for (const s of [-1, 1]) {
    const ear = new THREE.Group()
    ear.add(capsule(2.5, 10, main, { y: 0 }))
    ear.add(ball(1.7, inner, { y: 7.5, z: 1.9 }, [0.85, 3.2, 0.35]))
    ear.position.set(s * 3.6, 34.5, -0.5)
    ear.rotation.set(-0.15, 0, -s * 0.22)
    g.add(ear)
  }
  g.add(ball(3.2, belly, { y: 6, z: -10.2 }))
  return g
}

// 猫：尖耳朵、胖脸，尾巴绕到身侧
function plushCat(p: string[]) {
  const [main, belly, acc] = p
  const g = new THREE.Group()
  sitBody(g, main, belly, 11.5)
  g.add(ball(10, main, { y: 29.5 }, [1.18, 0.92, 0.95]))
  g.add(ball(3.4, belly, { y: 26.6, z: 7.4 }, [1.5, 0.8, 0.6]))
  g.add(ball(0.9, '#ff8fa8', { y: 28, z: 9.6 }))
  g.add(face(13, { y: 30.5, z: 8.8 }))
  for (const s of [-1, 1]) {
    const ear = cyl(0.3, 4, 7, main, { x: s * 6.6, y: 35, z: -0.5, rz: -s * 0.35 }, 4)
    ear.rotation.y = PI / 4
    g.add(ear)
    g.add(cyl(0.2, 2.2, 4.2, acc, { x: s * 6.6, y: 35.8, z: 1.4, rz: -s * 0.35 }, 3))
  }
  // 额头的条纹
  for (const x of [-2, 0, 2]) g.add(rbox(0.9, 3, 0.5, shade(main, -0.18), { x, y: 34.4, z: 8.3, rx: -0.5 }, 0.2))
  const tail = torus(9, 2.2, main, { x: 6, y: 2.4, z: 1, rx: PI / 2 }, PI * 1.1)
  tail.rotation.z = -PI * 0.55
  g.add(tail)
  // 脖子上的铃铛项圈
  g.add(torus(6.4, 0.7, acc, { y: 21.5, z: 0.6, rx: PI / 2 + 0.15 }))
  g.add(ball(1.4, '#f4c64e', { y: 20, z: 7.4 }))
  return g
}

// 恐龙：背上一排三角棘，粗尾巴拖在身后
function plushDino(p: string[]) {
  const [main, belly, spike] = p
  const g = new THREE.Group()
  sitBody(g, main, belly, 11.5)
  g.add(ball(9, main, { y: 28.5, z: 1 }, [1, 0.95, 1.05]))
  g.add(ball(6, main, { y: 27, z: 6.4 }, [1.15, 0.8, 0.9]))
  for (const s of [-1, 1]) g.add(ball(0.6, shade(main, -0.25), { x: s * 2, y: 28.3, z: 11.7 }))
  g.add(face(12, { y: 30.5, z: 9.2 }))
  // 背棘：沿头顶到背部的弧线
  for (let i = 0; i < 6; i++) {
    const a = -0.25 + i * 0.42
    const rr = i < 2 ? 9 : 11
    const cy = i < 2 ? 28.5 : 11
    const y = cy + Math.cos(a) * rr * (i < 2 ? 0.95 : 0.95)
    const z = -Math.sin(a) * rr * 0.9 + (i < 2 ? 1 : 0)
    const sp = cyl(0.2, 2.6 - i * 0.15, 4.2 - i * 0.2, spike, { y: y - 1.2, z }, 4)
    sp.rotation.x = -a
    g.add(sp)
  }
  // 尾巴：圆锥从身后斜向后侧
  const tail = cyl(1.2, 5, 13, main, {}, 16)
  tail.position.set(4, 4.6, -12)
  tail.rotation.set(-PI / 2 + 0.25, 0, 0.6)
  g.add(tail)
  return g
}

// 企鹅：蛋形身子、白肚皮、橙色嘴和脚、围巾
function plushPenguin(p: string[]) {
  const [main, belly, scarf] = p
  const g = new THREE.Group()
  g.add(ball(12.5, main, { y: 17 }, [1, 1.36, 0.9]))
  g.add(ball(10, belly, { y: 15, z: 3.6 }, [0.95, 1.2, 0.8]))
  // 脸部白色面罩
  g.add(ball(6, belly, { y: 25.5, z: 6.6 }, [1.25, 0.85, 0.55]))
  g.add(face(10, { y: 26.5, z: 9.6 }))
  const beak = cyl(0.2, 1.6, 3, '#f6a43c', {}, 10)
  beak.rotation.x = PI / 2
  beak.position.set(0, 24.4, 11.2)
  g.add(beak)
  for (const s of [-1, 1]) {
    g.add(ball(3.2, main, { x: s * 12, y: 15, z: 0.5, rz: s * 0.35 }, [0.45, 1.6, 0.9]))
    g.add(ball(2.6, '#f6a43c', { x: s * 4.2, y: 1.2, z: 8 }, [1, 0.45, 1.5]))
  }
  g.add(torus(8.6, 1.5, scarf, { y: 21, z: 0.5, rx: PI / 2 + 0.1 }))
  g.add(rbox(3, 8, 1.4, scarf, { x: 4.2, y: 13, z: 9.3, rz: 0.15 }, 0.6))
  return g
}

// 柴犬：竖耳、白嘴套和白胸、卷尾，眉毛上两个白点
function plushShiba(p: string[]) {
  const [main, white, collar] = p
  const g = new THREE.Group()
  sitBody(g, main, white, 11.5)
  g.add(ball(9.8, main, { y: 29 }, [1.12, 0.95, 1]))
  g.add(ball(5, white, { y: 26.2, z: 6.4 }, [1.35, 0.85, 0.9]))
  g.add(ball(1.2, C.ink, { y: 27.4, z: 10.9 }))
  g.add(face(12.5, { y: 30, z: 9.2 }))
  for (const s of [-1, 1]) {
    g.add(ball(1, white, { x: s * 3.4, y: 33.3, z: 8.4 }, [1.2, 0.8, 0.5]))
    const ear = cyl(0.4, 3.6, 6.4, main, { x: s * 5.8, y: 34.4, z: -0.5, rz: -s * 0.25 }, 3)
    ear.rotation.y = s * 0.3
    g.add(ear)
  }
  g.add(torus(6.6, 0.8, collar, { y: 20.6, z: 0.6, rx: PI / 2 + 0.15 }))
  // 卷尾巴：背上一个圈
  const tail = torus(3.4, 1.9, main, { y: 13, z: -11.2 })
  tail.rotation.y = 0.3
  g.add(tail)
  return g
}

// =====================================================================
// 花瓶插花
// =====================================================================

// 一轮插：圆肚细颈小瓶，一枝郁金香
function vaseBud(p: string[]) {
  const [vase, petal, accent] = p
  const g = new THREE.Group()
  g.add(
    vessel(
      [
        [4, 0.3],
        [5.2, 2.5],
        [5.4, 5],
        [4.3, 8],
        [1.4, 11.5],
        [1.1, 14],
        [1.5, 15],
      ],
      0.5,
      5,
      vase,
    ),
  )
  g.add(torus(1.25, 0.25, accent, { y: 12.4, rx: PI / 2 }))
  g.add(rod3([0, 11, 0], [1.2, 26, 0.4], 0.28, C.leafD, 6))
  g.add(leaf(9, C.leaf, { x: -1.4, y: 18, z: 0.3, rx: PI / 2 - 0.3, rz: 0.4 }))
  g.add(cup(1.8, 1.2, 3.6, 0.3, petal, { x: 1.2, y: 25.8, z: 0.4 }))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2
    g.add(ball(1.3, shade(petal, 0.05), { x: 1.2 + Math.cos(a) * 1.2, y: 28.4, z: 0.4 + Math.sin(a) * 1.2 }, [0.8, 1.5, 0.8]))
  }
  return g
}

// 生花水盘：浅椭圆水盘 + 剑山，一根弯枝和山茶花
function vaseIkebana(p: string[]) {
  const [dish, bloom, branch] = p
  const g = new THREE.Group()
  const d = cup(7.6, 6.6, 3.4, 0.6, dish)
  d.scale.set(1, 1, 0.66)
  g.add(d)
  const w = cyl(6.8, 6.8, 0.3, WATER, { y: 2.5 }, 28)
  w.scale.set(1, 1, 0.66)
  g.add(noOutlineDeep(w))
  g.add(puck(1.8, 1, '#4a4a50', { x: -2, y: 0.6 }))
  // 弯枝：三段折线
  const pts: V3[] = [
    [-2, 1.5, 0],
    [-3.2, 10, 0.5],
    [-1.4, 18, 0],
    [2.6, 25, -0.5],
    [6, 27, -0.8],
  ]
  for (let i = 0; i < pts.length - 1; i++) g.add(rod3(pts[i], pts[i + 1], 0.35 - i * 0.04, branch, 6))
  // 山茶花：两朵
  for (const [x, y, z, s] of [
    [-2.8, 13, 1.6, 1],
    [1.6, 4.2, 1.8, 0.8],
  ]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2
      g.add(ball(1.6 * s, bloom, { x: x + Math.cos(a) * 1.5 * s, y: y + Math.sin(a) * 1.5 * s, z }, [1, 1, 0.45]))
    }
    g.add(ball(0.9 * s, C.lemon, { x, y, z: z + 0.5 }))
  }
  for (const [x, y, z, ry] of [
    [-4.6, 9.5, 0.8, 0.8],
    [0.4, 17, 0.6, -0.6],
    [3.8, 3.4, 0.6, -0.4],
  ])
    g.add(leaf(4.4, C.leafD, { x, y, z, ry, rx: 0.3 }))
  return g
}

// 玻璃瓶满天星：透明圆口玻璃瓶（看得见水和花茎），蓬松的满天星，瓶颈系缎带
function vaseJar(p: string[]) {
  const [glassC, bloom, ribbon] = p
  const g = new THREE.Group()
  g.add(glassFlat(cup(5.2, 5.6, 12, 0.4, glassC), glassC, 0.38))
  g.add(noOutlineDeep(cyl(4.7, 5.1, 6, WATER, { y: 0.4 }, 24)))
  g.add(torus(5.25, 0.45, ribbon, { y: 9.5, rx: PI / 2 }))
  g.add(rbox(2, 2.4, 0.6, ribbon, { x: 2, y: 7.6, z: 5.2, rz: 0.3 }, 0.2))
  const r = rng(5)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    const top: V3 = [Math.cos(a) * 4.5, 22 + r() * 5, Math.sin(a) * 3.2]
    g.add(rod3([Math.cos(a) * 1.2, 1, Math.sin(a) * 1.2], top, 0.18, C.leafD, 4))
    for (let k = 0; k < 6; k++) g.add(ball(0.75, k % 3 ? bloom : C.white, { x: top[0] + (r() - 0.5) * 3.4, y: top[1] + (r() - 0.3) * 2.6, z: top[2] + (r() - 0.5) * 2.6 }))
  }
  return g
}

// 陶罐蒲苇：高直筒陶罐带凹槽，插几支蒲苇和干枝
function vasePampas(p: string[]) {
  const [vase, plume, stem] = p
  const g = new THREE.Group()
  g.add(cup(5.4, 6.2, 21, 0.6, vase))
  for (const y of [4, 8, 12, 16]) g.add(torus(5.95 - y * 0.035, 0.28, shade(vase, -0.08), { y, rx: PI / 2 }))
  const tips: V3[] = [
    [-5, 40, 1],
    [1, 42, -1.4],
    [5.4, 37, 1.6],
  ]
  for (const t of tips) {
    g.add(rod3([t[0] * 0.15, 4, t[2] * 0.15], [t[0] * 0.8, t[1] - 8, t[2] * 0.8], 0.25, stem, 5))
    const pl = ball(2, plume, { x: t[0] * 0.92, y: t[1] - 4, z: t[2] * 0.92 }, [0.85, 2.4, 0.85])
    pl.rotation.z = -t[0] * 0.04
    g.add(pl)
  }
  // 干枝：细枝 + 小圆果
  g.add(rod3([0, 4, 0], [-2.6, 34, -2.4], 0.2, stem, 5))
  for (const y of [24, 28, 31]) g.add(ball(0.6, shade(stem, -0.1), { x: -2.6 * ((y - 4) / 30) - 0.6, y, z: -2.4 * ((y - 4) / 30) }))
  return g
}

// 牛奶罐向日葵：复古铁皮奶罐（圆肚 + 肩 + 颈 + 两只耳把），两朵向日葵
function vaseMilk(p: string[]) {
  const [can, band, petal] = p
  const g = new THREE.Group()
  g.add(
    vessel(
      [
        [5.4, 0.4],
        [5.6, 1],
        [5.6, 10],
        [4.6, 12.5],
        [3.2, 14],
        [3.2, 16.4],
        [3.8, 17],
      ],
      0.5,
      6,
      can,
    ),
  )
  g.add(torus(5.65, 0.4, band, { y: 2.2, rx: PI / 2 }))
  g.add(torus(5.65, 0.4, band, { y: 8.6, rx: PI / 2 }))
  for (const s of [-1, 1]) g.add(torus(1.6, 0.35, band, { x: s * 5.1, y: 12, ry: PI / 2 }, PI).rotateZ(s * 0.6))
  for (const [x, y, z, rx, ry] of [
    [-2.4, 31, 1.2, -0.35, 0.2],
    [3, 27, 2, -0.2, -0.4],
  ]) {
    g.add(rod3([x * 0.2, 12, z * 0.2], [x, y, z], 0.3, C.leafD, 6))
    const head = new THREE.Group()
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * PI * 2
      head.add(ball(1.3, petal, { x: Math.cos(a) * 2.6, y: Math.sin(a) * 2.6, z: 0 }, [1, 1.7, 0.35]).rotateZ(a - PI / 2))
    }
    head.add(ball(1.8, '#6b4a2b', { z: 0.3 }, [1, 1, 0.45]))
    head.position.set(x, y, z + 0.3)
    head.rotation.set(rx, ry, 0)
    g.add(head)
    g.add(leaf(5, C.leaf, { x: x * 0.6 + 1.6, y: y - 9, z: z * 0.6, ry: PI / 2, rz: 0.5 }))
  }
  return g
}

// =====================================================================
// 洗衣篮（里面堆着待洗衣物，衣物低于口沿）
// =====================================================================

/** 一堆衣物：几团压扁的布 */
function clothes(g: THREE.Group, y: number, spread: number, cols: string[], seed = 1) {
  const r = rng(seed)
  cols.forEach((c, i) => {
    const a = (i / cols.length) * PI * 2 + r()
    g.add(ball(spread * 0.55, c, { x: Math.cos(a) * spread * 0.45, y: y + r() * 1.5, z: Math.sin(a) * spread * 0.35, ry: i }, [1.1, 0.42, 0.85]))
  })
}

// 藤编篮：椭圆篮身、编织纹的横箍、两侧开把手口
function lbRattan(p: string[]) {
  const [main, band, cloth] = p
  const g = new THREE.Group()
  const sz = 0.8
  const body = cup(22, 18.5, 38, 1.4, main)
  body.scale.set(1, 1, sz)
  g.add(body)
  for (let i = 0; i < 7; i++) {
    const y = 4 + i * 4.6
    const t = torus(18.75 + (y / 38) * 3.5, 0.55, i % 2 ? band : shade(main, -0.1), { y, rx: PI / 2 })
    t.scale.set(1, sz, 1)
    g.add(t)
  }
  const rim = torus(21.4, 1.4, band, { y: 37.4, rx: PI / 2 })
  rim.scale.set(1, sz, 1)
  g.add(rim)
  // 把手：两侧口沿下方的半圆环
  for (const s of [-1, 1]) g.add(torus(4, 0.9, band, { x: s * 21.6, y: 33, ry: PI / 2 }, PI))
  clothes(g, 31, 14, [cloth, C.white, N.blue, C.sakura], 3)
  return g
}

// 折叠布篮：方形布面 + 顶边钢丝框，两侧绳把手
function lbFold(p: string[]) {
  const [fabric, rim, cloth] = p
  const g = new THREE.Group()
  const w = 42
  const d = 38
  const h = 44
  g.add(shell(w, h, d, 0.7, fabric, { top: false }))
  g.add(rbox(w + 0.6, 2.6, d + 0.6, rim, { y: 0 }, 0.8))
  // 顶边包边
  for (const s of [-1, 1]) {
    g.add(rbox(w + 1, 2, 1.2, rim, { y: h - 2, z: s * (d / 2) }, 0.5))
    g.add(rbox(1.2, 2, d, rim, { x: s * (w / 2), y: h - 2 }, 0.5))
    // 绳把手
    g.add(torus(4, 0.6, rim, { x: s * (w / 2 + 0.6), y: h - 6, ry: PI / 2 }, PI))
  }
  // 斜纹装饰（两条斜带）
  g.add(rbox(w - 6, 1.6, 0.4, shade(fabric, -0.1), { y: 16, z: d / 2 + 0.3, rz: 0.08 }, 0.2))
  g.add(rbox(w - 2, h - 15, d - 2, shade(cloth, -0.05), { y: 0.7 }, 3))
  clothes(g, h - 12, 16, [cloth, N.white, C.sky, M.light], 5)
  return g
}

// 腰挎型塑料篮：矮胖、一侧内凹贴腰，侧面一排长条透气孔，两端提手
function lbHip(p: string[]) {
  const [main, cloth] = p
  const g = new THREE.Group()
  const w = 46
  const d = 38
  const h = 30
  const slots = Array.from({ length: 6 }, (_, i) => ({ kind: 'rect' as const, x: -15 + i * 6, y: 8, w: 2.4, h: 12, r: 1.1 }))
  const sideSlots = Array.from({ length: 4 }, (_, i) => ({ kind: 'rect' as const, x: -10.5 + i * 7, y: 8, w: 2.4, h: 12, r: 1.1 }))
  const handle = [{ kind: 'rect' as const, x: 0, y: h - 7, w: 12, h: 3.6, r: 1.7 }]
  g.add(shell(w, h, d, 1.2, main, { top: false, front: slots, back: slots, left: [...sideSlots.slice(1, 3), ...handle], right: [...sideSlots.slice(1, 3), ...handle] }))
  g.add(rbox(w + 1.4, 2.2, d + 1.4, shade(main, -0.06), { y: h - 1.9 }, 0.9))
  g.add(rbox(w - 3, h - 11, d - 3, shade(cloth, -0.05), { y: 1.2 }, 3))
  clothes(g, h - 9, 15, [cloth, C.white, M.light, C.lemon], 7)
  return g
}

// 铁丝筐：细铁丝方筐，木把手横跨两端
function lbWire(p: string[]) {
  const [wire, wood, cloth] = p
  const g = new THREE.Group()
  const w = 44
  const d = 38
  const h = 34
  const x = w / 2 - 0.5
  const z = d / 2 - 0.5
  // 底：一块薄底板 + 外框
  g.add(rbox(w - 2, 0.6, d - 2, shade(wire, -0.15), { y: 0.4 }, 0.2))
  for (const y of [0.6, 12, 23, h - 0.6]) {
    for (const s of [-1, 1]) {
      g.add(cylXLegacy(0.4, w, wire, 0, y, s * z, 6))
      g.add(cylZLegacy(0.4, d, wire, s * x, y, 0, 6))
    }
  }
  for (let i = 0; i <= 8; i++) {
    const xx = -x + (i * (2 * x)) / 8
    for (const s of [-1, 1]) g.add(cyl(0.3, 0.3, h - 1.2, wire, { x: xx, y: 0.6, z: s * z }, 5))
  }
  for (let i = 1; i < 7; i++) {
    const zz = -z + (i * (2 * z)) / 7
    for (const s of [-1, 1]) g.add(cyl(0.3, 0.3, h - 1.2, wire, { x: s * x, y: 0.6, z: zz }, 5))
  }
  // 两端木把手
  for (const s of [-1, 1]) {
    g.add(cylZLegacy(1.4, 14, wood, s * x, h + 1.2, 0, 12))
    for (const sz of [-1, 1]) g.add(cyl(0.35, 0.35, 1.6, wire, { x: s * x, y: h - 0.6, z: sz * 6 }, 5))
  }
  g.add(rbox(w - 3, h - 15, d - 3, shade(cloth, -0.05), { y: 0.7 }, 3))
  clothes(g, h - 12, 16, [cloth, C.white, N.blue, C.peach], 9)
  return g
}

// =====================================================================
// 脏衣篓：带盖款有「合上 / 打开」两种形态（同 sizeLabel），无盖款只有打开形态
// =====================================================================

const HAMPER_CLOTH = (acc: string) => [acc, N.white, C.sky, M.light]

// 藤编椭圆篓（带盖）
const HW = { r: 17.5, rb: 15.5, h: 52, sz: 0.85 }
function hamperWickerBody(p: string[]) {
  const [main, band] = p
  const { r, rb, h, sz } = HW
  const g = new THREE.Group()
  const body = cup(r, rb, h, 1.2, main)
  body.scale.set(1, 1, sz)
  g.add(body)
  for (let i = 0; i < 9; i++) {
    const y = 4 + i * 5.2
    const t = torus(rb + ((r - rb) * y) / h + 0.3, 0.5, i % 3 === 2 ? band : shade(main, -0.08), { y, rx: PI / 2 })
    t.scale.set(1, sz, 1)
    g.add(t)
  }
  for (const s of [-1, 1]) g.add(torus(3.4, 0.8, band, { x: s * (r + 0.5), y: h - 7, ry: PI / 2 }, PI))
  return g
}
function hamperWickerClosed(p: string[]) {
  const [main, band] = p
  const g = hamperWickerBody(p)
  const lid = puck(HW.r + 0.8, 3.2, main)
  lid.scale.set(1, 1, HW.sz)
  lid.position.y = HW.h - 0.6
  g.add(lid)
  const edge = torus(HW.r + 0.5, 0.7, band, { y: HW.h + 0.4, rx: PI / 2 })
  edge.scale.set(1, HW.sz, 1)
  g.add(edge)
  g.add(ball(1.8, band, { y: HW.h + 2.9 }, [1.6, 0.8, 1]))
  return g
}
function hamperWickerOpen(p: string[]) {
  const [, band, acc] = p
  const g = hamperWickerBody(p)
  const edge = torus(HW.r - 0.4, 0.8, band, { y: HW.h - 0.4, rx: PI / 2 })
  edge.scale.set(1, HW.sz, 1)
  g.add(edge)
  clothes(g, HW.h - 9, 15, HAMPER_CLOTH(acc), 11)
  return g
}

// 帆布支架篓（无盖）：四根木腿 + 横撑，帆布袋挂在框里
function hamperCanvas(p: string[]) {
  const [fabric, wood, acc] = p
  const g = new THREE.Group()
  const w = 40
  const d = 34
  const h = 62
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(2.6, h, 2.6, wood, { x: sx * (w / 2 - 1.3), z: sz * (d / 2 - 1.3) }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox(w - 5.2, 2.2, 2, wood, { y: h - 3, z: s * (d / 2 - 1.3) }, 0.5))
    g.add(rbox(2, 2.2, d - 5.2, wood, { x: s * (w / 2 - 1.3), y: h - 3 }, 0.5))
    g.add(rbox(2, 2.2, d - 5.2, wood, { x: s * (w / 2 - 1.3), y: 8 }, 0.5))
  }
  // 帆布袋：从顶框往下垂，底离地
  g.add(shell(w - 4, h - 14, d - 4, 0.6, fabric, { top: false }).translateY(10))
  // 翻过框条的布边
  for (const s of [-1, 1]) {
    g.add(rbox(w - 5, 5, 0.6, shade(fabric, -0.06), { y: h - 6, z: s * (d / 2 - 0.1) }, 0.2))
    g.add(rbox(0.6, 5, d - 5, shade(fabric, -0.06), { x: s * (w / 2 - 0.1), y: h - 6 }, 0.2))
  }
  g.add(rbox(10, 4, 0.4, acc, { y: 30, z: d / 2 - 2.6 }, 0.2))
  g.add(rbox(w - 7, 27, d - 7, shade(acc, -0.05), { y: 10.6 }, 3))
  clothes(g, h - 22, 16, HAMPER_CLOTH(acc), 13)
  return g
}

// 双格分类篓（带两片翻盖）：一个方箱中间隔开
const HS = { w: 40, d: 32, h: 54 }
function hamperSplitBody(p: string[]) {
  const [main, trim] = p
  const { w, d, h } = HS
  const g = new THREE.Group()
  g.add(shell(w, h, d, 1.2, main, { top: false, left: [{ kind: 'rect', x: 0, y: h - 9, w: 10, h: 3.2, r: 1.5 }], right: [{ kind: 'rect', x: 0, y: h - 9, w: 10, h: 3.2, r: 1.5 }] }))
  g.add(rbox(1.2, h - 1.6, d - 2.4, main, { y: 1 }, 0.3))
  g.add(rbox(w + 0.8, 3, d + 0.8, trim, { y: 0 }, 0.8))
  // 正面两块分类色牌
  for (const s of [-1, 1]) g.add(rbox(8, 3, 0.4, s < 0 ? trim : shade(trim, 0.25), { x: s * 10.5, y: h - 12, z: d / 2 + 0.2 }, 0.2))
  return g
}
function hamperSplitClosed(p: string[]) {
  const [, trim] = p
  const { w, d, h } = HS
  const g = hamperSplitBody(p)
  for (const s of [-1, 1]) {
    g.add(rbox(w / 2 - 0.3, 2, d + 0.6, trim, { x: s * (w / 4 + 0.15), y: h - 0.2 }, 0.8))
    g.add(rbox(6, 1, 1.6, shade(trim, -0.15), { x: s * (w / 4), y: h + 1.4, z: d / 2 - 2.4 }, 0.4))
  }
  return g
}
function hamperSplitOpen(p: string[]) {
  const [, trim, acc] = p
  const { w, d, h } = HS
  const g = hamperSplitBody(p)
  // 翻盖取下：口沿一圈包边
  for (const s of [-1, 1]) {
    g.add(rbox(w + 0.6, 1.4, 1.6, trim, { y: h - 1.1, z: s * (d / 2 - 0.5) }, 0.5))
    g.add(rbox(1.6, 1.4, d - 2.4, trim, { x: s * (w / 2 - 0.5), y: h - 1.1 }, 0.5))
  }
  const cols = HAMPER_CLOTH(acc)
  for (const s of [-1, 1]) {
    const sub = new THREE.Group()
    clothes(sub, h - 9, 11, s < 0 ? cols.slice(0, 2) : cols.slice(2), s < 0 ? 15 : 17)
    sub.position.x = s * (w / 4)
    g.add(sub)
  }
  return g
}

// 竹编方篓（带盖）：竖竹条围一圈，上下两道箍，里面有布衬
const HB = { w: 36, d: 32, h: 54 }
function hamperBambooBody(p: string[]) {
  const [main, band, liner] = p
  const { w, d, h } = HB
  const g = new THREE.Group()
  g.add(shell(w - 2.4, h - 2, d - 2.4, 0.5, liner, { top: false }).translateY(1))
  g.add(rbox(w, 1.6, d, shade(main, -0.12), {}, 0.5))
  const n = 9
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 1.6 + (i * (w - 3.2)) / (n - 1)
    for (const s of [-1, 1]) g.add(rbox(2.6, h - 1.6, 0.9, i % 2 ? main : shade(main, 0.05), { x, y: 1.6, z: s * (d / 2 - 0.6) }, 0.3))
  }
  for (let i = 1; i < 7; i++) {
    const z = -d / 2 + 1.6 + (i * (d - 3.2)) / 7
    for (const s of [-1, 1]) g.add(rbox(0.9, h - 1.6, 2.6, i % 2 ? main : shade(main, 0.05), { x: s * (w / 2 - 0.6), y: 1.6, z }, 0.3))
  }
  for (const y of [4, h - 5]) {
    for (const s of [-1, 1]) {
      g.add(rbox(w + 0.6, 2.2, 0.8, band, { y, z: s * (d / 2 + 0.1) }, 0.3))
      g.add(rbox(0.8, 2.2, d - 0.6, band, { x: s * (w / 2 + 0.1), y }, 0.3))
    }
  }
  return g
}
function hamperBambooClosed(p: string[]) {
  const [main, band] = p
  const { w, d, h } = HB
  const g = hamperBambooBody(p)
  g.add(rbox(w + 1.6, 2.4, d + 1.6, main, { y: h - 0.4 }, 0.8))
  g.add(rbox(w + 2, 1, d + 2, band, { y: h - 0.6 }, 0.4))
  g.add(cylXLegacy(0.9, 10, band, 0, h + 3, 0))
  for (const s of [-1, 1]) g.add(cyl(0.6, 0.6, 1.2, band, { x: s * 4.4, y: h + 1.8 }, 8))
  return g
}
function hamperBambooOpen(p: string[]) {
  const [, , acc] = p
  const g = hamperBambooBody(p)
  g.add(rbox(HB.w - 4, HB.h - 12, HB.d - 4, shade(acc, -0.05), { y: 1.5 }, 3))
  clothes(g, HB.h - 9, 14, HAMPER_CLOTH(acc), 19)
  return g
}

// 弹出布篓（无盖）：钢丝圈撑起的圆筒，条纹布面，两只布提手
function hamperPop(p: string[]) {
  const [fabric, stripe, acc] = p
  const g = new THREE.Group()
  const r = 17.5
  const h = 54
  g.add(cup(r, r, h, 0.6, fabric))
  for (const y of [10, 20, 30, 40]) g.add(torus(r + 0.05, 0.9, stripe, { y, rx: PI / 2 }))
  g.add(torus(r - 0.2, 0.7, shade(fabric, -0.15), { y: h - 0.4, rx: PI / 2 }))
  g.add(torus(r - 0.2, 0.6, shade(fabric, -0.15), { y: 0.6, rx: PI / 2 }))
  for (const s of [-1, 1]) g.add(torus(3.6, 0.7, stripe, { x: s * (r + 0.3), y: h - 4.5, ry: PI / 2 }, PI))
  clothes(g, h - 9, 15, HAMPER_CLOTH(acc), 21)
  return g
}

// =====================================================================
// 洗衣机置物架：跨在洗衣机（64 × 64 × 88）上方，内宽 > 66，最低层板底 > 110
// =====================================================================

interface RackLayout {
  w: number
  d: number
  h: number
  /** 顶面（最高一层板面） */
  top: number
  /** 顶面以下的层板面（y, 前后 z 范围） */
  shelves: { y: number; z0: number; z1: number; h: number }[]
  /** 挂毛巾的横杆（y = 杆中心，z = 杆中心，r 半径） */
  bar?: { y: number; z: number; r: number }
}
function rackSurfacesOf(L: RackLayout) {
  const out: NonNullable<AssetDef['surfaces']> = L.shelves.map((s) => ({ y: s.y, h: s.h, shape: [rectPoly(-L.w / 2 + 3, s.z0, L.w / 2 - 3, s.z1)] }))
  if (L.bar) out.push(hookLayer(-L.w / 2 + 6, L.w / 2 - 6, L.bar.y, L.bar.r, L.bar.z))
  return out
}

// 阶梯木梯架：两侧是前脚外撇的梯形侧架，层板越往上越窄，底下一根毛巾杆
/** 前腿在高度 y 处的 z（底部 17.4 往上收到顶部 4） */
const ladderZ = (y: number) => 16.4 - (12.4 * y) / 182
const LR_LADDER: RackLayout = {
  w: 72,
  d: 36,
  h: 183,
  top: 180,
  shelves: [
    { y: 122, z0: -16, z1: ladderZ(122) - 1.5, h: 27 },
    { y: 151, z0: -16, z1: ladderZ(151) - 1.5, h: 27 },
  ],
  bar: { y: 108, z: ladderZ(108), r: 1.1 },
}
function rackLadder(p: string[]) {
  const [wood, board, acc] = p
  const { w, d } = LR_LADDER
  const h = 182
  const g = new THREE.Group()
  const zb = -d / 2 + 1.6
  const x = w / 2 - 1.6
  for (const s of [-1, 1]) {
    g.add(rbox(3.2, h, 3.2, wood, { x: s * x, z: zb }, 0.6))
    g.add(rod3([s * x, 0, ladderZ(0)], [s * x, h - 1.6, ladderZ(h - 1.6)], 1.6, wood, 8))
    for (const y of [20, 60]) g.add(cylZLegacy(0.8, ladderZ(y) - zb, acc, s * x, y, (ladderZ(y) + zb) / 2))
  }
  for (const y of [120.4, 149.4, 178.4]) {
    const z1 = ladderZ(y + 1.6) + 1
    g.add(rbox(w, 1.6, z1 - zb + 1.6, board, { y, z: (z1 + zb) / 2 }, 0.4))
    g.add(rbox(w - 6.4, 3, 1, board, { y: y + 1.6, z: zb + 0.2 }, 0.3))
  }
  g.add(cylXLegacy(1.1, w - 0.4, acc, 0, LR_LADDER.bar!.y, LR_LADDER.bar!.z))
  return g
}

// 顶天立地伸缩杆：后侧两根立杆顶到 200，层板靠斜撑悬挑出来
const LR_TENSION: RackLayout = {
  w: 75.2,
  d: 31.6,
  h: 202,
  top: 182,
  shelves: [
    { y: 124, z0: -12, z1: 13, h: 25 },
    { y: 153, z0: -12, z1: 13, h: 25 },
  ],
}
function rackTension(p: string[]) {
  const [pole, board, pad] = p
  const { h } = LR_TENSION
  const w = 74
  const d = 30
  const g = new THREE.Group()
  const zp = -d / 2 + 2
  const x = w / 2 - 2
  for (const s of [-1, 1]) {
    g.add(puck(2.6, 2, pad, { x: s * x, z: zp }))
    g.add(cyl(1.6, 1.6, 120, pole, { x: s * x, y: 2, z: zp }, 12))
    g.add(cyl(1.3, 1.3, h - 123, pole, { x: s * x, y: 121, z: zp }, 12))
    g.add(cyl(2.2, 2.2, 3, DARK, { x: s * x, y: 120, z: zp }, 12))
    g.add(puck(2.6, 2, pad, { x: s * x, y: h - 2, z: zp }))
  }
  for (const y of [122.4, 151.4, 180.4]) {
    g.add(rbox(w - 1, 1.6, d - 2, board, { y, z: 1 }, 0.5))
    for (const s of [-1, 1]) {
      g.add(rbox(3, 3, 3, DARK, { x: s * x, y: y - 3, z: zp }, 0.6))
      g.add(rod3([s * x, y - 10, zp], [s * (x - 1), y, d / 2 - 3], 0.6, pole, 6))
    }
    g.add(cylXLegacy(0.5, w - 6, pole, 0, y + 4, d / 2 - 1.2))
    for (const s of [-1, 1]) g.add(cyl(0.45, 0.45, 4, pole, { x: s * (w / 2 - 3.5), y: y + 1.6, z: d / 2 - 1.2 }, 6))
  }
  return g
}

// 带门上柜款：四根方腿 + 一层开放板 + 顶上带两扇门的柜子
const LR_CAB: RackLayout = {
  w: 72,
  d: 33.4,
  h: 184,
  top: 184,
  shelves: [{ y: 124, z0: -14, z1: 14, h: 20 }],
}
/** 上柜中间的层板顶面 */
const LR_CAB_SHELF = 165
/** 上柜门里两层（底板、中间层板）：柜体 d 32，fitted 后中心大约往后 0.6 */
const LR_CAB_INSIDE: SurfaceDef[] = [
  { y: 145.6, h: LR_CAB_SHELF - 1.4 - 145.6 - 0.5, inside: true, shape: [rectPoly(-LR_CAB.w / 2 + 2.2, -13.5, LR_CAB.w / 2 - 2.2, 13)] },
  { y: LR_CAB_SHELF, h: LR_CAB.h - 1.6 - LR_CAB_SHELF - 0.5, inside: true, shape: [rectPoly(-LR_CAB.w / 2 + 2.2, -13.5, LR_CAB.w / 2 - 2.2, 13)] },
]
function rackCabinet(p: string[]) {
  const [body, leg, knob] = p
  const { w, h } = LR_CAB
  const d = 32
  const g = new THREE.Group()
  const x = w / 2 - 1.8
  const z = d / 2 - 1.8
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3.6, 144, 3.6, leg, { x: sx * x, z: sz * z }, 0.6))
  g.add(rbox(w, 1.8, d, body, { y: 122.2 }, 0.5))
  for (const y of [20, 60]) for (const s of [-1, 1]) g.add(cylZLegacy(0.8, d - 3.6, leg, s * x, y, 0))
  // 柜体：底 144，顶 184
  g.add(shell(w, h - 144, d, 1.6, body, { front: [{ kind: 'rect', x: 0, y: 1.6, w: w - 3.2, h: h - 144 - 3.2, r: 0.3 }] }).translateY(144))
  g.add(rbox(w - 3.2, 1.4, d - 3.2, body, { y: LR_CAB_SHELF - 1.4 }, 0.3))
  // 两扇门：铰链在外侧，约 100° 转开
  for (const s of [-1, 1]) {
    const parts = [rbox(w / 2 - 2, h - 144 - 3.6, 1.4, shade(body, 0.04), { x: s * (w / 4 - 0.2), y: 145.8, z: d / 2 - 0.3 }, 0.4), rbox(1, 9, 1, knob, { x: s * 3, y: 160, z: d / 2 + 0.9 }, 0.4)]
    g.add(moving(parts, [s * (w / 4 - 0.2 + (w / 2 - 2) / 2), 145.8, d / 2 - 1], { kind: 'swing', angle: (s < 0 ? -1 : 1) * SWING_OPEN }))
  }
  return g
}

// 网格篮款：钢管框架，每层是一只铁丝网篮
const LR_MESH: RackLayout = {
  w: 71,
  d: 35,
  h: 181.4,
  top: 176.9,
  shelves: [
    { y: 120.9, z0: -15, z1: 15, h: 23 },
    { y: 148.9, z0: -15, z1: 15, h: 23 },
  ],
  bar: { y: 106, z: 15.6, r: 1 },
}
function rackMesh(p: string[]) {
  const [frame, basket, foot] = p
  const w = 70
  const d = 34
  const h = 181
  const g = new THREE.Group()
  const x = w / 2 - 1.3
  const z = d / 2 - 1.3
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cyl(1.3, 1.3, h - 2, frame, { x: sx * x, y: 1, z: sz * z }, 12))
      g.add(puck(1.8, 1.2, foot, { x: sx * x, z: sz * z }))
      g.add(ball(1.4, foot, { x: sx * x, y: h - 1.2, z: sz * z }))
    }
  const bx = x - 1.6
  const bz = z - 1.6
  for (const y of [120, 148, 176]) {
    // 篮底：前后向的细丝 + 一圈底框，篮壁 5cm 高
    g.add(noOutlineDeep(rbox(2 * bx, 0.3, 2 * bz, shade(basket, -0.2), { y: y + 0.2 }, 0.1)))
    for (let i = 0; i <= 12; i++) g.add(cylZLegacy(0.25, 2 * bz, basket, -bx + (i * 2 * bx) / 12, y + 0.6, 0, 5))
    for (const yy of [y + 0.6, y + 5]) {
      for (const s of [-1, 1]) {
        g.add(cylXLegacy(0.4, 2 * bx, basket, 0, yy, s * bz, 6))
        g.add(cylZLegacy(0.4, 2 * bz, basket, s * bx, yy, 0, 6))
      }
    }
    for (let i = 0; i <= 10; i++) for (const s of [-1, 1]) g.add(cyl(0.25, 0.25, 4.4, basket, { x: -bx + (i * 2 * bx) / 10, y: y + 0.6, z: s * bz }, 5))
    for (const s of [-1, 1]) g.add(cylXLegacy(0.6, 2 * x, frame, 0, y - 0.6, s * z))
  }
  g.add(cylXLegacy(1, 2 * x, frame, 0, LR_MESH.bar!.y, LR_MESH.bar!.z))
  for (const s of [-1, 1]) g.add(cylZLegacy(0.7, 2 * z, frame, s * x, 20, 0))
  return g
}

// 圆角奶油款：粗圆角方框（塑料），层板带圆润的前唇，侧面两颗挂钩
const LR_CUTE: RackLayout = {
  w: 75,
  d: 30,
  h: 176,
  top: 174,
  shelves: [
    { y: 120, z0: -12, z1: 12, h: 24 },
    { y: 148, z0: -12, z1: 12, h: 24 },
  ],
}
function rackCute(p: string[]) {
  const [frame, board, knob] = p
  const { w, d, h } = LR_CUTE
  const g = new THREE.Group()
  const x = w / 2 - 2.2
  for (const s of [-1, 1]) {
    // 侧框：前后两根粗圆角立柱 + 底横撑 + 顶拱
    for (const sz of [-1, 1]) g.add(rbox(4.4, h - 4, 4.4, frame, { x: s * x, z: sz * (d / 2 - 2.2) }, 2))
    g.add(rbox(4.4, 4.4, d, frame, { x: s * x, y: h - 4.4 }, 2))
    g.add(rbox(4.4, 4.4, d, frame, { x: s * x, y: 12 }, 2))
    // 顶拱正面的圆钮装饰
    g.add(ball(1.6, knob, { x: s * x, y: h - 2.2, z: d / 2 - 0.2 }, [1, 1, 0.5]))
  }
  for (const y of [118, 146, 172]) {
    g.add(rbox(w - 8.8, 2, d - 2, board, { y, z: 0 }, 0.8))
    g.add(rbox(w - 8.8, 3, 2, board, { y: y + 1, z: d / 2 - 1.6 }, 1))
  }
  return g
}

// =====================================================================
// 刷牙杯
// =====================================================================

/** 一支牙刷：刷柄底在原点，刷头朝 +z 一侧 */
function toothbrush(color: string, len = 15) {
  const b = new THREE.Group()
  b.add(cyl(0.42, 0.38, len, color, {}, 10))
  b.add(rbox(0.8, 2.2, 1.1, C.white, { y: len - 2.6, z: 0.6 }, 0.3))
  return b
}

// 立式牙刷架：一块带孔的小台座，牙刷直立插在孔里，外加一支牙膏
function tbHolder(p: string[]) {
  const [main, b1, b2] = p
  const g = new THREE.Group()
  g.add(rbox(9, 4, 6, main, {}, 1.6))
  g.add(rbox(8.4, 0.6, 5.4, shade(main, -0.1), { y: 4 }, 0.25))
  ;[b1, b2, b1].forEach((c, i) => {
    if (i === 2) return
    const b = toothbrush(c, 15)
    b.position.set(-2.4 + i * 4.8, 1.5, -0.6)
    g.add(b)
  })
  // 牙膏立着
  g.add(cyl(0.9, 1.1, 10, b2, { x: 0, y: 4.4, z: 1.2 }, 12))
  g.add(cyl(0.6, 0.6, 1.4, C.white, { x: 0, y: 14.4, z: 1.2 }, 10))
  return g
}

// 带把手的宽口杯：矮胖、侧把手，牙刷斜靠两边
function tbMug(p: string[]) {
  const [main, b1, b2] = p
  const g = new THREE.Group()
  g.add(cup(3.6, 3.2, 8.4, 0.5, main))
  g.add(torus(2.1, 0.55, main, { x: 3.4, y: 4.4, rz: -PI / 2 }, PI))
  g.add(torus(3.65, 0.25, shade(main, -0.12), { y: 6.6, rx: PI / 2 }))
  const put = (c: string, x: number, z: number, rz: number, rx: number) => {
    const b = toothbrush(c, 14)
    b.position.set(x, 0.5, z)
    b.rotation.set(rx, 0, rz)
    g.add(b)
  }
  // 倾角收小：杯口处牙刷柄外沿离杯轴 ≤ 2.8，不穿出杯壁（内壁半径 3.1）
  put(b1, -0.9, 0.4, 0.15, 0.08)
  put(b2, 0.9, -0.5, -0.14, -0.08)
  return g
}

// 透明玻璃杯：看得见里面的牙刷柄，牙刷 + 一支牙膏
function tbGlass(p: string[]) {
  const [glassC, b1, tube] = p
  const g = new THREE.Group()
  g.add(glassFlat(cup(3.4, 3, 10, 0.4, glassC), glassC, 0.4))
  const b = toothbrush(b1, 16)
  b.position.set(-0.8, 0.4, 0.3)
  b.rotation.z = 0.12
  g.add(b)
  // 牙膏倒插：盖子朝下
  const t = new THREE.Group()
  t.add(cyl(0.7, 0.7, 1.2, C.white, {}, 10))
  t.add(cyl(1.3, 0.9, 9, tube, { y: 1.2 }, 12))
  t.add(rbox(2.6, 1, 0.6, tube, { y: 10.2 }, 0.2))
  t.position.set(1.1, 0.4, -0.3)
  t.rotation.z = -0.14
  g.add(t)
  return g
}

// 和风陶杯：粗陶直筒杯，上半施釉、下半露胎，牙刷两支
function tbCeramic(p: string[]) {
  const [glaze, clay, b1] = p
  const g = new THREE.Group()
  g.add(cup(3.3, 3.5, 9.5, 0.6, glaze))
  g.add(cyl(3.6, 3.66, 3.4, clay, { y: 0 }, 24))
  g.add(torus(3.5, 0.2, shade(glaze, -0.15), { y: 3.5, rx: PI / 2 }))
  const put = (c: string, x: number, z: number, rz: number) => {
    const b = toothbrush(c, 15)
    b.position.set(x, 0.6, z)
    b.rotation.z = rz
    g.add(b)
  }
  put(b1, -0.9, 0.3, 0.16)
  put(shade(b1, 0.25), 0.9, -0.3, -0.16)
  return g
}

// =====================================================================
// 咖啡杯碟
// =====================================================================

function liquid(r: number, top: number, color: string, x = 0, z = 0) {
  return noOutlineDeep(cyl(r, r, 0.3, color, { x, y: top - 0.3, z }, 28))
}
function cupHandle(r: number, tube: number, color: string, x: number, y: number) {
  return torus(r, tube, color, { x, y, rz: -PI / 2 }, PI)
}
function saucer(r: number, color: string) {
  return cup(r, r * 0.62, 1, 0.4, color)
}
function spoon(color: string, x: number, z: number, ry: number, y = 0.75) {
  const g = new THREE.Group()
  g.add(rbox(4.4, 0.25, 0.6, color, { y: 0 }, 0.1))
  g.add(ball(0.7, color, { x: -2.6, y: 0.2 }, [1.4, 0.3, 1]))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

// 拿铁宽口杯：大开口碗形杯，奶泡上拉一颗心
function coffeeLatte(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(saucer(7, sub))
  g.add(cup(5, 2.6, 5.4, 0.4, main, { y: 0.4 }))
  g.add(liquid(4.5, 5.3, '#c99a6e'))
  // 心形拉花：两个圆 + 一个尖
  g.add(noOutlineDeep(ball(0.9, CREAM, { x: -0.6, y: 5.32, z: -0.3 }, [1, 0.1, 1])))
  g.add(noOutlineDeep(ball(0.9, CREAM, { x: 0.6, y: 5.32, z: -0.3 }, [1, 0.1, 1])))
  g.add(noOutlineDeep(ball(0.9, CREAM, { y: 5.31, z: 0.6 }, [0.9, 0.1, 1.1])))
  g.add(cupHandle(1.3, 0.38, main, 4.4, 3.6))
  g.add(spoon(acc, 1.4, 5.2, 0.3))
  return g
}

// 浓缩小杯：小杯 + 小碟 + 方糖
function coffeeEspresso(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(saucer(5, sub))
  g.add(cup(2.5, 2, 4, 0.35, main, { y: 0.4 }))
  g.add(liquid(2.05, 4.0, '#5a3322'))
  g.add(noOutlineDeep(ball(1.6, '#c98a4f', { y: 4.02 }, [1, 0.08, 1])))
  g.add(cupHandle(1, 0.3, main, 2.4, 2.6))
  g.add(rbox(1.3, 1.3, 1.3, C.white, { x: -2.8, y: 0.7, z: 2.2, ry: 0.4 }, 0.2))
  g.add(spoon(acc, 0.6, 3.6, 0.2))
  return g
}

// 玻璃双层杯：透明杯身，看得见咖啡和奶的分层，木杯垫
function coffeeGlass(p: string[]) {
  const [coaster, glassC, acc] = p
  const g = new THREE.Group()
  g.add(puck(5.2, 0.8, coaster))
  g.add(noOutlineDeep(cyl(3.1, 2.7, 3.6, '#e8d2b0', { y: 1.2 }, 24)))
  g.add(noOutlineDeep(cyl(3.3, 3.1, 3, COFFEE, { y: 4.8 }, 24)))
  g.add(glassFlat(cup(3.7, 3.2, 9, 0.4, glassC), glassC, 0.32).translateY(0.8))
  g.add(noOutlineDeep(cyl(0.35, 0.35, 10, acc, { x: 1.4, y: 2, z: 0.4, rz: -0.18 }, 8)))
  return g
}

// 昭和厚瓷：厚壁直筒杯 + 宽沿碟，杯口一圈色线
function coffeeDiner(p: string[]) {
  const [main, line, acc] = p
  const g = new THREE.Group()
  g.add(saucer(6.8, main))
  g.add(torus(6.2, 0.25, line, { y: 0.95, rx: PI / 2 }))
  g.add(cup(3.6, 3.3, 6.2, 0.9, main, { y: 0.4 }))
  g.add(liquid(2.75, 6, COFFEE))
  g.add(torus(3.66, 0.25, line, { y: 5.6, rx: PI / 2 }))
  g.add(cupHandle(1.7, 0.6, main, 3.5, 3.6))
  g.add(spoon(acc, -0.8, 4.8, -0.25))
  return g
}

// 和风陶杯：无把手的粗陶杯 + 木茶托
function coffeeYunomi(p: string[]) {
  const [glaze, wood, clay] = p
  const g = new THREE.Group()
  g.add(puck(6, 1, wood))
  g.add(torus(5.2, 0.25, shade(wood, -0.12), { y: 1, rx: PI / 2 }))
  g.add(cup(3.9, 3, 6.4, 0.6, glaze, { y: 1 }))
  g.add(cyl(3.42, 3.12, 2.2, clay, { y: 1 }, 24))
  g.add(liquid(3.2, 6.8, COFFEE))
  return g
}

// =====================================================================
// 定义
// =====================================================================

const air = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  define(id, '壁挂空调', 'appliance', dims, pals, build, { family: 'aircon', sizeLabel: label, mount: AIRCON_MOUNT })

const AIRCON: AssetDef[] = [
  air('va-aircon-slim', '薄型', [92, 21, 24], [
    ['modern', [M.white, M.silver]],
    ['modern', [M.light, M.char]],
    ['nordic', [N.white, N.blue]],
    ['cute', [C.white, C.pink]],
  ], airSlim),
  air('va-aircon-premium', '高端屏显', [98, 23.5, 30.5], [
    ['modern', [M.white, '#fafafc', '#7fd8ff']],
    ['modern', [M.char, '#4a4c52', '#ffb35c']],
    ['nordic', [N.white, N.linen, '#9be3c0']],
    ['retro', [R.cream, '#fff7e6', '#ff9a4d']],
  ], airPremium),
  air('va-aircon-wood', '木纹面板', [94, 22.5, 27], [
    ['japanese', [J.washi, J.wood, J.dark]],
    ['nordic', [N.white, N.oak, N.oakL]],
    ['japanese', [J.sumi, J.hinoki, J.dark]],
    ['industrial', [I.iron, I.walnut, I.steel]],
  ], airWood),
  air('va-aircon-black', '黑色', [96, 25, 29], [
    ['modern', [M.black, M.char, '#9be7ff']],
    ['industrial', [I.iron, I.steel, '#ffb35c']],
    ['modern', ['#2e3440', M.silver, '#ffffff']],
  ], airBlack),
  air('va-aircon-round', '圆润', [88, 25, 29], [
    ['cute', [C.white, C.sakura, C.pink]],
    ['cute', [C.white, C.sky, C.sky]],
    ['cute', [C.cream, C.mint, C.peach]],
    ['retro', [R.cream, R.mustard, R.orange]],
  ], airRound),
]

const stand = (id: string, label: string, dims: Dims, pals: Pal[], build: Build, surfaces: NonNullable<AssetDef['surfaces']>) =>
  define(id, '晾衣架', 'outdoor', dims, pals, build, { family: 'laundry-stand', sizeLabel: label, surfaces })

const STANDS: AssetDef[] = [
  stand('va-lstand-tele', '伸缩落地', [TEL.w - 1, TEL.d, TEL.top + 3], [
    ['modern', [M.silver, M.char]],
    ['cute', [C.white, C.sky]],
    ['nordic', [N.white, N.oak]],
    ['industrial', [I.iron, I.rust]],
  ], standTelescopic, [
    hookLayer(-TEL.w / 2 + 5, TEL.w / 2 - 5, TEL.top, 1.2, 0, TEL.top - 16),
    hookLayer(-TEL.w / 2 + 5, TEL.w / 2 - 5, TEL.low, 1, TEL.zLow, TEL.low - 8),
  ]),
  stand('va-lstand-x', 'X 形折叠', [XF.w - 1, XF.d, XF.top + 2], [
    ['modern', [M.silver, M.char]],
    ['cute', [C.white, C.pink]],
    ['nordic', [N.oak, N.gray]],
    ['industrial', [I.iron, I.steel]],
  ], standX, [
    hookLayer(-XF.w / 2 + 4, XF.w / 2 - 4, XF.top + 0.4, 1.1, XF.zs, XF.top - 6),
    hookLayer(-XF.w / 2 + 4, XF.w / 2 - 4, XF.top + 0.4, 1.1, -XF.zs, XF.top - 6),
  ]),
  stand('va-lstand-rail', '扶手挂式', [RAIL.w + 2, 43.7, RAIL.post + 24], [
    ['modern', [M.silver, M.char]],
    ['cute', [C.white, C.mint]],
    ['industrial', [I.steel, I.iron]],
  ], standRail, [
    hookLayer(-RAIL.w / 2 + 4, RAIL.w / 2 - 4, RAIL.post + 22, 1.1, 20, RAIL.post + 20),
    hookLayer(-RAIL.w / 2 + 4, RAIL.w / 2 - 4, RAIL.post + 11, 1.1, 0, RAIL.post - 30),
  ]),
  stand('va-lstand-lift', '吊顶升降', [LIFT.w + 1, LIFT.d, LIFT.top], [
    ['modern', [M.white, M.silver, M.light]],
    ['modern', [M.char, M.silver, M.black]],
    ['nordic', [N.white, N.oak, N.gray]],
    ['cute', [C.white, C.sky, C.sakura]],
  ], standLift, [
    hookLayer(-LIFT.w / 2 + 9, LIFT.w / 2 - 9, LIFT.bar, 1.2, LIFT.z2, LIFT.bar - 4),
    hookLayer(-LIFT.w / 2 + 9, LIFT.w / 2 - 9, LIFT.bar, 1.2, LIFT.z1, LIFT.bar - 4),
  ]),
  stand('va-lstand-bamboo', '和风竹竿', [BAM.len, 42, BAM.post + 5.5], [
    ['japanese', [J.wood, I.concrete, '#c9b46a']],
    ['japanese', [J.dark, J.sumi, '#b9a55a']],
    ['nordic', [N.oak, N.white, '#cdb87a']],
    ['retro', [R.teal, R.cream, '#d8c47a']],
  ], standBamboo, [hookLayer(-BAM.len / 2 + 4, BAM.len / 2 - 4, BAM.post + 2.1, 1.75, 0, BAM.post - 6)]),
]

const pl = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  define(id, '花箱', 'outdoor', dims, pals, fitted(build), { family: 'planter', sizeLabel: label })

const PLANTERS: AssetDef[] = [
  pl('va-planter-wood', '木条', [64, 26, 37], [
    ['japanese', [J.hinoki, J.wood, '#7fae6a']],
    ['nordic', [N.oakL, N.oak, '#8fbf7a']],
    ['industrial', [I.walnut, I.iron, '#6f9a5a']],
    ['retro', [R.caramel, R.olive, '#88b06a']],
  ], planterWood),
  pl('va-planter-terracotta', '陶土椭圆', [67.5, 26.5, 46], [
    ['retro', ['#c9744a', '#b5653e', C.red]],
    ['nordic', [N.white, N.linen, C.pink]],
    ['cute', [C.peach, C.sakura, C.lemon]],
    ['modern', [M.char, M.gray, M.white]],
  ], planterTerracotta),
  pl('va-planter-tiered', '阶梯花架', [64, 26, 54], [
    ['nordic', [N.oak, N.white, N.mustard]],
    ['cute', [C.woodL, C.pink, C.lilac]],
    ['japanese', [J.wood, J.sumi, J.shu]],
    ['industrial', [I.walnut, I.concrete, I.rust]],
  ], planterTiered),
  pl('va-planter-galv', '铁皮槽', [64, 23, 42], [
    ['industrial', ['#a9b0b5', I.iron, '#9b7fd1']],
    ['modern', [M.white, M.char, '#b49be0']],
    ['retro', [R.teal, R.cream, R.mustard]],
    ['cute', [C.sky, C.white, C.pink]],
  ], planterGalv),
  pl('va-planter-cubes', '方块三连', [62, 22, 42], [
    ['modern', [M.white, M.char, '#6fa05a']],
    ['modern', [M.char, M.walnut, '#7fb06a']],
    ['industrial', [I.concrete, I.iron, '#6f9a5a']],
    ['nordic', [N.white, N.oak, '#8fbf7a']],
  ], planterCubes),
]

const tb = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  prop(id, '马桶刷', 'toiletry', dims, pals, fitted(build), { family: 'wet-toilet-brush', sizeLabel: label })

const TOILET_BRUSHES: AssetDef[] = [
  tb('va-brush-slim', '方形纤薄', [8.6, 7.4, 40.4], [
    ['modern', [M.white, M.white, M.gray]],
    ['modern', [M.black, M.black, M.char]],
    ['nordic', [N.white, N.gray, N.oak]],
    ['cute', [C.white, C.mint, C.mint]],
  ], brushSlim),
  tb('va-brush-dome', '圆顶', [10.7, 10.7, 34.4], [
    ['cute', [C.white, C.pink, C.pink]],
    ['cute', [C.white, C.sky, C.lemon]],
    ['retro', [R.cream, R.teal, R.mustard]],
    ['nordic', [N.white, N.sage, N.oak]],
  ], brushDome),
  tb('va-brush-wood', '木柄陶瓷', [9.4, 9.4, 44.6], [
    ['nordic', [N.white, N.oak, N.gray]],
    ['japanese', [J.washi, J.wood, J.ai]],
    ['modern', [M.char, M.walnut, M.gray]],
    ['japanese', [J.sumi, J.hinoki, J.shu]],
  ], brushWood),
  tb('va-brush-stand', '金属支架', [9.2, 9.4, 41.5], [
    ['industrial', [I.iron, I.steel, I.iron]],
    ['modern', [M.silver, M.white, M.char]],
    ['retro', ['#c8a24a', R.cream, R.caramel]],
  ], brushStand),
]

const ns = (id: string, label: string, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef>) =>
  define(id, '床头柜', 'bedroom', dims, pals, fitted(build), { family: 'nightstand', sizeLabel: label, surface: dims[2], ...extra })

const NIGHTSTANDS: AssetDef[] = [
  ns('va-ns-open', '开放格', [NS_OPEN.w, 35.5, NS_OPEN.h], [
    ['nordic', [N.white, N.oak, N.oak]],
    ['nordic', [N.oak, N.oak, M.black]],
    ['retro', [R.caramel, R.caramel, R.mustard]],
    ['modern', [M.white, M.black, M.black]],
  ], nsOpen, {
    build: nsOpen,
    openable: true,
    surfaces: [{ y: NS_OPEN.leg + 1.8, h: 14.5, shape: [rectPoly(-NS_OPEN.w / 2 + 2.5, NS_OPEN_Z - 33 / 2 + 2.3, NS_OPEN.w / 2 - 2.5, NS_OPEN_Z + 33 / 2 - 1)] }, trayLevel(NS_OPEN_TRAY)],
  }),
  ns('va-ns-round', '圆柱', [NS_ROUND.r * 2, NS_ROUND.r * 2, NS_ROUND.h], [
    ['modern', [M.white, M.white, M.char]],
    ['modern', [M.black, M.walnut, M.black]],
    ['cute', [C.sakura, C.white, C.woodL]],
    ['nordic', [N.sage, N.oak, N.oak]],
  ], nsRound, { surfaceShape: [ellipsePoly(NS_ROUND.r - 1)] }),
  ns('va-ns-wagon', '推车', [NS_WAGON.w, NS_WAGON.d, NS_WAGON.h], [
    ['industrial', [I.iron, I.walnut]],
    ['modern', [M.black, M.white]],
    ['nordic', [N.white, N.oak]],
    ['cute', [C.white, C.mint]],
  ], nsWagon, {
    surfaces: NS_WAGON.levels.map((y, i) => ({ y: y + 1.6, h: (i === 0 ? NS_WAGON.levels[1] : NS_WAGON.h - 1.6) - y - 1.6, shape: [rectPoly(-NS_WAGON.w / 2 + 2.5, -NS_WAGON.d / 2 + 2.5, NS_WAGON.w / 2 - 2.5, NS_WAGON.d / 2 - 2.5)] })),
  }),
  ns('va-ns-tansu', '和风抽屉', [NS_TANSU.w, NS_TANSU.d + 1, NS_TANSU.h + 0.6], [
    ['japanese', [J.hinoki, J.sumi, J.dark]],
    ['japanese', [J.dark, '#2a2624', J.sumi]],
    ['retro', [R.caramel, '#3a3330', '#7a4a2a']],
    ['industrial', [I.walnut, I.iron, I.iron]],
  ], nsTansu, { surface: NS_TANSU.h, build: nsTansu, openable: true, surfaces: NS_TANSU_ROWS.map(([y, hh]) => trayLevel(nsTansuTray(y, hh))) }),
  ns('va-ns-candy', '糖果圆角', [NS_CANDY.w, 36.2, NS_CANDY.h], [
    ['cute', [C.sakura, C.white, C.woodL]],
    ['cute', [C.mint, C.lemon, C.woodL]],
    ['cute', [C.sky, C.white, C.white]],
    ['retro', [R.mustard, R.cream, R.caramel]],
  ], nsCandy, { build: nsCandy, openable: true, surfaces: NS_CANDY_YS.map((y) => trayLevel(nsCandyTray(y))) }),
]

const kb = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  prop(id, '刀架', 'kitchenware', dims, pals, fitted(build), { family: 'prop-knife-block', sizeLabel: label })

const KNIFE_BLOCKS: AssetDef[] = [
  kb('va-knife-magnet', '磁吸立板', [9, 20, 34.4], [
    ['nordic', [N.oak, M.black, N.oakL]],
    ['modern', [M.walnut, M.black, M.char]],
    ['japanese', [J.hinoki, J.dark, J.wood]],
    ['industrial', [I.walnut, I.iron, I.iron]],
  ], knifeMagnet),
  kb('va-knife-tub', '插刀筒', [13, 20.8, 25], [
    ['modern', [M.char, M.black, M.silver]],
    ['modern', [M.white, M.black, M.gray]],
    ['cute', [C.mint, C.white, C.white]],
    ['retro', [R.red, R.cream, R.cream]],
  ], knifeTub),
  kb('va-knife-rack', '和风刀台', [12.8, 23, 23], [
    ['japanese', [J.hinoki, J.dark, J.wood]],
    ['japanese', [J.dark, '#d9c9a8', J.sumi]],
    ['nordic', [N.oakL, M.black, N.oak]],
  ], knifeRack),
  kb('va-knife-acrylic', '亚克力', [11, 20, 31], [
    ['modern', [GLASS, M.black, M.char]],
    ['modern', ['#e8f0f5', M.white, M.silver]],
    ['cute', ['#ffe3ec', C.pink, C.white]],
  ], knifeAcrylic),
]

const plush = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  prop(id, '毛绒玩偶', 'deco', dims, pals, fitted(build), { family: 'bear', sizeLabel: label })

const PLUSHES: AssetDef[] = [
  plush('va-plush-bunny', '兔子', [26, 24.5, 48.5], [
    ['cute', [C.white, C.white, C.pink]],
    ['cute', [C.sakura, C.white, C.pink]],
    ['nordic', [N.linen, N.white, '#e8c4c4']],
    ['modern', [M.light, M.white, M.gray]],
    ['retro', ['#c99a6e', R.cream, '#e8a0a0']],
  ], plushBunny),
  plush('va-plush-cat', '猫', [30.7, 22.5, 41.6], [
    ['cute', ['#f2b56b', C.white, C.pink]],
    ['nordic', [N.gray, N.white, N.blue]],
    ['modern', ['#4a4a50', M.white, R.red]],
    ['japanese', [J.washi, C.white, J.shu]],
  ], plushCat),
  plush('va-plush-dino', '恐龙', [27.1, 30.2, 41.3], [
    ['cute', [C.mint, C.lemon, C.pink]],
    ['cute', [C.lilac, C.white, C.lemon]],
    ['retro', [R.olive, R.cream, R.orange]],
    ['nordic', [N.sage, N.linen, N.mustard]],
  ], plushDino),
  plush('va-plush-penguin', '企鹅', [28.4, 24, 34], [
    ['cute', ['#4a5a78', C.white, C.pink]],
    ['cute', [C.sky, C.white, C.lemon]],
    ['nordic', ['#6f7f8f', N.white, N.mustard]],
    ['modern', [M.black, M.white, R.red]],
  ], plushPenguin),
  plush('va-plush-shiba', '柴犬', [27.1, 26.2, 40.2], [
    ['japanese', ['#e0a060', '#fbf3e6', J.shu]],
    ['japanese', ['#4a3c34', '#f0e2c8', J.ai]],
    ['cute', ['#f2d2a0', C.white, C.pink]],
    ['retro', ['#d48a4a', R.cream, R.teal]],
  ], plushShiba),
]

const vase = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  prop(id, '花瓶插花', 'tabletop', dims, pals, fitted(build), { family: 'prop-vase-flowers', sizeLabel: label })

const VASES: AssetDef[] = [
  vase('va-vase-bud', '一轮插', [10.8, 10.8, 30.4], [
    ['japanese', [J.ai, J.shu, J.washi]],
    ['nordic', [N.white, C.pink, N.oak]],
    ['modern', [M.black, M.white, M.silver]],
    ['retro', [R.mustard, R.red, R.cream]],
  ], vaseBud),
  vase('va-vase-ikebana', '生花水盘', [15.2, 10, 27.2], [
    ['japanese', [J.sumi, J.shu, J.dark]],
    ['japanese', [J.washi, C.pink, J.dark]],
    ['modern', [M.char, M.white, M.black]],
  ], vaseIkebana),
  vase('va-vase-jar', '满天星玻璃瓶', [12.2, 11.4, 27.5], [
    ['nordic', [GLASS, N.white, N.sage]],
    ['cute', [GLASS, C.sakura, C.pink]],
    ['cute', [GLASS, C.lilac, C.lilac]],
    ['retro', ['#ffe8b8', R.cream, R.orange]],
  ], vaseJar),
  vase('va-vase-pampas', '陶罐蒲苇', [13.4, 12.4, 42.8], [
    ['nordic', [N.white, '#efe2c8', '#b89a70']],
    ['modern', [M.char, '#e8dcc4', '#8a7058']],
    ['industrial', [I.concrete, '#d8c8a8', I.walnut]],
    ['japanese', [J.sumi, '#efe2c8', J.dark]],
  ], vasePampas),
  vase('va-vase-milk', '牛奶罐', [14.6, 12.1, 35.5], [
    ['retro', [R.cream, R.teal, '#ffcc33']],
    ['industrial', ['#a9b0b5', I.iron, '#ffcc33']],
    ['cute', [C.white, C.sky, C.lemon]],
    ['nordic', [N.white, N.blue, N.mustard]],
  ], vaseMilk),
]

const lb = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  define(id, '洗衣篮', 'storage', dims, pals, fitted(build), { family: 'laundry-basket', sizeLabel: label })

const LAUNDRY_BASKETS: AssetDef[] = [
  lb('va-lb-rattan', '藤编', [45.6, 36.5, 38.7], [
    ['japanese', ['#c9a46a', J.wood, J.ai]],
    ['nordic', ['#d8bf94', N.oak, N.sage]],
    ['retro', ['#b8834a', R.caramel, R.mustard]],
    ['cute', ['#ead3ae', C.woodL, C.pink]],
  ], lbRattan),
  lb('va-lb-fold', '折叠布篮', [44, 39, 44], [
    ['nordic', [N.linen, N.gray, N.blue]],
    ['cute', [C.sakura, C.white, C.lemon]],
    ['modern', [M.light, M.char, M.white]],
    ['japanese', [J.ai, J.washi, J.shu]],
  ], lbFold),
  lb('va-lb-hip', '腰挎塑料', [47.4, 39.4, 30], [
    ['cute', [C.sky, C.pink]],
    ['cute', [C.mint, C.lemon]],
    ['modern', [M.white, M.light]],
    ['retro', [R.orange, R.cream]],
  ], lbHip),
  lb('va-lb-wire', '铁丝筐', [45.8, 38, 36.4], [
    ['industrial', [I.iron, I.walnut, I.rust]],
    ['modern', [M.white, M.walnut, M.light]],
    ['nordic', [N.white, N.oak, N.blue]],
    ['retro', [R.teal, R.caramel, R.mustard]],
  ], lbWire),
]

const hp = (id: string, label: string, dims: Dims, pals: Pal[], build: Build, form: 'open' | 'closed') =>
  prop(id, '脏衣篓', 'storage', dims, pals, fitted(build), { family: 'hamper', sizeLabel: label, form })

const WICKER_PALS: Pal[] = [
  ['japanese', ['#c9a46a', J.dark, J.ai]],
  ['nordic', ['#d8bf94', N.oak, N.blue]],
  ['retro', ['#b8834a', R.caramel, R.mustard]],
  ['cute', ['#ead3ae', C.woodL, C.pink]],
]
const SPLIT_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.light]],
  ['modern', [M.light, M.gray, M.white]],
  ['cute', [C.white, C.pink, C.sky]],
  ['nordic', [N.white, N.blue, N.sage]],
]
const BAMBOO_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.dark, J.washi]],
  ['japanese', ['#b89a5a', J.sumi, J.ai]],
  ['nordic', [N.oakL, N.oak, N.linen]],
]
const HAMPERS: AssetDef[] = [
  hp('va-hamper-wicker-closed', '藤编椭圆', [37.5, 31.8, 56.3], WICKER_PALS, hamperWickerClosed, 'closed'),
  hp('va-hamper-wicker-open', '藤编椭圆', [37, 31, 52], WICKER_PALS, hamperWickerOpen, 'open'),
  hp('va-hamper-canvas', '帆布支架', [40, 34, 62], [
    ['nordic', [N.linen, N.oak, N.blue]],
    ['industrial', ['#8a8a78', I.walnut, I.rust]],
    ['modern', [M.light, M.black, M.char]],
    ['japanese', [J.washi, J.wood, J.ai]],
  ], hamperCanvas, 'open'),
  hp('va-hamper-split-closed', '双格分类', [40.8, 32.8, 56.4], SPLIT_PALS, hamperSplitClosed, 'closed'),
  hp('va-hamper-split-open', '双格分类', [41.4, 32.8, 54], SPLIT_PALS, hamperSplitOpen, 'open'),
  hp('va-hamper-bamboo-closed', '竹编方篓', [38, 34, 58], BAMBOO_PALS, hamperBambooClosed, 'closed'),
  hp('va-hamper-bamboo-open', '竹编方篓', [37, 33, 54], BAMBOO_PALS, hamperBambooOpen, 'open'),
  hp('va-hamper-pop', '弹出布篓', [38, 36, 54], [
    ['cute', [C.white, C.pink, C.sky]],
    ['cute', [C.white, C.mint, C.lemon]],
    ['nordic', [N.linen, N.blue, N.sage]],
    ['retro', [R.cream, R.red, R.teal]],
  ], hamperPop, 'open'),
]

const lr = (id: string, label: string, L: RackLayout, pals: Pal[], build: Build) =>
  define(id, '洗衣机置物架', 'storage', [L.w, L.d, L.h], pals, fitted(build), {
    family: 'laundry-rack',
    sizeLabel: label,
    surface: L.top,
    surfaceShape: [rectPoly(-L.w / 2 + 3, -L.d / 2 + 2, L.w / 2 - 3, L.d / 2 - 2)],
    surfaces: rackSurfacesOf(L),
  })

const LAUNDRY_RACKS: AssetDef[] = [
  lr('va-lrack-ladder', '阶梯木梯', LR_LADDER, [
    ['nordic', [N.oak, N.oakL, N.white]],
    ['japanese', [J.hinoki, J.hinoki, J.dark]],
    ['retro', [R.caramel, R.cream, R.mustard]],
    ['industrial', [I.walnut, I.walnut, I.iron]],
  ], rackLadder),
  lr('va-lrack-tension', '顶天立地', LR_TENSION, [
    ['modern', [M.white, M.white, M.char]],
    ['modern', [M.black, M.walnut, M.black]],
    ['industrial', [I.iron, I.walnut, I.iron]],
    ['nordic', [N.white, N.oak, N.gray]],
  ], rackTension),
  {
    ...lr('va-lrack-cabinet', '带门上柜', LR_CAB, [
      ['modern', [M.white, M.silver, M.char]],
      ['japanese', [J.hinoki, J.wood, J.dark]],
      ['nordic', [N.white, N.oak, N.oak]],
      ['industrial', [I.walnut, I.iron, I.iron]],
    ], rackCabinet),
    surfaces: [...rackSurfacesOf(LR_CAB), ...LR_CAB_INSIDE],
    openable: true,
  },
  lr('va-lrack-mesh', '网格篮', LR_MESH, [
    ['industrial', [I.iron, I.steel, I.iron]],
    ['modern', [M.silver, M.silver, M.char]],
    ['modern', [M.black, M.char, M.black]],
    ['cute', [C.white, C.white, C.mint]],
  ], rackMesh),
  lr('va-lrack-cute', '圆角奶油', LR_CUTE, [
    ['cute', [C.white, C.sakura, C.pink]],
    ['cute', [C.cream, C.mint, C.lemon]],
    ['cute', [C.white, C.sky, C.lemon]],
    ['retro', [R.cream, R.mustard, R.orange]],
  ], rackCute),
]

const tbc = (id: string, label: string, dims: Dims, pals: Pal[], build: Build) =>
  prop(id, '刷牙杯', 'toiletry', dims, pals, fitted(build), { family: 'prop-toothbrush-cup', sizeLabel: label })

const TOOTHBRUSH_CUPS: AssetDef[] = [
  tbc('va-tb-holder', '立式牙刷架', [9, 6, 16.5], [
    ['modern', [M.white, M.char, M.gray]],
    ['nordic', [N.oak, N.blue, N.white]],
    ['cute', [C.mint, C.pink, C.sky]],
    ['japanese', [J.hinoki, J.ai, J.shu]],
  ], tbHolder),
  tbc('va-tb-mug', '带把宽口杯', [10.7, 7.8, 14.3], [
    ['cute', [C.lemon, C.pink, C.sky]],
    ['cute', [C.sakura, C.mint, C.lilac]],
    ['retro', [R.orange, R.teal, R.cream]],
    ['nordic', [N.sage, N.white, N.oak]],
  ], tbMug),
  tbc('va-tb-glass', '玻璃杯', [7.3, 6.8, 16.3], [
    ['nordic', [GLASS, N.blue, N.white]],
    ['modern', [GLASS, M.char, M.white]],
    ['cute', [GLASS, C.pink, C.mint]],
  ], tbGlass),
  tbc('va-tb-ceramic', '和风陶杯', [7.4, 7.4, 15.5], [
    ['japanese', [J.ai, '#c8a27a', J.washi]],
    ['japanese', ['#e8e0cc', '#b08060', J.shu]],
    ['retro', [R.teal, '#c8a27a', R.mustard]],
    ['industrial', ['#5a5a5c', '#a08060', I.rust]],
  ], tbCeramic),
]

const cc = (id: string, label: string, dims: Dims, pals: Pal[], build: Build, steamY: number) =>
  prop(id, '咖啡杯碟', 'kitchenware', dims, pals, build, { family: 'prop-coffee-cup', sizeLabel: label, fx: [{ kind: 'steam', x: 0, y: steamY, z: 0, scale: 0.55 }] })

const COFFEE_CUPS: AssetDef[] = [
  cc('va-coffee-latte', '拿铁宽口', [14, 14, 5.8], [
    ['nordic', [N.white, N.sage, M.silver]],
    ['cute', [C.sakura, C.white, M.silver]],
    ['modern', [M.char, M.char, M.silver]],
    ['retro', [R.mustard, R.cream, '#c8a24a']],
  ], coffeeLatte, 5.6),
  cc('va-coffee-espresso', '浓缩小杯', [10, 10, 4.4], [
    ['modern', [M.white, M.white, M.silver]],
    ['modern', [M.black, M.black, M.silver]],
    ['retro', [R.red, R.cream, M.silver]],
    ['nordic', [N.blue, N.white, M.silver]],
  ], coffeeEspresso, 4.3),
  cc('va-coffee-glass', '玻璃双层', [10.4, 10.4, 12], [
    ['nordic', [N.oak, GLASS, N.white]],
    ['modern', [M.walnut, GLASS, M.black]],
    ['industrial', [I.walnut, GLASS, I.iron]],
    ['cute', [C.woodL, GLASS, C.pink]],
  ], coffeeGlass, 8.2),
  cc('va-coffee-diner', '昭和厚瓷', [13.6, 13.6, 6.6], [
    ['retro', [R.cream, R.red, M.silver]],
    ['retro', [R.cream, R.teal, M.silver]],
    ['modern', [M.white, M.char, M.silver]],
    ['cute', [C.white, C.pink, M.silver]],
  ], coffeeDiner, 6.3),
  cc('va-coffee-yunomi', '和风陶杯', [12, 12, 7.4], [
    ['japanese', [J.ai, J.wood, '#c8a27a']],
    ['japanese', ['#e8e0cc', J.dark, '#b08060']],
    ['japanese', [J.sumi, J.hinoki, '#a08060']],
    ['industrial', ['#6a6460', I.walnut, '#a08060']],
  ], coffeeYunomi, 7.1),
]

export const VARIANTS_A: AssetDef[] = [
  ...AIRCON,
  ...STANDS,
  ...PLANTERS,
  ...TOILET_BRUSHES,
  ...NIGHTSTANDS,
  ...KNIFE_BLOCKS,
  ...PLUSHES,
  ...VASES,
  ...LAUNDRY_BASKETS,
  ...HAMPERS,
  ...LAUNDRY_RACKS,
  ...TOOTHBRUSH_CUPS,
  ...COFFEE_CUPS,
]
