// 宠物用品与育儿用品补充：自动喂食器、自动猫砂盆、猫跑轮、宠物楼梯、猫隧道、狗玩具、牵引绳挂架、宠物推车、宠物美容桌、斗鱼缸；
// 儿童小马桶、婴儿澡盆、床铃、婴儿摇椅、婴儿健身架、恐龙玩具、儿童篮球架、室内秋千、儿童蹦床、尿布收纳。约定见 kit.ts 开头；id 统一用 pk- 前缀。
//   - 宠物件的 type 统一 pet-supply（pet-bowl / litter-box / cat-tower / aquarium 会触发预览里宠物的行为或一键布置的专门规则，这里不用），
//     猫狗专用的再加 cat / dog 和对应的 hobby 兴趣标签。
//   - 育儿件分类 kids、带 for-kids；玩具 type toy。
//   - 玻璃 / 水 / 纱网是半透明材质，不描边；水面用 markWater。
//   - 除了声明 surface 的美容桌和壁挂的牵引绳挂架，build 末尾都 fitGroup 居中落地。

import * as THREE from 'three'
import { ball, box, cup, cyl, face, leaf, markWater, nub, puck, rbox, shade, torus, tray } from '../toon'
import { C, glow, holePanel, rectPoly, type AssetDef } from '../kit'
import { G, P, PI, bakeMeshes, batten, cappedTube, cylX, cylZ, fitGroup, fitWall, ghost, lathe, lit, mesh, noOutline, rod3, taperRod3, tube, type V2, type V3 } from '../geo'
import { M, N, R, define, PROP, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const RUBBER = '#2e2f33'
const DARK = '#2a2b30'
const KIBBLE = '#b9824a'
const LITTER = '#e6dccb'
const WATER = '#9fd8f0'
const DUCK = '#ffd84a'
const BEAK = '#ff9a3d'
const CREAM = '#f7f1e3'
const WHITE = '#fbfaf6'
const EYE = '#2a2020'
const ROPE = '#e8dcc2'
const NET = '#f4f4f2'
const BALL = '#ee8a3c'
const PLANT = '#4fa860'
const MESH = '#4a4d55'

// ---------- 小工具 ----------

/**
 * 空心短管的车削截面：内径 rIn、外径 rOut，从 y0 到 y1（转角处插一个小倒角点，免得法线被平均成一大片渐变）。
 * 点的顺序同 cup：底边往外 → 外壁往上 → 顶边往里 → 内壁往下，车削出来外壁朝外、内壁朝里。
 */
function ringProfile(rIn: number, rOut: number, y0: number, y1: number, b = 0.25): V2[] {
  return [
    [rIn + b, y0],
    [rOut - b, y0],
    [rOut, y0 + b],
    [rOut, y1 - b],
    [rOut - b, y1],
    [rIn + b, y1],
    [rIn, y1 - b],
    [rIn, y0 + b],
    [rIn + b, y0],
  ]
}

/**
 * 开口的球壳：半径 r、壁厚 t，开口在 +y 极（开口边的极角 open），车削轴沿 y。一圈 32 段；
 * 外壁每步 12° 上下（和一圈的折角差不多），内壁只从开口看得见、步数少一些
 */
function globeShell(r: number, t: number, open: number, color: string) {
  const pts: V2[] = []
  const n = 12
  const nIn = 8
  // 外壁：从底极往上到开口边
  for (let i = 0; i <= n; i++) {
    const a = PI - ((PI - open) * i) / n
    pts.push([Math.max(0.01, r * Math.sin(a)), r * Math.cos(a)])
  }
  // 口沿
  const mid = r - t / 2
  pts.push([mid * Math.sin(open - 0.03), mid * Math.cos(open - 0.03)])
  // 内壁：从开口边往下回到底极
  for (let i = 0; i <= nIn; i++) {
    const a = open + ((PI - open) * i) / nIn
    pts.push([Math.max(0.01, (r - t) * Math.sin(a)), (r - t) * Math.cos(a)])
  }
  return lathe(pts, color, 32)
}

/** 五角星（xy 平面里，厚 t 沿 z 居中） */
function starMesh(ro: number, ri: number, t: number, color: string) {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = PI / 2 + (i * PI) / 5
    const r = i % 2 ? ri : ro
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const bv = t * 0.25
  const geo = new THREE.ExtrudeGeometry(s, { depth: t - bv * 2, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: 1 })
  geo.translate(0, 0, -t / 2 + bv)
  return mesh(geo, color)
}

/**
 * 有厚度的曲面布：f(u, v) 给出上表面的点（u ∈ [-1, 1] 横向、v ∈ [0, 1] 纵向），下表面往下偏 t。
 * 侧边不封口（调用方用滚边管盖住）。上表面法线朝上。
 */
function sheet(f: (u: number, v: number) => V3, nu: number, nv: number, t: number, color: string) {
  const pos: number[] = []
  const idx: number[] = []
  for (const side of [0, 1]) {
    const base = pos.length / 3
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const [x, y, z] = f(-1 + (2 * i) / nu, j / nv)
        pos.push(x, y - side * t, z)
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i
        const b = a + 1
        const c = a + nu + 1
        const d = c + 1
        if (side === 0) idx.push(a, b, c, b, d, c)
        else idx.push(a, c, b, b, c, d)
      }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return mesh(geo, color)
}

/** 一根不描边的细线（吊绳、网线） */
const thread = (a: V3, b: V3, r: number, color: string) => noOutline(rod3(a, b, r, color, 6))

/** 平贴在 +x / -x 侧面上的爪印（掌垫 + 四个趾垫，都是压得很扁的小圆片，段数给低）：s 为哪一侧，x 为侧面位置 */
function pawPrint(s: number, x: number, y: number, z: number, color: string, k = 1) {
  const g = new THREE.Group()
  g.add(noOutline(ball(1.6 * k, color, { x: s * x, y, z }, [0.25, 0.85, 1.05], [8, 6])))
  for (const [dy, dz] of [
    [1.9, -1.5],
    [2.6, -0.5],
    [2.6, 0.5],
    [1.9, 1.5],
  ])
    g.add(noOutline(ball(0.6 * k, color, { x: s * x, y: y + dy * k, z: z + dz * k }, [0.25, 1, 1], [6, 4])))
  return g
}

// ======================================================================
// 宠物
// ======================================================================

// ---------- 自动喂食器：方圆机身，顶上透明粮仓罩里看得见一堆粮，前面伸出不锈钢食盆，正面一块小屏和三颗按键 ----------

function autoFeeder(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const bz = -4
  // 机身（z -17..9）
  g.add(rbox(22, 26, 26, main, { z: bz }, 4))
  // 粮仓：副色压边 + 透明罩 + 罩里的一堆粮 + 罩顶的提钮
  g.add(rbox(21.4, 1.4, 25.4, sub, { y: 25.2, z: bz }, 0.6))
  g.add(ghost(rbox(20, 7.6, 24, C.glass, { y: 26.4, z: bz }, 3), C.glass, 0.3))
  g.add(ball(8.6, KIBBLE, { y: 26.6, z: bz }, [1.05, 0.42, 1.28], [16, 10]))
  g.add(rbox(7, 1.2, 2.4, sub, { y: 33.6, z: bz }, 0.5))
  // 前面的食盆托 + 不锈钢碗 + 碗里的粮（铺到碗底、边缘压进碗壁，和碗一样 16 段）
  g.add(rbox(20, 3, 11, sub, { z: 13.5 }, 1.2))
  g.add(cup(5, 4, 4, 0.5, STEEL, { y: 2.8, z: 14 }, 16))
  g.add(cyl(4, 3.5, 1, KIBBLE, { y: 3.2, z: 14 }, 16))
  // 出粮口
  g.add(rbox(7, 3.6, 3.2, shade(main, -0.08), { y: 8, z: 10.2 }, 1))
  g.add(noOutline(rbox(4.8, 0.6, 2.4, DARK, { y: 7.8, z: 10.4 }, 0.2)))
  // 正面：深色面板 + 发光小屏 + 三颗按键 + 指示灯
  g.add(rbox(12, 7.5, 0.8, DARK, { y: 14.5, z: 9.2 }, 0.4))
  g.add(glow(7, 2.4, '#8fe8ff', { x: -1, y: 18.4, z: 9.75 }))
  for (const x of [-3, 0, 3]) g.add(cylZ(0.7, 0.6, acc, x, 16, 9.8, 12))
  g.add(lit(ball(0.5, '#7dff9a', { x: 4.2, y: 19.6, z: 9.7 }), '#7dff9a', 0.8))
  // 背后的电源线（只露一小截，整体进深不超过 38）
  g.add(cylZ(0.5, 2.2, DARK, 6, 3, -17.8, 8))
  return fitGroup(g)
}

// ---------- 自动猫砂盆：圆墩底座上架着开口朝前的大球形舱，舱里一层猫砂；底座正面是抽屉式集便仓，门口一块踏垫 ----------

function autoLitter(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  // 底座（z -29..19）
  g.add(rbox(55, 14, 48, main, { z: -5 }, 5))
  // 集便抽屉：面板 + 拉手
  g.add(rbox(40, 9.6, 1.2, shade(main, 0.1), { y: 2.2, z: 19.2 }, 0.5))
  g.add(rbox(12, 1.6, 1.4, shade(main, -0.12), { y: 9.4, z: 20 }, 0.5))
  // 球形舱：开口朝 +z，口沿一圈粗边，舱身后半截一道转动的接缝环
  const R = 23.5
  const cy = 35.5
  const cz = -6
  const open = 0.55
  g.add(P(globeShell(R, 1.4, open, sub), 0, cy, cz, PI / 2))
  g.add(torus(R * Math.sin(open) - 0.6, 1.1, shade(sub, -0.1), { y: cy, z: cz + R * Math.cos(open) - 0.4 }))
  // 接缝环：环心贴着球面，最高处不超过球顶
  g.add(torus(Math.sqrt(R * R - 36), 0.75, acc, { y: cy, z: cz - 6 }))
  // 舱里的一层猫砂：边缘压进舱壁（球壳内皮在这个高度的半径是 11.5～13.2，外皮 14～15.5）
  g.add(cyl(13.8, 12.2, 1.2, LITTER, { y: cy - 18.9, z: cz }, 24))
  // 底座顶面的控制面板
  g.add(rbox(14, 0.8, 4, DARK, { y: 13.8, z: 11 }, 0.3))
  ;['#7dff9a', '#ffd24a', '#8fe8ff'].forEach((c, i) => g.add(lit(cyl(0.8, 0.8, 0.5, c, { x: -4 + i * 4, y: 14.4, z: 11 }, 10), c, 0.7)))
  // 门口的踏垫 + 防带砂的凸条
  g.add(rbox(50, 1.2, 12, acc, { z: 25.3 }, 0.5))
  for (let k = 0; k < 5; k++) g.add(noOutline(box(46, 0.5, 0.8, shade(acc, -0.12), { y: 1, z: 21 + k * 2.2 })))
  return fitGroup(g)
}

// ---------- 猫跑轮：一只立着的大圆环跑道（内侧一圈地毯和防滑条），下半截搁在底座四只橡胶滚轮上 ----------

const CW = { R: 52, cy: 60, W: 28 }
function catWheel(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const { R, cy, W } = CW
  // 轮圈：空心宽环，轴沿 z
  g.add(P(lathe(ringProfile(R - 3, R, -W / 2, W / 2, 0.4), main, 48), 0, cy, 0, PI / 2))
  // 内侧的地毯 + 一圈防滑条（不到 1cm 的细条，直角盒）
  g.add(P(lathe(ringProfile(R - 4.4, R - 3, -W / 2 + 1, W / 2 - 1, 0.3), acc, 48), 0, cy, 0, PI / 2))
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * PI * 2
    const rr = R - 4.6
    g.add(noOutline(P(box(0.9, 0.8, W - 4, shade(acc, -0.12)), Math.cos(a) * rr, cy + Math.sin(a) * rr, 0, 0, 0, a + PI / 2)))
  }
  // 底座：左右两块墩子 + 前后两根横档，各立两根支柱托着滚轮
  for (const sx of [-1, 1]) g.add(rbox(22, 5, 36, sub, { x: sx * 31 }, 1.6))
  for (const sz of [-1, 1]) g.add(rbox(44, 3, 3, sub, { z: sz * 16 }, 0.8))
  const a = (35 * PI) / 180
  for (const sx of [-1, 1]) {
    // 滚轮（半径 3）压进轮圈 0.2：正好相切的话，多边形之间会留一道缝
    const x = sx * (R + 2.8) * Math.sin(a)
    const y = cy - (R + 2.8) * Math.cos(a)
    g.add(cylZ(3, W + 2, RUBBER, x, y, 0, 16))
    g.add(cylZ(1, 34, STEEL, x, y, 0, 8))
    for (const sz of [-1, 1]) g.add(rbox(4, y - 3, 3, sub, { x, y: 5, z: sz * 16 }, 0.8))
  }
  return fitGroup(g)
}

