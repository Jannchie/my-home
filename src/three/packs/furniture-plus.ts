// 再补一批家具：高猫爬架、小猫爬柱、铁线杂志篮、阶梯杂志架、弯木衣帽架、蝴蝶翻板餐桌、梯形书桌、木谱架、
// 独立吧台、藤编三折屏风、旋转书架、猫窝边几。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；顶面、层板留空并声明 surface / surfaces。新素材直接在 def 里写 type / tags / mats。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus } from '../toon'
import { C, rectPoly, shell, type AssetDef, type Poly } from '../kit'
import { P, cylZ, rod3, strutBox, tube } from '../geo'
import { CL, CN, F, I, J, M, N, R, define, hookRing, type Pal } from '../packkit'

const SISAL = '#dcc49a'
const PAPER = '#f4f1ea'

/** 剑麻柱：圆柱 + 两头深一点的绑绳圈；从 y0 立到 y1 */
function sisalPost(x: number, z: number, y0: number, y1: number, r = 5) {
  const g = new THREE.Group()
  g.add(cyl(r, r, y1 - y0, SISAL, { x, y: y0, z }, 16))
  for (const y of [y0 + 1.5, y1 - 2.5]) g.add(cyl(r + 0.3, r + 0.3, 1, shade(SISAL, -0.18), { x, y, z }, 16))
  return g
}

/** 一根细绳吊着的毛球（猫玩具）：从 (x, y, z) 往下垂 len */
function danglingToy(x: number, y: number, z: number, len: number, color: string) {
  const g = new THREE.Group()
  g.add(cyl(0.25, 0.25, len, M.char, { x, y: y - len, z }, 4))
  g.add(ball(3, color, { x, y: y - len - 2.6, z }))
  return g
}

// ---------- 高猫爬架：底板 + 猫屋 + 三根剑麻柱、两层圆台、顶上的软垫瞭望台和一只圆碗窝 ----------

const TREE_W = 70
const TREE_D = 50
const TREE_H = 172
function catTreeTall(p: string[]) {
  const [carpet, cushion, toy] = p
  const g = new THREE.Group()
  g.add(rbox(TREE_W, 4, TREE_D, carpet, {}, 1.6))
  // 底板上的剑麻抓垫
  g.add(rbox(24, 0.8, 18, SISAL, { x: 20, y: 4, z: 13 }, 0.3))
  // 猫屋：空心盒子，正面圆洞、侧面小圆窗，里面一块软垫；屋顶就是第一层平台
  const house = shell(34, 30, 30, 2, carpet, { front: [{ kind: 'circle', x: 0, y: 14, r: 8.5 }], left: [{ kind: 'circle', x: 3, y: 18, r: 3.6 }] })
  house.position.set(-17, 4, 3)
  g.add(house)
  g.add(puck(11, 3, cushion, { x: -17, y: 6, z: 3 }))
  // 柱子：右边一根到中层圆台，猫屋顶上一根到圆碗窝，中层圆台上一根到瞭望台
  g.add(sisalPost(18, -10, 4, 100))
  g.add(sisalPost(-17, 0, 34, 128))
  g.add(sisalPost(18, -6, 104, 164, 4.4))
  g.add(puck(17, 4, carpet, { x: 18, y: 100, z: -6 }))
  // 圆碗窝：碗 + 里面的软垫
  g.add(cup(16.5, 13, 9, 1.6, carpet, { x: -17, y: 128, z: 0 }))
  g.add(puck(13, 3, cushion, { x: -17, y: 129.6, z: 0 }))
  // 瞭望台：圆台 + 扁软垫
  g.add(puck(16, 4, carpet, { x: 18, y: 164, z: -6 }))
  g.add(ball(13, cushion, { x: 18, y: 168, z: -6 }, [1, 0.28, 1]))
  // 中层圆台边上吊着的毛球
  g.add(danglingToy(31, 100, 2, 20, toy))
  return g
}

// ---------- 小猫爬柱：方底座 + 一根剑麻柱 + 顶上一块软垫圆台，边上吊一只毛球 ----------

const POST_W = 40
const POST_H = 86
function catPost(p: string[]) {
  const [carpet, cushion, toy] = p
  const g = new THREE.Group()
  g.add(rbox(POST_W, 4, POST_W, carpet, {}, 1.6))
  g.add(sisalPost(0, 0, 4, 80, 5.5))
  g.add(puck(17, 4, carpet, { y: 80 }))
  g.add(ball(14, cushion, { y: 84 }, [1, 0.16, 1]))
  g.add(danglingToy(13, 80, 6, 22, toy))
  return g
}

// ---------- 杂志（竖放在杂志篮里的一本）：封面朝 ±x，顶上一条刊头色带 ----------

