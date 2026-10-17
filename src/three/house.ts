// 把平面图搭成 3D 沙盘：底座、各房间地面、墙（按门窗挖洞）、门扇 / 窗玻璃、设备。

import * as THREE from 'three'
import {
  add,
  bbox,
  openingGeom,
  dist,
  edgeInfo,
  fixtureDepth,
  isAxisRect,
  mul,
  pointInPolygon,
  projectToSegment,
  type Fixture,
  type Furniture,
  type Plan,
  type Room,
  type RoomKind,
  type Vec,
  type Wallpaper,
  type WallTrim,
  edgesOf as roomEdges,
} from '../model'
import { isIndoor, sharedIntervals, voidRailSegments, wallSegments, wallThicknessAt } from '../walls'
import { tatamiLayout } from '../tatami'
import { addOutlines, ball, capsule, cyl, mergeMeshes, rbox, shade, toon, useAnisotropy } from './toon'
import { glow, poseDoors } from './kit'
import { hasTag } from './tags'
import { fridgeSpotModel, washerSpotModel } from './appliances'
import { effectivePalette } from './colors'
import { applyPatterns, patternMaterial } from './fabric'
import {
  ASSET_MAP,
  C,
  basinModel,
  bathtubModel,
  kitchenModel,
  outdoorUnitModel,
  psModel,
  toiletModel,
  storageSpotModel,
  NICHE_H,
} from './assets'
import { edgesOf } from '../model'
import { showerSpot } from '../bathroom'
import { curtainSpec } from '../curtains'
import { showerCurtainModel, showerModel } from './packs/bath-extra'
import { edgeRail, holeRails, stairsModel } from './stairs3d'
import { subtractSpan } from '../stairs'
import { SLAB, floorElevation, floorOf, isMultiFloor } from '../floors'
import { centroid, onBoundary, signedArea } from '../model'

/** 地面高度：玄関土间、阳台比室内低 */
const FLOOR_Y: Partial<Record<RoomKind, number>> = { entrance: -12, balcony: -15 }
export const floorY = (r: Room | undefined) => (r ? (r.flush ? 0 : (FLOOR_Y[r.kind] ?? 0)) : 0)
export const BASE = -26

export function roomAt(plan: Pick<Plan, 'rooms'>, p: Vec, floor?: string | null) {
  // 阳台和户内重叠时户内优先；floor 给定（多层户型）时只看那一层的房间（undefined 字段 = 最底层，传 null 表示最底层）
  const hits = plan.rooms.filter((r) => (floor === undefined || (r.floor ?? null) === floor) && pointInPolygon(p, r.points))
  return hits.find(isIndoor) ?? hits[0]
}

// ---------- 地面贴图 ----------

const texCache = new Map<string, THREE.Texture>()
function canvasTex(key: string, size: number, tile: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  let t = texCache.get(key)
  if (t) return t
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  draw(cv.getContext('2d')!, size)
  t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / tile, 1 / tile)
  t.colorSpace = THREE.SRGBColorSpace
  useAnisotropy(t)
  texCache.set(key, t)
  return t
}

function woodTex(base: string, line: string) {
  // 一张贴图 = 120cm 见方，6 条地板，每条错缝
  return canvasTex(`wood${base}`, 256, 120, (g, s) => {
    g.fillStyle = base
    g.fillRect(0, 0, s, s)
    const n = 6
    const h = s / n
    g.strokeStyle = line
    g.lineWidth = 2
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(base, (i % 3) * 0.012 - 0.01)
      g.fillRect(0, i * h + 1, s, h - 2)
      g.beginPath()
      g.moveTo(0, i * h)
      g.lineTo(s, i * h)
      const x = ((i * 0.37) % 1) * s
      g.moveTo(x, i * h)
      g.lineTo(x, (i + 1) * h)
      g.stroke()
    }
  })
}

function tileTex(base: string, line: string, cell: number) {
  return canvasTex(`tile${base}${cell}`, 128, cell, (g, s) => {
    g.fillStyle = base
    g.fillRect(0, 0, s, s)
    g.strokeStyle = line
    g.lineWidth = 4
    g.strokeRect(0, 0, s, s)
  })
}

const floorMatCache = new Map<string, THREE.Material>()
function floorMaterial(kind: RoomKind) {
  let m = floorMatCache.get(kind)
  if (m) return m
  let map: THREE.Texture
  switch (kind) {
    case 'wash':
    case 'toilet':
      map = tileTex('#f4f7f6', '#cfe0e0', 30)
      break
    case 'bath':
      map = tileTex('#dff1f6', '#a9cfd9', 15)
      break
    case 'entrance':
      map = tileTex('#d9d3c9', '#bfb6a7', 30)
      break
    case 'balcony':
      map = tileTex('#e3e0da', '#c9c4bb', 45)
      break
    case 'japanese':
      map = woodTex('#e3d6a6', '#c6b685')
      break
    case 'western':
    case 'storage':
      map = woodTex('#f0d4ad', '#d6b388')
      break
    default:
      map = woodTex('#ecc79b', '#cfa676')
  }
  m = new THREE.MeshToonMaterial({ map, color: '#ffffff', gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap })
  floorMatCache.set(kind, m)
  return m
}

const toV2 = (pts: Vec[]) => pts.map((p) => new THREE.Vector2(p.x, -p.y))

/**
 * 房间地面：从 bottom（缺省底座顶面）挤出到地面高度。holes：要挖掉的区域（上层的楼梯洞口、挑空），
 * 只取和房间相交的部分（凸的洞口按房间裁一下）；洞口盖住整个房间时返回 null。
 */
function floorSlab(r: Room, bottom = BASE, holes: Vec[][] = []) {
  const shape = new THREE.Shape(toV2(r.points))
  for (const h of holes) {
    const cut = clipConvex(r.points, h)
    if (cut.length < 3 || Math.abs(signedArea(cut)) < 4) continue
    if (Math.abs(signedArea(cut)) >= Math.abs(signedArea(r.points)) - 4) return null
    shape.holes.push(new THREE.Path(toV2(insetToward(cut, 0.5))))
  }
  const top = floorY(r)
  bottom = Math.min(bottom, top - 1)
  const depth = top - bottom
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  const sideMat = toon('#e9dccb')
  const m = new THREE.Mesh(geo, [floorMaterial(r.kind), sideMat])
  m.position.y = bottom
  m.receiveShadow = true
  return m
}

/** 多边形 subject 被凸多边形 clip 裁剪（Sutherland–Hodgman）：两者的交 */
export function clipConvex(subject: Vec[], clip: Vec[]): Vec[] {
  let out = subject
  const s = signedArea(clip) >= 0 ? 1 : -1
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const inside = (p: Vec) => s * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= -1e-9
    const cross = (p: Vec, q: Vec): Vec => {
      const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      const d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)
      const t = d1 / (d1 - d2)
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
    }
    const input = out
    out = []
    for (let k = 0; k < input.length; k++) {
      const p = input[k]
      const q = input[(k + 1) % input.length]
      const pi = inside(p)
      const qi = inside(q)
      if (pi) out.push(p)
      if (pi !== qi) out.push(cross(p, q))
    }
  }
  return out
}

/** 各顶点往形心挪 d（洞口和外轮廓不共边，三角化稳定） */
function insetToward(pts: Vec[], d: number) {
  const c = centroid(pts)
  return pts.map((p) => {
    const l = Math.hypot(p.x - c.x, p.y - c.y) || 1
    return { x: p.x + ((c.x - p.x) / l) * d, y: p.y + ((c.y - p.y) / l) * d }
  })
}

/** 多边形各边沿外法线平移 d 后的新多边形（直角户型的外轮廓外扩半个墙厚） */
export function offsetPolygon(pts: Vec[], d: number): Vec[] {
  const es = roomEdges(pts)
  const n = es.length
  return es.map((q, i) => {
    const p = es[(i + n - 1) % n]
    const pa = add(p.a, mul(p.out, d))
    const qa = add(q.a, mul(q.out, d))
    const den = p.dir.x * q.dir.y - p.dir.y * q.dir.x
    if (Math.abs(den) < 1e-6) return qa
    const t = ((qa.x - pa.x) * q.dir.y - (qa.y - pa.y) * q.dir.x) / den
    return add(pa, mul(p.dir, t))
  })
}

/**
 * 上层的结构楼板：外轮廓外扩半个外墙厚（和外墙外皮齐平），从 -SLAB 到 -2（上面再铺各房间的地面），
 * 侧面是截面色，层与层之间露出一道楼板。holes：楼梯洞口、四周被房间围住的挑空。
 */
function structureSlab(outline: Vec[], holes: Vec[][], wallOuter: number) {
  const shape = new THREE.Shape(toV2(offsetPolygon(outline, wallOuter / 2)))
  for (const h of holes) if (h.every((p) => pointInPolygon(p, outline) || onBoundary(outline, p, 0.5))) shape.holes.push(new THREE.Path(toV2(insetToward(h, 0.5))))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: SLAB - 2, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(geo, [toon('#efe6d8'), toon('#b9a48e')])
  m.position.y = -SLAB
  m.receiveShadow = true
  m.castShadow = true
  return m
}

/** 和室：按畳割り铺榻榻米 */
function tatami(r: Room, wall: number) {
  const g = new THREE.Group()
  if (!isAxisRect(r.points)) return g
  const b = bbox(r.points)
  const k = wall / 2
  for (const t of tatamiLayout(b.x0 + k, b.y0 + k, b.x1 - k, b.y1 - k)) {
    const mat = rbox(t.w - 1.2, 3, t.h - 1.2, t.half ? '#d6dc9c' : '#cfd893', { x: t.x + t.w / 2, z: t.y + t.h / 2 }, 0.8)
    mat.castShadow = false
    g.add(mat)
  }
  return g
}

// ---------- 墙 ----------

interface Cut {
  lo: number
  hi: number
  /** 洞口的底 / 顶高度 */
  y0: number
  y1: number
}

/**
 * 墙进阴影贴图时画朝光的那一面（three 默认只画背光面）：否则墙的深度落在背光的那一面上，
 * 墙后面（隔壁、户外）离太阳更近的东西会把影子「穿墙」投到这一面墙上。
 */
const solidShadow = <T extends THREE.Material>(m: T) => {
  m.shadowSide = THREE.FrontSide
  return m
}
const capMat = () => solidShadow(toon('#7a6258'))
const wallMat = (outer: boolean) => solidShadow(toon(outer ? '#fbf3e6' : '#fff8ef'))

