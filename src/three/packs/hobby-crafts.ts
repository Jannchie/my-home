// 小众爱好与手作工作台（id 前缀 hc2-）：射箭靶、击剑装备、卡牌收藏、调香台、手工蜡烛、皮具手作、折纸、篆刻、插花套组、
// 魔术道具、拉坯机、桌面织布机、羊毛毡、黏土雕塑台、家用烘豆机、家酿啤酒套装。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。都不声明 surface，build 末尾 fitGroup 居中落地。
// 斜靠 / 倾斜的零件按两个接触点算方向（弓靠在靶架腿上、花剑靠在剑袋上、压脚踏板搭在支点上），不手填角度。

import * as THREE from 'three'
import { ball, box, cup, cyl, face, plate, rbox, shade, torus, tray, type At } from '../toon'
import { C, gridHoles, holePanel, paintPanel, rng, slab, type AssetDef, type Hole } from '../kit'
import { batten, cappedTube, cylX, cylZ, fitGroup, G, ghost, lathe, lit, mesh, noOutline, P, PI, rod3, sideSlab, strutBox, taperRod3, tiltFrame, tube, UP, type V2, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#2a2b30'
const RUBBER = '#2e2f33'
const PAPER = '#f6f2e8'
const GLASS = '#cfe8f5'
const AMBER = '#8a4a1e'

// ---------- 小工具 ----------

/** 圆饼，轮廓同 toon.ts 的 puck（上下两道圆角），一圈段数和圆角步数可调（puck 半径 ≥ 8 固定 32 × 5） */
function puckN(r: number, h: number, color: string, at: At, seg: number, steps: number) {
  const k = Math.min(h / 2, r) * 0.9
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)]
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps
      pts.push(new THREE.Vector2(cx + Math.cos(a) * k, cy + Math.sin(a) * k))
    }
  }
  arc(r - k, -h / 2 + k, -PI / 2, 0)
  arc(r - k, h / 2 - k, 0, PI / 2)
  pts.push(new THREE.Vector2(0, h / 2))
  return P(mesh(new THREE.LatheGeometry(pts, seg), color), at.x ?? 0, (at.y ?? 0) + h / 2, at.z ?? 0, at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
}

/** 把对象的局部 y 轴对准 dir、局部 z 尽量朝 zHint，原点放到 at（弓、花剑这种「按两个接触点定方向」的长件用） */
function aimAt<T extends THREE.Object3D>(o: T, at: V3, dir: THREE.Vector3, zHint: THREE.Vector3): T {
  const y = dir.clone().normalize()
  const z = zHint.clone().addScaledVector(y, -zHint.dot(y)).normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  o.position.set(...at)
  return o
}

/** 薄纸三角片：三个顶点围成的三角形沿法线加厚 t（闭合实心，能描边；折纸用） */
function paperTri(a: V3, b: V3, c: V3, t: number, color: string) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const Cc = new THREE.Vector3(...c)
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A)).normalize().multiplyScalar(t / 2)
  const top = [A, B, Cc].map((v) => v.clone().add(n))
  const bot = [A, B, Cc].map((v) => v.clone().sub(n))
  const tris: THREE.Vector3[] = [top[0], top[1], top[2], bot[0], bot[2], bot[1]]
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3
    tris.push(top[i], bot[i], bot[j], top[i], bot[j], top[j])
  }
  const geo = new THREE.BufferGeometry().setFromPoints(tris)
  geo.computeVertexNormals()
  return mesh(geo, color)
}

/** 凸多面体：给顶点和三角面（顶点序号），面的朝向按「背离重心」自动摆正（纸鹤身子、纸青蛙身子） */
function hull(verts: V3[], faces: [number, number, number][], color: string) {
  const vs = verts.map((v) => new THREE.Vector3(...v))
  const c = vs.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / vs.length)
  const pts: THREE.Vector3[] = []
  for (const [i, j, k] of faces) {
    const n = new THREE.Vector3().subVectors(vs[j], vs[i]).cross(new THREE.Vector3().subVectors(vs[k], vs[i]))
    const m = vs[i].clone().add(vs[j]).add(vs[k]).multiplyScalar(1 / 3).sub(c)
    if (n.dot(m) >= 0) pts.push(vs[i], vs[j], vs[k])
    else pts.push(vs[i], vs[k], vs[j])
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  geo.computeVertexNormals()
  return mesh(geo, color)
}

/** 一朵小花：花心 + 一圈压扁的花瓣，朝局部 +y 开（再用 aimAt 对准枝头方向） */
function blossom(r: number, petal: string, heart: string, n = 5) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    const pt = ball(r * 0.55, petal, { x: Math.cos(a) * r * 0.62, y: r * 0.1, z: Math.sin(a) * r * 0.62 }, [1, 0.38, 0.62], [6, 4])
    pt.rotation.y = -a
    g.add(pt)
  }
  g.add(ball(r * 0.34, heart, { y: r * 0.22 }, undefined, [8, 6]))
  return g
}

/** 枝头开一朵花：花的局部 +y 对准 from → to 的方向，花心放在 to */
function flowerAt(from: V3, to: V3, r: number, petal: string, heart: string, n = 5) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const hint = Math.abs(dir.clone().normalize().y) > 0.9 ? new THREE.Vector3(0, 0, 1) : UP.clone()
  return aimAt(blossom(r, petal, heart, n), to, dir, hint)
}

// ---------- 射箭靶：三脚木架斜撑着一只圆草靶，靶面五色环插着三支箭，一把反曲弓靠在右前腿上 ----------

const AT = { top: 146, fz0: 16, fz1: -8, R: 34, T: 12, by: 100 }
/** 靶纸由外到内：白、黑、蓝、红、金 */
const RING_COLORS = ['#f6f4ee', '#2f3034', '#3f8fd8', '#e0463c', '#f2c230']

/** 一支箭：沿局部 +z，原点是入靶点（往里埋 3cm），尾部三片羽 + 箭尾 */
function arrowZ(len: number, vane: string) {
  const a = new THREE.Group()
  a.add(P(cyl(0.35, 0.35, len + 3, '#3a3b40', {}, 8), 0, 0, (len - 3) / 2, PI / 2))
  a.add(P(cyl(0.5, 0.45, 1.4, vane, {}, 8), 0, 0, len + 0.4, PI / 2))
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Group()
    f.add(box(0.15, 1.2, 5.5, vane, { y: 0.25, z: len - 4.2 }))
    f.rotation.z = (k * PI * 2) / 3
    a.add(f)
  }
  return a
}

/** 反曲弓：弦在局部 z = -1.2、弓背往 +z 鼓，上下弓梢在局部 y = 0 和 BOW_L（z = 0） */
const BOW_L = 118.4
function recurve(limb: string) {
  const g = new THREE.Group()
  const up: V2[] = [
    [15.5, 71],
    [13.8, 83],
    [9.5, 96],
    [4.5, 106.5],
    [0.8, 112.5],
    [-1, 115.8],
    [0, BOW_L],
  ]
  for (const s of [1, -1]) {
    const pts = up.map(([z, y]): V3 => [0, s > 0 ? y : BOW_L - y, z])
    g.add(tube(pts, 0.9, limb, { seg: 20, radial: 6 }))
    const tip = pts[pts.length - 1]
    g.add(ball(0.9, limb, { x: tip[0], y: tip[1], z: tip[2] }, undefined, [8, 6]))
  }
  // 弓把（深色金属）和箭台
  g.add(rbox(2.8, 25.6, 4, DARK, { y: BOW_L / 2 - 12.8, z: 15.6 }, 0.9))
  g.add(rbox(3.4, 9, 2.4, shade(limb, -0.25), { y: BOW_L / 2 - 6, z: 13.4 }, 0.8))
  // 弦：贴着上下两段反曲的弓腹拉直
  g.add(rod3([0, BOW_L - 115.8, -1.2], [0, 115.8, -1.2], 0.15, '#f4f1e8', 6))
  return g
}

function archeryTarget(p: string[]) {
  const [wood, boss, accent] = p
  const g = new THREE.Group()
  const { top, fz0, fz1, R: br, T: bt, by } = AT
  // 两条前腿 + 顶横梁 + 一条后腿（后腿顶端抵在横梁背面）
  for (const s of [-1, 1]) g.add(strutBox([s * 32, 0, fz0], [s * 20, top, fz1], 4, 3, wood))
  g.add(rbox(48, 4, 4, wood, { y: top - 3, z: fz1 }, 0.8))
  g.add(strutBox([0, 0, -34], [0, top - 1, fz1 - 2.5], 4, 3, wood))
  // 靶子坐在前腿斜面上：局部 y 沿前腿、局部 z 是斜面法线（前腿正面在局部 z = 1.5）
  const f = tiltFrame([fz0, 0], [fz1, top])
  const zc = 1.5 + bt / 2 - 0.3
  // 托靶横档：顶面正好托住靶子底
  f.g.add(rbox(66, 4, 5, wood, { y: by - br - 4, z: 1.5 + 2.5 - 0.2 }, 0.8))
  f.g.add(P(cyl(br, br, bt, boss, {}, 32), 0, by, zc, PI / 2))
  // 草靶的两道箍：和 32 段的靶身对齐（一圈 32 段），管截面 6 段就够
  for (const dz of [-3, 3]) f.g.add(P(torus(br, 0.5, shade(boss, -0.22), {}, PI * 2, [6, 32]), 0, by, zc + dz))
  // 靶纸五色环：每一环比外一环前后都多出 0.1（正面浮出、背面埋深），免得共面
  const zf = zc + bt / 2
  RING_COLORS.forEach((c, k) => {
    const h = 0.3 + 0.2 * k
    f.g.add(noOutline(P(cyl(30 - 6 * k, 30 - 6 * k, h, c, {}, 32), 0, by, zf - 0.1 - 0.1 * k + h / 2, PI / 2)))
  })
  // 三支箭：入靶点在靶面上，各自歪一点
  for (const [ax, ay, rx, ry] of [
    [-5, 4, 0.06, -0.05],
    [6, -3, -0.05, 0.04],
    [1, 9, 0.03, 0.07],
  ])
    f.g.add(P(arrowZ(22, accent), ax, by + ay, zf + 0.4, rx, ry))
  g.add(f.g)
  // 反曲弓：上弓梢靠在右前腿外侧（高 hT 处），下弓梢着地；着地点按弓长反算
  const hT = 117
  const t = hT / top
  const legX = 32 + (20 - 32) * t
  const legZ = fz0 + (fz1 - fz0) * t
  const T: V3 = [legX + 2 + 0.9 - 0.2, hT, legZ]
  const hd = Math.sqrt(BOW_L * BOW_L - (hT - 0.9) ** 2)
  const out = 0.76
  const Fp: V3 = [T[0] + hd * Math.cos(out), 0.9, T[2] + hd * Math.sin(out)]
  const dir = new THREE.Vector3(T[0] - Fp[0], T[1] - Fp[1], T[2] - Fp[2])
  g.add(aimAt(recurve(accent), Fp, dir, new THREE.Vector3(Math.sin(out), 0, -Math.cos(out))))
  return fitGroup(g)
}

// ---------- 击剑装备：立着的长剑袋（底部两只小轮）、地上一顶网面击剑面罩、一把花剑斜靠在剑袋正面 ----------

const FS = { bw: 30, bd: 18, bh: 108, bx: -14, bz: -12 }
const MASK_MESH = '#3b3d43'

/** 击剑面罩：网面球罩（深色底 + 钢丝经纬）、后半白色内衬、一圈白边、下巴的护颈围兜和后脑的弹簧舌 */
function fencingMask(pad: string) {
  const R0 = 11
  const g = new THREE.Group()
  const dome = new THREE.Group()
  dome.add(ball(R0, MASK_MESH, {}, undefined, [20, 12]))
  const back: V2[] = []
  for (let i = 0; i <= 10; i++) {
    const a = -PI / 2 + (i / 10) * PI
    back.push([Math.cos(a) * (R0 + 0.2), Math.sin(a) * (R0 + 0.2)])
  }
  dome.add(lathe(back, pad, 20, [PI / 2, PI]))
  dome.add(torus(R0 + 0.25, 0.9, pad, {}, PI * 2, [6, 24]))
  // 网面：前半球的纬线和经线（一半埋在深色球面里）；钢丝细，截面 4 段、半圈 10 段
  for (const lat of [-55, -35, -15, 5, 25, 45]) {
    const a = (lat * PI) / 180
    dome.add(noOutline(torus(R0 * Math.cos(a), 0.2, STEEL, { y: R0 * Math.sin(a), rx: PI / 2 }, PI, [4, 10])))
  }
  for (let k = -3; k <= 3; k++) dome.add(noOutline(torus(R0, 0.2, STEEL, { rz: -PI / 2, ry: -PI / 2 + k * 0.36 }, PI, [4, 10])))
  dome.scale.set(0.92, 1.15, 1)
  g.add(dome)
  // 护颈围兜（往前下方垂）和后脑弹簧舌（两者一起把面罩支在地上）
  g.add(rbox(15, 9, 3, pad, { y: -17.5, z: 5.5, rx: 0.35 }, 1.2))
  for (const x of [-4, 0, 4]) g.add(noOutline(box(0.4, 7, 3.5, shade(pad, -0.08), { x, y: -17, z: 5.4, rx: 0.35 })))
  g.add(cappedTube([[0, 6, -10.2], [0, -2, -13.6], [0, -11, -14.4], [0, -16.6, -12.6]], 0.8, pad, { seg: 12, radial: 6, capSeg: [8, 6] }))
  return g
}

