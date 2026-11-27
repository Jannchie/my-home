// 杂项补充：宠物外出 / 鸟浴 / 猫抓板、雪地靴和足球鞋（按尺码成系列）、梳妆凳 / 收纳脚凳 / 铁艺吧凳、
// 单双杠 / 壶铃架 / 攀岩墙、德州扑克桌、奖牌墙、滑雪板架、露营椅组。约定见 kit.ts 开头。
//
// 约定补充：
//   - id 统一用 mm- 前缀。原点在占地中心底面，正面朝 +z；落地件 build 末尾 fitGroup 居中落地（扑克桌声明了 surface，不平移）。
//   - 鞋：一双两只并排（右脚在 +x、左脚镜像），鞋尖朝 +z；同一款按尺码（成人男款 / 成人女款 / 儿童）成一个 series。
//   - 壁挂的奖牌墙用 fitWall：最低点 = mount，背面贴 z = -d/2。

import * as THREE from 'three'
import { ball, box, cup, cyl, face, markWater, puck, rbox, shade, torus, tray } from '../toon'
import { C, holePanel, moveHole, slab, type AssetDef, type Hole, type Poly } from '../kit'
import { batten, cappedTube, cylX, cylZ, fitGroup, fitWall, G, ghost, lathe, lit, mesh, noOutline, P, PI, rod3, sideSlab, strutBox, tube, type V2, type V3 } from '../geo'
import { CL, F, I, J, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#2a2b30'
const RUBBER = '#3a3b40'
const GLASS = '#cfeeff'
const WATER = '#8fd3ea'
const GOLD = '#e0b545'
const SILVER = '#cdd2da'
const BRONZE = '#c8875a'
const KRAFT = '#c99a62'
const CAT_FUR = '#f2b36b'
const SEED = '#d9b46a'
const FOOT_WOOD = '#a27a52'
const HOLD_COLORS = ['#ff6b5e', '#ffc23d', '#4fc27a', '#3f8fe8', '#b46ee0', '#ff8fc0']


/**
 * 空心外壳（同 kit 的 shell，只是各面不倒角）：板边被护角、顶底板盖住看不到时用，
 * 每个孔的倒角要多出几十个面（侧面一排排透气孔就是上千个）。前后板盖住全宽，左右板夹在中间。
 */
function flatShell(w: number, h: number, d: number, t: number, color: string, o: { front?: Hole[]; left?: Hole[]; right?: Hole[] }) {
  const g = new THREE.Group()
  const ih = h - t * 2
  // 圆孔按 seg 细分（一圈 2 × seg 个点），只有直角孔的板 4 段就够（只影响板的四个圆角）
  const panel = (pw: number, holes: Hole[] | undefined, at: { x?: number; z?: number; ry?: number }, seg = 4) => g.add(holePanel(pw, ih, t, color, (holes ?? []).map((x) => moveHole(x, 1, -t)), { ...at, y: t }, 1.5, { bevel: 0, seg }))
  panel(w, o.front, { z: d / 2 - t / 2 }, 16)
  panel(w, [], { z: -d / 2 + t / 2, ry: PI })
  panel(d - t * 2, o.right, { x: w / 2 - t / 2, ry: PI / 2 })
  panel(d - t * 2, o.left, { x: -w / 2 + t / 2, ry: -PI / 2 })
  for (const y of [0, h - t]) g.add(rbox(w, t, d, color, { y }, Math.min(t * 0.4, 1)))
  return g
}

/** 上半个椭球（底面敞开、平放在 y = 0）：半径 rx × ry × rz */
function halfDome(rx: number, ry: number, rz: number, color: string, seg: [number, number] = [24, 10]) {
  const m = mesh(new THREE.SphereGeometry(1, seg[0], seg[1], 0, PI * 2, 0, PI / 2), color)
  m.scale.set(rx, ry, rz)
  return m
}

/** 鞋底轮廓：长 L（沿 z），前掌半宽 wf、后跟半宽 wh，平滑过渡 */
function footPoly(L: number, wf: number, wh: number, n = 28): Poly {
  const pts: Poly = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * PI * 2
    const s = Math.sin(t)
    const c = Math.cos(t)
    const w = wh + ((wf - wh) * (s + 1)) / 2
    // 横向按 0.7 次方鼓出一点（超椭圆）：鞋底两侧更饱满，盖得住鞋面
    pts.push([Math.sign(c) * Math.abs(c) ** 0.7 * w, s * (L / 2)])
  }
  return pts
}

/** 一双：右脚在 +x、左脚镜像，脚尖略微外撇 */
function shoePair(one: () => THREE.Group, gapX: number) {
  const r = P(one(), gapX, 0, 0, 0, 0.05)
  const l = P(one(), -gapX, 0, 0, 0, -0.07)
  l.scale.x = -1
  return G(r, l)
}

/** 八边形（边心距 a，一条边正对 +z） */
function octagon(a: number): V2[] {
  const R0 = a / Math.cos(PI / 8)
  return Array.from({ length: 8 }, (_, i): V2 => {
    const t = PI / 8 + (i * PI) / 4
    return [Math.cos(t) * R0, Math.sin(t) * R0]
  })
}

/** 八边形正前方（+z）的边上挖一道向里凹的弧（庄家位）：圆心 (0, cz)、半径 r */
function dentedOct(a: number, cz: number, r: number): V2[] {
  const oct = octagon(a)
  const hx = Math.sqrt(r * r - (cz - a) ** 2)
  const out: V2[] = []
  for (let i = 0; i < 8; i++) {
    out.push(oct[i])
    // 第 1、2 个顶点之间是正对 +z 的那条边（t = 3π/8 → 5π/8，x 从正到负）
    if (i === 1) {
      const a0 = Math.atan2(a - cz, hx)
      const a1 = Math.atan2(a - cz, -hx)
      for (let k = 0; k <= 10; k++) {
        const t = a0 + ((a1 - a0) * k) / 10
        out.push([Math.cos(t) * r, cz + Math.sin(t) * r])
      }
    }
  }
  return out
}

/** 水平的环形板：外轮廓 outer、内孔 inner（[x, z]），底面在 y，厚 t */
function ringSlab(outer: V2[], inner: V2[], t: number, color: string, y: number, bevel = 0.6) {
  const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)))
  s.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))))
  const b = Math.min(bevel, t * 0.3)
  const geo = new THREE.ExtrudeGeometry(s, { depth: t - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2 })
  geo.rotateX(-PI / 2)
  geo.translate(0, b, 0)
  return P(mesh(geo, color), 0, y, 0)
}

/** 平铺的细线环（台呢上的下注线）：不描边 */
function lineRing(outer: V2[], inner: V2[], color: string, y: number) {
  const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)))
  s.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))))
  const geo = new THREE.ShapeGeometry(s)
  geo.rotateX(-PI / 2)
  return noOutline(P(mesh(geo, color), 0, y, 0))
}

// ---------- 太空舱宠物背包：硬壳方舱，正面一扇圆形透明舱窗（里面趴着一只小猫），两侧一排排透气孔，背后两条背带、顶上提手 ----------

