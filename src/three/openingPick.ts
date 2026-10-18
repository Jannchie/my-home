// 3D 沙盘里点选门窗：命中的网格 → 洞口 id，选中框的尺寸（洞口宽 × 洞口高 × 墙厚）。
// 门扇、推拉扇、折门、窗框的组上都挂着 userData.info（three/house.ts buildOpenings），玻璃、描边壳是组里的子网格。
import type * as THREE from 'three'
import type { OpeningInfo } from './house'

/** 命中的对象属于哪个洞口（往上找挂着 info 的组）；不是门窗返回 null */
export function openingIdOf(o: THREE.Object3D | null): string | null {
  for (; o; o = o.parent) {
    const info = o.userData.info as OpeningInfo | undefined
    if (info?.o?.id) return info.o.id
  }
  return null
}

/**
 * 由近到远的射线命中里第一个门窗：看不见的跳过；先碰到不透明的（墙、楼板）就算被挡住返回 null；
 * 半透明的（让开的墙、玻璃以外的透明件）穿过去。返回洞口 id 和命中距离。
 */
export function firstOpeningHit(hits: readonly THREE.Intersection[], visible: (o: THREE.Object3D) => boolean, opaque: (h: THREE.Intersection) => boolean): { id: string; dist: number } | null {
  for (const h of hits) {
    if (!(h.object as THREE.Mesh).isMesh || !visible(h.object)) continue
    const id = openingIdOf(h.object)
    if (id) return { id, dist: h.distance }
    if (opaque(h)) return null
  }
  return null
}

/** 选中框比洞口外扩的厚度（cm）：墙两侧各让出一点，框不埋进墙面 */
const DEPTH_PAD = 4

/**
 * 洞口的立体选中框（楼层局部坐标，cm）：中心在洞口中线、洞口半高处；
 * w = 洞口宽，h = 洞口高（窗顶碰到天花时截到层高），d = 墙厚 + 两侧余量；yaw 同门窗模型的 rotation.y。
 */
export function openingFrame(info: Pick<OpeningInfo, 'center' | 'dir' | 'width' | 'wall' | 'y0' | 'y1'>, wallH: number) {
  const top = Math.min(info.y1, wallH)
  const y0 = Math.min(info.y0, top)
  return {
    x: info.center.x,
    y: (y0 + top) / 2,
    z: info.center.y,
    w: info.width,
    h: Math.max(1, top - y0),
    d: info.wall + DEPTH_PAD,
    yaw: Math.atan2(-info.dir.y, info.dir.x),
  }
}
