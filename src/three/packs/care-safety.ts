// 护理、无障碍与居家安全：轮椅、助行器、手杖架、电动护理床、床边移动桌、血压计、急救箱、壁挂药箱柜、
// 灭火器、保险箱、人字梯、手电筒与应急灯、防灾背包、配电箱、燃气热水器、暖气片、无障碍扶手。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。壁挂件按离地高度建（最低点 = mount，背面贴 z = -d/2，用 fitWall 对齐）；
// 带台面的（床边移动桌、保险箱）声明 surface，本体不平移。type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, box, cup, cyl, nub, rbox, shade, torus, tray } from '../toon'
import { C, carcass, holePanel, rectPoly, type AssetDef } from '../kit'
import { bakeMeshes, batten, bentPipe, cappedTube, cylX, cylZ, fitGroup, fitWall, G, ghost, hcyl, lathe, latheAt, lit, noOutline, P, PI, rod3, sideSlab, strutBox, taperRod3, tiltFrame, type V3 } from '../geo'
import { CL, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#24252a'
const RUBBER = '#2e2f33'
/** 充气胎 / 脚轮的灰色胎面 */
const TIRE = '#4a4c52'
const BRASS = '#c9a25a'
/** 医疗 / 安防标志的红 */
const SIGN_RED = '#d8362f'
const PAPER = '#fbf7f1'

/** 辐条轮（轮轴沿 x，圆心在 Group 原点）：胎圈 + 轮辋 + n 根辐条 + 轮毂 */
function chairWheel(R0: number, tire: number, n: number) {
  const g = new THREE.Group()
  g.add(P(torus(R0 - tire, tire, TIRE, {}, PI * 2, [8, 32]), 0, 0, 0, 0, PI / 2))
  const rim = R0 - tire * 2 - 0.4
  g.add(noOutline(P(torus(rim, 0.55, STEEL, {}, PI * 2, [4, 32]), 0, 0, 0, 0, PI / 2)))
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2
    g.add(noOutline(rod3([0, 0, 0], [0, Math.sin(a) * rim, Math.cos(a) * rim], 0.3, STEEL, 4)))
  }
  g.add(cylX(2, 5, STEEL, 0, 0, 0, 12))
  return g
}

/** 万向脚轮（轮轴沿 x）：顶板 + 两片叉板 + 轮子，顶板顶面在 y = top，轮子落地 */
function caster(x: number, z: number, r: number, top: number, wide = 2.8) {
  const g = new THREE.Group()
  // 顶板和叉板都是不到 1.5cm 厚的薄片：直角盒
  g.add(nub(wide + 2.6, 1.2, r * 0.8 + 1.4, STEEL, { y: top - 1.2 }))
  for (const s of [-1, 1]) g.add(nub(0.8, top - r * 0.7 - 0.6, r * 0.7, STEEL, { x: s * (wide / 2 + 0.7), y: r * 0.7 }))
  // 16 段：正下方有顶点，轮子正好落地
  g.add(cylX(r, wide, TIRE, 0, r, 0, 16))
  // 轮毂两头顶进叉板里（原来比叉板的间距短 0.3，轮子悬在两片叉板中间）
  g.add(noOutline(cylX(r * 0.42, wide + 0.8, '#d9dde2', 0, r, 0, 12)))
  return P(g, x, 0, z)
}

/** 竖直面上的十字标：两条嵌进表面一点的短条，中心 (x, y)，正面在 z */
function crossMark(size: number, color: string, x: number, y: number, z: number) {
  const bar = size * 0.32
  return G(noOutline(box(size, bar, 0.6, color, { x, y: y - bar / 2, z })), noOutline(box(bar, size, 0.6, color, { x, y: y - size / 2, z })))
}

// ---------- 轮椅：两只带手推圈的大后轮、两只小前脚轮、布座和靠背、扶手和护板、脚踏板、往后伸的推把 ----------

const WC = { w: 62, d: 100, h: 90, fx: 21.5, R: 29.5, az: -18 }
function wheelchair(p: string[]) {
  const [frame, seat, pad] = p
  const g = new THREE.Group()
  const { fx, R, az } = WC
  for (const s of [-1, 1]) {
    const x = s * fx
    // 靠背立管从下横管的后端一路往上（经过轮轴），顶端往后弯成推把
    g.add(bentPipe([[x, 26, -19.57], [x, 86, -27], [x, 87.5, -41]], 1.2, frame, 4, true))
    g.add(rod3([x, 86.7, -33.3], [x, 87.5, -41], 1.75, RUBBER, 12))
    g.add(ball(1.75, RUBBER, { x, y: 87.5, z: -41 }, undefined, [12, 6]))
    // 座管 + 前立管（下端接脚轮）、下横管
    g.add(bentPipe([[x, 48, -22.3], [x, 48, 22], [x, 15, 26]], 1.2, frame, 4))
    g.add(rod3([x, 26, -19.6], [x, 26, 24.7], 1.1, frame, 8))
    // 扶手：前立柱 + 往后接到靠背管，上面一块软垫，下面一片护板
    g.add(bentPipe([[x, 48, 13], [x, 66, 13], [x, 66, -24.5]], 1.1, frame, 3.5))
    g.add(rbox(4.6, 2.6, 26, pad, { x, y: 66.4, z: -6 }, 1.1))
    g.add(rbox(0.8, 16, 32, pad, { x: s * (fx + 0.3), y: 49.5, z: -6 }, 0.3))
    // 后轮（辐条轮）+ 外侧的手推圈
    g.add(P(chairWheel(R, 1.5, 10), s * 26.5, R, az))
    g.add(cylX(1.4, 5, STEEL, s * 23.5, R, az, 10))
    g.add(P(torus(24.5, 0.6, STEEL, {}, PI * 2, [6, 32]), s * 29.6, R, az, 0, PI / 2))
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + (k * PI) / 2
      g.add(noOutline(rod3([s * 26.5, R + Math.sin(a) * 26, az + Math.cos(a) * 26], [s * 29.6, R + Math.sin(a) * 24.5, az + Math.cos(a) * 24.5], 0.4, STEEL, 6)))
    }
    // 前脚轮
    g.add(caster(x, 25.4, 6.2, 13.8))
    g.add(cyl(1.5, 1.5, 2.6, STEEL, { x, y: 13.6, z: 26 }, 10))
    // 脚踏：从座管前端斜着伸下去的吊管（中间略折一下，不在一个竖直面里：不倒圆角）+ 一块踏板
    g.add(bentPipe([[s * (fx - 0.4), 47, 22.5], [s * (fx - 1.5), 30, 35], [s * (fx - 6.5), 9.2, 44]], 1, frame, 0, true))
    g.add(P(rbox(15, 1.4, 11, pad, {}, 0.6), s * 12.5, 8.6, 45, -0.12))
    // 手刹：座管上的卡座 + 一根带球头的扳杆
    g.add(rbox(3.4, 2.6, 4.6, DARK, { x: s * (fx + 1.6), y: 46.6, z: 9 }, 0.5))
    g.add(rod3([s * (fx + 2.4), 48, 9], [s * (fx + 2.8), 59, 5], 0.6, STEEL, 6))
    g.add(ball(1.3, DARK, { x: s * (fx + 2.8), y: 59, z: 5 }, undefined, [10, 6]))
  }
  // 座下的交叉撑（折叠轮椅的 X 架）
  g.add(rod3([-fx, 26, 2], [fx, 47, 2], 0.9, frame, 8))
  g.add(rod3([fx, 26, 4.4], [-fx, 47, 4.4], 0.9, frame, 8))
  g.add(cylZ(1.3, 4.4, STEEL, 0, 36.5, 3.2, 10))
  // 布座 + 坐垫、布靠背（跟着立管往后仰）
  g.add(rbox(fx * 2 - 1.5, 1.6, 42, seat, { y: 47.4, z: -1 }, 0.6))
  g.add(rbox(fx * 2 - 3, 4.5, 40, seat, { y: 48.8, z: -1 }, 2))
  g.add(P(rbox(fx * 2 - 1.5, 34, 1.8, seat, {}, 0.6), 0, 69, -24.9, -0.125))
  return fitGroup(g)
}

// ---------- 助行器：两片倒 U 形铝管侧架用前横撑连起来，前腿带小轮、后腿是橡胶脚垫，顶上两只握把 ----------

