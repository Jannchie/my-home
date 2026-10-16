<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ContextMenu, { type MenuEntry } from './ContextMenu.vue'
import { ICONS } from '../ui/icons'
import { overlays } from '../ui/feedback'
import { saved } from '../saved'
import { device, layout, LONG_PRESS_MS, TAP_SLOP } from '../ui/device'
import {
  ROOM_KINDS,
  add,
  bbox,
  dist,
  dot,
  edgeInfo,
  fmtRoomArea,
  area,
  labelPointAvoiding,
  pointInPolygon,
  mul,
  projectToSegment,
  rectPoints,
  rotFacingWall,
  fixtureBox,
  fixtureDepth,
  FIXTURES,
  frontBox,
  isAxisEdge,
  isAxisRect,
  polyPath,
  sub,
  type Fixture,
  type Opening,
  type Room,
  type RoomKind,
  type Vec,
} from '../model'
import { isIndoor, wallSegments, wallThicknessAt } from '../walls'
import { tatamiLayout } from '../tatami'
import FixtureGlyph from './FixtureGlyph.vue'
import { roomName, t } from '../i18n'
import { ASSET_MAP } from '../three/assets'
import { effectivePalette } from '../three/colors'
import { isTyping } from '../dom'
import {
  addFixture,
  addOpening,
  addRoom,
  checkpoint,
  deleteSelection,
  duplicateSelection,
  mutate,
  rotateSelectedFixture,
  findFixture,
  findRoom,
  insertVertex,
  placeKind,
  plan,
  selection,
  settings,
  settle,
  tool,
} from '../store'

const svg = ref<SVGSVGElement>()
const size = reactive({ w: 800, h: 600 })
/** screen = world * s + (x, y) */
const view = reactive({ x: 80, y: 80, s: 0.6 })

const cursor = ref<Vec | null>(null)
const guides = ref<{ x?: number; y?: number }>({})
const draft = ref<Vec[]>([])
const spaceDown = ref(false)

/**
 * 拖动状态。pan 的 tap：没怎么动就松手时执行（触屏上单指拖空白是平移，点按才是放门窗 / 加顶点 / 取消选中）。
 * 编辑类拖动带 orig：双指捏合打断时还原。
 */
type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number; tap?: () => void; menu?: { x: number; y: number; hit: DOMStringMap | null } }
  | { kind: 'room'; id: string; start: Vec; orig: Vec[] }
  | { kind: 'vertex'; roomId: string; index: number; orig: Vec }
  | { kind: 'edge'; roomId: string; index: number; start: Vec; orig: Vec[] }
  | { kind: 'opening'; id: string; orig: Pick<Opening, 'roomId' | 'edge' | 'offset'> }
  | { kind: 'fixture'; id: string; start: Vec; orig: Vec }
  | { kind: 'rect'; start: Vec; end: Vec }
const drag = ref<Drag | null>(null)

// ---------- 触控：多指、长按、点按阈值 ----------
/** 当前按下的指针（屏幕坐标），两指时进入捏合缩放 / 平移 */
const pointers = new Map<number, { x: number; y: number }>()
let pinch: { d0: number; s0: number; world: Vec } | null = null
/** 一次手势里出现过多指（或长按弹了菜单）：剩下的手指不再触发任何编辑，直到全部松开 */
let gestureSpent = false
/** 按下的位置与是否已经超出点按阈值（超出之前不移动物体，避免手指抖动把东西推歪） */
let downAt: { x: number; y: number; moved: boolean; slop: number } | null = null
let lpTimer = 0
/** 最近一次是手指 / 笔操作：放大顶点、边、门窗的命中范围 */
const touchUI = ref(device.coarse)
const hitPx = (mouse: number, touch: number) => px(touchUI.value ? touch : mouse)

const px = (n: number) => n / view.s // 屏幕像素 → 世界单位


// ---------- 坐标与吸附 ----------

function toWorld(e: { clientX: number; clientY: number }): Vec {
  const r = svg.value!.getBoundingClientRect()
  return { x: (e.clientX - r.left - view.x) / view.s, y: (e.clientY - r.top - view.y) / view.s }
}

function snapVertices(exclude?: { roomId: string; index?: number }) {
  const out: Vec[] = []
  for (const r of plan.value.rooms) {
    r.points.forEach((p, i) => {
      if (exclude && r.id === exclude.roomId && (exclude.index === undefined || exclude.index === i)) return
      out.push(p)
    })
  }
  return out
}

function snapGrid(v: number) {
  const g = settings.grid
  return settings.snap && g > 0 ? Math.round(v / g) * g : Math.round(v)
}

/** 吸附：顶点 > 与其他顶点对齐 x/y > 网格 */
function snapPoint(p: Vec, exclude?: { roomId: string; index?: number }): Vec {
  guides.value = {}
  if (!settings.snap) return { x: Math.round(p.x), y: Math.round(p.y) }
  const thr = px(10)
  const vs = snapVertices(exclude)
  let best: Vec | null = null
  let bd = thr
  for (const v of vs) {
    const d = dist(v, p)
    if (d < bd) {
      bd = d
      best = v
    }
  }
  if (best) {
    guides.value = { x: best.x, y: best.y }
    return { ...best }
  }
  let x = snapGrid(p.x)
  let y = snapGrid(p.y)
  let dx = thr
  let dy = thr
  for (const v of vs) {
    if (Math.abs(v.x - p.x) < dx) {
      dx = Math.abs(v.x - p.x)
      x = v.x
      guides.value.x = v.x
    }
    if (Math.abs(v.y - p.y) < dy) {
      dy = Math.abs(v.y - p.y)
      y = v.y
      guides.value.y = v.y
    }
  }
  return { x, y }
}

function nearestEdge(p: Vec, maxPx = 16) {
  let best: { room: Room; edge: number; t: number; d: number } | null = null
  for (const r of plan.value.rooms) {
    for (let i = 0; i < r.points.length; i++) {
      const e = edgeInfo(r.points, i)
      const pr = projectToSegment(p, e.a, e.b)
      if (pr.d < px(maxPx) && (!best || pr.d < best.d)) best = { room: r, edge: i, t: pr.t, d: pr.d }
    }
  }
  return best
}

function clampOffset(o: { offset: number; width: number }, L: number) {
  if (L <= o.width) return L / 2
  return Math.max(o.width / 2, Math.min(L - o.width / 2, o.offset))
}

// ---------- 指针 ----------

function hitOf(e: Event) {
  const el = (e.target as Element).closest('[data-hit]') as HTMLElement | null
  return el?.dataset ?? null
}

/** 平移拖动；tap 是「没动就松手」时要做的事 */
function startPan(e: PointerEvent, tap?: () => void) {
  drag.value = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, tap }
}

/** 编辑中的拖动被打断（捏合 / 长按菜单）：还原到按下时的样子，丢掉刚记的撤销点 */
function abortDrag() {
  const d = drag.value
  drag.value = null
  guides.value = {}
  if (!d || d.kind === 'pan' || d.kind === 'rect') return
  if (d.kind === 'room' || d.kind === 'edge') {
    const r = findRoom(d.kind === 'room' ? d.id : d.roomId)
    if (r) r.points = d.orig.map((p) => ({ ...p }))
  } else if (d.kind === 'vertex') {
    const r = findRoom(d.roomId)
    if (r) r.points[d.index] = { ...d.orig }
  } else if (d.kind === 'fixture') {
    const f = findFixture(d.id)
    if (f) Object.assign(f, d.orig)
  } else if (d.kind === 'opening') {
    const o = plan.value.openings.find((x) => x.id === d.id)
    if (o) Object.assign(o, d.orig)
  }
  settle()
}

