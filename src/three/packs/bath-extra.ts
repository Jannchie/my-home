// 浴室补充素材包（id 前缀 bx-）：淋浴、浴缸盖（盖着 / 折叠收起）、浴室门口地垫、毛巾挂钩 / 毛巾环 / 浴室毛巾杆、挂起的面巾。
//
// 约定补充：
//   - 淋浴（showerModel）和浴帘（showerCurtainModel）也导出给 house.ts：按浴缸位置自动装到墙上（见 src/bathroom.ts）。
//     原点在墙面、地面高度，+z 朝房间里，+x 沿墙。素材版 bx-shower-set 是同一个模型，供手动摆放。
//   - 浴缸盖（盖着）按浴缸外尺寸分规格：浴缸是 tray 壁厚 7、边沿高 55；盖子比浴缸外沿小 0～12，四角都压在边沿上。
//   - 挂钩类的 hook 层：y = 挂点顶 + 0.5，挂点带在 z > 0（朝外），挂起的毛巾原点 = 挂点，搭在杆 / 钩上往下垂。

import * as THREE from 'three'
import { ball, cyl, rbox, shade, toon, torus } from '../toon'
import { C, G, rectPoly, type AssetCategory, type AssetDef } from '../kit'
import { PI, cylXLegacy, cylZLegacy } from '../geo'
import { I, J, M, N, R, define, type Build, type Dims, type Pal } from '../packkit'

const CHROME = '#d9dee6'
const MIRROR = '#d6ebf5'

const prop = (id: string, name: string, category: AssetCategory, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) =>
  define(id, name, category, dims, pals, build, { prop: true, ...extra })

// ---------- 小工具 ----------

/** 落地居中 */
function ground<T extends THREE.Object3D>(o: T): T {
  o.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(o, true)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.y -= b.min.y
  o.position.z -= (b.min.z + b.max.z) / 2
  return o
}

/** 软管：穿过若干点的平滑细管 */
function hose(pts: [number, number, number][], r: number, color: string) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 6, false), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// =====================================================================
// 淋浴：恒温混水龙头（サーモ水栓）+ 软管 + 升降滑杆 + 花洒；侧墙版带台面（カウンター）和镜子
// =====================================================================

export interface ShowerOpts {
  /** side：洗身区侧墙（从浴缸边往 +x 排开）；over：浴缸背后的墙上，原点在水栓中心 */
  mode: 'side' | 'over'
  /** 模型 +x 翻向 -x */
  sx?: 1 | -1
  /** side：装台面和镜子 */
  full?: boolean
  /** 墙上有窗：不装滑杆和镜子，花洒挂在低位支架上 */
  low?: boolean
}

/** [金属, 本体, 台面] */
export const SHOWER_PALS: Pal[] = [
  ['modern', [CHROME, '#f6f7f9', '#f4f4f2']],
  ['modern', [M.char, M.black, M.light]],
  ['nordic', [M.silver, N.white, N.oakL]],
  ['japanese', [CHROME, J.washi, J.hinoki]],
  ['retro', ['#d4a94a', R.cream, R.teal]],
]

/**
 * 手持花洒：原点在把手底部，把手沿 +y，出水面朝 +z 略向下。tilt 为前倾角。
 */
function showerHead(metal: string, body: string, tilt = 0.3) {
  const g = new THREE.Group()
  g.add(cyl(1.3, 1.6, 15, body, {}, 14))
  g.add(cyl(1.7, 1.7, 1.2, metal, { y: -0.4 }, 14))
  // 喷头：朝 +z 的圆盘
  g.add(cyl(4.6, 4.2, 2.6, body, { y: 18.6 - 1.3, z: 0.6, rx: PI / 2 }, 24))
  const face = cyl(3.8, 3.8, 0.5, shade(body, -0.06), { y: 18.6 - 0.25, z: 2.0, rx: PI / 2 }, 24)
  g.add(face)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    const dot = ball(0.35, '#9aa3ad', { x: Math.cos(a) * 2.2, y: 18.6 + Math.sin(a) * 2.2, z: 2.4 })
    dot.userData.noOutline = true
    g.add(dot)
  }
  g.rotation.x = tilt
  return g
}

