// 购物袋素材包（id 前缀 bag-）：环保袋 / 帆布托特 / 纸袋 / レジ袋 / 保冷袋 / 网兜 / 大号编织袋，
// 以及能贴在门上的挂钩（门顶挂钩、磁吸挂钩）和「挂钩上已经挂好袋子」的组合。
//
// 约定补充：
//   - 落地形态（open / standing / folded / lying / closed）原点在底面中心，build 末尾统一 grounded() 落地居中。
//   - 挂起形态（hanging）原点 = 挂点：提手的内顶在 y = -0.5（搭在挂钩横臂顶上），提手搭在原点前方 z ≈ 1.85，
//     袋身在原点下方、z ≥ 0.3。和浴室挂钩（bath-extra 的 hookLevel）、洞洞板、挂杆的挂点带吸附约定一致。
//   - 挂钩 / 组合是贴附物（stick）：背面在 z = 0、上下居中，可以贴在门扇、冰箱、墙的竖直面上。
//     挂钩的 hook 层 y 也按「原点 = 模型上下中心」来写（surface.ts 的 levels 用 f.z + l.y，stick 的 f.z 就是贴附点中心高度）。
//   - 多钩挂钩的挂点带做成一块「梳子形」多边形：各钩之间用极细的连接条连起来，顶点关于 x = 0 对称，
//     这样 snapToHook 算出来的朝向是正前方（顶点平均在 x = 0），而鼠标只有落在某个钩子上才算命中。

import * as THREE from 'three'
import { ball, capsule, cyl, rbox, shade, toon, torus, tray } from '../toon'
import { C, S, paintPanel, rng, type AssetCategory, type AssetDef, type FormTag, type Poly, type StyleTag } from '../kit'

const PI = Math.PI
type V3 = [number, number, number]
type Pal = [StyleTag, string[]]
type Dims = [number, number, number]
type Build = (p: string[]) => THREE.Group

const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro

// ---------- 定义 ----------

function asset(id: string, name: string, category: AssetCategory, [w, d, h]: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    prop: true,
    ...extra,
  }
}

// ---------- 小工具 ----------

const G = (...c: THREE.Object3D[]) => {
  const g = new THREE.Group()
  for (const o of c) g.add(o)
  return g
}

function P<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}

/** 沿 z 的圆柱：从 z0 往 +z 长 len */
const cylZ = (r: number, len: number, color: string, x: number, y: number, z0: number, seg = 20) => P(cyl(r, r, len, color, {}, seg), x, y, z0 + len / 2, PI / 2)

/** 平滑管子（提手、绳、钩子），两端圆头 */
function tube(pts: V3[], r: number, color: string, seg?: number) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    false,
    'centripetal',
  )
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg ?? Math.max(16, pts.length * 8), r, 8, false), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  const a = pts[0]
  const b = pts[pts.length - 1]
  return G(m, ball(r, color, { x: a[0], y: a[1], z: a[2] }), ball(r, color, { x: b[0], y: b[1], z: b[2] }))
}

const box = new THREE.Box3()
function measure(o: THREE.Object3D) {
  o.updateMatrixWorld(true)
  return box.setFromObject(o, true).clone()
}

/** 落地居中：最低点 y = 0，xz 包围盒居中 */
function grounded(g: THREE.Object3D) {
  const b = measure(g)
  g.position.x -= (b.min.x + b.max.x) / 2
  g.position.y -= b.min.y
  g.position.z -= (b.min.z + b.max.z) / 2
  return G(g)
}

/** 贴附物：背面 z = 0、上下居中、x 居中 */
function stuck(g: THREE.Object3D) {
  const b = measure(g)
  g.position.x -= (b.min.x + b.max.x) / 2
  g.position.y -= (b.min.y + b.max.y) / 2
  g.position.z -= b.min.z
  return G(g)
}

// ---------- 印花（paintPanel） ----------

type Print = 'plain' | 'stripe' | 'flower'

function drawStripe(bg: string, fg: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = fg
    const n = 6
    for (let i = 0; i < n; i++) g.fillRect(0, ((i + 0.25) / n) * H, W, H / n / 2)
  }
}

function drawFlower(bg: string, petal: string, center: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    const r = rng(7)
    const s = Math.min(W, H) * 0.045
    for (let i = 0; i < 22; i++) {
      const x = r() * W
      const y = r() * H
      g.fillStyle = petal
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * PI * 2
        g.beginPath()
        g.arc(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.85, 0, PI * 2)
        g.fill()
      }
      g.fillStyle = center
      g.beginPath()
      g.arc(x, y, s * 0.6, 0, PI * 2)
      g.fill()
    }
  }
}

/** 托特包的图案：一只简笔猫 + 两条装饰线（不写字） */
function drawCat(bg: string, ink: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = ink
    const cx = W / 2
    const cy = H * 0.42
    const r = Math.min(W, H) * 0.24
    g.beginPath()
    g.arc(cx, cy, r, 0, PI * 2)
    g.fill()
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(cx + s * r * 0.95, cy - r * 0.2)
      g.lineTo(cx + s * r * 0.85, cy - r * 1.35)
      g.lineTo(cx + s * r * 0.25, cy - r * 0.9)
      g.closePath()
      g.fill()
    }
    g.fillStyle = bg
    for (const s of [-1, 1]) {
      g.beginPath()
      g.arc(cx + s * r * 0.4, cy - r * 0.05, r * 0.13, 0, PI * 2)
      g.fill()
    }
    g.fillStyle = ink
    g.fillRect(W * 0.2, H * 0.78, W * 0.6, H * 0.035)
    g.fillRect(W * 0.32, H * 0.86, W * 0.36, H * 0.035)
  }
}

/** 纸袋的店标：圆环 + 一道横线（不写字） */
function drawBadge(bg: string, ink: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.strokeStyle = ink
    g.lineWidth = Math.max(2, W * 0.04)
    g.beginPath()
    g.arc(W / 2, H * 0.45, Math.min(W, H) * 0.25, 0, PI * 2)
    g.stroke()
    g.fillStyle = ink
    g.beginPath()
    g.arc(W / 2, H * 0.45, Math.min(W, H) * 0.08, 0, PI * 2)
    g.fill()
    g.fillRect(W * 0.25, H * 0.82, W * 0.5, H * 0.04)
  }
}

