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
import type { AssetDef } from './kit'
import { deriveResizedWith, resizedMeta, type AxisMap } from './resizeMeta'

export * from './resizeMeta'

/** 某方向上比这窄的零件在这个方向上整块平移 */
const RIGID = 12

const derived = new Map<string, AssetDef | null>()

/** 派生 id 对应的完整素材（缓存）：数据按 resizeMeta 换算，模型按素材自己的 resize(w, d) 重搭，没有就分区拉伸 */
export function deriveResized(id: string, lookup: (id: string) => AssetDef | undefined): AssetDef | undefined {
  return deriveResizedWith(id, lookup, derived, makeResized)
}

function makeResized(base: AssetDef, id: string, w: number, d: number): AssetDef {
  const { out, mx, mz } = resizedMeta(base, id, w, d)
  delete out.resize
  if (base.resize) return { ...out, surfaceShape: base.surfaceShape, surfaces: base.surfaces, ...base.resize(w, d) }
  out.build = (p) => stretchModel(base.build(p), mx, mz)
  return out
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