/** 恒温混水龙头：横向本体 + 两个旋钮（温度 / 水量）+ 两根偏心管到墙；中心 (x, y)，本体离墙 z0 */
function mixer(metal: string, body: string, x: number, y: number, z0: number, spout: number) {
  const g = new THREE.Group()
  const L = 26
  g.add(cylXLegacy(2.6, L, metal, x, y, z0, 18))
  // 偏心管 + 墙上的装饰盖
  for (const s of [-1, 1]) {
    const px = x + s * 8.5
    g.add(cylZLegacy(1.1, z0, metal, px, y, z0 / 2, 10))
    g.add(cylZLegacy(3, 0.8, metal, px, y, 0.4, 16))
  }
  // 两个旋钮：左温度（带刻度的大圆钮），右水量（带拨杆）
  for (const s of [-1, 1]) {
    const kx = x + s * (L / 2 + 2.2)
    g.add(cylXLegacy(3.4, 4.4, body, kx, y, z0, 20))
    g.add(cylXLegacy(3.6, 0.8, metal, x + s * (L / 2 + 0.2), y, z0, 20))
    g.add(rbox(0.8, 4.6, 0.8, metal, { x: kx + s * 1.9, y: y - 2.3, z: z0 + 3.2 }, 0.3))
  }
  const red = rbox(0.6, 1.4, 0.4, '#ff8f86', { x: x - L / 2 - 2.2, y: y + 2.2, z: z0 + 3.4 }, 0.15)
  red.userData.noOutline = true
  g.add(red)
  // 吐水口（往前伸再朝下）
  if (spout > 0) {
    g.add(cylZLegacy(1.2, spout, metal, x, y - 1, z0 + spout / 2 + 1.5, 12))
    g.add(cyl(1.3, 1.3, 2.2, metal, { x, y: y - 3.2, z: z0 + spout + 0.8 }, 12))
  }
  return g
}

/**
 * 淋浴设备组（墙面）。side 模式从 x = 0（浴缸前沿）往 +x 排：台面 0～64、水栓中心 24、镜子在水栓上方、滑杆 x = 58；
 * 紧凑版（不带台面镜子）水栓 18、滑杆 38。over 模式以水栓为中心，滑杆在 +x 18。
 */
export function showerModel(o: ShowerOpts, p: string[] = SHOWER_PALS[0][1]) {
  const [metal, body, counter] = p
  const sx = o.sx ?? 1
  const g = new THREE.Group()
  const side = o.mode === 'side'
  const full = side && !!o.full
  const mx = side ? (full ? 24 : 18) : 0
  const my = side ? (full ? 80 : 78) : 72
  const mz = 7
  const barX = side ? (full ? 58 : 38) : 18
  g.add(mixer(metal, body, mx, my, mz, side ? 4 : 9))
  if (full) {
    // 台面：贴墙的托板 + 前沿小挡边
    g.add(rbox(64, 2.4, 14, counter, { x: 32, y: 58, z: 7 }, 0.8))
    g.add(rbox(64, 1.2, 1.2, shade(counter, -0.08), { x: 32, y: 60.2, z: 13.4 }, 0.4))
    g.add(rbox(64, 5, 0.8, shade(counter, -0.05), { x: 32, y: 54, z: 0.4 }, 0.3))
  }
  if (full && !o.low) {
    // 镜子：在水栓上方
    g.add(rbox(36, 58, 0.8, metal, { x: mx, y: 94, z: 0.4 }, 0.4))
    const glass = rbox(34, 56, 0.4, MIRROR, { x: mx, y: 95, z: 1.0 }, 0.2)
    glass.material = toon(MIRROR, { emissive: 0.2 })
    glass.userData.noOutline = true
    g.add(glass)
  }
  let hx: number
  let hy: number
  const hz = 7.5
  if (!o.low) {
    // 升降滑杆：两端墙座 + 竖杆 + 滑座（花洒架）
    const y0 = side ? 92 : 100
    const y1 = side ? 188 : 192
    g.add(cyl(1.15, 1.15, y1 - y0, metal, { x: barX, y: y0, z: 4.2 }, 12))
    for (const y of [y0 - 1.5, y1 - 1.5]) {
      g.add(rbox(3.4, 3, 4.6, metal, { x: barX, y, z: 2.3 }, 0.8))
      g.add(cylZLegacy(2.4, 0.8, metal, barX, y + 1.5, 0.4, 14))
    }
    const sy = side ? 160 : 166
    g.add(rbox(4.4, 5, 4, body, { x: barX, y: sy, z: 4.2 }, 1))
    g.add(rbox(3.6, 1.6, 4.4, metal, { x: barX, y: sy + 0.8, z: 6.8 }, 0.5))
    hx = barX
    hy = sy - 4
  } else {
    // 低位支架：水栓旁边
    const by = 98
    g.add(rbox(4, 6, 1, metal, { x: barX, y: by, z: 0.5 }, 0.4))
    g.add(rbox(3.6, 1.6, 6, metal, { x: barX, y: by + 3, z: 3.5 }, 0.5))
    hx = barX
    hy = by - 2
  }
  const head = showerHead(metal, body, 0.3)
  head.position.set(hx, hy, hz)
  g.add(head)
  // 软管：从水栓底部出来，垂成一个弧再上到花洒把手底部
  const ox = mx + 9
  const sag = side ? 44 : 60
  g.add(
    hose(
      [
        [ox, my - 2.2, mz + 1],
        [ox + 1, my - 12, mz + 3],
        [(ox + hx) / 2, sag, mz + 5],
        [hx + 1, sag + 12, hz + 2],
        [hx, hy - 6, hz + 0.6],
        [hx, hy - 0.6, hz - 0.2],
      ],
      0.7,
      metal,
    ),
  )
  if (sx === -1) mirrorX(g)
  return g
}

