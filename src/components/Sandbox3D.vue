<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ASSET_MAP, STYLE_LABELS, type StyleTag } from '../three/assets'
import { GROUP_NAMES, LIB_ROOMS, ROOM_NAMES_LIB } from '../three/groups'
import { freezeMatrices, syncMatrix } from '../three/matrices'
import { BASE, applyCutaway, bendToWalls, floorY, isPlant, openingInfos, stepCutaway, furnitureModel, placeFurniture, roomAt, type WallLook } from '../three/house'
import { buildBuilding, type FloorGroup } from '../three/building'
import { carSize } from '../three/exterior'
import { carChoice, carLabel, parkingIndex, parkingTarget, siteTargets, targetTitle, targetValid, type SiteTarget } from '../siteEdit'
import SiteEditor from './SiteEditor.vue'
import OpeningEditor from './OpeningEditor.vue'
import { openingFrame } from '../three/openingPick'
import { findFixtureModel, firstHouseHit, fixtureFrame, furnitureLimit, type HouseHit, type HouseHitKind } from '../three/fixturePick'
import FixtureEditor from './FixtureEditor.vue'
import { baseFloorId, floorBelow, floorById, floorOf, floorView, isMultiFloor, planFloors } from '../floors'
import FloorBar from './FloorBar.vue'
import FloorRail from './FloorRail.vue'
import { withStairHoles } from '../stairs'
import { overlapsOthers, snapFurniture, snapToWall, type Guide } from '../snap'
import { fitOnSurface, pickSurface, propsOn, snapToClip, snapToHook } from '../surface'
import { pickTub, tubGuides } from '../tubTop'
import { createStage, fitSun, frameCamera, setStageQuality, type Stage } from '../three/stage'
import { attachPost, LOOKS, LOOK_MAP, type LookId, type Post } from '../three/post'
import { CITIES, MONTH_DAYS, compassAxes, skyState, type SkyState } from '../three/sky'
import { IndoorLights, KELVIN_MAX, KELVIN_MIN, LIGHT_MODES, POOL_HIGH, POOL_LOW, POWER_MAX, POWER_MIN, autoLevel, diningKey, isLampAsset, lightColor, type LightMode } from '../three/lights'
import { disposeUnshared } from '../three/toon'
import { poseDoors } from '../three/kit'
import { useThumbs } from '../three/thumbs'
import { normalizeColor, paletteStyleOf } from '../three/stylePalettes'
import { artKindOf, artLabel, cycleArt, parseArt, pickArt, rerollArt } from '../three/artwork'
import { coverInto, liveCapture } from '../three/planThumb'
import { FxLayer } from '../three/fx'
import { SelectFrame, WallGuide } from '../three/selectFrame'
import { ActorLayer } from '../three/actors'
import { Walker, ceilings, drawMiniMap, miniMapData, type MiniMapData } from '../three/walk'
import { Highlight } from '../three/highlight'
import ColorEditor from './ColorEditor.vue'
import SandboxOverlay from './SandboxOverlay.vue'
import BlueprintBar from './BlueprintBar.vue'
import { BlueprintView } from '../three/blueprint'
import { blueprint, unitOf } from '../blueprintPrefs'
import BottomSheet, { type SheetSnap } from './BottomSheet.vue'
import { device, gfx, layout, lowPower, setQuality, LONG_PRESS_MS, TAP_SLOP, type Quality } from '../ui/device'
import { useProgressive } from '../ui/progressive'
import { overlays } from '../ui/feedback'
import { sandboxBridge } from '../ui/sandboxBridge'
import { runBusy } from '../ui/feedback'
import { saved, toast } from '../saved'
import { JIcon } from '@jannchie/icons-vue'
import { FIXTURE_ICONS, GROUP_ICONS, ICONS, TOOL_ICONS, VIEW_ICONS, WALL_MODE_ICONS } from '../ui/icons'
import { SIZE_LABELS, assetName, browse, canHang, cardName, displayName, groupsOf, formFor, paletteFor, siblings, typesIn, variantLabel, type Filter, type SizeClass } from '../three/catalog'
import { typeLabel } from '../three/typeLabels'
import { INTERESTS, KIND_LABELS, LV_LABELS, ROLE_LABELS, TRAITS, describe, levelOf, memberRooms } from '../household'
import { checklist, missing } from '../checklist'
import { accentOf } from '../wallpaper'
import { patternPreview } from '../three/fabric'
import type { PatternKind } from '../three/patterns'
import { isTyping } from '../dom'
import { lang, roomName, t, tAuto, tSoft } from '../i18n'
import { FACADE_KINDS, FENCE_KINDS, FIXTURES, OPENING_LABELS, ROOF_KINDS, bbox, centroid, edgesOf, pointInPolygon, type Furniture, type Plan, type Room, type WallTrim } from '../model'
import { roomStyles } from '../decorate'
import { wallThicknessAt } from '../walls'
import {
  addFurniture,
  checkpoint,
  deleteSelection,
  duplicateSelection,
  findFurniture,
  findRoom,
  mutate,
  placing,
  plan,
  rotateSelectedFixture,
  rotateSelectedFurniture,
  setSelectedFurnitureRotation,
  turnAngle,
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
  syncSkyToNow,
  setRoomLight,
  setRoomLightK,
  setFurnitureLight,
  setFurnitureOpen,
  setFurnitureArt,
  FOV_MIN,
  FOV_MAX,
  activeFloor,
  floorShow,
  setFloor,
} from '../store'

const host = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
let stage: Stage
/** 画面效果（后处理），选「原样」时不建 composer */
let post: Post
let controls: OrbitControls
/** 3D 设计图（three/blueprint.ts）：第一次打开时才建，和沙盘共用画布 */
let bp: BlueprintView | null = null
let house: THREE.Group | null = null
/** 各楼层的模型（单层户型只有一项）：墙体压低只作用于当前层 */
let floorGroups: FloorGroup[] = []
const furnRoot = new THREE.Group()

// ---------- 多楼层：当前层、各层的显示动画 ----------

/** 当前楼层的子户型（原始对象）：拖动、吸附、摆放只看它；上层的楼梯洞口当作障碍（摆上去会标红） */
const fv = () => {
  const raw = toRaw(plan.value)
  return withStairHoles(raw, floorView(raw, activeFloor.value), activeFloor.value)
}
/** 新摆的东西的 floor 字段（最底层不写） */
const activeFloorField = () => (activeFloor.value === baseFloorId(plan.value) ? undefined : activeFloor.value)
/**
 * 每层的显示状态：extra = 叠在 elevation 上的偏移（分层拉开 / 隐藏时往上滑走），shown = 是否显示。
 * 目标由「楼层显示」和当前层决定，每帧缓动过去（floorTargets / stepFloors）。
 */
const floorAnim = new Map<string, { extra: number; target: number; show: boolean; hideAt: boolean; alpha: number }>()
/** 分层拉开时层与层之间多拉开的距离 */
const EXPLODE_GAP = 230
/** 楼层淡入淡出的时长（秒） */
const FLOOR_FADE_S = 0.45
/** 只显示到当前层时，上面的层往上滑走的距离（滑完再隐藏） */
const HIDE_LIFT = 320
let floorsMoving = false
/** 家具按楼层分组：组的 y = 这一层的 extra（家具模型自己的 y 已经含楼层 elevation） */
const furnLayers = new Map<string, THREE.Group>()
function furnLayer(id: string) {
  let g = furnLayers.get(id)
  if (!g) {
    g = new THREE.Group()
    g.userData.floorId = id
    // 静态矩阵：楼层动画挪它时在 applyFloorPose 里手动更新
    g.matrixAutoUpdate = false
    furnLayers.set(id, g)
    furnRoot.add(g)
  }
  return g
}
/** 某层当前的抬升（elevation + 动画偏移） */
function liftOf(id: string) {
  return (floorById(plan.value, id)?.elevation ?? 0) + (floorAnim.get(id)?.extra ?? 0)
}
/** 当前楼层地面的世界高度 */
const activeY = () => liftOf(activeFloor.value)
/** 这一层现在看得见吗（隐藏动画结束前仍算看得见） */
const floorShown = (id: string) => floorAnim.get(id)?.show ?? true
/** 按「楼层显示」和当前层算各层的目标 */
function floorTargets(snap = false) {
  const fs = planFloors(plan.value)
  const ai = Math.max(0, fs.findIndex((f) => f.id === activeFloor.value))
  const multi = isMultiFloor(plan.value)
  for (const id of floorAnim.keys()) if (!fs.some((f) => f.id === id)) floorAnim.delete(id)
  fs.forEach((f, i) => {
    let st = floorAnim.get(f.id)
    if (!st) floorAnim.set(f.id, (st = { extra: 0, target: 0, show: true, hideAt: false, alpha: 1 }))
    // 外观视图：全部楼层叠好
    const show = fullView() ? 'all' : floorShow.value
    const hide = multi && show === 'upto' && i > ai
    st.target = !multi ? 0 : show === 'explode' ? i * EXPLODE_GAP : hide ? HIDE_LIFT : 0
    st.hideAt = hide
    // 要显示的层：先露出来再滑下去
    if (!hide) st.show = true
    if (snap) {
      st.extra = st.target
      st.show = !hide
      st.alpha = hide ? 0 : 1
    }
  })
  floorsMoving = true
  applyFloorPose()
}
/** 每帧推进楼层动画；返回是否还在动 */
function stepFloors(dt: number) {
  if (!floorsMoving) return false
  let busy = false
  const k = 1 - Math.exp(-dt * 6)
  for (const st of floorAnim.values()) {
    // 淡入淡出和滑动一起走：藏起来的层边往上滑边变透明，回来时边落下边显现。
    // 透明度按固定时长匀速推进（显示时再套 smoothstep），不用指数缓动——那样头几帧就淡没了，看不清过程
    const at = st.hideAt ? 0 : 1
    if (st.alpha !== at) {
      const step = dt / FLOOR_FADE_S
      st.alpha = at > st.alpha ? Math.min(at, st.alpha + step) : Math.max(at, st.alpha - step)
      busy = true
    }
    const d = st.target - st.extra
    if (Math.abs(d) < 0.5 && st.alpha === at) {
      st.extra = st.target
      if (st.hideAt) st.show = false
    } else {
      if (Math.abs(d) >= 0.5) st.extra += d * k
      else st.extra = st.target
      busy = true
    }
  }
  applyFloorPose()
  floorsMoving = busy
  return true
}
/**
 * 整层淡入淡出，效果要像「整层作为一张图层调透明度」：
 * 每个网格各自半透明的话，背面、内墙、家具会互相透出来，乱成一团。所以淡出期间每个网格挂一个只写深度的替身
 * （透明队列里先画，renderOrder 小），再画半透明的颜色（depthFunc ≤）：同一层里只有最前面的表面上色，
 * 后面的被自己层的深度挡掉，整层均匀地透出下层。后处理（夜晚、画面效果）照常作用在一起。
 * 各层共用同一批缓存材质，所以渐变期间换上这一层自己的透明副本，完全不透明后换回。
 * 墙体让开（stepCutaway）也会换材质：这里在每帧渲染前最后统一套用（syncFloorFades），以这里为准。
 * 描边外壳不透明，淡出时藏起来；淡到一半以下不再投影。
 */
const FADE_ORDER = 20
const depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true })
const floorFadeMats = new Map<string, WeakMap<THREE.Material, THREE.Material>>()
function fadeFloor(root: THREE.Object3D, floorId: string, alpha: number) {
  const faded = alpha < 0.995
  if (!faded && !root.userData.floorFaded) return
  let cache = floorFadeMats.get(floorId)
  if (!cache) floorFadeMats.set(floorId, (cache = new WeakMap()))
  const ghost = (m: THREE.Material) => {
    let g = cache!.get(m)
    if (!g) {
      g = m.clone()
      g.onBeforeCompile = m.onBeforeCompile
      g.customProgramCacheKey = m.customProgramCacheKey
      g.transparent = true
      g.depthWrite = false
      g.depthFunc = THREE.LessEqualDepth
      g.userData.baseOpacity = m.transparent ? m.opacity : 1
      g.userData.floorGhost = true
      // 记住原材质：别的地方（墙体让开）可能把副本当成实心材质记下来，靠它找回原件
      g.userData.floorSource = m
      cache!.set(m, g)
    }
    g.opacity = (g.userData.baseOpacity as number) * alpha
    return g
  }
  const meshes: THREE.Mesh[] = []
  root.traverse((n) => {
    if (n.userData.isOutline) {
      if (n.userData.fadeHidden === undefined) n.userData.fadeHidden = !n.visible
      n.visible = !faded && !n.userData.fadeHidden
      if (!faded) delete n.userData.fadeHidden
      return
    }
    if ((n as THREE.Mesh).isMesh && !n.userData.fadeTwin) meshes.push(n as THREE.Mesh)
  })
  for (const mesh of meshes) {
    const ud = mesh.userData
    if (faded) {
      // 当前材质若不是我们的透明副本，就是「实心」材质（可能刚被墙体让开换过），记下来
      ud.floorSolid = solidOf(mesh.material as THREE.Material | THREE.Material[])
      const solid = ud.floorSolid as THREE.Material | THREE.Material[]
      mesh.material = Array.isArray(solid) ? solid.map(ghost) : ghost(solid)
      if (ud.floorOrder === undefined) {
        ud.floorOrder = mesh.renderOrder
        ud.floorShadow = mesh.castShadow
      }
      mesh.renderOrder = FADE_ORDER + 1
      mesh.castShadow = !!ud.floorShadow && alpha > 0.5
      // 深度替身：共用几何体，跟着网格走（作为子节点）；原本就透明的（玻璃）不写深度，免得挡住后面的东西
      const glassy = (Array.isArray(solid) ? solid : [solid]).every((m) => m.transparent)
      if (!ud.floorTwin && !glassy && !(mesh as THREE.InstancedMesh).isInstancedMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const twin = new THREE.Mesh(mesh.geometry, depthOnlyMat)
        twin.userData.fadeTwin = true
        twin.renderOrder = FADE_ORDER
        twin.raycast = () => {}
        mesh.add(twin)
        ud.floorTwin = twin
      }
    } else if (ud.floorSolid || isFloorGhost(mesh.material as THREE.Material | THREE.Material[])) {
      mesh.material = ud.floorSolid ?? solidOf(mesh.material as THREE.Material | THREE.Material[])
      mesh.renderOrder = ud.floorOrder ?? 0
      mesh.castShadow = !!ud.floorShadow
      ;(ud.floorTwin as THREE.Mesh | undefined)?.removeFromParent()
      delete ud.floorSolid
      delete ud.floorTwin
      delete ud.floorOrder
      delete ud.floorShadow
    }
  }
  root.userData.floorFaded = faded
}
/** 材质（或材质数组）里的楼层淡出副本换回原材质 */
const unghost = (m: THREE.Material) => ((m.userData.floorSource as THREE.Material | undefined) ?? m)
function solidOf(m: THREE.Material | THREE.Material[]) {
  return Array.isArray(m) ? m.map(unghost) : unghost(m)
}
const isFloorGhost = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]).some((x) => !!x?.userData?.floorGhost)

/** 渲染前统一套用各层的淡入淡出（在墙体让开之后，以楼层淡出为准） */
/** 某层现在显示的不透明度（匀速推进的进度套 smoothstep） */
function floorAlpha(id: string) {
  const t = floorAnim.get(id)?.alpha ?? 1
  return t * t * (3 - 2 * t)
}
function syncFloorFades() {
  for (const fg of floorGroups) fadeFloor(fg.group, fg.floor.id, floorAlpha(fg.floor.id))
  for (const [id, g] of furnLayers) fadeFloor(g, id, floorAlpha(id))
  // 角色按所在楼层（走楼梯时按走到的那一层）淡入淡出
  actors.relayout()
}

/**
 * 预热楼层淡入淡出的着色器：透明副本（和深度替身的 depthOnlyMat）是新的着色器变体，被藏起来的楼层的原材质也从没画过，
 * 第一次切换楼层时要同步编译十来个程序（实测卡 2 秒多）。多层户型重搭后空闲时，各层原样编一遍，
 * 再用 fadeFloor 临时翻到另一种状态（显示的层淡出、藏起来的层显示）编一遍，立刻复原；compileAsync 在后台编译（KHR_parallel_shader_compile）。
 * 直接画到屏幕和经后处理画到渲染目标是两种变体，两种都编。主线程约 0.2 秒，所以只在重搭房子时做。
 */
let warmTimer = 0
let warmTarget: THREE.WebGLRenderTarget | null = null
function prewarmFloorFade() {
  clearTimeout(warmTimer)
  if (!isMultiFloor(plan.value)) return
  warmTimer = window.setTimeout(() => {
    if (!stage || !isMultiFloor(plan.value)) return
    // 正在淡入淡出的层不碰（它的程序本来就在编了）。「只到当前层」藏起来的上层（完全淡出）也要编：
    // 它现在挂的是透明副本，原材质（墙纸花纹、屏幕等）一次都没编过，第一次切上去会现编好几个程序
    const roots: [THREE.Object3D, string][] = [
      ...floorGroups.map((fg) => [fg.group, fg.floor.id] as [THREE.Object3D, string]),
      ...[...furnLayers].map(([id, g]) => [g, id] as [THREE.Object3D, string]),
      ...actors.roots(),
    ].filter(([root, id]) => !root.userData.floorFaded || floorAlpha(id) <= 0)
    const renderer = stage.renderer
    const prev = renderer.getRenderTarget()
    const target = (warmTarget ??= new THREE.WebGLRenderTarget(1, 1))
    const compile = () => {
      for (const t of [null, target]) {
        renderer.setRenderTarget(t)
        for (const [root] of roots) renderer.compileAsync(root, stage.camera, stage.scene).catch(() => {})
      }
    }
    try {
      // 先按现状编一遍，再把每层翻到另一种状态（显示的层套上淡出，藏起来的层换回原材质）再编一遍
      compile()
      const hidden = roots.filter(([root]) => root.userData.floorFaded).map(([root]) => root)
      for (const [root, id] of roots) fadeFloor(root, id, root.userData.floorFaded ? 1 : 0.5)
      compile()
      // 藏起来的层的贴图（墙纸、屏幕、花纹）也从没上传过：顺手传上去，切过去的那一帧少卡几十毫秒
      const seen = new Set<THREE.Texture>()
      for (const root of hidden)
        root.traverse((o) => {
          const m = (o as THREE.Mesh).material
          if (!m) return
          for (const mat of Array.isArray(m) ? m : [m])
            for (const v of Object.values(mat))
              if ((v as THREE.Texture | null)?.isTexture && !seen.has(v as THREE.Texture)) {
                seen.add(v as THREE.Texture)
                renderer.initTexture(v as THREE.Texture)
              }
        })
    } finally {
      renderer.setRenderTarget(prev)
      for (const [root, id] of roots) fadeFloor(root, id, floorAlpha(id))
    }
  }, 400)
}

/** 按动画状态摆好各层的房子、家具、宠物、灯 */
function applyFloorPose() {
  for (const fg of floorGroups) {
    const st = floorAnim.get(fg.floor.id)
    fg.group.visible = st?.show ?? true
    // 房子、家具都是静态矩阵（matrices.ts）：只在这一层真的挪了时重算它这棵子树
    const y = fg.floor.elevation + (st?.extra ?? 0)
    if (fg.group.position.y !== y) {
      fg.group.position.y = y
      syncMatrix(fg.group)
    }
  }
  for (const [id, g] of furnLayers) {
    const st = floorAnim.get(id)
    g.visible = st?.show ?? true
    const y = st?.extra ?? 0
    if (g.position.y !== y) {
      g.position.y = y
      syncMatrix(g)
    }
  }
  // 宠物、机器人：按所在楼层（走楼梯时在两层之间）跟着楼层的动画走（位置、显示、淡入淡出）
  actors?.relayout()
  if (lights) {
    if (isMultiFloor(plan.value)) {
      const raw = toRaw(plan.value)
      const roomFloor = new Map(raw.rooms.map((r) => [r.id, floorOf(raw, r)]))
      lights.setLift((rid) => {
        const fid = rid ? roomFloor.get(rid) : undefined
        if (!fid) return 0
        return floorShown(fid) && !floorAnim.get(fid)?.hideAt ? liftOf(fid) : null
      })
    } else lights.setLift(null)
  }
  dirty = true
}

