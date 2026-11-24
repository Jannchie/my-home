// 日常护理小件：洗衣液组、伸缩晾衣杆、擦鞋套装、鞋撑、粘毛器、针线盒、壁挂熨衣板、体温计药盒、热水袋、
// 厨房秤、身高体重秤、购物篮、门后挂式鞋袋、浴霸、搪瓷牛奶罐。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；壁挂件用 fitWall（最低点 = mount、背面贴 z = -d/2）。type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus, tray } from '../toon'
import { C, gridHoles, holePanel, moveHole, rectPoly, shell, slab, type AssetDef, type Hole, type Poly } from '../kit'
import { cylX, cylZ, fitGroup, fitWall, G, ghost, latheAt, lit, mesh, noOutline, P, PI, rod3, sideSlab, tube, type V2, type V3 } from '../geo'
import { CL, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#2a2b30'
const RUBBER = '#34353a'
const WHITE = '#f6f6f2'
const SCREEN = '#1f2b2a'
const DIGIT = '#7fe0c8'
const CLEAR = '#dfeef5'
const BRISTLE = '#3a3532'

/** xy 平面里的轮廓（点列或现成的 Shape）沿 z 挤出厚 t，z 居中；倒角往里收，轮廓不变大 */
function cutout(src: V2[] | THREE.Shape, t: number, color: string, bevel = 0.3, seg = 1) {
  const s = Array.isArray(src) ? new THREE.Shape(src.map(([x, y]) => new THREE.Vector2(x, y))) : src
  const b = Math.min(bevel, t * 0.45)
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - b * 2), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: seg, curveSegments: 12 })
  geo.translate(0, 0, -t / 2 + b)
  return mesh(geo, color)
}

// ---------- 洗衣液组：带提手和量杯盖的大桶洗衣液、一瓶圆肩柔顺剂、一盒洗衣凝珠（门口散着两颗） ----------

function laundryPod(x: number, z: number) {
  // 凝珠：半透明的白色软囊里两团彩色液体
  return G(ball(1.5, '#e9f3fb', { x, y: 0.9, z }, [1, 0.6, 1]), ball(0.75, '#3f7fd8', { x: x - 0.5, y: 1.2, z }, [1, 0.8, 1]), ball(0.75, '#f29a3d', { x: x + 0.5, y: 1.2, z }, [1, 0.8, 1]))
}
function detergentSet(p: string[]) {
  const [jug, soft, pods, cap] = p
  const g = new THREE.Group()
  // 大桶：圆角桶身 + 正面标签，后上方一只提手，前上方的瓶口上扣着量杯盖
  const jx = -7.5
  g.add(rbox(14, 25, 11, jug, { x: jx, z: 0.5 }, 3))
  g.add(rbox(8, 10, 0.4, WHITE, { x: jx, y: 7, z: 6.1 }, 0.15))
  g.add(noOutline(rbox(6, 2, 0.4, cap, { x: jx, y: 13, z: 6.45 }, 0.1)))
  g.add(P(torus(2.7, 1.1, jug, {}, PI), jx, 24, -1.8, 0, PI / 2, 0))
  g.add(cyl(2.2, 2.2, 2.6, jug, { x: jx, y: 23.5, z: 3.4 }, 16))
  g.add(cyl(2.8, 2.6, 3.4, cap, { x: jx, y: 25.6, z: 3.4 }, 20))
  // 柔顺剂：圆肩瓶 + 一圈收缩膜标签 + 瓶盖
  const sx = 5.5
  const sz = -1.5
  g.add(
    latheAt(
      [
        [0, 0],
        [3.6, 0],
        [4.1, 0.6],
        [4.1, 13],
        [3.4, 17],
        [1.7, 19.6],
        [1.7, 21],
        [0, 21],
      ],
      soft,
      { x: sx, z: sz },
      24,
    ),
  )
  g.add(cyl(4.4, 4.4, 7, WHITE, { x: sx, y: 3.5, z: sz }, 24))
  g.add(noOutline(cyl(4.5, 4.5, 1.2, soft, { x: sx, y: 6.4, z: sz }, 24)))
  g.add(cyl(2, 2, 2.6, cap, { x: sx, y: 20.6, z: sz }, 16))
  // 凝珠盒：方盒 + 扣盖 + 正面印着一颗凝珠的标签
  const px = 13.2
  const pz = 1.2
  g.add(rbox(6.6, 8, 8.5, pods, { x: px, z: pz }, 1.2))
  g.add(rbox(7, 1.6, 8.9, cap, { x: px, y: 7.4, z: pz }, 0.6))
  g.add(rbox(4.4, 3.6, 0.4, WHITE, { x: px, y: 2, z: pz + 4.35 }, 0.15))
  g.add(noOutline(ball(1, '#4a8fe0', { x: px, y: 3.8, z: pz + 4.6 }, [1, 0.8, 0.35])))
  g.add(laundryPod(2.5, 4.6), laundryPod(6, 5.4))
  return fitGroup(g)
}

// ---------- 伸缩晾衣杆：两只 A 字支架托着一根伸缩横杆，左边挂着一条毛巾（搭在衣架上）和两件 T 恤，右边空着可以再挂 ----------

const DP = { bar: 146, hub: 75, foot: 20.5 }
/** T 恤轮廓（xy，原点在领口上沿中点，往下为负） */
const TEE: V2[] = [
  [-4.5, 0],
  [-12, -2.2],
  [-18, -10],
  [-14.2, -13.4],
  [-11.5, -10.5],
  [-11.5, -52],
  [11.5, -52],
  [11.5, -10.5],
  [14.2, -13.4],
  [18, -10],
  [12, -2.2],
  [4.5, 0],
  [2.5, -2],
  [0, -2.8],
  [-2.5, -2],
]
/** 衣架钩：半圈钩在杆上（rb = 杆半径），一头往下接到 (x, y1) */
function hangerHook(x: number, rb: number, y1: number, color: string) {
  const top = DP.bar
  const r = rb + 0.15
  return G(P(torus(r, 0.3, color, {}, PI), x, top, 0, 0, PI / 2, 0), rod3([x, top, r], [x, y1, 0], 0.3, color, 6))
}
function dryingPole(p: string[]) {
  const [pole, joint, clothA, towel] = p
  const g = new THREE.Group()
  const top = DP.bar
  for (const s of [-1, 1]) {
    const x = s * DP.hub
    // A 字支架：两条腿从地面斜上去，在顶上的接头里汇合；脚底橡胶套，中段一根横撑
    for (const sz of [-1, 1]) {
      g.add(rod3([x, 1, sz * DP.foot], [x, top - 2, 0], 1.2, pole, 10))
      g.add(cyl(1.8, 2.1, 1.4, RUBBER, { x, z: sz * DP.foot }, 12))
    }
    const zb = DP.foot * (1 - 39 / (top - 3))
    g.add(rod3([x, 40, -zb], [x, 40, zb], 0.7, pole, 8))
    g.add(rbox(4.6, 7, 5, joint, { x, y: top - 4 }, 1.2))
  }
  // 伸缩横杆：左半根粗管套着右半根细管，中间一只锁扣，两头堵头
  g.add(cylX(1.6, 80, pole, -39, top, 0))
  g.add(cylX(1.25, 79, pole, 39.5, top, 0))
  g.add(cylX(2.1, 4, joint, 0, top, 0))
  for (const s of [-1, 1]) g.add(ball(1.9, joint, { x: s * 79.5, y: top }))
  // 衣架一：毛巾搭在衣架底杆上（前片长、后片短，下摆一道色带）
  const tx = -57
  const ty = top - 14
  g.add(hangerHook(tx, 1.6, top - 6, joint))
  for (const s of [-1, 1]) {
    g.add(rod3([tx, top - 6, 0], [tx + s * 15, ty, 0], 0.4, joint, 6))
    g.add(ball(0.5, joint, { x: tx + s * 15, y: ty }))
  }
  g.add(rod3([tx - 15, ty, 0], [tx + 15, ty, 0], 0.4, joint, 6))
  g.add(cylX(1, 22, towel, tx, ty, 0))
  g.add(rbox(22, 26, 0.7, towel, { x: tx, y: ty - 26, z: 0.62 }, 0.3))
  g.add(rbox(22, 20, 0.7, towel, { x: tx, y: ty - 20, z: -0.62 }, 0.3))
  g.add(rbox(22.6, 2.2, 1.3, shade(towel, -0.15), { x: tx, y: ty - 22, z: 0.62 }, 0.3))
  // 衣架二、三：两件 T 恤（衣架藏在衣服里，只露出钩子），胸前一只口袋
  for (const [x, c, rb] of [
    [-22, clothA, 1.6],
    [16, WHITE, 1.25],
  ] as [number, string, number][]) {
    g.add(hangerHook(x, rb, top - 9, joint))
    g.add(P(cutout(TEE, 1.4, c), x, top - 4.5, 0))
    g.add(rbox(5, 5, 0.3, shade(c, -0.12), { x: x + 6, y: top - 22, z: 0.85 }, 0.2))
  }
  return g
}

