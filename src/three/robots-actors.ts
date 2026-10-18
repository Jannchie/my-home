// 无人机和机器人的模型 + 会动的骨架：素材库里的静态版（packs/robots.ts）和沙盘里活动的角色（actors.ts）共用这里的建模函数。
//
// 坐标约定和 critters.ts 一致：单位 cm，原点在地面（无人机在起落架底部），正面朝 +z。
//   无人机：root → body（机身枢轴，飞行时前倾 / 侧倾）→ 机身、机臂、电机；props 是各个桨的节点（绕 y 转）。
//   四足机器狗：root → inner（整体缩放，小型机器狗用）→ body（躯干，俯仰）→ head → lidar（头部激光雷达，绕 y 缓慢转）；
//     四条腿的 hip 节点不挂在躯干下面，而是每帧按躯干姿态算出髋关节的位置，再用两连杆 IK 让脚落在目标点上（前腿膝盖朝后、后腿膝盖朝前的 X 形腿型）。
//   轮式机器人：root → inner → body（轻微起伏）→ head（转头看人），eyes 是屏幕上的眼睛（scale.y 压扁 = 眨眼），wheels 绕 x 转。
//   人形机器人：root → inner → torso（呼吸 / 重心晃动）→ head、两条手臂（shoulder → elbow），挥手 / 转头。
// 外形参考消费级航拍无人机、四足机器狗、人形机器人的常见形态语言，但不带任何品牌名、型号、logo。

import * as THREE from 'three'
import { ball, capsule, cyl, puck, rbox, shade, toon, torus, tray } from './toon'

const PI = Math.PI
const DARK = '#24262c'
const SCREEN = '#1c1f2a'
const RUBBER = '#2a2a2e'

const node = (x = 0, y = 0, z = 0) => {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  return o
}

const noOL = <T extends THREE.Object3D>(o: T) => {
  o.userData.noOutline = true
  return o
}

/** 发光件：换成自发光 toon 材质、不描边 */
export function lit<T extends THREE.Mesh>(m: T, color: string, k = 0.85) {
  m.material = toon(color, { emissive: k })
  m.userData.noOutline = true
  return m
}

/** 屏幕上的一只眼睛（压扁的发光椭球），返回眼睛节点（眨眼时压 scale.y） */
export function screenEye(r: number, color: string, at: { x: number; y: number; z: number }, sy = 1.25) {
  const e = node(at.x, at.y, at.z)
  e.add(lit(ball(r, color, {}, [0.85, sy, 0.32]), color, 0.9))
  return e
}

/** 两点之间的一根方梁（机臂、支架） */
export function beam(a: [number, number, number], b: [number, number, number], w: number, h: number, color: string, r = 0.5) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dy, dz)
  const holder = node((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  holder.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ')
  const m = rbox(w, h, len, color, {}, r)
  m.position.y = 0
  holder.add(m)
  return holder
}

/** 一组状态灯：亮 / 暗两个网格切换（闪烁），不共享材质 */
function ledPair(make: (c: string) => THREE.Mesh, on: string, off = '#8d949c') {
  const a = lit(make(on), on, 0.95)
  const b = noOL(make(off))
  b.visible = false
  return [a, b] as const
}

// ======================================================================
// 无人机
// ======================================================================

export type DroneType = 'aerial' | 'mini' | 'fpv' | 'toy' | 'selfie'

/** 各型号的飞行参数：r 碰撞半径（含桨），speed 巡航速度 cm/s，pad 停机时机身中心离地 */
export const DRONES: Record<DroneType, { r: number; speed: number }> = {
  aerial: { r: 24, speed: 70 },
  mini: { r: 19, speed: 55 },
  fpv: { r: 15, speed: 85 },
  toy: { r: 14, speed: 40 },
  selfie: { r: 12, speed: 35 },
}

export interface DroneParts {
  root: THREE.Group
  /** 机身枢轴（离地约机身中心高度），飞行时绕它倾斜 */
  body: THREE.Object3D
  props: THREE.Object3D[]
  ledOn: THREE.Object3D[]
  ledOff: THREE.Object3D[]
}

/** 桨：中心在原点，n 片桨叶，半径 r，静止时第一片朝 angle */
function blades(r: number, color: string, n = 2, angle = 0, hub = '#3a3d44') {
  const g = node()
  g.rotation.y = angle
  g.add(cyl(Math.max(0.5, r * 0.09), Math.max(0.5, r * 0.09), 0.7, hub, { y: -0.35 }, 12))
  for (let k = 0; k < n; k++) {
    const arm = node()
    arm.rotation.y = (k / n) * PI * 2
    const b = rbox(r - 0.4, 0.28, Math.max(0.7, r * 0.17), color, { x: (r - 0.4) / 2 + 0.4, y: -0.14, rx: 0.12 }, 0.12)
    arm.add(b)
    g.add(arm)
  }
  return g
}

/** 一圈涵道（护桨圈）：内径 ri、外径 ro、高 h 的空心环，at.y 为底面 */
export function duct(ri: number, ro: number, h: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const pts = [new THREE.Vector2(ri, 0), new THREE.Vector2(ro, 0), new THREE.Vector2(ro, h), new THREE.Vector2(ri, h), new THREE.Vector2(ri, 0)]
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), toon(color))
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 折叠航拍无人机（迷你款用 s 缩小）：流线机身、前置三轴云台、四臂（前臂向外展开 / 向后折叠，后臂向下前折叠）。
 * pal = [机身, 点缀（云台 / 桨）, 状态灯]；folded = 机臂收拢、桨叶顺着机臂。
 */
