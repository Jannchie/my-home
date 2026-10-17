// 杂项素材包：和风家具、落地绿植、宠物、阳台户外、落地小家电、壁挂装饰。
// 约定见 kit.ts 开头。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, S, ellipsePoly, glow, holePanel, legs, rectPoly, rng, shell, type AssetDef, type Fx, type StyleTag, paintPanel, paintLandscape, paintFlower, paintAbstract } from '../kit'
import { drawerLv, drawerOf, hollow, slideDoor, swingDoor } from '../cabinetKit'
import { PI, clearMat, lit, noOutline, rod3, type V3 } from '../geo'

const { nordic: N, modern: M, japanese: J, industrial: I, retro: R } = S

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

// ---------- 小工具 ----------

const SOIL = '#8b6a4f'

/** yaw / pitch 对应的方向；pitch 负值朝上 */
const dirOf = (yaw: number, pitch: number): V3 => [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
/** 水平角 a（x = cos a, z = sin a）换算成 yaw */
const yawTo = (a: number) => PI / 2 - a
const along = (b: V3, d: V3, l: number): V3 => [b[0] + d[0] * l, b[1] + d[1] * l, b[2] + d[2] * l]
/** 叶片：叶柄端在 base，沿 yaw / pitch 方向伸出 */
function sprig(len: number, color: string, base: V3, yaw: number, pitch: number, wide = 0.45) {
  const m = ball(len / 2, color, {}, [wide, 0.12, 1])
  m.rotation.set(pitch, yaw, 0, 'YXZ')
  m.position.set(...along(base, dirOf(yaw, pitch), len / 2))
  return m
}
/** 空心花盆 + 低于口沿的土面 */
function pot(rTop: number, rBot: number, h: number, t: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const g = G(cup(rTop, rBot, h, t, color))
  const sy = h - 3.5
  const r = rBot + ((rTop - rBot) * sy) / h - t - 0.3
  g.add(cyl(r, r, 0.8, SOIL, { y: sy }))
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return g
}
/** 竖直面上的圆片（画、表盘），中心在 (x, y, z)，朝 +z */
function disc(r: number, color: string, x: number, y: number, z: number, t = 0.4, seg = 24) {
  return noOutline(cyl(r, r, t, color, { x, y: y - t / 2, z, rx: PI / 2 }, seg))
}

// ======================================================================
// 和风
// ======================================================================

/** 桐箪笥的抽屉格：四层通长抽屉 + 上面左右两只 */
const KIRI_SURFACES = [...[0, 1, 2, 3].map((i) => drawerLv(-47, 47, 10 + i * 20.5, 19, 21.9, 40)), ...[-1, 1].map((s) => drawerLv(s * 23.75 - 22.75, s * 23.75 + 22.75, 93, 22, 21.9, 40))]

function kiriTansu(p: string[]) {
  const [main, , metal] = p
  const w = 100
  const d = 45
  const g = new THREE.Group()
  g.add(rbox(w - 4, 6, d - 4, shade(main, -0.14), {}, 1))
  g.add(hollow(w, 114, d, main, { y: 6 }, 1.6))
  const fz = d / 2
  // 抽屉：面板 + 金属把手，拉出来是抽屉盒
  const drawer = (x: number, y: number, dw: number, dh: number, n: number) => {
    const front: THREE.Object3D[] = [rbox(dw, dh, 1.2, shade(main, 0.04), { x, y, z: fz }, 0.6)]
    for (let i = 0; i < n; i++) {
      const hx = n === 1 ? x : x + (i - (n - 1) / 2) * dw * 0.5
      front.push(rbox(5, 2.2, 0.8, metal, { x: hx, y: y + dh / 2 + 1.2, z: fz + 0.9 }, 0.3))
      front.push(torus(2.6, 0.45, metal, { x: hx, y: y + dh / 2 - 1.2, z: fz + 1.2 }))
    }
    g.add(drawerOf(front, x - dw / 2, x + dw / 2, y, dh, fz - 0.6, 40, shade(main, 0.06)))
  }
  for (let i = 0; i < 4; i++) drawer(0, 10 + i * 20.5, w - 6, 19, 2)
  for (const s of [-1, 1]) drawer(s * 23.75, 93, 45.5, 22, 1)
  // 两侧提手
  for (const s of [-1, 1]) {
    g.add(rbox(0.8, 3, 8, metal, { x: s * (w / 2 + 0.3), y: 98 }, 0.3))
    g.add(torus(4, 0.6, metal, { x: s * (w / 2 + 0.9), y: 96, ry: PI / 2 }))
  }
  return g
}

/** 茶箪笥：下段引戸里、右上天袋里各一层 */
const CHA_SURFACES = [
  { y: 5.6, h: 36.6, inside: true, shape: [rectPoly(-43.2, -18.4, 43.2, 18.6)] },
  { y: 74.2, h: 11.4, inside: true, shape: [rectPoly(3.4, -18.6, 41.6, 15.4)] },
]

function chaTansu(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(88, 4, 38, shade(main, -0.14), {}, 1))
  g.add(hollow(90, 42, 40, main, { y: 4 }, 1.6))
  // 下段引戸，前后错开：前轨那扇推到右边
  g.add(slideDoor([rbox(44, 36, 1.2, sub, { x: -21, y: 7, z: 20.4 }, 0.5), disc(1.6, C.ink, -6, 25, 21.05, 0.5, 16)], 42))
  g.add(rbox(44, 36, 1.2, sub, { x: 21, y: 7, z: 19.9 }, 0.5))
  g.add(disc(1.6, C.ink, 6, 25, 20.55, 0.5, 16))
  // 上段：侧板、背板、顶板
  for (const s of [-1, 1]) g.add(rbox(2.5, 41, 40, main, { x: s * 43.75, y: 46 }, 0.6))
  g.add(rbox(85, 41, 1.5, shade(main, -0.06), { y: 46, z: -19.25 }, 0.4))
  g.add(rbox(90, 3, 40, main, { y: 87 }, 1))
  // 违い棚
  g.add(rbox(42, 2, 34, main, { x: -21, y: 64, z: -2 }, 0.5))
  g.add(rbox(42, 2, 34, main, { x: 21, y: 56, z: -2 }, 0.5))
  g.add(rbox(2, 8, 2, main, { x: 0, y: 58 }, 0.4))
  // 右上的小天袋：左边那扇在前轨，推到右边
  g.add(hollow(40, 14, 36, main, { x: 22.5, y: 73, z: -2 }, 1.2))
  g.add(slideDoor([rbox(18.6, 12, 1, sub, { x: 13, y: 74, z: 17.1 }, 0.4), disc(0.9, C.ink, 20, 80, 17.75, 0.4, 12)], 19))
  g.add(rbox(18.6, 12, 1, sub, { x: 32, y: 74, z: 16.1 }, 0.4))
  g.add(disc(0.9, C.ink, 25, 80, 16.75, 0.4, 12))
  return g
}

function byobu(p: string[]) {
  const [frame, paper, acc] = p
  const g = new THREE.Group()
  const n = 6
  const seg = 30
  const dx = seg * Math.cos(0.5)
  const dz = seg * Math.sin(0.5)
  const xs = Array.from({ length: n + 1 }, (_, k) => -(n * dx) / 2 + k * dx)
  const zs = Array.from({ length: n + 1 }, (_, k) => (k % 2 ? dz / 2 : -dz / 2))
  for (let i = 0; i < n; i++) {
    // 框底着地（以前整扇屏风离地 2cm 悬空）
    const pg = G(rbox(seg, 148, 2, frame, {}, 0.8), rbox(seg - 4, 138, 2.8, paper, { y: 5 }, 0.4))
    // 金云
    pg.add(noOutline(rbox(seg - 4, 9, 0.6, acc, { y: 104 + (i % 3) * 7, z: 1.9 }, 0.3)))
    pg.add(noOutline(rbox(seg - 4, 6, 0.6, acc, { y: 30 + ((i + 1) % 2) * 6, z: 1.9 }, 0.3)))
    if (i === 4) pg.add(disc(7, J.shu, 0, 128, 1.9))
    if (i < 3)
      for (let k = 0; k < 3; k++) pg.add(noOutline(ball(1.4, C.sakura, { x: -8 + k * 7, y: 70 + ((k * 13 + i * 7) % 24), z: 1.6 }, [1, 1, 0.3])))
    pg.position.set((xs[i] + xs[i + 1]) / 2, 0, (zs[i] + zs[i + 1]) / 2)
    pg.rotation.y = Math.atan2(-(zs[i + 1] - zs[i]), dx)
    g.add(pg)
  }
  return g
}

function tsuitate(p: string[]) {
  const [main, paper] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(6, 5, 36, main, { x: s * 40 }, 1.5))
    g.add(rbox(4, 102, 4, main, { x: s * 40, y: 5 }, 0.8))
  }
  g.add(rbox(84, 3, 4, main, { y: 104 }, 0.8))
  g.add(rbox(76, 74, 2.4, main, { y: 26 }, 0.6))
  g.add(rbox(68, 66, 3.2, paper, { y: 30 }, 0.3))
  g.add(rbox(76, 3, 3, main, { y: 14 }, 0.6))
  // 墨竹
  const zf = 1.9
  for (const [x, h] of [[-18, 56], [-10, 46]]) {
    g.add(noOutline(rbox(1.8, h, 0.6, J.sumi, { x, y: 33, z: zf }, 0.3)))
    for (let k = 1; k < 4; k++) g.add(noOutline(rbox(2.6, 0.6, 0.7, J.sumi, { x, y: 33 + (h * k) / 4, z: zf + 0.1 }, 0.2)))
  }
  for (const [x, y, rz] of [[-13, 84, 0.6], [-22, 80, -0.5], [-6, 72, 0.9], [-14, 66, -0.3]]) {
    const m = noOutline(ball(4, J.sumi, { x, y, z: zf }, [1, 0.3, 0.1]))
    m.rotation.z = rz
    g.add(m)
  }
  g.add(disc(3, J.shu, 22, 40, zf))
  return g
}

function butsudan(p: string[]) {
  const [main, gold] = p
  const g = new THREE.Group()
  const zc = -10
  g.add(rbox(46, 6, 30, main, { z: zc }, 1.5))
  for (const s of [-1, 1]) g.add(rbox(3, 50, 30, main, { x: s * 21.5, y: 6, z: zc }, 1))
  g.add(rbox(40, 50, 2, main, { y: 6, z: -24 }, 0.6))
  g.add(rbox(48, 5, 32, main, { y: 56, z: zc }, 1.5))
  g.add(glow(38, 46, '#ffe7a6', { y: 8, z: -22.6 }, 0.3))
  // 须弥壇 + 莲台
  g.add(rbox(36, 8, 12, gold, { y: 6, z: -16 }, 1))
  g.add(rbox(26, 6, 8, shade(gold, -0.06), { y: 14, z: -18 }, 1))
  g.add(puck(4, 3, gold, { y: 20, z: -18 }))
  g.add(ball(2.6, shade(gold, 0.05), { y: 25.5, z: -18 }))
  // 吊灯笼
  for (const s of [-1, 1]) {
    g.add(rod3([s * 13, 56, -14], [s * 13, 46, -14], 0.25, gold, 4))
    g.add(lit(ball(2, '#ffd27a', { x: s * 13, y: 44, z: -14 }, [1, 1.3, 1]), '#ffd27a'))
  }
  // 前面的香炉、蜡烛、花、おりん
  g.add(cup(3.4, 2.8, 3.5, 0.5, J.sumi, { y: 6, z: 0 }))
  g.add(rod3([0, 8, 0], [0.6, 15, 0], 0.18, '#8a5a3c', 4))
  g.add(lit(ball(0.35, C.orange, { x: 0.6, y: 15.1, z: 0 }), C.orange, 0.9))
  g.add(cyl(0.9, 0.9, 6, C.white, { x: -11, y: 6, z: 0 }, 10))
  g.add(cyl(0.12, 0.12, 0.8, C.ink, { x: -11, y: 12, z: 0 }, 6))
  g.add(lit(ball(0.3, C.lemon, { x: -11, y: 13.1, z: 0 }, [1, 1.7, 1]), C.lemon, 0.95))
  g.add(cyl(1.6, 2.2, 6, gold, { x: 11, y: 6, z: -2 }, 12))
  for (const [x, y, c] of [[10, 15, C.white], [12.5, 14, J.shu], [11, 16.5, C.lemon]] as [number, number, string][]) {
    g.add(rod3([11, 11, -2], [x, y, -2], 0.2, C.leafD, 4))
    g.add(ball(1.3, c, { x, y, z: -2 }))
  }
  g.add(puck(3, 1, J.shu, { x: 6, y: 6, z: 2 }))
  g.add(cup(2.4, 1.8, 2.4, 0.35, gold, { x: 6, y: 7, z: 2 }))
  // 打开的门扇，内侧贴金
  for (const s of [-1, 1]) {
    const dg = G(rbox(20, 48, 1.5, main, { x: -s * 10 }, 0.6), rbox(16, 42, 0.6, gold, { x: -s * 10, y: 3, z: -1.1 }, 0.3))
    dg.position.set(s * 23, 7, 5)
    dg.rotation.y = s * 1.745
    g.add(dg)
  }
  return g
}

const BUTSUDAN_FX: Fx[] = [
  { kind: 'smoke', x: 0.6, y: 15.4, z: 0, scale: 0.6 },
  { kind: 'flame', x: -11, y: 12.8, z: 0, scale: 0.35 },
]

function zaisu(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(44, 3, 42, shade(main, -0.2), { z: 7 }, 1.2))
  g.add(rbox(44, 8, 40, main, { y: 2, z: 8 }, 3.5))
  g.add(rbox(38, 3.5, 32, sub, { y: 9.5, z: 10 }, 1.6))
  const back = G(rbox(42, 40, 8, main, {}, 3.5), rbox(36, 32, 2, sub, { y: 4, z: 4.2 }, 0.9), rbox(40, 36, 2, shade(main, -0.2), { y: 2, z: -4.5 }, 0.8))
  back.position.set(0, 7, -10)
  back.rotation.x = -0.35
  g.add(back)
  for (const s of [-1, 1]) g.add(noOutline(cyl(2, 2, 1, shade(main, -0.3), { x: s * 22.5, y: 9, z: -10, rz: PI / 2 }, 12)))
  return g
}

