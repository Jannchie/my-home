// 用水空间素材包：厕所 / 浴室 / 洗面所・脱衣所 / 洗衣。
//   - 「可以摆东西的地方」：马桶置物架、洗衣机置物架、镜柜、吊柜、窄柜、浴室转角架、挂篮、浴缸架板…（层板空着，声明 surface / surfaces）
//   - 「需要摆的东西」：洗护瓶、洗衣液、卷纸、马桶刷、浴巾、脏衣篓、熨斗…（prop）
//
// 约定补充：
//   - id 统一用 wet- 前缀。
//   - 用来跨设备的架子按 assets.ts 的设备尺寸留空：洗衣机 64×64×88、马桶水箱宽 46 高 78、洗面台高 83。
//   - 挂起形态（form: 'hanging'）原点 = 挂点：自带 S 钩，钩环内顶在 y = -0.5（搭在横杆顶上），本体在 z ≥ 0.3。
//   - 透明容器用半透明材质，里面的内容物低于口沿；泵头、瓶盖都接在瓶口上。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, markMirror, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, SWING_OPEN, ellipsePoly, holePanel, movable, rectPoly, rng, rod, shell, slab, type AssetCategory, type AssetDef, type Hole, type Poly, type StyleTag, type SurfaceDef } from '../kit'
import { PI, box3, clearDeep, cylXLegacy, cylZLegacy, latheAt, rod3 } from '../geo'
import { I, J, M, N, R, define, type Build, type Dims, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const PAPER = '#fbfaf6'
const CORE = '#c9a27a'
const MIRROR = '#d6ebf5'
const GLASS = '#dff2fb'

// ---------- 定义 ----------

const prop = (id: string, name: string, category: AssetCategory, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) =>
  define(id, name, category, dims, pals, build, { prop: true, ...extra })

// ---------- 小工具 ----------

/** 落地居中：包围盒底面在 y = 0、xz 居中 */
function ground<T extends THREE.Object3D>(o: T): T {
  const b = box3(o)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.y -= b.min.y
  o.position.z -= (b.min.z + b.max.z) / 2
  return o
}

/** 空心圆管（卷纸、纸芯）：带小倒角，at.y 为底 */
function tubeLathe(rIn: number, rOut: number, h: number, color: string, at: { x?: number; y?: number; z?: number; rx?: number; rz?: number } = {}) {
  const k = Math.min(0.25, (rOut - rIn) / 3, h / 4)
  const pts = [
    [rIn + k, 0],
    [rOut - k, 0],
    [rOut, k],
    [rOut, h - k],
    [rOut - k, h],
    [rIn + k, h],
    [rIn, h - k],
    [rIn, k],
    [rIn + k, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y - h / 2))
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), toon(color))
  m.position.set(at.x ?? 0, (at.y ?? 0) + h / 2, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, 0, at.rz ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 一卷卷纸（立着）：纸卷 + 纸芯 */
const ROLL_R = 5.5
const ROLL_H = 11
function roll(color: string, at: { x?: number; y?: number; z?: number } = {}) {
  return G(tubeLathe(2.1, ROLL_R, ROLL_H, color, at), tubeLathe(1.8, 2.15, ROLL_H - 0.4, CORE, { ...at, y: (at.y ?? 0) + 0.2 }))
}
/** 横着的卷纸（卷纸架上），轴沿 x，(y, z) 为轴心 */
function rollX(color: string, x: number, y: number, z: number) {
  return G(tubeLathe(2.1, ROLL_R, 10.5, color, { x, y: y - 5.25, z, rz: PI / 2 }), tubeLathe(1.8, 2.15, 10.1, CORE, { x, y: y - 5.05, z, rz: PI / 2 }))
}

/** 箱体外的一圈装饰带（不填里面）：外尺寸 w × d 的箱子，带厚 t、高 h、底在 y */
function bandRing(w: number, d: number, y: number, h: number, t: number, color: string) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(w + t * 2, h, t, color, { y, z: s * (d / 2 + t / 2 - 0.05) }, Math.min(t * 0.4, 0.3)))
    g.add(rbox(t, h, d, color, { x: s * (w / 2 + t / 2 - 0.05), y }, Math.min(t * 0.4, 0.3)))
  }
  return g
}

// S 钩：上钩环内顶 y = -0.5，下弯钩最低内点 (0, -4.55, 1.85)；挂件的挂环圆心在 (0, LOOP_Y, ITEM_Z)
const ITEM_Z = 1.85
const LOOP_Y = -5.3
const ITEM_TOP = -6
function sHook(color = STEEL) {
  return G(
    torus(1.2, 0.25, color, { y: -1.45, z: 0.2, ry: PI / 2 }, PI * 1.25),
    rod3([0, -2.3, 1.05], [0, -4, 1.05], 0.25, color, 8),
    torus(0.8, 0.25, color, { y: -4, z: 1.85, rx: PI, ry: -PI / 2 }, PI * 1.2),
  )
}

/** 圆角矩形多边形（[x, z]），可在背面中间开一个 U 形缺口 */
function roundRectPoly(w: number, d: number, r: number, notch?: { w: number; d: number }): Poly {
  const pts: Poly = []
  const arc = (cx: number, cz: number, rr: number, a0: number, a1: number, n = 5) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr])
    }
  }
  arc(-w / 2 + r, d / 2 - r, r, PI, PI / 2)
  arc(w / 2 - r, d / 2 - r, r, PI / 2, 0)
  arc(w / 2 - r, -d / 2 + r, r, 0, -PI / 2)
  if (notch) {
    const nr = notch.w / 2
    pts.push([nr, -d / 2])
    arc(0, -d / 2 + notch.d - nr, nr, 0, PI, 10)
    pts.push([-nr, -d / 2])
  }
  arc(-w / 2 + r, -d / 2 + r, r, -PI / 2, -PI)
  return pts
}

// ---------- 配色 ----------

/** 家具：本体 / 门 / 把手 */
const CAB_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.gray]],
  ['modern', [M.white, M.light, M.char]],
  ['japanese', [J.hinoki, J.wood, J.sumi]],
  ['cute', [C.white, C.sakura, C.woodD]],
  ['industrial', [I.walnut, I.iron, I.steel]],
]
/** 架子：层板 / 框架 */
const RACK_PALS: Pal[] = [
  ['modern', [M.white, M.silver]],
  ['industrial', [I.walnut, I.iron]],
  ['nordic', [N.oak, N.white]],
  ['cute', [C.woodL, C.white]],
  ['japanese', [J.hinoki, J.sumi]],
]
/** 浴室金属架：本体 / 点缀 */
const WIRE_PALS: Pal[] = [
  ['modern', [M.silver, M.char]],
  ['modern', [M.black, M.gray]],
  ['nordic', [N.white, N.oak]],
  ['cute', [C.white, C.pink]],
]
/** 塑料日用：主色 / 副色 / 点缀 */
const PLA_PALS: Pal[] = [
  ['cute', [C.white, C.pink, C.sky]],
  ['nordic', [N.white, N.sage, N.oak]],
  ['modern', [M.white, M.char, M.silver]],
  ['japanese', [J.washi, J.ai, J.wood]],
  ['retro', [R.cream, R.teal, R.orange]],
]
/** 织物：主色 / 边 / 点缀 */
const CLOTH_PALS: Pal[] = [
  ['cute', [C.sakura, C.white, C.pink]],
  ['nordic', [N.linen, N.white, N.blue]],
  ['modern', [M.light, M.char, M.white]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['retro', [R.mustard, R.cream, R.teal]],
]
/** 木 / 桧：主色 / 箍 / 点缀 */
const HINOKI_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.dark, J.shu]],
  ['nordic', [N.white, N.gray, N.oak]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['modern', [M.char, M.black, M.silver]],
]

// =====================================================================
// 柜子（通用）：从下到上若干段，门 / 抽屉 / 开放格；开放格的底板记成 surfaces
// =====================================================================

const T = 1.8
interface Sec {
  kind: 'door' | 'open' | 'drawer'
  h: number
  doors?: 1 | 2
  shelves?: number
}
interface WetCabSpec {
  w: number
  d: number
  plinth: number
  secs: Sec[]
}
/** 段落高度、开放层的高度（相对柜底） */
function cabLayout(s: WetCabSpec) {
  let y = s.plinth + T
  const surf: number[] = []
  const boards: number[] = [s.plinth]
  const ranges: [number, number][] = []
  for (const sec of s.secs) {
    if (sec.kind === 'open') {
      surf.push(y)
      const n = sec.shelves ?? 0
      for (let i = 1; i <= n; i++) {
        const by = y + (sec.h * i) / (n + 1) - T / 2
        surf.push(by + T)
      }
    }
    ranges.push([y, y + sec.h])
    y += sec.h
    boards.push(y)
    y += T
  }
  // 累加出来的浮点误差（81.39999…）会直接显示在尺寸标注上，取两位小数
  return { h: Math.round(y * 100) / 100, surf, boards, ranges }
}
function cabinet(s: WetCabSpec, y0 = 0): Build {
  return (p) => {
    const [body, door, handle] = p
    const back = shade(body, -0.07)
    const g = new THREE.Group()
    const L = cabLayout(s)
    const front = s.d / 2 - 1.8
    const dc = front + s.d / 2
    const zc = (front - s.d / 2) / 2
    const bd = dc - 0.6
    const bz = zc + 0.3
    for (const sx of [-1, 1]) g.add(rbox(T, L.h, dc, body, { x: sx * (s.w / 2 - T / 2), y: y0, z: zc }, 0.4))
    g.add(rbox(s.w - T * 2, L.h - s.plinth - T, 0.6, back, { y: y0 + s.plinth + T / 2, z: -s.d / 2 + 0.3 }, 0.2))
    L.boards.forEach((by, i) => {
      const last = i === L.boards.length - 1
      if (last) g.add(rbox(s.w, T, dc, body, { y: y0 + by, z: zc }, 0.5))
      else g.add(rbox(s.w - T * 2, T, bd, body, { y: y0 + by, z: bz }, 0.3))
    })
    if (s.plinth > 0) g.add(rbox(s.w - T * 2, s.plinth, 1.6, body, { y: y0, z: front - 3 }, 0.3))
    const inner = shade(body, 0.05)
    s.secs.forEach((sec, i) => {
      const [a, b] = L.ranges[i]
      if (sec.kind === 'open') {
        const n = sec.shelves ?? 0
        for (let k = 1; k <= n; k++) g.add(rbox(s.w - T * 2, T, bd, body, { y: y0 + a + (sec.h * k) / (n + 1) - T / 2, z: bz }, 0.3))
        return
      }
      const yb = y0 + a - T / 2 + 0.2
      const dh = b - a + T - 0.4
      if (sec.kind === 'drawer') {
        // 抽屉：面板 + 抽屉盒，打开时往前拉出
        const dg = new THREE.Group()
        dg.add(rbox(s.w - 0.6, dh, 1.4, door, { z: 0.7 }, 0.4))
        dg.add(rbox(Math.min(12, s.w * 0.4), 0.8, 0.6, handle, { y: dh / 2 - 0.4, z: s.d / 2 - 0.3 - front }, 0.2))
        const { bw, bd2 } = drawerDims(s)
        const fy = a + 0.2 - (a - T / 2 + 0.2)
        const sh = sec.h - 1.2
        dg.add(rbox(bw, 0.8, bd2, inner, { y: fy, z: -bd2 / 2 }, 0.2))
        for (const sx of [-1, 1]) dg.add(rbox(0.6, sh, bd2, inner, { x: sx * (bw / 2 - 0.3), y: fy, z: -bd2 / 2 }, 0.2))
        dg.add(rbox(bw - 1.2, sh, 0.6, inner, { y: fy, z: -bd2 + 0.3 }, 0.2))
        dg.position.set(0, yb, front)
        g.add(movable(dg, { kind: 'drawer', dz: drawerDims(s).pull }))
        return
      }
      // 门里的层板（高的门柜中间一块）
      if (sec.h >= 30) g.add(rbox(s.w - T * 2, T, bd, inner, { y: y0 + a + sec.h / 2 - T / 2, z: bz }, 0.3))
      const n = sec.doors ?? 1
      const dw = (s.w - 0.6) / n - (n > 1 ? 0.2 : 0)
      const hh = Math.min(10, dh * 0.3)
      for (let k = 0; k < n; k++) {
        const x = n === 1 ? 0 : (k === 0 ? -1 : 1) * (dw / 2 + 0.2)
        const hx = n === 1 ? dw / 2 - 2.5 : x + (k === 0 ? 1 : -1) * (dw / 2 - 2.5)
        const hy = a < 60 && y0 === 0 ? yb + dh - hh - 3 : yb + 3
        // 平开门：铰链在外侧（单扇在左），把手在另一侧
        const left = n === 1 || k === 0
        const off = left ? dw / 2 : -dw / 2
        const leaf = new THREE.Group()
        leaf.add(rbox(dw, dh, 1.4, door, { x: off }, 0.4))
        leaf.add(rbox(0.8, hh, 0.6, handle, { x: off + (hx - x), y: hy - yb, z: s.d / 2 - 0.3 - (front + 0.7) }, 0.2))
        leaf.position.set(left ? x - dw / 2 : x + dw / 2, yb, front + 0.7)
        g.add(movable(leaf, { kind: 'swing', angle: (left ? -1 : 1) * SWING_OPEN }))
      }
    })
    return g
  }
}
/** 抽屉盒的宽、深（从面板背后往里）和拉出距离 */
function drawerDims(s: WetCabSpec) {
  const front = s.d / 2 - 1.8
  const dc = front + s.d / 2
  const bd2 = Math.round((dc - 1.4) * 10) / 10
  return { bw: s.w - T * 2 - 0.6, bd2, pull: Math.round(bd2 * 0.6) }
}
function cabSurfaces(s: WetCabSpec, y0 = 0): SurfaceDef[] {
  const L = cabLayout(s)
  const r1 = (v: number) => Math.round(v * 10) / 10
  const shape = [rectPoly(-s.w / 2 + T + 0.5, -s.d / 2 + 1.2, s.w / 2 - T - 0.5, s.d / 2 - 2.3)]
  const out: SurfaceDef[] = L.surf.map((y) => ({ y: r1(y0 + y), shape }))
  // 门里 / 抽屉里的层（和 cabinet() 的板对得上）
  s.secs.forEach((sec, i) => {
    const [a, b] = L.ranges[i]
    if (sec.kind === 'door') {
      if (sec.h >= 30) {
        const mid = a + sec.h / 2 + T / 2
        out.push({ y: r1(y0 + a), h: r1(mid - T - a), inside: true, shape }, { y: r1(y0 + mid), h: r1(b - mid), inside: true, shape })
      } else out.push({ y: r1(y0 + a), h: r1(b - a), inside: true, shape })
    } else if (sec.kind === 'drawer') {
      const { bw, bd2, pull } = drawerDims(s)
      const front = s.d / 2 - 1.8
      out.push({ y: r1(y0 + a + 1), h: r1(sec.h - 1.6), inside: true, slide: pull, shape: [rectPoly(-bw / 2 + 0.8, front - bd2 + 0.8, bw / 2 - 0.8, front - 0.2)] })
    }
  })
  return out
}