function aerialDrone(pal: string[], folded: boolean, s = 1): DroneParts {
  const [main = '#7d838c', acc = '#3a3d44', led = '#7fe0a8'] = pal
  const root = new THREE.Group()
  const inner = node()
  inner.scale.setScalar(s)
  root.add(inner)
  const body = node(0, 6, 0)
  inner.add(body)
  const k = node(0, -6, 0)
  body.add(k)
  // 机身：主壳 + 顶盖 + 尾部电池
  k.add(rbox(9.6, 6.4, 21, main, { y: 2.8, z: -0.5 }, 3))
  k.add(rbox(7.6, 1.4, 14, shade(main, 0.07), { y: 8.3, z: -1.5 }, 0.65))
  k.add(rbox(8.2, 1.2, 0.8, acc, { y: 4.4, z: -10.8 }, 0.35))
  // 前视避障镜头（两只小黑圆）
  for (const sx of [-1, 1]) k.add(cyl(0.75, 0.75, 0.6, '#14161b', { x: sx * 2.3, y: 6.6, z: 10.15, rx: PI / 2 }, 12))
  // 云台相机：机头下方
  k.add(rbox(4.6, 1.1, 2.6, acc, { y: 2.2, z: 9.4 }, 0.4))
  k.add(rbox(4.2, 3.4, 3.4, acc, { y: 0.9, z: 11.4 }, 1))
  k.add(cyl(1.35, 1.35, 0.7, '#14161b', { y: 2.6, z: 13.3, rx: PI / 2 }, 16))
  k.add(noOL(lit(cyl(0.8, 0.8, 0.2, '#9fd8ff', { y: 2.6, z: 13.7, rx: PI / 2 }, 12), '#9fd8ff', 0.35)))
  // 机尾状态灯
  const [on, off] = ledPair((c) => rbox(3, 0.6, 0.5, c, { y: 6.2, z: -11.2 }, 0.2), led)
  k.add(on, off)

  const props: THREE.Object3D[] = []
  // 机臂：hinge（机身上的转轴）→ motor（电机位置）
  const arms: { hinge: [number, number, number]; motor: [number, number, number]; foldAng: number }[] = []
  for (const sx of [-1, 1]) {
    if (folded) {
      arms.push({ hinge: [sx * 4.6, 7.4, 6.5], motor: [sx * 6.2, 7.6, -3.5], foldAng: PI })
      arms.push({ hinge: [sx * 4.4, 4.2, -8], motor: [sx * 6.2, 4.4, 2.5], foldAng: 0 })
    } else {
      arms.push({ hinge: [sx * 4.6, 7.4, 6.5], motor: [sx * 14, 7.6, 8.6], foldAng: sx > 0 ? 0.3 : PI - 0.3 })
      arms.push({ hinge: [sx * 4.4, 4.2, -8], motor: [sx * 13.4, 5.6, -9.6], foldAng: sx > 0 ? -0.3 : PI + 0.3 })
    }
  }
  for (const a of arms) {
    k.add(beam(a.hinge, a.motor, 1.8, 1.5, main, 0.6))
    const [mx, my, mz] = a.motor
    k.add(cyl(1.6, 1.7, 2.2, acc, { x: mx, y: my - 0.6, z: mz }, 14))
    // 起落脚：电机下面一根细腿
    k.add(cyl(0.55, 0.45, my - 0.4, acc, { x: mx, y: 0, z: mz }, 8))
    const p = node(mx, my + 1.9, mz)
    if (folded) {
      // 收起：两片桨叶都顺着机臂贴在一边
      for (const dz of [0.5, -0.5]) {
        const b = rbox(1.3, 0.28, 8.6, acc, { x: mx > 0 ? 0.9 : -0.9, y: dz * 0.6 - 0.1, z: a.foldAng ? 4.6 : -4.6 }, 0.12)
        p.add(b)
      }
      p.add(cyl(0.9, 0.9, 0.7, '#3a3d44', { y: -0.35 }, 12))
    } else p.add(blades(10, acc, 2, a.foldAng))
    k.add(p)
    props.push(p)
  }
  return { root, body, props, ledOn: [on], ledOff: [off] }
}

/** 涵道 FPV 无人机：矮胖机身、四个圆鼓鼓的护桨涵道、顶部电池、前置单轴相机 */
function fpvDrone(pal: string[]): DroneParts {
  const [main = '#4a4e57', acc = '#2b2e34', led = '#ff7a59'] = pal
  const root = new THREE.Group()
  const body = node(0, 4, 0)
  root.add(body)
  const k = node(0, -4, 0)
  body.add(k)
  k.add(rbox(6.4, 4.2, 9.6, main, { y: 2.2 }, 2.2))
  k.add(rbox(5, 2, 6.6, acc, { y: 6.1, z: -1.4 }, 0.8))
  k.add(rbox(4.6, 0.5, 0.6, '#c3c7cc', { y: 6.7, z: -4.8 }, 0.2))
  // 相机
  k.add(rbox(3.6, 3, 2.6, acc, { y: 2.7, z: 5.4 }, 1))
  k.add(cyl(1.05, 1.05, 0.6, '#14161b', { y: 4.2, z: 6.9, rx: PI / 2 }, 14))
  k.add(noOL(lit(cyl(0.6, 0.6, 0.2, '#9fd8ff', { y: 4.2, z: 7.25, rx: PI / 2 }, 12), '#9fd8ff', 0.35)))
  const [on, off] = ledPair((c) => rbox(2.6, 0.5, 0.5, c, { y: 4.5, z: -4.95 }, 0.2), led)
  k.add(on, off)
  // 底部两条滑橇
  for (const sx of [-1, 1]) k.add(rbox(1, 2.5, 10, acc, { x: sx * 2.6, y: 0 }, 0.4))
  const props: THREE.Object3D[] = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * 5.3
      const cz = sz * 5.1
      k.add(duct(3.55, 4.1, 3.4, main, { x: cx, y: 1.3, z: cz }))
      k.add(torus(4.1, 0.35, shade(main, -0.12), { x: cx, y: 4.7, z: cz, rx: PI / 2 }))
      // 涵道里的十字支撑 + 电机
      k.add(rbox(7.2, 0.5, 0.7, acc, { x: cx, y: 2.2, z: cz }, 0.2))
      k.add(cyl(0.9, 0.9, 1.4, acc, { x: cx, y: 2.3, z: cz }, 12))
      k.add(beam([sx * 2.6, 3.2, sz * 3], [cx - sx * 2.6, 3.2, cz - sz * 2.4], 1.4, 1.2, main, 0.4))
      const p = node(cx, 4, cz)
      p.add(blades(3.3, acc, 3, sx * sz * 0.4))
      k.add(p)
      props.push(p)
    }
  return { root, body, props, ledOn: [on], ledOff: [off] }
}

