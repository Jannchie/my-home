// 3D 设计图：把户型画成建筑轴测图——细线框 + 浅色填充，外墙尺寸线、楼面标高、房间名与面积，导出高分辨率 PNG。
//
// 和沙盘共用一个 WebGL 画布（stage.renderer），但场景、相机、视角控制都是自己的：进入设计图时沙盘停画，退出时沙盘接着画。
//
// 画法：
// - 房子另搭一份「素模」（building.ts bare：不要底座和用地），墙默认剖切在 CUT_H（像平面图的剖切高度），也可以画完整墙高 + 屋顶。
// - 每个网格按 EdgesGeometry 取硬边（按夹角阈值），按部件分主次：墙 / 门窗 / 设备 / 家具，线宽和颜色依次变浅；
//   同时把三角形并成几张大网格画填充（向后推一点深度），线条被前面的东西挡住，就是消隐线。
// - 墙的剖切面（墙顶）涂成实心色块（poché），侧面按朝向略微分出明暗，不打光、没有阴影。
// - 外轮廓转角的线往外出头，墙的长水平线两端略出头，像手绘 / CAD 的构造线；地面一层淡淡的 1m 网格。
// - 线用 LineSegments2（屏幕像素线宽，导出放大时线宽按比例放大）。
// - 文字是画在 canvas 上的贴图精灵（面向屏幕，按屏幕像素定大小，不随缩放变糊）；尺寸文字沿尺寸线方向旋转。
//   每次视角变化重新排一遍：放不下（尺寸线在屏幕上比文字短）或和优先级更高的文字重叠就藏起来。
// - 只显示朝向镜头的两条边上的尺寸，转过去时换边；竖向尺寸（标高）放在屏幕左侧的外轮廓角上。
//
// 性能：结构线框只在户型形状 / 墙体画法变了时重算；家具线框按素材（+ 柜门开合）缓存三角形和边，摆放时只做矩阵变换。
// 渲染只在视角或内容变化时进行。

import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildBuilding } from './building'
import { BASE, floorY, furnitureModel, placeFurniture } from './house'
import { ASSET_MAP } from './assets'
import { floorAnnotations, fmtDim, fmtLevel, topLevel, SIDES, SIDE_NORMAL, type DimUnit, type FloorAnno, type Side } from '../dimensions'
import { floorOf, planFloors } from '../floors'
import { bbox, fmtRoomArea, type Box, type Furniture, type Plan, type Vec } from '../model'
import { roomName, t } from '../i18n'

// ---------- 设置与配色 ----------

export type Paper = 'white' | 'blue'
export type FurnitureShow = 'all' | 'large' | 'none'
export type WallShow = 'cut' | 'full'
export type FloorLayout = 'stack' | 'explode'

export interface BlueprintOptions {
  paper: Paper
  furniture: FurnitureShow
  walls: WallShow
  ortho: boolean
  unit: DimUnit
  layout: FloorLayout
}

/** 剖切高度（cm）：窗台以上一点，门窗、家具都看得见 */
export const CUT_H = 140
/** 分层拉开时层与层之间多拉开的距离 */
export const BP_EXPLODE = 300

type LineClass = 'wall' | 'opening' | 'fixture' | 'furniture' | 'construct' | 'dim' | 'grid'
type FillClass = 'floor' | 'wall' | 'solid' | 'furniture'
const LINE_CLASSES: LineClass[] = ['wall', 'opening', 'fixture', 'furniture', 'construct', 'dim', 'grid']
const FILL_CLASSES: FillClass[] = ['floor', 'wall', 'solid', 'furniture']

interface Palette {
  bg: string
  fill: Record<FillClass, string>
  /** 墙的剖切面 */
  poche: string
  line: Record<LineClass, string>
  /** 侧面变暗的幅度 */
  shade: number
  text: string
  textSoft: string
}

export const PAPERS: Record<Paper, Palette> = {
  // 白纸：墨色线条，剖切面深灰蓝，标注用一点钢蓝
  white: {
    bg: '#fbfbf9',
    fill: { floor: '#ffffff', wall: '#f2f3f2', solid: '#fbfbfa', furniture: '#ffffff' },
    poche: '#38434c',
    line: { wall: '#1f2a33', opening: '#46525c', fixture: '#56626c', furniture: '#98a2aa', construct: '#a9b3ba', dim: '#35607f', grid: '#e7eaeb' },
    shade: 0.06,
    text: '#1f2a33',
    textSoft: '#5e6a73',
  },
  // 晒图纸：深蓝底、白线
  blue: {
    bg: '#1d4a72',
    fill: { floor: '#21507a', wall: '#24567f', solid: '#22527c', furniture: '#22527c' },
    poche: '#d9e6f1',
    line: { wall: '#f2f7fb', opening: '#d3e2ef', fixture: '#c3d6e7', furniture: '#86abca', construct: '#7aa1c2', dim: '#ffffff', grid: '#285a85' },
    shade: -0.05,
    text: '#f5f9fc',
    textSoft: '#b9cfe2',
  },
}

/** 线宽（CSS 像素） */
const WIDTH: Record<LineClass, number> = { wall: 1.5, opening: 1, fixture: 0.9, furniture: 0.7, construct: 0.7, dim: 0.85, grid: 0.6 }
/** 硬边的夹角阈值（度）：家具放宽一点，少一些曲面上的碎线 */
const EDGE_ANGLE = { building: 20, furniture: 32 }

// ---------- 几何收集 ----------

/** 可增长的 Float32 缓冲 */
class Buf {
  data = new Float32Array(1024)
  n = 0
  reserve(k: number) {
    if (this.n + k <= this.data.length) return
    let len = this.data.length * 2
    while (len < this.n + k) len *= 2
    const d = new Float32Array(len)
    d.set(this.data.subarray(0, this.n))
    this.data = d
  }
  push(...v: number[]) {
    this.reserve(v.length)
    for (const x of v) this.data[this.n++] = x
  }
  /** 一段线 */
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    this.reserve(6)
    const d = this.data
    let n = this.n
    d[n++] = ax
    d[n++] = ay
    d[n++] = az
    d[n++] = bx
    d[n++] = by
    d[n++] = bz
    this.n = n
  }
  /** 把 src（xyz 连续）经矩阵变换后追加 */
  pushTransformed(src: Float32Array, m: THREE.Matrix4) {
    this.reserve(src.length)
    const e = m.elements
    const d = this.data
    let n = this.n
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i]
      const y = src[i + 1]
      const z = src[i + 2]
      d[n++] = e[0] * x + e[4] * y + e[8] * z + e[12]
      d[n++] = e[1] * x + e[5] * y + e[9] * z + e[13]
      d[n++] = e[2] * x + e[6] * y + e[10] * z + e[14]
    }
    this.n = n
  }
  out() {
    return this.data.slice(0, this.n)
  }
}