// ---------- 鞋撑：前掌木块（前窄后宽）+ 一根带螺旋弹簧的钢杆 + 后跟木块和顶上的小钮；脚尖朝 +x ----------

/** 鞋撑前掌的俯视轮廓（x 朝脚尖，y 是宽度方向）：后端窄、前掌最宽、脚尖收圆 */
function treeToe() {
  const s = new THREE.Shape()
  s.moveTo(-1, -3)
  s.lineTo(4, -4.3)
  s.quadraticCurveTo(10, -4.6, 13, -3.2)
  s.quadraticCurveTo(16.4, -1.4, 16, 0.6)
  s.quadraticCurveTo(15.2, 3.2, 11.5, 3.9)
  s.quadraticCurveTo(7, 4.6, 4, 4.3)
  s.lineTo(-1, 3)
  s.lineTo(-1, -3)
  return s
}
function shoeTree(wood: string, metal: string) {
  const g = new THREE.Group()
  // 前掌：脚形轮廓挤出、大倒角做成圆润的木块，顶上一道开缝、一块铜标牌
  g.add(P(cutout(treeToe(), 5.2, wood, 1.7, 3), 0, 2.6, 0, -PI / 2))
  g.add(noOutline(rbox(8, 0.3, 0.4, shade(wood, -0.35), { x: 9.5, y: 5.05 }, 0.1)))
  g.add(rbox(2.4, 0.4, 1.6, metal, { x: 3.5, y: 4.95 }, 0.15))
  // 后面的接杆座
  g.add(rbox(2.6, 3.4, 3, shade(wood, -0.1), { x: -1.6, y: 1.9 }, 0.6))
  // 钢杆 + 螺旋弹簧
  g.add(rod3([-1, 3.6, 0], [-8.5, 3.6, 0], 0.45, metal, 8))
  const coil: V3[] = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    const a = t * PI * 12
    coil.push([-7 + 5 * t, 3.6 + Math.cos(a) * 0.85, Math.sin(a) * 0.85])
  }
  g.add(tube(coil, 0.18, metal, { seg: 96, radial: 5 }))
  // 后跟：圆润的竖木块（后跟杯）+ 顶上一颗深色小钮
  g.add(rbox(4.6, 6.6, 5.2, wood, { x: -10.4 }, 2.2))
  g.add(ball(1.1, shade(wood, -0.2), { x: -10.4, y: 7.3 }))
  return g
}
function shoeTreePair(p: string[]) {
  const [wood, metal] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(P(shoeTree(wood, metal), 0, 0, s * 4.8, 0, s * 0.04, 0))
  return fitGroup(g)
}

// ---------- 擦鞋套装：敞口木盒，中间一块带握手孔的提手隔板；前格一罐鞋油、一把圆头刷、一把马毛刷，后格躺着一只鞋撑，擦鞋布搭在前沿上 ----------

const SC = { w: 30, d: 20, h: 5.5, t: 1.1 }
function shoeCare(p: string[]) {
  const [box, polish, brush, cloth] = p
  const g = new THREE.Group()
  const fl = SC.t
  g.add(tray(SC.w, SC.h, SC.d, SC.t, box))
  g.add(holePanel(SC.w - SC.t * 2 + 0.6, 11.5, 1.2, box, [{ kind: 'rect', x: 0, y: 7.6, w: 9, h: 2.4, r: 1.2 }], { y: 0.6 }))
  // 鞋油罐：罐身 + 盖子 + 盖顶的圆标
  const fz = 4.6
  g.add(cyl(2.8, 2.8, 1.5, STEEL, { x: -11, y: fl, z: fz }, 20))
  g.add(cyl(2.95, 2.95, 0.9, polish, { x: -11, y: fl + 1.2, z: fz }, 20))
  g.add(noOutline(cyl(1.6, 1.6, 0.4, '#f1e6c8', { x: -11, y: fl + 2, z: fz }, 16)))
  // 圆头刷（上油用）：刷头 + 金属箍 + 木柄，横躺
  g.add(cylX(1.5, 2.5, BRISTLE, -6.6, fl + 1.5, fz))
  g.add(cylX(1.2, 0.8, STEEL, -5, fl + 1.2, fz))
  g.add(cylX(1, 5.5, brush, -1.9, fl + 1, fz))
  // 马毛刷：刷毛朝下，木背
  g.add(rbox(10.2, 1.6, 3.6, BRISTLE, { x: 7.2, y: fl, z: fz }, 0.4))
  g.add(rbox(11, 2.2, 4.2, brush, { x: 7.2, y: fl + 1.5, z: fz }, 0.8))
  // 擦鞋布：搭在前壁上，里外各垂一片
  const cz = SC.d / 2 - SC.t / 2
  g.add(rbox(7, 0.5, 2, cloth, { x: -1, y: SC.h, z: cz }, 0.2))
  g.add(rbox(7, SC.h - 1, 0.5, cloth, { x: -1, y: 1.2, z: SC.d / 2 + 0.25 }, 0.2))
  g.add(rbox(7, 2.6, 0.5, cloth, { x: -1, y: SC.h - 2.4, z: cz - SC.t / 2 - 0.25 }, 0.2))
  // 后格：一只鞋撑（缩小一点放得下）
  const tree = shoeTree(brush, STEEL)
  tree.scale.setScalar(0.93)
  tree.position.set(-1.3, fl, -4.75)
  g.add(tree)
  return fitGroup(g)
}

// ---------- 粘毛器与除毛球器：立在半透明收纳筒里的粘毛滚筒（手柄朝上）、一台带集毛仓的小除毛球器、一卷替换粘纸 ----------