/** 正面印花面板：w × h，底边在 y，贴在 z 面前 0.3 */
function printPanel(print: Print, p: string[], w: number, h: number, y: number, z: number, x = 0) {
  const [main, acc, pr] = p
  const draw = print === 'stripe' ? drawStripe(main, pr) : drawFlower(main, pr, acc)
  return paintPanel(w, h, `bag-${print}-${main}-${acc}-${pr}`, draw, { x, y, z: z + 0.3 })
}

// ---------- 袋里的东西 ----------

/** 长葱：白段 + 绿段 + 两片叶子；竖直建好，tilt 往 x 方向歪 */
function negi(len: number, tilt: number, at: V3) {
  const g = new THREE.Group()
  g.add(cyl(1.2, 1.25, len * 0.45, '#f4f1e4', {}, 12))
  g.add(cyl(1.25, 1.2, len * 0.4, '#6fb85a', { y: len * 0.45 }, 12))
  for (const s of [-1, 1]) g.add(cyl(0.5, 1.0, len * 0.22, '#4f9e5b', { x: s * 0.9, y: len * 0.82, rz: -s * 0.35 }, 8))
  return P(G(g), at[0], at[1], at[2], 0, 0, tilt)
}

/** 法棍 */
function baguette(len: number, tilt: number, at: V3) {
  const g = new THREE.Group()
  g.add(capsule(2.4, len - 4.8, '#d9a35b'))
  for (let i = 0; i < 3; i++) g.add(rbox(3.2, 0.6, 1.2, '#f2d29a', { y: len * (0.3 + i * 0.2), z: 1.9, rz: 0.5 }, 0.25))
  return P(G(g), at[0], at[1], at[2], 0, 0, tilt)
}

/** 牛奶盒 */
function carton(at: V3, band = '#7fb0d6') {
  const g = new THREE.Group()
  g.add(rbox(7, 14, 7, '#fbfaf6', {}, 0.5))
  g.add(rbox(7.6, 4, 7.6, band, { y: 3 }, 0.5))
  g.add(rbox(7, 2.4, 1.2, '#fbfaf6', { y: 13.6 }, 0.3))
  return P(G(g), ...at)
}

/** 圆白菜 / 生菜 */
function cabbage(r: number, at: V3) {
  return P(G(ball(r, '#a8d88a', {}, [1, 0.9, 1]), ball(r * 1.04, '#7fbf5a', { y: -r * 0.2 }, [1, 0.6, 1])), ...at)
}

/** 面包（吐司条） */
function loaf(at: V3) {
  return P(G(rbox(12, 7, 8, '#e3ad6a', {}, 2.4), rbox(11, 1.2, 7, '#f6dcae', { y: 6.3 }, 0.5)), ...at)
}

const apple = (at: V3) => G(ball(3.4, '#e5533d', { x: at[0], y: at[1], z: at[2] }), cyl(0.2, 0.2, 1.4, '#6e4f37', { x: at[0], y: at[1] + 2.9, z: at[2] }, 6))
const orange = (at: V3) => ball(3.6, '#f39a2b', { x: at[0], y: at[1], z: at[2] })
const onion = (at: V3) => G(ball(3.6, '#c98a3a', { x: at[0], y: at[1], z: at[2] }, [1, 0.9, 1]), cyl(0.3, 0.9, 1.8, '#a8683a', { x: at[0], y: at[1] + 2.7, z: at[2] }, 8))

/** PET 瓶 */
function petBottle(at: V3, label = '#7fc8a9') {
  const g = new THREE.Group()
  g.add(cyl(3, 3, 15, '#d6eef9', {}, 16))
  g.add(cyl(1.4, 3, 3, '#d6eef9', { y: 15 }, 16))
  g.add(cyl(1.5, 1.5, 1.8, '#ffffff', { y: 18 }, 12))
  g.add(cyl(3.3, 3.3, 5, label, { y: 5 }, 16))
  return P(G(g), ...at)
}

/** 饭团：三角柱（尖朝上）+ 海苔 */
function onigiri(at: V3, rz = 0) {
  const tri = cyl(4.2, 4.2, 3, '#fbfaf6', {}, 3)
  tri.position.y = 0
  tri.rotation.x = -PI / 2
  const nori = rbox(3.2, 3.6, 3.3, '#2d3a2e', { y: -4.3 }, 0.3)
  return P(G(tri, nori), at[0], at[1], at[2], 0, 0, rz)
}

// ---------- 提手 ----------

/** 立着的袋子上的一只提手：从 (±a, y0) 拱到 y0 + h，在 z 平面里 */
function loop(a: number, y0: number, h: number, z: number, r: number, color: string) {
  return tube(
    [
      [-a, y0, z],
      [-a * 0.85, y0 + h * 0.65, z],
      [0, y0 + h, z],
      [a * 0.85, y0 + h * 0.65, z],
      [a, y0, z],
    ],
    r,
    color,
  )
}

/** 挂起时的提手内顶 y、搭在钩上的 z（前后两只提手错开一点，免得重合） */
const HANG_TOP = -0.5
const HANG_Z = 1.85

/** 挂起的一只提手：两端在袋口 (±a, yTop, z)，中间搭在挂点上 */
function hangLoop(a: number, yTop: number, z: number, r: number, color: string, dz: number) {
  const apex = HANG_TOP + r
  const zc = HANG_Z + dz
  return tube(
    [
      [-a, yTop, z],
      [-a * 0.45, (yTop + apex) / 2 - 1, (z + zc) / 2],
      [0, apex, zc],
      [a * 0.45, (yTop + apex) / 2 - 1, (z + zc) / 2],
      [a, yTop, z],
    ],
    r,
    color,
  )
}

/** 前后两只挂起的提手 */
function hangHandles(a: number, yTop: number, zFront: number, zBack: number, r: number, color: string) {
  return G(hangLoop(a, yTop, zFront, r, color, 0.3), hangLoop(a, yTop, zBack, r, color, -0.3))
}

// =====================================================================
// 环保袋（尼龙折叠款，エコバッグ）
// =====================================================================

const ECO_PALS: Pal[] = [
  ['cute', [C.pink, '#ffffff', C.lemon]],
  ['nordic', [N.sage, N.white, N.mustard]],
  ['modern', [M.char, M.light, M.gray]],
  ['japanese', [J.ai, J.washi, J.shu]],
  ['retro', [R.mustard, R.teal, R.cream]],
]

