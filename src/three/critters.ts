// 会动的角色模型：猫、狗、兔子的分层骨架（Object3D 关节 + 程序化平滑形体），扫地机器人和 Kachaka（+ 专用架子）。
// 素材库里的静态展示版（packs/actors-pack.ts）和沙盘里活动的角色（actors.ts）共用这里的建模函数，长得一模一样。
//
// 坐标约定和素材一致：单位 cm，原点在地面，头朝 +z。
// 骨架：root → body（躯干枢轴，站立时在腿关节上方）→ chest / hips（前后半身，绕 y 轴反向转就是「蜷起来」）
//   chest → 两条前腿（upper → lower → 爪）、neck → head（耳朵、眼睛、吻部）
//   hips  → 两条后腿、尾巴（若干节串起来）
// 关节角都用 rotation.x：腿的 upper / lower 正值 = 脚往后（-z）摆，负值 = 往前。
// 躯干是一整块放样网格（挂在 body 上），applyPose 时按 z 把前半段跟着 chest、后半段跟着 hips 弯过去（CPU 变形，
// 中间连续过渡），所以蜷起来时腰是一条顺滑的弧，不会断开。腿、尾巴每节两端是同半径的圆头，关节怎么转都接得上。
// 毛色：整只共用一个 furMaterial，花纹（虎斑、三花、重点色、柴犬的白色里毛……）写在顶点 mask 里，见 critter-geo.ts。
// 描边由 addOutlines 加在每个网格上（外壳是网格的子节点、共用几何体），所以关节转动、躯干变形时描边跟着走。

import * as THREE from 'three'
import { bump, fbm, furMaterial, loft, smooth, surf, taper, withMask } from './critter-geo'
import { addOutlines, ball, capsule, cyl, mergeMeshes, puck, rbox, shade, toon, torus } from './toon'

const PI = Math.PI
const INK = '#3a2a2a'
const PINK = '#ff9db0'
const NOSE_PINK = '#f28a9b'
const BLUSH = '#ffb0bf'

export type CreatureKind = 'cat' | 'dog' | 'rabbit'
export type EarType = 'cat' | 'prick' | 'flop' | 'pom' | 'bunny' | 'lop'
export type TailType = 'cat' | 'curl' | 'pom' | 'stub' | 'long'

/** 躯干轮廓（相对 girth 的倍数）：背高、腹深、半宽，胸腔 / 收腹 / 胯 / 腰的起伏 */
interface BodyShape {
  T: number
  B: number
  W: number
  chest: number
  tuck: number
  hip: number
  waist: number
  hump?: number
}

/** 头型：椭球三轴（相对 head）、腮帮子、脸前面压平、头顶压平 */
interface HeadShape {
  X: number
  Y: number
  Z: number
  cheek: number
  flat: number
  top: number
}

/** 体型参数（cm） */
export interface Breed {
  kind: CreatureKind
  label: string
  /** 躯干长 */
  len: number
  /** 躯干半径 */
  girth: number
  /** 腿关节到地面的高度（前腿；兔子后腿另算） */
  leg: number
  legR: number
  head: number
  /** 吻部伸出长度（猫、兔子为 0） */
  snout: number
  ear: EarType
  ear_: number
  tail: TailType
  tailLen: number
  tailR: number
  /** 卷毛 / 长毛 */
  fluff?: boolean
  neck: number
  /** 活动时的碰撞半径 */
  radius: number
  /** 走路 / 小跑速度 cm/s */
  walk: number
  run: number
  body: BodyShape
  face: HeadShape
  /** 眼睛大小（相对 head） */
  eye: number
}

const CAT_BODY: BodyShape = { T: 0.86, B: 0.86, W: 0.76, chest: 0.08, tuck: 0.16, hip: 0.1, waist: 0.1, hump: 0.04 }
const CAT_FACE: HeadShape = { X: 1.1, Y: 0.92, Z: 0.9, cheek: 0.14, flat: 0.12, top: 0.1 }

export const BREEDS: Record<string, Breed> = {
  cat: { kind: 'cat', label: '短毛猫', len: 30, girth: 8.5, leg: 13, legR: 2.1, head: 7.2, snout: 0, ear: 'cat', ear_: 3.6, tail: 'cat', tailLen: 26, tailR: 1.5, neck: 4, radius: 14, walk: 32, run: 70, body: CAT_BODY, face: CAT_FACE, eye: 1 },
  'cat-long': { kind: 'cat', label: '长毛猫', len: 32, girth: 10.5, leg: 12, legR: 2.6, head: 8, snout: 0, ear: 'cat', ear_: 3.4, tail: 'cat', tailLen: 26, tailR: 3, fluff: true, neck: 4, radius: 16, walk: 28, run: 60, body: { ...CAT_BODY, T: 0.9, B: 0.88, W: 0.82, tuck: 0.08 }, face: { ...CAT_FACE, X: 1.08, Y: 0.95, cheek: 0.2 }, eye: 1 },
  kitten: { kind: 'cat', label: '小猫', len: 19, girth: 6, leg: 8.5, legR: 1.6, head: 6.4, snout: 0, ear: 'cat', ear_: 3.2, tail: 'cat', tailLen: 15, tailR: 1.2, neck: 3, radius: 11, walk: 30, run: 65, body: { ...CAT_BODY, T: 0.9, B: 0.9, W: 0.8, tuck: 0.08 }, face: { ...CAT_FACE, X: 1.08, Y: 0.95, cheek: 0.1 }, eye: 1.18 },
  shiba: { kind: 'dog', label: '柴犬', len: 40, girth: 11, leg: 22, legR: 3, head: 9.5, snout: 6, ear: 'prick', ear_: 5, tail: 'curl', tailLen: 18, tailR: 3, neck: 6, radius: 22, walk: 45, run: 95, body: { T: 0.8, B: 0.92, W: 0.72, chest: 0.16, tuck: 0.3, hip: 0.04, waist: 0.12 }, face: { X: 1.02, Y: 0.9, Z: 0.92, cheek: 0.16, flat: 0.05, top: 0.12 }, eye: 0.82 },
  poodle: { kind: 'dog', label: '玩具贵宾', len: 26, girth: 8, leg: 16, legR: 2.2, head: 7.5, snout: 4.5, ear: 'pom', ear_: 4.5, tail: 'pom', tailLen: 8, tailR: 1.6, fluff: true, neck: 5, radius: 15, walk: 38, run: 80, body: { T: 0.86, B: 0.92, W: 0.76, chest: 0.12, tuck: 0.24, hip: 0.04, waist: 0.08 }, face: { X: 0.96, Y: 0.94, Z: 0.95, cheek: 0.04, flat: 0.04, top: 0.0 }, eye: 0.86 },
  dachshund: { kind: 'dog', label: '腊肠犬', len: 44, girth: 8.5, leg: 9, legR: 2.4, head: 7.5, snout: 7, ear: 'flop', ear_: 6, tail: 'long', tailLen: 20, tailR: 1.6, neck: 5, radius: 20, walk: 34, run: 70, body: { T: 0.86, B: 0.98, W: 0.78, chest: 0.2, tuck: 0.12, hip: 0.02, waist: 0.04 }, face: { X: 0.88, Y: 0.9, Z: 1.1, cheek: 0.02, flat: 0.0, top: 0.1 }, eye: 0.84 },
  rabbit: { kind: 'rabbit', label: '立耳兔', len: 20, girth: 9, leg: 6, legR: 1.8, head: 6.8, snout: 0, ear: 'bunny', ear_: 10, tail: 'stub', tailLen: 3, tailR: 3, neck: 2.5, radius: 13, walk: 35, run: 60, body: { T: 0.95, B: 0.85, W: 0.84, chest: -0.05, tuck: 0.04, hip: 0.18, waist: 0.0, hump: 0.16 }, face: { X: 0.98, Y: 0.92, Z: 1.0, cheek: 0.2, flat: 0.04, top: 0.06 }, eye: 0.95 },
  'rabbit-lop': { kind: 'rabbit', label: '垂耳兔', len: 21, girth: 9.5, leg: 6, legR: 1.8, head: 7.2, snout: 0, ear: 'lop', ear_: 9, tail: 'stub', tailLen: 3, tailR: 3, neck: 2.5, radius: 13, walk: 32, run: 55, body: { T: 0.95, B: 0.85, W: 0.86, chest: -0.05, tuck: 0.04, hip: 0.18, waist: 0.0, hump: 0.16 }, face: { X: 1.02, Y: 0.92, Z: 0.98, cheek: 0.22, flat: 0.06, top: 0.12 }, eye: 0.95 },
}

// ---------- 小工具 ----------

const node = (x = 0, y = 0, z = 0) => {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  return o
}

const noOL = <T extends THREE.Object3D>(o: T) => {
  o.userData.noOutline = true
  return o
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** 场值：x 越过 edge 的程度，0.5 为分界 */
const lin = (x: number, edge: number, k: number) => clamp(0.5 + (x - edge) * k, 0, 1)

/** 普通纯色件（眼睛、鼻子、项圈…），几何体不共享 */
function solid(geo: THREE.BufferGeometry, color: string, at?: THREE.Vector3) {
  const m = new THREE.Mesh(geo, toon(color))
  if (at) m.position.copy(at)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 沿曲线的细线（嘴、闭着的眼睛、胡须）：细管，不描边 */
function line(pts: THREE.Vector3[], r: number, color: string, seg = 16, radial = 4) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), toon(color))
  m.userData.noOutline = true
  return m
}

/** 小圆点（高光、铃铛）：低面数的球 */
const dot = (r: number) => surf(6, 4, (d, o) => o.copy(d).multiplyScalar(r))

/** 让物体的 +z 朝向 n、+y 尽量朝上（贴在头表面的眼睛、腮红） */
function faceAlong(o: THREE.Object3D, n: THREE.Vector3, roll = 0) {
  const z = n.clone().normalize()
  const x = new THREE.Vector3(0, 1, 0).cross(z).normalize()
  const y = z.clone().cross(x)
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  if (roll) o.rotateZ(roll)
}

