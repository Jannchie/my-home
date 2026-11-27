// 居家细节补充：立式空调、卧式冷柜、烟雾报警器、插座面板、小夜灯、电热毛巾架、皂盒、首饰盒、保温热水瓶、厨房纸巾架、
// 夹子灯、毛巾梯、圆形高吧桌、收纳鞋凳、中式香几、官皮箱、奖杯陈列柜、落地篮球架、浴帘、壁挂投影仪。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；壁挂件用 fitWall 把最低点放到 mount、背面贴 z = -d/2；带台面 / 层板的不平移，声明 surface / surfaces。

import * as THREE from 'three'
import { ball, box, cup, cyl, nub, puck, rbox, shade, torus, tray } from '../toon'
import { C, carcass, doorRow, ellipsePoly, rectPoly, type AssetDef } from '../kit'
import { G, P, PI, bakeMeshes, cylX, cylZ, fitGroup, fitWall, ghost, glassPane, lit, mesh, noOutline, rod3, strutBox, tube, type V3 } from '../geo'
import { CL, CN, I, J, M, N, R, F, PROP, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const CHROME = '#dfe3e8'
const DARK = '#2a2b30'
const RUBBER = '#33343a'
const SCREEN = '#7fd8ff'
const LAMP = '#fff0b8'
const GLASS = '#cfe8f5'
const BRASS = '#d3ad62'
const GOLD = '#e2bd5a'
const GEM = '#ff6f8a'
const MIRROR = '#dce9f0'
const PAPER = '#fbfaf6'
const CORE = '#c9a47a'
const BALL_ORANGE = '#e8762f'

// ---------- 立式空调柜机：细高圆角机身，上部深色出风口里一排横百叶，正面一块小屏，底部竖条进风格栅 ----------

const AT = { w: 48, d: 30, h: 180 }
function airconTower(p: string[]) {
  const [body, louver, accent] = p
  const g = new THREE.Group()
  const fz = AT.d / 2
  // 底座（略收进去）+ 机身
  g.add(rbox(AT.w - 4, 4, AT.d - 4, shade(body, -0.18), {}, 1))
  g.add(rbox(AT.w, AT.h - 4, AT.d, body, { y: 4 }, 5))
  // 上部出风口：深色凹框 + 9 片横百叶（略往下斜）
  g.add(rbox(36, 52, 0.6, DARK, { y: 118, z: fz + 0.2 }, 0.4))
  // （百叶、导风条、格栅缝都是一两厘米宽的窄条：直角盒，一条 12 个面；圆角盒一条 108 个）
  for (let k = 0; k < 9; k++) g.add(P(nub(33, 1.2, 1.8, louver), 0, 122.5 + k * 5.2, fz + 0.6, 0.25))
  // 两侧竖导风条
  for (const s of [-1, 1]) g.add(nub(1.2, 48, 1.6, louver, { x: s * 15, y: 120, z: fz + 0.5 }))
  // 小屏：深色底框 + 发光数字屏 + 下面一条点缀色带
  g.add(rbox(14, 7, 0.6, DARK, { y: 99, z: fz + 0.2 }, 0.4))
  g.add(lit(rbox(9, 3.6, 0.6, SCREEN, { x: -1.5, y: 100.7, z: fz + 0.5 }, 0.2), SCREEN, 0.75))
  g.add(lit(ball(0.5, '#7dff9a', { x: 5, y: 102.5, z: fz + 0.8 }), '#7dff9a', 0.8))
  g.add(noOutline(box(30, 0.8, 0.6, accent, { y: 93, z: fz + 0.2 })))
  // 底部进风格栅：浅一档的面板 + 竖缝
  g.add(rbox(36, 30, 0.6, shade(body, -0.08), { y: 10, z: fz + 0.2 }, 0.5))
  for (let k = 0; k < 11; k++) g.add(noOutline(box(0.9, 26, 0.6, DARK, { x: -15 + k * 3, y: 12, z: fz + 0.5 })))
  // 两侧的回风格栅
  for (const s of [-1, 1]) {
    g.add(rbox(0.6, 22, 18, shade(body, -0.08), { x: s * (AT.w / 2 + 0.1), y: 14 }, 0.3))
    for (let k = 0; k < 5; k++) g.add(noOutline(box(0.6, 0.8, 15, DARK, { x: s * (AT.w / 2 + 0.3), y: 17 + k * 4 })))
  }
  // 背面：接管口
  g.add(cylZ(3, 2, shade(body, -0.15), 14, 30, -AT.d / 2 - 0.6, 14))
  return g
}

// ---------- 卧式冷柜：白色箱体 + 顶部翻盖（前沿一条把手），右侧温控旋钮，前面底部散热格栅，四只小脚 ----------

const CF = { w: 95, d: 55, h: 85 }
function chestFreezer(p: string[]) {
  const [body, seal, accent] = p
  const g = new THREE.Group()
  const fz = CF.d / 2
  // 小脚
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.2, 2.4, 3.4, RUBBER, { x: sx * (CF.w / 2 - 7), z: sz * (fz - 6) }, 10))
  // 箱体
  g.add(rbox(CF.w, 73, CF.d, body, { y: 3 }, 3))
  // 箱体和盖子之间的密封条（缩进去一圈；上沿伸进盖子 0.2——原先比盖子底面矮 0.2，盖子只靠背后的铰链挂着）
  g.add(rbox(CF.w - 2, 2, CF.d - 2, seal, { y: 75.6 }, 0.5))
  // 翻盖：一整块，顶面就是台面
  g.add(rbox(CF.w, 7.6, CF.d, body, { y: CF.h - 7.6 }, 2.4))
  // 把手：盖子前沿一条横把手
  g.add(rbox(34, 2.4, 2.6, accent, { y: 79.6, z: fz + 0.6 }, 0.9))
  // 背面两只铰链
  for (const sx of [-1, 1]) g.add(rbox(8, 6, 1.6, STEEL, { x: sx * 30, y: 74, z: -fz - 0.4 }, 0.4))
  // 右侧：温控面板 + 旋钮
  g.add(rbox(0.6, 12, 14, seal, { x: CF.w / 2 + 0.1, y: 58, z: 10 }, 0.3))
  g.add(cylX(2.6, 1.6, accent, CF.w / 2 + 0.9, 64, 10, 14))
  g.add(noOutline(box(0.4, 2.2, 0.5, DARK, { x: CF.w / 2 + 1.8, y: 64.6, z: 10 })))
  // 正面：右上的指示灯、底部的散热格栅
  g.add(lit(ball(0.7, '#7dff9a', { x: CF.w / 2 - 8, y: 70, z: fz + 0.1 }), '#7dff9a', 0.8))
  g.add(rbox(60, 8, 0.6, shade(body, -0.1), { y: 6, z: fz + 0.1 }, 0.4))
  for (let k = 0; k < 3; k++) g.add(noOutline(box(56, 0.8, 0.6, DARK, { y: 7.6 + k * 2.2, z: fz + 0.35 })))
  return g
}

// ---------- 烟雾报警器：贴墙的圆饼——底座 + 微微鼓起的罩子，一圈进烟槽，中间测试按钮，旁边一颗红色指示灯 ----------

const SA = { w: 11, d: 4.5, h: 11, mount: 220 }
function smokeAlarm(p: string[]) {
  const [body, ring, accent] = p
  const g = new THREE.Group()
  const cy = SA.h / 2
  g.add(cylZ(5.5, 1.2, shade(body, -0.06), 0, cy, 0.6, 24))
  g.add(P(puck(5, 2.6, body), 0, cy, 2.5, PI / 2))
  // 进烟槽：两圈细环（和罩子一样一圈 24 段，折线对得上）
  g.add(noOutline(torus(4.1, 0.22, ring, { y: cy, z: 3.7 }, PI * 2, [6, 24])))
  g.add(noOutline(torus(3.1, 0.22, ring, { y: cy, z: 3.85 }, PI * 2, [6, 24])))
  // 测试按钮 + 指示灯（在按钮和内圈细环之间的空当里，不压着细环）
  g.add(cylZ(1.5, 0.8, accent, 0, cy, 4.1, 14))
  g.add(lit(ball(0.4, '#ff4a4a', { x: 1.55, y: cy + 1.55, z: 3.8 }), '#ff4a4a', 0.9))
  return fitWall(g, SA.mount, SA.d)
}

