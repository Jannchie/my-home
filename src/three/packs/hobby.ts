// 健身器材 / 茶杯 / 爱好模型 / 镜子 素材包。约定见 kit.ts 开头。
// 镜面统一用浅蓝灰 + 少量自发光，加一两道斜向高光条表现反光，不做真实反射。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, ellipsePoly, glow, rectPoly, rng, shell, slab, type AssetCategory, type AssetDef, type Poly } from '../kit'
import { hollow, swingDoor } from './styles-world'
import { P, PI, noOutline, type V3 } from '../geo'
import { I, J, M, N, PROP, R, type PalFlat } from '../packkit'

const MIR = '#cfdfe9'
const SCREEN = '#bfe3ff'
const RUBBER = '#2e2f33'
const CHROME = '#d5d9de'
const TEA = '#9dbb55'
const BLACK_TEA = '#b8652c'
const COFFEE = '#a8724a'

function def(
  id: string,
  name: string,
  category: AssetCategory,
  [w, d, h]: [number, number, number],
  pals: PalFlat[],
  build: (p: string[]) => THREE.Group,
  extra: Partial<AssetDef> = {},
): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x.slice(1) as string[]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}

// ---------- 小工具 ----------

function lit<T extends THREE.Mesh>(m: T, color: string, k = 0.5): T {
  m.material = toon(color, { emissive: k })
  return m
}

/** 半透明（玻璃、亚克力罩），不描边 */
function ghost<T extends THREE.Mesh>(m: T, color: string, a = 0.35): T {
  m.material = toon(color, { transparent: a })
  m.castShadow = false
  return m
}

/** 沿 x 的横圆柱，给中心 */
const cylX = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 24) => P(cyl(r, r, len, color, {}, seg), x, y, z, 0, 0, PI / 2)
/** 沿 z 的圆柱，给中心 */
const cylZ = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 24) => P(cyl(r, r, len, color, {}, seg), x, y, z, PI / 2)

/** 两端已知的 3D 圆杆 */
function bar(a: V3, b: V3, r: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 两端已知的方管：截面 w（x 向）× t */
function beam(a: V3, b: V3, w: number, t: number, color: string, r = 0.6) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = rbox(w, va.distanceTo(vb), t, color, {}, r)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** xy 平面里的形状挤出成板，厚 t（z 居中） */
function extrudeXY(shape: THREE.Shape, t: number, color: string, bevel = 0.3) {
  const b = Math.min(bevel, t * 0.3)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, t - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 28,
  })
  geo.translate(0, 0, -t / 2 + b)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// 轮廓（xy 平面，y0 为底）
function archOutline<T extends THREE.Path>(p: T, w: number, h: number, y0 = 0): T {
  const r = w / 2
  p.moveTo(-r, y0)
  p.lineTo(r, y0)
  p.lineTo(r, y0 + h - r)
  p.absarc(0, y0 + h - r, r, 0, PI, false)
  p.lineTo(-r, y0)
  return p
}
function rrOutline<T extends THREE.Path>(p: T, w: number, h: number, r: number, y0 = 0): T {
  const x0 = -w / 2
  const x1 = w / 2
  const y1 = y0 + h
  r = Math.min(r, w / 2, h / 2)
  p.moveTo(x0 + r, y0)
  p.lineTo(x1 - r, y0)
  p.absarc(x1 - r, y0 + r, r, -PI / 2, 0, false)
  p.lineTo(x1, y1 - r)
  p.absarc(x1 - r, y1 - r, r, 0, PI / 2, false)
  p.lineTo(x0 + r, y1)
  p.absarc(x0 + r, y1 - r, r, PI / 2, PI, false)
  p.lineTo(x0, y0 + r)
  p.absarc(x0 + r, y0 + r, r, PI, PI * 1.5, false)
  return p
}
function ellOutline<T extends THREE.Path>(p: T, rx: number, ry: number, cy = 0): T {
  p.absellipse(0, cy, rx, ry, 0, PI * 2, false, 0)
  return p
}

/** 两道斜向高光条（贴在镜面 / 玻璃前 0.3 以上） */
function shine(cx: number, cy: number, m: number, z: number) {
  const g = new THREE.Group()
  const a = -0.62
  const strip = (len: number, wd: number) => {
    const s = rbox(wd, len, 0.3, '#ffffff', {}, Math.min(0.12, wd * 0.3))
    s.material = toon('#ffffff', { emissive: 0.4 })
    return noOutline(s)
  }
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  g.add(P(strip(m * 0.55, Math.max(0.5, m * 0.07)), cx, cy, z, 0, 0, a))
  g.add(P(strip(m * 0.3, Math.max(0.35, m * 0.035)), cx + ux * m * 0.13, cy + uy * m * 0.13 - m * 0.04, z, 0, 0, a))
  return g
}

/** 镜面：给定轮廓，前表面 z = +0.3；高光区中心 (cx, cy)、尺度 m */
function mirrorGlass(shape: THREE.Shape, cx: number, cy: number, m: number) {
  const g = new THREE.Group()
  const gl = extrudeXY(shape, 0.6, MIR, 0)
  gl.material = toon(MIR, { emissive: 0.18 })
  g.add(noOutline(gl))
  g.add(shine(cx, cy, m, 0.75))
  return g
}

/** 带孔的框（xy 平面） */
function frameOf(outer: THREE.Shape, inner: THREE.Path, t: number, color: string) {
  outer.holes.push(inner)
  return extrudeXY(outer, t, color, 0.4)
}

// ======================================================================
// 健身
// ======================================================================

/** 六角包胶哑铃，轴沿 x，原点在底面中心 */
function dumbbellHex(len: number, r: number, head: string, handle: string, acc: string) {
  const g = new THREE.Group()
  const k = r * Math.cos(PI / 6)
  const hl = len * 0.28
  for (const s of [-1, 1]) {
    const hd = P(cyl(r, r, hl, head, {}, 6), s * (len / 2 - hl / 2), k, 0, 0, 0, PI / 2)
    g.add(hd)
    g.add(cylX(r * 0.45, 0.6, acc, s * (len / 2), k, 0, 16))
  }
  g.add(cylX(r * 0.32, len - 2 * hl + 1, handle, 0, k, 0, 16))
  return g
}

/** 电镀片哑铃，轴沿 x */
function dumbbellRound(len: number, r: number, plate: string, handle: string, acc: string) {
  const g = new THREE.Group()
  const tp = Math.max(1.6, r * 0.3)
  const radii = [r, r, r * 0.82]
  const end = len / 2
  g.add(cylX(Math.max(1.3, r * 0.2), len - 1, handle, 0, r, 0, 16))
  for (const s of [-1, 1]) {
    let x = end - 1.6
    g.add(cylX(r * 0.36, 1.6, acc, s * (end - 0.8), r, 0, 16))
    for (const rr of radii) {
      g.add(cylX(rr, tp, plate, s * (x - tp / 2), r, 0, 28))
      g.add(cylX(rr * 0.35, tp + 0.4, shade(plate, 0.12), s * (x - tp / 2), r, 0, 16))
      x -= tp + 0.15
    }
    g.add(cylX(r * 0.4, 1.2, acc, s * (x - 0.6), r, 0, 16))
  }
  return g
}

const DB_PALS: PalFlat[] = [
  ['modern', M.black, CHROME, M.char],
  ['industrial', I.iron, I.steel, I.rust],
  ['cute', C.pink, '#f2f2f2', C.lemon],
  ['cute', C.mint, '#f2f2f2', C.sky],
  ['retro', R.red, CHROME, R.mustard],
]

function adjustableDumbbell(p: string[]) {
  const [plate, handle, acc] = p
  const g = new THREE.Group()
  // 托架
  g.add(tray(42, 7, 22, 1.4, shade(plate, -0.08), { y: 0 }, 1))
  const cy = 11
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = s * (8.5 + i * 1.75)
      g.add(cylX(10 - (i % 2) * 0.4, 1.5, i % 2 ? shade(plate, 0.1) : plate, x, cy, 0, 28))
    }
    g.add(cylX(4.2, 1.6, acc, s * 20.1, cy, 0, 20))
    g.add(cylX(1.6, 1.0, handle, s * 21.2, cy, 0, 12))
  }
  g.add(cylX(1.7, 15, handle, 0, cy, 0, 16))
  g.add(cylX(2.1, 9, RUBBER, 0, cy, 0, 16))
  return g
}

/** 哑铃架：两层托盘 + 顶层平板 */
function dumbbellRack(p: string[]) {
  const [frame, head, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    g.add(rbox(4, 3, 45, frame, { x: sx * 38 }, 0.8))
    for (const sz of [-1, 1]) g.add(rbox(4, 71, 4, frame, { x: sx * 38, y: 3, z: sz * 18 }, 0.8))
  }
  g.add(rbox(80, 2, 40, frame, { y: 74 }, 0.8))
  for (const y of [12, 42]) {
    g.add(tray(72, 4, 38, 1.2, shade(frame, 0.1), { y }, 0.5))
    for (const sz of [-1, 1]) g.add(rbox(72, 2, 3, frame, { y: y - 2, z: sz * 17.5 }, 0.5))
  }
  // 下层 4 支大哑铃，上层 6 支小六角
  for (let i = 0; i < 4; i++) g.add(P(dumbbellRound(32, 7, head, CHROME, acc), -27 + i * 18, 13.2, 0, 0, PI / 2, 0))
  for (let i = 0; i < 6; i++) g.add(P(dumbbellHex(24, 4.4, i < 2 ? acc : head, CHROME, acc), -28 + i * 11.2, 43.2, 0, 0, PI / 2, 0))
  return g
}

function kettlebell(r: number) {
  return (p: string[]) => {
    const [body, handle, acc] = p
    const g = new THREE.Group()
    g.add(ball(r, body, { y: r * 0.92 }, [1, 0.92, 1]))
    g.add(cyl(r * 0.5, r * 0.55, 0.6, shade(body, -0.06), { y: 0 }, 24))
    const hr = r * 0.55
    const tube = Math.max(1, r * 0.12)
    const yc = r * 1.94
    g.add(torus(hr, tube, handle, { y: yc }, PI))
    for (const s of [-1, 1]) g.add(cyl(tube, tube, yc - r * 1.4, handle, { x: s * hr, y: r * 1.4 }, 10))
    g.add(cylZ(r * 0.32, 0.6, acc, 0, r * 0.9, r * 0.97, 20))
    return g
  }
}

/** 杠铃组：轴沿 x，中心在原点 */
function barbellG(len: number, plate: string, barC: string, small: string) {
  const g = new THREE.Group()
  g.add(cylX(1.4, len - 30, barC, 0, 0, 0, 12))
  for (const s of [-1, 1]) {
    g.add(cylX(3.6, 2, barC, s * (len / 2 - 26), 0, 0, 16))
    g.add(cylX(2.5, 24, barC, s * (len / 2 - 13), 0, 0, 16))
    g.add(cylX(22.5, 4.5, plate, s * (len / 2 - 22.8), 0, 0, 32))
    g.add(cylX(5, 5.1, shade(plate, 0.15), s * (len / 2 - 22.8), 0, 0, 20))
    g.add(cylX(16, 3, small, s * (len / 2 - 19.1), 0, 0, 32))
    g.add(cylX(3.6, 2.4, acc2(barC), s * (len / 2 - 16.2), 0, 0, 16))
  }
  return g
}
const acc2 = (c: string) => shade(c, -0.25)

function barbell(p: string[]) {
  const [plate, barC, small] = p
  return P(barbellG(160, plate, barC, small), 0, 22.5, 0)
}

/** 可调卧推凳，angle 为靠背仰角 */
function weightBench(angle: number) {
  return (p: string[]) => {
    const [pad, frame, acc] = p
    const g = new THREE.Group()
    // 前后脚
    g.add(rbox(50, 5, 8, frame, { z: 58.5 }, 1.5))
    g.add(rbox(46, 5, 8, frame, { z: -58.5 }, 1.5))
    for (const s of [-1, 1]) g.add(cylX(3, 3, RUBBER, s * 24.5, 3, -58.5, 16))
    g.add(rbox(7, 7, 117, frame, { y: 4 }, 1.2))
    // 座垫
    g.add(rbox(6, 28, 6, frame, { y: 10, z: 30 }, 1))
    g.add(rbox(16, 2, 26, frame, { y: 37, z: 30 }, 0.6))
    g.add(rbox(29, 7, 34, pad, { y: 38.5, z: 30 }, 3))
    // 靠背
    const back = new THREE.Group()
    back.add(rbox(16, 2, 70, frame, { y: -1.6, z: -38 }, 0.6))
    back.add(rbox(29, 7, 76, pad, { z: -39 }, 3))
    back.add(rbox(29.4, 1.2, 1.2, acc, { y: 2.9, z: -76.6 }, 0.4))
    P(back, 0, 38.5, 15, angle, 0, 0)
    g.add(back)
    // 靠背铰链座
    g.add(rbox(6, 28, 6, frame, { y: 10, z: 15 }, 1))
    // 靠背撑杆
    const sup = new THREE.Vector3(0, 0, -44).applyAxisAngle(new THREE.Vector3(1, 0, 0), angle).add(new THREE.Vector3(0, 36.9, 15))
    if (angle > 0.05) g.add(beam([0, 11, Math.min(sup.z + 12, -10)], [0, sup.y, sup.z], 5, 4, frame))
    else g.add(rbox(6, 26, 6, frame, { y: 10, z: -34 }, 1))
    // 前脚压腿滚筒
    g.add(cylX(5, 14, pad, -10, 22, 52, 20))
    g.add(cylX(5, 14, pad, 10, 22, 52, 20))
    g.add(cylX(1.2, 6, frame, 0, 22, 52, 10))
    g.add(rbox(5, 13, 5, frame, { y: 9, z: 52 }, 1))
    return g
  }
}
const BENCH_PALS: PalFlat[] = [
  ['modern', M.black, M.char, M.silver],
  ['industrial', I.leather, I.iron, I.rust],
  ['cute', C.pink, C.white, C.lemon],
  ['retro', R.red, '#cfd2d6', R.cream],
]

/** 深蹲架：全框 / 半架 */
function powerRack(full: boolean) {
  return (p: string[]) => {
    const [frame, plate, acc] = p
    const g = new THREE.Group()
    const px = 56
    const zs = full ? [-45, 45] : [10]
    for (const sx of [-1, 1]) {
      g.add(rbox(8, 5, full ? 120 : 110, frame, { x: sx * px }, 1))
      for (const z of zs) {
        g.add(rbox(6, 210, 6, frame, { x: sx * px, y: 5, z }, 0.8))
        // 挂孔
        for (let y = 40; y < 200; y += 10) g.add(noOutline(rbox(1.6, 1.6, 0.4, shade(frame, -0.2), { x: sx * px, y, z: z + 3.1 }, 0.3)))
      }
      if (full) {
        g.add(rbox(6, 6, 90, frame, { x: sx * px, y: 209, z: 0 }, 0.8))
        // 保护杠
        g.add(rbox(4, 4, 90, CHROME, { x: sx * (px - 5), y: 88, z: 0 }, 0.6))
        // 杠铃片挂杆 + 片
        g.add(rbox(6, 10, 6, frame, { x: sx * px, y: 25, z: -39 }, 0.8))
        g.add(cylX(2.4, 15, CHROME, sx * (px + 10.5), 30, -39, 16))
        g.add(cylX(22.5, 4.5, plate, sx * (px + 6.6), 30, -39, 32))
        g.add(cylX(16, 3, acc, sx * (px + 10.6), 30, -39, 32))
      } else {
        g.add(beam([sx * px, 5, -45], [sx * px, 90, 7], 5, 5, frame))
      }
      // J 钩
      g.add(rbox(4, 6, 7, CHROME, { x: sx * px, y: 136, z: zs[zs.length - 1] + (full ? -4.5 : 5) }, 0.8))
    }
    for (const z of zs) g.add(rbox(px * 2 + 6, 6, 6, frame, { y: full ? 209 : 2, z }, 0.8))
    if (full) {
      g.add(rbox(px * 2 + 6, 6, 6, frame, { y: 2, z: -45 }, 0.8))
      g.add(cylX(1.6, px * 2 + 14, CHROME, 0, 205, 51, 12))
      for (const s of [-1, 1]) g.add(rbox(6, 4, 8, frame, { x: s * px, y: 203, z: 49 }, 0.8))
    }
    g.add(P(barbellG(180, plate, CHROME, acc), 0, 143.4, zs[zs.length - 1] + (full ? -4.5 : 5)))
    return g
  }
}

function yogaMat(p: string[]) {
  const [mat, line] = p
  const g = new THREE.Group()
  g.add(rbox(61, 0.6, 173, mat, {}, 0.25))
  g.add(noOutline(rbox(1, 0.4, 160, line, { y: 0.5 }, 0.15)))
  for (const s of [-1, 1]) g.add(noOutline(rbox(50, 0.4, 1, line, { y: 0.5, z: s * 76 }, 0.15)))
  return g
}

function yogaMatRolled(p: string[]) {
  const [mat, line, strap] = p
  const g = new THREE.Group()
  g.add(cylX(6.5, 61, mat, 0, 6.5, 0, 28))
  for (const s of [-1, 1])
    for (const r of [1.6, 3.3, 5]) g.add(noOutline(P(torus(r, 0.22, shade(mat, -0.15)), s * 30.55, 6.5, 0, 0, PI / 2, 0)))
  void line
  for (const x of [-18, 18]) g.add(P(torus(6.75, 0.4, strap, {}, PI), x, 6.5, 0, 0, PI / 2, 0))
  return g
}

