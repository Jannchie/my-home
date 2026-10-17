// 素材包共用的几何小工具（唯一实现）。依赖方向：toon → geo → kit → packs。
// 这里只放「和具体素材无关」的建模小件：摆放、描边 / 发光 / 半透明标记、两点之间的杆和条、弯管、包围盒对齐。
// 素材包不要再在自己文件里复制这些函数：同名不同义（参数顺序、默认值不同）是最大的隐患——
// 改一个包里 bar 的参数顺序，另一个包的调用就悄悄变成另一种几何。语义不同的函数在这里用不同的名字区分，
// test/packs-hygiene.spec.ts 会检查各包没有再定义与这里同名的顶层函数。
import * as THREE from 'three'

export const PI = Math.PI
/** 三维点 [x, y, z]，cm */
export type V3 = [number, number, number]
/** 二维点 [x, y]，cm */
export type V2 = [number, number]
/** 只读的 y 轴单位向量（不要修改它） */
export const UP = new THREE.Vector3(0, 1, 0)

// ---------- 摆放 ----------

/** 就地设置位置和欧拉角，返回原对象 */
export function P<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}
