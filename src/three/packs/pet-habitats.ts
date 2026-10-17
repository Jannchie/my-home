// 宠物住处素材包：仓鼠 / 兔 / 豚鼠 / 龙猫的笼子和围栏、鸟笼（挂起 / 台面 / 落地支架）、爬宠饲养箱、乌龟缸、金鱼缸、
// 狗笼和围栏、猫外出包、宠物饮水机。约定见 kit.ts 开头；id 统一用 ph- 前缀。
//   - 笼子的丝网是一根根真的细杆，里面看得见；细丝不描边（描边会让远处的网糊成一片），框架、角柱、门框照常描边。
//   - 玻璃 / 亚克力 / 水是半透明材质，不描边。
//   - 挂起形态（form: 'hanging'）：原点 = 挂点，笼顶吊环的内顶在 y = -0.5（正好套在挂钩上），
//     整件在原点正下方、xz 居中，最高点 ≈ 0。其余形态由 def() 统一落地并在 xz 上居中。
//   - 小动物是简单的 toon 造型（有眼睛，不加 face() 的腮红），静止摆在笼里；鱼和游泳的乌龟设 userData.swim，由 fx.ts 驱动。
//   - 一键布置：笼子带 limit（全屋各一只），由 household.ts 的 smallpets / birds 兴趣挑出来。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, glow, holePanel, rng, shell, type AssetDef } from '../kit'
import { P, PI, UP, noOutlineDeep, type V3 } from '../geo'
import { I, J, M, N, R, type Build, type Dims, type Pal } from '../packkit'

const WOOD = '#d9b07a'
const WOODD = '#a8774a'
const CHIP = '#efdcae'
const HAY = '#d6c26a'
const SEED = '#d9b56a'
const WATER = '#9fd8f0'
const CERAMIC = '#f7f4ee'
const STEEL = '#c3c7cc'
const BULB = '#ffd27a'

/** 小动物笼子：全屋最多一只（仓鼠 / 兔 / 豚鼠 / 龙猫共用一组） */
const SMALL_HOME = { scope: 'house' as const, max: 1, group: 'ph-small-pet-home' }
/** 鸟笼：全屋最多一只 */
const BIRD_HOME = { scope: 'house' as const, max: 1, group: 'ph-bird-cage' }

// ---------- 定义 ----------

function def(id: string, name: string, [w, d, h]: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  if (extra.form !== 'hanging') build = normalize(build)
  return {
    id,
    name,
    category: 'pets',
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
const prop = (id: string, name: string, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) => def(id, name, dims, pals, build, { prop: true, ...extra })

/** 落地并在 xz 上居中 */
function normalize(build: Build): Build {
  return (p) => {
    const g = build(p)
    g.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(g, true)
    g.position.x -= (b.min.x + b.max.x) / 2
    g.position.z -= (b.min.z + b.max.z) / 2
    g.position.y -= b.min.y
    return G(g)
  }
}

// ---------- 小工具 ----------

/** 只在 xz 上居中（挂起形态：吊环可能因门扣、抽屉把手略偏，整体挪回挂点正下方） */
function centerXZ(g: THREE.Object3D) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  g.position.x -= (b.min.x + b.max.x) / 2
  g.position.z -= (b.min.z + b.max.z) / 2
}

/** 半透明件（玻璃、亚克力、水）：整棵子树换成半透明材质、不描边 */
function clear<T extends THREE.Object3D>(o: T, color: string, a = 0.25): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    m.material = toon(color, { transparent: a })
    m.userData.noOutline = true
    m.castShadow = false
  })
  return o
}
function lit<T extends THREE.Object3D>(o: T, color: string, k = 0.8): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    m.material = toon(color, { emissive: k })
    m.userData.noOutline = true
  })
  return o
}

/** 两点之间的杆 */
function stick(a: V3, b: V3, r: number, color: string, seg = 8) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = cyl(r, r, dir.length(), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return m
}
/** 丝网的一根细丝：不描边 */
const wire = (a: V3, b: V3, r: number, color: string, castShadow = true) => {
  const m = noOutlineDeep(stick(a, b, r, color, 5))
  if (!castShadow) m.castShadow = false
  return m
}

/** 笼丝颜色：把配色的丝色压到中等明度——640px 常规取景下细丝才看得清，又不会和深色框架 / 背景糊在一起 */
function wireSteel(color: string) {
  const c = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return '#' + new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.2), Math.min(0.6, Math.max(0.44, hsl.l - 0.34))).getHexString()
}

/** 平滑管子（提手、软管、树枝） */
function tube(pts: V3[], r: number, color: string, seg?: number, caps = true) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal')
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg ?? Math.max(12, pts.length * 6), r, 10, false), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  if (!caps) return G(m)
  const a = pts[0]
  const b = pts[pts.length - 1]
  return G(m, ball(r, color, { x: a[0], y: a[1], z: a[2] }), ball(r, color, { x: b[0], y: b[1], z: b[2] }))
}

/** 圆弧杆：TorusGeometry 的一段，默认在 xy 平面里从 +x 开始逆时针转 arc */
const arcCache = new Map<string, THREE.TorusGeometry>()
function arcBar(r: number, tubeR: number, color: string, arc: number) {
  const key = `${r.toFixed(2)}|${tubeR.toFixed(2)}|${arc.toFixed(3)}`
  let geo = arcCache.get(key)
  if (!geo) {
    geo = new THREE.TorusGeometry(r, tubeR, 5, Math.max(6, Math.round(arc * 9)), arc)
    geo.userData.shared = true
    arcCache.set(key, geo)
  }
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  return m
}
/** 水平圆弧（xz 平面），从角度 t0 到 t1（角度 t 处的点 = (cos t, 0, sin t) · r），at y */
function hArc(r: number, tubeR: number, color: string, y: number, t0: number, t1: number) {
  const m = arcBar(r, tubeR, color, t1 - t0)
  m.rotation.x = PI / 2
  const g = G(m)
  g.rotation.y = -t0
  g.position.y = y
  return g
}

/** xy 平面里的矩形门框（四根杆 + 门扣），中心 (cx, cy)，z = 0；调用方再摆位置 / 转向 */
function frameXY(cx: number, cy: number, w: number, h: number, r: number, color: string, latch = true) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const g = G(
    stick([x0, y0, 0], [x1, y0, 0], r, color),
    stick([x1, y0, 0], [x1, y1, 0], r, color),
    stick([x1, y1, 0], [x0, y1, 0], r, color),
    stick([x0, y1, 0], [x0, y0, 0], r, color),
  )
  if (latch) g.add(rbox(1.4, 2.2, 0.8, color, { x: x1 - 0.2, y: cy - 1.1, z: 0.2 }, 0.3))
  return g
}

interface CageOpt {
  gap?: number
  r?: number
  frameR?: number
  rings?: number[]
  top?: boolean
  topGap?: number
  /** 细丝颜色（默认同框架色）：框架保持配色、细丝单独加深时用 */
  wireColor?: string
  /** 细丝是否投影（默认是）：高处的密网投影会在远处缩成摩尔纹，个别笼子关掉细丝投影 */
  wireShadow?: boolean
}
/** 方形丝网笼身：宽 w、深 d，从 y0 起高 h；竖丝间距 gap，rings 为中间横向加强圈的高度（绝对 y） */
function wireBox(w: number, d: number, y0: number, h: number, color: string, o: CageOpt = {}) {
  const g = new THREE.Group()
  const gap = o.gap ?? 1.4
  const r = o.r ?? 0.12
  const fr = o.frameR ?? 0.32
  const wc = o.wireColor ?? color
  const ws = o.wireShadow ?? true
  const x0 = -w / 2
  const x1 = w / 2
  const z0 = -d / 2
  const z1 = d / 2
  const y1 = y0 + h
  const nx = Math.max(1, Math.round(w / gap))
  const nz = Math.max(1, Math.round(d / gap))
  for (let i = 1; i < nx; i++) {
    const x = x0 + (w * i) / nx
    g.add(wire([x, y0, z0], [x, y1, z0], r, wc, ws), wire([x, y0, z1], [x, y1, z1], r, wc, ws))
  }
  for (let i = 1; i < nz; i++) {
    const z = z0 + (d * i) / nz
    g.add(wire([x0, y0, z], [x0, y1, z], r, wc, ws), wire([x1, y0, z], [x1, y1, z], r, wc, ws))
  }
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ])
    g.add(stick([x, y0, z], [x, y1, z], fr, color), ball(fr, color, { x, y: y1, z }))
  const loop = (y: number, rr: number) => {
    g.add(stick([x0, y, z0], [x1, y, z0], rr, color), stick([x0, y, z1], [x1, y, z1], rr, color))
    g.add(stick([x0, y, z0], [x0, y, z1], rr, color), stick([x1, y, z0], [x1, y, z1], rr, color))
  }
  loop(y0, fr)
  loop(y1, fr)
  for (const y of o.rings ?? []) loop(y, fr * 0.6)
  if (o.top !== false) {
    const tg = o.topGap ?? gap
    const n = Math.max(1, Math.round(d / tg))
    for (let i = 1; i < n; i++) {
      const z = z0 + (d * i) / n
      g.add(wire([x0, y1, z], [x1, y1, z], r, wc, ws))
    }
    g.add(stick([0, y1, z0], [0, y1, z1], fr * 0.7, color))
  }
  return g
}

/** 圆顶鸟笼身：半径 rr，竖丝从 y0 起高 hw，上面是半球形的圆顶（经线全部收在顶点） */
function domeCage(rr: number, y0: number, hw: number, color: string, n = 40, r = 0.12, fr = 0.3) {
  const g = new THREE.Group()
  const yTop = y0 + hw
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    const x = Math.cos(a) * rr
    const z = -Math.sin(a) * rr
    g.add(wire([x, y0, z], [x, yTop, z], r, color))
    const m = noOutlineDeep(arcBar(rr, r, color, PI / 2))
    const mg = G(m)
    mg.rotation.y = a
    mg.position.y = yTop
    g.add(mg)
  }
  for (const y of [y0, yTop]) g.add(torus(rr, fr, color, { y, rx: PI / 2 }))
  g.add(torus(rr, fr * 0.6, color, { y: y0 + hw * 0.55, rx: PI / 2 }))
  const k = Math.cos(PI / 4)
  g.add(torus(rr * k, fr * 0.6, color, { y: yTop + rr * k, rx: PI / 2 }))
  return g
}

/** 圆柱侧面上的一扇门框：中心角 t（+z 方向为 PI/2），半宽角 s，从 ya 到 yb */
function domeDoor(rr: number, t: number, s: number, ya: number, yb: number, color: string, fr = 0.32) {
  const g = new THREE.Group()
  const R2 = rr + 0.15
  for (const tt of [t - s, t + s]) {
    const x = Math.cos(tt) * R2
    const z = Math.sin(tt) * R2
    g.add(stick([x, ya, z], [x, yb, z], fr, color))
  }
  g.add(hArc(R2, fr, color, ya, t - s, t + s), hArc(R2, fr, color, yb, t - s, t + s))
  g.add(rbox(1.2, 2, 0.8, color, { x: Math.cos(t + s) * (R2 + 0.3), y: (ya + yb) / 2 - 1, z: Math.sin(t + s) * (R2 + 0.3), ry: -(t + s) + PI / 2 }, 0.3))
  return g
}

/** 透明盒：底 + 四壁，外尺寸 w × h × d，at y0 */
function clearBox(w: number, h: number, d: number, t: number, y0 = 0, a = 0.22, color = C.glass) {
  return clear(tray(w, h, d, t, color, { y: y0 }, 0.2), color, a)
}

/** 竖直三角板（xy 平面，底边 w、高 h，沿 z 厚 t） */
function tri(w: number, h: number, t: number, color: string) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)])
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false })
  geo.translate(0, 0, -t / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  return m
}

/** 小木屋：w × h × d 的盒子，正面拱门、侧面圆窗，人字屋顶（屋脊沿 z） */
function hut(w: number, h: number, d: number, wall: string, roof: string) {
  const g = new THREE.Group()
  g.add(shell(w, h, d, 0.8, wall, { top: false, bottom: false, front: [{ kind: 'arch', x: 0, y: 0.6, w: Math.min(5.5, w * 0.45), h: Math.min(6.5, h * 0.7) }], left: [{ kind: 'circle', x: 0, y: h * 0.55, r: Math.min(1.8, h * 0.18) }] }))
  const t = 0.55
  const rh = (w / 2) * Math.tan(t)
  const L = (w / 2 + 1.2) / Math.cos(t)
  for (const s of [-1, 1]) {
    const cx = s * (w / 4 + 0.3)
    g.add(rbox(L, 0.8, d + 1.6, roof, { x: cx, y: h + rh / 2 - 0.2, rz: -s * t }, 0.3))
  }
  for (const s of [-1, 1]) g.add(P(tri(w - 0.2, rh, 0.8, wall), 0, h - 0.05, s * (d / 2 - 0.4)))
  return g
}

