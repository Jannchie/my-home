// 家用摄像头素材包：宠物摄像头（球形云台 / 猫耳萌系 / 零食投喂 / 激光逗猫 / 平板底座）、
// 室内安防（桌面云台 / 磁吸小方块 / 壁挂半球 / 壁挂枪机）、婴儿监视器（带夜灯的摄像头 + 带屏幕的接收器）、
// 门口（可视门铃装在大门外墙，摆了它就不再画默认门铃；猫眼摄像头的室内屏挂在门边）、运动相机套装。
// 摄像头的镜头都朝 +z（正面），一键布置按需要转向宠物区 / 婴儿床。约定见 kit.ts 开头。全部 id 以 hc- 开头。

import * as THREE from 'three'
import { ball, cyl, rbox, shade, toon, torus } from '../toon'
import { C, glow, type AssetDef } from '../kit'
import { G, P, PI, cylZ, fitGroup, lit, noOutline } from '../geo'
import { CL, I, M, N, define, type PalFlat } from '../packkit'

const LENS = '#1d2230'
const GLASS = '#3d6a9a'
const BLACK = '#26262a'

/** 壁挂物：背面（最小 z）贴到 -d/2，水平居中，最低点 = mount */
function fitWall(g: THREE.Object3D, mount: number, d: number) {
  const outer = fitGroup(g, mount, true)
  outer.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(outer, true)
  g.position.z += -d / 2 - b.min.z
  return outer
}
/** 镜头：黑色镜面 + 蓝玻璃 + 高光，朝 +z；(x, y) 为中心，z 为镜面所在平面 */
function lens(r: number, x: number, y: number, z: number, rim = LENS) {
  return G(cylZ(r, 0.5, rim, x, y, z + 0.25), cylZ(r * 0.62, 0.4, GLASS, x, y, z + 0.6), noOutline(ball(r * 0.18, '#ffffff', { x: x + r * 0.22, y: y + r * 0.22, z: z + 0.82 }, [1, 1, 0.4])))
}
/** 状态灯 */
const led = (x: number, y: number, z: number, color = '#5fe08a', r = 0.25) => lit(ball(r, color, { x, y, z }, [1, 1, 0.5]), color, 0.9)

// ---------- 宠物摄像头 ----------