/** 玩具四轴：X 形塑料机架 + 四个护桨圈 + 圆顶机舱，颜色鲜艳 */
function toyDrone(pal: string[]): DroneParts {
  const [main = '#ff8f86', acc = '#fbf7f1', led = '#7fd8ff'] = pal
  const root = new THREE.Group()
  const body = node(0, 2.4, 0)
  root.add(body)
  const k = node(0, -2.4, 0)
  body.add(k)
  k.add(rbox(6, 2.4, 7, main, { y: 1.2 }, 1.1))
  k.add(noOL(ball(2.4, acc, { y: 3.5 }, [1, 0.55, 1.15])))
  k.add(ball(2.4, acc, { y: 3.4 }, [1, 0.5, 1.15]))
  const [on, off] = ledPair((c) => ball(0.6, c, { y: 2.4, z: 3.55 }, [1, 0.7, 0.5]), led)
  k.add(on, off)
  const props: THREE.Object3D[] = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * 5.4
      const cz = sz * 5.4
      k.add(beam([sx * 2, 2, sz * 2.3], [cx, 2, cz], 1.4, 1, main, 0.4))
      k.add(cyl(1, 1, 1.6, acc, { x: cx, y: 1.4, z: cz }, 12))
      k.add(cyl(0.45, 0.45, 1.4, acc, { x: cx, y: 0, z: cz }, 8))
      // 护桨圈：两根连杆托着
      k.add(torus(3.75, 0.32, main, { x: cx, y: 3.1, z: cz, rx: PI / 2 }))
      k.add(rbox(0.6, 0.5, 3.4, main, { x: cx + sx * 1.9, y: 2.85, z: cz + sz * 1.9, ry: sx * sz > 0 ? PI / 4 : -PI / 4 }, 0.2))
      const p = node(cx, 3.2, cz)
      p.add(blades(3.1, acc, 2, sx * 0.7))
      k.add(p)
      props.push(p)
    }
  return { root, body, props, ledOn: [on], ledOff: [off] }
}

/** 掌上自拍无人机：手机大小的扁平机身，四角嵌着小涵道 */
function selfieDrone(pal: string[]): DroneParts {
  const [main = '#f4f4f2', acc = '#3d3f44', led = '#7fe0a8'] = pal
  const root = new THREE.Group()
  const body = node(0, 1.4, 0)
  root.add(body)
  const k = node(0, -1.4, 0)
  body.add(k)
  k.add(rbox(4.4, 2, 9.6, main, { y: 0.4 }, 0.9))
  k.add(rbox(3.2, 0.5, 6, shade(main, -0.06), { y: 2.2, z: -0.6 }, 0.2))
  k.add(cyl(0.9, 0.9, 0.5, '#14161b', { y: 1.4, z: 4.85, rx: PI / 2 }, 14))
  const [on, off] = ledPair((c) => rbox(1.6, 0.4, 0.4, c, { y: 1.3, z: -4.85 }, 0.15), led)
  k.add(on, off)
  const props: THREE.Object3D[] = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * 3.6
      const cz = sz * 3.4
      k.add(duct(2.05, 2.5, 1.6, main, { x: cx, y: 0.5, z: cz }))
      k.add(cyl(0.55, 0.55, 0.9, acc, { x: cx, y: 0.6, z: cz }, 10))
      k.add(rbox(4.6, 0.3, 0.45, acc, { x: cx, y: 0.6, z: cz, ry: PI / 4 }, 0.1))
      const p = node(cx, 1.5, cz)
      p.add(blades(1.85, acc, 2, 0.5))
      k.add(p)
      props.push(p)
    }
  // 底部小脚垫
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(cyl(0.4, 0.4, 0.4, RUBBER, { x: sx * 1.6, z: sz * 3.6 }, 8))
  return { root, body, props, ledOn: [on], ledOff: [off] }
}

/** 无人机模型（活动角色和静态素材共用）；folded 只对 aerial / mini 有效 */
export function droneModel(type: string, pal: string[], folded = false): DroneParts {
  switch (type) {
    case 'mini':
      return aerialDrone(pal, folded, 0.66)
    case 'fpv':
      return fpvDrone(pal)
    case 'toy':
      return toyDrone(pal)
    case 'selfie':
      return selfieDrone(pal)
    default:
      return aerialDrone(pal, folded)
  }
}

// ======================================================================
// 机器人（四足 / 轮式 / 人形）
// ======================================================================

export type RoboType = 'quad' | 'wheel' | 'humanoid'

export interface RoboBreed {
  type: RoboType
  /** 碰撞半径、移动速度 cm/s、整体缩放 */
  r: number
  speed: number
  s: number
  /** 会不会离开座子到处走（人形机器人只在原地待机） */
  roam: boolean
  /** 送餐：去沙发 / 餐桌前停一会儿 */
  deliver?: boolean
}

