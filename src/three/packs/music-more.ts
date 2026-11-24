// 更多乐器与音乐角：班卓琴、曼陀林、马头琴、唢呐与笙、编钟、木鱼与磬、康加鼓、定音鼓、钟琴、竖笛、双簧管与巴松、
// 脚踏风琴、吉他效果器板、吉他壁挂组、隔音练琴角。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z（演奏的人在 +z 一侧）。落地的大乐器带支架立着；小乐器是桌面摆件（PROP）。type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus, tray } from '../toon'
import { C, holePanel, paintPanel, rectPoly, rng, type AssetDef, type Hole } from '../kit'
import { G, P, PI, batten, cylX, cylZ, fitGroup, fitWall, lathe, lit, mesh, noOutline, rod3, sideSlab, taperRod3, tiltFrame, tube, type V2, type V3 } from '../geo'
import { CL, CN, F, I, J, M, N, PROP, R, define, type Pal } from '../packkit'

const STEEL = '#c9ced4'
const DARK = '#2a2a2e'
const RUBBER = '#2e2f33'
const IVORY = '#f4ecd8'
const PAPER = '#fbf8f0'
const STRING = '#e6e2d6'
const HOLE = '#2a1e14'
/** 指板、琴码的乌木色 */
const EBONY = '#3a2618'
/** 琴颈的桃花心木色 / 电吉他琴颈的枫木色 */
const NECK = '#8a5432'
const MAPLE = '#e8c58a'
/** 竹料（品、哨片、弓杆）的浅竹色 */
const CANE = '#dcc38a'

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

// ---------- 小工具 ----------

/** 琴弦 / 细线：两点之间很细的杆，不描边 */
const thread = (a: V3, b: V3, r = 0.07, color = STRING) => noOutline(taperRod3(a, b, r, r, color, 4))

/** 右半边轮廓（从底部中线到顶部中线）镜像成完整的闭合轮廓 */
const mirrorHalf = (right: V2[]): V2[] => [...right, ...right.slice(1, -1).reverse().map(([x, y]): V2 => [-x, y])]

/** 平面轮廓挤出成板（琴身、琴头）：轮廓在 xy 平面（smooth 时用闭合样条磨圆），厚度沿 z 居中 */
function contour(pts: V2[], depth: number, color: string, smooth = true, bevel = 0.5) {
  let v: THREE.Vector2[]
  if (smooth) {
    const curve = new THREE.CatmullRomCurve3(
      pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
      true,
      'centripetal',
    )
    v = curve.getPoints(pts.length * 5).map((q) => new THREE.Vector2(q.x, q.y))
    v.pop()
  } else v = pts.map(([x, y]) => new THREE.Vector2(x, y))
  const b = Math.min(bevel, depth * 0.3)
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(v), { depth: Math.max(0.01, depth - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 6 })
  geo.translate(0, 0, -depth / 2 + b)
  return mesh(geo, color)
}

/** 过控制点的样条取 n 段（车削轮廓磨圆用），半径不小于 0.01 */
function spline2(pts: V2[], n = pts.length * 4): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  )
  return curve.getPoints(n).map((v): V2 => [Math.max(0.01, v.x), v.y])
}

/** 带壁厚的车削壳（喇叭口、铜碗）：outer 是外壁轮廓 [半径, 高度]（从下往上），内壁按壁厚 t 往里收，上下两头都封口 */
function hollowLathe(outer: V2[], t: number, color: string, seg = 32) {
  const inner = outer.map(([r, y]): V2 => [Math.max(0.05, r - t), y]).reverse()
  return lathe([...outer, ...inner, outer[0]], color, seg)
}

/** 指板：乌木底 + 由疏到密的品丝 + 几颗圆点（画布顶边是琴头一端） */
function fretsArt(wood: string, n: number): Draw {
  return (g, W, H) => {
    g.fillStyle = wood
    g.fillRect(0, 0, W, H)
    const k = 0.945
    let step = (H * 0.97 * (1 - k)) / (1 - Math.pow(k, n))
    let y = 0
    const pos: number[] = []
    g.fillStyle = '#cfcfcf'
    for (let i = 0; i < n; i++) {
      y += step
      step *= k
      g.fillRect(0, y, W, Math.max(1, H * 0.006))
      pos.push(y)
    }
    g.fillStyle = IVORY
    for (const i of [3, 5, 7, 9, 12, 15]) {
      if (i >= pos.length) continue
      const cy = (pos[i] + pos[i - 1]) / 2
      for (const dx of i === 12 ? [-0.22, 0.22] : [0]) {
        g.beginPath()
        g.arc(W * (0.5 + dx), cy, W * 0.11, 0, PI * 2)
        g.fill()
      }
    }
  }
}

/** 琴键：nWhite 个白键（从 C 起），黑键占前后长度的六成（画布顶边是键盘里侧） */
function keysArt(nWhite: number, white: string, black: string): Draw {
  return (g, W, H) => {
    g.fillStyle = white
    g.fillRect(0, 0, W, H)
    const kw = W / nWhite
    g.fillStyle = shade(white, -0.35)
    for (let i = 1; i < nWhite; i++) g.fillRect(i * kw - 0.5, 0, Math.max(1, kw * 0.07), H)
    g.fillStyle = black
    for (let i = 0; i < nWhite - 1; i++) {
      const n = i % 7
      if (n !== 2 && n !== 6) g.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, H * 0.6)
    }
  }
}

/** 乐谱：标题条 + 几行五线谱和音符 */
function scoreArt(paper: string, ink: string, seed = 1): Draw {
  return (g, W, H) => {
    const r = rng(seed)
    g.fillStyle = paper
    g.fillRect(0, 0, W, H)
    g.fillStyle = ink
    g.fillRect(W * 0.3, H * 0.05, W * 0.4, H * 0.03)
    for (let k = 0; k < 6; k++) {
      const y0 = H * (0.16 + k * 0.14)
      const gap = H * 0.014
      for (let l = 0; l < 5; l++) g.fillRect(W * 0.08, y0 + l * gap, W * 0.84, Math.max(1, H * 0.003))
      for (let n = 0; n < 8; n++) {
        const x = W * (0.16 + n * 0.095)
        const y = y0 + gap * Math.floor(r() * 7) * 0.5
        g.beginPath()
        g.ellipse(x, y, gap * 0.8, gap * 0.6, -0.4, 0, PI * 2)
        g.fill()
        g.fillRect(x + gap * 0.65, y - gap * 3.2, Math.max(1, W * 0.005), gap * 3.2)
      }
    }
  }
}

/**
 * A 字琴架：琴（沿 y 立着、底在 y = 0、正面朝 +z）后仰 t 搁在前托上。参数都用琴的局部坐标：
 * back 是两根立腿所在的平面（在琴背后面），under 是托住琴底的橡胶横杆、front 是前挡；颈托在琴身 L 高处，
 * 两只叉齿夹住琴颈（半宽 nh、背面 z = nb），后面一根撑腿往后踢出 kick。返回整副架子 + 琴，底面贴地。
 */
function cradleStand(inst: THREE.Object3D, stand: string, o: { t: number; back: number; under: number; front: number; half: number; lip: number; lipH: number; L: number; nb: number; nh: number; r: number; kick: number }) {
  const g = new THREE.Group()
  const { t, r } = o
  const pr = r * 0.75
  const yu = -r + 0.1
  // 立腿的脚点（局部 (±half, yu, back)）正好落在地面球脚的球心高度
  const rf = r * 1.3
  const yb = rf - yu * Math.cos(t) - o.back * Math.sin(t)
  const W = (x: number, y: number, z: number): V3 => [x, yb + y * Math.cos(t) + z * Math.sin(t), -y * Math.sin(t) + z * Math.cos(t)]
  const foot = (p: V3) => ball(rf, RUBBER, { x: p[0], y: p[1], z: p[2] })
  g.add(P(G(inst), 0, yb, 0, -t))
  const px = o.nh + pr - 0.1
  for (const s of [-1, 1]) {
    const f0 = W(s * o.half, yu, o.back)
    // 立腿：脚点直上到颈托
    g.add(rod3(f0, W(s * px, o.L, o.back), r, stand), foot(f0))
    // 托臂：从脚点往前伸到前挡，再一根前脚落地
    const fr = W(s * o.half, yu, o.front)
    const ff: V3 = [fr[0] + s * 1.5, rf, fr[2] + 3]
    g.add(rod3(f0, fr, r, stand), rod3(fr, ff, r * 0.9, stand), foot(ff))
    // 前挡（橡胶套）、颈托的叉齿
    g.add(rod3(W(s * o.lip, yu, o.front), W(s * o.lip, o.lipH, o.front), pr, RUBBER))
    g.add(rod3(W(s * px, o.L, o.back), W(s * px, o.L, o.nb + 2), pr, RUBBER))
  }
  // 托住琴底的横杆（顶面比琴底高 0.1，接得上）、前挡横杆、颈托横档、垫在琴颈背后的软垫
  g.add(rod3(W(-o.half, yu, o.under), W(o.half, yu, o.under), r, RUBBER))
  g.add(rod3(W(-o.half, yu, o.front), W(o.half, yu, o.front), r, stand))
  g.add(rod3(W(-px, o.L, o.back), W(px, o.L, o.back), r, stand))
  g.add(rod3(W(-px, o.L, o.nb - pr + 0.05), W(px, o.L, o.nb - pr + 0.05), pr, RUBBER))
  // 后撑腿
  const top = W(0, o.L, o.back)
  const bf: V3 = [0, rf, top[2] - o.kick]
  g.add(rod3(top, bf, r, stand), foot(bf))
  return fitGroup(g)
}

// ---------- 班卓琴（立在琴架上）：圆鼓形琴身（木共鸣筒 + 金属法兰 + 白鼓皮 + 一圈压圈和挂钩）、长琴颈、五根弦（第五弦的弦轴在琴颈侧面） ----------

