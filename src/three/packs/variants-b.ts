// 款式包 B：一键布置里高频出现、但原来只有一种造型的素材，补出不同结构 / 轮廓的款式。
// 每款都放进原款的 family（family 名 = 原款 id），尺寸贴近原款（宽深差在 ±10% 以内），一键布置可以直接换款。
// 约定见 kit.ts 开头；id 前缀 vb-。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, toon, torus, tray, useAnisotropy } from '../toon'
import { C, G, SWING_OPEN, ellipsePoly, movable, rectPoly, rng, slab, type AssetCategory, type AssetDef, type DoorMotion, type Poly, type SurfaceDef } from '../kit'
import { PI, clearDeep, fitChildrenBuild, lit, mesh, noOutlineDeep, rod3, tube, type TubeOpts, type V3 } from '../geo'
import { I, J, M, N, R, type Build, type Pal3 } from '../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = {}

const SOIL = '#8b6a4f'
const BRASS = '#e9c46a'
const STEM = '#8fb35a'
const BARK = '#a3916e'
const CACTUS = '#6fa86a'
const CACTUS_D = '#4f8a55'
const STEEL = '#c3c7cc'
const DARK = '#3a3a3c'
const WATER = '#cfeeff'
/** 书脊颜色：偏柔和，和各种风格的柜子都搭 */
const BOOKC = ['#c96f5a', '#e3b549', '#6f8fa8', '#8aa37b', '#efe6d6', '#5a4646', '#d98fa0', '#9a7bb0', '#f4e7c8', '#3d5a80']

// ---------- 小工具 ----------

/** 旋转体：profile 为 [半径, 高] */
function lathe(profile: [number, number][], color: string, seg = 32) {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), color)
}
/** 竖直挤出的柱体：截面 poly（[x, z]），底面 y0、高 h，不倒角 */
function prism(poly: Poly, h: number, color: string, y0 = 0) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 })
  geo.rotateX(-PI / 2)
  const m = mesh(geo, color)
  m.position.y = y0
  return m
}
/** 叶片 / 细长片：压扁的球，叶柄端在 base，沿 dir 伸出 */
function blade(len: number, wide: number, thick: number, color: string, base: V3, dir: THREE.Vector3) {
  const d = dir.clone().normalize()
  const m = ball(len / 2, color, {}, [wide, thick, 1])
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)
  m.position.set(base[0] + (d.x * len) / 2, base[1] + (d.y * len) / 2, base[2] + (d.z * len) / 2)
  return m
}
/** 花盆：空心盆 + 口沿下 2.2cm 的土面 */
function bigPot(rTop: number, rBot: number, h: number, t: number, color: string, y0 = 0) {
  const g = G(cup(rTop, rBot, h, t, color, { y: y0 }))
  const r = rBot + ((rTop - rBot) * (h - 3)) / h - t - 0.3
  g.add(cyl(r, r, 0.8, SOIL, { y: y0 + h - 3 }, 32))
  return g
}
/** 圆台在高度 y 处的半径 */
const rAt = (rTop: number, rBot: number, h: number, y: number) => rBot + ((rTop - rBot) * y) / h
/** 二次贝塞尔 */
function bez(a: V3, b: V3, c: V3, t: number): V3 {
  const u = 1 - t
  return [0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * b[k] + t * t * c[k]) as V3
}
/** 一排书：从 x0 排到 x1，底面 y，进深中心 z */
function books(g: THREE.Group, x0: number, x1: number, y: number, z: number, dep: number, maxH: number, seed: number, cols = BOOKC) {
  const r = rng(seed)
  let x = x0
  while (x < x1 - 1.5) {
    const bw = 1.6 + r() * 2.6
    if (x + bw > x1) break
    const bh = maxH * (0.68 + r() * 0.32)
    g.add(rbox(bw - 0.2, bh, dep - r() * 2, cols[Math.floor(r() * cols.length)], { x: x + bw / 2, y, z }, 0.35))
    x += bw
    if (r() < 0.08) x += 3 + r() * 4
  }
}
/** 平躺的一叠书（层板上的点缀）：底面 y */
function flatBooks(g: THREE.Group, x: number, y: number, z: number, n: number, seed: number) {
  const r = rng(seed)
  let yy = y
  for (let i = 0; i < n; i++) {
    const t = 2 + r() * 1.4
    g.add(rbox(18 - i * 1.2, t, 13 - i * 0.6, BOOKC[Math.floor(r() * BOOKC.length)], { x: x + (r() - 0.5), y: yy, z, ry: (r() - 0.5) * 0.3 }, 0.35))
    yy += t
  }
  return yy
}

/** 圆形画布贴片：平铺在 y 高度，朝上；key 相同的共用贴图 */
const discCache = new Map<string, THREE.CanvasTexture>()
function paintDisc(r: number, key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, y: number) {
  const s = 512
  let tex = discCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas')
    cv.width = s
    cv.height = s
    draw(cv.getContext('2d')!, s)
    tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    useAnisotropy(tex)
    discCache.set(key, tex)
  }
  const geo = new THREE.CircleGeometry(r, 64).rotateX(-PI / 2)
  const mat = new THREE.MeshToonMaterial({ map: tex, color: '#ffffff', gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap })
  const m = new THREE.Mesh(geo, mat)
  m.position.y = y
  m.userData.noOutline = true
  m.receiveShadow = true
  return m
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
const swing = (left: boolean): DoorMotion => ({ kind: 'swing', angle: (left ? -1 : 1) * SWING_OPEN })
/** 抽屉盒（面板后面的箱子）：[口 x0, 口 x1, 盒底 y, 盒高, 面板背面 z, 盒深] */
type Tray = readonly [number, number, number, number, number, number]
function trayParts([x0, x1, y, h, z1, depth]: Tray, color: string): THREE.Object3D[] {
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  const zc = z1 - depth / 2
  return [rbox(w, 1, depth, color, { x: cx, y, z: zc }, 0.2), rbox(1, h, depth, color, { x: x0 + 0.5, y, z: zc }, 0.2), rbox(1, h, depth, color, { x: x1 - 0.5, y, z: zc }, 0.2), rbox(w - 2, h, 1, color, { x: cx, y, z: z1 - depth + 0.5 }, 0.2)]
}
/** 抽屉格，打开时随抽屉拉出 */
function trayLevel([x0, x1, y, h, z1, depth]: Tray): SurfaceDef {
  return { y: y + 1, h: Math.round((h - 1.5) * 10) / 10, inside: true, slide: Math.round(depth * 0.6), shape: [rectPoly(x0 + 1.2, z1 - depth + 1.2, x1 - 1.2, z1 - 0.4)] }
}
function drawer(face: THREE.Object3D[], t: Tray, color: string) {
  return moving([...face, ...trayParts(t, color)], [0, 0, 0], { kind: 'drawer', dz: Math.round(t[5] * 0.6) })
}
/** 空心柜体：外框 x ±w/2、y0..y1、z0（背）..z1（前），板厚 t（正面敞开） */
function hollow(w: number, y0: number, y1: number, z0: number, z1: number, color: string, t = 1.6, r = 0.4) {
  const d = z1 - z0
  const zc = (z0 + z1) / 2
  return [
    ...[-1, 1].map((s) => rbox(t, y1 - y0, d, color, { x: s * (w / 2 - t / 2), y: y0, z: zc }, r)),
    rbox(w - t * 2, y1 - y0, 1.2, shade(color, -0.05), { y: y0, z: z0 + 0.6 }, 0.3),
    rbox(w - t * 2, t, d, color, { y: y0, z: zc }, 0.3),
    rbox(w - t * 2, t, d, color, { y: y1 - t, z: zc }, 0.3),
  ]
}
/** 柜内一层：x ±(w/2 - 板厚)，z 从背板前到门后 */
const inner = (w: number, z0: number, z1: number, t = 1.6) => [rectPoly(-w / 2 + t + 0.4, z0 + 1.6, w / 2 - t - 0.4, z1 - 0.6)]

/** 整体平移（带 fx 的素材不走 fit，手动居中） */
function shift(g: THREE.Group, dx: number, dz: number) {
  for (const c of g.children) {
    c.position.x += dx
    c.position.z += dz
  }
  return g
}

/**
 * 定义一款。带 surface / surfaces / fx 的（坐标要和声明对得上）builder 自己保证居中贴地，其余自动 fit。
 */
function vb(id: string, name: string, family: string, sizeLabel: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pal3[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  const keep = !!(extra.fx || extra.surface !== undefined || extra.surfaces)
  return {
    id,
    name,
    family,
    sizeLabel,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => [x[1], x[2], x[3]]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    ...extra,
    build: keep ? build : fitChildrenBuild(build),
  }
}

// ======================================================================
// 大型落地绿植（family monstera）
// ======================================================================

/** 虎尾兰：宽口水泥钵里三丛剑形叶，叶缘一圈黄绿 [盆, 盆腰带, -] */
function snakePlant(p: string[]) {
  const [potC, band] = p
  const g = G(bigPot(31, 24, 24, 2, potC))
  g.add(torus(rAt(31, 24, 24, 7) + 0.15, 0.7, band, { y: 7, rx: PI / 2 }))
  const rand = rng(17)
  const clumps: [number, number, number, number][] = [
    [0, -5, 9, 72],
    [-14, 8, 6, 48],
    [14, 8, 6, 52],
  ]
  for (const [cx, cz, n, base] of clumps)
    for (let i = 0; i < n; i++) {
      const L = base + rand() * 22
      const a = (i / n) * PI * 2 + rand() * 0.5
      const tilt = 0.04 + rand() * 0.12
      const inner = G(ball(L / 2, '#c9d36a', { y: L / 2 }, [0.19, 1, 0.05]), ball(L / 2 - 0.7, i % 2 ? C.leafD : '#5f9f5c', { y: L / 2 }, [0.16, 1, 0.075]))
      inner.rotation.y = rand() * PI
      const lg = G(inner)
      lg.position.set(cx + Math.cos(a) * 2.5, 20.5, cz + Math.sin(a) * 2.5)
      lg.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)
      g.add(lg)
    }
  return g
}

/** 散尾葵：高藤编筒盆，九根拱形羽状叶 [盆, 编织带, -] */
function areca(p: string[]) {
  const [potC, band] = p
  const g = G(bigPot(17, 14, 34, 1.6, potC))
  for (const y of [5, 12, 19, 26]) g.add(torus(rAt(17, 14, 34, y) + 0.1, 0.55, band, { y, rx: PI / 2 }))
  const rand = rng(23)
  const n = 9
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand() * 0.4
    const H = 62 + rand() * 42
    const Rr = 29 + rand() * 5
    const c = Math.cos(a)
    const s = Math.sin(a)
    const P0: V3 = [c * 1.5, 30, s * 1.5]
    const P1: V3 = [c * Rr * 0.32, 30 + H, s * Rr * 0.32]
    const P2: V3 = [c * Rr, 30 + H * 0.7, s * Rr]
    g.add(tube(Array.from({ length: 9 }, (_, k) => bez(P0, P1, P2, k / 8)), 0.55, STEM, { ...TUBE, seg: 16, radial: 5 }))
    for (let k = 3; k <= 13; k++) {
      const t = k / 14
      const pos = bez(P0, P1, P2, t)
      const nx = bez(P0, P1, P2, Math.min(1, t + 0.02))
      const tan = new THREE.Vector3(nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]).normalize()
      const side = new THREE.Vector3().crossVectors(tan, up).normalize()
      const len = 16 * (1 - 0.45 * t)
      for (const sd of [-1, 1]) {
        const dir = side.clone().multiplyScalar(sd * 0.85).add(tan.clone().multiplyScalar(0.45)).add(new THREE.Vector3(0, -0.3, 0))
        g.add(blade(len, 0.17, 0.06, (k + sd) % 3 ? C.leaf : C.leafD, pos, dir))
      }
    }
  }
  return g
}

/** 发财树：三股编辫树干 + 掌状复叶，釉面盆配托盘 [盆, 托盘, -] */
function pachira(p: string[]) {
  const [potC, saucer] = p
  const g = G(puck(20, 2.4, saucer), bigPot(19, 15, 30, 2, potC, 2))
  g.add(cyl(4.2, 6, 6, BARK, { y: 27 }, 14))
  for (let k = 0; k < 3; k++) {
    const pts: V3[] = []
    for (let j = 0; j <= 12; j++) {
      const y = 31 + j * 6.4
      const ang = (k * 2 * PI) / 3 + y * 0.09
      const r = 2.4 * (1 - j / 26)
      pts.push([Math.cos(ang) * r, y, Math.sin(ang) * r])
    }
    g.add(tube(pts, 1.5, shade(BARK, k * 0.04), { ...TUBE, seg: 40, radial: 8 }))
  }
  const rand = rng(31)
  const top: V3 = [0, 106, 0]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + rand() * 0.3
    const tip: V3 = [Math.cos(a) * 15, 110 + rand() * 12, Math.sin(a) * 15]
    g.add(noOutlineDeep(rod3(top, tip, 0.4, STEM, 5)))
    for (let k = -2; k <= 2; k++) {
      const ang = a + k * 0.42
      g.add(blade(18 - Math.abs(k) * 2.2, 0.36, 0.08, k % 2 ? C.leafD : C.leaf, tip, new THREE.Vector3(Math.cos(ang), -0.22 + Math.abs(k) * 0.05, Math.sin(ang))))
    }
  }
  return g
}

/** 龟背竹叶：带裂口和小孔的心形叶片，平铺在 xz 面上、沿 -z 伸出，叶柄连接点在原点 */
function monsteraLeaf(L: number, color: string) {
  const hw = (t: number) => L * 0.44 * Math.pow(Math.sin(PI * (0.06 + t * 0.94)), 0.75)
  const yy = (t: number) => L * (-0.14 + t)
  const slits = [0.24, 0.4, 0.56, 0.72]
  const right: [number, number][] = []
  for (let i = 0; i <= 36; i++) {
    const t = i / 36
    if (slits.some((c) => Math.abs(t - c) < 0.028)) continue
    right.push([hw(t), yy(t)])
  }
  for (const c of slits) {
    const k = right.findIndex((q) => q[1] > yy(c))
    right.splice(k, 0, [hw(c - 0.022), yy(c - 0.022)], [hw(c) * 0.38, yy(c) + L * 0.035], [hw(c + 0.022), yy(c + 0.022)])
  }
  const s = new THREE.Shape()
  s.moveTo(0, yy(0) + L * 0.07)
  for (const [x, y] of right) s.lineTo(x, y)
  for (let i = right.length - 2; i >= 0; i--) s.lineTo(-right[i][0], right[i][1])
  s.lineTo(0, yy(0) + L * 0.07)
  for (const sd of [-1, 1])
    for (const c of [0.32, 0.48, 0.64]) {
      const h = new THREE.Path()
      h.absellipse(sd * L * 0.09, yy(c), L * 0.022, L * 0.035, 0, PI * 2, true, 0)
      s.holes.push(h)
    }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false, curveSegments: 8 })
  geo.translate(0, 0, -0.175)
  geo.rotateX(-PI / 2)
  return mesh(geo, color)
}