// =====================================================================
// 立杆置物架（马桶 / 洗衣机上方）：四根立柱、几层板，板后和两侧有挡杆
// =====================================================================

interface RackSpec {
  w: number
  d: number
  tops: number[]
  braces: number[]
  hookBar?: number
}
const POST_R = 1.3
const BOARD_T = 1.6
const RAIL_H = 4
function rackH(s: RackSpec) {
  return s.tops[s.tops.length - 1] + RAIL_H + 0.5 + 1.2
}
function rack(s: RackSpec): Build {
  return (p) => {
    const [board, frame] = p
    const g = new THREE.Group()
    const top = s.tops[s.tops.length - 1] + RAIL_H + 0.5
    const px = s.w / 2 - POST_R
    const pz = s.d / 2 - POST_R
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        g.add(cyl(POST_R, POST_R, top, frame, { x: sx * px, z: sz * pz }, 12))
        g.add(ball(POST_R + 0.1, frame, { x: sx * px, y: top, z: sz * pz }, [1, 0.9, 1]))
        g.add(puck(POST_R, 1, shade(frame, -0.2), { x: sx * px, z: sz * pz }))
      }
    for (const t of s.tops) {
      g.add(rbox(s.w, BOARD_T, s.d, board, { y: t - BOARD_T }, 0.4))
      const ry = t + RAIL_H
      g.add(cylXLegacy(0.5, px * 2, frame, 0, ry, -pz))
      for (const sx of [-1, 1]) g.add(cylZLegacy(0.5, pz * 2, frame, sx * px, ry, 0))
    }
    for (const y of s.braces) for (const sx of [-1, 1]) g.add(cylZLegacy(0.7, pz * 2, frame, sx * px, y, 0))
    if (s.hookBar) g.add(cylXLegacy(1.0, px * 2, frame, 0, s.hookBar, pz))
    return g
  }
}
function rackSurfaces(s: RackSpec) {
  const shape = [rectPoly(-s.w / 2 + 3, -s.d / 2 + 2, s.w / 2 - 3, s.d / 2 - 1)]
  const out: NonNullable<AssetDef['surfaces']> = s.tops.slice(0, -1).map((y) => ({ y, shape }))
  if (s.hookBar) out.push({ y: s.hookBar + 1.0 + 0.5, kind: 'hook', shape: [rectPoly(-s.w / 2 + 5, s.d / 2 - POST_R - 1.5, s.w / 2 - 5, s.d / 2 - 0.2)] })
  return out
}

// 马桶置物架：内宽 51 > 水箱盖 46；最低层板底 > 水箱顶 78
const TOILET_RACKS: { label: string; s: RackSpec }[] = [
  { label: '2 层', s: { w: 56, d: 24, tops: [118, 148], braces: [20, 100] } },
  { label: '3 层', s: { w: 56, d: 24, tops: [110, 138, 166], braces: [20, 95] } },
]
// 洗衣机置物架：内宽 > 洗衣机 64；最低层板底 > 机顶 88 + 开盖空间
const LAUNDRY_RACKS: { label: string; s: RackSpec }[] = [
  { label: '70', s: { w: 70, d: 32, tops: [122, 150, 178], braces: [20], hookBar: 110 } },
  { label: '80', s: { w: 80, d: 32, tops: [122, 150, 178], braces: [20], hookBar: 110 } },
]

// =====================================================================
// 厕所
// =====================================================================

// 厕所吊柜：下层开放格 + 上面两扇门
const TOILET_CAB: WetCabSpec = { w: 45, d: 18, plinth: 0, secs: [{ kind: 'open', h: 12 }, { kind: 'door', h: 30, doors: 2 }] }
const TOILET_CAB_MOUNT = 150
// 厕所窄柜：放卷纸的下柜 + 上面开放格
const TOILET_SLIM: WetCabSpec = { w: 20, d: 36, plinth: 4, secs: [{ kind: 'door', h: 50 }, { kind: 'open', h: 22 }] }
// 马桶上方吊戸棚（トイレ吊戸棚）：底下一条开放格放芳香剂 / 一卷备用纸，门里两层放卷纸、卫生巾、清洁剂（进深 27：4 卷装放得进）
const TOILET_UPPER = (w: number): WetCabSpec => ({ w, d: 27, plinth: 0, secs: [{ kind: 'open', h: 14 }, { kind: 'door', h: 40, doors: 2 }] })
const TOILET_UPPER_MOUNT = 150

