// 多屏 / 竖屏显示器：竖屏、三屏、横屏 + 竖屏组合。全部是桌面摆件（prop），原点在占地中心底面，正面朝 +z。
// 每件都声明 screens（面板位置）和屏幕顶边的夹挂层（clipLevels）：一键布置在边框上贴便签、顶边夹摄像头，
// 手动拖动夹式摄像头时也会吸到顶边正中。单屏 / 双屏 / 电竞曲面屏见 props-desk.ts、props-office.ts。

import * as THREE from 'three'
import { cyl, rbox, shade } from '../toon'
import { C, clipLevels, glow, type AssetDef, type ScreenPanel } from '../kit'
import { P } from '../geo'
import { I, M, N, type Pal } from '../packkit'

const SCREEN = '#bfe3ff'

/** [边框, 支架, 窗口点缀] */
const PALS: Pal[] = [
  ['modern', [M.black, M.silver, M.gray]],
  ['modern', [M.char, M.char, '#7ab8ff']],
  ['cute', [C.white, C.white, C.pink]],
  ['nordic', [N.white, N.oak, N.sage]],
  ['industrial', [I.iron, I.steel, I.rust]],
]

/** 一块屏幕：外框 + 背后的凸起 + 亮着的画面和几个窗口；原点在面板底边中点、厚度中心 */
function panel(w: number, h: number, frame: string, acc: string, variant = 0) {
  const g = new THREE.Group()
  g.add(rbox(w, h, 2, frame, {}, 0.8))
  g.add(rbox(w * 0.5, h * 0.5, 2.4, shade(frame, -0.05), { y: h * 0.2, z: -2.1 }, 1))
  const b = Math.max(0.8, w * 0.02)
  const gw = w - b * 2
  const gh = h - b * 2 - 0.6
  const y0 = b + 0.6
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

/** 单独的显示器底座 + 立柱（立柱在面板后面） */
function stand(g: THREE.Group, x: number, z: number, top: number, color: string, ry = 0) {
  const s = new THREE.Group()
  s.add(rbox(22, 1.4, 16, color, { z: -3 }, 0.6))
  s.add(rbox(4, top - 1, 2.4, color, { y: 1, z: -4.2 }, 0.8))
  g.add(P(s, x, 0, z, 0, ry))
}

// ---------- 竖屏 ----------

const PORTRAIT: ScreenPanel[] = [{ x: 0, y: 8, z: -1, w: 33, h: 54, t: 2 }]
function portrait(p: string[]) {
  const [frame, st, acc] = p
  const g = new THREE.Group()
  const s = PORTRAIT[0]
  stand(g, s.x, s.z + 1, 30, st)
  g.add(P(panel(s.w, s.h, frame, acc, 0), s.x, s.y, s.z))
  return g
}

// ---------- 三屏（21.5 寸 × 3，两侧往里收 0.5 rad，一根横杆支架） ----------

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
  TRIPLE.forEach((s, i) => g.add(P(panel(s.w, s.h, frame, i === 1 ? '#ffb86b' : acc, i), s.x, s.y, s.z, 0, s.ry ?? 0)))
  return g
}

// ---------- 横屏 27 寸 + 竖屏 24 寸 ----------

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
  g.add(P(panel(l.w, l.h, frame, acc, 1), l.x, l.y, l.z))
  g.add(P(panel(r.w, r.h, frame, acc, 0), r.x, r.y, r.z, 0, r.ry ?? 0))
  return g
}

function def(id: string, name: string, dims: [number, number, number], build: (p: string[]) => THREE.Group, screens: ScreenPanel[], clipOn: ScreenPanel[], extra: Partial<AssetDef> = {}): AssetDef {
  const [w, d, h] = dims
  return {
    id,
    name,
    category: 'tabletop',
    w,
    d,
    h,
    palettes: PALS.map((x) => x[1]),
    paletteStyles: PALS.map((x) => x[0]),
    styles: [...new Set(PALS.map((x) => x[0]))],
    build,
    prop: true,
    screens,
    surfaces: clipLevels(clipOn),
    ...extra,
  }
}

export const MONITORS: AssetDef[] = [
  def('mon-portrait-24', '竖屏显示器', [34, 18, 62], portrait, PORTRAIT, PORTRAIT, { sizeLabel: '24 寸' }),
  def('mon-triple-22', '三屏显示器', [134, 40, 44], triple, TRIPLE, [TRIPLE[0]], { sizeLabel: '21.5 寸 ×3' }),
  def('mon-combo-hv', '横竖双屏显示器', [96, 28, 61], combo, COMBO, [COMBO[0]], { sizeLabel: '27 寸 + 24 寸竖屏' }),
]
