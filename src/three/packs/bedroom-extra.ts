// 卧室补充素材包（be- 前缀）：内衣柜（ランジェリーチェスト）、小抽屉柜、矮斗柜、各种风格的化妆台 + 化妆凳。
//   - 内衣柜、矮斗柜可开合（openable）：每格抽屉都是会动的部件，打开时全部拉出，露出码好的内衣；抽屉格（衣物上面）能放东西。
//   - 桌上小抽屉柜（prop）仍是「合上 / 打开」两件素材：打开时拉出一两格。
//   - 化妆台、和风鏡台的抽屉也可开合。
//   - 化妆台都有台面（surface / surfaceShape 避开镜子），化妆品是独立的摆件（toiletry 类）。

import * as THREE from 'three'
import { C, movable, rectPoly, type AssetDef, type SurfaceDef } from '../kit'
import { ball, cyl, rbox, shade, toon, torus } from '../toon'
import { I, J, M, N, R, type Pal } from '../packkit'

function def(id: string, name: string, [w, d, h]: [number, number, number], pals: Pal[], build: (p: string[]) => THREE.Group, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category: 'bedroom',
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

/** 镜面：浅蓝玻璃色、不描边，竖直朝 +z；(x, y, z) 是镜面中心；round = 圆镜（w 为直径） */
function mirrorPlate(w: number, h: number, x: number, y: number, z: number, round = false) {
  const m = round ? cyl(w / 2, w / 2, 0.4, C.glass, {}, 32) : rbox(w, h, 0.4, C.glass, {}, 0.15)
  m.position.set(x, y, z)
  if (round) m.rotation.x = Math.PI / 2
  m.userData.noOutline = true
  return m
}

function bulb(x: number, y: number, z: number, r = 1.5) {
  const b = ball(r, C.lamp, { x, y, z })
  b.material = toon(C.lamp, { emissive: 0.6 })
  return b
}

// ---------- 抽屉里的小衣物 ----------

const UNDIE = ['#fbf7f1', '#ffd6e0', '#cfb8f3', '#a8d4f4', '#3d3f44', '#f4e7c8', '#a6e3cc', '#e88aa0']

/**
 * 一格抽屉里的东西：放进白色分隔收纳格，排得方方正正、挤满 w × d：
 *   seed 偶数：方格收纳盒（每格约 8cm），每格一件叠成小方块的内衣，顶面有一道折痕；同一列同一种颜色；
 *   seed 奇数：档案式竖插，几列之间有隔板，每列内衣一件件紧贴着立放（相邻两件深浅交替，看得出是一件件）。
 * hMax：衣物最高多高（不能冒出抽屉盒）。
 */
const DIVIDER = '#f6f3ee'
function drawerFill(w: number, d: number, seed: number, hMax = 6) {
  const g = new THREE.Group()
  // 每格抽屉取 3 种相邻的颜色，按列交替，整体看上去有秩序
  const cols = [0, 1, 2].map((i) => UNDIE[(seed * 3 + i) % UNDIE.length])
  const wall = 0.4
  const hh = Math.min(hMax, 5)
  const divH = hh + 0.6
  const nx = Math.max(1, Math.round(w / (seed % 2 === 0 ? 8 : 11)))
  const cw = w / nx
  // 竖隔板（两种排法都有）
  for (let i = 1; i < nx; i++) g.add(rbox(wall, divH, d, DIVIDER, { x: -w / 2 + i * cw }, 0.1))
  if (seed % 2 === 0) {
    const nz = Math.max(1, Math.round(d / 8))
    const cd = d / nz
    for (let i = 1; i < nz; i++) g.add(rbox(w, divH, wall, DIVIDER, { z: -d / 2 + i * cd }, 0.1))
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++) {
        const col = cols[ix % cols.length]
        const x = -w / 2 + (ix + 0.5) * cw
        const z = -d / 2 + (iz + 0.5) * cd
        g.add(rbox(cw - wall - 0.5, hh, cd - wall - 0.5, col, { x, z }, 0.9))
        // 折痕：顶面中间一道浅一点的线
        const crease = rbox(cw - wall - 2.2, 0.15, 0.35, shade(col, -0.1), { x, y: hh, z }, 0.05)
        crease.userData.noOutline = true
        g.add(crease)
      }
  } else {
    const t = 2.6
    const nz = Math.max(1, Math.floor(d / t))
    const sz = d / nz
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++) {
        const base = cols[ix % cols.length]
        const col = iz % 2 ? shade(base, -0.07) : base
        g.add(rbox(cw - wall - 0.5, hh, sz - 0.12, col, { x: -w / 2 + (ix + 0.5) * cw, z: -d / 2 + (iz + 0.5) * sz }, 0.8))
      }
  }
  return g
}

