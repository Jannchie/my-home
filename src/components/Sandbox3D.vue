<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ASSET_MAP, CATEGORY_LABELS, STYLE_LABELS, type StyleTag } from '../three/assets'
import { applyCutaway, bendToWalls, buildHouse, floorY, isPlant, stepCutaway, furnitureModel, placeFurniture, roomAt } from '../three/house'
import { overlapsOthers, snapFurniture, snapToWall, type Guide } from '../snap'
import { fitOnSurface, pickSurface, propsOn, snapToHook } from '../surface'
import { createStage, fitSun, frameCamera, type Stage } from '../three/stage'
import { attachPost, LOOKS, LOOK_MAP, type LookId, type Post } from '../three/post'
import { CITIES, MONTH_DAYS, compassAxes, skyState, type SkyState } from '../three/sky'
import { disposeUnshared } from '../three/toon'
import { useThumbs } from '../three/thumbs'
import { coverInto, liveCapture } from '../three/planThumb'
import { FxLayer } from '../three/fx'
import { ActorLayer } from '../three/actors'
import ColorEditor from './ColorEditor.vue'
import { JIcon } from '@jannchie/icons-vue'
import { CATEGORY_ICONS, ICONS, VIEW_ICONS, WALL_MODE_ICONS } from '../ui/icons'
import { SIZE_LABELS, assetName, browse, canHang, categoriesOf, displayName, formFor, paletteFor, siblings, variantLabel, type Filter, type SizeClass } from '../three/catalog'
import { INTERESTS, KIND_LABELS, ROLE_LABELS, TRAITS, describe } from '../household'
import { checklist, missing } from '../checklist'
import { accentOf } from '../wallpaper'
import { patternPreview } from '../three/fabric'
import type { PatternKind } from '../three/patterns'
import { isTyping } from '../dom'
import { lang, roomName, t, tAuto, tSoft } from '../i18n'
import { bbox, centroid, APPLIANCE_COLORS, FRIDGE_STYLES, WASHER_STYLES, type Fixture, type WallTrim } from '../model'
import {
  addFurniture,
  checkpoint,
  deleteSelection,
  duplicateSelection,
  findFurniture,
  mutate,
  placing,
  plan,
  rotateSelectedFurniture,
  setSelectedFurnitureRotation,
  checkpoint as checkpointPlan,
  swapFurnitureAsset,
  setFurniturePreset,
  previewFurnitureColors,
  commitFurnitureColors,
  applyColorsToSame,
  commitFurniturePatterns,
  sameKind,
  redecorate,
  rerollHousehold,
  fixChecklist,
  setRoomWallpaper,
  rerollWallpapers,
  sandbox,
  selection,
  WALL_MODES,
  settle,
} from '../store'

const host = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
let stage: Stage
/** 画面效果（后处理），选「原样」时不建 composer */
let post: Post
let controls: OrbitControls
let house: THREE.Group | null = null
const furnRoot = new THREE.Group()
/** 蒸汽、烟、火苗等动态特效 */
const fx = new FxLayer()
/** 会活动的宠物、扫地机器人、Kachaka（预览模式下才动） */
const actors = new ActorLayer((id) => objs.get(id)?.obj)
const objs = new Map<string, { obj: THREE.Group; key: string }>()
let ghost: THREE.Group | null = null
let ghostKey = ''
const ghostRot = ref(0)
let dirty = true
let raf = 0
let ro: ResizeObserver | null = null

// 选中标记：地面上的一圈
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#ff7aa2', transparent: true, opacity: 0.9, depthWrite: false }),
)
ring.renderOrder = 2
ring.visible = false
const RING_OK = '#ff7aa2'
const RING_BAD = '#ff3b30'
/** 摆放预览脚下的圈：重叠时变红 */
const ghostRing = new THREE.Mesh(ring.geometry, new THREE.MeshBasicMaterial({ color: RING_OK, transparent: true, opacity: 0.85, depthWrite: false }))
ghostRing.renderOrder = 2
ghostRing.visible = false

// 吸附参考线：贴墙用粉色，和家具对齐用蓝色
const guideRoot = new THREE.Group()
const guideMat = { wall: new THREE.MeshBasicMaterial({ color: '#ff5c8a' }), align: new THREE.MeshBasicMaterial({ color: '#4aa8ff' }) }
function showGuides(gs: Guide[], y = 0) {
  guideRoot.clear()
  for (const g of gs) {
    const len = Math.max(10, g.b - g.a + 40)
    const m = new THREE.Mesh(new THREE.BoxGeometry(g.axis === 'x' ? 1.6 : len, 1, g.axis === 'x' ? len : 1.6), g.wall ? guideMat.wall : guideMat.align)
    const mid = (g.a + g.b) / 2
    m.position.set(g.axis === 'x' ? g.v : mid, y + 1.5, g.axis === 'x' ? mid : g.v)
    m.renderOrder = 3
    guideRoot.add(m)
  }
  dirty = true
}

/** 房子的平面中心：前墙透明按它判断前后 */
let houseCenter = { x: 0, y: 0 }
const wallLook = () => ({ style: sandbox.wallMode === 'fade' ? ('fade' as const) : ('cut' as const), opacity: sandbox.cutawayOpacity / 100, cut: sandbox.cutHeight })

/** C 键：在四种墙体显示之间循环 */
function cycleWallMode() {
  const i = WALL_MODES.findIndex((m) => m.id === sandbox.wallMode)
  sandbox.wallMode = WALL_MODES[(i + 1) % WALL_MODES.length].id
}

/** 鼠标悬停的房间：透明到这一层 */
let hoverRoomId: string | null = null
/** 有墙在渐变中 */
let fading = false
let lastFrame = performance.now()
function updateCutaway() {
  if (!house) return
  const v = new THREE.Vector3().subVectors(stage.camera.position, new THREE.Vector3(houseCenter.x, 0, houseCenter.y))
  const l = Math.hypot(v.x, v.z)
  const dir = sandbox.wallMode !== 'up' && l > 1 ? { x: v.x / l, y: v.z / l } : null
  let depth: number | null = null
  const room = hoverRoomId && sandbox.cutawayHover ? plan.value.rooms.find((r) => r.id === hoverRoomId) : undefined
  if (dir && room) {
    // 以房间中心为界：比它更靠近镜头的墙（含这个房间自己的前墙）都透明
    const c = centroid(room.points)
    depth = (c.x - houseCenter.x) * dir.x + (c.y - houseCenter.y) * dir.y
  }
  applyCutaway(house, houseCenter, dir, depth, sandbox.wallMode === 'down', sandbox.wallMode === 'half')
  fading = true
  updateMounted(dir, depth)
}

/**
 * 壁挂物跟着墙走：墙压低 / 透明时，挂在那面墙上的东西一起淡出，免得悬在半空（和墙一样渐变）。
 * 「挂在哪面墙」用它的背面朝向近似：背面朝着镜头、又在房子靠镜头的一侧（或在鼠标所指房间之前）就藏；
 * 半墙模式下挂在内墙上的（背后隔着墙还是户内房间）都藏。
 */
function updateMounted(dir: { x: number; y: number } | null, depth: number | null) {
  const p = toRaw(plan.value)
  const list: THREE.Object3D[] = []
  for (const f of p.furniture) {
    const def = ASSET_MAP.get(f.asset)
    const o = objs.get(f.id)
    if (!def?.mount || !o) continue
    const a = (f.rot * Math.PI) / 180
    const back = { x: Math.sin(a), y: -Math.cos(a) }
    // 能摆东西的壁挂物（搁板、吊柜、挂杆）一直显示：藏了它，摆在上面、挂在上面的东西就悬在半空了
    const platform = !!def.surface || !!def.surfaces?.length
    let hide = !platform && sandbox.wallMode === 'down'
    if (!platform && !hide && sandbox.wallMode === 'half') {
      const k = def.d / 2 + p.wall + 5
      const r = roomAt(p, { x: f.x + back.x * k, y: f.y + back.y * k })
      hide = !!r && r.kind !== 'balcony'
    }
    if (!platform && !hide && dir) {
      const s = (f.x - houseCenter.x) * dir.x + (f.y - houseCenter.y) * dir.y
      hide = back.x * dir.x + back.y * dir.y > 0.3 && (s > 25 || (depth !== null && s > depth))
    }
    o.obj.userData.fade ??= { x: f.x, y: f.y, nx: 0, ny: 0, outer: false }
    o.obj.userData.target = hide ? 1 : 0
    list.push(o.obj)
  }
  furnRoot.userData.fadeList = list
}

function updateHoverRoom(e: PointerEvent | null) {
  let id: string | null = null
  if (e) {
    const p = floorPoint(e)
    id = (p && roomAt(plan.value, { x: p.x, y: p.z })?.id) || null
  }
  if (id !== hoverRoomId) {
    hoverRoomId = id
    updateCutaway()
  }
}

const selectedFurniture = computed(() => {
  const s = selection.value
  return s?.type === 'furniture' ? findFurniture(s.id) ?? null : null
})
const selectedDef = computed(() => (selectedFurniture.value ? ASSET_MAP.get(selectedFurniture.value.asset) ?? null : null))

// ---------- 场景同步 ----------

function rebuildHouse() {
  if (house) {
    stage.scene.remove(house)
    disposeUnshared(house)
  }
  house = buildHouse(plan.value, sandbox.wallHeight)
  stage.scene.add(house)
  const pts = plan.value.rooms.flatMap((r) => r.points)
  if (pts.length) {
    const b = bbox(pts)
    houseCenter = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
  }
  updateCutaway()
  // 重建时直接到位，不播渐变
  stepCutaway(house, 10, wallLook())
  const box = new THREE.Box3().setFromObject(house)
  houseBox = box.isEmpty() ? null : box
  if (houseBox) fitSun(stage.sun, houseBox, skyNow.value?.lightDir)
  // 房间变了，家具的地面高度可能也变了
  for (const f of plan.value.furniture) {
    const o = objs.get(f.id)
    if (o) placeFurniture(o.obj, plan.value, f)
  }
  actors.sync(toRaw(plan.value), actorsLive())
  dirty = true
}

