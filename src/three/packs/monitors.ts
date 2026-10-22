// 显示器：各种尺寸、造型的单屏显示器（21.5–32 寸平面、升降旋转可竖放、铝合金一体、支臂夹桌、带鱼 / 超宽曲面、便携屏、圆润款）。
// 全部是桌面摆件（prop），原点在占地中心底面，正面朝 +z。双屏 / 三屏 / 横 + 竖组合不做成一件素材：一键布置把几台单屏并排、
// 两侧往里转一个角度组合出来（workstation.ts）；49 寸 32:9 本身就是一块屏，所以照常是单件。
// 每件都声明 screens（面板位置）和屏幕顶边的夹挂层（clipLevels）：一键布置在边框上贴便签、顶边夹摄像头，
// 手动拖动夹式摄像头时也会吸到顶边正中。另有 24 寸 / 27 寸基础款（props-desk.ts）、电竞曲面屏（props-office.ts）。
// mon-triple-22 / mon-combo-hv 是早先「一件素材里装多块屏」的做法，停用（retired），只为读旧存档保留。

import * as THREE from 'three'
import { cyl, rbox, shade } from '../toon'
import { C, clipLevels, glow, type AssetDef, type ScreenPanel } from '../kit'
import { P } from '../geo'
import { I, M, N, R, pal, type Pal } from '../packkit'

const SCREEN = '#bfe3ff'
/** 屏幕玻璃的黑边（铝合金款） */
const GLASS = '#1d1f24'

/** [边框, 支架, 窗口点缀] */
const PALS: Pal[] = [
  ['modern', [M.black, M.silver, M.gray]],
  ['modern', [M.char, M.char, '#7ab8ff']],
  ['cute', [C.white, C.white, C.pink]],
  ['nordic', [N.white, N.oak, N.sage]],
  ['industrial', [I.iron, I.steel, I.rust]],
]

interface PanelOpts {
  /** 边框宽（默认按屏宽的 2%） */
  b?: number
  /** 下巴（屏幕下沿比边框高多少） */
  chin?: number
  /** 外框圆角 */
  r?: number
  /** 给了就是整块背壳（铝合金款），不画背后的凸起 */
  back?: string
}

/** 一块屏幕：外框 + 背后的凸起 + 亮着的画面和几个窗口；原点在面板底边中点、厚度中心 */
function panel(w: number, h: number, frame: string, acc: string, variant = 0, o: PanelOpts = {}) {
  const g = new THREE.Group()
  g.add(rbox(w, h, 2, frame, {}, o.r ?? 0.8))
  if (o.back) g.add(rbox(w, h, 1.4, o.back, { z: -1.5 }, o.r ?? 1))
  else g.add(rbox(w * 0.5, h * 0.5, 2.4, shade(frame, -0.05), { y: h * 0.2, z: -2.1 }, 1))
  const b = o.b ?? Math.max(0.8, w * 0.02)
  const chin = o.chin ?? 0.6
  const gw = w - b * 2
  const gh = h - b * 2 - chin
  const y0 = b + chin
  g.add(glow(gw, gh, SCREEN, { y: y0, z: 1.1 }, 0.5))
  // 窗口：代码编辑器 / 文档 / 聊天（竖屏多半是长文档）
  const tall = h > w
  if (variant % 3 === 0) {
    g.add(glow(gw * 0.56, gh * 0.7, '#ffffff', { x: -gw * 0.18, y: y0 + gh * 0.12, z: 1.5 }, 0.6))
    g.add(glow(gw * 0.56, gh * 0.06, acc, { x: -gw * 0.18, y: y0 + gh * 0.84, z: 1.75 }, 0.6))
    for (let i = 0; i < (tall ? 9 : 5); i++) g.add(glow(gw * (0.2 + ((i * 37) % 30) / 100), gh * 0.025, '#9fb8d8', { x: -gw * 0.4 + gw * 0.12, y: y0 + gh * (0.72 - i * (tall ? 0.065 : 0.11)), z: 1.75 }, 0.4))
    g.add(glow(gw * 0.26, gh * 0.4, '#fff3b0', { x: gw * 0.3, y: y0 + gh * 0.3, z: 1.5 }, 0.6))
  } else if (variant % 3 === 1) {
    g.add(glow(gw * 0.8, gh * 0.8, '#26303f', { y: y0 + gh * 0.08, z: 1.5 }, 0.4))
    for (let i = 0; i < (tall ? 12 : 6); i++) g.add(glow(gw * (0.15 + ((i * 53) % 40) / 100), gh * 0.022, i % 3 ? '#9be7b5' : acc, { x: -gw * 0.3 + gw * 0.08, y: y0 + gh * (0.78 - i * (tall ? 0.055 : 0.11)), z: 1.75 }, 0.6))
  } else {
    g.add(glow(gw * 0.42, gh * 0.75, '#ffffff', { x: -gw * 0.22, y: y0 + gh * 0.1, z: 1.5 }, 0.6))
    g.add(glow(gw * 0.42, gh * 0.75, '#e6f2ff', { x: gw * 0.24, y: y0 + gh * 0.1, z: 1.5 }, 0.55))
    for (let i = 0; i < 4; i++) g.add(glow(gw * 0.3, gh * 0.06, i % 2 ? acc : '#c9f0dc', { x: gw * (i % 2 ? 0.28 : 0.2), y: y0 + gh * (0.68 - i * 0.15), z: 1.75 }, 0.6))
  }
  return g
}