export const ROBO_BREEDS: Record<string, RoboBreed> = {
  quad: { type: 'quad', r: 26, speed: 42, s: 1, roam: true },
  'quad-mini': { type: 'quad', r: 16, speed: 32, s: 0.56, roam: true },
  companion: { type: 'wheel', r: 17, speed: 20, s: 1, roam: true },
  catbot: { type: 'wheel', r: 15, speed: 24, s: 1, roam: true },
  server: { type: 'wheel', r: 27, speed: 32, s: 1, roam: true, deliver: true },
  butler: { type: 'wheel', r: 21, speed: 24, s: 1, roam: true },
  helper: { type: 'wheel', r: 23, speed: 20, s: 1, roam: true },
  // 人形机器人：从站立架上下来在家里走走（会走楼梯），累了回架子待机
  humanoid: { type: 'humanoid', r: 24, speed: 26, s: 1, roam: true },
}

interface QuadLeg {
  hip: THREE.Object3D
  knee: THREE.Object3D
  /** 髋关节在躯干局部坐标里的位置 */
  local: THREE.Vector3
}

interface Arm {
  sh: THREE.Object3D
  el?: THREE.Object3D
  side: -1 | 1
}

export interface RoboRig {
  id: string
  breed: RoboBreed
  root: THREE.Group
  inner: THREE.Object3D
  body: THREE.Object3D
  head: THREE.Object3D
  eyes: THREE.Object3D[]
  lidar?: THREE.Object3D
  legs: QuadLeg[]
  wheels: THREE.Object3D[]
  wheelR: number
  arms: Arm[]
  ears: THREE.Object3D[]
  /** 站立时躯干节点的高度（inner 坐标） */
  standY: number
}

/** 叠加在机器人身上的动作状态（每帧由 actors.ts 写入） */
export interface RoboMotion {
  t: number
  /** 步态权重 0..1、相位 */
  gait: number
  phase: number
  /** 趴下 0..1（四足休眠 / 轮式低头待机） */
  rest: number
  /** 伸展（前低后高）0..1 */
  stretch: number
  /** 东张西望 0..1 */
  look: number
  /** 挥手 0..1 */
  wave: number
  /** 眼睛睁开 0..1 */
  eyes: number
  /** 行进速度（cm/s，带符号），轮式前倾用 */
  speed: number
}

export const emptyRoboMotion = (): RoboMotion => ({ t: 0, gait: 0, phase: 0, rest: 0, stretch: 0, look: 0, wave: 0, eyes: 1, speed: 0 })

// ---------- 四足机器狗 ----------

const QL1 = 21
const QL2 = 21
const Q_STAND = 31
const Q_LIE = 10.8
const FOOT_R = 2

/** 两连杆 IK：脚相对髋关节的 (dz 向前, dy 向上)，返回 [大腿角, 小腿相对角]（rotation.x，正 = 往后摆；膝盖朝后） */
function ik2(dz: number, dy: number): [number, number] {
  const d = Math.max(0.5, Math.min(QL1 + QL2 - 0.05, Math.hypot(dz, dy)))
  const phi = Math.atan2(-dz, -dy)
  const alpha = Math.acos(Math.max(-1, Math.min(1, (QL1 * QL1 + d * d - QL2 * QL2) / (2 * QL1 * d))))
  const a1 = phi + alpha
  const kz = -QL1 * Math.sin(a1)
  const ky = -QL1 * Math.cos(a1)
  const abs2 = Math.atan2(-(dz - kz), -(dy - ky))
  return [a1, abs2 - a1]
}

/** 后腿用：膝盖朝前的镜像解（X 形腿型，趴下时后腿折在身体两侧，不会向后翘出） */
function ik2Fwd(dz: number, dy: number): [number, number] {
  const [a1, a2] = ik2(-dz, dy)
  return [-a1, -a2]
}

/** 四足机器狗：深色机身、头部面罩 + 下巴处的激光雷达、外露的髋 / 膝电机圆盘。pal = [机身, 关节 / 小腿, 点缀灯色] */
function buildQuad(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [main = '#3d4047', joint = '#22242a', acc = '#7fd8ff'] = pal
  const root = new THREE.Group()
  const inner = node()
  inner.scale.setScalar(b.s)
  root.add(inner)
  const body = node(0, Q_STAND, 0)
  inner.add(body)
  // 躯干：y -6..5
  body.add(rbox(18, 11, 40, main, { y: -6 }, 3.5))
  body.add(rbox(13.6, 1.2, 25, shade(main, 0.08), { y: 4.4, z: -1 }, 0.55))
  // 背上的提手
  for (const z of [-15, -3]) body.add(rbox(1.4, 3.2, 1.4, joint, { y: 5.2, z }, 0.4))
  body.add(rbox(1.7, 1.5, 13.8, joint, { y: 8.2, z: -9 }, 0.6))
  // 侧面灯条
  for (const sx of [-1, 1]) body.add(lit(rbox(0.6, 1, 13, acc, { x: sx * 9.15, y: -1.2, z: 3 }, 0.25), acc, 0.7))
  // 髋部电机圆盘
  const hips = [
    new THREE.Vector3(-13.2, -3, 15),
    new THREE.Vector3(13.2, -3, 15),
    new THREE.Vector3(-13.2, -3, -15),
    new THREE.Vector3(13.2, -3, -15),
  ]
  for (const h of hips) body.add(cyl(3.8, 3.8, 3, joint, { x: Math.sign(h.x) * 10.4, y: h.y - 1.5, z: h.z, rz: PI / 2 }, 18))
  // 头：面罩 + 两点传感灯 + 下巴的激光雷达
  const head = node(0, -0.5, 20)
  body.add(head)
  head.add(rbox(15, 9.5, 9, main, { y: -5.5, z: 2.5 }, 3.2))
  head.add(rbox(12, 4.2, 1, SCREEN, { y: -3.1, z: 6.85 }, 0.5))
  const eyes = [-1, 1].map((sx) => screenEye(0.85, acc, { x: sx * 3.2, y: -1, z: 7.42 }, 0.75))
  for (const e of eyes) head.add(e)
  const lidar = node(0, -5.4, 4.2)
  head.add(lidar)
  lidar.add(cyl(2.6, 2.6, 3.4, joint, { y: -3.4 }, 18))
  lidar.add(cyl(2.75, 2.75, 0.9, shade(main, 0.15), { y: -2.4 }, 18))
  lidar.add(lit(rbox(1.2, 0.6, 0.4, acc, { y: -2.25, z: 2.85 }, 0.15), acc, 0.9))

  const legs: QuadLeg[] = []
  for (const local of hips) {
    const hip = node()
    inner.add(hip)
    hip.add(cyl(3, 3, 4.4, joint, { y: -2.2, rz: PI / 2 }, 16))
    hip.add(rbox(4, QL1 + 3, 5.6, main, { y: -QL1 - 1.5 }, 1.6))
    const knee = node(0, -QL1, 0)
    hip.add(knee)
    knee.add(cyl(2.6, 2.6, 5, joint, { y: -2.5, rz: PI / 2 }, 14))
    knee.add(cyl(1.9, 1.25, QL2, joint, { y: -QL2 }, 12))
    knee.add(ball(FOOT_R, RUBBER, { y: -QL2 }))
    legs.push({ hip, knee, local })
  }
  const rig: RoboRig = { id, breed: b, root, inner, body, head, eyes, lidar, legs, wheels: [], wheelR: 1, arms: [], ears: [], standY: Q_STAND }
  return rig
}