/** 装着东西立在地上 */
function ecoOpen(print: Print): Build {
  return (p) => {
    const [main, acc] = p
    const W = 34
    const H = 28
    const D = 14
    const g = new THREE.Group()
    g.add(rbox(W, H, D, main, {}, 4))
    // 袋口：深一点的内衬，比顶面高出一点
    g.add(rbox(W - 7, 1, D - 6, shade(main, -0.25), { y: H - 0.6 }, 0.4))
    g.add(negi(36, -0.28, [-7, H - 12, 0]))
    g.add(carton([4, H - 9, -1]))
    g.add(apple([10.5, H + 1.2, 1.5]))
    for (const s of [-1, 1]) g.add(loop(9, H - 1.5, 17, s * (D / 2 - 1.6), 0.9, acc))
    if (print === 'plain') g.add(rbox(4, 2.4, 0.6, acc, { x: -W / 2 + 7, y: H - 7, z: D / 2 + 0.1 }, 0.2))
    else g.add(printPanel(print, p, W - 9, H - 9, 4.5, D / 2))
    return grounded(g)
  }
}

/** 挂起：空袋子扁扁地垂着 */
function ecoHangingBody(print: Print, W = 32): Build {
  return (p) => {
    const [main, acc] = p
    const H = 30
    const D = 3.6
    const top = -20
    const g = new THREE.Group()
    g.add(rbox(W, H, D, main, { y: top - H, z: 0.3 + D / 2 }, 1.4))
    g.add(hangHandles(W * 0.25, top + 0.6, 0.3 + D - 0.5, 0.8, 0.45, acc))
    if (print === 'plain') g.add(rbox(4, 2.4, 0.6, acc, { x: -W / 2 + 6, y: top - 6, z: 0.3 + D + 0.1 }, 0.2))
    else g.add(printPanel(print, p, W - 4, H - 4, top - H + 2, 0.3 + D))
    return g
  }
}

/** 叠成小包：带按扣的小方包 */
function ecoFolded(print: Print): Build {
  return (p) => {
    const [main, acc, pr] = p
    const g = new THREE.Group()
    g.add(rbox(13, 4, 10, main, {}, 1.8))
    g.add(rbox(3, 4.4, 10.4, acc, { x: 3.6 }, 0.6))
    g.add(ball(0.7, pr, { x: 3.6, y: 4.4, z: 3 }))
    if (print !== 'plain') {
      const draw = print === 'stripe' ? drawStripe(main, pr) : drawFlower(main, pr, acc)
      g.add(paintPanel(5, 6, `bag-fold-${print}-${main}-${acc}-${pr}`, draw, { x: -2.8, y: 4.3, z: 3, rx: -PI / 2 }))
    }
    return grounded(g)
  }
}

const PRINT_LABEL: Record<Print, string> = { plain: '纯色', stripe: '条纹', flower: '小碎花' }

const ECO: AssetDef[] = (['plain', 'stripe', 'flower'] as Print[]).flatMap((pr) => {
  const ex = { family: 'bag-eco', sizeLabel: PRINT_LABEL[pr] }
  return [
    asset(`bag-eco-${pr}-open`, '环保袋', 'kitchenware', [34, 14.4, 52.4], ECO_PALS, ecoOpen(pr), { ...ex, form: 'open' as FormTag, formLabel: '装满东西' }),
    asset(`bag-eco-${pr}-folded`, '环保袋', 'kitchenware', [13, 10.4, 5.1], ECO_PALS, ecoFolded(pr), { ...ex, form: 'folded' as FormTag, formLabel: '叠成小包' }),
    asset(`bag-eco-${pr}-hanging`, '环保袋', 'kitchenware', [32, 4, 50.4], ECO_PALS, ecoHangingBody(pr), { ...ex, form: 'hanging' as FormTag }),
  ]
})

// =====================================================================
// 帆布托特包
// =====================================================================

const TOTE_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.blue]],
  ['cute', [C.cream, '#f4a9c0', C.red]],
  ['modern', [M.white, M.black, M.black]],
  ['japanese', [J.washi, J.ai, J.ai]],
  ['industrial', ['#8c8c5a', I.walnut, R.cream]],
]

function totePrint(p: string[], w: number, h: number, at: { x?: number; y: number; z: number; rx?: number }) {
  const [main, , ink] = p
  return paintPanel(w, h, `bag-tote-${main}-${ink}`, drawCat(main, ink), at)
}

function toteOpen(p: string[]) {
  const [main, handle] = p
  const W = 36
  const H = 34
  const D = 11
  const g = new THREE.Group()
  g.add(rbox(W, H, D, main, {}, 2.5))
  g.add(rbox(W + 0.6, 4, D + 0.6, shade(main, -0.12), {}, 1.2))
  g.add(rbox(W - 5, 1, D - 4, shade(main, -0.3), { y: H - 0.6 }, 0.4))
  g.add(negi(40, 0.22, [8, H - 14, 0]))
  g.add(baguette(38, -0.32, [-6, H - 16, -1]))
  for (const s of [-1, 1]) g.add(loop(8, H - 2, 24, s * (D / 2 - 1.2), 0.9, handle))
  g.add(totePrint(p, 22, 18, { y: 8, z: D / 2 + 0.3 }))
  return grounded(g)
}

function toteHanging(p: string[]) {
  const [main, handle] = p
  const W = 36
  const H = 36
  const D = 3
  const top = -24
  const g = new THREE.Group()
  g.add(rbox(W, H, D, main, { y: top - H, z: 0.3 + D / 2 }, 1.2))
  g.add(hangHandles(8, top + 0.6, 0.3 + D - 0.4, 0.9, 0.5, handle))
  g.add(totePrint(p, 22, 18, { y: top - H + 8, z: 0.3 + D + 0.3 }))
  return g
}

/** 空着平放在地上：提手顺着摊在前面 */
function toteLying(p: string[]) {
  const [main, handle] = p
  const g = new THREE.Group()
  g.add(rbox(36, 2.6, 36, main, {}, 1.1))
  g.add(
    tube(
      [
        [-8, 3.4, -15],
        [-7.5, 2.4, -19],
        [-6, 0.9, -26],
        [0, 0.9, -34],
        [6, 0.9, -26],
        [7.5, 2.4, -19],
        [8, 3.4, -15],
      ],
      0.9,
      handle,
    ),
  )
  g.add(totePrint(p, 22, 18, { y: 2.9, z: 12, rx: -PI / 2 }))
  return grounded(g)
}