// ---------- 宠物楼梯：三级软包台阶（床边、沙发边用），踏面一块防滑垫，侧面印着爪印 ----------

function petStairs(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const sh = 13
  const sd = 20
  // 一圈深色防滑底：前后比台阶各多出 0.2，整体进深 60
  g.add(rbox(40.4, 1.2, 60, shade(main, -0.18), {}, 0.4))
  for (let i = 0; i < 3; i++) {
    const h = sh * (i + 1)
    const z = 19.5 - (sd - 0.5) * i
    g.add(rbox(40, h, sd + 0.6, main, { y: 0.8, z }, 3))
    g.add(rbox(36, 2, sd - 3, sub, { y: h - 0.6, z: z + 0.5 }, 0.9))
  }
  // 两侧的爪印（侧面在 x = ±20，圆片嵌进去一半）
  for (const s of [-1, 1]) {
    g.add(pawPrint(s, 20.1, 16, 0, acc))
    g.add(pawPrint(s, 20.1, 28, -18, acc))
    g.add(pawPrint(s, 20.1, 5, 18, acc, 0.8))
  }
  return fitGroup(g)
}

// ---------- 猫隧道：Y 形布艺隧道——一根长管、两根分管从中间的圆顶小舱伸出，管身几道撑圈，舱顶一个观察孔，主管口挂一只毛球 ----------

function catTunnel(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const r = 13
  const ay = 13.4
  const hub = 16
  // [方向角, 长度]：主管朝 -x，两根分管朝 +x 两侧
  const arms: [number, number][] = [
    [PI, 70],
    [-0.38, 46],
    [0.38, 46],
  ]
  for (const [a, len] of arms) {
    const arm = new THREE.Group()
    arm.add(P(lathe(ringProfile(r - 0.8, r, 0, len, 0.2), main, 24), 0, ay, 0, 0, 0, -PI / 2))
    // 撑圈（和管身一样 24 段）：从小舱外面开始每 12cm 一道，管口一道粗圈；圈的外皮都到 r + 0.4，最低点正好落地
    for (let x = hub + 6; x < len - 5; x += 12) arm.add(P(torus(r - 0.1, 0.5, sub, {}, PI * 2, [6, 24]), x, ay, 0, 0, PI / 2))
    arm.add(P(torus(r - 0.5, 0.9, sub, {}, PI * 2, [8, 24]), len - 0.6, ay, 0, 0, PI / 2))
    arm.rotation.y = -a
    g.add(arm)
  }
  // 中间的圆顶小舱：矮圆筒 + 半球顶，顶上开观察孔
  const pts: V2[] = [
    [hub - 0.8, 0],
    [hub, 0],
    [hub, 12],
  ]
  const t1 = Math.acos(6.5 / hub)
  // 圆顶外壁 6 步（每步 11°），里面只从观察孔和管口看得见，3 步
  for (let i = 1; i <= 6; i++) {
    const t = (t1 * i) / 6
    pts.push([hub * Math.cos(t), 12 + hub * Math.sin(t)])
  }
  for (let i = 3; i >= 0; i--) {
    const t = (t1 * i) / 3
    pts.push([(hub - 0.8) * Math.cos(t), 12 + (hub - 0.8) * Math.sin(t)])
  }
  pts.push([hub - 0.8, 0])
  g.add(lathe(pts, main, 24))
  const topY = 12 + (hub - 0.4) * Math.sin(t1)
  g.add(torus(6.5, 0.75, sub, { y: topY, rx: PI / 2 }, PI * 2, [6, 24]))
  // 舱底：边缘压进舱壁（内皮 hub - 0.8）
  g.add(cyl(hub - 0.7, hub - 0.7, 0.5, shade(main, -0.06), { y: 0.1 }, 24))
  // 主管口挂的毛球：吊线的上端缝在管壁里（内皮 r - 0.8、外皮 r）
  const mx = -68
  g.add(thread([mx, ay + r - 0.4, 0], [mx, ay + 3.5, 0], 0.15, sub))
  g.add(ball(2.4, acc, { x: mx, y: ay + 1.2, z: 0 }))
  return fitGroup(g)
}

// ---------- 狗玩具组：一根两头打结的棉绳、一只带刺的橡胶球、一根骨头形咬胶、一只发声小黄鸭 ----------

function dogToys(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  // 结绳：主绳 + 斜缠的白色细股 + 两头的结和穗
  const rz = -7.5
  g.add(cylX(1.3, 17, main, -4, 1.5, rz, 12))
  for (let x = -11; x <= 3; x += 2) g.add(noOutline(P(torus(1.25, 0.32, CREAM, {}, PI * 2, [6, 12]), x, 1.5, rz, 0, PI / 2 - 0.45)))
  for (const s of [-1, 1]) {
    const kx = s > 0 ? 5 : -13
    g.add(ball(2.2, main, { x: kx, y: 2.2, z: rz }))
    for (const dz of [-1, 0, 1]) g.add(rod3([kx + s * 1.6, 1.4, rz + dz * 0.6], [kx + s * 3.5, 0.5, rz + dz * 1.3], 0.45, main, 6))
  }
  // 带刺橡胶球：球身落地（朝下的那几根刺不画），不是悬着
  const bc: V3 = [9, 3.4, 4]
  g.add(ball(3.4, acc, { x: bc[0], y: bc[1], z: bc[2] }, undefined, [12, 8]))
  const n = 18
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const rr = Math.sqrt(1 - y * y)
    const t = i * 2.39996
    const d = [Math.cos(t) * rr, y, Math.sin(t) * rr]
    if (d[1] < -0.7) continue
    g.add(taperRod3([bc[0] + d[0] * 3.1, bc[1] + d[1] * 3.1, bc[2] + d[2] * 3.1], [bc[0] + d[0] * 4.4, bc[1] + d[1] * 4.4, bc[2] + d[2] * 4.4], 0.6, 0.18, acc, 6))
  }
  // 骨头咬胶
  g.add(cylX(1.2, 10, sub, -6, 1.6, 6, 12))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(1.6, sub, { x: -6 + sx * 5.4, y: 1.6, z: 6 + sz * 1.2 }, undefined, [10, 6]))
  // 发声小黄鸭（头朝 +z）：身子底（半高 2.55）落地
  const dx = 12
  const dz = -6
  const dy = -0.25
  g.add(ball(3, DUCK, { x: dx, y: 2.8 + dy, z: dz }, [1, 0.85, 1.2], [12, 8]))
  g.add(ball(2, DUCK, { x: dx, y: 5.6 + dy, z: dz + 1.6 }))
  g.add(ball(0.9, BEAK, { x: dx, y: 5.3 + dy, z: dz + 3.6 }, [1.2, 0.45, 1], [8, 6]))
  for (const s of [-1, 1]) {
    g.add(ball(1.3, shade(DUCK, -0.06), { x: dx + s * 2.7, y: 3 + dy, z: dz - 0.4 }, [0.4, 0.8, 1.2], [8, 6]))
    g.add(noOutline(ball(0.32, EYE, { x: dx + s * 0.85, y: 6.1 + dy, z: dz + 3.35 })))
  }
  g.add(P(ball(1, DUCK, {}, [0.8, 1, 0.6]), dx, 4.6 + dy, dz - 3.6, -0.6))
  return fitGroup(g)
}

// ---------- 牵引绳挂架：墙上一块骨头形木挂板，三只钩上分别挂着折起的牵引绳、一副胸背带和一只骨头形拾便袋盒 ----------