// ---------- 墙面插座面板：日式竖款两口——外框 + 内盖板，上下两个插座面，各有两条竖插孔和一个接地孔 ----------

const OL = { w: 7, d: 1, h: 12, mount: 30 }
function outlet(p: string[]) {
  const [plate, face, slot] = p
  const g = new THREE.Group()
  g.add(rbox(OL.w, OL.h, 0.5, plate, { z: 0.25 }, 0.4))
  // 盖板、插座面只有 3mm 厚，插孔更小：都用直角盒
  g.add(box(5.2, 10, 0.3, shade(plate, -0.04), { y: 1, z: 0.55 }))
  for (const y of [2.1, 6.5]) {
    g.add(box(4, 3.4, 0.3, face, { y, z: 0.8 }))
    // 日式 A 型插孔：左边略长
    g.add(noOutline(box(0.4, 1.4, 0.2, slot, { x: -0.65, y: y + 1.1, z: 0.95 })))
    g.add(noOutline(box(0.4, 1.2, 0.2, slot, { x: 0.65, y: y + 1.2, z: 0.95 })))
    g.add(noOutline(box(0.7, 0.5, 0.2, slot, { y: y + 0.35, z: 0.95 })))
  }
  return fitWall(g, OL.mount, OL.d)
}

// ---------- 插座小夜灯：贴墙的小方盒（插在插座上）+ 下半部一块半月形发光灯罩，顶上一颗光感小窗 ----------

const NL = { w: 7, d: 5, h: 9, mount: 30 }
function nightLight(p: string[]) {
  const [body, glowC, accent] = p
  const g = new THREE.Group()
  g.add(rbox(6.4, 9, 2.4, body, { z: 1.2 }, 0.8))
  // 半月形灯罩：半个圆柱（截面是下半圆），轴朝前
  const geo = new THREE.CylinderGeometry(3.3, 3.3, 2.2, 12, 1, false, -PI / 2, PI)
  const moon = lit(mesh(geo, glowC), glowC, 0.85)
  g.add(P(moon, 0, 4.2, 3.4, PI / 2))
  // 半月上沿的一条装饰压条 + 光感窗
  g.add(rbox(6.8, 0.8, 2.6, accent, { y: 3.9, z: 3.4 }, 0.3))
  g.add(cylZ(0.6, 0.4, DARK, 0, 7.2, 2.5, 12))
  return fitWall(g, NL.mount, NL.d)
}

// ---------- 电热毛巾架：两根竖管 + 分两组的横杆，墙上四只支座，右下一只开关盒连着电源线进墙，上面搭着一条毛巾 ----------

const TW = { w: 50, d: 9, h: 80, mount: 90 }
const TW_RUNGS = [5, 13, 21, 29, 43, 51, 59, 73]
function towelWarmer(p: string[]) {
  const [metal, towel, stripe] = p
  const g = new THREE.Group()
  const z = 6
  const hx = 22
  // 竖管（两头圆帽）+ 横杆
  for (const s of [-1, 1]) {
    // 竖管和两头的圆帽同样一圈 12 段
    g.add(cyl(1.5, 1.5, TW.h - 2, metal, { x: s * hx, y: 1, z }, 12))
    g.add(ball(1.5, metal, { x: s * hx, y: 1, z }, undefined, [12, 6]))
    g.add(ball(1.5, metal, { x: s * hx, y: TW.h - 1, z }, undefined, [12, 6]))
  }
  for (const y of TW_RUNGS) g.add(cylX(1, hx * 2, metal, 0, y, z, 8))
  // 墙上的支座：圆座 + 短管
  for (const s of [-1, 1])
    for (const y of [10, 66]) {
      g.add(cylZ(2.2, 0.8, metal, s * hx, y, 0.4, 12))
      g.add(cylZ(0.9, z, metal, s * hx, y, z / 2, 8))
    }
  // 开关盒（右竖管外侧）+ 指示灯 + 进墙的电源线
  g.add(rbox(3.6, 7, 3.6, shade(metal, -0.1), { x: hx + 3, y: 2, z }, 0.8))
  g.add(lit(ball(0.45, '#ff8a3d', { x: hx + 3, y: 7.4, z: z + 1.9 }), '#ff8a3d', 0.9))
  g.add(tube([[hx + 3, 2.6, z - 1.8], [hx + 3.5, 2.4, z - 3.5], [hx + 4.5, 2.2, 1.5], [hx + 4.8, 2.2, 0.2]], 0.35, '#f2f2ee', { seg: 10, radial: 6 }))
  // 毛巾：搭在第 6 根横杆上，前片长、后片短，前片下沿一条色带
  const ty = TW_RUNGS[5]
  g.add(cylX(1.7, 30, towel, 0, ty, z, 12))
  g.add(rbox(30, 24, 0.8, towel, { y: ty - 24, z: z + 1.4 }, 0.35))
  g.add(rbox(30, 14, 0.8, towel, { y: ty - 14, z: z - 1.4 }, 0.35))
  g.add(rbox(30.4, 2.2, 1.2, stripe, { y: ty - 20, z: z + 1.4 }, 0.4))
  return fitWall(g, TW.mount, TW.d)
}

// ---------- 皂盒和肥皂：陶瓷浅盒里一排沥水棱，上面一块圆角肥皂（顶面压着一块椭圆印） ----------

function soapDish(p: string[]) {
  const [dish, soap] = p
  const g = new THREE.Group()
  g.add(tray(12, 2.2, 8, 0.6, dish, {}, 0.28))
  for (let k = 0; k < 6; k++) g.add(nub(0.6, 0.8, 6.6, shade(dish, -0.05), { x: -4 + k * 1.6, y: 0.5 }))
  g.add(rbox(8.2, 2.3, 5.4, soap, { y: 1.25 }, 1))
  g.add(noOutline(P(ball(1.9, shade(soap, -0.1), {}, [1.3, 0.12, 0.7]), 0, 3.52, 0)))
  return g
}

// ---------- 首饰盒：两层抽屉的木盒，顶上一格绒布托盘（戒指卷、项链），盒盖往后掀开，盖子里面一面小镜子 ----------

const JB = { w: 25, d: 18 }
function jewelryBox(p: string[]) {
  const [wood, velvet, knob] = p
  const g = new THREE.Group()
  const fz = JB.d / 2
  // 抽屉柜部分（实心）+ 两只抽屉面板和小圆钮
  g.add(rbox(JB.w, 12, JB.d, wood, {}, 0.8))
  for (const y of [0.8, 6.3]) {
    g.add(rbox(23.4, 4.9, 0.6, shade(wood, 0.08), { y, z: fz + 0.1 }, 0.3))
    g.add(ball(0.7, knob, { y: y + 2.45, z: fz + 0.7 }))
  }
  // 顶层托盘：空心的浅盒，内衬绒布，中间一道隔板
  g.add(tray(JB.w, 4.2, JB.d, 0.8, wood, { y: 11.8 }, 0.35))
  g.add(rbox(JB.w - 1.8, 0.6, JB.d - 1.8, velvet, { y: 12.5 }, 0.2))
  g.add(rbox(0.6, 3, JB.d - 1.8, wood, { x: 1, y: 12.9 }, 0.2))
  // 左格：四条戒指卷，每两条之间夹一枚戒指（原先只有三条卷，第三枚戒指只有一侧靠着卷、立在半空）
  const ry = 13.1
  for (let k = 0; k < 4; k++) g.add(cylX(1.05, 9.6, shade(velvet, -0.06), -6.3, ry + 1, -5 + k * 2.3, 10))
  const rings: [number, number, string][] = [
    [-9, -3.85, GEM],
    [-5.5, -1.55, '#7fd0ff'],
    [-3.2, 0.75, '#ffffff'],
  ]
  for (const [x, z, gem] of rings) {
    // 戒指直径不到 2cm、项链只有一两毫米粗：圆环一圈 12 / 20 段
    g.add(torus(0.85, 0.16, GOLD, { x, y: ry + 2.1, z }, PI * 2, [6, 12]))
    g.add(ball(0.32, gem, { x, y: ry + 3.05, z }, undefined, [6, 4]))
  }
  // 右格：一条盘起来的项链 + 吊坠（项链压在绒布上）
  g.add(torus(3, 0.13, GOLD, { x: 7, y: ry + 0.05, z: 1, rx: PI / 2 }, PI * 2, [5, 20]))
  g.add(ball(0.55, GEM, { x: 7, y: ry + 0.5, z: 4.4 }, [1, 0.7, 1.2]))
  // 盒盖：铰链在后上沿，掀开 100°；里面一面镜子
  const lid = new THREE.Group()
  lid.add(rbox(JB.w, 2, JB.d, wood, {}, 0.6))
  lid.add(rbox(JB.w - 1.2, 0.5, JB.d - 1.2, velvet, { y: -0.2 }, 0.2))
  lid.add(noOutline(rbox(JB.w - 6, 0.3, JB.d - 6, MIRROR, { y: -0.4 }, 0.1)))
  lid.children.forEach((c) => (c.position.z += JB.d / 2))
  lid.position.set(0, 16, -fz)
  lid.rotation.x = (-100 * PI) / 180
  g.add(lid)
  // 后沿两只小铰链
  for (const s of [-1, 1]) g.add(nub(2.4, 1.6, 0.6, knob, { x: s * 7, y: 14.6, z: -fz - 0.2 }))
  return fitGroup(g)
}