const TOTE: AssetDef[] = [
  asset('bag-tote-open', '帆布托特包', 'kitchenware', [36.6, 11.6, 60.9], TOTE_PALS, toteOpen, { family: 'bag-tote', form: 'open', formLabel: '装着东西' }),
  asset('bag-tote-lying', '帆布托特包', 'kitchenware', [36, 52.9, 4.4], TOTE_PALS, toteLying, { family: 'bag-tote', form: 'lying', formLabel: '空着平放' }),
  asset('bag-tote-hanging', '帆布托特包', 'kitchenware', [36, 3.3, 60.5], TOTE_PALS, toteHanging, { family: 'bag-tote', form: 'hanging' }),
]

// =====================================================================
// 纸质购物袋
// =====================================================================

const KRAFT_PALS: Pal[] = [
  ['nordic', ['#c9a06a', '#a8783f', '#7a5236']],
  ['retro', ['#b98a52', '#8c5a2e', R.red]],
  ['japanese', [J.hinoki, J.dark, J.shu]],
]
const SHOP_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.char]],
  ['cute', [C.sakura, '#ffffff', C.red]],
  ['nordic', [N.linen, N.oak, N.sage]],
  ['japanese', [J.washi, J.sumi, J.shu]],
  ['industrial', [I.iron, I.rust, R.cream]],
]

/** 超市纸袋（带扭绳提手），装着法棍、葱、生菜 */
function paperGrocery(p: string[]) {
  const [kraft, handle] = p
  const W = 28
  const H = 32
  const D = 17
  const t = 0.5
  const g = new THREE.Group()
  g.add(tray(W, H, D, t, kraft))
  // 袋口往外翻的一圈
  const rim = shade(kraft, -0.08)
  for (const s of [-1, 1]) {
    g.add(rbox(W + 0.6, 3, 0.5, rim, { y: H - 3, z: s * (D / 2 + 0.3) }, 0.2))
    g.add(rbox(0.5, 3, D, rim, { x: s * (W / 2 + 0.3), y: H - 3 }, 0.2))
  }
  g.add(baguette(44, 0.12, [-6, 6, -2]))
  g.add(negi(42, -0.16, [7, 4, 2.5]))
  g.add(cabbage(7, [3, H - 4, -1.5]))
  for (const s of [-1, 1]) g.add(loop(6, H - 2, 9, s * (D / 2 - 1), 0.45, handle))
  return grounded(g)
}

/** 叠平收着的纸袋（三只叠在一起） */
function paperFolded(p: string[]) {
  const [kraft] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const c = i === 1 ? shade(kraft, -0.05) : kraft
    const s = P(G(rbox(28, 0.7, 34, c, {}, 0.3), rbox(28.2, 0.3, 3, shade(kraft, -0.12), { y: 0.55, z: 12 }, 0.1)), (i - 1) * 0.8, i * 0.75, 0, 0, (i - 1) * 0.05, 0)
    g.add(s)
  }
  return grounded(g)
}

/** 精品店小纸袋：绳提手 + 店标，袋口露出薄纸 */
function paperShop(p: string[]) {
  const [main, rope, ink] = p
  const W = 26
  const H = 30
  const D = 10
  const g = new THREE.Group()
  g.add(tray(W, H, D, 0.4, main))
  for (const x of [-6, 0, 6]) g.add(ball(3.6, '#ffffff', { x, y: H - 0.5, z: (x / 6) * 0.8 }, [1.1, 0.75, 0.8]))
  for (const s of [-1, 1]) g.add(loop(5, H - 2.5, 12, s * (D / 2 - 0.8), 0.35, rope))
  g.add(paintPanel(18, 14, `bag-shop-${main}-${ink}`, drawBadge(main, ink), { y: 8, z: D / 2 + 0.3 }))
  return grounded(g)
}

const PAPER: AssetDef[] = [
  asset('bag-paper-grocery', '纸质购物袋', 'kitchenware', [31.4, 18.1, 49.7], KRAFT_PALS, paperGrocery, { family: 'bag-paper', sizeLabel: '超市大号', form: 'open', formLabel: '装着法棍蔬菜' }),
  asset('bag-paper-folded', '纸质购物袋', 'kitchenware', [31.2, 35.3, 2.4], KRAFT_PALS, paperFolded, { family: 'bag-paper', sizeLabel: '超市大号', form: 'folded', formLabel: '叠平收着' }),
  asset('bag-paper-shop', '纸质购物袋', 'kitchenware', [26, 10.3, 39.8], SHOP_PALS, paperShop, { family: 'bag-paper', sizeLabel: '精品小号', form: 'standing' }),
]

// =====================================================================
// レジ袋（超市塑料袋）：大号 / 便利店小号
// =====================================================================

const REGI_PALS: Pal[] = [
  ['modern', ['#f6f7f4', '#b9c4cc']],
  ['retro', ['#f8f0cf', R.mustard]],
  ['nordic', ['#e6f0f6', '#7fb0d6']],
  ['cute', ['#fbe3ea', '#f4a9c0']],
]

/** 鼓起来的袋身 + 两只「耳朵」提手；r 为袋身半径 */
function regiBody(p: string[], r: number) {
  const [main, acc] = p
  const g = new THREE.Group()
  g.add(ball(r, main, { y: r * 0.95 }, [1.05, 0.95, 0.62]))
  for (const s of [-1, 1]) {
    const ear = torus(r * 0.3, 0.45, shade(main, -0.04), { x: s * r * 0.55, y: r * 1.9 + r * 0.25 })
    ear.scale.set(0.6, 1.6, 1)
    g.add(ear)
  }
  // 袋子上的一道彩色条（店里的配色，不写字）
  const band = ball(r * 1.01, acc, { y: r * 0.95 }, [1.06, 0.12, 0.63])
  band.position.y = r * 0.7
  g.add(band)
  return g
}

function regiOpen(p: string[]) {
  const g = regiBody(p, 14)
  g.add(negi(34, 0.3, [3, 12, 0]))
  g.add(carton([-7.5, 15, -1], '#e5533d'))
  g.add(loaf([1, 21, -1]))
  return grounded(g)
}

