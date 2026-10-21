// 墙上的设备模型：灯开关、可视对讲、热水器 / 浴室遥控面板、门铃。
// house.ts 按门的位置自动画（three/wallDevices.ts），对讲和遥控面板也是挂墙素材（packs/wall-devices.ts）。
// 局部坐标：正面朝 +z，背面在 z ≈ -1.3，y = 0 是自动摆放时的安装高度（模型在它上下）。

import * as THREE from 'three'
import { ball, cyl, rbox, toon } from './toon'
import { glow } from './kit'

export function switchPlate() {
  const g = new THREE.Group()
  g.add(rbox(7, 12, 1, '#f8f6f2', { y: -6 }, 0.6))
  g.add(rbox(3.6, 5.6, 0.8, '#ffffff', { y: -2.8, z: 0.6 }, 0.4))
  const led = ball(0.35, '#7fe0a8', { y: 3.6, z: 0.6 })
  led.material = toon('#7fe0a8', { emissive: 0.8 })
  g.add(led)
  return g
}
export function intercomMonitor() {
  const g = new THREE.Group()
  g.add(rbox(20, 15, 2.6, '#f5f3ee', { y: -7.5 }, 1))
  g.add(glow(11, 7.5, '#7fb8e6', { x: -2.5, y: -4.5, z: 1.4 }, 0.5))
  for (let i = 0; i < 3; i++) g.add(rbox(2.6, 1.6, 0.6, '#cfd3da', { x: 6.2, y: -5.5 + i * 2.6, z: 1.4 }, 0.4))
  return g
}
export function bathRemote() {
  const g = new THREE.Group()
  g.add(rbox(13, 12, 2, '#f5f3ee', { y: -6 }, 1))
  g.add(glow(8, 4, '#ffb347', { y: -1.5, z: 1.1 }, 0.6))
  for (const [x, c] of [
    [-3.5, '#ff8f86'],
    [0, '#a8d4f4'],
    [3.5, '#a6e3cc'],
  ] as const)
    g.add(ball(1, c, { x, y: -4.5, z: 1.2 }, [1, 1, 0.5]))
  return g
}
export function doorbell() {
  const g = new THREE.Group()
  g.add(rbox(8, 13, 2.6, '#e9e6e0', { y: -6.5 }, 0.8))
  g.add(ball(1.2, '#3a3a3c', { y: 2.5, z: 1.3 }, [1, 1, 0.5]))
  g.add(cyl(1.6, 1.6, 0.8, '#d9dee6', { y: -3.5, z: 1.3, rx: Math.PI / 2 }, 16))
  return g
}