// 卷纸：叠放 / 4 卷装 / 12 卷装
function tpStack(p: string[]) {
  const [paper] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) g.add(roll(paper, { y: i * ROLL_H }))
  return g
}
function tpPack(nx: number, nz: number, ny: number, handle: boolean): Build {
  return (p) => {
    const [paper, print, accent] = p
    const g = new THREE.Group()
    const W = nx * ROLL_R * 2
    const D = nz * ROLL_R * 2
    const H = ny * ROLL_H
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++)
        for (let iy = 0; iy < ny; iy++) g.add(roll(paper, { x: -W / 2 + ROLL_R + ix * ROLL_R * 2, y: 0.3 + iy * ROLL_H, z: -D / 2 + ROLL_R + iz * ROLL_R * 2 }))
    // 包装膜：半透明外壳 + 印刷带
    g.add(clearDeep(rbox(W + 0.6, H + 0.8, D + 0.6, PAPER, {}, 1.5), '#f4fbff', 0.3))
    g.add(rbox(W + 0.9, H * 0.36, D + 0.9, print, { y: H * 0.3 }, 0.6))
    g.add(rbox(W * 0.5, H * 0.12, 0.4, accent, { y: H * 0.42, z: D / 2 + 0.5 }, 0.2))
    if (handle) {
      // 提手：顶上一条塑料带
      g.add(rbox(4, 0.4, D * 0.7, print, { y: H + 0.8 }, 0.15))
      g.add(torus(3, 0.5, print, { y: H + 1.2 }, PI))
    }
    return g
  }
}
const TP_PALS: Pal[] = [
  ['cute', [PAPER, C.pink, C.white]],
  ['nordic', [PAPER, N.blue, N.white]],
  ['modern', [PAPER, M.char, M.white]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['retro', [R.cream, R.teal, R.orange]],
]

// 卷纸架（壁挂，单个）：背板 + 侧臂 + 横轴 + 上盖板，挂一卷纸
const TPH_MOUNT = 70
function tpHolder(p: string[]) {
  const [main, paper] = p
  const m = TPH_MOUNT
  const d = 13
  const g = new THREE.Group()
  const back = -d / 2
  const cz = back + 1 + ROLL_R + 0.5
  const cy = m + 6.2
  g.add(rbox(14, 13.4, 1, main, { y: m, z: back + 0.5 }, 0.4))
  g.add(rbox(1.2, 2, cz - back - 1 + 1, main, { x: 6.3, y: cy - 1, z: (back + 1 + cz + 1) / 2 }, 0.3))
  g.add(cylXLegacy(1.1, 12.6, STEEL, 0, cy, cz))
  g.add(rollX(paper, 0, cy, cz))
  // 垂下来的纸尾
  g.add(rbox(10.2, 6, 0.2, paper, { y: cy - 6, z: cz + ROLL_R + 0.1 }, 0.05))
  // 上盖板（盖住纸卷上方）
  g.add(rbox(13.6, 0.6, 9.4, main, { y: m + 12.8, z: back + 1 + 4.7 }, 0.3))
  return g
}
// 双联卷纸架：两卷并排，上面一块木置物板
function tpHolderDouble(p: string[]) {
  const [main, paper, wood] = p
  const m = TPH_MOUNT
  const d = 14
  const g = new THREE.Group()
  const back = -d / 2
  const cz = back + 1 + ROLL_R + 0.5
  const cy = m + 6.2
  g.add(rbox(32, 12.4, 1, main, { y: m, z: back + 0.5 }, 0.4))
  for (const x of [-15.4, 0, 15.4]) g.add(rbox(1.2, 12.4, cz - back + 1, main, { x, y: m, z: (back + 1 + cz + 2) / 2 - 0.5 }, 0.3))
  for (const sx of [-1, 1]) {
    g.add(cylXLegacy(1.1, 15.4, STEEL, sx * 7.7, cy, cz))
    g.add(rollX(paper, sx * 7.7, cy, cz))
  }
  g.add(rbox(10.2, 6, 0.2, paper, { x: 7.7, y: cy - 6, z: cz + ROLL_R + 0.1 }, 0.05))
  g.add(rbox(33, 1.8, d, wood, { y: m + 12.4, z: 0 }, 0.4))
  return g
}

// 马桶刷 + 刷架
function toiletBrush(p: string[]) {
  const [main, handle, head] = p
  const g = new THREE.Group()
  g.add(cup(4.5, 4, 13, 0.4, main))
  g.add(ball(3, head, { y: 3.6 }, [1, 0.9, 1]))
  g.add(cyl(0.55, 0.55, 30, handle, { y: 4 }, 10))
  g.add(capsule(0.9, 5, handle, { y: 32 }))
  // 刷架口沿的圆环盖
  g.add(torus(2.6, 0.5, main, { y: 12.7, rx: PI / 2 }))
  for (const a of [0, PI / 2, PI, PI * 1.5]) g.add(rbox(1.2, 0.5, 2.2, main, { x: Math.cos(a) * 3.2, y: 12.45, z: Math.sin(a) * 3.2, ry: -a }, 0.2))
  return g
}

// 卫生桶：窄身带盖
function sanitaryBin(p: string[]) {
  const [main, lid, acc] = p
  return G(
    rbox(13, 22, 20, main, {}, 3),
    rbox(13.6, 3, 20.6, lid, { y: 21.6 }, 1.4),
    rbox(5, 0.8, 2.4, acc, { y: 24.3, z: 6 }, 0.35),
    rbox(10, 1.2, 0.4, shade(main, -0.08), { y: 2, z: 10.1 }, 0.2),
  )
}

// 芳香剂：半透明罐 + 凝胶 + 镂空盖
function airFreshener(p: string[]) {
  const [gel, capC, acc] = p
  const g = new THREE.Group()
  g.add(clearDeep(cup(3.6, 3.6, 8, 0.3, GLASS), GLASS, 0.35))
  g.add(cyl(3.2, 3.25, 5.2, gel, { y: 0.3 }, 20))
  g.add(cup(3.9, 3.9, 2.4, 0.3, capC, { y: 7.2 }))
  g.add(puck(3.9, 0.6, capC, { y: 9.3 }))
  for (const a of [0, PI / 3, (2 * PI) / 3, PI, (4 * PI) / 3, (5 * PI) / 3]) g.add(rbox(0.6, 0.3, 2, acc, { x: Math.cos(a) * 2.2, y: 9.8, z: Math.sin(a) * 2.2, ry: -a }, 0.1))
  return g
}

// 厕所地垫：U 形缺口包住马桶底座
const TOILET_MAT = roundRectPoly(60, 55, 7, { w: 31, d: 26 })
function toiletMat(p: string[]) {
  const [main, dot] = p
  const g = G(slab(TOILET_MAT, 1.2, main))
  for (const [x, z] of [
    [-20, 18],
    [0, 20],
    [20, 18],
    [-23, -2],
    [23, -2],
    [-22, -18],
    [22, -18],
    [-10, 8],
    [10, 8],
  ])
    g.add(puck(2.2, 0.6, dot, { x, y: 0.9, z }))
  return g
}

// 拖鞋（一双）
function slippers(p: string[]) {
  const [sole, band, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * 5.6
    g.add(slab(ellipsePoly(4.6, 12.5, x, 0), 1.6, sole))
    const b = torus(4.2, 0.6, band, { x, y: 1.4, z: 5 }, PI)
    b.scale.z = 6
    g.add(b)
    g.add(ball(1.1, acc, { x, y: 5.9, z: 5 }, [1, 0.6, 1]))
  }
  return g
}

// 马桶清洁剂（鸭嘴瓶）
function toiletCleaner(p: string[]) {
  const [main, cap, label] = p
  return G(
    rbox(8, 15, 5.6, main, {}, 2.2),
    cyl(1.6, 2.4, 1.5, main, { y: 14.6 }, 16),
    rod3([0, 15.6, 0], [2.6, 20.6, 0], 1.1, main, 12),
    ball(1.4, cap, { x: 2.7, y: 20.8 }),
    rbox(6.4, 6, 0.4, label, { y: 4, z: 2.9 }, 0.2),
  )
}

// 马桶搋子（ラバーカップ）：橡胶碗 + 长柄
function plunger(p: string[]) {
  const [rubber, handle, cap] = p
  return G(
    latheAt([[0, 0.3], [6.3, 0.3], [6.8, 0.9], [6.5, 3.2], [5.3, 5.8], [3.1, 7.6], [1.7, 8.4], [0, 8.4]], rubber, {}, 28),
    // 碗口一圈稍深的翻边
    torus(6.4, 0.45, shade(rubber, -0.12), { y: 0.6, rx: PI / 2 }),
    cyl(1.6, 1.9, 2.2, rubber, { y: 7.6 }, 14),
    cyl(1.05, 1.05, 37, handle, { y: 8.6 }, 12),
    capsule(1.3, 1.6, cap, { y: 45.2 }),
  )
}

// 卫生巾（袋装）：软塑料包装 + 印刷带 + 顶部提手开口
function padsPack(p: string[]) {
  const [pack, print, accent] = p
  return G(
    rbox(16, 13.4, 8.4, pack, {}, 2.6),
    rbox(16.3, 4.2, 8.7, print, { y: 3.6 }, 1.2),
    rbox(7, 2.6, 0.4, accent, { x: -3, y: 8.8, z: 4.3 }, 0.6),
    ball(1.1, accent, { x: 4.6, y: 9.9, z: 4.25 }, [1, 1, 0.3]),
    // 顶上的提手：一条压边 + 椭圆开口
    rbox(15, 1, 2.2, shade(pack, -0.05), { y: 13.2 }, 0.4),
    rbox(4.4, 0.6, 1.2, shade(print, -0.15), { y: 13.6 }, 0.3),
  )
}

// 护垫（盒装）：扁纸盒 + 抽取口
function linerBox(p: string[]) {
  const [box, print, accent] = p
  return G(
    rbox(12.4, 9, 6.4, box, {}, 0.5),
    rbox(12.6, 2.6, 6.6, print, { y: 1 }, 0.3),
    rbox(7, 0.3, 2.4, shade(box, -0.18), { y: 9, z: 0 }, 0.6),
    ball(1.2, accent, { x: -3.6, y: 6, z: 3.2 }, [1, 1, 0.3]),
    rbox(4.6, 1, 0.3, accent, { x: 1.8, y: 6, z: 3.25 }, 0.15),
  )
}

const PLUNGER_PALS: Pal[] = [
  ['modern', ['#2e2f33', M.white, M.char]],
  ['retro', ['#8c2f2a', '#c49a6c', '#5a3a26']],
  ['nordic', [N.gray, N.oak, N.white]],
  ['cute', [C.pink, C.white, C.sakura]],
]
const PADS_PALS: Pal[] = [
  ['cute', [C.white, C.pink, C.sakura]],
  ['nordic', ['#eef3f7', N.blue, N.sage]],
  ['modern', [M.white, '#7f8fa6', M.char]],
  ['japanese', [J.washi, '#b98aa8', J.shu]],
  ['retro', [R.cream, R.teal, R.orange]],
]

// =====================================================================
// 浴室
// =====================================================================

// 洗发水 / 护发素 / 沐浴露：方圆瓶 + 按压泵；洗发水瓶侧有刻痕（日本的触觉标识）
type BottleKind = 'shampoo' | 'conditioner' | 'body'
function bathBottle(kind: BottleKind): Build {
  return (p) => {
    const [bottle, pump, label] = p
    const g = new THREE.Group()
    g.add(rbox(7.5, 16, 7.5, bottle, {}, 2.4))
    g.add(cyl(1.5, 3, 1.4, bottle, { y: 15.8 }, 16))
    g.add(cyl(1.3, 1.3, 1.2, bottle, { y: 17 }, 12))
    g.add(cyl(1.8, 1.8, 1.4, pump, { y: 17.8 }, 14))
    g.add(cyl(0.55, 0.55, 1.6, pump, { y: 19.1 }, 8))
    g.add(rbox(2.6, 1.5, 2.6, pump, { y: 20.6 }, 0.5))
    g.add(rbox(1.1, 0.8, 3.4, pump, { y: 21.1, z: 2.6 }, 0.3))
    g.add(rbox(6.2, 7, 0.4, label, { y: 4, z: 3.85 }, 0.2))
    g.add(rbox(4.2, 0.8, 0.3, shade(label, -0.2), { y: 9.2, z: 4.05 }, 0.1))
    if (kind === 'shampoo') for (let i = 0; i < 5; i++) g.add(rbox(0.4, 0.5, 3.4, shade(bottle, -0.12), { x: 3.85, y: 9 + i * 1.1 }, 0.1))
    if (kind === 'body') g.add(rbox(0.4, 6, 0.6, shade(bottle, -0.12), { x: 3.85, y: 7 }, 0.1))
    return ground(g)
  }
}
const BOTTLE_BASE: [StyleTag, string, string][] = [
  ['cute', C.white, C.sakura],
  ['nordic', N.white, N.oak],
  ['modern', M.black, M.silver],
  ['japanese', J.washi, J.sumi],
  ['retro', R.cream, R.caramel],
]
const BOTTLE_LABEL: Record<BottleKind, string[]> = {
  shampoo: [C.sky, N.blue, M.white, J.ai, R.teal],
  conditioner: [C.pink, '#d9a7a0', M.light, J.shu, R.red],
  body: [C.mint, N.sage, M.gray, J.tatami, R.mustard],
}
const bottlePals = (k: BottleKind): Pal[] => BOTTLE_BASE.map(([s, b, pump], i) => [s, [b, pump, BOTTLE_LABEL[k][i]]])

// 三瓶套装（放在一块沥水托盘上）
function bottleSet(p: string[]) {
  const [bottle, pump, tray0] = p
  const g = new THREE.Group()
  g.add(tray(27, 1.6, 10, 0.6, tray0, {}, 0.3))
  const kinds: BottleKind[] = ['shampoo', 'conditioner', 'body']
  kinds.forEach((k, i) => {
    const b = bathBottle(k)([bottle, pump, BOTTLE_LABEL[k][0]])
    b.position.x += (i - 1) * 8.4
    b.position.y += 0.6
    g.add(b)
  })
  return g
}

// 补充装袋（立袋）
function refillPouch(p: string[]) {
  const [main, label, cap] = p
  return G(
    rbox(12, 20, 3.4, main, { y: 0.4 }, 1.2),
    rbox(12.2, 2.4, 5, main, {}, 1),
    rbox(12.2, 1.2, 1.2, shade(main, -0.08), { y: 19.6 }, 0.3),
    cyl(1, 1, 1.6, cap, { x: 3.6, y: 20.2 }, 12),
    rbox(9, 8, 0.4, label, { y: 6, z: 1.85 }, 0.2),
  )
}

// 洁面乳管：盖朝下立着
function faceWash(p: string[]) {
  const [main, cap, label] = p
  return G(
    cyl(1.6, 1.6, 2.2, cap, {}, 16),
    cyl(1.9, 1.2, 1.2, main, { y: 2 }, 16),
    rbox(4, 10, 2.8, main, { y: 3 }, 1.3),
    rbox(4.4, 1.2, 0.8, shade(main, -0.08), { y: 12.6 }, 0.3),
    rbox(2.8, 5, 0.3, label, { y: 5, z: 1.45 }, 0.1),
  )
}

// T 字剃刀（平放）
function razor(p: string[]) {
  const [handle, head] = p
  return G(
    rbox(1.2, 1.0, 11, handle, { z: -0.8 }, 0.45),
    rbox(4.2, 1.3, 1.6, head, { z: 5.5 }, 0.4),
    rbox(3.8, 0.4, 0.5, STEEL, { y: 1.15, z: 5.5 }, 0.1),
    rbox(1.4, 0.4, 3, shade(handle, -0.2), { y: 0.8, z: -2 }, 0.15),
  )
}

// 浴球：网纱褶边 + 挂绳
function bathPouf(p: string[]) {
  const [main, cord] = p
  const g = new THREE.Group()
  g.add(ball(6, main, { y: 5.4 }, [1, 0.9, 1]))
  for (let i = 0; i < 5; i++) g.add(torus(5.1, 0.8, shade(main, -0.05), { y: 5.4, rx: PI / 2 + (i - 2) * 0.55, ry: i * 1.1 }))
  g.add(torus(1.6, 0.25, cord, { y: 12.1 }))
  return ground(g)
}

// 洗澡海绵
function bathSponge(p: string[]) {
  const [main, scrub] = p
  return G(rbox(11, 3.6, 7, main, {}, 1.4), rbox(11, 1, 7, scrub, { y: 3.4 }, 0.45))
}

// 浴凳（风呂椅子）：四面带拱形开口的裙板 + 中间开槽的座面
function bathStool(h: number): Build {
  return (p) => {
    const [main] = p
    const arch: Hole[] = [{ kind: 'arch', x: 0, y: 2, w: 12, h: (h - 3) * 0.6 }]
    return G(
      shell(30, h - 3, 23, 1.6, main, { top: false, bottom: false, front: arch, back: arch, left: arch, right: arch }),
      holePanel(32, 25, 3, main, [{ kind: 'rect', x: 0, y: 4, w: 4.5, h: 13, r: 2 }], { y: h - 1.5, z: 12.5, rx: -PI / 2 }, 4),
    )
  }
}

// 洗面桶（風呂桶）：空心，两道箍
function bathPail(p: string[]) {
  const [main, hoop] = p
  const g = G(cup(12, 10.5, 11, 0.9, main))
  for (const y of [2.2, 8.4]) g.add(torus(10.5 + (1.5 * y) / 11 + 0.05, 0.35, hoop, { y, rx: PI / 2 }))
  return g
}

// 浴缸盖：卷帘式卷起 / 折板式叠好
function bathLidRolled(p: string[]) {
  const [main, strap] = p
  const g = new THREE.Group()
  const cy = 9.45
  g.add(cylXLegacy(9, 72, main, 0, cy, 0, 28))
  for (const sx of [-1, 1]) {
    g.add(cylXLegacy(7.6, 0.6, shade(main, -0.1), sx * 36.1, cy, 0, 24))
    g.add(cylXLegacy(4.4, 0.6, shade(main, -0.18), sx * 36.3, cy, 0, 20))
    g.add(torus(9, 0.45, strap, { x: sx * 24, y: cy, ry: PI / 2 }))
  }
  return g
}
function bathLidFolded(p: string[]) {
  const [main, strap] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) g.add(rbox(72, 1.6, 46, i === 1 ? shade(main, -0.05) : main, { y: i * 1.7 }, 0.6))
  for (const sx of [-1, 1]) g.add(rbox(10, 0.4, 2.4, strap, { x: sx * 22, y: 4.95, z: 18 }, 0.15))
  return g
}

