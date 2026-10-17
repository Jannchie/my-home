// 厨房小家电 / 炊具 / 厨房用品，以及几件夏天的桌面小物（电蚊拍、蚊香等）。
// 全部是 prop：原点在摆件底面中心，可以摆在台面、餐桌、柜面上。约定见 kit.ts 开头。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, glow, holePanel, rng, shell, type AssetDef, type Fx, type Hole } from '../kit'
import { PI, clearDeep, hcyl, lit, noOutlineDeep } from '../geo'
import { I, J, M, N, R, type Pal3 } from '../packkit'

// 固定色
const RICE = '#fffdf6'
const WATER = '#cfeeff'
const GLASS = '#d8eef9'
const DARK = '#2b2c30'
const CAVITY = '#4a4440'
const LCD = '#bfe9c8'
const AMBER = '#ffb36b'
const HEAT = '#ff7a45'
const BREAD = '#f7dca6'
const CRUST = '#c98a4f'
const COPPER = '#c7773e'
const BRASS = '#d4a64a'

// ---------- 小工具 ----------

/** 水平的发光小方片（顶面上的显示屏 / 触摸键）：底面在 y，厚 0.6 */
const chip = (w: number, d: number, color: string, x: number, y: number, z: number, k = 0.55) => lit(rbox(w, 0.6, d, color, { x, y, z }, 0.2), color, k)
/** 指示灯 */
const lamp = (color: string, x: number, y: number, z: number, r = 0.45) => lit(ball(r, color, { x, y, z }), color, 0.8)

/** 正面旋钮：从 z 面往外凸 len */
function knob(r: number, len: number, color: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(hcyl(r, r, len, color, x, y, z + len / 2, 'z', 20))
  g.add(noOutlineDeep(rbox(r * 0.3, r * 1.3, 0.3, C.white, { x, y: y - r * 0.15, z: z + len + 0.1 }, 0.1)))
  return g
}

/** 半球形盖子：底面在 at.y，高 h */
function dome(r: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 10, 0, PI * 2, 0, PI / 2), toon(color))
  m.scale.y = h / r
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 半圆片液面（鸳鸯锅）：side=1 在 +z 半边 */
function halfDisc(r: number, top: number, color: string, side: 1 | -1) {
  const geo = new THREE.CylinderGeometry(r, r, 0.3, 24, 1, false, side > 0 ? -PI / 2 : PI / 2, PI)
  const m = new THREE.Mesh(geo, toon(color))
  m.position.y = top - 0.15
  m.userData.noOutline = true
  return m
}

/** 容器里的液面：薄圆片，top 是液面高度 */
function liquid(r: number, top: number, color: string, x = 0, z = 0) {
  return noOutlineDeep(cyl(r, r, 0.3, color, { x, y: top - 0.3, z }, 28))
}

/** 竖立的圆盘（碗架里的盘子）：盘面朝 ±x，中心 (x, y, z) */
function standDisc(r: number, t: number, color: string, x: number, y: number, z: number, tilt = 0) {
  const m = cyl(r, r * 0.92, t, color, {}, 28)
  m.position.set(x, y, z)
  m.rotation.z = PI / 2 + tilt
  return m
}

/** 四只小脚 */
function feet(w: number, d: number, h: number, color: string, r = 1) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(r, r, h, color, { x: (sx * w) / 2, z: (sz * d) / 2 }, 10))
  return g
}

/** 在圆角矩形（宽 w、高 h、底边在 0、x 居中、圆角 r）里按网格开小方孔 */
function gridHoles(w: number, h: number, r: number, hole: number, pitch: number, margin: number): Hole[] {
  const out: Hole[] = []
  const inside = (x: number, y: number) => {
    const ax = Math.abs(x)
    const hw = w / 2 - margin
    const rr = Math.max(0, r - margin)
    if (ax > hw || y < margin || y > h - margin) return false
    const cx = hw - rr
    const cyB = margin + rr
    const cyT = h - margin - rr
    if (ax > cx && y < cyB) return Math.hypot(ax - cx, y - cyB) <= rr
    if (ax > cx && y > cyT) return Math.hypot(ax - cx, y - cyT) <= rr
    return true
  }
  const nx = Math.floor((w - margin * 2 - hole) / pitch) + 1
  const ny = Math.floor((h - margin * 2 - hole) / pitch) + 1
  const x0 = -((nx - 1) * pitch) / 2
  const y0 = (h - (ny - 1) * pitch) / 2
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const x = x0 + i * pitch
      const y = y0 + j * pitch
      const s = hole / 2
      if (inside(x - s, y - s) && inside(x + s, y - s) && inside(x - s, y + s) && inside(x + s, y + s)) out.push({ kind: 'rect', x, y: y - s, w: hole, h: hole, r: 0.15 })
    }
  return out
}

// ---------- 定义 ----------

type Def = Omit<AssetDef, 'palettes' | 'paletteStyles' | 'prop' | 'category'> & { pals: Pal3[]; category?: AssetDef['category']; raw?: boolean }

/** 把模型在 xz 上挪到包围盒中心（fx 坐标按挪之前的写，所以带 fx 的素材都做成左右前后对称） */
function centeredLoose(build: (p: string[]) => THREE.Group) {
  return (p: string[]) => {
    const inner = build(p)
    const b = new THREE.Box3().setFromObject(inner)
    inner.position.set(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2)
    const g = new THREE.Group()
    g.add(inner)
    return g
  }
}

function def(o: Def): AssetDef {
  const { pals, styles, build, raw, category, ...rest } = o
  const ps = pals.map((p) => p[0])
  return {
    ...rest,
    category: category ?? 'kitchenware',
    palettes: pals.map((p) => [p[1], p[2], p[3]]),
    paletteStyles: ps,
    styles: styles ?? [...new Set(ps)],
    prop: true,
    build: raw ? build : centeredLoose(build),
  }
}

// ---------- 加热类小家电 ----------

function airFryerSquare(p: string[]) {
  const [body, front, acc] = p
  const g = new THREE.Group()
  g.add(feet(22, 24, 0.8, M.black))
  g.add(rbox(28, 31, 29, body, { y: 0.8, z: -1.5 }, 5)) // z -16 .. 13
  // 抽屉锅
  g.add(rbox(24, 17, 2.4, front, { y: 2.5, z: 13.6 }, 1.2))
  g.add(noOutlineDeep(rbox(11, 5, 0.4, '#3b3638', { y: 9.5, z: 14.9 }, 0.3)))
  g.add(noOutlineDeep(rbox(9, 0.6, 0.3, '#6a6266', { y: 13.3, z: 15.1 }, 0.1)))
  // C 形把手
  g.add(rbox(4.5, 2.2, 4, acc, { y: 13.4, z: 16.4 }, 0.8))
  g.add(rbox(4.5, 2.2, 3.4, acc, { y: 5, z: 16.1 }, 0.8))
  g.add(rbox(4.5, 10.6, 2.2, acc, { y: 5, z: 18.8 }, 0.9))
  // 上部面板：屏幕 + 按键
  g.add(rbox(18, 7, 0.8, shade(body, -0.06), { y: 21.5, z: 13.1 }, 0.4))
  g.add(glow(6, 2.4, AMBER, { y: 25, z: 13.8 }))
  for (const x of [-5.5, -2.8, 2.8, 5.5]) g.add(lit(cyl(0.7, 0.7, 0.5, '#e8e8e8', {}, 12), '#e8e8e8', 0.3).translateX(x).translateY(22.7).translateZ(13.75).rotateX(PI / 2))
  // 背后散热格栅
  for (let i = 0; i < 4; i++) g.add(rbox(16, 0.7, 0.6, shade(body, -0.15), { y: 23 + i * 1.6, z: -16.2 }, 0.2))
  return g
}

function airFryerRound(p: string[]) {
  const [body, front, acc] = p
  const g = new THREE.Group()
  g.add(feet(15, 15, 0.8, M.black))
  g.add(cyl(10.5, 11.5, 25, body, { y: 0.8 }, 36))
  g.add(puck(10.6, 3, shade(body, 0.03), { y: 24.8 }))
  // 顶上的圆形触摸屏
  g.add(cyl(4, 4, 0.5, DARK, { y: 27.6 }, 24))
  g.add(noOutlineDeep(lit(torus(3.3, 0.18, AMBER, { y: 28.15, rx: PI / 2 }), AMBER)))
  g.add(chip(2.6, 1.2, AMBER, 0, 27.75, 0))
  // 抽屉
  g.add(rbox(15, 13, 3, front, { y: 2.2, z: 10.1 }, 1.4))
  g.add(noOutlineDeep(rbox(7, 4, 0.4, '#3b3638', { y: 8.5, z: 11.7 }, 0.3)))
  g.add(rbox(4, 2, 3.4, acc, { y: 11.2, z: 12.9 }, 0.7))
  g.add(rbox(4, 2, 3, acc, { y: 4, z: 12.7 }, 0.7))
  g.add(rbox(4, 9.2, 2, acc, { y: 4, z: 15 }, 0.8))
  g.add(lamp('#7fe08a', 6, 16, 9.9))
  return g
}

function pressureCooker(p: string[]) {
  const [body, lid, acc] = p
  const g = new THREE.Group()
  g.add(cyl(12.5, 12, 2, M.black, {}, 32))
  g.add(cyl(13.5, 13.5, 18, body, { y: 2 }, 36))
  g.add(torus(13.5, 0.5, shade(body, -0.12), { y: 19.6, rx: PI / 2 }))
  g.add(puck(14, 3, lid, { y: 19.3 }))
  g.add(dome(12.5, 4, lid, { y: 22 }))
  // 盖子提手
  g.add(rbox(4.5, 2.6, 17, acc, { y: 24.4 }, 1))
  // 限压阀 + 浮子阀
  g.add(cyl(1.3, 1.5, 2.6, M.silver, { x: -6.5, y: 24.8 }, 16))
  g.add(ball(1, '#c0392b', { x: -6.5, y: 27.8 }))
  g.add(cyl(0.5, 0.5, 1.2, '#c0392b', { x: 6.5, y: 25 }, 10))
  // 两侧把手
  for (const s of [-1, 1]) g.add(rbox(3, 2, 7, M.black, { x: s * 14.6, y: 15 }, 0.7))
  // 正面操作面板
  g.add(rbox(11, 7, 2, M.black, { y: 6, z: 12.9 }, 0.8))
  g.add(glow(5, 2, '#9fe7ff', { y: 9.6, z: 14.2 }))
  for (const x of [-3, 0, 3]) g.add(ball(0.7, acc, { x, y: 7.6, z: 13.9 }))
  return g
}

function ihCooktop(p: string[]) {
  const [body, top, acc] = p
  const g = new THREE.Group()
  g.add(feet(24, 30, 0.6, M.black))
  g.add(rbox(29, 4.4, 36, body, { y: 0.6 }, 1.2))
  g.add(rbox(27.6, 0.8, 34.4, top, { y: 4.6 }, 0.3))
  const ring = shade(top, 0.28)
  g.add(noOutlineDeep(torus(9.5, 0.18, ring, { y: 5.45, z: -3, rx: PI / 2 })))
  g.add(noOutlineDeep(torus(4.5, 0.15, ring, { y: 5.42, z: -3, rx: PI / 2 })))
  g.add(chip(5, 1.8, '#ff9a5a', 0, 5, 12.4))
  for (const x of [-9, -6, 6, 9]) g.add(chip(1.4, 1.4, x < 0 ? acc : '#e8e8e8', x, 5, 12.4, 0.35))
  g.add(lamp('#ff6b4a', 11.5, 2.6, 18.1, 0.4))
  return g
}