function konbiniOpen(p: string[]) {
  const g = regiBody(p, 9)
  g.add(petBottle([-3, 5, 0]))
  g.add(onigiri([3.5, 16.5, 0.5], 0.2))
  return grounded(g)
}

/** 挂起：袋中袋（塑料袋里塞满塑料袋），两只耳朵搭在挂点上；r 为袋身半径 */
function regiHanging(r: number): Build {
  return (p) => {
    const [main, acc] = p
    const zc = 0.3 + r * 0.62 + 0.2
    const cy = -r * 1.15 - r * 1.25
    const g = new THREE.Group()
    g.add(ball(r, main, { y: cy, z: zc }, [1, 1.15, 0.62]))
    const band = ball(r * 1.01, acc, { y: cy - r * 0.3, z: zc }, [1.01, 0.12, 0.63])
    g.add(band)
    // 袋口塞着的塑料袋团
    for (const x of [-r * 0.35, r * 0.3]) g.add(ball(r * 0.32, shade(main, -0.03), { x, y: cy + r * 1.08, z: zc }, [1.1, 0.8, 0.9]))
    const yTop = cy + r * 0.9
    for (const s of [-1, 1]) {
      g.add(
        tube(
          [
            [s * r * 0.6, yTop, zc - r * 0.25],
            [s * r * 0.3, (yTop + HANG_TOP) / 2, (zc + HANG_Z) / 2 - 0.5],
            [s * 0.4, HANG_TOP + 0.45, HANG_Z + s * 0.3],
            [s * r * 0.15, (yTop + HANG_TOP) / 2 - 1, zc + 1],
            [s * r * 0.45, yTop, zc + r * 0.3],
          ],
          0.45,
          shade(main, -0.04),
        ),
      )
    }
    return g
  }
}

/** 叠成三角形收着（三个） */
function regiFolded(p: string[]) {
  const [main, acc] = p
  const g = new THREE.Group()
  const tri = (c: string, x: number, y: number, z: number, ry: number) => P(cyl(6, 6, 1.4, c, {}, 3), x, y, z, 0, ry, 0)
  g.add(tri(main, -3.5, 0, 0, 0))
  g.add(tri(shade(main, -0.04), -2.5, 1.45, 0.5, 0.6))
  g.add(tri(main, 6.5, 0, 1, PI / 3))
  g.add(rbox(1.4, 0.3, 4, acc, { x: -3.5, y: 2.85, z: 0.5, ry: 0.6 }, 0.1))
  return grounded(g)
}

const REGI: AssetDef[] = [
  asset('bag-regi-open', 'レジ袋（塑料袋）', 'kitchenware', [30, 17.8, 46.2], REGI_PALS, regiOpen, { family: 'bag-regi', sizeLabel: '大号', form: 'open', formLabel: '装着东西' }),
  asset('bag-regi-folded', 'レジ袋（塑料袋）', 'kitchenware', [20.4, 11, 3.8], REGI_PALS, regiFolded, { family: 'bag-regi', sizeLabel: '大号', form: 'folded', formLabel: '叠成三角' }),
  asset('bag-regi-hanging', 'レジ袋（塑料袋）', 'kitchenware', [24.5, 15.3, 43], REGI_PALS, regiHanging(12), { family: 'bag-regi', sizeLabel: '大号', form: 'hanging', formLabel: '袋中袋挂起' }),
  asset('bag-konbini-open', 'レジ袋（塑料袋）', 'kitchenware', [19.3, 11.5, 24.8], REGI_PALS, konbiniOpen, { family: 'bag-regi', sizeLabel: '便利店小号', form: 'open', formLabel: '装着饭团饮料' }),
  asset('bag-konbini-hanging', 'レジ袋（塑料袋）', 'kitchenware', [16.3, 10.2, 28.8], REGI_PALS, regiHanging(8), { family: 'bag-regi', sizeLabel: '便利店小号', form: 'hanging' }),
]

// =====================================================================
// 保冷袋
// =====================================================================

const COOL_PALS: Pal[] = [
  ['modern', ['#3d4a5c', M.silver, M.black]],
  ['cute', [C.mint, '#f4f4f2', C.red]],
  ['nordic', [N.gray, N.white, N.mustard]],
  ['retro', [R.red, R.cream, R.teal]],
]

function coolerClosed(p: string[]) {
  const [main, acc, trim] = p
  const W = 30
  const H = 22
  const D = 20
  const g = new THREE.Group()
  g.add(rbox(W, H, D, main, {}, 3))
  g.add(rbox(W + 0.6, 1.6, D + 0.6, acc, { y: H - 3.6 }, 0.8))
  g.add(rbox(24, 0.5, 1.2, trim, { y: H - 0.2 }, 0.2))
  g.add(rbox(1.2, 0.5, 3, M.silver, { x: 12, y: H + 0.1, z: 1 }, 0.2))
  g.add(rbox(20, 10, 1.2, shade(main, -0.08), { y: 4, z: D / 2 - 0.2 }, 0.5))
  for (const s of [-1, 1]) g.add(loop(7, H - 1, 10, s * (D / 2 - 3), 0.8, trim))
  return grounded(g)
}

function coolerFolded(p: string[]) {
  const [main, acc, trim] = p
  const g = new THREE.Group()
  g.add(rbox(28, 3, 18, main, {}, 1.2))
  g.add(rbox(28.4, 1, 18.4, acc, { y: 1 }, 0.4))
  g.add(rbox(4, 3.4, 6, trim, { x: 9, z: 6.4 }, 0.6))
  g.add(ball(0.8, M.silver, { x: 9, y: 3.4, z: 8 }))
  return grounded(g)
}

function coolerHanging(p: string[]) {
  const [main, acc, trim] = p
  const D = 7
  const top = -16
  const g = new THREE.Group()
  g.add(rbox(28, 22, D, main, { y: top - 22, z: 0.6 + D / 2 }, 2.5))
  g.add(rbox(28.6, 1.6, D + 0.6, acc, { y: top - 3.6, z: 0.6 + D / 2 }, 0.6))
  g.add(hangHandles(7, top + 0.4, 0.6 + D - 1, 1.4, 0.5, trim))
  return g
}

