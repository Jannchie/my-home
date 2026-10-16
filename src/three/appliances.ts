// 冰箱、洗衣机、干衣机、酒柜的各款式模型（素材包 packs/appliances-pack.ts 用它们做成普通家具），
// 以及平面图「冰箱位 / 洗衣机位」在 3D 里的样子（地面标记 / 防水盘 + 给排水口）。
// 原点在占地中心的地面上，背面朝 -z（贴墙），正面朝 +z；w / d / h 就是素材的占地和高度，模型正好填满。

import * as THREE from 'three'
import { ball, cyl, rbox, shade, toon, torus } from './toon'
import { C, glow } from './kit'

/** 洗衣机 / 干衣机的款式 */
export type WasherStyle = 'drum' | 'top' | 'compact' | 'stack' | 'twin' | 'mini' | 'dryer' | 'us' | 'us-dryer'
/** 冰箱的款式 */
export type FridgeStyle = 'mini' | '2door' | '3door' | 'french' | 'side' | 'retro'

/** 前面的圆形玻璃门（dryer = 实心门，干衣机） */
function porthole(g: THREE.Group, r: number, y: number, z: number, ring: string, x = 0, solid?: string) {
  g.add(torus(r + 2, 2.6, ring, { x, y, z: z + 0.6 }))
  const door = cyl(r, r, 1, solid ?? C.glass, { x, y: y - 0.5, z: z + 0.2, rx: Math.PI / 2 }, 28)
  if (!solid) {
    door.material = toon(C.glass, { emissive: 0.2 })
    door.userData.noOutline = true
  }
  g.add(door)
}

/** 滚筒机身（洗衣机或干衣机）：机身 + 顶部操作面板 + 小屏 + 圆门 */
function drumUnit(g: THREE.Group, body: string, w: number, h: number, d: number, o: { x?: number; y?: number; dryer?: boolean; r?: number; knobs?: boolean } = {}) {
  const x = o.x ?? 0
  const y0 = o.y ?? 0
  const trim = shade(body, -0.1)
  const dark = shade(body, -0.45)
  // 机身比占地浅 4cm、往后靠：门圈、面板凸出来也不超出占地
  const z = d / 2 - 4
  g.add(rbox(w, h, d - 4, body, { x, y: y0, z: -2 }, 5))
  g.add(rbox(w - 4, 10, 2, trim, { x, y: y0 + h - 12, z }, 1))
  g.add(glow(10, 4, o.dryer ? '#ffd59f' : '#9fe3ff', { x: x + w / 2 - 16, y: y0 + h - 9, z: z + 1.1 }, 0.8))
  if (o.knobs) for (const dx of [-w / 2 + 10, -w / 2 + 18]) g.add(cyl(2.2, 2.2, 1.6, dark, { x: x + dx, y: y0 + h - 7, z: z + 1.2, rx: Math.PI / 2 }, 14))
  else {
    g.add(ball(2, C.mint, { x: x + w / 2 - 6, y: y0 + h - 7, z: z + 1 }))
    g.add(rbox(14, 4, 1.4, trim, { x: x - w / 2 + 11, y: y0 + h - 10, z: z + 0.6 }, 0.6))
  }
  const r = o.r ?? Math.min(15, w * 0.26, (h - 16) * 0.36)
  porthole(g, r, y0 + Math.min(h * 0.5, h - 20 - r), z, shade(body, -0.25), x, o.dryer ? shade(body, 0.04) : undefined)
}

