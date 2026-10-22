// 自由调整宽 / 深：柜子、架子、衣架、桌子这些按尺寸卖、尺寸又各不相同的家具，可以把占地的宽（x）和深（z）改成任意整数 cm。
//
// 改过尺寸的家具仍然只是一个素材 id：`原素材 id@宽x深`（如 cb-closet-hinged-120@135x58）。ASSET_MAP 遇到这种 id 时
// 现场派生一份 AssetDef（占地、可摆放层、模型都按新尺寸），所以碰撞、摆放、存档、分享、模板缓存全都不用改。
//
// 派生的模型有两种做法：
//   1. 素材自己声明 resize(w, d)（packs/cabinets.ts 的收纳位柜子）：按新尺寸重新搭，门扇数、抽屉列数跟着宽度变；
//   2. 其余的「分区拉伸」：离左右 / 前后边缘 EDGE 以内的部分整体平移（侧板、圆角、桌腿不变形），中间那段线性拉伸；
//      某个方向上很窄的零件（拉手、桌腿、立柱、书脊）在这个方向上整块平移不拉伸；标了 userData.rigid 的子树
//      （挂着的衣服）整块平移。会动的部件（柜门、抽屉）的转轴也跟着边缘走，推拉门的行程按拉伸比例缩放。

import * as THREE from 'three'
import type { AssetDef, Poly, SurfaceDef } from './kit'
import { hasTag, type Tag } from './tags'

const SEP = '@'
/** 边缘不变形的宽度（cm） */
const EDGE = 6
/** 某方向上比这窄的零件在这个方向上整块平移 */
const RIGID = 12

/** 能调宽深的：柜、架、衣架、桌 */
const RESIZABLE: Tag[] = [
  'bookshelf', 'record-shelf', 'shelving', 'display-cabinet', 'curio-cabinet', 'wardrobe', 'dresser', 'clothes-rail', 'coat-rack',
  'storage-cabinet', 'cabinet', 'shoe-storage', 'pantry', 'washer-rack', 'open-rack', 'tv-stand', 'garment-rail', 'kimono-rack',
  'nightstand', 'desk', 'workbench', 'table', 'dining-table', 'coffee-table', 'low-table', 'laundry-stand', 'towel-rail',
]
/** 带这些标签的即使也是柜 / 桌（上床下桌、猫爬架、鱼缸柜…）也不调 */
const FIXED: Tag[] = ['bed', 'loft', 'kid-bed', 'crib', 'sofa', 'light', 'aquarium', 'piano', 'cat-tower', 'set-piece']

export interface SizeRange {
  w: [number, number]
  d: [number, number]
}

/** 这件素材能调的宽深范围；不能调返回 null。传原素材（派生的会先找回原素材） */
export function resizeRange(def: AssetDef | undefined): SizeRange | null {
  if (!def || def.prop || def.stick || def.fixture || def.actor || def.ceiling) return null
  if (!def.resize && (!hasTag(def, ...RESIZABLE) || hasTag(def, ...FIXED))) return null
  const r = (v: number, lo: number, hi: number, min: number, max: number): [number, number] => [Math.max(min, Math.round(v * lo)), Math.min(max, Math.round(v * hi))]
  return { w: r(def.w, 0.4, 2.5, 15, 400), d: r(def.d, 0.5, 2, 10, 200) }
}

/** 派生 id 拆成原素材 id 和尺寸；不是派生 id 返回 null */
export function parseResized(id: string): { base: string; w: number; d: number } | null {
  const i = id.lastIndexOf(SEP)
  if (i <= 0) return null
  const m = /^(\d+)x(\d+)$/.exec(id.slice(i + 1))
  return m ? { base: id.slice(0, i), w: +m[1], d: +m[2] } : null
}

/** 原素材 id（不是派生的就是它自己） */
export const baseAssetId = (id: string) => parseResized(id)?.base ?? id