/**
 * 屋顶（户建）：外观视图里总是显示；预览模式下显示（这时墙也都是完整的，像看一座模型房子），
 * 镜头接近正上方往下看（看室内）时屋顶让开、墙恢复压低；布置模式不显示。
 * 有楼层被「只到当前层」藏起来时也不显示（下层露出来的那块屋顶会挡住当前层）。
 * 没有外观设定的户型（公寓、复式、手画的）也有现推的缺省屋顶（exterior.ts roofExterior），只在外观视图 / 漫游里盖。
 */
let roofUp = false
/** 第一人称漫游中（墙、楼层、屋顶按外观视图处理，另加天花板） */
const walking = ref(false)
/** 墙全部完整、楼层全部叠好：外观视图或漫游 */
const fullView = () => sandbox.exterior || walking.value
function roofWanted() {
  if (fullView()) return true
  // 墙高滑杆压低时屋顶会悬空：不显示
  if (sandbox.mode !== 'preview' || sandbox.wallHeight < 240 || !floorGroups.some((f) => f.roof && !f.roof.userData.derived)) return (roofUp = false)
  if ([...floorAnim.values()].some((s) => s.hideAt)) return (roofUp = false)
  // 带回差：俯视角在阈值附近来回时屋顶不闪
  const polar = controls ? controls.getPolarAngle() : 1
  roofUp = roofUp ? polar > 0.6 : polar > 0.72
  return roofUp
}
/** 外观样子（墙全部完整）：外观视图，或预览里屋顶盖着的时候（屋顶下面不压低墙） */
const fullLook = () => fullView() || (sandbox.mode === 'preview' && roofUp)
function applyRoofs(want = roofWanted()) {
  for (const fg of floorGroups) {
    if (!fg.roof) continue
    // 没有外观设定的户型（公寓等）现推的缺省屋顶：只在外观视图 / 漫游里盖
    const show = want && (fullView() || !fg.roof.userData.derived)
    if (fg.roof.visible === show) continue
    fg.roof.visible = show
    stage.renderer.shadowMap.needsUpdate = true
    dirty = true
  }
}

/** 墙体压低：当前层按设置处理，其余楼层保持完整；外观视图里所有墙都是完整的 */
function cutawayFloors(center: { x: number; y: number }, dir: { x: number; y: number } | null, depth: number | null) {
  if (fullLook()) {
    for (const fg of floorGroups) applyCutaway(fg.group, center, null)
    return
  }
  for (const fg of floorGroups) {
    if (fg.floor.id === activeFloor.value || floorGroups.length === 1) applyCutaway(fg.group, center, dir, depth, sandbox.wallMode === 'down', sandbox.wallMode === 'half')
    else applyCutaway(fg.group, center, null)
  }
}
/** 推进各层墙体的渐变；返回是否还在动 */
function stepHouse(dt: number, look: WallLook, force = false) {
  let busy = false
  for (const fg of floorGroups) busy = stepCutaway(fg.group, dt, look, force) || busy
  return busy
}
/** 有楼层的墙这一帧变了（投影要重画），顺手清掉标记 */
function houseChanged() {
  let changed = false
  for (const fg of floorGroups)
    if (fg.group.userData.cutawayChanged) {
      fg.group.userData.cutawayChanged = false
      changed = true
    }
  return changed
}

/** 宠物、机器人按楼层分开（各在各的楼层走动） */
/**
 * 宠物、机器人：整套房子一层 ActorLayer（多层户型每层一张导航网格，猫狗、机器狗、人形机器人经楼梯上下楼）。
 * 角色的高度 = 所在楼层的抬升（elevation + 分层拉开 / 隐藏的动画偏移）+ 离本层地面的高度。
 */
const actors = new ActorLayer((fid) => objs.get(fid)?.obj)
actors.lift = (id) => (isMultiFloor(plan.value) ? liftOf(id) : 0)
actors.elevOf = (id) => (isMultiFloor(plan.value) ? (floorById(plan.value, id)?.elevation ?? 0) : 0)
actors.shown = (id) => floorAnim.get(id)?.show ?? true
actors.fade = (root, id) => fadeFloor(root, id, floorAlpha(id))
function syncActors() {
  actors.sync(toRaw(plan.value), actorsLive())
}
// 开发时的调试入口（截图脚本用）：看角色位置、让角色去某层某处
if (import.meta.env.DEV) {
  const w = window as unknown as { __myhomeActors?: ActorLayer; __myhomeCam?: (target: number[], pos: number[]) => void }
  w.__myhomeActors = actors
  // 镜头：target / pos 是世界坐标 [x, 高度, 平面 y]
  w.__myhomeCam = (target, pos) => {
    controls.autoRotate = false
    controls.target.set(target[0], target[1], target[2])
    stage.camera.position.set(pos[0], pos[1], pos[2])
    controls.update()
    dirty = true
  }
}
/** 室内灯光：房间主灯、灯具家具的光源，入夜自动亮（three/lights.ts） */
let lights: IndoorLights
let lastDining = ''

/** 房间灯按风格换造型：居室跟住在里面的人，其余房间跟住户；没有住户就用通用造型 */
function lightStyles(p: Plan) {
  const hh = p.household
  if (!hh) return undefined
  const rs = roomStyles(p, hh)
  return (id: string) => rs.get(id) ?? hh.style
}
/** 房间灯要重建的指纹：餐桌位置 + 住户风格 */
const roomLightKey = (p: Plan) => `${diningKey(p)}|${p.household ? `${p.household.style}:${p.household.members.map((m) => m.style).join(',')}` : ''}`
/** 蒸汽、烟、火苗等动态特效 */
const fx = new FxLayer()
/** 会活动的宠物、扫地机器人、Kachaka（预览模式下才动）：整套房子一层，见 actors */
// open：上次摆好的柜门开合状态（开合只重新摆门，不重建模型）
const objs = new Map<string, { obj: THREE.Group; key: string; open: boolean }>()
let ghost: THREE.Group | null = null
let ghostKey = ''
const ghostRot = ref(0)
let dirty = true
let raf = 0
let ro: ResizeObserver | null = null

// 选中 / 悬停 / 摆放标记：贴合占地的圆角矩形取景框（three/selectFrame.ts）。
// 主色鼠尾草绿；和别的东西穿模时换成柔和的玫瑰红（界面的危险色）。
const RING_OK = '#577a68'
const RING_BAD = '#b4454f'
const selFrame = new SelectFrame('select')
const hoverFrame = new SelectFrame('hover')
/** 摆放预览脚下的框：重叠时变红 */
const ghostFrame = new SelectFrame('ghost')
/** 选中的外观对象（车）脚下的框：和家具的选中框分开，家具那边换选中时会把自己的框藏起来 */
const siteFrame = new SelectFrame('select')
/** 拖动时落到最近墙面的距离引导线 */
const wallGuide = new WallGuide()
const frameRoot = new THREE.Group()
frameRoot.add(selFrame.group, hoverFrame.group, ghostFrame.group, siteFrame.group, wallGuide.group)
/** 线宽按屏幕像素算：跟着画布尺寸更新 */
function syncLineRes(w: number, h: number) {
  for (const f of [selFrame, hoverFrame, ghostFrame, siteFrame, wallGuide]) f.setResolution(w, h)
}
/** 在家具模型脚下显示一个框（占地取素材尺寸，朝向取模型的 rotation.y） */
const frameBox = new THREE.Box3()
const frameC = new THREE.Vector3()
/**
 * 模型在自己坐标系里的包围盒（不含朝向、位置）：只和模型本身有关，算一次记在 userData 上。
 * 只算真实的网格（描边外壳、隐藏的部件不算）。
 */
const localBoxTmp = new THREE.Box3()
const localInv = new THREE.Matrix4()
const localRel = new THREE.Matrix4()
function localBox(obj: THREE.Object3D): THREE.Box3 {
  const cached = obj.userData.localBox as THREE.Box3 | undefined
  if (cached) return cached
  obj.updateMatrixWorld(true)
  localInv.copy(obj.matrixWorld).invert()
  const box = new THREE.Box3()
  obj.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh || !m.visible || n.userData.isOutline || !m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    localBoxTmp.copy(m.geometry.boundingBox!).applyMatrix4(localRel.multiplyMatrices(localInv, m.matrixWorld))
    box.union(localBoxTmp)
  })
  obj.userData.localBox = box
  return box
}
/** 三个方向都有一定厚度（cm）的东西用立体框；地毯、挂画、便签这类薄片还是平面框 */
const SOLID_MIN = 6

function frameAt(fr: SelectFrame, obj: THREE.Object3D, asset: string) {
  fr.setOnTop(false)
  const d = ASSET_MAP.get(asset)
  const lb = localBox(obj)
  if (!lb.isEmpty()) {
    const size = lb.getSize(new THREE.Vector3())
    if (size.x >= SOLID_MIN && size.y >= SOLID_MIN && size.z >= SOLID_MIN) {
      const c = obj.localToWorld(lb.getCenter(new THREE.Vector3()))
      fr.show3d(c.x, c.y, c.z, size.x, size.y, size.z, obj.rotation.y)
      return
    }
  }
  // 挂在墙上 / 贴在表面上的东西：脚下没有占地，框立起来贴在它正面（中心取模型包围盒，往前让出半个厚度）
  if (d && (d.mount !== undefined || d.stick)) {
    frameBox.setFromObject(obj).getCenter(frameC)
    const a = obj.rotation.y
    const k = d.d / 2 + 1.5
    fr.showUpright(frameC.x + Math.sin(a) * k, frameC.y, frameC.z + Math.cos(a) * k, d.w, d.h, a)
    return
  }
  // 世界坐标：多层户型里家具在楼层组里（分层拉开时组有偏移）
  const w = obj.getWorldPosition(new THREE.Vector3())
  fr.show(w.x, w.y, w.z, d?.w ?? 40, d?.d ?? 40, obj.rotation.y)
}

// 吸附参考线：贴墙用深一点的主色绿，和家具对齐用灰蓝
const guideRoot = new THREE.Group()
const guideMat = { wall: new THREE.MeshBasicMaterial({ color: '#3f6652' }), align: new THREE.MeshBasicMaterial({ color: '#5b8fb8' }) }
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
  const roof = roofWanted()
  const v = new THREE.Vector3().subVectors(stage.camera.position, new THREE.Vector3(houseCenter.x, 0, houseCenter.y))
  const l = Math.hypot(v.x, v.z)
  const dir = sandbox.wallMode !== 'up' && !fullLook() && l > 1 ? { x: v.x / l, y: v.z / l } : null
  let depth: number | null = null
  const room = hoverRoomId && sandbox.cutawayHover ? plan.value.rooms.find((r) => r.id === hoverRoomId) : undefined
  if (dir && room) {
    // 以房间中心为界：比它更靠近镜头的墙（含这个房间自己的前墙）都透明
    const c = centroid(room.points)
    depth = (c.x - houseCenter.x) * dir.x + (c.y - houseCenter.y) * dir.y
  }
  cutawayFloors(houseCenter, dir, depth)
  // 天花板灯具：墙压低 / 半墙 / 墙很矮时淡出（挡视线），所指房间之前的也淡出；光照保留
  lights?.applyCutaway(houseCenter, dir, depth, !fullLook() && (sandbox.wallMode === 'down' || sandbox.wallMode === 'half' || sandbox.wallHeight < 200))
  applyRoofs(roof)
  fading = true
  updateMounted(dir, depth)
}

/**
 * 壁挂物跟着墙走：墙压低 / 透明时，挂在那面墙上的东西一起淡出，免得悬在半空（和墙一样渐变）。
 * 「挂在哪面墙」用它的背面朝向近似：背面朝着镜头、又在房子靠镜头的一侧（或在鼠标所指房间之前）就藏；
 * 半墙模式下挂在内墙上的（背后隔着墙还是户内房间）都藏。
 */
