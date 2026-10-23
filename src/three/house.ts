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
  roomFlooring,
  roomWallpaper,
  WOOD_TONES,
  type Fixture,
  type Furniture,
  type Plan,
  type Room,
  type RoomKind,
  type Vec,
  type Wallpaper,
  type WallTrim,
  type WoodTone,
  edgesOf as roomEdges,
} from '../model'
import { addPileFringe } from './fringe'
import { drawPlanks, PLANK_TILE } from './woodGrain'
import { isIndoor, sharedIntervals, voidRailSegments, wallSegments, wallThicknessAt, type WallSegment } from '../walls'
import { tatamiLayout } from '../tatami'
import { beamsOf, edgeNear, faceWallpaper } from '../wallFace'
import { doorColor, doorHandleOf, doorStyled, handleColor, hasSidelight, hasTransom, LEGACY_DOOR, LEGACY_ENTRANCE, LEGACY_SLIDING, sidelightWidth, TRANSOM_TOP } from '../doorStyles'
import { doorLeafModel, liteModel } from './doorModels'
import { barnPose, defaultDoorOpen, foldCount, foldLeaves, foldPose, slidingPose, swingPose } from '../doorMotion'
import { addOutlines, ball, capsule, cyl, disposeHooks, isReflector, mergeMeshes, mergeSolidColors, noTransparentShadows, pullDepth, rbox, shade, toon, useAnisotropy } from './toon'
import { movable, poseDoor, poseDoors, type AssetDef } from './kit'
import { bathRemote, doorbell, intercomMonitor, switchPlate } from './wallDeviceModels'
import { DEVICE_ASSET, wallDeviceSpots, type WallDeviceKind } from './wallDevices'
import { freezeMatrices, syncMatrix } from './matrices'
import { hasTag } from './tags'
import { fridgeSpotModel, washerSpotModel } from './appliances'
import { effectivePalette } from './colors'
import { applyPatterns, patternMaterial } from './fabric'
import { withArt } from './artwork'
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
import { showerSpot, stallWalls, type StallWalls } from '../bathroom'
import { resolveMats, tagMat } from './mats'
import { markMetalParts } from './anime'
import { bakeScreens } from './screens'
import { SCREEN_PRESET_MAP } from './screenContent'
import type { Mat } from './matIds'
import { curtainSpec } from '../curtains'
import { archRise, frameColor, gridAllowed, roundDiameter, sashAllowed, shutterColor, windowSpan } from '../windows'
import { spandrelGeometry, windowModel, type WindowModelStyle } from './windows'
import { showerCurtainModel, showerModel } from './shower'
import { edgeRail, holeRails, stairWalls, stairsModel, type WallLine } from './stairs3d'
import { subtractSpan } from '../stairs'
import { SLAB, floorElevation, floorHeight, floorOf, isMultiFloor } from '../floors'
import { CEILING } from './lightFixtures'
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
  return canvasTex(`wood${base}`, 1024, PLANK_TILE, (g, s) => drawPlanks(g, s, base, line))
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
/** 地面材质：瓷砖、榻榻米按房间类型；木地板按色调（natural = 按房间类型的原木色，旧存档的样子） */
function floorMaterial(kind: RoomKind, tone: WoodTone = 'natural') {
  const key = tone === 'natural' ? kind : `wood-${tone}`
  let m = floorMatCache.get(key)
  if (m) return m
  let map: THREE.Texture
  if (tone !== 'natural') map = woodTex(WOOD_TONES[tone].base, WOOD_TONES[tone].line)
  else switch (kind) {
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
  // 写实光照（realistic.ts）的材质和粗糙度：釉面砖最亮、木地板一层淡淡的清漆光泽、榻榻米和阳台、玄关地砖哑光
  const tile = tone === 'natural' && ['wash', 'toilet', 'bath', 'entrance', 'balcony'].includes(kind)
  m.userData.mat = tone === 'natural' && kind === 'japanese' ? 'fabric' : tile ? (kind === 'balcony' || kind === 'entrance' ? 'stone' : 'ceramic') : 'wood'
  m.userData.pbrRoughness = kind === 'japanese' && tone === 'natural' ? 0.92 : kind === 'balcony' ? 0.85 : kind === 'entrance' && tone === 'natural' ? 0.6 : ['wash', 'toilet', 'bath'].includes(kind) && tone === 'natural' ? 0.3 : 0.55
  floorMatCache.set(key, m)
  return m
}

const toV2 = (pts: Vec[]) => pts.map((p) => new THREE.Vector2(p.x, -p.y))

/**
 * 挤出体上的洞：绕向要和外轮廓相反。ExtrudeGeometry 只在外轮廓是逆时针时才顺手把洞翻过来，
 * 外轮廓本来就是顺时针时洞口侧面会朝里——从洞里看是背面，被剔掉，看穿过去（楼梯间里楼板那一层成了一道黑缝）。
 */
function holePath(shape: THREE.Shape, pts: Vec[]) {
  const h = toV2(pts)
  if (THREE.ShapeUtils.isClockWise(h) === THREE.ShapeUtils.isClockWise(shape.getPoints())) h.reverse()
  return new THREE.Path(h)
}

/**
 * 房间地面：从 bottom（缺省底座顶面）挤出到地面高度。holes：要挖掉的区域（上层的楼梯洞口、挑空），
 * 只取和房间相交的部分（凸的洞口按房间裁一下）；洞口盖住整个房间时返回 null。
 */
function floorSlab(r: Room, tone: WoodTone, bottom = BASE, holes: Vec[][] = []) {
  const shape = new THREE.Shape(toV2(r.points))
  for (const h of holes) {
    const cut = clipConvex(r.points, h)
    if (cut.length < 3 || Math.abs(signedArea(cut)) < 4) continue
    if (Math.abs(signedArea(cut)) >= Math.abs(signedArea(r.points)) - 4) return null
    shape.holes.push(holePath(shape, insetToward(cut, 0.5)))
  }
  // 铺榻榻米的和室：楼板低一张榻榻米的厚度，榻榻米面和别的房间地面齐平，楼板只在缝里露出来（深色）
  const sunk = hasTatami(r)
  const top = floorY(r) - (sunk ? TATAMI_T : 0)
  bottom = Math.min(bottom, top - 1)
  const depth = top - bottom
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  const sideMat = toon('#e9dccb')
  const m = new THREE.Mesh(geo, [sunk ? toon('#8e8a5e') : floorMaterial(r.kind, tone), sideMat])
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
 * 上层的结构楼板：外轮廓外扩半个外墙厚（和外墙外皮齐平），从 -SLAB 到 -2（上面再铺各房间的地面）。
 * 外侧是截面色，层与层之间露出一道楼板；洞口（楼梯洞口、四周被房间围住的挑空）的侧面是收口的浅色，
 * 站在楼梯间里抬头看，楼板边不是一道截面。
 */
function structureSlab(outline: Vec[], holes: Vec[][], wallOuter: number) {
  const shape = new THREE.Shape(toV2(offsetPolygon(outline, wallOuter / 2)))
  const cut = holes.filter((h) => h.every((p) => pointInPolygon(p, outline) || onBoundary(outline, p, 0.5))).map((h) => insetToward(h, 0.5))
  for (const h of cut) shape.holes.push(holePath(shape, h))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: SLAB - 2, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  holeSidesToGroup(geo, cut, 2)
  const m = new THREE.Mesh(geo, [toon('#efe6d8'), toon('#b9a48e'), toon('#e8dccb')])
  m.position.y = -SLAB
  m.receiveShadow = true
  m.castShadow = true
  return m
}

/**
 * 挤出体侧面（材质组 1）里贴着洞口边的三角形挪到材质组 mat：按三角形中心离洞口边的距离分。
 * ExtrudeGeometry 是非索引几何体，按组重排三角形顺序即可。
 */
function holeSidesToGroup(geo: THREE.BufferGeometry, holes: Vec[][], mat: number) {
  if (!holes.length || geo.index) return
  const pos = geo.attributes.position
  const tri = (i: number) => ({ x: (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y: (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 })
  const byMat = new Map<number, number[]>()
  for (const g of geo.groups)
    for (let i = g.start; i < g.start + g.count; i += 3) {
      const m = g.materialIndex ?? 0
      // 挤出后 rotateX(-90°)：平面 y 对应世界 z
      const k = m === 1 && holes.some((h) => onBoundary(h, tri(i), 0.6)) ? mat : m
      ;(byMat.get(k) ?? byMat.set(k, []).get(k)!).push(i)
    }
  const names = Object.keys(geo.attributes)
  const src = names.map((n) => geo.attributes[n] as THREE.BufferAttribute)
  const out = src.map((a) => new Float32Array(a.array.length))
  geo.clearGroups()
  let o = 0
  for (const [m, tris] of [...byMat].sort((a, b) => a[0] - b[0])) {
    geo.addGroup(o, tris.length * 3, m)
    for (const i of tris)
      for (let v = 0; v < 3; v++, o++) src.forEach((a, k) => out[k].set(a.array.subarray((i + v) * a.itemSize, (i + v + 1) * a.itemSize), o * a.itemSize))
  }
  names.forEach((n, k) => geo.setAttribute(n, new THREE.BufferAttribute(out[k], src[k].itemSize)))
}

/** 榻榻米厚度：嵌在降低的楼板里，面和地面齐平 */
const TATAMI_T = 3
const hasTatami = (r: Room) => r.kind === 'japanese' && isAxisRect(r.points)

/** 和室：按畳割り铺榻榻米 */
function tatami(r: Room, wall: number) {
  const g = new THREE.Group()
  if (!hasTatami(r)) return g
  const b = bbox(r.points)
  const k = wall / 2
  const y = floorY(r) - TATAMI_T
  for (const t of tatamiLayout(b.x0 + k, b.y0 + k, b.x1 - k, b.y1 - k)) {
    const mat = rbox(t.w - 1.2, TATAMI_T, t.h - 1.2, t.half ? '#d6dc9c' : '#cfd893', { x: t.x + t.w / 2, y, z: t.y + t.h / 2 }, 0.8)
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
/** 墙纸 / 外墙面、边饰往镜头拉近的比例（pullDepth）：边饰比墙纸多一点，始终压在墙纸上 */
export const WALL_PULL = 4e-4
export const TRIM_PULL = 6e-4
const capMat = () => solidShadow(toon('#7a6258'))
const wallMat = (outer: boolean) => solidShadow(toon(outer ? '#fbf3e6' : '#fff8ef'))

/**
 * 多材质的盒子：材质相同的面并进同一组。BoxGeometry 每个面一组、每组一个 draw call（阴影里也是），
 * 墙段六个面大多是同一种墙面材质，合并后一段墙从 6 次降到 2~4 次。返回去重后的材质数组。
 */
function boxMesh(geo: THREE.BoxGeometry, mats: THREE.Material[]) {
  const uniq = [...new Set(mats)]
  if (uniq.length < mats.length && geo.index) {
    const src = geo.index.array
    const out = new (src.constructor as Uint16ArrayConstructor)(src.length)
    const groups = geo.groups.slice()
    geo.clearGroups()
    let o = 0
    uniq.forEach((m, mi) => {
      const start = o
      for (const g of groups) {
        if (mats[g.materialIndex ?? 0] !== m) continue
        out.set(src.subarray(g.start, g.start + g.count), o)
        o += g.count
      }
      geo.addGroup(start, o - start, mi)
    })
    geo.setIndex(new THREE.BufferAttribute(out, 1))
  }
  return new THREE.Mesh(geo, uniq)
}

/**
 * 把同一父节点下的若干（多材质）网格合成一个：顶点烘进 frame 坐标系，按材质重新分组（同材质的面并成一组）。
 * toon.ts 的 mergeMeshes 不处理材质数组，墙体每段都是多材质盒子，用这个合。
 * frame 是合成网格自己的局部矩阵（墙体压低按自身原点缩放 y，所以原点要放在墙段的竖直中心）。
 */
function mergeMulti(list: THREE.Mesh[], frame: THREE.Matrix4): THREE.Mesh {
  const inv = frame.clone().invert()
  const mats: THREE.Material[] = []
  const slot = new Map<THREE.Material, number>()
  const tris: number[][] = []
  let verts = 0
  for (const m of list) {
    m.updateMatrix()
    verts += m.geometry.attributes.position.count
  }
  const pos = new Float32Array(verts * 3)
  const nor = new Float32Array(verts * 3)
  const uv = new Float32Array(verts * 2)
  const local = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const v = new THREE.Vector3()
  let vo = 0
  for (const m of list) {
    local.multiplyMatrices(inv, m.matrix)
    nm.getNormalMatrix(local)
    const g = m.geometry
    const P = g.attributes.position
    const N = g.attributes.normal
    const U = g.attributes.uv
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(local)
      pos[(vo + i) * 3] = v.x
      pos[(vo + i) * 3 + 1] = v.y
      pos[(vo + i) * 3 + 2] = v.z
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize()
      nor[(vo + i) * 3] = v.x
      nor[(vo + i) * 3 + 1] = v.y
      nor[(vo + i) * 3 + 2] = v.z
      if (U) {
        uv[(vo + i) * 2] = U.getX(i)
        uv[(vo + i) * 2 + 1] = U.getY(i)
      }
    }
    const ms = Array.isArray(m.material) ? m.material : [m.material]
    const idx = g.index ? g.index.array : null
    const total = idx ? idx.length : P.count
    const groups = g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }]
    for (const gr of groups) {
      const mat = ms[gr.materialIndex ?? 0]
      let k = slot.get(mat)
      if (k === undefined) {
        k = mats.length
        mats.push(mat)
        slot.set(mat, k)
        tris.push([])
      }
      const t = tris[k]
      const end = Math.min(total, gr.start + gr.count)
      for (let j = gr.start; j < end; j++) t.push(vo + (idx ? idx[j] : j))
    }
    vo += P.count
  }
  const n = tris.reduce((a, t) => a + t.length, 0)
  const index = verts > 65535 ? new Uint32Array(n) : new Uint16Array(n)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  let o = 0
  tris.forEach((t, k) => {
    index.set(t, o)
    if (mats.length > 1) geo.addGroup(o, t.length, k)
    o += t.length
  })
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeBoundingSphere()
  const out = new THREE.Mesh(geo, mats.length > 1 ? mats : mats[0])
  frame.decompose(out.position, out.quaternion, out.scale)
  out.castShadow = list[0].castShadow
  out.receiveShadow = list[0].receiveShadow
  return out
}

/** 墙脚细线：前墙隐藏后仍能看出房间边界（被完整的墙包在里面时看不见） */
function wallStub(a: Vec, b: Vec, t: number, y0: number, y1: number, outer: boolean) {
  const L = dist(a, b)
  if (L < 0.5) return null
  const side = wallMat(outer)
  const m = boxMesh(new THREE.BoxGeometry(L, y1 - y0, t), [side, side, capMat(), side, side, side])
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
  /** 原本投不投影（玻璃、纱帘不投影）：恢复实心时还原成它，不一律打开 */
  cast: boolean
}

/** 物体里要淡出的网格；描边外壳是不透明的，淡出时直接藏起来 */
function fadeParts(o: THREE.Object3D) {
  if (o.userData.parts) return o.userData.parts as { parts: FadePart[]; hulls: THREE.Object3D[] }
  const parts: FadePart[] = []
  const hulls: THREE.Object3D[] = []
  o.traverse((c) => {
    if (c.userData.isOutline) hulls.push(c)
    // 镜子上挂的反射面（three/mirrors.ts）不淡出：材质带着倒影的渲染目标，克隆不了
    else if ((c as THREE.Mesh).isMesh && !c.userData.fadeTwin && !isReflector(c)) {
      const mesh = c as THREE.Mesh
      // 楼层淡出期间第一次走到这里时，网格上挂的是楼层淡出的透明副本：按它记下的原材质算（Sandbox3D fadeFloor）
      const src = (m: THREE.Material) => (m.userData.floorSource as THREE.Material | undefined) ?? m
      const solid = Array.isArray(mesh.material) ? mesh.material.map(src) : src(mesh.material)
      const mats = Array.isArray(solid) ? solid : [solid]
      const ghost = mats.map((m) => {
        const g = m.clone()
        g.onBeforeCompile = m.onBeforeCompile
        g.customProgramCacheKey = m.customProgramCacheKey
        g.transparent = true
        g.depthWrite = false
        return g
      })
      // 楼层淡出期间 castShadow 被临时改过，原值记在 floorShadow 里
      const cast = (mesh.userData.floorShadow as boolean | undefined) ?? mesh.castShadow
      parts.push({ mesh, solid, ghost, base: mats.map((m) => (m.transparent ? m.opacity : 1)), cast })
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
      // 房子是静态矩阵（Sandbox3D 搭好后 freezeMatrices）
      if (!o.matrixAutoUpdate) syncMatrix(o)
      if (look.style === 'cut') {
        const { parts } = fadeParts(o)
        for (const p of parts) {
          p.mesh.material = p.solid
          p.mesh.castShadow = p.cast
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
        p.mesh.castShadow = p.cast
      } else {
        p.ghost.forEach((g, i) => (g.opacity = alpha * p.base[i]))
        p.mesh.material = Array.isArray(p.solid) ? p.ghost : p.ghost[0]
        p.mesh.castShadow = p.cast && e < 0.5
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
  const m = boxMesh(geo, [side, side, capTop ? capMat() : side, side, faces?.[0] ?? side, faces?.[1] ?? side])
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

/**
 * 拱顶窗 / 圆窗在矩形墙洞角上补回的墙块（墙面材质同这段墙）；u = 窗中心沿墙段的位置。
 * 拱顶窗补拱上方两角，圆窗补圆外四角；窗顶顶到天花的不补（拱 / 圆被截掉了，留矩形洞口）。
 */
function spandrel(info: OpeningInfo, u: number, a: Vec, dir: Vec, t: number, outer: boolean, n: Vec, faces: [THREE.Material | null, THREE.Material | null], H: number): THREE.Mesh | null {
  const style = info.o.windowStyle
  if (style !== 'arched' && style !== 'round') return null
  if (info.y1 > H - 1) return null
  const w = info.width
  const h = info.y1 - info.y0
  let y0: number
  let geo: THREE.BufferGeometry | null
  if (style === 'arched') {
    const rise = archRise(w, h)
    y0 = info.y1 - rise
    geo = spandrelGeometry(w, rise, t, w / 2, rise, -rise / 2, false)
  } else {
    const r = roundDiameter(w, h) / 2
    y0 = info.y0
    geo = spandrelGeometry(w, h, t, r, r, 0, true)
  }
  if (!geo) return null
  const side = wallMat(outer)
  const m = new THREE.Mesh(geo, [faces[0] ?? side, faces[1] ?? side, side])
  const hh = info.y1 - y0
  const c = add(a, mul(dir, u))
  tagFade(m, c, n, outer)
  m.userData.wall = { y0, h: hh }
  m.position.set(c.x, y0 + hh / 2, c.y)
  m.rotation.y = Math.atan2(-dir.y, dir.x)
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
    // 复制一份（toon / 花纹材质是共享缓存），加深度偏移（pullDepth）：墙纸面总是压过贴着它的相邻墙端面，交接处不闪
    const src = w.pattern ? patternMaterial(w.pattern, true) : toon(w.color)
    m = src.clone()
    m.onBeforeCompile = src.onBeforeCompile
    m.customProgramCacheKey = src.customProgramCacheKey
    m.shadowSide = THREE.FrontSide
    pullDepth(m, WALL_PULL)
    wpCache.set(key, m)
  }
  return m
}

function openingSpan(o: Plan['openings'][number], owner: Room, sash: boolean) {
  if (o.kind !== 'window') return { y0: 0, y1: hasTransom(o) ? TRANSOM_TOP : 200 }
  return windowSpan(owner, sash, o.sill)
}

/** 窗用哪种模型：没指定款式的按旧样子（朝阳台的落地推拉窗 / 腰窗单片玻璃） */
export function windowModelStyle(info: Pick<OpeningInfo, 'o' | 'sash'>): WindowModelStyle {
  return info.o.windowStyle ?? (info.sash ? 'legacySash' : 'plain')
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
    const sash = o.kind === 'window' && sashAllowed(o) && plan.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(probe, x.points))
    out.push({ center, dir: e.dir, out: e.out, width: w, wall, sash, outer: wall >= plan.wallOuter, o, owner, ...openingSpan(o, owner, sash) })
  }
  return out
}

/**
 * 墙块合批（墙、窗台、过梁）：
 *   - 内墙：让开 / 压低的判断统一用这段墙的中点（以前每块用自己的中心，视角在阈值附近时门边的墙和门上的过梁可能一块让开一块不让），
 *     同一段里 y0 / h 相同的墙块（门窗两侧的整高墙、同高的过梁、同高的窗台）并成一个网格；
 *   - 外墙：是否让开只看法线朝不朝镜头（applyCutaway 里外墙不看位置），所以整层朝向相同、y0 / h 相同的外墙块可以并成一个；
 *   - 压低是按每个对象自己的 { y0, h } 缩放，所以只有同高的才能共用一个变换；
 *   - 压到地面下的窗台（不参与让开）交给 statics，全屋一起合并。
 */
interface WallBucket {
  list: THREE.Mesh[]
  mid: Vec
  n: Vec
  outer: boolean
}
function bucketPieces(buckets: Map<string, WallBucket>, seg: number, pieces: THREE.Mesh[], mid: Vec, n: Vec, outer: boolean, statics: THREE.Mesh[]) {
  for (const m of pieces) {
    if (!m.userData.fade) {
      delete m.userData.wall
      statics.push(m)
      continue
    }
    const w = m.userData.wall as { y0: number; h: number }
    const k = `${outer ? `o${n.x.toFixed(3)},${n.y.toFixed(3)}` : `i${seg}`}|${w.y0}|${w.h}`
    let b = buckets.get(k)
    if (!b) buckets.set(k, (b = { list: [], mid, n, outer }))
    b.list.push(m)
  }
}
function flushWallBuckets(g: THREE.Group, buckets: Map<string, WallBucket>) {
  for (const { list, mid, n, outer } of buckets.values()) {
    const w = list[0].userData.wall as { y0: number; h: number }
    const m = list.length === 1 ? list[0] : mergeMulti(list, new THREE.Matrix4().makeTranslation(0, w.y0 + w.h / 2, 0))
    if (list.length > 1) for (const x of list) x.geometry.dispose()
    m.userData.wall = { y0: w.y0, h: w.h }
    // 外墙组的中心取第一段的中点即可（外墙让开不看位置）
    tagFade(m, mid, n, outer)
    g.add(m)
  }
}

function buildWalls(plan: Plan, H0: number, infos: OpeningInfo[], opts: HouseOpts = {}) {
  const g = new THREE.Group()
  // 墙外侧不是房间时墙脚落到哪：最底层落到底座，上层落在楼板上
  const outside = opts.upper ? 0 : BASE
  let bottom = 0
  let isOuter = false
  // 不参与让开 / 压低的部分（墙脚细线、压到地面下的窗台门槛）：全屋按投影设置各合成一个网格
  const statics: THREE.Mesh[] = []
  const stub = (a: Vec, b: Vec, t: number) => {
    // 墙脚线顶面 2.4（和室里像一圈畳寄せ，高出榻榻米面）。外墙的比墙薄：不从外墙面凸出来（户建的外墙材质上会露出一道浅色线）
    const m = wallStub(a, b, isOuter ? t - 0.4 : t + 0.4, bottom, 2.4, isOuter)
    if (m) statics.push(m)
  }
  /** 本段墙上的墙块（墙、窗台、过梁），段末分进合批的桶，全部建完再合并 */
  let pieces: THREE.Mesh[] = []
  const buckets = new Map<string, WallBucket>()
  let segIdx = 0
  const put = (m: THREE.Mesh | null) => {
    if (m) pieces.push(m)
  }
  const seen = new Set<string>()
  const key = (p: Vec) => `${Math.round(p.x)},${Math.round(p.y)}`
  // 共用墙两侧各出一份墙段，而且一侧可能是连成一整段、另一侧在丁字口断开：端点去重去不干净，
  // 重合的墙面互相抢深度（接缝闪烁），共线判断也会被骗（转角缺一块）。先规范成每条直线上互不重叠的墙段
  const raw = wallSegments(plan.rooms).filter((s) => {
    if (s.kind === 'open') return false
    const k1 = key(s.a) + '|' + key(s.b)
    const k2 = key(s.b) + '|' + key(s.a)
    if (seen.has(k1) || seen.has(k2)) return false
    seen.add(k1)
    return true
  })
  /**
   * 墙段 a→b 往上多砌的部分会不会埋在上层楼板里：沿墙逐段取点，墙的两侧各自要么在上层外轮廓里（楼板底下），
   * 要么是户外（这一层没有房间，也就没有屋顶）。一侧是这一层露出来盖屋顶的部分时不砌，免得从屋顶穿出去
   */
  const underSlab = (a: Vec, b: Vec, n: Vec, t: number, cover: Vec[] | null) => {
    if (!cover) return false
    const side = (p: Vec) => pointInPolygon(p, cover) || !plan.rooms.some((r) => pointInPolygon(p, r.points))
    // 沿墙每 20cm 取一点（离两端各让 1cm，端点正好落在轮廓边上时判不准）
    const L = dist(a, b)
    const k = Math.max(1, Math.ceil(L / 20))
    for (let i = 0; i <= k; i++) {
      const u = Math.min(L - 1, Math.max(1, (L * i) / k))
      const p = add(a, mul({ x: (b.x - a.x) / L, y: (b.y - a.y) / L }, u))
      if (!side(add(p, mul(n, t / 2 + 2))) || !side(add(p, mul(n, -(t / 2 + 2))))) return false
    }
    return true
  }
  /** 墙段 a→b 有没有一处贴着这些区域的边（沿墙每 10cm 取一点；墙比洞口边长时只贴一部分也算，多砌的部分埋在楼板里） */
  const alongZone = (a: Vec, b: Vec, zones: Vec[][], tol: number) => {
    const n = Math.max(1, Math.ceil(dist(a, b) / 10))
    for (let i = 0; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }
      if (zones.some((z) => onBoundary(z, p, tol))) return true
    }
    return false
  }
  /** 一段墙（a→b）的绘制属性：法线、墙脚、高度、两面墙纸；key 相同的相邻墙段并成一段画（丁字口不断开，没有接缝） */
  const attrsOf = (a: Vec, b: Vec, kind: WallSegment['kind']) => {
    const outer = kind === 'outer'
    const t = outer ? plan.wallOuter : plan.wall
    const L = dist(a, b)
    const dir = mul({ x: b.x - a.x, y: b.y - a.y }, 1 / L)
    // 法线：外墙指向户外（另一侧探一下是不是户内房间）
    let n = { x: -dir.y, y: dir.x }
    const probe = add(mul(add(a, b), 0.5), mul(n, t / 2 + 5))
    if (plan.rooms.some((r) => isIndoor(r) && pointInPolygon(probe, r.points))) n = mul(n, -1)
    // 墙脚落到两侧较低的地面：阳台、土间一侧不悬空，户外一侧一直落到底座
    const mid = mul(add(a, b), 0.5)
    const sideY = (k: number) => {
      const r = roomAt(plan, add(mid, mul(n, k * (t / 2 + 5))))
      return r ? floorY(r) : outside
    }
    // 上层是挑空的地方，外墙通高到上层的天花；贴着上层楼梯洞口的墙砌到上层地面
    const H =
      outer && opts.tall?.zones.some((z) => pointInPolygon(mid, z) || onBoundary(z, mid, 2))
        ? H0 + opts.tall.extra
        : opts.under && alongZone(a, b, opts.under.zones, t / 2 + 3) && underSlab(a, b, n, t, opts.under.cover)
          ? H0 + opts.under.extra
          : H0
    const bot = Math.min(0, sideY(1), sideY(-1))
    // 墙纸：+z 面（朝 (-dir.y, dir.x)）和 -z 面分别取那一侧房间的墙纸；那间房的这条边单独设了墙纸（Room.walls）就用它
    const n0 = { x: -dir.y, y: dir.x }
    const wp = (k: number) => {
      const r = roomAt(plan, add(mid, mul(n0, k * (t / 2 + 5))))
      if (!r) return null
      const e = r.walls ? edgeNear(r, mid, dir, 1) : -1
      return (e >= 0 ? faceWallpaper(plan, r, e) : roomWallpaper(plan, r)) ?? null
    }
    const papers: [Wallpaper | null, Wallpaper | null] = [wp(1), wp(-1)]
    const k = `${kind}|${n.x.toFixed(3)},${n.y.toFixed(3)}|${bot}|${H}|${JSON.stringify(papers)}`
    return { outer, t, n, H, bottom: bot, papers, k }
  }
  type Run = { a: Vec; b: Vec; kind: WallSegment['kind'] } & ReturnType<typeof attrsOf>
  const segs: Run[] = []
  {
    const lines = new Map<string, { d: Vec; c: number; iv: { lo: number; hi: number; kind: WallSegment['kind'] }[] }>()
    for (const s of raw) {
      const L = dist(s.a, s.b)
      if (L < 0.5) continue
      let d = mul({ x: s.b.x - s.a.x, y: s.b.y - s.a.y }, 1 / L)
      if (d.x < -1e-6 || (Math.abs(d.x) <= 1e-6 && d.y < 0)) d = mul(d, -1)
      const c = Math.round((d.x * s.a.y - d.y * s.a.x) * 2) / 2
      const lk = `${d.x.toFixed(4)},${d.y.toFixed(4)}|${c}`
      let ln = lines.get(lk)
      if (!ln) lines.set(lk, (ln = { d, c, iv: [] }))
      const u = d.x * s.a.x + d.y * s.a.y
      const v = d.x * s.b.x + d.y * s.b.y
      ln.iv.push({ lo: Math.min(u, v), hi: Math.max(u, v), kind: s.kind })
    }
    for (const { d, c, iv } of lines.values()) {
      const pt = (u: number) => ({ x: d.x * u - d.y * c, y: d.y * u + d.x * c })
      const cuts = [...new Set(iv.flatMap((i) => [i.lo, i.hi]))].sort((x, y) => x - y).filter((u, i, a) => i === 0 || u - a[i - 1] > 0.5)
      let prev: Run | null = null
      let prevHi = -Infinity
      for (let i = 1; i < cuts.length; i++) {
        const lo = cuts[i - 1]
        const hi = cuts[i]
        const m = (lo + hi) / 2
        const cover = iv.filter((x) => x.lo <= m && m <= x.hi)
        if (!cover.length) continue
        const kind = cover.some((x) => x.kind === 'inner') ? 'inner' : 'outer'
        const a = pt(lo)
        const b = pt(hi)
        const at = attrsOf(a, b, kind)
        if (prev && prev.k === at.k && Math.abs(prevHi - lo) < 0.5) {
          prev.b = b
          Object.assign(prev, attrsOf(prev.a, b, kind), { a: prev.a, b })
        } else {
          prev = { a, b, kind, ...at }
          segs.push(prev)
        }
        prevHi = hi
      }
    }
  }
  const unit = (s: Run) => mul({ x: s.b.x - s.a.x, y: s.b.y - s.a.y }, 1 / Math.max(1e-6, dist(s.a, s.b)))
  const along = (s: Run, p: Vec) => {
    const d = unit(s)
    return (p.x - s.a.x) * d.x + (p.y - s.a.y) * d.y
  }
  /**
   * 墙段在端点 p 处往外伸多少（负数是缩回）：
   *   - 有共线的墙接着：不伸，两段刚好对接；
   *   - 端点顶在一道穿过去的墙上（丁字口）：缩回到那道墙的墙面（嵌进 0.05），顶面不和它的顶面重叠闪烁，也不会从另一面穿出来；
   *   - 和另一道墙在这里转角（L 形）：厚的（一样厚就取沿 x 的那道）伸满对方半厚、包住转角，
   *     另一道缩回到它的内面（多留 0.05 嵌进去），外角严丝合缝、墙面也不重叠；
   *   - 别的情况（斜交、孤立的端头）照旧伸半个墙厚少 0.1。
   * 外墙的转角只看外墙：内墙接着一道外墙的方向往里走（外轮廓在这里拐弯）时，两道外墙照常包住转角，
   * 内墙缩回到拐过去那道外墙的内皮——不然内墙端头会伸进外墙的转角里（外墙内面缺一块，内墙顶也顶进屋檐底下）。
   */
  const extendAt = (self: Run, p: Vec) => {
    const d = unit(self)
    let touch = segs.filter((o) => o !== self && projectToSegment(p, o.a, o.b).d < 1)
    if (self.outer && touch.some((o) => o.outer)) touch = touch.filter((o) => o.outer)
    const collinear = (o: Run) => Math.abs(d.x * unit(o).y - d.y * unit(o).x) < 1e-3
    const perp = touch.filter((o) => Math.abs(d.x * unit(o).x + d.y * unit(o).y) < 1e-3)
    if (!self.outer && perp.some((o) => o.outer) && touch.some((o) => o.outer && collinear(o))) return -Math.max(...perp.map((o) => o.t)) / 2 + 0.05
    if (touch.some(collinear)) return 0
    if (perp.length && perp.length === touch.length) {
      const through = perp.some((o) => {
        const u = along(o, p)
        return u > 1 && u < dist(o.a, o.b) - 1
      })
      const tp = Math.max(...perp.map((o) => o.t))
      if (through || perp.length > 1) return -tp / 2 + 0.05
      const o = perp[0]
      const mine = self.t > o.t || (self.t === o.t && Math.abs(d.x) > Math.abs(d.y))
      return mine ? o.t / 2 : -o.t / 2 + 0.05
    }
    return self.t / 2 - 0.1
  }
  const railSegs = opts.upper ? voidRailSegments(plan.rooms) : []
  /** 每段墙的合批参数（内收柱 / 梁挂到所在墙段的桶里） */
  const segBucket: { mid: Vec; n: Vec; outer: boolean; bottom: number; H: number }[] = []
  for (const s of segs) {
    const { outer, t, n, H } = s
    isOuter = outer
    const L = dist(s.a, s.b)
    const dir = mul({ x: s.b.x - s.a.x, y: s.b.y - s.a.y }, 1 / L)
    const mid = mul(add(s.a, s.b), 0.5)
    bottom = s.bottom
    const n0 = { x: -dir.y, y: dir.x }
    const faces: [THREE.Material | null, THREE.Material | null] = [s.papers[0] ? wallpaperMaterial(s.papers[0]) : null, s.papers[1] ? wallpaperMaterial(s.papers[1]) : null]
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
      // 拱顶窗 / 圆窗：矩形洞口的角上补回墙
      const sp = info.o.kind === 'window' ? spandrel(info, pr.t, s.a, dir, t, outer, n, faces, H) : null
      if (sp) put(sp)
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
    // 两端按转角 / 丁字口的规则伸出或缩回（extendAt）
    let cur = -extendAt(s, s.a)
    const end = L + extendAt(s, s.b)
    for (const c of cuts) {
      const lo = Math.max(cur, c.lo)
      if (lo > cur) {
        put(wallPiece(at(cur), at(lo), t, bottom, H, outer, true, n, faces))
        stub(at(cur), at(lo), t)
      }
      // 洞口下方的窗台、上方的过梁
      // 落地的洞口（门、落地窗）下方的窗台压到地面下 0.2，顶面不和室内地面共面闪烁
      put(wallPiece(at(lo), at(c.hi), t, bottom, c.y0 <= 0.5 ? -0.2 : Math.min(c.y0, H), outer, c.y0 >= H, n, faces))
      if (H > c.y1) put(wallPiece(at(lo), at(c.hi), t, c.y1, H, outer, true, n, faces))
      cur = Math.max(cur, c.hi)
    }
    if (end > cur) {
      put(wallPiece(at(cur), at(end), t, bottom, H, outer, true, n, faces))
      stub(at(cur), at(end), t)
    }
    segBucket.push({ mid, n, outer, bottom, H })
    bucketPieces(buckets, segIdx++, pieces, mid, n, outer, statics)
    pieces = []
  }
  // 内收柱（梁）：沿墙顶部横着走、从天花往下垂的梁，侧面和底面贴这面墙的墙纸；
  // 挂进所在墙段的合批（让开时一起变透明；压低时按自己的 { y0, h } 缩放，墙压到梁底以下梁就整根藏起来）
  for (const bi of beamsOf(plan)) {
    const si = segs.findIndex((sg) => {
      const u = unit(sg)
      return Math.abs(u.x * bi.dir.y - u.y * bi.dir.x) < 1e-3 && projectToSegment(bi.at, sg.a, sg.b).d < 1
    })
    const sb = segBucket[si]
    if (!sb) continue
    const paper = faceWallpaper(plan, bi.room, bi.edge)
    const side = paper ? wallpaperMaterial(paper) : wallMat(false)
    // 梁身从墙面里 0.5 起（压进墙一点，交接处没有缝），突出 d；顶面贴着天花（墙顶）
    const d0 = bi.t / 2 - 0.5
    const depth = bi.beam.d + 0.5
    const h = Math.min(bi.beam.h, sb.H - sb.bottom - 1)
    const y0 = sb.H - h
    const geo = new THREE.BoxGeometry(bi.beam.w, h, depth)
    const m = boxMesh(geo, [side, side, capMat(), side, side, side])
    const c = add(bi.at, mul(bi.inward, d0 + depth / 2))
    m.position.set(c.x, y0 + h / 2, c.y)
    m.rotation.y = Math.atan2(-bi.dir.y, bi.dir.x)
    m.castShadow = true
    m.receiveShadow = true
    tagFade(m, c, sb.n, sb.outer)
    m.userData.wall = { y0, h }
    bucketPieces(buckets, si, [m], sb.mid, sb.n, sb.outer, statics)
  }
  flushWallBuckets(g, buckets)
  // 墙脚细线、地面下的窗台：从不单独让开，按投影设置各并成一个网格
  for (const cast of [false, true]) {
    const list = statics.filter((m) => m.castShadow === cast)
    if (!list.length) continue
    g.add(mergeMulti(list, new THREE.Matrix4()))
    for (const m of list) m.geometry.dispose()
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

/** 一个洞口的组里分开开合的门扇（推拉的两扇各是一扇，见 doorMotion.ts）：组自己标了是哪扇，或者里面会动的部件标了 */
export function openingLeaves(obj: THREE.Object3D): number[] {
  if (obj.userData.doorLeaf !== undefined) return [obj.userData.doorLeaf as number]
  const s = new Set<number>()
  for (const c of obj.children) if (c.userData.door) s.add((c.userData.doorLeaf as number | undefined) ?? 0)
  return s.size ? [...s].sort((a, b) => a - b) : [0]
}

/**
 * 把一个洞口的门扇 leaf 摆到开合程度 open（0 = 关上，1 = 开到底；几何见 doorMotion.ts）。
 * obj 是 buildOpenings 里带 doorPart 标记的组；房子是静态矩阵时同步矩阵。
 */
export function poseOpening(obj: THREE.Object3D, open: number, leaf = openingLeaves(obj)[0]) {
  const info = obj.userData.info as OpeningInfo
  const part = obj.userData.doorPart as string | undefined
  if (!info || !part) return
  const moved: THREE.Object3D[] = [obj]
  if (part === 'leaf') {
    const s = swingPose(info, open)
    obj.position.set(s.origin.x, 0, s.origin.y)
    obj.rotation.y = Math.atan2(-s.d.y, s.d.x)
  } else if (part === 'slide') {
    const s = slidingPose(info, open, open)
    const c = add(add(info.center, mul(info.dir, s.along[leaf])), mul(info.out, s.off[leaf]))
    obj.position.set(c.x, info.y0, c.y)
  } else if (part === 'barn' || part === 'window') {
    // 谷仓门的门板、落地窗的扇：标成会动的部件（kit.ts movable），和柜门一样摆；推拉落地窗只摆这一扇
    for (const c of obj.children) if (c.userData.door && ((c.userData.doorLeaf as number | undefined) ?? 0) === leaf) poseDoor(c, open)
    return
  } else if (part === 'fold') {
    const segs = foldLeaves(foldPose(info, open))
    for (const leaf of obj.children) {
      const i = leaf.userData.foldLeaf as number | undefined
      if (i === undefined || !segs[i]) continue
      const [p, q] = segs[i]
      // 折扇的局部 x 从 p 指向 q（起点在靠门框的一端）
      leaf.position.set((p.x + q.x) / 2, 0, (p.y + q.y) / 2)
      leaf.rotation.y = Math.atan2(-(q.y - p.y), q.x - p.x)
      moved.push(leaf)
    }
  }
  for (const m of moved) if (!m.matrixAutoUpdate) syncMatrix(m)
}

/** 门扇、推拉门、折叠门、窗 */
function buildOpenings(infos: OpeningInfo[], H: number) {
  const g = new THREE.Group()
  const top = (y: number) => Math.min(y, H - 1)
  for (const info of infos) {
    const { o, center, dir, out, width: w, wall } = info
    const yaw = Math.atan2(-dir.y, dir.x)
    const doorH = top(198)
    if (o.kind === 'door') {
      const leaf = new THREE.Group()
      const isEntrance = info.owner.kind === 'entrance' && wall > 12
      if (!doorStyled(o)) {
        // 旧存档的门扇（数值不能动）
        const color = isEntrance ? LEGACY_ENTRANCE : LEGACY_DOOR
        // 门扇比门洞窄 1（两侧各留 0.5 的缝），关上时看不到大门缝
        leaf.add(rbox(w - 1, doorH - 2, 3.6, color, { x: (w - 1) / 2, y: 1 }, 1.2))
        leaf.add(rbox(3, 3, 7, C.steel, { x: w - 9, y: Math.min(95, doorH * 0.5) }, 1))
      } else {
        // 款式见 three/doorModels.ts；带侧窗时门扇让出锁一侧的侧窗宽度
        const color = doorColor(o, isEntrance)
        const side = hasSidelight(o) ? sidelightWidth(w) : 0
        const lw = w - 1 - side
        const body = doorLeafModel({ style: o.doorStyle, w: lw, h: doorH - 2, t: 3.6, color, handle: doorHandleOf(o), handleColor: handleColor(o), handleSide: 1, glass: o.doorGlass })
        body.position.set(lw / 2, 1, 0)
        leaf.add(body)
        if (side || hasTransom(o)) {
          // 侧窗 / 亮子：固定在墙洞里（局部 x 沿墙，同窗）
          const lites = new THREE.Group()
          const sx = o.hinge === 'start' ? 1 : -1
          if (side) lites.add(liteModel(sx > 0 ? w / 2 - side : -w / 2, sx > 0 ? w / 2 : -w / 2 + side, 0, doorH, 4, color, o.doorGlass))
          const yt = top(info.y1)
          if (hasTransom(o) && yt - 200 >= 8) lites.add(liteModel(-w / 2, w / 2, 200, yt, 4, color, o.doorGlass))
          lites.position.set(center.x, 0, center.y)
          lites.rotation.y = yaw
          lites.userData.info = info
          g.add(lites)
        }
      }
      leaf.userData.info = info
      leaf.userData.doorPart = 'leaf'
      g.add(leaf)
    } else if (o.kind === 'sliding') {
      // 引き戸：两扇错开、各自推拉，没动过时起点一侧那扇推开（朝阳台的落地推拉窗在下面窗的分支里）
      const t = Math.max(2, wall / 4)
      if (o.doorStyle === 'barn') {
        // 谷仓门：一整扇挂在墙面上（开向一侧）的明装轨道上，沿轨道推开
        const s = barnPose(info, 0)
        const pt = 3.6
        const barn = new THREE.Group()
        const panel = new THREE.Group()
        panel.add(doorLeafModel({ style: 'barn', w: s.pw, h: doorH + 3, t: pt, color: doorColor(o, false), handle: doorHandleOf(o), handleColor: handleColor(o), handleSide: -1 }))
        // 轨道（盖住关上和推开到底两个位置）+ 两个吊轮（跟着门板走）
        const rail = '#2f3134'
        barn.add(rbox(w * 2 + 8, 3, 2, rail, { x: w / 2, y: doorH + 6, z: 0 }, 0.6))
        for (const k of [-1, 1]) panel.add(rbox(3, 10, 1.2, rail, { x: (k * s.pw) / 3, y: doorH - 2, z: pt / 2 + 0.6 }, 0.5))
        // 门板建在关着的位置，开到底推开一个门宽
        barn.add(movable(panel, { kind: 'slide', dx: barnPose(info, 1).slide }))
        const c = add(center, mul(s.face, s.off))
        barn.position.set(c.x, info.y0, c.y)
        barn.rotation.y = yaw
        barn.userData.info = info
        barn.userData.doorPart = 'barn'
        g.add(barn)
        continue
      }
      const styled = doorStyled(o)
      for (const k of [0, 1]) {
        const pw = w / 2 + 2
        const panel = new THREE.Group()
        const h = doorH
        if (!styled) {
          panel.add(rbox(pw, h, t, LEGACY_SLIDING, {}, 0.8))
          panel.add(rbox(pw - 10, h - 20, t + 0.4, '#fffaf0', { y: 10 }, 0.5))
        } else if (!o.doorStyle) {
          // 只改了颜色 / 把手：旧的样子（外框 + 浅一点的内框）换色
          const color = doorColor(o, false)
          panel.add(rbox(pw, h, t, color, {}, 0.8))
          panel.add(rbox(pw - 10, h - 20, t + 0.4, shade(color, 0.08), { y: 10 }, 0.5))
        } else {
          // 把手在两扇各自的外端（推开时手扶的那头）
          panel.add(doorLeafModel({ style: o.doorStyle, w: pw, h, t, color: doorColor(o, false), handle: doorHandleOf(o), handleColor: handleColor(o), handleSide: k === 0 ? -1 : 1, glass: o.doorGlass }))
        }
        panel.rotation.y = yaw
        panel.userData.info = info
        panel.userData.doorPart = 'slide'
        panel.userData.doorLeaf = k
        g.add(panel)
      }
    } else if (o.kind === 'folding') {
      // 折门的各扇放进同一个组（同一个洞口），每扇各自合并、各自转（顺序同 doorMotion.ts foldLeaves）
      const fold = new THREE.Group()
      fold.userData.info = info
      fold.userData.doorPart = 'fold'
      g.add(fold)
      const styled = doorStyled(o)
      const n = foldCount(o)
      const L = w / n - 0.5
      // 每串几扇：四折是两串两折
      const per = n === 4 ? 2 : n
      for (let i = 0; i < n; i++) {
        const leaf = new THREE.Group()
        const j = i % per
        // 拉手：两折 / 四折在每串第二扇的起点（折角处 = -x 端），三折在末扇的外端（+x 端）
        const handleSide = per === 3 ? (j === 2 ? 1 : 0) : j === 1 ? -1 : 0
        if (!styled) leaf.add(rbox(L, doorH, 2.4, LEGACY_SLIDING, { y: 0 }, 0.8))
        else leaf.add(doorLeafModel({ style: o.doorStyle, w: L, h: doorH, t: 2.4, color: doorColor(o, false), handle: doorHandleOf(o), handleColor: handleColor(o), handleSide, glass: o.doorGlass }))
        mergeMeshes(leaf)
        leaf.userData.foldLeaf = i
        fold.add(leaf)
      }
    } else {
      // 窗：款式见 three/windows.ts（不填款式 = 旧的腰窗白框 + 半透明玻璃 / 朝阳台的落地推拉窗）
      if (info.y0 >= H) continue
      const style = windowModelStyle(info)
      // 旧的落地推拉窗按 200 高截到天花（同以前），其余窗顶碰到天花时不画上框
      const h = top(info.y1) - info.y0
      if (h < 4) continue
      const n0 = { x: -dir.y, y: dir.x }
      const frame = windowModel({
        style,
        w,
        h,
        wall,
        frame: frameColor(o),
        grid: gridAllowed(o.windowStyle) ? o.grid : undefined,
        shutters: o.shutters && info.outer ? shutterColor(o) : undefined,
        out: out.x * n0.x + out.y * n0.y >= 0 ? 1 : -1,
        hinge: o.hinge,
        clipped: top(info.y1) !== info.y1,
        movable: info.sash,
      })
      frame.position.set(center.x, info.y0, center.y)
      // 通往阳台的落地窗当门用：推拉 / 平开的扇能开合（openers.ts），开不了的款式（固定窗）只挡人
      if (info.sash) frame.userData.doorPart = 'window'
      frame.rotation.y = yaw
      frame.userData.info = info
      g.add(frame)
    }
  }
  for (const c of g.children) {
    const info = c.userData.info as OpeningInfo
    if (c.userData.doorPart) for (const k of openingLeaves(c)) poseOpening(c, defaultDoorOpen(info.o, k), k)
    if (info) tagFade(c, info.center, info.out, info.outer)
    // 每个洞口的组（门扇 / 推拉扇 / 窗框）内部按材质合并：窗框 4~5 根白条并成一个，门扇和把手各一个；
    // 玻璃是半透明的，留在组外不合并。业务标记（info、fade）都在组上，让开时整组一起淡出
    mergeMeshes(c)
  }
  return g
}

// ---------- 墙上的设备：灯开关、可视对讲、热水器遥控面板、门铃（位置见 wallDevices.ts） ----------

const DEVICE_MODELS: Record<WallDeviceKind, () => THREE.Group> = {
  switch: switchPlate,
  intercom: intercomMonitor,
  'heater-remote': bathRemote,
  'bath-remote': bathRemote,
  doorbell,
}

/**
 * 自动摆的墙上设备（已经接管成家具的不画）。设备跟着所在的墙一起透明 / 压低。
 * 能接管的（灯开关、对讲、遥控面板）标上 wallDevice：沙盘里点中它就接管成挂墙家具。
 */
function buildWallDevices(plan: Plan, infos: OpeningInfo[], H: number) {
  const g = new THREE.Group()
  for (const s of wallDeviceSpots(plan, infos)) {
    if (s.y + 2 > H) continue
    const { info, side } = s
    const obj = DEVICE_MODELS[s.kind]()
    const p = add2(add2(info.center, mul(info.dir, s.along)), mul(side, info.wall / 2 + 0.3))
    obj.position.set(p.x, s.y, p.y)
    obj.rotation.y = Math.atan2(side.x, side.y)
    mergeMeshes(obj)
    addOutlines(obj)
    if (DEVICE_ASSET[s.kind]) obj.userData.wallDevice = s.kind
    // 外墙上的东西（户外的门铃也好、室内的开关也好）跟着那面墙走：用墙的外法线判断；内墙只看朝向不分正反
    tagFade(obj, p, info.outer ? info.out : mul(side, -1), info.outer)
    g.add(obj)
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

/** 卷纸架的安装高度（离地） */
export const PAPER_HOLDER_Y = 70

/**
 * 马桶旁边的卷纸架：找马桶左右两侧较近的那面墙，装在离地 70、比马桶中心靠前 15 的位置（坐着伸手够得着）。
 * 两侧都没有 70cm 以内的墙就不装。返回墙面上的安装点（p）、朝墙的方向（side）和半个墙厚。
 */
export function paperHolderSpot(plan: Plan, f: Fixture): { p: Vec; side: Vec; half: number } | null {
  const room = roomAt(plan, f)
  if (!room) return null
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
  if (!best) return null
  return { p: add2(add2(f, mul(best.side, best.t - 0.2)), mul(front, 15)), side: best.side, half: best.half }
}

function buildPaperHolders(plan: Plan) {
  const g = new THREE.Group()
  for (const f of plan.fixtures) {
    if (f.kind !== 'toilet') continue
    const best = paperHolderSpot(plan, f)
    if (!best) continue
    const p = best.p
    const obj = paperHolder((f.toiletType ?? 'washlet') !== 'basic')
    obj.position.set(p.x, PAPER_HOLDER_Y, p.y)
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
    // 写实光照按布料画（褶皱、织纹，mats.ts）
    tagMat(obj, 'fabric')
    g.add(obj)
  }
  return g
}

const trimCache = new Map<string, THREE.Material>()
/**
 * 边饰材质：比墙纸往镜头多拉一点（pullDepth）。偏移只和距离成正比、和表面倾斜无关，所有拉近的面之间前后关系不变，
 * 只凸出 0.8cm 的腰壁始终压在墙纸上；以前用 polygonOffset（-3 / -6）时偏移随倾斜放大，掠射角下顶角线、踢脚线
 * 会穿过外墙、屋面露出来。
 */
function trimMat(color: string) {
  let m = trimCache.get(color)
  if (!m) {
    const src = toon(color)
    m = src.clone()
    m.onBeforeCompile = src.onBeforeCompile
    m.customProgramCacheKey = src.customProgramCacheKey
    pullDepth(m, TRIM_PULL)
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
  const solid = segs.filter((s) => s.kind !== 'open')
  /**
   * 饰条按「所在墙段 + 饰条类型（y0 / h / 厚度）」分组：让开 / 压低的标记（wall、fade）设在组上，组内的饰条合并成一个网格。
   * 让开的判断点用墙段中点，和墙体（buildWalls 的 mergeSegment）完全一致，墙压低时腰壁同步压低。
   */
  const groups = new Map<string, THREE.Group>()
  const bucket = (p: Vec, kind: string, y0: number, h: number, out: Vec, outer: boolean, fallback: Vec) => {
    const si = solid.findIndex((sg) => projectToSegment(p, sg.a, sg.b).d < 1)
    // 同一道墙两侧的房间各有自己的饰条：按朝向分开
    const key = `${si < 0 ? `${fallback.x},${fallback.y}` : si}|${out.x.toFixed(3)},${out.y.toFixed(3)}|${kind}`
    let gg = groups.get(key)
    if (!gg) {
      gg = new THREE.Group()
      gg.position.y = y0 + h / 2
      gg.userData.wall = { y0, h }
      tagFade(gg, si < 0 ? fallback : mul(add(solid[si].a, solid[si].b), 0.5), out, outer)
      groups.set(key, gg)
      g.add(gg)
    }
    return gg
  }
  for (const room of plan.rooms) {
    if (!isIndoor(room)) continue
    // 边饰按每面墙的墙纸取（单面墙可以有自己的墙纸 / 边饰，见 wallFace.ts）
    const trims: (WallTrim | undefined)[] = room.points.map((_, i) => faceWallpaper(plan, room, i)?.trim)
    if (!trims.some(Boolean)) continue
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
      const tr = trims[i]
      if (!tr) return
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
          // 组的原点在饰条的竖直中心（压低时按它缩放），饰条在组里 y = 0
          m.position.set(c.x, 0, c.y)
          m.rotation.y = Math.atan2(-e.dir.y, e.dir.x)
          m.receiveShadow = true
          // 让开 / 压低的判断用墙体中线上的点（所在墙段的中点）：用边饰自己的中心（偏到墙面外侧几厘米）判断，
          // 视角在阈值附近时会和墙体本身判得不一样——墙压低了、腰壁还立着，转视角时来回闪
          const on = add(e.a, mul(e.dir, (a + b) / 2))
          bucket(on, `s${y0},${h},${th}`, y0, h, e.out, outer, on).add(m)
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
            m.position.set(c.x, 0, c.y)
            m.rotation.y = Math.atan2(-e.dir.y, e.dir.x)
            const on = add(e.a, mul(e.dir, u))
            bucket(on, `b${w.h}`, 0, w.h - 3, e.out, outer, on).add(m)
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
  // 组上有业务标记，mergeMeshes(g) 会整组跳过：逐组合并
  for (const c of g.children) mergeMeshes(c)
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
    // 3D 里点淋浴也选中这个浴缸（附件：选中框只框浴缸本体）
    obj.userData.fixtureId = f.id
    obj.userData.fixtureExtra = true
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
      cur.userData.fixtureId = f.id
      cur.userData.fixtureExtra = true
      g.add(cur)
    }
  }
  return g
}

/** rise：楼梯的层间高（不给按墙高 + 楼板厚） */
/** stall：淋浴房哪几边贴墙（贴墙的边不装玻璃，见 bathroom.ts stallWalls） */
export function fixtureModel(f: Fixture, wallH: number, rise?: number, walls?: WallLine[], stall?: StallWalls) {
  const m = fixtureShape(f, wallH, rise, walls, stall)
  // 材质类别（写实光照用，mats.ts）：模型里标了的零件照标的，其余按固定颜色表 / 设备的默认材质
  if (m) {
    resolveMats(m, { mat: FIXTURE_MAT[f.kind] }, [])
    // 台面、水槽、拉手这些金属零件：赛璐璐下也画成金属（anime.ts）
    markMetalParts(m)
  }
  return m
}

/** 设备的默认材质：卫浴是陶瓷 / 釉面，厨房柜门、外机、防水盘是半光的塑料 / 烤漆，楼梯、收纳位、管道井是涂装 */
const FIXTURE_MAT: Record<Fixture['kind'], Mat> = {
  kitchen: 'plastic',
  bathtub: 'ceramic',
  toilet: 'ceramic',
  basin: 'ceramic',
  washer: 'plastic',
  fridge: 'plastic',
  outdoor: 'plastic',
  ps: 'paint',
  builtin: 'paint',
  stairs: 'paint',
}

function fixtureShape(f: Fixture, wallH: number, rise?: number, walls?: WallLine[], stall?: StallWalls) {
  const d = fixtureDepth(f)
  switch (f.kind) {
    case 'kitchen':
      return kitchenModel(f.w, f.variant === 'facing', f.burners, { island: f.island, dishwasher: f.dishwasher, induction: f.induction })
    case 'bathtub':
      return bathtubModel(f.w, d, !!f.shower, stall)
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
      return psModel(f.w, d, wallH)
    case 'builtin':
      return storageSpotModel(f.w, d, !!f.recessed, Math.min(wallH - 1, NICHE_H))
    case 'stairs':
      return stairsModel(f, rise ?? wallH + SLAB, walls)
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
  /**
   * 上一层楼板上的楼梯洞口：贴着洞口的墙（内墙、外墙都算）往上再砌 extra（= 楼板厚），一直接到上层地面，
   * 楼梯间里一楼和二楼的墙面连成一片，不在楼板的位置露出一道截面
   */
  under?: { zones: Vec[][]; extra: number; cover: Vec[] | null }
  /** 楼梯的层间高 */
  rise?: number
  /** 外墙外侧的材质（户建，three/exterior.ts facadeMaterial） */
  facade?: THREE.Material
  /** 不搭展示底座（户建由用地的地面代替） */
  noBase?: boolean
}

/** 给 buildHouse 的各部分打标记（userData.part）：3D 设计图（blueprint.ts）按它分主次线、略去窗帘边饰 */
const part = <T extends THREE.Object3D>(o: T, k: string) => ((o.userData.part = k), o)

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
    const tone = roomFlooring(plan, r)?.tone ?? 'natural'
    const slab = opts.upper ? floorSlab(r, tone, isIndoor(r) ? -2 : -SLAB, holes) : floorSlab(r, tone)
    if (slab) floors.add(slab)
    if (r.kind === 'japanese') floors.add(tatami(r, plan.wall))
  }
  if (opts.upper && opts.outline) {
    // 四周被房间围住的挑空：结构楼板上挖掉（墙坐在楼板上，洞口比挑空每边小半个外墙厚）
    const inner = plan.rooms.filter((r) => r.kind === 'void').map((r) => offsetPolygon(r.points, -plan.wallOuter / 2))
    floors.add(structureSlab(opts.outline, [...(opts.stairHoles ?? []).map((h) => h.poly), ...inner], plan.wallOuter))
  }
  mergeMeshes(floors)
  root.add(part(floors, 'floor'))

  const infos = openingInfos(plan)
  const walls = buildWalls(plan, wallH, infos, opts)
  root.add(part(walls, 'wall'))
  const ops = buildOpenings(infos, wallH)
  addOutlines(ops)
  root.add(part(ops, 'opening'))
  const rails = balconyRails(plan, wallH)
  root.add(part(rails, 'rail'))
  root.add(part(buildShowers(plan), 'fixture'))
  root.add(part(buildWallDevices(plan, infos, wallH), 'detail'))
  root.add(part(buildPaperHolders(plan), 'detail'))
  root.add(part(buildCurtains(plan, infos, wallH), 'curtain'))
  root.add(part(buildTrims(plan, infos, wallH), 'trim'))

  // 实墙段：楼梯洞口栏杆（贴着墙的边不装）、楼梯扶手（贴墙的一侧装靠墙扶手）
  //（带门洞：楼梯扶手在门口断开）
  const ws: WallLine[] = stairWalls(plan)
  if (opts.stairHoles?.length) {
    const rails = new THREE.Group()
    // 开在挑空里的洞口（复式的客厅楼梯）四周没有楼板，不装栏杆（挑空边的栏杆管）
    const voids = plan.rooms.filter((r) => r.kind === 'void')
    for (const h of opts.stairHoles) if (!voids.some((v) => pointInPolygon(centroid(h.poly), v.points))) rails.add(holeRails(h.poly, h.arrival, ws))
    mergeMeshes(rails)
    addOutlines(rails)
    root.add(part(rails, 'rail'))
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
      g.userData.voidRails = true
      root.add(part(g, 'rail'))
    }
  }

  const fx = new THREE.Group()
  for (const f of plan.fixtures) {
    const m = fixtureModel(f, wallH, opts.rise, f.kind === 'stairs' ? ws : undefined, f.kind === 'bathtub' && f.shower ? stallWalls(plan, f) : undefined)
    mergeMeshes(m)
    addOutlines(m)
    placeOnFloor(m, plan, f.x, f.y, f.rot)
    // 翻转的厨房：整个模型沿局部 x 镜像（水槽、灶、吊柜、抽油烟机一起对调）。three 按世界矩阵的行列式自动翻转正反面，描边壳照常
    if (f.kind === 'kitchen' && f.flip) m.scale.x = -1
    // 3D 里点选设备用（fixturePick.ts）；漫游时准星显示设备种类
    m.userData.fixtureId = f.id
    fx.add(m)
  }
  if (!opts.upper && !opts.noBase) {
    addOutlines(base)
    addOutlines(top)
  }
  root.add(part(fx, 'fixture'))
  // 玻璃、纱帘等半透明件先用 rbox 建（默认投影）再换材质：统一关掉投影，阳光能透过窗户
  noTransparentShadows(root)
  return root
}

// ---------- 家具模板缓存 ----------
//
// 同一件素材（同配色、同单件改色、同花纹）建一次「关着门、已合并、已描边、已冻结矩阵」的模板，之后每件家具 clone(true)：
// 几何体、材质共用，只复制对象树。生成户型、一键布置、切风格时同一种椅子、书、杯子成套出现，省掉重复的 build + 合并。
//   - 模板自己合并出来的几何体标成 shared：实例被 disposeUnshared 时不会释放（别的实例、模板还在用）；
//   - 按模板做引用计数：模板被挤出 LRU 且没有实例在用时，才释放它的几何体；
//   - 绿植贴墙弯折（bendToWalls）先 clone 几何再改，原几何（模板的）不动，可以照常走缓存；
//   - 柜门开合在实例上摆（poseDoors 记的 doorBase 在实例上），模板永远是关着的。

interface FurnitureTemplate {
  root: THREE.Object3D
  /** 模板自己新建的几何体（合并出来的、素材包里不缓存的）：模板释放时一起 dispose */
  own: THREE.BufferGeometry[]
  refs: number
  /** 已经不在缓存里：最后一个实例释放时 dispose */
  evicted: boolean
}
// 一整套户建的家具约 150 种不同的键：上限小于它时，按顺序重建整屋会把 LRU 刷穿（每件都未命中）
let templateLimit = 256
const templates = new Map<string, FurnitureTemplate>()
const templateStats = { hits: 0, misses: 0 }

/** 模板缓存上限（件数）；0 = 不缓存（每次都重新建） */
export function setFurnitureTemplateLimit(n: number) {
  templateLimit = Math.max(0, Math.floor(n))
  trimTemplates()
}
/** 调试 / 测试用：缓存件数、命中、未命中 */
export function furnitureTemplateInfo() {
  return { size: templates.size, limit: templateLimit, ...templateStats }
}
/** 清空模板缓存（没有实例在用的立即释放） */
export function clearFurnitureTemplates() {
  for (const t of templates.values()) evictTemplate(t)
  templates.clear()
}
function evictTemplate(t: FurnitureTemplate) {
  t.evicted = true
  if (!t.refs) for (const g of t.own) g.dispose()
}
function trimTemplates() {
  while (templates.size > templateLimit) {
    const [k, t] = templates.entries().next().value as [string, FurnitureTemplate]
    templates.delete(k)
    evictTemplate(t)
  }
}

/**
 * 家具纯色材质并成单一顶点色材质（toon.ts mergeSolidColors）的开关：
 *   false 全关；true 全开（灯具除外）；函数 = 按素材白名单逐步打开（同样排除灯具）。
 * 灯具排除：没有发光部件的灯（蜡烛类）要挑「上部最浅色的部件」当灯罩（lights.ts prepareLamp），并成一个网格就挑不出来了。
 * 改了开关会清空模板缓存（已经摆着的家具要重建才生效）。
 */
let vcMerge: boolean | ((def: AssetDef) => boolean) = true
export function setVertexColorMerge(v: boolean | ((def: AssetDef) => boolean)) {
  vcMerge = v
  clearFurnitureTemplates()
}
export const vertexColorMergeFor = (def: AssetDef) => !hasTag(def, 'light') && (typeof vcMerge === 'function' ? vcMerge(def) : vcMerge)

/** 模板的缓存键：素材 | 配色 | 单件改色 | 花纹 | 画面 | 屏幕画面（开合不在内） */
export function furnitureTemplateKey(fu: Pick<Furniture, 'asset' | 'color' | 'colors' | 'patterns' | 'art' | 'screen'>) {
  return `${fu.asset}|${fu.color ?? 0}|${fu.colors?.join(',') ?? ''}|${fu.patterns ? JSON.stringify(fu.patterns) : ''}|${fu.art ?? ''}|${fu.screen ?? ''}`
}

function buildTemplate(def: AssetDef, fu: Furniture, closeUp: boolean): FurnitureTemplate {
  const pal = effectivePalette(def, fu.color ?? 0, fu.colors)
  // 装饰画的画面（artwork.ts）：build 里的 artFace 读这个上下文
  const m = withArt(fu.art, () => def.build(pal))
  // 屏幕画面一层层的发光小片烘成一张贴图（screens.ts）：写实光照、描边下不露出厚度
  bakeScreens(m, fu.screen ? SCREEN_PRESET_MAP.get(fu.screen) : undefined)
  // 每个零件的材质类别（写实光照用，mats.ts）：要在合并之前写，合并按它分组、写成逐顶点属性
  resolveMats(m, def, pal)
  // 地毯、地垫：色块交界和外框长一圈软毛刺（fringe.ts），要在合并之前
  addPileFringe(m, def)
  // 半透明零件（玻璃、水面）不投影
  noTransparentShadows(m)
  // 零件按材质合并，draw call 少一个数量级（描边、花纹、弯曲都在合并后的网格上照常工作）
  mergeMeshes(m)
  // 沙盘里远看：太小的零件不投影、不描边（省 draw call）；素材库的近景预览全都保留
  if (!closeUp) noTinyShadows(m)
  addOutlines(m, closeUp ? {} : { minSize: TINY_OUTLINE })
  applyPatterns(m, pal, fu.patterns)
  // 剩下的纯色 toon 零件并成一个顶点色网格 + 一个顶点色描边（花纹、发光、半透明的保持独立）
  if (vertexColorMergeFor(def)) mergeSolidColors(m)
  // 没并进去的金属零件（柜门子树里的拉手、不合并的素材）：赛璐璐下也画成金属
  markMetalParts(m)
  // 模型内部的零件不再动（开合只改柜门子树，poseDoors 会同步矩阵）：矩阵算一次就固定
  freezeMatrices(m)
  const own = new Set<THREE.BufferGeometry>()
  m.traverse((o) => {
    const g = (o as THREE.Mesh).geometry
    if (!(o as THREE.Mesh).isMesh || !g || g.userData.shared) return
    g.userData.shared = true
    own.add(g)
  })
  return { root: m, own: [...own], refs: 0, evicted: false }
}

/** 从模板复制一份对象树（几何、材质共用）。clone 不复制 raycast：描边外壳要重新设成不可拾取 */
function instantiate(t: FurnitureTemplate) {
  const m = t.root.clone(true)
  m.traverse((o) => {
    if (o.userData.isOutline) o.raycast = () => {}
  })
  return m
}

/**
 * 家具模型（关着门的模板的一份实例，再按 fu.open 摆门）。
 * closeUp：素材库的近景预览——小零件也投影、描边（沙盘里为了 draw call 略去），走另一套模板。
 */
export function furnitureModel(fu: Furniture, opts: { closeUp?: boolean } = {}) {
  const def = ASSET_MAP.get(fu.asset)
  const g = new THREE.Group()
  if (!def) return g
  const closeUp = !!opts.closeUp
  const key = (closeUp ? 'near|' : '') + furnitureTemplateKey(fu)
  let t = templates.get(key)
  if (t) {
    // LRU：用到的挪到最后
    templates.delete(key)
    templates.set(key, t)
    templateStats.hits++
  } else {
    t = buildTemplate(def, fu, closeUp)
    templateStats.misses++
    if (templateLimit > 0) {
      templates.set(key, t)
      trimTemplates()
    } else t.evicted = true
  }
  const m = instantiate(t)
  t.refs++
  const tpl = t
  // 实例被丢弃（disposeUnshared）时归还引用
  disposeHooks.set(g, () => {
    tpl.refs--
    if (tpl.evicted && !tpl.refs) for (const geo of tpl.own) geo.dispose()
  })
  // 可开合的柜子：柜门 / 抽屉按 open 摆好（模板本身是关着的）
  if (def.openable) poseDoors(m, !!fu.open)
  g.add(m)
  g.userData.furnitureId = fu.id
  g.userData.asset = fu.asset
  return g
}

/** 包围盒对角线小于这个值（cm）的网格不投影：螺丝、按钮这类的影子只有几个像素，却各占一次阴影 draw call（阴影贴图只在场景变了时重画，鹿角、把手这种细件留着） */
const TINY_CASTER = 5
/** 包围球直径小于这个值（cm）的零件不描边（合并后还单独剩下的小零件：把手、按钮、小摆件里的细节） */
const TINY_OUTLINE = 10
function noTinyShadows(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.castShadow) return
    // 用包围球（合并出来的几何体已经算好，缓存的体素几何体只算一次）：直径 ≈ 包围盒对角线
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
    if (m.geometry.boundingSphere!.radius * 2 * m.matrixWorld.getMaxScaleOnAxis() < TINY_CASTER) m.castShadow = false
  })
}

/** 吸顶灯 / 吊灯素材的模型按 CEILING 做：摆进某层时整体抬高这么多，贴到这层的天花板下 */
export const ceilingLift = (plan: Plan, floor: string) => floorHeight(plan, floor) - CEILING

/**
 * 摆家具（世界坐标）。多层户型按家具的 floor 找那一层的房间定地面高度，再加上楼层的 elevation；
 * plan 传整份户型或那一层的子户型都行。吸顶灯素材再抬到所在楼层的天花板下（ceilingLift）。
 */
export function placeFurniture(obj: THREE.Object3D, plan: Plan, fu: Pick<Furniture, 'x' | 'y' | 'rot' | 'z' | 'floor'> & Partial<Pick<Furniture, 'asset' | 'spin'>>) {
  if (isMultiFloor(plan)) {
    const room = roomAt(plan, { x: fu.x, y: fu.y }, fu.floor ?? null)
    const elev = floorElevation(plan, floorOf(plan, fu))
    obj.position.set(fu.x, elev + (elev === 0 ? groundAt(plan, fu, room) : floorY(room)) + (fu.z ?? 0), fu.y)
    obj.rotation.y = (-fu.rot * Math.PI) / 180
  } else {
    placeOnFloor(obj, plan, fu.x, fu.y, fu.rot)
    obj.position.y += fu.z ?? 0
  }
  if (fu.asset && ASSET_MAP.get(fu.asset)?.ceiling) obj.position.y += ceilingLift(plan, floorOf(plan, fu))
  applySpin(obj, fu)
  // 沙盘里家具的根节点是静态矩阵（见 matrices.ts）：挪动后手动更新
  if (!obj.matrixAutoUpdate) syncMatrix(obj)
}

/**
 * 贴附物在贴着的面里转 spin 度：绕自己的厚度方向（局部 z）、以正中为轴转（模型原点在底边中点，转完把中心挪回原处）。
 * 欧拉角按 YXZ：先在局部转 spin，再按朝向转。
 */
function applySpin(obj: THREE.Object3D, fu: Partial<Pick<Furniture, 'asset' | 'spin'>>) {
  const d = fu.asset ? ASSET_MAP.get(fu.asset) : undefined
  if (!d?.stick) return
  const th = fu.spin ? (-fu.spin * Math.PI) / 180 : 0
  obj.rotation.order = 'YXZ'
  obj.rotation.z = th
  if (!th) return
  const h = d.h / 2
  const dx = h * Math.sin(th)
  const ry = obj.rotation.y
  obj.position.x += dx * Math.cos(ry)
  obj.position.y += h * (1 - Math.cos(th))
  obj.position.z -= dx * Math.sin(ry)
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