function leashHooks(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const bz = -3.1
  // 骨头形挂板：中间横板 + 两头各两只圆瓣
  g.add(rbox(26, 8, 1.8, main, { y: 49, z: bz }, 0.8))
  for (const sx of [-1, 1]) for (const y of [50.4, 55.6]) g.add(cylZ(4.2, 1.8, main, sx * 12.8, y, bz, 24))
  // 板中间的爪印
  g.add(noOutline(ball(1.1, acc, { y: 54.6, z: bz + 0.9 }, [1.1, 0.9, 0.3], [8, 6])))
  for (const [x, y] of [
    [-1.4, 56.2],
    [-0.5, 56.9],
    [0.5, 56.9],
    [1.4, 56.2],
  ])
    g.add(noOutline(ball(0.45, acc, { x, y, z: bz + 0.9 }, [1, 1, 0.4], [6, 4])))
  // 三只钩：钩杆沿 z 伸出来（轴心高 51、半径 0.45，顶面在 51.45），末端上翘
  for (const x of [-9, 0, 9]) {
    g.add(cylZ(1, 0.4, STEEL, x, 51, bz + 1.1, 12))
    g.add(rod3([x, 51, bz + 0.9], [x, 51, 1.8], 0.45, STEEL, 8))
    g.add(rod3([x, 51, 1.8], [x, 53, 2.4], 0.45, STEEL, 8))
    g.add(ball(0.55, STEEL, { x, y: 53, z: 2.4 }, undefined, [6, 4]))
  }
  // 左钩：折成两股挂着的牵引绳（绳圈搭在钩杆顶上，不是被钩杆从中间穿过），底下垂着锁扣
  g.add(
    tube(
      [
        [-9, 52, 1.2],
        [-11.8, 44, 1.6],
        [-12.6, 26, 1.8],
        [-11.6, 9, 1.9],
        [-9.5, 5, 1.9],
        [-7.2, 8, 1.9],
        [-6.4, 26, 1.8],
        [-6.8, 44, 1.6],
      ],
      0.55,
      sub,
      { closed: true, seg: 48, radial: 6 },
    ),
  )
  g.add(torus(0.9, 0.22, STEEL, { x: -9.5, y: 4.2, z: 1.9 }, PI * 2, [6, 10]))
  g.add(rbox(1.2, 2.8, 1.2, STEEL, { x: -9.5, y: 0.8, z: 1.9 }, 0.4))
  // 中钩：胸背带——D 环（内圈顶挂在钩杆顶面上）、吊带、脖圈、胸垫、胸圈和插扣
  g.add(torus(0.9, 0.22, STEEL, { y: 50.75, z: 1.4 }, PI * 2, [6, 10]))
  g.add(rod3([0, 49.8, 1.4], [0, 44, 1.6], 0.5, acc, 8))
  g.add(torus(5, 0.7, acc, { y: 39, z: 1.6 }, PI * 2, [8, 24]))
  g.add(rbox(5, 9, 1.4, shade(acc, 0.12), { y: 26, z: 1.8 }, 0.6))
  g.add(torus(7, 0.8, acc, { y: 26, z: 1.8 }, PI * 2, [8, 24]))
  g.add(rbox(2.6, 1.6, 1.4, DARK, { x: 6.9, y: 25.2, z: 1.8 }, 0.4))
  // 右钩：登山扣（内圈顶挂在钩杆顶面上，下沿扣进盒顶两只圆头之间）+ 骨头形拾便袋盒 + 露出来的一截袋子；
  // 盒子比别的挂件厚，往墙这边靠一点，整体进深不超过 7
  const pz = 1
  g.add(torus(1.5, 0.25, STEEL, { x: 9, y: 50.15, z: pz }, PI * 2, [6, 12]))
  const knob = (x: number, y: number) => ball(1.6, acc, { x, y }, undefined, [10, 6])
  g.add(P(G(cyl(2, 2, 6, acc, {}, 16), knob(-1, 6), knob(1, 6), knob(-1, 0), knob(1, 0)), 9, 41.4, pz))
  g.add(nub(2.4, 3, 0.3, '#7fc87f', { x: 9, y: 37.6, z: pz }))
  return fitWall(g, 130, 7)
}

// ---------- 宠物推车：四轮车架（后大轮、前万向小轮）上一只软舱，舱上是带撑弧的纱网罩，后面一根推把，底下一只置物篮 ----------

function petStroller(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    // 后轮 + 轮毂
    g.add(cylX(9, 3, RUBBER, s * 22, 9, -28, 20))
    g.add(cylX(3.4, 3.6, sub, s * 22, 9, -28, 12))
    // 前万向轮 + 轮叉
    g.add(cylX(5.5, 2.4, RUBBER, s * 20, 5.5, 30, 18))
    g.add(cylX(2, 3, sub, s * 20, 5.5, 30, 10))
    for (const k of [-1, 1]) g.add(nub(0.8, 7.5, 3, sub, { x: s * 20 + k * 1.7, y: 5, z: 30 }))
    g.add(rbox(4.4, 1.2, 3, sub, { x: s * 20, y: 12, z: 30 }, 0.4))
    // 侧边车架：后轴 → 舱底 → 前叉（两头的球帽大半埋在轮毂 / 叉座里，段数跟管截面走）
    g.add(
      cappedTube(
        [
          [s * 21, 9, -28],
          [s * 21, 30, -22],
          [s * 21, 37.4, -10],
          [s * 21, 37.4, 18],
          [s * 20, 13, 30],
        ],
        1.1,
        sub,
        { seg: 32, radial: 8, capSeg: [8, 6] },
      ),
    )
    // 推把：从后横档往上往后伸（下端接在车架管里、上端包在握把里，不用球帽）
    g.add(
      tube(
        [
          [s * 21, 30, -22],
          [s * 20, 52, -33],
          [s * 18, 97.5, -44.5],
        ],
        1.1,
        sub,
        { seg: 20, radial: 8 },
      ),
    )
    // 置物篮的吊杆
    for (const z of [-8, 16]) g.add(rod3([s * 16.5, 23.8, z], [s * 21, 37.4, z], 0.5, sub, 6))
  }
  g.add(rod3([-22, 9, -28], [22, 9, -28], 0.8, STEEL, 8))
  g.add(rod3([-21, 30, -22], [21, 30, -22], 0.9, sub, 8))
  // 推把的泡棉握把
  g.add(cylX(1.8, 40, DARK, 0, 97.5, -44.5, 14))
  // 置物篮
  g.add(tray(34, 7, 40, 0.8, shade(main, -0.12), { y: 17, z: 2 }, 0.4))
  // 舱体 + 上沿一圈饰边 + 舱底软垫
  g.add(rbox(44, 17, 62, main, { y: 37.6, z: -2 }, 5))
  g.add(rbox(41, 1.6, 59, shade(main, 0.18), { y: 54, z: -2 }, 0.8))
  for (const s of [-1, 1]) {
    g.add(rbox(45, 2.6, 1.6, acc, { y: 53.4, z: -2 + s * 30.7 }, 0.6))
    g.add(rbox(1.6, 2.6, 63, acc, { x: s * 21.7, y: 53.4, z: -2 }, 0.6))
  }
  // 纱网罩：三道撑弧 + 半圆筒纱网 + 前后两片半圆纱网（半圆都分 16 段，接缝对得上；三片纱网同色同透明度，烘成一个网格）
  for (const z of [-28, -2, 24]) g.add(P(torus(20.5, 0.9, acc, {}, PI), 0, 55.6, z))
  g.add(
    ghost(
      bakeMeshes(
        [
          P(mesh(new THREE.CylinderGeometry(20.2, 20.2, 52, 16, 1, true, -PI / 2, PI), MESH), 0, 55.6, -2, -PI / 2),
          P(mesh(new THREE.CircleGeometry(20.2, 16, 0, PI), MESH), 0, 55.6, 24),
          P(mesh(new THREE.CircleGeometry(20.2, 16, 0, PI), MESH), 0, 55.6, -28, 0, PI),
        ],
        MESH,
      ),
      MESH,
      0.45,
    ),
  )
  return fitGroup(g)
}

// ---------- 宠物美容桌：防滑胶垫桌面、两副折叠钢腿和斜撑，右后角夹着一根 L 形吊杆，杆头垂下一只牵引环 ----------

const GT = { w: 80, d: 50, h: 76 }
function groomingTable(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const H = GT.h
  // 桌板 + 胶垫（垫面 = H）+ 垫面的防滑纹
  g.add(rbox(GT.w, 3, GT.d, sub, { y: H - 4 }, 0.8))
  g.add(rbox(GT.w - 1.6, 1.2, GT.d - 1.6, main, { y: H - 1.2 }, 0.5))
  for (let k = -5; k <= 5; k++) g.add(noOutline(box(GT.w - 6, 0.12, 0.6, shade(main, -0.1), { y: H - 0.06, z: k * 4 })))
  // 两副折叠腿：两条腿 + 底横管 + 铰链座 + 斜撑
  for (const sx of [-1, 1]) {
    const x = sx * 30
    for (const sz of [-1, 1]) {
      g.add(rod3([x, 1.2, sz * 20], [x, H - 4, sz * 19], 1.3, STEEL, 12))
      g.add(cyl(1.8, 2, 1.4, RUBBER, { x, z: sz * 20 }, 12))
      g.add(rbox(4, 2.4, 4, DARK, { x, y: H - 6.2, z: sz * 19 }, 0.5))
      g.add(rod3([x, 32, sz * 19.6], [sx * 8, H - 4, sz * 19.6], 0.8, STEEL, 8))
    }
    g.add(rod3([x, 14, -20], [x, 14, 20], 1.1, STEEL, 10))
  }
  // 吊杆：夹座 + 竖杆 + 弯过来的横臂 + 垂绳和牵引环
  const px = 38.5
  const pz = -21
  g.add(rbox(5, 8, 5, DARK, { x: px, y: H - 7, z: pz }, 0.8))
  g.add(cylZ(1.4, 3, DARK, px, H - 3, pz - 3.5, 12))
  g.add(
    cappedTube(
      [
        [px, H + 0.5, pz],
        [px, 144.7, pz],
        [px - 1.2, 147.7, pz + 0.4],
        [px - 5, 148.5, pz + 1.6],
        [4, 148.5, -12],
      ],
      1.3,
      STEEL,
      { seg: 40, radial: 8, capSeg: [8, 6] },
    ),
  )
  g.add(rod3([4, 147.3, -12], [4, 128.2, -12], 0.35, acc, 6))
  g.add(cyl(0.9, 0.9, 1.6, DARK, { x: 4, y: 128.4, z: -12 }, 10))
  g.add(torus(5, 0.5, acc, { x: 4, y: 123.2, z: -12 }, PI * 2, [6, 24]))
  return g
}

// ---------- 斗鱼缸组：木架上并排三只小方缸，缸底铺砂、插两片水草，各养一条大尾巴的斗鱼，缸顶一块小盖 ----------

