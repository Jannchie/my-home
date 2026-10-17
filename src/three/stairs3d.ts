// 楼梯的 3D 模型、上层楼梯洞口四周的栏杆。踏步布置来自 src/stairs.ts（平面图同一份数据），外观来自 src/stairStyles.ts。
//
// 模型局部坐标：x 沿楼梯宽，z = 平面局部 y（起步在 +z，往 -z 上楼），y 向上，原点在占地中心的地面；
// 摆放和其他设备一样（position = 中心、rotation.y = -rot）。
//
// 扩展方式：踏步下方的做法（StairBody）和扶手的做法（StairRailKind）各是一张「种类 → 搭建函数」的表，
// 样式只是挑选这些种类和配色的组合。

import * as THREE from 'three'
import type { Fixture, Vec } from '../model'
import { stairLayout, stairsVariant, subtractSpan, type StairRail } from '../stairs'
import { stairStyle, type StairBody, type StairRailKind, type StairStyle } from '../stairStyles'
import { rbox, toon } from './toon'

const RAIL = '#8a6a52'
const POST = '#f7f3ec'
/** 扶手高（离踏面） */
const RAIL_H = 85
/** 踏板厚 */
const TREAD_T = 3

/** 墙段（平面坐标的中心线 + 墙厚） */
export type WallLine = { a: Vec; b: Vec; t: number }

/** 两点之间的一根杆（圆柱） */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string) {
  const len = a.distanceTo(b)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.1, len), 8), toon(color))
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  m.castShadow = true
  return m
}

// ---------- 扶手 ----------

/** 一段扶手线 + 靠墙时墙在哪个方向（局部平面坐标的单位向量） */
type RailRun = { pts: StairRail['pts']; toWall?: Vec }
type RailBuilder = (r: RailRun, style: Pick<StairStyle, 'colors'>, g: THREE.Group) => void

/** 立柱 + 扶手杆：沿线每个点一根立柱，长段中间补立柱 */
function balusters(r: RailRun, { colors }: Pick<StairStyle, 'colors'>, g: THREE.Group) {
  const top = r.pts.map((p) => new THREE.Vector3(p.x, p.h + RAIL_H, p.y))
  r.pts.forEach((p, i) => g.add(bar(new THREE.Vector3(p.x, p.h, p.y), top[i], 1.6, colors.post)))
  for (let i = 0; i + 1 < top.length; i++) {
    g.add(bar(top[i], top[i + 1], 2.4, colors.rail))
    const a = r.pts[i]
    const b = r.pts[i + 1]
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 60)
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1)
      const x = a.x + (b.x - a.x) * t
      const z = a.y + (b.y - a.y) * t
      const h = a.h + (b.h - a.h) * t
      g.add(bar(new THREE.Vector3(x, h, z), new THREE.Vector3(x, h + RAIL_H, z), 1.2, colors.post))
    }
  }
}

const glassMat = new THREE.MeshToonMaterial({ color: '#cfe3e8', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })

/** 玻璃栏板：两端立柱，每段一块跟着坡度走的玻璃，顶上扶手杆 */
function glass(r: RailRun, { colors }: Pick<StairStyle, 'colors'>, g: THREE.Group) {
  const top = r.pts.map((p) => new THREE.Vector3(p.x, p.h + RAIL_H, p.y))
  for (const i of [0, r.pts.length - 1]) g.add(bar(new THREE.Vector3(r.pts[i].x, r.pts[i].h, r.pts[i].y), top[i], 2, colors.post))
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i]
    const b = r.pts[i + 1]
    g.add(bar(top[i], top[i + 1], 2.2, colors.rail))
    const geo = new THREE.BufferGeometry()
    const lo = 6
    const hi = RAIL_H - 5
    geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.h + lo, a.y, b.x, b.h + lo, b.y, b.x, b.h + hi, b.y, a.x, a.h + hi, a.y], 3))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, glassMat)
    m.userData.noOutline = true
    g.add(m)
  }
}