const PC = { w: 30, h: 38, d: 20, t: 1.2, y0: 1.2, win: 10, wy: 21 }
function petCapsule(p: string[]) {
  const [main, sub, strap] = p
  const g = new THREE.Group()
  // 侧面透气孔：2 列 × 6 行的直角长条孔（圆孔每个要细分，面数翻好几倍）
  const vents: Hole[] = []
  for (let i = 0; i < 2; i++) for (let j = 0; j < 6; j++) vents.push({ kind: 'rect', x: -2.6 + i * 5.2, y: 11 + j * 3.4, w: 4, h: 1.4, r: 0 })
  g.add(P(flatShell(PC.w, PC.h, PC.d, PC.t, main, { front: [{ kind: 'circle', x: 0, y: PC.wy, r: PC.win }], left: vents, right: vents }), 0, PC.y0, 0))
  // 四角包边（硬壳的护角）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, PC.h + 0.4, 2.4, sub, { x: sx * (PC.w / 2 - 0.9), y: PC.y0 - 0.2, z: sz * (PC.d / 2 - 0.9) }, 1))
  // 舱窗：外圈一道粗边框 + 半透明的半球罩
  const fz = PC.d / 2
  const wy = PC.y0 + PC.wy
  g.add(torus(PC.win + 0.6, 1.1, sub, { y: wy, z: fz + 0.2 }, PI * 2, [6, 32]))
  const dome: V2[] = Array.from({ length: 7 }, (_, i): V2 => [Math.max(0.01, (PC.win + 0.6) * Math.cos((i / 6) * (PI / 2))), 4.2 * Math.sin((i / 6) * (PI / 2))])
  g.add(ghost(P(mesh(new THREE.LatheGeometry(dome.map(([r, y]) => new THREE.Vector2(r, y)), 32), GLASS), 0, wy, fz - 0.3, PI / 2), GLASS, 0.3))
  // 舱里：软垫 + 一只趴着往外看的小猫
  const floor = PC.y0 + PC.t
  g.add(rbox(PC.w - 2 * PC.t - 0.4, 2, PC.d - 2 * PC.t - 0.4, shade(sub, -0.06), { y: floor - 0.2 }, 0.8))
  g.add(ball(7.5, CAT_FUR, { y: floor + 7, z: -1 }, [1, 0.9, 0.85]))
  const hy = wy - 1
  g.add(ball(5.4, CAT_FUR, { y: hy, z: 1.2 }))
  for (const s of [-1, 1]) {
    g.add(P(cyl(0, 2, 3.4, CAT_FUR, {}, 10), s * 3.2, hy + 5.2, 1.2, 0, 0, -s * 0.35))
    g.add(P(cyl(0, 1.1, 2, '#ffc9c0', {}, 8), s * 3.15, hy + 4.9, 2.1, 0, 0, -s * 0.35))
  }
  g.add(face(6.4, { y: hy - 0.4, z: 1.2 + 5.1 }))
  g.add(noOutline(ball(0.55, '#e97a7a', { y: hy - 1.4, z: 6.5 })))
  // 顶上的提手
  const top = PC.y0 + PC.h
  g.add(cappedTube([[-6, top - 0.4, 0], [-5, top + 2.2, 0], [5, top + 2.2, 0], [6, top - 0.4, 0]], 0.9, strap, { seg: 16, radial: 8, capSeg: [8, 6] }))
  for (const s of [-1, 1]) g.add(rbox(3, 1, 3, sub, { x: s * 6, y: top - 0.3 }, 0.4))
  // 背后：一块软背垫 + 两条弧形背带（上下两端固定在背垫上）
  const bz = -PC.d / 2
  g.add(rbox(22, 30, 1.6, shade(strap, -0.1), { y: 6, z: bz - 0.6 }, 0.7))
  for (const s of [-1, 1]) {
    const st = cappedTube([[0, 33, bz - 1], [0, 28, bz - 3.6], [0, 17, bz - 4.2], [0, 9, bz - 2.6], [0, 6.6, bz - 1]], 1.1, strap, { seg: 16, radial: 8, capSeg: [8, 6] })
    st.scale.x = 2.2
    g.add(P(G(st), s * 7, 0, 0))
    g.add(rbox(3.4, 1.4, 1.2, STEEL, { x: s * 7, y: 24, z: bz - 4.6 }, 0.3))
  }
  // 四只小脚垫
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.3, 1.5, PC.y0 + 0.2, RUBBER, { x: sx * 11, z: sz * 6.5 }, 10))
  return fitGroup(g)
}

// ---------- 鸟用浴盆 + 喂食杯：矮脚浅瓷盘里一汪水，盘沿后方停着一只小鸟，右侧挂钩挂着一只装满谷粒的小杯 ----------

function birdBath(p: string[]) {
  const [dish, cupC, bird] = p
  const g = new THREE.Group()
  // 矮脚 + 浅盘 + 水面
  g.add(cyl(3.6, 4.6, 2, shade(dish, -0.06), {}, 24))
  g.add(cup(7, 5.4, 3.2, 0.7, dish, { y: 1.8 }, 24))
  g.add(markWater(cyl(6, 6, 0.3, WATER, { y: 3.9 }, 32)))
  // 盘沿后方的小鸟：身体、头、尖嘴、尾巴、两只爪
  const rz = -6.6
  const by = 5 + 2.1
  g.add(ball(1.9, bird, { y: by, z: rz + 0.2 }, [0.9, 0.85, 1.25]))
  g.add(ball(1.4, '#fbf7f1', { y: by - 0.5, z: rz + 1.4 }, [0.75, 0.7, 0.6]))
  g.add(ball(1.35, bird, { y: by + 2, z: rz + 1.4 }))
  g.add(face(2.2, { y: by + 2.1, z: rz + 2.65 }))
  g.add(P(cyl(0, 0.45, 1, '#f0a53a', {}, 8), 0, by + 1.8, rz + 3, PI / 2))
  g.add(P(rbox(1.6, 0.4, 2.6, shade(bird, -0.15), {}, 0.15), 0, by + 0.6, rz - 2.2, -0.5))
  for (const s of [-1, 1]) g.add(rod3([s * 0.6, by - 1.4, rz + 0.2], [s * 0.7, 4.9, rz + 0.1], 0.18, '#e08a3a', 6))
  // 右侧挂钩 + 喂食杯（杯里一堆谷粒）
  g.add(cappedTube([[6.4, 4.4, 0], [6.9, 5.6, 0], [7.9, 5.7, 0], [8.4, 5, 0]], 0.25, STEEL, { seg: 12, radial: 6, capSeg: [8, 6] }))
  g.add(cup(2.4, 2, 3.4, 0.3, cupC, { x: 10.6, y: 1.9 }, 16))
  g.add(cyl(2.1, 2.1, 0.6, SEED, { x: 10.6, y: 4.4 }, 16))
  for (const [x, z] of [[-0.8, 0.4], [0.6, -0.5], [0.2, 0.9], [-0.3, -0.9]]) g.add(ball(0.45, shade(SEED, -0.1), { x: 10.6 + x, y: 5, z }, undefined, [6, 4]))
  return fitGroup(g)
}

// ---------- 瓦楞纸猫抓板：一片片竖立的瓦楞纸条沿长边排开、顶面切成起伏的三峰波浪（两端看得到一层层纸），套在一只矮边纸盒托里，波谷里停着一只逗猫铃球 ----------

function catScratcher(p: string[]) {
  const [card, edge, toy] = p
  const g = new THREE.Group()
  const L = 44
  const D = 22
  const base = 1.2
  const top = (x: number) => 7 + 3.8 * Math.cos(((x / L) * 2) * PI * 2)
  // 一片纸条的侧面轮廓（沿 x 的波浪），低一点的纸条整体往下压 dh、两端各缩 dl
  const profile = (dh: number, dl: number): V2[] => {
    const pts: V2[] = [[-L / 2 + dl, 0], [L / 2 - dl, 0]]
    // 两个整周期的余弦波：24 段（每段不到 2cm）就看不出折线
    for (let i = 0; i <= 24; i++) {
      const x = L / 2 - dl - ((L - 2 * dl) * i) / 24
      pts.push([x, top(x) - dh])
    }
    return pts
  }
  const n = 18
  const pitch = D / n
  const hi = profile(0, 0)
  const lo = profile(0.25, 0.2)
  for (let i = 0; i < n; i++) {
    const z = -D / 2 + pitch * (i + 0.5)
    // sideSlab 的轮廓横轴是 z：转 90° 让波浪沿 x；相邻纸条一高一低、颜色一深一浅，叠出瓦楞纹
    const m = sideSlab(i % 2 ? lo : hi, pitch + 0.1, i % 2 ? shade(card, -0.08) : card, 0, { bevel: 0.15 })
    g.add(P(G(m), 0, base - 0.1, z, 0, PI / 2, 0))
  }
  // 矮边纸盒托：底板 + 四周一圈矮边
  g.add(rbox(L + 2, base, D + 2, edge, {}, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(L + 2, 3.4, 0.8, edge, { y: base - 0.2, z: s * (D / 2 + 0.6) }, 0.3))
    g.add(rbox(0.8, 3.4, D + 0.4, edge, { x: s * (L / 2 + 0.6), y: base - 0.2 }, 0.3))
  }
  // 逗猫铃球：一圈色带 + 一道开槽露出的铃铛，停在左边的波谷
  const tx = -L / 4
  const ty = base + top(tx) + 2.2
  g.add(ball(2.4, toy, { x: tx, y: ty, z: 3 }))
  g.add(torus(2.45, 0.35, '#ffffff', { x: tx, y: ty, z: 3, rx: PI / 2 }, PI * 2, [6, 20]))
  g.add(torus(2.45, 0.3, '#ffffff', { x: tx, y: ty, z: 3 }, PI * 2, [6, 20]))
  g.add(noOutline(ball(0.9, GOLD, { x: tx, y: ty + 0.4, z: 5.3 }, [1, 1, 0.5])))
  return fitGroup(g)
}