function syncFurniture() {
  // 读原始对象：拖动时每帧都要过一遍全部家具，走响应式代理的开销比计算本身还大
  const p = toRaw(plan.value)
  const alive = new Set<string>()
  for (const f of p.furniture) {
    alive.add(f.id)
    const key = `${f.asset}#${f.color ?? 0}#${f.colors?.join(',') ?? ''}#${f.patterns ? JSON.stringify(f.patterns) : ''}`
    let o = objs.get(f.id)
    if (!o || o.key !== key) {
      if (o) {
        furnRoot.remove(o.obj)
        disposeUnshared(o.obj)
      }
      o = { obj: furnitureModel(f), key }
      objs.set(f.id, o)
      furnRoot.add(o.obj)
      fx.set(f.id, o.obj, ASSET_MAP.get(f.asset)?.fx)
    }
    placeFurniture(o.obj, p, f)
    // 绿植贴墙时把越过墙面的枝叶弯回来（位置变了才重算）
    if (isPlant(f.asset)) {
      const pk = `${f.x},${f.y},${f.rot}`
      if (o.obj.userData.bentAt !== pk) {
        bendToWalls(o.obj, p, f)
        o.obj.userData.bentAt = pk
      }
    }
  }
  for (const [id, o] of objs)
    if (!alive.has(id)) {
      furnRoot.remove(o.obj)
      disposeUnshared(o.obj)
      objs.delete(id)
      fx.remove(id)
    }
  updateRing()
  updateCutaway()
  actors.sync(p, actorsLive())
  dirty = true
}

function footprintRadius(asset: string) {
  const d = ASSET_MAP.get(asset)
  return d ? Math.hypot(d.w, d.d) / 2 + 8 : 30
}

function updateRing() {
  const f = selectedFurniture.value
  const o = f && objs.get(f.id)
  if (!f || !o || !editing.value) {
    ring.visible = false
    return
  }
  ring.visible = true
  const r = footprintRadius(f.asset)
  ring.scale.set(r, 1, r)
  ring.position.set(o.obj.position.x, o.obj.position.y + 0.6, o.obj.position.z)
  // 和别的家具 / 设备穿模时提示成红色
  ;(ring.material as THREE.MeshBasicMaterial).color.set(overlapsOthers(plan.value, f.id, f.asset, f.x, f.y, f.rot) ? RING_BAD : RING_OK)
}

/** 摆放预览当前显示的素材（挂到挂钩上时会换成挂起形态） */
let ghostAsset = ''
function syncGhost(asset = placing.value?.asset) {
  const p = placing.value
  const key = p ? `${asset}#${p.color}` : ''
  if (key === ghostKey) return
  if (ghost) {
    stage.scene.remove(ghost)
    disposeUnshared(ghost)
  }
  ghost = null
  ghostKey = key
  ghostRing.visible = false
  if (p) {
    ghostAsset = asset ?? p.asset
    ghost = furnitureModel({ id: 'ghost', asset: ghostAsset, x: 0, y: 0, rot: ghostRot.value, color: p.color, colors: p.colors, patterns: p.patterns })
    ghost.visible = false
    stage.scene.add(ghost)
  }
  dirty = true
}

function resetView() {
  if (!house) return
  const box = new THREE.Box3().setFromObject(house)
  if (box.isEmpty()) return
  const c = frameCamera(stage.camera, box, new THREE.Vector3(0.35, 1.25, 1).normalize(), 0.9)
  controls.target.copy(c)
  controls.update()
  updateCutaway()
  stepCutaway(house, 10, wallLook())
  dirty = true
}

// ---------- 指针 ----------

const raycaster = new THREE.Raycaster()
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ndc = new THREE.Vector2()

function setRay(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, stage.camera)
}

function floorPoint(e: PointerEvent) {
  setRay(e)
  const p = new THREE.Vector3()
  return raycaster.ray.intersectPlane(floor, p) ? p : null
}

function pickFurniture(e: PointerEvent): string | null {
  setRay(e)
  const hit = raycaster.intersectObject(furnRoot, true)[0]
  let o: THREE.Object3D | null = hit?.object ?? null
  while (o && !o.userData.furnitureId) o = o.parent
  // 走动中的宠物 / 机器人：点中就选中它来源的那件家具（选中后角色回到原位静止，方便拖动）
  return (o?.userData.furnitureId as string) ?? actors.pick(raycaster)
}

/**
 * 宠物、扫地机器人在两种模式下都活动；布置模式里选中、拖动、摆放东西时暂停（回到原位、素材复原），
 * 免得编辑的东西在跑。
 */
function actorsLive() {
  return sandbox.mode !== 'edit' || (!selection.value && !placing.value && !drag)
}


/** 吸附：按住 Alt 或关掉开关时只吸 5cm 网格 */
function snapped(id: string | null, asset: string, x: number, y: number, rot: number, alt: boolean) {
  if (!sandbox.snap || alt) return { x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5, guides: [] as Guide[] }
  return snapFurniture(plan.value, id, asset, x, y, rot)
}

/**
 * 鼠标对应的摆放位置：prop 优先落在射线打中的桌柜顶面上（z = 顶面高度），否则落地并做贴墙 / 对齐吸附。
 * off 是拖动时鼠标和家具中心的偏移（只用于落地的情况）。
 */
interface Spot {
  x: number
  y: number
  z: number
  guides: Guide[]
  /** 要换成的素材（同系列的另一种形态，如挂到挂钩上换成挂起形态） */
  asset: string
  /** 强制朝向（贴墙的壁挂物） */
  rot?: number
}

/**
 * 鼠标对应的摆放位置：
 *   - 壁挂物：总是吸到最近的墙面上，背面贴墙、朝向房间；
 *   - prop：优先落在射线打中的台面 / 柜内层板 / 挂钩上（z = 该层高度），挂钩上自动换成挂起形态；
 *   - 其余落地，做贴墙 / 对齐吸附（Alt 关闭）。
 * off 是拖动时鼠标和家具中心的偏移（只用于落地的情况）。
 */
function locate(e: PointerEvent, asset: string, selfId: string | null, exclude: Set<string>, off = { x: 0, y: 0 }, rot = 0): Spot | null {
  const def = ASSET_MAP.get(asset)
  if (!def) return null
  const p = floorPoint(e)
  if (def.stick) {
    setRay(e)
    const targets: THREE.Object3D[] = [furnRoot, ...(house ? [house] : [])]
    const hits = raycaster.intersectObjects(targets, true).filter((h) => {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.furnitureId) o = o.parent
      return !(o && exclude.has(o.userData.furnitureId)) && h.object.visible && !!h.face
    })
    for (const h of hits) {
      const n = h.face!.normal.clone().transformDirection(h.object.matrixWorld)
      if (Math.abs(n.y) > 0.5) continue
      const len = Math.hypot(n.x, n.z) || 1
      const nx = n.x / len
      const nz = n.z / len
      const floor = floorY(roomAt(plan.value, { x: h.point.x, y: h.point.z }))
      return {
        x: Math.round((h.point.x + nx * 0.05) * 10) / 10,
        y: Math.round((h.point.z + nz * 0.05) * 10) / 10,
        z: Math.round((h.point.y - floor) * 10) / 10,
        rot: Math.round((Math.atan2(-nx, nz) * 180) / Math.PI + 360) % 360,
        guides: [],
        asset,
      }
    }
    return null
  }
  if (def.mount) {
    if (!p) return null
    const w = snapToWall(plan.value, asset, p.x, p.z)
    return w && { x: w.x, y: w.y, z: 0, rot: w.rot, guides: w.guides, asset }
  }
  if (def.prop) {
    setRay(e)
    const hang = canHang(def)
    // 挂钩只收有挂起形态的；净高不够的层（床底、矮层板）放不进去
    const hangDef = hang ? ASSET_MAP.get(formFor(def, 'hook')!) : undefined
    const hit = pickSurface(plan.value, raycaster.ray, exclude, (kind, h) => (kind === 'hook' ? !!hangDef && hangDef.h <= h + 0.5 : def.h <= h + 0.5))
    if (hit) {
      const a = formFor(def, hit.kind) ?? asset
      if (hit.kind === 'hook') {
        const h = snapToHook(hit.pose, hit.poly, hit)
        return { x: h.x, y: h.y, z: hit.z, rot: h.rot, guides: [], asset: a }
      }
      const fit = fitOnSurface(plan.value, hit.owner, hit.z, a, hit.x, hit.y, rot)
      return { x: Math.round(fit.x * 10) / 10, y: Math.round(fit.y * 10) / 10, z: hit.z, guides: [], asset: a }
    }
  }
  if (!p) return null
  return { ...snapped(selfId, asset, p.x + off.x, p.z + off.y, rot, e.altKey), z: 0, asset: formFor(def, 'floor') ?? asset }
}

/** 拖动中的家具；kids 是摆在它上面、要跟着走的东西（相对偏移） */
let drag: { id: string; dx: number; dz: number; kids: { id: string; dx: number; dy: number; dz: number }[]; exclude: Set<string> } | null = null
let down: { x: number; y: number } | null = null
const hovering = ref(false)
const editing = computed(() => sandbox.mode === 'edit')

/** 切换布置 / 预览：预览时清掉选中、摆放和参考线，家具不可编辑 */
function setMode(m: 'edit' | 'preview') {
  sandbox.mode = m
  if (m === 'preview') {
    selection.value = null
    placing.value = null
    hovering.value = false
    showGuides([])
  }
  controls.autoRotate = m === 'preview' && sandbox.autoRotate
  dirty = true
}