function updateMounted(dir: { x: number; y: number } | null, depth: number | null) {
  // 只处理当前楼层（别的楼层墙不压低，壁挂物照常显示）
  const p = fv()
  const list: THREE.Object3D[] = []
  for (const o of objs.values()) if (o.obj.userData.target) o.obj.userData.target = 0
  for (const f of toRaw(plan.value).furniture) {
    const def = ASSET_MAP.get(f.asset)
    const o = objs.get(f.id)
    if (def?.mount && o && floorOf(p, f) !== activeFloor.value) list.push(o.obj)
  }
  for (const f of p.furniture) {
    const def = ASSET_MAP.get(f.asset)
    const o = objs.get(f.id)
    if (!def?.mount || !o) continue
    const a = (f.rot * Math.PI) / 180
    const back = { x: Math.sin(a), y: -Math.cos(a) }
    // 能摆东西的壁挂物（搁板、吊柜、挂杆）一直显示：藏了它，摆在上面、挂在上面的东西就悬在半空了
    const platform = !!def.surface || !!def.surfaces?.length
    const mode = walking.value ? 'up' : sandbox.wallMode
    let hide = !platform && mode === 'down'
    if (!platform && !hide && mode === 'half') {
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
    id = (p && roomAt(fv(), { x: p.x, y: p.z })?.id) || null
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
/** 选中的是装饰画 / 海报 / 相框这类画面可换的素材：画面用途 */
const selectedArtKind = computed(() => (selectedFurniture.value ? artKindOf(selectedFurniture.value.asset) : undefined))
/** 户型里已经挂着的画种 → 件数（摆新画时尽量不重复） */
function usedArtMotifs() {
  const m = new Map<string, number>()
  for (const f of plan.value.furniture) {
    const p = parseArt(f.art)
    if (p) m.set(p.motif.id, (m.get(p.motif.id) ?? 0) + 1)
  }
  return m
}
function stepArt(dir: 1 | -1) {
  const f = selectedFurniture.value
  const kind = selectedArtKind.value
  if (f && kind) setFurnitureArt(f.id, cycleArt(f.art, kind, dir))
}
function rerollSelectedArt() {
  const f = selectedFurniture.value
  const kind = selectedArtKind.value
  const def = selectedDef.value
  if (f && kind && def) setFurnitureArt(f.id, rerollArt(f.art, kind, paletteStyleOf(def, f.color ?? 0)))
}

// ---------- 悬停高亮（鼠标）：指到的家具整体提亮一点 ----------
// 提亮是独立的叠加层（three/highlight.ts），不换家具自己的材质，和墙体让开、楼层淡出这些换材质的系统互不干扰
let hoverId: string | null = null
const hoverHi = new Highlight(0.2)
function setHover(id: string | null) {
  if (id === hoverId) return
  hoverId = id
  const o = id ? objs.get(id)?.obj : undefined
  const hf = id ? findFurniture(id) : undefined
  if (o && hf) frameAt(hoverFrame, o, hf.asset)
  else hoverFrame.hide()
  hoverHi.set(o ? [o] : [])
  dirty = true
}

/**
 * 拖动时的提示：家具占地离所在房间最近那面墙的净距（cm）。
 * 墙面 = 房间边往里收半个墙厚；占地按旋转后的宽深在墙法线方向上的投影算。摆在台面上的东西不算。
 */
function wallGap(f: Pick<Furniture, 'asset' | 'x' | 'y' | 'rot' | 'z'>): { gap: number; from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const def = ASSET_MAP.get(f.asset)
  if (!def || f.z) return null
  const p = fv()
  const room = roomAt(p, { x: f.x, y: f.y })
  if (!room) return null
  const a = (f.rot * Math.PI) / 180
  const u = { x: Math.cos(a), y: Math.sin(a) }
  const v = { x: -Math.sin(a), y: Math.cos(a) }
  let best = Infinity
  let line: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null
  for (const e of edgesOf(room.points)) {
    const rx = f.x - e.a.x
    const ry = f.y - e.a.y
    const along = rx * e.dir.x + ry * e.dir.y
    if (along < -20 || along > e.length + 20) continue
    const inward = -(rx * e.out.x + ry * e.out.y)
    // 凹多边形房间：中心在这条边外侧时，这条边不是挡在它面前的墙
    if (inward < 0) continue
    const half = (def.w / 2) * Math.abs(u.x * e.out.x + u.y * e.out.y) + (def.d / 2) * Math.abs(v.x * e.out.x + v.y * e.out.y)
    const t = wallThicknessAt(p, { x: e.a.x + e.dir.x * along, y: e.a.y + e.dir.y * along }, e.out, room)
    const gap = inward - half - t / 2
    if (gap < best) {
      best = gap
      // 从占地边缘（中心沿墙法线外推 half）到墙面（外推 inward - t/2）
      line = { from: { x: f.x + e.out.x * half, y: f.y + e.out.y * half }, to: { x: f.x + e.out.x * (inward - t / 2), y: f.y + e.out.y * (inward - t / 2) } }
    }
  }
  return Number.isFinite(best) && line ? { gap: Math.max(0, Math.round(best)), ...line } : null
}

/** 拖动 / 旋转家具时跟着指针的小提示：角度、离墙距离、吸附开关提示 */
const dragHud = ref<{ x: number; y: number; rot: number; wall: number | null; snap: boolean; touch: boolean } | null>(null)
function updateDragHud(e: { clientX: number; clientY: number; altKey?: boolean; pointerType?: string }, f: Pick<Furniture, 'asset' | 'x' | 'y' | 'rot' | 'z'>) {
  const r = canvas.value!.getBoundingClientRect()
  const g = wallGap(f)
  // 离墙引导线：画在家具所在的地面高度上
  const o = 'id' in f ? objs.get((f as Furniture).id)?.obj : undefined
  if (g && g.gap > 0) wallGuide.show(g.from, g.to, o ? o.getWorldPosition(new THREE.Vector3()).y : activeY())
  else wallGuide.hide()
  dirty = true
  dragHud.value = {
    x: Math.round(e.clientX - r.left),
    y: Math.round(e.clientY - r.top),
    rot: ((Math.round(turnAngle(f)) % 360) + 360) % 360,
    wall: g ? g.gap : null,
    snap: sandbox.snap && !e.altKey,
    touch: !!e.pointerType && e.pointerType !== 'mouse',
  }
}

// ---------- 场景同步 ----------

function rebuildHouse() {
  if (house) {
    stage.scene.remove(house)
    disposeUnshared(house)
  }
  xraySwapped.length = 0
  const raw = toRaw(plan.value)
  // 多层户型每层用自己的层高；墙高滑杆调低时只压低当前层
  // 外观视图、漫游：墙一律满高（墙高滑杆不起作用）
  const wh = fullView() ? 240 : sandbox.wallHeight
  const built = buildBuilding(raw, wh, (f) => (f.id === activeFloor.value && wh < 240 ? Math.min(f.height, wh) : f.height), { defaultRoof: true })
  house = built.root
  // 房子搭好就不动了（除了墙体压低和楼层滑动，那两处自己更新矩阵）：不再每帧重算上千个对象的矩阵
  freezeMatrices(house)
  floorGroups = built.floors
  builtActive = activeFloor.value
  stage.scene.add(house)
  lights.syncRooms(raw, ASSET_MAP, floorY, lightStyles(raw))
  floorTargets(true)
  lastDining = roomLightKey(toRaw(plan.value))
  const pts = plan.value.rooms.flatMap((r) => r.points)
  if (pts.length) {
    const b = bbox(pts)
    houseCenter = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
  }
  updateCutaway()
  // 重建时直接到位，不播渐变
  stepHouse(10, wallLook())
  // 门窗、设备改了尺寸 / 位置 / 款式：选中框跟着新模型
  hoverHouseKey = null
  if (selection.value?.type === 'opening' || selection.value?.type === 'fixture') updateRing()
  const box = new THREE.Box3().setFromObject(house)
  houseBox = box.isEmpty() ? null : box
  if (houseBox) fitSun(stage.sun, houseBox, skyNow.value?.lightDir)
  // 房间变了，家具的地面高度可能也变了
  for (const f of raw.furniture) {
    const o = objs.get(f.id)
    if (o) placeFurniture(o.obj, raw, f)
  }
  applyXray()
  syncActors()
  prewarmFloorFade()
  // 房子重搭了（改外观、围挡、车都会）：选中高亮套到新模型上
  applySiteHi()
  dirty = true
}
/** 家具模型的缓存键：素材 + 配色 + 单件改色 + 花纹 + 画面（开合不在内） */
function furnitureKey(asset: string, color: number | undefined, colors: readonly string[] | undefined, patterns: unknown, art?: string) {
  return `${asset}#${color ?? 0}#${colors?.join(',') ?? ''}#${patterns ? JSON.stringify(patterns) : ''}#${art ?? ''}`
}
/** 上次搭房子时的当前楼层（墙高滑杆调低时只压低当前层：换层要重搭） */
let builtActive = ''

function syncFurniture() {
  // 模型可能要重建：先取消悬停，把选中容器的半透明材质还回去
  if (hoverId) setHover(null)
  clearXray()
  // 读原始对象：拖动时每帧都要过一遍全部家具，走响应式代理的开销比计算本身还大
  const p = toRaw(plan.value)
  const alive = new Set<string>()
  for (const f of p.furniture) {
    alive.add(f.id)
    // 开合不进键：开关柜门只重新摆门（poseDoors 会同步静态矩阵），不整件重建
    const key = furnitureKey(f.asset, f.color, f.colors, f.patterns, f.art)
    let o = objs.get(f.id)
    if (o && o.key === key && o.open !== !!f.open) {
      poseDoors(o.obj, !!f.open)
      o.open = !!f.open
    }
    if (!o || o.key !== key) {
      if (o) {
        o.obj.removeFromParent()
        disposeUnshared(o.obj)
      }
      o = { obj: furnitureModel(f), key, open: !!f.open }
      // 根节点也用静态矩阵：placeFurniture 挪动时会更新
      o.obj.matrixAutoUpdate = false
      objs.set(f.id, o)
      fx.set(f.id, o.obj, ASSET_MAP.get(f.asset)?.fx)
    }
    // 按楼层放进各层的组（换了楼层就挪过去）
    const layer = furnLayer(floorOf(p, f))
    if (o.obj.parent !== layer) layer.add(o.obj)
    placeFurniture(o.obj, p, f)
    // 绿植贴墙时把越过墙面的枝叶弯回来（位置变了才重算）
    if (isPlant(f.asset)) {
      const pk = `${f.x},${f.y},${f.rot},${f.floor ?? ''}`
      if (o.obj.userData.bentAt !== pk) {
        bendToWalls(o.obj, isMultiFloor(p) ? floorView(p, floorOf(p, f)) : p, f)
        o.obj.userData.bentAt = pk
      }
    }
  }
  for (const [id, o] of objs)
    if (!alive.has(id)) {
      o.obj.removeFromParent()
      disposeUnshared(o.obj)
      objs.delete(id)
      fx.remove(id)
    }
  updateRing()
  applyXray()
  // 灯具家具：发光部件、光源位置；餐桌挪了吊灯跟着挪
  lights.syncLamps(p, objs, ASSET_MAP, (f) => roomAt(p, f, isMultiFloor(p) ? (f.floor ?? null) : undefined), floorY)
  const dk = roomLightKey(p)
  if (dk !== lastDining) {
    lastDining = dk
    lights.syncRooms(p, ASSET_MAP, floorY, lightStyles(p))
  }
  lights.touch()
  applyFloorPose()
  updateCutaway()
  syncActors()
  dirty = true
}

/** 上一次框住的家具：换了一件就重新播「缩入」 */
let framedId = ''
/**
 * 门窗的立体选中框（世界坐标）：洞口宽 × 洞口高 × 墙厚，按当前楼层搭好的房子算（层高、楼层抬升）。
 * 不在当前楼层、或这层没有这个洞口时返回 null。
 */
function openingFrameWorld(id: string) {
  const fg = floorGroups.find((g) => g.floor.id === activeFloor.value)
  if (!fg) return null
  const info = openingInfos(fv()).find((i) => i.o.id === id)
  if (!info) return null
  const f = openingFrame(info, fg.wallH)
  const c = fg.group.localToWorld(new THREE.Vector3(f.x, f.y, f.z))
  return { ...f, c }
}
function showOpeningFrame(fr: SelectFrame, id: string) {
  const f = openingFrameWorld(id)
  if (!f) return null
  fr.setOnTop(true)
  fr.show3d(f.c.x, f.c.y, f.c.z, f.w, f.h, f.d, f.yaw)
  return f.c
}
/**
 * 3D 里能选的设备：当前楼层的；楼梯放在下层，在上一层从楼梯洞口看下去点中也算（选中框画在下层的模型上）。
 */
function fixtureSelectable(id: string) {
  const f = plan.value.fixtures.find((x) => x.id === id)
  if (!f) return false
  const fl = floorOf(plan.value, f)
  return fl === activeFloor.value || (f.kind === 'stairs' && floorBelow(plan.value, activeFloor.value)?.id === fl)
}
/** 设备的立体选中框：框住它在所在楼层搭好的模型（楼梯含整段梯段的高度）；楼层藏着、模型没搭出来时返回 null */
function showFixtureFrame(fr: SelectFrame, id: string) {
  const f = plan.value.fixtures.find((x) => x.id === id)
  if (!f || !fixtureSelectable(id)) return null
  const fg = floorGroups.find((g) => g.floor.id === floorOf(plan.value, f))
  const obj = fg && findFixtureModel(fg.group, id)
  if (!obj || !shown(obj)) return null
  const b = fixtureFrame(obj)
  if (!b) return null
  // 设备常被墙、家具挡住（楼梯尤其）：框线压在最上面画
  fr.setOnTop(true)
  fr.show3d(b.c.x, b.c.y, b.c.z, b.w, b.h, b.d, b.yaw)
  return b.c
}
const showHouseFrame = (fr: SelectFrame, kind: HouseHitKind, id: string) => (kind === 'opening' ? showOpeningFrame(fr, id) : showFixtureFrame(fr, id))
/** 选中的门窗 / 设备的中心（世界坐标）：编辑卡片挨着它摆 */
let houseAnchor: THREE.Vector3 | null = null
/** 鼠标指着的门窗 / 设备（悬停框；家具的悬停框优先），键 = `kind:id` */
let hoverHouseKey: string | null = null
function setHoverHouse(h: { kind: HouseHitKind; id: string } | null) {
  const key = h ? `${h.kind}:${h.id}` : null
  if (key === hoverHouseKey) return
  hoverHouseKey = key
  if (!(h && showHouseFrame(hoverFrame, h.kind, h.id)) && !hoverId) hoverFrame.hide()
  dirty = true
}
function updateRing() {
  const s = selection.value
  if (s?.type !== 'opening' && s?.type !== 'fixture') houseAnchor = null
  if (s?.type === 'opening' || s?.type === 'fixture') {
    const key = `${s.type}:${s.id}`
    if (key !== framedId) selFrame.hide()
    houseAnchor = editing.value && !walking.value ? showHouseFrame(selFrame, s.type, s.id) : null
    if (houseAnchor) {
      framedId = key
      selFrame.setColor(RING_OK)
      if (hoverHouseKey === key) setHoverHouse(null)
    } else {
      selFrame.hide()
      framedId = ''
    }
    dirty = true
    return
  }
  const f = selectedFurniture.value
  const o = f && objs.get(f.id)
  if (!f || !o || !editing.value) {
    selFrame.hide()
    framedId = ''
    return
  }
  if (f.id !== framedId) selFrame.hide()
  framedId = f.id
  frameAt(selFrame, o.obj, f.asset)
  // 和别的家具 / 设备穿模时提示成红色（摆在台面 / 浴缸边沿上的东西本来就压在下面的家具、设备上，同摆放预览不查）
  selFrame.setColor(!f.z && overlapsOthers(fv(), f.id, f.asset, f.x, f.y, f.rot) ? RING_BAD : RING_OK)
  if (hoverId === f.id) hoverFrame.hide()
}

/** 摆放预览当前显示的素材（挂到挂钩上时会换成挂起形态） */
let ghostAsset = ''
function syncGhost(asset = placing.value?.asset) {
  const p = placing.value
  // 装饰画：摆放时就定好一幅画（预览和放下的一样；连续摆放时每放一件换一幅）
  if (p && !p.art) {
    const kind = artKindOf(p.asset)
    const def = ASSET_MAP.get(p.asset)
    if (kind && def) p.art = pickArt(kind, paletteStyleOf(def, p.color), Math.random, usedArtMotifs())
  }
  // 和家具缓存键一致：换配色、单件改色、花纹、画面都要重建预览
  const key = p ? furnitureKey(asset ?? p.asset, p.color, p.colors, p.patterns, p.art) : ''
  if (key === ghostKey) return
  if (ghost) {
    stage.scene.remove(ghost)
    disposeUnshared(ghost)
  }
  ghost = null
  ghostKey = key
  ghostFrame.hide()
  if (p) {
    ghostAsset = asset ?? p.asset
    ghost = furnitureModel({ id: 'ghost', asset: ghostAsset, x: 0, y: 0, rot: ghostRot.value, color: p.color, colors: p.colors, patterns: p.patterns, art: p.art })
    ghost.visible = false
    stage.scene.add(ghost)
  }
  dirty = true
}

/**
 * 手机底部抽屉盖住画布下半截：把投影中心上移到抽屉上方可见区域的正中（相机视口偏移，相机本身不动），
 * 取景也按可见区域算。射线拾取、浮动工具条的投影都走同一个投影矩阵，不用另外换算。
 * 抽屉展开 / 收起时偏移量缓动过去。
 */
let viewSize = { w: 1, h: 1 }
let sheetOff = 0
let sheetTween = 0
function sheetTarget() {
  return device.compact && !device.landscape ? Math.min(layout.sheetH, viewSize.h * 0.55) : 0
}
function setViewOffset(off: number) {
  const cam = stage.camera
  const { w, h } = viewSize
  sheetOff = off
  if (off < 0.5) {
    cam.clearViewOffset()
    cam.aspect = w / Math.max(1, h)
  } else {
    cam.aspect = w / (h + off)
    cam.setViewOffset(w, h + off, 0, off, w, h)
  }
  cam.updateProjectionMatrix()
  dirty = true
}
function applySheetOffset(animate = false) {
  if (!stage) return
  cancelAnimationFrame(sheetTween)
  const to = sheetTarget()
  if (!animate || Math.abs(to - sheetOff) < 1) return setViewOffset(to)
  const from = sheetOff
  const t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 220)
    setViewOffset(from + (to - from) * (1 - (1 - k) ** 3))
    if (k < 1) sheetTween = requestAnimationFrame(step)
  }
  sheetTween = requestAnimationFrame(step)
}
watch(
  () => [layout.sheetH, device.compact, device.landscape] as const,
  () => applySheetOffset(true),
)

/**
 * 改透视（视角 FOV）：相机沿视线前后移动，让房子在画面里的大小基本不变（推拉变焦），只改近大远小的强弱。
 * 拉远上限跟着视角放大，窄视角时也能把整栋房子装进画面。
 */
function applyFov(fov: number, keepFraming = true) {
  const cam = stage.camera
  const old = cam.fov
  if (keepFraming && controls && Math.abs(old - fov) > 0.01) {
    const k = Math.tan((old * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360)
    const off = cam.position.clone().sub(controls.target).multiplyScalar(k)
    cam.position.copy(controls.target).add(off)
  }
  cam.fov = fov
  cam.updateProjectionMatrix()
  if (controls) {
    const scale = Math.tan((30 * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360)
    controls.maxDistance = 6000 * Math.max(1, scale)
    controls.update()
  }
  dirty = true
}
watch(
  () => sandbox.fov,
  (v) => applyFov(v),
)

function resetView() {
  if (!house) return
  const box = new THREE.Box3().setFromObject(house)
  if (box.isEmpty()) return
  const c = frameCamera(stage.camera, box, new THREE.Vector3(0.35, 1.25, 1).normalize(), 0.9)
  controls.target.copy(c)
  controls.update()
  updateCutaway()
  stepHouse(10, wallLook())
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
  // 当前楼层的地面
  floor.constant = -activeY()
  if (!raycaster.ray.intersectPlane(floor, p)) return null
  // 户建的院子：用地地面比室内低（BASE），指在院子里时改用院子地面的交点，拖动的东西才跟手
  const raw = toRaw(plan.value)
  if (raw.site && activeFloor.value === baseFloorId(raw) && !roomAt(fv(), { x: p.x, y: p.z })) {
    const q = new THREE.Vector3()
    floor.constant = -(activeY() + BASE)
    if (raycaster.ray.intersectPlane(floor, q) && !roomAt(fv(), { x: q.x, y: q.z })) p.copy(q)
    floor.constant = -activeY()
  }
  return p
}
/** 射线换到当前楼层的局部高度（家具、台面的高度都按本层地面算） */
function localRay() {
  const r = raycaster.ray.clone()
  r.origin.y -= activeY()
  return r
}

/** 射线命中的是看得见的东西：Raycaster 不管 visible。fading 时把正在淡出的（跟着墙藏起来的壁挂物）也当成看不见 */
function shown(o: THREE.Object3D | null, fading = false) {
  for (; o; o = o.parent) if (!o.visible || (fading && o.userData.target === 1)) return false
  return true
}
/** 挡得住视线的面：半透明（透明墙、玻璃）的不算 */
function opaqueHit(h: THREE.Intersection) {
  const m = (h.object as THREE.Mesh).material
  return (Array.isArray(m) ? m : [m]).some((x) => x && x.colorWrite !== false && !(x.transparent && x.opacity < 0.5))
}
/** 壁挂物又薄又小（描边还比本体外扩一圈）：点在它边上、射线落到墙上时，包围盒外扩这么多也算点中 */
const WALL_PICK_PAD = 4
const padBox = new THREE.Box3()
const padHit = new THREE.Vector3()
/** 射线打到墙上（far 之前没碰到家具）：找包围盒外扩后被射线穿过的、最近的壁挂物 */
function wallItemNear(far: number) {
  let best: string | null = null
  let bestD = far
  for (const f of fv().furniture) {
    const def = ASSET_MAP.get(f.asset)
    const o = objs.get(f.id)?.obj
    if (!def || !(def.mount || def.stick) || !o || !shown(o, true)) continue
    padBox.setFromObject(o).expandByScalar(WALL_PICK_PAD)
    if (!raycaster.ray.intersectBox(padBox, padHit)) continue
    const d = padHit.distanceTo(raycaster.ray.origin)
    if (d <= bestD) {
      bestD = d
      best = f.id
    }
  }
  return best
}

/** 屏幕坐标处的楼梯：只看当前楼层，射线碰到的第一个不透明面属于楼梯才算（右键 / 长按弹楼梯菜单） */
function pickStairs(e: PointerEvent): string | null {
  setRay(e)
  const house = floorGroups.find((g) => g.floor.id === activeFloor.value)?.group
  if (!house) return null
  const hit = raycaster.intersectObject(house, true).find((h) => (h.object as THREE.Mesh).isMesh && shown(h.object) && opaqueHit(h))
  let o: THREE.Object3D | null = hit?.object ?? null
  while (o && !o.userData.fixtureId) o = o.parent
  const f = o ? plan.value.fixtures.find((x) => x.id === o!.userData.fixtureId) : undefined
  return f?.kind === 'stairs' ? f.id : null
}

/** maxDist：射线在这个距离上已经点中了别的东西（门窗），更远的家具不算 */
function pickFurniture(e: PointerEvent, maxDist = Infinity): string | null {
  setRay(e)
  // 只点当前楼层的家具（上层隐藏 / 下层被挡住时都不会选到别的楼层）
  const fhits = raycaster.intersectObject(furnLayer(activeFloor.value), true)
  // 墙、楼板挡住的不算：点在墙上不会选到墙后面房间里的家具
  const house = floorGroups.find((g) => g.floor.id === activeFloor.value)?.group
  const wall = house ? raycaster.intersectObject(house, true).find((h) => (h.object as THREE.Mesh).isMesh && shown(h.object) && opaqueHit(h)) : undefined
  const far = Math.min(wall ? wall.distance + 0.5 : Infinity, maxDist)
  // 射线经过的家具（去重、由近到远）
  const ids: string[] = []
  for (const h of fhits) {
    if (h.distance > far) break
    if (!shown(h.object, true)) continue
    let o: THREE.Object3D | null = h.object
    while (o && !o.userData.furnitureId) o = o.parent
    const id = o?.userData.furnitureId as string | undefined
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (!ids.length && (wall || maxDist < Infinity)) {
    const id = wallItemNear(far)
    if (id) return id
  }
  // 走动中的宠物 / 机器人：点中就选中它来源的那件家具（选中后角色回到原位静止，方便拖动）
  if (!ids.length) return maxDist < Infinity ? null : actors.pick(raycaster)
  // 柜子、架子的格子里摆满了东西，点柜子正面多半先碰到摆件：先选容器本身；容器已经选中时再点，才选里面的东西
  const sel = selection.value?.type === 'furniture' ? selection.value.id : null
  const inside = (kid: string, box: string) => {
    const p = findFurniture(box)
    return !!p && propsOn(plan.value, p).some((k) => k.id === kid)
  }
  // 容器已经选中（柜体半透明）：射线穿过它碰到的里面的东西优先
  if (sel && ids.includes(sel)) {
    const kid = ids.find((id) => id !== sel && inside(id, sel))
    if (kid) return kid
  }
  const top = ids[0]
  if (findFurniture(top)?.z) {
    const parent = ids.slice(1).find((id) => inside(top, id))
    if (parent && sel !== top) return parent
  }
  return top
}

/**
 * 点中的门窗 / 设备（只看当前楼层、看得见的）：由近到远找房子的网格，先碰到门窗、设备的组就是它；
 * 先碰到不透明的墙、楼板就算被挡住。半透明的东西（让开的墙、别的玻璃）穿过去。
 * 跟着墙让开 / 压低藏起来的门窗（淡出中也算）点不中。返回命中距离，和家具比远近。
 * 楼梯放在下层：在上一层时，下层也参与射线（楼板挡着，只有从楼梯洞口看下去才碰得到），但下层只能选楼梯。
 */
function pickHouse(e: { clientX: number; clientY: number }): HouseHit | null {
  if (walking.value || !editing.value || blueprint.on) return null
  const house = floorGroups.find((g) => g.floor.id === activeFloor.value)?.group
  if (!house) return null
  setRay(e as PointerEvent)
  const hits = raycaster.intersectObject(house, true)
  const below = floorBelow(plan.value, activeFloor.value)
  if (below && plan.value.fixtures.some((f) => f.kind === 'stairs' && floorOf(plan.value, f) === below.id)) {
    const g = floorGroups.find((x) => x.floor.id === below.id)?.group
    if (g && shown(g)) {
      hits.push(...raycaster.intersectObject(g, true))
      hits.sort((x, y) => x.distance - y.distance)
    }
  }
  const ops = fv().openings
  return firstHouseHit(hits, (o) => shown(o, true), opaqueHit, (kind, id) => (kind === 'opening' ? ops.some((o) => o.id === id) : fixtureSelectable(id)))
}
/** 鼠标 / 手指处点中的东西：家具、门窗、设备谁近选谁（家具在门窗、设备之前；门窗玻璃后面、设备里面的家具不算） */
function pickAt(e: PointerEvent): { furniture: string | null; house: { kind: HouseHitKind; id: string } | null } {
  const h = pickHouse(e)
  const furniture = pickFurniture(e, furnitureLimit(h))
  return { furniture, house: furniture || !h ? null : { kind: h.kind, id: h.id } }
}
const houseSel = (h: { kind: HouseHitKind; id: string }) => (h.kind === 'opening' ? { type: 'opening' as const, id: h.id } : { type: 'fixture' as const, id: h.id })

/**
 * 选中柜子、架子这类容器时，柜体变半透明（里面的东西保持实色），看得清格子里放了什么，也能直接点里面的东西。
 * 模型重建（syncFurniture）前先还原，之后重新套上。
 */
const xraySwapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
const xrayMats = new WeakMap<THREE.Material, THREE.Material>()
function ghostOf(mat: THREE.Material) {
  let g = xrayMats.get(mat)
  if (!g) {
    g = mat.clone()
    g.onBeforeCompile = mat.onBeforeCompile
    g.customProgramCacheKey = mat.customProgramCacheKey
    g.transparent = true
    g.opacity = (mat.transparent ? mat.opacity : 1) * 0.28
    g.depthWrite = false
    xrayMats.set(mat, g)
  }
  return g
}
function clearXray() {
  for (const [m, mat] of xraySwapped) {
    m.material = mat
    for (const c of m.children) if (c.userData.isOutline) c.visible = true
  }
  xraySwapped.length = 0
}
function xrayTarget(): THREE.Object3D | undefined {
  if (!editing.value) return
  const f = selectedFurniture.value
  const def = f && ASSET_MAP.get(f.asset)
  if (!f || !def || def.prop || !def.surfaces?.some((l) => l.kind !== 'hook')) return
  return objs.get(f.id)?.obj
}
function applyXray() {
  clearXray()
  const o = xrayTarget()
  if (!o) return
  o.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    if (n.userData.isOutline) {
      n.visible = false
      return
    }
    xraySwapped.push([m, m.material])
    m.material = Array.isArray(m.material) ? m.material.map(ghostOf) : ghostOf(m.material)
  })
  dirty = true
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
  return snapFurniture(fv(), id, asset, x, y, rot)
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
    const cur = floorGroups.find((g) => g.floor.id === activeFloor.value)?.group
    const targets: THREE.Object3D[] = [furnLayer(activeFloor.value), ...(cur ? [cur] : [])]
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
      const floor = activeY() + floorY(roomAt(fv(), { x: h.point.x, y: h.point.z }))
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
    // 鼠标通常指着墙上一米多高的地方：用射线和「挂的高度」那个水平面的交点找墙。
    // 直接用地面交点的话，射线穿过墙才落地，点在房间外面、找不到房间，东西就拖不动
    setRay(e)
    const self = selfId ? findFurniture(selfId) : undefined
    const base = activeY() + floorY(roomAt(fv(), self ?? (p ? { x: p.x, y: p.z } : { x: 0, y: 0 })))
    const hp = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base + def.mount + def.h / 2)), new THREE.Vector3())
    const toCam = new THREE.Vector2(stage.camera.position.x, stage.camera.position.z)
    for (const q of [hp, p]) {
      if (!q) continue
      // 交点刚好落在墙体里：沿着朝镜头的方向往房间里挪一点再找
      const dir = toCam.clone().sub(new THREE.Vector2(q.x, q.z)).normalize()
      for (let k = 0; k <= 8; k++) {
        const w = snapToWall(fv(), asset, q.x + dir.x * k * 5, q.z + dir.y * k * 5)
        if (w) return { x: w.x, y: w.y, z: 0, rot: w.rot, guides: w.guides, asset }
      }
    }
    return null
  }
  if (def.prop) {
    setRay(e)
    const hang = canHang(def)
    // 挂钩只收有挂起形态的；净高不够的层（床底、矮层板）放不进去
    const hangDef = hang ? ASSET_MAP.get(formFor(def, 'hook')!) : undefined
    // 屏幕顶边（clip）只收夹式摄像头这类 screenClip 的东西
    const hit = pickSurface(fv(), localRay(), exclude, (kind, h) => (kind === 'clip' ? !!def.screenClip : kind === 'hook' ? !!hangDef && hangDef.h <= h + 0.5 : def.h <= h + 0.5))
    // 浴缸盖、浴缸架板：指在浴缸范围里就横跨吸到边沿上（转成和浴缸平行 / 垂直、横向居中），
    // 除非射线先打中了浴缸上方别的台面（墙上的置物架）
    const tub = pickTub(fv(), localRay(), asset, rot)
    if (tub && (!hit || hit.owner === tub.tub || tub.t <= hit.t + 1)) {
      const fx = fv().fixtures.find((x) => x.id === tub.tub)
      return { x: tub.x, y: tub.y, z: tub.z, rot: tub.rot, guides: fx ? tubGuides(fx) : [], asset: tub.asset }
    }
    if (hit) {
      if (hit.kind === 'clip') {
        const c = snapToClip(hit.pose, hit.poly)
        return { x: c.x, y: c.y, z: hit.z, rot: c.rot, guides: [], asset }
      }
      const a = formFor(def, hit.kind) ?? asset
      if (hit.kind === 'hook') {
        const h = snapToHook(hit.pose, hit.poly, hit)
        return { x: h.x, y: h.y, z: hit.z, rot: h.rot, guides: [], asset: a }
      }
      const fit = fitOnSurface(fv(), hit.owner, hit.z, a, hit.x, hit.y, rot)
      return { x: Math.round(fit.x * 10) / 10, y: Math.round(fit.y * 10) / 10, z: hit.z, guides: [], asset: a }
    }
  }
  if (!p) return null
  return { ...snapped(selfId, asset, p.x + off.x, p.z + off.y, rot, e.altKey), z: 0, asset: formFor(def, 'floor') ?? asset }
}

