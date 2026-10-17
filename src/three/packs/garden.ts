// 园艺素材包：各种材质 / 造型的花盆（S / M / L 规格）、带盆的盆栽植物、园艺用具与园艺家具。约定见 kit.ts 开头。
//
// 约定补充：
//   - id 统一用 gd- 前缀。
//   - 花盆都是空心的，土面在口沿下 1–2cm；空盆也带一层土，可以直接当「种好了还没发芽」的盆摆。
//   - 植物的枝叶尽量收在声明的 w / d 里：w / d 按实际包围盒填写，build 时会把包围盒在 xz 上居中。
//   - 挂起形态（form: 'hanging'）原点 = 挂点：自带 J 钩，横臂在 y = -2 往 -z 插进 1cm，模型都在原点下方、本体在 z ≥ 0.3。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, holePanel, rectPoly, rng, type AssetCategory, type AssetDef, type StyleTag } from '../kit'
import { PI, clearMat, lit, noOutline, rod3, taperRod3, type V3 } from '../geo'
import { I, J, M, N, R, type Build } from '../packkit'

const SOIL = '#7f5f45'
const TERRA = '#c8794e'
const STEM = '#5f8f4a'
const LEAF = C.leaf
const LEAF_D = C.leafD
const MOSS = '#7fae4e'
const BARK = '#9a6a45'
const ROPE = '#d9c39a'
const GLASS = C.glass
const WATER = '#8fc8f0'
const STEEL = '#c3c7cc'
const RUBBER = '#2e2f33'
const BAMBOO = '#cdb57a'
const PLASTIC_BLACK = '#38383a'

// ---------- 小工具 ----------

/** 按风格分组写配色，展开成 palettes + paletteStyles + styles */
function sty(groups: Partial<Record<StyleTag, string[][]>>) {
  const palettes: string[][] = []
  const paletteStyles: StyleTag[] = []
  for (const [k, ps] of Object.entries(groups) as [StyleTag, string[][]][])
    for (const p of ps) {
      palettes.push(p)
      paletteStyles.push(k)
    }
  return { palettes, paletteStyles, styles: Object.keys(groups) as StyleTag[] }
}
type Pals = ReturnType<typeof sty>

/** 两点之间的胶囊（握把、手指） */
function capsAlong(a: V3, b: V3, r: number, color: string) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const len = Math.max(0.01, dir.length() - r * 2)
  const m = capsule(r, len, color)
  m.position.set(0, 0, 0)
  const g = G(m)
  g.position.copy(va).add(vb).multiplyScalar(0.5)
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return g
}
/** 物体的 +y 轴对准 dir，放在 at */
function aim<T extends THREE.Object3D>(o: T, at: V3, dir: V3): T {
  o.position.set(...at)
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize())
  return o
}
/** yaw / pitch 对应的方向；pitch 负值朝上 */
const dirOf = (yaw: number, pitch: number): V3 => [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
/** 水平角 a（x = cos a, z = sin a）换算成 yaw */
const yawTo = (a: number) => PI / 2 - a
const along = (b: V3, d: V3, l: number): V3 => [b[0] + d[0] * l, b[1] + d[1] * l, b[2] + d[2] * l]
/** 叶片：叶柄端在 base，沿 yaw / pitch 方向伸出 */
function sprig(len: number, color: string, base: V3, yaw: number, pitch: number, wide = 0.45, thick = 0.12) {
  const m = ball(len / 2, color, {}, [wide, thick, 1])
  m.rotation.set(pitch, yaw, 0, 'YXZ')
  m.position.set(...along(base, dirOf(yaw, pitch), len / 2))
  return m
}
const curveOf = (pts: V3[]) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
/** 沿折线的软管 / 藤蔓 / 绳 */
function tube(pts: V3[], r: number, color: string, seg = 24, radial = 6) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(curveOf(pts), seg, r, radial, false), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function lathe(pts: [number, number][], color: string, seg = 32, phi: [number, number] = [0, PI * 2]) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi[0], phi[1]), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
/** 实心环带（盆口加厚的口沿、底圈） */
function band(rOB: number, rOT: number, rIB: number, rIT: number, h: number, color: string, y = 0) {
  const m = lathe([[rIB, 0], [rOB, 0], [rOT, h], [rIT, h], [rIB, 0]], color)
  m.position.y = y
  return m
}
/** 外轮廓 [r, y]（从底到口沿外侧，最后一点 y = 口沿顶 - t/2）上的半径插值 */
function rAt(prof: [number, number][], y: number) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1]
    const [r1, y1] = prof[i]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1)
  }
  return prof[prof.length - 1][0]
}
/** 任意外轮廓的空心旋转体（鼓肚盆、草莓罐、玻璃球） */
function hollow(prof: [number, number][], t: number, color: string, seg = 32, phi?: [number, number]) {
  const pts: [number, number][] = [[0, 0], ...prof]
  const [rt, yt] = prof[prof.length - 1]
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * PI
    pts.push([rt - t / 2 + (Math.cos(a) * t) / 2, yt + (Math.sin(a) * t) / 2])
  }
  pts.push([rt - t, yt])
  for (let i = prof.length - 2; i >= 0; i--) {
    const [r, y] = prof[i]
    if (y <= t + 0.2) break
    pts.push([Math.max(0.1, r - t), y])
  }
  pts.push([Math.max(0.1, rAt(prof, t) - t), t], [0, t])
  return lathe(pts, color, seg, phi)
}
/** 圆形土面：顶面在 top */
const soilDisc = (r: number, top: number, color = SOIL) => cyl(r, r - 0.05, 0.8, color, { y: top - 0.8 })
/** 土面上撒的小石子 / 树皮屑 */
function scatter(g: THREE.Group, r: number, y: number, n: number, color: string, seed: number, size = 0.55) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++) {
    const a = rand() * PI * 2
    const d = Math.sqrt(rand()) * (r - size - 0.2)
    g.add(noOutline(ball(size * (0.7 + rand() * 0.5), color, { x: Math.cos(a) * d, y: y + 0.05, z: Math.sin(a) * d }, [1, 0.5, 0.9])))
  }
}

/** 把包围盒在 xz 上居中（植物、工具）；壁挂件另外把底边放到 mount 高度 */
function settle(g: THREE.Group, mount?: number) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  g.position.x -= (b.min.x + b.max.x) / 2
  g.position.z -= (b.min.z + b.max.z) / 2
  if (mount !== undefined) g.position.y += mount - b.min.y
  return G(g)
}

function A(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pals, build: Build, extra: Partial<AssetDef> & { keep?: boolean } = {}): AssetDef {
  const { keep, ...rest } = extra
  const hang = rest.form === 'hanging'
  const b: Build = keep || hang ? build : (p) => settle(build(p), rest.mount)
  return { id, name, category, w, d, h, ...pals, ...rest, build: b }
}

// ======================================================================
// 花盆
// ======================================================================

interface Pot {
  g: THREE.Group
  /** 土面顶 y */
  soil: number
  /** 土面半径 */
  r: number
  /** 口沿顶 y */
  top: number
}

/** 素烧陶盆：锥形盆身 + 加厚口沿，下面一只盆托 */
function terraPot(rTop: number, h: number, color: string, saucer = true): Pot {
  const g = new THREE.Group()
  const rBot = rTop * 0.72
  const t = Math.max(0.7, rTop * 0.085)
  let y0 = 0
  if (saucer) {
    const rs = rBot + 2.4
    g.add(cup(rs, rs - 0.9, 2.4, 0.8, shade(color, -0.04)))
    y0 = 0.8
  }
  const hb = Math.max(2, h * 0.2)
  const r1 = rTop - 0.7
  g.add(cup(r1, rBot, h - hb + 0.6, t, color, { y: y0 }))
  const rIn = r1 - t
  g.add(band(rTop - 0.1, rTop, rIn - 0.05, rIn + 0.1, hb, color, y0 + h - hb))
  const soil = y0 + h - 1.6
  g.add(soilDisc(rIn - 0.25, soil))
  return { g, soil, r: rIn - 0.25, top: y0 + h }
}

/** 上釉陶盆：鼓肚轮廓 + 口沿下一圈流釉 */
function glazedPot(R: number, h: number, color: string, accent: string, seed = 1): Pot {
  const t = 0.8
  const prof: [number, number][] = [[R * 0.6, 0], [R * 0.8, h * 0.16], [R * 0.97, h * 0.42], [R, h * 0.62], [R * 0.93, h * 0.86], [R * 0.9, h - t / 2]]
  const g = G(hollow(prof, t, color))
  const yr = h - 1.5
  g.add(torus(rAt(prof, yr) + 0.02, 0.42, accent, { y: yr, rx: PI / 2 }))
  const rand = rng(seed)
  const n = Math.round(R * 0.9)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand() * 0.3
    const len = 1.4 + rand() * 1.6
    const y = yr - len / 2
    const r = rAt(prof, y) - 0.08
    g.add(noOutline(ball(0.6, accent, { x: Math.cos(a) * r, y, z: Math.sin(a) * r, ry: yawTo(a) }, [1, len / 1.2, 0.45])))
  }
  const soil = h - 1.6
  const sr = rAt(prof, soil) - t - 0.3
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: h }
}

/** 水泥圆盆：厚壁直筒 */
function cementRound(R: number, h: number, color: string): Pot {
  const t = 1.6
  const rB = R * 0.93
  const g = G(cup(R, rB, h, t, color))
  const soil = h - 1.8
  const sr = rB + ((R - rB) * soil) / h - t - 0.25
  g.add(soilDisc(sr, soil))
  const rand = rng(Math.round(R * 7))
  for (let i = 0; i < 7; i++) {
    const a = rand() * PI * 2
    const y = 2 + rand() * (h - 5)
    const r = rB + ((R - rB) * y) / h
    g.add(noOutline(ball(0.28, shade(color, -0.18), { x: Math.cos(a) * r, y, z: Math.sin(a) * r }, [1, 1, 1])))
  }
  return { g, soil, r: sr, top: h }
}

/** 水泥方盆 */
function cementSquare(W: number, h: number, color: string): Pot {
  const t = 1.8
  const g = G(tray(W, h, W, t, color, {}, 0.6))
  const soil = h - 1.8
  g.add(rbox(W - t * 2 - 0.3, 0.8, W - t * 2 - 0.3, SOIL, { y: soil - 0.8 }, 0.2))
  return { g, soil, r: W / 2 - t - 0.2, top: h }
}

/** 北欧白瓷盆：直筒 + 木托盘；stand = 带木质四脚架（落地） */
function ceramicPot(R: number, h: number, color: string, wood: string, stand = false): Pot {
  const g = new THREE.Group()
  const t = 0.8
  const rB = R * 0.94
  let y0 = 1.2
  if (!stand) {
    g.add(puck(R + 1.2, 1.2, wood))
  } else {
    y0 = 14
    const yr = y0 + 9
    g.add(torus(R + 1.4, 0.8, wood, { y: yr, rx: PI / 2 }))
    const legR = (y: number) => R + 6 + ((R + 1.9 - (R + 6)) * y) / (yr + 2)
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + (k * PI) / 2
      g.add(rod3([Math.cos(a) * legR(yr + 2), yr + 2, Math.sin(a) * legR(yr + 2)], [Math.cos(a) * legR(0), 0.35, Math.sin(a) * legR(0)], 1.1, wood))
    }
    const half = legR(y0 - 0.7) - 0.4
    for (let k = 0; k < 2; k++) g.add(rbox(half * 2, 1.4, 2.4, shade(wood, -0.06), { y: y0 - 1.4, ry: PI / 4 + (k * PI) / 2 }, 0.4))
  }
  g.add(cup(R, rB, h, t, color, { y: y0 }))
  const soil = y0 + h - 1.6
  const sr = rB + ((R - rB) * (h - 1.6)) / h - t - 0.25
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: y0 + h }
}

/** 藤编套盆：编织纹 + 粗口沿，里面塞着黑色塑料育苗盆 */
function rattanPot(R: number, h: number, color: string): Pot {
  const rB = R * 0.82
  const g = G(cup(R, rB, h, 0.7, color))
  const out = (y: number) => rB + ((R - rB) * y) / h
  for (let y = 1.6; y < h - 1; y += 1.8) g.add(torus(out(y) + 0.05, 0.3, shade(color, -0.08), { y, rx: PI / 2 }))
  g.add(torus(R - 0.3, 0.55, shade(color, -0.14), { y: h, rx: PI / 2 }))
  const ri = R - 1.6
  const ih = h - 1.6
  g.add(cup(ri, ri * 0.8, ih, 0.5, PLASTIC_BLACK, { y: 0.7 }))
  const soil = 0.7 + ih - 1.5
  const sr = ri * 0.8 + (ri * 0.2 * (ih - 1.5)) / ih - 0.5 - 0.25
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: h + 0.55 }
}

/** 木制小花箱：四角立柱 + 横板，缝里看得到黑色内衬 */
function woodBox(W: number, D: number, H: number, color: string): Pot {
  const g = new THREE.Group()
  const ps = 2.4
  const st = 1.4
  const n = 3
  const gap = 0.5
  const sh = (H - 1 - gap * (n - 1)) / n
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(ps, H, ps, shade(color, -0.07), { x: sx * (W / 2 - ps / 2), z: sz * (D / 2 - ps / 2) }, 0.3))
  for (let i = 0; i < n; i++) {
    const y = 1 + i * (sh + gap)
    for (const s of [-1, 1]) {
      g.add(rbox(W - ps * 2, sh, st, color, { y, z: s * (D / 2 - st / 2) }, 0.3))
      g.add(rbox(st, sh, D - ps * 2, color, { x: s * (W / 2 - st / 2), y }, 0.3))
    }
  }
  g.add(tray(W - st * 2 - 0.3, H - 2.2, D - st * 2 - 0.3, 0.4, '#3a332c', { y: 1.2 }, 0.15))
  const soil = H - 1.6
  g.add(rbox(W - st * 2 - 1.3, 0.8, D - st * 2 - 1.3, SOIL, { y: soil - 0.8 }, 0.2))
  return { g, soil, r: Math.min(W, D) / 2 - st - 0.7, top: H }
}

/** 珐琅铁盆：卷边口沿 + 两侧小耳 */
function enamelPot(R: number, h: number, body: string, rim: string): Pot {
  const rB = R * 0.88
  const g = G(cup(R, rB, h, 0.6, body))
  g.add(torus(R - 0.1, 0.5, rim, { y: h - 0.25, rx: PI / 2 }))
  g.add(torus(rB + 0.02, 0.32, rim, { y: 0.45, rx: PI / 2 }))
  const yh = h * 0.7
  const rh = rB + ((R - rB) * yh) / h
  for (const s of [-1, 1]) g.add(torus(1.5, 0.3, rim, { x: s * rh, y: yh, rz: s > 0 ? -PI / 2 : PI / 2 }, PI))
  const soil = h - 1.6
  const sr = rB + ((R - rB) * soil) / h - 0.6 - 0.25
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: h + 0.25 }
}

/** 和风盆栽盆：浅长方形 + 四只小脚 */
function bonsaiTray(W: number, D: number, H: number, color: string): Pot {
  const g = new THREE.Group()
  g.add(tray(W, H - 0.8, D, 0.9, color, { y: 0.8 }, 0.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.8, 0.8, 2, shade(color, -0.05), { x: sx * (W / 2 - 3), z: sz * (D / 2 - 2.5) }, 0.3))
  const soil = H - 1.4
  g.add(rbox(W - 2.1, 0.8, D - 2.1, SOIL, { y: soil - 0.8 }, 0.2))
  return { g, soil, r: Math.min(W, D) / 2 - 1.2, top: H }
}