// ---------- 保温热水瓶：粗圆筒瓶身（一圈小碎花 + 水位窗），顶上圆鼓盖带大按压钮，前面伸出出水嘴，提手折在后面 ----------

function thermos(p: string[]) {
  const [body, cap, flower] = p
  const g = new THREE.Group()
  const r = 7
  // 瓶身直径 14cm：一圈 24 段（底圈、瓶身、瓶口圈同样的段数）
  g.add(cyl(r + 0.3, r + 0.5, 2.2, cap, {}, 24))
  g.add(cyl(r, r, 21, body, { y: 2.2 }, 24))
  g.add(cyl(r + 0.3, r + 0.3, 1.6, cap, { y: 22.6 }, 24))
  // 顶盖：扁圆鼓 + 按压钮
  g.add(ball(6.8, cap, { y: 24 }, [1, 0.5, 1]))
  g.add(cyl(2.8, 3, 1.6, flower, { y: 26.8 }, 16))
  g.add(cyl(2.2, 2.2, 0.5, shade(flower, 0.15), { y: 28.2 }, 16))
  // 出水嘴：从顶盖前面伸出、往下弯；嘴口一只圆头封住（弯管两端不封口，从下面能看进管子里）
  g.add(tube([[0, 25.5, 4], [0, 25.8, 7.5], [0, 25, 9.6], [0, 23.4, 10.4]], 1.1, cap, { seg: 10, radial: 8 }))
  g.add(ball(1.1, cap, { y: 23.4, z: 10.4 }, undefined, [8, 4]))
  // 水位窗（前面偏左，按瓶身弧面转过去）
  const wa = -0.5
  g.add(ghost(rbox(1.6, 13, 0.8, GLASS, { x: Math.sin(wa) * (r - 0.1), y: 5, z: Math.cos(wa) * (r - 0.1), ry: wa }, 0.3), GLASS, 0.6))
  // 一圈小碎花（避开水位窗）：每朵一片圆花瓣 + 花心 + 两片叶，都是贴着瓶身、朝外的薄片
  const onBody = (aa: number, rr: number) => ({ x: Math.sin(aa) * rr, z: Math.cos(aa) * rr })
  // 圆片的轴（局部 y）转到径向朝外：先绕 z 转 -90°（轴到 +x），再绕 y 转到角度 aa
  const disc = (rad: number, color: string, aa: number, rr: number, y: number) => noOutline(cyl(rad, rad, 0.3, color, { ...onBody(aa, rr), y: y - 0.15, rz: -PI / 2, ry: aa - PI / 2 }, rad > 1 ? 10 : 6))
  for (const a of [0.7, 1.75, 2.8, 3.85, 4.9]) {
    for (const [y, sc] of [
      [9, 1],
      [16, 0.8],
    ] as [number, number][]) {
      const aa = a + (y > 10 ? 0.5 : 0)
      g.add(disc(1.3 * sc, flower, aa, r - 0.05, y))
      g.add(disc(0.45 * sc, '#fff3b0', aa, r + 0.15, y))
      for (const s of [-1, 1]) g.add(noOutline(box(1.8 * sc, 0.7 * sc, 0.3, '#6fae6a', { ...onBody(aa + s * 0.2, r - 0.05), y: y - 1.7 * sc, ry: aa + s * 0.2, rz: s * 0.6 })))
    }
  }
  // 提手：两侧的转轴 + 往后折下来的弓形提梁
  // 转轴做得够长，把提梁的两个端头整个包住（原先提梁端头有一半露在转轴外面，从前面能看进管口）
  for (const s of [-1, 1]) g.add(cylX(1, 2.2, cap, s * (r + 0.9), 23.4, 0, 8))
  g.add(tube([[-(r + 1), 23.4, 0], [-(r + 1.4), 24.2, -4.5], [0, 24.8, -(r + 2.6)], [r + 1.4, 24.2, -4.5], [r + 1, 23.4, 0]], 0.6, shade(cap, -0.1), { seg: 20, radial: 6 }))
  return fitGroup(g)
}

// ---------- 立式厨房纸巾架：圆底座 + 立杆 + 顶珠，套着一卷厨房纸（芯露出来，最外一张从正面沿切线翘出来一截） ----------

function paperTowel(p: string[]) {
  const [stand, knob] = p
  const g = new THREE.Group()
  g.add(puck(7, 1.6, stand))
  g.add(cyl(0.7, 0.7, 30, stand, { y: 1.4 }, 8))
  g.add(ball(1.3, knob, { y: 31.6 }))
  // 纸卷 + 纸芯 + 芯孔
  g.add(cyl(6, 6, 26, PAPER, { y: 2.2 }, 24))
  g.add(cyl(2.2, 2.2, 0.3, CORE, { y: 28.1 }, 12))
  g.add(cyl(1.5, 1.5, 0.3, shade(CORE, -0.3), { y: 28.2 }, 12))
  // 底座上一圈托住纸卷的小台
  g.add(cyl(2.6, 3, 0.9, stand, { y: 1.4 }, 12))
  // 最外一张：纸是绕竖轴卷的，所以松开的一张是整卷高的竖片，从正面沿切线往右前方翘出来
  const fa = -0.28
  g.add(P(box(7, 25, 0.25, PAPER), Math.cos(fa) * 3, 15.1, 6.05 - Math.sin(fa) * 3, 0, fa))
  return g
}

// ---------- 夹子灯：张开的弹簧夹（上下夹片、钢簧、橡胶垫）+ 一截软管，顶端一只小灯罩朝前下方，罩口发光 ----------

