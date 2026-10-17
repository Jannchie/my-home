// 活动角色层：宠物在家里散步、睡觉，扫地机器人出门清扫再回座充电，Kachaka 驮着架子在房间之间送东西。
//
// 和 FxLayer 一样是一个独立的 layer：Sandbox3D 在场景同步后调用 sync()，每帧调用 update(dt)（返回是否需要重绘）。
//   - 布置模式：角色静止在家（窝里睡觉、机器人在座上），不占用每帧渲染；
//     本身就是一件素材的角色（猫、狗、带座的机器人）直接用素材模型展示，这一层不画。
//   - 预览模式：素材里「会跑开的部分」（userData.actorPart 或整件）隐藏，由这一层的角色接管、开始活动。
//     角色的位置只在这一层里，不写回 plan；回到布置模式时一切复原。
//   - 角色不投影（阴影贴图不逐帧重画），脚下垫一块半透明的接触阴影。
//
// 角色来源（见 kit.ts 的 ActorSpec）：
//   body 素材 → 一个角色，从素材所在位置出发；宠物会认领最近的同类窝（猫窝 / 狗窝），困了回窝睡；
//   home 素材（窝、基站）→ 没被认领的窝自己生成一只（花色按 id 随机），基站生成一台扫地机器人。

import * as THREE from 'three'
import type { Furniture, Plan, Vec } from '../model'
import { ASSET_MAP, ASSETS } from './assets'
import type { ActorSpec, AssetDef } from './kit'
import { hasTag } from './tags'
import { effectivePalette } from './colors'
import { HouseNav, NavGrid, type NavClass } from '../nav'
import { floorOf, floorView, isMultiFloor, planFloors } from '../floors'
import { stairHoles, type StairWalk } from '../stairs'
import { placeFurniture } from './house'
import { propsOn } from '../surface'
import {
  BREEDS,
  applyPose,
  buildCreature,
  clonePose,
  emptyMotion,
  finishActorModel,
  kachakaModel,
  lerpPose,
  poseFor,
  vacuumModel,
  type KachakaParts,
  type Motion,
  type Pose,
  type PoseName,
  type Rig,
  type VacuumParts,
} from './critters'
import { DRONES, buildRobo, droneModel, emptyRoboMotion, poseRobo, type DroneParts, type DroneType, type RoboMotion, type RoboRig } from './robots-actors'

type Kind = ActorSpec['kind']

/** 角色在家的位置：x / y 平面坐标，z 离所在楼层地面的高度，h 朝向（rotation.y），fl 所在楼层 */
interface Spot {
  x: number
  y: number
  z: number
  h: number
  fl: string
}

/** 某层上的目标点（跨层的 go 任务、食盆、送东西的地方） */
interface FloorSpot {
  fl: string
  p: Vec
}

interface Desc {
  /** 提供这个角色的家具 id */
  src: string
  kind: Kind
  breed: string
  pal: string[]
  tiers: 0 | 2 | 3
  role: 'body' | 'home'
  /** 认领的窝 */
  bed?: string
}

type Task =
  | { t: 'rest'; pose: PoseName; dur: number; sleep?: boolean; look?: number; lick?: number; wag?: number; face?: number; wave?: number }
  // fl：目标在哪层（不给 = 本层）；不在本层时 step() 先按 HouseNav.route 展开成「走到楼梯口 → 走楼梯 → 走到目标」
  | { t: 'go'; to: Vec; fl?: string; run?: boolean; sniff?: boolean; path?: Vec[] | null; i?: number; stuck?: number; tries?: number; rr?: number }
  // 走一趟楼梯：沿 stairWalk 的路线（up = 往上），s 已走的路程
  | { t: 'stairs'; walk: StairWalk; up: boolean; pts?: { x: number; y: number; z: number }[]; cum?: number[]; s?: number }
  | { t: 'enter'; spot: Spot }
  | { t: 'leave'; to: Vec }
  | { t: 'turn'; h: number }
  | { t: 'clean'; dur: number; wall?: boolean; modeT?: number; turnTo?: number | null }
  | { t: 'wait'; dur: number; charge?: boolean; deliver?: boolean }
  // 无人机：起飞到巡航高度 / 沿空中网格飞 / 悬停 / 回到停机点降落
  | { t: 'lift'; h: number }
  | { t: 'fly'; to: Vec; path?: Vec[] | null; i?: number }
  | { t: 'hover'; dur: number; dir?: number }
  | { t: 'land'; spot: Spot }

const TAU = Math.PI * 2
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
const fwd = (h: number): Vec => ({ x: Math.sin(h), y: Math.cos(h) })

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 找模型里标成 actorPart 的子树 */
function actorPart(obj: THREE.Object3D | undefined): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  obj?.traverse((o) => {
    if (!found && o.userData.actorPart) found = o
  })
  return found
}

/** 活动角色（可视部分 + 行为） */
class Actor {
  root = new THREE.Group()
  rig?: Rig
  vac?: VacuumParts
  kc?: KachakaParts
  cls: NavClass
  r: number
  pos: Vec = { x: 0, y: 0 }
  h = 0
  yW = 0
  speed = 0
  tasks: Task[] = []
  tt = 0
  /** 起点（body 素材的位置 / 窝） */
  start: Spot = { x: 0, y: 0, z: 0, h: 0, fl: '' }
  /** 睡觉的地方（认领的窝，或起点） */
  sleep: Spot = { x: 0, y: 0, z: 0, h: 0, fl: '' }
  /** 进出 sleep 的门口点（在 sleep 那层） */
  door: Vec = { x: 0, y: 0 }
  /** 现在在哪层（走楼梯时是下面那层，yW 相对下层地面） */
  fl = ''
  /** 所在楼层地面的世界高度（ActorLayer.place 每帧算好：含楼层动画；走楼梯时在两层之间插值） */
  baseY = 0
  /** 走楼梯时身体的俯仰（上楼抬头 < 0） */
  pitch = 0
  /** 走楼梯时脚下踏面的目标高度 */
  stairZ = 0
  atHome = true
  acts = 0
  pose?: Pose
  motion: Motion = emptyMotion()
  walkW = 0
  phase = 0
  flickT = rnd(2, 6)
  /** 布置模式下由素材自己展示（这一层不画） */
  hasRep = false
  /** 预览时要藏起来的素材部分 */
  reps: THREE.Object3D[] = []
  /** Kachaka 架子上的东西：相对机器人的矩阵 */
  carry: { id: string; obj: THREE.Object3D; local: THREE.Matrix4; casters: THREE.Mesh[] }[] = []
  modelKey: string
  blink = 0
  /** 无人机 / 机器人（robots-actors.ts） */
  dr?: DroneParts
  robo?: RoboRig
  rm: RoboMotion = emptyRoboMotion()
  shadow: THREE.Mesh
  shadowR = 1
  /** 无人机：水平速度、桨转速 0..1、本次巡航高度 */
  vel: Vec = { x: 0, y: 0 }
  spin = 0
  cruise = 150
  prevH = 0