/** 靠墙扶手：一根扶手杆，每隔一段一个伸向墙面的托架，没有立柱 */
function wallRail(r: RailRun, { colors }: Pick<StairStyle, 'colors'>, g: THREE.Group) {
  const w = r.toWall ?? { x: 0, y: 0 }
  const top = r.pts.map((p) => new THREE.Vector3(p.x, p.h + RAIL_H, p.y))
  for (let i = 0; i + 1 < top.length; i++) {
    g.add(bar(top[i], top[i + 1], 2.2, colors.rail))
    const len = top[i].distanceTo(top[i + 1])
    const n = Math.max(1, Math.round(len / 80))
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue
      const p = top[i].clone().lerp(top[i + 1], k / n)
      g.add(bar(p.clone().add(new THREE.Vector3(0, -1, 0)), p.clone().add(new THREE.Vector3(w.x * 6, -5, w.y * 6)), 0.8, colors.rail))
    }
  }
}

export const RAIL_BUILDERS: Record<StairRailKind, RailBuilder> = {
  balusters,
  glass,
  wall: wallRail,
  none: () => {},
}

/**
 * 扶手线逐段看是否贴着墙（和墙平行、离墙面不超过 16cm、落在墙段范围里），连续同类的段合成一条：
 * 贴墙的按样式的 railWall 装、敞开的按 railOpen 装。walls 是局部平面坐标。
 */
function splitRail(r: StairRail, walls: WallLine[]): { run: RailRun; wall: boolean }[] {
  const out: { run: RailRun; wall: boolean }[] = []
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i]
    const b = r.pts[i + 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    let toWall: Vec | undefined
    if (L > 1) {
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      for (const w of walls) {
        const wl = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
        if (wl < 1) continue
        const wu = { x: (w.b.x - w.a.x) / wl, y: (w.b.y - w.a.y) / wl }
        if (Math.abs(wu.x * u.y - wu.y * u.x) > 0.02) continue
        const t = (m.x - w.a.x) * wu.x + (m.y - w.a.y) * wu.y
        if (t < 0 || t > wl) continue
        // 墙中心线的法向距离（带符号），减去半个墙厚 = 离墙面
        const n = { x: -wu.y, y: wu.x }
        const s = (m.x - w.a.x) * n.x + (m.y - w.a.y) * n.y
        if (Math.abs(s) - w.t / 2 > 16) continue
        toWall = { x: -Math.sign(s) * n.x, y: -Math.sign(s) * n.y }
        break
      }
    }
    const wall = !!toWall
    const last = out[out.length - 1]
    if (last && last.wall === wall) last.run.pts.push(b)
    else out.push({ run: { pts: [a, b], toWall }, wall })
  }
  return out
}

// ---------- 踏步下方 ----------

type StepRect = { x0: number; x1: number; z0: number; z1: number; top: number }
type Run = { axis: 'x' | 'z'; steps: StepRect[] }
type BodyCtx = { runs: Run[]; rects: StepRect[]; style: StairStyle; againstWall: (a: Vec, b: Vec) => boolean }
type BodyBuilder = (c: BodyCtx, g: THREE.Group) => void

/** 按顺序把踏步分成梯跑：下一级和上一级横向范围相同、沿另一轴首尾相接就接着算同一段 */
function stairRuns(rects: StepRect[]): Run[] {
  const runs: Run[] = []
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  for (const r of rects) {
    const cur = runs[runs.length - 1]
    const prev = cur?.steps[cur.steps.length - 1]
    const alongX = !!prev && near(prev.z0, r.z0) && near(prev.z1, r.z1) && (near(prev.x1, r.x0) || near(prev.x0, r.x1))
    const alongZ = !!prev && near(prev.x0, r.x0) && near(prev.x1, r.x1) && (near(prev.z1, r.z0) || near(prev.z0, r.z1))
    if (cur && ((cur.steps.length === 1 && (alongX || alongZ)) || (cur.axis === 'x' && alongX) || (cur.axis === 'z' && alongZ))) {
      if (cur.steps.length === 1) cur.axis = alongX ? 'x' : 'z'
      cur.steps.push(r)
    } else runs.push({ axis: 'x', steps: [r] })
  }
  return runs
}

/** 梯跑沿行进方向的坐标：每级的起点 / 终点（按上楼方向） */
function runSpans({ axis, steps }: Run) {
  const lo = (r: StepRect) => (axis === 'x' ? r.x0 : r.z0)
  const hi = (r: StepRect) => (axis === 'x' ? r.x1 : r.z1)
  const fwd = steps.length < 2 || lo(steps[1]) >= lo(steps[0]) - 0.5
  return steps.map((r) => (fwd ? [lo(r), hi(r)] : [hi(r), lo(r)]))
}