// ---------- 雪地靴：厚橡胶底、圆鼓鼓的鞋头，短筒外翻一圈毛绒靴口，前面垂着两颗毛球（一只右脚，原点在鞋底中心） ----------

function snowBoot(p: string[]) {
  const [upper, fur, acc] = p
  const g = new THREE.Group()
  const L = 28
  // 鞋底：厚橡胶底 + 底面几道防滑纹
  g.add(slab(footPoly(L, 6, 5.6), 2.4, shade(acc, -0.12)))
  for (let i = 0; i < 5; i++) g.add(box(8, 0.6, 0.8, shade(acc, -0.22), { y: -0.01, z: -10 + i * 5.2 }))
  // 鞋头：半个椭球
  g.add(P(halfDome(5.2, 8.2, 12, upper, [20, 8]), 0, 2.1, 1.4))
  // 靴筒（空心）+ 里衬毛 + 外翻的毛绒靴口，整体前后拉长成椭圆
  const sz = -5.4
  const shaft = new THREE.Group()
  // 靴筒和靴口都用 20 段的车削轮廓（cup 是 32 段，一双靴子面数会超）
  shaft.add(P(lathe([[0.01, 0], [5.2, 0], [5, 17.4], [4.2, 17.4], [4.2, 1], [0.01, 1]], upper, 20), 0, 2.1, 0))
  // 外翻的毛绒靴口：外壁到顶上卷成圆边，内壁盖过靴筒内壁，从上往下看是一圈毛里衬
  const roll: V2[] = [[5.8, 15.4], [6.2, 19.4]]
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * PI
    roll.push([5.15 + Math.cos(a) * 1.05, 20.6 + Math.sin(a) * 1.05])
  }
  roll.push([4.1, 17], [4.6, 15.4], [5.8, 15.4])
  shaft.add(lathe(roll, fur, 20))
  // 靴口一圈毛球：低段数的小球
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2
    shaft.add(ball(1, shade(fur, i % 2 ? 0 : -0.05), { x: Math.cos(a) * 6, y: 18.4 + (i % 3) * 0.9, z: Math.sin(a) * 6 }, undefined, [6, 4]))
  }
  shaft.scale.z = 1.25
  g.add(P(shaft, 0, 0, sz))
  // 后跟提环：下半截缝在外翻的毛口里，上沿从毛口顶上露出一截（以前整块埋在毛口里，从哪个角度都看不见）
  g.add(rbox(2, 4, 0.7, shade(upper, -0.18), { y: 18.5, z: sz - 7 }, 0.3))
  // 前面两颗毛球（细绳从靴口垂下）
  for (const s of [-1, 1]) {
    g.add(rod3([s * 0.8, 20.5, sz + 7.3], [s * 1.4, 14.6, sz + 7.8], 0.18, acc, 6))
    g.add(ball(1.5, acc, { x: s * 1.4, y: 13.4, z: sz + 7.8 }, undefined, [10, 8]))
  }
  return g
}

const SNOW_PALS: Pal[] = [
  ['farmhouse', ['#b27a4b', F.linen, F.barn]],
  ['nordic', [N.gray, N.white, N.blue]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['modern', [M.char, M.light, M.gray]],
  ['retro', [R.caramel, R.cream, R.red]],
]

// ---------- 足球鞋：低帮流线鞋面，侧面三道条纹，鞋带 + 鞋口包边，鞋底一排鞋钉（一只右脚） ----------

function soccerCleat(p: string[]) {
  const [upper, stripe, sole] = p
  const g = new THREE.Group()
  const L = 28
  const sy = 1.3
  // 鞋钉：前掌 6 颗、后跟 4 颗
  for (const [x, z] of [[-2.6, 10], [2.2, 10.6], [-3, 5], [3, 5.4], [-2.8, 0.4], [2.8, 0.8], [-2.4, -8.6], [2.4, -8.6], [-2.2, -12], [2.2, -12]] as [number, number][])
    g.add(cyl(0.55, 0.75, sy + 0.2, sole, { x, z }, 6))
  // 鞋底板
  g.add(slab(footPoly(L, 5, 4.4), 1.1, sole, sy))
  const y0 = sy + 0.9
  const dz = 0.6
  const [a, b, c] = [4.5, 7.6, 13.4]
  g.add(P(halfDome(a, b, c, upper), 0, y0, dz))
  // 侧面三道条纹：比鞋面略大一圈的椭球上割下的竖条（外侧 φ≈π、内侧 φ≈0）
  for (const base of [PI, 0])
    for (let k = 0; k < 3; k++) {
      const phi = base + (base ? -1 : 1) * (0.05 + k * 0.17)
      const m = noOutline(mesh(new THREE.SphereGeometry(1, 2, 8, phi - 0.04, 0.08, 0.5, PI / 2 - 0.5), stripe))
      m.scale.set(a + 0.2, b + 0.2, c + 0.2)
      g.add(P(m, 0, y0, dz))
    }
  const surf = (x: number, z: number) => y0 + b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - ((z - dz) / c) ** 2))
  // 鞋口：后半截顶上一块深色凹口 + 一圈包边
  const cz = dz - 6.6
  const cy = surf(0, cz)
  const hole = noOutline(ball(1, DARK, { y: cy - 0.3, z: cz, rx: -0.32 }, [2.2, 0.5, 2.9]))
  g.add(hole)
  const rim = torus(1, 0.3, stripe, { y: cy - 0.15, z: cz, rx: PI / 2 - 0.32 }, PI * 2, [6, 16])
  rim.scale.set(2.3, 3, 1)
  g.add(rim)
  // 鞋带：五道横杠
  for (let i = 0; i < 5; i++) {
    const z = dz - 2.6 + i * 1.6
    const y = surf(1.3, z) + 0.15
    g.add(rod3([-1.4, y, z], [1.4, y, z], 0.22, '#ffffff', 6))
  }
  return g
}

const CLEAT_PALS: Pal[] = [
  ['modern', [M.black, M.white, M.silver]],
  ['cute', [C.sky, C.white, C.lemon]],
  ['retro', [R.red, R.cream, R.mustard]],
  ['modern', ['#f4f4f2', '#2f6fd1', '#ff6a3d']],
]

/** 鞋的尺码：k 是整体缩放 */
const SHOE_SIZES = [
  { key: 'm', label: '成人男款', k: 1 },
  { key: 'f', label: '成人女款', k: 0.86 },
  { key: 'k', label: '儿童', k: 0.66 },
]

/** 一款鞋按尺码展开成一个系列：base 是成人男款一双的实测 [宽, 深, 高] */
function shoeSeries(id: string, name: string, base: [number, number, number], pals: Pal[], one: (p: string[]) => THREE.Group, gapX: number, extra: Partial<AssetDef>): AssetDef[] {
  return SHOE_SIZES.map((s) => {
    const dims = base.map((v) => Math.round(v * s.k * 10) / 10) as [number, number, number]
    return define(`${id}-${s.key}`, name, 'entrance', dims, pals, (p) => {
      const pr = shoePair(() => one(p), gapX)
      pr.scale.multiplyScalar(s.k)
      return fitGroup(pr)
    }, { series: id, sizeLabel: s.label, prop: true, ...extra })
  })
}