/** 碗形吊盆盆身（外轮廓） */
const bowlProf = (R: number, H: number, t: number): [number, number][] => [[R * 0.45, 0], [R * 0.75, H * 0.22], [R * 0.95, H * 0.55], [R, H - t / 2]]
function bowlPot(R: number, H: number, color: string): Pot {
  const t = 0.7
  const prof = bowlProf(R, H, t)
  const g = G(hollow(prof, t, color))
  const soil = H - 1.5
  const sr = rAt(prof, soil) - t - 0.25
  g.add(soilDisc(sr, soil))
  return { g, soil, r: sr, top: H }
}

/**
 * 吊绳 + J 钩：盆（已放好，中心 (0, ·, pc)，盆底 yb、口沿 yt、盆半径 R）由三根绳兜住，
 * 绳在盆底下打结并垂下流苏，上端汇到钩环。
 */
function hangRig(g: THREE.Group, pc: number, yb: number, yt: number, prof: [number, number][], rope: string) {
  const zc = pc + 0.7
  g.add(rod3([0, -2, -1], [0, -2, zc], 0.3, STEEL, 8))
  g.add(rod3([0, -2, zc], [0, -0.3, zc + 0.6], 0.3, STEEL, 8))
  g.add(torus(1.4, 0.3, STEEL, { y: -3.4, z: pc }))
  g.add(ball(0.9, rope, { y: -5.6, z: pc }))
  const H = yt - yb
  for (let k = 0; k < 3; k++) {
    const a = (k * PI * 2) / 3 + PI / 2
    const P = (r: number, y: number): V3 => [Math.cos(a) * r, y, pc + Math.sin(a) * r]
    const rim = rAt(prof, H) + 0.3
    g.add(noOutline(rod3([0, -5.8, pc], P(rim, yt + 0.4), 0.2, rope, 5)))
    g.add(noOutline(tube([P(rim, yt + 0.4), P(rAt(prof, H * 0.6) + 0.35, yb + H * 0.6), P(rAt(prof, H * 0.2) + 0.35, yb + H * 0.2), [0, yb - 1.2, pc]], 0.2, rope, 16, 5)))
  }
  g.add(ball(0.9, rope, { y: yb - 1.5, z: pc }))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(noOutline(rod3([0, yb - 2, pc], [Math.cos(a) * 1.2, yb - 9, pc + Math.sin(a) * 1.2], 0.18, rope, 4)))
  }
}

// ---------- 花盆 build ----------

const terraBuild = (r: number, h: number): Build => (p) => terraPot(r, h, p[0]).g
const glazedBuild = (r: number, h: number): Build => (p) => glazedPot(r, h, p[0], p[1], Math.round(r)).g
const cementBuild = (kind: 'round' | 'square', s: number, h: number): Build => (p) => (kind === 'round' ? cementRound(s, h, p[0]) : cementSquare(s, h, p[0])).g
const ceramicBuild = (r: number, h: number, stand = false): Build => (p) => ceramicPot(r, h, p[0], p[1], stand).g
const rattanBuild = (r: number, h: number): Build => (p) => rattanPot(r, h, p[0]).g
const woodBoxBuild = (w: number, d: number, h: number): Build => (p) => woodBox(w, d, h, p[0]).g
const enamelBuild = (r: number, h: number): Build => (p) => enamelPot(r, h, p[0], p[1]).g
const bonsaiTrayBuild = (w: number, d: number, h: number): Build => (p) => {
  const P = bonsaiTray(w, d, h, p[0])
  scatter(P.g, Math.min(w, d) / 2 - 1.2, P.soil, Math.round(w / 3), '#d9d4c7', Math.round(w), 0.45)
  return P.g
}

const HANG_R = 8
const HANG_H = 10
/** 吊盆（空盆）：挂起 */
function hangingPotHang(p: string[], plant?: (P: Pot) => void, pc = HANG_R + 1.2, drop = 28) {
  const [pot, rope] = p
  const g = new THREE.Group()
  const yt = -5.8 - drop
  const yb = yt - HANG_H
  const P = bowlPot(HANG_R, HANG_H, pot)
  plant?.(P)
  P.g.position.set(0, yb, pc)
  g.add(P.g)
  hangRig(g, pc, yb, yt, bowlProf(HANG_R, HANG_H, 0.7), rope)
  return g
}
/** 吊盆（空盆）：放在台面上，吊绳松垮地搭在前面 */
function hangingPotStand(p: string[]) {
  const [pot, rope] = p
  const P = bowlPot(HANG_R, HANG_H, pot)
  const g = P.g
  const prof = bowlProf(HANG_R, HANG_H, 0.7)
  const rim = HANG_R + 0.3
  const knot: V3 = [0, HANG_H + 5, 2]
  for (let k = 0; k < 3; k++) {
    const a = (k * PI * 2) / 3 + PI / 2
    const P2 = (r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r]
    g.add(noOutline(tube([P2(rim, HANG_H + 0.4), [Math.cos(a) * 4, HANG_H + 4, 2 + Math.sin(a) * 3], knot], 0.2, rope, 12, 5)))
    g.add(noOutline(tube([P2(rim, HANG_H + 0.4), P2(rAt(prof, 6) + 0.35, 6), P2(rAt(prof, 2) + 0.35, 2), P2(HANG_R * 0.45, 0.2)], 0.2, rope, 12, 5)))
  }
  g.add(ball(0.9, rope, { x: knot[0], y: knot[1], z: knot[2] }))
  g.add(noOutline(tube([knot, [0, HANG_H + 3, HANG_R + 1], [0, HANG_H * 0.5, HANG_R + 2.2], [0, 0.4, HANG_R + 3.4]], 0.2, rope, 12, 5)))
  g.add(torus(1.4, 0.3, STEEL, { y: 0.3, z: HANG_R + 4.8, rx: PI / 2 }))
  return g
}

const WALL_MOUNT = 120
/** 壁挂半圆花盆：背板贴墙 */
function wallPot(p: string[]) {
  const [pot, plate] = p
  const g = new THREE.Group()
  const R = 8
  const H = 14
  const t = 0.7
  const zc = 0.2
  g.add(rbox(18, H + 7, 1.2, plate, { y: 0, z: -0.6 + 0.0 }, 0.5))
  for (const x of [-5, 5]) g.add(cyl(0.6, 0.6, 0.6, STEEL, { x, y: H + 3.5 - 0.3, z: 0.2, rx: PI / 2 }, 10))
  const prof: [number, number][] = [[R * 0.78, 0], [R, H - t / 2]]
  const half = hollow(prof, t, pot, 24, [-PI / 2, PI])
  half.position.set(0, 0.5, zc - 0.4)
  g.add(half)
  const soil = 0.5 + H - 1.6
  const sr = rAt(prof, H - 1.6) - t - 0.25
  const sg = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr - 0.05, 0.8, 16, 1, false, -PI / 2, PI), toon(SOIL))
  sg.position.set(0, soil - 0.4, zc - 0.4)
  g.add(sg)
  return g
}

/** 自吸水花盆：下层透明水箱看得到水位和吸水绳，侧面水位计 + 注水口 */
function selfWater(p: string[]) {
  const [pot, ind] = p
  const g = new THREE.Group()
  g.add(clearMat(cup(9.2, 8.8, 8, 0.4, GLASS), GLASS, 0.3))
  g.add(band(8.85, 9.0, 8.3, 8.4, 1.0, pot, 0))
  g.add(clearMat(cyl(8.3, 8.2, 4.2, WATER, { y: 0.4 }), WATER, 0.55))
  g.add(cup(10.4, 9.4, 13, 0.8, pot, { y: 8 }))
  g.add(noOutline(tube([[0, 8.2, 0], [0.8, 5.5, 0.6], [-0.6, 3, -0.4], [1.5, 1, 1.2]], 0.35, '#efe3c8')))
  const ix = -6.4
  const iz = 4.2
  g.add(clearMat(cyl(0.7, 0.7, 23, GLASS, { x: ix, y: 0.6, z: iz }, 12), GLASS, 0.45))
  g.add(cyl(0.5, 0.5, 1.2, ind, { x: ix, y: 3.6, z: iz }, 10))
  g.add(cyl(1.0, 1.0, 1.0, ind, { x: ix, y: 23.4, z: iz }, 12))
  g.add(rod3([0, 5.2, 8.4], [0, 6.8, 10.9], 1.0, pot, 12))
  g.add(taperRod3([0, 6.8, 10.9], [0, 7.3, 11.6], 1.25, 1.25, ind, 12))
  const soil = 8 + 13 - 1.6
  const sr = 9.4 + (1.0 * (13 - 1.6)) / 13 - 0.8 - 0.25
  g.add(soilDisc(sr, soil))
  return g
}

/** 育苗托盘：cols × rows 格，大约一半格子冒出了小苗 */
function seedTray(cols: number, rows: number, pitch: number): Build {
  return (p) => {
    const [c] = p
    const g = new THREE.Group()
    const W = cols * pitch + 2
    const D = rows * pitch + 2
    const H = 6
    g.add(tray(W, H, D, 0.6, c, {}, 0.25))
    const pw = W - 1.2
    const pd = D - 1.2
    const hs = pitch - 1
    const holes: { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }[] = []
    const cells: [number, number][] = []
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const cx = (i - (cols - 1) / 2) * pitch
        const cz = (j - (rows - 1) / 2) * pitch
        cells.push([cx, cz])
        holes.push({ kind: 'rect', x: cx, y: pd / 2 - cz - hs / 2, w: hs, h: hs, r: 0.6 })
      }
    const pt = 0.5
    g.add(holePanel(pw, pd, pt, shade(c, 0.05), holes, { y: H - 0.3 - pt / 2, z: pd / 2, rx: -PI / 2 }, 0.5))
    const soilTop = H - 0.3 - pt - 0.1
    const rand = rng(cols * 31 + rows)
    for (const [cx, cz] of cells) {
      const rt = (hs - 0.1) / Math.SQRT2
      g.add(cyl(rt, rt * 0.75, soilTop - 0.6, SOIL, { x: cx, y: 0.6, z: cz, ry: PI / 4 }, 4))
      if (rand() < 0.62) {
        const sh = 1.4 + rand() * 2.4
        const top: V3 = [cx + (rand() - 0.5) * 0.6, soilTop + sh, cz + (rand() - 0.5) * 0.6]
        g.add(noOutline(rod3([cx, soilTop - 0.2, cz], top, 0.12, '#9ccf6a', 4)))
        const yaw = rand() * PI
        for (const s of [0, PI]) g.add(sprig(1.4 + sh * 0.15, '#8fd16a', top, yaw + s, -0.15, 0.6))
        if (sh > 3) g.add(sprig(1.5, LEAF, top, yaw + PI / 2, -0.8, 0.55))
      }
    }
    // 一根标签插在角上的格子里
    const [lx, lz] = cells[0]
    g.add(rbox(1.2, 7, 0.2, '#f6f0e1', { x: lx, y: soilTop - 1, z: lz, rz: 0.08 }, 0.1))
    g.add(rbox(0.8, 0.25, 0.35, '#5a4646', { x: lx + 0.4, y: soilTop + 4.8, z: lz, rz: 0.08 }, 0.05))
    return g
  }
}

/** 玻璃微景观：软木塞罐 / 开口玻璃球。里面一层小石子、土、苔藓、一株小蕨 */
function terrarium(kind: 'jar' | 'globe'): Build {
  return (p) => {
    const [lid] = p
    const g = new THREE.Group()
    let prof: [number, number][]
    const t = 0.35
    if (kind === 'jar') {
      prof = [[7.3, 0], [7.5, 1], [7.5, 15], [6.6, 16.5], [6.4, 17 - t / 2]]
    } else {
      const R = 9.5
      prof = []
      for (let i = 0; i <= 12; i++) {
        const a = -1.35 + (i / 12) * (1.35 + 0.98)
        prof.push([R * Math.cos(a), R + R * Math.sin(a) - R * (1 + Math.sin(-1.35))])
      }
      prof[0][1] = 0
    }
    g.add(clearMat(hollow(prof, t, GLASS), GLASS, 0.28))
    const ri = (y: number) => rAt(prof, y) - t - 0.2
    // 底座 / 软木塞
    if (kind === 'jar') {
      g.add(cyl(6.0, 6.0, 1.6, lid, { y: 15.6 }, 20))
      g.add(cyl(6.9, 6.9, 1.6, lid, { y: 17.1 }, 20))
    } else {
      g.add(band(rAt(prof, 0.01) + 1.4, rAt(prof, 1.2) + 0.15, rAt(prof, 0.01) - 0.5, rAt(prof, 1.2) - 0.3, 1.2, lid, 0))
    }
    // 分层
    const y1 = kind === 'jar' ? 0.4 : 0.9
    const y2 = y1 + 1.8
    const y3 = y2 + 2.6
    g.add(cyl(ri(y2), ri(y1), y2 - y1, '#d6cfc2', { y: y1 }))
    g.add(cyl(ri(y3), ri(y2), y3 - y2, SOIL, { y: y2 }))
    scatter(g, ri(y2) + 0.2, y2 - 0.5, 10, '#efe9df', 3, 0.5)
    const rand = rng(kind === 'jar' ? 5 : 9)
    const rm = ri(y3)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + rand()
      const d = rm * (0.35 + rand() * 0.4)
      g.add(ball(1.6 + rand() * 0.8, i % 2 ? MOSS : '#6c9a42', { x: Math.cos(a) * d, y: y3, z: Math.sin(a) * d }, [1, 0.45, 1]))
    }
    g.add(ball(1.5, '#9a958c', { x: rm * 0.45, y: y3 + 0.3, z: -rm * 0.2 }, [1.2, 0.7, 0.9]))
    for (let k = 0; k < 6; k++) g.add(sprig(5 + rand() * 1.5, k % 2 ? '#7cc46a' : '#5fae5a', [-1, y3, 0.5], (k / 6) * PI * 2, -0.9 + rand() * 0.3, 0.32))
    return g
  }
}

// ======================================================================
// 盆栽植物
// ======================================================================

const POTHOS = ['#5fae4f', '#86c35a', '#d3e58a']

/** 绿萝 / 常春藤的一根垂蔓：从土里长出、翻过盆沿、沿盆外侧垂下 */
function trail(g: THREE.Group, cx: number, cz: number, a: number, rIn: number, rimR: number, soilY: number, rimY: number, endY: number, rand: () => number, leafLen = 4.2) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const P = (r: number, y: number): V3 => [cx + c * r, y, cz + s * r]
  const pts = [P(rIn - 1.5, soilY + 0.2), P(rimR + 0.1, rimY + 1.2), P(rimR + 1.3, rimY - 1), P(rimR + 1.9, (rimY + endY) / 2), P(rimR + 1.7 + rand(), endY)]
  g.add(noOutline(tube(pts, 0.22, STEM, 28, 5)))
  const curve = curveOf(pts)
  const n = Math.max(3, Math.floor((rimY - endY + 6) / 3.2))
  for (let k = 1; k <= n; k++) {
    const p = curve.getPoint(k / (n + 0.4))
    const side = k % 2 ? 1 : -1
    g.add(sprig(leafLen * (0.85 + rand() * 0.3), POTHOS[(k + Math.floor(rand() * 3)) % 3], [p.x, p.y, p.z], yawTo(a + side * 0.75), 0.35, 0.72))
  }
}

