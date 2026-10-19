// 抽屉格和抽屉部件的对应：素材的 surfaces 里抽屉格（slide）只记了位置，模型里的抽屉（kit.ts movable 'drawer'）只记了动作，
// 两边按几何对上——抽屉格（关着时）的中心落在哪个抽屉盒里，就是哪个抽屉的格。
// 沙盘里单独拉开一个抽屉时（openers.ts），靠它找出要跟着挪的那一格里的东西。

import * as THREE from 'three'
import { ASSET_MAP } from './assets'
import { doorParts, type DoorMotion } from './kit'

/** 素材 → （抽屉部件下标 → 抽屉格下标），按素材缓存（同一素材的模型结构一样） */
const cache = new Map<string, Map<number, number>>()

/** 部件关着时在模型局部坐标里的包围盒（外扩一点） */
function closedBox(part: THREE.Object3D, model: THREE.Object3D) {
  const base = part.userData.doorBase as { p: THREE.Vector3; r: THREE.Euler } | undefined
  const T = base ? new THREE.Matrix4().compose(base.p, new THREE.Quaternion().setFromEuler(base.r), part.scale) : part.matrix.clone()
  for (let o = part.parent; o && o !== model; o = o.parent) T.premultiply(o.matrix)
  const box = new THREE.Box3()
  part.traverse((n) => {
    const g = (n as THREE.Mesh).geometry
    if (!(n as THREE.Mesh).isMesh || !g || n.userData.isOutline) return
    const M = new THREE.Matrix4()
    for (let o: THREE.Object3D | null = n; o && o !== part; o = o.parent) M.premultiply(o.matrix)
    if (!g.boundingBox) g.computeBoundingBox()
    box.union(g.boundingBox!.clone().applyMatrix4(M.premultiply(T)))
  })
  return box.expandByScalar(1.5)
}

/**
 * 某件素材的抽屉部件（kit.ts doorParts 下标）各是哪一个抽屉格（def.surfaces 下标）。
 * model：这件素材的模型（原点在底面中心，和 surfaces 同一坐标）。
 */
export function drawerSlots(asset: string, model: THREE.Object3D) {
  let m = cache.get(asset)
  if (m) return m
  m = new Map()
  cache.set(asset, m)
  const def = ASSET_MAP.get(asset)
  if (!def?.surfaces) return m
  const boxes = doorParts(model).map((o) => ((o.userData.door as DoorMotion).kind === 'drawer' ? closedBox(o, model) : null))
  def.surfaces.forEach((sf, i) => {
    if (!sf.slide || !sf.shape?.length) return
    const b = new THREE.Box2().setFromPoints(sf.shape.flat().map(([x, z]) => new THREE.Vector2(x, z)))
    const c = b.getCenter(new THREE.Vector2())
    const p = new THREE.Vector3(c.x, sf.y + 0.5, c.y)
    const k = boxes.findIndex((bx) => !!bx?.containsPoint(p))
    if (k >= 0 && !m!.has(k)) m!.set(k, i)
  })
  return m
}