// ---------- 骨架 ----------

export interface Leg {
  upper: THREE.Object3D
  lower: THREE.Object3D
  front: boolean
  side: -1 | 1
}

export interface Rig {
  breed: Breed
  root: THREE.Group
  body: THREE.Object3D
  chest: THREE.Object3D
  hips: THREE.Object3D
  neck: THREE.Object3D
  head: THREE.Object3D
  ears: THREE.Object3D[]
  /** 睁着的眼睛（睁开程度 = scale.y） */
  eyes: THREE.Object3D[]
  /** 闭着的眼睛（一道弧线），和 eyes 互斥显示 */
  lids: THREE.Object3D[]
  /** FL, FR, HL, HR */
  legs: Leg[]
  tail: THREE.Object3D[]
  /** 站立时 body 的高度 */
  standY: number
  /** 前后腿关节离躯干中心的前后距离 */
  reach: number
  /** 耳朵的默认姿态（抖耳朵在它上面加） */
  earRest: { x: number; z: number }[]
  /** 躯干网格 + 静止时的顶点 / 法线（按 bend、呼吸变形） */
  torso: { mesh: THREE.Mesh; pos: Float32Array; nor: Float32Array; zr: number; key: string }
}

/** 花色类型：从配色推出来（预设和用户自定义颜色都适用） */
type Coat = 'solid' | 'tabby' | 'calico' | 'cow' | 'points' | 'shiba' | 'tan' | 'poodle' | 'dutch'

const lum = (c: string) => {
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(c).getHSL(hsl, THREE.SRGBColorSpace)
  return hsl.l
}
const same = (a: string, b: string) => new THREE.Color(a).getHex() === new THREE.Color(b).getHex()

/**
 * 猫：[主色, 副色（肚皮 / 吻部 / 爪）, 花纹 A, 花纹 B]
 *   A、B 都等于主色 → 纯色；A ≠ B → 三花（主色是底色，A、B 两种色块）；
 *   A = B ≠ 主色：主色很浅、花纹很深时，副色和主色相同 → 奶牛（大色块），不同 → 重点色（暹罗：脸、耳、脚、尾巴）；其余 → 虎斑条纹。
 * 狗按品种：柴犬（白色里毛 + 眉点）、腊肠（黑棕的棕色重点）、贵宾（纯色）。
 * 兔子：有花纹色 → 荷兰兔 / 熊猫兔（后半身、耳朵、眼圈）。
 */
function coatOf(id: string, b: Breed, pal: string[]): Coat {
  const main = pal[0] ?? '#f4a259'
  if (b.kind === 'dog') return id === 'shiba' ? 'shiba' : id === 'dachshund' ? 'tan' : 'poodle'
  const a = pal[2] ?? main
  const c = pal[3] ?? a
  if (b.kind === 'rabbit') return same(a, main) ? 'solid' : 'dutch'
  if (same(a, main) && same(c, main)) return 'solid'
  if (!same(a, c)) return 'calico'
  if (lum(main) > 0.8 && lum(a) < 0.45) return same(pal[1] ?? main, main) ? 'cow' : 'points'
  return 'tabby'
}

/** 眼睛虹膜色：猫琥珀色（重点色、小猫是蓝色），狗深棕，兔子红棕 */
function irisColor(b: Breed, coat: Coat, main: string) {
  if (b.kind === 'dog') return '#8a5a36'
  if (b.kind === 'rabbit') return '#7a4038'
  if (coat === 'points' || b.label === BREEDS.kitten.label) return '#6fa8d6'
  return lum(main) < 0.3 ? '#e6c24a' : '#c9a83e'
}

/** 上色时每个毛色网格的身份 */
interface Part {
  part: 'torso' | 'neck' | 'head' | 'pad' | 'chin' | 'snout' | 'ear' | 'leg' | 'paw' | 'tail' | 'pom'
  side?: number
  front?: boolean
}

/**
 * 搭一只动物。pal = [主色, 副色（肚皮 / 吻部 / 爪）, 花纹 A, 花纹 B]（猫、兔子）；狗是 [主色, 副色, 项圈色]。
 */
