// 季节节日 + 日式生活文化 + 墙面装饰素材包：
//   年中行事（门松、镜饼、注连饰、雏人形、鲤鱼旗、七夕竹、风铃、团扇、蚊香猪、月见团子…）、开运小物（达摩、招财猫、神棚、佛坛、绘马、御守）、
//   西洋节日（圣诞树、花环、袜子、南瓜灯、彩蛋篮、蛋糕、气球、彩旗）、季节家电（各种风扇、暖风机、石油暖炉、电热地毯、加湿器、被炉…）、
//   墙面装饰（挂钟、装饰画、挂毯、壁挂层板、留言板、日历、挂轴、扇面、照片墙）。约定见 kit.ts 开头。
//
// 约定补充：
//   - id 统一用 ss- 前缀。
//   - build 出来的模型由 A() 统一摆正：落地 / 桌面件把包围盒在 xz 上居中、最低点放到 y = 0；
//     壁挂件（mount）在 xz 上居中（背面正好在 z = -d/2），最低点放到 mount 高度；
//     贴附件（stick）x、y 居中，背面放到 z = 0；挂起形态（form: 'hanging'）保持原点 = 挂点，只把 x 居中。
//   - 挂起形态沿用 storage-forms 的约定：自带 J 钩，横臂在 y = -2 往 -z 插进 1cm，钩尾竖到 y ≈ 0，本体在 z ≥ 0.3。
//   - 壁挂层板的 surface / surfaces 写离地高度（= mount + 层板顶面在模型里的高度）。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, S, glow, paintAbstract, paintFlower, paintLandscape, paintPanel, rectPoly, rng, shell, type AssetCategory, type AssetDef, type Fx, type StyleTag } from '../kit'

const PI = Math.PI
const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro

type V3 = [number, number, number]
type Pal = [StyleTag, string[]]
type Build = (p: string[]) => THREE.Group

const GOLD = '#e3b549'
const BRASS = '#d9b45a'
const STRAW = '#d8c08a'
const PINE = '#3f7a4a'
const MOCHI = '#fbf8f0'
const PAPER = '#fbf6ea'
const FLAME = '#ffb347'
const EMBER = '#ff7a3a'
const LEAF = '#4f9e5b'
const SKIN = '#fff3e8'
const HAIR = '#2b2626'
const SUMI = '#2f2b2a'

// ======================================================================
// 小工具
// ======================================================================

function noOL<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    c.userData.noOutline = true
  })
  return o
}
/** 发光件（灯泡、彩灯、火苗、屏幕） */
function lit<T extends THREE.Object3D>(o: T, color: string, k = 0.8): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = toon(color, { emissive: k })
    c.userData.noOutline = true
  })
  return o
}
/** 半透明件（玻璃、水箱）：透明材质不描边 */
function clear<T extends THREE.Object3D>(o: T, color: string, a = 0.4): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = toon(color, { transparent: a })
  })
  return o
}
/** 两点之间的一根杆 */
function bar(a: V3, b: V3, r: number, color: string, seg = 8) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const m = cyl(r, r, dir.length(), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return m
}
/** 平滑曲线管（绳子、花环、弯钩） */
function tube(pts: V3[], r: number, color: string, seg = 24, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
/** 旋转体：[r, y] 轮廓 */
function lathe(pts: [number, number][], color: string, seg = 32) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
/** 平面轮廓挤出的薄片：轮廓在 xy 平面（y 朝上），厚度沿 +z 从 z0 开始 */
function flat(pts: [number, number][], t: number, color: string, z0 = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false })
  const m = new THREE.Mesh(geo, toon(color))
  m.position.z = z0
  m.castShadow = true
  m.receiveShadow = true
  return m
}
/** 竖直面上的圆片（表盘、团扇面），中心 (x, y, z)，朝 +z，厚度往 -z */
function disc(r: number, color: string, x: number, y: number, z: number, t = 0.4, seg = 32) {
  return cyl(r, r, t, color, { x, y, z: z - t / 2, rx: PI / 2 }, seg)
}
/** 圆形画面（表盘）：圆心 (x, y)，正面朝 +z */
function paintDisc(r: number, key: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, x: number, y: number, z: number) {
  const src = paintPanel(r * 2, r * 2, key, draw)
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), src.material)
  m.position.set(x, y, z)
  m.userData.noOutline = true
  m.receiveShadow = true
  return m
}
/** 五角星轮廓 */
function starPts(R0: number, r0: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i): [number, number] => {
    const a = PI / 2 + (i * PI) / 5
    const rr = i % 2 ? r0 : R0
    return [Math.cos(a) * rr, Math.sin(a) * rr]
  })
}
/** 叶片：叶柄端在 base，沿水平角 yaw、俯仰 pitch（负值朝上）伸出 */
function sprig(len: number, color: string, base: V3, yaw: number, pitch: number, wide = 0.4) {
  const m = ball(len / 2, color, {}, [wide, 0.14, 1])
  m.rotation.set(pitch, yaw, 0, 'YXZ')
  const d: V3 = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
  m.position.set(base[0] + (d[0] * len) / 2, base[1] + (d[1] * len) / 2, base[2] + (d[2] * len) / 2)
  return m
}
/** 竹子：斜切口朝前上方，切口露出浅色竹肉和中空 */
function bamboo(r: number, h: number, color: string, at: V3 = [0, 0, 0], slope = 0.9) {
  const g = new THREE.Group()
  const geo = new THREE.CylinderGeometry(r, r, h, 20)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setY(i, h / 2 - slope * (pos.getZ(i) + r))
  }
  geo.computeVertexNormals()
  geo.translate(0, h / 2, 0)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  g.add(m)
  const th = Math.atan(slope)
  const cap = (rr: number, c: string, lift: number) => {
    const d = noOL(cyl(rr, rr, 0.2, c, {}, 20))
    d.scale.z = 1 / Math.cos(th)
    d.rotation.x = th
    d.position.set(0, h - slope * r + lift * Math.cos(th) - 0.1, lift * Math.sin(th))
    return d
  }
  g.add(cap(r * 0.92, '#f1e4b8', 0.15), cap(r * 0.62, '#6f6a3a', 0.3))
  // 竹节
  for (let y = h * 0.28; y < h - slope * r * 2 - 2; y += h * 0.3) g.add(torus(r + 0.05, Math.max(0.2, r * 0.07), shade(color, -0.12), { y, rx: PI / 2 }))
  g.position.set(...at)
  return g
}
/** J 钩：横臂在 y = -2 从 z = -1 伸到 zFront，钩尾在板内竖到 y ≈ 0；返回钩子 */
function jHook(zFront: number, color = '#b8bcc2') {
  return G(bar([0, -2, -1], [0, -2, zFront], 0.25, color), bar([0, -2, -1], [0, -0.25, -1], 0.25, color))
}
/** 三方（神前供台）：方盘 + 带圆孔的台座 */
function sanbo(w: number, h: number, wood: string) {
  const g = new THREE.Group()
  const bw = w * 0.72
  const bh = h * 0.7
  const hole = { kind: 'circle' as const, x: 0, y: bh * 0.48, r: bh * 0.26 }
  g.add(shell(bw, bh, bw, 0.7, wood, { front: [hole], left: [hole], right: [hole], top: false, bottom: false }))
  g.add(tray(w, h - bh, w, 0.7, shade(wood, 0.04), { y: bh }, 0.3))
  return g
}
/** 扁平的方形相框（背面贴墙）：外框 w × h、框宽 b、厚 t；画面 key / draw */
function frame(w: number, h: number, b: number, t: number, color: string, key: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, mat?: string) {
  const g = new THREE.Group()
  g.add(rbox(w, b, t, color, { z: -t / 2 }, 0.3))
  g.add(rbox(w, b, t, color, { y: h - b, z: -t / 2 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(b, h - b * 2, t, color, { x: s * (w / 2 - b / 2), y: b, z: -t / 2 }, 0.3))
  g.add(rbox(w - b * 2 + 0.2, h - b * 2 + 0.2, 0.4, shade(color, -0.1), { y: b - 0.1, z: -t + 0.2 }, 0.1))
  const iw = w - b * 2
  const ih = h - b * 2
  if (mat) {
    g.add(noOL(rbox(iw, ih, 0.3, mat, { y: b, z: -t + 0.6 }, 0.05)))
    g.add(paintPanel(iw * 0.72, ih * 0.72, key, draw, { y: b + ih * 0.14, z: -t + 0.95 }))
  } else g.add(paintPanel(iw, ih, key, draw, { y: b, z: -t + 0.7 }))
  g.position.z = t / 2
  return g
}
const scaled = (g: THREE.Group, k: number) => {
  g.scale.setScalar(k)
  return G(g)
}

// ---------- 定义工具 ----------

/** 把模型按约定摆正（见文件头） */
function settle(g: THREE.Group, e: Partial<AssetDef>) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  if (e.form === 'hanging') {
    g.position.x -= (b.min.x + b.max.x) / 2
  } else if (e.stick) {
    g.position.x -= (b.min.x + b.max.x) / 2
    g.position.y -= (b.min.y + b.max.y) / 2
    g.position.z -= b.min.z
  } else {
    g.position.x -= (b.min.x + b.max.x) / 2
    g.position.z -= (b.min.z + b.max.z) / 2
    g.position.y += (e.mount ?? 0) - b.min.y
  }
  return G(g)
}

function A(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pal[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  const styles = [...new Set(pals.map((p) => p[0]))]
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((p) => p[1]),
    paletteStyles: pals.map((p) => p[0]),
    styles,
    ...extra,
    build: (p) => settle(build(p), extra),
  }
}

// ======================================================================
// 正月 · 节分
// ======================================================================

/** 门松：稻草卷的桶 + 三根斜切竹 + 松枝和梅花 */
function kadomatsu(p: string[]) {
  const [bam, straw, acc] = p
  const g = new THREE.Group()
  g.add(cyl(21, 22, 38, straw, {}, 28))
  for (const y of [6, 19, 32]) g.add(torus(21.95 - y * 0.026, 1, shade(straw, -0.32), { y, rx: PI / 2 }))
  g.add(cyl(19.5, 19.5, 0.6, shade(straw, -0.12), { y: 38 }, 28))
  g.add(bamboo(4.6, 85, bam, [0, 30, -3.5]))
  g.add(bamboo(4.6, 66, bam, [-6.2, 30, 3.5]))
  g.add(bamboo(4.6, 52, bam, [6.2, 30, 3.5]))
  const rand = rng(11)
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * PI * 2
    const base: V3 = [Math.cos(a) * 12, 38.5, Math.sin(a) * 12]
    for (let k = 0; k < 3; k++) g.add(sprig(10 + rand() * 5, k === 1 ? shade(PINE, 0.08) : PINE, base, PI / 2 - a + (k - 1) * 0.35, -0.35 - rand() * 0.4, 0.3))
  }
  // 梅枝
  for (const s of [-1, 1]) {
    const b0: V3 = [s * 11, 40, 9]
    const b1: V3 = [s * 16, 56, 11]
    g.add(bar(b0, b1, 0.45, '#6e4f37'))
    for (let k = 0; k < 4; k++) {
      const t = 0.3 + k * 0.22
      g.add(ball(1.3, acc, { x: b0[0] + (b1[0] - b0[0]) * t + (k % 2 ? 1.2 : -1.2), y: b0[1] + (b1[1] - b0[1]) * t, z: b0[2] + 1 }))
    }
  }
  return g
}

/** 镜饼：三方上两层年糕 + 橙子 */
function kagamiMochi(p: string[]) {
  const [wood, mochi, orange] = p
  const g = sanbo(24, 12, wood)
  const fy = 12 * 0.7 + 0.7
  g.add(noOL(rbox(15.6, 0.25, 15.6, J.shu, { y: fy, ry: PI / 4 }, 0.05)))
  g.add(noOL(rbox(14.6, 0.25, 14.6, PAPER, { y: fy + 0.25, ry: PI / 4 }, 0.05)))
  g.add(puck(8.5, 5.5, mochi, { y: fy + 0.5 }))
  g.add(puck(6.8, 4.6, shade(mochi, -0.02), { y: fy + 5.8 }))
  const oy = fy + 10.2 + 3.2
  g.add(ball(3.6, orange, { y: oy }, [1, 0.9, 1]))
  g.add(sprig(4.5, LEAF, [0, oy + 3, 0], 0.6, -0.15, 0.5))
  return g
}

/** 注连饰（玄关 / 墙）：稻草环 + 草穗 + 橙子 + 纸垂 */
function shimekazari(p: string[]) {
  const [straw, paper, acc] = p
  const g = new THREE.Group()
  g.add(torus(9, 1.8, straw, { y: 34 }))
  g.add(noOL(torus(9, 0.5, shade(straw, -0.25), { y: 34, z: 1.5 })))
  for (let i = -4; i <= 4; i++) g.add(bar([i * 0.9, 26, 0.8], [i * 2.2, 4, 1.4], 0.4, i % 2 ? straw : shade(straw, 0.06)))
  g.add(rbox(6, 2.4, 3.6, acc, { y: 24.8, z: -0.6 }, 0.6))
  for (const s of [-1, 1]) g.add(sprig(11, PINE, [s * 2, 31, 2.6], s * (PI / 2) - s * 0.2, 0.15, 0.4))
  g.add(ball(4, '#f29a2e', { y: 32, z: 4 }))
  g.add(sprig(3.5, LEAF, [0, 35.5, 4.5], 0.4, -0.3, 0.5))
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) g.add(noOL(rbox(2.6, 4, 0.25, paper, { x: s * 8 + (k % 2 ? 0.9 : -0.9) * s, y: 19 - k * 4, z: 2.4 }, 0.05)))
  // 扇子
  const fan: [number, number][] = [[0, 0]]
  for (let k = 0; k <= 8; k++) {
    const a = PI * 0.2 + (k / 8) * PI * 0.6
    fan.push([Math.cos(a) * 7, Math.sin(a) * 7])
  }
  const f = flat(fan, 0.3, GOLD, 5.2)
  f.position.y = 36
  g.add(f)
  return g
}

/** 羽子板饰：画着花的羽子板斜靠在台座上 */
function hagoita(p: string[]) {
  const [base, paddle, acc] = p
  const g = new THREE.Group()
  g.add(rbox(22, 2.5, 12, base, {}, 0.6))
  g.add(rbox(6, 2, 4, shade(base, -0.1), { y: 2.5, z: 1 }, 0.4))
  g.add(rbox(2.5, 26, 2.5, base, { y: 2.5, z: -4.5 }, 0.5))
  const pg = new THREE.Group()
  pg.add(rbox(3.6, 12, 1.4, paddle, {}, 0.6))
  pg.add(rbox(17, 34, 1.2, paddle, { y: 11, z: 0.1 }, 2))
  pg.add(paintPanel(14, 28, `hagoita|${acc}`, paintFlower(acc, '#ffffff', GOLD), { y: 14, z: 0.75 }))
  pg.add(noOL(rbox(14.6, 0.6, 0.3, GOLD, { y: 13.6, z: 0.8 }, 0.1)))
  pg.add(ball(1.2, J.shu, { y: 3, z: 0.9 }))
  pg.position.set(0, 3, -1.2)
  pg.rotation.x = -0.14
  g.add(pg)
  return g
}

/** 福袋：手提纸袋（空心）+ 印着「福」字，口沿里露出包装纸 */
function fukubukuro(s: number): Build {
  return (p) => {
    const [bag, print, tissue] = p
    const w = 40 * s
    const d = 16 * s
    const h = 44 * s
    const g = new THREE.Group()
    g.add(tray(w, h, d, 0.5, bag, {}, 0.2))
    g.add(
      paintPanel(w * 0.62, h * 0.5, `fuku|${bag}|${print}`, (c, W, H) => {
        c.fillStyle = bag
        c.fillRect(0, 0, W, H)
        c.fillStyle = print
        c.beginPath()
        c.arc(W / 2, H / 2, Math.min(W, H) * 0.46, 0, PI * 2)
        c.fill()
        c.fillStyle = '#ffffff'
        c.font = `bold ${Math.round(H * 0.55)}px serif`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('福', W / 2, H / 2)
      }, { y: h * 0.22, z: d / 2 + 0.31 }),
    )
    for (const sz of [-1, 1]) g.add(torus(w * 0.16, 0.45 * s + 0.15, print, { y: h, z: sz * (d / 2 - 0.4) }, PI))
    for (const [x, r] of [[-0.18, 0.2], [0.12, 0.22], [0.3, 0.14]]) g.add(ball(w * r, tissue, { x: w * x, y: h - w * r * 0.4, z: 0 }, [0.8, 0.55, (d * 0.42) / (w * r)]))
    return g
  }
}

/** 红白年糕：小漆盘上一红一白 */
function kohakuMochi(p: string[]) {
  const [dish, red, white] = p
  const g = new THREE.Group()
  g.add(cup(9.5, 7.5, 1.6, 0.6, dish))
  g.add(puck(4, 2.6, white, { x: -4.2, y: 0.6 }))
  g.add(puck(4, 2.6, red, { x: 4.2, y: 0.6 }))
  g.add(noOL(ball(0.7, shade(red, -0.2), { x: 4.2, y: 3.15, z: 0 }, [1, 0.3, 1])))
  return g
}

/** 节分：豆枡（空心，里面是炒豆）+ 立在小架子上的鬼面 */
function setsubun(p: string[]) {
  const [mask, wood, hair] = p
  const g = new THREE.Group()
  g.add(tray(10, 6, 10, 0.7, wood, { x: 5, z: 4 }, 0.2))
  g.add(cyl(4.2, 4.2, 0.4, '#d9b77a', { x: 5, y: 3.8, z: 4 }))
  const rand = rng(5)
  for (let i = 0; i < 16; i++) {
    const a = rand() * PI * 2
    const r = Math.sqrt(rand()) * 3.4
    g.add(ball(0.6, '#e8c98a', { x: 5 + Math.cos(a) * r, y: 4.5, z: 4 + Math.sin(a) * r }))
  }
  // 鬼面
  const m = new THREE.Group()
  m.add(ball(7, mask, {}, [1, 1.12, 0.38]))
  for (const s of [-1, 1]) {
    m.add(cyl(0, 1.3, 4.5, '#f3e3a4', { x: s * 3.6, y: 6.2, rz: -s * 0.35 }, 12))
    m.add(ball(1.5, '#ffffff', { x: s * 2.6, y: 1.5, z: 2.2 }, [1, 0.8, 0.5]))
    m.add(noOL(ball(0.7, SUMI, { x: s * 2.6, y: 1.4, z: 2.85 }, [1, 1, 0.4])))
    m.add(noOL(rbox(3.6, 0.9, 0.4, SUMI, { x: s * 2.6, y: 3.3, z: 2.3, rz: s * 0.3 }, 0.2)))
    m.add(cyl(0, 0.5, 1.4, '#ffffff', { x: s * 1.8, y: -3.6, z: 2.1, rx: PI }, 8))
  }
  m.add(ball(2.6, shade(mask, -0.25), { y: -3.2, z: 1.6 }, [1.2, 0.5, 0.4]))
  m.add(ball(1, shade(mask, -0.1), { y: -0.6, z: 2.6 }))
  for (let k = 0; k < 7; k++) m.add(ball(1.6, hair, { x: (k - 3) * 1.6, y: 7 - Math.abs(k - 3) * 0.5, z: -0.4 }))
  m.position.set(-4, 9.5, -2)
  m.rotation.x = -0.18
  g.add(m)
  g.add(rbox(10, 1.2, 6, wood, { x: -4, z: -2 }, 0.3))
  g.add(bar([-4, 1, -5], [-4, 6, -4.8], 0.4, wood))
  return g
}

// ======================================================================
// 雏祭 · 端午 · 七夕 · 夏 · 月见
// ======================================================================