/** 墙脚细线：前墙隐藏后仍能看出房间边界（被完整的墙包在里面时看不见） */
function wallStub(a: Vec, b: Vec, t: number, y0: number, y1: number, outer: boolean) {
  const L = dist(a, b)
  if (L < 0.5) return null
  const side = wallMat(outer)
  const m = new THREE.Mesh(new THREE.BoxGeometry(L, y1 - y0, t), [side, side, capMat(), side, side, side])
  const c = mul(add(a, b), 0.5)
  m.position.set(c.x, (y0 + y1) / 2, c.y)
  m.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x)
  m.receiveShadow = true
  return m
}

/**
 * 可透明化的物体：c 为中心（平面坐标），n 为墙的法线；外墙的 n 指向户外。
 */
export interface Fade {
  x: number
  y: number
  nx: number
  ny: number
  /** 外墙（含阳台扶手）：最外一层，默认就透明 */
  outer: boolean
}
function tagFade(o: THREE.Object3D, c: Vec, n: Vec, outer: boolean) {
  o.userData.fade = { x: c.x, y: c.y, nx: n.x, ny: n.y, outer } satisfies Fade
}

/**
 * 前墙透明，分层：
 *   - 镜头在外侧的外墙始终透明（最外一层；远离镜头的两面外墙不动）；
 *   - depth 不为 null 时（鼠标悬停的房间），所有比这个深度更靠近镜头的墙也透明。
 * camDir 是从房子中心指向相机的水平单位向量（null = 全部恢复）；depth 沿 camDir 度量。
 * all = true 时所有墙都处理（「全部压低」）。这里只定目标，渐变由 stepCutaway 每帧推进。
 */
/** inner：内墙全部压低成半墙（模拟人生式），外墙只压低靠镜头的那几面 */
export function applyCutaway(root: THREE.Object3D, center: Vec, camDir: Vec | null, depth: number | null = null, all = false, inner = false) {
  for (const o of fadeList(root)) {
    const f = o.userData.fade as Fade
    let faded = all || (inner && !f.outer)
    if (camDir && !faded) {
      const s = (f.x - center.x) * camDir.x + (f.y - center.y) * camDir.y
      const toward = f.nx * camDir.x + f.ny * camDir.y
      // 带回差：已经让开的墙转回 0.2 以下才恢复，没让开的超过 0.4 才让开。
      // 只用一个阈值的话，视角停在阈值附近时（阻尼的余动）墙会在两种状态之间来回跳，看起来像闪烁
      const th = o.userData.target === 1 ? 0.2 : 0.4
      faded = f.outer ? toward > th : depth !== null && Math.abs(toward) > th && s > depth
    }
    o.userData.target = faded ? 1 : 0
  }
}

function fadeList(root: THREE.Object3D): THREE.Object3D[] {
  if (!root.userData.fadeList) {
    const list: THREE.Object3D[] = []
    root.traverse((o) => {
      if (o.userData.fade) list.push(o)
    })
    root.userData.fadeList = list
  }
  return root.userData.fadeList
}

interface FadePart {
  mesh: THREE.Mesh
  solid: THREE.Material | THREE.Material[]
  ghost: THREE.Material[]
  /** 原本就半透明的（玻璃），按比例淡出 */
  base: number[]
}

/** 物体里要淡出的网格；描边外壳是不透明的，淡出时直接藏起来 */
function fadeParts(o: THREE.Object3D) {
  if (o.userData.parts) return o.userData.parts as { parts: FadePart[]; hulls: THREE.Object3D[] }
  const parts: FadePart[] = []
  const hulls: THREE.Object3D[] = []
  o.traverse((c) => {
    if (c.userData.isOutline) hulls.push(c)
    else if ((c as THREE.Mesh).isMesh) {
      const mesh = c as THREE.Mesh
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const ghost = mats.map((m) => {
        const g = m.clone()
        g.onBeforeCompile = m.onBeforeCompile
        g.customProgramCacheKey = m.customProgramCacheKey
        g.transparent = true
        g.depthWrite = false
        return g
      })
      parts.push({ mesh, solid: mesh.material, ghost, base: mats.map((m) => (m.transparent ? m.opacity : 1)) })
    }
  })
  o.userData.parts = { parts, hulls }
  return o.userData.parts as { parts: FadePart[]; hulls: THREE.Object3D[] }
}

const FADE_TIME = 0.25

/**
 * 被处理的墙怎么显示：
 *   fade：变透明，不透明度 opacity（0 = 完全隐藏）；
 *   cut ：像模拟人生那样压低成 cut 高的矮墙，顶上露出截面。门窗、玻璃仍然淡出。
 */
export interface WallLook {
  style: 'fade' | 'cut'
  opacity: number
  cut: number
}

/**
 * 推进渐变：t 从 0（原样）到 1（按 look 处理完）。force 时即使没在动也重新应用（换了样式 / 滑块变了）。
 * 返回是否还有物体在动画中。
 */
export function stepCutaway(root: THREE.Object3D, dt: number, look: WallLook, force = false) {
  let busy = false
  for (const o of fadeList(root)) {
    const target = (o.userData.target as number) ?? 0
    const t0 = (o.userData.t as number) ?? 0
    if (t0 === target && !force) continue
    const t = target > t0 ? Math.min(target, t0 + dt / FADE_TIME) : Math.max(target, t0 - dt / FADE_TIME)
    o.userData.t = t
    // 告诉调用方这一帧墙有变化（投影要重画）
    root.userData.cutawayChanged = true
    if (t !== target) busy = true
    const e = t * t * (3 - 2 * t)
    const wall = o.userData.wall as { y0: number; h: number } | undefined
    if (wall) {
      // 压低：所有墙段共用同一条「当前墙顶」，从整墙高度渐降到矮墙高度；每段只露出墙顶以下的部分。
      // 这样门窗上方的过梁、窗台、踢脚线、腰壁都和旁边的墙面同步变矮，不会各缩各的
      const fullTop = (root.userData.wallTop as number | undefined) ?? (root.userData.wallTop = Math.max(...fadeList(root).map((x) => (x.userData.wall ? x.userData.wall.y0 + x.userData.wall.h : 0))))
      const top = fullTop + (Math.min(look.cut, fullTop) - fullTop) * e
      const hh = look.style === 'cut' ? Math.max(0, Math.min(wall.h, top - wall.y0)) : wall.h
      o.scale.y = Math.max(hh, 0.01) / wall.h
      o.position.y = wall.y0 + hh / 2
      if (look.style === 'cut') {
        const { parts } = fadeParts(o)
        for (const p of parts) {
          p.mesh.material = p.solid
          p.mesh.castShadow = true
        }
        o.visible = hh > 0.3
        continue
      }
    }
    const opacity = look.style === 'cut' ? 0 : look.opacity
    const alpha = 1 + (opacity - 1) * e
    const { parts, hulls } = fadeParts(o)
    for (const h of hulls) h.visible = t === 0
    for (const p of parts) {
      if (t === 0) {
        p.mesh.material = p.solid
        p.mesh.castShadow = true
      } else {
        p.ghost.forEach((g, i) => (g.opacity = alpha * p.base[i]))
        p.mesh.material = Array.isArray(p.solid) ? p.ghost : p.ghost[0]
        p.mesh.castShadow = e < 0.5
      }
    }
    // 完全透明时直接隐藏；墙脚另有一条贴地的细线（wallStub）标出房间边界
    o.visible = alpha > 0.01
  }
  return busy
}

/** 沿 a→b 的一段墙体，高度 y0..y1 */
function wallPiece(a: Vec, b: Vec, t: number, y0: number, y1: number, outer: boolean, capTop: boolean, n?: Vec, faces?: [THREE.Material | null, THREE.Material | null]) {
  const L = dist(a, b)
  const h = y1 - y0
  if (L < 0.5 || h < 0.5) return null
  const geo = new THREE.BoxGeometry(L, h, t)
  const side = wallMat(outer)
  // 材质顺序：+x -x +y -y +z -z；顶面画成深色截面，像沙盘模型的剖切
  // 材质顺序：+x -x +y -y +z -z；+z 面朝 (-dir.y, dir.x) 一侧的房间，-z 面朝另一侧
  const m = new THREE.Mesh(geo, [side, side, capTop ? capMat() : side, side, faces?.[0] ?? side, faces?.[1] ?? side])
  const c = mul(add(a, b), 0.5)
  // 地面以下的窗台、门槛不挡视线，不参与透明
  if (y1 > 5) tagFade(m, c, n ?? { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }, outer)
  m.userData.wall = { y0, h }
  m.position.set(c.x, y0 + h / 2, c.y)
  m.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

const wpCache = new Map<string, THREE.Material>()
/** 墙纸材质：纯色直接用 toon，带花纹的按世界坐标投影（同一面墙花纹连续） */
function wallpaperMaterial(w: Wallpaper): THREE.Material {
  const key = JSON.stringify(w)
  let m = wpCache.get(key)
  if (!m) {
    // 复制一份（toon / 花纹材质是共享缓存），加深度偏移：墙纸面总是压过贴着它的相邻墙端面，交接处不闪
    const src = w.pattern ? patternMaterial(w.pattern, true) : toon(w.color)
    m = src.clone()
    m.onBeforeCompile = src.onBeforeCompile
    m.customProgramCacheKey = src.customProgramCacheKey
    m.shadowSide = THREE.FrontSide
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -2
    wpCache.set(key, m)
  }
  return m
}

function openingSpan(plan: Plan, kind: string, owner: Room, sash: boolean) {
  if (kind !== 'window') return { y0: 0, y1: 200 }
  if (sash) return { y0: 0, y1: 200 }
  if (owner.kind === 'bath' || owner.kind === 'toilet' || owner.kind === 'wash') return { y0: 110, y1: 180 }
  void plan
  return { y0: 90, y1: 190 }
}

export interface OpeningInfo {
  center: Vec
  dir: Vec
  out: Vec
  width: number
  wall: number
  y0: number
  y1: number
  sash: boolean
  outer: boolean
  o: Plan['openings'][number]
  owner: Room
}

export function openingInfos(plan: Plan): OpeningInfo[] {
  const out: OpeningInfo[] = []
  for (const o of plan.openings) {
    const owner = plan.rooms.find((r) => r.id === o.roomId)
    if (!owner || o.edge >= owner.points.length) continue
    const e = edgeInfo(owner.points, o.edge)
    const w = Math.min(o.width, e.length)
    const c = e.length <= w ? e.length / 2 : Math.max(w / 2, Math.min(e.length - w / 2, o.offset))
    const center = add(e.a, mul(e.dir, c))
    const wall = wallThicknessAt(plan, center, e.out, owner)
    const probe = add(center, mul(e.out, wall / 2 + 15))
    const sash = o.kind === 'window' && plan.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(probe, x.points))
    out.push({ center, dir: e.dir, out: e.out, width: w, wall, sash, outer: wall >= plan.wallOuter, o, owner, ...openingSpan(plan, o.kind, owner, sash) })
  }
  return out
}

