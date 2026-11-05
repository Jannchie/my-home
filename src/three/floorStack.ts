// 多层户型在 3D 沙盘里的楼层动画：每层的显示 / 隐藏、分层拉开的滑动、整层淡入淡出，以及家具按楼层分组。
//   - 目标由「楼层显示」（全部 / 只到当前层 / 分层拉开）和当前层决定（targets），每帧缓动过去（step）。
//   - 整层淡入淡出要像「一张图层调透明度」：见 fadeFloor。
//   - 着色器预热（prewarm）：第一次切换楼层时不用现编十来个程序。
// 同时是角色层的楼层钩子（FloorHooks：lift / elevOf / shown / fade）；灯光由 Sandbox3D 在 pose 之后对齐。

import * as THREE from 'three'
import type { FloorGroup } from './building'
import type { FloorHooks } from './characters'
import type { FloorShow } from '../store'
import { syncMatrix } from './matrices'
import { cloneWithHooks, isReflector } from './toon'

/** 分层拉开时层与层之间多拉开的距离 */
export const EXPLODE_GAP = 230
/** 楼层淡入淡出的时长（秒） */
const FLOOR_FADE_S = 0.45
/** 只显示到当前层时，上面的层往上滑走的距离（滑完再隐藏） */
export const HIDE_LIFT = 320

/** 一层的动画状态：extra = 叠在 elevation 上的偏移；show = 看得见（隐藏动画结束前仍算）；hideAt = 目标是藏起来；alpha = 淡入淡出的匀速进度 */
interface FloorState {
  extra: number
  target: number
  show: boolean
  hideAt: boolean
  alpha: number
}

export class FloorStack implements FloorHooks {
  private anim = new Map<string, FloorState>()
  /** 各层的 elevation（targets 时记下；户型改了楼层会重搭房子、重新 targets） */
  private elev = new Map<string, number>()
  /** 楼层组（房子重搭时 setGroups） */
  private groups: readonly FloorGroup[] = []
  /** 家具按楼层分组：组的 y = 这一层的 extra（家具模型自己的 y 已经含楼层 elevation） */
  readonly furnLayers = new Map<string, THREE.Group>()
  /** 还在动（下一帧 step 要推进） */
  moving = false
  /**
   * 场景里可能换过材质的事（编辑、墙体让开、楼层动画、重建）发生时加一（bump）；syncFades 每帧调用，
   * 这一层的不透明度和这个计数都没变时不再遍历整层（藏起来的上层每帧遍历要一毫秒多）
   */
  private epoch = 0
  private warmTimer = 0
  private warmTarget: THREE.WebGLRenderTarget | null = null

  constructor(readonly furnRoot: THREE.Group) {}

  /** 某层的家具组（没有就建） */
  furnLayer(id: string) {
    let g = this.furnLayers.get(id)
    if (!g) {
      g = new THREE.Group()
      g.userData.floorId = id
      // 静态矩阵：楼层动画挪它时在 pose 里手动更新
      g.matrixAutoUpdate = false
      this.furnLayers.set(id, g)
      this.furnRoot.add(g)
    }
    return g
  }

  setGroups(groups: readonly FloorGroup[]) {
    this.groups = groups
  }

  /** 楼层本身的 elevation（不含动画偏移） */
  elevOf(id: string) {
    return this.elev.get(id) ?? 0
  }
  /** 楼层地面现在的世界高度（elevation + 动画偏移） */
  lift(id: string) {
    return this.elevOf(id) + this.extra(id)
  }
  /** 某层叠在 elevation 上的动画偏移 */
  extra(id: string) {
    return this.anim.get(id)?.extra ?? 0
  }
  /** 这一层现在看得见吗（隐藏动画结束前仍算看得见） */
  shown(id: string) {
    return this.anim.get(id)?.show ?? true
  }
  /** 这一层正在藏起来 / 已藏起来 */
  hiding(id: string) {
    return !!this.anim.get(id)?.hideAt
  }
  /** 有楼层被「只到当前层」藏起来 */
  anyHidden() {
    for (const s of this.anim.values()) if (s.hideAt) return true
    return false
  }
  /** 某层现在显示的不透明度（匀速推进的进度套 smoothstep） */
  alpha(id: string) {
    const t = this.anim.get(id)?.alpha ?? 1
    return THREE.MathUtils.smoothstep(t, 0, 1)
  }