/** 拖动中的家具；kids 是摆在它上面、要跟着走的东西（相对偏移） */
let drag: { id: string; dx: number; dz: number; kids: { id: string; dx: number; dy: number; dz: number }[]; exclude: Set<string> } | null = null
let down: { x: number; y: number } | null = null

// ---------- 触控（手指 / 笔）：和 OrbitControls 分工 ----------
// 单指按在已选中的家具上：拖动家具（超过一点阈值才开始动）；按在别处：交给 OrbitControls 转视角，松手时没动过算点按（选中 / 取消选中）。
// 第二根手指落下时，如果正在拖家具，就变成双指拧转旋转家具；否则 OrbitControls 自己处理缩放平移。
// 长按（不动）= 右键菜单。摆放模式：手指按下就出预览、拖动调整、松手放下。
const touches = new Map<number, { x: number; y: number }>()
let press: { id: number; x: number; y: number; hitId: string | null; house: { kind: HouseHitKind; id: string } | null; moved: boolean; long: boolean; timer: number } | null = null
let twist: { a0: number; base: number } | null = null
/** 摆放模式下手指正按着（预览跟着手指） */
let touchPlacing = false
const touchAngle = () => {
  const [a, b] = [...touches.values()]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

function beginDrag(e: PointerEvent, id: string) {
  const f = findFurniture(id)!
  const p = floorPoint(e)
  checkpoint()
  const kids = propsOn(plan.value, f).map((k) => ({ id: k.id, dx: k.x - f.x, dy: k.y - f.y, dz: (k.z ?? 0) - (f.z ?? 0) }))
  drag = { id, dx: p ? f.x - p.x : 0, dz: p ? f.y - p.z : 0, kids, exclude: new Set([id, ...kids.map((k) => k.id)]) }
  controls.enabled = false
  try {
    canvas.value!.setPointerCapture(e.pointerId)
  } catch {
    /* 指针已经抬起 */
  }
}
function endDrag() {
  if (!drag) return
  settle()
  drag = null
  showGuides([])
  dragHud.value = null
  wallGuide.hide()
}

/** 摆放预览跟着指针（鼠标悬停 / 手指按住 / 从家具栏拖进来） */
function updateGhost(e: { clientX: number; clientY: number; altKey: boolean }) {
  if (!placing.value || !ghost) return
  const q = locate(e as PointerEvent, placing.value.asset, null, new Set(), undefined, ghostRot.value)
  if (q && q.asset !== ghostAsset) syncGhost(q.asset)
  if (!ghost) return
  ghost.visible = !!q
  if (!q) ghostFrame.hide()
  if (q) {
    placeFurniture(ghost, plan.value, { x: q.x, y: q.y, rot: q.rot ?? ghostRot.value, z: q.z, floor: activeFloorField() })
    // 摆放预览在场景根上：加上当前楼层的动画偏移
    ghost.position.y += floorAnim.get(activeFloor.value)?.extra ?? 0
    frameAt(ghostFrame, ghost, q.asset)
    ghostFrame.setColor(!q.z && overlapsOthers(fv(), null, q.asset, q.x, q.y, q.rot ?? ghostRot.value) ? RING_BAD : RING_OK)
    showGuides(q.guides, activeY())
  }
  dirty = true
}
function hideGhost() {
  if (!ghost) return
  ghost.visible = false
  ghostFrame.hide()
  showGuides([])
  dirty = true
}
/** 在指针处放下正在摆放的家具；keep 为真时继续摆放同一件 */
function dropPlacing(e: { clientX: number; clientY: number; altKey: boolean }, keep = false) {
  if (!placing.value) return
  const q = locate(e as PointerEvent, placing.value.asset, null, new Set(), undefined, ghostRot.value)
  if (q) {
    addFurniture({ asset: q.asset, color: placing.value.color, colors: placing.value.colors, patterns: placing.value.patterns, art: placing.value.art, x: q.x, y: q.y, rot: q.rot ?? ghostRot.value, z: q.z || undefined })
    if (!keep) placing.value = null
    else if (placing.value.art) {
      // 连续摆放：下一件换一幅画
      placing.value.art = undefined
      syncGhost()
    }
  }
  showGuides([])
}

function onTouchDown(e: PointerEvent) {
  if (touches.size === 2) {
    clearTimeout(press?.timer)
    press = null
    const s = selection.value
    if (drag && s?.type === 'furniture') {
      // 拖着家具时落下第二根手指：拧转旋转（家具先回到按下时的位置不变，只转角度）
      twist = { a0: touchAngle(), base: (() => { const tf = findFurniture(s.id); return tf ? turnAngle(tf) : 0 })() }
      showGuides([])
    } else if (touchPlacing) {
      touchPlacing = false
      hideGhost()
    }
    return
  }
  if (touches.size > 2) return
  if (placing.value) {
    touchPlacing = true
    controls.enabled = false
    canvas.value!.setPointerCapture(e.pointerId)
    updateGhost(e)
    return
  }
  const hit = pickAt(e)
  const id = hit.furniture
  const sel = selection.value?.type === 'furniture' ? selection.value.id : null
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, hitId: id, house: hit.house, moved: false, long: false, timer: 0 }
  press.timer = window.setTimeout(() => onLongPress(e.clientX, e.clientY), LONG_PRESS_MS)
  // 按在已选中的家具上：准备拖动（先关掉转视角；动过阈值才真的移动）
  if (id && id === sel) beginDrag(e, id)
}

function onLongPress(x: number, y: number) {
  const pr = press
  if (!pr || pr.moved || touches.size !== 1) return
  pr.long = true
  if (drag) {
    endDrag()
    controls.enabled = true
  }
  if (pr.hitId) selection.value = { type: 'furniture', id: pr.hitId }
  navigator.vibrate?.(10)
  sandboxBridge.value?.menu?.(x, y, pr.hitId)
}

function onTouchMove(e: PointerEvent) {
  if (twist && touches.size >= 2) {
    let rot = twist.base + (touchAngle() - twist.a0)
    // 接近 15° 的整数倍时吸过去
    const snap = Math.round(rot / 15) * 15
    if (Math.abs(rot - snap) < 4) rot = snap
    setSelectedFurnitureRotation(rot)
    const f = selectedFurniture.value
    if (f) updateDragHud(e, f)
    return
  }
  if (press && !press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) {
    press.moved = true
    clearTimeout(press.timer)
  }
  if (touchPlacing) {
    updateGhost(e)
    return
  }
  if (drag && press?.moved) moveDrag(e)
}

function onTouchUp(e: PointerEvent) {
  if (twist) {
    if (touches.size < 2) {
      twist = null
      endDrag()
    }
    if (!touches.size) controls.enabled = true
    return
  }
  const pr = press
  clearTimeout(pr?.timer)
  press = null
  if (touchPlacing) {
    touchPlacing = false
    controls.enabled = true
    if (e.type !== 'pointercancel' && ghost?.visible) dropPlacing(e)
    else hideGhost()
    return
  }
  if (drag) {
    endDrag()
    controls.enabled = true
    return
  }
  // 点按（没动、没长按）：点到家具 / 门窗选中它，点到空处取消选中
  if (pr && !pr.moved && !pr.long && e.type !== 'pointercancel') {
    const rid = pr.hitId || pr.house ? null : pickLightRoom(e)
    selection.value = pr.hitId ? { type: 'furniture', id: pr.hitId } : pr.house ? houseSel(pr.house) : rid ? { type: 'room', id: rid } : null
    // 点在车、围挡（外观视图下屋顶、外墙）上：选中它，旁边浮出编辑卡片
    selectSite(pr.hitId || pr.house || rid ? null : pickSite(e))
  }
}

/** 拖动中：按指针位置摆家具（落地吸附 / 落在台面上 / 吸到墙上），上面的东西跟着走 */
function moveDrag(e: PointerEvent) {
  if (!drag) return
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
    showGuides(q.guides, activeY())
    updateDragHud(e, f)
  }
}
const hovering = ref(false)
const editing = computed(() => sandbox.mode === 'edit')

// ---------- 第一人称漫游 ----------

let walker: Walker | null = null
let walkDetach: (() => void) | null = null
let ceilingRoot: THREE.Group | null = null
let walkSaved: { pos: THREE.Vector3; target: THREE.Vector3; mode: 'edit' | 'preview'; near: number } | null = null
const walkLayer = ref<HTMLDivElement>()
/** 触屏摇杆（屏幕坐标，给界面画） */
const walkStick = ref<{ x: number; y: number; dx: number; dy: number } | null>(null)
/** 鼠标锁定中（FPS 式看四周） */
const walkLocked = ref(false)
/** 小地图画布、所在房间、准星对着的东西 */
const walkMap = ref<HTMLCanvasElement>()
const walkRoom = ref('')
const walkTarget = ref('')
const MINI_SIZE = 168
let mini: { floor: string; data: MiniMapData } | null = null
let lastMini = 0
let lastAim = 0

/** 小地图：按楼层缓存要画的东西，自己走动 / 转身时重画（最多每秒 15 次） */
function drawWalkMap(now: number, force = false) {
  const c = walkMap.value
  if (!walker || !c || (!force && now - lastMini < 66)) return
  lastMini = now
  const raw = toRaw(plan.value)
  if (mini?.floor !== walker.floor) mini = { floor: walker.floor, data: miniMapData(raw, walker.floor) }
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  if (c.width !== MINI_SIZE * dpr) c.width = c.height = MINI_SIZE * dpr
  const ctx = c.getContext('2d')
  if (!ctx) return
  drawMiniMap(ctx, mini.data, walker.pos, walker.yaw, MINI_SIZE, dpr)
  const room = mini.data.rooms.find((r) => pointInPolygon(walker!.pos, r.points))
  const fl = isMultiFloor(raw) ? floorById(raw, walker.floor)?.name ?? '' : ''
  walkRoom.value = [fl, room ? roomName(room.name) : ''].filter(Boolean).join(' · ')
}

/** 准星对着的东西（6 米以内、没被墙挡住）：家具显示名字，设备（马桶、厨房…）显示种类；每秒查 10 次 */
const aimRay = new THREE.Raycaster()
function aimWalk(now: number) {
  if (!walker || now - lastAim < 100) return
  lastAim = now
  aimRay.setFromCamera(new THREE.Vector2(0, 0), stage.camera)
  aimRay.far = 600
  const hits = aimRay.intersectObject(furnRoot, true)
  const wall = house ? aimRay.intersectObject(house, true).find((h) => (h.object as THREE.Mesh).isMesh && shown(h.object) && opaqueHit(h)) : undefined
  const far = wall ? wall.distance + 0.5 : Infinity
  let text = ''
  for (const h of hits) {
    if (h.distance > far) break
    if (!shown(h.object, true)) continue
    let o: THREE.Object3D | null = h.object
    while (o && !o.userData.furnitureId) o = o.parent
    const f = o ? findFurniture(o.userData.furnitureId as string) : undefined
    const d = f && ASSET_MAP.get(f.asset)
    if (d) {
      text = displayName(d)
      break
    }
  }
  if (!text && wall) {
    let o: THREE.Object3D | null = wall.object
    while (o && !o.userData.fixtureId) o = o.parent
    const fx = o ? plan.value.fixtures.find((x) => x.id === o!.userData.fixtureId) : undefined
    if (fx) text = t(FIXTURES[fx.kind].label)
  }
  walkTarget.value = text
}

/** 进入漫游：预览模式，墙满高、楼层叠好、盖上天花板，镜头交给 Walker */
async function enterWalk() {
  if (walking.value || !house) return
  blueprint.on = false
  walkSaved = { pos: stage.camera.position.clone(), target: controls.target.clone(), mode: sandbox.mode, near: stage.camera.near }
  setMode('preview')
  controls.autoRotate = false
  controls.enabled = false
  walking.value = true
  // 楼层立刻叠好（不播滑动动画）：Walker 按楼层高度定位
  floorTargets(true)
  const raw = toRaw(plan.value)
  walker = new Walker(raw, stage.camera, {
    lift: liftOf,
    onFloor: (id) => setFloor(id),
  })
  if (isMultiFloor(raw)) setFloor(walker.floor)
  ceilingRoot = ceilings(raw, (id) => liftOf(id) + (floorGroups.find((g) => g.floor.id === id)?.wallH ?? 240))
  stage.scene.add(ceilingRoot)
  stage.camera.fov = 72
  stage.camera.near = 5
  stage.camera.updateProjectionMatrix()
  await nextTick()
  if (walker && walkLayer.value) walkDetach = walker.attach(walkLayer.value, (st) => (walkStick.value = st), (on) => (walkLocked.value = on))
  drawWalkMap(performance.now(), true)
  dirty = true
}

/** 退出漫游：恢复进入前的视角和模式 */
function exitWalk() {
  if (!walking.value) return
  walkDetach?.()
  walkDetach = null
  walker = null
  walkStick.value = null
  walkLocked.value = false
  walkTarget.value = ''
  walkRoom.value = ''
  mini = null
  if (ceilingRoot) {
    stage.scene.remove(ceilingRoot)
    ceilingRoot.traverse((n) => (n as THREE.Mesh).geometry?.dispose())
    ceilingRoot = null
  }
  walking.value = false
  controls.enabled = true
  if (walkSaved) {
    stage.camera.position.copy(walkSaved.pos)
    controls.target.copy(walkSaved.target)
    stage.camera.near = walkSaved.near
    setMode(walkSaved.mode)
    walkSaved = null
  }
  applyFov(sandbox.fov, false)
  stage.camera.up.set(0, 1, 0)
  controls.update()
  updateCutaway()
  dirty = true
}

/** 从设计图回到布置 / 预览 */
function leaveBlueprint(m: 'edit' | 'preview') {
  blueprint.on = false
  setMode(m)
}

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
  // 设计图：视角由它自己的控制器处理，不选、不拖家具
  if (blueprint.on) return
  // 用户动手转视角时停下自动旋转
  if (controls.autoRotate) sandbox.autoRotate = false
  const touch = e.pointerType !== 'mouse'
  if (touch) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (!editing.value) return
  setHover(null)
  if (touch) return onTouchDown(e)
  if (e.button !== 0) {
    if (e.button === 2 && placing.value) placing.value = null
    return
  }
  if (placing.value) {
    dropPlacing(e, e.shiftKey)
    return
  }
  const hit = pickAt(e)
  const id = hit.furniture
  if (id) {
    // 按下只选中；拖过一段距离才开始移动（没选中的要拖得更远），免得点一下手一抖就把家具挪了
    const wasSelected = selection.value?.type === 'furniture' && selection.value.id === id
    selection.value = { type: 'furniture', id }
    pendingDrag = { e, id, slop: wasSelected ? 3 : 12 }
    // 按在家具上不转视角
    controls.enabled = false
  } else {
    // 天花板灯具：选中它所在的房间（浮出灯光开关卡片）；门窗和外观对象松手时（没拖动）才选中，按在上面拖动照样转视角
    const rid = hit.house ? null : pickLightRoom(e)
    if (rid) selection.value = { type: 'room', id: rid }
    else down = { x: e.clientX, y: e.clientY }
  }
}

/** 鼠标按在家具上、还没拖够距离（slop，像素）的状态 */
let pendingDrag: { e: PointerEvent; id: string; slop: number } | null = null

function onPointerMove(e: PointerEvent) {
  if (blueprint.on) return
  const touch = e.pointerType !== 'mouse'
  if (pendingDrag && !touch) {
    if (e.buttons === 0) pendingDrag = null
    else {
      const p = pendingDrag
      if (Math.hypot(e.clientX - p.e.clientX, e.clientY - p.e.clientY) < p.slop) return
      pendingDrag = null
      // 偏移按按下时的位置算，家具不会一下跳到指针下
      beginDrag(p.e, p.id)
      moveDrag(e)
      return
    }
  }
  if (touch && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (onRotateMove(e)) {
    dirty = true
    return
  }
  if (!touch && (e.buttons === 0 || drag || placing.value)) updateHoverRoom(e)
  if (touch) {
    if (editing.value) onTouchMove(e)
    return
  }
  if (placing.value && ghost) {
    updateGhost(e)
    return
  }
  if (drag) {
    moveDrag(e)
    return
  }
  // 悬停：换指针、提亮指到的家具（选中的那件已经有选中圈，不再提亮）
  if (e.buttons === 0 && editing.value) {
    const hit = pickAt(e)
    const id = hit.furniture
    hovering.value = !!id || !!hit.house
    setHover(id && id !== (selection.value?.type === 'furniture' ? selection.value.id : null) ? id : null)
    const sel = selection.value
    setHoverHouse(hit.house && !(sel && (sel.type === 'opening' || sel.type === 'fixture') && `${sel.type}:${sel.id}` === `${hit.house.kind}:${hit.house.id}`) ? hit.house : null)
  }
}

function onPointerUp(e: PointerEvent) {
  if (blueprint.on) return
  if (e.pointerType !== 'mouse') {
    touches.delete(e.pointerId)
    if (editing.value) onTouchUp(e)
    return
  }
  if (pendingDrag) {
    pendingDrag = null
    controls.enabled = true
  }
  if (drag) {
    endDrag()
    controls.enabled = true
  } else if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
    // 点在门窗 / 设备上：选中它（和平面图是同一个选中），旁边浮出编辑卡片
    const h = pickAt(e).house
    selection.value = h ? houseSel(h) : null
    // 点在车、围挡（外观视图下屋顶、外墙）上：选中它，旁边浮出编辑卡片；点空处取消
    selectSite(h ? null : pickSite(e))
  }
  down = null
}