// ---------- 法式梳妆凳：椭圆软包凳面（拉扣 + 一圈金色滚边），雕花木圈，四条外撇的弯腿 ----------

function dressingStool(p: string[]) {
  const [fab, wood, trim] = p
  const g = new THREE.Group()
  const k = 1.42
  // 木圈（椭圆）+ 软包凳面
  const ring = cyl(17, 16.4, 5, wood, { y: 33 }, 32)
  ring.scale.x = k
  g.add(ring)
  const seat = puck(17.6, 8.4, fab, { y: 36.6 })
  seat.scale.x = k
  g.add(seat)
  // 滚边绕着 32 段的木圈 / 凳面：圈上也是 32 段，细管截面 6 段
  const pipe = torus(17.4, 0.6, trim, { y: 37.4, rx: PI / 2 }, PI * 2, [6, 32])
  pipe.scale.x = k
  g.add(pipe)
  // 木圈正面的小雕花（圆贝壳）
  for (const s of [-1, 1]) g.add(P(ball(1.6, shade(wood, 0.08), {}, [1.3, 1, 0.5]), 0, 35.5, s * 16.6))
  // 凳面的拉扣
  for (const [x, z] of [[0, 0], [-11, -4], [11, -4], [-11, 4], [11, 4], [-5.5, 0], [5.5, 0]] as [number, number][]) g.add(noOutline(ball(0.7, shade(fab, -0.18), { x, y: 44.85, z }, undefined, [8, 6])))
  // 四条弯腿：膝部外鼓、往下收、脚尖再外撇，脚底一只小圆脚
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const pts: V3[] = [[sx * 18, 34, sz * 9.5], [sx * 21.2, 28, sz * 11.2], [sx * 19.6, 18, sz * 10.4], [sx * 18.2, 8, sz * 9.8], [sx * 20, 1.4, sz * 11]]
      g.add(tube(pts, 1.7, wood, { seg: 18 }))
      g.add(ball(2.6, wood, { x: sx * 20.4, y: 30, z: sz * 11.4 }, [0.9, 1.2, 0.9], [12, 8]))
      g.add(cyl(2.1, 2.2, 1.6, shade(wood, -0.08), { x: sx * 20, z: sz * 11 }, 12))
    }
  return fitGroup(g)
}

// ---------- 翻盖收纳脚凳：方形软包箱身（四周一圈缝线），四只木圆脚；软盖后边铰链，前沿掀起一点，露出里面叠着的毯子，毯角搭出箱沿 ----------

const OT = { w: 40, d: 40, body: 36, foot: 3, lid: 5.2, open: 0.2 }
function storageOttoman(p: string[]) {
  const [fab, lidC, blanket] = p
  const g = new THREE.Group()
  const y0 = OT.foot
  const top = y0 + OT.body
  // 箱身：敞口的软包方箱（底板 + 四面 3cm 厚的壁）
  g.add(tray(OT.w, OT.body, OT.d, 3, fab, { y: y0 }, 0.6))
  // 箱身四面的缝线（略凸出）
  for (const s of [-1, 1]) {
    g.add(noOutline(box(OT.w - 4, 0.4, 0.4, shade(fab, -0.14), { y: top - 4, z: s * (OT.d / 2 + 0.05) })))
    g.add(noOutline(box(0.4, 0.4, OT.d - 4, shade(fab, -0.14), { x: s * (OT.w / 2 + 0.05), y: top - 4 })))
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(2.2, 1.6, OT.foot + 0.3, FOOT_WOOD, { x: sx * (OT.w / 2 - 4), z: sz * (OT.d / 2 - 4) }, 12))
  // 里面叠着的毯子（两层叠好的 + 一角搭出前沿）
  g.add(rbox(OT.w - 7, top - 3 - (y0 + 2.9), OT.d - 8, blanket, { y: y0 + 2.9 }, 1.2))
  g.add(rbox(OT.w - 8, 4, OT.d - 10, shade(blanket, 0.06), { y: top - 3.6 }, 1.4))
  g.add(rbox(13, 1.2, 4.6, shade(blanket, 0.06), { x: -6, y: top - 0.2, z: OT.d / 2 - 1.6 }, 0.5))
  g.add(rbox(13, 9, 1.2, shade(blanket, 0.06), { x: -6, y: top - 8.4, z: OT.d / 2 + 0.75 }, 0.5))
  // 软盖：铰链在后沿，绕后沿往上掀
  const lid = new THREE.Group()
  lid.add(rbox(OT.w + 1, 3, OT.d + 1, lidC, { z: OT.d / 2 + 0.5 }, 1.4))
  lid.add(rbox(OT.w - 1, 2.4, OT.d - 1, shade(lidC, 0.05), { y: 2.6, z: OT.d / 2 + 0.5 }, 1.2))
  for (const [x, z] of [[-9, 10], [9, 10], [0, 20.5], [-9, 31], [9, 31]] as [number, number][]) lid.add(noOutline(ball(0.75, shade(lidC, -0.18), { x, y: 4.95, z }, undefined, [8, 6])))
  // 两道铰链
  for (const s of [-1, 1]) g.add(rbox(4, 1.2, 1.4, STEEL, { x: s * 12, y: top - 0.6, z: -OT.d / 2 - 0.4 }, 0.3))
  lid.position.set(0, top, -OT.d / 2 - 0.5)
  lid.rotation.x = -OT.open
  g.add(lid)
  return fitGroup(g)
}

// ---------- 工业风铁艺吧凳：四根水管腿外撇，接头处是管件；中间一圈踏脚环；顶上一块方法兰盘托着可转的圆木凳面 ----------

function ironBarstool(p: string[]) {
  const [seat, iron, acc] = p
  const g = new THREE.Group()
  const H = 75
  const sy = H - 4
  const rt = 8.5
  const rb = 16.5
  const legR = (y: number) => rb - ((rb - rt) * (y - 1.6)) / (sy - 4)
  // 凳面：厚圆木板 + 底下转盘
  g.add(cyl(18, 17.6, 4, seat, { y: sy }, 32))
  g.add(cyl(9, 9, 1.2, acc, { y: sy - 1.2 }, 24))
  g.add(rbox(20, 1.4, 20, iron, { y: sy - 2.6 }, 0.4))
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2
    const [cx, cz] = [Math.cos(a), Math.sin(a)]
    const t: V3 = [cx * rt, sy - 2.4, cz * rt]
    const b: V3 = [cx * rb, 1.6, cz * rb]
    g.add(rod3(t, b, 1.3, iron, 12))
    // 管件：顶上法兰接头 + 脚底橡胶套
    g.add(cyl(1.9, 1.9, 2.4, iron, { x: cx * legR(sy - 4.2), y: sy - 5, z: cz * legR(sy - 4.2) }, 12))
    g.add(cyl(1.9, 2, 1.8, RUBBER, { x: cx * rb, z: cz * rb }, 12))
    // 踏脚环和腿的接头
    const ry = 25
    g.add(ball(2, acc, { x: cx * legR(ry), y: ry, z: cz * legR(ry) }, undefined, [12, 8]))
  }
  g.add(P(torus(legR(25), 1, acc), 0, 25, 0, PI / 2))
  // 下面一圈细拉撑
  g.add(P(torus(legR(10), 0.7, iron), 0, 10, 0, PI / 2))
  return fitGroup(g)
}

// ---------- 落地单双杠：H 形钢管焊接底座；中间两根平行双杠（套泡棉握把），后端两根高立柱顶着一根单杠，斜撑连到双杠立柱 ----------

