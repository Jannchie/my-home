// 高亮叠加层：悬停、选中时让物体整体提亮一点，但完全不碰物体自己的网格和材质。
//
// 以前的做法是把网格的 material 换成提亮的克隆、取消时再换回。可场景里还有好几处也在换 material：
// 墙体让开（stepCutaway）、楼层淡入淡出（fadeFloor）、重搭房子后的着色器预热，它们各自把「当时身上的材质」记成原件。
// 高亮先换上之后，别的系统就把提亮的材质当原件存下来（外墙是多材质数组，还原时还会拿到一份新数组），
// 取消选中时按引用对不上、或者过一会儿又被「还原」回提亮的样子——高亮就一直留着。
//
// 现在高亮是独立的一层：放在单独的根节点里，每个目标网格配一个共用几何体的叠加网格，
// 每帧跟着目标的世界矩阵和可见性走；混合方式是「屏幕上已有的颜色 × (1 + k)」，浅色深色都是同色提亮。
// 场景里的网格、材质、其他换材质的系统都不受影响，也就不会再有谁存错原件的问题。

import * as THREE from 'three'
import { pullDepth } from './toon'
import { KEEP_ALPHA } from './blend'

/** 叠加材质（按正反面各一份）：结果 = 已有颜色 + 已有颜色 × k，alpha 不变；深度往前拉一点，压过目标自己（墙面也拉过深度） */
function overlayMaterial(k: number, side: THREE.Side) {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(k, k, k),
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.OneFactor,
    // 提亮不算发光：alpha 不动（blend.ts）
    ...KEEP_ALPHA,
    side,
    toneMapped: false,
  })
  return pullDepth(m, 1.2e-3)
}

/** 这个网格现在是不是看得见：还在场景里（重搭后旧模型已经摘掉）、自己和上层都可见、材质没淡到快透明 */
function shown(m: THREE.Object3D) {
  let top: THREE.Object3D = m
  for (let o: THREE.Object3D | null = m; o; o = o.parent) {
    if (!o.visible) return false
    top = o
  }
  if (!(top as THREE.Scene).isScene) return false
  const mats = (m as THREE.Mesh).material
  for (const x of Array.isArray(mats) ? mats : [mats]) if (x && x.transparent && x.opacity < 0.35) return false
  return true
}

export class Highlight {
  readonly root = new THREE.Group()
  private pairs: { src: THREE.Mesh; ov: THREE.Mesh }[] = []
  private mats: Record<'front' | 'double', THREE.Material>

  /** k：提亮的比例（0.2 = 亮两成） */
  constructor(k = 0.22) {
    this.mats = { front: overlayMaterial(k, THREE.FrontSide), double: overlayMaterial(k, THREE.DoubleSide) }
    this.root.matrixAutoUpdate = false
    this.root.renderOrder = 5
  }

  /**
   * 换一批要高亮的物体（它们下面的所有网格；描边外壳不算）。
   * 全透明材质的网格（窗玻璃）不加：叠加层不写深度，玻璃也挡不住后面的东西，推拉窗两扇玻璃的正反面加上后面的窗框，
   * 同一个像素会被提亮四五次（1.22⁵ ≈ 2.7 倍），再被泛光一晕整扇窗发白。窗框提亮了就看得出选中的是哪扇窗
   */
  set(objs: Iterable<THREE.Object3D>) {
    this.clear()
    for (const o of objs)
      o.traverse((n) => {
        const src = n as THREE.Mesh
        if (!src.isMesh || n.userData.isOutline || (src as THREE.SkinnedMesh).isSkinnedMesh) return
        const mats = Array.isArray(src.material) ? src.material : [src.material]
        if (mats.every((x) => !x || x.transparent)) return
        const mat = mats.some((x) => x?.side === THREE.DoubleSide) ? this.mats.double : this.mats.front
        let ov: THREE.Mesh
        const inst = src as THREE.InstancedMesh
        if (inst.isInstancedMesh) {
          const im = new THREE.InstancedMesh(src.geometry, mat, inst.count)
          im.instanceMatrix = inst.instanceMatrix
          ov = im
        } else ov = new THREE.Mesh(src.geometry, mat)
        ov.matrixAutoUpdate = false
        ov.matrixWorldAutoUpdate = false
        ov.castShadow = ov.receiveShadow = false
        ov.renderOrder = 5
        ov.raycast = () => {}
        this.root.add(ov)
        this.pairs.push({ src, ov })
      })
    this.sync()
  }

  clear() {
    this.root.clear()
    this.pairs = []
  }

  get active() {
    return this.pairs.length > 0
  }

  /** 每帧调用：跟上目标的位置和可见性；返回这一帧有没有变化（要不要重画） */
  sync() {
    let changed = false
    for (const { src, ov } of this.pairs) {
      // 目标被移出场景（重搭了）：藏起来，等下次 set
      const vis = shown(src)
      if (ov.visible !== vis) {
        ov.visible = vis
        changed = true
      }
      if (!vis) continue
      if (!ov.matrixWorld.equals(src.matrixWorld)) {
        ov.matrixWorld.copy(src.matrixWorld)
        changed = true
      }
    }
    return changed
  }

  dispose() {
    this.clear()
    this.mats.front.dispose()
    this.mats.double.dispose()
  }
}