function clipLamp(p: string[]) {
  const [main, neck] = p
  const g = new THREE.Group()
  const hz = -4
  const hy = 2.6
  const a = 0.44
  // 下夹片：平放，后半截是把手
  g.add(rbox(5, 0.8, 15, main, { z: -1.5 }, 0.35))
  // 上夹片：穿过转轴的一整片，前端张开、后端压下来
  const dir: [number, number] = [Math.cos(a), Math.sin(a)]
  g.add(P(rbox(5, 0.8, 16, main, {}, 0.35), 0, hy + dir[1] * 3, hz + dir[0] * 3, -a))
  // 钢簧 + 转轴
  g.add(cylX(1.3, 5.8, STEEL, 0, hy - 0.4, hz, 10))
  g.add(cylX(0.5, 6.6, STEEL, 0, hy - 0.4, hz, 6))
  // 夹口的橡胶垫
  g.add(box(4.4, 0.6, 2.2, RUBBER, { y: 0.7, z: 4.5 }))
  const tip: [number, number] = [hz + dir[0] * 10.5, hy + dir[1] * 10.5]
  g.add(P(box(4.4, 0.6, 2.2, RUBBER), 0, tip[1] - 0.6, tip[0], -a))
  // 软管：从上夹片后段立起来，弯到灯罩后面
  const lampAt: V3 = [0, 27, 3]
  const tilt = 1.95
  // 软管的末端：灯罩轴线上、罩底往后 1cm（在罩底那截短管里面）。原先 y 的符号写反了，软管是从短管的下后方斜插进去的
  const back: V3 = [0, lampAt[1] - Math.cos(tilt), lampAt[2] - Math.sin(tilt)]
  // 软管的座子：一直落到上夹片后段的斜面里（原先座底比夹片顶面高 1.2cm，只擦着钢簧）
  g.add(cyl(1.1, 1.3, 3.3, neck, { y: hy - 1.1, z: hz - 2.2 }, 8))
  g.add(tube([[0, hy + 1.8, hz - 2.2], [0, 14, hz - 3], [0, 24, -4.5], [0, 28.5, -1], back], 0.55, neck, { seg: 24, radial: 6 }))
  // 灯罩：杯形，罩口朝前下方；罩口一片发光面，边沿嵌进罩壁（发光面后面看不见，不再放灯泡）
  const shadeG = G(
    cyl(1.5, 1.5, 1.8, neck, { y: -1.2 }, 12),
    cup(4.4, 1.6, 6, 0.4, main, {}, 24),
    lit(cyl(3.7, 3.7, 0.2, LAMP, { y: 5.1 }, 24), LAMP, 0.9),
  )
  g.add(P(shadeG, ...lampAt, tilt))
  return fitGroup(g)
}

// ---------- 毛巾梯：两根长木框加五根圆横档，斜靠着墙（顶端贴墙），横档上搭两条毛巾 ----------

const TL = { w: 50, d: 35, h: 160 }
function towelLadder(p: string[]) {
  const [wood, towelA, towelB] = p
  const g = new THREE.Group()
  const run = TL.d - 4
  const a = Math.atan2(run, TL.h)
  const len = Math.hypot(run, TL.h)
  // 梯子平面里的坐标系：局部 y 沿长框往上，局部 z 是梯面法线（朝房间）
  const lad = new THREE.Group()
  lad.position.set(0, 0.5, TL.d / 2 - 2.5)
  lad.rotation.x = -a
  for (const s of [-1, 1]) {
    lad.add(rbox(3, len, 4, wood, { x: s * (TL.w / 2 - 1.5) }, 1.2))
    // 脚底防滑垫
    lad.add(rbox(3.2, 1.2, 4.4, RUBBER, { x: s * (TL.w / 2 - 1.5), y: -0.4 }, 0.4))
  }
  const rungs = [22, 52, 82, 112, 142]
  for (const y of rungs) lad.add(cylX(1.5, TL.w - 3, wood, 0, y, 0, 10))
  // 毛巾：卷在横档上的一圈 + 梯面前后各垂一片，前片下沿一条色带
  const towel = (x: number, y: number, w: number, front: number, back: number, color: string) => {
    lad.add(cylX(2.4, w, color, x, y, 0, 12))
    lad.add(rbox(w, front, 0.8, color, { x, y: y - front, z: 2.6 }, 0.35))
    lad.add(rbox(w, back, 0.8, color, { x, y: y - back, z: -2.6 }, 0.35))
    lad.add(rbox(w + 0.4, 2.2, 1.2, shade(color, -0.14), { x, y: y - front + 3, z: 2.6 }, 0.4))
  }
  towel(-6, rungs[3], 26, 26, 16, towelA)
  towel(7, rungs[1], 24, 22, 14, towelB)
  g.add(lad)
  return fitGroup(g)
}

// ---------- 圆形高吧桌：圆台面 + 托盘 + 单根立柱，柱子中段一圈踏脚环（四根辐条连到柱子），落地圆底盘 ----------

const BT = { r: 30, h: 105, ring: 30 }
function barTableRound(p: string[]) {
  const [top, frame, ring] = p
  const g = new THREE.Group()
  // 底盘：扁圆盘 + 中间一只圆台过渡
  g.add(cyl(21, 22, 2.4, frame, {}, 36))
  g.add(cyl(6, 11, 3, frame, { y: 2.4 }, 24))
  g.add(cyl(3.2, 3.2, BT.h - 3 - 8, frame, { y: 5 }, 18))
  // 台面下的托盘
  g.add(cyl(10, 4, 4, frame, { y: BT.h - 3 - 4 }, 24))
  g.add(puck(BT.r, 3, top, { y: BT.h - 3 }))
  // 踏脚环 + 辐条 + 柱子上的箍
  g.add(torus(16, 1.2, ring, { y: BT.ring, rx: PI / 2 }))
  for (let k = 0; k < 4; k++) {
    const t = (k / 4) * PI * 2 + PI / 4
    g.add(rod3([Math.cos(t) * 2.6, BT.ring, Math.sin(t) * 2.6], [Math.cos(t) * 15.4, BT.ring, Math.sin(t) * 15.4], 0.8, ring, 8))
  }
  g.add(cyl(4, 4, 3, ring, { y: BT.ring - 1.5 }, 18))
  return g
}

// ---------- 收纳鞋凳：两侧板 + 中隔板的两层开放鞋格，顶板上一块软垫坐面；格里放着一双运动鞋、一双乐福鞋 ----------

const SB = { w: 80, d: 35, h: 45, top: 40.4 }
/** 一只鞋：鞋底 + 鞋面（后半截高、前头圆），鞋口一圈深色；朝 +z */
function shoe(c: string, sole: string, lining: string, low = false) {
  const g = new THREE.Group()
  g.add(rbox(8, 1.2, 24, sole, {}, 0.5))
  // 鞋面的圆角压到 1.4（圆角盒 1 段细分：鞋放在格子里只有巴掌大，2 段细分一块就 300 个面）
  g.add(rbox(7.4, low ? 3.6 : 4.4, 22, c, { y: 1, z: -0.4 }, 1.4))
  g.add(rbox(7, low ? 2.4 : 3.6, 9, c, { y: 1, z: -7, x: 0 }, 1.4))
  g.add(box(5, 0.6, 8, lining, { y: (low ? 4.2 : 5) - 0.15, z: -6 }))
  if (!low) for (let k = 0; k < 3; k++) g.add(noOutline(box(4.2, 0.5, 0.8, '#f4f4f2', { y: 5.2 - k * 0.3, z: -1.5 + k * 2.2 })))
  else g.add(noOutline(box(4.6, 0.6, 1.2, shade(c, -0.2), { y: 4.4, z: 2.5 })))
  return g
}
function storageBench(p: string[]) {
  const [wood, cushion, shoeC] = p
  const g = new THREE.Group()
  const t = 2
  // 两侧板、中隔板、底板、中层板、顶板、背后一根拉档
  for (const s of [-1, 1]) g.add(rbox(t, SB.top, SB.d, wood, { x: s * (SB.w / 2 - t / 2) }, 0.4))
  g.add(rbox(t, SB.top - 2.4 - 3, SB.d - 2, wood, { y: 3, z: 0.5 }, 0.3))
  g.add(rbox(SB.w - t * 2, 2, SB.d - 1, wood, { y: 3, z: 0.5 }, 0.3))
  g.add(rbox(SB.w - t * 2, 2, SB.d - 1, wood, { y: 20, z: 0.5 }, 0.3))
  g.add(rbox(SB.w, 2.4, SB.d, wood, { y: SB.top - 2.4 }, 0.6))
  g.add(rbox(SB.w - t * 2, 4, 1.6, shade(wood, -0.08), { y: 32, z: -SB.d / 2 + 0.8 }, 0.3))
  g.add(rbox(SB.w - t * 2, 3, 1.6, shade(wood, -0.08), { y: 0, z: -SB.d / 2 + 2.4 }, 0.3))
  // 软垫坐面（顶面 = 45）+ 一圈压线
  g.add(rbox(SB.w - 2, SB.h - SB.top + 0.2, SB.d - 2, cushion, { y: SB.top - 0.2 }, 1.8))
  // 下层右格：一双运动鞋；上层左格：一双乐福鞋
  for (const s of [-1, 1]) {
    g.add(P(shoe('#f4f4f2', shade(shoeC, -0.15), shoeC), 19 + s * 5, 5, 1, 0, 0.05 * s))
    g.add(P(shoe('#8a5a3a', '#3a2a22', '#d9b58a', true), -19 + s * 5, 22, 1, 0, -0.05 * s))
  }
  return g
}