function onPointerDown(e: PointerEvent) {
  // 用户动手转视角时停下自动旋转
  if (controls.autoRotate) sandbox.autoRotate = false
  if (!editing.value) return
  if (e.button !== 0) {
    if (e.button === 2 && placing.value) placing.value = null
    return
  }
  if (placing.value) {
    const q = locate(e, placing.value.asset, null, new Set(), undefined, ghostRot.value)
    if (q) {
      addFurniture({ asset: q.asset, color: placing.value.color, colors: placing.value.colors, patterns: placing.value.patterns, x: q.x, y: q.y, rot: q.rot ?? ghostRot.value, z: q.z || undefined })
      if (!e.shiftKey) placing.value = null
      showGuides([])
    }
    return
  }
  const id = pickFurniture(e)
  if (id) {
    selection.value = { type: 'furniture', id }
    const f = findFurniture(id)!
    const p = floorPoint(e)
    checkpoint()
    const kids = propsOn(plan.value, f).map((k) => ({ id: k.id, dx: k.x - f.x, dy: k.y - f.y, dz: (k.z ?? 0) - (f.z ?? 0) }))
    drag = { id, dx: p ? f.x - p.x : 0, dz: p ? f.y - p.z : 0, kids, exclude: new Set([id, ...kids.map((k) => k.id)]) }
    controls.enabled = false
    canvas.value!.setPointerCapture(e.pointerId)
  } else {
    down = { x: e.clientX, y: e.clientY }
  }
}

function onPointerMove(e: PointerEvent) {
  if (onRotateMove(e)) {
    dirty = true
    return
  }
  if (e.buttons === 0 || drag || placing.value) updateHoverRoom(e)
  if (placing.value && ghost) {
    const q = locate(e, placing.value.asset, null, new Set(), undefined, ghostRot.value)
    if (q && q.asset !== ghostAsset) syncGhost(q.asset)
    if (!ghost) return
    ghost.visible = !!q
    ghostRing.visible = !!q
    if (q) {
      placeFurniture(ghost, plan.value, { x: q.x, y: q.y, rot: q.rot ?? ghostRot.value, z: q.z })
      const r = footprintRadius(q.asset)
      ghostRing.scale.set(r, 1, r)
      ghostRing.position.set(ghost.position.x, ghost.position.y + 0.6, ghost.position.z)
      ;(ghostRing.material as THREE.MeshBasicMaterial).color.set(!q.z && overlapsOthers(plan.value, null, q.asset, q.x, q.y, q.rot ?? ghostRot.value) ? RING_BAD : RING_OK)
      showGuides(q.guides)
    }
    dirty = true
    return
  }
  if (drag) {
    const f = findFurniture(drag.id)
    const q = f && locate(e, f.asset, f.id, drag.exclude, { x: drag.dx, y: drag.dz }, f.rot)
    if (f && q) {
      f.x = q.x
      f.y = q.y
      if (q.z) f.z = q.z
      else delete f.z
      if (q.rot !== undefined) f.rot = q.rot
      if (q.asset !== f.asset) f.asset = q.asset
      // 桌上的东西跟着走
      for (const k of drag.kids) {
        const o = findFurniture(k.id)
        if (!o) continue
        o.x = Math.round((f.x + k.dx) * 10) / 10
        o.y = Math.round((f.y + k.dy) * 10) / 10
        o.z = (f.z ?? 0) + k.dz
      }
      showGuides(q.guides)
    }
    return
  }
  // 悬停时换指针
  if (e.buttons === 0 && editing.value) hovering.value = !!pickFurniture(e)
}

function onPointerUp(e: PointerEvent) {
  if (drag) {
    settle()
    drag = null
    controls.enabled = true
    showGuides([])
  } else if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
    selection.value = null
  }
  down = null
}

// ---------- 键盘 ----------

/** 按住 R 拖动旋转：记下起始角度，鼠标绕选中家具的中心转多少，家具就转多少（Shift 每 15° 吸附） */
let rotating: { base: number; start: number } | null = null
function rotatePointerAngle(e: PointerEvent) {
  const s = selection.value
  const f = s?.type === 'furniture' ? findFurniture(s.id) : undefined
  const p = floorPoint(e)
  if (!f || !p) return null
  return (Math.atan2(p.z - f.y, p.x - f.x) * 180) / Math.PI
}
function onRotateMove(e: PointerEvent) {
  if (!rKey || !editing.value || placing.value || selection.value?.type !== 'furniture') return false
  const ang = rotatePointerAngle(e)
  if (ang === null) return false
  if (!rotating) {
    checkpointPlan()
    rotating = { base: findFurniture(selection.value.id)!.rot, start: ang }
    controls.enabled = false
  }
  let target = rotating.base + (ang - rotating.start)
  if (e.shiftKey) target = Math.round(target / 15) * 15
  setSelectedFurnitureRotation(target)
  return true
}
function endRotate() {
  if (!rotating) return
  rotating = null
  settle()
  controls.enabled = true
}
let rKey = false
function onKeyUp(e: KeyboardEvent) {
  if (e.key.toLowerCase() === 'r') {
    rKey = false
    endRotate()
  }
}

function onKey(e: KeyboardEvent) {
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (k === 'r' && !e.repeat) rKey = true
  const step = e.shiftKey ? 15 : 90
  if (k === 'p') setMode(editing.value ? 'preview' : 'edit')
  else if (k === 'f') resetView()
  else if (k === 'c') cycleWallMode()
  else if (!editing.value) {
    if (e.key === 'Escape') setMode('edit')
  } else if (k === 'q' || k === 'e') {
    const deg = k === 'q' ? -step : step
    if (placing.value) {
      ghostRot.value = (((ghostRot.value + deg) % 360) + 360) % 360
      if (ghost) ghost.rotation.y = (-ghostRot.value * Math.PI) / 180
      dirty = true
    } else rotateSelectedFurniture(deg)
  } else if (e.key === 'Escape') {
    if (placing.value) placing.value = null
    else selection.value = null
  }
}

// ---------- 面板操作 ----------

function autoDecorate() {
  redecorate()
}

function clearFurniture() {
  mutate((p) => {
    p.furniture = []
  })
  selection.value = null
}


/** 截图 / 导出 PNG：stage.render() 会走当前画面效果 */
function screenshot() {
  stage.render()
  const a = document.createElement('a')
  a.href = stage.renderer.domElement.toDataURL('image/png')
  a.download = `${plan.value.name || 'home'}-3d.png`
  a.click()
}

function startPlacing(asset: string) {
  selection.value = null
  const def = ASSET_MAP.get(asset)!
  placing.value = placing.value?.asset === asset ? null : { asset, color: paletteFor(def, libFilter.style) }
}

// ---------- 从家具栏直接拖进场景 ----------
// 拖动开始就进入放置状态；在画布上移动时预览跟着走，松手放下；拖到别处松手就取消
let dragPlacing = false
function onCardDragStart(e: DragEvent, asset: string) {
  if (!editing.value) setMode('edit')
  selection.value = null
  const def = ASSET_MAP.get(asset)!
  placing.value = { asset, color: paletteFor(def, libFilter.style) }
  dragPlacing = true
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', asset)
    // 拖动时不显示整张卡片的残影，用缩略图当拖动图标
    const img = (e.currentTarget as HTMLElement).querySelector('img')
    if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2)
  }
}
function onCardDragEnd() {
  if (dragPlacing) placing.value = null
  dragPlacing = false
  showGuides([])
}
function onCanvasDragOver(e: DragEvent) {
  if (!dragPlacing) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  onPointerMove(e as unknown as PointerEvent)
}
function onCanvasDragLeave() {
  if (!dragPlacing || !ghost) return
  ghost.visible = false
  ghostRing.visible = false
  showGuides([])
  dirty = true
}
function onCanvasDrop(e: DragEvent) {
  if (!dragPlacing || !placing.value) return
  const q = locate(e as unknown as PointerEvent, placing.value.asset, null, new Set(), undefined, ghostRot.value)
  if (q) addFurniture({ asset: q.asset, color: placing.value.color, colors: placing.value.colors, patterns: placing.value.patterns, x: q.x, y: q.y, rot: q.rot ?? ghostRot.value, z: q.z || undefined })
  placing.value = null
  dragPlacing = false
  showGuides([])
}

// ---------- 家具栏：按分类 / 风格 / 尺寸筛选，同系列合成一项 ----------

const libFilter = reactive<Filter>({ category: 'all', style: 'all', size: 'all', query: '', fixtures: false })
const categories = categoriesOf(false)
const styleKeys = Object.keys(STYLE_LABELS) as StyleTag[]
const sizeKeys = Object.keys(SIZE_LABELS) as SizeClass[]
const placeable = computed(() => browse(libFilter))
// 缩略图只渲染滚到可见处的（v-thumb）
const { thumbs, vThumb } = useThumbs()
const thumbColor = (id: string) => paletteFor(ASSET_MAP.get(id)!, libFilter.style)

/** 选中家具的同系列规格、按风格分组的配色 */
const selectedSizes = computed(() => (selectedDef.value ? siblings(selectedDef.value) : []))
function swapSize(asset: string) {
  const f = selectedFurniture.value
  if (f) swapFurnitureAsset(f.id, asset)
}

const counts = computed(() => plan.value.furniture.length)