/** 土面上的一丛心形叶 */
function heartTuft(g: THREE.Group, soilY: number, r: number, n: number, seed: number, cx = 0, cz = 0) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand() * 0.4
    const rr = rand() * r * 0.45
    const base: V3 = [cx + Math.cos(a) * rr, soilY - 0.2, cz + Math.sin(a) * rr]
    const pitch = -1.0 + rand() * 0.5
    const tip = along(base, dirOf(yawTo(a), pitch), 3 + rand() * 2.5)
    g.add(noOutline(rod3(base, tip, 0.18, STEM, 5)))
    g.add(sprig(5.2 + rand() * 1.5, POTHOS[i % 3], tip, yawTo(a), pitch + 0.75, 0.72))
  }
}

/** 绿萝（立放）：适合放在高处层板，藤蔓翻过盆沿垂到台面 */
function pothosStand(p: string[]) {
  const P = ceramicPot(7, 12, p[0], shade(p[0], -0.08))
  const g = P.g
  heartTuft(g, P.soil, P.r, 10, 11)
  const rand = rng(12)
  for (const a of [0.2, 1.4, 2.5, 3.6, 5.0]) trail(g, 0, 0, a, P.r, 7.1, P.soil, P.top, 2.4 + rand() * 2, rand)
  return g
}
/** 绿萝（挂起）：吊盆，长藤垂下 */
function pothosHang(p: string[]) {
  const pc = HANG_R + 6.2
  return hangingPotHang(
    p,
    (P) => {
      heartTuft(P.g, P.soil, P.r, 9, 21)
      const rand = rng(22)
      for (const [a, len] of [[0.3, 46], [1.2, 62], [2.2, 38], [3.1, 54], [4.1, 70], [5.2, 44]] as [number, number][]) trail(P.g, 0, 0, a, P.r, HANG_R + 0.3, P.soil, P.top, -len, rand)
    },
    pc,
    24,
  )
}

/** 常春藤：盆里插一个铁丝圆环，藤蔓沿环缠绕 */
function ivyLeaf(g: THREE.Group, at: V3, s: number, color: string, side: number, rz: number) {
  const lg = new THREE.Group()
  lg.add(ball(1.3 * s, color, {}, [1, 1.05, 0.22]))
  for (const k of [-1, 1]) lg.add(ball(0.95 * s, color, { x: k * 1.05 * s, y: -0.35 * s }, [1, 0.95, 0.22]))
  lg.position.set(at[0], at[1], at[2] + side * 0.75)
  lg.rotation.set(side * 0.25, 0, rz)
  g.add(lg)
}
function ivyHoop(p: string[]) {
  const P = terraPot(7, 12, p[0])
  const g = P.g
  const wire = '#6b6f5a'
  const y = P.soil
  const R = 10
  const yc = y + 15
  const lx = 4.5
  const ly = yc - Math.sqrt(R * R - lx * lx)
  const a0 = Math.atan2(ly - yc, lx)
  for (const s of [-1, 1]) g.add(rod3([s * lx, y - 3, 0], [s * lx, ly, 0], 0.22, wire, 6))
  g.add(torus(R, 0.22, wire, { y: yc, rz: a0 }, PI - 2 * a0))
  const rand = rng(31)
  const cols = ['#3f8a4a', '#5aa865', '#4f9a52']
  for (const s of [1, -1]) {
    const pts: V3[] = [[s * lx, y, 0.3], [s * lx, (y + ly) / 2, -0.5]]
    const th0 = s > 0 ? a0 : PI - a0
    const th1 = s > 0 ? PI / 2 + 0.5 : PI / 2 - 0.3
    for (let k = 0; k <= 8; k++) {
      const th = th0 + ((th1 - th0) * k) / 8
      pts.push([Math.cos(th) * R, yc + Math.sin(th) * R, 0.6 * Math.sin(k * 1.4 + s)])
    }
    g.add(noOutline(tube(pts, 0.2, '#6f8a4a', 40, 5)))
    const curve = curveOf(pts)
    for (let k = 1; k <= 11; k++) {
      const q = curve.getPoint(k / 11.5)
      ivyLeaf(g, [q.x, q.y, q.z], 0.9 + rand() * 0.35, cols[k % 3], k % 2 ? 1 : -1, rand() * 1.2 - 0.6 + (q.x > 0 ? -0.4 : 0.4))
    }
  }
  // 盆沿垂下的几片
  for (const a of [0.6, 2.4, 4.3]) {
    const b: V3 = [Math.cos(a) * 4, y, Math.sin(a) * 4]
    const e: V3 = [Math.cos(a) * 8.4, y - 3, Math.sin(a) * 8.4]
    g.add(noOutline(tube([b, [Math.cos(a) * 7, y + 1.8, Math.sin(a) * 7], e], 0.2, '#6f8a4a', 10, 5)))
    g.add(sprig(3.6, cols[0], e, yawTo(a), 0.5, 0.8))
    g.add(sprig(3.2, cols[1], [Math.cos(a) * 7, y + 1.6, Math.sin(a) * 7], yawTo(a + 0.6), 0.1, 0.8))
  }
  return g
}

/** 龟背竹幼苗 */
function monsteraKid(p: string[]) {
  const P = cementRound(8, 14, p[0])
  const g = P.g
  const rand = rng(5)
  const y = P.soil
  const n = 5
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand() * 0.5
    const L = 11 + rand() * 6
    const tilt = 0.3 + rand() * 0.25
    const base: V3 = [0, y - 0.3, 0]
    const tip = along(base, dirOf(yawTo(a), -(PI / 2 - tilt)), L)
    g.add(noOutline(rod3(base, tip, 0.45, LEAF_D, 6)))
    const lr = 5 + rand() * 1.2
    const lf = ball(lr, i % 2 ? LEAF : shade(LEAF, -0.06), {}, [0.85, 0.16, 1])
    lf.rotation.set(0.45, yawTo(a), 0, 'YXZ')
    lf.position.set(...along(tip, dirOf(yawTo(a), 0.45), lr * 0.85))
    g.add(lf)
    // 叶缘的两道裂口（深色小椭圆贴在叶面上）
    for (const s of [-1, 1]) {
      const q = along(tip, dirOf(yawTo(a), 0.45), lr * 1.0)
      const side = yawTo(a) + PI / 2
      const slit = ball(0.9, shade(LEAF, -0.25), {}, [0.25, 0.25, 1])
      slit.rotation.set(0.45, yawTo(a) + s * 0.6, 0, 'YXZ')
      slit.position.set(q[0] + Math.sin(side) * s * lr * 0.5, q[1] - 0.2 + 0.55, q[2] + Math.cos(side) * s * lr * 0.5)
      g.add(noOutline(slit))
    }
  }
  g.add(capsule(0.7, 6, '#a6d97a', { y: y - 0.5, rz: 0.12 }))
  return g
}

/** 橡皮树（落地）：直立主干，深绿厚叶交互生长，顶端红色托叶鞘 */
function rubberTree(p: string[]) {
  const P = glazedPot(13, 26, p[0], p[1] ?? shade(p[0], -0.15), 4)
  const g = P.g
  const y = P.soil
  const top = y + 64
  g.add(taperRod3([0, y - 1, 0], [0.6, top, 0.3], 1.3, 0.7, '#7d6a4a'))
  const rand = rng(7)
  let k = 0
  for (let h = y + 12; h < top - 3; h += 4, k++) {
    const a = k * 2.4 + rand() * 0.3
    const f = (h - y) / (top - y)
    const base: V3 = [0.6 * f, h, 0.3 * f]
    const tip = along(base, dirOf(yawTo(a), -0.7), 2.2)
    g.add(noOutline(rod3(base, tip, 0.25, '#6b7d45', 5)))
    const len = 12.5 + rand() * 2.5 - f * 3
    g.add(sprig(len, k % 2 ? '#2f6b3a' : '#3a7d44', tip, yawTo(a), -0.55 + rand() * 0.4, 0.58, 0.14))
  }
  g.add(taperRod3([0.6, top, 0.3], [0.7, top + 4, 0.3], 0.55, 0.15, '#c0504d', 8))
  for (const a of [0.8, 3.8]) g.add(sprig(7, '#4c9150', [0.6, top - 0.5, 0.3], yawTo(a), -1.2, 0.42, 0.14))
  return g
}

/** 鸟巢蕨：中心一团褐色绒毛，长长的亮绿叶片放射状斜向上 */
function birdNest(p: string[]) {
  const P = glazedPot(9, 15, p[0], p[1] ?? shade(p[0], -0.15), 9)
  const g = P.g
  const y = P.soil
  g.add(ball(2.2, '#7a5a3c', { y: y + 0.4 }, [1, 0.6, 1]))
  const rand = rng(13)
  const n = 14
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996
    const inner = i < 5
    const len = inner ? 12 + rand() * 4 : 18 + rand() * 4
    const pitch = inner ? -1.2 + rand() * 0.15 : -0.95 + rand() * 0.3
    g.add(sprig(len, i % 3 ? '#86c95a' : '#6db552', [Math.cos(a) * 0.8, y + 0.5, Math.sin(a) * 0.8], yawTo(a), pitch, 0.3, 0.1))
  }
  return g
}

/** 蝴蝶兰：树皮基质、宽厚叶、花茎沿支架上升后向前弯，挂一串花 */
function orchidFlower(g: THREE.Group, at: V3, s: number, petal: string, lip: string) {
  const fg = new THREE.Group()
  for (const k of [-1, 1]) fg.add(ball(1.55 * s, petal, { x: k * 1.35 * s, y: 0.1 * s }, [1, 1.05, 0.22]))
  fg.add(ball(1.0 * s, petal, { y: 1.5 * s, z: -0.1 }, [0.85, 1.1, 0.22]))
  for (const k of [-1, 1]) fg.add(ball(0.9 * s, petal, { x: k * 0.8 * s, y: -1.3 * s, z: -0.1 }, [0.75, 1.1, 0.22]))
  fg.add(ball(0.75 * s, lip, { y: -0.35 * s, z: 0.35 * s }, [1, 0.9, 0.7]))
  fg.add(noOutline(ball(0.35 * s, C.lemon, { y: 0.25 * s, z: 0.45 * s })))
  fg.position.set(...at)
  fg.rotation.x = 0.25
  g.add(fg)
}
function orchid(p: string[]) {
  const [potC, petal, lip] = p
  const P = ceramicPot(6.5, 12, potC, shade(potC, -0.1))
  const g = P.g
  const y = P.soil
  scatter(g, P.r, y - 0.1, 16, BARK, 41, 0.75)
  for (const [yaw, len, pitch] of [[PI / 2, 11, -0.1], [-PI / 2, 10.5, -0.05], [PI / 2 + 0.25, 8, -0.35], [-PI / 2 + 0.3, 7.5, -0.4]] as [number, number, number][])
    g.add(sprig(len, '#3f8a4a', [0, y + 0.8, 0], yaw, pitch, 0.42, 0.16))
  for (const a of [0.9, 2.6]) g.add(noOutline(tube([[Math.cos(a), y + 0.6, Math.sin(a)], [Math.cos(a) * 5, y + 1.6, Math.sin(a) * 5], [Math.cos(a) * 6.9, y - 0.6, Math.sin(a) * 6.9], [Math.cos(a) * 7.3, y - 3.6, Math.sin(a) * 7.3]], 0.35, '#c9d6b8', 12, 6)))
  // 支架 + 夹子
  g.add(rod3([-0.8, y - 4, -1.2], [-0.8, y + 34, -1.2], 0.28, BAMBOO, 6))
  const spike: V3[] = [[0.2, y + 0.8, -0.4], [-0.4, y + 14, -0.9], [-0.5, y + 27, -0.9], [-0.3, y + 32.5, 1.2], [0, y + 33, 6], [0.3, y + 30.5, 10.5], [0.5, y + 26.5, 13.5]]
  g.add(noOutline(tube(spike, 0.28, '#5d7a3a', 30, 5)))
  for (const yy of [y + 12, y + 24]) g.add(rbox(1.0, 1.0, 1.4, C.lemon, { x: -0.6, y: yy, z: -1.0 }, 0.3))
  const curve = curveOf(spike)
  for (let k = 0; k < 5; k++) {
    const q = curve.getPoint(0.6 + k * 0.085)
    orchidFlower(g, [q.x, q.y - 2.2, q.z + 0.8], 1.35 - k * 0.08, petal, lip)
  }
  const bud = curve.getPoint(1)
  g.add(ball(0.75, petal, { x: bud.x, y: bud.y - 0.6, z: bud.z + 0.3 }))
  return g
}

/** 多肉莲座 */
function rosette(g: THREE.Group, x: number, z: number, y: number, s: number, a: string, b: string) {
  const rings: [number, number, number][] = [[9, -0.25, 1], [7, -0.6, 0.82], [5, -1.0, 0.62]]
  rings.forEach(([n, pitch, sc], j) => {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * PI * 2 + j * 0.45
      g.add(sprig(3.2 * s * sc, j % 2 ? a : b, [x, y + j * 0.35 * s, z], yawTo(ang), pitch, 0.55, 0.32))
    }
  })
  g.add(ball(0.5 * s, b, { x, y: y + 1.1 * s, z }))
}
function succulentBowl(p: string[]) {
  const [bowl] = p
  const g = new THREE.Group()
  g.add(cup(12.5, 8, 7, 0.9, bowl))
  const y = 5.4
  const sr = 8 + (4.5 * y) / 7 - 0.9 - 0.3
  g.add(soilDisc(sr, y))
  scatter(g, sr, y, 22, '#f2eee6', 51, 0.6)
  rosette(g, -4, 2.5, y, 1.25, '#9cc5b0', '#b9d9c5')
  rosette(g, 4.6, -2.6, y, 1.0, '#d9b8c8', '#c7a3bb')
  rosette(g, 1.0, 5.6, y, 0.75, '#8fc27a', '#e6a5b8')
  // 十二卷：尖叶直立
  for (let k = 0; k < 10; k++) g.add(sprig(3.6, k % 2 ? '#3f7f55' : '#4f8f62', [4.8, y, 4.2], yawTo((k / 10) * PI * 2), -1.15 + (k % 3) * 0.12, 0.3, 0.3))
  // 虹之玉：一簇豆豆
  const rand = rng(53)
  for (let k = 0; k < 14; k++) {
    const a = rand() * PI * 2
    const d = rand() * 2
    const ht = rand() * 1.6
    g.add(capsule(0.45, 0.6, k % 3 ? '#8fcf6a' : '#d96f6a', { x: -4.8 + Math.cos(a) * d, y: y + ht * 0.6, z: -3.6 + Math.sin(a) * d, rz: (rand() - 0.5) * 0.6 }))
  }
  // 玉树小苗
  g.add(rod3([0.2, y - 0.2, -6], [0.6, y + 4, -6.2], 0.35, '#8a7a4a', 6))
  for (let k = 0; k < 5; k++) g.add(sprig(2, '#5f9e4a', [0.6, y + 2.4 + k * 0.4, -6.2], (k * PI * 2) / 5, -0.4, 0.65, 0.35))
  return g
}