/** 仓鼠跑轮：轮轴沿 z，半径 R、宽 depth；原点在支架底面中心 */
function wheel(rr: number, depth: number, color: string, standColor: string, standH: number) {
  const g = new THREE.Group()
  const cy = standH + rr
  g.add(P(cyl(rr, rr, 0.5, color, {}, 32), 0, cy, -depth / 2, PI / 2))
  g.add(torus(rr - 0.35, 0.4, color, { y: cy, z: depth / 2 }))
  const n = Math.round((2 * PI * rr) / 1.1)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    const x = Math.cos(a) * (rr - 0.35)
    const y = cy + Math.sin(a) * (rr - 0.35)
    g.add(wire([x, y, -depth / 2], [x, y, depth / 2], 0.16, color))
  }
  g.add(P(cyl(1.1, 1.1, 1.2, shade(color, -0.12), {}, 16), 0, cy, -depth / 2 - 0.8, PI / 2))
  const zs = -depth / 2 - 1.6
  for (const s of [-1, 1]) g.add(stick([s * rr * 0.6, 0.4, zs], [0, cy, zs], 0.45, standColor))
  g.add(stick([-rr * 0.6, 0.4, zs], [rr * 0.6, 0.4, zs], 0.4, standColor))
  return g
}

/** 吊挂水瓶：瓶身竖直，底部的吸管斜着伸向 -x；原点在瓶底中心 */
function bottle(rr: number, h: number, cap: string, nozzle = -1) {
  const g = new THREE.Group()
  g.add(clear(cyl(rr, rr, h, C.glass, {}, 16), C.glass, 0.35))
  g.add(clear(cyl(rr - 0.3, rr - 0.3, h * 0.7, WATER, { y: 0.2 }, 16), WATER, 0.45))
  g.add(cyl(rr + 0.15, rr + 0.15, 1.6, cap, { y: -1.2 }, 16))
  g.add(stick([0, -1.2, 0], [nozzle * 1.5, -4.2, 0], 0.25, STEEL))
  g.add(cyl(rr + 0.15, rr + 0.15, 0.8, cap, { y: h - 0.4 }, 16))
  return g
}

/** 陶瓷食盆（空心）+ 一点饲料 */
function bowl(rr: number, color: string, food = SEED) {
  const g = new THREE.Group()
  g.add(cup(rr, rr * 0.8, rr * 0.7, 0.5, color))
  g.add(cyl(rr - 0.7, rr - 0.9, 0.4, food, { y: rr * 0.7 - 1.2 }, 16))
  return g
}

/** 一撮木屑 / 干草碎：铺料顶面上的几粒小片 */
function chips(g: THREE.Group, w: number, d: number, y: number, color: string, n: number, seed: number) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++) {
    const m = rbox(0.9 + rand() * 0.8, 0.3, 0.5 + rand() * 0.4, shade(color, (rand() - 0.5) * 0.08), { x: (rand() - 0.5) * w, y: y - 0.1, z: (rand() - 0.5) * d, ry: rand() * PI }, 0.1)
    g.add(noOutlineDeep(m))
  }
}

// ---------- 小动物 ----------

function eyes(g: THREE.Group, r: number, x: number, y: number, z: number, closed = false) {
  for (const s of [-1, 1]) {
    if (closed) {
      g.add(noOutlineDeep(ball(r, '#3a2a2a', { x: s * x, y, z }, [1.1, 0.25, 0.5])))
      continue
    }
    g.add(noOutlineDeep(ball(r, '#2a2020', { x: s * x, y, z }, [1, 1.1, 0.7])))
    g.add(noOutlineDeep(ball(r * 0.35, '#ffffff', { x: s * x + r * 0.25, y: y + r * 0.35, z: z + r * 0.5 })))
  }
}

/** 仓鼠：原点在脚下，头朝 +z，约 7 × 9 × 6 cm */
function hamster(fur: string, sleep = false, belly = '#fffaf2') {
  const g = new THREE.Group()
  const sy = sleep ? 0.78 : 0.88
  g.add(ball(3.4, fur, { y: 2.9 }, [1.05, sy, 1.3]))
  g.add(ball(2.3, belly, { y: 2.3, z: 2.4 }, [1.15, 0.8, 0.8]))
  const ey = sleep ? 5.0 : 5.3
  for (const s of [-1, 1]) {
    g.add(ball(1, shade(fur, -0.06), { x: s * 1.7, y: ey, z: 1.7 }, [1, 1, 0.45]))
    g.add(noOutlineDeep(ball(0.6, '#f4b3b8', { x: s * 1.7, y: ey, z: 2.05 }, [1, 1, 0.3])))
  }
  eyes(g, 0.45, 1.35, 3.9, 3.78, sleep)
  g.add(noOutlineDeep(ball(0.35, '#f49aa6', { y: 3.25, z: 4.4 })))
  if (!sleep) for (const s of [-1, 1]) g.add(noOutlineDeep(ball(0.45, '#f6c6c0', { x: s * 1.1, y: 0.5, z: 3.3 }, [1, 0.6, 1.2])))
  return g
}

/** 兔子（揣手趴姿）：原点在脚下，头朝 +z，约 14 × 26 × 22 cm */
function bunny(fur: string, sub = '#fffaf2') {
  const g = new THREE.Group()
  g.add(ball(7, fur, { y: 6.2, z: -1 }, [1, 0.88, 1.35]))
  g.add(ball(5, fur, { y: 9.5, z: 7 }))
  g.add(ball(2.4, sub, { y: 8, z: 10.8 }, [1.2, 0.8, 0.7]))
  for (const s of [-1, 1]) {
    const ear = ball(2, fur, {}, [0.55, 2.2, 0.32])
    g.add(P(ear, s * 1.9, 15.6, 5.4, -0.25, 0, -s * 0.18))
    const inner = noOutlineDeep(ball(1.4, '#f6b8c0', {}, [0.5, 1.9, 0.2]))
    g.add(P(inner, s * 1.9, 15.5, 5.85, -0.25, 0, -s * 0.18))
  }
  eyes(g, 0.75, 3.3, 10.3, 10.35)
  g.add(noOutlineDeep(ball(0.5, '#f49aa6', { y: 8.7, z: 12.4 })))
  g.add(ball(2, sub, { y: 6, z: -10.3 }))
  return g
}

/** 豚鼠：原点在脚下，头朝 +z，约 11 × 19 × 10 cm */
function guineaPig(fur: string, patch: string) {
  const g = new THREE.Group()
  g.add(ball(5.5, fur, { y: 4.6 }, [1, 0.82, 1.6]))
  g.add(ball(3.3, patch, { y: 5.3, z: -4.6 }, [1.1, 0.85, 1.05]))
  g.add(ball(2.6, patch, { y: 6.2, z: 5.4 }, [1.2, 0.95, 1]))
  for (const s of [-1, 1]) g.add(ball(1.2, '#d9a28a', { x: s * 2.8, y: 8, z: 4.6 }, [0.8, 1, 0.35]))
  eyes(g, 0.55, 2.7, 6.8, 7.2)
  g.add(noOutlineDeep(ball(0.4, '#e8909a', { y: 5.6, z: 8.7 })))
  return g
}

/** 龙猫（毛丝鼠）坐姿：原点在脚下，头朝 +z，约 13 × 17 × 19 cm */
function chinchilla(fur: string) {
  const g = new THREE.Group()
  g.add(ball(6, fur, { y: 6 }, [1, 1.05, 1.05]))
  g.add(ball(3.6, '#f4f2ee', { y: 5.2, z: 3 }, [1.1, 1.2, 0.8]))
  g.add(ball(4.3, fur, { y: 12.3, z: 2.6 }))
  for (const s of [-1, 1]) {
    g.add(P(ball(2.5, fur, {}, [1, 1.05, 0.3]), s * 2.9, 16.4, 1.4, 0, 0, -s * 0.3))
    g.add(noOutlineDeep(P(ball(1.9, '#f2c4c4', {}, [1, 1, 0.2]), s * 2.9, 16.4, 1.62, 0, 0, -s * 0.3)))
  }
  eyes(g, 0.7, 1.9, 13, 6.1)
  g.add(noOutlineDeep(ball(0.35, '#e8909a', { y: 11.6, z: 6.9 })))
  g.add(ball(2.6, shade(fur, -0.05), { y: 3.2, z: -7 }, [0.9, 0.8, 1.5]))
  return g
}

/** 豹纹守宫：原点在脚下，头朝 +z */
function gecko(body: string) {
  const g = new THREE.Group()
  g.add(ball(2.4, body, { y: 1.5 }, [1, 0.6, 2.4]))
  g.add(ball(1.8, body, { y: 1.9, z: 6.3 }, [1.15, 0.8, 1.3]))
  g.add(ball(1.4, body, { y: 1.1, z: -7.2 }, [1, 0.7, 2.4]))
  const rand = rng(11)
  for (let i = 0; i < 9; i++) g.add(noOutlineDeep(ball(0.38, '#5a4030', { x: (rand() - 0.5) * 2.6, y: 2.75, z: -3.5 + i * 0.95 }, [1, 0.4, 1])))
  for (const [x, z] of [
    [2.2, 3.4],
    [-2.2, 3.4],
    [2.2, -3],
    [-2.2, -3],
  ])
    g.add(ball(0.7, body, { x, y: 0.5, z }, [1.2, 0.7, 1]))
  eyes(g, 0.55, 1.5, 2.5, 7.1)
  return g
}

/** 乌龟（巴西龟）：原点在腹甲底面，头朝 +z */
function turtle(shellC: string, skin = '#7a9a3e') {
  const g = new THREE.Group()
  g.add(ball(5, shellC, { y: 1.2 }, [1, 0.5, 1.25]))
  g.add(cyl(4.6, 4.6, 0.8, '#e8d49a', { y: 0 }, 24))
  g.add(ball(1.6, skin, { y: 1.8, z: 7 }, [1, 0.9, 1.2]))
  for (const s of [-1, 1]) g.add(noOutlineDeep(ball(0.5, '#d8483a', { x: s * 1.3, y: 1.8, z: 6.6 }, [0.4, 0.5, 1.2])))
  eyes(g, 0.32, 1.05, 2.3, 7.9)
  for (const [x, z] of [
    [3.8, 3.6],
    [-3.8, 3.6],
    [3.6, -3.6],
    [-3.6, -3.6],
  ])
    g.add(ball(1, skin, { x, y: 0.6, z }, [1.3, 0.5, 1]))
  return g
}

/** 金鱼（琉金）：头朝 +x，k 为缩放 */
function goldfish(color: string, k = 1, seed = 1) {
  const g = new THREE.Group()
  g.add(ball(1.6, color, {}, [1.3, 1.05, 0.65]))
  if (seed % 2) g.add(noOutlineDeep(ball(1, '#fbf6ee', { x: 0.5, y: 0.6, z: 0 }, [1.1, 0.6, 0.7])))
  for (const s of [-1, 1]) g.add(P(ball(1.4, color, {}, [1, 0.6, 0.12]), -2.6, s * 0.6, s * 0.35, 0, s * 0.35, s * 0.4))
  g.add(P(ball(0.9, color, {}, [1, 0.6, 0.12]), -0.2, 1.7, 0, 0, 0, -0.3))
  for (const s of [-1, 1]) {
    g.add(noOutlineDeep(ball(0.28, '#2a2020', { x: 1.45, y: 0.35, z: s * 0.82 }, [0.7, 1, 0.6])))
    g.add(noOutlineDeep(ball(0.1, '#ffffff', { x: 1.62, y: 0.45, z: s * 0.9 })))
  }
  g.scale.setScalar(k)
  return g
}

/** 青鳉：头朝 +x，约 3 cm */
function medaka(color = '#f0b562') {
  const g = new THREE.Group()
  g.add(ball(0.55, color, {}, [2.4, 0.75, 0.6]))
  g.add(P(ball(0.5, color, {}, [0.9, 0.7, 0.12]), -1.5, 0, 0))
  g.add(noOutlineDeep(ball(0.16, '#1f1a1a', { x: 0.95, y: 0.12, z: 0.25 })))
  g.add(noOutlineDeep(ball(0.16, '#1f1a1a', { x: 0.95, y: 0.12, z: -0.25 })))
  return g
}

/** 游动：把 obj 包一层，设 swim 参数 */
function swimmer(obj: THREE.Object3D, s: { rx: number; rz: number; cx?: number; cz?: number; y: number; speed: number; bob?: number }) {
  const w = G(obj)
  w.position.set((s.cx ?? 0) + s.rx, s.y, s.cz ?? 0)
  w.userData.swim = s
  return w
}