const KAKEJIKU_MOUNT = 70
function kakejiku(p: string[]) {
  const [brocade, rodC, paper] = p
  const y0 = KAKEJIKU_MOUNT
  const g = new THREE.Group()
  g.add(rbox(38, 132, 0.8, brocade, { y: y0 + 4, z: -1.4 }, 0.3))
  g.add(rbox(30, 94, 0.8, paper, { y: y0 + 22, z: -0.9 }, 0.3))
  // 轴、天杆、挂绳
  g.add(rod3([-21, y0 + 3.4, -0.6], [21, y0 + 3.4, -0.6], 1.4, rodC, 12))
  for (const s of [-1, 1]) g.add(ball(1.9, rodC, { x: s * 21.5, y: y0 + 3.4, z: -0.6 }))
  g.add(rbox(40, 2.4, 2, rodC, { y: y0 + 136, z: -1 }, 0.6))
  for (const s of [-1, 1]) g.add(rod3([s * 13, y0 + 138, -1], [0, y0 + 148, -1], 0.3, J.sumi, 4))
  g.add(ball(0.9, J.sumi, { y: y0 + 148, z: -1 }))
  // 画心：朱日、远山、一行字
  const z = -0.15
  g.add(disc(4.5, J.shu, 7, y0 + 96, z))
  g.add(noOutline(ball(9, shade(J.ai, 0.3), { x: -4, y: y0 + 30, z }, [1.4, 0.9, 0.04])))
  g.add(noOutline(ball(6, shade(J.ai, 0.15), { x: 7, y: y0 + 28, z: z + 0.15 }, [1.3, 0.9, 0.04])))
  for (let k = 0; k < 5; k++) g.add(noOutline(rbox(k % 2 ? 2.4 : 3.2, 0.9, 0.3, J.sumi, { x: -9, y: y0 + 106 - k * 6, z }, 0.2)))
  return g
}

function ikebana(p: string[]) {
  const [main, vase, flower] = p
  const g = new THREE.Group()
  g.add(legs(34, 34, 55, main, 1.8, 3, false))
  g.add(rbox(32, 2, 32, main, { y: 12 }, 0.6))
  g.add(rbox(38, 3, 38, main, { y: 55 }, 1))
  // 水盘
  g.add(cup(14, 12, 5, 1, vase, { y: 58 }))
  g.add(noOutline(clearMat(cyl(12.2, 12.2, 0.4, C.glass, { y: 61.4 }), C.glass, 0.6)))
  // 天地人
  const base: V3 = [2, 61, 0]
  const lines: [V3, string, number][] = [
    [[-7, 96, -4], flower, 3.2],
    [[11, 82, 3], shade(flower, 0.1), 2.6],
    [[-2, 74, 8], C.white, 2.4],
  ]
  for (const [tip, c, r] of lines) {
    g.add(rod3(base, tip, 0.45, C.leafD, 6))
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2
      g.add(ball(r * 0.6, c, { x: tip[0] + Math.cos(a) * r * 0.6, y: tip[1], z: tip[2] + Math.sin(a) * r * 0.6 }, [1, 0.6, 1]))
    }
    g.add(ball(r * 0.4, C.lemon, { x: tip[0], y: tip[1] + 0.6, z: tip[2] }))
  }
  g.add(sprig(18, C.leafD, base, yawTo(0.3), -1.1, 0.18))
  g.add(sprig(16, C.leaf, base, yawTo(2.6), -0.8, 0.2))
  g.add(sprig(12, C.leaf, base, yawTo(4.4), -0.5, 0.22))
  return g
}

function bonsaiStand(p: string[]) {
  const [main, potC] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(6, 22, 30, main, { x: s * 24 }, 1.2))
  g.add(rbox(60, 3, 32, main, { y: 22 }, 1))
  // 浅盆
  g.add(tray(32, 6, 20, 1.2, potC, { y: 25 }, 0.6))
  g.add(rbox(29, 1, 17, SOIL, { y: 28.4 }, 0.4))
  for (const [x, z] of [[-9, 4], [8, -3], [11, 5]]) g.add(ball(2.4, C.leafD, { x, y: 29.6, z }, [1, 0.5, 1]))
  // 松：弯曲的干 + 一团团的枝叶
  const pts: V3[] = [[0, 29, 0], [-4, 36, 1], [3, 43, -1], [-2, 50, 0], [4, 55, 0]]
  for (let i = 0; i < pts.length - 1; i++) g.add(rod3(pts[i], pts[i + 1], 1.8 - i * 0.3, '#8a6a52', 8))
  g.add(rod3([-4, 36, 1], [-14, 40, 2], 0.9, '#8a6a52', 6))
  g.add(rod3([3, 43, -1], [13, 47, -1], 0.9, '#8a6a52', 6))
  const pads: [V3, number][] = [
    [[-15, 41, 2], 7],
    [[14, 48, -1], 7],
    [[-3, 51, 1], 6.5],
    [[5, 57, 0], 6],
  ]
  for (const [[x, y, z], r] of pads) g.add(ball(r, C.leafD, { x, y, z }, [1.3, 0.45, 1]))
  return g
}

function hibachi(p: string[]) {
  const [main, band] = p
  const g = new THREE.Group()
  g.add(cup(20, 16, 28, 2.2, main))
  g.add(torus(18.7, 0.6, band, { y: 18, rx: PI / 2 }))
  g.add(torus(17.5, 0.5, band, { y: 6, rx: PI / 2 }))
  g.add(cyl(16.8, 16.8, 0.6, '#d8d0c8', { y: 22 }))
  // 炭：只留烧红的炭心，火苗交给 fx（HIBACHI_FX）
  for (const [x, z] of [[-3, -2], [2.5, 1.5], [-1, 4]]) {
    g.add(rbox(4, 2.6, 3.4, '#3a3036', { x, y: 22.4, z }, 1))
    g.add(lit(ball(0.7, C.orange, { x: x + 0.6, y: 24.8, z: z + 1.2 }, [1.3, 0.6, 1.1]), C.red, 0.9))
  }
  // 五徳 + 铁壶
  g.add(torus(9, 0.5, J.sumi, { y: 28, rx: PI / 2 }))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2
    g.add(rod3([Math.cos(a) * 9, 28, Math.sin(a) * 9], [Math.cos(a) * 11, 22.6, Math.sin(a) * 11], 0.45, J.sumi, 5))
  }
  const iron = '#4a4a55'
  g.add(ball(8, iron, { y: 35 }, [1, 0.8, 1]))
  g.add(puck(3.6, 1.4, shade(iron, 0.08), { y: 40.4 }))
  g.add(ball(1, shade(iron, 0.15), { y: 42.3 }))
  g.add(rod3([0, 34, 6], [0, 38.5, 11], 1.1, iron, 8))
  for (const s of [-1, 1]) g.add(ball(1, J.sumi, { x: s * 7, y: 39.5 }))
  g.add(torus(7, 0.6, J.sumi, { y: 40 }, PI))
  return g
}
const HIBACHI_FX: Fx[] = [
  { kind: 'flame', x: -2.4, y: 25, z: -0.8, scale: 0.6, height: 3 },
  { kind: 'flame', x: 3.1, y: 25, z: 2.7, scale: 0.5, height: 3 },
  { kind: 'steam', x: 0, y: 38.8, z: 11.3, scale: 0.6 },
]

function shojiLamp(p: string[]) {
  const [main, paper] = p
  const g = new THREE.Group()
  g.add(rbox(32, 4, 32, main, {}, 1))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 132, 2.4, main, { x: sx * 13, z: sz * 13, y: 4 }, 0.5))
  g.add(rbox(32, 4, 32, main, { y: 136 }, 1))
  g.add(lit(rbox(24, 110, 24, paper, { y: 20 }, 0.8), paper, 0.55))
  // 组子格
  for (let k = 0; k <= 5; k++) {
    const y = 20 + k * 22 - (k === 5 ? 1.2 : 0)
    for (const s of [-1, 1]) {
      g.add(rbox(25, 1.2, 1.2, main, { y, z: s * 12.9 }, 0.3))
      g.add(rbox(1.2, 1.2, 25, main, { y, x: s * 12.9 }, 0.3))
    }
  }
  for (const s of [-1, 1]) {
    g.add(rbox(1.2, 110, 1.2, main, { y: 20, z: s * 12.9 }, 0.3))
    g.add(rbox(1.2, 110, 1.2, main, { y: 20, x: s * 12.9 }, 0.3))
    g.add(rbox(26, 1.6, 1.6, main, { y: 10, z: s * 13 }, 0.3))
  }
  return g
}

// ======================================================================
// 绿植
// ======================================================================

function fiddleLeaf(p: string[], s = 1) {
  const [potC] = p
  const g = G(pot(18 * Math.min(1, s + 0.15), 14 * Math.min(1, s + 0.15), 34 * Math.min(1, s + 0.15), 2.2, potC))
  const py = 31 * Math.min(1, s + 0.15)
  const topY = 150 * s
  const top: V3 = [2, topY, 1]
  g.add(rod3([0, py, 0], top, 1.8 * s, C.woodD, 8))
  const rand = rng(11)
  const n = Math.round(18 * s)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const y = topY * 0.48 + t * (topY * 0.5)
    const k = (y - py) / (topY - py)
    g.add(sprig((26 - t * 6) * Math.sqrt(s), i % 3 ? C.leaf : C.leafD, [2 * k, y, k], yawTo(i * 2.4), -0.15 - t * 0.7 + rand() * 0.1, 0.72))
  }
  g.add(sprig(18 * Math.sqrt(s), C.leaf, top, 0, -1.3, 0.7))
  return g
}

function snakePlant(p: string[]) {
  const [potC] = p
  const g = G(pot(14, 12, 26, 1.8, potC))
  const rand = rng(5)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + rand() * 0.4
    const L = 42 + rand() * 18
    const r = i < 3 ? 1.5 : 5.5
    const m = ball(L / 2, i % 2 ? C.leafD : '#6fb06a', { y: L / 2 - 1 }, [0.2, 1, 0.06])
    m.rotation.y = rand() * PI
    const tilt = 0.05 + rand() * 0.14
    const lg = G(m)
    lg.position.set(Math.cos(a) * r, 22, Math.sin(a) * r)
    lg.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)
    g.add(lg)
  }
  return g
}

function olive(p: string[]) {
  const [potC] = p
  const g = G(pot(18, 15, 36, 2, potC))
  const bark = '#a08870'
  g.add(rod3([0, 33, 0], [-2, 90, 1], 2, bark, 8))
  g.add(rod3([-2, 90, 1], [1, 122, 0], 1.6, bark, 8))
  g.add(rod3([1, 122, 0], [-13, 142, 5], 1, bark, 6))
  g.add(rod3([1, 122, 0], [12, 146, -4], 1, bark, 6))
  g.add(rod3([-2, 100, 1], [11, 116, 7], 0.9, bark, 6))
  const crowns: [V3, number][] = [
    [[-14, 146, 5], 15],
    [[13, 150, -4], 15],
    [[1, 160, 0], 14],
    [[12, 120, 8], 10],
    [[-6, 132, -8], 12],
  ]
  crowns.forEach(([[x, y, z], r], i) => g.add(ball(r, i % 2 ? '#89ad74' : '#9fbf86', { x, y, z }, [1, 0.8, 1])))
  for (const [x, y, z] of [[-20, 140, 15], [18, 146, 8], [4, 156, 13], [15, 118, 17], [-24, 148, -2]]) g.add(ball(1.3, '#6b5a7a', { x, y, z }, [1, 1.3, 1]))
  return g
}

function birdOfParadise(p: string[]) {
  const [potC] = p
  const g = G(pot(20, 16, 34, 2.2, potC))
  const rand = rng(21)
  const base: V3 = [0, 30, 0]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + rand() * 0.5
    const t = 0.1 + rand() * 0.18
    const L = 45 + rand() * 35
    const tip = along(base, dirOf(yawTo(a), -(PI / 2 - t)), L)
    g.add(noOutline(rod3(base, tip, 0.9, C.leafD, 6)))
    g.add(sprig(44, i % 2 ? C.leaf : C.leafD, tip, yawTo(a), -(PI / 2 - t * 1.4), 0.36))
  }
  // 鹤望兰花
  const a = 1.0
  const tip = along(base, dirOf(yawTo(a), -(PI / 2 - 0.22)), 62)
  g.add(noOutline(rod3(base, tip, 0.8, C.leafD, 6)))
  g.add(sprig(14, C.leafD, tip, yawTo(a + 1.5), -0.15, 0.28))
  for (const [da, pit, c] of [[1.2, -1.1, C.orange], [1.5, -0.8, C.orange], [1.0, -0.9, R.orange], [1.4, -0.5, '#7a8ff0']] as [number, number, string][])
    g.add(sprig(10, c, tip, yawTo(a + da), pit, 0.25))
  return g
}

function alocasia(p: string[]) {
  const [potC] = p
  const g = G(pot(19, 15, 32, 2.2, potC))
  const rand = rng(8)
  const base: V3 = [0, 28, 0]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + rand() * 0.4
    const t = 0.12 + rand() * 0.18
    const L = 40 + rand() * 30
    const tip = along(base, dirOf(yawTo(a), -(PI / 2 - t)), L)
    g.add(noOutline(rod3(base, tip, 0.9, '#6f9a52', 6)))
    g.add(sprig(30, i % 2 ? C.leafD : '#5aa865', tip, yawTo(a), -0.6, 0.85))
  }
  return g
}

const HANGING_MOUNT = 120
function hangingPlant(p: string[]) {
  const [potC] = p
  const y0 = HANGING_MOUNT
  const g = new THREE.Group()
  // 壁挂支架
  g.add(rbox(5, 22, 1.6, J.sumi, { y: y0 + 46, z: -25.2 }, 0.6))
  g.add(rod3([0, y0 + 66, -25], [0, y0 + 66, 0], 0.8, J.sumi, 8))
  g.add(rod3([0, y0 + 48, -25], [0, y0 + 66, -10], 0.6, J.sumi, 8))
  g.add(torus(1.4, 0.35, J.sumi, { y: y0 + 64.6, ry: PI / 2 }))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.5
    g.add(noOutline(rod3([0, y0 + 64, 0], [Math.cos(a) * 12, y0 + 31.5, Math.sin(a) * 12], 0.25, C.cream, 4)))
  }
  g.add(pot(13, 9, 20, 1.4, potC, { y: y0 + 12 }))
  // 吊兰叶
  const rand = rng(17)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2 + rand() * 0.3
    const pitch = -0.5 + rand() * 1.4
    const len = (20 + rand() * 6) * (Math.sin(a) < -0.3 ? 0.75 : 1)
    g.add(sprig(len, i % 2 ? C.leaf : '#b9e08a', [Math.cos(a) * 4, y0 + 30, Math.sin(a) * 4], yawTo(a), pitch, 0.16))
  }
  // 垂下的小苗
  for (const [x, z] of [[-14, 8], [12, 10]]) {
    g.add(noOutline(rod3([x * 0.6, y0 + 30, z * 0.5], [x, y0 + 6, z], 0.25, C.leafD, 4)))
    for (let k = 0; k < 4; k++) g.add(sprig(7, C.leaf, [x, y0 + 5, z], yawTo((k / 4) * PI * 2), -0.5, 0.2))
  }
  return g
}

function bambooPot(p: string[]) {
  const [box] = p
  const g = G(tray(34, 30, 34, 2, box))
  g.add(rbox(29.4, 1, 29.4, SOIL, { y: 26 }, 0.3))
  for (const [x, z] of [[-9, 8], [10, -9], [9, 10]]) g.add(ball(1.6, C.white, { x, y: 27.2, z }, [1, 0.6, 1]))
  const rand = rng(9)
  const stalks: [number, number, number][] = [
    [-6, -5, 118],
    [5, -7, 104],
    [-2, 6, 96],
    [7, 4, 112],
    [0, -1, 86],
  ]
  for (const [x, z, h] of stalks) {
    g.add(cyl(1.4, 1.4, h, '#a5d273', { x, y: 27, z }, 10))
    for (let k = 1; k * 16 < h; k++) {
      const y = 27 + k * 16
      g.add(torus(1.45, 0.4, '#7fb257', { x, y, z, rx: PI / 2 }))
      if (k * 16 > h * 0.55)
        for (let j = 0; j < 2; j++) g.add(sprig(13, j ? C.leafD : C.leaf, [x, y, z], rand() * PI * 2, 0.25 + rand() * 0.35, 0.22))
    }
    for (let j = 0; j < 3; j++) g.add(sprig(11, C.leaf, [x, 27 + h, z], rand() * PI * 2, -0.4 - rand() * 0.4, 0.22))
  }
  return g
}