/** 龟背竹（藤篮款）：编织圆篮 + 两侧绳把手，叶片是真的带裂口的心形叶 [篮, 编织带 / 把手, -] */
function monsteraBasket(p: string[]) {
  const [basket, band] = p
  const g = G(bigPot(19, 15, 30, 1.6, basket))
  for (const y of [6, 12, 18, 24]) g.add(torus(rAt(19, 15, 30, y) + 0.1, 0.6, band, { y, rx: PI / 2 }))
  for (const sd of [-1, 1]) g.add(torus(3.5, 0.6, band, { x: sd * 18.6, y: 25, ry: PI / 2 }, PI))
  const rand = rng(5)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + rand() * 0.5
    const h = 42 + rand() * 46
    const L = 29 + rand() * 6
    const tilt = Math.min(0.14 + rand() * 0.2, Math.asin(Math.min(1, 12 / h)))
    const tip: V3 = [Math.cos(a) * Math.sin(tilt) * h, 26 + Math.cos(tilt) * h, Math.sin(a) * Math.sin(tilt) * h]
    g.add(noOutlineDeep(rod3([0, 26, 0], tip, 0.75, C.leafD, 6)))
    const leaf = monsteraLeaf(L, i % 2 ? C.leaf : shade(C.leaf, -0.08))
    const lg = G(leaf)
    lg.position.set(...tip)
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    lg.rotation.set(-0.25 - rand() * 0.35, Math.atan2(-dx, -dz), (rand() - 0.5) * 0.4, 'YXZ')
    g.add(lg)
  }
  return g
}

/** 带竖棱的仙人柱截面 */
function ribPoly(r: number, ribs = 10): Poly {
  return Array.from({ length: 60 }, (_, i): [number, number] => {
    const a = (i / 60) * PI * 2
    const k = r * (0.86 + 0.14 * Math.abs(Math.cos((ribs / 2) * a)))
    return [Math.cos(a) * k, Math.sin(a) * k]
  })
}
/** 一根仙人柱：(x, z) 处，底面 y0、高 h，带圆顶 */
function column(g: THREE.Group, x: number, z: number, y0: number, h: number, r: number, color: string) {
  const c = prism(ribPoly(r), h, color, y0)
  c.position.x = x
  c.position.z = z
  g.add(c)
  g.add(ball(r * 0.93, color, { x, y: y0 + h, z }, [1, 0.7, 1]))
}

/** 仙人掌组合：宽口浅钵里三根带臂仙人柱 + 金琥 + 白色碎石 [盆, 花, -] */
function cactusGarden(p: string[]) {
  const [potC, flower] = p
  const g = G(bigPot(31, 25, 22, 2, potC))
  const soil = 19.6
  const rand = rng(41)
  for (let i = 0; i < 16; i++) {
    const a = rand() * PI * 2
    const r = 8 + rand() * 18
    g.add(ball(1 + rand() * 0.9, i % 3 ? '#e8e4dc' : '#c9c4bb', { x: Math.cos(a) * r, y: soil + 0.5, z: Math.sin(a) * r }, [1, 0.6, 1]))
  }
  // 主柱 + 两条臂
  column(g, 2, -5, soil - 1, 92, 6.5, CACTUS)
  g.add(tube([[-3, 50, -5], [-10, 51, -5], [-15, 55, -5], [-15.5, 60, -5]], 4.2, CACTUS, { ...TUBE, seg: 16, radial: 12 }))
  column(g, -15.5, -5, 59, 22, 4.4, CACTUS)
  g.add(tube([[7, 62, -5], [14, 63, -5], [18.5, 67, -5], [19, 72, -5]], 3.8, CACTUS, { ...TUBE, seg: 16, radial: 12 }))
  column(g, 19, -5, 71, 16, 4, CACTUS)
  column(g, -12, 9, soil - 1, 50, 5.4, CACTUS_D)
  column(g, 14, 10, soil - 1, 32, 4.6, CACTUS)
  // 金琥
  g.add(ball(7, '#8fbf6a', { x: -1, y: soil + 5, z: 14 }, [1, 0.8, 1]))
  for (const [x, y, z] of [
    [14, soil + 35, 10],
    [-1, soil + 10.6, 14],
    [2, soil + 96, -5],
  ] as V3[]) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2
      g.add(ball(1.5, flower, { x: x + Math.cos(a) * 1.4, y, z: z + Math.sin(a) * 1.4 }, [1, 0.6, 1]))
    }
    g.add(ball(0.9, C.lemon, { x, y: y + 0.4, z }))
  }
  return g
}

// ======================================================================
// 圆地毯（family rug-round）：底层投影关掉，内层不描边，和原款一致
// ======================================================================

function flat<T extends THREE.Mesh>(m: T, outline = false): T {
  m.castShadow = false
  if (!outline) m.userData.noOutline = true
  return m
}
/** 花瓣边轮廓 */
function petalPoly(r: number, amp: number, petals: number): Poly {
  return Array.from({ length: 144 }, (_, i): [number, number] => {
    const a = (i / 144) * PI * 2
    const k = r - amp + amp * Math.abs(Math.cos((petals / 2) * a))
    return [Math.cos(a) * k, Math.sin(a) * k]
  })
}

/** 花瓣圆地毯：十二瓣花形边 + 内圈小花 + 圆心 [底, 内圈, 圆心] */
function rugPetal(p: string[]) {
  const [main, sub, acc] = p
  const g = G(flat(slab(petalPoly(78, 7, 12), 1.2, main), true))
  g.add(flat(slab(petalPoly(58, 6, 12), 1.6, sub)))
  g.add(flat(slab(petalPoly(36, 4, 8), 2, main)))
  g.add(flat(puck(14, 2.4, acc)))
  return g
}

/** 椭圆环纹地毯：一圈圈同心椭圆色带 [底, 色带, 点缀] */
function rugOvalRings(p: string[]) {
  const [main, sub, acc] = p
  const g = G(flat(slab(ellipsePoly(82, 68, 0, 0, 64), 1.2, main), true))
  const rings: [number, number, number, string][] = [
    [72, 58, 1.5, sub],
    [62, 48, 1.8, main],
    [50, 37, 2.1, acc],
    [38, 26, 2.4, sub],
    [22, 13, 2.7, main],
  ]
  for (const [a, b, t, c] of rings) g.add(flat(slab(ellipsePoly(a, b, 0, 0, 64), t, c)))
  return g
}

/** 黄麻螺旋地毯：一根粗绳从中心盘出来，中间夹一圈彩色绳，外缘包边 [绳, 彩绳, 包边] */
function rugJute(p: string[]) {
  const [rope, band, edge] = p
  const g = G(flat(cyl(73, 73, 1, shade(rope, -0.15), {}, 64), true))
  const spiral = (r0: number, r1: number, color: string) => {
    const pitch = 3.1
    const turns = (r1 - r0) / pitch
    const n = Math.ceil(turns * 40)
    const a0 = (r0 / pitch) * PI * 2
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const r = r0 + (r1 - r0) * t
      const a = a0 + turns * PI * 2 * t
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
    }
    const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 1.45, 6, false), color)
    m.scale.y = 0.5
    m.position.y = 1.5
    m.castShadow = false
    m.userData.noOutline = true
    g.add(m)
  }
  spiral(1.5, 40, rope)
  spiral(40, 49.3, band)
  spiral(49.3, 71, rope)
  const e = torus(73, 1.5, edge, { y: 1.3, rx: PI / 2 })
  e.scale.z = 0.8
  e.castShadow = false
  g.add(e)
  return g
}

/** 圆形蔺草垫：草编纹 + 布包边 + 中心圆纹 [草色, 包边, 圆纹] */
function rugRush(p: string[]) {
  const [rush, edge, acc] = p
  const g = G(flat(cyl(69.5, 69.5, 1.2, shade(rush, -0.1), {}, 64), true))
  g.add(
    paintDisc(
      69.5,
      `vb-rush-${rush}-${acc}`,
      (c, s) => {
        c.fillStyle = rush
        c.fillRect(0, 0, s, s)
        c.strokeStyle = shade(rush, -0.12)
        c.lineWidth = 2
        for (let y = 3; y < s; y += 7) {
          c.beginPath()
          c.moveTo(0, y)
          c.lineTo(s, y)
          c.stroke()
        }
        c.strokeStyle = acc
        c.lineWidth = 7
        for (const r of [0.18, 0.3]) {
          c.beginPath()
          c.arc(s / 2, s / 2, s * r, 0, PI * 2)
          c.stroke()
        }
        c.fillStyle = acc
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * PI * 2
          c.beginPath()
          c.arc(s / 2 + Math.cos(a) * s * 0.24, s / 2 + Math.sin(a) * s * 0.24, s * 0.018, 0, PI * 2)
          c.fill()
        }
      },
      1.5,
    ),
  )
  const e = torus(70, 1.8, edge, { y: 1.3, rx: PI / 2 })
  e.scale.z = 0.62
  e.castShadow = false
  g.add(e)
  return g
}

/** 圆形花纹地毯：八角星 + 菱形 + 锯齿边的手绘纹样，一圈流苏 [底, 纹样, 点缀] */
function rugMedallion(p: string[]) {
  const [main, sub, acc] = p
  const g = G(flat(cyl(75, 75, 1.2, shade(main, -0.12), {}, 64), true))
  g.add(
    paintDisc(
      74.6,
      `vb-medal-${main}-${sub}-${acc}`,
      (c, s) => {
        const m = s / 2
        c.fillStyle = main
        c.fillRect(0, 0, s, s)
        const ring = (r: number, w: number, col: string) => {
          c.strokeStyle = col
          c.lineWidth = w
          c.beginPath()
          c.arc(m, m, r, 0, PI * 2)
          c.stroke()
        }
        ring(s * 0.47, s * 0.03, sub)
        // 锯齿边
        c.fillStyle = acc
        for (let k = 0; k < 48; k++) {
          const a = (k / 48) * PI * 2
          const a2 = ((k + 0.5) / 48) * PI * 2
          const a3 = ((k + 1) / 48) * PI * 2
          c.beginPath()
          c.moveTo(m + Math.cos(a) * s * 0.44, m + Math.sin(a) * s * 0.44)
          c.lineTo(m + Math.cos(a2) * s * 0.4, m + Math.sin(a2) * s * 0.4)
          c.lineTo(m + Math.cos(a3) * s * 0.44, m + Math.sin(a3) * s * 0.44)
          c.fill()
        }
        ring(s * 0.36, s * 0.012, sub)
        // 八角星
        c.fillStyle = sub
        c.beginPath()
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * PI * 2
          const r = k % 2 ? s * 0.16 : s * 0.3
          c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r)
        }
        c.fill()
        c.fillStyle = acc
        c.beginPath()
        c.arc(m, m, s * 0.09, 0, PI * 2)
        c.fill()
        // 菱形
        c.fillStyle = acc
        for (let k = 0; k < 8; k++) {
          const a = ((k + 0.5) / 8) * PI * 2
          const x = m + Math.cos(a) * s * 0.33
          const y = m + Math.sin(a) * s * 0.33
          c.beginPath()
          c.moveTo(x, y - s * 0.03)
          c.lineTo(x + s * 0.02, y)
          c.lineTo(x, y + s * 0.03)
          c.lineTo(x - s * 0.02, y)
          c.fill()
        }
      },
      1.5,
    ),
  )
  const e = torus(75, 0.9, sub, { y: 1.1, rx: PI / 2 })
  e.castShadow = false
  g.add(e)
  for (let k = 0; k < 56; k++) {
    const a = (k / 56) * PI * 2
    const t = rbox(0.9, 0.5, 4.2, C.cream, { x: Math.cos(a) * 77.4, z: Math.sin(a) * 77.4, ry: -a + PI / 2 }, 0.2)
    t.castShadow = false
    t.userData.noOutline = true
    g.add(t)
  }
  return g
}

// ======================================================================
// 圆茶几（family coffee-table）
// ======================================================================

/** 鼓形实木茶几：整块圆鼓身 + 两道刻线 + 收进去的底座 [木色, 刻线, -] */
function ctDrum(p: string[]) {
  const [wood, line] = p
  const g = G(cyl(35, 35, 2.2, shade(wood, -0.2), {}, 40))
  g.add(cyl(39, 39, 35.6, wood, { y: 2 }, 48))
  for (const y of [12, 26]) g.add(torus(39, 0.5, line, { y, rx: PI / 2 }, PI * 2))
  g.add(puck(40, 3, shade(wood, 0.04), { y: 37 }))
  return g
}

/** 托盘边茶几：带一圈立边的圆托盘 + 四条发夹腿 [托盘, 腿, -] */
function ctTray(p: string[]) {
  const [top, leg] = p
  const g = G(cup(41, 40.5, 4.5, 1.2, top, { y: 34.5 }))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4
    const c = Math.cos(a)
    const s = Math.sin(a)
    const tx = c * 27
    const tz = s * 27
    // 发夹腿：两根杆在地面并到一起
    for (const sd of [-1, 1]) g.add(rod3([c * 31, 0.6, s * 31], [tx - s * sd * 5, 34.6, tz + c * sd * 5], 0.6, leg, 6))
    g.add(ball(1.1, leg, { x: c * 31, y: 0.9, z: s * 31 }, [1, 0.8, 1]))
  }
  return g
}

/** 郁金香底座圆几：一体喇叭形底座 + 圆台面 [台面, 底座, -] */
function ctTulip(p: string[]) {
  const [top, base] = p
  const g = G(
    lathe(
      [
        [0, 0],
        [22, 0],
        [22, 0.8],
        [16, 3],
        [9, 7],
        [5.5, 13],
        [4.5, 20],
        [5.5, 27],
        [9, 32],
        [0, 32.6],
      ],
      base,
      40,
    ),
  )
  g.add(puck(43, 3.4, top, { y: 32.6 }))
  return g
}

/** 双层圆几：圆台面 + 下层圆隔板 + 四条细腿 [台面, 腿, -] */
function ctTwoTier(p: string[]) {
  const [top, leg] = p
  const g = G(puck(40, 3, top, { y: 39 }))
  g.add(puck(34, 2, shade(top, -0.05), { y: 12 }))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4
    g.add(cyl(1.6, 1.3, 39, leg, { x: Math.cos(a) * 30, z: Math.sin(a) * 30 }, 10))
  }
  return g
}