function yogaBall(p: string[]) {
  const [main, band, acc] = p
  const g = new THREE.Group()
  g.add(ball(32, main, { y: 32.5 }))
  for (let i = 0; i < 3; i++) g.add(P(torus(32, 0.5, band), 0, 32.5, 0, 0, (i * PI) / 3, 0))
  g.add(cylZ(1.2, 1, acc, 0, 46, 29.1))
  return g
}

function foamRoller(p: string[]) {
  const [core, bump] = p
  const g = new THREE.Group()
  g.add(cylX(6.6, 33, core, 0, 7.4, 0, 24))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + (i % 2) * 0.2
    for (let j = 0; j < 5; j++) {
      const x = -12.8 + j * 6.4 + (i % 2 ? 3.2 : 0)
      if (Math.abs(x) > 14) continue
      g.add(P(rbox(3.6, 1.2, 3.4, bump, {}, 0.45), x, 7.4 + Math.cos(a) * 6.8, Math.sin(a) * 6.8, a))
    }
  }
  return g
}

function resistanceBands(p: string[]) {
  const g = new THREE.Group()
  p.forEach((c, i) => {
    const m = torus(9, 0.8, c)
    m.scale.set(1.3, 0.7, 0.5)
    g.add(P(m, -2.8 + i * 3, 0.4 + i * 0.85, -1.8 + i * 1.5, PI / 2, 0, 0.15 * i))
  })
  return g
}

function jumpRope(p: string[]) {
  const [rope, handle, acc] = p
  const g = new THREE.Group()
  for (const [x, z, r] of [[3, 0.2, 8.5], [6, -1.8, 7]] as const) {
    const t = torus(r, 0.35, rope)
    g.add(P(t, x, 0.35 + (r === 7 ? 0.7 : 0), z, PI / 2, 0, 0))
  }
  for (const s of [-1, 1]) {
    g.add(P(capsule(1.3, 9, handle), -7.8, 1.45, s * 3.2, 0, 0, PI / 2))
    g.add(cylX(1.45, 0.8, acc, -2.2, 1.45, s * 3.2, 14))
  }
  return g
}

function pushupBars(p: string[]) {
  const [frame, grip, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * 13
    for (const sz of [-1, 1]) {
      g.add(rbox(12, 2, 3, frame, { x, z: sz * 8 }, 0.8))
      g.add(cyl(1.4, 1.6, 9.5, frame, { x, y: 1.8, z: sz * 8 }, 12))
      g.add(rbox(10, 0.4, 2.6, acc, { x, y: -0.1, z: sz * 8 }, 0.15))
    }
    g.add(cylZ(1.5, 19, frame, x, 11.5, 0, 14))
    g.add(cylZ(2.2, 11, grip, x, 11.5, 0, 16))
  }
  return g
}

function abWheel(p: string[]) {
  const [wheel, grip, hub] = p
  const g = new THREE.Group()
  const cy = 9.5
  g.add(cylX(8.4, 6, wheel, 0, cy, 0, 28))
  g.add(P(torus(8.2, 1.3, RUBBER), 0, cy, 0, 0, PI / 2, 0))
  g.add(cylX(4, 6.6, hub, 0, cy, 0, 20))
  g.add(cylX(1.2, 22, CHROME, 0, cy, 0, 12))
  for (const s of [-1, 1]) {
    g.add(cylX(2, 10, grip, s * 12, cy, 0, 16))
    g.add(cylX(2.3, 0.8, hub, s * 16.6, cy, 0, 16))
  }
  return g
}

/** 门框引体向上杆（勾在门框上），mount 为把手高度 */
const PULLUP_MOUNT = 190
function pullupBar(p: string[]) {
  const [frame, grip, acc] = p
  const g = new THREE.Group()
  const y0 = PULLUP_MOUNT
  // 前把手
  g.add(cylX(1.6, 72, frame, 0, y0 + 2.4, 10, 14))
  for (const s of [-1, 1]) {
    g.add(cylX(2.2, 14, grip, s * 27, y0 + 2.4, 10, 16))
    // 外侧宽握
    g.add(bar([s * 36, y0 + 2.4, 10], [s * 46, y0 + 8, 6], 1.6, frame))
    g.add(P(capsule(2.1, 6, grip), s * 43, y0 + 6.5, 7.5, 0, 0, s * -1.05))
    // 侧边勾臂：前 → 上后方 → 门框后方下勾
    g.add(bar([s * 33, y0 + 2.4, 10], [s * 33, y0 + 19, -6], 1.6, frame))
    g.add(bar([s * 33, y0 + 19, -6], [s * 33, y0 + 19, -10.7], 1.6, frame))
    g.add(bar([s * 33, y0 + 19, -10.7], [s * 33, y0 + 10, -10.7], 1.6, frame))
    g.add(rbox(5, 4, 2, acc, { x: s * 33, y: y0 + 9, z: -11.3 }, 0.6))
    g.add(rbox(5, 2.4, 6, acc, { x: s * 33, y: y0 + 19, z: -8.5 }, 0.6))
  }
  return g
}

/** 跑步机：控制台在 -z（面向墙跑） */
function treadmill(W: number, D: number, H: number, gym: boolean) {
  return (p: string[]) => {
    const [body, belt, acc] = p
    const g = new THREE.Group()
    const railW = gym ? 10 : 7
    const deckH = gym ? 18 : 13
    const hoodD = gym ? 40 : 30
    const z0 = -D / 2
    const zA = z0 + hoodD - 2
    const len = D / 2 - zA
    const zc = (zA + D / 2) / 2
    for (const s of [-1, 1]) {
      g.add(rbox(railW, deckH, len, body, { x: s * (W / 2 - railW / 2), z: zc }, 1.5))
      g.add(rbox(railW - 2, 0.6, len - 6, shade(body, 0.12), { x: s * (W / 2 - railW / 2), y: deckH - 0.3, z: zc }, 0.2))
    }
    g.add(rbox(W - 2 * railW - 0.6, 2, len - 4, belt, { y: deckH - 3, z: zc }, 0.6))
    g.add(rbox(W - 2 * railW - 0.6, deckH - 3, len - 4, shade(body, -0.15), { y: 0.5, z: zc }, 0.6))
    // 后滚筒盖
    g.add(rbox(W - 2 * railW - 0.6, 5, 4, body, { y: deckH - 5, z: D / 2 - 2 }, 1.5))
    // 电机罩
    g.add(rbox(W, deckH + 6, hoodD, body, { z: z0 + hoodD / 2 }, 3))
    g.add(rbox(W * 0.5, 1.2, 0.6, acc, { y: deckH + 1, z: z0 + hoodD + 0.1 }, 0.3))
    // 立柱 + 控制台
    const uz = z0 + hoodD * 0.45
    const topY = H - 16
    const tz = uz + (gym ? 8 : 6)
    for (const s of [-1, 1]) g.add(beam([s * (W / 2 - railW / 2), deckH + 4, uz], [s * (W / 2 - railW / 2), topY, tz], railW - 3, 6, body))
    const con = new THREE.Group()
    const cd = gym ? 28 : 20
    con.add(rbox(W - 2, 12, cd, shade(body, 0.08), {}, 3))
    con.add(glow(W * 0.45, gym ? 9 : 6.5, SCREEN, { y: 2.5, z: cd / 2 + 0.2 }, 0.5))
    con.add(glow(W * 0.12, 2, acc, { x: -W * 0.32, y: 5, z: cd / 2 + 0.2 }, 0.6))
    con.add(glow(W * 0.12, 2, acc, { x: W * 0.32, y: 5, z: cd / 2 + 0.2 }, 0.6))
    P(con, 0, topY, tz + 2, -0.35, 0, 0)
    g.add(con)
    // 扶手
    const hy = topY - 8
    const hl = gym ? 60 : 36
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - railW / 2)
      g.add(bar([x, hy, tz], [x, hy, tz + hl], 2, body))
      g.add(bar([x, hy, tz + hl * 0.35], [x, hy, tz + hl], 2.5, RUBBER))
      if (gym) g.add(bar([x, hy, tz + hl], [x, deckH, tz + hl + 22], 2, body))
    }
    return g
  }
}
const TREAD_PALS: PalFlat[] = [
  ['modern', M.char, RUBBER, '#5ac8fa'],
  ['industrial', I.iron, RUBBER, I.rust],
  ['cute', C.white, '#5b5d66', C.pink],
  ['nordic', N.white, '#55585e', N.sage],
]

function spinBike(p: string[]) {
  const [frame, fly, seat] = p
  const g = new THREE.Group()
  for (const z of [-53.5, 53.5]) {
    g.add(rbox(55, 5, 8, frame, { z }, 2))
  }
  for (const s of [-1, 1]) g.add(cylX(2.5, 3, RUBBER, s * 22, 2.5, -57.5 + 2.5, 14))
  g.add(rbox(7, 6, 104, frame, { y: 3 }, 1.2))
  // 飞轮
  g.add(cylX(21, 5, fly, 0, 29, -26, 36))
  g.add(cylX(7, 5.6, shade(fly, -0.2), 0, 29, -26, 20))
  g.add(cylX(21.3, 1.4, RUBBER, -3.4, 29, -26, 36))
  // 车架
  g.add(beam([0, 8, -44], [0, 100.5, -46], 6, 6, frame))
  g.add(beam([0, 8, 26], [0, 80, 18], 6, 6, frame))
  g.add(beam([0, 70, -45], [0, 62, 19], 6, 6, frame))
  // 曲柄座的横梁：从飞轮轴穿过曲柄接到座管上（以前曲柄和脚踏整组悬空）
  g.add(beam([0, 30, -20], [0, 30, 23.5], 4, 4, frame))
  g.add(beam([0, 78, 18], [0, 92, 20], 3.5, 3.5, CHROME))
  g.add(rbox(16, 5, 27, seat, { y: 91, z: 22 }, 2.2))
  // 车把
  g.add(cylX(1.6, 48, frame, 0, 101, -46, 12))
  for (const s of [-1, 1]) {
    g.add(cylZ(1.6, 22, frame, s * 23.2, 101, -36, 12))
    g.add(cylZ(2.1, 12, RUBBER, s * 23.2, 101, -31, 12))
  }
  // 表头坐在立管顶上（以前离立管 6cm 悬空）
  g.add(rbox(14, 9, 3, shade(frame, 0.15), { y: 101.5, z: -48 }, 1))
  g.add(glow(10, 5, SCREEN, { y: 103.5, z: -46.2 }, 0.5))
  g.add(cyl(2.2, 2.2, 4, fly, { y: 70, z: -30 }, 14))
  // 曲柄脚踏
  g.add(cylX(7, 10.4, shade(frame, 0.1), 0, 30, 4, 24))
  for (const s of [-1, 1]) {
    const dz = s * 9
    g.add(beam([s * 6, 30, 4], [s * 6, 30 + dz * 0.6, 4 + dz * 0.8], 1.8, 2, CHROME))
    g.add(rbox(10, 2, 6, RUBBER, { x: s * 11, y: 29 + dz * 0.6, z: 4 + dz * 0.8 }, 0.6))
  }
  return g
}
const BIKE_PALS: PalFlat[] = [
  ['modern', M.black, CHROME, M.char],
  ['industrial', I.iron, I.steel, I.leather],
  ['cute', C.white, C.pink, C.sky],
  ['retro', R.red, CHROME, R.cream],
]

function rower(p: string[]) {
  const [frame, fly, seat] = p
  const g = new THREE.Group()
  g.add(rbox(55, 4, 8, frame, { z: -99 }, 1.5))
  g.add(rbox(44, 4, 8, frame, { z: 99 }, 1.5))
  g.add(rbox(8, 26, 6, frame, { y: 4, z: 97 }, 1))
  // 导轨
  g.add(beam([0, 30, 100], [0, 24, -60], 9, 5, CHROME, 1))
  // 风阻轮罩
  g.add(cylX(24, 22, fly, 0, 30, -78, 36))
  g.add(cylX(10, 22.6, shade(fly, -0.2), 0, 30, -78, 24))
  g.add(cylX(24.4, 2, frame, -10.8, 30, -78, 36))
  g.add(cylX(24.4, 2, frame, 10.8, 30, -78, 36))
  g.add(beam([0, 4, -99], [0, 20, -78], 10, 6, frame))
  // 显示器臂
  g.add(beam([0, 50, -72], [0, 76, -52], 3, 3, frame))
  g.add(rbox(18, 14, 4, frame, { y: 70, z: -51 }, 1.2))
  g.add(glow(14, 9, SCREEN, { y: 72.5, z: -48.8 }, 0.5))
  // 脚踏
  for (const s of [-1, 1]) {
    g.add(P(rbox(11, 3, 26, frame, {}, 1), s * 9, 32, -46, -1.0, 0, 0))
    g.add(P(rbox(9, 1.4, 6, seat, {}, 0.5), s * 9, 34, -49, -1.0, 0, 0))
  }
  // 拉手
  g.add(cylX(1.4, 44, frame, 0, 42, -60, 12))
  for (const s of [-1, 1]) g.add(cylX(1.9, 11, RUBBER, s * 15, 42, -60, 12))
  // 座椅
  g.add(rbox(14, 2.4, 22, CHROME, { y: 28.2, z: 30 }, 0.6))
  g.add(rbox(28, 6, 30, seat, { y: 30.4, z: 30 }, 2.5))
  return g
}

function elliptical(p: string[]) {
  const [frame, cover, acc] = p
  const g = new THREE.Group()
  g.add(rbox(60, 5, 8, frame, { z: -76 }, 2))
  g.add(rbox(60, 5, 8, frame, { z: 76 }, 2))
  g.add(rbox(10, 6, 150, frame, { y: 2 }, 1.5))
  // 后飞轮罩
  g.add(cylX(24, 22, cover, 0, 30, 52, 36))
  g.add(cylX(10, 22.6, acc, 0, 30, 52, 24))
  // 前立柱 + 控制台
  g.add(beam([0, 6, -66], [0, 132, -58], 8, 7, frame))
  g.add(P(rbox(30, 10, 16, cover, {}, 2.5), 0, 128, -56, -0.4, 0, 0))
  g.add(P(glow(20, 6, SCREEN, { y: 2.5, z: 8.2 }, 0.5), 0, 128, -56, -0.4, 0, 0))
  g.add(cylX(1.6, 30, frame, 0, 118, -55, 12))
  for (const s of [-1, 1]) {
    const x = s * 13
    // 脚踏连杆
    g.add(beam([x, 30, 52], [x, 26, -36], 4, 5, CHROME, 0.8))
    g.add(rbox(14, 3, 34, RUBBER, { x, y: 28.5, z: -12 }, 1))
    // 摆臂
    g.add(bar([x, 26, -36], [s * 27, 95, -58], 2, frame))
    g.add(bar([s * 27, 95, -58], [s * 27, 160, -50], 2, frame))
    g.add(bar([s * 27, 125, -55], [s * 27, 158, -50], 2.6, RUBBER))
    g.add(cylX(3, 6, frame, s * 27, 95, -58, 14))
    // 曲柄轴头比连杆宽一点，两侧面不和连杆共面
    g.add(cylX(3.5, 4.8, acc, x, 30, 52 + s * 0.01, 14))
  }
  g.add(rbox(60, 6, 6, frame, { y: 92, z: -61 }, 1))
  return g
}

function bodyScale(p: string[]) {
  const [glass, base, disp] = p
  const g = new THREE.Group()
  g.add(rbox(29, 1.2, 29, base, { y: 0 }, 0.5))
  g.add(rbox(30, 1.0, 30, glass, { y: 1.1 }, 0.4))
  g.add(noOutline(lit(rbox(8, 0.5, 3, '#3a3d44', { y: 1.9, z: 10 }, 0.15), '#3a3d44', 0.1)))
  g.add(noOutline(lit(rbox(5, 0.3, 1.6, disp, { y: 2.2, z: 10 }, 0.1), disp, 0.7)))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(noOutline(rbox(6, 0.4, 9, CHROME, { x: sx * 7.5, y: 1.95, z: sz * 6.5 - 1 }, 0.15)))
  return g
}

function punchingBagStand(p: string[]) {
  const [bag, base, band] = p
  const g = new THREE.Group()
  g.add(puck(28, 24, base))
  g.add(torus(25.5, 1.2, band, { y: 20, rx: PI / 2 }))
  g.add(cyl(7, 7, 4, CHROME, { y: 23.5 }, 20))
  for (let i = 0; i < 6; i++) g.add(P(torus(5.2, 1, CHROME), 0, 28.5 + i * 2.3, 0, PI / 2, 0, 0))
  g.add(cyl(8, 8, 4, CHROME, { y: 40 }, 20))
  g.add(capsule(17, 88, bag, { y: 43 }))
  g.add(cyl(17.3, 17.3, 7, band, { y: 104 }, 28))
  return g
}

const BAG_MOUNT = 70
function punchingBagHang(p: string[]) {
  const [bag, frame, band] = p
  const g = new THREE.Group()
  const y = BAG_MOUNT
  const z0 = -31
  g.add(rbox(20, 30, 2, frame, { y: y + 130, z: z0 + 1 }, 0.6))
  g.add(rbox(6, 6, 46, frame, { y: y + 154, z: z0 + 2 + 23 }, 1))
  g.add(beam([0, y + 133, z0 + 2], [0, y + 154, z0 + 30], 4, 4, frame))
  g.add(cyl(1, 1, 5, CHROME, { y: y + 149, z: 14 }, 8))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    g.add(bar([0, y + 149.5, 14], [Math.cos(a) * 13, y + 119, 14 + Math.sin(a) * 13], 0.35, CHROME, 6))
  }
  g.add(capsule(17, 85, bag, { y, z: 14 }))
  g.add(cyl(17.3, 17.3, 6, band, { y: y + 70, z: 14 }, 28))
  g.add(cyl(17.3, 17.3, 3, band, { y: y + 15, z: 14 }, 28))
  return g
}