// 浴室玩具：小船 / 鲸鱼 / 叠叠杯
function toyBoat(p: string[]) {
  const [hull, cabin, acc] = p
  const poly: Poly = [
    [-7, -3.6],
    [3, -3.6],
    [7.2, 0],
    [3, 3.6],
    [-7, 3.6],
  ]
  return G(
    slab(poly, 3.4, hull),
    rbox(13, 0.6, 7.6, shade(hull, -0.15), { x: -0.3, y: 1.2 }, 0.2),
    rbox(5, 3, 4.6, cabin, { x: -2, y: 3.4 }, 0.8),
    rbox(5.4, 0.6, 5, acc, { x: -2, y: 6.3 }, 0.25),
    cyl(0.9, 0.9, 2.6, acc, { x: -3, y: 6.8 }, 12),
  )
}
function toyWhale(p: string[]) {
  const [body, belly] = p
  const g = new THREE.Group()
  g.add(ball(5, body, { y: 4.3 }, [1.3, 0.85, 0.9]))
  g.add(ball(4.4, belly, { x: 0.8, y: 3.4 }, [1.25, 0.62, 0.86]))
  g.add(ball(2, body, { x: -6.6, y: 5.6 }, [1.2, 0.6, 0.8]))
  for (const sz of [-1, 1]) {
    const t = ball(2.2, body, { x: -8.4, y: 7.2, z: sz * 1.6, rx: sz * 0.5 }, [0.9, 0.35, 1.2])
    g.add(t)
    const fin = ball(1.8, body, { x: 1.6, y: 2.4, z: sz * 3.8, ry: sz * 0.4 }, [1.2, 0.3, 0.8])
    g.add(fin)
    const e = ball(0.45, '#3a2a2a', { x: 3.6, y: 5.0, z: sz * 3.55 })
    e.userData.noOutline = true
    g.add(e)
  }
  g.add(cyl(0.5, 0.7, 0.8, shade(body, -0.15), { x: 1, y: 7.8 }, 10))
  return ground(g)
}
function toyCups(p: string[]) {
  const g = new THREE.Group()
  const specs: [number, number, number, number][] = [
    [4.6, 3.8, 5, 5],
    [3.6, 3.0, 4.5, 9.5],
    [2.8, 2.3, 4, 13.5],
  ]
  specs.forEach(([rt, rb, h, top], i) => g.add(cup(rt, rb, h, 0.35, p[i], { y: top, rx: PI })))
  return g
}

// 入浴剂罐：半透明罐 + 浴盐 + 木勺 + 木盖
function bathSaltJar(p: string[]) {
  const [salt, lid, twine] = p
  const g = new THREE.Group()
  g.add(clearDeep(cup(5, 5, 12, 0.4, GLASS), GLASS, 0.35))
  g.add(cyl(4.5, 4.55, 7, salt, { y: 0.4 }, 24))
  g.add(puck(1.5, 0.8, J.hinoki, { x: 0.6, y: 7.3 }))
  g.add(rod3([1.4, 7.8, 0], [3.2, 11, 0.4], 0.3, J.hinoki, 8))
  g.add(puck(5.5, 1.6, lid, { y: 11.6 }))
  g.add(torus(5.1, 0.25, twine, { y: 10.4, rx: PI / 2 }))
  return g
}

// 浴室转角架（壁挂三角）：直角贴左后墙角
const CORNER_MOUNT = 100
const CORNER_GAP = 25
const TRI = (inset = 0): Poly => [
  [-12 + inset, -12 + inset],
  [12 - inset * 2.4, -12 + inset],
  [-12 + inset, 12 - inset * 2.4],
]
function cornerShelf(n: number): Build {
  return (p) => {
    const [main, acc] = p
    const g = new THREE.Group()
    const m = CORNER_MOUNT
    for (let i = 0; i < n; i++) {
      const y = m + i * CORNER_GAP
      g.add(slab(TRI(), 1.2, main, y))
      // 斜边挡杆 + 两根小立杆
      g.add(rod3([10.2, y + 2.8, -11], [-11, y + 2.8, 10.2], 0.35, main, 8))
      for (const [x, z] of [
        [9.6, -10.4],
        [-10.4, 9.6],
        [-0.4, -0.4],
      ])
        g.add(cyl(0.3, 0.3, 2.8, main, { x, y: y + 0.6, z }, 6))
    }
    // 墙角立杆 + 两块吸盘座
    const top = m + (n - 1) * CORNER_GAP + 6
    g.add(cyl(0.9, 0.9, top - m + 3, acc, { x: -10.6, y: m - 3, z: -10.6 }, 10))
    for (const y of [m - 3, top - 1]) g.add(ball(1.4, acc, { x: -10.6, y, z: -10.6 }))
    return g
  }
}
const cornerH = (n: number) => (n - 1) * CORNER_GAP + 10.8

// 不锈钢挂篮（壁挂）
const WB = { mount: 110, w: 30, d: 12, h: 11 }
function wireBasket(p: string[]) {
  const [main] = p
  const g = new THREE.Group()
  const { mount: m, w, d, h } = WB
  const r = 0.3
  const x0 = w / 2 - r
  const z0 = -d / 2 + r
  const z1 = d / 2 - r
  const yb = m + r
  const yt = m + h - 3.5
  // 底：沿 x 的密排钢丝 + 外框
  for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 6) g.add(cylXLegacy(r, w - 0.6, main, 0, yb, z, 6))
  for (const sx of [-1, 1]) g.add(cylZLegacy(r, d - 0.6, main, sx * x0, yb, 0, 6))
  // 上沿框
  for (const z of [z0, z1]) g.add(cylXLegacy(r * 1.3, w - 0.6, main, 0, yt, z, 6))
  for (const sx of [-1, 1]) g.add(cylZLegacy(r * 1.3, d - 0.6, main, sx * x0, yt, 0, 6))
  // 竖丝：前、后、两侧
  for (let i = 0; i <= 10; i++) {
    const x = -x0 + (i * x0 * 2) / 10
    for (const z of [z0, z1]) g.add(cyl(r, r, yt - yb, main, { x, y: yb, z }, 6))
  }
  for (const sx of [-1, 1]) for (const z of [-2, 2]) g.add(cyl(r, r, yt - yb, main, { x: sx * x0, y: yb, z }, 6))
  // 背后两个挂钩
  for (const sx of [-1, 1]) {
    g.add(rbox(1.6, 4.2, 0.5, main, { x: sx * 9, y: yt - 0.5, z: -d / 2 + 0.25 }, 0.2))
    g.add(rbox(1.6, 0.5, 1.4, main, { x: sx * 9, y: m + h - 0.5, z: -d / 2 + 0.7 }, 0.2))
  }
  return g
}

// 浴缸架板：两端压在浴缸边上，横跨浴缸
function bathCaddy(p: string[]) {
  const [main, pad] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    g.add(rbox(5, 1.2, 22, main, { x: sx * 33.5 }, 0.4))
    for (const sz of [-1, 1]) g.add(puck(1.2, 0.4, pad, { x: sx * 33.5, y: 0, z: sz * 8 }))
  }
  for (let i = 0; i < 5; i++) g.add(rbox(72, 1.6, 3.6, main, { y: 1.2, z: -8.8 + i * 4.4 }, 0.5))
  return g
}

// =====================================================================
// 洗面所・脱衣所
// =====================================================================

// 洗面所窄高柜：下柜门 / 抽屉 / 开放格（中间一块层板）/ 上柜门
const tallCab = (w: number): WetCabSpec => ({
  w,
  d: 30,
  plinth: 6,
  secs: [
    { kind: 'door', h: 60, doors: w > 40 ? 2 : 1 },
    { kind: 'drawer', h: 14 },
    { kind: 'open', h: 46, shelves: 1 },
    { kind: 'door', h: 38, doors: w > 40 ? 2 : 1 },
  ],
})
// 洗面所吊柜
const WASH_CAB: WetCabSpec = { w: 60, d: 22, plinth: 0, secs: [{ kind: 'open', h: 14 }, { kind: 'door', h: 34, doors: 2 }] }
const WASH_CAB_MOUNT = 165

// 镜柜：中间两扇镜门，两侧开放小格，底下一条开放托架；挂在洗面台上方 110–180
const MC = { mount: 110, w: 60, d: 14, h: 70 }
function mirrorCabinet(p: string[]) {
  const [body, , acc] = p
  const g = new THREE.Group()
  const { mount: m, w, d, h } = MC
  const front = d / 2 - 1.5
  const dc = front + d / 2
  const zc = (front - d / 2) / 2
  const bd = dc - 0.6
  const bz = zc + 0.3
  for (const sx of [-1, 1]) g.add(rbox(1.2, h, dc, body, { x: sx * (w / 2 - 0.6), y: m, z: zc }, 0.3))
  g.add(rbox(w - 2.4, h - 1.5, 0.6, shade(body, -0.06), { y: m, z: -d / 2 + 0.3 }, 0.2))
  g.add(rbox(w - 2.4, 1.5, bd, body, { y: m, z: bz }, 0.3))
  g.add(rbox(w - 2.4, 1.5, bd, body, { y: m + 11, z: bz }, 0.3))
  g.add(rbox(w, 1.5, dc, body, { y: m + h - 1.5, z: zc }, 0.4))
  for (const sx of [-1, 1]) {
    g.add(rbox(1, h - 14, bd, body, { x: sx * 18.5, y: m + 12.5, z: bz }, 0.2))
    for (const y of [31, 50]) g.add(rbox(9.8, 1, bd, body, { x: sx * 23.9, y: m + y, z: bz }, 0.2))
  }
  // 镜门后面：两块层板
  for (const y of [31, 50]) g.add(rbox(36, 1, bd, shade(body, 0.04), { y: m + y, z: bz }, 0.2))
  // 镜门：铰链在外侧，往两边打开
  for (const sx of [-1, 1]) {
    const x = sx * 9.35
    const hinge = sx * 18.5
    const leaf = new THREE.Group()
    leaf.add(rbox(18.3, 55.4, 1.2, body, { x: x - hinge, y: 0, z: 0 }, 0.4))
    const mir = rbox(16.7, 53.8, 0.5, MIRROR, { x: x - hinge, y: 0.8, z: 0.65 }, 0.15)
    mir.material = toon(MIRROR, { emissive: 0.18 })
    markMirror(mir)
    leaf.add(mir)
    leaf.add(rbox(0.5, 6, 0.3, acc, { x: sx * 0.6 - hinge, y: 1.7, z: 0.75 }, 0.1))
    leaf.position.set(hinge, m + 12.8, front + 0.6)
    g.add(movable(leaf, { kind: 'swing', angle: sx * SWING_OPEN }))
  }
  return g
}
const MC_COL = (inset = 0.4) => [rectPoly(-28.8 + inset, -6.4, -19 - inset, 4.8), rectPoly(19 + inset, -6.4, 28.8 - inset, 4.8)]

// 落地浴巾架：两侧 U 形框，上层两根横杆、下层一根
const TS = { w: 60, d: 30, h: 84, barR: 1.1 }
const TS_BARS: [number, number][] = [
  [82, -8],
  [82, 8],
  [45, 0],
]
function towelStand(p: string[]) {
  const [main, acc] = p
  const g = new THREE.Group()
  const { w, d } = TS
  const px = w / 2 - 1.8
  for (const sx of [-1, 1]) {
    const x = sx * px
    for (const sz of [-1, 1]) g.add(cyl(1.3, 1.3, 81, main, { x, y: 1.5, z: sz * 11 }, 12))
    g.add(cylZLegacy(1.5, 25, main, x, 82, 0))
    for (const sz of [-1, 1]) g.add(ball(1.5, main, { x, y: 82, z: sz * 12.5 }))
    g.add(rbox(3.6, 1.5, d, acc, { x }, 0.6))
    g.add(cylZLegacy(1.0, 22, main, x, 45, 0))
  }
  for (const [y, z] of TS_BARS) g.add(cylXLegacy(TS.barR, px * 2, main, 0, y, z))
  return g
}

// 壁挂浴巾架（酒店式）：上面一块置物板，下面一根挂杆
const TW = { mount: 150, w: 60, d: 24, barY: 3, barZ: 9, barR: 1.0 }
function towelShelf(p: string[]) {
  const [board, metal] = p
  const { mount: m, w, d } = TW
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 4)
    g.add(rbox(2, 22, 1, metal, { x, y: m, z: -d / 2 + 0.5 }, 0.3))
    g.add(rbox(2, 1.4, d - 1, metal, { x, y: m + 18.6, z: 0.5 }, 0.3))
    g.add(rod3([x, m + 3.4, -d / 2 + 1], [x, m + 18.6, d / 2 - 6], 0.5, metal, 8))
    g.add(rod3([x, m + 1, -d / 2 + 1], [x, m + TW.barY, TW.barZ], 0.5, metal, 8))
  }
  g.add(cylXLegacy(TW.barR, w - 6, metal, 0, m + TW.barY, TW.barZ))
  g.add(rbox(w, 1.8, d, board, { y: m + 20 }, 0.5))
  return g
}

// 浴巾：叠好 / 挂起
function bathTowelFolded(p: string[]) {
  const [main, border] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) g.add(rbox(36, 2.6, 26, i === 1 ? shade(main, -0.04) : main, { y: i * 2.6 }, 1.2))
  g.add(rbox(36.7, 0.9, 26.7, border, { y: 3.3 }, 0.4))
  return g
}
function bathTowelHanging(p: string[]) {
  const [main, border, loop] = p
  const g = G(sHook())
  g.add(torus(1, 0.25, loop, { y: LOOP_Y, z: ITEM_Z }))
  const top = ITEM_TOP + 0.2
  g.add(rbox(40, 86, 1.6, main, { y: top - 86, z: ITEM_Z }, 0.7))
  for (const y of [top - 80, top - 9]) g.add(rbox(40.4, 2.4, 2.2, border, { y, z: ITEM_Z }, 0.4))
  return g
}

// 浴室门口地垫：布艺（带条纹）/ 硅藻土
function bathMatCloth(p: string[]) {
  const [main, stripe] = p
  const g = G(slab(roundRectPoly(60, 40, 6), 1.2, main))
  for (const x of [-18, 0, 18]) g.add(rbox(4, 0.6, 32, stripe, { x, y: 0.9 }, 0.25))
  return g
}
function bathMatStone(p: string[]) {
  const [main, , acc] = p
  return G(rbox(60, 0.9, 39, main, {}, 0.4), rbox(8, 0.4, 2, acc, { x: 24, y: 0.75, z: 16 }, 0.1))
}