type DollKind = 'odairi' | 'ohina' | 'kanjo' | 'gonin'
/** 雏人形：衣摆圆锥 + 袖子 + 白脸黑发 */
function hinaDoll(robe: string, under: string, kind: DollKind) {
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [5.8, 0], [5.6, 1.6], [4.2, 4.5], [2.6, 7.4], [1.4, 8.4], [0, 8.6]], robe, 24))
  for (const s of [-1, 1]) g.add(ball(2.6, robe, { x: s * 3.6, y: 5.4, z: 1 }, [0.9, 1.25, 1]))
  g.add(noOL(rbox(2, 4.6, 0.4, under, { y: 3, z: 4.3, rx: -0.3 }, 0.15)))
  g.add(noOL(rbox(2.6, 0.8, 0.4, under, { y: 7.6, z: 1.9, rx: -0.4 }, 0.15)))
  g.add(ball(2.1, SKIN, { y: 10.4 }))
  g.add(ball(2.25, HAIR, { y: 10.7, z: -0.55 }, [1.04, 1, 0.9]))
  for (const s of [-1, 1]) g.add(noOL(ball(0.17, SUMI, { x: s * 0.7, y: 10.2, z: 2.02 })))
  if (kind === 'odairi') {
    g.add(cyl(0.8, 1.1, 3.2, HAIR, { y: 12, z: -0.4, rx: -0.2 }, 12))
    g.add(rbox(0.6, 3.4, 0.25, J.hinoki, { y: 4.4, z: 4.6, rx: -0.2 }, 0.1))
  } else if (kind === 'ohina') {
    g.add(noOL(rbox(2.8, 0.9, 0.3, GOLD, { y: 12.2, z: 0.4 }, 0.1)))
    g.add(rbox(3.2, 2.4, 0.3, GOLD, { y: 4.6, z: 4.6, rx: -0.2 }, 0.1))
  } else if (kind === 'gonin') {
    g.add(cyl(1.4, 1.4, 2.2, J.shu, { y: 4.2, z: 4.6, rx: PI / 2 }, 12))
  }
  return g
}
const HINA_OHINA = '#c8435c'
/** 金屏风：三扇折屏 */
function byobu3(w: number, h: number, gold: string, frameC: string) {
  const g = new THREE.Group()
  const pw = w / 3
  for (let i = -1; i <= 1; i++) {
    const pg = G(rbox(pw, h, 0.8, frameC, {}, 0.3), noOL(rbox(pw - 1.6, h - 1.6, 0.3, gold, { y: 0.8, z: 0.4 }, 0.1)))
    pg.position.set(i * (pw - 0.4) * Math.cos(i ? 0.25 : 0), 0, i ? 1.2 : 0)
    pg.rotation.y = -i * 0.25
    g.add(pg)
  }
  return g
}
/** 雪洞（座灯）：细柄 + 发光灯罩 */
function bonbori(h: number) {
  return G(cyl(1.6, 2, 0.8, SUMI, {}, 12), cyl(0.3, 0.3, h * 0.55, SUMI, { y: 0.8 }, 6), lit(cyl(2, 1.6, h * 0.4, '#fff2b8', { y: h * 0.55 }, 12), '#fff2b8', 0.6), cyl(0.6, 2.1, h * 0.08, SUMI, { y: h * 0.95 - 0.1 }, 12))
}

/** 雏人形·五段饰 */
function hinaTiers(p: string[]) {
  const [felt, screen, robe] = p
  const g = new THREE.Group()
  const W = 92
  const depths = [80, 65, 50, 35, 20]
  depths.forEach((d, k) => g.add(rbox(W, 14, d, felt, { y: k * 14, z: -40 + d / 2 }, 0.5)))
  const zc = (k: number) => -40 + (depths[k] + (depths[k + 1] ?? 0)) / 2
  // 第五段（最上）：亲王 + 屏风 + 雪洞
  const top = 70
  const sc = byobu3(48, 24, screen, SUMI)
  sc.position.set(0, top, -38.6)
  g.add(sc)
  for (const [x, k] of [[-11, 'odairi'], [11, 'ohina']] as [number, DollKind][]) {
    const d = hinaDoll(k === 'odairi' ? robe : HINA_OHINA, k === 'odairi' ? GOLD : '#7a9a5a', k)
    d.position.set(x, top, -29)
    g.add(d)
  }
  for (const s of [-1, 1]) {
    const b = bonbori(13)
    b.position.set(s * 36, top, -31)
    g.add(b)
  }
  // 第四段：三人官女
  for (const x of [-20, 0, 20]) {
    const d = hinaDoll('#fbf8f0', '#c8382f', 'kanjo')
    d.scale.setScalar(0.82)
    d.position.set(x, 56, zc(3))
    g.add(d)
  }
  // 第三段：五人囃子
  for (const x of [-34, -17, 0, 17, 34]) {
    const d = hinaDoll('#2f3b6b', '#fbf8f0', x === 0 ? 'kanjo' : 'gonin')
    d.scale.setScalar(0.72)
    d.position.set(x, 42, zc(2))
    g.add(d)
  }
  // 第二段：菱饼 + 樱花 / 橘
  for (const s of [-1, 1]) {
    const hg = G(rbox(7, 2, 7, SUMI, {}, 0.4))
    ;['#7cae6a', '#fbf8f0', '#f2a0b4'].forEach((c, i) => hg.add(rbox(5.4, 1.1, 5.4, c, { y: 2 + i * 1.15, ry: PI / 4 }, 0.15)))
    hg.position.set(s * 11, 28, zc(1))
    g.add(hg)
    const tg = G(rbox(6, 2, 6, SUMI, {}, 0.4), cyl(0.5, 0.6, 7, '#6e4f37', { y: 2 }, 8))
    const rand = rng(s > 0 ? 3 : 4)
    for (let k = 0; k < 9; k++) tg.add(ball(2, s < 0 ? '#ffc6d6' : '#5f9e4f', { x: (rand() - 0.5) * 6, y: 9 + rand() * 4, z: (rand() - 0.5) * 5 }))
    if (s > 0) for (let k = 0; k < 4; k++) tg.add(ball(0.8, '#f29a2e', { x: (rand() - 0.5) * 6, y: 9 + rand() * 4, z: 2.6 }))
    tg.position.set(s * 35, 28, zc(1))
    g.add(tg)
  }
  // 第一段：嫁妆（衣柜、牛车、驾笼）
  g.add(rbox(8, 9, 6, SUMI, { x: -30, y: 14, z: zc(0) }, 0.5))
  for (let k = 0; k < 3; k++) g.add(noOL(rbox(7, 0.4, 0.3, GOLD, { x: -30, y: 16 + k * 2.6, z: zc(0) + 3.05 }, 0.1)))
  g.add(rbox(10, 6, 7, SUMI, { x: 0, y: 16, z: zc(0) }, 0.6))
  for (const s of [-1, 1]) g.add(torus(3.2, 0.45, '#6e4f37', { x: s * 5.6, y: 17.2, z: zc(0), ry: PI / 2 }))
  g.add(rbox(8, 6, 6, SUMI, { x: 30, y: 14, z: zc(0) }, 1.2))
  g.add(bar([25, 19.8, zc(0)], [35, 19.8, zc(0)], 0.4, GOLD))
  return g
}

/** 雏人形·亲王饰（只有一对，带屏风和雪洞） */
function hinaPair(p: string[]) {
  const [felt, screen, robe] = p
  const g = new THREE.Group()
  g.add(rbox(58, 3, 32, felt, {}, 0.6))
  g.add(noOL(rbox(54, 0.4, 28, shade(felt, -0.12), { y: 3 }, 0.1)))
  const sc = byobu3(48, 25, screen, SUMI)
  sc.position.set(0, 3.4, -14)
  g.add(sc)
  for (const [x, k] of [[-11, 'odairi'], [11, 'ohina']] as [number, DollKind][]) {
    g.add(rbox(14, 1.2, 11, J.tatami, { x, y: 3.4, z: 0 }, 0.3))
    const d = hinaDoll(k === 'odairi' ? robe : HINA_OHINA, k === 'odairi' ? GOLD : '#7a9a5a', k)
    d.position.set(x, 4.6, 0)
    g.add(d)
  }
  for (const s of [-1, 1]) {
    const b = bonbori(14)
    b.position.set(s * 24.5, 3.4, 6)
    g.add(b)
  }
  return g
}

/** 鲤鱼（鲤鱼旗的一条）：头在 -x，嘴是空心的环 */
function carp(len: number, body: string) {
  const g = new THREE.Group()
  g.add(ball(len / 2, body, {}, [1, 0.24, 0.24]))
  g.add(torus(len * 0.1, len * 0.018, '#f6f0e1', { x: -len * 0.47, ry: PI / 2 }))
  for (const s of [-1, 1]) {
    g.add(ball(len * 0.055, '#ffffff', { x: -len * 0.36, y: len * 0.04, z: s * len * 0.085 }, [1, 1, 0.45]))
    g.add(noOL(ball(len * 0.028, SUMI, { x: -len * 0.36, y: len * 0.04, z: s * len * 0.1 }, [1, 1, 0.4])))
    for (let k = 0; k < 3; k++) g.add(noOL(torus(len * 0.05, len * 0.006, shade(body, 0.3), { x: -len * 0.12 + k * len * 0.14, y: -len * 0.01, z: s * len * 0.112 }, PI)))
  }
  const fin = flat([[0, 0], [len * 0.22, len * 0.13], [len * 0.15, 0], [len * 0.22, -len * 0.13]], 0.4, body, -0.2)
  fin.position.x = len * 0.42
  g.add(fin)
  return g
}
/** 鲤鱼旗（阳台用）：注水底座 + 竖杆 + 矢车 + 吹流 + 三条鲤鱼 */
function koinobori(p: string[]) {
  const [papa, mama, kid] = p
  const g = new THREE.Group()
  g.add(rbox(32, 12, 32, '#e9e6df', {}, 2))
  g.add(cyl(5, 5, 1, '#c3c7cc', { y: 12 }))
  g.add(cyl(1.4, 1.6, 168, '#e9e6df', { y: 12 }, 10))
  g.add(ball(2.6, GOLD, { y: 183 }))
  const wheel = G(torus(5, 0.35, J.shu))
  for (let k = 0; k < 8; k++) wheel.add(bar([0, 0, 0], [Math.cos((k * PI) / 4) * 5, Math.sin((k * PI) / 4) * 5, 0], 0.25, k % 2 ? '#3d6fb5' : GOLD))
  wheel.position.set(0, 177, 2)
  g.add(wheel)
  // 吹流：五色
  const cols = ['#3d6fb5', '#fbf8f0', '#d6453a', '#e3b549', '#5f9e4f']
  cols.forEach((c, i) => {
    const m = cyl(4 - i * 0.25, 4 - (i + 1) * 0.25, 8, c, {}, 16)
    m.rotation.z = -PI / 2
    m.position.set(2 + i * 8 + 4, 168, 0)
    g.add(m)
  })
  ;([[papa, 46, 154], [mama, 37, 141], [kid, 29, 130]] as [string, number, number][]).forEach(([c, len, y]) => {
    const f = carp(len, c)
    f.position.set(2 + len / 2, y, 0)
    f.rotation.z = -0.04
    g.add(f)
  })
  return g
}

/** 五月人形·头盔饰 */
function kabuto(p: string[]) {
  const [lac, gold, cord] = p
  const g = new THREE.Group()
  g.add(rbox(44, 5, 32, lac, {}, 0.8))
  g.add(rbox(40, 1.5, 28, shade(lac, 0.12), { y: 5 }, 0.4))
  const sc = byobu3(42, 30, gold, lac)
  sc.position.set(0, 6.5, -12.5)
  g.add(sc)
  g.add(rbox(14, 7, 12, lac, { y: 6.5 }, 0.8))
  const hy = 17
  const dome: [number, number][] = [[0, 0]]
  for (let k = 10; k >= 0; k--) dome.push([Math.sin((k / 10) * (PI / 2)) * 10.5, Math.cos((k / 10) * (PI / 2)) * 10.5])
  const bowl = lathe(dome, lac, 28)
  bowl.position.y = hy
  g.add(bowl)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2
    g.add(noOL(rbox(0.5, 6, 0.5, gold, { x: Math.sin(a) * 9.4, y: hy + 1, z: Math.cos(a) * 9.4, ry: a }, 0.1)))
  }
  g.add(torus(10.6, 0.5, gold, { y: hy, rx: PI / 2 }))
  for (let i = 0; i < 3; i++) g.add(cyl(11 + i * 1.6, 12.6 + i * 1.6, 2.6, i === 1 ? cord : lac, { y: hy - 2.6 * (i + 1) }, 28))
  for (const s of [-1, 1]) {
    g.add(rbox(5.5, 6.5, 1, lac, { x: s * 12.5, y: hy - 4, z: 7, ry: s * 0.7 }, 0.4))
    g.add(noOL(rbox(4.5, 5.5, 0.3, gold, { x: s * 12.85, y: hy - 3.5, z: 7.4, ry: s * 0.7 }, 0.1)))
    // 锹形
    g.add(rbox(1.6, 20, 0.7, gold, { x: s * 5.2, y: hy + 9, z: 9.6, rz: -s * 0.35 }, 0.3))
  }
  g.add(rbox(15, 1.2, 4.5, lac, { y: hy + 1.2, z: 9.6, rx: 0.3 }, 0.4))
  g.add(disc(2.4, gold, 0, hy + 6, 11.2, 0.6))
  g.add(torus(1.4, 0.45, cord, { y: hy - 9.6, z: 7 }))
  return g
}

/** 七夕竹饰：水桶里插一枝竹，挂满短册 */
function tanabata(p: string[]) {
  const [bam, paperA, paperB] = p
  const g = new THREE.Group()
  g.add(cup(14, 12, 24, 1, '#8a6a4a'))
  g.add(cyl(12.4, 12.4, 1, '#9a9890', { y: 20 }))
  g.add(cyl(2, 2.2, 140, bam, { y: 2 }, 12))
  for (let y = 30; y < 140; y += 22) g.add(torus(2.1, 0.3, shade(bam, -0.12), { y, rx: PI / 2 }))
  const rand = rng(7)
  const papers = [paperA, paperB, C.lemon, C.pink, C.sky, C.mint]
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4
    const y = 62 + i * 9
    const L = 26 - i * 1.5
    const end: V3 = [Math.cos(a) * L, y + 10, Math.sin(a) * L * 0.7]
    g.add(bar([0, y, 0], end, 0.55, bam))
    for (let k = 0; k < 5; k++) g.add(sprig(9 + rand() * 3, k % 2 ? '#5f9e4f' : '#78b45a', end, PI / 2 - a + (rand() - 0.5) * 1.6, 0.35 + rand() * 0.4, 0.28))
    const mid: V3 = [end[0] * 0.6, y + 6, end[2] * 0.6]
    for (const [pt, k] of [[end, 0], [mid, 1]] as [V3, number][]) {
      g.add(bar([pt[0], pt[1] - 1, pt[2]], [pt[0], pt[1] - 4, pt[2]], 0.08, '#ffffff'))
      g.add(rbox(3.2, 10, 0.25, papers[(i * 2 + k) % papers.length], { x: pt[0], y: pt[1] - 14, z: pt[2], ry: -a }, 0.1))
    }
  }
  g.add(sprig(12, '#78b45a', [0, 142, 0], 0.3, -1.1, 0.3))
  return g
}

/** 风铃本体：从 top 点垂下，玻璃铃 + 舌 + 短册 */
function furinBody(p: string[], top: V3) {
  const [glassC, paper, fish] = p
  const g = new THREE.Group()
  const [x, y, z] = top
  const bt = y - 4
  g.add(bar([x, y, z], [x, bt, z], 0.08, J.shu))
  const dome = lathe([[0, 0], [4.3, 0], [4.2, 1.5], [3.8, 3.4], [2.5, 4.6], [0.6, 5], [0, 5.05], [0, 4.6], [2.3, 4.2], [3.4, 3.2], [3.8, 1.5], [3.9, 0]], glassC, 24)
  clear(dome, glassC, 0.45)
  dome.position.set(x, bt - 5, z)
  g.add(dome)
  g.add(noOL(torus(4.1, 0.2, fish, { x, y: bt - 4.9, z, rx: PI / 2 })))
  for (const [a, yy] of [[0.3, 2.2], [2.2, 1.8], [-1.6, 2.8]]) g.add(noOL(ball(0.8, fish, { x: x + Math.sin(a) * 4.05, y: bt - 5 + yy, z: z + Math.cos(a) * 4.05, ry: a }, [0.4, 0.6, 1.3])))
  g.add(bar([x, bt - 0.5, z], [x, bt - 7.5, z], 0.06, '#ffffff'))
  g.add(clear(ball(0.45, glassC, { x, y: bt - 6.6, z }), glassC, 0.6))
  g.add(bar([x, bt - 7.5, z], [x, bt - 10, z], 0.06, '#ffffff'))
  g.add(rbox(3.6, 12, 0.2, paper, { x, y: bt - 22, z }, 0.05))
  return g
}
function furinHanging(p: string[]) {
  return G(jHook(5.2), furinBody(p, [0, -2, 5.2]))
}
function furinStand(p: string[]) {
  const g = new THREE.Group()
  g.add(rbox(12, 1.5, 10, J.dark, {}, 0.5))
  g.add(cyl(0.6, 0.7, 36, J.dark, { x: -4, y: 1.5 }, 8))
  g.add(tube([[-4, 37, 0], [-2, 39, 0], [1, 38.5, 0], [3, 37, 0]], 0.5, J.dark, 12, 6))
  g.add(furinBody(p, [3, 36.6, 0]))
  return g
}

/** 团扇：圆扇面（花样）+ 竹柄，柄底在原点，扇面顶在 y = 36 */
function uchiwaBody(p: string[]) {
  const [faceC, pattern, handle] = p
  const g = new THREE.Group()
  g.add(disc(12, faceC, 0, 24, 0.25, 0.5, 40))
  g.add(torus(12, 0.28, shade(faceC, -0.25), { y: 24 }))
  for (const [x, y, r, a] of [[-3.5, 27, 2.4, 0.4], [3.6, 21, 2, -0.3], [0.5, 30.5, 1.4, 0.8]]) {
    g.add(noOL(ball(r, pattern, { x, y, z: 0.36, rz: a }, [1.6, 0.9, 0.12])))
    const tail = noOL(flat([[0, 0], [r * 1.2, r * 0.7], [r * 1.2, -r * 0.7]], 0.15, pattern, 0.33))
    tail.position.x = x + r * 1.3
    tail.position.y = y
    g.add(tail)
  }
  for (let k = 0; k < 3; k++) g.add(noOL(torus(1 + k * 0.6, 0.1, shade(faceC, -0.15), { x: 4 - k * 0.3, y: 28 - k * 0.6, z: 0.36 }, PI)))
  g.add(cyl(0.7, 0.9, 13.5, handle, {}, 10))
  return g
}
function uchiwaStand(p: string[]) {
  const g = G(rbox(10, 1.5, 6, p[2], {}, 0.5), rbox(4, 3, 3, shade(p[2], -0.12), { y: 1.5 }, 0.4))
  const u = uchiwaBody(p)
  u.position.y = 1.5
  g.add(u)
  return g
}
function uchiwaHanging(p: string[]) {
  const g = jHook(0.9)
  g.add(tube([[0, -2, 0.9], [-1.2, -3.2, 0.9], [0, -4.6, 0.9], [1.2, -3.2, 0.9], [0, -2, 0.9]], 0.1, J.shu, 16, 4))
  const u = uchiwaBody(p)
  u.position.set(0, -4.4 - 36, 0.9)
  g.add(u)
  return g
}