export function buildCreature(breedId: string, pal: string[]): Rig {
  const id = BREEDS[breedId] ? breedId : 'cat'
  const b = BREEDS[id]
  const main = pal[0] ?? '#f4a259'
  const sub = pal[1] ?? shade(main, 0.25)
  const isDog = b.kind === 'dog'
  const isCat = b.kind === 'cat'
  const isRabbit = b.kind === 'rabbit'
  const coat = coatOf(id, b, pal)
  const patA = isDog ? main : pal[2] ?? main
  const patB = isDog ? main : pal[3] ?? patA
  const mat = furMaterial(main, sub, patA, patB)
  const parts = new Map<THREE.Mesh, Part>()
  const fur = (geo: THREE.BufferGeometry, part: Part) => {
    const m = new THREE.Mesh(withMask(geo), mat)
    m.castShadow = true
    m.receiveShadow = true
    parts.set(m, part)
    return m
  }

  const g = b.girth
  const h = b.head
  const half = b.len * 0.22
  const reach = b.len * 0.32

  const root = new THREE.Group()
  const standY = b.leg + g * 0.4
  const body = node(0, standY, 0)
  root.add(body)
  const chest = node()
  const hips = node()
  body.add(chest, hips)

  // ---------- 躯干：一整块放样，胸腔—腰—臀起伏 ----------
  const S = b.body
  const Lz = b.len * 0.5 + g * 0.3
  const zc = g * 0.05
  const torsoGeo = loft(22, 18, (t) => {
    const s = 2 * t - 1
    const k = s > 0 ? 2.3 : 2.0
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), k)), 1 / k)
    const top = g * S.T * env * (1 + (S.hump ?? 0) * bump(s, -0.45, 0.4))
    const bot = g * S.B * env * (1 + S.chest * bump(s, 0.4, 0.35) - S.tuck * bump(s, -0.15, 0.32))
    const wid = g * S.W * env * (1 + 0.06 * bump(s, 0.45, 0.35) + S.hip * bump(s, -0.55, 0.3) - S.waist * bump(s, -0.05, 0.3))
    return { z: zc + s * Lz, y: (top - bot) / 2, rx: wid, ry: (top + bot) / 2 }
  })
  if (b.fluff) fluffUp(torsoGeo, isDog ? 0.07 * g : 0.08 * g, isDog ? 0.42 / g * 8 : 0.5 / g * 8, 11)
  const torsoMesh = fur(torsoGeo, { part: 'torso' })
  body.add(torsoMesh)
  // 长毛猫：胸前一圈蓬松的围脖
  if (isCat && b.fluff) {
    const ruff = surf(14, 9, (d, o) => {
      const tuft = 1 + 0.16 * Math.max(0, Math.cos(Math.atan2(d.x, -d.y) * 7)) * smooth(0.1, -0.5, d.z)
      o.set(d.x * g * 0.72 * tuft, d.y * g * 0.7 * tuft, d.z * g * 0.55)
    })
    const m = fur(ruff, { part: 'neck' })
    m.position.set(0, g * 0.05, half + g * 0.62)
    m.rotation.x = -0.35
    chest.add(m)
  }

  // ---------- 腿：大腿—小腿—脚掌，关节处同半径圆头 ----------
  const legs: Leg[] = []
  for (const front of [true, false])
    for (const side of [-1, 1] as const) {
      const host = front ? chest : hips
      const legLen = b.leg
      const r = b.legR * (isRabbit && !front ? 1.25 : 1)
      const upper = node(side * g * 0.5, -g * 0.4, front ? reach : -reach)
      const L1 = legLen * 0.48
      const pawR = r * 1.2
      const L2 = Math.max(0.5, legLen - L1 - pawR * 0.62)
      // 大腿：后腿上粗（臀部的肌肉），前腿细一些、顶端埋在胸腔里
      const thighR = front ? r * 1.3 : isRabbit ? g * 0.58 : g * (isCat ? 0.44 : 0.4)
      const thigh = fur(taper(thighR, r * 1.08, L1, 9, { rings: 9 }), { part: 'leg', front, side })
      if (!front) thigh.position.z = -thighR * 0.12
      upper.add(thigh)
      const lower = node(0, -L1, 0)
      upper.add(lower)
      lower.add(fur(taper(r * 1.02, r * 0.86, L2, 8, { rings: 8 }), { part: 'leg', front, side }))
      // 脚掌：底面压平，前面圆；兔子后脚是长长的一只
      const longFoot = isRabbit && !front
      const pl = longFoot ? 2.1 : isCat ? 1.25 : 1.3
      const paw = fur(
        surf(10, 6, (d, o) => o.set(d.x * pawR * (isCat ? 1.02 : 0.98), d.y * pawR * (d.y < 0 ? 0.42 : 0.66), d.z * pawR * pl)),
        { part: 'paw', front, side },
      )
      paw.position.set(0, -L2 - pawR * 0.12, pawR * (longFoot ? 0.95 : 0.32))
      // 贵宾的脚藏在绒球里，不用单独建
      if (!(isDog && b.fluff)) lower.add(paw)
      else paw.geometry.dispose()
      // 贵宾：脚腕上的绒球
      if (isDog && b.fluff) {
        const pom = fur(puff(r * 1.75, 7, 13), { part: 'pom', front, side })
        pom.position.set(0, -L2 + pawR * 0.9, 0)
        lower.add(pom)
      }
      host.add(upper)
      legs.push({ upper, lower, front, side })
    }

  // ---------- 脖子、头 ----------
  const neck = node(0, g * 0.35, half + g * 0.75)
  chest.add(neck)
  const headPos = new THREE.Vector3(0, b.neck * 0.75, b.neck * 0.7)
  {
    const base = new THREE.Vector3(0, -g * 0.3, -g * 0.4)
    const dir = base.clone().sub(headPos)
    const m = fur(taper(h * (isRabbit ? 0.62 : 0.52), g * 0.6, dir.length(), 12, { rings: 8 }), { part: 'neck' })
    m.position.copy(headPos)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize())
    neck.add(m)
    if (isDog) {
      // 项圈 + 铃铛：套在脖子靠下的位置，垂直于脖子
      const at = headPos.clone().lerp(base, 0.55)
      const axis = base.clone().sub(headPos).normalize()
      const rr = h * 0.52 + (g * 0.6 - h * 0.52) * 0.55 + 0.25
      const collar = solid(new THREE.TorusGeometry(rr, 0.75, 6, 24), pal[2] ?? '#ff8f86', at)
      collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
      neck.add(collar)
      const fwd = new THREE.Vector3(0, -axis.z, axis.y).normalize()
      const bell = solid(dot(1.15), '#ffe08f')
      bell.position.copy(at).addScaledVector(fwd, rr + 0.6).addScaledVector(axis, 0.6)
      neck.add(bell)
    }
  }
  const head = node(headPos.x, headPos.y, headPos.z)
  neck.add(head)
  const F = b.face
  const headFn = (d: THREE.Vector3, o: THREE.Vector3) => {
    const ch = F.cheek * Math.exp(-(((d.y + 0.2) / 0.55) ** 2)) * d.x * d.x * (1 - 0.5 * Math.abs(d.z))
    // 长毛猫：两颊往外炸开的几撮毛
    let tuft = 0
    if (isCat && b.fluff) tuft = 0.05 * Math.pow(Math.max(0, Math.cos(Math.atan2(d.y + 0.15, Math.abs(d.x)) * 5 + 0.6)), 3) * smooth(0.55, 0.85, Math.abs(d.x)) * smooth(0.3, -0.1, d.y)
    const r = 1 + ch + tuft
    // 猫、兔子：口鼻那块微微往前鼓（侧面看不是正圆）
    const mz = b.snout > 0 ? 0 : Math.pow(Math.max(0, d.x * 0 + d.y * -0.38 + d.z * 0.925), 10) * 0.1
    o.set(d.x * F.X * r * h, d.y * F.Y * h * (d.y > 0 ? 1 - F.top * d.y * d.y : 1), d.z * F.Z * h * (d.z > 0 ? 1 - F.flat * d.z * d.z : 1) + mz * h)
  }
  head.add(fur(surf(28, 18, headFn), { part: 'head' }))
  /** 头表面上某方向的点和法线 */
  const onHead = (dir: THREE.Vector3) => {
    const d = dir.clone().normalize()
    const p = new THREE.Vector3()
    headFn(d, p)
    const t1 = new THREE.Vector3(0, 1, 0).cross(d)
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0)
    t1.normalize()
    const t2 = d.clone().cross(t1)
    const a = new THREE.Vector3()
    const c = new THREE.Vector3()
    headFn(d.clone().addScaledVector(t1, 0.01).normalize(), a)
    headFn(d.clone().addScaledVector(t2, 0.01).normalize(), c)
    const n = a.sub(p).cross(c.sub(p)).normalize()
    if (n.dot(d) < 0) n.negate()
    return { p, n }
  }

  // 贵宾头顶的绒球
  if (isDog && b.fluff) {
    // 三团卷毛叠成头顶的毛冠（各自有描边，看得出一团一团）
    const tops: [number, number, number, number][] = [
      [0, 0.72, -0.18, 0.56],
      [-0.3, 0.6, 0.2, 0.42],
      [0.3, 0.6, 0.2, 0.42],
    ]
    tops.forEach(([x, y, z, r], i) => {
      const t = fur(puff(h * r, 7, 21 + i), { part: 'pom' })
      t.position.set(x * h, y * h, z * h)
      head.add(t)
    })
  }

  // ---------- 口鼻 ----------
  /** 吻部前表面（猫、兔子的两团肉垫），给嘴线贴表面用 */
  const pads: { c: THREE.Vector3; r: THREE.Vector3 }[] = []
  let noseAt = new THREE.Vector3()
  if (b.snout > 0) {
    // 狗：从脸里伸出来的口吻，前端圆头；鼻头是黑色的
    const len = h * 0.42 + b.snout
    const z0 = h * 0.25
    const w0 = h * (id === 'dachshund' ? 0.4 : 0.48)
    const w1 = h * (id === 'dachshund' ? 0.26 : 0.3)
    const y0 = -h * 0.2
    const y1 = -h * (id === 'dachshund' ? 0.22 : 0.27)
    const hy0 = h * 0.4
    const hy1 = h * (id === 'dachshund' ? 0.22 : 0.25)
    const snout = loft(14, 14, (t) => {
      // 起点埋在头里收成极点，末端是圆头
      const tipK = t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1
      const baseK = t < 0.08 ? Math.sqrt(t / 0.08) : 1
      const u = Math.min(1, t / 0.8)
      const k = tipK * baseK
      const rx = (w0 + (w1 - w0) * u) * k
      const ry = (hy0 + (hy1 - hy0) * u) * k
      const zEnd = z0 + len
      const z = t < 0.8 ? z0 + (len - w1 * 0.9) * u : zEnd - w1 * 0.9 + w1 * 0.9 * ((t - 0.8) / 0.2)
      return { z, y: y0 + (y1 - y0) * u, rx, ry }
    })
    head.add(fur(snout, { part: 'snout' }))
    const tipZ = z0 + len
    noseAt = new THREE.Vector3(0, y1 + hy1 * 0.62, tipZ - h * 0.06)
    const nose = solid(
      surf(10, 6, (d, o) => o.set(d.x * h * 0.19 * (1 + 0.25 * d.y), d.y * h * 0.13, d.z * h * 0.13)),
      INK,
      noseAt,
    )
    head.add(nose)
    head.add(noOL(solid(dot(h * 0.045), '#ffffff', new THREE.Vector3(-h * 0.05, noseAt.y + h * 0.07, noseAt.z + h * 0.08))))
    // 嘴：鼻子下面一竖，再往两边弯（「人」字）
    const fz = (x: number, y: number) => {
      // 口吻前端近似成椭球取表面 z
      const cx = 0
      const cy = y1
      const rx = w1
      const ry = hy1
      const q = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2
      return tipZ - w1 * 0.9 + w1 * 0.9 * Math.sqrt(Math.max(0, q)) + h * 0.015
    }
    const P = (x: number, y: number) => new THREE.Vector3(x, y, fz(x, y))
    head.add(line([P(0, noseAt.y - h * 0.1), P(0, y1 - hy1 * 0.35)], h * 0.028, INK, 2, 3))
    for (const s of [-1, 1]) head.add(line([P(0, y1 - hy1 * 0.35), P(s * w1 * 0.45, y1 - hy1 * 0.62), P(s * w1 * 0.85, y1 - hy1 * 0.45)], h * 0.028, INK, 8, 3))
  } else {
    // 猫、兔子：两团肉垫 + 下巴
    const padR = new THREE.Vector3(h * (isRabbit ? 0.22 : 0.21), h * (isRabbit ? 0.19 : 0.17), h * 0.17)
    for (const s of [-1, 1]) {
      const { p, n } = onHead(new THREE.Vector3(s * 0.17, isRabbit ? -0.3 : -0.36, 0.92))
      const c = p.clone().addScaledVector(n, -h * 0.08)
      const m = fur(surf(10, 6, (d, o) => o.set(d.x * padR.x, d.y * padR.y, d.z * padR.z)), { part: 'pad' })
      m.position.copy(c)
      head.add(m)
      pads.push({ c, r: padR })
    }
    {
      const { p, n } = onHead(new THREE.Vector3(0, -0.6, 0.78))
      const m = fur(surf(8, 5, (d, o) => o.set(d.x * h * 0.17, d.y * h * 0.11, d.z * h * 0.14)), { part: 'chin' })
      m.position.copy(p).addScaledVector(n, -h * 0.07)
      head.add(m)
    }
    // 吻部表面的 z（两团肉垫的并集，找不到就退回头表面）
    const fz = (x: number, y: number) => {
      let z = -Infinity
      for (const pd of pads) {
        const q = 1 - ((x - pd.c.x) / pd.r.x) ** 2 - ((y - pd.c.y) / pd.r.y) ** 2
        if (q > 0) z = Math.max(z, pd.c.z + pd.r.z * Math.sqrt(q))
      }
      if (!Number.isFinite(z)) z = onHead(new THREE.Vector3(x / h, y / h, 0.9)).p.z
      return z + h * 0.012
    }
    const P = (x: number, y: number) => new THREE.Vector3(x, y, fz(x, y))
    // 粉色小鼻子：倒三角（上宽下尖），压在两团肉垫上沿
    const padTop = pads[0].c.y + padR.y * 0.75
    noseAt = new THREE.Vector3(0, padTop + h * 0.02, 0)
    noseAt.z = fz(0, padTop - h * 0.04) + h * 0.01
    const nose = solid(
      surf(10, 6, (d, o) => o.set(d.x * h * (isRabbit ? 0.1 : 0.12) * (0.55 + 0.55 * (d.y + 1) * 0.5) * 1.2, d.y * h * 0.075, d.z * h * 0.07)),
      NOSE_PINK,
      noseAt,
    )
    nose.userData.noOutline = true
    head.add(nose)
    // 嘴：「ω」——鼻子下一竖，然后两边各一道向下的弧（兔子是「人」字形的三瓣嘴）
    const lw = h * 0.024
    const y0 = noseAt.y - h * 0.06
    const yJ = pads[0].c.y + (isRabbit ? -padR.y * 0.15 : -padR.y * 0.05)
    head.add(line([P(0, y0), P(0, yJ)], lw, INK, 2, 3))
    for (const s of [-1, 1]) {
      if (isRabbit) head.add(line([P(0, yJ), P(s * padR.x * 0.45, yJ - padR.y * 0.45), P(s * padR.x * 0.95, yJ - padR.y * 0.55)], lw, INK, 8, 3))
      else head.add(line([P(0, yJ), P(s * padR.x * 0.42, yJ - padR.y * 0.6), P(s * padR.x * 0.95, yJ - padR.y * 0.25)], lw, INK, 9, 3))
    }
    // 胡须：每边两根，从肉垫往外略下垂
    if (isCat) {
      const wc = lum(main) < 0.3 ? '#d8d2cc' : shade(INK, 0.12)
      for (const s of [-1, 1])
        for (const k of [0, 1]) {
          const a = P(s * padR.x * 1.15, pads[0].c.y + padR.y * (0.25 - k * 0.45))
          a.z -= h * 0.04
          const dir = new THREE.Vector3(s, 0.08 - k * 0.3, -0.12).normalize()
          const len = h * (0.75 - k * 0.08)
          const mid = a.clone().addScaledVector(dir, len * 0.5)
          mid.y += h * 0.04
          const end = a.clone().addScaledVector(dir, len)
          head.add(line([a, mid, end], h * 0.012, wc, 4, 3))
        }
    }
  }

  // ---------- 眼睛（睁 / 闭两套）+ 腮红 ----------
  const eyes: THREE.Object3D[] = []
  const lids: THREE.Object3D[] = []
  const E = b.eye
  const eyeDir = isDog ? [0.36, 0.16, 0.92] : isRabbit ? [0.56, 0.16, 0.8] : [0.41, 0.08, 0.91]
  const eRx = h * (isDog ? 0.135 : isRabbit ? 0.14 : 0.155) * E
  const eRy = h * (isDog ? 0.15 : isRabbit ? 0.165 : 0.19) * E
  for (const s of [-1, 1]) {
    const { p, n } = onHead(new THREE.Vector3(s * eyeDir[0], eyeDir[1], eyeDir[2]))
    const holder = node()
    holder.position.copy(p)
    // 猫眼睛外眼角略上挑（杏仁形）
    faceAlong(holder, n, isCat ? s * 0.18 : 0)
    head.add(holder)
    const open = node()
    holder.add(open)
    // 虹膜一圈颜色（黑猫、黑狗的眼睛才看得见）+ 大瞳孔
    const almond = (d: THREE.Vector3) => 1 - 0.12 * d.y * s * (isCat ? 1 : 0)
    open.add(noOL(solid(surf(10, 6, (d, o) => o.set(d.x * eRx * almond(d), d.y * eRy, d.z * h * 0.06)), irisColor(b, coat, main))))
    open.add(noOL(solid(surf(10, 6, (d, o) => o.set(d.x * eRx * 0.8 * almond(d), d.y * eRy * 0.84, d.z * h * 0.07)), '#2b2026', new THREE.Vector3(0, -eRy * 0.04, h * 0.004))))
    // 高光：大的在左上，小的在右下（两只眼方向一致）
    open.add(noOL(solid(dot(eRx * 0.36), '#ffffff', new THREE.Vector3(-eRx * 0.32, eRy * 0.38, h * 0.06))))
    open.add(noOL(solid(dot(eRx * 0.17), '#ffffff', new THREE.Vector3(eRx * 0.34, -eRy * 0.4, h * 0.055))))
    eyes.push(open)
    // 闭眼：一道向下弯的弧（睡着的「︶」）
    const lid = line(
      [new THREE.Vector3(-eRx * 1.05, eRy * 0.05, h * 0.03), new THREE.Vector3(0, -eRy * 0.42, h * 0.05), new THREE.Vector3(eRx * 1.05, eRy * 0.05, h * 0.03)],
      h * 0.032,
      '#2b2026',
      10,
      3,
    )
    lid.visible = false
    holder.add(lid)
    lids.push(lid)
    // 腮红
    const bl = onHead(new THREE.Vector3(s * (isDog ? 0.55 : 0.6), isDog ? -0.12 : -0.2, 0.75))
    const blush = noOL(solid(surf(8, 4, (d, o) => o.set(d.x * h * 0.15, d.y * h * 0.085, d.z * h * 0.03)), BLUSH))
    blush.position.copy(bl.p).addScaledVector(bl.n, -h * 0.012)
    faceAlong(blush, bl.n)
    head.add(blush)
  }

  // ---------- 耳朵 ----------
  const ears: THREE.Object3D[] = []
  const earRest: { x: number; z: number }[] = []
  for (const s of [-1, 1]) {
    let ear: THREE.Object3D
    let rest = { x: 0, z: 0 }
    const EL = b.ear_
    if (b.ear === 'cat' || b.ear === 'prick') {
      const cat = b.ear === 'cat'
      const at = onHead(new THREE.Vector3(s * (cat ? 0.55 : 0.5), 0.8, cat ? -0.02 : -0.08))
      ear = node(at.p.x * 0.94, at.p.y * 0.94, at.p.z)
      rest = cat ? { x: -0.12, z: -s * 0.3 } : { x: 0.05, z: -s * 0.22 }
      const w = EL * (cat ? 0.62 : 0.6)
      const hgt = EL * (cat ? 1.45 : 1.08)
      const { outer, inner } = earGeo(w, EL * (cat ? 0.36 : 0.4), hgt, { lean: cat ? 0.05 : -0.08, tip: cat ? 0.85 : 0.75 })
      ear.add(fur(outer, { part: 'ear', side: s }))
      const inn = solid(inner, cat ? PINK : sub)
      inn.userData.noOutline = true
      ear.add(inn)
      // 长毛猫：耳尖一撮簇毛 + 耳朵里的白毛
      if (isCat && b.fluff) {
        const tuft = solid(new THREE.ConeGeometry(w * 0.12, hgt * 0.32, 6), shade(main, 0.08), new THREE.Vector3(0, hgt * 1.02, 0))
        ear.add(tuft)
      }
    } else if (b.ear === 'bunny') {
      const at = onHead(new THREE.Vector3(s * 0.3, 0.92, -0.18))
      ear = node(at.p.x * 0.92, at.p.y * 0.9, at.p.z)
      rest = { x: -0.12, z: -s * 0.14 }
      const { outer, inner } = earGeo(EL * 0.22, EL * 0.12, EL * 1.0, { spoon: true, lean: 0.04 })
      ear.add(fur(outer, { part: 'ear', side: s }))
      const inn = solid(inner, PINK)
      inn.userData.noOutline = true
      ear.add(inn)
    } else if (b.ear === 'lop' || b.ear === 'flop') {
      const lop = b.ear === 'lop'
      // 垂耳：耳根在头侧上方，耳片贴着脸颊外侧垂下来，平的一面朝里
      const at = onHead(new THREE.Vector3(s * 0.8, lop ? 0.58 : 0.5, lop ? -0.12 : -0.12))
      const th = EL * 0.12
      ear = node(at.p.x + at.n.x * th * 0.6, at.p.y, at.p.z)
      rest = { x: lop ? 0.08 : 0.1, z: s * (lop ? 0.22 : 0.16) }
      const { outer, inner } = earGeo(EL * (lop ? 0.32 : 0.4), th, EL * (lop ? 1.2 : 1.1), { spoon: true, lean: 0, down: true, flat: 0.5 })
      const m = fur(outer, { part: 'ear', side: s })
      m.rotation.y = -s * PI / 2
      ear.add(m)
      inner.dispose()
    } else {
      // 贵宾的绒球耳：两团卷毛垂在脸两侧
      const at = onHead(new THREE.Vector3(s * 0.85, 0.3, -0.08))
      ear = node(at.p.x * 0.92, at.p.y, at.p.z)
      rest = { x: 0, z: 0 }
      const a = fur(puff(EL * 0.52, 8, 31 + s), { part: 'ear', side: s })
      a.position.set(s * 0.3, -EL * 0.42, 0)
      a.scale.set(0.8, 1.15, 0.9)
      const c = fur(puff(EL * 0.46, 8, 41 + s), { part: 'ear', side: s })
      c.position.set(s * 0.7, -EL * 1.05, 0.2)
      ear.add(a, c)
    }
    ear.rotation.set(rest.x, 0, rest.z)
    head.add(ear)
    ears.push(ear)
    earRest.push(rest)
  }

  // ---------- 尾巴：锥形节串起来，节间是同半径圆头 ----------
  const tail: THREE.Object3D[] = []
  const tailBase = node(0, g * (isRabbit ? 0.3 : 0.38), -Lz + zc + g * (isRabbit ? 0.25 : 0.2))
  hips.add(tailBase)
  if (b.tail === 'stub') {
    const m = fur(puff(b.tailR * 1.15, 7, 5), { part: 'pom' })
    m.position.z = -0.6
    tailBase.add(m)
    tail.push(tailBase)
  } else if (b.tail === 'pom') {
    const stub = fur(alongZ(taper(b.tailR, b.tailR * 0.9, b.tailLen * 0.55, 8, { rings: 6 })), { part: 'tail' })
    tailBase.add(stub)
    const pom = fur(puff(b.tailR * 2.4, 8, 7), { part: 'pom' })
    pom.position.z = -b.tailLen * 0.75
    tailBase.add(pom)
    tail.push(tailBase)
  } else {
    const n = b.tail === 'curl' ? 4 : 5
    const segLen = b.tailLen / n
    // 每节的半径：猫细长渐尖，长毛猫 / 柴犬蓬松（中段最粗）
    const rad = (i: number) => {
      const t = i / n
      if (b.tail === 'curl') return b.tailR * (0.85 + 0.35 * Math.sin(PI * Math.min(1, t * 1.3))) * (t > 0.9 ? 0.6 : 1)
      if (b.fluff) return b.tailR * (0.75 + 0.35 * Math.sin(PI * t)) * (1 - t * 0.25)
      return b.tailR * (1.05 - t * 0.35)
    }
    let parent: THREE.Object3D = tailBase
    for (let i = 0; i < n; i++) {
      const seg = i === 0 ? tailBase : node(0, 0, -segLen)
      if (i > 0) parent.add(seg)
      const r0 = rad(i)
      const r1 = i === n - 1 ? rad(i + 1) * 0.75 : rad(i + 1)
      seg.add(fur(alongZ(taper(r0, r1, segLen, b.tail === 'curl' || b.fluff ? 10 : 8, { rings: 7 })), { part: 'tail' }))
      tail.push(seg)
      parent = seg
    }
  }

  const torso = { mesh: torsoMesh, pos: Float32Array.from(torsoGeo.attributes.position.array), nor: Float32Array.from(torsoGeo.attributes.normal.array), zr: reach * 0.95, key: '' }
  torsoGeo.computeBoundingSphere()
  torsoGeo.boundingSphere!.radius *= 1.08
  const rig: Rig = { breed: b, root, body, chest, hips, neck, head, ears, eyes, lids, legs, tail, standY, reach, earRest, torso }
  paint(rig, parts, coat, id)
  // 同一关节下、同材质的零件合成一个网格（头上的毛、口鼻、嘴线…；小腿 + 脚掌），减少 draw call。
  // 耳朵、睁 / 闭眼要单独动，先打上标记让 mergeMeshes 跳过（creatureStatic 里会去掉标记，静态版整体再合并）
  for (const o of [...ears, ...eyes, ...lids]) o.userData.joint = true
  mergeMeshes(head)
  for (const l of legs) mergeMeshes(l.lower)
  return rig
}