function cassetteStove(p: string[]) {
  const [body, acc, knobC] = p
  const g = new THREE.Group()
  g.add(rbox(34, 8.5, 28, body, {}, 1.5))
  g.add(rbox(22, 0.6, 24, '#3a3a3c', { x: -4.5, y: 8.2 }, 0.3))
  g.add(cyl(3.6, 4, 1.2, '#2b2b2d', { x: -4.5, y: 8.6 }, 24))
  g.add(noOutlineDeep(torus(3, 0.22, '#55565a', { x: -4.5, y: 9.85, rx: PI / 2 })))
  // 五爪支架
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.3
    g.add(rbox(4.5, 2, 0.9, '#2b2b2d', { x: -4.5 + Math.cos(a) * 7.5, y: 8.7, z: Math.sin(a) * 7.5, ry: -a }, 0.25))
  }
  // 气罐仓盖
  g.add(rbox(10, 1, 25, acc, { x: 11.5, y: 8 }, 0.5))
  g.add(knob(1.9, 2, knobC, 11.5, 4.4, 14))
  g.add(rbox(16, 1.4, 0.6, acc, { x: -4.5, y: 3.6, z: 14.2 }, 0.2))
  return g
}

function hotplate(p: string[]) {
  const [body, plateC, acc] = p
  const g = new THREE.Group()
  g.add(feet(32, 22, 1, M.black))
  g.add(rbox(40, 4, 28, body, { y: 1 }, 2))
  g.add(tray(38, 2.6, 26, 0.8, plateC, { y: 4.8 }))
  for (let i = 0; i < 9; i++) g.add(rbox(34, 0.4, 0.8, shade(plateC, 0.12), { y: 5.5, z: -10 + i * 2.5 }, 0.15))
  // 肉和蔬菜
  const r = rng(7)
  for (let i = 0; i < 5; i++) g.add(rbox(5, 0.7, 3, '#a0522d', { x: -14 + i * 4.2, y: 5.9, z: -6 + (i % 2) * 3, ry: r() * 0.6 }, 0.3))
  for (let i = 0; i < 4; i++) g.add(puck(1.8, 0.7, i % 2 ? '#78c47a' : '#ffb347', { x: 5 + i * 3.6, y: 5.9, z: 5 - (i % 2) * 3 }))
  g.add(puck(2.4, 0.8, '#fff3c8', { x: 8, y: 5.9, z: -6 }))
  for (const s of [-1, 1]) g.add(rbox(3, 2, 10, acc, { x: s * 20.5, y: 5.2 }, 0.8))
  g.add(rbox(6, 3, 2.4, acc, { x: 13, y: 1.4, z: 14.6 }, 0.6))
  g.add(knob(1.2, 1, M.black, 13, 2.9, 15.8))
  return g
}

function takoyaki(p: string[]) {
  const [body, plateC, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 4.5, 22, body, {}, 2))
  g.add(rbox(20, 1.6, 18, plateC, { y: 4.2 }, 0.5))
  const r = rng(3)
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = -6.3 + i * 4.2
      const z = -6.3 + j * 4.2
      g.add(noOutlineDeep(cyl(1.75, 1.75, 0.3, '#1f1f22', { x, y: 5.6, z }, 18)))
      if (r() < 0.75) {
        g.add(ball(1.6, '#e3a752', { x, y: 6.9, z }))
        g.add(noOutlineDeep(ball(1.62, '#6b3a1f', { x, y: 7.2, z }, [1, 0.6, 1])))
        g.add(noOutlineDeep(ball(0.25, '#4f9e5b', { x: x + 0.4, y: 8.3, z: z - 0.3 })))
      }
    }
  for (const s of [-1, 1]) g.add(rbox(3, 2, 7, acc, { x: s * 13, y: 2.4 }, 0.7))
  g.add(lamp('#ff6b4a', 8, 2.2, 11.1))
  return g
}

function electricHotpot(p: string[]) {
  const [body, pot, acc] = p
  const g = new THREE.Group()
  g.add(puck(12, 4, body))
  g.add(cup(14, 12.5, 9.5, 0.7, pot, { y: 3.8 }))
  // 鸳鸯隔板
  g.add(rbox(24.2, 7.6, 0.5, pot, { y: 4.4 }, 0.2))
  g.add(halfDisc(12.7, 10.2, '#d9442b', 1))
  g.add(halfDisc(12.7, 10.2, '#f3e6c8', -1))
  // 料
  g.add(ball(1.3, '#c98a6a', { x: -4, y: 10.2, z: 5 }))
  g.add(ball(1.3, '#c98a6a', { x: 3, y: 10.2, z: 7 }))
  g.add(rbox(3, 1.4, 3, '#fffaf0', { x: 4, y: 9.6, z: -6 }, 0.4))
  g.add(rbox(3, 1.4, 3, '#fffaf0', { x: -5, y: 9.6, z: -4, ry: 0.5 }, 0.4))
  g.add(ball(1.6, '#78c47a', { x: 0, y: 10.2, z: -8 }, [1.4, 0.35, 0.8]))
  for (const s of [-1, 1]) g.add(rbox(3, 1.6, 6, acc, { x: s * 15, y: 10.6 }, 0.6))
  g.add(knob(1.4, 1.2, acc, 0, 2, 11.9))
  return g
}

function slowCooker(p: string[]) {
  const [body, pot, acc] = p
  const g = new THREE.Group()
  const inner = new THREE.Group()
  inner.add(cyl(13, 12, 13, body, {}, 36))
  inner.add(cup(12.2, 11.4, 14.2, 0.9, pot, { y: 1 }))
  inner.add(liquid(11.3, 12.5, '#c9733e'))
  inner.add(ball(1.6, '#ff9a4d', { x: 4, y: 12.4, z: 2 }, [1, 0.5, 1]))
  inner.add(ball(1.4, '#f3e6c8', { x: -3, y: 12.4, z: -3 }, [1, 0.5, 1]))
  inner.add(clearDeep(dome(12, 3.6, GLASS, { y: 15.25 }), GLASS, 0.35))
  inner.add(torus(12, 0.35, M.silver, { y: 15.3, rx: PI / 2 }))
  inner.add(puck(2, 1.6, M.black, { y: 18.6 }))
  inner.scale.z = 0.78
  g.add(inner)
  for (const s of [-1, 1]) g.add(rbox(3, 2, 6, acc, { x: s * 13.8, y: 9.5 }, 0.7))
  g.add(rbox(9, 5, 1.2, acc, { y: 3, z: 9.6 }, 0.6))
  g.add(knob(1.4, 1.2, M.black, 0, 5.5, 10.2))
  g.add(lamp('#ff6b4a', 3.4, 5.5, 10.5, 0.35))
  return g
}

function electricSteamer(p: string[]) {
  const [base, rim, acc] = p
  const g = new THREE.Group()
  g.add(cyl(12.5, 13.5, 8, base, {}, 36))
  g.add(clearDeep(rbox(6, 3, 1, WATER, { y: 2, z: 12.9 }, 0.4), WATER, 0.6))
  g.add(knob(1.4, 1.2, acc, 6, 4.5, 12.6))
  g.add(puck(12.8, 1, acc, { y: 7.8 }))
  // 两层透明蒸格
  const r = rng(11)
  for (let i = 0; i < 2; i++) {
    const y0 = 8.8 + i * 8.7
    g.add(clearDeep(cup(12.5, 12.2, 8.6, 0.4, GLASS, { y: y0 }), GLASS, 0.35))
    g.add(torus(12.5, 0.45, rim, { y: y0 + 8.3, rx: PI / 2 }))
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2 + r()
      const rr = k === 0 ? 0 : 6.5
      const x = k === 0 ? 0 : Math.cos(a) * rr
      const z = k === 0 ? 0 : Math.sin(a) * rr
      if (i === 0) g.add(ball(2.6, k % 2 ? '#ffd34d' : '#c9733e', { x, y: y0 + 2.2, z }, [1, 0.7, 1]))
      else {
        g.add(ball(2.4, '#fffaf0', { x, y: y0 + 1.9, z }, [1, 0.62, 1]))
        g.add(noOutlineDeep(ball(0.6, '#f4e7c8', { x, y: y0 + 3.3, z })))
      }
    }
  }
  const top = 8.8 + 2 * 8.7
  g.add(torus(12.5, 0.45, rim, { y: top + 0.2, rx: PI / 2 }))
  g.add(clearDeep(dome(12.4, 4, GLASS, { y: top + 0.1 }), GLASS, 0.35))
  g.add(puck(2, 1.4, rim, { y: top + 3.8 }))
  return g
}

/** 台式小烤箱：真开口 + 玻璃门，能看到里面的烤网、加热管和吐司 */
function toasterOven(p: string[]) {
  const [body, panel, acc] = p
  const F = 1.2
  const W = 40
  const H = 24
  const D = 30
  const T = 1.2
  const cx = -5.5
  const g = new THREE.Group()
  g.add(feet(34, 24, F, M.black))
  const sh = shell(W, H, D, T, body, { front: [{ kind: 'rect', x: cx, y: 3, w: 24, h: 15, r: 1 }] })
  sh.position.y = F
  g.add(sh)
  // 炉腔：后壁衬板、隔板、碎屑盘
  g.add(rbox(26, H - 2 * T - 0.4, 0.4, CAVITY, { x: cx, y: F + T + 0.2, z: -D / 2 + T + 0.5 }, 0.1))
  g.add(rbox(0.8, H - 2 * T + 0.4, D - 2 * T + 0.4, shade(body, -0.1), { x: cx + 12.9, y: F + T - 0.2 }, 0.2))
  g.add(rbox(23, 0.5, 25, M.gray, { x: cx, y: F + T + 0.3 }, 0.2))
  // 加热管（上下各两根）
  for (const y of [F + 3.6, F + H - 4])
    for (const z of [-6, 5]) g.add(lit(hcyl(0.45, 0.45, 26, HEAT, cx, y, z), HEAT, 0.45))
  // 烤网
  const ry = F + 8
  for (const z of [-11, 11]) g.add(hcyl(0.25, 0.25, 26, M.silver, cx, ry, z))
  for (let i = 0; i < 8; i++) g.add(hcyl(0.2, 0.2, 22, M.silver, cx - 10.5 + i * 3, ry, 0, 'z', 8))
  // 吐司
  g.add(rbox(10, 1.4, 9.6, CRUST, { x: cx - 4, y: ry + 0.2 }, 0.6))
  g.add(noOutlineDeep(rbox(9, 0.4, 8.6, BREAD, { x: cx - 4, y: ry + 1.35 }, 0.2)))
  // 门：框 + 玻璃 + 横把手
  const dz = D / 2 + 0.6
  g.add(holePanel(27, 18, 0.8, panel, [{ kind: 'rect', x: 0, y: 1.6, w: 23, h: 13.6, r: 1 }], { x: cx, y: F + 1.5, z: dz }, 1.2))
  g.add(clearDeep(rbox(24, 14.6, 0.3, '#9fb7c6', { x: cx, y: F + 2.6, z: dz }, 0.1), '#9fb7c6', 0.3))
  for (const s of [-1, 1]) g.add(rbox(1, 1, 2, acc, { x: cx + s * 8, y: F + 17.5, z: dz + 1.3 }, 0.3))
  g.add(hcyl(0.6, 0.6, 20, acc, cx, F + 18, dz + 2.8))
  // 右侧操作区
  g.add(glow(5, 1.6, AMBER, { x: 13.5, y: F + 19.5, z: D / 2 + 0.4 }))
  for (const y of [F + 13, F + 6.5]) g.add(knob(2, 1.6, acc, 13.5, y, D / 2))
  g.add(lamp('#ff6b4a', 13.5, F + 3, D / 2 + 0.2, 0.4))
  return g
}