/** 球形云台：圆柱底座 + 可转的球头（镜头 + 红外灯圈）：[机身, 底座, 点缀] */
function petDome([body, base, acc]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(4.2, 4.6, 5.6, base, {}, 28))
  g.add(torus(4.25, 0.25, acc, { y: 5.4, rx: PI / 2 }))
  g.add(ball(4.6, body, { y: 9.6 }))
  // 黑色面罩 + 镜头
  g.add(P(ball(3.3, BLACK, {}, [1, 1, 0.42]), 0, 10, 3.25))
  g.add(lens(1.2, 0, 10.3, 4.35))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2
    g.add(noOutline(lit(ball(0.22, '#7a2a2a', { x: Math.cos(a) * 2.2, y: 10.3 + Math.sin(a) * 2.2, z: 4.3 }), '#8a2a2a', 0.3)))
  }
  g.add(led(0, 7.2, 4.15))
  return fitGroup(g)
}
/** 萌系猫耳款：圆滚滚的头 + 两只耳朵 + 圆脸盘（镜头像鼻子）：[机身, 耳内 / 脸盘, 底座] */
function petEars([body, inner, base]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(4, 4.6, 2.4, base, {}, 24))
  g.add(cyl(1.4, 1.6, 1.6, base, { y: 2.4 }, 16))
  g.add(ball(5.4, body, { y: 8.6 }, [1, 0.88, 0.92]))
  for (const s of [-1, 1]) {
    const ear = P(cyl(0.2, 2.2, 3.8, body, {}, 4), s * 3.1, 12.6, 0, 0, PI / 4, s * -0.35)
    const earIn = P(cyl(0.1, 1.2, 2.4, inner, {}, 4), s * 3.05, 12.4, 0.95, 0, PI / 4, s * -0.35)
    g.add(ear, earIn)
  }
  // 黑色圆面罩 + 镜头，下方一颗小小的粉色指示灯
  g.add(P(ball(2.6, BLACK, {}, [1, 0.9, 0.3]), 0, 8.6, 4.4))
  g.add(lens(1.05, 0, 8.6, 4.75))
  g.add(led(0, 6.2, 4.7, inner, 0.35))
  return fitGroup(g)
}
/** 零食投喂款：方圆机身 + 顶上透明零食仓 + 前方出粮口（地上散着几颗零食）：[机身, 面板, 零食] */
function petTreat([body, face, treat]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(15, 20, 13, body, {}, 4))
  g.add(rbox(12, 12, 0.6, face, { y: 6.5, z: 6.5 }, 2.4))
  g.add(lens(1.5, 0, 14.2, 6.8))
  g.add(led(3.6, 15.4, 6.9))
  // 出粮口
  g.add(rbox(6, 2.6, 2, BLACK, { y: 2.6, z: 6.2 }, 0.8))
  g.add(rbox(7, 0.6, 3, body, { y: 2.2, z: 7.2 }, 0.3))
  // 顶部零食仓（透明）+ 盖
  const hopper = cyl(5, 4.6, 7, '#e9f4fb', { y: 20 }, 24)
  hopper.material = toon('#e9f4fb', { transparent: 0.45 })
  hopper.castShadow = false
  hopper.userData.noOutline = true
  g.add(hopper)
  for (let k = 0; k < 9; k++) g.add(ball(1, treat, { x: Math.cos(k * 2.1) * 2.6 * (k % 3 ? 1 : 0.3), y: 21.2 + (k % 3) * 1.4, z: Math.sin(k * 2.1) * 2.6 * (k % 3 ? 1 : 0.3) }, [1, 0.7, 1]))
  g.add(cyl(5.3, 5.3, 1.4, shade(body, -0.08), { y: 27 }, 24))
  g.add(cyl(1.2, 1.2, 0.8, face, { y: 28.4 }, 12))
  for (const [x, z] of [[-2, 10], [1.4, 11.4], [3.2, 9.6]]) g.add(ball(0.9, treat, { x, y: 0.55, z }, [1, 0.6, 1]))
  return fitGroup(g)
}
/** 激光逗猫款：矮圆底座 + 球头，镜头下方一个红色激光头，红点打在前面地上：[机身, 底座, 点缀] */
function petLaser([body, base, acc]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(5, 5.4, 3, base, {}, 28))
  g.add(cyl(3.6, 4.4, 3, body, { y: 3 }, 28))
  g.add(ball(4, body, { y: 9 }))
  g.add(P(ball(2.8, BLACK, {}, [1, 1, 0.45]), 0, 9.6, 2.9))
  g.add(lens(1, 0, 10.3, 3.85))
  // 激光头
  g.add(cylZ(0.6, 1.4, acc, 0, 8.1, 4.1, 12))
  g.add(lit(cylZ(0.3, 0.3, '#ff3030', 0, 8.1, 4.9, 10), '#ff3030', 1))
  g.add(torus(5.05, 0.3, acc, { y: 3, rx: PI / 2 }))
  return fitGroup(g)
}
/** 平板底座款：圆盘底座 + 斜靠的屏幕（屏上是爪印通话界面），顶边中间是摄像头：[外壳, 底座, 屏幕色] */
function petTablet([shell, base, screen]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(6.5, 7, 2, base, {}, 32))
  const panel = new THREE.Group()
  panel.add(rbox(20, 14, 1.4, shell, { y: 0 }, 1.2))
  panel.add(glow(17.4, 11.4, screen, { y: 1.3, z: 0.75 }, 0.5))
  // 爪印
  const paw = new THREE.Group()
  paw.add(ball(1.5, '#ffffff', {}, [1, 0.85, 0.3]))
  for (let k = 0; k < 4; k++) paw.add(ball(0.62, '#ffffff', { x: (k - 1.5) * 1.15, y: 1.8 - Math.abs(k - 1.5) * 0.4 }, [1, 1.2, 0.3]))
  paw.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) lit(m as THREE.Mesh, '#ffffff')
  })
  panel.add(P(paw, 0, 7, 1.15))
  panel.add(lens(0.55, 0, 13, 0.7))
  g.add(P(panel, 0, 2.6, -1.2, -0.28))
  g.add(P(rbox(3, 7, 1.4, base, {}, 0.6), 0, 1.6, -3.6, 0.5))
  return fitGroup(g)
}