/** 一格抽屉：前板 + 浅盒；pull = 拉出的距离 */
function drawer(w: number, h: number, d: number, front: string, body: string, knob: string, pull: number, fill: number | null, knobKind: 'ball' | 'bar' | 'ring', withBox = pull > 0, fillH?: number) {
  const g = new THREE.Group()
  g.add(rbox(w, h, 1.6, front, { z: d / 2 - 0.8 }, 0.5))
  if (knobKind === 'ball') g.add(ball(1.2, knob, { y: h / 2, z: d / 2 + 0.9 }))
  else if (knobKind === 'ring') g.add(torus(1.6, 0.3, knob, { y: h / 2 - 0.6, z: d / 2 + 0.4 }, Math.PI))
  else g.add(rbox(Math.min(10, w * 0.35), 1, 1.2, knob, { y: h / 2 - 0.5, z: d / 2 + 0.5 }, 0.4))
  if (withBox) {
    // 抽屉盒：底 + 两侧 + 后板
    const t = 0.8
    const bh = h - 2
    g.add(rbox(w - 3, t, d - 2, body, { y: 0.6, z: -0.2 }, 0.2))
    for (const s of [-1, 1]) g.add(rbox(t, bh, d - 2, body, { x: s * (w / 2 - 1.9), y: 0.6, z: -0.2 }, 0.2))
    g.add(rbox(w - 3, bh, t, body, { y: 0.6, z: -d / 2 + 0.9 }, 0.2))
    if (fill !== null) {
      const f = drawerFill(w - 5, d - 4, fill, fillH ?? bh - 2)
      f.position.set(0, 0.6 + t, -0.4)
      g.add(f)
    }
  }
  g.position.z = pull
  return g
}

// ---------- 内衣柜：窄高多抽屉 ----------

interface ChestSpec {
  w: number
  d: number
  h: number
  /** 各格抽屉高度（从下往上） */
  rows: number[]
  /** 每层几列 */
  cols?: number[]
  plinth: number
  knob: 'ball' | 'bar' | 'ring'
  legs?: boolean
}

function chest(spec: ChestSpec, open: boolean) {
  return (p: string[]) => {
    const [body, front, knob] = p
    const { w, d, h, rows, plinth } = spec
    const g = new THREE.Group()
    const t = 1.8
    const y0 = plinth
    // 柜体
    for (const s of [-1, 1]) g.add(rbox(t, h - y0, d, body, { x: s * (w / 2 - t / 2), y: y0 }, 0.5))
    g.add(rbox(w, t, d, body, { y: h - t }, 0.6))
    g.add(rbox(w - t * 2, t, d - 1, body, { y: y0, z: 0.5 }, 0.3))
    g.add(rbox(w - t * 2, h - y0 - t, 1, body, { y: y0, z: -d / 2 + 0.5 }, 0.2))
    if (spec.legs) for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.1, y0, shade(body, -0.12), { x: sx * (w / 2 - 3), z: sz * (d / 2 - 3) }, 10))
    else g.add(rbox(w - 2, y0, d - 3, shade(body, -0.12), { z: -1 }, 0.3))
    // 抽屉
    let y = y0 + t
    const inner = h - y0 - t * 2
    const sum = rows.reduce((a, b) => a + b, 0)
    let k = 0
    rows.forEach((rh0, ri) => {
      const rh = (rh0 / sum) * inner
      const n = spec.cols?.[ri] ?? 1
      const cw = (w - t * 2) / n
      for (let c = 0; c < n; c++) {
        // 打开的格：第 2、4 格拉出，露出里面的衣物
        const pull = open && (k === 1 || k === 3) ? Math.min(16, d * 0.4) : 0
        const dr = drawer(cw - 0.5, rh - 0.5, d - 2, front, shade(body, 0.04), knob, pull, pull ? (k === 1 ? 2 : 1) + 2 * (ri + c) : null, spec.knob)
        dr.position.x = -w / 2 + t + cw * (c + 0.5)
        dr.position.y = y + 0.25
        dr.position.z += 0.5
        g.add(dr)
        k++
      }
      y += rh
    })
    return g
  }
}