function lintSet(p: string[]) {
  const [handle, caseC, body] = p
  const g = new THREE.Group()
  // 粘毛滚筒：收纳筒 + 白色粘纸卷 + 端盖 + 手柄
  const rx = -7
  g.add(ghost(cup(3.9, 3.7, 9.6, 0.4, caseC, { x: rx }), caseC, 0.55))
  g.add(cyl(3.3, 3.3, 10.4, WHITE, { x: rx, y: 0.35 }, 24))
  g.add(cyl(1.6, 2.4, 1, handle, { x: rx, y: 10.6 }, 16))
  g.add(
    latheAt(
      [
        [0, 0],
        [1.2, 0],
        [1.2, 1.8],
        [0.95, 3.5],
        [1.45, 7],
        [1.7, 10],
        [1.4, 12.2],
        [0.6, 12.8],
        [0, 12.9],
      ],
      handle,
      { x: rx, y: 11.4 },
      16,
    ),
  )
  // 除毛球器：下半机身 + 透明集毛仓（里面一团毛絮）+ 色环 + 顶上的刀网
  const bx = 3
  g.add(rbox(6.4, 6.4, 5.6, body, { x: bx }, 1.6))
  g.add(ghost(rbox(6.2, 3.6, 5.4, CLEAR, { x: bx, y: 6.2 }, 1.4), CLEAR, 0.4))
  g.add(ball(1.5, '#b9b4ad', { x: bx, y: 7.35, z: 0.3 }, [1.3, 0.7, 1]))
  g.add(rbox(6.4, 1.6, 5.6, handle, { x: bx, y: 9.6 }, 0.7))
  g.add(cyl(2.9, 3, 1.4, STEEL, { x: bx, y: 11 }, 24))
  for (const r of [1, 2]) g.add(noOutline(P(torus(r, 0.18, DARK), bx, 12.45, 0, PI / 2)))
  g.add(cylZ(0.8, 0.6, handle, bx, 3.6, 3))
  // 替换粘纸卷：横躺，纸芯两头露出一点
  g.add(cylZ(2.9, 9, WHITE, 10.5, 2.9, 0))
  g.add(cylZ(1.3, 9.6, '#c9a477', 10.5, 2.9, 0, 16))
  return fitGroup(g)
}

// ---------- 针线盒：木 / 藤编盒，后沿铰链的盖子翻开立在后面（盖里有布衬）；盒里一排线轴、番茄针插、卷尺、顶针和一把剪刀 ----------

const SB = { w: 26, d: 17, h: 8.5, t: 1, lid: 3 }
const THREADS = ['#e8483f', '#3f7fd8', '#f2c230', '#4f9e5b', '#f4f2ec']
function spool(x: number, y: number, z: number, color: string, wood: string) {
  return G(cyl(1.25, 1.25, 0.35, wood, { x, y, z }, 14), cyl(1.05, 1.05, 3, color, { x, y: y + 0.3, z }, 14), cyl(1.25, 1.25, 0.35, wood, { x, y: y + 3.25, z }, 14))
}
function sewingBox(p: string[]) {
  const [box, lining, grip] = p
  const g = new THREE.Group()
  const fl = SB.t
  g.add(tray(SB.w, SB.h, SB.d, SB.t, box))
  g.add(rbox(2.4, 1.6, 0.5, STEEL, { y: SB.h - 2.1, z: SB.d / 2 + 0.2 }, 0.2))
  // 盖子（局部坐标：原点在后沿铰链，闭合时向 +z 盖过去），翻开约 95°
  const lid = new THREE.Group()
  lid.add(rbox(SB.w, 0.8, SB.d, box, { y: SB.lid - 0.8, z: SB.d / 2 }, 0.3))
  for (const z of [0.45, SB.d - 0.45]) lid.add(rbox(SB.w, SB.lid - 0.7, 0.9, box, { z }, 0.3))
  for (const s of [-1, 1]) lid.add(rbox(0.9, SB.lid - 0.7, SB.d - 1.8, box, { x: s * (SB.w / 2 - 0.45), z: SB.d / 2 }, 0.3))
  lid.add(rbox(SB.w - 2.4, 0.4, SB.d - 2.4, lining, { y: SB.lid - 1.1, z: SB.d / 2 }, 0.15))
  lid.add(cylZ(0.5, 0.8, STEEL, 0, 1.15, SB.d + 0.3, 10))
  lid.position.set(0, SB.h, -SB.d / 2)
  lid.rotation.x = -(95 * PI) / 180
  g.add(lid)
  for (const s of [-1, 1]) g.add(cylX(0.45, 3, STEEL, s * 8, SB.h, -SB.d / 2, 10))
  // 后排线轴
  THREADS.forEach((c, i) => g.add(spool(-9 + i * 2.8, fl, -5.5, c, shade(box, 0.15))))
  // 番茄针插：压扁的红球 + 五角萼片 + 小梗，斜插三根珠针
  const tc: V3 = [8, fl + 2.45, -3]
  g.add(ball(3.4, '#e5483e', { x: tc[0], y: tc[1], z: tc[2] }, [1, 0.72, 1]))
  g.add(cyl(0.3, 2.2, 0.7, '#4f9e5b', { x: tc[0], y: 5.25, z: tc[2] }, 5))
  g.add(cyl(0.22, 0.28, 0.9, '#4f9e5b', { x: tc[0], y: 5.85, z: tc[2] }, 6))
  for (const [a, c] of [
    [0.4, '#3f7fd8'],
    [2.5, '#f2c230'],
    [4.4, '#ffffff'],
  ] as [number, string][]) {
    const u: V3 = [Math.cos(a) * 0.62, 0.78, Math.sin(a) * 0.62]
    const at = (k: number): V3 => [tc[0] + 3.4 * u[0] * k, tc[1] + 2.45 * u[1] * k, tc[2] + 3.4 * u[2] * k]
    const out = at(1.25)
    g.add(rod3(at(0.8), out, 0.08, STEEL, 5))
    g.add(ball(0.32, c, { x: out[0], y: out[1], z: out[2] }))
  }
  // 卷尺、顶针
  g.add(puck(2, 1.4, '#f2c230', { x: -9, y: fl, z: 4.2 }))
  g.add(noOutline(cyl(0.7, 0.7, 0.3, '#e0a526', { x: -9, y: fl + 1.3, z: 4.2 }, 12)))
  g.add(rbox(3, 0.2, 1.1, '#f6e27a', { x: -6.6, y: fl, z: 4.2 }, 0.05))
  g.add(P(cup(0.85, 1, 1.8, 0.15, STEEL), -3.4, fl + 1.8, 4.5, PI))
  // 剪刀：两片交叉的刀刃 + 两只指环
  // 两片刀刃一上一下叠着（中心高度分别和指环、指环上沿齐）
  for (const [z, yc, ry] of [
    [3.9, 0.28, -0.167],
    [4.9, 0.58, 0.167],
  ] as [number, number, number][])
    g.add(P(rbox(7.2, 0.3, 0.8, STEEL, {}, 0.1), 5.45, fl + yc, z, 0, ry, 0))
  for (const z of [3.3, 5.5]) g.add(P(torus(1.1, 0.28, grip), 0.8, fl + 0.28, z, PI / 2))
  return fitGroup(g)
}

// ---------- 壁挂熨衣板：墙上一块挂板，两只 J 形钩挂着折起来的熨衣板（鼻头朝下、腿收在板背后），挂板上方的小托架里放着熨斗 ----------

