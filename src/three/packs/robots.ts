// 无人机 & 机器人素材包（id 前缀 rb-）：
//   无人机：折叠航拍机（展开 / 折叠）、迷你航拍机、涵道 FPV、玩具四轴、掌上自拍机、收纳箱套装（打开 / 合上）、带屏遥控器、电池充电管家、停机坪垫、口袋云台相机。
//   机器人：四足机器狗（站立 / 趴下休眠）+ 充电座、小型机器狗、陪伴机器人（+ 充电窝）、桌面情感机器人、猫耳机器人（+ 充电座）、
//           擦窗机器人（贴窗）、送餐机器人（+ 充电桩）、人形家务机器人、管家机器人、人形机器人（+ 充电站立架）、
//           变形机器人玩具（机器人 / 汽车形态）、积木编程小车、桌面六轴机械臂、复古铁皮机器人、大型机甲模型。
// 外形参考常见消费级产品的形态语言，但都是原创造型，不带任何品牌名、型号、logo。
// 会飞 / 会走的（actor）模型在 robots-actors.ts，布置模式下这里展示静态姿势，预览时由 actors.ts 接管。
// 机器人属于角色类，可以有屏幕眼睛；配件、底座、遥控器之类不加脸。

import * as THREE from 'three'
import { G, rectPoly, type ActorSpec, type AssetCategory, type AssetDef, type StyleTag } from '../kit'
import { markActorPart } from '../critters'
import { SERVER_TRAYS, beam, buildRobo, droneModel, lit, roboStatic, screenEye } from '../robots-actors'
import { ball, capsule, cyl, puck, rbox, shade, torus, tray } from '../toon'

type Pal = [StyleTag, string[]]
const PI = Math.PI
const SCREEN = '#1c1f2a'
const RUBBER = '#2a2a2e'
const FOAM = '#33353b'

function def(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pal[], build: (p: string[]) => THREE.Group, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}

const PROP: Partial<AssetDef> = { prop: true }
const actor = (kind: ActorSpec['kind'], role: ActorSpec['role'], breed: string, dock?: [number, number, number]): Partial<AssetDef> => ({ actor: { kind, role, breed, ...(dock ? { dock } : {}) } })

// ======================================================================
// 无人机
// ======================================================================

/** 航拍机配色：[机身, 云台 / 桨, 状态灯] */
const AERIAL_PALS: Pal[] = [
  ['modern', ['#7d838c', '#3a3d44', '#7fe0a8']],
  ['modern', ['#3d3f44', '#24252a', '#ff7a59']],
  ['nordic', ['#e6e7e4', '#8a8d93', '#7fd8ff']],
  ['industrial', ['#6b6f63', '#3a3a3c', '#e0a526']],
]
const MINI_PALS: Pal[] = [
  ['modern', ['#d7d8db', '#5b5f66', '#7fe0a8']],
  ['nordic', ['#f4f4f2', '#9fb4c7', '#7fd8ff']],
  ['cute', ['#ffd6e0', '#f3a6b8', '#ffffff']],
  ['modern', ['#3d3f44', '#8a8d93', '#ff7a59']],
]
const FPV_PALS: Pal[] = [
  ['modern', ['#4a4e57', '#2b2e34', '#ff7a59']],
  ['industrial', ['#5e6058', '#2f3034', '#e0a526']],
  ['modern', ['#d7d8db', '#3d3f44', '#7fd8ff']],
  ['retro', ['#2f8f8a', '#3a3a3c', '#e2702f']],
]
const TOY_PALS: Pal[] = [
  ['cute', ['#ff8f86', '#fbf7f1', '#7fd8ff']],
  ['cute', ['#a8d4f4', '#fff1dc', '#ffe08f']],
  ['retro', ['#e0a526', '#2f8f8a', '#ff7a59']],
  ['cute', ['#a6e3cc', '#fbf7f1', '#ffb6c8']],
]
const SELFIE_PALS: Pal[] = [
  ['modern', ['#f4f4f2', '#3d3f44', '#7fe0a8']],
  ['cute', ['#ffd6e0', '#8a5a6a', '#ffffff']],
  ['modern', ['#3d3f44', '#c3c7cc', '#7fd8ff']],
  ['nordic', ['#c9d6cf', '#5b6b63', '#ffe08f']],
]
/** 配件（遥控器、充电器、收纳箱）：[主色, 副色, 灯色] */
const GEAR_PALS: Pal[] = [
  ['modern', ['#3d3f44', '#7d838c', '#7fd8ff']],
  ['modern', ['#d7d8db', '#5b5f66', '#7fe0a8']],
  ['industrial', ['#4f5248', '#2f3034', '#e0a526']],
  ['nordic', ['#e6e7e4', '#9fb4c7', '#7fd8ff']],
]
const PAD_PALS: Pal[] = [
  ['modern', ['#e2702f', '#fbf7f1']],
  ['modern', ['#3d3f44', '#e0a526']],
  ['nordic', ['#9fb4c7', '#f7f5f0']],
  ['industrial', ['#4f5248', '#e2702f']],
  ['cute', ['#a6e3cc', '#fbf7f1']],
]

/** 包围盒在 xz 上居中（膝盖、云台、盖子让模型偏向一边的） */
function centered(build: (p: string[]) => THREE.Group) {
  return (p: string[]) => {
    const g = build(p)
    const c = new THREE.Box3().setFromObject(g, true).getCenter(new THREE.Vector3())
    g.position.set(-c.x, 0, -c.z)
    return G(g)
  }
}

