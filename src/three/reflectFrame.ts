// 倒影的「帧」：Reflector 在 onBeforeRender 里画倒影（reflect.ts guardReflector），同一帧里可能被画到好几次
// （遮蔽那一遍、多帧累积……），按这里的帧号去重。单独一个不依赖别的模块的文件：stage.ts 每次 render 开头调 beginReflectFrame，
// 不必为此引入 reflect.ts（它依赖户型、楼层等一大串模块）。

import * as THREE from 'three'

let frame = 0
let reuse = false
/** 镜头在动时倒影隔几帧重画一次（Sandbox3D：漫游 2，鸟瞰 4——俯视时倒影只有很淡的一层，却要整栋房子每个反光面各画一遍） */
let interval = 2
export const setReflectInterval = (n: number) => (interval = Math.max(1, n))
export const reflectInterval = () => interval

/**
 * 所有反射面（reflect.ts guardReflector 登记）。倒影要在主画面之前、在最外层画（prerenderReflections）：
 * Reflector 默认在自己的 onBeforeRender 里画，也就是主画面渲染到一半时嵌套地再画一遍场景。three 给嵌套的渲染另开一份灯光状态，
 * 两份状态的版本号不同，场景里每个材质在主画面和倒影之间来回「灯光变了」，每画一次都要重新查一遍着色器程序（漫游时每帧上千次）。
 */
export const reflectors = new Set<THREE.Mesh>()

const frustum = new THREE.Frustum()
const projView = new THREE.Matrix4()
const sphere = new THREE.Sphere()
const shown = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

/** 在主画面之前把这一帧看得到的倒影画好（之后主画面里的 onBeforeRender 按帧号跳过） */
export function prerenderReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  if (!reflectors.size) return
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(projView)
  for (const r of reflectors) {
    if (!shown(r) || !r.layers.test(camera.layers)) continue
    if (!r.geometry.boundingSphere) r.geometry.computeBoundingSphere()
    if (!frustum.intersectsSphere(sphere.copy(r.geometry.boundingSphere!).applyMatrix4(r.matrixWorld))) continue
    r.onBeforeRender(renderer, scene, camera, r.geometry, r.material as THREE.Material, null as unknown as THREE.Group)
  }
}

/** 开始画新的一帧（stage.render 开头，所有渲染路径都经过它）：默认倒影要重画 */
export function beginReflectFrame() {
  frame++
  reuse = false
}
/** 这一帧可以沿用上一帧画好的倒影：镜头和场景都没变、只是多帧累积在收敛（post.ts） */
export function setReflectReuse(on: boolean) {
  reuse = on
}

export const reflectFrame = () => frame
export const reflectReuse = () => reuse
