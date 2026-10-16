// 3D 沙盘对外的一小组句柄：浮动工具条、右键菜单、双击聚焦、方向键微移等界面增强（SandboxOverlay.vue）
// 通过它拿镜头 / 拾取 / 家具对象，不用把这些交互都塞进 Sandbox3D.vue。沙盘卸载时置空。
import { shallowRef } from 'vue'
import type * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export interface SandboxBridge {
  canvas: HTMLCanvasElement
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  /** 家具 id → 场景里的模型 */
  object(id: string): THREE.Object3D | undefined
  /** 屏幕坐标处的家具 id（含走动中的宠物 / 机器人对应的家具） */
  pick(e: { clientX: number; clientY: number }): string | null
  resetView(): void
  /** 标记需要重画 */
  redraw(): void
}

export const sandboxBridge = shallowRef<SandboxBridge | null>(null)