/** 斗鱼：头朝 +x，身子小、尾鳍和背鳍、臀鳍都很大（三四厘米的小鱼：身子 8 × 6 段，鳍是薄片 8 × 4 段） */
function betta(color: string) {
  const g = new THREE.Group()
  g.add(ball(1.1, color, {}, [1.5, 1, 0.6], [8, 6]))
  g.add(P(ball(1.6, color, {}, [0.9, 1.35, 0.15], [8, 4]), -2.2, 0, 0))
  g.add(P(ball(1.1, shade(color, 0.08), {}, [1.2, 0.7, 0.12], [8, 4]), -0.5, 1.1, 0, 0, 0, -0.3))
  g.add(P(ball(1.1, shade(color, 0.08), {}, [1.3, 0.75, 0.12], [8, 4]), -0.6, -1.1, 0, 0, 0, 0.3))
  for (const s of [-1, 1]) g.add(noOutline(ball(0.22, EYE, { x: 1.1, y: 0.25, z: s * 0.5 }, undefined, [6, 4])))
  return g
}

/** 水草叶：压扁的长椭球（同 toon.ts 的 leaf，段数压到 8 × 4） */
const weed = (len: number, color: string) => leaf(len, color, {}, [8, 4])

function bettaTanks(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  // 木架：两条脚 + 底板（背面和立柱齐平，z = ±7.4）+ 后面两根立柱和一根横档
  for (const sx of [-1, 1]) g.add(rbox(3, 2, 14, main, { x: sx * 21 }, 0.5))
  g.add(rbox(50, 2, 14.8, main, { y: 2 }, 0.6))
  for (const sx of [-1, 1]) g.add(rbox(2.4, 20, 2.4, main, { x: sx * 23.6, y: 4, z: -6.2 }, 0.5))
  g.add(rbox(49.6, 2, 2.4, main, { y: 22, z: -6.2 }, 0.5))
  const fish = ['#d8383a', '#3f6fd8', '#8a4fc8']
  // 半透明件不参与按材质合并：三只缸的 15 片玻璃烘成一个网格、三团水体烘成一个（水面要单独留着，开着反射时各自换成会动的水）
  const panes: THREE.Mesh[] = []
  const waters: THREE.Mesh[] = []
  for (let i = -1; i <= 1; i++) {
    const x = i * 15.2
    const z = 0.6
    // 玻璃缸（3.5mm 厚的玻璃片，直角盒）+ 底砂 + 水 + 水面
    panes.push(box(14, 0.35, 12, C.glass, { x, y: 4, z }))
    for (const s of [-1, 1]) {
      panes.push(box(14, 17, 0.35, C.glass, { x, y: 4, z: z + s * 5.82 }))
      panes.push(box(0.35, 17, 11.3, C.glass, { x: x + s * 6.82, y: 4, z }))
    }
    g.add(rbox(13.2, 1.6, 11.2, sub, { x, y: 4.3, z }, 0.3))
    waters.push(box(13.2, 11.5, 11.2, WATER, { x, y: 5.95, z }))
    g.add(markWater(ghost(box(13.2, 0.3, 11.2, WATER, { x, y: 17.55, z }), WATER, 0.45)))
    // 水草两片
    g.add(P(weed(6, PLANT), x - 4, 8.4, z - 2, -PI / 2 + 0.15, 0.4))
    g.add(P(weed(4.6, shade(PLANT, 0.08)), x - 2.4, 7.6, z - 3, -PI / 2 - 0.1, -0.5))
    // 斗鱼
    g.add(P(betta(fish[i + 1]), x + 1.4, 12 + i * 0.6, z + 1, 0, i * 0.25))
    // 小盖 + 投食口的小钮
    g.add(rbox(14.4, 0.8, 12.4, acc, { x, y: 20.8, z }, 0.3))
    g.add(cyl(0.9, 0.9, 0.8, shade(acc, -0.1), { x: x + 3.5, y: 21.4, z }, 10))
    // 底板前沿的名牌（比底板前沿凸出 0.1，整体进深正好 15）
    g.add(noOutline(box(4, 1.2, 0.3, CREAM, { x, y: 2.4, z: 7.35 })))
  }
  g.add(ghost(bakeMeshes(panes, C.glass), C.glass, 0.25))
  g.add(ghost(bakeMeshes(waters, WATER), WATER, 0.18))
  return fitGroup(g)
}

// ======================================================================
// 育儿
// ======================================================================

// ---------- 儿童小马桶：圆鼓鼓的坐便椅——带兔耳的靠背、两侧扶手、座圈前面的防溅挡，座圈里看得见浅色内胆，正面贴一朵小花 ----------

function potty(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const ez = 1.12
  // 椅身：上小下大的空心筒，前后拉长一点
  const body = cup(12, 13.5, 16, 1.2, main, {}, 24)
  body.scale.set(1, 1, ez)
  g.add(body)
  // 可抽出的内胆：坐在椅身的底板上（底板顶面 1.2）
  const pot = cup(10, 8.6, 9, 0.6, acc, { y: 1.1 }, 24)
  pot.scale.set(1, 1, ez)
  g.add(pot)
  g.add(rbox(5, 1.4, 3, acc, { y: 9.2, z: -11.4 }, 0.5))
  // 座圈 + 防溅挡
  g.add(holePanel(27, 30, 1.8, sub, [{ kind: 'circle', x: 0, y: 15.5, r: 7.5 }], { y: 16.5, z: 15, rx: -PI / 2 }, 9))
  g.add(P(rbox(11, 5.5, 1.6, sub, {}, 0.7), 0, 19.2, 8.6, -0.35))
  // 靠背 + 兔耳
  g.add(P(rbox(24, 11, 2.6, main, {}, 1.2), 0, 22.4, -13.6, -0.12))
  for (const s of [-1, 1]) {
    g.add(P(ball(2.6, main, {}, [0.7, 1.3, 0.45]), s * 7, 28.6, -14.2, -0.12, 0, -s * 0.15))
    g.add(noOutline(P(ball(1.6, acc, {}, [0.6, 1.1, 0.2]), s * 7, 28.6, -12.85, -0.12, 0, -s * 0.15)))
  }
  // 扶手
  for (const s of [-1, 1]) g.add(rbox(3.2, 5, 14, main, { x: s * 11.9, y: 16.8, z: -4 }, 1.4))
  // 正面的小花贴纸
  // 椅身正面在 y = 8 处的 z：外半径 13.5 - 1.5 × 8 / 16，再乘前后拉长的倍数
  const fz = 12.75 * ez
  g.add(noOutline(ball(0.9, sub, { y: 8, z: fz + 0.05 }, [1, 1, 0.3], [8, 4])))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + PI / 2
    g.add(noOutline(ball(1, acc, { x: Math.cos(a) * 1.6, y: 8 + Math.sin(a) * 1.6, z: fz - 0.15 }, [1, 1, 0.3], [8, 4])))
  }
  return fitGroup(g)
}

// ---------- 婴儿澡盆：椭圆浅盆，里面一块斜放的防滑躺板（头枕一头高），底上排水塞，浅浅一层水上漂着小黄鸭，盆沿挂一只水瓢 ----------

function babyTub(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const ex = 1.65
  const tub = cup(24, 20, 24, 1.4, main)
  tub.scale.set(ex, 1, 1)
  g.add(tub)
  // 防滑躺板：高的一头带头枕，板面一排排防滑点，下面一块撑板
  const board = new THREE.Group()
  board.add(rbox(34, 1.6, 28, sub, { y: -0.8 }, 0.8))
  for (let i = 0; i < 5; i++) for (let j = -1; j <= 1; j++) board.add(noOutline(ball(0.9, shade(sub, -0.12), { x: -6 + i * 4.5, y: 0.85, z: j * 7 }, [1, 0.35, 1], [6, 4])))
  board.add(ball(5, shade(sub, 0.08), { x: -12, y: 1.2 }, [1, 0.35, 1.6], [16, 10]))
  P(board, -14, 11, 0, 0, 0, -0.42)
  g.add(board)
  g.add(rbox(2, 15.4, 24, sub, { x: -27, y: 1.4 }, 0.6))
  // 排水塞
  g.add(cyl(2.2, 2.4, 0.9, acc, { x: 24, y: 1.1 }, 16))
  g.add(torus(0.8, 0.22, acc, { x: 24, y: 2.4, rx: 0 }, PI * 2, [6, 10]))
  // 一层水：淡淡的水体 + 水面。和盆一样 32 段、边缘压进盆壁（盆的内皮在水面高度半径 19.9、外皮 21.4），水和盆壁之间不留缝
  const wb = ghost(cyl(20.2, 19.2, 6.7, WATER, { y: 1.5 }, 32), WATER, 0.2)
  wb.scale.set(ex, 1, 1)
  g.add(wb)
  const ws = markWater(ghost(cyl(20.4, 20.4, 0.3, WATER, { y: 8.25 }, 32), WATER, 0.45))
  ws.scale.set(ex, 1, 1)
  g.add(ws)
  // 小黄鸭（头朝 +x）
  const dx = 4
  const dz = -8
  g.add(ball(3.2, DUCK, { x: dx, y: 9.4, z: dz }, [1.15, 0.8, 1], [12, 8]))
  g.add(ball(2.2, DUCK, { x: dx + 2.2, y: 13, z: dz }))
  g.add(ball(0.9, BEAK, { x: dx + 4.4, y: 12.6, z: dz }, [1.2, 0.45, 1], [8, 6]))
  g.add(P(ball(1.1, DUCK, {}, [1, 0.7, 0.8], [8, 6]), dx - 3.4, 10.8, dz, 0, 0, 0.6))
  for (const s of [-1, 1]) g.add(noOutline(ball(0.32, EYE, { x: dx + 3.6, y: 13.6, z: dz + s * 1.1 })))
  // 水瓢：挂在 +x 一头的盆沿上——弯柄从瓢口翻过盆沿（z = 9 处盆沿顶在 y = 24、x = 34.2～36.7），在盆外垂下一小截
  g.add(cup(4.8, 3.8, 6, 0.5, acc, { x: 27, y: 12, z: 9 }, 16))
  g.add(
    cappedTube(
      [
        [30.8, 17.4, 9],
        [32.6, 22, 9],
        [35.2, 24.7, 9],
        [37.6, 23.8, 9],
        [38.3, 21, 9],
      ],
      0.7,
      acc,
      { seg: 20, radial: 8, capSeg: [8, 6] },
    ),
  )
  return fitGroup(g)
}