// ---------- 墙纸 ----------
const paperRooms = computed(() => plan.value.rooms.filter((r) => r.kind !== 'balcony'))
const wpRoomId = ref('')
const wpRoom = computed(() => plan.value.rooms.find((r) => r.id === wpRoomId.value) ?? paperRooms.value[0])
watch(paperRooms, (rs) => {
  if (!rs.some((r) => r.id === wpRoomId.value)) wpRoomId.value = rs[0]?.id ?? ''
}, { immediate: true })
const WP_COLORS = ['#fbf7f1', '#f2f2f0', '#fff4f1', '#f3f8ff', '#f4fbf6', '#fff9e8', '#f6f0e1', '#e6e6e4', '#d6d3cd', '#f4e7c8', '#dfe8f0', '#3d3f44']
const WP_PATTERNS: PatternKind[] = ['stripes', 'dots', 'gingham', 'flowers', 'sakura', 'stars', 'asanoha', 'seigaiha', 'ichimatsu', 'chevron', 'houndstooth', 'argyle']
// ---------- 家电（冰箱、洗衣机）款式和颜色 ----------
const appliances = computed(() => plan.value.fixtures.filter((f) => f.kind === 'fridge' || f.kind === 'washer'))
function setAppliance(id: string, patch: Partial<Pick<Fixture, 'style' | 'color'>>) {
  mutate((p) => {
    const f = p.fixtures.find((x) => x.id === id)
    if (f) Object.assign(f, patch)
  })
}

/** 边饰预设：颜色用 trimColor */
const TRIM_COLORS = ['#f4f1ea', '#d2b48c', '#b98b5e', '#7a5638', '#3d3f44', '#c9d6cf']
const trimColor = ref('#f4f1ea')
const TRIMS: { id: string; label: string; make: (c: string) => WallTrim | undefined }[] = [
  { id: 'none', label: '无', make: () => undefined },
  { id: 'base', label: '踢脚线', make: (c) => ({ base: { h: 6, color: c } }) },
  { id: 'wainscot', label: '腰壁', make: (c) => ({ base: { h: 6, color: c }, wainscot: { h: 90, color: c, kind: 'plain' } }) },
  { id: 'batten', label: '护墙板', make: (c) => ({ base: { h: 6, color: c }, wainscot: { h: 100, color: c, kind: 'batten' } }) },
  { id: 'crown', label: '顶角线', make: (c) => ({ base: { h: 6, color: c }, crown: { h: 5, color: c } }) },
  { id: 'full', label: '腰壁 + 顶角线', make: (c) => ({ base: { h: 6, color: c }, wainscot: { h: 90, color: c, kind: 'batten' }, crown: { h: 5, color: c } }) },
]
const trimId = (t?: WallTrim) => (!t ? 'none' : t.wainscot && t.crown ? 'full' : t.wainscot ? (t.wainscot.kind === 'batten' ? 'batten' : 'wainscot') : t.crown ? 'crown' : 'base')
function setTrim(id: string, color = trimColor.value) {
  const r = wpRoom.value
  if (!r) return
  trimColor.value = color
  const t = TRIMS.find((x) => x.id === id)!.make(color)
  setRoomWallpaper(r.id, { ...(r.wallpaper ?? { color: '#fbf7f1' }), trim: t })
}

/** 用当前房间墙纸的底色织一张花纹墙纸（低对比） */
function wpPattern(kind: PatternKind) {
  const base = wpRoom.value?.wallpaper?.color ?? '#fbf7f1'
  return { color: base, trim: wpRoom.value?.wallpaper?.trim, pattern: { kind, colors: [base, accentOf(base), accentOf(base, 0.04)], scale: kind === 'stripes' ? 16 : 12, angle: kind === 'stripes' ? (90 as const) : (0 as const), density: 0.3, seed: 7 } }
}

// ---------- 检查清单 ----------
const clOpen = ref(false)
// 在原始对象上算：经过响应式代理要 8ms、原始对象不到 1ms（拖动家具时每帧都会重算）。
// 依赖改由一个深度 watch 的版本号提供，plan 里任何变化都会触发重算，行为不变。
const planVer = ref(0)
watch(plan, () => planVer.value++, { deep: true })
const checkItems = computed(() => {
  void planVer.value
  const p = toRaw(plan.value)
  return checklist(p, p.household)
})
const missingItems = computed(() => missing(checkItems.value))
const checkGroups = computed(() => {
  const m = new Map<string, typeof checkItems.value>()
  for (const it of checkItems.value) m.set(it.roomName, [...(m.get(it.roomName) ?? []), it])
  return [...m.entries()]
})
const placingName = computed(() => {
  const d = placing.value ? ASSET_MAP.get(placing.value.asset) : undefined
  return d ? assetName(d) : ''
})

// ---------- 生命周期 ----------

function loop() {
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.1, (now - lastFrame) / 1000)
  lastFrame = now
  const moved = controls.update()
  // 时间流逝动画：只有播放时才每帧推进（推进后由 watch 更新光照并标脏）
  if (sandbox.playing) sandbox.time = (sandbox.time + dt * sandbox.speed) % 24
  // 阴影贴图只在场景本身变了时重画：转视角、粒子、选中圈闪烁都不影响投影（静止的户型省掉整整一遍阴影渲染）
  let shadowDirty = dirty
  // 太阳方向变了：阴影贴图要重画，但拖滑杆 / 播放时节流到每 100ms 一次
  if (sunMoved && now - lastSunShadow > 100) {
    sunMoved = false
    lastSunShadow = now
    shadowDirty = true
    dirty = true
  }
  if (fx.update(dt, stage.renderer.domElement.height)) dirty = true
  if (actors.update(dt)) dirty = true
  if (fading && house) {
    // 壁挂物按透明方式淡出（压低模式下也是淡出，它们没有矮墙可压）
    const furnBusy = stepCutaway(furnRoot, dt, { ...wallLook(), style: 'fade', opacity: sandbox.wallMode === 'fade' ? sandbox.cutawayOpacity / 100 : 0 })
    fading = stepCutaway(house, dt, wallLook()) || furnBusy
    if (house.userData.cutawayChanged || furnRoot.userData.cutawayChanged) {
      house.userData.cutawayChanged = false
      furnRoot.userData.cutawayChanged = false
      shadowDirty = true
      dirty = true
    }
  }
  if (ring.visible) {
    const t = performance.now() / 1000
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 4) * 0.35
    dirty = true
  }
  if (moved) {
    updateCutaway()
    updateCompass()
  }
  if (moved || dirty) {
    if (shadowDirty) stage.renderer.shadowMap.needsUpdate = true
    stage.render()
    dirty = false
  }
}

onMounted(() => {
  stage = createStage(canvas.value!)
  post = attachPost(stage)
  post.setLook(sandbox.look)
  applySky()
  stage.renderer.shadowMap.autoUpdate = false
  stage.renderer.shadowMap.needsUpdate = true
  stage.scene.add(furnRoot, ring, ghostRing, guideRoot, fx.group, actors.group)
  controls = new OrbitControls(stage.camera, canvas.value!)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.maxPolarAngle = Math.PI * 0.47
  controls.minDistance = 150
  controls.maxDistance = 6000
  controls.screenSpacePanning = true
  controls.autoRotateSpeed = 0.6
  controls.autoRotate = !editing.value && sandbox.autoRotate
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  // 近裁面跟着镜头距离走：拉远时深度精度不够，墙体交接处会闪
  controls.addEventListener('change', () => {
    const near = Math.min(120, Math.max(5, stage.camera.position.distanceTo(controls.target) * 0.08))
    if (Math.abs(near - stage.camera.near) > 1) {
      stage.camera.near = near
      stage.camera.updateProjectionMatrix()
    }
  })

  const r = host.value!.getBoundingClientRect()
  stage.resize(r.width, r.height)
  ro = new ResizeObserver(([entry]) => {
    stage.resize(entry.contentRect.width, entry.contentRect.height)
    dirty = true
  })
  ro.observe(host.value!)

  rebuildHouse()
  syncFurniture()
  syncGhost()
  resetView()
  updateCompass()
  loop()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onKeyUp as unknown as () => void)
  liveCapture.fn = captureView
})

/**
 * 「我的户型」保存时截当前视角做缩略图：临时藏掉选中圈、摆放预览、对齐辅助线，同步渲染一帧后立即还原。
 * 带当前画面效果（所见即所得）；沙盘没开时的离屏缩略图（planThumb）不加效果。
 */
function captureView(w: number, h: number) {
  if (!house) return null
  const hidden = [ring, ghostRing, guideRoot, ...(ghost ? [ghost] : [])].filter((o) => o.visible)
  for (const o of hidden) o.visible = false
  try {
    stage.render()
    return coverInto(stage.renderer.domElement, w, h)
  } finally {
    for (const o of hidden) o.visible = true
    dirty = true
  }
}

// ---------- 时间与太阳 ----------

/** 房子的包围盒：太阳的阴影相机按它取景 */
let houseBox: THREE.Box3 | null = null
const skyNow = shallowRef<SkyState | null>(null)
/** 太阳方向变了、阴影贴图待重画（loop 里节流） */
let sunMoved = false
let lastSunShadow = 0

/** 按 时刻 + 日期 + 地点 + 户型朝向 重算灯光、天色和入夜程度 */
function applySky() {
  const s = skyState(sandbox.time, sandbox.month, sandbox.day, sandbox.geo, plan.value.north ?? 0)
  skyNow.value = s
  stage.sun.color.copy(s.lightColor)
  stage.sun.intensity = s.lightIntensity
  stage.hemi.color.copy(s.hemiSky)
  stage.hemi.groundColor.copy(s.hemiGround)
  stage.hemi.intensity = s.hemiIntensity
  if (houseBox) fitSun(stage.sun, houseBox, s.lightDir)
  post.setSky(s.bg, s.night)
  sunMoved = true
  dirty = true
}

