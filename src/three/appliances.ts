// 冰箱、洗衣机的各款式模型。设备原点在地面中心，背面朝 -z（贴墙），正面朝 +z。
// 款式和颜色存在 Fixture.style / Fixture.color 上；高度跟着款式走（台面层 surface.ts 也按这里算）。

import * as THREE from 'three'
import type { Fixture, FridgeStyle, WasherStyle } from '../model'
import { ball, cyl, rbox, shade, toon, torus } from './toon'
import { C, glow } from './kit'

export const DEFAULT_WASHER: WasherStyle = 'drum'
export const DEFAULT_FRIDGE: FridgeStyle = '3door'
const WASHER_DEFAULT_COLOR = C.white
const FRIDGE_DEFAULT_COLOR = C.mint

/** 机身顶面高度（不含防水盘），也就是能摆东西的高度 */
export function washerTop(f: Pick<Fixture, 'style'>) {
  switch ((f.style as WasherStyle) ?? DEFAULT_WASHER) {
    case 'top':
      return 90
    case 'compact':
      return 84
    case 'stack':
      return 176
    case 'twin':
      return 88
    case 'pair':
      return 92
    default:
      return 88
  }
}

export function fridgeTop(f: Pick<Fixture, 'style'>) {
  switch ((f.style as FridgeStyle) ?? DEFAULT_FRIDGE) {
    case '2door':
      return 124
    case 'french':
      return 184
    case 'side':
      return 180
    case 'retro':
      return 152
    default:
      return 172
  }
}

/** 洗衣机机身占地（防水盘里居中的方块边长） */
export function washerBody(f: Pick<Fixture, 'style' | 'w' | 'd'>, d: number) {
  const m = Math.min(f.w, d) - 6
  return (f.style as WasherStyle) === 'compact' ? Math.min(m, 52) : (f.style as WasherStyle) === 'twin' ? m : m
}

/** 前面的圆形玻璃门 */
function porthole(g: THREE.Group, r: number, y: number, z: number, ring: string) {
  g.add(torus(r + 2, 2.6, ring, { y, z: z + 0.6 }))
  const glass = cyl(r, r, 1, C.glass, { y: y - 0.5, z: z + 0.2, rx: Math.PI / 2 }, 28)
  glass.material = toon(C.glass, { emissive: 0.2 })
  glass.userData.noOutline = true
  g.add(glass)
}

