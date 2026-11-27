// 民族乐器、打击乐、铜管：二胡、琵琶、古琴、笛箫、葫芦丝、扬琴、卡洪鼓、非洲鼓、手碟、木琴、低音提琴、长号、圆号、大号，
// 加上卡林巴、陶笛 / 口风琴、落地麦克风架、乐谱堆这几件小东西。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z（演奏的人在 +z 一侧）。落地的大乐器带支架立着；小乐器是桌面摆件（PROP）。type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, box, cup, cyl, nub, puck, rbox, shade, torus, tray } from '../toon'
import { C, holePanel, paintPanel, shell, slab, type AssetDef } from '../kit'
import { G, P, PI, cylX, cylZ, fitGroup, ghost, lathe, lit, mesh, noOutline, rod3, strutBox, taperRod3, tube, type V2, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const STEEL = '#c9ced4'
const DARK = '#2a2a2e'
const RUBBER = '#2e2f33'
const IVORY = '#f4ecd8'
const PAPER = '#fbf8f0'
const STRING = '#e6e2d6'
const HOLE = '#2a1e14'
/** 竹器（品、琴竹、弓杆）的浅竹色 */
const CANE = '#dcc38a'

// ---------- 小工具 ----------

/** 琴弦 / 细线：两点之间很细的杆，不描边 */
const wire = (a: V3, b: V3, color = STRING, r = 0.1) => noOutline(taperRod3(a, b, r, r, color, 4))

/** 右半边轮廓（从底部中线到顶部中线）镜像成完整的闭合轮廓 */
const mirrored = (right: V2[]): V2[] => [...right, ...right.slice(1, -1).reverse().map(([x, y]): V2 => [-x, y])]

/** 过控制点的样条取 n 段（车削轮廓磨圆用），半径不小于 0.01。n 取「控制点间隔数」的整数倍时轮廓正好经过每个控制点（最大半径、总高不变） */
function splinePts(pts: V2[], n = pts.length * 4): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  )
  return curve.getPoints(n).map((v): V2 => [Math.max(0.01, v.x), v.y])
}

/** 车削体：轮廓 [半径, 高度] 先用样条磨圆再绕 y 轴旋转（葫芦、手碟、陶笛） */
const smoothLathe = (pts: V2[], color: string, seg = 32, n = pts.length * 4) => lathe(splinePts(pts, n), color, seg)

/**
 * 喇叭口：轮廓 [半径, 高度] 从细的一端（低）到口沿（高），带壁厚——外壁、口沿、内壁连成一圈，口朝 +y。
 * 外壁每两个控制点之间 2 段（弯得急的地方控制点本来就密）；内壁只能从口里看到一点，隔一个点取一个
 */
function flare(pts: V2[], color: string, t = 0.35, seg = 28) {
  const outer = splinePts(pts, (pts.length - 1) * 2)
  const inner = outer
    .filter((_, i) => i % 2 === 0)
    .map(([r, y]): V2 => [Math.max(0.05, r - t), y])
    .reverse()
  return lathe([...outer, ...inner], color, seg)
}

/** 平面轮廓挤出成板（琴身）：轮廓在 xy 平面、用闭合样条磨圆（每个控制点 4 段），厚度沿 z 居中；薄板的倒角给 1 步就够 */
function outlinePlate(pts: V2[], depth: number, color: string, bevel = 0.5, bevelSeg = 2) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    true,
    'centripetal',
  )
  const v = curve.getPoints(pts.length * 4).map((q) => new THREE.Vector2(q.x, q.y))
  v.pop()
  const b = Math.min(bevel, depth * 0.3)
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(v), { depth: Math.max(0.01, depth - b * 2), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bevelSeg, curveSegments: 8 })
  geo.translate(0, 0, -depth / 2 + b)
  return mesh(geo, color)
}

/** 过控制点的弯管，半径可以沿路径变化（铜管乐器的管身、软管）；两端开口 */
function sweep(pts: V3[], radius: number | ((t: number) => number), color: string, seg = 24, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((q) => new THREE.Vector3(...q)),
    false,
    'centripetal',
  )
  const fr = curve.computeFrenetFrames(seg, false)
  const rAt = typeof radius === 'number' ? () => radius : radius
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= seg; j++) {
    const c = curve.getPointAt(j / seg)
    const r = rAt(j / seg)
    const nv = fr.normals[j]
    const bv = fr.binormals[j]
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * PI * 2
      // 和 three 的 TubeGeometry 同一套绕向（面朝外）
      const cs = -Math.cos(a)
      const sn = Math.sin(a)
      const nx = cs * nv.x + sn * bv.x
      const ny = cs * nv.y + sn * bv.y
      const nz = cs * nv.z + sn * bv.z
      pos.push(c.x + r * nx, c.y + r * ny, c.z + r * nz)
      nor.push(nx, ny, nz)
    }
  }
  for (let j = 1; j <= seg; j++)
    for (let i = 1; i <= radial; i++) {
      const a = (radial + 1) * (j - 1) + (i - 1)
      const b = (radial + 1) * j + (i - 1)
      const c = (radial + 1) * j + i
      const d = (radial + 1) * (j - 1) + i
      idx.push(a, b, d, b, c, d)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setIndex(idx)
  return mesh(geo, color)
}

/** 竹笛 / 箫的一排指孔：沿局部 x 排在管子顶上（y = r），不描边 */
function fingerHoles(xs: number[], r: number, size = 0.34) {
  return xs.map((x) => noOutline(ball(size, HOLE, { x, y: r - 0.04 }, [1, 0.4, 1], [6, 4])))
}

// ---------- 二胡（带支架）：六角琴筒蒙蛇皮、细长琴杆穿过琴筒、两只弦轴朝后、弯脖琴头，弓靠在琴杆旁，木座后面一根立柱叉住琴杆 ----------