function floorTiles(p: string[]) {
  const [a, b, edge] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const c = sx * sz > 0 ? a : b
      g.add(rbox(59.6, 1.2, 59.6, c, { x: sx * 30, z: sz * 30 }, 0.4))
      // 表面防滑纹
      for (let i = 0; i < 3; i++) g.add(noOutline(rbox(46, 0.5, 1.2, shade(c, -0.05), { x: sx * 30, y: 0.95, z: sz * 30 - 15 + i * 15 }, 0.2)))
    }
  // 外圈锯齿收边
  for (let i = 0; i < 12; i++) {
    const t = -55 + i * 10
    g.add(rbox(5, 1.2, 2.4, edge, { x: t, z: 61.2 }, 0.3))
    g.add(rbox(5, 1.2, 2.4, edge, { x: t, z: -61.2 }, 0.3))
    g.add(rbox(2.4, 1.2, 5, edge, { x: 61.2, z: t }, 0.3))
    g.add(rbox(2.4, 1.2, 5, edge, { x: -61.2, z: t }, 0.3))
  }
  return g
}

const FITNESS: AssetDef[] = [
  def('fit-dumbbell-2', '哑铃', 'fitness', [22.6, 8.8, 7.6], DB_PALS, (p) => dumbbellHex(22, 4.4, p[0], p[1], p[2]), { ...PROP, family: 'dumbbell', sizeLabel: '2kg' }),
  def('fit-dumbbell-5', '哑铃', 'fitness', [30, 12, 12], DB_PALS, (p) => dumbbellRound(30, 6, p[0], p[1], p[2]), { ...PROP, family: 'dumbbell', sizeLabel: '5kg' }),
  def('fit-dumbbell-10', '哑铃', 'fitness', [36, 16, 16], DB_PALS, (p) => dumbbellRound(36, 8, p[0], p[1], p[2]), { ...PROP, family: 'dumbbell', sizeLabel: '10kg' }),
  def('fit-dumbbell-adj', '哑铃', 'fitness', [44.4, 22, 21], DB_PALS, adjustableDumbbell, { ...PROP, family: 'dumbbell', sizeLabel: '可调式' }),
  def(
    'fit-dumbbell-rack',
    '哑铃架',
    'fitness',
    [80, 45, 76],
    [
      ['industrial', I.iron, I.iron, I.rust],
      ['modern', M.black, M.char, M.silver],
      ['cute', C.white, C.pink, C.mint],
      ['nordic', N.white, N.gray, N.sage],
    ],
    dumbbellRack,
    { surface: 76 },
  ),
  ...([
    ['4kg', 6],
    ['8kg', 7.5],
    ['16kg', 9.5],
  ] as const).map(([lab, r]) =>
    def(
      `fit-kettlebell-${lab}`,
      '壶铃',
      'fitness',
      [2 * r, 2 * r, Math.round(26 * r) / 10],
      [
        ['industrial', I.iron, I.iron, I.rust],
        ['modern', M.black, M.black, M.silver],
        ['cute', C.pink, C.pink, C.white],
        ['cute', C.sky, C.sky, C.white],
        ['retro', R.mustard, R.mustard, R.cream],
      ],
      kettlebell(r),
      { ...PROP, family: 'kettlebell', sizeLabel: lab },
    ),
  ),
  def(
    'fit-barbell',
    '杠铃',
    'fitness',
    [160, 45, 45],
    [
      ['modern', M.black, CHROME, M.char],
      ['industrial', I.iron, I.steel, I.rust],
      ['retro', R.red, CHROME, R.mustard],
      ['cute', C.pink, CHROME, C.sky],
    ],
    barbell,
  ),
  def('fit-bench-flat', '卧推凳', 'fitness', [50, 125, 45.5], BENCH_PALS, weightBench(0), { family: 'weight-bench', sizeLabel: '平板' }),
  def('fit-bench-incline', '卧推凳', 'fitness', [50, 125, 92.2], BENCH_PALS, weightBench(0.7), { family: 'weight-bench', sizeLabel: '上斜' }),
  def(
    'fit-power-rack',
    '深蹲架',
    'fitness',
    [180, 120, 215],
    [
      ['industrial', I.iron, '#2b2b2d', I.rust],
      ['modern', M.black, M.char, M.silver],
      ['cute', C.white, C.pink, C.sky],
      ['retro', R.red, M.black, R.cream],
    ],
    powerRack(true),
    { family: 'power-rack', sizeLabel: '全框' },
  ),
  def(
    'fit-squat-stand',
    '深蹲架',
    'fitness',
    [180, 110, 215],
    [
      ['industrial', I.iron, '#2b2b2d', I.rust],
      ['modern', M.black, M.char, M.silver],
      ['cute', C.white, C.pink, C.sky],
      ['retro', R.red, M.black, R.cream],
    ],
    powerRack(false),
    { family: 'power-rack', sizeLabel: '半架' },
  ),
  def(
    'fit-yoga-mat',
    '瑜伽垫',
    'fitness',
    [61, 173, 0.9],
    [
      ['cute', C.lilac, C.white],
      ['cute', C.pink, C.white],
      ['nordic', N.sage, N.white],
      ['modern', M.char, M.light],
      ['japanese', J.ai, J.washi],
    ],
    yogaMat,
    { family: 'yoga-mat', sizeLabel: '铺开' },
  ),
  def(
    'fit-yoga-mat-rolled',
    '瑜伽垫',
    'fitness',
    [61.6, 14.3, 13.65],
    [
      ['cute', C.lilac, C.white, C.white],
      ['cute', C.pink, C.white, C.woodL],
      ['nordic', N.sage, N.white, N.linen],
      ['modern', M.char, M.light, M.black],
      ['japanese', J.ai, J.washi, J.wood],
    ],
    yogaMatRolled,
    { ...PROP, family: 'yoga-mat', sizeLabel: '卷起' },
  ),
  def(
    'fit-yoga-ball',
    '瑜伽球',
    'fitness',
    [65, 65, 65],
    [
      ['cute', C.sky, C.white, C.white],
      ['cute', C.pink, C.white, C.white],
      ['nordic', N.gray, N.white, N.white],
      ['modern', M.char, M.gray, M.black],
      ['retro', R.orange, R.cream, R.cream],
    ],
    yogaBall,
  ),
  def(
    'fit-foam-roller',
    '泡沫轴',
    'fitness',
    [33, 15, 15],
    [
      ['modern', M.black, M.char],
      ['cute', C.mint, C.sky],
      ['cute', C.pink, C.lilac],
      ['retro', R.orange, R.mustard],
      ['industrial', I.iron, I.rust],
    ],
    foamRoller,
    PROP,
  ),
  def(
    'fit-resistance-bands',
    '弹力带',
    'fitness',
    [31, 17.4, 2.5],
    [
      ['cute', C.pink, C.mint, C.lilac],
      ['modern', M.char, M.gray, M.light],
      ['retro', R.red, R.mustard, R.teal],
      ['nordic', N.sage, N.blue, N.mustard],
    ],
    resistanceBands,
    PROP,
  ),
  def(
    'fit-jump-rope',
    '跳绳',
    'fitness',
    [27.2, 18.3, 2.9],
    [
      ['cute', C.pink, C.white, C.lemon],
      ['modern', M.black, M.char, M.silver],
      ['retro', R.teal, R.cream, R.orange],
      ['industrial', I.iron, I.leather, I.rust],
    ],
    jumpRope,
    PROP,
  ),
  def(
    'fit-pushup-bars',
    '俯卧撑架',
    'fitness',
    [38, 19, 13.7],
    [
      ['modern', M.black, RUBBER, M.char],
      ['cute', C.pink, C.white, C.white],
      ['industrial', I.iron, I.leather, I.iron],
      ['retro', R.red, R.cream, R.red],
    ],
    pushupBars,
    PROP,
  ),
  def(
    'fit-ab-wheel',
    '腹肌轮',
    'fitness',
    [34, 19, 19],
    [
      ['modern', M.char, RUBBER, M.silver],
      ['cute', C.sky, C.white, C.pink],
      ['industrial', I.rust, I.leather, I.steel],
      ['retro', R.mustard, R.caramel, R.cream],
    ],
    abWheel,
    PROP,
  ),
  def(
    'fit-pullup-bar',
    '门框引体向上杆',
    'fitness',
    [96, 24.6, 21.2],
    [
      ['modern', M.black, RUBBER, M.char],
      ['industrial', I.iron, I.leather, I.rust],
      ['cute', C.white, C.pink, C.sky],
      ['nordic', N.gray, N.oak, N.white],
    ],
    pullupBar,
    { mount: PULLUP_MOUNT },
  ),
  def('fit-treadmill-home', '跑步机', 'fitness', [70, 160, 128], TREAD_PALS, treadmill(70, 160, 130, false), { family: 'treadmill', sizeLabel: '家用折叠' }),
  def('fit-treadmill-gym', '跑步机', 'fitness', [90, 205, 160], TREAD_PALS, treadmill(90, 205, 160, true), { family: 'treadmill', sizeLabel: '健身房款' }),
  def('fit-spin-bike', '动感单车', 'fitness', [55, 115, 113], BIKE_PALS, spinBike),
  def('fit-rower', '划船机', 'fitness', [55, 206, 84], BIKE_PALS, rower),
  def('fit-elliptical', '椭圆机', 'fitness', [60, 160, 160], TREAD_PALS, elliptical),
  def(
    'fit-scale',
    '体重秤',
    'fitness',
    [30, 30, 2.4],
    [
      ['modern', '#e9ecef', M.char, '#9be7ff'],
      ['modern', M.black, M.char, '#ff8a65'],
      ['cute', C.sakura, C.white, '#9be7ff'],
      ['nordic', N.white, N.oak, '#c8f5d2'],
    ],
    bodyScale,
    { ...PROP, family: 'body-scale', sizeLabel: '健身款' },
  ),
  def(
    'fit-punching-bag',
    '拳击沙袋',
    'fitness',
    [56, 56, 165],
    [
      ['industrial', I.leather, I.iron, I.iron],
      ['modern', M.black, M.char, '#e05a3a'],
      ['retro', R.red, R.cream, R.cream],
      ['cute', C.pink, C.white, C.white],
    ],
    punchingBagStand,
    { family: 'punching-bag', sizeLabel: '落地' },
  ),
  def(
    'fit-punching-bag-hang',
    '拳击沙袋',
    'fitness',
    [34, 62, 160],
    [
      ['industrial', I.leather, I.iron, I.iron],
      ['modern', M.black, M.char, '#e05a3a'],
      ['retro', R.red, M.char, R.cream],
      ['cute', C.pink, C.white, C.white],
    ],
    punchingBagHang,
    { family: 'punching-bag', sizeLabel: '吊挂', mount: BAG_MOUNT },
  ),
  def(
    'fit-floor-tiles',
    '健身拼接地垫',
    'fitness',
    [125, 125, 1.2],
    [
      ['modern', M.char, M.black, M.gray],
      ['cute', C.pink, C.sky, C.white],
      ['nordic', N.gray, N.linen, N.white],
      ['industrial', I.iron, '#4a4a4c', I.rust],
    ],
    floorTiles,
  ),
]

// ======================================================================
// 茶杯
// ======================================================================

/** cup 外壁在高度 y（相对杯底）处的半径 */
const rAt = (rTop: number, rBot: number, h: number, y: number) => rBot + ((rTop - rBot) * y) / h

function yunomi(p: string[]) {
  const [glaze, band, clay] = p
  const g = new THREE.Group()
  g.add(cyl(2.6, 2.7, 0.7, clay, {}, 24))
  g.add(cup(3.7, 3.1, 8.4, 0.45, glaze, { y: 0.6 }))
  for (const [y, t] of [[7.6, 0.16], [6.9, 0.1]] as const) g.add(torus(rAt(3.7, 3.1, 8.4, y - 0.6), t, band, { y, rx: PI / 2 }))
  g.add(cyl(3.05, 3.05, 0.3, TEA, { y: 7.3 }, 24))
  return g
}

function teacupSaucer(p: string[]) {
  const [porc, rim, dot] = p
  const g = new THREE.Group()
  g.add(cup(7.4, 4.6, 1.5, 0.4, porc))
  g.add(torus(7.1, 0.12, rim, { y: 1.4, rx: PI / 2 }))
  g.add(cyl(2.2, 2.3, 0.65, porc, { y: 0.35 }, 24))
  const y0 = 0.95
  g.add(cup(4.6, 2.6, 5.2, 0.35, porc, { y: y0 }))
  g.add(torus(rAt(4.6, 2.6, 5.2, 4.7) + 0.05, 0.12, rim, { y: y0 + 4.7, rx: PI / 2 }))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.5
    const rr = rAt(4.6, 2.6, 5.2, 2.8)
    g.add(noOutline(ball(0.4, dot, { x: Math.cos(a) * rr, y: y0 + 2.8, z: Math.sin(a) * rr }, [1, 1, 1])))
  }
  g.add(cyl(rAt(4.6, 2.6, 5.2, 4.3) - 0.42, rAt(4.6, 2.6, 5.2, 4.3) - 0.42, 0.3, BLACK_TEA, { y: y0 + 4.0 }, 28))
  g.add(torus(1.4, 0.35, porc, { x: rAt(4.6, 2.6, 5.2, 3.4) + 0.95, y: y0 + 3.3 }))
  return g
}

function glassTea(p: string[]) {
  const [tea, glass, tag] = p
  const g = new THREE.Group()
  g.add(cyl(3.0, 2.95, 6.4, tea, { y: 0.6 }, 24))
  g.add(ghost(cup(3.8, 3.4, 9.5, 0.4, glass), glass, 0.35))
  g.add(ghost(cyl(3.3, 3.3, 0.5, glass, { y: 0.05 }, 24), glass, 0.4))
  g.add(bar([2.6, 7.0, 0.4], [3.75, 9.5, 0.4], 0.06, '#f4f0e6', 4))
  g.add(bar([3.9, 9.5, 0.4], [3.85, 6.2, 0.4], 0.06, '#f4f0e6', 4))
  g.add(rbox(1.6, 2, 0.3, tag, { x: 3.85, y: 4.2, z: 0.4, ry: PI / 2 }, 0.1))
  return g
}

function gaiwan(p: string[]) {
  const [porc, pat, acc] = p
  const g = new THREE.Group()
  g.add(cup(5.5, 3.6, 1.0, 0.35, porc))
  g.add(torus(5.25, 0.12, pat, { y: 0.95, rx: PI / 2 }))
  g.add(cyl(2.0, 2.2, 0.55, porc, { y: 0.3 }, 24))
  g.add(cup(4.8, 2.3, 4.2, 0.3, porc, { y: 0.8 }))
  g.add(torus(rAt(4.8, 2.3, 4.2, 2.4) + 0.05, 0.14, pat, { y: 3.2, rx: PI / 2 }))
  // 盖
  g.add(cyl(3.6, 4.65, 1.2, porc, { y: 4.6 }, 28))
  g.add(torus(4.2, 0.12, pat, { y: 5.15, rx: PI / 2 }))
  g.add(cyl(1.0, 0.85, 0.7, porc, { y: 5.75 }, 16))
  g.add(cyl(1.1, 1.1, 0.35, acc, { y: 6.4 }, 16))
  return g
}

function aromaSet(p: string[]) {
  const [porc, band, wood] = p
  const g = new THREE.Group()
  g.add(tray(16, 1.2, 8, 0.5, wood, {}, 0.3))
  g.add(cup(1.6, 1.4, 5.6, 0.25, porc, { x: -3.6, y: 0.5 }))
  g.add(torus(1.62, 0.1, band, { x: -3.6, y: 5.4, rx: PI / 2 }))
  g.add(cup(2.9, 1.5, 3.0, 0.25, porc, { x: 3.4, y: 0.5 }))
  g.add(torus(2.9, 0.1, band, { x: 3.4, y: 3.38, rx: PI / 2 }))
  g.add(cyl(2.55, 2.55, 0.2, BLACK_TEA, { x: 3.4, y: 2.9 }, 24))
  return g
}

function latteCup(p: string[]) {
  const [porc, saucerC, foam] = p
  const g = new THREE.Group()
  g.add(cup(8, 5, 1.4, 0.4, saucerC))
  g.add(cyl(2.8, 3.0, 0.65, porc, { y: 0.35 }, 24))
  const y0 = 0.95
  g.add(cup(5.8, 3.0, 5.8, 0.4, porc, { y: y0 }))
  const ri = rAt(5.8, 3.0, 5.8, 5.0) - 0.45
  g.add(cyl(ri, ri, 0.3, COFFEE, { y: y0 + 4.7 }, 28))
  const ty = y0 + 5.0
  for (const s of [-1, 1]) g.add(noOutline(ball(1.3, foam, { x: s * 0.85, y: ty + 0.05, z: -0.4 }, [1, 0.2, 1])))
  g.add(noOutline(P(rbox(1.9, 0.35, 1.9, foam, {}, 0.15), 0, ty + 0.05, 0.55, 0, PI / 4, 0)))
  g.add(torus(1.5, 0.38, porc, { x: rAt(5.8, 3.0, 5.8, 3.5) + 0.9, y: y0 + 3.4 }))
  return g
}