const flying = (type: string) => (p: string[]) => G(markActorPart(droneModel(type, p).root))
const folded = (type: string) => (p: string[]) => G(droneModel(type, p, true).root)

/** 停机坪垫：圆形折叠垫，中间一个大 H 和一圈定位环 */
function pad(p: string[]) {
  const [main, mark] = p
  const g = new THREE.Group()
  g.add(cyl(27.5, 27.5, 0.6, main, {}, 40))
  g.add(torus(23, 0.45, mark, { y: 0.6, rx: PI / 2 }))
  for (const sx of [-1, 1]) g.add(rbox(2.4, 0.4, 14, mark, { x: sx * 5, y: 0.45 }, 0.15))
  g.add(rbox(7.6, 0.4, 2.4, mark, { y: 0.45 }, 0.15))
  return g
}

/** 带屏遥控器（平放）：中间一块亮着的屏幕、两根摇杆、两侧握把、收起的天线 */
function remote(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(15, 2.4, 8, main, {}, 1.1))
  for (const sx of [-1, 1]) g.add(ball(2.4, main, { x: sx * 6.4, y: 1.3, z: -0.6 }, [1.1, 0.55, 1.5]))
  g.add(rbox(9.4, 0.5, 6, SCREEN, { y: 2.2, z: 0.4 }, 0.3))
  g.add(lit(rbox(8.6, 0.2, 5.2, glowC, { y: 2.7, z: 0.4 }, 0.1), glowC, 0.55))
  for (const sx of [-1, 1]) {
    g.add(cyl(0.45, 0.45, 1.4, sub, { x: sx * 6.2, y: 2.2, z: 1.4 }, 8))
    g.add(cyl(1.1, 1.1, 0.5, sub, { x: sx * 6.2, y: 3.4, z: 1.4 }, 14))
    g.add(rbox(1.4, 0.7, 4.6, sub, { x: sx * 3.4, y: 2.2, z: -3.2 }, 0.3))
  }
  return g
}

/** 电池充电管家：底座上竖插三块智能电池，每块顶上一排电量灯 */
function charger(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(15, 3, 9, main, {}, 1))
  g.add(lit(rbox(2, 0.4, 0.4, glowC, { x: 5, y: 1.4, z: 4.55 }, 0.15), glowC, 0.8))
  for (const x of [-4.6, 0, 4.6]) {
    g.add(rbox(3.4, 6.6, 7.4, sub, { x, y: 2.6 }, 0.9))
    for (let k = 0; k < 4; k++) g.add(lit(rbox(0.5, 0.25, 0.5, glowC, { x: x - 1.1 + k * 0.73, y: 9.1, z: 2.4 }, 0.1), glowC, 0.8))
  }
  return g
}

/** 收纳箱：打开（盖子立起来，泡棉里嵌着折叠好的无人机、遥控器、三块电池）/ 合上（带提手和锁扣） */
function droneCase(open: boolean) {
  return (p: string[]) => {
    const [main, sub] = p
    const g = new THREE.Group()
    const shellC = main
    if (!open) {
      g.add(rbox(38, 15, 28, shellC, {}, 2.2))
      g.add(rbox(38.6, 0.8, 28.6, shade(shellC, -0.12), { y: 11.6 }, 0.35))
      for (const sx of [-1, 1]) g.add(rbox(3.2, 3.4, 1, sub, { x: sx * 11, y: 10, z: 14.1 }, 0.4))
      for (const sx of [-1, 1]) g.add(rbox(1.6, 2, 2.2, sub, { x: sx * 6, y: 15 }, 0.5))
      g.add(rbox(14, 1.6, 2.8, sub, { y: 16.6 }, 0.7))
      return g
    }
    g.add(tray(38, 12, 28, 1.2, shellC, {}, 1))
    g.add(rbox(35.4, 8.4, 25.4, FOAM, { y: 1.2 }, 0.6))
    // 泡棉里嵌着的东西（下半截陷在泡棉里）
    const drone = droneModel('aerial', [sub, '#3a3d44', '#7fe0a8'], true).root
    drone.position.set(-6, 5.6, 1)
    drone.rotation.y = PI / 2
    g.add(drone)
    const rc = remote([sub, '#3a3d44', '#7fd8ff'])
    rc.position.set(9.5, 7.4, -5)
    rc.scale.setScalar(0.85)
    g.add(rc)
    for (const k of [0, 1, 2]) g.add(rbox(3.2, 4.2, 7, sub, { x: 5.8 + k * 4.2, y: 6.4, z: 6.5 }, 0.8))
    // 盖子：绕后上沿打开约 100°
    const hinge = new THREE.Object3D()
    hinge.position.set(0, 12, -14)
    hinge.rotation.x = -1.76
    hinge.add(rbox(38, 3, 28, shellC, { z: 14 }, 1.4))
    hinge.add(rbox(35, 0.8, 25, FOAM, { y: -0.4, z: 14 }, 0.3))
    g.add(hinge)
    return g
  }
}

/** 口袋云台相机：竖握手柄 + 小屏幕 + 顶部三轴云台和镜头 */
function gimbal(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(3.2, 9.4, 2.6, main, {}, 1.2))
  g.add(lit(rbox(1.9, 1.9, 0.3, glowC, { y: 5.6, z: 1.35 }, 0.2), glowC, 0.45))
  g.add(cyl(0.45, 0.45, 0.3, sub, { y: 3.6, z: 1.2, rx: PI / 2 }, 10))
  g.add(rbox(0.9, 3.6, 1, sub, { x: 1.2, y: 9 }, 0.3))
  g.add(rbox(2.8, 2.6, 2.6, sub, { x: -0.2, y: 10.5 }, 0.9))
  g.add(cyl(0.95, 0.95, 0.5, '#14161b', { x: -0.2, y: 11.8, z: 1.25, rx: PI / 2 }, 14))
  return g
}