/** 沿 -y 长的几何体转成沿 -z（尾巴） */
function alongZ(g: THREE.BufferGeometry) {
  g.rotateX(PI / 2)
  return g
}

/** 卷毛绒球：一团鼓包（球面上叠几个随机方向的隆起），一个网格、一圈描边 */
function puff(r: number, lobes: number, seed: number) {
  const dirs: THREE.Vector3[] = []
  for (let i = 0; i < lobes; i++) {
    const a = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
    const u = a - Math.floor(a)
    const c = Math.sin(seed * 4.1414 + i * 17.17) * 24634.6345
    const v = c - Math.floor(c)
    // 均匀分布在球面上（斐波那契式错开 + 随机扰动）
    const y = 1 - (2 * (i + 0.5)) / lobes
    const rr = Math.sqrt(1 - y * y)
    const th = i * 2.39996 + u * 0.8
    dirs.push(new THREE.Vector3(Math.cos(th) * rr, y + (v - 0.5) * 0.2, Math.sin(th) * rr).normalize())
  }
  return surf(10, 7, (d, o) => {
    let k = 0
    for (const q of dirs) k = Math.max(k, Math.max(0, d.dot(q)) ** 4)
    o.copy(d).multiplyScalar(r * (0.86 + 0.18 * k))
  })
}