const tmpV = new THREE.Vector3()
const tmpE = new THREE.Euler()

function poseQuad(r: RoboRig, m: RoboMotion) {
  const rest = m.rest
  const st = m.stretch * (1 - rest)
  let H = Q_STAND + (Q_LIE - Q_STAND) * rest
  const Hf = H - 11 * st
  const Hr = H + 1.5 * st
  const pitch = Math.atan2(Hr - Hf, 30)
  H = (Hf + Hr) / 2 + (Math.abs(Math.cos(m.phase)) - 0.5) * 0.9 * m.gait
  const roll = Math.sin(m.phase) * 0.02 * m.gait
  r.body.position.y = H
  r.body.rotation.set(pitch, 0, roll)
  r.head.rotation.set(0.12 * rest - 0.15 * st, (Math.sin(m.t * 0.9) * 0.55 + Math.sin(m.t * 2.3) * 0.12) * m.look, 0, 'YXZ')
  if (r.lidar) r.lidar.rotation.y = m.t * 1.6 * (1 - rest * 0.8)
  for (const e of r.eyes) e.scale.y = Math.max(0.15, m.eyes)
  tmpE.set(pitch, 0, roll)
  const A = 4.6 * m.gait
  const off = [0, PI, PI, 0]
  for (let i = 0; i < 4; i++) {
    const L = r.legs[i]
    tmpV.copy(L.local).applyEuler(tmpE)
    tmpV.y += H
    L.hip.position.copy(tmpV)
    const q = m.phase + off[i]
    const front = i < 2
    // 趴下时脚落在髋关节正下方附近：大腿接近水平、小腿折回身下，膝盖贴着机身两侧
    const fz = L.local.z + A * Math.sin(q) + (front ? -0.5 : 0.5) * rest + (front ? 6 * st : 0)
    const fy = FOOT_R + 4 * Math.max(0, Math.cos(q)) * m.gait
    const [a1, a2] = front ? ik2(fz - tmpV.z, fy - tmpV.y) : ik2Fwd(fz - tmpV.z, fy - tmpV.y)
    L.hip.rotation.x = a1
    L.knee.rotation.x = a2
  }
}

// ---------- 轮式机器人 ----------

function wheelPair(x: number, y: number, z: number, r: number, w: number) {
  const ws: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const n = node(s * x, y, z)
    n.add(cyl(r, r, w, RUBBER, { y: -w / 2, rz: PI / 2 }, 16))
    n.add(rbox(w + 0.2, r * 0.5, r * 0.5, '#5b5f66', { y: -r * 0.25 }, 0.2))
    ws.push(n)
  }
  return ws
}

/** 陪伴机器人：蛋形身体 + 毛绒外衣、大眼睛屏幕、头顶的感应天线、两只小鳍手，底下两只轮子。pal = [外衣, 肚皮, 天线 / 耳朵, 眼睛] */
function buildCompanion(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [coat = '#f3e6d0', belly = '#fff8ee', acc = '#ffb6c8', eye = '#7fd8ff'] = pal
  const root = new THREE.Group()
  const inner = node()
  root.add(inner)
  const body = node(0, 0, 0)
  inner.add(body)
  body.add(ball(14, coat, { y: 20 }, [1, 1.22, 1]))
  body.add(ball(10, belly, { y: 14.5, z: 6.2 }, [1, 1.05, 0.8]))
  const head = node(0, 26, 0)
  body.add(head)
  head.add(ball(8, SCREEN, { z: 10.5 }, [1.25, 0.82, 0.5]))
  const eyes = [-1, 1].map((sx) => screenEye(2.3, eye, { x: sx * 3.6, y: 0.4, z: 14.15 }))
  for (const e of eyes) head.add(e)
  head.add(cyl(1, 1.4, 4.5, acc, { y: 9 }, 12))
  head.add(ball(2, acc, { y: 14 }))
  const ears = [-1, 1].map((sx) => {
    const e = node(sx * 8, 8.6, -1)
    e.add(ball(3.4, acc, {}, [0.85, 1, 0.5]))
    head.add(e)
    return e
  })
  const arms: Arm[] = ([-1, 1] as const).map((side) => {
    const sh = node(side * 12.6, 19, 2)
    sh.add(ball(4.6, coat, { x: side * 0.6, y: -3.6 }, [0.42, 1, 0.68]))
    body.add(sh)
    return { sh, side }
  })
  const wheels = wheelPair(7.4, 2.6, 3, 2.6, 2)
  for (const w of wheels) inner.add(w)
  inner.add(ball(1.6, RUBBER, { y: 1.6, z: -8 }))
  return { id, breed: b, root, inner, body, head, eyes, legs: [], wheels, wheelR: 2.6, arms, ears, standY: 0 }
}