/** 可开合抽屉柜里每格抽屉的衣物高度（衣物上面是抽屉格） */
const liveFillH = (rh: number) => Math.max(2, Math.min(5, (rh - 2.5) * 0.45))
/** 拉手凸出柜体正面多少（整体往后挪一半，占地以原点为中心） */
const KNOB_OUT = { ball: 1.6, ring: 0.2, bar: 0.6 }
const livePull = (d: number) => Math.round(d * 0.55)

/** 每格抽屉的几何：中心 x、底 y、宽、高、列 / 行序号 */
function chestCells(spec: ChestSpec) {
  const { w, h, rows, plinth } = spec
  const t = 1.8
  let y = plinth + t
  const inner = h - plinth - t * 2
  const sum = rows.reduce((a, b) => a + b, 0)
  const out: { x: number; y: number; cw: number; rh: number; k: number; ri: number; c: number }[] = []
  let k = 0
  rows.forEach((rh0, ri) => {
    const rh = (rh0 / sum) * inner
    const n = spec.cols?.[ri] ?? 1
    const cw = (w - t * 2) / n
    for (let c = 0; c < n; c++) out.push({ x: -w / 2 + t + cw * (c + 0.5), y: y + 0.25, cw, rh, k: k++, ri, c })
    y += rh
  })
  return out
}

/** 可开合的抽屉柜：外观同 chest(spec, false)，每格抽屉是会动的部件（盒里码着衣物） */
function chestLive(spec: ChestSpec) {
  return (p: string[]) => {
    const [body, front, knob] = p
    const { w, d, h, plinth } = spec
    const g = new THREE.Group()
    const t = 1.8
    const y0 = plinth
    for (const s of [-1, 1]) g.add(rbox(t, h - y0, d, body, { x: s * (w / 2 - t / 2), y: y0 }, 0.5))
    g.add(rbox(w, t, d, body, { y: h - t }, 0.6))
    g.add(rbox(w - t * 2, t, d - 1, body, { y: y0, z: 0.5 }, 0.3))
    g.add(rbox(w - t * 2, h - y0 - t, 1, body, { y: y0, z: -d / 2 + 0.5 }, 0.2))
    if (spec.legs) for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.1, y0, shade(body, -0.12), { x: sx * (w / 2 - 3), z: sz * (d / 2 - 3) }, 10))
    else g.add(rbox(w - 2, y0, d - 3, shade(body, -0.12), { z: -1 }, 0.3))
    for (const cell of chestCells(spec)) {
      const dr = drawer(cell.cw - 0.5, cell.rh - 0.5, d - 2, front, shade(body, 0.04), knob, 0, 1 + cell.k + 2 * (cell.ri + cell.c), spec.knob, true, liveFillH(cell.rh - 0.5))
      dr.position.set(cell.x, cell.y, 0.5)
      g.add(movable(dr, { kind: 'drawer', dz: livePull(d) }))
    }
    g.position.z = -KNOB_OUT[spec.knob] / 2
    return new THREE.Group().add(g)
  }
}

