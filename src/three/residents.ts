// VRM 住户层：用户上传的 VRM 人物在家里走动、坐沙发 / 椅子、躺床上睡觉、经楼梯上下楼。
//
// 和 ActorLayer（宠物、机器人）是两套：角色不来自家具，名单在 residents.ts（浏览器本地），和 plan 无关。
//   - Sandbox3D 在场景同步后调用 sync()，每帧调用 update(dt)（返回是否需要重绘）；live = false 时原地定住不动
//     （布置时选中 / 拖着家具），不回到哪里去。户型变了以后站的地方不能站了，就近挪开（挪不开就重新找个地方）。
//   - 找路用第一人称漫游的 walk 网格（除挑空外的房间都能进、落地窗通阳台、跨得过 30cm 以下的小东西），
//     多层户型经楼梯走（nav.ts HouseNav.route）。门不管开关都能过（和宠物一样）。
//   - 动作用预先转好的动作片段（three/motions.ts：站、走、坐下、坐着、起身）按权重混合，躺下、东张西望、眨眼另外叠加；
//     头发、裙摆的摇动交给 VRM 自带的弹簧骨骼。
//   - 画法跟着沙盘：MToon 材质换成项目的 toon 材质（保留贴图），这样灯光遮罩、各种画风、写实 PBR 替换、
//     楼层淡入淡出都照常生效；描边用蒙皮外壳（toon.ts addOutlines）。不投影，脚下垫一块接触阴影。
// 单位：厘米。VRM 是米，整个模型放大 100 倍。y 轴向上，平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { UP } from './geo'
import { FLAT_FLOORS, contactShadow, type BoxPool, type CharacterLayer, type FloorHooks } from './characters'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { dist, pointInPolygon, type Plan, type Room, type RoomKind, type Vec } from '../model'
import { floorOf, isMultiFloor, planFloors } from '../floors'
import { HouseNav } from '../nav'
import { ASSET_MAP } from './assets'
import type { AssetDef } from './kit'
import { canSitOn, hasTag, isSleepable } from './tags'
import { NO_LINE, addOutlines, gradientMap } from './toon'
import { climbStairs, expandCrossFloor, floorPlacement, followPath, fwd, randomOtherFloor, rnd, routeLegs, stepToward, turnToward, wrap, TAU, type Gait, type StairsTask } from './locomotion'
import { buildMotions, motionData, type ClipId, type Motions } from './motions'


/** 身体半径（cm）：肩宽一半左右，找路时离墙、家具这么远 */
const R = 16
/** 步态：人转身比宠物慢一点，朝向偏到 60° 以内就迈步 */
const GAIT: Gait = { turn: 4, align: 0.5, brake: 10 }
/** 这些房间里的坐具不去坐 */
const NO_SIT: RoomKind[] = ['bath', 'wash', 'toilet', 'storage', 'void']
/** 闲逛时不去的房间（随机落脚点） */
const NO_LOITER: RoomKind[] = ['bath', 'toilet', 'wash', 'storage', 'entrance', 'void', 'balcony']

// ---------- 模型 ----------

/** 载入好的 VRM 和量出来的身材（cm，站立时离地高度） */
export interface ResidentModel {
  vrm: VRM
  /** 放大 100 倍的外层（VRM 自己的 scene 在里面） */
  root: THREE.Group
  vrm0: boolean
  height: number
  hipY: number
  /** 站立时脚踝（foot 骨骼）离地高度（cm）：坐着时把脚放到地上用 */
  ankleY: number
  /** 动作片段（three/motions.ts） */
  motions: Motions
}

const loaderMods = () => Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('@pixiv/three-vrm')])

/** 提前开始下载载入器和动作数据（和模型文件的读取并行） */
export function warmResidentLoader() {
  return Promise.all([loaderMods(), motionData()])
}

/** 读 VRM 文件（.vrm 就是带扩展的 glb），材质换成 toon、加描边、弹簧骨骼按放大后的尺寸调好 */
export async function loadResidentModel(blob: Blob): Promise<ResidentModel> {
  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await loaderMods()
  const url = URL.createObjectURL(blob)
  try {
    const loader = new GLTFLoader()
    loader.register((p) => new VRMLoaderPlugin(p))
    const gltf = await loader.loadAsync(url)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm) throw new Error('not a VRM')
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    // VRM 0.x 面朝 -z：转过来，和 1.0 一样面朝 +z（标准化骨骼的局部坐标仍是原来的朝向，见 setBone）
    VRMUtils.rotateVRM0(vrm)
    const vrm0 = vrm.meta?.metaVersion === '0'
    toToon(vrm.scene)
    addOutlines(vrm.scene)
    const root = new THREE.Group()
    root.scale.setScalar(100)
    root.add(vrm.scene)
    root.updateMatrixWorld(true)
    // 弹簧骨骼：硬度、重力按世界单位加在骨头末端上，放大 100 倍后要跟着放大，不然头发软塌塌地拖在后面
    const sb = vrm.springBoneManager
    if (sb) {
      for (const j of sb.joints) {
        j.settings.stiffness *= 100
        j.settings.gravityPower *= 100
      }
      sb.setInitState()
    }
    vrm.update(0)
    const hips = vrm.humanoid.getNormalizedBoneNode('hips')
    const hipY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : 90
    const foot = vrm.humanoid.getNormalizedBoneNode('leftFoot')
    const ankleY = foot ? foot.getWorldPosition(new THREE.Vector3()).y : hipY * 0.09
    const box = new THREE.Box3().setFromObject(vrm.scene)
    const height = box.isEmpty() ? hipY * 1.9 : box.max.y - Math.min(0, box.min.y)
    // 动作数据载入失败就整个算载入失败（界面显示出错），不另备一套程序化的姿势
    const motions = buildMotions(vrm, vrm0, hipY, 100, await motionData())
    return { vrm, root, vrm0, height, hipY, ankleY, motions }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * MToon 的明暗按 toon 材质的色阶图来画：色阶图是 RGB 的，横坐标是 N·L（-1..1 映射到 0..1），
 * 每个通道写「暗面颜色 / 亮面颜色」到 1 的过渡——过渡的位置和宽度按 MToon 的 shadingShift / shadingToony
 * （shading = N·L + shift，在 -1 + toony .. 1 − toony 之间线性过渡）。这样皮肤的暗面是粉色而不是发灰，眼睛、眉毛这类暗面颜色等于亮面的不会变暗。
 */
const rampCache = new Map<string, THREE.DataTexture>()
function mtoonRamp(shade: THREE.Color, lit: THREE.Color, shift: number, toony: number) {
  const ratio = [shade.r / Math.max(lit.r, 1e-3), shade.g / Math.max(lit.g, 1e-3), shade.b / Math.max(lit.b, 1e-3)].map((v) => Math.max(0, Math.min(1, v)))
  const key = `${ratio.map((v) => v.toFixed(3)).join(',')}|${shift.toFixed(3)}|${toony.toFixed(3)}`
  let t = rampCache.get(key)
  if (t) return t
  const N = 64
  const data = new Uint8Array(N * 4)
  const lo = -1 + toony
  const hi = 1 - toony
  for (let i = 0; i < N; i++) {
    const dot = ((i + 0.5) / N) * 2 - 1
    const k = Math.max(0, Math.min(1, (dot + shift - lo) / Math.max(1e-3, hi - lo)))
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((ratio[c] + (1 - ratio[c]) * k) * 255)
    data[i * 4 + 3] = 255
  }
  t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat)
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  rampCache.set(key, t)
  return t
}