function buildWalls(plan: Plan, H0: number, infos: OpeningInfo[], opts: HouseOpts = {}) {
  const g = new THREE.Group()
  // 墙外侧不是房间时墙脚落到哪：最底层落到底座，上层落在楼板上
  const outside = opts.upper ? 0 : BASE
  let bottom = 0
  let isOuter = false
  const stub = (a: Vec, b: Vec, t: number) => {
    // 墙脚线顶面 2.4：低于榻榻米（3），不和它共面
    const m = wallStub(a, b, t + 0.4, bottom, 2.4, isOuter)
    if (m) g.add(m)
  }
  const seen = new Set<string>()
  const key = (p: Vec) => `${Math.round(p.x)},${Math.round(p.y)}`
  // 先去重，后面要判断一段墙的端点是不是和另一段共线相接
  const segs = wallSegments(plan.rooms).filter((s) => {
    if (s.kind === 'open') return false
    const k1 = key(s.a) + '|' + key(s.b)
    const k2 = key(s.b) + '|' + key(s.a)
    if (seen.has(k1) || seen.has(k2)) return false
    seen.add(k1)
    return true
  })
  /** 端点 p 处有没有另一段共线的墙接着（直墙被内墙交汇点切开的情况）：有就不往外延伸，免得两段重叠闪烁 */
  const continues = (self: (typeof segs)[number], p: Vec, dir: Vec) =>
    segs.some((o) => {
      if (o === self) return false
      const od = mul({ x: o.b.x - o.a.x, y: o.b.y - o.a.y }, 1 / Math.max(1e-6, dist(o.a, o.b)))
      if (Math.abs(dir.x * od.y - dir.y * od.x) > 1e-3) return false
      return dist(o.a, p) < 1 || dist(o.b, p) < 1
    })
  const railSegs = opts.upper ? voidRailSegments(plan.rooms) : []
  for (const s of segs) {
    const outer = s.kind === 'outer'
    isOuter = outer
    const t = outer ? plan.wallOuter : plan.wall
    const L = dist(s.a, s.b)
    const dir = mul({ x: s.b.x - s.a.x, y: s.b.y - s.a.y }, 1 / L)
    // 法线：外墙指向户外（另一侧探一下是不是户内房间）
    let n = { x: -dir.y, y: dir.x }
    const probe = add(mul(add(s.a, s.b), 0.5), mul(n, t / 2 + 5))
    if (plan.rooms.some((r) => isIndoor(r) && pointInPolygon(probe, r.points))) n = mul(n, -1)
    // 墙脚落到两侧较低的地面：阳台、土间一侧不悬空，户外一侧一直落到底座
    const mid = mul(add(s.a, s.b), 0.5)
    const sideY = (k: number) => {
      const r = roomAt(plan, add(mid, mul(n, k * (t / 2 + 5))))
      return r ? floorY(r) : outside
    }
    // 上层是挑空的地方，外墙通高到上层的天花
    const H = outer && opts.tall?.zones.some((z) => pointInPolygon(mid, z) || onBoundary(z, mid, 2)) ? H0 + opts.tall.extra : H0
    bottom = Math.min(0, sideY(1), sideY(-1))
    // 墙纸：+z 面（朝 (-dir.y, dir.x)）和 -z 面分别取那一侧房间的墙纸
    const n0 = { x: -dir.y, y: dir.x }
    const paper = (k: number) => {
      const r = roomAt(plan, add(mid, mul(n0, k * (t / 2 + 5))))
      return r?.wallpaper ? wallpaperMaterial(r.wallpaper) : null
    }
    const faces: [THREE.Material | null, THREE.Material | null] = [paper(1), paper(-1)]
    // 户建外墙的外侧：外墙材质（板材 / 抹灰 / 砖，按世界坐标贴图）
    if (outer && opts.facade) {
      const k = n.x * n0.x + n.y * n0.y > 0 ? 0 : 1
      if (!faces[k]) faces[k] = opts.facade
    }
    // 本段上的门窗
    const cuts: Cut[] = []
    // 上层挑空边（走廊 / 起居一侧）：整段不砌墙，装栏杆（voidRails）
    if (outer && opts.upper)
      for (const vr of railSegs) {
        const pa = projectToSegment(vr.a, s.a, s.b)
        const pb = projectToSegment(vr.b, s.a, s.b)
        if (pa.d > 1 || pb.d > 1) continue
        cuts.push({ lo: Math.min(pa.t, pb.t), hi: Math.max(pa.t, pb.t), y0: 0, y1: H + 1 })
      }
    for (const info of infos) {
      const pr = projectToSegment(info.center, s.a, s.b)
      if (pr.d > 1 || Math.abs(dir.x * info.dir.y - dir.y * info.dir.x) > 1e-3) continue
      cuts.push({ lo: pr.t - info.width / 2, hi: pr.t + info.width / 2, y0: info.y0, y1: info.y1 })
    }
    // 嵌墙收纳位（壁龛）：正面那段墙整段挖开到壁龛高度（柜子家具伸进墙里）
    for (const f of plan.fixtures) {
      if (f.kind !== 'builtin' || !f.recessed) continue
      const a = (f.rot * Math.PI) / 180
      const fd = fixtureDepth(f)
      const front = add({ x: f.x, y: f.y }, mul({ x: -Math.sin(a), y: Math.cos(a) }, fd / 2))
      const fdir = { x: Math.cos(a), y: Math.sin(a) }
      const pr = projectToSegment(front, s.a, s.b)
      if (pr.d > t / 2 + 2 || Math.abs(dir.x * fdir.y - dir.y * fdir.x) > 1e-3) continue
      cuts.push({ lo: pr.t - f.w / 2, hi: pr.t + f.w / 2, y0: 0, y1: Math.min(H - 1, NICHE_H) })
    }
    cuts.sort((a, b) => a.lo - b.lo)
    const at = (u: number) => add(s.a, mul(dir, u))
    // 两端在转角处各伸出半个墙厚补齐（少伸 0.1，端面藏进相邻墙里，不和它的墙面共面闪烁）；
    // 和另一段共线相接的一端不伸，两段刚好对接
    let cur = continues(s, s.a, dir) ? 0 : -(t / 2 - 0.1)
    const end = L + (continues(s, s.b, dir) ? 0 : t / 2 - 0.1)
    for (const c of cuts) {
      const lo = Math.max(cur, c.lo)
      if (lo > cur) {
        const m = wallPiece(at(cur), at(lo), t, bottom, H, outer, true, n, faces)
        if (m) g.add(m)
        stub(at(cur), at(lo), t)
      }
      // 洞口下方的窗台、上方的过梁
      // 落地的洞口（门、落地窗）下方的窗台压到地面下 0.2，顶面不和室内地面共面闪烁
      const sill = wallPiece(at(lo), at(c.hi), t, bottom, c.y0 <= 0.5 ? -0.2 : Math.min(c.y0, H), outer, c.y0 >= H, n, faces)
      if (sill) g.add(sill)
      if (H > c.y1) {
        const lintel = wallPiece(at(lo), at(c.hi), t, c.y1, H, outer, true, n, faces)
        if (lintel) g.add(lintel)
      }
      cur = Math.max(cur, c.hi)
    }
    if (end > cur) {
      const m = wallPiece(at(cur), at(end), t, bottom, H, outer, true, n, faces)
      if (m) g.add(m)
      stub(at(cur), at(end), t)
    }
  }
  // 壁龛和建筑一体：伸进隔壁（收纳间）的部分用墙包起来——背后、两侧一道墙，壁龛顶以上封到天花，
  // 隔壁看过来只是一段加厚的墙，柜子后面没有空隙
  const H = H0
  for (const f of plan.fixtures) {
    if (f.kind !== 'builtin' || !f.recessed) continue
    const t = plan.wall
    const s = 4
    const d = fixtureDepth(f)
    const a = (f.rot * Math.PI) / 180
    const o = { x: Math.sin(a), y: -Math.cos(a) } // 指向柜子背面（隔壁）
    const dir = { x: Math.cos(a), y: Math.sin(a) }
    const face = add({ x: f.x, y: f.y }, mul(o, -d / 2))
    const at = (k: number, u: number) => add(add(face, mul(o, k)), mul(dir, u))
    const piece = (p: Vec, q: Vec, th: number, y0: number, y1: number) => {
      const m = wallPiece(p, q, th, y0, y1, false, true, o)
      if (m) g.add(m)
    }
    const w = f.w / 2
    piece(at(d + s / 2, -w - s), at(d + s / 2, w + s), s, 0, H)
    for (const k of [-1, 1]) piece(at(t, k * (w + s / 2)), at(d + s, k * (w + s / 2)), s, 0, H)
    if (H - 1 > NICHE_H) piece(at((t + d) / 2, -w), at((t + d) / 2, w), d - t, NICHE_H, H)
  }
  return g
}