// 体重秤
function bodyScale(p: string[]) {
  const [main, pad] = p
  const g = G(rbox(30, 2.2, 30, main, {}, 1.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 0.4, 8, pad, { x: sx * 7.5, y: 2.0, z: sz * 5 + 2 }, 0.15))
  const disp = rbox(8, 0.4, 3, '#bfe3ff', { y: 2.0, z: -10.5 }, 0.15)
  disp.material = toon('#bfe3ff', { emissive: 0.4 })
  g.add(disp)
  return g
}

// 吹风机挂架（壁挂）：背板 + 托臂 + 环形托架，下面一个绕线小钩
const DH = { mount: 140, w: 9.8, d: 11.2, h: 12 }
function dryerHolder(p: string[]) {
  const [main, acc] = p
  const { mount: m, d } = DH
  const back = -d / 2
  const g = new THREE.Group()
  g.add(rbox(7, 12, 0.8, main, { y: m, z: back + 0.4 }, 0.3))
  g.add(rbox(2.4, 1.4, 1.8, main, { y: m + 8.4, z: back + 1.6 }, 0.3))
  g.add(torus(4.3, 0.6, main, { y: m + 9.1, z: back + 0.8 + 1.2 + 4.3, rx: PI / 2 }))
  // 绕线钩
  g.add(rbox(1.2, 1.2, 2.2, acc, { y: m + 1.5, z: back + 1.9 }, 0.3))
  g.add(rbox(1.2, 2, 0.8, acc, { y: m + 1.5, z: back + 3.4 }, 0.3))
  return g
}

// =====================================================================
// 洗衣
// =====================================================================

// 洗衣液 / 柔软剂 / 漂白剂
function detergent(p: string[]) {
  const [main, label, cap] = p
  return G(
    holePanel(14, 26, 9, main, [{ kind: 'rect', x: 3.6, y: 18.5, w: 3.2, h: 5, r: 1.4 }], {}, 3.5),
    cyl(2.2, 2.2, 3, cap, { x: -3, y: 25.3 }, 16),
    rbox(10, 10, 0.4, label, { x: -1, y: 5, z: 4.6 }, 0.2),
    rbox(10, 1.4, 0.3, cap, { x: -1, y: 12.4, z: 4.85 }, 0.1),
  )
}
function softener(p: string[]) {
  const [main, label, cap] = p
  return G(
    rbox(11, 22, 7.5, main, {}, 3.4),
    cyl(1.8, 3, 1.4, main, { y: 21.6 }, 16),
    cyl(2.4, 2.4, 3.2, cap, { y: 22.8 }, 16),
    rbox(8, 9, 0.4, label, { y: 5, z: 3.85 }, 0.2),
  )
}
function bleach(p: string[]) {
  const [main, label, cap] = p
  return G(
    holePanel(12, 27, 8, main, [{ kind: 'rect', x: 3.2, y: 19, w: 2.8, h: 5, r: 1.2 }], {}, 3),
    cyl(1.9, 1.9, 2.6, cap, { x: -2.6, y: 26.5 }, 16),
    rbox(8.4, 11, 0.4, label, { x: -0.8, y: 4, z: 4.1 }, 0.2),
  )
}
const LAUNDRY_BOTTLE_PALS: Record<'detergent' | 'softener' | 'bleach', Pal[]> = {
  detergent: [
    ['modern', [M.white, M.char, '#4a8fd9']],
    ['cute', [C.sky, C.white, C.lemon]],
    ['nordic', [N.white, N.blue, N.sage]],
    ['retro', [R.teal, R.cream, R.orange]],
  ],
  softener: [
    ['cute', [C.pink, C.white, C.sakura]],
    ['nordic', [N.sage, N.white, N.oak]],
    ['modern', [M.light, M.char, M.silver]],
    ['cute', [C.lilac, C.white, C.lemon]],
  ],
  bleach: [
    ['modern', [M.white, '#4a8fd9', '#4a8fd9']],
    ['cute', [C.white, C.mint, C.pink]],
    ['retro', [R.cream, R.red, R.red]],
    ['nordic', [N.white, N.gray, N.blue]],
  ],
}

// 洗衣粉盒：提手 + 正面标签
function powderBox(p: string[]) {
  const [main, label, handle] = p
  return G(
    rbox(20, 17, 12, main, {}, 1.2),
    torus(5, 0.5, handle, { y: 17 }, PI),
    rbox(16, 10, 0.4, label, { y: 3, z: 6.1 }, 0.2),
    rbox(8, 1, 0.3, handle, { y: 14, z: 6.15 }, 0.1),
  )
}

// 洗衣凝珠罐：半透明罐 + 凝珠 + 儿童锁盖
function podJar(p: string[]) {
  const [podA, podB, lid] = p
  const g = new THREE.Group()
  g.add(clearDeep(cup(6.5, 6.5, 14, 0.4, GLASS), GLASS, 0.35))
  const rand = rng(31)
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + layer * 0.45
      const rr = i === 0 ? 0 : 3.6
      const x = i === 0 ? 0 : Math.cos(a) * rr
      const z = i === 0 ? 0 : Math.sin(a) * rr
      g.add(ball(1.4, rand() > 0.5 ? podA : podB, { x, y: 1.4 + layer * 2.6, z, ry: rand() * PI }, [1.25, 0.8, 1.1]))
    }
  g.add(puck(6.9, 2.2, lid, { y: 13.6 }))
  g.add(rbox(4, 0.8, 1.4, shade(lid, -0.15), { y: 14.6, z: 5.6 }, 0.3))
  return g
}

// 洗衣网（一大一小，平叠）
function laundryNet(p: string[]) {
  const [mesh, trim, zip] = p
  const g = new THREE.Group()
  g.add(rbox(30, 1.2, 24, mesh, {}, 0.5))
  g.add(rbox(30.6, 1.4, 1, trim, { z: 11.7 }, 0.4))
  g.add(rbox(2, 0.6, 3, zip, { x: 12, y: 1.2, z: 11 }, 0.2))
  g.add(puck(8, 2.2, shade(mesh, -0.04), { x: -4, y: 1.15, z: -1 }))
  g.add(torus(7.9, 0.35, trim, { x: -4, y: 2.25, z: -1, rx: PI / 2 }))
  return g
}

// 晾衣夹篮（满满一篮夹子）
function pegBasket(p: string[]) {
  const [main, pegA, pegB] = p
  const g = new THREE.Group()
  g.add(cup(6.5, 5.5, 9, 0.4, main))
  g.add(torus(6.2, 0.35, main, { y: 9 }, PI))
  const rand = rng(7)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2
    const rr = i % 3 === 0 ? 1.2 : 3.6
    g.add(rbox(0.9, 6.2, 1.5, i % 2 ? pegA : pegB, { x: Math.cos(a) * rr, y: 0.6, z: Math.sin(a) * rr, ry: rand() * PI, rz: (rand() - 0.5) * 0.3 }, 0.3))
  }
  return g
}

// 衣物除菌喷雾（扳机喷头）
function fabricSpray(p: string[]) {
  const [main, head, label] = p
  return ground(G(
    cyl(3.3, 3.5, 15, main, {}, 20),
    cyl(1.5, 3.3, 2, main, { y: 15 }, 20),
    cyl(1.4, 1.4, 1.4, head, { y: 16.9 }, 14),
    rbox(3.2, 4.4, 6.4, head, { y: 18.2, z: 1.4 }, 0.8),
    cylZLegacy(0.75, 1.4, shade(head, -0.15), 0, 21.2, 5.2),
    rbox(1.4, 3.5, 1, head, { y: 14.8, z: 4 }, 0.4),
    rbox(4.6, 6, 0.4, label, { y: 4, z: 3.35 }, 0.2),
  ))
}

// 脏衣篓：带把手开口的高篓，带盖 / 开着（里面堆着衣服）
const HP = { w: 36, d: 32, h: 55 }
function hamperBody(p: string[]) {
  const [main, rim] = p
  const handle: Hole[] = [{ kind: 'rect', x: 0, y: 46, w: 10, h: 3.4, r: 1.6 }]
  const g = G(shell(HP.w, HP.h, HP.d, 1.2, main, { top: false, left: handle, right: handle }))
  g.add(bandRing(HP.w, HP.d, HP.h - 2.6, 2.6, 0.6, rim))
  g.add(bandRing(HP.w, HP.d, 0, 2, 0.6, rim))
  return g
}
function hamperClosed(p: string[]) {
  const [, rim] = p
  const g = hamperBody(p)
  g.add(rbox(HP.w + 1.8, 2.4, HP.d + 1.8, rim, { y: HP.h - 0.4 }, 1))
  g.add(rbox(8, 1.4, 2.4, shade(rim, -0.15), { y: HP.h + 1.8 }, 0.5))
  return g
}
function hamperOpen(p: string[]) {
  const [, , acc] = p
  const g = hamperBody(p)
  const cloth = [acc, N.white, C.sky, M.light]
  const spots: [number, number, number][] = [
    [-7, 44, -5],
    [6, 45, 4],
    [-4, 48, 6],
    [8, 47.5, -6],
  ]
  spots.forEach(([x, y, z], i) => g.add(ball(8, cloth[i], { x, y, z, ry: i }, [1.0, 0.45, 0.85])))
  return g
}

// 熨斗（平放）
const IRON_POLY: Poly = [
  [-6, -12],
  [6, -12],
  [6, 1],
  [3.6, 8],
  [0, 13],
  [-3.6, 8],
  [-6, 1],
]
function ironModel(p: string[]) {
  const [main, handle] = p
  const g = new THREE.Group()
  g.add(slab(IRON_POLY, 1.4, STEEL))
  const top: Poly = IRON_POLY.map(([x, z]) => [x * 0.9, z * 0.9 - 0.6])
  g.add(slab(top, 5, main, 1.3))
  g.add(rbox(2.6, 2, 15, handle, { y: 10.6, z: -2 }, 0.9))
  g.add(rod3([0, 6, 4.5], [0, 11.2, 4.6], 1.1, handle, 8))
  g.add(rod3([0, 6, -9], [0, 11.2, -8.8], 1.1, handle, 8))
  g.add(cyl(1.6, 1.6, 0.8, shade(main, -0.2), { y: 6.1, z: 2 }, 16))
  g.add(cylZLegacy(0.6, 3, '#555555', 0, 3.5, -13.2))
  return ground(g)
}

// 熨衣板：展开 / 折叠立放
function boardPoly(inset = 0): Poly {
  const hw = 17 - inset
  const pts: Poly = [
    [-55 + inset, -hw],
    [20, -hw],
  ]
  for (let i = 1; i < 10; i++) {
    const a = -PI / 2 + (i / 10) * PI
    pts.push([20 + Math.cos(a) * (35 - inset), Math.sin(a) * hw])
  }
  pts.push([20, hw], [-55 + inset, hw])
  return pts
}
const IB_Y = 84
function ironingBoardOpen(p: string[]) {
  const [cover, frame] = p
  const g = new THREE.Group()
  g.add(slab(boardPoly(), 2, cover, IB_Y))
  g.add(rbox(70, 1, 20, frame, { x: -5, y: IB_Y - 1 }, 0.3))
  for (const sz of [-1, 1]) {
    g.add(rod(-38, 1, 30, IB_Y - 0.5, 0.9, frame, sz * 12))
    g.add(rod(38, 1, -30, IB_Y - 0.5, 0.9, frame, sz * 9.5))
  }
  g.add(cylZLegacy(1, 26, frame, -38, 1, 0))
  g.add(cylZLegacy(1, 21, frame, 38, 1, 0))
  for (const sz of [-1, 1]) {
    g.add(ball(1.2, '#4a4a4a', { x: -38, y: 1.2, z: sz * 13 }))
    g.add(ball(1.2, '#4a4a4a', { x: 38, y: 1.2, z: sz * 10.5 }))
  }
  return g
}
function ironingBoardFolded(p: string[]) {
  const [cover, frame] = p
  const flat = new THREE.Group()
  flat.add(slab(boardPoly(), 2, cover, 2.4))
  flat.add(rbox(70, 1, 20, frame, { x: -5, y: 1.4 }, 0.3))
  for (const z of [-12, -9.5, 9.5, 12]) flat.add(cylXLegacy(0.9, 76, frame, -4, 1.0, z))
  flat.add(cylZLegacy(1, 26, frame, -42, 1.0, 0))
  flat.add(cylZLegacy(1, 21, frame, 34, 1.0, 0))
  flat.rotation.z = PI / 2
  const outer = G(flat)
  outer.rotation.y = PI / 2
  return ground(G(outer))
}