/** 蒸烤箱：整面玻璃门，炉腔内有灯光、两层烤架和烤盘 */
function steamOven(p: string[]) {
  const [body, panel, acc] = p
  const F = 1
  const W = 49
  const H = 35
  const D = 40
  const T = 1.4
  const g = new THREE.Group()
  g.add(feet(42, 32, F, M.black))
  const sh = shell(W, H, D, T, body, { front: [{ kind: 'rect', x: 0, y: 3, w: 41, h: 23, r: 1.5 }] })
  sh.position.y = F
  g.add(sh)
  g.add(lit(rbox(42, H - 2 * T - 0.4, 0.4, '#e9d8bd', { y: F + T + 0.2, z: -D / 2 + T + 0.5 }, 0.1), '#e9d8bd', 0.25))
  g.add(rbox(W - 2 * T - 0.4, 0.5, D - 2 * T - 1, '#b9bdc2', { y: F + T + 0.2 }, 0.2))
  // 侧壁导轨
  for (const s of [-1, 1]) for (const y of [F + 9, F + 17]) g.add(rbox(0.8, 0.6, D - 6, M.silver, { x: s * (W / 2 - T - 0.5), y, z: -1 }, 0.2))
  // 烤网 + 烤盘
  // 烤网、烤盘加宽到搭上两侧导轨（以前比导轨窄 1cm 悬空）
  for (const z of [-15, 13]) g.add(hcyl(0.25, 0.25, 45.2, M.silver, 0, F + 17.6, z))
  for (let i = 0; i < 10; i++) g.add(hcyl(0.2, 0.2, 28, M.silver, -18 + i * 4, F + 17.6, -1, 'z', 8))
  g.add(tray(44.8, 1.6, 30, 0.4, M.char, { y: F + 9.6, z: -1 }))
  const r = rng(5)
  for (let i = 0; i < 6; i++) g.add(ball(2.4, i % 2 ? '#c96f3b' : '#e0a050', { x: -15 + i * 6, y: F + 11.6, z: -1 + (r() - 0.5) * 10 }, [1, 0.55, 1]))
  // 门
  const dz = D / 2 + 0.7
  g.add(holePanel(47, 27, 1, panel, [{ kind: 'rect', x: 0, y: 2.4, w: 42, h: 20.6, r: 1.2 }], { y: F + 1, z: dz }, 1.5))
  g.add(clearDeep(rbox(43, 21.6, 0.3, '#5d6b78', { y: F + 2.9, z: dz }, 0.1), '#5d6b78', 0.35))
  for (const s of [-1, 1]) g.add(rbox(1.2, 1.2, 2.4, acc, { x: s * 17, y: F + 25.6, z: dz + 1.6 }, 0.3))
  g.add(hcyl(0.7, 0.7, 38, acc, 0, F + 26.2, dz + 3.4))
  // 上方控制条
  g.add(rbox(44, 5.6, 0.8, DARK, { y: F + 28.6, z: D / 2 + 0.3 }, 0.4))
  g.add(glow(10, 2.6, '#9fe7ff', { y: F + 30, z: D / 2 + 0.9 }))
  for (const x of [-17, -13, -9, 9, 13, 17]) g.add(lit(rbox(2.2, 1.2, 0.4, '#e8e8e8', { x, y: F + 30.7, z: D / 2 + 0.85 }, 0.15), '#e8e8e8', 0.3))
  return g
}

function breadMaker(p: string[]) {
  const [body, lid, acc] = p
  const g = new THREE.Group()
  g.add(feet(20, 28, 0.8, M.black))
  g.add(rbox(25, 26, 34, body, { y: 0.8 }, 4))
  g.add(rbox(23, 2, 24, lid, { y: 26.2, z: -3.5 }, 1.2))
  g.add(noOutlineDeep(rbox(13, 0.4, 9, '#3b3437', { y: 28.1, z: -4.5 }, 0.2)))
  g.add(noOutlineDeep(rbox(8, 0.3, 4, BREAD, { y: 28.25, z: -4.5 }, 0.2)))
  g.add(clearDeep(rbox(13.6, 0.3, 9.6, '#cfe6f0', { y: 28.5, z: -4.5 }, 0.1), '#cfe6f0', 0.35))
  g.add(rbox(7, 1.4, 1.6, acc, { y: 26.6, z: 8.8 }, 0.5))
  // 前上方操作面板
  g.add(rbox(20, 0.8, 6, shade(body, -0.06), { y: 26.4, z: 13 }, 0.3))
  g.add(chip(6, 2.4, LCD, -4, 26.8, 13))
  for (const x of [2.5, 5, 7.5]) g.add(chip(1.4, 1.4, x === 7.5 ? acc : '#e8e8e8', x, 26.8, 13, 0.3))
  for (let i = 0; i < 4; i++) g.add(rbox(0.6, 0.8, 14, shade(body, -0.15), { x: 12.6, y: 18 + i * 1.6, z: -4 }, 0.2))
  return g
}

function steamRiceCookerHigh(p: string[]) {
  const [body, top, acc] = p
  const g = new THREE.Group()
  g.add(rbox(27, 15, 31, body, {}, 3))
  g.add(rbox(27.4, 0.8, 31.4, acc, { y: 13.4 }, 0.4))
  g.add(rbox(26, 6.4, 30, top, { y: 14 }, 3))
  g.add(torus(8.5, 0.7, shade(top, -0.12), { y: 20.4, z: -3, rx: -PI / 2 }, PI))
  g.add(rbox(16, 0.6, 6, DARK, { y: 20.1, z: 8.5 }, 0.3))
  g.add(chip(7, 2.6, '#ffd28a', -3, 20.4, 8.5))
  for (const x of [3, 5.5]) g.add(chip(1.4, 1.4, '#e8e8e8', x, 20.4, 8.5, 0.3))
  g.add(rbox(6, 2.4, 1.6, acc, { y: 15.4, z: 15.4 }, 0.5))
  g.add(cyl(2.2, 2.4, 1.2, M.char, { y: 20, z: -8 }, 20))
  g.add(lamp('#ff6b4a', 9, 6, 15.6, 0.4))
  return g
}

function donabeRiceCooker(p: string[]) {
  const [base, clay, acc] = p
  const g = new THREE.Group()
  g.add(rbox(27, 7, 27, base, {}, 3))
  g.add(ball(11.5, clay, { y: 10.5 }, [1, 0.55, 1]))
  for (const s of [-1, 1]) g.add(torus(2, 0.7, clay, { x: s * 11.8, y: 12.2, rx: PI / 2 }))
  g.add(dome(10.8, 5, acc, { y: 14.6 }))
  g.add(cyl(10.8, 10.8, 0.4, acc, { y: 14.3 }, 32))
  g.add(noOutlineDeep(torus(8, 0.18, shade(acc, 0.2), { y: 17.6, rx: PI / 2 })))
  g.add(ball(1.6, clay, { y: 19.8 }, [1, 0.6, 1]))
  g.add(rbox(14, 4, 1, M.black, { y: 1.5, z: 13.6 }, 0.5))
  g.add(glow(4, 1.6, LCD, { x: -3, y: 2.7, z: 14.4 }))
  g.add(knob(1.1, 0.8, acc, 4, 3.5, 14.1))
  return g
}

// ---------- 料理 / 饮品家电 ----------

function blender(p: string[]) {
  const [base, lid, acc] = p
  const g = new THREE.Group()
  g.add(rbox(17, 10, 18, base, {}, 3))
  g.add(knob(2.6, 1.6, acc, 0, 5, 9))
  g.add(noOutlineDeep(lit(torus(3.3, 0.18, '#9fe7ff', { y: 5, z: 9.1 }), '#9fe7ff')))
  g.add(cyl(6, 6.5, 1.5, M.black, { y: 10 }, 24))
  g.add(clearDeep(cup(7.5, 5.5, 22, 0.5, GLASS, { y: 11.5 }), GLASS, 0.35))
  g.add(cyl(5.7, 4.9, 9, '#f28aa0', { y: 12.1 }, 24))
  g.add(puck(7.8, 2, lid, { y: 33 }))
  g.add(puck(2.5, 1.8, lid, { y: 34.6 }))
  g.add(rbox(1.8, 15, 3, lid, { x: 10.6, y: 15.5 }, 0.8))
  g.add(rbox(4.8, 1.5, 2.6, lid, { x: 8.1, y: 15.5 }, 0.5))
  g.add(rbox(3.5, 1.5, 2.6, lid, { x: 8.75, y: 29 }, 0.5))
  return g
}

function handBlender(p: string[]) {
  const [body, acc] = p
  const g = new THREE.Group()
  g.add(clearDeep(cup(5, 4.5, 15, 0.4, GLASS), GLASS, 0.35))
  g.add(clearDeep(torus(3, 0.55, GLASS, { x: 4.8, y: 8, rz: -PI / 2 }, PI), GLASS, 0.45))
  g.add(cyl(4.25, 4.1, 6, '#ffb36b', { y: 0.45 }, 24))
  g.add(cyl(2.4, 2.4, 2, M.silver, { y: 1.2 }, 20))
  g.add(cyl(1, 1, 12, M.silver, { y: 3 }, 12))
  g.add(cyl(2.8, 2.3, 15, body, { y: 14.5 }, 24))
  g.add(puck(2.9, 2.2, acc, { y: 29.2 }))
  g.add(rbox(1.6, 3.2, 0.8, acc, { y: 23, z: 2.5 }, 0.3))
  g.add(lamp('#7fe08a', 0, 27, 2.6, 0.35))
  return g
}

function standMixer(p: string[]) {
  const [body, bowlC, acc] = p
  const g = new THREE.Group()
  g.add(rbox(20, 4.5, 32, body, { z: 2 }, 2))
  g.add(rbox(11, 20, 10, body, { y: 4, z: -9 }, 4))
  g.add(rbox(12, 10.5, 30, body, { y: 22.5 }, 5))
  g.add(hcyl(3.4, 3.4, 1, acc, 0, 27.5, 15.3, 'z', 20))
  g.add(rbox(1, 1, 4, acc, { x: 6.3, y: 27, z: -9 }, 0.3))
  g.add(cyl(7, 7, 0.6, M.silver, { y: 4.4, z: 6 }, 24))
  g.add(cup(9.5, 6, 12, 0.5, bowlC, { y: 5, z: 6 }))
  g.add(ball(5, '#f3dcb0', { y: 8.3, z: 6 }, [1, 0.5, 1]))
  g.add(cyl(0.6, 0.6, 9.5, M.silver, { y: 13, z: 6 }, 10))
  for (let k = 0; k < 4; k++) g.add(torus(3, 0.14, M.silver, { y: 13, z: 6, ry: (k * PI) / 4 }, PI).rotateZ(PI))
  return g
}