function guinomi(p: string[]) {
  const [glaze, drip, clay] = p
  const g = new THREE.Group()
  g.add(cyl(2.0, 2.1, 0.45, clay, {}, 18))
  g.add(cup(3.2, 2.6, 4.5, 0.6, glaze, { y: 0.4 }))
  g.add(torus(3.05, 0.3, drip, { y: 4.6, rx: PI / 2 }))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.3
    const len = 0.8 + (i % 3) * 0.5
    const y = 4.6 - len - 0.6
    const rr = rAt(3.2, 2.6, 4.5, y + len / 2 - 0.4) - 0.1
    g.add(capsule(0.26, len, drip, { x: Math.cos(a) * rr, y, z: Math.sin(a) * rr }))
  }
  g.add(cyl(2.45, 2.45, 0.2, '#f3ecd0', { y: 3.6 }, 20))
  return g
}

function teaTraySet(p: string[]) {
  const [wood, pot, cupC] = p
  const g = new THREE.Group()
  g.add(rbox(34, 3, 22, wood, {}, 1))
  for (let i = 0; i < 9; i++) g.add(rbox(31, 0.7, 1.6, shade(wood, 0.08), { y: 2.8, z: -8 + i * 2 }, 0.25))
  const y = 3.5
  // 紫砂壶
  const tx = -9
  g.add(cyl(2.4, 2.6, 0.5, pot, { x: tx, y, z: -3 }, 20))
  g.add(ball(4, pot, { x: tx, y: y + 3.6, z: -3 }, [1, 0.8, 1]))
  g.add(cyl(1.8, 2.0, 0.6, pot, { x: tx, y: y + 6.6, z: -3 }, 20))
  g.add(ball(0.6, pot, { x: tx, y: y + 7.4, z: -3 }))
  g.add(bar([tx + 3.4, y + 3.2, -3], [tx + 6.4, y + 6.0, -3], 0.55, pot, 10))
  g.add(torus(1.9, 0.45, pot, { x: tx - 4.6, y: y + 3.8, z: -3 }))
  // 公道杯
  g.add(cyl(2.0, 2.0, 3.6, BLACK_TEA, { x: -1.5, y: y + 0.4, z: 5 }, 20))
  g.add(ghost(cup(2.6, 2.4, 6, 0.25, '#e4f4ff', { x: -1.5, y, z: 5 }), '#e4f4ff', 0.35))
  // 品茗杯 ×4
  for (const [x, z] of [[5, -4], [10.5, -4], [5, 3.5], [10.5, 3.5]] as const) {
    g.add(cyl(1.0, 1.1, 0.4, cupC, { x, y, z }, 16))
    g.add(cup(2.2, 1.3, 2.4, 0.2, cupC, { x, y: y + 0.35, z }))
    g.add(cyl(1.85, 1.85, 0.2, BLACK_TEA, { x, y: y + 1.9, z }, 18))
  }
  return g
}

const CUPS: AssetDef[] = [
  def(
    'cup-yunomi',
    '汤吞茶杯',
    'kitchenware',
    [7.9, 7.9, 9],
    [
      ['japanese', '#3d5a80', '#f6f0e1', '#c8a27a'],
      ['japanese', '#6b8f71', J.sumi, '#c8a27a'],
      ['japanese', '#9a5a32', '#e9d2a6', '#b88a5a'],
      ['japanese', '#f2ece0', '#d65a3c', '#c8a27a'],
      ['cute', C.sakura, C.white, C.woodL],
    ],
    yunomi,
    { ...PROP, fx: [{ kind: 'steam', x: 0, y: 9, z: 0, scale: 0.6 }] },
  ),
  def(
    'cup-teacup-saucer',
    '红茶杯碟',
    'kitchenware',
    [14.8, 14.8, 6.2],
    [
      ['cute', C.white, '#e0b04a', C.pink],
      ['nordic', N.white, N.blue, N.blue],
      ['retro', R.cream, R.teal, R.orange],
      ['modern', M.white, M.black, M.black],
    ],
    teacupSaucer,
    { ...PROP, fx: [{ kind: 'steam', x: 0, y: 6.2, z: 0, scale: 0.7 }] },
  ),
  def(
    'cup-glass-tea',
    '玻璃茶杯',
    'kitchenware',
    [7.9, 7.6, 9.5],
    [
      ['japanese', TEA, '#e4f4ff', J.washi],
      ['modern', BLACK_TEA, '#eef6fb', M.white],
      ['cute', '#f2a6b8', '#f4f0ff', C.pink],
      ['nordic', '#e5c06a', '#eef6fb', N.sage],
      ['retro', '#c8473a', '#f4f0e0', R.mustard],
    ],
    glassTea,
    { ...PROP, fx: [{ kind: 'steam', x: 0, y: 9.5, z: 0, scale: 0.6 }] },
  ),
  def(
    'cup-gaiwan',
    '盖碗',
    'kitchenware',
    [11, 11, 6.75],
    [
      ['japanese', '#f6f3ea', J.ai, J.ai],
      ['nordic', '#bcd3c2', '#eef3ee', '#eef3ee'],
      ['retro', R.cream, R.red, R.mustard],
      ['modern', M.white, M.black, M.black],
      ['cute', C.white, C.pink, C.mint],
    ],
    gaiwan,
    PROP,
  ),
  def(
    'cup-aroma-set',
    '闻香杯组',
    'kitchenware',
    [16, 8, 6.1],
    [
      ['japanese', '#f6f3ea', J.ai, J.dark],
      ['retro', '#8b4a2b', '#e0a526', R.caramel],
      ['nordic', '#bcd3c2', N.white, N.oak],
      ['modern', M.black, M.silver, M.walnut],
    ],
    aromaSet,
    { ...PROP, fx: [{ kind: 'steam', x: 3.4, y: 3.5, z: 0, scale: 0.5 }] },
  ),
  def(
    'cup-latte',
    '拿铁杯碟',
    'kitchenware',
    [16, 16, 6.75],
    [
      ['nordic', N.white, N.oakL, '#fff8ee'],
      ['retro', R.mustard, R.cream, '#fff8ee'],
      ['cute', C.sky, C.white, '#fff8ee'],
      ['modern', M.char, M.char, '#fff8ee'],
      ['industrial', '#8a8580', I.walnut, '#fff8ee'],
    ],
    latteCup,
    { ...PROP, fx: [{ kind: 'steam', x: 0, y: 6.75, z: 0, scale: 0.7 }] },
  ),
  def(
    'cup-guinomi',
    'ぐい呑み小酒杯',
    'kitchenware',
    [6.6, 6.6, 4.9],
    [
      ['japanese', '#6e4f37', '#e9d2a6', '#b88a5a'],
      ['japanese', J.sumi, '#9fb4c7', '#a08060'],
      ['japanese', '#e9e2d0', '#6b8f71', '#c8a27a'],
      ['retro', R.caramel, R.cream, '#a08060'],
    ],
    guinomi,
    PROP,
  ),
  def(
    'cup-tea-tray-set',
    '功夫茶盘套组',
    'kitchenware',
    [34, 22, 11.5],
    [
      ['japanese', J.dark, '#8b4a2b', '#f6f3ea'],
      ['nordic', N.oak, N.gray, N.white],
      ['modern', M.black, M.char, M.white],
      ['retro', R.caramel, '#8b4a2b', R.cream],
    ],
    teaTraySet,
    { ...PROP, fx: [{ kind: 'steam', x: 5, y: 6.2, z: 3.5, scale: 0.4 }, { kind: 'steam', x: 10.5, y: 6.2, z: -4, scale: 0.4 }] },
  ),
]

// ======================================================================
// 爱好 / 模型
// ======================================================================

/** 把 g 在 xz 上居中（不动 y）：造型不对称的素材用 */
function centered(g: THREE.Group) {
  g.updateMatrixWorld(true)
  const c = new THREE.Box3().setFromObject(g, true).getCenter(new THREE.Vector3())
  const out = new THREE.Group()
  g.position.x -= c.x
  g.position.z -= c.z
  out.add(g)
  return out
}

/** xy 平面的薄片（尾翼等），pts 为 [x, y] */
function finXY(pts: [number, number][], t: number, color: string) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  return extrudeXY(s, t, color, 0.12)
}

/** 机翼：xz 平面的多边形（右翼 z>0），自动镜像出左翼 */
function wings(poly: Poly, t: number, color: string, y: number) {
  const g = new THREE.Group()
  g.add(slab(poly, t, color, y))
  g.add(slab(poly.map(([x, z]): [number, number] => [x, -z]).reverse(), t, color, y))
  return g
}

const FIL_COLORS = ['#ff7a59', '#5ac8fa', '#a6e3a1', '#ffe08f', '#cfb8f3', '#f4f4f2', '#3d3f44', '#ff9ec3']

/** 一卷耗材，轴沿 x，给中心 */
function spool(x: number, y: number, z: number, fil: string, flange = '#3d3f44', r = 10) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(cylX(r, 0.8, flange, x + s * 3.2, y, z, 32))
  g.add(cylX(r - 1.5, 5.6, fil, x, y, z, 32))
  g.add(cylX(r * 0.28, 7.2, shade(flange, 0.2), x, y, z, 16))
  return g
}

function printerFdm(p: string[]) {
  const [frame, acc, fil] = p
  const g = new THREE.Group()
  const ext = shade(frame, -0.08)
  g.add(rbox(44, 7, 40, frame, {}, 1.5))
  g.add(glow(10, 4, SCREEN, { x: 12, y: 1.5, z: 20.2 }, 0.5))
  g.add(cylZ(1.4, 1, acc, 4, 3.5, 20.3, 16))
  for (const s of [-1, 1]) g.add(cylZ(0.5, 38, CHROME, s * 8, 7.5, 0, 10))
  g.add(rbox(22, 1, 22, ext, { y: 8 }, 0.4))
  g.add(rbox(24, 0.8, 24, '#3a3d44', { y: 9 }, 0.3))
  // 打印到一半的小花瓶
  g.add(cyl(5, 5, 0.3, fil, { x: 2, y: 9.75, z: -5.5 }, 28))
  g.add(cup(3.6, 4, 5, 0.5, fil, { x: 2, y: 9.8, z: -5.5 }))
  for (const y of [1.6, 3.2]) g.add(noOutline(torus(rAt(3.6, 4, 5, y) + 0.02, 0.12, shade(fil, -0.12), { x: 2, y: 9.8 + y, z: -5.5, rx: PI / 2 })))
  // 龙门框架
  for (const s of [-1, 1]) {
    g.add(rbox(3, 40, 3, ext, { x: s * 21, y: 7, z: -8 }, 0.4))
    g.add(cyl(0.6, 0.6, 40, CHROME, { x: s * 17.8, y: 7, z: -8 }, 8))
    g.add(rbox(4, 5, 4, acc, { x: s * 17.8, y: 18.5, z: -8 }, 0.6))
  }
  g.add(rbox(45, 3, 3, ext, { y: 47, z: -8 }, 0.4))
  g.add(rbox(31.6, 2.6, 3, ext, { y: 19.7, z: -8 }, 0.4))
  // 喷头
  g.add(rbox(7, 8, 5, acc, { x: 2, y: 17.2, z: -5.5 }, 0.8))
  g.add(cylZ(1.8, 0.8, '#2e2f33', 2, 21, -2.6, 16))
  g.add(rbox(2.6, 1.3, 2.6, CHROME, { x: 2, y: 15.9, z: -5.5 }, 0.3))
  g.add(cyl(0.45, 0.12, 1.1, '#d9b25a', { x: 2, y: 14.8, z: -5.5 }, 10))
  // 顶部料盘
  for (const s of [-1, 1]) g.add(rbox(1.5, 12, 3, ext, { x: s * 4.6, y: 50, z: -8 }, 0.4))
  g.add(cylX(1, 10.6, CHROME, 0, 60.5, -8, 12))
  g.add(spool(0, 60.5, -8, fil, '#3d3f44'))
  g.add(bar([0, 51, -1.6], [2, 25.2, -5.5], 0.25, fil, 6))
  return g
}

function printerResin(p: string[]) {
  const [base, cover, resin] = p
  const g = new THREE.Group()
  g.add(rbox(22, 12, 22, base, {}, 1.5))
  g.add(glow(7, 3.5, SCREEN, { x: 4.5, y: 4, z: 11.2 }, 0.5))
  g.add(tray(14, 2.4, 10, 0.5, '#8a8d93', { y: 12, z: 1 }, 0.3))
  g.add(rbox(13, 1.2, 9, resin, { y: 12.4, z: 1 }, 0.3))
  g.add(rbox(4, 28, 4, base, { y: 12, z: -8 }, 0.6))
  g.add(rbox(3, 2, 10, CHROME, { y: 27.6, z: -2 }, 0.4))
  g.add(rbox(12, 1, 9, CHROME, { y: 26.6, z: 1 }, 0.3))
  g.add(cyl(2, 1.3, 4, resin, { y: 22.6, z: 1 }, 16))
  for (const dx of [-0.8, 0.8]) g.add(cyl(0.12, 0.12, 2, resin, { x: dx, y: 20.6, z: 1 }, 6))
  g.add(ghost(rbox(21, 30.5, 21, cover, { y: 11.5 }, 1.5), cover, 0.45))
  return g
}

function printerBox(p: string[]) {
  const [body, acc, glass] = p
  const g = new THREE.Group()
  g.add(shell(38, 46, 38, 1.5, body, { top: false, front: [{ kind: 'rect', x: 0, y: 7, w: 32, h: 35, r: 1.5 }] }))
  g.add(ghost(rbox(33, 36, 0.6, glass, { y: 6.5, z: 19.4 }, 0.3), glass, 0.3))
  g.add(rbox(1, 8, 0.6, acc, { x: 14, y: 20, z: 19.9 }, 0.3))
  g.add(glow(7, 3, SCREEN, { x: -12, y: 2, z: 19.2 }, 0.5))
  // 内部
  for (const s of [-1, 1]) g.add(cyl(0.6, 0.6, 42.5, CHROME, { x: s * 15, y: 1.5, z: -15 }, 8))
  g.add(rbox(26, 1, 26, '#3a3d44', { y: 12 }, 0.3))
  // 小船模型
  g.add(rbox(7, 2.5, 3.6, acc, { y: 13, z: 2 }, 0.8))
  g.add(rbox(3, 2.2, 2.6, acc, { x: -0.8, y: 15.5, z: 2 }, 0.5))
  g.add(cyl(0.6, 0.6, 1.6, acc, { x: 1.2, y: 15.5, z: 2 }, 10))
  for (const s of [-1, 1]) g.add(cylZ(0.5, 32, CHROME, s * 16, 40, 0, 8))
  g.add(rbox(31, 1.6, 2.4, shade(body, -0.1), { y: 39.2, z: 2 }, 0.4))
  g.add(rbox(6, 6, 6, acc, { x: -3, y: 34.5, z: 4.5 }, 0.8))
  g.add(cyl(0.4, 0.1, 1, '#d9b25a', { x: -3, y: 33.5, z: 4.5 }, 8))
  g.add(ghost(rbox(38, 1, 38, glass, { y: 46 }, 0.4), glass, 0.3))
  // 顶部多色料盒
  g.add(rbox(36, 6, 28, body, { y: 47, z: -3 }, 1.2))
  FIL_COLORS.slice(0, 4).forEach((c, i) => g.add(cylZ(4.2, 5.5, c, -12 + i * 8, 53, -3, 24)))
  g.add(ghost(rbox(36, 6, 28, glass, { y: 53, z: -3 }, 1.2), glass, 0.35))
  return g
}

function filamentRack(p: string[]) {
  const [frame, flange] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(3, 108, 24, frame, { x: s * 33.5 }, 0.8))
    g.add(rbox(3, 3, 26, frame, { x: s * 33.5 }, 0.8))
  }
  g.add(rbox(70, 2, 26, frame, { y: 108 }, 0.8))
  const rand = rng(7)
  for (const [k, y] of [13, 39, 65, 91].entries()) {
    g.add(cylX(1.2, 64.4, CHROME, 0, y, 0, 12))
    for (let i = 0; i < 4; i++) {
      if ((k * 4 + i) % 7 === 5) continue
      g.add(spool(-22.5 + i * 15, y, 0, FIL_COLORS[Math.floor(rand() * FIL_COLORS.length)], flange))
    }
  }
  return g
}

// ---- 飞机模型 ----

/** 展示底座 + 支杆，返回底座组；plane 放在 (0, y, 0) */
function planeStand(plane: THREE.Object3D, y: number, base: string, rodTop = y - 1) {
  const g = new THREE.Group()
  g.add(rbox(14, 1.8, 9, base, {}, 0.6))
  g.add(noOutline(rbox(5, 0.4, 1.4, '#d9b25a', { y: 1.6, z: 3 }, 0.15)))
  g.add(cyl(0.4, 0.5, rodTop - 1.8, CHROME, { y: 1.8 }, 10))
  g.add(cyl(0.9, 0.9, 0.6, CHROME, { y: rodTop - 0.6 }, 12))
  plane.position.y = y
  g.add(plane)
  return g
}

function airliner(p: string[]) {
  const [body, tail, base] = p
  const pl = new THREE.Group()
  pl.add(P(capsule(2.2, 28, body), 0, 0, 0, 0, 0, PI / 2))
  pl.add(noOutline(rbox(22, 0.45, 4.9, '#5a6b80', { x: 1, y: 0.4 }, 0.2)))
  pl.add(noOutline(rbox(26, 0.4, 4.9, tail, { x: -1, y: -0.5 }, 0.2)))
  pl.add(noOutline(P(ball(1.6, '#3a4658', {}, [1, 0.5, 1.1]), 14.6, 0.9, 0)))
  pl.add(wings([[4, 1.5], [-2, 1.5], [-8, 18], [-5, 18]], 0.6, body, -1.2))
  for (const s of [-1, 1]) pl.add(cylX(1.1, 4.5, tail, 0.6, -2.2, s * 7, 16))
  pl.add(P(finXY([[-11, 1.2], [-15.6, 1.2], [-17.6, 7.5], [-15.2, 7.5]], 0.5, tail), 0, 0, 0))
  pl.add(wings([[-12.5, 0.8], [-15.5, 0.8], [-17.2, 6.5], [-15.8, 6.5]], 0.4, body, 0.3))
  pl.rotation.z = 0.08
  return centered(planeStand(pl, 16.5, base))
}