// 半透明收纳箱：S / L，合上 / 打开（盖子立在后面）
interface CaseSpec {
  w: number
  d: number
  h: number
  r: number
  /** [x, 层, z] */
  rolls: [number, number, number][]
}
const CASES: Record<'S' | 'L', CaseSpec> = {
  S: {
    w: 26,
    d: 37,
    h: 17,
    r: 3.6,
    rolls: [
      [-7.4, 0, 0],
      [0, 0, 0],
      [7.4, 0, 0],
    ],
  },
  L: {
    w: 37,
    d: 45,
    h: 24,
    r: 4.3,
    rolls: [
      [-13.5, 0, 0],
      [-4.5, 0, 0],
      [4.5, 0, 0],
      [13.5, 0, 0],
      [-9, 1, 0],
      [0, 1, 0],
      [9, 1, 0],
    ],
  },
}
function clearCase(c: CaseSpec, open: boolean): Build {
  return (p) => {
    const [lid, towelA, towelB] = p
    const g = new THREE.Group()
    g.add(clearDeep(tray(c.w, c.h, c.d, 0.6, '#eef6fa', {}, 0.3), '#eef6fa'))
    c.rolls.forEach(([x, layer, z], i) => {
      const len = c.d - 6
      const cy = 0.6 + c.r + 0.05 + layer * Math.sqrt(4 * c.r * c.r - 4.5 * 4.5)
      const col = i % 2 ? towelB : towelA
      g.add(cylZLegacy(c.r, len, col, x, cy, z, 18))
      g.add(cylZLegacy(c.r * 0.35, len + 0.4, shade(col, -0.12), x, cy, z, 10))
    })
    if (!open) {
      g.add(rbox(c.w + 0.8, 1.6, c.d + 0.8, lid, { y: c.h - 0.2 }, 0.6))
      g.add(rbox(c.w * 0.4, 0.5, 1.2, shade(lid, -0.12), { y: c.h + 1.35, z: c.d / 2 - 2 }, 0.2))
    } else {
      g.add(rbox(c.w + 0.8, c.d + 0.8, 1.6, lid, { y: c.h, z: -c.d / 2 - 0.9 }, 0.6))
    }
    return ground(g)
  }
}
const CASE_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.gray]],
  ['cute', [C.sakura, C.white, C.sky]],
  ['nordic', [N.gray, N.white, N.sage]],
  ['japanese', [J.washi, J.ai, J.washi]],
]

// 抽屉式收纳盒（三抽，顶面可以摆东西）
const DC = { w: 28, d: 38, h: 32 }
/** 抽屉盒：宽、深（面板背后往里）、拉出距离 */
const DC_BOX = { w: 25, d: 34.5, pull: 21 }
/** 三格抽屉的可摆放层（关着时的位置，打开随抽屉拉出） */
const DC_LEVELS: SurfaceDef[] = [0, 1, 2].map((i) => ({
  y: 1.2 + i * 10 + 1,
  h: 7.2,
  inside: true,
  slide: DC_BOX.pull,
  shape: [rectPoly(-DC_BOX.w / 2 + 0.8, DC.d / 2 - 1.3 - 0.5 - DC_BOX.d + 0.8, DC_BOX.w / 2 - 0.8, DC.d / 2 - 1.3 - 0.7)],
}))
function drawerChest(p: string[]) {
  const [frame, drawer, handle] = p
  const g = new THREE.Group()
  // 空心外框：两侧、顶、底、背板
  for (const sx of [-1, 1]) g.add(rbox(1, DC.h, DC.d - 1, frame, { x: sx * (DC.w / 2 - 0.5), z: -0.5 }, 0.4))
  g.add(rbox(DC.w - 2, 1, DC.d - 1, frame, { y: DC.h - 1, z: -0.5 }, 0.3))
  g.add(rbox(DC.w - 2, 1.2, DC.d - 1, frame, { z: -0.5 }, 0.3))
  g.add(rbox(DC.w - 2, DC.h - 2.2, 0.8, frame, { y: 1.2, z: -DC.d / 2 + 0.4 }, 0.2))
  const inner = shade(drawer, 0.08)
  for (let i = 0; i < 3; i++) {
    const y = 1.2 + i * 10
    const dg = new THREE.Group()
    dg.add(rbox(DC.w - 2, 9.4, 1, drawer, {}, 0.5))
    dg.add(rbox(8, 1.2, 0.4, handle, { y: 6.8, z: 0.9 }, 0.15))
    dg.add(rbox(DC_BOX.w, 0.8, DC_BOX.d, inner, { y: 0.2, z: -0.5 - DC_BOX.d / 2 }, 0.2))
    for (const sx of [-1, 1]) dg.add(rbox(0.6, 8, DC_BOX.d, inner, { x: sx * (DC_BOX.w / 2 - 0.3), y: 0.2, z: -0.5 - DC_BOX.d / 2 }, 0.2))
    dg.add(rbox(DC_BOX.w - 1.2, 8, 0.6, inner, { y: 0.2, z: -0.5 - DC_BOX.d + 0.3 }, 0.2))
    dg.position.set(0, y, DC.d / 2 - 1.3)
    g.add(movable(dg, { kind: 'drawer', dz: DC_BOX.pull }))
  }
  return g
}

// 洗面所篮子（编织，带两个把手洞）
function washBasket(p: string[]) {
  const [main, band] = p
  const handle: Hole[] = [{ kind: 'rect', x: 0, y: 9.5, w: 8, h: 2.4, r: 1.1 }]
  const g = G(shell(30, 14, 20, 1, main, { top: false, left: handle, right: handle }))
  for (const y of [2.5, 6]) g.add(bandRing(30, 20, y, 0.8, 0.4, band))
  g.add(bandRing(30, 20, 12.6, 1.4, 0.5, band))
  return g
}

// =====================================================================
// 汇总
// =====================================================================

const TOILET: AssetDef[] = [
  ...TOILET_RACKS.map(({ label, s }) =>
    define(`wet-toilet-rack-${s.tops.length}`, '马桶置物架', 'storage', [s.w, s.d, rackH(s)], RACK_PALS, rack(s), {
      sizeLabel: label,
      surface: s.tops[s.tops.length - 1],
      surfaceShape: [rectPoly(-s.w / 2 + 3, -s.d / 2 + 2, s.w / 2 - 3, s.d / 2 - 1)],
      surfaces: rackSurfaces(s),
    }),
  ),
  define('wet-toilet-wall-cabinet', '厕所吊柜', 'storage', [TOILET_CAB.w, TOILET_CAB.d, cabLayout(TOILET_CAB).h], CAB_PALS, cabinet(TOILET_CAB, TOILET_CAB_MOUNT), {
    mount: TOILET_CAB_MOUNT,
    surfaces: cabSurfaces(TOILET_CAB, TOILET_CAB_MOUNT),
    openable: true,
  }),
  ...[60, 75].map((w) =>
    define(`wet-toilet-upper-cab-${w}`, '马桶上方收纳柜', 'storage', [w, 27, cabLayout(TOILET_UPPER(w)).h], CAB_PALS, cabinet(TOILET_UPPER(w), TOILET_UPPER_MOUNT), {
      sizeLabel: `${w}`,
      type: 'cabinet',
      series: 'wet-toilet-upper-cab',
      tags: ['cabinet', 'wet-supply'],
      mount: TOILET_UPPER_MOUNT,
      surfaces: cabSurfaces(TOILET_UPPER(w), TOILET_UPPER_MOUNT),
      openable: true,
    }),
  ),
  define('wet-toilet-slim-cabinet', '厕所角落窄柜', 'storage', [TOILET_SLIM.w, TOILET_SLIM.d, cabLayout(TOILET_SLIM).h], CAB_PALS, cabinet(TOILET_SLIM), {
    surface: cabLayout(TOILET_SLIM).h,
    surfaces: cabSurfaces(TOILET_SLIM),
    openable: true,
  }),
  prop('wet-tp-stack', '卷筒纸', 'toiletry', [11, 11, 33], TP_PALS, tpStack, { sizeLabel: '3 卷叠放' }),
  prop('wet-tp-4pack', '卷筒纸', 'toiletry', [22.9, 22.9, 11.8], TP_PALS, tpPack(2, 2, 1, false), { sizeLabel: '4 卷装' }),
  prop('wet-tp-12pack', '卷筒纸', 'toiletry', [33.9, 22.9, 26.5], TP_PALS, tpPack(3, 2, 2, true), { sizeLabel: '12 卷装' }),
  define('wet-tp-holder', '卷纸架', 'toiletry', [14, 13, 13.4], PLA_PALS.map(([s, c]) => [s, [c[2] === C.sky ? C.white : c[1], PAPER]] as Pal), tpHolder, {
    sizeLabel: '单联',
    mount: TPH_MOUNT,
  }),
  define('wet-tp-holder-double', '卷纸架', 'toiletry', [33, 14, 14.2], [
    ['modern', [M.silver, PAPER, M.white]],
    ['nordic', [N.white, PAPER, N.oak]],
    ['industrial', [I.iron, PAPER, I.walnut]],
    ['japanese', [J.sumi, PAPER, J.hinoki]],
  ], tpHolderDouble, {
    sizeLabel: '双联带置物板',
    mount: TPH_MOUNT,
    surface: TPH_MOUNT + 14.2,
    surfaceShape: [rectPoly(-15.5, -6, 15.5, 6)],
  }),
  prop('wet-toilet-brush', '马桶刷', 'toiletry', [9, 9, 38.8], [
    ['modern', [M.white, M.char, M.gray]],
    ['cute', [C.white, C.pink, C.sakura]],
    ['nordic', [N.white, N.oak, N.gray]],
    ['modern', [M.black, M.black, M.char]],
  ], toiletBrush, { sizeLabel: '标准' }),
  prop('wet-sanitary-bin', '卫生桶', 'toiletry', [13.6, 20.6, 25.1], PLA_PALS, sanitaryBin),
  prop('wet-plunger', '马桶搋子', 'toiletry', [13.8, 13.8, 47.4], PLUNGER_PALS, plunger, { type: 'plunger', tags: ['plunger', 'cleaning', 'wet-supply'] }),
  prop('wet-sanitary-pads', '卫生巾', 'toiletry', [16.3, 8.7, 14.2], PADS_PALS, padsPack, { sizeLabel: '袋装', type: 'sanitary', series: 'wet-sanitary-pads', tags: ['sanitary', 'personal-care', 'wet-supply'] }),
  prop('wet-panty-liners', '护垫', 'toiletry', [12.6, 6.6, 9.3], PADS_PALS, linerBox, { sizeLabel: '盒装', type: 'sanitary', tags: ['sanitary', 'personal-care', 'wet-supply'] }),
  prop('wet-air-freshener', '芳香剂', 'toiletry', [7.8, 7.8, 9.9], [
    ['cute', [C.pink, C.white, C.sakura]],
    ['nordic', [N.sage, N.white, N.oak]],
    ['modern', ['#9fc8e8', M.white, M.silver]],
    ['retro', [R.mustard, R.cream, R.orange]],
  ], airFreshener),
  prop('wet-toilet-mat', '厕所地垫', 'toiletry', [60, 55, 1.5], CLOTH_PALS, toiletMat),
  prop('wet-toilet-slippers', '厕所拖鞋', 'toiletry', [20.8, 25, 6.6], CLOTH_PALS, slippers),
  prop('wet-toilet-cleaner', '马桶清洁剂', 'toiletry', [8, 5.6, 22.2], [
    ['modern', ['#4a8fd9', M.white, M.white]],
    ['cute', [C.mint, C.white, C.pink]],
    ['retro', [R.orange, R.cream, R.cream]],
  ], toiletCleaner),
]