function erhu(p: string[]) {
  const [wood, skin, stand] = p
  const g = new THREE.Group()
  const dark = shade(wood, -0.07)
  // 支架：底板、琴托、后立柱和叉住琴杆的横臂
  g.add(rbox(20, 2, 20, stand, { z: -3 }, 0.8))
  g.add(rbox(8, 2.2, 12, dark, { y: 2, z: -3 }, 0.8))
  // 琴筒：六角筒，轴朝前后（平面朝上下），前口略大
  const by = 2 + 2.2 + 4.5
  g.add(P(cyl(5.5, 5.2, 13, wood, {}, 6), 0, by, -3, PI / 2, PI / 6, 0))
  // 蛇皮面 + 几片鳞纹
  g.add(P(cyl(4.9, 4.9, 0.6, skin, {}, 6), 0, by, 3.5, PI / 2, PI / 6, 0))
  const scale = shade(skin, -0.28)
  for (const [x, y] of [[-1.9, 1.2], [1.9, 1.2], [-1.9, -1.2], [1.9, -1.2], [0, 2.5], [0, -2.5], [-3.4, 0], [3.4, 0]] as V2[]) g.add(P(noOutline(box(1.3, 1.3, 0.2, scale)), x, by + y, 3.78, 0, 0, PI / 4))
  // 后口的音窗
  g.add(P(cyl(4.2, 4.2, 0.5, shade(wood, -0.2), {}, 6), 0, by, -9.5, PI / 2, PI / 6, 0))
  // 琴杆穿过琴筒，顶上是往后弯的琴头
  g.add(cyl(0.85, 1, 70, dark, { y: by - 4 }, 10))
  g.add(sweep([[0, by + 65, 0], [0, by + 69.8, -0.3], [0, by + 72.9, -2.4], [0, by + 73.3, -5.4]], (t) => 0.85 - 0.15 * t, dark, 10, 8))
  g.add(ball(0.95, IVORY, { y: by + 73.3, z: -5.6 }, [1, 1, 0.7], [8, 6]))
  // 两只弦轴：从后面穿过琴杆，柄朝后
  for (const y of [by + 54, by + 61]) {
    g.add(taperRod3([0, y, 1.7], [0, y, -9.4], 0.45, 1.05, dark, 8))
    g.add(ball(1.05, dark, { y, z: -9.5 }, undefined, [8, 6]))
  }
  // 千斤（把弦拢向琴杆的线圈）、琴码、两根弦
  const qy = by + 42
  g.add(rbox(1.4, 0.9, 3.2, '#8a2f2a', { y: qy, z: 1 }, 0.3))
  g.add(rbox(1.8, 0.7, 0.9, CANE, { y: by - 0.35, z: 4.2 }, 0.2))
  for (const [s, py] of [[-1, by + 54], [1, by + 61]] as V2[]) {
    g.add(wire([s * 0.25, py, 1.5], [s * 0.3, qy + 0.4, 2.4]))
    g.add(wire([s * 0.3, qy + 0.4, 2.4], [s * 0.45, by, 4.75]))
    g.add(wire([s * 0.45, by, 4.75], [s * 0.45, by - 4.6, 3.3]))
  }
  // 弓：弓根搁在琴筒顶上，弓杆靠在支架叉齿的外侧（不从叉齿里穿过去），弓毛在前
  const top = by + 4.6
  g.add(rbox(1, 3, 2.2, DARK, { x: 2.5, y: top, z: 0.4 }, 0.3))
  g.add(rod3([2.5, top + 2.4, -0.3], [2.1, by + 68, -0.2], 0.32, CANE, 6))
  g.add(wire([2.5, top + 1.2, 1.2], [2.1, by + 67.4, 0.9], '#f6f2e8', 0.16))
  g.add(rbox(0.8, 1.8, 2, CANE, { x: 2.1, y: by + 66.8, z: 0.3 }, 0.3))
  // 立柱 + 横臂 + 两只叉齿
  g.add(rbox(2.2, 46, 2.2, stand, { y: 2, z: -11.6 }, 0.6))
  g.add(rbox(2.2, 2, 11, stand, { y: 46, z: -6.2 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(1, 2, 3.4, stand, { x: s * 1.5, y: 46, z: -0.2 }, 0.4))
  g.add(rbox(4, 2, 1.4, stand, { y: 46, z: -1.6 }, 0.4))
  return fitGroup(g)
}

// ---------- 琵琶（立在支架上）：梨形共鸣箱连着琴颈，面板上一排品、琴颈上几块相，琴头往后折、两侧各两只弦轴，木座托着琴底、后柱叉住琴颈 ----------

function pipa(p: string[]) {
  const [wood, face, stand] = p
  const inst = new THREE.Group()
  // 背板（连着琴颈）+ 背后鼓起来的弧面
  inst.add(outlinePlate(mirrored([[0, 0], [7, 0.8], [13, 5], [16, 13], [16.4, 21], [15, 31], [11.5, 41], [7.5, 50], [4.5, 58], [3, 66], [2.5, 75], [0, 76]]), 4.6, wood, 1.2))
  inst.add(ball(10, shade(wood, -0.05), { y: 22, z: -1.4 }, [1.35, 2, 0.32], [20, 12]))
  // 面板
  inst.add(P(outlinePlate(mirrored([[0, 1.6], [6.4, 2.4], [12, 6.2], [14.7, 13], [15.1, 21], [13.7, 31], [10.3, 41], [6.4, 50], [3.6, 56.5], [0, 57.6]]), 0.8, face, 0.25, 1), 0, 0, 2.45))
  // 品：面板上一排由宽到窄的小横条；相：琴颈上的几块楔形
  for (let i = 0; i < 10; i++) inst.add(nub(4.4 - i * 0.2, 0.55, 0.5, CANE, { y: 24 + i * 3.3, z: 3.05 }))
  for (let i = 0; i < 5; i++) inst.add(rbox(4.2 - i * 0.28, 2.1, 1.4, IVORY, { y: 59.3 + i * 3.3, z: 2.8 }, 0.4))
  inst.add(rbox(3.4, 0.8, 2, IVORY, { y: 75.2, z: 2.7 }, 0.3))
  // 缚手 + 四根弦
  const dark = shade(wood, -0.12)
  inst.add(rbox(8.6, 2.4, 1.2, dark, { y: 7.4, z: 3.35 }, 0.4))
  for (const x of [-1.5, -0.5, 0.5, 1.5]) inst.add(wire([x * 1.6, 9.4, 4], [x * 0.7, 75.6, 3.75]))
  // 琴头：往后折的弦槽、四只弦轴（左右各两只）、顶上的如意头
  inst.add(strutBox([0, 75.4, 0.2], [0, 91, -5], 3.4, 3, wood, 0.8))
  ;[0.2, 0.42, 0.64, 0.86].forEach((t, i) => {
    const s = i % 2 ? 1 : -1
    const y = 75.4 + 15.6 * t
    const z = 0.2 - 5.2 * t
    inst.add(taperRod3([-s * 1.2, y, z], [s * 8.4, y, z], 0.5, 0.95, dark, 8))
    inst.add(ball(0.95, dark, { x: s * 8.5, y, z }, undefined, [8, 6]))
  })
  inst.add(P(rbox(5.2, 5.6, 1.8, wood, {}, 0.8), 0, 93.2, -4.6, 0.4))
  // 支架：底板、托住琴底的木块、后立柱和叉住琴颈的横档
  const g = new THREE.Group()
  const t = 0.1
  const yb = 5
  const zb = 3
  g.add(rbox(26, 2.4, 18, stand, {}, 0.9))
  g.add(rbox(13, 4, 7.4, shade(stand, -0.06), { y: 2.4, z: zb }, 1))
  g.add(P(inst, 0, yb, zb, -t))
  // 琴颈背面（沿琴身 62cm 处）在世界里的位置
  const L = 62
  const ny = yb + L * Math.cos(t) - 2.3 * Math.sin(t)
  const nz = zb - L * Math.sin(t) - 2.3 * Math.cos(t)
  g.add(rbox(2.4, ny + 1.2 - 2.4, 2.4, stand, { y: 2.4, z: nz - 2.2 }, 0.6))
  g.add(rbox(10.6, 2.4, 2.2, stand, { y: ny - 1.2, z: nz - 1.1 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(1.4, 2.4, 5, stand, { x: s * 4.6, y: ny - 1.2, z: nz + 1.2 }, 0.5))
  return fitGroup(g)
}

// ---------- 古琴（带琴桌）：窄长的漆面琴身横放在矮琴桌上，琴头在右、探出桌沿垂着琴轸和穗子，七根弦、外侧十三个徽 ----------

const QIN = { tableW: 116, tableD: 38, tableH: 66, x0: 2 }
function guqin(p: string[]) {
  const [lacquer, wood, acc] = p
  const g = new THREE.Group()
  const th = QIN.tableH
  const tx = -4
  // 琴桌：桌面、四腿、前后牙条、两侧脚枨和中间一根横枨
  g.add(rbox(QIN.tableW, 3, QIN.tableD, wood, { x: tx, y: th - 3 }, 0.8))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rbox(4, th - 3, 4, wood, { x: tx + sx * 53, z: sz * 15 }, 0.6))
    g.add(rbox(2.4, 2.4, 27, shade(wood, -0.05), { x: tx + sx * 53, y: 10 }, 0.5))
  }
  for (const sz of [-1, 1]) g.add(rbox(103, 5, 1.6, shade(wood, -0.05), { x: tx, y: th - 8, z: sz * 15 }, 0.4))
  g.add(rbox(104, 2.4, 2.4, shade(wood, -0.05), { x: tx, y: 10 }, 0.5))
  // 琴身（俯视轮廓：琴头宽、项和腰各收一段、琴尾窄），底下两只雁足、琴头下面一块琴垫
  const half: V2[] = [[61, 8.6], [52, 9], [50.5, 7.6], [43.5, 7.6], [41.5, 10], [12, 9.6], [-6, 9.3], [-8, 7.9], [-27, 7.7], [-29, 8.8], [-57, 7.2], [-61, 6.4]]
  const poly = [...half, ...[...half].reverse().map(([x, z]): V2 => [x, -z])].map(([x, z]): V2 => [x + QIN.x0, z])
  const yq = th + 1
  const qt = yq + 4.4
  g.add(slab(poly, 4.4, lacquer, yq))
  for (const sz of [-1, 1]) g.add(cyl(1.2, 1, 1, wood, { x: QIN.x0 - 36, y: th, z: sz * 4 }, 10))
  g.add(rbox(9, 1, 17, acc, { x: 47, y: th }, 0.4))
  // 岳山、龙龈
  const bx = QIN.x0 + 52.5
  const ex = QIN.x0 - 60.2
  g.add(rbox(1.4, 1.1, 17, wood, { x: bx, y: qt - 0.2 }, 0.3))
  g.add(rbox(1.2, 0.8, 9, wood, { x: ex, y: qt - 0.2 }, 0.3))
  // 七根弦
  for (let i = 0; i < 7; i++) g.add(wire([bx, qt + 0.95, -5.4 + i * 1.8], [ex, qt + 0.65, -3.6 + i * 1.2]))
  // 十三徽：按弦长的分数位置排在外侧（离弹琴的人远的一边），七徽最大
  ;[1 / 8, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5, 5 / 6, 7 / 8].forEach((f, i) => {
    const r = i === 6 ? 0.62 : 0.45
    g.add(noOutline(cyl(r, r, 0.3, IVORY, { x: bx - f * (bx - ex), y: qt - 0.2, z: -(6.2 - f * 0.9) }, 8)))
  })
  // 琴轸和穗子：挂在探出桌沿的琴头底下
  for (let i = 0; i < 7; i++) {
    const z = -5.4 + i * 1.8
    g.add(cyl(0.55, 0.45, 3.4, wood, { x: 59.6, y: yq - 3.4, z }, 8))
    g.add(wire([59.6, yq - 3.2, z], [59.9, yq - 15, z], acc, 0.24))
  }
  return fitGroup(g)
}

// ---------- 笛箫架：木座上两根立柱各伸出上下两只托钩，横架两支竹笛（缠线、指孔、笛尾挂穗），座子一头竖插一支紫竹洞箫 ----------

/** 一支横放的竹笛：沿 x、给中心，指孔朝上 [竹色, 缠线色] */
function bambooFlute(len: number, r: number, bamboo: string, bind: string) {
  const g = new THREE.Group()
  g.add(cylX(r, len, bamboo, 0, 0, 0, 12))
  // 两头的镶口和一圈圈缠线
  for (const s of [-1, 1]) g.add(cylX(r + 0.06, 1.2, IVORY, s * (len / 2 - 0.5), 0, 0, 12))
  const n = Math.round(len / 6.5)
  for (let i = 1; i < n; i++) g.add(noOutline(cylX(r + 0.07, 0.5, bind, -len / 2 + (i * len) / n, 0, 0, 12)))
  // 吹孔、膜孔、六个指孔
  g.add(...fingerHoles([-len * 0.34, -len * 0.2, ...[0, 1, 2, 3, 4, 5].map((k) => -len * 0.06 + k * len * 0.062)], r))
  return g
}

function diziRack(p: string[]) {
  const [wood, bamboo, acc] = p
  const g = new THREE.Group()
  const dark = shade(bamboo, -0.26, -0.1)
  g.add(rbox(64, 1.6, 11, wood, {}, 0.6))
  for (const x of [-24, 8]) {
    g.add(rbox(2.2, 23, 2.6, wood, { x, y: 1.6, z: -2.5 }, 0.6))
    for (const y of [9.5, 18.5]) {
      g.add(rbox(2.2, 1.4, 5.4, wood, { x, y, z: 1.3 }, 0.5))
      g.add(rbox(2.2, 2.6, 1.2, wood, { x, y, z: 3.6 }, 0.5))
    }
  }
  // 两支笛：指孔转向前上方，看得见
  g.add(P(bambooFlute(58, 1.1, bamboo, acc), -4.9, 20.95, 1.6, 0.7))
  g.add(P(bambooFlute(50, 1.05, shade(bamboo, -0.06), acc), -7, 11.9, 1.6, 0.7))
  // 上面那支的笛尾挂一条穗子
  g.add(wire([21.6, 20.2, 1.6], [21.6, 14.6, 1.6], acc, 0.2))
  g.add(ball(0.7, acc, { x: 21.6, y: 14.4, z: 1.6 }))
  g.add(cyl(0.5, 0.95, 4.6, acc, { x: 21.6, y: 9.4, z: 1.6 }, 8))
  // 洞箫：竖插在座子右头的小筒里（箫底落在筒底上），一节节竹节，正面一列指孔
  const sx = 28.4
  g.add(cup(2, 2, 3.4, 0.55, wood, { x: sx, y: 1.6, z: -0.5 }, 16))
  g.add(cyl(1.1, 1.2, 58.1, dark, { x: sx, y: 2.1, z: -0.5 }, 12))
  for (let i = 0; i < 6; i++) g.add(noOutline(cyl(1.32 - i * 0.02, 1.32 - i * 0.02, 0.6, shade(dark, -0.08), { x: sx, y: 10 + i * 8.6, z: -0.5 }, 12)))
  for (let i = 0; i < 5; i++) g.add(noOutline(ball(0.34, HOLE, { x: sx, y: 24 + i * 5.2, z: 0.62 }, [1, 1, 0.4], [6, 4])))
  g.add(cyl(1.16, 1.16, 1, IVORY, { x: sx, y: 59.4, z: -0.5 }, 12))
  g.add(noOutline(box(0.8, 0.7, 0.3, HOLE, { x: sx, y: 59.8, z: 0.56 })))
  return fitGroup(g)
}

// ---------- 葫芦丝（小支架上）：上头一只葫芦带吹嘴，底下三根竹管（中间主管带指孔、两边附管），腰上系一只中国结坠，立在圆木座的小筒里 ----------

function hulusi(p: string[]) {
  const [gourd, bamboo, stand, knot] = p
  const g = new THREE.Group()
  g.add(cyl(5.6, 6, 1.6, stand, {}, 24))
  g.add(cup(2, 2, 3.4, 0.5, stand, { y: 1.6 }, 16))
  // 主管（落在小筒的筒底上）+ 两根附管（一长一短），管口镶一圈白
  g.add(cyl(1.25, 1.25, 24.7, bamboo, { y: 2.1 }, 12))
  for (const [x, y0] of [[-2.5, 14], [2.5, 18.5]] as V2[]) {
    g.add(cyl(0.95, 0.95, 27 - y0, bamboo, { x, y: y0 }, 10))
    g.add(cyl(1.06, 1.06, 0.8, IVORY, { x, y: y0 - 0.15 }, 10))
  }
  // 把三根管扎在一起的箍
  g.add(rbox(7.8, 1.3, 3, shade(bamboo, -0.3), { y: 21.6 }, 0.6))
  for (let i = 0; i < 6; i++) g.add(noOutline(ball(0.36, HOLE, { y: 6.6 + i * 2.5, z: 1.2 }, [1, 1, 0.4], [6, 4])))
  // 葫芦：大肚、细腰、小肚，往上收成吹嘴
  g.add(smoothLathe([[0.01, 25.6], [2.2, 25.8], [4.2, 27.4], [5.2, 30.6], [4.7, 33.8], [3, 36.2], [2.1, 37.5], [2.5, 38.9], [2.9, 40.2], [2.4, 41.7], [1.3, 42.9], [0.85, 44.2]], gourd, 20, 33))
  g.add(cyl(0.7, 0.9, 1.8, shade(bamboo, -0.3), { y: 43.9 }, 10))
  // 中国结坠：挂绳、菱形结、两边的小耳、珠子和流苏
  g.add(wire([3.2, 22.2, 0.9], [4.8, 17.2, 0.9], knot, 0.2))
  g.add(P(rbox(2.6, 2.6, 0.8, knot, {}, 0.3), 4.8, 15.9, 0.9, 0, 0, PI / 4))
  for (const s of [-1, 1]) g.add(ball(0.55, knot, { x: 4.8 + s * 1.9, y: 15.9, z: 0.9 }))
  g.add(ball(0.6, '#d9b45a', { x: 4.8, y: 13.6, z: 0.9 }))
  g.add(cyl(0.5, 1, 5.4, knot, { x: 4.8, y: 7.8, z: 0.9 }, 10))
  return g
}

// ---------- 扬琴（带架）：梯形琴箱（长边朝演奏的人），面板上两条琴码、两个音孔、一排排琴弦，两头是钉弦的琴头，上面搁两支琴竹，底下 X 形折叠架 ----------

function yangqin(p: string[]) {
  const [wood, board, stand] = p
  const g = new THREE.Group()
  const y0 = 68
  const top = y0 + 8
  const trap = (near: number, far: number, z: number): V2[] => [[-near, z], [near, z], [far, -z], [-far, -z]]
  g.add(slab(trap(50, 34, 22), 8, wood, y0))
  g.add(slab(trap(41, 27.5, 20.2), 0.6, board, top - 0.2))
  const bt = top + 0.4
  /** 面板在 z 处的半宽 */
  const hw = (z: number) => 27.5 + ((z + 20.2) / 40.4) * 13.5
  // 两条琴码：木条上一排码头。右码的码头和左码错开半格——每根弦只压在自己那条琴码的码头上，从另一条琴码的码头之间穿过去
  const bridges = [-9, 13]
  /** 第 b 条琴码上第 k 根弦（也是第 k 只码头）的 z */
  const strZ = (b: number, k: number) => -15.4 + k * 4.4 + b * 2.2
  for (const [b, x] of bridges.entries()) {
    g.add(rbox(1.2, 1.5, 36, shade(wood, -0.06), { x, y: bt - 0.1 }, 0.3))
    for (let k = 0; k < 8 - b; k++) g.add(nub(1.5, 0.8, 1.8, IVORY, { x, y: bt + 1.3, z: strZ(b, k) }))
  }
  // 琴弦：从左头的弦钉上来、压过码头、落到右头的弦钉上；每根弦两头各一只弦钉，里外两排错开
  const sy = bt + 2.2
  for (const [b, x] of bridges.entries())
    for (let k = 0; k < 8 - b; k++) {
      const z = strZ(b, k)
      const e = hw(z) + (k % 2 ? 4.6 : 2.2)
      for (const s of [-1, 1]) {
        g.add(noOutline(cyl(0.3, 0.3, 0.9, STEEL, { x: s * e, y: top - 0.1, z }, 6)))
        g.add(wire([s * e, top + 0.7, z], [x, sy, z]))
      }
    }
  // 两个音孔（深色圆 + 一圈白边）
  for (const x of [-24, 27]) {
    g.add(noOutline(cyl(3.2, 3.2, 0.3, HOLE, { x, y: bt - 0.2, z: 9 }, 20)))
    g.add(noOutline(torus(3.3, 0.3, IVORY, { x, y: bt + 0.1, z: 9, rx: PI / 2 }, PI * 2, [4, 20])))
  }
  // 两支琴竹：各压在一条琴码的码头和那根弦上
  for (const [a, b] of [
    [[-31, sy + 0.2, 11], [5, sy + 0.2, 3.4]],
    [[-6, sy + 0.2, -5.4], [30, sy + 0.2, 4.1]],
  ] as [V3, V3][]) {
    g.add(rod3(a, b, 0.3, CANE, 6))
    g.add(ball(0.55, CANE, { x: b[0], y: b[1], z: b[2] }, [1.8, 1, 1], [8, 6]))
  }
  // X 形架：前后各一副交叉腿，中间一根轴，上下各两根横梁
  for (const sz of [-1, 1]) {
    g.add(strutBox([-30, 1.6, sz * 13], [30, 66.6, sz * 13], 3, 2, stand, 0.6))
    g.add(strutBox([30, 1.6, sz * 15.2], [-30, 66.6, sz * 15.2], 3, 2, stand, 0.6))
  }
  g.add(cylZ(1, 34, STEEL, 0, 34.1, 0, 10))
  for (const sx of [-1, 1]) {
    g.add(rbox(4, 2.2, 36, stand, { x: sx * 30, y: y0 - 2.2 }, 0.8))
    g.add(rbox(4, 2.4, 40, stand, { x: sx * 30 }, 0.8))
    for (const sz of [-1, 1]) g.add(rbox(4.6, 2.8, 2.4, RUBBER, { x: sx * 30, y: -0.01, z: sz * 20 }, 0.8))
  }
  return fitGroup(g)
}

// ---------- 卡洪鼓：空心木箱鼓，背面开圆音孔，正面一块薄打击面板、四角和边上几颗螺丝，四只胶脚，上面放一块坐垫 ----------

const CJ = { w: 30, d: 29, h: 46, y0: 1.2 }
function cajon(p: string[]) {
  const [body, tapa, seat] = p
  const g = new THREE.Group()
  const { w, d, h, y0 } = CJ
  g.add(P(shell(w, h, d, 1.4, body, { back: [{ kind: 'circle', x: 0, y: 30, r: 5.8 }] }), 0, y0, 0))
  // 打击面板（比箱体小一圈，贴在正面）
  g.add(rbox(w - 0.8, h - 0.8, 0.7, tapa, { y: y0 + 0.4, z: d / 2 + 0.3 }, 0.3))
  const sx = w / 2 - 2.2
  for (const [x, y] of [[-sx, 2.6], [sx, 2.6], [-sx, h - 2.6], [sx, h - 2.6], [-sx, h / 2], [sx, h / 2], [-5, h - 2.6], [5, h - 2.6]] as V2[]) g.add(noOutline(cylZ(0.55, 0.3, STEEL, x, y0 + y, d / 2 + 0.7, 8)))
  g.add(noOutline(box(7, 1.6, 0.2, shade(tapa, -0.22), { y: y0 + h - 10, z: d / 2 + 0.66 })))
  for (const fx of [-1, 1]) for (const fz of [-1, 1]) g.add(cyl(1.7, 1.9, y0 + 0.2, RUBBER, { x: fx * 11, z: fz * 10.5 }, 10))
  // 坐垫（连脚一共 50 高）
  g.add(rbox(27, 2.8, 26, seat, { y: y0 + h }, 1.4))
  return fitGroup(g)
}

// ---------- 非洲鼓：高脚杯形的木鼓身（底下是空心的喇叭脚），羊皮鼓面翻下来包住鼓口，上下两道绳圈之间一圈之字形的调音绳 ----------

function djembe(p: string[]) {
  const [wood, skin, rope] = p
  const g = new THREE.Group()
  const outer = splinePts([[10.4, 0], [10.6, 1.6], [9.4, 6], [7.6, 14], [6.6, 21], [6.5, 24.5], [9, 31], [11.6, 39], [14, 46.5], [15.8, 54], [16, 57.6]], 20)
  // 内腔从腰往下掏空到脚底，再接外壁
  g.add(lathe([[0.01, 25], [5.2, 23], [6.6, 12], [8.6, 2], [9.2, 0], ...outer], wood, 32))
  // 鼓身、鼓皮都是 32 段：贴着它们的刻线、绳圈也用 32 段（起始角一样，折线对得上）
  for (const [r, y] of [[10.2, 3.6], [7.25, 17]] as V2[]) g.add(noOutline(torus(r, 0.35, shade(wood, -0.16), { y, rx: PI / 2 }, PI * 2, [4, 32])))
  // 鼓皮 + 翻下来的皮边
  g.add(cyl(15.7, 15.7, 0.7, skin, { y: 57.2 }, 32))
  g.add(cyl(16.25, 16.1, 2.6, skin, { y: 54.6 }, 32))
  // 绳圈：鼓口两道、腰上一道
  g.add(torus(16.4, 0.55, rope, { y: 55.7, rx: PI / 2 }, PI * 2, [6, 32]))
  g.add(torus(16.4, 0.5, rope, { y: 54.5, rx: PI / 2 }, PI * 2, [6, 32]))
  g.add(torus(7, 0.55, rope, { y: 25, rx: PI / 2 }, PI * 2, [6, 32]))
  const n = 12
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * PI * 2
    const a1 = a0 + PI / n
    const a2 = a0 + (PI * 2) / n
    const lo: V3 = [Math.cos(a1) * 7.2, 25.2, Math.sin(a1) * 7.2]
    g.add(rod3([Math.cos(a0) * 16.5, 54.3, Math.sin(a0) * 16.5], lo, 0.3, rope, 5))
    g.add(rod3(lo, [Math.cos(a2) * 16.5, 54.3, Math.sin(a2) * 16.5], 0.3, rope, 5))
  }
  return g
}

// ---------- 手碟（带矮支架）：两片钢壳扣成的飞碟，顶面中心一个凸点、周围一圈椭圆音窝，底面开口，架在三条腿的木圈上 ----------

function handpan(p: string[]) {
  const [steel, stand, rim] = p
  const g = new THREE.Group()
  const cy = 24.6
  const prof: V2[] = [[4.6, -7.4], [5, -9], [9, -9.5], [15, -8.5], [20, -6.5], [24, -3.7], [26, -1.5], [26.6, 0], [26, 1.5], [24, 3.9], [20, 6.8], [15, 9], [9, 10.3], [4, 10.85], [0.01, 11]]
  // 壳体 32 段、轮廓每两个控制点之间 2 段；腰上的箍和它同段数，外径 27（不超出占地）
  g.add(P(smoothLathe(prof, steel, 32, 28), 0, cy, 0))
  g.add(torus(26.4, 0.6, rim, { y: cy, rx: PI / 2 }, PI * 2, [8, 32]))
  // 中心凸点
  g.add(ball(4.6, shade(steel, -0.07), { y: cy + 10.6 }, [1, 0.3, 1], [16, 8]))
  // 一圈音窝：贴着壳面斜放的扁椭圆，中间一个更深的小窝
  const R = 16.4
  const sy = 8.45
  const tilt = 0.42
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2 + PI / 8
    const dimple = G(ball(4, shade(steel, -0.09), { y: -0.25 }, [1.1, 0.14, 0.9], [12, 6]), noOutline(ball(1.5, shade(steel, -0.2), { y: -0.05 }, [1, 0.28, 0.85], [8, 4])))
    g.add(P(dimple, Math.cos(a) * R, cy + sy, Math.sin(a) * R, 0, -a, -tilt))
  }
  // 支架：托住底壳的木圈 + 三条外撇的腿
  const ry = cy - 8.85 - 1
  g.add(torus(13, 1.1, stand, { y: ry, rx: PI / 2 }, PI * 2, [8, 24]))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 6
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    g.add(taperRod3([cx * 13, ry, cz * 13], [cx * 20.5, 0.8, cz * 20.5], 1.3, 1.1, stand, 10))
    g.add(cyl(1.5, 1.7, 0.9, RUBBER, { x: cx * 20.8, z: cz * 20.8 }, 10))
  }
  return g
}