// ======================================================================
// 机器人
// ======================================================================

/** 机器狗：[机身, 关节 / 小腿, 灯色] */
const DOG_PALS: Pal[] = [
  ['modern', ['#3d4047', '#22242a', '#7fd8ff']],
  ['modern', ['#d7d8db', '#3d3f44', '#7fe0a8']],
  ['industrial', ['#7c8085', '#3a3a3c', '#e2702f']],
  ['cute', ['#fbf7f1', '#a8d4f4', '#ffb6c8']],
  ['nordic', ['#b9bfc4', '#5b6168', '#ffe08f']],
]
const DOG_MINI_PALS: Pal[] = [
  ['industrial', ['#d9a02a', '#2f3034', '#ffe08f']],
  ['industrial', ['#7c8085', '#2f3034', '#e2702f']],
  ['modern', ['#3d4047', '#22242a', '#7fd8ff']],
  ['retro', ['#c8473a', '#3a3a3c', '#f4e7c8']],
]
/** 陪伴机器人：[外衣, 肚皮, 天线 / 耳朵, 眼睛] */
const COMP_PALS: Pal[] = [
  ['cute', ['#f3e6d0', '#fff8ee', '#ffb6c8', '#7fd8ff']],
  ['cute', ['#c9b3e8', '#f3ecfb', '#ffe08f', '#ffd27f']],
  ['nordic', ['#c8c2b6', '#efebe3', '#a9bfa3', '#8fe0c0']],
  ['retro', ['#c79a6a', '#f4e7c8', '#e2702f', '#ffe08f']],
  ['modern', ['#5b5f66', '#c3c7cc', '#7fd8ff', '#7fd8ff']],
]
/** 猫耳机器人：[机身, 尾巴 / 耳内, 眼睛] */
const CAT_PALS: Pal[] = [
  ['cute', ['#fbf7f1', '#ffb6c8', '#ffe08f']],
  ['cute', ['#ffe0b8', '#f4a259', '#7fd8ff']],
  ['modern', ['#3d3f44', '#8a8d93', '#a6f0d8']],
  ['nordic', ['#e8e1d4', '#a9bfa3', '#ffe08f']],
]
/** 送餐机器人：[机身, 托盘 / 立柱, 眼睛] */
const SERVER_PALS: Pal[] = [
  ['modern', ['#fbf7f1', '#d7d8db', '#7fd8ff']],
  ['cute', ['#fff1dc', '#ffd6e0', '#ffb36b']],
  ['modern', ['#3d3f44', '#8a8d93', '#7fe0a8']],
  ['retro', ['#f4e7c8', '#a8683a', '#ffd27f']],
]
/** 管家机器人：[机身, 立柱, 眼睛] */
const BUTLER_PALS: Pal[] = [
  ['modern', ['#f4f4f2', '#c3c7cc', '#7fe0a8']],
  ['modern', ['#3d3f44', '#8a8d93', '#7fd8ff']],
  ['nordic', ['#f7f5f0', '#d9b98c', '#8fe0c0']],
  ['industrial', ['#4f5248', '#7b5236', '#ffd27f']],
]
/** 家务机器人：[头 / 手臂, 躯干, 裙摆, 眼睛] */
const HELPER_PALS: Pal[] = [
  ['cute', ['#fbf7f1', '#a8d4f4', '#fbf7f1', '#7fd8ff']],
  ['cute', ['#fbf7f1', '#ffb6c8', '#fff1dc', '#ff9db0']],
  ['nordic', ['#f7f5f0', '#a9bfa3', '#d9b98c', '#8fe0c0']],
  ['modern', ['#d7d8db', '#3d3f44', '#8a8d93', '#7fd8ff']],
]
/** 人形机器人：[外壳, 关节, 胸甲, 面罩灯] */
const HUMANOID_PALS: Pal[] = [
  ['modern', ['#c9ccd1', '#2b2d33', '#3d3f44', '#7fd8ff']],
  ['modern', ['#3d3f44', '#1f2025', '#7d838c', '#7fe0a8']],
  ['industrial', ['#8a8d82', '#2f3034', '#c46a3a', '#ffd27f']],
  ['nordic', ['#f4f4f2', '#5b6168', '#9fb4c7', '#7fd8ff']],
]
/** 底座 / 充电座：[主色, 副色, 灯色] */
const DOCK_PALS: Pal[] = [
  ['modern', ['#3d3f44', '#24252a', '#7fd8ff']],
  ['modern', ['#e6e7e4', '#8a8d93', '#7fe0a8']],
  ['industrial', ['#4f5248', '#2f3034', '#e2702f']],
  ['nordic', ['#f7f5f0', '#d9b98c', '#7fe0a8']],
]
const SOFT_DOCK_PALS: Pal[] = [
  ['cute', ['#fff1dc', '#ffd6e0', '#7fd8ff']],
  ['nordic', ['#efebe3', '#a9bfa3', '#7fe0a8']],
  ['cute', ['#f3ecfb', '#c9b3e8', '#ffe08f']],
  ['modern', ['#d7d8db', '#5b5f66', '#7fd8ff']],
]