function juicer(p: string[]) {
  const [body, acc, cupC] = p
  const g = new THREE.Group()
  g.add(rbox(17, 13, 20, body, { z: -1 }, 4))
  g.add(rbox(3, 2, 4, body, { y: 9, z: 10 }, 0.8))
  g.add(clearDeep(cup(7, 6.5, 12, 0.4, GLASS, { y: 13 }), GLASS, 0.35))
  g.add(cyl(3.8, 4.5, 11, '#f4f4f2', { y: 13.4 }, 16))
  g.add(cyl(5.5, 5.5, 4, '#ff9a3c', { y: 13.4 }, 20))
  g.add(cup(8, 7, 3, 0.5, acc, { y: 24.8 }))
  g.add(cyl(3, 3, 8, acc, { x: 3, y: 27 }, 20))
  g.add(cyl(2.6, 2.6, 3, cupC, { x: 3, y: 33 }, 20))
  g.add(clearDeep(cup(3.5, 3, 8, 0.3, GLASS, { z: 15 }), GLASS, 0.35))
  g.add(cyl(3, 2.7, 5, '#ff9a3c', { y: 0.3, z: 15 }, 20))
  return g
}

function pitcher(p: string[]) {
  const [lid, acc] = p
  const g = new THREE.Group()
  g.add(clearDeep(tray(22, 24, 10, 0.4, GLASS), GLASS, 0.35))
  g.add(clearDeep(rbox(21, 14, 9, WATER, { y: 0.45 }, 0.3), WATER, 0.5))
  g.add(tray(20.6, 9, 8.6, 0.4, '#f4f6f8', { y: 14.6 }))
  g.add(cyl(2.5, 2, 8, '#ffffff', { y: 8.2 }, 18))
  g.add(torus(2.4, 0.25, acc, { y: 15, rx: PI / 2 }))
  g.add(rbox(22.6, 2, 10.6, lid, { y: 23.8 }, 0.8))
  g.add(rbox(6, 0.6, 7, acc, { x: -7, y: 25.8 }, 0.25))
  g.add(lamp('#7fe08a', 3, 26.1, 2, 0.35))
  g.add(rbox(2.4, 17, 4, lid, { x: 14.4, y: 4.5 }, 1))
  for (const y of [4.5, 19]) g.add(rbox(3.4, 2.4, 4, lid, { x: 12.5, y }, 0.6))
  return g
}

function electricPot(p: string[]) {
  const [body, top, acc] = p
  const g = new THREE.Group()
  g.add(rbox(19, 1.4, 22, top, {}, 0.6))
  g.add(rbox(21, 23, 24, body, { y: 1.2 }, 6))
  g.add(rbox(20.4, 5, 23.4, top, { y: 24 }, 2.4))
  g.add(rbox(4, 3, 3, top, { y: 23.6, z: 12.6 }, 1))
  g.add(cyl(0.9, 1, 2, shade(top, -0.1), { y: 22, z: 13.2 }, 12))
  g.add(rbox(5, 0.6, 4, acc, { y: 28.6, z: 6 }, 0.3))
  g.add(chip(6, 2.4, LCD, 0, 28.6, -0.5))
  g.add(torus(7.5, 0.6, top, { y: 29.3, z: -3, rx: -PI / 2 }, PI))
  g.add(rbox(3, 14, 1, shade(body, -0.15), { y: 5, z: 11.9 }, 0.4))
  g.add(noOutlineDeep(rbox(1.8, 9, 0.6, '#a8d4f4', { y: 5.7, z: 12.4 }, 0.2)))
  g.add(lamp('#ff6b4a', 5, 3, 12, 0.4))
  return g
}

function iceMaker(p: string[]) {
  const [body, lid, acc] = p
  const F = 0.8
  const W = 24
  const H = 30
  const D = 33
  const g = new THREE.Group()
  g.add(feet(19, 27, F, M.black))
  const sh = shell(W, H, D, 1.2, body, { top: false })
  sh.position.y = F
  g.add(sh)
  const fy = F + H - 10
  g.add(rbox(W - 2.8, 0.8, D - 2.8, '#dfe8ee', { y: fy }, 0.3))
  const r = rng(21)
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 16
    const z = (r() - 0.5) * 22
    const y = fy + 0.8 + (r() < 0.4 ? 2.1 : 0)
    g.add(rbox(2.2, 2.2, 2.2, '#e6f6ff', { x, y, z, ry: r() * PI }, 0.5))
  }
  // 翻盖：框 + 玻璃
  const ly = F + H + 0.55
  const lp = holePanel(W, D, 1, lid, [{ kind: 'rect', x: 0, y: 4, w: W - 6, h: D - 12, r: 1.5 }], { y: ly, z: D / 2, rx: -PI / 2 }, 2)
  g.add(lp)
  g.add(clearDeep(rbox(W - 5, 0.3, D - 11, '#d6f0ff', { y: ly - 0.15, z: 2 }, 0.1), '#d6f0ff', 0.35))
  g.add(glow(6, 2, '#9fe0ff', { x: -4, y: F + H - 5, z: D / 2 + 0.4 }))
  for (const x of [3, 6]) g.add(ball(0.8, acc, { x, y: F + H - 4, z: D / 2 + 0.2 }))
  g.add(lamp('#7fe08a', 8.5, F + H - 4, D / 2 + 0.2, 0.4))
  return g
}

function yogurtMaker(p: string[]) {
  const [body, lid, acc] = p
  const g = new THREE.Group()
  g.add(cyl(9, 9.5, 7, body, {}, 32))
  g.add(cup(6.5, 6.5, 5, 0.4, '#fffaf2', { y: 6.5 }))
  g.add(liquid(6.1, 11, '#fff7e6'))
  g.add(clearDeep(dome(9, 7.5, lid, { y: 7 }), lid))
  g.add(puck(1.6, 1.2, acc, { y: 14.3 }))
  g.add(glow(4, 1.6, LCD, { y: 2.6, z: 9.4 }))
  return g
}

function coffeeGrinder(p: string[]) {
  const [body, acc, lid] = p
  const g = new THREE.Group()
  g.add(rbox(13, 3, 19, body, {}, 1.2))
  g.add(rbox(12, 21, 12, body, { y: 2.5, z: -3.5 }, 2.5))
  g.add(torus(5, 0.6, acc, { y: 24, z: -3.5, rx: PI / 2 }))
  g.add(clearDeep(cup(5.5, 3.5, 9, 0.3, '#e8d9c3', { y: 23.4, z: -3.5 }), '#e8d9c3'))
  g.add(cyl(4.8, 3.3, 5, '#5a3622', { y: 23.8, z: -3.5 }, 20))
  const r = rng(9)
  for (let i = 0; i < 10; i++) g.add(ball(0.6, '#6e4128', { x: (r() - 0.5) * 6, y: 29, z: -3.5 + (r() - 0.5) * 6 }, [1, 0.7, 0.8]))
  g.add(puck(5.7, 1.4, lid, { y: 32.2, z: -3.5 }))
  g.add(rbox(3, 2, 3, M.silver, { y: 12, z: 3.5 }, 0.5))
  g.add(tray(8, 7, 6, 0.4, acc, { y: 3, z: 6 }))
  g.add(rbox(7, 3, 5, '#5a3622', { y: 3.4, z: 6 }, 0.3))
  g.add(ball(0.8, acc, { x: 3.5, y: 19, z: 2.6 }))
  return g
}

function handGrinder(p: string[]) {
  const [wood, metal, knobC] = p
  const g = new THREE.Group()
  g.add(rbox(10, 10, 10, wood, {}, 0.8))
  g.add(rbox(7, 3.5, 0.6, shade(wood, -0.08), { y: 1.5, z: 5.2 }, 0.2))
  g.add(ball(0.6, metal, { y: 3.25, z: 5.8 }))
  g.add(cup(4.8, 3.5, 3, 0.4, metal, { y: 10 }))
  for (let i = 0; i < 6; i++) g.add(ball(0.6, '#6e4128', { x: Math.cos(i) * 2, y: 10.9, z: Math.sin(i) * 2 }, [1, 0.7, 0.8]))
  g.add(cyl(0.4, 0.4, 4.6, metal, { y: 10.4 }, 10))
  g.add(rbox(8.4, 0.6, 1.2, metal, { x: 3.8, y: 14.6 }, 0.25))
  g.add(cyl(0.9, 0.9, 3, knobC, { x: 7.4, y: 15.2 }, 14))
  g.add(ball(0.9, knobC, { x: 7.4, y: 18.2 }))
  return g
}

function dishwasher(p: string[]) {
  const [body, door, acc] = p
  const F = 1
  const W = 42
  const H = 44
  const D = 37
  const g = new THREE.Group()
  g.add(feet(36, 30, F, M.black))
  const sh = shell(W, H, D, 1.4, body, { front: [{ kind: 'rect', x: 0, y: 13, w: 25, h: 15, r: 2 }] })
  sh.position.y = F
  g.add(sh)
  g.add(rbox(W - 3.6, H - 3.6, 0.4, '#c9ced4', { y: F + 1.6, z: -D / 2 + 2 }, 0.1))
  // 碗篮和盘子
  const by = F + 10
  // 碗篮架在两侧导轨上（以前碗篮悬在半空）
  for (const s of [-1, 1]) g.add(rbox(0.8, 0.6, D - 6, M.silver, { x: s * (W / 2 - 1.9), y: by - 0.5, z: -0.5 }, 0.2))
  g.add(tray(38.2, 3, 30, 0.5, M.silver, { y: by }))
  const cols = ['#fbf7f1', '#ffd6e0', '#a8d4f4', '#fbf7f1', '#a6e3cc', '#fbf7f1']
  for (let i = 0; i < 6; i++) g.add(standDisc(8, 0.6, cols[i], -9 + i * 2.6, by + 8.6, -2, -0.15))
  g.add(cup(4.5, 2.8, 4.5, 0.4, '#fbf7f1', { x: 11, y: by + 5.2, z: 4, rx: PI }))
  g.add(cup(3, 2.6, 6, 0.3, '#ffe08f', { x: 11, y: by + 6.6, z: -6, rx: PI }))
  // 门
  const dz = D / 2 + 0.6
  g.add(holePanel(40, 34, 1, door, [{ kind: 'rect', x: 0, y: 11.2, w: 23, h: 13.6, r: 2 }], { y: F + 1.8, z: dz }, 2))
  g.add(clearDeep(rbox(24, 14.6, 0.3, '#7d93a6', { y: F + 12.5, z: dz }, 0.1), '#7d93a6', 0.35))
  g.add(rbox(14, 1.6, 1.4, acc, { y: F + 33, z: dz + 0.9 }, 0.5))
  // 控制条
  g.add(rbox(36, 5, 0.8, DARK, { y: F + 37.4, z: D / 2 + 0.3 }, 0.4))
  g.add(glow(7, 2.2, '#9fe7ff', { x: -10, y: F + 38.8, z: D / 2 + 0.9 }))
  for (const x of [2, 6, 10, 14]) g.add(lit(rbox(2.2, 1.2, 0.4, '#e8e8e8', { x, y: F + 39.3, z: D / 2 + 0.85 }, 0.15), '#e8e8e8', 0.3))
  return g
}