const PET_P: PalFlat[] = [
  ['modern', M.white, '#e8e9ec', '#7ec8e3'],
  ['cute', C.pink, C.white, C.lemon],
  ['nordic', N.white, N.oak, N.sage],
  ['modern', M.char, M.black, '#f2a65a'],
]
const PET_EARS_P: PalFlat[] = [
  ['cute', C.white, C.pink, C.sakura],
  ['cute', '#f6d7a8', '#ffb6a3', C.white],
  ['nordic', N.gray, N.linen, N.white],
  ['modern', M.char, '#f0a0a8', M.black],
]
const PET_TREAT_P: PalFlat[] = [
  ['modern', M.white, M.light, '#b5763c'],
  ['nordic', N.white, N.oakL, '#b5763c'],
  ['cute', C.sky, C.white, '#c98a52'],
]
const PET_TABLET_P: PalFlat[] = [
  ['modern', M.black, M.char, '#7fb8e6'],
  ['cute', C.white, C.mint, '#ffc6d6'],
  ['nordic', N.white, N.oak, '#a9c7b8'],
]
const PET_LIMIT = { scope: 'house' as const, max: 2, group: 'hc-pet-cam' }
const pets: AssetDef[] = [
  define('hc-pet-dome', '宠物摄像头', 'pets', [9.2, 9.9, 14.2], PET_P, petDome, { prop: true, sizeLabel: '球形云台', limit: PET_LIMIT }),
  define('hc-pet-ears', '宠物摄像头', 'pets', [10.9, 10.7, 14.5], PET_EARS_P, petEars, { prop: true, sizeLabel: '猫耳萌系', limit: PET_LIMIT }),
  define('hc-pet-treat', '宠物摄像头', 'pets', [15, 18.8, 29.2], PET_TREAT_P, petTreat, { prop: true, sizeLabel: '零食投喂', limit: PET_LIMIT }),
  define('hc-pet-laser', '宠物摄像头', 'pets', [10.9, 10.9, 13], PET_P, petLaser, { prop: true, sizeLabel: '激光逗猫', limit: PET_LIMIT }),
  define('hc-pet-screen', '宠物摄像头', 'pets', [20, 14, 17.7], PET_TABLET_P, petTablet, { prop: true, sizeLabel: '平板底座', limit: PET_LIMIT }),
]

// ---------- 室内安防摄像头 ----------