const robo = (breed: string, rest = 0) => (p: string[]) => G(markActorPart(roboStatic(breed, p, rest)))

/** 机器狗充电座：薄底板 + 后面的充电塔；机器狗趴在底板上（dock = 局部 [0, 1.5, 8]） */
function dogDock(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(46, 1.5, 72, main, {}, 0.7))
  g.add(rbox(22, 14, 8, sub, { z: -32 }, 2.5))
  g.add(lit(rbox(10, 1, 0.5, glowC, { y: 10, z: -27.9 }, 0.2), glowC, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(3, 0.5, 6, '#c3c7cc', { x: sx * 8, y: 1.3, z: -18 }, 0.2))
  return g
}

/** 陪伴机器人的充电窝：圆垫 + 背后软软的靠背，机器人坐在里面（actorPart） */
function companionNest(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(puck(23, 3, main, {}))
  g.add(rbox(34, 32, 7, sub, { y: 2, z: -18.5 }, 3.4))
  g.add(lit(rbox(8, 0.8, 0.4, glowC, { y: 30, z: -14.8 }, 0.2), glowC, 0.8))
  const r = roboStatic('companion', ['#f3e6d0', '#fff8ee', '#ffb6c8', '#7fd8ff'])
  r.position.set(0, 3, 3)
  g.add(markActorPart(r))
  return g
}

/** 猫耳机器人充电座：低矮楔形 + 触点（dock = [0, 0.8, 4]） */
function catDock(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(26, 0.8, 30, sub, {}, 0.35))
  g.add(rbox(20, 8, 7, main, { z: -11.5 }, 2.6))
  g.add(lit(rbox(5, 0.6, 0.4, glowC, { y: 5.6, z: -7.85 }, 0.2), glowC, 0.8))
  return g
}

/** 送餐机器人充电桩：靠墙的细高桩 + 前面的定位底板（dock = [0, 0.8, 7]） */
function serverDock(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(48, 0.8, 48, sub, { z: 6 }, 0.35))
  g.add(rbox(30, 42, 10, main, { z: -25 }, 3))
  g.add(lit(rbox(12, 1, 0.5, glowC, { y: 34, z: -19.85 }, 0.2), glowC, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(4, 2, 1.2, '#c3c7cc', { x: sx * 8, y: 4, z: -19.6 }, 0.3))
  return g
}

/** 人形机器人充电站立架：底板 + 两根立柱 + 顶梁 + 背后的挂架，机器人站在底板上（actorPart） */
function humanoidStand(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(60, 2, 50, main, {}, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(4, 150, 4, sub, { x: sx * 27, y: 2, z: -22 }, 1))
  g.add(rbox(58, 4, 4, sub, { y: 150, z: -22 }, 1))
  g.add(rbox(4, 4, 13, sub, { y: 136, z: -14.5 }, 1))
  g.add(rbox(4, 14, 4, sub, { y: 136, z: -22 }, 1))
  g.add(lit(rbox(14, 0.6, 0.5, glowC, { y: 1, z: 25.05 }, 0.2), glowC, 0.8))
  const r = roboStatic('humanoid', ['#c9ccd1', '#2b2d33', '#3d3f44', '#7fd8ff'])
  r.position.set(0, 2, 3)
  g.add(markActorPart(r))
  return g
}

/** 桌面情感机器人：履带小车身 + 方脑袋上的屏幕脸（方块眼睛） */
function emoBot(p: string[]) {
  const [main, sub, eye] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(rbox(1.8, 2.4, 7.6, RUBBER, { x: sx * 2.9 }, 0.9))
  g.add(rbox(4.2, 2.6, 6, sub, { y: 1.2 }, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(0.6, 0.8, 3.4, sub, { x: sx * 2.4, y: 3.2, z: 1.4 }, 0.25))
  g.add(rbox(7, 5, 5.4, main, { y: 3.8 }, 1.4))
  g.add(rbox(5.8, 3.8, 0.4, SCREEN, { y: 4.4, z: 2.75 }, 0.5))
  for (const sx of [-1, 1]) g.add(screenEye(0.7, eye, { x: sx * 1.4, y: 6.4, z: 2.98 }, 1.5))
  return g
}

/** 擦窗机器人（贴在窗上）：圆角方机身 + 前盖 + 提手；原点在背面中心，往 +z 伸出 */
function windowBot(p: string[]) {
  const [main, sub, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(22, 22, 0.8, RUBBER, { y: -11, z: 0.4 }, 0.3))
  g.add(rbox(25, 25, 6, main, { y: -12.5, z: 3.6 }, 3))
  g.add(rbox(19, 19, 2.2, sub, { y: -10.5, z: 7.2 }, 2.4))
  g.add(rbox(9, 2, 1.8, shade(main, -0.25), { y: 5.2, z: 8.6 }, 0.8))
  g.add(lit(ball(0.8, glowC, { y: -6, z: 8.25 }, [1.3, 0.6, 0.5]), glowC, 0.9))
  return g
}

/** 变形机器人玩具：机器人形态（站立）/ 汽车形态（平放） */
function transformer(form: 'robot' | 'car') {
  return (p: string[]) => {
    const [main, sub, glass] = p
    const g = new THREE.Group()
    if (form === 'car') {
      g.add(rbox(7.6, 2.6, 15, main, { y: 1.2 }, 1))
      g.add(rbox(6.2, 2.2, 6.4, sub, { y: 3.4, z: -1.2 }, 1))
      g.add(rbox(5.6, 1.7, 0.4, glass, { y: 3.6, z: 2.05, rx: -0.5 }, 0.2))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.6, 1.6, 1.2, RUBBER, { x: sx * 3.5 - sx * 0.6, y: 1, z: sz * 4.8, rz: PI / 2 }, 14))
      for (const sx of [-1, 1]) g.add(lit(rbox(1.4, 0.6, 0.3, '#fff2b8', { x: sx * 2.4, y: 2.6, z: 7.6 }, 0.1), '#fff2b8', 0.7))
      return g
    }
    // 机器人形态：腿（车尾）、躯干（车头做胸甲）、肩上的车轮
    for (const sx of [-1, 1]) {
      g.add(rbox(2.8, 1.4, 4.4, sub, { x: sx * 1.8, z: 0.4 }, 0.4))
      g.add(rbox(2.4, 7, 2.6, main, { x: sx * 1.8, y: 1.2 }, 0.5))
      g.add(cyl(1.4, 1.4, 1, RUBBER, { x: sx * 3.4, y: 4.4, rz: PI / 2 }, 12))
    }
    g.add(rbox(6, 1.6, 3.4, sub, { y: 8 }, 0.4))
    g.add(rbox(7.2, 5, 4, main, { y: 9.4 }, 0.9))
    g.add(rbox(5.4, 2.2, 0.4, glass, { y: 11.4, z: 2.1 }, 0.2))
    for (const sx of [-1, 1]) {
      g.add(rbox(2.2, 2.6, 3, sub, { x: sx * 4.6, y: 11.8 }, 0.5))
      g.add(rbox(1.8, 6, 2, main, { x: sx * 4.7, y: 6 }, 0.4))
      g.add(cyl(1.3, 1.3, 1, RUBBER, { x: sx * 5.6 - 0.5 * sx, y: 13.4, z: -0.8, rz: PI / 2 }, 12))
    }
    g.add(rbox(3, 3, 3, sub, { y: 14.4 }, 0.8))
    g.add(lit(rbox(2.2, 0.6, 0.3, '#7fd8ff', { y: 15.8, z: 1.55 }, 0.1), '#7fd8ff', 0.8))
    g.add(cyl(0.2, 0.3, 1.4, sub, { y: 17.4 }, 6))
    return g
  }
}