type BirdKind = 'budgie' | 'budgie-blue' | 'buncho' | 'buncho-white' | 'cockatiel'
const BIRDS: Record<BirdKind, { body: string; belly: string; head: string; wing: string; tail: string; beak: string; cheek: string; k: number }> = {
  budgie: { body: '#8fd35f', belly: '#a9e070', head: '#f4e36b', wing: '#5f9a45', tail: '#3f6fb5', beak: '#f0c27e', cheek: '#4a69c9', k: 1.15 },
  'budgie-blue': { body: '#7fb8ea', belly: '#9cc9f0', head: '#f7f6f0', wing: '#4d78a8', tail: '#2f4f8f', beak: '#f0c27e', cheek: '#6b5bc4', k: 1.15 },
  buncho: { body: '#8e939d', belly: '#c8b2ad', head: '#2e2e33', wing: '#7d828c', tail: '#2e2e33', beak: '#f2768a', cheek: '#f8f6f2', k: 1.1 },
  'buncho-white': { body: '#fbfaf6', belly: '#f6f3ec', head: '#fbfaf6', wing: '#efece5', tail: '#efece5', beak: '#f2768a', cheek: '#fbfaf6', k: 1.1 },
  cockatiel: { body: '#a6a6aa', belly: '#b8b8bb', head: '#f5dc6a', wing: '#8b8b90', tail: '#7a7a80', beak: '#d9c4a8', cheek: '#f08a3c', k: 1.45 },
}

/** 停在栖木上的小鸟：原点在脚底（= 栖木顶），头朝 +z */
function bird(kind: BirdKind) {
  const c = BIRDS[kind]
  const g = new THREE.Group()
  g.add(P(ball(2.1, c.body, {}, [1, 1.35, 1.05]), 0, 3.4, 0, 0.25))
  g.add(P(ball(1.7, c.belly, {}, [0.95, 1.1, 0.8]), 0, 3.0, 0.75, 0.25))
  g.add(ball(1.55, c.head, { y: 6.1, z: 0.6 }))
  for (const s of [-1, 1]) {
    g.add(noOutlineDeep(ball(0.5, c.cheek, { x: s * 1.1, y: 5.55, z: 1.25 }, [0.45, 1, 1])))
    g.add(P(ball(1.6, c.wing, {}, [0.35, 1.3, 1]), s * 1.8, 3.6, -0.4, 0.35))
  }
  g.add(P(cyl(0, 0.45, 1.1, c.beak, {}, 10), 0, 5.65, 2.05, PI / 2 + 0.35))
  eyes(g, 0.3, 1.2, 6.4, 1.15)
  g.add(rbox(1.4, 0.4, 5, c.tail, { y: 1.8, z: -2.7, rx: -0.6 }, 0.18))
  for (const s of [-1, 1]) g.add(noOutlineDeep(ball(0.45, '#e9a0a0', { x: s * 0.6, y: 0.25, z: 0.35 }, [1, 0.6, 1.6])))
  if (kind === 'cockatiel') for (const [dx, rx] of [[0, -0.5], [0.4, -0.3], [-0.4, -0.3]]) g.add(P(ball(1, c.head, {}, [0.22, 1.1, 0.4]), dx, 8.1, 0.2, rx))
  g.scale.setScalar(c.k)
  return g
}

// ======================================================================
// 仓鼠
// ======================================================================

/** 金属丝仓鼠笼：塑料底盆 + 丝网笼身，里面跑轮、小屋、水瓶、食盆、木屑，仓鼠睡在小屋旁 */
function hamsterWire(p: string[], W: number, D: number, HW: number) {
  const [base, wireC, acc] = p
  const g = new THREE.Group()
  const TB = W >= 55 ? 12 : 10
  g.add(tray(W, TB, D, 1.2, base, {}, 0.5))
  // 卡扣：底盆和笼身的连接
  for (const s of [-1, 1]) g.add(rbox(1, 3.2, 4, acc, { x: s * (W / 2 + 0.3), y: TB - 2.2 }, 0.3))
  g.add(rbox(W - 2.6, 4.2, D - 2.6, CHIP, { y: 1.2 }, 0.6))
  chips(g, W - 6, D - 6, 5.4, CHIP, 16, W)
  const y0 = TB + 0.3
  g.add(wireBox(W - 0.6, D - 0.6, y0, HW, wireC, { gap: 1.25, rings: [y0 + HW * 0.5] }))
  // 正面的门、顶上的提手
  g.add(P(frameXY(W * 0.18, y0 + 8, 14, 11, 0.3, wireC), 0, 0, D / 2 - 0.3 + 0.35))
  const top = y0 + HW
  g.add(stick([-6, top + 0.4, 0], [6, top + 0.4, 0], 0.35, wireC), stick([-6, top, 0], [-6, top + 0.4, 0], 0.35, wireC), stick([6, top, 0], [6, top + 0.4, 0], 0.35, wireC))
  // 跑轮（后左）、小屋（后右）、水瓶（右侧壁）、食盆（前左）
  const wr = W >= 55 ? 8.5 : 7
  g.add(P(wheel(wr, 6, acc, shade(acc, -0.15), 1.2), -W / 2 + wr + 3, 5.4, -D / 2 + 6.5))
  const hw = W >= 55 ? 13 : 10.5
  g.add(P(hut(hw, hw * 0.65, hw * 0.75, WOOD, shade(acc, -0.05)), W / 2 - hw / 2 - 3.5, 5.4, -D / 2 + hw * 0.4 + 2.5))
  g.add(P(bottle(1.8, 10, acc), W / 2 - 2.6, 13 + (W >= 55 ? 3 : 0), 3, 0, 0, 0))
  g.add(P(bowl(3, CERAMIC), -W / 4 + 2, 5.4, D / 4))
  // 仓鼠睡在小屋门口旁边
  g.add(P(hamster('#f0c08a', true), W / 2 - hw - 6, 5.4, D / 2 - 9.5, 0, -0.5))
  return g
}

/** 亚克力仓鼠箱：透明箱体 + 金属网盖，深垫料 */
function hamsterAcrylic(p: string[]) {
  const [frame, acc, sub] = p
  const g = new THREE.Group()
  const W = 60
  const D = 35
  const H = 30
  g.add(clearBox(W, H - 1, D, 0.5, 0, 0.2))
  // 四条竖边：亚克力的切边稍深一点（透明）
  // 网盖：外框（开两个大洞）+ 细丝网
  const lid = holePanel(W + 0.6, D + 0.6, 0.9, frame, [
    { kind: 'rect', x: -W / 4 + 0.4, y: 2.2, w: W / 2 - 3.6, h: D - 3.8, r: 0.6 },
    { kind: 'rect', x: W / 4 - 0.4, y: 2.2, w: W / 2 - 3.6, h: D - 3.8, r: 0.6 },
  ], { y: H - 0.45, z: (D + 0.6) / 2, rx: -PI / 2 }, 1)
  g.add(lid)
  for (let x = -W / 2 + 3; x <= W / 2 - 3; x += 1.2) g.add(wire([x, H - 0.45, -D / 2 + 2.1], [x, H - 0.45, D / 2 - 2.1], 0.1, STEEL))
  for (let z = -D / 2 + 2.6; z <= D / 2 - 2.6; z += 1.2) g.add(wire([-W / 2 + 2.1, H - 0.45, z], [W / 2 - 2.1, H - 0.45, z], 0.1, STEEL))
  // 深垫料
  g.add(rbox(W - 1.2, 9, D - 1.2, CHIP, { y: 0.5 }, 0.6))
  chips(g, W - 6, D - 6, 9.6, CHIP, 18, 7)
  g.add(P(wheel(8.5, 6.5, sub, shade(sub, -0.15), 1.2), -W / 2 + 12, 9.4, -D / 2 + 7))
  g.add(P(hut(13, 8.5, 10, WOOD, acc), W / 2 - 10, 9.4, -D / 2 + 7.5))
  // 沙浴盆
  g.add(P(cup(4.8, 4.6, 3.5, 0.4, CERAMIC), 4, 9.4, -D / 2 + 6.5))
  g.add(cyl(4.3, 4.2, 0.4, '#f1e6cc', { x: 4, y: 11.8, z: -D / 2 + 6.5 }, 20))
  // 水瓶架（角落立杆）+ 水瓶
  g.add(cyl(2.2, 2.4, 0.8, acc, { x: W / 2 - 4, y: 9.4, z: D / 2 - 4 }, 16))
  g.add(stick([W / 2 - 4, 9.4, D / 2 - 4], [W / 2 - 4, 25, D / 2 - 4], 0.35, acc))
  g.add(P(bottle(1.8, 9, acc), W / 2 - 6.2, 15.5, D / 2 - 4))
  g.add(P(bowl(2.8, CERAMIC), -6, 9.4, 6))
  g.add(P(hamster('#d8d0c8'), 6, 9.4, 7, 0, 0.4))
  return g
}

/** 多层仓鼠城堡：丝网主笼 + 屋顶二楼透明塔 + 地面瞭望舱，用透明管道连接 */
function hamsterCastle(p: string[]) {
  const [base, wireC, acc] = p
  const g = new THREE.Group()
  const cx = -9
  const W = 42
  const D = 30
  const main = new THREE.Group()
  main.add(tray(W, 10, D, 1.2, base, {}, 0.5))
  main.add(rbox(W - 2.6, 3.6, D - 2.6, CHIP, { y: 1.2 }, 0.6))
  chips(main, W - 6, D - 6, 4.8, CHIP, 10, 3)
  main.add(wireBox(W - 0.6, D - 0.6, 10.3, 20, wireC, { gap: 1.25 }))
  main.add(P(frameXY(-8, 18, 11, 9, 0.3, wireC), 0, 0, D / 2 - 0.3 + 0.35))
  main.add(P(wheel(7, 5.5, acc, shade(acc, -0.15), 1), -W / 2 + 10, 4.8, -D / 2 + 6))
  main.add(P(bowl(2.6, CERAMIC), 6, 4.8, 6))
  main.add(P(bottle(1.6, 8, acc), -W / 2 + 2.4, 15, 4))
  main.add(P(hamster('#f4f0ea', false), 10, 4.8, -2, 0, -0.6))
  main.position.x = cx
  g.add(main)
  // 二楼塔：彩色底座 + 透明圆筒 + 彩色圆顶
  const tx = -19
  const ty = 30.6
  g.add(cyl(7.6, 7.6, 2.2, acc, { x: tx, y: ty }, 28))
  g.add(clear(cyl(7, 7, 12, C.glass, { x: tx, y: ty + 2.2 }, 28), C.glass, 0.3))
  g.add(cyl(7.6, 7.6, 1.6, acc, { x: tx, y: ty + 14.2 }, 28))
  const dome = ball(7, acc, { x: tx, y: ty + 15.8 }, [1, 0.55, 1])
  g.add(dome)
  g.add(cyl(4.5, 4.5, 0.6, '#f3e3b8', { x: tx, y: ty + 2.2 }, 20))
  // 地面瞭望舱
  const px = 25
  g.add(cup(8, 8, 6, 1, acc, { x: px }))
  g.add(cyl(7, 7, 0.4, CHIP, { x: px, y: 1 }, 24))
  const half = new THREE.Mesh(new THREE.SphereGeometry(8, 28, 12, 0, PI * 2, 0, PI / 2), toon(C.glass, { transparent: 0.28 }))
  half.position.set(px, 6, 0)
  half.userData.noOutline = true
  g.add(half)
  g.add(torus(8, 0.5, shade(acc, -0.1), { x: px, y: 6, rx: PI / 2 }))
  g.add(P(hamster('#a8a0a0', true), px, 1.4, 1, 0, 0.8))
  // 管道：主笼右壁 → 瞭望舱；二楼塔 → 主笼屋顶
  const tubeA: V3[] = [
    [cx + W / 2 - 0.5, 17, 4],
    [cx + W / 2 + 4, 17, 4],
    [px - 10.5, 9, 3],
    [px - 7.6, 6, 2],
  ]
  g.add(clear(tube(tubeA, 2.6, C.glass, 40, false), C.glass, 0.3))
  const tubeB: V3[] = [
    [tx + 7, ty + 9, 0],
    [tx + 13, ty + 12, 0],
    [4, ty + 9, -4],
    [6, ty + 0.4, -6],
  ]
  g.add(clear(tube(tubeB, 2.6, C.glass, 40, false), C.glass, 0.3))
  for (const [x, y, z, rx, rz] of [
    [cx + W / 2 + 0.6, 17, 4, 0, PI / 2],
    [px - 7.9, 6.2, 2, 0, PI / 2 + 0.6],
    [tx + 7.2, ty + 9, 0, 0, PI / 2],
    [6, ty + 0.9, -6, 0, 0],
  ])
    g.add(P(cyl(3.1, 3.1, 1.6, shade(acc, -0.1), {}, 20), x, y, z, rx, 0, rz))
  return g
}