// ---------- 木琴（带共鸣管）：两排长短不一的琴键（前排自然音、后排半音抬高一层、两个三个一组），底下一排由长到短的共鸣管，两头是带脚轮的端架，琴键上搁两支琴槌 ----------

const XY = { n: 22, pitch: 5.3, bar: 4.5, end: 62.5 }
function xylophone(p: string[]) {
  const [bar, pipe, frame, yarn] = p
  const g = new THREE.Group()
  const x0 = (-(XY.n - 1) * XY.pitch) / 2
  /** 琴键长度：t = 0 低音（左）… 1 高音（右） */
  const len = (t: number) => 27 - 11 * t
  const resLen = (t: number) => 9 + 30 * Math.pow(Math.max(0, 1 - t), 1.6)
  const tOf = (x: number) => (x - x0) / ((XY.n - 1) * XY.pitch)
  const yN = 82
  const yA = 84.2
  const yR = 79.4
  for (let i = 0; i < XY.n; i++) {
    const x = x0 + i * XY.pitch
    const L = len(tOf(x))
    g.add(rbox(XY.bar, 2, L, bar, { x, y: yN, z: 1 + L / 2 }, 0.5))
    g.add(cyl(1.9, 1.9, resLen(tOf(x)), pipe, { x, y: yR - resLen(tOf(x)), z: 1 + L / 2 }, 10))
    // 半音键：C–D、D–E、F–G、G–A、A–B 之间
    if (i < XY.n - 1 && [0, 1, 3, 4, 5].includes(i % 7)) {
      const xa = x + XY.pitch / 2
      const La = len(tOf(xa))
      g.add(rbox(XY.bar, 2, La, bar, { x: xa, y: yA, z: -1 - La / 2 }, 0.5))
      g.add(cyl(1.9, 1.9, resLen(tOf(xa)), pipe, { x: xa, y: yR - resLen(tOf(xa)), z: -1 - La / 2 }, 10))
    }
  }
  // 托琴键的横梁（每排两根，顺着琴键长短收拢）和穿着共鸣管的吊梁
  const xe = XY.end - 1
  const zAt = (x: number, f: number) => 1 + f * len(tOf(x))
  for (const f of [0.22, 0.78]) {
    g.add(strutBox([-xe, yN - 1, zAt(-xe, f)], [xe, yN - 1, zAt(xe, f)], 2, 1.6, frame, 0.4))
    g.add(strutBox([-xe, yA - 1, -zAt(-xe, f)], [xe, yA - 1, -zAt(xe, f)], 2, 1.6, frame, 0.4))
  }
  for (const s of [-1, 1]) g.add(strutBox([-xe, yR - 0.8, s * zAt(-xe, 0.5)], [xe, yR - 0.8, s * zAt(xe, 0.5)], 1.4, 1, frame, 0.3))
  // 两头的端架：端板、两条腿、中间一根横档、底梁和两只脚轮
  for (const [s, D] of [
    [-1, 58],
    [1, 36],
  ] as V2[]) {
    const x = s * XY.end
    g.add(rbox(3.6, 15, D, frame, { x, y: 70 }, 1))
    for (const sz of [-1, 1]) {
      g.add(rbox(3.2, 62, 3.6, frame, { x, y: 8, z: sz * (D / 2 - 6) }, 0.8))
      g.add(cylX(3.2, 2.2, RUBBER, x, 3.2, sz * (D / 2 - 4), 14))
      for (const k of [-1, 1]) g.add(nub(0.8, 4.6, 3.6, STEEL, { x: x + k * 1.6, y: 2.4, z: sz * (D / 2 - 4) }))
    }
    g.add(rbox(3.2, 3.2, D - 12, frame, { x, y: 30 }, 0.8))
    g.add(rbox(4.4, 3.4, D + 2, frame, { x, y: 6.6 }, 1))
  }
  g.add(rbox(XY.end * 2, 3, 2.4, frame, { y: 30.1 }, 0.8))
  // 两支琴槌：搁在前排琴键上
  for (const [a, b] of [
    [[-14, yN + 2.4, 21], [17, yN + 3.2, 8.6]],
    [[-32, yN + 2.4, 8], [-5, yN + 3.2, 5]],
  ] as [V3, V3][]) {
    g.add(rod3(a, b, 0.4, CANE, 6))
    g.add(ball(1.5, yarn, { x: b[0] + 0.9, y: yN + 3.5, z: b[2] - 0.3 }))
  }
  return fitGroup(g)
}