const COOLER: AssetDef[] = [
  asset('bag-cooler-closed', '保冷袋', 'kitchenware', [30.6, 20.7, 31.8], COOL_PALS, coolerClosed, { family: 'bag-cooler', form: 'closed', formLabel: '拉好拉链' }),
  asset('bag-cooler-folded', '保冷袋', 'kitchenware', [28.4, 18.6, 4.2], COOL_PALS, coolerFolded, { family: 'bag-cooler', form: 'folded' }),
  asset('bag-cooler-hanging', '保冷袋', 'kitchenware', [28.6, 7.6, 38.5], COOL_PALS, coolerHanging, { family: 'bag-cooler', form: 'hanging' }),
]

// =====================================================================
// 网兜
// =====================================================================

const NET_PALS: Pal[] = [
  ['retro', ['#e05a4a', R.caramel]],
  ['nordic', [N.linen, N.oak]],
  ['japanese', [J.ai, J.wood]],
  ['cute', [C.mint, C.pink]],
]

/** 网：椭球上的经线 + 两圈纬线 */
function netOver(rx: number, ry: number, rz: number, cy: number, cz: number, color: string, th0: number, th1: number) {
  const g = new THREE.Group()
  const n = 8
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * PI * 2
    const pts: V3[] = []
    for (let k = 0; k <= 8; k++) {
      const th = th0 + ((th1 - th0) * k) / 8
      pts.push([rx * Math.cos(th) * Math.cos(ph), cy + ry * Math.sin(th), cz + rz * Math.cos(th) * Math.sin(ph)])
    }
    g.add(tube(pts, 0.22, color, 32))
  }
  for (const th of [-0.35, 0.35]) {
    const t = torus(1, 0.2 / Math.max(rx, rz), color, { y: cy + ry * Math.sin(th), z: cz, rx: PI / 2 })
    t.scale.set(rx * Math.cos(th), rz * Math.cos(th), 1)
    g.add(t)
  }
  return g
}

function netOpen(p: string[]) {
  const [cord, handle] = p
  const g = new THREE.Group()
  const cy = 10
  const pos: V3[] = [
    [-4.5, 3.6, -3.5],
    [4.5, 3.6, -3.5],
    [-4.5, 3.6, 3.5],
    [4.5, 3.6, 3.5],
    [-5.5, 10, 0],
    [5.5, 10, 0],
    [0, 10, 4.8],
    [0, 10, -4.8],
    [0, 15.5, 0],
  ]
  for (const q of pos) g.add(orange(q))
  g.add(netOver(10.6, 10, 9.2, cy, 0, cord, -1.25, 1.35))
  for (const s of [-1, 1]) g.add(loop(4, 19.5, 13, s * 2, 0.5, handle))
  return grounded(g)
}

function netHanging(p: string[]) {
  const [cord, handle] = p
  const g = new THREE.Group()
  const cy = -27
  const cz = 7.8
  const pos: V3[] = [
    [0, -37, cz],
    [-3.4, -32, cz - 2],
    [3.4, -32, cz + 1.5],
    [-2.6, -26, cz + 2.4],
    [3, -26, cz - 2],
    [0, -20.5, cz],
  ]
  for (const q of pos) g.add(onion(q))
  g.add(netOver(7.6, 13, 7, cy, cz, cord, -1.45, 1.4))
  g.add(ball(1.2, cord, { y: -14.4, z: cz }))
  g.add(
    tube(
      [
        [-0.5, -14.4, cz],
        [-2, -7, (cz + HANG_Z) / 2 + 0.5],
        [0, HANG_TOP + 0.5, HANG_Z],
        [2, -7, (cz + HANG_Z) / 2 + 0.5],
        [0.5, -14.4, cz],
      ],
      0.5,
      handle,
    ),
  )
  return g
}

const NET: AssetDef[] = [
  asset('bag-net-open', '网兜', 'kitchenware', [21.6, 18.8, 33], NET_PALS, netOpen, { family: 'bag-net', form: 'open', formLabel: '装着橘子' }),
  asset('bag-net-hanging', '网兜', 'kitchenware', [15.6, 14.4, 40.7], NET_PALS, netHanging, { family: 'bag-net', form: 'hanging', formLabel: '挂着洋葱' }),
]

// =====================================================================
// 大号编织购物袋（蓝色那种；配色可换）
// =====================================================================

const BIG_PALS: Pal[] = [
  ['retro', ['#2f5fae', '#f2c230']],
  ['industrial', [I.iron, I.rust]],
  ['cute', [C.pink, '#ffffff']],
  ['nordic', [N.sage, N.white]],
]

function bigOpen(p: string[]) {
  const [main, strap] = p
  const W = 55
  const H = 33
  const D = 34
  const g = new THREE.Group()
  g.add(tray(W, H, D, 0.8, main))
  g.add(rbox(46, 8, 26, R.cream, { y: H - 6 }, 2.5))
  g.add(rbox(44, 3, 24, '#e8d2a6', { y: H + 1.6 }, 1.2))
  for (const s of [-1, 1]) {
    for (const x of [-12, 12]) g.add(rbox(4, H, 0.4, strap, { x, z: s * (D / 2 + 0.35) }, 0.15))
    g.add(loop(12, H - 0.5, 12, s * (D / 2 + 0.6), 0.9, strap))
  }
  return grounded(g)
}

function bigFolded(p: string[]) {
  const [main, strap] = p
  const g = new THREE.Group()
  g.add(rbox(30, 4, 20, main, {}, 1))
  g.add(rbox(4, 4.6, 20.6, strap, { x: 6 }, 0.5))
  return grounded(g)
}

function bigHanging(p: string[]) {
  const [main, strap] = p
  const D = 5
  const top = -14
  const g = new THREE.Group()
  g.add(rbox(55, 34, D, main, { y: top - 34, z: 0.3 + D / 2 }, 1.2))
  for (const x of [-12, 12]) g.add(rbox(4, 34, 0.4, strap, { x, y: top - 34, z: 0.3 + D + 0.35 }, 0.15))
  g.add(hangHandles(12, top + 0.6, 0.3 + D - 0.4, 0.9, 0.5, strap))
  return g
}

const BIG: AssetDef[] = [
  asset('bag-big-open', '大号编织购物袋', 'storage', [55, 37, 45.4], BIG_PALS, bigOpen, { family: 'bag-big', form: 'open', formLabel: '装着毛毯' }),
  asset('bag-big-folded', '大号编织购物袋', 'storage', [30, 20.6, 4.6], BIG_PALS, bigFolded, { family: 'bag-big', form: 'folded' }),
  asset('bag-big-hanging', '大号编织购物袋', 'storage', [55, 5.6, 48.5], BIG_PALS, bigHanging, { family: 'bag-big', form: 'hanging' }),
]