function magazine(w: number, h: number, cover: string, band: string) {
  const g = new THREE.Group()
  g.add(rbox(1.2, h, w, cover, {}, 0.2))
  g.add(rbox(1.6, 5, w + 0.4, band, { y: h - 7 }, 0.2))
  return g
}
const MAG_COLORS: [string, string][] = [
  ['#e8e2d6', '#c8473a'],
  ['#2f3b4c', '#e3b549'],
  ['#f4f1ea', '#2f8f8a'],
  ['#a9bfa3', '#f7f5f0'],
  ['#d65a3c', '#f6f0e1'],
]

// ---------- 铁线杂志篮：细铁线框 + 中间隔板和提手，两格里各竖着几本杂志 ----------

const BASKET_W = 38
const BASKET_D = 28
const BASKET_H = 52
const BASKET_RIM = 34
function magazineBasket(p: string[]) {
  const [wire, floor] = p
  const g = new THREE.Group()
  const hw = BASKET_W / 2 - 1
  const hd = BASKET_D / 2 - 1
  const r = 0.45
  // 四只小脚 + 竖框
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rod3([sx * hw, 0.5, sz * hd], [sx * hw, BASKET_RIM, sz * hd], r, wire, 6))
      g.add(cyl(0.9, 0.9, 1, wire, { x: sx * hw, z: sz * hd }, 6))
    }
  // 上下两圈框
  for (const y of [3, BASKET_RIM]) {
    for (const s of [-1, 1]) {
      g.add(rod3([-hw, y, s * hd], [hw, y, s * hd], r, wire, 6))
      g.add(rod3([s * hw, y, -hd], [s * hw, y, hd], r, wire, 6))
    }
  }
  // 竖铁线：前后两面各 7 根（正中那根粗一点，兼做隔板的两边），两侧各 4 根
  const upright = (x: number, z: number, rr: number) => g.add(rod3([x, 3, z], [x, BASKET_RIM, z], rr, wire, 6))
  for (let i = 1; i < 8; i++) for (const s of [-1, 1]) upright(-hw + (2 * hw * i) / 8, s * hd, i === 4 ? r : r * 0.7)
  for (let i = 1; i < 5; i++) for (const s of [-1, 1]) upright(s * hw, -hd + (2 * hd * i) / 5, r * 0.7)
  // 底板
  g.add(rbox(2 * hw - 1, 0.8, 2 * hd - 1, floor, { y: 2.6 }, 0.3))
  // 中间隔板（正中一根竖线 + 一根横线）和提手
  upright(0, 0, r * 0.7)
  g.add(rod3([0, BASKET_RIM * 0.55, -hd], [0, BASKET_RIM * 0.55, hd], r * 0.7, wire, 6))
  g.add(tube([[0, BASKET_RIM, -hd], [0, BASKET_H - 4, -hd * 0.55], [0, BASKET_H - 1, 0], [0, BASKET_H - 4, hd * 0.55], [0, BASKET_RIM, hd]], 0.7, wire, { seg: 20 }))
  // 两格里的杂志：左格三本、右格两本，略微歪着
  const mags: [x: number, tilt: number][] = [
    [-14.5, 0.1],
    [-10.5, 0.06],
    [-6, -0.05],
    [5, 0.08],
    [9.5, 0.02],
  ]
  mags.forEach(([x, tilt], i) => g.add(P(magazine(22, 32, ...MAG_COLORS[i]), x, 3.4, 0, 0, 0, tilt)))
  return g
}

// ---------- 阶梯杂志架：两侧木框（后柱竖直、前柱斜靠），三层斜放的展示板，封面朝前 ----------

const RACK_W = 49
const RACK_D = 28
const RACK_H = 92
/** 前柱的前沿：从地面 z = FRONT0 斜到顶上 z = FRONT1 */
const FRONT0 = 12.5
const FRONT1 = -10.5
const frontZ = (y: number) => FRONT0 + ((FRONT1 - FRONT0) * y) / RACK_H
const TIER_YS = [4, 34, 64]
const TIER_TILT = -0.28
const TIER_LEN = 24
function magazineRack(p: string[]) {
  const [wood, frame] = p
  const g = new THREE.Group()
  const sx = RACK_W / 2 - 1.2
  for (const s of [-1, 1]) {
    g.add(rbox(2.4, RACK_H, 3, frame, { x: s * sx, z: -12.5 }, 0.6))
    g.add(strutBox([s * sx, 0.5, FRONT0], [s * sx, RACK_H - 1.5, FRONT1 + 0.5], 2.4, 3, frame))
    // 顶上把前后柱连起来的一小段
    g.add(rbox(2.4, 3, 6, frame, { x: s * sx, y: RACK_H - 3, z: -11 }, 0.6))
  }
  // 底部后侧的横撑
  g.add(rbox(RACK_W - 4.8, 3, 2, frame, { y: 1.5, z: -12.5 }, 0.5))
  // 三层展示板：斜板 + 前沿挡条，板上两本杂志
  TIER_YS.forEach((y, i) => {
    const t = new THREE.Group()
    t.add(rbox(RACK_W - 4.8, TIER_LEN, 1.2, wood, {}, 0.4))
    t.add(rbox(RACK_W - 4.8, 4, 2, shade(wood, -0.08), { y: -0.5, z: 1.6 }, 0.4))
    for (const k of [0, 1]) {
      const [cover, band] = MAG_COLORS[(i * 2 + k) % MAG_COLORS.length]
      const mx = (k ? 1 : -1) * 10.6
      t.add(rbox(19, 22, 0.5, cover, { x: mx, y: 1, z: 0.9 }, 0.15))
      t.add(rbox(19.4, 4, 0.7, band, { x: mx, y: 17.5, z: 0.95 }, 0.15))
    }
    g.add(P(t, 0, y, frontZ(y) - 2.1, TIER_TILT))
  })
  return g
}