export type LineSet = Record<LineClass, Float32Array>
export type FillSet = Record<FillClass, Float32Array>
const emptyLines = (): Record<LineClass, Buf> => Object.fromEntries(LINE_CLASSES.map((k) => [k, new Buf()])) as Record<LineClass, Buf>
const emptyFills = (): Record<FillClass, Buf> => Object.fromEntries(FILL_CLASSES.map((k) => [k, new Buf()])) as Record<FillClass, Buf>
const outLines = (b: Record<LineClass, Buf>) => Object.fromEntries(LINE_CLASSES.map((k) => [k, b[k].out()])) as LineSet
const outFills = (b: Record<FillClass, Buf>) => Object.fromEntries(FILL_CLASSES.map((k) => [k, b[k].out()])) as FillSet

/** 几何体的硬边（xyz 成对），按几何体和阈值缓存 */
const edgeCache = new WeakMap<THREE.BufferGeometry, Map<number, Float32Array>>()
function hardEdges(geo: THREE.BufferGeometry, angle: number) {
  let m = edgeCache.get(geo)
  if (!m) edgeCache.set(geo, (m = new Map()))
  let v = m.get(angle)
  if (!v) {
    const eg = new THREE.EdgesGeometry(geo, angle)
    v = (eg.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    v = new Float32Array(v)
    eg.dispose()
    m.set(angle, v)
  }
  return v
}

/** 几何体展开成三角形顶点（xyz，非索引） */
const triCache = new WeakMap<THREE.BufferGeometry, Float32Array>()
function triangles(geo: THREE.BufferGeometry) {
  let v = triCache.get(geo)
  if (v) return v
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return new Float32Array(0)
  const idx = geo.index
  const start = geo.drawRange.start
  const count = Math.min(geo.drawRange.count, idx ? idx.count : pos.count)
  v = new Float32Array(Math.max(0, count) * 3)
  for (let i = 0; i < count; i++) {
    const k = idx ? idx.getX(start + i) : start + i
    v[i * 3] = pos.getX(k)
    v[i * 3 + 1] = pos.getY(k)
    v[i * 3 + 2] = pos.getZ(k)
  }
  triCache.set(geo, v)
  return v
}

/** 材质是不是半透明的（楼层淡出、选中透视换上的副本按原材质算） */
function isGlassy(mat: THREE.Material | THREE.Material[]) {
  const ms = Array.isArray(mat) ? mat : [mat]
  return ms.every((m) => {
    const src = (m.userData?.floorSource as THREE.Material | undefined) ?? m
    return src.transparent && src.opacity < 0.95
  })
}

/** 网格在房子里属于哪一类：返回 null = 不画（窗帘、边饰、小五金、描边壳） */
function classify(mesh: THREE.Object3D, stop: THREE.Object3D, walls: WallShow): { line: LineClass; fill: FillClass } | null {
  let part: string | undefined
  let roof = false
  let stairs = false
  for (let o: THREE.Object3D | null = mesh; o && o !== stop; o = o.parent) {
    if (o.userData.isOutline) return null
    if (!o.visible) return null
    if (o.userData.roof) roof = true
    if (o.userData.stairs) stairs = true
    if (!part && typeof o.userData.part === 'string') part = o.userData.part
  }
  if (roof) return walls === 'full' ? { line: 'wall', fill: 'solid' } : null
  if (stairs) return { line: 'fixture', fill: 'solid' }
  switch (part) {
    case 'curtain':
    case 'trim':
    case 'detail':
      return null
    case 'wall':
      return { line: 'wall', fill: 'wall' }
    case 'floor':
      return { line: 'opening', fill: 'floor' }
    case 'fixture':
      return { line: 'fixture', fill: 'solid' }
    default:
      // 门窗、栏杆、外墙装饰
      return { line: 'opening', fill: 'solid' }
  }
}

const _m = new THREE.Matrix4()
const _inv = new THREE.Matrix4()
const _inst = new THREE.Matrix4()

/** 把 root 下的网格的边和三角形收进 lines / fills（坐标相对 stop） */
function collect(root: THREE.Object3D, stop: THREE.Object3D, pick: (mesh: THREE.Mesh) => { line: LineClass; fill: FillClass } | null, angle: number, lines: Record<LineClass, Buf>, fills: Record<FillClass, Buf>) {
  stop.updateWorldMatrix(true, true)
  _inv.copy(stop.matrixWorld).invert()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.isOutline || mesh.userData.fadeTwin) return
    const cls = pick(mesh)
    if (!cls) return
    const geo = mesh.geometry
    if (!geo?.getAttribute('position')) return
    const edges = hardEdges(geo, angle)
    const glassy = isGlassy(mesh.material)
    const tris = glassy ? null : triangles(geo)
    const each = (mat: THREE.Matrix4) => {
      lines[cls.line].pushTransformed(edges, mat)
      if (tris) fills[cls.fill].pushTransformed(tris, mat)
    }
    _m.multiplyMatrices(_inv, mesh.matrixWorld)
    const im = mesh as THREE.InstancedMesh
    if (im.isInstancedMesh) {
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _inst)
        each(_inst.premultiply(_m))
      }
    } else each(_m)
  })
}

/** 长的水平线两端各出头 ext（墙顶、墙脚的长线，像手绘的构造线） */
function overshoot(buf: Buf, ext: number, minLen: number) {
  const d = buf.data
  for (let i = 0; i < buf.n; i += 6) {
    const dx = d[i + 3] - d[i]
    const dy = d[i + 4] - d[i + 1]
    const dz = d[i + 5] - d[i + 2]
    const L = Math.hypot(dx, dy, dz)
    if (L < minLen || Math.abs(dy) > 0.5) continue
    const k = ext / L
    d[i] -= dx * k
    d[i + 2] -= dz * k
    d[i + 3] += dx * k
    d[i + 5] += dz * k
  }
}

export interface StructureFloor {
  floorId: string
  elevation: number
  /** 这一层画出来的墙高（剖切高度或满高） */
  wallTop: number
  lines: LineSet
  fills: FillSet
}

/** 户型的结构线框与填充（每层，坐标相对本层地面）。墙剖切时每层墙高 = min(CUT_H, 层高) */
export function structureGeometry(plan: Plan, walls: WallShow): StructureFloor[] {
  const fs = planFloors(plan)
  const cutFor = (h: number) => (walls === 'cut' ? Math.min(CUT_H, h) : h)
  const single = fs[0].height
  const built = buildBuilding(plan, cutFor(single), (f) => cutFor(f.height), { bare: true })
  const pts = plan.rooms.flatMap((r) => r.points)
  const size = pts.length ? Math.max(bbox(pts).x1 - bbox(pts).x0, bbox(pts).y1 - bbox(pts).y0) : 600
  const ext = Math.min(18, Math.max(8, size * 0.012))
  const out = built.floors.map((fg) => {
    const lines = emptyLines()
    const fills = emptyFills()
    collect(fg.group, fg.group, (m) => classify(m, fg.group, walls), EDGE_ANGLE.building, lines, fills)
    overshoot(lines.wall, ext, 90)
    return { floorId: fg.floor.id, elevation: fg.floor.elevation, wallTop: fg.wallH, lines: outLines(lines), fills: outFills(fills) }
  })
  // 素模用完就丢（几何体在上面已经展开拷贝出来了）
  built.root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose()
  })
  return out
}