/** chestLive 的抽屉格：衣物上面的空间，跟着抽屉拉出 */
function chestLiveSurfaces(spec: ChestSpec): SurfaceDef[] {
  const dd = spec.d - 2
  const dz = 0.5 - KNOB_OUT[spec.knob] / 2
  return chestCells(spec).map((cell) => {
    const dw = cell.cw - 0.5
    const bh = cell.rh - 0.5 - 2
    const fh = liveFillH(cell.rh - 0.5)
    const y = cell.y + 0.6 + 0.8 + fh
    const z0 = dz - 0.4 - (dd - 4) / 2
    const z1 = dz - 0.4 + (dd - 4) / 2
    return {
      y: Math.round(y * 10) / 10,
      h: Math.round(Math.max(0.5, bh - 0.8 - fh) * 10) / 10,
      shape: [rectPoly(cell.x - (dw - 5) / 2, z0, cell.x + (dw - 5) / 2, z1)],
      inside: true,
      slide: livePull(spec.d),
    }
  })
}

const CHEST_PALS: Pal[] = [
  ['nordic', [N.white, N.white, N.oak]],
  ['nordic', [N.oak, N.oakL, N.white]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['modern', [M.char, M.char, M.silver]],
  ['modern', [M.white, M.light, M.black]],
  ['japanese', ['#eadcc0', '#f1e6cf', J.dark]],
  ['retro', [R.caramel, shade(R.caramel, 0.06), '#c9a45c']],
  ['industrial', [I.walnut, I.walnut, I.iron]],
]

const LINGERIE: ChestSpec[] = [
  { w: 38, d: 40, h: 112, rows: [16, 16, 14, 13, 12, 11, 10], plinth: 6, knob: 'ball' },
  { w: 48, d: 42, h: 104, rows: [18, 16, 14, 12, 11, 10], plinth: 12, knob: 'ring', legs: true },
]
/** 打开时拉出的抽屉超出柜体前沿：整体往后挪，让占地仍以原点为中心 */
function centered(build: (p: string[]) => THREE.Group) {
  return (p: string[]) => {
    const g = build(p)
    const b = new THREE.Box3().setFromObject(g, true)
    g.position.z = -(b.min.z + b.max.z) / 2
    return new THREE.Group().add(g)
  }
}
const pullOut = (d: number) => Math.min(16, d * 0.4)

const LOW_CHEST: ChestSpec = { w: 80, d: 42, h: 72, rows: [20, 20, 13], cols: [1, 1, 2], plinth: 8, knob: 'bar' }
const CHESTS: AssetDef[] = [
  // 以前开 / 关是两件素材（-open / -closed），现在 -closed 一件可开合（旧的 -open 读档时迁移成 -closed + open）
  ...LINGERIE.map((s) =>
    def(`be-lingerie-${s.w}-closed`, '内衣柜（ランジェリーチェスト）', [s.w, s.d + 0.9, s.h], CHEST_PALS, chestLive(s), {
      family: 'be-lingerie',
      sizeLabel: `${s.w} 宽`,
      surface: s.h,
      surfaces: chestLiveSurfaces(s),
      openable: true,
    }),
  ),
  def('be-chest-low-closed', '矮斗柜', [LOW_CHEST.w, LOW_CHEST.d + 0.9, LOW_CHEST.h], CHEST_PALS, chestLive(LOW_CHEST), {
    family: 'be-chest-low',
    surface: LOW_CHEST.h,
    surfaces: chestLiveSurfaces(LOW_CHEST),
    openable: true,
  }),
  ...([3, 5] as const).flatMap((n) =>
    ([false, true] as const).map((open) => {
      const s: ChestSpec = { w: 26, d: 20, h: n === 3 ? 22 : 32, rows: Array(n).fill(1), plinth: 1, knob: 'ball' }
      return def(`be-mini-drawers-${n}-${open ? 'open' : 'closed'}`, '桌上小抽屉柜', [s.w, s.d + (open ? pullOut(s.d) + 1.5 : 0.9), s.h], CHEST_PALS, centered(chest(s, open)), {
        family: 'be-mini-drawers',
        sizeLabel: `${n} 格`,
        form: open ? 'open' : 'closed',
        prop: true,
        surface: s.h,
      })
    }),
  ),
]

// ---------- 化妆台 ----------

const VANITY_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.oakL]],
  ['nordic', [N.oak, N.white, N.linen]],
  ['cute', [C.white, C.pink, C.lemon]],
  ['cute', [C.sakura, C.white, C.lilac]],
  ['modern', [M.white, M.silver, M.black]],
  ['modern', [M.black, M.silver, M.char]],
  ['retro', [R.caramel, R.cream, '#c9a45c']],
]