/** 蚊香猪：陶猪横躺，前面大口，里面竖挂一盘蚊香 */
const PIG_Y = 10
function katoriButa(p: string[]) {
  const [body, accent, coil] = p
  const g = new THREE.Group()
  g.add(cup(8.6, 8.2, 16, 0.8, body, { y: PIG_Y, z: -8, rx: PI / 2 }))
  g.add(torus(8.4, 0.6, shade(body, -0.06), { y: PIG_Y, z: 8 }))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.5, 1.7, 2.2, body, { x: sx * 4.5, z: sz * 4.5 }, 10))
  for (const s of [-1, 1]) {
    g.add(cyl(0, 2.3, 3.6, body, { x: s * 4.6, y: PIG_Y + 7.4, z: 5, rz: -s * 0.4, rx: 0.3 }, 10))
    g.add(noOL(ball(0.55, SUMI, { x: s * 3.8, y: PIG_Y + 7.9, z: 5.5 })))
  }
  g.add(torus(1.2, 0.35, body, { y: PIG_Y + 2, z: -8.6 }))
  g.add(noOL(torus(8.65, 0.25, accent, { y: PIG_Y, z: 2 })))
  // 蚊香（竖直螺旋）+ 挂丝
  const pts: V3[] = []
  for (let k = 0; k <= 72; k++) {
    const t = k / 72
    const a = t * PI * 2 * 3.2
    const r = 1 + t * 5
    pts.push([Math.cos(a) * r, PIG_Y + Math.sin(a) * r, 1.5])
  }
  g.add(tube(pts, 0.32, coil, 180, 5))
  g.add(bar([0, PIG_Y + 7.6, 1.5], [0, PIG_Y, 1.5], 0.06, '#9aa0a6'))
  return g
}

const PIG_FX: Fx[] = [{ kind: 'smoke', x: 0, y: PIG_Y + 7, z: 8, scale: 0.6, height: 30 }]

/** 月见团子：三方上堆成小山的白团子 */
function tsukimiDango(p: string[]) {
  const [wood, dango, paper] = p
  const g = sanbo(22, 11, wood)
  const fy = 11 * 0.7 + 0.7
  g.add(noOL(rbox(14, 0.25, 14, paper, { y: fy, ry: PI / 4 }, 0.05)))
  const r = 1.8
  const lay = (n: number, y: number) => {
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) g.add(ball(r, dango, { x: (i - (n - 1) / 2) * r * 2, y, z: (k - (n - 1) / 2) * r * 2 }))
  }
  lay(3, fy + 0.25 + r)
  lay(2, fy + 0.25 + r + r * 1.41)
  lay(1, fy + 0.25 + r + r * 2.82)
  return g
}

/** 芒草花瓶（月见）：空心陶瓶 + 几枝芒草 */
function susuki(p: string[]) {
  const [vase, plume, stem] = p
  const g = new THREE.Group()
  g.add(cup(5.5, 6.5, 24, 0.8, vase))
  g.add(cyl(4.6, 4.6, 0.5, '#8b6a4f', { y: 21 }))
  const rand = rng(9)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2
    const lean = 0.12 + rand() * 0.25
    const L = 45 + rand() * 18
    const top: V3 = [Math.cos(a) * Math.sin(lean) * L, 21 + Math.cos(lean) * L, Math.sin(a) * Math.sin(lean) * L * 0.8]
    g.add(bar([0, 21, 0], top, 0.22, stem))
    const pl = ball(3.2, plume, {}, [0.4, 1.9, 0.4])
    pl.position.set(top[0] * 1.06, top[1] + 3, top[2] * 1.06)
    pl.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean)
    g.add(pl)
  }
  for (let i = 0; i < 4; i++) g.add(sprig(26, stem, [0, 22, 0], i * 1.6, -0.9 + i * 0.12, 0.12))
  return g
}

// ======================================================================
// 开运 · 信仰
// ======================================================================

/** 达摩（大号）：圆滚滚，一只眼睛已经点好 */
function daruma(p: string[]) {
  const [body, faceC, gold] = p
  const g = new THREE.Group()
  g.add(ball(15, body, { y: 15 }, [1, 1.05, 0.95]))
  g.add(ball(8.6, faceC, { y: 19.5, z: 10 }, [1, 0.92, 0.5]))
  for (const s of [-1, 1]) {
    g.add(ball(2, '#ffffff', { x: s * 3.2, y: 20.5, z: 14.1 }, [1, 1, 0.3]))
    g.add(noOL(torus(2.5, 0.35, SUMI, { x: s * 3.2, y: 22.2, z: 13.9, rz: 0.2 * s }, PI)))
    g.add(noOL(torus(2.2, 0.35, SUMI, { x: s * 2.4, y: 15.4, z: 14.2, rz: PI + s * 0.5 }, PI * 0.7)))
  }
  g.add(noOL(ball(1.05, SUMI, { x: -3.2, y: 20.5, z: 14.75 }, [1, 1, 0.3])))
  g.add(noOL(ball(0.8, shade(faceC, -0.2), { y: 18, z: 14.4 })))
  g.add(noOL(ball(6.5, gold, { y: 7.5, z: 11.6, rx: -0.5 }, [1, 0.6, 0.3])))
  for (const s of [-1, 1]) g.add(noOL(torus(1.8, 0.4, gold, { x: s * 9, y: 13, z: 10.5, ry: s * 0.7 })))
  return g
}

/** 招财猫（大号）：坐垫上举手的猫，抱着小判 */
function maneki(p: string[]) {
  const [body, collar, acc] = p
  const g = new THREE.Group()
  g.add(rbox(22, 3, 18, shade(collar, -0.05), {}, 1))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(0.9, GOLD, { x: sx * 10.6, y: 2.4, z: sz * 8.6 }))
  g.add(ball(9, body, { y: 12, z: -0.5 }, [1, 1.05, 0.9]))
  g.add(ball(8, body, { y: 25.5 }, [1.1, 0.95, 0.95]))
  for (const s of [-1, 1]) {
    g.add(cyl(0, 2.7, 4.6, body, { x: s * 5, y: 30, rz: -s * 0.35 }, 10))
    g.add(noOL(cyl(0, 1.6, 2.8, '#ffb6c8', { x: s * 4.9, y: 30.8, z: 0.9, rz: -s * 0.35 }, 10)))
    g.add(ball(2.2, body, { x: s * 3.5, y: 4.6, z: 6.5 }, [1, 0.8, 1.2]))
  }
  g.add(face(9, { y: 24.8, z: 7.4 }))
  g.add(noOL(ball(0.6, '#ff8f9a', { y: 23.4, z: 7.6 })))
  g.add(torus(6.4, 0.9, collar, { y: 18.6, rx: PI / 2 }))
  g.add(ball(1.4, GOLD, { y: 16.8, z: 6.4 }))
  // 举起的左手
  g.add(capsule(2.1, 7, body, { x: -8.4, y: 16.5, z: 2.5, rz: 0.12 }))
  g.add(noOL(ball(1, '#ffb6c8', { x: -9.6, y: 26, z: 4.3 }, [1, 1, 0.5])))
  // 小判
  g.add(ball(4, GOLD, { x: 4, y: 12, z: 7.6, rz: 0.2 }, [0.7, 1, 0.2]))
  g.add(noOL(rbox(0.5, 4, 0.3, shade(GOLD, -0.2), { x: 4, y: 10, z: 8.4, rz: 0.2 }, 0.1)))
  g.add(ball(2.2, body, { x: 6.2, y: 14, z: 6 }))
  // 花斑
  g.add(noOL(ball(3, acc, { x: 4.8, y: 28, z: 4.6 }, [1, 0.8, 0.5])))
  g.add(noOL(ball(4, acc, { x: -4, y: 12, z: -6.6 }, [1, 0.9, 0.4])))
  return g
}

/** 神棚（壁挂）：层板 + 宫形 + 注连绳 + 榊 + 供品 */
function kamidana(p: string[]) {
  const [wood, roof, rope] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(2.5, 8, 26, shade(wood, -0.1), { x: s * 22, z: -1 }, 0.4))
  g.add(rbox(62, 2.5, 30, wood, { y: 8 }, 0.5))
  const y0 = 10.5
  g.add(rbox(36, 2, 18, wood, { y: y0, z: -4 }, 0.4))
  g.add(rbox(18, 13, 12, wood, { y: y0 + 2, z: -5 }, 0.4))
  g.add(rbox(10, 9, 0.6, shade(wood, -0.08), { y: y0 + 3.5, z: 1.1 }, 0.2))
  g.add(noOL(rbox(0.4, 9, 0.3, GOLD, { y: y0 + 3.5, z: 1.5 }, 0.1)))
  for (const s of [-1, 1]) {
    g.add(rbox(7, 9, 9, wood, { x: s * 13, y: y0 + 2, z: -5.5 }, 0.4))
    g.add(rbox(10, 1, 7, roof, { x: s * 13, y: y0 + 12.4, z: -3.3, rx: 0.5 }, 0.3))
    g.add(rbox(10, 1, 7, roof, { x: s * 13, y: y0 + 12.4, z: -7.7, rx: -0.5 }, 0.3))
  }
  g.add(rbox(24, 1.2, 9, roof, { y: y0 + 16.5, z: -1.8, rx: 0.55 }, 0.4))
  g.add(rbox(24, 1.2, 9, roof, { y: y0 + 16.5, z: -8.2, rx: -0.55 }, 0.4))
  g.add(rbox(25, 1.6, 1.6, shade(roof, -0.1), { y: y0 + 19.6, z: -5 }, 0.4))
  for (const s of [-1, 1]) g.add(bar([s * 4, y0 + 20.8, -5], [s * 5.5, y0 + 23.5, -5], 0.35, shade(roof, -0.1)))
  // 注连绳 + 纸垂：两端系在棚板前角的细柱上
  for (const s of [-1, 1]) g.add(rbox(1.6, 24, 1.6, wood, { x: s * 29, y: 10.5, z: 13 }, 0.3))
  g.add(tube([[-30, 34, 13], [-14, 30.5, 14], [0, 29.8, 14.2], [14, 30.5, 14], [30, 34, 13]], 0.9, rope, 32, 8))
  for (const x of [-15, 0, 15])
    for (let k = 0; k < 3; k++) g.add(noOL(rbox(2, 2.8, 0.2, PAPER, { x: x + (k % 2 ? 0.7 : -0.7), y: 27 - k * 2.8, z: 14.4 }, 0.05)))
  // 榊
  for (const s of [-1, 1]) {
    g.add(cup(1.6, 1.3, 5, 0.3, '#fbf8f0', { x: s * 25, y: y0, z: 4 }))
    for (let k = 0; k < 5; k++) g.add(sprig(5, '#3f7a4a', [s * 25, y0 + 4, 4], k * 1.3, -0.8, 0.45))
  }
  // 供品：米、盐、水
  for (const x of [-6, 0, 6]) {
    g.add(puck(2.4, 0.6, '#fbf8f0', { x, y: y0, z: 9 }))
    g.add(ball(1.4, '#fbf8f0', { x, y: y0 + 0.8, z: 9 }, [1, 0.8, 1]))
  }
  return g
}

/** 小型佛坛（上置型）：门向前打开，里面阶梯状供台和佛具 */
function butsudan(p: string[]) {
  const [wood, inner, metal] = p
  const g = new THREE.Group()
  g.add(shell(40, 52, 30, 1.5, wood, { front: [{ kind: 'rect', x: 0, y: 3, w: 35, h: 46, r: 0.6 }] }))
  g.add(rbox(42, 3, 32, shade(wood, -0.1), { y: 52 }, 0.6))
  g.add(noOL(rbox(36, 45, 0.4, inner, { y: 4, z: -13.1 }, 0.1)))
  g.add(rbox(36, 10, 4, shade(wood, -0.08), { y: 1.5, z: -6.5 }, 0.4))
  g.add(rbox(36, 20.1, 4.6, shade(wood, -0.04), { y: 1.4, z: -10.8 }, 0.4))
  g.add(rbox(4.5, 10, 1.2, SUMI, { y: 21.5, z: -11 }, 0.3))
  g.add(noOL(rbox(1.4, 7, 0.3, GOLD, { y: 23, z: -10.3 }, 0.05)))
  g.add(ball(2.2, inner, { y: 33.5, z: -11.5 }, [1, 1.2, 0.6]))
  for (const s of [-1, 1]) {
    g.add(cup(1.2, 1, 5, 0.2, metal, { x: s * 9, y: 11.5, z: -6.5 }))
    for (let k = 0; k < 3; k++) g.add(ball(1.2, k ? '#f2a0b4' : '#fbf8f0', { x: s * 9 + (k - 1) * 1.1, y: 17 + k * 0.6, z: -6.5 }))
    g.add(cyl(0.8, 1.2, 6, metal, { x: s * 13, y: 1.5, z: 4 }, 10))
    g.add(lit(ball(0.6, FLAME, { x: s * 13, y: 8.2, z: 4 }, [1, 1.6, 1]), FLAME, 0.9))
    // 打开的门
    g.add(rbox(1.2, 47, 17.5, wood, { x: s * 19.4, y: 3, z: 15 + 8.75 }, 0.3))
    g.add(noOL(rbox(0.3, 42, 14, inner, { x: s * 18.65, y: 5.5, z: 15 + 8.75 }, 0.05)))
  }
  g.add(cup(3.5, 2.6, 3.2, 0.5, metal, { y: 1.5, z: 5 }))
  g.add(cyl(3, 3, 0.3, '#d9d4c7', { y: 3.6, z: 5 }))
  g.add(cup(2.6, 2, 2.6, 0.3, BRASS, { x: 7, y: 1.5, z: 8 }))
  return g
}

/** 绘马（贴附）：五边形木牌 + 画 + 红绳 */
function ema(p: string[]) {
  const [wood, ink, cord] = p
  const g = new THREE.Group()
  g.add(flat([[-7.5, 0], [7.5, 0], [7.5, 7], [4, 10], [-4, 10], [-7.5, 7]], 0.8, wood))
  g.add(
    paintPanel(13, 6.4, `ema|${wood}|${ink}`, (c, W, H) => {
      c.fillStyle = wood
      c.fillRect(0, 0, W, H)
      c.fillStyle = '#d6453a'
      c.beginPath()
      c.arc(W * 0.28, H * 0.42, H * 0.28, 0, PI * 2)
      c.fill()
      c.strokeStyle = ink
      c.lineWidth = Math.max(2, H * 0.05)
      for (let k = 0; k < 4; k++) {
        c.beginPath()
        c.moveTo(W * (0.58 + k * 0.1), H * 0.15)
        c.lineTo(W * (0.58 + k * 0.1), H * (0.6 + (k % 2) * 0.2))
        c.stroke()
      }
    }, { y: 0.6, z: 0.82 }),
  )
  for (const s of [-1, 1]) g.add(rbox(5.6, 0.8, 1.1, shade(wood, -0.18), { x: s * 5.8, y: 8.2, z: 0.05, rz: -s * 0.72 }, 0.2))
  g.add(torus(1.8, 0.16, cord, { y: 10.4, z: 0.4 }, PI))
  g.add(ball(0.5, cord, { y: 10.2, z: 0.4 }))
  return g
}

/** 御守：锦袋 + 结绳 */
function omamoriBody(p: string[]) {
  const [cloth, cord, accent] = p
  const g = new THREE.Group()
  g.add(rbox(4.6, 7, 1, cloth, {}, 0.4))
  g.add(noOL(rbox(1.6, 4.2, 0.2, accent, { y: 1.4, z: 0.55 }, 0.05)))
  for (const [x, y] of [[-1.5, 5.6], [1.5, 0.8], [1.5, 5.6], [-1.5, 0.8]]) g.add(noOL(ball(0.35, accent, { x, y, z: 0.5 }, [1, 1, 0.3])))
  g.add(torus(0.55, 0.28, cord, { y: 7.3, rx: PI / 2 }))
  g.add(torus(1.5, 0.16, cord, { y: 9 }))
  return g
}
function omamoriHanging(p: string[]) {
  const b = omamoriBody(p)
  b.position.set(0, -2 - 0.2 - 10.5, 0.9)
  return G(jHook(0.9), b)
}
function omamoriLying(p: string[]) {
  const b = omamoriBody(p)
  b.rotation.x = -PI / 2
  return G(b)
}

// ======================================================================
// 西洋节日
// ======================================================================

/** 圣诞树（按 180cm 建模，小规格整体缩放）：木箱底座 + 四层树冠 + 彩球 + 发光彩灯 + 星星 */
function xmasTree(p: string[]) {
  const [tree, ornA, ornB] = p
  const g = new THREE.Group()
  const wood = '#b88a5a'
  g.add(tray(40, 26, 40, 1.6, wood, {}, 0.5))
  for (let k = 0; k < 3; k++) g.add(noOL(rbox(40.4, 1.2, 40.4, shade(wood, -0.15), { y: 4 + k * 8 }, 0.3)))
  g.add(cyl(19, 19, 0.8, '#8b6a4f', { y: 21 }))
  g.add(cyl(3.5, 4, 14, '#7a5a43', { y: 20 }, 10))
  const tiers: [number, number, number][] = [
    [30, 62, 50],
    [62, 50, 40],
    [92, 42, 30],
    [118, 38, 19],
  ]
  for (const [y, h, r] of tiers) g.add(cyl(0, r, h, tree, { y }, 22))
  const radiusAt = (y: number) => {
    let best = 0
    for (const [y0, h, r] of tiers) if (y >= y0 && y <= y0 + h) best = Math.max(best, r * (1 - (y - y0) / h))
    return best
  }
  const cols = [ornA, ornB, GOLD]
  tiers.forEach(([y0, h, r], ti) => {
    const n = 8 - ti * 1.5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + ti * 0.7
      const f = 0.12 + (i % 2) * 0.12
      const rr = r * (1 - f)
      const br = 3.2 - ti * 0.4
      g.add(ball(br, cols[(i + ti) % 3], { x: Math.cos(a) * (rr + br * 0.2), y: y0 + h * f - br * 0.6, z: Math.sin(a) * (rr + br * 0.2) }))
    }
  })
  // 彩灯：螺旋一圈圈绕上去
  const bulbs = ['#fff2b8', '#ffd1dc', '#fff2b8', '#c8f0ff']
  for (let i = 0; i < 56; i++) {
    const t = i / 56
    const y = 36 + t * 110
    const a = t * PI * 2 * 5
    const r = radiusAt(y) + 0.6
    g.add(lit(ball(1.1, bulbs[i % 4], { x: Math.cos(a) * r, y, z: Math.sin(a) * r }), bulbs[i % 4], 0.9))
  }
  const star = lit(flat(starPts(8, 3.4), 1.6, GOLD, -0.8), GOLD, 0.7)
  star.position.y = 162
  g.add(star)
  return g
}

/** 圣诞花环（壁挂）：一圈叶子 + 浆果 + 松果 + 蝴蝶结 */
function wreath(p: string[]) {
  const [green, bow, berry] = p
  const g = new THREE.Group()
  const cy = 20
  g.add(torus(15, 3.4, shade(green, -0.12), { y: cy }))
  const rand = rng(21)
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * PI * 2
    const rr = 12 + rand() * 6
    const m = ball(3.6, i % 3 ? green : shade(green, 0.1), {}, [0.45, 1, 0.2])
    m.position.set(Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.2 + rand() * 2)
    m.rotation.set(0, 0, a + 0.6 + rand() * 0.5)
    g.add(m)
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + 0.3
    for (let k = 0; k < 3; k++) g.add(ball(1, berry, { x: Math.cos(a) * 15 + (k - 1) * 1.2, y: cy + Math.sin(a) * 15 + (k % 2) * 1.1, z: 4 }))
  }
  for (const a of [0.8, 2.4, 4.2]) g.add(ball(1.8, '#8a5a3a', { x: Math.cos(a) * 14, y: cy + Math.sin(a) * 14, z: 3.6 }, [0.8, 1.2, 0.8]))
  for (const s of [-1, 1]) {
    g.add(torus(3.2, 1, bow, { x: s * 3.6, y: cy - 15, z: 4.6, rz: s * 0.35 }))
    g.add(rbox(2.4, 9, 0.6, bow, { x: s * 2.6, y: cy - 25, z: 4.4, rz: s * 0.3 }, 0.25))
  }
  g.add(ball(1.6, bow, { y: cy - 15, z: 4.8 }))
  return g
}