/**
 * MToon（和偶尔的 standard / basic）换成 toon 材质：颜色、贴图、透明方式照旧，明暗按 MToon 的暗面颜色和过渡（mtoonRamp）。
 * MToon 自己的描边分组不画，描边用 addOutlines；模型里没开描边的材质（脸上的眼睛、眉毛、睫毛）也不加
 */
function toToon(scene: THREE.Object3D) {
  const conv = (x: THREE.Material): THREE.Material => {
    const m = x as THREE.Material & {
      isMToonMaterial?: boolean
      isOutline?: boolean
      color?: THREE.Color
      map?: THREE.Texture | null
      emissive?: THREE.Color
      emissiveMap?: THREE.Texture | null
      emissiveIntensity?: number
      shadeColorFactor?: THREE.Color
      shadingShiftFactor?: number
      shadingToonyFactor?: number
      outlineWidthMode?: string
      outlineWidthFactor?: number
    }
    if (m.isOutline) return NO_LINE
    if (!m.isMToonMaterial && !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return x
    const lit = m.color?.clone() ?? new THREE.Color(0xffffff)
    const out = new THREE.MeshToonMaterial({
      color: lit,
      map: m.map ?? null,
      gradientMap: m.isMToonMaterial && m.shadeColorFactor ? mtoonRamp(m.shadeColorFactor, lit, m.shadingShiftFactor ?? 0, m.shadingToonyFactor ?? 0.9) : gradientMap(),
      transparent: m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      side: m.side,
      depthWrite: m.depthWrite,
    })
    if (m.emissiveMap || (m.emissive && m.emissive.getHex() !== 0)) {
      out.emissive = m.emissive?.clone() ?? new THREE.Color(0xffffff)
      out.emissiveMap = m.emissiveMap ?? null
      out.emissiveIntensity = m.emissiveIntensity ?? 1
    }
    out.name = m.name
    if (m.isMToonMaterial && (m.outlineWidthMode === 'none' || !m.outlineWidthFactor)) out.userData.noLine = true
    x.dispose()
    return out
  }
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material)
    mesh.castShadow = false
    mesh.receiveShadow = true
    // 蒙皮网格的包围盒是绑定姿势的：弯腰、躺下后会被错误地剔掉
    mesh.frustumCulled = false
    // 不挡点选（点穿过去选中后面的家具）
    mesh.raycast = () => {}
  })
}

// ---------- 坐 / 躺的地方 ----------

/** 能坐 / 躺的位置：hip 是坐下时髋部（躺下时脚跟）所在的平面位置，h 坐下 / 躺下后的朝向，y 座面 / 床面离本层地面的高度 */
interface Seat {
  key: string
  fl: string
  lie: boolean
  hip: Vec
  h: number
  y: number
  /** 走过去站的地方（能站的格子） */
  front: Vec
  by?: string
}

/** 座面高度（cm）：沙发低一点，凳子就是整件的高度 */
function seatHeight(def: AssetDef) {
  if (hasTag(def, 'sofa', 'armchair')) return 42
  if (hasTag(def, 'stool', 'bar-stool')) return Math.min(def.h, 78)
  return Math.min(46, def.h)
}

/**
 * 能不能躺、怎么躺（在 isSleepable 之上再看尺寸）：along = 顺着素材的深度方向躺（普通的床，床头在背面）；不然顺着宽度方向（日间床、上下铺、罗汉床的长边是宽）。
 * len 躺的方向的长度，span 横向的宽度，n 躺几个人。躺不下的返回 null：收起来的、婴儿床、高架床、太短 / 太窄的；
 * 沙发床除非是展开的形态（form = open），都当沙发坐。height：最高的那个人的身高（cm）
 */
export function lieSpec(def: AssetDef, height: number): { along: boolean; len: number; span: number; n: number } | null {
  if (!isSleepable(def) || hasTag(def, 'crib', 'loft')) return null
  // 沙发床：只有展开的形态拿来躺，其余当沙发坐
  if (hasTag(def, 'sofa') && def.form !== 'open') return null
  const along = def.d >= def.w
  const len = along ? def.d : def.w
  const span = along ? def.w : def.d
  if (len < Math.max(150, height * 0.85) || span < 60) return null
  return { along, len, span, n: span >= 130 ? 2 : 1 }
}

