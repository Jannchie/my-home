// 静态矩阵：搭好就不动的房子、家具设 matrixAutoUpdate = false，three 不再每帧给上万个对象重算矩阵。
// 约定：改了静态对象的 position / rotation / scale，立刻调 syncMatrix(o)。
//
// 为什么要连世界矩阵一起算：别处会对单个对象调 getWorldPosition / updateWorldMatrix(true, false)，
// 它只更新这个对象自己的 matrixWorld 并清掉「需要更新」标记，下一帧渲染时就不会再带着子节点一起重算，
// 而静态子节点自己不会更新 —— 子树就停在旧位置。所以挪动时当场把整棵子树的世界矩阵算好。

import * as THREE from 'three'

/** root 和它下面的所有对象改成静态矩阵，按当前位姿算好一次 */
export function freezeMatrices(root: THREE.Object3D) {
  root.traverse((o) => {
    o.matrixAutoUpdate = false
    o.updateMatrix()
  })
  root.updateMatrixWorld(true)
}

const want = new THREE.Matrix4()
/**
 * 静态对象挪动后：重算它的局部矩阵和整棵子树的世界矩阵（父节点的世界矩阵须是最新的）。
 * 位姿和父节点都没变（拖动时其余家具也会被重新摆一遍）就跳过子树。
 */
export function syncMatrix(o: THREE.Object3D) {
  o.updateMatrix()
  if (o.parent) want.multiplyMatrices(o.parent.matrixWorld, o.matrix)
  else want.copy(o.matrix)
  if (want.equals(o.matrixWorld)) {
    o.matrixWorldNeedsUpdate = false
    return
  }
  o.updateMatrixWorld(true)
}