/** 花剑：沿局部 +y，原点在剑尖；剑身 88、碗形护手、握把、剑柄头，全长 110 */
const FOIL_L = 110
function foil(gripC: string) {
  const g = new THREE.Group()
  g.add(cyl(0.45, 0.45, 0.8, DARK, {}, 8))
  g.add(taperRod3([0, 0.6, 0], [0, 88.5, 0], 0.16, 0.36, STEEL, 6))
  g.add(cup(4.8, 2, 2.6, 0.25, STEEL, { y: 86.5 }, 16))
  g.add(cyl(0.95, 0.85, 15.5, gripC, { y: 88.6 }, 10))
  g.add(cyl(1.1, 1.1, 3.6, STEEL, { y: 104 }, 10))
  g.add(ball(1.2, STEEL, { y: FOIL_L - 1.2 }))
  return g
}

function fencingSet(p: string[]) {
  const [bag, trim, gripC] = p
  const g = new THREE.Group()
  const { bw, bd, bh, bx, bz } = FS
  // 剑袋：圆角长箱，底部和顶部各一圈深色护边（圆角 3.9：圆角盒 ≥ 4 才用 3 段，2 段看不出差别、面数减半）
  g.add(rbox(bw, bh - 2, bd, bag, { x: bx, y: 2, z: bz }, 3.9))
  g.add(rbox(bw + 0.6, 13, bd + 0.6, trim, { x: bx, y: 1.7, z: bz }, 3.9))
  g.add(rbox(bw + 0.6, 7, bd + 0.6, trim, { x: bx, y: bh - 7.3, z: bz }, 3.9))
  // 底部：后侧两只小轮（嵌进护边）、前侧两只橡胶脚
  for (const s of [-1, 1]) {
    g.add(cylX(3, 2.4, RUBBER, bx + s * 10, 3, bz - bd / 2 + 2.4, 16))
    g.add(rbox(4, 2.2, 3, RUBBER, { x: bx + s * 10, z: bz + bd / 2 - 3 }, 0.6))
  }
  // 正面：两条竖拉链 + 拉头、品牌贴片
  const zf = bz + bd / 2 + 0.3
  for (const s of [-1, 1]) {
    g.add(noOutline(rbox(0.8, bh - 24, 0.6, shade(trim, -0.15), { x: bx + s * 11.5, y: 13, z: zf - 0.2 }, 0.2)))
    g.add(rbox(1.4, 2.6, 0.8, STEEL, { x: bx + s * 11.5, y: bh - 16, z: zf + 0.1 }, 0.3))
  }
  g.add(rbox(14, 5, 0.8, trim, { x: bx, y: 74, z: zf - 0.2 }, 0.8))
  g.add(noOutline(rbox(9, 1.2, 0.6, '#f4f4f2', { x: bx, y: 76, z: zf + 0.3 }, 0.3)))
  // 顶部提手、侧面提手、背后的肩带
  g.add(cappedTube([[bx - 7, bh - 0.6, bz], [bx - 5, bh + 3.6, bz], [bx + 5, bh + 3.6, bz], [bx + 7, bh - 0.6, bz]], 0.9, trim, { seg: 14, radial: 6, capSeg: [8, 6] }))
  g.add(cappedTube([[bx + bw / 2 - 0.6, 62, bz], [bx + bw / 2 + 3.4, 60, bz], [bx + bw / 2 + 3.4, 50, bz], [bx + bw / 2 - 0.6, 48, bz]], 0.9, trim, { seg: 14, radial: 6, capSeg: [8, 6] }))
  const zb = bz - bd / 2 - 0.4
  g.add(cappedTube([[bx - 10, 96, zb + 0.6], [bx - 6, 70, zb - 2.6], [bx + 4, 40, zb - 2.6], [bx + 10, 18, zb + 0.6]], 0.9, trim, { seg: 14, radial: 6, capSeg: [8, 6] }))
  // 面罩放在剑袋右边的地上
  g.add(P(fitGroup(fencingMask('#f4f2ec')), 16, 0, -6, 0, -0.35))
  // 花剑：剑柄头抵在剑袋正面（高 hp），剑尖着地，着地点按剑长反算
  const hp = 104
  const Pm: V3 = [bx - 3, hp, zf - 0.3 + 1.2 - 0.1]
  const dy = hp - 0.4
  const dz = Math.sqrt((FOIL_L - 1.2) ** 2 - dy * dy)
  const tip: V3 = [Pm[0], 0.4, Pm[2] + dz]
  g.add(aimAt(foil(gripC), tip, new THREE.Vector3(0, dy, -dz), new THREE.Vector3(1, 0, 0)))
  return fitGroup(g)
}

// ---------- 卡牌收藏：摊开的九宫格卡册（两页卡面是抽象图案）、一摞三块亚克力评级卡砖、一只卡组盒 ----------

const TCG = { cw: 22, cd: 30 }
/** 九宫格内页：3 × 3 张卡，每张有边框色、插画色块和几条字段 */
function paintCardPage(seed: number, rim: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const r = rng(seed)
    const arts = ['#e0463c', '#3f8fd8', '#4f9e5b', '#f2c230', '#8a5cd8', '#f08a3c', '#36b0a8']
    g.fillStyle = '#dfe3e8'
    g.fillRect(0, 0, W, H)
    const cw = W / 3
    const ch = H / 3
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const x0 = i * cw + cw * 0.06
        const y0 = j * ch + ch * 0.05
        const w = cw * 0.88
        const h = ch * 0.9
        const art = arts[Math.floor(r() * arts.length)]
        g.fillStyle = r() < 0.25 ? '#d9b44a' : rim
        g.fillRect(x0, y0, w, h)
        g.fillStyle = shade(art, 0.35)
        g.fillRect(x0 + w * 0.08, y0 + h * 0.06, w * 0.84, h * 0.86)
        g.fillStyle = art
        g.fillRect(x0 + w * 0.12, y0 + h * 0.16, w * 0.76, h * 0.42)
        // 插画：一枚圆或一个三角
        g.fillStyle = shade(art, 0.5)
        if (r() < 0.5) {
          g.beginPath()
          g.arc(x0 + w * 0.5, y0 + h * 0.37, w * 0.18, 0, PI * 2)
          g.fill()
        } else {
          g.beginPath()
          g.moveTo(x0 + w * 0.5, y0 + h * 0.2)
          g.lineTo(x0 + w * 0.72, y0 + h * 0.54)
          g.lineTo(x0 + w * 0.28, y0 + h * 0.54)
          g.closePath()
          g.fill()
        }
        // 名称条和说明行
        g.fillStyle = shade(art, -0.2)
        g.fillRect(x0 + w * 0.12, y0 + h * 0.08, w * 0.6, h * 0.05)
        g.fillStyle = 'rgba(60,60,70,0.55)'
        for (let k = 0; k < 3; k++) g.fillRect(x0 + w * 0.14, y0 + h * (0.64 + k * 0.08), w * (0.72 - k * 0.12), h * 0.035)
      }
    // 卡套的封边线
    g.fillStyle = 'rgba(255,255,255,0.7)'
    for (let i = 1; i < 3; i++) {
      g.fillRect(i * cw - 1, 0, 2, H)
      g.fillRect(0, i * ch - 1, W, 2)
    }
  }
}

/** 评级卡砖：透明亚克力壳里一张卡，顶端一条标签 */
function slabCase(art: string) {
  const g = new THREE.Group()
  g.add(rbox(6.6, 0.3, 9, art, { y: 0.3, z: 1 }, 0.1))
  g.add(rbox(6.6, 0.3, 2.2, '#f4f4f2', { y: 0.3, z: -4.9 }, 0.1))
  g.add(noOutline(rbox(2.4, 0.12, 0.6, '#d8483f', { x: 1.8, y: 0.5, z: -4.9 }, 0.05)))
  g.add(ghost(rbox(8.4, 0.9, 13.6, GLASS, {}, 0.4), GLASS, 0.3))
  return g
}

function tcgBinder(p: string[]) {
  const [cover, rim, box] = p
  const g = new THREE.Group()
  const { cw, cd } = TCG
  // 封面两片 + 中间软脊，各压一叠内页；最上面一页是九宫格卡面
  for (const s of [-1, 1]) {
    const x = s * (cw / 2 + 1.4)
    g.add(rbox(cw, 0.6, cd, cover, { x }, 0.25))
    g.add(rbox(cw - 1.4, 0.8, cd - 1.4, '#eef0f2', { x, y: 0.5 }, 0.2))
    g.add(paintPanel(cw - 2.2, cd - 2.2, `hc2-tcg-page-${s}-${rim}`, paintCardPage(s > 0 ? 7 : 3, rim), { x, y: 1.36, z: (cd - 2.2) / 2, rx: -PI / 2 }))
  }
  g.add(rbox(3.2, 1.4, cd, shade(cover, -0.15), {}, 0.6))
  // 封面四周的拉链边
  for (const s of [-1, 1]) g.add(noOutline(rbox(cw * 2 + 2.6, 0.5, 0.5, shade(cover, -0.3), { y: 0.05, z: s * (cd / 2 - 0.1) }, 0.2)))
  // 右边：一摞三块卡砖（逐块转一点）
  const arts = ['#3f8fd8', '#e0463c', '#f2c230']
  arts.forEach((a, k) => g.add(P(slabCase(a), 30.5 + k * 0.4, k * 0.9, -6 + k * 0.6, 0, (k - 1) * 0.12)))
  // 卡组盒：盒身 + 稍大一圈的盒盖、正面一枚徽标
  g.add(rbox(7.2, 9.2, 7.6, box, { x: 30.5, z: 9 }, 0.8))
  g.add(rbox(7.6, 3.4, 8, shade(box, -0.15), { x: 30.5, y: 6.2, z: 9 }, 0.9))
  g.add(cylZ(1.8, 0.4, '#f4f4f2', 30.5, 4.4, 9 + 3.9, 20))
  g.add(cylZ(1.1, 0.5, rim, 30.5, 4.4, 9 + 4.0, 16))
  return fitGroup(g)
}

// ---------- 调香台：三层阶梯木架上一排排棕色精油瓶（滴管盖 + 白标签），台前一只量杯、一筒试香纸、一本配方本 ----------

const PO = { w: 40, d: 26 }
/** 三层台阶：[踏面前沿 z, 踏面后沿 z, 踏面高, 瓶半径, 瓶身高] */
const PO_TIERS: [number, number, number, number, number][] = [
  [3, -2.2, 5, 1.1, 3.6],
  [-2.2, -7.4, 11, 1.25, 4.2],
  [-7.4, -12.6, 17, 1.45, 5],
]