/** 圣诞袜：袜筒 + 袜脚 + 白色翻边，挂环在顶上；原点在挂环顶 */
function stocking(main: string, stripe: string) {
  const g = new THREE.Group()
  g.add(rbox(10, 20, 4.4, main, { y: -27 }, 1.6))
  g.add(rbox(15, 8, 4.4, main, { x: 2.5, y: -33, z: 0 }, 3.2))
  for (const y of [-14, -19, -24]) g.add(noOL(rbox(10.1, 1.6, 0.3, stripe, { y, z: 2.2 }, 0.1)))
  g.add(rbox(11.4, 5, 5.2, '#fbf8f0', { y: -9 }, 1.6))
  g.add(torus(1.4, 0.25, '#fbf8f0', { y: -2.6 }))
  return g
}
/** 壁挂圣诞袜（三只挂在一根装饰绳上） */
function stockingsWall(p: string[]) {
  const [a, b, rope] = p
  const g = new THREE.Group()
  g.add(tube([[-36, 46, 2], [-18, 42.5, 2.6], [0, 41.8, 2.8], [18, 42.5, 2.6], [36, 46, 2]], 0.6, rope, 32, 6))
  for (const s of [-1, 1]) g.add(cyl(0.9, 0.9, 2.6, '#c3c7cc', { x: s * 36, y: 46, z: 0, rx: PI / 2 }, 8))
  ;([[-22, a, b], [0, b, a], [22, a, '#fbf8f0']] as [number, string, string][]).forEach(([x, m, st]) => {
    const s = stocking(m, st)
    s.position.set(x, 42.6 + Math.abs(x) * 0.03, 2.8)
    g.add(s)
  })
  return g
}
function stockingHanging(p: string[]) {
  const s = stocking(p[0], p[1])
  s.position.set(0, -2 + 1.15, 2.7)
  return G(jHook(2.7), s)
}

/** 礼物堆：几只缎带礼盒 */
function gifts(p: string[]) {
  const g = new THREE.Group()
  const boxes: [number, number, number, number, number, number, number, number][] = [
    // w h d x y z ry 颜色序号
    [30, 20, 24, -9, 0, -5, 0, 0],
    [20, 16, 20, 15, 0, 3, 0.25, 1],
    [15, 12, 15, -9, 20, -5, 0.35, 2],
    [12, 9, 12, -4, 0, 15, -0.3, 1],
  ]
  for (const [w, h, d, x, y, z, ry, ci] of boxes) {
    const col = p[ci]
    const rib = ci === 0 ? p[2] : ci === 2 ? p[0] : '#fbf8f0'
    const bg = new THREE.Group()
    bg.add(rbox(w, h, d, col, {}, 0.6))
    bg.add(noOL(rbox(w + 0.3, h + 0.3, 2, rib, { y: -0.15 }, 0.2)))
    bg.add(noOL(rbox(2, h + 0.3, d + 0.3, rib, { y: -0.15 }, 0.2)))
    for (const s of [-1, 1]) bg.add(torus(Math.min(w, d) * 0.12, 0.5, rib, { x: s * Math.min(w, d) * 0.12, y: h + 1, rz: s * 0.5 }))
    bg.position.set(x, y, z)
    bg.rotation.y = ry
    g.add(bg)
  }
  return g
}

/** 南瓜灯：八瓣南瓜 + 刻出来的发光脸 */
function jackOLantern(p: string[]) {
  const [skin, stem, glowC] = p
  const g = new THREE.Group()
  const R = 16
  const cy = R * 0.85
  g.add(ball(R * 0.78, shade(skin, -0.06), { y: cy }, [1, 0.85, 1]))
  for (let i = 0; i < 8; i++) {
    const a = PI / 2 + (i / 8) * PI * 2
    const m = ball(R * 0.6, i % 2 ? skin : shade(skin, 0.04), {}, i ? [0.62, 0.88, 1] : [0.8, 0.9, 1])
    m.position.set(Math.cos(a) * R * 0.4, cy, Math.sin(a) * R * 0.4)
    m.rotation.y = PI / 2 - a
    g.add(m)
  }
  g.add(cyl(1.3, 1.9, 6, stem, { y: cy + R * 0.62, rz: 0.2 }, 8))
  // 刻出来的脸：每一块从正前方往南瓜上投射，贴着表面放、朝向表面法线，稍微嵌进去一点
  g.updateMatrixWorld(true)
  const body = [...g.children]
  const ray = new THREE.Raycaster()
  const piece = (pts: [number, number][], x: number, y: number) => {
    ray.set(new THREE.Vector3(x, cy + y, 40), new THREE.Vector3(0, 0, -1))
    const hit = ray.intersectObjects(body, false)[0]
    const pg = G(lit(flat(pts, 1.4, glowC, -0.8), glowC, 0.9))
    if (hit?.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      pg.position.copy(hit.point)
      pg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    } else pg.position.set(x, cy + y, R * 0.9)
    return pg
  }
  for (const s of [-1, 1]) g.add(piece([[-1.8, -1], [1.8, -1], [0, 1.8]], s * 3, 3.2))
  g.add(piece([[-1.1, -0.6], [1.1, -0.6], [0, 1.1]], 0, 0.2))
  // 嘴：分成几块锯齿，各自贴合表面
  const tooth: [number, number][] = [[-1.1, 0.9], [1.1, 0.9], [1.1, -0.5], [0, -1.4], [-1.1, -0.5]]
  for (let k = -2; k <= 2; k++) g.add(piece(tooth, k * 2.2, -3.2 + Math.abs(k) * 0.6))
  return g
}

/** 复活节彩蛋篮：空心藤篮 + 提梁 + 草 + 彩蛋 */
function easterBasket(p: string[]) {
  const [basket, eggA, eggB] = p
  const g = new THREE.Group()
  g.add(cup(13, 10, 11, 0.8, basket))
  for (const y of [3, 6, 9]) g.add(noOL(torus(10 + (y / 11) * 3 + 0.05, 0.25, shade(basket, -0.18), { y, rx: PI / 2 })))
  g.add(torus(12.4, 0.8, basket, { y: 10.6 }, PI))
  g.add(cyl(11.2, 11.2, 0.8, '#9fd38a', { y: 5.4 }))
  for (let i = 0; i < 10; i++) g.add(sprig(4, '#7cc47a', [Math.cos(i * 0.63) * 9.5, 6, Math.sin(i * 0.63) * 9.5], i * 0.63 + PI / 2, -1, 0.2))
  const cols = [eggA, eggB, C.lemon, C.lilac, C.mint, C.pink]
  ;([[-5, -3, 0.3], [0, 3, -0.2], [5, -2, 0.4], [-2, -6, 0], [3, 6.5, 0.2], [-6.5, 3, -0.3]] as V3[]).forEach(([x, z, rz], i) => {
    g.add(ball(2.3, cols[i], { x, y: 8.3, z, rz }, [1, 1.3, 1]))
    g.add(noOL(torus(2.3, 0.2, '#ffffff', { x, y: 8.3, z, rx: PI / 2 + rz })))
  })
  return g
}

/** 双层生日蛋糕：蛋糕架 + 两层奶油蛋糕 + 草莓 + 蜡烛（火苗用 fx） */
const CAKE_TOP = 7 + 9 + 8
const CAKE_CANDLES: V3[] = Array.from({ length: 5 }, (_, i): V3 => [Math.cos((i / 5) * PI * 2 + PI / 2) * 5, CAKE_TOP + 6, Math.sin((i / 5) * PI * 2 + PI / 2) * 5])
function cakeTier(p: string[]) {
  const [frost, deco, candle] = p
  const g = new THREE.Group()
  g.add(cyl(3, 6, 6, '#f4f4f2', {}, 20))
  g.add(cyl(16, 15, 1, '#f4f4f2', { y: 6 }, 32))
  g.add(cyl(13, 13, 9, frost, { y: 7 }, 32))
  g.add(cyl(8.5, 8.5, 8, frost, { y: 16 }, 32))
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2
    g.add(ball(1.3, i % 2 ? '#fffaf2' : deco, { x: Math.cos(a) * 12.4, y: 16, z: Math.sin(a) * 12.4 }))
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2
    g.add(ball(1, '#fffaf2', { x: Math.cos(a) * 8, y: CAKE_TOP, z: Math.sin(a) * 8 }))
  }
  g.add(noOL(cyl(13.05, 13.05, 1.2, deco, { y: 9 }, 32)))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    g.add(ball(1.5, '#e8414a', { x: Math.cos(a) * 2.3, y: CAKE_TOP + 1, z: Math.sin(a) * 2.3 }, [1, 1.2, 1]))
  }
  for (const [x, , z] of CAKE_CANDLES) {
    g.add(cyl(0.35, 0.35, 6, candle, { x, y: CAKE_TOP, z }, 8))
    g.add(lit(ball(0.45, FLAME, { x, y: CAKE_TOP + 6.6, z }, [1, 1.7, 1]), FLAME, 1))
  }
  return g
}
const CAKE_FX: Fx[] = CAKE_CANDLES.map(([x, y, z]) => ({ kind: 'flame', x, y: y + 0.6, z, scale: 0.35 }))

/** 气球束：小坠子 + 五只气球 */
function balloons(p: string[]) {
  const g = new THREE.Group()
  g.add(puck(4, 3, '#c3c7cc'))
  const cols = [p[0], p[1], p[2], p[0], p[1]]
  ;([[-15, 138, 0], [13, 150, -4], [0, 166, 5], [-7, 124, 11], [18, 126, 9]] as V3[]).forEach(([x, y, z], i) => {
    g.add(ball(13, cols[i], { x, y, z }, [1, 1.15, 1]))
    g.add(noOL(ball(2.6, '#ffffff', { x: x - 5, y: y + 6, z: z + 9.5 }, [0.6, 1, 0.3])))
    g.add(cyl(0, 1.3, 2.2, cols[i], { x, y: y - 16.6, z }, 8))
    g.add(tube([[0, 2.8, 0], [x * 0.3, (y - 16.6) * 0.45, z * 0.4 + 2], [x, y - 16.6, z]], 0.12, '#ffffff', 20, 4))
  })
  return g
}

/** 派对彩旗（壁挂）：下垂的绳上一串三角旗 */
function bunting(p: string[]) {
  const g = new THREE.Group()
  const yAt = (x: number) => 22 + 8 * (x / 75) ** 2
  const pts: V3[] = []
  for (let k = 0; k <= 10; k++) pts.push([-75 + k * 15, yAt(-75 + k * 15), 1])
  g.add(tube(pts, 0.25, '#f4efe4', 40, 5))
  for (const s of [-1, 1]) g.add(cyl(0.7, 0.7, 2, '#c3c7cc', { x: s * 75, y: 30, z: 0, rx: PI / 2 }, 8))
  for (let i = 0; i < 12; i++) {
    const x = -66 + i * 12
    const f = flat([[-5, 0], [5, 0], [0, -13]], 0.3, p[i % 3], 0.6)
    f.position.set(x, yAt(x) + 0.3, 0)
    f.rotation.z = Math.atan((16 * x) / 75 ** 2)
    g.add(f)
  }
  return g
}

// ======================================================================
// 季节家电
// ======================================================================

/** 风扇头：前后网罩 + 叶片 + 电机，中心在原点，正面朝 +z */
function fanHead(r: number, cage: string, blade: string, motor: string, nBlade = 5, spokes = 16) {
  const g = new THREE.Group()
  g.add(torus(r, 0.55, cage))
  for (const z of [3.6, -3.4]) {
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * PI * 2
      g.add(bar([Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16, z], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.12, cage, 4))
    }
    g.add(noOL(torus(r * 0.6, 0.12, cage, { z: z * 0.66 })))
  }
  g.add(cyl(r * 0.17, r * 0.17, 0.8, shade(cage, -0.1), { z: 3.4, rx: PI / 2 }, 20))
  g.add(cyl(r * 0.12, r * 0.12, 2.6, motor, { z: -1.2, rx: PI / 2 }, 16))
  for (let k = 0; k < nBlade; k++) {
    const a = (k / nBlade) * PI * 2
    const m = ball(r * 0.42, blade, {}, [0.62, 1, 0.12])
    m.position.set(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46, 0.4)
    m.rotation.set(0, 0.25, a - PI / 2)
    g.add(m)
  }
  g.add(capsule(r * 0.3, r * 0.35, motor, { y: 0, z: -3.6 - r * 0.32, rx: PI / 2 }))
  return g
}
/** 落地扇 */
function fanFloor(p: string[]) {
  const [body, blade, accent] = p
  const g = new THREE.Group()
  g.add(puck(16, 3.2, body))
  for (let k = 0; k < 4; k++) g.add(rbox(2.4, 0.8, 1.6, k ? shade(body, -0.15) : accent, { x: -4.5 + k * 3, y: 3, z: 10 }, 0.3))
  g.add(cyl(1.7, 1.7, 52, body, { y: 3 }, 12))
  g.add(cyl(1.2, 1.2, 26, M.silver, { y: 55 }, 10))
  g.add(ball(2.6, body, { y: 82 }))
  const h = fanHead(18, body, blade, body)
  h.position.set(0, 88, 3)
  g.add(h)
  return g
}
/** 台式风扇 */
function fanDesk(p: string[]) {
  const [body, blade, accent] = p
  const g = new THREE.Group()
  g.add(rbox(22, 5, 18, body, {}, 2.4))
  for (let k = 0; k < 3; k++) g.add(rbox(2.6, 0.8, 1.6, k ? shade(body, -0.15) : accent, { x: -3 + k * 3, y: 5, z: 5 }, 0.3))
  g.add(cyl(1.6, 2, 11, body, { y: 5, z: -2 }, 12))
  const h = fanHead(13, body, blade, body)
  h.position.set(0, 25.5, 1)
  g.add(h)
  return g
}
/** 循环扇：U 形支架 + 深筒形机头，网罩是一圈圈同心圆 */
function fanCirc(p: string[]) {
  const [body, blade, accent] = p
  const g = new THREE.Group()
  g.add(puck(11, 3, body))
  g.add(rbox(4, 0.8, 1.4, accent, { y: 3, z: 8 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(2, 16, 4, body, { x: s * 12.6, y: 2 }, 0.8))
  g.add(rbox(27.2, 2, 4, body, { y: 2 }, 0.8))
  const hy = 17
  const housing = lathe([[0, -6], [6, -5.8], [10, -3.5], [11.2, 0], [11.2, 3], [10.6, 3]], body, 28)
  housing.rotation.x = PI / 2
  housing.position.set(0, hy, -1)
  g.add(housing)
  for (let k = 1; k <= 5; k++) g.add(noOL(torus(k * 2, 0.22, shade(body, -0.12), { y: hy, z: 2.6 - (5 - k) * 0.25 })))
  g.add(cyl(2.2, 2.2, 0.8, accent, { y: hy, z: 2.2, rx: PI / 2 }, 16))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2
    const m = ball(4.5, blade, {}, [0.65, 1, 0.12])
    m.position.set(Math.cos(a) * 5, hy + Math.sin(a) * 5, 0)
    m.rotation.set(0, 0.3, a - PI / 2)
    g.add(m)
  }
  for (const s of [-1, 1]) g.add(cyl(1.4, 1.4, 1.6, accent, { x: s * 11.4, y: hy, rz: PI / 2 }, 12))
  return g
}
/** 塔扇：圆角立柱 + 竖格栅 + 顶部操作面板 */
function fanTower(p: string[]) {
  const [body, grille, accent] = p
  const g = new THREE.Group()
  g.add(puck(14, 3, shade(body, -0.06)))
  g.add(rbox(20, 82, 20, body, { y: 3 }, 4.5))
  g.add(noOL(rbox(12, 62, 0.4, shade(grille, -0.2), { y: 12, z: 10.05 }, 0.2)))
  for (let k = 0; k < 9; k++) g.add(rbox(0.6, 62, 0.6, grille, { x: -5 + k * 1.25, y: 12, z: 10.4 }, 0.2))
  g.add(noOL(rbox(14, 0.4, 10, M.black, { y: 85 }, 0.2)))
  g.add(glow(4, 1.4, accent, { y: 85.4, z: 1, rx: -PI / 2 }, 0.8))
  for (let k = 0; k < 3; k++) g.add(cyl(0.8, 0.8, 0.4, shade(body, -0.2), { x: -4 + k * 4, y: 85.3, z: -2.5 }, 10))
  return g
}
/** 复古台扇（昭和）：厚重底座 + 四片金属叶 */
function fanRetro(p: string[]) {
  const [body, blade, cage] = p
  const g = new THREE.Group()
  g.add(lathe([[0, 0], [11, 0], [11, 1.5], [9, 4], [5, 6.2], [0, 6.4]], body, 28))
  for (let k = 0; k < 3; k++) g.add(rbox(2, 1.2, 1.6, '#f4efe4', { x: -3 + k * 3, y: 4.2, z: 6.6, rx: -0.5 }, 0.3))
  g.add(cyl(1.4, 2, 13, body, { y: 6 }, 12))
  const h = fanHead(14, cage, blade, body, 4, 12)
  h.position.set(0, 29, 1)
  g.add(h)
  return g
}

/** 陶瓷暖风机：小方盒 + 发光格栅 */
function ceramicHeater(p: string[]) {
  const [body, grille, accent] = p
  const g = new THREE.Group()
  g.add(rbox(20, 30, 16, body, { y: 0.8 }, 3))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1, 1, 0.8, M.char, { x: sx * 7, z: sz * 5 }, 8))
  g.add(glow(14, 15, EMBER, { y: 9, z: 7.9 }, 0.65))
  for (let k = 0; k < 7; k++) g.add(rbox(15.5, 0.9, 0.9, grille, { y: 8.6 + k * 2.4, z: 8.4 }, 0.3))
  g.add(noOL(rbox(10, 1.6, 0.4, M.char, { y: 26, z: 8.05 }, 0.2)))
  g.add(cyl(1.2, 1.2, 1.2, accent, { x: 5, y: 30.8, z: 3 }, 12))
  g.add(lit(ball(0.4, '#ff6a4a', { x: -6, y: 26.8, z: 8.3 }), '#ff6a4a', 1))
  g.add(noOL(rbox(9, 0.4, 3, shade(body, -0.25), { y: 30.62, z: -3 }, 0.2)))
  return g
}

/** 石油暖炉（对流式）：圆筒 + 发光燃烧窗 + 顶板上的水壶（壶嘴冒热气） */
const KETTLE_SPOUT: V3 = [13, 59, 0]
function keroseneConv(p: string[]) {
  const [body, top, kettle] = p
  const g = new THREE.Group()
  g.add(cyl(22, 22.5, 5, shade(body, -0.25), {}, 32))
  g.add(cyl(21, 21, 42, body, { y: 5 }, 32))
  const win = new THREE.Mesh(new THREE.CylinderGeometry(21.15, 21.15, 13, 12, 1, true, -0.4, 0.8), toon(EMBER, { emissive: 0.8 }))
  win.position.y = 26.5
  win.userData.noOutline = true
  g.add(win)
  for (let k = 0; k < 6; k++) {
    const a = -0.36 + (k / 5) * 0.72
    g.add(bar([Math.sin(a) * 21.6, 20, Math.cos(a) * 21.6], [Math.sin(a) * 21.6, 33, Math.cos(a) * 21.6], 0.25, M.silver, 6))
  }
  g.add(torus(21.3, 0.5, M.silver, { y: 33.3, rx: PI / 2 }))
  g.add(torus(21.3, 0.5, M.silver, { y: 19.7, rx: PI / 2 }))
  g.add(cyl(1.8, 1.8, 1.6, M.char, { x: 9, y: 10, z: 21.1, rx: PI / 2 }, 14))
  g.add(noOL(rbox(4, 2, 0.5, '#f4f4f2', { x: -8, y: 9.5, z: 20.7 }, 0.2)))
  g.add(cyl(23, 23, 1.6, top, { y: 47 }, 32))
  for (let k = 0; k < 3; k++) g.add(bar([Math.cos(k * 2.1) * 22, 47, Math.sin(k * 2.1) * 22], [Math.cos(k * 2.1) * 22.4, 42, Math.sin(k * 2.1) * 22.4], 0.4, top))
  // 水壶
  const ky = 48.6
  g.add(lathe([[0, 0], [8, 0], [9.6, 3], [9.2, 6], [6.2, 8.6], [3, 9.2], [0, 9.2]], kettle, 28).translateY(ky))
  g.add(cyl(1.6, 2.2, 1.4, shade(kettle, -0.15), { y: ky + 9.2 }, 12))
  const spout = cyl(0.7, 1.4, 8, kettle, {}, 10)
  spout.position.set(9.9, ky + 7.6, 0)
  spout.rotation.z = -0.9
  g.add(spout)
  g.add(torus(7, 0.55, shade(kettle, -0.25), { y: ky + 9.6 }, PI))
  return g
}
const KERO_FX: Fx[] = [{ kind: 'steam', x: KETTLE_SPOUT[0], y: KETTLE_SPOUT[1], z: 0, scale: 0.7, height: 25 }]