/** 把整组沿 x 镜像，但不翻转几何（逐个子物体镜像位置和朝向），避免法线翻面 */
function mirrorX(g: THREE.Group) {
  for (const c of g.children) {
    c.position.x = -c.position.x
    c.rotation.y = -c.rotation.y
    c.rotation.z = -c.rotation.z
    if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'TubeGeometry') {
      // 软管是按点生成的：直接把顶点镜像，再翻转三角形绕向
      const geo = (c as THREE.Mesh).geometry as THREE.BufferGeometry
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i))
      const nor = geo.attributes.normal
      for (let i = 0; i < nor.count; i++) nor.setX(i, -nor.getX(i))
      const idx = geo.index
      if (idx) for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i + 1)
        idx.setX(i + 1, idx.getX(i + 2))
        idx.setX(i + 2, a)
      }
      pos.needsUpdate = true
    }
    if (c.children.length && !(c as THREE.Mesh).isMesh) mirrorX(c as THREE.Group)
  }
}

/**
 * 浴帘杆 + 收在一端的浴帘（3点ユニット）：杆沿 x，长 len，原点在杆中心的地面上，杆高 190。
 * bunch = -1 / 1：浴帘收在 -x / +x 端。
 */
export function showerCurtainModel(len: number, bunch: 1 | -1, color = '#e7f1f6', metal = CHROME) {
  const g = new THREE.Group()
  const y = 190
  g.add(cylXLegacy(1.1, len, metal, 0, y, 0, 12))
  for (const s of [-1, 1]) g.add(cylXLegacy(2.4, 1, metal, s * (len / 2 - 0.5), y, 0, 14))
  // 帘子：一串交错的竖条，像收拢的褶
  const x0 = bunch * (len / 2 - 4)
  const n = 6
  for (let i = 0; i < n; i++) {
    const x = x0 - bunch * i * 3.4
    g.add(rbox(3.6, 128, 0.9, i % 2 ? shade(color, -0.05) : color, { x, y: y - 132, z: i % 2 ? 1.2 : -1.2 }, 0.4))
    g.add(torus(1.5, 0.3, metal, { x, y, ry: PI / 2 }))
  }
  return g
}

// =====================================================================
// 浴缸盖
// =====================================================================

const LID_PALS: Pal[] = [
  ['modern', [M.white, M.gray]],
  ['cute', [C.sky, C.white]],
  ['nordic', [N.white, N.oak]],
  ['japanese', [J.hinoki, J.dark]],
  ['retro', [R.cream, R.teal]],
]

/** 巻きふた（盖着）：一排横跨浴缸短边的细板条，板条之间有浅缝 */
function lidRollCover(w: number, d: number): Build {
  return (p) => {
    const [main, edge] = p
    const g = new THREE.Group()
    const n = Math.round(w / 3.2)
    const sw = w / n
    for (let i = 0; i < n; i++) g.add(rbox(sw - 0.35, 1.4, d, i % 2 ? shade(main, -0.04) : main, { x: -w / 2 + sw * (i + 0.5) }, 0.55))
    // 两端收边条
    for (const s of [-1, 1]) g.add(rbox(1.6, 1.8, d, edge, { x: s * (w / 2 - 0.8) }, 0.5))
    return g
  }
}

