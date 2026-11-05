// 素材制作工具箱：所有素材包（assets.ts、packs/*.ts）共用的类型、配色和小部件。
//
// 约定（写新素材前必读）：
//   - 单位 cm。局部坐标原点在占地中心的地面上：宽沿 x，进深沿 z，高沿 y。
//   - 背面（贴墙一侧）朝 -z，正面朝 +z。rbox / cyl / cup 等的 at.y 是底面高度，ball / torus 的 at.y 是中心。
//   - 描边由 addOutlines 统一加，build 里不用管；不想描边的小贴片设 userData.noOutline = true。
//   - 不要让两个面在同一平面上重叠（会闪烁）：贴在表面上的东西至少浮出 0.3cm，或者整体嵌进去。
//   - 容器（杯、碗、花盆、桶、箱）用 cup / tray 做成空心，里面的东西放在口沿以下。
//   - 只有玩偶、角色类才加 face()，家具和日用品不要加脸。
//   - 桌、柜等可以在上面摆东西的家具：本体保持空的，声明 surface（顶面高度），
//     不规则顶面再给 surfaceShape；桌上的东西做成独立的 prop 素材。

import * as THREE from 'three'
import { cached, cyl, gradientMap, rbox, shade, toon, useAnisotropy } from './toon'
import { syncMatrix } from './matrices'
import { G } from './geo'

export * from './assetMeta'
import { rectPoly, type Poly, type SurfaceDef } from './assetMeta'

/** 把若干对象放进一个新 Group（实现在 geo.ts，这里转出，老代码照旧从 kit 引入） */
export { G }

/** 竖直的屏幕 / 发光面板：用很薄的圆角盒，正面朝 +z */
export function glow(w: number, h: number, color: string, at: { x?: number; y: number; z: number; rx?: number; ry?: number }, k = 0.55) {
  const m = rbox(w, h, 0.6, color, at, 0.3)
  m.material = toon(color, { emissive: k })
  m.userData.noOutline = true
  return m
}

/** 四条腿 */
export function legs(w: number, d: number, h: number, color: string, r = 2.2, inset = 6, round = true) {
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const at = { x: sx * (w / 2 - inset), z: sz * (d / 2 - inset) }
      g.add(round ? cyl(r, r * 0.8, h, color, at, 12) : rbox(r * 2, h, r * 2, color, at, 0.6))
    }
  return g
}

/** 一根两端已知的细杆 */
export function rod(ax: number, ay: number, bx: number, by: number, r: number, color: string, z = 0) {
  const len = Math.hypot(bx - ax, by - ay)
  const m = cyl(r, r, len, color, {}, 8)
  m.position.set((ax + bx) / 2, (ay + by) / 2, z)
  m.rotation.z = Math.atan2(-(bx - ax), by - ay)
  return m
}


/** 按多边形挤出一块板（桌面、台面）：底面在 y，厚 t，带一点倒角（倒角往里收，轮廓不超出多边形） */
export function slab(poly: Poly, t: number, color: THREE.ColorRepresentation, y = 0) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const bevel = Math.min(1, t * 0.25)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2 })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, bevel, 0)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.y = y
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ---------- 真开口：带洞的板、空心外壳 ----------

/**
 * 洞的形状（板的局部坐标：x 以板中心为 0，y 以板底为 0）
 *   circle：圆心 (x, y)，半径 r
 *   rect  ：底边中点 (x, y)，宽 w 高 h，圆角 r
 *   arch  ：底边中点 (x, y)，宽 w 高 h，顶部是半圆（狗窝门、猫窝入口）
 */
export type Hole =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { kind: 'arch'; x: number; y: number; w: number; h: number }