function perfumeOrgan(p: string[]) {
  const [wood, capC, accent] = p
  const g = new THREE.Group()
  const by = 1
  // 底板
  g.add(rbox(PO.w, by, PO.d, wood, { z: 0 }, 0.4))
  const zRack = -2
  // 两块阶梯侧板
  const side: V2[] = [[3, 0]]
  for (const [, z1, h] of PO_TIERS) side.push([side[side.length - 1][0], h], [z1, h])
  side.push([-12.6, 0])
  for (const s of [-1, 1]) g.add(P(sideSlab(side.map(([z, y]): V2 => [z + zRack, y]), 1.2, wood), s * 18.4, by, 0))
  // 踏面 + 立板（立板顶在踏面底下，不和踏面共顶面），背板
  const iw = 35.6
  PO_TIERS.forEach(([z0, z1, h], k) => {
    const prev = k ? PO_TIERS[k - 1][2] : 0
    g.add(rbox(iw, 0.8, z0 - z1, shade(wood, 0.06), { y: by + h - 0.8, z: zRack + (z0 + z1) / 2 }, 0.2))
    g.add(rbox(iw, h - 0.8 - prev, 0.8, wood, { y: by + prev, z: zRack + z0 - 0.4 }, 0.2))
  })
  g.add(rbox(iw, PO_TIERS[2][2] - 0.8, 0.8, wood, { y: by, z: zRack - 12.2 }, 0.2))
  // 精油瓶：每层 9 只，瓶身 + 瓶颈 + 滴管盖，腰上一圈标签
  PO_TIERS.forEach(([z0, z1, h, r, bh], k) => {
    const z = zRack + (z0 + z1) / 2
    for (let i = 0; i < 9; i++) {
      const x = -16 + i * 4
      const y = by + h
      g.add(cyl(r, r, bh, AMBER, { x, y, z }, 8))
      g.add(cyl(r * 0.5, r * 0.62, 0.6, AMBER, { x, y: y + bh - 0.1, z }, 6))
      g.add(cyl(r * 0.66, r * 0.66, 1.4 + k * 0.2, capC, { x, y: y + bh + 0.4, z }, 6))
      g.add(cyl(r * 0.3, r * 0.42, 1.2, i % 3 === 0 ? accent : capC, { x, y: y + bh + 1.7 + k * 0.2, z }, 6))
      // 标签只是一圈套在瓶身外的薄带：不封顶底（顶底只有 0.1cm 宽的一圈，看不见）
      g.add(noOutline(P(mesh(new THREE.CylinderGeometry(r + 0.1, r + 0.1, bh * 0.42, 8, 1, true), PAPER), x, y + bh * 0.2 + bh * 0.21, z)))
    }
  })
  // 台前：量杯（玻璃 + 液面）、试香纸筒（一把扇开的纸条）、配方本 + 铅笔
  g.add(ghost(cup(2.6, 2.4, 6.5, 0.2, GLASS, { x: -13, y: by, z: 8.5 }, 20), GLASS, 0.35))
  g.add(cyl(2.25, 2.2, 2.8, shade(accent, 0.25), { x: -13, y: by + 0.3, z: 8.5 }, 20))
  for (let k = 1; k <= 4; k++) g.add(noOutline(box(1, 0.12, 0.2, DARK, { x: -13, y: by + k * 1.3, z: 8.5 + 2.55 })))
  g.add(cup(1.9, 1.8, 5, 0.25, accent, { x: -6.5, y: by, z: 8.5 }, 16))
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 0.32
    const b = k % 2 ? 0.12 : -0.1
    g.add(batten([-6.5 + Math.sin(a) * 0.6, by + 0.4, 8.5], [-6.5 + Math.sin(a) * 8.5, by + 13 - Math.abs(k - 3) * 0.5, 8.5 + Math.sin(b) * 5], 0.7, 0.1, PAPER, 0.04))
  }
  g.add(rbox(10, 0.8, 7.5, shade(wood, -0.25), { x: 9, y: by, z: 8.6, ry: -0.12 }, 0.3))
  g.add(rbox(9.4, 0.2, 7, PAPER, { x: 9, y: by + 0.75, z: 8.6, ry: -0.12 }, 0.05))
  g.add(P(cyl(0.3, 0.3, 9, '#e0a526', {}, 6), 9.5, by + 1.25, 8.2, 0, -0.5, PI / 2))
  return fitGroup(g)
}

// ---------- 手工蜡烛工作台：电热融蜡锅（锅里半锅蜡）、六孔硅胶模和一只插着烛芯的柱形模、三只做好的容器蜡烛、一捆烛芯 ----------

function candleMaking(p: string[]) {
  const [body, sil, waxC] = p
  const g = new THREE.Group()
  // 融蜡锅：电热底座（旋钮 + 指示灯）、加热盘、不锈钢锅（壶嘴 + 往后伸的把手）、锅里融化的蜡
  const mx = -13
  const mz = -4
  g.add(cyl(8, 8.5, 4.5, body, { x: mx, z: mz }, 24))
  g.add(cyl(7, 7, 0.5, DARK, { x: mx, y: 4.5, z: mz }, 24))
  g.add(cylZ(1.2, 1.4, DARK, mx - 2, 2.2, mz + 8.4, 14))
  g.add(lit(cylZ(0.45, 0.6, '#ff6a3d', mx + 2.6, 2.4, mz + 8.2, 10), '#ff6a3d', 0.8))
  g.add(cup(6.4, 6, 10, 0.5, STEEL, { x: mx, y: 5, z: mz }, 24))
  g.add(cyl(5.9, 5.6, 6, waxC, { x: mx, y: 5.5, z: mz }, 24))
  g.add(taperRod3([mx + 5.6, 14.4, mz], [mx + 8, 15.2, mz], 1.1, 0.5, STEEL, 10))
  g.add(cappedTube([[mx, 12.8, mz - 6.1], [mx, 13.4, mz - 10], [mx, 13.8, mz - 14]], 0.7, DARK, { seg: 6, radial: 6, capSeg: [8, 6] }))
  // 六孔硅胶模：开口箱 + 开了圆孔的顶板，孔下各立一根短柱当模腔底，左边两格里已经倒了蜡
  const tx = 6
  const tz = -7
  g.add(tray(14, 3, 9, 0.6, sil, { x: tx, z: tz }))
  const holes = [-4.2, 0, 4.2].flatMap((x) => [2.3, 6.7].map((y) => ({ kind: 'circle' as const, x, y, r: 1.5, n: 14 })))
  g.add(holePanel(14, 9, 0.6, sil, holes, { x: tx, y: 3.2, z: tz + 4.5, rx: -PI / 2 }, 1, { bevel: 0 }))
  for (const x of [-4.2, 0, 4.2])
    for (const dz of [-2.2, 2.2]) g.add(cyl(1.5, 1.5, x < 0 ? 2.1 : 1.6, x < 0 ? waxC : shade(sil, -0.15), { x: tx + x, y: 0.6, z: tz + dz }, 14))
  // 柱形模：直筒硅胶模，口上横一根烛芯夹，烛芯垂进模里
  const px = 17.5
  const pz = -7
  g.add(cup(3, 3, 9, 0.6, sil, { x: px, z: pz }, 20))
  g.add(rbox(7.6, 0.5, 1, '#e8c25a', { x: px, y: 9, z: pz }, 0.2))
  g.add(cyl(0.12, 0.12, 8.6, PAPER, { x: px, y: 0.6, z: pz }, 6))
  // 三只容器蜡烛：两只玻璃杯（蜡 + 烛芯 + 一圈标签）、一只铁罐（盖子放在旁边）
  for (const [x, c, lbl] of [
    [-2, waxC, PAPER],
    [6.5, '#d9c8ef', shade(body, 0.2)],
  ] as [number, string, string][]) {
    g.add(ghost(cup(3.4, 3.2, 7.5, 0.3, GLASS, { x, z: 8 }, 16), GLASS, 0.35))
    g.add(cyl(3.15, 3.0, 5.6, c, { x, y: 0.3, z: 8 }, 16))
    g.add(cyl(0.12, 0.12, 1.2, DARK, { x, y: 5.8, z: 8 }, 6))
    g.add(cyl(3.5, 3.45, 2.6, lbl, { x, y: 1.8, z: 8 }, 16))
  }
  g.add(cup(3.6, 3.6, 4.5, 0.3, STEEL, { x: 15, z: 7 }, 20))
  g.add(cyl(3.35, 3.35, 3.6, shade(waxC, -0.08), { x: 15, y: 0.3, z: 7 }, 20))
  g.add(cyl(0.12, 0.12, 1, DARK, { x: 15, y: 3.8, z: 7 }, 6))
  g.add(cyl(3.8, 3.8, 0.8, STEEL, { x: 18.6, z: 12 }, 20))
  // 一捆烛芯：七根横躺的棉芯，一头压着底座铁片，中间一道纸箍
  for (let k = 0; k < 7; k++) {
    const z = 9 + (k - 3) * 0.32
    const x0 = -21 + (k % 2) * 0.4
    g.add(rod3([x0, 0.12, z], [x0 + 12, 0.12, z], 0.12, PAPER, 6))
    g.add(cylX(0.45, 0.25, STEEL, x0, 0.45, z, 8))
  }
  g.add(rbox(1.4, 0.5, 2.8, '#c9a26a', { x: -15, z: 9 }, 0.15))
  // 一小瓶香精
  g.add(cyl(1.5, 1.5, 4.5, AMBER, { x: -3.5, z: -10 }, 14))
  g.add(cyl(0.9, 0.9, 1.4, DARK, { x: -3.5, y: 4.5, z: -10 }, 12))
  return fitGroup(g)
}

// ---------- 皮具手作垫：切割垫上一块切了一半的皮料（钢尺压着）、菱斩、木槌、圆刀、一轴蜡线，前面一只缝了一半的钱包 ----------

const LC = { w: 44, d: 30, mat: 0.3 }
function paintCutMat(base: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,0.28)'
    const step = W / 43
    for (let i = 1; i < 43; i++) g.fillRect(i * step, 0, i % 5 ? 1 : 2, H)
    for (let j = 1; j < 29; j++) g.fillRect(0, j * step, W, j % 5 ? 1 : 2)
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fillRect(0, H * 0.06, W, 2)
    g.fillRect(W * 0.04, 0, 2, H)
  }
}
/** 钱包外皮：沿边一圈菱孔，前一半已经缝上线 */
function paintStitch(leather: string, thread: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = leather
    g.fillRect(0, 0, W, H)
    const m = W * 0.035
    const step = W / 40
    const pts: [number, number][] = []
    for (let x = m; x <= W - m; x += step) pts.push([x, m])
    for (let y = m + step; y <= H - m; y += step) pts.push([W - m, y])
    for (let x = W - m - step; x >= m; x -= step) pts.push([x, H - m])
    for (let y = H - m - step; y > m; y -= step) pts.push([m, y])
    pts.forEach(([x, y], i) => {
      if (i < pts.length * 0.45) {
        g.fillStyle = thread
        g.fillRect(x - step * 0.35, y - step * 0.18, step * 0.7, step * 0.36)
      } else {
        g.fillStyle = 'rgba(40,25,15,0.75)'
        g.fillRect(x - step * 0.12, y - step * 0.12, step * 0.24, step * 0.24)
      }
    })
  }
}

function leathercraft(p: string[]) {
  const [matC, leather, thread] = p
  const g = new THREE.Group()
  const y0 = LC.mat
  // 切割垫 + 网格
  g.add(rbox(LC.w, y0, LC.d, shade(matC, -0.1), {}, 0.1))
  g.add(paintPanel(LC.w - 0.6, LC.d - 0.6, `hc2-cutmat-${matC}`, paintCutMat(matC), { y: y0 + 0.06, z: (LC.d - 0.6) / 2, rx: -PI / 2 }))
  // 皮料：从下边切进去一道缝（切到一半），钢尺压在缝右边
  const lt = 0.35
  g.add(slab([[-19, -13], [-2.15, -13], [-2.15, -4], [-1.85, -4], [-1.85, -13], [3, -13], [3, 4], [-19, 4]], lt, leather, y0))
  g.add(rbox(3, 0.2, 16, STEEL, { x: 0.2, y: y0 + lt, z: -5 }, 0.05))
  for (let k = 0; k < 8; k++) g.add(noOutline(box(k % 2 ? 0.8 : 1.4, 0.06, 0.12, DARK, { x: -1.3 + (k % 2 ? 0.4 : 0.7), y: y0 + lt + 0.2, z: -12 + k * 2 })))
  // 菱斩：扁钢身 + 一排齿，平躺
  g.add(rbox(1.6, 0.9, 9, shade(leather, -0.35), { x: 19.5, y: y0, z: -2 }, 0.3))
  g.add(rbox(4.4, 0.6, 1.6, STEEL, { x: 19.5, y: y0 + 0.15, z: 3.2 }, 0.1))
  for (let k = 0; k < 6; k++) g.add(box(0.35, 0.4, 1.3, STEEL, { x: 17.6 + k * 0.76, y: y0 + 0.25, z: 4.4 }))
  // 木槌：圆柱槌头横躺，槌柄一头着地（柄的方向按槌头中心和着地点算）
  const hx = 12
  const hz = -9
  g.add(cylX(3, 8, '#e9d8b8', hx, y0 + 3, hz, 20))
  for (const s of [-1, 1]) g.add(cylX(3.1, 0.6, shade(leather, -0.2), hx + s * 3.2, y0 + 3, hz, 20))
  const hl = 15
  const drop = 3 - 1.1
  g.add(rod3([hx, y0 + 3, hz], [hx, y0 + 1.1, hz + Math.sqrt(hl * hl - drop * drop)], 1.1, N.oak, 12))
  // 圆刀：半月形刀片平躺，接一根木柄
  const kx = 7
  const kz = 9
  const arc: [number, number][] = []
  for (let i = 0; i <= 12; i++) arc.push([kx + Math.cos((i / 12) * PI) * 5, kz - Math.sin((i / 12) * PI) * 4.2])
  g.add(slab(arc, 0.2, STEEL, y0))
  g.add(rbox(1.2, 0.2, 2, STEEL, { x: kx, y: y0, z: kz + 0.8 }, 0.05))
  g.add(cylZ(0.9, 8, N.oak, kx, y0 + 0.9, kz + 5.6, 12))
  // 蜡线轴 + 一根针（线从轴上牵到针眼）
  const sx = 16
  const sz = 10
  g.add(cyl(1.6, 1.6, 3.2, thread, { x: sx, y: y0 + 0.4, z: sz }, 16))
  for (const y of [y0, y0 + 3.6]) g.add(cyl(2.1, 2.1, 0.4, N.oak, { x: sx, y, z: sz }, 16))
  g.add(rod3([sx - 6, y0 + 0.06, sz + 3.5], [sx - 1, y0 + 0.06, sz + 3], 0.06, STEEL, 4))
  g.add(tube([[sx + 0.6, y0 + 2.4, sz + 1.5], [sx + 0.4, y0 + 0.4, sz + 2.6], [sx - 1, y0 + 0.08, sz + 3]], 0.07, thread, { radial: 4, seg: 12 }))
  // 做了一半的钱包：打好孔的外皮 + 右半边叠两层卡位，前一半已经缝线
  const wx = -10
  const wz = 9.5
  g.add(rbox(18, 0.3, 9, shade(leather, -0.1), { x: wx, y: y0, z: wz }, 0.1))
  g.add(paintPanel(17.4, 8.4, `hc2-stitch-${leather}-${thread}`, paintStitch(leather, thread), { x: wx, y: y0 + 0.36, z: wz + 4.2, rx: -PI / 2 }))
  for (let k = 0; k < 2; k++) g.add(rbox(7.8, 0.3, 6.5 - k * 1.6, shade(leather, 0.12 - k * 0.06), { x: wx + 4.2, y: y0 + 0.3 + k * 0.3, z: wz + 1 + k * 0.8 }, 0.1))
  return fitGroup(g)
}