/** 把面板放到声明的位置上 */
function mount(g: THREE.Group, s: ScreenPanel, frame: string, acc: string, variant = 0, o: PanelOpts = {}) {
  g.add(P(panel(s.w, s.h, frame, acc, variant, o), s.x, s.y, s.z, 0, s.ry ?? 0))
}

/** 单独的显示器底座 + 立柱（立柱在面板后面） */
function stand(g: THREE.Group, x: number, z: number, top: number, color: string, ry = 0) {
  const s = new THREE.Group()
  s.add(rbox(22, 1.4, 16, color, { z: -3 }, 0.6))
  s.add(rbox(4, top - 1, 2.4, color, { y: 1, z: -4.2 }, 0.8))
  g.add(P(s, x, 0, z, 0, ry))
}

/** 斜撑板：从 (y0, z0) 到 (y1, z1) 的一块宽 w、厚 t 的板（铝合金支架、便携屏的折叠皮套） */
function slab(w: number, t: number, y0: number, z0: number, y1: number, z1: number, color: string) {
  const L = Math.hypot(y1 - y0, z1 - z0)
  const s = new THREE.Group()
  s.add(rbox(w, L, t, color, { y: -L / 2 }, Math.min(0.4, t * 0.45)))
  return P(s, 0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, y1 - y0))
}

/** 平放的扁椭圆底座（宽 w、深 d、厚 t），中心在 z */
function ovalBase(w: number, d: number, t: number, color: string, z: number) {
  const m = cyl(d / 2, d / 2, t, color, { z }, 32)
  m.scale.x = w / d
  return m
}

/** V 形底座：两条扁腿从后面的轴心 (0, hz) 往前、往两侧伸到 (±tx, tz) */
function vBase(g: THREE.Group, hz: number, tx: number, tz: number, color: string) {
  const L = Math.hypot(tx, tz - hz)
  for (const s of [-1, 1]) {
    const leg = new THREE.Group()
    leg.add(rbox(4, 1.3, L, color, { z: L / 2 }, 0.6))
    g.add(P(leg, 0, 0, hz, 0, Math.atan2(s * tx, tz - hz)))
  }
  g.add(rbox(8, 1.7, 6, color, { z: hz }, 0.8))
}

// ---------- 窄边框（21.5 / 24 / 27 寸）：椭圆底座 + 细立柱 ----------

function slimSpec(sw: number, sh: number, d: number): ScreenPanel {
  return { x: 0, y: 9, z: -d / 2 + 7, w: sw, h: sh, t: 2 }
}
function slim(s: ScreenPanel, d: number) {
  return (p: string[]) => {
    const [frame, st, acc] = p
    const g = new THREE.Group()
    g.add(ovalBase(s.w * 0.42, d - 1, 1, st, 0))
    g.add(rbox(3.2, s.y + s.h * 0.45, 1.6, st, { y: 0.6, z: s.z - 4.2 }, 0.6))
    mount(g, s, frame, acc, 0, { b: 0.6, chin: 0.8 })
    return g
  }
}
const SLIM_215 = slimSpec(49, 29, 18)
const SLIM_24 = slimSpec(54, 32, 18)
const SLIM_27 = slimSpec(61.5, 36, 20)

