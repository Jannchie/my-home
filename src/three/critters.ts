// 会动的角色模型：猫、狗、兔子的分层骨架（Object3D 关节 + toon 体素），扫地机器人和 Kachaka（+ 专用架子）。
// 素材库里的静态展示版（packs/actors-pack.ts）和沙盘里活动的角色（actors.ts）共用这里的建模函数，长得一模一样。
//
// 坐标约定和素材一致：单位 cm，原点在地面，头朝 +z。
// 骨架：root → body（躯干枢轴，站立时在腿关节上方）→ chest / hips（前后半身，绕 y 轴反向转就是「蜷起来」）
//   chest → 两条前腿（upper → lower → 爪）、neck → head（耳朵、眼睛、吻部）
//   hips  → 两条后腿、尾巴（若干节串起来）
// 关节角都用 rotation.x：腿的 upper / lower 正值 = 脚往后（-z）摆，负值 = 往前。
// 描边由 addOutlines 加在每个网格上（外壳是网格的子节点），所以关节转动时描边跟着走。

import * as THREE from 'three'
import { addOutlines, ball, capsule, cyl, mergeMeshes, puck, rbox, shade, toon, torus } from './toon'

const PI = Math.PI
const INK = '#3a2a2a'
const PINK = '#ff9db0'
const NOSE_PINK = '#f28a9b'

export type CreatureKind = 'cat' | 'dog' | 'rabbit'
export type EarType = 'cat' | 'prick' | 'flop' | 'pom' | 'bunny' | 'lop'
export type TailType = 'cat' | 'curl' | 'pom' | 'stub' | 'long'

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
  /** 卷毛 / 长毛：身上加一圈绒球 */
  fluff?: boolean
  neck: number
  /** 活动时的碰撞半径 */
  radius: number
  /** 走路 / 小跑速度 cm/s */
  walk: number
  run: number
}

export const BREEDS: Record<string, Breed> = {
  cat: { kind: 'cat', label: '短毛猫', len: 30, girth: 8.5, leg: 13, legR: 2.1, head: 7.2, snout: 0, ear: 'cat', ear_: 3.6, tail: 'cat', tailLen: 26, tailR: 1.5, neck: 4, radius: 14, walk: 32, run: 70 },
  'cat-long': { kind: 'cat', label: '长毛猫', len: 32, girth: 10.5, leg: 12, legR: 2.6, head: 8, snout: 0, ear: 'cat', ear_: 3.4, tail: 'cat', tailLen: 26, tailR: 3, fluff: true, neck: 4, radius: 16, walk: 28, run: 60 },
  kitten: { kind: 'cat', label: '小猫', len: 19, girth: 6, leg: 8.5, legR: 1.6, head: 6.4, snout: 0, ear: 'cat', ear_: 3.2, tail: 'cat', tailLen: 15, tailR: 1.2, neck: 3, radius: 11, walk: 30, run: 65 },
  shiba: { kind: 'dog', label: '柴犬', len: 40, girth: 11, leg: 22, legR: 3, head: 9.5, snout: 6, ear: 'prick', ear_: 5, tail: 'curl', tailLen: 18, tailR: 3, neck: 6, radius: 22, walk: 45, run: 95 },
  poodle: { kind: 'dog', label: '玩具贵宾', len: 26, girth: 8, leg: 16, legR: 2.2, head: 7.5, snout: 4.5, ear: 'pom', ear_: 4.5, tail: 'pom', tailLen: 8, tailR: 1.6, fluff: true, neck: 5, radius: 15, walk: 38, run: 80 },
  dachshund: { kind: 'dog', label: '腊肠犬', len: 44, girth: 8.5, leg: 9, legR: 2.4, head: 7.5, snout: 7, ear: 'flop', ear_: 6, tail: 'long', tailLen: 20, tailR: 1.6, neck: 5, radius: 20, walk: 34, run: 70 },
  rabbit: { kind: 'rabbit', label: '立耳兔', len: 20, girth: 9, leg: 6, legR: 1.8, head: 6.8, snout: 0, ear: 'bunny', ear_: 10, tail: 'stub', tailLen: 3, tailR: 3, neck: 2.5, radius: 13, walk: 35, run: 60 },
  'rabbit-lop': { kind: 'rabbit', label: '垂耳兔', len: 21, girth: 9.5, leg: 6, legR: 1.8, head: 7.2, snout: 0, ear: 'lop', ear_: 9, tail: 'stub', tailLen: 3, tailR: 3, neck: 2.5, radius: 13, walk: 32, run: 55 },
}