function banjoBody(wood: string, head: string) {
  const g = new THREE.Group()
  const pc = 14.6
  const dk = shade(wood, -0.08)
  // 共鸣筒（背面，前大后小）、法兰、木圈、鼓皮、压圈
  g.add(P(cyl(13.6, 12, 4.8, wood, {}, 32), 0, pc, -3.6, PI / 2))
  g.add(P(torus(8.5, 0.3, shade(wood, -0.18)), 0, pc, -6.02))
  g.add(P(cyl(14.6, 14.6, 1.4, STEEL, {}, 32), 0, pc, -0.5, PI / 2))
  g.add(P(cyl(13.4, 13.4, 1.6, shade(wood, 0.1), {}, 32), 0, pc, 0.4, PI / 2))
  g.add(P(cyl(13, 13, 0.4, head, {}, 32), 0, pc, 1.3, PI / 2))
  g.add(P(torus(13.2, 0.45, STEEL), 0, pc, 1.45))
  // 一圈挂钩：从压圈斜拉到法兰
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2 + PI / 16
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(rod3([c * 13.5, pc + s * 13.5, 1.5], [c * 14.3, pc + s * 14.3, -0.4], 0.22, STEEL, 4))
  }
  // 琴颈 + 指板 + 琴枕 + 琴头
  g.add(rbox(4.4, 56, 2.6, dk, { y: 26, z: 0.3 }, 0.7))
  g.add(paintPanel(4, 52, `mu-bj-fret-${EBONY}`, fretsArt(EBONY, 17), { y: 29, z: 1.7 }))
  g.add(rbox(4.4, 0.6, 0.6, IVORY, { y: 81.4, z: 1.6 }, 0.2))
  g.add(
    P(
      contour(
        [
          [-2.2, 0],
          [2.2, 0],
          [3.8, 4],
          [3.4, 10],
          [1.4, 12.4],
          [-1.4, 12.4],
          [-3.4, 10],
          [-3.8, 4],
        ],
        1.8,
        dk,
        false,
        0.4,
      ),
      0,
      81.6,
      0.2,
    ),
  )
  g.add(noOutline(rbox(1.4, 2.4, 0.3, IVORY, { y: 87, z: 1.15 }, 0.1)))
  // 四只朝后的行星弦轴 + 琴颈侧面的第五弦轴
  for (const [x, y] of [
    [-2.6, 85.5],
    [2.6, 85.5],
    [-2.3, 90.5],
    [2.3, 90.5],
  ] as V2[]) {
    g.add(cylZ(0.5, 2.4, STEEL, x, y, -1.5, 10))
    g.add(ball(0.9, IVORY, { x, y, z: -3 }, [1, 1, 0.6]))
  }
  g.add(cylX(0.4, 2.2, STEEL, 3.1, 58, 0.6, 8))
  g.add(ball(0.8, IVORY, { x: 4.6, y: 58, z: 0.6 }, [0.6, 1, 1]))
  // 琴码、拉弦板、五根弦
  g.add(rbox(5.2, 1, 0.7, shade(wood, 0.25), { y: 8.6, z: 1.75 }, 0.2))
  g.add(rbox(3.4, 5.2, 0.6, STEEL, { y: 1, z: 1.85 }, 0.25))
  for (let i = 0; i < 4; i++) {
    const k = i - 1.5
    g.add(thread([k * 0.6, 5.8, 2.1], [k * 0.9, 82, 1.85]))
  }
  g.add(thread([1.5, 5.8, 2.1], [2, 58, 1.65]))
  return g
}

function banjo(p: string[]) {
  const [wood, head, stand] = p
  return cradleStand(banjoBody(wood, head), stand, { t: 0.2, back: -8, under: -0.5, front: 3.2, half: 9, lip: 5, lipH: 3, L: 60, nb: -1, nh: 2.2, r: 0.9, kick: 3 })
}

// ---------- 曼陀林（小琴架上）：梨形琴身（深色背侧板 + 浅色面板）、圆音孔和护板、八根弦两两成组、琴头两侧各四只弦钮 ----------

function mandolinBody(wood: string, top: string) {
  const g = new THREE.Group()
  const ol = mirrorHalf([
    [0, 0],
    [6.5, 0.6],
    [10.8, 3.4],
    [12.4, 8.5],
    [12, 14],
    [10.2, 19.5],
    [7.4, 24.5],
    [4.6, 28.6],
    [2.6, 31.6],
    [0, 32.6],
  ])
  g.add(P(contour(ol, 4.6, wood, true, 0.8), 0, 0, -0.3))
  g.add(P(contour(ol.map(([x, y]): V2 => [x * 0.95, y * 0.95 + 0.8]), 0.6, top, true, 0.2), 0, 0, 2.1))
  // 音孔 + 音孔花、护板
  g.add(noOutline(cylZ(2.3, 0.2, HOLE, 0, 20.5, 2.45, 24)))
  g.add(P(torus(2.75, 0.22, IVORY), 0, 20.5, 2.45))
  g.add(
    noOutline(
      P(
        contour(
          [
            [0, 0],
            [1.6, 0.3],
            [2.6, 3.5],
            [2.2, 8.5],
            [0.8, 10],
            [-0.2, 6],
          ],
          0.2,
          '#a0622e',
          true,
          0.05,
        ),
        6.4,
        9,
        2.5,
      ),
    ),
  )
  // 琴码、拉弦板
  const dk = shade(wood, -0.2)
  g.add(rbox(5, 0.9, 1, dk, { y: 9.5, z: 2.7 }, 0.3))
  g.add(rbox(4.6, 4, 0.6, STEEL, { y: 0.4, z: 2.5 }, 0.25))
  // 琴颈、指板、琴枕、琴头和八只弦钮
  const nk = shade(wood, -0.05)
  g.add(rbox(3, 25.5, 2, nk, { y: 30.5, z: 0.9 }, 0.6))
  g.add(paintPanel(2.8, 22.6, `mu-md-fret-${EBONY}`, fretsArt(EBONY, 15), { y: 33, z: 2 }))
  g.add(rbox(3, 0.5, 0.5, IVORY, { y: 55.6, z: 1.9 }, 0.15))
  g.add(
    P(
      contour(
        [
          [-1.5, 0],
          [1.5, 0],
          [3.2, 2.6],
          [3.4, 7.2],
          [2.2, 9.2],
          [0, 8.2],
          [-2.2, 9.2],
          [-3.4, 7.2],
          [-3.2, 2.6],
        ],
        1.5,
        nk,
        true,
        0.4,
      ),
      0,
      55.8,
      0.7,
    ),
  )
  for (let i = 0; i < 4; i++) {
    const y = 58 + i * 1.7
    for (const s of [-1, 1]) {
      g.add(cylX(0.3, 2.2, STEEL, s * 4, y, 0.2, 8))
      g.add(rbox(0.9, 1.3, 0.5, IVORY, { x: s * 5.4, y: y - 0.65, z: 0.2 }, 0.2))
    }
  }
  // 八根弦：四组，每组两根挨着；拉弦板 → 琴码顶 → 琴枕
  for (let i = 0; i < 4; i++)
    for (const d of [-0.12, 0.12]) {
      const k = i - 1.5
      const bx = k * 0.95 + d * 1.4
      g.add(thread([k * 0.8 + d, 4.2, 2.82], [bx, 10.4, 3.25], 0.05))
      g.add(thread([bx, 10.4, 3.25], [k * 0.62 + d, 56, 2.1], 0.05))
    }
  return g
}

function mandolin(p: string[]) {
  const [wood, top, stand] = p
  return cradleStand(mandolinBody(wood, top), stand, { t: 0.16, back: -4.2, under: -0.3, front: 3.6, half: 6, lip: 3.6, lipH: 2.4, L: 44, nb: -0.1, nh: 1.5, r: 0.6, kick: 4 })
}

// ---------- 马头琴（立在木座上）：上窄下宽的梯形琴箱蒙浅色面板、长琴杆顶上雕一只马头，两只大弦轴、两根马尾弦，杆上系一条哈达，弓斜靠在琴杆上 ----------

