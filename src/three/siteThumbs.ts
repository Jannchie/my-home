// 外观编辑器的选项预览图：围挡款式、车型、屋顶、外墙材质、入口。
// 用真正的 3D 模型（fenceSpan / carModel / buildBuilding）在素材缩略图那个离屏舞台上渲染一张，缓存成 dataURL（thumbs.ts renderThumb）。
// 只在编辑器打开、选项格子出现时才排队渲染，按时间片推进；同一格换了参数（拖坡度、换颜色）只渲染最新那份，旧图先留着不闪白。

import * as THREE from 'three'
import { onBeforeUnmount, shallowRef } from 'vue'
import { FENCE_STYLE, type CarKind, type DoorGlass, type DoorHandle, type DoorLeafStyle, type DoorLites, type Exterior, type FenceKind, type Plan, type WindowGrid } from '../model'
import { sidelightWidth, type DoorKind } from '../doorStyles'
import { doorLeafModel, liteModel } from './doorModels'
import { buildBuilding } from './building'
import { carModel, fenceSpan } from './exterior'
import { BASE } from './house'
import { addOutlines, rbox, toon } from './toon'
import { spandrelGeometry, windowModel, type WindowModelStyle } from './windows'
import { archRise, roundDiameter } from '../windows'
import { cachedThumb, renderThumb } from './thumbs'

/** 一张预览图要画什么 */
export type SitePreview =
  | { t: 'fence'; kind: Exclude<FenceKind, 'none'>; color?: string; height?: number }
  | { t: 'car'; kind: CarKind; color: string }
  /** 一座小房子：focus 决定镜头框住哪里（整个屋顶 / 一段外墙 / 入口） */
  | { t: 'house'; focus: 'roof' | 'cover' | 'facade' | 'entrance'; ex: Exterior }
  /** 一扇窗嵌在一小段外墙里（门窗检查器的款式 / 格条格子） */
  | { t: 'window'; style: WindowModelStyle; frame: string; grid?: WindowGrid; shutters?: string }
  /** 一扇关着的门嵌在一小段室内墙里（门窗检查器的门款式格子）；style 不填 = 平板 */
  | { t: 'door'; kind: DoorKind; style?: DoorLeafStyle; color: string; handle: DoorHandle; handleColor: string; lites?: DoorLites; glass?: DoorGlass }

/** 缓存键：画面相关的参数都在里面，不相关的（比如看屋顶时的点缀色以外）也带上，宁可多渲染一张不画错 */
export function previewKey(p: SitePreview): string {
  if (p.t === 'fence') return `site:fence|${p.kind}|${p.color ?? ''}|${p.height ?? ''}`
  if (p.t === 'car') return `site:car|${p.kind}|${p.color}`
  if (p.t === 'window') return `site:window|${p.style}|${p.frame}|${p.grid ?? ''}|${p.shutters ?? ''}`
  if (p.t === 'door') return `site:door|${p.kind}|${p.style ?? ''}|${p.color}|${p.handle}|${p.handleColor}|${p.lites ?? ''}|${p.glass ?? ''}`
  const e = p.ex
  return `site:house|${p.focus}|${e.roof}|${e.roofColor}|${e.pitch ?? ''}|${e.eave ?? ''}|${e.facade}|${e.wallColor}|${e.trimColor}|${e.porch ?? ''}|${e.roofCover ?? ''}`
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
  } else if (p.t === 'window') {
    g.add(windowPreview(p))
  } else if (p.t === 'door') {
    g.add(doorPreview(p))
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

/** 预览窗：120 × 110 的窗洞，开在一段浅色外墙上（户外朝 +z，镜头从户外看） */
const PV_W = 120
const PV_H = 110
function windowPreview(p: Extract<SitePreview, { t: 'window' }>): THREE.Group {
  const g = new THREE.Group()
  const wall = 18
  const side = p.shutters ? 85 : 45
  const W = PV_W + side * 2
  const mat = toon('#efe7da')
  const box = (x0: number, x1: number, y0: number, y1: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, wall), mat)
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0)
    g.add(m)
  }
  box(-W / 2, -PV_W / 2, -35, PV_H + 30)
  box(PV_W / 2, W / 2, -35, PV_H + 30)
  box(-PV_W / 2, PV_W / 2, -35, 0)
  box(-PV_W / 2, PV_W / 2, PV_H, PV_H + 30)
  if (p.style === 'arched' || p.style === 'round') {
    const rise = archRise(PV_W, PV_H)
    const r = roundDiameter(PV_W, PV_H) / 2
    const geo = p.style === 'arched' ? spandrelGeometry(PV_W, rise, wall, PV_W / 2, rise, -rise / 2, false) : spandrelGeometry(PV_W, PV_H, wall, r, r, 0, true)
    if (geo) {
      // 单一材质（几何里的分组被忽略）：描边只认单一填充色
      const m = new THREE.Mesh(geo, mat)
      m.position.y = p.style === 'arched' ? PV_H - rise / 2 : PV_H / 2
      g.add(m)
    }
  }
  g.add(windowModel({ style: p.style, w: PV_W, h: PV_H, wall, frame: p.frame, grid: p.grid, shutters: p.shutters, out: 1 }))
  return g
}