// ---------- 升降旋转（27 寸，横放 / 竖放）：方底座 + 带滑槽的立柱 ----------

const PIVOT_D = 22
const PIVOT_H: ScreenPanel = { x: 0, y: 11, z: -0.9, w: 61.5, h: 36.5, t: 2 }
const PIVOT_V: ScreenPanel = { x: 0, y: 6, z: -0.9, w: 36.5, h: 61.5, t: 2 }
function pivot(s: ScreenPanel) {
  return (p: string[]) => {
    const [frame, st, acc] = p
    const g = new THREE.Group()
    g.add(rbox(26, 1.8, 20, st, {}, 0.8))
    const col = s.y + s.h * (s.h > s.w ? 0.42 : 0.5) - 1.8
    g.add(rbox(7, col, 4.5, st, { y: 1.8, z: -6.5 }, 1.2))
    g.add(rbox(1.4, col - 8, 0.4, shade(st, -0.18), { y: 6, z: -4.2 }, 0.15))
    mount(g, s, frame, acc, s.h > s.w ? 0 : 1)
    return g
  }
}

// ---------- 32 寸 4K：V 形底座 ----------

const UHD_32: ScreenPanel = { x: 0, y: 10, z: -3, w: 71.5, h: 42, t: 2 }
function uhd32(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  vBase(g, -8, 13, 9, st)
  g.add(rbox(5, UHD_32.y + 16, 3, st, { y: 1, z: -8 }, 1))
  mount(g, UHD_32, frame, acc, 2)
  return g
}

// ---------- 铝合金一体（27 寸 5K）：整块铝背壳 + 一块折弯的铝板支架 ----------

const ALU_27: ScreenPanel = { x: 0, y: 12, z: 1, w: 62.3, h: 36, t: 2 }
function alu27(p: string[]) {
  const [alu, glass, acc] = p
  const g = new THREE.Group()
  g.add(rbox(17, 0.8, 15, alu, { z: -1.5 }, 0.35))
  g.add(slab(15, 0.9, 0.6, -8.2, ALU_27.y + ALU_27.h * 0.45, ALU_27.z - 2.7, alu))
  mount(g, ALU_27, glass, acc, 0, { b: 1.6, chin: 0.2, r: 1.2, back: alu })
  return g
}

// ---------- 支臂（27 寸）：夹在桌子后沿的立杆 + 两节悬臂，屏幕浮在桌面上方 ----------

const ARM_D = 26
const ARM_27: ScreenPanel = { x: 0, y: 18, z: 3, w: 61.5, h: 36.5, t: 2 }
function arm27(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  const pz = -ARM_D / 2 + 4
  // 夹座、立杆、杆顶盖
  g.add(rbox(9, 2.4, 8, st, { z: pz }, 0.8))
  g.add(cyl(1.8, 1.8, 40, st, { y: 2.4, z: pz }, 16))
  g.add(cyl(2.1, 2.1, 1.4, shade(st, -0.12), { y: 42, z: pz }, 16))
  // 两节悬臂：立杆 → 肘关节（往右偏一点）→ 面板背后的转接头
  const ay = ARM_27.y + ARM_27.h / 2 - 1.5
  const ex = 9
  const ez = (pz + ARM_27.z) / 2 - 2
  const hz = ARM_27.z - 4.6
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const s = new THREE.Group()
    s.add(rbox(3.6, 3, L, st, { y: -1.5, z: L / 2 }, 1))
    g.add(P(s, x0, ay, z0, 0, Math.atan2(x1 - x0, z1 - z0)))
  }
  g.add(cyl(2.4, 2.4, 4, st, { y: ay - 2, z: pz }, 16))
  seg(0, pz, ex, ez)
  g.add(cyl(2.2, 2.2, 3.8, shade(st, -0.08), { x: ex, y: ay - 1.9, z: ez }, 16))
  seg(ex, ez, 0, hz)
  g.add(rbox(10, 10, 1.6, st, { y: ay - 5, z: hz + 0.8 }, 0.6))
  mount(g, ARM_27, frame, acc, 1, { b: 0.6, chin: 0.8 })
  return g
}

// ---------- 便携屏（15.6 寸）：薄面板立在折叠皮套上 ----------

