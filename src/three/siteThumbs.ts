// 外观编辑器的选项预览图：围挡款式、车型、屋顶、外墙材质、入口。
// 用真正的 3D 模型（fenceSpan / carModel / buildBuilding）在素材缩略图那个离屏舞台上渲染一张，缓存成 dataURL（thumbs.ts renderThumb）。
// 只在编辑器打开、选项格子出现时才排队渲染，按时间片推进；同一格换了参数（拖坡度、换颜色）只渲染最新那份，旧图先留着不闪白。

import * as THREE from 'three'
import { onBeforeUnmount, shallowRef } from 'vue'
import { FENCE_STYLE, type CarKind, type Exterior, type FenceKind, type Plan } from '../model'
import { buildBuilding } from './building'
import { carModel, fenceSpan } from './exterior'
import { BASE } from './house'
import { addOutlines, rbox } from './toon'
import { cachedThumb, renderThumb } from './thumbs'

/** 一张预览图要画什么 */
export type SitePreview =
  | { t: 'fence'; kind: Exclude<FenceKind, 'none'>; color?: string; height?: number }
  | { t: 'car'; kind: CarKind; color: string }
  /** 一座小房子：focus 决定镜头框住哪里（整个屋顶 / 一段外墙 / 入口） */
  | { t: 'house'; focus: 'roof' | 'facade' | 'entrance'; ex: Exterior }

/** 缓存键：画面相关的参数都在里面，不相关的（比如看屋顶时的点缀色以外）也带上，宁可多渲染一张不画错 */
export function previewKey(p: SitePreview): string {
  if (p.t === 'fence') return `site:fence|${p.kind}|${p.color ?? ''}|${p.height ?? ''}`
  if (p.t === 'car') return `site:car|${p.kind}|${p.color}`
  const e = p.ex
  return `site:house|${p.focus}|${e.roof}|${e.roofColor}|${e.pitch ?? ''}|${e.eave ?? ''}|${e.facade}|${e.wallColor}|${e.trimColor}|${e.porch ?? ''}`
}

/** 预览用的小房子：一间 480 × 400 的起居室 + 东南角一个玄关（南墙上入户门），南墙一扇窗；平面 +y 朝南（3D 的 +z） */
export function previewPlan(ex: Exterior): Plan {
  const rect = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  return {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: '',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'pv-ldk', name: 'LDK', kind: 'ldk', points: rect(0, 0, 480, 400) },
      { id: 'pv-ent', name: '玄関', kind: 'entrance', points: rect(480, 180, 680, 400) },
    ],
    openings: [
      // 边 2：(480,400) → (0,400)，南墙
      { id: 'pv-win', kind: 'window', roomId: 'pv-ldk', edge: 2, offset: 240, width: 170, hinge: 'start', swing: 'in' },
      { id: 'pv-door', kind: 'door', roomId: 'pv-ent', edge: 2, offset: 100, width: 90, hinge: 'start', swing: 'out' },
    ],
    fixtures: [],
    furniture: [],
    exterior: { ...ex },
  }
}

/** 预览的模型（自带描边）；测试里也用它检查每个选项都搭得出来 */
export function previewObject(p: SitePreview): THREE.Object3D {
  const g = new THREE.Group()
  if (p.t === 'fence') {
    const d = FENCE_STYLE[p.kind]
    const len = 300
    const span = new THREE.Group()
    for (const m of fenceSpan(p.kind, len, p.color ?? d.color, p.height ?? d.height, !!p.color, 1)) span.add(m)
    span.position.x = -len / 2
    g.add(span)
    // 脚下一条草地，绿篱这种没有立柱的也看得出是立在地上的
    g.add(rbox(len + 40, 4, 90, '#b9d39c', { y: -4, z: 20 }, 2))
  } else if (p.t === 'car') {
    g.add(carModel(p.color, p.kind))
  } else {
    const plan = previewPlan(p.ex)
    const { root } = buildBuilding(plan, 250, undefined, { bare: true })
    // 室内地面比院子高（BASE）：整体抬起来，入口台阶落在地上
    root.position.y = -BASE
    g.add(root)
    return g
  }
  addOutlines(g)
  return g
}

const DIRS = {
  fence: new THREE.Vector3(0.45, 0.5, 1).normalize(),
  // 车头朝 -z：从左前上方看
  car: new THREE.Vector3(0.85, 0.6, -1).normalize(),
  roof: new THREE.Vector3(0.75, 0.85, 1).normalize(),
  facade: new THREE.Vector3(-0.5, 0.25, 1).normalize(),
  entrance: new THREE.Vector3(0.6, 0.4, 1).normalize(),
}

/** 渲染（或取缓存）一张预览图 */
export function renderPreview(p: SitePreview): string {
  const key = previewKey(p)
  if (p.t === 'fence') return renderThumb(key, () => previewObject(p), { dir: DIRS.fence, margin: 0.85 })
  if (p.t === 'car') return renderThumb(key, () => previewObject(p), { dir: DIRS.car, margin: 1.02 })
  const focus = p.focus
  return renderThumb(key, () => previewObject(p), {
    dir: DIRS[focus],
    margin: focus === 'roof' ? 0.9 : focus === 'entrance' ? 0.95 : 0.7,
    box:
      focus === 'roof'
        ? undefined
        : () => {
            // 平面坐标 → 3D：x 不变，平面 y = 3D z；抬起了 -BASE
            const y0 = -BASE
            if (focus === 'entrance') return new THREE.Box3(new THREE.Vector3(450, 0, 380), new THREE.Vector3(730, y0 + 290, 600))
            // 外墙：西南角一段没有窗的墙（材质纹理看得清，转角带一点立体感）
            return new THREE.Box3(new THREE.Vector3(-10, y0 + 30, 380), new THREE.Vector3(150, y0 + 200, 420))
          },
  })
}

/**
 * 组件里用：previews.value[slot] 有值就显示。slot 是格子的编号（比如 'fence:hedge'），
 * want(slot, spec) 声明这一格现在要画什么；同一格的旧请求被新的替换掉。
 */
export function useSitePreviews() {
  const previews = shallowRef<Record<string, string>>({})
  const shown = new Map<string, string>()
  const queue = new Map<string, SitePreview>()
  let timer = 0
  let pending: Record<string, string> | null = null
  const put = (slot: string, key: string, url: string) => {
    shown.set(slot, key)
    if (!pending) {
      pending = {}
      queueMicrotask(() => {
        previews.value = { ...previews.value, ...pending }
        pending = null
      })
    }
    pending[slot] = url
  }
  const pump = () => {
    timer = 0
    const t0 = performance.now()
    for (const [slot, spec] of queue) {
      queue.delete(slot)
      try {
        put(slot, previewKey(spec), renderPreview(spec))
      } catch {
        // 没有 WebGL（极少数环境）：格子只显示文字
        shown.set(slot, previewKey(spec))
      }
      if (performance.now() - t0 > 12) break
    }
    if (queue.size) timer = window.setTimeout(pump, 16)
  }
  const want = (slot: string, spec: SitePreview) => {
    const key = previewKey(spec)
    if (shown.get(slot) === key) {
      queue.delete(slot)
      return
    }
    const hit = cachedThumb(key)
    if (hit) {
      queue.delete(slot)
      put(slot, key, hit)
      return
    }
    queue.set(slot, spec)
    if (!timer) timer = window.setTimeout(pump, 16)
  }
  onBeforeUnmount(() => {
    clearTimeout(timer)
    queue.clear()
  })
  return { previews, want }
}