/** 按命中的元素设置选中 */
function selectHit(h: DOMStringMap) {
  if (h.hit === 'room') selection.value = { type: 'room', id: h.id! }
  else if (h.hit === 'fixture') selection.value = { type: 'fixture', id: h.id! }
  else if (h.hit === 'opening') selection.value = { type: 'opening', id: h.id! }
  else if (h.hit === 'vertex') selection.value = { type: 'vertex', roomId: h.room!, index: Number(h.index) }
  else if (h.hit === 'edge') selection.value = { type: 'room', id: h.room! }
}

function clearLongPress() {
  clearTimeout(lpTimer)
  lpTimer = 0
}

function onPointerDown(e: PointerEvent) {
  stopAnim()
  svg.value!.setPointerCapture(e.pointerId)
  const touch = e.pointerType !== 'mouse'
  touchUI.value = touch || device.coarse
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  // 第二根手指：打断正在进行的编辑，进入捏合缩放 + 双指平移
  if (pointers.size === 2) {
    clearLongPress()
    abortDrag()
    startPinch()
    gestureSpent = true
    return
  }
  if (pointers.size > 2 || gestureSpent) return
  downAt = { x: e.clientX, y: e.clientY, moved: false, slop: touch ? TAP_SLOP : 3 }
  if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown.value)) {
    // 右键：拖动是平移，没拖就松手弹出快捷菜单
    startPan(e)
    if (e.button === 2 && drag.value?.kind === 'pan') drag.value.menu = { x: e.clientX, y: e.clientY, hit: tool.value === 'select' ? hitOf(e) : null }
    return
  }
  if (e.button !== 0) return
  const w = toWorld(e)

  if (tool.value === 'select') {
    const hit = hitOf(e)
    if (!hit) {
      // 空白处：拖动平移画布，点按取消选中
      startPan(e, () => (selection.value = null))
      return
    }
    // 触屏长按：选中并弹出快捷菜单（复制 / 删除 / 旋转…）
    if (touch) {
      clearLongPress()
      const at = { x: e.clientX, y: e.clientY }
      lpTimer = window.setTimeout(() => {
        lpTimer = 0
        if (pointers.size !== 1 || downAt?.moved) return
        abortDrag()
        selectHit(hit)
        gestureSpent = true
        openMenu(at.x, at.y)
        navigator.vibrate?.(10)
      }, LONG_PRESS_MS)
      // 触屏：没选中的房间 / 设备 / 门窗，拖动是平移画布、点按才选中（放大后满屏都是房间，不然没法单指平移）；
      // 选中之后再按住拖动才移动它。顶点和边只在选中的房间上出现，可以直接拖。
      if ((hit.hit === 'room' || hit.hit === 'fixture' || hit.hit === 'opening') && !isSel(hit.hit, hit.id!)) {
        startPan(e, () => selectHit(hit))
        return
      }
    }
    if (hit.hit === 'vertex') {
      const index = Number(hit.index)
      selection.value = { type: 'vertex', roomId: hit.room!, index }
      checkpoint()
      drag.value = { kind: 'vertex', roomId: hit.room!, index, orig: { ...findRoom(hit.room!)!.points[index] } }
    } else if (hit.hit === 'edge') {
      const r = findRoom(hit.room!)!
      checkpoint()
      drag.value = { kind: 'edge', roomId: r.id, index: Number(hit.index), start: w, orig: r.points.map((p) => ({ ...p })) }
    } else if (hit.hit === 'fixture') {
      const f = findFixture(hit.id!)!
      selection.value = { type: 'fixture', id: f.id }
      checkpoint()
      drag.value = { kind: 'fixture', id: f.id, start: w, orig: { x: f.x, y: f.y } }
    } else if (hit.hit === 'opening') {
      const o = plan.value.openings.find((x) => x.id === hit.id)!
      selection.value = { type: 'opening', id: hit.id! }
      checkpoint()
      drag.value = { kind: 'opening', id: hit.id!, orig: { roomId: o.roomId, edge: o.edge, offset: o.offset } }
    } else if (hit.hit === 'room') {
      const r = findRoom(hit.id!)!
      selection.value = { type: 'room', id: r.id }
      checkpoint()
      drag.value = { kind: 'room', id: r.id, start: w, orig: r.points.map((p) => ({ ...p })) }
    }
    return
  }

  if (tool.value === 'rect') {
    const p = snapPoint(w)
    drag.value = { kind: 'rect', start: p, end: p }
    return
  }

  if (tool.value === 'poly') {
    // 触屏：点按加点，拖动是平移（不然一碰屏幕就多出一个顶点）
    if (touch) startPan(e, () => addPolyPoint(w, false))
    else addPolyPoint(w, e.shiftKey)
    return
  }

  // 触屏：放门窗 / 设备也是点按（松手时）才放，拖动是平移
  if (touch && (tool.value === 'fixture' || tool.value === 'door' || tool.value === 'window')) {
    startPan(e, () => placeAt(w))
    return
  }
  placeAt(w)
}

function addPolyPoint(w: Vec, shift: boolean) {
  let p = snapPoint(w)
  if (shift && draft.value.length) p = orthoFrom(draft.value[draft.value.length - 1], p)
  if (draft.value.length >= 3 && dist(p, draft.value[0]) < hitPx(12, 24)) {
    finishPoly()
    return
  }
  const last = draft.value[draft.value.length - 1]
  if (!last || dist(last, p) > 0.5) draft.value.push(p)
  cursor.value = p
}

/** 放设备 / 门 / 窗 */
function placeAt(w: Vec) {
  if (tool.value === 'fixture') {
    // 靠近轴向墙时贴墙放（按该处墙厚让开），否则原地放
    const kind = placeKind.value
    const spec = FIXTURES[kind]
    const base = kind === 'kitchen' ? { kind, variant: 'wall' as const } : { kind, d: spec.d }
    const d = fixtureDepth(base)
    let f: Omit<Fixture, 'id'> = { ...base, x: snapGrid(w.x), y: snapGrid(w.y), w: spec.w, rot: 0 }
    const ne = nearestEdge(w, 40)
    if (ne) {
      const e = edgeInfo(ne.room.points, ne.edge)
      if (isAxisEdge(e)) {
        // 贴的是这面墙「另一侧」还是本侧，取光标所在一侧
        const side = dot(sub(w, add(e.a, mul(e.dir, ne.t))), e.out) > 0 ? -1 : 1
        const wallDir = mul(e.out, side) // 从设备指向墙
        const onEdge = add(e.a, mul(e.dir, snapGrid(ne.t)))
        const t = wallThicknessAt(plan.value, onEdge, e.out, ne.room)
        const c = add(onEdge, mul(wallDir, -(t / 2 + d / 2)))
        f = { ...f, x: c.x, y: c.y, rot: rotFacingWall(wallDir) }
      }
    }
    addFixture(f)
    tool.value = 'select'
    return
  }

  if (tool.value === 'door' || tool.value === 'window') {
    const ne = nearestEdge(w, touchUI.value ? 40 : 24)
    if (!ne) return
    const L = edgeInfo(ne.room.points, ne.edge).length
    const width = tool.value === 'door' ? 80 : 150
    if (L < 40) return
    const ow = Math.min(width, L - 10)
    addOpening({
      kind: tool.value,
      roomId: ne.room.id,
      edge: ne.edge,
      offset: clampOffset({ offset: snapGrid(ne.t), width: ow }, L),
      width: ow,
      hinge: 'start',
      swing: 'in',
    })
    tool.value = 'select'
  }
}