/** 椭圆玻璃茶几：木框四腿 + 椭圆玻璃台面 + 下层木板 [木, 玻璃, -] */
function ctOvalGlass(p: string[]) {
  const [wood, glassC] = p
  const g = G(slab(ellipsePoly(41, 33, 0, 0, 48), 2.2, wood, 8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.9, 1.6, 36, wood, { x: sx * 30, z: sz * 20 }, 12))
  // 台面下的椭圆木框（玻璃架在上面）
  for (const sz of [-1, 1]) g.add(rbox(62, 2.4, 2.4, wood, { y: 33.6, z: sz * 20 }, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(2.4, 2.4, 38, wood, { x: sx * 30, y: 33.6 }, 0.8))
  g.add(clearDeep(slab(ellipsePoly(46, 38, 0, 0, 64), 1.2, glassC, 36), glassC, 0.42))
  return g
}

// ======================================================================
// 书架（family bookshelf）
// ======================================================================

/** 梯形斜靠书架：前腿斜靠、后腿贴墙，层板越往上越浅 [木, 金属 / 点缀, -] */
function bsLadder(p: string[]) {
  const [wood, acc] = p
  const g = new THREE.Group()
  const zf = (y: number) => 14 - (17 * y) / 178
  for (const sx of [-1, 1]) {
    g.add(rod3([sx * 36, 0, 14], [sx * 36, 178, -3], 1.9, wood))
    g.add(cyl(1.6, 1.6, 178, shade(wood, -0.06), { x: sx * 36, z: -14 }, 10))
  }
  const ys = [10, 46, 82, 116, 148]
  ys.forEach((y, i) => {
    const front = zf(y + 2) - 1
    const dep = front + 14.5
    g.add(rbox(70, 2.2, dep, wood, { y, z: front - dep / 2 }, 0.6))
    const zc = front - dep / 2
    if (i < 3) books(g, -33, i === 1 ? 10 : 33, y + 2.2, zc - 1, Math.min(dep - 4, 20), 28 - i * 2, 70 + i)
    if (i === 1) flatBooks(g, 22, y + 2.2, zc, 3, 9)
    if (i === 3) {
      g.add(cup(5, 4, 9, 0.6, acc, { x: -18, y: y + 2.2, z: zc }))
      g.add(ball(5.5, C.leaf, { x: -18, y: y + 14, z: zc }, [1, 0.8, 1]))
      books(g, 0, 24, y + 2.2, zc - 0.5, Math.min(dep - 3, 14), 20, 81)
    }
    if (i === 4) g.add(rbox(14, 9, 8, acc, { x: 12, y: y + 2.2, z: zc }, 1.2))
  })
  return g
}

/** 格子书架：3 列 × 5 行方格，一部分放书、一部分放布收纳盒 [框, 收纳盒, 收纳盒 2] */
function bsCube(p: string[]) {
  const [frame, bin1, bin2] = p
  const g = new THREE.Group()
  const w = 80
  const d = 30
  const t = 1.8
  const cw = (w - t * 4) / 3
  const ch = 32
  const h = ch * 5 + t * 6
  for (let i = 0; i <= 3; i++) g.add(rbox(t, h, d, frame, { x: -w / 2 + t / 2 + i * (cw + t) }, 0.5))
  for (let j = 0; j <= 5; j++) g.add(rbox(w - t * 2, t, d - 0.2, frame, { y: j * (ch + t), z: -0.1 }, 0.4))
  g.add(rbox(w - 2, h - 2, 0.8, shade(frame, -0.08), { y: 1, z: -d / 2 + 0.4 }, 0.3))
  const fill = ['books', 'bin1', 'books', 'empty', 'books', 'bin2', 'bin2', 'books', 'bin1', 'books', 'deco', 'books', 'bin1', 'books', 'bin2']
  fill.forEach((f, k) => {
    const col = k % 3
    const row = Math.floor(k / 3)
    const x0 = -w / 2 + t + col * (cw + t)
    const y = t + row * (ch + t)
    if (f === 'books') books(g, x0 + 1, x0 + cw - 1, y, 1, 22, 27, 100 + k)
    else if (f === 'bin1' || f === 'bin2') {
      const c = f === 'bin1' ? bin1 : bin2
      g.add(rbox(cw - 1.6, ch - 3, d - 4, c, { x: x0 + cw / 2, y, z: 1 }, 1.2))
      g.add(noOutlineDeep(rbox(7, 2, 0.4, shade(c, -0.4), { x: x0 + cw / 2, y: y + ch - 11, z: 13.1 }, 0.3)))
    } else if (f === 'deco') {
      g.add(cup(4.5, 3.8, 8, 0.6, C.white, { x: x0 + cw / 2, y, z: 1 }))
      g.add(ball(5, C.leaf, { x: x0 + cw / 2, y: y + 12, z: 1 }, [1, 0.85, 1]))
    }
  })
  return g
}

/** 工业水管书架：四根黑铁水管 + 法兰 + 五层厚木板 [木板, 水管, -] */
function bsPipe(p: string[]) {
  const [plank, pipe] = p
  const g = new THREE.Group()
  const ys = [8, 49, 90, 131, 169]
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 37
      const z = sz * 10
      g.add(cyl(3, 3, 0.8, pipe, { x, z }, 16))
      g.add(cyl(1.5, 1.5, 169, pipe, { x, y: 0.8, z }, 12))
      for (const y of ys) {
        g.add(cyl(2.1, 2.1, 1.6, pipe, { x, y: y - 1.6, z }, 12))
        if (y < 169) g.add(cyl(2.1, 2.1, 1.2, pipe, { x, y: y + 3, z }, 12))
      }
    }
  ys.forEach((y, i) => {
    g.add(rbox(86, 3, 30, plank, { y }, 0.8))
    if (i >= 1 && i <= 3) {
      books(g, -34, i === 2 ? 4 : 34, y + 3, -1, 20, 30, 120 + i)
      if (i === 2) {
        flatBooks(g, 18, y + 3, 0, 2, 6)
        g.add(rbox(10, 14, 10, '#c46a3a', { x: 30, y: y + 3, z: 0 }, 1))
      }
    }
    if (i === 0) {
      g.add(rbox(30, 22, 24, '#b9a27e', { x: -18, y: y + 3 }, 1.5))
      g.add(rbox(24, 20, 24, shade('#b9a27e', -0.1), { x: 16, y: y + 3 }, 1.5))
    }
  })
  return g
}

/** 玻璃门书柜：下柜两扇木门、上柜两扇玻璃门，顶上一道檐口 [柜体, 拉手, -] */
/** 玻璃门书架下柜门里的两层（底板 7.8、中间层板 37.8） */
const BS_GLASS_SURF: SurfaceDef[] = [
  { y: 7.8, h: 36 - 7.8 - 0.5, inside: true, shape: [rectPoly(-37.8, -15.2, 37.8, 12.4)] },
  { y: 37.8, h: 68 - 37.8 - 0.5, inside: true, shape: [rectPoly(-37.8, -15.2, 37.8, 12.4)] },
]
function bsGlass(p: string[]) {
  const [main, knob] = p
  const g = new THREE.Group()
  const w = 80
  const t = 1.8
  const zc = -1.5
  const dep = 29
  const front = zc + dep / 2
  g.add(rbox(76, 6, 26, shade(main, -0.18), { z: -2.5 }, 1))
  for (const sx of [-1, 1]) g.add(rbox(t, 168, dep, main, { x: sx * (w / 2 - t / 2), y: 6, z: zc }, 0.6))
  g.add(rbox(w - t * 2, 168, 1, shade(main, -0.1), { y: 6, z: zc - dep / 2 + 0.5 }, 0.3))
  g.add(rbox(w - t * 2, t, dep - 1, main, { y: 6, z: zc + 0.5 }, 0.4))
  g.add(rbox(w - t * 2, 2.4, dep - 1, main, { y: 68, z: zc + 0.5 }, 0.5))
  for (const y of [104, 138]) g.add(rbox(w - t * 2, t, dep - 3, main, { y, z: zc - 0.5 }, 0.4))
  g.add(rbox(w - t * 2, 2, dep - 1, main, { y: 172, z: zc + 0.5 }, 0.4))
  g.add(rbox(w, 6, 32, shade(main, -0.06), { y: 174 }, 1.2))
  // 书（玻璃门后）
  books(g, -37, 37, 70.4, -4, 20, 31, 131)
  books(g, -37, 16, 105.8, -4, 20, 30, 132)
  books(g, -37, 37, 139.8, -4, 20, 30, 133)
  g.add(ball(4, C.peach, { x: 26, y: 110, z: -2 }))
  // 下柜门里的一层（中间一块层板）
  g.add(rbox(w - t * 2, t, dep - 3, main, { y: 36, z: zc - 0.5 }, 0.4))
  for (const sx of [-1, 1]) {
    const x = (sx * (w - t * 2)) / 4
    const dw = (w - t * 2) / 2 - 0.6
    // 铰链在外侧
    const hx = x + sx * (dw / 2)
    // 下柜门
    g.add(moving([rbox(dw, 59, 1.6, shade(main, 0.05), { x, y: 8.4, z: front + 0.8 }, 1), rbox(dw - 6, 51, 0.6, shade(main, -0.04), { x, y: 12.4, z: front + 1.9 }, 0.3), ball(0.8, knob, { x: sx * 4, y: 56, z: front + 2.2 })], [hx, 8.4, front], swing(sx < 0)))
    // 上柜玻璃门：门框 + 玻璃
    const y0 = 71.4
    const dh = 99.6
    const fz = front + 0.8
    const up: THREE.Object3D[] = []
    for (const s2 of [-1, 1]) up.push(rbox(3, dh, 1.6, shade(main, 0.05), { x: x + s2 * (dw / 2 - 1.5), y: y0, z: fz }, 0.5))
    for (const yy of [y0, y0 + dh - 3]) up.push(rbox(dw - 6, 3, 1.6, shade(main, 0.05), { x, y: yy, z: fz }, 0.5))
    up.push(rbox(dw - 6, 1.6, 1.6, shade(main, 0.05), { x, y: y0 + dh / 2 - 0.8, z: fz }, 0.4))
    up.push(clearDeep(rbox(dw - 5.8, dh - 5.8, 0.4, '#d6eefc', { x, y: y0 + 2.9, z: fz + 0.2 }, 0.1), '#d6eefc', 0.3))
    up.push(ball(0.8, knob, { x: sx * 4, y: y0 + 20, z: front + 2.2 }))
    g.add(moving(up, [hx, y0, front], swing(sx < 0)))
  }
  return g
}

/** 拱顶书架：半圆拱顶的一体框，背板同形 [框, 点缀, -] */
function bsArch(p: string[]) {
  const [frame, acc] = p
  const g = new THREE.Group()
  const w = 74
  const r = w / 2
  const hs = 131
  const t = 2.4
  const d = 28
  const outer = new THREE.Shape()
  outer.moveTo(-r, 0)
  outer.lineTo(r, 0)
  outer.lineTo(r, hs)
  outer.absarc(0, hs, r, 0, PI, false)
  outer.lineTo(-r, 0)
  const inner = new THREE.Path()
  inner.moveTo(-r + t, t)
  inner.lineTo(-r + t, hs)
  inner.absarc(0, hs, r - t, PI, 0, true)
  inner.lineTo(r - t, t)
  inner.lineTo(-r + t, t)
  outer.holes.push(inner)
  const geo = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: false, curveSegments: 24 })
  geo.translate(0, 0, -d / 2)
  g.add(mesh(geo, frame))
  // 背板：同样的拱形，薄板
  const back = new THREE.Shape()
  back.moveTo(-r + t, t)
  back.lineTo(r - t, t)
  back.lineTo(r - t, hs)
  back.absarc(0, hs, r - t, 0, PI, false)
  back.lineTo(-r + t, t)
  const bg = new THREE.ExtrudeGeometry(back, { depth: 0.8, bevelEnabled: false, curveSegments: 24 })
  bg.translate(0, 0, -d / 2 + 0.2)
  g.add(mesh(bg, shade(frame, -0.07)))
  const ys = [t, 34, 66, 98, 128]
  ys.forEach((y, i) => {
    if (i > 0) g.add(rbox(w - t * 2, 2, d - 1.4, frame, { y, z: 0.5 }, 0.4))
    const top = i === 0 ? y : y + 2
    if (i === 0) {
      g.add(rbox(30, 24, 22, acc, { x: -16, y: top, z: 1 }, 2))
      books(g, 2, 33, top, 1, 20, 28, 140)
    } else if (i < 4) books(g, -33, i === 2 ? 8 : 33, top, 1, 20, 28, 140 + i)
    if (i === 2) {
      g.add(cup(4.5, 3.6, 8, 0.6, acc, { x: 22, y: top, z: 2 }))
      g.add(ball(5, C.leaf, { x: 22, y: top + 12, z: 2 }, [1, 0.8, 1]))
    }
    if (i === 4) {
      g.add(ball(6, acc, { y: top + 6, z: 1 }, [1, 1, 1]))
      flatBooks(g, -18, top, 1, 2, 12)
    }
  })
  return g
}

// ======================================================================
// 落地灯（family floor-lamp）
// ======================================================================

/** 球形落地灯：圆石底座 + 细杆 + 乳白玻璃球 [灯球, 底座, 杆] */
function flGlobe(p: string[]) {
  const [globe, base, pole] = p
  const g = G(puck(18, 3.4, base))
  g.add(cyl(1, 1, 134, pole, { y: 3 }, 10))
  g.add(cyl(3, 2.2, 3, pole, { y: 134 }, 16))
  g.add(lit(ball(16, globe, { y: 152 }), globe, 0.55))
  return g
}

/** 可调阅读落地灯：铸铁圆底 + 立杆 + 斜臂 + 锥形灯罩 [灯罩, 杆 / 底, 关节] */
function flReading(p: string[]) {
  const [shadeC, metal, joint] = p
  const g = G(puck(17, 3, metal))
  g.add(cyl(1.2, 1.2, 118, metal, { y: 2.5 }, 10))
  g.add(ball(2, joint, { y: 120 }))
  g.add(rod3([0, 120, 0], [14, 138, 0], 0.9, metal, 8))
  g.add(ball(1.8, joint, { x: 14, y: 138 }))
  const head = new THREE.Group()
  head.add(cup(8.5, 3.2, 13, 0.6, shadeC, { rx: PI }))
  head.add(lit(ball(3, C.lamp, { y: -6 }), C.lamp, 0.8))
  head.add(cyl(2, 2, 3, joint, { y: 0 }, 12))
  head.position.set(17, 142, 0)
  head.rotation.z = -0.55
  g.add(head)
  return g
}

/** 层叠圆盘灯：三片碟形灯罩上大下小叠起来，光从缝里漏出 [灯罩, 杆 / 底, 点缀] */
function flTiered(p: string[]) {
  const [shadeC, metal, acc] = p
  const g = G(cyl(13, 17, 4, metal, {}, 32))
  g.add(cyl(1.1, 1.1, 136, metal, { y: 4 }, 10))
  const s1 = cup(18, 7, 7, 0.6, shadeC, { y: 152, rx: PI })
  const s2 = cup(13.5, 5, 6, 0.6, shadeC, { y: 145, rx: PI })
  const s3 = cup(9, 3.5, 5, 0.6, acc, { y: 139, rx: PI })
  g.add(s1, s2, s3)
  g.add(cyl(1.6, 1.6, 2.2, metal, { y: 152 }, 12))
  g.add(lit(ball(3.4, C.lamp, { y: 141 }), C.lamp, 0.9))
  return g
}

// ======================================================================
// 鞋柜（family shoe-cabinet）
// ======================================================================

/** 中古拉门鞋柜：外撇锥形腿 + 两扇交错的藤编拉门 + 圆形抠手 [柜体, 藤编, 腿] */
/** 中古拉门鞋柜门里两层（底板、中间层板） */
const SC_RETRO_SURF: SurfaceDef[] = [
  { y: 19.6, h: 54 - 19.6 - 0.5, inside: true, shape: inner(84, -18, 15) },
  { y: 55.6, h: 90.4 - 55.6 - 0.5, inside: true, shape: inner(84, -18, 15) },
]
function scRetro(p: string[]) {
  const [main, cane, leg] = p
  const w = 84
  const d = 36
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rod3([sx * 38, 0.5, sz * 14.5], [sx * 35, 18.5, sz * 12], 1.4, leg))
  // 空心柜体 + 中间一块层板
  for (const o of hollow(w, 18, 92, -18, 15, main, 1.6, 0.8)) g.add(o)
  g.add(rbox(w - 3.2, 1.6, 31, main, { y: 54, z: -2 }, 0.3))
  // 两扇拉门：一前一后，夹在上下两道轨道里；前面那扇推到后面那扇前头
  for (const y of [21.8, 87]) g.add(rbox(w - 4, 1.2, 3, shade(main, -0.1), { y, z: 16.4 }, 0.4))
  const fz = d / 2 - 3 + 0.8
  for (const sx of [-1, 1]) {
    const z = fz + (sx < 0 ? 1.4 : 0)
    const x = (sx * w) / 4 - sx * 0.5
    const parts: THREE.Object3D[] = [rbox(w / 2 - 2, 64, 1.2, shade(main, 0.05), { x, y: 23, z }, 0.8), rbox(w / 2 - 9, 54, 0.4, cane, { x, y: 28, z: z + 0.8 }, 0.2)]
    for (let k = 0; k < 6; k++) parts.push(noOutlineDeep(rbox(w / 2 - 9.4, 0.3, 0.3, shade(cane, -0.2), { x, y: 31 + k * 9, z: z + 1.1 }, 0.1)))
    parts.push(noOutlineDeep(cyl(1.6, 1.6, 0.4, shade(main, -0.35), { x: sx * 34, y: 55, z: z + 0.6, rx: PI / 2 }, 16)))
    if (sx < 0) g.add(moving(parts, [0, 0, 0], { kind: 'slide', dx: w / 2 - 1 }))
    else for (const o of parts) g.add(o)
  }
  return g
}