export function washerModel(f: Pick<Fixture, 'style' | 'color' | 'w' | 'd'>, d: number) {
  const style = (f.style as WasherStyle) ?? DEFAULT_WASHER
  const body = f.color ?? WASHER_DEFAULT_COLOR
  const trim = shade(body, -0.1)
  const dark = shade(body, -0.45)
  const g = new THREE.Group()
  // 防水盘
  g.add(rbox(f.w, 4, d, '#e8edf2', {}, 1))
  const m = washerBody(f, d)
  const top = washerTop(f)
  const H = top - 4
  switch (style) {
    case 'drum': {
      g.add(rbox(m, H, m, body, { y: 4 }, 5))
      // 操作面板 + 小屏
      g.add(rbox(m - 4, 10, 2, trim, { y: H - 8, z: m / 2 }, 1))
      g.add(glow(10, 4, '#9fe3ff', { x: m / 2 - 16, y: H - 5, z: m / 2 + 1.1 }, 0.8))
      g.add(ball(2, C.mint, { x: m / 2 - 6, y: H - 3, z: m / 2 + 1 }))
      g.add(rbox(14, 4, 1.4, trim, { x: -m / 2 + 11, y: H - 6, z: m / 2 + 0.6 }, 0.6))
      porthole(g, 15, 44, m / 2, shade(body, -0.25))
      break
    }
    case 'top':
    case 'compact': {
      const h = H - 4
      g.add(rbox(m, h, m, body, { y: 4 }, 5))
      // 顶盖（略浅、带透明窗）+ 后部操作面板
      g.add(rbox(m - 4, 2, m - 18, shade(body, 0.04), { y: h + 4, z: 6 }, 2))
      const win = rbox(m - 20, 0.6, m - 34, C.glass, { y: h + 6, z: 6 })
      win.material = toon(C.glass, { transparent: 0.6 })
      win.userData.noOutline = true
      g.add(win)
      g.add(rbox(m - 4, 6, 12, trim, { y: h + 2, z: -m / 2 + 8 }, 2))
      g.add(glow(8, 3, '#9fe3ff', { y: h + 8.1, z: -m / 2 + 9, rx: -Math.PI / 2 }, 0.8))
      for (let i = 0; i < 3; i++) g.add(ball(1.2, dark, { x: -10 + i * 6 + 14, y: h + 8, z: -m / 2 + 10 }))
      // 前面底部的通风格栅
      g.add(rbox(m - 16, 4, 0.8, trim, { y: 8, z: m / 2 }, 0.5))
      break
    }
    case 'stack': {
      // 下：滚筒洗衣机；上：干衣机（支架叠放）
      g.add(rbox(m, 84, m, body, { y: 4 }, 5))
      porthole(g, 14, 42, m / 2, shade(body, -0.25))
      g.add(rbox(m - 4, 8, 2, trim, { y: 76, z: m / 2 }, 1))
      g.add(rbox(m + 2, 3, m + 2, shade(body, -0.3), { y: 88 }, 1))
      g.add(rbox(m, H - 87, m, body, { y: 91 }, 5))
      porthole(g, 13, 128, m / 2, shade(body, -0.25))
      g.add(rbox(m - 4, 8, 2, trim, { y: H - 8, z: m / 2 }, 1))
      g.add(glow(8, 3, '#ffd59f', { x: m / 2 - 14, y: H - 6, z: m / 2 + 1.1 }, 0.8))
      break
    }
    case 'pair': {
      // 欧美洗衣房：滚筒洗衣机 + 烘干机并排（各占一半宽）
      const uw = Math.min((f.w - 8) / 2, 70)
      const ud = Math.min(d - 6, 66)
      for (const [s, dryer] of [
        [-1, false],
        [1, true],
      ] as const) {
        const x = s * (uw / 2 + 1.5)
        g.add(rbox(uw, H, ud, body, { x, y: 4 }, 5))
        g.add(rbox(uw - 4, 12, 2, trim, { x, y: H - 10, z: ud / 2 }, 1))
        g.add(glow(10, 4, dryer ? '#ffd59f' : '#9fe3ff', { x: x + uw / 2 - 16, y: H - 6, z: ud / 2 + 1.1 }, 0.8))
        for (const dx of [-uw / 2 + 10, -uw / 2 + 18]) g.add(cyl(2.2, 2.2, 1.6, dark, { x: x + dx, y: H - 4, z: ud / 2 + 1.2, rx: Math.PI / 2 }, 14))
        if (dryer) {
          // 烘干机：门是实心的，带一圈深色门框
          g.add(torus(17, 2.6, shade(body, -0.25), { x, y: 44, z: ud / 2 + 0.6 }))
          g.add(cyl(15, 15, 1, shade(body, 0.04), { x, y: 43.5, z: ud / 2 + 0.2, rx: Math.PI / 2 }, 28))
        } else {
          g.add(torus(17, 2.6, shade(body, -0.25), { x, y: 44, z: ud / 2 + 0.6 }))
          const glass = cyl(15, 15, 1, C.glass, { x, y: 43.5, z: ud / 2 + 0.2, rx: Math.PI / 2 }, 28)
          glass.material = toon(C.glass, { emissive: 0.2 })
          glass.userData.noOutline = true
          g.add(glass)
        }
      }
      break
    }
    case 'twin': {
      // 二槽式：横长机身，左洗右脱水，顶上两块盖子，前面两个大旋钮
      const w = Math.min(f.w - 4, 78)
      const dd = Math.min(d - 8, 44)
      g.add(rbox(w, H - 2, dd, body, { y: 4 }, 4))
      g.add(rbox(w * 0.56, 2, dd - 8, shade(body, 0.05), { x: -w * 0.2, y: H + 2, z: 2 }, 1.5))
      g.add(rbox(w * 0.34, 2, dd - 8, shade(body, 0.05), { x: w * 0.3, y: H + 2, z: 2 }, 1.5))
      g.add(rbox(w - 4, 8, 5, trim, { y: H - 8, z: -dd / 2 + 3 }, 1.5))
      for (const x of [-w * 0.28, -w * 0.08, w * 0.3]) g.add(cyl(2.6, 2.8, 2.4, dark, { x, y: H - 6, z: -dd / 2 + 6.5 }, 16))
      g.add(rbox(w * 0.6, 6, 0.8, trim, { y: 12, z: dd / 2 }, 0.5))
      break
    }
  }
  return g
}