// ---------- 折纸：一叠彩色方纸（最上面停着一只纸鹤）、桌上一只纸鹤、一只纸青蛙、一只方盒 ----------

/** 纸鹤：朝 +x，菱形身子 + 两片翅膀 + 立起的颈和尾 + 折下的头 */
function crane(c: string) {
  const g = new THREE.Group()
  const sub = shade(c, -0.1)
  g.add(
    hull(
      [[0, 3, 0], [0, 0, 0], [2.4, 1.3, 0], [-2.4, 1.3, 0], [0, 1.3, 1.1], [0, 1.3, -1.1]],
      [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 4], [1, 4, 3], [1, 3, 5], [1, 5, 2]],
      c,
    ),
  )
  for (const s of [-1, 1]) g.add(paperTri([2, 2.5, 0], [-2, 2.5, 0], [0.3, 3.7, s * 5.2], 0.12, sub))
  g.add(paperTri([1.4, 1, 0], [2.2, 1.8, 0], [5.8, 5.6, 0], 0.25, c))
  g.add(paperTri([5.3, 5.1, 0], [5.9, 5.7, 0], [7, 4.9, 0], 0.25, c))
  g.add(paperTri([-1.4, 1, 0], [-2.2, 1.8, 0], [-5.6, 5.4, 0], 0.25, c))
  return g
}

/** 跳跳蛙：朝 +x，四棱锥身子 + 贴地的前后腿 */
function paperFrog(c: string) {
  const g = new THREE.Group()
  g.add(hull([[2.6, 0, 0], [-2.4, 0, 0], [0, 0, 2], [0, 0, -2], [0.2, 1.8, 0]], [[4, 0, 2], [4, 2, 1], [4, 1, 3], [4, 3, 0], [0, 2, 1], [0, 1, 3]], c))
  for (const s of [-1, 1]) {
    g.add(paperTri([1.4, 0.1, s * 0.8], [2.4, 0.1, s * 0.3], [3.6, 0.1, s * 1.9], 0.15, c))
    g.add(paperTri([-1.2, 0.1, s * 1.1], [-2.2, 0.1, s * 0.3], [-3.4, 0.1, s * 2.5], 0.15, c))
  }
  return g
}

function origami(p: string[]) {
  const [a, b, c] = p
  const g = new THREE.Group()
  const cols = [a, b, c, shade(a, 0.25), shade(b, -0.15), '#f4f2ec', shade(c, 0.2), a]
  // 一叠方纸：每张转一点，露出一圈彩边
  cols.forEach((col, k) => g.add(rbox(15, 0.2, 15, col, { x: -6, y: k * 0.2, z: -2, ry: ((k * 37) % 11) * 0.025 - 0.12 }, 0.05)))
  g.add(P(crane(b), -6, cols.length * 0.2, -2, 0, 0.5))
  g.add(P(crane(a), 7.5, 0, -5, 0, -0.4))
  g.add(P(paperFrog(c), 8, 0, 6, 0, 2.6))
  // 方盒（枡）
  g.add(tray(6, 2.6, 6, 0.2, shade(b, 0.15), { x: -6, z: 9.5, ry: 0.3 }, 0.05))
  return fitGroup(g)
}

// ---------- 篆刻工具：印床夹着一方印石（印面朝上、描着印稿）、三把刻刀、开着的印泥盒和翻放的盒盖、一张盖了两方红印的宣纸 ----------

/** 印面印稿：朱色描边 + 几笔方块笔画 */
function paintSealFace(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#e9dcc6'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#c8473a'
  const m = W * 0.1
  g.fillRect(m, m, W - m * 2, W * 0.06)
  g.fillRect(m, H - m - W * 0.06, W - m * 2, W * 0.06)
  g.fillRect(m, m, W * 0.06, H - m * 2)
  g.fillRect(W - m - W * 0.06, m, W * 0.06, H - m * 2)
  for (const [x, y, w, h] of [[0.28, 0.25, 0.18, 0.08], [0.33, 0.25, 0.07, 0.5], [0.56, 0.3, 0.18, 0.08], [0.56, 0.5, 0.18, 0.08], [0.6, 0.3, 0.07, 0.42]]) g.fillRect(W * x, H * y, W * w, H * h)
}
/** 宣纸上的两方印：左边白文（红底白字块）、右边朱文（红框红字块），印文只用方块示意 */
function paintSealPrint(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#f7f1e3'
  g.fillRect(0, 0, W, H)
  const red = '#c8302a'
  const s = H * 0.32
  const x0 = W * 0.18
  const y0 = H * 0.3
  g.fillStyle = red
  g.fillRect(x0, y0, s, s)
  g.fillStyle = '#f7f1e3'
  for (const [x, y, w, h] of [[0.12, 0.14, 0.32, 0.1], [0.24, 0.14, 0.1, 0.72], [0.12, 0.5, 0.3, 0.1], [0.56, 0.14, 0.32, 0.1], [0.56, 0.42, 0.32, 0.1], [0.56, 0.72, 0.32, 0.1], [0.66, 0.14, 0.1, 0.66]]) g.fillRect(x0 + s * x, y0 + s * y, s * w, s * h)
  const x1 = W * 0.58
  const y1 = H * 0.42
  const s2 = s * 0.8
  const b = s2 * 0.08
  g.fillStyle = red
  g.fillRect(x1, y1, s2, b)
  g.fillRect(x1, y1 + s2 - b, s2, b)
  g.fillRect(x1, y1, b, s2)
  g.fillRect(x1 + s2 - b, y1, b, s2)
  for (const [x, y, w, h] of [[0.2, 0.22, 0.6, 0.08], [0.46, 0.22, 0.08, 0.58], [0.22, 0.48, 0.56, 0.08], [0.22, 0.72, 0.56, 0.08]]) g.fillRect(x1 + s2 * x, y1 + s2 * y, s2 * w, s2 * h)
}

/** 刻刀：方钢刀杆 + 斜磨的刀口 + 缠绳刀柄，平躺沿 +z */
function sealKnife(wrap: string) {
  const g = new THREE.Group()
  g.add(rbox(0.6, 0.6, 11, STEEL, { y: 0.125 }, 0.08))
  g.add(
    hull(
      [[-0.3, 0.125, 5.5], [0.3, 0.125, 5.5], [0.3, 0.725, 5.5], [-0.3, 0.725, 5.5], [-0.3, 0.125, 6.9], [0.3, 0.125, 6.9]],
      [[0, 1, 2], [0, 2, 3], [0, 1, 5], [0, 5, 4], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 2, 5]],
      STEEL,
    ),
  )
  g.add(rbox(0.86, 0.86, 6, wrap, { z: -1.8 }, 0.2))
  for (const z of [-4.6, 1]) g.add(noOutline(box(0.96, 0.96, 0.3, shade(wrap, -0.25), { y: -0.05, z })))
  return g
}

function sealCarving(p: string[]) {
  const [wood, stone, wrap] = p
  const g = new THREE.Group()
  // 印床：底板 + 左边定位块 + 印石 + 活动夹块 + 右边丝杆座（丝杆穿过、尾端一个转轮）
  const bx = -6
  const bz = -4.5
  const bh = 1.6
  g.add(rbox(12, bh, 8, wood, { x: bx, z: bz }, 0.4))
  g.add(rbox(2.4, 3.6, 8, shade(wood, -0.15), { x: bx - 4.8, y: bh, z: bz }, 0.3))
  g.add(rbox(2.6, 6, 2.6, stone, { x: bx - 2.3, y: bh, z: bz }, 0.25))
  g.add(paintPanel(2.3, 2.3, 'hc2-seal-face', paintSealFace, { x: bx - 2.3, y: bh + 6.06, z: bz + 1.15, rx: -PI / 2 }))
  g.add(rbox(2.4, 3.6, 6, shade(wood, -0.15), { x: bx + 0.2, y: bh, z: bz }, 0.3))
  g.add(rbox(2.4, 3.6, 8, shade(wood, -0.15), { x: bx + 4.8, y: bh, z: bz }, 0.3))
  g.add(cylX(0.45, 8.6, STEEL, bx + 4.5, bh + 1.8, bz, 10))
  g.add(cylX(1.5, 1.2, DARK, bx + 8.6, bh + 1.8, bz, 18))
  // 宣纸 + 两方红印
  g.add(rbox(13, 0.2, 10, '#f7f1e3', { x: -7, z: 7, ry: 0.06 }, 0.05))
  g.add(P(G(paintPanel(12.4, 9.4, 'hc2-seal-print', paintSealPrint, { y: 0.26, z: 4.7, rx: -PI / 2 })), -7, 0, 7, 0, 0.06))
  // 三把刻刀，扇开放在右前方
  for (const [x, z, a] of [[5, 5, -0.25], [7, 5.4, -0.05], [9, 5.2, 0.18]]) g.add(P(sealKnife(wrap), x, 0, z, 0, a))
  // 印泥盒：瓷盒身（一圈青花线）里满满的朱砂印泥，盒盖翻过来放在一边
  const ix = 8
  const iz = -6
  g.add(cup(3.2, 3, 2.2, 0.3, '#f4f1ea', { x: ix, z: iz }, 20))
  g.add(cyl(2.85, 2.7, 1.6, '#c8302a', { x: ix, y: 0.3, z: iz }, 20))
  g.add(ball(2.8, '#d0362e', { x: ix, y: 1.9, z: iz }, [1, 0.2, 1], [16, 8]))
  g.add(noOutline(torus(3.1, 0.12, '#3d5a9a', { x: ix, y: 1.2, z: iz, rx: PI / 2 }, PI * 2, [4, 20])))
  g.add(cup(3.3, 3.1, 1.5, 0.3, '#f4f1ea', { x: ix + 7.2, z: iz + 1 }, 20))
  g.add(noOutline(torus(3.22, 0.12, '#3d5a9a', { x: ix + 7.2, y: 0.8, z: iz + 1, rx: PI / 2 }, PI * 2, [4, 20])))
  return fitGroup(g)
}

/** 竹席：一道道竹条 + 两道编绳 */
function paintSlats(base: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.fillStyle = shade(base, -0.18)
    for (let k = 1; k < 14; k++) g.fillRect(0, (k * H) / 14 - 1, W, 2)
    g.fillStyle = shade(base, -0.3)
    for (const x of [0.2, 0.8]) g.fillRect(W * x - 2, 0, 4, H)
  }
}

// ---------- 插花套组：竹席上一只浅水盘（剑山 + 半盘水）插着高中低三枝、一把花剪、一只铁皮桶装着待用的花材 ----------