function onPointerLeave() {
  updateHoverRoom(null)
  setHover(null)
  setHoverHouse(null)
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
    rotating = { base: turnAngle(findFurniture(selection.value.id)!), start: ang }
    controls.enabled = false
  }
  let target = rotating.base + (ang - rotating.start)
  if (e.shiftKey) target = Math.round(target / 15) * 15
  setSelectedFurnitureRotation(target)
  const f = selectedFurniture.value
  if (f) updateDragHud(e, f)
  return true
}
function endRotate() {
  if (!rotating) return
  rotating = null
  settle()
  controls.enabled = true
  dragHud.value = null
  wallGuide.hide()
  dirty = true
}
let rKey = false
function onKeyUp(e: KeyboardEvent) {
  // 窗口失焦（blur）也走这里，事件上没有 key
  if (!e.key || e.key.toLowerCase() === 'r') {
    rKey = false
    endRotate()
  }
}

function onKey(e: KeyboardEvent) {
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
  // 快捷键帮助 / 我的户型 / 确认框开着时不响应（Esc 留给它们关闭自己）
  if (overlays.help || saved.panelOpen || saved.confirm) return
  const k = e.key.toLowerCase()
  // 漫游：Esc / V 退出，其余按键交给 Walker（走路、转身）
  // （鼠标锁定时浏览器自己吃掉 Esc 用来释放鼠标；刚释放的那一下不算退出）
  if (walking.value) {
    if ((e.key === 'Escape' || k === 'v') && !e.repeat && !walker?.locked && performance.now() - (walker?.unlockedAt ?? 0) > 250) exitWalk()
    return
  }
  if (k === 'v' && !e.repeat) {
    enterWalk()
    return
  }
  // 设计图：B 切换，F 重置视角，Esc 退出；其余快捷键不响应
  if (k === 'b' && !e.repeat) {
    blueprint.on = !blueprint.on
    return
  }
  if (blueprint.on) {
    if (k === 'f') bp?.resetView()
    else if (e.key === 'Escape') blueprint.on = false
    return
  }
  if (k === 'r' && !e.repeat) rKey = true
  // 贴附物（便签、贴纸）在面里转：一次 15°（Shift 5°）
  const sel = selection.value?.type === 'furniture' ? findFurniture(selection.value.id) : undefined
  const stuck = !placing.value && !!sel && !!ASSET_MAP.get(sel.asset)?.stick
  const step = stuck ? (e.shiftKey ? 5 : 15) : e.shiftKey ? 15 : 90
  if (k === 'p') setMode(editing.value ? 'preview' : 'edit')
  if (k === 'o') sandbox.exterior = !sandbox.exterior
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
    } else if (selection.value?.type === 'fixture') rotateSelectedFixture(k === 'q' ? -90 : 90)
    else rotateSelectedFurniture(deg)
  } else if (e.key === 'Escape') {
    if (placing.value) placing.value = null
    else if (siteSel.value) siteSel.value = null
    else selection.value = null
  }
}

// ---------- 面板操作 ----------

async function autoDecorate() {
  // 布置要算一会儿：先画出「处理中」，完成后报件数
  await runBusy(t('正在布置家具…'), redecorate)
  toast(t('已布置 {n} 件家具', { n: plan.value.furniture.length }))
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
  // 手机：收起抽屉，把地面让出来点按
  if (placing.value && device.compact) sheet.value = 'peek'
}

// ---------- 从家具栏直接拖进场景（pointer 事件实现，手机上也能用；HTML5 拖放在移动端不可用） ----------
// 鼠标：按住卡片拖出 6px 就开始；手指：长按卡片约 0.3 秒再拖（直接滑动是滚动列表）。
// 拖动中缩略图跟着指针，进入画布后摆放预览跟着走，松手放下；在画布外松手就取消。
let cardPress: { asset: string; x: number; y: number; id: number; touch: boolean; timer: number; started: boolean; src: string; last: PointerEvent } | null = null
const cardGhost = ref<{ x: number; y: number; src: string } | null>(null)
let suppressCardClick = false

function onCardDown(e: PointerEvent, asset: string) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const src = (e.currentTarget as HTMLElement).querySelector('img')?.src ?? ''
  cardPress = { asset, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', timer: 0, started: false, src, last: e }
  if (cardPress.touch) {
    cardPress.timer = window.setTimeout(() => {
      if (cardPress && !cardPress.started) beginCardDrag(cardPress.last)
    }, 320)
  }
  window.addEventListener('pointermove', onCardMove, { passive: false })
  window.addEventListener('pointerup', onCardUp)
  window.addEventListener('pointercancel', onCardUp)
  // 拖动开始后拦住页面 / 列表的触摸滚动（否则浏览器接管手势、发 pointercancel）
  window.addEventListener('touchmove', blockTouch, { passive: false })
}
function blockTouch(e: TouchEvent) {
  if (cardPress?.started) e.preventDefault()
}
function beginCardDrag(e: PointerEvent) {
  const cp = cardPress
  if (!cp) return
  cp.started = true
  suppressCardClick = true
  if (!editing.value) setMode('edit')
  selection.value = null
  placing.value = { asset: cp.asset, color: paletteFor(ASSET_MAP.get(cp.asset)!, libFilter.style) }
  // 手机：收起抽屉，露出画布
  if (device.compact) sheet.value = 'peek'
  cardGhost.value = { x: e.clientX, y: e.clientY, src: cp.src }
  navigator.vibrate?.(8)
}
/** 指针是否在画布上（没被抽屉、工具条盖住） */
function overCanvas(e: { clientX: number; clientY: number }) {
  return document.elementFromPoint(e.clientX, e.clientY) === canvas.value
}
function onCardMove(e: PointerEvent) {
  const cp = cardPress
  if (!cp || e.pointerId !== cp.id) return
  cp.last = e
  const d = Math.hypot(e.clientX - cp.x, e.clientY - cp.y)
  if (!cp.started) {
    if (!cp.touch && d > 6) beginCardDrag(e)
    else {
      // 手指在长按前就动了：是在滚动列表
      if (cp.touch && d > TAP_SLOP) endCardPress()
      return
    }
  }
  e.preventDefault()
  cardGhost.value = { x: e.clientX, y: e.clientY, src: cp.src }
  if (overCanvas(e)) {
    updateHoverRoom(e)
    updateGhost(e)
  } else hideGhost()
}
function onCardUp(e: PointerEvent) {
  const cp = cardPress
  if (!cp || e.pointerId !== cp.id) return
  if (cp.started) {
    if (e.type !== 'pointercancel' && overCanvas(e)) dropPlacing(e)
    placing.value = null
    hideGhost()
    // 紧跟着的 click 不算点卡片
    setTimeout(() => (suppressCardClick = false), 0)
  }
  endCardPress()
}
function endCardPress() {
  if (cardPress) clearTimeout(cardPress.timer)
  cardPress = null
  cardGhost.value = null
  window.removeEventListener('pointermove', onCardMove)
  window.removeEventListener('pointerup', onCardUp)
  window.removeEventListener('pointercancel', onCardUp)
  window.removeEventListener('touchmove', blockTouch)
}
function onCardClick(asset: string) {
  if (suppressCardClick) {
    suppressCardClick = false
    return
  }
  startPlacing(asset)
}

// ---------- 家具栏：按大类 / 房间 / 风格 / 尺寸筛选，同系列合成一项 ----------

const libFilter = reactive<Filter>({ group: 'all', room: 'all', type: 'all', style: 'all', size: 'all', query: '', fixtures: false })
// 细分类型：换大类时回到「全部」，只在选了某个大类时可选
watch(
  () => libFilter.group,
  () => (libFilter.type = 'all'),
)
const libTypes = computed(() => (libFilter.group === 'all' ? [] : typesIn(libFilter)))
const libGroups = groupsOf(false)
const styleKeys = Object.keys(STYLE_LABELS) as StyleTag[]
const sizeKeys = Object.keys(SIZE_LABELS) as SizeClass[]
const placeable = computed(() => browse(libFilter))
// 1500+ 张卡片按滚动逐批挂载（每批 48 张），筛选变化时回到第一批
const { shown: shownPlaceable, more: morePlaceable, vSentinel } = useProgressive(() => placeable.value, 48)
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
const paperRooms = computed(() => plan.value.rooms.filter((r) => r.kind !== 'balcony' && r.kind !== 'void'))
/** 墙纸的房间下拉：多层户型前面加楼层名 */
const paperRoomLabel = (r: { name: string; floor?: string }) => (isMultiFloor(plan.value) ? `${floorById(plan.value, floorOf(plan.value, r))?.name ?? ''} · ` : '') + roomName(r.name)
const wpRoomId = ref('')
const wpRoom = computed(() => plan.value.rooms.find((r) => r.id === wpRoomId.value) ?? paperRooms.value[0])
watch(paperRooms, (rs) => {
  if (!rs.some((r) => r.id === wpRoomId.value)) wpRoomId.value = rs[0]?.id ?? ''
}, { immediate: true })
const WP_COLORS = ['#fbf7f1', '#f2f2f0', '#fff4f1', '#f3f8ff', '#f4fbf6', '#fff9e8', '#f6f0e1', '#e6e6e4', '#d6d3cd', '#f4e7c8', '#dfe8f0', '#3d3f44']
const WP_PATTERNS: PatternKind[] = ['stripes', 'dots', 'gingham', 'flowers', 'sakura', 'stars', 'asanoha', 'seigaiha', 'ichimatsu', 'chevron', 'houndstooth', 'argyle']
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
/**
 * 清单分组：房间条目按房间（多层户型带楼层，两层都有的「トイレ」分开），按层的条目归到「2F · 每层」，全户条目归到「全屋」。
 * 返回 [分组键, 显示名, 条目]。
 */
const checkGroups = computed(() => {
  const p = toRaw(plan.value)
  const multi = isMultiFloor(p)
  const fname = (id?: string) => (id ? (floorById(p, id)?.name ?? '') : '')
  const m = new Map<string, { label: string; items: typeof checkItems.value }>()
  for (const it of checkItems.value) {
    const key = it.roomId ? `r:${it.roomId}` : it.perFloor ? `f:${it.floor}` : 'home'
    const label = it.roomId ? (multi ? `${fname(it.floor)} · ` : '') + roomName(it.roomName) : it.perFloor ? `${fname(it.floor)} · ${t('每层')}` : roomName(it.roomName)
    const g = m.get(key) ?? { label, items: [] }
    g.items.push(it)
    m.set(key, g)
  }
  return [...m.entries()].map(([k, g]) => [k, g.label, g.items] as const)
})
/** 住户面板：每个人住的房间（多层户型带楼层） */
const memberRoomMap = computed(() => {
  void planVer.value
  const p = toRaw(plan.value)
  return p.household ? memberRooms(p, p.household) : new Map<string, Room>()
})
function memberRoomLabel(id: string) {
  const r = memberRoomMap.value.get(id)
  if (!r) return ''
  const p = toRaw(plan.value)
  return (isMultiFloor(p) ? `${floorById(p, floorOf(p, r))?.name ?? ''} · ` : '') + roomName(r.name)
}
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
  // 设计图开着：沙盘停画，只推进设计图的视角
  if (bp?.active) {
    bp.frame()
    return
  }
  const moved = walker ? walker.update(dt) : controls.update()
  if (walker) {
    if (moved) drawWalkMap(now)
    aimWalk(now)
  }
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
  // 省电画质：只有动画（粒子、走动的角色）在变时，最多 30fps 重画
  const low = lowPower()
  const actorsBusy = actors.update(dt)
  const anim = fx.update(dt, stage.renderer.domElement.height) || actorsBusy
  // 楼层切换 / 分层拉开的缓动：动画期间沿用旧阴影（每次重画阴影要提交上千次 draw call），停下的那一帧重画一次
  if (stepFloors(dt)) {
    dirty = true
    if (!floorsMoving) shadowDirty = true
  }
  if (anim && !(low && now - lastRender < 32)) dirty = true
  if (fading && house) {
    // 壁挂物按透明方式淡出（压低模式下也是淡出，它们没有矮墙可压）
    const furnBusy = stepCutaway(furnRoot, dt, { ...wallLook(), style: 'fade', opacity: sandbox.wallMode === 'fade' ? sandbox.cutawayOpacity / 100 : 0 })
    const lampBusy = stepCutaway(lights.fixtures, dt, { ...wallLook(), style: 'fade', opacity: 0 })
    if (lights.fixtures.userData.cutawayChanged) {
      lights.fixtures.userData.cutawayChanged = false
      dirty = true
    }
    fading = stepHouse(dt, wallLook()) || furnBusy || lampBusy
    const houseMoved = houseChanged()
    if (houseMoved || furnRoot.userData.cutawayChanged) {
      furnRoot.userData.cutawayChanged = false
      cutawayShadow = true
      dirty = true
    }
  }
  // 墙体渐变同理：渐变中保留旧阴影，全部停下后重画一次（转镜头时墙一直在让开，不再每帧重画阴影）
  if (cutawayShadow && !fading) {
    cutawayShadow = false
    shadowDirty = true
    dirty = true
  }
  // 选中框：出现时缩入，之后角标呼吸（省电画质 / 减少动效时静止，画面不用每帧重画）
  const framesMoving = [selFrame.update(now, low), hoverFrame.update(now, true), ghostFrame.update(now, true), siteFrame.update(now, low)].some(Boolean)
  if (framesMoving) dirty = true
  // 灯光渐亮 / 渐灭（开关、黄昏清晨）
  if (lights.step(dt)) dirty = true
  // 高亮叠加层跟上目标（拖动、墙体让开、楼层淡出时）
  const hoverMoved = hoverHi.sync()
  if (siteHL.sync() || hoverMoved) dirty = true
  if (moved) {
    if (!walker) updateCutaway()
    updateCompass()
  }
  if (moved || dirty) {
    placeSiteCard()
    syncFloorFades()
    if (shadowDirty) stage.renderer.shadowMap.needsUpdate = true
    stage.render()
    dirty = false
    lastRender = now
  }
}
let lastRender = 0
/** 墙体渐变改过投影，等渐变结束后重画阴影 */
let cutawayShadow = false

/** 切到后台 / 锁屏：停掉渲染循环；回来时接着跑（时间步长从头算，不会一下跳很多） */
function onVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(raf)
    raf = 0
  } else if (!raf) {
    lastFrame = performance.now()
    dirty = true
    loop()
  }
}

/** 画质切换（场景页的「画质」或设备变化）：像素比、阴影、抗锯齿方式 */
function applyQuality() {
  const low = lowPower()
  setStageQuality(stage, low)
  // setStageQuality 里的 resize 会重设宽高比，重新套上抽屉偏移
  applySheetOffset()
  post.setLow(low)
  // 灯数池大小跟画质：只在切换画质时重编译一次着色器
  lights.setPoolSize(low ? POOL_LOW : POOL_HIGH)
  dirty = true
}