// ---------- 弯木衣帽架：中柱 + 四条外弯的落地腿、半高的伞圈、上下两层弯钩 ----------

const BENT_R = 24
const BENT_H = 180
const BENT_UP = { y: 168, r: 17 }
const BENT_LOW = { y: 150, r: 13 }
const BENT_UP_A = [0.25, 1.82, 3.39, 4.96]
const BENT_LOW_A = BENT_UP_A.map((a) => a + Math.PI / 4)
/** 往外弯、末端上翘的一只钩：从柱子上 y 处伸出，末端在半径 r */
function bentHook(a: number, y: number, r: number, color: string) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const at = (k: number, dy: number): [number, number, number] => [c * r * k, y + dy, s * r * k]
  const g = new THREE.Group()
  g.add(tube([at(0.08, 6), at(0.45, 1), at(0.85, -1.5), at(1, 3)], 1.1, color, { seg: 16 }))
  g.add(ball(1.5, color, { x: c * r, y: y + 3.4, z: s * r }))
  return g
}
function bentwoodStand(p: string[]) {
  const [wood, , knob] = p
  const g = new THREE.Group()
  g.add(cyl(2, 2.4, BENT_H - 4, wood, {}, 16))
  g.add(ball(3, knob, { y: BENT_H - 3 }))
  // 伞圈：一圈弯木
  g.add(torus(15, 1, wood, { y: 48, rx: Math.PI / 2 }))
  // 四个斜角方向：落地腿（从中柱上 30cm 处往外弯到地面）+ 伞圈的辐条
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const pt = (r: number, y: number): [number, number, number] => [Math.cos(a) * r, y, Math.sin(a) * r]
    g.add(tube([pt(1.5, 30), pt(8, 18), pt(17, 6), pt(BENT_R - 2, 1.4)], 1.4, wood, { seg: 18 }))
    const [fx, , fz] = pt(BENT_R - 2, 0)
    g.add(cyl(1.6, 1.8, 1.4, shade(wood, -0.2), { x: fx, z: fz }, 10))
    g.add(rod3(pt(2, 48), pt(15, 48), 0.8, wood))
  }
  for (const a of BENT_UP_A) g.add(bentHook(a, BENT_UP.y, BENT_UP.r, wood))
  for (const a of BENT_LOW_A) g.add(bentHook(a, BENT_LOW.y, BENT_LOW.r, wood))
  return g
}

// ---------- 蝴蝶翻板餐桌（两块翻板都支起来）：中段四条车旋腿，两侧各一条摆出来的门腿托着翻板 ----------