function orthoFrom(a: Vec, p: Vec): Vec {
  return Math.abs(p.x - a.x) > Math.abs(p.y - a.y) ? { x: p.x, y: a.y } : { x: a.x, y: p.y }
}

function startPinch() {
  const [a, b] = [...pointers.values()]
  const r = svg.value!.getBoundingClientRect()
  const mx = (a.x + b.x) / 2 - r.left
  const my = (a.y + b.y) / 2 - r.top
  pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), s0: view.s, world: { x: (mx - view.x) / view.s, y: (my - view.y) / view.s } }
}

function onPointerMove(e: PointerEvent) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  // 捏合：两指距离定缩放，两指中点定平移（按下时中点下的那一点始终跟着中点走）
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const r = svg.value!.getBoundingClientRect()
    const mx = (a.x + b.x) / 2 - r.left
    const my = (a.y + b.y) / 2 - r.top
    const s = Math.min(8, Math.max(0.05, (pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d0))
    view.s = s
    view.x = mx - pinch.world.x * s
    view.y = my - pinch.world.y * s
    return
  }
  if (gestureSpent) return
  if (downAt && !downAt.moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > downAt.slop) {
    downAt.moved = true
    clearLongPress()
  }
  const w = toWorld(e)
  const d = drag.value
  // 编辑拖动：超出点按阈值之前不动（点选 / 长按时手指的轻微抖动不改东西）
  if (d && d.kind !== 'pan' && d.kind !== 'rect' && downAt && !downAt.moved) return
  if (d?.kind === 'pan') {
    view.x = d.ox + e.clientX - d.sx
    view.y = d.oy + e.clientY - d.sy
    return
  }
  if (!d) {
    guides.value = {}
    updateHover(e)
    if (tool.value === 'rect' || tool.value === 'poly') {
      let p = snapPoint(w)
      if (tool.value === 'poly' && e.shiftKey && draft.value.length) p = orthoFrom(draft.value[draft.value.length - 1], p)
      cursor.value = p
    } else cursor.value = w
    return
  }
  cursor.value = w

  if (d.kind === 'rect') {
    d.end = snapPoint(w)
  } else if (d.kind === 'room') {
    const r = findRoom(d.id)
    if (!r) return
    const delta = sub(w, d.start)
    // 以离光标最近的顶点为锚点吸附
    let anchor = 0
    let ad = Infinity
    d.orig.forEach((p, i) => {
      const dd = dist(p, d.start)
      if (dd < ad) {
        ad = dd
        anchor = i
      }
    })
    const target = snapPoint(add(d.orig[anchor], delta), { roomId: r.id })
    const sd = sub(target, d.orig[anchor])
    r.points = d.orig.map((p) => add(p, sd))
  } else if (d.kind === 'vertex') {
    const r = findRoom(d.roomId)
    if (!r) return
    r.points[d.index] = snapPoint(w, { roomId: r.id, index: d.index })
  } else if (d.kind === 'edge') {
    const r = findRoom(d.roomId)
    if (!r) return
    const n = d.orig.length
    const e0 = edgeInfo(d.orig, d.index)
    const nrm = e0.out
    let k = dot(sub(w, d.start), nrm)
    // 轴对齐的边：沿法线方向的坐标单独吸附
    const mid = mul(add(e0.a, e0.b), 0.5)
    const moved = add(mid, mul(nrm, k))
    guides.value = {}
    if (Math.abs(nrm.x) > 0.999) {
      const sx = snapAxis(moved.x, 'x', r.id)
      k = (sx - mid.x) / nrm.x
    } else if (Math.abs(nrm.y) > 0.999) {
      const sy = snapAxis(moved.y, 'y', r.id)
      k = (sy - mid.y) / nrm.y
    } else k = snapGrid(k)
    const off = mul(nrm, k)
    const pts = d.orig.map((p) => ({ ...p }))
    pts[d.index] = add(d.orig[d.index], off)
    pts[(d.index + 1) % n] = add(d.orig[(d.index + 1) % n], off)
    r.points = pts
  } else if (d.kind === 'fixture') {
    const f = findFixture(d.id)
    if (!f) return
    f.x = d.orig.x + snapGrid(w.x - d.start.x)
    f.y = d.orig.y + snapGrid(w.y - d.start.y)
  } else if (d.kind === 'opening') {
    const o = plan.value.openings.find((o) => o.id === d.id)
    if (!o) return
    const ne = nearestEdge(w, 40)
    if (ne) {
      o.roomId = ne.room.id
      o.edge = ne.edge
      o.offset = clampOffset({ offset: snapGrid(ne.t), width: o.width }, edgeInfo(ne.room.points, ne.edge).length)
    }
  }
}

function snapAxis(v: number, axis: 'x' | 'y', excludeRoom: string) {
  if (!settings.snap) return Math.round(v)
  const thr = px(10)
  let best = snapGrid(v)
  let bd = thr
  for (const p of snapVertices({ roomId: excludeRoom })) {
    const d = Math.abs(p[axis] - v)
    if (d < bd) {
      bd = d
      best = p[axis]
      guides.value = { [axis]: p[axis] }
    }
  }
  return best
}

// ---------- 指北针：右上角，拖动旋转设置户型朝向（plan.north），双击回到上北 ----------
const northDeg = computed(() => plan.value.north ?? 0)
const NORTH_R = 22
const northAt = computed(() => ({ x: size.w - NORTH_R - 18, y: NORTH_R + 18 }))
let northDrag = false
function northFromEvent(e: PointerEvent) {
  const r = svg.value!.getBoundingClientRect()
  const dx = e.clientX - r.left - northAt.value.x
  const dy = e.clientY - r.top - northAt.value.y
  if (Math.hypot(dx, dy) < 4) return
  const step = e.shiftKey ? 15 : 1
  const a = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI) / step) * step
  plan.value.north = ((a % 360) + 360) % 360
}
function onNorthDown(e: PointerEvent) {
  if (e.button !== 0) return
  checkpoint()
  northDrag = true
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}
function onNorthMove(e: PointerEvent) {
  if (northDrag) northFromEvent(e)
}
function onNorthUp() {
  northDrag = false
}
function resetNorth() {
  if (!plan.value.north) return
  checkpoint()
  plan.value.north = 0
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  clearLongPress()
  if (pinch) {
    if (pointers.size < 2) pinch = null
    if (!pointers.size) gestureSpent = false
    return
  }
  if (gestureSpent) {
    if (!pointers.size) gestureSpent = false
    return
  }
  const tapped = !!downAt && !downAt.moved && e.type !== 'pointercancel'
  downAt = null
  const d = drag.value
  drag.value = null
  guides.value = {}
  if (!d) return
  if (d.kind === 'pan') {
    if (tapped && d.menu) {
      // 右键点按：选中指到的东西并弹出快捷菜单
      const h = d.menu.hit
      if (h) {
        selectHit(h)
        openMenu(d.menu.x, d.menu.y)
      }
    } else if (tapped) d.tap?.()
    return
  }
  if (d.kind === 'rect') {
    const w = Math.abs(d.end.x - d.start.x)
    const h = Math.abs(d.end.y - d.start.y)
    if (w >= 30 && h >= 30) {
      const x0 = Math.min(d.start.x, d.end.x)
      const y0 = Math.min(d.start.y, d.end.y)
      addRoom({ name: ROOM_KINDS.western.label, kind: 'western', points: rectPoints(x0, y0, x0 + w, y0 + h) })
      tool.value = 'select'
    }
    return
  }
  settle()
}