const IB = { d: 14.6, mount: 60 }
const IRON_SOLE: Poly = [
  [-5.5, -11],
  [5.5, -11],
  [5.5, 1],
  [3.3, 7.5],
  [0, 12],
  [-3.3, 7.5],
  [-5.5, 1],
]
/** 熨斗：钢底板 + 机身 + 提手和两根立柱 + 温度旋钮；鼻头朝 +x，底面在 y = 0 */
function ironPiece(body: string, handle: string) {
  const g = new THREE.Group()
  g.add(slab(IRON_SOLE, 1.3, STEEL))
  g.add(slab(IRON_SOLE.map(([x, z]): [number, number] => [x * 0.9, z * 0.9 - 0.5]), 4.6, body, 1.2))
  g.add(rbox(2.4, 1.8, 13.5, handle, { y: 9.8, z: -1.8 }, 0.8))
  g.add(rod3([0, 5.6, 4], [0, 10.4, 4.2], 1, handle, 8))
  g.add(rod3([0, 5.6, -8.2], [0, 10.4, -8], 1, handle, 8))
  g.add(cyl(1.4, 1.4, 0.6, shade(body, -0.2), { y: 5.7, z: 1.5 }, 16))
  // 鼻头从 +z 转到 +x；外面再包一层，调用方用 P 摆放时不会冲掉这个转角
  g.rotation.y = PI / 2
  return G(g)
}
function wallIroningBoard(p: string[]) {
  const [cover, frame, iron, dots] = p
  const g = new THREE.Group()
  const zw = -IB.d / 2
  // 挂板
  g.add(rbox(36, 38, 1.6, frame, { y: 148, z: zw + 0.8 }, 0.6))
  // 熨衣板：方头在上、椭圆鼻头朝下；板面上一片圆点布套
  const pts: V2[] = [
    [-17, 172],
    [17, 172],
  ]
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * PI
    pts.push([17 * Math.cos(a), 100 - 38 * Math.sin(a)])
  }
  g.add(P(cutout(pts, 2, cover), 0, 0, 2))
  for (const [x, y] of [
    [-9, 160],
    [0, 150],
    [9, 160],
    [-9, 140],
    [9, 140],
    [0, 130],
    [-9, 120],
    [9, 120],
    [0, 110],
    [-7, 100],
    [7, 100],
    [0, 88],
  ])
    g.add(noOutline(cylZ(0.9, 0.4, dots, x, y, 3.1, 10)))
  // 板背后的骨架和收起来的腿（四根竖杆 + 底端横杆），最上面那根横杆挂在钩子里
  g.add(rbox(20, 80, 1.2, frame, { y: 80, z: 0.45 }, 0.3))
  for (const [x, y0, y1] of [
    [12, 70, 155],
    [8.5, 74, 162],
  ])
    for (const s of [-1, 1]) g.add(rod3([s * x, y0, -0.6], [s * x, y1, -0.6], 0.8, frame, 8))
  g.add(cylX(0.9, 25, frame, 0, 70, -0.6))
  g.add(cylX(0.9, 18, frame, 0, 74, -0.6))
  g.add(cylX(0.9, 32, frame, 0, 155, -0.6))
  // J 形钩
  for (const s of [-1, 1]) {
    g.add(rod3([s * 15, 154, zw + 1.4], [s * 15, 154, 0.4], 0.5, STEEL, 8))
    g.add(rod3([s * 15, 154, 0.4], [s * 15, 156.5, 0.4], 0.5, STEEL, 8))
  }
  // 熨斗托架：底板 + 前挡 + 两根斜撑，熨斗平放在上面
  g.add(rbox(26, 0.8, 13, frame, { y: 178, z: zw + 1.6 + 6.5 }, 0.3))
  g.add(rbox(26, 2.2, 0.6, frame, { y: 178, z: zw + 1.6 + 12.7 }, 0.2))
  for (const s of [-1, 1]) g.add(rod3([s * 11, 172, zw + 1.4], [s * 11, 178.2, zw + 13.4], 0.5, frame, 8))
  g.add(P(ironPiece(iron, shade(iron, -0.25)), 0, 178.8, zw + 1.6 + 6.5))
  return fitWall(g, IB.mount, IB.d)
}

// ---------- 体温计与药盒：七格一周药盒（周四那格打开、盖子立在后面，里面几粒药）、一支电子体温计、一盒立着的退热贴 ----------

const DAYS = ['#e8483f', '#f29a3d', '#f2c230', '#4f9e5b', '#3fb0c8', '#3f7fd8', '#9a6fd6']
function thermoSet(p: string[]) {
  const [box, patch, acc] = p
  const g = new THREE.Group()
  const n = 7
  const cw = 2.1
  const pitch = 2.35
  const z0 = -3
  g.add(rbox(pitch * n - 0.1, 0.4, 3, shade(box, -0.08), { z: z0 }, 0.15))
  for (let i = 0; i < n; i++) {
    const x = (i - 3) * pitch
    const c = DAYS[i]
    if (i === 3) {
      g.add(tray(cw, 1.9, 3.5, 0.25, box, { x, y: 0.3, z: z0 }))
      g.add(ball(0.42, '#ffffff', { x: x - 0.35, y: 0.95, z: z0 - 0.6 }))
      g.add(ball(0.38, '#f2a33a', { x: x + 0.35, y: 0.92, z: z0 + 0.5 }, [1, 1, 1.8]))
      g.add(rbox(cw + 0.12, 3.66, 0.5, c, { x, y: 2, z: z0 - 1.95 }, 0.2))
    } else {
      g.add(rbox(cw, 1.9, 3.5, box, { x, y: 0.3, z: z0 }, 0.3))
      g.add(rbox(cw + 0.12, 0.5, 3.66, c, { x, y: 2.1, z: z0 }, 0.2))
      g.add(rbox(1, 0.5, 0.5, c, { x, y: 2.1, z: z0 + 2.03 }, 0.15))
    }
  }
  // 电子体温计：白色笔身 + 尾部色块 + 液晶窗 + 按键 + 金属测温头
  const th = new THREE.Group()
  th.add(rbox(10.5, 1.1, 1.9, WHITE, {}, 0.5))
  th.add(rbox(3.2, 1.2, 2.05, acc, { x: -3.9 }, 0.5))
  th.add(cylX(0.35, 2, STEEL, 6.1, 0.55, 0, 10))
  th.add(ball(0.36, STEEL, { x: 7.1, y: 0.55 }))
  th.add(noOutline(rbox(2.6, 0.2, 1.1, SCREEN, { x: -0.8, y: 1 }, 0.05)))
  th.add(noOutline(lit(rbox(1.8, 0.1, 0.6, DIGIT, { x: -0.8, y: 1.15 }, 0.03), DIGIT, 0.7)))
  th.add(cyl(0.4, 0.4, 0.3, acc, { x: 2, y: 1 }, 10))
  g.add(P(th, -6, 0, 2.6, 0, 0.12, 0))
  // 退热贴：立着的纸盒，正面印一片蓝色凝胶贴
  g.add(rbox(8, 5, 3.4, patch, { x: 5.8, z: 3.3 }, 0.4))
  g.add(noOutline(rbox(5, 2.6, 0.3, '#e9f5fb', { x: 5.8, y: 1, z: 5.15 }, 0.3)))
  g.add(noOutline(rbox(3.6, 1.6, 0.3, '#7cc3e8', { x: 5.8, y: 1.5, z: 5.45 }, 0.3)))
  return fitGroup(g)
}