/** 一只运动鞋：沿 z 放 */
function sneaker(color: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(rbox(8, 1.6, 23, C.white, { x, y, z }, 0.7))
  g.add(rbox(7.2, 5.4, 15, color, { x, y: y + 1.2, z: z - 3.6 }, 2.2))
  g.add(ball(3.5, color, { x, y: y + 1.6, z: z + 6 }, [1, 0.75, 1.2]))
  return g
}

/** 上柜下开放鞋柜：上面两扇门 + 长条拉手，下面一层开放格放日常鞋 [柜体, 拉手, 鞋] */
/** 上柜门里两层（42 那块隔板上、72 的层板上）；整体往后挪了 0.35 */
const SC_OPEN_SURF: SurfaceDef[] = [
  { y: 44.2, h: 72 - 44.2 - 0.5, inside: true, shape: [rectPoly(-37.8, -16.8, 37.8, 15.4)] },
  { y: 73.8, h: 102 - 73.8 - 0.5, inside: true, shape: [rectPoly(-37.8, -16.8, 37.8, 15.4)] },
]
function scOpen(p: string[]) {
  const [main, bar, shoe] = p
  const w = 80
  const d = 36
  const t = 1.8
  const g = new THREE.Group()
  g.add(rbox(w - 4, 6, d - 6, shade(main, -0.2), { z: -2 }, 1))
  for (const sx of [-1, 1]) g.add(rbox(t, 98, d, main, { x: sx * (w / 2 - t / 2), y: 6 }, 0.6))
  g.add(rbox(w, 2, d, main, { y: 102 }, 0.8))
  g.add(rbox(w - t * 2, t, d - 1, main, { y: 6, z: -0.5 }, 0.4))
  g.add(rbox(w - t * 2, t, d - 1, main, { y: 22, z: -0.5 }, 0.4))
  g.add(rbox(w - t * 2, 2.2, d - 1, main, { y: 42, z: -0.5 }, 0.4))
  g.add(rbox(w - t * 2, 96, 1, shade(main, -0.1), { y: 6, z: -d / 2 + 0.5 }, 0.3))
  // 上柜门里一块层板
  g.add(rbox(w - t * 2, t, d - 3, main, { y: 72, z: -1 }, 0.4))
  for (const sx of [-1, 1]) {
    const x = (sx * (w - t * 2)) / 4
    const dw = (w - t * 2) / 2 - 0.6
    g.add(moving([rbox(dw, 57.4, 1.6, shade(main, 0.05), { x, y: 44.4, z: d / 2 - 0.8 }, 0.8), rbox(1.4, 22, 1, bar, { x: sx * 5, y: 58, z: d / 2 + 0.2 }, 0.45)], [x + (sx * dw) / 2, 44.4, d / 2 - 1.6], swing(sx < 0)))
  }
  // 下层：两双鞋 + 一双拖鞋
  for (const [x, y, c] of [
    [-27, 7.8, shoe],
    [-18.4, 7.8, shoe],
    [10, 7.8, shade(shoe, -0.25)],
    [18.6, 7.8, shade(shoe, -0.25)],
    [-14, 23.8, C.sky],
    [-5.4, 23.8, C.sky],
  ] as [number, number, string][])
    g.add(sneaker(c, x, y, 0))
  return shift(g, 0, -0.35)
}

/** 格子拉门鞋柜：和纸面 + 木格栅的两扇拉门，下面一道踢脚 [木, 和纸, -] */
/** 格子拉门鞋柜门里两层；整体往后挪了 0.3 */
const SC_SHOJI_SURF: SurfaceDef[] = [
  { y: 9.6, h: 50 - 9.6 - 0.5, inside: true, shape: inner(80, -18.3, 14.9) },
  { y: 51.6, h: 92.4 - 51.6 - 0.5, inside: true, shape: inner(80, -18.3, 14.9) },
]
function scShoji(p: string[]) {
  const [wood, washi] = p
  const w = 80
  const d = 36
  const g = new THREE.Group()
  g.add(rbox(w - 2, 8, d - 4, shade(wood, -0.2), { z: -1 }, 1))
  for (const o of hollow(w, 8, 94, -18, 15.5, wood, 1.6, 0.8)) g.add(o)
  g.add(rbox(w - 3.2, 1.6, 31.5, wood, { y: 50, z: -1.5 }, 0.3))
  g.add(rbox(w + 0, 2, d, shade(wood, -0.05), { y: 94 }, 0.8))
  const fz = d / 2 - 2
  for (const y of [9.6, 91]) g.add(rbox(w - 2, 1.4, 3, shade(wood, -0.1), { y, z: 17 }, 0.4))
  for (const sx of [-1, 1]) {
    const x = (sx * w) / 4 - sx * 0.6
    const z = fz + (sx < 0 ? 1.2 : 0)
    const dw = w / 2 - 2.4
    const parts: THREE.Object3D[] = [rbox(dw, 80, 1, shade(wood, 0.04), { x, y: 11, z }, 0.5), rbox(dw - 4, 72, 0.4, washi, { x, y: 15, z: z + 0.7 }, 0.15)]
    // 木格栅
    for (let k = 1; k < 4; k++) parts.push(rbox(0.8, 72, 0.6, shade(wood, 0.04), { x: x - (dw - 4) / 2 + (k * (dw - 4)) / 4, y: 15, z: z + 1.1 }, 0.2))
    for (let k = 1; k < 7; k++) parts.push(rbox(dw - 4, 0.8, 0.6, shade(wood, 0.04), { x, y: 15 + (k * 72) / 7 - 0.4, z: z + 1.1 }, 0.2))
    parts.push(noOutlineDeep(rbox(1.4, 6, 0.4, shade(wood, -0.4), { x: sx * 34.5, y: 50, z: z + 0.9 }, 0.2)))
    // 前面那扇拉到后面那扇前头
    if (sx < 0) g.add(moving(parts, [0, 0, 0], { kind: 'slide', dx: w / 2 - 1.2 }))
    else for (const o of parts) g.add(o)
  }
  return shift(g, 0, -0.3)
}

/** 铁网门鞋柜：黑铁框 + 钢丝网门 + 胡桃木顶板，里面看得到层板 [框, 顶板, -] */
/** 铁网门鞋柜门里两层 */
const SC_MESH_SURF: SurfaceDef[] = [
  { y: 7.2, h: 50 - 7.2 - 0.5, inside: true, shape: [rectPoly(-38, -14.6, 38, 14.2)] },
  { y: 51.2, h: 97 - 51.2 - 0.5, inside: true, shape: [rectPoly(-38, -14.6, 38, 14.2)] },
]
function scMesh(p: string[]) {
  const [frame, top] = p
  const w = 82
  const d = 36
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, 97, 3, frame, { x: sx * (w / 2 - 1.5), z: sz * (d / 2 - 2) }, 0.5))
  g.add(rbox(w, 3, d, top, { y: 97 }, 0.8))
  g.add(rbox(w - 4, 1.2, d - 6, frame, { y: 6, z: -0.5 }, 0.3))
  g.add(rbox(w - 4, 1.2, d - 6, frame, { y: 50, z: -0.5 }, 0.3))
  g.add(rbox(w - 4, 90, 0.8, shade(frame, 0.1), { y: 6, z: -d / 2 + 2 }, 0.2))
  for (const sx of [-1, 1]) g.add(rbox(0.8, 90, d - 6, shade(frame, 0.1), { x: sx * (w / 2 - 2), y: 6, z: -0.5 }, 0.2))
  for (const sx of [-1, 1]) {
    const x = (sx * (w - 6)) / 4
    const dw = (w - 6) / 2
    const fz = d / 2 - 1.4
    const parts: THREE.Object3D[] = []
    // 门框
    for (const s2 of [-1, 1]) parts.push(rbox(2, 88, 1.4, frame, { x: x + s2 * (dw / 2 - 1), y: 7, z: fz }, 0.3))
    for (const yy of [7, 93]) parts.push(rbox(dw, 2, 1.4, frame, { x, y: yy, z: fz }, 0.3))
    // 钢丝网
    for (let k = 1; k < 8; k++) parts.push(noOutlineDeep(cyl(0.18, 0.18, 86, STEEL, { x: x - dw / 2 + (k * dw) / 8, y: 8, z: fz }, 4)))
    for (let k = 1; k < 18; k++) {
      const m = noOutlineDeep(cyl(0.18, 0.18, dw - 2, STEEL, { x, y: 8 + (k * 86) / 18, z: fz - 0.3, rz: PI / 2 }, 4))
      m.position.y = 9 + (k * 86) / 18
      parts.push(m)
    }
    parts.push(rbox(1.2, 12, 1.2, top, { x: sx * 1.2, y: 52, z: fz + 1.2 }, 0.5))
    g.add(moving(parts, [x + (sx * dw) / 2, 7, fz - 0.7], swing(sx < 0)))
  }
  return g
}

// ======================================================================
// 五斗柜（family dresser）
// ======================================================================

/** 高抽屉柜：无把手，抽屉顶边一道暗槽；上排两只小抽屉 + 四只通长抽屉 [柜体, 暗槽, -] */
const DR_TALL_ROWS: [number, number][] = [
  [8, 20],
  [29, 20],
  [50, 20],
  [71, 20],
]
/** 高抽屉柜的抽屉：四只通长 + 上排两只小的 */
function drTallTrays(): Tray[] {
  const w = 80
  const out: Tray[] = DR_TALL_ROWS.map(([y, h]) => [-w / 2 + 2.2, w / 2 - 2.2, y + 0.3, h - 2.5, 20, 40])
  for (const sx of [-1, 1]) {
    const x = (sx * w) / 4 - sx * 0.5
    out.push([x - (w / 2 - 3) / 2 + 0.6, x + (w / 2 - 3) / 2 - 0.6, 92.3, 13.5, 20, 40])
  }
  return out
}
function drTall(p: string[]) {
  const [main, groove] = p
  const w = 80
  const d = 44
  const g = new THREE.Group()
  g.add(rbox(w - 6, 6, d - 8, shade(main, -0.25), { z: -2 }, 1))
  for (const o of hollow(w, 6, 110, -22, 20, main, 1.6, 0.8)) g.add(o)
  const fz = d / 2 - 2 + 0.7
  const trays = drTallTrays()
  DR_TALL_ROWS.forEach(([y, h], i) => {
    g.add(drawer([rbox(w - 4, h, 1.4, shade(main, 0.04), { y, z: fz }, 0.8), noOutlineDeep(rbox(w - 12, 1, 0.4, groove, { y: y + h - 2.6, z: fz + 0.7 }, 0.2))], trays[i], shade(main, 0.08)))
  })
  ;[-1, 1].forEach((sx, k) => {
    const x = (sx * w) / 4 - sx * 0.5
    g.add(drawer([rbox(w / 2 - 3, 16, 1.4, shade(main, 0.04), { x, y: 92, z: fz }, 0.8), noOutlineDeep(rbox(w / 2 - 11, 1, 0.4, groove, { x, y: 105, z: fz + 0.7 }, 0.2))], trays[4 + k], shade(main, 0.08)))
  })
  return g
}

/** 中古斗柜：外撇锥形腿 + 两列三层抽屉，长条凹槽拉手 [柜体, 拉手, 腿] */
/** 中古斗柜两列三层抽屉 */
function drMcmTrays(): Tray[] {
  const w = 86
  const out: Tray[] = []
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const x = (sx * w) / 4 - sx * 0.6
      out.push([x - 18.5, x + 18.5, 23 + k * 17.6 + 0.3, 14, 20, 40])
    }
  return out
}
function drMcm(p: string[]) {
  const [main, pull, leg] = p
  const w = 86
  const d = 44
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rod3([sx * 40, 0.6, sz * 18], [sx * 36, 20.5, sz * 15], 1.5, leg))
  for (const o of hollow(w, 20, 78, -22, 20, main, 1.6, 1)) g.add(o)
  g.add(rbox(1.6, 58 - 3.2, d - 4, main, { y: 21.6, z: -1 }, 0.3))
  const fz = d / 2 - 2 + 0.7
  const trays = drMcmTrays()
  let n = 0
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const x = (sx * w) / 4 - sx * 0.6
      const y = 23 + k * 17.6
      g.add(drawer([rbox(w / 2 - 4, 16.4, 1.4, shade(main, 0.05), { x, y, z: fz }, 0.8), rbox(16, 1.4, 1.2, pull, { x, y: y + 13.4, z: fz + 1 }, 0.5)], trays[n++], shade(main, 0.08)))
    }
  return g
}

/** 和风箪笥：上排两只小抽屉 + 一扇小拉门，下面三只通长抽屉，黑铁环形拉手和包角 [木, 铁件, -] */
/** 和风箪笥：下面三只通长抽屉，上排两只小抽屉；右上一扇小门（门里一格） */
function drTansuTrays(): Tray[] {
  const out: Tray[] = [0, 1, 2].map((k) => [-37.8, 37.8, 8 + k * 19 + 0.3, 15, 20, 39])
  for (const x of [-24, 2]) out.push([x - 11.4, x + 11.4, 65.3, 22, 20, 39])
  return out
}
const DR_TANSU_SURF: SurfaceDef[] = [...drTansuTrays().map(trayLevel), { y: 65, h: 88.4 - 65 - 0.5, inside: true, shape: [rectPoly(16.6, -20, 37.8, 19.4)] }]
function drTansu(p: string[]) {
  const [wood, iron] = p
  const w = 80
  const d = 42
  const g = new THREE.Group()
  g.add(rbox(w, 6, d - 2, shade(wood, -0.2), { z: -1 }, 1))
  for (const o of hollow(w, 6, 90, -22, 20, wood, 1.6, 0.6)) g.add(o)
  // 上下两部分之间的隔板、小抽屉和小门之间的竖隔板
  g.add(rbox(w - 3.2, 1.4, d - 4, wood, { y: 63.6, z: -1 }, 0.3))
  g.add(rbox(1.4, 24.8, d - 4, wood, { x: 15.3, y: 65, z: -1 }, 0.3))
  const fz = d / 2 - 2 + 0.7
  const ring = (x: number, y: number): THREE.Object3D[] => [rbox(5, 3, 0.4, iron, { x, y: y - 0.2, z: fz + 0.9 }, 0.3), torus(2.2, 0.35, iron, { x, y: y + 0.6, z: fz + 1.3 }, PI).rotateZ(PI)]
  const trays = drTansuTrays()
  for (let k = 0; k < 3; k++) {
    const y = 8 + k * 19
    g.add(drawer([rbox(w - 4, 17.6, 1.4, shade(wood, 0.04), { y, z: fz }, 0.6), ...ring(-20, y + 11), ...ring(20, y + 11)], trays[k], shade(wood, 0.08)))
  }
  ;[-24, 2].forEach((x, k) => g.add(drawer([rbox(24, 25, 1.4, shade(wood, 0.04), { x, y: 65, z: fz }, 0.6), ...ring(x, 81)], trays[3 + k], shade(wood, 0.08))))
  // 右上小门：铰链在右
  g.add(moving([rbox(22, 25, 1.4, shade(wood, -0.06), { x: 27, y: 65, z: fz }, 0.6), noOutlineDeep(rbox(1.2, 7, 0.4, iron, { x: 19, y: 74, z: fz + 0.9 }, 0.2))], [38, 65, fz - 0.7], swing(false)))
  // 包角铁件
  for (const sx of [-1, 1]) for (const y of [6.4, 86.6]) g.add(rbox(5, 3, 0.5, iron, { x: sx * (w / 2 - 2.8), y: y - 1.5, z: fz + 1 }, 0.2))
  return g
}