// ---------- 床铃：一段婴儿床栏上夹着夹座，弯臂伸到前面，伞形转盘下垂着五只小玩偶（星星、月亮、云朵、小熊、小兔） ----------

function mobileStar(color: string) {
  return G(starMesh(2.6, 1.2, 1, color))
}
function mobileMoon(color: string) {
  return G(P(torus(1.8, 0.85, color, {}, PI * 1.25, [8, 10]), 0, 0, 0, 0, 0, PI * 0.38))
}
function mobileCloud() {
  return G(ball(1.5, WHITE, { x: -1.6, y: -0.3 }, undefined, [10, 6]), ball(2, WHITE, { y: 0.4 }), ball(1.5, WHITE, { x: 1.6, y: -0.3 }, undefined, [10, 6]), face(2.4, { y: 0.1, z: 1.75 }))
}
function mobileBear(color: string) {
  const g = new THREE.Group()
  g.add(ball(2.2, color))
  for (const s of [-1, 1]) g.add(ball(0.8, color, { x: s * 1.6, y: 1.6 }))
  g.add(ball(0.85, shade(color, 0.15), { y: -0.6, z: 1.7 }, [1.2, 0.85, 0.7], [8, 6]))
  g.add(noOutline(ball(0.28, EYE, { y: -0.35, z: 2.3 }, undefined, [6, 4])))
  g.add(face(2.8, { y: 0.5, z: 1.95 }))
  return g
}
function mobileBunny(color: string) {
  const g = new THREE.Group()
  g.add(ball(2.1, color))
  for (const s of [-1, 1]) g.add(P(ball(0.7, color, {}, [0.6, 2, 0.5]), s * 0.9, 2.8, 0, 0, 0, -s * 0.15))
  g.add(face(2.8, { y: 0.1, z: 1.85 }))
  return g
}

function cribMobile(p: string[]) {
  const [rail, canopy, acc] = p
  const g = new THREE.Group()
  const rz = -14
  // 床栏：两根立柱 + 上下横档 + 三根栏杆，底下两只稳脚
  for (const s of [-1, 1]) {
    g.add(rbox(3.4, 44, 3.4, rail, { x: s * 15, y: 1.6, z: rz }, 0.8))
    g.add(rbox(4.6, 1.8, 18, rail, { x: s * 15, z: rz + 2 }, 0.6))
  }
  g.add(rbox(33, 3, 4, rail, { y: 40, z: rz }, 0.8))
  g.add(rbox(28, 2.4, 3, rail, { y: 7, z: rz }, 0.6))
  for (const x of [-7.5, 0, 7.5]) g.add(cyl(0.9, 0.9, 31.4, rail, { x, y: 9.2, z: rz }, 10))
  // 夹座 + 背后的旋钮
  g.add(rbox(7, 9, 7, acc, { y: 37, z: rz }, 1.2))
  g.add(cylZ(1.8, 2.4, shade(acc, -0.12), 0, 39.5, rz - 4.6, 14))
  // 弯臂
  const hz = 3
  g.add(
    cappedTube(
      [
        [0, 45.5, rz],
        [0, 62, rz],
        [0, 68.5, rz + 4],
        [0, 69.5, rz + 11],
        [0, 68.4, hz],
      ],
      0.9,
      acc,
      { seg: 28, radial: 8, capSeg: [8, 6] },
    ),
  )
  // 伞形转盘：短轴 + 伞面 + 一圈花边（十二颗 2cm 的小球，8 × 6 段）+ 顶上的小球
  g.add(cyl(0.6, 0.6, 3.4, STEEL, { y: 65, z: hz }, 8))
  g.add(cyl(1, 9, 3.6, canopy, { y: 61.6, z: hz }, 24))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2
    g.add(ball(1.1, k % 2 ? acc : canopy, { x: Math.cos(a) * 8.6, y: 61.8, z: hz + Math.sin(a) * 8.6 }, undefined, [8, 6]))
  }
  g.add(ball(1.6, acc, { y: 66.6, z: hz }, undefined, [10, 6]))
  // 五根辐条，各垂下一只小玩偶（都面朝 +z）
  const toys: [THREE.Object3D, number][] = [
    [mobileStar(C.lemon), 2.6],
    [mobileMoon('#ffe6a0'), 2.2],
    [mobileCloud(), 2.2],
    [mobileBear(C.peach), 2.4],
    [mobileBunny(C.sakura), 2.1],
  ]
  toys.forEach(([toy, top], k) => {
    const a = (k / 5) * PI * 2 + PI / 2
    const x = Math.cos(a) * 13
    const z = hz + Math.sin(a) * 13
    g.add(rod3([Math.cos(a) * 3, 62.4, hz + Math.sin(a) * 3], [x, 61, z], 0.35, STEEL, 6))
    const y = 50 - (k % 2) * 4
    g.add(thread([x, 61, z], [x, y + top - 0.2, z], 0.12, '#bfb6a8'))
    g.add(P(toy, x, y, z))
  })
  return fitGroup(g)
}

// ---------- 婴儿摇椅：侧面呈 Z 形的钢管底架、往下兜的网布躺兜（中间一块软垫、三点式安全带），头顶一根玩具拱杆挂两只小玩具 ----------

function babyBouncer(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  const fx = 17.5
  // 钢管架：每侧一根 Z 形弯管（地上一横 → 斜上 → 回折成躺兜的上沿），前后各一根横管。地上那一横中间多给两个控制点，
  // 免得弯管在拐弯前往下兜，比橡胶套还低
  for (const s of [-1, 1])
    g.add(
      tube(
        [
          [s * fx, 1.2, 29],
          [s * fx, 1.2, 4],
          [s * fx, 1.2, -16],
          [s * fx, 1.2, -24],
          [s * fx, 3, -28.5],
          [s * fx, 7, -27],
          [s * fx, 31, 22],
          [s * fx, 33.6, 26],
          [s * fx, 36, 23.5],
          [s * fx, 49, -21],
        ],
        1.1,
        sub,
        { seg: 64, radial: 8 },
      ),
    )
  g.add(rod3([-fx, 1.2, 29], [fx, 1.2, 29], 1.1, sub, 10))
  g.add(rod3([-fx, 49, -21], [fx, 49, -21], 1.1, sub, 10))
  g.add(rod3([-fx, 7, -27], [fx, 7, -27], 1.1, sub, 10))
  for (const s of [-1, 1]) for (const z of [20, -16]) g.add(cylZ(1.5, 5, RUBBER, s * fx, 1.2, z, 12))
  // 躺兜：脚端（前）低、头端（后）高，中间往下兜；两头的滚边都搭在钢管上（钢管在脚端 z = 21 处轴心高 36.7、头端 z = -19 处高 48.4）
  const a: [number, number] = [21, 35.6]
  const b: [number, number] = [-19, 48]
  const sling = (u: number, v: number): V3 => {
    const z = a[0] + (b[0] - a[0]) * v
    const y = a[1] + (b[1] - a[1]) * v - 8 * Math.pow(Math.sin(PI * v), 0.8) * (1 - 0.35 * u * u)
    return [u * 16.8, y, z]
  }
  g.add(sheet(sling, 8, 16, 0.6, main))
  // 两侧和两头的滚边
  for (const s of [-1, 1]) g.add(tube(Array.from({ length: 9 }, (_, i) => sling(s, i / 8)), 0.6, shade(main, -0.12), { seg: 24, radial: 6 }))
  for (const v of [0, 1]) g.add(tube(Array.from({ length: 7 }, (_, i) => sling(-1 + i / 3, v)), 0.6, shade(main, -0.12), { seg: 16, radial: 6 }))
  // 中间的软垫
  g.add(sheet((u, v) => {
    const [x, y, z] = sling(u * 0.62, 0.12 + v * 0.74)
    return [x, y + 0.5, z]
  }, 6, 12, 0.5, sub))
  // 三点式安全带：胯带 + 两条肩带，交汇处一只插扣
  const lift = (q: V3, k = 0.9): V3 => [q[0], q[1] + k, q[2]]
  const buckle = lift(sling(0, 0.42), 1.1)
  g.add(tube([lift(sling(0, 0.2)), lift(sling(0, 0.31), 1), buckle], 0.45, acc, { seg: 10, radial: 6 }))
  for (const s of [-1, 1]) g.add(tube([buckle, lift(sling(s * 0.22, 0.6), 1.1), lift(sling(s * 0.36, 0.8))], 0.45, acc, { seg: 12, radial: 6 }))
  g.add(P(rbox(3, 0.8, 2.4, DARK, {}, 0.3), buckle[0], buckle[1] + 0.2, buckle[2], 0.3))
  // 玩具拱杆：搭在两侧的上沿上，挂一颗星星和一只摇铃球
  const az = 2
  const ay = 36 + (13 * (23.5 - az)) / 44.5
  g.add(P(torus(fx, 0.9, acc, {}, PI), 0, ay, az))
  for (const s of [-1, 1]) g.add(rbox(3, 2.4, 3, acc, { x: s * fx, y: ay - 1.6, z: az }, 0.8))
  const hang: [number, THREE.Object3D, number][] = [
    [0.33 * PI, G(starMesh(2.4, 1.1, 1, C.lemon)), 2.4],
    [0.67 * PI, G(ball(1.8, C.mint), noOutline(torus(1.85, 0.3, WHITE, { rx: PI / 2 }, PI * 2, [6, 12]))), 1.8],
  ]
  for (const [t, toy, top] of hang) {
    const x = Math.cos(t) * fx
    const y = ay + Math.sin(t) * fx
    const ty = y - 6
    g.add(thread([x, y - 0.6, az], [x, ty + top - 0.2, az], 0.12, '#bfb6a8'))
    g.add(P(toy, x, ty, az))
  }
  return fitGroup(g)
}

// ---------- 婴儿健身架：圆形软垫（滚边、几块圆形花样）上两根交叉的布包拱杆，拱杆上挂着摇铃、小镜子、小象和星星 ----------