// ---------- 热水袋与暖手宝：平躺的热水袋套着针织套（两条麻花纹），橡胶瓶口和塞子露在外面；旁边一只圆饼形充电暖手宝 ----------

function bagShape() {
  const s = new THREE.Shape()
  const r = 4.5
  s.moveTo(-15 + r, -8)
  s.lineTo(5, -8)
  s.lineTo(10, -3.2)
  s.lineTo(12.5, -3.2)
  s.lineTo(12.5, 3.2)
  s.lineTo(10, 3.2)
  s.lineTo(5, 8)
  s.lineTo(-15 + r, 8)
  s.absarc(-15 + r, 8 - r, r, PI / 2, PI, false)
  s.lineTo(-15, -8 + r)
  s.absarc(-15 + r, -8 + r, r, PI, PI * 1.5, false)
  return s
}
function hotWaterBag(p: string[]) {
  const [cover, rubber, warmer, acc] = p
  const g = new THREE.Group()
  g.add(P(cutout(bagShape(), 3.6, cover, 1.3, 3), 0, 1.8, 0, -PI / 2))
  // 两条麻花纹：一串压扁的小球
  for (const z of [-2.6, 2.6]) for (let k = 0; k < 8; k++) g.add(ball(0.9, shade(cover, -0.08), { x: -12 + k * 2, y: 3.5, z }, [1.4, 0.4, 0.9], [8, 6]))
  // 瓶口：针织套的罗纹口、橡胶瓶颈、塞子和塞子上的捏手
  g.add(cylX(1.75, 1.8, shade(cover, -0.12), 12.2, 1.8, 0))
  g.add(cylX(1.5, 5, rubber, 13.5, 1.8, 0))
  g.add(cylX(1.75, 1.4, acc, 16.6, 1.8, 0))
  g.add(rbox(1.2, 1, 3.4, acc, { x: 17.8, y: 1.3 }, 0.4))
  // 暖手宝：圆饼机身 + 顶面色片 + 三颗电量灯
  const wx = 13
  const wz = 6.4
  g.add(puck(4.2, 2.6, warmer, { x: wx, z: wz }))
  g.add(noOutline(cyl(2.6, 2.6, 0.4, acc, { x: wx, y: 2.5, z: wz }, 24)))
  for (let k = 0; k < 3; k++) g.add(lit(cyl(0.3, 0.3, 0.3, '#ffb86b', { x: wx - 0.9 + k * 0.9, y: 2.85, z: wz + 1.2 }, 8), '#ffb86b', 0.8))
  return fitGroup(g)
}

// ---------- 厨房电子秤：扁平秤体 + 钢秤盘，前沿一块深色屏（发光数字块）和两颗按键，秤盘上一只碗装着面粉 ----------

function kitchenScale(p: string[]) {
  const [body, pan, bowl, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.9, 0.9, 0.5, RUBBER, { x: sx * 8, z: sz * 6.5 }, 10))
  g.add(rbox(20, 2.2, 17, body, { y: 0.4 }, 1))
  g.add(rbox(17, 0.5, 11.5, pan, { y: 2.5, z: -2.3 }, 0.3))
  // 显示屏和数字块（不写字，四块方块示意）
  g.add(rbox(8.5, 0.5, 3, SCREEN, { x: -2.5, y: 2.4, z: 5.8 }, 0.15))
  for (let i = 0; i < 4; i++) g.add(noOutline(lit(rbox(1.3, 0.2, 1.9, DIGIT, { x: -5.35 + i * 1.9, y: 2.8, z: 5.8 }, 0.05), DIGIT, 0.75)))
  for (const x of [4.5, 7]) g.add(cyl(0.8, 0.8, 0.4, acc, { x, y: 2.4, z: 5.8 }, 12))
  // 碗 + 面粉（填满碗底的面粉堆）
  g.add(cup(6.2, 3.6, 5.2, 0.35, bowl, { y: 3, z: -2.3 }))
  g.add(cyl(5, 3.3, 3.2, '#f5efe2', { y: 3.3, z: -2.3 }, 24))
  g.add(ball(4.9, '#f5efe2', { y: 6.5, z: -2.3 }, [1, 0.25, 1]))
  return fitGroup(g)
}

// ---------- 身高体重秤：医院式机械秤——带胶垫的秤台，后面一根立柱顶着秤头（两根带游码的秤杆），上面伸出带刻度的身高尺和滑动头板 ----------

function bodyHeight(p: string[]) {
  const [body, mat, acc] = p
  const g = new THREE.Group()
  const zc = -23
  // 秤台 + 胶垫，后面立柱的底座
  g.add(rbox(38, 7, 44, body, { z: 4 }, 2))
  g.add(rbox(32, 0.6, 36, mat, { y: 6.8, z: 5 }, 0.3))
  g.add(rbox(12, 6.6, 9, body, { z: -21.5 }, 1.5))
  // 立柱和秤头
  g.add(rbox(5, 128, 4.4, body, { y: 6, z: zc }, 1))
  g.add(rbox(9, 15, 7, body, { y: 132, z: -22.5 }, 1.6))
  // 两根秤杆（向右伸出），各带一只游码，末端一只指针框；秤杆上的刻度
  const bz = -18.6
  for (const [y, h, px, pw] of [
    [141.5, 2.4, 12, 2.6],
    [137, 1.8, 15, 2.2],
  ] as [number, number, number, number][]) {
    g.add(rbox(34.5, h, 1.4, STEEL, { x: 9.25, y, z: bz }, 0.4))
    g.add(rbox(pw, h + 1, 2.4, acc, { x: px, y: y - 0.5, z: bz }, 0.5))
    for (let k = 0; k < 9; k++) g.add(noOutline(rbox(0.25, h * 0.5, 0.4, DARK, { x: -4 + k * 3.4, y: y + h * 0.25, z: bz + 0.8 }, 0.05)))
  }
  g.add(rbox(1.4, 9, 2.8, body, { x: 27, y: 134.5, z: bz }, 0.4))
  // 身高尺：钢尺插在秤头顶上，正面一排刻度，顶上一只端帽
  g.add(rbox(2.6, 60, 1.6, STEEL, { y: 143, z: zc }, 0.3))
  for (let k = 0; k < 13; k++) g.add(noOutline(rbox(k % 2 ? 0.7 : 1.2, 0.25, 0.4, DARK, { x: -0.4, y: 150 + k * 4, z: zc + 0.9 }, 0.05)))
  g.add(rbox(3.4, 1.6, 2.4, body, { y: 203, z: zc }, 0.4))
  // 滑动头板：套在尺上的滑块 + 向前伸的平板
  g.add(rbox(4.2, 4, 3, acc, { y: 178, z: zc }, 0.6))
  g.add(rbox(3, 0.9, 20, acc, { y: 180.5, z: zc + 1.2 + 10 }, 0.3))
  return fitGroup(g)
}

// ---------- 超市购物篮：镂空格栅的塑料篮（加厚的上沿），两根提手放倒在长边外侧；篮里一盒牛奶、一条面包、一瓶果汁和两只苹果 ----------