  constructor(public d: Desc) {
    this.modelKey = `${d.kind}|${d.breed}|${d.pal.join(',')}|${d.tiers}`
    this.cls = d.kind === 'vacuum' || d.kind === 'kachaka' || d.kind === 'robopet' ? 'robot' : 'pet'
    let model: THREE.Object3D
    if (d.kind === 'drone') {
      this.dr = droneModel(d.breed, d.pal)
      model = this.dr.root
      this.r = (DRONES[d.breed as DroneType] ?? DRONES.aerial).r
    } else if (d.kind === 'robopet') {
      this.robo = buildRobo(d.breed, d.pal)
      model = this.robo.root
      this.r = this.robo.breed.r
    } else if (d.kind === 'vacuum') {
      this.vac = vacuumModel(d.pal)
      model = this.vac.root
      this.r = 18
    } else if (d.kind === 'kachaka') {
      this.kc = kachakaModel(d.pal, d.tiers)
      model = this.kc.root
      this.r = d.tiers ? 21 : 16
    } else {
      this.rig = buildCreature(d.breed, d.pal)
      model = this.rig.root
      this.r = this.rig.breed.radius
      this.pose = poseFor(this.rig.breed, 'curl')
    }
    finishActorModel(model)
    this.root.add(model)
    // 走楼梯时先转朝向再俯仰
    this.root.rotation.order = 'YXZ'
    // 接触阴影：一块半透明的暗色椭圆
    const sh = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT)
    if (this.rig) sh.scale.set(this.rig.breed.girth * 1.25, 1, this.rig.breed.len * 0.75)
    else if (this.kc && d.tiers) sh.scale.set(18, 1, 26)
    else if (this.kc) sh.scale.set(13, 1, 20)
    else if (this.dr) sh.scale.set(this.r * 0.55, 1, this.r * 0.55)
    else if (this.robo) sh.scale.set(this.r * 0.75, 1, this.r * (this.robo.breed.type === 'quad' ? 1.2 : 0.75))
    else sh.scale.set(18, 1, 18)
    sh.position.y = 0.35
    sh.renderOrder = 1
    sh.userData.noOutline = true
    this.root.add(sh)
    this.shadow = sh
    this.shadowR = sh.scale.x
  }

  get breed() {
    return this.rig?.breed
  }

  /** 静止在家：布置模式下的样子 */
  placeAtHome() {
    const s = this.sleep
    this.pos = { x: s.x, y: s.y }
    this.h = s.h
    this.yW = s.z
    this.fl = s.fl
    this.pitch = 0
    this.speed = 0
    this.walkW = 0
    this.atHome = true
    if (this.rig) {
      this.pose = poseFor(this.rig.breed, this.rig.breed.kind === 'rabbit' ? 'loaf' : 'curl')
      if (this.rig.breed.kind === 'rabbit') this.pose.eyes = 0
      applyPose(this.rig, this.pose, emptyMotion())
    }
    if (this.vac) this.setLed(true)
    if (this.kc) this.setLed(true)
    if (this.dr) {
      this.spin = 0
      this.vel = { x: 0, y: 0 }
      this.dr.body.rotation.set(0, 0, 0)
      this.shadow.position.y = 0.35
      this.setLed(true)
    }
    if (this.robo) {
      const quad = this.robo.breed.type === 'quad'
      this.rm = { ...emptyRoboMotion(), rest: quad || this.robo.breed.roam ? 1 : 0, eyes: quad ? 0.3 : this.robo.breed.roam ? 0.12 : 1 }
      poseRobo(this.robo, this.rm)
    }
    this.writeTransform()
  }

  /** 预览开始：回到起点，从睡觉 / 充电开始 */
  reset() {
    const s = this.start
    this.pos = { x: s.x, y: s.y }
    this.h = s.h
    this.yW = s.z
    this.fl = s.fl
    this.pitch = 0
    this.speed = 0
    this.walkW = 0
    this.acts = 0
    this.atHome = true
    this.tasks = []
    this.tt = 0
    if (this.rig) {
      const rabbit = this.rig.breed.kind === 'rabbit'
      this.pose = poseFor(this.rig.breed, rabbit ? 'loaf' : 'curl')
      // 一开始错开醒来的时间：有的马上起来，有的多睡一会
      this.tasks.push({ t: 'rest', pose: rabbit ? 'loaf' : 'curl', dur: rnd(1.5, 9), sleep: true })
    } else if (this.vac) {
      this.tasks.push({ t: 'wait', dur: rnd(2, 8), charge: true })
    } else if (this.dr) {
      this.vel = { x: 0, y: 0 }
      this.spin = 0
      this.tasks.push({ t: 'wait', dur: rnd(3, 10), charge: true })
    } else if (this.robo) {
      this.rm = { ...emptyRoboMotion(), rest: 1 }
      this.prevH = this.h
      this.tasks.push(this.robo.breed.roam ? { t: 'rest', pose: 'lie', dur: rnd(2, 8), sleep: true } : { t: 'rest', pose: 'stand', dur: rnd(1, 4), look: 0.5 })
    } else {
      this.tasks.push({ t: 'wait', dur: rnd(3, 10), charge: true })
    }
  }

  setLed(on: boolean) {
    const p = this.vac ?? this.kc
    if (this.dr) {
      for (const o of this.dr.ledOn) o.visible = on
      for (const o of this.dr.ledOff) o.visible = !on
    }
    if (!p) return
    p.ledOn.visible = on
    p.ledOff.visible = !on
  }

  writeTransform() {
    this.root.position.set(this.pos.x, this.baseY + this.yW, this.pos.y)
    this.root.rotation.set(this.pitch, this.h, 0)
  }

  /** 会走楼梯的：猫、狗、机器狗、人形机器人（扫地机器人、Kachaka、轮式机器人、兔子、无人机只在本层） */
  get climbs() {
    if (this.rig) return this.rig.breed.kind === 'cat' || this.rig.breed.kind === 'dog'
    if (this.robo) return this.robo.breed.type === 'quad' || this.robo.breed.type === 'humanoid'
    return false
  }
}

const SHADOW_GEO = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2)
SHADOW_GEO.userData.shared = true
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#2b2030', transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })

/** Kachaka 会去「送东西」的家具：沙发、床、书桌、餐桌、矮桌、茶几前 */
const isDeliverTarget = (def: AssetDef) => hasTag(def, 'sofa', 'bed', 'bedding', 'desk', 'dining-table', 'low-table', 'coffee-table')
/** 无人机的巡航下限：顶端低于它的家具从上面飞过去（空中网格只把更高的算障碍） */
const AIR_MIN = 118
/** 宠物会去吃饭的地方 */
const isPetBowl = (def: AssetDef) => hasTag(def, 'pet-bowl')

export class ActorLayer {
  group = new THREE.Group()
  private actors = new Map<string, Actor>()
  private plan: Plan | null = null
  private preview = false
  /** 整套房子的导航：每层一张网格 + 楼梯连接（nav.ts HouseNav） */
  private house: HouseNav | null = null
  /** 无人机用的空中网格（低矮家具不算障碍），按楼层 */
  private airs = new Map<string, NavGrid>()
  private bowls: FloorSpot[] = []
  private deliver: (FloorSpot & { h: number })[] = []
  /**
   * 多层户型：整套房子一个 ActorLayer，group 在原点；角色的世界高度 = lift(所在楼层) + 离本层地面的高度。
   * lift：楼层地面现在的世界高度（elevation + 分层拉开 / 隐藏的动画偏移），elevOf：楼层本身的 elevation
   * （家具模型的 position.y 里含它，不含动画偏移），shown：这一层现在显示吗。Sandbox3D 设置；单层户型都是 0 / true。
   */
  lift: (floor: string) => number = () => 0
  elevOf: (floor: string) => number = () => 0
  shown: (floor: string) => boolean = () => true

  constructor(private getObj: (id: string) => THREE.Object3D | undefined) {}

  /** 角色所在楼层的导航网格 */
  private navOf(a: Actor) {
    return this.house!.grid(a.fl)
  }

  /** 按所在楼层（走楼梯时在两层之间插值）摆好角色的高度和显示 */
  private place(a: Actor) {
    const t = a.tasks[0]
    if (this.preview && t?.t === 'stairs' && t.pts) {
      const w = t.walk
      const k = Math.max(0, Math.min(1, a.yW / w.rise))
      const lo = this.lift(w.from)
      a.baseY = lo + (this.lift(w.to) - lo - w.rise) * k
      a.root.visible = this.shown(k > 0.5 ? w.to : w.from)
    } else {
      a.baseY = this.lift(a.fl)
      a.root.visible = this.shown(a.fl) && (this.preview || !a.hasRep)
    }
    a.writeTransform()
  }

  /** 楼层动画（分层拉开、只显示到当前层）在动：重新摆一遍所有角色 */
  relayout() {
    for (const a of this.actors.values()) this.place(a)
  }