function parallelBars(p: string[]) {
  const [frame, grip, acc] = p
  const g = new THREE.Group()
  const bx = 25
  const by = 120
  const bz = 46
  const ux = 44
  const uz = -48
  // 底座：两根纵梁 + 前后横梁 + 脚垫
  for (const s of [-1, 1]) g.add(rbox(6, 5, 116, frame, { x: s * bx, y: 1 }, 1))
  g.add(rbox(ux * 2 + 6, 5, 6, frame, { y: 1, z: uz }, 1))
  g.add(rbox(bx * 2 + 30, 5, 6, frame, { y: 1, z: 52 }, 1))
  for (const [x, z] of [[-ux, uz], [ux, uz], [-bx - 15, 52], [bx + 15, 52]] as [number, number][]) g.add(rbox(9, 1.2, 9, RUBBER, { x, z }, 0.4))
  // 双杠立柱 + 横杠
  for (const s of [-1, 1]) {
    for (const z of [-34, 34]) {
      g.add(cyl(2.4, 2.4, by - 5, frame, { x: s * bx, y: 5, z }, 16))
      g.add(ball(2.8, frame, { x: s * bx, y: by, z }, undefined, [12, 8]))
    }
    g.add(P(cyl(2.1, 2.1, bz * 2 + 8, frame, {}, 16), s * bx, by, 0, PI / 2))
    g.add(P(cyl(2.6, 2.6, 26, grip, {}, 16), s * bx, by, 18, PI / 2))
    g.add(P(cyl(2.6, 2.6, 26, grip, {}, 16), s * bx, by, -14, PI / 2))
    // 杠头堵帽
    for (const z of [-bz - 4, bz + 4]) g.add(P(cyl(2.4, 2.4, 1, acc, {}, 16), s * bx, by, z, PI / 2))
  }
  // 后端高立柱 + 单杠 + 斜撑
  for (const s of [-1, 1]) {
    g.add(cyl(2.8, 2.8, 214, frame, { x: s * ux, y: 5, z: uz }, 16))
    g.add(rod3([s * ux, 150, uz], [s * bx, by - 2, -34], 1.8, frame, 12))
    g.add(rod3([s * ux, 60, uz], [s * bx, 50, -34], 1.8, frame, 12))
    g.add(ball(3.2, frame, { x: s * ux, y: 217, z: uz }, undefined, [12, 8]))
    // 底部的三角加强板
    g.add(rbox(1, 14, 14, frame, { x: s * ux, y: 5, z: uz + 9 }, 0.3))
  }
  g.add(cylX(1.6, ux * 2 + 10, acc, 0, 213, uz + 2.8, 16))
  for (const s of [-1, 1]) {
    g.add(cylX(2.1, 22, grip, s * 22, 213, uz + 2.8, 16))
    g.add(rbox(5, 7, 4, frame, { x: s * ux, y: 209.5, z: uz + 1.6 }, 0.6))
  }
  return fitGroup(g)
}

// ---------- 壶铃杠铃片架：两层钢架，上层托盘并排四只由小到大的壶铃，下层两组隔栏里立插着杠铃片 ----------

/** 一只壶铃：扁底 + 圆铃身 + 拱形提把；r 为铃身半径，at 为底面中心 */
function kettlebell(r: number, color: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cyl(r * 0.62, r * 0.62, 1, color, {}, 16))
  g.add(ball(r, color, { y: r * 0.92 }, undefined, [16, 12]))
  const hy = r * 1.72
  g.add(torus(r * 0.58, r * 0.16, color, { y: hy }, PI, [8, 12]))
  // 提把两根立柱插进铃身
  for (const s of [-1, 1]) g.add(cyl(r * 0.16, r * 0.16, r * 0.5, color, { x: s * r * 0.58, y: hy - r * 0.45 }, 10))
  g.add(noOutline(P(cyl(r * 0.36, r * 0.36, 0.4, '#f2f2f2', {}, 16), 0, r * 0.92, r * 0.98, PI / 2)))
  return P(g, x, y, z)
}

function kettlebellRack(p: string[]) {
  const [frame, bell, plate] = p
  const g = new THREE.Group()
  const W = 98
  const D = 42
  const shelf = 34
  // 四根立柱 + 上下两层框
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(rbox(4, shelf + 4, 4, frame, { x: sx * (W / 2 - 2), y: 0.8, z: sz * (D / 2 - 2) }, 0.6))
    g.add(box(6, 0.8, 6, RUBBER, { x: sx * (W / 2 - 2), z: sz * (D / 2 - 2) }))
  }
  for (const sz of [-1, 1]) {
    g.add(rbox(W - 4, 4, 3, frame, { y: shelf - 3, z: sz * (D / 2 - 2) }, 0.5))
    g.add(rbox(W - 4, 3, 3, frame, { y: 4, z: sz * (D / 2 - 2) }, 0.5))
  }
  // 上层托盘：前低后高的斜底板 + 前沿挡条
  g.add(rbox(W - 6, 1.4, D - 4, shade(frame, 0.08), { y: shelf }, 0.4))
  g.add(rbox(W - 6, 3, 1.6, frame, { y: shelf + 1.2, z: D / 2 - 2.6 }, 0.4))
  // 四只壶铃
  const sizes = [6.4, 7, 7.8, 8.6]
  let x = -36.2
  sizes.forEach((r, i) => {
    x += r + 1.6
    g.add(kettlebell(r, i % 2 ? shade(bell, -0.08) : bell, x, shelf + 1.4, 0))
    x += r + 1.6
  })
  // 下层：横档 + 两组 U 形隔栏 + 立插的杠铃片
  for (const s of [-1, 1]) g.add(rbox(4, 3, D - 4, frame, { x: s * 21, y: 4 }, 0.5))
  g.add(rbox(W - 8, 1.2, D - 8, shade(frame, -0.06), { y: 6.6 }, 0.3))
  const plates: [number, number][] = [[-38, 12.4], [-33.6, 12.4], [-29.4, 11], [-25.6, 9.4], [6, 12.4], [10.4, 11], [14.6, 11], [18.4, 9.4], [21.8, 8]]
  for (const [px, r] of plates) {
    g.add(cylX(r, 3, r > 12 ? plate : shade(plate, (12.4 - r) * 0.03), px, 7.6 + r, 0, 24))
    g.add(cylX(r * 0.42, 3.4, shade(plate, -0.15), px, 7.6 + r, 0, 16))
    g.add(cylX(2.2, 3.8, STEEL, px, 7.6 + r, 0, 10))
  }
  for (const gx of [-41, -21.6, 3, 24.6]) for (const sz of [-1, 1]) g.add(box(1.4, 16, 1.4, frame, { x: gx, y: 7.4, z: sz * 9 }))
  return fitGroup(g)
}

// ---------- 八角德州扑克桌：八角形绿色台呢 + 一圈软包扶手（每边一只嵌入杯架），正前方凹进去的庄家位，中心立柱 + 十字脚 ----------

const PK = { a: 60, rail: 10, top: 76, felt: 73, dentZ: 66, dentR: 16 }
const PK_OUT = dentedOct(PK.a, PK.dentZ, PK.dentR)
const PK_IN = dentedOct(PK.a - PK.rail, PK.dentZ, PK.dentR + PK.rail)
function pokerTable(p: string[]) {
  const [felt, rail, wood] = p
  const g = new THREE.Group()
  // 木框裙边 + 台呢 + 软包扶手
  g.add(ringSlab(dentedOct(PK.a - 0.6, PK.dentZ, PK.dentR + 0.6), dentedOct(PK.a - 8, PK.dentZ, PK.dentR + 8), 7, wood, 64))
  g.add(slab(PK_IN.map(([x, z]): [number, number] => [x * 1.01, z * 1.01]), 3, felt, 70))
  g.add(slab(dentedOct(PK.a - 7, PK.dentZ, PK.dentR + 7), 2, shade(wood, -0.08), 64.5))
  g.add(ringSlab(PK_OUT, PK_IN, PK.top - 70.5, rail, 70.5, 2))
  // 台呢上的下注线
  g.add(lineRing(octagon(PK.a - 22), octagon(PK.a - 22.8), '#f4e7b0', PK.felt + 0.08))
  // 杯架：每条边中点（庄家位那边除外）一只金属圈 + 深色杯底
  for (let i = 0; i < 8; i++) {
    const t = PI / 2 + (i * PI) / 4
    if (i === 0) continue
    const rr = PK.a - PK.rail / 2
    const x = Math.cos(t) * rr
    const z = Math.sin(t) * rr
    g.add(torus(3.6, 0.5, STEEL, { x, y: PK.top + 0.1, z, rx: PI / 2 }, PI * 2, [8, 16]))
    g.add(noOutline(cyl(3.4, 3.4, 0.3, DARK, { x, y: PK.top - 0.05, z }, 20)))
  }
  // 中心立柱 + 十字脚
  g.add(cyl(8, 9, 58, wood, { y: 6 }, 8))
  g.add(cyl(11, 11, 2, shade(wood, -0.1), { y: 62.7 }, 8))
  g.add(cyl(12, 12, 4, shade(wood, -0.1), { y: 3 }, 8))
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2
    g.add(strutBox([0, 4, 0], [Math.cos(a) * 42, 3.5, Math.sin(a) * 42], 6, 6, wood, 1))
    g.add(cyl(3.2, 3.6, 1.6, RUBBER, { x: Math.cos(a) * 40, z: Math.sin(a) * 40 }, 12))
  }
  return g
}