function fighter(p: string[]) {
  const [body, acc, base] = p
  const pl = new THREE.Group()
  pl.add(P(capsule(1.5, 17, body), -0.5, 0, 0, 0, 0, PI / 2))
  pl.add(P(cyl(0.15, 1.5, 5, body, {}, 16), 11.5, 0, 0, 0, 0, -PI / 2))
  pl.add(ghost(ball(1.3, '#9fd3ff', { x: 6.5, y: 1.2 }, [2.4, 0.9, 0.9]), '#9fd3ff', 0.7))
  pl.add(wings([[4, 1], [-8.5, 1], [-8.5, 9], [-6.5, 9]], 0.45, body, -0.4))
  for (const s of [-1, 1]) {
    pl.add(P(finXY([[-5.5, 0.8], [-9.5, 0.8], [-10.5, 6], [-8.6, 6]], 0.35, acc), 0, 0, s * 1.6, s * 0.3, 0, 0))
    pl.add(rbox(4, 1.6, 1.2, shade(body, -0.1), { x: 3, y: -1, z: s * 1.6 }, 0.4))
    pl.add(noOutline(rbox(2.2, 0.3, 1, acc, { x: -5, y: -0.25, z: s * 6 }, 0.1)))
  }
  pl.add(cylX(1.1, 1.2, '#3a3a3c', -10.4, 0, 0, 14))
  pl.rotation.set(0.12, 0, 0.14)
  return centered(planeStand(pl, 13.5, base))
}

function propPlane(p: string[]) {
  const [body, acc, base] = p
  const pl = new THREE.Group()
  pl.add(rbox(12, 4, 3.6, body, { x: 4, y: -2 }, 1.2))
  pl.add(P(cyl(0.8, 1.7, 12, body, {}, 16), -8, 0.3, 0, 0, 0, PI / 2))
  pl.add(cylX(1.7, 2, acc, 11, 0, 0, 16))
  pl.add(ball(0.8, acc, { x: 12.2 }))
  pl.add(P(rbox(0.4, 9, 1, '#3a3a3c', {}, 0.2), 12.6, 0, 0, 0.4, 0, 0))
  pl.add(noOutline(rbox(6, 1.3, 3.9, '#3a4658', { x: 5, y: 0.4 }, 0.3)))
  pl.add(rbox(4.6, 0.6, 30, body, { x: 4.5, y: 2 }, 0.3))
  pl.add(noOutline(rbox(4.7, 0.4, 3, acc, { x: 4.5, y: 2.2, z: 13.2 }, 0.1)))
  pl.add(noOutline(rbox(4.7, 0.4, 3, acc, { x: 4.5, y: 2.2, z: -13.2 }, 0.1)))
  for (const s of [-1, 1]) {
    pl.add(bar([4, -1.5, s * 1.8], [4.5, 2, s * 8], 0.2, body, 6))
    pl.add(bar([5, -2, s * 1.4], [5, -4, s * 3], 0.25, '#3a3a3c', 6))
    pl.add(cylZ(0.9, 0.6, '#3a3a3c', 5, -4.2, s * 3.3, 14))
  }
  pl.add(finXY([[-11, 0.8], [-14, 0.8], [-14.5, 5], [-12.5, 5]], 0.4, acc))
  pl.add(wings([[-11.5, 0.6], [-14.5, 0.6], [-14.5, 5.5], [-12.8, 5.5]], 0.35, body, 0.2))
  pl.rotation.z = 0.08
  return centered(planeStand(pl, 15, base, 13))
}

function helicopter(p: string[]) {
  const [body, acc, base] = p
  const pl = new THREE.Group()
  pl.add(ball(4, body, {}, [1.5, 1, 1.05]))
  pl.add(ghost(ball(3.2, '#9fd3ff', { x: 3, y: 0.7 }, [1, 0.8, 0.95]), '#9fd3ff', 0.7))
  pl.add(P(cyl(0.6, 1.4, 12, body, {}, 14), -11, 0.6, 0, 0, 0, PI / 2))
  pl.add(finXY([[-15.5, 0.5], [-17.4, 0.5], [-18.4, 5], [-16.9, 5]], 0.4, acc))
  pl.add(P(rbox(0.3, 4.4, 0.7, '#3a3a3c', {}, 0.1), -17.4, 3.6, 0.7, 0, 0, 0.5))
  pl.add(noOutline(rbox(5, 0.5, 8.5, acc, { x: -1, y: -1.2 }, 0.2)))
  pl.add(cyl(0.5, 0.5, 2.2, '#3a3a3c', { y: 3.8 }, 10))
  pl.add(cyl(1, 1, 0.8, acc, { y: 5.8 }, 14))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    pl.add(P(rbox(14.6, 0.25, 1.2, '#3a3a3c', {}, 0.1), Math.cos(a) * 7.7, 6.35, Math.sin(a) * 7.7, 0, -a, 0))
  }
  for (const s of [-1, 1]) {
    pl.add(cylX(0.4, 13, '#3a3a3c', 0, -5.8, s * 3.6, 10))
    for (const x of [-3, 3]) pl.add(bar([x, -5.8, s * 3.6], [x, -2.8, s * 2.2], 0.3, '#3a3a3c', 6))
  }
  return centered(planeStand(pl, 14, base, 11))
}

function drone(p: string[]) {
  const [body, acc, prop] = p
  const g = new THREE.Group()
  g.add(rbox(9, 3, 12, body, { y: 3.4 }, 1.2))
  g.add(puck(1.8, 0.8, acc, { y: 6.3 }))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const ex = sx * 10.5
      const ez = sz * 10.5
      g.add(beam([sx * 3, 5, sz * 4], [ex, 5, ez], 1.6, 1.2, body, 0.4))
      g.add(cyl(1.3, 1.3, 1.8, '#3a3d44', { x: ex, y: 4.4, z: ez }, 14))
      g.add(cyl(0.3, 0.3, 0.8, CHROME, { x: ex, y: 6.2, z: ez }, 8))
      g.add(P(rbox(9, 0.2, 0.9, prop, {}, 0.1), ex, 6.8, ez, 0, sx * sz * 0.6 + 0.3, 0))
      g.add(noOutline(lit(ball(0.35, sz > 0 ? '#ff6b6b' : '#7fffb2', { x: ex, y: 4.4, z: ez + sz * 1.2 }), sz > 0 ? '#ff6b6b' : '#7fffb2', 0.8)))
    }
  g.add(cyl(0.5, 0.5, 1, '#3a3d44', { y: 2.5, z: 4.5 }, 8))
  g.add(ball(1.3, '#3a3d44', { y: 1.8, z: 4.5 }))
  g.add(cylZ(0.6, 0.4, '#5ac8fa', 0, 1.8, 5.8, 12))
  for (const s of [-1, 1]) {
    g.add(cylZ(0.4, 10, body, s * 4.6, 0.4, 0, 8))
    for (const z of [-3, 3]) g.add(bar([s * 3.5, 3.6, z], [s * 4.6, 0.6, z], 0.3, body, 6))
  }
  return g
}

// ---- 铁道模型 ----

function stadiumOutline<T extends THREE.Path>(p: T, L: number, r: number): T {
  p.moveTo(-L / 2, -r)
  p.lineTo(L / 2, -r)
  p.absarc(L / 2, 0, r, -PI / 2, PI / 2, false)
  p.lineTo(-L / 2, r)
  p.absarc(-L / 2, 0, r, PI / 2, PI * 1.5, false)
  return p
}

/** 水平的跑道形环带：中心线 L×r，半宽 hw，厚 t，底 y */
function stadiumRing(L: number, r: number, hw: number, t: number, color: string, y: number, cz: number) {
  const s = stadiumOutline(new THREE.Shape(), L, r + hw)
  s.holes.push(stadiumOutline(new THREE.Path(), L, r - hw))
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 32 })
  geo.rotateX(-PI / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.set(0, y, cz)
  m.receiveShadow = true
  return m
}

/** 跑道中心线上的点：前直道 → 右弯 → 后直道 → 左弯；yaw 让局部 +x 朝前进方向 */
function stadiumPt(L: number, r: number, s: number) {
  const per = 2 * L + 2 * PI * r
  let d = (((s % 1) + 1) % 1) * per
  let x: number, z: number, hx: number, hz: number
  if (d < L) {
    x = -L / 2 + d
    z = r
    hx = 1
    hz = 0
  } else if ((d -= L) < PI * r) {
    const f = d / r
    x = L / 2 + r * Math.sin(f)
    z = r * Math.cos(f)
    hx = Math.cos(f)
    hz = -Math.sin(f)
  } else if ((d -= PI * r) < L) {
    x = L / 2 - d
    z = -r
    hx = -1
    hz = 0
  } else {
    const f = (d - L) / r
    x = -L / 2 - r * Math.sin(f)
    z = -r * Math.cos(f)
    hx = -Math.cos(f)
    hz = Math.sin(f)
  }
  return { x, z, yaw: Math.atan2(-hz, hx) }
}

function tree(x: number, y: number, z: number, s: number, leafC = C.leafD) {
  const g = new THREE.Group()
  g.add(cyl(0.4 * s, 0.5 * s, 1.6 * s, '#8b6a4f', { x, y, z }, 8))
  g.add(cyl(0.2, 2.2 * s, 3 * s, leafC, { x, y: y + 1.4 * s, z }, 9))
  g.add(cyl(0.2, 1.7 * s, 2.6 * s, shade(leafC, 0.06), { x, y: y + 3 * s, z }, 9))
  return g
}

function trainLayout(p: string[]) {
  const [grass, hill, trainC] = p
  const g = new THREE.Group()
  const BT = 4
  const L = 60
  const r = 22
  const cz = -2
  g.add(tray(120, 4.6, 80, 1.2, C.woodD, {}, 0.6))
  g.add(rbox(117.6, 2.6, 77.6, grass, { y: 1.4 }, 0.3))
  // 轨道
  g.add(stadiumRing(L, r, 3, 0.8, '#a39d94', BT - 0.1, cz))
  for (let i = 0; i < 64; i++) {
    const q = stadiumPt(L, r, i / 64)
    g.add(noOutline(P(rbox(1.1, 0.4, 5.2, '#6e4f37', {}, 0.15), q.x, BT + 0.5, q.z + cz, 0, q.yaw, 0)))
  }
  for (const s of [-1, 1]) g.add(stadiumRing(L, r + s * 1.6, 0.22, 0.55, CHROME, BT + 0.85, cz))
  // 后直道上的隧道山
  const sh = new THREE.Shape()
  sh.moveTo(-13, 0)
  sh.lineTo(-4.2, 0)
  sh.lineTo(-4.2, 5)
  sh.absarc(0, 5, 4.2, PI, 0, true)
  sh.lineTo(4.2, 0)
  sh.lineTo(13, 0)
  for (const [u, v] of [[11, 7], [7, 13], [2, 17], [-3, 16], [-8, 11], [-11.5, 6]] as const) sh.lineTo(u, v)
  sh.lineTo(-13, 0)
  const tun = extrudeXY(sh, 30, hill, 0.6)
  g.add(P(tun, 0, BT - 0.2, cz - r, 0, PI / 2, 0))
  g.add(tree(-6, BT + 15, cz - r - 2, 1.5, C.leaf))
  g.add(tree(5, BT + 13, cz - r + 4, 1.3))
  g.add(noOutline(ball(2.6, '#f4f4f2', { x: 0, y: BT + 16.6, z: cz - r - 2 }, [1.6, 0.5, 1.4])))
  // 车站
  const pz = cz + r + 6
  g.add(rbox(28, 2.6, 6, '#c9c4bb', { y: BT - 0.1, z: pz }, 0.4))
  for (const x of [-11, 11]) g.add(cyl(0.4, 0.4, 7, CHROME, { x, y: BT + 2.5, z: pz + 1 }, 8))
  g.add(P(rbox(28, 0.8, 7.5, trainC, {}, 0.3), 0, BT + 9.8, pz, -0.08, 0, 0))
  g.add(rbox(11, 7, 6, '#f6f0e1', { x: 18, y: BT - 0.1, z: pz + 1.5 }, 0.6))
  g.add(P(rbox(12.5, 1, 7.5, trainC, {}, 0.3), 18, BT + 7.3, pz + 1.5))
  // 池塘 + 小房子 + 树
  const pond = cyl(9, 9, 0.5, '#7ec8e8', { x: -14, y: BT - 0.2, z: cz }, 28)
  pond.scale.z = 0.6
  g.add(pond)
  g.add(rbox(8, 6, 7, '#fff1dc', { x: 16, y: BT - 0.1, z: cz - 3 }, 0.6))
  g.add(P(rbox(9.5, 1.2, 8, C.red, {}, 0.3), 16, BT + 6.6, cz - 3))
  for (const [x, z, s] of [[-52, 32, 1.6], [-46, 34, 1.2], [52, 30, 1.4], [50, -34, 1.7], [-52, -34, 1.5], [30, -6, 1.1], [-2, 6, 1.2]] as const) g.add(tree(x, BT, z, s))
  // 小火车：机车 + 两节车厢（在前直道）
  for (let i = 0; i < 3; i++) {
    const q = stadiumPt(L, r, 0.13 - i * 0.042)
    const car = new THREE.Group()
    car.add(rbox(8.6, 1, 3, '#3a3a3c', { y: 0 }, 0.3))
    car.add(rbox(8.6, 3.6, 3.4, i === 0 ? trainC : shade(trainC, 0.12), { y: 0.9 }, 0.8))
    car.add(noOutline(rbox(7, 1, 3.8, '#3a4658', { y: 2.6 }, 0.2)))
    if (i === 0) car.add(ball(1.6, trainC, { x: 4.3, y: 2.3 }, [1, 1, 1.05]))
    P(car, q.x, BT + 1.4, q.z + cz, 0, q.yaw, 0)
    g.add(car)
  }
  return g
}

function shinkansenDisplay(p: string[]) {
  const [wood, white, stripe] = p
  const g = new THREE.Group()
  g.add(rbox(60, 2, 8, wood, {}, 0.6))
  g.add(rbox(56, 0.8, 5, '#a39d94', { y: 1.9 }, 0.3))
  for (let i = 0; i < 22; i++) g.add(noOutline(rbox(1, 0.4, 4.6, '#6e4f37', { x: -26.25 + i * 2.5, y: 2.6 }, 0.1)))
  for (const s of [-1, 1]) g.add(rbox(56, 0.5, 0.35, CHROME, { y: 2.9, z: s * 1.4 }, 0.1))
  for (const s of [-1, 1]) {
    const cx = s * 9
    g.add(rbox(17, 3.4, 3.0, white, { x: cx, y: 3.9 }, 0.9))
    g.add(ball(1.5, white, { x: cx + s * 8.4, y: 5.4 }, [4.2, 1.1, 1.0]))
    g.add(noOutline(ball(1, '#2a3444', { x: cx + s * 10.6, y: 6.25 }, [1.8, 0.45, 1.05])))
    g.add(noOutline(rbox(16.6, 0.45, 3.6, stripe, { x: cx, y: 4.8 }, 0.15)))
    g.add(noOutline(rbox(14, 0.8, 3.6, '#3a4658', { x: cx - s * 0.6, y: 6.0 }, 0.2)))
    for (const dx of [-5.5, 5.5]) g.add(rbox(3, 0.7, 2.2, '#3a3a3c', { x: cx + dx, y: 3.3 }, 0.2))
  }
  g.add(rbox(1.6, 2.6, 2.4, '#3a3a3c', { y: 4.2 }, 0.4))
  return g
}