  /**
   * 按楼层显示方式和当前层算各层的目标。floors 由下到上；单层户型全部为 0。
   * snap：直接到位（重搭房子、进出漫游时）
   */
  targets(floors: readonly { id: string; elevation: number }[], active: string, show: FloorShow, snap = false) {
    const ai = Math.max(0, floors.findIndex((f) => f.id === active))
    const multi = floors.length > 1
    for (const id of this.anim.keys()) if (!floors.some((f) => f.id === id)) this.anim.delete(id)
    this.elev = new Map(floors.map((f) => [f.id, f.elevation]))
    floors.forEach((f, i) => {
      let st = this.anim.get(f.id)
      if (!st) this.anim.set(f.id, (st = { extra: 0, target: 0, show: true, hideAt: false, alpha: 1 }))
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
    this.moving = true
  }

  /** 每帧推进楼层动画；返回这一帧有没有推进（推进了要 pose、重画；moving 变成 false 的那一帧是最后一下） */
  step(dt: number) {
    if (!this.moving) return false
    let busy = false
    const k = 1 - Math.exp(-dt * 6)
    for (const st of this.anim.values()) {
      // 淡入淡出和滑动一起走：藏起来的层边往上滑边变透明，回来时边落下边显现。
      // 透明度按固定时长匀速推进（显示时再套 smoothstep），不用指数缓动——那样头几帧就淡没了，看不清过程
      const at = st.hideAt ? 0 : 1
      if (st.alpha !== at) {
        const s = dt / FLOOR_FADE_S
        st.alpha = at > st.alpha ? Math.min(at, st.alpha + s) : Math.max(at, st.alpha - s)
        busy = true
      }
      const d = st.target - st.extra
      const near = Math.abs(d) < 0.5
      st.extra = near ? st.target : st.extra + d * k
      if (!near || st.alpha !== at) busy = true
      else if (st.hideAt) st.show = false
    }
    this.moving = busy
    return true
  }

  /** 按动画状态摆好各层的房子和家具组（静态矩阵：只在这一层真的挪了时重算它这棵子树） */
  pose() {
    for (const fg of this.groups) {
      fg.group.visible = this.shown(fg.floor.id)
      setY(fg.group, fg.floor.elevation + this.extra(fg.floor.id))
    }
    for (const [id, g] of this.furnLayers) {
      g.visible = this.shown(id)
      setY(g, this.extra(id))
    }
  }

  /** 场景里的材质可能换过了：下一次 syncFades 每层都重新套一遍 */
  bump() {
    this.epoch++
  }

  /** 渲染前统一套用各层的淡入淡出（在墙体让开之后，以楼层淡出为准） */
  syncFades() {
    for (const fg of this.groups) this.fadeCached(fg.group, fg.floor.id)
    for (const [id, g] of this.furnLayers) this.fadeCached(g, id)
  }

  /** 按这一层现在的不透明度套淡入淡出（角色这种不在楼层组里的模型用；不透明度和材质都没变时不再遍历） */
  fade(root: THREE.Object3D, id: string) {
    this.fadeCached(root, id)
  }

  private fadeCached(root: THREE.Object3D, id: string) {
    const alpha = this.alpha(id)
    const ud = root.userData
    // 整层藏起来了（只到当前层时的上层）：画不到，不用管；显示出来时重新套一次
    if (!root.visible) {
      ud.fadeEpoch = -1
      return
    }
    if (ud.fadeAlpha === alpha && ud.fadeEpoch === this.epoch) return
    fadeFloor(root, id, alpha)
    ud.fadeAlpha = alpha
    ud.fadeEpoch = this.epoch
  }

  /**
   * 预热楼层淡入淡出的着色器：透明副本（和深度替身的 depthOnlyMat）是新的着色器变体，被藏起来的楼层的原材质也从没画过，
   * 第一次切换楼层时要同步编译十来个程序（实测卡 2 秒多）。多层户型重搭后空闲时，各层原样编一遍，
   * 再用 fadeFloor 临时翻到另一种状态（显示的层淡出、藏起来的层显示）编一遍，立刻复原；compileAsync 在后台编译（KHR_parallel_shader_compile）。
   * 直接画到屏幕和经后处理画到渲染目标是两种变体，两种都编。主线程约 0.2 秒，所以只在重搭房子时做。
   * 楼层组、家具组之外的模型（角色）由 extra 给；extra 在 400ms 后才取（那时模型都摆好了），返回 null 表示不用预热了（不是多层户型 / 沙盘关了）
   */
  prewarm(target: () => { renderer: THREE.WebGLRenderer; camera: THREE.Camera; scene: THREE.Scene; extra: [THREE.Object3D, string][] } | null) {
    clearTimeout(this.warmTimer)
    this.warmTimer = window.setTimeout(() => {
      const t = target()
      if (!t) return
      const { renderer, camera, scene } = t
      const all: [THREE.Object3D, string][] = [...this.groups.map((fg): [THREE.Object3D, string] => [fg.group, fg.floor.id]), ...[...this.furnLayers].map(([id, g]): [THREE.Object3D, string] => [g, id]), ...t.extra]
      // 正在淡入淡出的层不碰（它的程序本来就在编了）。「只到当前层」藏起来的上层（完全淡出）也要编：
      // 它现在挂的是透明副本，原材质（墙纸花纹、屏幕等）一次都没编过，第一次切上去会现编好几个程序
      const roots = all.filter(([root, id]) => !root.userData.floorFaded || this.alpha(id) <= 0)
      const prev = renderer.getRenderTarget()
      const rt = (this.warmTarget ??= new THREE.WebGLRenderTarget(1, 1))
      const compile = () => {
        for (const to of [null, rt]) {
          renderer.setRenderTarget(to)
          for (const [root] of roots) renderer.compileAsync(root, camera, scene).catch(() => {})
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
        for (const [root, id] of roots) fadeFloor(root, id, this.alpha(id))
      }
    }, 400)
  }

  /** 沙盘关了：停掉预热、释放它的渲染目标 */
  dispose() {
    clearTimeout(this.warmTimer)
    this.warmTarget?.dispose()
    this.warmTarget = null
  }
}

function setY(o: THREE.Object3D, y: number) {
  if (o.position.y === y) return
  o.position.y = y
  syncMatrix(o)
}

/**
 * 整层淡入淡出，效果要像「整层作为一张图层调透明度」：
 * 每个网格各自半透明的话，背面、内墙、家具会互相透出来，乱成一团。所以淡出期间每个网格挂一个只写深度的替身
 * （透明队列里先画，renderOrder 小），再画半透明的颜色（depthFunc ≤）：同一层里只有最前面的表面上色，
 * 后面的被自己层的深度挡掉，整层均匀地透出下层。后处理（夜晚、画面效果）照常作用在一起。
 * 各层共用同一批缓存材质，所以渐变期间换上这一层自己的透明副本，完全不透明后换回。
 * 墙体让开（stepCutaway）也会换材质：渲染前最后统一套用（syncFades），以这里为准。
 * 描边外壳不透明，淡出时藏起来；淡到一半以下不再投影。
 */
const FADE_ORDER = 20
const depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true })
const floorFadeMats = new Map<string, WeakMap<THREE.Material, THREE.Material>>()

export function fadeFloor(root: THREE.Object3D, floorId: string, alpha: number) {
  const faded = alpha < 0.995
  if (!faded && !root.userData.floorFaded) return
  let cache = floorFadeMats.get(floorId)
  if (!cache) floorFadeMats.set(floorId, (cache = new WeakMap()))
  const ghost = (m: THREE.Material) => {
    let g = cache!.get(m)
    if (!g) {
      g = cloneWithHooks(m)
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
    // 镜子上挂的反射面（three/mirrors.ts）不淡出：它的材质带着倒影的渲染目标，克隆不了
    if ((n as THREE.Mesh).isMesh && !n.userData.fadeTwin && !isReflector(n)) meshes.push(n as THREE.Mesh)
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
const unghost = (m: THREE.Material) => (m.userData.floorSource as THREE.Material | undefined) ?? m
function solidOf(m: THREE.Material | THREE.Material[]) {
  return Array.isArray(m) ? m.map(unghost) : unghost(m)
}
const isFloorGhost = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]).some((x) => !!x?.userData?.floorGhost)