/** 摇铃：一只圆环，中间嵌一颗白球（球比环的内径大一点，卡在环里，不是悬在环中间），环上两颗小珠 */
function gymRattle(color: string) {
  const bead = (x: number) => ball(0.6, shade(color, 0.15), { x }, undefined, [6, 4])
  return G(torus(2, 0.5, color, {}, PI * 2, [6, 16]), ball(1.6, WHITE), bead(2), bead(-2))
}
function gymMirror(color: string) {
  const g = new THREE.Group()
  g.add(cylZ(3.2, 0.9, color, 0, 0, 0, 24))
  g.add(noOutline(cylZ(2.5, 0.3, '#e3ebf2', 0, 0, 0.5, 24)))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2
    g.add(ball(0.75, shade(color, 0.12), { x: Math.cos(a) * 3.3, y: Math.sin(a) * 3.3 }, undefined, [6, 4]))
  }
  return g
}
function gymElephant(color: string) {
  const g = new THREE.Group()
  g.add(ball(2.4, color))
  for (const s of [-1, 1]) g.add(ball(1.8, shade(color, 0.08), { x: s * 2.4, y: 0.2, z: -0.3 }, [0.35, 1, 0.9]))
  g.add(cappedTube([[0, -0.6, 2], [0, -2.2, 2.6], [0, -3.2, 2]], 0.6, color, { seg: 8, radial: 6 }))
  g.add(face(3, { y: 0.6, z: 2.15 }))
  return g
}

function playGym(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  // 软垫 + 滚边 + 垫面的圆形花样
  g.add(puck(43, 3, main))
  g.add(torus(42.2, 1.6, sub, { y: 2.2, rx: PI / 2 }, PI * 2, [8, 32]))
  for (const [x, z, r, c] of [
    [-18, 10, 9, acc],
    [16, -14, 6, sub],
    [14, 18, 7, CREAM],
    [-12, -20, 5, acc],
    [26, 4, 4, CREAM],
  ] as [number, number, number, string][])
    g.add(noOutline(cyl(r, r, 0.5, c, { x, y: 2.85, z }, 20)))
  // 两根交叉的拱杆 + 四只卡脚 + 交叉处的结
  const AR = 39
  const arches = [PI / 4, -PI / 4]
  for (const ry of arches) {
    g.add(P(torus(AR, 1.5, sub, {}, PI, [8, 16]), 0, 3, 0, 0, ry))
    for (const s of [-1, 1]) g.add(cyl(2.4, 2.8, 1.8, shade(sub, -0.1), { x: s * AR * Math.cos(ry), y: 2.6, z: -s * AR * Math.sin(ry) }, 16))
  }
  g.add(ball(2.6, acc, { y: 3 + AR }))
  // 挂件：在拱杆上的角度 t 处垂下来
  const hang: [number, number, THREE.Object3D, number][] = [
    [arches[0], 0.75, gymRattle(acc), 2.5],
    [arches[0], 2.4, gymMirror(C.sky), 3.9],
    [arches[1], 0.75, gymElephant(C.lilac), 2.4],
    [arches[1], 2.4, G(starMesh(2.8, 1.3, 1.1, C.lemon)), 2.8],
  ]
  for (const [ry, t, toy, top] of hang) {
    const lx = AR * Math.cos(t)
    const x = lx * Math.cos(ry)
    const z = -lx * Math.sin(ry)
    const y = 3 + AR * Math.sin(t) - 1.4
    const ty = y - 10
    g.add(thread([x, y, z], [x, ty + top - 0.2, z], 0.15, '#bfb6a8'))
    g.add(P(toy, x, ty, z))
  }
  return fitGroup(g)
}

// ---------- 恐龙玩具组：三只圆滚滚的小恐龙——霸王龙（大头小手）、三角龙（颈盾和三只角）、腕龙（长脖子），都面朝前 ----------

/** 十厘米上下的塑料小恐龙：身子、脑袋这些大球一圈 12 段，手脚、斑点这些小球再低一档 */
const DINO: [number, number] = [12, 10]

function trex(c: string) {
  const g = new THREE.Group()
  const belly = shade(c, 0.12)
  for (const s of [-1, 1]) {
    g.add(rbox(3, 5, 3.5, c, { x: s * 2.2, z: -1 }, 1.4))
    g.add(ball(1.8, c, { x: s * 2.2, y: 1, z: 0.5 }, [1, 0.6, 1.3], [8, 6]))
    g.add(ball(0.9, c, { x: s * 3, y: 9.5, z: 2.6 }, [0.7, 0.7, 1.2], [6, 4]))
  }
  g.add(ball(4.5, c, { y: 8, z: -1 }, [0.9, 1.1, 1], DINO))
  // 浅色的肚皮：比身子正面（z ≈ 3.5）凸出 0.35，四周收进身子里（原先整个埋在身子里看不见）
  g.add(ball(3, belly, { y: 7.6, z: 2.05 }, [0.9, 1.1, 0.6], [10, 8]))
  g.add(ball(3.6, c, { y: 13.5, z: 2 }, [0.95, 0.9, 1.2], DINO))
  g.add(taperRod3([0, 7, -4.5], [0, 3.6, -10], 2.6, 0.7, c, 10))
  g.add(ball(0.75, c, { y: 3.6, z: -10 }))
  for (const [y, z] of [
    [16.4, 0.5],
    [15.3, -1.6],
    [12.6, -4],
    [9.4, -5],
  ])
    g.add(P(cyl(0, 0.8, 1.4, belly, {}, 8), 0, y, z, -0.5))
  g.add(face(4, { y: 14, z: 5.9 }))
  return g
}

function triceratops(c: string) {
  const g = new THREE.Group()
  const frill = shade(c, 0.12)
  g.add(ball(4.8, c, { y: 5.2, z: -1 }, [0.95, 0.8, 1.35], DINO))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.4, 1.6, 3, c, { x: sx * 2.8, z: sz * 3.2 - 0.6 }, 8))
  g.add(cylZ(4.2, 0.8, frill, 0, 7, 4.2, 16))
  for (let k = 0; k < 7; k++) {
    const a = PI * 0.1 + (k / 6) * PI * 0.8
    g.add(noOutline(ball(0.55, shade(c, -0.1), { x: Math.cos(a) * 3.3, y: 7 + Math.sin(a) * 3.3, z: 3.7 }, undefined, [6, 4])))
  }
  g.add(ball(3, c, { y: 5.6, z: 6.5 }, [1, 0.9, 1.1], DINO))
  for (const s of [-1, 1]) g.add(taperRod3([s * 1.3, 7.3, 7.8], [s * 1.6, 9.6, 10.6], 0.6, 0.12, CREAM, 6))
  g.add(taperRod3([0, 5.4, 9.6], [0, 6.6, 10.8], 0.55, 0.12, CREAM, 6))
  g.add(taperRod3([0, 5, -7], [0, 2.5, -11], 2, 0.5, c, 8))
  g.add(face(3.2, { y: 6, z: 9.65 }))
  return g
}

function brachio(c: string) {
  const g = new THREE.Group()
  const spot = shade(c, 0.12)
  g.add(ball(4.2, c, { y: 6, z: -1.5 }, [0.9, 0.85, 1.25], DINO))
  for (const sx of [-1, 1]) for (const z of [1.2, -4]) g.add(cyl(1.3, 1.4, 4.5, c, { x: sx * 2.4, z }, 8))
  // 脖子和脑袋比原先矮 0.3、尾巴短 0.2：三只摆在一起正好 21 深、18 高
  g.add(taperRod3([0, 8, 1], [0, 15.2, 4], 1.9, 1.2, c, 10))
  g.add(ball(2.2, c, { y: 16, z: 5 }, [0.9, 0.85, 1.25]))
  g.add(taperRod3([0, 6, -6.5], [0, 3, -10.8], 1.8, 0.4, c, 8))
  for (const [x, y, z] of [
    [1.6, 9.2, -2],
    [-1.4, 9.4, -0.4],
    [0.3, 9.6, -3.6],
  ])
    g.add(noOutline(ball(0.9, spot, { x, y, z }, [1, 0.3, 1], [8, 4])))
  g.add(face(2.4, { y: 16.3, z: 7.6 }))
  return g
}

function dinoToys(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  g.add(P(trex(a), -13, 0, 0, 0, 0.25))
  const tri = triceratops(b)
  tri.scale.setScalar(0.9)
  g.add(P(tri, 0.5, 0, 0.5))
  g.add(P(brachio(c), 13.5, 0, 0, 0, -0.25))
  return fitGroup(g)
}

// ---------- 儿童篮球架：注水底座（后面两只小轮）、两节伸缩立杆、小篮板（白框和小方框）、篮筐和用细线示意的网，地上一只小篮球 ----------

function kidsHoop(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  // 注水底座 + 注水盖 + 两只小轮
  g.add(rbox(54, 14, 56, main, { z: -12 }, 6))
  g.add(cyl(3.4, 3.6, 1.6, shade(main, -0.12), { x: 14, y: 13.6, z: -4 }, 16))
  for (const s of [-1, 1]) {
    g.add(cylX(4, 2.5, RUBBER, s * 28.2, 4, -34, 16))
    g.add(cylX(1.4, 3, STEEL, s * 28.2, 4, -34, 8))
  }
  // 立杆：下节粗、上节细，中间一只调节卡箍和旋钮；底座前面一根斜撑
  const pz = -34
  g.add(cyl(2.8, 2.8, 92, main, { y: 13, z: pz }, 16))
  g.add(cyl(2.2, 2.2, 54, STEEL, { y: 103, z: pz }, 16))
  g.add(cyl(3.4, 3.4, 4, shade(main, -0.12), { y: 102, z: pz }, 16))
  g.add(cylX(1, 4, DARK, 4.6, 104, pz, 10))
  g.add(ball(2.4, shade(main, -0.12), { y: 157, z: pz }))
  g.add(rod3([0, 13.5, -10], [0, 48, pz + 2.2], 1.4, main, 10))
  // 篮板：板 + 白框 + 篮筐上方的小方框，背后两只支架接立杆
  const by = 120
  const bz = pz + 5
  g.add(rbox(54, 38, 2.2, sub, { y: by, z: bz + 1.1 }, 1))
  const fz = bz + 2.2 + 0.2
  const strip = (w: number, h: number, x: number, y: number) => g.add(noOutline(box(w, h, 0.4, WHITE, { x, y, z: fz })))
  strip(50, 1.4, 0, by + 34.6)
  strip(50, 1.4, 0, by + 2)
  for (const s of [-1, 1]) strip(1.4, 32.6, s * 24.3, by + 2)
  strip(18, 1.2, 0, by + 18)
  for (const s of [-1, 1]) strip(1.2, 10, s * 8.4, by + 8)
  for (const y of [by + 6, by + 28]) g.add(rbox(4, 4, 4.4, DARK, { y, z: pz + 3 }, 0.6))
  // 篮筐：托架 + 圆环 + 网（12 根斜线收到下面的小圈，中间一道腰圈）
  const ry = by + 8
  const rr = 10
  const rcz = fz + 1.5 + rr
  // 托架的背面压进篮板正面（篮板正面在 fz - 0.2）
  g.add(rbox(6, 6, 1.4, acc, { y: ry - 5, z: fz + 0.4 }, 0.4))
  g.add(rbox(6, 1.2, 4.4, acc, { y: ry - 0.6, z: fz + 1.9 }, 0.4))
  g.add(torus(rr, 0.7, acc, { y: ry, z: rcz, rx: PI / 2 }, PI * 2, [8, 24]))
  const k2 = 0.62
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2
    const a2 = a + 0.26
    g.add(thread([Math.cos(a) * rr, ry - 0.5, rcz + Math.sin(a) * rr], [Math.cos(a2) * rr * k2, ry - 13, rcz + Math.sin(a2) * rr * k2], 0.18, NET))
  }
  // 网的两道圈是几毫米粗的细线：截面 4 段，一圈 24 段（和 12 根斜线对得上）
  g.add(noOutline(torus(rr * k2, 0.25, NET, { y: ry - 13, z: rcz, rx: PI / 2 }, PI * 2, [4, 24])))
  g.add(noOutline(torus(rr * 0.82, 0.22, NET, { y: ry - 6.5, z: rcz, rx: PI / 2 }, PI * 2, [4, 24])))
  // 地上的小篮球（两道黑线）
  const bc: V3 = [14, 9, 26]
  g.add(ball(9, BALL, { x: bc[0], y: bc[1], z: bc[2] }))
  g.add(noOutline(torus(9.1, 0.2, DARK, { x: bc[0], y: bc[1], z: bc[2] }, PI * 2, [6, 24])))
  g.add(noOutline(torus(9.1, 0.2, DARK, { x: bc[0], y: bc[1], z: bc[2], ry: PI / 2 }, PI * 2, [6, 24])))
  return fitGroup(g)
}