// =====================================================================
// 挂钩（贴附物）：磁吸挂钩、门顶挂钩
// =====================================================================

/** J 钩的横臂：从 z0 伸出到 zEnd 再上翘；袋子提手搭在 REST_Z 处，横臂顶 = y + HOOK_R */
const HOOK_R = 0.36
const REST_Z = 3.0
function jArm(x: number, y: number, z0: number, color: string) {
  return tube(
    [
      [x, y, z0],
      [x, y, 2.2],
      [x, y + 0.08, 3.2],
      [x, y + 0.9, 3.95],
      [x, y + 2.1, 4.15],
    ],
    HOOK_R,
    color,
  )
}

/** 磁吸挂钩（原始坐标：磁铁座背面 z = 0，横臂在 y = 0） */
function magnetNatural(p: string[]) {
  const [main, metal] = p
  const g = new THREE.Group()
  g.add(cylZ(2.4, 1.3, main, 0, 0, 0, 24))
  g.add(cylZ(1.6, 0.4, shade(main, -0.1), 0, 0, 1.2, 20))
  g.add(jArm(0, 0, 1.0, metal))
  return { g, hooks: [{ x: 0, y: 0 }] }
}

/** 门顶挂钩（原始坐标：顶 y = 0，背面 z = 0）：门顶上的翻边 + 竖条 + 横条 + 一排 J 钩 */
const DOOR_ARM_Y = -30.4
function doorNatural(xs: number[]) {
  return (p: string[]) => {
    const [metal, pad] = p
    const W = (Math.max(...xs) - Math.min(...xs)) + 6
    const g = new THREE.Group()
    // 翻过门顶的那一截只露出一个小折边（背面不伸出 z = 0）
    g.add(rbox(2.6, 0.6, 1.4, metal, { y: -0.6, z: 0.7 }, 0.2))
    g.add(rbox(2.6, 30, 0.5, metal, { y: -30, z: 0.25 }, 0.2))
    g.add(rbox(2.2, 3, 0.3, pad, { y: -5, z: 0.65 }, 0.1))
    g.add(rbox(W, 2.2, 0.6, metal, { y: DOOR_ARM_Y - 1.1, z: 0.3 }, 0.25))
    for (const x of xs) g.add(jArm(x, DOOR_ARM_Y, 0.5, metal))
    return { g, hooks: xs.map((x) => ({ x, y: DOOR_ARM_Y })) }
  }
}

type Natural = (p: string[]) => { g: THREE.Group; hooks: { x: number; y: number }[] }

/** 原始坐标 → 贴附物坐标的平移量（几何和配色无关，按默认配色量一次） */
function stickShift(nat: Natural, pal: string[]) {
  const { g } = nat(pal)
  const b = measure(g)
  return { dx: -(b.min.x + b.max.x) / 2, dy: -(b.min.y + b.max.y) / 2, dz: -b.min.z, size: b.getSize(new THREE.Vector3()) }
}

/**
 * 梳子形挂点带：各钩 x ± 1.2、z ∈ [REST_Z - 1.85, REST_Z + 1.15]（同浴室挂钩：挂起物原点在带的内沿，提手搭在原点前 1.85），
 * 钩与钩之间在内沿用 0.05 宽的细条连起来；顶点关于 x = 0 对称。
 */
function combPoly(xs: number[], dz: number): Poly {
  const b = 1.2
  const z0 = REST_Z - 1.85 + dz
  const z1 = z0 + 3
  const e = z0 + 0.05
  const s = [...xs].sort((a, c) => a - c)
  const pts: Poly = [
    [s[0] - b, z1],
    [s[0] - b, z0],
    [s[s.length - 1] + b, z0],
  ]
  for (let i = s.length - 1; i >= 0; i--) {
    pts.push([s[i] + b, z1], [s[i] - b, z1])
    if (i > 0) pts.push([s[i] - b, e], [s[i - 1] + b, e])
  }
  // 最后一个点和起点重合（单钩时），去掉，保证顶点关于 x = 0 对称
  const last = pts[pts.length - 1]
  if (last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop()
  return pts.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100])
}

function hookAsset(id: string, name: string, nat: Natural, pals: Pal[], extra: Partial<AssetDef>): AssetDef {
  const sh = stickShift(nat, pals[0][1])
  const { hooks } = nat(pals[0][1])
  const xs = hooks.map((h) => h.x + sh.dx)
  const r1 = (n: number) => Math.round(n * 10) / 10
  return asset(id, name, 'entrance', [r1(sh.size.x), r1(sh.size.z), r1(sh.size.y)], pals, (p) => P(G(nat(p).g), sh.dx, sh.dy, sh.dz), {
    stick: true,
    // 挂点：横臂顶 + 0.5（挂起物提手内顶在 -0.5）
    surfaces: [{ y: Math.round((hooks[0].y + sh.dy + HOOK_R + 0.5) * 100) / 100, kind: 'hook', h: 120, shape: [combPoly(xs, sh.dz)] }],
    ...extra,
  })
}

const MAGNET_PALS: Pal[] = [
  ['modern', [M.white, M.silver]],
  ['modern', [M.black, M.char]],
  ['nordic', [N.oak, M.silver]],
  ['cute', [C.pink, '#ffffff']],
]
const DOOR_PALS: Pal[] = [
  ['modern', [M.silver, M.gray]],
  ['industrial', [I.iron, I.steel]],
  ['nordic', [N.white, N.gray]],
  ['retro', ['#c9a24a', R.caramel]],
]

const DOOR2_XS = [-9, 9]
const DOOR3_XS = [-10, 0, 10]

const HOOKS: AssetDef[] = [
  hookAsset('bag-mag-hook', '磁吸挂钩', magnetNatural, MAGNET_PALS, {}),
  hookAsset('bag-door-hook-2', '门顶挂钩', doorNatural(DOOR2_XS), DOOR_PALS, { family: 'bag-door-hook', sizeLabel: '双钩' }),
  hookAsset('bag-door-hook-3', '门顶挂钩', doorNatural(DOOR3_XS), DOOR_PALS, { family: 'bag-door-hook', sizeLabel: '三钩' }),
]

// =====================================================================
// 组合：挂钩上已经挂好袋子（贴附物，一放就能贴到门上）
// =====================================================================