function flowerRack(p: string[]) {
  const [main, potC] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 38
    g.add(rod3([x, 0, 17], [x, 92, -12], 1.4, main, 8))
    g.add(rod3([x, 0, -18], [x, 92, -18], 1.4, main, 8))
    g.add(rod3([x, 92, -12], [x, 92, -18], 1.4, main, 8))
  }
  const cols = [C.pink, C.lemon, C.lilac, C.white, C.red, C.peach]
  const rand = rng(31)
  let ci = 0
  for (const [y, xs] of [[26, [-26, 0, 26]], [54, [-26, 0, 26]], [82, [-20, 20]]] as [number, number[]][]) {
    const zf = 17 - (29 * y) / 92
    const depth = zf + 18
    const zc = (zf - 18) / 2
    g.add(rbox(78, 2, depth, main, { y, z: zc }, 0.6))
    const pz = y === 82 ? zc : zc + 2
    for (const x of xs) {
      const top = y + 2
      g.add(pot(5, 4, 9, 0.9, potC, { x, y: top, z: pz }))
      const fy = top + 7
      const kind = ci % 3
      const c = cols[ci++ % cols.length]
      if (kind === 0) {
        g.add(noOutline(rod3([x, fy - 1, pz], [x, fy + 4, pz], 0.3, C.leafD, 4)))
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * PI * 2
          g.add(ball(1.6, c, { x: x + Math.cos(a) * 1.8, y: fy + 4, z: pz + Math.sin(a) * 1.8 }, [1, 0.5, 1]))
        }
        g.add(ball(1, C.lemon, { x, y: fy + 4.5, z: pz }))
        g.add(sprig(5, C.leaf, [x, fy + 1, pz], rand() * 6, 0.1, 0.4))
      } else if (kind === 1) {
        for (let k = 0; k < 5; k++) g.add(sprig(7, C.leaf, [x, fy, pz], yawTo((k / 5) * PI * 2), -0.5 - rand() * 0.4, 0.35))
        for (let k = 0; k < 3; k++) g.add(ball(1.2, c, { x: x - 2 + k * 2, y: fy + 5 + (k % 2), z: pz + 1 }))
      } else {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * PI * 2
          g.add(sprig(4, '#8fc9a0', [x, fy, pz], yawTo(a), -0.35, 0.6))
        }
        g.add(ball(1.6, '#8fc9a0', { x, y: fy + 1.2, z: pz }, [1, 1.2, 1]))
      }
    }
  }
  return g
}

// ======================================================================
// 宠物
// ======================================================================

/** 山墙三角板：底边宽 w、高 h，底边在 y0，厚 t，中心在 z */
function gable(w: number, h: number, t: number, color: string, y0: number, z: number) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)])
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false })
  geo.translate(0, 0, -t / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.set(0, y0, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function dogHouse(p: string[]) {
  const [main, roof, acc] = p
  const g = new THREE.Group()
  const t = 2.5
  g.add(rbox(66, 4, 74, shade(main, -0.12), {}, 1.2))
  // 墙：空心外壳，正面开拱门（留 2cm 门槛），不封顶，屋顶直接盖住
  const walls = shell(60, 36, 70, t, main, { front: [{ kind: 'arch', x: 0, y: 2, w: 24, h: 25 }], top: false, bottom: false })
  walls.position.y = 4
  g.add(walls)
  // 前后山墙（斜边藏进屋顶板里）
  for (const s of [-1, 1]) g.add(gable(59, 29.5, t, main, 39.6, s * (35 - t / 2)))
  for (const s of [-1, 1]) g.add(rbox(48, 3, 80, roof, { x: s * 18.03, y: 54.1 - 1.5, rz: -s * (PI / 4) }, 1.2))
  g.add(rod3([0, 71.5, -40], [0, 71.5, 40], 2, shade(roof, -0.08), 12))
  // 里面的垫子（高过门槛，从门口看得到）
  g.add(rbox(52, 5, 60, shade(acc, 0.12), { y: 4 }, 2.2))
  g.add(ball(6, C.cream, { x: 12, y: 10, z: -16 }, [1.4, 0.6, 1]))
  // 门牌
  g.add(noOutline(rbox(14, 4.6, 0.6, C.cream, { y: 31.5, z: 35.4 }, 0.8)))
  g.add(noOutline(ball(1.2, acc, { y: 33.8, z: 35.8 }, [1, 1, 0.4])))
  return g
}

function catBed(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(puck(24, 6, main))
  g.add(torus(19, 5, main, { y: 9, rx: PI / 2 }))
  g.add(puck(15, 4, sub, { y: 4.5 }))
  g.add(ball(3, acc, { x: 6, y: 11.2, z: 3 }))
  g.add(noOutline(torus(3, 0.3, shade(acc, -0.1), { x: 6, y: 11.2, z: 3, ry: 0.6 })))
  return g
}

function litterBox(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  // 盆体：空心，里面的猫砂低于入口下沿
  g.add(tray(52, 14, 42, 1.6, sub, {}, 0.7))
  g.add(rbox(48.6, 8, 38.6, '#e8dcc6', { y: 1.4 }, 1.5))
  const rand = rng(11)
  for (let k = 0; k < 9; k++) g.add(noOutline(ball(1.6 + rand(), '#ddcfb5', { x: (rand() - 0.5) * 40, y: 9.3, z: (rand() - 0.5) * 30 }, [1.3, 0.35, 1])))
  // 罩子：空心外壳，正面开拱形入口（下沿 15 高于猫砂面 9.4）
  const hood = shell(50, 22, 40, 1.5, main, { front: [{ kind: 'arch', x: 0, y: 1.5, w: 19, h: 17 }], bottom: false })
  hood.position.y = 13.5
  g.add(hood)
  g.add(rbox(18, 3, 5, sub, { y: 35 }, 1.4))
  for (let k = 0; k < 3; k++) g.add(noOutline(rbox(1, 0.6, 10, shade(main, -0.15), { x: -6 + k * 6, y: 35.2, z: -12 }, 0.2)))
  return g
}

function petBowl(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(38, 3, 20, main, {}, 1.5))
  for (const s of [-1, 1]) g.add(cup(7.5, 6, 6, 1, sub, { x: s * 9.5, y: 3 }))
  const rand = rng(4)
  for (let k = 0; k < 14; k++) {
    const a = rand() * PI * 2
    const r = rand() * 4
    g.add(ball(1.1, '#c98b52', { x: -9.5 + Math.cos(a) * r, y: 5 + rand() * 1.5, z: Math.sin(a) * r }, [1, 0.7, 1]))
  }
  g.add(noOutline(clearMat(cyl(5.8, 5.8, 0.3, C.sky, { x: 9.5, y: 7 }), C.sky, 0.6)))
  // 爪印
  g.add(noOutline(ball(1.4, C.pink, { y: 1.5, z: 10.2 }, [1, 1, 0.25])))
  for (let k = 0; k < 3; k++) g.add(noOutline(ball(0.6, C.pink, { x: -1.2 + k * 1.2, y: 2.7 - (k % 2) * 0.3, z: 10.1 }, [1, 1, 0.3])))
  return g
}

function dog(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(ball(12, main, { y: 14, z: -4 }, [1, 1.15, 1.25]))
  g.add(ball(8, sub, { y: 18, z: 4 }, [1, 1.2, 0.7]))
  for (const s of [-1, 1]) {
    g.add(ball(6, main, { x: s * 9, y: 6, z: -8 }, [0.8, 1, 1.3]))
    g.add(capsule(2.8, 10, main, { x: s * 5, z: 6 }))
    g.add(ball(3.2, sub, { x: s * 5, y: 2, z: 8 }, [1, 0.7, 1.1]))
  }
  g.add(ball(10, main, { y: 34, z: 4 }))
  g.add(ball(5, sub, { y: 31, z: 12 }, [1.2, 0.8, 0.9]))
  g.add(ball(1.3, C.ink, { y: 32.6, z: 16.3 }))
  for (const s of [-1, 1]) {
    const ear = cyl(0.3, 4.5, 8, main, { x: s * 6, y: 40.5, z: 3, rz: -s * 0.25 }, 4)
    ear.rotation.y = PI / 4
    g.add(ear)
  }
  g.add(face(14, { y: 36, z: 12.8 }))
  g.add(torus(4, 1.8, main, { y: 24, z: -17, ry: PI / 2 }))
  g.add(torus(7.5, 1, acc, { y: 25.5, z: 2.5, rx: PI / 2 - 0.3 }))
  g.add(ball(1.4, C.lemon, { y: 23.8, z: 10.3 }))
  return g
}

function cat(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(ball(9, main, { y: 10, z: -2 }, [1, 1.15, 1.15]))
  g.add(ball(5.5, sub, { y: 12, z: 5 }, [1, 1.2, 0.6]))
  for (const s of [-1, 1]) {
    g.add(capsule(1.8, 6, main, { x: s * 3.2, z: 5 }))
    g.add(ball(2, sub, { x: s * 3.2, y: 1.5, z: 6.5 }, [1, 0.7, 1]))
    g.add(ball(4.5, main, { x: s * 6.5, y: 4.5, z: -3 }, [0.8, 1, 1.2]))
  }
  g.add(ball(8, main, { y: 25, z: 2 }))
  for (const s of [-1, 1]) {
    const ear = cyl(0.3, 3.5, 6, main, { x: s * 4.8, y: 30.2, z: 1.5, rz: -s * 0.3 }, 4)
    ear.rotation.y = PI / 4
    g.add(ear)
  }
  g.add(face(12, { y: 25.5, z: 8.9 }))
  g.add(ball(0.8, C.pink, { y: 23.5, z: 9.7 }))
  g.add(torus(9, 1.6, main, { y: 1.6, z: -2, rx: PI / 2 }, PI * 0.8))
  return g
}

function hamsterCage(p: string[]) {
  const [main, wire, acc] = p
  const g = new THREE.Group()
  g.add(tray(50, 10, 34, 1.5, main))
  g.add(rbox(46, 3, 30, C.cream, { y: 1.5 }, 0.6))
  g.add(rbox(50, 1.5, 34, wire, { y: 36 }, 0.6))
  for (let x = -24; x <= 24; x += 3)
    for (const s of [-1, 1]) g.add(noOutline(cyl(0.25, 0.25, 26, wire, { x, y: 10, z: s * 16.6 }, 4)))
  for (let z = -13.5; z <= 13.5; z += 3)
    for (const s of [-1, 1]) g.add(noOutline(cyl(0.25, 0.25, 26, wire, { x: s * 24.6, y: 10, z }, 4)))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.6, 0.6, 26, wire, { x: sx * 24.6, y: 10, z: sz * 16.6 }, 6))
  // 跑轮
  g.add(torus(7, 0.8, acc, { x: -12, y: 14, z: -6 }))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(noOutline(rod3([-12, 14, -6], [-12 + Math.cos(a) * 7, 14 + Math.sin(a) * 7, -6], 0.3, acc, 4)))
  }
  g.add(rod3([-12, 14, -7], [-12, 4.5, -11], 0.6, acc, 6))
  // 小屋 + 水瓶
  const hut = shell(12, 9, 10, 0.8, acc, { front: [{ kind: 'arch', x: 0, y: 1.6, w: 5.2, h: 5.6 }], left: [{ kind: 'circle', x: 0, y: 5.4, r: 1.6 }] })
  hut.position.set(14, 4.5, -6)
  g.add(hut)
  g.add(rbox(10, 1.4, 8, '#f3dfa8', { x: 14, y: 5.3, z: -6 }, 0.6))
  g.add(clearMat(capsule(1.8, 9, C.sky, { x: 4, y: 18, z: -14.6 }), C.sky, 0.5))
  g.add(rod3([4, 18, -14.6], [4, 14, -13.6], 0.3, C.steel, 4))
  // 仓鼠
  const ham = '#ffd9a8'
  g.add(ball(4, ham, { x: 4, y: 8, z: 6 }, [1, 0.85, 1.2]))
  g.add(ball(2.4, C.white, { x: 4, y: 7, z: 8.6 }, [1, 0.8, 0.6]))
  for (const s of [-1, 1]) g.add(ball(1.1, ham, { x: 4 + s * 2.2, y: 11.2, z: 7 }, [1, 1, 0.5]))
  g.add(face(5, { x: 4, y: 8.6, z: 10.4 }))
  return g
}

// ---------- 水族箱 ----------
// 玻璃 / 水都是半透明（不描边）；鱼是独立的 Group，设 userData.swim 由 fx.ts 驱动绕椭圆游。

const GLASS_A = 0.22
const WATER = '#8fd0ea'
const WATER_A = 0.36
/** 水面薄片与水线：比水体亮/深一点点，斜侧是一块浅蓝水面，正面是一条水平线 */
const WATER_TOP = '#d8f1fb'
const WATERLINE = '#62b6d6'
const SAND = '#eadcc0'

/** 方缸尺寸：w 宽、d 深、H 玻璃高、stand 缸底座的底面高度（柜高；桌面缸是垫子厚 0.6） */
interface Tank {
  w: number
  d: number
  H: number
  stand: number
  fish: number
  seed: number
}
const TANKS: Record<string, Tank> = {
  30: { w: 30, d: 18, H: 22, stand: 0.6, fish: 3, seed: 30 },
  45: { w: 45, d: 27, H: 30, stand: 55, fish: 4, seed: 45 },
  60: { w: 60, d: 30, H: 36, stand: 60, fish: 5, seed: 60 },
  90: { w: 90, d: 45, H: 45, stand: 70, fish: 7, seed: 90 },
  120: { w: 120, d: 45, H: 45, stand: 70, fish: 8, seed: 120 },
}
/** 方缸的关键高度：玻璃内底（= 底座顶）、砂面、水面 */
function tankLevels(t: Tank) {
  const base = t.stand
  const floor = base + 2
  const sand = floor + (t.w >= 90 ? 4 : 3)
  const water = floor + t.H - 2.5
  return { base, floor, sand, water }
}
/** 气泡石位置（在砂面上），宽缸两个 */
const tankStones = (t: Tank): [number, number][] =>
  t.w >= 45 ? [[-t.w * 0.3, -t.d / 2 + 3], [t.w * 0.28, -t.d / 2 + 3]] : [[t.w / 2 - 4, -t.d / 2 + 3]]
const STONE_H = 1.2

function tankFx(t: Tank): Fx[] {
  const { sand, water } = tankLevels(t)
  const from = sand + STONE_H + 0.1
  return tankStones(t).map(([x, z]) => ({ kind: 'bubbles', x, y: from, z, scale: t.w >= 45 ? 0.6 : 0.4, height: water - from }))
}