const WK = { w: 58, d: 55, h: 88 }
/** 后腿 / 前腿在高度 y 处的 z（腿略微外撇） */
const wkRear = (y: number) => 24 - ((y - 2) * 9) / 84
const wkFront = (y: number) => -22 + ((y - 7) * 7) / 79
function walker(p: string[]) {
  const [frame, grip, accent] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 25
    // 侧架：后腿 → 扶手 → 前腿，一根弯管
    g.add(bentPipe([[x, 2, 24], [x, 86, 15], [x, 86, -15], [x, 7, -22]], 1.3, frame, 5, true))
    g.add(cylZ(1.9, 20, grip, x, 86, 0, 14))
    // 后腿的橡胶脚垫
    g.add(cyl(1.9, 2.2, 4.5, RUBBER, { x, z: 24.2 }, 12))
    // 前轮装在腿外侧
    g.add(cylX(6, 2.6, TIRE, s * 27.4, 6, -22.1, 20))
    g.add(noOutline(cylX(2.4, 2.9, '#d9dde2', s * 27.4, 6, -22.1, 12)))
    g.add(cylX(0.7, 5, STEEL, s * 26.4, 6, -22.1, 8))
    // 侧撑
    g.add(rod3([x, 38, wkRear(38)], [x, 38, wkFront(38)], 1, frame, 8))
    // 调高卡扣
    g.add(cyl(1.75, 1.75, 3.2, accent, { x, y: 20, z: wkRear(21.6) }, 10))
    g.add(cyl(1.75, 1.75, 3.2, accent, { x, y: 22, z: wkFront(23.6) }, 10))
  }
  // 前横撑两根（靠墙的 -z 一侧，人从 +z 走进去）+ 中间的折叠按钮
  for (const y of [42, 66]) g.add(rod3([-25, y, wkFront(y)], [25, y, wkFront(y)], 1.1, frame, 8))
  for (const s of [-1, 1]) g.add(rbox(4.2, 5, 3.6, accent, { x: s * 25, y: 63.5, z: wkFront(66) }, 0.8))
  return fitGroup(g)
}

// ---------- 手杖与拐杖架：浅盘 + 铁线圆筒架，里面斜靠一根弯柄木手杖，立着一根四脚拐杖 ----------

const CS = { r: 11, ring: 45, h: 92 }
function caneStand(p: string[]) {
  const [stand, wood, metal] = p
  const g = new THREE.Group()
  // 架子：浅盘、两道圈、四根立杆
  g.add(cup(CS.r, CS.r - 0.6, 4, 1.2, stand, {}, 24))
  for (const y of [25, CS.ring]) g.add(P(torus(CS.r - 0.6, 0.6, stand, {}, PI * 2, [6, 24]), 0, y, 0, PI / 2))
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2
    g.add(cyl(0.6, 0.6, CS.ring - 2, stand, { x: Math.cos(a) * (CS.r - 0.6), y: 2.5, z: Math.sin(a) * (CS.r - 0.6) }, 8))
  }
  // 弯柄手杖：杖尖在盘里，杖身斜靠在上圈内侧，弯钩朝架子中间
  const out: [number, number] = [-0.83, -0.555]
  const foot: V3 = [-3.6, 1.2, -2.4]
  const top: V3 = [-10.63, 86, -7.1]
  const u = new THREE.Vector3(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]).normalize()
  g.add(rod3([foot[0] + u.x * 1.5, foot[1] + u.y * 1.5, foot[2] + u.z * 1.5], top, 1.1, wood, 10))
  g.add(taperRod3(foot, [foot[0] + u.x * 3.4, foot[1] + u.y * 3.4, foot[2] + u.z * 3.4], 1.5, 1.3, RUBBER, 10))
  const hookR = 4.6
  const hook: V3[] = [[top[0] - u.x * 3, top[1] - u.y * 3, top[2] - u.z * 3]]
  for (let k = 0; k <= 6; k++) {
    const a = PI - (k / 6) * PI
    const c = (1 + Math.cos(a)) * hookR
    hook.push([top[0] - out[0] * c, top[1] + Math.sin(a) * hookR, top[2] - out[1] * c])
  }
  hook.push([top[0] - out[0] * hookR * 2, top[1] - 3.5, top[2] - out[1] * hookR * 2])
  g.add(cappedTube(hook, 1.1, wood, { seg: 16, radial: 8, capSeg: [8, 6] }))
  // 四脚拐杖：四只小脚 + 底座 + 直杆 + 横握把
  const [qx, qz] = [2.8, 1.2]
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rod3([qx + sx * 0.8, 9.4, qz + sz * 0.8], [qx + sx * 3, 3, qz + sz * 3], 0.6, metal, 8))
      g.add(cyl(1, 1.15, 2.4, RUBBER, { x: qx + sx * 3, y: 1.2, z: qz + sz * 3 }, 10))
    }
  g.add(cyl(1.5, 2, 2.6, metal, { x: qx, y: 8.4, z: qz }, 12))
  g.add(cyl(0.95, 0.95, 78, metal, { x: qx, y: 10, z: qz }, 10))
  g.add(cyl(1.3, 1.3, 3, DARK, { x: qx, y: 46, z: qz }, 10))
  g.add(cylZ(1.5, 11, DARK, qx, 89.3, qz + 1.5, 12))
  for (const s of [-1, 1]) g.add(ball(1.5, DARK, { x: qx, y: 89.3, z: qz + 1.5 + s * 5.5 }, undefined, [12, 6]))
  return fitGroup(g)
}

// ---------- 电动护理床：带脚轮和刹车的钢底架、抬起约 30° 的背板和床垫、床头床尾板、两侧护栏、挂在床尾的遥控器 ----------