function morinKhuur(p: string[]) {
  const [wood, face, scarf, stand] = p
  const g = new THREE.Group()
  const dk = shade(wood, -0.1)
  // 底座：一块底板 + 托住琴箱的木台
  g.add(rbox(28, 2.4, 22, stand, { z: -1 }, 0.8))
  g.add(rbox(26, 2, 12, shade(stand, -0.08), { y: 2.4, z: -1 }, 0.6))
  const y0 = 4.4
  // 琴箱 + 面板 + 面板上的圆形纹饰
  g.add(
    P(
      contour(
        [
          [-12, 0],
          [12, 0],
          [9.6, 31],
          [-9.6, 31],
        ],
        9,
        wood,
        false,
        0.8,
      ),
      0,
      y0,
      -1,
    ),
  )
  g.add(
    P(
      contour(
        [
          [-10.9, 1.2],
          [10.9, 1.2],
          [8.7, 29.8],
          [-8.7, 29.8],
        ],
        0.5,
        face,
        false,
        0.15,
      ),
      0,
      y0,
      3.6,
    ),
  )
  g.add(P(torus(3.2, 0.3, scarf), 0, y0 + 22, 3.95))
  g.add(P(rbox(2.4, 2.4, 0.3, scarf, {}, 0.1), 0, y0 + 22, 3.95, 0, 0, PI / 4))
  // 琴杆 + 马头（侧面轮廓挤出：马头朝前）+ 两只眼睛
  g.add(rbox(3.2, 68, 2.4, dk, { y: y0 + 28, z: 0.4 }, 0.6))
  g.add(
    sideSlab(
      [
        [-1.6, 99],
        [-1.6, 107.6],
        [-1.1, 111.2],
        [-1.5, 114.6],
        [-0.1, 112.4],
        [1, 112.1],
        [3.4, 110.6],
        [6.6, 107.9],
        [7.3, 106.3],
        [6.8, 104.9],
        [4.4, 104.6],
        [2.6, 103],
        [2.4, 99],
      ],
      3.2,
      wood,
    ),
  )
  for (const s of [-1, 1]) g.add(noOutline(ball(0.45, DARK, { x: s * 1.6, y: 109.4, z: 3.2 }, [0.5, 1, 1])))
  // 系在马头下面的哈达：一圈 + 两条垂下来的飘带
  g.add(rbox(3.8, 1.6, 3, scarf, { y: 95.5, z: 0.4 }, 0.4))
  for (const s of [-1, 1]) g.add(P(rbox(1.2, 12, 0.3, scarf, {}, 0.1), s * 1.3, 90, 1.9, 0, 0, s * 0.1))
  // 两只大弦轴：一左一右横穿琴杆
  for (const [y, s] of [
    [89, -1],
    [93.5, 1],
  ] as V2[]) {
    g.add(taperRod3([-s * 1.8, y, 0.4], [s * 6.5, y, -0.6], 0.5, 0.75, dk, 8))
    g.add(P(rbox(1.2, 3.6, 2.4, dk, {}, 0.5), s * 7.1, y, -0.7))
  }
  // 琴码、拉弦板、两根弦
  g.add(rbox(5.6, 1.6, 1, CANE, { y: y0 + 11, z: 4.3 }, 0.3))
  g.add(rbox(3.4, 2.2, 1, dk, { y: y0 + 0.4, z: 4.1 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(thread([s * 0.6, y0 + 2.4, 4.55], [s * 0.7, y0 + 12.6, 4.85], 0.12, '#efe8d8'))
    g.add(thread([s * 0.7, y0 + 12.6, 4.85], [s * 0.4, 91.5, 1.6], 0.12, '#efe8d8'))
  }
  // 弓：弓根立在底座前角，弓杆斜靠在琴杆侧面，马尾在外侧松松地垂着
  const b0: V3 = [12.5, 2.4, 7.5]
  const b1: V3 = [1.85, 80, 1]
  const at = (k: number): V3 => [b0[0] + (b1[0] - b0[0]) * k, b0[1] + (b1[1] - b0[1]) * k, b0[2] + (b1[2] - b0[2]) * k]
  g.add(rod3(b0, b1, 0.35, '#6e4a2a', 8))
  const fr = at(0.07)
  g.add(P(rbox(1.6, 3, 1.6, DARK, {}, 0.4), fr[0] + 0.6, fr[1], fr[2] + 0.4))
  const tip = at(0.97)
  const mid = at(0.5)
  g.add(noOutline(tube([[fr[0] + 1.1, fr[1] + 1.2, fr[2] + 0.9], [mid[0] + 1.1, mid[1], mid[2] + 1.2], tip], 0.18, '#f2ece0', { seg: 12, radial: 5 })))
  // 底座后面的立柱 + 横臂 + 叉住琴杆的两只叉齿
  g.add(rbox(2.4, 66, 2.4, stand, { y: 2.4, z: -8.2 }, 0.6))
  g.add(rbox(2.4, 2.2, 8, stand, { y: 66.2, z: -4.6 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(1.2, 2.2, 3.4, stand, { x: s * 2.15, y: 66.2, z: 0.2 }, 0.4))
  return fitGroup(g)
}

// ---------- 唢呐与笙（木托上）：笙是铜斗上插一圈长短不一的竹管、两道箍、前面伸出吹嘴；唢呐铜碗朝下立着，木管往上收细，顶上芯子、气牌和哨片 ----------

function suonaSheng(p: string[]) {
  const [wood, bamboo, brass] = p
  const g = new THREE.Group()
  g.add(rbox(40, 1.8, 20, wood, {}, 0.7))
  const yb = 1.8
  // 笙：铜斗 + 斗盖
  const sx = -9
  g.add(puck(6.2, 5.4, brass, { x: sx, y: yb }))
  g.add(cyl(5.6, 5.8, 0.8, shade(brass, -0.12), { x: sx, y: yb + 5 }, 24))
  // 竹管：前面留出吹嘴的缺口，两翼最高、正后方略低（凤翼形）
  const lens = [17, 21, 25, 30, 34, 37, 34, 31, 29, 31, 34, 37, 34, 30, 25, 21, 17]
  lens.forEach((L, i) => {
    const a = PI / 2 + 0.42 + (i / (lens.length - 1)) * (PI * 2 - 0.84)
    g.add(cyl(0.55, 0.55, L, bamboo, { x: sx + Math.cos(a) * 4.6, y: yb + 5.4, z: Math.sin(a) * 4.6 }, 8))
  })
  for (const y of [14, 24]) g.add(torus(5.2, 0.28, brass, { x: sx, y, rx: PI / 2 }))
  // 吹嘴
  g.add(taperRod3([sx, yb + 3.2, 5.6], [sx, yb + 4.6, 9.2], 0.9, 0.7, brass, 12))
  g.add(cylZ(0.75, 0.6, shade(brass, -0.2), sx, yb + 4.6, 9.3, 12))
  // 唢呐：铜碗（空心喇叭口朝下）+ 锥形木管 + 两道铜箍
  const ux = 9.5
  const body = shade(wood, -0.25)
  g.add(
    P(
      hollowLathe(
        [
          [6, 0],
          [5.3, 0.6],
          [4.2, 1.6],
          [3.1, 3.2],
          [2.3, 5.3],
          [1.8, 7.4],
          [1.6, 9],
        ],
        0.3,
        brass,
        32,
      ),
      ux,
      yb,
      0,
    ),
  )
  const y1 = yb + 8.6
  const y2 = yb + 32
  const rAt = (y: number) => 1.55 + ((0.8 - 1.55) * (y - y1)) / (y2 - y1)
  g.add(taperRod3([ux, y1, 0], [ux, y2, 0], 1.55, 0.8, body, 12))
  g.add(torus(rAt(y1 + 0.6), 0.22, brass, { x: ux, y: y1 + 0.6, rx: PI / 2 }))
  g.add(torus(rAt(y2 - 0.6), 0.2, brass, { x: ux, y: y2 - 0.6, rx: PI / 2 }))
  // 正面八个音孔、背后一个
  for (let i = 0; i < 8; i++) {
    const y = y1 + 4 + i * 2.3
    g.add(noOutline(ball(0.32, HOLE, { x: ux, y, z: rAt(y) - 0.06 }, [1, 1, 0.4])))
  }
  g.add(noOutline(ball(0.32, HOLE, { x: ux, y: y1 + 20.5, z: -(rAt(y1 + 20.5) - 0.06) }, [1, 1, 0.4])))
  // 芯子、气牌、哨片
  g.add(cyl(0.28, 0.35, 3, brass, { x: ux, y: y2 - 0.3 }, 8))
  g.add(cyl(1.5, 1.5, 0.25, brass, { x: ux, y: y2 + 1.6 }, 20))
  g.add(P(rbox(0.9, 1.8, 0.35, CANE, {}, 0.15), ux, y2 + 3.5, 0))
  return g
}

// ---------- 编钟摆件：黑漆木架（底座、两根立柱、上梁两头上翘、中梁），上排六只小钟、下排五只大钟，大钟正面有一排排钟枚，底座前沿放一只小槌 ----------

/** 一只编钟：扁圆的钟体口朝下（at y = 0 为钟口），顶上一截甬柱 + 挂钮；studs 时正反两面各四颗钟枚。返回钟和挂环顶的高度 */
function zhong(h: number, color: string, studs: boolean) {
  const g = new THREE.Group()
  const rm = h * 0.4
  const rc = h * 0.27
  // 钟体：外壁从钟口往上收到钟顶，再从顶下 0.3 的内壁绕回钟口（空心、16 段就够圆）
  const t = 0.3
  const body = lathe(
    [
      [rm, 0],
      [rm * 0.97, h * 0.3],
      [rm * 0.86 + (rc - rm * 0.86) * 0.2, h * 0.7],
      [rc, h],
      [0.01, h],
      [0.01, h - t],
      [rc - t, h - t],
      [rm * 0.86 + (rc - rm * 0.86) * 0.2 - t, h * 0.7],
      [rm * 0.97 - t, h * 0.3],
      [rm - t, 0],
      [rm, 0],
    ],
    color,
    16,
  )
  body.scale.set(1, 1, 0.72)
  g.add(body)
  const sh = h * 0.3
  g.add(cyl(rc * 0.35, rc * 0.5, sh, shade(color, -0.1), { y: h - 0.1 }, 10))
  // 甬柱顶上的挂钮（一小块扁环座，挂钩从它顶上穿过）
  const ry = h + sh + 0.3
  g.add(rbox(1.1, 1.1, 0.4, shade(color, -0.1), { y: h + sh - 0.2 }, 0.15))
  if (studs)
    for (const f of [0.62, 0.8])
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const y = h * f
          const r = rm + (rc - rm) * f
          const x = sx * r * 0.42
          g.add(ball(0.26, color, { x, y, z: sz * (0.72 * Math.sqrt(r * r - x * x) - 0.05) }, undefined, [5, 3]))
        }
  return { g, top: ry + 0.6 }
}

function bianzhong(p: string[]) {
  const [frame, bronze, acc] = p
  const g = new THREE.Group()
  // 底座、立柱（脚下一块垫木）、上梁（两头上翘 + 一条描金带）、中梁
  g.add(rbox(50, 2.4, 18, frame, {}, 0.8))
  for (const s of [-1, 1]) {
    g.add(rbox(3, 34.6, 3, frame, { x: s * 21, y: 2.4 }, 0.6))
    g.add(rbox(5, 2.2, 6, acc, { x: s * 21, y: 2.4 }, 0.6))
    g.add(P(rbox(5, 2.6, 3.6, frame, {}, 0.8), s * 22.4, 39.2, 0, 0, 0, s * 0.45))
  }
  g.add(rbox(44, 3, 3.6, frame, { y: 36 }, 0.8))
  g.add(noOutline(rbox(38, 0.8, 0.3, acc, { y: 37.1, z: 1.9 }, 0.1)))
  g.add(rbox(39.4, 2.6, 3, frame, { y: 20 }, 0.6))
  g.add(noOutline(rbox(34, 0.7, 0.3, acc, { y: 21, z: 1.6 }, 0.1)))
  // 挂钟：每排按大小依次排开，挂环用一根短钩挂在梁底下
  const row = (hs: number[], beamY: number, gap: number, studs: boolean) => {
    const ws = hs.map((h) => h * 0.8)
    const total = ws.reduce((a, b) => a + b, 0) + gap * (hs.length - 1)
    let x = -total / 2
    hs.forEach((h, i) => {
      const cx = x + ws[i] / 2
      x += ws[i] + gap
      const { g: b, top } = zhong(h, bronze, studs)
      const y = beamY - 1.2 - top
      g.add(P(b, cx, y, 0))
      g.add(rod3([cx, beamY + 0.3, 0], [cx, beamY - 1.35, 0], 0.15, DARK, 6))
    })
  }
  row([6.2, 5.8, 5.4, 5, 4.6, 4.2], 36, 1.8, false)
  row([9.6, 9, 8.4, 7.8, 7.2], 20, 0.9, true)
  // 小槌：长柄 + 横着的槌头，搁在底座前沿
  const mallet = G(rod3([-6.5, 0.9, 0], [6, 0.9, 0], 0.35, shade(frame, 0.15), 8), cylZ(0.9, 3.2, acc, 7, 0.9, 0, 14))
  g.add(P(mallet, -4, 2.4, 6.5, 0, 0.25, 0))
  return g
}

// ---------- 木鱼与磬（软垫上）：圆鼓鼓的木鱼坐在圈垫上，正面一道长长的鱼口、背上一个小提环；旁边小圆垫上一只铜磬，前面搁着两根槌 ----------

function muyuSet(p: string[]) {
  const [wood, cloth, bronze] = p
  const g = new THREE.Group()
  // 长方软垫 + 四角流苏
  g.add(rbox(30, 3, 20, cloth, {}, 1.2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(0.7, shade(cloth, -0.2), { x: sx * 14.6, y: 1.5, z: sz * 9.6 }))
  // 木鱼：圈垫 + 略扁的圆身
  const mx = -5.5
  const cy = 9.3
  g.add(torus(3.8, 1, shade(cloth, 0.15), { x: mx, y: 3.95, rx: PI / 2 }))
  g.add(ball(6.4, wood, { x: mx, y: cy, z: 0 }, [1.06, 0.86, 1]))
  // 鱼口：贴着鱼身正面绕一道深色弧槽（弧的中点转到 +z）
  const mouth = G(torus(6.25, 0.4, HOLE, { rx: PI / 2 }, 2.3))
  mouth.rotation.y = 1.15 - PI / 2
  const mo = noOutline(P(G(mouth), mx, cy - 1.2, 0))
  mo.scale.set(1.06, 1, 1)
  mouth.traverse((o) => (o.userData.noOutline = true))
  g.add(mo)
  // 背上的提环
  g.add(torus(1.3, 0.45, shade(wood, -0.08), { x: mx, y: cy + 4.9, z: -2.6, ry: PI / 2 }))
  // 木鱼槌：柄斜搁在垫子上，槌头包布
  const ml = G(rod3([-6, 0.4, 0], [6.5, 1.3, 0], 0.4, shade(wood, 0.12), 8), ball(1.3, shade(cloth, -0.18), { x: 7.3, y: 1.3 }))
  g.add(P(ml, mx - 1, 3, 7.2, 0, -0.2, 0))
  // 磬：小圆垫 + 铜钵 + 一道暗色弦纹，前面一根磬槌
  const qx = 8.5
  g.add(puck(5.2, 2.4, shade(cloth, 0.1), { x: qx, y: 3, z: -1.5 }))
  g.add(cup(5, 3.6, 4.6, 0.35, bronze, { x: qx, y: 5.2, z: -1.5 }))
  g.add(torus(4.64, 0.15, shade(bronze, -0.2), { x: qx, y: 8.6, z: -1.5, rx: PI / 2 }))
  g.add(rod3([qx - 4, 3.35, 7.6], [qx + 5.5, 3.35, 5], 0.35, shade(wood, 0.12), 8))
  g.add(ball(0.75, shade(cloth, -0.18), { x: qx + 5.6, y: 3.75, z: 5 }))
  return g
}

// ---------- 康加鼓一对 + 邦戈鼓：两只两头收、中间鼓的高木桶，顶上鼓皮和金属压圈、一圈调音钩拉到鼓身的钩座；旁边三脚架上架着一对邦戈 ----------

/** 康加鼓：鼓身车削（底在 y = 0），两道色带、底下橡胶脚圈，顶上鼓皮 + 压圈，n 只调音钩 */
function congaDrum(h: number, rt: number, rb: number, bulge: number, shellC: string, head: string, metal: string, n = 5) {
  const g = new THREE.Group()
  const rAt = (y: number) => rb + ((rt - rb) * y) / h + bulge * Math.sin((PI * y) / h)
  const pts: V2[] = [
    [0.01, 0.8],
    [rb - 0.8, 0.8],
  ]
  for (let i = 0; i <= 16; i++) pts.push([rAt((h * i) / 16), (h * i) / 16])
  pts.push([rt - 1, h])
  g.add(lathe(pts, shellC, 32))
  for (const f of [0.22, 0.78]) g.add(torus(rAt(h * f), 0.4, shade(shellC, -0.22), { y: h * f, rx: PI / 2 }))
  g.add(torus(rb - 0.4, 0.6, RUBBER, { y: 0.6, rx: PI / 2 }))
  g.add(cyl(rt - 0.1, rt - 0.1, 0.5, head, { y: h - 0.25 }, 32))
  g.add(torus(rt + 0.2, 0.7, metal, { y: h + 0.1, rx: PI / 2 }))
  const yl = h - 13
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + 0.3
    const c = Math.cos(a)
    const s = Math.sin(a)
    const r0 = rt + 0.6
    const r1 = rAt(yl) + 0.9
    g.add(rod3([c * r0, h + 0.4, s * r0], [c * r1, yl + 1.6, s * r1], 0.3, metal, 6))
    g.add(rod3([c * r0, h + 0.4, s * r0], [c * (rt + 0.1), h + 0.9, s * (rt + 0.1)], 0.3, metal, 6))
    g.add(P(rbox(1.8, 2.6, 1.6, metal, {}, 0.4), c * (rAt(yl) + 0.5), yl + 0.6, s * (rAt(yl) + 0.5), 0, PI / 2 - a, 0))
  }
  return g
}

/** 邦戈鼓的一只：微收的鼓身、鼓皮、压圈、四只短调音钩（底在 y = 0） */
function bongoDrum(r: number, h: number, shellC: string, head: string, metal: string) {
  const g = new THREE.Group()
  const rb = r * 0.84
  const rAt = (y: number) => rb + ((r - rb) * y) / h
  g.add(cyl(r, rb, h, shellC, {}, 28))
  g.add(torus(rAt(h * 0.4), 0.3, shade(shellC, -0.22), { y: h * 0.4, rx: PI / 2 }))
  g.add(cyl(r - 0.1, r - 0.1, 0.4, head, { y: h - 0.2 }, 28))
  g.add(torus(r + 0.2, 0.5, metal, { y: h + 0.05, rx: PI / 2 }))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    const c = Math.cos(a)
    const s = Math.sin(a)
    const yl = h - 6
    g.add(rod3([c * (r + 0.4), h + 0.2, s * (r + 0.4)], [c * (rAt(yl) + 0.7), yl + 1.2, s * (rAt(yl) + 0.7)], 0.25, metal, 6))
    g.add(P(rbox(1.4, 2, 1.2, metal, {}, 0.3), c * (rAt(yl) + 0.4), yl + 0.6, s * (rAt(yl) + 0.4), 0, PI / 2 - a, 0))
  }
  return g
}

function congas(p: string[]) {
  const [shellC, head, metal] = p
  const g = new THREE.Group()
  g.add(P(congaDrum(74, 13, 11, 2, shellC, head, metal), -24.5, 0, 4))
  g.add(P(congaDrum(74, 12, 10.2, 1.9, shade(shellC, 0.08), head, metal), 4, 0, -7))
  // 邦戈鼓架：三脚 + 立杆，顶上一块木块连着一大一小两只鼓
  const bx = 28
  const bz = 5
  const y0 = 55
  for (const a of [0, 2.1, 4.2]) {
    const f: V3 = [bx + Math.cos(a) * 11, 1.1, bz + Math.sin(a) * 11]
    g.add(rod3([bx, 20, bz], f, 0.8, metal, 8), ball(1.1, RUBBER, { x: f[0], y: f[1], z: f[2] }))
  }
  g.add(cyl(1.6, 1.6, 4, metal, { x: bx, y: 18, z: bz }, 12))
  g.add(cyl(1.1, 1.1, y0 + 4.3 - 20, metal, { x: bx, y: 20, z: bz }, 12))
  g.add(P(bongoDrum(9, 15, shellC, head, metal), bx, y0, bz - 10))
  g.add(P(bongoDrum(7.6, 15, shellC, head, metal), bx, y0, bz + 8.6))
  g.add(rbox(4, 7, 4.4, shade(shellC, -0.12), { x: bx, y: y0 + 4, z: bz }, 0.8))
  return fitGroup(g)
}

// ---------- 定音鼓：铜锅形鼓身（车削）、白鼓皮和压圈、八根调音杆顶上 T 形把手，三条带脚轮的底臂撑着中柱和三根斜撑，前面一块脚踏板 ----------

function timpani(p: string[]) {
  const [bowl, head, frame] = p
  const g = new THREE.Group()
  g.add(
    lathe(
      spline2([
        [0.01, 28],
        [7, 28.4],
        [15, 31],
        [22, 36.5],
        [27.5, 44],
        [31, 54],
        [32.8, 65],
        [33.4, 75],
        [33.2, 81],
      ]),
      bowl,
      32,
    ),
  )
  g.add(cyl(33.6, 33.6, 0.4, head, { y: 81 }, 32))
  g.add(torus(33.8, 0.9, STEEL, { y: 81.3, rx: PI / 2 }))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8
    const c = Math.cos(a)
    const s = Math.sin(a)
    const rr = 34.9
    g.add(rod3([c * rr, 70, s * rr], [c * rr, 84.8, s * rr], 0.4, STEEL, 6))
    g.add(P(rbox(4.2, 0.9, 0.9, frame, {}, 0.3), c * rr, 85, s * rr, 0, PI / 2 - a, 0))
    g.add(P(rbox(1.6, 3, 3, STEEL, {}, 0.4), c * 33.9, 70.5, s * 33.9, 0, PI / 2 - a, 0))
  }
  // 底座：中间的轴座 + 中柱，三条底臂（一条朝前，上面装踏板），臂端脚轮，斜撑顶住鼓身
  g.add(cyl(4, 4.5, 4, frame, { y: 4 }, 16))
  g.add(cyl(2.2, 2.2, 21, frame, { y: 7.5 }, 12))
  const R = 29
  for (const a of [PI / 2, PI / 2 + (2 * PI) / 3, PI / 2 + (4 * PI) / 3]) {
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(P(rbox(4, 3, R, frame, {}, 0.8), (c * R) / 2, 7, (s * R) / 2, 0, Math.atan2(c, s), 0))
    const cx = c * R
    const cz = s * R
    g.add(cyl(1.4, 1.4, 2.6, frame, { x: cx, y: 4.6, z: cz }, 10))
    g.add(rbox(3.6, 2.2, 3.6, frame, { x: cx, y: 3.4, z: cz }, 0.4))
    g.add(P(cyl(2.6, 2.6, 2, RUBBER, {}, 16), cx, 2.6, cz, 0, 0, PI / 2))
    g.add(rod3([c * (R - 2), 8, s * (R - 2)], [c * 31.6, 54, s * 31.6], 1.1, frame, 10))
  }
  const pedal = G(rbox(12, 1.4, 12, frame, { y: -0.7 }, 0.4), rbox(10, 0.4, 9.5, RUBBER, { y: 0.6 }, 0.15))
  g.add(P(pedal, 0, 10, 25, 0.36))
  return g
}

// ---------- 钟琴（琴盒摊开架在两条小木脚上）：盒里衬布上两排长短渐变的金属片（前排全音、后排半音，分组排列）搁在斜毡条上，两只小槌搭在琴片上 ----------

function glockenspiel(p: string[]) {
  const [caseC, lining, bar, malletC] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(5, 1.6, 24, shade(caseC, -0.15), { x: s * 23 }, 0.5))
  const y0 = 1.6
  g.add(tray(60, 5.4, 28, 0.9, caseC, { y: y0 }))
  g.add(rbox(58, 0.8, 26, lining, { y: y0 + 0.9 }, 0.3))
  // 琴盒前面的两只搭扣和提手
  for (const s of [-1, 1]) g.add(rbox(2.4, 1.6, 0.6, STEEL, { x: s * 18, y: y0 + 3.2, z: 14.25 }, 0.2))
  g.add(rbox(10, 1.2, 1.2, DARK, { y: y0 + 2.4, z: 14.5 }, 0.4))
  const ly = y0 + 1.7
  const rh = 0.9
  const by = ly + rh
  const nat = 15
  const xs = (i: number) => (i - 7) * 3.5
  const Ln = (i: number) => 13.4 - i * 0.32
  const zf = 5.6
  const zs = -7.2
  for (let i = 0; i < nat; i++) g.add(rbox(2.6, 0.8, Ln(i), bar, { x: xs(i), y: by, z: zf }, 0.25))
  // 后排半音：落在全音片之间（每八度 C# D# F# G# A# 五片）
  const sharps: V2[] = []
  for (let i = 0; i < nat - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) sharps.push([xs(i) + 1.75, (Ln(i) + Ln(i + 1)) / 2 - 3.2])
  for (const [x, L] of sharps) g.add(rbox(2.4, 0.8, L, shade(bar, -0.06), { x, y: by, z: zs }, 0.25))
  // 毡条：每排两条，跟着琴片长短斜着走
  const felt = shade(lining, -0.15)
  const ry = ly + rh / 2
  for (const f of [-0.27, 0.27]) {
    g.add(batten([xs(0) - 1.8, ry, zf + f * Ln(0)], [xs(nat - 1) + 1.8, ry, zf + f * Ln(nat - 1)], rh, 1.1, felt, 0.3))
    const [sa, la] = sharps[0]
    const [sb, lb] = sharps[sharps.length - 1]
    g.add(batten([sa - 1.8, ry, zs + f * la], [sb + 1.8, ry, zs + f * lb], rh, 1.1, felt, 0.3))
  }
  // 两只小槌搭在前排琴片上
  for (const [x0, z0, a] of [
    [-19, 9.8, 0.12],
    [3, 8.2, -0.1],
  ] as V3[]) {
    const m = G(cylX(0.3, 17, N.oak, 8.5, 0.3, 0, 8), ball(1, malletC, { x: 17.8, y: 1 }))
    g.add(P(m, x0, by + 0.8, z0, 0, a, 0))
  }
  return g
}