/** 仙人球组：长方形浅盆里三颗仙人球（其中一颗开花） */
function cactusBall(g: THREE.Group, x: number, z: number, y: number, r: number, color: string, ribs = 10) {
  g.add(ball(r * 0.86, color, { x, y: y + r * 0.72, z }, [1, 0.95, 1]))
  for (let i = 0; i < ribs; i++) {
    const m = ball(r, shade(color, i % 2 ? 0.03 : -0.02), { x, y: y + r * 0.72, z, ry: (i * PI) / ribs }, [0.2, 0.93, 1])
    g.add(m)
  }
  for (let i = 0; i < ribs * 2; i++) {
    const a = (i * PI) / ribs
    const yy = y + r * 0.72 + (i % 2 ? 0.25 : -0.3) * r
    const rr = r * Math.sqrt(1 - ((yy - (y + r * 0.72)) / (r * 0.93)) ** 2) + 0.05
    g.add(noOutline(ball(0.22, '#fffbe8', { x: x + Math.sin(a) * rr, y: yy, z: z + Math.cos(a) * rr })))
  }
}
function cactusGroup(p: string[]) {
  const [potC] = p
  const g = new THREE.Group()
  const W = 26
  const D = 12
  const H = 8
  g.add(tray(W, H, D, 1, potC, {}, 0.4))
  const y = H - 1.4
  g.add(rbox(W - 2.2, 0.8, D - 2.2, SOIL, { y: y - 0.8 }, 0.2))
  cactusBall(g, -7, 0, y - 0.6, 4.4, '#5aa86a')
  cactusBall(g, 1.8, -0.5, y - 0.5, 3.5, '#6bb86a', 12)
  // 小柱状
  g.add(capsule(2.1, 5.5, '#4f9e5b', { x: 8.6, y: y - 1 }))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2
    g.add(capsule(0.5, 5.4, shade('#4f9e5b', 0.04), { x: 8.6 + Math.cos(a) * 1.75, y: y - 0.9, z: Math.sin(a) * 1.75 }))
  }
  // 花
  const fy = y - 0.5 + 3.5 * 0.72 + 3.5 * 0.93
  for (let k = 0; k < 6; k++) g.add(sprig(1.8, C.pink, [1.8, fy, -0.5], (k * PI) / 3, -0.6, 0.6, 0.2))
  g.add(noOutline(ball(0.5, C.lemon, { x: 1.8, y: fy + 0.6, z: -0.5 })))
  for (const [x, z] of [[-11, 3.5], [5.5, 3.6], [11.2, -3.3], [-3, -4]]) g.add(noOutline(ball(0.7, '#e9e3d6', { x, y: y + 0.1, z }, [1, 0.55, 0.9])))
  return g
}

/** 香草：薄荷 / 罗勒 / 迷迭香，素烧盆 + 小标签 */
function herb(kind: 'mint' | 'basil' | 'rosemary'): Build {
  return (p) => {
    const P = terraPot(7, 12, p[0])
    const g = P.g
    const y = P.soil
    const rand = rng(kind === 'mint' ? 61 : kind === 'basil' ? 62 : 63)
    if (kind === 'mint') {
      for (let i = 0; i < 13; i++) {
        const a = rand() * PI * 2
        const d = rand() * 3.5
        const base: V3 = [Math.cos(a) * d, y - 0.2, Math.sin(a) * d]
        const L = 6 + rand() * 4
        const dir = dirOf(yawTo(a), -(PI / 2 - 0.25 - rand() * 0.35))
        const tip = along(base, dir, L)
        g.add(noOutline(rod3(base, tip, 0.17, '#6b8f4a', 5)))
        for (const f of [0.45, 0.72, 1]) {
          const q = along(base, dir, L * f)
          const yaw = yawTo(a) + (f === 0.72 ? 0 : PI / 2)
          for (const s of [0, PI]) g.add(sprig(f === 1 ? 2.2 : 3, i % 2 ? '#6cc06a' : '#58ab5a', q, yaw + s, f === 1 ? -0.7 : -0.1, 0.65))
        }
      }
    } else if (kind === 'basil') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + 0.4
        const base: V3 = [Math.cos(a) * 1.8, y - 0.2, Math.sin(a) * 1.8]
        const L = 11 + rand() * 3
        const dir = dirOf(yawTo(a), -(PI / 2 - 0.18))
        const tip = along(base, dir, L)
        g.add(noOutline(rod3(base, tip, 0.28, '#6f9a4a', 6)))
        ;[0.3, 0.58, 0.82].forEach((f, j) => {
          const q = along(base, dir, L * f)
          const yaw = yawTo(a) + (j % 2 ? 0 : PI / 2)
          for (const s of [0, PI]) g.add(sprig(4.6 - j * 0.6, j % 2 ? '#5cb84f' : '#4aa346', q, yaw + s, 0.15, 0.62, 0.2))
        })
        for (let k = 0; k < 4; k++) g.add(sprig(2.2, '#7cc85e', tip, (k * PI) / 2 + a, -1.0, 0.6, 0.2))
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + rand() * 0.4
        const d = 1 + rand() * 2.4
        const base: V3 = [Math.cos(a) * d, y - 0.2, Math.sin(a) * d]
        const L = 13 + rand() * 6
        const dir = dirOf(yawTo(a), -(PI / 2 - 0.08 - rand() * 0.22))
        g.add(noOutline(rod3(base, along(base, dir, L), 0.22, '#7a7a50', 5)))
        for (let f = 0.25; f < 1.01; f += 0.11) {
          const q = along(base, dir, L * f)
          for (let k = 0; k < 3; k++) g.add(noOutline(sprig(2, k % 2 ? '#5d7d5a' : '#6f8f68', q, (k * PI * 2) / 3 + f * 5, -0.75, 0.2, 0.2)))
        }
        if (i % 3 === 0) g.add(noOutline(ball(0.4, '#a9b8f0', { x: along(base, dir, L)[0], y: along(base, dir, L)[1] + 0.2, z: along(base, dir, L)[2] })))
      }
    }
    // 标签
    const lz = P.r - 1.4
    g.add(rbox(0.6, 8, 0.2, '#e9d2a6', { y: y - 3, z: lz }, 0.1))
    g.add(rbox(3.4, 2.2, 0.25, '#f6f0e1', { y: y + 4, z: lz }, 0.3))
    g.add(rbox(2.4, 0.3, 0.35, kind === 'mint' ? '#58ab5a' : kind === 'basil' ? '#c8473a' : '#6f6fa8', { y: y + 5, z: lz }, 0.05))
    return g
  }
}

/** 小番茄（落地）：大盆 + 三根竹竿搭成的塔架，茎沿竿往上爬，挂着几串红果 */
function tomato(p: string[]) {
  const [potC] = p
  const g = new THREE.Group()
  g.add(cup(15, 12, 28, 1, potC))
  g.add(torus(14.9, 0.7, shade(potC, -0.06), { y: 27.6, rx: PI / 2 }))
  const y = 26.2
  g.add(soilDisc(15 - 1 - 0.5, y))
  const apex: V3 = [0, y + 86, 0]
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    g.add(rod3([Math.cos(a) * 10, y - 6, Math.sin(a) * 10], apex, 0.5, BAMBOO, 6))
  }
  g.add(torus(1.0, 0.35, ROPE, { y: y + 82, rx: PI / 2 }))
  g.add(torus(4.0, 0.25, ROPE, { y: y + 50, rx: PI / 2 }))
  const pts: V3[] = []
  for (let k = 0; k <= 9; k++) {
    const yy = y + k * 9.5
    const r = 3.2 - k * 0.15
    pts.push([Math.cos(k * 1.1) * r, yy, Math.sin(k * 1.1) * r])
  }
  g.add(noOutline(tube(pts, 0.5, '#6f9a4a', 60, 6)))
  const rand = rng(71)
  const fruit = ['#e8463a', '#e8463a', '#ef6a3a', '#f29a3a', '#9ccf5a']
  for (let k = 1; k <= 9; k++) {
    const b = pts[k]
    const a = k * 2.2 + rand() * 0.4
    const L = 6.5
    const dir = dirOf(yawTo(a), -0.15)
    g.add(noOutline(rod3(b, along(b, dir, L), 0.2, '#6f9a4a', 5)))
    for (const f of [0.35, 0.65]) for (const s of [-1, 1]) g.add(sprig(3.2, k % 2 ? '#4f9e5b' : '#5fae5a', along(b, dir, L * f), yawTo(a) + s * 1.1, 0.15, 0.55))
    g.add(sprig(3.4, '#4f9e5b', along(b, dir, L), yawTo(a), 0.1, 0.55))
    if (k === 2 || k === 4 || k === 5 || k === 7) {
      const ta = a + PI * 0.8
      const t0: V3 = [b[0] + Math.cos(ta) * 1.2, b[1] - 0.5, b[2] + Math.sin(ta) * 1.2]
      const t1: V3 = [b[0] + Math.cos(ta) * 4.2, b[1] - 2.5, b[2] + Math.sin(ta) * 4.2]
      g.add(noOutline(rod3(t0, t1, 0.15, '#6f9a4a', 4)))
      for (let j = 0; j < 5; j++) {
        const q: V3 = [t1[0] + Math.cos(ta + j) * 1.3, t1[1] - 1.6 - j * 1.3, t1[2] + Math.sin(ta + j) * 1.3]
        g.add(noOutline(rod3(t1, q, 0.08, '#6f9a4a', 4)))
        g.add(ball(1.25, fruit[(j + k) % fruit.length], { x: q[0], y: q[1] - 1, z: q[2] }))
        g.add(noOutline(ball(0.5, LEAF_D, { x: q[0], y: q[1] + 0.2, z: q[2] }, [1, 0.3, 1])))
      }
    }
    if (k === 6 || k === 8) for (let j = 0; j < 5; j++) g.add(noOutline(sprig(0.9, C.lemon, along(b, dir, 2), (j * PI * 2) / 5, -0.2, 0.6)))
  }
  return g
}

/** 草莓：三出复叶 / 草莓果 */
function strawLeaf(g: THREE.Group, base: V3, yaw: number, pitch: number, len: number, color: string) {
  const tip = along(base, dirOf(yaw, pitch), len)
  g.add(noOutline(rod3(base, tip, 0.14, '#6f9a4a', 4)))
  for (const d of [-0.6, 0, 0.6]) g.add(sprig(2.4, color, tip, yaw + d, pitch + 0.45, 0.75))
}
function berry(g: THREE.Group, top: V3, red = '#e8403a') {
  g.add(cyl(1.0, 0.25, 2.0, red, { x: top[0], y: top[1] - 2, z: top[2] }, 10))
  g.add(noOutline(cyl(0.9, 0.9, 0.25, LEAF_D, { x: top[0], y: top[1] - 0.1, z: top[2] }, 8)))
}
/** 草莓罐：鼓肚陶罐，侧面几个小口袋各种一株，果子从口沿垂下 */
function strawberryJar(p: string[]) {
  const [potC] = p
  const g = new THREE.Group()
  const t = 0.9
  const prof: [number, number][] = [[6.5, 0], [9, 3], [11, 10], [10.6, 17], [8, 22.5], [7.2, 24.6], [7.6, 26 - t / 2]]
  g.add(hollow(prof, t, potC))
  const y = 24.3
  g.add(soilDisc(rAt(prof, y) - t - 0.3, y))
  const rand = rng(81)
  const greens = ['#4f9e5b', '#5fae5a']
  const pockets: [number, number][] = [[0.4, 11.5], [2.0, 17], [3.6, 11.5], [5.2, 17]]
  const th = 0.85
  for (const [a, py] of pockets) {
    const base: V3 = [Math.cos(a) * (rAt(prof, py) - 1.4), py, Math.sin(a) * (rAt(prof, py) - 1.4)]
    g.add(cup(2.7, 2.1, 3.4, 0.5, potC, { x: base[0], y: base[1], z: base[2], rz: -th, ry: -a }))
    const ax: V3 = [Math.cos(a) * Math.sin(th), Math.cos(th), Math.sin(a) * Math.sin(th)]
    const mouth = along(base, ax, 2.6)
    g.add(cyl(1.9, 1.9, 0.6, SOIL, { x: mouth[0], y: mouth[1] - 0.3, z: mouth[2] }, 12))
    for (let k = 0; k < 3; k++) strawLeaf(g, mouth, yawTo(a) + (k - 1) * 0.8, -0.5, 2.2, greens[k % 2])
    const bt: V3 = [mouth[0] + Math.cos(a) * 2.2, mouth[1] - 0.8, mouth[2] + Math.sin(a) * 2.2]
    g.add(noOutline(rod3(mouth, bt, 0.1, '#6f9a4a', 4)))
    berry(g, bt, rand() < 0.3 ? '#f6b26b' : '#e8403a')
  }
  for (let k = 0; k < 7; k++) strawLeaf(g, [0, y - 0.2, 0], (k / 7) * PI * 2 + 0.3, -0.8 + (k % 2) * 0.3, 4 + (k % 3), greens[k % 2])
  for (const a of [0.6, 2.5, 4.4]) {
    const r0 = rAt(prof, 26) + 0.6
    const top: V3 = [Math.cos(a) * r0, 25.2, Math.sin(a) * r0]
    g.add(noOutline(tube([[Math.cos(a) * 3, y + 3, Math.sin(a) * 3], [Math.cos(a) * (r0 - 0.5), 27, Math.sin(a) * (r0 - 0.5)], top], 0.1, '#6f9a4a', 8, 4)))
    berry(g, top)
  }
  for (let j = 0; j < 5; j++) g.add(noOutline(sprig(1.0, C.white, [1.5, y + 5, -1], (j * PI * 2) / 5, -0.3, 0.7)))
  g.add(noOutline(ball(0.35, C.lemon, { x: 1.5, y: y + 5.3, z: -1 })))
  return g
}

/** 矮向日葵 */
function sunflower(p: string[]) {
  const P = terraPot(9.5, 17, p[0])
  const g = P.g
  const y = P.soil
  const top: V3 = [0, y + 40, 1.5]
  g.add(noOutline(tube([[0, y - 0.5, 0], [0.5, y + 15, 0.2], [-0.3, y + 30, 0.6], top], 0.6, '#6a9a3a', 20, 8)))
  const rand = rng(91)
  for (let k = 0; k < 6; k++) {
    const yy = y + 6 + k * 5.6
    const a = k * 2.5
    const base: V3 = [0, yy, 0.3]
    const tip = along(base, dirOf(yawTo(a), -0.4), 2)
    g.add(noOutline(rod3(base, tip, 0.22, '#6a9a3a', 5)))
    g.add(sprig(9 - k * 0.6 + rand(), k % 2 ? '#5aa04a' : '#4f9445', tip, yawTo(a), 0.2, 0.78, 0.14))
  }
  const head = new THREE.Group()
  head.add(cyl(5.3, 5.3, 0.8, '#5f9a3a', { y: -0.4 - 0.5, rx: PI / 2 }, 24))
  head.add(cyl(3.9, 3.9, 1.6, '#6a4528', { y: -0.8 + 0.1, rx: PI / 2 }, 24))
  for (let k = 0; k < 18; k++) {
    const f = (k / 18) * PI * 2
    const r = k % 2 ? 5.3 : 5.0
    head.add(ball(1.9, k % 2 ? '#ffc93c' : '#ffb52e', { x: Math.cos(f) * r, y: Math.sin(f) * r, z: k % 2 ? -0.2 : 0, rz: f }, [1, 0.42, 0.15]))
  }
  head.position.set(top[0], top[1] + 4.2, top[2] + 1.2)
  head.rotation.x = -0.3
  g.add(head)
  return g
}

/** 薰衣草：灰绿细叶堆成一团，紫色花穗高高伸出 */
function lavender(p: string[]) {
  const P = terraPot(9.5, 15, p[0])
  const g = P.g
  const y = P.soil
  const rand = rng(101)
  for (let i = 0; i < 30; i++) {
    const a = rand() * PI * 2
    const d = rand() * 4
    g.add(noOutline(sprig(5 + rand() * 2, i % 2 ? '#8fa88a' : '#7f9a7a', [Math.cos(a) * d, y - 0.2, Math.sin(a) * d], yawTo(a), -1.15 + rand() * 0.5, 0.18, 0.2)))
  }
  for (let i = 0; i < 18; i++) {
    const a = rand() * PI * 2
    const d = rand() * 3
    const base: V3 = [Math.cos(a) * d, y - 0.2, Math.sin(a) * d]
    const dir = dirOf(yawTo(a), -(PI / 2 - 0.1 - rand() * 0.22))
    const L = 18 + rand() * 7
    const tip = along(base, dir, L)
    g.add(noOutline(rod3(base, tip, 0.13, '#8fa88a', 4)))
    g.add(aim(capsAlong([0, 0, 0], [0, 3.6, 0], 0.55, i % 3 ? '#8e6bbf' : '#a585d3'), tip, dir))
  }
  return g
}