const BED = { w: 100, d: 210, h: 95, deck: 40, mat: 12, back: 0.52, pivot: -13 }
const MATTRESS = '#e3ebf1'
const BRAKE = '#e8843c'
function careBed(p: string[]) {
  const [board, frame, blanket] = p
  const g = new THREE.Group()
  // 底架：两根纵梁 + 四根横梁
  for (const s of [-1, 1]) g.add(rbox(4, 5, 198, frame, { x: s * 44, y: 32 }, 0.8))
  for (const z of [-97, -40, 30, 97]) g.add(rbox(88, 5, 4, frame, { y: 32, z }, 0.8))
  // 四根立柱 + 带刹车踏板的脚轮
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 42
      const z = sz * 90
      g.add(rbox(5, 21, 5, frame, { x, y: 12, z }, 0.8))
      g.add(caster(x, z, 5.2, 12.4, 3.4))
      g.add(rbox(4, 1.1, 5, BRAKE, { x, y: 10.6, z: z + sz * 4.6 }, 0.4))
    }
  // 平的那一段：床板 + 两截床垫（膝部留一道缝）
  g.add(rbox(88, 3, 113, frame, { y: BED.deck - 3, z: 43.5 }, 0.8))
  g.add(rbox(86, BED.mat, 50, MATTRESS, { y: BED.deck, z: 13 }, 3))
  g.add(rbox(86, BED.mat, 60.4, MATTRESS, { y: BED.deck, z: 68.8 }, 3))
  // 抬起的背板：绕 (y = deck, z = pivot) 的横轴往上翻，床板、床垫、枕头都在这个坐标系里
  const back = new THREE.Group()
  back.add(rbox(88, 3, 84, frame, { y: -3, z: -42 }, 0.8))
  back.add(rbox(86, BED.mat, 84, MATTRESS, { z: -42 }, 3))
  back.add(rbox(52, 7, 28, PAPER, { y: BED.mat - 0.5, z: -62 }, 3.2))
  g.add(P(back, 0, BED.deck, BED.pivot, BED.back))
  // 电动推杆：底架上的电机盒 + 顶着背板的推杆
  g.add(rbox(14, 9, 30, DARK, { y: 23.5, z: -34 }, 1.6))
  g.add(rod3([0, 34, -45.7], [0, 62, -57.7], 1.5, STEEL, 10))
  g.add(rod3([0, 30, -44], [0, 47, -51.3], 2.5, DARK, 12))
  // 床头板 / 床尾板（各开一个提手口），用托架接在底架两端
  const grip = (y: number) => [{ kind: 'rect' as const, x: 0, y, w: 34, h: 6, r: 3 }]
  // 提手口两头的半圆各 12 段（默认每个四分之一圆 32 段，一块板上千个三角面）
  g.add(holePanel(98, 60, 3.5, board, grip(48), { y: 35, z: -102.2 }, 4, { seg: 3 }))
  g.add(holePanel(98, 42, 3.5, board, grip(30), { y: 35, z: 102.2 }, 4, { seg: 3 }))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 8, 3.4, frame, { x: sx * 36, y: 31, z: sz * 99.6 }, 0.6))
  // 两侧护栏：立在纵梁外沿，上下两根横杆 + 三根短立杆
  for (const s of [-1, 1]) {
    const x = s * 46.5
    g.add(cylZ(1.3, 78, STEEL, x, 72, 8, 10))
    g.add(cylZ(1, 78, STEEL, x, 56, 8, 8))
    for (const z of [-31, 47]) {
      g.add(cyl(1.3, 1.3, 37, STEEL, { x, y: 35, z }, 10))
      g.add(ball(1.3, STEEL, { x, y: 72, z }, undefined, [10, 6]))
    }
    for (const z of [-11.5, 8, 27.5]) g.add(cyl(0.8, 0.8, 16, STEEL, { x, y: 56, z }, 8))
  }
  // 叠在床尾的毯子
  g.add(rbox(84, 3.6, 44, blanket, { y: BED.deck + BED.mat - 0.4, z: 66 }, 1.6))
  g.add(rbox(84, 2.6, 22, shade(blanket, 0.07), { y: BED.deck + BED.mat + 2.8, z: 77 }, 1.2))
  // 床尾的遥控器：挂钩搭在床尾板上沿，机身贴在外侧，一根线垂到床底
  g.add(rbox(4, 1, 5.6, DARK, { x: 30, y: 77, z: 102.9 }, 0.4))
  g.add(rbox(5.5, 14, 1.8, DARK, { x: 30, y: 64, z: 104.75 }, 0.8))
  for (let k = 0; k < 6; k++) {
    const c = k < 2 ? '#8fd8ff' : '#e9eaec'
    const b = noOutline(box(1.5, 1.5, 0.5, c, { x: 28.9 + (k % 2) * 2.2, y: 73.2 - Math.floor(k / 2) * 2.6, z: 105.7 }))
    g.add(k < 2 ? lit(b, c, 0.5) : b)
  }
  // 线贴着床尾板外侧垂下去，不比遥控器的按键更靠外（整张床的进深不超过声明的 210）
  g.add(noOutline(cappedTube([[30, 64.5, 104.8], [30.4, 54, 105.1], [30, 44, 104.6], [30, 37, 101.5], [30, 34.5, 98.5]], 0.4, DARK, { seg: 12, radial: 5, capSeg: [6, 4] })))
  return fitGroup(g)
}

// ---------- 床边移动桌：贴地的 C 形底座带四只脚轮，一侧的升降立柱挑起一块桌板（底下有调角度的旋钮，前沿一道挡条） ----------

