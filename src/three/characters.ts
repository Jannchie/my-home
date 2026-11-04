// 沙盘里会活动的角色层（宠物和机器人：ActorLayer；VRM 住户：ResidentLayer）对 Sandbox3D 的统一接口。
// Sandbox3D 只持有一组 CharacterLayer，同步、每帧更新、楼层动画、预编译、后处理去拖影都对整组做；再加一种角色只要实现这个接口。

import * as THREE from 'three'
import type { Plan } from '../model'

/** 楼层相关的钩子（Sandbox3D 给）：楼层地面的世界高度、这层显不显示、跟着楼层淡入淡出 */
export interface FloorHooks {
  lift: (floor: string) => number
  shown: (floor: string) => boolean
  fade: (root: THREE.Object3D, floor: string) => void
}

export interface CharacterLayer extends FloorHooks {
  readonly group: THREE.Group
  /** 场景（户型、家具）或模式变了之后调用；plan 传原始对象。changed = false：户型没变，只是能不能动变了 */
  sync(plan: Plan, live: boolean, changed?: boolean): void
  /** 每帧调用；返回是否需要重画 */
  update(dt: number): boolean
  /** 楼层动画在动：按所在楼层重新摆高度、显示 */
  relayout(): void
  /** 每个角色的模型和所在楼层（预编译楼层淡出的着色器用） */
  roots(): [THREE.Object3D, string][]
  /** 正在活动的角色的世界包围盒（后处理按它去掉拖影），盒子从 pool 里取 */
  movers(out: THREE.Box3[], pool: BoxPool): void
}

/** 每帧要用的一批 Box3：reset 后按顺序取，不够再新建，旧的反复用 */
export class BoxPool {
  private boxes: THREE.Box3[] = []
  private n = 0
  reset() {
    this.n = 0
  }
  /** 以 (x, z) 为中心、半径 r，从 y0 到 y1 的盒子 */
  around(x: number, z: number, r: number, y0: number, y1: number) {
    const b = (this.boxes[this.n++] ??= new THREE.Box3())
    b.min.set(x - r, y0, z - r)
    b.max.set(x + r, y1, z + r)
    return b
  }
}