/** 玫瑰花朵 */
function bloom(g: THREE.Group, at: V3, s: number, color: string) {
  const [x, y, z] = at
  g.add(noOutline(cyl(0.8 * s, 0.4 * s, 0.8 * s, LEAF_D, { x, y: y - 0.4 * s, z }, 8)))
  g.add(ball(0.95 * s, shade(color, -0.08), { x, y: y + 0.9 * s, z }))
  for (let k = 0; k < 5; k++) {
    const f = (k / 5) * PI * 2
    const m = ball(1.25 * s, color, {}, [1, 0.85, 0.32])
    m.rotation.set(-0.2, yawTo(f), 0, 'YXZ')
    m.position.set(x + Math.cos(f) * 0.85 * s, y + 0.8 * s, z + Math.sin(f) * 0.85 * s)
    g.add(m)
  }
  for (let k = 0; k < 6; k++) {
    const f = (k / 6) * PI * 2 + 0.4
    const m = ball(1.55 * s, shade(color, 0.05), {}, [1, 0.8, 0.3])
    m.rotation.set(-0.6, yawTo(f), 0, 'YXZ')
    m.position.set(x + Math.cos(f) * 1.5 * s, y + 0.45 * s, z + Math.sin(f) * 1.5 * s)
    g.add(m)
  }
}
/** 盆栽玫瑰 */
function rose(p: string[]) {
  const [potC, flower] = p
  const P = glazedPot(10, 18, potC, shade(potC, -0.15), 10)
  const g = P.g
  const y = P.soil
  const rand = rng(111)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.3
    const base: V3 = [Math.cos(a) * 1.5, y - 0.3, Math.sin(a) * 1.5]
    const L = 20 + rand() * 9
    const dir = dirOf(yawTo(a), -(PI / 2 - 0.18 - rand() * 0.12))
    const tip = along(base, dir, L)
    g.add(noOutline(rod3(base, tip, 0.3, '#4f7a3a', 6)))
    for (const f of [0.35, 0.6, 0.82]) {
      const q = along(base, dir, L * f)
      const la = a + f * 7
      const lt = along(q, dirOf(yawTo(la), -0.1), 2.6)
      g.add(noOutline(rod3(q, lt, 0.12, '#4f7a3a', 4)))
      for (const d of [-0.7, 0, 0.7]) g.add(sprig(2.6, '#3f7a3f', lt, yawTo(la) + d, 0.1, 0.62, 0.14))
    }
    bloom(g, [tip[0], tip[1] + 0.3, tip[2]], i === 4 ? 0.75 : 1.15, flower)
  }
  return g
}

/** 绣球花团 */
function hydraHead(g: THREE.Group, c: V3, r: number, color: string) {
  g.add(ball(r * 0.86, shade(color, -0.07), { x: c[0], y: c[1], z: c[2] }))
  const n = 30
  for (let i = 0; i < n; i++) {
    const yy = 1 - (i / (n - 1)) * 1.45
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy))
    const th = i * 2.39996
    const nrm: V3 = [Math.cos(th) * rr, yy, Math.sin(th) * rr]
    const m = ball(r * 0.26, i % 3 ? color : shade(color, 0.07), {}, [1, 0.35, 1])
    aim(m, [c[0] + nrm[0] * r * 0.86, c[1] + nrm[1] * r * 0.86, c[2] + nrm[2] * r * 0.86], nrm)
    g.add(m)
  }
}
function hydrangea(p: string[]) {
  const [potC, flower] = p
  const P = ceramicPot(12, 20, potC, shade(potC, -0.1))
  const g = P.g
  const y = P.soil
  const heads: [V3, number][] = [
    [[-4.2, y + 15, 2.2], 5.4],
    [[4.6, y + 17, -1.2], 5.6],
    [[0.4, y + 21, -4.8], 4.8],
  ]
  for (const [c] of heads) g.add(noOutline(rod3([c[0] * 0.3, y - 0.3, c[2] * 0.3], [c[0], c[1] - 3, c[2]], 0.4, '#5f8f4a', 6)))
  const rand = rng(121)
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2 + rand() * 0.3
    g.add(sprig(8.5 + rand() * 1.5, k % 2 ? '#4f9e5b' : '#5aa865', [Math.cos(a) * 1.5, y + 2 + rand() * 7, Math.sin(a) * 1.5], yawTo(a), -0.3 + rand() * 0.3, 0.6, 0.14))
  }
  for (const [c, r] of heads) hydraHead(g, c, r, flower)
  return g
}

/** 松叶盆景：浅长盆、扭曲主干、几团修剪成云片状的松叶，土面苔藓 + 一块石头 */
function pinePad(g: THREE.Group, c: V3, s: number) {
  g.add(ball(4 * s, '#3f6e3f', { x: c[0], y: c[1], z: c[2] }, [1, 0.42, 0.78]))
  for (const [dx, dz] of [[-1.6, 0.6], [1.4, -0.4], [0.2, 1.2]]) g.add(ball(2.2 * s, '#4d7f45', { x: c[0] + dx * s, y: c[1] + 0.9 * s, z: c[2] + dz * s }, [1, 0.5, 0.9]))
}
function pineBonsai(p: string[]) {
  const P = bonsaiTray(30, 20, 7, p[0])
  const g = P.g
  const y = P.soil
  const trunk: [V3, number][] = [
    [[-5, y - 0.3, 1], 1.9],
    [[-3, y + 5, 2], 1.6],
    [[-6.5, y + 10, 0.5], 1.35],
    [[-2, y + 15, -1], 1.1],
    [[2.5, y + 18.5, 0], 0.9],
    [[4.5, y + 22.5, 0.8], 0.7],
  ]
  for (let i = 0; i < trunk.length - 1; i++) {
    g.add(taperRod3(trunk[i][0], trunk[i + 1][0], trunk[i][1], trunk[i + 1][1], '#7a5a42'))
    g.add(ball(trunk[i + 1][1], '#7a5a42', { x: trunk[i + 1][0][0], y: trunk[i + 1][0][1], z: trunk[i + 1][0][2] }))
  }
  g.add(ball(2.6, '#7a5a42', { x: -5, y, z: 1 }, [1.3, 0.5, 1.2]))
  const pads: [number, V3, number][] = [
    [2, [-11, y + 11, 2], 0.95],
    [3, [7.5, y + 15, -2.5], 1.0],
    [3, [-6, y + 17.5, -3], 0.8],
    [4, [9, y + 21.5, 3], 0.85],
    [5, [3.5, y + 26, 0], 0.95],
  ]
  for (const [ti, c, s] of pads) {
    g.add(rod3(trunk[ti][0], [c[0], c[1] - 0.5, c[2]], 0.45, '#7a5a42', 6))
    pinePad(g, c, s)
  }
  for (const [x, z, r] of [[-9, 4, 2.2], [-2, 5, 1.8], [3, -5, 2.4], [-10, -4, 1.6], [6, 4, 1.4]]) g.add(ball(r, MOSS, { x, y: y, z }, [1, 0.35, 0.9]))
  g.add(ball(2.6, '#9a958c', { x: 9, y: y + 0.5, z: 4.5 }, [1.2, 0.7, 0.9]))
  return g
}

/** 苔玉：麻绳缠着的苔藓球放在小碟子上，顶上长一丛小蕨 */
function kokedama(p: string[]) {
  const [dish, string] = p
  const g = new THREE.Group()
  g.add(cup(9, 7.5, 2.2, 0.6, dish))
  const cy = 7.0
  const R = 6.4
  g.add(ball(R, MOSS, { y: cy }))
  const rand = rng(131)
  for (let i = 0; i < 14; i++) {
    const yy = 0.95 - (i / 13) * 1.4
    const rr = Math.sqrt(1 - yy * yy)
    const th = i * 2.39996
    g.add(noOutline(ball(1.5 + rand() * 0.6, i % 2 ? '#6c9a42' : '#8dbb5a', { x: Math.cos(th) * rr * R * 0.88, y: cy + yy * R * 0.88, z: Math.sin(th) * rr * R * 0.88 }, [1, 0.6, 1])))
  }
  g.add(torus(R + 0.05, 0.13, string, { y: cy + 0.8, rx: PI / 2 + 0.2 }))
  for (const ry of [0.5, 1.6, 2.6]) g.add(torus(R + 0.05, 0.13, string, { y: cy, ry }))
  const top: V3 = [0, cy + R - 0.6, 0]
  for (let k = 0; k < 14; k++) g.add(sprig(7 + rand() * 2.5, k % 2 ? '#7cc46a' : '#62b25a', top, (k / 14) * PI * 2 + rand() * 0.2, k % 2 ? -0.85 + rand() * 0.3 : -0.4 + rand() * 0.3, 0.2, 0.08))
  for (let k = 0; k < 3; k++) g.add(sprig(4, '#4f9e5b', top, (k / 3) * PI * 2 + 0.5, -0.3, 0.7))
  return g
}

// ======================================================================
// 园艺用具
// ======================================================================

/** 大号铁皮浇水壶：壶嘴朝 +x，带莲蓬头、顶部提手和后把手 */
function canBig(p: string[]) {
  const [body, acc] = p
  const g = new THREE.Group()
  const R = 9
  const H = 22
  const dk = shade(body, -0.1)
  g.add(cyl(R, R + 0.4, H, body, {}, 28))
  g.add(torus(R + 0.35, 0.45, dk, { y: 0.6, rx: PI / 2 }))
  g.add(torus(R + 0.02, 0.45, dk, { y: H - 0.3, rx: PI / 2 }))
  for (const y of [7.5, 14.5]) g.add(torus(R + 0.4 - (0.4 * y) / H + 0.02, 0.28, dk, { y, rx: PI / 2 }))
  g.add(torus(3.6, 0.55, dk, { x: -3.5, y: H + 0.1, rx: PI / 2 }))
  g.add(noOutline(cyl(3.3, 3.3, 0.35, '#3b4248', { x: -3.5, y: H - 0.05 }, 20)))
  const s0: V3 = [6, 5, 0]
  const s1: V3 = [26, 26, 0]
  g.add(taperRod3(s0, s1, 1.5, 0.8, body, 12))
  g.add(rod3([R - 0.3, 15, 0], [16.5, 16.5, 0], 0.35, body, 8))
  const d = new THREE.Vector3(s1[0] - s0[0], s1[1] - s0[1], 0).normalize()
  const P = (k: number): V3 => [s1[0] + d.x * k, s1[1] + d.y * k, 0]
  g.add(taperRod3(P(-0.6), P(2.2), 0.9, 2.6, acc, 12))
  g.add(taperRod3(P(2.1), P(2.5), 2.5, 2.5, shade(acc, -0.15), 12))
  g.add(tube([[6.5, H - 0.6, 0], [4.5, H + 8, 0], [-3.5, H + 8.5, 0], [-7.5, H - 0.6, 0]], 0.7, body, 20, 8))
  g.add(tube([[-R + 0.4, H - 3, 0], [-R - 4.5, H - 6, 0], [-R - 4.5, 9, 0], [-R + 0.4, 5, 0]], 0.65, body, 20, 8))
  return g
}
/** 小号塑料浇水壶：圆肚、细长壶嘴 */
function canSmall(p: string[]) {
  const [body, acc] = p
  const g = new THREE.Group()
  g.add(puck(5.4, 1.2, shade(body, -0.08)))
  g.add(ball(7, body, { y: 7.2 }, [1.05, 0.9, 0.85]))
  g.add(cup(2.4, 2.6, 2.6, 0.4, acc, { x: -2.4, y: 12.6 }))
  const s0: V3 = [4.5, 5, 0]
  const s1: V3 = [19, 16.5, 0]
  g.add(taperRod3(s0, s1, 0.95, 0.5, body, 12))
  const d = new THREE.Vector3(s1[0] - s0[0], s1[1] - s0[1], 0).normalize()
  const P = (k: number): V3 => [s1[0] + d.x * k, s1[1] + d.y * k, 0]
  g.add(taperRod3(P(-0.4), P(1.6), 0.6, 1.6, acc, 12))
  g.add(tube([[3.2, 12.3, 0], [1.5, 18, 0], [-4, 17.5, 0], [-5.8, 11, 0]], 0.75, body, 16, 8))
  return g
}

/** 喷壶（扳机式）：半透明瓶身看得到水 */
function sprayer(p: string[]) {
  const [bottle, head] = p
  const g = new THREE.Group()
  g.add(clearMat(cyl(4, 4, 13, bottle, {}, 24), bottle, 0.5))
  g.add(band(4.05, 4.05, 3.6, 3.6, 1.2, shade(bottle, -0.1), 0))
  g.add(clearMat(cyl(3.7, 3.7, 8.5, WATER, { y: 1.2 }, 24), WATER, 0.5))
  g.add(noOutline(rod3([0, 0.6, 0.6], [0, 15.5, 0], 0.18, '#f4f4f2', 4)))
  g.add(cyl(1.9, 4, 2, bottle, { y: 13 }, 24))
  g.add(cyl(1.7, 1.7, 1.2, bottle, { y: 15 }, 16))
  g.add(cyl(2.0, 2.0, 1.6, head, { y: 16.2 }, 16))
  g.add(rbox(3.2, 3.4, 7.5, head, { y: 17.6, z: 1.8 }, 1.2))
  g.add(cyl(0.75, 0.95, 1.4, shade(head, -0.15), { y: 19.3 - 0.7, z: 5.9, rx: PI / 2 }, 12))
  g.add(rbox(2, 4.5, 1.2, head, { y: 14.2, z: 4.6, rx: 0.25 }, 0.5))
  return g
}

/** 小铲子：平放 */
function trowel(p: string[]) {
  const [handle, blade] = p
  const g = new THREE.Group()
  g.add(rod3([-15, 1.5, 0], [-4, 1.5, 0], 1.5, handle, 14))
  g.add(torus(1.3, 0.25, ROPE, { x: -16.4, y: 0.3, rx: PI / 2 }))
  g.add(rod3([-4.2, 1.5, 0], [-2, 1.5, 0], 1.2, STEEL, 14))
  g.add(rod3([-2.2, 1.5, 0], [1.6, 1.05, 0], 0.4, STEEL, 8))
  g.add(ball(6.5, blade, { x: 7.6, y: 1.05 }, [1, 0.16, 0.48]))
  g.add(rod3([1.4, 1.2, 0], [9, 1.2, 0], 0.3, shade(blade, -0.1), 6))
  return g
}
/** 手耙：平放，五根耙齿 */
function rake(p: string[]) {
  const [handle, head] = p
  const g = new THREE.Group()
  g.add(rod3([-15, 1.5, 0], [-4, 1.5, 0], 1.5, handle, 14))
  g.add(torus(1.3, 0.25, ROPE, { x: -16.4, y: 0.3, rx: PI / 2 }))
  g.add(rod3([-4.2, 1.5, 0], [-2, 1.5, 0], 1.2, STEEL, 14))
  g.add(rod3([-2.2, 1.5, 0], [0.2, 1.5, 0], 0.45, head, 8))
  g.add(rod3([0, 1.5, -4.4], [0, 1.5, 4.4], 0.5, head, 8))
  for (const z of [-4, -2, 0, 2, 4]) g.add(tube([[0, 1.5, z], [3, 1.8, z * 1.12], [5.8, 1.3, z * 1.22], [6.6, 0.35, z * 1.28]], 0.33, head, 12, 6))
  return g
}
/** 修枝剪：平放 */
function pruner(p: string[]) {
  const [grip, grip2] = p
  const g = new THREE.Group()
  const y = 0.9
  g.add(capsAlong([-12, y, -2.4], [-2.6, y, -0.8], 0.9, grip))
  g.add(capsAlong([-12, y, 2.4], [-2.6, y, 0.8], 0.9, grip2))
  g.add(rod3([-3, y, -0.9], [1, y, 0], 0.55, STEEL, 8))
  g.add(rod3([-3, y, 0.9], [1, y, 0], 0.55, STEEL, 8))
  g.add(ball(4, STEEL, { x: 4.6, y: y + 0.15, z: -0.3, ry: 0.15 }, [1, 0.12, 0.33]))
  g.add(ball(3.4, '#8a8f96', { x: 4.1, y: y - 0.12, z: 0.4, ry: -0.2 }, [1, 0.2, 0.38]))
  g.add(cyl(0.8, 0.8, 1.6, '#55585e', { x: 1, y: y - 0.75 }, 12))
  g.add(torus(0.7, 0.18, STEEL, { x: -3.6, y, z: 0, ry: PI / 2 }))
  g.add(rbox(1.6, 0.5, 0.8, grip, { x: -1.4, y: y + 0.45, z: 0 }, 0.2))
  return g
}