const LEAF = '#5f9e4f'
const STEM = '#6f9a4a'
const WATER = '#9fd4ea'

/** 一根花茎：过控制点的细弯管，枝头开一朵花；沿途按 leaves 的参数位置长叶子 */
function stemWithFlower(pts: V3[], r: number, petal: string, heart: string, size: number, leaves: number[] = []) {
  const g = new THREE.Group()
  g.add(tube(pts, r, STEM, { seg: 12, radial: 5 }))
  const n = pts.length
  g.add(flowerAt(pts[n - 2], pts[n - 1], size, petal, heart))
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, 'centripetal')
  leaves.forEach((t, i) => {
    const at = curve.getPoint(t)
    const tan = curve.getTangent(t)
    const side = i % 2 ? 1 : -1
    // 叶子从茎上斜伸出去：叶片长轴朝外，叶柄一端埋在茎里
    const outDir = new THREE.Vector3(side, 0.6, side * 0.4).normalize().addScaledVector(tan, -0.3).normalize()
    const len = size * 2.2
    const lf = aimAt(new THREE.Group(), [at.x, at.y, at.z], outDir, UP.clone().cross(outDir).lengthSq() > 0.01 ? UP.clone() : new THREE.Vector3(1, 0, 0))
    lf.add(ball(len / 2, LEAF, { y: len / 2 - 0.3 }, [0.42, 1, 0.12], [10, 6]))
    g.add(lf)
  })
  return g
}

function ikebana(p: string[]) {
  const [vase, matC, petal] = p
  const g = new THREE.Group()
  const y0 = 0.6
  // 竹席：一块薄席 + 一道道竹条缝
  g.add(rbox(40, y0, 28, shade(matC, -0.12), {}, 0.2))
  g.add(paintPanel(39.4, 27.4, `hc2-ikebana-mat-${matC}`, paintSlats(matC), { y: y0 + 0.06, z: 13.7, rx: -PI / 2 }))
  // 浅水盘：盘里半盘水，盘底一只剑山
  const vx = -6
  const vz = -2
  g.add(cup(12, 10, 4.5, 0.6, vase, { x: vx, y: y0, z: vz }, 28))
  g.add(cyl(3.6, 3.6, 1.2, DARK, { x: vx, y: y0 + 0.6, z: vz }, 16))
  g.add(ghost(cyl(11.3, 9.9, 2.6, WATER, { x: vx, y: y0 + 0.6, z: vz }, 28), WATER, 0.45))
  const base: V3 = [vx, y0 + 1.6, vz]
  const at = (dx: number, dz: number): V3 => [base[0] + dx, base[1], base[2] + dz]
  // 真（最高，往后上方挑）、副（往右前斜）、体（低低地往左前探）
  g.add(stemWithFlower([at(-0.8, -0.6), [vx - 2, 14, vz - 2], [vx - 5, 28, vz - 4], [vx - 7.5, 37, vz - 5]], 0.32, petal, '#f2c230', 2.4, [0.25, 0.45, 0.65]))
  g.add(stemWithFlower([at(0.8, 0), [vx + 3, 10, vz + 1.5], [vx + 8, 18, vz + 4], [vx + 11, 23, vz + 5.5]], 0.28, shade(petal, 0.25), '#f2c230', 2.2, [0.35, 0.6]))
  g.add(stemWithFlower([at(0, 0.8), [vx - 3, 5, vz + 4], [vx - 8, 8.5, vz + 7], [vx - 11, 10, vz + 9]], 0.26, '#f4f2ec', '#e0a526', 2, [0.4]))
  // 盘口几片大叶子收边
  for (const [dx, dz, a] of [[2.5, 2, 0.6], [-2, 2.5, 2.2], [1, -2.6, -1.2]]) {
    const lf = aimAt(new THREE.Group(), at(dx * 0.3, dz * 0.3), new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)), UP.clone())
    lf.add(ball(4.5, LEAF, { y: 4.2 }, [0.4, 1, 0.1], [10, 8]))
    g.add(lf)
  }
  // 花剪：两只大圈柄平放 + 两片短刃
  const sx = 10
  const sz = 10
  for (const s of [-1, 1]) {
    g.add(torus(2.2, 0.5, DARK, { x: sx + s * 2.6, y: y0 + 0.45, z: sz + 2, rx: PI / 2 }, PI * 2, [8, 16]))
    g.add(batten([sx + s * 1.2, y0 + 0.3, sz], [sx + s * 0.2, y0 + 0.3, sz - 6], 0.9, 0.35, STEEL, 0.1))
  }
  g.add(cyl(0.6, 0.6, 0.9, STEEL, { x: sx, y: y0, z: sz - 0.6 }, 10))
  // 铁皮桶：桶里插着一把待用的花材，桶口一道提梁
  const bx = 12
  const bz = -7
  g.add(cup(5.5, 4.5, 12, 0.4, '#a9b1b8', { x: bx, y: y0, z: bz }, 24))
  g.add(torus(4.5 + 9 * 0.083, 0.2, '#8f979e', { x: bx, y: y0 + 9, z: bz, rx: PI / 2 }, PI * 2, [6, 24]))
  g.add(torus(5.6, 0.18, '#8f979e', { x: bx, y: y0 + 12, z: bz }, PI, [5, 14]))
  const flw: [number, number, number, number, string][] = [
    [-1.5, -1, 23, -3, petal],
    [1.5, 0.5, 21, 3, '#f4f2ec'],
    [0, 1.5, 19, 0, shade(petal, 0.3)],
    [-0.5, -2, 17, -1.5, '#f2c230'],
  ]
  for (const [dx, dz, h, lean, c] of flw) {
    const b0: V3 = [bx + dx, y0 + 0.4, bz + dz]
    g.add(stemWithFlower([b0, [bx + dx * 1.4, y0 + 10, bz + dz * 1.4], [bx + dx * 2 + lean, y0 + h, bz + dz * 2.2]], 0.22, c, '#e0a526', 1.8, [0.55]))
  }
  return fitGroup(g)
}

// ---------- 魔术道具：翻过来的礼帽里探出一只白兔、黑白魔术棒、一把扇开的扑克、三只倒扣的铜杯和一颗红球 ----------

function magicKit(p: string[]) {
  const [hat, band, cupC] = p
  const g = new THREE.Group()
  // 礼帽口朝上：帽身（帽顶在下）、一圈缎带、卷边的帽檐
  const hx = -7
  const hz = -2
  const hh = 13
  g.add(cup(7.4, 8, hh, 0.5, hat, { x: hx, z: hz }, 24))
  g.add(latheRing(7.42, 7.75, 2.6, band, hx, hh - 3.6, hz))
  g.add(
    P(
      lathe(
        [
          [7.2, 0],
          [11, 0.1],
          [12, 0.5],
          [12.2, 1.2],
          [11.6, 1.1],
          [10.8, 0.7],
          [7.2, 0.6],
          [7.2, 0],
        ],
        hat,
        32,
      ),
      hx,
      hh - 0.6,
      hz,
    ),
  )
  // 白兔：身子藏在帽里坐在帽底，头和两只长耳朵探出帽口，两只前爪搭在帽檐上
  const rw = '#f8f6f2'
  g.add(ball(4.6, rw, { x: hx, y: 6.2, z: hz }, [1, 1.25, 1], [12, 8]))
  g.add(ball(4.4, rw, { x: hx, y: hh + 1.6, z: hz + 0.8 }))
  for (const s of [-1, 1]) {
    const ear = new THREE.Group()
    ear.add(ball(1.5, rw, { y: 4 }, [1, 3, 0.62]))
    ear.add(noOutline(ball(0.9, '#ffb6c8', { y: 4, z: 0.5 }, [1, 2.6, 0.4], [8, 6])))
    g.add(P(ear, hx + s * 1.9, hh + 4.6, hz + 0.4, -0.15, 0, -s * 0.22))
    g.add(ball(1.3, rw, { x: hx + s * 2.6, y: hh + 0.6, z: hz + 6.6 }, [1, 0.8, 1.2], [10, 6]))
  }
  g.add(face(5.6, { x: hx, y: hh + 1.8, z: hz + 5.1 }))
  g.add(noOutline(ball(0.45, '#ff8fa3', { x: hx, y: hh + 0.9, z: hz + 5.15 })))
  // 魔术棒：黑杆白头，斜放在桌上
  const a: V3 = [-15, 0.6, 10]
  const b: V3 = [5, 0.6, 13]
  const d = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize()
  g.add(rod3(a, b, 0.6, '#1f2024', 8))
  for (const [q, s] of [[a, 1], [b, -1]] as [V3, number][]) g.add(rod3([q[0] - d.x * s * 0.2, q[1], q[2] - d.z * s * 0.2], [q[0] + d.x * s * 3, q[1], q[2] + d.z * s * 3], 0.65, '#f8f6f2', 8))
  // 扇开的扑克：九张牌围着左下角的轴扇开，每张高一层，角上一个红 / 黑花色块
  const fx = 9
  const fz = 8
  for (let k = 0; k < 9; k++) {
    const card = new THREE.Group()
    const y = k * 0.12
    card.add(box(6.3, 0.06, 8.8, '#fbfaf6', { x: 2.6, y, z: -3.6 }))
    card.add(plate(0.9, 0.9, k % 2 ? '#d8302a' : '#24252a', { x: 0.4, y: y + 0.08, z: -7, ry: PI / 4 }))
    card.rotation.y = 0.9 - k * 0.2
    card.position.set(fx, 0, fz)
    g.add(card)
  }
  // 三只倒扣的铜杯（口沿和顶边两道箍），中间那只前面一颗红球
  for (const x of [4, 11, 18]) {
    g.add(cyl(2.4, 3.2, 7, cupC, { x, z: -8 }, 16))
    g.add(torus(3.1, 0.3, shade(cupC, -0.12), { x, y: 0.45, z: -8, rx: PI / 2 }, PI * 2, [6, 16]))
  }
  g.add(ball(1.2, '#d8302a', { x: 11, y: 1.2, z: -3.4 }))
  return fitGroup(g)
}

/** 竖直的薄圆环（帽子上的缎带）：内半径 r0、外半径 r1、高 h，底在 y */
function latheRing(r0: number, r1: number, h: number, color: string, x: number, y: number, z: number) {
  return P(
    lathe(
      [
        [r0, 0],
        [r1, 0],
        [r1, h],
        [r0, h],
        [r0, 0],
      ],
      color,
      32,
    ),
    x,
    y,
    z,
  )
}

// ---------- 拉坯机：四脚电机箱上一只防溅盆，转盘上立着一只正在拉的泥坯；前面一只压脚踏板，左前一张圆凳，右边一桶水 ----------