/** 仓鼠散步舱（透明滚球） */
function hamsterOrb(p: string[]) {
  const [tint, band] = p
  const g = new THREE.Group()
  const r = 9
  g.add(clear(ball(r, tint, { y: r }), tint, 0.32))
  g.add(torus(r - 0.25, 0.45, band, { y: r }))
  g.add(P(cyl(3.6, 3.6, 0.7, band, {}, 24), r - 0.75, r, 0, 0, 0, PI / 2))
  g.add(P(cyl(1.2, 1.2, 0.9, shade(band, -0.15), {}, 16), r - 0.2, r, 0, 0, 0, PI / 2))
  // 透气孔：一圈小窄条
  // 透气孔：对面一圈小圆点（贴在球面内侧一点）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    const v = new THREE.Vector3(-Math.cos(0.5), Math.sin(a) * Math.sin(0.5), Math.cos(a) * Math.sin(0.5)).multiplyScalar(r - 0.1)
    g.add(noOutlineDeep(ball(0.55, shade(band, -0.1), { x: v.x, y: r + v.y, z: v.z }, [0.4, 1, 1])))
  }
  g.add(P(hamster('#e8b07a'), 0, 0.55, 0, 0, 0.6))
  return g
}

/** 仓鼠外出提笼：彩色底盒 + 透明上盖（顶上开透气孔）+ 提手 */
function hamsterCarrier(p: string[]) {
  const [base, lidC] = p
  const g = new THREE.Group()
  const W = 21
  const D = 14
  g.add(tray(W, 7, D, 0.9, base, {}, 0.4))
  g.add(rbox(W - 1.8, 2.5, D - 1.8, CHIP, { y: 0.9 }, 0.4))
  // 透明上罩：四壁
  g.add(clear(G(rbox(W, 7, 0.4, C.glass, { y: 7, z: D / 2 - 0.2 }, 0.15), rbox(W, 7, 0.4, C.glass, { y: 7, z: -D / 2 + 0.2 }, 0.15), rbox(0.4, 7, D - 0.8, C.glass, { x: W / 2 - 0.2, y: 7 }, 0.15), rbox(0.4, 7, D - 0.8, C.glass, { x: -W / 2 + 0.2, y: 7 }, 0.15)), C.glass, 0.28))
  // 顶盖：透气孔板
  const holes = [] as { kind: 'circle'; x: number; y: number; r: number }[]
  for (let i = 0; i < 6; i++) for (const yy of [3.3, 6.3, 9.3]) holes.push({ kind: 'circle', x: -6.5 + i * 2.6, y: yy + 0.6, r: 0.6 })
  g.add(holePanel(W + 0.4, D + 0.4, 0.8, lidC, holes, { y: 14.2, z: (D + 0.4) / 2, rx: -PI / 2 }, 1.2))
  // 提手
  g.add(tube([[-5, 14.6, 0], [-4.2, 18.6, 0], [4.2, 18.6, 0], [5, 14.6, 0]], 0.55, lidC, 24))
  for (const s of [-1, 1]) g.add(rbox(1.6, 2.4, 1.6, base, { x: s * (W / 2 + 0.2), y: 6, z: 0 }, 0.4))
  g.add(P(hamster('#f0c08a'), -2, 3.4, 1, 0, 0.3))
  return g
}

// ======================================================================
// 兔 / 豚鼠 / 龙猫
// ======================================================================

function casters(g: THREE.Group, w: number, d: number, color: string) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(P(cyl(2.4, 2.4, 1.8, '#3d3f44', {}, 16), sx * w, 2.4, sz * d, 0, 0, PI / 2))
      g.add(rbox(2.6, 3.4, 2.6, color, { x: sx * w, y: 3.6, z: sz * d }, 0.4))
    }
}

/** 两层兔笼：脚轮 + 底盆 + 丝网笼身，半边二层平台和坡道 */
function rabbitCage(p: string[]) {
  const [base, wireC, deck] = p
  const g = new THREE.Group()
  const W = 90
  const D = 58
  casters(g, W / 2 - 4, D / 2 - 4, base)
  g.add(tray(W, 12, D, 1.4, base, { y: 6 }, 0.6))
  g.add(rbox(W - 3, 2.6, D - 3, HAY, { y: 7.4 }, 0.5))
  chips(g, W - 10, D - 10, 10, HAY, 18, 21)
  const y0 = 18.3
  const HW = 74
  g.add(wireBox(W - 0.6, D - 0.6, y0, HW, wireC, { gap: 2.2, r: 0.16, frameR: 0.38, rings: [y0 + 30] }))
  // 门：下层正面大门、上层正面小门、顶门
  g.add(P(frameXY(-18, y0 + 14, 30, 24, 0.35, wireC), 0, 0, D / 2 - 0.3 + 0.4))
  g.add(P(frameXY(22, y0 + 46, 24, 18, 0.35, wireC), 0, 0, D / 2 - 0.3 + 0.4))
  // 二层平台 + 坡道（带防滑条）
  const dy = 46
  g.add(rbox(42, 2, D - 3, deck, { x: 23, y: dy }, 0.5))
  const a = [-38, 10] as const
  const b = [2, dy + 1.5] as const
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const ramp = new THREE.Group()
  ramp.add(rbox(L, 1.4, 16, deck, { y: -0.7 }, 0.4))
  for (let t = -L / 2 + 3; t < L / 2 - 1; t += 4.5) ramp.add(rbox(0.9, 0.7, 15, shade(deck, -0.12), { x: t, y: 0.6 }, 0.2))
  ramp.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -D / 2 + 12)
  ramp.rotation.z = ang
  g.add(ramp)
  // 干草架（后壁左侧）+ 干草
  const hx = -W / 2 + 14
  for (let i = 0; i <= 6; i++) {
    const x = hx - 7 + i * 2.3
    g.add(wire([x, 30, -D / 2 + 0.5], [x, 44, -D / 2 + 6], 0.18, wireC))
  }
  g.add(stick([hx - 7.5, 44, -D / 2 + 6], [hx + 7.5, 44, -D / 2 + 6], 0.3, wireC))
  g.add(ball(6, HAY, { x: hx, y: 39, z: -D / 2 + 3.2 }, [1.1, 0.75, 0.45]))
  // 水瓶（右壁内侧）、食盆、便盆（平台下）
  g.add(P(bottle(2.6, 16, deck, -1), W / 2 - 3.4, 26, 6))
  g.add(P(bowl(4.5, CERAMIC, '#9fc56a'), -10, 10, 14))
  g.add(tray(24, 5, 18, 0.8, shade(base, -0.08), { x: W / 2 - 15, y: 10, z: -D / 2 + 11 }, 0.4))
  g.add(rbox(22.4, 2.4, 16.4, '#efe4c8', { x: W / 2 - 15, y: 10.8, z: -D / 2 + 11 }, 0.4))
  g.add(P(bunny('#f2efe9', '#ffffff'), -24, 10, 8, 0, 0.5))
  return g
}

/** 豚鼠围栏：低底盆 + 不封顶的丝网围栏，抓绒垫、草屋、干草架、两只豚鼠 */
function guineaPen(p: string[]) {
  const [base, wireC, fleece] = p
  const g = new THREE.Group()
  const W = 120
  const D = 60
  g.add(tray(W, 12, D, 1.2, base, {}, 0.6))
  g.add(rbox(W - 2.6, 1.4, D - 2.6, fleece, { y: 1.2 }, 0.5))
  g.add(wireBox(W - 0.6, D - 0.6, 12.2, 26, wireC, { gap: 2.5, r: 0.16, frameR: 0.38, top: false }))
  g.add(stick([0, 12.2, D / 2 - 0.3], [0, 38.2, D / 2 - 0.3], 0.38, wireC), stick([0, 12.2, -D / 2 + 0.3], [0, 38.2, -D / 2 + 0.3], 0.38, wireC))
  // 半圆草屋隧道
  const tun = new THREE.Group()
  const n = 9
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * PI
    tun.add(P(rbox(1.6, 1.6, 20, i % 2 ? HAY : shade(HAY, -0.08), {}, 0.6), Math.cos(t) * 9, Math.sin(t) * 9, 0, 0, 0, t))
  }
  tun.position.set(-W / 2 + 18, 2.6, -6)
  g.add(tun)
  // 干草堆 + 干草架
  g.add(ball(8, HAY, { x: 14, y: 4.6, z: -D / 2 + 9 }, [1.4, 0.55, 0.9]))
  chips(g, W - 12, D - 12, 3, HAY, 14, 33)
  g.add(tray(16, 9, 6, 0.6, WOOD, { x: 34, y: 2.6, z: -D / 2 + 4.5 }, 0.3))
  g.add(ball(5.5, HAY, { x: 34, y: 11, z: -D / 2 + 4.5 }, [1.3, 0.5, 0.45]))
  g.add(P(bottle(2.4, 14, fleece, -1), W / 2 - 3.2, 20, -10))
  g.add(P(bowl(4.2, CERAMIC, '#9fc56a'), 30, 2.6, 12))
  g.add(P(guineaPig('#c9874e', '#fbf6ee'), 4, 2.6, 10, 0, 0.9))
  g.add(P(guineaPig('#f6f1e8', '#4a3a30'), -24, 2.6, 14, 0, -0.4))
  return g
}

/** 龙猫高笼：带脚轮的支架 + 抽拉底盘 + 高丝网笼，三块木层板、小木屋、吊床 */
function chinchillaCage(p: string[]) {
  const [frame, wireC, shelf] = p
  const g = new THREE.Group()
  const W = 64
  const D = 46
  casters(g, W / 2 - 3, D / 2 - 3, frame)
  g.add(rbox(W, 3, D, frame, { y: 5.4 }, 0.6))
  g.add(tray(W - 1, 6, D - 1, 1, shade(frame, 0.08), { y: 8.4 }, 0.4))
  g.add(rbox(W - 4, 1, 0.8, shade(frame, -0.05), { y: 10, z: D / 2 - 0.1 }, 0.3))
  g.add(rbox(W - 3, 1.5, D - 3, CHIP, { y: 9.4 }, 0.4))
  const y0 = 14.6
  const HW = 104
  g.add(wireBox(W - 0.6, D - 0.6, y0, HW, wireC, { gap: 2, r: 0.15, frameR: 0.38, rings: [y0 + 52] }))
  g.add(P(frameXY(-10, y0 + 40, 30, 50, 0.38, wireC), 0, 0, D / 2 - 0.3 + 0.4))
  // 层板（靠壁），带支撑
  const shelves: [number, number, number][] = [
    [-W / 2 + 13, 44, 24],
    [W / 2 - 13, 70, 24],
    [-W / 2 + 13, 96, 24],
  ]
  for (const [x, y, w] of shelves) {
    g.add(rbox(w, 2, D - 4, shelf, { x, y }, 0.5))
    g.add(rbox(w * 0.8, 1.2, 1.4, shade(shelf, -0.15), { x, y: y - 1.2, z: -D / 2 + 2 }, 0.3))
  }
  // 地面木屋
  g.add(P(hut(22, 14, 16, shelf, shade(shelf, -0.18)), W / 2 - 14, 10.9, -4))
  // 吊床：四根绳 + 下垂的布
  const hx = 4
  const hy = 92
  const ham = ball(9, '#c78ab0', { x: hx, y: hy, z: 2 }, [1, 0.22, 0.85])
  g.add(ham)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(wire([hx + sx * 7, hy + 1, 2 + sz * 6], [hx + sx * 7.5, y0 + HW, 2 + sz * 6.5], 0.15, '#9a8a7a'))
  // 瓷浴沙罐 + 水瓶
  g.add(P(cup(6, 6.5, 9, 0.6, CERAMIC), -12, 10.9, 8))
  g.add(cyl(5.3, 5.3, 0.4, '#efe6d2', { x: -12, y: 14, z: 8 }, 20))
  g.add(P(bottle(2.4, 14, shelf, -1), W / 2 - 3.2, 46, 8))
  g.add(P(chinchilla('#9b9ba3'), W / 2 - 13, 72, 2, 0, -0.3))
  return g
}

// ======================================================================
// 鸟笼
// ======================================================================