/** 糖果色圆角斗柜：大圆角柜身 + 四只不同颜色的抽屉 + 圆球脚和蘑菇钮 [柜体, 抽屉 A, 抽屉 B] */
const drCandyTray = (k: number): Tray => [-32.5, 32.5, 10 + k * 18 + 0.3, 13.5, 16.9, 33]
function drCandy(p: string[]) {
  const [main, a, b] = p
  const w = 76
  const d = 42
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(3.4, shade(main, -0.12), { x: sx * 31, y: 3.4, z: sz * 15 }))
  // 大圆角柜身做成空心：圆角侧板、顶板，底板、背板
  for (const s of [-1, 1]) g.add(rbox(4, 80, d - 4, main, { x: s * (w / 2 - 2), y: 5.5, z: -2 }, 2))
  g.add(rbox(w, 4, d - 4, main, { y: 81.5, z: -2 }, 2))
  g.add(rbox(w - 8, 3, d - 4, main, { y: 5.5, z: -2 }, 1))
  g.add(rbox(w - 8, 73, 1.2, shade(main, -0.05), { y: 8.5, z: -2 - (d - 4) / 2 + 0.6 }, 0.4))
  const fz = d / 2 - 4 + 0.6
  const cols = [a, b, a, b]
  for (let k = 0; k < 4; k++) {
    const y = 10 + k * 18
    const face = [rbox(w - 10, 16, 1.4, cols[k], { y, z: fz }, 2.5), cyl(0.8, 0.8, 1.6, C.white, { y: y + 8, z: fz + 1.2, rx: PI / 2 }, 10), ball(1.8, C.white, { y: y + 8, z: fz + 2.4 }, [1, 1, 0.6])]
    g.add(drawer(face, drCandyTray(k), shade(cols[k], 0.1)))
  }
  return g
}

/** 金属抽屉柜：钢板柜身 + 3 × 4 小抽屉（标签框 + 杯形拉手），底下四个脚轮 [柜体, 抽屉, 拉手] */
/** 金属抽屉柜 3 × 4 小抽屉 */
function drMetalTrays(): Tray[] {
  const w = 80
  const cw = (w - 4) / 3
  const out: Tray[] = []
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 4; r++) {
      const x = -w / 2 + 2 + cw * (c + 0.5)
      out.push([x - cw / 2 + 1.6, x + cw / 2 - 1.6, 9 + r * 18.4 + 0.3, 14.5, 20, 40])
    }
  return out
}
function drMetal(p: string[]) {
  const [body, drawerC, pull] = p
  const w = 80
  const d = 44
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(ball(2.6, DARK, { x: sx * 34, y: 2.6, z: sz * 16 }))
      g.add(rbox(5, 2, 5, STEEL, { x: sx * 34, y: 4.6, z: sz * 16 }, 0.5))
    }
  for (const o of hollow(w, 6.6, 84, -22, 20, body, 1.6, 0.6)) g.add(o)
  const cw = (w - 4) / 3
  for (const c of [1, 2]) g.add(rbox(1, 77.4 - 3.2, d - 4, body, { x: -w / 2 + 2 + cw * c, y: 8.2, z: -1 }, 0.2))
  const fz = d / 2 - 2 + 0.6
  const trays = drMetalTrays()
  let n = 0
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 4; r++) {
      const x = -w / 2 + 2 + cw * (c + 0.5)
      const y = 9 + r * 18.4
      g.add(drawer([rbox(cw - 1.2, 17.2, 1.2, drawerC, { x, y, z: fz }, 0.5), rbox(7, 3, 0.4, C.white, { x, y: y + 12, z: fz + 0.8 }, 0.2), rbox(8, 2.2, 1.4, pull, { x, y: y + 5, z: fz + 1.2 }, 0.6)], trays[n++], shade(drawerC, 0.08)))
    }
  return g
}

// ======================================================================
// 桌面小物：钥匙
// ======================================================================

function key(color: string) {
  const k = new THREE.Group()
  k.add(torus(1.1, 0.45, color, { x: -2.6, y: 0.45, rx: PI / 2 }))
  k.add(rbox(4.4, 0.4, 1, color, { x: 0.6, y: 0.25 }, 0.15))
  for (const x of [1.2, 2.2]) k.add(rbox(0.6, 0.4, 0.6, color, { x, y: 0.25, z: -0.7 }, 0.15))
  return k
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z)
  o.rotation.y = ry
  return o
}
/** 平面轮廓的浅托盘：底板 + 一圈立边（轮廓向内收 rim 当内壁） */
function shapeTray(outline: Poly, innerScale: number, h: number, color: string) {
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
  const hole = new THREE.Path(outline.map(([x, z]) => new THREE.Vector2(x * innerScale, -z * innerScale)).reverse())
  sh.holes.push(hole)
  const rimGeo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 8 })
  rimGeo.rotateX(-PI / 2)
  const g = G(mesh(rimGeo, color))
  g.add(prism(outline.map(([x, z]) => [x * (innerScale + 0.02), z * (innerScale + 0.02)] as [number, number]), 0.6, shade(color, -0.04)))
  return g
}

// ======================================================================
// 电水壶（family prop-kettle）
// ======================================================================

/** 细口手冲电水壶：直筒身 + 鹅颈壶嘴 + 弯把手 [壶身, 底座, 点缀] */
function kettleGoose(p: string[]) {
  const [body, base, acc] = p
  const g = G(puck(7.5, 1.8, base))
  g.add(cyl(5.4, 6, 12, body, { y: 2 }, 32))
  g.add(puck(5.6, 1.2, shade(body, -0.05), { y: 13.8 }))
  g.add(ball(1, acc, { y: 15.4 }))
  g.add(tube([[5.2, 4, 0], [8, 5, 0], [9.5, 9, 0], [10.4, 14, 0], [12.4, 15.6, 0]], 0.55, body, { ...TUBE, seg: 20, radial: 8 }))
  g.add(tube([[-5.2, 12.5, 0], [-8.6, 12, 0], [-9.2, 8.5, 0], [-8, 5, 0], [-5.4, 4.6, 0]], 0.9, acc, { ...TUBE, seg: 20, radial: 8 }))
  g.add(lit(ball(0.5, '#ff6b4a', { y: 0.9, z: 7.4 }), '#ff6b4a', 0.8))
  return g
}

/** 玻璃电水壶：钢圈 + 透明壶身，里面的水被蓝光照亮 [底座 / 把手, 钢圈, 灯色] */
function kettleGlass(p: string[]) {
  const [base, ring, light] = p
  const g = G(puck(8, 2, base))
  g.add(cyl(6.9, 7, 2, ring, { y: 2 }, 32))
  g.add(clearDeep(cyl(6.3, 6.9, 11.6, WATER, { y: 4 }, 32), WATER, 0.3))
  g.add(lit(cyl(5.8, 6.3, 6.5, light, { y: 4.2 }, 24), light, 0.45))
  g.add(cyl(6.5, 6.5, 1.6, ring, { y: 15.6 }, 32))
  g.add(puck(5.4, 1.2, base, { y: 16.8 }))
  g.add(cyl(1.2, 2.4, 2.4, ring, { x: 6.4, y: 14.2, rz: -0.9 }, 12))
  g.add(rbox(2.2, 11, 2.6, base, { x: -10, y: 4.5 }, 1))
  for (const y of [4.5, 13.5]) g.add(rbox(3.6, 2, 2.6, base, { x: -8.4, y }, 0.8))
  return g
}

/** 复古圆鼓电水壶：圆球身 + 头顶提梁 + 短壶嘴 [壶身, 提梁 / 底, 点缀] */
function kettleDome(p: string[]) {
  const [body, handle, acc] = p
  const g = G(puck(8, 2, handle))
  g.add(ball(8, body, { y: 9 }, [1, 0.88, 1]))
  g.add(torus(7.9, 0.4, acc, { y: 6.4, rx: PI / 2 }))
  g.add(puck(3.6, 1.4, shade(body, -0.06), { y: 15.4 }))
  g.add(ball(1.1, acc, { y: 17.4 }))
  const sp = cyl(0.9, 2.2, 5, body, {}, 16)
  sp.position.set(9, 11.5, 0)
  sp.rotation.z = -0.95
  g.add(sp)
  // 提梁：两端接在肩上
  g.add(torus(6.2, 0.7, handle, { y: 14.2 }, PI))
  for (const sx of [-1, 1]) g.add(cyl(1, 1, 2, handle, { x: sx * 6.2, y: 13 }, 10))
  return g
}

/** 方形迷你电水壶：圆角方身 + 掀盖 + 侧把手 [壶身, 盖 / 把手, 点缀] */
function kettleCube(p: string[]) {
  const [body, lid, acc] = p
  const g = G(rbox(14.5, 1.8, 14.5, lid, {}, 0.8))
  g.add(rbox(12.5, 12.5, 12.5, body, { y: 1.8 }, 3))
  g.add(rbox(12, 2, 12, lid, { y: 14 }, 2))
  g.add(rbox(4, 1, 4, acc, { x: -1, y: 15.8 }, 0.5))
  g.add(rbox(2.4, 1.6, 3, body, { x: 6.8, y: 12.4 }, 0.6))
  g.add(rbox(2, 10, 3, lid, { x: -9.6, y: 4 }, 0.9))
  for (const y of [4, 12]) g.add(rbox(3.6, 2, 3, lid, { x: -7.6, y }, 0.8))
  g.add(noOutlineDeep(rbox(1.2, 7, 0.4, WATER, { y: 4.4, z: 6.4 }, 0.2)))
  return g
}

// ======================================================================
// 电热水瓶（family prop-electric-pot）：出水口在正面（+z），蒸汽从顶上的出气孔冒
// ======================================================================

/** 圆筒电热水瓶：圆筒身 + 顶上的折叠提手 + 正面出水嘴和水位窗 [壶身, 顶盖, 按键] */
function epotRound(p: string[]) {
  const [body, top, acc] = p
  const g = G(puck(10.5, 2, top))
  g.add(cyl(10.5, 10.5, 22, body, { y: 1.8 }, 40))
  g.add(puck(10.8, 5, top, { y: 23.4 }))
  g.add(torus(8, 0.6, top, { y: 28.5, z: 0, rx: -PI / 2 }, PI))
  g.add(rbox(4.4, 4, 4, top, { y: 19.6, z: 10.6 }, 1.2))
  g.add(cyl(0.9, 1, 2, shade(top, -0.12), { y: 18, z: 12 }, 12))
  g.add(cyl(1.6, 1.6, 0.8, acc, { y: 28.4, z: 4.6 }, 16))
  g.add(noOutlineDeep(rbox(1.6, 11, 0.6, '#a8d4f4', { y: 5, z: 10.5 }, 0.3)))
  g.add(cyl(0.8, 0.8, 0.6, '#d9dee6', { y: 28.4, z: -4 }, 10))
  return shift(g, 0, -1.1)
}

/** 昭和花柄热水瓶：上细下粗的瓶身 + 一圈小花 + 立起来的提手 [瓶身, 盖 / 提手, 花] */
function epotFloral(p: string[]) {
  const [body, top, flower] = p
  const g = G(cyl(11, 11, 1.6, top, {}, 40))
  g.add(cyl(9.6, 11, 21, body, { y: 1.6 }, 40))
  g.add(cyl(9.8, 9.8, 1, top, { y: 22.6 }, 40))
  g.add(ball(9.6, top, { y: 23.4 }, [1, 0.42, 1]))
  for (const sx of [-1, 1]) g.add(cyl(0.9, 0.9, 3, top, { x: sx * 8.2, y: 24 }, 10))
  g.add(torus(8.2, 0.65, top, { y: 27 }, PI))
  g.add(rbox(4, 3.4, 4, top, { y: 21.6, z: 10 }, 1.2))
  g.add(cyl(0.9, 1, 2, shade(top, -0.15), { y: 20, z: 11.2 }, 12))
  // 正面三朵小花
  for (const [x, y] of [
    [-4.5, 9],
    [0.8, 13.5],
    [5.4, 7.6],
  ]) {
    const zr = 10.1 - (y - 1.6) * (1.4 / 21) + 0.2
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2
      g.add(noOutlineDeep(ball(1.1, flower, { x: x + Math.cos(a) * 1.3, y: y + Math.sin(a) * 1.3, z: zr }, [1, 1, 0.4])))
    }
    g.add(noOutlineDeep(ball(0.7, C.lemon, { x, y, z: zr + 0.3 }, [1, 1, 0.4])))
  }
  return shift(g, 0, -0.6)
}

/** 方形电热水瓶：方圆角机身 + 顶面大屏 + 正面出水按钮和接水托 [机身, 顶面, 屏幕] */
function epotSquare(p: string[]) {
  const [body, top, screen] = p
  const g = G(rbox(19, 1.2, 24, top, {}, 0.5))
  g.add(rbox(21, 22, 22, body, { y: 1, z: -1 }, 5))
  g.add(rbox(20.6, 5, 21.6, top, { y: 22.6, z: -1 }, 2.4))
  g.add(lit(rbox(9, 0.4, 5, screen, { y: 27.5, z: 3.5 }, 0.2), screen))
  g.add(rbox(5, 4, 3.4, top, { y: 18, z: 11 }, 1))
  g.add(cyl(0.9, 1, 2, shade(top, -0.1), { y: 16.4, z: 11.6 }, 12))
  g.add(rbox(10, 1.4, 4, shade(top, -0.1), { y: 1.2, z: 10.4 }, 0.5))
  for (const x of [-4, 4]) g.add(cyl(1.3, 1.3, 0.6, x < 0 ? '#ff6b4a' : '#4a7fc1', { x, y: 27.4, z: -5 }, 12))
  return shift(g, 0, -0.35)
}

/** 不锈钢电热水瓶：竖条纹钢身 + 圆顶压盖 + 侧边提手 [钢身, 黑件, 按键] */
function epotSteel(p: string[]) {
  const [steel, black, acc] = p
  const g = G(cyl(10, 10.4, 2.4, black, {}, 32))
  g.add(cyl(9.6, 10, 21, steel, { y: 2.2 }, 32))
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * PI * 2 + PI / 36
    if (Math.abs(Math.sin(a) - 1) < 0.08) continue
    g.add(noOutlineDeep(rbox(0.6, 18, 0.5, shade(steel, -0.14), { x: Math.cos(a) * 9.95, y: 3.6, z: Math.sin(a) * 9.95, ry: -a }, 0.2)))
  }
  g.add(cyl(9.8, 9.8, 2, black, { y: 23 }, 32))
  g.add(ball(9.4, steel, { y: 24.6 }, [1, 0.4, 1]))
  g.add(cyl(3.2, 3.2, 1.6, acc, { y: 27.6 }, 20))
  g.add(rbox(4.4, 4, 4.4, black, { y: 19.6, z: 10.6 }, 1.2))
  g.add(cyl(0.9, 1, 2, black, { y: 18, z: 12.2 }, 12))
  g.add(tube([[-9.4, 22, 0], [-11.4, 20, 0], [-11.4, 10, 0], [-9.6, 8, 0]], 1, black, { ...TUBE, seg: 16, radial: 8 }))
  return shift(g, 1.3, -1.4)
}

// ======================================================================
// 果盘（family prop-fruit-bowl）
// ======================================================================