// ---------- 奖牌墙挂架：一根铁艺横板（中间立着一个大步奔跑的跑者剪影），板下五只挂钩，挂着五枚 V 形缎带奖牌 ----------

const TW_MOUNT = 140
function trophyWall(p: string[]) {
  const [plate, r1, r2] = p
  const g = new THREE.Group()
  const by = 22
  // 横板 + 两端的圆头 + 背后的安装片
  g.add(rbox(58, 3.2, 0.8, plate, { y: by }, 0.3))
  for (const s of [-1, 1]) g.add(cylZ(2.6, 0.8, plate, s * 29, by + 1.6, 0, 20))
  for (const s of [-1, 1]) g.add(cylZ(1.4, 1.6, shade(plate, -0.08), s * 20, by + 1.6, -1.2, 12))
  // 跑者剪影：头、躯干、摆臂、跨步的腿（各段前后错开一点，免得共面），按 k 放大
  const k = 1.25
  const fy = by + 3.2
  const part = (a: V2, b: V2, w: number, dz: number) => g.add(strutBox([a[0] * k, fy + a[1] * k, dz], [b[0] * k, fy + b[1] * k, dz], w * k, 0.8, plate, 0.25))
  g.add(cylZ(1.7 * k, 0.8, plate, 1.6 * k, fy + 13.2 * k, 0.2, 16))
  part([0.2, 6.4], [1.2, 11.6], 2.4, 0)
  part([0.9, 10.6], [-2.6, 8.4], 1.1, 0.2)
  part([-2.6, 8.4], [-4.2, 10.6], 1, 0.4)
  part([1.2, 10.8], [4.4, 9], 1.1, -0.2)
  part([4.4, 9], [5.4, 11.4], 1, -0.4)
  part([0.2, 6.6], [4.4, 3.4], 1.4, 0.2)
  part([4.4, 3.4], [5, -0.6], 1.3, 0.4)
  part([0.2, 6.6], [-2.2, 3.2], 1.4, -0.2)
  part([-2.2, 3.2], [-5.6, 1.4], 1.3, -0.4)
  // 挂钩 + 奖牌
  const metals = [GOLD, SILVER, BRONZE, GOLD, SILVER]
  for (let i = 0; i < 5; i++) {
    const x = -24 + i * 12
    const hy = by + 0.8
    g.add(cappedTube([[x, hy, 0.2], [x, hy, 2], [x, hy + 1, 2.6]], 0.35, STEEL, { seg: 8, radial: 6, capSeg: [8, 6] }))
    const len = 11 + (i % 3) * 2.5
    const my = hy - len
    const rc = i % 2 ? r2 : r1
    // V 形缎带：两条斜带在奖牌上方交汇，中间一道细条纹
    for (const s of [-1, 1]) {
      const a: V3 = [x + s * 1.2, hy + 0.6, 1.8 + (s > 0 ? 0.3 : 0)]
      const b: V3 = [x + s * 0.4, my + 3, 1.8 + (s > 0 ? 0.3 : 0)]
      // 缎带两毫米厚：直角薄条（圆角 0.05 的圆角盒每条 108 个面）
      g.add(batten(a, b, 2.2, 0.2, s > 0 ? rc : shade(rc, -0.12), 0))
      g.add(noOutline(batten([a[0], a[1], a[2] + 0.12], [b[0], b[1], b[2] + 0.12], 0.6, 0.12, '#ffffff', 0)))
    }
    g.add(box(1.4, 1.2, 0.8, STEEL, { x, y: my + 2.6, z: 2 }))
    g.add(cylZ(3.4, 0.6, metals[i], x, my, 2.2, 24))
    g.add(noOutline(cylZ(2.3, 0.2, shade(metals[i], -0.12), x, my, 2.55, 20)))
  }
  return fitWall(g, TW_MOUNT, 5)
}

// ---------- 家用攀岩墙板：一块 120 × 240 的胶合板墙（木框收边、满板 T 型螺母孔），钉满五颜六色的岩点和一块三角岩板，前面铺一块厚防摔垫 ----------

