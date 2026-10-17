// 设备上方的壁挂收纳：厨房台面上方的开放搁板 / 吊柜，马桶上方的搁板 / 吊柜。
// 壁挂约定：模型按离地高度建（最低点 = mount），背面贴墙在 z = -d/2；surface / surfaces 的 y 也是离地高度。

import * as THREE from 'three'
import { cyl, rbox, shade } from '../toon'
import { C, carcass, hingedDoor, rectPoly, shelvesIn, type AssetDef, type SurfaceDef } from '../kit'
import { define, type Pal } from '../packkit'

const SHELF_PALS: Pal[] = [
  ['nordic', [C.woodL, '#2f3134']],
  ['industrial', ['#8a6a4a', '#3a3a3c']],
  ['modern', ['#f4f4f2', '#c9ccd1']],
  ['japanese', ['#c9a77c', '#6b5a48']],
  ['cute', ['#f6e3c8', '#f4a9c0']],
]
const CAB_PALS: Pal[] = [
  ['modern', ['#f4f4f2', '#c9ccd1']],
  ['nordic', [C.woodL, '#e8e1d4']],
  ['japanese', ['#c9a77c', '#8a6a4a']],
  ['cute', ['#fbe3ea', '#f6f1e8']],
  ['industrial', ['#5b5e63', '#8a6a4a']],
]

/** 开放搁板：n 层木板 + 墙上的 L 形托架；层距 gap */
function openShelf(w: number, d: number, n: number, gap: number, mount: number) {
  return (p: string[]) => {
    const [board, bracket] = p
    const g = new THREE.Group()
    const zb = -d / 2
    for (let i = 0; i < n; i++) {
      const y = mount + 6 + i * gap
      g.add(rbox(w, 2, d, board, { y, z: 0 }, 0.6))
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - Math.min(10, w * 0.15))
        // 托架：竖条贴墙 + 横条托板
        g.add(rbox(2, 8, 0.8, bracket, { x, y: y - 6, z: zb + 0.4 }, 0.2))
        g.add(rbox(2, 0.8, d - 4, bracket, { x, y: y - 0.8, z: zb + (d - 4) / 2 + 0.8 }, 0.2))
      }
    }
    return g
  }
}

/** 吊柜：空心盒体 + 平开门（把手在门下沿，吊柜从下面开），柜内中间一块层板；底下可带一层开放格 */
const CAB_T = 1.8
function wallCabinet(w: number, d: number, h: number, mount: number, niche: number) {
  return (p: string[]) => {
    const [body, door] = p
    const g = new THREE.Group()
    const y0 = mount + niche
    // 盒体比声明进深浅 2，门板和把手凸出的部分正好落在声明范围内
    const box = carcass(w, h - niche, d - 2, body, { t: CAB_T })
    box.position.set(0, y0, -1)
    g.add(box)
    const shelf = shelvesIn(w, d - 2, [cabShelfY(h, mount, niche)], shade(body, 0.04), CAB_T)
    shelf.position.set(0, 0, -1)
    g.add(shelf)
    const n = Math.max(1, Math.round(w / 45))
    const dw = w / n
    for (let i = 0; i < n; i++) {
      const hinge = n > 1 && i >= n / 2 ? 'right' : 'left'
      g.add(
        hingedDoor({
          x0: -w / 2 + dw * i,
          x1: -w / 2 + dw * (i + 1),
          y0: y0 + 0.4,
          y1: y0 + h - niche - 0.4,
          z: d / 2 - 0.6,
          hinge,
          color: door,
          th: 1.2,
          knob: false,
          panel: (pw, ph) => [rbox(pw, ph, 1.2, door, {}, 0.8), rbox(8, 1.2, 1, shade(door, -0.35), { x: (hinge === 'left' ? 1 : -1) * (pw / 2 - 8), y: 1.8, z: 1.1 }, 0.4)],
        }),
      )
    }
    if (niche > 0) {
      // 底下的开放格：两侧板 + 底板
      g.add(rbox(w, 2, d - 2, body, { y: mount, z: -1 }, 0.6))
      for (const s of [-1, 1]) g.add(rbox(1.8, niche, d - 2, body, { x: s * (w / 2 - 0.9), y: mount, z: -1 }, 0.4))
      g.add(rbox(w - 3.6, niche, 0.8, shade(body, -0.06), { y: mount, z: -d / 2 + 0.4 }, 0.2))
    }
    return g
  }
}

/** 吊柜中间层板的顶面高度（离地） */
const cabShelfY = (h: number, mount: number, niche: number) => Math.round(mount + niche + (h - niche) / 2)