/** 卷毛 / 长毛：沿法线加一层起伏（贵宾的卷、长毛猫的蓬松） */
function fluffUp(g: THREE.BufferGeometry, amp: number, freq: number, seed: number) {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const n = fbm(x * freq, y * freq, z * freq, seed)
    const d = amp * (Math.abs(n - 0.5) * 2.4 - 0.3)
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d)
  }
  g.computeVertexNormals()
}

/**
 * 耳朵：从耳根（埋在头里）往 +y 长的三角锥，截面前平后圆（D 形）；顶端收成尖或圆头。
 * 内耳是贴在前平面上的一片薄锥，跟外耳同一条轮廓。spoon：兔耳那种中段最宽的勺形；down：朝下垂（垂耳）。
 */
function earGeo(w: number, d: number, hgt: number, o: { lean?: number; spoon?: boolean; down?: boolean; tip?: number; flat?: number } = {}) {
  const base = 0.12
  const flat = o.flat ?? 0.3
  const prof = (u: number) => {
    if (o.spoon) return Math.pow(Math.max(0, Math.sin(PI * (0.18 + 0.82 * u))), 0.55) * (u < 0.2 ? 0.8 + u : 1)
    return Math.pow(Math.max(0, 1 - u), o.tip ?? 0.85)
  }
  const ringAt = (t: number, sw: number, sd: number, off: number): { z: number; y: number; rx: number; ry: number } => {
    const k = t < base ? Math.sqrt(t / base) : 1
    const u = Math.max(0, (t - base) / (1 - base))
    const p = prof(u)
    return { z: (u - base * 1.5 * (t < base ? 1 - t / base : 0)) * hgt, y: (o.lean ?? 0) * u * u * hgt + off * d * p, rx: w * sw * k * p, ry: d * sd * k * p }
  }
  const outer = loft(11, 10, (t) => ringAt(t, 1, 1, 0), (a) => {
    const s = Math.sin(a)
    return [Math.cos(a), s < 0 ? s * flat : s]
  })
  // 内耳：沿同一轮廓、更窄更薄，中心往前平面挪到刚好露出来
  const inner = loft(8, 6, (t) => {
    const tt = 0.06 + t * 0.8
    const r = ringAt(tt, 0.62, 0.16, -flat * 0.92)
    const k = t < 0.1 ? Math.sqrt(t / 0.1) : t > 0.92 ? Math.sqrt(Math.max(0, (1 - t) / 0.08)) : 1
    return { ...r, rx: r.rx * k, ry: r.ry * k }
  })
  for (const g of [outer, inner]) {
    g.rotateX(-PI / 2) // 放样的 +z → +y，截面的 -y（前平面）→ +z
    if (o.down) g.rotateZ(PI) // 朝下垂，前平面还在前面
  }
  return { outer, inner }
}

// ---------- 毛色 ----------

/**
 * 按静止姿态（腿直、尾巴往后、头朝前）下每个顶点的位置算 mask。
 * p：root 坐标；hp：头部坐标 / head（头半径归一化）；n：root 坐标法线。
 */