/** 洗衣机 / 干衣机：机身颜色 body，占地 w × d、高 h */
export function washerModel(style: WasherStyle, body: string, w: number, d: number, h: number) {
  const trim = shade(body, -0.1)
  const dark = shade(body, -0.45)
  const g = new THREE.Group()
  switch (style) {
    case 'drum':
    case 'dryer':
      drumUnit(g, body, w, h, d, { dryer: style === 'dryer' })
      break
    case 'us':
    case 'us-dryer':
      // 欧美大容量：旋钮 + 大圆门
      drumUnit(g, body, w, h, d, { dryer: style === 'us-dryer', knobs: true, r: Math.min(18, w * 0.27) })
      break
    case 'top':
    case 'compact':
    case 'mini': {
      // 立式波轮：机身 + 顶盖（略浅、带透明窗）+ 后部操作面板
      const hb = h - 8
      g.add(rbox(w, hb, d, body, {}, style === 'mini' ? 7 : 5))
      g.add(rbox(w - 4, 2, d - 18, shade(body, 0.04), { y: hb, z: 6 }, 2))
      const win = rbox(w - 20, 0.6, d - 34, C.glass, { y: hb + 2, z: 6 })
      win.material = toon(C.glass, { transparent: 0.6 })
      win.userData.noOutline = true
      g.add(win)
      g.add(rbox(w - 4, 8, 12, trim, { y: hb - 2, z: -d / 2 + 8 }, 2))
      g.add(glow(8, 3, '#9fe3ff', { y: h - 1.9, z: -d / 2 + 9, rx: -Math.PI / 2 }, 0.8))
      for (let i = 0; i < 3; i++) g.add(ball(1.2, dark, { x: 4 + i * 6, y: h - 2, z: -d / 2 + 10 }))
      // 前面底部的通风格栅
      g.add(rbox(w - 16, 4, 0.8, trim, { y: 4, z: d / 2 }, 0.5))
      break
    }
    case 'stack': {
      // 下：滚筒洗衣机；上：干衣机（中间一道叠放支架）
      const lower = Math.round(h * 0.477)
      drumUnit(g, body, w, lower, d, { r: 14 })
      g.add(rbox(w, 3, d - 2, shade(body, -0.3), { y: lower, z: -1 }, 1))
      drumUnit(g, body, w, h - lower - 3, d, { y: lower + 3, dryer: true, r: 13 })
      break
    }
    case 'twin': {
      // 二槽式：横长机身，左洗右脱水，顶上两块盖子，后部操作面板上三个大旋钮
      const hb = h - 4
      g.add(rbox(w, hb, d, body, {}, 4))
      g.add(rbox(w * 0.56, 2, d - 8, shade(body, 0.05), { x: -w * 0.2, y: hb, z: 2 }, 1.5))
      g.add(rbox(w * 0.34, 2, d - 8, shade(body, 0.05), { x: w * 0.3, y: hb, z: 2 }, 1.5))
      g.add(rbox(w - 4, 8, 5, trim, { y: hb - 4, z: -d / 2 + 3 }, 1.5))
      for (const x of [-w * 0.28, -w * 0.08, w * 0.3]) g.add(cyl(2.6, 2.8, 2.4, dark, { x, y: h - 2.4, z: -d / 2 + 6.5 }, 16))
      g.add(rbox(w * 0.6, 6, 0.8, trim, { y: 8, z: d / 2 }, 0.5))
      break
    }
  }
  return g
}