/** 透明件：不描边、不投影 */
function see<T extends THREE.Mesh>(m: T, color: string, a: number): T {
  m.material = toon(color, { transparent: a })
  m.castShadow = false
  m.userData.noOutline = true
  return m
}

/** 鱼的种类：身体色、鳍色、身体长高厚比例、尾巴比例 */
const FISH_KINDS: { body: string; fin: string; shape: [number, number, number]; tail: [number, number, number]; size: number; stripe?: string }[] = [
  { body: '#ff8a3d', fin: '#ffb478', shape: [1.5, 1, 0.65], tail: [0.75, 1.5, 0.18], size: 1.3 }, // 金鱼
  { body: '#4f9bff', fin: '#9fd0ff', shape: [1.6, 0.8, 0.5], tail: [0.55, 0.9, 0.15], size: 0.9, stripe: '#ff5a5a' }, // 宝莲灯
  { body: '#ffd84d', fin: '#ffe58f', shape: [1.25, 1.3, 0.45], tail: [0.5, 0.9, 0.15], size: 1.1, stripe: '#3d5a80' }, // 黄色热带鱼
  { body: '#c8d2dc', fin: '#ff6fa8', shape: [1.4, 0.75, 0.5], tail: [0.95, 1.3, 0.15], size: 0.85 }, // 孔雀鱼（粉尾）
  { body: '#d9dfe6', fin: '#7b6bff', shape: [1.4, 0.75, 0.5], tail: [0.95, 1.3, 0.15], size: 0.85 }, // 孔雀鱼（紫尾）
  { body: '#ff6a4d', fin: '#ffffff', shape: [1.5, 0.95, 0.6], tail: [0.6, 1.1, 0.16], size: 1.2 }, // 红白金鱼
]

/** 一条鱼：头朝 +x，返回 Group 和半长 */
function fishModel(kind: number, k = 1) {
  const f = FISH_KINDS[kind % FISH_KINDS.length]
  const s = f.size * k
  const [lx, ly, lz] = f.shape
  const g = new THREE.Group()
  g.add(ball(s, f.body, {}, [lx, ly, lz]))
  const tail = ball(s * 0.7, f.fin, { x: -lx * s - s * 0.35 }, f.tail)
  g.add(tail)
  g.add(ball(s * 0.5, f.fin, { x: -0.1 * s, y: ly * s * 0.85 }, [1.1, 0.7, 0.14]))
  if (f.stripe) g.add(noOutline(ball(s * 0.55, f.stripe, { x: -0.2 * s, y: -0.1 * s }, [1.6, 0.35, lz * 1.9])))
  for (const side of [-1, 1]) {
    const ex = lx * s * 0.58
    const ez = side * lz * s * 0.62
    g.add(noOutline(ball(s * 0.26, C.white, { x: ex, y: ly * s * 0.22, z: ez })))
    g.add(noOutline(ball(s * 0.15, '#2a2226', { x: ex + s * 0.08, y: ly * s * 0.24, z: ez + side * s * 0.14 })))
  }
  return { g, half: lx * s + s * 0.35 + s * 0.7 * f.tail[0] }
}

/**
 * 往水里放 n 条鱼：椭圆限制在 [-ax, ax] × [-az, az]（已扣掉离玻璃 2cm），y 在 [y0, y1]。
 * 每条的椭圆中心 + 半径 + 鱼的半长都不超出范围。
 * front：前 front 条走「前排泳道」——泳道贴前侧、鱼散在左右和上下，正面/斜侧看得到；
 * 其余仍按原来的随机分布（多半躲在后景水草附近）。前排稍放大，但不贴前玻璃、不压水草石头。
 */
function addFish(g: THREE.Group, n: number, seed: number, ax: number, az: number, y0: number, y1: number, k = 1, front = 0) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++) {
    const frontLane = i < front
    // 前排鱼放大 1.65 倍：640px 下身体约 18~28px，颜色和轮廓都读得出来（120cm 缸里约 7~11cm 的鱼）
    const { g: f, half } = fishModel(i + seed, frontLane ? k * 1.65 : k)
    const mx = Math.max(0.5, ax - half)
    const mz = Math.max(0.5, az - half)
    let rx: number, rz: number, cx: number, cz: number, bob: number, y: number, speed: number
    if (frontLane) {
      // 前排：泳道中心左右均分（±0.72mx），半径按剩余半宽收；z 靠前但离前玻璃还留一段距离
      const t = front > 1 ? (i + 0.5) / front : 0.5
      cx = (t * 2 - 1) * mx * 0.72
      rx = Math.max(1, (mx - Math.abs(cx)) * (0.5 + rand() * 0.3))
      cz = mz * (0.45 + rand() * 0.28)
      rz = Math.max(1, mz * (0.08 + rand() * 0.08))
      bob = 0.45 + rand() * 0.35
      // 纵向也分层：最低留出砂面/石头，最高留出水面，多数落在中层偏上的开阔水域
      y = y0 + half * 0.5 + (y1 - y0 - half) * (0.25 + rand() * 0.55)
      speed = (0.3 + rand() * 0.4) * (i % 2 ? -1 : 1)
    } else {
      rx = mx * (0.45 + rand() * 0.5)
      rz = mz * (0.35 + rand() * 0.5)
      cx = (rand() - 0.5) * 2 * (mx - rx)
      cz = (rand() - 0.5) * 2 * (mz - rz)
      bob = 0.4 + rand() * 0.5
      y = y0 + bob + half * 0.5 + rand() * Math.max(0, y1 - y0 - 2 * bob - half)
      speed = (0.3 + rand() * 0.6) * (rand() < 0.4 ? -1 : 1)
    }
    // 前排静态位置放在泳道中心（渲染截图能左右散开），其余沿用椭圆右端点
    f.position.set(frontLane ? cx : cx + rx, y, cz)
    f.userData.swim = { rx, rz, cx, cz, y, speed, bob }
    g.add(f)
  }
}

/** 一丛水草：几片细长叶，顶端不超过 top */
function weed(g: THREE.Group, x: number, z: number, y0: number, top: number, color: string, rand: () => number, n = 4) {
  for (let i = 0; i < n; i++) {
    const h = (top - y0) * (0.55 + rand() * 0.4)
    const m = ball(h / 2, i % 2 ? color : shade(color, -0.08), {}, [0.16, 1, 0.07])
    m.position.set(x + (rand() - 0.5) * 2, y0 + h / 2 - 0.3, z + (rand() - 0.5) * 2)
    m.rotation.set((rand() - 0.5) * 0.25, rand() * PI, (rand() - 0.5) * 0.25)
    g.add(m)
  }
}

/** 圆叶水草：一根茎 + 交错的小圆叶 */
function roundWeed(g: THREE.Group, x: number, z: number, y0: number, top: number, color: string) {
  const h = top - y0 - 1.2
  g.add(cyl(0.25, 0.3, h, shade(color, -0.12), { x, y: y0 - 0.3, z }, 6))
  for (let y = y0 + 2; y < y0 + h - 0.5; y += 2.2)
    for (const s of [-1, 1]) {
      const a = y * 1.3 + (s > 0 ? 0 : PI)
      g.add(ball(1, color, { x: x + Math.cos(a) * 1, y, z: z + Math.sin(a) * 1 }, [1, 0.25, 0.7]))
    }
}

/** 方缸本体（玻璃、底座、顶框、底砂、水、造景、鱼、气泡石、灯），底座底面在 t.stand */
function tankBody(t: Tank, trim: string, light: string) {
  const g = new THREE.Group()
  const { w, d, H } = t
  const { base, floor, sand, water } = tankLevels(t)
  const rand = rng(t.seed)
  // 底座 + 顶框
  g.add(rbox(w + 0.4, 2, d + 0.4, trim, { y: base }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox(w + 0.4, 1.2, 1, trim, { y: floor + H - 1, z: s * (d / 2 - 0.3) }, 0.3))
    g.add(rbox(1, 1.2, d - 1.6, trim, { x: s * (w / 2 - 0.3), y: floor + H - 1 }, 0.3))
  }
  // 玻璃（四面，底座盖住底边）
  for (const s of [-1, 1]) {
    g.add(see(rbox(w, H, 0.5, C.glass, { y: floor - 0.5, z: s * (d / 2 - 0.25) }, 0.2), C.glass, GLASS_A))
    g.add(see(rbox(0.5, H, d - 1, C.glass, { x: s * (w / 2 - 0.25), y: floor - 0.5 }, 0.2), C.glass, GLASS_A))
  }
  // 底砂 + 水
  const iw = w - 1.2
  const id = d - 1.2
  g.add(rbox(iw, sand - floor, id, SAND, { y: floor - 0.2 }, 0.6))
  // 水体到水面下 0.45（留出水面薄片，避免顶面 z-fighting）；水面比水体亮，斜侧看是一块浅蓝平面
  g.add(see(rbox(w - 1.4, water - floor - 0.45, d - 1.4, WATER, { y: floor }, 0.4), WATER, WATER_A))
  g.add(see(rbox(w - 1.3, 0.45, d - 1.3, WATER_TOP, { y: water - 0.45 }, 0.2), WATER_TOP, 0.8))
  // 水线：沿内侧玻璃一圈细边，正面看是水面与空气的分界
  for (const s of [-1, 1]) {
    g.add(see(rbox(w - 1.4, 0.5, 0.35, WATERLINE, { y: water - 0.5, z: s * (d / 2 - 0.95) }, 0.1), WATERLINE, 0.8))
    g.add(see(rbox(0.35, 0.5, d - 1.4, WATERLINE, { x: s * (w / 2 - 0.95), y: water - 0.5 }, 0.1), WATERLINE, 0.8))
  }
  // 造景：后排水草、石头、沉木
  const top = water - 1.5
  const nWeed = Math.max(3, Math.round(w / 9))
  for (let i = 0; i < nWeed; i++) {
    const x = -iw / 2 + 3 + ((iw - 6) * (i + 0.5)) / nWeed
    const z = -id / 2 + 2.5 + rand() * id * 0.25
    if (i % 3 === 1) roundWeed(g, x, z, sand, top - rand() * (H * 0.3), C.leaf)
    else weed(g, x, z, sand, top - rand() * (H * 0.2), i % 2 ? C.leaf : C.leafD, rand, 3 + Math.floor(rand() * 3))
  }
  const rockC = ['#9a9a94', '#b5ada2', '#7f8580']
  for (let i = 0; i < Math.max(2, Math.round(w / 25)); i++) {
    const r = Math.min(d * 0.12, 2.5 + rand() * 3)
    const x = (rand() - 0.5) * (iw - 2 * r - 4)
    const z = (rand() - 0.2) * (id / 2 - r - 2)
    g.add(ball(r, rockC[i % 3], { x, y: sand + r * 0.25, z }, [1.2, 0.7, 1]))
  }
  if (w >= 45) {
    const len = Math.min(w * 0.35, 30)
    const wood = '#8a6447'
    const a = cyl(1.2, 1.6, len, wood, {}, 8)
    a.position.set(-w * 0.12, sand + 3, -d * 0.05)
    a.rotation.set(0, 0.4, PI / 2 - 0.35)
    g.add(a)
    const b = cyl(0.6, 0.9, len * 0.45, wood, {}, 6)
    b.position.set(-w * 0.12 + len * 0.18, sand + 5.5, -d * 0.1)
    b.rotation.set(0.3, 0, -0.5)
    g.add(b)
  }
  // 气泡石 + 气管（沿后壁上去）
  for (const [x, z] of tankStones(t)) {
    g.add(rbox(3, STONE_H, 2, '#c9ced6', { x, y: sand, z }, 0.5))
    g.add(cyl(0.25, 0.25, floor + H - sand - 1.5, '#e8f4f0', { x: x + 1.1, y: sand + 0.6, z: -d / 2 + 2.3 }, 6))
  }
  // 灯：架在顶框上的 LED 灯条，底面发光
  const lw = w - 4
  const ly = floor + H + 2.6
  g.add(rbox(lw, 1.4, Math.min(8, d * 0.35), trim, { y: ly }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(1.2, 2.6, d, trim, { x: s * (lw / 2 - 0.6), y: floor + H }, 0.4))
  g.add(lit(rbox(lw - 3, 0.4, Math.min(8, d * 0.35) - 2, light, { y: ly - 0.3 }, 0.15), light, 0.9))
  // 鱼：离玻璃至少 2cm，在砂面和水面之间；大缸前 4 条走前排泳道，保证正面有生命感
  addFish(g, t.fish, t.seed, w / 2 - 0.8 - 2, d / 2 - 0.8 - 2, sand + 1.5, water - 2, t.w >= 90 ? 1.25 : 1, t.w >= 90 ? 4 : 0)
  return g
}

/** 带柜水族箱：柜顶就是缸底。[柜体, 门板, 缸框] */
function aquariumCabinet(p: string[], size: number) {
  const [main, sub, trim] = p
  const t = TANKS[size]
  const g = new THREE.Group()
  const cw = t.w + 2
  const cd = t.d + 2
  g.add(rbox(cw - 2, 6, cd - 2, shade(main, -0.1), {}, 1))
  g.add(rbox(cw, t.stand - 6, cd, main, { y: 6 }, 1.5))
  const n = t.w >= 90 ? 3 : 2
  const dw = (cw - 4) / n
  for (let i = 0; i < n; i++) {
    const x = -cw / 2 + 2 + dw * (i + 0.5)
    g.add(rbox(dw - 1, t.stand - 14, 1.2, sub, { x, y: 9, z: cd / 2 + 0.4 }, 0.5))
    g.add(ball(0.9, C.steel, { x: x + (i % 2 ? -1 : 1) * (dw / 2 - 4), y: t.stand * 0.62, z: cd / 2 + 1.3 }))
  }
  g.add(tankBody(t, trim, '#fff4cf'))
  return g
}

/** 桌面小缸 30cm：[缸框, 底座垫, 灯色] */
function aquariumDesk(p: string[]) {
  const [trim, mat, light] = p
  const t = TANKS[30]
  const g = new THREE.Group()
  g.add(rbox(t.w + 1, 0.6, t.d + 1, mat, {}, 0.3))
  g.add(tankBody(t, trim, light))
  // 外挂过滤器：挂在后壁外侧，出水口探进缸里
  const { floor, water } = tankLevels(t)
  const fx = -5
  g.add(rbox(8, 12, 4, trim, { x: fx, y: floor + t.H - 11, z: -t.d / 2 - 2.2 }, 1))
  g.add(rbox(8, 1.2, 4.5, trim, { x: fx, y: floor + t.H + 0.2, z: -t.d / 2 + 0.2 }, 0.4))
  g.add(rbox(5, 2.8, 1, trim, { x: fx, y: water + 0.2, z: -t.d / 2 + 2 }, 0.3))
  return g
}

/** 圆形金鱼缸：玻璃球截掉顶和底，[底座, 砂, 点缀] */
const BOWL = { R: 12.5, yc: 10.5, open: 8, water: 17.5 }
function aquariumBowl(p: string[]) {
  const [stand, sand, acc] = p
  const { R, yc, open, water } = BOWL
  const g = new THREE.Group()
  const ri = R - 0.4
  const rAt = (rr: number, y: number) => Math.sqrt(Math.max(0, rr * rr - (y - yc) ** 2))
  // 玻璃：球面，底部切平（y = 0）、顶部开口半径 open
  const th0 = Math.asin(open / R)
  const th1 = PI - Math.acos((yc - 0) / R)
  const glassMat = toon(C.glass, { transparent: GLASS_A }).clone()
  glassMat.side = THREE.DoubleSide
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, PI * 2, th0, th1 - th0), glassMat)
  glass.position.y = yc
  glass.userData.noOutline = true
  g.add(glass)
  g.add(see(torus(open, 0.45, C.glass, { y: yc + Math.sqrt(R * R - open * open), rx: PI / 2 }), C.glass, 0.35))
  g.add(see(cyl(rAt(R, 0), rAt(R, 0), 0.5, C.glass, {}, 32), C.glass, GLASS_A))
  // 底座圈
  g.add(torus(rAt(R, 0) + 0.6, 0.9, stand, { y: 0.9, rx: PI / 2 }))
  // 球内某一段（砂、水）：贴着内壁的回转体
  const slice = (ya: number, yb: number, color: string) => {
    const pts = [new THREE.Vector2(0, ya)]
    for (let i = 0; i <= 12; i++) {
      const y = ya + ((yb - ya) * i) / 12
      pts.push(new THREE.Vector2(rAt(ri - 0.1, y), y))
    }
    pts.push(new THREE.Vector2(0, yb))
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 40), toon(color))
  }
  const sandTop = 2.6
  const sm = slice(0.5, sandTop, sand)
  sm.receiveShadow = true
  g.add(sm)
  g.add(see(slice(0.6, water, WATER), WATER, WATER_A))
  // 一块石头 + 一丛水草 + 小贝壳
  g.add(ball(2, '#a9a49c', { x: 3.5, y: sandTop + 0.4, z: -2.5 }, [1.2, 0.7, 1]))
  weed(g, -3.5, -3, sandTop, water - 2, C.leaf, rng(7), 4)
  g.add(ball(0.9, acc, { x: 1.5, y: sandTop + 0.2, z: 3.5 }, [1, 0.5, 1]))
  // 两条金鱼：水体在 y 8..14 处半径 ≥ 11.5；椭圆框在 ±6.5 内，斜角最远 ≈ 8 < 11.5 - 2
  addFish(g, 2, 6, 6.5, 6.5, 8, 14, 0.9)
  return g
}