const BK = { w: 41, d: 28, h: 22, t: 0.8 }
function shoppingBasket(p: string[]) {
  const [main, grip] = p
  const g = new THREE.Group()
  const { w, d, h, t } = BK
  const lift = (hs: Hole[]) => hs.map((o) => moveHole(o, 1, t))
  const fr = lift(gridHoles(w, h - t, 7, 3, 1.8, 2.2))
  const sd = lift(gridHoles(d - t * 2, h - t, 5, 3, 1.6, 2.2))
  g.add(shell(w, h, d, t, main, { top: false, front: fr, back: fr, left: sd, right: sd }))
  // 上沿：前后两条整宽、左右两条略矮
  for (const s of [-1, 1]) {
    g.add(rbox(w + 0.8, 1.8, 1.8, main, { y: h - 0.8, z: s * (d / 2 - t / 2) }, 0.5))
    g.add(rbox(1.7, 1.7, d - 1, main, { x: s * (w / 2 - t / 2), y: h - 0.8 }, 0.5))
  }
  // 提手：U 形管从两端的铆钉垂下来，下面一段包着握把
  for (const s of [-1, 1]) {
    const z = s * (d / 2 + 1)
    g.add(
      tube(
        [
          [-17, h - 0.5, z],
          [-16, 12, z],
          [-11, 7.5, z],
          [11, 7.5, z],
          [16, 12, z],
          [17, h - 0.5, z],
        ],
        0.6,
        grip,
        { seg: 24, radial: 6 },
      ),
    )
    for (const x of [-17, 17]) g.add(cylZ(1.1, 1, grip, x, h - 0.2, z - s * 0.1, 12))
    g.add(rbox(14, 2.2, 1.8, grip, { y: 6.4, z }, 0.8))
  }
  // 篮里的东西（都坐在篮底上）
  const fy = t
  g.add(rbox(7, 16, 7, WHITE, { x: -13, y: fy, z: -6 }, 0.4))
  g.add(rbox(7.6, 6, 7.6, '#3f7fd8', { x: -13, y: fy + 4.2, z: -6 }, 0.4))
  g.add(
    P(
      sideSlab(
        [
          [-3.5, 0],
          [3.5, 0],
          [0.3, 2.7],
          [0.3, 3.8],
          [-0.3, 3.8],
          [-0.3, 2.7],
        ],
        7,
        WHITE,
      ),
      -13,
      fy + 15.8,
      -6,
    ),
  )
  g.add(rbox(13, 6.5, 8, '#d9a35b', { x: 3, y: fy, z: -6.5 }, 2.5))
  for (let k = 0; k < 3; k++) g.add(noOutline(P(rbox(1, 0.4, 5, '#b8803e', {}, 0.2), -1 + k * 4, fy + 6.45, -6.5, 0, 0.5, 0)))
  g.add(
    latheAt(
      [
        [0, 0],
        [2.8, 0],
        [3, 0.4],
        [3, 14],
        [1.6, 17.5],
        [1.3, 19],
        [0, 19],
      ],
      '#f29a3d',
      { x: -3, y: fy, z: 6 },
      20,
    ),
  )
  g.add(cyl(1.5, 1.5, 1.5, WHITE, { x: -3, y: fy + 18.8, z: 6 }, 14))
  g.add(cyl(3.2, 3.2, 5, WHITE, { x: -3, y: fy + 5, z: 6 }, 20))
  for (const [x, z, r, c] of [
    [12, 6, 3.6, '#d8483f'],
    [5, 7, 3.4, '#9bc45a'],
  ] as [number, number, number, string][]) {
    g.add(ball(r, c, { x, y: fy + r - 0.2, z }, undefined, [12, 10]))
    g.add(cyl(0.2, 0.25, 1.2, '#6b4a2a', { x, y: fy + r * 2 - 0.5, z }, 6))
  }
  return fitGroup(g)
}

// ---------- 门后挂式鞋袋：布背板上 4×3 只透明口袋（彩色包边），几双鞋鞋尖朝下插在袋里，顶上两只钩子翻过门顶 ----------

/** 鞋的俯视轮廓（半宽）：[y, 半宽]，y 从鞋尖 0 到后跟 25.6；前掌最宽、腰窝收一点、后跟圆头 */
const SHOE_HALF: V2[] = [
  [0, 0],
  [0.3, 1.3],
  [1, 2.3],
  [2, 2.9],
  [3.5, 3.3],
  [5.5, 3.55],
  [8, 3.6],
  [11, 3.35],
  [14, 3],
  [17, 2.9],
  [20, 3],
  [23, 2.95],
  [24.6, 2.5],
  [25.3, 1.6],
  [25.6, 0],
]
function shoeOutline(k = 1): V2[] {
  const right = SHOE_HALF.map(([y, w]): V2 => [w * k, y])
  const left = SHOE_HALF.slice(1, -1)
    .reverse()
    .map(([y, w]): V2 => [-w * k, y])
  return [...right, ...left]
}
/**
 * 竖着插进口袋的鞋：鞋底贴背板、鞋尖朝下，鞋面朝外（+z）；原点在鞋尖底部。
 * 用真实的鞋形轮廓（圆鞋头、前掌宽、后跟收圆）挤出，鞋面上一段鞋带、舌头和后跟处的鞋口，
 * 否则圆角长方块从正面看像一节电池。
 */
function pocketShoe(color: string, acc: string) {
  const g = new THREE.Group()
  // 鞋底：轮廓放大一圈，贴着背板
  g.add(P(cutout(shoeOutline(1.08), 1, WHITE, 0.3), 0, -0.2, 0.4))
  // 鞋面：圆鼓的倒角让鞋头和后跟有体积
  g.add(P(cutout(shoeOutline(), 3.6, color, 1.2, 2), 0, 0, 2.8))
  const fz = 2.8 + 1.8
  // 鞋带：几道横向的带子，下面压着一条舌头
  g.add(rbox(3.2, 7.6, 0.4, shade(color, -0.12), { y: 9, z: fz + 0.1 }, 0.15))
  for (let k = 0; k < 4; k++) g.add(noOutline(rbox(3.8, 0.55, 0.4, acc, { y: 10 + k * 1.8, z: fz + 0.4 }, 0.15)))
  // 鞋口：后跟一段，加厚的包边圈 + 深色的鞋膛，后跟提耳从顶上翘出来
  g.add(P(cutout(shoeOutline(0.78).map(([x, y]): V2 => [x, 17.3 + (y / 25.6) * 7.4]), 0.6, shade(color, -0.15), 0.2), 0, 0, fz + 0.1))
  g.add(P(cutout(shoeOutline(0.55).map(([x, y]): V2 => [x, 18.2 + (y / 25.6) * 5.6]), 0.4, DARK, 0.1), 0, 0, fz + 0.45))
  g.add(rbox(2.4, 2.6, 0.9, acc, { y: 24.2, z: 1.6 }, 0.3))
  return g
}
const DO = { d: 11.6, mount: 60, cols: [-17.4, -5.8, 5.8, 17.4], rows: [6, 46, 86], ph: 22, pd: 6.5 }
function doorShoeOrganizer(p: string[]) {
  const [back, bind, shoeA, shoeB] = p
  const g = new THREE.Group()
  g.add(rbox(48, 132, 0.6, back, { z: 0 }, 0.3))
  g.add(rbox(48.4, 6.2, 1.2, bind, { y: 126.2 }, 0.4))
  const fz = 0.3 + DO.pd
  // 哪一格插着什么鞋：[行, 列, 鞋色, 侧条色]
  const shoes: [number, number, string, string][] = [
    [2, 0, shoeA, WHITE],
    [2, 1, shoeA, WHITE],
    [1, 2, shoeB, DARK],
    [1, 3, shoeB, DARK],
    [0, 1, WHITE, shoeA],
    [0, 2, WHITE, shoeA],
  ]
  DO.rows.forEach((yb, ri) =>
    DO.cols.forEach((x, ci) => {
      // 口袋：透明前片 + 两侧片，底边和前片上沿包边
      g.add(ghost(rbox(10.6, DO.ph, 0.3, CLEAR, { x, y: yb, z: fz + 0.15 }, 0.1), CLEAR, 0.3))
      for (const s of [-1, 1]) g.add(ghost(rbox(0.3, DO.ph, 6.4, CLEAR, { x: x + s * 5.05, y: yb, z: 0.3 + 3.2 }, 0.1), CLEAR, 0.3))
      g.add(rbox(10.8, 1.2, 6.8, bind, { x, y: yb - 0.6, z: 3.45 }, 0.3))
      g.add(rbox(10.9, 1.2, 0.8, bind, { x, y: yb + DO.ph - 1, z: fz + 0.15 }, 0.3))
      const sh = shoes.find(([r, c]) => r === ri && c === ci)
      if (sh) g.add(P(pocketShoe(sh[2], sh[3]), x, yb + 0.6, 0.35))
    }),
  )
  // 顶上两只翻过门顶的钩子 + 背板上的金属气眼
  for (const s of [-1, 1]) {
    g.add(
      tube(
        [
          [s * 15, 127, -0.6],
          [s * 15, 140, -0.6],
          [s * 15, 142.5, -2],
          [s * 15, 141, -3.6],
          [s * 15, 136, -3.6],
        ],
        0.45,
        STEEL,
        { seg: 32, radial: 6 },
      ),
    )
    g.add(P(torus(1, 0.3, STEEL), s * 15, 129.3, 0.65))
  }
  return fitWall(g, DO.mount, DO.d)
}