const OT = { w: 80, d: 40, h: 78, top: 77 }
function overbedTable(p: string[]) {
  const [top, frame, accent] = p
  const g = new THREE.Group()
  // C 形底座：两条长脚 + 立柱一侧的横梁，开口朝 +x（好伸进床底）
  for (const s of [-1, 1]) g.add(rbox(76, 4, 5, frame, { y: 6, z: s * 17.5 }, 1.2))
  g.add(rbox(6, 4, 38, frame, { x: -35, y: 6 }, 1.2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(P(caster(0, 0, 3, 6.2, 2.2), sx * 34.5, 0, sz * 17.5, 0, PI / 2))
  // 立柱：粗的外管 + 细的升降内管，外管上一只调高旋钮
  g.add(rbox(7, 40, 6, frame, { x: -35, y: 10 }, 1.2))
  g.add(rbox(4.6, 26, 3.8, STEEL, { x: -35, y: 48 }, 0.8))
  g.add(cylZ(1.9, 2.4, accent, -35, 44, 4, 14))
  // 托臂 + 调角度的旋钮
  g.add(rbox(32, 2.6, 10, frame, { x: -23, y: OT.top - 5 }, 0.8))
  g.add(cylZ(2.2, 2.4, accent, -14, OT.top - 3.7, 6, 14))
  // 桌板 + 前沿的挡条
  g.add(rbox(OT.w, 2.4, OT.d, top, { y: OT.top - 2.4 }, 1))
  g.add(rbox(62, 1.3, 1.4, shade(top, -0.12), { y: OT.top - 0.3, z: OT.d / 2 - 1 }, 0.5))
  return g
}

// ---------- 血压计：前低后高的主机（斜面上是屏幕和按钮）+ 一卷臂带 + 连着两者的软管 ----------

const LCD = '#cfe6dc'
function bpMonitor(p: string[]) {
  const [body, cuff, accent] = p
  const g = new THREE.Group()
  const ux = 4.6
  g.add(sideSlab([[-6.5, 0], [6.5, 0], [6.5, 3.2], [-2.5, 8.2], [-6.5, 8.2]], 12, body, ux))
  // 斜面上：屏幕（深色边框 + 液晶 + 两行数字）和两颗按钮
  const face = tiltFrame([6.5, 3.2], [-2.5, 8.2])
  face.g.position.x = ux
  face.g.add(rbox(9.6, 6.4, 0.5, DARK, { y: 3.2, z: 0.05 }, 0.4))
  face.g.add(lit(rbox(8.2, 5, 0.3, LCD, { y: 3.9, z: 0.35 }, 0.2), LCD, 0.35))
  // 液晶上：上行三位大字（高压）、下行两位小字（低压），左下一颗心跳标
  const SEG = '#2b3a36'
  for (let k = 0; k < 3; k++) face.g.add(noOutline(box(1, 2, 0.2, SEG, { x: 0.2 + k * 1.4, y: 6.3, z: 0.55 })))
  for (let k = 0; k < 2; k++) face.g.add(noOutline(box(0.8, 1.4, 0.2, SEG, { x: 1.6 + k * 1.2, y: 4.4, z: 0.55 })))
  face.g.add(noOutline(box(0.9, 0.8, 0.2, SIGN_RED, { x: -2.6, y: 4.6, z: 0.55 })))
  face.g.add(P(cyl(1.2, 1.2, 0.7, accent, {}, 14), 2.6, 1.6, 0.2, PI / 2))
  face.g.add(P(cyl(0.8, 0.8, 0.7, '#9aa0a8', {}, 12), -2.6, 1.6, 0.2, PI / 2))
  g.add(face.g)
  // 臂带：卷成一卷横放，松开的一头搭在桌上，上面一块魔术贴
  const cx = -6.4
  g.add(cylZ(4, 11.5, cuff, cx, 4, 0, 20))
  g.add(noOutline(cylZ(2.4, 11.9, shade(cuff, -0.14), cx, 4, 0, 16)))
  g.add(rbox(4.2, 0.7, 11.5, cuff, { x: cx - 2.8, z: 0 }, 0.3))
  g.add(noOutline(box(2, 0.5, 9, '#8a8d93', { x: cx - 3.7, y: 0.5 })))
  // 软管：从臂带顶上绕到主机左侧的接口
  g.add(ball(0.8, DARK, { x: -5, y: 7.75, z: 3.2 }))
  g.add(cappedTube([[-5, 7.7, 3.2], [-2.8, 7.7, 5], [-2, 4.6, 5.6], [-1.8, 2.3, 4.6], [-0.6, 2.2, 3.4]], 0.45, '#4b4e55', { seg: 14, radial: 5, capSeg: [6, 4] }))
  return fitGroup(g)
}

// ---------- 急救箱：白色提箱半开着，盖面一个十字标，箱里露出绷带卷、药瓶、创可贴盒和药膏 ----------

const FA = { w: 30, d: 19, base: 9, lid: 3, t: 0.8, open: 0.7 }
function firstAid(p: string[]) {
  const [shellC, mark, item] = p
  const g = new THREE.Group()
  const { w, d, t } = FA
  // 箱底：空心盒
  g.add(tray(w, FA.base, d, t, shellC, {}, 0.4))
  // 箱盖：绕后上沿的合页掀开约 40°，也是空心的
  const lid = new THREE.Group()
  lid.add(rbox(w, t, d, shellC, { y: FA.lid - t, z: d / 2 }, 0.4))
  lid.add(rbox(w, FA.lid, t, shellC, { z: d - t / 2 }, 0.3))
  lid.add(rbox(w, FA.lid, t, shellC, { z: t / 2 }, 0.3))
  for (const s of [-1, 1]) lid.add(rbox(t, FA.lid, d, shellC, { x: (s * (w - t)) / 2, z: d / 2 }, 0.3))
  lid.add(noOutline(box(9.5, 0.6, 3, mark, { y: FA.lid - 0.25, z: d / 2 })))
  lid.add(noOutline(box(3, 0.6, 9.5, mark, { y: FA.lid - 0.25, z: d / 2 })))
  g.add(P(lid, 0, FA.base, -d / 2, -FA.open))
  for (const s of [-1, 1]) g.add(cylX(0.6, 3.4, STEEL, s * 9, FA.base, -d / 2 - 0.2, 8))
  // 前面的两只搭扣和提手
  for (const s of [-1, 1]) g.add(rbox(3, 2.8, 0.7, STEEL, { x: s * 10.5, y: FA.base - 3.4, z: d / 2 + 0.2 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(1.2, 1.4, 2, DARK, { x: s * 4.5, y: 3.8, z: d / 2 + 0.8 }, 0.4))
  g.add(rbox(10.2, 1.4, 1.2, DARK, { y: 3.8, z: d / 2 + 1.5 }, 0.5))
  // 箱里的东西：两卷绷带、药瓶、创可贴盒、药膏
  g.add(cyl(2.4, 2.4, 5, PAPER, { x: -9.5, y: t, z: -3.2 }, 16))
  g.add(noOutline(cyl(0.9, 0.9, 0.5, '#d9cfc0', { x: -9.5, y: t + 4.8, z: -3.2 }, 10)))
  g.add(cylX(2.4, 5, PAPER, -9, t + 2.4, 4.2, 16))
  g.add(noOutline(cylX(0.9, 5.6, '#d9cfc0', -9, t + 2.4, 4.2, 10)))
  g.add(cyl(2.2, 2.2, 6.5, '#d98a3d', { x: -2, y: t, z: -3.4 }, 16))
  g.add(noOutline(cyl(2.28, 2.28, 3, PAPER, { x: -2, y: t + 1.6, z: -3.4 }, 16)))
  g.add(cyl(2.35, 2.35, 1.8, PAPER, { x: -2, y: t + 6.5, z: -3.4 }, 16))
  g.add(rbox(8, 3, 5.6, item, { x: 7.4, y: t, z: 3.6 }, 0.4))
  g.add(noOutline(rbox(8.2, 1, 5.8, PAPER, { x: 7.4, y: t + 1, z: 3.6 }, 0.2)))
  g.add(rbox(7, 1.6, 2.4, '#f2f4f6', { x: 7, y: t, z: -4.4 }, 0.7))
  g.add(cylX(0.8, 1.4, item, 11.1, t + 0.8, -4.4, 10))
  return fitGroup(g)
}

// ---------- 壁挂药箱柜：小壁柜，上面一扇带十字标的门，下面一格开放的小搁格放着常备药 ----------

const MED = { w: 36, d: 14, h: 46, mount: 130, niche: 11, body: 11.4 }
function medCabinet(p: string[]) {
  const [body, door, mark] = p
  const g = new THREE.Group()
  const zf = MED.body / 2
  g.add(carcass(MED.w, MED.h, MED.body, body, { t: 1.2 }))
  // 隔板：下面一格开放
  g.add(rbox(MED.w - 2, 1.2, MED.body - 1.8, body, { y: MED.niche - 1.2, z: 0.5 }, 0.3))
  // 门（盖住隔板以上）、十字标、拉钮、两只合页
  const y0 = MED.niche - 1
  const dh = MED.h - 0.3 - y0
  g.add(rbox(MED.w - 0.6, dh, 1.4, door, { y: y0, z: zf + 0.7 }, 0.5))
  g.add(crossMark(10, mark, 0, y0 + dh / 2, zf + 1.5))
  g.add(cylZ(0.9, 1.2, STEEL, 14.4, y0 + 6, zf + 2, 12))
  // 合页的轴露在门的左前棱上（不超出柜体的宽度）
  for (const y of [y0 + 3, y0 + dh - 7]) g.add(cyl(0.6, 0.6, 4, STEEL, { x: -MED.w / 2 + 0.7, y, z: zf + 1.1 }, 8))
  // 搁格里的常备药：药瓶、药盒、一卷纱布
  g.add(cyl(1.7, 1.7, 5, '#b9783a', { x: -10, y: 1.2, z: 1 }, 14))
  g.add(cyl(1.8, 1.8, 1.4, PAPER, { x: -10, y: 6.2, z: 1 }, 14))
  g.add(rbox(7.5, 4.6, 4, PAPER, { x: 0.5, y: 1.2, z: 1 }, 0.4))
  g.add(noOutline(rbox(7.7, 1.2, 4.2, mark, { x: 0.5, y: 2.8, z: 1 }, 0.2)))
  g.add(cylZ(2.1, 4.4, PAPER, 10, 3.3, 1, 14))
  return fitWall(g, MED.mount, MED.d)
}

// ---------- 灭火器：红色钢瓶立在小底座里，瓶头有压把、压力表和保险销，一根黑色喷管顺着瓶身垂下来 ----------

const EX = { w: 18, d: 18, h: 52, r: 7, y0: 2.2 }
function extinguisher(p: string[]) {
  const [body, stand, label] = p
  const g = new THREE.Group()
  const { r, y0 } = EX
  // 底座：方盘 + 一圈卡住瓶底的套环
  g.add(rbox(17, 1.4, 17, stand, {}, 1.5))
  g.add(cup(r + 1.3, r + 1.3, 5.4, 0.9, stand, { y: 1.3 }, 24))
  // 瓶身：圆柱 + 圆肩收到瓶颈
  g.add(
    latheAt(
      [
        [0, 0],
        [r - 0.5, 0],
        [r, 0.6],
        [r, 29],
        [r - 0.5, 32.4],
        [r - 2, 35.4],
        [3.6, 37.8],
        [2.4, 38.8],
        [2.4, 41],
        [0, 41],
      ],
      body,
      { y: y0 },
      24,
      0.01,
    ),
  )
  // 标签：正面一片贴纸（略微浮出瓶身的一段弧面）+ 两道字样色条
  g.add(noOutline(P(lathe([[r, 0], [r + 0.15, 0.2], [r + 0.15, 11.8], [r, 12]], label, 12, [-0.95, 1.9]), 0, y0 + 14, 0)))
  g.add(noOutline(P(lathe([[r + 0.1, 0], [r + 0.3, 0.1], [r + 0.3, 2.3], [r + 0.1, 2.4]], DARK, 10, [-0.7, 1.4]), 0, y0 + 22, 0)))
  g.add(noOutline(P(lathe([[r + 0.1, 0], [r + 0.3, 0.1], [r + 0.3, 1], [r + 0.1, 1.1]], SIGN_RED, 10, [-0.7, 1.4]), 0, y0 + 17, 0)))
  // 瓶头：阀体、下把手、上压把（往 -x 伸）、压力表（朝正面）、保险销拉环
  const vy = y0 + 41
  g.add(cyl(2.7, 2.7, 3.6, STEEL, { y: vy - 0.2 }, 14))
  g.add(batten([0, vy + 1.2, 0], [-8.4, vy + 1.5, 0], 0.9, 2.4, DARK, 0.3))
  g.add(batten([1.5, vy + 3.3, 0], [-8.2, vy + 7, 0], 0.9, 2.4, body, 0.3))
  g.add(cylZ(1.9, 1, STEEL, 0, vy + 1.6, 2.9, 16))
  g.add(noOutline(cylZ(1.5, 0.4, '#f6f7f8', 0, vy + 1.6, 3.4, 16)))
  g.add(noOutline(lit(box(1.2, 0.5, 0.2, '#4fbf6a', { x: 0, y: vy + 2, z: 3.6 }), '#4fbf6a', 0.4)))
  g.add(P(torus(1.2, 0.25, '#f2c230', {}, PI * 2, [6, 12]), 0, vy + 4.4, -3.2, 0, PI / 2))
  g.add(rod3([0, vy + 3.6, -3.2], [0, vy + 3.2, 0], 0.3, '#f2c230', 6))
  // 喷管：从阀体侧面出来，顺着瓶身垂下去，末端一只喇叭口；瓶身上一道卡箍
  const hx = r + 0.85
  g.add(bentPipe([[2, vy + 1.4, 0], [hx, vy + 1.4, 0], [hx, y0 + 20, 0]], 0.8, DARK, 3.2))
  g.add(taperRod3([hx, y0 + 20.5, 0], [hx, y0 + 13, 0], 0.9, 1.5, DARK, 12))
  // 卡箍和瓶身一样 24 段
  g.add(noOutline(P(torus(r + 0.2, 0.4, DARK, {}, PI * 2, [6, 24]), 0, y0 + 24, 0, PI / 2)))
  // 喷管挂在右侧：整体居中，左右都不超出占地
  return fitGroup(g)
}

// ---------- 家用保险箱：厚重的钢箱，门上一只密码转盘和三叉轮式把手，左边两只合页，底下四只小脚 ----------

const SF = { w: 40, d: 38, h: 50, bz: -2.5, bd: 33 }
function safeBox(p: string[]) {
  const [body, door, accent] = p
  const g = new THREE.Group()
  const zf = SF.bz + SF.bd / 2
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.4, 2.7, 2.6, RUBBER, { x: sx * 15.5, z: SF.bz + sz * 12 }, 12))
  g.add(rbox(SF.w, SF.h - 2.5, SF.bd, body, { y: 2.5, z: SF.bz }, 1.6))
  // 门缝（深一号的衬框）+ 门板
  g.add(rbox(35.8, 43.2, 0.6, shade(body, -0.1), { y: 4.6, z: zf + 0.1 }, 1))
  g.add(rbox(34, 41.4, 1.6, door, { y: 5.5, z: zf + 0.7 }, 0.8))
  const zd = zf + 1.5
  for (const y of [10, 36]) g.add(cyl(1.1, 1.1, 6, STEEL, { x: -17.6, y, z: zf + 1 }, 10))
  // 密码转盘：底圈 + 刻度盘（一圈白刻线）+ 旋钮，上方一个对位标
  const [dx, dy] = [-6.5, 31]
  g.add(cylZ(4.4, 1.2, STEEL, dx, dy, zd + 0.5, 24))
  g.add(cylZ(3.5, 1, DARK, dx, dy, zd + 1.5, 24))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2
    g.add(noOutline(P(box(0.3, 0.9, 0.2, '#f4f4f2'), dx + Math.cos(a) * 2.8, dy + Math.sin(a) * 2.8, zd + 2.05, 0, 0, a - PI / 2)))
  }
  g.add(cylZ(1.5, 1.6, STEEL, dx, dy, zd + 2.7, 14))
  g.add(noOutline(rbox(1.1, 1.1, 0.5, accent, { x: dx, y: dy + 5, z: zd + 0.1 }, 0.2)))
  // 三叉轮式把手
  const [hx, hy] = [8, 25]
  g.add(cylZ(1.8, 3, STEEL, hx, hy, zd + 1.4, 14))
  for (let k = 0; k < 3; k++) {
    const a = PI / 2 + (k * PI * 2) / 3
    const tip: V3 = [hx + Math.cos(a) * 6, hy + Math.sin(a) * 6, zd + 2]
    g.add(rod3([hx, hy, zd + 2], tip, 0.7, STEEL, 8))
    g.add(ball(1.2, accent, { x: tip[0], y: tip[1], z: tip[2] }, undefined, [10, 6]))
  }
  // 铭牌
  g.add(noOutline(rbox(9, 2.6, 0.5, accent, { y: 9, z: zd + 0.1 }, 0.2)))
  return g
}

// ---------- 人字梯：撑开的铝合金人字梯，前面四级踏板，顶上一块平台，两侧各一根拉撑，四只防滑脚套 ----------

const SL = { w: 50, d: 95, h: 150, top: 147, rear: 144 }
/** 前梯框 / 后撑腿在高度 y 处的 [x, z]（往上收窄、往中间靠） */
const slFront = (y: number): [number, number] => [22.5 - (6 * y) / SL.top, 43.5 - (41 * y) / SL.top]
const slRear = (y: number): [number, number] => [22.5 - (6 * y) / SL.rear, -43.5 + (39.5 * y) / SL.rear]
function stepLadder(p: string[]) {
  const [alu, cap, tread] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    // 前梯框、后撑腿
    g.add(strutBox([s * 22.5, 1, 43.5], [s * 16.5, SL.top, 2.5], 2.4, 6.5, alu, 0.5))
    g.add(strutBox([s * 22.5, 1, -43.5], [s * 16.5, SL.rear, -4], 2.4, 4, alu, 0.5))
    // 防滑脚套
    g.add(rbox(4.2, 4.6, 9, cap, { x: s * 22.5, z: 43.2 }, 1))
    g.add(rbox(4.2, 4.6, 6.6, cap, { x: s * 22.5, z: -43.3 }, 1))
    // 拉撑：贴在梯框内侧的一根扁条，两端和中间各一颗销钉
    const [fxw, fz] = slFront(72)
    const [, rz] = slRear(72)
    const x = s * (fxw - 1.7)
    g.add(batten([x, 72, fz - 1], [x, 72, rz + 0.5], 0.6, 2.2, alu, 0.2))
    for (const z of [fz - 2.5, 0, rz + 1.5]) g.add(noOutline(cylX(0.7, 1.4, STEEL, x, 72, z, 8)))
  }
  // 四级踏板（带一条防滑纹）
  for (let i = 1; i <= 4; i++) {
    const y = i * 29.2
    const [x, z] = slFront(y)
    g.add(rbox(x * 2 + 1, 2.6, 9.5, alu, { y: y - 2.6, z: z - 0.5 }, 0.5))
    g.add(noOutline(box(x * 2 - 4, 0.5, 6, tread, { y: y - 0.2, z: z - 0.5 })))
  }
  // 后撑腿之间的两根横档
  for (const y of [40, 98]) {
    const [x, z] = slRear(y)
    g.add(rbox(x * 2, 3, 1.4, alu, { y: y - 1.5, z }, 0.4))
  }
  // 顶部平台（塑料顶盖，上面一块浅槽）
  g.add(rbox(38, 4.6, 17, cap, { y: SL.h - 4.8, z: -1 }, 1.6))
  g.add(noOutline(box(27, 0.5, 9, shade(cap, -0.12), { y: SL.h - 0.5, z: -1 })))
  return fitGroup(g)
}