/** 带抽屉的桌面：四腿 + 台面 + 一排抽屉；台面顶 = top */
function desk(w: number, d: number, top: number, main: string, sub: string, acc: string, legKind: 'taper' | 'square' | 'cabriole' = 'taper') {
  const g = new THREE.Group()
  const legH = top - 3
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const at = { x: sx * (w / 2 - 3.5), z: sz * (d / 2 - 3.5) }
      if (legKind === 'square') g.add(rbox(3.6, legH, 3.6, main, at, 0.6))
      else if (legKind === 'cabriole') g.add(cyl(1.4, 2.2, legH, shade(main, -0.06), at, 10), ball(2.3, shade(main, -0.06), { ...at, y: 2.3 }))
      else g.add(cyl(2, 1.3, legH, shade(main, -0.1), at, 10))
    }
  // 台面下的抽屉箱（空心：底板、背板、两侧），抽屉是会动的部件
  const aw = w - 6
  const ad = d - 6
  g.add(rbox(aw, 0.8, ad, main, { y: top - 13 }, 0.3))
  g.add(rbox(aw, 10, 0.8, main, { y: top - 13, z: -ad / 2 + 0.4 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(0.8, 10, ad, main, { x: s * (aw / 2 - 0.4), y: top - 13 }, 0.3))
  g.add(rbox(w, 3, d, main, { y: top - 3 }, 1))
  for (const c of deskDrawers(w, d, top)) {
    const dr = new THREE.Group()
    dr.add(rbox(c.dw - 1, 8, 1.2, sub, { y: 0, z: d / 2 - 3 + 0.6 }, 0.4))
    dr.add(ball(1, acc, { y: 4, z: d / 2 - 1.6 }))
    const inner = shade(sub, 0.08)
    dr.add(rbox(c.dw - 2.4, 0.6, c.bd, inner, { y: 0.4, z: c.bz }, 0.2))
    for (const s of [-1, 1]) dr.add(rbox(0.5, 6, c.bd, inner, { x: s * ((c.dw - 2.4) / 2 - 0.25), y: 0.4, z: c.bz }, 0.15))
    dr.add(rbox(c.dw - 2.4, 6, 0.5, inner, { y: 0.4, z: c.bz - c.bd / 2 + 0.25 }, 0.15))
    dr.position.set(c.x, top - 12, 0)
    g.add(movable(dr, { kind: 'drawer', dz: c.pull }))
  }
  return g
}

/** desk() 的抽屉：中心 x、宽、抽屉盒深 bd 与中心 bz、拉出距离 */
function deskDrawers(w: number, d: number, top: number) {
  const n = w > 80 ? 3 : w > 50 ? 2 : 1
  const dw = (w - 10) / n
  const bd = d - 9
  const bz = d / 2 - 3 - bd / 2
  return Array.from({ length: n }, (_, i) => ({ x: -w / 2 + 5 + dw * (i + 0.5), dw, bd, bz, pull: Math.round(bd * 0.6), top }))
}
/** desk() 抽屉格的可摆放层 */
function deskSurfaces(w: number, d: number, top: number): SurfaceDef[] {
  return deskDrawers(w, d, top).map((c) => ({
    y: top - 12 + 1,
    h: 5.2,
    shape: [rectPoly(c.x - (c.dw - 2.4) / 2 + 0.8, c.bz - c.bd / 2 + 0.8, c.x + (c.dw - 2.4) / 2 - 0.8, c.bz + c.bd / 2 - 0.4)],
    inside: true,
    slide: c.pull,
  }))
}

/** 折叠镜化妆桌：台面后半是掀盖，打开时盖背面的镜子竖起来 */
function vanityFold(open: boolean) {
  return (p: string[]) => {
    const [main, sub, acc] = p
    const w = 80
    const d = 45
    const top = 75
    const g = desk(w, d, top - 2, main, sub, acc, 'square')
    // 掀盖：宽 w-6、深 22，铰链在后沿 z = -d/2 + 2
    const lid = new THREE.Group()
    lid.add(rbox(w - 8, 2, 24, main, { z: 12 }, 0.6))
    // 盖子背面的镜子：盖子立起后朝前
    const mir = mirrorPlate(w - 16, 18, 0, 0, 0)
    mir.position.set(0, -0.25, 12)
    mir.rotation.x = -Math.PI / 2
    lid.add(mir)
    lid.position.set(0, top, -d / 2 + 1)
    if (open) {
      lid.rotation.x = -Math.PI / 2 + 0.22
      // 盖下的收纳格
      g.add(rbox(w - 8, 0.6, 22, shade(sub, 0.08), { y: top - 1.5, z: -d / 2 + 13 }, 0.2))
      for (const x of [-20, 0, 20]) g.add(rbox(0.6, 1.4, 20, sub, { x, y: top - 1.4, z: -d / 2 + 13 }, 0.2))
    } else lid.position.y = top - 2
    g.add(lid)
    return g
  }
}

/** 三面镜梳妆台 */
function vanityTri(p: string[]) {
  const [main, sub, acc] = p
  const w = 90
  const d = 45
  const top = 74
  const g = desk(w, d, top, main, sub, acc, 'cabriole')
  const my = top + 4
  // 镜座
  g.add(rbox(64, 4, 12, main, { y: top, z: -d / 2 + 7 }, 1))
  const zc = -d / 2 + 6
  // 中镜
  g.add(rbox(38, 62, 2.4, main, { y: my, z: zc }, 1))
  g.add(mirrorPlate(33, 57, 0, my + 31, zc + 1.3))
  // 两翼：铰链在中镜两侧，往前转 35°
  for (const s of [-1, 1]) {
    const wing = new THREE.Group()
    wing.add(rbox(19, 54, 2, main, { x: s * 9.5, y: 0 }, 0.8))
    wing.add(mirrorPlate(15.5, 49, s * 9.5, 27, 1.1))
    wing.position.set(s * 19.2, my + 4, zc)
    wing.rotation.y = -s * 0.6
    g.add(wing)
  }
  g.add(ball(1.8, acc, { y: my + 64, z: zc }))
  return g
}

/** 和风鏡台：矮柜（席地坐用）+ 竖长镜 + 鏡掛け（盖布） */
function kyodai(p: string[]) {
  const [main, cloth, acc] = p
  const w = 46
  const d = 32
  const g = new THREE.Group()
  const base = 30
  // 矮柜：空心柜体（底、顶、两侧、背板、中隔板），两格抽屉是会动的部件
  const t = 1.5
  g.add(rbox(w, t, d, main, { y: base - t }, 0.6))
  g.add(rbox(w, 2.5, d, main, {}, 0.6))
  for (const s of [-1, 1]) g.add(rbox(t, base - t - 2.5, d, main, { x: s * (w / 2 - t / 2), y: 2.5 }, 0.5))
  g.add(rbox(w - t * 2, base - t - 2.5, 0.8, main, { y: 2.5, z: -d / 2 + 0.4 }, 0.2))
  g.add(rbox(w - t * 2, 0.8, d - 1, main, { y: 15.2, z: 0.5 }, 0.2))
  for (const c of KYODAI_DRAWERS) {
    const dr = new THREE.Group()
    dr.add(rbox(w - 4, 11, 1, shade(main, 0.05), { z: d / 2 + 0.4 }, 0.4))
    dr.add(torus(1.4, 0.3, acc, { y: 5 - 0.6, z: d / 2 + 1 }, Math.PI))
    const inner = shade(main, 0.12)
    dr.add(rbox(w - 6, 0.6, KYODAI_BD, inner, { y: 0.3, z: d / 2 - KYODAI_BD / 2 }, 0.2))
    for (const s of [-1, 1]) dr.add(rbox(0.5, 8, KYODAI_BD, inner, { x: s * (w / 2 - 3.25), y: 0.3, z: d / 2 - KYODAI_BD / 2 }, 0.15))
    dr.add(rbox(w - 6, 8, 0.5, inner, { y: 0.3, z: d / 2 - KYODAI_BD + 0.25 }, 0.15))
    dr.position.y = c
    g.add(movable(dr, { kind: 'drawer', dz: Math.round(KYODAI_BD * 0.6) }))
  }
  const zc = -d / 2 + 6
  // 两根立柱 + 镜框
  for (const s of [-1, 1]) g.add(rbox(2.6, 56, 2.6, main, { x: s * 14, y: base, z: zc }, 0.6))
  const fr = new THREE.Group()
  fr.add(rbox(24, 46, 2, main, { y: -23 }, 0.8))
  fr.add(mirrorPlate(20, 42, 0, -23, 1.1))
  fr.position.set(0, base + 54, zc)
  fr.rotation.x = -0.08
  g.add(fr)
  // 鏡掛け：从镜顶垂下的一块布，盖住上半面
  g.add(rbox(26, 24, 0.8, cloth, { y: base + 54 - 22, z: zc + 2.6 }, 0.3))
  g.add(rbox(26.4, 2, 1.2, shade(cloth, -0.15), { y: base + 54 - 22, z: zc + 2.6 }, 0.3))
  g.add(rbox(28, 1.6, 3.6, main, { y: base + 54, z: zc }, 0.5))
  return g
}
/** 和风鏡台两格抽屉的底边高度、抽屉盒深 */
const KYODAI_DRAWERS = [3, 16]
const KYODAI_BD = 28
/** centered() 把鏡台往后挪的量（拉手凸出前沿约 1.3）：抽屉格的 z 跟着挪 */
const KYODAI_DZ = -0.65
const KYODAI_SURF: SurfaceDef[] = KYODAI_DRAWERS.map((y) => ({
  y: y + 0.9,
  h: 7.2,
  shape: [rectPoly(-46 / 2 + 3.9, 32 / 2 - KYODAI_BD + 0.6 + KYODAI_DZ, 46 / 2 - 3.9, 32 / 2 - 0.8 + KYODAI_DZ)],
  inside: true,
  slide: Math.round(KYODAI_BD * 0.6),
}))

const KYODAI_PALS: Pal[] = [
  ['japanese', [J.dark, J.shu, '#c9a45c']],
  ['japanese', [J.wood, J.ai, J.dark]],
  ['japanese', ['#eadcc0', '#d65a3c', J.dark]],
  ['retro', [R.caramel, R.red, '#c9a45c']],
]

/** 好莱坞灯泡镜化妆台 */
function vanityHollywood(p: string[]) {
  const [main, sub, acc] = p
  const w = 100
  const d = 45
  const top = 75
  const g = desk(w, d, top, main, sub, acc, 'square')
  const zc = -d / 2 + 3
  const mw = 76
  const mh = 56
  const y0 = top + 4
  g.add(rbox(mw, mh, 3, main, { y: y0, z: zc }, 1))
  for (const s of [-1, 1]) g.add(rbox(4, 6, 4, main, { x: s * 30, y: top, z: zc }, 0.6))
  g.add(mirrorPlate(mw - 12, mh - 12, 0, y0 + mh / 2, zc + 1.7))
  // 灯泡：上沿 5 个，两侧各 3 个
  for (let i = 0; i < 5; i++) g.add(bulb(-mw / 2 + 8 + i * ((mw - 16) / 4), y0 + mh - 3, zc + 2.2))
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(bulb(s * (mw / 2 - 3), y0 + 8 + i * 16, zc + 2.2))
  return g
}

/** 北欧壁挂圆镜 + 小桌（镜子挂在墙上，和桌子算一件） */
function vanityWall(p: string[]) {
  const [main, sub, acc] = p
  const w = 70
  const d = 38
  const top = 74
  const g = desk(w, d, top, main, sub, acc, 'taper')
  const zc = -d / 2 + 1
  const r = 24
  const cy = top + 50
  // 皮带吊挂的圆镜：镜后两根细立柱从桌面后沿撑到镜心，镜子不再悬空
  for (const sx of [-1, 1]) g.add(rbox(2, cy - top, 1.2, sub, { x: sx * 14, y: top, z: zc - 0.2 }, 0.3))
  g.add(torus(r, 1.6, sub, { y: cy, z: zc + 1.2 }))
  g.add(mirrorPlate(r * 2 - 2, 0, 0, cy, zc + 1.2, true))
  g.add(rbox(2.4, 22, 0.6, shade(acc, -0.3), { y: cy + r - 2, z: zc + 0.4 }, 0.2))
  g.add(ball(1.2, M.silver, { y: cy + r + 19, z: zc + 0.8 }))
  return g
}

/** 化妆凳：圆座 + 细腿 */
function stool(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cyl(1.2, 1, 40, main, { x: Math.cos(a) * 11, z: Math.sin(a) * 11 }, 8))
  }
  g.add(cyl(14, 14, 3, main, { y: 39 }, 24))
  g.add(cyl(14.5, 14.5, 4, sub, { y: 41.5 }, 24))
  g.add(ball(13.5, sub, { y: 45.2 }, [1, 0.12, 1]))
  return g
}