/** 一只园艺手套（平放）：mirror = 1 拇指朝 +x */
function glove(g: THREE.Group, at: V3, ang: number, c: string, cuff: string, mirror: number) {
  const gg = new THREE.Group()
  gg.add(rbox(7.5, 1.6, 8.5, c, {}, 0.75))
  const xs = [-2.7, -0.9, 0.9, 2.7]
  const ls = [4.2, 5.2, 5.6, 4.8]
  xs.forEach((x, i) => gg.add(capsAlong([x * mirror, 0.84, 3.8], [x * mirror * 1.08, 0.84, 3.8 + ls[i]], 0.82, c)))
  gg.add(capsAlong([mirror * 3.0, 0.87, 0.4], [mirror * 5.8, 0.87, 3.6], 0.85, c))
  gg.add(rbox(8.2, 1.9, 5, cuff, { z: -6.4 }, 0.8))
  for (const z of [-7.6, -5.2]) gg.add(rbox(8.4, 0.3, 0.35, shade(cuff, -0.15), { y: 1.75, z }, 0.1))
  gg.position.set(...at)
  gg.rotation.y = ang
  g.add(gg)
}
function gloves(p: string[]) {
  const [c, cuff] = p
  const g = new THREE.Group()
  glove(g, [-5.6, 0, 0], 0.12, c, cuff, -1)
  glove(g, [5.6, 0, 0.8], -0.12, c, cuff, 1)
  return g
}

/** 园艺围裙（叠好） */
function apronFolded(p: string[]) {
  const [main, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 1.8, 17, main, {}, 0.8))
  g.add(rbox(23.4, 1.6, 16.4, shade(main, 0.04), { y: 1.8 }, 0.75))
  g.add(rbox(16, 0.5, 6, acc, { y: 3.1, z: 3.5 }, 0.2))
  g.add(rbox(0.3, 0.6, 6, shade(acc, -0.15), { x: 0, y: 3.2, z: 3.5 }, 0.1))
  g.add(torus(2.6, 0.3, acc, { x: -6, y: 3.7, z: -4, rx: PI / 2 }))
  g.add(torus(2.0, 0.3, acc, { x: -1.6, y: 3.7, z: -4.4, rx: PI / 2 }))
  return g
}
/** 园艺围裙（挂起）：挂绳套在钩上，口袋里插着一把剪刀 */
function apronHang(p: string[]) {
  const [main, acc] = p
  const g = new THREE.Group()
  const z = 1.2
  g.add(noOutline(tube([[-11, -22, z], [-6, -6, 0.9], [0, -0.4, 0.8], [6, -6, 0.9], [11, -22, z]], 0.4, acc, 24, 6)))
  g.add(rbox(26, 26, 0.8, main, { y: -48, z }, 0.4))
  g.add(rbox(54, 50, 1.0, main, { y: -98, z }, 0.5))
  g.add(rbox(40, 16, 0.5, acc, { y: -76, z: z + 0.55 }, 0.3))
  for (const x of [-7, 7]) g.add(rbox(0.3, 15, 0.4, shade(acc, -0.15), { x, y: -75.5, z: z + 0.7 }, 0.1))
  g.add(rbox(10, 6, 0.5, acc, { y: -32, z: z + 0.45 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(2.4, 26, 0.5, acc, { x: s * 28.3, y: -74, z, rz: s * 0.06 }, 0.2))
  // 口袋里的剪刀把手
  g.add(capsAlong([-12.5, -66, z + 0.9], [-14, -58, z + 0.9], 0.75, C.red))
  g.add(capsAlong([-10.5, -66, z + 0.9], [-9.5, -58.5, z + 0.9], 0.75, C.red))
  return g
}

/** 培养土袋：鼓鼓的袋子，袋口卷边打开，看得到里面的土 */
function soilBag(p: string[]) {
  const [bag, label, acc] = p
  const g = new THREE.Group()
  g.add(rbox(32, 40, 16, bag, {}, 6))
  g.add(tray(29, 6, 13, 0.5, bag, { y: 38 }, 0.25))
  g.add(tray(30.2, 1.8, 14.2, 0.6, shade(bag, -0.08), { y: 42.6 }, 0.3))
  g.add(ball(7, SOIL, { y: 40.6 }, [1.95, 0.48, 0.85]))
  scatter(g, 4, 43.5, 6, '#e9e3d6', 141, 0.4)
  g.add(rbox(22, 17, 0.6, label, { y: 12, z: 7.85 }, 0.3))
  g.add(rbox(16, 2.4, 0.4, acc, { y: 23, z: 8.05 }, 0.2))
  for (const [x, r] of [[-3, 0.5], [3, -0.5]] as [number, number][]) g.add(noOutline(ball(2.6, LEAF, { x, y: 19, z: 8.25, rz: r }, [0.5, 1, 0.2])))
  g.add(noOutline(cyl(0.3, 0.3, 4, LEAF_D, { y: 14.5, z: 8.25 }, 6)))
  g.add(rbox(14, 1.4, 0.4, shade(label, -0.25), { y: 15, z: 8.05 }, 0.2))
  return g
}

/** 液体肥料瓶 */
function fertilizer(p: string[]) {
  const [body, cap, label] = p
  const g = new THREE.Group()
  g.add(rbox(8.5, 17, 5.5, body, {}, 1.8))
  g.add(torus(2.0, 0.65, body, { x: -1.9, y: 17.2 }))
  g.add(cyl(1.5, 1.5, 1.6, body, { x: 2, y: 16.6 }, 14))
  g.add(cyl(1.9, 1.9, 2.4, cap, { x: 2, y: 18 }, 16))
  g.add(rbox(7, 8.5, 0.4, label, { y: 3.5, z: 2.75 }, 0.3))
  g.add(noOutline(ball(1.4, LEAF, { x: -1.2, y: 8.6, z: 3.0, rz: 0.5 }, [0.55, 1, 0.25])))
  g.add(noOutline(ball(1.2, LEAF_D, { x: 0.8, y: 8.2, z: 3.0, rz: -0.5 }, [0.55, 1, 0.25])))
  g.add(rbox(5, 0.8, 0.5, shade(label, -0.3), { y: 5.2, z: 2.8 }, 0.2))
  return g
}

/** 植物标签牌：一罐插得满满的标签 */
function labelCan(p: string[]) {
  const [can] = p
  const g = new THREE.Group()
  g.add(cup(3.6, 3.4, 7, 0.35, can))
  g.add(torus(3.55, 0.18, shade(can, -0.12), { y: 6.9, rx: PI / 2 }))
  const tags: [number, number, string][] = [
    [-2.0, -1.0, '#f6f0e1'],
    [-0.8, 1.0, C.lemon],
    [0.4, -1.0, C.sky],
    [1.6, 1.0, C.pink],
    [-1.4, 0, C.mint],
    [1.0, 0, '#e9d2a6'],
  ]
  for (const [x, z, c] of tags) {
    const rz = -x * 0.07
    g.add(rbox(1.5, 13, 0.25, c, { x, y: 0.4, z, rz }, 0.2))
    g.add(rbox(1.0, 0.25, 0.35, '#5a4646', { x: x - Math.sin(rz) * 4.5, y: 6.9 + Math.cos(rz) * 4.5 - 0.125, z, rz }, 0.05))
  }
  return g
}

/** 园艺工具挂板（壁挂）：木板 + 木钉，挂着小铲、耙子、剪刀、手套和一卷麻绳 */
const RACK_MOUNT = 110
function toolRack(p: string[]) {
  const [wood, handle, blade] = p
  const g = new THREE.Group()
  const yp = 26
  const zb = 0
  g.add(rbox(62, 12, 2, wood, { y: yp - 6, z: zb + 1 }, 0.6))
  for (const x of [-27, 27]) g.add(cyl(0.6, 0.6, 0.4, STEEL, { x, y: yp + 3.6 - 0.2, z: zb + 2.1, rx: PI / 2 }, 10))
  const zc = zb + 5
  const peg = (x: number) => {
    g.add(rod3([x, yp, zb + 1.5], [x, yp + 0.5, zb + 8], 0.45, shade(wood, -0.12)))
    g.add(ball(0.75, shade(wood, -0.12), { x, y: yp + 0.55, z: zb + 8.2 }))
  }
  // 小铲
  let x = -23
  peg(x)
  g.add(torus(1.2, 0.2, ROPE, { x, y: yp - 0.75, z: zc }))
  g.add(rod3([x, yp - 1.8, zc], [x, yp - 12, zc], 1.3, handle, 12))
  g.add(rod3([x, yp - 11.8, zc], [x, yp - 13.6, zc], 1.05, STEEL, 12))
  g.add(rod3([x, yp - 13.5, zc], [x, yp - 16, zc + 0.3], 0.35, STEEL, 6))
  g.add(ball(5.5, blade, { x, y: yp - 20.5, z: zc + 0.4 }, [0.48, 1, 0.16]))
  // 耙子
  x = -11.5
  peg(x)
  g.add(torus(1.2, 0.2, ROPE, { x, y: yp - 0.75, z: zc }))
  g.add(rod3([x, yp - 1.8, zc], [x, yp - 12, zc], 1.3, handle, 12))
  g.add(rod3([x, yp - 11.8, zc], [x, yp - 13.6, zc], 1.05, STEEL, 12))
  g.add(rod3([x, yp - 13.5, zc], [x, yp - 15.5, zc], 0.4, blade, 6))
  g.add(rod3([x - 3.6, yp - 15.5, zc], [x + 3.6, yp - 15.5, zc], 0.45, blade, 6))
  for (const dx of [-3.3, -1.1, 1.1, 3.3]) g.add(tube([[x + dx, yp - 15.5, zc], [x + dx * 1.1, yp - 18.5, zc + 0.5], [x + dx * 1.2, yp - 21, zc + 1.6]], 0.3, blade, 8, 5))
  // 修枝剪
  x = 0
  peg(x)
  g.add(torus(1.0, 0.18, '#55585e', { x, y: yp - 0.6, z: zc }))
  g.add(capsAlong([x - 1.0, yp - 1.8, zc], [x - 2.2, yp - 10, zc], 0.85, C.red))
  g.add(capsAlong([x + 1.0, yp - 1.8, zc], [x + 2.2, yp - 10, zc], 0.85, shade(C.red, -0.1)))
  g.add(rod3([x - 2, yp - 10, zc], [x, yp - 12.5, zc], 0.5, STEEL, 8))
  g.add(rod3([x + 2, yp - 10, zc], [x, yp - 12.5, zc], 0.5, STEEL, 8))
  g.add(ball(3.4, STEEL, { x: x - 0.3, y: yp - 15.5, z: zc }, [0.32, 1, 0.12]))
  g.add(ball(2.9, '#8a8f96', { x: x + 0.4, y: yp - 15.2, z: zc + 0.35 }, [0.36, 1, 0.18]))
  // 手套搭在木钉上
  x = 11.5
  peg(x)
  for (const [dx, dz, c] of [[-1.2, 0, '#e9b44c'], [1.2, 1.4, shade('#e9b44c', -0.06)]] as [number, number, string][]) {
    g.add(rbox(6.4, 4, 1.2, '#6a8f5a', { x: x + dx, y: yp - 3, z: zc + dz - 1 }, 0.5))
    g.add(rbox(6.2, 7.5, 1.2, c, { x: x + dx, y: yp - 10.5, z: zc + dz - 1 }, 0.55))
    ;[-2.2, -0.75, 0.75, 2.2].forEach((fx, i) => g.add(capsAlong([x + dx + fx, yp - 10.5, zc + dz - 1 + 0.6], [x + dx + fx * 1.05, yp - 14 - [0.5, 1.4, 1.6, 0.9][i], zc + dz - 1 + 0.6], 0.7, c)))
  }
  // 麻绳卷
  x = 23
  peg(x)
  g.add(cyl(2.6, 2.6, 3.6, ROPE, { x, y: yp + 0.3 - 1.8, z: zc + 0.6, rx: PI / 2 }, 18))
  g.add(noOutline(tube([[x + 2.4, yp - 0.4, zc + 1.2], [x + 2.8, yp - 6, zc + 1.4], [x + 2.2, yp - 12, zc + 1.1]], 0.15, ROPE, 8, 4)))
  return g
}

/** 园艺工作台：台面、背板 + 顶层窄架、挂杆、下层层板。层板都空着 */
function pottingBench(p: string[]) {
  const [wood, top] = p
  const g = new THREE.Group()
  const dk = shade(wood, -0.08)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 86, 4, dk, { x: sx * 48, z: sz * 23 }, 0.6))
  g.add(rbox(100, 4, 50, top, { y: 86 }, 1))
  g.add(rbox(92, 2, 42, wood, { y: 18 }, 0.6))
  for (const sz of [-1, 1]) g.add(rbox(92, 5, 2, dk, { y: 80, z: sz * 23 }, 0.5))
  g.add(rbox(100, 50, 2, wood, { y: 90, z: -24 }, 0.6))
  g.add(rbox(96, 2, 14, wood, { y: 128, z: -16 }, 0.6))
  for (const sx of [-1, 1]) {
    g.add(rbox(2, 9, 10, dk, { x: sx * 40, y: 119, z: -18 }, 0.4))
  }
  // 挂杆
  for (const x of [-40, 40]) g.add(rod3([x, 112, -23], [x, 112, -21], 0.5, STEEL, 8))
  g.add(rod3([-42, 112, -21.2], [42, 112, -21.2], 0.55, STEEL))
  return g
}

/** 阶梯花架：三层台阶状层板，层板空着 */
const STAND_TIERS: [number, number, number][] = [
  [30, 7.5, 22.5],
  [60, -7.5, 7.5],
  [90, -22.5, -7.5],
]
function ladderStand(p: string[]) {
  const [wood] = p
  const g = new THREE.Group()
  const dk = shade(wood, -0.08)
  const W = 70
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 3)
    g.add(rbox(3, 88, 3, dk, { x, z: -21 }, 0.5))
    for (const [y, , z1] of STAND_TIERS) {
      if (z1 > -10) g.add(rbox(3, y - 2, 3, dk, { x, z: z1 - 1.5 }, 0.5))
      g.add(rbox(3, 3, z1 + 22.5, dk, { x, y: y - 5, z: (z1 - 22.5) / 2 }, 0.5))
    }
  }
  for (const [y, z0, z1] of STAND_TIERS) g.add(rbox(W, 2, z1 - z0, wood, { y: y - 2, z: (z0 + z1) / 2 }, 0.5))
  g.add(rbox(W - 6, 3, 2, dk, { y: 8, z: 20.5 }, 0.5))
  g.add(rbox(W - 6, 3, 2, dk, { y: 8, z: -21 }, 0.5))
  return g
}