/** 桌面云台：方底座 + 蛋形机头（黑色面罩）：[机身, 底座] */
function secPanTilt([body, base]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(7.6, 2.4, 7.6, base, {}, 1.4))
  g.add(cyl(2.6, 3.2, 3.2, body, { y: 2.4 }, 24))
  g.add(ball(3.9, body, { y: 9 }, [1, 1.12, 1]))
  g.add(P(ball(2.7, BLACK, {}, [1, 1.2, 0.4]), 0, 9.4, 2.8))
  g.add(lens(0.9, 0, 10, 3.7))
  g.add(led(0, 7.6, 3.75))
  return fitGroup(g)
}
/** 磁吸小方块：圆形磁吸底座 + 圆角方块机身：[机身, 底座] */
function secCube([body, base]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(2.8, 3, 1, base, {}, 24))
  g.add(ball(1.2, base, { y: 1.6 }))
  g.add(P(rbox(5.4, 5.4, 4.4, body, {}, 1.4), 0, 2.4, 0, -0.12))
  g.add(lens(1, 0, 5.3, 2.2))
  g.add(led(1.6, 6.6, 2.15))
  return fitGroup(g)
}
const SEC_MOUNT = 212
/** 壁挂半球：墙座 + L 形支臂 + 朝下的烟色半球罩：[机身, 支架] */
function secWallDome([body, arm]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(8, 10, 1.6, arm, { y: 4 }, 0.8))
  g.add(rbox(3.2, 3.2, 9, arm, { y: 9, z: 4.5 }, 1))
  g.add(cyl(6, 6, 2.2, body, { y: 9.2, z: 10 }, 32))
  const dome = ball(5.2, '#4a4f5a', { y: 9.2, z: 10 }, [1, 0.85, 1])
  dome.material = toon('#4a4f5a', { transparent: 0.7 })
  g.add(dome)
  g.add(P(ball(1.6, LENS), 0, 6.3, 11.6))
  g.add(led(4.6, 10.3, 15.6))
  return fitWall(g, SEC_MOUNT, 16.4)
}
/** 壁挂枪机：墙座 + 万向节 + 斜朝下的长筒（带遮阳罩）：[机身, 支架] */
function secWallBullet([body, arm]: string[]) {
  const g = new THREE.Group()
  g.add(cylZ(4, 1.4, arm, 0, 6, 0.7, 24))
  g.add(cyl(1.1, 1.1, 5, arm, { y: 4.5, z: 3, rx: PI / 2 }, 12))
  g.add(ball(1.6, arm, { y: 6, z: 6 }))
  const cam = new THREE.Group()
  cam.add(cylZ(3.2, 15, body, 0, 0, 7.5, 24))
  cam.add(rbox(7.6, 0.6, 16.5, body, { y: 3.1, z: 7.8 }, 0.3))
  cam.add(cylZ(2.6, 0.4, LENS, 0, 0, 15.1, 24))
  cam.add(cylZ(1.3, 0.4, GLASS, 0, 0, 15.4, 20))
  g.add(P(cam, 0, 8.6, 5.6, 0.3))
  return fitWall(g, SEC_MOUNT, 22)
}
const SEC_P: PalFlat[] = [
  ['modern', M.white, M.light],
  ['modern', M.black, M.char],
  ['nordic', N.white, N.gray],
  ['industrial', I.steel, I.iron],
]
const SEC_LIMIT = { scope: 'house' as const, max: 2, group: 'hc-sec-cam' }
const security: AssetDef[] = [
  define('hc-sec-pt', '安防摄像头', 'appliance', [7.9, 8.6, 13.4], SEC_P, secPanTilt, { prop: true, sizeLabel: '桌面云台', limit: SEC_LIMIT }),
  define('hc-sec-cube', '安防摄像头', 'appliance', [6, 6.2, 7.3], SEC_P, secCube, { prop: true, sizeLabel: '磁吸小方块', limit: SEC_LIMIT }),
  define('hc-sec-wall-dome', '安防摄像头', 'appliance', [12, 17.2, 10], SEC_P, secWallDome, { mount: SEC_MOUNT, sizeLabel: '壁挂半球', limit: SEC_LIMIT }),
  define('hc-sec-wall-bullet', '安防摄像头', 'appliance', [8, 22, 11.1], SEC_P, secWallBullet, { mount: SEC_MOUNT, sizeLabel: '壁挂枪机', limit: SEC_LIMIT }),
]

// ---------- 婴儿监视器 ----------