/** 猫耳机器人：圆角方身 + 屏幕脸（猫眼）、猫耳、卷尾巴，两轮 + 万向轮。pal = [机身, 尾巴 / 耳内, 眼睛] */
function buildCatbot(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [main = '#fbf7f1', sub = '#ffb6c8', eye = '#ffe08f'] = pal
  const root = new THREE.Group()
  const inner = node()
  root.add(inner)
  const body = node()
  inner.add(body)
  body.add(rbox(18, 14, 20, main, { y: 3 }, 6))
  body.add(rbox(12, 0.8, 1, sub, { y: 9, z: 10.1 }, 0.3))
  body.add(torus(3.6, 1.1, sub, { y: 12.5, z: -11.4, ry: PI / 2, rz: 0.4 }, PI * 1.3))
  const head = node(0, 16.6, 1)
  body.add(head)
  head.add(rbox(17, 12, 15, main, {}, 5.4))
  head.add(rbox(13, 8, 1, SCREEN, { y: 2, z: 7.25 }, 1.8))
  const eyes = [-1, 1].map((sx) => screenEye(1.5, eye, { x: sx * 3, y: 6.3, z: 7.85 }))
  for (const e of eyes) head.add(e)
  head.add(lit(ball(0.6, '#ff9db0', { y: 4.6, z: 7.82 }, [1.2, 0.8, 0.3]), '#ff9db0', 0.8))
  const ears = [-1, 1].map((sx) => {
    const e = node(sx * 5, 11.2, -1)
    const outer = cyl(0.3, 3.2, 4.6, main, {}, 4)
    outer.rotation.y = PI / 4
    e.add(outer)
    const inr = cyl(0.2, 1.9, 3, sub, { y: 0.6, z: 0.75 }, 4)
    inr.rotation.y = PI / 4
    inr.userData.noOutline = true
    e.add(inr)
    e.rotation.z = -sx * 0.2
    head.add(e)
    return e
  })
  const wheels = wheelPair(9.6, 3, 2, 3, 2)
  for (const w of wheels) inner.add(w)
  inner.add(ball(1.5, RUBBER, { y: 1.5, z: -7 }))
  return { id, breed: b, root, inner, body, head, eyes, legs: [], wheels, wheelR: 3, arms: [], ears, standY: 0 }
}

/** 送餐机器人：圆角底盘、后立柱、三层托盘、顶部屏幕头（圆眼 + 笑嘴）。pal = [机身, 托盘 / 立柱, 眼睛] */
export const SERVER_TRAYS = [46, 72, 98]
function buildServer(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [main = '#fbf7f1', sub = '#d7d8db', eye = '#7fd8ff'] = pal
  const root = new THREE.Group()
  const inner = node()
  root.add(inner)
  const body = node()
  inner.add(body)
  body.add(rbox(46, 17, 46, main, { y: 2.4 }, 8))
  body.add(rbox(47, 3, 47, shade(main, -0.35), { y: 3.2 }, 1.4))
  body.add(lit(rbox(20, 1, 0.6, eye, { y: 14, z: 23.1 }, 0.3), eye, 0.7))
  body.add(rbox(10, 90, 8, sub, { y: 19, z: -16 }, 2))
  for (const y of SERVER_TRAYS) {
    body.add(tray(40, 2.5, 36, 0.8, shade(sub, 0.06), { y, z: 2 }))
    body.add(rbox(12, 3, 4, sub, { y: y - 3, z: -11 }, 1))
  }
  const head = node(0, 106, -12)
  body.add(head)
  head.add(rbox(30, 22, 12, main, { z: 2 }, 5))
  head.add(rbox(24, 16, 1, SCREEN, { y: 3, z: 8.05 }, 2))
  const eyes = [-1, 1].map((sx) => screenEye(2.2, eye, { x: sx * 5.5, y: 12, z: 8.7 }))
  for (const e of eyes) head.add(e)
  const mouth = noOL(lit(torus(1.8, 0.4, eye, { y: 7.6, z: 8.65, rz: PI }, PI), eye, 0.8))
  head.add(mouth)
  const ears = [-1, 1].map((sx) => {
    const e = node(sx * 11, 21, 2)
    e.add(ball(3.2, main))
    head.add(e)
    return e
  })
  const wheels = wheelPair(17.5, 2.6, 0, 2.6, 3)
  for (const w of wheels) inner.add(w)
  return { id, breed: b, root, inner, body, head, eyes, legs: [], wheels, wheelR: 2.6, arms: [], ears, standY: 0 }
}