/** 「只显示大件」：床、沙发、桌、柜、大家电这类落地的大东西 */
export function isLargeFurniture(f: Furniture) {
  const d = ASSET_MAP.get(f.asset)
  if (!d || d.prop || d.mount || (f.z ?? 0) > 0) return false
  const a = d.w * d.d
  return a >= 3600 || (d.h >= 120 && a >= 1800)
}

/** 家具按素材缓存的局部线框与三角形（柜门开合影响形状） */
const furnCache = new Map<string, { edges: Float32Array; tris: Float32Array }>()
const furnKey = (f: Furniture) => `${f.asset}#${f.open ? 1 : 0}`

function furnitureLocal(f: Furniture, obj: THREE.Object3D) {
  const key = furnKey(f)
  let c = furnCache.get(key)
  if (c) return c
  const lines = emptyLines()
  const fills = emptyFills()
  const holder = obj
  collect(holder, holder, (m) => {
    for (let o: THREE.Object3D | null = m; o && o !== holder; o = o.parent) if (!o.visible || o.userData.isOutline) return null
    return { line: 'furniture', fill: 'furniture' }
  }, EDGE_ANGLE.furniture, lines, fills)
  c = { edges: lines.furniture.out(), tris: fills.furniture.out() }
  furnCache.set(key, c)
  return c
}

export interface FurnitureFloor {
  floorId: string
  lines: Float32Array
  fills: Float32Array
}

/**
 * 家具线框（每层，坐标相对本层地面）。model 给出已经搭好、摆好的家具模型（沙盘里现成的），没有时现搭一个。
 */
export function furnitureGeometry(plan: Plan, show: FurnitureShow, model?: (f: Furniture) => THREE.Object3D | undefined): FurnitureFloor[] {
  const fs = planFloors(plan)
  const per = new Map(fs.map((f) => [f.id, { lines: new Buf(), fills: new Buf() }]))
  if (show !== 'none') {
    const elev = new Map(fs.map((f) => [f.id, f.elevation]))
    const m = new THREE.Matrix4()
    for (const f of plan.furniture) {
      if (show === 'large' && !isLargeFurniture(f)) continue
      if (!ASSET_MAP.has(f.asset)) continue
      let obj = model?.(f)
      let temp = false
      if (!obj) {
        obj = furnitureModel(f)
        temp = true
      }
      const local = furnitureLocal(f, obj)
      // 摆放矩阵：按户型数据重算（和沙盘的 placeFurniture 一致），再减掉楼层标高
      const holder = new THREE.Object3D()
      placeFurniture(holder, plan, f)
      holder.updateMatrix()
      const fid = floorOf(plan, f)
      m.makeTranslation(0, -(elev.get(fid) ?? 0), 0).multiply(holder.matrix)
      const dst = per.get(fid)
      if (dst) {
        dst.lines.pushTransformed(local.edges, m)
        dst.fills.pushTransformed(local.tris, m)
      }
      if (temp) obj.traverse((o) => (o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.userData.shared && (o as THREE.Mesh).geometry.dispose())
    }
  }
  return fs.map((f) => ({ floorId: f.id, lines: per.get(f.id)!.lines.out(), fills: per.get(f.id)!.fills.out() }))
}

/** 家具占地（旋转后的包围盒）：房间名避开它们 */
function furnitureBoxes(plan: Plan, show: FurnitureShow): Map<string, Box[]> {
  const out = new Map<string, Box[]>()
  if (show === 'none') return out
  for (const f of plan.furniture) {
    const d = ASSET_MAP.get(f.asset)
    if (!d || d.prop || d.mount || (show === 'large' && !isLargeFurniture(f))) continue
    const a = (f.rot * Math.PI) / 180
    const hw = (Math.abs(Math.cos(a)) * d.w + Math.abs(Math.sin(a)) * d.d) / 2
    const hd = (Math.abs(Math.sin(a)) * d.w + Math.abs(Math.cos(a)) * d.d) / 2
    const id = floorOf(plan, f)
    const list = out.get(id) ?? []
    list.push({ x0: f.x - hw, y0: f.y - hd, x1: f.x + hw, y1: f.y + hd })
    out.set(id, list)
  }
  return out
}

// ---------- 标注的线 ----------

/** 平面点 → 本层局部坐标（x, y, z = 平面 y） */
const V = (p: Vec, y: number) => new THREE.Vector3(p.x, y, p.y)

/** 尺寸线：尺寸线本身两端出头、尺寸界线从建筑引到尺寸线外、两端 45° 斜杠 */
function dimLines(anno: FloorAnno, y: number): Map<Side, Buf> {
  const out = new Map<Side, Buf>(SIDES.map((s) => [s, new Buf()]))
  const over = 12
  const tick = 9
  for (const d of anno.dims) {
    const b = out.get(d.side)!
    const ux = d.b.x - d.a.x
    const uy = d.b.y - d.a.y
    const L = Math.hypot(ux, uy) || 1
    const u = { x: ux / L, y: uy / L }
    const n = SIDE_NORMAL[d.side]
    b.seg(d.a.x - u.x * over, y, d.a.y - u.y * over, d.b.x + u.x * over, y, d.b.y + u.y * over)
    for (const [from, at] of [
      [d.fromA, d.a],
      [d.fromB, d.b],
    ] as const) {
      b.seg(from.x, y, from.y, at.x + n.x * 15, y, at.y + n.y * 15)
      // 斜杠：沿 (u + n) 方向
      const sx = ((u.x + n.x) / Math.SQRT2) * tick
      const sz = ((u.y + n.y) / Math.SQRT2) * tick
      b.seg(at.x - sx, y, at.y - sz, at.x + sx, y, at.y + sz)
    }
  }
  return out
}

/** 外轮廓（外皮）凸角处的构造线：地面、墙顶两圈的边往外出头，转角的竖线上下出头 */
function constructionLines(face: Vec[], y0: number, y1: number, ext: number, buf: Buf) {
  const n = face.length
  let area2 = 0
  for (let i = 0; i < n; i++) area2 += face[i].x * face[(i + 1) % n].y - face[(i + 1) % n].x * face[i].y
  const s = area2 >= 0 ? 1 : -1
  for (let i = 0; i < n; i++) {
    const p = face[(i + n - 1) % n]
    const c = face[i]
    const q = face[(i + 1) % n]
    const cross = (c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x)
    if (cross * s <= 0) continue // 凹角不出头
    const d1 = { x: c.x - p.x, y: c.y - p.y }
    const d2 = { x: c.x - q.x, y: c.y - q.y }
    const l1 = Math.hypot(d1.x, d1.y) || 1
    const l2 = Math.hypot(d2.x, d2.y) || 1
    for (const y of [y0, y1]) {
      buf.seg(c.x, y, c.y, c.x + (d1.x / l1) * ext, y, c.y + (d1.y / l1) * ext)
      buf.seg(c.x, y, c.y, c.x + (d2.x / l2) * ext, y, c.y + (d2.y / l2) * ext)
    }
    buf.seg(c.x, y0 - ext, c.y, c.x, y0, c.y)
    buf.seg(c.x, y1, c.y, c.x, y1 + ext, c.y)
  }
}

// ---------- 文字贴图 ----------

/** 贴图的像素密度（相对 CSS 像素）：导出 3× 也够清楚 */
const TEX_SCALE = 4
const MONO = "'Berkeley Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
function sansFont() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim()
    return v || 'system-ui, sans-serif'
  } catch {
    return 'system-ui, sans-serif'
  }
}