const BATH: AssetDef[] = [
  prop('wet-shampoo', '洗护按压瓶', 'toiletry', [7.8, 8.1, 22.1], bottlePals('shampoo'), bathBottle('shampoo'), { sizeLabel: '洗发水' }),
  prop('wet-conditioner', '洗护按压瓶', 'toiletry', [7.5, 8.1, 22.1], bottlePals('conditioner'), bathBottle('conditioner'), { sizeLabel: '护发素' }),
  prop('wet-body-soap', '洗护按压瓶', 'toiletry', [7.8, 8.1, 22.1], bottlePals('body'), bathBottle('body'), { sizeLabel: '沐浴露' }),
  prop('wet-bottle-set', '洗护三瓶套装', 'toiletry', [27, 10, 22.7], BOTTLE_BASE.map(([s, b, pump]): Pal => [s, [b, pump, shade(b, -0.08)]]), bottleSet),
  prop('wet-refill-pouch', '补充装', 'toiletry', [12.2, 5, 21.8], PLA_PALS, refillPouch),
  prop('wet-face-wash', '洁面乳', 'toiletry', [4.4, 3.8, 13.8], [
    ['cute', [C.white, C.pink, C.sky]],
    ['nordic', [N.white, N.oak, N.sage]],
    ['modern', [M.char, M.black, M.silver]],
    ['japanese', [J.washi, J.sumi, J.shu]],
  ], faceWash),
  prop('wet-razor', '剃刀', 'toiletry', [4.2, 12.6, 1.4], [
    ['modern', [M.char, M.silver]],
    ['cute', [C.pink, C.white]],
    ['nordic', [N.oak, N.white]],
    ['retro', [R.teal, R.cream]],
  ], razor),
  prop('wet-bath-pouf', '浴球', 'toiletry', [12, 12, 14.4], [
    ['cute', [C.pink, C.white]],
    ['cute', [C.sky, C.white]],
    ['nordic', [N.sage, N.white]],
    ['modern', [M.light, M.char]],
  ], bathPouf),
  prop('wet-bath-sponge', '洗澡海绵', 'toiletry', [11, 7, 4.4], [
    ['cute', [C.lemon, C.mint]],
    ['cute', [C.pink, C.white]],
    ['nordic', [N.oakL, N.sage]],
    ['modern', [M.light, M.char]],
  ], bathSponge),
  ...[25, 35].map((h) =>
    define(`wet-bath-stool-${h}`, '浴凳', 'toiletry', [32, 25, h], HINOKI_PALS, bathStool(h), {
      sizeLabel: h === 25 ? '低 25' : '高 35',
      surface: h,
      surfaceShape: [rectPoly(-15, -11.5, -3, 11.5), rectPoly(3, -11.5, 15, 11.5)],
    }),
  ),
  prop('wet-bath-pail', '洗面桶', 'toiletry', [24, 24, 11], HINOKI_PALS, bathPail, { sizeLabel: '标准' }),
  prop('wet-bath-lid-rolled', '浴缸盖', 'toiletry', [73.2, 18.9, 18.9], [
    ['modern', [M.white, M.gray]],
    ['cute', [C.sky, C.white]],
    ['nordic', [N.white, N.oak]],
    ['japanese', [J.hinoki, J.dark]],
  ], bathLidRolled, { form: 'lying' }),
  prop('wet-bath-lid-folded', '浴缸盖', 'toiletry', [72, 46, 5.4], [
    ['modern', [M.white, M.gray]],
    ['cute', [C.sky, C.white]],
    ['nordic', [N.white, N.oak]],
    ['japanese', [J.hinoki, J.dark]],
  ], bathLidFolded, { form: 'folded' }),
  prop('wet-toy-boat', '洗澡玩具小船', 'kids', [14.2, 7.6, 9.4], [
    ['cute', [C.red, C.white, C.sky]],
    ['cute', [C.sky, C.lemon, C.pink]],
    ['retro', [R.teal, R.cream, R.orange]],
  ], toyBoat),
  prop('wet-toy-whale', '洗澡玩具鲸鱼', 'kids', [16.9, 10.7, 8.6], [
    ['cute', [C.sky, C.white]],
    ['cute', [C.pink, C.white]],
    ['cute', [C.mint, C.lemon]],
  ], toyWhale),
  prop('wet-toy-cups', '洗澡叠叠杯', 'kids', [9.2, 9.2, 13.5], [
    ['cute', [C.pink, C.lemon, C.sky]],
    ['cute', [C.mint, C.lilac, C.peach]],
    ['retro', [R.orange, R.mustard, R.teal]],
  ], toyCups),
  prop('wet-bath-salt', '入浴剂罐', 'toiletry', [11, 11, 13.2], [
    ['cute', [C.sakura, C.woodL, C.pink]],
    ['nordic', [N.sage, N.oak, N.white]],
    ['japanese', ['#c9b6e4', J.wood, J.shu]],
    ['modern', [M.white, M.char, M.gray]],
  ], bathSaltJar),
  ...[2, 3].map((n) =>
    define(`wet-bath-corner-shelf-${n}`, '浴室转角架', 'storage', [24, 24, cornerH(n)], WIRE_PALS, cornerShelf(n), {
      sizeLabel: `三角钢丝 ${n} 层`,
      mount: CORNER_MOUNT - 4.4,
      surface: CORNER_MOUNT + (n - 1) * CORNER_GAP + 1.2,
      surfaceShape: [TRI(1.5)],
      surfaces: Array.from({ length: n - 1 }, (_, i) => ({ y: CORNER_MOUNT + i * CORNER_GAP + 1.2, shape: [TRI(1.5)] })),
    }),
  ),
  define('wet-wire-basket', '不锈钢挂篮', 'storage', [WB.w, WB.d, WB.h], WIRE_PALS, wireBasket, {
    mount: WB.mount,
    surfaces: [{ y: WB.mount + 0.6, shape: [rectPoly(-WB.w / 2 + 1, -WB.d / 2 + 1, WB.w / 2 - 1, WB.d / 2 - 1)] }],
  }),
  prop('wet-bath-caddy', '浴缸架板', 'toiletry', [72, 22, 2.8], [
    ['nordic', [N.oak, M.gray]],
    ['japanese', [J.hinoki, J.sumi]],
    ['modern', [M.white, M.gray]],
    ['industrial', [I.walnut, I.iron]],
  ], bathCaddy, { surface: 2.8, surfaceShape: [rectPoly(-35, -10.5, 35, 10.5)] }),
]

const tc30 = tallCab(30)
const tc45 = tallCab(45)

const DRESSING: AssetDef[] = [
  ...LAUNDRY_RACKS.map(({ label, s }) =>
    define(`wet-laundry-rack-${s.w}`, '洗衣机置物架', 'storage', [s.w, s.d, rackH(s)], RACK_PALS, rack(s), {
      sizeLabel: label,
      surface: s.tops[s.tops.length - 1],
      surfaceShape: [rectPoly(-s.w / 2 + 3, -s.d / 2 + 2, s.w / 2 - 3, s.d / 2 - 1)],
      surfaces: rackSurfaces(s),
    }),
  ),
  ...[tc30, tc45].map((s) =>
    define(`wet-washroom-tall-${s.w}`, '洗面所窄高柜', 'storage', [s.w, s.d, cabLayout(s).h], CAB_PALS, cabinet(s), {
      sizeLabel: `${s.w}`,
      surface: cabLayout(s).h,
      surfaces: cabSurfaces(s),
      openable: true,
    }),
  ),
  define('wet-washroom-wall-cabinet', '洗面所吊柜', 'storage', [WASH_CAB.w, WASH_CAB.d, cabLayout(WASH_CAB).h], CAB_PALS, cabinet(WASH_CAB, WASH_CAB_MOUNT), {
    mount: WASH_CAB_MOUNT,
    surfaces: cabSurfaces(WASH_CAB, WASH_CAB_MOUNT),
    openable: true,
  }),
  define('wet-mirror-cabinet', '镜柜', 'storage', [MC.w, MC.d, MC.h], CAB_PALS, mirrorCabinet, {
    mount: MC.mount,
    surfaces: [
      { y: MC.mount + 1.5, shape: [rectPoly(-28.4, -6.4, 28.4, 5.2)] },
      { y: MC.mount + 12.5, shape: MC_COL() },
      { y: MC.mount + 32, shape: MC_COL() },
      { y: MC.mount + 51, shape: MC_COL() },
      // 镜门后面的三层
      { y: MC.mount + 12.5, h: 18.5, inside: true, shape: [rectPoly(-17.6, -6.4, 17.6, 4.8)] },
      { y: MC.mount + 32, h: 18, inside: true, shape: [rectPoly(-17.6, -6.4, 17.6, 4.8)] },
      { y: MC.mount + 51, h: 17.5, inside: true, shape: [rectPoly(-17.6, -6.4, 17.6, 4.8)] },
    ],
    openable: true,
  }),
  define('wet-towel-stand', '落地浴巾架', 'storage', [TS.w, TS.d, 83.5], RACK_PALS.map(([s, c]): Pal => [s, [c[1] === M.silver ? M.silver : c[0], c[1]]]), towelStand, {
    surfaces: TS_BARS.map(([y, z]) => ({ y: y + TS.barR + 0.5, kind: 'hook' as const, shape: [rectPoly(-TS.w / 2 + 5, z - 1.5, TS.w / 2 - 5, z + 1.5)] })),
  }),
  define('wet-towel-shelf', '壁挂浴巾架', 'storage', [TW.w, TW.d, 21.8], RACK_PALS, towelShelf, {
    mount: TW.mount,
    surface: TW.mount + 21.8,
    surfaceShape: [rectPoly(-TW.w / 2 + 1, -TW.d / 2 + 1, TW.w / 2 - 1, TW.d / 2 - 1)],
    surfaces: [{ y: TW.mount + TW.barY + TW.barR + 0.5, kind: 'hook', shape: [rectPoly(-TW.w / 2 + 6, TW.barZ - 1.5, TW.w / 2 - 6, TW.barZ + 1.5)] }],
  }),
  prop('wet-bath-towel-folded', '浴巾', 'toiletry', [36.7, 26.7, 7.8], CLOTH_PALS, bathTowelFolded, { form: 'folded' }),
  prop('wet-bath-towel-hanging', '浴巾', 'toiletry', [40.4, 4.1, 91.8], CLOTH_PALS, bathTowelHanging, { form: 'hanging' }),
  prop('wet-bath-mat', '浴室地垫', 'toiletry', [60, 40, 1.5], CLOTH_PALS, bathMatCloth, { sizeLabel: '布艺' }),
  prop('wet-bath-mat-stone', '浴室地垫', 'toiletry', [60, 39, 1.15], [
    ['modern', [M.light, M.gray, M.char]],
    ['nordic', [N.linen, N.white, N.oak]],
    ['cute', [C.sakura, C.white, C.pink]],
    ['japanese', ['#d8d2c4', J.washi, J.sumi]],
  ], bathMatStone, { sizeLabel: '硅藻土' }),
  prop('wet-body-scale', '体重秤', 'toiletry', [30, 30, 2.4], [
    ['modern', [M.white, M.silver]],
    ['modern', [M.black, M.gray]],
    ['cute', [C.sakura, C.white]],
    ['nordic', [N.oakL, N.white]],
  ], bodyScale, { sizeLabel: '基础款' }),
  define('wet-dryer-holder', '吹风机挂架', 'storage', [DH.w, DH.d, DH.h], [
    ['modern', [M.white, M.gray]],
    ['modern', [M.black, M.gray]],
    ['nordic', [N.white, N.oak]],
    ['cute', [C.pink, C.white]],
  ], dryerHolder, { mount: DH.mount }),
  prop('wet-detergent', '洗衣用品瓶', 'toiletry', [14, 9.6, 28.3], LAUNDRY_BOTTLE_PALS.detergent, detergent, { sizeLabel: '洗衣液' }),
  prop('wet-softener', '洗衣用品瓶', 'toiletry', [11, 7.9, 26], LAUNDRY_BOTTLE_PALS.softener, softener, { sizeLabel: '柔软剂' }),
  prop('wet-bleach', '洗衣用品瓶', 'toiletry', [12, 8.3, 29.1], LAUNDRY_BOTTLE_PALS.bleach, bleach, { sizeLabel: '漂白剂' }),
  prop('wet-powder-box', '洗衣粉', 'toiletry', [20, 12.6, 22.5], [
    ['modern', [M.white, '#4a8fd9', M.char]],
    ['retro', [R.orange, R.cream, R.red]],
    ['cute', [C.sky, C.white, C.pink]],
    ['nordic', [N.white, N.sage, N.gray]],
  ], powderBox),
  prop('wet-pod-jar', '洗衣凝珠罐', 'toiletry', [13.8, 13.8, 15.8], [
    ['cute', [C.sky, C.pink, C.white]],
    ['modern', ['#4a8fd9', M.white, M.char]],
    ['nordic', [N.sage, N.blue, N.white]],
    ['retro', [R.orange, R.teal, R.cream]],
  ], podJar),
  prop('wet-laundry-net', '洗衣网', 'toiletry', [30.6, 24.5, 3.4], [
    ['modern', [M.white, M.char, M.silver]],
    ['cute', [C.white, C.pink, C.sky]],
    ['nordic', [N.white, N.blue, N.oak]],
  ], laundryNet),
  prop('wet-peg-basket', '晾衣夹篮', 'toiletry', [13, 13, 15.5], [
    ['cute', [C.white, C.pink, C.sky]],
    ['nordic', [N.white, N.oak, N.sage]],
    ['modern', [M.char, M.white, M.gray]],
    ['retro', [R.cream, R.orange, R.teal]],
  ], pegBasket),
  prop('wet-fabric-spray', '衣物除菌喷雾', 'toiletry', [7, 9.3, 22.6], [
    ['modern', [M.white, '#4a8fd9', '#4a8fd9']],
    ['cute', [C.white, C.mint, C.pink]],
    ['nordic', [N.white, N.sage, N.oak]],
    ['retro', [R.cream, R.teal, R.orange]],
  ], fabricSpray),
  prop('wet-hamper-closed', '脏衣篓', 'storage', [37.8, 33.8, 58.2], [
    ['nordic', [N.linen, N.oak, N.blue]],
    ['modern', [M.light, M.char, M.white]],
    ['japanese', [J.tatami, J.wood, J.ai]],
    ['cute', [C.white, C.pink, C.sky]],
  ], hamperClosed, { sizeLabel: '标准', form: 'closed' }),
  prop('wet-hamper-open', '脏衣篓', 'storage', [37.2, 33.2, 55], [
    ['nordic', [N.linen, N.oak, N.blue]],
    ['modern', [M.light, M.char, M.white]],
    ['japanese', [J.tatami, J.wood, J.ai]],
    ['cute', [C.white, C.pink, C.sky]],
  ], hamperOpen, { sizeLabel: '标准', form: 'open' }),
  prop('wet-iron', '熨斗', 'appliance', [12, 27.7, 12.6], [
    ['modern', [M.white, M.char]],
    ['cute', [C.sky, C.white]],
    ['retro', [R.teal, R.cream]],
    ['modern', [M.char, M.silver]],
  ], ironModel),
  define('wet-ironing-board-open', '熨衣板', 'storage', [110, 34, 86], [
    ['nordic', [N.linen, N.white]],
    ['modern', [M.light, M.char]],
    ['cute', [C.sakura, C.white]],
    ['retro', [R.mustard, R.cream]],
  ], ironingBoardOpen, { form: 'open', surface: IB_Y + 2, surfaceShape: [boardPoly(2)] }),
  define('wet-ironing-board-folded', '熨衣板', 'storage', [34, 4.4, 110], [
    ['nordic', [N.linen, N.white]],
    ['modern', [M.light, M.char]],
    ['cute', [C.sakura, C.white]],
    ['retro', [R.mustard, R.cream]],
  ], ironingBoardFolded, { form: 'folded' }),
  ...(['S', 'L'] as const).flatMap((k) => {
    const c = CASES[k]
    return [
      prop(`wet-clear-case-${k.toLowerCase()}-closed`, '半透明收纳箱', 'storage', [c.w + 0.8, c.d + 0.8, c.h + 1.85], CASE_PALS, clearCase(c, false), { sizeLabel: k, form: 'closed' }),
      prop(`wet-clear-case-${k.toLowerCase()}-open`, '半透明收纳箱', 'storage', [c.w + 0.8, c.d + 1.7, c.h + c.d + 0.8], CASE_PALS, clearCase(c, true), { sizeLabel: k, form: 'open' }),
    ]
  }),
  define('wet-drawer-chest', '抽屉式收纳盒', 'storage', [DC.w, DC.d, DC.h], [
    ['modern', [M.white, M.light, M.gray]],
    ['nordic', [N.white, N.oak, N.gray]],
    ['cute', [C.white, C.sakura, C.pink]],
    ['modern', [M.char, M.gray, M.silver]],
  ], drawerChest, { surface: DC.h, surfaces: DC_LEVELS, openable: true }),
  prop('wet-wash-basket', '洗面所收纳篮', 'storage', [31, 21, 14], [
    ['nordic', [N.oakL, N.oak]],
    ['japanese', [J.hinoki, J.dark]],
    ['modern', [M.light, M.char]],
    ['cute', [C.woodL, C.pink]],
  ], washBasket),
]