function apple(g: THREE.Group, x: number, y: number, z: number, c: string, r = 3.3) {
  g.add(ball(r, c, { x, y: y + r * 0.92, z }, [1, 0.92, 1]))
  g.add(cyl(0.22, 0.25, 1.4, C.woodD, { x, y: y + r * 1.8, z, rz: 0.2 }, 6))
}
function citrus(g: THREE.Group, x: number, y: number, z: number, c: string, r = 3) {
  g.add(ball(r, c, { x, y: y + r * 0.9, z }, [1, 0.9, 1]))
  g.add(noOutlineDeep(ball(0.5, C.leafD, { x, y: y + r * 1.78, z })))
}
function banana(g: THREE.Group, x: number, y: number, z: number, ry: number) {
  const b = tube([
      [-6, 2.4, 0],
      [-3, 0.9, 0],
      [0, 0.6, 0],
      [3, 0.9, 0],
      [6, 2.4, 0],
    ], 1.2, '#ffd75a', { ...TUBE, seg: 16, radial: 8 })
  const k = G(b)
  k.position.set(x, y + 0.6, z)
  k.rotation.y = ry
  g.add(k)
}

/** 铁丝果篮：一圈圈铁丝环 + 竖丝，香蕉、苹果、橙子 [铁丝, 苹果, 橙] */
function fruitWire(p: string[]) {
  const [wire, appleC, orangeC] = p
  const g = new THREE.Group()
  g.add(torus(6.5, 0.35, wire, { y: 0.35, rx: PI / 2 }))
  for (let k = 0; k < 4; k++) {
    const y = 1.6 + k * 3
    g.add(torus(7.5 + k * 1.4, 0.3, wire, { y, rx: PI / 2 }))
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * PI * 2
    g.add(rod3([Math.cos(a) * 6.5, 0.4, Math.sin(a) * 6.5], [Math.cos(a) * 11.7, 10.6, Math.sin(a) * 11.7], 0.28, wire, 5))
  }
  g.add(cyl(7, 7, 0.4, shade(wire, 0.1), { y: 1.2 }, 24))
  apple(g, -3, 1.6, 2, appleC)
  citrus(g, 3.4, 1.6, -2.6, orangeC, 3.2)
  citrus(g, 3, 1.6, 3.6, orangeC, 2.9)
  apple(g, -3.2, 1.6, -3.6, shade(appleC, -0.1), 3)
  banana(g, 0, 7, 0, 0.5)
  return g
}

/** 高脚果盘：细脚 + 浅盘，葡萄串、梨和桃 [盘, 葡萄, 桃] */
function fruitFooted(p: string[]) {
  const [dish, grape, peach] = p
  const g = G(cyl(5, 5.6, 1.2, dish, {}, 28))
  g.add(cyl(1.4, 2.2, 5.6, dish, { y: 1.2 }, 16))
  g.add(cup(12, 5, 2.8, 0.6, dish, { y: 6.6 }))
  const r = rng(13)
  for (let i = 0; i < 14; i++) {
    const t = i / 14
    const rr = 2.6 * (1 - t * 0.7)
    const a = i * 2.4
    g.add(ball(1.2, i % 3 ? grape : shade(grape, -0.12), { x: -4 + Math.cos(a) * rr, y: 8.8 + t * 5 + r() * 0.5, z: 2 + Math.sin(a) * rr }))
  }
  g.add(cyl(0.2, 0.2, 2, C.woodD, { x: -4, y: 13.8, z: 2 }, 6))
  // 梨
  g.add(ball(3.2, '#d8e27a', { x: 4, y: 10.6, z: 1 }, [1, 0.95, 1]))
  g.add(ball(2.2, '#d8e27a', { x: 4, y: 13.8, z: 1 }))
  g.add(cyl(0.2, 0.25, 1.4, C.woodD, { x: 4, y: 15.6, z: 1 }, 6))
  g.add(ball(3, peach, { x: 0.6, y: 10.6, z: -4.6 }))
  return g
}

/** 木钵 + 橘子：宽口低矮的木钵里堆着带叶的小橘子 [木钵, 橘子, 叶] */
function fruitWoodBowl(p: string[]) {
  const [wood, mikan, leafC] = p
  const g = G(cyl(6, 6.5, 1, shade(wood, -0.1), {}, 24))
  g.add(cup(12.5, 7.5, 6, 1.2, wood, { y: 0.8 }))
  const spots: V3[] = [
    [-4.2, 2, 2.2],
    [3.6, 2, 3],
    [0.4, 2, -4.4],
    [4.6, 2, -2.6],
    [-4.4, 2, -2.8],
    [-0.4, 5.2, 0.2],
  ]
  for (const [x, y, z] of spots) {
    g.add(ball(3, mikan, { x, y: y + 2.4, z }, [1, 0.82, 1]))
    g.add(noOutlineDeep(ball(0.5, C.leafD, { x, y: y + 4.9, z })))
  }
  g.add(blade(3.6, 0.45, 0.12, leafC, [-0.4, 10.2, 0.2], new THREE.Vector3(1, 0.3, 0.4)))
  return g
}

/** 藤编椭圆浅篮：编织篮 + 柠檬、青柠 [藤, 柠檬, 青柠] */
function fruitRattan(p: string[]) {
  const [cane, lemon, lime] = p
  const g = new THREE.Group()
  const b = cup(12.4, 10.6, 5.5, 0.8, cane)
  b.scale.z = 0.85
  g.add(b)
  for (const y of [1.6, 3.4]) {
    const t = torus(rAt(12.4, 10.6, 5.5, y) + 0.05, 0.35, shade(cane, -0.15), { y, rx: PI / 2 })
    t.scale.y = 0.85
    g.add(t)
  }
  const lem = (x: number, z: number, c: string, ry: number) => {
    const m = ball(3, c, { x, y: 3.6, z }, [1.3, 0.9, 0.95])
    m.rotation.y = ry
    g.add(m)
  }
  lem(-5, 1.5, lemon, 0.3)
  lem(1, 3, lemon, -0.4)
  lem(5.6, -1.2, lime, 0.8)
  lem(-1.6, -3, lime, -0.2)
  lem(-0.6, 0, lemon, 1.2)
  g.children[g.children.length - 1].position.y = 6.4
  return g
}

// ======================================================================
// 钥匙托盘（family prop-key-tray）
// ======================================================================

/** 皮革按扣托盘：四角用按扣把边折起来 [皮革, 按扣, 点缀] */
function keyLeather(p: string[]) {
  const [leather, snap, acc] = p
  const g = G(rbox(15, 0.4, 11, leather, {}, 0.15))
  for (const sz of [-1, 1]) g.add(rbox(15, 2.6, 0.4, leather, { z: sz * 5.5, rx: sz * 0.35 }, 0.15))
  for (const sx of [-1, 1]) g.add(rbox(0.4, 2.6, 11, leather, { x: sx * 7.5, rz: -sx * 0.35 }, 0.15))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.6, 0.6, 0.8, snap, { x: sx * 7.9, y: 1.6, z: sz * 5.9, rz: (-sx * PI) / 2 }, 12))
  g.add(at(key(STEEL), -1.4, 0.4, 1.2, 0.3))
  g.add(at(key(BRASS), 2, 0.4, -1.4, -0.6))
  g.add(rbox(3.2, 0.5, 2, acc, { x: 3.6, y: 0.4, z: 2.2, ry: 0.3 }, 0.25))
  return g
}

/** 陶瓷豆形小碟：腰果形轮廓的浅碟，钥匙、戒指和硬币 [瓷, 点缀, 戒指] */
function keyBean(p: string[]) {
  const [ceramic, acc, ringC] = p
  const outline: Poly = Array.from({ length: 48 }, (_, i): [number, number] => {
    const a = (i / 48) * PI * 2
    const r = 1 - 0.22 * Math.max(0, Math.sin(a)) ** 3
    return [Math.cos(a) * 9 * r, Math.sin(a) * 6 * r - 0.3]
  })
  const g = G(shapeTray(outline, 0.86, 1.6, ceramic))
  g.add(noOutlineDeep(rbox(4, 0.2, 0.5, acc, { x: -4, y: 1.4, z: -4.1, ry: 0.4 }, 0.1)))
  g.add(at(key(STEEL), -1.2, 0.6, -0.8, 0.2))
  g.add(torus(1, 0.3, ringC, { x: 3.4, y: 0.9, z: 1.2, rx: PI / 2 }))
  g.add(cyl(1.2, 1.2, 0.3, BRASS, { x: 4.2, y: 0.6, z: -2 }, 16))
  return g
}

/** 分格木托盘：中间一道隔板，一边放钥匙、一边放耳机盒和硬币 [木, 耳机盒, 点缀] */
function keyWood(p: string[]) {
  const [wood, pod, acc] = p
  const g = G(tray(19, 2.4, 12, 0.9, wood))
  g.add(rbox(0.9, 2, 10.4, wood, { x: 2.5 }, 0.3))
  g.add(at(key(STEEL), -3.5, 0.9, 1.4, 0.2))
  g.add(at(key(BRASS), -3, 0.9, -2, -0.4))
  g.add(rbox(5, 2.2, 4, pod, { x: 6, y: 0.9, z: 1.6 }, 1.6))
  g.add(cyl(1.1, 1.1, 0.3, acc, { x: 6, y: 0.9, z: -3 }, 16))
  g.add(cyl(1.1, 1.1, 0.3, acc, { x: 6.4, y: 1.2, z: -2.6 }, 16))
  return g
}

/** 猫咪托盘：椭圆猫脸浅盘 + 两只三角耳朵，钥匙挂着小铃铛 [瓷, 铃铛, 耳内] */
function keyCat(p: string[]) {
  const [ceramic, bell, ear] = p
  const head = ellipsePoly(8.6, 5.4, 0, 1, 40)
  const g = G(shapeTray(head, 0.84, 1.6, ceramic))
  for (const sx of [-1, 1]) {
    // 耳朵：头顶（-z）两侧的三角块，底边埋进盘沿
    g.add(prism([[sx * 7.2, -1.6], [sx * 6.6, -6.2], [sx * 3.2, -3.6]], 1.6, ceramic))
    g.add(noOutlineDeep(prism([[sx * 6.5, -2.6], [sx * 6.3, -5.2], [sx * 4.4, -3.7]], 0.3, ear, 1.6)))
    g.add(noOutlineDeep(ball(1.1, ear, { x: sx * 4.6, y: 0.7, z: 3.4 }, [1, 0.2, 0.7])))
  }
  g.add(at(key(STEEL), -1, 0.6, 0.6, 0.3))
  g.add(ball(0.9, bell, { x: -4.4, y: 1.5, z: 1.2 }))
  return g
}

// ======================================================================
// 一叠书（family prop-book-stack）
// ======================================================================

function slabBook(bw: number, t: number, bd: number, color: string, page = C.cream) {
  const g = new THREE.Group()
  g.add(rbox(bw, t, bd, color, {}, 0.4))
  g.add(rbox(bw - 0.6, t - 0.7, bd - 1.2, page, { x: 0.6, y: 0.35 }, 0.2))
  return g
}
function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z)
  o.rotation.y = ry
  return o
}

/** 高叠书堆：六本大小不一的书，有两本夹着丝带书签 [色 1, 色 2, 色 3] */
function booksTall(p: string[]) {
  const r = rng(29)
  const g = new THREE.Group()
  const cols = [p[0], p[1], p[2], shade(p[0], -0.12), shade(p[1], 0.1), p[2]]
  let y = 0
  for (let i = 0; i < 6; i++) {
    const t = 2.4 + r() * 1.2
    const bw = 22 - i * 1 + r() * 1.2
    const bd = 16 - i * 0.5
    g.add(place(slabBook(bw, t, bd, cols[i]), (r() - 0.5) * 1.2, y, (r() - 0.5) * 0.8, (r() - 0.5) * 0.3))
    if (i === 1 || i === 4) g.add(noOutlineDeep(rbox(0.8, 0.2, 3, i === 1 ? C.red : C.lemon, { x: -2 + i, y: y + t * 0.5, z: bd / 2 + 1 }, 0.05)))
    y += t
  }
  return g
}

/** 交错叠放：每本转 90° 叠上去，像书店的平台 [色 1, 色 2, 色 3] */
function booksCross(p: string[]) {
  const r = rng(7)
  const g = new THREE.Group()
  const cols = [p[0], p[1], p[2], shade(p[0], 0.1), shade(p[2], -0.1)]
  let y = 0
  for (let i = 0; i < 5; i++) {
    const t = 2.2 + r() * 1
    g.add(place(slabBook(20.2 - r() * 0.4, t, 14.2 - r() * 0.5, cols[i]), 0, y, 0, (i % 2 ? PI / 2 : 0) + (r() - 0.5) * 0.12))
    y += t
  }
  return g
}

/** 古书堆：皮面精装书带竹节书脊和烫金线，顶上一副圆眼镜 [皮面 1, 皮面 2, 烫金] */
function booksVintage(p: string[]) {
  const r = rng(19)
  const g = new THREE.Group()
  const cols = [p[0], p[1], shade(p[0], -0.15), shade(p[1], 0.08)]
  let y = 0
  for (let i = 0; i < 4; i++) {
    const t = 3 + r() * 0.8
    const bw = 22 - i * 1.3
    const bd = 16 - i * 0.6
    const k = place(slabBook(bw, t, bd, cols[i], '#efe2c4'), (r() - 0.5) * 1, y, (r() - 0.5) * 0.8, (r() - 0.5) * 0.2)
    // 书脊在 -x：竹节 + 烫金线
    for (const z of [-bd / 3, 0, bd / 3]) k.add(rbox(0.6, t + 0.2, 0.8, cols[i], { x: -bw / 2 - 0.1, y: -0.1, z }, 0.25))
    for (const z of [-bd / 6, bd / 6]) k.add(noOutlineDeep(rbox(0.3, t * 0.5, 2.4, p[2], { x: -bw / 2 - 0.15, y: t * 0.25, z }, 0.1)))
    g.add(k)
    y += t
  }
  // 圆眼镜
  for (const sx of [-1, 1]) g.add(torus(1.7, 0.18, DARK, { x: sx * 2.1, y: y + 0.2, z: 1, rx: PI / 2 }))
  g.add(noOutlineDeep(cyl(0.12, 0.12, 0.9, DARK, { x: 0, y: y + 0.2, z: 1, rz: PI / 2 }, 6)))
  g.children[g.children.length - 1].position.y = y + 0.2
  for (const sx of [-1, 1]) g.add(rbox(0.25, 0.25, 6, DARK, { x: sx * 3.8, y: y + 0.08, z: -2.2 }, 0.1))
  return g
}

/** 杂志画册：一本厚画册打底，上面散叠几本薄杂志 [画册, 杂志 1, 杂志 2] */
function booksMagazine(p: string[]) {
  const g = new THREE.Group()
  g.add(slabBook(25, 2.6, 18.4, p[0], C.white))
  const mags: [number, string, number, number][] = [
    [0.1, p[1], -0.8, 0.4],
    [-0.08, p[2], 0.6, -0.4],
    [0.16, shade(p[1], -0.15), -0.4, 0.2],
    [-0.04, C.white, 0.3, 0],
  ]
  let y = 2.6
  for (const [ry, c, x, z] of mags) {
    g.add(place(slabBook(21, 0.9, 15.6, c, '#f7f7f4'), x, y, z, ry))
    y += 0.9
  }
  return g
}

// ======================================================================
// 带盖小垃圾桶（family chore-swing-bin）
// ======================================================================

/** 脚踏小圆桶：钢身 + 底圈 + 前面一块脚踏板，圆盖后面有铰链 [桶身, 盖, 踏板 / 底圈] */
function binPedal(p: string[]) {
  const [body, lid, foot] = p
  const g = G(cyl(10.2, 10.2, 2.4, foot, {}, 32))
  g.add(cyl(10.5, 10, 24, body, { y: 2.2 }, 36))
  g.add(puck(10.8, 3, lid, { y: 26 }))
  g.add(rbox(5, 1.8, 2, foot, { y: 26.4, z: -10.6 }, 0.6))
  g.add(rbox(6, 1.4, 5, foot, { y: 0.6, z: 11.6 }, 0.6))
  g.add(rbox(3, 2, 2, foot, { y: 0.6, z: 9.6 }, 0.5))
  return g
}