// ======================================================================
// 阳台户外
// ======================================================================

function bicycle(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const WY = 33.2
  for (const x of [-52, 52]) {
    g.add(torus(31, 2.2, J.sumi, { x, y: WY }))
    g.add(torus(28.6, 0.7, C.steel, { x, y: WY }))
    g.add(ball(2, C.steel, { x, y: WY }))
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2
      g.add(noOutline(rod3([x, WY, 0], [x + Math.cos(a) * 28.4, WY + Math.sin(a) * 28.4, 0], 0.22, C.steel, 4)))
    }
    g.add(torus(34.5, 1.1, main, { x, y: WY, rz: 0.15 * PI }, 0.7 * PI))
  }
  const B: V3 = [-6, 28, 0]
  const Sx: V3 = [-20, 72, 0]
  const HB: V3 = [40, 62, 0]
  const H: V3 = [36, 80, 0]
  for (const s of [-1, 1]) {
    g.add(rod3([-52, WY, s * 3], [-6, 28, s * 2], 1, main, 8))
    g.add(rod3([-52, WY, s * 3], [-19, 68, s * 1.5], 1, main, 8))
    g.add(rod3(HB, [52, WY, s * 3], 1.2, main, 8))
  }
  g.add(rod3(B, Sx, 1.6, main, 8))
  g.add(rod3(B, [18, 36, 0], 1.9, main, 8))
  g.add(rod3([18, 36, 0], HB, 1.9, main, 8))
  g.add(rod3(HB, H, 2, main, 8))
  g.add(rod3(H, [34, 90, 0], 1.2, C.steel, 8))
  g.add(rod3([33, 90, -22], [33, 90, 22], 1, C.steel, 8))
  for (const s of [-1, 1]) g.add(rod3([33, 90, s * 20], [33, 90, s * 27], 1.8, acc, 8))
  g.add(ball(1.6, C.lemon, { x: 33, y: 92, z: -15 }))
  // 座
  g.add(rod3(Sx, [-22, 86, 0], 1.1, C.steel, 8))
  g.add(ball(7, acc, { x: -23, y: 88 }, [1.5, 0.5, 1]))
  // 车篮 + 后架
  g.add(tray(30, 20, 26, 1, sub, { x: 54, y: 70 }, 0.5))
  g.add(rod3([48, 70, 0], [50, 38, 0], 0.6, C.steel, 8))
  g.add(rbox(28, 1.5, 12, C.steel, { x: -50, y: 68 }, 0.5))
  for (const s of [-1, 1]) g.add(rod3([-40, 68, s * 5], [-52, WY, s * 3], 0.5, C.steel, 8))
  // 链盒、曲柄、脚撑
  g.add(rbox(48, 7, 1.2, main, { x: -29, y: 30.5 - 3.5, z: 5, rz: Math.atan2(-5, 46) }, 0.6))
  g.add(torus(7, 0.8, C.steel, { x: B[0], y: B[1], z: 6.5 }))
  g.add(rod3([-6, 28, 7], [-2, 19, 7], 0.8, C.steel, 8))
  g.add(rbox(6, 1.5, 4, J.sumi, { x: -2, y: 18, z: 9 }, 0.5))
  g.add(rod3([-40, 30, 3], [-44, 0.5, 12], 0.8, C.steel, 8))
  return g
}

function foldingSet(p: string[]) {
  const [main, frame] = p
  const g = new THREE.Group()
  g.add(puck(30, 2.5, main, { y: 68 }))
  for (const z of [-17, 17]) {
    g.add(rod3([-22, 0.7, z], [22, 68.2, z], 1, frame, 8))
    g.add(rod3([22, 0.7, z], [-22, 68.2, z], 1, frame, 8))
  }
  g.add(rod3([0, 33.5, -17], [0, 33.5, 17], 0.8, frame, 8))
  const chair = () => {
    const c = new THREE.Group()
    for (const s of [-1, 1]) {
      const x = s * 17
      // 斜腿下端抬 0.7，圆柱端面才不会斜插进地面
      c.add(rod3([x, 0.7, 15], [x, 76, -19], 1, frame, 8))
      c.add(rod3([x, 0.7, -17], [x, 44, 14], 1, frame, 8))
    }
    c.add(rbox(36, 2.5, 30, main, { y: 43, z: 0 }, 1))
    const yc = 66
    const zc = 15 - (34 * yc) / 76
    c.add(rbox(34, 16, 2, main, { y: yc - 8, z: zc, rx: -Math.atan(34 / 76) }, 0.8))
    return c
  }
  for (const s of [-1, 1]) {
    const c = chair()
    c.position.x = s * 50
    c.rotation.y = -s * (PI / 2)
    g.add(c)
  }
  return g
}

/** 户外储物柜：正面两扇对开门（横纹），里面一块层板 */
function outdoorStorage(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(hollow(86, 74, 46, main, {}, 2))
  g.add(rbox(82, 1.6, 42, shade(main, 0.05), { y: 36.4 }, 0.3))
  g.add(rbox(90, 6, 50, sub, { y: 74 }, 2))
  for (const s of [-1, 1]) {
    const x = s * 21.6
    const parts: THREE.Object3D[] = [rbox(42.8, 72, 1.6, main, { x, y: 1, z: 23.8 }, 0.6)]
    for (const y of [15, 30, 45, 60]) parts.push(noOutline(rbox(38, 0.8, 0.6, shade(main, -0.12), { x, y, z: 24.7 }, 0.2)))
    if (s > 0) parts.push(rbox(10, 4, 1.5, acc, { y: 68, z: 25.3 }, 0.6))
    g.add(swingDoor(parts, s * 43, 24.6, s < 0 ? 'left' : 'right'))
  }
  for (const s of [-1, 1]) g.add(rbox(1.5, 3, 14, acc, { x: s * 43.5, y: 58 }, 0.6))
  return g
}
const OUT_STORAGE_SURFACES = [
  { y: 2, h: 34, inside: true, shape: [rectPoly(-40.6, -20.6, 40.6, 22.4)] },
  { y: 38, h: 33.6, inside: true, shape: [rectPoly(-40.6, -20.6, 40.6, 22.4)] },
]

function mopBucket(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(cup(14, 12, 28, 1.4, main, { x: -4 }))
  g.add(noOutline(clearMat(cyl(11.8, 11.8, 0.3, C.sky, { x: -4, y: 20 }), C.sky, 0.6)))
  g.add(torus(14.2, 0.6, J.sumi, { x: -4, y: 27, rx: -1.2 }, PI))
  for (const s of [-1, 1]) g.add(ball(1.2, sub, { x: -4 + s * 14.2, y: 27 }))
  g.add(ball(9, C.white, { x: -4, y: 17 }, [1, 0.6, 1]))
  g.add(rod3([-4, 18, 0], [10, 118, -8], 1.3, sub, 8))
  g.add(ball(1.8, main, { x: 10, y: 118, z: -8 }))
  return g
}

function futonRack(p: string[]) {
  const [main, frame, acc] = p
  const g = new THREE.Group()
  for (const x of [-68, 68]) {
    g.add(rod3([x, 0, -32], [x, 110, 0], 1.5, frame, 8))
    g.add(rod3([x, 0, 32], [x, 110, 0], 1.5, frame, 8))
    g.add(rod3([x, 1.5, -34], [x, 1.5, 34], 1.5, frame, 8))
  }
  g.add(rod3([-69, 110, 0], [69, 110, 0], 1.5, frame, 8))
  for (const s of [-1, 1]) g.add(rod3([-68, 40, s * 20.4], [68, 40, s * 20.4], 1.2, frame, 8))
  g.add(rod3([-60, 110, 0], [60, 110, 0], 5, main, 16))
  for (const s of [-1, 1]) {
    // 中心放在 (y 77, z ±11.5)，绕中心倾斜
    const slab = G(rbox(120, 66, 4, main, { y: -33 }, 2))
    // 绑带比被子略窄，两端不和被子侧面共面
    for (const y of [-21, -3, 15]) slab.add(noOutline(rbox(119.2, 4, 0.6, acc, { y, z: s * 2.3 }, 0.3)))
    slab.position.set(0, 77, s * 11.5)
    slab.rotation.x = -s * 0.2
    g.add(slab)
  }
  return g
}

function hangingChair(p: string[]) {
  const [main, cushion, frame] = p
  const g = new THREE.Group()
  g.add(puck(42, 3, frame, { z: -6 }))
  g.add(rod3([0, 2, -40], [0, 160, -40], 2.5, frame, 12))
  g.add(torus(20, 2.5, frame, { y: 160, z: -20, ry: PI / 2 }, PI / 2))
  g.add(rod3([0, 180, -20], [0, 180, -4], 2.5, frame, 12))
  g.add(rod3([0, 180, -4], [0, 148, -4], 0.5, J.sumi, 6))
  g.add(torus(1.6, 0.5, J.sumi, { y: 177.5, z: -4, ry: PI / 2 }))
  const shell = cup(38, 28, 44, 2.5, main, { y: 102, z: -30, rx: PI / 2 })
  shell.scale.set(1, 1, 1.35)
  g.add(shell)
  g.add(puck(26, 10, cushion, { y: 62, z: -6 }))
  g.add(ball(20, cushion, { y: 106, z: -20 }, [1.2, 1.3, 0.5]))
  g.add(ball(8, shade(cushion, 0.06), { x: 10, y: 80, z: 0 }, [1.1, 1, 0.6]))
  return g
}

function gardenBox(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  g.add(legs(86, 41, 50, main, 2.5, 3, false))
  g.add(rbox(84, 2, 39, main, { y: 12 }, 0.6))
  g.add(tray(90, 24, 45, 2.5, main, { y: 50 }))
  g.add(rbox(84.5, 2, 39.5, SOIL, { y: 68 }, 0.6))
  // 生菜
  for (const [x, z] of [[-32, -8], [-32, 9], [-18, 0]]) {
    g.add(ball(4, '#9fd88a', { x, y: 73, z }, [1, 0.8, 1]))
    for (let k = 0; k < 6; k++) g.add(sprig(9, k % 2 ? '#b6e39a' : C.leaf, [x, 70.5, z], yawTo((k / 6) * PI * 2), -0.5, 0.75))
  }
  // 番茄
  g.add(rod3([2, 69, 0], [2, 98, 0], 0.6, C.woodD, 6))
  for (let k = 0; k < 7; k++) g.add(sprig(10, C.leafD, [2, 74 + k * 3.4, 0], yawTo(k * 2.2), 0.1 - k * 0.05, 0.45))
  // 果子挨着茎（以前离茎 1cm 以上悬空）
  for (const [x, y, z] of [[4.2, 84, 1.4], [0.2, 80, 1.8], [3.8, 90, -1.8], [-0.2, 88, -1.4]]) g.add(ball(2.2, x > 2 ? C.red : C.orange, { x, y, z }))
  // 胡萝卜
  for (let i = 0; i < 4; i++) {
    const x = 20 + (i % 2) * 10
    const z = i < 2 ? -8 : 8
    g.add(cyl(2, 0.8, 3, C.orange, { x, y: 69 }, 10))
    for (let k = 0; k < 3; k++) g.add(sprig(10, C.leaf, [x, 71.5, z], yawTo(k * 2.1), -1.1, 0.2))
  }
  return g
}

// ======================================================================
// 落地小家电
// ======================================================================

function floorFan(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(puck(17, 4, main, { z: -2 }))
  for (let i = 0; i < 3; i++) g.add(rbox(3, 1.4, 2, acc, { x: -6 + i * 6, y: 3.6, z: 8 }, 0.5))
  g.add(cyl(1.6, 1.6, 60, sub, { y: 4, z: -5 }))
  g.add(rod3([0, 63, -5], [0, 80, -7], 1.4, sub, 8))
  g.add(ball(6.5, main, { y: 82, z: -7 }, [1, 1, 1.3]))
  const cy = 82
  g.add(torus(19, 0.7, sub, { y: cy, z: 3.5 }))
  g.add(torus(19, 0.7, sub, { y: cy, z: -1.5 }))
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * PI * 2
    const rx = Math.cos(a) * 19
    const ry = Math.sin(a) * 19
    g.add(noOutline(rod3([0, cy, 4], [rx, cy + ry, 3.5], 0.22, sub, 4)))
    if (k % 2 === 0) g.add(noOutline(rod3([rx, cy + ry, 3.5], [rx, cy + ry, -1.5], 0.25, sub, 4)))
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.3
    const b = ball(8, acc, { x: Math.cos(a) * 9, y: cy + Math.sin(a) * 9, z: 1.2 }, [0.6, 1, 0.08])
    b.rotation.z = a - PI / 2
    g.add(b)
  }
  g.add(cyl(4, 4, 1, main, { y: cy - 0.5, z: 4.2, rx: PI / 2 }))
  return g
}