function steamLoco(k: number) {
  return (p: string[]) => {
    const [body, acc, base] = p
    const g = new THREE.Group()
    g.add(rbox(44, 1.5, 8, base, {}, 0.5))
    for (let i = 0; i < 16; i++) g.add(noOutline(rbox(1, 0.3, 5.4, '#6e4f37', { x: -20.25 + i * 2.7, y: 1.4 }, 0.1)))
    for (const s of [-1, 1]) g.add(rbox(42, 0.5, 0.4, CHROME, { y: 1.5, z: s * 1.6 }, 0.1))
    const L = new THREE.Group()
    for (const s of [-1, 1]) {
      const z = s * 1.6
      for (const x of [0, 4.4, 8.8]) {
        L.add(cylZ(2, 0.5, acc, x, 4, z, 20))
        L.add(cylZ(0.5, 0.6, CHROME, x, 4, z + s * 0.2, 10))
      }
      L.add(cylZ(1.1, 0.5, acc, 13.4, 3.1, z, 14))
      L.add(cylZ(1.1, 0.5, acc, -4.4, 3.1, z, 14))
      for (const x of [-16.5, -10.5]) L.add(cylZ(1.1, 0.5, acc, x, 3.1, z, 14))
      L.add(noOutline(rbox(10, 0.4, 0.3, CHROME, { x: 4.4, y: 3.3, z: s * 2.05 }, 0.1)))
    }
    L.add(rbox(22, 1.2, 2.6, body, { x: 4.5, y: 4.6 }, 0.3))
    L.add(cylX(2.4, 14, body, 7, 8.2, 0, 24))
    L.add(cylX(2.55, 2.6, shade(body, -0.08), 15.2, 8.2, 0, 24))
    L.add(cylX(1.9, 0.4, '#5a5c60', 16.6, 8.2, 0, 20))
    L.add(cylX(0.6, 0.8, '#ffe08f', 16.6, 10.9, 0, 12))
    for (const x of [7, 10.5]) L.add(torus(2.45, 0.2, '#d9b25a', { x, y: 8.2, ry: PI / 2 }))
    L.add(cyl(0.9, 0.7, 2.6, body, { x: 14, y: 10.2 }, 14))
    L.add(ball(1.2, body, { x: 7.5, y: 10.4 }))
    L.add(ball(1, body, { x: 3.5, y: 10.3 }))
    L.add(rbox(6, 7, 5.2, body, { x: -3, y: 5.8 }, 0.5))
    L.add(rbox(7, 0.6, 6, acc, { x: -3, y: 12.8 }, 0.25))
    L.add(noOutline(rbox(2.2, 2.2, 5.8, '#2a2f38', { x: -2.6, y: 9 }, 0.2)))
    L.add(P(rbox(1.6, 2, 3.4, acc, {}, 0.3), 17.4, 3.4, 0, 0, 0, -0.5))
    L.add(rbox(12, 5.4, 4.8, body, { x: -13.5, y: 4.6 }, 0.6))
    L.add(rbox(10, 1, 4, '#222326', { x: -13.5, y: 9.6 }, 0.3))
    L.add(rbox(2, 0.8, 1.2, '#3a3a3c', { x: -7, y: 5 }, 0.2))
    L.position.x = -0.6
    g.add(L)
    g.scale.setScalar(k)
    return g
  }
}

// ---- 拼装模型 ----

function gunpla(p: string[], k = 1) {
  const [main, sec, acc] = p
  const g = new THREE.Group()
  const joint = '#4a4d55'
  g.add(slab(ellipsePoly(6.5, 6.5, 0, 0, 6), 1.2, '#3d3f44', 0))
  for (const s of [-1, 1]) {
    const x = s * 1.7
    g.add(rbox(2.4, 1.4, 4.2, sec, { x, y: 1.2, z: 0.4 }, 0.4))
    g.add(rbox(2.2, 4.6, 2.6, main, { x, y: 2.4 }, 0.5))
    g.add(rbox(1.6, 1.4, 0.6, acc, { x, y: 5.6, z: 1.4 }, 0.2))
    g.add(rbox(2.0, 3.6, 2.2, main, { x: s * 1.6, y: 6.9 }, 0.5))
    g.add(rbox(1.4, 1.8, 0.6, main, { x: s * 1.2, y: 9.4, z: 1.45 }, 0.2))
    g.add(rbox(2.4, 2.2, 2.6, main, { x: s * 4.0, y: 13.6 }, 0.5))
    g.add(rbox(1.5, 2.8, 1.6, joint, { x: s * 4.0, y: 10.9 }, 0.4))
    g.add(rbox(1.9, 2.8, 2.0, main, { x: s * 4.1, y: 8.2 }, 0.5))
    g.add(rbox(1.2, 1.2, 1.3, joint, { x: s * 4.1, y: 7.0 }, 0.3))
    g.add(rbox(1.4, 1, 0.5, acc, { x: s * 1.3, y: 14, z: 1.65 }, 0.2))
    g.add(cyl(0.25, 0.25, 2, '#e8e8e8', { x: s * 1, y: 14.6, z: -2.7 }, 6))
    g.add(cyl(0.5, 0.35, 1, joint, { x: s * 1, y: 11.2, z: -2.7 }, 8))
  }
  g.add(rbox(4.6, 1.8, 2.6, sec, { y: 10.2 }, 0.4))
  g.add(rbox(5.4, 3.8, 3.2, sec, { y: 11.8 }, 0.6))
  g.add(rbox(1.2, 1, 1.2, joint, { y: 15.5 }, 0.3))
  g.add(rbox(1.8, 1.8, 1.9, main, { y: 15.8 }, 0.4))
  g.add(noOutline(lit(rbox(1.4, 0.4, 0.3, '#7fffb2', { y: 16.6, z: 1.05 }, 0.1), '#7fffb2', 0.8)))
  g.add(rbox(0.5, 0.5, 0.4, acc, { y: 17.2, z: 0.85 }, 0.15))
  for (const s of [-1, 1]) g.add(P(rbox(0.25, 2.2, 0.3, acc, {}, 0.1), s * 0.75, 17.9, 0.8, 0, 0, -s * 0.9))
  g.add(rbox(3.4, 3, 1.6, sec, { y: 12.2, z: -2.3 }, 0.4))
  // 盾 + 步枪
  g.add(P(rbox(0.5, 6, 3.4, acc, {}, 0.25), -5.35, 9.2, 0.4))
  g.add(rbox(0.8, 1.2, 6, joint, { x: 4.1, y: 6.2, z: 2.3 }, 0.3))
  g.add(cylZ(0.25, 1.4, joint, 4.1, 6.9, 5.9, 8))
  g.scale.setScalar(k)
  return g
}

function displayCase(p: string[]) {
  const [base, main, acc] = p
  const g = new THREE.Group()
  g.add(rbox(30, 4, 22, base, {}, 0.8))
  g.add(noOutline(rbox(8, 1.6, 0.4, '#d9b25a', { y: 1.2, z: 11.1 }, 0.15)))
  g.add(P(gunpla([main, shade(main, -0.25), acc], 1.25), 0, 4, -0.5))
  g.add(ghost(rbox(28, 30.5, 20, '#dff0ff', { y: 3.7 }, 0.6), '#dff0ff', 0.25))
  g.add(shine(-7, 24, 14, 10.45))
  return g
}

function workMat(p: string[]) {
  const [mat, line, acc] = p
  const g = new THREE.Group()
  g.add(rbox(45, 0.3, 30, mat, {}, 0.15))
  const grid = shade(mat, 0.14)
  for (let i = -4; i <= 4; i++) g.add(noOutline(rbox(0.2, 0.6, 29, grid, { x: i * 5 }, 0.05)))
  for (let j = -2; j <= 2; j++) g.add(noOutline(rbox(44, 0.6, 0.2, grid, { z: j * 5 + 2.5 }, 0.05)))
  // 刻刀
  g.add(cylX(0.45, 10, acc, -12, 1.05, 10, 12))
  g.add(cylX(0.5, 1.5, CHROME, -6.4, 1.05, 10, 12))
  g.add(rbox(1.8, 0.6, 0.15, CHROME, { x: -4.8, y: 0.75, z: 10 }, 0.05))
  // 镊子
  for (const dz of [-0.6, 0.6]) g.add(bar([4, 0.85, 10.5], [13, 0.85, 10.5 + dz], 0.2, CHROME, 6))
  // 水口钳
  for (const dz of [-1.6, 1.6]) {
    g.add(bar([11, 0.95, -1], [18, 0.95, -1 + dz], 0.35, acc, 8))
    g.add(bar([14.5, 1.0, -1 + dz / 2], [18, 1.0, -1 + dz], 0.55, '#3a3a3c', 8))
  }
  g.add(rbox(2.2, 0.8, 1.2, '#5a5c60', { x: 10, y: 0.6, z: -1 }, 0.2))
  // 颜料瓶
  ;['#e05a3a', '#2f5fb5', '#e8c43a', '#f4f4f2', '#3d3f44'].forEach((c, i) => {
    const x = 6 + i * 3.4
    g.add(cyl(1.3, 1.3, 2.2, c, { x, y: 0.6, z: -10.5 }, 14))
    g.add(cyl(1.1, 1.1, 1, '#2e2f33', { x, y: 2.8, z: -10.5 }, 14))
  })
  // 板件水口
  const sx = -10
  const sz = -4
  for (const [w, d, x, z] of [[16, 0.4, 0, -5], [16, 0.4, 0, 5], [0.4, 10, -8, 0], [0.4, 10, 8, 0], [16, 0.4, 0, 0], [0.4, 10, 0, 0]] as const) g.add(rbox(w, 0.5, d, line, { x: sx + x, y: 0.6, z: sz + z }, 0.1))
  for (const [x, z, w, d] of [[-4, -2.5, 4, 2.4], [4, -2.5, 3, 3], [-4, 2.5, 5, 2], [4.5, 2.5, 2.4, 2.4]] as const) g.add(rbox(w, 0.7, d, acc, { x: sx + x, y: 0.5, z: sz + z }, 0.2))
  return g
}

function airbrushSet(p: string[]) {
  const [body, acc, hose] = p
  const g = new THREE.Group()
  g.add(rbox(16, 10, 11, body, { x: -6 }, 1.5))
  for (let i = 0; i < 4; i++) g.add(noOutline(rbox(0.5, 5, 0.4, shade(body, -0.15), { x: -12 + i * 1.6, y: 2.5, z: 5.6 }, 0.1)))
  g.add(cylZ(1.8, 0.8, CHROME, -1.5, 6.5, 5.8, 20))
  g.add(cylZ(1.4, 0.4, '#ffffff', -1.5, 6.5, 6.25, 20))
  g.add(cyl(1, 1, 1.2, acc, { x: -10, y: 10 }, 14))
  // 支架
  g.add(puck(2.6, 0.8, body, { x: 8, z: 2 }))
  g.add(cyl(0.35, 0.35, 8, CHROME, { x: 8, y: 0.8, z: 2 }, 8))
  g.add(torus(0.9, 0.25, CHROME, { x: 8, y: 9, z: 2, rx: PI / 2 }))
  // 喷笔（笔尖朝下插在支架上）
  const ab = new THREE.Group()
  ab.add(cylX(0.6, 12, CHROME, 0, 0, 0, 14))
  ab.add(P(cyl(0.05, 0.6, 1.6, CHROME, {}, 10), 6.8, 0, 0, 0, 0, -PI / 2))
  ab.add(cyl(0.9, 0.7, 1.4, CHROME, { x: 3, y: 0.4 }, 12))
  ab.add(rbox(0.6, 1.2, 0.6, acc, { x: -0.5, y: 0.4 }, 0.15))
  P(ab, 8.2, 9.5, 2, 0, 0, -1.1)
  g.add(ab)
  const pts: V3[] = [[2, 3, 3.5], [3.8, 0.4, 4.5], [5.4, 0.4, 5.2], [4.6, 8, 4], [5.4, 14.6, 2]]
  for (let i = 0; i < pts.length - 1; i++) g.add(bar(pts[i], pts[i + 1], 0.3, hose, 6))
  return centered(g)
}

function jigsaw(p: string[]) {
  const [sky, ground, sun] = p
  const g = new THREE.Group()
  g.add(rbox(50, 0.6, 38, '#e8dcc4', {}, 0.3))
  const rand = rng(11)
  const color = (u: number, v: number) => {
    const mtn = v > 0.32 + Math.abs(u - 0.4) * 0.95
    if (Math.hypot(u - 0.78, v - 0.22) < 0.12) return sun
    if (v > 0.78) return ground
    if (mtn) return v < 0.48 ? '#ffffff' : shade(ground, -0.14)
    return sky
  }
  const loose: string[] = []
  for (let i = 0; i < 10; i++)
    for (let j = 0; j < 7; j++) {
      const c = color((i + 0.5) / 10, (j + 0.5) / 7)
      if (rand() < 0.14) {
        loose.push(c)
        continue
      }
      g.add(rbox(3.8, 0.5, 3.8, c, { x: -22 + i * 4, y: 0.55, z: -12 + j * 4 }, 0.3))
    }
  loose.slice(0, 8).forEach((c, i) => g.add(P(rbox(3.8, 0.5, 3.8, c, {}, 0.3), 21.5 + (i % 2) * 0.6, 0.85 + Math.floor(i / 2) * 0.1, -14 + i * 4, 0, rand() * 1.2, 0)))
  return g
}

function puzzleToys(p: string[]) {
  const [wood, a, b] = p
  const g = new THREE.Group()
  const hx = -3.5
  g.add(rbox(24, 1.6, 8, wood, { x: hx }, 0.5))
  for (const k of [-1, 0, 1]) g.add(cyl(0.4, 0.4, 9, shade(wood, -0.1), { x: hx + k * 7.5, y: 1.6 }, 8))
  ;[C.red, C.orange, C.lemon, C.mint, C.sky].forEach((c, i) => g.add(puck(3.4 - i * 0.45, 1.3, c, { x: hx - 7.5, y: 1.6 + i * 1.3 })))
  // 鲁班锁
  const bx = 12.5
  const c = 3
  for (const s of [-1, 1]) {
    g.add(rbox(6, 1.6, 1.6, a, { x: bx, y: c - 0.8, z: s * 0.8 }, 0.25))
    g.add(rbox(1.6, 6, 1.6, b, { x: bx + s * 0.8, y: c - 3 }, 0.25))
    g.add(rbox(1.6, 1.6, 6, shade(a, -0.08), { x: bx, y: c - 0.8 + s * 0.8, z: 0 }, 0.25))
  }
  return g
}

function celestialGlobe(p: string[]) {
  const [sphere, brass, star, wood] = p
  const g = new THREE.Group()
  g.add(puck(9, 2.5, wood))
  g.add(cyl(1, 1.4, 8.5, brass, { y: 2.5 }, 14))
  g.add(torus(13.6, 0.7, brass, { y: 24, rx: PI / 2 }))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 6
    g.add(bar([Math.cos(a) * 6.5, 2.4, Math.sin(a) * 6.5], [Math.cos(a) * 13.6, 23.4, Math.sin(a) * 13.6], 0.45, brass, 8))
  }
  g.add(ball(12, sphere, { y: 24 }))
  const rand = rng(5)
  for (let i = 0; i < 34; i++) {
    const u = rand() * 2 - 1
    const th = rand() * PI * 2
    const s = Math.sqrt(1 - u * u)
    g.add(noOutline(ball(0.35 + rand() * 0.25, star, { x: s * Math.cos(th) * 12, y: 24 + u * 12, z: s * Math.sin(th) * 12 })))
  }
  g.add(P(torus(12.05, 0.22, star), 0, 24, 0, PI / 2 + 0.41, 0, 0))
  g.add(P(torus(12.7, 0.4, brass), 0, 24, 0, 0, 0, 0.41))
  for (const s of [-1, 1]) g.add(ball(0.8, brass, { x: -s * Math.sin(0.41) * 12.7, y: 24 + s * Math.cos(0.41) * 12.7 }))
  return g
}

function telescope(p: string[]) {
  const [tube, mount, acc] = p
  const g = new THREE.Group()
  const apex: V3 = [0, 90, 0]
  const feet: V3[] = [90, 210, 330].map((d) => {
    const a = (d * PI) / 180
    return [Math.cos(a) * 32, 0.6, Math.sin(a) * 32]
  })
  for (const f of feet) {
    g.add(bar(apex, f, 1.3, mount, 8))
    g.add(ball(1.4, RUBBER, { x: f[0], y: 1.4, z: f[2] }))
    const m: V3 = [f[0] * 0.5, 45.3, f[2] * 0.5]
    g.add(bar([0, 45, 0], m, 0.5, mount, 6))
  }
  g.add(puck(6, 1.2, mount, { y: 44.5 }))
  g.add(cyl(3, 3.5, 6, mount, { y: 88 }, 16))
  g.add(rbox(4, 7, 4, mount, { y: 94 }, 0.8))
  const c = new THREE.Vector3(0, 104, 0)
  const dir = new THREE.Vector3(0, Math.sin(PI / 6), -Math.cos(PI / 6))
  const at = (t: number, up = 0): V3 => {
    const v = c.clone().addScaledVector(dir, t).add(new THREE.Vector3(0, Math.cos(PI / 6), Math.sin(PI / 6)).multiplyScalar(up))
    return [v.x, v.y, v.z]
  }
  g.add(bar(at(-40), at(28), 5.5, tube, 24))
  g.add(bar(at(28), at(40), 6.3, acc, 24))
  g.add(bar(at(-3), at(3), 6, mount, 24))
  g.add(bar(at(-6, 7.8), at(10, 7.8), 1.4, tube, 12))
  g.add(bar(at(-4, 5.5), at(-4, 6.8), 0.5, mount, 6))
  g.add(bar(at(-40), at(-44), 1.6, mount, 12))
  const e = at(-44)
  g.add(cyl(1.1, 1.1, 5, RUBBER, { x: e[0], y: e[1], z: e[2] }, 12))
  return centered(g)
}