const PORT_D = 12
const PORTABLE: ScreenPanel = { x: 0, y: 0.8, z: -0.5, w: 36, h: 22.5, t: 2 }
function portable(p: string[]) {
  const [frame, cover, acc] = p
  const g = new THREE.Group()
  // 前面的托边、背后撑开的皮套
  g.add(rbox(PORTABLE.w, 0.8, 4.5, cover, { z: 2.6 }, 0.35))
  g.add(slab(PORTABLE.w - 2, 0.7, 0.2, -PORT_D / 2 + 0.6, PORTABLE.h * 0.62, PORTABLE.z - 1.6, cover))
  mount(g, PORTABLE, frame, acc, 2, { b: 0.7, chin: 1.2, back: frame })
  return g
}

// ---------- 圆润款（24 寸）：粗圆角边框、圆底座、下巴上两颗喇叭孔 ----------

const ROUND_24: ScreenPanel = { x: 0, y: 11, z: -1.5, w: 54, h: 34, t: 2 }
function round24(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  g.add(cyl(10, 10.5, 1.6, st, {}, 32))
  g.add(cyl(2, 2, ROUND_24.y + 12, st, { y: 1, z: -6 }, 16))
  mount(g, ROUND_24, frame, acc, 2, { b: 2.4, chin: 3.2, r: 1 })
  for (const s of [-1, 1]) g.add(cyl(1, 1, 0.4, shade(frame, -0.12), { x: s * 4, y: ROUND_24.y + 1.9, z: ROUND_24.z + 1, rx: Math.PI / 2 }, 12))
  g.add(cyl(0.9, 0.9, 0.5, acc, { x: ROUND_24.w / 2 - 4, y: ROUND_24.y + 1.9, z: ROUND_24.z + 1, rx: Math.PI / 2 }, 12))
  return g
}

// ---------- 曲面（34 寸 21:9 带鱼屏、49 寸 32:9 超宽）：面板沿圆弧分段 ----------

/** 曲面屏两端比中间往前凸出多少 */
const bowOf = (w: number, r: number) => r * (1 - Math.cos(w / 2 / r))
function curved(w: number, h: number, r: number, y: number, z: number, d: number, n: number, wide: boolean) {
  return (p: string[]) => {
    const [frame, st, acc] = p
    const g = new THREE.Group()
    if (wide) g.add(rbox(44, 1.6, d - 6, st, { z: -1 }, 0.8))
    else vBase(g, -d / 2 + 4, 20, d / 2 - 3, st)
    g.add(rbox(6, y + h * 0.5, 3.5, st, { y: 1, z: z - 5.6 }, 1.2))
    g.add(rbox(w * 0.3, h * 0.5, 2.6, shade(frame, -0.05), { y: y + h * 0.25, z: z - 2.3 }, 1.2))
    const sw = w / n
    const b = 0.7
    for (let i = 0; i < n; i++) {
      const a = ((i - (n - 1) / 2) * sw) / r
      const seg = new THREE.Group()
      seg.add(rbox(sw + 0.3, h, 2, frame, {}, 0.3))
      seg.add(glow(sw + 0.05, h - b * 2 - 0.6, i % 2 ? '#c8ecff' : SCREEN, { y: b + 0.6, z: 1.1 }, 0.5))
      // 窗口横跨几段：左边文档、中间深色编辑器、右边聊天
      const k = i / (n - 1)
      if (k < 0.34) seg.add(glow(sw + 0.05, h * 0.62, '#ffffff', { y: h * 0.18, z: 1.5 }, 0.6))
      else if (k < 0.7) seg.add(glow(sw + 0.05, h * 0.7, '#26303f', { y: h * 0.13, z: 1.5 }, 0.4))
      else seg.add(glow(sw * 0.8, h * 0.12, i % 2 ? acc : '#c9f0dc', { y: h * (0.3 + (i % 3) * 0.17), z: 1.5 }, 0.6))
      if (k >= 0.34 && k < 0.7) for (let j = 0; j < 5; j++) seg.add(glow(sw * (0.4 + ((i * 7 + j * 13) % 5) / 10), h * 0.025, j % 3 ? '#9be7b5' : acc, { y: h * (0.72 - j * 0.11), z: 1.75 }, 0.6))
      seg.position.set(r * Math.sin(a), y, z + r * (1 - Math.cos(a)))
      seg.rotation.y = -a
      g.add(seg)
    }
    return g
  }
}
const UW_34: ScreenPanel = { x: 0, y: 11, z: -3, w: 81, h: 36.5, t: 2, bow: bowOf(81, 150) }
const UW_49: ScreenPanel = { x: 0, y: 10, z: -5, w: 120, h: 37, t: 2, bow: bowOf(120, 180) }