// ---------- 室内秋千：木质 A 字落地架（两侧各两条斜腿和一根横撑、顶上金属连接件），横梁上两只吊环垂下四根绳，吊着带前护栏的幼儿座椅 ----------

const SW = { X: 56, Z: 62, top: 162 }
function indoorSwing(p: string[]) {
  const [wood, seat, rail] = p
  const g = new THREE.Group()
  const { X, Z, top } = SW
  const y0 = 1.2
  const zAt = (y: number) => Z - ((Z - 3) * (y - y0)) / (top + 2 - y0)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(batten([sx * X, y0, sz * Z], [sx * X, top + 2, sz * 3], 6, 6, wood, 1))
      g.add(rbox(8, 1.4, 10, RUBBER, { x: sx * X, z: sz * (Z - 0.5) }, 0.5))
    }
    g.add(rbox(4.5, 4, 2 * zAt(36) + 2, wood, { x: sx * X, y: 34 }, 1))
    g.add(rbox(8, 14, 14, DARK, { x: sx * X, y: top - 10 }, 1))
  }
  g.add(rbox(2 * X + 10, 8, 8, wood, { y: top - 2 }, 1.2))
  // 吊环和绳
  for (const sx of [-1, 1]) {
    const hx = sx * 17
    g.add(torus(1.6, 0.4, STEEL, { x: hx, y: top - 3.6 }, PI * 2, [6, 12]))
    for (const sz of [-1, 1]) g.add(rod3([hx, top - 5, 0], [sx * 15.5, sz > 0 ? 58.4 : 60.4, sz * 12.2], 0.55, ROPE, 8))
  }
  // 座椅：座板、靠背、两侧挡板；前面一根软包护栏、中间一根分腿柱，两侧扶手杆
  g.add(rbox(30, 3.5, 26, seat, { y: 44 }, 1.4))
  g.add(rbox(30, 18, 3, seat, { y: 44, z: -12.5 }, 1.4))
  for (const s of [-1, 1]) g.add(rbox(2.6, 10, 24, seat, { x: s * 13.7, y: 46 }, 1))
  g.add(cylX(1.8, 30, rail, 0, 58, 12.5, 14))
  g.add(rod3([0, 47, 10], [0, 57, 12.3], 1.4, rail, 10))
  for (const s of [-1, 1]) {
    g.add(rod3([s * 14, 60.4, -12], [s * 14, 58, 12.5], 1.3, rail, 10))
    for (const z of [-12, 12.5]) g.add(ball(1.5, rail, { x: s * 15, y: z > 0 ? 58.2 : 60.4, z: z * 1.0 }, undefined, [10, 6]))
  }
  return fitGroup(g)
}

// ---------- 儿童蹦床：六条腿撑着的圆形蹦床，跳垫中心一块圆形色块，外圈一道软包护边盖住弹力绳，后面一根 T 形扶手 ----------

function trampoline(p: string[]) {
  const [pad, frame, acc] = p
  const g = new THREE.Group()
  const fy = 24
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2 + PI / 6
    const x = Math.cos(a) * 42.5
    const z = Math.sin(a) * 42.5
    g.add(cyl(1.5, 1.5, fy - 1.2, frame, { x, y: 1.2, z }, 12))
    g.add(cyl(2.2, 2.4, 1.6, RUBBER, { x, z }, 12))
  }
  g.add(torus(42.5, 1.4, frame, { y: fy, rx: PI / 2 }))
  g.add(cyl(38.5, 38.5, 0.4, DARK, { y: fy - 0.2 }, 32))
  g.add(noOutline(cyl(10, 10, 0.5, acc, { y: fy }, 24)))
  const ring = P(torus(41, 4, pad), 0, fy + 1, 0, PI / 2)
  ring.scale.set(1, 1, 0.45)
  g.add(ring)
  // T 形扶手：立杆 + 两根斜撑 + 泡棉横把
  g.add(rbox(5, 5, 5, DARK, { y: fy - 2.5, z: -42.5 }, 0.8))
  g.add(rod3([0, fy, -42.5], [0, 86, -38], 1.6, frame, 12))
  for (const s of [-1, 1]) g.add(rod3([s * 24, fy, -35.1], [0, 60, -40], 1.1, frame, 10))
  g.add(cylX(1.9, 34, acc, 0, 86.5, -38, 14))
  for (const s of [-1, 1]) g.add(ball(1.9, acc, { x: s * 17, y: 86.5, z: -38 }))
  return fitGroup(g)
}

// ---------- 尿布收纳：毛毡提篮（中间带提手洞的高隔板，分格里放着尿布、湿巾、奶瓶、护臀膏）+ 旁边一只脚踏尿布桶 ----------

function diaperCaddy(p: string[]) {
  const [felt, pail, acc] = p
  const g = new THREE.Group()
  const cx = -14
  // 提篮：篮身 + 中间高隔板（开提手洞）+ 前后两格各一道小隔板
  g.add(tray(30, 14, 24, 1.2, felt, { x: cx }, 0.6))
  g.add(holePanel(27.8, 24, 1.2, shade(felt, -0.08), [{ kind: 'rect', x: 0, y: 17, w: 10, h: 4, r: 2 }], { x: cx, y: 0.6 }, 3))
  g.add(rbox(1, 10, 10.4, shade(felt, -0.08), { x: cx + 3, y: 1.2, z: 5.8 }, 0.3))
  g.add(rbox(1, 10, 10.4, shade(felt, -0.08), { x: cx - 5, y: 1.2, z: -5.8 }, 0.3))
  // 前格：竖着插的一排尿布（腰带是点缀色）、一包湿巾
  for (let i = 0; i < 4; i++) {
    const x = -26.4 + i * 3.6
    g.add(rbox(3.4, 13, 9, WHITE, { x, y: 1.2, z: 6 }, 1))
    g.add(rbox(3.8, 1.8, 9.4, acc, { x, y: 11.6, z: 6 }, 0.6))
  }
  g.add(rbox(10, 5, 9, '#e4f2f8', { x: -5, y: 1.2, z: 6 }, 1.6))
  g.add(rbox(5, 0.6, 3.6, acc, { x: -5, y: 6, z: 6 }, 0.2))
  // 后格：奶瓶、护臀膏软管、一罐面霜
  g.add(cyl(2.6, 2.6, 11, CREAM, { x: -24, y: 1.2, z: -5.8 }, 16))
  g.add(cyl(2.8, 2.8, 1.6, acc, { x: -24, y: 12.2, z: -5.8 }, 16))
  g.add(cyl(0.8, 1.6, 2.4, '#f2d6a8', { x: -24, y: 13.8, z: -5.8 }, 12))
  g.add(rbox(3.6, 9, 2.4, '#fbe3ee', { x: -16, y: 1.2, z: -6 }, 0.8))
  g.add(cyl(1, 1, 1.6, acc, { x: -16, y: 10.2, z: -6 }, 10))
  g.add(cyl(3, 3, 4, WHITE, { x: -9.5, y: 1.2, z: -6 }, 16))
  g.add(cyl(3.2, 3.2, 1.4, acc, { x: -9.5, y: 5.2, z: -6 }, 16))
  // 脚踏尿布桶：桶身 + 上部色带 + 盖（平沿 + 圆顶）+ 背后铰链 + 前面的脚踏
  const px = 16
  g.add(cyl(12.2, 11.2, 50, pail, { x: px }, 32))
  g.add(cyl(12.4, 12.4, 2, acc, { x: px, y: 45 }, 32))
  g.add(puck(12.8, 3, shade(pail, -0.05), { x: px, y: 49.6 }))
  g.add(ball(11.6, shade(pail, -0.05), { x: px, y: 52, z: 0 }, [1, 0.28, 1], [24, 10]))
  g.add(rbox(6, 3, 2, DARK, { x: px, y: 48.6, z: -12.6 }, 0.5))
  g.add(rbox(9, 2.2, 6, acc, { x: px, y: 0.6, z: 13.4 }, 0.8))
  return fitGroup(g)
}

// ======================================================================
// 配色
// ======================================================================