const GATE_W = 120
const GATE_D = 80
const GATE_H = 74
const GATE_MID = 40
/** 车旋腿：上方块、中间两段鼓、下面小脚 */
function turnedLeg(x: number, z: number, h: number, color: string) {
  const g = new THREE.Group()
  g.add(cyl(1.6, 1.8, 4, color, { x, z }, 12))
  g.add(cyl(2.2, 1.6, h * 0.35, color, { x, y: 4, z }, 12))
  g.add(ball(2.7, color, { x, y: 4 + h * 0.35 + 1, z }, [1, 0.8, 1]))
  g.add(cyl(1.8, 2.2, h * 0.4, color, { x, y: 5 + h * 0.35, z }, 12))
  g.add(rbox(4.4, h - (5 + h * 0.75), 4.4, color, { x, y: 5 + h * 0.75, z }, 0.6))
  return g
}
function gatelegTable(p: string[]) {
  const [top, leg] = p
  const g = new THREE.Group()
  const ly = GATE_H - 3
  // 桌面：中段 + 两块翻板，接缝处一道细缝
  g.add(rbox(GATE_W, 3, GATE_D, top, { y: ly }, 1))
  for (const s of [-1, 1]) g.add(rbox(0.5, 3.2, GATE_D - 0.6, shade(top, -0.3), { x: (s * GATE_MID) / 2, y: ly - 0.1 }, 0.1))
  // 中段的框（裙板）和四条腿
  const fx = GATE_MID / 2 - 3
  const fz = GATE_D / 2 - 6
  for (const s of [-1, 1]) {
    g.add(rbox(GATE_MID - 6, 7, 2, leg, { y: ly - 7, z: s * fz }, 0.5))
    g.add(rbox(2, 7, GATE_D - 12, leg, { x: s * fx, y: ly - 7 }, 0.5))
    // 下横档围一圈：两侧的那根是门腿转轴的横档接上来的地方
    g.add(rbox(GATE_MID - 6, 2.4, 2.4, leg, { y: 8, z: s * fz }, 0.4))
    g.add(rbox(2.4, 2.4, GATE_D - 12, leg, { x: s * fx, y: 8 }, 0.4))
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(turnedLeg(sx * fx, sz * fz, ly, leg))
  // 门腿：摆到翻板中间下面，上下两根横档连回中段的框
  for (const s of [-1, 1]) {
    const gx = s * (GATE_W / 2 - 16)
    g.add(turnedLeg(gx, 0, ly, leg))
    for (const y of [8, ly - 6]) g.add(rbox(Math.abs(gx) - fx - 2, 2.4, 2.4, leg, { x: (gx + s * fx) / 2, y }, 0.4))
    g.add(rbox(2, 2, 6, shade(leg, -0.15), { x: s * (GATE_MID / 2 + 6), y: ly - 2 }, 0.3))
  }
  return g
}

// ---------- 梯形书桌：两侧框（后柱贴墙、前柱到桌面、斜梁往后收），桌面 + 一个抽屉，上方两层越来越浅的书架 ----------

const LD_W = 80
const LD_D = 48
const LD_H = 180
const LD_DESK = 75
const LD_BACK = -LD_D / 2
/** 前腿、后柱（3cm 厚）的中线 */
const LD_LEG_Z = LD_D / 2 - 1.5
const LD_POST_Z = LD_BACK + 1.5
/** 斜梁（中线）：从前腿顶端（桌面高度）往后收到顶上、紧贴后柱前面 */
const ldFront = (y: number) => LD_LEG_Z - ((LD_LEG_Z - LD_BACK - 3) * (y - LD_DESK)) / (LD_H - LD_DESK)
const LD_SHELVES = [118, 148]
/** 可摆放区的左右边界（两侧框里面再收 0.4） */
const LD_IX = LD_W / 2 - 3
const ldRect = (z0: number, z1: number) => rectPoly(-LD_IX, z0, LD_IX, z1)
function ladderDesk(p: string[]) {
  const [board, frame, knob] = p
  const g = new THREE.Group()
  const sx = LD_W / 2 - 1.3
  for (const s of [-1, 1]) {
    g.add(rbox(2.6, LD_H, 3, frame, { x: s * sx, z: LD_POST_Z }, 0.6))
    g.add(rbox(2.6, LD_DESK, 3, frame, { x: s * sx, z: LD_LEG_Z }, 0.6))
    g.add(strutBox([s * sx, LD_DESK, ldFront(LD_DESK)], [s * sx, LD_H - 1.5, ldFront(LD_H - 1.5)], 2.6, 3, frame))
    // 侧面下方的横档
    g.add(rbox(2.6, 2.6, LD_D - 6, frame, { x: s * sx, y: 12 }, 0.5))
  }
  const iw = LD_W - 5.2
  // 桌面 + 抽屉
  g.add(rbox(iw, 3, LD_D, board, { y: LD_DESK - 3 }, 0.8))
  g.add(rbox(44, 9, LD_D - 8, shade(board, -0.06), { y: LD_DESK - 12, z: 2 }, 0.6))
  g.add(rbox(44, 9, 1.2, shade(board, 0.04), { y: LD_DESK - 12, z: LD_D / 2 - 1.6 }, 0.4))
  g.add(rbox(10, 1.2, 1.4, knob, { y: LD_DESK - 8, z: LD_D / 2 - 1 }, 0.4))
  // 桌下后侧挡板
  g.add(rbox(iw, 14, 1.4, frame, { y: LD_DESK - 17, z: LD_POST_Z }, 0.4))
  // 上方书架：层板从后柱伸到斜梁，背后一条挡条
  for (const y of LD_SHELVES) {
    const fz = ldFront(y)
    const d = fz - LD_BACK
    g.add(rbox(iw, 2, d, board, { y, z: (LD_BACK + fz) / 2 }, 0.5))
    g.add(rbox(iw, 5, 1.4, frame, { y: y + 2, z: LD_POST_Z }, 0.4))
  }
  // 顶上的小搁板
  const topZ = ldFront(LD_H - 2) + 1
  g.add(rbox(iw, 2, topZ - LD_BACK, board, { y: LD_H - 2, z: (LD_BACK + topZ) / 2 }, 0.5))
  return g
}

// ---------- 木谱架：十字脚 + 立柱 + 后仰的谱板（下沿托条）、托架，上面放一份乐谱 ----------

const MS_W = 50
const MS_D = 42
const MS_H = 120
const MS_TILT = -0.26
/** 十字脚抬起的高度（下面垫四只脚垫） */
const MS_PAD = 0.8
function musicStandWood(p: string[]) {
  const [wood, , acc] = p
  const g = new THREE.Group()
  // 十字脚 + 两端的脚垫（收在横脚下面）
  g.add(rbox(MS_W - 6, 3, 6, wood, { y: MS_PAD }, 1))
  g.add(rbox(6, 3, MS_D, wood, { y: MS_PAD }, 1))
  for (const [x, z] of [[-(MS_W - 6) / 2 + 3, 0], [(MS_W - 6) / 2 - 3, 0], [0, -MS_D / 2 + 3], [0, MS_D / 2 - 3]] as const) g.add(cyl(1.8, 1.8, MS_PAD + 0.2, shade(wood, -0.25), { x, z }, 10))
  // 立柱 + 调节旋钮（杆和帽同一根轴，朝前）
  const top = 89
  g.add(cyl(2.4, 2.8, top - 3 - MS_PAD, wood, { y: 3 + MS_PAD }, 14))
  g.add(cylZ(0.9, 3.4, acc, 0, 60, 3.6, 10))
  g.add(cylZ(2.2, 1.2, acc, 0, 60, 5.6, 16))
  // 立柱顶上的托架，谱板靠在它前面
  g.add(rbox(8, 6, 4, shade(wood, -0.08), { y: top - 4, z: -0.6 }, 0.6))
  // 谱板：后仰的一块板，下沿托条，中间一份乐谱
  const desk = new THREE.Group()
  desk.add(rbox(MS_W, 34, 1.4, wood, {}, 0.6))
  desk.add(rbox(MS_W, 2.4, 4.4, shade(wood, -0.08), { y: -1, z: 1.5 }, 0.5))
  desk.add(rbox(42, 30, 0.4, PAPER, { y: 2.2, z: 0.95 }, 0.1))
  for (let i = 0; i < 6; i++) desk.add(rbox(36, 0.4, 0.2, M.char, { y: 7 + i * 4, z: 1.25 }, 0.05))
  g.add(P(desk, 0, top - 2, 2, MS_TILT))
  return g
}

// ---------- 独立吧台：客人一侧是竖条格栅的挡板 + 搁脚杆，台面往前挑出；吧台里侧两层开放格 ----------

const BAR_W = 140
const BAR_D = 50
const BAR_H = 105
/** 台面往客人一侧（+z）挑出多少 */
const BAR_OVER = 10
const BAR_SHELVES = [6, 52]
function barCounter(p: string[]) {
  const [body, top, metal] = p
  const g = new THREE.Group()
  const bd = BAR_D - BAR_OVER
  const bz = -BAR_D / 2 + bd / 2
  const front = bz + bd / 2
  // 两侧板 + 底板 + 中间层板 + 前挡板（里侧敞开）
  for (const s of [-1, 1]) g.add(rbox(3, BAR_H - 4, bd, body, { x: s * (BAR_W / 2 - 1.5), z: bz }, 0.6))
  for (const y of BAR_SHELVES) g.add(rbox(BAR_W - 6, 2.4, bd - 2, body, { y, z: bz - 1 }, 0.4))
  g.add(rbox(BAR_W - 6, BAR_H - 4, 2, body, { z: front - 1 }, 0.4))
  // 挡板外面的竖条格栅
  const n = 23
  for (let i = 0; i < n; i++) g.add(rbox(3.2, BAR_H - 14, 1.4, shade(body, i % 2 ? 0.04 : -0.04), { x: -BAR_W / 2 + 6 + ((BAR_W - 12) * (i + 0.5)) / n, y: 6, z: front + 0.7 }, 0.5))
  // 踢脚
  g.add(rbox(BAR_W - 2, 6, 1.6, shade(body, -0.25), { z: front + 0.9 }, 0.4))
  // 台面
  g.add(rbox(BAR_W, 4, BAR_D, top, { y: BAR_H - 4 }, 1))
  // 搁脚杆：两只托架 + 一根横杆
  const rz = BAR_D / 2 - 3
  g.add(rod3([-BAR_W / 2 + 8, 22, rz], [BAR_W / 2 - 8, 22, rz], 1.4, metal))
  for (const x of [-BAR_W / 2 + 14, 0, BAR_W / 2 - 14]) g.add(rod3([x, 22, front + 1.4], [x, 22, rz], 1, metal))
  return g
}

// ---------- 藤编三折屏风：三扇木框藤编屏，两侧那扇往前折 ----------

const SCR_PANEL = 50
const SCR_H = 170
const SCR_FOLD = 0.5
/** 总宽：中间扇 + 两侧扇折过去的投影（再加立梃的厚度） */
const SCR_W = 2 * (SCR_PANEL / 2 + SCR_PANEL * Math.cos(SCR_FOLD)) + 2
/** 两侧扇往前折出去的深度 */
const SCR_DEPTH = SCR_PANEL * Math.sin(SCR_FOLD) + 3
/** 整体往后挪这么多，让占地在前后方向居中 */
const SCR_SHIFT = -(SCR_PANEL * Math.sin(SCR_FOLD)) / 2
/** 一扇屏：木框（两根立梃 + 上中下三根横档）+ 藤编面（浅色面板 + 两面各一层格纹） */
function screenPanel(frame: string, cane: string) {
  const g = new THREE.Group()
  const w = SCR_PANEL - 1
  for (const s of [-1, 1]) g.add(rbox(3, SCR_H - 4, 3, frame, { x: s * (w / 2 - 1.5), y: 4 }, 0.6))
  for (const y of [8, 92, SCR_H - 6]) g.add(rbox(w - 6, 3, 2.6, frame, { y }, 0.4))
  // 两只小脚
  for (const s of [-1, 1]) g.add(rbox(4, 4, 4, shade(frame, -0.15), { x: s * (w / 2 - 1.5) }, 0.6))
  // 藤编：上下两块
  for (const [y0, y1] of [[11, 92], [95, SCR_H - 6]]) {
    const h = y1 - y0
    g.add(rbox(w - 6, h, 0.8, cane, { y: y0 }, 0.2))
    // 格纹：两面各几根横竖细条
    for (const z of [-0.6, 0.6]) {
      for (let i = 1; i < 6; i++) g.add(rbox(0.6, h, 0.3, shade(cane, -0.12), { x: -(w - 6) / 2 + ((w - 6) * i) / 6, y: y0, z }, 0.1))
      for (let k = 1; k < Math.round(h / 9); k++) g.add(rbox(w - 6, 0.6, 0.3, shade(cane, -0.12), { y: y0 + k * 9, z }, 0.1))
    }
  }
  return g
}
function caneScreen(p: string[]) {
  const [frame, cane] = p
  const g = new THREE.Group()
  const half = SCR_PANEL / 2
  g.add(P(screenPanel(frame, cane), 0, 0, SCR_SHIFT))
  // 两侧扇：从中间扇的边（合页）往外、往前折
  for (const s of [-1, 1]) {
    const cx = s * (half + half * Math.cos(SCR_FOLD))
    const cz = half * Math.sin(SCR_FOLD) + SCR_SHIFT
    g.add(P(screenPanel(frame, cane), cx, 0, cz, 0, -s * SCR_FOLD))
    // 合页
    for (const y of [30, SCR_H - 30]) g.add(rbox(1.2, 7, 1.6, shade(frame, -0.3), { x: s * half, y, z: SCR_SHIFT }, 0.3))
  }
  return g
}

// ---------- 旋转书架：圆底座上的方塔，四层，每层四面都能放书（中间一根方芯，四角立柱） ----------

const REV_W = 46
const REV_H = 128
const REV_YS = [10, 39, 68, 97, REV_H - 2]
const REV_CORE = 7
function revolvingBookcase(p: string[]) {
  const [wood, base] = p
  const g = new THREE.Group()
  // 底座：一圈小脚 + 圆盘转台
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cyl(2.4, 2, 3, shade(base, -0.2), { x: Math.cos(a) * 17, z: Math.sin(a) * 17 }, 12))
  }
  g.add(puck(22, 4, base, { y: 3 }))
  g.add(cyl(6, 6, 3, shade(base, -0.15), { y: 7 }, 16))
  // 层板、方芯、四角立柱
  for (const y of REV_YS) g.add(rbox(REV_W, 2, REV_W, wood, { y }, 0.5))
  g.add(rbox(REV_CORE * 2, REV_H - 12, REV_CORE * 2, shade(wood, -0.06), { y: 10 }, 0.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, REV_H - 12, 3, wood, { x: sx * (REV_W / 2 - 1.5), y: 10, z: sz * (REV_W / 2 - 1.5) }, 0.5))
  return g
}
/** 旋转书架一层的四块放书区：方芯的前后左右（避开四角立柱） */
const revZones = (): Poly[] => {
  const o = REV_W / 2 - 3
  const c = REV_CORE + 0.5
  return [rectPoly(-o, c, o, o), rectPoly(-o, -o, o, -c), rectPoly(-o, -c, -c, c), rectPoly(c, -c, o, c)]
}