// ---------- 锅具 ----------

function castIronPot(r: number) {
  return (p: string[]) => {
    const [body, knobC, band] = p
    const h = r * 0.82
    const g = new THREE.Group()
    g.add(cup(r, r - 0.6, h, 1, body))
    g.add(torus(r - 0.25, 0.3, band, { y: 1.6, rx: PI / 2 }))
    for (const s of [-1, 1]) g.add(torus(1.9, 0.7, body, { x: s * (r + 1.2), y: h - 2.6, rx: PI / 2 }))
    g.add(puck(r + 0.4, 1.6, body, { y: h - 0.3 }))
    g.add(dome(r * 0.95, r * 0.22, body, { y: h + 1.1 }))
    g.add(cyl(1.6, 2.2, 1.8, knobC, { y: h + 1.1 + r * 0.22 - 0.3 }, 18))
    return g
  }
}

function yukihira(r: number) {
  return (p: string[]) => {
    const [metal, wood] = p
    const h = r * 0.82
    const L = r * 1.5
    const g = new THREE.Group()
    g.add(cup(r, r - 0.4, h, 0.5, metal))
    // 槌目
    for (const [y, n, o] of [
      [h * 0.3, 18, 0],
      [h * 0.62, 18, 0.17],
    ])
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2 + o
        g.add(noOutlineDeep(ball(0.6, shade(metal, 0.08), { x: Math.cos(a) * (r - 0.2), y, z: Math.sin(a) * (r - 0.2) }, [0.5, 1, 1]).rotateY(-a)))
      }
    for (const s of [-1, 1]) g.add(ball(1, metal, { y: h - 0.4, z: s * (r - 0.1) }, [1, 0.4, 1.3]))
    g.add(hcyl(1, 1.1, 3, metal, r + 1.2, h - 2, 0))
    g.add(hcyl(1.1, 1.4, L, wood, r + 2.6 + L / 2, h - 2, 0))
    return g
  }
}

function wok(p: string[]) {
  const [iron, wood] = p
  const r = 17
  const g = new THREE.Group()
  g.add(cup(r, 6, 9, 0.5, iron))
  g.add(torus(2.2, 0.5, iron, { x: -r - 1.6, y: 8.2, rx: PI / 2 }))
  const arm = new THREE.Group()
  arm.add(hcyl(1, 1, 8, M.gray, 4, 0, 0))
  arm.add(hcyl(1.4, 1.6, 16, wood, 15.5, 0, 0))
  arm.add(torus(0.9, 0.25, M.silver, { x: 24.5, y: 0, z: 0 }))
  arm.position.set(r - 0.8, 8, 0)
  arm.rotation.z = 0.16
  g.add(arm)
  return g
}

function tamagoyaki(p: string[]) {
  const [pan, wood] = p
  const g = new THREE.Group()
  g.add(tray(13, 3.2, 18, 0.5, pan, {}, 0.3))
  g.add(rbox(9.6, 3, 6.5, '#ffd34d', { y: 0.5, z: 2 }, 1.4))
  for (const x of [-2.4, 0, 2.4]) g.add(noOutlineDeep(rbox(0.5, 0.3, 6.6, '#e8a93a', { x, y: 3.25, z: 2 }, 0.1)))
  const arm = new THREE.Group()
  arm.add(hcyl(0.8, 0.9, 3, M.gray, 1.5, 0, 0))
  arm.add(hcyl(1.1, 1.3, 15, wood, 10.5, 0, 0))
  arm.position.set(6.5, 2.2, 0)
  arm.rotation.z = 0.12
  g.add(arm)
  return g
}

function stockPot(r: number) {
  return (p: string[]) => {
    const [metal, grip, band] = p
    const h = r * 1.6
    const g = new THREE.Group()
    g.add(cup(r, r, h, 0.5, metal))
    g.add(torus(r + 0.02, 0.25, band, { y: 1, rx: PI / 2 }))
    for (const s of [-1, 1]) g.add(rbox(3.4, 1.2, 6, grip, { x: s * (r + 1.2), y: h - 3.2 }, 0.5))
    g.add(torus(r, 0.35, M.silver, { y: h + 0.15, rx: PI / 2 }))
    g.add(clearDeep(dome(r - 0.1, r * 0.2, GLASS, { y: h + 0.05 }), GLASS, 0.35))
    g.add(puck(2, 1.8, grip, { y: h + r * 0.2 - 0.4 }))
    return g
  }
}

function seiro(p: string[]) {
  const [bamboo, band] = p
  const r = 13.5
  const g = new THREE.Group()
  for (let i = 0; i < 2; i++) {
    const y0 = i * 7.1
    g.add(cup(r, r, 7, 0.9, bamboo, { y: y0 }))
    for (const dy of [1.4, 5.4]) g.add(torus(r + 0.05, 0.32, band, { y: y0 + dy, rx: PI / 2 }))
  }
  g.add(cyl(r + 0.3, r + 0.3, 2, bamboo, { y: 14.2 }, 36))
  g.add(torus(r + 0.35, 0.32, band, { y: 15.2, rx: PI / 2 }))
  g.add(dome(r, 3.5, shade(bamboo, 0.05), { y: 16.2 }))
  for (const rr of [4, 8, 11]) g.add(noOutlineDeep(torus(rr, 0.15, shade(bamboo, -0.15), { y: 16.2 + 3.5 * Math.sqrt(1 - (rr / r) ** 2), rx: PI / 2 })))
  return g
}

function bakingSet(p: string[]) {
  const [bowl, wood, acc] = p
  const g = new THREE.Group()
  // 烤盘 + 曲奇
  g.add(tray(22, 1.6, 16, 0.5, '#b9bfc4', { x: -8, z: -4 }, 0.3))
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.add(puck(1.8, 0.8, (i + j) % 3 ? '#d9a35f' : '#8a5a3a', { x: -15.5 + i * 5, y: 0.55, z: -8.5 + j * 4.5 }))
  // 打蛋盆 + 打蛋器
  g.add(cup(8, 4.8, 7, 0.4, bowl, { x: 11, z: -4 }))
  g.add(liquid(6.8, 4.5, '#fff1c8', 11, -4))
  const wh = new THREE.Group()
  wh.add(cyl(0.7, 0.7, 7, acc, { y: 4.5 }, 12))
  for (let k = 0; k < 3; k++) wh.add(torus(1.8, 0.1, M.silver, { y: 2.4, ry: (k * PI) / 3 }, PI).rotateZ(PI))
  wh.position.set(10, 4.2, -4)
  wh.rotation.z = -0.6
  g.add(wh)
  // 擀面杖 + 饼干模
  g.add(hcyl(1.8, 1.8, 18, wood, -2, 1.8, 8))
  for (const s of [-1, 1]) g.add(hcyl(0.9, 0.9, 4, wood, -2 + s * 11, 1.8, 8))
  g.add(torus(2, 0.3, acc, { x: 12, y: 0.3, z: 8, rx: PI / 2 }))
  g.add(torus(1.5, 0.3, M.silver, { x: 16.5, y: 0.3, z: 9, rx: PI / 2 }))
  return g
}

// ---------- 厨房用品 ----------

function knifeBlock(p: string[]) {
  const [wood, handleC] = p
  const g = new THREE.Group()
  const blk = new THREE.Group()
  blk.add(rbox(11, 22, 14, wood, {}, 1.2))
  const slots: [number, number][] = [
    [-3.4, 3.2],
    [0, 3.2],
    [3.4, 3.2],
    [-2, -2.4],
    [2, -2.4],
  ]
  for (const [x, z] of slots) {
    blk.add(rbox(2.2, 0.8, 3, M.silver, { x, y: 21.8, z }, 0.3))
    blk.add(rbox(1.8, 9, 2.6, handleC, { x, y: 22.4, z }, 0.7))
    for (const y of [25, 28.5]) blk.add(noOutlineDeep(ball(0.3, M.silver, { x: x + 0.9, y, z })))
  }
  blk.add(cyl(1, 1, 7, M.silver, { x: 0, y: 21.8, z: -5.6 }, 12))
  blk.add(ball(1.2, M.silver, { x: 0, y: 29.4, z: -5.6 }))
  const th = 0.32
  blk.rotation.x = -th
  blk.position.y = 7 * Math.sin(th)
  g.add(blk)
  g.add(rbox(11, 4.4, 3, wood, { z: 5.2 }, 0.6))
  return g
}

function dishRack(p: string[]) {
  const [wire, trayC, acc] = p
  const g = new THREE.Group()
  g.add(tray(44, 2, 30, 0.8, trayC, {}, 0.5))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.35, 0.35, 12.4, wire, { x: sx * 21, y: 1.6, z: sz * 14 }, 8))
  for (const y of [2.4, 13.6]) {
    for (const s of [-1, 1]) {
      g.add(hcyl(0.3, 0.3, 42, wire, 0, y, s * 14, 'x', 8))
      g.add(hcyl(0.3, 0.3, 28, wire, s * 21, y, 0, 'z', 8))
    }
  }
  for (let i = 0; i < 9; i++) g.add(hcyl(0.25, 0.25, 28, wire, -20 + i * 5, 2.4, 0, 'z', 6))
  // 盘子
  const cols = [C.white, acc, C.white, C.sky, C.white]
  for (let i = 0; i < 5; i++) {
    const x = -17 + i * 3.2
    g.add(standDisc(9, 0.8, cols[i], x, 11.7, -4, -0.12))
    for (const z of [-11, 3]) g.add(cyl(0.22, 0.22, 7, wire, { x: x + 1.6, y: 2.6, z }, 6))
  }
  // 倒扣的碗、杯
  const b1 = cup(6, 3.4, 5.5, 0.4, C.white, { x: 7, y: 2.75 + 5.5, z: 5, rx: PI })
  g.add(b1)
  g.add(cup(5, 3, 4.5, 0.4, acc, { x: 7, y: 2.75 + 4.5, z: -7, rx: PI }))
  // 筷筒
  g.add(cup(3.2, 3, 11, 0.3, wire, { x: 17, y: 2.75, z: 8 }))
  for (let i = 0; i < 4; i++) g.add(cyl(0.25, 0.2, 16, i % 2 ? '#bf8b5e' : '#6e4f37', { x: 16 + (i % 2) * 1.6, y: 3.2, z: 7 + Math.floor(i / 2) * 1.6 }, 6))
  g.add(cyl(0.4, 0.4, 13, acc, { x: 18.3, y: 3.2, z: 9 }, 8))
  g.add(rbox(3, 0.6, 4, acc, { x: 18.3, y: 16, z: 9 }, 0.25))
  return g
}

function kitchenScale(p: string[]) {
  const [body, top, acc] = p
  const g = new THREE.Group()
  g.add(rbox(17, 2, 21, body, {}, 1))
  g.add(rbox(16, 0.6, 15.5, top, { y: 1.8, z: -2.3 }, 0.3))
  g.add(rbox(10, 0.6, 3, DARK, { y: 1.7, z: 7.5 }, 0.2))
  g.add(chip(6, 1.6, LCD, 0, 1.9, 7.5))
  for (const s of [-1, 1]) g.add(ball(0.6, acc, { x: s * 6.5, y: 2, z: 7.8 }))
  g.add(cup(8, 5, 6, 0.4, acc, { y: 2.4, z: -2.3 }))
  g.add(liquid(6, 5.2, '#fffaf2', 0, -2.3))
  return g
}