// ---------- 竖笛与笛架：一支竖笛立在小圆座的笛插上，另一支小号竖笛躺在乐谱上（吹口、音窗、正面七个音孔、接口处深色环） ----------

/** 一支竖笛：沿 y 立着，笛尾在 y = 0、吹口顶在 y ≈ 32.2，正面朝 +z。[笛身, 接口环] */
function recorderPiece(body: string, ring: string) {
  const g = new THREE.Group()
  g.add(cyl(1, 1.2, 4.4, body, {}, 16))
  g.add(cyl(1.12, 1.12, 0.8, ring, { y: 4 }, 16))
  g.add(cyl(1.05, 0.95, 17.6, body, { y: 4.4 }, 16))
  g.add(cyl(1.35, 1.25, 2.2, ring, { y: 21.6 }, 16))
  g.add(cyl(1.3, 1.3, 6, body, { y: 23.8 }, 16))
  const beak = cyl(0.75, 1.3, 2.4, body, { y: 29.8 }, 16)
  beak.scale.z = 0.7
  g.add(beak)
  g.add(noOutline(rbox(1.1, 0.9, 0.4, DARK, { y: 26.8, z: 1.2 }, 0.1)))
  const rAt = (y: number) => 0.95 + (0.1 * (y - 4.4)) / 17.6
  for (const y of [19.8, 18, 16.2, 13.6, 11.8, 10, 7.4]) g.add(noOutline(ball(0.28, HOLE, { y, z: rAt(y) - 0.05 }, [1, 1, 0.35])))
  g.add(noOutline(ball(0.28, HOLE, { y: 21, z: -(rAt(21) - 0.05) }, [1, 1, 0.35])))
  return g
}