// ---------- 低音提琴（靠在支架上）：比大提琴大一圈、溜肩的琴身，f 孔、高琴码、悬空的黑指板、带金属弦钮的卷头，底下一根尾柱；三脚支架的立柱顶住背板、叉住琴颈 ----------

/** 低音提琴本体：沿 y 立着，琴身底在 y = 0（尾柱伸到 -14），正面 +z。[木色, 黑件] */
function bassBody(wood: string, dark: string) {
  const g = new THREE.Group()
  const rib = shade(wood, -0.1)
  // 琴身：侧板 + 面板 + 背板（溜肩：上半身往琴颈收成斜坡）
  const ol = mirrored([[0, 0], [22, 1.5], [31.5, 13], [33, 27], [28, 42], [19.5, 55], [20.5, 63], [24, 73], [24.5, 82], [20, 93], [12, 102], [5, 108], [0, 110]])
  const plate = ol.map(([x, y]): V2 => [x * 0.97, y * 0.985 + 0.8])
  g.add(outlinePlate(ol, 18, rib, 1, 1))
  for (const s of [-1, 1]) g.add(P(outlinePlate(plate, 1.4, wood, 0.5, 1), 0, 0, s * 9.2))
  // f 孔：一道斜缝，两头各一个圆点
  for (const s of [-1, 1]) {
    g.add(P(noOutline(box(1, 15, 0.3, HOLE)), s * 10.5, 48, 9.95, 0, 0, s * 0.1))
    g.add(noOutline(ball(0.95, HOLE, { x: s * 9.3, y: 55.4, z: 9.9 }, [1, 1, 0.25], [8, 4])))
    g.add(noOutline(ball(0.95, HOLE, { x: s * 11.7, y: 40.6, z: 9.9 }, [1, 1, 0.25], [8, 4])))
  }
  // 琴码、拉弦板、尾柱
  g.add(rbox(11, 1, 6.6, '#e9d2a6', { y: 44, z: 13.1 }, 0.3))
  g.add(strutBox([0, 9, 12.2], [0, 33, 15.2], 6.4, 1.2, dark, 0.5))
  g.add(rod3([0, 9.4, 12.2], [0, 1, 9.4], 0.3, dark, 6))
  g.add(cyl(0.55, 0.55, 15, STEEL, { y: -14 }, 8))
  g.add(cyl(1.1, 1.3, 1.6, RUBBER, { y: -14 }, 10))
  // 琴颈（往根部加厚接住指板）+ 指板（下半截悬在面板上方）+ 山口
  g.add(strutBox([0, 104, 10.2], [0, 151, 9.2], 4.4, 5, rib, 1.2))
  g.add(strutBox([0, 64, 14.5], [0, 151, 11.7], 5.4, 1.5, dark, 0.4))
  g.add(rbox(5, 1, 1.2, IVORY, { y: 150.6, z: 12.3 }, 0.3))
  // 四根弦：拉弦板 → 琴码 → 山口
  for (const x of [-3.3, -1.1, 1.1, 3.3]) {
    g.add(wire([x * 0.75, 32.5, 15.9], [x, 44.6, 16.55], STRING, 0.16))
    g.add(wire([x, 44.6, 16.55], [x * 0.45, 151, 12.75], STRING, 0.16))
  }
  // 弦槽、卷头、四只金属弦钮（左右交错）
  g.add(strutBox([0, 150.5, 9.4], [0, 168, 5.6], 5, 5.2, rib, 1.2))
  g.add(cylX(3.3, 5.4, rib, 0, 170.5, 4.2, 20))
  g.add(cylX(1.3, 6.8, wood, 0, 170.5, 4.2, 12))
  ;[154.5, 158.5, 162.5, 166.5].forEach((y, i) => {
    const s = i % 2 ? 1 : -1
    const z = 9.4 - ((y - 150.5) / 17.5) * 3.8
    g.add(cylX(0.45, 6, STEEL, s * 4, y, z, 8))
    g.add(ball(1.5, STEEL, { x: s * 7.4, y, z }, [0.45, 1, 1.2], [8, 6]))
  })
  return g
}