/** 婴儿监视器摄像头：月亮形夜灯底座（暖光）+ 短杆上的圆头摄像头：[机身, 夜灯色, 点缀] */
function babyCam([body, light, acc]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(5.4, 5.8, 2.2, body, {}, 32))
  // 夜灯：发光的半圆罩
  g.add(lit(ball(4.6, light, { y: 2.2 }, [1, 0.7, 1]), light, 0.75))
  g.add(cyl(0.9, 0.9, 6, acc, { y: 4.6 }, 12))
  g.add(ball(3.2, body, { y: 12.6 }))
  g.add(cylZ(1.7, 0.4, BLACK, 0, 12.8, 3.05))
  g.add(lens(0.8, 0, 12.8, 3.2))
  // 两只小耳朵（小熊）
  for (const s of [-1, 1]) g.add(ball(1.1, acc, { x: s * 2.2, y: 15.2 }, [1, 1, 0.6]))
  return fitGroup(g)
}
/** 婴儿监视器接收器：带屏幕的手持机，靠支脚斜立，顶上一根短天线：[外壳, 屏幕色, 按键] */
function babyRecv([shell, screen, key]: string[]) {
  const g = new THREE.Group()
  const body = new THREE.Group()
  body.add(rbox(12, 9, 2, shell, {}, 1))
  body.add(glow(8.2, 5.6, screen, { x: -0.9, y: 2.4, z: 1.05 }, 0.6))
  // 屏上睡着的宝宝（一颗头 + 被子）
  body.add(noOutline(lit(ball(0.9, '#ffe2c8', { x: -2.6, y: 5.2, z: 1.45 }, [1, 1, 0.2]), '#ffe2c8', 0.5)))
  body.add(noOutline(lit(rbox(4, 1.6, 0.2, '#ffd6e0', { x: -0.6, y: 4.2, z: 1.4 }, 0.5), '#ffd6e0', 0.5)))
  for (let i = 0; i < 3; i++) body.add(cylZ(0.5, 0.4, key, 4.4, 2.2 + i * 1.9, 1.1, 12))
  body.add(cyl(0.35, 0.45, 3.4, shell, { x: 4.5, y: 9 }, 10))
  body.add(ball(0.55, shell, { x: 4.5, y: 12.5 }))
  g.add(P(body, 0, 0.6, 0, -0.22))
  g.add(P(rbox(6, 6.5, 0.6, shade(shell, -0.1), {}, 0.3), 0, 0, -2.4, -0.55))
  return fitGroup(g)
}
const BABY_P: PalFlat[] = [
  ['cute', C.white, C.lemon, C.sky],
  ['cute', C.white, '#ffd1a8', C.pink],
  ['nordic', N.white, '#ffe6b8', N.sage],
  ['modern', M.white, '#fff0c8', M.gray],
]
const BABY_RECV_P: PalFlat[] = [
  ['cute', C.white, '#9fd0f0', C.pink],
  ['nordic', N.white, '#a9c7b8', N.oak],
  ['modern', M.char, '#7fb8e6', M.light],
]
const baby: AssetDef[] = [
  define('hc-baby-cam', '婴儿监视器', 'kids', [11.7, 11.7, 17.4], BABY_P, babyCam, { prop: true, sizeLabel: '摄像头（带夜灯）', limit: { scope: 'house', max: 1, group: 'hc-baby-cam' } }),
  define('hc-baby-recv', '婴儿监视器', 'kids', [12, 5.2, 16.3], BABY_RECV_P, babyRecv, { prop: true, sizeLabel: '接收器（带屏幕）', limit: { scope: 'house', max: 1, group: 'hc-baby-recv' } }),
]

// ---------- 门口：可视门铃、猫眼摄像头 ----------