function finishPoly() {
  const pts = draft.value
  draft.value = []
  if (pts.length >= 3) {
    addRoom({ name: ROOM_KINDS.ldk.label, kind: 'ldk', points: pts })
    tool.value = 'select'
  }
}

function onDblClick(e: MouseEvent) {
  if (tool.value === 'poly') {
    finishPoly()
    return
  }
  if (tool.value !== 'select') return
  const hit = hitOf(e)
  if (hit?.hit !== 'edge') return
  const r = findRoom(hit.room!)
  if (!r) return
  const k = Number(hit.index)
  const e0 = edgeInfo(r.points, k)
  const p = projectToSegment(toWorld(e), e0.a, e0.b).point
  checkpoint()
  insertVertex(r, k, { x: snapGrid(p.x), y: snapGrid(p.y) })
  selection.value = { type: 'vertex', roomId: r.id, index: k + 1 }
}

/** 以屏幕点 (mx, my) 为中心缩放到 ns */
function zoomAt(mx: number, my: number, ns: number) {
  ns = Math.min(8, Math.max(0.05, ns))
  view.x = mx - ((mx - view.x) * ns) / view.s
  view.y = my - ((my - view.y) * ns) / view.s
  view.s = ns
}

/**
 * 滚轮 / 触控板：
 *   - 鼠标滚轮（整格、像素量大）：以光标为中心缩放；
 *   - 触控板捏合（浏览器报成 ctrlKey + 小幅 deltaY）：缩放，灵敏度更高；
 *   - 触控板双指滑动（有横向分量或小幅连续像素量）：平移画布。
 */
function onWheel(e: WheelEvent) {
  stopAnim()
  const r = svg.value!.getBoundingClientRect()
  const mx = e.clientX - r.left
  const my = e.clientY - r.top
  if (e.ctrlKey) {
    // 捏合的 deltaY 很小；Ctrl + 鼠标滚轮一格是 100 左右，限一下幅度免得一下跳太多
    zoomAt(mx, my, view.s * Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) * 0.01))
    return
  }
  const trackpad = e.deltaMode === 0 && (e.deltaX !== 0 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY * 2)))
  if (trackpad) {
    view.x -= e.deltaX
    view.y -= e.deltaY
    return
  }
  zoomAt(mx, my, view.s * Math.exp(-e.deltaY * 0.0015))
}

// ---------- 视图动画：适应视图、缩放按钮平滑过渡 ----------
let animId = 0
function stopAnim() {
  cancelAnimationFrame(animId)
}
function animateTo(to: { x: number; y: number; s: number }, ms = 260) {
  stopAnim()
  const from = { x: view.x, y: view.y, s: view.s }
  // 系统要求减少动效时直接到位
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ms = 0
  const t0 = performance.now()
  const step = () => {
    const k = ms ? Math.min(1, (performance.now() - t0) / ms) : 1
    const e = 1 - Math.pow(1 - k, 3)
    // 缩放按对数插值，平移按「世界中心点」插值，过渡看起来是匀速推拉
    const s = from.s * Math.pow(to.s / from.s, e)
    const cx = (size.w / 2 - from.x) / from.s + ((size.w / 2 - to.x) / to.s - (size.w / 2 - from.x) / from.s) * e
    const cy = (size.h / 2 - from.y) / from.s + ((size.h / 2 - to.y) / to.s - (size.h / 2 - from.y) / from.s) * e
    view.s = s
    view.x = size.w / 2 - cx * s
    view.y = size.h / 2 - cy * s
    if (k < 1) animId = requestAnimationFrame(step)
  }
  step()
}

function fitTarget() {
  const pts = plan.value.rooms.flatMap((r) => r.points)
  if (!pts.length) return { s: 0.6, x: size.w / 2, y: size.h / 2 }
  const b = bbox(pts)
  // 四周留白；手机上右侧有缩放条、上方有指北针和提示、下方压着底部抽屉，按实际可见区域取景
  const pad = device.compact
    ? { l: 20, r: 64, t: 64, b: (device.landscape ? 0 : layout.sheetH) + 24 }
    : { l: 70, r: 70, t: 70, b: 70 }
  const aw = Math.max(40, size.w - pad.l - pad.r)
  const ah = Math.max(40, size.h - pad.t - pad.b)
  const s = Math.min(4, Math.min(aw / (b.x1 - b.x0 || 1), ah / (b.y1 - b.y0 || 1)))
  return { s, x: pad.l + (aw - (b.x1 - b.x0) * s) / 2 - b.x0 * s, y: pad.t + (ah - (b.y1 - b.y0) * s) / 2 - b.y0 * s }
}

/** 适应视图；instant 用于首次挂载（没有可过渡的起点） */
function fit(instant = false) {
  const to = fitTarget()
  if (instant) {
    stopAnim()
    Object.assign(view, to)
  } else animateTo(to)
}

/** 缩放按钮：以画布中心为基准，平滑过渡 */
function zoomBy(f: number) {
  const ns = Math.min(8, Math.max(0.05, view.s * f))
  const cx = size.w / 2
  const cy = size.h / 2
  animateTo({ s: ns, x: cx - ((cx - view.x) * ns) / view.s, y: cy - ((cy - view.y) * ns) / view.s }, 180)
}
/** 点百分比：回到 100% */
function zoomReset() {
  zoomBy(1 / view.s)
}

// ---------- 悬停高亮：选择工具下指到的房间描一圈 ----------
const hoverRoomId = ref<string | null>(null)
const hoverRoom = computed(() => (hoverRoomId.value && hoverRoomId.value !== selectedRoom.value?.id ? findRoom(hoverRoomId.value) ?? null : null))
function updateHover(e: PointerEvent) {
  let id: string | null = null
  if (tool.value === 'select' && !spaceDown.value) {
    const h = hitOf(e)
    id = h?.hit === 'room' ? h.id ?? null : h?.hit === 'edge' || h?.hit === 'vertex' ? h.room ?? null : null
  }
  if (id !== hoverRoomId.value) hoverRoomId.value = id
}

// ---------- 键盘：空格平移、Esc ----------