const VANITY_SURF = (w: number, d: number, z0: number) => [rectPoly(-w / 2 + 2, z0, w / 2 - 2, d / 2 - 1.5)]
// 化妆台：桌下抽屉可开合（折叠镜化妆桌的镜子立起 / 放平仍是两件素材）
const VANITIES: AssetDef[] = [
  def('be-vanity-fold-open', '折叠镜化妆桌', [80, 45, 97.5], VANITY_PALS, vanityFold(true), { family: 'be-vanity-fold', form: 'open', formLabel: '镜子立起', surface: 73, surfaceShape: VANITY_SURF(80, 45, 2), surfaces: deskSurfaces(80, 45, 73), openable: true }),
  def('be-vanity-fold-closed', '折叠镜化妆桌', [80, 45, 75], VANITY_PALS, vanityFold(false), { family: 'be-vanity-fold', form: 'closed', surface: 73, surfaceShape: VANITY_SURF(80, 45, 2), surfaces: deskSurfaces(80, 45, 73), openable: true }),
  def('be-vanity-tri', '三面镜梳妆台', [90, 45, 143], VANITY_PALS, vanityTri, { surface: 74, surfaceShape: VANITY_SURF(90, 45, -8), surfaces: deskSurfaces(90, 45, 74), openable: true }),
  def('be-kyodai', '和风鏡台', [46, 33, 107], KYODAI_PALS, centered(kyodai), { category: 'japanese', surface: 30, surfaceShape: [rectPoly(-21, -4, 21, 15)], surfaces: KYODAI_SURF, openable: true }),
  def('be-vanity-hollywood', '好莱坞灯泡化妆台', [100, 45, 135], VANITY_PALS, vanityHollywood, { surface: 75, surfaceShape: VANITY_SURF(100, 45, -15), surfaces: deskSurfaces(100, 45, 75), openable: true }),
  def('be-vanity-wall', '北欧圆镜化妆桌', [70, 38, 168], VANITY_PALS, vanityWall, { surface: 74, surfaceShape: VANITY_SURF(70, 38, -15), surfaces: deskSurfaces(70, 38, 74), openable: true }),
  def('be-vanity-stool', '化妆凳', [29, 29, 46.8], [...VANITY_PALS.map(([s, c]): Pal => [s, [c[0], c[1]]])], stool),
]

export const BEDROOM_EXTRA: AssetDef[] = [...CHESTS, ...VANITIES]