/** 管家机器人：圆底盘 + 细立柱 + 大屏平板头（屏幕上画眼睛）。pal = [机身, 立柱, 眼睛] */
function buildButler(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [main = '#f4f4f2', sub = '#c3c7cc', eye = '#7fe0a8'] = pal
  const root = new THREE.Group()
  const inner = node()
  root.add(inner)
  const body = node()
  inner.add(body)
  body.add(puck(19, 12, main, { y: 1.6 }))
  body.add(torus(19, 1, shade(main, -0.35), { y: 4, rx: PI / 2 }))
  body.add(lit(rbox(10, 0.8, 0.5, eye, { y: 9, z: 18.4 }, 0.2), eye, 0.7))
  body.add(cyl(2.6, 3.4, 72, sub, { y: 13 }, 18))
  body.add(rbox(6.4, 9, 6.4, DARK, { y: 83 }, 1.6))
  const head = node(0, 88, 0)
  body.add(head)
  const tilt = node(0, 9, 0.5)
  tilt.rotation.x = -0.18
  head.add(tilt)
  tilt.add(rbox(30, 21, 3, main, { y: -10.5, z: 0 }, 1.4))
  tilt.add(rbox(26, 17, 0.6, SCREEN, { y: -8.5, z: 1.55 }, 0.8))
  const eyes = [-1, 1].map((sx) => screenEye(2.6, eye, { x: sx * 5.5, y: 1.4, z: 1.95 }))
  for (const e of eyes) tilt.add(e)
  tilt.add(noOL(lit(torus(2, 0.45, eye, { y: -3.6, z: 1.95, rz: PI }, PI), eye, 0.8)))
  const wheels = wheelPair(12.5, 2, 0, 2, 2.4)
  for (const w of wheels) inner.add(w)
  return { id, breed: b, root, inner, body, head, eyes, legs: [], wheels, wheelR: 2, arms: [], ears: [], standY: 0 }
}

/** 人形家务机器人（可爱简洁）：裙摆底盘 + 圆角躯干 + 球形头（屏幕脸）+ 两只机械手。pal = [头 / 手臂, 躯干, 裙摆, 眼睛] */
function buildHelper(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [main = '#fbf7f1', sub = '#a8d4f4', skirt = '#fbf7f1', eye = '#7fd8ff'] = pal
  const root = new THREE.Group()
  const inner = node()
  root.add(inner)
  const body = node()
  inner.add(body)
  body.add(cyl(14, 21, 40, skirt, { y: 2 }, 28))
  body.add(torus(20.6, 1.2, shade(skirt, -0.35), { y: 4, rx: PI / 2 }, PI * 2))
  body.add(rbox(30, 40, 22, sub, { y: 40 }, 9))
  body.add(lit(ball(1.8, '#ff9db0', { y: 66, z: 11.1 }, [1, 1, 0.35]), '#ff9db0', 0.8))
  body.add(cyl(3.2, 3.2, 7, DARK, { y: 79.5 }, 14))
  const head = node(0, 86, 0)
  body.add(head)
  head.add(ball(12.5, main, { y: 11 }, [1.1, 1, 1]))
  head.add(ball(9, SCREEN, { y: 11, z: 8 }, [1.1, 0.8, 0.6]))
  const eyes = [-1, 1].map((sx) => screenEye(1.8, eye, { x: sx * 3.8, y: 12, z: 13.15 }))
  for (const e of eyes) head.add(e)
  for (const sx of [-1, 1]) head.add(cyl(2.4, 2.4, 2.4, sub, { x: sx * 13.4, y: 9.8, rz: PI / 2 }, 14))
  const arms: Arm[] = ([-1, 1] as const).map((side) => {
    const sh = node(side * 17.2, 74, 0)
    sh.add(ball(4.2, DARK))
    sh.add(capsule(2.8, 12, main, { y: -17.6 }))
    const el = node(0, -15, 0)
    sh.add(el)
    el.add(ball(3, DARK))
    el.add(capsule(2.6, 10, main, { y: -15.2 }))
    el.add(ball(3.4, sub, { y: -16 }, [1, 0.9, 1.1]))
    body.add(sh)
    return { sh, el, side }
  })
  const wheels = wheelPair(11, 2.4, 0, 2.4, 2)
  for (const w of wheels) inner.add(w)
  return { id, breed: b, root, inner, body, head, eyes, legs: [], wheels, wheelR: 2.4, arms, ears: [], standY: 0 }
}

// ---------- 人形机器人 ----------

/** 人形机器人：纤细身形、深色面罩头盔、外露的髋 / 膝 / 肩 / 肘电机。pal = [外壳, 关节, 胸甲, 面罩灯] */
function buildHumanoid(id: string, b: RoboBreed, pal: string[]): RoboRig {
  const [main = '#c9ccd1', joint = '#2b2d33', chest = '#3d3f44', glowC = '#7fd8ff'] = pal
  const root = new THREE.Group()
  const inner = node()
  root.add(inner)
  // 下半身：髋关节（y 67）和膝关节（y 34）两级节点，站着时和原来的静态模型一样；走路时摆腿（poseRobo）
  const legs: QuadLeg[] = []
  for (const sx of [-1, 1]) {
    const x = sx * 9
    const hip = node(x, 67, 0)
    inner.add(hip)
    hip.add(cyl(4.8, 4.8, 6, joint, { y: 0, rz: PI / 2 }, 16))
    hip.add(rbox(7.6, 28, 8.6, main, { y: 40 - 67 }, 2.8))
    const knee = node(0, 34 - 67, 0)
    hip.add(knee)
    knee.add(cyl(4.2, 4.2, 8, joint, { y: 0, rz: PI / 2 }, 16))
    knee.add(rbox(6, 32, 7, main, { y: 3.5 - 34 }, 2.4))
    knee.add(cyl(3, 3, 6, joint, { y: 2 - 34, rz: PI / 2 }, 12))
    knee.add(rbox(8.4, 4, 20, joint, { y: -34, z: 2.5 }, 1.6))
    legs.push({ hip, knee, local: new THREE.Vector3(x, 67, 0) })
  }
  inner.add(rbox(22, 12, 14, joint, { y: 64 }, 4))
  inner.add(cyl(6, 7, 9, joint, { y: 75 }, 18))
  const body = node(0, 83, 0)
  inner.add(body)
  body.add(rbox(28, 26, 15, main, {}, 5))
  body.add(rbox(21, 15, 1, chest, { y: 6, z: 7.45 }, 1.2))
  body.add(lit(rbox(8, 0.8, 0.4, glowC, { y: 18, z: 7.75 }, 0.2), glowC, 0.8))
  body.add(cyl(3.2, 3.6, 6, joint, { y: 25 }, 14))
  const head = node(0, 30, 0)
  body.add(head)
  head.add(ball(9.5, main, { y: 9 }, [0.95, 1.1, 1]))
  head.add(ball(8, SCREEN, { y: 9, z: 3.8 }, [0.95, 0.75, 0.82]))
  const eyes = [-1, 1].map((sx) => screenEye(0.95, glowC, { x: sx * 2.8, y: 9.8, z: 9.95 }, 0.7))
  for (const e of eyes) head.add(e)
  const arms: Arm[] = ([-1, 1] as const).map((side) => {
    const sh = node(side * 17.4, 22, 0)
    sh.add(cyl(4.5, 4.5, 6, joint, { y: -3, rz: PI / 2 }, 16))
    sh.add(rbox(5.6, 24, 6.6, main, { y: -26 }, 2))
    const el = node(0, -27, 0)
    sh.add(el)
    el.add(cyl(3.4, 3.4, 6, joint, { y: -3, rz: PI / 2 }, 14))
    el.add(rbox(5, 20, 5.6, main, { y: -22 }, 1.8))
    el.add(rbox(4.4, 8, 5.4, joint, { y: -30.5 }, 1.6))
    body.add(sh)
    return { sh, el, side }
  })
  return { id, breed: b, root, inner, body, head, eyes, legs, wheels: [], wheelR: 1, arms, ears: [], standY: 83 }
}