let fontsReady: Promise<void> | null = null
/** 等 Berkeley Mono 加载完（canvas 里用的字体必须先加载，不然画成回退字体） */
export function loadBlueprintFonts() {
  if (!fontsReady) {
    const fonts = typeof document !== 'undefined' ? (document as Document).fonts : undefined
    fontsReady = fonts?.load ? Promise.all([fonts.load(`24px ${MONO}`), fonts.load(`bold 24px ${MONO}`)]).then(() => undefined, () => undefined) : Promise.resolve()
  }
  return fontsReady
}

interface TextRun {
  text: string
  font: string
  size: number
  color: string
}

/** 一行或几行字画成贴图：带底色描边（压断后面的线），返回贴图和 CSS 像素尺寸 */
function textTexture(rows: TextRun[][], halo: string, pad = 3, mark?: { color: string }) {
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  const fontOf = (r: TextRun) => `${r.font.startsWith('bold ') ? '600 ' : ''}${r.size}px ${r.font.replace(/^bold /, '')}`
  const lineH = (row: TextRun[]) => Math.max(...row.map((r) => r.size)) * 1.25
  const widths = rows.map((row) =>
    row.reduce((w, r) => {
      g.font = fontOf(r)
      return w + (g.measureText(r.text).width || r.text.length * r.size * 0.6)
    }, 0),
  )
  const markW = mark ? 11 : 0
  const w = Math.ceil(Math.max(...widths) + markW + pad * 2)
  const h = Math.ceil(rows.reduce((s, row) => s + lineH(row), 0) + pad * 2 - 2)
  cv.width = Math.max(2, w * TEX_SCALE)
  cv.height = Math.max(2, h * TEX_SCALE)
  g.scale(TEX_SCALE, TEX_SCALE)
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  let y = pad - 1
  rows.forEach((row, i) => {
    const lh = lineH(row)
    let x = (w - widths[i] - markW) / 2 + markW
    if (mark && i === 0) {
      // 标高符号：倒三角，尖端在行中线下
      const cy = y + lh / 2
      g.beginPath()
      g.moveTo(x - markW + 1, cy - 3.5)
      g.lineTo(x - 3, cy - 3.5)
      g.lineTo(x - markW / 2 - 1, cy + 3.5)
      g.closePath()
      g.lineWidth = 2.5
      g.strokeStyle = halo
      g.stroke()
      g.lineWidth = 1
      g.strokeStyle = mark.color
      g.stroke()
    }
    for (const r of row) {
      g.font = fontOf(r)
      g.lineWidth = 3.2
      g.strokeStyle = halo
      g.strokeText(r.text, x, y + lh / 2)
      g.fillStyle = r.color
      g.fillText(r.text, x, y + lh / 2)
      x += g.measureText(r.text).width || r.text.length * r.size * 0.6
    }
    y += lh
  })
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  return { tex, w, h }
}

type LabelKind = 'level' | 'overall' | 'dim' | 'vdim' | 'room'
const PRIO: Record<LabelKind, number> = { level: 5, overall: 4, vdim: 3, dim: 2, room: 1 }

interface Label {
  sprite: THREE.Sprite
  kind: LabelKind
  w: number
  h: number
  floorId: string
  side?: Side
  /** 尺寸线两端（本层局部坐标）：文字沿它旋转，屏幕上比文字短时不显示 */
  span?: [THREE.Vector3, THREE.Vector3]
  /** 竖向尺寸：文字转 90° */
  vertical?: boolean
}

// ---------- 场景 ----------

interface FloorNode {
  id: string
  elevation: number
  wallTop: number
  anno: FloorAnno
  group: THREE.Group
  structure: THREE.Group
  furniture: THREE.Group
  /** 尺寸线（按边分组，不朝镜头的边藏起来） */
  sides: Map<Side, THREE.Object3D>
  annoGroup: THREE.Group
  vertical: THREE.Group
}

export interface BlueprintInput {
  plan: Plan
  /** 沙盘里现成的家具模型（按 id），没有时现搭 */
  model?: (f: Furniture) => THREE.Object3D | undefined
}

/** 填充材质：纯色，按面的朝向（屏幕导数求法线）分出一点明暗；剖切面（墙顶）涂实心 */
function fillMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uPoche: { value: new THREE.Color() }, uShade: { value: 0.06 }, uCut: { value: -1e6 } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying float vY;
      void main() {
        vY = position.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uPoche;
      uniform float uShade;
      uniform float uCut;
      varying vec3 vW;
      varying float vY;
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        vec3 c = uColor;
        if (abs(n.y) > 0.7) {
          if (abs(vY - uCut) < 1.2) c = uPoche;
        } else {
          c *= 1.0 - uShade * (abs(n.x) > abs(n.z) ? 1.0 : 0.55);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
    toneMapped: false,
  })
}