const FEEDER_PALS: Pal[] = [
  ['cute', [C.white, C.pink, C.mint]],
  ['cute', [C.white, C.sky, C.lemon]],
  ['nordic', [N.white, N.oak, N.sage]],
  ['modern', [M.char, M.light, '#7fe0ff']],
]
const LITTER_PALS: Pal[] = [
  ['modern', [M.char, M.white, M.gray]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['nordic', [N.gray, N.white, N.sage]],
  ['modern', [M.white, M.light, '#7fa8d8']],
]
const WHEEL_PALS: Pal[] = [
  ['nordic', [N.white, N.oak, N.gray]],
  ['cute', [C.mint, C.white, C.sakura]],
  ['modern', [M.light, M.char, M.gray]],
  ['cute', [C.sky, C.white, C.lemon]],
]
const STAIRS_PALS: Pal[] = [
  ['nordic', [N.gray, N.linen, N.white]],
  ['cute', [C.pink, C.white, C.white]],
  ['modern', [M.char, M.gray, M.light]],
  ['nordic', [N.sage, N.linen, N.white]],
]
const TUNNEL_PALS: Pal[] = [
  ['cute', [C.sky, C.white, C.pink]],
  ['nordic', [N.gray, N.white, N.mustard]],
  ['cute', [C.lilac, C.lemon, C.mint]],
  ['modern', [M.char, M.light, '#ff8fb4']],
]
const DOGTOY_PALS: Pal[] = [
  ['cute', [C.sky, C.peach, C.pink]],
  ['nordic', [N.sage, N.oakL, N.mustard]],
  ['cute', [C.red, C.woodL, C.mint]],
  ['modern', [M.gray, '#e8d4b0', '#ff8f3c']],
]
const LEASH_PALS: Pal[] = [
  ['nordic', [N.oak, M.char, N.sage]],
  ['cute', [C.woodL, C.pink, C.sky]],
  ['modern', [M.white, M.black, '#e8483f']],
  ['retro', [R.caramel, R.teal, R.mustard]],
]
const STROLLER_PALS: Pal[] = [
  ['modern', [M.gray, M.char, M.light]],
  ['cute', [C.pink, M.silver, C.white]],
  ['nordic', [N.linen, M.char, N.oak]],
  ['cute', [C.sky, M.silver, C.lemon]],
]
const GROOM_PALS: Pal[] = [
  ['modern', [M.char, M.silver, '#e8483f']],
  ['modern', ['#3f6fb5', M.silver, M.white]],
  ['cute', [C.pink, C.white, C.sky]],
  ['industrial', ['#3a3a3c', '#7c8085', '#c46a3a']],
]
const BETTA_PALS: Pal[] = [
  ['nordic', [N.oak, '#d9cbb0', N.white]],
  ['japanese', ['#6e4f37', '#5a5550', '#3e3a39']],
  ['modern', [M.white, '#3d3f44', M.char]],
  ['cute', [C.woodL, '#e8dccb', C.mint]],
]
const POTTY_PALS: Pal[] = [
  ['cute', [C.pink, C.white, C.sky]],
  ['cute', [C.sky, C.white, C.lemon]],
  ['cute', [C.mint, C.white, C.peach]],
  ['nordic', [N.white, N.gray, N.sage]],
]
const TUB_PALS: Pal[] = [
  ['cute', [C.sky, C.white, C.pink]],
  ['cute', [C.pink, C.white, C.mint]],
  ['nordic', [N.white, N.gray, N.sage]],
  ['modern', [M.light, M.white, '#7fa8d8']],
]
const MOBILE_PALS: Pal[] = [
  ['cute', [C.woodL, C.pink, C.sky]],
  ['cute', [C.white, C.sky, C.lemon]],
  ['nordic', [N.oak, N.linen, N.sage]],
  ['cute', [C.woodL, C.mint, C.peach]],
]
const BOUNCER_PALS: Pal[] = [
  ['nordic', [N.gray, M.silver, N.mustard]],
  ['cute', [C.sakura, C.white, C.sky]],
  ['modern', [M.char, M.silver, M.light]],
  ['cute', [C.mint, C.white, C.peach]],
]
const GYM_PALS: Pal[] = [
  ['cute', [C.cream, C.mint, C.pink]],
  ['cute', [C.sky, C.white, C.lemon]],
  ['nordic', [N.linen, N.oak, N.sage]],
  ['cute', [C.sakura, C.lilac, C.mint]],
]
const DINO_PALS: Pal[] = [
  ['cute', [C.mint, C.peach, C.lilac]],
  ['cute', [C.sky, C.lemon, C.pink]],
  ['retro', [R.olive, R.orange, R.teal]],
  ['cute', ['#8fd49a', '#ffb6c8', '#a8d4f4']],
]
const HOOP_PALS: Pal[] = [
  ['cute', [C.sky, C.white, C.red]],
  ['cute', [C.pink, C.white, C.orange]],
  ['modern', [M.char, M.white, '#e8483f']],
  ['cute', [C.mint, C.white, C.lemon]],
]
const SWING_PALS: Pal[] = [
  ['nordic', [N.oak, N.sage, N.white]],
  ['cute', [C.wood, C.pink, C.white]],
  ['nordic', [N.oakL, N.gray, N.mustard]],
  ['cute', [C.woodL, C.sky, C.lemon]],
]
const TRAMP_PALS: Pal[] = [
  ['cute', [C.sky, M.silver, C.lemon]],
  ['cute', [C.pink, M.silver, C.mint]],
  ['modern', [M.char, M.silver, '#ff8f3c']],
  ['nordic', [N.sage, N.white, N.mustard]],
]
const CADDY_PALS: Pal[] = [
  ['nordic', [N.gray, N.white, N.sage]],
  ['cute', [C.pink, C.white, C.sky]],
  ['modern', [M.gray, M.white, M.char]],
  ['cute', [C.mint, C.white, C.peach]],
]

// ======================================================================
// 素材表
// ======================================================================

const CAT: Partial<AssetDef> = { type: 'pet-supply', tags: ['cat', 'hobby:cats'] }
const DOG: Partial<AssetDef> = { type: 'pet-supply', tags: ['dog', 'hobby:dogs'] }
const KID_TOY: Partial<AssetDef> = { type: 'toy', tags: ['for-kids'] }
/** 婴儿专用的玩具：家里有婴儿才摆（decorate.ts 按 for-baby 筛） */
const BABY_TOY: Partial<AssetDef> = { type: 'toy', tags: ['for-kids', 'for-baby'] }

export const PETS_KIDS_MORE: AssetDef[] = [
  // 宠物
  define('pk-auto-feeder', '自动喂食器', 'pets', [22, 38, 35], FEEDER_PALS, autoFeeder, { type: 'pet-supply', tags: ['cat', 'dog'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('pk-auto-litter', '自动猫砂盆', 'pets', [55, 61, 59], LITTER_PALS, autoLitter, { ...CAT, mats: ['plastic', 'plastic', 'plastic'] }),
  define('pk-cat-wheel', '猫跑轮', 'pets', [104, 36, 112], WHEEL_PALS, catWheel, { ...CAT, mats: ['wood', 'wood', 'pile'] }),
  define('pk-pet-stairs', '宠物楼梯', 'pets', [41, 60, 41], STAIRS_PALS, petStairs, { type: 'pet-supply', tags: ['cat', 'dog'], mats: ['fabric', 'pile', null] }),
  define('pk-cat-tunnel', '猫隧道', 'pets', [119, 59, 27], TUNNEL_PALS, catTunnel, { ...CAT, mats: ['fabric', 'fabric', 'pile'] }),
  define('pk-dog-toys', '狗玩具组', 'pets', [32, 20, 8], DOGTOY_PALS, dogToys, { ...PROP, ...DOG, mats: ['fabric', 'plastic', 'plastic'] }),
  define('pk-leash-hooks', '牵引绳挂架', 'entrance', [34, 7, 59], LEASH_PALS, leashHooks, { ...DOG, mount: 130, mats: ['wood', 'fabric', 'fabric'] }),
  define('pk-pet-stroller', '宠物推车', 'pets', [48, 82, 100], STROLLER_PALS, petStroller, { type: 'pet-supply', tags: ['cat', 'dog'], mats: ['fabric', 'metal', 'fabric'] }),
  define('pk-grooming-table', '宠物美容桌', 'pets', [GT.w + 2, GT.d + 2, 150], GROOM_PALS, groomingTable, {
    ...DOG,
    mats: ['plastic', 'metal', 'fabric'],
    surface: GT.h,
    // 可摆的是胶垫那一块，右后角让开吊杆的夹座（x 36～41、z -23.5～-18.5）
    surfaceShape: [rectPoly(-GT.w / 2 + 0.8, -GT.d / 2 + 0.8, 35, GT.d / 2 - 0.8), rectPoly(35, -17.5, GT.w / 2 - 0.8, GT.d / 2 - 0.8)],
  }),
  define('pk-betta-tanks', '斗鱼缸组', 'pets', [50, 15, 24], BETTA_PALS, bettaTanks, { ...PROP, type: 'pet-supply', mats: ['wood', 'stone', 'plastic'] }),
  // 育儿
  define('pk-potty', '儿童小马桶', 'kids', [27, 31, 32], POTTY_PALS, potty, { type: 'personal-care', tags: ['for-kids', 'for-baby'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('pk-baby-tub', '婴儿澡盆', 'kids', [82, 48, 26], TUB_PALS, babyTub, { type: 'wet-supply', tags: ['for-kids', 'for-baby'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('pk-crib-mobile', '床铃', 'kids', [35, 38, 71], MOBILE_PALS, cribMobile, { ...BABY_TOY, mats: ['wood', 'fabric', 'plastic'] }),
  define('pk-baby-bouncer', '婴儿摇椅', 'kids', [38, 60, 61], BOUNCER_PALS, babyBouncer, { ...BABY_TOY, mats: ['fabric', 'metal', 'fabric'] }),
  define('pk-play-gym', '婴儿健身架', 'kids', [88, 88, 45], GYM_PALS, playGym, { ...BABY_TOY, mats: ['fabric', 'fabric', 'plastic'] }),
  define('pk-dino-toys', '恐龙玩具组', 'kids', [36, 21, 18], DINO_PALS, dinoToys, { ...PROP, ...KID_TOY, mats: ['plastic', 'plastic', 'plastic'] }),
  define('pk-kids-hoop', '儿童篮球架', 'kids', [60, 76, 160], HOOP_PALS, kidsHoop, { ...KID_TOY, mats: ['plastic', 'plastic', 'metal'] }),
  define('pk-indoor-swing', '室内秋千', 'kids', [122, 133, 168], SWING_PALS, indoorSwing, { ...KID_TOY, mats: ['wood', 'plastic', 'fabric'] }),
  define('pk-mini-trampoline', '儿童蹦床', 'kids', [90, 90, 89], TRAMP_PALS, trampoline, { ...KID_TOY, mats: ['fabric', 'metal', 'fabric'] }),
  define('pk-diaper-caddy', '尿布收纳篮', 'kids', [58, 30, 56], CADDY_PALS, diaperCaddy, { type: 'storage-box', tags: ['for-kids'], mats: ['fabric', 'plastic', 'plastic'] }),
]