/** 吊柜门里的两层：柜底板、中间层板（离地高度，和 wallCabinet 的板对得上） */
function cabLevels(w: number, d: number, h: number, mount: number, niche: number): SurfaceDef[] {
  const floor = mount + niche + CAB_T
  const mid = cabShelfY(h, mount, niche)
  const top = mount + h - CAB_T
  const shape = [rectPoly(-w / 2 + CAB_T + 0.4, -d / 2 + CAB_T + 0.4, w / 2 - CAB_T - 0.4, d / 2 - 2.6)]
  return [
    { y: floor, h: Math.round((mid - 1.6 - floor) * 10) / 10, inside: true, shape },
    { y: mid, h: Math.round((top - mid) * 10) / 10, inside: true, shape },
  ]
}

/** 挂杆 + S 钩：搁板底下多一根挂杆 */
function shelfWithRail(w: number, d: number, mount: number) {
  const shelf = openShelf(w, d, 1, 0, mount + 14)
  return (p: string[]) => {
    const g = shelf(p)
    const rail = cyl(0.8, 0.8, w - 8, p[1], { z: -d / 2 + 8, rz: Math.PI / 2 }, 10)
    rail.position.y = mount + 2
    g.add(rail)
    // 挂杆吊在两根竖杆上，竖杆上接搁板托架
    for (const s of [-1, 1]) g.add(rbox(1.2, 14, 1.2, p[1], { x: s * (w / 2 - 4), y: mount, z: -d / 2 + 8 }, 0.2))
    return g
  }
}

const K_MOUNT = 140
const T_MOUNT = 150

const KITCHEN_SHELVES: AssetDef[] = [60, 90, 120].flatMap((w) => [
  define(`ws-kitchen-shelf-${w}`, '厨房壁挂搁板', 'storage', [w, 22, 8], SHELF_PALS, openShelf(w, 22, 1, 0, K_MOUNT), {
    family: 'ws-kitchen-shelf',
    sizeLabel: `单层 ${w}`,
    mount: K_MOUNT,
    surface: K_MOUNT + 8,
  }),
  define(`ws-kitchen-shelf2-${w}`, '厨房壁挂搁板', 'storage', [w, 22, 38], SHELF_PALS, openShelf(w, 22, 2, 30, K_MOUNT), {
    family: 'ws-kitchen-shelf',
    sizeLabel: `双层 ${w}`,
    mount: K_MOUNT,
    surface: K_MOUNT + 38,
    surfaces: [{ y: K_MOUNT + 8, h: 28 }],
  }),
])

const KITCHEN_RAIL: AssetDef[] = [60, 90].map((w) =>
  define(`ws-kitchen-rail-${w}`, '搁板 + 挂杆', 'storage', [w, 22, 22], SHELF_PALS, shelfWithRail(w, 22, K_MOUNT), {
    family: 'ws-kitchen-rail',
    sizeLabel: `${w}`,
    mount: K_MOUNT,
    surface: K_MOUNT + 22,
  }),
)

const KITCHEN_CABS: AssetDef[] = [60, 90, 120].map((w) =>
  define(`ws-kitchen-cab-${w}`, '厨房吊柜', 'storage', [w, 35, 70], CAB_PALS, wallCabinet(w, 35, 70, 150, 0), {
    family: 'ws-kitchen-cab',
    sizeLabel: `${w}`,
    mount: 150,
    surfaces: cabLevels(w, 35, 70, 150, 0),
    openable: true,
  }),
)

const TOILET: AssetDef[] = [
  define('ws-toilet-shelf', '马桶上方搁板', 'storage', [60, 16, 38], SHELF_PALS, openShelf(60, 16, 2, 30, T_MOUNT), {
    family: 'ws-toilet-shelf',
    sizeLabel: '双层',
    mount: T_MOUNT,
    surface: T_MOUNT + 38,
    surfaces: [{ y: T_MOUNT + 8, h: 28 }],
    category: 'toiletry',
  }),
  define('ws-toilet-shelf-1', '马桶上方搁板', 'storage', [60, 16, 8], SHELF_PALS, openShelf(60, 16, 1, 0, T_MOUNT + 15), {
    family: 'ws-toilet-shelf',
    sizeLabel: '单层',
    mount: T_MOUNT + 15,
    surface: T_MOUNT + 23,
    category: 'toiletry',
  }),
  define('ws-toilet-cab', '马桶上方吊柜', 'storage', [60, 25, 60], CAB_PALS, wallCabinet(60, 25, 60, T_MOUNT, 20), {
    mount: T_MOUNT,
    surfaces: [{ y: T_MOUNT + 2, h: 18 }, ...cabLevels(60, 25, 60, T_MOUNT, 20)],
    openable: true,
    category: 'toiletry',
  }),
]

export const WALL_SHELVES: AssetDef[] = [...KITCHEN_SHELVES, ...KITCHEN_RAIL, ...KITCHEN_CABS, ...TOILET]