/** 门扇、推拉门、折叠门、窗 */
function buildOpenings(infos: OpeningInfo[], H: number) {
  const g = new THREE.Group()
  const top = (y: number) => Math.min(y, H - 1)
  for (const info of infos) {
    const { o, center, dir, out, width: w, wall } = info
    const yaw = Math.atan2(-dir.y, dir.x)
    const p0 = add(center, mul(dir, -w / 2))
    const p1 = add(center, mul(dir, w / 2))
    const doorH = top(198)
    if (o.kind === 'door') {
      const hinge = o.hinge === 'start' ? p0 : p1
      const u = o.hinge === 'start' ? dir : mul(dir, -1)
      const sw = o.swing === 'in' ? mul(out, -1) : out
      // 开到一半多一点：既看得出是门，又不挡视线
      const a = (62 * Math.PI) / 180
      const d = add(mul(u, Math.cos(a)), mul(sw, Math.sin(a)))
      const leaf = new THREE.Group()
      const isEntrance = info.owner.kind === 'entrance' && wall > 12
      const color = isEntrance ? '#8fb7d9' : '#f6dcc0'
      leaf.add(rbox(w - 4, doorH - 2, 3.6, color, { x: (w - 4) / 2, y: 1 }, 1.2))
      leaf.add(rbox(3, 3, 7, C.steel, { x: w - 12, y: Math.min(95, doorH * 0.5) }, 1))
      leaf.position.set(hinge.x + sw.x * 2, 0, hinge.y + sw.y * 2)
      leaf.rotation.y = Math.atan2(-d.y, d.x)
      leaf.userData.info = info
      g.add(leaf)
    } else if (o.kind === 'sliding' || info.sash) {
      // 引き違い：两扇错开，一扇推开一半
      const glass = info.sash
      const t = Math.max(2, wall / 4)
      for (const k of [0, 1]) {
        const pw = w / 2 + 2
        const along = k === 0 ? -w / 4 + w * 0.18 : w / 4
        const off = (k === 0 ? 1 : -1) * (t / 2 + 0.5)
        const c = add(add(center, mul(dir, along)), mul(out, off))
        const panel = new THREE.Group()
        const h = glass ? top(200) - info.y0 : doorH
        if (glass) {
          for (const y of [0, h - 4]) panel.add(rbox(pw, 4, t, '#ffffff', { y }, 0.6))
          for (const s of [-1, 1]) panel.add(rbox(4, h, t, '#ffffff', { x: (s * (pw - 4)) / 2 }, 0.6))
          const pane = rbox(pw - 6, h - 8, t + 0.4, C.glass, { y: 4 }, 0.3)
          pane.material = toon(C.glass, { transparent: 0.45 })
          panel.add(pane)
        } else {
          panel.add(rbox(pw, h, t, '#f3e1c7', {}, 0.8))
          panel.add(rbox(pw - 10, h - 20, t + 0.4, '#fffaf0', { y: 10 }, 0.5))
        }
        panel.position.set(c.x, info.y0, c.y)
        panel.rotation.y = yaw
        panel.userData.info = info
        g.add(panel)
      }
    } else if (o.kind === 'folding') {
      const into = o.swing === 'in' ? mul(out, -1) : out
      const apex = add(add(p0, mul(dir, w / 2)), mul(into, w * 0.28))
      for (const [a, b] of [
        [p0, apex],
        [apex, p1],
      ]) {
        const L = dist(a, b)
        const c = mul(add(a, b), 0.5)
        const m = rbox(L, doorH, 2.4, '#f3e1c7', { y: 0 }, 0.8)
        m.position.set(c.x, doorH / 2, c.y)
        m.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x)
        m.userData.info = info
        g.add(m)
      }
    } else {
      // 腰窗：白框 + 半透明玻璃
      if (info.y0 >= H) continue
      const h = top(info.y1) - info.y0
      if (h < 4) continue
      const frame = new THREE.Group()
      frame.add(rbox(w, 4, wall + 2, '#ffffff', { y: 0 }, 0.8))
      if (top(info.y1) === info.y1) frame.add(rbox(w, 4, wall + 2, '#ffffff', { y: h - 4 }, 0.8))
      for (const s of [-1, 1]) frame.add(rbox(4, h, wall + 2, '#ffffff', { x: (s * (w - 4)) / 2 }, 0.8))
      const pane = rbox(w - 6, h - 6, 1.4, C.glass, { y: 3 }, 0.3)
      pane.material = toon(C.glass, { transparent: 0.45 })
      frame.add(pane)
      frame.position.set(center.x, info.y0, center.y)
      frame.rotation.y = yaw
      frame.userData.info = info
      g.add(frame)
    }
  }
  for (const c of g.children) {
    const info = c.userData.info as OpeningInfo
    if (info) tagFade(c, info.center, info.out, info.outer)
  }
  return g
}

// ---------- 墙上的设备：灯开关、可视对讲、热水器遥控面板、门铃 ----------

function switchPlate() {
  const g = new THREE.Group()
  g.add(rbox(7, 12, 1, '#f8f6f2', { y: -6 }, 0.6))
  g.add(rbox(3.6, 5.6, 0.8, '#ffffff', { y: -2.8, z: 0.6 }, 0.4))
  const led = ball(0.35, '#7fe0a8', { y: 3.6, z: 0.6 })
  led.material = toon('#7fe0a8', { emissive: 0.8 })
  g.add(led)
  return g
}
function intercomMonitor() {
  const g = new THREE.Group()
  g.add(rbox(20, 15, 2.6, '#f5f3ee', { y: -7.5 }, 1))
  g.add(glow(11, 7.5, '#7fb8e6', { x: -2.5, y: -4.5, z: 1.4 }, 0.5))
  for (let i = 0; i < 3; i++) g.add(rbox(2.6, 1.6, 0.6, '#cfd3da', { x: 6.2, y: -5.5 + i * 2.6, z: 1.4 }, 0.4))
  return g
}
function bathRemote() {
  const g = new THREE.Group()
  g.add(rbox(13, 12, 2, '#f5f3ee', { y: -6 }, 1))
  g.add(glow(8, 4, '#ffb347', { y: -1.5, z: 1.1 }, 0.6))
  for (const [x, c] of [
    [-3.5, '#ff8f86'],
    [0, '#a8d4f4'],
    [3.5, '#a6e3cc'],
  ] as const)
    g.add(ball(1, c, { x, y: -4.5, z: 1.2 }, [1, 1, 0.5]))
  return g
}
function doorbell() {
  const g = new THREE.Group()
  g.add(rbox(8, 13, 2.6, '#e9e6e0', { y: -6.5 }, 0.8))
  g.add(ball(1.2, '#3a3a3c', { y: 2.5, z: 1.3 }, [1, 1, 0.5]))
  g.add(cyl(1.6, 1.6, 0.8, '#d9dee6', { y: -3.5, z: 1.3, rx: Math.PI / 2 }, 16))
  return g
}

/**
 * 每扇门旁边（门把手一侧）离地 120 的灯开关，两侧房间各一个；
 * LDK 门边的可视对讲 + 热水器遥控（日本住宅的标配位置），浴室门内的浴室遥控，玄关门外的门铃。
 * 设备跟着所在的墙一起透明 / 压低。
 */
function buildWallDevices(plan: Plan, infos: OpeningInfo[], H: number) {
  const g = new THREE.Group()
  const placed = new Set<string>()
  const add = (obj: THREE.Object3D, info: OpeningInfo, side: Vec, along: number, y: number) => {
    if (y + 2 > H) return
    const p = add2(add2(info.center, mul(info.dir, along)), mul(side, info.wall / 2 + 0.3))
    obj.position.set(p.x, y, p.y)
    obj.rotation.y = Math.atan2(side.x, side.y)
    mergeMeshes(obj)
    addOutlines(obj)
    // 外墙上的东西（户外的门铃也好、室内的开关也好）跟着那面墙走：用墙的外法线判断；内墙只看朝向不分正反
    tagFade(obj, p, info.outer ? info.out : mul(side, -1), info.outer)
    g.add(obj)
  }
  const roomOnSide = (info: OpeningInfo, side: Vec) => roomAt(plan, add2(info.center, mul(side, info.wall / 2 + 20)))
  for (const info of infos) {
    if (info.o.kind === 'window') continue
    // 门把手一侧：开门在铰链对侧，推拉门放在门框右侧
    const latch = info.o.kind === 'door' ? (info.o.hinge === 'start' ? 1 : -1) : 1
    const along = latch * (info.width / 2 + 10)
    for (const sgn of [-1, 1]) {
      const side = mul(info.out, sgn)
      const room = roomOnSide(info, side)
      if (!room) {
        // 户外一侧：玄关大门外装门铃；同一位置已经装了可视门铃（素材 hc-doorbell-*，一键布置或手动摆的）就不画默认门铃
        if (info.owner.kind === 'entrance' && info.outer) {
          const p = add2(add2(info.center, mul(info.dir, along + 6)), mul(side, info.wall / 2))
          if (!plan.furniture.some((f) => f.asset.startsWith('hc-doorbell') && Math.hypot(f.x - p.x, f.y - p.y) < 40)) add(doorbell(), info, side, along + 6, 145)
        }
        continue
      }
      if (!isIndoor(room) || room.kind === 'storage') continue
      const key = `${room.id}|${Math.round(info.center.x)},${Math.round(info.center.y)}`
      if (placed.has(key)) continue
      placed.add(key)
      add(switchPlate(), info, side, along, 125)
      if (room.kind === 'ldk' && !placed.has('intercom')) {
        placed.add('intercom')
        add(intercomMonitor(), info, side, along + latch * 20, 150)
        add(bathRemote(), info, side, along + latch * 36, 150)
      }
      if (room.kind === 'bath' && !placed.has('bath-remote')) {
        placed.add('bath-remote')
        add(bathRemote(), info, side, along + latch * 14, 110)
      }
    }
  }
  return g
}
const add2 = (a: Vec, b: Vec) => ({ x: a.x + b.x, y: a.y + b.y })