function holePath(h: Hole) {
  const p = new THREE.Path()
  if (h.kind === 'circle') {
    p.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true)
  } else if (h.kind === 'arch') {
    const r = h.w / 2
    const top = h.y + Math.max(h.h - r, 0)
    p.moveTo(h.x - r, h.y)
    p.lineTo(h.x - r, top)
    p.absarc(h.x, top, r, Math.PI, 0, true)
    p.lineTo(h.x + r, h.y)
    p.lineTo(h.x - r, h.y)
  } else {
    const r = Math.min(h.r ?? 2, h.w / 2, h.h / 2)
    const x0 = h.x - h.w / 2
    const x1 = h.x + h.w / 2
    const y0 = h.y
    const y1 = h.y + h.h
    p.moveTo(x0 + r, y0)
    p.absarc(x0 + r, y0 + r, r, -Math.PI / 2, -Math.PI, true)
    p.lineTo(x0, y1 - r)
    p.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true)
    p.lineTo(x1 - r, y1)
    p.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true)
    p.lineTo(x1, y0 + r)
    p.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true)
  }
  return p
}

/**
 * 带洞的板：在 xy 平面里，宽 w（x 居中）、高 h（底边在 y = 0）、厚 t（z 居中），可以开多个真正透光的洞。
 * at 和 rbox 一样：at.y 是底面；ry 转 90° 就能当侧板用。
 */
export function holePanel(w: number, h: number, t: number, color: THREE.ColorRepresentation, holes: Hole[] = [], at: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number } = {}, corner = 1.5) {
  const r = Math.min(corner, w / 2, h / 2)
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, 0)
  s.lineTo(w / 2 - r, 0)
  s.quadraticCurveTo(w / 2, 0, w / 2, r)
  s.lineTo(w / 2, h - r)
  s.quadraticCurveTo(w / 2, h, w / 2 - r, h)
  s.lineTo(-w / 2 + r, h)
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - r)
  s.lineTo(-w / 2, r)
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0)
  for (const hole of holes) s.holes.push(holePath(hole))
  const bevel = Math.min(0.4, t * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 16 })
  geo.translate(0, 0, -t / 2 + bevel)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 空心外壳：外尺寸 w × h × d、壁厚 t，原点在底面中心。每个面可以开洞（洞坐标用该面自己的局部坐标，从外面看）。
 * top / bottom 为 false 时不封顶 / 不封底（盒子、花箱、猫砂盆盆体）。
 */
export function shell(
  w: number,
  h: number,
  d: number,
  t: number,
  color: THREE.ColorRepresentation,
  opts: { front?: Hole[]; back?: Hole[]; left?: Hole[]; right?: Hole[]; top?: boolean; bottom?: boolean } = {},
) {
  const g = new THREE.Group()
  const y0 = opts.bottom === false ? 0 : t
  const ih = h - y0 - (opts.top === false ? 0 : t)
  // 前后板盖住全宽，左右板夹在中间
  g.add(holePanel(w, ih, t, color, (opts.front ?? []).map((o) => ({ ...o, y: o.y - y0 })), { y: y0, z: d / 2 - t / 2 }))
  g.add(holePanel(w, ih, t, color, (opts.back ?? []).map((o) => ({ ...o, x: -o.x, y: o.y - y0 })), { y: y0, z: -d / 2 + t / 2, ry: Math.PI }))
  g.add(holePanel(d - t * 2, ih, t, color, (opts.right ?? []).map((o) => ({ ...o, y: o.y - y0 })), { x: w / 2 - t / 2, y: y0, ry: Math.PI / 2 }))
  g.add(holePanel(d - t * 2, ih, t, color, (opts.left ?? []).map((o) => ({ ...o, y: o.y - y0 })), { x: -w / 2 + t / 2, y: y0, ry: -Math.PI / 2 }))
  if (opts.bottom !== false) g.add(rbox(w, t, d, color, {}, Math.min(t * 0.4, 1)))
  if (opts.top !== false) g.add(rbox(w, t, d, color, { y: h - t }, Math.min(t * 0.4, 1)))
  return g
}

// ---------- 画面：相框里的照片、挂画、屏幕画面 ----------

const paintCache = new Map<string, THREE.CanvasTexture>()
const paintMats = new Map<string, THREE.MeshToonMaterial>()