// ---------- 浴霸：贴墙的方形暖风换气面板——机身 + 面板，上半两只自发光的暖灯（镀铬灯圈），下半一排格栅，中间一颗指示灯 ----------

const BH = { d: 13, mount: 206 }
function bathHeater(p: string[]) {
  const [main, panel] = p
  const g = new THREE.Group()
  g.add(rbox(29, 29, 10.4, main, { y: 0.5, z: -0.8 }, 1.6))
  const holes: Hole[] = [
    { kind: 'circle', x: -7, y: 21, r: 4.6 },
    { kind: 'circle', x: 7, y: 21, r: 4.6 },
  ]
  for (let k = 0; k < 5; k++) holes.push({ kind: 'rect', x: 0, y: 3.5 + k * 2.2, w: 22, h: 1.1, r: 0 })
  g.add(holePanel(30, 30, 1.2, panel, holes, { z: 5 }))
  g.add(rbox(23, 11, 0.6, DARK, { y: 3, z: 4.6 }, 0.2))
  for (const s of [-1, 1]) {
    g.add(lit(ball(4.3, '#ffb347', { x: s * 7, y: 21, z: 5 }, [1, 1, 0.45]), '#ffb347', 0.9))
    g.add(P(torus(4.6, 0.45, STEEL), s * 7, 21, 5.6))
  }
  g.add(lit(rbox(1.6, 0.5, 0.4, '#7fe0ff', { y: 15.6, z: 5.7 }, 0.15), '#7fe0ff', 0.8))
  return fitWall(g, BH.mount, BH.d)
}

// ---------- 搪瓷牛奶罐：老式奶罐——圆筒罐身收肩到细颈，颈口扣着带提环的盖子，肩上两只弯耳把，罐身两道色箍和一块椭圆标牌 ----------

function milkCan(p: string[]) {
  const [body, acc, label] = p
  const g = new THREE.Group()
  g.add(
    latheAt(
      [
        [0, 0],
        [11.4, 0],
        [12, 0.6],
        [12, 2.4],
        [11.6, 2.8],
        [11.6, 31],
        [11.1, 33.5],
        [7.6, 41.5],
        [6, 44],
        [5.8, 47.5],
        [0, 47.5],
      ],
      body,
      {},
      32,
    ),
  )
  g.add(
    latheAt(
      [
        [0, 47.1],
        [7.2, 47.1],
        [7.4, 47.5],
        [7.4, 49.1],
        [6.6, 49.5],
        [6.2, 49.9],
        [4.6, 51.9],
        [0, 52.3],
      ],
      body,
      {},
      32,
    ),
  )
  g.add(P(torus(5.9, 0.5, acc), 0, 46.5, 0, PI / 2))
  g.add(P(torus(7.45, 0.4, acc), 0, 48.3, 0, PI / 2))
  g.add(P(torus(2.4, 0.55, acc, {}, PI), 0, 51.2, 0))
  for (const y of [3.5, 29.5]) g.add(P(torus(11.7, 0.35, acc), 0, y, 0, PI / 2))
  // 两只耳把：两头插进罐肩
  for (const s of [-1, 1])
    g.add(
      tube(
        [
          [s * 11, 32.5, 0],
          [s * 14.5, 33.8, 0],
          [s * 15.4, 37, 0],
          [s * 14, 40, 0],
          [s * 10.5, 40.6, 0],
          [s * 8, 39.6, 0],
        ],
        0.9,
        acc,
        { seg: 24, radial: 8 },
      ),
    )
  // 正面的椭圆标牌：平板竖贴在罐身上（后半截埋进去），扁球贴在弧面上只露出一小块，看着像一块污渍
  const tag = G(cylZ(4, 1.6, label, 0, 0, 0, 28))
  tag.position.set(0, 17, 11.4)
  tag.scale.set(1, 1.3, 1)
  g.add(tag)
  return g
}

// ---------- 配色 ----------