function onKeyDown(e: KeyboardEvent) {
  // 快捷键帮助 / 我的户型 / 确认框开着时，画布不响应键盘
  if (isTyping(e) || overlays.help || saved.panelOpen || saved.confirm) return
  if (e.code === 'Space') {
    spaceDown.value = true
    e.preventDefault()
  }
  if (e.key === 'Escape') {
    if (draft.value.length) draft.value = []
    else if (tool.value !== 'select') tool.value = 'select'
    else selection.value = null
  }
  if (e.key === 'Enter' && tool.value === 'poly') finishPoly()
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = false
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([entry]) => {
    size.w = entry.contentRect.width
    size.h = entry.contentRect.height
  })
  ro.observe(svg.value!)
  const r = svg.value!.getBoundingClientRect()
  size.w = r.width
  size.h = r.height
  fit(true)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

// ---------- 渲染数据 ----------

const gridStep = computed(() => {
  // 网格随缩放换挡，保持屏幕间距 ≥ 8px
  for (const g of [10, 50, 100, 500, 1000]) if (g * view.s >= 8) return g
  return 1000
})

const selectedRoom = computed(() => {
  const s = selection.value
  if (s?.type === 'room') return findRoom(s.id) ?? null
  if (s?.type === 'vertex') return findRoom(s.roomId) ?? null
  return null
})

/** 地面图案：水回り铺瓷砖，玄関土间斜线，阳台大块地砖 */
const FLOOR_PATTERN: Partial<Record<RoomKind, string>> = {
  bath: 'url(#tile-s)',
  wash: 'url(#tile)',
  toilet: 'url(#tile)',
  entrance: 'url(#doma)',
  balcony: 'url(#tile-l)',
}
/** 画挂衣杆的收纳（鞋柜、布草间、洗衣机位不画） */
const CLOSET_NAMES = ['クローゼット', 'WIC', '収納', '押入']

function closetLines(r: Room): string[] {
  if (r.kind !== 'storage' || !CLOSET_NAMES.includes(r.name) || !isAxisRect(r.points)) return []
  const b = bbox(r.points)
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const horiz = w >= h
  const [lo, hi, a0, a1] = horiz ? [b.y0, b.y1, b.x0 + 10, b.x1 - 10] : [b.x0, b.x1, b.y0 + 10, b.y1 - 10]
  // 进深小于 110：中间一根挂衣杆；WIC：两侧墙各一根
  const at = hi - lo < 110 ? [(lo + hi) / 2] : [lo + 40, hi - 40]
  return at.map((k) => (horiz ? `M${a0},${k}L${a1},${k}` : `M${k},${a0}L${k},${a1}`))
}

const roomViews = computed(() =>
  plan.value.rooms.map((r) => {
    const a = area(r.points)
    let mats: ReturnType<typeof tatamiLayout> = []
    if (r.kind === 'japanese' && isAxisRect(r.points)) {
      const b = bbox(r.points)
      const k = plan.value.wall / 2
      mats = tatamiLayout(b.x0 + k, b.y0 + k, b.x1 - k, b.y1 - k)
    }
    return {
      room: r,
      d: polyPath(r.points),
      fill: ROOM_KINDS[r.kind]?.fill ?? '#eee',
      pattern: FLOOR_PATTERN[r.kind],
      mats,
      closet: closetLines(r),
      label: labelPointAvoiding(
        r.points,
        plan.value.fixtures.filter((f) => pointInPolygon({ x: f.x, y: f.y }, r.points)).map(fixtureBox),
      ),
      sub: r.kind === 'balcony' ? '' : fmtRoomArea(a, plan.value.region),
    }
  }),
)

/** 墙段：外墙 / 隔墙 / 玄関敞开处的上り框 */
const wallViews = computed(() => {
  const segs = wallSegments(plan.value.rooms)
  const path = (kind: string) =>
    segs
      .filter((s) => s.kind === kind)
      .map((s) => `M${s.a.x},${s.a.y}L${s.b.x},${s.b.y}`)
      .join('')
  return { outer: path('outer'), inner: path('inner'), open: path('open') }
})

interface OpeningView {
  o: Opening
  /** 遮住墙的矩形 */
  gap: string
  /** 门扇 / 窗线 */
  leaf: string
  arc: string
  glass: string[]
  /** 引き戸 / 掃き出し窓的两扇板 */
  panels: string[]
  /** 掃き出し窓（朝阳台的落地窗）：板子画成玻璃色 */
  sash: boolean
  /** 折れ戸的折线 */
  fold: string
}

const openingViews = computed<OpeningView[]>(() => {
  const out: OpeningView[] = []
  for (const o of plan.value.openings) {
    const r = findRoom(o.roomId)
    if (!r || o.edge >= r.points.length) continue
    const e = edgeInfo(r.points, o.edge)
    const c = clampOffset(o, e.length)
    const w = Math.min(o.width, e.length)
    const p0 = add(e.a, mul(e.dir, c - w / 2))
    const p1 = add(e.a, mul(e.dir, c + w / 2))
    const center = add(e.a, mul(e.dir, c))
    // 开口处的墙厚：外墙厚、隔墙薄
    const wall = wallThicknessAt(plan.value, center, e.out, r)
    const h = wall / 2 + 1
    const gap = polyPath([add(p0, mul(e.out, h)), add(p1, mul(e.out, h)), add(p1, mul(e.out, -h)), add(p0, mul(e.out, -h))])
    // 窗外是阳台 → 掃き出し窓
    const probe = add(center, mul(e.out, wall / 2 + 15))
    const sash = o.kind === 'window' && plan.value.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(probe, x.points))
    const v: OpeningView = { o, gap, leaf: '', arc: '', glass: [], panels: [], sash, fold: '' }
    if (o.kind === 'sliding' || sash) {
      // 引き違い：两扇板分别靠墙两侧，在中间重叠一点
      const t = Math.max(2, wall / 4)
      const mid = add(p0, mul(e.dir, w / 2))
      const halves: [Vec, Vec, number][] = [
        [p0, add(mid, mul(e.dir, 4)), t / 2 + 0.5],
        [add(mid, mul(e.dir, -4)), p1, -t / 2 - 0.5],
      ]
      for (const [a, b, k] of halves) {
        v.panels.push(polyPath([add(a, mul(e.out, k + t / 2)), add(b, mul(e.out, k + t / 2)), add(b, mul(e.out, k - t / 2)), add(a, mul(e.out, k - t / 2))]))
      }
    } else if (o.kind === 'folding') {
      // 折れ戸：两扇向开启侧折成 V 字
      const into = o.swing === 'in' ? mul(e.out, -1) : e.out
      const apex = add(add(p0, mul(e.dir, w / 2)), mul(into, w * 0.3))
      v.fold = `M${p0.x},${p0.y}L${apex.x},${apex.y}L${p1.x},${p1.y}`
    } else if (o.kind === 'door') {
      const hingeP = o.hinge === 'start' ? p0 : p1
      const other = o.hinge === 'start' ? p1 : p0
      const sw = o.swing === 'in' ? mul(e.out, -1) : e.out
      const tip = add(hingeP, mul(sw, w))
      const cross = (tip.x - hingeP.x) * (other.y - hingeP.y) - (tip.y - hingeP.y) * (other.x - hingeP.x)
      v.leaf = `M${hingeP.x},${hingeP.y}L${tip.x},${tip.y}`
      v.arc = `M${tip.x},${tip.y}A${w},${w} 0 0 ${cross > 0 ? 1 : 0} ${other.x},${other.y}`
    } else {
      // 腰窗：墙两侧框线 + 中间玻璃线
      const q = wall / 2 - 1
      for (const k of [-q, 0, q]) {
        const a = add(p0, mul(e.out, k))
        const b = add(p1, mul(e.out, k))
        v.glass.push(`M${a.x},${a.y}L${b.x},${b.y}`)
      }
    }
    out.push(v)
  }
  return out
})