// ---------- 猫窝边几：方盒边几，正面一个圆洞、里面一块软垫，顶面能放东西 ----------

const CST_W = 48
const CST_H = 52
function catSideTable(p: string[]) {
  const [body, cushion, top] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.8, 1.4, 5, shade(top, -0.2), { x: sx * (CST_W / 2 - 5), z: sz * (CST_W / 2 - 5) }, 10))
  const box = shell(CST_W - 2, CST_H - 8, CST_W - 2, 1.8, body, { front: [{ kind: 'circle', x: 0, y: 19, r: 11 }], right: [{ kind: 'circle', x: 0, y: 24, r: 4.5 }], top: false })
  box.position.y = 5
  g.add(box)
  g.add(puck(17, 3.2, cushion, { y: 6.8 }))
  g.add(rbox(CST_W, 3, CST_W, top, { y: CST_H - 3 }, 0.8))
  return g
}

// ---------- 定义 ----------

const TREE_PALS: Pal[] = [
  ['nordic', [N.linen, N.white, N.mustard]],
  ['nordic', [N.gray, N.white, N.sage]],
  ['modern', [M.light, M.char, M.char]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['cute', [C.mint, C.cream, C.lemon]],
  ['retro', [R.caramel, R.cream, R.orange]],
]
const BASKET_PALS: Pal[] = [
  ['modern', [M.black, M.walnut]],
  ['modern', [M.white, M.light]],
  ['industrial', [I.iron, I.walnut]],
  ['nordic', ['#c9a96e', N.oak]],
  ['cute', [C.pink, C.white]],
]
const RACK_PALS: Pal[] = [
  ['nordic', [N.oakL, N.oak]],
  ['nordic', [N.white, N.oak]],
  ['modern', [M.walnut, M.black]],
  ['industrial', [I.walnut, I.iron]],
  ['japanese', [J.hinoki, J.wood]],
  ['farmhouse', [F.white, F.oak]],
]
const BENT_PALS: Pal[] = [
  ['classic', [CL.walnut, CL.walnut, CL.gold]],
  ['retro', [R.caramel, R.caramel, R.caramel]],
  ['nordic', [N.oak, N.oak, N.oak]],
  ['modern', [M.black, M.black, M.silver]],
  ['farmhouse', [F.white, F.white, F.oak]],
  ['chinese', [CN.rosewood, CN.rosewood, CN.brass]],
]
const GATE_PALS: Pal[] = [
  ['farmhouse', [F.oak, F.oak]],
  ['farmhouse', [F.oak, F.white]],
  ['classic', [CL.walnut, CL.walnut]],
  ['retro', [R.caramel, R.caramel]],
  ['nordic', [N.oakL, N.white]],
  ['japanese', [J.wood, J.dark]],
]
const LD_PALS: Pal[] = [
  ['nordic', [N.oak, N.oak, M.black]],
  ['nordic', [N.white, N.oak, N.oak]],
  ['modern', [M.white, M.white, M.silver]],
  ['modern', [M.walnut, M.black, M.silver]],
  ['industrial', [I.walnut, I.iron, I.iron]],
  ['cute', [C.white, C.woodL, C.pink]],
]
const MS_PALS: Pal[] = [
  ['classic', [CL.walnut, CL.walnut, CL.gold]],
  ['retro', [R.caramel, R.caramel, '#c9a25a']],
  ['nordic', [N.oak, N.oak, M.black]],
  ['modern', [M.black, M.black, M.silver]],
  ['chinese', [CN.rosewood, CN.rosewood, CN.brass]],
]

const ldShelf = (y: number, below: number): { y: number; shape: Poly[]; h: number } => ({
  y: y + 2,
  shape: [ldRect(LD_BACK + 2.4, ldFront(y) - 0.6)],
  h: below - y - 2,
})

const BAR_PALS: Pal[] = [
  ['modern', [M.char, '#e9e7e2', M.silver]],
  ['modern', [M.white, M.walnut, M.black]],
  ['industrial', [I.walnut, I.concrete, I.iron]],
  ['nordic', [N.white, N.oak, '#c9a96e']],
  ['retro', [R.teal, R.cream, '#c9a25a']],
  ['farmhouse', [F.navy, F.oak, F.iron]],
]
const SCR_PALS: Pal[] = [
  ['japanese', [J.wood, '#e6d3a8']],
  ['nordic', [N.oak, '#ead7b8']],
  ['retro', [R.caramel, '#e8cf9a']],
  ['chinese', [CN.rosewood, '#e3cf9f']],
  ['modern', [M.black, '#e2d2ae']],
]
const REV_PALS: Pal[] = [
  ['classic', [CL.walnut, CL.walnut]],
  ['nordic', [N.oak, N.oak]],
  ['nordic', [N.white, N.oak]],
  ['modern', [M.walnut, M.black]],
  ['chinese', [CN.rosewood, CN.ink]],
]
const CST_PALS: Pal[] = [
  ['nordic', [N.white, N.linen, N.oak]],
  ['nordic', [N.sage, N.white, N.oakL]],
  ['modern', [M.char, M.light, M.walnut]],
  ['cute', [C.sakura, C.white, C.woodL]],
  ['cute', [C.sky, C.cream, C.white]],
]

const CAT_TOWER: Partial<AssetDef> = { type: 'cat-tower', tags: ['cat', 'pet-supply', 'hobby:cats'], mats: ['pile', 'fabric', 'pile'] }
const barShelf = (i: number) => ({
  y: BAR_SHELVES[i] + 2.4,
  shape: [rectPoly(-(BAR_W / 2 - 4), -BAR_D / 2 + 1, BAR_W / 2 - 4, BAR_D / 2 - BAR_OVER - 3)],
  h: (BAR_SHELVES[i + 1] ?? BAR_H - 4) - BAR_SHELVES[i] - 2.4,
})

export const FURNITURE_PLUS: AssetDef[] = [
  define('fp-cat-tree-tall', '高猫爬架', 'pets', [TREE_W, TREE_D, TREE_H], TREE_PALS, catTreeTall, CAT_TOWER),
  define('fp-cat-post', '小猫爬柱', 'pets', [POST_W, POST_W, POST_H], TREE_PALS, catPost, CAT_TOWER),
  define('fp-magazine-basket', '铁线杂志篮', 'living', [BASKET_W, BASKET_D, BASKET_H], BASKET_PALS, magazineBasket, {
    type: 'magazine',
    mats: ['metal', 'wood'],
  }),
  define('fp-magazine-rack', '阶梯杂志架', 'living', [RACK_W, RACK_D, RACK_H], RACK_PALS, magazineRack, {
    type: 'magazine',
    mats: ['wood', 'wood'],
  }),
  define('fp-coat-bentwood', '弯木衣帽架', 'entrance', [38, 38, BENT_H], BENT_PALS, bentwoodStand, {
    type: 'coat-rack',
    tags: ['multi-ok'],
    mats: ['wood', 'wood', 'metal'],
    surfaces: [
      { y: BENT_UP.y + 1, kind: 'hook', h: 150, shape: hookRing(BENT_UP_A, BENT_UP.r) },
      { y: BENT_LOW.y + 1, kind: 'hook', h: 130, shape: hookRing(BENT_LOW_A, BENT_LOW.r) },
    ],
  }),
  define('fp-gateleg-table', '蝴蝶翻板餐桌', 'dining', [GATE_W, GATE_D, GATE_H], GATE_PALS, gatelegTable, {
    type: 'dining-table',
    tags: ['table'],
    mats: ['wood', 'wood'],
    sizeLabel: '120×80',
    surface: GATE_H,
  }),
  define('fp-ladder-desk', '梯形书桌', 'study', [LD_W, LD_D, LD_H], LD_PALS, ladderDesk, {
    type: 'desk',
    tags: ['table'],
    mats: ['wood', 'wood', 'metal'],
    sizeLabel: '80×48',
    // 桌面：前半截上方是空的（层板收在斜梁后面），后半截在第一层书架下面，限高
    surface: LD_DESK,
    surfaceShape: [ldRect(ldFront(LD_SHELVES[0]) + 1, LD_D / 2 - 1)],
    surfaces: [
      { y: LD_DESK, shape: [ldRect(LD_BACK + 2.4, ldFront(LD_SHELVES[0]) + 1)], h: LD_SHELVES[0] - LD_DESK },
      ldShelf(LD_SHELVES[0], LD_SHELVES[1]),
      ldShelf(LD_SHELVES[1], LD_H - 2),
    ],
  }),
  define('fp-music-stand', '木谱架', 'music', [MS_W, MS_D, MS_H], MS_PALS, musicStandWood, {
    type: 'music-stand',
    tags: ['music-accessory', 'instrument'],
    mats: ['wood', null, 'metal'],
  }),
  define('fp-bar-counter', '独立吧台', 'dining', [BAR_W, BAR_D, BAR_H], BAR_PALS, barCounter, {
    type: 'counter',
    tags: ['table'],
    mats: ['wood', 'stone', 'metal'],
    sizeLabel: '140×50',
    surface: BAR_H,
    surfaces: [barShelf(0), barShelf(1)],
  }),
  define('fp-cane-screen', '藤编三折屏风', 'living', [SCR_W, SCR_DEPTH, SCR_H], SCR_PALS, caneScreen, {
    type: 'partition',
    styles: ['japanese', 'nordic', 'retro', 'chinese'],
    mats: ['wood', 'fabric'],
  }),
  define('fp-revolving-bookcase', '旋转书架', 'study', [REV_W, REV_W, REV_H], REV_PALS, revolvingBookcase, {
    type: 'bookshelf',
    tags: ['cabinet', 'hobby:reading'],
    mats: ['wood', 'wood'],
    surface: REV_H,
    surfaces: REV_YS.slice(0, 4).map((y, i) => ({ y: y + 2, shape: revZones(), h: REV_YS[i + 1] - y - 2 })),
  }),
  define('fp-cat-side-table', '猫窝边几', 'pets', [CST_W, CST_W, CST_H], CST_PALS, catSideTable, {
    type: 'coffee-table',
    tags: ['cat', 'pet-supply', 'hobby:cats', 'table'],
    mats: ['wood', 'fabric', 'wood'],
    surface: CST_H,
  }),
]