// ---------- 手电筒与应急灯：一支平放的金属手电筒（灯头略粗），旁边一盏带提梁的小露营灯 ----------

const GLOW = '#fff1c0'
function flashlight(p: string[]) {
  const [torch, lamp, accent] = p
  const g = new THREE.Group()
  // 手电筒：沿 x 平放，灯头朝 -x；灯头比尾盖粗，整支略微前高后低地搁在桌上
  const f = new THREE.Group()
  f.add(hcyl(1.9, 2.7, 4, torch, -5.5, 0, 0, 'x', 20))
  f.add(cylX(2.8, 0.9, accent, -7.6, 0, 0, 20))
  f.add(lit(cylX(2.3, 0.3, GLOW, -8.1, 0, 0, 20), GLOW, 0.7))
  f.add(cylX(1.9, 10.6, torch, 1.8, 0, 0, 16))
  for (const x of [1.5, 3, 4.5]) f.add(noOutline(cylX(2, 0.6, shade(torch, -0.1), x, 0, 0, 16)))
  f.add(rbox(1.8, 0.7, 1.2, accent, { x: -1.6, y: 1.55 }, 0.3))
  f.add(cylX(2.1, 1.3, shade(torch, -0.12), 7.7, 0, 0, 16))
  g.add(P(f, -3.2, 2.5, 3.6, 0, 0, -0.038))
  // 应急灯：底座 + 发光的灯筒（外面四根护条）+ 顶盖 + 提梁
  const [lx, lz] = [7.2, -2.6]
  g.add(cyl(3.6, 4, 3.2, lamp, { x: lx, z: lz }, 20))
  g.add(cylZ(0.8, 0.8, accent, lx, 1.6, lz + 3.8, 10))
  g.add(lit(cyl(2.9, 2.9, 6.2, GLOW, { x: lx, y: 3.1, z: lz }, 16), GLOW, 0.7))
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2
    g.add(noOutline(cyl(0.28, 0.28, 6.2, lamp, { x: lx + Math.cos(a) * 3.25, y: 3.1, z: lz + Math.sin(a) * 3.25 }, 6)))
  }
  g.add(cyl(2.6, 3.7, 2, lamp, { x: lx, y: 9.2, z: lz }, 20))
  g.add(cyl(1, 1.2, 0.9, shade(lamp, -0.12), { x: lx, y: 11.2, z: lz }, 12))
  for (const s of [-1, 1]) g.add(ball(0.6, STEEL, { x: lx + s * 3.6, y: 10, z: lz }))
  g.add(noOutline(P(torus(3.75, 0.28, STEEL, {}, PI, [6, 10]), lx, 10, lz)))
  return fitGroup(g)
}