/** 吉他（含支架）；k 缩放（尤克里里用） */
function guitar(k: number) {
  return (p: string[]) => {
    const [body, neck, stand] = p
    const gt = new THREE.Group()
    gt.add(P(puck(18, 10, body), 0, 18, 0, PI / 2))
    gt.add(P(puck(13.5, 10, body), 0, 40, 0, PI / 2))
    gt.add(cylZ(4.2, 0.6, '#2a1d14', 0, 37, 5.05, 24))
    gt.add(torus(4.9, 0.3, neck, { y: 37, z: 5.0 }))
    gt.add(rbox(8, 1.4, 0.8, neck, { y: 15, z: 4.75 }, 0.3))
    gt.add(rbox(4.6, 40, 2.4, neck, { y: 52, z: 2.5 }, 0.8))
    gt.add(rbox(4.8, 38, 0.6, '#3a2a20', { y: 52.5, z: 3.95 }, 0.2))
    for (let i = 0; i < 6; i++) gt.add(noOutline(rbox(0.08, 76, 0.08, '#e8e8e8', { x: -1.5 + i * 0.6, y: 15.6, z: 5.3 }, 0.02)))
    const head = new THREE.Group()
    head.add(rbox(7, 15, 1.6, neck, {}, 0.6))
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) head.add(cylX(0.5, 2, CHROME, s * 4.2, 4 + i * 4, 0, 8))
    P(head, 0, 91.5, 2.2, -0.2, 0, 0)
    gt.add(head)
    const th = -0.22
    P(gt, 0, 9, 6, th, 0, 0)
    const g = new THREE.Group()
    g.add(gt)
    // 支架
    g.add(cylX(1, 30, stand, 0, 8, 6, 12))
    for (const s of [-1, 1]) {
      g.add(bar([s * 15, 8, 6], [s * 18, 0.8, 16], 1, stand, 8))
      g.add(ball(1.1, RUBBER, { x: s * 18, y: 1.1, z: 16 }))
      g.add(bar([s * 12, 8, 6], [s * 12, 11, 11.5], 0.9, RUBBER, 8))
      g.add(bar([0, 4, -16], [s * 16, 0.8, -24], 1, stand, 8))
      g.add(ball(1.1, RUBBER, { x: s * 16, y: 1.1, z: -24 }))
    }
    g.add(bar([0, 4, -16], [0, 80.5, -10.6], 1.1, stand, 8))
    g.add(bar([0, 8, 6], [0, 23, -14.8], 1, stand, 8))
    g.add(cylX(0.9, 8, stand, 0, 80.5, -10.6, 10))
    for (const s of [-1, 1]) g.add(bar([s * 3.6, 80.5, -10.6], [s * 3.6, 84, -9.6], 0.8, RUBBER, 8))
    const out = centered(g)
    out.scale.setScalar(k)
    return out
  }
}
const GUITAR_PALS: PalFlat[] = [
  ['nordic', '#e2b77a', '#7a5a43', '#2e2f33'],
  ['retro', '#d27a2c', '#3e2a1e', '#2e2f33'],
  ['modern', M.char, M.black, M.silver],
  ['cute', C.sakura, C.woodD, C.white],
  ['japanese', J.hinoki, J.dark, J.sumi],
]

function keyboard(p: string[]) {
  const [body, stand, acc] = p
  const g = new THREE.Group()
  for (const z of [-2.5, 2.5]) {
    g.add(bar([-28, 1.5, z], [28, 72, z], 1.4, stand, 10))
    g.add(bar([28, 1.5, z], [-28, 72, z], 1.4, stand, 10))
  }
  g.add(cylZ(1.8, 7, CHROME, 0, 36.75, 0, 14))
  for (const s of [-1, 1]) {
    g.add(rbox(4, 2.5, 40, RUBBER, { x: s * 28 }, 0.8))
    g.add(rbox(4, 2.5, 34, RUBBER, { x: s * 28, y: 71.5 }, 0.8))
  }
  g.add(rbox(100, 9, 32, body, { y: 74 }, 2))
  const kw = 86 / 36
  for (let i = 0; i < 36; i++) g.add(rbox(kw - 0.18, 1.6, 13, '#fbfbf8', { x: -43 + kw * (i + 0.5), y: 82, z: 8.6 }, 0.2))
  for (let i = 0; i < 35; i++) {
    if (![0, 1, 3, 4, 5].includes(i % 7)) continue
    g.add(rbox(1.3, 1.3, 8, '#222326', { x: -43 + kw * (i + 1), y: 83.2, z: 6.1 }, 0.2))
  }
  g.add(noOutline(lit(rbox(14, 0.4, 5, SCREEN, { y: 82.9, z: -8 }, 0.1), SCREEN, 0.5)))
  for (const s of [-1, 1]) g.add(noOutline(rbox(12, 0.4, 7, '#3a3a3c', { x: s * 38, y: 82.9, z: -7 }, 0.2)))
  for (let i = 0; i < 6; i++) g.add(cyl(0.8, 0.8, 1, i % 3 ? M.silver : acc, { x: -26 + i * 3, y: 82.6, z: -8 }, 12))
  for (let i = 0; i < 6; i++) g.add(rbox(1.6, 0.8, 1.2, acc, { x: 12 + i * 2.6, y: 82.7, z: -8 }, 0.2))
  g.add(P(rbox(50, 14, 0.8, body, {}, 0.3), 0, 89.5, -13.5, -0.25, 0, 0))
  return g
}

function easel(p: string[]) {
  const [wood, a, b] = p
  const g = new THREE.Group()
  g.add(beam([0, 0, 10], [0, 175, -4], 4, 3, wood))
  for (const s of [-1, 1]) g.add(beam([s * 30, 0, 12], [s * 2, 160, -2.8], 3, 2.5, wood))
  g.add(beam([0, 0, -36], [0, 150, -3.4], 3, 2.5, wood))
  g.add(rbox(64, 2.5, 6, wood, { y: 70, z: 9 }, 0.6))
  g.add(rbox(64, 4, 1, wood, { y: 70, z: 11.6 }, 0.4))
  const cv = new THREE.Group()
  cv.add(rbox(60, 48, 2.5, '#fbf8f0', {}, 0.4))
  cv.add(rbox(56, 22, 0.6, a, { y: 23, z: 1.25 }, 0.2))
  cv.add(rbox(56, 10, 0.6, b, { y: 4, z: 1.25 }, 0.2))
  cv.add(cylZ(4.5, 0.6, '#ffd27a', 14, 36, 1.6, 24))
  cv.add(P(finXY([[-26, 13], [-2, 32], [22, 13]], 0.6, shade(b, -0.12)), 0, 0, 1.55))
  cv.add(cylZ(5, 0.6, shade(b, 0.1), -14, 18, 1.55, 24))
  cv.add(rbox(1.2, 8, 0.6, '#8b6a4f', { x: -14, y: 10, z: 1.75 }, 0.2))
  P(cv, 0, 72.5, 9, -0.08, 0, 0)
  g.add(cv)
  g.add(rbox(6, 3, 5, wood, { y: 120.5, z: 3 }, 0.6))
  return centered(g)
}
const EASEL_PALS: PalFlat[] = [
  ['nordic', N.oak, N.blue, N.sage],
  ['retro', R.caramel, R.teal, R.olive],
  ['japanese', J.wood, '#f6f0e1', J.tatami],
  ['cute', C.woodL, C.sky, C.mint],
  ['industrial', I.walnut, '#c9c4bb', I.rust],
]

const MODEL_BASE: PalFlat[] = [
  ['modern', '#e9ecef', '#2f5fb5', M.black],
  ['retro', R.cream, R.red, R.caramel],
  ['industrial', '#8a8f86', '#6b7a55', I.walnut],
  ['cute', C.white, C.pink, C.woodL],
]

const HOBBY_ITEMS: AssetDef[] = [
  def(
    'hb-printer-fdm',
    '3D 打印机（FDM）',
    'hobby',
    [45, 40, 70.5],
    [
      ['modern', M.black, '#ff7a1a', C.sky],
      ['industrial', I.iron, I.rust, '#d8d8d8'],
      ['cute', C.white, C.pink, C.mint],
      ['retro', R.cream, R.teal, R.orange],
      ['nordic', N.white, N.sage, N.mustard],
    ],
    printerFdm,
    PROP,
  ),
  def(
    'hb-printer-resin',
    '光固化 3D 打印机',
    'hobby',
    [22, 22, 42],
    [
      ['modern', M.black, '#ffa53a', '#5ac8fa'],
      ['cute', C.white, '#ffd95a', C.pink],
      ['industrial', I.iron, '#ff8c3a', '#9aa0a6'],
      ['nordic', N.white, '#f2c14e', N.blue],
    ],
    printerResin,
    PROP,
  ),
  def(
    'hb-printer-box',
    '封闭式 3D 打印机',
    'hobby',
    [38, 39.4, 59],
    [
      ['modern', M.char, '#4cd964', '#dfefff'],
      ['modern', M.white, '#ff7a1a', '#dfefff'],
      ['industrial', I.iron, I.rust, '#e8e2d8'],
      ['cute', C.white, C.pink, '#f4ecff'],
    ],
    printerBox,
    PROP,
  ),
  def(
    'hb-filament-rack',
    '耗材架',
    'hobby',
    [70, 26, 110],
    [
      ['nordic', N.oak, '#3d3f44'],
      ['modern', M.black, M.char],
      ['industrial', I.iron, I.iron],
      ['cute', C.white, '#f4f4f2'],
    ],
    filamentRack,
    { surface: 110 },
  ),
  def('hb-plane-airliner', '客机模型', 'hobby', [34.2, 36, 22.8], MODEL_BASE, airliner, PROP),
  def(
    'hb-plane-fighter',
    '战斗机模型',
    'hobby',
    [25.1, 17.9, 18.4],
    [
      ['modern', '#9aa3ad', '#3d3f44', M.black],
      ['industrial', '#6b7a55', I.rust, I.walnut],
      ['retro', R.cream, R.red, R.caramel],
      ['cute', C.sky, C.pink, C.woodL],
    ],
    fighter,
    PROP,
  ),
  def(
    'hb-plane-prop',
    '螺旋桨小飞机模型',
    'hobby',
    [28, 30, 20.3],
    [
      ['retro', R.mustard, R.red, R.caramel],
      ['cute', C.white, C.sky, C.woodL],
      ['nordic', N.white, N.blue, N.oak],
      ['modern', M.silver, M.black, M.black],
    ],
    propPlane,
    PROP,
  ),
  def(
    'hb-plane-heli',
    '直升机模型',
    'hobby',
    [29.6, 22, 20.6],
    [
      ['retro', R.red, R.cream, R.caramel],
      ['modern', M.char, '#e8c43a', M.black],
      ['cute', C.lemon, C.sky, C.woodL],
      ['industrial', '#6b7a55', I.iron, I.walnut],
    ],
    helicopter,
    PROP,
  ),
  def(
    'hb-drone',
    '无人机',
    'hobby',
    [29.8, 28.6, 7.1],
    [
      ['modern', M.white, M.char, M.char],
      ['modern', M.char, '#e05a3a', '#9aa0a6'],
      ['cute', C.white, C.pink, C.sky],
      ['industrial', I.iron, I.rust, I.steel],
    ],
    drone,
    PROP,
  ),
  def(
    'hb-train-layout',
    '铁道模型展示台',
    'hobby',
    [120, 80, 27],
    [
      ['cute', '#a6d88a', '#7fbf6a', C.pink],
      ['retro', '#9fbf6a', '#8c8c3a', R.orange],
      ['japanese', '#b5c97a', '#6e8f5a', J.shu],
      ['nordic', '#c3d4b0', N.sage, N.blue],
    ],
    trainLayout,
    PROP,
  ),
  def(
    'hb-shinkansen',
    '新干线模型展示轨',
    'hobby',
    [60, 8, 7.3],
    [
      ['japanese', J.dark, '#f7f7f2', J.ai],
      ['modern', M.black, M.white, '#2f6db5'],
      ['retro', R.caramel, R.cream, R.teal],
      ['cute', C.woodL, C.white, C.pink],
      ['nordic', N.oak, N.white, N.sage],
    ],
    shinkansenDisplay,
    PROP,
  ),
  ...([
    ['N 规', 0.36],
    ['HO 规', 0.66],
    ['O 规', 1],
  ] as const).map(([lab, k], i) =>
    def(
      ['hb-steam-loco-n', 'hb-steam-loco-ho', 'hb-steam-loco-o'][i],
      '蒸汽机车模型',
      'hobby',
      [+(44 * k).toFixed(1), +(8 * k).toFixed(1), +(13.4 * k).toFixed(1)],
      [
        ['retro', '#2a2a2c', R.red, R.caramel],
        ['industrial', I.iron, I.rust, I.walnut],
        ['modern', M.black, M.silver, M.white],
        ['cute', C.sky, C.red, C.woodL],
        ['japanese', J.sumi, J.shu, J.dark],
      ],
      steamLoco(k),
      { ...PROP, family: 'steam-loco', sizeLabel: lab },
    ),
  ),
  def(
    'hb-gunpla',
    '拼装机器人模型',
    'hobby',
    [13, 12.2, 18.6],
    [
      ['modern', '#f4f4f2', '#2f5fb5', '#e8c43a'],
      ['industrial', '#6b7a55', I.iron, I.rust],
      ['retro', R.red, R.cream, R.mustard],
      ['cute', C.white, C.pink, C.lemon],
      ['modern', M.char, M.silver, '#e05a3a'],
    ],
    (p) => centered(gunpla(p)),
    PROP,
  ),
  def(
    'hb-display-case',
    '模型展示罩',
    'hobby',
    [30, 22, 34.2],
    [
      ['modern', M.black, '#f4f4f2', '#e8c43a'],
      ['nordic', N.oak, N.white, N.blue],
      ['industrial', I.walnut, '#6b7a55', I.rust],
      ['cute', C.white, C.pink, C.lemon],
    ],
    displayCase,
    PROP,
  ),
  def(
    'hb-model-workmat',
    '模型工作垫与工具',
    'hobby',
    [45, 30, 3.8],
    [
      ['modern', '#4d8f6a', '#e8f2ea', '#e05a3a'],
      ['modern', '#3d3f44', '#8a8d93', '#5ac8fa'],
      ['cute', '#f4b8c8', '#ffffff', C.sky],
      ['industrial', '#5a6b5a', '#c9c4bb', I.rust],
    ],
    workMat,
    PROP,
  ),
  def(
    'hb-airbrush',
    '喷笔与气泵',
    'hobby',
    [25.6, 12, 15.1],
    [
      ['modern', M.char, '#e05a3a', '#3d3f44'],
      ['industrial', I.iron, I.rust, '#2e2f33'],
      ['cute', C.white, C.pink, C.lilac],
      ['retro', R.teal, R.mustard, R.cream],
    ],
    airbrushSet,
    PROP,
  ),
  def(
    'hb-jigsaw',
    '拼图',
    'hobby',
    [50, 38, 1.3],
    [
      ['nordic', N.blue, N.sage, N.mustard],
      ['cute', C.sky, C.mint, C.pink],
      ['retro', R.teal, R.olive, R.orange],
      ['japanese', '#a8c8e0', J.tatami, J.shu],
      ['modern', M.light, M.gray, '#e05a3a'],
    ],
    jigsaw,
    PROP,
  ),
  def(
    'hb-puzzle-toys',
    '益智玩具组（汉诺塔 + 鲁班锁）',
    'hobby',
    [31, 8, 10.6],
    [
      ['nordic', N.oak, N.oakL, '#c49a6c'],
      ['japanese', J.hinoki, J.wood, J.dark],
      ['retro', R.caramel, R.cream, R.mustard],
      ['cute', C.woodL, C.pink, C.sky],
    ],
    puzzleToys,
    PROP,
  ),
  def(
    'hb-celestial-globe',
    '天体仪',
    'hobby',
    [28.6, 28.6, 37.1],
    [
      ['retro', '#2c3e6b', '#c9a24a', '#ffe08f', R.caramel],
      ['japanese', J.ai, '#b88a5a', '#f6f0e1', J.dark],
      ['modern', M.black, M.silver, '#ffffff', M.char],
      ['nordic', N.blue, N.oak, N.white, N.oak],
      ['cute', C.lilac, C.lemon, C.white, C.woodL],
    ],
    celestialGlobe,
    PROP,
  ),
  def(
    'hb-telescope',
    '天文望远镜',
    'hobby',
    [55.4, 75, 130],
    [
      ['modern', M.white, M.black, M.char],
      ['retro', '#d9b25a', R.caramel, R.cream],
      ['industrial', I.iron, I.steel, I.rust],
      ['cute', C.sky, C.white, C.pink],
      ['nordic', N.white, N.oak, N.gray],
    ],
    telescope,
  ),
  def('hb-guitar', '吉他（带支架）', 'hobby', [38.2, 42.2, 112.6], GUITAR_PALS, guitar(1)),
  def(
    'hb-keyboard',
    '电子琴（带支架）',
    'hobby',
    [100, 40, 96.6],
    [
      ['modern', M.black, M.char, '#e05a3a'],
      ['nordic', N.white, N.oak, N.sage],
      ['cute', C.white, C.pink, C.sky],
      ['retro', R.cream, R.caramel, R.orange],
      ['industrial', I.iron, I.steel, I.rust],
    ],
    keyboard,
  ),
  def(
    'hb-ukulele',
    '尤克里里（带支架）',
    'hobby',
    [19.8, 22, 58.6],
    [
      ['retro', '#c97b3a', '#3e2a1e', '#2e2f33'],
      ['cute', C.sky, C.woodL, C.white],
      ['cute', C.lemon, C.woodD, C.pink],
      ['nordic', '#e8c89a', N.oak, N.white],
      ['japanese', J.wood, J.dark, J.sumi],
    ],
    guitar(0.52),
    PROP,
  ),
  def('hb-easel', '画架', 'hobby', [64, 50, 175], EASEL_PALS, easel),
]

// ======================================================================
// 镜子
// ======================================================================

type Outline = <T extends THREE.Path>(p: T) => T

function circOutline<T extends THREE.Path>(p: T, r: number, cy = 0): T {
  p.absarc(0, cy, r, 0, PI * 2, false)
  return p
}

/**
 * 镜子面板（xy 平面，厚 t，z 居中）：框（外形 outer 挖掉 hole）+ 镜面（比孔略大，边缘藏进框里）+ 背板。
 * hl = [高光中心 x, y, 尺度]
 */
function mirrorPanel(outer: Outline, hole: Outline, glassS: Outline, t: number, frame: string, back: string, hl: [number, number, number]) {
  const g = new THREE.Group()
  g.add(frameOf(outer(new THREE.Shape()), hole(new THREE.Path()), t, frame))
  g.add(mirrorGlass(glassS(new THREE.Shape()), hl[0], hl[1], hl[2]))
  g.add(P(extrudeXY(glassS(new THREE.Shape()), 0.6, back, 0), 0, 0, -t / 2 + 0.5))
  return g
}