const PW = { bw: 40, bd: 38, legH: 22, bh: 20 }
function pottersWheel(p: string[]) {
  const [body, pan, clay] = p
  const g = new THREE.Group()
  const { bw, bd, legH, bh } = PW
  const top = legH + bh
  // 四条管腿 + 电机箱（正面一块铭牌、右侧调速杆和电源开关）
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cyl(1.6, 1.6, legH + 1, STEEL, { x: sx * (bw / 2 - 4), z: sz * (bd / 2 - 4) }, 12))
      g.add(cyl(2.2, 2.4, 1.2, RUBBER, { x: sx * (bw / 2 - 4), z: sz * (bd / 2 - 4) }, 12))
    }
  g.add(rbox(bw, bh, bd, body, { y: legH }, 3))
  g.add(rbox(14, 4, 0.6, shade(body, -0.25), { y: legH + 8, z: bd / 2 - 0.1 }, 0.4))
  g.add(rbox(0.6, 3, 12, DARK, { x: bw / 2 - 0.1, y: legH + 12, z: 2 }, 0.3))
  g.add(cylX(0.8, 3.4, DARK, bw / 2 + 1.2, legH + 13.5, 4, 10))
  g.add(ball(1.2, '#e0463c', { x: bw / 2 + 3, y: legH + 13.5, z: 4 }))
  g.add(rbox(1, 2, 2.4, '#e0463c', { x: bw / 2 + 0.2, y: legH + 5, z: -10 }, 0.3))
  // 防溅盆 + 中心轴 + 转盘 + 泥坯（有内壁的瓶形）
  g.add(cup(23, 21, 10, 0.6, pan, { y: top }))
  g.add(cyl(2.4, 2.4, 1.6, STEEL, { y: top + 0.5 }, 16))
  g.add(cyl(15, 15, 2.2, STEEL, { y: top + 2 }, 32))
  g.add(torus(15, 0.4, shade(STEEL, -0.15), { y: top + 3.1, rx: PI / 2 }, PI * 2, [6, 32]))
  const ph = top + 4.2
  g.add(
    P(
      lathe(
        [
          [0, 0],
          [7.6, 0],
          [8, 1.2],
          [8.1, 4.5],
          [7.2, 8.5],
          [5.4, 11.5],
          [5, 13.4],
          [5.6, 14.6],
          [5.1, 15],
          [4.3, 14],
          [4.4, 12],
          [6.2, 8.6],
          [7, 4.6],
          [6.8, 2],
          [0, 1.8],
        ],
        clay,
        24,
      ),
      0,
      ph,
      0,
    ),
  )
  g.add(cyl(8.3, 8.6, 0.4, shade(clay, -0.12), { y: ph - 0.1 }, 24))
  // 压脚踏板：底座 + 后端铰链，踏板从铰链斜搭到前端弹簧柱上（角度按两点算）
  const fx = -8
  const zb = 27
  const zf = 44
  const yb = 2.2
  const yf = 6.8
  g.add(rbox(13, 2, zf - zb + 2, DARK, { x: fx, z: (zb + zf) / 2 }, 0.6))
  g.add(cylX(0.9, 11, STEEL, fx, yb, zb + 0.4, 12))
  const post = zf - 2
  g.add(cyl(0.8, 0.8, yb + ((yf - yb) * (post - zb)) / (zf - zb) - 1.9, STEEL, { x: fx, y: 1.9, z: post }, 10))
  const pedal = tiltFrame([zb, yb], [zf, yf], 'z')
  pedal.g.position.x = fx
  pedal.g.add(rbox(12, 1.2, pedal.len, '#3d3f44', { z: pedal.len / 2 }, 0.5))
  for (let k = 0; k < 4; k++) pedal.g.add(noOutline(box(9, 0.3, 0.5, RUBBER, { y: 1.1, z: 3 + k * 3.6 })))
  g.add(pedal.g)
  // 踏板线：贴地走到电机箱底
  g.add(tube([[fx + 4, 0.8, zb - 0.4], [fx + 6, 0.8, 21], [fx + 8, 6, bd / 2 - 2], [fx + 8, legH + 0.6, bd / 2 - 3]], 0.45, DARK, { seg: 16, radial: 6 }))
  // 圆凳：三条斜腿撑起圆凳面，腿间一道圈撑
  const cx = -34
  const cz = 24
  const ch = 38
  const sh = 4
  g.add(puckN(13, sh, '#c9a06a', { x: cx, y: ch - sh, z: cz }, 24, 3))
  const rr = (y: number) => 12 + ((8 - 12) * y) / (ch - sh)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.4
    g.add(rod3([cx + Math.cos(a) * 12, 0, cz + Math.sin(a) * 12], [cx + Math.cos(a) * 8, ch - sh + 0.5, cz + Math.sin(a) * 8], 1.2, '#a8804e', 10))
  }
  g.add(torus(rr(13), 0.55, '#a8804e', { x: cx, y: 13, z: cz, rx: PI / 2 }, PI * 2, [6, 24]))
  // 水桶：半桶水、桶沿搭一块海绵、提梁放倒在一边
  const bx = 34
  const bz = 6
  g.add(cup(11, 9.5, 24, 0.6, pan, { x: bx, z: bz }, 24))
  g.add(ghost(cyl(10.2, 9, 14, WATER, { x: bx, y: 0.6, z: bz }, 24), WATER, 0.5))
  g.add(rbox(7, 3, 5, '#f2c230', { x: bx, y: 23, z: bz - 10, rx: -0.2 }, 1))
  // 提梁两端在桶身左右，放倒搭在桶身前面
  g.add(torus(11.1, 0.3, shade(pan, -0.2), { x: bx, y: 22, z: bz, rx: PI / 2 + 0.15 }, PI, [6, 16]))
  return fitGroup(g)
}

// ---------- 桌面织布机：两块侧板夹着前后两根卷轴，中间一片钢筘，经线从后轴拉到织口，前半截已织成彩色条纹布，布上一把梭子 ----------

const LM = { half: 21, bt: 2 }
const LM_SIDE: V2[] = [
  [-18, 0],
  [-12, 0],
  [-9, 3],
  [9, 3],
  [12, 0],
  [18, 0],
  [18, 16],
  [15, 19],
  [-15, 25],
  [-18, 23],
]
function loom(p: string[]) {
  const [wood, yarnA, yarnB] = p
  const g = new THREE.Group()
  const { half, bt } = LM
  for (const s of [-1, 1]) g.add(sideSlab(LM_SIDE, bt, wood, s * half))
  // 前轴（卷着一圈布）和后轴（卷着经线），右端各一只棘轮 + 摇把
  const fb: V2 = [15, 16.5]
  const bb: V2 = [-15, 22.5]
  for (const [z, y] of [fb, bb]) {
    g.add(cylX(1.6, half * 2 + 4, shade(wood, -0.1), 0, y, z, 16))
    g.add(cylX(2.8, 0.8, DARK, half + bt / 2 + 0.9, y, z, 18))
    g.add(rod3([half + bt / 2 + 1.4, y, z], [half + bt / 2 + 1.4, y + 4.5, z + 1.5], 0.5, DARK, 8))
    g.add(ball(1, wood, { x: half + bt / 2 + 1.4, y: y + 4.8, z: z + 1.6 }))
  }
  g.add(cylX(2.2, 38, yarnA, 0, fb[1], fb[0], 20))
  g.add(cylX(2.1, 38, PAPER, 0, bb[1], bb[0], 20))
  // 经线平面：从前轴布卷顶到后轴线卷顶
  const w = tiltFrame([fb[0], fb[1] + 2.2], [bb[0], bb[1] + 2.1], 'z')
  const cloth = 13
  const cols = [yarnA, yarnB, PAPER, yarnB, yarnA]
  cols.forEach((c, k) => w.g.add(rbox(37.6, 0.3, cloth / cols.length, c, { y: -0.05, z: (cloth / cols.length) * (k + 0.5) }, 0.08)))
  for (let i = 0; i < 31; i++) {
    const x = -18 + i * 1.2
    w.g.add(rod3([x, 0.12, cloth - 0.4], [x, 0.12, w.len], 0.07, PAPER, 4))
  }
  // 钢筘：一排竖缝的木框，经线从缝里穿过，两头搁在侧板顶上的筘座里
  const zh = w.len * 0.62
  w.g.add(holePanel(half * 2 + 0.6, 11, 0.8, wood, gridHoles(half * 2 + 0.6, 11, 26, 1, 0.55, 1.6), { y: -5.5, z: zh }, 0.6, { bevel: 0 }))
  // 梭子：扁木片两头开叉，中间缠着纬线，平放在织好的布上
  w.g.add(rbox(32, 0.35, 3, shade(wood, 0.12), { x: -1, y: 0.25, z: cloth * 0.45, ry: 0.06 }, 0.15))
  w.g.add(rbox(18, 0.9, 2.4, yarnB, { x: -1, y: 0.1, z: cloth * 0.45, ry: 0.06 }, 0.4))
  g.add(w.g)
  // 筘座：侧板顶上两块小木块托住钢筘两端
  const hz = fb[0] + (bb[0] - fb[0]) * (zh / w.len)
  const topY = 19 + ((25 - 19) * (15 - hz)) / 30
  for (const s of [-1, 1]) g.add(rbox(bt + 0.8, 3.2, 3.4, shade(wood, -0.15), { x: s * half, y: topY - 0.4, z: hz }, 0.4))
  return fitGroup(g)
}

// ---------- 羊毛毡手作：泡沫垫上坐着一只戳了一半的毛毡小熊（右耳和右臂还是蓬松的毛团，头上插着一根戳针）、一支三针戳笔、几团彩色羊毛条 ----------

/** 一团蓬松的羊毛：几只低段数的扁球叠在一起 */
function woolPuff(r: number, color: string, at: V3, seed: number) {
  const g = new THREE.Group()
  const rnd = rng(seed)
  for (let k = 0; k < 4; k++) {
    const a = rnd() * PI * 2
    const d = k ? r * 0.45 : 0
    g.add(ball(r * (k ? 0.72 : 1), color, { x: Math.cos(a) * d, y: r * (k ? 0.75 : 0.62), z: Math.sin(a) * d }, [1.25, 0.62, 1], [8, 6]))
  }
  g.position.set(...at)
  return g
}

function needleFelting(p: string[]) {
  const [wool, pad, accent] = p
  const g = new THREE.Group()
  // 泡沫垫
  const ph = 4
  const px = -3
  g.add(rbox(14, ph, 11, pad, { x: px, z: -1 }, 0.8))
  for (const [x, z] of [[-4, 2], [2, -3], [-7, -4], [3, 3]]) g.add(noOutline(ball(0.35, shade(pad, -0.15), { x: px + x, y: ph - 0.05, z }, [1, 0.3, 1], [8, 4])))
  // 小熊：坐姿，身子 + 两条腿 + 左臂，头上两只耳朵、口鼻、脸
  const bx = px
  const bz = -1
  const by = ph + 2.5
  g.add(ball(2.7, wool, { x: bx, y: by, z: bz }, [1, 1.05, 0.9]))
  for (const s of [-1, 1]) g.add(ball(1.2, wool, { x: bx + s * 1.5, y: ph + 1, z: bz + 1.9 }, [1, 0.9, 1.4]))
  g.add(ball(1, wool, { x: bx - 2.4, y: by + 0.3, z: bz + 0.8 }, [0.9, 1.5, 0.9]))
  const hy = by + 4.4
  g.add(ball(2.4, wool, { x: bx, y: hy, z: bz }))
  g.add(ball(0.85, wool, { x: bx - 1.7, y: hy + 1.9, z: bz - 0.2 }))
  g.add(ball(0.45, shade(wool, 0.25), { x: bx - 1.7, y: hy + 1.95, z: bz + 0.4 }, [1, 1, 0.5], [8, 6]))
  g.add(ball(0.95, shade(wool, 0.3), { x: bx, y: hy - 0.7, z: bz + 1.9 }, [1.1, 0.8, 0.8]))
  g.add(ball(0.32, DARK, { x: bx, y: hy - 0.45, z: bz + 2.75 }, undefined, [8, 6]))
  g.add(face(2.6, { x: bx, y: hy + 0.3, z: bz + 2.25 }))
  // 没戳完的地方：右耳、右臂还是蓬松的毛团
  g.add(woolPuff(0.9, shade(wool, 0.15), [bx + 1.6, hy + 1.4, bz - 0.2], 3))
  g.add(woolPuff(1.1, shade(wool, 0.15), [bx + 2.4, by - 0.6, bz + 0.6], 5))
  // 头上插着的一根戳针：上端折成 L 形
  const nt: V3 = [bx + 0.6, hy + 1.6, bz + 0.4]
  const nh: V3 = [bx + 2.4, hy + 7, bz + 1]
  g.add(rod3(nt, nh, 0.07, STEEL, 4))
  g.add(rod3(nh, [nh[0] + 0.9, nh[1] + 0.2, nh[2]], 0.09, STEEL, 4))
  // 三针戳笔：木杆 + 前端金属夹头 + 三根针，平放在桌上
  g.add(cylX(0.6, 7, accent, 8, 0.6, 6, 12))
  g.add(cylX(0.75, 1.6, STEEL, 4, 0.75, 6, 12))
  for (const dz of [-0.35, 0, 0.35]) g.add(rod3([3.2, 0.75, 6 + dz], [0.2, 0.75, 6 + dz * 1.2], 0.05, STEEL, 4))
  // 几团彩色羊毛条
  g.add(woolPuff(2, accent, [8.5, 0, -4], 11))
  g.add(woolPuff(1.7, shade(wool, -0.1), [9.5, 0, 1.5], 17))
  g.add(woolPuff(1.5, '#f4f2ec', [-9, 0, 7], 23))
  g.add(tube([[6.5, 0.5, -5], [3, 0.6, -6.8], [-1, 0.5, -7.2], [-6, 0.6, -6.8]], 0.55, accent, { seg: 14, radial: 6 }))
  return fitGroup(g)
}

// ---------- 黏土雕塑台：铸铁转盘上一块木托板，托板上一尊未完成的泥塑胸像（鼻、下巴、耳朵已经堆出来，一侧还贴着泥块），旁边一块湿布、一把环形刀、一把木刮刀、一只喷水壶 ----------