function doubleBass(p: string[]) {
  const [wood, stand, dark] = p
  const g = new THREE.Group()
  const t = 0.14
  const yb = 14
  const zb = 8
  /** 琴身上（沿琴 L、离琴身中面 zl）的点在世界里的位置 */
  const at = (L: number, zl: number): V2 => [yb + L * Math.cos(t) + zl * Math.sin(t), zb - L * Math.sin(t) + zl * Math.cos(t)]
  g.add(P(bassBody(wood, dark), 0, yb, zb, -t))
  // 三脚支架：立柱在琴背后面
  const zp = -19
  for (const [x, z] of [[-20, 15], [20, 15], [0, zp - 13]] as V2[]) {
    g.add(rod3([0, 12, zp], [x, 0.9, z], 0.9, stand, 8))
    g.add(ball(1.2, RUBBER, { x, y: 1.2, z }, undefined, [8, 6]))
  }
  g.add(cyl(1.8, 1.8, 4, stand, { y: 10, z: zp }, 12))
  const [ny, nz] = at(122, 7.3)
  g.add(cyl(1.1, 1.1, ny + 1.4 - 10, stand, { y: 10, z: zp }, 10))
  // 顶住背板的横垫
  const [py, pz] = at(30, -9.9)
  g.add(rod3([0, py, zp], [0, py, pz - 1.4], 0.8, stand, 8))
  g.add(cylX(1.2, 30, RUBBER, 0, py, pz - 1.2, 12))
  // 叉住琴颈的托
  g.add(rod3([0, ny, zp], [0, ny, nz - 1.2], 0.8, stand, 8))
  g.add(cylX(1, 8.6, RUBBER, 0, ny, nz - 1, 10))
  for (const s of [-1, 1]) g.add(rod3([s * 3.6, ny, nz - 1], [s * 3.6, ny, nz + 4.6], 0.8, RUBBER, 8))
  return fitGroup(g)
}

// ---------- 长号（立式支架上）：喇叭口朝下套在支架的托锥上，喇叭管往上绕过调音管的弯再下来接 U 形滑管，滑管另一头是吹嘴 ----------

function trombone(p: string[]) {
  const [brass, stand, trim] = p
  const g = new THREE.Group()
  const rimY = 55
  // 支架：三脚、立杆、锁紧环、套喇叭口的托锥
  for (const a of [PI, PI / 3, -PI / 3]) {
    const x = Math.cos(a) * 13.7
    const z = Math.sin(a) * 13.7
    g.add(rod3([0, 13, 0], [x, 0.9, z], 0.8, stand, 8))
    g.add(ball(1.1, RUBBER, { x, y: 1.1, z }, undefined, [8, 6]))
  }
  g.add(cyl(1.6, 1.6, 3.4, stand, { y: 11 }, 12))
  g.add(cyl(0.9, 0.9, rimY - 12, stand, { y: 12 }, 10))
  g.add(cyl(1.4, 1.4, 3, RUBBER, { y: 32 }, 10))
  // 托锥的顶正好顶到喇叭管的内壁（喇叭口是套在锥上的，不是悬着）
  g.add(cyl(2.6, 6, 11.5, RUBBER, { y: rimY - 2 }, 20))
  // 喇叭管：口朝下（轮廓按离口沿的距离 u 给半径）
  const r = (u: number) => 0.95 + 7 * Math.exp(-u / 3.5) + 2.85 * Math.exp(-u / 14)
  const tubeLen = 53
  const bell = flare([tubeLen, 46, 39, 32, 26, 20, 15, 11, 8, 5.5, 3.5, 2, 1, 0.3, 0].map((u): V2 => [r(u), -u]), brass)
  g.add(P(bell, 0, rimY, 0, PI))
  const ty = rimY + tubeLen
  // 调音管的弯（上半圈）+ 两头的套箍
  const gap = 11.5
  g.add(torus(gap / 2, 1, brass, { x: -gap / 2, y: ty }, PI, [8, 12]))
  for (const x of [0, -gap]) g.add(cyl(1.25, 1.25, 2.2, trim, { x, y: ty - 2 }, 12))
  // 回管 → 滑管锁 → 滑管两根 + 底下的 U 形弯
  g.add(cyl(0.95, 0.85, 30, brass, { x: -gap, y: ty - 30 }, 12))
  g.add(cyl(1.2, 1.2, 3, trim, { x: -gap, y: ty - 32 }, 12))
  const sy = rimY - 41
  g.add(cyl(0.8, 0.8, ty - 31 - sy, brass, { x: -gap, y: sy }, 10))
  g.add(torus(4.5, 0.8, brass, { x: -gap - 4.5, y: sy, rz: PI }, PI, [6, 12]))
  g.add(cyl(0.8, 0.8, ty - 28 - sy, brass, { x: -gap - 9, y: sy }, 10))
  g.add(ball(1, RUBBER, { x: -gap - 4.5, y: sy - 5.3 }, undefined, [8, 6]))
  g.add(rbox(2.4, 1, 1, trim, { x: -gap - 2, y: sy - 3.2, z: 0.9 }, 0.3))
  // 吹嘴：接口、细柄、杯
  const my = ty - 28
  g.add(cyl(1.05, 1.05, 3, trim, { x: -gap - 9, y: my - 1 }, 10))
  g.add(cyl(0.6, 0.75, 4, trim, { x: -gap - 9, y: my + 2 }, 8))
  g.add(cyl(1.7, 0.9, 3.2, trim, { x: -gap - 9, y: my + 5.6 }, 12))
  // 横撑：滑管两道、喇叭管一道
  for (const y of [ty - 36, ty - 42]) g.add(cylX(0.55, 9, trim, -gap - 4.5, y, 0, 8))
  g.add(cylX(0.6, gap, trim, -gap / 2, ty - 18, 0, 8))
  return fitGroup(g)
}

// ---------- 圆号（小支架上）：两三圈盘起来的圆管，右下方甩出一只大喇叭口，中间一排三只转阀连着按键，左上方是吹管；木座上的托块卡住管圈、一根小柱顶着喇叭管 ----------

function frenchHorn(p: string[]) {
  const [brass, key, stand] = p
  const horn = new THREE.Group()
  // 盘管：三圈大小、前后略错开的圆环（圆心在原点，圈面朝前）
  horn.add(torus(11, 1.05, brass, {}, PI * 2, [6, 32]))
  horn.add(torus(8.4, 0.9, brass, { z: 1.5 }, PI * 2, [6, 28]))
  horn.add(torus(9.7, 0.8, brass, { z: -1.3 }, PI * 2, [6, 28]))
  // 喇叭口：从圈底甩向右上方
  const ang = 0.42
  horn.add(P(flare([[1.1, 0], [1.4, 4], [2.1, 8], [3.4, 11.5], [5.6, 14.2], [8.6, 16], [11.4, 17], [13, 17.4]], brass, 0.35, 24), 2, -10.6, -1.2, 0, 0, ang - PI / 2))
  // 吹管 + 吹嘴
  horn.add(sweep([[-8.2, -1.8, 1.5], [-10.4, 4, 1.8], [-11.6, 10, 2], [-12.2, 15.5, 2.2]], (t) => 0.85 - 0.3 * t, brass, 12, 8))
  horn.add(taperRod3([-12.2, 15.4, 2.2], [-12.6, 18.2, 2.3], 0.6, 1.3, key, 10))
  // 横穿管圈的阀管、三只转阀（带阀盖）、各自垂下来的一小段 U 形调音管
  horn.add(rod3([-10.2, 1.6, 0.6], [10.2, -0.9, 0.6], 0.75, brass, 8))
  ;[-3.6, 0, 3.6].forEach((x, i) => {
    const yv = 0.35 - x * 0.12
    horn.add(cylZ(1.7, 3.2, brass, x, yv, 0.8, 14))
    horn.add(cylZ(1.25, 0.6, key, x, yv, 2.6, 12))
    const L = [4, 5.6, 3.2][i]
    for (const s of [-1, 1]) horn.add(cyl(0.5, 0.5, L, brass, { x: x + s * 1.2, y: yv - 0.8 - L, z: 0.8 }, 8))
    horn.add(torus(1.2, 0.5, brass, { x, y: yv - 0.8 - L, z: 0.8, rz: PI }, PI, [6, 8]))
    // 按键：左上方一排指键，各有一根连杆通到阀上
    const px = -8.2 + i * 2.1
    const py = 7.4 - i * 0.35
    horn.add(ball(1, key, { x: px, y: py, z: 3.3 }, [1, 0.45, 1.3], [8, 6]))
    horn.add(rod3([px, py, 3.1], [x - 0.6, yv + 1.2, 2.5], 0.3, key, 6))
  })
  const g = new THREE.Group()
  const cy = 18.6
  g.add(P(horn, 0, cy, 0))
  // 支架：底板、卡住管圈底部的托块、顶着喇叭管的小柱
  g.add(rbox(25, 1.6, 13, stand, { x: 5, z: -0.4 }, 0.7))
  g.add(rbox(7, 6.2, 5.4, shade(stand, -0.06), { y: 1.6, z: 0.1 }, 1))
  g.add(cyl(0.8, 0.8, 7.2, stand, { x: 11, y: 1.6, z: -1.2 }, 8))
  g.add(puck(1.7, 0.9, RUBBER, { x: 11, y: 8.5, z: -1.2 }, [12, 2]))
  return fitGroup(g)
}