  /** 调试 / 截图：让某个角色走到某层的某处（跨层会走楼梯） */
  sendTo(src: string, fl: string, p: Vec) {
    const a = this.actors.get(src)
    if (!a || !this.preview) return false
    a.atHome = false
    a.tasks = [{ t: 'go', to: p, fl }, { t: 'rest', pose: 'sit', dur: 30, look: 1 }]
    a.tt = 0
    return true
  }

  get count() {
    return this.actors.size
  }

  /** 从 plan 里找出所有角色 */
  private describe(plan: Plan): Desc[] {
    const out: Desc[] = []
    const homes: { f: Furniture; def: AssetDef; a: ActorSpec }[] = []
    const pets: Desc[] = []
    for (const f of plan.furniture) {
      const def = ASSET_MAP.get(f.asset)
      const a = def?.actor
      if (!def || !a) continue
      if (a.role === 'body') {
        // 摆在桌上的（坐姿小猫摆件）不动；无人机放在桌上也能起飞
        if ((f.z ?? 0) > 0.5 && a.kind !== 'drone') continue
        const n = def.surfaces?.length ?? 0
        const tiers = a.kind === 'kachaka' ? (n >= 2 ? 3 : n === 1 ? 2 : 0) : 0
        const d: Desc = { src: f.id, kind: a.kind, breed: a.breed ?? (a.kind === 'dog' ? 'shiba' : 'cat'), pal: effectivePalette(def, f.color ?? 0, f.colors), tiers: tiers as 0 | 2 | 3, role: 'body' }
        out.push(d)
        if (a.kind === 'cat' || a.kind === 'dog' || a.kind === 'robopet' || a.kind === 'drone') pets.push(d)
      } else homes.push({ f, def, a })
    }
    // 宠物认领最近的同类窝（同层的优先；窝在别的楼层也认，会走楼梯回窝）
    const taken = new Set<string>()
    for (const p of pets) {
      const me = plan.furniture.find((f) => f.id === p.src)!
      let best: string | undefined
      let bd = Infinity
      for (const h of homes) {
        if (h.a.kind !== p.kind || taken.has(h.f.id) || actorPartDef(h.def) || (p.kind === 'robopet' && h.a.breed !== p.breed)) continue
        const d = dist(me, h.f) + (floorOf(plan, me) === floorOf(plan, h.f) ? 0 : 5000)
        if (d < bd) {
          bd = d
          best = h.f.id
        }
      }
      if (best) {
        taken.add(best)
        p.bed = best
      }
    }
    for (const h of homes) {
      if (taken.has(h.f.id)) continue
      if (h.a.kind === 'vacuum') {
        out.push({ src: h.f.id, kind: 'vacuum', breed: '', pal: effectivePalette(h.def, h.f.color ?? 0, h.f.colors), tiers: 0, role: 'home' })
        continue
      }
      // 没人认领的窝：生成一只，花色借用同品种素材的配色
      const breed = h.a.breed ?? (h.a.kind === 'dog' ? 'shiba' : 'cat')
      const src = ASSETS.find((d) => d.actor?.role === 'body' && d.actor.breed === breed && d.id.startsWith('act-')) ?? ASSETS.find((d) => d.actor?.role === 'body' && d.actor.breed === breed)
      const pals = src?.palettes ?? [['#f4a259', '#fff4e6']]
      // 座子上自带角色模型的（陪伴机器人充电窝、人形机器人站立架）：用和静态模型一致的第一组配色
      out.push({ src: h.f.id, kind: h.a.kind, breed, pal: pals[actorPartDef(h.def) ? 0 : hash(h.f.id) % pals.length], tiers: 0, role: 'home' })
    }
    return out
  }

  /** 家具在场景里的位置 → 角色在家的位置 */
  private spotOf(plan: Plan, f: Furniture, kind: Kind): { spot: Spot; reps: THREE.Object3D[] } | null {
    const obj = this.getObj(f.id)
    const def = ASSET_MAP.get(f.asset)
    if (!obj || !def) return null
    obj.updateWorldMatrix(true, true)
    const part = actorPart(obj)
    const h = (-f.rot * Math.PI) / 180
    const fl = floorOf(plan, f)
    // 家具模型的 position.y 含楼层 elevation、不含动画偏移（偏移在楼层的组上）；世界坐标两者都含
    const elev = this.elevOf(fl)
    const lift = this.lift(fl)
    if (part) {
      const p = new THREE.Vector3()
      const q = new THREE.Quaternion()
      part.getWorldPosition(p)
      part.getWorldQuaternion(q)
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      // 宠物的骨架原点就在地面上；机器人的部件原点在底面（高度换算到本层的局部坐标）
      return { spot: { x: p.x, y: p.z, z: kind === 'cat' || kind === 'dog' || kind === 'rabbit' ? obj.position.y - elev : p.y - lift, h: Math.atan2(dir.x, dir.z), fl }, reps: [part] }
    }
    const dock = def.actor?.dock
    if (dock && def.actor?.role === 'home') {
      const p = obj.localToWorld(new THREE.Vector3(...dock))
      return { spot: { x: p.x, y: p.z, z: p.y - lift, h, fl }, reps: [] }
    }
    return { spot: { x: obj.position.x, y: obj.position.z, z: obj.position.y - elev, h, fl }, reps: def.actor?.role === 'body' ? [obj] : [] }
  }

  /** 场景（家具、房间）或模式变了之后调用；plan 传原始对象 */
  sync(plan: Plan, preview: boolean) {
    const wasPreview = this.preview
    if (wasPreview) this.stop()
    this.plan = plan
    const descs = this.describe(plan)
    const alive = new Set<string>()
    for (const d of descs) {
      alive.add(d.src)
      let a = this.actors.get(d.src)
      const key = `${d.kind}|${d.breed}|${d.pal.join(',')}|${d.tiers}`
      if (a && a.modelKey !== key) {
        this.group.remove(a.root)
        a = undefined
      }
      if (!a) {
        a = new Actor(d)
        this.actors.set(d.src, a)
        this.group.add(a.root)
      }
      a.d = d
      const src = plan.furniture.find((f) => f.id === d.src)!
      const s = this.spotOf(plan, src, d.kind)
      if (!s) continue
      a.start = s.spot
      a.reps = s.reps
      a.hasRep = s.reps.length > 0
      a.sleep = s.spot
      if (d.bed) {
        const bed = plan.furniture.find((f) => f.id === d.bed)
        const bs = bed && this.spotOf(plan, bed, d.kind)
        if (bs) a.sleep = bs.spot
      }
    }
    for (const [id, a] of this.actors)
      if (!alive.has(id)) {
        this.group.remove(a.root)
        this.actors.delete(id)
      }
    this.preview = preview
    if (preview) this.start()
    else
      for (const a of this.actors.values()) {
        a.placeAtHome()
        this.place(a)
      }
  }