/** 方形摇盖桶：方桶 + 顶框，中间一块翻板 [桶身, 顶框, 翻板] */
function binSquare(p: string[]) {
  const [body, frame, flap] = p
  const g = G(rbox(21, 25, 21, body, {}, 2.5))
  g.add(rbox(22, 4, 22, frame, { y: 24.6 }, 1.8))
  g.add(noOutlineDeep(rbox(14, 0.4, 9, shade(frame, -0.4), { y: 28.4, z: 3 }, 0.2)))
  g.add(rbox(13.4, 0.8, 8.4, flap, { y: 28.6, z: 3, rx: -0.18 }, 0.3))
  return g
}

/** 圆顶摇盖桶：圆桶 + 半球形顶盖，前面开一个摇盖口 [桶身, 圆顶, 摇盖] */
function binDome(p: string[]) {
  const [body, dome, flap] = p
  const g = G(cyl(10.2, 10.2, 1.6, shade(body, -0.15), {}, 32))
  g.add(cyl(10.5, 10.2, 22, body, { y: 1.4 }, 36))
  g.add(cyl(10.8, 10.8, 1.6, dome, { y: 23 }, 36))
  g.add(ball(10.6, dome, { y: 24.4 }, [1, 0.8, 1]))
  // 前上方一块贴着圆顶曲面的推盖：θ 是离开正上方的角度，按椭球法线摆正
  const th = 0.7
  const fl = G(rbox(8.4, 0.8, 6.4, flap, { y: -0.3 }, 0.35), noOutlineDeep(rbox(9.4, 0.3, 7.4, shade(dome, -0.3), { y: -0.35 }, 0.15)))
  fl.position.set(0, 24.4 + 8.48 * Math.cos(th), 10.6 * Math.sin(th))
  fl.rotation.x = Math.atan2(Math.sin(th), Math.cos(th) / 0.8)
  g.add(fl)
  return g
}

/** 藤编带盖小桶：编织桶身 + 木盖 + 盖钮，两侧皮提手 [藤, 盖, 提手] */
function binRattan(p: string[]) {
  const [cane, lid, strap] = p
  const g = G(cup(11.4, 10.2, 24, 0.9, cane))
  for (let k = 0; k < 6; k++) g.add(torus(rAt(11.4, 10.2, 24, 2 + k * 4) + 0.05, 0.42, shade(cane, -0.15), { y: 2 + k * 4, rx: PI / 2 }))
  g.add(puck(11.8, 2.2, lid, { y: 23.6 }))
  g.add(cyl(3, 3.6, 1.2, shade(lid, -0.08), { y: 25.6 }, 20))
  g.add(ball(1.5, shade(lid, -0.12), { y: 27.6 }))
  for (const sx of [-1, 1]) g.add(torus(2.6, 0.5, strap, { x: sx * 11.2, y: 19, ry: PI / 2 }, PI))
  return g
}

// ======================================================================
// 香水瓶（family prop-perfume）：占地 6 × 4 上下
// ======================================================================

/** 扁圆瓶：透镜形玻璃瓶 + 彩色香水 + 珍珠瓶盖 [香水, 瓶盖, 底座] */
function perfumeDisc(p: string[]) {
  const [juice, capC, foot] = p
  const g = G(cyl(1.6, 1.8, 0.6, foot, {}, 16))
  g.add(clearDeep(ball(3, '#eef7ff', { y: 3.4 }, [1, 1, 0.64]), '#eef7ff', 0.35))
  g.add(ball(2.5, juice, { y: 3.2 }, [1, 0.85, 0.5]))
  g.add(cyl(0.7, 0.8, 1, foot, { y: 6.2 }, 12))
  g.add(ball(1.3, capC, { y: 8.2 }))
  return g
}

/** 细长方瓶：高瘦的方玻璃瓶 + 一样高瘦的方瓶盖 [香水, 瓶盖, 标签] */
function perfumeTall(p: string[]) {
  const [juice, capC, label] = p
  const g = G(clearDeep(rbox(5.2, 9.5, 3.6, '#eef7ff', {}, 0.8), '#eef7ff', 0.35))
  g.add(rbox(4.4, 7.6, 2.8, juice, { y: 0.6 }, 0.5))
  g.add(noOutlineDeep(rbox(2.4, 1.6, 0.3, label, { y: 3.6, z: 1.9 }, 0.1)))
  g.add(cyl(0.8, 0.8, 1, STEEL, { y: 9.5 }, 12))
  g.add(rbox(2.6, 4.4, 2.6, capC, { y: 10.4 }, 0.5))
  return g
}

/** 复古气囊喷瓶：圆肚瓶 + 金属喷头，侧面一根软管连着气囊和流苏 [香水, 气囊 / 流苏, 金属] */
function perfumeAtomizer(p: string[]) {
  const [juice, bulb, metal] = p
  const g = G(cyl(1.4, 1.6, 0.5, metal, {}, 16))
  g.add(clearDeep(ball(2, '#eef7ff', { y: 2.4 }, [1, 1.05, 1]), '#eef7ff', 0.35))
  g.add(ball(1.6, juice, { y: 2.2 }))
  g.add(cyl(0.5, 0.6, 1.6, metal, { y: 4.3 }, 12))
  g.add(cyl(0.6, 0.6, 1, metal, { y: 5.8 }, 12))
  g.add(tube([[0.5, 6.4, 0], [1.6, 6.6, 0], [2.6, 6, 0], [3.1, 5, 0]], 0.18, metal, { ...TUBE, seg: 10, radial: 6 }))
  g.add(ball(1.1, bulb, { x: 3.3, y: 4.2 }, [0.9, 1.2, 0.9]))
  g.add(cyl(0.12, 0.12, 2, bulb, { x: 3.3, y: 1.2 }, 6))
  g.add(cyl(0.5, 0.2, 1.2, bulb, { x: 3.3, y: 0 }, 8))
  return g
}

/** 多面切割瓶：八角形水晶瓶 + 切面瓶塞 [香水, 瓶塞, 颈圈] */
function perfumeFacet(p: string[]) {
  const [juice, stopper, collar] = p
  const g = new THREE.Group()
  const body = clearDeep(cyl(2.7, 3.2, 6, '#eef7ff', {}, 8), '#eef7ff', 0.35)
  body.scale.z = 0.68
  g.add(body)
  const inner = cyl(2.2, 2.6, 4.8, juice, { y: 0.4 }, 8)
  inner.scale.z = 0.6
  g.add(inner)
  g.add(cyl(0.9, 1, 1.2, collar, { y: 6 }, 12))
  const st = cyl(1.2, 1.6, 1.6, stopper, { y: 7.2 }, 6)
  g.add(st)
  const top = cyl(0.2, 1.2, 1.6, stopper, { y: 8.8 }, 6)
  g.add(top)
  return g
}

// ======================================================================
// 目录
// ======================================================================