function recorderSet(p: string[]) {
  const [body, ring, base] = p
  const g = new THREE.Group()
  // 笛架：圆座 + 托住笛尾的小台（笛插藏在笛管里）
  const sx = -10
  const sz = -4.5
  g.add(puck(4, 1.2, base, { x: sx, z: sz }))
  g.add(cyl(1.3, 1.6, 1, shade(base, -0.1), { x: sx, y: 1, z: sz }, 16))
  g.add(P(recorderPiece(body, ring), sx, 1.95, sz))
  // 乐谱本 + 躺在上面的小号竖笛（音孔朝上）
  const book = G(rbox(20, 0.5, 14, base, {}, 0.2), paintPanel(18.6, 12.6, `mu-rec-score-${PAPER}`, scoreArt(PAPER, '#3a3a3a', 4), { y: 0.56, z: 6.3, rx: -PI / 2 }))
  g.add(P(book, 5, 0, 3, 0, -0.12, 0))
  const small = recorderPiece(shade(body, 0.06), ring)
  small.scale.setScalar(0.78)
  const lying = P(G(small), 0, 0, 0, -PI / 2, 0, -PI / 2)
  // 笛尾在外层原点：转 -0.25 后中心落在乐谱中间
  g.add(P(G(lying), -7.2, 0.5 + 1.3 * 0.78, 0.4, 0, -0.25, 0))
  return fitGroup(g)
}

// ---------- 双簧管与巴松（落地支架）：巴松的靴形管坐在三脚架的托槽里，翼管、长管和喇叭管并排往上，顶上象牙色口环，翼管顶伸出弯曲的 S 形铜吹管和哨片；旁边小三脚架上立着一支黑色双簧管 ----------

function bassoonOboe(p: string[]) {
  const [bwood, oboeC, keys] = p
  const stand = '#3a3b40'
  const g = new THREE.Group()
  const bx = -9
  // 巴松支架：三脚、轴座、托槽、后立杆和叉托
  g.add(cyl(1.8, 2.2, 4.4, stand, { x: bx, y: 1.2 }, 12))
  for (const a of [PI / 2, PI / 2 + (2 * PI) / 3, PI / 2 + (4 * PI) / 3]) {
    const f: V3 = [bx + Math.cos(a) * 15, 1, Math.sin(a) * 15]
    g.add(rod3([bx, 2.6, 0], f, 0.75, stand, 8), ball(1, RUBBER, { x: f[0], y: f[1], z: f[2] }))
  }
  g.add(tray(12, 4, 8, 0.8, stand, { x: bx, y: 5.4 }))
  const by = 6.2
  // 靴形管 + 底下的金属护帽
  g.add(rbox(9.6, 1.4, 5.6, keys, { x: bx, y: by }, 0.6))
  g.add(rbox(9.4, 26.8, 5.4, bwood, { x: bx, y: by + 0.2 }, 2.3))
  const top = by + 27
  // 翼管（下半截加厚）、长管、喇叭管 + 口环
  const wx = bx - 2.3
  const lx = bx + 2.3
  g.add(rbox(4.6, 14, 4.8, bwood, { x: wx, y: top - 0.6, z: 0.4 }, 1.8))
  g.add(cyl(1.85, 2, 30, bwood, { x: wx, y: top + 12.8 }, 14))
  g.add(cyl(2.25, 2.35, 74, bwood, { x: lx, y: top - 0.4 }, 16))
  g.add(cyl(2.5, 2.35, 26, bwood, { x: lx, y: top + 73.4 }, 16))
  g.add(cyl(2.9, 2.75, 2.4, IVORY, { x: lx, y: top + 99.2 }, 18))
  g.add(noOutline(cyl(2.3, 2.3, 0.2, HOLE, { x: lx, y: top + 101.55 }, 16)))
  // 接口的金属箍
  g.add(cyl(2.55, 2.55, 0.8, keys, { x: lx, y: top }, 16))
  g.add(cyl(2.6, 2.6, 0.8, keys, { x: lx, y: top + 73 }, 16))
  const wTop = top + 42.8
  g.add(cyl(2.1, 2.1, 0.8, keys, { x: wx, y: wTop - 0.4 }, 14))
  // S 形吹管 + 哨片
  g.add(
    tube(
      [
        [wx, wTop - 0.2, 0],
        [wx, wTop + 3.3, 0.2],
        [wx - 0.3, wTop + 6.3, 2],
        [wx - 1.1, wTop + 7.8, 5.5],
        [wx - 2.1, wTop + 7, 9.5],
        [wx - 2.7, wTop + 5.4, 12.5],
      ],
      0.32,
      keys,
      { seg: 20, radial: 6 },
    ),
  )
  g.add(taperRod3([wx - 2.7, wTop + 5.4, 12.5], [wx - 3.2, wTop + 4.2, 15], 0.3, 0.55, CANE, 6))
  // 按键：长管正面一根长连杆、靴形管和翼管上几只键垫、翼管上三个音孔
  g.add(rod3([lx, top + 6, 2.45], [lx, top + 64, 2.45], 0.22, keys, 6))
  for (const [x, y] of [
    [bx - 2, by + 16],
    [bx + 2, by + 12],
    [bx + 1.5, by + 20],
    [lx, top + 30],
    [lx, top + 48],
  ] as V2[])
    g.add(P(cyl(0.8, 0.8, 0.4, keys, {}, 12), x, y, x === lx ? 2.45 : 2.8, PI / 2))
  for (const y of [top + 4, top + 7, top + 10]) g.add(noOutline(ball(0.35, HOLE, { x: wx, y, z: 2.75 }, [1, 1, 0.3])))
  // 后立杆（贴着托槽后壁）+ 顶上叉住长管的叉托
  const pz = -4.2
  g.add(rod3([lx, 5.4, pz], [lx, 96, pz], 0.8, stand, 8))
  g.add(rod3([lx - 2.7, 96, pz], [lx + 2.7, 96, pz], 0.6, stand, 8))
  g.add(rod3([lx, 96, pz], [lx, 96, -2.1], 0.7, RUBBER, 8))
  for (const s of [-1, 1]) g.add(rod3([lx + s * 2.7, 96, pz], [lx + s * 2.7, 96, 0.8], 0.55, RUBBER, 8))
  // 双簧管：小三脚架 + 托杯，喇叭口坐在杯里，上下两节黑管、银色按键、顶上软木芯和哨片
  const ox = 16
  const oz = 3
  g.add(cyl(1, 1.3, 3, stand, { x: ox, y: 1.4, z: oz }, 10))
  for (const a of [PI / 2, PI / 2 + (2 * PI) / 3, PI / 2 + (4 * PI) / 3]) {
    const f: V3 = [ox + Math.cos(a) * 8, 0.9, oz + Math.sin(a) * 8]
    g.add(rod3([ox, 2.4, oz], f, 0.5, stand, 8), ball(0.9, RUBBER, { x: f[0], y: f[1], z: f[2] }))
  }
  g.add(cup(3.2, 2, 1.6, 0.3, stand, { x: ox, y: 4.4, z: oz }))
  const bo = 5.6
  g.add(
    P(
      hollowLathe(
        [
          [3, 0],
          [2.4, 1.2],
          [1.75, 3],
          [1.4, 5],
          [1.3, 7],
        ],
        0.25,
        oboeC,
        24,
      ),
      ox,
      bo,
      oz,
    ),
  )
  g.add(cyl(1.5, 1.5, 0.6, keys, { x: ox, y: bo + 6.4, z: oz }, 14))
  g.add(cyl(1.15, 1.35, 22, oboeC, { x: ox, y: bo + 6.6, z: oz }, 14))
  g.add(cyl(1.3, 1.3, 0.6, keys, { x: ox, y: bo + 28.3, z: oz }, 14))
  g.add(cyl(0.95, 1.15, 24, oboeC, { x: ox, y: bo + 28.4, z: oz }, 14))
  g.add(cyl(1.05, 1.05, 0.6, keys, { x: ox, y: bo + 52, z: oz }, 12))
  g.add(cyl(0.35, 0.45, 2.4, '#c9905e', { x: ox, y: bo + 52.4, z: oz }, 8))
  g.add(P(rbox(0.8, 2.6, 0.25, CANE, {}, 0.1), ox, bo + 55.9, oz))
  const orAt = (y: number) => (y < bo + 28.4 ? 1.35 - (0.2 * (y - bo - 6.6)) / 22 : 1.15 - (0.2 * (y - bo - 28.4)) / 24)
  g.add(rod3([ox + 0.5, bo + 9, oz + 1.3], [ox + 0.5, bo + 50, oz + 1], 0.15, keys, 6))
  for (const y of [bo + 12, bo + 17, bo + 22, bo + 33, bo + 39, bo + 45]) g.add(P(cyl(0.45, 0.45, 0.3, keys, {}, 10), ox - 0.3, y, oz + orAt(y) + 0.05, PI / 2))
  return fitGroup(g)
}

// ---------- 脚踏风琴（复古木质）：两块侧板（踏板处收进、键盘处探出、上半截后退），底下两块铺地毯的踏板，键盘后面一排音栓，上半截镂空弧窗衬布、谱架和两侧小灯台，平顶可以摆东西 ----------