const DS_PALS: Pal[] = [
  ['cute', [C.sky, C.pink, C.lemon, C.white]],
  ['modern', [M.white, '#9fc3e0', M.char, '#3f7fd8']],
  ['nordic', [N.white, N.sage, N.linen, N.blue]],
  ['cute', [C.mint, C.lilac, C.peach, '#ffffff']],
]
const DP_PALS: Pal[] = [
  ['modern', [M.silver, M.char, '#5b8fd1', '#f2c94c']],
  ['cute', [C.white, C.pink, C.sky, C.lemon]],
  ['industrial', [I.steel, I.iron, I.rust, '#e8e1d4']],
  ['nordic', [N.white, N.oak, N.sage, N.mustard]],
]
const SC_PALS: Pal[] = [
  ['classic', [CL.walnut, '#7a4b32', '#c8a068', CL.cream]],
  ['nordic', [N.oak, M.char, N.oakL, N.linen]],
  ['industrial', [I.walnut, I.iron, '#b88a5a', I.concrete]],
  ['farmhouse', [F.oak, F.barn, F.linen, F.white]],
]
const ST_PALS: Pal[] = [
  ['classic', ['#c9946a', CL.gold]],
  ['nordic', [N.oak, M.silver]],
  ['classic', [CL.walnut, CL.gold]],
  ['japanese', [J.hinoki, J.sumi]],
]
const LR_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.white]],
  ['modern', [M.char, M.light, M.white]],
  ['nordic', [N.sage, N.linen, N.white]],
  ['cute', [C.mint, C.lemon, C.lilac]],
]
const SB_PALS: Pal[] = [
  ['farmhouse', ['#c9a06a', F.sage, F.barn]],
  ['classic', [CL.walnut, CL.wine, CL.gold]],
  ['cute', [C.woodL, C.pink, C.sky]],
  ['japanese', [J.wood, J.ai, J.shu]],
]
const IB_PALS: Pal[] = [
  ['modern', ['#8fb3d9', M.white, '#3f7fd8', M.white]],
  ['cute', [C.pink, C.white, C.sky, C.white]],
  ['nordic', [N.linen, N.white, N.sage, N.gray]],
  ['industrial', [I.concrete, I.iron, I.rust, '#e8e1d4']],
]
const TM_PALS: Pal[] = [
  ['cute', [C.white, C.sky, C.pink]],
  ['modern', [M.light, '#3f7fd8', M.char]],
  ['nordic', [N.white, N.blue, N.sage]],
  ['cute', [C.cream, C.mint, C.lilac]],
]
const HW_PALS: Pal[] = [
  ['cute', [C.pink, '#e86f6f', C.white, C.sky]],
  ['nordic', [N.linen, '#d0644f', N.sage, N.mustard]],
  ['farmhouse', [F.butter, '#c95c4a', F.white, F.barn]],
  ['modern', [M.gray, '#c85050', M.char, '#f2c94c']],
]
const KS_PALS: Pal[] = [
  ['modern', [M.white, M.silver, M.light, '#3f7fd8']],
  ['modern', [M.char, M.silver, M.white, '#e8483f']],
  ['nordic', [N.oak, N.white, N.sage, N.mustard]],
  ['cute', [C.pink, C.white, C.mint, C.sky]],
]
const BHS_PALS: Pal[] = [
  ['modern', [M.white, M.char, '#3f7fd8']],
  ['classic', [CL.ivory, '#3d3f44', CL.navy]],
  ['industrial', [I.steel, I.iron, I.rust]],
  ['retro', [R.cream, '#3d3f44', R.teal]],
]
const BK_PALS: Pal[] = [
  ['modern', ['#d8483f', M.char]],
  ['modern', ['#3f7fd8', M.char]],
  ['cute', [C.mint, C.white]],
  ['retro', [R.mustard, R.red]],
  ['nordic', [N.gray, N.oak]],
]
const DO_PALS: Pal[] = [
  ['modern', [M.light, M.char, '#3f7fd8', '#e8483f']],
  ['cute', [C.white, C.pink, C.sky, C.lemon]],
  ['nordic', [N.linen, N.gray, N.sage, N.mustard]],
  ['industrial', [I.concrete, I.iron, I.rust, I.leather]],
]
const BH_PALS: Pal[] = [
  ['modern', [M.white, M.light]],
  ['modern', [M.silver, M.char]],
  ['nordic', [N.white, N.oakL]],
  ['industrial', [I.steel, I.iron]],
]
const MC_PALS: Pal[] = [
  ['farmhouse', [F.white, F.navy, F.butter]],
  ['farmhouse', [F.sage, F.white, F.linen]],
  ['farmhouse', [F.butter, F.barn, F.white]],
  ['retro', [R.cream, R.red, R.teal]],
  ['nordic', [N.blue, N.white, N.linen]],
]

export const DAILY_CARE: AssetDef[] = [
  define('dc-detergent-set', '洗衣液组', 'toiletry', [31.2, 13, 29], DS_PALS, detergentSet, {
    ...PROP,
    type: 'detergent',
    tags: ['laundry-supply', 'softener', 'wet-supply'],
    mats: ['plastic', 'plastic', 'plastic', 'plastic'],
  }),
  define('dc-drying-pole', '伸缩晾衣杆', 'outdoor', [163, 46, 149], DP_PALS, dryingPole, {
    type: 'laundry-stand',
    tags: ['cabinet', 'multi-ok', 'wet-supply'],
    mats: ['metal', 'plastic', 'fabric', 'fabric'],
    // 右半根横杆空着，可以再挂衣服 / 毛巾
    surfaces: [{ y: DP.bar + 1.75, kind: 'hook', h: 140, shape: [rectPoly(38, -0.5, 70, 2.5)] }],
  }),
  define('dc-shoe-care', '擦鞋套装', 'entrance', [30, 20.5, 12.1], SC_PALS, shoeCare, {
    ...PROP,
    type: 'sundries',
    mats: ['wood', 'metal', 'wood', 'fabric'],
  }),
  define('dc-shoe-trees', '鞋撑', 'entrance', [28.7, 18, 8.4], ST_PALS, shoeTreePair, {
    ...PROP,
    type: 'sundries',
    mats: ['wood', 'metal'],
  }),
  define('dc-lint-roller', '粘毛器与除毛球器', 'tabletop', [24.5, 10, 24.3], LR_PALS, lintSet, {
    ...PROP,
    type: 'cleaning',
    tags: ['sundries'],
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('dc-sewing-box', '针线盒', 'hobby', [26, 22, 26.1], SB_PALS, sewingBox, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['wood', 'fabric', 'plastic'],
  }),
  define('dc-ironing-board', '壁挂熨衣板', 'storage', [36, IB.d, 128.4], IB_PALS, wallIroningBoard, {
    type: 'wet-supply',
    mount: IB.mount,
    mats: ['fabric', 'metal', 'plastic', 'fabric'],
  }),
  define('dc-thermometer-set', '体温计与药盒', 'tabletop', [21.3, 11, 5.7], TM_PALS, thermoSet, {
    ...PROP,
    type: 'personal-care',
    mats: ['plastic', 'paper', 'plastic'],
  }),
  define('dc-hot-water-bag', '热水袋与暖手宝', 'tabletop', [33.4, 18.6, 3.9], HW_PALS, hotWaterBag, {
    ...PROP,
    type: 'personal-care',
    tags: ['bed-ok'],
    mats: ['fabric', 'plastic', 'plastic', 'plastic'],
  }),
  define('dc-kitchen-scale', '厨房电子秤', 'kitchenware', [20, 17, 8.2], KS_PALS, kitchenScale, {
    ...PROP,
    type: 'kitchenware',
    mats: ['plastic', 'metal', 'ceramic', 'plastic'],
  }),
  define('dc-body-height', '身高体重秤', 'toiletry', [46.7, 52, 204.6], BHS_PALS, bodyHeight, {
    // 医院式的立柱秤：不当普通体重秤用（一键布置的体重秤会摆进浴室）
    type: 'appliance',
    mats: ['metal', 'plastic', 'metal'],
  }),
  define('dc-shopping-basket', '购物篮', 'tabletop', [41.9, 31.8, 23], BK_PALS, shoppingBasket, {
    ...PROP,
    type: 'storage-box',
    mats: ['plastic', 'plastic'],
  }),
  define('dc-door-shoe-organizer', '门后挂式鞋袋', 'entrance', [48.4, DO.d, 142.9], DO_PALS, doorShoeOrganizer, {
    type: 'shoe-storage',
    mount: DO.mount,
    mats: ['fabric', 'fabric', 'fabric', 'leather'],
  }),
  define('dc-bathroom-heater', '浴霸', 'toiletry', [30, BH.d, 30], BH_PALS, bathHeater, {
    type: 'heater',
    mount: BH.mount,
    mats: ['plastic', 'plastic'],
  }),
  define('dc-milk-can', '搪瓷牛奶罐', 'deco', [32.6, 24.2, 54.2], MC_PALS, milkCan, {
    type: 'decor',
    mats: ['ceramic', 'ceramic', 'paint'],
  }),
]