/** 折叠长伞：伞柄弯钩搭在挂点上（挂起约定），伞身往下垂 */
function umbrellaHanging(canopy: string, handle: string) {
  const g = new THREE.Group()
  const r = 2.2
  const t = 0.45
  const cy = HANG_TOP - r
  const zc = HANG_Z
  g.add(P(torus(r, t, handle, {}, PI), 0, cy, zc, 0, PI / 2, 0))
  const zf = zc + r
  g.add(cyl(t, t, 8, handle, { y: cy - 8, z: zf }, 10))
  g.add(cyl(1.0, 1.0, 1.2, M.silver, { y: cy - 9, z: zf }, 12))
  g.add(cyl(2.8, 0.9, 50, canopy, { y: cy - 59, z: zf }, 16))
  g.add(cyl(3.0, 3.0, 2.4, shade(canopy, -0.15), { y: cy - 24, z: zf }, 16))
  g.add(cyl(0.35, 0.25, 6, M.silver, { y: cy - 65, z: zf }, 8))
  return g
}

/** 把挂起物挂到原始坐标里的某个钩上：挂起物原点 = (钩 x, 横臂顶 + 0.5, REST_Z - 1.85)，dz 往前错开 */
function hangOnHook(o: THREE.Object3D, h: { x: number; y: number }, dz = 0) {
  return P(G(o), h.x, h.y + HOOK_R + 0.5, REST_Z - 1.85 + dz)
}

const COMBO_PALS_MAGNET_ECO: Pal[] = [
  ['modern', [M.white, M.silver, M.char, M.light, M.gray]],
  ['cute', [C.pink, '#ffffff', C.sakura, '#ffffff', C.pink]],
  ['nordic', [N.oak, M.silver, N.sage, N.white, N.mustard]],
  ['japanese', [M.black, M.char, J.ai, J.washi, J.shu]],
  ['retro', [M.white, M.silver, R.mustard, R.teal, R.cream]],
]
const COMBO_PALS_MAGNET_REGI: Pal[] = [
  ['modern', [M.white, M.silver, '#f6f7f4', '#b9c4cc']],
  ['retro', [M.black, M.char, '#f8f0cf', R.mustard]],
  ['nordic', [N.oak, M.silver, '#e6f0f6', '#7fb0d6']],
  ['cute', [C.pink, '#ffffff', '#fbe3ea', '#f4a9c0']],
]
const COMBO_PALS_DOOR_NET: Pal[] = [
  ['modern', [M.silver, M.gray, M.char, M.light, M.gray, M.light, M.char]],
  ['nordic', [N.white, N.gray, N.sage, N.white, N.mustard, N.linen, N.oak]],
  ['retro', ['#c9a24a', R.caramel, R.teal, R.cream, R.orange, '#e05a4a', R.caramel]],
  ['industrial', [I.iron, I.steel, '#8c8c5a', I.walnut, R.cream, J.ai, I.walnut]],
]
const COMBO_PALS_DOOR_UMB: Pal[] = [
  ['modern', [M.silver, M.gray, M.char, M.light, M.gray, M.black, M.char]],
  ['japanese', [M.silver, M.gray, J.ai, J.washi, J.shu, J.shu, J.dark]],
  ['cute', [N.white, N.gray, C.pink, '#ffffff', C.lemon, C.sky, C.woodD]],
  ['nordic', [N.white, N.gray, N.sage, N.white, N.mustard, N.blue, N.oak]],
]

const COMBO_W = 26

function comboMagnetEco(p: string[]) {
  const { g, hooks } = magnetNatural(p.slice(0, 2))
  g.add(hangOnHook(ecoHangingBody('stripe', COMBO_W + 4)(p.slice(2, 5)), hooks[0]))
  return stuck(g)
}

function comboMagnetRegi(p: string[]) {
  const { g, hooks } = magnetNatural(p.slice(0, 2))
  g.add(hangOnHook(regiHanging(11)(p.slice(2, 4)), hooks[0]))
  return stuck(g)
}

function comboDoorNet(p: string[]) {
  const { g, hooks } = doorNatural(DOOR2_XS)(p.slice(0, 2))
  g.add(hangOnHook(ecoHangingBody('flower', COMBO_W)(p.slice(2, 5)), hooks[0]))
  // 网兜挂在右钩，往前错开一点，压在环保袋前面
  g.add(hangOnHook(netHanging(p.slice(5, 7)), hooks[1], 3.5))
  return stuck(g)
}

function comboDoorUmbrella(p: string[]) {
  const { g, hooks } = doorNatural(DOOR2_XS)(p.slice(0, 2))
  g.add(hangOnHook(ecoHangingBody('plain', COMBO_W)(p.slice(2, 5)), hooks[0]))
  g.add(hangOnHook(umbrellaHanging(p[5], p[6]), hooks[1]))
  return stuck(g)
}

const COMBOS: AssetDef[] = [
  asset('bag-set-mag-eco', '挂钩 + 购物袋', 'entrance', [30, 5.3, 51.6], COMBO_PALS_MAGNET_ECO, comboMagnetEco, { stick: true, family: 'bag-hook-set', sizeLabel: '磁吸挂钩 · 环保袋' }),
  asset('bag-set-mag-regi', '挂钩 + 购物袋', 'entrance', [22.4, 15.5, 40.7], COMBO_PALS_MAGNET_REGI, comboMagnetRegi, { stick: true, family: 'bag-hook-set', sizeLabel: '磁吸挂钩 · 袋中袋' }),
  asset('bag-set-door-net', '挂钩 + 购物袋', 'entrance', [38.8, 19.7, 79.5], COMBO_PALS_DOOR_NET, comboDoorNet, { stick: true, family: 'bag-hook-set', sizeLabel: '门顶挂钩 · 环保袋 + 网兜' }),
  asset('bag-set-door-umbrella', '挂钩 + 购物袋', 'entrance', [34, 8.2, 97.2], COMBO_PALS_DOOR_UMB, comboDoorUmbrella, { stick: true, family: 'bag-hook-set', sizeLabel: '门顶挂钩 · 环保袋 + 雨伞' }),
]

export const SHOPPING_BAGS: AssetDef[] = [...ECO, ...TOTE, ...PAPER, ...REGI, ...COOLER, ...NET, ...BIG, ...HOOKS, ...COMBOS]