/** 积木编程小车：带凸点的积木车身、四个轮子、前面两只超声波「眼睛」传感器 */
function codeCar(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(10, 4.6, 14, main, { y: 1.8 }, 0.8))
  g.add(rbox(8, 3, 8, sub, { y: 6.2, z: -2 }, 0.6))
  for (const x of [-2, 2]) for (const z of [-4, 0]) g.add(cyl(0.9, 0.9, 0.8, sub, { x, y: 9.1, z }, 12))
  for (const x of [-3.2, 3.2]) for (const z of [3.5, 5.6]) g.add(cyl(0.9, 0.9, 0.8, main, { x, y: 6.3, z }, 12))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.4, 2.4, 1.8, RUBBER, { x: sx * 5.6, y: 1.5, z: sz * 4.4, rz: PI / 2 }, 16))
  g.add(rbox(6.4, 2.2, 1, acc, { y: 3.4, z: 7.3 }, 0.4))
  for (const sx of [-1, 1]) {
    g.add(cyl(1, 1, 1, '#d7d8db', { x: sx * 1.6, y: 4.5, z: 8.2, rx: PI / 2 }, 14))
    g.add(cyl(0.6, 0.6, 0.2, '#3a3d44', { x: sx * 1.6, y: 4.5, z: 8.72, rx: PI / 2 }, 12))
  }
  g.add(lit(ball(0.6, '#7fe0a8', { x: 2.6, y: 9.4, z: 1.5 }), '#7fe0a8', 0.9))
  return g
}

/** 桌面六轴机械臂：圆底座、转台、大臂、小臂、腕部、两指夹爪（伸向前下方的姿势） */
function robotArm(p: string[]) {
  const [main, joint, acc] = p
  const g = new THREE.Group()
  g.add(puck(7.5, 3, joint, {}))
  g.add(cyl(5, 5.4, 5, main, { y: 3 }, 20))
  g.add(cyl(3.4, 3.4, 9, joint, { y: 9.5 - 4.5, rz: PI / 2 }, 16))
  const sh: [number, number, number] = [0, 9.5, 0]
  const el: [number, number, number] = [0, 26, -4]
  const wr: [number, number, number] = [0, 27, 10]
  g.add(beam(sh, el, 5.4, 4.4, main, 1.6))
  g.add(cyl(2.8, 2.8, 7, joint, { y: el[1] - 3.5, z: el[2], rz: PI / 2 }, 16))
  g.add(beam(el, wr, 4, 3.6, main, 1.3))
  g.add(cyl(2.2, 2.2, 5.6, joint, { y: wr[1] - 2.8, z: wr[2], rz: PI / 2 }, 14))
  g.add(cyl(1.8, 1.8, 6, main, { y: wr[1] - 6, z: wr[2] + 0.4 }, 14))
  g.add(rbox(4.6, 1.4, 2.6, joint, { y: wr[1] - 7.4, z: wr[2] + 0.4 }, 0.5))
  for (const sx of [-1, 1]) g.add(rbox(0.8, 3.6, 1.8, acc, { x: sx * 1.6, y: wr[1] - 11, z: wr[2] + 0.4 }, 0.3))
  g.add(lit(rbox(3, 0.5, 0.4, '#7fe0a8', { y: 1.4, z: 7.45 }, 0.15), '#7fe0a8', 0.8))
  return g
}