/** 昭和台扇：可以放在桌上 */
function retroFan(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 5, 20, main, { z: 2 }, 2.5))
  for (let i = 0; i < 4; i++) g.add(rbox(3.4, 2, 3, i === 1 ? acc : sub, { x: -6 + i * 4, y: 4.4, z: 9.5 }, 0.8))
  g.add(cyl(1.6, 2, 16, sub, { y: 5, z: -3 }))
  g.add(ball(5, main, { y: 24, z: -6 }, [1, 1, 1.4]))
  g.add(cyl(0.8, 0.8, 4, sub, { y: 28, z: -9 }, 8))
  g.add(ball(1.2, sub, { y: 32.5, z: -9 }))
  const cy = 24
  g.add(torus(14, 0.6, sub, { y: cy, z: 2.5 }))
  g.add(torus(13, 0.5, sub, { y: cy, z: -2 }))
  // 后网罩的辐条：把网罩固定到电机壳上（以前网罩整圈悬空，和电机不相连）
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2 + PI / 6
    g.add(noOutline(rod3([Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5, -2.6], [Math.cos(a) * 13, cy + Math.sin(a) * 13, -2], 0.3, sub, 4)))
  }
  for (const r of [5, 9.5]) g.add(noOutline(torus(r, 0.25, sub, { y: cy, z: 3 })))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2
    g.add(noOutline(rod3([0, cy, 3.2], [Math.cos(a) * 14, cy + Math.sin(a) * 14, 2.5], 0.2, sub, 4)))
    // 前后网罩外圈之间的连接筋
    g.add(noOutline(rod3([Math.cos(a) * 14, cy + Math.sin(a) * 14, 2.5], [Math.cos(a) * 13, cy + Math.sin(a) * 13, -2], 0.25, sub, 4)))
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4
    const b = ball(6, acc, { x: Math.cos(a) * 6.5, y: cy + Math.sin(a) * 6.5, z: 0.6 }, [0.7, 1, 0.08])
    b.rotation.z = a - PI / 2
    g.add(b)
  }
  g.add(cyl(2.6, 2.6, 1, acc, { y: cy - 0.5, z: 3.6, rx: PI / 2 }))
  return g
}

/** 工业风金属落地扇：三脚架 + 大网罩 */
function industrialFan(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    g.add(rod3([Math.cos(a) * 24, 1.2, Math.sin(a) * 24], [0, 62, -2], 1.2, main, 8))
    g.add(ball(1.6, J.sumi, { x: Math.cos(a) * 24, y: 1.6, z: Math.sin(a) * 24 }))
  }
  g.add(cyl(1.4, 1.4, 30, main, { y: 60, z: -2 }))
  g.add(ball(9, main, { y: 104, z: -10 }, [1, 1, 1.2]))
  g.add(rod3([0, 90, -2], [0, 100, -8], 1.6, main, 8))
  const cy = 104
  g.add(torus(26, 1.2, sub, { y: cy, z: 4 }))
  g.add(torus(26, 1, sub, { y: cy, z: -3 }))
  for (const r of [9, 17]) g.add(noOutline(torus(r, 0.35, sub, { y: cy, z: 4.6 })))
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * PI * 2
    const x = Math.cos(a) * 26
    const y = cy + Math.sin(a) * 26
    g.add(noOutline(rod3([0, cy, 5], [x, y, 4], 0.3, sub, 4)))
    if (k % 2 === 0) g.add(noOutline(rod3([x, y, 4], [x, y, -3], 0.3, sub, 4)))
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2
    const b = ball(11, sub, { x: Math.cos(a) * 12, y: cy + Math.sin(a) * 12, z: 1 }, [0.55, 1, 0.08])
    b.rotation.z = a - PI / 2
    g.add(b)
  }
  g.add(cyl(4, 4, 2, main, { y: cy - 1, z: 4.4, rx: PI / 2 }))
  return g
}

function purifier(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(38, 66, 22, main, {}, 5))
  for (let k = -2; k <= 2; k++) g.add(noOutline(rbox(30, 0.6, 1, shade(main, -0.18), { y: 65.9, z: k * 3 }, 0.2)))
  g.add(rbox(32, 50, 1, sub, { y: 5, z: 11.2 }, 0.8))
  g.add(noOutline(torus(3, 0.5, acc, { y: 60, z: 11.3 })))
  g.add(lit(ball(0.8, '#7fe0a8', { x: 8, y: 60, z: 11.3 }), '#7fe0a8', 0.8))
  for (let k = 0; k < 8; k++) g.add(noOutline(rbox(0.6, 40, 1, shade(main, -0.12), { x: 19.1, y: 10, z: -8 + k * 2.3 }, 0.2)))
  return g
}

/** 现代极简：高圆柱形空气净化器 */
function purifierTower(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(cyl(13, 13, 2, sub, {}, 32))
  g.add(cyl(12.6, 12.6, 56, main, { y: 2 }, 32))
  for (let k = 0; k < 12; k++) g.add(noOutline(torus(12.7, 0.25, shade(main, -0.12), { y: 6 + k * 3.6, rx: PI / 2 })))
  g.add(cyl(12.6, 12.6, 10, sub, { y: 58 }, 32))
  g.add(cup(10, 10, 3, 1.2, shade(sub, -0.1), { y: 66.5 }))
  g.add(noOutline(cyl(8.6, 8.6, 0.4, J.sumi, { y: 67 }, 24)))
  g.add(lit(torus(5, 0.35, acc, { y: 67.8, rx: PI / 2 }), acc, 0.8))
  return g
}

function humidifier(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(cyl(11, 13, 26, main, {}, 28))
  g.add(puck(11, 4, sub, { y: 25 }))
  g.add(cyl(2.5, 3, 3, sub, { y: 28.5 }, 16))
  g.add(glow(7, 12, C.sky, { y: 7, z: 12.2 }, 0.3))
  g.add(lit(ball(0.7, '#7fe0a8', { y: 22, z: 11.6 }), '#7fe0a8', 0.8))
  return g
}

function oilHeater(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  for (let i = 0; i < 9; i++) g.add(rbox(4, 56, 20, main, { x: -26 + i * 5.5, y: 6 }, 2))
  for (const y of [10, 58]) g.add(rod3([-26, y, 0], [20, y, 0], 2.4, shade(main, -0.08), 8))
  // 控制盒贴在最后一片散热片上（以前隔着 0.5cm 悬空）
  g.add(rbox(8, 18, 16, sub, { x: 23.8, y: 40 }, 2))
  g.add(ball(2, acc, { x: 28.2, y: 51 }, [0.5, 1, 1]))
  g.add(ball(1.6, acc, { x: 28.2, y: 45 }, [0.5, 1, 1]))
  g.add(lit(ball(0.6, C.red, { x: 28, y: 54.5, z: 4 }), C.red, 0.9))
  for (const s of [-1, 1]) {
    g.add(rbox(6, 3, 26, J.sumi, { x: s * 16 - 4, y: 3 }, 1))
    for (const z of [-11, 11]) g.add(ball(2.2, J.sumi, { x: s * 16 - 4, y: 2.2, z }))
  }
  return g
}

function robotVac(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(puck(17, 7, main, { y: 1 }))
  g.add(torus(17, 1.3, sub, { y: 4, rx: PI / 2 }, PI))
  g.add(puck(11, 1.2, shade(main, -0.08), { y: 7.6 }))
  g.add(cyl(3.6, 3.6, 1.4, acc, { y: 8.6, z: -7 }, 20))
  g.add(lit(ball(1, '#7fe0a8', { y: 8.9, z: 4 }, [1, 0.4, 1]), '#7fe0a8', 0.8))
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI * 2
      g.add(noOutline(rod3([s * 11, 0.6, 11], [s * 11 + Math.cos(a) * 4, 0.4, 11 + Math.sin(a) * 4], 0.2, sub, 4)))
    }
  return g
}

function stickVac(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 3, 22, sub, {}, 1.5))
  g.add(rbox(6, 70, 4, sub, { y: 3, z: -9 }, 1.5))
  g.add(rbox(24, 4.5, 9, main, { y: 3, z: 4 }, 2))
  g.add(ball(2.2, J.sumi, { y: 8, z: 4 }))
  g.add(rod3([0, 8, 4], [0, 74, 1], 1.4, C.steel, 8))
  g.add(rbox(9, 20, 11, main, { y: 74, z: -1 }, 3.5))
  g.add(clearMat(cyl(3.6, 3.6, 13, C.glass, { y: 76, z: 7.6 }, 16), C.glass, 0.5))
  g.add(cyl(3.8, 3.8, 1.5, acc, { y: 89, z: 7.6 }, 16))
  g.add(rod3([0, 93, -2], [0, 106, -4], 1.6, sub, 8))
  g.add(ball(2, sub, { y: 106, z: -4 }))
  g.add(lit(ball(0.7, acc, { y: 86, z: 4.7 }), acc, 0.8))
  return g
}

function waterDispenser(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  // 机身后段 + 前面板（真开出接水凹槽，深 6）
  g.add(rbox(32, 92, 26, main, { z: -3 }, 3))
  g.add(holePanel(32, 92, 8, main, [{ kind: 'rect', x: 0, y: 38, w: 18, h: 24, r: 2 }], { z: 12 }, 3))
  g.add(rbox(17.4, 2, 7.6, sub, { y: 38, z: 13.4 }, 0.6))
  for (const [x, c] of [[-5, C.red], [5, C.sky]] as [number, string][]) g.add(rbox(3.5, 6, 4, c, { x, y: 56.5, z: 14 }, 1))
  g.add(rbox(20, 8, 1, sub, { y: 72, z: 16.2 }, 1))
  g.add(lit(ball(0.6, '#7fe0a8', { x: 6, y: 76, z: 16.8 }), '#7fe0a8', 0.8))
  g.add(cyl(7, 7, 2, sub, { y: 92 }, 20))
  const b1 = clearMat(cyl(12, 5, 5, C.sky, { y: 94 }, 24), C.sky, 0.4)
  const b2 = clearMat(cyl(13, 13, 24, C.sky, { y: 99 }, 24), C.sky, 0.4)
  const b3 = clearMat(puck(13, 6, C.sky, { y: 120 }), C.sky, 0.4)
  g.add(b1, b2, b3)
  g.add(clearMat(cyl(12.2, 12.2, 16, '#8ec9f2', { y: 99.5 }, 24), '#8ec9f2', 0.45))
  return g
}

// ======================================================================
// 壁挂
// ======================================================================

const CLOCK_MOUNT = 175
function wallClock(p: string[]) {
  const [main, dial, acc] = p
  const cy = CLOCK_MOUNT + 16
  const g = new THREE.Group()
  g.add(puck(16, 4, main, { y: cy - 2, z: -1, rx: PI / 2 }))
  g.add(noOutline(cyl(13.5, 13.5, 0.6, dial, { y: cy - 0.3, z: 1.2, rx: PI / 2 }, 32)))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2
    g.add(noOutline(ball(k % 3 ? 0.5 : 0.9, J.sumi, { x: Math.cos(a) * 11, y: cy + Math.sin(a) * 11, z: 1.6 }, [1, 1, 0.4])))
  }
  const hand = (len: number, wd: number, ang: number, z: number) => {
    const hg = G(noOutline(rbox(wd, len, 0.4, J.sumi, { y: -1 }, 0.2)))
    hg.position.set(0, cy, z)
    hg.rotation.z = ang
    return hg
  }
  g.add(hand(7, 1.2, PI / 3, 1.85), hand(10, 0.8, -PI / 3, 2.3))
  g.add(ball(1, acc, { y: cy, z: 2.6 }))
  return g
}

/** 现代极简挂钟：细边框 + 无刻度 */
function wallClockMinimal(p: string[]) {
  const [main, dial, acc] = p
  const cy = CLOCK_MOUNT + 18
  const g = new THREE.Group()
  g.add(torus(17.4, 1.2, main, { y: cy, z: 0.2 }))
  g.add(noOutline(cyl(17, 17, 0.6, dial, { y: cy - 0.3, z: -0.4, rx: PI / 2 }, 40)))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2
    const m = noOutline(rbox(0.8, 3, 0.4, main, { x: Math.cos(a) * 14, y: cy + Math.sin(a) * 14 - 1.5, z: 0.2 }, 0.1))
    m.rotation.z = a - PI / 2
    g.add(m)
  }
  const hand = (len: number, wd: number, ang: number, z: number, c: string) => {
    const hg = G(noOutline(rbox(wd, len, 0.3, c, { y: -1.5 }, 0.1)))
    hg.position.set(0, cy, z)
    hg.rotation.z = ang
    return hg
  }
  g.add(hand(9, 1, 0.9, 0.3, main), hand(13, 0.6, -1.6, 0.7, main), hand(14, 0.25, 2.6, 1.1, acc))
  g.add(ball(0.8, acc, { y: cy, z: 1.3 }))
  return g
}

const ART_MOUNT = 135
/** 画框 + 画布；返回各层贴片的 z */
function artFrame(g: THREE.Group, w: number, h: number, d: number, y0: number, frame: string, canvas: string) {
  const zb = -d / 2
  g.add(rbox(w, h, 2.4, frame, { y: y0, z: zb + 1.2 }, Math.min(1, w * 0.04)))
  const front = zb + 2.4
  g.add(noOutline(rbox(w - 5, h - 5, 0.6, canvas, { y: y0 + 2.5, z: front + 0.1 }, 0.2)))
  return [front + 0.65, front + 0.95, front + 1.25]
}

function artMountain(p: string[], s: number) {
  const [frame, sky, acc] = p
  const w = 60 * s
  const h = 45 * s
  const y0 = ART_MOUNT
  const g = new THREE.Group()
  const [z1] = artFrame(g, w, h, 4, y0, frame, sky)
  // 画面画在贴图上，不会溢出画框
  g.add(paintPanel(w - 5, h - 5, `art-mountain-${sky}-${acc}`, paintLandscape(sky, shade(J.ai, 0.25), acc), { y: y0 + 2.5, z: z1 }))
  return g
}

function artFlower(p: string[], s: number) {
  const [frame, canvas, acc] = p
  const w = 36 * s
  const h = 46 * s
  const y0 = ART_MOUNT
  const g = new THREE.Group()
  const [z1] = artFrame(g, w, h, 4, y0, frame, canvas)
  g.add(paintPanel(w - 5, h - 5, `art-flower-${canvas}-${acc}`, paintFlower(canvas, C.pink, C.lemon), { y: y0 + 2.5, z: z1 }))
  void acc
  return g
}

function artAbstract(p: string[], s: number) {
  const [frame, canvas, acc] = p
  const w = 50 * s
  const h = 36 * s
  const y0 = ART_MOUNT
  const g = new THREE.Group()
  const [z1] = artFrame(g, w, h, 4, y0, frame, canvas)
  g.add(paintPanel(w - 5, h - 5, `art-abstract-${canvas}-${acc}`, paintAbstract(canvas, acc, J.sumi), { y: y0 + 2.5, z: z1 }))
  return g
}

const SHELF_MOUNT = 110
function wallShelf(p: string[]) {
  const [main, acc] = p
  const y0 = SHELF_MOUNT
  const g = new THREE.Group()
  g.add(rbox(60, 3, 18, main, { y: y0 + 10 }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(2, 10, 1.5, acc, { x: s * 22, y: y0, z: -8.25 }, 0.4))
    g.add(rod3([s * 22, y0 + 1, -8], [s * 22, y0 + 10, 4], 0.8, acc, 6))
  }
  return g
}