/** 预览门：开门 90 宽、推拉门 / 谷仓门 150 宽、折叠门 80 宽（带侧窗的开门 120 宽），高 200，开在一段米白的室内墙上（镜头在 +z） */
const PV_DOOR_H = 200
export function doorPreviewWidth(p: Pick<Extract<SitePreview, { t: 'door' }>, 'kind' | 'lites' | 'style'>) {
  if (p.kind === 'sliding') return 150
  if (p.kind === 'folding') return 80
  return p.lites === 'side' || p.lites === 'both' ? 120 : 90
}
function doorPreview(p: Extract<SitePreview, { t: 'door' }>): THREE.Group {
  const g = new THREE.Group()
  const wall = 12
  const W = doorPreviewWidth(p)
  const transom = p.kind === 'door' && (p.lites === 'top' || p.lites === 'both')
  const H = transom ? 226 : PV_DOOR_H
  const side = 40
  // 墙比常见的白门深一点，白色门扇的轮廓看得清
  const mat = toon('#d9d0c1')
  const box = (x0: number, x1: number, y0: number, y1: number, z = 0, d = wall) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, d), mat)
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z)
    g.add(m)
  }
  box(-W / 2 - side, -W / 2, 0, H + 25)
  box(W / 2, W / 2 + side, 0, H + 25)
  box(-W / 2, W / 2, H, H + 25)
  // 地板
  g.add(rbox(W + side * 2 + 20, 3, 30, '#c9a97e', { y: -3, z: 10 }, 1))
  const leaf = (w: number, h: number, t: number, handleSide: -1 | 0 | 1) => doorLeafModel({ style: p.style, w, h, t, color: p.color, handle: p.handle, handleColor: p.handleColor, handleSide, glass: p.glass })
  if (p.kind === 'door') {
    const sl = p.lites === 'side' || p.lites === 'both' ? sidelightWidth(W) : 0
    const lw = W - 4 - sl
    const m = leaf(lw, PV_DOOR_H - 4, 3.6, 1)
    m.position.set(-W / 2 + 2 + lw / 2, 1, 0)
    g.add(m)
    if (sl) g.add(liteModel(W / 2 - sl, W / 2, 0, PV_DOOR_H - 2, 4, p.color, p.glass))
    if (transom) g.add(liteModel(-W / 2, W / 2, PV_DOOR_H, H, 4, p.color, p.glass))
  } else if (p.kind === 'sliding' && p.style === 'barn') {
    // 谷仓门：挂在墙面上（镜头一侧），关着
    const m = leaf(W + 8, PV_DOOR_H + 3, 3.6, -1)
    m.position.set(0, 0, wall / 2 + 3.3)
    g.add(m)
    g.add(rbox(W * 1.6, 3, 2, '#2f3134', { y: PV_DOOR_H + 6, z: wall / 2 + 3.3 }, 0.6))
  } else if (p.kind === 'sliding') {
    for (const k of [0, 1]) {
      const pw = W / 2 + 2
      const m = leaf(pw, PV_DOOR_H - 1, 3, k === 0 ? -1 : 1)
      m.position.set((k === 0 ? -1 : 1) * (W / 4 - 1), 0, (k === 0 ? 1 : -1) * 2)
      g.add(m)
    }
  } else {
    for (const k of [0, 1]) {
      const lw = W / 2 - 1
      const m = leaf(lw, PV_DOOR_H - 1, 2.4, k === 1 ? -1 : 0)
      m.position.set((k === 0 ? -1 : 1) * (W / 4), 0, 0)
      g.add(m)
    }
  }
  return g
}

