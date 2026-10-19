// 淋浴（恒温混水龙头 + 软管 + 升降滑杆 + 花洒）和浴帘的模型。
// house.ts 按浴缸位置自动装到墙上（见 src/bathroom.ts），素材包 packs/bath-extra.ts 的 bx-shower-set 是同一个模型、供手动摆放。
// 原点在墙面、地面高度，+z 朝房间里，+x 沿墙。

import * as THREE from 'three'
import { ball, cyl, markMirror, rbox, shade, toon, torus } from './toon'
import { PI, cylXLegacy, cylZLegacy } from './geo'
import { J, M, N, R, type Pal } from './packkit'

const CHROME = '#d9dee6'
const MIRROR = '#d6ebf5'

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
    markMirror(glass)
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