const PO = { w: 110, d: 50, h: 120 }
function pumpOrgan(p: string[]) {
  const [wood, cloth, carpet] = p
  const g = new THREE.Group()
  const dk = shade(wood, -0.1)
  const iw = PO.w - 6
  const side: V2[] = [
    [-25, 0],
    [22, 0],
    [22, 4],
    [18, 8],
    [18, 68],
    [25, 69],
    [25, 79],
    [6, 80],
    [4.5, 117],
    [-25, 117],
  ]
  for (const s of [-1, 1]) g.add(sideSlab(side, 3, wood, s * (PO.w / 2 - 1.5)))
  // 背板、底座
  g.add(rbox(iw + 0.4, 117, 1.5, dk, { z: -24.2 }, 0.3))
  g.add(rbox(iw + 0.4, 4, 45.6, dk, { z: -1.2 }, 0.5))
  // 踏板坑：后壁 + 顶板；坑上面是膝板（两块装饰框 + 中间两块膝控板）
  g.add(rbox(iw, 19, 1.6, shade(wood, -0.18), { y: 4, z: 6 }, 0.3))
  g.add(rbox(iw, 1.6, 11.4, dk, { y: 22.4, z: 11.5 }, 0.3))
  g.add(rbox(iw + 0.4, 44, 1.8, wood, { y: 24, z: 16.9 }, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(30, 30, 0.5, shade(wood, 0.08), { x: s * 30, y: 31, z: 18 }, 0.2))
    g.add(rbox(12, 14, 1.2, shade(wood, -0.06), { x: s * 9, y: 50, z: 18.3 }, 0.4))
  }
  // 两块踏板（铺地毯，后高前低），前端搁在铰链横档上
  for (const s of [-1, 1]) g.add(P(G(rbox(24, 1.4, 14, dk, { y: -0.7 }, 0.4), rbox(21, 0.4, 11.5, carpet, { y: 0.6 }, 0.15)), s * 16, 8.4, 12.8, 0.36))
  g.add(rbox(iw, 2.2, 3, DARK, { y: 4, z: 19.6 }, 0.5))
  // 键床、琴键、两头的颊木
  g.add(rbox(iw + 0.4, 4, 19.4, wood, { y: 68, z: 15.1 }, 0.5))
  g.add(rbox(98, 1.4, 14, IVORY, { y: 72, z: 17.4 }, 0.3))
  g.add(paintPanel(97.4, 13.4, 'mu-organ-keys', keysArt(36, IVORY, '#26262a'), { y: 73.45, z: 17.4 + 6.7, rx: -PI / 2 }))
  for (const s of [-1, 1]) g.add(rbox(3, 6, 19.4, wood, { x: s * 50.5, y: 72, z: 15.1 }, 0.5))
  // 音栓条：一排象牙面的拉钮
  g.add(rbox(98, 6, 3.2, dk, { y: 72, z: 8.8 }, 0.5))
  for (let i = 0; i < 11; i++) {
    const x = -40 + i * 8
    g.add(cylZ(0.8, 2, shade(wood, -0.25), x, 75.4, 11.2, 12))
    g.add(cylZ(1, 0.4, IVORY, x, 75.4, 12.3, 14))
  }
  // 上半截：盖板、底横档、镂空弧窗（后面衬布）、顶横档、谱架和乐谱、两侧小灯台
  g.add(rbox(iw, 2, 8, dk, { y: 78, z: 6.4 }, 0.4))
  g.add(rbox(iw + 0.4, 4, 3, wood, { y: 80, z: 4.3 }, 0.5))
  const holes: Hole[] = []
  for (let i = 0; i < 7; i++) holes.push({ kind: 'arch', x: -42 + i * 14, y: 4, w: 9, h: 21 })
  g.add(holePanel(iw + 0.4, 30, 1.6, wood, holes, { y: 84, z: 3.6 }, 0.5))
  g.add(rbox(iw, 28, 0.6, cloth, { y: 85, z: 1.8 }, 0.2))
  g.add(rbox(iw + 0.4, 3, 3, wood, { y: 114, z: 3 }, 0.5))
  g.add(rbox(64, 1.6, 4.4, wood, { y: 86, z: 6.4 }, 0.5))
  g.add(rbox(30, 21, 0.4, shade(cloth, -0.1), { y: 87.6, z: 4.7 }, 0.15))
  g.add(paintPanel(27, 19, `mu-organ-score-${PAPER}`, scoreArt(PAPER, '#3a3a3a', 7), { y: 88.6, z: 5 }))
  for (const s of [-1, 1]) {
    g.add(rbox(9, 1.2, 9, wood, { x: s * 44, y: 95, z: 8.2 }, 0.4))
    g.add(rbox(1.6, 4, 4, dk, { x: s * 44, y: 91, z: 6.4 }, 0.3))
  }
  // 平顶板
  g.add(rbox(PO.w, 3, 31, wood, { y: 117, z: -9.5 }, 0.6))
  return g
}

// ---------- 吉他效果器板：后高前低的楔形板铺着魔术贴，后排三块、前排三块单块效果器（踩钉、旋钮、指示灯、两侧插孔），跳线把它们串起来，右前角一只电源盒 ----------

const KNOB = '#2a2a2e'
/** 单块效果器：方盒机身 + 前面一只踩钉、后面一排旋钮、一颗指示灯、两侧插孔；(x, z) 是机身底面中心，y 是底面高度 */
function stompbox(w: number, d: number, color: string, knobs: number, x: number, z: number, y: number) {
  const g = new THREE.Group()
  const h = 3.4
  g.add(rbox(w, h, d, color, { x, y, z }, 0.6))
  g.add(cyl(0.7, 0.8, 1, STEEL, { x, y: y + h - 0.1, z: z + d * 0.25 }, 12))
  g.add(cyl(0.95, 0.95, 0.5, STEEL, { x, y: y + h + 0.8, z: z + d * 0.25 }, 14))
  for (let i = 0; i < knobs; i++) {
    const kx = x + (i - (knobs - 1) / 2) * (w / (knobs + 0.6))
    g.add(cyl(0.75, 0.8, 1.1, KNOB, { x: kx, y: y + h - 0.1, z: z - d * 0.25 }, 12))
    g.add(noOutline(rbox(0.2, 0.15, 0.6, '#f2f2f0', { x: kx, y: y + h + 0.95, z: z - d * 0.25 + 0.3 }, 0.05)))
  }
  g.add(lit(ball(0.32, '#ff4a3a', { x: x + w * 0.3, y: y + h, z }), '#ff4a3a', 0.8))
  for (const s of [-1, 1]) g.add(cylX(0.55, 1, STEEL, x + s * (w / 2 + 0.3), y + h * 0.55, z - d * 0.15, 10))
  return g
}

function pedalboard(p: string[]) {
  const [board, c1, c2, c3, cable] = p
  const g = new THREE.Group()
  g.add(
    sideSlab(
      [
        [-16, 0],
        [16, 0],
        [16, 1.6],
        [-16, 4.6],
      ],
      60,
      board,
    ),
  )
  // 板面坐标系：原点在后上沿，+z 沿板面往前，+y 是板面法线
  const { g: top, len } = tiltFrame([-16, 4.6], [16, 1.6], 'z')
  top.add(rbox(57, 0.3, len - 2, DARK, { y: -0.05, z: len / 2 }, 0.1))
  const y = 0.2
  // [宽, 深, 颜色, 旋钮数, x, z]
  const peds: [number, number, string, number, number, number][] = [
    [9, 11, c1, 3, -19, 7.5],
    [9, 11, c2, 3, -7, 7.5],
    [14, 11, c3, 4, 8.5, 7.5],
    [8, 11, '#2e2f33', 1, -18, 23],
    [8, 11, '#e9e4d8', 2, -5, 23],
    [10, 11, STEEL, 3, 9, 23],
  ]
  for (const [w, d, c, k, x, z] of peds) top.add(stompbox(w, d, c, k, x, z, y))
  // 调音表的小屏
  top.add(lit(rbox(4, 0.3, 2.2, '#7fe0a0', { x: -18, y: y + 3.35, z: 21.5 }, 0.1), '#7fe0a0', 0.7))
  // 电源盒
  top.add(rbox(10, 2.6, 6, '#3a3b40', { x: 22.5, y, z: 24 }, 0.5))
  top.add(lit(ball(0.3, '#5ad0ff', { x: 19, y: y + 2.6, z: 22 }), '#5ad0ff', 0.8))
  // 跳线：从一块的右插孔弯上来接到相邻那块的左插孔
  const jack = (i: number, s: number): V3 => {
    const [w, d, , , x, z] = peds[i]
    return [x + s * (w / 2 + 0.8), y + 3.4 * 0.55, z - d * 0.15]
  }
  const patch = (a: V3, sa: number, b: V3, sb: number) => {
    const pa: V3 = [a[0] + sa * 0.9, a[1], a[2]]
    const pb: V3 = [b[0] + sb * 0.9, b[1], b[2]]
    top.add(cylX(0.6, 1.4, DARK, pa[0], pa[1], pa[2], 10), cylX(0.6, 1.4, DARK, pb[0], pb[1], pb[2], 10))
    const s0: V3 = [a[0] + sa * 1.6, a[1], a[2]]
    const s1: V3 = [b[0] + sb * 1.6, b[1], b[2]]
    const mid: V3 = [(s0[0] + s1[0]) / 2, Math.max(s0[1], s1[1]) + 2.4, (s0[2] + s1[2]) / 2]
    top.add(tube([s0, [s0[0] + sa * 1.2, s0[1] + 0.9, s0[2]], mid, [s1[0] + sb * 1.2, s1[1] + 0.9, s1[2]], s1], 0.3, cable, { seg: 18, radial: 6 }))
  }
  patch(jack(2, -1), -1, jack(1, 1), 1)
  patch(jack(1, -1), -1, jack(0, 1), 1)
  patch(jack(5, -1), -1, jack(4, 1), 1)
  patch(jack(4, -1), -1, jack(3, 1), 1)
  patch(jack(2, 1), 1, jack(5, 1), 1)
  g.add(top)
  return g
}

// ---------- 吉他壁挂组：一条长挂板上三只 U 形挂钩，分别挂着木吉他、电吉他、尤克里里（琴头搁在叉齿上，琴身离墙一点） ----------

/** 木吉他：沿 y 立着，琴底 y = 0、背板 z = 0、面板朝 +z。返回琴和琴头根部高度。[面板, 背侧板] */
function acousticGuitar(top: string, back: string) {
  const g = new THREE.Group()
  const ol = mirrorHalf([
    [0, 0],
    [10.5, 0.8],
    [17.6, 5.6],
    [19.4, 13.5],
    [18, 21.5],
    [14.6, 27.6],
    [13.6, 31],
    [14.6, 36],
    [15, 41.5],
    [12.6, 47.6],
    [7, 50.4],
    [0, 51],
  ])
  g.add(P(contour(ol, 10, back, true, 1), 0, 0, 5))
  g.add(P(contour(ol.map(([x, y]): V2 => [x * 0.965, y * 0.97 + 0.75]), 0.6, top, true, 0.2), 0, 0, 10))
  // 音孔 + 音孔花、护板
  g.add(noOutline(cylZ(4.2, 0.2, HOLE, 0, 34, 10.35, 32)))
  g.add(P(torus(4.9, 0.32, shade(top, -0.35)), 0, 34, 10.35))
  g.add(
    noOutline(
      P(
        contour(
          [
            [0, 0],
            [2.6, 0.4],
            [4.2, 3.6],
            [4, 7.4],
            [1.6, 9],
            [-0.6, 6],
          ],
          0.2,
          '#5a2e1e',
          true,
          0.05,
        ),
        5.5,
        25.5,
        10.45,
      ),
    ),
  )
  // 琴码 + 弦枕
  g.add(rbox(12, 1.8, 0.9, EBONY, { y: 12.8, z: 10.6 }, 0.4))
  g.add(rbox(7, 0.35, 0.4, IVORY, { y: 14, z: 11.1 }, 0.1))
  // 琴颈、指板、琴枕、琴头
  g.add(rbox(5, 32, 2.6, NECK, { y: 49.5, z: 8.5 }, 0.7))
  g.add(rbox(5, 30.6, 0.6, EBONY, { y: 50.6, z: 10.1 }, 0.2))
  g.add(paintPanel(4.8, 30, `mu-gw-fret-${EBONY}`, fretsArt(EBONY, 14), { y: 51, z: 10.5 }))
  g.add(rbox(5, 0.6, 0.7, IVORY, { y: 81.2, z: 10.05 }, 0.2))
  g.add(
    P(
      contour(
        [
          [-2.6, 0],
          [2.6, 0],
          [4, 5],
          [4.2, 16.4],
          [2.6, 18.6],
          [-2.6, 18.6],
          [-4.2, 16.4],
          [-4, 5],
        ],
        1.6,
        NECK,
        false,
        0.4,
      ),
      0,
      81.4,
      8.9,
    ),
  )
  // 两侧各三只弦钮 + 正面弦柱
  for (let i = 0; i < 3; i++) {
    const y = 85.5 + i * 4.8
    for (const s of [-1, 1]) {
      g.add(cylX(0.35, 2.6, STEEL, s * 5.2, y, 8.9, 8))
      g.add(rbox(1.6, 1.4, 0.7, STEEL, { x: s * 7, y: y - 0.7, z: 8.9 }, 0.3))
      g.add(cylZ(0.25, 0.8, STEEL, s * 2.8, y, 10, 6))
    }
  }
  for (let i = 0; i < 6; i++) g.add(thread([-2.6 + i * 1.04, 14.3, 11.25], [-2.05 + i * 0.82, 81.5, 10.4], 0.06))
  return { g, hook: 81.4 }
}