const DOME = { R: 13.5, base: 5.5, hw: 24, ringR: 2.2, ringT: 0.3 }
/** 圆顶鸟笼（底在 y = 0）；返回模型和吊环内顶的高度 */
function domeBirdcage(p: string[], kind: BirdKind = 'budgie') {
  const [base, wireC, acc] = p
  const { R: rr, base: bh, hw, ringR, ringT } = DOME
  const g = new THREE.Group()
  g.add(cup(rr + 1.2, rr + 0.4, bh, 0.8, base))
  g.add(cyl(rr + 0.2, rr + 0.2, 0.4, '#efe4c8', { y: 0.8 }, 32))
  const y0 = bh - 0.3
  g.add(domeCage(rr, y0, hw, wireC))
  g.add(domeDoor(rr, PI / 2, 0.3, y0 + 1, y0 + 12, wireC))
  const yTop = y0 + hw + rr
  g.add(cyl(2.2, 2.6, 1.2, wireC, { y: yTop - 0.6 }, 20))
  g.add(cyl(0.55, 0.55, 1.6, wireC, { y: yTop + 0.6 }, 10))
  const ry = yTop + 2.2 + ringR + ringT
  g.add(torus(ringR, ringT, wireC, { y: ry - 0.3 }))
  // 栖木、秋千、两个食杯
  g.add(stick([-rr + 0.6, y0 + 9, 0], [rr - 0.6, y0 + 9, 0], 0.55, WOOD))
  const sy = y0 + hw - 3
  g.add(torus(4.5, 0.18, wireC, { y: sy, z: 2 }))
  g.add(stick([-4, sy - 2, 2], [4, sy - 2, 2], 0.45, WOOD))
  g.add(wire([0, sy + 4.5, 2], [0, yTop - 1.2, 0], 0.12, wireC))
  for (const s of [-1, 1]) {
    g.add(cup(2.4, 1.9, 3, 0.35, acc, { x: s * (rr - 2.4), y: y0 + 4, z: -3 }))
    g.add(cyl(1.9, 1.9, 0.4, s > 0 ? SEED : WATER, { x: s * (rr - 2.4), y: y0 + 6.1, z: -3 }, 16))
  }
  g.add(P(bird(kind), 3, y0 + 9.55, 0, 0, 0.3))
  return { g, ringTop: ry - 0.3 + ringR - ringT }
}

function domeStanding(p: string[]) {
  return domeBirdcage(p).g
}
function domeHanging(p: string[]) {
  const { g, ringTop } = domeBirdcage(p)
  g.position.y = -0.5 - ringTop
  centerXZ(g)
  return G(g)
}

/** 落地鸟笼支架：圆底座 + 立杆 + 顶端涡卷挂臂，挂着一只圆顶鸟笼 */
function birdcageStand(p: string[]) {
  const [stand, wireC, acc] = p
  const g = new THREE.Group()
  g.add(cyl(22, 24, 2.4, stand, {}, 40))
  g.add(cyl(8, 12, 3, stand, { y: 2.4 }, 32))
  const H = 168
  g.add(cyl(1.3, 1.6, H - 5.4, stand, { y: 5.4 }, 16))
  g.add(ball(2.2, stand, { y: 60 }), ball(2.2, stand, { y: H - 2 }))
  // 挂臂：从立杆顶端弯过去，末端朝下是挂钩
  const ax = 22
  g.add(tube([[0, H - 6, 0], [3, H + 1, 0], [10, H + 3.5, 0], [ax - 3, H + 2.5, 0], [ax, H - 0.5, 0]], 0.9, stand, 40))
  // 支撑涡卷
  g.add(tube([[0, H - 22, 0], [5, H - 16, 0], [10, H - 7, 0], [13, H + 1, 0]], 0.5, stand, 30))
  g.add(stick([ax, H - 0.5, 0], [ax, H - 3.2, 0], 0.5, stand))
  g.add(torus(1.4, 0.4, stand, { x: ax, y: H - 4.2, ry: PI / 2 }))
  const { g: cage, ringTop } = domeBirdcage([acc, wireC, acc], 'buncho-white')
  // 鸟笼吊环套在挂钩小环上：吊环内顶 = 小环内底
  cage.position.set(ax, H - 4.2 - 1.4 + 0.4 - ringTop, 0)
  g.add(cage)
  return g
}

/** 方形大鸟笼：底盘抽屉 + 方丝网笼，两根栖木、秋千、镜子、食槽；wireShadow=false 时笼丝不投影（高处的大笼子用） */
function squareCage(p: string[], W: number, D: number, HW: number, birds: [BirdKind, BirdKind], wireShadow = true) {
  const [base, wireC, acc] = p
  const g = new THREE.Group()
  g.add(tray(W, 9, D, 1, base, {}, 0.5))
  g.add(rbox(W - 4, 4, 0.6, shade(base, -0.06), { y: 1.5, z: D / 2 + 0.05 }, 0.3))
  g.add(rbox(6, 1.2, 1, acc, { y: 3, z: D / 2 + 0.6 }, 0.4))
  g.add(rbox(W - 2, 0.4, D - 2, '#efe4c8', { y: 1 }, 0.15))
  // 底部格栅：丝径加粗、间距放大——原来的 1.6 / 0.12 在 640px 下会退化成一片灰网
  const wc = wireSteel(wireC)
  for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 2.8) g.add(wire([x, 6, -D / 2 + 1], [x, 6, D / 2 - 1], 0.18, wc))
  const y0 = 9.2
  // 细丝不投影：笼子架在 80cm 高，密网的影子落到地面时会缩成一片摩尔纹，只留框架/托盘/栖木的影子
  g.add(wireBox(W - 0.6, D - 0.6, y0, HW, wireC, { gap: 2.4, r: 0.22, rings: [y0 + HW * 0.45], topGap: 2.8, wireColor: wc, wireShadow }))
  const z1 = D / 2 - 0.3 + 0.35
  g.add(P(frameXY(0, y0 + 4 + HW * 0.22, W * 0.32, HW * 0.36, 0.32, wireC), 0, 0, z1))
  for (const s of [-1, 1]) g.add(P(frameXY(s * W * 0.33, y0 + 4.5, 8, 7, 0.28, wireC, false), 0, 0, z1))
  const top = y0 + HW
  g.add(tube([[-W / 6, top, 0], [-W / 6 + 1, top + 4, 0], [W / 6 - 1, top + 4, 0], [W / 6, top, 0]], 0.45, wireC, 24))
  // 栖木（前后方向）
  const pa = y0 + HW * 0.32
  const pb = y0 + HW * 0.58
  g.add(stick([-W / 4, pa, -D / 2 + 0.6], [-W / 4, pa, D / 2 - 0.6], 0.7, WOOD))
  g.add(stick([W / 4, pb, -D / 2 + 0.6], [W / 4, pb, D / 2 - 0.6], 0.75, WOODD))
  // 秋千
  const sy = top - 16
  for (const s of [-1, 1]) g.add(wire([s * 4, top, 2], [s * 4, sy, 2], 0.12, wc))
  g.add(stick([-4.4, sy, 2], [4.4, sy, 2], 0.5, WOOD))
  for (let i = 0; i < 4; i++) g.add(ball(0.9, [acc, C.lemon, C.sky, C.pink][i], { x: -4, y: sy + 3 + i * 2.2, z: 2 }))
  // 镜子 + 铃铛（左壁内侧）
  const mx = -W / 2 + 1.6
  const my = y0 + HW * 0.68
  g.add(P(torus(3.4, 0.5, acc, {}), mx, my, -D / 4, 0, PI / 2))
  const mirror = cyl(3.2, 3.2, 0.3, '#dfeaf2', {}, 24)
  mirror.material = toon('#dfeaf2', { emissive: 0.15 })
  g.add(P(mirror, mx, my, -D / 4, 0, 0, PI / 2))
  g.add(ball(1.1, '#e3b549', { x: mx + 0.8, y: my - 5.2, z: -D / 4 }))
  // 食槽（前壁内侧，两格）+ 水杯
  g.add(tray(12, 4, 4.5, 0.5, acc, { x: W / 4, y: y0 + 2.5, z: D / 2 - 3 }, 0.3))
  g.add(rbox(11, 0.5, 3.5, SEED, { x: W / 4, y: y0 + 5.3, z: D / 2 - 3 }, 0.2))
  g.add(cup(2.6, 2.2, 4, 0.4, acc, { x: -W / 4, y: y0 + 2.5, z: D / 2 - 3.2 }))
  g.add(cyl(2.2, 2.2, 0.4, WATER, { x: -W / 4, y: y0 + 5.6, z: D / 2 - 3.2 }, 16))
  g.add(P(bird(birds[0]), W / 4, pb + 0.75, 1, 0, -0.3))
  g.add(P(bird(birds[1]), -W / 4, pa + 0.7, -2, 0, 0.4))
  return g
}

function squareStand(p: string[]) {
  const [base, wireC] = p
  const g = new THREE.Group()
  const W = 62
  const D = 48
  const SH = 80
  casters(g, W / 2 - 3, D / 2 - 3, wireC)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.6, SH - 6, 2.6, wireC, { x: sx * (W / 2 - 3), y: 6, z: sz * (D / 2 - 3) }, 0.5))
  // 下层置物架（细丝网）+ 顶框
  for (const y of [22, SH - 2]) {
    g.add(rbox(W - 3, 2, 2, wireC, { y, z: D / 2 - 3 }, 0.4), rbox(W - 3, 2, 2, wireC, { y, z: -D / 2 + 3 }, 0.4))
    g.add(rbox(2, 2, D - 8, wireC, { x: W / 2 - 3, y }, 0.4), rbox(2, 2, D - 8, wireC, { x: -W / 2 + 3, y }, 0.4))
  }
  for (let x = -W / 2 + 6; x <= W / 2 - 6; x += 3) g.add(wire([x, 23.6, -D / 2 + 3], [x, 23.6, D / 2 - 3], 0.2, wireC))
  g.add(tray(30, 8, 20, 0.6, base, { x: -10, y: 24.2 }, 0.4))
  const cage = squareCage(p, 60, 46, 58, ['cockatiel', 'budgie'], false)
  cage.position.y = SH
  g.add(cage)
  return g
}

/** 和风竹编鸟笼（文鸟笼）：木底座抽屉 + 竹角柱 + 密竹丝，顶上一只吊环 */
const BAMBOO = { W: 30, D: 24, base: 5, hw: 30, ringR: 2.6, ringT: 0.35 }
function bambooCage(p: string[]) {
  const [bam, wood, acc] = p
  const { W, D, base: bh, hw, ringR, ringT } = BAMBOO
  const g = new THREE.Group()
  g.add(tray(W, bh, D, 1, wood, {}, 0.4))
  g.add(rbox(W - 3, bh - 1.6, 0.5, shade(wood, 0.06), { y: 0.8, z: D / 2 + 0.05 }, 0.2))
  g.add(cyl(0.7, 0.7, 0.6, acc, { y: bh / 2 - 0.3, z: D / 2 + 0.6, rx: PI / 2 }, 12))
  g.add(rbox(W - 2, 0.4, D - 2, '#efe6d2', { y: 1 }, 0.15))
  const y0 = bh
  const yTop = y0 + hw
  // 竹丝：四面竖丝，间距约 1 cm
  const nx = Math.round(W / 1)
  const nz = Math.round(D / 1)
  for (let i = 1; i < nx; i++) {
    const x = -W / 2 + (W * i) / nx
    for (const z of [-D / 2 + 0.5, D / 2 - 0.5]) g.add(wire([x, y0, z], [x, yTop, z], 0.11, bam))
  }
  for (let i = 1; i < nz; i++) {
    const z = -D / 2 + (D * i) / nz
    for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) g.add(wire([x, y0, z], [x, yTop, z], 0.11, bam))
  }
  // 角柱、腰带（扁竹条）、顶框
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.3, hw, 1.3, bam, { x: sx * (W / 2 - 0.5), y: y0, z: sz * (D / 2 - 0.5) }, 0.3))
  for (const y of [y0 + 0.4, y0 + 9, y0 + hw * 0.62, yTop - 0.8]) {
    for (const sz of [-1, 1]) g.add(rbox(W, 0.8, 0.6, shade(bam, -0.05), { y: y - 0.4, z: sz * (D / 2 - 0.5) }, 0.2))
    for (const sx of [-1, 1]) g.add(rbox(0.6, 0.8, D - 1.6, shade(bam, -0.05), { x: sx * (W / 2 - 0.5), y: y - 0.4 }, 0.2))
  }
  g.add(rbox(W + 0.6, 1, D + 0.6, wood, { y: yTop }, 0.4))
  for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 1.2) g.add(wire([x, yTop + 1.05, -D / 2 + 1], [x, yTop + 1.05, D / 2 - 1], 0.11, bam))
  // 顶上吊环
  g.add(cyl(1.6, 2, 1.4, wood, { y: yTop + 1 }, 16))
  const ry = yTop + 2.4 + ringR + ringT - 0.2
  g.add(torus(ringR, ringT, acc === J.shu ? '#3e3a39' : '#6b5a48', { y: ry }))
  // 正面小拉门
  g.add(P(frameXY(0, y0 + 5, 9, 8, 0.35, shade(bam, -0.12), false), 0, 0, D / 2 - 0.1))
  g.add(cyl(0.6, 0.6, 1, acc, { x: 0, y: y0 + 9.4, z: D / 2 + 0.3, rx: PI / 2 }, 10))
  // 栖木（前后方向）、陶瓷食杯
  const pa = y0 + 10
  g.add(stick([-W / 4, pa, -D / 2 + 1], [-W / 4, pa, D / 2 - 1], 0.6, WOOD))
  g.add(stick([W / 4, pa + 6, -D / 2 + 1], [W / 4, pa + 6, D / 2 - 1], 0.6, WOOD))
  for (const s of [-1, 1]) {
    g.add(cup(2.3, 2, 3, 0.35, CERAMIC, { x: s * 5, y: y0 + 1, z: D / 2 - 3 }))
    g.add(torus(2.15, 0.2, J.ai, { x: s * 5, y: y0 + 3.85, z: D / 2 - 3, rx: PI / 2 }))
    g.add(cyl(1.9, 1.9, 0.4, s > 0 ? SEED : WATER, { x: s * 5, y: y0 + 3, z: D / 2 - 3 }, 16))
  }
  g.add(P(bird('buncho-white'), W / 4, pa + 6.6, 0, 0, -0.2))
  g.add(P(bird('buncho'), -W / 4, pa + 0.6, 1, 0, 0.3))
  return { g, ringTop: ry + ringR - ringT }
}
function bambooStanding(p: string[]) {
  return bambooCage(p).g
}
function bambooHanging(p: string[]) {
  const { g, ringTop } = bambooCage(p)
  g.position.y = -0.5 - ringTop
  centerXZ(g)
  return G(g)
}