// ---------- 防灾背包：银色反光背包（翻盖、前袋、两道反光条、十字牌），左前方地上放着一顶防灾头盔，右前方立着一瓶水 ----------

const WATER = '#bfe3f5'
function emergencyBag(p: string[]) {
  const [bag, trim, tape, hat] = p
  const g = new THREE.Group()
  // 背包主体（背面在 -z）+ 翻盖 + 前袋 + 两只侧袋
  g.add(rbox(30, 40, 14, bag, { z: -7 }, 5))
  g.add(rbox(30.6, 9.5, 14.8, shade(bag, 0.05), { y: 32.5, z: -7 }, 4))
  g.add(rbox(23, 16, 3.4, shade(bag, -0.06), { y: 3, z: -0.2 }, 1.5))
  for (const s of [-1, 1]) g.add(rbox(3.4, 13, 9, shade(bag, -0.1), { x: s * 15.3, y: 2, z: -7 }, 1.4))
  // 反光条：包身一道、前袋一道
  g.add(noOutline(box(20, 2.2, 0.6, tape, { y: 27, z: 0.05 })))
  g.add(noOutline(box(21, 2, 0.6, tape, { y: 15, z: 1.55 })))
  // 两条插扣带：从翻盖扣到前袋上沿
  for (const s of [-1, 1]) {
    g.add(noOutline(box(2.4, 14.5, 0.6, trim, { x: s * 6.5, y: 18.5, z: 0.15 })))
    g.add(rbox(3.2, 2.6, 1.2, DARK, { x: s * 6.5, y: 21, z: 0.5 }, 0.4))
  }
  // 前袋上的十字牌
  g.add(noOutline(rbox(6.4, 6.4, 0.5, SIGN_RED, { y: 6, z: 1.55 }, 0.6)))
  g.add(crossMark(4.2, '#ffffff', 0, 9.2, 1.75))
  // 提手 + 背面两条肩带
  g.add(P(torus(3.2, 0.6, trim, {}, PI), 0, 41.4, -9))
  for (const s of [-1, 1]) g.add(batten([s * 7.5, 38, -14.4], [s * 9.5, 4, -14.4], 4, 0.9, trim, 0.3))
  // 安全头盔：圆顶 + 帽檐（前面多伸出一截）+ 顶上一道筋，斜靠在包前
  const h = new THREE.Group()
  h.add(
    latheAt(
      [
        [9.6, 0],
        [9.5, 2.5],
        [8.8, 5.2],
        [7.2, 7.6],
        [4.6, 9.3],
        [2, 10],
        [0, 10.2],
      ],
      hat,
      {},
      20,
      0.01,
    ),
  )
  h.add(cyl(10.6, 10.6, 0.9, hat, { y: -0.1 }, 20))
  h.add(rbox(12, 0.9, 5, hat, { y: -0.1, z: 10.2 }, 0.4))
  h.add(noOutline(cyl(9.2, 9.2, 0.5, shade(hat, -0.25), { y: -0.3 }, 20)))
  h.add(P(torus(9.3, 0.8, hat, {}, PI, [6, 12]), 0, 0.6, 0, 0, PI / 2))
  // 防灾头盔比工地安全帽略小一号；正着放在包的左前方地上，帽檐朝前偏左
  h.scale.set(0.9, 0.9, 1.0)
  g.add(P(h, -15, 0.3, 9, 0, 0.3))
  // 一瓶水：半透明瓶身 + 标签 + 瓶盖
  const [bx, bz] = [12.6, 7.5]
  // 瓶身和瓶肩烘成一个网格：半透明件不参与按材质合并，分开就是两次绘制
  g.add(ghost(bakeMeshes([cyl(3.2, 3.2, 15, WATER, { x: bx, z: bz }, 16), cyl(1.4, 3.2, 3, WATER, { x: bx, y: 15, z: bz }, 16)], WATER), WATER, 0.55))
  g.add(noOutline(cyl(3.28, 3.28, 5, '#3f7fd8', { x: bx, y: 6.5, z: bz }, 16)))
  g.add(cyl(1.5, 1.5, 1.7, '#f4f4f2', { x: bx, y: 17.9, z: bz }, 12))
  return fitGroup(g)
}

// ---------- 配电箱：米白色箱体，凹进去的面板上一只主开关和一排小断路器，外面罩着一片半透明翻盖 ----------