/** 冰箱：机身颜色 body，占地 w × d、高 h */
export function fridgeModel(style: FridgeStyle, body: string, w: number, d: number, h: number) {
  const seam = shade(body, -0.2)
  const handle = shade(body, -0.12)
  const g = new THREE.Group()
  const fw = w
  const fd = d - 3
  const H = h - 2
  const front = fd / 2 - 1.5
  const line = (y: number, x0 = -fw / 2 + 1, x1 = fw / 2 - 1) => g.add(rbox(x1 - x0, 0.8, 1, seam, { x: (x0 + x1) / 2, y, z: front + 0.1 }, 0.3))
  const vline = (x: number, y0: number, y1: number) => g.add(rbox(0.8, y1 - y0, 1, seam, { x, y: y0, z: front + 0.1 }, 0.3))
  const grip = (x: number, y: number, hh: number) => g.add(rbox(2.4, hh, 3, handle, { x, y, z: front + 1 }, 1))
  const bar = (y: number, x0: number, x1: number) => g.add(rbox(x1 - x0, 2, 2.6, handle, { x: (x0 + x1) / 2, y, z: front + 1.2 }, 1))
  // 机身底下的踢脚板 / 调平脚
  g.add(rbox(fw - 10, 2.4, fd - 10, shade(body, -0.5), { z: -2.5 }, 0.6))
  g.add(rbox(fw, H, fd, body, { y: 2, z: -1.5 }, style === 'retro' ? 12 : style === 'mini' ? 4 : 6))
  switch (style) {
    case 'mini':
      // 单门：一扇门到底，侧边竖把手，门里上方是小冷冻格（看不到）
      grip(fw / 2 - 5, H * 0.45, 26)
      g.add(rbox(fw - 12, 0.8, 1, seam, { y: H * 0.08, z: front + 0.1 }, 0.3))
      break
    case '2door':
      // 上冷冻小门、下冷藏门
      line(H * 0.62)
      grip(fw / 2 - 6, H * 0.66, 18)
      grip(fw / 2 - 6, H * 0.36, 24)
      break
    case '3door':
      // 上冷藏（一扇）、中蔬菜抽屉、下冷冻抽屉
      line(H * 0.65)
      line(H * 0.385)
      grip(fw / 2 - 8, H * 0.69, 28)
      bar(H * 0.6, -fw / 2 + 10, fw / 2 - 10)
      bar(H * 0.335, -fw / 2 + 10, fw / 2 - 10)
      break
    case 'french':
      // 法式对开门（上）+ 三层抽屉
      line(H * 0.59)
      line(H * 0.405)
      line(H * 0.23)
      vline(0, H * 0.59, H)
      grip(-3, H * 0.645, 40)
      grip(3, H * 0.645, 40)
      for (const y of [H * 0.545, H * 0.36, H * 0.185]) bar(y, -fw / 2 + 10, fw / 2 - 10)
      // 门上的小屏
      g.add(glow(8, 3, '#9fe3ff', { x: -fw / 4, y: H - 18, z: front + 0.4 }, 0.7))
      break
    case 'side': {
      // 左右对开到底；左门上有取水口
      vline(-fw * 0.08, 4, H)
      grip(-fw * 0.08 - 3, H * 0.39, 60)
      grip(-fw * 0.08 + 3, H * 0.39, 60)
      g.add(rbox(16, 26, 1.6, shade(body, -0.3), { x: -fw * 0.3, y: H * 0.61, z: front + 0.4 }, 2))
      g.add(rbox(10, 2, 3, shade(body, -0.4), { x: -fw * 0.3, y: H * 0.62, z: front + 1 }, 0.5))
      break
    }
    case 'retro': {
      // 大圆角、镀铬拉杆把手，上小冷冻门
      line(H * 0.72, -fw / 2 + 6, fw / 2 - 6)
      for (const y of [H * 0.8, H * 0.45]) {
        g.add(rbox(3, 12, 3, C.steel, { x: fw / 2 - 8, y, z: front + 1 }, 1.2))
        g.add(rbox(10, 2.4, 3.4, C.steel, { x: fw / 2 - 12, y: y + 10, z: front + 1.2 }, 1.2))
      }
      g.add(rbox(fw * 0.4, 3, 0.8, C.steel, { y: 10, z: front + 0.3 }, 1))
      break
    }
  }
  // 冰箱贴、便签是独立的贴附物（stick），一键布置会贴在门上
  return g
}