/** 石油暖风机（风扇式）：方盒 + 下部发光出风口 + 顶部液晶面板 */
function keroseneFan(p: string[]) {
  const [body, panel, accent] = p
  const g = new THREE.Group()
  g.add(rbox(44, 42, 30, body, {}, 3))
  g.add(noOL(rbox(34, 12, 0.4, '#3a2a2a', { y: 4, z: 15.05 }, 0.3)))
  g.add(glow(30, 9, EMBER, { y: 5.5, z: 15.1 }, 0.6))
  for (let k = 0; k < 4; k++) g.add(rbox(34, 0.8, 1.2, shade(body, -0.18), { y: 5 + k * 2.6, z: 15.6, rx: 0.4 }, 0.3))
  g.add(rbox(32, 1, 12, panel, { y: 42, z: 5 }, 0.4))
  g.add(glow(8, 2.6, '#9fe3b0', { x: -6, y: 43.1, z: 6, rx: -PI / 2 }, 0.7))
  for (let k = 0; k < 3; k++) g.add(cyl(1.1, 1.1, 0.6, k ? M.silver : accent, { x: 4 + k * 4.2, y: 43, z: 6 }, 12))
  g.add(noOL(rbox(16, 0.4, 4, shade(body, -0.3), { y: 41.82, z: -9 }, 0.2)))
  return g
}

/** 电热地毯：薄垫 + 花纹 + 角上的控制器 */
function hotCarpet(W: number, D: number): Build {
  return (p) => {
    const [main, line, ctrl] = p
    const g = new THREE.Group()
    g.add(rbox(W, 1.2, D, main, {}, 0.5))
    const t = 0.3
    for (const s of [-1, 1]) {
      g.add(noOL(rbox(W - 16, t, 2.4, line, { y: 1.2, z: s * (D / 2 - 9) }, 0.1)))
      g.add(noOL(rbox(2.4, t, D - 16, line, { x: s * (W / 2 - 9), y: 1.2 }, 0.1)))
    }
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) g.add(noOL(rbox(16, t, 16, shade(main, -0.08), { x: i * (W / 4), y: 1.2, z: k * (D / 4), ry: PI / 4 }, 0.1)))
    g.add(rbox(12, 3, 7, ctrl, { x: W / 2 - 12, y: 1.2, z: D / 2 - 8 }, 1))
    g.add(lit(ball(0.5, '#ff6a4a', { x: W / 2 - 15, y: 4.2, z: D / 2 - 6 }), '#ff6a4a', 1))
    g.add(cyl(1.2, 1.2, 0.5, shade(ctrl, -0.2), { x: W / 2 - 10, y: 4.2, z: D / 2 - 8 }, 12))
    return g
  }
}

/** 长方形被炉：敷布团 + 被子 + 天板（天板是台面，可以摆东西） */
const KR = { mat: [200, 170] as [number, number], quilt: [150, 120] as [number, number], topW: 105, topD: 75, topY: 38, topT: 3 }
function kotatsuRect(p: string[]) {
  const [quilt, wood, mat] = p
  const g = new THREE.Group()
  g.add(rbox(KR.mat[0], 2, KR.mat[1], mat, {}, 0.9))
  g.add(rbox(KR.quilt[0] + 26, 5, KR.quilt[1] + 26, shade(quilt, -0.06), { y: 2 }, 2.4))
  g.add(rbox(KR.quilt[0], KR.topY - 2, KR.quilt[1], quilt, { y: 2 }, 14))
  for (const s of [-1, 1]) {
    g.add(noOL(rbox(KR.quilt[0] - 30, 0.4, 0.3, shade(quilt, -0.15), { y: 22, z: s * (KR.quilt[1] / 2 + 0.1) }, 0.1)))
    g.add(noOL(rbox(0.3, 0.4, KR.quilt[1] - 30, shade(quilt, -0.15), { x: s * (KR.quilt[0] / 2 + 0.1), y: 22 }, 0.1)))
  }
  g.add(rbox(KR.topW, KR.topT, KR.topD, wood, { y: KR.topY }, 0.8))
  return g
}

/** 叠好的被炉被：两层叠起的被子 + 底下的薄垫 */
function futonFolded(p: string[]) {
  const [quilt, accent, mat] = p
  const g = new THREE.Group()
  g.add(rbox(84, 6, 58, mat, {}, 2.4))
  g.add(rbox(80, 10, 55, quilt, { y: 6 }, 4.5))
  g.add(rbox(80, 10, 55, shade(quilt, 0.04), { y: 15.6, x: 1 }, 4.5))
  for (const y of [10.5, 20.1]) g.add(noOL(rbox(80.4, 1.2, 4, accent, { y, z: 18 }, 0.4)))
  return g
}

/** 加湿器（落地塔式）：底座 + 透明水箱 + 顶盖出雾口 */
function humidifierTower(p: string[]) {
  const [body, tank, accent] = p
  const g = new THREE.Group()
  g.add(cyl(12, 12.5, 26, body, {}, 32))
  g.add(clear(cup(11.8, 11.8, 22, 0.6, tank, { y: 26 }), tank, 0.35))
  g.add(clear(cyl(11, 11, 14, '#9fd0ee', { y: 26.6 }, 28), '#9fd0ee', 0.45))
  g.add(cyl(12, 12, 3, body, { y: 48 }, 32))
  g.add(cyl(3, 3.6, 3, shade(body, -0.12), { y: 51 }, 16))
  g.add(glow(6, 2, accent, { y: 17, z: 12.4 }, 0.8))
  for (let k = 0; k < 2; k++) g.add(cyl(0.8, 0.8, 0.8, M.char, { x: -2 + k * 4, y: 12, z: 12.1, rx: PI / 2 }, 10))
  return g
}
/** 蒸汽式加湿器（电水壶型） */
function humidifierSteam(p: string[]) {
  const [body, lid, accent] = p
  const g = new THREE.Group()
  g.add(cyl(10, 11, 22, body, {}, 32))
  g.add(puck(10, 4, lid, { y: 20 }))
  g.add(cyl(2.4, 2.4, 1.4, shade(lid, -0.15), { y: 23.6 }, 16))
  g.add(torus(6.5, 0.7, shade(lid, -0.1), { y: 24, rx: 0 }, PI))
  g.add(noOL(rbox(3, 10, 0.4, '#9fd0ee', { y: 6, z: 10.4, rx: -0.045 }, 0.2)))
  g.add(glow(3, 1.2, accent, { y: 3, z: 10.9, rx: -0.045 }, 0.9))
  return g
}

/** 手持挂烫机（立着放） */
function steamerHand(p: string[]) {
  const [body, tank, accent] = p
  const g = new THREE.Group()
  g.add(clear(cup(4.6, 4.8, 9, 0.5, tank), tank, 0.4))
  g.add(clear(cyl(4, 4, 5, '#9fd0ee', { y: 0.5 }, 20), '#9fd0ee', 0.5))
  g.add(cyl(4.8, 4.8, 1.2, body, { y: 9 }, 20))
  g.add(capsule(3, 8, body, { y: 9 }))
  g.add(rbox(10, 7, 10, body, { y: 18, z: 1.5 }, 3))
  g.add(rbox(9, 6.4, 0.8, M.silver, { y: 18.3, z: 6.6 }, 0.6))
  for (let i = -1; i <= 1; i++) for (let k = 0; k < 2; k++) g.add(noOL(cyl(0.4, 0.4, 0.3, M.char, { x: i * 2.4, y: 20 + k * 2.4, z: 7.05, rx: PI / 2 }, 8)))
  g.add(rbox(1.8, 3, 1, accent, { y: 13, z: 2.6 }, 0.4))
  return g
}

/** 竹帘 / 苇帘（壁挂）：条纹画面 + 两侧布边 + 顶部压条 */
function sudare(w: number, h: number, reed: boolean): Build {
  return (p) => {
    const [bam, tape, cord] = p
    const g = new THREE.Group()
    g.add(rbox(w, h, 0.5, shade(bam, -0.12), { z: -0.25 }, 0.2))
    g.add(
      paintPanel(w, h, `sudare|${bam}|${cord}|${reed}`, (c, W, H) => {
        c.fillStyle = bam
        c.fillRect(0, 0, W, H)
        const step = Math.max(2, H / (reed ? 220 : 130))
        for (let y = 0; y < H; y += step) {
          c.fillStyle = shade(bam, (Math.sin(y * 7.3) * 0.5 + 0.5) * -0.12 - 0.03)
          c.fillRect(0, y, W, Math.max(1, step * 0.35))
        }
        c.fillStyle = cord
        for (let k = 1; k < 6; k++) c.fillRect((W * k) / 6 - 1, 0, Math.max(2, W * 0.006), H)
      }, { z: 0.06 }),
    )
    for (const s of [-1, 1]) g.add(rbox(2.4, h, 1, tape, { x: s * (w / 2 - 1.2), z: -0.2 }, 0.3))
    g.add(rbox(w + 1, 3.6, 1.6, tape, { y: h - 3.6, z: -0.3 }, 0.4))
    const bot = cyl(0.8, 0.8, w - 1, shade(bam, -0.1), {}, 10)
    bot.rotation.z = PI / 2
    bot.position.set(0, 0.8, 0.2)
    g.add(bot)
    for (const s of [-1, 1]) {
      g.add(torus(1.2, 0.2, '#b8bcc2', { x: s * w * 0.3, y: h + 0.9, z: -0.1 }))
      g.add(tube([[s * w * 0.3, h - 1, 0.6], [s * w * 0.3, h * 0.6, 0.7], [s * w * 0.3, h * 0.45, 0.7]], 0.22, cord, 8, 5))
      g.add(ball(0.7, cord, { x: s * w * 0.3, y: h * 0.45, z: 0.7 }))
    }
    return g
  }
}

/** 立式苇帘（葦簀）：斜靠在墙上的大苇帘 */
function yoshizu(p: string[]) {
  const [reed, rope] = p
  const w = 180
  const h = 200
  const pg = new THREE.Group()
  pg.add(rbox(w, h, 0.8, shade(reed, -0.15), { z: -0.4 }, 0.2))
  pg.add(
    paintPanel(w, h, `yoshizu|${reed}|${rope}`, (c, W, H) => {
      c.fillStyle = reed
      c.fillRect(0, 0, W, H)
      for (let x = 0; x < W; x += 3) {
        c.fillStyle = shade(reed, (Math.sin(x * 3.1) * 0.5 + 0.5) * -0.14)
        c.fillRect(x, 0, 1.5, H)
      }
      c.fillStyle = rope
      for (let k = 1; k < 6; k++) c.fillRect(0, (H * k) / 6, W, Math.max(2, H * 0.006))
    }, { z: 0.05 }),
  )
  for (const y of [1, h - 1]) {
    // 压条比帘子长 0.6cm，端面不和帘子侧面共面
    const b = cyl(1, 1, w + 0.6, shade(reed, -0.2), {}, 8)
    b.rotation.z = PI / 2
    b.position.set(0, y, 0.6)
    pg.add(b)
  }
  pg.rotation.x = -0.2
  return G(pg)
}

// ======================================================================
// 墙面装饰
// ======================================================================

type Painter = (g: CanvasRenderingContext2D, W: number, H: number) => void
const KANJI_NUM = ['十二', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一']
const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']

/** 表盘画面：刻度 + 数字 */
function dialDraw(bg: string, ink: string, kind: 'ticks' | 'arabic' | 'roman' | 'kanji'): Painter {
  return (c, W) => {
    const R = W / 2
    c.fillStyle = bg
    c.fillRect(0, 0, W, W)
    c.strokeStyle = ink
    c.fillStyle = ink
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * PI * 2
      const big = k % 5 === 0
      const r0 = R * (big ? 0.8 : 0.86)
      c.lineWidth = Math.max(1, R * (big ? 0.035 : 0.012))
      c.beginPath()
      c.moveTo(R + Math.sin(a) * r0, R - Math.cos(a) * r0)
      c.lineTo(R + Math.sin(a) * R * 0.92, R - Math.cos(a) * R * 0.92)
      c.stroke()
    }
    if (kind === 'ticks') return
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2
      const label = kind === 'arabic' ? String(k || 12) : kind === 'roman' ? ROMAN[k] : KANJI_NUM[k]
      c.font = `bold ${Math.round(R * (kind === 'arabic' ? 0.2 : label.length > 2 ? 0.11 : 0.14))}px serif`
      c.fillText(label, R + Math.sin(a) * R * 0.64, R - Math.cos(a) * R * 0.64)
    }
  }
}
/** 时针分针：中心 (x, y)，表盘面在 z */
function clockHands(x: number, y: number, z: number, len: number, color: string, sec?: string) {
  const g = new THREE.Group()
  const hand = (l: number, w: number, a: number, dz: number, c: string) => {
    const hg = G(noOL(rbox(w, l, 0.3, c, { y: -l * 0.15 }, Math.min(0.15, w / 2 - 0.01))))
    hg.position.set(x, y, z + dz)
    hg.rotation.z = a
    return hg
  }
  g.add(hand(len * 0.6, len * 0.09, PI / 3, 0.2, color), hand(len * 0.9, len * 0.06, -PI * 0.7, 0.55, color))
  if (sec) g.add(hand(len * 0.95, len * 0.02, PI * 0.85, 0.9, sec))
  g.add(cyl(len * 0.07, len * 0.07, 1.2, color, { x, y, z: z + 0.05, rx: PI / 2 }, 12))
  return g
}

/** 鸽子钟（咕咕钟）：小木屋 + 表盘 + 钟摆 + 松果砣 */
function cuckooClock(p: string[]) {
  const [wood, roof, dial] = p
  const g = new THREE.Group()
  const by = 40
  g.add(rbox(24, 26, 12, wood, { y: by }, 0.8))
  for (const s of [-1, 1]) g.add(rbox(15, 1.6, 15, roof, { x: s * 6.2, y: by + 26 + 3.1, rz: -s * 0.55 }, 0.4))
  g.add(flat([[-11.5, 0], [11.5, 0], [0, 6.8]], 0.6, shade(wood, 0.06), 5.4).translateY(by + 26))
  g.add(rbox(5, 5.4, 0.6, shade(wood, -0.25), { y: by + 19, z: 6 }, 0.3))
  g.add(ball(1.5, C.lemon, { y: by + 21.6, z: 7.2 }))
  g.add(cyl(0, 0.5, 1.2, C.orange, { y: by + 21.6, z: 8.6, rx: PI / 2 }, 8))
  g.add(torus(6.6, 0.5, BRASS, { y: by + 10, z: 6.2 }))
  g.add(paintDisc(6.3, `cuckoo|${dial}`, dialDraw(dial, SUMI, 'roman'), 0, by + 10, 6.1))
  g.add(clockHands(0, by + 10, 6.2, 5.6, SUMI))
  for (let k = 0; k < 6; k++) {
    const a = PI * 0.15 + (k / 5) * PI * 0.7
    g.add(sprig(6, roof, [Math.cos(a) * 7.5 * (k % 2 ? 1 : -1) * 0 + Math.cos(a) * 7.5, by + 26 + 6 + Math.sin(a) * 1.5, 6.2], a > PI / 2 ? -PI / 2 : PI / 2, -0.5, 0.45))
  }
  g.add(ball(2, shade(roof, -0.1), { y: by + 33.5, z: 2 }, [1.4, 0.9, 0.9]))
  g.add(bar([0, by, 4.5], [0, 15, 4.5], 0.25, BRASS))
  g.add(ball(3.6, roof, { y: 13, z: 4.5 }, [0.8, 1, 0.2]))
  for (const s of [-1, 1]) {
    g.add(bar([s * 4.5, by, 2.5], [s * 4.5, by - 26 + s * 4, 2.5], 0.12, '#5a4a3a', 4))
    const py = by - 30 + s * 4
    g.add(ball(2.2, '#7a4a2a', { x: s * 4.5, y: py, z: 2.5 }, [1, 1.9, 1]))
    g.add(cyl(0.8, 1.2, 1, '#5a4a3a', { x: s * 4.5, y: py + 3.9, z: 2.5 }, 8))
  }
  return g
}

/** 电子挂钟：黑面板 + 发光数字 */
function digitalClock(p: string[]) {
  const [body, digit, sub] = p
  const g = new THREE.Group()
  g.add(rbox(40, 18, 2.5, body, {}, 1.4))
  g.add(
    paintPanel(35, 13, `digi|${body}|${digit}|${sub}`, (c, W, H) => {
      c.fillStyle = shade(body, -0.06)
      c.fillRect(0, 0, W, H)
      c.fillStyle = digit
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `bold ${Math.round(H * 0.62)}px monospace`
      c.fillText('10:24', W * 0.44, H * 0.44)
      c.fillStyle = sub
      c.font = `${Math.round(H * 0.16)}px sans-serif`
      c.fillText('2026 10.16 FRI   23°C 48%', W * 0.5, H * 0.86)
    }, { y: 2.5, z: 1.27 }, 0.6),
  )
  return g
}

/** 和风挂钟：方形桧木框 + 汉数字圆表盘 */
function waClock(p: string[]) {
  const [wood, dial, ink] = p
  const g = new THREE.Group()
  g.add(rbox(30, 30, 4, wood, {}, 1))
  g.add(noOL(rbox(27, 27, 0.4, shade(wood, -0.1), { y: 1.5, z: 1.9 }, 0.3)))
  g.add(torus(12.3, 0.5, shade(wood, -0.25), { y: 15, z: 2.3 }))
  g.add(paintDisc(12, `wa|${dial}|${ink}`, dialDraw(dial, ink, 'kanji'), 0, 15, 2.2))
  g.add(clockHands(0, 15, 2.3, 10, ink))
  return g
}

/** 学校挂钟：大圆白框 + 阿拉伯数字 + 红秒针 */
function schoolClock(p: string[]) {
  const [rim, dial, sec] = p
  const g = new THREE.Group()
  g.add(puck(20, 3.5, shade(rim, -0.05), { y: 20, z: -1.75, rx: PI / 2 }))
  g.add(torus(20, 1.7, rim, { y: 21.7, z: 0.8 }))
  g.add(paintDisc(19, `school|${dial}`, dialDraw(dial, SUMI, 'arabic'), 0, 21.7, 1.82))
  g.add(clockHands(0, 21.7, 1.9, 16, SUMI, sec))
  return g
}

/** 柱时计（昭和摆钟）：木壳 + 上面的表盘 + 下面玻璃门里的钟摆 */
function pendulumClock(p: string[]) {
  const [wood, dial, metal] = p
  const g = new THREE.Group()
  g.add(shell(30, 62, 12, 1.2, wood, { front: [{ kind: 'rect', x: 0, y: 4, w: 22, h: 30, r: 1 }] }))
  g.add(noOL(rbox(27.4, 59, 0.3, shade(wood, -0.3), { y: 1.5, z: -4.6 }, 0.1)))
  g.add(rbox(33, 3, 14, shade(wood, -0.12), { y: 62 }, 0.6))
  g.add(flat([[-13, 0], [13, 0], [0, 6]], 1.4, wood, -0.7).translateY(65))
  g.add(rbox(32, 2.4, 13.5, shade(wood, -0.12), { y: -2.4 }, 0.6))
  g.add(torus(10.3, 0.7, metal, { y: 48, z: 6.4 }))
  g.add(paintDisc(10, `hashira|${dial}`, dialDraw(dial, SUMI, 'roman'), 0, 48, 6.15))
  g.add(clockHands(0, 48, 6.2, 8.5, SUMI))
  g.add(clear(rbox(23, 31, 0.3, '#cfeeff', { y: 3.5, z: 5.4 }, 0.1), '#cfeeff', 0.3))
  g.add(rbox(2, 1.2, 5.4, metal, { y: 34.6, z: -2.3 }, 0.2))
  g.add(bar([0, 35, 0], [0, 13, 0], 0.3, metal))
  g.add(disc(3.6, metal, 0, 11, 0.8, 0.8))
  for (const s of [-1, 1]) g.add(noOL(cyl(0.6, 0.6, 0.5, metal, { x: s * 4, y: 44, z: 6.15, rx: PI / 2 }, 10)))
  return g
}