/**
 * 画布面板：在 w × h（cm）的竖直面板上用 Canvas 作画，正面朝 +z，at.y 为底边。
 * 画面天然被裁在面板范围内，不会像拼贴小网格那样溢出画框。key 相同的画面共用贴图。
 * emissive > 0 时自发光（屏幕）。不描边。
 * 材质（按贴图 + 自发光）和几何（按尺寸）都是全局共用的：要改材质属性（抠形、polygonOffset…）先 clone 再改。
 */
export function paintPanel(
  w: number,
  h: number,
  key: string,
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
  at: { x?: number; y?: number; z?: number; rx?: number; ry?: number } = {},
  emissive = 0,
) {
  const pxPerCm = Math.min(12, 512 / Math.max(w, h))
  const W = Math.max(16, Math.round(w * pxPerCm))
  const H = Math.max(16, Math.round(h * pxPerCm))
  const k = `${key}|${W}x${H}`
  let tex = paintCache.get(k)
  if (!tex) {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    draw(cv.getContext('2d')!, W, H)
    tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    useAnisotropy(tex)
    paintCache.set(k, tex)
  }
  const geo = cached(`pp${w},${h}`, () => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0))
  const mk = `${k}|${emissive}`
  let mat = paintMats.get(mk)
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ map: tex, color: '#ffffff', gradientMap: gradientMap() })
    if (emissive > 0) {
      mat.emissive = new THREE.Color('#ffffff')
      mat.emissiveMap = tex
      mat.emissiveIntensity = emissive
    }
    paintMats.set(mk, mat)
  }
  const m = new THREE.Mesh(geo, mat)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, 0)
  m.userData.noOutline = true
  m.receiveShadow = true
  return m
}

/** 现成的画：风景（天空、远山、近山、太阳、云） */
export function paintLandscape(sky: string, hill: string, sun: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    g.fillStyle = sun
    g.beginPath()
    g.arc(W * 0.72, H * 0.3, Math.min(W, H) * 0.12, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    for (const [x, y, r] of [
      [0.2, 0.22, 0.07],
      [0.28, 0.2, 0.09],
      [0.36, 0.23, 0.06],
    ]) {
      g.beginPath()
      g.arc(W * x, H * y, Math.min(W, H) * r, 0, Math.PI * 2)
      g.fill()
    }
    const mountain = (cx: number, top: number, half: number, color: string) => {
      g.fillStyle = color
      g.beginPath()
      g.moveTo(W * (cx - half), H)
      g.lineTo(W * cx, H * top)
      g.lineTo(W * (cx + half), H)
      g.closePath()
      g.fill()
    }
    mountain(0.32, 0.38, 0.5, shade(hill, 0.18))
    mountain(0.78, 0.55, 0.45, hill)
    // 雪顶
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(W * 0.32, H * 0.38)
    g.lineTo(W * (0.32 - 0.1), H * (0.38 + 0.124))
    g.lineTo(W * (0.32 + 0.1), H * (0.38 + 0.124))
    g.closePath()
    g.fill()
  }
}