// =====================================================================
// 香薰 / 除臭 / 除湿 / 防虫（小件，能放进马桶水箱盖、置物架、柜内层板）
// =====================================================================

// 藤条香薰：半透明锥形瓶 + 精油 + 藤条（藤条穿过瓶口）
function reedDiffuser(p: string[]) {
  const [oil, reed, collar] = p
  const g = new THREE.Group()
  g.add(clearDeep(cup(1.3, 3.5, 9, 0.35, GLASS), GLASS, 0.35))
  g.add(cyl(2.0, 2.9, 4, oil, { y: 0.35 }, 20))
  g.add(torus(1.35, 0.22, collar, { y: 8.6, rx: PI / 2 }))
  const ends: [number, number][] = [
    [2.8, 0.6],
    [-2.4, 1.6],
    [0.6, -2.8],
    [-1.4, -2.2],
    [1.4, 2.6],
  ]
  ends.forEach(([x, z], i) => g.add(rod3([x * 0.05, 1, z * 0.05], [x, 24 + (i % 3), z], 0.15, reed, 5)))
  return g
}

// 香薰蜡烛罐（不点燃）：陶罐 + 蜡 + 烛芯 + 标签带
function candleJar(p: string[]) {
  const [jar, wax, label] = p
  return G(
    cup(3.8, 3.6, 8, 0.35, jar),
    cyl(3.3, 3.2, 5.5, wax, { y: 0.35 }, 24),
    cyl(0.1, 0.1, 0.9, '#3a2a2a', { y: 5.8 }, 5),
    cyl(3.92, 3.87, 3, label, { y: 2 }, 28),
  )
}

// 厕所除臭盒：空心方盒 + 凝胶 + 格栅顶
function deodorBox(p: string[]) {
  const [box, gel, grille] = p
  const g = new THREE.Group()
  g.add(tray(8, 6, 8, 0.5, box, {}, 0.25))
  g.add(rbox(7, 3.5, 7, gel, { y: 0.5 }, 0.4))
  for (let i = 0; i < 5; i++) g.add(rbox(7.6, 0.5, 0.8, grille, { y: 5.6, z: -3 + i * 1.5 }, 0.2))
  return g
}

// 消臭喷雾（气雾罐 + 大盖）
function airSpray(p: string[]) {
  const [can, capC, label] = p
  return G(
    cyl(3.3, 3.3, 15.5, can, {}, 24),
    cyl(3.45, 3.45, 4.5, capC, { y: 15 }, 24),
    puck(3.45, 0.6, shade(capC, -0.1), { y: 19.2 }),
    cyl(3.38, 3.38, 7, label, { y: 4 }, 24),
  )
}

// 洁厕块盒
function toiletTablets(p: string[]) {
  const [box, label, tab] = p
  const g = G(rbox(10, 6.5, 4, box, {}, 0.5), rbox(8, 3.4, 0.4, label, { y: 1.5, z: 2.1 }, 0.15))
  for (const x of [-2.4, 0, 2.4]) g.add(puck(1, 0.4, tab, { x, y: 2.7, z: 2.3, rx: PI / 2 }))
  return g
}

// 除湿盒：上半不透明（吸湿剂 + 封膜），下半透明能看到积水
function dehumidifier(w: number, d: number, h: number): Build {
  return (p) => {
    const [body, film, water] = p
    const hb = h * 0.53
    const g = new THREE.Group()
    g.add(clearDeep(tray(w, hb, d, 0.4, GLASS, {}, 0.3), GLASS))
    g.add(rbox(w - 1, hb * 0.45, d - 1, water, { y: 0.4 }, 0.3))
    g.add(rbox(w, h - hb - 0.6, d, body, { y: hb - 0.2 }, 0.6))
    g.add(rbox(w - 0.8, 0.8, d - 0.8, film, { y: h - 0.8 }, 0.3))
    g.add(rbox(w * 0.6, h * 0.12, 0.3, shade(film, -0.15), { y: hb + 1, z: d / 2 + 0.05 }, 0.1))
    return g
  }
}
const DEHUM_PALS: Pal[] = [
  ['cute', [C.sky, C.white, '#a9dcf2']],
  ['modern', [M.white, M.light, '#a9dcf2']],
  ['nordic', [N.sage, N.white, '#b5e0f0']],
  ['cute', [C.pink, C.white, '#a9dcf2']],
]

// 挂式除湿袋（挂在衣柜挂杆上）：挂起 / 平放
function dehumBagBody(p: string[]) {
  const [bag, bar, water] = p
  const g = new THREE.Group()
  g.add(rbox(12, 2, 1.8, bar, { y: 28 }, 0.6))
  g.add(rbox(11, 16, 1.6, bag, { y: 12.2 }, 0.6))
  g.add(clearDeep(rbox(11, 12.4, 1.8, GLASS, {}, 0.6), GLASS))
  g.add(rbox(10, 5, 1.2, water, { y: 0.4 }, 0.4))
  g.add(rbox(7, 3, 0.3, shade(bag, -0.15), { y: 19, z: 0.85 }, 0.1))
  return g
}
function dehumBagHanging(p: string[]) {
  const [, bar] = p
  const body = dehumBagBody(p)
  body.position.set(0, ITEM_TOP - 30 + 0.2, ITEM_Z)
  return G(sHook(), torus(1, 0.25, bar, { y: LOOP_Y, z: ITEM_Z }), body)
}
function dehumBagLying(p: string[]) {
  const body = dehumBagBody(p)
  body.rotation.x = -PI / 2
  return ground(G(body))
}

// 竹炭包：麻布小袋 + 扎口
function charcoalBag(p: string[]) {
  const [cloth, ribbon] = p
  return ground(G(
    rbox(9, 3.6, 11, cloth, {}, 1.6),
    cylZLegacy(1.2, 1.6, cloth, 0, 1.8, 6.1),
    torus(1.25, 0.3, ribbon, { y: 1.8, z: 6.1 }),
    ball(1.8, cloth, { y: 1.8, z: 7.7 }, [1.2, 0.8, 0.5]),
  ))
}

// 防虫剂：衣柜挂式（挂起）/ 抽屉片状（平放）
function mothHanging(p: string[]) {
  const [card, label] = p
  const top = ITEM_TOP + 0.2
  const g = G(sHook(), torus(1, 0.25, label, { y: LOOP_Y, z: ITEM_Z }))
  g.add(rbox(9, 13, 1.2, card, { y: top - 13, z: ITEM_Z }, 0.5))
  g.add(rbox(7, 4, 0.3, label, { y: top - 5.5, z: ITEM_Z + 0.7 }, 0.1))
  for (let i = 0; i < 3; i++) g.add(rbox(6, 0.6, 0.3, shade(card, -0.15), { y: top - 11 + i * 1.6, z: ITEM_Z + 0.7 }, 0.1))
  return g
}
function mothSheet(p: string[]) {
  const [card, label] = p
  return G(rbox(20, 0.6, 12, card, {}, 0.25), rbox(8, 0.3, 5, label, { x: -4, y: 0.45, z: 2 }, 0.1))
}

const SCENT_PALS: Pal[] = [
  ['cute', [C.pink, C.woodL, C.sakura]],
  ['nordic', [N.sage, N.oak, N.white]],
  ['modern', [M.char, M.gray, M.silver]],
  ['japanese', [J.tatami, J.wood, J.washi]],
  ['retro', [R.mustard, R.caramel, R.cream]],
]

const AROMA: AssetDef[] = [
  prop('wet-reed-diffuser', '藤条香薰', 'toiletry', [7, 7, 26], [
    ['cute', [C.pink, J.hinoki, C.white]],
    ['nordic', [N.sage, N.oak, N.white]],
    ['modern', ['#7a5a43', M.black, M.silver]],
    ['japanese', ['#c9b6e4', J.dark, J.washi]],
  ], reedDiffuser),
  prop('wet-candle-jar', '香薰蜡烛罐', 'toiletry', [7.8, 7.8, 8], [
    ['nordic', [N.white, N.linen, N.sage]],
    ['modern', [M.char, M.white, M.silver]],
    ['cute', [C.sakura, C.white, C.pink]],
    ['japanese', [J.sumi, J.washi, J.shu]],
  ], candleJar),
  prop('wet-deodor-box', '厕所除臭盒', 'toiletry', [8, 8, 6.1], [
    ['cute', [C.white, C.mint, C.pink]],
    ['nordic', [N.white, N.sage, N.oak]],
    ['modern', [M.white, '#9fc8e8', M.char]],
    ['japanese', [J.washi, J.tatami, J.wood]],
  ], deodorBox),
  prop('wet-air-spray', '消臭喷雾', 'toiletry', [6.9, 6.9, 19.8], [
    ['cute', [C.white, C.pink, C.sakura]],
    ['modern', [M.silver, M.char, M.white]],
    ['nordic', [N.white, N.sage, N.linen]],
    ['retro', [R.cream, R.orange, R.mustard]],
  ], airSpray),
  prop('wet-toilet-tablets', '洁厕块', 'toiletry', [10, 4.6, 6.5], [
    ['modern', [M.white, '#4a8fd9', '#5aa9e6']],
    ['cute', [C.white, C.pink, C.mint]],
    ['nordic', [N.white, N.blue, N.sage]],
  ], toiletTablets),
  prop('wet-dehumidifier-l', '除湿盒', 'toiletry', [12, 9, 17], DEHUM_PALS, dehumidifier(12, 9, 17), { sizeLabel: '大' }),
  prop('wet-dehumidifier-s', '除湿盒', 'toiletry', [9, 7, 12], DEHUM_PALS, dehumidifier(9, 7, 12), { sizeLabel: '小' }),
  prop('wet-dehum-bag-hanging', '挂式除湿袋', 'toiletry', [12, 4.2, 35.8], DEHUM_PALS, dehumBagHanging, { form: 'hanging' }),
  prop('wet-dehum-bag-lying', '挂式除湿袋', 'toiletry', [12, 30, 2], DEHUM_PALS, dehumBagLying, { form: 'lying' }),
  prop('wet-charcoal-bag', '竹炭包', 'toiletry', [9, 14.1, 3.6], [
    ['japanese', [J.washi, J.sumi]],
    ['nordic', [N.linen, N.oak]],
    ['cute', [C.cream, C.pink]],
    ['modern', [M.light, M.black]],
  ], charcoalBag),
  prop('wet-moth-hanging', '防虫剂', 'toiletry', [9, 4.2, 18.8], SCENT_PALS, mothHanging, { form: 'hanging' }),
  prop('wet-moth-sheet', '防虫剂', 'toiletry', [20, 12, 0.75], SCENT_PALS, mothSheet, { form: 'lying' }),
]

export const WET: AssetDef[] = [...TOILET, ...BATH, ...DRESSING, ...AROMA]