  /** 进入预览：建导航网格，藏起素材里的角色，角色各就各位 */
  private start() {
    const plan = this.plan!
    const ignore = new Set<string>()
    for (const a of this.actors.values()) if (a.d.role === 'body') ignore.add(a.d.src)
    // 每层一张网格（上层的楼梯洞口挖掉），楼梯把上下层连起来
    this.house = new HouseNav(plan, { ignore })
    const house = this.house
    this.airs.clear()
    if ([...this.actors.values()].some((a) => a.dr))
      for (const fl of planFloors(plan)) this.airs.set(fl.id, new NavGrid(isMultiFloor(plan) ? floorView(plan, fl.id) : plan, { ignore, minH: AIR_MIN, holes: stairHoles(plan, fl.id).map((h) => h.poly) }))
    this.bowls = []
    this.deliver = []
    for (const f of plan.furniture) {
      const def = ASSET_MAP.get(f.asset)
      if (!def) continue
      const fl = floorOf(plan, f)
      const nav = house.grid(fl)
      if (isPetBowl(def) && !(f.z ?? 0)) {
        const p = nav.nearest('pet', { x: f.x, y: f.y }, 12, 60)
        if (p) this.bowls.push({ fl, p })
      } else if (isDeliverTarget(def) && !def.prop && !def.mount && !(f.z ?? 0)) {
        const h = (-f.rot * Math.PI) / 180
        const fw = fwd(h)
        const p = nav.nearest('robot', { x: f.x + fw.x * (def.d / 2 + 40), y: f.y + fw.y * (def.d / 2 + 40) }, 26, 70)
        // 停在家具前面，脸朝着家具
        if (p) this.deliver.push({ fl, p, h: h + Math.PI })
      }
    }
    for (const a of this.actors.values()) {
      for (const o of a.reps) o.visible = false
      a.root.visible = true
      // 门口点：窝 / 座子正前方，挪到能站的格子（在窝那层）
      const s = a.sleep
      const fw = fwd(s.h)
      const away = a.cls === 'robot' ? a.r + 22 : a.d.bed || a.d.role === 'home' ? a.r + 30 : 0
      a.door = house.grid(s.fl).nearest(a.cls, { x: s.x + fw.x * away, y: s.y + fw.y * away }, a.r, 120) ?? { x: s.x, y: s.y }
      a.reset()
      this.place(a)
      // Kachaka 架子上的东西跟着走
      a.carry = []
      if (((a.kc && a.d.tiers) || a.robo?.breed.deliver) && a.reps[0]) {
        const src = plan.furniture.find((f) => f.id === a.d.src)
        const part = a.reps[0]
        part.updateWorldMatrix(true, false)
        const inv = part.matrixWorld.clone().invert()
        for (const k of src ? propsOn(plan, src) : []) {
          const obj = this.getObj(k.id)
          if (!obj) continue
          obj.updateWorldMatrix(true, false)
          const casters: THREE.Mesh[] = []
          obj.traverse((o) => {
            const m = o as THREE.Mesh
            if (m.isMesh && m.castShadow) {
              m.castShadow = false
              casters.push(m)
            }
          })
          a.carry.push({ id: k.id, obj, local: inv.clone().multiply(obj.matrixWorld), casters })
        }
      }
    }
  }

  /** 离开预览：素材复原 */
  private stop() {
    const plan = this.plan
    for (const a of this.actors.values()) {
      for (const o of a.reps) o.visible = true
      for (const c of a.carry) {
        for (const m of c.casters) m.castShadow = true
        const f = plan?.furniture.find((x) => x.id === c.id)
        if (f && plan) placeFurniture(c.obj, plan, f)
        c.obj.quaternion.setFromEuler(c.obj.rotation)
        c.obj.scale.set(1, 1, 1)
      }
      a.carry = []
    }
    this.house = null
    this.airs.clear()
  }