const fixtureViews = computed(() =>
  plan.value.fixtures.map((f) => ({
    f,
    transform: `translate(${f.x},${f.y}) rotate(${f.rot})`,
    selected: isSel('fixture', f.id),
    box: fixtureBox(f),
    front: frontBox(f),
  })),
)

/** 家具占地；颜色取当前配色的主色 */
const furnitureViews = computed(() =>
  plan.value.furniture.flatMap((f) => {
    const def = ASSET_MAP.get(f.asset)
    if (!def) return []
    const pal = effectivePalette(def, f.color ?? 0, f.colors)
    return [{ f, w: def.w, d: def.d, mounted: !!def.mount, color: pal[0] ?? '#ddd', transform: `translate(${f.x},${f.y}) rotate(${f.rot})` }]
  }),
)

const balconies = computed(() => roomViews.value.filter((v) => !isIndoor(v.room)))

/** 选中房间的边长标注，放在外侧 */
const dimViews = computed(() => {
  const r = selectedRoom.value
  if (!r) return []
  return r.points.map((_, i) => {
    const e = edgeInfo(r.points, i)
    const m = mul(add(e.a, e.b), 0.5)
    const off = plan.value.wall / 2 + px(14)
    const at = add(m, mul(e.out, off))
    let ang = (Math.atan2(e.dir.y, e.dir.x) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang <= -90) ang += 180
    return { i, e, at, ang, text: Math.round(e.length).toString(), mid: m }
  })
})

const rectDraft = computed(() => {
  const d = drag.value
  if (d?.kind !== 'rect') return null
  const x = Math.min(d.start.x, d.end.x)
  const y = Math.min(d.start.y, d.end.y)
  return { x, y, w: Math.abs(d.end.x - d.start.x), h: Math.abs(d.end.y - d.start.y) }
})

const draftPath = computed(() => {
  if (!draft.value.length) return ''
  const pts = [...draft.value, ...(cursor.value ? [cursor.value] : [])]
  return polyPath(pts, false)
})

const cursorStyle = computed(() => {
  if (drag.value?.kind === 'pan' || spaceDown.value) return drag.value ? 'grabbing' : 'grab'
  if (tool.value !== 'select') return 'crosshair'
  return 'default'
})

const edgeCursor = (e: { dir: Vec }) => (Math.abs(e.dir.x) > 0.999 ? 'ns-resize' : Math.abs(e.dir.y) > 0.999 ? 'ew-resize' : 'move')

const isSel = (type: string, id: string) => {
  const s = selection.value
  return !!s && s.type === type && 'id' in s && s.id === id
}

const cursorInfo = computed(() => (cursor.value ? `${Math.round(cursor.value.x)}, ${Math.round(cursor.value.y)}` : ''))

// ---------- 多边形：触屏上的「撤销一点 / 取消 / 完成」按钮（App.vue） ----------
const draftCount = computed(() => draft.value.length)
function undoPoint() {
  draft.value.pop()
  cursor.value = draft.value[draft.value.length - 1] ?? null
}
function cancelDraft() {
  draft.value = []
  cursor.value = null
  tool.value = 'select'
}

// ---------- 快捷菜单：触屏长按 / 右键点按 ----------
const menu = ref<{ x: number; y: number; items: MenuEntry[]; title?: string } | null>(null)
function openMenu(x: number, y: number) {
  const s = selection.value
  if (!s) return
  const del: MenuEntry = { label: t('删除'), icon: ICONS.delete, keys: 'Del', danger: true, action: deleteSelection }
  let items: MenuEntry[] = []
  let title = ''
  if (s.type === 'room') {
    const r = findRoom(s.id)
    title = r ? roomName(r.name) : ''
    items = [{ label: t('复制'), icon: ICONS.duplicate, keys: 'Ctrl D', action: duplicateSelection }, 'sep', del]
  } else if (s.type === 'fixture') {
    const f = findFixture(s.id)
    title = f ? t(FIXTURES[f.kind].label) : ''
    items = [{ label: t('旋转 90°'), icon: ICONS.rotateCw, keys: 'Q', action: rotateSelectedFixture }, 'sep', del]
  } else if (s.type === 'opening') {
    const o = plan.value.openings.find((x) => x.id === s.id)
    if (!o) return
    const flip = o.kind === 'door' || o.kind === 'folding'
    items = [
      ...(flip
        ? ([
            { label: t('左右翻转'), icon: ICONS.doorFlip, action: () => mutate(() => (o.hinge = o.hinge === 'start' ? 'end' : 'start')) },
            { label: t('内外翻转'), icon: ICONS.doorFlip, action: () => mutate(() => (o.swing = o.swing === 'in' ? 'out' : 'in')) },
            'sep',
          ] as MenuEntry[])
        : []),
      del,
    ]
  } else if (s.type === 'vertex') {
    const r = findRoom(s.roomId)
    items = [{ ...(del as Exclude<MenuEntry, string | { header: string }>), label: t('删除顶点'), disabled: !r || r.points.length <= 3 }]
  }
  if (items.length) menu.value = { x, y, items, title }
}

defineExpose({ fit, zoomBy, zoomReset, exportPng, view, cursorInfo, draftCount, finishPoly, undoPoint, cancelDraft })

// ---------- 导出 PNG ----------

async function exportPng() {
  const pts = plan.value.rooms.flatMap((r) => r.points)
  if (!pts.length || !svg.value) return
  const b = bbox(pts)
  const pad = 60
  const clone = svg.value.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('.ui').forEach((el) => el.remove())
  const world = clone.querySelector('#world') as SVGGElement
  world.removeAttribute('transform')
  const vw = b.x1 - b.x0 + pad * 2
  const vh = b.y1 - b.y0 + pad * 2
  clone.setAttribute('viewBox', `${b.x0 - pad} ${b.y0 - pad} ${vw} ${vh}`)
  const scale = view.s * 2
  clone.setAttribute('width', String(Math.round(vw * scale)))
  clone.setAttribute('height', String(Math.round(vh * scale)))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  // 序列化后的 SVG 拿不到页面 CSS：把当前正文字体栈写到属性上（按语言不同）
  clone.setAttribute('font-family', getComputedStyle(svg.value).fontFamily)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(b.x0 - pad))
  bg.setAttribute('y', String(b.y0 - pad))
  bg.setAttribute('width', String(vw))
  bg.setAttribute('height', String(vh))
  bg.setAttribute('fill', '#fbfaf7')
  world.insertBefore(bg, world.firstChild)
  const src = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `${plan.value.name || 'plan'}.png`
  a.click()
}
</script>