function claySculpt(p: string[]) {
  const [clay, metal, cloth] = p
  const g = new THREE.Group()
  // 转盘：铸铁底座 + 转轴 + 顶盘
  const wx = -2
  const wz = -1
  g.add(cyl(7, 8.5, 2.5, metal, { x: wx, z: wz }, 24))
  g.add(cyl(2.4, 3, 2.2, shade(metal, -0.1), { x: wx, y: 2.4, z: wz }, 14))
  g.add(cyl(11, 11, 1.2, metal, { x: wx, y: 4.5, z: wz }, 32))
  g.add(rbox(15, 1.2, 15, N.oak, { x: wx, y: 5.7, z: wz }, 0.3))
  // 胸像：泥底座、肩、颈、头（鼻、下巴、耳），后脑一块头发
  const y0 = 6.9
  g.add(cyl(5.6, 6.2, 2.4, clay, { x: wx, y: y0, z: wz }, 24))
  g.add(ball(5, clay, { x: wx, y: y0 + 3.6, z: wz }, [1.5, 0.62, 0.85]))
  g.add(cyl(2.6, 3.2, 6, clay, { x: wx, y: y0 + 4, z: wz + 0.3 }, 16))
  const hy = y0 + 13.6
  g.add(ball(5, clay, { x: wx, y: hy, z: wz + 0.4 }, [0.86, 1.1, 1]))
  g.add(ball(2.4, clay, { x: wx, y: hy - 3.6, z: wz + 2.4 }, [1, 0.8, 0.9]))
  g.add(ball(0.7, clay, { x: wx, y: hy - 0.9, z: wz + 5.1 }, [0.75, 1.4, 1]))
  for (const s of [-1, 1]) g.add(ball(1.1, clay, { x: wx + s * 4.2, y: hy - 0.6, z: wz }, [0.45, 1, 0.7]))
  g.add(ball(4.6, shade(clay, -0.06), { x: wx, y: hy + 1.6, z: wz - 0.8 }, [0.92, 0.8, 1]))
  // 还没抹平的泥块：右脸颊和底座上贴着几团、托板上掉了几粒
  for (const [x, y, z, r] of [[3.4, hy - 2, 2.2, 1.1], [2.6, hy + 2.6, 2, 0.9], [4, y0 + 1.6, 3.2, 1], [-4.2, y0 + 1.2, 3.6, 0.8]]) g.add(ball(r, shade(clay, 0.08), { x: wx + x, y, z: wz + z }, [1, 0.8, 1], [10, 6]))
  for (const [x, z] of [[5, 5.5], [-5.5, -4], [4.5, -5]]) g.add(ball(0.55, clay, { x: wx + x, y: y0 + 0.35, z: wz + z }, [1, 0.7, 1], [8, 5]))
  // 湿布：皱成一堆的几层扁团
  for (const [x, z, sx, a] of [[-12, 7, 1.7, 0.3], [-10, 9.5, 1.4, -0.4], [-13.5, 9.8, 1.2, 1], [-10.6, 6.4, 1, 0.8]]) {
    const b = ball(3, cloth, { x, y: 0.8, z }, [sx, 0.32, 1.1], [12, 6])
    b.rotation.y = a
    g.add(b)
  }
  // 环形刀（木柄 + 一只钢丝环）和木刮刀，平放在前面
  g.add(rod3([3, 0.5, 11], [12, 0.5, 9.4], 0.5, '#c9a06a', 10))
  g.add(P(torus(0.9, 0.12, STEEL, {}, PI * 2, [4, 12]), 13.1, 1.05, 9.2, 0, -0.17))
  g.add(batten([2, 0.25, 13.5], [13, 0.25, 13], 1, 0.5, '#b8875a', 0.2))
  // 喷水壶
  g.add(cyl(2.2, 2.2, 8, '#f4f4f2', { x: 11, z: -8 }, 18))
  g.add(cyl(1, 1.2, 1.2, '#f4f4f2', { x: 11, y: 8, z: -8 }, 12))
  g.add(rbox(2.4, 3, 4, metal, { x: 11, y: 9, z: -7.6 }, 0.6))
  g.add(rbox(0.8, 2.4, 1, metal, { x: 11, y: 7.4, z: -5.6, rx: 0.3 }, 0.3))
  return fitGroup(g)
}

// ---------- 家用咖啡烘豆机：机座 + 两侧立柱夹着一只横放的玻璃滚筒（筒里一层豆子），右前一只冷却盘盛着烘好的深色豆，右后一罐生豆 ----------

const BEAN_ROAST = '#6b3f22'
const BEAN_DARK = '#4a2a18'
const BEAN_GREEN = '#b9b884'
/** 一颗咖啡豆（扁椭球，低段数）；在 g 里按 rng 撒豆 */
function scatterBeans(g: THREE.Group, n: number, color: string, seed: number, place: (r: () => number) => V3) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const [x, y, z] = place(r)
    const b = ball(0.55, i % 3 ? color : shade(color, -0.08), { x, y, z }, [1, 0.65, 0.78], [5, 4])
    b.rotation.y = r() * PI
    g.add(b)
  }
}

function coffeeRoaster(p: string[]) {
  const [body, trim, lidC] = p
  const g = new THREE.Group()
  // 机座 + 正面控制面板（旋钮、显示屏、两颗按钮）+ 抽出式集壳盘
  const rx = -7
  const rz = -2
  g.add(rbox(26, 10, 20, body, { x: rx, z: rz }, 1.5))
  g.add(rbox(15, 6, 0.6, DARK, { x: rx + 3, y: 2.2, z: rz + 10 }, 0.4))
  g.add(cylZ(1.6, 1.2, trim, rx - 1, 5.2, rz + 10.6, 18))
  g.add(lit(rbox(4.4, 1.8, 0.4, '#7fe0c8', { x: rx + 4.4, y: 5.6, z: rz + 10.3 }, 0.15), '#7fe0c8', 0.6))
  for (const x of [3.2, 5.6]) g.add(cylZ(0.6, 0.6, trim, rx + x, 3.6, rz + 10.4, 12))
  g.add(rbox(8, 1.6, 0.8, shade(body, -0.15), { x: rx - 8, y: 3, z: rz + 10.1 }, 0.4))
  // 两侧立柱 + 背后排烟口
  for (const s of [-1, 1]) g.add(rbox(4, 15, 16, body, { x: rx + s * 11, y: 9.5, z: rz }, 1.2))
  // 排烟口整体靠到机座后沿：烟囱前缘离玻璃滚筒（筒壁最靠后到 rz - 6.3）留 0.9cm，不再插进筒里
  g.add(rbox(18, 4, 5, shade(body, -0.1), { x: rx, y: 9.5, z: rz - 7.4 }, 0.8))
  g.add(cyl(1.3, 1.3, 6, trim, { x: rx, y: 13, z: rz - 8.5 }, 14))
  // 玻璃滚筒：两端金属圈、中轴、两根搅拌条，筒底一层烘到一半的豆子
  const dy = 18
  g.add(cylX(0.5, 18, STEEL, rx, dy, rz, 10))
  for (const s of [-1, 1]) g.add(cylX(6.3, 0.8, trim, rx + s * 8.6, dy, rz, 28))
  for (const a of [0.6, 0.6 + PI]) g.add(rbox(16.4, 0.4, 0.8, STEEL, { x: rx, y: dy + Math.sin(a) * 4.6 - 0.2, z: rz + Math.cos(a) * 4.6 }, 0.1))
  scatterBeans(g, 50, BEAN_ROAST, 7, (r) => {
    const a = -PI / 2 + (r() - 0.5) * 1.6
    const rr = 5.3 + r() * 0.2
    return [rx - 7.6 + r() * 15.2, dy + Math.sin(a) * rr, rz + Math.cos(a) * rr]
  })
  g.add(ghost(cylX(6, 17.2, GLASS, rx, dy, rz, 28), GLASS, 0.28))
  // 冷却盘：底座（风扇）+ 浅盘，盘里一层深色豆
  const cx = 14.5
  const cz = 5.5
  g.add(cyl(6.8, 7.2, 4, body, { x: cx, z: cz }, 24))
  g.add(lit(cylZ(0.4, 0.4, '#7fe0c8', cx, 2, cz + 7, 8), '#7fe0c8', 0.6))
  g.add(cup(7.6, 7, 2.6, 0.4, STEEL, { x: cx, y: 4, z: cz }, 24))
  scatterBeans(g, 34, BEAN_DARK, 13, (r) => {
    const a = r() * PI * 2
    const rr = Math.sqrt(r()) * 5.2
    return [cx + Math.cos(a) * rr, 4.75 + r() * 0.3, cz + Math.sin(a) * rr]
  })
  // 生豆罐：玻璃罐里装着七分满的生豆，木盖
  const jx = 15
  const jz = -8
  g.add(cyl(3.45, 3.45, 7.5, BEAN_GREEN, { x: jx, y: 0.3, z: jz }, 20))
  scatterBeans(g, 9, BEAN_GREEN, 19, (r) => {
    const a = r() * PI * 2
    const rr = Math.sqrt(r()) * 2.6
    return [jx + Math.cos(a) * rr, 7.9, jz + Math.sin(a) * rr]
  })
  g.add(ghost(cup(3.8, 3.8, 11, 0.3, GLASS, { x: jx, z: jz }, 20), GLASS, 0.3))
  g.add(cyl(4.1, 4.1, 1.6, lidC, { x: jx, y: 11, z: jz }, 20))
  g.add(cyl(1.2, 1.2, 0.8, shade(lidC, -0.15), { x: jx, y: 12.6, z: jz }, 12))
  return fitGroup(g)
}

// ---------- 家酿啤酒套装：带龙头的白色发酵桶（盖上插着气塞、正面贴刻度和标签），一只木箱装着十二只空啤酒瓶，地上一把双柄压盖器和几枚瓶盖 ----------

const BOTTLE_PTS: V2[] = [
  [0, 0],
  [2.9, 0],
  [3.1, 0.4],
  [3.1, 14],
  [2.7, 16.2],
  [1.4, 18.5],
  [1.2, 21.6],
  [1.45, 21.8],
  [1.45, 22.6],
  [0, 22.6],
]