// ---------- 中式香几：圆面 + 束腰 + 牙子，三条三弯腿（膝部外鼓、足端外翻），腿底落在一圈托泥上，托泥下三只小足 ----------

const IS = { r: 20, h: 90 }
function incenseStand(p: string[]) {
  const [wood, accent] = p
  const g = new THREE.Group()
  // 面板 + 束腰 + 牙子（一圈）
  g.add(puck(IS.r, 3, wood, { y: IS.h - 3 }))
  g.add(cyl(16.5, 16.5, 2.4, shade(wood, -0.12), { y: IS.h - 5.2 }, 32))
  g.add(cyl(18.5, 18, 3.6, wood, { y: IS.h - 8.6 }, 32))
  g.add(noOutline(torus(18.3, 0.35, accent, { y: IS.h - 6.8, rx: PI / 2 }, PI * 2, [5, 32])))
  // 托泥 + 小足
  const ry = 3
  for (let k = 0; k < 3; k++) {
    const t = (k / 3) * PI * 2 + PI / 3 + PI / 2
    g.add(cyl(1.4, 1.8, 1.8, wood, { x: Math.cos(t) * 15.5, z: Math.sin(t) * 15.5 }, 12))
  }
  g.add(torus(15.5, 1.4, wood, { y: ry, rx: PI / 2 }))
  // 三弯腿：沿径向的 S 形弯管，膝部鼓出，足端外翻踩在托泥上
  for (let k = 0; k < 3; k++) {
    const t = (k / 3) * PI * 2 + PI / 2
    const at = (r: number, y: number): V3 => [Math.cos(t) * r, y, Math.sin(t) * r]
    // 膝部最鼓的地方收在面板半径（20）以内：原先腿鼓到 20.1、卷草到 20.8，比声明的占地多出去一截
    g.add(tube([at(16.3, IS.h - 7.5), at(17.6, IS.h - 18), at(16.5, 52), at(12.6, 24), at(14.2, 9), at(16.2, ry + 1.6)], 1.7, wood, { seg: 24, radial: 8 }))
    g.add(ball(2, wood, { x: Math.cos(t) * 16.2, y: ry + 1.8, z: Math.sin(t) * 16.2 }, [1, 0.8, 1]))
    // 膝部的一点卷草装饰
    g.add(noOutline(ball(1.2, accent, { x: Math.cos(t) * 18.75, y: IS.h - 18, z: Math.sin(t) * 18.75 }, [1, 1.4, 1], [8, 6])))
  }
  return g
}

// ---------- 官皮箱：带底座和顶盖的小木箱，正面两扇对开门，中间一块铜面叶 + 吊牌锁，盖上的拍子扣下来，两侧铜提环、顶盖四角包角 ----------

const GP = { w: 30, d: 22, h: 30 }
function guanpi(p: string[]) {
  const [wood, brass] = p
  const g = new THREE.Group()
  const fz = GP.d / 2
  g.add(rbox(GP.w + 1, 2.4, GP.d + 1, shade(wood, -0.12), {}, 0.6))
  g.add(rbox(GP.w, 22.8, GP.d, wood, { y: 2.2 }, 0.5))
  // 盖缝（缩进去）+ 顶盖（略大，前沿盖住门顶）
  g.add(rbox(GP.w - 1, 0.8, GP.d - 1, '#2b2624', { y: 24.8 }, 0.2))
  g.add(rbox(GP.w + 0.6, 4.6, GP.d + 1.4, wood, { y: GP.h - 4.6 }, 0.8))
  // 两扇对开门
  for (const s of [-1, 1]) g.add(rbox(13.6, 20.6, 0.6, shade(wood, 0.06), { x: s * 7.05, y: 3.3, z: fz + 0.1 }, 0.3))
  // 铜件：中间的面叶（如意云头的圆角块）+ 吊牌锁、盖上扣下来的拍子
  g.add(rbox(6.4, 7.4, 0.4, brass, { y: 11, z: fz + 0.55 }, 0.6))
  g.add(cylZ(0.5, 1.2, brass, 0, 14.5, fz + 1.1, 8))
  // 吊牌锁：挂在面叶的锁鼻上、背面贴着面叶（原先离面叶 0.2、离锁鼻 1cm，悬在门前）
  g.add(rbox(2.4, 3.6, 0.5, brass, { y: 10.7, z: fz + 0.95 }, 0.4))
  g.add(rbox(3, 6.4, 0.4, brass, { y: 21.6, z: fz + 0.9 }, 0.5))
  // 门上的小拉环
  for (const s of [-1, 1]) g.add(noOutline(torus(0.9, 0.16, brass, { x: s * 3.6, y: 14, z: fz + 0.85 }, PI * 2, [5, 12])))
  // 顶盖四角的包角
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(2.4, 4.8, 2.4, brass, { x: sx * (GP.w / 2 - 0.7), y: GP.h - 4.7, z: sz * (GP.d / 2 - 0.3) }, 0.3))
  // 两侧的提环：底座圆片 + 垂下的半环，半环两头各穿在一只环鼻里（原先半环离箱壁 0.2、两头也够不着圆片，悬着）
  for (const s of [-1, 1]) {
    g.add(cylX(1.2, 0.4, brass, s * (GP.w / 2 + 0.15), 19.5, 0, 10))
    g.add(torus(2.6, 0.25, brass, { x: s * (GP.w / 2 + 0.45), y: 19.5, ry: PI / 2, rz: PI }, PI, [6, 10]))
    for (const z of [-2.6, 2.6]) g.add(cylX(0.6, 0.8, brass, s * (GP.w / 2 + 0.35), 19.5, z, 6))
  }
  return g
}

// ---------- 奖杯陈列柜：柜体 + 踢脚，两扇带框玻璃门，柜内四层玻璃层板，顶板下一条发光灯带和两颗射灯（柜内留空） ----------

const TC = { w: 80, d: 35, h: 180, base: 8, t: 1.8, n: 4 }
/** 柜体中心往后挪一点，给门留出厚度（门板正面 = d/2） */
const TC_Z = -1
const TC_DOOR = 1.8
function tcLevels() {
  const floor = TC.base + TC.t
  const inTop = TC.h - TC.t
  const T = 0.8
  const clear = (inTop - floor - TC.n * T) / (TC.n + 1)
  return { floor, inTop, T, clear, ys: Array.from({ length: TC.n + 1 }, (_, k) => floor + k * (clear + T)) }
}
function trophyCabinet(p: string[]) {
  const [frame, back, knob] = p
  const g = new THREE.Group()
  const cd = TC.d - TC_DOOR
  const body = carcass(TC.w, TC.h, cd, frame, { t: TC.t, base: TC.base, back })
  body.position.z = TC_Z
  g.add(body)
  const { inTop, T, ys } = tcLevels()
  // 玻璃层板（半透明件不参与按材质合并：四块烘成一个网格，一次绘制）+ 两侧托钉（1cm 的小方块，直角盒）
  const shelves: THREE.Mesh[] = []
  for (const y of ys.slice(1)) {
    shelves.push(rbox(TC.w - TC.t * 2 - 0.4, T, cd - TC.t - 2, GLASS, { y: y - T, z: TC_Z + TC.t / 2 }, 0.1))
    for (const s of [-1, 1]) for (const z of [-8, 8]) g.add(nub(1, 0.5, 1, STEEL, { x: s * (TC.w / 2 - TC.t - 0.5), y: y - T - 0.5, z: TC_Z + z }))
  }
  g.add(ghost(bakeMeshes(shelves, GLASS), GLASS, 0.35))
  // 顶板下的灯带 + 两颗射灯（同一种发光材质，合成一次绘制）
  g.add(lit(rbox(TC.w - 8, 0.6, 3, LAMP, { y: inTop - 0.5, z: TC_Z + cd / 2 - 4 }, 0.2), LAMP, 0.9))
  for (const s of [-1, 1]) g.add(lit(cyl(1.6, 1.8, 1, LAMP, { x: s * 18, y: inTop - 0.9, z: TC_Z - 4 }, 12), LAMP, 0.9))
  // 两扇带框的玻璃门
  const panel = (w: number, h: number) => {
    const f = 3.2
    return [
      rbox(w, f, TC_DOOR, frame, {}, 0.4),
      rbox(w, f, TC_DOOR, frame, { y: h - f }, 0.4),
      rbox(f, h - f * 2, TC_DOOR, frame, { x: -(w / 2 - f / 2), y: f }, 0.4),
      rbox(f, h - f * 2, TC_DOOR, frame, { x: w / 2 - f / 2, y: f }, 0.4),
      glassPane(w - f * 2 + 0.6, h - f * 2 + 0.6, 0.5, { y: f - 0.3, z: 0 }),
    ]
  }
  g.add(doorRow({ x0: -TC.w / 2 + TC.t / 2, x1: TC.w / 2 - TC.t / 2, y0: TC.base, y1: TC.h - TC.t / 2, z: TC.d / 2, color: frame, th: TC_DOOR, n: 2, knob, panel }))
  return g
}