const BK = { w: 36, d: 10, h: 26, mount: 160 }
const COVER = '#cfe0ea'
function breakerPanel(p: string[]) {
  const [body, sw, accent] = p
  const g = new THREE.Group()
  // 箱体（背面在 z = 0）+ 一圈凸出的面框
  g.add(rbox(BK.w, BK.h, 6.2, body, { z: 3.1 }, 1.2))
  for (const y of [1.8, 23]) g.add(rbox(34, 1.2, 3.4, body, { y, z: 7.7 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(1.2, 22.4, 3.4, body, { x: s * 16.4, y: 1.8, z: 7.7 }, 0.4))
  // 面框里的安装板、标签条、漏电指示灯
  g.add(noOutline(box(31.6, 20, 0.6, shade(body, -0.08), { y: 3, z: 6.3 })))
  g.add(noOutline(box(21, 1.6, 0.3, '#ffffff', { x: 4, y: 19, z: 6.7 })))
  g.add(lit(rbox(1.4, 1.4, 0.5, '#59d98a', { x: -11.5, y: 19.1, z: 6.8 }, 0.3), '#59d98a', 0.6))
  // 主开关（左边，两位宽）+ 一排小断路器（有一路拉闸了）
  g.add(rbox(5.2, 9.5, 1.6, sw, { x: -11.5, y: 7, z: 7.3 }, 0.3))
  g.add(rbox(2.8, 3, 1.2, accent, { x: -11.5, y: 11.6, z: 8.6 }, 0.3))
  for (let i = 0; i < 8; i++) {
    const x = -5.6 + i * 2.75
    g.add(rbox(2.4, 8.5, 1.6, sw, { x, y: 7.5, z: 7.3 }, 0.3))
    g.add(noOutline(box(1.1, 2.2, 1.1, DARK, { x, y: i === 5 ? 8.6 : 11.6, z: 8.55 })))
  }
  // 半透明翻盖：搭在面框上，顶边两只合页，底边一个扣手
  g.add(ghost(rbox(33, 21.4, 0.6, COVER, { y: 2.3, z: 9.6 }, 0.5), COVER, 0.32))
  for (const s of [-1, 1]) g.add(cylX(0.6, 5, shade(body, -0.12), s * 9, 24.1, 9.3, 8))
  g.add(rbox(5, 1.1, 0.8, shade(body, -0.12), { y: 1.9, z: 9.55 }, 0.3))
  return fitWall(g, BK.mount, BK.d)
}

// ---------- 壁挂燃气热水器：白色机身，正面一块控制面板（显示屏 + 两只旋钮）和观火窗，顶上排烟口，底下三根带阀门的管子拐进墙里 ----------

const WH = { w: 36, d: 16, h: 62, mount: 130, y0: 9 }
function waterHeater(p: string[]) {
  const [body, trim, accent] = p
  const g = new THREE.Group()
  const y0 = WH.y0
  g.add(rbox(WH.w, 49, 14, body, { y: y0 }, 2))
  // 控制面板：一块嵌板，上面是显示屏和两只旋钮
  g.add(noOutline(rbox(31, 12, 0.6, trim, { y: y0 + 4, z: 7.1 }, 0.8)))
  g.add(rbox(9.4, 4.8, 0.5, DARK, { y: y0 + 7.6, z: 7.5 }, 0.5))
  g.add(lit(rbox(5.4, 2.4, 0.3, '#7fe8d0', { y: y0 + 8.8, z: 7.8 }, 0.2), '#7fe8d0', 0.7))
  for (const s of [-1, 1]) {
    g.add(cylZ(2, 1.4, STEEL, s * 10, y0 + 10, 8.1, 16))
    g.add(noOutline(box(0.5, 1.5, 0.3, accent, { x: s * 10, y: y0 + 10.2, z: 8.85 })))
  }
  // 腰线、观火窗、上部的散热缝
  g.add(noOutline(box(30, 0.8, 0.4, accent, { y: y0 + 20, z: 7.05 })))
  g.add(rbox(6, 2.8, 0.5, DARK, { y: y0 + 25, z: 7.1 }, 0.6))
  g.add(lit(rbox(3.6, 1.2, 0.3, '#ff9a3d', { y: y0 + 25.6, z: 7.35 }, 0.2), '#ff9a3d', 0.8))
  for (let k = 0; k < 4; k++) g.add(noOutline(box(16, 0.7, 0.4, shade(body, -0.2), { y: y0 + 38 + k * 1.9, z: 7 })))
  // 顶上的排烟口
  g.add(cyl(4.6, 4.6, 1, STEEL, { y: y0 + 48.6, z: -1 }, 20))
  g.add(cyl(4.1, 4.1, 4.2, STEEL, { y: y0 + 48.8, z: -1 }, 20))
  g.add(noOutline(cyl(3.3, 3.3, 0.3, DARK, { y: y0 + 52.85, z: -1 }, 16)))
  // 底下三根管子（冷水、燃气、热水）：接头 + 阀门 + 往后拐进墙里
  for (const [x, c] of [
    [-10, '#3f7fd8'],
    [0, '#f2c230'],
    [10, '#d8483f'],
  ] as [number, string][]) {
    g.add(cyl(1.7, 1.7, 1.6, BRASS, { x, y: y0 - 1.4, z: 1 }, 10))
    g.add(bentPipe([[x, y0 + 0.5, 1], [x, 1.4, 1], [x, 1.4, -7]], 1.1, STEEL, 2.6))
    g.add(cyl(1.6, 1.6, 2, BRASS, { x, y: 4.4, z: 1 }, 10))
    g.add(nub(1, 1, 3.6, c, { x, y: 4.9, z: 3.4 }))
  }
  return fitWall(g, WH.mount, WH.d)
}

// ---------- 暖气片：一排竖向的片状散热柱，上下各一根联管，左下一只温控阀、右下一只回水阀，管子拐进墙里 ----------

const RD = { w: 100, d: 10, h: 60, mount: 12, n: 13, pitch: 7.2 }
function radiator(p: string[]) {
  const [body, valve, pipe] = p
  const g = new THREE.Group()
  const span = (RD.n - 1) * RD.pitch
  const edge = span / 2 + 2.9
  for (let i = 0; i < RD.n; i++) g.add(rbox(5.8, RD.h, 8, body, { x: -span / 2 + i * RD.pitch, z: 0.4 }, 2.4))
  // 上下联管（从片与片的缝里看得到）
  for (const y of [5, RD.h - 5]) g.add(noOutline(cylX(2.4, span, shade(body, -0.05), 0, y, 0.4, 12)))
  // 墙上的两条托架
  for (const s of [-1, 1]) g.add(rbox(3, 50, 1.8, pipe, { x: s * RD.pitch * 4, y: 5, z: -4.1 }, 0.3))
  for (const s of [-1, 1]) {
    const x = s * (edge + 1.8)
    // 阀体 + 往下往后拐进墙里的管子
    g.add(cylX(1.5, 3.6, pipe, s * (edge + 1.4), 5, 0.4, 12))
    g.add(bentPipe([[x, 5, 0.4], [x, 1.3, 0.4], [x, 1.3, -5]], 1.1, pipe, 2))
    // 左：温控阀头（带一圈刻度环）；右：回水阀的小帽
    if (s < 0) {
      g.add(cyl(2.1, 2.1, 5, valve, { x, y: 6, z: 0.4 }, 16))
      g.add(noOutline(cyl(2.2, 2.2, 0.8, shade(valve, -0.18), { x, y: 7, z: 0.4 }, 16)))
    } else g.add(cyl(1.5, 1.8, 2.4, valve, { x, y: 6, z: 0.4 }, 12))
  }
  // 右上角的放气阀
  g.add(cylX(1.1, 2.2, pipe, edge + 0.8, RD.h - 5, 0.4, 10))
  return fitWall(g, RD.mount, RD.d)
}

// ---------- 无障碍扶手：L 形不锈钢管，离墙一拳宽，两端和拐角各一只法兰盘，横段、竖段各套一截防滑握套 ----------

const GB = { w: 60, d: 9, h: 60, mount: 70, z: 6.4, r: 1.6 }
function grabBar(p: string[]) {
  const [bar, flange, grip] = p
  const g = new THREE.Group()
  const { z, r } = GB
  // 一根弯管：左端从墙里出来 → 横段 → 拐角 → 竖段 → 回到墙里；拐角再加一根支撑短管
  // 两头的管口埋在法兰盘里（不和法兰盘贴墙的那一面齐平）
  g.add(bentPipe([[-26, 4, 0.5], [-26, 4, z], [26, 4, z], [26, 56, z], [26, 56, 0.5]], r, bar, 3.2))
  g.add(cylZ(r, z - 0.5, bar, 26, 4, z / 2 + 0.25, 12))
  // 三只法兰盘（各三颗螺丝）
  for (const [x, y] of [
    [-26, 4],
    [26, 4],
    [26, 56],
  ]) {
    g.add(cylZ(4, 0.9, flange, x, y, 0.45, 24))
    g.add(cylZ(2.3, 1.6, flange, x, y, 0.8, 16))
    for (let k = 0; k < 3; k++) {
      const a = PI / 2 + (k * PI * 2) / 3
      g.add(noOutline(cylZ(0.45, 0.3, shade(flange, -0.3), x + Math.cos(a) * 3, y + Math.sin(a) * 3, 0.95, 6)))
    }
  }
  // 防滑握套
  g.add(cylX(r + 0.35, 24, grip, -2, 4, z, 16))
  g.add(cyl(r + 0.35, r + 0.35, 24, grip, { x: 26, y: 20, z }, 16))
  return fitWall(g, GB.mount, GB.d)
}

// ---------- 配色 ----------

const WC_PALS: Pal[] = [
  ['modern', [M.silver, '#2f3b52', M.black]],
  ['modern', [M.black, '#b23a36', M.char]],
  ['nordic', ['#eef0f1', N.blue, N.gray]],
  ['industrial', [I.steel, I.leather, I.iron]],
]
const WK_PALS: Pal[] = [
  ['modern', [M.silver, M.char, '#3f7fd8']],
  ['nordic', ['#e9ecef', '#8a8d93', N.mustard]],
  ['industrial', [I.iron, '#1f1f22', I.rust]],
  ['classic', [CL.gold, '#4a3a2e', CL.wine]],
]
const CS_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.gray]],
  ['modern', [M.char, M.walnut, M.silver]],
  ['japanese', [J.dark, J.wood, '#8c9096']],
  ['classic', ['#3b3a38', '#7a4b32', CL.gold]],
]
const BED_PALS: Pal[] = [
  ['nordic', [N.oak, '#e6e6e2', N.sage]],
  ['modern', ['#eef0f2', '#b9c4cc', '#7fb2d8']],
  ['japanese', [J.hinoki, J.washi, J.ai]],
  ['classic', [M.walnut, '#d7d8db', '#c98a8a']],
]
const OT_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.gray]],
  ['modern', [M.white, M.silver, M.char]],
  ['industrial', [I.walnut, I.iron, I.rust]],
  ['modern', [M.walnut, '#e9eaec', '#3f7fd8']],
]
const BP_PALS: Pal[] = [
  ['modern', [M.white, '#5b6b8c', '#3f7fd8']],
  ['nordic', [N.white, '#8f9aa5', N.mustard]],
  ['modern', [M.char, '#2f3b52', '#e8483f']],
  ['cute', [C.white, C.sky, C.pink]],
]
const FA_PALS: Pal[] = [
  ['modern', ['#f6f7f8', SIGN_RED, '#3f7fd8']],
  ['modern', [SIGN_RED, '#f6f7f8', '#f2c230']],
  ['nordic', ['#5f9e83', N.white, N.mustard]],
  ['industrial', [R.orange, M.white, I.iron]],
]
const MED_PALS: Pal[] = [
  ['modern', ['#e4e6e9', M.white, SIGN_RED]],
  ['nordic', [N.oak, N.white, '#4f9e7a']],
  ['japanese', [J.wood, J.washi, J.shu]],
  ['industrial', [I.iron, I.concrete, I.rust]],
]
const EX_PALS: Pal[] = [
  ['modern', [SIGN_RED, M.char, M.white]],
  ['industrial', ['#b8352b', I.iron, I.concrete]],
  ['modern', [M.silver, M.black, '#f2c230']],
  ['retro', [R.red, R.caramel, R.cream]],
]
const SF_PALS: Pal[] = [
  ['modern', [M.char, '#4a4d53', CL.gold]],
  ['industrial', [I.iron, I.steel, I.rust]],
  ['nordic', ['#e6e6e2', N.gray, N.oak]],
  ['classic', ['#2f4a3c', '#3a5a49', CL.gold]],
]
const SL_PALS: Pal[] = [
  ['modern', ['#c9cdd2', SIGN_RED, '#3a3b40']],
  ['industrial', ['#9a9ea3', R.orange, I.iron]],
  ['nordic', ['#e4e6e8', '#3f7fd8', N.gray]],
  ['retro', ['#d2d0c8', R.mustard, R.caramel]],
]
const FL_PALS: Pal[] = [
  ['modern', [M.char, SIGN_RED, '#f2c230']],
  ['industrial', [I.steel, '#4a6b4f', I.rust]],
  ['retro', [R.mustard, R.teal, R.cream]],
  ['nordic', [N.gray, N.white, N.blue]],
]
const EB_PALS: Pal[] = [
  ['modern', ['#cfd3d8', M.char, '#f2c230', '#f4f4f2']],
  ['modern', [R.orange, '#3a3b40', '#d9dde2', '#f2c230']],
  ['industrial', [R.olive, I.iron, R.orange, '#f4f4f2']],
  ['nordic', ['#c8473a', N.white, '#d9dde2', N.white]],
]
const BK_PALS: Pal[] = [
  ['modern', ['#efeadf', '#f8f8f5', SIGN_RED]],
  ['modern', [M.white, M.light, '#3f7fd8']],
  ['industrial', [I.steel, M.light, I.rust]],
  ['nordic', [N.linen, N.white, '#4f9e7a']],
]
const WH_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#3f7fd8']],
  ['modern', ['#d9dde2', M.char, '#e8483f']],
  ['nordic', [N.white, N.linen, N.mustard]],
  ['industrial', [I.steel, I.iron, I.rust]],
]
const RD_PALS: Pal[] = [
  ['modern', [M.white, '#e2e4e7', M.silver]],
  ['industrial', [I.iron, BRASS, I.steel]],
  ['classic', [CL.cream, CL.gold, CL.walnut]],
  ['modern', [M.char, M.silver, '#8a8d93']],
]
const GB_PALS: Pal[] = [
  ['modern', [M.silver, '#d9dde2', M.char]],
  ['nordic', [N.white, '#e2e4e7', N.oak]],
  ['japanese', ['#e9e6df', '#d7d2c6', J.wood]],
  ['industrial', [I.iron, I.steel, I.rust]],
]