/** 酒柜：机身 + 玻璃门，里面一层层横放的酒瓶 */
export function wineCoolerModel(body: string, w: number, d: number, h: number) {
  const g = new THREE.Group()
  const frame = shade(body, -0.15)
  // 机身是前面开口的空壳（看得到里面）：两侧板 + 顶板 + 底座 + 深色内背板
  const bd = d - 4
  for (const s of [-1, 1]) g.add(rbox(3, h, bd, body, { x: s * (w / 2 - 1.5), z: -2 }, 1.2))
  g.add(rbox(w, 4, bd, body, { y: h - 4, z: -2 }, 1.2))
  g.add(rbox(w, 9, bd, body, { z: -2 }, 1.2))
  g.add(rbox(w - 4, h - 12, 2, shade(body, -0.55), { y: 8, z: -d / 2 + 1 }, 0.6))
  const front = d / 2 - 3
  // 门框（四条边框，中间是玻璃，看得到里面的酒瓶）
  const fh = h - 10
  for (const s of [-1, 1]) g.add(rbox(4, fh, 1.6, frame, { x: s * (w / 2 - 3), y: 8, z: front }, 0.8))
  g.add(rbox(w - 2, 4, 1.6, frame, { y: 8, z: front }, 0.8))
  g.add(rbox(w - 2, 5, 1.6, frame, { y: 8 + fh - 5, z: front }, 0.8))
  // 酒瓶：瓶底朝外横放
  const rows = Math.max(3, Math.floor((h - 22) / 11))
  const cols = Math.max(2, Math.floor((w - 10) / 8))
  const bottles = ['#4a2a2e', '#2f4a32', '#5c1f2b', '#3a3a2a']
  for (let r = 0; r < rows; r++) {
    const y = 13 + r * ((h - 26) / rows)
    g.add(rbox(w - 8, 0.6, d - 10, C.steel, { y: y - 0.8, z: -2 }, 0.2))
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 6 + (c + 0.5) * ((w - 12) / cols)
      // 横放的圆柱：cyl 的 at.y 是「立着时的底面」，转 90° 后要减去半个长度才是瓶身中心高度
      const len = d - 14
      g.add(cyl(3.2, 3.2, len, bottles[(r + c) % bottles.length], { x, y: y + 3.4 - len / 2, z: -2, rx: Math.PI / 2 }, 12))
    }
  }
  const glass = rbox(w - 8, h - 18, 0.6, C.glass, { y: 11, z: front + 1 })
  glass.material = toon(C.glass, { transparent: 0.35 })
  glass.userData.noOutline = true
  g.add(glass)
  // 竖把手 + 底部格栅 + 温度屏
  g.add(rbox(1.8, Math.min(40, h * 0.4), 2.4, C.steel, { x: w / 2 - 4, y: h * 0.35, z: front + 1.6 }, 0.8))
  g.add(rbox(w - 10, 4, 0.8, frame, { y: 2, z: front + 0.4 }, 0.4))
  g.add(glow(6, 2.4, '#9fe3ff', { x: -w / 2 + 8, y: h - 7, z: front + 0.9 }, 0.8))
  return g
}

/** 洗衣机位：防水盘（四周一圈矮沿）+ 角上的排水口 + 墙上的给水龙头 */
export function washerSpotModel(w: number, d: number) {
  const g = new THREE.Group()
  const pan = '#e8edf2'
  const rim = 3
  const rh = 4.5
  g.add(rbox(w, 1, d, pan, {}, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(w, rh, rim, pan, { z: (s * (d - rim)) / 2 }, 1))
    g.add(rbox(rim, rh, d - rim * 2 + 2, pan, { x: (s * (w - rim)) / 2 }, 1))
  }
  // 排水口（防水盘右后角的圆形排水盖）
  const dx = w / 2 - rim - 6
  const dz = -d / 2 + rim + 6
  g.add(cyl(4.4, 4.6, 1.6, '#c4ccd4', { x: dx, y: 1, z: dz }, 20))
  g.add(cyl(3, 3, 0.6, '#8f99a3', { x: dx, y: 2.5, z: dz }, 16))
  // 给水龙头：贴墙一侧，比一般洗衣机高
  const tx = -w / 2 + 6
  g.add(rbox(4, 4, 3, '#c8ced6', { x: tx, y: 108, z: -d / 2 + 1.5 }, 1))
  g.add(cyl(1, 1, 5, '#c8ced6', { x: tx, y: 109.6, z: -d / 2 + 3, rx: Math.PI / 2 }, 10))
  g.add(rbox(5, 1.6, 1.6, '#5aa0d8', { x: tx, y: 113, z: -d / 2 + 2 }, 0.6))
  return g
}

/** 冰箱位：地面上一圈很淡的标记（只是预留空间，不画冰箱） */
export function fridgeSpotModel(w: number, d: number) {
  const g = new THREE.Group()
  const c = '#d5dade'
  const t = 1.2
  const mark = (mw: number, md: number, x: number, z: number) => {
    const m = rbox(mw, 0.3, md, c, { x, z }, 0.1)
    m.material = toon(c, { transparent: 0.55 })
    m.userData.noOutline = true
    m.castShadow = false
    g.add(m)
  }
  for (const s of [-1, 1]) {
    mark(w - 2, t, 0, (s * (d - 2 - t)) / 2)
    mark(t, d - 2 - t * 2, (s * (w - 2 - t)) / 2, 0)
  }
  return g
}