function paint(rig: Rig, parts: Map<THREE.Mesh, Part>, coat: Coat, id: string) {
  const b = rig.breed
  const g = b.girth
  const h = b.head
  rig.root.updateMatrixWorld(true)
  const headInv = rig.head.matrixWorld.clone().invert()
  const tailBase = new THREE.Vector3().setFromMatrixPosition(rig.tail[0].matrixWorld)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const hp = new THREE.Vector3()
  const nm = new THREE.Matrix3()
  const sy = rig.standY
  const Lz = b.len * 0.5 + g * 0.3

  const belly = (ext = 0) => lin(-n.y + 0.55 * Math.max(0, n.z) * smooth(0.25, 0.85, p.z / Lz) + ext, 0.42, 4)
  const throat = () => lin(n.z * 0.8 - n.y * 0.6, 0.35, 3)
  const muzzle = (rx = 0.34, ry = 0.36, cy = -0.42) => (hp.z > 0.2 ? lin(1 - Math.hypot(hp.x / rx, (hp.y - cy) / ry), 0, 3) : 0)
  const chin = () => lin(-hp.y - 0.62 + Math.max(0, hp.z) * 0.15, 0, 4)
  const sock = (front: boolean, f = 1) => lin((front ? b.leg * 0.2 : b.leg * 0.28) * f - p.y, 0, 0.9)
  const tailT = () => clamp((tailBase.z - p.z) / Math.max(1, b.tailLen), 0, 1.2)

  for (const [mesh, info] of parts) {
    const pos = mesh.geometry.attributes.position
    const nor = mesh.geometry.attributes.normal
    const mask = mesh.geometry.attributes.mask as THREE.BufferAttribute
    nm.getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize()
      hp.copy(p).applyMatrix4(headInv).divideScalar(h)
      const onHead = info.part === 'head' || info.part === 'pad' || info.part === 'chin' || info.part === 'snout' || info.part === 'ear' || (info.part === 'pom' && p.y > sy + g * 0.5 && p.z > 0)
      let S = 0
      let A = 0
      let B = 0
      const bz = p.z
      switch (coat) {
        case 'tabby':
        case 'solid':
        case 'points': {
          const pt = coat === 'points'
          // 副色：肚皮、胸口、口鼻、下巴、白袜子（重点色只有肚皮略浅）
          if (info.part === 'torso') S = belly(pt ? -0.15 : 0)
          else if (info.part === 'neck') S = pt ? 0 : throat()
          else if (info.part === 'pad' || info.part === 'chin') S = pt ? 0 : 1
          else if (info.part === 'head') S = pt ? 0 : Math.max(muzzle(), chin())
          else if (info.part === 'leg' || info.part === 'paw') S = pt ? 0 : info.part === 'paw' ? 1 : sock(!!info.front)
          else if (info.part === 'pom') S = 1
          if (coat === 'tabby') {
            const k = 2 * PI
            if (info.part === 'torso' || (info.part === 'neck' && !onHead)) {
              const lam = g * 0.62
              const ph = (bz / lam) * k + 2.2 * fbm(p.x * 0.12, p.y * 0.12, p.z * 0.12, 4) + Math.abs(p.x) * 0.1
              const up = n.y + 0.3 - (info.part === 'neck' ? 0.25 : 0)
              A = Math.min(0.5 + 1.4 * (Math.sin(ph) - 0.12), lin(up, 0, 3))
              A = Math.max(A, lin(n.y - 0.86, 0, 10) * lin(-p.z, -Lz * 0.7, 1))
            } else if (info.part === 'head' || info.part === 'ear') {
              // 额头的「M」：三道竖纹；脸侧两道横纹
              const bars = Math.cos((hp.x * k) / 0.34) * smooth(0.2, 0.45, hp.y) * smooth(0.52, 0.36, Math.abs(hp.x)) * smooth(-0.3, 0.1, hp.z)
              const cheekL = Math.cos(((hp.y + 0.05) * k) / 0.3) * smooth(0.62, 0.85, Math.abs(hp.x)) * smooth(-0.45, -0.2, hp.y) * smooth(0.25, 0.05, hp.y)
              const back = Math.sin((hp.y * k) / 0.35 + hp.x) * smooth(0.0, -0.4, hp.z)
              A = Math.max(lin(bars, 0.55, 3), lin(cheekL, 0.4, 3), lin(back, 0.45, 3)) * (info.part === 'ear' ? 0 : 1)
            } else if (info.part === 'leg') {
              const outer = n.x * (info.side ?? 1)
              A = lin(Math.sin((p.y * k) / (b.leg * 0.26)), 0.35, 2.5) * lin(outer, -0.2, 3) * lin(p.y, b.leg * 0.3, 1)
            } else if (info.part === 'tail') {
              const t = tailT()
              A = Math.max(lin(Math.sin((t * b.tailLen * k) / (b.tailLen / 5.5)), 0.1, 2.5), lin(t, 0.86, 8))
            }
          }
          if (pt) {
            // 重点色：脸（口鼻往外一圈）、耳朵、脚、尾巴
            if (info.part === 'head') A = hp.z > -0.1 ? lin(1 - Math.hypot(hp.x / 0.62, (hp.y + 0.22) / 0.55), 0, 2.5) : 0
            else if (info.part === 'pad' || info.part === 'chin' || info.part === 'ear') A = 1
            else if (info.part === 'leg' || info.part === 'paw') A = lin(b.leg * 0.55 - p.y, 0, 0.5)
            else if (info.part === 'tail') A = lin(tailT(), 0.06, 8)
          }
          break
        }
        case 'calico':
        case 'cow': {
          const cow = coat === 'cow'
          const f = cow ? 0.065 : 0.085
          const fa = fbm(p.x * f, p.y * f, p.z * f, cow ? 5 : 3)
          const fb = fbm(p.x * f + 17, p.y * f, p.z * f, 9)
          const notBelly = info.part === 'torso' ? lin(n.y + 0.25, 0, 3) : 1
          if (onHead) {
            const wob = (fbm(hp.x * 2, hp.y * 2, hp.z * 2, 2) - 0.5) * 0.5
            const mz = info.part === 'pad' || info.part === 'chin' ? 0 : 1 - lin(1 - Math.hypot(hp.x / 0.42, (hp.y + 0.36) / 0.36), 0, 3)
            A = lin(-hp.x * 1.2 + hp.y * 0.9 + wob, 0.3, 4) * mz
            B = cow ? 0 : lin(hp.x * 1.2 + hp.y * 1.1 + wob, 0.85, 4) * mz
          } else if (info.part === 'tail') {
            const t = tailT()
            A = cow ? lin(t, 0.55, 6) : lin(0.45 - t, 0, 6)
            B = cow ? 0 : lin(t, 0.45, 6)
          } else {
            A = Math.min(lin(fa, cow ? 0.58 : 0.56, 7), notBelly)
            B = cow ? 0 : Math.min(lin(fb, 0.6, 7), notBelly)
            if (info.part === 'paw') A = B = 0
          }
          break
        }
        case 'shiba': {
          // 白色里毛（裏白）：两颊、口吻下半、喉咙、胸口、肚皮、四肢内侧和脚、尾巴下面；眉毛上两个白点
          if (info.part === 'head') {
            const brow = Math.min(...[-1, 1].map((s) => Math.hypot(hp.x - s * 0.36, hp.y - 0.4)))
            S = Math.max(lin(-hp.y + (hp.z - 0.55) * 0.9 - 0.02, 0, 4), hp.z > 0.3 ? lin(0.1 - brow, 0, 10) : 0)
          } else if (info.part === 'snout') S = lin(0.45 - n.y, 0, 3)
          else if (info.part === 'neck') S = throat()
          else if (info.part === 'torso') S = belly(0.12)
          else if (info.part === 'leg') S = Math.max(lin(-n.z * 0.7 - n.x * (info.side ?? 1) * 0.7, 0.15, 3), sock(!!info.front, 0.9))
          else if (info.part === 'paw') S = 1
          else if (info.part === 'tail') S = lin(-n.y, 0.05, 3)
          break
        }
        case 'tan': {
          // 黑棕：口吻、眉点、胸前、小腿、尾巴根下面是棕色
          if (info.part === 'head') {
            const brow = Math.min(...[-1, 1].map((s) => Math.hypot(hp.x - s * 0.34, hp.y - 0.4)))
            S = Math.max(hp.z > 0.3 ? lin(0.1 - brow, 0, 10) : 0, hp.z > 0.2 ? lin(-hp.y - 0.3 + hp.z * 0.2, 0, 4) : 0)
          } else if (info.part === 'snout') S = lin(0.6 - n.y, 0, 3)
          else if (info.part === 'neck') S = lin(n.z * 0.8 - n.y * 0.6, 0.7, 3)
          else if (info.part === 'torso') S = lin(n.z * 0.9 - n.y * 0.5, 0.75, 4) * lin(p.z, Lz * 0.5, 1)
          else if (info.part === 'leg' || info.part === 'paw') S = lin(b.leg * 0.45 - p.y, 0, 1)
          else if (info.part === 'tail') S = lin(-n.y, 0.3, 3) * lin(0.3 - tailT(), 0, 6)
          break
        }
        case 'poodle':
          if (info.part === 'snout') S = 1
          break
        case 'dutch':
          break
      }
      // 兔子：肚皮、口鼻、尾巴绒球是副色；荷兰兔 / 熊猫兔：后半身、耳朵、眼圈是花纹色，脸中间一道白
      if (b.kind === 'rabbit') {
        if (info.part === 'torso') S = belly()
        else if (info.part === 'pad' || info.part === 'chin' || info.part === 'pom') S = 1
        else if (info.part === 'paw') S = info.front ? 0.0 : 0
        if (coat === 'dutch') {
          const wav = (fbm(p.x * 0.15, p.y * 0.15, 0, 7) - 0.5) * g * 0.5
          if (info.part === 'torso' || info.part === 'leg' || info.part === 'paw') A = info.part !== 'torso' && info.front ? 0 : lin(-p.z + wav, g * 0.05, 1)
          if (info.part === 'torso') S = Math.min(S, 1 - A)
          if (info.part === 'ear') A = 1
          if (info.part === 'head') A = Math.max(hp.z > -0.3 ? lin(1 - Math.hypot((Math.abs(hp.x) - 0.52) / 0.32, (hp.y - 0.14) / 0.36), 0, 3) : 0, lin(-hp.z, 0.35, 3))
        }
      }
      if (id === 'poodle' && info.part === 'pom') S = 0
      mask.setXYZ(i, S, A, B)
    }
    mask.needsUpdate = true
  }
}

// ---------- 姿势 ----------

/** 一组关节角；混合时逐项插值 */
export interface Pose {
  /** body 高度偏移（相对站立） */
  y: number
  /** 抬头为正 */
  pitch: number
  /** 向 -x 侧倾为正（蜷着侧躺） */
  roll: number
  /** 脊柱弯曲：头和尾巴一起往 +x 侧弯 */
  bend: number
  /** 脖子俯仰（抬头为正，相对躯干） */
  neck: number
  headYaw: number
  headRoll: number
  /** 四条腿：FL, FR, HL, HR 的上节 / 下节 */
  u0: number
  u1: number
  u2: number
  u3: number
  l0: number
  l1: number
  l2: number
  l3: number
  /** 尾巴根抬起（向上为正） */
  tail: number
  /** 之后每节继续上翘 */
  tailCurl: number
  /** 每节往 +x 侧绕（蜷尾） */
  tailSide: number
  /** 眼睛睁开程度 0..1 */
  eyes: number
  /** 耳朵往后贴（0 = 竖着） */
  ear: number
}

export const POSE_KEYS = ['y', 'pitch', 'roll', 'bend', 'neck', 'headYaw', 'headRoll', 'u0', 'u1', 'u2', 'u3', 'l0', 'l1', 'l2', 'l3', 'tail', 'tailCurl', 'tailSide', 'eyes', 'ear'] as const

export type PoseName = 'stand' | 'sit' | 'loaf' | 'lie' | 'curl' | 'stretch' | 'groom' | 'eat' | 'sniff'

function tailRest(b: Breed): Pick<Pose, 'tail' | 'tailCurl' | 'tailSide'> {
  if (b.tail === 'curl') return { tail: 1.7, tailCurl: 0.75, tailSide: 0 }
  if (b.tail === 'pom') return { tail: 0.9, tailCurl: 0, tailSide: 0 }
  if (b.tail === 'long') return { tail: 0.15, tailCurl: -0.05, tailSide: 0 }
  if (b.tail === 'stub') return { tail: 0.2, tailCurl: 0, tailSide: 0 }
  return { tail: 0.35, tailCurl: 0.12, tailSide: 0 }
}

const groundCache = new Map<string, number>()
const tmpBox = new THREE.Box3()

/**
 * 按体型算出各个静态姿势（腿着地、肚子贴地等都按尺寸推出来，不同品种通用）。
 * 最后再实测一次：把这个姿势下模型的最低点对齐地面（结果按品种 + 姿势缓存）。
 */
export function poseFor(b: Breed, name: PoseName): Pose {
  const p = rawPose(b, name)
  const key = `${b.label}|${name}`
  let fix = groundCache.get(key)
  if (fix === undefined) {
    groundCache.set(key, 0)
    const id = Object.keys(BREEDS).find((k) => BREEDS[k] === b) ?? 'cat'
    const rig = buildCreature(id, ['#888888'])
    applyPose(rig, p)
    rig.root.updateMatrixWorld(true)
    tmpBox.setFromObject(rig.root, true)
    fix = Number.isFinite(tmpBox.min.y) ? -tmpBox.min.y : 0
    groundCache.set(key, fix)
  }
  p.y += fix
  return p
}