function homebrew(p: string[]) {
  const [ferm, crateC, accent] = p
  const g = new THREE.Group()
  // 发酵桶：微收口的桶身、盖子、盖上的橡胶塞和三件式气塞
  const fx = -15
  const fz = 0
  const fh = 38
  const rAt = (y: number) => 14.5 + (y / fh) * 1
  g.add(cyl(15.5, 14.5, fh, ferm, { x: fx, z: fz }, 36))
  for (const y of [8, 30]) g.add(torus(rAt(y), 0.4, shade(ferm, -0.08), { x: fx, y, z: fz, rx: PI / 2 }, PI * 2, [6, 36]))
  g.add(cyl(16.2, 16.2, 2.2, shade(ferm, -0.05), { x: fx, y: fh, z: fz }, 36))
  g.add(cyl(1.5, 1.5, 0.8, RUBBER, { x: fx, y: fh + 2, z: fz }, 12))
  g.add(cyl(0.5, 0.5, 2, '#f4f4f2', { x: fx, y: fh + 2.6, z: fz }, 8))
  g.add(ghost(cyl(1.6, 1.6, 6.5, GLASS, { x: fx, y: fh + 4.4, z: fz }, 16), GLASS, 0.4))
  g.add(cyl(1.3, 1.3, 2.4, '#9fd4ea', { x: fx, y: fh + 4.6, z: fz }, 14))
  g.add(cyl(1.85, 1.85, 0.9, accent, { x: fx, y: fh + 10.8, z: fz }, 16))
  // 两侧提手、正面刻度条和标签（竖平板半埋进桶壁）
  for (const s of [-1, 1]) g.add(rbox(2.4, 2.4, 9, shade(ferm, -0.1), { x: fx + s * 15.8, y: 32, z: fz }, 0.8))
  const sa = -0.55
  g.add(P(rbox(1.2, 22, 1.6, shade(ferm, -0.15), {}, 0.3), fx + Math.sin(sa) * (rAt(20) - 0.6), 20, fz + Math.cos(sa) * (rAt(20) - 0.6), 0, sa))
  for (let k = 0; k < 6; k++) {
    const y = 11 + k * 3.6
    g.add(noOutline(P(box(k % 2 ? 1.2 : 2, 0.3, 1.6, DARK), fx + Math.sin(sa) * (rAt(y) - 0.5), y, fz + Math.cos(sa) * (rAt(y) - 0.5), 0, sa)))
  }
  g.add(rbox(10, 8, 3.2, PAPER, { x: fx + 2, y: 16, z: fz + rAt(20) - 1.2 }, 0.3))
  g.add(noOutline(rbox(7, 1.4, 0.4, accent, { x: fx + 2, y: 21, z: fz + rAt(20) + 0.55 }, 0.1)))
  g.add(noOutline(rbox(5, 0.6, 0.4, DARK, { x: fx + 1, y: 18.4, z: fz + rAt(20) + 0.55 }, 0.1)))
  // 出酒龙头：桶底前方伸出的短管、下弯的出口、顶上的扳柄
  const ty = 5
  const tz = fz + Math.sqrt(rAt(ty) ** 2 - 36)
  g.add(cylZ(1.4, 4, accent, fx + 6, ty, tz + 0.8, 16))
  g.add(cyl(0.6, 0.7, 2.2, accent, { x: fx + 6, y: ty - 2.6, z: tz + 2.2 }, 10))
  g.add(rbox(0.9, 3.2, 1.2, accent, { x: fx + 6, y: ty + 1, z: tz + 1.6, rx: -0.3 }, 0.3))
  // 木箱：开口箱，两头开把手孔；里面 4 × 3 只空啤酒瓶
  const cx = 18
  const cz = 2
  const cw = 30
  const cd = 22.6
  const ch = 13
  // 箱体同 kit.ts 的 shell（前后板盖全宽、左右板夹在中间、不封顶），但板角圆弧只细分 4 段；
  // 把手孔做成削角的长圆孔（8 个顶点）：圆角矩形孔 + 默认 16 段圆弧，一块侧板就要 1600 个三角面
  const ct = 1.2
  const ih = ch - ct
  const hw = 4.5
  const hy0 = ch - 5 - ct
  const hole: Hole[] = [{ kind: 'poly', pts: [[-hw, hy0 + 0.6], [-hw + 0.6, hy0], [hw - 0.6, hy0], [hw, hy0 + 0.6], [hw, hy0 + 2.4], [hw - 0.6, hy0 + 3], [-hw + 0.6, hy0 + 3], [-hw, hy0 + 2.4]] }]
  const crate = new THREE.Group()
  for (const s of [-1, 1]) {
    crate.add(holePanel(cw, ih, ct, crateC, [], { y: ct, z: s * (cd / 2 - ct / 2), ry: s > 0 ? 0 : PI }, 1.5, { seg: 4 }))
    crate.add(holePanel(cd - ct * 2, ih, ct, crateC, hole, { x: s * (cw / 2 - ct / 2), y: ct, ry: (s * PI) / 2 }, 1.5, { seg: 4 }))
  }
  crate.add(rbox(cw, ct, cd, crateC, {}, Math.min(ct * 0.4, 1)))
  g.add(P(crate, cx, 0, cz))
  for (const dx of [-10.2, -3.4, 3.4, 10.2])
    for (const dz of [-6.8, 0, 6.8]) {
      g.add(P(lathe(BOTTLE_PTS, AMBER, 10), cx + dx, 1.2, cz + dz))
    }
  // 双柄压盖器：平躺在地上，两根长柄张开成 V 字，前端一只压盖钟罩
  const kx = 16
  const kz = 21
  g.add(rbox(3, 3, 8, STEEL, { x: kx, z: kz }, 0.6))
  g.add(cylX(1.9, 2.6, DARK, kx + 2.6, 1.9, kz + 2.4, 16))
  for (const s of [-1, 1]) {
    g.add(strutBox([kx - 1, 0.6, kz + s * 1.2], [kx - 16, 0.6, kz + s * 5], 1.2, 2, STEEL, 0.3))
    g.add(strutBox([kx - 10, 0.75, kz + s * (1.2 + 3.8 * (9 / 15))], [kx - 16.4, 0.75, kz + s * 5.1], 1.5, 2.4, accent, 0.5))
  }
  for (const [x, z] of [[23, 18], [25.5, 21], [22.5, 23.5], [27, 23.8]]) g.add(cyl(1.3, 1.35, 0.6, '#d9b44a', { x, z }, 10))
  return fitGroup(g)
}

// ---------- 配色 ----------

const AT_PALS: Pal[] = [
  ['nordic', [N.oak, '#e8d79a', '#e0463c']],
  ['industrial', [I.walnut, '#d9c98f', '#3f7fd8']],
  ['modern', [M.char, '#f2f2ee', '#f2c230']],
  ['farmhouse', [F.oak, '#cbb778', F.barn]],
]
const FS_PALS: Pal[] = [
  ['modern', [M.char, '#d8483f', M.black]],
  ['modern', [M.white, '#3f6fd8', '#24252a']],
  ['industrial', [I.iron, I.rust, I.leather]],
  ['classic', [CL.navy, CL.gold, CL.wine]],
]
const TCG_PALS: Pal[] = [
  ['modern', [M.black, '#3a3d48', '#d8483f']],
  ['cute', [C.lilac, '#5a4a8a', C.sky]],
  ['retro', [R.teal, '#2f3a48', R.mustard]],
  ['modern', ['#7a2e3a', '#262833', M.silver]],
]
const PO_PALS: Pal[] = [
  ['nordic', [N.oak, M.black, '#d8b46a']],
  ['classic', [CL.walnut, CL.gold, CL.wine]],
  ['japanese', [J.hinoki, J.sumi, J.shu]],
  ['modern', [M.walnut, M.silver, '#7fb8d8']],
]

const CM_PALS: Pal[] = [
  ['nordic', [N.white, '#f2a7b8', '#f3e3c4']],
  ['modern', [M.char, '#8fc7e8', '#f2d7a0']],
  ['cute', [C.mint, C.lilac, C.peach]],
  ['retro', [R.cream, R.teal, '#f1c27a']],
]
const LC_PALS: Pal[] = [
  ['industrial', ['#3f7d5a', I.leather, '#f2e3c0']],
  ['classic', ['#2f4f6f', '#7a4b32', '#f4ede0']],
  ['farmhouse', ['#556b5a', '#b07a4a', F.barn]],
  ['modern', ['#4a4d55', '#2f2a28', '#e0a526']],
]
const OG_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.leaf]],
  ['japanese', [J.shu, J.ai, '#7fa86a']],
  ['modern', ['#f2c230', '#3f7fd8', '#4f9e5b']],
  ['retro', [R.red, R.teal, R.olive]],
]
const SC_PALS: Pal[] = [
  ['chinese', [CN.rosewood, '#d8c7a4', CN.lacquer]],
  ['chinese', [CN.walnut, CN.jade, CN.ink]],
  ['chinese', [CN.brass, '#c9a98a', '#3d5a80']],
  ['japanese', [J.wood, '#e6d6b8', J.sumi]],
]

const IK_PALS: Pal[] = [
  ['japanese', [J.sumi, '#d8c99a', '#f08aa8']],
  ['japanese', ['#e9e2d2', J.tatami, J.shu]],
  ['nordic', [N.white, N.oakL, '#c58fd8']],
  ['chinese', [CN.celadon, '#d8c99a', '#f2c230']],
]
const MK_PALS: Pal[] = [
  ['classic', ['#24252a', CL.wine, '#c9a25a']],
  ['modern', ['#2c3550', '#d8483f', M.silver]],
  ['retro', ['#4a2c5a', R.mustard, '#c27a46']],
  ['cute', ['#5a4a8a', C.pink, '#e8c25a']],
]
const PW_PALS: Pal[] = [
  ['modern', [M.light, '#3f7fd8', '#b8794a']],
  ['modern', [M.char, M.gray, '#c98d63']],
  ['industrial', [I.steel, I.iron, '#a86a4a']],
  ['nordic', [N.white, N.sage, '#d8b89a']],
]
const LM_PALS: Pal[] = [
  ['nordic', [N.oak, '#e07a5f', '#3d5a80']],
  ['farmhouse', [F.oak, F.sage, F.barn]],
  ['japanese', [J.wood, J.ai, '#e9d2a6']],
  ['cute', [C.woodL, C.pink, C.sky]],
]

const NF_PALS: Pal[] = [
  ['cute', ['#c8946a', '#c9e8a0', C.pink]],
  ['cute', [C.white, C.sky, C.lemon]],
  ['nordic', ['#a8a39a', N.mustard, '#9fb4c7']],
  ['retro', [R.caramel, R.cream, R.teal]],
]
const CS_PALS: Pal[] = [
  ['modern', ['#b8794a', M.char, '#d8d2c4']],
  ['industrial', ['#8f8a82', I.iron, '#c9bfa8']],
  ['nordic', ['#d8b89a', N.blue, N.linen]],
  ['farmhouse', ['#a86a4a', F.navy, F.linen]],
]
const CR_PALS: Pal[] = [
  ['modern', [M.char, M.silver, N.oak]],
  ['modern', [M.white, '#d8483f', M.walnut]],
  ['retro', [R.cream, R.teal, R.caramel]],
  ['industrial', [I.iron, I.rust, I.walnut]],
]
const HB_PALS: Pal[] = [
  ['modern', ['#f2f2ee', N.oak, '#3f7fd8']],
  ['farmhouse', [F.white, F.oak, F.barn]],
  ['industrial', ['#e8e4dc', I.walnut, I.rust]],
  ['nordic', ['#eef2f4', N.oakL, N.sage]],
]

export const HOBBY_CRAFTS: AssetDef[] = [
  define('hc2-archery-target', '射箭靶', 'hobby', [82, 72, 147], AT_PALS, archeryTarget, {
    type: 'sports-gear',
    tags: ['hobby:sports'],
    mats: ['wood', 'fabric', 'plastic'],
  }),
  define('hc2-fencing-set', '击剑装备', 'hobby', [55, 57, 113], FS_PALS, fencingSet, {
    type: 'sports-gear',
    tags: ['hobby:sports'],
    mats: ['fabric', 'fabric', 'leather'],
  }),
  define('hc2-tcg-binder', '卡牌收藏册', 'hobby', [60, 30, 9.6], TCG_PALS, tcgBinder, {
    ...PROP,
    type: 'tabletop-game',
    tags: ['hobby:boardgames', 'hobby:collecting'],
    mats: ['leather', 'paper', 'plastic'],
  }),
  define('hc2-perfume-organ', '调香台', 'hobby', [40, 28, 26], PO_PALS, perfumeOrgan, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:beauty'],
    mats: ['wood', 'plastic', 'glass'],
  }),
  define('hc2-candle-making', '手工蜡烛工作台', 'hobby', [44, 35, 16], CM_PALS, candleMaking, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['plastic', 'plastic', 'paint'],
  }),
  define('hc2-leathercraft', '皮具手作垫', 'hobby', [44, 34, 6.5], LC_PALS, leathercraft, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['plastic', 'leather', 'fabric'],
  }),
  define('hc2-origami', '折纸', 'hobby', [28, 24, 7.5], OG_PALS, origami, {
    ...PROP,
    type: 'decor',
    tags: ['hobby:crafts', 'multi-ok'],
    mats: ['paper', 'paper', 'paper'],
  }),
  define('hc2-seal-carving', '篆刻工具', 'hobby', [32, 22, 8], SC_PALS, sealCarving, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    styles: ['chinese'],
    mats: ['wood', 'stone', 'fabric'],
  }),
  define('hc2-ikebana', '插花套组', 'hobby', [40, 29, 38], IK_PALS, ikebana, {
    ...PROP,
    type: 'decor',
    tags: ['hobby:plants', 'leafy'],
    mats: ['ceramic', 'wood', 'plant'],
  }),
  define('hc2-magic-kit', '魔术道具', 'hobby', [41, 28, 26], MK_PALS, magicKit, {
    ...PROP,
    type: 'toy',
    mats: ['fabric', 'fabric', 'metal'],
  }),
  define('hc2-potters-wheel', '拉坯机', 'hobby', [92, 68, 61], PW_PALS, pottersWheel, {
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['metal', 'plastic', 'ceramic'],
  }),
  define('hc2-loom', '桌面织布机', 'hobby', [48, 36, 28], LM_PALS, loom, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['wood', 'fabric', 'fabric'],
  }),
  define('hc2-needle-felting', '羊毛毡手作', 'hobby', [23, 16, 18], NF_PALS, needleFelting, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['pile', 'plastic', 'pile'],
  }),
  define('hc2-clay-sculpt', '黏土雕塑台', 'hobby', [31, 26, 26.5], CS_PALS, claySculpt, {
    ...PROP,
    type: 'craft-tool',
    tags: ['hobby:crafts'],
    mats: ['ceramic', 'metal', 'fabric'],
  }),
  define('hc2-coffee-roaster', '家用咖啡烘豆机', 'kitchenware', [42, 25, 24.5], CR_PALS, coffeeRoaster, {
    ...PROP,
    type: 'coffee-gear',
    tags: ['hobby:coffee'],
    mats: ['metal', 'plastic', 'wood'],
  }),
  define('hc2-homebrew', '家酿啤酒套装', 'kitchenware', [65, 43, 50], HB_PALS, homebrew, {
    type: 'kitchenware',
    mats: ['plastic', 'wood', 'plastic'],
  }),
]