/** 組ふた（盖着）：三块板，每块带指扣凹槽 */
function lidPanelCover(w: number, d: number): Build {
  return (p) => {
    const [main, edge] = p
    const g = new THREE.Group()
    const k = 3
    const pw = w / k
    for (let i = 0; i < k; i++) {
      const x = -w / 2 + pw * (i + 0.5)
      g.add(rbox(pw - 0.5, 2.2, d, main, { x }, 0.8))
      g.add(rbox(pw - 3, 0.4, d - 3, shade(main, 0.03), { x, y: 2.05 }, 0.3))
      // 指扣：一端靠前的长圆凹槽（深色贴片）
      g.add(rbox(8, 0.4, 2.4, edge, { x, y: 2.15, z: d / 2 - 6 }, 0.2))
    }
    return g
  }
}

/** 折りたたみ式（收起）：一串铰接的长板折成 Z 字，立着 */
function lidZigzag(p: string[]) {
  const [main, hinge] = p
  const g = new THREE.Group()
  const n = 8
  for (let i = 0; i < n; i++) {
    const z = -6 + i * 1.7
    const m = rbox(72, 22, 1.3, i % 2 ? shade(main, -0.05) : main, { y: 0.3, z }, 0.5)
    m.rotation.x = i % 2 ? 0.05 : -0.05
    g.add(m)
    // 铰链：上下交替
    g.add(rbox(70, 0.8, 1.6, hinge, { y: i % 2 ? 0 : 21.6, z: z + 0.85 }, 0.3))
  }
  return ground(g)
}

/** 巻きふた（卷起，小号 60）：横放的一卷 + 两道束带，给进深 61～74 的浅浴缸横搭在一端 */
function lidRolledSmall(p: string[]) {
  const [main, strap] = p
  const g = new THREE.Group()
  const cy = 8.6
  g.add(cylXLegacy(8.2, 59, main, 0, cy, 0, 28))
  for (const s of [-1, 1]) {
    g.add(cylXLegacy(6.8, 0.6, shade(main, -0.1), s * 29.6, cy, 0, 24))
    g.add(cylXLegacy(3.8, 0.6, shade(main, -0.18), s * 29.8, cy, 0, 20))
    g.add(torus(8.2, 0.42, strap, { x: s * 19, y: cy, ry: PI / 2 }))
  }
  return g
}

const LID_W = [110, 120, 130, 140, 150, 160, 170, 180]
const LID_D = [60, 70]
/** 浴缸外尺寸 w × d 能用的盖子规格（盖子不大于浴缸，至多小 12）；没有合适的返回 null */
export function lidSizeFor(w: number, d: number) {
  const lw = [...LID_W].reverse().find((x) => x <= w && x >= w - 12)
  const ld = [...LID_D].reverse().find((x) => x <= d && x >= d - 12)
  return lw && ld ? { w: lw, d: ld } : null
}

const LIDS: AssetDef[] = LID_W.flatMap((w) =>
  LID_D.flatMap((d) => [
    prop(`bx-lid-roll-${w}x${d}`, '浴缸盖（卷帘・盖着）', 'toiletry', [w, d, 1.8], LID_PALS, lidRollCover(w, d), { family: 'bx-lid-roll', sizeLabel: `${w}×${d}`, form: 'closed' }),
    prop(`bx-lid-panel-${w}x${d}`, '浴缸盖（组合板・盖着）', 'toiletry', [w - 0.5, d, 2.6], LID_PALS, lidPanelCover(w, d), { family: 'bx-lid-panel', sizeLabel: `${w}×${d}`, form: 'closed' }),
  ]),
)

// =====================================================================
// 浴室门口地垫
// =====================================================================

/** 珪藻土：两块拼成、可对折（中缝 + 防滑垫脚） */
function matDiatomFold(p: string[]) {
  const [main, edge, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(29.8, 1.0, 40, main, { x: s * 15.1, y: 0.3 }, 0.35))
  g.add(rbox(1.4, 0.4, 38, edge, { y: 0.1 }, 0.15))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.4, 1.4, 0.3, shade(edge, -0.1), { x: sx * 26, z: sz * 16 }, 10))
  g.add(rbox(6, 0.3, 1.6, acc, { x: 22, y: 1.25, z: 17 }, 0.1))
  return g
}