/** 卷纸架：底板 + 一卷纸 + 翻盖，正面朝 +z，原点在背面中心；remote 时上方带温水洗净遥控器 */
function paperHolder(remote = false) {
  const g = new THREE.Group()
  if (remote) {
    g.add(rbox(16, 7, 1.6, '#f6f7f9', { y: 6, z: 0.8 }, 0.6))
    for (const [x, c] of [
      [-4.5, '#7fb8e6'],
      [-1.5, '#ff9a8b'],
      [1.5, '#a6e3cc'],
      [4.5, '#cfd3da'],
    ] as const)
      g.add(ball(1, c, { x, y: 9.5, z: 1.7 }, [1, 1, 0.45]))
  }
  g.add(rbox(15, 9, 1.2, '#eef0f2', { y: -4.5, z: 0.6 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(1.2, 6, 7, '#d9dee6', { x: s * 7, y: -5, z: 4 }, 0.4))
  const roll = cyl(5.2, 5.2, 11, '#fbfbf8', { y: -5.5, z: 6.2, rz: Math.PI / 2 }, 20)
  roll.position.set(0, -2.5, 6.2)
  g.add(roll)
  g.add(cyl(1.6, 1.6, 11.4, '#cfd3da', {}, 12).translateY(0))
  g.children[g.children.length - 1].position.set(0, -2.5, 6.2)
  g.children[g.children.length - 1].rotation.z = Math.PI / 2
  g.add(rbox(15, 1, 11, '#d9dee6', { y: 3.2, z: 5.5, rx: -0.12 }, 0.4))
  return g
}

/**
 * 马桶旁边的卷纸架：找马桶左右两侧较近的那面墙，装在离地 70、比马桶中心靠前 15 的位置（伸手够得着）。
 * 两侧都没有 70cm 以内的墙就不装。
 */
function buildPaperHolders(plan: Plan) {
  const g = new THREE.Group()
  for (const f of plan.fixtures) {
    if (f.kind !== 'toilet') continue
    const room = roomAt(plan, f)
    if (!room) continue
    const a = (f.rot * Math.PI) / 180
    const right = { x: Math.cos(a), y: Math.sin(a) }
    const front = { x: -Math.sin(a), y: Math.cos(a) }
    let best: { t: number; side: Vec; half: number } | null = null
    for (const s of [-1, 1]) {
      const dir = mul(right, s)
      for (const e of edgesOf(room.points)) {
        // 射线 center + dir·t 与墙段相交
        const den = dir.x * -e.dir.y + dir.y * e.dir.x
        if (Math.abs(den) < 1e-6) continue
        const ex = e.a.x - f.x
        const ey = e.a.y - f.y
        const t = (ex * -e.dir.y + ey * e.dir.x) / den
        const u = (ex * dir.y - ey * dir.x) / den
        if (t <= 0 || u > 0 || u < -e.length) continue
        const half = wallThicknessAt(plan, add2(f, mul(dir, t)), dir, room) / 2
        if (t - half > 70) continue
        if (!best || t - half < best.t) best = { t: t - half, side: dir, half }
      }
    }
    if (!best) continue
    const p = add2(add2(f, mul(best.side, best.t - 0.2)), mul(front, 15))
    const obj = paperHolder((f.toiletType ?? 'washlet') !== 'basic')
    obj.position.set(p.x, 70, p.y)
    // 正面朝房间里（远离墙）
    obj.rotation.y = Math.atan2(-best.side.x, -best.side.y)
    mergeMeshes(obj)
    addOutlines(obj)
    tagFade(obj, p, best.side, best.half * 2 >= plan.wallOuter)
    g.add(obj)
  }
  return g
}

/**
 * 窗帘：跟窗户配套自动生成。窗帘杆比窗宽出两侧各 15，装在窗顶上方；
 * 落地窗的帘子垂到地面，腰窗垂到窗台下 15。两侧厚帘拉开收在两边（带褶），中间一层半透明纱帘。
 * 居室默认挂（和室不挂），颜色取房间的 curtain 设定。
 */
function buildCurtains(plan: Plan, infos: OpeningInfo[], H: number) {
  const g = new THREE.Group()
  for (const info of infos) {
    if (info.o.kind !== 'window') continue
    const room = info.owner
    const color = room.curtain === false ? null : (room.curtain ?? (room.kind === 'ldk' || room.kind === 'western' ? '#f1e6d6' : null))
    if (!color) continue
    const into = mul(info.out, -1)
    // 杆高、下摆（窗下有厨房台面、洗面台这类设备时下摆收到设备顶面以上），见 curtains.ts
    const spec = curtainSpec(plan, info, H)
    if (!spec) continue
    const { rodY, bottom } = spec
    const len = rodY - bottom - 2
    const W = info.width + 30
    const obj = new THREE.Group()
    // 窗帘杆 + 两端球头 + 支架
    const rod = cyl(1.2, 1.2, W, '#c9b49a', {}, 12)
    rod.rotation.z = Math.PI / 2
    rod.position.set(0, rodY, 8)
    obj.add(rod)
    for (const s of [-1, 1]) {
      obj.add(ball(2.2, '#b49a7c', { x: (s * W) / 2, y: rodY, z: 8 }))
      obj.add(rbox(1.6, 1.6, 8, '#b49a7c', { x: s * (W / 2 - 6), y: rodY - 0.8, z: 4 }, 0.4))
    }
    // 两侧厚帘：每侧收成约 0.22 窗宽，用几道竖向褶（扁胶囊）
    const side = Math.max(14, info.width * 0.22)
    const folds = Math.max(3, Math.round(side / 7))
    for (const s of [-1, 1]) {
      const cx = s * (W / 2 - side / 2 - 2)
      for (let k = 0; k < folds; k++) {
        const fx = cx - side / 2 + (k + 0.5) * (side / folds)
        const fold = capsule(side / folds / 2 + 0.6, Math.max(1, len - side / folds), k % 2 ? color : shade(color, -0.05), { x: fx, y: bottom, z: 8 + (k % 2) * 1.2 })
        fold.scale.z = 0.45
        obj.add(fold)
      }
    }
    // 中间纱帘（半透明，不描边）
    const sheer = rbox(W - side * 2 - 4, len, 0.4, '#ffffff', { y: bottom, z: 6 }, 0.1)
    sheer.material = toon('#ffffff', { transparent: 0.35 })
    obj.add(sheer)
    const c = add(info.center, mul(into, info.wall / 2))
    obj.position.set(c.x, 0, c.y)
    obj.rotation.y = Math.atan2(into.x, into.y)
    mergeMeshes(obj)
    addOutlines(obj)
    tagFade(obj, c, info.out, info.outer)
    g.add(obj)
  }
  return g
}

const trimCache = new Map<string, THREE.Material>()
/**
 * 边饰材质：比墙纸（polygonOffset -1 / -2）偏移得更多。墙纸的偏移随表面倾斜变大，斜着看时会把墙纸拉到
 * 只凸出 0.8cm 的腰壁前面，逐像素抢深度成一片网点，而且随视角变化。边饰偏移更大就始终压在墙纸上。
 */
function trimMat(color: string) {
  let m = trimCache.get(color)
  if (!m) {
    const src = toon(color)
    m = src.clone()
    m.onBeforeCompile = src.onBeforeCompile
    m.customProgramCacheKey = src.customProgramCacheKey
    m.polygonOffset = true
    m.polygonOffsetFactor = -3
    m.polygonOffsetUnits = -6
    trimCache.set(color, m)
  }
  return m
}

/**
 * 墙面边饰：踢脚线、腰壁、顶角线。沿房间内侧墙面（按各边墙厚内缩的多边形）走一圈，
 * 门洞、敞开的边断开；腰壁在落到它高度以下的窗处也断开。墙凸角处各多伸出一个厚度把角包住。
 * 每条都按所在的墙打上透明标记，并带 wall 信息：墙压低时腰壁跟着变矮、顶角线收掉。
 */
function buildTrims(plan: Plan, infos: OpeningInfo[], H: number) {
  const g = new THREE.Group()
  const segs = wallSegments(plan.rooms)
  const opens = segs.filter((s) => s.kind === 'open')
  const outers = segs.filter((s) => s.kind === 'outer')
  for (const room of plan.rooms) {
    const tr: WallTrim | undefined = room.wallpaper?.trim
    if (!tr || !isIndoor(room)) continue
    const es = roomEdges(room.points)
    const n = es.length
    const half = es.map((e) => wallThicknessAt(plan, mul(add(e.a, e.b), 0.5), e.out, room) / 2)
    // 内缩后相邻两边的交点
    const corner = (i: number) => {
      const p = es[(i + n - 1) % n]
      const q = es[i]
      const pa = add(p.a, mul(p.out, -half[(i + n - 1) % n]))
      const qa = add(q.a, mul(q.out, -half[i]))
      const den = p.dir.x * q.dir.y - p.dir.y * q.dir.x
      if (Math.abs(den) < 1e-6) return qa
      const t = ((qa.x - pa.x) * q.dir.y - (qa.y - pa.y) * q.dir.x) / den
      return add(pa, mul(p.dir, t))
    }
    // 凸角（墙角伸进房间）：下一条边朝本条的外侧拐
    const reflex = (i: number) => {
      const p = es[(i + n - 1) % n]
      return es[i].dir.x * p.out.x + es[i].dir.y * p.out.y > 0.5
    }
    es.forEach((e, i) => {
      const s0 = corner(i)
      const s1 = corner((i + 1) % n)
      const along = (p: Vec) => (p.x - e.a.x) * e.dir.x + (p.y - e.a.y) * e.dir.y
      // 这条边上要断开的区间：[lo, hi, 洞口底高]
      const cuts: [number, number, number][] = []
      for (const info of infos) {
        const pr = projectToSegment(info.center, e.a, e.b)
        if (pr.d > 1 || Math.abs(e.dir.x * info.dir.y - e.dir.y * info.dir.x) > 1e-3) continue
        cuts.push([pr.t - info.width / 2, pr.t + info.width / 2, info.y0])
      }
      for (const s of opens) {
        const pa = projectToSegment(s.a, e.a, e.b)
        const pb = projectToSegment(s.b, e.a, e.b)
        if (pa.d > 1 || pb.d > 1) continue
        cuts.push([Math.min(pa.t, pb.t), Math.max(pa.t, pb.t), -1])
      }
      // 和墙体用同一个标准：这条边在户型外轮廓（kind 'outer' 的墙段）上才算外墙。
      // 按墙厚判断的话，中式户型里厚的承重内墙会被当成外墙，半墙模式下墙压低了腰壁还立着
      const mid = mul(add(e.a, e.b), 0.5)
      const outer = outers.some((sg) => projectToSegment(mid, sg.a, sg.b).d < 1)
      const strip = (y0: number, h: number, th: number, color: string, under: number) => {
        // under：低于这个高度的洞口（门、落地窗；腰壁还有矮窗）要断开
        let spans: [number, number][] = [[along(s0) - (reflex(i) ? th : 0), along(s1) + (reflex((i + 1) % n) ? th : 0)]]
        for (const [lo, hi, y] of cuts) {
          if (y >= under) continue
          spans = spans.flatMap(([a, b]): [number, number][] => (hi <= a || lo >= b ? [[a, b]] : ([[a, lo], [hi, b]] as [number, number][]).filter(([x, z]) => z - x > 2)))
        }
        for (const [a, b] of spans) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, h, th), trimMat(color))
          const c = add(add(e.a, mul(e.dir, (a + b) / 2)), mul(e.out, -(half[i] + th / 2)))
          m.position.set(c.x, y0 + h / 2, c.y)
          m.rotation.y = Math.atan2(-e.dir.y, e.dir.x)
          m.userData.wall = { y0, h }
          m.receiveShadow = true
          // 让开 / 压低的判断用墙体中线上的点：用边饰自己的中心（偏到墙面外侧几厘米）判断，
          // 视角在阈值附近时会和墙体本身判得不一样——墙压低了、腰壁还立着，转视角时来回闪
          tagFade(m, add(e.a, mul(e.dir, (a + b) / 2)), e.out, outer)
          g.add(m)
        }
      }
      if (tr.wainscot) {
        const w = tr.wainscot
        strip(0, w.h, 0.8, w.color, w.h)
        // 顶上的压条
        strip(w.h - 3, 3, 2, shade(w.color, -0.06), w.h)
        // 竖向压条板：每 30 一根细条
        if (w.kind === 'batten') {
          const a0 = along(s0)
          const a1 = along(s1)
          for (let u = a0 + 15; u < a1 - 5; u += 30) {
            if (cuts.some(([lo, hi, y]) => y < w.h && u > lo - 2 && u < hi + 2)) continue
            const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, w.h - 3, 1.4), trimMat(shade(w.color, -0.03)))
            const c = add(add(e.a, mul(e.dir, u)), mul(e.out, -(half[i] + 0.7)))
            m.position.set(c.x, (w.h - 3) / 2, c.y)
            m.rotation.y = Math.atan2(-e.dir.y, e.dir.x)
            m.userData.wall = { y0: 0, h: w.h - 3 }
            tagFade(m, add(e.a, mul(e.dir, u)), e.out, outer)
            g.add(m)
          }
        }
      }
      if (tr.base) strip(0, tr.base.h, tr.wainscot ? 1.8 : 1.2, tr.base.color, tr.base.h)
      if (tr.crown && H > 60) {
        // 两级台阶的线脚
        strip(H - tr.crown.h, tr.crown.h, 1.4, tr.crown.color, H + 1)
        strip(H - tr.crown.h * 0.45, tr.crown.h * 0.45, 2.8, tr.crown.color, H + 1)
      }
    })
  }
  mergeMeshes(g)
  return g
}