/** 工业风：黑铁水管支架 + 胡桃木板 */
function pipeShelf(p: string[]) {
  const [main, pipe] = p
  const y0 = SHELF_MOUNT
  const g = new THREE.Group()
  g.add(rbox(80, 3.5, 22, main, { y: y0 + 12 }, 0.6))
  for (const s of [-1, 1]) {
    const x = s * 28
    g.add(cyl(3.2, 3.2, 1.2, pipe, { x, y: y0 + 6 - 0.6, z: -10.4, rx: PI / 2 }, 16))
    g.add(rod3([x, y0 + 6, -10], [x, y0 + 6, 6], 1.3, pipe, 12))
    g.add(ball(1.9, pipe, { x, y: y0 + 6, z: 6 }))
    g.add(rod3([x, y0 + 6, 6], [x, y0 + 12, 6], 1.3, pipe, 12))
    g.add(cyl(3, 3, 0.8, pipe, { x, y: y0 + 11.2, z: 6 }, 16))
    for (const sx of [-1, 1]) g.add(ball(0.5, C.steel, { x: x + sx * 1.8, y: y0 + 6, z: -9.6 }))
  }
  return g
}

const KEY_MOUNT = 120
function keyRack(p: string[]) {
  const [main, roof, acc] = p
  const y0 = KEY_MOUNT
  const g = new THREE.Group()
  g.add(rbox(32, 10, 1.6, main, { y: y0 + 6, z: -2.7 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(19, 2, 2, roof, { x: -s * 8.55, y: y0 + 16 + 4.15 - 1, z: -2.5, rz: s * 0.45 }, 0.6))
  const keys = [acc, C.steel]
  for (let i = 0; i < 4; i++) {
    const x = -11.25 + i * 7.5
    g.add(rod3([x, y0 + 8, -1.9], [x, y0 + 8, 1.2], 0.35, C.steel, 6))
    g.add(ball(0.6, C.steel, { x, y: y0 + 8.4, z: 1.2 }))
    if (i === 0 || i === 2) {
      g.add(torus(1.2, 0.3, C.steel, { x, y: y0 + 6.8, z: 0.6, ry: PI / 2 }))
      g.add(rbox(1.6, 5, 0.4, keys[i / 2], { x, y: y0 + 0.4, z: 0.6 }, 0.2))
      g.add(ball(1.6, keys[i / 2], { x, y: y0 + 5.6, z: 0.6 }, [1, 1, 0.3]))
    }
  }
  return g
}

const TV_MOUNT = 90
function wallTV(p: string[], inch: number) {
  const [main, screen] = p
  const sw = inch * 2.54 * 0.8716
  const sh = inch * 2.54 * 0.4903
  const w = sw + 2.6
  const h = sh + 3.6
  const y0 = TV_MOUNT
  const g = new THREE.Group()
  g.add(rbox(30, 20, 2.5, '#555560', { y: y0 + h / 2 - 10, z: -1.75 }, 0.5))
  g.add(rbox(w, h, 3.5, main, { y: y0, z: 1.25 }, 1))
  g.add(glow(sw, sh, screen, { y: y0 + 2.4, z: 3.1 }, 0.35))
  g.add(lit(ball(0.5, C.red, { y: y0 + 1.2, z: 3.1 }), C.red, 0.8))
  return g
}
const tvSize = (inch: number) => ({ w: Math.round(inch * 2.54 * 0.8716 + 2.6), h: Math.round(inch * 2.54 * 0.4903 + 3.6) })

const CURTAIN_MOUNT = 15
function curtain(p: string[]) {
  const [main, rodC, acc] = p
  const y0 = CURTAIN_MOUNT
  const g = new THREE.Group()
  const ry = y0 + 219
  g.add(rod3([-98, ry, 0], [98, ry, 0], 1.3, rodC, 12))
  for (const s of [-1, 1]) {
    g.add(ball(2.4, rodC, { x: s * 99.5, y: ry }))
    g.add(rbox(2, 3, 5.5, rodC, { x: s * 90, y: ry - 1.5, z: -3.25 }, 0.4))
  }
  g.add(clearMat(rbox(110, 200, 0.6, C.white, { y: y0 + 10, z: -4.6 }, 0.3), C.white, 0.45))
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = s * (56 + i * 7.6)
      g.add(capsule(4, 204, i % 2 ? shade(main, -0.04) : main, { x, y: y0, z: i % 2 ? -1.5 : 0 }))
    }
    g.add(rbox(46, 6, 10, shade(main, -0.06), { x: s * 75, y: y0 + 205, z: -0.8 }, 2))
    g.add(rbox(46, 4, 11, acc, { x: s * 75, y: y0 + 88, z: -0.8 }, 1.8))
  }
  return g
}

// ======================================================================
// 目录
// ======================================================================

/** 带柜水族箱：[柜体, 门板, 缸框] */
const cabinetTank = sty({
  cute: [[C.white, C.sky, C.white], [C.woodL, C.white, C.white]],
  nordic: [[N.oak, N.white, M.black], [N.white, N.oakL, N.oak]],
  modern: [[M.black, M.char, M.black], [M.white, M.light, M.silver]],
  industrial: [[I.walnut, I.iron, I.iron]],
  japanese: [[J.dark, J.wood, J.sumi]],
})
const potColors = sty({
  cute: [[C.white], [C.peach], [C.sakura], [C.sky]],
  nordic: [[N.white]],
  modern: [[M.char]],
  japanese: [[J.sumi]],
  industrial: [[I.concrete]],
  retro: [[R.orange]],
})
const potShort = sty({ cute: [[C.white], [C.sakura]], nordic: [[N.linen]], modern: [[M.char]], industrial: [[I.concrete]] })
const ART_COLORS = {
  mountain: sty({ cute: [[C.woodL, '#d8eefc', C.red]], japanese: [[J.dark, J.washi, J.shu]], nordic: [[N.oak, N.linen, N.mustard]], modern: [[M.black, M.white, M.gray]] }),
  flower: sty({ cute: [[C.white, C.cream, C.sky]], nordic: [[N.oakL, N.white, N.sage]], retro: [[R.caramel, R.cream, R.teal]] }),
  abstract: sty({ modern: [[M.black, M.white, M.gray], [M.silver, M.light, M.char]], nordic: [[N.oak, N.white, N.mustard]], retro: [[R.caramel, R.cream, R.orange]], cute: [[C.white, C.cream, C.pink]] }),
}