/** 珪藻土：小号，表面一格格的浅圆点（防滑） */
function matDiatomDots(p: string[]) {
  const [main, dot] = p
  const g = G(rbox(45, 0.9, 35, main, {}, 0.4))
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 5; j++) {
      const b = ball(1.4, dot, { x: -18 + i * 6, y: 0.9, z: -12 + j * 6 }, [1, 0.25, 1])
      b.userData.noOutline = true
      g.add(b)
    }
  return g
}

/** 雪尼尔（毛毛虫）地垫：一粒粒的绒条 */
function matChenille(p: string[]) {
  const [main, edge] = p
  const g = G(rbox(60, 0.8, 42, edge, {}, 0.35))
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 6; j++) {
      const b = ball(3.2, (i + j) % 3 ? main : shade(main, -0.05), { x: -25.6 + i * 6.4, y: 1.4, z: -16 + j * 6.4 }, [1, 0.42, 1])
      g.add(b)
    }
  return g
}

/** 毛巾地垫：薄棉垫 + 两端织带 + 一道字母条 */
function matTowel(p: string[]) {
  const [main, band, acc] = p
  const g = G(rbox(65, 0.7, 45, main, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(4, 0.35, 44, band, { x: s * 28, y: 0.6 }, 0.12))
  g.add(rbox(18, 0.25, 3, acc, { x: 0, y: 0.62, z: 15 }, 0.1))
  return g
}

/** 桧木すのこ：五根板条 + 下面两根垫木 */
function matSlat(p: string[]) {
  const [main, under] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(4, 1.6, 38, under, { x: s * 20 }, 0.4))
  for (let i = 0; i < 5; i++) g.add(rbox(60, 1.4, 6.6, main, { y: 1.6, z: -16 + i * 8 }, 0.5))
  return g
}