// ---------- 小工具 ----------

const capCache = new Map<string, THREE.SphereGeometry>()
/** 球冠贴片（花色斑块）：半径 r、张角 theta 的一块球面，绕 +y 轴；不描边 */
function cap(r: number, theta: number, color: string, at: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number }, scale: [number, number, number]) {
  const key = `${r.toFixed(1)},${theta.toFixed(2)}`
  let g = capCache.get(key)
  if (!g) {
    g = new THREE.SphereGeometry(r, 24, 10, 0, PI * 2, 0, theta)
    g.userData.shared = true
    capCache.set(key, g)
  }
  const m = new THREE.Mesh(g, toon(color))
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  m.scale.set(...scale)
  m.userData.noOutline = true
  m.receiveShadow = true
  return m
}

/** 从关节往下长的一节肢体：两端圆头的中心分别在 y = 0 和 y = -len */
function limbDown(r: number, len: number, color: string) {
  const m = capsule(r, Math.max(0.05, len), color)
  m.position.set(0, -len / 2, 0)
  return m
}

/** 沿 -z 方向长的一节（尾巴）：两端圆头中心在 z = 0 和 z = -len */
function limbBack(r: number, len: number, color: string) {
  const m = capsule(r, Math.max(0.05, len), color)
  m.position.set(0, 0, -len / 2)
  m.rotation.x = PI / 2
  return m
}

const node = (x = 0, y = 0, z = 0) => {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  return o
}

const noOL = <T extends THREE.Object3D>(o: T) => {
  o.userData.noOutline = true
  return o
}

/** 方锥（猫耳、柴犬耳）：底边半宽 r、高 h，一个面朝前 */
function pyramid(r: number, h: number, color: string) {
  const m = cyl(0.25, r, h, color, {}, 4)
  m.rotation.y = PI / 4
  return m
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
  eyes: THREE.Object3D[]
  /** FL, FR, HL, HR */
  legs: Leg[]
  tail: THREE.Object3D[]
  /** 站立时 body 的高度 */
  standY: number
  /** 前后腿关节离躯干中心的前后距离 */
  reach: number
  /** 耳朵的默认姿态（抖耳朵在它上面加） */
  earRest: { x: number; z: number }[]
}

/**
 * 搭一只动物。pal = [主色, 副色（肚皮 / 吻部 / 爪）, 斑块 A, 斑块 B]；斑块和主色相同就是纯色。
 * 狗的第三色是项圈色（没有斑块）。
 */