// ---------- 大号（落地立着）：朝上的大喇叭口连着粗主管，底下一个大弯绕到另一根粗管，再从顶上绕到前面越收越细，接到三只活塞和吹嘴；底弯坐在一块带挡块的垫座上 ----------

function tuba(p: string[]) {
  const [brass, trim, stand] = p
  const g = new THREE.Group()
  const zb = -3
  const bx = 7
  const by = 18
  // 喇叭口 + 主管（口朝上），口沿一圈卷边
  g.add(P(flare([[6.6, 0], [6.9, 10], [7.5, 28], [8.3, 43], [9.6, 55], [11.6, 64], [14.6, 70.5], [18.4, 75], [21.6, 77.6], [22.4, 78.4]], brass, 0.4, 32), bx, by, zb))
  g.add(torus(22.3, 0.7, brass, { x: bx, y: by + 78.3, z: zb, rx: PI / 2 }, PI * 2, [8, 32]))
  // 底弯（下半圈）+ 第二根粗管，接口处两道套箍
  g.add(torus(10, 6.4, brass, { x: bx - 10, y: by, z: zb, rz: PI }, PI))
  g.add(taperRod3([bx - 20, by, zb], [bx - 20, by + 52, zb], 6.2, 4.3, brass, 20))
  g.add(cyl(6.9, 6.9, 1.8, trim, { x: bx, y: by - 0.9, z: zb }, 24))
  g.add(cyl(6.7, 6.7, 1.8, trim, { x: bx - 20, y: by - 0.9, z: zb }, 24))
  // 顶弯：从后面绕到前面
  g.add(
    sweep(
      [
        [bx - 20, by + 51, zb],
        [bx - 19.5, by + 58, zb + 2.5],
        [bx - 17, by + 62, zb + 7.5],
        [bx - 14, by + 59, zb + 11.5],
        [bx - 13.5, by + 52, zb + 12.5],
      ],
      (t) => 4.3 - 1.1 * t,
      brass,
      16,
      10,
    ),
  )
  // 前面的第三根管 → 小底弯 → 上行管
  const fz = zb + 12.5
  g.add(taperRod3([-6.5, by + 53, fz], [-6.5, by + 12, fz], 3.2, 2.2, brass, 14))
  g.add(torus(3.5, 2.1, brass, { x: -3, y: by + 12, z: fz, rz: PI }, PI))
  g.add(taperRod3([0.5, by + 12, fz], [0.5, by + 34, fz], 2.1, 1.5, brass, 12))
  // 三只活塞：阀筒、上下阀盖、按杆和按钮；底下各垂一段 U 形调音管
  const vz = fz + 1
  ;[5, 10.5, 16].forEach((x, i) => {
    g.add(cyl(2.3, 2.3, 16, brass, { x, y: by + 28, z: vz }, 12))
    for (const y of [by + 27.2, by + 43.4]) g.add(cyl(2.55, 2.55, 1.2, trim, { x, y, z: vz }, 12))
    g.add(cyl(0.45, 0.45, 4.6, STEEL, { x, y: by + 44.4, z: vz }, 8))
    g.add(puck(1.7, 1, IVORY, { x, y: by + 48.6, z: vz }, [12, 2]))
    const L = [9, 13, 6][i]
    for (const s of [-1, 1]) g.add(cyl(0.9, 0.9, L, brass, { x: x + s * 1.4, y: by + 27.4 - L, z: vz }, 8))
    g.add(torus(1.4, 0.9, brass, { x, y: by + 27.4 - L, z: vz, rz: PI }, PI, [8, 8]))
  })
  // 阀间连管（下面一根接着上行管）
  g.add(cylX(1.2, 16.5, brass, 8.25, by + 33, vz - 0.4, 10))
  g.add(cylX(1.2, 11, brass, 10.5, by + 39, vz, 10))
  // 吹管：从第三只活塞绕到右上方，末端是吹嘴
  g.add(
    sweep(
      [
        [16, by + 41, vz + 2],
        [20, by + 43, vz + 1.4],
        [22.5, by + 50, vz - 1.6],
        [22.5, by + 58, vz - 4],
        [21, by + 63, vz - 1.6],
      ],
      (t) => 1 - 0.25 * t,
      brass,
      16,
      8,
    ),
  )
  g.add(taperRod3([21, by + 62.8, vz - 1.6], [19.6, by + 66, vz + 3], 0.7, 0.8, trim, 8))
  g.add(taperRod3([19.6, by + 66, vz + 3], [19, by + 67.2, vz + 5.1], 0.9, 1.9, trim, 12))
  // 支撑：两根粗管之间、活塞组和主管之间
  g.add(cylX(0.7, 8.2, trim, bx - 11.3, by + 30, zb, 8))
  g.add(cylZ(0.6, 5, trim, 10.5, by + 36, zb + 9.4, 8))
  // 垫座：垫板 + 两块挡住底弯的挡块
  g.add(rbox(34, 2, 20, stand, { x: bx - 10, z: zb }, 0.9))
  for (const s of [-1, 1]) g.add(rbox(3, 5, 12, shade(stand, 0.08), { x: bx - 10 + s * 13.7, y: 2, z: zb }, 0.8))
  return fitGroup(g)
}

// ---------- 卡林巴拇指琴：空心小木箱，面板上开圆音孔，一排中间长两边短的钢片压在琴桥上 ----------

function kalimba(p: string[]) {
  const [body, top, acc] = p
  const g = new THREE.Group()
  const w = 13.4
  const d = 18.4
  const ty = 3.2
  g.add(tray(w, ty - 0.4, d, 0.5, body))
  g.add(box(w - 1.2, 0.2, d - 1.2, shade(body, -0.3), { y: 0.5 }))
  // 面板：带真音孔的薄板，放平盖在箱口上
  const pd = d - 0.3
  g.add(holePanel(w - 0.3, pd, 0.5, top, [{ kind: 'circle', x: 0, y: pd / 2 - 4.6, r: 1.7 }], { y: ty - 0.25, z: pd / 2, rx: -PI / 2 }, 0.8))
  // 琴桥：后挡木条、垫木 + 钢枕、压住钢片的压杆和两头的立柱
  g.add(rbox(12.4, 0.7, 1, acc, { y: ty - 0.1, z: -7.4 }, 0.2))
  g.add(rbox(12.4, 0.45, 1, acc, { y: ty - 0.1, z: -5.2 }, 0.15))
  g.add(cylX(0.3, 12.4, STEEL, 0, ty + 0.52, -5.2, 8))
  g.add(cylX(0.3, 13, STEEL, 0, ty + 1.08, -6.3, 8))
  for (const s of [-1, 1]) g.add(cyl(0.4, 0.4, 1.5, STEEL, { x: s * 6.3, y: ty - 0.1, z: -6.3 }, 8))
  // 十七根钢片：中间最长，往两边一根比一根短，尾端略微翘起
  for (let i = 0; i < 17; i++) {
    const k = Math.abs(i - 8)
    const L = 12 - k * 0.56
    g.add(P(nub(0.46, 0.14, L, STEEL), (i - 8) * 0.72, ty + 0.67 + 0.06 * (L / 2), -7.9 + L / 2, -0.06))
  }
  return g
}

// ---------- 陶笛与口风琴：后面一台口风琴（小键盘、左端接一根软吹管绕到前面），前面一只十二孔陶笛带一圈挂绳 ----------

/** 陶笛的截面半径：沿笛身 s（0 = 大头） */
const OCA: V2[] = [[0.01, 0], [1.6, 0.3], [2.9, 1.6], [3.4, 3.6], [3.3, 6], [2.7, 9], [1.9, 12], [1.1, 14.4], [0.5, 15.4], [0.01, 15.6]]
function ocaRadius(s: number) {
  for (let i = 1; i < OCA.length; i++) if (s <= OCA[i][1]) return OCA[i - 1][0] + ((OCA[i][0] - OCA[i - 1][0]) * (s - OCA[i - 1][1])) / (OCA[i][1] - OCA[i - 1][1])
  return 0.01
}

function ocarinaSet(p: string[]) {
  const [body, glaze, cord] = p
  const g = new THREE.Group()
  // 口风琴：琴身、两头的深色端盖、白键一整条 + 键缝 + 黑键
  g.add(rbox(40, 3.4, 10, body, { z: -4 }, 1.3))
  for (const s of [-1, 1]) g.add(rbox(2.6, 3.7, 10.3, shade(body, -0.12), { x: s * 19, y: -0.01, z: -4 }, 1.2))
  const kx0 = 1 - 17.2
  const kw = 34.4 / 19
  g.add(rbox(34.4, 1, 7.2, IVORY, { x: 1, y: 3, z: -3.6 }, 0.25))
  for (let i = 1; i < 19; i++) g.add(noOutline(box(0.14, 0.2, 7, '#b5ae9c', { x: kx0 + i * kw, y: 3.86, z: -3.6 })))
  for (let i = 0; i < 18; i++) if ([0, 1, 2, 4, 5].includes(i % 7)) g.add(nub(1, 0.7, 4.4, DARK, { x: kx0 + (i + 1) * kw, y: 3.9, z: -5 }))
  // 吹口 + 软吹管（绕到前面，末端是吹嘴）
  g.add(cylX(1, 2.6, shade(body, -0.12), -21, 2, -6, 12))
  g.add(
    sweep(
      [
        [-21.8, 2, -6],
        [-22.8, 1.3, -3.5],
        [-22.3, 0.7, 1.5],
        [-19, 0.62, 5.6],
        [-13, 0.62, 7.4],
        [-7.5, 0.62, 6.2],
      ],
      0.6,
      '#e9e6df',
      22,
      6,
    ),
  )
  // 吹嘴粗的一头抬高一点：整支贴着桌面，不把琴身垫起来
  g.add(taperRod3([-7.7, 0.66, 6.25], [-5.4, 0.9, 5.5], 0.62, 0.85, shade(body, -0.12), 10))
  // 陶笛：一头大一头尖的扁圆身子（车削后压扁、放倒），侧面伸出吹嘴，顶上两组指孔
  const oc = new THREE.Group()
  const ky = 0.62
  const hy = 3.4 * ky
  const shellM = smoothLathe(OCA, glaze, 20, 18)
  shellM.scale.set(ky, 1, 1)
  oc.add(P(shellM, 0, hy, 0, 0, 0, -PI / 2))
  oc.add(rbox(2.6, 1.3, 3.6, glaze, { x: 4, y: hy - 0.65, z: 4.1 }, 0.5))
  oc.add(noOutline(box(1.4, 0.3, 0.2, HOLE, { x: 4, y: hy - 0.15, z: 5.85 })))
  const holes: [number, number, number][] = [[3, -1.2, 0.42], [4.6, -1.6, 0.42], [6.2, -1.5, 0.42], [7.8, -1.1, 0.42], [9.6, -0.9, 0.38], [11, -0.5, 0.36], [12.3, -0.2, 0.34], [13.4, 0.1, 0.3], [5, 0.7, 0.26], [10.2, 0.8, 0.26]]
  for (const [s, z, r] of holes) {
    const rr = ocaRadius(s)
    oc.add(noOutline(ball(r, HOLE, { x: s, y: hy + ky * Math.sqrt(Math.max(0, rr * rr - z * z)) - 0.02, z }, [1, 0.35, 1], [6, 4])))
  }
  // 挂绳：系在笛尾，在桌面上绕成一圈
  oc.add(
    tube(
      [
        [15.2, hy, 0],
        [18.5, 0.4, -1.5],
        [22, 0.4, 1],
        [22.4, 0.4, 4.4],
        [19.6, 0.4, 6],
        [17, 0.45, 3.2],
      ],
      0.24,
      cord,
      { seg: 32, radial: 5, closed: true },
    ),
  )
  oc.add(ball(0.5, cord, { x: 15.3, y: hy, z: 0 }))
  g.add(P(oc, -2.6, 0, 5, 0, 0.1))
  return fitGroup(g)
}