/** 设计图视图：自己的场景、正交 / 透视相机、视角控制，画在沙盘的画布上 */
export class BlueprintView {
  readonly scene = new THREE.Scene()
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60000)
  readonly persp = new THREE.PerspectiveCamera(30, 1, 5, 60000)
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = this.ortho
  readonly controls: OrbitControls
  active = false
  opts: BlueprintOptions = { paper: 'white', furniture: 'all', walls: 'cut', ortho: true, unit: 'mm', layout: 'explode' }

  private root = new THREE.Group()
  private floors: FloorNode[] = []
  private labels: Label[] = []
  private lineMats = new Map<LineClass, LineMaterial>()
  private fillMats = new Map<FillClass, THREE.ShaderMaterial>()
  private size = { w: 1, h: 1 }
  /** 正交相机取景的半高（世界单位，zoom = 1 时） */
  private halfH = 600
  private needsRender = true
  private needsLayout = true
  private plan: Plan | null = null
  private model: BlueprintInput['model']
  private structKey = ''
  private furnKey = ''
  private labelKey = ''
  private structCache: StructureFloor[] = []
  private furnGeo: FurnitureFloor[] = []
  /** 竖向尺寸放在哪个角（变了才重排） */
  private cornerKey = ''
  /** 全部楼层外皮的包围盒（平面坐标） */
  private unionBox: Box | null = null
  private prevClear = { color: new THREE.Color(), alpha: 0 }

  constructor(
    private renderer: THREE.WebGLRenderer,
    dom: HTMLElement,
  ) {
    for (const k of LINE_CLASSES) {
      const m = new LineMaterial({ color: 0x000000, linewidth: WIDTH[k], worldUnits: false })
      m.toneMapped = false
      if (k === 'grid' || k === 'construct') {
        m.transparent = true
        m.depthWrite = false
      }
      this.lineMats.set(k, m)
    }
    for (const k of FILL_CLASSES) this.fillMats.set(k, fillMaterial())
    this.scene.add(this.root)
    const c = new OrbitControls(this.ortho, dom)
    c.enableDamping = true
    c.dampingFactor = 0.12
    c.screenSpacePanning = true
    c.minZoom = 0.15
    c.maxZoom = 14
    c.minDistance = 100
    c.maxDistance = 30000
    c.maxPolarAngle = Math.PI / 2 - 0.02
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    c.enabled = false
    c.addEventListener('change', () => {
      this.needsRender = true
      this.needsLayout = true
    })
    this.controls = c
    this.applyPaper()
    void loadBlueprintFonts().then(() => {
      // 字体到了：文字重画
      this.labelKey = ''
      if (this.active && this.plan) this.sync()
    })
  }

  // ---------- 进入 / 退出 ----------

  enter(input: BlueprintInput, opts: BlueprintOptions) {
    this.opts = { ...opts }
    this.plan = input.plan
    this.model = input.model
    const fresh = !this.floors.length
    this.sync()
    this.active = true
    this.controls.enabled = true
    this.renderer.getClearColor(this.prevClear.color)
    this.prevClear.alpha = this.renderer.getClearAlpha()
    this.setOrtho(this.opts.ortho, true)
    if (fresh || !this.viewed) this.resetView()
    this.needsRender = true
  }

  exit() {
    this.active = false
    this.controls.enabled = false
    this.renderer.setClearColor(this.prevClear.color, this.prevClear.alpha)
    // 设计图场景没有投影：沙盘的阴影贴图标记不受影响，但保险起见让它重画一次
    this.renderer.shadowMap.needsUpdate = true
  }

  /** 户型变了（沙盘的家具模型也同步好之后调用） */
  update(input: BlueprintInput) {
    this.plan = input.plan
    this.model = input.model
    if (this.active) this.sync()
  }

  setOptions(opts: BlueprintOptions) {
    const prev = this.opts
    this.opts = { ...opts }
    if (prev.paper !== opts.paper || prev.walls !== opts.walls) this.applyPaper()
    if (prev.ortho !== opts.ortho && this.active) this.setOrtho(opts.ortho)
    if (this.plan && this.active) this.sync()
    this.needsRender = true
    this.needsLayout = true
  }

  // ---------- 搭场景 ----------

  /** 按需重算结构 / 家具 / 标注（各自有缓存键） */
  private sync() {
    const plan = this.plan
    if (!plan) return
    const { walls, furniture, unit, paper, layout } = this.opts
    const shape = JSON.stringify([plan.rooms.map((r) => [r.id, r.kind, r.points, r.floor, r.flush, r.railing, r.openGroup, r.name]), plan.openings, plan.fixtures, plan.wall, plan.wallOuter, plan.floors, !!plan.exterior && JSON.stringify(plan.exterior)])
    const sKey = `${walls}|${shape}`
    let rebuilt = false
    if (sKey !== this.structKey) {
      this.structCache = structureGeometry(plan, walls)
      this.structKey = sKey
      rebuilt = true
    }
    const fKey = `${furniture}|${JSON.stringify(plan.furniture.map((f) => [f.asset, f.x, f.y, f.z, f.rot, f.floor, f.open]))}|${plan.floors?.length ?? 0}`
    const furnChanged = fKey !== this.furnKey
    if (furnChanged) {
      this.furnGeo = furnitureGeometry(plan, furniture, this.model)
      this.furnKey = fKey
    }
    const lKey = `${sKey}|${furnChanged ? fKey : this.furnKey}|${unit}|${paper}|${t('设计图')}|${furniture}`
    if (rebuilt || furnChanged || lKey !== this.labelKey) {
      this.rebuildScene(plan, rebuilt || !this.floors.length, furnChanged || rebuilt)
      this.labelKey = lKey
    }
    this.applyLayout(layout)
    this.needsRender = true
    this.needsLayout = true
  }

  private lineObj(cls: LineClass, pos: Float32Array) {
    if (pos.length < 6) return null
    const g = new LineSegmentsGeometry()
    g.setPositions(pos)
    const l = new LineSegments2(g, this.lineMats.get(cls)!)
    l.renderOrder = cls === 'grid' ? -1 : 1
    l.frustumCulled = false
    return l
  }

  private fillObj(cls: FillClass, pos: Float32Array) {
    if (pos.length < 9) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.Mesh(g, this.fillMats.get(cls)!)
    m.frustumCulled = false
    return m
  }

  private disposeGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const sp = o as THREE.Sprite
      if (sp.isSprite) {
        sp.material.map?.dispose()
        sp.material.dispose()
      }
    })
    g.removeFromParent()
  }

  private rebuildScene(plan: Plan, structure: boolean, furniture: boolean) {
    const fs = planFloors(plan)
    const pal = PAPERS[this.opts.paper]
    const boxes = furnitureBoxes(plan, this.opts.furniture)
    const annos = floorAnnotations(plan, (id) => boxes.get(id) ?? [])
    // 楼层节点：楼层表变了就整个重来
    if (structure || this.floors.length !== fs.length || this.floors.some((n, i) => n.id !== fs[i].id)) {
      for (const n of this.floors) this.disposeGroup(n.group)
      this.floors = fs.map((f) => {
        const group = new THREE.Group()
        const node: FloorNode = { id: f.id, elevation: f.elevation, wallTop: f.height, anno: annos[0], group, structure: new THREE.Group(), furniture: new THREE.Group(), sides: new Map(), annoGroup: new THREE.Group(), vertical: new THREE.Group() }
        group.add(node.structure, node.furniture, node.annoGroup, node.vertical)
        this.root.add(group)
        return node
      })
      furniture = true
    }
    this.floors.forEach((node, i) => {
      node.anno = annos[i]
      node.elevation = fs[i].elevation
      const st = this.structCache[i]
      if (structure && st) {
        this.disposeGroup(node.structure)
        node.structure = new THREE.Group()
        node.group.add(node.structure)
        node.wallTop = st.wallTop
        for (const k of FILL_CLASSES) {
          const m = this.fillObj(k, st.fills[k])
          if (m) node.structure.add(m)
        }
        for (const k of LINE_CLASSES) {
          const l = this.lineObj(k, st.lines[k])
          if (l) node.structure.add(l)
        }
      }
      if (furniture) {
        this.disposeGroup(node.furniture)
        node.furniture = new THREE.Group()
        node.group.add(node.furniture)
        const fg = this.furnGeo.find((x) => x.floorId === node.id)
        if (fg) {
          const m = this.fillObj('furniture', fg.fills)
          if (m) node.furniture.add(m)
          const l = this.lineObj('furniture', fg.lines)
          if (l) node.furniture.add(l)
        }
      }
    })
    this.buildAnnotations(plan, pal)
  }

  /** 尺寸线、构造线、网格、文字（标注很便宜：单位 / 语言 / 配色变了都整个重来） */
  private buildAnnotations(plan: Plan, pal: Palette) {
    for (const l of this.labels) {
      l.sprite.material.map?.dispose()
      l.sprite.material.dispose()
    }
    this.labels = []
    const faces = this.floors.flatMap((n) => n.anno.face ?? [])
    this.unionBox = faces.length ? bbox(faces) : null
    const ub = this.unionBox
    const size = ub ? Math.max(ub.x1 - ub.x0, ub.y1 - ub.y0) : 600
    const ext = Math.min(40, Math.max(15, size * 0.03))
    const { unit } = this.opts
    this.floors.forEach((node, i) => {
      this.disposeGroup(node.annoGroup)
      node.annoGroup = new THREE.Group()
      node.group.add(node.annoGroup)
      node.sides.clear()
      const anno = node.anno
      // 最底层的地面是用地（BASE）：尺寸线、网格落在地上
      const groundY = i === 0 ? BASE + 0.5 : 0.5
      const sides = dimLines(anno, groundY)
      for (const [side, buf] of sides) {
        const g = new THREE.Group()
        const l = this.lineObj('dim', buf.out())
        if (l) g.add(l)
        node.annoGroup.add(g)
        node.sides.set(side, g)
      }
      const cons = new Buf()
      if (anno.face) constructionLines(anno.face, i === 0 ? BASE : 0, node.wallTop, ext, cons)
      const cl = this.lineObj('construct', cons.out())
      if (cl) node.annoGroup.add(cl)
      // 地面网格：1m 一格，只在最底层
      if (i === 0 && ub) {
        const grid = new Buf()
        const m = 150
        const x0 = Math.floor((ub.x0 - m) / 100) * 100
        const x1 = Math.ceil((ub.x1 + m) / 100) * 100
        const z0 = Math.floor((ub.y0 - m) / 100) * 100
        const z1 = Math.ceil((ub.y1 + m) / 100) * 100
        const y = BASE - 0.3
        for (let x = x0; x <= x1; x += 100) grid.seg(x, y, z0, x, y, z1)
        for (let z = z0; z <= z1; z += 100) grid.seg(x0, y, z, x1, y, z)
        const gl = this.lineObj('grid', grid.out())
        if (gl) node.annoGroup.add(gl)
      }
      // 尺寸文字
      for (const d of anno.dims) {
        const lb = this.makeLabel([[{ text: fmtDim(d.value, unit), font: MONO, size: d.tier === 1 ? 11.5 : 11, color: pal.line.dim }]], pal.bg, d.tier === 1 ? 'overall' : 'dim', node.id)
        lb.side = d.side
        lb.span = [V(d.a, groundY), V(d.b, groundY)]
        lb.sprite.position.copy(lb.span[0]).lerp(lb.span[1], 0.5)
        node.sides.get(d.side)!.add(lb.sprite)
      }
      // 房间名 + 面积（剖切时才看得见室内）
      if (this.opts.walls === 'cut')
        for (const r of anno.rooms) {
          const rows: TextRun[][] = [[{ text: roomName(r.name), font: `bold ${sansFont()}`, size: 12.5, color: pal.text }], [{ text: fmtRoomArea(r.area, plan.region), font: `${MONO}, ${sansFont()}`, size: 10.5, color: pal.textSoft }]]
          const lb = this.makeLabel(rows, pal.bg, 'room', node.id)
          const room = plan.rooms.find((x) => x.id === r.id)
          lb.sprite.position.set(r.at.x, floorY(room) + 2, r.at.y)
          lb.sprite.center.set(0.5, 0)
          node.annoGroup.add(lb.sprite)
        }
    })
    this.cornerKey = ''
    this.needsLayout = true
  }

  private makeLabel(rows: TextRun[][], halo: string, kind: LabelKind, floorId: string, mark?: { color: string }): Label {
    const { tex, w, h } = textTexture(rows, halo, 3, mark)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false })
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 10
    const lb: Label = { sprite, kind, w, h, floorId }
    this.labels.push(lb)
    return lb
  }

  /** 竖向尺寸与标高：放在屏幕左侧那个外轮廓角外面，沿看得见的那面墙往外拉开 */
  private layoutVertical(corner: { x: number; z: number }, dir: { x: number; z: number }) {
    const plan = this.plan
    const ub = this.unionBox
    if (!plan || !ub) return
    const pal = PAPERS[this.opts.paper]
    const { unit } = this.opts
    // 旧的竖向标注（含文字）清掉
    const old = new Set<THREE.Object3D>()
    for (const n of this.floors) {
      n.vertical.traverse((o) => old.add(o))
      this.disposeGroup(n.vertical)
      n.vertical = new THREE.Group()
      n.group.add(n.vertical)
    }
    this.labels = this.labels.filter((l) => !old.has(l.sprite))
    const size = Math.max(ub.x1 - ub.x0, ub.y1 - ub.y0)
    const D = Math.min(130, Math.max(70, size * 0.08))
    const P = { x: corner.x + dir.x * D, z: corner.z + dir.z * D }
    const over = 15
    const tick = 9
    const last = this.floors.length - 1
    this.floors.forEach((node, i) => {
      const buf = new Buf()
      const top = node.anno.rise
      const levels: [number, number, string][] = [[0, node.anno.level, node.anno.name]]
      if (i === last) levels.push([top, topLevel(plan), t('墙顶')])
      // 竖线 + 两端斜杠
      buf.seg(P.x, -over, P.z, P.x, top + over, P.z)
      for (const y of [0, top]) {
        // 尺寸界线：从角（外皮）引到竖线外
        buf.seg(corner.x + dir.x * 10, y, corner.z + dir.z * 10, P.x + dir.x * over, y, P.z + dir.z * over)
        const sx = (dir.x / Math.SQRT2) * tick
        const sz = (dir.z / Math.SQRT2) * tick
        buf.seg(P.x - sx, y - tick / Math.SQRT2, P.z - sz, P.x + sx, y + tick / Math.SQRT2, P.z + sz)
      }
      const l = this.lineObj('dim', buf.out())
      if (l) node.vertical.add(l)
      // 层高数字（转 90° 贴着竖线）
      const v = this.makeLabel([[{ text: fmtDim(top, unit), font: MONO, size: 11, color: pal.line.dim }]], pal.bg, 'vdim', node.id)
      v.vertical = true
      v.span = [new THREE.Vector3(P.x, 0, P.z), new THREE.Vector3(P.x, top, P.z)]
      v.sprite.position.set(P.x, top / 2, P.z)
      node.vertical.add(v.sprite)
      // 标高：▽ 1F ±0（文字在竖线外侧，右端对齐）
      for (const [y, lv, name] of levels) {
        const lb = this.makeLabel(
          [
            [
              { text: name + '  ', font: `bold ${sansFont()}`, size: 11.5, color: pal.text },
              { text: fmtLevel(lv, unit), font: MONO, size: 11.5, color: pal.line.dim },
            ],
          ],
          pal.bg,
          'level',
          node.id,
          { color: pal.line.dim },
        )
        lb.sprite.position.set(P.x + dir.x * (over + 6), y, P.z + dir.z * (over + 6))
        lb.sprite.center.set(1, 0.5)
        node.vertical.add(lb.sprite)
      }
    })
  }

  /** 分层拉开 / 叠放：各层的高度 */
  private applyLayout(layout: FloorLayout) {
    const explode = layout === 'explode' && this.floors.length > 1
    this.floors.forEach((n, i) => {
      n.group.position.y = n.elevation + (explode ? i * BP_EXPLODE : 0)
    })
    this.root.updateMatrixWorld(true)
  }

  private applyPaper() {
    const pal = PAPERS[this.opts.paper]
    for (const [k, m] of this.lineMats) {
      m.color.set(pal.line[k])
      m.opacity = k === 'grid' ? 0.9 : k === 'construct' ? 0.85 : 1
      m.needsUpdate = true
    }
    for (const [k, m] of this.fillMats) {
      m.uniforms.uColor.value.set(pal.fill[k])
      m.uniforms.uPoche.value.set(pal.poche)
      m.uniforms.uShade.value = pal.shade
      m.uniforms.uCut.value = k === 'wall' && this.opts.walls === 'cut' ? CUT_H : -1e6
    }
    this.scene.background = null
    this.needsRender = true
  }

  /** 设计图的底色（CSS 用） */
  get background() {
    return PAPERS[this.opts.paper].bg
  }

  // ---------- 相机 ----------

  resize(w: number, h: number) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) }
    for (const m of this.lineMats.values()) m.resolution.set(this.size.w, this.size.h)
    this.persp.aspect = this.size.w / this.size.h
    this.persp.updateProjectionMatrix()
    this.updateOrthoFrustum()
    this.needsRender = true
    this.needsLayout = true
  }

  private updateOrthoFrustum() {
    const a = this.size.w / this.size.h
    this.ortho.left = -this.halfH * a
    this.ortho.right = this.halfH * a
    this.ortho.top = this.halfH
    this.ortho.bottom = -this.halfH
    this.ortho.updateProjectionMatrix()
  }

  /** 显示中的模型包围盒（含尺寸线一圈） */
  private contentBox() {
    const box = new THREE.Box3()
    const ub = this.unionBox
    if (!ub) return box
    const size = Math.max(ub.x1 - ub.x0, ub.y1 - ub.y0)
    const m = Math.min(260, Math.max(140, size * 0.16))
    for (const n of this.floors) {
      const y = n.group.position.y
      box.expandByPoint(new THREE.Vector3(ub.x0 - m, y + BASE, ub.y0 - m))
      box.expandByPoint(new THREE.Vector3(ub.x1 + m, y + Math.max(n.wallTop, n.anno.rise), ub.y1 + m))
    }
    return box
  }

  private viewed = false
  /** 默认的轴测视角：右前上方（等轴测方向） */
  resetView() {
    this.viewed = true
    const box = this.contentBox()
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const dir = new THREE.Vector3(0.78, 0.86, 1).normalize()
    // 正交：把包围盒 8 个角投到相机的右 / 上轴上算范围
    const up = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(up, dir).normalize()
    const camUp = new THREE.Vector3().crossVectors(dir, right).normalize()
    let rx = 0
    let ry = 0
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c)
      rx = Math.max(rx, Math.abs(p.dot(right)))
      ry = Math.max(ry, Math.abs(p.dot(camUp)))
    }
    const a = this.size.w / this.size.h
    this.halfH = Math.max(ry, rx / a) * 1.06
    const dist = Math.max(4000, box.getSize(new THREE.Vector3()).length() * 3)
    this.ortho.zoom = 1
    this.ortho.position.copy(c).addScaledVector(dir, dist)
    this.updateOrthoFrustum()
    const pd = this.halfH / Math.tan((this.persp.fov * Math.PI) / 360)
    this.persp.position.copy(c).addScaledVector(dir, pd)
    this.controls.target.copy(c)
    this.camera.lookAt(c)
    this.controls.update()
    this.needsRender = true
    this.needsLayout = true
  }

  /** 正交 ↔ 透视：保持视线方向和画面大小 */
  setOrtho(on: boolean, force = false) {
    const target = this.controls.target
    if (!force && (on ? this.camera === this.ortho : this.camera === this.persp)) return
    const from = this.camera
    const dir = from.position.clone().sub(target).normalize()
    const tan = Math.tan((this.persp.fov * Math.PI) / 360)
    if (on && from !== this.ortho) {
      const half = from.position.distanceTo(target) * tan
      this.ortho.zoom = this.halfH / Math.max(1, half)
      const ub = this.contentBox()
      const dist = Math.max(4000, ub.isEmpty() ? 4000 : ub.getSize(new THREE.Vector3()).length() * 3)
      this.ortho.position.copy(target).addScaledVector(dir, dist)
      this.ortho.updateProjectionMatrix()
    } else if (!on && from !== this.persp) {
      const half = this.halfH / this.ortho.zoom
      this.persp.position.copy(target).addScaledVector(dir, half / tan)
    }
    this.camera = on ? this.ortho : this.persp
    this.camera.lookAt(target)
    this.controls.object = this.camera
    this.controls.update()
    this.needsRender = true
    this.needsLayout = true
  }

  // ---------- 每帧 ----------

  /** 推进视角控制，有变化时重排文字并重画；返回这一帧画了没有 */
  frame() {
    if (!this.active) return false
    this.controls.update()
    if (this.camera === this.persp) {
      const near = Math.min(120, Math.max(5, this.persp.position.distanceTo(this.controls.target) * 0.05))
      if (Math.abs(near - this.persp.near) > 1) {
        this.persp.near = near
        this.persp.updateProjectionMatrix()
      }
    }
    if (this.needsLayout) this.layout()
    if (!this.needsRender) return false
    this.draw(null)
    this.needsRender = false
    return true
  }

  /** 要求下一帧重画（例如沙盘临时画过一帧缩略图） */
  invalidate() {
    this.needsRender = true
  }

  private draw(target: THREE.WebGLRenderTarget | null) {
    const r = this.renderer
    r.setRenderTarget(target)
    r.setClearColor(PAPERS[this.opts.paper].bg, 1)
    r.clear()
    r.render(this.scene, this.camera)
  }

  /** 每像素对应的世界长度（CSS 像素） */
  private worldPerPx(p: THREE.Vector3) {
    if (this.camera === this.ortho) return (this.ortho.top - this.ortho.bottom) / this.ortho.zoom / this.size.h
    const d = p.clone().applyMatrix4(this.persp.matrixWorldInverse).z
    return (2 * Math.abs(d) * Math.tan((this.persp.fov * Math.PI) / 360)) / this.size.h
  }

  /** 朝向镜头的边上的尺寸才显示；竖向尺寸换到屏幕左侧的角；文字按优先级排开，放不下的藏起来 */
  private layout() {
    this.needsLayout = false
    this.needsRender = true
    const cam = this.camera
    cam.updateMatrixWorld()
    const ub = this.unionBox
    if (!ub) return
    const target = this.controls.target
    const view = cam.position.clone().sub(target)
    const hl = Math.hypot(view.x, view.z)
    const hx = view.x / (hl || 1)
    const hz = view.z / (hl || 1)
    const topDown = hl < view.length() * 0.18
    const sideOn = (s: Side) => {
      if (topDown) return true
      const n = SIDE_NORMAL[s]
      return n.x * hx + n.y * hz > 0.08
    }
    for (const n of this.floors) for (const [s, g] of n.sides) g.visible = sideOn(s)
    // 竖向尺寸的角：两个轮廓角里屏幕上更靠左的那个
    const sx = hx >= 0 ? 1 : -1
    const sz = hz >= 0 ? 1 : -1
    const cx = (k: number) => (k > 0 ? ub.x1 : ub.x0)
    const cz = (k: number) => (k > 0 ? ub.y1 : ub.y0)
    const A = { corner: { x: cx(-sx), z: cz(sz) }, dir: { x: -sx, z: 0 } }
    const B = { corner: { x: cx(sx), z: cz(-sz) }, dir: { x: 0, z: -sz } }
    const scr = (c: { x: number; z: number }) => new THREE.Vector3(c.x, 0, c.z).project(cam).x
    const pick = scr(A.corner) <= scr(B.corner) ? A : B
    const key = `${pick.corner.x},${pick.corner.z},${pick.dir.x},${pick.dir.z}`
    if (key !== this.cornerKey) {
      this.cornerKey = key
      this.layoutVertical(pick.corner, pick.dir)
    }
    // 文字：缩放到固定像素大小、沿尺寸线旋转、去重叠
    const W = this.size.w
    const H = this.size.h
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(cam)
      return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }
    }
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
    const order = [...this.labels].sort((a, b) => PRIO[b.kind] - PRIO[a.kind])
    const wp = new THREE.Vector3()
    for (const lb of order) {
      const sp = lb.sprite
      let shown = true
      for (let o: THREE.Object3D | null = sp.parent; o; o = o.parent) if (!o.visible) shown = false
      if (!shown) {
        sp.visible = false
        continue
      }
      sp.getWorldPosition(wp)
      const k = this.worldPerPx(wp)
      sp.scale.set(lb.w * k, lb.h * k, 1)
      const c = toScreen(wp)
      if (c.z > 1 || c.z < -1) {
        sp.visible = false
        continue
      }
      let ang = 0
      let fits = true
      if (lb.span) {
        const g = sp.parent!.matrixWorld
        const a = toScreen(lb.span[0].clone().applyMatrix4(g))
        const b = toScreen(lb.span[1].clone().applyMatrix4(g))
        const L = Math.hypot(b.x - a.x, b.y - a.y)
        ang = Math.atan2(-(b.y - a.y), b.x - a.x)
        if (ang > Math.PI / 2) ang -= Math.PI
        if (ang <= -Math.PI / 2) ang += Math.PI
        fits = L >= lb.w + 10
      }
      ;(sp.material as THREE.SpriteMaterial).rotation = ang
      if (!fits) {
        sp.visible = false
        continue
      }
      // 旋转后的包围框（按锚点算）
      const cos = Math.abs(Math.cos(ang))
      const sin = Math.abs(Math.sin(ang))
      const bw = lb.w * cos + lb.h * sin
      const bh = lb.w * sin + lb.h * cos
      const cxp = c.x + (0.5 - sp.center.x) * bw
      const cyp = c.y - (0.5 - sp.center.y) * bh
      const r = { x0: cxp - bw / 2 - 2, y0: cyp - bh / 2 - 1, x1: cxp + bw / 2 + 2, y1: cyp + bh / 2 + 1 }
      const hit = placed.some((q) => r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1)
      sp.visible = !hit
      if (!hit) placed.push(r)
    }
  }

  // ---------- 导出 ----------

  /**
   * 高分辨率 PNG：按当前视角离屏渲染 scale 倍（受显卡上限和总像素约束），线宽、文字按比例放大；右下角加一行图名。
   */
  async exportPNG(scale = 3, title = ''): Promise<Blob | null> {
    const { w, h } = this.size
    const maxTex = Math.min(8192, this.renderer.capabilities.maxTextureSize)
    let s = Math.min(scale, maxTex / Math.max(w, h), Math.sqrt(36e6 / (w * h)))
    s = Math.max(1, s)
    const W = Math.round(w * s)
    const H = Math.round(h * s)
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 })
    rt.texture.colorSpace = THREE.SRGBColorSpace
    const buf = new Uint8Array(W * H * 4)
    const prev = this.renderer.getRenderTarget()
    try {
      this.layout()
      this.draw(rt)
      this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf)
    } finally {
      this.renderer.setRenderTarget(prev)
      rt.dispose()
      this.needsRender = true
    }
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    const img = g.createImageData(W, H)
    // WebGL 的行序从下往上：翻过来
    const row = W * 4
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row)
    g.putImageData(img, 0, 0)
    if (title) {
      const pal = PAPERS[this.opts.paper]
      const pad = 18 * s
      const fs = 12 * s
      g.font = `600 ${fs}px ${sansFont()}`
      g.textAlign = 'right'
      g.textBaseline = 'alphabetic'
      g.fillStyle = pal.text
      g.fillText(title, W - pad, H - pad)
      const tw = g.measureText(title).width
      g.strokeStyle = pal.line.construct
      g.lineWidth = Math.max(1, 0.8 * s)
      g.beginPath()
      g.moveTo(W - pad - tw, H - pad - fs * 1.35)
      g.lineTo(W - pad, H - pad - fs * 1.35)
      g.stroke()
    }
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'))
  }

  dispose() {
    this.exit()
    this.controls.dispose()
    for (const n of this.floors) this.disposeGroup(n.group)
    this.floors = []
    for (const m of this.lineMats.values()) m.dispose()
    for (const m of this.fillMats.values()) m.dispose()
  }

  /** 测试 / 调试：当前各层的线段数（按类） */
  stats() {
    const out: Record<string, number> = {}
    for (const n of this.floors)
      n.group.traverse((o) => {
        const l = o as LineSegments2
        if (!l.isLineSegments2) return
        const cls = [...this.lineMats].find(([, m]) => m === l.material)?.[0] ?? '?'
        out[cls] = (out[cls] ?? 0) + (l.geometry as LineSegmentsGeometry).attributes.instanceStart.count
      })
    return { ...out, labels: this.labels.length }
  }
}