const DIRS = {
  fence: new THREE.Vector3(0.45, 0.5, 1).normalize(),
  // 车头朝 -z：从左前上方看
  car: new THREE.Vector3(0.85, 0.6, -1).normalize(),
  roof: new THREE.Vector3(0.75, 0.85, 1).normalize(),
  // 屋面材料：凑近西南角的檐口，看得清瓦行和檐口的瓦头
  cover: new THREE.Vector3(-0.6, 0.9, 1).normalize(),
  facade: new THREE.Vector3(-0.5, 0.25, 1).normalize(),
  entrance: new THREE.Vector3(0.6, 0.4, 1).normalize(),
  // 窗：从户外略偏右上看，看得出开启扇的进深
  window: new THREE.Vector3(0.38, 0.18, 1).normalize(),
  // 门：从室内正前方略偏右上看
  door: new THREE.Vector3(0.26, 0.08, 1).normalize(),
}

/** 渲染（或取缓存）一张预览图 */
export function renderPreview(p: SitePreview): string {
  const key = previewKey(p)
  if (p.t === 'fence') return renderThumb(key, () => previewObject(p), { dir: DIRS.fence, margin: 0.85 })
  if (p.t === 'car') return renderThumb(key, () => previewObject(p), { dir: DIRS.car, margin: 1.02 })
  if (p.t === 'window')
    return renderThumb(key, () => previewObject(p), {
      dir: DIRS.window,
      margin: 0.95,
      box: () => new THREE.Box3(new THREE.Vector3(-PV_W / 2 - (p.shutters ? 70 : 18), -14, -10), new THREE.Vector3(PV_W / 2 + (p.shutters ? 70 : 18), PV_H + 12, 30)),
    })
  if (p.t === 'door') {
    const W = doorPreviewWidth(p) + (p.kind === 'sliding' && p.style === 'barn' ? 20 : 0)
    return renderThumb(key, () => previewObject(p), {
      dir: DIRS.door,
      margin: 0.95,
      box: () => new THREE.Box3(new THREE.Vector3(-W / 2 - 12, -4, -8), new THREE.Vector3(W / 2 + 12, PV_DOOR_H + 14 + (p.lites === 'top' || p.lites === 'both' ? 26 : 0), 14)),
    })
  }
  const focus = p.focus
  return renderThumb(key, () => previewObject(p), {
    dir: DIRS[focus],
    margin: focus === 'roof' ? 0.9 : focus === 'entrance' ? 0.95 : focus === 'cover' ? 0.8 : 0.7,
    box:
      focus === 'roof'
        ? undefined
        : () => {
            // 平面坐标 → 3D：x 不变，平面 y = 3D z；抬起了 -BASE
            const y0 = -BASE
            if (focus === 'entrance') return new THREE.Box3(new THREE.Vector3(450, 0, 380), new THREE.Vector3(730, y0 + 290, 600))
            if (focus === 'cover') return new THREE.Box3(new THREE.Vector3(-70, y0 + 240, 120), new THREE.Vector3(300, y0 + 380, 470))
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