onMounted(() => {
  stage = createStage(canvas.value!, { low: lowPower() })
  post = attachPost(stage, { low: lowPower() })
  post.setLook(sandbox.look)
  lights = new IndoorLights(lowPower() ? POOL_LOW : POOL_HIGH)
  stage.scene.add(lights.group, lights.fixtures)
  applySky()
  stage.renderer.shadowMap.autoUpdate = false
  stage.renderer.shadowMap.needsUpdate = true
  // 场景根和家具根固定在原点：不设成静态矩阵的话，它们每帧 updateMatrix 会逼着整棵树重算世界矩阵
  stage.scene.matrixAutoUpdate = false
  furnRoot.matrixAutoUpdate = false
  stage.scene.add(furnRoot, frameRoot, guideRoot, fx.group, hoverHi.root, siteHL.root)
  stage.scene.add(actors.group)
  controls = new OrbitControls(stage.camera, canvas.value!)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.maxPolarAngle = Math.PI * 0.47
  controls.minDistance = 150
  controls.maxDistance = 6000
  applyFov(sandbox.fov, false)
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
  syncLineRes(r.width, r.height)
  viewSize = { w: r.width, h: r.height }
  applySheetOffset()
  ro = new ResizeObserver(([entry]) => {
    stage.resize(entry.contentRect.width, entry.contentRect.height)
    syncLineRes(entry.contentRect.width, entry.contentRect.height)
    viewSize = { w: entry.contentRect.width, h: entry.contentRect.height }
    applySheetOffset()
    bp?.resize(entry.contentRect.width, entry.contentRect.height)
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
  document.addEventListener('visibilitychange', onVisibility)
  // 捕获阶段：比 SandboxOverlay 的双击聚焦先拿到（同一元素上捕获监听先触发）
  canvas.value!.addEventListener('dblclick', onDblClick, true)
  liveCapture.fn = captureView
  // 浮动工具条 / 右键菜单 / 双击聚焦 / 方向键微移（SandboxOverlay.vue）用的句柄
  sandboxBridge.value = {
    canvas: canvas.value!,
    camera: stage.camera,
    controls,
    object: (id) => objs.get(id)?.obj,
    pick: (e) => pickFurniture(e as PointerEvent),
    pickStairs: (e) => pickStairs(e as PointerEvent),
    resetView,
    redraw: () => (dirty = true),
    showProps: () => {
      tab.value = 'sel'
      if (sheet.value === 'peek') sheet.value = 'half'
    },
  }
})

/**
 * 「我的户型」保存时截当前视角做缩略图：临时藏掉选中圈、摆放预览、对齐辅助线，同步渲染一帧后立即还原。
 * 带当前画面效果（所见即所得）；沙盘没开时的离屏缩略图（planThumb）不加效果。
 */
function captureView(w: number, h: number) {
  if (!house) return null
  setHover(null)
  const hidden = [frameRoot, guideRoot, ...(ghost ? [ghost] : [])].filter((o) => o.visible)
  for (const o of hidden) o.visible = false
  try {
    stage.render()
    return coverInto(stage.renderer.domElement, w, h)
  } finally {
    for (const o of hidden) o.visible = true
    dirty = true
    bp?.invalidate()
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
  applyLights()
  sunMoved = true
  dirty = true
}

/** 室内灯光的全局状态：自动 / 开 / 关、色温、太阳高度 → 各房间、灯具的目标亮度 */
function applyLights() {
  const s = skyNow.value
  if (!s || !lights) return
  const power = sandbox.lightPower / 100
  lights.setState({ global: sandbox.lightMode, kelvin: sandbox.lightK, auto: autoLevel(s.altitude), night: s.night, power })
  const kel = lightColor(sandbox.lightK)
  const avg = lights.averageLevel
  post.setIndoor(kel, avg * Math.min(1.2, power))
  // 夜里开着灯：整体补一点暖色的氛围光（天光加强、地面反光偏暖），让平均亮度上来，不靠灯池中心的高光
  const fill = avg * s.night * power
  // （天光本身保持蓝紫，只加强度、地面反光偏暖：底座、户外仍是夜色）
  stage.hemi.intensity = s.hemiIntensity + 0.25 * fill
  stage.hemi.color.copy(s.hemiSky)
  stage.hemi.groundColor.copy(s.hemiGround).lerp(kel, Math.min(1, 0.6 * fill))
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
/** 播放 / 暂停时间流逝：播放过就算改过时间，不再跟随当前时间 */
function togglePlay() {
  sandbox.playing = !sandbox.playing
  if (sandbox.playing) sandbox.timeSet = true
}
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
  bp?.dispose()
  bp = null
  blueprint.on = false
  lights.dispose()
  clearTimeout(warmTimer)
  warmTarget?.dispose()
  if (liveCapture.fn === captureView) liveCapture.fn = null
  sandboxBridge.value = null
  cancelAnimationFrame(raf)
  ro?.disconnect()
  controls.dispose()
  post.dispose()
  stage.dispose()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onKeyUp as unknown as () => void)
  document.removeEventListener('visibilitychange', onVisibility)
  endCardPress()
  setHover(null)
  hoverHi.dispose()
  siteHL.dispose()
  for (const f of [selFrame, hoverFrame, ghostFrame, wallGuide]) f.dispose()
  placing.value = null
})

// 房间的灯光开关 / 色温不影响房子本身：比较时剔掉，免得一开灯就整栋重建
const roomsShape = () => JSON.stringify(plan.value.rooms, (k, v) => (k === 'light' || k === 'lightK' ? undefined : v))
watch(
  () => [roomsShape(), plan.value.openings, plan.value.fixtures, plan.value.wall, plan.value.wallOuter, sandbox.wallHeight, plan.value.floors, plan.value.site, plan.value.exterior],
  rebuildHouse,
  { deep: true },
)
// 换楼层 / 换楼层显示方式：各层缓动到新位置；墙体压低换到新的当前层
// 外观视图开关：墙高要换（重搭），楼层叠好，墙恢复完整，屋顶显示
watch(fullView, () => {
    if (!house) return
    rebuildHouse()
    floorTargets()
    updateCutaway()
    dirty = true
})
watch(
  () => sandbox.mode,
  () => updateCutaway(),
)
watch([activeFloor, floorShow], () => {
  if (!house) return
  // 墙高滑杆调低时只有当前层是矮墙：换层要重搭
  if (isMultiFloor(plan.value) && sandbox.wallHeight < 240 && !fullView() && builtActive !== activeFloor.value) rebuildHouse()
  floorTargets()
  updateCutaway()
  hoverRoomId = null
  // 当前层以外的家具不能选中
  const s = selection.value
  if (s?.type === 'furniture') {
    const f = findFurniture(s.id)
    if (f && floorOf(plan.value, f) !== activeFloor.value) selection.value = null
  }
  // 门窗同理（跟着所在房间的楼层）；设备只留当前层的（楼梯在上一层也能留着）
  if (s?.type === 'opening' && !fv().openings.some((o) => o.id === s.id)) selection.value = null
  if (s?.type === 'fixture' && !fixtureSelectable(s.id)) selection.value = null
  updateRing()
  placing.value = null
  dirty = true
})
watch(
  () => plan.value.rooms.map((r) => `${r.light ?? ''}/${r.lightK ?? ''}`).join(),
  () => {
    lights.refreshTargets()
    applyLights()
  },
)
watch(() => [sandbox.lightMode, sandbox.lightK, sandbox.lightPower], applyLights)

watch(() => plan.value.furniture, syncFurniture, { deep: true })
// 布置 / 预览切换：角色回家静止 / 开始活动（素材里的角色部分随之隐藏、复原，阴影贴图要重画）
watch(
  () => [sandbox.mode, !!selection.value, !!placing.value] as const,
  () => {
    syncActors()
    stage.renderer.shadowMap.needsUpdate = true
    dirty = true
  },
)
watch(selection, () => {
  updateRing()
  applyXray()
})
// 门窗的选中框只在布置模式里显示（进漫游、预览时藏起来，回来再显示）
watch([editing, walking], () => updateRing())
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
    if (house) stepHouse(0, wallLook(), true)
    updateCutaway()
  },
)
watch(
  () => [sandbox.cutawayOpacity, sandbox.cutHeight],
  () => {
    if (house) stepHouse(0, wallLook(), true)
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

watch(lowPower, applyQuality)

// ---------- 侧栏 / 底部抽屉：标签页 ----------
// 原来一条长侧栏（设置 + 住户 + 墙纸 + 清单 + 1500 件家具）拆成几页；选中家具时自动切到「属性」页，取消选中回到原来那页。
type Tab = 'sel' | 'lib' | 'scene' | 'home' | 'decor' | 'ext'
const TAB_KEY = 'my-home:sandbox-tab'
function loadTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY)
    if (v === 'lib' || v === 'scene' || v === 'home' || v === 'decor' || v === 'ext') return v
  } catch {
    /* 读不到就用默认 */
  }
  return 'scene'
}
const tab = ref<Tab>(loadTab())
let tabBeforeSel: Tab = tab.value === 'sel' ? 'scene' : tab.value
// ---------- 外观页：户建的屋顶、外墙、围挡、车（Plan.exterior / site） ----------
const hasOutside = computed(() => !!(plan.value.site || plan.value.exterior))
// 公寓、换成没有用地的户型时外观页不存在：退回场景页
watch(
  hasOutside,
  (v) => {
    if (!v && tab.value === 'ext') tab.value = 'scene'
  },
  { immediate: true },
)
// ---------- 门窗的选中（布置模式）：点门扇、窗框、玻璃选中洞口（selection 和平面图共用），旁边浮出门窗卡片 ----------
const selectedOpening = computed(() => {
  const s = selection.value
  return s?.type === 'opening' ? (plan.value.openings.find((o) => o.id === s.id) ?? null) : null
})
const openingCard = ref<HTMLDivElement>()
const openingTitle = computed(() => {
  const o = selectedOpening.value
  if (!o) return ''
  const r = findRoom(o.roomId)
  return r ? `${t(OPENING_LABELS[o.kind])} · ${roomName(r.name)}` : t(OPENING_LABELS[o.kind])
})
// 换了一个洞口：卡片先藏着，等 placeSiteCard 摆好位置
watch(
  () => selectedOpening.value?.id,
  () => {
    if (openingCard.value) openingCard.value.style.visibility = ''
    dirty = true
  },
)
// ---------- 设备的选中（布置模式）：点厨房、浴缸、马桶、收纳位、楼梯…选中它（selection 和平面图共用），旁边浮出设备卡片 ----------
const selectedFixture = computed(() => {
  const s = selection.value
  return s?.type === 'fixture' ? (plan.value.fixtures.find((f) => f.id === s.id) ?? null) : null
})
const fixtureCard = ref<HTMLDivElement>()
const fixtureTitle = computed(() => {
  const f = selectedFixture.value
  if (!f) return ''
  const r = roomAt(plan.value, f, f.floor ?? null)
  return r ? `${t(FIXTURES[f.kind].label)} · ${roomName(r.name)}` : t(FIXTURES[f.kind].label)
})
watch(
  () => selectedFixture.value?.id,
  () => {
    if (fixtureCard.value) fixtureCard.value.style.visibility = ''
    dirty = true
  },
)
// ---------- 外观对象的选中（布置模式）：点车、围挡（外观视图下还有屋顶、外墙）选中它，旁边浮出编辑卡片 ----------
/** 选中的外观对象；和家具 / 房间的选中互斥 */
const siteSel = ref<SiteTarget | null>(null)
/** 卡片挨着的点（世界坐标，点中时的命中点） */
let siteAnchor: THREE.Vector3 | null = null
const siteCard = ref<HTMLDivElement>()
/** 卡片跟着对象走（桌面）；手机上停靠在底部抽屉上方 */
const siteCardAnchored = computed(() => !device.compact)
const siteSelTitle = computed(() => {
  const s = siteSel.value
  if (!s) return ''
  const k = targetTitle(plan.value, s)
  return k.n === undefined ? t(k.key) : t(k.key, { n: k.n })
})
const SITE_ICONS = { fence: ICONS.extFence, roof: ICONS.extRoof, facade: ICONS.extFacade, car: ICONS.extCar }
const siteIcon = (s: SiteTarget) => (parkingIndex(s) === null ? SITE_ICONS[s as 'fence' | 'roof' | 'facade'] : SITE_ICONS.car)
/** 点中的外观对象：车、围挡随时可选；屋顶、外墙只在墙完整（外观视图）时可选，平时点墙不弹卡片 */
function pickSite(e: { clientX: number; clientY: number }): { target: SiteTarget; point: THREE.Vector3 } | null {
  if (walking.value || !editing.value || blueprint.on) return null
  const raw = toRaw(plan.value)
  if (!raw.site && !raw.exterior) return null
  setRay(e as PointerEvent)
  const hit = raycaster.intersectObjects(floorGroups.map((g) => g.group), true).find((h) => (h.object as THREE.Mesh).isMesh && shown(h.object, true) && opaqueHit(h))
  if (!hit) return null
  const full = fullLook()
  for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
    const sp = o.userData.sitePick as { kind: 'car' | 'fence'; index?: number } | undefined
    if (sp) return { target: sp.kind === 'car' ? parkingTarget(sp.index ?? 0) : 'fence', point: hit.point.clone() }
    if (raw.exterior && o.userData.roof) return { target: 'roof', point: hit.point.clone() }
    if (raw.exterior && full && (o.userData.fade as { outer?: boolean } | undefined)?.outer) return { target: 'facade', point: hit.point.clone() }
  }
  return null
}
function selectSite(p: { target: SiteTarget; point: THREE.Vector3 } | null) {
  siteAnchor = p?.point ?? null
  siteSel.value = p?.target ?? null
  dirty = true
}
/** 选中的外观对象在场景里的部件 */
function siteObjects(s: SiteTarget): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  const idx = parkingIndex(s)
  for (const fg of floorGroups)
    fg.group.traverse((o) => {
      const sp = o.userData.sitePick as { kind: string; index?: number } | undefined
      if (s === 'fence' ? sp?.kind === 'fence' : idx !== null ? sp?.kind === 'car' && sp.index === idx : s === 'roof' ? !!o.userData.roof : !!(o.userData.fade as { outer?: boolean } | undefined)?.outer) out.push(o)
    })
  return out
}
// 选中高亮：和家具悬停一样用提亮的叠加层（three/highlight.ts，不碰部件自己的材质），车脚下再加一个和家具一样的选中框。
// 房子重搭后旧部件已经摘掉，rebuildHouse 末尾会再调一次，套到新模型上
const siteHL = new Highlight(0.25)
function applySiteHi() {
  siteFrame.hide()
  dirty = true
  const s = siteSel.value
  if (!s || !house) return siteHL.clear()
  const objs = siteObjects(s)
  siteHL.set(objs)
  const i = parkingIndex(s)
  const sp = i === null ? undefined : toRaw(plan.value).site?.parking[i]
  if (sp?.car && objs[0]) {
    const w = objs[0].getWorldPosition(new THREE.Vector3())
    const size = carSize(sp.carKind)
    siteFrame.show(w.x, w.y, w.z, size.w, size.L, objs[0].rotation.y)
  }
}
watch(siteSel, applySiteHi)
// 选了家具 / 房间、离开布置模式、进漫游 / 设计图、对象没了（撤销、换户型）：取消
watch(selection, (v) => {
  if (v) siteSel.value = null
})
watch(
  () => [editing.value, walking.value, blueprint.on, sandbox.exterior, siteSel.value && targetValid(plan.value, siteSel.value)] as const,
  ([ed, walk, bp, ext, valid]) => {
    const s = siteSel.value
    if (s && (!ed || walk || bp || !valid || (!ext && (s === 'roof' || s === 'facade')))) siteSel.value = null
  },
)
/** 卡片摆在对象旁边：命中点投到屏幕上，放在右侧（放不下就放左侧），不出画面 */
function placeSiteCard() {
  placeCardAt(siteCard.value, siteAnchor)
  placeCardAt(openingCard.value, houseAnchor)
  placeCardAt(fixtureCard.value, houseAnchor)
}
function placeCardAt(el: HTMLElement | undefined, anchor: THREE.Vector3 | null) {
  const cv = canvas.value
  if (!el || !cv || !anchor || !siteCardAnchored.value) return
  const v = anchor.clone().project(stage.camera)
  if (v.z > 1) return
  const W = cv.clientWidth
  const H = cv.clientHeight
  const x = ((v.x + 1) / 2) * W
  const y = ((1 - v.y) / 2) * H
  const cw = el.offsetWidth
  const ch = el.offsetHeight
  const gap = 28
  let left = x + gap
  if (left + cw > W - 12) left = x - gap - cw
  left = Math.max(12, Math.min(W - cw - 12, left))
  const top = Math.max(56, Math.min(H - ch - 44, y - ch / 2))
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
  el.style.visibility = 'visible'
}
/** 侧栏外观页：展开的那一项 */
const extOpen = ref<SiteTarget | null>(null)
const extTargets = computed(() => siteTargets(plan.value))
/** 一览里每项现在的样子 */
function extCurrent(s: SiteTarget) {
  const p = plan.value
  if (s === 'roof') return p.exterior ? t(ROOF_KINDS[p.exterior.roof]) : ''
  if (s === 'facade') return p.exterior ? t(FACADE_KINDS[p.exterior.facade]) : ''
  if (s === 'fence') return p.site ? t(FENCE_KINDS[p.site.fence]) : ''
  const sp = p.site?.parking[parkingIndex(s) ?? -1]
  return sp ? t(carLabel(carChoice(sp))) : ''
}
const extTitle = (s: SiteTarget) => {
  const k = targetTitle(plan.value, s)
  return k.n === undefined ? t(k.key) : t(k.key, { n: k.n })
}
watch(extTargets, (v) => {
  if (extOpen.value && !v.includes(extOpen.value)) extOpen.value = null
})

const tabs = computed(() => [
  ...(selectedFurniture.value ? [{ id: 'sel' as Tab, label: t('属性'), icon: ICONS.generateOptions }] : []),
  { id: 'lib' as Tab, label: t('家具'), icon: VIEW_ICONS.lib },
  { id: 'scene' as Tab, label: t('场景'), icon: VIEW_ICONS['3d'] },
  { id: 'home' as Tab, label: t('住户'), icon: ICONS.household },
  { id: 'decor' as Tab, label: t('墙纸'), icon: ICONS.wallpaper },
  ...(hasOutside.value ? [{ id: 'ext' as Tab, label: t('外观'), icon: ICONS.exteriorView }] : []),
])
watch(
  () => selectedFurniture.value?.id ?? null,
  (id, old) => {
    if (id && !old) {
      if (tab.value !== 'sel') tabBeforeSel = tab.value
      tab.value = 'sel'
    } else if (!id && tab.value === 'sel') tab.value = tabBeforeSel
  },
)
watch(tab, (v) => {
  if (v === 'sel') return
  try {
    localStorage.setItem(TAB_KEY, v)
  } catch {
    /* 存不了就只在本次生效 */
  }
})
/** 底部抽屉（手机）的三档 */
const sheet = ref<SheetSnap>('peek')
function pickTab(id: Tab) {
  if (tab.value === id && device.compact) {
    // 再点一次当前页：收起 / 展开
    sheet.value = sheet.value === 'peek' ? 'half' : 'peek'
    return
  }
  tab.value = id
  if (device.compact && sheet.value === 'peek') sheet.value = 'half'
}

// ---------- 室内灯光：开关与色温 ----------
const LIGHT_LABELS: Record<LightMode, string> = { auto: '自动', on: '开', off: '关' }
/** 房间单独色温的预设（不填 = 跟随全局） */
const ROOM_K_PRESETS = [2700, 3000, 3500, 4000, 5000, 6500]
const lampSelected = computed(() => !!selectedDef.value && isLampAsset(selectedDef.value))
/** 3D 里点中天花板灯具时选中的房间 */
const selectedRoom = computed(() => {
  const s = selection.value
  return s?.type === 'room' ? plan.value.rooms.find((r) => r.id === s.id) ?? null : null
})
/** 3D 里选中的可开合柜子（有柜门 / 抽屉）：浮出柜门开关卡片 */
const selectedOpenable = computed(() => (selectedFurniture.value && selectedDef.value?.openable ? selectedFurniture.value : null))
/** 屏幕坐标处的天花板灯具 → 房间 id */
function pickLightRoom(e: { clientX: number; clientY: number }) {
  setRay(e as PointerEvent)
  return lights.pickRoom(raycaster)
}
/** 切换：按现在实际亮不亮来定（自动模式下夜里亮着 → 关） */
function toggleRoomLight(id: string) {
  setRoomLight(id, lights.levelOf(id) > 0.5 ? 'off' : 'on')
}
function toggleLamp(id: string) {
  setFurnitureLight(id, lights.levelOf(id) > 0.5 ? 'off' : 'on')
}
function setRoomK(id: string, v: string) {
  setRoomLightK(id, v ? Number(v) : undefined)
}
/** 预览模式下双击灯（灯具家具或天花板灯具）开关它；拦在浮动工具条的「双击聚焦」之前 */
function onDblClick(e: MouseEvent) {
  // 设计图里不做双击聚焦 / 开关灯（相机不是沙盘的）
  if (blueprint.on) {
    e.stopImmediatePropagation()
    return
  }
  if (editing.value) return
  const id = pickFurniture(e as unknown as PointerEvent)
  const def = id ? ASSET_MAP.get(findFurniture(id)?.asset ?? '') : undefined
  if (id && def && isLampAsset(def)) toggleLamp(id)
  else {
    const r = pickLightRoom(e)
    if (!r) return
    toggleRoomLight(r)
  }
  e.stopImmediatePropagation()
}

/** 画质选择 */
const QUALITIES: { id: Quality; label: string }[] = [
  { id: 'auto', label: '自动' },
  { id: 'high', label: '高画质' },
  { id: 'low', label: '省电' },
]

/** 底部提示：触屏和鼠标的操作说法不一样 */
const hudText = computed(() => {
  // 漫游时顶部有自己的提示
  if (walking.value) return ''
  if (!editing.value) return device.coarse ? t('预览模式 · 单指旋转 · 双指缩放 / 平移') : t('预览模式 · 左键旋转 · 右键平移 · 滚轮缩放 · 鼠标所指房间前的墙自动处理 · P 或 Esc 回到布置')
  return device.coarse
    ? t('单指旋转 · 双指缩放 / 平移 · 点家具选中，再按住拖动 · 点门窗、设备（厨房、楼梯…）编辑 · 双指拧转旋转 · 长按弹出菜单')
    : t('左键旋转 · 右键平移 · 滚轮缩放 · 点家具选中后拖动（自动贴墙对齐，Alt 关闭）· 点门窗、设备（厨房、楼梯…）编辑 · Q / E 旋转 · Delete 删除 · C 切换墙体显示 · F 重置视角 · P 预览')
})

const planSize = computed(() => {
  const pts = plan.value.rooms.flatMap((r) => r.points)
  if (!pts.length) return ''
  const b = bbox(pts)
  return `${((b.x1 - b.x0) / 100).toFixed(1)} × ${((b.y1 - b.y0) / 100).toFixed(1)} m`
})

// ---------- 3D 设计图 ----------
// 和「布置 / 预览」并列的一种视图：同一块画布换成设计图自己的场景和相机（three/blueprint.ts），沙盘暂停渲染。
// 结构线框只在户型形状变了时重算，家具线框按素材缓存；进入 / 退出不重搭沙盘。
const bpBusy = ref(false)
/** 家具借用沙盘里现成模型的几何体（设计图只换材质，不重搭） */
const bpInput = () => ({ plan: toRaw(plan.value), model: (f: Furniture) => objs.get(f.id)?.obj })
const bpOptions = () => ({ paper: blueprint.paper, furniture: blueprint.furniture, walls: blueprint.walls, ortho: blueprint.ortho, unit: unitOf(plan.value), layout: blueprint.layout })
function enterBlueprint() {
  if (!stage) return
  selection.value = null
  placing.value = null
  setHover(null)
  showGuides([])
  dragHud.value = null
  wallGuide.hide()
  controls.enabled = false
  controls.autoRotate = false
  if (!bp) {
    bp = new BlueprintView(stage.renderer, canvas.value!)
    bp.resize(viewSize.w, viewSize.h)
    // 开发时的调试入口（截图脚本导出 PNG 用）
    if (import.meta.env.DEV) (window as unknown as { __myhomeBlueprint?: BlueprintView }).__myhomeBlueprint = bp
  }
  bp.enter(bpInput(), bpOptions())
}
function exitBlueprint() {
  if (!stage || !bp) return
  bp.exit()
  controls.enabled = true
  controls.autoRotate = !editing.value && sandbox.autoRotate
  applySheetOffset()
  dirty = true
}
watch(
  () => blueprint.on,
  (on) => (on ? enterBlueprint() : exitBlueprint()),
)
watch(
  () => [blueprint.paper, blueprint.furniture, blueprint.walls, blueprint.ortho, blueprint.unit, blueprint.layout, plan.value.region, lang.value],
  () => bp?.setOptions(bpOptions()),
)
// 设计图开着时改了户型（撤销 / 重做）：稍等沙盘那边同步完再重算
let bpTimer = 0
watch(planVer, () => {
  if (!bp?.active) return
  clearTimeout(bpTimer)
  bpTimer = window.setTimeout(() => bp?.active && bp.update(bpInput()), 120)
})
/** 导出设计图 PNG（3 倍分辨率，按当前视角和纸面），文件名带户型名和「设计图」 */
async function exportBlueprint() {
  if (!bp || bpBusy.value) return
  bpBusy.value = true
  try {
    const name = plan.value.name || 'home'
    const d = new Date()
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const blob = await bp.exportPNG(3, `${name}  ·  ${t('设计图')}  ·  ${date}`)
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}-${t('设计图')}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  } finally {
    bpBusy.value = false
  }
}
const bpBg = computed(() => (blueprint.paper === 'blue' ? '#1d4a72' : '#fbfbf9'))