// ---------- 落地麦克风架：三脚底座、两节伸缩立杆、带配重的斜臂，臂端夹着一支麦克风，前面一片防喷罩，线缠着斜臂和立杆绕下来在地上盘一圈 ----------

function micStand(p: string[]) {
  const [metal, mic, acc] = p
  const g = new THREE.Group()
  // 三脚底座 + 立杆（下粗上细，中间一只锁紧环）
  for (const a of [PI / 2, PI / 2 + (PI * 2) / 3, PI / 2 - (PI * 2) / 3]) {
    const x = Math.cos(a) * 30
    const z = Math.sin(a) * 30
    g.add(rod3([0, 20, 0], [x, 1.3, z], 1, metal, 8))
    g.add(ball(1.5, RUBBER, { x, y: 1.5, z }, undefined, [8, 6]))
  }
  g.add(cyl(2.2, 2.2, 5, metal, { y: 17 }, 12))
  g.add(cyl(1.2, 1.2, 72, metal, { y: 20 }, 10))
  g.add(cyl(1.8, 1.8, 4.5, RUBBER, { y: 90 }, 12))
  g.add(cyl(0.85, 0.85, 45, STEEL, { y: 92 }, 10))
  // 斜臂：转轴 + 旋钮，后端一只配重
  const b0: V3 = [0, 125.5, -15]
  const b1: V3 = [0, 150, 20]
  g.add(cylX(1.9, 3.4, RUBBER, 0, 136, 0, 12))
  g.add(cylX(1.2, 2.6, RUBBER, 2.8, 136, 0, 10))
  g.add(rod3(b0, b1, 0.7, STEEL, 8))
  g.add(rod3([0, 124.1, -17], [0, 127.6, -12], 1.7, RUBBER, 12))
  // 话筒夹 + 麦克风（朝前略低头）：尾插、渐粗的筒身、一圈色环、网头
  g.add(rod3(b1, [0, 151.6, 22], 0.9, RUBBER, 8))
  g.add(rbox(4.6, 2.8, 4, RUBBER, { y: 150.2, z: 22 }, 0.9))
  g.add(taperRod3([0, 153.1, 12.8], [0, 152.6, 15.6], 0.9, 1, DARK, 10))
  g.add(taperRod3([0, 152.6, 15.5], [0, 150.3, 29], 1.3, 1.9, mic, 14))
  g.add(taperRod3([0, 150.35, 28.6], [0, 150.15, 29.8], 2.1, 2.1, acc, 14))
  g.add(ball(3, '#9aa0a8', { y: 149.8, z: 31.8 }))
  // 防喷罩：圆圈 + 半透明的网面，鹅颈管夹在斜臂上
  g.add(torus(6.5, 0.45, acc, { y: 149.3, z: 37.5 }, PI * 2, [6, 24]))
  g.add(ghost(cylZ(6.3, 0.25, '#30323a', 0, 149.3, 37.5, 24), '#30323a', 0.5))
  g.add(
    sweep(
      [
        [0, 142.9, 37.5],
        [0.5, 138.4, 35.4],
        [1.5, 136.4, 28],
        [1.5, 139.6, 20],
        [0.6, 144, 12.4],
      ],
      0.45,
      DARK,
      20,
      6,
    ),
  )
  g.add(rbox(2.6, 2.6, 2.6, RUBBER, { y: 143.1, z: 12 }, 0.6))
  // 线：从麦克风尾巴出来，绕斜臂两圈、绕立杆三圈半，落到地上盘成一圈
  const dir = new THREE.Vector3(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]).normalize()
  const side = new THREE.Vector3(1, 0, 0)
  const up = new THREE.Vector3().crossVectors(dir, side)
  const pts: V3[] = [
    [0, 153.3, 12.2],
    [0.9, 150.4, 10],
  ]
  for (let k = 0; k <= 8; k++) {
    const s = 30 - k * 2.6
    const a = (k * PI) / 2
    const v = new THREE.Vector3(...b0).addScaledVector(dir, s).addScaledVector(side, Math.cos(a) * 1.05).addScaledVector(up, Math.sin(a) * 1.05)
    pts.push([v.x, v.y, v.z])
  }
  for (let k = 0; k <= 14; k++) {
    const a = (k * PI) / 2
    pts.push([Math.cos(a) * 1.55, 131 - k * 7.5, Math.sin(a) * 1.55])
  }
  pts.push([3.4, 18, 4], [8, 6, 9.5])
  for (let k = 0; k <= 13; k++) {
    const a = (k * PI) / 4 - PI * 0.75
    pts.push([10 + Math.cos(a) * 5, 0.5 + k * 0.06, 14.5 + Math.sin(a) * 5])
  }
  g.add(tube(pts, 0.35, DARK, { seg: pts.length * 3, radial: 5 }))
  return fitGroup(g)
}

// ---------- 乐谱堆与调音器：三本合着的乐谱错开摞着，最上面摊开一本（两页五线谱），页角上立着一只夹式调音器 ----------

/** 一页五线谱：几行谱线 + 小节线 + 一串音符 */
function drawStaff(seed: number) {
  return (c: CanvasRenderingContext2D, W: number, H: number) => {
    c.fillStyle = PAPER
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#3a3836'
    c.fillRect(W * 0.3, H * 0.05, W * 0.4, H * 0.018)
    let s = seed * 7919
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const gap = H * 0.017
    for (let k = 0; k < 6; k++) {
      const y0 = H * (0.14 + k * 0.14)
      for (let l = 0; l < 5; l++) c.fillRect(W * 0.08, y0 + l * gap, W * 0.84, Math.max(1, H * 0.004))
      for (const bx of [0.08, 0.36, 0.64, 0.915]) c.fillRect(W * bx, y0, Math.max(1, W * 0.006), gap * 4)
      for (let n = 0; n < 8; n++) {
        const x = W * (0.14 + n * 0.097)
        const y = y0 + gap * Math.floor(rnd() * 8) * 0.5
        c.beginPath()
        c.ellipse(x, y, gap * 0.8, gap * 0.58, -0.4, 0, PI * 2)
        c.fill()
        c.fillRect(x + gap * 0.62, y - gap * 3.2, Math.max(1, W * 0.007), gap * 3.2)
      }
    }
  }
}

function sheetPile(p: string[]) {
  const [coverA, coverB, tuner] = p
  const g = new THREE.Group()
  // 三本合着的乐谱：上下封皮夹着纸芯，书脊在左
  const bh = 0.8
  const books: [string, number, number, number][] = [
    [coverA, 0, 0, 0.03],
    [coverB, 0.5, -0.4, -0.05],
    [shade(coverA, 0.14, -0.08), -0.4, 0.3, 0.02],
  ]
  books.forEach(([cover, x, z, ry], i) => {
    const b = G(box(30, 0.16, 22, cover), box(29.5, bh - 0.3, 21.6, PAPER, { x: 0.1, y: 0.15 }), box(30, 0.16, 22, cover, { y: bh - 0.16 }), box(0.4, bh, 22, cover, { x: -14.85, y: -0.001 }))
    g.add(P(b, x, i * bh, z, 0, ry))
  })
  // 摊开的一本：左右两页从书脊往外略微翘起
  const y0 = books.length * bh
  const page = (s: number) => {
    // 纸页 0.4 厚（体素按 0.1 取整），谱面浮出 0.1
    const pg = G(box(15.2, 0.4, 21.4, PAPER, { x: s * 7.6 }), paintPanel(13.6, 19.6, `mw-staff-${s}`, drawStaff(s + 2), { x: s * 7.6, y: 0.5, z: 9.8, rx: -PI / 2 }))
    return P(pg, 0, y0 + 0.02, 0, 0, 0, s * 0.03)
  }
  const right = page(1)
  g.add(page(-1), right)
  g.add(box(0.5, 0.3, 21.4, shade(coverB, -0.1), { y: y0 - 0.1 }))
  // 夹式调音器：站在右页的页角上——夹子（上下两片）、小球关节、带发光屏的表头
  const tn = new THREE.Group()
  tn.add(rbox(2.2, 0.9, 4.4, tuner, {}, 0.35))
  tn.add(P(rbox(2.2, 0.8, 4.6, tuner, {}, 0.35), 0, 1.5, -0.1, 0.16))
  tn.add(cylX(0.55, 2.6, DARK, 0, 1, -1.5, 8))
  tn.add(cyl(0.45, 0.45, 1.3, DARK, { y: 1.7, z: -1.3 }, 8))
  tn.add(ball(0.7, DARK, { y: 3.1, z: -1.3 }))
  const head = G(rbox(4.6, 3, 1, tuner, { y: -1.5 }, 0.45), lit(box(3.6, 2, 0.3, '#9fe0c8', { y: -1, z: 0.42 }), '#9fe0c8', 0.6))
  tn.add(P(head, 0, 4.3, -1.1, -0.4))
  right.add(P(tn, 10.6, 0.4, 5.4, 0, -0.35))
  return fitGroup(g)
}