/** 每层的房间（多层户型按楼层分好，单层都在一起）：户型变了重建一次，找座位、找地方待着都查它 */
function roomsByFloor(plan: Plan): (fl: string) => Room[] {
  if (!isMultiFloor(plan)) return () => plan.rooms
  const m = new Map<string, Room[]>()
  for (const r of plan.rooms) {
    const fl = floorOf(plan, r)
    let a = m.get(fl)
    if (!a) m.set(fl, (a = []))
    a.push(r)
  }
  return (fl) => m.get(fl) ?? []
}

function findSeats(plan: Plan, house: HouseNav, height: number, roomsOf: (fl: string) => Room[]): Seat[] {
  const out: Seat[] = []
  for (const f of plan.furniture) {
    const def = ASSET_MAP.get(f.asset)
    if (!def || def.mount || def.prop || (f.z ?? 0) > 0.5) continue
    const bed = lieSpec(def, height)
    // 躺不下的床（收起的折叠床、合着的沙发床…）不坐也不躺，除非它本来就是沙发；地上的坐垫、座椅子不坐（站起坐下的动作对不上）
    const sit = !bed && canSitOn(def) && !hasTag(def, 'floor-cushion', 'floor-chair')
    const lie = !!bed
    if (!lie && !sit) continue
    const fl = floorOf(plan, f)
    // 浴室凳、洗面台前的凳子不坐（人不在浴室里待着）
    const room = roomsOf(fl).find((r) => pointInPolygon(f, r.points))
    if (room && NO_SIT.includes(room.kind)) continue
    const nav = house.grid(fl)
    const h = (-f.rot * Math.PI) / 180
    const fw = fwd(h)
    const side: Vec = { x: fw.y, y: -fw.x }
    const at = (a: number, b: number): Vec => ({ x: f.x + fw.x * a + side.x * b, y: f.y + fw.y * a + side.y * b })
    const base = nav.floorAt({ x: f.x, y: f.y })
    if (bed) {
      // 床面：没标的按 48cm，矮的（地铺、榻榻米床）就是整件的高度
      const y = base + (def.surface ?? Math.min(48, def.h))
      const feet = Math.min(height / 2, bed.len / 2 - 8)
      for (let k = 0; k < bed.n; k++) {
        const sgn = bed.n === 2 ? (k ? 1 : -1) : 1
        const off = bed.n === 2 ? sgn * bed.span * 0.24 : 0
        if (bed.along) {
          // 普通的床：脚朝床尾（素材的正面），头朝床头；宽床躺两个人。从床侧面上去，侧面靠墙就从床尾上去
          const front = nav.nearest('walk', at(0, off + sgn * (def.w / 2 + R + 14)), R, 90) ?? nav.nearest('walk', at(def.d / 2 + R + 14, off), R, 90)
          if (front) out.push({ key: `${f.id}#${k}`, fl, lie: true, hip: at(feet, off), h, y, front })
        } else {
          // 长边朝外的：顺着宽度躺，脚朝素材的右手边（side），从正面（长边）上去，正面靠墙就从脚那头上去
          const front = nav.nearest('walk', at(def.d / 2 + R + 14, 0), R, 90) ?? nav.nearest('walk', at(off, def.w / 2 + R + 14), R, 90)
          if (front) out.push({ key: `${f.id}#${k}`, fl, lie: true, hip: at(off, feet), h: h + Math.PI / 2, y, front })
        }
      }
      continue
    }
    // 沙发：每 60cm 一个座位，臀部离靠背 28cm；椅子、凳子：一个座位，在座面中间稍后
    const sofa = hasTag(def, 'sofa')
    const n = sofa ? Math.max(1, Math.min(4, Math.floor(def.w / 60))) : 1
    const back = sofa || hasTag(def, 'armchair') ? -def.d / 2 + Math.min(28, def.d * 0.45) : -def.d * 0.06
    for (let k = 0; k < n; k++) {
      const b = (k - (n - 1) / 2) * (def.w / n)
      const front = nav.nearest('walk', at(def.d / 2 + R + 10, b), R, 80)
      if (front) out.push({ key: `${f.id}#${k}`, fl, lie: false, hip: at(back, b), h, y: base + seatHeight(def), front })
    }
  }
  return out
}

// ---------- 姿势 ----------

const BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg',
  'leftFoot',
  'rightFoot',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
] as const satisfies readonly VRMHumanBoneName[]
type Bone = (typeof BONES)[number]

const _e = new THREE.Euler()
const _bq = new THREE.Quaternion()
/** 动作片段的目标权重（每帧复用） */
const CLIP_IDS: readonly ClipId[] = ['idle', 'walk', 'sitEnter', 'sitExit', 'sitIdle']
const _clipW = {} as Record<ClipId, number>
const _q = new THREE.Quaternion()

/** 躺平：腿伸直、手放在身侧（VRM 1.0 约定的欧拉角），叠在动作片段上 */
const LIE_POSE: [Bone, number, number, number][] = [
  ['hips', 0, 0, 0],
  ['spine', 0, 0, 0],
  ['chest', 0, 0, 0],
  ['neck', 0, 0, 0],
  ['head', 0, 0, 0],
  ['leftUpperLeg', 0, 0, 0.04],
  ['rightUpperLeg', 0, 0, -0.04],
  ['leftLowerLeg', 0.05, 0, 0],
  ['rightLowerLeg', 0.05, 0, 0],
  ['leftFoot', 0.3, 0, 0],
  ['rightFoot', 0.3, 0, 0],
  ['leftUpperArm', 0, 0, -1.34],
  ['rightUpperArm', 0, 0, 1.34],
  ['leftLowerArm', 0, -0.08, 0],
  ['rightLowerArm', 0, 0.08, 0],
]