function foodContainers(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  g.add(clearDeep(tray(22, 7, 16, 0.4, GLASS), GLASS, 0.35))
  g.add(rbox(10, 3.5, 14.8, RICE, { x: -5.3, y: 0.45 }, 0.8))
  for (let i = 0; i < 6; i++) g.add(ball(1.6, i % 2 ? '#78c47a' : '#4f9e5b', { x: 3 + (i % 3) * 2.8, y: 2.2, z: -3 + Math.floor(i / 3) * 5 }, [1, 0.6, 1]))
  g.add(rbox(22.4, 1.2, 16.4, a, { y: 7 }, 0.5))
  g.add(clearDeep(tray(18, 5.5, 13, 0.4, GLASS, { y: 8.25 }), GLASS, 0.35))
  for (let i = 0; i < 5; i++) g.add(cyl(0.8, 0.8, 4, '#ff9a4d', { x: -6 + i * 3, y: 8.7, z: -2 + (i % 2) * 3 }, 10))
  g.add(rbox(18.4, 1.1, 13.4, b, { y: 13.75 }, 0.5))
  g.add(clearDeep(tray(12, 4.5, 9, 0.4, GLASS, { y: 14.9 }), GLASS, 0.35))
  g.add(rbox(10.8, 2, 7.8, '#ffe08f', { y: 15.35 }, 0.5))
  g.add(rbox(12.4, 1, 9.4, c, { y: 19.3 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(1.2, 1.6, 4, a, { x: s * 11.4, y: 6.2 }, 0.3))
  return g
}

function riceBin(p: string[]) {
  const [body, acc, lid] = p
  const g = new THREE.Group()
  g.add(rbox(20, 40, 38, body, {}, 2))
  g.add(rbox(19, 1.8, 28, lid, { y: 39.6, z: -4 }, 0.8))
  g.add(rbox(6, 0.6, 1.6, shade(lid, -0.15), { y: 41.2, z: 8 }, 0.25))
  g.add(rbox(12, 18, 0.6, shade(body, -0.1), { y: 17, z: 19.2 }, 0.4))
  g.add(noOutlineDeep(rbox(10.6, 10, 0.4, RICE, { y: 17.7, z: 19.6 }, 0.2)))
  g.add(clearDeep(rbox(11, 16.6, 0.3, '#dfeff8', { y: 17.7, z: 19.95 }, 0.1), '#dfeff8', 0.35))
  g.add(rbox(16, 10, 2, acc, { y: 2.5, z: 19.6 }, 0.8))
  g.add(rbox(8, 1.4, 1, shade(acc, -0.15), { y: 9.5, z: 21 }, 0.4))
  g.add(rbox(8, 2.4, 6, acc, { y: 39.4, z: 15 }, 0.8))
  return g
}

function oilBottles(p: string[]) {
  const [cap, trayC] = p
  const g = new THREE.Group()
  g.add(rbox(15, 1, 8.5, trayC, {}, 0.4))
  const fill = ['#e8b83a', '#4a2a1a']
  for (let i = 0; i < 2; i++) {
    const x = i ? 3.6 : -3.6
    g.add(clearDeep(cyl(2.8, 3, 12, GLASS, { x, y: 1 }, 24), GLASS, 0.35))
    g.add(cyl(2.5, 2.7, 8, fill[i], { x, y: 1.2 }, 24))
    g.add(clearDeep(cyl(1, 2.8, 3, GLASS, { x, y: 13 }, 24), GLASS, 0.35))
    g.add(clearDeep(cyl(1, 1, 1.4, GLASS, { x, y: 16 }, 16), GLASS, 0.35))
    g.add(cyl(1.15, 1.15, 1.5, cap, { x, y: 17.2 }, 16))
    const sp = cyl(0.3, 0.4, 4, M.silver, {}, 8)
    sp.position.set(x + 1, 20, 0)
    sp.rotation.z = -0.6
    g.add(sp)
  }
  return g
}

function paperTowel(p: string[]) {
  const [base, roll, acc] = p
  const g = new THREE.Group()
  g.add(puck(7.5, 1.6, base))
  g.add(cyl(0.7, 0.7, 29.6, base, { y: 1.4 }, 10))
  g.add(ball(1.2, acc, { y: 31.6 }))
  g.add(cyl(6, 6, 26, roll, { y: 1.8 }, 32))
  g.add(noOutlineDeep(cyl(2, 2, 0.3, '#c9a77c', { y: 27.7 }, 16)))
  g.add(rbox(7, 9, 0.3, roll, { x: 0, y: 10, z: 6.1 }, 0.1))
  return g
}

function spiceJars(p: string[]) {
  const [trayC, lid, label] = p
  const g = new THREE.Group()
  g.add(tray(25, 2.4, 10, 0.8, trayC, {}, 0.4))
  const fill = ['#c0392b', '#e3b549', '#7fa65a', '#a8683a', '#f5f0e6']
  for (let i = 0; i < 5; i++) {
    const x = -9.6 + i * 4.8
    g.add(clearDeep(cyl(2.2, 2.2, 7, GLASS, { x, y: 0.8 }, 20), GLASS, 0.35))
    g.add(cyl(2, 2, 4 + (i % 3) * 0.8, fill[i], { x, y: 0.9 }, 20))
    g.add(cyl(2.26, 2.26, 2, label, { x, y: 2.6 }, 20))
    g.add(puck(2.35, 1.4, lid, { x, y: 7.6 }))
  }
  return g
}

// ---------- 夏天的桌面小物 ----------

/** 电蚊拍本体：在 xy 平面里，手柄底端在原点，拍面朝 +y；厚度沿 z 居中 */
function racket(body: string, mesh: string, acc: string) {
  const g = new THREE.Group()
  g.add(rbox(3.2, 17, 2.6, body, {}, 1.2))
  g.add(rbox(1.4, 2.6, 0.8, acc, { y: 9, z: 1.3 }, 0.3))
  g.add(lamp('#ff5a4f', 0, 13.5, 1.25, 0.35))
  g.add(rbox(4, 3, 2.2, body, { y: 16.5 }, 0.9))
  const hy = 19
  g.add(holePanel(18, 22, 1.6, body, [{ kind: 'rect', x: 0, y: 1.4, w: 15, h: 19.2, r: 4 }], { y: hy }, 5.5))
  g.add(holePanel(15.8, 20, 0.3, mesh, gridHoles(15.8, 20, 4.3, 1, 1.45, 0.9), { y: hy + 1 }, 4.3))
  return g
}

function zapperFlat(p: string[]) {
  const [body, mesh, acc] = p
  const g = new THREE.Group()
  const r = racket(body, mesh, acc)
  r.rotation.set(-PI / 2, 0, -PI / 2)
  r.position.y = 1.3
  g.add(r)
  return g
}

function zapperStand(p: string[]) {
  const [body, mesh, acc] = p
  const g = new THREE.Group()
  g.add(rbox(10, 2.5, 9, body, {}, 1.2))
  g.add(rbox(5, 5, 4.4, shade(body, -0.06), { y: 2.3 }, 1))
  g.add(lamp('#7fe08a', 3.4, 1.4, 4.5, 0.35))
  const r = racket(body, mesh, acc)
  r.position.y = 3
  g.add(r)
  return g
}

function mosquitoCoil(p: string[]) {
  const [dish, coil] = p
  const g = new THREE.Group()
  g.add(cup(7.5, 6.8, 2.6, 0.4, dish))
  g.add(cyl(0.25, 0.25, 2.4, M.silver, { y: 0.4 }, 6))
  // 螺旋线香
  const pts: THREE.Vector3[] = []
  const turns = 4
  for (let i = 0; i <= 160; i++) {
    const t = i / 160
    const a = t * turns * PI * 2
    const rr = 1 + 5 * t
    pts.push(new THREE.Vector3(Math.cos(a) * rr, 0.9, Math.sin(a) * rr))
  }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.3, 6, false), toon(coil))
  tube.scale.y = 1.4
  tube.castShadow = true
  g.add(tube)
  // 燃烧端（末端在 +x 方向）：灰烬 + 火点
  const end = pts[pts.length - 1]
  g.add(noOutlineDeep(ball(0.36, '#d9d4cc', { x: end.x, y: 0.9, z: end.z })))
  g.add(lamp('#ff5a2a', end.x - 0.1, 1.15, end.z, 0.25))
  return g
}

function liquidRepellent(p: string[]) {
  const [body, acc] = p
  const g = new THREE.Group()
  g.add(clearDeep(rbox(5, 6, 3.4, '#e6f4fb', {}, 0.8), '#e6f4fb'))
  g.add(rbox(4.4, 3.6, 2.8, '#7fc6ea', { y: 0.3 }, 0.6))
  g.add(cyl(1, 1, 1.2, M.white, { y: 5.9 }, 12))
  g.add(rbox(6.6, 6.4, 4.6, body, { y: 6.8 }, 1.2))
  for (let i = 0; i < 3; i++) g.add(rbox(3.6, 0.4, 0.6, shade(body, -0.2), { y: 13.2, z: -1 + i, }, 0.15))
  g.add(lamp('#ff7a45', 2.2, 9.5, 2.35, 0.35))
  g.add(rbox(2.2, 2.2, 0.4, acc, { x: -1, y: 8.5, z: 2.4 }, 0.3))
  return g
}

function bugSpray(p: string[]) {
  const [body, cap, band] = p
  const g = new THREE.Group()
  g.add(cyl(3.3, 3.3, 16, body, {}, 28))
  g.add(cyl(3.36, 3.36, 6, band, { y: 6 }, 28))
  g.add(dome(3.3, 1.6, M.silver, { y: 16 }))
  g.add(cyl(1, 1.2, 1.4, M.silver, { y: 17.2 }, 12))
  g.add(cyl(3.2, 3.3, 5, cap, { y: 17.8 }, 28))
  g.add(dome(3.2, 1.2, cap, { y: 22.8 }))
  return g
}

function flySwatter(p: string[]) {
  const [head, handleC] = p
  const g = new THREE.Group()
  const s = new THREE.Group()
  s.add(cyl(0.5, 0.5, 32, handleC, {}, 10))
  s.add(cyl(0.8, 0.8, 8, handleC, {}, 12))
  s.add(holePanel(11, 13, 0.4, head, gridHoles(11, 13, 2, 0.8, 1.3, 0.7), { y: 31.5 }, 2))
  s.rotation.set(-PI / 2, 0, -PI / 2)
  s.position.y = 0.8
  g.add(s)
  return g
}

// ---------- 配色 ----------