export function buildCreature(breedId: string, pal: string[]): Rig {
  const b = BREEDS[breedId] ?? BREEDS.cat
  const main = pal[0] ?? '#f4a259'
  const sub = pal[1] ?? shade(main, 0.25)
  const isDog = b.kind === 'dog'
  // 狗的第三色是项圈，不当斑块用
  const patchA = isDog ? main : pal[2] ?? main
  const patchB = isDog ? main : pal[3] ?? patchA
  const isRabbit = b.kind === 'rabbit'
  const g = b.girth
  const half = b.len * 0.22
  const reach = b.len * 0.32

  const root = new THREE.Group()
  const standY = b.leg + g * 0.4
  const body = node(0, standY, 0)
  root.add(body)
  const chest = node()
  const hips = node()
  body.add(chest, hips)

  // 躯干：前后两段椭球，接缝处重叠
  chest.add(ball(g, main, { z: half }, [0.95, 0.95, 1.3]))
  hips.add(ball(g * (isRabbit ? 1.12 : 1), main, { z: -half, y: isRabbit ? g * 0.08 : 0 }, [0.98, isRabbit ? 1.02 : 0.95, 1.3]))
  // 胸前 / 肚皮的浅色
  chest.add(ball(g * 0.78, sub, { y: -g * 0.22, z: half + g * 0.42 }, [0.9, 0.9, 0.9]))
  // 后腿根的「大腿」：兔子特别大
  for (const s of [-1, 1]) hips.add(ball(g * (isRabbit ? 0.62 : 0.48), main, { x: s * g * 0.55, y: -g * 0.2, z: -reach + g * 0.1 }, [0.6, 1, 1.15]))

  // 花色：背上一块、侧面一块（球冠贴片，紧贴躯干表面）
  if (patchA !== main) hips.add(cap(g * 1.015, 0.95, patchA, { z: -half }, [0.98, 0.95, 1.3]))
  if (patchB !== main && !isDog) chest.add(cap(g * 1.015, 0.7, patchB, { z: half, rz: 1.1, rx: 0.2 }, [0.95, 0.95, 1.3]))

  // 绒毛（贵宾的卷毛、长毛猫的蓬松）
  if (b.fluff) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2
      const host = k % 2 ? chest : hips
      host.add(ball(g * 0.45, k % 3 === 0 ? sub : main, { x: Math.cos(a) * g * 0.72, y: Math.sin(a) * g * 0.55 + g * 0.1, z: (k % 2 ? half : -half) + (k - 2.5) * 0.6 }))
    }
  }

  // ---------- 腿 ----------
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
      upper.add(limbDown(r * 1.12, L1, main))
      const lower = node(0, -L1, 0)
      upper.add(lower)
      lower.add(limbDown(r, L2, main))
      // 爪子：副色（白袜子）；兔子后脚长
      const paw = ball(pawR, sub, { y: -L2, z: pawR * (isRabbit && !front ? 0.9 : 0.25) }, [1, 0.6, isRabbit && !front ? 2 : 1.25])
      lower.add(paw)
      if (b.fluff && isDog) lower.add(ball(r * 1.7, main, { y: -L2 + pawR * 0.6 }))
      host.add(upper)
      legs.push({ upper, lower, front, side })
    }

  // ---------- 脖子、头 ----------
  const neck = node(0, g * 0.35, half + g * 0.75)
  chest.add(neck)
  neck.add(ball(g * 0.62, main, { y: b.neck * 0.35, z: b.neck * 0.25 }, [0.95, 1.1, 0.95]))
  if (isDog) {
    // 项圈 + 铃铛
    const collar = torus(g * 0.58, 0.9, pal[2] ?? '#ff8f86', { y: b.neck * 0.35, z: b.neck * 0.3, rx: PI / 2 - 0.5 })
    neck.add(collar)
    neck.add(ball(1.2, '#ffe08f', { y: b.neck * 0.35 - g * 0.5, z: b.neck * 0.3 + g * 0.35 }))
  }
  const h = b.head
  const head = node(0, b.neck * 0.75, b.neck * 0.7)
  neck.add(head)
  head.add(ball(h, main, {}, [1.08, 0.95, 1]))
  if (patchA !== main && !isDog) head.add(cap(h * 1.02, 0.85, patchA, { rx: -0.35, rz: 0.25 }, [1.08, 0.95, 1]))
  if (b.fluff && isDog) head.add(ball(h * 0.7, main, { y: h * 0.75, z: -h * 0.1 }))

  // 吻部
  if (b.snout > 0) {
    const s = h * 0.5
    const sz = 1 + b.snout / (h * 0.7)
    const cz = h * 0.6 + s * sz * 0.3
    head.add(ball(s, sub, { y: -h * 0.3, z: cz }, [0.9, 0.78, sz]))
    head.add(ball(h * 0.16, INK, { y: -h * 0.18, z: cz + s * sz * 0.95 }, [1.2, 0.85, 0.9]))
  } else {
    // 猫、兔子：小小的口鼻
    for (const s of [-1, 1]) head.add(ball(h * 0.3, sub, { x: s * h * 0.2, y: -h * 0.36, z: h * 0.78 }, [1, 0.8, 0.8]))
    head.add(noOL(ball(h * 0.1, NOSE_PINK, { y: -h * 0.17, z: h * 0.97 }, [1.3, 0.8, 0.7])))
  }

  // 眼睛（睡觉时 scale.y 压扁成一条线）+ 腮红
  const eyes: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const e = node(s * h * 0.4, h * 0.1, h * 0.86)
    e.rotation.y = s * 0.35
    e.add(noOL(ball(h * 0.14, INK, {}, [1, 1.25, 0.5])))
    e.add(noOL(ball(h * 0.05, '#ffffff', { x: h * 0.04, y: h * 0.06, z: h * 0.05 })))
    head.add(e)
    eyes.push(e)
    head.add(noOL(ball(h * 0.13, PINK, { x: s * h * 0.62, y: -h * 0.22, z: h * 0.68 }, [1.3, 0.6, 0.4])))
  }

  // 耳朵
  const ears: THREE.Object3D[] = []
  const earRest: { x: number; z: number }[] = []
  for (const s of [-1, 1]) {
    let ear: THREE.Object3D
    let rest = { x: 0, z: 0 }
    const E = b.ear_
    if (b.ear === 'cat' || b.ear === 'prick') {
      ear = node(s * h * 0.52, h * 0.62, -h * 0.05)
      rest = { x: -0.1, z: -s * 0.32 }
      ear.add(pyramid(E * 0.62, E * 1.35, main))
      const inner = pyramid(E * 0.38, E * 0.95, b.ear === 'cat' ? PINK : sub)
      inner.position.set(0, E * 0.4, E * 0.2)
      inner.userData.noOutline = true
      ear.add(inner)
    } else if (b.ear === 'bunny') {
      ear = node(s * h * 0.35, h * 0.75, -h * 0.15)
      rest = { x: -0.15, z: -s * 0.18 }
      const m = capsule(E * 0.2, E * 0.8, main, { y: -E * 0.05 })
      m.scale.set(1, 1, 0.55)
      ear.add(m)
      const inner = capsule(E * 0.12, E * 0.65, PINK, { y: E * 0.08, z: E * 0.06 })
      inner.scale.set(1, 1, 0.3)
      inner.userData.noOutline = true
      ear.add(inner)
    } else if (b.ear === 'lop' || b.ear === 'flop') {
      ear = node(s * h * 0.78, h * 0.35, -h * 0.05)
      rest = { x: 0, z: s * 0.15 }
      const color = b.ear === 'lop' ? main : shade(main, -0.08)
      const m = ball(E * 0.5, color, { y: -E * 0.55 }, [0.35, 1.2, 0.75])
      ear.add(m)
    } else {
      // 贵宾的绒球耳
      ear = node(s * h * 0.8, h * 0.2, -h * 0.05)
      rest = { x: 0, z: 0 }
      ear.add(ball(E * 0.55, main, { y: -E * 0.5 }, [0.7, 1.1, 0.85]))
      ear.add(ball(E * 0.45, main, { y: -E * 1.05, x: s * 0.6 }))
    }
    ear.rotation.set(rest.x, 0, rest.z)
    head.add(ear)
    ears.push(ear)
    earRest.push(rest)
  }

  // ---------- 尾巴 ----------
  const tail: THREE.Object3D[] = []
  const tailBase = node(0, g * (isRabbit ? 0.25 : 0.35), -half - g * 1.15)
  hips.add(tailBase)
  if (b.tail === 'stub') {
    tailBase.add(ball(b.tailR * 1.2, b.kind === 'rabbit' ? sub : main, { z: -1 }))
    tail.push(tailBase)
  } else if (b.tail === 'pom') {
    tailBase.add(limbBack(b.tailR, b.tailLen * 0.6, main))
    tailBase.add(ball(b.tailR * 2.6, sub, { z: -b.tailLen * 0.75 }))
    tail.push(tailBase)
  } else {
    const n = b.tail === 'curl' ? 4 : 5
    const segLen = b.tailLen / n
    let parent: THREE.Object3D = tailBase
    for (let i = 0; i < n; i++) {
      const seg = i === 0 ? tailBase : node(0, 0, -segLen)
      if (i > 0) parent.add(seg)
      const taper = b.tail === 'curl' ? 1 - i * 0.12 : 1 - i * 0.08
      const tip = i === n - 1
      const color = tip && patchB !== main && !isDog ? patchB : b.tail === 'curl' && i >= 2 ? sub : main
      seg.add(limbBack(b.tailR * taper, segLen, color))
      tail.push(seg)
      parent = seg
    }
  }

  const rig: Rig = { breed: b, root, body, chest, hips, neck, head, ears, eyes, legs, tail, standY, reach, earRest }
  return rig
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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

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
      return { ...base, neck: -0.75, pitch: -0.08, y: -J * 0.05, u0: -0.1, u1: -0.1, tail: base.tail + 0.2 }
    case 'eat':
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
  r.chest.scale.set(1 + br * 0.025, 1 + br * 0.04, 1)
  r.hips.scale.set(1 + br * 0.02, 1 + br * 0.03, 1)
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
  for (const e of r.eyes) e.scale.y = Math.max(0.12, p.eyes)
}

/** 静态展示用：摆好姿势、合并网格、加描边 */
export function creatureStatic(breedId: string, pal: string[], pose: PoseName) {
  const rig = buildCreature(breedId, pal)
  applyPose(rig, poseFor(rig.breed, pose), { ...emptyMotion(), breathe: 0 })
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