// ---------- 落地篮球架：注水底座（后面两只轮子）+ 斜撑立柱，两对支臂托着篮板，篮筐 + 一圈网线 ----------

const BH = { w: 110, d: 170, h: 305 }
function basketballHoop(p: string[]) {
  const [board, frame, rimC] = p
  const g = new THREE.Group()
  // 底座：圆角大箱 + 顶上一只注水盖，后面两只轮子
  g.add(rbox(100, 30, 100, frame, { z: -40 }, 6))
  g.add(rbox(84, 6, 70, shade(frame, 0.1), { y: 28, z: -46 }, 3))
  g.add(cyl(5, 5, 2.4, shade(frame, -0.2), { x: 24, y: 33.6, z: -56 }, 18))
  for (const s of [-1, 1]) {
    g.add(cylX(8, 5, RUBBER, s * 52, 8, -84, 20))
    g.add(cylX(3, 6, STEEL, s * 52, 8, -84, 12))
  }
  // 立柱（三节，接口处一圈箍）+ 斜撑
  const pole: [V3, V3] = [
    [0, 26, -18],
    [0, 286, -12],
  ]
  g.add(rod3(pole[0], pole[1], 4.4, STEEL, 16))
  for (const y of [120, 200]) g.add(cyl(5.2, 5.2, 4, shade(STEEL, -0.15), { y, z: -18 + ((y - 26) / 260) * 6 }, 16))
  g.add(rod3([0, 32, -76], [0, 150, -15.5], 2.4, STEEL, 12))
  g.add(rbox(12, 6, 10, shade(frame, -0.2), { y: 30, z: -76 }, 1.4))
  // 篮板：板 + 一圈边框 + 正面的投篮框线
  const bz = 26
  const by = 235
  g.add(rbox(BH.w - 1, 69, 3, board, { y: by + 0.5, z: bz }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(3.4, 70, 3.6, frame, { x: s * (BH.w / 2 - 1.7), y: by, z: bz }, 0.6))
    g.add(rbox(BH.w - 6, 3, 3.6, frame, { y: s < 0 ? by : by + 67, z: bz }, 0.6))
  }
  const lz = bz + 1.65
  g.add(noOutline(box(46, 1.6, 0.4, rimC, { y: by + 8, z: lz })))
  g.add(noOutline(box(46, 1.6, 0.4, rimC, { y: by + 33, z: lz })))
  for (const s of [-1, 1]) g.add(noOutline(box(1.6, 23.4, 0.4, rimC, { x: s * 22.2, y: by + 9.6, z: lz })))
  // 支臂：两对平行臂从立柱伸到篮板背面
  for (const y of [244, 286]) {
    const pz = -18 + ((y - 26) / 260) * 6
    for (const s of [-1, 1]) g.add(rod3([s * 4, y - 8, pz], [s * 18, y, bz - 1.4], 1.6, STEEL, 10))
  }
  g.add(rbox(44, 4, 2, STEEL, { y: 278, z: bz - 2.4 }, 0.4))
  g.add(rbox(44, 4, 2, STEEL, { y: 236, z: bz - 2.4 }, 0.4))
  // 篮筐：安装板 + 托架 + 圈；网：两组相反方向斜着的线交成菱格，底下一圈细环
  const ry = by + 10
  const rz = bz + 1.5 + 2.4 + 23
  g.add(rbox(14, 10, 1.2, rimC, { y: ry - 8, z: bz + 2 }, 0.3))
  g.add(rbox(8, 2.4, 6, rimC, { y: ry - 1.2, z: bz + 4.4 }, 0.4))
  g.add(torus(23, 1, rimC, { y: ry, z: rz, rx: PI / 2 }))
  const n = 12
  for (let k = 0; k < n; k++) {
    const t0 = (k / n) * PI * 2
    for (const s of [-1, 1]) {
      const t1 = t0 + s * (PI / n)
      g.add(rod3([Math.cos(t0) * 22.6, ry - 0.6, rz + Math.sin(t0) * 22.6], [Math.cos(t1) * 15.6, ry - 38, rz + Math.sin(t1) * 15.6], 0.28, '#f6f6f2', 4))
    }
  }
  // 网线只有几毫米粗：圆环的管截面 5 段、一圈 24 段（和 12 组网线的落点对齐）
  g.add(torus(15.6, 0.3, '#f6f6f2', { y: ry - 38, z: rz, rx: PI / 2 }, PI * 2, [5, 24]))
  g.add(torus(19.4, 0.25, '#f6f6f2', { y: ry - 19, z: rz, rx: PI / 2 }, PI * 2, [5, 24]))
  return fitGroup(g)
}

// ---------- 浴帘和浴帘杆：两头墙座的伸缩杆 + 一排吊环，浴帘拉在左半边，挤出成一道道竖褶，下沿一条色带 ----------

const SC = { w: 150, d: 8, h: 183, mount: 20 }
/** 波浪截面的帘布：x0..x1 之间沿 x 起伏（振幅 amp、波长 lam，相位从 ox 起算），厚 t，从 y0 到 y1，帘面中心在 z */
function pleated(x0: number, x1: number, y0: number, y1: number, z: number, amp: number, lam: number, t: number, color: string, ox = x0) {
  const n = Math.ceil(((x1 - x0) / lam) * 8)
  const front: THREE.Vector2[] = []
  const backPts: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const w = z + amp * Math.sin(((x - ox) / lam) * PI * 2)
    front.push(new THREE.Vector2(x, -(w + t / 2)))
    backPts.push(new THREE.Vector2(x, -(w - t / 2)))
  }
  const shape = new THREE.Shape([...front, ...backPts.reverse()])
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false })
  geo.rotateX(-PI / 2)
  const m = mesh(geo, color)
  m.position.y = y0
  return m
}
function showerCurtain(p: string[]) {
  const [cloth, rod, hem] = p
  const g = new THREE.Group()
  const ry = 200
  const rz = 5
  const lam = 9
  const x0 = -73
  const x1 = x0 + lam * 8
  // 杆 + 两头的墙座
  g.add(cylX(1.2, SC.w - 3, rod, 0, ry, rz, 16))
  for (const s of [-1, 1]) {
    g.add(cylZ(3, 0.8, rod, s * (SC.w / 2 - 3), ry, 0.4, 20))
    g.add(cylZ(1.8, rz, rod, s * (SC.w / 2 - 3), ry, rz / 2, 16))
  }
  // 中间的伸缩接头
  g.add(cylX(1.5, 4, shade(rod, -0.12), 20, ry, rz, 16))
  // 帘布 + 下沿色带（略厚一点包住帘布）
  g.add(pleated(x0, x1, SC.mount + 0.1, ry - 1.7, rz, 2.4, lam, 0.4, cloth))
  g.add(pleated(x0 - 0.15, x1 + 0.15, SC.mount, SC.mount + 9, rz, 2.4, lam, 0.8, hem, x0))
  g.add(pleated(x0 - 0.15, x1 + 0.15, SC.mount + 12, SC.mount + 13.5, rz, 2.4, lam, 0.8, hem, x0))
  // 吊环：每个波长一只，挂在波形的过零点
  // （直径 4cm 的小环，九只：管截面 6 段、一圈 12 段）
  for (let k = 0; k <= 8; k++) g.add(torus(2.2, 0.28, rod, { x: x0 + k * lam, y: ry, z: rz, ry: PI / 2 }, PI * 2, [6, 12]))
  return fitWall(g, SC.mount, SC.d)
}