/** 字符串的小哈希（阳台扶手配色、物干し金物有无等按房间 id 固定下来） */
function strHash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * 阳台外缘的扶手墙，按 Room.railing 分几种（不填 = mixed）：
 *   concrete 混凝土腰墙 105 + 铝压顶（笠木），内侧地面一道排水沟 + 排水口
 *   glass    矮基座 + 立柱 + 磨砂玻璃面板 + 金属扶手
 *   bars     矮基座 + 竖条金属栏杆（縦格子）+ 扶手
 *   louver   矮基座 + 立柱 + 斜百叶 + 扶手
 *   mixed    混凝土腰墙 60 + 上半截磨砂玻璃 + 扶手（旧存档的样子）
 * 另外：空调外机接到建筑外墙的配管盖（化粧カバー）、外墙上的晾衣杆支架（物干し金物）+ 晾衣杆。
 */
function balconyRails(plan: Plan, H = 240) {
  const g = new THREE.Group()
  const indoor = plan.rooms.filter(isIndoor)
  for (const r of plan.rooms.filter((x) => !isIndoor(x))) {
    const y = floorY(r)
    const kind = r.railing ?? 'mixed'
    const hash = strHash(r.id)
    // 金属件：银色铝 / 古铜色，按房间固定
    const metal = hash % 3 === 0 ? '#6b6258' : '#c9ccd0'
    for (const e of edgesOf(r.points)) {
      const shared = indoor.flatMap((o) => sharedIntervals(e, o)).sort((a, b) => a[0] - b[0])
      let cur = 0
      const spans: [number, number][] = []
      for (const [lo, hi] of shared) {
        if (lo > cur) spans.push([cur, lo])
        cur = Math.max(cur, hi)
      }
      if (cur < e.length) spans.push([cur, e.length])
      for (const [lo, hi] of spans) {
        if (hi - lo < 2) continue
        const a = add(e.a, mul(e.dir, lo - 6))
        const b = add(e.a, mul(e.dir, hi + 6))
        const c = mul(add(a, b), 0.5)
        const L = dist(a, b)
        const ry = Math.atan2(-(b.y - a.y), b.x - a.x)
        // 局部 +z 在平面上是 (-dir.y, dir.x)；zin = 朝阳台里侧的 z 符号
        const zin = -e.dir.y * e.out.x + e.dir.x * e.out.y > 0 ? -1 : 1
        /** 局部坐标（x 沿扶手、z 垂直、y 从阳台地面起）搭好的一组：放到位，跟着外墙一起透明 */
        const put = (obj: THREE.Object3D) => {
          obj.position.set(c.x, y, c.y)
          obj.rotation.y = ry
          mergeMeshes(obj)
          addOutlines(obj)
          tagFade(obj, c, e.out, true)
          g.add(obj)
        }
        const glassPanel = (w: number, h: number, at: { x?: number; y: number; z?: number }) => {
          const m = rbox(w, h, 1.2, C.glass, at, 0.4)
          m.material = toon(C.glass, { transparent: 0.35 })
          m.userData.noOutline = true
          return m
        }
        /** 立柱位置：两端 + 中间按间距均分 */
        const posts = (gap: number) => {
          const n = Math.max(1, Math.round((L - 8) / gap))
          return Array.from({ length: n + 1 }, (_, i) => -L / 2 + 4 + ((L - 8) * i) / n)
        }
        if (kind === 'mixed') {
          const wall = wallPiece(a, b, 12, y, y + 60, true, true, e.out)
          if (wall) g.add(wall)
          const glass = rbox(L, 40, 3, C.glass, {}, 0.5)
          glass.material = toon(C.glass, { transparent: 0.35 })
          glass.position.set(c.x, y + 80, c.y)
          glass.rotation.y = ry
          tagFade(glass, c, e.out, true)
          g.add(glass)
          const rail = rbox(L, 5, 8, '#ffffff', {}, 2)
          rail.position.set(c.x, y + 102.5, c.y)
          rail.rotation.y = ry
          tagFade(rail, c, e.out, true)
          g.add(rail)
          continue
        }
        if (kind === 'concrete') {
          const wall = wallPiece(a, b, 15, y, y + 105, true, true, e.out)
          if (wall) g.add(wall)
          // 铝压顶：比墙宽，两侧往下包一点
          const cap = new THREE.Group()
          cap.add(rbox(L + 1, 2.4, 19, metal, { y: 105 }, 0.6))
          for (const s of [-1, 1]) cap.add(rbox(L + 1, 4, 1, metal, { y: 103, z: s * 9 }, 0.3))
          put(cap)
          // 内侧地面的排水沟 + 排水口（贴地，不随墙透明）
          const ditch = new THREE.Group()
          ditch.add(rbox(L - 2, 0.5, 9, '#b9b3aa', { y: 0.05, z: zin * 13 }, 0.2))
          ditch.add(rbox(L - 2, 0.6, 1, '#a39d94', { y: 0.05, z: zin * 17.8 }, 0.2))
          ditch.add(cyl(3.6, 3.6, 0.7, '#6d6862', { x: -L / 2 + 14, y: 0.1, z: zin * 13 }, 16))
          for (let k = -1; k <= 1; k++) ditch.add(rbox(6, 0.3, 0.5, '#4a4642', { x: -L / 2 + 14, y: 0.8, z: zin * 13 + k * 1.6 }, 0.1))
          ditch.position.set(c.x, y, c.y)
          ditch.rotation.y = ry
          mergeMeshes(ditch)
          g.add(ditch)
          continue
        }
        // 其余三种：矮基座 + 上下横梁 + 扶手
        const curb = wallPiece(a, b, 12, y, y + 12, true, true, e.out)
        if (curb) g.add(curb)
        const top = new THREE.Group()
        top.add(rbox(L, 4.5, 7, metal, { y: 105.5 }, 1.8))
        top.add(rbox(L, 2.5, 3.5, metal, { y: 12 }, 0.6))
        if (kind === 'glass') {
          const ps = posts(110)
          for (const x of ps) top.add(rbox(4, 92, 4, metal, { x, y: 14 }, 0.8))
          for (let i = 0; i + 1 < ps.length; i++) top.add(glassPanel(ps[i + 1] - ps[i] - 4.6, 84, { x: (ps[i] + ps[i + 1]) / 2, y: 18 }))
        } else if (kind === 'bars') {
          for (const x of posts(180)) top.add(rbox(4, 92, 4, metal, { x, y: 14 }, 0.8))
          const n = Math.max(2, Math.round(L / 11))
          for (let i = 1; i < n; i++) top.add(rbox(1.8, 91, 2.4, metal, { x: -L / 2 + (L * i) / n, y: 14.5 }, 0.5))
        } else {
          for (const x of posts(150)) top.add(rbox(5, 92, 5, metal, { x, y: 14 }, 0.8))
          for (let k = 0; k < 11; k++) {
            const s = rbox(L - 6, 1.2, 8.5, metal, { y: 20 + k * 7.8 }, 0.4)
            s.rotation.x = 0.55 * zin
            top.add(s)
          }
        }
        put(top)
      }
    }
    balconyExtras(plan, r, y, metal, hash, H, g)
  }
  return g
}

