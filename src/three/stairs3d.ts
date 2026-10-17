// 楼梯的 3D 模型、上层楼梯洞口四周的栏杆。踏步布置来自 src/stairs.ts（平面图同一份数据）。
//
// 模型局部坐标：x 沿楼梯宽，z = 平面局部 y（起步在 +z，往 -z 上楼），y 向上，原点在占地中心的地面；
// 摆放和其他设备一样（position = 中心、rotation.y = -rot）。

import * as THREE from 'three'
import type { Fixture, Vec } from '../model'
import { UNDER_CEIL, stairLayout, stairUnderZone, stairsVariant, stepHollow, subtractSpan, type StairRail } from '../stairs'
import { rbox, toon } from './toon'

const TREAD = '#d6a273'
const BODY = '#f3ece0'
const RAIL = '#8a6a52'
const POST = '#f7f3ec'
const DOOR = '#e2c9a6'
/** 扶手高（离踏面） */
const RAIL_H = 85

/** 两点之间的一根杆（圆柱） */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string) {
  const len = a.distanceTo(b)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.1, len), 8), toon(color))
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  m.castShadow = true
  return m
}

/** 扶手：沿线每个点一根立柱，顶上一根扶手杆 */
function railModel(r: StairRail, g: THREE.Group) {
  const top = r.pts.map((p) => new THREE.Vector3(p.x, p.h + RAIL_H, p.y))
  r.pts.forEach((p, i) => g.add(bar(new THREE.Vector3(p.x, p.h, p.y), top[i], 1.6, POST)))
  for (let i = 0; i + 1 < top.length; i++) {
    g.add(bar(top[i], top[i + 1], 2.4, RAIL))
    // 长段中间补立柱
    const a = r.pts[i]
    const b = r.pts[i + 1]
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 60)
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1)
      const x = a.x + (b.x - a.x) * t
      const z = a.y + (b.y - a.y) * t
      const h = a.h + (b.h - a.h) * t
      g.add(bar(new THREE.Vector3(x, h, z), new THREE.Vector3(x, h + RAIL_H, z), 1.2, POST))
    }
  }
}

/**
 * 楼梯模型。rise：层间高（最后一级和上层地面齐平）。
 * 直跑 / L / U：每级是落地的实心踏步（下面是封起来的楼梯下空间），顶上一块木踏板；旋转楼梯：中心柱 + 悬挑的扇形踏板。
 */
export function stairsModel(f: Fixture, rise: number) {
  const L = stairLayout(f, rise)
  const g = new THREE.Group()
  if (stairsVariant(f) === 'spiral') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, rise + RAIL_H, 16), toon(POST))
    pole.position.y = (rise + RAIL_H) / 2
    pole.castShadow = true
    g.add(pole)
    for (const s of L.steps) {
      const shape = new THREE.Shape(s.poly.map((p) => new THREE.Vector2(p.x, -p.y)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const m = new THREE.Mesh(geo, toon(TREAD))
      m.position.y = s.top - 4
      m.castShadow = true
      m.receiveShadow = true
      g.add(m)
    }
  } else {
    for (const s of L.steps) {
      const xs = s.poly.map((p) => p.x)
      const ys = s.poly.map((p) => p.y)
      const x0 = Math.min(...xs)
      const x1 = Math.max(...xs)
      const z0 = Math.min(...ys)
      const z1 = Math.max(...ys)
      const w = x1 - x0
      const d = z1 - z0
      // 楼梯下敞开的储物角：高处那几级的实心踏步从 UNDER_CEIL 起，下面掏空
      const y0 = stepHollow(f, rise, s) ? UNDER_CEIL : 0
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, Math.max(0.5, s.top - 3 - y0), d), toon(BODY))
      body.position.set((x0 + x1) / 2, y0 + (s.top - 3 - y0) / 2, (z0 + z1) / 2)
      body.castShadow = true
      body.receiveShadow = true
      g.add(body)
      g.add(rbox(w + 0.6, 3, d + 0.6, TREAD, { x: (x0 + x1) / 2, y: s.top - 3, z: (z0 + z1) / 2 }, 0.6))
    }
  }
  for (const r of L.rails) railModel(r, g)
  // 楼梯下封起来的收纳间：开口那一侧（直跑两侧都画，贴墙的一侧被墙挡住）一扇小门
  const uz = f.under === 'closet' ? stairUnderZone(f, rise) : null
  if (uz) {
    const len = uz.y1 - uz.y0
    const dw = Math.min(70, len - 24)
    const dh = UNDER_CEIL - 12
    if (dw > 30)
      for (const n of uz.fronts) {
        const x = n.x > 0 ? uz.x1 : n.x < 0 ? uz.x0 : (uz.x0 + uz.x1) / 2
        const cz = (uz.y0 + uz.y1) / 2
        const panel = rbox(1.2, dh, dw, DOOR, { x: x + n.x * 0.6, y: 2, z: cz }, 0.5)
        panel.castShadow = false
        g.add(panel)
        g.add(rbox(1.4, 2.4, 8, RAIL, { x: x + n.x * 1.4, y: dh * 0.55, z: cz + dw / 2 - 8 }, 0.6))
      }
  }
  g.userData.stairs = true
  return g
}