const DIATOM_PALS: Pal[] = [
  ['modern', [M.light, M.gray, M.char]],
  ['nordic', [N.linen, N.oak, N.sage]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['japanese', ['#d8d2c4', J.wood, J.ai]],
]
const MATS: AssetDef[] = [
  prop('bx-mat-diatom-fold', '浴室地垫', 'toiletry', [60.2, 40, 1.6], DIATOM_PALS, matDiatomFold, { family: 'bath-mat', sizeLabel: '硅藻土・对折' }),
  prop('bx-mat-diatom-dots', '浴室地垫', 'toiletry', [45, 35, 1.3], [
    ['modern', ['#e9e7e2', M.gray]],
    ['nordic', [N.white, N.blue]],
    ['cute', [C.white, C.mint]],
    ['japanese', [J.washi, J.tatami]],
  ], matDiatomDots, { family: 'bath-mat', sizeLabel: '硅藻土・小号' }),
  prop('bx-mat-chenille', '浴室地垫', 'toiletry', [60, 42, 2.75], [
    ['cute', [C.pink, C.white]],
    ['nordic', [N.sage, N.white]],
    ['modern', [M.gray, M.char]],
    ['retro', [R.mustard, R.caramel]],
    ['cute', [C.sky, C.white]],
  ], matChenille, { family: 'bath-mat', sizeLabel: '雪尼尔' }),
  prop('bx-mat-towel', '浴室地垫', 'toiletry', [65, 45, 1], [
    ['nordic', [N.white, N.blue, N.gray]],
    ['modern', [M.light, M.char, M.white]],
    ['japanese', [J.washi, J.ai, J.shu]],
    ['retro', [R.cream, R.orange, R.teal]],
  ], matTowel, { family: 'bath-mat', sizeLabel: '毛巾' }),
  prop('bx-mat-slat', '浴室地垫', 'toiletry', [60, 38.6, 3], [
    ['japanese', [J.hinoki, J.wood]],
    ['nordic', [N.oakL, N.oak]],
    ['industrial', [I.walnut, I.iron]],
  ], matSlat, { family: 'bath-mat', sizeLabel: '桧木踏板' }),
]

// =====================================================================
// 毛巾挂钩 / 毛巾环 / 浴室毛巾杆（壁挂）+ 挂起的面巾
// =====================================================================

const HOOK_PALS: Pal[] = [
  ['modern', [M.silver, M.white]],
  ['modern', [M.black, M.char]],
  ['nordic', [N.oak, N.white]],
  ['japanese', [J.wood, J.sumi]],
  ['cute', [C.white, C.pink]],
]

/** 单个挂钩：圆底座 + 往外伸的横臂 + 上翘的钩尖；毛巾搭在横臂上（钩尖内侧 1.2） */
const HK = { mount: 160, d: 8.1, tip: 3.05 }
function hookAt(g: THREE.Group, x: number, y: number, main: string, base: string) {
  const zb = -HK.d / 2
  g.add(cylZLegacy(2.2, 1.2, base, x, y, zb + 0.6, 18))
  g.add(cylZLegacy(0.75, HK.tip - (zb + 1.2), main, x, y, (HK.tip + zb + 1.2) / 2, 10))
  g.add(ball(0.75, main, { x, y, z: HK.tip }))
  g.add(cyl(0.75, 0.75, 2.4, main, { x, y, z: HK.tip }, 10))
  g.add(ball(1.0, main, { x, y: y + 2.4, z: HK.tip }))
}
function towelHook(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  hookAt(g, 0, HK.mount + 2.2, main, base)
  return g
}
/** 三连挂钩：横板 + 三个钩 */
function towelHook3(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  g.add(rbox(32, 5.6, 1.4, base, { y: HK.mount - 0.6, z: -HK.d / 2 + 0.7 }, 0.5))
  for (const x of [-11, 0, 11]) hookAt(g, x, HK.mount + 2.2, main, base)
  return g
}
/** 毛巾环：墙座 + 短臂 + 吊环 */
const TR = { mount: 104, d: 5.6, r: 8, z: 1.7 }
function towelRing(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  // 臂端小铰正好压在环顶上（以前环和小铰之间空着 1.8cm，环悬空）
  const top = TR.mount + TR.r * 2 + 2.2
  g.add(cylZLegacy(2.4, 1.2, base, 0, top, -TR.d / 2 + 0.6, 18))
  g.add(cylZLegacy(0.8, TR.z - (-TR.d / 2 + 1.2), main, 0, top, (TR.z - TR.d / 2 + 1.2) / 2, 10))
  // 吊环挂在臂端的小铰上，环面平行于墙
  g.add(ball(1.1, main, { y: top, z: TR.z }))
  g.add(torus(TR.r, 0.55, main, { y: TR.mount + 0.55 + TR.r, z: TR.z }))
  return g
}
/** 浴室毛巾杆（短，不锈钢）：杆心离墙 4.4 */
const TBB = { mount: 108, w: 45, barZ: 1.85, d: 5.5 }
function towelBarBath(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  const y = TBB.mount + 2.4
  for (const s of [-1, 1]) {
    const x = s * (TBB.w / 2 - 2.4)
    g.add(cylZLegacy(2.4, 1, base, x, y, -TBB.d / 2 + 0.5, 16))
    g.add(cylZLegacy(0.9, TBB.barZ + TBB.d / 2 - 1, main, x, y, (-TBB.d / 2 + 1 + TBB.barZ) / 2, 10))
  }
  g.add(cylXLegacy(0.9, TBB.w - 4.8, main, 0, y, TBB.barZ, 12))
  return g
}

/** 面巾：叠好 / 搭在挂钩、杆上（原点 = 挂点，往下垂） */
const FT = { w: 34, drop: 40 }
function faceTowelFolded(p: string[]) {
  const [main, border] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) g.add(rbox(34, 1.6, 21, i === 1 ? shade(main, -0.04) : main, { y: i * 1.6 }, 0.7))
  g.add(rbox(34.4, 0.6, 21.4, border, { y: 2.3 }, 0.25))
  return g
}
function faceTowelHanging(p: string[]) {
  const [main, border] = p
  const g = new THREE.Group()
  // 搭在杆 / 钩上：顶上一道横向的弯折压在杆顶（y = -0.5），前后两片往下垂（前片长一点）；挂点中心在 z = 1.85
  const zc = 1.85
  g.add(rbox(FT.w, 1.0, 5.8, main, { y: -0.5, z: zc }, 0.5))
  g.add(rbox(FT.w, FT.drop, 1.0, main, { y: 0.2 - FT.drop, z: zc + 2.4 }, 0.45))
  g.add(rbox(FT.w, FT.drop - 8, 1.0, shade(main, -0.05), { y: 0.2 - FT.drop + 8, z: zc - 2.4 }, 0.45))
  g.add(rbox(FT.w + 0.4, 2, 1.4, border, { y: 0.2 - FT.drop + 3, z: zc + 2.4 }, 0.3))
  return g
}