/** 无框画布（大幅风景） */
function canvasXL(p: string[]) {
  const [sky, hill, sun] = p
  return G(rbox(120, 80, 3.5, '#f4f1ea', {}, 0.3), paintPanel(119.6, 79.6, `canvasxl|${sky}|${hill}|${sun}`, paintLandscape(sky, hill, sun), { y: 0.2, z: 1.78 }))
}
/** 三联画：一幅抽象画分在三块画布上 */
function triptych(p: string[]) {
  const [ground, a, line] = p
  const g = new THREE.Group()
  const full = paintAbstract(ground, a, line)
  for (let i = 0; i < 3; i++) {
    const part: Painter = (c, W, H) => {
      c.save()
      c.translate(-i * W, 0)
      full(c, W * 3, H)
      c.restore()
    }
    const x = (i - 1) * 44
    g.add(rbox(40, 60, 3, shade(ground, -0.08), { x }, 0.3))
    g.add(paintPanel(39.6, 59.6, `trip|${ground}|${a}|${line}|${i}`, part, { x, y: 0.2, z: 1.53 }))
  }
  return g
}
const artSquare: Build = (p) => frame(40, 40, 3, 2.6, p[0], `sq|${p.join()}`, paintFlower(p[1], p[2], GOLD), '#fbf8f0')
const artTall: Build = (p) => frame(50, 70, 1.6, 2.2, p[0], `tall|${p.join()}`, paintAbstract(p[1], p[2], shade(p[0], -0.1)))
function artMiniSet(p: string[]) {
  const [fr, a, b] = p
  const g = new THREE.Group()
  const draws: Painter[] = [paintLandscape(shade(b, 0.3), a, C.lemon), paintFlower(shade(a, 0.35), b, GOLD), paintAbstract('#fbf8f0', a, b)]
  draws.forEach((d, i) => {
    const f = frame(20, 25, 1.6, 2, fr, `mini|${p.join()}|${i}`, d, '#fbf8f0')
    f.position.set((i - 1) * 25, i === 1 ? 4 : 0, 0)
    g.add(f)
  })
  return g
}
/** 照片墙：大小不一的七个相框 */
function photoWall(p: string[]) {
  const [fr, a, b] = p
  const g = new THREE.Group()
  const L: [number, number, number, number][] = [
    [30, 40, -42, 30],
    [40, 30, -3, 44],
    [24, 30, 32, 44],
    [24, 24, 54, 14],
    [40, 30, 5, 5],
    [24, 30, -42, -5],
    [20, 20, 30, 0],
  ]
  const skies = ['#bfe3ff', '#ffd9b8', '#d7ecd0', '#f4d6e6', '#c9d4f0', '#fff1c4', '#d8f0ec']
  L.forEach(([w, h, x, y], i) => {
    const d = i % 3 === 0 ? paintLandscape(skies[i], i % 2 ? a : b, '#ffffff') : i % 3 === 1 ? paintFlower(skies[i], i % 2 ? a : b, GOLD) : paintAbstract(skies[i], a, b)
    const f = frame(w, h, 1.6, 2, i % 2 ? fr : shade(fr, 0.1), `pw|${p.join()}|${i}`, d, i % 2 ? '#fbf8f0' : undefined)
    f.position.set(x, y, 0)
    g.add(f)
  })
  return g
}

/** 挂毯：木杆 + 织物（几何花纹）+ 流苏 */
function tapestry(p: string[]) {
  const [ground, a, b] = p
  const g = new THREE.Group()
  const w = 60
  const h = 82
  const fy = 12
  g.add(rbox(w, h, 0.3, shade(ground, -0.08), { y: fy, z: -0.2 }, 0.1))
  g.add(
    paintPanel(w, h, `tap|${p.join()}`, (c, W, H) => {
      c.fillStyle = ground
      c.fillRect(0, 0, W, H)
      const band = (y: number, hh: number, col: string) => {
        c.fillStyle = col
        c.fillRect(0, y * H, W, hh * H)
      }
      band(0.08, 0.04, a)
      band(0.88, 0.04, a)
      band(0.14, 0.015, b)
      band(0.84, 0.015, b)
      c.fillStyle = b
      for (let k = 0; k < 3; k++) {
        const cy = H * (0.3 + k * 0.2)
        c.beginPath()
        c.moveTo(W * 0.5, cy - H * 0.08)
        c.lineTo(W * 0.72, cy)
        c.lineTo(W * 0.5, cy + H * 0.08)
        c.lineTo(W * 0.28, cy)
        c.closePath()
        c.fill()
      }
      c.fillStyle = a
      for (let k = 0; k < 3; k++) {
        c.beginPath()
        c.arc(W * 0.5, H * (0.3 + k * 0.2), W * 0.05, 0, PI * 2)
        c.fill()
      }
      for (let k = 0; k < 8; k++) {
        c.fillStyle = k % 2 ? a : b
        c.fillRect(W * (0.06 + k * 0.115), H * 0.2, W * 0.05, H * 0.025)
        c.fillRect(W * (0.06 + k * 0.115), H * 0.775, W * 0.05, H * 0.025)
      }
    }, { y: fy, z: 0 }),
  )
  for (let k = 0; k < 20; k++) g.add(cyl(0.25, 0.25, 11, k % 2 ? ground : a, { x: -w / 2 + 1.5 + k * ((w - 3) / 19), y: fy - 10.5, z: -0.1 }, 5))
  const rod = cyl(1, 1, w + 8, '#a8743f', {}, 12)
  rod.rotation.z = PI / 2
  rod.position.set(0, fy + h + 0.6, 0.6)
  g.add(rod)
  for (const s of [-1, 1]) g.add(ball(1.4, '#8a5a30', { x: s * (w / 2 + 4.6), y: fy + h + 0.6, z: 0.6 }))
  g.add(tube([[-w / 2 - 2, fy + h + 1, 0.6], [0, fy + h + 16, 0.3], [w / 2 + 2, fy + h + 1, 0.6]], 0.2, '#e8dcc0', 16, 4))
  return g
}

/** 马克拉美编织挂毯：木杆 + 菱形结编 + 流苏 */
function macrame(p: string[]) {
  const [cord, rodC, bead] = p
  const g = new THREE.Group()
  const top = 75
  const rod = cyl(1.1, 1.1, 64, rodC, {}, 12)
  rod.rotation.z = PI / 2
  rod.position.set(0, top, 1)
  g.add(rod)
  g.add(tube([[-30, top + 0.5, 1], [0, top + 14, 0.6], [30, top + 0.5, 1]], 0.25, cord, 16, 4))
  const n = 12
  const xs = Array.from({ length: n }, (_, i) => -27.5 + i * 5)
  const rows = 7
  let prev: V3[] = xs.map((x) => [x, top - 1, 1.6])
  for (let r = 0; r < rows; r++) {
    const y = top - 6 - r * 6
    const shrink = 1 - Math.abs(r - 3) * 0.12
    const cur: V3[] = xs.map((x, i): V3 => [x * shrink + (r % 2 ? (i % 2 ? -1.2 : 1.2) : 0), y, 1.6])
    cur.forEach((pt, i) => {
      g.add(bar(prev[i], pt, 0.35, cord, 5))
      if (i % 2 === r % 2) g.add(ball(1.05, r === 3 && i % 4 === 1 ? bead : cord, { x: pt[0], y: pt[1], z: pt[2] }))
    })
    prev = cur
  }
  prev.forEach((pt, i) => g.add(bar(pt, [pt[0] * 1.05, pt[1] - 18 - (i % 3) * 3 - Math.abs(i - 5.5) * -1.2, 1.6], 0.4, cord, 5)))
  return g
}

/** 双层壁挂层板（梯形侧板夹两块板），上下两层都能摆东西 */
const SHELF2 = { mount: 120, w: 80, d: 20, t: 2.5, gap: 30 }
function shelf2(p: string[]) {
  const [board, side] = p
  const g = new THREE.Group()
  g.add(rbox(SHELF2.w, SHELF2.t, SHELF2.d, board, {}, 0.5))
  g.add(rbox(SHELF2.w, SHELF2.t, SHELF2.d, board, { y: SHELF2.gap }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(2, SHELF2.gap + SHELF2.t, SHELF2.d, side, { x: s * (SHELF2.w / 2 + 1) }, 0.5))
  g.add(rbox(SHELF2.w, 4, 1, side, { y: SHELF2.t, z: -SHELF2.d / 2 + 0.5 }, 0.3))
  return g
}
/** 壁挂格子架：三个空心格子 */
const CUBE = { mount: 110, w: 90, h: 30, d: 22, t: 2 }
function cubeShelf(p: string[]) {
  const [main, back] = p
  const g = new THREE.Group()
  const { w, h, d, t } = CUBE
  g.add(rbox(w, t, d, main, {}, 0.4))
  g.add(rbox(w, t, d, main, { y: h - t }, 0.4))
  for (const x of [-w / 2 + t / 2, -w / 6, w / 6, w / 2 - t / 2]) g.add(rbox(t, h - t * 2, d, main, { x, y: t }, 0.3))
  g.add(rbox(w - t * 2, h - t * 2, 1, back, { y: t, z: -d / 2 + 0.5 }, 0.2))
  return g
}
const cubeCells = () => {
  const { w, d, t } = CUBE
  const cw = (w - t * 4) / 3
  return [0, 1, 2].map((i) => {
    const x0 = -w / 2 + t + i * (cw + t)
    return [rectPoly(x0 + 0.5, -d / 2 + 1.5, x0 + cw - 0.5, d / 2 - 0.5)]
  })
}
/** 隐形层板：一整块厚板 */
const FLOAT = { mount: 120, w: 120, d: 22, t: 4 }
function floatShelf(p: string[]) {
  const g = G(rbox(FLOAT.w, FLOAT.t, FLOAT.d, p[0], {}, 0.6))
  g.add(noOL(rbox(FLOAT.w - 0.2, 0.3, FLOAT.d - 0.2, p[1], { y: FLOAT.t - 0.2 }, 0.05)))
  return g
}

/** 软木板：木框 + 软木画面 + 便签 + 图钉 */
function corkboard(p: string[]) {
  const [fr, noteA, noteB] = p
  const t = 2.2
  const g = frame(60, 45, 2.5, t, fr, `cork|${fr}`, (c, W, H) => {
    c.fillStyle = '#c99a62'
    c.fillRect(0, 0, W, H)
    const rand = rng(31)
    for (let i = 0; i < W * H * 0.004; i++) {
      c.fillStyle = rand() > 0.5 ? '#b5864f' : '#dcae78'
      c.fillRect(rand() * W, rand() * H, 2, 2)
    }
  })
  const z = -t + 0.7 + t / 2
  const notes: [number, number, number, number, number, string][] = [
    [-17, 22, 10, 10, 0.1, noteA],
    [-3, 25, 12, 9, -0.08, '#ffffff'],
    [14, 21, 9, 12, 0.12, noteB],
    [-15, 7, 13, 10, -0.05, noteB],
    [5, 6, 10, 10, 0.06, noteA],
    [20, 6, 8, 8, -0.15, '#bfe3ff'],
  ]
  for (const [x, y, w, h, rz, col] of notes) {
    g.add(noOL(rbox(w, h, 0.2, col, { x, y, z: z + 0.15, rz }, 0.05)))
    g.add(ball(0.55, [J.shu, '#3d6fb5', '#5f9e4f'][Math.abs(Math.round(x)) % 3], { x, y: y + h - 1.4, z: z + 0.7 }))
  }
  return g
}
/** 字母留言板：毛毡条纹面 + 白色字母 */
function letterboard(p: string[]) {
  const [fr, felt, letter] = p
  return frame(45, 32, 2, 2.4, fr, `letter|${p.join()}`, (c, W, H) => {
    c.fillStyle = felt
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(felt, -0.08)
    for (let y = 0; y < H; y += Math.max(3, H / 40)) c.fillRect(0, y, W, 1)
    c.fillStyle = letter
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `bold ${Math.round(H * 0.18)}px sans-serif`
    c.fillText('HELLO', W / 2, H * 0.32)
    c.fillText('HOME SWEET', W / 2, H * 0.56)
    c.font = `bold ${Math.round(H * 0.12)}px sans-serif`
    c.fillText('♥ 2026 ♥', W / 2, H * 0.78)
  })
}
/** 网格照片墙：铁网 + 夹子夹着几张照片 */
function wireGrid(p: string[]) {
  const [wire, clip, photo] = p
  const g = new THREE.Group()
  const S0 = 60
  for (let k = 0; k <= 10; k++) {
    const v = -S0 / 2 + k * 6
    const r = k % 10 === 0 ? 0.45 : 0.22
    g.add(bar([v, 0, 0.5], [v, S0, 0.5], r, wire, 6))
    g.add(bar([-S0 / 2, v + S0 / 2, 0.9], [S0 / 2, v + S0 / 2, 0.9], r, wire, 6))
  }
  const shots: [number, number, number, number, number][] = [
    [-15, 40, 14, 10, 0.05],
    [8, 42, 10, 13, -0.08],
    [-14, 20, 10, 13, -0.06],
    [10, 18, 15, 11, 0.07],
  ]
  shots.forEach(([x, y, w, h, rz], i) => {
    const pg = G(rbox(w, h, 0.25, '#ffffff', {}, 0.05))
    const d = i % 2 ? paintFlower(shade(photo, 0.3), photo, GOLD) : paintLandscape(shade(photo, 0.35), photo, '#ffffff')
    pg.add(paintPanel(w - 1.2, h - 2.4, `wg|${photo}|${i}`, d, { y: 1.6, z: 0.14 }))
    pg.add(rbox(1.4, 3, 1, clip, { y: h - 1.5, z: 0.4 }, 0.3))
    pg.position.set(x, y - h + 1.5, 1.4)
    pg.rotation.z = rz
    g.add(pg)
  })
  return g
}

/** 挂历（贴附）：上半张风景，下半张日期格 */
function calendar(p: string[]) {
  const [paper, accent, pic] = p
  const g = new THREE.Group()
  g.add(rbox(30, 42, 0.3, paper, {}, 0.05))
  const land = paintLandscape(shade(pic, 0.35), pic, '#ffffff')
  g.add(
    paintPanel(28, 40, `cal|${p.join()}`, (c, W, H) => {
      c.fillStyle = paper
      c.fillRect(0, 0, W, H)
      c.save()
      c.beginPath()
      c.rect(W * 0.04, H * 0.03, W * 0.92, H * 0.46)
      c.clip()
      c.translate(W * 0.04, H * 0.03)
      land(c, W * 0.92, H * 0.46)
      c.restore()
      c.fillStyle = accent
      c.textAlign = 'left'
      c.textBaseline = 'top'
      c.font = `bold ${Math.round(H * 0.07)}px sans-serif`
      c.fillText('10', W * 0.06, H * 0.52)
      c.fillStyle = '#5a5050'
      for (let r = 0; r < 5; r++)
        for (let k = 0; k < 7; k++) {
          c.fillStyle = k === 0 ? accent : '#5a5050'
          c.fillRect(W * (0.08 + k * 0.125), H * (0.64 + r * 0.068), W * 0.06, H * 0.025)
        }
    }, { y: 1, z: 0.16 }),
  )
  const wire = cyl(0.3, 0.3, 26, '#9aa0a6', {}, 6)
  wire.rotation.z = PI / 2
  wire.position.set(0, 41.6, 0.25)
  g.add(wire)
  g.add(torus(1.4, 0.15, '#9aa0a6', { y: 43.4, z: 0.2 }, PI))
  return g
}
/** 日历本（撕页日历，贴附） */
function tearCalendar(p: string[]) {
  const [board, num, sub] = p
  const g = new THREE.Group()
  g.add(rbox(14, 22, 0.6, board, {}, 0.3))
  g.add(rbox(12, 16, 2.2, PAPER, { y: 1.2, z: 0.6 }, 0.1))
  g.add(
    paintPanel(11, 15, `tear|${p.join()}`, (c, W, H) => {
      c.fillStyle = PAPER
      c.fillRect(0, 0, W, H)
      c.fillStyle = num
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `bold ${Math.round(H * 0.5)}px serif`
      c.fillText('16', W / 2, H * 0.5)
      c.fillStyle = sub
      c.font = `${Math.round(H * 0.08)}px sans-serif`
      c.fillText('2026 · 10', W / 2, H * 0.12)
      c.fillText('金曜日 大安', W / 2, H * 0.88)
    }, { y: 1.7, z: 2.82 }),
  )
  g.add(torus(1, 0.3, shade(board, -0.3), { y: 19.8, z: 0.32 }))
  return g
}

/** 挂轴（床之间）：裱布 + 画心 + 上下轴；kind 决定画心内容 */
function kakejiku(kind: 'sansui' | 'sho'): Build {
  return (p) => {
    const [cloth, roller, paper] = p
    const g = new THREE.Group()
    const w = 52
    const h = 162
    g.add(rbox(w, h - 6, 0.4, cloth, { y: 3 }, 0.1))
    g.add(noOL(rbox(w - 10, h - 48, 0.3, shade(cloth, 0.12), { y: 24, z: 0.35 }, 0.05)))
    const pw = w - 16
    const ph = h - 64
    const draw: Painter =
      kind === 'sansui'
        ? paintLandscape(paper, '#7a7a78', J.shu)
        : (c, W, H) => {
            c.fillStyle = paper
            c.fillRect(0, 0, W, H)
            c.fillStyle = SUMI
            c.textAlign = 'center'
            c.textBaseline = 'middle'
            c.font = `bold ${Math.round(W * 0.78)}px serif`
            c.fillText('和', W / 2, H * 0.42)
            c.font = `${Math.round(W * 0.1)}px serif`
            c.fillText('以和為貴', W * 0.78, H * 0.8)
            c.fillStyle = J.shu
            c.fillRect(W * 0.72, H * 0.88, W * 0.1, W * 0.1)
          }
    g.add(paintPanel(pw, ph, `kj|${kind}|${paper}`, draw, { y: 32, z: 0.55 }))
    for (const y of [30, 32 + ph]) g.add(noOL(rbox(pw, 2, 0.2, GOLD, { y, z: 0.6 }, 0.05)))
    for (const s of [-1, 1]) g.add(noOL(rbox(1.6, 28, 0.2, shade(cloth, 0.2), { x: s * 7, y: h - 34, z: 0.7 }, 0.05)))
    g.add(rbox(w + 1, 1.8, 1.4, shade(roller, -0.1), { y: h - 3.4 }, 0.4))
    const bot = cyl(1.3, 1.3, w + 2, roller, {}, 12)
    bot.rotation.z = PI / 2
    bot.position.set(0, 1.3, 0)
    g.add(bot)
    for (const s of [-1, 1]) g.add(cyl(1.8, 1.8, 2.6, shade(roller, -0.2), { x: s * (w / 2 + 2.3), y: 1.3, rz: PI / 2 }, 12))
    g.add(tube([[-w * 0.3, h - 1.6, 0.4], [0, h + 9, 0.3], [w * 0.3, h - 1.6, 0.4]], 0.18, '#d9c08a', 16, 4))
    return g
  }
}

/** 扇面装饰（壁挂）：展开的折扇 */
function sensuDeco(p: string[]) {
  const [paper, rib, accent] = p
  const g = new THREE.Group()
  const R0 = 30
  const r0 = 11
  const n = 14
  const a0 = PI * 0.12
  const a1 = PI * 0.88
  for (let i = 0; i < n; i++) {
    const s0 = a0 + ((a1 - a0) * i) / n
    const s1 = a0 + ((a1 - a0) * (i + 1)) / n
    const pt = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r]
    const quad = [pt(r0, s0), pt(R0, s0), pt(R0, s1), pt(r0, s1)]
    g.add(flat(quad, 0.3, i % 2 ? paper : shade(paper, -0.06), i % 2 ? 0.3 : 0))
    const band = [pt(R0 - 5, s0), pt(R0 - 1.5, s0), pt(R0 - 1.5, s1), pt(R0 - 5, s1)]
    g.add(noOL(flat(band, 0.2, accent, i % 2 ? 0.62 : 0.32)))
  }
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    g.add(bar([0, 0, -0.2], [Math.cos(a) * (r0 + 1), Math.sin(a) * (r0 + 1), -0.2], 0.35, rib, 5))
  }
  g.add(cyl(1, 1, 1.4, GOLD, { y: 0, z: -0.9, rx: PI / 2 }, 12))
  g.add(disc(4.5, accent, 6, 19, 1.2, 0.3, 20))
  return g
}