// ---------- 竖屏（24 寸） ----------

const PORTRAIT: ScreenPanel[] = [{ x: 0, y: 8, z: -1, w: 33, h: 54, t: 2 }]
function portrait(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  const s = PORTRAIT[0]
  stand(g, s.x, s.z + 1, 30, st)
  mount(g, s, frame, acc, 0)
  return g
}

// ---------- 停用：一件素材里装三块屏（21.5 寸 × 3，两侧往里收 0.5 rad，一根横杆支架） ----------

const TRI_A = 0.5
const TRI_W = 47.6
const TRI_H = 28
const TRI_Z = -3.9
const TRI_SIDE_X = TRI_W / 2 + 0.4 + (TRI_W / 2) * Math.cos(TRI_A)
const TRI_SIDE_Z = TRI_Z + (TRI_W / 2) * Math.sin(TRI_A)
const TRIPLE: ScreenPanel[] = [
  { x: 0, y: 15, z: TRI_Z, w: TRI_W, h: TRI_H, t: 2 },
  { x: -TRI_SIDE_X, y: 15, z: TRI_SIDE_Z, w: TRI_W, h: TRI_H, t: 2, ry: TRI_A },
  { x: TRI_SIDE_X, y: 15, z: TRI_SIDE_Z, w: TRI_W, h: TRI_H, t: 2, ry: -TRI_A },
]
function triple(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  // 底座 + 立柱 + 横杆
  g.add(rbox(28, 1.6, 18, st, { z: TRI_Z - 7 }, 0.7))
  g.add(cyl(1.7, 1.7, 30, st, { y: 1, z: TRI_Z - 7 }, 14))
  g.add(rbox(70, 2.6, 2.6, st, { y: 26, z: TRI_Z - 7 }, 1))
  for (const s of [-1, 1]) g.add(P(rbox(2.6, 2.6, 24, st, {}, 1), s * 36, 26, TRI_Z - 1, 0, -s * 0.9))
  TRIPLE.forEach((s, i) => mount(g, s, frame, i === 1 ? '#ffb86b' : acc, i))
  return g
}

// ---------- 停用：横屏 27 寸 + 竖屏 24 寸装在一件里 ----------

const COMBO_XL = -15.75
const COMBO_A = 0.3
const COMBO: ScreenPanel[] = [
  { x: COMBO_XL, y: 12, z: 2, w: 62, h: 38, t: 2 },
  { x: COMBO_XL + 32 + 16.5 * Math.cos(COMBO_A), y: 6, z: 2 + 16.5 * Math.sin(COMBO_A), w: 33, h: 54, t: 2, ry: -COMBO_A },
]
function combo(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  const [l, r] = COMBO
  // 立柱都在面板背后中间（stand 里立柱在底座中心往后 4.2）
  stand(g, l.x, l.z + 1, l.y + 20, st)
  const ry = r.ry ?? 0
  stand(g, r.x + Math.sin(ry), r.z + Math.cos(ry), r.y + 28, st, ry)
  mount(g, l, frame, acc, 1)
  mount(g, r, frame, acc, 0)
  return g
}

function def(id: string, name: string, dims: [number, number, number], build: (p: string[]) => THREE.Group, screens: ScreenPanel[], clipOn: ScreenPanel[], extra: Partial<AssetDef> = {}, pals: Pal[] = PALS): AssetDef {
  const [w, d, h] = dims
  return {
    id,
    name,
    category: 'tabletop',
    type: 'monitor',
    w,
    d,
    h,
    ...pal(...pals),
    build,
    prop: true,
    screens,
    surfaces: clipLevels(clipOn),
    ...extra,
  }
}
/** 单屏：面板就是夹挂层 */
const one = (id: string, name: string, dims: [number, number, number], build: (p: string[]) => THREE.Group, s: ScreenPanel, extra: Partial<AssetDef> = {}, pals: Pal[] = PALS) => def(id, name, dims, build, [s], [s], { tags: ['monitor', 'hobby:tech'], ...extra }, pals)
/** 只为读旧存档保留：素材库不列、一键布置不用 */
const RETIRED: Partial<AssetDef> = { tags: ['retired', 'set-piece'] }