const APP: Pal3[] = [
  ['modern', M.white, M.char, M.silver],
  ['modern', M.black, M.char, M.silver],
  ['nordic', N.white, N.oak, N.sage],
  ['cute', C.mint, C.white, C.pink],
  ['retro', R.cream, R.teal, R.orange],
]
const APP2: Pal3[] = [
  ['modern', M.black, M.char, M.silver],
  ['modern', M.white, M.light, M.char],
  ['nordic', N.linen, N.gray, N.oak],
  ['cute', C.pink, C.white, C.lemon],
  ['retro', R.mustard, R.cream, R.caramel],
]
const POT: Pal3[] = [
  ['retro', R.red, M.black, '#7a2a20'],
  ['nordic', N.blue, M.silver, '#5c7088'],
  ['nordic', N.sage, N.oak, '#6f8a6a'],
  ['industrial', I.iron, I.steel, '#1f1f20'],
  ['cute', C.pink, C.white, '#e98fa6'],
]
const PAN: Pal3[] = [
  ['modern', M.silver, M.walnut, M.char],
  ['japanese', '#d8d4cc', J.wood, J.sumi],
  ['industrial', I.steel, I.walnut, I.iron],
  ['retro', COPPER, R.caramel, R.cream],
]
const STOCK: Pal3[] = [
  ['modern', M.silver, M.black, M.char],
  ['industrial', I.steel, I.iron, I.walnut],
  ['nordic', N.white, N.oak, N.blue],
  ['cute', C.sky, C.white, C.pink],
]

const steam = (x: number, y: number, z: number, scale = 1): Fx => ({ kind: 'steam', x, y, z, scale })