export function fridgeModel(f: Pick<Fixture, 'style' | 'color' | 'w' | 'd'>, d: number) {
  const style = (f.style as FridgeStyle) ?? DEFAULT_FRIDGE
  const body = f.color ?? FRIDGE_DEFAULT_COLOR
  const seam = shade(body, -0.2)
  const handle = shade(body, -0.12)
  const g = new THREE.Group()
  const fw = (style === '2door' ? Math.min(f.w, 54) : f.w) - 4
  const fd = (style === '2door' ? Math.min(d, 58) : d) - 4
  const H = fridgeTop(f) - 2
  const front = fd / 2
  const line = (y: number, x0 = -fw / 2 + 1, x1 = fw / 2 - 1) => g.add(rbox(x1 - x0, 0.8, 1, seam, { x: (x0 + x1) / 2, y, z: front + 0.1 }, 0.3))
  const vline = (x: number, y0: number, y1: number) => g.add(rbox(0.8, y1 - y0, 1, seam, { x, y: y0, z: front + 0.1 }, 0.3))
  const grip = (x: number, y: number, h: number) => g.add(rbox(2.4, h, 3, handle, { x, y, z: front + 1 }, 1))
  const bar = (y: number, x0: number, x1: number) => g.add(rbox(x1 - x0, 2, 2.6, handle, { x: (x0 + x1) / 2, y, z: front + 1.2 }, 1))
  // 机身底下的踢脚板 / 调平脚（以前机身离地 2cm 悬空）
  g.add(rbox(fw - 10, 2.4, fd - 10, shade(body, -0.5), { z: -1 }, 0.6))
  g.add(rbox(fw, H, fd, body, { y: 2 }, style === 'retro' ? 12 : 6))
  switch (style) {
    case '2door':
      // 上冷冻小门、下冷藏门
      line(H * 0.62)
      grip(fw / 2 - 6, H * 0.66, 18)
      grip(fw / 2 - 6, H * 0.36, 24)
      break
    case '3door':
      // 上冷藏（对开一扇）、中蔬菜抽屉、下冷冻抽屉
      line(112)
      line(66)
      grip(fw / 2 - 8, 118, 28)
      bar(104, -fw / 2 + 10, fw / 2 - 10)
      bar(58, -fw / 2 + 10, fw / 2 - 10)
      break
    case 'french':
      // 法式对开门（上）+ 三层抽屉
      line(108)
      line(74)
      line(42)
      vline(0, 108, H)
      grip(-3, 118, 40)
      grip(3, 118, 40)
      for (const y of [100, 66, 34]) bar(y, -fw / 2 + 10, fw / 2 - 10)
      // 门上的小屏
      g.add(glow(8, 3, '#9fe3ff', { x: -fw / 4, y: H - 18, z: front + 0.4 }, 0.7))
      break
    case 'side': {
      // 左右对开到底；左门上有取水口
      vline(-fw * 0.08, 4, H)
      grip(-fw * 0.08 - 3, 70, 60)
      grip(-fw * 0.08 + 3, 70, 60)
      g.add(rbox(16, 26, 1.6, shade(body, -0.3), { x: -fw * 0.3, y: 110, z: front + 0.4 }, 2))
      g.add(rbox(10, 2, 3, shade(body, -0.4), { x: -fw * 0.3, y: 112, z: front + 1 }, 0.5))
      break
    }
    case 'retro': {
      // 大圆角、镀铬拉杆把手，上小冷冻门
      line(H * 0.72, -fw / 2 + 6, fw / 2 - 6)
      for (const y of [H * 0.8, H * 0.45]) {
        g.add(rbox(3, 12, 3, C.steel, { x: fw / 2 - 8, y, z: front + 1 }, 1.2))
        g.add(rbox(10, 2.4, 3.4, C.steel, { x: fw / 2 - 12, y: y + 10, z: front + 2 }, 1.2))
      }
      g.add(rbox(fw * 0.4, 3, 0.8, C.steel, { y: 10, z: front + 0.3 }, 1))
      break
    }
  }
  // 冰箱贴、便签是独立的贴附物（stick），用户自己贴
  return g
}