/** 梯跑横向的两条边（局部平面坐标的线段），和横向范围 */
function runSides(run: Run) {
  const s0 = run.steps[0]
  const sp = runSpans(run)
  const a = Math.min(sp[0][0], sp[sp.length - 1][1])
  const b = Math.max(sp[0][0], sp[sp.length - 1][1])
  return run.axis === 'x'
    ? { c0: s0.z0, c1: s0.z1, sides: [[{ x: a, y: s0.z0 }, { x: b, y: s0.z0 }], [{ x: a, y: s0.z1 }, { x: b, y: s0.z1 }]] as [Vec, Vec][] }
    : { c0: s0.x0, c1: s0.x1, sides: [[{ x: s0.x0, y: a }, { x: s0.x0, y: b }], [{ x: s0.x1, y: a }, { x: s0.x1, y: b }]] as [Vec, Vec][] }
}

/** 把「沿行进方向坐标 u、高度 h、横向坐标 c」换成局部 3D 坐标 */
const at3 = (axis: Run['axis'], u: number, h: number, c: number) => (axis === 'x' ? new THREE.Vector3(u, h, c) : new THREE.Vector3(c, h, u))

/** 一段梯跑的实体：沿行进方向的锯齿截面（底边贴地），沿横向挤出成一整块——一级一个方块的话接缝和各自的描边会在侧面画出竖线 */
function runBody(run: Run, color: string) {
  const { axis, steps } = run
  const span = runSpans(run)
  const pts: THREE.Vector2[] = [new THREE.Vector2(span[0][0], 0)]
  steps.forEach((r, i) => {
    const top = Math.max(0.5, r.top)
    pts.push(new THREE.Vector2(span[i][0], top), new THREE.Vector2(span[i][1], top))
  })
  pts.push(new THREE.Vector2(span[span.length - 1][1], 0))
  const s0 = steps[0]
  const width = axis === 'x' ? s0.z1 - s0.z0 : s0.x1 - s0.x0
  // 截面在 XY 平面（x = 行进方向坐标，y = 高度），沿 z 挤出横向宽度
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: width, bevelEnabled: false })
  const m = new THREE.Mesh(geo, toon(color))
  if (axis === 'x') m.position.z = s0.z0
  else {
    // 局部 x → 世界 z，局部 z → 世界 -x
    m.rotation.y = -Math.PI / 2
    m.position.x = s0.x1
  }
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 每级顶上的木踏板 */
function treads(rects: StepRect[], color: string, g: THREE.Group, t = TREAD_T) {
  for (const r of rects) g.add(rbox(r.x1 - r.x0 + 0.6, t, r.z1 - r.z0 + 0.6, color, { x: (r.x0 + r.x1) / 2, y: r.top + TREAD_T - t, z: (r.z0 + r.z1) / 2 }, 0.6))
}

const solid: BodyBuilder = ({ runs, rects, style }, g) => {
  for (const run of runs) g.add(runBody(run, style.colors.body))
  treads(rects, style.colors.tread, g)
}

/** 实心 + 侧面（不贴墙的一侧）做成柜门：每两级一扇，矮于 50cm 的部分不做 */
const cabinet: BodyBuilder = (c, g) => {
  solid(c, g)
  const door = c.style.colors.door ?? c.style.colors.body
  for (const run of c.runs) {
    if (run.steps.length < 3) continue
    const span = runSpans(run)
    const { c0, c1, sides } = runSides(run)
    sides.forEach(([a, b], k) => {
      if (c.againstWall(a, b)) return
      const cs = k === 0 ? c0 - 0.6 : c1 + 0.6
      for (let i = 0; i + 1 < run.steps.length; i += 2) {
        const h = run.steps[i].top - 8
        if (h < 50) continue
        const u0 = span[i][0]
        const u1 = span[i + 1][1]
        const w = Math.abs(u1 - u0) - 3
        const mid = at3(run.axis, (u0 + u1) / 2, 4 + (h - 4) / 2, cs)
        const panel = run.axis === 'x' ? rbox(w, h - 4, 1.2, door, { x: mid.x, y: 4, z: mid.z }, 0.5) : rbox(1.2, h - 4, w, door, { x: mid.x, y: 4, z: mid.z }, 0.5)
        g.add(panel)
        const knob = at3(run.axis, (u0 + u1) / 2 + (u1 > u0 ? 1 : -1) * (w / 2 - 5), h * 0.6, cs + (k === 0 ? -1.2 : 1.2))
        g.add(rbox(1.6, 6, 1.6, c.style.colors.rail, { x: knob.x, y: knob.y, z: knob.z }, 0.4))
      }
    })
  }
}