// ======================================================================
// 素材表
// ======================================================================

const KADOMATSU_PALS: Pal[] = [
  ['japanese', ['#5f9e4f', STRAW, J.shu]],
  ['japanese', ['#6aa85a', '#c9a86a', '#fbf8f0']],
  ['modern', ['#7fb069', M.char, M.white]],
  ['cute', ['#8fd18a', C.cream, C.pink]],
]
const MOCHI_PALS: Pal[] = [
  ['japanese', [J.hinoki, MOCHI, '#f29a2e']],
  ['japanese', ['#a8352a', MOCHI, '#f29a2e']],
  ['modern', [M.white, '#f4f1ea', '#f2a03a']],
  ['cute', [C.sakura, '#fffaf2', C.orange]],
]
const SHIME_PALS: Pal[] = [
  ['japanese', [STRAW, PAPER, J.shu]],
  ['japanese', ['#c9b27a', PAPER, GOLD]],
  ['modern', ['#e8dcc0', M.white, M.char]],
  ['cute', ['#f3dcbc', '#fffaf2', C.pink]],
]
const HAGOITA_PALS: Pal[] = [
  ['japanese', [SUMI, J.hinoki, '#c8473a']],
  ['japanese', [J.dark, J.washi, '#3d5a80']],
  ['retro', [R.caramel, R.cream, R.teal]],
  ['cute', [C.woodD, C.white, C.pink]],
]
const FUKU_PALS: Pal[] = [
  ['japanese', ['#c8382f', GOLD, '#fbf8f0']],
  ['japanese', [J.washi, J.shu, '#f6e7c8']],
  ['modern', [M.char, M.white, M.light]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['retro', [R.mustard, R.red, R.cream]],
]
const KOHAKU_PALS: Pal[] = [
  ['japanese', ['#8a2a22', '#f2a0b4', MOCHI]],
  ['japanese', [SUMI, '#e8818f', MOCHI]],
  ['modern', [M.white, '#f2a0b4', MOCHI]],
  ['cute', [C.sky, C.pink, MOCHI]],
]
const SETSUBUN_PALS: Pal[] = [
  ['japanese', ['#d6453a', J.hinoki, HAIR]],
  ['japanese', ['#3d6fb5', J.hinoki, HAIR]],
  ['retro', [R.orange, R.caramel, '#5a3a2a']],
  ['cute', [C.pink, C.woodL, '#7a5a5a']],
]
const HINA_PALS: Pal[] = [
  ['japanese', ['#c8382f', '#e7c35a', '#2f3b6b']],
  ['japanese', ['#b8323a', '#d8d6cc', '#4d3a6b']],
  ['cute', ['#ffb6c8', '#fff1dc', '#7fa8d8']],
  ['modern', ['#e8e2d6', '#c9b07a', M.char]],
]
const KOI_PALS: Pal[] = [
  ['japanese', ['#2f3b4a', '#d6453a', '#3d6fb5']],
  ['japanese', ['#2f3b4a', '#e0703a', '#5f9e4f']],
  ['cute', ['#7fa8d8', C.pink, C.mint]],
  ['modern', [M.char, M.gray, M.white]],
]
const KABUTO_PALS: Pal[] = [
  ['japanese', [SUMI, '#e7c35a', '#c8382f']],
  ['japanese', ['#3d3550', '#d8d6cc', '#3d6fb5']],
  ['industrial', [I.iron, '#c9a25a', I.rust]],
  ['modern', [M.black, M.silver, M.white]],
]
const TANABATA_PALS: Pal[] = [
  ['japanese', ['#7fa85a', '#d6453a', '#3d5a80']],
  ['cute', ['#8fd18a', C.pink, C.lilac]],
  ['nordic', ['#9fb48a', N.white, N.blue]],
  ['retro', ['#8c8c3a', R.orange, R.teal]],
]
const FURIN_PALS: Pal[] = [
  ['japanese', ['#cfeeff', PAPER, '#e0503e']],
  ['japanese', ['#e6f4ff', '#c9d67a', '#3d5a80']],
  ['cute', ['#ffe3ec', C.sky, C.pink]],
  ['modern', ['#eef2f4', M.white, M.char]],
  ['retro', ['#d8f0e8', R.cream, R.orange]],
]
const UCHIWA_PALS: Pal[] = [
  ['japanese', [J.washi, '#e0503e', J.wood]],
  ['japanese', [J.ai, '#fbf8f0', J.dark]],
  ['cute', [C.sakura, C.sky, C.woodL]],
  ['retro', [R.cream, R.teal, R.caramel]],
  ['modern', [M.white, M.char, M.char]],
]
const PIG_PALS: Pal[] = [
  ['japanese', ['#c97a4a', '#fbf8f0', '#3f6a3a']],
  ['japanese', [J.washi, J.ai, '#3f6a3a']],
  ['retro', [R.cream, R.red, '#3f6a3a']],
  ['cute', [C.pink, C.white, '#3f6a3a']],
  ['modern', [M.char, M.white, '#3f6a3a']],
]
const TSUKIMI_PALS: Pal[] = [
  ['japanese', [J.hinoki, MOCHI, PAPER]],
  ['japanese', [J.dark, '#fffaf0', '#f6f0e1']],
  ['modern', [M.white, '#fbf8f0', M.light]],
  ['cute', [C.woodL, '#fffaf2', C.sakura]],
]
const SUSUKI_PALS: Pal[] = [
  ['japanese', ['#8a6a4a', '#e8dcc0', '#b8a46a']],
  ['japanese', [SUMI, '#efe6d2', '#a8986a']],
  ['nordic', [N.white, '#efe6d2', '#b8a46a']],
  ['modern', [M.char, '#e8e2d6', '#a8986a']],
]
const DARUMA_PALS: Pal[] = [
  ['japanese', ['#d6453a', SKIN, GOLD]],
  ['japanese', [J.washi, SKIN, J.shu]],
  ['retro', [R.mustard, SKIN, R.red]],
  ['cute', [C.pink, SKIN, C.lemon]],
  ['modern', [M.char, SKIN, M.silver]],
]
const MANEKI_PALS: Pal[] = [
  ['japanese', [C.white, '#d6453a', '#e0a526']],
  ['japanese', [GOLD, '#c8382f', '#b8862a']],
  ['modern', ['#3a3a3c', '#d6453a', '#24252a']],
  ['cute', [C.sakura, C.red, C.lemon]],
  ['retro', [R.cream, R.teal, R.orange]],
]
const KAMIDANA_PALS: Pal[] = [
  ['japanese', [J.hinoki, '#8a6a4a', STRAW]],
  ['japanese', ['#f0dcb4', '#5a4a3a', '#e8d29a']],
  ['modern', ['#efe6d6', M.char, '#e8dcc0']],
]
const BUTSUDAN_PALS: Pal[] = [
  ['japanese', ['#5a3a28', GOLD, BRASS]],
  ['japanese', [J.dark, '#e9d2a6', BRASS]],
  ['modern', [N.oak, N.white, M.silver]],
  ['modern', [M.char, M.light, M.silver]],
]
const EMA_PALS: Pal[] = [
  ['japanese', [J.hinoki, SUMI, '#d6453a']],
  ['japanese', ['#e3c48e', '#3d5a80', '#d6453a']],
  ['cute', [C.woodL, '#e05a7a', C.pink]],
]
const OMAMORI_PALS: Pal[] = [
  ['japanese', ['#c8382f', '#f2d06a', GOLD]],
  ['japanese', ['#3d5a80', '#f6f0e1', '#e9d2a6']],
  ['cute', [C.pink, C.white, '#ffd46a']],
  ['japanese', ['#5f8a5a', '#f6f0e1', GOLD]],
]
const TREE_PALS: Pal[] = [
  ['retro', ['#2f7a4a', '#c8473a', GOLD]],
  ['nordic', ['#5f8a6a', N.white, '#c8473a']],
  ['modern', ['#e8ece8', M.silver, '#3d3f44']],
  ['cute', ['#a6e3cc', C.pink, C.lemon]],
]
const WREATH_PALS: Pal[] = [
  ['retro', ['#3f7a4a', '#c8382f', '#e0303a']],
  ['nordic', ['#7a9a7a', N.linen, '#c8473a']],
  ['modern', ['#5f7a6a', M.white, M.silver]],
  ['cute', ['#8fd18a', C.pink, C.red]],
]
const STOCKING_PALS: Pal[] = [
  ['retro', ['#c8382f', '#2f7a4a', GOLD]],
  ['nordic', [N.gray, N.white, N.linen]],
  ['cute', [C.pink, C.mint, C.cream]],
  ['modern', [M.char, M.white, M.silver]],
]
const GIFT_PALS: Pal[] = [
  ['retro', ['#c8382f', '#2f7a4a', GOLD]],
  ['nordic', [N.white, N.sage, '#c8473a']],
  ['cute', [C.pink, C.sky, C.lemon]],
  ['modern', [M.char, M.white, M.silver]],
]
const PUMPKIN_PALS: Pal[] = [
  ['retro', ['#f08a24', '#5a7a3a', '#ffd36a']],
  ['nordic', ['#f4efe4', '#6a7a5a', '#ffe08f']],
  ['cute', ['#ffb36a', '#7cc47a', '#fff2b8']],
  ['modern', ['#3d3f44', '#5a5a5a', '#ffb347']],
]
const EASTER_PALS: Pal[] = [
  ['cute', ['#d9b07a', C.pink, C.sky]],
  ['nordic', [N.oak, N.sage, N.white]],
  ['retro', [R.caramel, R.mustard, R.teal]],
]
const CAKE_PALS: Pal[] = [
  ['cute', ['#fffaf2', C.pink, C.sky]],
  ['cute', [C.sakura, '#ffffff', C.lemon]],
  ['retro', ['#f4e7c8', '#7a4a32', R.red]],
  ['modern', ['#f4f4f2', M.char, GOLD]],
]
const BALLOON_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.lemon]],
  ['retro', [R.red, R.mustard, R.teal]],
  ['modern', [M.white, GOLD, M.silver]],
  ['nordic', [N.sage, N.white, N.mustard]],
]
const BUNTING_PALS: Pal[] = [
  ['cute', [C.pink, C.mint, C.lemon]],
  ['retro', [R.red, R.mustard, R.teal]],
  ['nordic', [N.sage, N.white, N.blue]],
  ['modern', [M.char, M.white, M.silver]],
]
const FAN_PALS: Pal[] = [
  ['modern', [M.white, '#cfe6f4', M.char]],
  ['modern', [M.char, '#9aa0a6', '#4fc3f7']],
  ['cute', [C.white, C.sky, C.pink]],
  ['nordic', [N.white, N.oakL, N.sage]],
]
const FAN_RETRO_PALS: Pal[] = [
  ['retro', ['#7ab8a8', '#7ab8a8', '#c3c7cc']],
  ['retro', [R.cream, '#e9c46a', '#c3c7cc']],
  ['industrial', [I.iron, '#c9a25a', I.steel]],
  ['cute', [C.sakura, C.white, '#e6e6e6']],
]
const TOWER_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#7fd3ff']],
  ['modern', [M.black, M.char, '#7fd3ff']],
  ['nordic', [N.white, N.oak, '#ffd28a']],
]
const HEATER_PALS: Pal[] = [
  ['modern', [M.white, M.light, M.char]],
  ['modern', [M.char, M.black, M.silver]],
  ['retro', [R.cream, R.caramel, R.orange]],
  ['cute', [C.sakura, C.white, C.red]],
]
const KERO_PALS: Pal[] = [
  ['retro', ['#e9e2d0', '#5a5a5a', '#c3c7cc']],
  ['retro', ['#2f8f8a', '#3a3a3c', '#a8683a']],
  ['industrial', [I.iron, I.steel, '#7a7a7a']],
  ['nordic', [N.white, '#6a6e72', N.blue]],
]
const KERO_FAN_PALS: Pal[] = [
  ['modern', ['#f2f0ea', M.char, '#ff8a4a']],
  ['retro', [R.cream, '#5a4a3a', R.orange]],
  ['modern', [M.char, M.black, '#ff8a4a']],
]
const CARPET_PALS: Pal[] = [
  ['nordic', [N.linen, N.oak, N.white]],
  ['japanese', ['#c9b98a', J.dark, J.washi]],
  ['cute', [C.sakura, C.white, C.white]],
  ['modern', [M.gray, M.char, M.white]],
  ['retro', [R.mustard, R.caramel, R.cream]],
]
const KOTATSU_PALS: Pal[] = [
  ['japanese', ['#a0524a', J.wood, J.tatami]],
  ['japanese', ['#3d5a80', J.dark, '#e9e1c8']],
  ['nordic', [N.sage, N.oak, N.linen]],
  ['cute', [C.pink, C.woodL, C.cream]],
  ['retro', [R.orange, R.caramel, R.cream]],
]
const FUTON_PALS: Pal[] = [
  ['japanese', ['#a0524a', J.washi, J.tatami]],
  ['japanese', ['#3d5a80', J.washi, '#e9e1c8']],
  ['nordic', [N.sage, N.white, N.linen]],
  ['cute', [C.pink, C.white, C.cream]],
]
const HUMID_PALS: Pal[] = [
  ['modern', [M.white, '#dff2ff', '#7fd3ff']],
  ['modern', [M.char, '#dff2ff', '#7fd3ff']],
  ['nordic', [N.white, '#dff2ff', '#ffd28a']],
  ['cute', [C.mint, '#e6f8ff', C.pink]],
]
const STEAM_PALS: Pal[] = [
  ['modern', [M.white, M.light, '#ff9a4a']],
  ['retro', [R.cream, R.caramel, '#ff9a4a']],
  ['modern', [M.char, M.black, '#7fd3ff']],
  ['cute', [C.sky, C.white, C.pink]],
]
const STEAMER_PALS: Pal[] = [
  ['modern', [M.white, '#dff2ff', '#7fd3ff']],
  ['modern', [M.char, '#dff2ff', '#ff8a4a']],
  ['cute', [C.lilac, '#e6f8ff', C.white]],
  ['nordic', [N.white, '#e6f8ff', N.sage]],
]
const SUDARE_PALS: Pal[] = [
  ['japanese', ['#d9c08a', '#3e5a3a', '#6e4f37']],
  ['japanese', ['#c9a86a', SUMI, '#8a6a4a']],
  ['nordic', ['#e6d3a8', N.gray, N.oak]],
  ['retro', ['#c49a5a', R.teal, R.caramel]],
]
const YOSHIZU_PALS: Pal[] = [
  ['japanese', ['#cdb27a', '#6e4f37']],
  ['japanese', ['#b89a62', SUMI]],
  ['nordic', ['#e2cfa2', N.gray]],
]
const CUCKOO_PALS: Pal[] = [
  ['retro', ['#8a5a30', '#4f7a3a', R.cream]],
  ['nordic', [N.oak, N.sage, N.white]],
  ['cute', [C.woodL, C.mint, C.cream]],
  ['industrial', [I.walnut, I.iron, '#efe6d2']],
]
const DIGI_PALS: Pal[] = [
  ['modern', ['#24252a', '#ff6a4a', '#9aa0a6']],
  ['modern', ['#24252a', '#7fd3ff', '#9aa0a6']],
  ['industrial', ['#3a3a3c', '#ffb347', '#8a8d93']],
  ['nordic', [N.oak, '#fff2d0', '#f7f5f0']],
]
const WA_CLOCK_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.washi, SUMI]],
  ['japanese', [J.dark, '#f3ead2', SUMI]],
  ['japanese', [SUMI, J.washi, J.shu]],
  ['nordic', [N.oak, N.white, '#4a4a4a']],
]
const SCHOOL_PALS: Pal[] = [
  ['modern', [M.white, M.white, '#e05a3a']],
  ['retro', [R.cream, '#fffaf0', R.red]],
  ['industrial', [I.iron, '#f4f1ea', I.rust]],
  ['cute', [C.mint, C.white, C.pink]],
  ['nordic', [N.oak, N.white, N.mustard]],
]
const HASHIRA_PALS: Pal[] = [
  ['retro', ['#7a4a2a', R.cream, '#d9b45a']],
  ['retro', ['#4a3020', '#f4ead2', '#c9a25a']],
  ['japanese', [J.wood, J.washi, '#c9a25a']],
  ['industrial', [I.walnut, '#efe6d2', I.steel]],
]
const CANVAS_PALS: Pal[] = [
  ['nordic', ['#cfe3ef', N.sage, N.mustard]],
  ['modern', ['#d7d8db', M.gray, '#e05a3a']],
  ['retro', ['#f4d9a8', R.teal, R.orange]],
  ['japanese', [J.washi, '#7a8a6a', J.shu]],
  ['cute', ['#d8ecff', C.mint, C.pink]],
]
const TRIP_PALS: Pal[] = [
  ['modern', [M.white, M.char, '#e05a3a']],
  ['nordic', [N.white, N.blue, N.mustard]],
  ['retro', [R.cream, R.orange, R.teal]],
  ['industrial', [I.concrete, I.rust, I.iron]],
]
const SQUARE_PALS: Pal[] = [
  ['nordic', [N.oak, N.linen, N.blue]],
  ['modern', [M.black, M.light, '#e05a3a']],
  ['japanese', [J.dark, J.washi, J.shu]],
  ['cute', [C.white, C.sakura, C.pink]],
]
const TALL_PALS: Pal[] = [
  ['modern', [M.black, M.white, '#3d6fb5']],
  ['modern', [M.silver, M.light, M.char]],
  ['nordic', [N.oak, N.white, N.sage]],
  ['retro', [R.caramel, R.cream, R.mustard]],
]
const MINI_PALS: Pal[] = [
  ['nordic', [N.oak, N.sage, N.mustard]],
  ['modern', [M.black, M.gray, '#e05a3a']],
  ['cute', [C.white, C.pink, C.sky]],
  ['retro', [R.caramel, R.teal, R.orange]],
]
const PHOTO_PALS: Pal[] = [
  ['nordic', [N.oak, N.sage, N.blue]],
  ['modern', [M.black, M.gray, '#e05a3a']],
  ['cute', [C.white, C.pink, C.mint]],
  ['industrial', [I.walnut, I.rust, I.steel]],
]
const TAP_PALS: Pal[] = [
  ['nordic', [N.linen, N.mustard, N.sage]],
  ['retro', [R.cream, R.orange, R.teal]],
  ['japanese', [J.ai, J.washi, J.shu]],
  ['industrial', ['#5a4a3a', I.rust, '#d9c9a8']],
]
const MACRAME_PALS: Pal[] = [
  ['nordic', ['#efe6d2', '#a8743f', N.sage]],
  ['nordic', ['#f7f5f0', N.oak, N.mustard]],
  ['retro', ['#e9d2a6', R.caramel, R.orange]],
  ['cute', [C.cream, C.woodL, C.pink]],
]
const SHELF_PALS: Pal[] = [
  ['nordic', [N.oak, N.white]],
  ['modern', [M.white, M.char]],
  ['industrial', [I.walnut, I.iron]],
  ['japanese', [J.hinoki, J.dark]],
  ['cute', [C.white, C.pink]],
]
const FLOAT_PALS: Pal[] = [
  ['nordic', [N.oak, N.oakL]],
  ['modern', [M.white, M.white]],
  ['industrial', [I.walnut, shade(I.walnut, -0.1)]],
  ['japanese', [J.hinoki, J.hinoki]],
]
const CORK_PALS: Pal[] = [
  ['nordic', [N.oak, N.mustard, N.sage]],
  ['modern', [M.black, '#ffe08f', '#ffb6c8']],
  ['cute', [C.white, C.lemon, C.pink]],
  ['industrial', [I.iron, '#ffe08f', '#bfe3ff']],
]
const LETTER_PALS: Pal[] = [
  ['nordic', [N.oak, '#3d3f44', '#ffffff']],
  ['modern', [M.black, M.black, '#ffffff']],
  ['cute', [C.white, C.pink, '#ffffff']],
  ['retro', [R.caramel, R.teal, R.cream]],
]
const GRID_PALS: Pal[] = [
  ['industrial', [I.iron, N.oak, '#7a9ab5']],
  ['modern', [M.white, M.char, '#c9a0a0']],
  ['cute', [C.pink, C.white, C.mint]],
  ['nordic', ['#c9a87a', N.white, N.sage]],
]
const CAL_PALS: Pal[] = [
  ['modern', [M.white, '#e05a3a', '#7a9ab5']],
  ['nordic', [N.white, N.blue, N.sage]],
  ['japanese', [J.washi, J.shu, '#7a8a6a']],
  ['cute', ['#fffaf2', C.pink, C.mint]],
]
const TEAR_PALS: Pal[] = [
  ['japanese', [J.hinoki, J.shu, SUMI]],
  ['retro', [R.caramel, R.red, '#5a4a3a']],
  ['modern', [M.char, M.black, M.gray]],
  ['cute', [C.woodL, C.pink, '#7a6a6a']],
]
const KAKE_PALS: Pal[] = [
  ['japanese', [J.ai, J.dark, J.washi]],
  ['japanese', ['#8f9a6a', J.sumi, '#f3ead2']],
  ['japanese', ['#a7584a', J.dark, J.washi]],
  ['modern', ['#d7d8db', M.black, M.white]],
]
const SENSU_PALS: Pal[] = [
  ['japanese', [J.washi, J.dark, J.shu]],
  ['japanese', ['#f3ead2', SUMI, GOLD]],
  ['cute', [C.sakura, C.woodD, C.pink]],
  ['retro', [R.cream, R.caramel, R.teal]],
]

