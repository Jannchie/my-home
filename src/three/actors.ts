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
import { effectivePalette } from './colors'
import { NavGrid, type NavClass } from '../nav'
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

type Kind = ActorSpec['kind']

/** 角色在家的位置：x / y 平面坐标，z 世界高度，h 朝向（rotation.y） */
interface Spot {
  x: number
  y: number
  z: number
  h: number
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
  | { t: 'rest'; pose: PoseName; dur: number; sleep?: boolean; look?: number; lick?: number; wag?: number; face?: number }
  | { t: 'go'; to: Vec; run?: boolean; sniff?: boolean; path?: Vec[] | null; i?: number; stuck?: number; tries?: number; rr?: number }
  | { t: 'enter'; spot: Spot }
  | { t: 'leave'; to: Vec }
  | { t: 'turn'; h: number }
  | { t: 'clean'; dur: number; wall?: boolean; modeT?: number; turnTo?: number | null }
  | { t: 'wait'; dur: number; charge?: boolean; deliver?: boolean }

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
  start: Spot = { x: 0, y: 0, z: 0, h: 0 }
  /** 睡觉的地方（认领的窝，或起点） */
  sleep: Spot = { x: 0, y: 0, z: 0, h: 0 }
  /** 进出 sleep 的门口点 */
  door: Vec = { x: 0, y: 0 }
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

  constructor(public d: Desc) {
    this.modelKey = `${d.kind}|${d.breed}|${d.pal.join(',')}|${d.tiers}`
    this.cls = d.kind === 'vacuum' || d.kind === 'kachaka' ? 'robot' : 'pet'
    let model: THREE.Object3D
    if (d.kind === 'vacuum') {
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
    // 接触阴影：一块半透明的暗色椭圆
    const sh = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT)
    if (this.rig) sh.scale.set(this.rig.breed.girth * 1.25, 1, this.rig.breed.len * 0.75)
    else if (this.kc && d.tiers) sh.scale.set(18, 1, 26)
    else if (this.kc) sh.scale.set(13, 1, 20)
    else sh.scale.set(18, 1, 18)
    sh.position.y = 0.35
    sh.renderOrder = 1
    sh.userData.noOutline = true
    this.root.add(sh)
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
    this.writeTransform()
  }

  /** 预览开始：回到起点，从睡觉 / 充电开始 */
  reset() {
    const s = this.start
    this.pos = { x: s.x, y: s.y }
    this.h = s.h
    this.yW = s.z
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
    } else {
      this.tasks.push({ t: 'wait', dur: rnd(3, 10), charge: true })
    }
  }

  setLed(on: boolean) {
    const p = this.vac ?? this.kc
    if (!p) return
    p.ledOn.visible = on
    p.ledOff.visible = !on
  }

  writeTransform() {
    this.root.position.set(this.pos.x, this.yW, this.pos.y)
    this.root.rotation.set(0, this.h, 0)
  }
}

const SHADOW_GEO = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2)
SHADOW_GEO.userData.shared = true
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#2b2030', transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })

/** Kachaka 会去「送东西」的家具：沙发、床、书桌、餐桌前 */
const DELIVER_RE = /sofa|couch|bed(?!-side)|desk|dining|kotatsu|沙发|ソファ|床|书桌|餐桌|被炉|矮桌|茶几/
/** 宠物会去吃饭的地方 */
const BOWL_RE = /pet-bowl|食碗/

export class ActorLayer {
  group = new THREE.Group()
  private actors = new Map<string, Actor>()
  private plan: Plan | null = null
  private preview = false
  private nav: NavGrid | null = null
  private bowls: Vec[] = []
  private deliver: { p: Vec; h: number }[] = []