export const MISC: AssetDef[] = [
  // ---------- 和风 ----------
  {
    id: 'jp-kiri-tansu', name: '桐箪笥', category: 'japanese', w: 100, d: 45, h: 120, surface: 120, surfaces: KIRI_SURFACES, openable: true,
    ...sty({ japanese: [[J.hinoki, '', J.sumi], ['#f3e3c8', '', '#8a6a4a'], [J.dark, '', '#c9a35a']], nordic: [[N.oakL, '', M.char]], cute: [[C.woodL, '', C.woodD]] }),
    build: kiriTansu,
  },
  {
    id: 'jp-cha-tansu', name: '茶箪笥', category: 'japanese', w: 90, d: 40, h: 90, surface: 90, surfaces: CHA_SURFACES, openable: true,
    ...sty({ japanese: [[J.dark, J.washi], [J.wood, J.washi], [J.hinoki, J.tatami]], retro: [[R.caramel, R.cream]], cute: [[C.wood, C.cream]] }),
    build: chaTansu,
  },
  {
    id: 'jp-byobu', name: '屏风', category: 'japanese', w: 160, d: 20, h: 150,
    ...sty({ japanese: [[J.sumi, J.washi, '#e6c56e'], [J.dark, '#efe0b8', '#d9b452'], [J.shu, J.washi, '#e6c56e']], cute: [[C.woodD, C.cream, C.lemon]] }),
    build: byobu,
  },
  {
    id: 'jp-tsuitate', name: '衝立', category: 'japanese', w: 90, d: 36, h: 107,
    ...sty({ japanese: [[J.dark, J.washi], [J.wood, J.washi], [J.sumi, '#efe0b8']], modern: [[M.black, M.white]], nordic: [[N.oak, N.linen]] }),
    build: tsuitate,
  },
  {
    id: 'jp-butsudan', name: '小佛龛', category: 'japanese', w: 54, d: 50, h: 61, prop: true, fx: BUTSUDAN_FX,
    ...sty({ japanese: [['#7a4b35', '#ffd77a'], [J.dark, '#e6c56e'], [J.sumi, '#e6c56e']], modern: [[M.walnut, M.silver]], nordic: [[N.oak, N.linen]] }),
    build: butsudan,
  },
  {
    id: 'jp-zaisu', name: '座椅子', category: 'japanese', w: 46, d: 56, h: 45,
    ...sty({ japanese: [[J.ai, J.washi], [J.shu, J.washi], [J.tatami, J.hinoki]], cute: [[C.pink, C.white], [C.mint, C.cream]], modern: [[M.char, M.gray]], nordic: [[N.gray, N.linen]] }),
    build: zaisu,
  },
  {
    id: 'jp-kakejiku', name: '挂轴', category: 'japanese', w: 44, d: 4, h: 150, mount: KAKEJIKU_MOUNT,
    ...sty({ japanese: [[J.ai, J.dark, J.washi], ['#8f9a6a', J.dark, J.washi], ['#a7584a', J.sumi, '#f3ead2']] }),
    build: kakejiku,
  },
  {
    id: 'jp-ikebana', name: '生花台', category: 'japanese', w: 38, d: 38, h: 96,
    ...sty({ japanese: [[J.dark, J.sumi, J.shu], [J.wood, '#e8e2d2', C.pink]], modern: [[M.black, M.white, C.white]], nordic: [[N.oak, N.white, N.mustard]] }),
    build: ikebana,
  },
  {
    id: 'jp-bonsai', name: '盆栽台', category: 'japanese', w: 60, d: 32, h: 60,
    ...sty({ japanese: [[J.dark, J.ai], [J.wood, '#8a5a42'], [J.sumi, '#a7584a']], modern: [[M.char, M.light]] }),
    build: bonsaiStand,
  },
  {
    id: 'jp-hibachi', name: '火钵', category: 'japanese', w: 44, d: 44, h: 48, fx: HIBACHI_FX,
    ...sty({ japanese: [[J.washi, J.ai], ['#e9e4d8', J.shu], [J.ai, J.washi]], retro: [[R.cream, R.teal]] }),
    build: hibachi,
  },
  {
    id: 'jp-shoji-lamp', name: '障子落地灯', category: 'lighting', w: 32, d: 32, h: 140,
    ...sty({ japanese: [[J.dark, J.washi], [J.hinoki, J.washi], [J.sumi, '#fff0cf']], nordic: [[N.oak, N.white]], modern: [[M.black, M.white]] }),
    build: shojiLamp,
    family: 'floor-lamp',
    sizeLabel: '障子',
  },

  // ---------- 绿植 ----------
  { id: 'pl-fiddle', name: '琴叶榕', family: 'pl-fiddle', sizeLabel: '大', category: 'plants', w: 56, d: 56, h: 170, ...potColors, build: (p) => fiddleLeaf(p, 1) },
  { id: 'pl-fiddle-m', name: '琴叶榕', family: 'pl-fiddle', sizeLabel: '中', category: 'plants', w: 42, d: 42, h: 115, ...potColors, build: (p) => fiddleLeaf(p, 0.66) },
  { id: 'pl-snake', name: '虎尾兰', category: 'plants', w: 34, d: 34, h: 84, ...potColors, build: snakePlant },
  {
    id: 'pl-olive', name: '橄榄树', category: 'plants', w: 60, d: 56, h: 172,
    ...sty({ nordic: [[N.white], [N.linen]], cute: [[C.peach], [C.white]], modern: [[M.char]], retro: [['#c8794e']], industrial: [[I.concrete]] }),
    build: olive,
  },
  { id: 'pl-bird', name: '天堂鸟', family: 'monstera', sizeLabel: '天堂鸟', category: 'plants', w: 80, d: 80, h: 156, ...potColors, build: birdOfParadise },
  { id: 'pl-alocasia', name: '海芋', category: 'plants', w: 90, d: 90, h: 118, ...potColors, build: alocasia },
  { id: 'pl-hanging', name: '吊兰（壁挂）', category: 'plants', w: 56, d: 52, h: 70, mount: HANGING_MOUNT, ...potShort, build: hangingPlant },
  {
    id: 'pl-bamboo', name: '竹子盆栽', category: 'plants', w: 40, d: 40, h: 150,
    ...sty({ japanese: [[J.sumi], [J.dark]], modern: [[M.char], [M.white]], nordic: [[N.white]], cute: [[C.white]] }),
    build: bambooPot,
  },
  {
    id: 'pl-flower-rack', name: '花架', category: 'plants', w: 82, d: 38, h: 102,
    ...sty({ cute: [[C.white, C.peach], [C.woodL, C.sakura]], nordic: [[N.oak, N.white]], industrial: [[I.iron, I.concrete]], retro: [[R.caramel, R.orange]] }),
    build: flowerRack,
  },

  // ---------- 宠物 ----------
  {
    id: 'pet-dog-house', name: '狗窝', category: 'pets', w: 70, d: 80, h: 75,
    ...sty({ cute: [[C.cream, C.red, C.pink], [C.white, C.sky, C.lemon]], nordic: [[N.white, N.blue, N.mustard], [N.oakL, N.gray, N.sage]], retro: [[R.cream, R.teal, R.red]] }),
    build: dogHouse,
    actor: { kind: 'dog', role: 'home', breed: 'shiba', dock: [0, 9, -6] },
  },
  {
    id: 'pet-cat-bed', name: '猫窝', category: 'pets', w: 50, d: 50, h: 16,
    ...sty({ cute: [[C.sakura, C.white, C.lemon], [C.lilac, C.cream, C.pink]], nordic: [[N.linen, N.white, N.mustard], [N.gray, N.linen, N.blue]], modern: [[M.char, M.light, M.silver]] }),
    build: catBed,
    actor: { kind: 'cat', role: 'home', breed: 'cat', dock: [0, 8.5, 0] },
  },
  {
    id: 'pet-litter', name: '猫砂盆', category: 'pets', w: 52, d: 42, h: 38,
    ...sty({ cute: [[C.white, C.mint], [C.sakura, C.white]], nordic: [[N.white, N.gray]], modern: [[M.white, M.char]] }),
    build: litterBox,
  },
  {
    id: 'pet-bowl', name: '宠物食碗', category: 'pets', w: 38, d: 20, h: 10, prop: true,
    ...sty({ cute: [[C.mint, C.white], [C.sakura, C.white]], nordic: [[N.oak, N.white]], modern: [[M.char, M.silver]], japanese: [[J.wood, J.washi]] }),
    build: petBowl,
  },
  {
    id: 'pet-dog', name: '柴犬', category: 'pets', w: 32, d: 45, h: 50,
    ...sty({ cute: [['#f0b87a', C.white, C.red], ['#5a4646', '#f3dcbc', C.sky], [C.white, C.cream, C.pink], ['#c9a27a', C.white, C.mint]] }),
    build: dog,
    actor: { kind: 'dog', role: 'body', breed: 'shiba' },
  },
  {
    id: 'pet-cat', name: '猫（坐姿）', category: 'pets', w: 22, d: 26, h: 37, prop: true,
    ...sty({ cute: [['#ffcf8f', C.white], [C.white, C.sakura], ['#6b6061', C.white], ['#9a9aa3', C.white]] }),
    build: cat,
    actor: { kind: 'cat', role: 'body', breed: 'cat' },
  },
  {
    id: 'pet-hamster-cage', name: '仓鼠笼', category: 'pets', w: 50, d: 34, h: 38, prop: true,
    ...sty({ cute: [[C.sky, C.white, C.pink], [C.sakura, C.white, C.mint], [C.mint, C.white, C.lemon]], modern: [[M.white, M.silver, M.char]] }),
    build: hamsterCage,
  },
  // 水族箱系列（旧 id pet-aquarium / pet-aquarium-45 保留）
  {
    id: 'pet-aquarium-bowl', name: '水族箱', family: 'aquarium', sizeLabel: '圆形金鱼缸', category: 'pets', w: 27, d: 27, h: 21, prop: true,
    ...sty({ cute: [[C.pink, '#f3e3c3', C.pink], [C.sky, '#f3e3c3', C.lemon]], japanese: [[J.dark, '#e9dcc0', J.shu]], nordic: [[N.oak, '#efe6d6', N.blue]], modern: [[M.black, '#d9d6cf', M.silver]] }),
    build: aquariumBowl,
  },
  {
    id: 'pet-aquarium-30', name: '水族箱', family: 'aquarium', sizeLabel: '桌面 30 cm', category: 'pets', w: 31, d: 24, h: 28, prop: true,
    ...sty({ cute: [[C.white, C.sakura, '#fff4cf'], [C.sky, C.white, '#fff4cf']], nordic: [[N.white, N.oak, '#fff4cf']], modern: [[M.black, M.char, '#e8f4ff']], industrial: [[I.iron, I.walnut, '#fff0c8']] }),
    build: aquariumDesk,
    fx: tankFx(TANKS[30]),
  },
  {
    id: 'pet-aquarium-45', name: '水族箱', family: 'aquarium', sizeLabel: '45 cm（带柜）', category: 'pets', w: 47, d: 29, h: 91,
    ...cabinetTank,
    build: (p) => aquariumCabinet(p, 45),
    fx: tankFx(TANKS[45]),
  },
  {
    id: 'pet-aquarium', name: '水族箱', family: 'aquarium', sizeLabel: '60 cm（带柜）', category: 'pets', w: 62, d: 32, h: 103,
    ...cabinetTank,
    build: (p) => aquariumCabinet(p, 60),
    fx: tankFx(TANKS[60]),
  },
  {
    id: 'pet-aquarium-90', name: '水族箱', family: 'aquarium', sizeLabel: '90 cm（带柜）', category: 'pets', w: 92, d: 47, h: 122,
    ...cabinetTank,
    build: (p) => aquariumCabinet(p, 90),
    fx: tankFx(TANKS[90]),
  },
  {
    id: 'pet-aquarium-120', name: '水族箱', family: 'aquarium', sizeLabel: '120 cm（带柜）', category: 'pets', w: 122, d: 47, h: 122,
    ...cabinetTank,
    build: (p) => aquariumCabinet(p, 120),
    fx: tankFx(TANKS[120]),
  },

  // ---------- 阳台户外 ----------
  {
    id: 'out-bike', name: '自行车', category: 'outdoor', w: 172, d: 56, h: 93,
    ...sty({ cute: [[C.sky, C.woodL, C.pink], [C.mint, C.white, C.woodD]], retro: [[R.teal, R.caramel, R.cream], [R.red, R.caramel, R.cream]], industrial: [[I.iron, I.steel, I.leather]], modern: [[M.white, M.char, M.black]] }),
    build: bicycle,
  },
  {
    id: 'out-folding-set', name: '户外折叠桌椅', category: 'outdoor', w: 140, d: 70, h: 77, surface: 70.5, surfaceShape: [ellipsePoly(28)],
    ...sty({ nordic: [[N.oak, N.white], [N.oakL, N.gray]], cute: [[C.woodL, C.white]], industrial: [[I.walnut, I.iron]], retro: [[R.teal, R.cream]] }),
    build: foldingSet,
  },
  {
    id: 'out-storage', name: '户外储物柜', category: 'outdoor', w: 90, d: 50, h: 80, surface: 80, surfaces: OUT_STORAGE_SURFACES, openable: true,
    ...sty({ cute: [[C.mint, C.white, C.woodD], [C.sakura, C.white, C.woodD]], nordic: [[N.gray, N.white, M.char], [N.sage, N.linen, M.char]], industrial: [[I.steel, I.iron, I.rust]], modern: [[M.char, M.black, M.silver]] }),
    build: outdoorStorage,
  },
  {
    id: 'out-mop-bucket', name: '拖把水桶', category: 'outdoor', w: 36, d: 32, h: 120, family: 'mop-storage', sizeLabel: '标准',
    ...sty({ cute: [[C.sky, C.white], [C.sakura, C.white], [C.mint, C.lemon]], modern: [[M.gray, M.char]], industrial: [[I.steel, I.walnut]] }),
    build: mopBucket,
  },
  {
    id: 'out-futon-rack', name: '晾被架', category: 'outdoor', w: 140, d: 70, h: 115,
    ...sty({ cute: [[C.sky, C.white, C.white], [C.sakura, C.white, C.white]], japanese: [[J.ai, C.steel, J.washi]], nordic: [[N.linen, N.white, N.blue]] }),
    build: futonRack,
  },
  {
    id: 'out-hanging-chair', name: '吊椅', category: 'outdoor', w: 100, d: 100, h: 183,
    ...sty({ nordic: [[N.oakL, N.white, N.white], [N.oak, N.linen, M.char]], cute: [[C.woodL, C.sakura, C.white]], industrial: [[I.leather, I.concrete, I.iron]], modern: [[M.char, M.light, M.black]] }),
    build: hangingChair,
  },
  {
    id: 'out-garden-box', name: '小菜园箱', category: 'outdoor', w: 90, d: 45, h: 100,
    ...sty({ nordic: [[N.oak], [N.white]], cute: [[C.woodL]], industrial: [[I.walnut]], japanese: [[J.wood]] }),
    build: gardenBox,
  },

  // ---------- 落地小家电 ----------
  {
    id: 'ap-fan', name: '落地扇', category: 'appliance', w: 40, d: 40, h: 103,
    ...sty({ cute: [[C.white, C.steel, C.sky], [C.white, C.steel, C.pink]], nordic: [[N.white, N.gray, N.oak]], modern: [[M.white, M.light, M.light]] }),
    build: floorFan,
  },
  {
    id: 'ap-fan-retro', name: '昭和台扇', category: 'appliance', w: 30, d: 26, h: 39, prop: true,
    ...sty({ retro: [[R.cream, C.steel, R.teal], [R.cream, C.steel, R.mustard], [R.teal, C.steel, R.cream]] }),
    build: retroFan,
  },
  {
    id: 'ap-fan-industrial', name: '金属落地扇', category: 'appliance', w: 56, d: 52, h: 131,
    ...sty({ industrial: [[I.iron, I.steel], [I.iron, '#b08d57'], [I.rust, I.iron]] }),
    build: industrialFan,
  },
  {
    id: 'ap-purifier', name: '空气净化器', category: 'appliance', w: 38, d: 22, h: 66,
    ...sty({ cute: [[C.white, C.cream, C.sky], [C.sakura, C.white, C.pink]], nordic: [[N.white, N.linen, N.sage]], modern: [[M.white, M.light, M.gray]] }),
    build: purifier,
  },
  {
    id: 'ap-purifier-tower', name: '圆柱净化器', category: 'appliance', w: 26, d: 26, h: 70,
    ...sty({ modern: [[M.white, M.light, '#9fd8ff'], [M.char, M.black, '#9fd8ff'], [M.silver, M.char, '#ffffff']] }),
    build: purifierTower,
  },
  {
    id: 'ap-humidifier', name: '加湿器', category: 'appliance', w: 26, d: 26, h: 32, prop: true, fx: [{ kind: 'mist', x: 0, y: 31.6, z: 0, scale: 1.2 }],
    ...sty({ cute: [[C.white, C.mint], [C.sakura, C.white], [C.sky, C.white]], nordic: [[N.white, N.oak]], modern: [[M.char, M.white]] }),
    build: humidifier,
  },
  {
    id: 'ap-oil-heater', name: '油汀取暖器', category: 'appliance', w: 58, d: 26, h: 62,
    ...sty({ cute: [[C.white, C.cream, C.red]], modern: [[M.white, M.light, M.char], [M.char, M.black, M.silver]], retro: [[R.cream, R.caramel, R.orange]] }),
    build: oilHeater,
  },
  {
    id: 'ap-robot-vac', name: '扫地机器人', category: 'appliance', w: 34, d: 34, h: 10,
    ...sty({ cute: [[C.white, C.sky, C.pink]], modern: [[M.white, M.light, M.char], [M.black, M.char, M.silver]], nordic: [[N.white, N.gray, N.oak]] }),
    build: robotVac,
    actor: { kind: 'vacuum', role: 'body' },
  },
  {
    id: 'ap-stick-vac', name: '立式吸尘器', category: 'appliance', w: 24, d: 24, h: 108,
    ...sty({ cute: [[C.lilac, C.white, C.pink], [C.mint, C.white, C.sky]], modern: [[M.char, M.white, '#9fd8ff'], [M.white, M.light, M.char]], nordic: [[N.sage, N.white, N.oak]] }),
    build: stickVac,
  },
  {
    id: 'ap-water-dispenser', name: '饮水机', category: 'appliance', w: 32, d: 32, h: 126,
    ...sty({ cute: [[C.white, C.sky]], modern: [[M.white, M.char], [M.char, M.silver]], nordic: [[N.white, N.gray]] }),
    build: waterDispenser,
  },

  // ---------- 壁挂 ----------
  {
    id: 'wall-clock', name: '挂钟', category: 'deco', w: 32, d: 6, h: 32, mount: CLOCK_MOUNT,
    ...sty({ cute: [[C.pink, C.white, C.red], [C.mint, C.cream, C.orange]], nordic: [[N.oak, N.white, N.mustard]], japanese: [[J.dark, J.washi, J.shu]], retro: [[R.mustard, R.cream, R.red]] }),
    build: wallClock,
  },
  {
    id: 'wall-clock-minimal', name: '极简挂钟', category: 'deco', w: 37, d: 3, h: 37, mount: CLOCK_MOUNT,
    ...sty({ modern: [[M.black, M.white, '#e05a3a'], [M.silver, M.char, M.white]], industrial: [[I.iron, I.concrete, I.rust]] }),
    build: wallClockMinimal,
  },
  { id: 'wall-art-mountain', name: '挂画·山与日', family: 'wall-art-mountain', sizeLabel: '大', category: 'deco', w: 60, d: 4, h: 45, mount: ART_MOUNT, ...ART_COLORS.mountain, build: (p) => artMountain(p, 1) },
  { id: 'wall-art-mountain-s', name: '挂画·山与日', family: 'wall-art-mountain', sizeLabel: '小', category: 'deco', w: 40, d: 4, h: 30, mount: ART_MOUNT, ...ART_COLORS.mountain, build: (p) => artMountain(p, 2 / 3) },
  { id: 'wall-art-flower', name: '挂画·花', family: 'wall-art-flower', sizeLabel: '中', category: 'deco', w: 36, d: 4, h: 46, mount: ART_MOUNT, ...ART_COLORS.flower, build: (p) => artFlower(p, 1) },
  { id: 'wall-art-flower-s', name: '挂画·花', family: 'wall-art-flower', sizeLabel: '小', category: 'deco', w: 24, d: 4, h: 31, mount: ART_MOUNT, ...ART_COLORS.flower, build: (p) => artFlower(p, 2 / 3) },
  { id: 'wall-art-abstract', name: '挂画·几何', family: 'wall-art-abstract', sizeLabel: '大', category: 'deco', w: 75, d: 4, h: 54, mount: ART_MOUNT, ...ART_COLORS.abstract, build: (p) => artAbstract(p, 1.5) },
  { id: 'wall-art-abstract-m', name: '挂画·几何', family: 'wall-art-abstract', sizeLabel: '中', category: 'deco', w: 50, d: 4, h: 36, mount: ART_MOUNT, ...ART_COLORS.abstract, build: (p) => artAbstract(p, 1) },
  {
    id: 'wall-shelf', name: '壁挂置物板', category: 'deco', w: 60, d: 18, h: 13, mount: SHELF_MOUNT, surface: SHELF_MOUNT + 13,
    ...sty({ cute: [[C.white, C.woodD], [C.woodL, C.white]], nordic: [[N.oak, N.white]], modern: [[M.white, M.char]], japanese: [[J.hinoki, J.sumi]] }),
    build: wallShelf,
  },
  {
    id: 'wall-pipe-shelf', name: '水管置物板', category: 'deco', w: 80, d: 22, h: 16, mount: SHELF_MOUNT, surface: SHELF_MOUNT + 15.5,
    ...sty({ industrial: [[I.walnut, I.iron], ['#9a7a58', I.iron], [I.walnut, '#b08d57']] }),
    build: pipeShelf,
  },
  {
    id: 'wall-key-rack', name: '钥匙挂架', category: 'deco', w: 36, d: 7, h: 23, mount: KEY_MOUNT,
    ...sty({ cute: [[C.white, C.pink, C.lemon], [C.woodL, C.sky, C.pink]], nordic: [[N.oak, N.white, N.mustard]], industrial: [[I.walnut, I.iron, I.rust]], modern: [[M.white, M.char, M.silver]] }),
    build: keyRack,
  },
  {
    id: 'wall-tv', name: '壁挂电视', family: 'wall-tv', sizeLabel: '43 寸', category: 'deco', ...tvSize(43), d: 6, mount: TV_MOUNT,
    ...sty({ modern: [[M.black, '#2b3446'], [M.char, '#2b3446']], cute: [[C.white, '#a8d4f4']], nordic: [[N.white, '#2b3446']] }),
    build: (p) => wallTV(p, 43),
  },
  {
    id: 'wall-tv-55', name: '壁挂电视', family: 'wall-tv', sizeLabel: '55 寸', category: 'deco', ...tvSize(55), d: 6, mount: TV_MOUNT,
    ...sty({ modern: [[M.black, '#2b3446'], [M.char, '#2b3446']], cute: [[C.white, '#a8d4f4']], nordic: [[N.white, '#2b3446']] }),
    build: (p) => wallTV(p, 55),
  },
  {
    id: 'wall-curtain', name: '窗帘', category: 'deco', w: 204, d: 12, h: 225, mount: CURTAIN_MOUNT,
    ...sty({ cute: [[C.sakura, C.white, C.pink], [C.sky, C.white, C.lemon]], nordic: [[N.linen, N.oak, N.sage], [N.blue, N.oak, N.linen]], modern: [[M.light, M.black, M.char]], japanese: [[J.washi, J.dark, J.ai]], retro: [[R.mustard, R.caramel, R.orange]] }),
    build: curtain,
  },
]