/** 桌上鸟栖架（放风台）：木底盘 + T 形栖木 + 梯子 + 两个杯子 + 铃铛 */
function perchStand(p: string[]) {
  const [base, perch, acc] = p
  const g = new THREE.Group()
  g.add(tray(40, 3.5, 28, 1, base, {}, 0.6))
  g.add(rbox(38, 0.4, 26, '#efe4c8', { y: 1 }, 0.15))
  g.add(cyl(1, 1.2, 34, perch, { x: -6, y: 1 }, 12))
  g.add(stick([-18, 35, 0], [6, 35, 0], 0.9, perch))
  g.add(stick([-6, 22, 0], [6, 22, 0], 0.8, perch))
  g.add(stick([6, 22, 0], [6, 35, 0], 0.6, perch))
  // 梯子
  for (const s of [-1, 1]) g.add(stick([12 + s * 2.5, 1, 6], [12 + s * 2.5, 21, 3], 0.35, perch))
  for (let i = 1; i < 6; i++) g.add(stick([9.5, 1 + i * 3.4, 6 - i * 0.5], [14.5, 1 + i * 3.4, 6 - i * 0.5], 0.3, perch))
  for (const [x, food] of [
    [-14, SEED],
    [-8, WATER],
  ] as const) {
    g.add(cup(2.5, 2.1, 3.2, 0.4, acc, { x, y: 1, z: 8 }))
    g.add(cyl(2.1, 2.1, 0.4, food, { x, y: 3.4, z: 8 }, 16))
  }
  g.add(wire([-16, 35, 0], [-16, 30, 0], 0.08, '#9a8a7a'))
  g.add(ball(1.2, '#e3b549', { x: -16, y: 29, z: 0 }))
  g.add(P(bird('budgie-blue'), -10, 35.9, 0, 0, 0.4))
  return g
}

// ======================================================================
// 爬宠 / 水族
// ======================================================================

/** 爬宠饲养箱：玻璃箱 + 正面双开门 + 顶网，上面一盏发光的加热灯，里面豹纹守宫 */
function terrarium(p: string[]) {
  const [frame, cork, lamp] = p
  const g = new THREE.Group()
  const W = 60
  const D = 45
  const H = 45
  g.add(rbox(W, 5, D, frame, {}, 0.6))
  // 正面下沿通风条
  g.add(holePanel(W - 2, 4, 0.8, frame, Array.from({ length: 10 }, (_, i) => ({ kind: 'rect' as const, x: -22.5 + i * 5, y: 1.2, w: 3.2, h: 1.4, r: 0.4 })), { y: 5, z: D / 2 - 0.4 }, 0.4))
  // 玻璃：后、左、右 + 两扇门
  const gl = new THREE.Group()
  gl.add(rbox(W - 1, H - 6, 0.5, C.glass, { y: 5, z: -D / 2 + 0.6 }, 0.1))
  for (const s of [-1, 1]) gl.add(rbox(0.5, H - 6, D - 2, C.glass, { x: s * (W / 2 - 0.6), y: 5 }, 0.1))
  for (const s of [-1, 1]) gl.add(rbox(W / 2 - 1.4, H - 11, 0.5, C.glass, { x: s * (W / 4 - 0.2), y: 9.5, z: D / 2 - 0.6 }, 0.1))
  g.add(clear(gl, C.glass, 0.18))
  // 框：四条竖边、门框、门把
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.6, H - 5, 1.6, frame, { x: sx * (W / 2 - 0.8), y: 5, z: sz * (D / 2 - 0.8) }, 0.3))
  for (const s of [-1, 1]) {
    const x = s * (W / 4 - 0.2)
    g.add(rbox(W / 2 - 1.2, 0.9, 1, frame, { x, y: H - 1.9, z: D / 2 - 0.6 }, 0.2))
    g.add(rbox(W / 2 - 1.2, 0.9, 1, frame, { x, y: 9, z: D / 2 - 0.6 }, 0.2))
    g.add(rbox(0.9, H - 11, 1, frame, { x: s * 0.6, y: 9, z: D / 2 - 0.6 }, 0.2))
    g.add(rbox(0.8, 4, 1.2, lamp, { x: s * 2.2, y: 24, z: D / 2 + 0.2 }, 0.3))
  }
  // 顶：外框 + 细网
  g.add(holePanel(W, D, 1, frame, [{ kind: 'rect', x: 0, y: 2.4, w: W - 4.8, h: D - 4.8, r: 0.5 }], { y: H - 0.5, z: D / 2, rx: -PI / 2 }, 1))
  for (let x = -W / 2 + 3; x <= W / 2 - 3; x += 1.3) g.add(wire([x, H - 0.5, -D / 2 + 2.4], [x, H - 0.5, D / 2 - 2.4], 0.09, '#2a2a2e'))
  for (let z = -D / 2 + 3; z <= D / 2 - 3; z += 1.3) g.add(wire([-W / 2 + 2.4, H - 0.5, z], [W / 2 - 2.4, H - 0.5, z], 0.09, '#2a2a2e'))
  // 加热灯：反光罩倒扣在网上，灯泡发光
  const lx = W / 5
  g.add(P(cup(7.5, 4.5, 7.5, 0.4, lamp), lx, H + 8, -4, PI))
  g.add(cyl(2, 2, 2.5, frame, { x: lx, y: H + 7.6, z: -4 }, 16))
  g.add(lit(ball(2.6, BULB, { x: lx, y: H + 3.6, z: -4 }), BULB, 1))
  g.add(lit(cyl(6.8, 6.8, 0.2, '#ffcf8a', { x: lx, y: H + 0.55, z: -4 }, 32), '#ffcf8a', 0.6))
  g.add(tube([[lx, H + 8.6, -4], [lx - 6, H + 9.5, -8], [-W / 2 + 4, H + 1.5, -D / 2 + 3]], 0.3, '#2a2a2e', 24))
  // 底砂、软木背景、树枝、躲避石、水盆、多肉
  g.add(rbox(W - 2.4, 4, D - 2.4, '#e3c08a', { y: 5 }, 0.5))
  g.add(rbox(W - 3, H - 12, 1.2, cork, { y: 9, z: -D / 2 + 1.5 }, 0.5))
  const rand = rng(5)
  for (let i = 0; i < 12; i++) g.add(ball(2 + rand() * 2, shade(cork, (rand() - 0.5) * 0.12), { x: (rand() - 0.5) * (W - 10), y: 12 + rand() * (H - 22), z: -D / 2 + 2 }, [1, 1, 0.35]))
  g.add(tube([[-W / 2 + 6, 9, -10], [-10, 18, -6], [6, 24, -12], [18, 30, -14]], 1.1, '#8a6a4a', 30))
  g.add(ball(6.5, '#9b8f84', { x: -16, y: 9, z: 2 }, [1.35, 0.8, 1]))
  g.add(noOutlineDeep(rbox(4, 3.6, 0.4, '#3a3230', { x: -16, y: 9, z: 8.6 }, 1.5)))
  g.add(cup(4.2, 3.6, 1.8, 0.5, '#8d8478', { x: 10, y: 9, z: 9 }))
  g.add(clear(cyl(3.6, 3.6, 0.9, WATER, { x: 10, y: 9.6, z: 9 }, 20), WATER, 0.5))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    g.add(P(ball(1.6, C.leafD, {}, [0.5, 1.2, 0.3]), 22 + Math.cos(a) * 1.2, 10.6, -8 + Math.sin(a) * 1.2, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5))
  }
  g.add(P(gecko('#f2c84a'), 2, 9, 2, 0, -0.6))
  return g
}

/** 乌龟缸：玻璃缸 + 一半水 + 石头晒台 + 夹在缸沿的晒背灯 */
function turtleTank(p: string[]) {
  const [rim, stone, lamp] = p
  const g = new THREE.Group()
  const W = 60
  const D = 30
  const H = 30
  g.add(clearBox(W, H, D, 0.5, 0, 0.18))
  g.add(tray(W + 0.4, 1.4, D + 0.4, 0.6, rim, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(W + 0.4, 1.2, 0.8, rim, { y: H - 1.2, z: s * (D / 2 - 0.2) }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(0.8, 1.2, D - 1.2, rim, { x: s * (W / 2 - 0.2), y: H - 1.2 }, 0.3))
  g.add(rbox(W - 1.4, 2.6, D - 1.4, '#c9b38f', { y: 0.6 }, 0.4))
  const wl = 14
  g.add(clear(rbox(W - 1.4, wl - 0.8, D - 1.4, WATER, { y: 0.7 }, 0.2), WATER, 0.28))
  // 晒台：石堆 + 平台 + 斜坡
  const rand = rng(9)
  for (let i = 0; i < 7; i++) g.add(ball(3 + rand() * 1.6, shade(stone, (rand() - 0.5) * 0.1), { x: 20 + (rand() - 0.5) * 12, y: 4 + i * 1.6, z: (rand() - 0.5) * 12 }, [1.2, 0.8, 1]))
  g.add(rbox(18, 2, D - 2.4, stone, { x: 20, y: wl + 1 }, 0.8))
  const ramp = rbox(13, 1.2, 10, shade(stone, -0.05), {}, 0.4)
  g.add(P(ramp, 5.5, wl - 1.5, 3, 0, 0, 0.45))
  g.add(P(turtle('#5f7d3a'), 21, wl + 3, 0, 0, -1.2))
  g.add(swimmer(P(turtle('#6b8a40'), 0, 0, 0, 0, PI / 2), { rx: 9, rz: 4, cx: -12, cz: 0, y: 7, speed: 0.22, bob: 0.4 }))
  // 过滤器（左后）
  g.add(rbox(7, 12, 4, '#3d3f44', { x: -W / 2 + 5, y: 3.2, z: -D / 2 + 3 }, 0.6))
  g.add(cyl(0.6, 0.6, 12, '#3d3f44', { x: -W / 2 + 7, y: 15, z: -D / 2 + 3 }, 10))
  // 晒背灯：夹子夹在后沿，灯臂伸到晒台上方
  const lx = 22
  g.add(rbox(4, 5, 2.6, lamp, { x: lx, y: H - 3, z: -D / 2 }, 0.5))
  g.add(tube([[lx, H + 2, -D / 2], [lx, H + 11, -D / 2 + 1], [lx, H + 14, -D / 2 + 6], [lx, H + 13, -2]], 0.5, lamp, 30))
  g.add(P(cup(6, 3.5, 6.5, 0.4, lamp), lx, H + 14.5, 0, PI))
  g.add(lit(ball(2.3, BULB, { x: lx, y: H + 10.2, z: 0 }), BULB, 1))
  return g
}

/** 金鱼缸（波浪口玻璃钵）：木座 + 波浪荷叶边的口沿，两条琉金 */
function goldfishBowl(p: string[]) {
  const [stand, gravel, acc] = p
  const g = new THREE.Group()
  const base = 1.4
  // 玻璃外形（回转体）
  const prof: [number, number][] = [
    [0, 0],
    [7.5, 0],
    [10.5, 2],
    [13.2, 6],
    [14, 10],
    [13.4, 14],
    [11.5, 18],
    [10.2, 20.5],
    [10.6, 22],
    [12.4, 24],
    [13.6, 25.2],
  ]
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y <= 20.5) continue
    const t = Math.min(1, (y - 20.5) / 4.7)
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const a = Math.atan2(z, x)
    const k = Math.sin(a * 9) * t
    pos.setXYZ(i, x * (1 + 0.05 * k), y + 0.9 * k, z * (1 + 0.05 * k))
  }
  geo.computeVertexNormals()
  const mat = toon(C.glass, { transparent: 0.24 }).clone()
  mat.side = THREE.DoubleSide
  const glass = new THREE.Mesh(geo, mat)
  glass.position.y = base
  glass.userData.noOutline = true
  g.add(glass)
  // 水、砂
  const inner = (y: number) => {
    let r = 0
    for (let i = 1; i < prof.length; i++) {
      const [ra, ya] = prof[i - 1]
      const [rb, yb] = prof[i]
      if (y >= ya && y <= yb) r = ra + ((rb - ra) * (y - ya)) / Math.max(0.001, yb - ya)
    }
    return Math.max(0, r - 0.5)
  }
  const slice = (ya: number, yb: number) => {
    const pts = [new THREE.Vector2(0, ya)]
    for (let i = 0; i <= 10; i++) {
      const y = ya + ((yb - ya) * i) / 10
      pts.push(new THREE.Vector2(inner(y), y))
    }
    pts.push(new THREE.Vector2(0, yb))
    return new THREE.LatheGeometry(pts, 40)
  }
  const sand = new THREE.Mesh(slice(0.5, 2.6), toon(gravel))
  sand.position.y = base
  g.add(sand)
  const water = new THREE.Mesh(slice(0.6, 18.5), toon(WATER, { transparent: 0.3 }))
  water.position.y = base
  water.userData.noOutline = true
  g.add(water)
  // 水草、小石
  for (let i = 0; i < 5; i++) {
    const m = ball(4, i % 2 ? C.leaf : C.leafD, {}, [0.18, 1, 0.08])
    g.add(P(m, -4 + i * 0.8, base + 6, -3 + (i % 2), 0, i * 0.7, (i - 2) * 0.12))
  }
  g.add(ball(1.4, acc, { x: 4, y: base + 2.8, z: 3 }, [1.2, 0.6, 1]))
  g.add(ball(1.2, '#a9a49c', { x: 5.5, y: base + 2.8, z: -2 }, [1.1, 0.6, 1]))
  g.add(swimmer(goldfish('#f06a3a', 0.9, 1), { rx: 5.5, rz: 4.5, y: base + 9, speed: 0.4, bob: 0.6 }))
  g.add(swimmer(goldfish('#f4a23a', 0.8, 2), { rx: 4, rz: 5, cx: 0.5, y: base + 13, speed: -0.55, bob: 0.5 }))
  // 木座
  g.add(cup(9.4, 10.2, base + 1.6, 1.2, stand))
  return g
}