// ---------- 壁挂投影仪：墙上一块竖安装板，L 形悬臂（横臂 + 斜撑）伸出来，臂端托盘上放着投影仪（镜头朝前） ----------

const PJ = { w: 34, d: 44, h: 32, mount: 200 }
function wallProjector(p: string[]) {
  const [body, bracket, accent] = p
  const g = new THREE.Group()
  // 安装板 + 四颗螺丝
  g.add(rbox(12, 22, 1.2, bracket, { z: 0.6 }, 0.4))
  for (const sx of [-1, 1]) for (const y of [3, 19]) g.add(cylZ(0.6, 0.4, STEEL, sx * 3.5, y, 1.35, 6))
  // 横臂 + 斜撑 + 托盘
  g.add(rbox(5, 3.6, 30, bracket, { y: 16, z: 15.6 }, 0.6))
  g.add(strutBox([0, 2, 1.2], [0, 17, 18], 3, 2.4, bracket, 0.5))
  g.add(rbox(28, 1, 24, bracket, { y: 19.4, z: 28 }, 0.3))
  // 投影仪机身：圆角盒 + 前面的镜头、顶上的调焦环、侧面的散热格栅
  const bz = 28
  g.add(rbox(PJ.w, 10.5, 25, body, { y: 20.3, z: bz }, 2))
  g.add(rbox(PJ.w - 4, 0.6, 21, shade(body, -0.06), { y: 30.6, z: bz }, 0.3))
  g.add(cylZ(4, 1.6, DARK, 8, 25.5, bz + 12.8, 20))
  g.add(cylZ(3.3, 1.4, '#3b3e46', 8, 25.5, bz + 14.2, 20))
  g.add(lit(cylZ(2.4, 0.4, '#bfe6ff', 8, 25.5, bz + 14.9, 16), '#bfe6ff', 0.5))
  g.add(noOutline(cylZ(4.2, 0.6, accent, 8, 25.5, bz + 12.7, 20)))
  // 散热格栅的缝：直角盒
  for (let k = 0; k < 4; k++) g.add(noOutline(box(9, 0.7, 0.4, DARK, { x: -7, y: 22.6 + k * 1.8, z: bz + 12.6 })))
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) g.add(noOutline(box(0.4, 6, 0.8, DARK, { x: s * (PJ.w / 2 + 0.1), y: 22.5, z: bz - 6 + k * 3 })))
  g.add(lit(ball(0.45, '#7dff9a', { x: -12, y: 30.9, z: bz + 9 }), '#7dff9a', 0.9))
  // 电源线：从机身后面下到安装板，末端扎进安装板（原先停在板前 0.2cm 的半空，从下面能看进线头的管口）
  g.add(tube([[-6, 24, bz - 12.5], [-6, 21, 10], [-4, 18, 3.2], [-3.2, 14, 1.9], [-3, 13, 0.8]], 0.35, DARK, { seg: 12, radial: 6 }))
  return fitWall(g, PJ.mount, PJ.d)
}

// ---------- 配色 ----------

const AT_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#5aa9e6']],
  ['modern', [M.char, M.gray, '#e2bd5a']],
  ['nordic', [N.white, N.gray, N.oak]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['retro', [R.cream, '#d9cfae', R.teal]],
]
const CF_PALS: Pal[] = [
  ['modern', [M.white, M.gray, M.light]],
  ['modern', [M.silver, M.char, M.white]],
  ['cute', ['#d8f1e6', '#9cc9b4', C.white]],
  ['retro', [R.cream, R.olive, R.red]],
]
const SA_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.gray]],
  ['nordic', [N.white, N.gray, N.oak]],
  ['modern', [M.light, M.gray, M.char]],
]
const OL_PALS: Pal[] = [
  ['modern', [M.white, '#f8f8f6', DARK]],
  ['japanese', [J.washi, '#fbf6ea', J.sumi]],
  ['modern', [M.char, M.gray, '#16171a']],
  ['nordic', [N.linen, N.white, M.char]],
]
const NL_PALS: Pal[] = [
  ['modern', [M.white, '#fff0b8', M.light]],
  ['cute', [C.white, '#ffd9b8', C.pink]],
  ['cute', [C.sky, '#fff6c8', C.white]],
  ['nordic', [N.white, '#ffe2a8', N.oak]],
]
const TW_PALS: Pal[] = [
  ['modern', [CHROME, M.white, '#5aa9e6']],
  ['modern', [M.black, M.gray, M.white]],
  ['modern', [M.white, '#a9bfa3', N.white]],
  ['classic', [CL.gold, CL.cream, CL.navy]],
  ['cute', [C.white, C.sakura, C.pink]],
]
const SD_PALS: Pal[] = [
  ['modern', [M.white, '#ffc6d2']],
  ['japanese', ['#a9c2b0', J.washi]],
  ['nordic', [N.gray, '#f3e3b8']],
  ['cute', [C.sky, C.lemon]],
  ['retro', [R.cream, '#a8d8c0']],
]
const JWB_PALS: Pal[] = [
  ['classic', [CL.walnut, CL.wine, CL.gold]],
  ['nordic', [N.oak, '#5f7f8f', N.white]],
  ['cute', [C.sakura, '#f6eef2', C.lemon]],
  ['chinese', [CN.rosewood, CN.lacquer, CN.brass]],
  ['modern', [M.white, M.char, M.silver]],
]
const TH_PALS: Pal[] = [
  ['retro', [R.cream, R.red, R.red]],
  ['retro', ['#f0e2c4', R.teal, '#e06a5a']],
  ['chinese', [CN.ivory, CN.lacquer, '#e06a7a']],
  ['modern', [M.white, M.char, '#f08aa0']],
  ['cute', [C.sakura, C.white, C.pink]],
]
const PT_PALS: Pal[] = [
  ['nordic', [N.oak, N.white]],
  ['modern', [M.black, M.silver]],
  ['industrial', [I.iron, I.walnut]],
  ['cute', [C.pink, C.lemon]],
  ['japanese', [J.wood, J.dark]],
]
const CLP_PALS: Pal[] = [
  ['modern', [M.white, M.char]],
  ['modern', [M.black, M.black]],
  ['cute', [C.mint, C.white]],
  ['cute', [C.pink, C.white]],
  ['industrial', [I.steel, I.iron]],
]
const TL_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.sage]],
  ['japanese', [J.hinoki, J.washi, J.ai]],
  ['industrial', [I.walnut, I.concrete, I.rust]],
  ['farmhouse', [F.oak, F.linen, F.navy]],
  ['cute', [C.woodL, C.sakura, C.mint]],
]
const BT_PALS: Pal[] = [
  ['nordic', [N.oak, M.black, M.black]],
  ['modern', [M.white, M.char, M.silver]],
  ['industrial', [I.walnut, I.iron, I.steel]],
  ['retro', [R.caramel, '#2b2b30', R.mustard]],
  ['cute', [C.woodL, C.white, C.pink]],
]
const SB_PALS: Pal[] = [
  ['nordic', [N.oak, N.linen, '#5aa9e6']],
  ['japanese', [J.wood, J.ai, J.shu]],
  ['modern', [M.white, M.char, '#e8483f']],
  ['industrial', [I.walnut, I.leather, I.rust]],
  ['cute', [C.woodL, C.sakura, C.mint]],
]
const IS_PALS: Pal[] = [
  ['chinese', [CN.rosewood, CN.brass]],
  ['chinese', [CN.walnut, CN.jade]],
  ['chinese', [CN.lacquer, CN.brass]],
  ['chinese', [CN.ink, '#c9a25a']],
]
const GP_PALS: Pal[] = [
  ['chinese', [CN.rosewood, BRASS]],
  ['chinese', [CN.lacquer, CN.brass]],
  ['chinese', [CN.walnut, '#e0c88e']],
  ['japanese', [J.dark, '#c9a25a']],
]
const TC_PALS: Pal[] = [
  ['modern', [M.black, M.char, M.silver]],
  ['classic', [CL.walnut, CL.wine, CL.gold]],
  ['nordic', [N.white, N.oakL, N.oak]],
  ['industrial', [I.iron, I.walnut, I.steel]],
]
const BH_PALS: Pal[] = [
  ['modern', [M.white, M.black, BALL_ORANGE]],
  ['modern', [M.white, '#2f5fa8', '#d8483f']],
  ['industrial', ['#e8e8e4', I.iron, I.rust]],
  ['retro', [R.cream, '#2c3e6b', R.orange]],
]
const SC_PALS: Pal[] = [
  ['modern', [M.white, CHROME, '#5aa9e6']],
  ['nordic', [N.linen, M.black, N.sage]],
  ['cute', [C.sakura, CHROME, C.pink]],
  ['japanese', ['#dfe7ea', J.sumi, J.ai]],
  ['retro', [R.cream, CL.gold, R.teal]],
]
const PJ_PALS: Pal[] = [
  ['modern', [M.white, M.black, M.silver]],
  ['modern', [M.char, M.black, '#e2bd5a']],
  ['nordic', [N.white, N.gray, N.oak]],
  ['modern', [M.light, M.white, '#5aa9e6']],
]