/** 视口背景：画布透明时露出来的天色（与后处理 Base 的渐变一致） */
const viewportBg = computed(() => {
  const bg = skyNow.value?.bg ?? ['#fdfdfb', '#f1f3ef', '#e3e9e5']
  return `radial-gradient(ellipse at 50% 35%, ${bg[0]} 0%, ${bg[1]} 55%, ${bg[2]} 100%)`
})
const nightUi = computed(() => (skyNow.value?.night ?? 0) > 0.6)

const clock = computed(() => {
  const m = Math.round(sandbox.time * 60) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
const LOCALES = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' } as const
const monthNames = computed(() => {
  const f = new Intl.DateTimeFormat(LOCALES[lang.value], { month: 'short' })
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(2026, i, 1)))
})
const dayCount = computed(() => MONTH_DAYS[sandbox.month - 1])
watch(dayCount, (n) => {
  if (sandbox.day > n) sandbox.day = n
})
const SPEEDS = [0.25, 0.5, 1, 2, 4]
const sunInfo = computed(() => {
  const s = skyNow.value
  if (!s) return ''
  if (s.altitude < -0.8) return t('太阳在地平线下 · 月光')
  return t('太阳高度 {h}° · 方位 {b}°', { h: s.altitude.toFixed(0), b: s.bearing.toFixed(0) })
})
function setCity(id: string) {
  if (id === 'custom') {
    sandbox.geo = { ...toRaw(sandbox.geo), id: 'custom' }
    return
  }
  const c = CITIES.find((x) => x.id === id)
  if (c) sandbox.geo = { id: c.id, lat: c.lat, lon: c.lon, tz: c.tz }
}
function setCoord(k: 'lat' | 'lon', v: number) {
  if (!Number.isFinite(v)) return
  const lim = k === 'lat' ? 90 : 180
  const g = { ...toRaw(sandbox.geo), id: 'custom', [k]: Math.max(-lim, Math.min(lim, v)) }
  g.tz = Math.round(g.lon / 15)
  sandbox.geo = g
}

/** 户型朝向（北方角度），拖动滑杆时只在开始记一次撤销 */
const northDeg = computed(() => Math.round(plan.value.north ?? 0))
let northCk = false
function setNorth(v: number) {
  if (!northCk) {
    checkpoint()
    northCk = true
  }
  plan.value.north = ((Math.round(v) % 360) + 360) % 360
}

/** 3D 指北针：北方在屏幕上相对「镜头正前方」顺时针的角度 */
const compassAngle = ref(0)
function updateCompass() {
  if (!stage) return
  const f = controls.target.clone().sub(stage.camera.position).setY(0)
  if (f.lengthSq() < 1e-6) return
  f.normalize()
  const r = new THREE.Vector3(-f.z, 0, f.x)
  const { n } = compassAxes(plan.value.north ?? 0)
  const a = (Math.atan2(n.dot(r), n.dot(f)) * 180) / Math.PI
  if (Math.abs(a - compassAngle.value) > 0.5) compassAngle.value = a
}

// ---------- 画面效果 ----------

const currentLook = computed(() => LOOK_MAP.get(sandbox.look as LookId) ?? LOOKS[0])
const lookOpen = ref(false)
/** 选择器里每种效果的小图：展开时用当前视角逐个渲染一帧（约十几帧，只在展开时做一次） */
const lookThumbs = ref<Record<string, string>>({})
function makeLookThumbs() {
  if (!house) return
  const out: Record<string, string> = {}
  try {
    for (const l of LOOKS) {
      const cv = post.withLook(l.id, () => captureView(192, 120))
      if (!cv) continue
      // 「原样」画布是透明的（底色来自 CSS），垫上同色底再转 JPEG
      const ctx = cv.getContext('2d')!
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#f1f3ef'
      ctx.fillRect(0, 0, cv.width, cv.height)
      out[l.id] = cv.toDataURL('image/jpeg', 0.86)
    }
  } finally {
    post.setLook(sandbox.look)
    dirty = true
  }
  lookThumbs.value = out
}
function toggleLooks() {
  lookOpen.value = !lookOpen.value
  if (lookOpen.value) makeLookThumbs()
}

onBeforeUnmount(() => {
  if (liveCapture.fn === captureView) liveCapture.fn = null
  cancelAnimationFrame(raf)
  ro?.disconnect()
  controls.dispose()
  post.dispose()
  stage.dispose()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onKeyUp as unknown as () => void)
  placing.value = null
})

watch(
  () => [plan.value.rooms, plan.value.openings, plan.value.fixtures, plan.value.wall, plan.value.wallOuter, sandbox.wallHeight],
  rebuildHouse,
  { deep: true },
)
watch(() => plan.value.furniture, syncFurniture, { deep: true })
// 布置 / 预览切换：角色回家静止 / 开始活动（素材里的角色部分随之隐藏、复原，阴影贴图要重画）
watch(
  () => [sandbox.mode, !!selection.value, !!placing.value] as const,
  () => {
    actors.sync(toRaw(plan.value), actorsLive())
    stage.renderer.shadowMap.needsUpdate = true
    dirty = true
  },
)
watch(selection, updateRing)
watch(
  () => sandbox.autoRotate,
  (v) => (controls.autoRotate = v && !editing.value),
)
// 别处（素材库）要求摆放时回到布置模式
watch(placing, (p) => {
  if (p && !editing.value) setMode('edit')
})
watch(
  () => [sandbox.wallMode, sandbox.cutawayHover],
  () => {
    // 换样式时先把已处理的墙按新样式重画一遍，再按新目标渐变
    if (house) stepCutaway(house, 0, wallLook(), true)
    updateCutaway()
  },
)
watch(
  () => [sandbox.cutawayOpacity, sandbox.cutHeight],
  () => {
    if (house) stepCutaway(house, 0, wallLook(), true)
    dirty = true
  },
)
watch(placing, () => syncGhost())
watch(
  () => sandbox.look,
  (v) => {
    post.setLook(v)
    dirty = true
  },
)
watch(() => [sandbox.time, sandbox.month, sandbox.day, sandbox.geo, plan.value.north], applySky)
watch(
  () => plan.value.north,
  () => updateCompass(),
)

const planSize = computed(() => {
  const pts = plan.value.rooms.flatMap((r) => r.points)
  if (!pts.length) return ''
  const b = bbox(pts)
  return `${((b.x1 - b.x0) / 100).toFixed(1)} × ${((b.y1 - b.y0) / 100).toFixed(1)} m`
})

defineExpose({ resetView })
</script>