function rawPose(b: Breed, name: PoseName): Pose {
  const J = b.leg
  const g = b.girth
  const a = b.len * 0.32
  const base: Pose = { y: 0, pitch: 0, roll: 0, bend: 0, neck: 0.25, headYaw: 0, headRoll: 0, u0: 0, u1: 0, u2: 0, u3: 0, l0: 0, l1: 0, l2: 0, l3: 0, ...tailRest(b), eyes: 1, ear: 0 }
  const rabbit = b.kind === 'rabbit'
  // 肚子贴地时 body 的高度偏移
  const lieY = g * 0.85 - (J + g * 0.4)
  // 趴着时前腿往前伸、爪子刚好着地的角度
  const reachDown = -(PI / 2 - Math.asin(clamp((g * 0.45 - b.legR * 0.7) / J, 0, 0.9)))
  const tuckF = { u: -1.0, l: 2.4 }
  const tuckH = { u: -1.25, l: 2.6 }
  switch (name) {
    case 'stand':
      if (rabbit) return { ...rawPose(b, 'loaf'), neck: 0.35, eyes: 1 }
      return base
    case 'sniff':
      // 兔子：趴着的样子低头嗅（蹦跳也是从这个姿势起跳）
      if (rabbit) return { ...rawPose(b, 'stand'), neck: -0.25, pitch: -0.08 }
      return { ...base, neck: -0.75, pitch: -0.08, y: -J * 0.05, u0: -0.1, u1: -0.1, tail: base.tail + 0.2 }
    case 'eat':
      if (rabbit) return { ...rawPose(b, 'stand'), neck: -0.6, pitch: -0.15, eyes: 0.6 }
      return { ...base, neck: -1.15, pitch: -0.22, y: -J * 0.16, u0: -0.35, u1: -0.35, l0: 0.55, l1: 0.55, u2: 0.15, u3: 0.15, eyes: 0.6 }
    case 'sit': {
      if (rabbit) return { ...rawPose(b, 'loaf'), pitch: 0.35, y: rawPose(b, 'loaf').y + g * 0.2, neck: 0.1, u0: 0.2, u1: 0.2, l0: 0, l1: 0 }
      const p = clamp(Math.asin(clamp((J - 0.55 * g - 0.5) / (2 * a), -1, 1)), 0.15, 0.72)
      const y = -a * Math.sin(p)
      const hu = -1.45 + p
      const hl = 1.4 + 1.45
      return { ...base, y, pitch: p, neck: 0.25 - p * 0.9, u0: p - 0.06, u1: p - 0.06, u2: hu, u3: hu, l2: hl, l3: hl, tail: -0.1 - p, tailCurl: 0.05, tailSide: -0.25 }
    }
    case 'loaf':
      // 兔子：后脚平放在大腿下面（脚掌朝前贴地），前爪收在胸口下
      if (rabbit) return { ...base, y: lieY, neck: 0.15, u0: -0.7, u1: -0.7, l0: 1.4, l1: 1.4, u2: -1.35, u3: -1.35, l2: 1.35, l3: 1.35, tail: 0.2, tailCurl: 0, tailSide: 0, eyes: 0.55 }
      return { ...base, y: lieY, neck: 0.15, u0: tuckF.u, u1: tuckF.u, l0: tuckF.l, l1: tuckF.l, u2: tuckH.u, u3: tuckH.u, l2: tuckH.l, l3: tuckH.l, tail: rabbit ? 0.2 : -0.05, tailCurl: 0, tailSide: rabbit ? 0 : -0.35, eyes: 0.55 }
    case 'lie':
      return { ...base, y: lieY, neck: 0.05, u0: reachDown, u1: reachDown + 0.08, l0: 0, l1: 0, u2: tuckH.u, u3: tuckH.u, l2: tuckH.l, l3: tuckH.l, tail: b.tail === 'curl' ? 1.2 : -0.1, tailSide: b.tail === 'curl' ? 0 : -0.15, eyes: 0.7 }
    case 'curl':
      if (rabbit) return { ...rawPose(b, 'loaf'), y: lieY - g * 0.05, neck: -0.15, eyes: 0, ear: 0.6 }
      return {
        ...base,
        y: lieY - g * 0.08,
        roll: 0.5,
        bend: 0.72,
        neck: -0.5,
        headYaw: 1.25,
        headRoll: 0.35,
        u0: -0.9,
        u1: -0.7,
        l0: 2.2,
        l1: 2.0,
        u2: -1.2,
        u3: -1.1,
        l2: 2.5,
        l3: 2.4,
        // 尾巴贴地绕到身前
        tail: b.tail === 'curl' ? 0.6 : -0.4,
        tailCurl: b.tail === 'curl' ? 0.3 : 0,
        tailSide: b.tail === 'curl' ? -0.2 : -0.72,
        eyes: 0,
        ear: 0.25,
      }
    case 'stretch': {
      const p = 0.38
      const y = -a * Math.sin(p)
      return { ...base, y, pitch: -p, neck: 0.75, u0: -1.2, u1: -1.2, l0: 0.15, l1: 0.15, u2: -p, u3: -p, tail: 1.3, tailCurl: 0.1, eyes: 0.15, ear: 0.3 }
    }
    case 'groom': {
      const s = rawPose(b, 'sit')
      if (rabbit) return { ...s, pitch: 0.75, y: s.y + g * 0.35, neck: -0.6, u0: -1.6, u1: -1.6, l0: -0.6, l1: -0.6, eyes: 0.2 }
      return { ...s, neck: -0.7 - s.pitch * 0.4, headYaw: 0.35, headRoll: 0.25, u0: s.pitch - 1.55, l0: -1.6, eyes: 0.15 }
    }
  }
}

export function lerpPose(cur: Pose, tgt: Pose, k: number) {
  for (const key of POSE_KEYS) cur[key] += (tgt[key] - cur[key]) * k
}

export const clonePose = (p: Pose): Pose => ({ ...p })

/**
 * 叠加在静态姿势上的动作：步态（gait 0..1 的权重、phase 相位）、呼吸、摇尾巴、东张西望、抖耳朵。
 */
export interface Motion {
  gait: number
  phase: number
  /** 小跑：步幅大一些 */
  run: number
  breathe: number
  wag: number
  look: number
  lick: number
  earFlick: number
  t: number
}

export const emptyMotion = (): Motion => ({ gait: 0, phase: 0, run: 0, breathe: 0, wag: 0, look: 0, lick: 0, earFlick: 0, t: 0 })

/** 把姿势和动作写进骨架 */
export function applyPose(r: Rig, p: Pose, m: Motion = emptyMotion()) {
  const b = r.breed
  const J = b.leg
  const rabbit = b.kind === 'rabbit'
  let y = p.y
  let pitch = p.pitch
  let roll = p.roll
  let neck = p.neck
  let headYaw = p.headYaw
  const u = [p.u0, p.u1, p.u2, p.u3]
  const l = [p.l0, p.l1, p.l2, p.l3]
  let tailYaw = 0

  if (m.gait > 0.001) {
    const w = m.gait
    const ph = m.phase
    if (rabbit) {
      // 兔子：后腿一起蹬，身体划一道弧
      const s = Math.sin(ph)
      const air = Math.max(0, s)
      y += air * J * 1.1 * w
      pitch += Math.cos(ph) * 0.22 * w
      u[2] += air * 1.3 * w
      u[3] += air * 1.3 * w
      l[2] += -air * 1.6 * w
      l[3] += -air * 1.6 * w
      u[0] += -air * 0.9 * w
      u[1] += -air * 0.9 * w
      l[0] += -air * 0.5 * w
      l[1] += -air * 0.5 * w
    } else {
      // 对角小跑：FL + HR 一组，FR + HL 一组
      const A = (0.42 + 0.22 * m.run) * w
      const off = [0, PI, PI, 0]
      for (let i = 0; i < 4; i++) {
        const q = ph + off[i]
        u[i] += A * Math.sin(q)
        // 往前摆的半程抬脚（膝盖弯）
        const lift = Math.max(0, -Math.cos(q))
        l[i] += (i < 2 ? 0.95 : 0.75) * lift * w
      }
      y += (Math.abs(Math.cos(ph)) - 0.5) * J * 0.06 * w
      roll += Math.sin(ph) * 0.03 * w
      neck += Math.sin(ph * 2) * 0.05 * w
      tailYaw += Math.sin(ph) * 0.18 * w
    }
  }
  // 呼吸：躯干微微起伏
  const br = Math.sin(m.t * (2 * PI) / 3.2) * m.breathe
  bendTorso(r, p.bend, br)
  // 舔毛：头一点一点
  neck += Math.max(0, Math.sin(m.t * 9)) * 0.14 * m.lick
  // 东张西望
  headYaw += (Math.sin(m.t * 0.9) * 0.7 + Math.sin(m.t * 2.3) * 0.15) * m.look
  // 摇尾巴
  tailYaw += Math.sin(m.t * (b.kind === 'dog' ? 13 : 3)) * (b.kind === 'dog' ? 0.45 : 0.3) * m.wag

  r.body.position.y = r.standY + y
  r.body.rotation.set(-pitch, 0, roll)
  r.chest.rotation.y = p.bend
  r.hips.rotation.y = -p.bend
  r.neck.rotation.set(-neck, headYaw * 0.45, 0, 'YXZ')
  r.head.rotation.set(0, headYaw * 0.55, p.headRoll, 'YXZ')
  for (let i = 0; i < 4; i++) {
    r.legs[i].upper.rotation.x = u[i]
    r.legs[i].lower.rotation.x = l[i]
  }
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i]
    const lift = i === 0 ? p.tail : p.tailCurl
    seg.rotation.set(lift, p.tailSide + tailYaw * (i === 0 ? 0.6 : 0.35), 0, 'YXZ')
  }
  for (let i = 0; i < r.ears.length; i++) {
    const rest = r.earRest[i]
    const s = i === 0 ? -1 : 1
    const flick = i === 1 ? m.earFlick : m.earFlick * 0.3
    r.ears[i].rotation.set(rest.x + p.ear * 0.6 + flick * 0.5, 0, rest.z - s * p.ear * 0.4)
  }
  const shut = p.eyes < 0.22
  for (let i = 0; i < r.eyes.length; i++) {
    r.eyes[i].visible = !shut
    r.eyes[i].scale.y = Math.max(0.3, p.eyes)
    r.lids[i].visible = shut
  }
}

/**
 * 躯干变形：每个顶点按 z 在 hips（后）和 chest（前）之间平滑过渡，绕 y 转过相应的角度（脊柱弯成一条弧），
 * 呼吸时胸腔起伏比腹部大一点。参数没变就不重算。
 */