export const CARE_SAFETY: AssetDef[] = [
  define('care-wheelchair', '轮椅', 'living', [WC.w, WC.d, WC.h], WC_PALS, wheelchair, {
    type: 'seat',
    mats: ['metal', 'fabric', 'plastic'],
  }),
  define('care-walker', '助行器', 'living', [WK.w, WK.d, WK.h], WK_PALS, walker, {
    type: 'sundries',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('care-cane-stand', '手杖与拐杖架', 'entrance', [24, 24, CS.h], CS_PALS, caneStand, {
    type: 'sundries',
    mats: ['metal', 'wood', 'metal'],
  }),
  // 护理床不参与普通卧室布置：不加 bed 标签
  define('care-bed', '电动护理床', 'bedroom', [BED.w, BED.d, BED.h], BED_PALS, careBed, {
    type: 'appliance',
    mats: ['wood', 'metal', 'fabric'],
  }),
  define('care-overbed-table', '床边移动桌', 'bedroom', [OT.w, OT.d, OT.h], OT_PALS, overbedTable, {
    type: 'table',
    mats: ['wood', 'metal', 'plastic'],
    surface: OT.top,
    // 前沿的挡条那一条不放东西
    surfaceShape: [rectPoly(-OT.w / 2 + 1, -OT.d / 2 + 1, OT.w / 2 - 1, OT.d / 2 - 2.5)],
  }),
  define('care-bp-monitor', '血压计', 'tabletop', [22, 14, 9], BP_PALS, bpMonitor, {
    ...PROP,
    type: 'personal-care',
    mats: ['plastic', 'fabric', 'plastic'],
  }),
  define('care-first-aid', '急救箱', 'tabletop', [FA.w, 23, 24], FA_PALS, firstAid, {
    ...PROP,
    type: 'personal-care',
    mats: ['plastic', 'plastic', 'paper'],
  }),
  define('care-med-cabinet', '壁挂药箱柜', 'toiletry', [MED.w, MED.d, MED.h], MED_PALS, medCabinet, {
    type: 'personal-care',
    mount: MED.mount,
    mats: ['wood', 'paint', 'plastic'],
  }),
  define('care-extinguisher', '灭火器', 'entrance', [EX.w, EX.d, EX.h], EX_PALS, extinguisher, {
    type: 'tool',
    mats: ['metal', 'plastic', 'paper'],
  }),
  define('care-safe', '家用保险箱', 'storage', [SF.w, SF.d, SF.h], SF_PALS, safeBox, {
    type: 'storage-box',
    mats: ['metal', 'metal', 'metal'],
    surface: SF.h,
    // 只有箱顶能放东西（门、转盘、把手凸在前面）
    surfaceShape: [rectPoly(-SF.w / 2 + 1, SF.bz - SF.bd / 2 + 1, SF.w / 2 - 1, SF.bz + SF.bd / 2 - 1)],
  }),
  define('care-step-ladder', '人字梯', 'storage', [SL.w, SL.d, SL.h], SL_PALS, stepLadder, {
    type: 'tool',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('care-flashlight', '手电筒与应急灯', 'tabletop', [23, 13, 15], FL_PALS, flashlight, {
    ...PROP,
    type: 'tool',
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('care-emergency-bag', '防灾背包', 'entrance', [42, 38, 46], EB_PALS, emergencyBag, {
    type: 'bag',
    mats: ['fabric', 'fabric', 'plastic', 'plastic'],
  }),
  define('care-breaker-panel', '配电箱', 'appliance', [BK.w, BK.d, BK.h], BK_PALS, breakerPanel, {
    type: 'appliance',
    mount: BK.mount,
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('care-water-heater', '壁挂燃气热水器', 'appliance', [WH.w, WH.d, WH.h], WH_PALS, waterHeater, {
    type: 'appliance',
    mount: WH.mount,
    mats: ['metal', 'plastic', 'plastic'],
  }),
  define('care-radiator', '暖气片', 'appliance', [RD.w, RD.d, RD.h], RD_PALS, radiator, {
    type: 'heater',
    mount: RD.mount,
    mats: ['metal', 'plastic', 'metal'],
  }),
  define('care-grab-bar', '无障碍扶手', 'toiletry', [GB.w, GB.d, GB.h], GB_PALS, grabBar, {
    type: 'sundries',
    mount: GB.mount,
    mats: ['metal', 'metal', 'plastic'],
  }),
]