/** 面板后仰 th，下边贴地；返回 (面板局部点) 的世界坐标 */
function leanPanel(g: THREE.Group, pan: THREE.Group, t: number, th: number) {
  P(pan, 0, (t / 2) * Math.sin(-th), 0, th, 0, 0)
  g.add(pan)
  return (x: number, y: number, z: number): V3 => {
    const v = new THREE.Vector3(x, y, z).applyEuler(new THREE.Euler(th, 0, 0)).add(pan.position)
    return [v.x, v.y, v.z]
  }
}

/** 背撑腿：从 a 撑到地面上后方 back 处 */
function kickstand(g: THREE.Group, a: V3, back: number, color: string) {
  const f: V3 = [a[0], 1.2, a[2] - back]
  g.add(beam(a, f, 4, 2, color))
  g.add(rbox(5, 1.2, 4, RUBBER, { x: f[0], y: 0, z: f[2] }, 0.4))
}

function floorArch(p: string[]) {
  const [frame, back] = p
  const g = new THREE.Group()
  const pan = mirrorPanel((s) => archOutline(s, 60, 166), (s) => archOutline(s, 52, 158, 4), (s) => archOutline(s, 52.6, 158.6, 3.7), 3, frame, back, [-9, 112, 46])
  const at = leanPanel(g, pan, 3, -0.1)
  kickstand(g, at(0, 115, -1.5), 34, frame)
  return centered(g)
}

function floorCheval(p: string[]) {
  const [frame, back, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(5, 3, 44, frame, { x: s * 29 }, 1))
    g.add(rbox(4, 150, 4, frame, { x: s * 29, y: 3 }, 0.8))
    g.add(ball(2.2, acc, { x: s * 29, y: 155 }))
    g.add(cylX(1.6, 1.4, acc, s * 26.5, 92, 0, 14))
  }
  g.add(rbox(54, 3, 3, frame, { y: 20 }, 0.6))
  const pan = mirrorPanel((s) => rrOutline(s, 52, 130, 2, -65), (s) => rrOutline(s, 46, 124, 1, -62), (s) => rrOutline(s, 46.6, 124.6, 1.2, -62.3), 3, frame, back, [-8, 18, 44])
  P(pan, 0, 92, 0, -0.08, 0, 0)
  g.add(pan)
  return g
}

function floorOval(p: string[]) {
  const [frame, back, acc] = p
  const g = new THREE.Group()
  g.add(puck(18, 3, acc))
  g.add(cyl(1.6, 2.2, 12.5, frame, { y: 2.8 }, 14))
  g.add(mirrorPanel((s) => ellOutline(s, 25, 70, 85), (s) => ellOutline(s, 22, 67, 85), (s) => ellOutline(s, 22.4, 67.4, 85), 3, frame, back, [-6, 105, 40]))
  return g
}

function floorLed(p: string[]) {
  const [frame, back] = p
  const g = new THREE.Group()
  const pan = mirrorPanel((s) => rrOutline(s, 52, 160, 8), (s) => rrOutline(s, 46, 154, 5, 3), (s) => rrOutline(s, 46.6, 154.6, 5.3, 2.7), 3, frame, back, [-8, 112, 42])
  const led = frameOf(rrOutline(new THREE.Shape(), 46, 154, 5, 3), rrOutline(new THREE.Path(), 43, 151, 3.5, 4.5), 0.6, C.lamp)
  led.material = toon(C.lamp, { emissive: 0.8 })
  pan.add(noOutline(P(led, 0, 0, 1.2)))
  const at = leanPanel(g, pan, 3, -0.1)
  kickstand(g, at(0, 110, -1.5), 32, frame)
  return centered(g)
}

function floorLean(p: string[]) {
  const [frame, back] = p
  const g = new THREE.Group()
  const pan = mirrorPanel((s) => rrOutline(s, 70, 180, 2), (s) => rrOutline(s, 62, 172, 1, 4), (s) => rrOutline(s, 62.6, 172.6, 1.2, 3.7), 3.5, frame, back, [-10, 120, 56])
  leanPanel(g, pan, 3.5, -0.17)
  return centered(g)
}

function floorWheel(p: string[]) {
  const [frame, back, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(6, 4, 40, frame, { x: s * 22, y: 5 }, 1))
    for (const z of [-17, 17]) {
      g.add(rbox(1.2, 2, 2, frame, { x: s * 22, y: 3.6, z }, 0.3))
      g.add(cylX(2.4, 1.6, RUBBER, s * 22, 2.4, z, 16))
    }
    g.add(rbox(4, 150, 4, frame, { x: s * 23, y: 9 }, 0.8))
  }
  g.add(rbox(50, 3, 4, frame, { y: 159 }, 0.8))
  g.add(rbox(42, 3, 4, acc, { y: 10 }, 0.8))
  g.add(mirrorPanel((s) => rrOutline(s, 42, 145, 1.5, 13), (s) => rrOutline(s, 38, 141, 1, 15), (s) => rrOutline(s, 38.6, 141.6, 1.2, 14.7), 3, frame, back, [-6, 110, 36]))
  return g
}

const FLOOR_MIR_PALS: PalFlat[] = [
  ['nordic', N.oak, N.oakL, N.white],
  ['cute', C.white, C.woodL, C.pink],
  ['modern', M.black, M.char, M.silver],
  ['retro', '#c9a24a', R.caramel, R.cream],
  ['industrial', I.iron, I.walnut, I.rust],
]

// ---- 桌上镜 ----

function tableRound(p: string[]) {
  const [frame, base] = p
  const g = new THREE.Group()
  g.add(rbox(14, 2.5, 8, base, {}, 0.6))
  g.add(noOutline(rbox(11, 0.4, 1.4, shade(base, -0.2), { y: 2.3 }, 0.1)))
  const m = new THREE.Group()
  m.add(torus(9.4, 0.7, frame))
  m.add(cylZ(9.6, 0.8, frame, 0, 0, -0.75, 32))
  m.add(lit(noOutline(cylZ(9.2, 0.6, MIR, 0, 0, 0, 32)), MIR, 0.18))
  m.add(shine(-2.5, 2.5, 11, 0.75))
  P(m, 0, 12.5, 0, -0.06, 0, 0)
  g.add(m)
  return g
}

function tableSwivel(p: string[]) {
  const [frame, rim] = p
  const g = new THREE.Group()
  g.add(puck(7, 1.8, frame))
  g.add(cyl(0.6, 0.6, 12.4, frame, { y: 1.6 }, 10))
  g.add(torus(9.8, 0.5, frame, { y: 24 }))
  for (const s of [-1, 1]) g.add(cyl(0.4, 0.4, 1.1, frame, { y: 24 + s * 9.55 - 0.55 }, 8))
  const d = new THREE.Group()
  d.add(cylZ(9, 1, rim, 0, 0, 0, 32))
  d.add(lit(noOutline(cylZ(8.6, 0.6, MIR, 0, 0, 0.4, 32)), MIR, 0.18))
  d.add(lit(noOutline(cylZ(8.6, 0.6, '#dde9f2', 0, 0, -0.4, 32)), '#dde9f2', 0.18))
  d.add(shine(-2.4, 2.4, 10, 1.15))
  P(d, 0, 24, 0, 0, 0.55, 0)
  g.add(d)
  return g
}

function tableRing(p: string[]) {
  const [body, acc] = p
  const g = new THREE.Group()
  g.add(rbox(16, 2, 10, body, {}, 0.8))
  g.add(cyl(0.7, 0.7, 0.4, acc, { x: 5, y: 1.9, z: 3 }, 12))
  g.add(rbox(3, 10, 2, body, { y: 2 }, 0.5))
  const h = new THREE.Group()
  h.add(cylZ(11.7, 2, body, 0, 0, -0.9, 36))
  h.add(lit(noOutline(cylZ(10, 0.6, MIR, 0, 0, 0.1, 32)), MIR, 0.18))
  const ring = torus(10.8, 0.9, C.lamp, { z: 0.6 })
  ring.material = toon(C.lamp, { emissive: 0.8 })
  h.add(noOutline(ring))
  h.add(shine(-2.6, 2.6, 11, 0.85))
  P(h, 0, 23, 0, -0.05, 0, 0)
  g.add(h)
  return g
}

function tableTrifold(p: string[]) {
  const [frame, base] = p
  const g = new THREE.Group()
  g.add(rbox(34, 2, 11, base, {}, 0.6))
  const panel = (w: number) => {
    const pg = new THREE.Group()
    pg.add(rbox(w, 26, 1.2, frame, {}, 0.5))
    pg.add(P(mirrorGlass(rrOutline(new THREE.Shape(), w - 2, 24, 0.6, 1), -w * 0.12, 16, w * 0.9), 0, 0, 0.85))
    return pg
  }
  g.add(P(panel(18), 0, 2, -2.5))
  const l = panel(9)
  l.children.forEach((c) => (c.position.x -= 4.5))
  g.add(P(l, -9, 2, -2.5, 0, 0.6, 0))
  const r = panel(9)
  r.children.forEach((c) => (c.position.x += 4.5))
  g.add(P(r, 9, 2, -2.5, 0, -0.6, 0))
  return centered(g)
}

function handMirror(p: string[]) {
  const [frame, brass, back] = p
  const g = new THREE.Group()
  g.add(puck(5, 1, brass))
  g.add(rbox(6, 1.5, 1, brass, { y: 0.8, z: 3 }, 0.3))
  const m = new THREE.Group()
  m.add(mirrorPanel((s) => ellOutline(s, 6, 7.5), (s) => ellOutline(s, 5, 6.5), (s) => ellOutline(s, 5.3, 6.8), 1.6, frame, back, [-1.3, 1.5, 7]))
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2
    m.add(ball(0.42, brass, { x: Math.cos(a) * 5.5, y: Math.sin(a) * 7, z: 0.75 }))
  }
  m.add(cyl(0.8, 0.6, 11, frame, { y: -18.5 }, 12))
  m.add(ball(1, brass, { y: -19 }))
  const th = -0.15
  P(m, 0, 21, -0.8, th, 0, 0)
  g.add(m)
  const a = new THREE.Vector3(0, 0, -0.8).applyEuler(new THREE.Euler(th, 0, 0)).add(m.position)
  g.add(beam([0, 0.8, -3.6], [0, a.y, a.z], 0.8, 0.4, brass, 0.15))
  return centered(g)
}

const TABLE_MIR_PALS: PalFlat[] = [
  ['cute', C.white, C.woodL, C.pink],
  ['nordic', N.oak, N.white, N.white],
  ['modern', M.black, M.char, M.char],
  ['retro', '#c9a24a', R.caramel, R.cream],
  ['japanese', J.dark, J.hinoki, J.washi],
]

// ---- 壁挂镜 ----

const WALL_MIR_MOUNT = 125
function wallRound(p: string[]) {
  const [frame, back] = p
  const g = new THREE.Group()
  g.add(mirrorPanel((s) => circOutline(s, 30), (s) => circOutline(s, 26.5), (s) => circOutline(s, 26.8), 2.5, frame, back, [-7, 7, 32]))
  g.position.set(0, WALL_MIR_MOUNT + 30, 0)
  return G0(g)
}
/** 包一层，保证外层原点在地面 */
const G0 = (g: THREE.Object3D) => {
  const o = new THREE.Group()
  o.add(g)
  return o
}

function wallSun(p: string[]) {
  const [frame, back, tip] = p
  const g = new THREE.Group()
  g.add(mirrorPanel((s) => circOutline(s, 16), (s) => circOutline(s, 13.5), (s) => circOutline(s, 13.8), 3, frame, back, [-3.5, 3.5, 17]))
  g.add(cylZ(15, 1, frame, 0, 0, -1.5, 32))
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * PI * 2
    const r1 = i % 2 ? 31 : 39
    g.add(bar([Math.cos(a) * 15.5, Math.sin(a) * 15.5, 0], [Math.cos(a) * r1, Math.sin(a) * r1, 0], i % 2 ? 0.35 : 0.5, frame, 6))
    if (!(i % 2)) g.add(ball(1, tip, { x: Math.cos(a) * 39, y: Math.sin(a) * 39 }))
  }
  g.position.set(0, WALL_MIR_MOUNT + 40, 0.25)
  return G0(g)
}

const CAB_MOUNT = 105
function wallCabinet(p: string[]) {
  const [body, door, acc] = p
  const g = new THREE.Group()
  const y = CAB_MOUNT
  g.add(rbox(60, 1.5, 12.4, body, { y, z: -1.3 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(1.5, 11, 12.4, body, { x: s * 29.25, y: y + 1.4, z: -1.3 }, 0.4))
  g.add(hollow(60, 58, 12.4, body, { y: y + 12, z: -1.3 }, 1.2))
  for (const sy of [31, 50]) g.add(rbox(57.4, 1, 11, shade(body, 0.05), { y: y + sy, z: -0.8 }, 0.2))
  g.add(noOutline(lit(rbox(50, 0.4, 2, C.lamp, { y: y + 11.7, z: 2 }, 0.1), C.lamp, 0.8)))
  // 两扇镜门，铰链在外侧
  for (const s of [-1, 1]) {
    const parts = [rbox(29.6, 56, 1.5, door, { x: s * 14.9, y: y + 13, z: 5.65 }, 0.5), P(mirrorGlass(rrOutline(new THREE.Shape(), 26.6, 52, 1, 0), -4, 34, 24), s * 14.9, y + 15, 6.65)]
    g.add(swingDoor(parts, s * 29.7, 6.4, s < 0 ? 'left' : 'right'))
  }
  g.add(noOutline(lit(rbox(40, 0.6, 1, acc, { y: y + 69.4, z: 3 }, 0.2), acc, 0.6)))
  return g
}

const WALL_MIR_PALS: PalFlat[] = [
  ['nordic', N.oak, N.white, N.mustard],
  ['modern', M.black, M.char, M.silver],
  ['retro', '#c9a24a', R.caramel, '#c9a24a'],
  ['cute', C.white, C.sakura, C.pink],
  ['industrial', I.iron, I.walnut, I.rust],
]

const MIRRORS: AssetDef[] = [
  def('mir-floor-arch', '落地镜', 'bedroom', [60, 50.4, 165.4], FLOOR_MIR_PALS, floorArch, { family: 'floor-mirror', sizeLabel: '拱形' }),
  def('mir-floor-cheval', '落地镜', 'bedroom', [63, 44, 157.2], FLOOR_MIR_PALS, floorCheval, { family: 'floor-mirror', sizeLabel: '长方形' }),
  def('mir-floor-oval', '落地镜', 'bedroom', [50, 36, 155], FLOOR_MIR_PALS, floorOval, { family: 'floor-mirror', sizeLabel: '椭圆' }),
  def('mir-floor-led', '落地镜', 'bedroom', [52, 48, 159.5], FLOOR_MIR_PALS, floorLed, { family: 'floor-mirror', sizeLabel: '带灯' }),
  def('mir-floor-lean', '落地镜', 'bedroom', [70, 34, 178], FLOOR_MIR_PALS, floorLean, { family: 'floor-mirror', sizeLabel: '靠墙斜放' }),
  def('mir-floor-wheel', '落地镜', 'bedroom', [50, 40, 162], FLOOR_MIR_PALS, floorWheel, { family: 'floor-mirror', sizeLabel: '带轮移动' }),
  def('mir-table-round', '圆形台镜', 'bedroom', [20.2, 8, 22.6], TABLE_MIR_PALS, tableRound, PROP),
  def('mir-table-swivel', '双面放大镜', 'bedroom', [20.6, 14, 34.3], TABLE_MIR_PALS, tableSwivel, PROP),
  def('mir-table-ring', 'LED 环灯化妆镜', 'bedroom', [23.4, 10, 34.7], TABLE_MIR_PALS, tableRing, PROP),
  def('mir-table-trifold', '折叠三面镜', 'bedroom', [34, 11, 28], TABLE_MIR_PALS, tableTrifold, PROP),
  def('mir-hand-stand', '复古手持镜（带支架）', 'bedroom', [12, 10, 28.5], TABLE_MIR_PALS, handMirror, PROP),
  def('mir-wall-round', '圆形壁镜', 'deco', [60, 2.5, 60], WALL_MIR_PALS, wallRound, { mount: WALL_MIR_MOUNT }),
  def('mir-wall-sun', '太阳镜', 'deco', [80, 3.5, 80], WALL_MIR_PALS, wallSun, { mount: WALL_MIR_MOUNT }),
  def(
    'mir-wall-cabinet',
    '浴室镜柜',
    'deco',
    [60, 15, 70],
    [
      ['modern', M.white, M.white, C.lamp],
      ['nordic', N.oak, N.white, C.lamp],
      ['modern', M.char, M.char, C.lamp],
      ['cute', C.white, C.sakura, C.lamp],
    ],
    wallCabinet,
    {
      mount: CAB_MOUNT,
      surfaces: [
        { y: CAB_MOUNT + 1.5, h: 9.5, shape: [rectPoly(-28.5, -7.5, 28.5, 4.9)] },
        ...[13.2, 32, 51].map((y) => ({ y: CAB_MOUNT + y, h: 17.4, inside: true, shape: [rectPoly(-28.6, -6.8, 28.6, 4.3)] })),
      ],
      openable: true,
    },
  ),
]

export const HOBBY: AssetDef[] = [...FITNESS, ...CUPS, ...HOBBY_ITEMS, ...MIRRORS]