/** 电吉他（ST 型）：沿 y 立着，琴底 y = 0、背面 z = 0.5。[琴身, 护板] */
function electricGuitar(body: string, guard: string) {
  const g = new THREE.Group()
  const pts: V2[] = [
    [0, 0],
    [9, 1],
    [15, 5],
    [16, 12],
    [13.5, 20],
    [12.5, 25],
    [14, 32],
    [15.5, 39],
    [14, 45],
    [11.5, 46],
    [9.5, 41],
    [6, 36.5],
    [-4, 36.5],
    [-7.5, 39],
    [-10.5, 42],
    [-12.5, 40.5],
    [-12.5, 33],
    [-11.5, 26],
    [-13.5, 20],
    [-16, 12],
    [-15, 5],
    [-9, 1],
  ]
  g.add(P(contour(pts, 4.4, body, true, 0.8), 0, 0, 2.7))
  g.add(P(contour(pts.map(([x, y]): V2 => [x * 0.72 - 1, y * 0.8 + 4]), 0.3, guard, true, 0.1), 0, 0, 5))
  // 三只拾音器、琴桥、三颗旋钮
  for (const y of [12, 19, 26]) g.add(rbox(7.4, 1.8, 0.5, '#f2efe6', { y, z: 5.2 }, 0.25))
  g.add(rbox(7.6, 3.4, 0.6, STEEL, { y: 6.4, z: 5.2 }, 0.3))
  for (const [x, y] of [
    [7.5, 8.5],
    [9.2, 12],
    [10.4, 15.6],
  ] as V2[])
    g.add(cylZ(0.9, 1.2, DARK, x, y, 5.4, 12))
  // 枫木琴颈 + 指板品丝、琴枕、单排弦钮的琴头
  g.add(rbox(4.6, 46, 2.2, MAPLE, { y: 34, z: 4.1 }, 0.6))
  g.add(paintPanel(4.4, 44, `mu-gw-efret-${MAPLE}`, fretsArt(shade(MAPLE, -0.06), 21), { y: 35.5, z: 5.3 }))
  g.add(rbox(4.6, 0.5, 0.6, IVORY, { y: 79.8, z: 5.1 }, 0.2))
  g.add(
    P(
      contour(
        [
          [-2.3, 0],
          [2.3, 0],
          [3.6, 4],
          [4.4, 15.5],
          [2.6, 18],
          [0.4, 16],
          [-2.4, 9],
        ],
        1.5,
        MAPLE,
        true,
        0.4,
      ),
      0,
      79.6,
      4.3,
    ),
  )
  for (let i = 0; i < 6; i++) {
    const ly = 3.2 + i * 2.2
    const y = 79.6 + ly
    const xe = 3.6 + (0.8 * (ly - 4)) / 11.5
    g.add(cylZ(0.3, 0.9, STEEL, xe - 1.6, y, 5.3, 6))
    g.add(cylX(0.3, 1.6, STEEL, xe + 0.5, y, 4, 6))
    g.add(rbox(0.6, 1.2, 0.9, STEEL, { x: xe + 1.5, y: y - 0.6, z: 4 }, 0.2))
  }
  for (let i = 0; i < 6; i++) g.add(thread([-1.8 + 0.72 * i, 7.6, 5.55], [-1.7 + 0.68 * i, 80.2, 5.4], 0.06))
  return { g, hook: 79.6 }
}

/** 尤克里里：沿 y 立着，琴底 y = 0、背板 z = 0.5。[琴身, 面板] */
function ukulele(body: string, top: string) {
  const g = new THREE.Group()
  const ol = mirrorHalf([
    [0, 0],
    [5.8, 0.5],
    [8.6, 3.8],
    [8.9, 8.6],
    [7.2, 13.2],
    [6.4, 15.6],
    [7.2, 19.2],
    [6.4, 23.4],
    [3.4, 25.5],
    [0, 26],
  ])
  g.add(P(contour(ol, 6, body, true, 0.8), 0, 0, 3.5))
  g.add(P(contour(ol.map(([x, y]): V2 => [x * 0.96, y * 0.96 + 0.5]), 0.4, top, true, 0.15), 0, 0, 6.5))
  g.add(noOutline(cylZ(2.4, 0.2, HOLE, 0, 18, 6.75, 24)))
  g.add(P(torus(2.8, 0.22, shade(top, -0.3)), 0, 18, 6.75))
  g.add(rbox(5.6, 1.1, 0.7, EBONY, { y: 6, z: 6.9 }, 0.3))
  g.add(rbox(3.6, 16, 2, NECK, { y: 25, z: 5.6 }, 0.6))
  g.add(paintPanel(3.4, 14.4, `mu-gw-ufret-${EBONY}`, fretsArt(EBONY, 12), { y: 26.4, z: 6.7 }))
  g.add(rbox(3.6, 0.45, 0.6, IVORY, { y: 40.6, z: 6.5 }, 0.15))
  g.add(
    P(
      contour(
        [
          [-1.8, 0],
          [1.8, 0],
          [2.6, 3],
          [2.6, 7],
          [1.4, 8.4],
          [-1.4, 8.4],
          [-2.6, 7],
          [-2.6, 3],
        ],
        1.4,
        NECK,
        true,
        0.35,
      ),
      0,
      40.8,
      5.4,
    ),
  )
  for (const y of [43.4, 46.4])
    for (const s of [-1, 1]) {
      g.add(cylX(0.3, 1.8, STEEL, s * 3.3, y, 5.4, 8))
      g.add(rbox(1.2, 1.1, 0.6, IVORY, { x: s * 4.6, y: y - 0.55, z: 5.4 }, 0.25))
    }
  for (let i = 0; i < 4; i++) g.add(thread([-1.2 + i * 0.8, 6.9, 7.3], [-0.9 + i * 0.6, 41, 6.8], 0.06))
  return { g, hook: 40.8 }
}

const GW = { mount: 110, d: 12 }
function guitarWall(p: string[]) {
  const [plank, top, eBody, guard, uke] = p
  const g = new THREE.Group()
  // 挂板（贴墙，z 0..2）
  g.add(rbox(116, 9, 2, plank, { y: -4.5, z: 1 }, 0.6))
  /** 挂一把琴：琴头根部搁在挂钩叉齿上（叉齿夹住琴颈两侧、稍微咬进去一点），琴身背面离墙 0.6 */
  const hang = (inst: { g: THREE.Group; hook: number }, x: number, nh: number, zf: number) => {
    g.add(P(inst.g, x, 0.45 - inst.hook, 0.6))
    const px = nh + 0.45
    g.add(rbox(px * 2 + 3, 5, 1, DARK, { x, y: -2.5, z: 2.4 }, 0.4))
    for (const s of [-1, 1]) {
      g.add(rod3([x + s * px, 0, 2], [x + s * px, 0.5, zf], 0.55, DARK, 8))
      g.add(ball(0.75, RUBBER, { x: x + s * px, y: 0.5, z: zf }))
    }
  }
  hang(acousticGuitar(top, shade(top, -0.45)), -37, 2.5, 11.2)
  hang(electricGuitar(eBody, guard), 4, 2.3, 6.6)
  hang(ukulele(uke, shade(uke, 0.12)), 42, 1.8, 8)
  return fitWall(g, GW.mount, GW.d)
}

// ---------- 隔音练琴角：两组折叠隔音屏风（框 + 背板 + 锥形吸音棉）沿后墙和左墙围成一个角，前面一只谱架 ----------

/** 吸音棉的锥形纹理：w × h 的格子，每格一个四棱锥（底在 z = 0、尖朝 +z 高 hp），一整块网格，不描边 */
function pyramidField(w: number, h: number, cols: number, rows: number, hp: number, color: string) {
  const pos: number[] = []
  const cw = w / cols
  const ch = h / rows
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x0 = -w / 2 + i * cw
      const y0 = j * ch
      const q: V2[] = [
        [x0, y0],
        [x0 + cw, y0],
        [x0 + cw, y0 + ch],
        [x0, y0 + ch],
      ]
      for (let k = 0; k < 4; k++) {
        const [ax, ay] = q[k]
        const [bx, by] = q[(k + 1) % 4]
        pos.push(ax, ay, 0, bx, by, 0, x0 + cw / 2, y0 + ch / 2, hp)
      }
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return noOutline(mesh(geo, color))
}

/** 一扇隔音屏风：框 + 背板 + 吸音棉（朝 +z），两只 T 形脚；原点在底边中点、板面中心 z = 0 */
function foamPanel(w: number, h: number, foam: string, frame: string) {
  const g = new THREE.Group()
  const y0 = 3
  for (const s of [-1, 1]) {
    g.add(rbox(3, h - y0, 4.6, frame, { x: s * (w / 2 - 1.5), y: y0 }, 0.6))
    g.add(rbox(3.4, y0 + 0.2, 22, frame, { x: s * (w / 2 - 7) }, 0.8))
  }
  for (const y of [y0, h - 3]) g.add(rbox(w - 5.8, 3, 4.6, frame, { y }, 0.6))
  g.add(rbox(w - 5, h - y0 - 5, 1.2, shade(foam, -0.2), { y: y0 + 2.5 }, 0.3))
  const fw = w - 6.4
  const fh = h - y0 - 6.4
  g.add(rbox(fw, fh, 1.6, foam, { y: y0 + 3.2, z: 1.4 }, 0.4))
  g.add(P(pyramidField(fw, fh, Math.round(fw / 5), Math.round(fh / 5), 3.4, foam), 0, y0 + 3.2, 2.2))
  return g
}