function bendTorso(r: Rig, bend: number, br: number) {
  const T = r.torso
  const key = `${bend.toFixed(4)}|${br.toFixed(4)}`
  if (key === T.key) return
  T.key = key
  const geo = T.mesh.geometry
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const P = T.pos
  const N = T.nor
  const zr = T.zr
  const pa = pos.array as Float32Array
  const na = nor.array as Float32Array
  for (let i = 0; i < pos.count; i++) {
    const x = P[i * 3]
    const y = P[i * 3 + 1]
    const z = P[i * 3 + 2]
    let w = Math.max(0, Math.min(1, (z + zr) / (2 * zr)))
    w = w * w * (3 - 2 * w)
    const a = bend * (2 * w - 1)
    const c = Math.cos(a)
    const s = Math.sin(a)
    const sx = 1 + br * (0.02 + 0.006 * w)
    const sy = 1 + br * (0.03 + 0.012 * w)
    const X = x * sx
    const Y = y * sy
    pa[i * 3] = X * c + z * s
    pa[i * 3 + 1] = Y
    pa[i * 3 + 2] = -X * s + z * c
    const nx = N[i * 3]
    const nz = N[i * 3 + 2]
    na[i * 3] = nx * c + nz * s
    na[i * 3 + 1] = N[i * 3 + 1]
    na[i * 3 + 2] = -nx * s + nz * c
  }
  pos.needsUpdate = true
  nor.needsUpdate = true
}

/** 静态展示用：摆好姿势、合并网格、加描边 */
export function creatureStatic(breedId: string, pal: string[], pose: PoseName) {
  const rig = buildCreature(breedId, pal)
  applyPose(rig, poseFor(rig.breed, pose), { ...emptyMotion(), breathe: 0 })
  rig.root.traverse((o) => delete o.userData.joint)
  return rig.root
}


// ---------- 扫地机器人 ----------

export interface VacuumParts {
  root: THREE.Group
  brushes: THREE.Object3D[]
  ledOn: THREE.Object3D
  ledOff: THREE.Object3D
}

/** 扫地机器人：圆盘机身、前保险杠、激光雷达罩、两个侧刷（会转）、状态灯。pal = [机身, 保险杠, 雷达罩] */
export function vacuumModel(pal: string[]): VacuumParts {
  const [main = '#fbf7f1', sub = '#a8d4f4', acc = '#5a4646'] = pal
  const root = new THREE.Group()
  root.add(puck(17, 7, main, { y: 1 }))
  root.add(torus(17, 1.3, sub, { y: 4, rx: PI / 2 }, PI))
  root.add(puck(11, 1.2, shade(main, -0.08), { y: 7.6 }))
  root.add(cyl(3.6, 3.6, 1.6, acc, { y: 8.6, z: -6 }, 20))
  root.add(rbox(4.5, 0.6, 1.4, shade(main, -0.25), { y: 8.4, z: 5 }, 0.3))
  // 状态灯：亮 / 暗两个版本切换（闪烁），不共享材质
  const ledOn = ball(1, '#7fd8ff', { y: 8.9, z: 9 }, [1.6, 0.45, 0.8])
  ledOn.material = toon('#7fd8ff', { emissive: 0.9 })
  ledOn.userData.noOutline = true
  const ledOff = ball(1, '#9fb4c7', { y: 8.9, z: 9 }, [1.6, 0.45, 0.8])
  ledOff.userData.noOutline = true
  ledOff.visible = false
  root.add(ledOn, ledOff)
  // 侧刷：前方两侧，贴地转
  const brushes: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const br = node(s * 11, 0.6, 10)
    for (let k = 0; k < 3; k++) {
      const arm = capsule(0.25, 4.2, acc)
      arm.rotation.z = PI / 2
      arm.position.set(2.3, 0, 0)
      const holder = node()
      holder.rotation.y = (k / 3) * PI * 2
      holder.add(arm)
      arm.userData.noOutline = true
      br.add(holder)
    }
    br.add(cyl(1.1, 1.1, 0.8, acc, { y: -0.3 }, 10))
    root.add(br)
    brushes.push(br)
  }
  // 两个轮子（侧面露一点）
  for (const s of [-1, 1]) root.add(cyl(3, 3, 1.6, '#3d3f44', { x: s * 12.5, y: 3, rz: PI / 2 }, 14))
  return { root, brushes, ledOn, ledOff }
}

// ---------- Kachaka（家用自主搬运机器人）+ 专用架子 ----------

export interface KachakaParts {
  root: THREE.Group
  /** 驮着的架子（放在它上面的东西跟着它走） */
  shelf: THREE.Group
  ledOn: THREE.Object3D
  ledOff: THREE.Object3D
  wheels: THREE.Object3D[]
  casters: THREE.Object3D[]
}

/** Kachaka 尺寸（cm）：本体 24 × 38.7 × 12.5，架子 32.8 × 48.8 × 43.5 / 71.7，前进方向沿长边 */
export const KACHAKA = { w: 24, d: 38.7, h: 12.5, shelfW: 32.8, shelfD: 48.8, dock: { w: 21.5, d: 10.5, h: 9.6 } }

/** 架子各层板的高度（离地）：最下层板底下留出机器人钻进去的空间 */
export function kachakaLevels(tiers: 2 | 3) {
  return tiers === 2 ? [16, 43.5] : [16, 44, 71.7]
}

/**
 * Kachaka 本体 + 架子，原点在机器人中心的地面上，前方朝 +z。
 * pal = [机身, 架子框, 层板, 侧板]；tiers = 0 表示不带架子（只有本体）。
 */
export function kachakaModel(pal: string[], tiers: 0 | 2 | 3): KachakaParts {
  const [body = '#f4f4f2', frame = '#f7f5f0', board = '#d9b98c', panel = '#9fb4c7'] = pal
  const root = new THREE.Group()
  const K = KACHAKA
  // 本体：低矮的圆角方盒，前脸一条深色传感器窗，顶上对接销
  root.add(rbox(K.w, K.h - 2, K.d, body, { y: 2 }, 3.5))
  root.add(rbox(K.w - 2, 1.2, K.d - 2, shade(body, -0.06), { y: K.h - 0.3 }, 0.5))
  root.add(rbox(K.w - 5, 3.2, 1, '#3e3a39', { y: 5, z: K.d / 2 - 0.3 }, 0.5))
  root.add(rbox(1, 3.2, K.d * 0.55, '#3e3a39', { x: K.w / 2 - 0.3, y: 5 }, 0.4))
  root.add(rbox(1, 3.2, K.d * 0.55, '#3e3a39', { x: -K.w / 2 + 0.3, y: 5 }, 0.4))
  root.add(cyl(1.8, 2, 1.4, '#6f737a', { y: K.h + 0.9 }, 16))
  const ledOn = rbox(8, 0.8, 0.5, '#7fe0a8', { y: 9, z: K.d / 2 + 0.05 }, 0.25)
  ledOn.material = toon('#7fe0a8', { emissive: 0.9 })
  ledOn.userData.noOutline = true
  const ledOff = rbox(8, 0.8, 0.5, '#bfc9c2', { y: 9, z: K.d / 2 + 0.05 }, 0.25)
  ledOff.userData.noOutline = true
  ledOff.visible = false
  root.add(ledOn, ledOff)
  const wheels: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const w = node(s * (K.w / 2 - 1), 2.6, 0)
    w.add(cyl(2.6, 2.6, 1.6, '#3d3f44', { rz: PI / 2 }, 14))
    root.add(w)
    wheels.push(w)
  }

  const shelf = new THREE.Group()
  const casters: THREE.Object3D[] = []
  if (tiers) {
    const lv = kachakaLevels(tiers)
    const top = lv[lv.length - 1]
    const W = K.shelfW
    const D = K.shelfD
    const post = 2.2
    // 四根立柱 + 底部脚轮
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (W / 2 - post / 2)
        const z = sz * (D / 2 - post / 2)
        shelf.add(rbox(post, top - 4.5, post, frame, { x, y: 4.5 }, 0.6))
        const c = node(x, 2.2, z)
        c.add(ball(2, '#5b5853', {}, [0.7, 1, 1]))
        shelf.add(rbox(2.6, 1.2, 2.6, frame, { x, y: 4.2, z }, 0.4))
        shelf.add(c)
        casters.push(c)
      }
    // 层板（底下的横梁让机器人钻进去）
    for (const y of lv) shelf.add(rbox(W, 1.8, D, board, { y: y - 1.8 }, 0.7))
    for (const sz of [-1, 1]) shelf.add(rbox(W - post * 2, 2, 1.6, frame, { y: 6, z: sz * (D / 2 - 0.8) }, 0.4))
    // 侧板（两侧有色挡板）+ 顶层的小围边
    for (const sx of [-1, 1]) {
      shelf.add(rbox(0.8, lv[1] - lv[0] - 6, D - post * 2 - 1, panel, { x: sx * (W / 2 + 0.2), y: lv[0] + 2 }, 0.3))
      shelf.add(rbox(0.8, 3, D - post * 2, frame, { x: sx * (W / 2 - post / 2), y: top }, 0.3))
    }
    for (const sz of [-1, 1]) shelf.add(rbox(W - post * 2, 3, 0.8, frame, { y: top, z: sz * (D / 2 - post / 2) }, 0.3))
    root.add(shelf)
  }
  return { root, shelf, ledOn, ledOff, wheels, casters }
}

/** Kachaka 充电座：低矮的楔形底座，正面（+z）两片充电触点；原点在底面中心 */
export function kachakaDock(color: string) {
  const g = new THREE.Group()
  const D = KACHAKA.dock
  g.add(rbox(D.w, D.h, D.d, color, {}, 2.5))
  g.add(rbox(D.w + 2, 1, D.d + 5, shade(color, -0.08), { z: 2 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(3, 1.4, 0.6, '#c3c7cc', { x: s * 4, y: 2.5, z: D.d / 2 }, 0.3))
  g.add(noOL(rbox(4, 0.6, 0.4, '#7fe0a8', { y: D.h - 2, z: D.d / 2 + 0.05 }, 0.2)))
  return g
}

/** 静态展示版：合并 + 描边由 furnitureModel 统一做；这里把会跑开的部分标出来 */
export function markActorPart<T extends THREE.Object3D>(o: T) {
  o.userData.actorPart = true
  return o
}

/** 活动角色用：给模型加描边、开阴影接收、关投影（阴影贴图不逐帧重画） */
export function finishActorModel(root: THREE.Object3D) {
  addOutlines(root)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = false
      m.receiveShadow = true
    }
  })
}

export { mergeMeshes }