export const VARIANTS_B: AssetDef[] = [
  // —— 大型落地绿植 ——
  vb('vb-plant-snake', '虎尾兰', 'monstera', '虎尾兰', 'plants', [62, 62, 108.2], [['industrial', I.concrete, I.iron, ''], ['nordic', N.white, N.oak, ''], ['modern', M.char, M.silver, ''], ['cute', C.sakura, C.white, ''], ['japanese', J.sumi, J.shu, '']], snakePlant),
  vb('vb-plant-areca', '散尾葵', 'monstera', '散尾葵', 'plants', [65.3, 63.9, 104.4], [['nordic', '#d8c29a', N.oak, ''], ['japanese', J.hinoki, J.wood, ''], ['cute', C.white, C.sky, ''], ['retro', R.caramel, R.cream, ''], ['industrial', '#8f7a5c', I.iron, '']], areca),
  vb('vb-plant-pachira', '发财树', 'monstera', '发财树', 'plants', [64.2, 64.2, 122.7], [['modern', M.white, M.light, ''], ['retro', R.teal, R.cream, ''], ['japanese', J.ai, J.wood, ''], ['cute', C.lemon, C.white, ''], ['nordic', N.blue, N.oak, '']], pachira),
  vb('vb-plant-monstera-basket', '龟背竹', 'monstera', '藤篮', 'plants', [72.4, 65.5, 106.6], [['nordic', '#d8c29a', N.oakL, ''], ['japanese', J.hinoki, J.dark, ''], ['cute', C.woodL, C.pink, ''], ['industrial', '#8f7a5c', I.leather, '']], monsteraBasket),
  vb('vb-plant-cactus', '仙人掌组合', 'monstera', '仙人掌', 'plants', [62, 62, 116.9], [['retro', '#c9774a', C.pink, ''], ['industrial', I.concrete, C.red, ''], ['modern', M.white, C.pink, ''], ['cute', C.sky, C.lemon, '']], cactusGarden),

  // —— 圆地毯 ——
  vb('vb-rug-petal', '圆地毯', 'rug-round', '花瓣', 'living', [156, 156, 2.4], [['cute', C.sakura, C.white, C.pink], ['cute', C.lemon, C.white, C.sky], ['nordic', N.linen, N.white, N.mustard], ['retro', R.mustard, R.cream, R.orange]], rugPetal),
  vb('vb-rug-oval', '圆地毯', 'rug-round', '椭圆环纹', 'living', [164, 136, 2.7], [['nordic', N.linen, N.gray, N.mustard], ['retro', R.cream, R.teal, R.orange], ['modern', M.light, M.white, M.char], ['cute', C.cream, C.mint, C.pink], ['industrial', I.concrete, N.linen, I.rust]], rugOvalRings),
  vb('vb-rug-jute', '圆地毯', 'rug-round', '黄麻螺旋', 'living', [149, 149, 2.4], [['nordic', '#d6bf94', N.sage, N.white], ['japanese', '#cdb88a', J.ai, J.dark], ['industrial', '#b89d72', I.rust, I.iron], ['modern', '#cfc6b6', M.char, M.char]], rugJute),
  vb('vb-rug-rush', '圆地毯', 'rug-round', '蔺草', 'japanese', [143.6, 143.6, 2.4], [['japanese', J.tatami, J.ai, J.shu], ['japanese', '#d9cf9a', J.sumi, J.ai], ['nordic', '#d8d0a8', N.gray, N.sage]], rugRush),
  vb('vb-rug-medallion', '圆地毯', 'rug-round', '花纹', 'living', [159, 159, 2], [['retro', R.red, R.cream, R.mustard], ['retro', R.teal, R.cream, R.orange], ['nordic', N.linen, N.blue, N.mustard], ['industrial', I.rust, I.concrete, I.iron], ['cute', C.sakura, C.white, C.sky]], rugMedallion),

  // —— 圆茶几 ——
  vb('vb-ct-drum', '圆茶几', 'coffee-table', '圆鼓', 'living', [80, 80, 40], [['japanese', J.hinoki, J.dark, ''], ['nordic', N.oak, N.white, ''], ['modern', M.walnut, M.black, ''], ['cute', C.woodL, C.pink, '']], ctDrum, { surface: 40, surfaceShape: [ellipsePoly(37)] }),
  vb('vb-ct-tray', '圆茶几', 'coffee-table', '托盘', 'living', [82, 82, 39], [['nordic', N.oak, M.black, ''], ['industrial', I.walnut, I.iron, ''], ['modern', M.white, M.char, ''], ['cute', C.mint, C.white, '']], ctTray, { surface: 35.7, surfaceShape: [ellipsePoly(38)] }),
  vb('vb-ct-tulip', '圆茶几', 'coffee-table', '郁金香', 'living', [86, 86, 36], [['modern', M.white, M.white, ''], ['modern', M.black, M.char, ''], ['retro', R.cream, R.teal, ''], ['cute', C.sakura, C.white, '']], ctTulip, { surface: 36, surfaceShape: [ellipsePoly(40)] }),
  vb('vb-ct-twotier', '圆茶几', 'coffee-table', '双层', 'living', [80, 80, 42], [['nordic', N.oak, N.oak, ''], ['japanese', J.dark, J.dark, ''], ['cute', C.white, C.woodL, ''], ['industrial', I.walnut, I.iron, '']], ctTwoTier, { surface: 42, surfaceShape: [ellipsePoly(37)], surfaces: [{ y: 14, shape: [ellipsePoly(26)], h: 24 }] }),
  vb('vb-ct-oval', '圆茶几', 'coffee-table', '椭圆玻璃', 'living', [92, 76, 37.2], [['modern', M.walnut, '#d6eefc', ''], ['nordic', N.oak, '#e4f3fb', ''], ['industrial', I.iron, '#cfe3ea', ''], ['retro', R.caramel, '#e8d9b0', '']], ctOvalGlass, { surface: 37.2, surfaceShape: [ellipsePoly(44, 36)], surfaces: [{ y: 10.2, shape: [ellipsePoly(24, 16)], h: 23 }] }),

  // —— 书架 ——
  vb('vb-bs-ladder', '书架', 'bookshelf', '梯形', 'storage', [75.6, 31.5, 178.4], [['nordic', N.oak, C.white, ''], ['industrial', I.walnut, I.rust, ''], ['modern', M.white, M.char, ''], ['japanese', J.hinoki, J.sumi, '']], bsLadder),
  vb('vb-bs-cube', '书架', 'bookshelf', '格子', 'storage', [80, 30, 171], [['cute', C.white, C.pink, C.sky], ['nordic', N.white, N.linen, N.sage], ['modern', M.black, M.gray, M.light], ['nordic', N.oak, N.gray, N.mustard]], bsCube, { surface: 170.8 }),
  vb('vb-bs-pipe', '书架', 'bookshelf', '水管', 'storage', [86, 30, 172], [['industrial', I.walnut, I.iron, ''], ['industrial', '#b98b5e', '#55575b', ''], ['modern', M.walnut, M.black, ''], ['retro', R.caramel, '#3a3a3c', '']], bsPipe, { surface: 172 }),
  vb('vb-bs-glass', '书架', 'bookshelf', '玻璃门', 'storage', [80, 32, 180], [['retro', R.caramel, BRASS, ''], ['japanese', J.dark, J.hinoki, ''], ['nordic', N.white, N.oak, ''], ['modern', M.walnut, M.black, '']], bsGlass, { surface: 180, surfaces: BS_GLASS_SURF, openable: true }),
  vb('vb-bs-arch', '书架', 'bookshelf', '拱顶', 'storage', [74, 28, 168], [['cute', C.sakura, C.lemon, ''], ['nordic', N.white, N.sage, ''], ['modern', M.light, M.char, ''], ['cute', C.mint, C.white, '']], bsArch),

  // —— 落地灯 ——
  vb('vb-fl-globe', '落地灯', 'floor-lamp', '球形', 'lighting', [36, 36, 168], [['modern', '#fffaf0', M.light, M.black], ['nordic', N.white, N.oak, N.oak], ['cute', C.lamp, C.sakura, C.white], ['retro', '#ffe7b0', R.caramel, BRASS]], flGlobe),
  vb('vb-fl-reading', '落地灯', 'floor-lamp', '阅读', 'lighting', [37.3, 34, 145.6], [['industrial', I.iron, I.iron, BRASS], ['retro', R.teal, R.cream, R.mustard], ['modern', M.white, M.char, M.silver], ['cute', C.pink, C.white, C.lemon]], flReading),
  vb('vb-fl-tiered', '落地灯', 'floor-lamp', '层叠灯罩', 'lighting', [36, 36, 154.2], [['retro', R.orange, R.cream, R.mustard], ['modern', M.white, M.black, M.white], ['nordic', N.white, N.oak, N.sage], ['cute', C.mint, C.white, C.pink]], flTiered),

  // —— 鞋柜 ——
  vb('vb-sc-retro', '鞋柜', 'shoe-cabinet', '藤编拉门', 'entrance', [84, 36.4, 91.8], [['retro', R.caramel, '#e3c99a', R.caramel], ['nordic', N.white, '#e3d2b0', N.oak], ['japanese', J.dark, J.washi, J.dark], ['cute', C.woodL, '#f3e3c3', C.wood]], scRetro, { surface: 92, surfaceShape: [rectPoly(-42, -18, 42, 15)], surfaces: SC_RETRO_SURF, openable: true }),
  vb('vb-sc-open', '鞋柜', 'shoe-cabinet', '下层开放', 'entrance', [80, 36.7, 104], [['modern', M.white, M.black, M.char], ['nordic', N.oak, N.white, N.blue], ['cute', C.white, C.woodD, C.pink], ['industrial', I.walnut, I.iron, I.leather]], scOpen, { surface: 104, surfaces: SC_OPEN_SURF, openable: true }),
  vb('vb-sc-shoji', '鞋柜', 'shoe-cabinet', '格子拉门', 'entrance', [80, 36.6, 96], [['japanese', J.hinoki, J.washi, ''], ['japanese', J.dark, J.washi, ''], ['nordic', N.oakL, N.white, '']], scShoji, { surface: 96, surfaces: SC_SHOJI_SURF, openable: true }),
  vb('vb-sc-mesh', '鞋柜', 'shoe-cabinet', '铁网门', 'entrance', [82, 36.5, 100], [['industrial', I.iron, I.walnut, ''], ['modern', M.white, M.light, ''], ['industrial', '#4a5a4f', N.oak, ''], ['cute', C.sky, C.woodL, '']], scMesh, { surface: 100, surfaces: SC_MESH_SURF, openable: true }),

  // —— 五斗柜 ——
  vb('vb-dr-tall', '五斗柜', 'dresser', '高柜', 'bedroom', [80, 43.6, 110], [['modern', M.white, M.gray, ''], ['modern', M.char, M.black, ''], ['nordic', N.oak, N.white, ''], ['nordic', N.white, N.oak, '']], drTall, { surface: 110, surfaces: drTallTrays().map(trayLevel), openable: true }),
  vb('vb-dr-mcm', '五斗柜', 'dresser', '中古', 'bedroom', [86, 44.3, 77.8], [['retro', R.caramel, BRASS, R.caramel], ['nordic', N.oak, N.white, N.oak], ['retro', R.teal, R.cream, R.caramel], ['industrial', I.walnut, I.iron, I.iron]], drMcm, { surface: 78, surfaces: drMcmTrays().map(trayLevel), openable: true }),
  vb('vb-dr-tansu', '五斗柜', 'dresser', '箪笥', 'bedroom', [80, 42.5, 90], [['japanese', J.wood, J.sumi, ''], ['japanese', J.dark, '#c9a35a', ''], ['japanese', J.hinoki, J.sumi, ''], ['retro', R.caramel, DARK, '']], drTansu, { surface: 90, surfaces: DR_TANSU_SURF, openable: true }),
  vb('vb-dr-candy', '五斗柜', 'dresser', '糖果色', 'bedroom', [76, 42.1, 85.5], [['cute', C.white, C.pink, C.mint], ['cute', C.cream, C.sky, C.lemon], ['cute', C.lilac, C.white, C.sakura], ['nordic', N.white, N.sage, N.blue]], drCandy, { surface: 85.5, surfaceShape: [rectPoly(-31, -15, 31, 11)], surfaces: [0, 1, 2, 3].map((k) => trayLevel(drCandyTray(k))), openable: true }),
  vb('vb-dr-metal', '五斗柜', 'dresser', '金属', 'bedroom', [80, 44.5, 84], [['industrial', '#55575b', '#6b6e73', STEEL], ['industrial', '#4a5a4f', '#5c6c60', BRASS], ['modern', M.white, M.light, M.char], ['retro', R.red, R.cream, STEEL]], drMetal, { surface: 84, surfaces: drMetalTrays().map(trayLevel), openable: true }),

  // —— 电水壶 ——
  vb('vb-kettle-goose', '电水壶', 'prop-kettle', '细口手冲', 'kitchenware', [22.9, 15.4, 16.4], [['modern', M.black, M.char, M.walnut], ['nordic', N.white, N.oak, N.oak], ['retro', R.cream, R.caramel, R.caramel], ['industrial', STEEL, I.iron, I.walnut]], kettleGoose, { prop: true }),
  vb('vb-kettle-glass', '电水壶', 'prop-kettle', '玻璃', 'kitchenware', [19.4, 16, 18], [['modern', M.black, M.silver, '#8fd0ff'], ['nordic', N.white, M.silver, '#9fe0c8'], ['cute', C.pink, C.white, '#ffc6e0'], ['industrial', I.iron, I.steel, '#ffcf8a']], kettleGlass, { prop: true }),
  vb('vb-kettle-dome', '电水壶', 'prop-kettle', '圆鼓', 'kitchenware', [19.9, 16.6, 21.1], [['retro', R.red, R.cream, BRASS], ['retro', R.mustard, '#3a3a3c', R.cream], ['cute', C.sky, C.white, C.lemon], ['modern', M.silver, M.black, M.white], ['nordic', N.sage, N.white, N.oak]], kettleDome, { prop: true }),
  vb('vb-kettle-cube', '电水壶', 'prop-kettle', '方形迷你', 'kitchenware', [18.6, 14.5, 16.8], [['modern', M.white, M.char, M.silver], ['cute', C.mint, C.white, C.pink], ['nordic', N.linen, N.white, N.oak], ['retro', R.orange, R.cream, R.cream]], kettleCube, { prop: true }),

  // —— 电热水瓶（蒸汽从顶面后侧的出气孔冒出来） ——
  vb('vb-epot-round', '电热水瓶', 'prop-electric-pot', '圆筒', 'kitchenware', [21.6, 23.8, 29.2], [['modern', M.white, M.light, M.char], ['nordic', N.white, N.oak, N.sage], ['cute', C.sky, C.white, C.pink], ['retro', R.cream, R.teal, R.orange]], epotRound, { prop: true, fx: [{ kind: 'steam', x: 0, y: 29, z: -5.1, scale: 0.7 }] }),
  vb('vb-epot-floral', '电热水瓶', 'prop-electric-pot', '花柄', 'kitchenware', [22, 23.2, 35.9], [['retro', R.cream, R.orange, R.red], ['retro', '#f4e7c8', R.olive, R.mustard], ['cute', C.white, C.pink, C.sakura], ['japanese', J.washi, J.ai, J.shu]], epotFloral, { prop: true, fx: [{ kind: 'steam', x: 0, y: 27.6, z: -3.6, scale: 0.7 }] }),
  vb('vb-epot-square', '电热水瓶', 'prop-electric-pot', '方形', 'kitchenware', [21, 24.7, 28], [['modern', M.char, M.black, '#8fd0ff'], ['modern', M.white, M.light, '#9fe0c8'], ['nordic', N.linen, N.white, '#ffd28a'], ['cute', C.mint, C.white, '#ffc6e0']], epotSquare, { prop: true, fx: [{ kind: 'steam', x: 0, y: 28, z: -7.35, scale: 0.7 }] }),
  vb('vb-epot-steel', '电热水瓶', 'prop-electric-pot', '不锈钢', 'kitchenware', [23.4, 23.6, 29.2], [['industrial', STEEL, M.black, I.rust], ['modern', '#e2e5e9', M.char, M.char], ['retro', '#d6d9dc', R.caramel, R.red]], epotSteel, { prop: true, fx: [{ kind: 'steam', x: 1.3, y: 29.2, z: -4.4, scale: 0.7 }] }),

  // —— 果盘 ——
  vb('vb-fruit-wire', '果盘', 'prop-fruit-bowl', '铁丝篮', 'kitchenware', [24, 24, 11.1], [['industrial', I.iron, '#ff6b6b', C.orange], ['modern', M.black, C.red, '#ffb347'], ['nordic', N.white, '#e88a7a', '#f2b45a'], ['cute', C.pink, '#ff6b6b', C.orange]], fruitWire, { prop: true }),
  vb('vb-fruit-footed', '果盘', 'prop-fruit-bowl', '高脚', 'kitchenware', [24, 24, 17], [['retro', R.cream, '#8e5bb5', '#ffb38a'], ['modern', M.white, '#6f4a8e', '#ffb38a'], ['cute', C.sakura, '#9b6fd0', C.peach], ['nordic', N.white, '#7c9a5a', '#f0a080']], fruitFooted, { prop: true }),
  vb('vb-fruit-wood', '果盘', 'prop-fruit-bowl', '木钵', 'kitchenware', [25, 25, 11.2], [['japanese', J.wood, '#ff9a3c', C.leafD], ['nordic', N.oak, '#ffa64d', C.leaf], ['japanese', '#8c2f2a', '#ff9a3c', C.leafD], ['modern', M.walnut, '#ff9a3c', C.leafD]], fruitWoodBowl, { prop: true }),
  vb('vb-fruit-rattan', '果盘', 'prop-fruit-bowl', '藤编浅篮', 'kitchenware', [24.8, 21.1, 9.1], [['nordic', '#d8c29a', '#ffe066', '#9acd5a'], ['japanese', J.hinoki, '#ffe066', '#9acd5a'], ['cute', C.woodL, '#ffe066', C.mint]], fruitRattan, { prop: true }),

  // —— 钥匙托盘 ——
  vb('vb-keytray-leather', '钥匙托盘', 'prop-key-tray', '皮革', 'tabletop', [16.6, 13, 2.6], [['industrial', I.leather, BRASS, I.rust], ['nordic', N.linen, STEEL, N.mustard], ['modern', M.black, STEEL, M.white], ['retro', R.caramel, BRASS, R.teal]], keyLeather, { prop: true }),
  vb('vb-keytray-bean', '钥匙托盘', 'prop-key-tray', '陶瓷豆形', 'tabletop', [18, 10.7, 1.6], [['nordic', N.white, N.sage, BRASS], ['japanese', J.ai, J.washi, BRASS], ['cute', C.sakura, C.white, '#ff8fb0'], ['modern', M.char, M.white, STEEL]], keyBean, { prop: true }),
  vb('vb-keytray-wood', '钥匙托盘', 'prop-key-tray', '分格木盘', 'tabletop', [19, 12, 3.1], [['nordic', N.oak, C.white, BRASS], ['japanese', J.dark, C.white, BRASS], ['modern', M.walnut, M.black, STEEL], ['industrial', I.walnut, M.char, I.rust]], keyWood, { prop: true }),
  vb('vb-keytray-cat', '钥匙托盘', 'prop-key-tray', '猫咪', 'tabletop', [17.2, 12.8, 2.4], [['cute', C.white, BRASS, C.pink], ['cute', C.lemon, BRASS, C.peach], ['cute', '#6b6061', BRASS, C.pink], ['japanese', J.washi, J.shu, J.shu]], keyCat, { prop: true }),

  // —— 一叠书 ——
  vb('vb-books-tall', '一叠书', 'prop-book-stack', '高叠', 'tabletop', [24.4, 19, 17], [['cute', C.pink, C.sky, C.lemon], ['nordic', N.blue, N.sage, N.mustard], ['modern', M.char, M.light, M.walnut], ['japanese', J.ai, J.shu, J.washi], ['retro', R.teal, R.mustard, R.red]], booksTall, { prop: true }),
  vb('vb-books-cross', '一叠书', 'prop-book-stack', '交错', 'tabletop', [20.6, 19.4, 13.6], [['cute', C.mint, C.lilac, C.peach], ['nordic', N.sage, N.white, N.blue], ['modern', M.black, M.white, M.gray], ['retro', R.orange, R.cream, R.teal]], booksCross, { prop: true }),
  vb('vb-books-vintage', '一叠书', 'prop-book-stack', '古书', 'tabletop', [23.6, 17.1, 13], [['retro', '#7a3b2e', '#2f4a3a', BRASS], ['industrial', I.leather, '#3a3a3c', BRASS], ['japanese', J.ai, J.dark, '#c9a35a'], ['nordic', '#6f8fa8', N.oak, BRASS]], booksVintage, { prop: true }),
  vb('vb-books-mag', '一叠书', 'prop-book-stack', '杂志画册', 'tabletop', [25.2, 19.2, 6.2], [['modern', M.black, M.white, C.red], ['nordic', N.white, N.blue, N.mustard], ['cute', C.sakura, C.sky, C.lemon], ['retro', R.mustard, R.teal, R.red]], booksMagazine, { prop: true }),

  // —— 带盖小垃圾桶 ——
  vb('vb-bin-pedal', '带盖小垃圾桶', 'chore-swing-bin', '脚踏', 'storage', [21.6, 25.7, 29], [['modern', STEEL, M.black, M.char], ['modern', M.white, M.white, M.char], ['retro', R.mustard, R.cream, DARK], ['cute', C.mint, C.white, C.pink], ['industrial', I.steel, I.iron, I.iron]], binPedal),
  vb('vb-bin-square', '带盖小垃圾桶', 'chore-swing-bin', '方形摇盖', 'storage', [22, 22, 30.1], [['modern', M.white, M.light, M.char], ['modern', M.char, M.black, M.gray], ['cute', C.sky, C.white, C.lemon], ['nordic', N.linen, N.oak, N.white]], binSquare),
  vb('vb-bin-dome', '带盖小垃圾桶', 'chore-swing-bin', '圆顶', 'storage', [21.6, 21.6, 32.9], [['retro', R.teal, R.cream, R.orange], ['retro', R.red, R.cream, R.cream], ['cute', C.sakura, C.white, C.lemon], ['modern', M.gray, M.white, M.char]], binDome),
  vb('vb-bin-rattan', '带盖小垃圾桶', 'chore-swing-bin', '藤编', 'storage', [24, 23.6, 29.1], [['nordic', '#d8c29a', N.oak, I.leather], ['japanese', J.hinoki, J.dark, J.dark], ['cute', C.woodL, C.white, C.pink]], binRattan),

  // —— 香水瓶 ——
  vb('vb-perfume-disc', '香水瓶', 'prop-perfume', '扁圆', 'toiletry', [6, 3.9, 9.5], [['cute', C.pink, '#fffaf2', BRASS], ['cute', C.lilac, '#fffaf2', STEEL], ['nordic', N.sage, N.white, N.oak], ['modern', M.char, M.white, M.silver]], perfumeDisc, { prop: true }),
  vb('vb-perfume-tall', '香水瓶', 'prop-perfume', '细长', 'toiletry', [5.2, 3.6, 14.8], [['modern', '#c9a87a', M.black, M.white], ['modern', '#8fb4d9', M.silver, M.black], ['nordic', '#e8d9b0', N.oak, N.white], ['cute', C.sakura, C.white, C.pink]], perfumeTall, { prop: true }),
  vb('vb-perfume-atomizer', '香水瓶', 'prop-perfume', '气囊喷瓶', 'toiletry', [6.8, 4, 7.4], [['retro', '#e0a526', R.red, BRASS], ['retro', '#d98fa0', '#2f4a3a', BRASS], ['cute', C.lilac, C.pink, '#e8e0f0'], ['japanese', J.shu, J.sumi, BRASS]], perfumeAtomizer, { prop: true }),
  vb('vb-perfume-facet', '香水瓶', 'prop-perfume', '切割水晶', 'toiletry', [6.4, 4.4, 10.4], [['modern', '#9fd3e8', '#e8f4fa', M.silver], ['retro', '#e0a526', '#f4e7c8', BRASS], ['cute', C.pink, C.sakura, BRASS], ['nordic', N.sage, N.white, N.oak]], perfumeFacet, { prop: true }),
]