/** 青鳉睡莲钵：釉陶大钵 + 睡莲 + 几条青鳉 */
function medakaBowl(p: string[]) {
  const [glaze, inner, flower] = p
  const g = new THREE.Group()
  g.add(cup(19, 14.5, 22, 1.6, glaze))
  g.add(cyl(16, 13.6, 2.4, inner, { y: 1.6 }, 32))
  const water = clear(cyl(17.2, 13.8, 17, WATER, { y: 2.4 }, 32), WATER, 0.32)
  g.add(water)
  const wy = 19.4
  const rand = rng(17)
  for (let i = 0; i < 5; i++) {
    const a = rand() * PI * 2
    const rr = 4 + rand() * 9
    const pad = noOutlineDeep(ball(3 + rand() * 0.8, i % 2 ? '#5fa35a' : '#6fb565', {}, [1, 0.05, 1]))
    g.add(P(pad, Math.cos(a) * rr, wy + 0.15, Math.sin(a) * rr))
  }
  // 一朵睡莲
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    g.add(P(ball(1.3, flower, {}, [0.45, 0.25, 1]), Math.cos(a) * 1.1 - 3, wy + 0.9, Math.sin(a) * 1.1 + 2, 0.5 * Math.sin(a), -a, 0.5 * Math.cos(a)))
  }
  g.add(ball(0.7, '#f4d24a', { x: -3, y: wy + 1.1, z: 2 }))
  // 一丛水草茎
  for (let i = 0; i < 6; i++) g.add(P(cyl(0.18, 0.25, 12 + i, C.leafD, {}, 6), 8 + (i % 3) * 0.8, 3.8 + (12 + i) / 2, -6 + Math.floor(i / 3) * 0.8, (i - 3) * 0.05, 0, (i % 3 - 1) * 0.1))
  for (let i = 0; i < 4; i++) g.add(swimmer(medaka(i % 2 ? '#f0b562' : '#f7d27a'), { rx: 4 + i * 1.6, rz: 3 + i, cx: (i - 1.5) * 0.8, y: 10 + i * 2, speed: (i % 2 ? -1 : 1) * (0.35 + i * 0.08), bob: 0.5 }))
  return g
}

// ======================================================================
// 狗 / 猫
// ======================================================================

/** 狗笼（金属丝折叠笼）：底盘 + 方笼，正面和侧面各一扇门，顶上提手，里面软垫和骨头玩具 */
function dogCrate(p: string[], W: number, D: number, H: number) {
  const [wireC, pan, cushion] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(stick([-W / 2 + 1, 0.5, s * (D / 2 - 3)], [W / 2 - 1, 0.5, s * (D / 2 - 3)], 0.5, wireC))
  g.add(tray(W - 2, 4, D - 2, 0.6, pan, { y: 1 }, 0.4))
  g.add(wireBox(W, D, 1, H - 1, wireC, { gap: 2.8, r: 0.2, frameR: 0.45, rings: [H * 0.36, H * 0.7], topGap: 3 }))
  const z1 = D / 2 + 0.5
  g.add(P(frameXY(W * 0.12, H * 0.45, D * 0.75, H * 0.72, 0.42, wireC), 0, 0, z1))
  g.add(P(frameXY(0, H * 0.45, D * 0.6, H * 0.7, 0.42, wireC), W / 2 + 0.5, 0, 0, 0, PI / 2))
  g.add(tube([[-6, H, 0], [-5, H + 3.2, 0], [5, H + 3.2, 0], [6, H, 0]], 0.7, '#3d3f44', 24))
  g.add(puck(Math.min(W, D) * 0.45, 4, cushion, { y: 1.6 }))
  g.add(rbox(W - 6, 3.4, D - 6, cushion, { y: 1.6 }, 1.6))
  // 骨头玩具
  const bx = W / 4
  g.add(P(cyl(0.8, 0.8, 8, '#f3e6c8', {}, 10), bx, 5.8, 4, 0, 0.6, PI / 2))
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.add(ball(1.1, '#f3e6c8', { x: bx + s * 3.3 * Math.cos(0.6) + t * 0.6 * Math.sin(0.6), y: 5.8, z: 4 - s * 3.3 * Math.sin(0.6) + t * 0.6 * Math.cos(0.6) }))
  return g
}

/** 狗围栏：防水底盘 + 四面管框围栏（不封顶），尿垫托盘、狗床、水瓶 */
function dogPen(p: string[]) {
  const [frame, rods, bed] = p
  const g = new THREE.Group()
  const W = 120
  const D = 80
  const H = 62
  g.add(tray(W, 5, D, 1, frame, {}, 0.5))
  g.add(wireBox(W - 1.8, D - 1.8, 5, H - 6, rods, { gap: 4, r: 0.32, frameR: 0.9, top: false }))
  for (const z of [-D / 2 + 0.9, D / 2 - 0.9]) g.add(cyl(0.9, 0.9, H - 6, rods, { x: 0, y: 5, z }, 12))
  for (const x of [-W / 2 + 0.9, W / 2 - 0.9]) g.add(cyl(0.9, 0.9, H - 6, rods, { x, y: 5, z: 0 }, 12))
  // 正面门
  g.add(P(frameXY(-W / 4, 5 + (H - 6) / 2, 34, H - 10, 0.6, frame), 0, 0, D / 2 - 0.9 + 0.8))
  // 尿垫托盘、狗床、水瓶、玩具球
  g.add(tray(44, 2.4, 32, 0.8, frame, { x: W / 4 + 2, y: 1, z: -D / 4 + 4 }, 0.5))
  g.add(rbox(42, 0.6, 30, '#f7f4ee', { x: W / 4 + 2, y: 1.8, z: -D / 4 + 4 }, 0.2))
  g.add(puck(19, 9, bed, { x: -W / 4 + 2, y: 1, z: -6 }))
  g.add(puck(13, 3, shade(bed, 0.12), { x: -W / 4 + 2, y: 6.5, z: -6 }))
  g.add(P(bottle(2.8, 18, frame, -1), W / 2 - 4.4, 24, 18))
  g.add(ball(3.2, '#f2c84a', { x: 6, y: 4.2, z: 22 }))
  return g
}

/** 猫外出包：软质手提肩背包，正面和顶面是网窗，里面能看到一只猫探头 */
function catCarrier(p: string[]) {
  const [fabric, trim, mesh] = p
  const g = new THREE.Group()
  const W = 45
  const D = 27
  const H = 29
  const t = 1.2
  // 包身：前后左右四片 + 底 + 顶（正面和顶面开窗）
  g.add(holePanel(W, H - 2 * t, t, fabric, [{ kind: 'rect', x: 0, y: 4, w: W - 14, h: H - 12, r: 3 }], { y: t, z: D / 2 - t / 2 }, 2))
  g.add(holePanel(W, H - 2 * t, t, fabric, [], { y: t, z: -D / 2 + t / 2 }, 2))
  for (const s of [-1, 1]) g.add(holePanel(D - 2 * t, H - 2 * t, t, fabric, s > 0 ? [{ kind: 'rect', x: 0, y: 5, w: D - 12, h: H - 14, r: 2.5 }] : [], { x: s * (W / 2 - t / 2), y: t, ry: (s * PI) / 2 }, 2))
  g.add(rbox(W, t, D, shade(fabric, -0.06), {}, 0.5))
  g.add(holePanel(W, D, t, fabric, [{ kind: 'rect', x: 0, y: 4, w: W - 12, h: D - 8, r: 3 }], { y: H - t / 2, z: D / 2, rx: -PI / 2 }, 2))
  // 网：细丝格子
  const fz = D / 2 - t / 2
  for (let x = -W / 2 + 7.5; x <= W / 2 - 7.5; x += 1.3) g.add(wire([x, t + 4, fz], [x, t + H - 8, fz], 0.08, mesh))
  for (let y = t + 4.5; y <= t + H - 8; y += 1.3) g.add(wire([-W / 2 + 7, y, fz], [W / 2 - 7, y, fz], 0.08, mesh))
  for (let x = -W / 2 + 6.5; x <= W / 2 - 6.5; x += 1.3) g.add(wire([x, H - t / 2, -D / 2 + 4], [x, H - t / 2, D / 2 - 4], 0.08, mesh))
  for (let z = -D / 2 + 4.5; z <= D / 2 - 4.5; z += 1.3) g.add(wire([-W / 2 + 6, H - t / 2, z], [W / 2 - 6, H - t / 2, z], 0.08, mesh))
  const sx = W / 2 - t / 2
  for (let z = -D / 2 + 6.5; z <= D / 2 - 6.5; z += 1.3) g.add(wire([sx, t + 5, z], [sx, t + H - 9, z], 0.08, mesh))
  for (let y = t + 5.5; y <= t + H - 9; y += 1.3) g.add(wire([sx, y, -D / 2 + 6], [sx, y, D / 2 - 6], 0.08, mesh))
  // 包边、拉链、提手、肩带
  for (const y of [0.4, H - 0.4]) {
    for (const s of [-1, 1]) g.add(stick([-W / 2, y, s * D / 2], [W / 2, y, s * D / 2], 0.5, trim))
    for (const s of [-1, 1]) g.add(stick([s * W / 2, y, -D / 2], [s * W / 2, y, D / 2], 0.5, trim))
  }
  for (const sx2 of [-1, 1]) for (const sz of [-1, 1]) g.add(stick([sx2 * W / 2, 0.4, sz * D / 2], [sx2 * W / 2, H - 0.4, sz * D / 2], 0.5, trim))
  for (const s of [-1, 1]) g.add(tube([[-9, H, s * 6], [-6, H + 9, s * 6], [6, H + 9, s * 6], [9, H, s * 6]], 0.8, trim, 24))
  g.add(rbox(3, 2, 0.6, STEEL, { x: W / 2 - 8, y: H - 2.5, z: D / 2 + 0.2 }, 0.3))
  // 猫在里面探头
  const cat = new THREE.Group()
  cat.add(ball(7.5, '#f2b46a', { y: 6, z: -3 }, [1, 0.75, 1.3]))
  cat.add(ball(5.2, '#f2b46a', { y: 13, z: 4 }))
  for (const s of [-1, 1]) cat.add(P(cyl(0, 1.8, 3, '#f2b46a', {}, 4), s * 3, 17.6, 3.6, 0, 0, -s * 0.3))
  eyes(cat, 0.7, 1.9, 13.6, 8.6)
  cat.add(ball(1.8, '#fff6ea', { y: 11.6, z: 8.2 }, [1.3, 0.8, 0.6]))
  cat.add(noOutlineDeep(ball(0.4, '#e8909a', { y: 12.5, z: 9.2 })))
  cat.position.set(-4, t, 0)
  g.add(cat)
  return g
}