/** 复古铁皮机器人：方盒身体、胸前仪表盘、圆眼睛、天线，钳子手 */
function tinRobot(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    g.add(rbox(3, 1.4, 4.4, sub, { x: sx * 2, z: 0.4 }, 0.4))
    g.add(cyl(0.9, 0.9, 4, '#a7abb1', { x: sx * 2, y: 1.2 }, 10))
  }
  g.add(rbox(8, 8.4, 6, main, { y: 5 }, 1))
  g.add(rbox(5.2, 3.6, 0.5, sub, { y: 8, z: 3.1 }, 0.3))
  for (const [x, c] of [[-1.4, acc], [0.2, '#ffe08f'], [1.6, '#7fd8ff']] as [number, string][]) g.add(cyl(0.55, 0.55, 0.4, c, { x, y: 9.8, z: 3.4, rx: PI / 2 }, 10))
  g.add(rbox(4, 0.6, 0.4, '#3a3a3c', { y: 8.6, z: 3.45 }, 0.1))
  for (const sx of [-1, 1]) {
    g.add(capsule(0.9, 4, '#a7abb1', { x: sx * 4.8, y: 7.2 }))
    g.add(torus(0.9, 0.35, sub, { x: sx * 4.8, y: 6.6, rx: PI / 2, rz: 0 }, PI * 1.5))
  }
  g.add(cyl(1, 1, 0.8, '#a7abb1', { y: 13.4 }, 12))
  g.add(rbox(6.4, 5, 5.2, main, { y: 14 }, 0.9))
  for (const sx of [-1, 1]) {
    g.add(cyl(1.15, 1.15, 0.5, '#fbf7f1', { x: sx * 1.5, y: 16.8, z: 2.65, rx: PI / 2 }, 14))
    g.add(cyl(0.55, 0.55, 0.3, '#3a2a2a', { x: sx * 1.5, y: 16.8, z: 2.95, rx: PI / 2 }, 12))
  }
  g.add(rbox(3, 0.8, 0.5, sub, { y: 14.9, z: 2.65 }, 0.2))
  g.add(cyl(0.2, 0.2, 2.2, '#a7abb1', { y: 19 }, 6))
  g.add(ball(0.6, acc, { y: 21.4 }))
  return g
}

/** 大型机甲模型（展示用）：展示底座上的大块头机甲，单片角、发光面罩、背包推进器 */
function mecha(p: string[]) {
  const [main, joint, acc] = p
  const g = new THREE.Group()
  g.add(rbox(34, 3, 22, '#2f3034', {}, 1))
  g.add(rbox(22, 0.6, 8, acc, { y: 2.7, z: 5 }, 0.2))
  const y0 = 3
  for (const sx of [-1, 1]) {
    const x = sx * 5.5
    g.add(rbox(7, 3, 11, main, { x, y: y0, z: 1 }, 1))
    g.add(rbox(6, 13, 7, main, { x, y: y0 + 2.6 }, 1.4))
    g.add(rbox(6.6, 4, 2.4, acc, { x, y: y0 + 11, z: 3.3 }, 0.8))
    g.add(rbox(5, 10, 5.6, joint, { x: sx * 5, y: y0 + 15 }, 1))
  }
  g.add(rbox(12, 5, 8, joint, { y: y0 + 24 }, 1.2))
  g.add(rbox(15, 5, 2.6, main, { y: y0 + 23, z: 4 }, 0.8))
  g.add(rbox(16, 12, 10, main, { y: y0 + 28 }, 2))
  for (const sx of [-1, 1]) g.add(rbox(4, 2.4, 0.6, acc, { x: sx * 3.6, y: y0 + 34, z: 5.1 }, 0.2))
  g.add(rbox(4, 3, 0.8, joint, { y: y0 + 30.5, z: 5.15 }, 0.3))
  g.add(rbox(10, 10, 5, joint, { y: y0 + 29, z: -7 }, 1.2))
  for (const sx of [-1, 1]) g.add(cyl(1.6, 2.2, 5, '#5b5f66', { x: sx * 2.6, y: y0 + 25, z: -8 }, 12))
  for (const sx of [-1, 1]) {
    const x = sx * 11.8
    g.add(rbox(8, 7, 9, main, { x, y: y0 + 34 }, 2))
    g.add(rbox(4.4, 11, 4.6, joint, { x, y: y0 + 24 }, 1))
    g.add(rbox(5.4, 9, 5.6, main, { x, y: y0 + 15 }, 1.2))
    g.add(rbox(4, 4, 4, joint, { x, y: y0 + 11.4 }, 1))
  }
  g.add(rbox(6, 5.5, 6, main, { y: y0 + 40 }, 1.4))
  g.add(lit(rbox(4.4, 1.1, 0.5, '#7fe0a8', { y: y0 + 42.2, z: 3.05 }, 0.2), '#7fe0a8', 0.9))
  g.add(cyl(0.2, 0.9, 5, acc, { y: y0 + 45.3, z: 1 }, 6))
  return g
}

// 送餐机器人的托盘层（局部坐标）
const TRAY_SHAPE = [rectPoly(-19, -14.5, 19, 19.5)]
const SERVER_SURF: Partial<AssetDef> = {
  surface: SERVER_TRAYS[2] + 0.8,
  surfaceShape: [rectPoly(-19, -3, 19, 19.5)],
  surfaces: SERVER_TRAYS.slice(0, 2).map((y) => ({ y: y + 0.8, shape: TRAY_SHAPE, h: 23.5 })),
}
// 送餐机器人在充电桩前的位置
const SERVER_DOCK: [number, number, number] = [0, 0.8, 7]