/** 现成的画：一枝花 */
export function paintFlower(ground: string, petal: string, center: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    const cx = W / 2
    const cy = H * 0.35
    const r = Math.min(W, H) * 0.11
    g.strokeStyle = '#4f9e5b'
    g.lineWidth = Math.max(2, W * 0.03)
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx, H * 0.86)
    g.stroke()
    g.fillStyle = '#78c47a'
    for (const s of [-1, 1]) {
      g.beginPath()
      g.ellipse(cx + s * W * 0.1, H * 0.6, W * 0.11, H * 0.035, -s * 0.5, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = petal
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2
      g.beginPath()
      g.arc(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2, r, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = center
    g.beginPath()
    g.arc(cx, cy, r * 0.75, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = shade(ground, -0.12)
    g.fillRect(cx - W * 0.16, H * 0.82, W * 0.32, H * 0.12)
  }
}

/** 现成的画：几何抽象（大圆 + 色块 + 横线） */
export function paintAbstract(ground: string, a: string, line: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = ground
    g.fillRect(0, 0, W, H)
    g.fillStyle = a
    g.beginPath()
    g.arc(W * 0.36, H * 0.42, Math.min(W, H) * 0.26, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = shade(a, -0.25)
    g.fillRect(W * 0.58, H * 0.3, W * 0.24, H * 0.55)
    g.fillStyle = line
    g.fillRect(W * 0.12, H * 0.74, W * 0.6, Math.max(2, H * 0.035))
    g.fillStyle = shade(a, 0.2)
    g.beginPath()
    g.arc(W * 0.8, H * 0.18, Math.min(W, H) * 0.07, 0, Math.PI * 2)
    g.fill()
  }
}

// ---------- 柜门、抽屉：可开合的部件 ----------

/**
 * 开合动作（挂在门扇 / 抽屉的 Group 的 userData.door 上，poseDoors 按家具的 open 状态摆）：
 *   swing ：平开门，绕 Group 原点的竖轴转 angle 弧度（three.js rotation.y 的增量；铰链在左、门往 +x 伸的，往外开是负角）
 *   slide ：推拉门，沿 x 平移 dx
 *   drawer：抽屉，沿 +z 拉出 dz
 *   flap  ：翻门 / 翻斗，绕 Group 原点的横轴转 angle 弧度（rotation.x 的增量；底边铰链往外翻是正角）
 */
export type DoorMotion = { kind: 'swing'; angle: number } | { kind: 'slide'; dx: number } | { kind: 'drawer'; dz: number } | { kind: 'flap'; angle: number }

/** 把一个部件标成会动的（门扇、抽屉…）。部件本身的 position / rotation 是关着时的位姿 */
export function movable<T extends THREE.Object3D>(o: T, m: DoorMotion): T {
  o.userData.door = m
  return o
}


/** 按开 / 关摆好模型里所有会动的部件（可以反复调用，不会累积） */
export function poseDoors(root: THREE.Object3D, open: boolean) {
  for (const o of doorParts(root)) poseDoor(o, open ? 1 : 0)
}

/** 模型里会动的部件（门扇、抽屉…），按遍历顺序：同一件素材的模型顺序固定，下标可以当部件的编号 */
export function doorParts(root: THREE.Object3D) {
  const out: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.userData.door) out.push(o)
  })
  return out
}

/** 把一个会动的部件摆到开合程度 open（0 = 关着，1 = 开到底，中间按比例） */
export function poseDoor(o: THREE.Object3D, open: number) {
  const m = o.userData.door as DoorMotion
  const base = (o.userData.doorBase ??= { p: o.position.clone(), r: o.rotation.clone() }) as { p: THREE.Vector3; r: THREE.Euler }
  o.position.copy(base.p)
  o.rotation.copy(base.r)
  if (m.kind === 'swing') o.rotation.y += m.angle * open
  else if (m.kind === 'flap') o.rotation.x += m.angle * open
  else if (m.kind === 'slide') o.position.x += m.dx * open
  else o.position.z += m.dz * open
  // 静态矩阵（freezeMatrices）的模型也要跟着变
  if (!o.matrixAutoUpdate) syncMatrix(o)
}

/** 模型里会动的部件个数 */
export function countDoors(root: THREE.Object3D) {
  let n = 0
  root.traverse((o) => {
    if (o.userData.door) n++
  })
  return n
}

/** 平开门开到多少度（弧度）：约 100°，门扇转到柜子侧面外，里面看得清 */
export const SWING_OPEN = (100 * Math.PI) / 180

/**
 * 柜体（正面敞开的箱子）：背板、两侧、顶板、底板，外尺寸 w × h × d，板厚 t，原点在底面中心、正面朝 +z。
 * base 为踢脚 / 底座高度（底板抬到 base 上，下面是一块缩进的踢脚板）。门、抽屉另外做，层板用 shelvesIn。
 */