type Task =
  | { t: 'idle'; dur: number; look?: number; sleep?: boolean }
  | { t: 'go'; to: Vec; fl?: string; path?: Vec[] | null; i?: number; stuck?: number; tries?: number; rr?: number }
  | StairsTask
  | { t: 'turn'; h: number }
  // 坐下 / 躺下 / 起身：位置、朝向、高度、俯仰、坐姿和躺姿的权重一起缓动过去
  // clip：过程中播的那段动作（坐下 / 起身），按缓动的进度对齐
  | { t: 'ease'; dur: number; clip?: ClipId; to: { p: Vec; h: number; y: number; pitch: number; sit: number; lie: number }; from?: { p: Vec; h: number; y: number; pitch: number; sit: number; lie: number } }
  // 不管障碍走一小段（从座位前走到坐下的位置，那里在家具占地里）
  | { t: 'step'; to: Vec }
  | { t: 'release' }

class Person {
  root = new THREE.Group()
  bones = new Map<Bone, THREE.Object3D>()
  pos: Vec = { x: 0, y: 0 }
  h = 0
  fl = ''
  /** 脚底（躺着时是脚跟）离本层地面的高度；baseY 是本层地面的世界高度 */
  yW = 0
  baseY = 0
  pitch = 0
  stairZ = 0
  speed = 0
  tasks: Task[] = []
  tt = 0
  walkW = 0
  sitW = 0
  lieW = 0
  /** 睡着了一动不动（不推进动作、不算在动的角色） */
  still = false
  /** 正坐着 / 躺着的地方 */
  seat: Seat | null = null
  lookT = 0
  lookYaw = 0
  lookCur = 0
  blinkT = rnd(2, 5)
  blink = 0
  eyes = 1
  shadow: THREE.Mesh
  /** 动作片段的播放 */
  mixer: THREE.AnimationMixer
  acts = {} as Record<ClipId, THREE.AnimationAction>
  /** 正在按进度播的一次性动作（坐下 / 起身）和进度 0..1 */
  clip: ClipId | null = null
  clipK = 0
  prevH = 0
  turnW = 0
  /** 髋部骨骼站立时的位置（躺下时放回这里） */
  hipRest: THREE.Vector3

  constructor(
    public id: string,
    public m: ResidentModel,
  ) {
    this.root.rotation.order = 'YXZ'
    this.root.add(m.root)
    for (const b of BONES) {
      const n = m.vrm.humanoid.getNormalizedBoneNode(b)
      if (n) this.bones.set(b, n)
    }
    this.hipRest = this.bones.get('hips')?.position.clone() ?? new THREE.Vector3()
    this.mixer = new THREE.AnimationMixer(m.vrm.scene)
    for (const [id, c] of Object.entries(m.motions.clips) as [ClipId, THREE.AnimationClip][]) {
      const a = this.mixer.clipAction(c)
      const once = id === 'sitEnter' || id === 'sitExit'
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
      a.clampWhenFinished = true
      a.setEffectiveWeight(id === 'idle' ? 1 : 0)
      // 一次性动作的进度由缓动任务直接给（不自己走时间）；循环动作错开起点，几个人不会同步晃
      if (once) a.timeScale = 0
      a.play()
      if (!once) a.time = Math.random() * c.duration
      this.acts[id] = a
    }
    const sh = contactShadow(22, 18)
    sh.raycast = () => {}
    this.root.add(sh)
    this.shadow = sh
  }

  /** 按 VRM 1.0 约定的欧拉角 → 这个模型标准化骨骼的局部旋转（共用一个临时对象） */
  boneQ(x: number, y: number, z: number) {
    const q = _bq.setFromEuler(_e.set(x, y, z))
    if (this.m.vrm0) {
      q.x = -q.x
      q.z = -q.z
    }
    return q
  }

  writeTransform() {
    this.root.position.set(this.pos.x, this.baseY + this.yW, this.pos.y)
    this.root.rotation.set(this.pitch, this.h, 0)
  }

  /** 搬出去：动作播放解绑（模型还能交给下一个 Person 用） */
  detach() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.m.vrm.scene)
    this.root.remove(this.m.root)
  }
}

/** 释放一个模型的几何、材质、贴图（共用的色阶图、隐藏材质不动）；之后不能再用 */
export function disposeResidentModel(m: ResidentModel) {
  m.vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.isOutline) return
    mesh.geometry.dispose()
    for (const x of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (x === NO_LINE) continue
      for (const v of Object.values(x)) if ((v as THREE.Texture | null)?.isTexture && v !== gradientMap()) (v as THREE.Texture).dispose()
      x.dispose()
    }
  })
}


// ---------- 层 ----------

export class ResidentLayer implements CharacterLayer {
  group = new THREE.Group()
  private people = new Map<string, Person>()
  private plan: Plan | null = null
  private live = false
  private house: HouseNav | null = null
  private seats: Seat[] = []
  /** 每层的房间（rebuild 时按户型建好） */
  private roomsOf: (fl: string) => Room[] = () => []
  /** 户型（几何 + 家具）变了：导航、座位要重建 */
  private stale = true
  /** 楼层钩子：同 ActorLayer（Sandbox3D 设置） */
  floors: FloorHooks = FLAT_FLOORS
  /** 新的人刚摆进场景（模型异步载入）：要重画一帧 */
  dirty = false

  roots(): [THREE.Object3D, string][] {
    return [...this.people.values()].map((p) => [p.root, p.fl] as [THREE.Object3D, string])
  }

  /** 住户进门（模型由调用方载入）；同一 id 已在家就换模型 */
  add(id: string, m: ResidentModel) {
    const old = this.remove(id)
    if (old && old !== m) disposeResidentModel(old)
    const p = new Person(id, m)
    this.people.set(id, p)
    this.group.add(p.root)
    if (this.plan) this.settle(p)
    this.dirty = true
  }