/** 送餐机器人：托盘层板面 + 机器人本体（静态） */
function server(p: string[]) {
  return G(markActorPart(buildRobo('server', p).root))
}

export const ROBOT_ASSETS: AssetDef[] = [
  // ---------- 无人机 ----------
  def('rb-drone-aerial', '折叠航拍无人机', 'hobby', [47.5, 27.5, 10], AERIAL_PALS, flying('aerial'), { ...PROP, family: 'rb-drone-aerial', form: 'open', formLabel: '展开', ...actor('drone', 'body', 'aerial') }),
  def('rb-drone-aerial-fold', '折叠航拍无人机', 'hobby', [16, 25.5, 10], AERIAL_PALS, centered(folded('aerial')), { ...PROP, family: 'rb-drone-aerial', form: 'folded', formLabel: '收起' }),
  def('rb-drone-mini', '迷你航拍无人机', 'hobby', [31.5, 18, 6.5], MINI_PALS, flying('mini'), { ...PROP, family: 'rb-drone-mini', form: 'open', formLabel: '展开', ...actor('drone', 'body', 'mini') }),
  def('rb-drone-mini-fold', '迷你航拍无人机', 'hobby', [10.5, 17, 7], MINI_PALS, centered(folded('mini')), { ...PROP, family: 'rb-drone-mini', form: 'folded', formLabel: '收起' }),
  def('rb-drone-fpv', '涵道 FPV 无人机', 'hobby', [19.5, 19, 8], FPV_PALS, flying('fpv'), { ...PROP, ...actor('drone', 'body', 'fpv') }),
  def('rb-drone-toy', '玩具四轴无人机', 'kids', [19, 19, 5], TOY_PALS, flying('toy'), { ...PROP, ...actor('drone', 'body', 'toy') }),
  def('rb-drone-selfie', '掌上自拍无人机', 'hobby', [12, 12, 3], SELFIE_PALS, flying('selfie'), { ...PROP, ...actor('drone', 'body', 'selfie') }),
  def('rb-drone-case', '无人机收纳箱套装', 'hobby', [38, 36, 39.5], GEAR_PALS, centered(droneCase(true)), { family: 'rb-drone-case', form: 'open', formLabel: '打开' }),
  def('rb-drone-case-closed', '无人机收纳箱套装', 'hobby', [39, 29, 18.5], GEAR_PALS, droneCase(false), { family: 'rb-drone-case', form: 'closed', formLabel: '合上' }),
  def('rb-drone-rc', '带屏无人机遥控器', 'hobby', [18.2, 9.6, 4], GEAR_PALS, centered(remote), PROP),
  def('rb-drone-charger', '无人机电池充电管家', 'hobby', [15, 9, 9.5], GEAR_PALS, charger, PROP),
  def('rb-drone-pad', '无人机停机坪垫', 'hobby', [55, 55, 1], PAD_PALS, pad, { ...actor('drone', 'home', 'aerial', [0, 0.6, 0]), limit: { scope: 'house', max: 1, group: 'rb-drone-pad' } }),
  def('rb-gimbal', '口袋云台相机', 'hobby', [3.4, 3, 13], GEAR_PALS, gimbal, PROP),

  // ---------- 机器人：宠物 ----------
  def('rb-dog', '四足机器狗', 'pets', [31.5, 62, 41], DOG_PALS, centered(robo('quad')), { family: 'rb-dog', form: 'standing', formLabel: '站立', ...actor('robopet', 'body', 'quad'), limit: { scope: 'house', max: 1, group: 'rb-dog' } }),
  def('rb-dog-rest', '四足机器狗', 'pets', [31.5, 65, 20.5], DOG_PALS, centered(robo('quad', 1)), { family: 'rb-dog', form: 'lying', formLabel: '趴下休眠', ...actor('robopet', 'body', 'quad'), limit: { scope: 'house', max: 1, group: 'rb-dog' } }),
  def('rb-dog-dock', '机器狗充电座', 'pets', [46, 72, 14], DOCK_PALS, dogDock, { ...actor('robopet', 'home', 'quad', [0, 1.5, 8]), limit: { scope: 'house', max: 1, group: 'rb-dog-dock' } }),
  def('rb-dog-mini', '小型机器狗', 'pets', [17.6, 34.6, 23], DOG_MINI_PALS, centered(robo('quad-mini')), actor('robopet', 'body', 'quad-mini')),
  def('rb-companion', '陪伴机器人（毛绒外衣）', 'pets', [31, 29, 42], COMP_PALS, robo('companion'), { family: 'rb-companion', sizeLabel: '本体', ...actor('robopet', 'body', 'companion') }),
  def('rb-companion-nest', '陪伴机器人（毛绒外衣）', 'pets', [46, 46, 45], SOFT_DOCK_PALS, companionNest, { family: 'rb-companion', sizeLabel: '+ 充电窝', ...actor('robopet', 'home', 'companion'), limit: { scope: 'house', max: 1, group: 'rb-companion' } }),
  def('rb-emo-bot', '桌面情感机器人', 'tabletop', [7.6, 7.6, 9], CAT_PALS, emoBot, PROP),
  def('rb-catbot', '猫耳机器人', 'pets', [21.5, 26.5, 32.5], CAT_PALS, centered(robo('catbot')), { family: 'rb-catbot', sizeLabel: '本体', ...actor('robopet', 'body', 'catbot') }),
  def('rb-catbot-dock', '猫耳机器人充电座', 'pets', [26, 30, 8], SOFT_DOCK_PALS, catDock, { ...actor('robopet', 'home', 'catbot', [0, 0.8, 4]), limit: { scope: 'house', max: 1, group: 'rb-catbot-dock' } }),

  // ---------- 机器人：服务 / 家务 ----------
  def('rb-window-bot', '擦窗机器人（贴窗）', 'appliance', [25, 9.5, 25], DOCK_PALS, windowBot, { stick: true }),
  def('rb-serve-bot', '送餐机器人', 'appliance', [47, 47, 130], SERVER_PALS, server, { family: 'rb-serve-bot', sizeLabel: '本体', ...SERVER_SURF, ...actor('robopet', 'body', 'server'), limit: { scope: 'house', max: 1, group: 'rb-serve-bot' } }),
  def('rb-serve-bot-dock', '送餐机器人充电桩', 'appliance', [48, 60, 42], DOCK_PALS, serverDock, { ...actor('robopet', 'home', 'server', SERVER_DOCK), limit: { scope: 'house', max: 1, group: 'rb-serve-bot-dock' } }),
  def('rb-helper', '人形家务机器人', 'appliance', [47.3, 43.6, 109.5], HELPER_PALS, robo('helper'), { ...actor('robopet', 'body', 'helper'), limit: { scope: 'house', max: 1, group: 'rb-helper' } }),
  def('rb-butler', '管家机器人（大屏）', 'appliance', [40, 40, 107.5], BUTLER_PALS, robo('butler'), { ...actor('robopet', 'body', 'butler'), limit: { scope: 'house', max: 1, group: 'rb-butler' } }),
  def('rb-humanoid', '人形机器人', 'hobby', [48, 22, 132.5], HUMANOID_PALS, centered(robo('humanoid')), { family: 'rb-humanoid', sizeLabel: '本体', ...actor('robopet', 'body', 'humanoid'), limit: { scope: 'house', max: 1, group: 'rb-humanoid' } }),
  def('rb-humanoid-stand', '人形机器人', 'hobby', [60, 50, 154], DOCK_PALS, humanoidStand, { family: 'rb-humanoid', sizeLabel: '+ 充电站立架', ...actor('robopet', 'home', 'humanoid'), limit: { scope: 'house', max: 1, group: 'rb-humanoid' } }),

  // ---------- 机器人：玩具 / 爱好 ----------
  def('rb-transform', '变形机器人玩具', 'kids', [11.4, 5, 19], [
    ['retro', ['#c8473a', '#3d5a80', '#9fd8ff']],
    ['cute', ['#ffe08f', '#3a3a3c', '#9fd8ff']],
    ['modern', ['#3d3f44', '#c3c7cc', '#9fd8ff']],
    ['cute', ['#a8d4f4', '#fbf7f1', '#ffe08f']],
  ], transformer('robot'), { ...PROP, family: 'rb-transform', form: 'standing', formLabel: '机器人形态' }),
  def('rb-transform-car', '变形机器人玩具', 'kids', [8, 15.5, 5.7], [
    ['retro', ['#c8473a', '#3d5a80', '#9fd8ff']],
    ['cute', ['#ffe08f', '#3a3a3c', '#9fd8ff']],
    ['modern', ['#3d3f44', '#c3c7cc', '#9fd8ff']],
    ['cute', ['#a8d4f4', '#fbf7f1', '#ffe08f']],
  ], transformer('car'), { ...PROP, family: 'rb-transform', form: 'lying', formLabel: '汽车形态' }),
  def('rb-code-car', '积木编程机器人小车', 'kids', [13, 16, 10], [
    ['cute', ['#ffe08f', '#a8d4f4', '#ff8f86']],
    ['modern', ['#f4f4f2', '#3d3f44', '#7fd8ff']],
    ['retro', ['#e2702f', '#2f8f8a', '#f4e7c8']],
    ['nordic', ['#e8e1d4', '#a9bfa3', '#9fb4c7']],
  ], centered(codeCar), PROP),
  def('rb-arm', '桌面六轴机械臂', 'hobby', [15, 20, 29.5], [
    ['industrial', ['#e0a526', '#3a3a3c', '#7c8085']],
    ['modern', ['#f4f4f2', '#3d3f44', '#8a8d93']],
    ['modern', ['#3d3f44', '#24252a', '#c3c7cc']],
    ['nordic', ['#e6e7e4', '#9fb4c7', '#d9b98c']],
  ], centered(robotArm), PROP),
  def('rb-tin', '复古铁皮机器人', 'deco', [12.2, 6.8, 22.2], [
    ['retro', ['#c8473a', '#e0a526', '#2f8f8a']],
    ['retro', ['#2f8f8a', '#f4e7c8', '#c8473a']],
    ['industrial', ['#7c8085', '#c46a3a', '#e0a526']],
    ['cute', ['#a8d4f4', '#ffe08f', '#ff8f86']],
  ], centered(tinRobot), PROP),
  def('rb-mecha', '大型机甲模型', 'hobby', [34, 22, 53.5], [
    ['modern', ['#f4f4f2', '#3d3f44', '#3d5a80']],
    ['industrial', ['#6b6f63', '#3a3a3c', '#c46a3a']],
    ['retro', ['#c8473a', '#3a3a3c', '#e0a526']],
    ['modern', ['#3d3f44', '#24252a', '#c8473a']],
  ], mecha, PROP),
]