// ---------- 配色 ----------

const ERHU_PALS: Pal[] = [
  ['chinese', [CN.rosewood, '#b9a56a', CN.walnut]],
  ['chinese', ['#3a2622', '#a8a078', CN.rosewood]],
  ['japanese', [J.dark, '#c2b07a', J.wood]],
  ['classic', ['#7a4630', '#b8a877', CL.walnut]],
]
const PIPA_PALS: Pal[] = [
  ['chinese', [CN.rosewood, '#e6cf9c', CN.walnut]],
  ['chinese', ['#3a2622', '#dcc08a', CN.rosewood]],
  ['japanese', [J.dark, J.hinoki, J.wood]],
  ['classic', ['#8a4a30', '#ecd9ae', CL.walnut]],
]
const QIN_PALS: Pal[] = [
  ['chinese', [CN.ink, CN.rosewood, CN.lacquer]],
  ['chinese', ['#4a2a22', CN.walnut, CN.jade]],
  ['japanese', [J.sumi, J.dark, J.ai]],
  ['classic', ['#3a2a26', CL.walnut, CL.gold]],
]
const DIZI_PALS: Pal[] = [
  ['chinese', [CN.rosewood, '#d8b56a', CN.lacquer]],
  ['chinese', [CN.walnut, '#c79c58', CN.jade]],
  ['japanese', [J.dark, '#d2b274', J.shu]],
  ['nordic', [N.oak, '#e2c88a', N.blue]],
]
const HULUSI_PALS: Pal[] = [
  ['chinese', ['#c98a3c', '#8a5a34', CN.rosewood, CN.lacquer]],
  ['chinese', ['#8a4a2a', '#d8b56a', CN.walnut, '#d9b45a']],
  ['japanese', ['#d9b46a', J.dark, J.wood, J.shu]],
  ['farmhouse', ['#e0c080', '#a8763e', F.oak, F.barn]],
]
const YANGQIN_PALS: Pal[] = [
  ['chinese', [CN.rosewood, '#e6cf9c', CN.ink]],
  ['chinese', ['#3a2622', '#dcc08a', CN.walnut]],
  ['classic', ['#8a4a30', '#ecd9ae', '#2e2f33']],
  ['modern', [M.walnut, '#e9d6ac', M.silver]],
]
const CAJON_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL, N.gray]],
  ['modern', [M.black, M.walnut, M.char]],
  ['retro', [R.caramel, '#ecd2a4', R.red]],
  ['industrial', [I.walnut, I.leather, I.iron]],
  ['cute', [C.woodL, C.pink, C.mint]],
]
const DJEMBE_PALS: Pal[] = [
  ['retro', [R.caramel, '#f1e3c6', '#2e2f33']],
  ['industrial', [I.walnut, '#efe2c8', I.rust]],
  ['nordic', [N.oak, N.white, N.blue]],
  ['farmhouse', [F.oak, '#f1e6cf', F.barn]],
  ['cute', [C.woodD, C.cream, C.red]],
]
const HANDPAN_PALS: Pal[] = [
  ['modern', ['#55616e', N.oak, M.black]],
  ['retro', ['#8a6a42', R.caramel, '#2e2f33']],
  ['japanese', ['#3f4f72', J.wood, J.sumi]],
  ['industrial', ['#b59a62', I.walnut, I.iron]],
]
const XYLO_PALS: Pal[] = [
  ['classic', ['#8a4b2a', '#d4b25a', '#2b2b2e', CL.wine]],
  ['modern', [M.walnut, M.silver, M.char, '#3f7fd8']],
  ['nordic', [N.oak, N.gray, N.white, N.mustard]],
  ['industrial', [I.walnut, I.steel, I.iron, I.rust]],
  ['cute', [C.wood, C.lemon, C.white, C.pink]],
]
const BASS_PALS: Pal[] = [
  ['retro', ['#a85a2a', '#2e2f33', '#2a2220']],
  ['classic', ['#8a4a26', CL.gold, '#2a2220']],
  ['nordic', ['#c98a4a', N.gray, '#3a2a22']],
  ['modern', ['#3a2a26', M.silver, '#1e1e20']],
]
const TROMBONE_PALS: Pal[] = [
  ['retro', ['#d4b25a', '#2e2f33', '#d5d9de']],
  ['modern', ['#c9ced6', M.black, '#d4b25a']],
  ['classic', ['#c9905e', '#2e2f33', CL.gold]],
  ['industrial', [CN.brass, I.iron, I.steel]],
]
const HORN_PALS: Pal[] = [
  ['retro', ['#d4b25a', '#d5d9de', R.caramel]],
  ['modern', ['#c9ced6', '#d4b25a', M.char]],
  ['classic', ['#c9905e', CL.gold, CL.walnut]],
  ['chinese', [CN.brass, CN.ivory, CN.rosewood]],
]
const TUBA_PALS: Pal[] = [
  ['retro', ['#d4b25a', '#d5d9de', '#2e2f33']],
  ['modern', ['#c9ced6', '#d4b25a', M.char]],
  ['classic', ['#c9905e', CL.gold, CL.walnut]],
  ['industrial', [CN.brass, I.steel, I.iron]],
]
const KALIMBA_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL, '#7a5a43']],
  ['modern', [M.walnut, '#8f6c52', M.black]],
  ['retro', [R.caramel, '#c98a4e', R.teal]],
  ['cute', [C.pink, C.sakura, C.white]],
  ['japanese', [J.wood, J.hinoki, J.dark]],
]
const OCARINA_PALS: Pal[] = [
  ['nordic', [N.blue, '#3d5a80', N.mustard]],
  ['cute', [C.pink, C.mint, C.lilac]],
  ['retro', [R.teal, R.caramel, R.cream]],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['modern', [M.char, '#2f8f8a', '#e8483f']],
]
const MIC_PALS: Pal[] = [
  ['modern', [M.black, M.silver, '#e8483f']],
  ['modern', [M.silver, M.char, '#3f7fd8']],
  ['industrial', [I.iron, I.steel, I.rust]],
  ['retro', ['#2e2f33', '#d4b25a', R.red]],
  ['cute', [C.white, C.pink, C.lilac]],
]
const SHEET_PALS: Pal[] = [
  ['classic', [CL.wine, CL.navy, '#2e2f33']],
  ['nordic', [N.blue, N.mustard, N.white]],
  ['modern', [M.char, '#3f7fd8', '#e8483f']],
  ['retro', [R.teal, R.orange, R.cream]],
  ['japanese', [J.ai, J.shu, J.sumi]],
]

const INSTRUMENT: Partial<AssetDef> = { type: 'instrument', tags: ['hobby:music'] }

export const MUSIC_WORLD: AssetDef[] = [
  define('mw-erhu', '二胡（支架）', 'music', [20, 20, 83], ERHU_PALS, erhu, { ...INSTRUMENT, mats: ['wood', 'leather', 'wood'] }),
  define('mw-pipa', '琵琶（支架）', 'music', [33, 23, 101], PIPA_PALS, pipa, { ...INSTRUMENT, mats: ['wood', 'wood', 'wood'] }),
  define('mw-guqin', '古琴（带琴桌）', 'music', [126, 38, 73], QIN_PALS, guqin, { ...INSTRUMENT, mats: ['paint', 'wood', 'fabric'] }),
  define('mw-dizi', '笛箫架', 'music', [66, 11, 61], DIZI_PALS, diziRack, { ...PROP, ...INSTRUMENT, mats: ['wood', 'wood', 'fabric'] }),
  define('mw-hulusi', '葫芦丝', 'music', [12, 12, 46], HULUSI_PALS, hulusi, { ...PROP, ...INSTRUMENT, mats: ['wood', 'wood', 'wood', 'fabric'] }),
  define('mw-yangqin', '扬琴', 'music', [100, 45, 80], YANGQIN_PALS, yangqin, { ...INSTRUMENT, mats: ['wood', 'wood', 'metal'] }),
  define('mw-cajon', '卡洪鼓', 'music', [30, 30, 50], CAJON_PALS, cajon, { ...INSTRUMENT, mats: ['wood', 'wood', 'fabric'] }),
  define('mw-djembe', '非洲鼓', 'music', [34, 34, 58], DJEMBE_PALS, djembe, { ...INSTRUMENT, mats: ['wood', 'leather', 'fabric'] }),
  define('mw-handpan', '手碟', 'music', [54, 54, 37], HANDPAN_PALS, handpan, { ...INSTRUMENT, mats: ['metal', 'wood', 'plastic'] }),
  define('mw-xylophone', '木琴', 'music', [130, 60, 88], XYLO_PALS, xylophone, { ...INSTRUMENT, mats: ['wood', 'metal', 'metal', 'fabric'] }),
  define('mw-double-bass', '低音提琴（支架）', 'music', [67, 53, 187], BASS_PALS, doubleBass, { ...INSTRUMENT, mats: ['wood', 'metal', 'wood'] }),
  define('mw-trombone', '长号（支架）', 'music', [33, 26, 115], TROMBONE_PALS, trombone, { ...INSTRUMENT, mats: ['metal', 'metal', 'metal'] }),
  define('mw-french-horn', '圆号', 'music', [37, 26, 38], HORN_PALS, frenchHorn, { ...PROP, ...INSTRUMENT, mats: ['metal', 'metal', 'wood'] }),
  define('mw-tuba', '低音大号', 'music', [50, 46, 97], TUBA_PALS, tuba, { ...INSTRUMENT, mats: ['metal', 'metal', 'plastic'] }),
  define('mw-kalimba', '卡林巴拇指琴', 'music', [13.4, 18.4, 4.7], KALIMBA_PALS, kalimba, { ...PROP, ...INSTRUMENT, mats: ['wood', 'wood', 'wood'] }),
  define('mw-ocarina', '陶笛与口风琴', 'music', [44, 20, 5], OCARINA_PALS, ocarinaSet, { ...PROP, ...INSTRUMENT, mats: ['plastic', 'ceramic', 'fabric'] }),
  define('mw-mic-stand', '落地麦克风架', 'music', [55, 56, 157], MIC_PALS, micStand, { type: 'mic', tags: ['hobby:music'], mats: ['metal', 'metal', 'plastic'] }),
  define('mw-sheet-pile', '乐谱堆与调音器', 'music', [32, 24, 9], SHEET_PALS, sheetPile, { ...PROP, type: 'music-accessory', tags: ['hobby:music'], mats: ['paper', 'paper', 'plastic'] }),
]