/** 镂空：每段梯跑两侧各一根斜梁，踏板架在上面、没有踢面；平台（单级的段）用四根立柱撑起 */
const open: BodyBuilder = ({ runs, style }, g) => {
  const T = 4
  for (const run of runs) {
    const span = runSpans(run)
    const { c0, c1 } = runSides(run)
    if (run.steps.length === 1) {
      const r = run.steps[0]
      g.add(rbox(r.x1 - r.x0, 8, r.z1 - r.z0, style.colors.body, { x: (r.x0 + r.x1) / 2, y: r.top - 8, z: (r.z0 + r.z1) / 2 }, 0.6))
      for (const x of [r.x0 + 3, r.x1 - 3]) for (const z of [r.z0 + 3, r.z1 - 3]) g.add(rbox(5, r.top - 8, 5, style.colors.body, { x, z }, 0.5))
    } else {
      // 斜梁：从第一级起点的地面到最后一级终点的踏面下，截面 20 高
      const last = run.steps[run.steps.length - 1]
      for (const c of [c0 + 2.5, c1 - 2.5]) {
        const a = at3(run.axis, span[0][0], 0, c)
        const b = at3(run.axis, span[span.length - 1][1], last.top, c)
        const dir = b.clone().sub(a)
        const len = dir.length()
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 20, 5), toon(style.colors.body))
        beam.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -6, 0))
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize())
        beam.castShadow = true
        g.add(beam)
      }
    }
    treads(run.steps, style.colors.tread, g, T)
  }
}

export const BODY_BUILDERS: Record<StairBody, BodyBuilder> = { solid, cabinet, open }

/**
 * 楼梯模型。rise：层间高（最后一级和上层地面齐平）。walls：所在楼层的墙段（平面坐标），用来判断哪边贴墙。
 * 直跑 / L / U：踏步下方和扶手按外观样式搭；旋转楼梯：中心柱 + 悬挑的扇形踏板，扶手同样按样式。
 */
export function stairsModel(f: Fixture, rise: number, walls: WallLine[] = []) {
  const L = stairLayout(f, rise)
  const style = stairStyle(f)
  const g = new THREE.Group()
  // 墙段换到楼梯局部平面坐标（stairToWorld 的逆变换）
  const a = (f.rot * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const toLocal = (p: Vec): Vec => ({ x: (p.x - f.x) * cos + (p.y - f.y) * sin, y: -(p.x - f.x) * sin + (p.y - f.y) * cos })
  const local = walls.map((w) => ({ a: toLocal(w.a), b: toLocal(w.b), t: w.t }))
  if (stairsVariant(f) === 'spiral') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, rise + RAIL_H, 16), toon(style.colors.post))
    pole.position.y = (rise + RAIL_H) / 2
    pole.castShadow = true
    g.add(pole)
    for (const s of L.steps) {
      const shape = new THREE.Shape(s.poly.map((p) => new THREE.Vector2(p.x, -p.y)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const m = new THREE.Mesh(geo, toon(style.colors.tread))
      m.position.y = s.top - 4
      m.castShadow = true
      m.receiveShadow = true
      g.add(m)
    }
  } else {
    const rects = L.steps.map((s) => {
      const xs = s.poly.map((p) => p.x)
      const ys = s.poly.map((p) => p.y)
      return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...ys), z1: Math.max(...ys), top: s.top - TREAD_T }
    })
    const againstWall = (p: Vec, q: Vec) => splitRail({ pts: [{ ...p, h: 0 }, { ...q, h: 0 }] }, local)[0]?.wall ?? false
    BODY_BUILDERS[style.body]({ runs: stairRuns(rects), rects, style, againstWall }, g)
  }
  for (const r of L.rails)
    for (const { run, wall } of splitRail(r, local)) RAIL_BUILDERS[wall ? style.railWall : style.railOpen](run, style, g)
  g.userData.stairs = true
  return g
}

/** 洞口栏杆用的立柱扶手 */
function railModel(r: StairRail, g: THREE.Group) {
  balusters({ pts: r.pts }, { colors: { tread: '', body: '', rail: RAIL, post: POST } }, g)
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