defineExpose({ resetView })
</script>

<template>
  <div class="sandbox">
    <div ref="host" class="viewport" :class="{ placing: !!placing, hover: hovering, night: nightUi && !blueprint.on, blueprint: blueprint.on }" :style="{ background: blueprint.on ? bpBg : viewportBg, '--sheet-h': (blueprint.on ? 0 : layout.sheetH) + 'px' }">
      <!-- 竖排楼层切换（多层户型；单层时只有「加一层」） -->
      <FloorRail v-if="!blueprint.on && !walking" />
      <div v-if="!blueprint.on" class="compass" :class="{ 'under-bar': !editing }" :title="t('北') + ' · ' + t('户型朝向 {n}°', { n: northDeg })">
        <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true">
          <circle r="18" class="compass-bg" />
          <g :transform="`rotate(${compassAngle})`">
            <path d="M0 -14 L5 2 L0 -1 L-5 2 Z" class="compass-n" />
            <path d="M0 14 L5 2 L0 -1 L-5 2 Z" class="compass-s" />
            <text y="-15.5" text-anchor="middle" class="compass-t">N</text>
          </g>
        </svg>
      </div>
      <div v-show="!walking" class="modes">
        <button :class="{ on: editing && !blueprint.on }" :title="t('布置') + ' (P)'" @click="leaveBlueprint('edit')"><JIcon :icon="ICONS.modeEdit" />{{ t('布置') }}</button>
        <button :class="{ on: !editing && !blueprint.on }" :title="t('预览') + ' (P)'" @click="leaveBlueprint('preview')"><JIcon :icon="ICONS.modePreview" />{{ t('预览') }}</button>
        <button class="bp-toggle" :class="{ on: blueprint.on }" :aria-pressed="blueprint.on" :title="t('设计图：线框、尺寸标注，可导出 PNG') + ' (B)'" :aria-label="t('设计图')" @click="blueprint.on = !blueprint.on"><JIcon :icon="ICONS.blueprint" /><span class="ml">{{ t('设计图') }}</span></button>
        <button v-if="!blueprint.on" class="walk-toggle" :title="t('漫游：第一人称在房间里走动') + ' (V)'" :aria-label="t('漫游')" @click="enterWalk"><JIcon :icon="ICONS.walk" /><span class="ml">{{ t('漫游') }}</span></button>
      </div>
      <BlueprintBar v-if="blueprint.on" :busy="bpBusy" @reset="bp?.resetView()" @export="exportBlueprint" />
      <div v-if="!editing && !blueprint.on && !walking" class="preview-bar">
        <label><input v-model="sandbox.autoRotate" type="checkbox" /><JIcon :icon="ICONS.autoRotate" class="ico-muted" />{{ t('自动旋转') }}</label>
        <select v-model="sandbox.wallMode" :title="t('墙体显示') + ' (C)'">
          <option v-for="m in WALL_MODES" :key="m.id" :value="m.id">{{ t(m.label) }}</option>
        </select>
        <label class="pb-time" :title="t('时刻')">
          <JIcon :icon="ICONS.timeOfDay" class="ico-muted" />
          <input v-model.number="sandbox.time" type="range" min="0" max="24" step="0.05" :aria-label="t('时刻')" @input="sandbox.timeSet = true" />
          <span class="clock">{{ clock }}</span>
        </label>
        <button class="icon-only" :class="{ on: sandbox.playing }" :title="sandbox.playing ? t('暂停') : t('播放时间流逝')" :aria-label="sandbox.playing ? t('暂停') : t('播放时间流逝')" @click="togglePlay">
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
        @pointerleave="onPointerLeave"
        @contextmenu.prevent
      />
      <SandboxOverlay v-if="!blueprint.on && !walking" />
      <!-- 漫游：盖在画布上接管指针（不选中、不拖家具），左下是触屏摇杆 -->
      <div v-if="walking" ref="walkLayer" class="walk-layer" :class="{ locked: walkLocked }">
        <div v-if="!walkLocked" class="walk-hud">
          <span v-if="!device.coarse" class="walk-tip">{{ t('点击画面开始：鼠标看四周 · WASD 移动 · Shift 跑 · Esc 释放鼠标') }}</span>
          <span v-else class="walk-tip">{{ t('左下拖动走路 · 其余地方拖动看四周') }}</span>
          <button class="primary" @pointerdown.stop @click="exitWalk"><JIcon :icon="ICONS.close" :size="14" />{{ t('退出漫游') }}</button>
        </div>
        <span v-if="walkLocked || device.coarse" class="walk-cross" aria-hidden="true" />
        <span v-if="(walkLocked || device.coarse) && walkTarget" class="walk-target">{{ walkTarget }}</span>
        <div class="walk-mini">
          <canvas ref="walkMap" :style="{ width: MINI_SIZE + 'px', height: MINI_SIZE + 'px' }" />
          <span v-if="walkRoom" class="walk-room">{{ walkRoom }}</span>
        </div>
        <div v-if="walkStick" class="walk-stick" :style="{ left: walkStick.x + 'px', top: walkStick.y + 'px' }">
          <span class="walk-knob" :style="{ transform: `translate(${walkStick.dx}px, ${walkStick.dy}px)` }" />
        </div>
      </div>
      <!-- 点中天花板灯具：这个房间的灯光开关与色温 -->
      <div v-if="selectedRoom && editing" class="light-card" :style="{ bottom: device.compact && !device.landscape ? 'calc(var(--sheet-h, 0px) + 10px)' : undefined }">
        <div class="lc-head">
          <JIcon :icon="ICONS.indoorLight" class="ico-muted" />
          <b>{{ roomName(selectedRoom.name) }}</b>
          <button class="icon-only lc-close" :title="t('关闭')" :aria-label="t('关闭')" @click="selection = null"><JIcon :icon="ICONS.close" :size="14" /></button>
        </div>
        <div class="seg seg-text" role="radiogroup" :aria-label="t('灯')">
          <button v-for="m in LIGHT_MODES" :key="m" role="radio" :aria-checked="(selectedRoom.light ?? 'auto') === m" :class="{ on: (selectedRoom.light ?? 'auto') === m }" @click="setRoomLight(selectedRoom.id, m)">{{ t(LIGHT_LABELS[m]) }}</button>
        </div>
        <label class="lc-row">
          <span>{{ t('色温') }}</span>
          <select class="sel-style num" :value="selectedRoom.lightK ?? ''" @change="setRoomK(selectedRoom.id, ($event.target as HTMLSelectElement).value)">
            <option value="">{{ t('跟随全局（{k} K）', { k: sandbox.lightK }) }}</option>
            <option v-for="k in ROOM_K_PRESETS" :key="k" :value="k">{{ k }} K</option>
          </select>
        </label>
      </div>
      <!-- 选中有柜门 / 抽屉的柜子：柜体半透明可以看到里面；柜门开关 -->
      <div v-if="selectedOpenable && selectedDef && editing" class="light-card" :style="{ bottom: device.compact && !device.landscape ? 'calc(var(--sheet-h, 0px) + 10px)' : undefined }">
        <div class="lc-head">
          <JIcon :icon="ICONS.builtin" class="ico-muted" />
          <b>{{ displayName(selectedDef) }}</b>
          <button class="icon-only lc-close" :title="t('关闭')" :aria-label="t('关闭')" @click="selection = null"><JIcon :icon="ICONS.close" :size="14" /></button>
        </div>
        <div class="lc-row">
          <span>{{ t('柜门') }}</span>
          <div class="seg seg-text" role="radiogroup" :aria-label="t('柜门')">
            <button role="radio" :aria-checked="!!selectedOpenable.open" :class="{ on: !!selectedOpenable.open }" @click="setFurnitureOpen(selectedOpenable.id, true)">{{ t('打开') }}</button>
            <button role="radio" :aria-checked="!selectedOpenable.open" :class="{ on: !selectedOpenable.open }" @click="setFurnitureOpen(selectedOpenable.id, false)">{{ t('关上') }}</button>
          </div>
        </div>
        <p class="lc-hint">{{ t('再点一次里面的东西可以选中它') }}</p>
      </div>
      <!-- 点中的外观对象（车、围挡、屋顶、外墙）：旁边浮出编辑卡片；手机上停在底部抽屉上方 -->
      <div
        v-if="siteSel && editing && !walking"
        ref="siteCard"
        class="light-card site-card"
        :class="{ anchored: siteCardAnchored }"
        role="dialog"
        :aria-label="siteSelTitle"
        :style="{ bottom: device.compact && !device.landscape ? 'calc(var(--sheet-h, 0px) + 10px)' : undefined }"
        @pointerdown.stop
        @wheel.stop
      >
        <div class="lc-head">
          <JIcon :icon="siteIcon(siteSel)" class="ico-muted" />
          <b>{{ siteSelTitle }}</b>
          <button class="icon-only lc-close" :title="t('关闭') + ' (Esc)'" :aria-label="t('关闭')" @click="siteSel = null"><JIcon :icon="ICONS.close" :size="14" /></button>
        </div>
        <SiteEditor :key="siteSel" :target="siteSel" variant="card" />
      </div>
      <!-- 点中的门窗：款式、尺寸、开向的编辑卡片（和平面图检查器改的是同一个洞口）；手机上停在底部抽屉上方 -->
      <div
        v-if="selectedOpening && editing && !walking && !blueprint.on"
        ref="openingCard"
        class="light-card site-card opening-card"
        :class="{ anchored: siteCardAnchored }"
        role="dialog"
        :aria-label="openingTitle"
        :style="{ bottom: device.compact && !device.landscape ? 'calc(var(--sheet-h, 0px) + 10px)' : undefined }"
        @pointerdown.stop
        @wheel.stop
      >
        <div class="lc-head">
          <JIcon :icon="selectedOpening.kind === 'window' ? TOOL_ICONS.window : TOOL_ICONS.door" class="ico-muted" />
          <b>{{ openingTitle }}</b>
          <button class="icon-only lc-close" :title="t('关闭') + ' (Esc)'" :aria-label="t('关闭')" @click="selection = null"><JIcon :icon="ICONS.close" :size="14" /></button>
        </div>
        <OpeningEditor :key="selectedOpening.id" :opening="selectedOpening" />
      </div>
      <!-- 点中的设备：和平面图检查器同一套属性（FixtureEditor），紧凑排版；手机上停在底部抽屉上方 -->
      <div
        v-if="selectedFixture && editing && !walking && !blueprint.on"
        ref="fixtureCard"
        class="light-card site-card opening-card"
        :class="{ anchored: siteCardAnchored }"
        role="dialog"
        :aria-label="fixtureTitle"
        :style="{ bottom: device.compact && !device.landscape ? 'calc(var(--sheet-h, 0px) + 10px)' : undefined }"
        @pointerdown.stop
        @wheel.stop
      >
        <div class="lc-head">
          <JIcon :icon="FIXTURE_ICONS[selectedFixture.kind]" class="ico-muted" />
          <b>{{ fixtureTitle }}</b>
          <button class="icon-only lc-close" :title="t('关闭') + ' (Esc)'" :aria-label="t('关闭')" @click="selection = null"><JIcon :icon="ICONS.close" :size="14" /></button>
        </div>
        <FixtureEditor :key="selectedFixture.id" :fixture="selectedFixture" variant="card" />
      </div>
      <div v-if="!plan.rooms.length" class="empty">{{ t('还没有房间。先去 2D 平面图画一个，或者点「随机生成」。') }}</div>
      <div v-if="!device.compact" class="hud">
        <template v-if="blueprint.on">{{ device.coarse ? t('设计图 · 单指旋转 · 双指缩放 / 平移') : t('设计图 · 左键旋转 · 右键平移 · 滚轮缩放 · F 重置视角 · B 或 Esc 返回') }}</template>
        <template v-else-if="placing && !device.coarse">
          <b>{{ t('摆放 {name}', { name: placingName }) }}</b> · {{ t('点击地面放下（自动贴墙对齐，Alt 关闭）· Q / E 旋转 90°（Shift 15°）· 按住 Shift 连续摆放 · Esc 取消') }}
        </template>
        <template v-else-if="!placing">{{ hudText }}</template>
      </div>
      <!-- 触屏摆放：提示 + 旋转 / 取消按钮 -->
      <div v-if="placing && device.coarse" class="place-pill" :style="{ bottom: device.compact && !device.landscape ? 'calc(var(--sheet-h, 0px) + 10px)' : undefined }">
        <span class="pp-text"><b>{{ t('摆放 {name}', { name: placingName }) }}</b><span>{{ t('按住地面拖到合适位置，松手放下') }}</span></span>
        <button class="icon-only" :title="t('顺时针旋转 90°')" :aria-label="t('顺时针旋转 90°')" @click="ghostRot = (ghostRot + 90) % 360"><JIcon :icon="ICONS.rotateCw" /></button>
        <button @click="placing = null"><JIcon :icon="ICONS.close" />{{ t('取消') }}</button>
      </div>
      <!-- 拖动 / 旋转家具时跟着指针的提示：角度、离墙距离、吸附 -->
      <div v-if="dragHud" class="drag-hud" :class="{ touch: dragHud.touch }" :style="{ left: dragHud.x + 'px', top: dragHud.y + 'px' }">
        <span class="num">{{ dragHud.rot }}°</span>
        <span v-if="dragHud.wall !== null" class="num">{{ t('离墙 {n} cm', { n: dragHud.wall }) }}</span>
        <span v-if="!dragHud.touch" class="dh-hint">{{ dragHud.snap ? t('按住 Alt 关闭吸附') : t('吸附已关闭') }}</span>
      </div>
    </div>

    <!-- 从家具栏拖出来时跟着指针的缩略图 -->
    <img v-if="cardGhost && cardGhost.src" class="card-ghost" :src="cardGhost.src" alt="" :style="{ left: cardGhost.x + 'px', top: cardGhost.y + 'px' }" />

    <BottomSheet v-if="editing && !blueprint.on" v-model="sheet" :enabled="device.compact" class="panel" :label="t('沙盘面板')">
      <template #header>
        <nav class="ptabs" :class="{ many: tabs.length > 4 }" role="tablist" :aria-label="t('沙盘面板')">
          <button v-for="tb in tabs" :key="tb.id" role="tab" :title="tb.label" :aria-selected="tab === tb.id" :class="{ on: tab === tb.id, 'tab-sel': tb.id === 'sel' }" @click="pickTab(tb.id)">
            <JIcon :icon="tb.icon" :size="15" /><span>{{ tb.label }}</span>
          </button>
        </nav>
      </template>
      <template v-if="tab === 'scene'">
      <section>
        <h3 class="ico-label"><JIcon :icon="VIEW_ICONS['3d']" class="ico-muted" />{{ t('沙盘') }}</h3>
        <div class="meta num">{{ planSize }} · {{ t('家具 {n} 件', { n: counts }) }}</div>
        <!-- 楼层：切换当前层（摆放、拖动、墙体压低都作用于它）、显示方式（全部楼层 / 只到当前层 / 分层拉开 / 外观） -->
        <FloorBar variant="panel" class="floors" />
        <label class="row">
          <span>{{ t('墙高') }}</span>
          <input v-model.number="sandbox.wallHeight" type="range" min="40" max="240" step="10" />
          <span class="num val">{{ sandbox.wallHeight }}</span>
        </label>
        <label class="row" :title="t('小：画面平、接近等距视图；大：近大远小更明显')">
          <span>{{ t('透视') }}</span>
          <input v-model.number="sandbox.fov" type="range" :min="FOV_MIN" :max="FOV_MAX" step="1" />
          <span class="num val">{{ sandbox.fov }}°</span>
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
            <input v-model.number="sandbox.time" type="range" min="0" max="24" step="0.05" class="sky-time" :aria-label="t('时刻')" :title="t('时刻')" @input="sandbox.timeSet = true" />
            <span class="clock">{{ clock }}</span>
            <button class="sky-play icon-only" :class="{ on: sandbox.playing }" :title="sandbox.playing ? t('暂停') : t('播放时间流逝')" :aria-label="sandbox.playing ? t('暂停') : t('播放时间流逝')" @click="togglePlay">
              <JIcon :icon="sandbox.playing ? ICONS.pause : ICONS.play" :size="14" />
            </button>
          </div>
          <div class="sky-row">
            <JIcon :icon="ICONS.date" class="ico-muted" />
            <select v-model.number="sandbox.month" class="sel-style" :aria-label="t('月份')" @change="sandbox.timeSet = true">
              <option v-for="(m, i) in monthNames" :key="i" :value="i + 1">{{ m }}</option>
            </select>
            <select v-model.number="sandbox.day" class="sel-style num" :aria-label="t('日')" @change="sandbox.timeSet = true">
              <option v-for="d in dayCount" :key="d" :value="d">{{ d }}</option>
            </select>
            <select v-model.number="sandbox.speed" class="sel-style num" :title="t('播放速度')" :aria-label="t('播放速度')">
              <option v-for="v in SPEEDS" :key="v" :value="v">{{ t('{n} 小时/秒', { n: v }) }}</option>
            </select>
          </div>
          <!-- 时间默认跟随设备当前时间；手动改过之后可以一键回到现在 -->
          <div class="sky-row now-row">
            <span v-if="!sandbox.timeSet" class="now-tag">{{ t('跟随当前时间') }}</span>
            <button v-else class="mini" :title="t('时刻和日期重新跟随设备的当前时间')" @click="syncSkyToNow"><JIcon :icon="ICONS.timeOfDay" :size="14" />{{ t('回到现在') }}</button>
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
        <!-- 室内灯光：全局开关 + 色温；单个房间 / 灯具在 3D 里点选后单独设置 -->
        <div class="row">
          <span class="ico-label"><JIcon :icon="ICONS.indoorLight" class="ico-muted" />{{ t('室内灯光') }}</span>
          <div class="seg seg-text" role="radiogroup" :aria-label="t('室内灯光')">
            <button v-for="m in LIGHT_MODES" :key="m" role="radio" :aria-checked="sandbox.lightMode === m" :class="{ on: sandbox.lightMode === m }" @click="sandbox.lightMode = m">{{ t(LIGHT_LABELS[m]) }}</button>
          </div>
        </div>
        <label class="row" :title="t('灯光色温：数值低偏暖黄，高偏冷白')">
          <span>{{ t('色温') }}</span>
          <input v-model.number="sandbox.lightK" type="range" :min="KELVIN_MIN" :max="KELVIN_MAX" step="100" :aria-label="t('色温')" />
          <span class="num val kval">{{ sandbox.lightK }} K</span>
        </label>
        <label class="row">
          <span>{{ t('亮度') }}</span>
          <input v-model.number="sandbox.lightPower" type="range" :min="POWER_MIN" :max="POWER_MAX" step="5" :aria-label="t('亮度')" />
          <span class="num val kval">{{ sandbox.lightPower }}%</span>
        </label>
        <p class="q-note">{{ sandbox.lightMode === 'auto' ? t('自动：日落前后渐亮，清晨渐灭。点选天花板的灯或灯具可以单独开关') : t('点选天花板的灯或灯具可以单独开关；单独设过的不受这里影响') }}</p>
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
        <label class="row check"><input v-model="sandbox.snap" type="checkbox" /><JIcon :icon="ICONS.snap" class="ico-muted" />{{ t('贴墙 / 对齐吸附') }} <span v-if="!device.coarse" class="hint">{{ t('按住 Alt 临时关闭') }}</span></label>
        <div class="row">
          <span>{{ t('画质') }}</span>
          <div class="seg seg-text" role="radiogroup" :aria-label="t('画质')">
            <button v-for="q in QUALITIES" :key="q.id" role="radio" :aria-checked="gfx.quality === q.id" :class="{ on: gfx.quality === q.id }" @click="setQuality(q.id)">{{ t(q.label) }}</button>
          </div>
        </div>
        <p v-if="gfx.quality === 'auto'" class="q-note">{{ lowPower() ? t('已按设备自动切到省电画质') : t('已按设备自动使用高画质') }}</p>
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
      </template>

      <template v-else-if="tab === 'home'">
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
          <div v-if="memberRoomLabel(m.id)" class="m-room"><JIcon :icon="ICONS.household" :size="12" class="ico-muted" />{{ memberRoomLabel(m.id) }}</div>
          <div class="chips">
            <span v-for="tr in m.traits" :key="tr" class="chip trait">{{ t(TRAITS[tr].label) }}</span>
            <span v-for="i in m.interests" :key="i" class="chip" :title="t(LV_LABELS[levelOf(m, i) || 1])">{{ t(INTERESTS[i].label) }} <span class="num">Lv.{{ levelOf(m, i) || 1 }}</span></span>
            <span class="chip style">{{ t(STYLE_LABELS[m.style]) }}</span>
          </div>
        </div>
      </section>
      <!-- 检查清单 -->
      <section class="cl">
        <div class="hh-head">
          <h3 class="ico-label"><JIcon :icon="ICONS.checklist" class="ico-muted" />{{ t('检查清单') }}</h3>
          <span class="tag num" :class="{ bad: missingItems.length }">{{ missingItems.length ? t('缺 {n} 项', { n: missingItems.length }) : t('齐全') }}</span>
          <span class="spacer" />
          <button class="mini icon-only" :title="clOpen ? t('收起') : t('展开')" :aria-label="clOpen ? t('收起') : t('展开')" :aria-expanded="clOpen" @click="clOpen = !clOpen"><JIcon :icon="clOpen ? ICONS.collapse : ICONS.expand" :size="14" /></button>
          <button class="mini primary" :disabled="!missingItems.some((i) => i.fix)" @click="fixChecklist(missingItems)"><JIcon :icon="ICONS.checkFixAll" :size="14" />{{ t('一键补齐') }}</button>
        </div>
        <template v-if="clOpen">
          <div v-for="[key, label, items] in checkGroups" :key="key" class="cl-room">
            <div class="cl-name">{{ label }}</div>
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
      </template>

      <template v-else-if="tab === 'decor'">
      <section class="wp">
        <div class="hh-head">
          <h3 class="ico-label"><JIcon :icon="ICONS.wallpaper" class="ico-muted" />{{ t('墙纸') }}</h3>
          <span class="spacer" />
          <button class="mini" :title="t('按住户风格重新随机全屋墙纸')" @click="rerollWallpapers"><JIcon :icon="ICONS.wallpaperRandom" :size="14" />{{ t('全屋随机') }}</button>
        </div>
        <div class="row">
          <select v-model="wpRoomId" class="sel-style">
            <option v-for="r in paperRooms" :key="r.id" :value="r.id">{{ paperRoomLabel(r) }}</option>
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
      </template>

      <template v-else-if="tab === 'ext'">
      <!-- 外观一览：屋顶、外墙、围挡、各车位；点开一项就地编辑（和 3D 里点中对象浮出的卡片是同一个编辑器） -->
      <section class="ext-list">
        <div v-for="tg in extTargets" :key="tg" class="ext-item" :class="{ open: extOpen === tg }">
          <button class="ext-row" :aria-expanded="extOpen === tg" @click="extOpen = extOpen === tg ? null : tg">
            <JIcon :icon="siteIcon(tg)" class="ico-muted" />
            <span class="ext-name">{{ extTitle(tg) }}</span>
            <span class="ext-cur">{{ extCurrent(tg) }}</span>
            <JIcon :icon="ICONS.expand" :size="14" class="ext-chev" />
          </button>
          <SiteEditor v-if="extOpen === tg" :target="tg" class="ext-body" />
        </div>
      </section>
      <p class="q-note ext-note">{{ t('布置模式下在 3D 里点车、围挡（外观视图里还有屋顶、外墙），会在旁边弹出编辑卡片') }}</p>
      </template>

      <section v-else-if="tab === 'sel' && selectedFurniture && selectedDef" class="sel">
        <h3>{{ displayName(selectedDef) }}</h3>
        <div class="meta num">
          {{ selectedDef.w }} × {{ selectedDef.d }} × {{ selectedDef.h }} cm · {{ Math.round(turnAngle(selectedFurniture)) }}°<template v-if="selectedFurniture.z"> · {{ t('离地 {n} cm', { n: selectedFurniture.z }) }}</template>
        </div>
        <div v-if="lampSelected" class="row">
          <span class="ico-label"><JIcon :icon="ICONS.indoorLight" class="ico-muted" />{{ t('灯') }}</span>
          <div class="seg seg-text" role="radiogroup" :aria-label="t('灯')">
            <button role="radio" :aria-checked="!selectedFurniture.light" :class="{ on: !selectedFurniture.light }" :title="t('跟随房间的灯')" @click="setFurnitureLight(selectedFurniture.id, undefined)">{{ t('自动') }}</button>
            <button role="radio" :aria-checked="selectedFurniture.light === 'on'" :class="{ on: selectedFurniture.light === 'on' }" @click="setFurnitureLight(selectedFurniture.id, 'on')">{{ t('开') }}</button>
            <button role="radio" :aria-checked="selectedFurniture.light === 'off'" :class="{ on: selectedFurniture.light === 'off' }" @click="setFurnitureLight(selectedFurniture.id, 'off')">{{ t('关') }}</button>
          </div>
        </div>
        <div v-if="selectedDef.openable" class="row">
          <span class="ico-label"><JIcon :icon="ICONS.builtin" class="ico-muted" />{{ t('柜门') }}</span>
          <div class="seg seg-text" role="radiogroup" :aria-label="t('柜门')">
            <button role="radio" :aria-checked="!!selectedFurniture.open" :class="{ on: !!selectedFurniture.open }" @click="setFurnitureOpen(selectedFurniture.id, true)">{{ t('打开') }}</button>
            <button role="radio" :aria-checked="!selectedFurniture.open" :class="{ on: !selectedFurniture.open }" @click="setFurnitureOpen(selectedFurniture.id, false)">{{ t('关上') }}</button>
          </div>
        </div>
        <div v-if="selectedSizes.length > 1" class="sizes">
          <button v-for="sz in selectedSizes" :key="sz.id" :class="{ on: sz.id === selectedDef.id }" :title="sz.w + '×' + sz.d + '×' + sz.h" @click="swapSize(sz.id)">{{ variantLabel(sz) }}</button>
        </div>
        <div v-if="selectedArtKind" class="row art-row">
          <span class="ico-label"><JIcon :icon="ICONS.artwork" class="ico-muted" />{{ t('画面') }}</span>
          <div class="art-pick">
            <button :title="t('上一种画')" :aria-label="t('上一种画')" @click="stepArt(-1)"><JIcon :icon="ICONS.prevItem" /></button>
            <span class="art-name">{{ selectedFurniture.art ? t(artLabel(selectedFurniture.art) ?? '') : t('原画') }}</span>
            <button :title="t('下一种画')" :aria-label="t('下一种画')" @click="stepArt(1)"><JIcon :icon="ICONS.nextItem" /></button>
            <button :title="t('同一种画换一版')" :aria-label="t('同一种画换一版')" @click="rerollSelectedArt"><JIcon :icon="ICONS.random" /></button>
            <button v-if="selectedFurniture.art" :title="t('恢复原画')" :aria-label="t('恢复原画')" @click="setFurnitureArt(selectedFurniture.id, undefined)"><JIcon :icon="ICONS.reset" /></button>
          </div>
        </div>
        <ColorEditor
          :def="selectedDef"
          :color="normalizeColor(selectedDef, selectedFurniture.color ?? 0)"
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
            :value="Math.round(turnAngle(selectedFurniture))"
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
            :value="Math.round(turnAngle(selectedFurniture))"
            :aria-label="t('角度')"
            @change="rotateSelectedFurniture(Number(($event.target as HTMLInputElement).value) - selectedFurniture!.rot)"
          /><span class="rot-unit">°</span>
        </div>
        <p class="rot-hint">{{ device.coarse ? t('在画布上用两根手指拧转也能旋转') : t('按住 R 拖动鼠标自由旋转，按住 Shift 每 15° 吸附') }}</p>
        <div class="btns">
          <button class="rot" :title="t('逆时针旋转 90°')" :aria-label="t('逆时针旋转 90°')" @click="rotateSelectedFurniture(-90)"><JIcon :icon="ICONS.rotateCcw" /><span class="num">90°</span></button>
          <button class="rot" :title="t('顺时针旋转 90°')" :aria-label="t('顺时针旋转 90°')" @click="rotateSelectedFurniture(90)"><JIcon :icon="ICONS.rotateCw" /><span class="num">90°</span></button>
          <button @click="duplicateSelection"><JIcon :icon="ICONS.duplicate" />{{ t('复制') }}</button>
          <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }}</button>
        </div>
      </section>

      <section v-show="tab === 'lib'" class="lib">
        <label class="search-box">
          <JIcon :icon="ICONS.search" :size="14" class="ico-muted" />
          <input v-model="libFilter.query" class="search" :placeholder="t('搜索…')" :aria-label="t('搜索…')" />
        </label>
        <div class="cats">
          <button :class="{ on: libFilter.group === 'all' }" @click="libFilter.group = 'all'"><JIcon :icon="ICONS.allCategories" :size="14" />{{ t('全部') }}</button>
          <button v-for="g in libGroups" :key="g" :class="{ on: libFilter.group === g }" @click="libFilter.group = g"><JIcon :icon="GROUP_ICONS[g]" :size="14" />{{ t(GROUP_NAMES[g][0]) }}</button>
        </div>
        <div class="filter-row">
          <select v-if="libTypes.length > 1" v-model="libFilter.type">
            <option value="all">{{ t('全部类型') }}</option>
            <option v-for="x in libTypes" :key="x.type" :value="x.type">{{ t(typeLabel(x.type)) }}（{{ x.n }}）</option>
          </select>
          <select v-model="libFilter.room">
            <option value="all">{{ t('全部房间') }}</option>
            <option v-for="r in LIB_ROOMS" :key="r" :value="r">{{ t(ROOM_NAMES_LIB[r][0]) }}</option>
          </select>
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
            v-for="g in shownPlaceable"
            :key="g.rep.id"
            v-memo="[g, thumbs[g.rep.id + '#' + thumbColor(g.rep.id)], placing?.asset === g.rep.id, lang]"
            v-thumb="[g.rep.id, thumbColor(g.rep.id)]"
            class="item"
            :class="{ on: placing?.asset === g.rep.id }"
            :title="displayName(g.rep) + '  ' + g.rep.w + '×' + g.rep.d + '×' + g.rep.h + 'cm' + (g.sizes > 1 ? t('（共 {n} 种规格，放下后可切换）', { n: g.sizes }) : '')"
            @click="onCardClick(g.rep.id)"
            @pointerdown="onCardDown($event, g.rep.id)"
            @contextmenu.prevent
            @dragstart.prevent
          >
            <img v-if="thumbs[g.rep.id + '#' + thumbColor(g.rep.id)]" :src="thumbs[g.rep.id + '#' + thumbColor(g.rep.id)]" alt="" />
            <span v-else class="ph" />
            <span class="name">{{ cardName(g.rep) }}</span>
            <span v-if="g.sizes > 1" class="multi num">{{ g.sizes }}</span>
          </button>
          <div v-if="!placeable.length" class="none">{{ t('没有匹配的家具') }}</div>
          <div v-if="morePlaceable" v-sentinel class="sentinel" aria-hidden="true" />
        </div>
      </section>
    </BottomSheet>
  </div>