/** 阳台的附属细节：空调外机的配管盖、外墙上的物干し金物 + 晾衣杆 */
function balconyExtras(plan: Plan, r: Room, y: number, metal: string, hash: number, H: number, g: THREE.Group) {
  // 配管盖：从外机侧面出来，沿建筑外墙往上，到 205 左右进墙（外机背靠外墙）
  for (const f of plan.fixtures) {
    if (f.kind !== 'outdoor' || !pointInPolygon(f, r.points)) continue
    const d = fixtureDepth(f)
    const s = hash % 2 ? 1 : -1
    const duct = new THREE.Group()
    const x = s * (f.w / 2 + 5)
    const z = -d / 2 + 3.6
    const top = Math.min(205, H - 20) - y
    duct.add(rbox(7, 7, 12, '#efe9dd', { x: s * (f.w / 2 + 1.5), y: 28, z: -d / 2 + 7 }, 1.2))
    duct.add(rbox(7.5, top - 28, 6.4, '#efe9dd', { x, y: 28, z }, 1.2))
    duct.add(rbox(10, 6, 3, shade('#efe9dd', -0.06), { x, y: top - 3, z: -d / 2 + 1.5 }, 0.8))
    // 排水软管：外机底部垂到地面
    duct.add(cyl(0.9, 0.9, 5, '#8a8f96', { x: -s * (f.w / 2 - 12), y: 0, z: -d / 2 + 6 }, 8))
    duct.position.set(f.x, y, f.y)
    duct.rotation.y = (-f.rot * Math.PI) / 180
    mergeMeshes(duct)
    addOutlines(duct)
    const a = (f.rot * Math.PI) / 180
    tagFade(duct, f, { x: Math.sin(a), y: -Math.cos(a) }, true)
    g.add(duct)
  }
  // 物干し金物：贴着建筑外墙的那条边，两只壁挂支架 + 一根晾衣杆（约七成的阳台有）
  if (hash % 10 >= 7) return
  const indoor = plan.rooms.filter(isIndoor)
  let best: { e: ReturnType<typeof edgesOf>[number]; lo: number; hi: number } | null = null
  for (const e of edgesOf(r.points))
    for (const o of indoor) for (const [lo, hi] of sharedIntervals(e, o)) if (!best || hi - lo > best.hi - best.lo) best = { e, lo, hi }
  if (!best || best.hi - best.lo < 150) return
  const { e } = best
  const span = Math.min(best.hi - best.lo - 50, 260)
  const mid = (best.lo + best.hi) / 2
  // 墙面：从边（墙中心线）往阳台里退半个外墙厚；n 指向阳台
  const n = mul(e.out, -1)
  const yy = Math.min(212, H - 18)
  const L = 44
  const slope = 0.12
  const arm = () => {
    const k = new THREE.Group()
    k.add(rbox(5, 16, 1.2, metal, { y: yy - 12, z: 0.6 }, 0.4))
    // 往外略往下的托臂 + 下方斜撑，末端两个凹槽托杆
    const bar = rbox(2.4, 2.4, L, metal, { y: yy - 1.2 - (L / 2) * slope, z: L / 2 + 1 }, 0.6)
    bar.rotation.x = slope
    k.add(bar)
    const brace = rbox(2, 2, 34, metal, { y: yy - 9 - 17 * 0.3, z: 18 }, 0.5)
    brace.rotation.x = -0.3
    k.add(brace)
    for (const zz of [28, 40]) k.add(rbox(2.6, 2.2, 1, metal, { y: yy - zz * slope, z: zz + 1.3 }, 0.3))
    return k
  }
  const hang = new THREE.Group()
  for (const s of [-1, 1]) {
    const k = arm()
    k.position.x = s * (span / 2)
    hang.add(k)
  }
  // 晾衣杆搭在外侧凹槽上
  const pole = cyl(1.6, 1.6, span + 50, '#9fc3dc', { y: 0, rz: Math.PI / 2 }, 12)
  pole.position.set(0, yy + 1.2 - 40 * slope, 41.3)
  hang.add(pole)
  const p = add(add(e.a, mul(e.dir, mid)), mul(n, plan.wallOuter / 2))
  hang.position.set(p.x, 0, p.y)
  hang.rotation.y = Math.atan2(n.x, n.y)
  mergeMeshes(hang)
  addOutlines(hang)
  tagFade(hang, p, n, true)
  g.add(hang)
}

/**
 * 浴室的淋浴：按浴缸位置算安装墙（src/bathroom.ts 的 showerSpot），水栓 + 软管 + 滑杆 + 花洒，侧墙版带台面和镜子；
 * 3点ユニット 装在浴缸背后的墙上，另加浴帘杆。跟着所在的墙一起透明 / 压低（浴帘杆不随墙）。
 */
function buildShowers(plan: Plan) {
  const g = new THREE.Group()
  for (const f of plan.fixtures) {
    if (f.kind !== 'bathtub') continue
    const s = showerSpot(plan, f)
    if (!s) continue
    const fy = floorY(roomAt(plan, f))
    const obj = showerModel({ mode: s.mode, sx: s.sx, full: s.full, low: s.low })
    obj.position.set(s.p.x, fy, s.p.y)
    obj.rotation.y = Math.atan2(s.n.x, s.n.y)
    mergeMeshes(obj)
    addOutlines(obj)
    tagFade(obj, s.p, s.wallOut, s.outer)
    obj.userData.shower = true
    g.add(obj)
    if (s.rail) {
      const [p0, p1] = s.rail
      const len = dist(p0, p1)
      // 浴帘收在离水栓远的一端（杆的局部 +x = p0 → p1）
      const t = ((s.p.x - p0.x) * (p1.x - p0.x) + (s.p.y - p0.y) * (p1.y - p0.y)) / Math.max(1, len * len)
      const cur = showerCurtainModel(len, t > 0.5 ? -1 : 1)
      const c = mul(add(p0, p1), 0.5)
      cur.position.set(c.x, fy, c.y)
      cur.rotation.y = Math.atan2(-(p1.y - p0.y), p1.x - p0.x)
      mergeMeshes(cur)
      addOutlines(cur)
      g.add(cur)
    }
  }
  return g
}

/** rise：楼梯的层间高（不给按墙高 + 楼板厚） */
export function fixtureModel(f: Fixture, wallH: number, rise?: number) {
  const d = fixtureDepth(f)
  switch (f.kind) {
    case 'kitchen':
      return kitchenModel(f.w, f.variant === 'facing', f.burners, { island: f.island, dishwasher: f.dishwasher, induction: f.induction })
    case 'bathtub':
      return bathtubModel(f.w, d, !!f.shower)
    case 'toilet':
      return toiletModel(f.w, d, f.toiletType ?? 'washlet')
    case 'basin':
      return basinModel(f.w, d)
    // 洗衣机位 / 冰箱位：只画防水盘 + 给排水口 / 地面标记，机器是摆在上面的家具
    case 'washer':
      return washerSpotModel(f.w, d)
    case 'fridge':
      return fridgeSpotModel(f.w, d)
    case 'outdoor': {
      const unit = outdoorUnitModel(f.w, d)
      if (!f.stackOn) return unit
      // 二段置き架台：四根立柱 + 横梁，上面再放一台
      const g = new THREE.Group()
      unit.position.y = 64
      g.add(unit)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) g.add(rbox(3, 66, 3, '#8a8f96', { x: sx * (f.w / 2 + 1), z: sz * (d / 2 - 2) }, 0.6))
      for (const sz of [-1, 1]) g.add(rbox(f.w + 5, 3, 3, '#8a8f96', { y: 61, z: sz * (d / 2 - 2) }, 0.6))
      return g
    }
    case 'ps':
      return psModel(f.w, d, Math.min(wallH, 240))
    case 'builtin':
      return storageSpotModel(f.w, d, !!f.recessed, Math.min(wallH - 1, NICHE_H))
    case 'stairs':
      return stairsModel(f, rise ?? wallH + SLAB)
  }
}

/** 地面高度：房间里按房间（土间、阳台低一点）；户建院子里（不在房间里、在用地里）落到用地的地面 */
function groundAt(plan: Pick<Plan, 'site'>, p: Vec, room: Room | undefined) {
  if (room) return floorY(room)
  return plan.site && pointInPolygon(p, plan.site.points) ? BASE : 0
}

function placeOnFloor(obj: THREE.Object3D, plan: Plan, x: number, y: number, rot: number) {
  obj.position.set(x, groundAt(plan, { x, y }, roomAt(plan, { x, y })), y)
  obj.rotation.y = (-rot * Math.PI) / 180
}

/**
 * 多层户型里搭某一层时的附加信息（单层户型都不用给，和以前一样）。plan 传这一层的子户型（floors.ts floorView）。
 */
export interface HouseOpts {
  /** 不是最底层：不搭底座；地面是带厚度的结构楼板 + 各房间地面，墙脚落在楼板上 */
  upper?: boolean
  /** 这一层的外轮廓（结构楼板的形状，floors.ts floorOutline） */
  outline?: Vec[] | null
  /** 楼板上挖空的区域：楼梯洞口、挑空（stairs.ts slabHoles） */
  holes?: Vec[][]
  /** 楼梯洞口：四周装栏杆，出梯口那一段不装 */
  stairHoles?: { poly: Vec[]; arrival: [Vec, Vec] }[]
  /** 上一层是挑空的区域：这里的外墙通高，墙顶再加 extra */
  tall?: { zones: Vec[][]; extra: number }
  /** 楼梯的层间高 */
  rise?: number
  /** 外墙外侧的材质（户建，three/exterior.ts facadeMaterial） */
  facade?: THREE.Material
  /** 不搭展示底座（户建由用地的地面代替） */
  noBase?: boolean
}