/** 夹式植物补光灯：弹簧夹 + 鹅颈 + 灯条（发光） */
function clipLight(p: string[]) {
  const [body, light] = p
  const g = new THREE.Group()
  g.add(rbox(4, 1, 7, body, {}, 0.4))
  g.add(rbox(4, 1, 6.5, body, { y: 2.4, z: 0.3, rx: -0.12 }, 0.4))
  g.add(rbox(4, 2.4, 1.6, body, { y: 0.6, z: -3.2 }, 0.4))
  g.add(torus(1.0, 0.25, STEEL, { y: 2.0, z: -2.0, ry: PI / 2 }))
  g.add(rbox(3.2, 0.4, 2.2, RUBBER, { y: 1.0, z: 2.3 }, 0.15))
  const neck: V3[] = [[0, 3.4, -2.6], [0, 12, -3.6], [0, 24, -2.2], [0, 31.5, 2], [0, 33.6, 6]]
  g.add(tube(neck, 0.5, shade(body, -0.05), 30, 8))
  const curve = curveOf(neck)
  for (let k = 1; k < 12; k++) {
    const q = curve.getPoint(k / 12)
    const tq = curve.getTangent(k / 12)
    g.add(noOutline(aim(torus(0.5, 0.12, shade(body, -0.15), { rx: PI / 2 }), [q.x, q.y, q.z], [tq.x, tq.y, tq.z])))
  }
  g.add(rbox(18, 1.6, 3.4, body, { y: 33.2, z: 7.4 }, 0.6))
  g.add(lit(rbox(16.4, 0.4, 2.4, light, { y: 32.95, z: 7.4 }, 0.15), light, 0.9))
  g.add(noOutline(tube([[0, 0.6, -3.8], [0, 0.3, -6], [3, 0.3, -7.5], [7, 0.3, -7]], 0.25, RUBBER, 12, 5)))
  return g
}
/** 落地植物补光灯：三脚架 + 立杆 + 两只灯板（发光） */
function floorLight(p: string[]) {
  const [body, light] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    g.add(rod3([0, 42, 0], [Math.cos(a) * 24, 1.2, Math.sin(a) * 24], 0.8, body, 8))
    g.add(puck(1.6, 1.2, RUBBER, { x: Math.cos(a) * 24.4, z: Math.sin(a) * 24.4 }))
  }
  g.add(cyl(1.8, 1.8, 6, body, { y: 39 }, 14))
  g.add(rod3([0, 39, 0], [0, 148, 0], 1.1, body, 12))
  g.add(rod3([-17, 148, 0], [17, 148, 0], 0.8, body))
  g.add(cyl(1.6, 1.6, 3, body, { y: 146.5 }, 12))
  g.add(rbox(3, 6, 2.4, shade(body, 0.1), { y: 96, z: 1.4 }, 0.5))
  g.add(lit(ball(0.4, '#7dff9a', { y: 100, z: 2.7 }), '#7dff9a', 0.9))
  const tilt = 0.35
  const nrm = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt))
  for (const s of [-1, 1]) {
    g.add(tube([[s * 17, 148, 0], [s * 19.5, 146, 2], [s * 19.5, 142.5, 4.2]], 0.5, body, 12, 6))
    const c = new THREE.Vector3(s * 19.5, 140.8, 5)
    g.add(rbox(15, 1.8, 11, body, { x: c.x, y: c.y - 0.9, z: c.z, rx: tilt }, 0.6))
    const pc = c.clone().addScaledVector(nrm, -1.0)
    g.add(lit(rbox(13.4, 0.4, 9.4, light, { x: pc.x, y: pc.y - 0.2, z: pc.z, rx: tilt }, 0.15), light, 0.9))
  }
  return g
}

/** 堆肥桶（波卡西桶）：盖子 + 提手 + 底部出水龙头 */
function compostBin(p: string[]) {
  const [body, lid] = p
  const g = new THREE.Group()
  g.add(cup(13, 11.5, 34, 0.8, body))
  g.add(puck(13.8, 3, lid, { y: 34 }))
  g.add(rbox(10, 2.2, 3.2, lid, { y: 36.6 }, 1))
  for (const s of [-1, 1]) g.add(rbox(1.4, 4.5, 3, shade(lid, -0.1), { x: s * 13.4, y: 31.4 }, 0.4))
  g.add(cyl(1.3, 1.3, 3, STEEL, { y: 4 - 1.5, z: 12.4, rx: PI / 2 }, 12))
  g.add(rbox(1.2, 2.6, 1.2, lid, { y: 4.8, z: 13.6 }, 0.4))
  g.add(noOutline(ball(2.4, LEAF, { x: -1.4, y: 21, z: 12.75, rz: 0.5 }, [0.55, 1, 0.2])))
  g.add(noOutline(ball(2.2, LEAF_D, { x: 1.4, y: 20.4, z: 12.75, rz: -0.5 }, [0.55, 1, 0.2])))
  return g
}

/** 阳台水管卷盘：A 字架、卷着软管的绕线鼓、摇柄，管头的喷枪放在地上 */
function hoseReel(p: string[]) {
  const [frame, hose, acc] = p
  const g = new THREE.Group()
  const ax = 26
  for (const s of [-1, 1]) {
    const x = s * 17
    g.add(rbox(3, 2.4, 40, frame, { x }, 0.8))
    g.add(rod3([x, 2, -17], [x, 44, 0], 1.0, frame))
    g.add(rod3([x, 2, 17], [x, 44, 0], 1.0, frame))
    g.add(rbox(2.4, 6, 6, frame, { x, y: ax - 3 }, 0.6))
  }
  g.add(rod3([-17, 44, 0], [17, 44, 0], 1.2, frame))
  g.add(rod3([-8, 44, 0], [8, 44, 0], 1.6, RUBBER, 12))
  g.add(rod3([-18, ax, 0], [18.6, ax, 0], 0.9, STEEL))
  g.add(cyl(8, 8, 28, shade(frame, 0.1), { y: ax - 14, rz: PI / 2 }, 20))
  for (const x of [-14.5, 14.5]) g.add(cyl(15, 15, 1, frame, { x, y: ax - 0.5, rz: PI / 2 }, 28))
  for (const [r, x0, x1] of [[9.2, -12.6, 12.6], [10.8, -12.6, 12.6], [12.4, -12.6, 3]] as [number, number, number][])
    for (let x = x0; x <= x1 + 0.01; x += 1.68) g.add(torus(r, 0.8, hose, { x, y: ax, ry: PI / 2 }))
  g.add(rod3([18.6, ax, 0], [18.6, ax + 8, 3], 0.7, STEEL, 8))
  g.add(rod3([18.6, ax + 8, 3], [22.6, ax + 8, 3], 0.9, acc))
  g.add(tube([[3, ax - 12.4, 4], [3, 6, 16], [6, 1.1, 22], [11, 1.0, 25.5]], 0.8, hose, 20, 8))
  g.add(capsAlong([11, 1.2, 25.5], [17, 1.2, 28], 1.2, acc))
  g.add(capsAlong([16, 1.0, 28], [14.5, 1.0, 31.5], 0.9, acc))
  return g
}