/** 沿 p → q 的一段地面栏杆（挑空边用）：立柱 + 扶手 + 中间一道横杆，y = 0 是这一层地面 */
export function edgeRail(p: Vec, q: Vec) {
  const g = new THREE.Group()
  railModel(
    {
      pts: [
        { x: p.x, y: p.y, h: 0 },
        { x: q.x, y: q.y, h: 0 },
      ],
    },
    g,
  )
  g.add(bar(new THREE.Vector3(p.x, 40, p.y), new THREE.Vector3(q.x, 40, q.y), 1.2, POST))
  return g
}

/**
 * 楼板洞口四周的栏杆（上层地面坐标，y = 0 是这一层地面）：洞口的每条边去掉贴着墙的部分和出梯口，剩下的装栏杆。
 * walls：这一层的墙段（中心线）和墙厚，边贴着墙（离墙中心线不超过半个墙厚 + 2）就不装。
 */
export function holeRails(poly: Vec[], open: [Vec, Vec] | undefined, walls: { a: Vec; b: Vec; t: number }[]) {
  const g = new THREE.Group()
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 5) continue
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    let spans: [number, number][] = open ? subtractSpan(a, b, open) : [[0, L]]
    // 贴墙的部分：墙段平行、离得近，按投影区间扣掉
    for (const w of walls) {
      const wl = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
      if (wl < 1) continue
      const wu = { x: (w.b.x - w.a.x) / wl, y: (w.b.y - w.a.y) / wl }
      if (Math.abs(wu.x * u.y - wu.y * u.x) > 1e-3) continue
      const off = Math.abs((w.a.x - a.x) * u.y - (w.a.y - a.y) * u.x)
      if (off > w.t / 2 + 2) continue
      const t0 = (w.a.x - a.x) * u.x + (w.a.y - a.y) * u.y
      const t1 = (w.b.x - a.x) * u.x + (w.b.y - a.y) * u.y
      const lo = Math.min(t0, t1)
      const hi = Math.max(t0, t1)
      spans = spans.flatMap(([x, y]): [number, number][] => (hi <= x || lo >= y ? [[x, y]] : ([[x, lo], [hi, y]] as [number, number][]).filter(([p, q]) => q - p > 2)))
    }
    for (const [lo, hi] of spans) {
      const p = { x: a.x + u.x * lo, y: a.y + u.y * lo }
      const q = { x: a.x + u.x * hi, y: a.y + u.y * hi }
      railModel(
        {
          pts: [
            { x: p.x, y: p.y, h: 0 },
            { x: q.x, y: q.y, h: 0 },
          ],
        },
        g,
      )
      // 中间一道横杆
      g.add(bar(new THREE.Vector3(p.x, 40, p.y), new THREE.Vector3(q.x, 40, q.y), 1.2, POST))
    }
  }
  return g
}
