// 3D 沙盘里点选设备（厨房、浴缸、马桶、洗面台、收纳位、楼梯…）和门窗：命中的网格 → 设备 / 洞口 id，设备选中框的尺寸。
// 设备模型的根上挂着 userData.fixtureId（three/house.ts buildHouse；浴缸上方的淋浴、浴帘也挂了），门窗见 openingPick.ts。
import * as THREE from 'three'
import { openingIdOf } from './openingPick'

/** 命中的对象属于哪个设备（往上找挂着 fixtureId 的组）；不是设备返回 null */
export function fixtureIdOf(o: THREE.Object3D | null): string | null {
  for (; o; o = o.parent) {
    const id = o.userData.fixtureId as string | undefined
    if (id) return id
  }
  return null
}

export type HouseHitKind = 'opening' | 'fixture'
export interface HouseHit {
  kind: HouseHitKind
  id: string
  dist: number
}

/**
 * 由近到远的射线命中里第一个门窗或设备：看不见的跳过；先碰到不透明的（墙、楼板）就算被挡住返回 null；
 * 半透明的（让开的墙、玻璃）穿过去。allow 说不能选的门窗 / 设备（别的楼层的）当成普通的墙：不透明就挡住。
 */
export function firstHouseHit(
  hits: readonly THREE.Intersection[],
  visible: (o: THREE.Object3D) => boolean,
  opaque: (h: THREE.Intersection) => boolean,
  allow: (kind: HouseHitKind, id: string) => boolean = () => true,
): HouseHit | null {
  for (const h of hits) {
    if (!(h.object as THREE.Mesh).isMesh || !visible(h.object)) continue
    const op = openingIdOf(h.object)
    if (op && allow('opening', op)) return { kind: 'opening', id: op, dist: h.distance }
    const fx = op ? null : fixtureIdOf(h.object)
    if (fx && allow('fixture', fx)) return { kind: 'fixture', id: fx, dist: h.distance }
    if (opaque(h)) return null
  }
  return null
}

/**
 * 家具和门窗 / 设备比远近：射线上比这个距离近的家具优先（家具在门窗前面、设备上面就选家具）。
 * 设备上 / 设备里的家具（台面上的东西、收纳位里的柜子、防水盘上的洗衣机）常和设备面贴在一起：设备留半厘米余量。
 */
export function furnitureLimit(h: HouseHit | null) {
  return h ? h.dist + (h.kind === 'fixture' ? 0.5 : 0) : Infinity
}

/** 设备模型本体（不是淋浴、浴帘这些附件）：在 root 下找挂着这个 fixtureId 的那个 */
export function findFixtureModel(root: THREE.Object3D, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((o) => {
    if (!found && o.userData.fixtureId === id && !o.userData.fixtureExtra) found = o
  })
  return found
}

const inv = new THREE.Matrix4()
const rel = new THREE.Matrix4()
const tmp = new THREE.Box3()

/**
 * 设备的立体选中框（世界坐标，cm）：模型在自己局部坐标里的包围盒（描边壳、藏起来的网格不算），
 * 中心换到世界坐标；w / h / d 是局部 x / y / z 的长度，yaw = 模型的 rotation.y（楼层组不转）。
 * 楼梯的包围盒包含整段梯段和扶手的高度（通到上一层）。模型是空的返回 null。
 */
export function fixtureFrame(obj: THREE.Object3D) {
  obj.updateWorldMatrix(true, true)
  inv.copy(obj.matrixWorld).invert()
  const box = new THREE.Box3()
  obj.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh || !m.visible || n.userData.isOutline || !m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    tmp.copy(m.geometry.boundingBox!).applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld))
    box.union(tmp)
  })
  if (box.isEmpty()) return null
  const size = box.getSize(new THREE.Vector3())
  const c = obj.localToWorld(box.getCenter(new THREE.Vector3()))
  return { c, w: Math.max(1, size.x), h: Math.max(1, size.y), d: Math.max(1, size.z), yaw: obj.rotation.y }
}