/** 园艺推车（小拖车）：车斗 + 四轮 + 拉杆 */
function gardenCart(p: string[]) {
  const [body, wheel] = p
  const g = new THREE.Group()
  g.add(tray(64, 22, 38, 1.4, body, { y: 18 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(60, 2.5, 3, '#55585e', { y: 15.5, z: s * 12 }, 0.5))
  for (const x of [-22, 22]) {
    g.add(rod3([x, 9, -21], [x, 9, 21], 0.8, STEEL, 8))
    for (const s of [-1, 1]) {
      g.add(rbox(3, 7.5, 3, '#55585e', { x, y: 8.5, z: s * 12 }, 0.5))
      g.add(cyl(9, 9, 4, RUBBER, { x, y: 9 - 2, z: s * 21.5, rx: PI / 2 }, 24))
      g.add(cyl(4.5, 4.5, 4.4, wheel, { x, y: 9 - 2.2, z: s * 21.5, rx: PI / 2 }, 16))
    }
  }
  g.add(rbox(4, 4, 6, '#55585e', { x: 33, y: 13.5 }, 0.6))
  g.add(rod3([34, 15.5, 0], [44, 70, 0], 1.0, STEEL))
  g.add(rod3([44, 70, -7], [44, 70, 7], 1.4, wheel, 12))
  return g
}

// ======================================================================
// 配色
// ======================================================================

const TERRA_PAL = sty({ retro: [[TERRA], ['#a8603f']], nordic: [['#e3c9b0']], industrial: [['#b5654a']], japanese: [['#8f5a3c']] })
const GLAZED_PAL = sty({ cute: [[C.sky, C.white], [C.pink, C.cream], [C.mint, C.white]], retro: [[R.teal, R.mustard]], japanese: [[J.ai, J.washi]] })
const CEMENT_PAL = sty({ industrial: [[I.concrete], ['#8d8a86']], modern: [[M.light], [M.char]] })
const CERAMIC_PAL = sty({ nordic: [[N.white, N.oak], [N.sage, N.oakL], [N.blue, N.oak]], modern: [[M.white, M.walnut], [M.black, M.walnut]] })
const RATTAN_PAL = sty({ nordic: [['#d8b98a']], japanese: [['#b08a5a']], cute: [['#ecd8b0']], retro: [['#a8683a']] })
const WOODBOX_PAL = sty({ nordic: [[N.oak], [N.white]], japanese: [[J.wood]], industrial: [[I.walnut]], cute: [[C.woodL]] })
const ENAMEL_PAL = sty({ retro: [[R.cream, '#2f4a6a'], [R.mustard, R.cream]], cute: [[C.white, C.sky], [C.mint, C.white]], nordic: [[N.white, M.char]] })
const BONSAI_PAL = sty({ japanese: [[J.sumi], ['#7a4a35'], [J.ai], ['#c9c2b0']], modern: [[M.char]] })
const HANG_PAL = sty({ nordic: [[N.white, ROPE], [N.sage, ROPE]], cute: [[C.pink, C.cream]], modern: [[M.char, M.light]], retro: [[TERRA, R.cream]] })
const WALL_PAL = sty({ nordic: [[N.white, N.oak]], cute: [[C.mint, C.woodL], [C.pink, C.white]], modern: [[M.char, M.black]], industrial: [[I.concrete, I.iron]] })
const SELF_PAL = sty({ modern: [[M.white, C.red], [M.char, C.lemon]], cute: [[C.mint, C.red], [C.pink, C.red]], nordic: [[N.gray, N.mustard]] })
const SEED_PAL = sty({ industrial: [['#2e2e30']], modern: [[M.char]], cute: [['#7cc47e']], retro: [[TERRA]] })
const TERRARIUM_PAL = sty({ nordic: [['#c9a26b']], modern: [[M.black]], industrial: [['#b08d57']], japanese: [[J.dark]] })

/** 盆栽：盆的颜色 */
const PLANT_POT = sty({ cute: [[C.sakura], [C.sky]], nordic: [[N.white]], modern: [[M.char]], retro: [[TERRA]] })
const PLANT_GLAZED = sty({ cute: [[C.white, C.sky], [C.sakura, C.white]], nordic: [[N.sage, N.white]], modern: [[M.char, M.silver]], retro: [[R.teal, R.mustard]] })
const PLANT_CEMENT = sty({ industrial: [[I.concrete]], modern: [[M.char], [M.light]], nordic: [[N.white]] })
const PLANT_TERRA = sty({ retro: [[TERRA]], nordic: [['#e3c9b0']], industrial: [['#b5654a']], cute: [[C.sakura]] })
const ORCHID_PAL = sty({ cute: [[C.white, '#f7c4dc', '#d9548a'], [C.sky, C.white, '#e9a33a']], nordic: [[N.white, '#f2e9f7', '#b05ab0']], modern: [[M.black, C.white, '#d9548a']] })
const ROSE_PAL = sty({ cute: [[C.white, '#ff7f9a'], [C.sky, '#fff1a8']], nordic: [[N.white, '#f5c9c9']], retro: [[R.cream, '#c8473a']], modern: [[M.char, '#fafafa']] })
const HYDRA_PAL = sty({ cute: [[C.white, '#8fb3e8'], [C.sakura, '#f2a7c3']], nordic: [[N.white, '#b49be0']], japanese: [[J.ai, '#a6c4f0']], modern: [[M.char, '#f1f1f6']] })
const KOKE_PAL = sty({ japanese: [[J.sumi, ROPE], [J.washi, '#8a6a4a'], ['#7a4a35', ROPE]], nordic: [[N.white, ROPE]], modern: [[M.char, M.light]] })

/** 工具 */
const CAN_BIG_PAL = sty({ industrial: [['#b8bfc6', '#9aa1a8'], ['#4d5a52', '#b8bfc6']], retro: [[R.teal, '#d6a436'], [R.red, R.cream]], nordic: [[N.white, N.oak]] })
const CAN_SMALL_PAL = sty({ cute: [[C.mint, C.white], [C.pink, C.white], [C.lemon, C.sky]], nordic: [[N.white, N.sage]], modern: [[M.char, M.light]] })
const SPRAY_PAL = sty({ cute: [[C.sky, C.white], [C.pink, C.white], [C.mint, C.lemon]], modern: [[M.light, M.black]], retro: [[R.cream, R.orange]] })
const HANDTOOL_PAL = sty({ nordic: [[N.oak, STEEL]], industrial: [[I.walnut, '#7c8085']], cute: [[C.pink, STEEL], [C.mint, STEEL]], retro: [[R.red, '#9aa1a8']] })
const PRUNER_PAL = sty({ retro: [[R.red, shade(R.red, -0.1)]], cute: [[C.pink, C.sakura], [C.sky, C.white]], industrial: [[I.iron, I.rust]], nordic: [[N.sage, N.white]] })
const GLOVE_PAL = sty({ cute: [[C.pink, C.white], [C.lemon, C.mint]], nordic: [[N.linen, N.sage]], retro: [[R.mustard, R.teal]], industrial: [['#9a5f3a', I.iron]] })
const APRON_PAL = sty({ nordic: [[N.linen, N.oak], [N.sage, N.linen]], industrial: [['#5a5f52', I.leather]], retro: [[R.olive, R.mustard]], cute: [[C.sakura, C.white]] })
const SOILBAG_PAL = sty({ nordic: [['#e8e1d4', '#f7f5f0', '#7da35a']], retro: [[R.orange, R.cream, R.olive]], industrial: [['#5a5f52', '#e8e1d4', I.rust]], cute: [[C.mint, C.white, C.pink]] })
const FERT_PAL = sty({ cute: [[C.white, C.pink, C.cream], [C.lemon, C.mint, C.white]], modern: [[M.white, M.black, M.light]], retro: [[R.cream, R.teal, R.mustard]], nordic: [[N.white, N.sage, N.linen]] })
const LABEL_PAL = sty({ industrial: [['#b8bfc6']], retro: [[R.teal], [R.red]], cute: [[C.sky]], nordic: [[N.white]] })
const RACK_PAL = sty({ nordic: [[N.oak, N.oakL, STEEL]], industrial: [[I.walnut, I.walnut, '#7c8085']], cute: [[C.woodL, C.pink, STEEL]], japanese: [[J.wood, J.hinoki, STEEL]] })
const BENCH_PAL = sty({ nordic: [[N.oak, N.oakL]], industrial: [[I.walnut, I.concrete]], japanese: [[J.wood, J.hinoki]], cute: [[C.woodL, C.white]], retro: [[R.caramel, R.cream]] })
const STAND_PAL = sty({ nordic: [[N.oak], [N.white]], industrial: [[I.walnut]], japanese: [[J.wood]], cute: [[C.woodL]] })
const LIGHT_PAL = sty({ modern: [[M.black, '#f2a0e8'], [M.white, '#fff2c8']], industrial: [[I.iron, '#ff9adf']], nordic: [[N.white, '#fff6d8']], cute: [[C.sakura, '#ffe9f4']] })
const COMPOST_PAL = sty({ nordic: [[N.sage, N.white], [N.white, N.gray]], modern: [[M.char, M.black]], cute: [[C.mint, C.white]], retro: [[R.olive, R.cream]] })
const HOSE_PAL = sty({ industrial: [[I.iron, '#4f9e5b', I.rust]], modern: [[M.char, M.gray, '#e2702f']], retro: [[R.teal, R.mustard, R.orange]], cute: [[C.white, C.mint, C.pink]] })
const CART_PAL = sty({ retro: [[R.red, R.cream]], industrial: [['#4d5a52', '#c3c7cc']], cute: [[C.sky, C.white], [C.mint, C.white]], nordic: [[N.sage, N.white]] })

// ======================================================================
// 素材列表
// ======================================================================

export const GARDEN: AssetDef[] = [
  // ---------- 花盆 ----------
  A('gd-terra-s', '素烧陶盆', 'plants', [14.2, 14.2, 11.8], TERRA_PAL, terraBuild(6.5, 11), { prop: true, family: 'gd-terra', sizeLabel: 'S' }),
  A('gd-terra-m', '素烧陶盆', 'plants', [18, 18, 16.8], TERRA_PAL, terraBuild(9, 16), { prop: true, family: 'gd-terra', sizeLabel: 'M' }),
  A('gd-terra-l', '素烧陶盆', 'plants', [25, 25, 22.8], TERRA_PAL, terraBuild(12.5, 22), { prop: true, family: 'gd-terra', sizeLabel: 'L' }),
  A('gd-glazed-s', '上釉陶盆', 'plants', [14, 14, 12], GLAZED_PAL, glazedBuild(7, 12), { prop: true, family: 'gd-glazed', sizeLabel: 'S' }),
  A('gd-glazed-m', '上釉陶盆', 'plants', [20, 20, 17], GLAZED_PAL, glazedBuild(10, 17), { prop: true, family: 'gd-glazed', sizeLabel: 'M' }),
  A('gd-glazed-l', '上釉陶盆', 'plants', [28, 28, 24], GLAZED_PAL, glazedBuild(14, 24), { prop: true, family: 'gd-glazed', sizeLabel: 'L' }),
  A('gd-cement-s', '水泥花盆', 'plants', [14, 14.1, 13], CEMENT_PAL, cementBuild('round', 7, 13), { prop: true, family: 'gd-cement', sizeLabel: 'S 圆' }),
  A('gd-cement-m', '水泥花盆', 'plants', [22, 22, 20], CEMENT_PAL, cementBuild('round', 11, 20), { prop: true, family: 'gd-cement', sizeLabel: 'M 圆' }),
  A('gd-cement-l', '水泥花盆', 'plants', [30, 30, 28], CEMENT_PAL, cementBuild('square', 30, 28), { prop: true, family: 'gd-cement', sizeLabel: 'L 方' }),
  A('gd-ceramic-s', '北欧白瓷盆', 'plants', [14.4, 14.4, 12.2], CERAMIC_PAL, ceramicBuild(6, 11), { prop: true, family: 'gd-ceramic', sizeLabel: 'S' }),
  A('gd-ceramic-m', '北欧白瓷盆', 'plants', [20.4, 20.4, 17.2], CERAMIC_PAL, ceramicBuild(9, 16), { prop: true, family: 'gd-ceramic', sizeLabel: 'M' }),
  A('gd-ceramic-l', '北欧白瓷盆', 'plants', [30.4, 30.4, 35.8], CERAMIC_PAL, ceramicBuild(13, 22, true), { family: 'gd-ceramic', sizeLabel: 'L 带脚架' }),
  A('gd-rattan-m', '藤编套盆', 'plants', [20.5, 20.5, 18.5], RATTAN_PAL, rattanBuild(10, 18), { prop: true, family: 'gd-rattan', sizeLabel: 'M' }),
  A('gd-rattan-l', '藤编套盆', 'plants', [30.5, 30.5, 28.5], RATTAN_PAL, rattanBuild(15, 28), { prop: true, family: 'gd-rattan', sizeLabel: 'L' }),
  A('gd-woodbox-s', '木制小花箱', 'plants', [22, 22, 18], WOODBOX_PAL, woodBoxBuild(22, 22, 18), { prop: true, family: 'gd-woodbox', sizeLabel: 'S 方形' }),
  A('gd-woodbox-m', '木制小花箱', 'plants', [44, 18, 16], WOODBOX_PAL, woodBoxBuild(44, 18, 16), { prop: true, family: 'gd-woodbox', sizeLabel: 'M 长条' }),
  A('gd-enamel-s', '珐琅铁盆', 'plants', [16.1, 13.8, 11.2], ENAMEL_PAL, enamelBuild(6.5, 11), { prop: true, family: 'gd-enamel', sizeLabel: 'S' }),
  A('gd-enamel-m', '珐琅铁盆', 'plants', [22.9, 20.8, 16.2], ENAMEL_PAL, enamelBuild(10, 16), { prop: true, family: 'gd-enamel', sizeLabel: 'M' }),
  A('gd-bonsai-tray-s', '和风盆栽盆', 'plants', [20, 14, 6], BONSAI_PAL, bonsaiTrayBuild(20, 14, 6), { prop: true, family: 'gd-bonsai-tray', sizeLabel: 'S' }),
  A('gd-bonsai-tray-m', '和风盆栽盆', 'plants', [32, 22, 8], BONSAI_PAL, bonsaiTrayBuild(32, 22, 8), { prop: true, family: 'gd-bonsai-tray', sizeLabel: 'M' }),
  A('gd-hanging-pot', '吊盆', 'plants', [16, 22.5, 15.9], HANG_PAL, hangingPotStand, { prop: true, family: 'gd-hanging-pot', form: 'standing' }),
  A('gd-hanging-pot-hanging', '吊盆', 'plants', [16, 18.7, 52.6], HANG_PAL, (p) => hangingPotHang(p), { prop: true, family: 'gd-hanging-pot', form: 'hanging' }),
  A('gd-wall-pot', '壁挂花盆', 'plants', [18, 9, 21], WALL_PAL, wallPot, { mount: WALL_MOUNT }),
  A('gd-self-water', '自吸水花盆', 'plants', [20.8, 22.7, 24.4], SELF_PAL, selfWater, { prop: true }),
  A('gd-seed-tray-12', '育苗托盘', 'plants', [26, 20, 11.1], SEED_PAL, seedTray(4, 3, 6), { prop: true, family: 'gd-seed-tray', sizeLabel: '12 格' }),
  A('gd-seed-tray-24', '育苗托盘', 'plants', [32, 22, 11.1], SEED_PAL, seedTray(6, 4, 5), { prop: true, family: 'gd-seed-tray', sizeLabel: '24 格' }),
  A('gd-terrarium-jar', '玻璃微景观瓶', 'plants', [15, 15, 18.7], TERRARIUM_PAL, terrarium('jar'), { prop: true, family: 'gd-terrarium', sizeLabel: 'S 软木塞罐' }),
  A('gd-terrarium-globe', '玻璃微景观瓶', 'plants', [19, 19, 17.3], TERRARIUM_PAL, terrarium('globe'), { prop: true, family: 'gd-terrarium', sizeLabel: 'M 开口玻璃球' }),

  // ---------- 盆栽植物 ----------
  A('gd-pothos', '绿萝', 'plants', [24.4, 24.7, 16.3], PLANT_POT, pothosStand, { prop: true, family: 'gd-pothos', form: 'standing' }),
  A('gd-pothos-hanging', '绿萝', 'plants', [27.8, 29, 109.6], HANG_PAL, pothosHang, { prop: true, family: 'gd-pothos', form: 'hanging' }),
  A('gd-ivy', '常春藤（圆环）', 'plants', [24.1, 18.9, 37.9], PLANT_TERRA, ivyHoop, { prop: true }),
  A('gd-monstera-kid', '龟背竹幼苗', 'plants', [27.4, 27.7, 27.8], PLANT_CEMENT, monsteraKid, { prop: true }),
  A('gd-rubber-tree', '橡皮树', 'plants', [28.3, 27, 94.4], PLANT_GLAZED, rubberTree),
  A('gd-birdnest', '鸟巢蕨', 'plants', [27.3, 27.5, 30.3], PLANT_GLAZED, birdNest, { prop: true }),
  A('gd-orchid', '蝴蝶兰', 'plants', [21.4, 22.2, 46.1], ORCHID_PAL, orchid, { prop: true }),
  A('gd-succulent-bowl', '多肉拼盘', 'plants', [25, 25, 10.3], PLANT_POT, succulentBowl, { prop: true }),
  A('gd-cactus-group', '仙人球组合', 'plants', [26, 12, 15.3], PLANT_GLAZED, cactusGroup, { prop: true }),
  A('gd-herb-mint', '香草盆栽', 'plants', [14.9, 17.4, 20.9], PLANT_TERRA, herb('mint'), { prop: true, family: 'gd-herb', sizeLabel: '薄荷' }),
  A('gd-herb-basil', '香草盆栽', 'plants', [14.9, 14.9, 26.3], PLANT_TERRA, herb('basil'), { prop: true, family: 'gd-herb', sizeLabel: '罗勒' }),
  A('gd-herb-rosemary', '香草盆栽', 'plants', [16.8, 14.9, 29.5], PLANT_TERRA, herb('rosemary'), { prop: true, family: 'gd-herb', sizeLabel: '迷迭香' }),
  A('gd-tomato', '小番茄（带支架）', 'plants', [31.2, 31.2, 112.9], PLANT_POT, tomato),
  A('gd-strawberry', '草莓罐', 'plants', [29.1, 28.3, 30], PLANT_TERRA, strawberryJar, { prop: true }),
  A('gd-sunflower', '矮向日葵', 'plants', [20.4, 19, 67.1], PLANT_TERRA, sunflower, { prop: true }),
  A('gd-lavender', '薰衣草', 'plants', [19, 19.6, 39.6], PLANT_TERRA, lavender, { prop: true }),
  A('gd-rose', '盆栽玫瑰', 'plants', [20.5, 24.3, 45.3], ROSE_PAL, rose, { prop: true }),
  A('gd-hydrangea', '绣球花', 'plants', [26.4, 26.4, 45.1], HYDRA_PAL, hydrangea, { prop: true }),
  A('gd-pine-bonsai', '松叶盆景', 'plants', [30, 20, 33.5], BONSAI_PAL, pineBonsai, { prop: true, styles: ['japanese', 'modern'] }),
  A('gd-kokedama', '苔玉', 'plants', [18, 18.1, 19], KOKE_PAL, kokedama, { prop: true }),

  // ---------- 园艺用具 ----------
  A('gd-can-big', '浇水壶', 'outdoor', [44.4, 19.6, 32], CAN_BIG_PAL, canBig, { prop: true, family: 'gd-watering-can', sizeLabel: '大 · 铁皮' }),
  A('gd-can-small', '浇水壶', 'outdoor', [28.6, 11.9, 19.2], CAN_SMALL_PAL, canSmall, { prop: true, family: 'gd-watering-can', sizeLabel: '小 · 塑料' }),
  A('gd-sprayer', '喷壶', 'outdoor', [8.1, 10.7, 21], SPRAY_PAL, sprayer, { prop: true }),
  A('gd-trowel', '小铲子', 'outdoor', [32, 6.2, 2.9], HANDTOOL_PAL, trowel, { prop: true, form: 'lying' }),
  A('gd-rake', '手耙', 'outdoor', [24.8, 10.8, 2.9], HANDTOOL_PAL, rake, { prop: true, form: 'lying' }),
  A('gd-pruner', '修枝剪', 'outdoor', [20.6, 6.3, 1.8], PRUNER_PAL, pruner, { prop: true, form: 'lying' }),
  A('gd-gloves', '园艺手套', 'outdoor', [22.6, 19.5, 2.1], GLOVE_PAL, gloves, { prop: true, form: 'lying' }),
  A('gd-apron', '园艺围裙', 'outdoor', [24, 17, 4], APRON_PAL, apronFolded, { prop: true, family: 'gd-apron', form: 'folded' }),
  A('gd-apron-hanging', '园艺围裙', 'outdoor', [60.5, 2.4, 97.9], APRON_PAL, apronHang, { prop: true, family: 'gd-apron', form: 'hanging' }),
  A('gd-soil-bag', '培养土袋', 'outdoor', [32, 16.8, 44.4], SOILBAG_PAL, soilBag, { prop: true }),
  A('gd-fertilizer', '液体肥料', 'outdoor', [8.8, 6.1, 20.4], FERT_PAL, fertilizer, { prop: true }),
  A('gd-plant-labels', '植物标签牌', 'outdoor', [7.5, 7.5, 13.4], LABEL_PAL, labelCan, { prop: true }),
  A('gd-tool-rack', '园艺工具挂板', 'outdoor', [62, 9, 32], RACK_PAL, toolRack, { mount: RACK_MOUNT }),
  A('gd-potting-bench', '园艺工作台', 'outdoor', [100, 50, 140], BENCH_PAL, pottingBench, {
    keep: true,
    surface: 90,
    surfaceShape: [rectPoly(-50, -23, 50, 25)],
    surfaces: [
      { y: 130, shape: [rectPoly(-48, -23, 48, -9)] },
      { y: 112, kind: 'hook', shape: [rectPoly(-40, -22.4, 40, -20)], h: 22 },
      { y: 20, shape: [rectPoly(-46, -21, 46, 21)], h: 66 },
    ],
  }),
  A('gd-ladder-stand', '阶梯花架', 'plants', [70, 45, 90], STAND_PAL, ladderStand, {
    keep: true,
    surface: 90,
    surfaceShape: [rectPoly(-35, STAND_TIERS[2][1], 35, STAND_TIERS[2][2])],
    surfaces: [
      { y: 60, shape: [rectPoly(-35, STAND_TIERS[1][1], 35, STAND_TIERS[1][2])] },
      { y: 30, shape: [rectPoly(-35, STAND_TIERS[0][1], 35, STAND_TIERS[0][2])] },
    ],
  }),
  A('gd-grow-light-clip', '植物补光灯', 'plants', [18, 16.9, 34.8], LIGHT_PAL, clipLight, { prop: true, family: 'gd-grow-light', sizeLabel: '夹式' }),
  A('gd-grow-light-floor', '植物补光灯', 'plants', [54, 39.8, 149.5], LIGHT_PAL, floorLight, { family: 'gd-grow-light', sizeLabel: '落地' }),
  A('gd-compost-bin', '堆肥桶', 'outdoor', [28.2, 28, 38.8], COMPOST_PAL, compostBin),
  A('gd-hose-reel', '水管卷盘', 'outdoor', [41.1, 51.6, 45.6], HOSE_PAL, hoseReel),
  A('gd-garden-cart', '园艺推车', 'outdoor', [77.4, 47.4, 71.4], CART_PAL, gardenCart),
]