const TOWEL_PALS: Pal[] = [
  ['cute', [C.sakura, C.white]],
  ['nordic', [N.white, N.blue]],
  ['modern', [M.gray, M.char]],
  ['japanese', [J.washi, J.ai]],
  ['retro', [R.mustard, R.teal]],
]

/** 挂钩层：rest = 毛巾搭的位置（局部 z）。snapToHook 把挂起物原点放在挂点带的内沿，挂起物的搭点在原点前 1.85，所以带的中心取 rest - 0.35 */
const hookLevel = (x0: number, x1: number, rest: number, y: number) => ({ y, kind: 'hook' as const, shape: [rectPoly(x0, rest - 0.35 - 1.5, x1, rest - 0.35 + 1.5)] })

const HOOKS: AssetDef[] = [
  define('bx-towel-hook', '毛巾挂钩', 'toiletry', [4.4, HK.d, 5.6], HOOK_PALS, towelHook, {
    family: 'bx-towel-hook',
    sizeLabel: '单钩',
    mount: HK.mount,
    surfaces: [hookLevel(-1.2, 1.2, HK.tip - 1.2, HK.mount + 2.2 + 0.75 + 0.5)],
  }),
  define('bx-towel-hook-3', '毛巾挂钩', 'toiletry', [32, HK.d, 6], HOOK_PALS, towelHook3, {
    family: 'bx-towel-hook',
    sizeLabel: '三连',
    mount: HK.mount - 0.6,
    surfaces: [-11, 0, 11].map((x) => hookLevel(x - 1.2, x + 1.2, HK.tip - 1.2, HK.mount + 2.2 + 0.75 + 0.5)),
  }),
  define('bx-towel-ring', '毛巾环', 'toiletry', [TR.r * 2 + 1.1, TR.d, TR.r * 2 + 6.5], HOOK_PALS, towelRing, {
    mount: TR.mount,
    // 挂点：环底内侧（面巾从环里穿过搭着）
    surfaces: [hookLevel(-4, 4, TR.z, TR.mount + 1.1 + 0.5)],
  }),
  define('bx-towel-bar-bath', '浴室毛巾杆', 'toiletry', [TBB.w, TBB.d, 4.8], HOOK_PALS, towelBarBath, {
    mount: TBB.mount,
    surfaces: [hookLevel(-TBB.w / 2 + 5, TBB.w / 2 - 5, TBB.barZ, TBB.mount + 2.4 + 0.9 + 0.5)],
  }),
  prop('bx-face-towel-folded', '面巾', 'toiletry', [34.4, 21.4, 4.6], TOWEL_PALS, faceTowelFolded, { family: 'bx-face-towel', form: 'folded' }),
  prop('bx-face-towel-hanging', '面巾', 'toiletry', [34.4, 6, 40.3], TOWEL_PALS, faceTowelHanging, { family: 'bx-face-towel', form: 'hanging' }),
]

// =====================================================================
// 其他：折叠式浴缸盖、淋浴组（手动摆放版）
// =====================================================================

const SHOWER_SET_D = 16.3
const OTHER: AssetDef[] = [
  prop('bx-lid-zigzag', '浴缸盖（折叠式・收起）', 'toiletry', [72, 14.7, 22.4], LID_PALS, lidZigzag, { form: 'folded' }),
  prop('bx-lid-rolled-60', '浴缸盖（卷帘・卷起）', 'toiletry', [60, 17.2, 17.2], LID_PALS, lidRolledSmall, { form: 'lying' }),
  define('bx-shower-set', '淋浴组（水栓・滑杆・镜子）', 'toiletry', [64, SHOWER_SET_D, 147.1], SHOWER_PALS, (p) => {
    const g = showerModel({ mode: 'side', full: true }, p)
    g.position.set(-32, 0, -SHOWER_SET_D / 2)
    return G(g)
  }, {
    mount: 43.3,
    surfaces: [{ y: 60.4, shape: [rectPoly(-30, -SHOWER_SET_D / 2 + 1, 30, -SHOWER_SET_D / 2 + 13)], h: 16 }],
  }),
]

export const BATH_EXTRA: AssetDef[] = [...LIDS, ...MATS, ...HOOKS, ...OTHER]