/** 宠物饮水机：底座 + 透明水箱 + 顶上的花形出水口和发光的指示灯 */
function petFountain(p: string[]) {
  const [body, accent, light] = p
  const g = new THREE.Group()
  g.add(cup(10, 9, 6.5, 0.8, body))
  g.add(clear(cyl(8.6, 8.6, 6.8, C.glass, { y: 6.2 }, 32), C.glass, 0.3))
  g.add(clear(cyl(8.1, 8.1, 5.8, WATER, { y: 6.5 }, 32), WATER, 0.4))
  g.add(cup(10.2, 8.8, 3, 0.7, accent, { y: 12.6 }))
  g.add(clear(cyl(9.3, 9.3, 0.3, WATER, { y: 14.6 }, 32), WATER, 0.5))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    g.add(P(ball(1.3, body, {}, [1, 0.3, 0.6]), Math.cos(a) * 1.3, 15.6, Math.sin(a) * 1.3, 0, -a, 0.3))
  }
  g.add(cyl(0.8, 1, 1.4, body, { y: 14.6 }, 12))
  g.add(lit(cyl(0.7, 0.7, 0.3, light, { y: 16 }, 12), light, 0.9))
  g.add(glow(1.2, 0.6, light, { y: 3, z: 9.6 }, 0.9))
  return g
}

// ======================================================================
// 配色
// ======================================================================

const HAM_PALS: Pal[] = [
  ['cute', [C.sky, C.white, C.pink]],
  ['cute', [C.sakura, '#f6f2ea', C.mint]],
  ['nordic', [N.white, N.gray, N.sage]],
  ['modern', [M.char, M.black, M.white]],
  ['retro', [R.teal, R.cream, R.orange]],
]
const ACRYL_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.silver]],
  ['nordic', [N.oak, N.sage, N.white]],
  ['cute', [C.mint, C.pink, C.white]],
  ['industrial', [I.iron, I.walnut, I.steel]],
]
const CASTLE_PALS: Pal[] = [
  ['cute', [C.lemon, C.white, C.sky]],
  ['cute', [C.lilac, C.white, C.mint]],
  ['retro', [R.orange, R.cream, R.teal]],
  ['modern', [M.white, M.gray, M.char]],
]
const ORB_PALS: Pal[] = [
  ['cute', ['#ffd6e0', C.pink]],
  ['cute', [C.sky, '#5fa8e0']],
  ['modern', ['#e8e8e8', M.char]],
  ['retro', ['#f4dc9a', R.orange]],
]
const CARRIER_PALS: Pal[] = [
  ['cute', [C.mint, C.white]],
  ['cute', [C.pink, C.white]],
  ['nordic', [N.sage, N.white]],
  ['modern', [M.char, M.light]],
]
const RABBIT_PALS: Pal[] = [
  ['nordic', [N.white, N.gray, N.oak]],
  ['cute', [C.sakura, C.white, C.woodL]],
  ['modern', [M.char, M.black, M.light]],
  ['industrial', [I.iron, I.steel, I.walnut]],
]
const GUINEA_PALS: Pal[] = [
  ['cute', [C.mint, C.white, C.lilac]],
  ['nordic', [N.white, N.gray, N.sage]],
  ['modern', [M.char, M.black, M.light]],
  ['retro', [R.olive, R.cream, R.mustard]],
]
const CHIN_PALS: Pal[] = [
  ['industrial', [I.iron, I.iron, I.walnut]],
  ['nordic', [N.white, N.white, N.oak]],
  ['modern', [M.char, M.black, M.light]],
  ['cute', [C.sky, C.white, C.woodL]],
]
const DOME_PALS: Pal[] = [
  ['retro', [R.cream, '#c9a24a', R.teal]],
  ['cute', [C.sakura, C.white, C.mint]],
  ['modern', [M.black, M.black, M.silver]],
  ['nordic', [N.white, N.white, N.sage]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
const STAND_PALS: Pal[] = [
  ['retro', ['#b8913f', '#c9a24a', R.cream]],
  ['modern', [M.black, M.black, M.white]],
  ['nordic', [N.oak, N.white, N.sage]],
  ['industrial', [I.iron, I.steel, I.walnut]],
  ['cute', [C.white, C.white, C.pink]],
]
const SQUARE_PALS: Pal[] = [
  ['modern', [M.white, M.white, M.char]],
  ['cute', [C.sky, C.white, C.pink]],
  ['nordic', [N.oak, N.white, N.sage]],
  ['industrial', [I.iron, I.iron, I.rust]],
]
const BAMBOO_PALS: Pal[] = [
  ['japanese', ['#dcc48e', J.dark, J.ai]],
  ['japanese', ['#8a6a45', J.sumi, J.shu]],
  ['nordic', ['#e6d3a8', N.oak, N.sage]],
  ['retro', ['#d1b27a', R.caramel, R.red]],
]
const PERCH_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.sage]],
  ['cute', [C.mint, C.woodL, C.pink]],
  ['japanese', [J.dark, J.hinoki, J.shu]],
  ['modern', [M.char, WOOD, M.silver]],
]
const TERRA_PALS: Pal[] = [
  ['modern', [M.black, '#7a5236', M.silver]],
  ['industrial', [I.iron, I.walnut, I.rust]],
  ['nordic', [N.white, N.oak, N.sage]],
]
const TURTLE_PALS: Pal[] = [
  ['modern', [M.black, '#9b9185', M.silver]],
  ['cute', [C.sky, '#c9b49a', C.lemon]],
  ['nordic', [N.white, N.oak, N.sage]],
  ['japanese', [J.sumi, '#8f8a80', J.shu]],
]
const GOLDFISH_PALS: Pal[] = [
  ['japanese', [J.dark, '#e9dcc0', J.shu]],
  ['cute', [C.pink, '#f3e3c3', C.sky]],
  ['retro', [R.teal, '#efe0c2', R.orange]],
  ['nordic', [N.oak, '#ece4d4', N.blue]],
]
const MEDAKA_PALS: Pal[] = [
  ['japanese', [J.ai, '#5a4a3a', '#f4b6c8']],
  ['japanese', ['#8a5a3a', '#4a3a2e', '#ffffff']],
  ['modern', [M.char, '#3a3a3a', '#f4b6c8']],
  ['nordic', ['#c9d3c0', '#5a4a3a', '#ffffff']],
  ['retro', [R.olive, '#4a3a2e', '#f8c9a0']],
]
const CRATE_PALS: Pal[] = [
  ['modern', [M.black, M.char, M.light]],
  ['nordic', [N.white, N.gray, N.linen]],
  ['industrial', [I.iron, I.iron, I.leather]],
  ['cute', [C.white, C.sky, C.pink]],
]
const PEN_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.sage]],
  ['modern', [M.light, M.char, M.gray]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['industrial', [I.concrete, I.iron, I.leather]],
]
const BAG_PALS: Pal[] = [
  ['modern', [M.char, M.black, '#2a2a2e']],
  ['nordic', [N.linen, N.oak, '#5a5650']],
  ['cute', [C.sakura, C.white, '#6b5a5a']],
  ['retro', [R.mustard, R.caramel, '#4a3a2a']],
]
const FOUNTAIN_PALS: Pal[] = [
  ['modern', [M.white, M.silver, '#7fd0ff']],
  ['cute', [C.white, C.mint, '#7fe0b0']],
  ['nordic', [N.white, N.oak, '#ffd27a']],
  ['modern', [M.char, M.black, '#7fd0ff']],
]

// ======================================================================
// 素材表
// ======================================================================

export const PET_HABITATS: AssetDef[] = [
  // 仓鼠
  prop('ph-hamster-cage-60', '仓鼠笼', [61.6, 36.7, 39.1], HAM_PALS, (p) => hamsterWire(p, 60, 36, 26), { family: 'ph-hamster-cage', sizeLabel: '金属丝笼 60', limit: SMALL_HOME }),
  prop('ph-hamster-cage-45', '仓鼠笼', [46.6, 30.7, 33.1], HAM_PALS, (p) => hamsterWire(p, 45, 30, 22), { family: 'ph-hamster-cage', sizeLabel: '金属丝笼 45', limit: SMALL_HOME }),
  prop('ph-hamster-acrylic', '仓鼠笼', [60.6, 35.6, 30.4], ACRYL_PALS, hamsterAcrylic, { family: 'ph-hamster-cage', sizeLabel: '亚克力箱 60', limit: SMALL_HOME }),
  prop('ph-hamster-castle', '多层仓鼠城堡', [63.5, 30.7, 50.3], CASTLE_PALS, hamsterCastle, { limit: SMALL_HOME }),
  prop('ph-hamster-orb', '仓鼠散步舱', [18.5, 18, 18.4], ORB_PALS, hamsterOrb),
  prop('ph-hamster-carrier', '仓鼠外出提笼', [23, 14.4, 20], CARRIER_PALS, hamsterCarrier),
  // 兔 / 豚鼠 / 龙猫
  def('ph-rabbit-cage', '两层兔笼', [90.2, 58.8, 92.7], RABBIT_PALS, rabbitCage, { limit: SMALL_HOME }),
  def('ph-guinea-pen', '豚鼠围栏', [120.2, 60.2, 38.6], GUINEA_PALS, guineaPen, { limit: SMALL_HOME }),
  def('ph-chinchilla-cage', '龙猫高笼', [64.2, 46.8, 119], CHIN_PALS, chinchillaCage, { limit: SMALL_HOME }),
  // 鸟
  prop('ph-birdcage-dome', '圆顶鸟笼', [29.4, 29.4, 49.6], DOME_PALS, domeStanding, { family: 'ph-birdcage-dome', form: 'standing', limit: BIRD_HOME }),
  prop('ph-birdcage-dome-hanging', '圆顶鸟笼', [29.4, 29.4, 49.6], DOME_PALS, domeHanging, { family: 'ph-birdcage-dome', form: 'hanging', limit: BIRD_HOME }),
  def('ph-birdcage-stand', '落地鸟笼支架', [60.7, 48, 172.5], STAND_PALS, birdcageStand, { limit: BIRD_HOME }),
  prop('ph-birdcage-square', '方形大鸟笼', [46, 41.1, 62.8], SQUARE_PALS, (p) => squareCage(p, 46, 40, 48, ['budgie', 'budgie-blue']), { family: 'ph-birdcage-square', sizeLabel: '桌上 46', limit: BIRD_HOME }),
  def('ph-birdcage-square-stand', '方形大鸟笼', [60, 47.5, 153], SQUARE_PALS, squareStand, { family: 'ph-birdcage-square', sizeLabel: '带脚架 60', limit: BIRD_HOME }),
  prop('ph-birdcage-bamboo', '和风竹编鸟笼', [30.6, 25.2, 43.1], BAMBOO_PALS, bambooStanding, { family: 'ph-birdcage-bamboo', form: 'standing', limit: BIRD_HOME }),
  prop('ph-birdcage-bamboo-hanging', '和风竹编鸟笼', [30.6, 25.2, 43.1], BAMBOO_PALS, bambooHanging, { family: 'ph-birdcage-bamboo', form: 'hanging', limit: BIRD_HOME }),
  prop('ph-bird-perch', '鸟栖架', [40, 28, 45], PERCH_PALS, perchStand),
  // 爬宠 / 水族
  prop('ph-terrarium', '爬宠饲养箱', [60, 45.8, 55.1], TERRA_PALS, terrarium),
  prop('ph-turtle-tank', '乌龟缸', [60.4, 31.5, 44.6], TURTLE_PALS, turtleTank),
  prop('ph-goldfish-bowl', '金鱼缸', [28.2, 28.3, 27.5], GOLDFISH_PALS, goldfishBowl, { family: 'ph-goldfish-bowl', sizeLabel: '波浪口玻璃钵' }),
  prop('ph-medaka-bowl', '青鳉睡莲钵', [38, 38, 22], MEDAKA_PALS, medakaBowl),
  // 狗 / 猫
  def('ph-dog-crate-s', '狗笼', [63.6, 46.6, 54.7], CRATE_PALS, (p) => dogCrate(p, 62, 45, 50), { family: 'ph-dog-crate', sizeLabel: 'S（小型犬）' }),
  def('ph-dog-crate-m', '狗笼', [93.6, 60.6, 68.7], CRATE_PALS, (p) => dogCrate(p, 92, 59, 64), { family: 'ph-dog-crate', sizeLabel: 'M（中型犬）' }),
  def('ph-dog-pen', '狗围栏', [120, 80.5, 61.9], PEN_PALS, dogPen),
  prop('ph-cat-carrier', '猫外出包', [46, 28, 40.2], BAG_PALS, catCarrier),
  prop('ph-pet-fountain', '宠物饮水机', [20.4, 20.4, 16.3], FOUNTAIN_PALS, petFountain),
]