  constructor(private getObj: (id: string) => THREE.Object3D | undefined) {}

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
        // 摆在桌上的（坐姿小猫摆件）不动
        if ((f.z ?? 0) > 0.5) continue
        const n = def.surfaces?.length ?? 0
        const tiers = a.kind === 'kachaka' ? (n >= 2 ? 3 : n === 1 ? 2 : 0) : 0
        const d: Desc = { src: f.id, kind: a.kind, breed: a.breed ?? (a.kind === 'dog' ? 'shiba' : 'cat'), pal: effectivePalette(def, f.color ?? 0, f.colors), tiers: tiers as 0 | 2 | 3, role: 'body' }
        out.push(d)
        if (a.kind === 'cat' || a.kind === 'dog') pets.push(d)
      } else homes.push({ f, def, a })
    }
    // 宠物认领最近的同类窝
    const taken = new Set<string>()
    for (const p of pets) {
      const me = plan.furniture.find((f) => f.id === p.src)!
      let best: string | undefined
      let bd = Infinity
      for (const h of homes) {
        if (h.a.kind !== p.kind || taken.has(h.f.id) || actorPartDef(h.def)) continue
        const d = dist(me, h.f)
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
      out.push({ src: h.f.id, kind: h.a.kind, breed, pal: pals[hash(h.f.id) % pals.length], tiers: 0, role: 'home' })
    }
    return out
  }

  /** 家具在场景里的位置 → 角色在家的位置 */
  private spotOf(f: Furniture, kind: Kind): { spot: Spot; reps: THREE.Object3D[] } | null {
    const obj = this.getObj(f.id)
    const def = ASSET_MAP.get(f.asset)
    if (!obj || !def) return null
    obj.updateWorldMatrix(true, true)
    const part = actorPart(obj)
    const h = (-f.rot * Math.PI) / 180
    if (part) {
      const p = new THREE.Vector3()
      const q = new THREE.Quaternion()
      part.getWorldPosition(p)
      part.getWorldQuaternion(q)
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      // 宠物的骨架原点就在地面上；机器人的部件原点在底面
      return { spot: { x: p.x, y: p.z, z: kind === 'cat' || kind === 'dog' || kind === 'rabbit' ? obj.position.y : p.y, h: Math.atan2(dir.x, dir.z) }, reps: [part] }
    }
    const dock = def.actor?.dock
    if (dock && def.actor?.role === 'home') {
      const p = obj.localToWorld(new THREE.Vector3(...dock))
      return { spot: { x: p.x, y: p.z, z: p.y, h }, reps: [] }
    }
    return { spot: { x: obj.position.x, y: obj.position.z, z: obj.position.y, h }, reps: def.actor?.role === 'body' ? [obj] : [] }
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
      const s = this.spotOf(src, d.kind)
      if (!s) continue
      a.start = s.spot
      a.reps = s.reps
      a.hasRep = s.reps.length > 0
      a.sleep = s.spot
      if (d.bed) {
        const bed = plan.furniture.find((f) => f.id === d.bed)
        const bs = bed && this.spotOf(bed, d.kind)
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
        a.root.visible = !a.hasRep
      }
  }

  /** 进入预览：建导航网格，藏起素材里的角色，角色各就各位 */
  private start() {
    const plan = this.plan!
    const ignore = new Set<string>()
    for (const a of this.actors.values()) if (a.d.role === 'body') ignore.add(a.d.src)
    this.nav = new NavGrid(plan, { ignore })
    const nav = this.nav
    this.bowls = []
    this.deliver = []
    for (const f of plan.furniture) {
      const def = ASSET_MAP.get(f.asset)
      if (!def) continue
      const text = `${def.id} ${def.name}`
      if (BOWL_RE.test(text) && !(f.z ?? 0)) {
        const p = nav.nearest('pet', { x: f.x, y: f.y }, 12, 60)
        if (p) this.bowls.push(p)
      } else if (DELIVER_RE.test(text) && !def.prop && !def.mount && !(f.z ?? 0)) {
        const h = (-f.rot * Math.PI) / 180
        const fw = fwd(h)
        const p = nav.nearest('robot', { x: f.x + fw.x * (def.d / 2 + 40), y: f.y + fw.y * (def.d / 2 + 40) }, 26, 70)
        // 停在家具前面，脸朝着家具
        if (p) this.deliver.push({ p, h: h + Math.PI })
      }
    }
    for (const a of this.actors.values()) {
      for (const o of a.reps) o.visible = false
      a.root.visible = true
      // 门口点：窝 / 座子正前方，挪到能站的格子
      const s = a.sleep
      const fw = fwd(s.h)
      const away = a.cls === 'robot' ? a.r + 22 : a.d.bed || a.d.role === 'home' ? a.r + 30 : 0
      a.door = nav.nearest(a.cls, { x: s.x + fw.x * away, y: s.y + fw.y * away }, a.r, 120) ?? { x: s.x, y: s.y }
      a.reset()
      a.writeTransform()
      // Kachaka 架子上的东西跟着走
      a.carry = []
      if (a.kc && a.d.tiers && a.reps[0]) {
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
    this.nav = null
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
    if (!this.preview || !this.nav || !this.actors.size) return false
    dt = Math.min(dt, 0.05)
    for (const a of this.actors.values()) this.step(a, dt)
    return true
  }

  // ---------- 行为 ----------

  private brain(a: Actor): Task[] {
    const nav = this.nav!
    if (a.vac) {
      // 扫地机器人：出门清扫一阵 → 回座 → 充电
      if (a.atHome) return [{ t: 'leave', to: a.door }, { t: 'clean', dur: rnd(45, 90) }]
      return [{ t: 'go', to: a.door }, { t: 'turn', h: a.sleep.h }, { t: 'enter', spot: a.sleep }, { t: 'wait', dur: rnd(20, 40), charge: true }]
    }
    if (a.kc) {
      if (!a.atHome) return [{ t: 'go', to: a.door }, { t: 'turn', h: a.sleep.h }, { t: 'enter', spot: a.sleep }, { t: 'wait', dur: rnd(12, 25), charge: true }]
      // Kachaka：驮着架子去一两个地方，停一会儿，再回座
      const list: Task[] = [{ t: 'leave', to: a.door }]
      const pool = [...this.deliver].sort(() => Math.random() - 0.5)
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
      return [{ t: 'go', to: a.door }, { t: 'enter', spot: a.sleep }, { t: 'rest', pose: curl, dur: rnd(25, 50), sleep: true, face: a.sleep.h }]
    }
    const r = Math.random()
    const near = (d: number) => nav.randomSpot('pet', a.r, Math.random, a.pos, d, 10)
    if (r < 0.15 && this.bowls.length) {
      const bowl = this.bowls[Math.floor(Math.random() * this.bowls.length)]
      return [{ t: 'go', to: bowl }, { t: 'rest', pose: 'eat', dur: rnd(4, 7), wag: kind === 'dog' ? 0.6 : 0 }]
    }
    if (r < 0.25 && kind !== 'rabbit') {
      // 跑一圈
      const p = nav.randomSpot('pet', a.r, Math.random, undefined, Infinity, 15)
      if (p) return [{ t: 'go', to: p, run: true }, { t: 'rest', pose: 'stand', dur: rnd(1.5, 3), look: 1, wag: 1 }]
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
    if (!a.tasks.length) a.tasks = this.brain(a)
    const task = a.tasks[0]
    a.tt += dt
    let done = true
    if (task) done = this.run(a, task, dt)
    if (done) {
      a.tasks.shift()
      a.tt = 0
    }
    this.animate(a, task, dt)
    a.writeTransform()
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
    const rate = a.cls === 'robot' ? 1.8 : 5
    const d = wrap(h - a.h)
    a.h += Math.max(-rate * dt, Math.min(rate * dt, d))
    return Math.abs(d) < 0.03
  }

  /** 朝 target 走一步；check = false 时不管障碍（进出窝、座子） */
  private moveTo(a: Actor, target: Vec, vmax: number, dt: number, check = true, r = a.r) {
    const nav = this.nav!
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

  /** 执行当前任务，返回是否做完 */
  private run(a: Actor, task: Task, dt: number): boolean {
    const nav = this.nav!
    switch (task.t) {
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
          for (const rr of a.cls === 'pet' ? [a.r + 4, a.r, a.r * 0.8] : [a.r + 4, a.r]) {
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
        const vmax = a.vac ? 22 : a.kc ? 28 : task.run ? b!.run : task.sniff ? b!.walk * 0.55 : b!.walk
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
    }
  }

  // ---------- 动画 ----------

  private animate(a: Actor, task: Task | undefined, dt: number) {
    const nav = this.nav!
    // 高度：地面（土间、阳台低一截）；进窝时跳到垫子上
    let yT = nav.floorAt(a.pos)
    const s = a.sleep
    const dHome = dist(a.pos, s)
    if ((a.atHome || task?.t === 'enter' || task?.t === 'leave') && dHome < 22) yT = s.z
    a.yW += (yT - a.yW) * Math.min(1, dt * 10)

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

  /** 调试 / 测试用：每个角色的位置 */
  snapshot() {
    return [...this.actors.values()].map((a) => ({ id: a.d.src, kind: a.d.kind, breed: a.d.breed, x: a.pos.x, y: a.pos.y, h: a.h, r: (a.tasks[0]?.t === 'go' && (a.tasks[0] as { rr?: number }).rr) || a.r, cls: a.cls, task: a.tasks[0]?.t, atHome: a.atHome }))
  }

  /** 测试用 */
  get grid() {
    return this.nav
  }
}

/** 素材里有没有标 actorPart 的子树（基站一类：本身带着角色，不能被别的宠物认领） */
function actorPartDef(def: AssetDef) {
  return def.actor?.kind === 'vacuum' || def.actor?.kind === 'kachaka'
}

export { BREEDS }