</template>

<style scoped>
.light-card {
  position: absolute;
  right: 12px;
  bottom: 44px;
  z-index: 6;
  width: 272px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  font-size: var(--fs-sm);
}
.light-card .seg {
  margin: 0;
}
.lc-row .seg {
  flex: 1;
}
.lc-hint {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-faint);
}
.lc-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lc-head b {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-close {
  padding: 2px;
}
.lc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lc-row select {
  flex: 1;
  min-width: 0;
}
.kval {
  min-width: 4.2em;
  text-align: right;
}
:root.compact .light-card {
  left: 12px;
  right: 12px;
  width: auto;
}
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
.walk-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  touch-action: none;
  cursor: grab;
}
.walk-layer:active {
  cursor: grabbing;
}
:root.coarse .walk-layer,
.walk-layer:not(.locked) {
  cursor: pointer;
}
.walk-target {
  position: absolute;
  left: 50%;
  top: calc(50% + 16px);
  transform: translateX(-50%);
  max-width: 60%;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(30, 28, 25, 0.62);
  color: #fff;
  font-size: var(--fs-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.walk-mini {
  position: absolute;
  right: 16px;
  bottom: calc(var(--sheet-h, 0px) + 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.walk-mini canvas {
  display: block;
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
}
.walk-room {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(30, 28, 25, 0.62);
  color: #fff;
  font-size: var(--fs-xs);
  white-space: nowrap;
}
:root.compact .walk-mini canvas {
  width: 120px !important;
  height: 120px !important;
}
.walk-cross {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.walk-hud {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 32px);
  padding: 4px 4px 4px 12px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  cursor: default;
}
.walk-tip {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.walk-hud button {
  flex: none;
  gap: 4px;
  height: 30px;
}
.walk-stick {
  position: absolute;
  width: 112px;
  height: 112px;
  margin: -56px 0 0 -56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.28);
  border: 2px solid rgba(255, 255, 255, 0.7);
  pointer-events: none;
}
.walk-knob {
  position: absolute;
  left: 36px;
  top: 36px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: var(--shadow-sm);
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
}
/* 标签页：桌面在侧栏顶部，手机在底部抽屉的标题栏 */
.ptabs {
  display: flex;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  overflow-x: auto;
  scrollbar-width: none;
}
.ptabs::-webkit-scrollbar {
  display: none;
}
.ptabs button {
  flex: 1 0 auto;
  gap: 5px;
  height: var(--control-h);
  padding: 0 10px;
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}
/* 选中家具时多出「属性」页，共 5 项：没选中的只留图标（悬停有提示），当前页显示图标 + 文字，一行放得下 */
.ptabs.many button {
  flex: 0 0 auto;
  padding: 0 8px;
}
.ptabs.many button:not(.on) span {
  display: none;
}
.ptabs.many button.on {
  flex: 1 1 auto;
  min-width: 0;
}
.ptabs.many button.on span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ptabs button.on {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
  box-shadow: var(--shadow-sm);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.ptabs button.tab-sel {
  color: var(--accent-strong);
}
.ptabs button.tab-sel.on {
  background: var(--accent-weak);
  border-color: var(--accent-ring);
}
/* 拖动提示：在指针上方，不被手指挡住 */
.drag-hud {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, calc(-100% - 18px));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  font-size: var(--fs-xs);
  white-space: nowrap;
  color: var(--text);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--border);
  border-radius: 99px;
  box-shadow: var(--shadow);
  pointer-events: none;
}
.drag-hud.touch {
  transform: translate(-50%, calc(-100% - 64px));
  font-size: var(--fs-sm);
}
.dh-hint {
  color: var(--text-muted);
}
/* 触屏摆放提示条 */
.place-pill {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  width: min(460px, calc(100% - 20px));
  padding: 4px 4px 4px 14px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
}
.pp-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--fs-xs);
  line-height: 1.35;
  color: var(--text-muted);
}
.pp-text b {
  font-size: var(--fs-sm);
  color: var(--accent-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.place-pill button {
  flex: none;
  height: 44px;
  min-width: 44px;
  border-radius: 10px;
}
/* 从家具栏拖出来的缩略图 */
.card-ghost {
  position: fixed;
  z-index: 90;
  width: 72px;
  height: 72px;
  object-fit: contain;
  transform: translate(-50%, -70%);
  pointer-events: none;
  filter: drop-shadow(0 6px 12px rgba(32, 38, 34, 0.25));
  opacity: 0.92;
}
.sentinel {
  grid-column: 1 / -1;
  height: 1px;
}
.seg-text {
  flex: 1;
  margin: 0;
}
.seg-text button {
  font-size: var(--fs-xs);
}
.q-note {
  margin: -4px 0 10px;
  font-size: var(--fs-xs);
  color: var(--text-faint);
}
section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
/* 楼层切换条（FloorBar）：沙盘标题下 */
.floors {
  margin: 8px 0 12px;
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
/* 画布右上角，上 / 右边距相等（和左上角模式切换的边距一致）；预览模式右上角有工具条，放到它下面 */
.compass {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  pointer-events: auto;
}
.compass.under-bar {
  top: 64px;
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
.art-pick {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.art-pick button {
  flex: none;
  width: var(--control-h-sm);
  height: var(--control-h-sm);
  padding: 0;
  display: grid;
  place-items: center;
}
.art-name {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: var(--fs-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.m-room {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
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
/* 外观页：一览，点开一项就地编辑 */
.ext-list {
  display: flex;
  flex-direction: column;
}
.ext-item {
  border-bottom: 1px solid var(--border);
}
.ext-row {
  width: 100%;
  height: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: 0;
  border-radius: 0;
  background: none;
  font-size: var(--fs-sm);
  text-align: left;
}
.ext-row:hover {
  background: var(--hover);
}
.ext-name {
  font-weight: 600;
}
.ext-cur {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--text-muted);
}
.ext-chev {
  color: var(--text-faint);
  transition: transform 0.15s ease;
}
.ext-item.open .ext-chev {
  transform: rotate(180deg);
}
.ext-body {
  padding: 2px 18px 14px;
}
/* 外观对象的浮动编辑卡片：桌面上跟着对象（位置由 placeSiteCard 设），先藏着等摆好位置 */
.site-card {
  width: 316px;
  max-height: calc(100% - 100px);
  overflow-y: auto;
}
/* 手机：卡片停在底部抽屉上方，最多占画面四成多（上面留出选中的门窗），内容多了在卡片里滚动 */
:root.compact .opening-card {
  max-height: min(42%, calc(100% - var(--sheet-h, 0px) - 70px));
}
.site-card.anchored {
  right: auto;
  bottom: auto;
  left: 0;
  top: 0;
  visibility: hidden;
}
.ext-note {
  padding: 10px 18px 16px;
  margin: 0;
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
.now-row {
  margin-top: -2px;
}
.now-tag {
  font-size: var(--fs-xs);
  color: var(--accent-strong);
  background: var(--accent-weak);
  border-radius: 99px;
  padding: 0 8px;
  line-height: 20px;
}
/* ---------- 手机 / 平板 ---------- */
/* 家具卡片：长按拖动时不要弹出系统的图片菜单 / 选中文字 */
.item {
  -webkit-touch-callout: none;
  user-select: none;
}
:root.coarse .item {
  touch-action: pan-y;
}
:root.coarse .cats button,
:root.coarse .mini,
:root.coarse .trim-btn,
:root.coarse .sizes button {
  height: 36px;
}
:root.coarse .wp-sw {
  width: 32px;
  height: 32px;
}
:root.coarse .wp-pat {
  width: 40px;
  height: 40px;
}
:root.coarse .seg button {
  height: 40px;
}
:root.compact .panel {
  width: auto;
}
:root.compact section {
  padding: 14px 16px;
}
:root.compact .ptabs {
  border-bottom: 0;
  padding: 0 10px 8px;
  background: transparent;
}
:root.compact .ptabs button {
  height: 44px;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  padding: 0 8px;
}
:root.compact .grid {
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
}
/* 横向滚动的分类条，省得分类按钮占好几行 */
:root.compact .cats {
  flex-wrap: nowrap;
  overflow-x: auto;
  margin: 0 -16px 10px;
  padding: 0 16px 2px;
  scrollbar-width: none;
}
:root.compact .cats::-webkit-scrollbar {
  display: none;
}
:root.compact .cats button {
  flex: none;
}
:root.compact .compass {
  top: 10px;
  right: 10px;
}
:root.compact .compass.under-bar {
  top: 60px;
}
:root.compact .modes {
  top: 10px;
  left: 10px;
}
:root.compact .modes button {
  height: 36px;
  padding: 0 12px;
}
/* 手机上模式条放不下四个带字的按钮：设计图、外观只留图标（title / aria-label 照常） */
:root.compact .modes .ml {
  display: none;
}
:root.compact .modes .bp-toggle,
:root.compact .modes .ext-toggle {
  padding: 0 10px;
}
/* 预览模式的工具条：手机上放到底部，横向滚动 */
:root.compact .preview-bar {
  top: auto;
  left: 10px;
  right: 10px;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  overflow-x: auto;
  scrollbar-width: none;
  padding: 6px 8px;
}
:root.compact .preview-bar::-webkit-scrollbar {
  display: none;
}
:root.compact .preview-bar > * {
  flex: none;
}
:root.coarse .preview-bar button,
:root.coarse .preview-bar select {
  height: 40px;
}
</style>