/** 机器人模型（活动角色和静态素材共用） */
export function buildRobo(breedId: string, pal: string[]): RoboRig {
  const b = ROBO_BREEDS[breedId] ?? ROBO_BREEDS.quad
  switch (breedId) {
    case 'companion':
      return buildCompanion(breedId, b, pal)
    case 'catbot':
      return buildCatbot(breedId, b, pal)
    case 'server':
      return buildServer(breedId, b, pal)
    case 'butler':
      return buildButler(breedId, b, pal)
    case 'helper':
      return buildHelper(breedId, b, pal)
    case 'humanoid':
      return buildHumanoid(breedId, b, pal)
    default:
      return buildQuad(breedId, b, pal)
  }
}

/** 把动作写进机器人骨架 */
export function poseRobo(r: RoboRig, m: RoboMotion) {
  if (r.breed.type === 'quad') return poseQuad(r, m)
  for (const e of r.eyes) e.scale.y = Math.max(0.12, m.eyes)
  const look = (Math.sin(m.t * 0.8) * 0.6 + Math.sin(m.t * 2.1) * 0.12) * m.look
  if (r.breed.type === 'humanoid') {
    // 呼吸 + 重心左右轻晃；转头；右手挥一挥；走路时两腿交替前后摆、膝盖在抬腿时弯，手臂反向摆，身体随步子起伏
    const g = m.gait
    const step = (side: number) => Math.sin(m.phase + (side > 0 ? 0 : PI))
    r.body.position.y = r.standY + Math.sin(m.t * 1.6) * 0.25 * (1 - g) - Math.abs(Math.sin(m.phase)) * 1.2 * g
    r.body.rotation.set(0.04 * g, look * 0.25 * (1 - g), Math.sin(m.t * 0.7) * 0.015 * (1 - g) + Math.sin(m.phase) * 0.03 * g)
    r.head.rotation.set(-0.05 * m.rest, look * 0.8, 0, 'YXZ')
    for (const a of r.arms) {
      const w = a.side > 0 ? m.wave : 0
      a.sh.rotation.set(-0.05 - w * 0.35 + step(a.side) * 0.4 * g, 0, a.side * (0.08 + w * 2.5))
      if (a.el) a.el.rotation.set(-0.15 - w * 0.4 - 0.25 * g, 0, a.side * w * (0.35 + Math.sin(m.t * 9) * 0.35))
    }
    r.legs.forEach((l, i) => {
      const s = step(i === 0 ? -1 : 1)
      l.hip.rotation.x = -s * 0.42 * g
      l.knee.rotation.x = Math.max(0, s) * 0.7 * g
    })
    return
  }
  // 轮式：起伏、加速前倾、转头、小手扑腾
  r.body.position.y = r.standY + Math.sin(m.t * 2.2) * 0.35 * (1 - m.rest)
  r.body.rotation.x = Math.max(-0.08, Math.min(0.08, m.speed * 0.0025)) + m.rest * 0.06
  r.head.rotation.set(m.rest * 0.18, look, 0, 'YXZ')
  for (const a of r.arms) {
    const w = a.side > 0 ? m.wave : 0
    a.sh.rotation.set(a.el ? -w * 0.4 : 0, 0, a.side * (0.1 + Math.sin(m.t * 3) * 0.12 * (1 - m.rest) + w * (a.el ? 2.4 : 1.3) + w * Math.sin(m.t * 9) * 0.3))
    if (a.el) a.el.rotation.set(-0.25 - w * 0.5, 0, 0)
  }
  for (const e of r.ears) e.rotation.x = Math.sin(m.t * 1.7) * 0.08
}

/** 静态展示版：quad 站立 / 趴下；其他机器人保持站姿 */
export function roboStatic(breedId: string, pal: string[], rest = 0) {
  const r = buildRobo(breedId, pal)
  poseRobo(r, { ...emptyRoboMotion(), rest, eyes: rest > 0.5 && r.breed.type === 'quad' ? 0.3 : 1 })
  return r.root
}