  /** 搬走；返回他的模型（不释放：调用方决定留着下次再用，还是 disposeResidentModel） */
  remove(id: string): ResidentModel | undefined {
    const p = this.people.get(id)
    if (!p) return
    for (const s of this.seats) if (s.by === id) s.by = undefined
    this.group.remove(p.root)
    p.detach()
    this.people.delete(id)
    this.dirty = true
    return p.m
  }

  /** 场景（房间、家具）或模式变了之后调用；plan 传原始对象。changed = false：户型没变，只是 live 变了 */
  sync(plan: Plan, live: boolean, changed = true) {
    this.plan = plan
    this.live = live
    if (changed || !this.house) this.stale = true
    // 定住不动（选中 / 拖着家具，每拖一帧都会来）时先不重建导航，等能动了再一次算好；还没站好的人照样要摆进去
    const frozen = !live && !!this.house && [...this.people.values()].every((p) => p.fl)
    if (!this.stale || frozen || !this.people.size) return
    this.rebuild()
    for (const p of this.people.values()) this.settle(p)
  }

  private rebuild() {
    if (!this.stale || !this.plan) return
    this.stale = false
    const plan = this.plan
    this.house = new HouseNav(plan, { sash: true, stepOver: 30 })
    const tall = Math.max(150, ...[...this.people.values()].map((p) => p.m.height))
    const old = new Map(this.seats.map((s) => [s.key, s.by]))
    this.roomsOf = roomsByFloor(plan)
    this.seats = findSeats(plan, this.house, tall, this.roomsOf)
    for (const s of this.seats) s.by = old.get(s.key)
  }

  /** 还站得住就留在原地（坐着的座位还在就接着坐）；不然就近挪开，挪不开就换个地方重新开始 */
  private settle(p: Person) {
    this.rebuild()
    const house = this.house
    if (!house) return
    if (p.seat) {
      const s = this.seats.find((x) => x.key === p.seat!.key)
      if (s && dist(s.hip, p.seat.hip) < 1 && Math.abs(s.y - p.seat.y) < 1) {
        s.by = p.id
        p.seat = s
        this.place(p)
        this.pose(p, 0)
        return
      }
      p.seat = null
    }
    // 走到一半的路、订好的座位都作废（路是按旧户型找的），站好以后重新决定做什么
    for (const s of this.seats) if (s.by === p.id) s.by = undefined
    p.tasks = []
    const ok = house.floors.includes(p.fl) ? house.grid(p.fl).nearest('walk', p.pos, R * 0.8, 60) : null
    if (ok) p.pos = ok
    else {
      const spot = this.loiterSpot(planFloors(this.plan!)[0].id)
      if (!spot) return
      p.fl = spot.fl
      p.pos = spot.p
      p.h = Math.random() * TAU
      p.tasks = [{ t: 'idle', dur: rnd(1, 4), look: 1 }]
      p.m.vrm.springBoneManager?.reset()
    }
    // 中途在楼梯上、坐下 / 起身到一半：直接站好
    p.pitch = 0
    p.sitW = 0
    p.lieW = 0
    p.clip = null
    p.yW = house.grid(p.fl).floorAt(p.pos)
    p.tt = 0
    this.place(p)
    this.pose(p, 0)
  }

  /** 某层随便一个适合待着的地方（不在卫浴、收纳、玄関）；那层没有就任意一层 */
  private loiterSpot(prefer: string): { fl: string; p: Vec } | null {
    const house = this.house!
    for (const fl of [prefer, ...house.floors.filter((f) => f !== prefer)]) {
      const nav = house.grid(fl)
      const rooms = this.roomsOf(fl)
      let any: Vec | null = null
      for (let k = 0; k < 30; k++) {
        const q = nav.randomSpot('walk', R, Math.random, undefined, Infinity, 12)
        if (!q) break
        any ??= q
        const room = rooms.find((r) => pointInPolygon(q, r.points))
        if (room && !NO_LOITER.includes(room.kind)) return { fl, p: q }
      }
      if (any) return { fl, p: any }
    }
    return null
  }

  private place(p: Person) {
    const { baseY, fl } = floorPlacement(p, p.tasks[0], (id) => this.floors.lift(id))
    p.baseY = baseY
    p.root.visible = this.floors.shown(fl)
    this.floors.fade(p.root, fl)
    p.writeTransform()
  }

  relayout() {
    for (const p of this.people.values()) this.place(p)
  }

  /** 调试 / 测试：让某人站起来走到某层的某处（跨层会走楼梯），到了站一会儿 */
  sendTo(id: string, fl: string, to: Vec) {
    const p = this.people.get(id)
    if (!p || !this.house) return false
    p.tasks = [...(p.seat ? this.brain(p) : []), { t: 'go', to, fl }, { t: 'idle', dur: 30, look: 1 }]
    p.tt = 0
    return true
  }

  /** 调试 / 测试：让某人去坐 / 躺某个位置（seats 里的 key） */
  seatAt(id: string, key: string) {
    const p = this.people.get(id)
    const s = this.seats.find((x) => x.key === key)
    if (!p || !s || (s.by && s.by !== id)) return false
    for (const x of this.seats) if (x.by === id && x !== p.seat) x.by = undefined
    s.by = id
    p.tasks = [...(p.seat ? this.brain(p) : []), ...this.seatTasks(p, s, 30)]
    p.tt = 0
    return true
  }

  /** 正在活动的人的世界包围盒（后处理按它去掉拖影，见 post.ts setMovers）；定住不动时没有 */
  movers(out: THREE.Box3[], pool: BoxPool) {
    if (!this.live) return
    for (const p of this.people.values()) {
      if (!p.root.visible || p.still) continue
      const y = p.baseY + p.yW
      // 躺着时身体沿床放平：按身高画一个方块
      out.push(pool.around(p.pos.x, p.pos.y, p.lieW > 0.05 ? p.m.height : 45, y - 10, y + p.m.height + 15))
    }
  }