export function carcass(w: number, h: number, d: number, color: string, opts: { t?: number; base?: number; plinth?: string; back?: string; top?: boolean } = {}) {
  const t = opts.t ?? 1.8
  const base = opts.base ?? 0
  const g = new THREE.Group()
  g.add(rbox(w - t * 2, h - base - t, t, opts.back ?? shade(color, -0.04), { y: base, z: -d / 2 + t / 2 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(t, h, d, color, { x: (s * (w - t)) / 2 }, 0.3))
  if (opts.top !== false) g.add(rbox(w - t * 2 + 0.01, t, d, color, { y: h - t }, 0.3))
  g.add(rbox(w - t * 2, t, d - t, color, { y: base, z: t / 2 }, 0.3))
  if (base > 0) g.add(rbox(w - t * 2, base, d - 4, opts.plinth ?? shade(color, -0.12), { z: -1 }, 0.3))
  return g
}

/** 柜内层板：每个 y 是层板顶面高度（= surfaces 的 y），柜体外宽 w、外深 d，侧板厚 t */
export function shelvesIn(w: number, d: number, ys: number[], color: string, t = 1.8, th = 1.6) {
  const g = new THREE.Group()
  for (const y of ys) g.add(rbox(w - t * 2 - 0.2, th, d - t - 0.6, color, { y: y - th, z: t / 2 - 0.3 }, 0.3))
  return g
}

/** 柜内一根挂衣杆（两端杆座）：x0..x1、杆中心高 y、进深位置 z */
export function hangingPipe(x0: number, x1: number, y: number, z: number, color = '#d9dee6', r = 1.4) {
  const g = new THREE.Group()
  const pipe = cyl(r, r, x1 - x0, color, {}, 14)
  pipe.position.set((x0 + x1) / 2, y, z)
  pipe.rotation.z = Math.PI / 2
  g.add(pipe)
  for (const x of [x0 + 0.5, x1 - 0.5]) {
    const seat = cyl(r + 0.8, r + 0.8, 1, color, {}, 12)
    seat.position.set(x, y, z)
    seat.rotation.z = Math.PI / 2
    g.add(seat)
  }
  return g
}

/**
 * 挂衣杆的挂钩层（和 surface.ts 里旧内置收纳的写法一致）：挂点带沿杆、窄窄一条，钩环内顶搭在杆顶。
 * clear 为杆下净空（衣服长度上限）。
 */
export function pipeHook(x0: number, x1: number, y: number, z: number, clear: number, r = 1.4): SurfaceDef {
  return { y: y + r + 0.45, kind: 'hook', inside: true, h: clear, shape: [rectPoly(x0 + 2, z - 1.7, x1 - 2, z + 1.3)] }
}

/**
 * 平开门扇：门洞 x0..x1 × y0..y1，门板正面在 z（门板厚 th，背面贴着柜体正面）。
 * hinge 为铰链在哪一侧，把手在另一侧。panel 可以换成别的门板做法（玻璃、格栅…）：参数为门板宽高，
 * 返回的部件以门板中心底边为原点（x 居中、y 从 0 起、z 居中）。返回已标好 swing 动作的 Group（原点在铰链线上）。
 */
export function hingedDoor(o: {
  x0: number
  x1: number
  y0: number
  y1: number
  z: number
  hinge: 'left' | 'right'
  color: string
  th?: number
  gap?: number
  knob?: string | false
  knobY?: number
  angle?: number
  panel?: (w: number, h: number) => THREE.Object3D[]
}) {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const left = o.hinge === 'left'
  const leaf = new THREE.Group()
  const inner = new THREE.Group()
  for (const m of o.panel ? o.panel(w, h) : [rbox(w, h, th, o.color, {}, 0.5)]) inner.add(m)
  if (o.knob !== false) {
    // 把手：高柜在离地 95 左右，矮柜在门的上部
    const kh = Math.min(10, h * 0.3)
    const ky = o.knobY ?? (o.y1 > 120 ? Math.min(Math.max(95 - o.y0, kh), h - kh - 2) : h - kh - Math.min(4, h * 0.15))
    inner.add(rbox(1.2, kh, 1.4, o.knob ?? '#c9ced6', { x: (left ? 1 : -1) * (w / 2 - 3), y: ky, z: th / 2 + 0.7 }, 0.4))
  }
  inner.position.set(left ? w / 2 : -w / 2, 0, 0)
  leaf.add(inner)
  leaf.position.set(left ? o.x0 + gap : o.x1 - gap, o.y0 + gap, o.z - th / 2)
  return movable(leaf, { kind: 'swing', angle: (left ? -1 : 1) * (o.angle ?? SWING_OPEN) })
}

/** 一排平开门：门洞 x0..x1 均分成 n 扇（默认每扇约 45 宽），左半边铰链在左、右半边在右（单扇铰链在 hinge 侧） */
export function doorRow(o: Omit<Parameters<typeof hingedDoor>[0], 'hinge'> & { n?: number; hinge?: 'left' | 'right' }) {
  const n = o.n ?? Math.max(1, Math.round((o.x1 - o.x0) / 45))
  const g = new THREE.Group()
  const dw = (o.x1 - o.x0) / n
  for (let i = 0; i < n; i++) {
    const hinge: 'left' | 'right' = n === 1 ? (o.hinge ?? 'left') : i < n / 2 ? 'left' : 'right'
    g.add(hingedDoor({ ...o, x0: o.x0 + dw * i, x1: o.x0 + dw * (i + 1), hinge }))
  }
  return g
}

/**
 * 翻门（上翻 / 下翻）：门洞 x0..x1 × y0..y1，门板正面在 z。hinge 'bottom' = 底边铰链往前放倒（电视柜翻门、写字台），
 * 'top' = 顶边铰链往上掀（吊柜上翻门）。
 */
export function flapDoor(o: { x0: number; x1: number; y0: number; y1: number; z: number; color: string; hinge: 'bottom' | 'top'; th?: number; gap?: number; knob?: string | false; angle?: number }) {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const g = new THREE.Group()
  const bottom = o.hinge === 'bottom'
  const panel = rbox(w, h, th, o.color, { y: bottom ? 0 : -h }, 0.5)
  g.add(panel)
  if (o.knob !== false) g.add(rbox(Math.min(12, w * 0.3), 1.2, 1.4, o.knob ?? '#c9ced6', { y: bottom ? h - 4 : -h + 3, z: th / 2 + 0.7 }, 0.4))
  g.position.set((o.x0 + o.x1) / 2, bottom ? o.y0 + gap : o.y1 - gap, o.z - th / 2)
  // 下翻放平（约 85°），上翻掀到 75° 左右
  return movable(g, { kind: 'flap', angle: bottom ? (o.angle ?? (85 * Math.PI) / 180) : -(o.angle ?? (75 * Math.PI) / 180) })
}

/**
 * 抽屉：抽屉口 x0..x1 × y0..y1，面板正面在 z，抽屉盒深 depth（往 -z）。打开时拉出 pull（默认 depth 的 0.6）。
 * 返回 Group（标好 drawer 动作）。抽屉格的 surfaces 用 drawerLevel 生成。
 */
export function drawerBox(o: { x0: number; x1: number; y0: number; y1: number; z: number; depth: number; color: string; inner?: string; th?: number; gap?: number; knob?: string | false; pull?: number; front?: (w: number, h: number) => THREE.Object3D[] }) {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const g = new THREE.Group()
  const inner = o.inner ?? shade(o.color, 0.06)
  for (const m of o.front ? o.front(w, h) : [rbox(w, h, th, o.color, { z: -th / 2 }, 0.5)]) g.add(m)
  // 抽屉盒：底板、两侧、后板（比面板矮一点）
  const bh = Math.max(2, h - 3)
  const bw = w - 2
  const bd = o.depth - th - 1
  g.add(rbox(bw, 1, bd, inner, { y: DRAWER_FLOOR - 1, z: -th - bd / 2 }, 0.2))
  for (const s of [-1, 1]) g.add(rbox(1, bh, bd, inner, { x: (s * (bw - 1)) / 2, y: DRAWER_FLOOR - 1, z: -th - bd / 2 }, 0.2))
  g.add(rbox(bw - 2, bh, 1, inner, { y: DRAWER_FLOOR - 1, z: -th - bd + 0.5 }, 0.2))
  if (o.knob !== false) g.add(rbox(Math.min(10, w * 0.3), 1.2, 1.4, o.knob ?? '#c9ced6', { y: Math.max(1, h / 2 - 0.6), z: 0.7 }, 0.4))
  g.position.set((o.x0 + o.x1) / 2, o.y0 + gap, o.z)
  return movable(g, { kind: 'drawer', dz: o.pull ?? drawerPull(o.depth) })
}

/** 抽屉默认拉出多少 */
const drawerPull = (depth: number) => Math.round(depth * 0.6)

/** 抽屉盒内底面离抽屉面板底边的高度（drawerBox 的底板顶面） */
export const DRAWER_FLOOR = 2

/**
 * 抽屉格的可摆放层：和 drawerBox 同样的参数，返回关着时的位置（surfaces 里的 y、shape），打开时按 slide 往前移。
 */
export function drawerLevel(o: { x0: number; x1: number; y0: number; y1: number; z: number; depth: number; th?: number; gap?: number; pull?: number }): SurfaceDef {
  const th = o.th ?? 1.6
  const gap = o.gap ?? 0.3
  const w = o.x1 - o.x0 - gap * 2
  const h = o.y1 - o.y0 - gap * 2
  const bw = w - 2
  const bd = o.depth - th - 1
  const cx = (o.x0 + o.x1) / 2
  return { y: o.y0 + gap + DRAWER_FLOOR, h: Math.max(2, h - 3), inside: true, slide: o.pull ?? drawerPull(o.depth), shape: [rectPoly(cx - bw / 2 + 1.2, o.z - th - bd + 1.2, cx + bw / 2 - 1.2, o.z - th - 0.2)] }
}

/**
 * 推拉门：门洞 x0..x1 × y0..y1 均分成 n 扇，前后两条轨道交错（偶数扇在前轨 z，奇数扇在后轨）。
 * 打开时前轨的门推到相邻后轨门的正前方（露出一半柜内）。
 */
export function slidingDoors(o: { x0: number; x1: number; y0: number; y1: number; z: number; color: string; n?: number; th?: number; panel?: (w: number, h: number) => THREE.Object3D[]; pull?: string | false }) {
  const n = o.n ?? 2
  const th = o.th ?? 1.8
  const g = new THREE.Group()
  const dw = (o.x1 - o.x0) / n
  const h = o.y1 - o.y0 - 0.6
  for (let i = 0; i < n; i++) {
    const front = i % 2 === 0
    // 相邻两扇在中间重叠 1.5cm
    const w = dw + 1.5
    const leaf = new THREE.Group()
    for (const m of o.panel ? o.panel(w, h) : [rbox(w, h, th, o.color, {}, 0.5)]) leaf.add(m)
    // 凹槽拉手（靠近和相邻门交错的一侧）
    if (o.pull !== false) leaf.add(rbox(1.6, Math.min(16, h * 0.4), 0.6, o.pull ?? shade(o.color, -0.25), { x: (front ? 1 : -1) * (w / 2 - 4), y: Math.max(1, Math.min(h / 2, 100 - o.y0) - 8), z: th / 2 + 0.1 }, 0.3))
    const cx = o.x0 + dw * (i + 0.5)
    leaf.position.set(Math.min(Math.max(cx, o.x0 + w / 2), o.x1 - w / 2), o.y0 + 0.3, o.z - th / 2 - (front ? 0 : th + 0.4))
    // 前轨的门往右边那扇推（最后一扇往左）
    const dir = i < n - 1 ? 1 : -1
    g.add(front ? movable(leaf, { kind: 'slide', dx: dir * dw }) : leaf)
  }
  return g
}