const BELL_MOUNT = 128
/** 可视门铃（装在大门外墙）：竖长圆角机身，上方镜头、下方发光圈按钮：[机身, 面板, 灯圈] */
function videoDoorbell([body, face, ring]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(6.4, 15, 2.6, body, {}, 1.6))
  g.add(rbox(5.4, 7, 0.4, face, { y: 7, z: 1.3 }, 1.2))
  g.add(lens(1.2, 0, 10.6, 1.5))
  g.add(lit(torus(1.5, 0.3, ring, { y: 3.6, z: 1.45 }), ring, 0.9))
  g.add(cylZ(1.15, 0.6, shade(body, 0.08), 0, 3.6, 1.45, 20))
  return fitWall(g, BELL_MOUNT, 3.4)
}
const PEEP_MOUNT = 128
/** 猫眼摄像头的室内屏（挂在门边，平时显示门外画面）：[外壳, 屏幕色] */
function peepholeScreen([shell, screen]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(13, 19, 1.8, shell, {}, 1.2))
  g.add(glow(10.6, 13.6, screen, { y: 3.8, z: 0.95 }, 0.55))
  // 画面：门外走廊（地面 + 门框）
  g.add(noOutline(lit(rbox(10, 3, 0.2, shade(screen, -0.18), { y: 4.2, z: 1.3 }, 0.1), shade(screen, -0.18), 0.4)))
  g.add(noOutline(lit(rbox(3.4, 7.6, 0.2, shade(screen, 0.15), { x: 2.2, y: 7.2, z: 1.3 }, 0.1), shade(screen, 0.15), 0.4)))
  g.add(cylZ(0.9, 0.4, shade(shell, -0.15), 0, 1.8, 0.95, 16))
  return fitWall(g, PEEP_MOUNT, 2.2)
}
const door: AssetDef[] = [
  define('hc-doorbell-video', '可视门铃', 'entrance', [6.4, 4.1, 15], [
    ['modern', M.black, M.char, '#7fc8ff'],
    ['modern', M.white, M.char, '#7fc8ff'],
    ['classic', '#a8916a', BLACK, '#ffd27a'],
    ['industrial', I.steel, I.iron, '#7fc8ff'],
  ], videoDoorbell, { mount: BELL_MOUNT, limit: { scope: 'house', max: 1 } }),
  define('hc-peephole', '猫眼摄像头（室内屏）', 'entrance', [13, 2.4, 19], [
    ['modern', M.black, '#8fb4d8'],
    ['modern', M.white, '#8fb4d8'],
    ['chinese', '#8a6a4a', '#9fc0d8'],
    ['classic', CL.gold, '#9fc0d8'],
  ], peepholeScreen, { mount: PEEP_MOUNT, limit: { scope: 'house', max: 1 } }),
]

// ---------- 运动相机套装（放架子上） ----------

/** 运动相机套装：防水壳里的相机立在迷你支架上 + 一只收纳小包 + 两块备用电池：[机身, 支架, 包] */
function actionKit([body, mount, bag]: string[]) {
  const g = new THREE.Group()
  // 支架：底板 + 两片夹扣
  g.add(rbox(6, 1.2, 5, mount, {}, 0.5))
  for (const s of [-1, 1]) g.add(rbox(0.6, 2.6, 2.4, mount, { x: s * 0.9, y: 1.2 }, 0.2))
  // 防水壳 + 相机
  const housing = rbox(7.4, 5.6, 4.6, '#dfeef8', { y: 3.4 }, 1)
  housing.material = toon('#dfeef8', { transparent: 0.5 })
  housing.castShadow = false
  housing.userData.noOutline = true
  g.add(housing, rbox(6.4, 4.4, 3.2, body, { y: 4 }, 0.6))
  g.add(lens(1.1, -1.5, 6.6, 1.6))
  g.add(lit(rbox(1.8, 1.2, 0.2, '#9fd0f0', { x: 1.6, y: 6.6, z: 1.65 }, 0.1), '#9fd0f0', 0.5))
  g.add(rbox(2, 1, 1, mount, { x: 3.8, y: 3.6, z: 0 }, 0.3))
  // 收纳包 + 电池
  g.add(rbox(9, 4, 6.4, bag, { x: 10, z: -0.6 }, 1.8))
  g.add(rbox(8.6, 0.4, 0.4, shade(bag, -0.2), { x: 10, y: 3.6, z: 2.6 }, 0.15))
  for (const k of [0, 1]) g.add(P(rbox(3.4, 1, 4, BLACK, {}, 0.3), 3.6 + k * 0.4, k, 4.6, 0, 0.3 + k * 0.2))
  return fitGroup(g)
}
const action: AssetDef[] = [
  define('hc-action-kit', '运动相机套装', 'hobby', [18.2, 10.9, 9.5], [
    ['modern', M.black, M.char, '#3d3f44'],
    ['industrial', I.iron, I.steel, '#4a5a3a'],
    ['cute', M.black, C.sky, C.pink],
  ], actionKit, { prop: true, limit: { scope: 'house', max: 1 } }),
]

export const HOME_CAMERAS: AssetDef[] = [...pets, ...security, ...baby, ...door, ...action]