  /** 测试用：每个人现在的状态 */
  snapshot() {
    return [...this.people.values()].map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, z: p.yW, fl: p.fl, task: p.tasks[0]?.t, sit: p.sitW, lie: p.lieW, pitch: p.pitch, seat: p.seat?.key ?? null }))
  }

  /** 测试用：找到的座位 */
  get seatList(): readonly Readonly<Seat>[] {
    return this.seats
  }

  /** 每帧调用；返回是否需要重绘 */
  update(dt: number) {
    const was = this.dirty
    this.dirty = false
    if (!this.live || !this.house || !this.people.size) return was
    dt = Math.min(dt, 0.05)
    let busy = was
    for (const p of this.people.values()) busy = this.step(p, dt) || busy
    return busy
  }

  // ---------- 行为 ----------

  private brain(p: Person): Task[] {
    const house = this.house!
    const nav = house.grid(p.fl)
    // 坐着 / 躺着的先起身
    if (p.seat) {
      const s = p.seat
      // 坐着：原地播起身的动作（坐下时就站在座位前的位置上）；躺着：缓动回床边站起来
      if (!s.lie) return [{ t: 'ease', dur: p.m.motions.clips.sitExit.duration, clip: 'sitExit', to: { p: { ...p.pos }, h: p.h, y: nav.floorAt(p.pos), pitch: 0, sit: 0, lie: 0 } }, { t: 'release' }]
      return [{ t: 'ease', dur: 1.6, to: { p: s.front, h: p.h, y: nav.floorAt(s.front), pitch: 0, sit: 0, lie: 0 } }, { t: 'release' }]
    }
    const r = Math.random()
    const reach = (s: Seat) => !s.by && (s.fl === p.fl || house.connected(p.fl, s.fl))
    const seats = this.seats.filter(reach)
    // 坐一会儿（沙发优先）/ 偶尔去床上躺一躺
    const sits = seats.filter((s) => !s.lie)
    if (r < 0.42 && sits.length) {
      const s = sits[Math.floor(Math.random() * sits.length)]
      s.by = p.id
      return this.seatTasks(p, s, rnd(14, 40))
    }
    const beds = seats.filter((s) => s.lie)
    if (r < 0.52 && beds.length) {
      const s = beds[Math.floor(Math.random() * beds.length)]
      s.by = p.id
      return this.seatTasks(p, s, rnd(25, 55))
    }
    // 换一层 / 去别的房间转转，停下来东张西望
    if (r < 0.62 && house.floors.length > 1) {
      const fl = randomOtherFloor(house, p.fl)
      const q = fl ? this.loiterSpot(fl) : null
      if (q?.fl === fl) return [{ t: 'go', to: q.p, fl }, { t: 'idle', dur: rnd(3, 7), look: 1 }]
    }
    const q = r < 0.85 ? this.loiterSpot(p.fl) : null
    const near = nav.randomSpot('walk', R, Math.random, p.pos, 300, 10)
    const to = q?.fl === p.fl ? q.p : near
    return [...(to ? [{ t: 'go', to } as Task] : []), { t: 'idle', dur: rnd(2.5, 8), look: Math.random() < 0.7 ? 1 : 0.3 }]
  }

  /** 走到座位前 → 转身背对座位 → 坐下（躺下）→ 待一阵 */
  private seatTasks(p: Person, s: Seat, dur: number): Task[] {
    if (s.lie)
      return [
        { t: 'go', to: s.front, fl: s.fl },
        { t: 'turn', h: Math.atan2(s.hip.x - s.front.x, s.hip.y - s.front.y) + Math.PI },
        { t: 'ease', dur: 1.8, to: { p: s.hip, h: s.h, y: s.y + 11, pitch: -Math.PI / 2, sit: 0, lie: 1 } },
        { t: 'idle', dur, sleep: true },
      ]
    const mo = p.m.motions
    // 坐下的动作里髋部往后、往下移到 sitHip：脚底原点站在「髋部落在座位上」对应的位置，转身背对座位，原地坐下。
    // 髋关节比座面高大约一成髋高（大腿的厚度）
    const off = mo.sitHip
    const c = Math.cos(s.h)
    const sn = Math.sin(s.h)
    const root = { x: s.hip.x - (off.x * c + off.z * sn), y: s.hip.y - (-off.x * sn + off.z * c) }
    const y = s.y + p.m.hipY * 0.1 - off.y
    return [
      { t: 'go', to: s.front, fl: s.fl },
      { t: 'step', to: root },
      { t: 'turn', h: s.h },
      { t: 'ease', dur: mo.clips.sitEnter.duration, clip: 'sitEnter', to: { p: root, h: s.h, y, pitch: 0, sit: 1, lie: 0 } },
      { t: 'idle', dur, look: 0.6 },
    ]
  }

  private step(p: Person, dt: number) {
    if (!p.tasks.length) p.tasks = this.brain(p)
    // 目标在别的楼层：展开成经楼梯的几段（到不了就作废，座位也放掉）
    if (!expandCrossFloor(p, (t) => this.expand(p, t as Extract<Task, { t: 'go' }>))) this.giveUp(p)
    if (!p.tasks.length) p.tasks = [{ t: 'idle', dur: rnd(1, 2), look: 1 }]
    const task = p.tasks[0]
    p.tt += dt
    if (this.run(p, task, dt)) {
      p.tasks.shift()
      p.tt = 0
    }
    // 躺好、闭上眼睡着了：姿势不再变，不推进动作、不重画（醒来起身时接着动）
    p.still = task.t === 'idle' && !!task.sleep && p.tasks[0] === task && p.lieW > 0.999 && p.eyes < 0.02
    if (p.still) return false
    this.animate(p, task, dt)
    return true
  }

  /** 去座位的路走不通：放掉座位，后面坐下的步骤一起作废 */
  private giveUp(p: Person) {
    for (const s of this.seats) if (s.by === p.id && s !== p.seat) s.by = undefined
    p.tasks = []
  }

  private expand(p: Person, t: Extract<Task, { t: 'go' }>): Task[] {
    const house = this.house!
    return routeLegs(house, 'walk', { floor: p.fl, p: p.pos }, { floor: t.fl!, p: t.to }, R, R * 0.7, R) ?? []
  }

  /** 步行速度：按走路片段的步幅（播放速度接近原速，最自然） */
  private vmax(p: Person) {
    return p.m.motions.walkSpeed * 1.1
  }

  private turnTo(p: Person, h: number, dt: number) {
    return turnToward(p, h, GAIT.turn, dt)
  }

  private moveTo(p: Person, target: Vec, vmax: number, dt: number, r: number, check = true) {
    return stepToward(p, this.house!.grid(p.fl), 'walk', target, vmax, dt, r, GAIT, check)
  }

  /** 走楼梯：比平地慢一些，朝向对准前方 20cm */
  private climb(p: Person, t: StairsTask, dt: number): boolean {
    return climbStairs(p, t, this.vmax(p) * 0.6, GAIT, 20, dt, p.tt)
  }

  private run(p: Person, task: Task, dt: number): boolean {
    const nav = this.house!.grid(p.fl)
    switch (task.t) {
      case 'idle':
        p.speed = 0
        return p.tt >= task.dur
      case 'turn':
        p.speed = 0
        return this.turnTo(p, task.h, dt) || p.tt > 3
      case 'step': {
        const left = this.moveTo(p, task.to, this.vmax(p) * 0.6, dt, R, false)
        return (left >= 0 && left < 1) || p.tt > 4
      }
      case 'release':
        if (p.seat) p.seat.by = undefined
        p.seat = null
        return true
      case 'stairs':
        return this.climb(p, task, dt)
      case 'ease': {
        p.speed = 0
        task.from ??= { p: { ...p.pos }, h: p.h, y: p.yW, pitch: p.pitch, sit: p.sitW, lie: p.lieW }
        const a = task.from
        const b = task.to
        const k = THREE.MathUtils.smoothstep(p.tt / task.dur, 0, 1)
        p.pos = { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k }
        p.h = a.h + wrap(b.h - a.h) * k
        p.yW = a.y + (b.y - a.y) * k
        p.pitch = a.pitch + (b.pitch - a.pitch) * k
        // 躺下时先坐到床边再倒下去：坐姿在前半段起来、后半段让给躺姿；起身反过来
        const bump = b.lie !== a.lie ? Math.sin(k * Math.PI) : 0
        p.sitW = a.sit + (b.sit - a.sit) * k + bump * 0.6
        p.lieW = a.lie + (b.lie - a.lie) * k
        p.clip = task.clip ?? null
        p.clipK = Math.min(1, p.tt / task.dur)
        if (k >= 1) {
          p.clip = null
          // 坐好 / 躺好：记下座位；起身后的 release 放掉它
          if (b.sit > 0.5 || b.lie > 0.5) p.seat = this.seats.find((s) => s.by === p.id) ?? null
          return true
        }
        return false
      }
      case 'go': {
        const res = followPath(p, nav, 'walk', task, [R + 3, R, R * 0.7], R, 6, dt, p.tt, (to, rr) => this.moveTo(p, to, this.vmax(p), dt, rr))
        if (res === 'failed') this.giveUp(p)
        return res === 'done'
      }
    }
  }

  // ---------- 动画 ----------

  private animate(p: Person, task: Task | undefined, dt: number) {
    const nav = this.house!.grid(p.fl)
    const easing = task?.t === 'ease' || !!p.seat
    if (!easing) {
      const onStairs = task?.t === 'stairs' && !!task.pts
      const yT = onStairs ? p.stairZ : nav.floorAt(p.pos)
      p.yW += (yT - p.yW) * Math.min(1, dt * (onStairs ? 14 : 10))
      p.pitch += (0 - p.pitch) * Math.min(1, dt * 6)
    }
    const moving = Math.abs(p.speed) > 2
    p.walkW += ((moving ? Math.min(1, p.speed / (this.vmax(p) * 0.45)) : 0) - p.walkW) * Math.min(1, dt * 7)
    // 东张西望：隔几秒换一个看的方向
    const look = task?.t === 'idle' ? (task.look ?? 0) : moving ? 0.15 : 0
    p.lookT -= dt
    if (p.lookT < 0) {
      p.lookT = rnd(1.5, 4.5)
      p.lookYaw = Math.random() < 0.35 ? 0 : rnd(-0.9, 0.9)
    }
    p.lookCur += (p.lookYaw * look - p.lookCur) * Math.min(1, dt * 2.5)
    // 眨眼；睡着闭眼
    const sleep = task?.t === 'idle' && !!task.sleep && p.lieW > 0.9
    p.blinkT -= dt
    if (p.blinkT < 0) {
      p.blinkT = rnd(2, 6)
      p.blink = 1
    }
    p.blink = Math.max(0, p.blink - dt * 7)
    p.eyes += ((sleep ? 0 : 1) - p.eyes) * Math.min(1, dt * 3)
    this.place(p)
    this.pose(p, dt)
    p.root.updateMatrixWorld(true)
    p.m.vrm.expressionManager?.setValue('blink', Math.max(1 - p.eyes, Math.sin(p.blink * Math.PI)))
    p.m.vrm.update(dt)
  }

  /** 按走路 / 坐 / 躺的权重摆骨骼（dt = 0：只摆姿势，不推进动作和弹簧骨骼） */
  private pose(p: Person, dt: number) {
    this.poseClips(p, dt)
    // 只摆姿势时也要把标准化骨骼抄到真正的骨骼上、跑一遍约束（扭转骨骼不跟上的话短裤、袖口会穿模）；弹簧骨骼 delta = 0 时不动
    if (dt === 0) {
      p.root.updateMatrixWorld(true)
      p.m.vrm.update(0)
    }
  }

  /**
   * 动作片段：按状态给各段动作定权重、平滑过渡（坐下 / 起身按缓动的进度对齐），走路按实际速度调播放速度。
   * 片段之上再叠两层：躺下（没有对应的片段，按躺的权重往「放平」的姿势插值）、东张西望（头和脖子多转一点）
   */
  private poseClips(p: Person, dt: number) {
    const mo = p.m.motions
    const l = p.lieW
    const s = Math.min(1, p.sitW) * (1 - l)
    // 原地转身：用走路片段慢慢踏小碎步，不整个人平移着转
    const turn = dt > 0 ? Math.abs(wrap(p.h - p.prevH)) / dt : 0
    p.prevH = p.h
    const turning = turn > 0.8 && Math.abs(p.speed) < 5 && !p.clip && s < 0.1
    p.turnW += ((turning ? 0.7 : 0) - p.turnW) * Math.min(1, dt * 8)
    const g = Math.max(p.walkW, p.turnW) * (1 - s) * (1 - l)
    const target = _clipW
    for (const id of CLIP_IDS) target[id] = 0
    if (p.clip) target[p.clip] = 1
    else {
      target.sitIdle = s
      target.walk = g
      target.idle = Math.max(0, 1 - s - g)
    }
    const k = dt === 0 ? 1 : Math.min(1, dt * 10)
    for (const id of CLIP_IDS) {
      const a = p.acts[id]
      const w = a.getEffectiveWeight()
      a.setEffectiveWeight(w + (target[id] - w) * k)
    }
    if (p.clip) p.acts[p.clip].time = p.clipK * p.acts[p.clip].getClip().duration
    p.acts.walk.timeScale = p.walkW < p.turnW ? 0.7 : Math.max(0.4, Math.min(2, Math.abs(p.speed) / mo.walkSpeed))
    p.mixer.update(dt)
    if (l > 0.001) {
      for (const [b, x, y, z] of LIE_POSE) {
        const n = p.bones.get(b)
        if (n) n.quaternion.slerp(p.boneQ(x, y, z), l)
      }
      p.bones.get('hips')?.position.lerp(p.hipRest, l)
    }
    // 坐着：座位比动作里的椅子高 / 低时脚会悬空 / 插进地里，用腿部 IK 把脚踝放回地面上
    const sitting = p.clip === 'sitEnter' ? p.clipK : p.clip === 'sitExit' ? 1 - p.clipK : s
    if (sitting > 0.01) {
      p.root.updateMatrixWorld(true)
      const y = p.baseY + this.house!.grid(p.fl).floorAt(p.pos) + p.m.ankleY
      legIK(p, 'left', y, sitting)
      legIK(p, 'right', y, sitting)
    }
    const yaw = p.lookCur * (1 - l)
    p.bones.get('neck')?.quaternion.multiply(_q.setFromAxisAngle(UP, yaw * 0.4))
    p.bones.get('head')?.quaternion.multiply(_q.setFromAxisAngle(UP, yaw * 0.6))
  }

}