export const PROPS_MORE: AssetDef[] = [
  // —— 加热家电 ——
  def({ id: 'prop-air-fryer', name: '空气炸锅', sizeLabel: '大（方形）', w: 28, d: 36.5, h: 32, pals: APP2, build: airFryerSquare }),
  def({ id: 'prop-air-fryer-s', name: '空气炸锅', sizeLabel: '小（圆形）', w: 23, d: 27.5, h: 28.5, pals: APP, build: airFryerRound }),
  def({
    id: 'prop-pressure-cooker',
    name: '电压力锅',
    w: 32,
    d: 28.5,
    h: 29,
    pals: [
      ['modern', M.silver, M.black, M.char],
      ['modern', M.black, M.char, M.silver],
      ['nordic', N.white, N.gray, N.oak],
      ['cute', C.white, C.pink, C.sky],
      ['retro', R.cream, R.red, R.caramel],
    ],
    build: pressureCooker,
    fx: [steam(-6.5, 28.8, -0.3, 0.8)],
  }),
  def({
    id: 'prop-ih-cooktop',
    name: 'IH 电磁炉',
    w: 29,
    d: 36.5,
    h: 5.5,
    pals: [
      ['modern', M.white, M.black, '#ff9a5a'],
      ['modern', M.char, M.black, '#ff9a5a'],
      ['nordic', N.linen, '#4a4c50', N.mustard],
      ['cute', C.pink, '#4a4c50', C.lemon],
    ],
    build: ihCooktop,
  }),
  def({
    id: 'prop-cassette-stove',
    name: '卡式炉',
    w: 34,
    d: 30.5,
    h: 10.5,
    styles: ['modern', 'retro', 'industrial', 'nordic'],
    pals: [
      ['modern', M.white, M.char, M.black],
      ['retro', R.cream, R.orange, M.black],
      ['industrial', I.iron, I.rust, I.steel],
      ['nordic', N.sage, N.white, N.oak],
    ],
    build: cassetteStove,
  }),
  def({
    id: 'prop-hotplate',
    name: '电烤盘',
    w: 44,
    d: 31,
    h: 7.5,
    pals: [
      ['modern', M.white, M.char, M.black],
      ['nordic', N.mustard, M.char, N.oak],
      ['cute', C.pink, M.char, C.white],
      ['retro', R.teal, M.char, R.cream],
      ['industrial', I.iron, '#2b2b2d', I.walnut],
    ],
    build: hotplate,
  }),
  def({
    id: 'prop-takoyaki',
    name: '章鱼烧机',
    w: 29,
    d: 22.5,
    h: 8.5,
    pals: [
      ['cute', C.red, '#2f2f33', C.white],
      ['retro', R.orange, '#2f2f33', R.cream],
      ['modern', M.black, '#2f2f33', M.silver],
      ['nordic', N.white, '#2f2f33', N.oak],
    ],
    build: takoyaki,
  }),
  def({
    id: 'prop-electric-hotpot',
    name: '鸳鸯电火锅',
    w: 33,
    d: 28,
    h: 13.5,
    pals: [
      ['modern', M.black, M.silver, M.char],
      ['cute', C.pink, C.white, C.pink],
      ['nordic', N.white, N.gray, N.oak],
      ['retro', R.red, R.cream, R.caramel],
    ],
    build: electricHotpot,
    fx: [steam(0, 11, 6, 1.2), steam(0, 11, -6, 1.2)],
  }),
  def({
    id: 'prop-slow-cooker',
    name: '慢炖锅',
    w: 30.5,
    d: 22,
    h: 20,
    pals: [
      ['nordic', N.white, '#c9733e', N.oak],
      ['modern', M.black, M.white, M.silver],
      ['retro', R.mustard, R.cream, R.caramel],
      ['cute', C.mint, C.white, C.pink],
    ],
    build: slowCooker,
  }),
  def({
    id: 'prop-electric-steamer',
    name: '电蒸锅',
    w: 27,
    d: 27.5,
    h: 31.5,
    pals: [
      ['modern', M.white, M.silver, M.char],
      ['cute', C.white, C.mint, C.pink],
      ['nordic', N.white, N.oak, N.sage],
      ['retro', R.cream, R.orange, R.teal],
    ],
    build: electricSteamer,
    fx: [steam(0, 31, -0.3, 1.3)],
  }),
  def({ id: 'prop-toaster-oven', name: '台式小烤箱', w: 40, d: 34, h: 25, pals: APP, build: toasterOven }),
  def({
    id: 'prop-steam-oven',
    name: '蒸烤箱',
    w: 49,
    d: 45,
    h: 36,
    styles: ['modern', 'nordic'],
    pals: [
      ['modern', M.white, M.black, M.silver],
      ['modern', M.black, M.black, M.silver],
      ['modern', M.silver, M.black, M.char],
      ['nordic', N.white, N.gray, N.oak],
    ],
    build: steamOven,
  }),
  def({
    id: 'prop-bread-maker',
    name: '面包机',
    w: 25.5,
    d: 34,
    h: 29,
    pals: [
      ['modern', M.white, M.char, M.silver],
      ['modern', M.black, M.char, M.silver],
      ['nordic', N.white, N.oak, N.mustard],
      ['cute', C.lemon, C.white, C.pink],
      ['retro', R.cream, R.caramel, R.orange],
    ],
    build: breadMaker,
  }),
  def({
    id: 'prop-ih-rice-cooker',
    name: 'IH 压力电饭煲',
    w: 27.5,
    d: 32,
    h: 21,
    styles: ['modern', 'nordic', 'japanese'],
    pals: [
      ['modern', M.black, '#2b2c30', '#c8a96a'],
      ['modern', M.white, M.light, M.silver],
      ['modern', '#5b2a2a', '#2b2c30', '#c8a96a'],
      ['nordic', N.linen, N.white, N.oak],
      ['japanese', J.sumi, J.dark, J.shu],
    ],
    build: steamRiceCookerHigh,
    fx: [steam(0, 21.4, -8.3, 0.8)],
  }),
  def({
    id: 'prop-donabe-rice-cooker',
    name: '土锅风电饭煲',
    w: 29,
    d: 28.5,
    h: 21,
    styles: ['japanese', 'retro', 'modern'],
    pals: [
      ['japanese', J.sumi, '#5b4636', J.sumi],
      ['japanese', J.washi, '#5b4636', J.ai],
      ['retro', R.cream, R.caramel, R.red],
      ['modern', M.black, '#3a3533', M.char],
    ],
    build: donabeRiceCooker,
  }),

  // —— 料理 / 饮品家电 ——
  def({
    id: 'prop-blender',
    name: '破壁料理机',
    w: 20,
    d: 20,
    h: 36.5,
    pals: [
      ['modern', M.black, M.black, M.silver],
      ['modern', M.silver, M.black, M.char],
      ['nordic', N.white, N.gray, N.oak],
      ['cute', C.pink, C.white, C.mint],
      ['retro', R.red, R.cream, R.cream],
    ],
    build: blender,
  }),
  def({
    id: 'prop-hand-blender',
    name: '手持料理棒',
    w: 13.5,
    d: 10,
    h: 31.5,
    pals: [
      ['modern', M.white, M.char, M.silver],
      ['modern', M.black, M.silver, M.char],
      ['nordic', N.white, N.oak, N.sage],
      ['cute', C.mint, C.white, C.pink],
    ],
    build: handBlender,
  }),
  def({
    id: 'prop-stand-mixer',
    name: '厨师机',
    w: 20,
    d: 33,
    h: 33,
    styles: ['retro', 'cute', 'modern', 'nordic'],
    pals: [
      ['retro', R.red, M.silver, R.cream],
      ['retro', R.teal, M.silver, R.cream],
      ['cute', C.pink, C.white, C.white],
      ['modern', M.black, M.silver, M.silver],
      ['nordic', N.sage, N.white, N.oak],
    ],
    build: standMixer,
  }),
  def({
    id: 'prop-juicer',
    name: '原汁机',
    w: 17,
    d: 29.5,
    h: 36,
    pals: [
      ['modern', M.white, M.char, M.char],
      ['modern', M.black, M.silver, M.silver],
      ['nordic', N.white, N.sage, N.oak],
      ['cute', C.lemon, C.white, C.pink],
    ],
    build: juicer,
  }),
  def({
    id: 'prop-coffee-grinder',
    name: '电动磨豆机',
    w: 13,
    d: 19,
    h: 33.5,
    styles: ['modern', 'industrial', 'nordic', 'retro'],
    pals: [
      ['modern', M.black, M.silver, M.black],
      ['modern', M.white, M.char, M.char],
      ['industrial', I.steel, I.iron, I.walnut],
      ['nordic', N.white, N.oak, N.oak],
      ['retro', R.mustard, R.caramel, R.caramel],
    ],
    build: coffeeGrinder,
  }),
  def({
    id: 'prop-hand-grinder',
    name: '手摇磨豆机',
    w: 13.5,
    d: 11.5,
    h: 19,
    styles: ['retro', 'nordic', 'japanese', 'industrial'],
    pals: [
      ['retro', R.caramel, BRASS, M.black],
      ['nordic', N.oak, M.silver, N.oakL],
      ['japanese', J.dark, '#c9b27c', J.wood],
      ['industrial', I.walnut, I.iron, I.walnut],
    ],
    build: handGrinder,
  }),
  def({
    id: 'prop-electric-pot',
    name: '电热水瓶',
    sizeLabel: '标准',
    w: 21,
    d: 26,
    h: 30,
    pals: [
      ['modern', M.white, M.light, M.char],
      ['modern', M.char, M.black, M.silver],
      ['nordic', N.white, N.gray, N.oak],
      ['cute', C.sakura, C.white, C.pink],
      ['retro', R.cream, R.olive, R.orange],
    ],
    build: electricPot,
    fx: [steam(0, 29.4, -8.1, 0.7)],
  }),
  def({
    id: 'prop-water-pitcher',
    name: '滤水壶',
    w: 27,
    d: 10.5,
    h: 26.5,
    pals: [
      ['modern', M.white, M.char, M.char],
      ['modern', M.char, M.silver, M.silver],
      ['nordic', N.blue, N.white, N.white],
      ['cute', C.pink, C.white, C.white],
    ],
    build: pitcher,
  }),
  def({
    id: 'prop-ice-maker',
    name: '制冰机',
    w: 24,
    d: 34,
    h: 32,
    pals: [
      ['modern', M.white, M.char, M.silver],
      ['modern', M.black, M.char, M.silver],
      ['nordic', N.white, N.blue, N.oak],
      ['cute', C.sky, C.white, C.pink],
      ['retro', R.teal, R.cream, R.orange],
    ],
    build: iceMaker,
  }),
  def({
    id: 'prop-yogurt-maker',
    name: '酸奶机',
    w: 19,
    d: 19,
    h: 15.5,
    pals: [
      ['cute', C.white, C.sakura, C.pink],
      ['nordic', N.white, N.linen, N.oak],
      ['modern', M.white, M.light, M.char],
      ['retro', R.cream, R.cream, R.orange],
    ],
    build: yogurtMaker,
  }),
  def({
    id: 'prop-dishwasher-mini',
    name: '台式洗碗机',
    w: 42,
    d: 39,
    h: 45,
    pals: [
      ['modern', M.white, M.white, M.char],
      ['modern', M.silver, M.black, M.char],
      ['nordic', N.white, N.linen, N.oak],
      ['cute', C.white, C.mint, C.pink],
    ],
    build: dishwasher,
  }),

  // —— 锅具 ——
  def({ id: 'prop-cast-iron-pot', name: '珐琅铸铁锅', sizeLabel: '24 cm', w: 31.5, d: 25, h: 15, pals: POT, build: castIronPot(12) }),
  def({ id: 'prop-cast-iron-pot-s', name: '珐琅铸铁锅', sizeLabel: '18 cm', w: 25.5, d: 19, h: 12, pals: POT, build: castIronPot(9) }),
  def({ id: 'prop-yukihira', name: '雪平锅', sizeLabel: '20 cm', w: 37.5, d: 22.5, h: 8, styles: ['japanese', 'modern', 'industrial', 'retro'], pals: PAN, build: yukihira(10) }),
  def({ id: 'prop-yukihira-s', name: '雪平锅', sizeLabel: '16 cm', w: 30.5, d: 18.5, h: 6.5, styles: ['japanese', 'modern', 'industrial', 'retro'], pals: PAN, build: yukihira(8) }),
  def({
    id: 'prop-wok',
    name: '中华炒锅',
    w: 63,
    d: 34,
    h: 13.5,
    styles: ['industrial', 'modern', 'japanese'],
    pals: [
      ['industrial', I.iron, I.walnut, I.walnut],
      ['modern', M.black, M.black, M.black],
      ['japanese', J.sumi, J.wood, J.wood],
      ['modern', M.silver, M.walnut, M.walnut],
    ],
    build: wok,
  }),
  def({ id: 'prop-tamagoyaki', name: '玉子烧锅', w: 31, d: 18, h: 5.5, styles: ['japanese', 'retro', 'modern'], pals: [['japanese', COPPER, J.hinoki, J.hinoki], ['modern', M.black, M.walnut, M.walnut], ['retro', R.orange, R.caramel, R.caramel], ['japanese', J.sumi, J.wood, J.wood]], build: tamagoyaki }),
  def({ id: 'prop-stock-pot', name: '汤锅', sizeLabel: '24 cm', w: 30, d: 24.5, h: 23, pals: STOCK, build: stockPot(12) }),
  def({ id: 'prop-stock-pot-m', name: '汤锅', sizeLabel: '20 cm', w: 26, d: 20.5, h: 19.5, pals: STOCK, build: stockPot(10) }),
  def({ id: 'prop-stock-pot-s', name: '汤锅', sizeLabel: '16 cm', w: 22, d: 16.5, h: 16, pals: STOCK, build: stockPot(8) }),
  def({
    id: 'prop-seiro',
    name: '竹蒸笼',
    w: 28.5,
    d: 28.5,
    h: 19.5,
    styles: ['japanese', 'nordic'],
    pals: [
      ['japanese', J.hinoki, J.wood, J.wood],
      ['japanese', '#d9c08a', J.dark, J.dark],
      ['nordic', N.oakL, N.oak, N.oak],
    ],
    build: seiro,
    fx: [steam(0, 19.8, 0, 1.6)],
  }),

  // —— 厨房用品 ——
  def({
    id: 'prop-baking-set',
    name: '烘焙用具',
    w: 38,
    d: 23,
    h: 14,
    pals: [
      ['cute', C.pink, C.woodL, C.mint],
      ['nordic', N.white, N.oak, N.sage],
      ['modern', M.silver, M.walnut, M.char],
      ['retro', R.cream, R.caramel, R.red],
    ],
    build: bakingSet,
  }),
  def({
    id: 'prop-knife-block',
    name: '刀架',
    sizeLabel: '标准',
    w: 11,
    d: 23,
    h: 33.5,
    styles: ['nordic', 'japanese', 'modern', 'industrial'],
    pals: [
      ['nordic', N.oak, M.black, M.black],
      ['japanese', J.hinoki, J.dark, J.dark],
      ['modern', M.char, M.black, M.black],
      ['industrial', I.walnut, I.iron, I.iron],
    ],
    build: knifeBlock,
  }),
  def({
    id: 'prop-dish-rack',
    name: '沥水碗架',
    w: 44,
    d: 30,
    h: 20.5,
    pals: [
      ['modern', M.silver, M.white, M.char],
      ['modern', M.black, M.char, M.white],
      ['nordic', N.white, N.oakL, N.sage],
      ['cute', C.white, C.mint, C.pink],
    ],
    build: dishRack,
  }),
  def({
    id: 'prop-kitchen-scale',
    name: '厨房秤',
    w: 17,
    d: 21,
    h: 8.5,
    pals: [
      ['modern', M.white, M.light, M.char],
      ['modern', M.black, M.char, M.silver],
      ['nordic', N.oak, N.white, N.sage],
      ['cute', C.white, C.sakura, C.pink],
    ],
    build: kitchenScale,
  }),
  def({
    id: 'prop-food-containers',
    name: '保鲜盒组',
    w: 24,
    d: 16.5,
    h: 20.5,
    pals: [
      ['modern', M.char, M.gray, M.light],
      ['nordic', N.sage, N.blue, N.mustard],
      ['cute', C.pink, C.mint, C.lemon],
      ['retro', R.orange, R.teal, R.mustard],
    ],
    build: foodContainers,
  }),
  def({
    id: 'prop-rice-bin',
    name: '米桶',
    w: 20,
    d: 40.5,
    h: 42,
    pals: [
      ['modern', M.white, M.char, M.light],
      ['modern', M.char, M.black, M.gray],
      ['nordic', N.white, N.oak, N.oakL],
      ['japanese', J.washi, J.wood, J.hinoki],
    ],
    build: riceBin,
  }),
  def({
    id: 'prop-oil-bottles',
    name: '油壶',
    w: 15,
    d: 8.5,
    h: 22,
    styles: ['modern', 'nordic', 'japanese', 'industrial'],
    pals: [
      ['modern', M.black, M.char, M.char],
      ['nordic', N.oak, N.oakL, N.oakL],
      ['japanese', J.shu, J.hinoki, J.hinoki],
      ['industrial', I.iron, I.walnut, I.walnut],
    ],
    build: oilBottles,
  }),
  def({
    id: 'prop-paper-towel',
    name: '厨房纸架',
    w: 15,
    d: 15,
    h: 33,
    pals: [
      ['nordic', N.oak, C.white, N.oak],
      ['modern', M.black, C.white, M.silver],
      ['industrial', I.iron, C.white, I.walnut],
      ['cute', C.pink, C.white, C.lemon],
    ],
    build: paperTowel,
  }),
  def({
    id: 'prop-spice-jars',
    name: '香料罐组',
    w: 25,
    d: 10,
    h: 9,
    styles: ['nordic', 'modern', 'japanese', 'retro'],
    pals: [
      ['nordic', N.oak, N.oakL, N.white],
      ['modern', M.walnut, M.black, M.white],
      ['japanese', J.hinoki, J.sumi, J.washi],
      ['retro', R.caramel, R.red, R.cream],
    ],
    build: spiceJars,
  }),

  // —— 夏天的桌面小物 ——
  def({
    id: 'prop-bug-zapper',
    name: '电蚊拍',
    category: 'tabletop',
    sizeLabel: '平放',
    w: 41,
    d: 18,
    h: 3,
    pals: [
      ['modern', M.white, M.gray, M.char],
      ['cute', C.lemon, M.gray, C.pink],
      ['nordic', N.blue, M.gray, N.white],
      ['retro', R.orange, M.gray, R.cream],
    ],
    build: zapperFlat,
  }),
  def({
    id: 'prop-bug-zapper-stand',
    name: '电蚊拍',
    category: 'tabletop',
    sizeLabel: '充电座',
    w: 18,
    d: 9.5,
    h: 44,
    pals: [
      ['modern', M.white, M.gray, M.char],
      ['cute', C.lemon, M.gray, C.pink],
      ['nordic', N.blue, M.gray, N.white],
      ['retro', R.orange, M.gray, R.cream],
    ],
    build: zapperStand,
  }),
  def({
    id: 'prop-mosquito-coil',
    name: '蚊香',
    category: 'tabletop',
    w: 15,
    d: 15,
    h: 3,
    styles: ['japanese', 'retro', 'modern'],
    pals: [
      ['japanese', J.sumi, '#4f7a3a', J.sumi],
      ['retro', R.red, '#4f7a3a', R.red],
      ['modern', M.silver, '#4f7a3a', M.silver],
      ['japanese', J.wood, '#4f7a3a', J.wood],
    ],
    build: mosquitoCoil,
    raw: true,
    fx: [{ kind: 'smoke', x: 6, y: 1.4, z: 0, scale: 0.6, height: 30 }],
  }),
  def({
    id: 'prop-liquid-repellent',
    name: '电热蚊香液',
    category: 'tabletop',
    w: 6.5,
    d: 5,
    h: 13.5,
    pals: [
      ['modern', M.white, M.char, M.char],
      ['cute', C.white, C.sky, C.sky],
      ['retro', R.cream, R.teal, R.teal],
      ['nordic', N.white, N.sage, N.sage],
    ],
    build: liquidRepellent,
  }),
  def({
    id: 'prop-bug-spray',
    name: '杀虫喷雾',
    category: 'tabletop',
    w: 6.5,
    d: 6.5,
    h: 24,
    styles: ['retro', 'modern', 'cute'],
    pals: [
      ['retro', R.mustard, R.red, R.red],
      ['retro', R.teal, R.orange, R.cream],
      ['modern', M.white, M.black, '#3aa0d8'],
      ['cute', C.white, C.mint, C.leaf],
    ],
    build: bugSpray,
  }),
  def({
    id: 'prop-fly-swatter',
    name: '苍蝇拍',
    category: 'tabletop',
    w: 44.5,
    d: 11,
    h: 1.5,
    styles: ['retro', 'cute', 'modern'],
    pals: [
      ['retro', R.red, R.cream, R.cream],
      ['cute', C.mint, C.white, C.white],
      ['cute', C.pink, C.white, C.white],
      ['modern', M.char, M.gray, M.gray],
    ],
    build: flySwatter,
  }),
]