/** [铝, 玻璃黑边, 窗口点缀] */
const ALU_PALS: Pal[] = [
  ['modern', [M.silver, GLASS, '#7ab8ff']],
  ['modern', ['#8d9097', GLASS, M.gray]],
  ['nordic', ['#e4e2dc', GLASS, N.sage]],
]
/** [边框, 皮套, 窗口点缀] */
const PORT_PALS: Pal[] = [
  ['modern', [M.char, M.black, '#7ab8ff']],
  ['modern', [M.silver, M.gray, M.gray]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['nordic', [N.white, N.linen, N.sage]],
  ['retro', [R.cream, R.caramel, R.orange]],
]
/** [边框, 底座, 点缀] */
const ROUND_PALS: Pal[] = [
  ['cute', [C.sakura, C.white, C.pink]],
  ['cute', [C.mint, C.white, C.lemon]],
  ['cute', [C.lilac, C.white, C.sky]],
  ['cute', [C.white, C.white, C.pink]],
  ['retro', [R.cream, R.mustard, R.teal]],
  ['nordic', [N.white, N.oak, N.sage]],
]

export const MONITORS: AssetDef[] = [
  one('mon-slim-22', '窄边框显示器', [49, 18, 38], slim(SLIM_215, 18), SLIM_215, { series: 'mon-slim', sizeLabel: '21.5 寸' }),
  one('mon-slim-24', '窄边框显示器', [54, 18, 41], slim(SLIM_24, 18), SLIM_24, { series: 'mon-slim', sizeLabel: '24 寸' }),
  one('mon-slim-27', '窄边框显示器', [62, 20, 45], slim(SLIM_27, 20), SLIM_27, { series: 'mon-slim', sizeLabel: '27 寸' }),
  one('mon-pivot-27', '升降旋转显示器', [62, PIVOT_D, 48], pivot(PIVOT_H), PIVOT_H, { series: 'mon-pivot', sizeLabel: '27 寸' }),
  one('mon-pivot-27-v', '升降旋转显示器', [37, PIVOT_D, 68], pivot(PIVOT_V), PIVOT_V, { series: 'mon-pivot', sizeLabel: '27 寸竖屏' }),
  one('mon-uhd-32', '4K 显示器', [72, 24, 52], uhd32, UHD_32, { sizeLabel: '32 寸' }),
  one('mon-alu-27', '铝合金显示器', [63, 18, 48], alu27, ALU_27, { sizeLabel: '27 寸 5K' }, ALU_PALS),
  one('mon-arm-27', '支臂显示器', [62, ARM_D, 55], arm27, ARM_27, { sizeLabel: '27 寸' }),
  one('mon-portable-16', '便携显示器', [36, PORT_D, 24], portable, PORTABLE, { sizeLabel: '15.6 寸' }, PORT_PALS),
  one('mon-round-24', '圆润显示器', [54, 21, 45], round24, ROUND_24, { sizeLabel: '24 寸' }, ROUND_PALS),
  one('mon-uw-34', '带鱼屏显示器', [81, 24, 48], curved(81, 36.5, 150, 11, -3, 24, 9, false), UW_34, { sizeLabel: '34 寸 21:9' }),
  one('mon-uw-49', '超宽曲面显示器', [120, 30, 47], curved(120, 37, 180, 10, -5, 30, 13, true), UW_49, { sizeLabel: '49 寸 32:9' }),
  def('mon-portrait-24', '竖屏显示器', [34, 18, 62], portrait, PORTRAIT, PORTRAIT, { sizeLabel: '24 寸' }),
  def('mon-triple-22', '三屏显示器', [134, 40, 44], triple, TRIPLE, [TRIPLE[0]], { sizeLabel: '21.5 寸 ×3', ...RETIRED }),
  def('mon-combo-hv', '横竖双屏显示器', [96, 28, 61], combo, COMBO, [COMBO[0]], { sizeLabel: '27 寸 + 24 寸竖屏', ...RETIRED }),
]