<template>
  <div class="sandbox">
    <div ref="host" class="viewport" :class="{ placing: !!placing, hover: hovering, night: nightUi }" :style="{ background: viewportBg }">
      <div class="compass" :title="t('北') + ' · ' + t('户型朝向 {n}°', { n: northDeg })">
        <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true">
          <circle r="18" class="compass-bg" />
          <g :transform="`rotate(${compassAngle})`">
            <path d="M0 -14 L5 2 L0 -1 L-5 2 Z" class="compass-n" />
            <path d="M0 14 L5 2 L0 -1 L-5 2 Z" class="compass-s" />
            <text y="-15.5" text-anchor="middle" class="compass-t">N</text>
          </g>
        </svg>
      </div>
      <div class="modes">
        <button :class="{ on: editing }" :title="t('布置') + ' (P)'" @click="setMode('edit')"><JIcon :icon="ICONS.modeEdit" />{{ t('布置') }}</button>
        <button :class="{ on: !editing }" :title="t('预览') + ' (P)'" @click="setMode('preview')"><JIcon :icon="ICONS.modePreview" />{{ t('预览') }}</button>
      </div>
      <div v-if="!editing" class="preview-bar">
        <label><input v-model="sandbox.autoRotate" type="checkbox" /><JIcon :icon="ICONS.autoRotate" class="ico-muted" />{{ t('自动旋转') }}</label>
        <select v-model="sandbox.wallMode" :title="t('墙体显示') + ' (C)'">
          <option v-for="m in WALL_MODES" :key="m.id" :value="m.id">{{ t(m.label) }}</option>
        </select>
        <label class="pb-time" :title="t('时刻')">
          <JIcon :icon="ICONS.timeOfDay" class="ico-muted" />
          <input v-model.number="sandbox.time" type="range" min="0" max="24" step="0.05" :aria-label="t('时刻')" />
          <span class="clock">{{ clock }}</span>
        </label>
        <button class="icon-only" :class="{ on: sandbox.playing }" :title="sandbox.playing ? t('暂停') : t('播放时间流逝')" :aria-label="sandbox.playing ? t('暂停') : t('播放时间流逝')" @click="sandbox.playing = !sandbox.playing">
          <JIcon :icon="sandbox.playing ? ICONS.pause : ICONS.play" :size="14" />
        </button>
        <label :title="t('画面效果')">
          <JIcon :icon="ICONS.look" class="ico-muted" />
          <select v-model="sandbox.look" :aria-label="t('画面效果')">
            <option v-for="l in LOOKS" :key="l.id" :value="l.id">{{ t(l.label) }}</option>
          </select>
        </label>
        <button @click="resetView"><JIcon :icon="ICONS.resetView" />{{ t('重置视角') }}</button>
        <button @click="screenshot"><JIcon :icon="ICONS.screenshot" />{{ t('截图') }}</button>
      </div>
      <canvas
        ref="canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="updateHoverRoom(null)"
        @dragover.prevent="onCanvasDragOver"
        @dragleave="onCanvasDragLeave"
        @drop.prevent="onCanvasDrop"
        @contextmenu.prevent
      />
      <div v-if="!plan.rooms.length" class="empty">{{ t('还没有房间。先去 2D 平面图画一个，或者点「随机生成」。') }}</div>
      <div class="hud">
        <template v-if="!editing">{{ t('预览模式 · 左键旋转 · 右键平移 · 滚轮缩放 · 鼠标所指房间前的墙自动处理 · P 或 Esc 回到布置') }}</template>
        <template v-else-if="placing">
          <b>{{ t('摆放 {name}', { name: placingName }) }}</b> · {{ t('点击地面放下（自动贴墙对齐，Alt 关闭）· Q / E 旋转 90°（Shift 15°）· 按住 Shift 连续摆放 · Esc 取消') }}
        </template>
        <template v-else>{{ t('左键旋转 · 右键平移 · 滚轮缩放 · 点家具选中后拖动（自动贴墙对齐，Alt 关闭）· Q / E 旋转 · Delete 删除 · C 切换墙体显示 · F 重置视角 · P 预览') }}</template>
      </div>
    </div>

    <aside v-if="editing" class="panel">
      <section>
        <h3 class="ico-label"><JIcon :icon="VIEW_ICONS['3d']" class="ico-muted" />{{ t('沙盘') }}</h3>
        <div class="meta num">{{ planSize }} · {{ t('家具 {n} 件', { n: counts }) }}</div>
        <label class="row">
          <span>{{ t('墙高') }}</span>
          <input v-model.number="sandbox.wallHeight" type="range" min="40" max="240" step="10" />
          <span class="num val">{{ sandbox.wallHeight }}</span>
        </label>
        <div class="seg" :title="t('墙体显示 (C 切换)')">
          <button v-for="m in WALL_MODES" :key="m.id" :class="{ on: sandbox.wallMode === m.id }" :title="t(m.label)" :aria-label="t(m.label)" @click="sandbox.wallMode = m.id"><JIcon :icon="WALL_MODE_ICONS[m.id]" /></button>
        </div>
        <label v-if="sandbox.wallMode === 'fade' || sandbox.wallMode === 'cut'" class="row check"><input v-model="sandbox.cutawayHover" type="checkbox" /><JIcon :icon="ICONS.followCursor" class="ico-muted" />{{ t('跟随鼠标处理到所指房间') }}</label>
        <label v-if="sandbox.wallMode === 'cut' || sandbox.wallMode === 'down'" class="row">
          <span>{{ t('矮墙高度') }}</span>
          <input v-model.number="sandbox.cutHeight" type="range" min="10" max="150" step="10" />
          <span class="num val">{{ sandbox.cutHeight }}</span>
        </label>
        <label v-if="sandbox.wallMode === 'fade'" class="row">
          <span>{{ t('前墙不透明度') }}</span>
          <input v-model.number="sandbox.cutawayOpacity" type="range" min="0" max="80" step="5" />
          <span class="num val">{{ sandbox.cutawayOpacity }}%</span>
        </label>
        <div class="sky">
          <div class="sky-row">
            <JIcon :icon="ICONS.timeOfDay" class="ico-muted" />
            <input v-model.number="sandbox.time" type="range" min="0" max="24" step="0.05" class="sky-time" :aria-label="t('时刻')" :title="t('时刻')" />
            <span class="clock">{{ clock }}</span>
            <button class="sky-play icon-only" :class="{ on: sandbox.playing }" :title="sandbox.playing ? t('暂停') : t('播放时间流逝')" :aria-label="sandbox.playing ? t('暂停') : t('播放时间流逝')" @click="sandbox.playing = !sandbox.playing">
              <JIcon :icon="sandbox.playing ? ICONS.pause : ICONS.play" :size="14" />
            </button>
          </div>
          <div class="sky-row">
            <JIcon :icon="ICONS.date" class="ico-muted" />
            <select v-model.number="sandbox.month" class="sel-style" :aria-label="t('月份')">
              <option v-for="(m, i) in monthNames" :key="i" :value="i + 1">{{ m }}</option>
            </select>
            <select v-model.number="sandbox.day" class="sel-style num" :aria-label="t('日')">
              <option v-for="d in dayCount" :key="d" :value="d">{{ d }}</option>
            </select>
            <select v-model.number="sandbox.speed" class="sel-style num" :title="t('播放速度')" :aria-label="t('播放速度')">
              <option v-for="v in SPEEDS" :key="v" :value="v">{{ t('{n} 小时/秒', { n: v }) }}</option>
            </select>
          </div>
          <div class="sky-row">
            <JIcon :icon="ICONS.location" class="ico-muted" />
            <select class="sel-style" :value="sandbox.geo.id" :aria-label="t('地点')" @change="setCity(($event.target as HTMLSelectElement).value)">
              <option v-for="c in CITIES" :key="c.id" :value="c.id">{{ t(c.label) }}</option>
              <option value="custom">{{ t('自定经纬度') }}</option>
            </select>
            <template v-if="sandbox.geo.id === 'custom'">
              <input class="coord num" type="number" step="0.01" min="-90" max="90" :value="sandbox.geo.lat" :title="t('纬度（北为正）')" :aria-label="t('纬度（北为正）')" @change="setCoord('lat', +($event.target as HTMLInputElement).value)" />
              <input class="coord num" type="number" step="0.01" min="-180" max="180" :value="sandbox.geo.lon" :title="t('经度（东为正）')" :aria-label="t('经度（东为正）')" @change="setCoord('lon', +($event.target as HTMLInputElement).value)" />
            </template>
          </div>
          <label class="sky-row" :title="t('户型朝向：平面图上方偏离正北的角度，也可以在平面图右上角拖动指北针')">
            <JIcon :icon="ICONS.north" class="ico-muted" />
            <span>{{ t('朝向') }}</span>
            <input type="range" min="0" max="359" step="1" :value="northDeg" class="sky-time" @input="setNorth(+($event.target as HTMLInputElement).value)" @change="northCk = false" />
            <span class="clock">{{ northDeg }}°</span>
          </label>
          <div class="meta num">{{ sunInfo }}</div>
        </div>
        <div class="look">
          <button class="look-head" :aria-expanded="lookOpen" @click="toggleLooks">
            <JIcon :icon="ICONS.look" class="ico-muted" />
            <span>{{ t('画面效果') }}</span>
            <span class="look-cur">{{ t(currentLook.label) }}</span>
            <JIcon :icon="lookOpen ? ICONS.collapse : ICONS.expand" :size="14" class="ico-muted" />
          </button>
          <div v-if="lookOpen" class="look-grid">
            <button v-for="l in LOOKS" :key="l.id" class="look-card" :class="{ on: sandbox.look === l.id }" :title="t(l.desc)" @click="sandbox.look = l.id">
              <img v-if="lookThumbs[l.id]" :src="lookThumbs[l.id]" alt="" />
              <span v-else class="look-ph" />
              <span class="look-name">{{ t(l.label) }}</span>
            </button>
          </div>
          <div class="look-desc">{{ t(currentLook.desc) }}</div>
        </div>
        <label class="row check"><input v-model="sandbox.snap" type="checkbox" /><JIcon :icon="ICONS.snap" class="ico-muted" />{{ t('贴墙 / 对齐吸附') }} <span class="hint">{{ t('按住 Alt 临时关闭') }}</span></label>
        <label class="row">
          <span>{{ t('布置风格') }}</span>
          <select v-model="sandbox.style" class="sel-style">
            <option value="auto">{{ t('跟随住户') }}</option>
            <option value="random">{{ t('随机') }}</option>
            <option v-for="st in styleKeys" :key="st" :value="st">{{ t(STYLE_LABELS[st]) }}</option>
          </select>
        </label>
        <div class="btns">
          <button class="primary" @click="autoDecorate"><JIcon :icon="ICONS.autoFurnish" />{{ t('一键布置家具') }}</button>
          <button :disabled="!counts" @click="clearFurniture"><JIcon :icon="ICONS.clearFurniture" />{{ t('清空') }}</button>
        </div>
        <div class="btns">
          <button @click="resetView"><JIcon :icon="ICONS.resetView" />{{ t('重置视角') }}</button>
          <button @click="screenshot"><JIcon :icon="ICONS.screenshotPng" />{{ t('截图 PNG') }}</button>
        </div>
      </section>

      <section class="hh">
        <div class="hh-head">
          <h3 class="ico-label"><JIcon :icon="ICONS.household" class="ico-muted" />{{ t('住户') }}</h3>
          <span v-if="plan.household" class="tag">{{ t(KIND_LABELS[plan.household.kind]) }} · {{ t(STYLE_LABELS[plan.household.style]) }}</span>
          <span class="spacer" />
          <button class="mini" :title="t('重新推算住户并按新住户布置')" @click="rerollHousehold"><JIcon :icon="ICONS.rerollHousehold" :size="14" />{{ t('换一户人家') }}</button>
        </div>
        <div v-if="!plan.household" class="meta">{{ t('还没有住户设定。点「换一户人家」按户型推算一户，或直接「一键布置」。') }}</div>
        <div v-for="m in plan.household?.members ?? []" :key="m.id" class="member">
          <div class="m-line">
            <b>{{ tSoft(m.name) }}</b>
            <span class="m-role">{{ t(ROLE_LABELS[m.role]) }}</span>
            <span class="m-desc num">{{ describe(m) }}</span>
          </div>
          <div class="chips">
            <span v-for="tr in m.traits" :key="tr" class="chip trait">{{ t(TRAITS[tr].label) }}</span>
            <span v-for="i in m.interests" :key="i" class="chip">{{ t(INTERESTS[i].label) }}</span>
            <span class="chip style">{{ t(STYLE_LABELS[m.style]) }}</span>
          </div>
        </div>
      </section>

      <section v-if="appliances.length" class="wp">
        <div class="hh-head"><h3 class="ico-label"><JIcon :icon="ICONS.appliances" class="ico-muted" />{{ t('家电') }}</h3></div>
        <div v-for="f in appliances" :key="f.id" class="ap">
          <div class="ap-row">
            <span class="ap-name">{{ t(f.kind === 'fridge' ? '冰箱' : '洗衣机') }}</span>
            <select class="sel-style" :value="f.style ?? (f.kind === 'fridge' ? '3door' : 'drum')" @change="setAppliance(f.id, { style: ($event.target as HTMLSelectElement).value as never })">
              <option v-for="(label, k) in f.kind === 'fridge' ? FRIDGE_STYLES : WASHER_STYLES" :key="k" :value="k">{{ t(label) }}</option>
            </select>
          </div>
          <div class="wp-row">
            <button v-for="c in APPLIANCE_COLORS" :key="c" class="wp-sw" :class="{ on: f.color === c }" :style="{ background: c }" :title="c" @click="setAppliance(f.id, { color: c })" />
          </div>
        </div>
      </section>

      <section class="wp">
        <div class="hh-head">
          <h3 class="ico-label"><JIcon :icon="ICONS.wallpaper" class="ico-muted" />{{ t('墙纸') }}</h3>
          <span class="spacer" />
          <button class="mini" :title="t('按住户风格重新随机全屋墙纸')" @click="rerollWallpapers"><JIcon :icon="ICONS.wallpaperRandom" :size="14" />{{ t('全屋随机') }}</button>
        </div>
        <div class="row">
          <select v-model="wpRoomId" class="sel-style">
            <option v-for="r in paperRooms" :key="r.id" :value="r.id">{{ roomName(r.name) }}</option>
          </select>
          <button class="mini" :disabled="!wpRoom?.wallpaper" @click="setRoomWallpaper(wpRoomId, undefined)"><JIcon :icon="ICONS.wallpaperDefault" :size="14" />{{ t('默认') }}</button>
        </div>
        <template v-if="wpRoom">
          <div class="wp-row">
            <button v-for="c in WP_COLORS" :key="c" class="wp-sw" :class="{ on: wpRoom.wallpaper?.color === c && !wpRoom.wallpaper?.pattern }" :style="{ background: c }" :title="c" @click="setRoomWallpaper(wpRoomId, { color: c, trim: wpRoom.wallpaper?.trim })" />
          </div>
          <div class="wp-row">
            <button
              v-for="k in WP_PATTERNS"
              :key="k"
              class="wp-pat"
              :class="{ on: wpRoom.wallpaper?.pattern?.kind === k }"
              :title="k"
              @click="setRoomWallpaper(wpRoomId, wpPattern(k))"
            >
              <img :src="patternPreview(wpPattern(k).pattern!, 36)" alt="" />
            </button>
          </div>
          <div class="wp-sub ico-label"><JIcon :icon="ICONS.trim" :size="14" />{{ t('边饰') }}</div>
          <div class="wp-row">
            <button v-for="tm in TRIMS" :key="tm.id" class="trim-btn" :class="{ on: trimId(wpRoom.wallpaper?.trim) === tm.id }" @click="setTrim(tm.id)">{{ t(tm.label) }}</button>
          </div>
          <div v-if="wpRoom.wallpaper?.trim" class="wp-row">
            <button v-for="c in TRIM_COLORS" :key="c" class="wp-sw" :class="{ on: trimColor === c }" :style="{ background: c }" :title="c" @click="setTrim(trimId(wpRoom.wallpaper?.trim), c)" />
          </div>
        </template>
      </section>

      <section class="cl">
        <div class="hh-head">
          <h3 class="ico-label"><JIcon :icon="ICONS.checklist" class="ico-muted" />{{ t('检查清单') }}</h3>
          <span class="tag num" :class="{ bad: missingItems.length }">{{ missingItems.length ? t('缺 {n} 项', { n: missingItems.length }) : t('齐全') }}</span>
          <span class="spacer" />
          <button class="mini icon-only" :title="clOpen ? t('收起') : t('展开')" :aria-label="clOpen ? t('收起') : t('展开')" :aria-expanded="clOpen" @click="clOpen = !clOpen"><JIcon :icon="clOpen ? ICONS.collapse : ICONS.expand" :size="14" /></button>
          <button class="mini primary" :disabled="!missingItems.some((i) => i.fix)" @click="fixChecklist(missingItems)"><JIcon :icon="ICONS.checkFixAll" :size="14" />{{ t('一键补齐') }}</button>
        </div>
        <template v-if="clOpen">
          <div v-for="[room, items] in checkGroups" :key="room" class="cl-room">
            <div class="cl-name">{{ roomName(room) }}</div>
            <div v-for="it in items" :key="it.key" class="cl-item" :class="{ ok: it.builtin || it.have >= it.need }">
              <JIcon class="mark" :icon="it.builtin || it.have >= it.need ? ICONS.checkOk : ICONS.checkMissing" :size="14" />
              <span class="cl-label">{{ tAuto(it.label) }}</span>
              <span v-if="!it.builtin && it.need > 1" class="num cl-count">{{ it.have }}/{{ it.need }}</span>
              <span v-if="it.builtin" class="cl-hint">{{ t('内置') }}</span>
              <button v-else-if="it.have < it.need && it.fix" class="mini" @click="fixChecklist([it])"><JIcon :icon="ICONS.checkFixOne" :size="12" />{{ t('补上') }}</button>
              <span v-else-if="it.have < it.need" class="cl-hint">{{ t('需在平面图添加') }}</span>
            </div>
          </div>
        </template>
      </section>

      <section v-if="selectedFurniture && selectedDef" class="sel">
        <h3>{{ displayName(selectedDef) }}</h3>
        <div class="meta num">
          {{ selectedDef.w }} × {{ selectedDef.d }} × {{ selectedDef.h }} cm · {{ Math.round(selectedFurniture.rot) }}°<template v-if="selectedFurniture.z"> · {{ t('离地 {n} cm', { n: selectedFurniture.z }) }}</template>
        </div>
        <div v-if="selectedSizes.length > 1" class="sizes">
          <button v-for="sz in selectedSizes" :key="sz.id" :class="{ on: sz.id === selectedDef.id }" :title="sz.w + '×' + sz.d + '×' + sz.h" @click="swapSize(sz.id)">{{ variantLabel(sz) }}</button>
        </div>
        <ColorEditor
          :def="selectedDef"
          :color="(selectedFurniture.color ?? 0) % selectedDef.palettes.length"
          :colors="selectedFurniture.colors"
          :patterns="selectedFurniture.patterns"
          @patterns="(p) => commitFurniturePatterns(selectedFurniture!.id, p)"
          :same-count="sameKind(selectedFurniture).length"
          @preset="(i) => setFurniturePreset(selectedFurniture!.id, i)"
          @preview="(c) => previewFurnitureColors(selectedFurniture!.id, c)"
          @commit="(c) => commitFurnitureColors(selectedFurniture!.id, c)"
          @apply-same="applyColorsToSame(selectedFurniture!.id)"
        />
        <div class="rot-row">
          <span class="rot-label">{{ t('角度') }}</span>
          <input
            class="rot-slider"
            type="range"
            min="0"
            max="359"
            step="1"
            :value="Math.round(selectedFurniture.rot)"
            :aria-label="t('角度')"
            @pointerdown="checkpointPlan()"
            @input="setSelectedFurnitureRotation(Number(($event.target as HTMLInputElement).value))"
            @change="settle()"
          />
          <input
            class="rot-num num"
            type="number"
            min="0"
            max="359"
            step="1"
            :value="Math.round(selectedFurniture.rot)"
            :aria-label="t('角度')"
            @change="rotateSelectedFurniture(Number(($event.target as HTMLInputElement).value) - selectedFurniture!.rot)"
          /><span class="rot-unit">°</span>
        </div>
        <p class="rot-hint">{{ t('按住 R 拖动鼠标自由旋转，按住 Shift 每 15° 吸附') }}</p>
        <div class="btns">
          <button class="rot" :title="t('逆时针旋转 90°')" :aria-label="t('逆时针旋转 90°')" @click="rotateSelectedFurniture(-90)"><JIcon :icon="ICONS.rotateCcw" /><span class="num">90°</span></button>
          <button class="rot" :title="t('顺时针旋转 90°')" :aria-label="t('顺时针旋转 90°')" @click="rotateSelectedFurniture(90)"><JIcon :icon="ICONS.rotateCw" /><span class="num">90°</span></button>
          <button @click="duplicateSelection"><JIcon :icon="ICONS.duplicate" />{{ t('复制') }}</button>
          <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }}</button>
        </div>
      </section>

      <section class="lib">
        <h3 class="ico-label"><JIcon :icon="VIEW_ICONS.lib" class="ico-muted" />{{ t('家具') }}</h3>
        <label class="search-box">
          <JIcon :icon="ICONS.search" :size="14" class="ico-muted" />
          <input v-model="libFilter.query" class="search" :placeholder="t('搜索…')" :aria-label="t('搜索…')" />
        </label>
        <div class="cats">
          <button :class="{ on: libFilter.category === 'all' }" @click="libFilter.category = 'all'"><JIcon :icon="ICONS.allCategories" :size="14" />{{ t('全部') }}</button>
          <button v-for="c in categories" :key="c" :class="{ on: libFilter.category === c }" @click="libFilter.category = c"><JIcon :icon="CATEGORY_ICONS[c]" :size="14" />{{ t(CATEGORY_LABELS[c]) }}</button>
        </div>
        <div class="filter-row">
          <select v-model="libFilter.style">
            <option value="all">{{ t('全部风格') }}</option>
            <option v-for="st in styleKeys" :key="st" :value="st">{{ t(STYLE_LABELS[st]) }}</option>
          </select>
          <select v-model="libFilter.size">
            <option value="all">{{ t('全部尺寸') }}</option>
            <option v-for="sz in sizeKeys" :key="sz" :value="sz">{{ t(SIZE_LABELS[sz]) }}</option>
          </select>
        </div>
        <div class="grid">
          <button
            v-for="g in placeable"
            :key="g.rep.id"
            v-memo="[g, thumbs[g.rep.id + '#' + thumbColor(g.rep.id)], placing?.asset === g.rep.id, lang]"
            v-thumb="[g.rep.id, thumbColor(g.rep.id)]"
            class="item"
            :class="{ on: placing?.asset === g.rep.id }"
            :title="displayName(g.rep) + '  ' + g.rep.w + '×' + g.rep.d + '×' + g.rep.h + 'cm' + (g.sizes > 1 ? t('（共 {n} 种规格，放下后可切换）', { n: g.sizes }) : '')"
            draggable="true"
            @click="startPlacing(g.rep.id)"
            @dragstart="onCardDragStart($event, g.rep.id)"
            @dragend="onCardDragEnd"
          >
            <img v-if="thumbs[g.rep.id + '#' + thumbColor(g.rep.id)]" :src="thumbs[g.rep.id + '#' + thumbColor(g.rep.id)]" alt="" />
            <span v-else class="ph" />
            <span class="name">{{ assetName(g.rep) }}</span>
            <span v-if="g.sizes > 1" class="multi num">{{ g.sizes }}</span>
          </button>
          <div v-if="!placeable.length" class="none">{{ t('没有匹配的家具') }}</div>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.sandbox {
  flex: 1;
  display: flex;
  min-height: 0;
}
.viewport {
  flex: 1;
  position: relative;
  min-width: 0;
  background: radial-gradient(ellipse at 50% 35%, #fdfdfb 0%, #f1f3ef 55%, #e3e9e5 100%);
}
.viewport canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}
.viewport.hover canvas {
  cursor: grab;
}
.viewport.placing canvas {
  cursor: copy;
}
.modes {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  padding: 3px;
  gap: 2px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  z-index: 1;
}
.modes button {
  gap: 6px;
  height: 30px;
  border-color: transparent;
  background: transparent;
  border-radius: 6px;
  padding: 0 14px;
}
.modes button.on {
  background: var(--surface);
  color: var(--text);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
  box-shadow: var(--shadow-sm);
}
.preview-bar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px 5px 12px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  font-size: var(--fs-sm);
  z-index: 1;
}
.preview-bar label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  pointer-events: none;
}
.hud {
  position: absolute;
  left: 12px;
  bottom: 12px;
  right: 12px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  pointer-events: none;
}
.hud b {
  color: var(--accent-strong);
}
.panel {
  width: 340px;
  flex: none;
  border-left: 1px solid var(--border);
  background: var(--surface-2);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
h3 {
  margin: 0 0 10px;
  font-size: var(--fs-md);
  font-weight: 700;
}
.meta {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-bottom: 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: var(--fs-sm);
}
.row input {
  flex: 1;
  accent-color: var(--accent);
}
.seg {
  display: flex;
  padding: 2px;
  gap: 2px;
  background: var(--hover);
  border-radius: 7px;
  margin-bottom: 8px;
}
.seg button {
  flex: 1;
  height: 30px;
  padding: 0;
  font-size: var(--fs-xs);
  border-color: transparent;
  background: transparent;
  border-radius: 5px;
}
.seg button.on {
  background: var(--surface);
  border-color: var(--border);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.preview-bar button {
  height: 30px;
}
/* 时间与太阳 */
.pb-time input {
  width: 110px;
  accent-color: var(--accent);
}
.sky {
  margin-bottom: 10px;
}
.sky-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: var(--fs-sm);
}
.sky-row select {
  min-width: 0;
}
.sky-time {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.clock {
  font-variant-numeric: tabular-nums;
  min-width: 3.2em;
  text-align: right;
}
.sky-play {
  height: var(--control-h-sm);
}
.sky-play.on {
  color: var(--accent-strong);
  border-color: var(--accent);
}
.coord {
  width: 72px;
  font: inherit;
  font-size: var(--fs-sm);
  height: var(--control-h);
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
}
/* 3D 指北针 */
.compass {
  position: absolute;
  right: 12px;
  bottom: 30px;
  z-index: 1;
  pointer-events: auto;
}
.compass svg {
  display: block;
}
.compass-bg {
  fill: rgba(255, 255, 255, 0.82);
  stroke: var(--border);
}
.compass-n {
  fill: #e0607e;
}
.compass-s {
  fill: var(--text-faint);
}
.compass-t {
  font-size: 7px;
  font-weight: 700;
  fill: var(--text);
}
/* 夜里视口上的小字换成浅色 */
.viewport.night .hud {
  color: rgba(230, 234, 245, 0.7);
}
/* 画面效果选择器 */
.look {
  margin-bottom: 10px;
}
.look-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--control-h);
  padding: 0 8px;
  font-size: var(--fs-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
}
.look-cur {
  margin-left: auto;
  color: var(--text-muted);
}
.look-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 8px;
}
.look-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  height: auto;
  padding: 3px 3px 4px;
  font-size: var(--fs-xs);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.look-card img,