const SHELF2_SURF = { surface: SHELF2.mount + SHELF2.gap + SHELF2.t, surfaces: [{ y: SHELF2.mount + SHELF2.t, h: SHELF2.gap - SHELF2.t, shape: [rectPoly(-SHELF2.w / 2, -SHELF2.d / 2 + 1, SHELF2.w / 2, SHELF2.d / 2)] }] }
const CUBE_SURF = { surface: CUBE.mount + CUBE.h, surfaces: [{ y: CUBE.mount + CUBE.t, h: CUBE.h - CUBE.t * 2, shape: cubeCells().flat() }] }

const NEW_YEAR: AssetDef[] = [
  A('ss-kadomatsu', '门松', 'japanese', [47.7, 47.4, 115], KADOMATSU_PALS, kadomatsu, { family: 'ss-kadomatsu', sizeLabel: '玄关 · 大' }),
  A('ss-kadomatsu-mini', '门松', 'japanese', [14.3, 14.2, 34.5], KADOMATSU_PALS, (p) => scaled(kadomatsu(p), 0.3), { family: 'ss-kadomatsu', sizeLabel: '桌上 · 小', prop: true }),
  A('ss-kagami-mochi', '镜饼', 'japanese', [24, 24, 26.3], MOCHI_PALS, kagamiMochi, { family: 'ss-kagami-mochi', sizeLabel: '中', prop: true }),
  A('ss-kagami-mochi-s', '镜饼', 'japanese', [12, 12, 13.1], MOCHI_PALS, (p) => scaled(kagamiMochi(p), 0.5), { family: 'ss-kagami-mochi', sizeLabel: '小', prop: true }),
  A('ss-shimekazari', '注连饰', 'japanese', [25.3, 10.4, 40.9], SHIME_PALS, shimekazari, { mount: 150 }),
  A('ss-hagoita', '羽子板饰', 'japanese', [22, 13.9, 47.6], HAGOITA_PALS, hagoita, { prop: true }),
  A('ss-fukubukuro', '福袋', 'deco', [40, 16.5, 51], FUKU_PALS, fukubukuro(1), { family: 'ss-fukubukuro', sizeLabel: '大', prop: true }),
  A('ss-fukubukuro-s', '福袋', 'deco', [26, 10.7, 33.2], FUKU_PALS, fukubukuro(0.65), { family: 'ss-fukubukuro', sizeLabel: '小', prop: true }),
  A('ss-kohaku-mochi', '红白年糕', 'tabletop', [19, 19, 3.4], KOHAKU_PALS, kohakuMochi, { prop: true }),
  A('ss-setsubun', '节分豆枡 + 鬼面', 'japanese', [21, 14.4, 19.9], SETSUBUN_PALS, setsubun, { prop: true }),
]

const FESTIVAL_JP: AssetDef[] = [
  A('ss-hina-tiers', '雏人形', 'japanese', [92, 80, 94], HINA_PALS, hinaTiers, { family: 'ss-hina', sizeLabel: '五段饰' }),
  A('ss-hina-pair', '雏人形', 'japanese', [58, 32, 28.4], HINA_PALS, hinaPair, { family: 'ss-hina', sizeLabel: '亲王饰', prop: true }),
  A('ss-koinobori', '鲤鱼旗', 'outdoor', [70.7, 32, 185.6], KOI_PALS, koinobori, { family: 'ss-koinobori', sizeLabel: '阳台用' }),
  A('ss-koinobori-mini', '鲤鱼旗', 'kids', [17.7, 8, 46.4], KOI_PALS, (p) => scaled(koinobori(p), 0.25), { family: 'ss-koinobori', sizeLabel: '室内桌上', prop: true }),
  A('ss-kabuto', '五月人形·头盔饰', 'japanese', [44, 32, 45.6], KABUTO_PALS, kabuto, { prop: true }),
  A('ss-tanabata', '七夕竹饰', 'japanese', [64.1, 47, 152.7], TANABATA_PALS, tanabata, { family: 'ss-tanabata', sizeLabel: '落地' }),
  A('ss-tanabata-mini', '七夕竹饰', 'japanese', [22.4, 16.5, 53.4], TANABATA_PALS, (p) => scaled(tanabata(p), 0.35), { family: 'ss-tanabata', sizeLabel: '桌上', prop: true }),
  A('ss-furin', '风铃', 'japanese', [13.3, 10, 39.5], FURIN_PALS, furinStand, { family: 'ss-furin', form: 'standing', formLabel: '风铃架', prop: true }),
  A('ss-furin-hanging', '风铃', 'japanese', [9.4, 11.3, 27.8], FURIN_PALS, furinHanging, { family: 'ss-furin', form: 'hanging', prop: true }),
  A('ss-uchiwa', '团扇', 'japanese', [24.6, 6, 37.8], UCHIWA_PALS, uchiwaStand, { family: 'ss-uchiwa', form: 'standing', prop: true }),
  A('ss-uchiwa-hanging', '团扇', 'japanese', [24.6, 3, 40.2], UCHIWA_PALS, uchiwaHanging, { family: 'ss-uchiwa', form: 'hanging', prop: true }),
  A('ss-katori-buta', '蚊香猪', 'japanese', [18, 17.5, 20.8], PIG_PALS, katoriButa, { prop: true, fx: PIG_FX }),
  A('ss-tsukimi-dango', '月见团子', 'japanese', [22, 22, 17.3], TSUKIMI_PALS, tsukimiDango, { prop: true }),
  A('ss-susuki', '芒草花瓶', 'japanese', [40.8, 36.8, 90], SUSUKI_PALS, susuki, { prop: true }),
]

const LUCKY: AssetDef[] = [
  A('ss-daruma-l', '达摩', 'japanese', [30, 29.5, 31.5], DARUMA_PALS, daruma, { family: 'ss-daruma', sizeLabel: '大 30cm', prop: true }),
  A('ss-daruma-xl', '达摩', 'japanese', [47.6, 46.7, 50], DARUMA_PALS, (p) => scaled(daruma(p), 50 / 31.5), { family: 'ss-daruma', sizeLabel: '特大 50cm' }),
  A('ss-maneki-l', '招财猫', 'japanese', [23, 19, 34.5], MANEKI_PALS, maneki, { family: 'ss-maneki', sizeLabel: '大 35cm', prop: true }),
  A('ss-maneki-xl', '招财猫', 'japanese', [43.7, 36.1, 65.5], MANEKI_PALS, (p) => scaled(maneki(p), 1.9), { family: 'ss-maneki', sizeLabel: '店头 66cm' }),
  A('ss-kamidana', '神棚', 'japanese', [62, 30.1, 34.9], KAMIDANA_PALS, kamidana, { mount: 180 }),
  A('ss-butsudan', '小型佛坛', 'japanese', [42, 48.5, 55], BUTSUDAN_PALS, butsudan, { prop: true }),
  A('ss-ema', '绘马', 'japanese', [16.2, 1.4, 12.4], EMA_PALS, ema, { stick: true, prop: true }),
  A('ss-omamori', '御守', 'japanese', [4.6, 10.7, 1.7], OMAMORI_PALS, omamoriLying, { family: 'ss-omamori', form: 'lying', prop: true }),
  A('ss-omamori-hanging', '御守', 'japanese', [4.6, 3, 12.5], OMAMORI_PALS, omamoriHanging, { family: 'ss-omamori', form: 'hanging', prop: true }),
]

const WESTERN: AssetDef[] = [
  A('ss-xmas-tree-l', '圣诞树', 'deco', [99, 100, 170], TREE_PALS, xmasTree, { family: 'ss-xmas-tree', sizeLabel: '180cm' }),
  A('ss-xmas-tree-m', '圣诞树', 'deco', [66, 66.7, 113.3], TREE_PALS, (p) => scaled(xmasTree(p), 2 / 3), { family: 'ss-xmas-tree', sizeLabel: '120cm' }),
  A('ss-xmas-tree-s', '圣诞树', 'deco', [24.7, 25, 42.5], TREE_PALS, (p) => scaled(xmasTree(p), 0.25), { family: 'ss-xmas-tree', sizeLabel: '桌上 45cm', prop: true }),
  A('ss-wreath', '圣诞花环', 'deco', [37.5, 9.6, 44.2], WREATH_PALS, wreath, { mount: 140 }),
  A('ss-stockings', '圣诞袜挂饰', 'deco', [73.8, 6.7, 38.6], STOCKING_PALS, stockingsWall, { mount: 110 }),
  A('ss-stocking-hanging', '圣诞袜', 'deco', [15.7, 6.5, 33.6], STOCKING_PALS, stockingHanging, { form: 'hanging', prop: true }),
  A('ss-gifts', '礼物堆', 'deco', [51.2, 39.5, 35.4], GIFT_PALS, gifts, { prop: true }),
  A('ss-pumpkin-l', '南瓜灯', 'deco', [32, 32.7, 26.7], PUMPKIN_PALS, jackOLantern, { family: 'ss-pumpkin', sizeLabel: '大', prop: true }),
  A('ss-pumpkin-s', '南瓜灯', 'deco', [17.6, 18, 14.7], PUMPKIN_PALS, (p) => scaled(jackOLantern(p), 0.55), { family: 'ss-pumpkin', sizeLabel: '小', prop: true }),
  A('ss-easter-basket', '复活节彩蛋篮', 'deco', [26.4, 26, 23.8], EASTER_PALS, easterBasket, { prop: true }),
  A('ss-cake-tier', '双层生日蛋糕', 'tabletop', [32, 32, 31.4], CAKE_PALS, cakeTier, { prop: true, fx: CAKE_FX }),
  A('ss-balloons', '气球束', 'deco', [59, 41, 181], BALLOON_PALS, balloons),
  A('ss-bunting', '派对彩旗', 'deco', [151.4, 2.3, 22.3], BUNTING_PALS, bunting, { mount: 175 }),
]

const SEASON_APPLIANCE: AssetDef[] = [
  A('ss-fan-floor', '电风扇', 'appliance', [37.1, 32, 106.5], FAN_PALS, fanFloor, { family: 'ss-fan', sizeLabel: '落地扇' }),
  A('ss-fan-desk', '电风扇', 'appliance', [27.1, 21.9, 39.1], FAN_PALS, fanDesk, { family: 'ss-fan', sizeLabel: '台扇', prop: true }),
  A('ss-fan-circ', '电风扇', 'appliance', [27.2, 22, 28.2], FAN_PALS, fanCirc, { family: 'ss-fan', sizeLabel: '循环扇', prop: true }),
  A('ss-fan-tower', '电风扇', 'appliance', [28, 28, 86.4], TOWER_PALS, fanTower, { family: 'ss-fan', sizeLabel: '塔扇' }),
  A('ss-fan-retro', '复古台扇', 'appliance', [29.1, 24.7, 43.6], FAN_RETRO_PALS, fanRetro, { prop: true }),
  A('ss-ceramic-heater', '陶瓷暖风机', 'appliance', [20, 16.8, 32], HEATER_PALS, ceramicHeater, { prop: true }),
  A('ss-kerosene-conv', '石油暖炉', 'appliance', [46, 46, 65.8], KERO_PALS, keroseneConv, { family: 'ss-kerosene', sizeLabel: '对流式（带水壶）', fx: KERO_FX }),
  A('ss-kerosene-fan', '石油暖炉', 'appliance', [44, 31.2, 44.7], KERO_FAN_PALS, keroseneFan, { family: 'ss-kerosene', sizeLabel: '风扇式' }),
  A('ss-hot-carpet-2', '电热地毯', 'living', [176, 176, 4.7], CARPET_PALS, hotCarpet(176, 176), { family: 'ss-hot-carpet', sizeLabel: '2 畳' }),
  A('ss-hot-carpet-3', '电热地毯', 'living', [235, 195, 4.7], CARPET_PALS, hotCarpet(235, 195), { family: 'ss-hot-carpet', sizeLabel: '3 畳' }),
  A('ss-kotatsu-rect', '长方形被炉', 'japanese', [200, 170, 41], KOTATSU_PALS, kotatsuRect, { surface: KR.topY + KR.topT, surfaceShape: [rectPoly(-KR.topW / 2, -KR.topD / 2, KR.topW / 2, KR.topD / 2)] }),
  A('ss-futon-folded', '被炉被', 'japanese', [84, 58, 25.6], FUTON_PALS, futonFolded, { form: 'folded' }),
  A('ss-humidifier-tower', '加湿器', 'appliance', [25, 25.2, 54], HUMID_PALS, humidifierTower, { family: 'ss-humidifier', sizeLabel: '落地塔式', fx: [{ kind: 'mist', x: 0, y: 54, z: 0, scale: 1.4 }] }),
  A('ss-humidifier-steam', '加湿器', 'appliance', [22, 22.2, 31.2], STEAM_PALS, humidifierSteam, { family: 'ss-humidifier', sizeLabel: '蒸汽式', prop: true, fx: [{ kind: 'steam', x: 0, y: 25, z: 0, scale: 0.8 }] }),
  A('ss-steamer-hand', '手持挂烫机', 'appliance', [10, 12, 25], STEAMER_PALS, steamerHand, { prop: true }),
  A('ss-sudare', '竹帘', 'japanese', [89, 2.5, 158.3], SUDARE_PALS, sudare(88, 156, false), { family: 'ss-sudare', sizeLabel: '窗用 88×156', mount: 60 }),
  A('ss-sudare-s', '竹帘', 'japanese', [61, 2.5, 92.3], SUDARE_PALS, sudare(60, 90, true), { family: 'ss-sudare', sizeLabel: '苇帘 60×90', mount: 100 }),
  A('ss-yoshizu', '立式苇帘', 'outdoor', [180, 41.9, 196.3], YOSHIZU_PALS, yoshizu),
]

const WALL_DECO: AssetDef[] = [
  A('ss-clock-cuckoo', '鸽子钟', 'deco', [25.7, 16.7, 74.6], CUCKOO_PALS, cuckooClock, { mount: 125 }),
  A('ss-clock-digital', '电子挂钟', 'deco', [40, 2.5, 18], DIGI_PALS, digitalClock, { mount: 175 }),
  A('ss-clock-wa', '和风挂钟', 'deco', [30, 5, 30], WA_CLOCK_PALS, waClock, { mount: 170 }),
  A('ss-clock-school', '学校挂钟', 'deco', [43.4, 6.5, 43.4], SCHOOL_PALS, schoolClock, { mount: 170 }),
  A('ss-clock-pendulum', '柱时计', 'deco', [33, 14.1, 73.4], HASHIRA_PALS, pendulumClock, { mount: 110 }),
  A('ss-art-canvas-xl', '装饰画·风景画布', 'deco', [120, 3.5, 80], CANVAS_PALS, canvasXL, { mount: 110 }),
  A('ss-art-triptych', '装饰画·三联', 'deco', [128, 3, 60], TRIP_PALS, triptych, { mount: 120 }),
  A('ss-art-square', '装饰画·方框花', 'deco', [40, 2.6, 40], SQUARE_PALS, artSquare, { mount: 135 }),
  A('ss-art-tall', '装饰画·竖幅几何', 'deco', [50, 2.2, 70], TALL_PALS, artTall, { mount: 120 }),
  A('ss-art-mini-set', '装饰画·小框三连', 'deco', [70, 2, 29], MINI_PALS, artMiniSet, { mount: 140 }),
  A('ss-photo-wall', '照片墙', 'deco', [123, 2, 79], PHOTO_PALS, photoWall, { mount: 115 }),
  A('ss-tapestry', '挂毯', 'deco', [72, 2.8, 108.7], TAP_PALS, tapestry, { mount: 115 }),
  A('ss-macrame', '编织挂毯', 'deco', [64, 2.7, 79.7], MACRAME_PALS, macrame, { mount: 115 }),
  A('ss-shelf-2tier', '双层壁挂层板', 'storage', [84, 20, 32.5], SHELF_PALS, shelf2, { mount: SHELF2.mount, ...SHELF2_SURF }),
  A('ss-shelf-cube', '壁挂格子架', 'storage', [90, 22, 30], SHELF_PALS, cubeShelf, { mount: CUBE.mount, ...CUBE_SURF }),
  A('ss-shelf-floating', '隐形层板', 'storage', [120, 22, 4.1], FLOAT_PALS, floatShelf, { mount: FLOAT.mount, surface: FLOAT.mount + FLOAT.t }),
  A('ss-corkboard', '软木留言板', 'study', [60, 3.1, 45], CORK_PALS, corkboard, { mount: 120 }),
  A('ss-letterboard', '字母留言板', 'deco', [45, 2.4, 32], LETTER_PALS, letterboard, { mount: 130 }),
  A('ss-wire-grid', '网格照片墙', 'deco', [60.8, 2.2, 60.8], GRID_PALS, wireGrid, { mount: 110 }),
  A('ss-calendar', '挂历', 'study', [30, 0.7, 44.9], CAL_PALS, calendar, { stick: true, prop: true }),
  A('ss-calendar-tear', '撕页日历', 'study', [14, 3.3, 22], TEAR_PALS, tearCalendar, { stick: true, prop: true }),
  A('ss-kakejiku-sansui', '挂轴·山水', 'japanese', [59.2, 3.6, 171.2], KAKE_PALS, kakejiku('sansui'), { family: 'ss-kakejiku', sizeLabel: '山水画', mount: 45 }),
  A('ss-kakejiku-sho', '挂轴·书法', 'japanese', [59.2, 3.6, 171.2], KAKE_PALS, kakejiku('sho'), { family: 'ss-kakejiku', sizeLabel: '书法「和」', mount: 45 }),
  A('ss-sensu-deco', '扇面装饰', 'japanese', [55.8, 2.8, 30.3], SENSU_PALS, sensuDeco, { mount: 150 }),
]

export const SEASONAL: AssetDef[] = [...NEW_YEAR, ...FESTIVAL_JP, ...LUCKY, ...WESTERN, ...SEASON_APPLIANCE, ...WALL_DECO]