// ---------- 素材表 ----------

const lv = tcLevels()

export const HOME_DETAILS: AssetDef[] = [
  define('hd-aircon-tower', '立式空调', 'appliance', [AT.w, AT.d + 2, AT.h], AT_PALS, airconTower, {
    type: 'aircon',
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('hd-chest-freezer', '卧式冷柜', 'appliance', [CF.w + 2, CF.d + 3, CF.h], CF_PALS, chestFreezer, {
    type: 'appliance',
    mats: ['metal', 'plastic', 'plastic'],
    surface: CF.h,
    surfaceShape: [rectPoly(-CF.w / 2 + 1, -CF.d / 2 + 1, CF.w / 2 - 1, CF.d / 2 - 1)],
  }),
  define('hd-smoke-alarm', '烟雾报警器', 'appliance', [SA.w, SA.d, SA.h], SA_PALS, smokeAlarm, {
    type: 'appliance',
    mount: SA.mount,
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('hd-outlet', '墙面插座', 'appliance', [OL.w, OL.d, OL.h], OL_PALS, outlet, {
    type: 'appliance',
    mount: OL.mount,
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('hd-night-light', '插座小夜灯', 'lighting', [NL.w, NL.d, NL.h], NL_PALS, nightLight, {
    type: 'appliance',
    // 灯光系统按自发光零件加光源（lights.ts prepareLamp），可以单独开关
    tags: ['light'],
    mount: NL.mount,
    mats: ['plastic', 'frosted', 'plastic'],
  }),
  define('hd-towel-warmer', '电热毛巾架', 'toiletry', [TW.w + 1.4, TW.d, TW.h + 1], TW_PALS, towelWarmer, {
    type: 'towel-rail',
    mount: TW.mount,
    mats: ['metal', 'fabric', 'fabric'],
  }),
  define('hd-soap-dish', '皂盒和肥皂', 'toiletry', [12, 8, 3.8], SD_PALS, soapDish, {
    ...PROP,
    type: 'hand-soap',
    mats: ['ceramic', null],
  }),
  define('hd-jewelry-box', '首饰盒', 'bedroom', [25, 24.4, 34], JWB_PALS, jewelryBox, {
    ...PROP,
    type: 'storage-box',
    mats: ['wood', 'fabric', 'metal'],
  }),
  define('hd-thermos', '保温热水瓶', 'kitchenware', [19, 22, 29], TH_PALS, thermos, {
    ...PROP,
    type: 'kettle',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('hd-paper-towel', '立式厨房纸巾架', 'kitchenware', [14, 16, 33], PT_PALS, paperTowel, {
    ...PROP,
    type: 'paper-towel',
    mats: ['wood', 'wood'],
  }),
  define('hd-clip-lamp', '夹子灯', 'lighting', [9, 19.2, 29], CLP_PALS, clipLamp, {
    ...PROP,
    type: 'desk-lamp',
    // 灯光系统按自发光零件加光源（lights.ts prepareLamp），可以单独开关
    tags: ['light'],
    mats: ['plastic', 'metal'],
  }),
  define('hd-towel-ladder', '毛巾梯', 'toiletry', [TL.w + 0.2, TL.d, TL.h + 1], TL_PALS, towelLadder, {
    type: 'towel-rail',
    mats: ['wood', 'fabric', 'fabric'],
  }),
  define('hd-bar-table-round', '圆形高吧桌', 'dining', [BT.r * 2, BT.r * 2, BT.h], BT_PALS, barTableRound, {
    type: 'dining-table',
    tags: ['table'],
    mats: ['wood', 'metal', 'metal'],
    surface: BT.h,
    surfaceShape: [ellipsePoly(BT.r - 1.5)],
  }),
  define('hd-storage-bench', '收纳鞋凳', 'entrance', [SB.w, SB.d, SB.h], SB_PALS, storageBench, {
    type: 'shoe-storage',
    tags: ['seat'],
    mats: ['wood', 'fabric', 'fabric'],
    surface: SB.h,
    surfaceShape: [rectPoly(-SB.w / 2 + 2, -SB.d / 2 + 2, SB.w / 2 - 2, SB.d / 2 - 2)],
  }),
  define('hd-cn-incense-stand', '中式香几', 'living', [IS.r * 2, IS.r * 2, IS.h], IS_PALS, incenseStand, {
    type: 'coffee-table',
    mats: ['wood', 'metal'],
    surface: IS.h,
    surfaceShape: [ellipsePoly(IS.r - 1.5)],
  }),
  define('hd-cn-guanpi', '官皮箱', 'tabletop', [GP.w + 1.5, GP.d + 2.6, GP.h], GP_PALS, guanpi, {
    ...PROP,
    type: 'storage-box',
    mats: ['wood', 'metal'],
  }),
  define('hd-trophy-cabinet', '奖杯陈列柜', 'living', [TC.w, TC.d, TC.h], TC_PALS, trophyCabinet, {
    type: 'display-cabinet',
    tags: ['collection-shelf'],
    mats: ['wood', 'wood', 'metal'],
    surface: TC.h,
    surfaces: lv.ys.map((y) => ({ y, h: lv.clear, inside: true, glass: true, shape: [rectPoly(-TC.w / 2 + TC.t + 1, TC_Z - (TC.d - TC_DOOR) / 2 + TC.t + 1, TC.w / 2 - TC.t - 1, TC_Z + (TC.d - TC_DOOR) / 2 - 1)] })),
    openable: true,
  }),
  define('hd-basketball-hoop', '落地篮球架', 'outdoor', [BH.w, BH.d, BH.h], BH_PALS, basketballHoop, {
    type: 'sports-gear',
    tags: ['hobby:sports'],
    mats: ['plastic', 'plastic', 'metal'],
  }),
  define('hd-shower-curtain', '浴帘', 'toiletry', [SC.w, SC.d, SC.h], SC_PALS, showerCurtain, {
    type: 'curtain',
    tags: ['wet-supply'],
    mount: SC.mount,
    mats: ['fabric', 'metal', 'fabric'],
  }),
  define('hd-ceiling-projector', '壁挂投影仪', 'appliance', [PJ.w + 0.6, PJ.d, PJ.h], PJ_PALS, wallProjector, {
    type: 'home-theater',
    tags: ['hobby:movies'],
    mount: PJ.mount,
    mats: ['plastic', 'metal', 'metal'],
  }),
]