function climbingWall(p: string[]) {
  const [board, frame, mat] = p
  const g = new THREE.Group()
  const W = 120
  const H = 240
  const bz = -38
  // 背后的木龙骨 + 胶合板 + 木框收边
  for (const x of [-50, 0, 50]) g.add(rbox(5, H - 6, 4, shade(frame, -0.1), { x, y: 2, z: bz - 3.3 }, 0.5))
  g.add(rbox(W - 4, H - 4, 2, board, { y: 2, z: bz - 0.5 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(4, H, 4, frame, { x: s * (W / 2 - 2), z: bz - 1 }, 0.6))
  g.add(rbox(W, 4, 4, frame, { y: H - 4, z: bz - 1 }, 0.6))
  // T 型螺母孔：一格格小黑点
  for (let i = 0; i < 7; i++) for (let j = 0; j < 13; j++) g.add(noOutline(cylZ(0.6, 0.3, DARK, -45 + i * 15, 26 + j * 16.5, bz + 0.55, 6)))
  // 岩点：确定性随机的位置 / 大小 / 颜色
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 30; k++) {
    const x = -48 + rnd() * 96
    const y = 30 + rnd() * 200
    const r = 2.2 + rnd() * 3
    const col = HOLD_COLORS[k % HOLD_COLORS.length]
    // 岩点压扁成半个嵌进板里（背面不能穿出胶合板）
    const m = ball(r, col, { x, y, z: bz + 1 }, [1 + rnd() * 0.5, 0.75 + rnd() * 0.3, 0.45], [10, 8])
    m.rotation.z = rnd() * PI
    g.add(m)
  }
  // 三角岩板（大号造型块）
  g.add(P(cyl(0, 13, 8, shade(board, -0.12), {}, 3), 22, 150, bz + 4.4, PI / 2, 0.3, 0))
  // 防摔垫：两块拼接、中间一道拉链缝，四周包边
  const mz = bz + 1 + 38
  for (const sz of [-1, 1]) g.add(rbox(W - 1, 18, 38, sz > 0 ? mat : shade(mat, -0.05), { y: 0, z: mz + sz * 18.8 }, 3))
  // 拉链缝嵌在两块垫子圆角之间的 V 形槽里（槽底在 y ≈ 16.1）
  g.add(noOutline(box(W - 6, 1.2, 0.6, shade(mat, -0.3), { y: 16.5, z: mz })))
  for (const s of [-1, 1]) g.add(rbox(6, 2.6, 1.2, shade(mat, -0.25), { x: s * 30, y: 9, z: mz + 37.8 }, 0.4))
  return fitGroup(g)
}

// ---------- 双板滑雪靠墙架：底座托盘 + 背后一根立柱，顶上带软垫的叉口卡住一副双板（板头上翘、中间有固定器），旁边斜插两根雪杖 ----------

function skiRack(p: string[]) {
  const [rack, ski, acc] = p
  const g = new THREE.Group()
  const pz = -12
  // 底座托盘（前沿挡条）+ 立柱 + 顶上叉口
  g.add(rbox(40, 2.4, 28, rack, {}, 0.6))
  g.add(rbox(40, 3, 1.6, rack, { y: 2, z: 13.2 }, 0.4))
  g.add(rbox(5, 152, 4, rack, { y: 2, z: pz }, 0.8))
  g.add(rbox(30, 4, 6, rack, { y: 140, z: pz + 3 }, 0.8))
  for (const x of [-11, 0, 11]) g.add(rbox(2, 6, 8, shade(acc, -0.1), { x, y: 142, z: pz + 9.4 }, 0.5))
  g.add(rbox(30, 1.2, 3, shade(acc, -0.1), { y: 142, z: pz + 6 }, 0.4))
  // 两只滑雪板：侧面轮廓挤出（底端立在托盘上、板头往前上翘）
  const prof: V2[] = [[0, 0], [1.4, 0], [1.4, 156], [2.6, 162], [5.2, 166], [4.6, 167.4], [1.8, 165], [0, 158]]
  for (const sx of [-1, 1]) {
    const x = sx * 5.5
    const z0 = pz + 7.6
    g.add(P(sideSlab(prof, 8, sx > 0 ? ski : shade(ski, -0.06), 0, { bevel: 0.3 }), x, 2.2, z0))
    // 板面上的条纹贴花 + 固定器（前后两块）
    g.add(rbox(7, 30, 0.6, acc, { x, y: 110, z: z0 + 1.4 }, 0.2))
    g.add(rbox(6, 8, 3, DARK, { x, y: 74, z: z0 + 2.4 }, 0.8))
    g.add(rbox(5, 4, 2.2, acc, { x, y: 85, z: z0 + 2.2 }, 0.6))
    g.add(rbox(6, 9, 3.2, DARK, { x, y: 56, z: z0 + 2.4 }, 0.8))
  }
  // 两板的魔术贴绑带
  g.add(rbox(20, 3, 3, acc, { y: 40, z: pz + 9 }, 0.6))
  // 雪杖：底座右后角插着，杖头靠在叉口右侧
  for (const k of [0, 1]) {
    const x0 = 15 + k * 2.6
    const a: V3 = [x0, 2.4, 6 - k * 4]
    const b: V3 = [x0 - 1.4, 126, pz + 7]
    g.add(rod3(a, b, 0.7, STEEL, 8))
    g.add(cyl(1.2, 1.2, 12, DARK, { x: b[0], y: b[1] - 1, z: b[2] }, 10))
    // 雪托：杖身离地 12cm 处的一圈小环 + 四根辐条
    const u = (12 - a[1]) / (b[1] - a[1])
    const cx = a[0] + (b[0] - a[0]) * u
    const cz = a[2] + (b[2] - a[2]) * u
    g.add(P(torus(3, 0.4, acc), cx, 12, cz, PI / 2))
    for (let q = 0; q < 4; q++) g.add(rod3([cx, 12, cz], [cx + Math.cos((q * PI) / 2) * 3, 12, cz + Math.sin((q * PI) / 2) * 3], 0.25, acc, 6))
  }
  // 雪杖腕带搭在叉口上
  g.add(rod3([12.6, 136.5, pz + 7], [14.3, 140.6, pz + 6], 0.4, acc, 6))
  return fitGroup(g)
}

// ---------- 露营椅两把 + 卷板小桌：低座沙滩椅（铝框、条纹吊布、木扶手），中间一张铝管 X 脚卷板桌，桌上一盏露营灯 ----------

/** 一把低背沙滩椅（正面朝 +z）：[布, 木扶手] */
function beachChair(fab: string, wood: string) {
  const g = new THREE.Group()
  const hw = 22
  const frame = STEEL
  // 侧框：前腿直立到扶手、后腿短、座框前高后低、靠背斜后
  for (const s of [-1, 1]) {
    const x = s * hw
    g.add(rod3([x, 0.6, 18], [x, 36.4, 17], 1.1, frame, 10))
    g.add(rod3([x, 0.6, -14], [x, 19, -16], 1.1, frame, 10))
    g.add(rod3([x, 22, 18], [x, 18, -17], 1, frame, 10))
    g.add(rod3([x, 18, -17], [x, 64, -32], 1, frame, 10))
    g.add(rod3([x, 30, 17], [x, 37.4, -21], 0.8, frame, 8))
    // 木扶手
    g.add(strutBox([x + s * 1.2, 36.6, 21], [x + s * 1.2, 38.6, -24.5], 5, 1.6, wood, 0.4))
    for (const z of [18, -14]) g.add(cyl(1.6, 1.6, 1, RUBBER, { x, z }, 10))
  }
  // 横管
  for (const [y, z] of [[22, 18], [18, -17], [64, -32], [8, 17.6]] as [number, number][]) g.add(cylX(1, hw * 2, frame, 0, y, z, 10))
  // 条纹吊布：座面和靠背各五条，颜色深浅交替、厚薄错开
  for (let i = 0; i < 5; i++) {
    const x = -hw + 4.4 * (2 * i + 1)
    const col = i % 2 ? '#fbf7f1' : fab
    const t = i % 2 ? 0.6 : 0.9
    g.add(batten([x, 20.6, 17], [x, 15.6, -16], 8.9, t, col, 0))
    g.add(batten([x, 18.6, -18.6], [x, 62, -31.2], 8.9, t, col, 0))
  }
  return g
}

function campSet(p: string[]) {
  const [fab, wood, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(P(beachChair(fab, wood), s * 44, 0, 0, 0, -s * 0.22))
  // 卷板桌：X 形铝管脚 + 两根边梁 + 一排木条桌面
  const th = 40
  const tw = 34
  const td = 30
  for (const sx of [-1, 1]) {
    g.add(rod3([sx * 13, 0.6, -12], [sx * 13, th - 2.4, 12], 0.9, STEEL, 8))
    g.add(rod3([sx * 13, 0.6, 12], [sx * 13, th - 2.4, -12], 0.9, STEEL, 8))
    g.add(cylZ(0.9, td - 2, STEEL, sx * 13, th - 2.2, 0, 10))
    for (const z of [-12, 12]) g.add(cyl(1.2, 1.2, 0.8, RUBBER, { x: sx * 13, z }, 8))
  }
  g.add(cylX(0.9, 26, STEEL, 0, 3, -12, 8))
  g.add(cylX(0.9, 26, STEEL, 0, 3, 12, 8))
  const n = 7
  for (let i = 0; i < n; i++) g.add(rbox(tw, 1.6, td / n - 0.4, i % 2 ? wood : shade(wood, -0.06), { y: th - 1.6, z: -td / 2 + (td / n) * (i + 0.5) }, 0.4))
  // 露营灯：底座 + 透明灯罩里的发光芯 + 顶盖 + 提环
  const ly = th - 0.1
  g.add(cyl(4, 4.4, 2, acc, { y: ly }, 20))
  g.add(lit(cyl(1.6, 1.6, 7.6, '#fff2b8', { y: ly + 2.2 }, 12), '#fff2b8', 0.9))
  g.add(ghost(cyl(3.4, 3.4, 8, GLASS, { y: ly + 2 }, 20), GLASS, 0.3))
  g.add(cyl(3.6, 4.2, 1.8, acc, { y: ly + 10 }, 20))
  g.add(P(torus(2.6, 0.35, STEEL, {}, PI), 0, ly + 11.6, 0))
  return fitGroup(g)
}

// ======================================================================
// 配色
// ======================================================================

const CAPSULE_PALS: Pal[] = [
  ['cute', [C.sky, C.white, C.pink]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['cute', [C.mint, C.white, C.peach]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['modern', [M.gray, M.light, M.char]],
]
const BIRD_PALS: Pal[] = [
  ['farmhouse', [F.sage, F.butter, '#d9634a']],
  ['cute', [C.mint, C.lemon, C.sky]],
  ['japanese', [J.washi, J.wood, '#9a7350']],
  ['nordic', [N.white, N.oak, C.lemon]],
]
const SCRATCH_PALS: Pal[] = [
  ['cute', [KRAFT, C.pink, C.sky]],
  ['nordic', ['#d6b48a', N.white, C.mint]],
  ['modern', ['#b78d5d', M.char, C.lemon]],
  ['retro', ['#c48f58', R.teal, R.orange]],
]
const DSTOOL_PALS: Pal[] = [
  ['classic', [CL.blue, CL.ivory, CL.gold]],
  ['classic', [CL.wine, CL.walnut, CL.gold]],
  ['classic', [CL.sage, CL.cream, CL.gold]],
  ['classic', [CL.cream, CL.walnut, CL.navy]],
  ['cute', [C.sakura, C.white, C.lemon]],
]
const OTTOMAN_PALS: Pal[] = [
  ['nordic', [N.linen, N.gray, N.mustard]],
  ['modern', [M.gray, M.char, M.white]],
  ['farmhouse', [F.linen, F.navy, F.barn]],
  ['cute', [C.sky, C.white, C.pink]],
  ['retro', [R.teal, R.mustard, R.cream]],
]
const BARSTOOL_PALS: Pal[] = [
  ['industrial', [I.walnut, I.iron, I.steel]],
  ['industrial', ['#b98a5e', I.iron, I.rust]],
  ['modern', [M.walnut, M.black, M.silver]],
  ['farmhouse', [F.oak, F.iron, F.sage]],
]
const BARS_PALS: Pal[] = [
  ['modern', [M.char, M.black, M.silver]],
  ['industrial', [I.iron, I.leather, I.rust]],
  ['modern', ['#c8473a', M.black, M.silver]],
  ['cute', [C.sky, C.white, C.lemon]],
  ['nordic', [N.white, N.oak, N.gray]],
]
const KB_PALS: Pal[] = [
  ['industrial', [I.iron, I.steel, I.rust]],
  ['modern', [M.silver, M.char, '#3f6fb0']],
  ['cute', [C.white, C.pink, C.sky]],
  ['retro', [R.teal, R.orange, R.mustard]],
]
const POKER_PALS: Pal[] = [
  ['classic', ['#2e7d4f', '#3a2a24', CL.walnut]],
  ['modern', ['#2b5f8a', M.black, M.walnut]],
  ['retro', ['#8c2f39', '#3b2a22', R.caramel]],
  ['industrial', ['#3f7a52', I.leather, I.iron]],
]
const TW_PALS: Pal[] = [
  ['industrial', [I.iron, '#d6453b', '#2f6fd1']],
  ['modern', [M.char, '#2f6fd1', '#f0c23a']],
  ['cute', [C.white, C.pink, C.sky]],
  ['retro', [R.caramel, R.red, R.teal]],
]
const CLIMB_PALS: Pal[] = [
  ['nordic', [N.oakL, N.oak, N.gray]],
  ['modern', ['#dcc7a2', M.char, '#3a6fb0']],
  ['industrial', ['#c9a978', I.iron, I.leather]],
  ['cute', [C.woodL, C.white, C.sky]],
]
const SKI_PALS: Pal[] = [
  ['nordic', [N.oak, N.blue, N.white]],
  ['modern', [M.char, '#e2442f', M.white]],
  ['retro', [R.caramel, R.orange, R.teal]],
  ['industrial', [I.iron, '#2f6fd1', I.steel]],
]
const CAMP_PALS: Pal[] = [
  ['retro', [R.orange, R.caramel, R.mustard]],
  ['nordic', [N.sage, N.oak, N.white]],
  ['farmhouse', [F.navy, F.oak, F.barn]],
  ['cute', [C.sky, C.wood, C.lemon]],
  ['modern', [M.gray, M.walnut, M.char]],
]

// ======================================================================
// 定义
// ======================================================================

const CAT: Partial<AssetDef> = { type: 'pet-supply', tags: ['cat', 'hobby:cats'] }

export const MISC_MORE: AssetDef[] = [
  define('mm-pet-capsule', '太空舱宠物背包', 'pets', [31, 29.5, 43], CAPSULE_PALS, petCapsule, { ...CAT, prop: true, tags: ['cat', 'hobby:cats', 'bag'], mats: ['plastic', 'plastic', 'fabric'] }),
  define('mm-bird-bath', '鸟用浴盆 + 喂食杯', 'pets', [20, 17, 10.5], BIRD_PALS, birdBath, { type: 'pet-supply', tags: ['hobby:birds'], prop: true, mats: ['ceramic', 'ceramic', 'ceramic'] }),
  define('mm-cat-scratcher', '瓦楞纸猫抓板', 'pets', [45.6, 24, 12], SCRATCH_PALS, catScratcher, { ...CAT, mats: ['paper', 'paper', 'plastic'] }),
  ...shoeSeries('mm-snow-boots', '雪地靴', [27.1, 28, 22.6], SNOW_PALS, snowBoot, 6.9, { type: 'shoe', tags: ['multi-ok'], mats: ['fabric', 'pile', 'plastic'] }),
  ...shoeSeries('mm-soccer-cleats', '足球鞋', [20.5, 28, 9.8], CLEAT_PALS, soccerCleat, 5.4, { type: 'shoe', tags: ['multi-ok', 'hobby:sports'], mats: ['leather', 'leather', 'plastic'] }),
  define('mm-dressing-stool', '法式梳妆凳', 'bedroom', [51, 36, 45.5], DSTOOL_PALS, dressingStool, { type: 'stool', tags: ['seat'], mats: ['fabric', 'wood', 'metal'] }),
  define('mm-storage-ottoman', '翻盖收纳脚凳', 'living', [41, 42.5, 51.6], OTTOMAN_PALS, storageOttoman, { type: 'stool', tags: ['seat'], mats: ['fabric', 'fabric', 'fabric'] }),
  define('mm-iron-barstool', '工业风铁艺吧凳', 'dining', [36, 36, 75], BARSTOOL_PALS, ironBarstool, { type: 'bar-stool', tags: ['seat', 'stool', 'dining-seat', 'multi-ok'], mats: ['wood', 'metal', 'metal'] }),
  define('mm-parallel-bars', '落地单双杠', 'fitness', [98, 116, 220], BARS_PALS, parallelBars, { type: 'strength', tags: ['sports-gear'], mats: ['metal', 'plastic', 'metal'] }),
  define('mm-kettlebell-rack', '壶铃杠铃片架', 'fitness', [100, 44, 56.6], KB_PALS, kettlebellRack, { type: 'strength', tags: ['sports-gear', 'weights'], mats: ['metal', 'metal', 'plastic'] }),
  define('mm-poker-table', '八角德州扑克桌', 'hobby', [120, 120, PK.top], POKER_PALS, pokerTable, {
    type: 'table',
    tags: ['hobby:boardgames'],
    mats: ['fabric', 'leather', 'wood'],
    surface: PK.felt,
    surfaceShape: [PK_IN.map(([x, z]): [number, number] => [x, z])],
  }),
  define('mm-trophy-wall', '奖牌墙挂架', 'deco', [63, 5, 40], TW_PALS, trophyWall, { type: 'trophy', tags: ['hobby:sports', 'decor'], mount: TW_MOUNT, mats: ['metal', 'fabric', 'fabric'] }),
  define('mm-climbing-wall', '家用攀岩墙板', 'fitness', [120, 82.7, 240], CLIMB_PALS, climbingWall, { type: 'sports-gear', tags: ['hobby:outdoor'], mats: ['wood', 'wood', 'fabric'] }),
  define('mm-ski-rack', '双板滑雪靠墙架', 'outdoor', [41, 28, 169.6], SKI_PALS, skiRack, { type: 'sports-gear', tags: ['hobby:outdoor'], mats: [null, 'plastic', 'plastic'] }),
  define('mm-camp-chair-set', '露营椅两把 + 卷板小桌', 'outdoor', [149, 63, 65], CAMP_PALS, campSet, { type: 'seat', tags: ['seat', 'hobby:outdoor'], mats: ['fabric', 'wood', 'metal'] }),
]