<template>
  <Teleport to="body">
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menu.items" :title="menu.title" @close="menu = null" />
  </Teleport>
  <svg
    ref="svg"
    class="canvas"
    :style="{ cursor: cursorStyle }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="(cursor = drag ? cursor : null), (hoverRoomId = null)"
    @dblclick="onDblClick"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <defs>
      <pattern
        id="grid"
        :width="gridStep * view.s"
        :height="gridStep * view.s"
        patternUnits="userSpaceOnUse"
        :x="view.x"
        :y="view.y"
      >
        <path :d="`M${gridStep * view.s},0L0,0L0,${gridStep * view.s}`" fill="none" stroke="#e7e3da" stroke-width="1" />
      </pattern>
      <pattern
        id="grid-major"
        :width="gridStep * 10 * view.s"
        :height="gridStep * 10 * view.s"
        patternUnits="userSpaceOnUse"
        :x="view.x"
        :y="view.y"
      >
        <path
          :d="`M${gridStep * 10 * view.s},0L0,0L0,${gridStep * 10 * view.s}`"
          fill="none"
          stroke="#d6d0c3"
          stroke-width="1"
        />
      </pattern>
      <!-- 地面图案（世界坐标，单位 cm） -->
      <pattern id="tile" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30,0L0,0L0,30" fill="none" stroke="#a9c3c9" stroke-width="0.8" />
      </pattern>
      <pattern id="tile-s" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20,0L0,0L0,20" fill="none" stroke="#a3c1c8" stroke-width="0.7" />
      </pattern>
      <pattern id="tile-l" width="45" height="45" patternUnits="userSpaceOnUse">
        <path d="M45,0L0,0L0,45" fill="none" stroke="#d4cfc5" stroke-width="0.8" />
      </pattern>
      <pattern id="doma" width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M0,12L12,0" fill="none" stroke="#a49b8c" stroke-width="0.8" />
      </pattern>
      <pattern id="hatch-ps" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="#e3ded5" />
        <path d="M0,7L7,0" fill="none" stroke="#6b665d" stroke-width="0.8" />
      </pattern>
    </defs>
    <rect class="ui" width="100%" height="100%" fill="url(#grid)" />
    <rect class="ui" width="100%" height="100%" fill="url(#grid-major)" />

    <g id="world" :transform="`translate(${view.x},${view.y}) scale(${view.s})`">
      <!-- 房间填充 -->
      <path
        v-for="v in roomViews"
        :key="'f' + v.room.id"
        :d="v.d"
        :fill="v.fill"
        data-hit="room"
        :data-id="v.room.id"
        :style="{ cursor: tool === 'select' ? 'move' : undefined }"
      />
      <!-- 地面：图案、畳、挂衣杆 -->
      <g pointer-events="none">
        <template v-for="v in roomViews" :key="'p' + v.room.id">
          <path v-if="v.pattern" :d="v.d" :fill="v.pattern" />
          <rect
            v-for="(m, i) in v.mats"
            :key="i"
            :x="m.x"
            :y="m.y"
            :width="m.w"
            :height="m.h"
            :fill="m.half ? '#dce4b8' : '#e3e9c6'"
            stroke="#98a476"
            stroke-width="1.2"
          />
          <path v-for="(c, i) in v.closet" :key="'c' + i" :d="c" stroke="#6b665d" stroke-width="1.2" stroke-dasharray="8 5" />
        </template>
      </g>
      <!-- 阳台扶手：粗线上叠一条浅色细线，形成双线 -->
      <g pointer-events="none">
        <path v-for="v in balconies" :key="'b' + v.room.id" :d="v.d" fill="none" stroke="#6b665d" stroke-width="7" />
        <path v-for="v in balconies" :key="'b2' + v.room.id" :d="v.d" fill="none" stroke="#fbfaf7" stroke-width="3.5" />
      </g>
      <!-- 墙：隔墙薄、外墙（躯体）厚；玄関与廊下之间只画上り框 -->
      <g pointer-events="none">
        <path :d="wallViews.inner" stroke="#3a3732" :stroke-width="plan.wall" stroke-linecap="square" />
        <path :d="wallViews.outer" stroke="#22201c" :stroke-width="plan.wallOuter" stroke-linecap="square" />
        <path :d="wallViews.open" stroke="#5a554d" stroke-width="3" />
      </g>
      <!-- 门窗 -->
      <g
        v-for="v in openingViews"
        :key="v.o.id"
        data-hit="opening"
        :data-id="v.o.id"
        :style="{ cursor: tool === 'select' ? 'grab' : undefined }"
      >
        <path :d="v.gap" fill="#fbfaf7" stroke="none" />
        <template v-if="v.o.kind === 'door'">
          <path :d="v.arc" fill="none" stroke="#6b665d" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
          <path :d="v.leaf" fill="none" stroke="#2b2925" :stroke-width="4" stroke-linecap="round" />
        </template>
        <template v-else-if="v.panels.length">
          <path v-for="(g, i) in v.panels" :key="i" :d="g" :fill="v.sash ? '#dceaf0' : '#fff'" stroke="#2b2925" stroke-width="1.5" />
        </template>
        <template v-else-if="v.o.kind === 'folding'">
          <path :d="v.fold" fill="none" stroke="#2b2925" stroke-width="2" stroke-linejoin="round" />
        </template>
        <template v-else>
          <path v-for="(g, i) in v.glass" :key="i" :d="g" fill="none" stroke="#2b2925" :stroke-width="i === 1 ? 2.5 : 1.5" />
        </template>
        <path v-if="isSel('opening', v.o.id)" class="ui" :d="v.gap" fill="none" stroke="#3f6652" :stroke-width="px(2)" />
        <!-- 加粗的点击热区（触屏更粗） -->
        <path :d="v.gap" fill="transparent" stroke="transparent" :stroke-width="hitPx(10, 28)" />
      </g>
      <!-- 家具（3D 沙盘里摆的）：只画占地，不参与编辑 -->
      <g pointer-events="none">
        <g v-for="v in furnitureViews" :key="'u' + v.f.id" :transform="v.transform">
          <rect
            :x="-v.w / 2"
            :y="-v.d / 2"
            :width="v.w"
            :height="v.d"
            :rx="Math.min(8, v.w / 4, v.d / 4)"
            :fill="v.mounted ? 'none' : v.color"
            fill-opacity="0.55"
            stroke="#8a7a70"
            stroke-width="0.8"
            :stroke-dasharray="v.mounted ? '4 3' : undefined"
          />
          <line :x1="-v.w / 2 + 4" :x2="v.w / 2 - 4" :y1="-v.d / 2 + 3" :y2="-v.d / 2 + 3" stroke="#8a7a70" stroke-width="1.2" />
        </g>
      </g>
      <!-- 固定设备（局部坐标，背面朝 -y） -->
      <g
        v-for="v in fixtureViews"
        :key="v.f.id"
        data-hit="fixture"
        :data-id="v.f.id"
        :transform="v.transform"
        :style="{ cursor: tool === 'select' ? 'move' : undefined }"
      >
        <FixtureGlyph :f="v.f" />
      </g>
      <!-- 选中设备：前方使用空间 -->
      <template v-for="v in fixtureViews.filter((x) => x.selected && x.front)" :key="'ff' + v.f.id">
        <rect
          class="ui"
          :x="v.front!.x0"
          :y="v.front!.y0"
          :width="v.front!.x1 - v.front!.x0"
          :height="v.front!.y1 - v.front!.y0"
          fill="rgba(63,102,82,0.08)"
          stroke="#3f6652"
          :stroke-width="px(1)"
          stroke-dasharray="4 3"
          pointer-events="none"
        />
      </template>
      <rect
        v-for="v in fixtureViews.filter((x) => x.selected)"
        :key="'fs' + v.f.id"
        class="ui"
        :x="v.box.x0"
        :y="v.box.y0"
        :width="v.box.x1 - v.box.x0"
        :height="v.box.y1 - v.box.y0"
        fill="none"
        stroke="#3f6652"
        :stroke-width="px(2)"
        pointer-events="none"
      />

      <!-- 房间名 -->
      <g v-for="v in roomViews" :key="'l' + v.room.id" pointer-events="none" class="label">
        <text :x="v.label.x" :y="v.label.y - px(2)" :font-size="px(13)" text-anchor="middle" fill="#2b2925" font-weight="600">
          {{ roomName(v.room.name) }}
        </text>
        <text
          v-if="v.sub"
          :x="v.label.x"
          :y="v.label.y + px(13)"
          :font-size="px(11)"
          text-anchor="middle"
          fill="#6b665d"
          class="num"
        >
          {{ v.sub }}
        </text>
      </g>

      <!-- 悬停的房间：淡淡的底色 + 细描边，提示「点这里会选中它」 -->
      <path
        v-if="hoverRoom && !drag"
        class="ui hover-room"
        :d="polyPath(hoverRoom.points)"
        fill="rgba(87,122,104,0.07)"
        stroke="#577a68"
        :stroke-width="px(1.5)"
        stroke-opacity="0.7"
        pointer-events="none"
      />
      <!-- 选中房间：轮廓、边长、边拖拽、顶点 -->
      <g v-if="selectedRoom" class="ui">
        <path
          :d="polyPath(selectedRoom.points)"
          fill="rgba(63,102,82,0.08)"
          stroke="#3f6652"
          :stroke-width="px(2)"
          pointer-events="none"
        />
        <text
          v-for="d in dimViews"
          :key="'d' + d.i"
          :x="d.at.x"
          :y="d.at.y"
          :font-size="px(11)"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#3f6652"
          class="num"
          :transform="`rotate(${d.ang} ${d.at.x} ${d.at.y})`"
          pointer-events="none"
        >
          {{ d.text }}
        </text>
        <line
          v-for="d in dimViews"
          :key="'e' + d.i"
          :x1="d.e.a.x"
          :y1="d.e.a.y"
          :x2="d.e.b.x"
          :y2="d.e.b.y"
          stroke="transparent"
          :stroke-width="hitPx(12, 30)"
          data-hit="edge"
          :data-room="selectedRoom.id"
          :data-index="d.i"
          :style="{ cursor: edgeCursor(d.e) }"
        />
        <!-- 触屏：顶点外面再垫一圈透明的大热区 -->
        <template v-if="touchUI">
          <circle
            v-for="(p, i) in selectedRoom.points"
            :key="'vh' + i"
            :cx="p.x"
            :cy="p.y"
            :r="px(22)"
            fill="transparent"
            data-hit="vertex"
            :data-room="selectedRoom.id"
            :data-index="i"
          />
        </template>
        <rect
          v-for="(p, i) in selectedRoom.points"
          :key="'v' + i"
          :x="p.x - hitPx(5, 7)"
          :y="p.y - hitPx(5, 7)"
          :width="hitPx(10, 14)"
          :height="hitPx(10, 14)"
          :fill="selection?.type === 'vertex' && selection.index === i ? '#3f6652' : '#fff'"
          stroke="#3f6652"
          :stroke-width="px(1.5)"
          data-hit="vertex"
          :data-room="selectedRoom.id"
          :data-index="i"
          style="cursor: crosshair"
        />
      </g>

      <!-- 对齐参考线 -->
      <g class="ui" pointer-events="none">
        <line
          v-if="guides.x !== undefined"
          :x1="guides.x"
          :x2="guides.x"
          :y1="-view.y / view.s"
          :y2="(size.h - view.y) / view.s"
          stroke="#2b7fd9"
          stroke-width="1"
          stroke-dasharray="6 4"
          vector-effect="non-scaling-stroke"
        />
        <line
          v-if="guides.y !== undefined"
          :y1="guides.y"
          :y2="guides.y"
          :x1="-view.x / view.s"
          :x2="(size.w - view.x) / view.s"
          stroke="#2b7fd9"
          stroke-width="1"
          stroke-dasharray="6 4"
          vector-effect="non-scaling-stroke"
        />
      </g>

      <!-- 绘制中 -->
      <g class="ui" pointer-events="none">
        <template v-if="rectDraft">
          <rect
            :x="rectDraft.x"
            :y="rectDraft.y"
            :width="rectDraft.w"
            :height="rectDraft.h"
            fill="rgba(63,102,82,0.08)"
            stroke="#3f6652"
            :stroke-width="px(1.5)"
          />
          <text
            :x="rectDraft.x + rectDraft.w / 2"
            :y="rectDraft.y - px(8)"
            :font-size="px(12)"
            text-anchor="middle"
            fill="#3f6652"
            class="num"
          >
            {{ rectDraft.w }} × {{ rectDraft.h }}
          </text>
        </template>
        <template v-if="draft.length">
          <path :d="draftPath" fill="none" stroke="#3f6652" :stroke-width="px(1.5)" />
          <circle v-for="(p, i) in draft" :key="i" :cx="p.x" :cy="p.y" :r="px(i === 0 ? 6 : 3.5)" fill="#fff" stroke="#3f6652" :stroke-width="px(1.5)" />
        </template>
        <circle
          v-if="cursor && (tool === 'rect' || tool === 'poly')"
          :cx="cursor.x"
          :cy="cursor.y"
          :r="px(3)"
          fill="#3f6652"
        />
      </g>
    </g>
    <g
      class="north ui"
      :transform="`translate(${northAt.x} ${northAt.y})`"
      @pointerdown.stop.prevent="onNorthDown"
      @pointermove.stop="onNorthMove"
      @pointerup.stop="onNorthUp"
      @pointercancel.stop="onNorthUp"
      @dblclick.stop="resetNorth"
    >
      <title>{{ t('户型朝向 {n}°', { n: Math.round(northDeg) }) }} · {{ t('拖动旋转，Shift 按 15° 吸附，双击回到上北') }}</title>
      <circle :r="NORTH_R" class="north-bg" />
      <g :transform="`rotate(${northDeg})`">
        <path :d="`M0 ${-NORTH_R + 5} L6 3 L0 -1 L-6 3 Z`" class="north-n" />
        <path :d="`M0 ${NORTH_R - 5} L6 3 L0 -1 L-6 3 Z`" class="north-s" />
        <text :y="-NORTH_R - 4" text-anchor="middle" class="north-t">N</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.north {
  cursor: grab;
}
.north:active {
  cursor: grabbing;
}
.north-bg {
  fill: rgba(255, 255, 255, 0.9);
  stroke: var(--border-strong);
}
.north-n {
  fill: #e0607e;
}
.north-s {
  fill: var(--text-faint);
}
.north-t {
  font-size: 10px;
  font-weight: 700;
  fill: var(--text);
  paint-order: stroke;
  stroke: var(--canvas);
  stroke-width: 3px;
}
.canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: var(--canvas);
  touch-action: none;
  user-select: none;
}
.label text {
  paint-order: stroke;
  stroke: rgba(251, 250, 247, 0.7);
  stroke-width: 3px;
  stroke-linejoin: round;
}
</style>