// ---------- 腿部 IK ----------

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _t = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _qw = new THREE.Quaternion()
const _qp = new THREE.Quaternion()
const _qr = new THREE.Quaternion()
const _qf = new THREE.Quaternion()

const _ax = new THREE.Vector3()

/** 把一根骨骼的世界旋转左乘 r（局部旋转按父骨骼的世界旋转换算），并更新它和子骨骼的世界矩阵。r 会被改掉（传临时对象） */
function rotateWorld(n: THREE.Object3D, r: THREE.Quaternion) {
  n.getWorldQuaternion(_qw)
  n.parent!.getWorldQuaternion(_qp)
  n.quaternion.copy(_qp.invert().multiply(r.multiply(_qw)))
  n.updateMatrixWorld(true)
}

/**
 * 两节骨骼的 IK：大腿、小腿弯 / 伸到让脚踝落到高度 y（世界坐标，水平位置不动），w 是权重。
 * 先按余弦定理改膝盖的角度（绕膝盖所在平面的法线转），再整条腿转过去对准目标；脚的世界朝向保持不变（脚掌仍平放）
 */
function legIK(p: Person, side: 'left' | 'right', y: number, w: number) {
  const up = p.bones.get(`${side}UpperLeg`)
  const low = p.bones.get(`${side}LowerLeg`)
  const foot = p.bones.get(`${side}Foot`)
  if (!up || !low || !foot) return
  up.getWorldPosition(_a)
  low.getWorldPosition(_b)
  foot.getWorldPosition(_c)
  _t.copy(_c)
  _t.y += (y - _c.y) * w
  if (Math.abs(_t.y - _c.y) < 0.05) return
  foot.getWorldQuaternion(_qf)
  const l1 = _a.distanceTo(_b)
  const l2 = _b.distanceTo(_c)
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, _a.distanceTo(_t)))
  // 膝盖角度：当前的 → 需要的
  _u.subVectors(_a, _b).normalize()
  _v.subVectors(_c, _b).normalize()
  const cur = Math.acos(Math.max(-1, Math.min(1, _u.dot(_v))))
  const want = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))))
  const axis = _ax.crossVectors(_u, _v)
  if (axis.lengthSq() > 1e-8) {
    rotateWorld(low, _qr.setFromAxisAngle(axis.normalize(), want - cur))
    foot.getWorldPosition(_c)
  }
  // 整条腿转过去，让脚踝对准目标
  _u.subVectors(_c, _a).normalize()
  _v.subVectors(_t, _a).normalize()
  rotateWorld(up, _qr.setFromUnitVectors(_u, _v))
  // 脚掌保持原来的世界朝向
  foot.parent!.getWorldQuaternion(_qp)
  foot.quaternion.copy(_qp.invert().multiply(_qf))
}