  /** 射线点中的活动角色 → 它来源的家具 id（走动中的猫狗也能点选） */
  pick(raycaster: THREE.Raycaster): string | null {
    if (!this.preview) return null
    let best: { d: number; id: string } | null = null
    for (const a of this.actors.values()) {
      if (!a.root.visible) continue
      const hit = raycaster.intersectObject(a.root, true)[0]
      if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, id: a.d.src }
    }
    return best?.id ?? null
  }

  /** 每帧调用；返回是否需要重绘 */
  update(dt: number) {
    if (!this.preview || !this.house || !this.actors.size) return false
    dt = Math.min(dt, 0.05)
    for (const a of this.actors.values()) this.step(a, dt)
    return true
  }

  /**
   * 跨层的 go：按 HouseNav.route 展开成「走到楼梯口 → 走楼梯 → …… → 走到目标」。
   * 不会走楼梯的角色、到不了的目标：返回空（这个 go 作废）。
   */
  private expand(a: Actor, t: Extract<Task, { t: 'go' }>): Task[] {
    if (!a.climbs || !this.house) return []
    const r = a.cls === 'pet' ? a.r + 2 : a.r
    const legs = this.house.route(a.cls, { floor: a.fl, p: a.pos }, { floor: t.fl!, p: t.to }, r) ?? this.house.route(a.cls, { floor: a.fl, p: a.pos }, { floor: t.fl!, p: t.to }, a.r * 0.8)
    if (!legs) return []
    return legs.map((l, i): Task => {
      if (l.t === 'stairs') return { t: 'stairs', walk: l.walk, up: l.up }
      const last = i === legs.length - 1
      const to = l.path[l.path.length - 1]
      // 先走到折线起点（就近挪过的格子 / 楼梯口外侧），再沿折线走
      return { t: 'go', to, path: l.path, i: 0, rr: Math.min(r, a.r), ...(last ? { run: t.run, sniff: t.sniff } : {}) }
    })
  }

  /** 能去的楼层里随便挑一层（会走楼梯的角色偶尔换层活动） */
  private otherFloor(a: Actor): string | null {
    if (!a.climbs || !this.house || this.house.floors.length < 2) return null
    const fs = this.house.floors.filter((f) => f !== a.fl && this.house!.connected(a.fl, f))
    return fs.length ? fs[Math.floor(Math.random() * fs.length)] : null
  }

  // ---------- 行为 ----------

  private brain(a: Actor): Task[] {
    const nav = this.navOf(a)
    if (a.robo) return this.roboBrain(a)
    if (a.vac) {
      // 扫地机器人：出门清扫一阵 → 回座 → 充电
      if (a.atHome) return [{ t: 'leave', to: a.door }, { t: 'clean', dur: rnd(45, 90) }]
      return [{ t: 'go', to: a.door }, { t: 'turn', h: a.sleep.h }, { t: 'enter', spot: a.sleep }, { t: 'wait', dur: rnd(20, 40), charge: true }]
    }
    if (a.kc) {
      if (!a.atHome) return [{ t: 'go', to: a.door }, { t: 'turn', h: a.sleep.h }, { t: 'enter', spot: a.sleep }, { t: 'wait', dur: rnd(12, 25), charge: true }]
      // Kachaka：驮着架子去一两个地方，停一会儿，再回座
      const list: Task[] = [{ t: 'leave', to: a.door }]
      // Kachaka 只在本层（上不了楼梯）
      const pool = this.deliver.filter((d) => d.fl === a.fl).sort(() => Math.random() - 0.5)
      const n = 1 + Math.floor(Math.random() * 2)
      for (let i = 0; i < n; i++) {
        const d = pool[i] ?? (() => {
          const p = nav.randomSpot('robot', a.r, Math.random, undefined, Infinity, 20)
          return p ? { p, h: Math.random() * TAU } : null
        })()
        if (!d) continue
        list.push({ t: 'go', to: d.p }, { t: 'turn', h: d.h }, { t: 'wait', dur: rnd(4, 7), deliver: true })
      }
      return list
    }
    // 宠物
    const b = a.breed!
    const kind = b.kind
    if (a.atHome) {
      // 刚睡醒：伸个懒腰再出门
      const list: Task[] = []
      if (kind !== 'rabbit') list.push({ t: 'rest', pose: 'stretch', dur: rnd(1.6, 2.4) })
      list.push({ t: 'leave', to: a.door })
      return list
    }
    a.acts++
    if (a.acts > 3 + Math.random() * 4) {
      a.acts = 0
      const curl: PoseName = kind === 'rabbit' ? 'loaf' : kind === 'dog' && Math.random() < 0.4 ? 'lie' : 'curl'
      // 窝可能在别的楼层：go 带上楼层，会走楼梯回去
      return [{ t: 'go', to: a.door, fl: a.sleep.fl }, { t: 'enter', spot: a.sleep }, { t: 'rest', pose: curl, dur: rnd(25, 50), sleep: true, face: a.sleep.h }]
    }
    const r = Math.random()
    const near = (d: number) => nav.randomSpot('pet', a.r, Math.random, a.pos, d, 10)
    // 食盆：会走楼梯的可以去别的楼层吃
    const bowls = this.bowls.filter((b) => b.fl === a.fl || (a.climbs && this.house!.connected(a.fl, b.fl)))
    if (r < 0.15 && bowls.length) {
      const bowl = bowls[Math.floor(Math.random() * bowls.length)]
      return [{ t: 'go', to: bowl.p, fl: bowl.fl }, { t: 'rest', pose: 'eat', dur: rnd(4, 7), wag: kind === 'dog' ? 0.6 : 0 }]
    }
    if (r < 0.25 && kind !== 'rabbit') {
      // 跑一圈
      const p = nav.randomSpot('pet', a.r, Math.random, undefined, Infinity, 15)
      if (p) return [{ t: 'go', to: p, run: true }, { t: 'rest', pose: 'stand', dur: rnd(1.5, 3), look: 1, wag: 1 }]
    }
    // 偶尔换一层逛逛（经楼梯）
    const other = r < 0.4 ? this.otherFloor(a) : null
    if (other) {
      const p = this.house!.grid(other).randomSpot('pet', a.r, Math.random, undefined, Infinity, 15)
      if (p) return [{ t: 'go', to: p, fl: other }, { t: 'rest', pose: 'stand', dur: rnd(1.5, 3), look: 1, wag: kind === 'dog' ? 1 : 0 }]
    }
    const p = near(kind === 'rabbit' ? 180 : 380)
    const go: Task[] = p ? [{ t: 'go', to: p, sniff: kind === 'dog' && Math.random() < 0.5 }] : []
    const idle: Task[] =
      kind === 'cat'
        ? [
            { t: 'rest', pose: 'sit', dur: rnd(3, 7), look: 1 },
            { t: 'rest', pose: 'groom', dur: rnd(3, 6), lick: 1 },
            { t: 'rest', pose: 'loaf', dur: rnd(5, 10), look: 0.3 },
            { t: 'rest', pose: 'curl', dur: rnd(8, 16), sleep: true },
            { t: 'rest', pose: 'stand', dur: rnd(1, 2.5), look: 1 },
          ]
        : kind === 'dog'
          ? [
              { t: 'rest', pose: 'sit', dur: rnd(3, 6), look: 0.6, wag: 1 },
              { t: 'rest', pose: 'lie', dur: rnd(5, 10), wag: 0.3 },
              { t: 'rest', pose: 'stand', dur: rnd(1.5, 3), look: 1, wag: 0.8 },
              { t: 'rest', pose: 'sniff', dur: rnd(1.5, 3), look: 0.4 },
              { t: 'rest', pose: 'curl', dur: rnd(8, 14), sleep: true },
            ]
          : [
              { t: 'rest', pose: 'loaf', dur: rnd(3, 8), look: 0.5 },
              { t: 'rest', pose: 'groom', dur: rnd(2, 4), lick: 1 },
              { t: 'rest', pose: 'sit', dur: rnd(2, 4), look: 1 },
            ]
    return [...go, idle[Math.floor(Math.random() * idle.length)]]
  }

  private step(a: Actor, dt: number) {
    if (a.dr) return this.droneStep(a, dt)
    if (!a.tasks.length) a.tasks = this.brain(a)
    // 目标在别的楼层：展开成经楼梯的几段（到不了就作废这一步）
    for (let guard = 0; guard < 3; guard++) {
      const t0 = a.tasks[0]
      if (t0?.t !== 'go' || !t0.fl || t0.fl === a.fl) break
      a.tasks.splice(0, 1, ...this.expand(a, t0))
      a.tt = 0
    }
    if (!a.tasks.length) a.tasks = [{ t: 'rest', pose: 'stand', dur: rnd(1, 2), look: 1 }]
    const task = a.tasks[0]
    a.tt += dt
    let done = true
    if (task) done = this.run(a, task, dt)
    if (done) {
      a.tasks.shift()
      a.tt = 0
    }
    this.animate(a, task, dt)
    this.place(a)
    // 架子上的东西跟着走
    if (a.carry.length) {
      a.root.updateMatrixWorld(true)
      const m = new THREE.Matrix4()
      for (const c of a.carry) {
        m.multiplyMatrices(a.root.matrixWorld, c.local)
        m.decompose(c.obj.position, c.obj.quaternion, c.obj.scale)
      }
    }
  }

  private turnTo(a: Actor, h: number, dt: number) {
    const rate = a.robo?.breed.type === 'quad' ? 2.6 : a.cls === 'robot' ? 1.8 : 5
    const d = wrap(h - a.h)
    a.h += Math.max(-rate * dt, Math.min(rate * dt, d))
    return Math.abs(d) < 0.03
  }

  /** 朝 target 走一步；check = false 时不管障碍（进出窝、座子） */
  private moveTo(a: Actor, target: Vec, vmax: number, dt: number, check = true, r = a.r) {
    const nav = this.navOf(a)
    const dx = target.x - a.pos.x
    const dy = target.y - a.pos.y
    const d = Math.hypot(dx, dy)
    if (d < 0.5) return 0
    const diff = wrap(Math.atan2(dx, dy) - a.h)
    this.turnTo(a, a.h + diff, dt)
    const align = Math.cos(diff)
    // 偏得多就先原地转身；快到了就减速
    let v = vmax * Math.max(0, Math.min(1, (align - 0.55) / 0.4))
    v = Math.min(v, d * 3 + 4)
    a.speed += (v - a.speed) * Math.min(1, dt * 5)
    const f = fwd(a.h)
    const step = Math.min(a.speed * dt, d)
    const next = { x: a.pos.x + f.x * step, y: a.pos.y + f.y * step }
    // clearance 按 10cm 格子算，有半格左右的误差，这里放宽一点免得卡在格子边上
    if (!check || nav.clearAt(a.cls, next) >= r - 4 || nav.clearAt(a.cls, next) >= nav.clearAt(a.cls, a.pos)) {
      a.pos = next
      return d - step
    }
    a.speed = 0
    return -1
  }

  /**
   * 走楼梯：沿 stairWalk 的路线（下楼倒过来）按路程推进，朝向对准前方 15cm，脚下高度取那一级踏面
   * （animate 里平滑过去，一级一级地起伏），身体按前后 20cm 的坡度俯仰。
   * 下楼一开始就换到下层（高度 + 层间高），上楼走完才换到上层（高度 − 层间高），高度连续。
   */
  private climb(a: Actor, t: Extract<Task, { t: 'stairs' }>, dt: number): boolean {
    const w = t.walk
    if (!t.pts) {
      const pts = t.up ? w.pts : [...w.pts].reverse()
      // 从现在的位置先走到路线起点（楼梯口外侧）
      t.pts = [{ x: a.pos.x, y: a.pos.y, z: t.up ? 0 : w.rise }, ...pts]
      t.cum = [0]
      for (let i = 1; i < t.pts.length; i++) t.cum.push(t.cum[i - 1] + Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].y - t.pts[i - 1].y))
      t.s = 0
      if (!t.up) {
        a.fl = w.from
        a.yW += w.rise
      }
    }
    const pts = t.pts
    const cum = t.cum!
    const total = cum[cum.length - 1]
    const at = (s: number) => {
      s = Math.max(0, Math.min(total, s))
      let i = 1
      while (i < cum.length - 1 && cum[i] < s) i++
      const seg = cum[i] - cum[i - 1] || 1
      const k = (s - cum[i - 1]) / seg
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, z: k < 0.5 ? pts[i - 1].z : pts[i].z }
    }
    const b = a.breed
    const vmax = (a.robo ? Math.max(18, a.robo.breed.speed) : (b?.walk ?? 30)) * 0.6
    const ahead = at(t.s! + 15)
    const dh = wrap(Math.atan2(ahead.x - a.pos.x, ahead.y - a.pos.y) - a.h)
    if (Math.hypot(ahead.x - a.pos.x, ahead.y - a.pos.y) > 1) this.turnTo(a, a.h + dh, dt)
    // 朝向偏得多先原地转过来
    const v = vmax * Math.max(0, Math.min(1, (Math.cos(dh) - 0.3) / 0.5))
    a.speed += (v - a.speed) * Math.min(1, dt * 5)
    t.s = Math.min(total, t.s! + a.speed * dt)
    const p = at(t.s)
    a.pos = { x: p.x, y: p.y }
    a.stairZ = p.z
    const slope = (at(t.s + 20).z - at(t.s - 20).z) / 40
    a.pitch += (-Math.atan(slope) * 0.75 - a.pitch) * Math.min(1, dt * 6)
    if (t.s >= total - 0.5 || a.tt > 90) {
      a.pos = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }
      if (t.up) {
        a.fl = w.to
        a.yW -= w.rise
      } else a.yW = Math.min(a.yW, 1)
      a.stairZ = 0
      return true
    }
    return false
  }

  /** 执行当前任务，返回是否做完 */
  private run(a: Actor, task: Task, dt: number): boolean {
    const nav = this.navOf(a)
    switch (task.t) {
      case 'stairs':
        return this.climb(a, task, dt)
      case 'rest':
        if (task.face !== undefined) this.turnTo(a, task.face, dt)
        a.speed = 0
        return a.tt >= task.dur
      case 'wait':
        a.speed = 0
        return a.tt >= task.dur
      case 'turn':
        a.speed = 0
        return this.turnTo(a, task.h, dt) || a.tt > 4
      case 'leave': {
        a.atHome = false
        const vmax = a.cls === 'robot' ? 14 : (a.breed?.walk ?? 30) * 0.7
        const left = this.moveTo(a, task.to, vmax, dt, false)
        return left >= 0 && left < 2
      }
      case 'enter': {
        const s = task.spot
        // 窝在别的楼层（没走过去，例如路被堵住）：不硬闯，过一阵再试
        if (s.fl !== a.fl) return true
        // 机器人没走到座子门口（路被堵住）：不硬闯，就地休息，过一阵再试
        if (a.robo && dist(a.pos, s) > a.r + 60) return true
        if (a.cls === 'robot') {
          // 机器人倒车进座：朝向不变，沿直线退回去
          this.turnTo(a, s.h, dt)
          const d = dist(a.pos, s)
          const step = Math.min(d, 12 * dt)
          if (d > 0.01) {
            a.pos = { x: a.pos.x + ((s.x - a.pos.x) / d) * step, y: a.pos.y + ((s.y - a.pos.y) / d) * step }
          }
          a.speed = -step / dt
          if (d - step < 0.3) {
            a.atHome = true
            a.speed = 0
            return true
          }
          return a.tt > 15
        }
        const left = this.moveTo(a, s, (a.breed?.walk ?? 30) * 0.7, dt, false)
        if (left >= 0 && left < 1.5) {
          a.atHome = true
          a.speed = 0
          return true
        }
        return a.tt > 15
      }
      case 'go': {
        if (task.path === undefined || task.path === null) {
          // 规划时多留 4cm 余量（走的时候朝向会有点偏），找不到再按原半径找
          // 宠物实在过不去（窄门 + 家具）时缩着身子挤过去
          for (const rr of a.cls === 'pet' ? [a.r + 4, a.r, a.r * 0.8] : a.robo ? [a.r + 4, a.r, a.r * 0.85] : [a.r + 4, a.r]) {
            task.path = nav.path(a.cls, a.pos, task.to, rr)
            task.rr = Math.min(rr, a.r)
            if (task.path) break
          }
          // 起点被挪到了能站的格子上时，先走到起点再出发
          task.i = task.path && dist(task.path[0], a.pos) > 3 ? 0 : 1
          task.tries = (task.tries ?? 0) + 1
          if (!task.path) return true
        }
        const path = task.path
        let i = task.i ?? 1
        if (i >= path.length) return true
        const last = i === path.length - 1
        const b = a.breed
        const vmax = a.vac ? 22 : a.kc ? 28 : a.robo ? a.robo.breed.speed * (task.run ? 1.5 : 1) : task.run ? b!.run : task.sniff ? b!.walk * 0.55 : b!.walk
        const left = this.moveTo(a, path[i], vmax, dt, true, task.rr)
        if (left < 0) {
          task.stuck = (task.stuck ?? 0) + dt
          if (task.stuck > 1.2) {
            task.stuck = 0
            task.path = null
            if ((task.tries ?? 0) > 2) return true
          }
          return false
        }
        task.stuck = 0
        // 拐点要走到位再转弯（抄近路会偏离规划好的路线，蹭到墙角）
        if (left < (last ? 2 : 3)) {
          i++
          task.i = i
        }
        return i >= path.length || a.tt > 60
      }
      case 'clean': {
        const vac = a.vac!
        task.modeT = (task.modeT ?? rnd(8, 15)) - dt
        if (task.modeT <= 0) {
          task.wall = !task.wall
          task.modeT = rnd(8, 15)
        }
        if (task.turnTo !== undefined && task.turnTo !== null) {
          a.speed = 0
          if (this.turnTo(a, task.turnTo, dt)) task.turnTo = null
        } else {
          const v = 20
          a.speed += (v - a.speed) * Math.min(1, dt * 3)
          // 沿墙：右手边没碰到东西就往右偏，贴着墙走
          if (task.wall) {
            const probe = fwd(a.h - 0.9)
            if (nav.clearAt(a.cls, { x: a.pos.x + probe.x * 10, y: a.pos.y + probe.y * 10 }) >= a.r) a.h -= 0.9 * dt
          }
          const f = fwd(a.h)
          const next = { x: a.pos.x + f.x * a.speed * dt, y: a.pos.y + f.y * a.speed * dt }
          if (nav.clearAt(a.cls, next) >= a.r) a.pos = next
          else {
            a.speed = 0
            // 撞到了：随机转一个角度（沿墙模式往左转一点）
            task.turnTo = task.wall ? a.h + rnd(0.4, 1.0) : a.h + Math.PI * rnd(0.5, 1.5)
          }
        }
        void vac
        return a.tt >= task.dur
      }
      default:
        return true
    }
  }

  // ---------- 动画 ----------

  private animate(a: Actor, task: Task | undefined, dt: number) {
    const nav = this.navOf(a)
    // 高度：地面（土间、阳台低一截）；进窝时跳到垫子上；走楼梯时是脚下那级踏面（一级一级地起伏）
    let yT = nav.floorAt(a.pos)
    const s = a.sleep
    const dHome = dist(a.pos, s)
    const onStairs = task?.t === 'stairs' && !!task.pts
    if (onStairs) yT = a.stairZ
    else if ((a.atHome || task?.t === 'enter' || task?.t === 'leave') && dHome < 22 && s.fl === a.fl) yT = s.z
    a.yW += (yT - a.yW) * Math.min(1, dt * (onStairs ? 14 : 10))
    // 下了楼梯慢慢放平
    if (!onStairs) a.pitch += (0 - a.pitch) * Math.min(1, dt * 6)

    if (a.robo) return this.animateRobo(a, task, dt)
    if (a.vac) {
      const cleaning = task?.t === 'clean' || task?.t === 'go' || task?.t === 'leave'
      for (const [k, br] of a.vac.brushes.entries()) br.rotation.y += (k ? -1 : 1) * (cleaning ? 14 : 0) * dt
      a.blink += dt
      a.setLed(task?.t === 'wait' ? Math.sin(a.blink * 2) > -0.6 : Math.sin(a.blink * 7) > 0)
      return
    }
    if (a.kc) {
      for (const w of a.kc.wheels) w.rotation.x += (a.speed / 2.6) * dt
      a.blink += dt
      const deliver = task?.t === 'wait' && task.deliver
      a.setLed(deliver ? Math.sin(a.blink * 10) > 0 : task?.t === 'wait' ? Math.sin(a.blink * 1.5) > -0.8 : true)
      // 到了：轻轻一顿（架子跟着点一下头）
      a.kc.shelf.rotation.x = deliver ? Math.sin(Math.min(a.tt, 0.6) * Math.PI / 0.6) * 0.012 : -Math.min(a.speed, 30) * 0.0004
      return
    }

    const rig = a.rig!
    const b = rig.breed
    let poseName: PoseName = 'stand'
    let sleep = false
    let look = 0
    let lick = 0
    let wag = 0
    let running = false
    if (task?.t === 'rest') {
      poseName = task.pose
      sleep = !!task.sleep
      look = task.look ?? 0
      lick = task.lick ?? 0
      wag = task.wag ?? 0
    } else if (task?.t === 'go') {
      running = !!task.run
      if (task.sniff) poseName = 'sniff'
      wag = b.kind === 'dog' ? 0.5 : 0
    }
    const tgt = poseFor(b, poseName)
    if (sleep) tgt.eyes = 0
    // 睡着的时候偶尔眯一下眼又闭上；醒着的时候眨眼
    const m = a.motion
    m.t += dt
    if (!sleep && Math.sin(m.t * 1.3 + a.r) > 0.995) tgt.eyes = 0.1
    if (!a.pose) a.pose = clonePose(tgt)
    lerpPose(a.pose, tgt, 1 - Math.exp(-dt * (poseName === 'stretch' ? 4 : 6)))

    const moving = Math.abs(a.speed) > 1
    const vmax = running ? b.run : b.walk
    a.walkW += ((moving ? Math.min(1, Math.abs(a.speed) / (vmax * 0.5)) : 0) - a.walkW) * Math.min(1, dt * 8)
    const stride = b.kind === 'rabbit' ? 22 : b.leg * (running ? 3.6 : 2.6)
    a.phase += (TAU * Math.abs(a.speed) * dt) / stride
    m.gait = a.walkW
    m.phase = a.phase
    m.run = running ? 1 : 0
    m.breathe = sleep ? 1 : 0.35
    m.look += (look - m.look) * Math.min(1, dt * 3)
    m.lick += (lick - m.lick) * Math.min(1, dt * 4)
    m.wag += ((b.kind === 'cat' && !sleep && !moving ? 0.25 : wag) - m.wag) * Math.min(1, dt * 3)
    // 抖耳朵：每隔几秒一下
    a.flickT -= dt
    if (a.flickT < 0) {
      a.flickT = rnd(2.5, 8)
      m.earFlick = 1
    }
    m.earFlick = Math.max(0, m.earFlick - dt * 4)
    applyPose(rig, a.pose, { ...m, earFlick: Math.sin(m.earFlick * Math.PI) })
  }

  // ---------- 机器人（robopet） ----------

  /** 机器狗 / 轮式机器人：出座 → 到处走走、去沙发 / 餐桌前「看看人」→ 回座充电；人形机器人原地待机（转头、挥手） */
  private roboBrain(a: Actor): Task[] {
    const nav = this.navOf(a)
    const b = a.robo!.breed
    if (!b.roam) {
      const r = Math.random()
      return [r < 0.3 ? { t: 'rest', pose: 'stand', dur: rnd(2.5, 3.5), wave: 1, look: 0.3 } : { t: 'rest', pose: 'stand', dur: rnd(4, 9), look: r < 0.75 ? 1 : 0.15 }]
    }
    const s = a.sleep
    if (a.atHome) {
      // 还在摆放的原位（认领的充电座在别处）：就近找个能站的地方起步，不直线穿过家具去座子门口
      const out = dist(a.pos, s) > 30 ? nav.nearest('robot', a.pos, a.r, 150) ?? a.pos : a.door
      return [{ t: 'rest', pose: 'stretch', dur: b.type === 'quad' ? rnd(1.6, 2.4) : 0.8 }, { t: 'leave', to: out }]
    }
    a.acts++
    if (a.acts > 3 + Math.random() * 4) {
      a.acts = 0
      return [{ t: 'go', to: a.door, fl: s.fl }, { t: 'turn', h: s.h }, { t: 'enter', spot: s }, { t: 'rest', pose: 'lie', dur: rnd(25, 45), sleep: true }]
    }
    const r = Math.random()
    // 机器狗、人形机器人会走楼梯：别的楼层的沙发 / 床前也去；轮式的只在本层
    const targets = this.deliver.filter((d) => d.fl === a.fl || (a.climbs && this.house!.connected(a.fl, d.fl)))
    if (targets.length && r < (b.deliver ? 0.8 : 0.4)) {
      // 停在沙发 / 床 / 餐桌前，朝着那边东张西望（看人），轮式和人形的偶尔挥挥手
      const d = targets[Math.floor(Math.random() * targets.length)]
      const wave = b.type !== 'quad' && Math.random() < 0.4 ? 1 : 0
      return [{ t: 'go', to: d.p, fl: d.fl }, { t: 'turn', h: d.h }, { t: 'rest', pose: 'stand', dur: rnd(3, 6), look: 1, wave }]
    }
    const other = r < 0.55 ? this.otherFloor(a) : null
    if (other) {
      const q = this.house!.grid(other).randomSpot('robot', a.r, Math.random, undefined, Infinity, 15)
      if (q) return [{ t: 'go', to: q, fl: other }, { t: 'rest', pose: 'stand', dur: rnd(2, 4), look: 0.8 }]
    }
    const p = nav.randomSpot('robot', a.r, Math.random, a.pos, 380, 10)
    const go: Task[] = p ? [{ t: 'go', to: p }] : []
    return [...go, { t: 'rest', pose: Math.random() < 0.3 && b.type === 'quad' ? 'lie' : 'stand', dur: rnd(2, 5), look: 0.7 }]
  }

  private animateRobo(a: Actor, task: Task | undefined, dt: number) {
    const rig = a.robo!
    const b = rig.breed
    const m = a.rm
    m.t += dt
    let rest = 0
    let stretch = 0
    let look = 0
    let wave = 0
    let sleep = false
    if (task?.t === 'rest') {
      rest = task.pose === 'lie' || task.pose === 'curl' ? 1 : 0
      stretch = task.pose === 'stretch' ? 1 : 0
      look = task.look ?? 0
      wave = task.wave ?? 0
      sleep = !!task.sleep
    } else if (task?.t === 'wait' && a.atHome) {
      rest = 1
      sleep = true
    }
    const k = (r: number) => Math.min(1, dt * r)
    m.rest += (rest - m.rest) * k(2.5)
    m.stretch += (stretch - m.stretch) * k(3)
    m.look += (look - m.look) * k(3)
    m.wave += (wave - m.wave) * k(4)
    // 步态：走路按速度推进相位，原地转身也小碎步
    const turn = Math.abs(wrap(a.h - a.prevH)) / Math.max(dt, 1e-4)
    a.prevH = a.h
    const sp = Math.abs(a.speed)
    const turning = turn > 0.3 && sp < 3
    const gT = sp > 1 ? Math.min(1, sp / (b.speed * 0.5)) : turning ? 0.6 : 0
    m.gait += (gT - m.gait) * k(6)
    m.phase += turning ? TAU * 2 * dt : (TAU * a.speed * dt) / (18.4 * b.s)
    m.speed = a.speed
    // 眨眼：睡着时闭眼；醒着时偶尔眨一下
    const blink = Math.sin(m.t * 1.3 + a.r) > 0.995
    const eyes = sleep ? (b.type === 'quad' ? 0.3 : 0.12) : blink ? 0.1 : 1
    m.eyes += (eyes - m.eyes) * k(18)
    for (const w of rig.wheels) w.rotation.x += (a.speed / (rig.wheelR * b.s)) * dt
    poseRobo(rig, m)
  }

  // ---------- 无人机 ----------

  private droneStep(a: Actor, dt: number) {
    if (!a.tasks.length) a.tasks = this.droneBrain(a)
    const task = a.tasks[0]
    a.tt += dt
    if (!task || this.droneRun(a, task, dt)) {
      a.tasks.shift()
      a.tt = 0
    }
    this.droneAnimate(a, task, dt)
    this.place(a)
  }

  /** 一趟出勤：起飞 → 在几个房间上空飞一飞、悬停 → 飞回停机点 → 降落 → 充电（只在本层飞） */
  private droneBrain(a: Actor): Task[] {
    const air = this.airs.get(a.fl)
    const s = a.sleep
    const home: Task[] = [{ t: 'fly', to: { x: s.x, y: s.y } }, { t: 'land', spot: s }, { t: 'wait', dur: rnd(20, 40), charge: true }]
    if (!a.atHome) return home
    a.cruise = Math.min(205, Math.max(rnd(AIR_MIN + 15, 175), s.z + 40))
    const list: Task[] = [{ t: 'lift', h: a.cruise }]
    // 只挑飞得过去的地方（大飞机过不了窄门就在本房间里转转）
    const n = 2 + Math.floor(Math.random() * 3)
    let from: Vec = { x: s.x, y: s.y }
    for (let i = 0, tries = 0; i < n && air && tries < 10; tries++) {
      const p = air.randomSpot('pet', a.r, Math.random, undefined, Infinity, 15)
      if (!p || !air.path('pet', from, p, a.r)) continue
      list.push({ t: 'fly', to: p }, { t: 'hover', dur: rnd(2, 5), dir: Math.random() < 0.5 ? -1 : 1 })
      from = p
      i++
    }
    return [...list, ...home]
  }

  /** 朝 target 水平加速飞行；返回剩余距离 */
  private flyToward(a: Actor, target: Vec, vmax: number, dt: number, last: boolean) {
    const dx = target.x - a.pos.x
    const dy = target.y - a.pos.y
    const d = Math.hypot(dx, dy)
    // 快到终点 / 拐点就减速（拐点不减到 0，免得每个拐角都停一下）
    // 方向始终对准航点（不抄近路，贴着规划好的航线飞），只平滑速度大小
    const v = Math.min(vmax, last ? d * 1.6 : d * 2.2 + 18)
    const cur = Math.hypot(a.vel.x, a.vel.y)
    const spd = cur + (v - cur) * Math.min(1, dt * 3)
    a.vel = d > 0.01 ? { x: (dx / d) * spd, y: (dy / d) * spd } : { x: 0, y: 0 }
    // 一帧不越过目标点
    let sx = a.vel.x * dt
    let sy = a.vel.y * dt
    const sl = Math.hypot(sx, sy)
    if (sl > d && sl > 0) {
      sx *= d / sl
      sy *= d / sl
    }
    a.pos = { x: a.pos.x + sx, y: a.pos.y + sy }
    return Math.hypot(target.x - a.pos.x, target.y - a.pos.y)
  }

  private droneRun(a: Actor, task: Task, dt: number): boolean {
    const air = this.airs.get(a.fl)
    const vmax = (DRONES[a.d.breed as DroneType] ?? DRONES.aerial).speed
    const cruiseY = () => a.cruise + Math.sin(a.rm.t * 1.3) * 2
    switch (task.t) {
      case 'wait':
        a.vel = { x: 0, y: 0 }
        return a.tt >= task.dur
      case 'lift':
        a.atHome = false
        // 先把桨转起来，再垂直爬升
        if (a.spin < 0.85) return false
        a.yW = Math.min(task.h, a.yW + dt * (task.h - a.yW > 20 ? 45 : 20))
        return a.yW >= task.h - 0.5
      case 'fly': {
        if (!air) return true
        if (task.path === undefined) {
          task.path = air.path('pet', a.pos, task.to, a.r)
          task.i = task.path && dist(task.path[0], a.pos) > 3 ? 0 : 1
        }
        const path = task.path
        if (!path) return true
        let i = task.i ?? 1
        if (i >= path.length) return true
        const last = i === path.length - 1
        const left = this.flyToward(a, path[i], vmax, dt, last)
        a.yW += (cruiseY() - a.yW) * Math.min(1, dt * 2)
        const sp = Math.hypot(a.vel.x, a.vel.y)
        if (sp > 8) this.turnDrone(a, Math.atan2(a.vel.x, a.vel.y), dt)
        if (left < (last ? 1.5 : 2.5)) task.i = ++i
        return i >= path.length || a.tt > 90
      }
      case 'hover':
        a.vel.x *= Math.max(0, 1 - dt * 3)
        a.vel.y *= Math.max(0, 1 - dt * 3)
        a.h += (task.dir ?? 1) * 0.45 * dt
        a.yW += (cruiseY() - a.yW) * Math.min(1, dt * 2)
        return a.tt >= task.dur
      case 'land': {
        const s = task.spot
        const d = dist(a.pos, s)
        // 只在停机点附近做最后的对准（飞回来的路径已经到了上空；实在没飞到就原地降落）
        if (d > 0.5 && d < 80) this.flyToward(a, s, vmax * 0.4, dt, true)
        else a.vel = { x: 0, y: 0 }
        this.turnDrone(a, s.h, dt)
        if (d < 3 || d >= 80) {
          const v = a.yW - s.z > 25 ? 40 : 16
          a.yW = Math.max(s.z, a.yW - v * dt)
        }
        if (a.yW <= s.z + 0.05) {
          a.yW = s.z
          if (d < 80) a.pos = { x: s.x, y: s.y }
          a.vel = { x: 0, y: 0 }
          a.atHome = true
          return true
        }
        return a.tt > 40
      }
      default:
        return true
    }
  }

  private turnDrone(a: Actor, h: number, dt: number) {
    const d = wrap(h - a.h)
    a.h += Math.max(-2.4 * dt, Math.min(2.4 * dt, d))
  }

  private droneAnimate(a: Actor, task: Task | undefined, dt: number) {
    const dr = a.dr!
    const m = a.rm
    m.t += dt
    const flying = !!task && task.t !== 'wait'
    a.spin += ((flying ? 1 : 0) - a.spin) * Math.min(1, dt * (flying ? 2.2 : 1.2))
    dr.props.forEach((p, k) => (p.rotation.y += (k % 2 ? -1 : 1) * a.spin * 48 * dt))
    // 机身姿态：往前飞低头、横移侧倾，悬停时轻轻晃
    const f = fwd(a.h)
    const vf = a.vel.x * f.x + a.vel.y * f.y
    const vs = a.vel.x * f.y - a.vel.y * f.x
    const air = a.yW > a.sleep.z + 2 ? 1 : 0
    const tx = Math.max(-0.22, Math.min(0.22, vf * 0.0032)) + Math.sin(m.t * 2.3) * 0.02 * air
    const tz = -Math.max(-0.22, Math.min(0.22, vs * 0.0032)) + Math.sin(m.t * 1.7) * 0.02 * air
    dr.body.rotation.x += (tx - dr.body.rotation.x) * Math.min(1, dt * 5)
    dr.body.rotation.z += (tz - dr.body.rotation.z) * Math.min(1, dt * 5)
    a.blink += dt
    a.setLed(flying ? Math.sin(a.blink * 6) > 0 : Math.sin(a.blink * 1.6) > -0.7)
    // 接触阴影落在地面上，飞得越高越小
    const floor = this.airs.get(a.fl)?.floorAt(a.pos) ?? this.house?.grid(a.fl).floorAt(a.pos) ?? 0
    const hgt = Math.max(0, a.yW - floor)
    a.shadow.position.y = floor - a.yW + 0.35
    const sc = a.shadowR * Math.max(0.45, 1 - hgt / 320)
    a.shadow.scale.set(sc, 1, sc)
  }

  /** 调试 / 测试用：每个角色的位置 */
  snapshot() {
    return [...this.actors.values()].map((a) => ({ id: a.d.src, kind: a.d.kind, breed: a.d.breed, x: a.pos.x, y: a.pos.y, h: a.h, r: (a.tasks[0]?.t === 'go' && (a.tasks[0] as { rr?: number }).rr) || a.r, cls: a.cls, task: a.tasks[0]?.t, atHome: a.atHome, z: a.yW, fl: a.fl, pitch: a.pitch, climbs: a.climbs }))
  }

  /** 测试用：无人机的空中网格（最底层） */
  get airGrid() {
    return this.airs.values().next().value ?? null
  }

  /** 测试用：最底层的导航网格 */
  get grid() {
    return this.house ? this.house.grid(this.house.floors[0]) : null
  }

  /** 测试用：整套房子的导航 */
  get houseNav() {
    return this.house
  }
}

/** 素材里有没有标 actorPart 的子树（基站一类：本身带着角色，不能被别的宠物认领） */
function actorPartDef(def: AssetDef) {
  return def.actor?.kind === 'vacuum' || def.actor?.kind === 'kachaka' || /^rb-(companion-nest|humanoid-stand)$/.test(def.id)
}

export { BREEDS }