.look-ph {
  display: block;
  width: 100%;
  aspect-ratio: 8 / 5;
  object-fit: cover;
  border-radius: 4px;
  background: var(--hover);
}
.look-card.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-ring);
  color: var(--accent-strong);
}
.look-name {
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.look-desc {
  margin-top: 6px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.preview-bar select {
  font: inherit;
  font-size: var(--fs-sm);
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.search,
.filter-row select,
.sel-style {
  font: inherit;
  font-size: var(--fs-sm);
  height: var(--control-h);
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
}
.search {
  width: 100%;
}
/* 搜索框：放大镜图标压在输入框左侧 */
.search-box {
  position: relative;
  display: block;
  margin-bottom: 8px;
}
.search-box > svg {
  position: absolute;
  left: 7px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
.search-box .search {
  padding-left: 26px;
}
.sel-style {
  flex: 1;
}
.filter-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.filter-row select {
  flex: 1;
}
.multi {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: var(--fs-xs);
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--text);
  color: var(--text-inverse);
}
.none {
  grid-column: 1 / -1;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.sizes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.sizes button {
  height: var(--control-h-sm);
  padding: 0 10px;
  font-size: var(--fs-xs);
}
.sizes button.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.pal-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
.pal-style {
  width: 52px;
  flex: none;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.hh-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-bottom: 10px;
}
.hh-head h3 {
  margin: 0;
}
/* 标题行放不下时按钮换到下一行，仍靠右 */
.hh-head .spacer + .mini {
  margin-left: auto;
}
.spacer {
  flex: 1;
}
.tag {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.mini {
  height: var(--control-h-sm);
  padding: 0 10px;
  font-size: var(--fs-xs);
  gap: 4px;
}
.mini.icon-only {
  width: var(--control-h-sm);
  padding: 0;
}
.member {
  padding: 8px 0;
  border-top: 1px dashed var(--border);
}
.m-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--fs-sm);
}
.m-role {
  font-size: var(--fs-xs);
  padding: 0 8px;
  border-radius: 999px;
  background: var(--hover);
  color: var(--text-muted);
}
.m-desc {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.chip {
  font-size: var(--fs-xs);
  line-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.chip.trait {
  background: var(--accent-weak);
  border-color: transparent;
}
.chip.style {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  font-weight: 600;
}
.tag.bad {
  color: var(--danger);
  font-weight: 600;
}
.mini.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--text-inverse);
}
.wp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.trim-btn {
  font-size: var(--fs-sm);
  height: var(--control-h-sm);
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.trim-btn.on {
  background: var(--accent-weak);
  border-color: var(--accent-ring);
  color: var(--accent-strong);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.ap + .ap {
  margin-top: 8px;
}
.ap-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ap-name {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  min-width: 3em;
}
.wp-sub {
  display: flex;
  margin-top: 8px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.wp-sw {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.wp-sw.on,
.wp-pat.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.wp-pat {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.wp-pat img {
  width: 100%;
  height: 100%;
  display: block;
}
.cl-room {
  margin-top: 6px;
}
.cl-name {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 2px;
}
.cl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  padding: 3px 0;
  min-height: 30px;
}
.cl-item .mark {
  flex: none;
  color: var(--danger);
}
.cl-item.ok .mark {
  color: var(--ok);
}
.cl-item.ok .cl-label {
  color: var(--text-muted);
}
.cl-label {
  flex: 1;
}
.cl-count {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.cl-hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.check {
  gap: 6px;
  margin-bottom: 4px;
}
.check input {
  flex: none;
}
.hint {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.val {
  width: 34px;
  text-align: right;
}
.btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.btns button {
  flex: 1;
  min-height: var(--control-h);
}
.btns .rot {
  gap: 3px;
}
.swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sw {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border);
}
.sw.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.lib {
  flex: 1;
  border-bottom: 0;
}
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.cats button {
  gap: 5px;
  height: var(--control-h-sm);
  padding: 0 10px;
  border-radius: 999px;
  font-size: var(--fs-sm);
}
.cats button.on {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 2px 6px;
  border-radius: 8px;
  background: var(--surface);
  gap: 2px;
}
.item.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-ring);
}
.item img,
.ph {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  display: block;
}
.ph {
  background: var(--hover);
  border-radius: 6px;
}
.name {
  font-size: var(--fs-xs);
  line-height: 1.3;
  text-align: center;
  /* 英文 / 日文名字更长：最多两行，再长才省略（完整名字在 title 里） */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;
  max-width: 100%;
  min-height: 2.6em;
}
.rot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.rot-label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  flex: none;
}
.rot-slider {
  flex: 1;
  min-width: 0;
}
.rot-num {
  width: 56px;
  height: var(--control-h-sm);
  text-align: right;
}
.rot-unit {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  margin-left: -4px;
}
.rot-hint {
  margin: 4px 0 0;
  font-size: var(--fs-xs);
  color: var(--text-faint);
}
</style>