function practiceCorner(p: string[]) {
  const [foam, frame, stand] = p
  const g = new THREE.Group()
  const H = 177
  // 后墙一组（两扇，中间两只合页）
  for (const x of [-22.75, 32.75]) g.add(P(foamPanel(54.5, H, foam, frame), x, 0, -29))
  for (const y of [40, 130]) g.add(rbox(2.4, 6, 1.6, STEEL, { x: 5, y, z: -32.2 }, 0.3))
  // 左墙一组（转 90°，吸音棉朝 +x）
  for (const z of [-7.25, 23.75]) g.add(P(foamPanel(30.5, H, foam, frame), -49, 0, z, 0, PI / 2, 0))
  for (const y of [40, 130]) g.add(rbox(1.6, 6, 2.4, STEEL, { x: -52.2, y, z: 8.25 }, 0.3))
  // 谱架：三脚 + 立杆 + 后仰的谱板（底沿托着一张乐谱）
  const sx = 10
  const sz = 14
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i * 2 * PI) / 3
    const f: V3 = [sx + Math.cos(a) * 24, 1, sz + Math.sin(a) * 24]
    g.add(rod3([sx, 22, sz], f, 0.6, stand, 8), ball(1, RUBBER, { x: f[0], y: f[1], z: f[2] }))
  }
  g.add(cyl(1.4, 1.4, 4, stand, { x: sx, y: 19, z: sz }, 12))
  g.add(cyl(0.9, 0.9, 80, stand, { x: sx, y: 18, z: sz }, 12))
  g.add(cyl(0.65, 0.65, 14.5, stand, { x: sx, y: 97, z: sz }, 10))
  const desk = G(rbox(48, 32, 0.6, stand, { z: 0 }, 0.3), rbox(48, 1.4, 4, stand, { y: -0.4, z: 2 }, 0.4), rbox(3, 5, 1.6, stand, { y: 7, z: -1 }, 0.4), paintPanel(40, 27, `mu-pc-score-${PAPER}`, scoreArt(PAPER, '#3a3a3a', 11), { y: 2.5, z: 0.4 }))
  g.add(P(desk, sx, 102, sz + 3.71, -0.35))
  return g
}

// ---------- 配色 ----------

const BANJO_PALS: Pal[] = [
  ['retro', [R.caramel, '#f4ecd8', '#2e2f33']],
  ['classic', ['#7a3e26', '#efe6d2', CL.walnut]],
  ['farmhouse', [F.oak, F.white, F.iron]],
  ['modern', [M.walnut, M.white, M.black]],
]
const MANDOLIN_PALS: Pal[] = [
  ['classic', ['#8a4a26', '#e0b070', CL.walnut]],
  ['retro', [R.caramel, '#f0c27a', '#2e2f33']],
  ['nordic', [N.oak, N.oakL, N.white]],
  ['modern', [M.black, '#c9884a', M.char]],
]
const MORIN_PALS: Pal[] = [
  ['chinese', [CN.walnut, '#efe2c4', '#3f7fc8', CN.rosewood]],
  ['chinese', [CN.rosewood, CN.ivory, CN.lacquer, CN.ink]],
  ['farmhouse', [F.oak, F.linen, F.navy, F.iron]],
  ['japanese', [J.dark, J.washi, J.ai, J.sumi]],
]
const SUONA_PALS: Pal[] = [
  ['chinese', [CN.walnut, '#dcc38a', CN.brass]],
  ['chinese', [CN.rosewood, '#e2cf96', '#d9b45a']],
  ['japanese', [J.wood, J.hinoki, '#c9a25a']],
  ['classic', [CL.walnut, '#e6d4a0', CL.gold]],
]
const ZHONG_PALS: Pal[] = [
  ['chinese', [CN.ink, CN.brass, CN.lacquer]],
  ['chinese', [CN.rosewood, '#6fa38c', CN.brass]],
  ['classic', [CL.walnut, '#b5893f', CL.wine]],
  ['japanese', [J.sumi, '#a8823e', J.shu]],
]
const MUYU_PALS: Pal[] = [
  ['chinese', ['#a8452e', '#d9a441', CN.brass]],
  ['japanese', [J.wood, '#7a3a5a', '#b8923e']],
  ['chinese', [CN.walnut, CN.lacquer, '#c9a25a']],
  ['classic', [CL.walnut, CL.navy, CL.gold]],
]
const CONGA_PALS: Pal[] = [
  ['retro', [R.caramel, '#f1e3c6', '#d5d9de']],
  ['retro', [R.red, '#f1e3c6', '#d4b25a']],
  ['nordic', [N.oak, N.white, '#d5d9de']],
  ['industrial', [I.walnut, '#efe2c8', I.iron]],
  ['cute', [C.sky, C.cream, '#d5d9de']],
]
const TIMPANI_PALS: Pal[] = [
  ['classic', ['#c27a48', '#f4ecd8', '#2e2f33']],
  ['retro', ['#d4964e', '#efe6d0', '#55585e']],
  ['modern', ['#d7d8db', '#f6f3ea', M.black]],
  ['industrial', ['#b5774a', '#ede3cf', I.iron]],
]
const GLOCK_PALS: Pal[] = [
  ['modern', [M.black, '#7a2e3a', '#d5d9de', '#e8483f']],
  ['classic', [CL.walnut, CL.navy, '#d8c07a', CL.wine]],
  ['nordic', [N.oak, N.gray, '#d5d9de', N.blue]],
  ['cute', [C.sky, C.pink, '#e6e9ee', C.lemon]],
]
const RECORDER_PALS: Pal[] = [
  ['nordic', ['#f1e6cf', '#8a5a34', N.oak]],
  ['classic', ['#c9905e', '#5a3b2a', CL.wine]],
  ['cute', [C.sky, C.white, C.pink]],
  ['modern', ['#3f6fa8', M.white, M.char]],
]
const BASSOON_PALS: Pal[] = [
  ['classic', ['#8a3a26', '#2a2624', '#d5d9de']],
  ['retro', [R.caramel, '#3a2a22', '#d4b25a']],
  ['nordic', ['#b0703e', '#33302e', '#e2e5e9']],
  ['modern', ['#5a2e22', '#26252a', '#c3c7cc']],
]
const ORGAN_PALS: Pal[] = [
  ['classic', ['#6b3a24', CL.wine, '#8a2f2a']],
  ['retro', [R.caramel, '#c9a36a', R.red]],
  ['farmhouse', [F.oak, F.linen, F.barn]],
  ['classic', [CL.walnut, CL.navy, CL.wine]],
]
const PEDAL_PALS: Pal[] = [
  ['modern', [M.black, '#e8483f', '#3f7fd8', '#f2c230', '#2e2f33']],
  ['industrial', [I.steel, I.rust, '#5a8a4a', R.mustard, '#2e2f33']],
  ['retro', [R.caramel, R.orange, R.teal, R.cream, '#3a3b40']],
  ['cute', [C.white, C.pink, C.mint, C.lilac, '#8a7ab8']],
]
const GWALL_PALS: Pal[] = [
  ['nordic', [N.oak, '#ecc98e', '#d8483f', IVORY, '#9fd0c8']],
  ['industrial', [I.walnut, '#d9a868', '#33363c', IVORY, I.rust]],
  ['retro', ['#efe6d0', '#e0a85a', R.teal, IVORY, R.mustard]],
  ['modern', [M.char, '#f0d6a8', M.white, '#4a2a1c', '#e8a0a8']],
  ['cute', [C.white, C.woodL, C.sky, IVORY, C.pink]],
]
const CORNER_PALS: Pal[] = [
  ['modern', [M.char, M.silver, M.black]],
  ['modern', ['#3f6fa8', M.black, M.char]],
  ['industrial', ['#a5543f', I.iron, I.steel]],
  ['nordic', [N.linen, N.oak, N.white]],
  ['cute', [C.lilac, C.white, C.pink]],
]

const INSTRUMENT: Partial<AssetDef> = { type: 'instrument', tags: ['hobby:music'] }

export const MUSIC_MORE: AssetDef[] = [
  define('mu-banjo', '班卓琴（琴架）', 'music', [30, 32, 96], BANJO_PALS, banjo, { ...INSTRUMENT, mats: ['wood', 'leather', 'metal'] }),
  define('mu-mandolin', '曼陀林（琴架）', 'music', [25, 22, 67], MANDOLIN_PALS, mandolin, { ...PROP, ...INSTRUMENT, mats: ['wood', 'wood', 'metal'] }),
  define('mu-morin-khuur', '马头琴', 'music', [28, 22, 115], MORIN_PALS, morinKhuur, { ...INSTRUMENT, mats: ['wood', 'leather', 'fabric', 'wood'] }),
  define('mu-suona-sheng', '唢呐与笙', 'music', [40, 20, 45], SUONA_PALS, suonaSheng, { ...PROP, ...INSTRUMENT, mats: ['wood', 'wood', 'metal'] }),
  define('mu-chimes', '编钟摆件', 'music', [50, 18, 41], ZHONG_PALS, bianzhong, { ...PROP, ...INSTRUMENT, mats: ['wood', 'metal', 'paint'] }),
  define('mu-muyu', '木鱼与磬', 'music', [30, 20, 16], MUYU_PALS, muyuSet, { ...PROP, ...INSTRUMENT, mats: ['wood', 'fabric', 'metal'] }),
  define('mu-conga', '康加鼓与邦戈鼓', 'music', [80, 43, 76], CONGA_PALS, congas, { ...INSTRUMENT, mats: ['wood', 'leather', 'metal'] }),
  define('mu-timpani', '定音鼓', 'music', [70, 70, 86], TIMPANI_PALS, timpani, { ...INSTRUMENT, mats: ['metal', 'leather', 'metal'] }),
  define('mu-glockenspiel', '钟琴', 'music', [60, 30, 7], GLOCK_PALS, glockenspiel, { ...PROP, ...INSTRUMENT, mats: ['wood', 'fabric', 'metal', 'plastic'] }),
  define('mu-recorder', '竖笛与笛架', 'music', [31, 20, 34], RECORDER_PALS, recorderSet, { ...PROP, ...INSTRUMENT, mats: ['plastic', 'plastic', 'wood'] }),
  define('mu-oboe-bassoon', '双簧管与巴松', 'music', [47, 25, 135], BASSOON_PALS, bassoonOboe, { ...INSTRUMENT, mats: ['wood', 'wood', 'metal'] }),
  define('mu-pump-organ', '脚踏风琴', 'music', [PO.w, PO.d, PO.h], ORGAN_PALS, pumpOrgan, { ...INSTRUMENT, mats: ['wood', 'fabric', 'fabric'], surface: PO.h, surfaceShape: [rectPoly(-PO.w / 2, -25, PO.w / 2, 6)] }),
  define('mu-pedalboard', '吉他效果器板', 'music', [60, 32, 9], PEDAL_PALS, pedalboard, { type: 'music-accessory', tags: ['hobby:music'], mats: ['metal', 'metal', 'metal', 'metal', 'plastic'] }),
  define('mu-guitar-wall', '吉他壁挂组', 'music', [116, GW.d, 100], GWALL_PALS, guitarWall, { type: 'guitar', tags: ['instrument', 'hobby:music'], mount: GW.mount, mats: ['wood', 'wood', 'paint', 'plastic', 'wood'] }),
  define('mu-practice-corner', '隔音练琴角', 'music', [120, 79, 177], CORNER_PALS, practiceCorner, { type: 'partition', tags: ['hobby:music'], mats: ['fabric', 'metal', 'metal'] }),
]