export function buildHouse(plan: Plan, wallH: number, opts: HouseOpts = {}) {
  const root = new THREE.Group()
  const pts = plan.rooms.flatMap((r) => r.points)
  if (!pts.length) return root
  const b = bbox(pts)
  const pad = 70
  const W = b.x1 - b.x0 + pad * 2
  const D = b.y1 - b.y0 + pad * 2
  // 底座：两层，上层奶油色，下层深一点，像模型展示台
  const base = rbox(W + 30, 30, D + 30, '#d9c3a5', { x: (b.x0 + b.x1) / 2, y: BASE - 60, z: (b.y0 + b.y1) / 2 }, 14)
  base.receiveShadow = true
  const top = rbox(W, 30, D, '#f5ead8', { x: (b.x0 + b.x1) / 2, y: BASE - 30, z: (b.y0 + b.y1) / 2 }, 10)
  top.receiveShadow = true
  if (!opts.upper && !opts.noBase) {
    root.add(base)
    root.add(top)
  }

  const floors = new THREE.Group()
  const holes = opts.holes ?? []
  for (const r of plan.rooms) {
    // 挑空没有地面
    if (r.kind === 'void') continue
    const slab = opts.upper ? floorSlab(r, isIndoor(r) ? -2 : -SLAB, holes) : floorSlab(r)
    if (slab) floors.add(slab)
    if (r.kind === 'japanese') floors.add(tatami(r, plan.wall))
  }
  if (opts.upper && opts.outline) {
    // 四周被房间围住的挑空：结构楼板上挖掉（墙坐在楼板上，洞口比挑空每边小半个外墙厚）
    const inner = plan.rooms.filter((r) => r.kind === 'void').map((r) => offsetPolygon(r.points, -plan.wallOuter / 2))
    floors.add(structureSlab(opts.outline, [...(opts.stairHoles ?? []).map((h) => h.poly), ...inner], plan.wallOuter))
  }
  mergeMeshes(floors)
  root.add(floors)

  const infos = openingInfos(plan)
  const walls = buildWalls(plan, wallH, infos, opts)
  root.add(walls)
  const ops = buildOpenings(infos, wallH)
  addOutlines(ops)
  root.add(ops)
  const rails = balconyRails(plan, wallH)
  root.add(rails)
  root.add(buildShowers(plan))
  root.add(buildWallDevices(plan, infos, wallH))
  root.add(buildPaperHolders(plan))
  root.add(buildCurtains(plan, infos, wallH))
  root.add(buildTrims(plan, infos, wallH))

  // 楼梯洞口四周的栏杆（贴着墙的边不装）
  if (opts.stairHoles?.length) {
    const ws = wallSegments(plan.rooms)
      .filter((s) => s.kind !== 'open')
      .map((s) => ({ a: s.a, b: s.b, t: s.kind === 'outer' ? plan.wallOuter : plan.wall }))
    const rails = new THREE.Group()
    // 开在挑空里的洞口（复式的客厅楼梯）四周没有楼板，不装栏杆（挑空边的栏杆管）
    const voids = plan.rooms.filter((r) => r.kind === 'void')
    for (const h of opts.stairHoles) if (!voids.some((v) => pointInPolygon(centroid(h.poly), v.points))) rails.add(holeRails(h.poly, h.arrival, ws))
    mergeMeshes(rails)
    addOutlines(rails)
    root.add(rails)
  }
  // 上层挑空边的栏杆（走廊 / 起居一侧不砌墙），出梯口那一段让开
  if (opts.upper) {
    const segs = voidRailSegments(plan.rooms)
    if (segs.length) {
      const g = new THREE.Group()
      for (const s of segs) {
        let spans: [number, number][] = [[0, dist(s.a, s.b)]]
        for (const h of opts.stairHoles ?? []) spans = spans.flatMap(([lo, hi]) => subtractSpan(s.a, s.b, h.arrival, 14).filter(([x, y]) => y > lo && x < hi).map(([x, y]): [number, number] => [Math.max(lo, x), Math.min(hi, y)]))
        const u = mul({ x: s.b.x - s.a.x, y: s.b.y - s.a.y }, 1 / Math.max(1e-6, dist(s.a, s.b)))
        for (const [lo, hi] of spans) if (hi - lo > 5) g.add(edgeRail(add(s.a, mul(u, lo)), add(s.a, mul(u, hi))))
      }
      mergeMeshes(g)
      addOutlines(g)
      root.add(g)
    }
  }

  const fx = new THREE.Group()
  for (const f of plan.fixtures) {
    const m = fixtureModel(f, wallH, opts.rise)
    mergeMeshes(m)
    addOutlines(m)
    placeOnFloor(m, plan, f.x, f.y, f.rot)
    // 3D 里点选设备（内置收纳）用
    m.userData.fixtureId = f.id
    fx.add(m)
  }
  if (!opts.upper && !opts.noBase) {
    addOutlines(base)
    addOutlines(top)
  }
  root.add(fx)
  return root
}

export function furnitureModel(fu: Furniture) {
  const def = ASSET_MAP.get(fu.asset)
  const g = new THREE.Group()
  if (!def) return g
  const pal = effectivePalette(def, fu.color ?? 0, fu.colors)
  const m = def.build(pal)
  // 零件按材质合并，draw call 少一个数量级（描边、花纹、弯曲都在合并后的网格上照常工作）
  mergeMeshes(m)
  addOutlines(m)
  applyPatterns(m, pal, fu.patterns)
  // 可开合的柜子：柜门 / 抽屉按 open 摆好（模型本身是关着的）
  if (def.openable) poseDoors(m, !!fu.open)
  g.add(m)
  g.userData.furnitureId = fu.id
  g.userData.asset = fu.asset
  return g
}

/**
 * 摆家具（世界坐标）。多层户型按家具的 floor 找那一层的房间定地面高度，再加上楼层的 elevation；
 * plan 传整份户型或那一层的子户型都行。
 */
export function placeFurniture(obj: THREE.Object3D, plan: Plan, fu: Pick<Furniture, 'x' | 'y' | 'rot' | 'z' | 'floor'>) {
  if (isMultiFloor(plan)) {
    const room = roomAt(plan, { x: fu.x, y: fu.y }, fu.floor ?? null)
    const elev = floorElevation(plan, floorOf(plan, fu))
    obj.position.set(fu.x, elev + (elev === 0 ? groundAt(plan, fu, room) : floorY(room)) + (fu.z ?? 0), fu.y)
    obj.rotation.y = (-fu.rot * Math.PI) / 180
    return
  }
  placeOnFloor(obj, plan, fu.x, fu.y, fu.rot)
  obj.position.y += fu.z ?? 0
}

// ---------- 盆栽贴墙时自动弯曲，避免枝叶穿进墙里 ----------

/** 这件家具要不要做贴墙弯曲（绿植类） */
const plantCache = new Map<string, boolean>()
export const isPlant = (asset: string) => {
  let v = plantCache.get(asset)
  if (v === undefined) {
    const d = ASSET_MAP.get(asset)
    v = !!d && hasTag(d, 'plant') && !d.mount
    plantCache.set(asset, v)
  }
  return v
}

/**
 * 把绿植里越过墙面的部分往房间里弯回来：在家具局部坐标里，对每面墙算出允许伸到的距离，
 * 顶点越过就按高度渐进地推回（花盆不动，越往上弯得越多），法线不变（toon 着色下看不出来）。
 * 每次从原始几何重新算，拖来拖去不会累积变形。
 */
export function bendToWalls(obj: THREE.Object3D, plan: Plan, fu: Pick<Furniture, 'x' | 'y' | 'rot' | 'asset'>) {
  const def = ASSET_MAP.get(fu.asset)
  const room = roomAt(plan, { x: fu.x, y: fu.y })
  if (!def || !room) return
  // 各面墙在家具局部坐标里的法线（指向墙外）和允许的最远距离
  const a = (fu.rot * Math.PI) / 180
  const walls: { nx: number; nz: number; lim: number }[] = []
  const opens = wallSegments(plan.rooms).filter((w) => w.kind === 'open')
  for (const e of edgesOf(room.points)) {
    const mid = mul(add(e.a, e.b), 0.5)
    const half = wallThicknessAt(plan, mid, e.out, room) / 2
    // 墙面到家具中心的距离（沿墙外法线）
    const dist = (e.a.x - fu.x) * e.out.x + (e.a.y - fu.y) * e.out.y - half
    if (dist > Math.max(def.w, def.d) + 40) continue
    // 只管这面墙的有效范围内（家具中心投影落在墙段上，留余量）
    const t = (fu.x - e.a.x) * e.dir.x + (fu.y - e.a.y) * e.dir.y
    if (t < -60 || t > e.length + 60) continue
    // 离家具最近的那一点上真的有墙吗：门洞、落地窗、敞开的边界（LDK 和厨房之间等）都不算墙
    const q = add(e.a, mul(e.dir, Math.max(0, Math.min(e.length, t))))
    if (opens.some((o) => projectToSegment(q, o.a, o.b).d < 1)) continue
    if (
      plan.openings.some((o) => {
        // 窗（含落地窗）有玻璃挡着，照样当墙；只有门洞是空的
        if (o.kind === 'window') return false
        const g = openingGeom(plan.rooms, o)
        if (!g || Math.abs(g.e.dir.x * e.dir.y - g.e.dir.y * e.dir.x) > 1e-3) return false
        const pr = projectToSegment(g.center, e.a, e.b)
        // 只有植物中心正对门洞（站在门口）才不避让；门旁边那段实墙照样要避
        return pr.d < 1 && Math.abs(pr.t - t) < o.width / 2
      })
    )
      continue
    // 平面法线 → 家具局部（逆旋转）
    const nx = e.out.x * Math.cos(a) + e.out.y * Math.sin(a)
    const nz = -e.out.x * Math.sin(a) + e.out.y * Math.cos(a)
    // 保护：无论如何不压到比花盆还窄（中心已经贴到墙上多半是摆错了位置，不该把整盆压扁）
    walls.push({ nx, nz, lim: Math.max(dist - 3, Math.min(def.w, def.d) * 0.3) })
  }
  obj.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert()
  const v = new THREE.Vector3()
  const box = new THREE.Box3().setFromObject(obj)
  const h = Math.max(1, box.max.y - box.min.y)
  const base = box.min.y
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || o.userData.isOutline) return
    const orig = (o.userData.origGeo as THREE.BufferGeometry | undefined) ?? mesh.geometry
    if (!walls.length) {
      if (o.userData.origGeo) setGeo(mesh, orig)
      return
    }
    o.userData.origGeo = orig
    const M = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
    const Mi = new THREE.Matrix4().copy(M).invert()
    const geo = orig.clone()
    // 克隆归这件家具独有（clone 会把缓存几何体的 shared 标记也抄过来）
    geo.userData.shared = false
    const pos = geo.attributes.position as THREE.BufferAttribute
    let changed = false
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M)
      // 底部 25% 是花盆：只做硬限位（不越过墙面）；往上的枝叶「软夹紧」——
      // 离墙 K 以内开始平滑地往回收，越靠近墙收得越狠，永远停在墙面前，看起来像顺着墙弯过去
      const leaf = (v.y + obj.position.y - base) / h > 0.25
      for (const w of walls) {
        const sv = v.x * w.nx + v.z * w.nz
        let target = sv
        if (leaf) {
          const k = BEND_SOFT
          const start = w.lim - k
          if (sv > start) target = start + k * (1 - Math.exp(-(sv - start) / k))
        } else if (sv > w.lim) target = w.lim
        if (target !== sv) {
          v.x += w.nx * (target - sv)
          v.z += w.nz * (target - sv)
          changed = true
        }
      }
      v.applyMatrix4(Mi)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    if (changed) setGeo(mesh, geo)
    else {
      geo.dispose()
      setGeo(mesh, orig)
    }
  })
}

/** 枝叶开始往回收的距离（cm）：越大弯得越早、越圆 */
const BEND_SOFT = 14

function setGeo(mesh: THREE.Mesh, geo: THREE.BufferGeometry) {
  // 上一次弯出来的克隆用完即弃（拖动绿植时每帧都会重弯，不释放会越积越多）
  const old = mesh.geometry
  if (old !== geo && old !== mesh.userData.origGeo && !old.userData.shared) old.dispose()
  mesh.geometry = geo
  for (const c of mesh.children) if (c.userData.isOutline) (c as THREE.Mesh).geometry = geo
}