/** 原素材按 (w, d) 派生出的 id：取整、夹到可调范围里；和原尺寸一样就是原 id */
export function resizedId(base: AssetDef, w: number, d: number) {
  const r = resizeRange(base)
  if (!r) return base.id
  const cw = clamp(Math.round(w), r.w)
  const cd = clamp(Math.round(d), r.d)
  return cw === Math.round(base.w) && cd === Math.round(base.d) ? base.id : `${base.id}${SEP}${cw}x${cd}`
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

const derived = new Map<string, AssetDef | null>()

/**
 * 派生 id 对应的素材（缓存）；id 不合法、原素材不能调返回 undefined。
 * 读的时候不再按可调范围卡（素材尺寸校正后范围会变，存档里已经调好的家具不能因此丢掉），只拦明显不对的数
 */
export function deriveResized(id: string, lookup: (id: string) => AssetDef | undefined): AssetDef | undefined {
  let d = derived.get(id)
  if (d === undefined) {
    d = null
    const p = parseResized(id)
    const base = p && lookup(p.base)
    const r = base && resizeRange(base)
    if (p && base && r && p.w >= 5 && p.d >= 5 && p.w <= 1000 && p.d <= 1000) d = makeResized(base, id, p.w, p.d)
    derived.set(id, d)
  }
  return d ?? undefined
}

function makeResized(base: AssetDef, id: string, w: number, d: number): AssetDef {
  const out: AssetDef = { ...base, id, w, d, sizeLabel: `${w}×${d}` }
  delete out.resize
  if (base.resize) return { ...out, ...base.resize(w, d) }
  const mx = axisMap(base.w, w)
  const mz = axisMap(base.d, d)
  const poly = (ps: Poly[]) => ps.map((p) => p.map(([x, z]) => [mx.at(x), mz.at(z)] as [number, number]))
  if (base.surfaceShape) out.surfaceShape = poly(base.surfaceShape)
  if (base.surfaces)
    out.surfaces = base.surfaces.map((s): SurfaceDef => ({
      ...s,
      ...(s.shape ? { shape: poly(s.shape) } : {}),
      ...(s.slide ? { slide: s.slide * mz.k } : {}),
      ...(s.slideX ? { slideX: s.slideX * mx.k } : {}),
    }))
  out.build = (p) => stretchModel(base.build(p), mx, mz)
  return out
}

/** 一个方向上的分区映射：边缘 m 以内平移，中间按 k 线性拉伸；der 是某点的局部缩放（边缘 1，中间 k） */
interface AxisMap {
  at(v: number): number
  der(v: number): number
  k: number
}
function axisMap(from: number, to: number): AxisMap {
  const h0 = from / 2
  const h1 = to / 2
  const m = Math.min(EDGE, h0 * 0.4, h1 * 0.4)
  const k = (h1 - m) / (h0 - m)
  const inMid = (v: number) => v > -h0 + m && v < h0 - m
  return {
    k,
    at: (v) => (inMid(v) ? v * k : v + Math.sign(v) * (h1 - h0)),
    der: (v) => (inMid(v) ? k : 1),
  }
}

const tmpV = new THREE.Vector3()
const tmpN = new THREE.Vector3()

/** 分区拉伸整个模型（就地改，返回同一个对象） */
export function stretchModel(root: THREE.Group, mx: AxisMap, mz: AxisMap) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  // 先记下每个节点原来在模型里的矩阵（父节点先改，子节点的局部位置要按改过的父节点换算）
  const before = new Map<THREE.Object3D, THREE.Matrix4>()
  root.traverse((o) => {
    if (o !== root) before.set(o, inv.clone().multiply(o.matrixWorld))
  })
  const after = new Map<THREE.Object3D, THREE.Matrix4>([[root, new THREE.Matrix4()]])
  const box = new THREE.Box3()
  const visit = (o: THREE.Object3D, parentAfter: THREE.Matrix4) => {
    const m0 = before.get(o)!
    const p0 = new THREE.Vector3().setFromMatrixPosition(m0)
    let p1: THREE.Vector3
    let rigid: THREE.Vector3 | null = null
    if (o.userData.rigid) {
      // 整块平移：按子树包围盒中心的位移
      box.setFromObject(o).applyMatrix4(inv)
      const c = box.getCenter(new THREE.Vector3())
      rigid = new THREE.Vector3(mx.at(c.x) - c.x, 0, mz.at(c.z) - c.z)
      p1 = p0.clone().add(rigid)
    } else p1 = new THREE.Vector3(mx.at(p0.x), p0.y, mz.at(p0.z))
    const m1 = m0.clone().setPosition(p1)
    after.set(o, m1)
    o.position.copy(p1.clone().applyMatrix4(parentAfter.clone().invert()))
    const motion = o.userData.door as { kind: string; dx?: number; dz?: number } | undefined
    if (motion?.kind === 'slide' && motion.dx) o.userData.door = { ...motion, dx: motion.dx * mx.k }
    if (rigid) return
    if ((o as THREE.Mesh).isMesh) deformMesh(o as THREE.Mesh, m0, m1, mx, mz)
    for (const c of o.children) visit(c, m1)
  }
  for (const c of root.children) visit(c, after.get(root)!)
  root.updateMatrixWorld(true)
  return root
}

function deformMesh(mesh: THREE.Mesh, m0: THREE.Matrix4, m1: THREE.Matrix4, mx: AxisMap, mz: AxisMap) {
  const src = mesh.geometry
  const pos = src.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return
  const g = src.clone()
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined
  // 零件在模型里的包围盒：某方向上很窄就整块平移
  const bb = new THREE.Box3()
  for (let i = 0; i < p.count; i++) bb.expandByPoint(tmpV.fromBufferAttribute(p, i).applyMatrix4(m0))
  const c = bb.getCenter(new THREE.Vector3())
  const size = bb.getSize(new THREE.Vector3())
  const rx = size.x < RIGID
  const rz = size.z < RIGID
  const dx = mx.at(c.x) - c.x
  const dz = mz.at(c.z) - c.z
  const back = m1.clone().invert()
  const nm0 = new THREE.Matrix3().getNormalMatrix(m0)
  const nmBack = new THREE.Matrix3().getNormalMatrix(back)
  for (let i = 0; i < p.count; i++) {
    tmpV.fromBufferAttribute(p, i).applyMatrix4(m0)
    const x = tmpV.x
    const z = tmpV.z
    const kx = rx ? 1 : mx.der(x)
    const kz = rz ? 1 : mz.der(z)
    tmpV.x = rx ? x + dx : mx.at(x)
    tmpV.z = rz ? z + dz : mz.at(z)
    tmpV.applyMatrix4(back)
    p.setXYZ(i, tmpV.x, tmpV.y, tmpV.z)
    if (n && (kx !== 1 || kz !== 1)) {
      tmpN.fromBufferAttribute(n, i).applyMatrix3(nm0)
      tmpN.set(tmpN.x / kx, tmpN.y, tmpN.z / kz).applyMatrix3(nmBack).normalize()
      n.setXYZ(i, tmpN.x, tmpN.y, tmpN.z)
    }
  }
  p.needsUpdate = true
  if (n) n.needsUpdate = true
  g.computeBoundingBox()
  g.computeBoundingSphere()
  mesh.geometry = g
}
