// 荣誉与棋牌素材包：奖杯（多种造型 × 铜 / 银 / 金 / 水晶，底座换配色）、奖牌、奖状 / 证书 / 毕业证书（挂墙或收纳），
// 以及棋牌：自动麻将机（一体机）、折叠 / 和室手积麻将桌（只是桌子）+ 麻将牌摆件、中式方桌式棋桌 / 独脚圆桌（只是桌子）、
// 平板围棋盘（空盘 / 对局中 / 收官）+ 棋罐（木 / 藤编，黑子 / 白子）、日式足付き碁盤 / 将棋盤（落地厚盘），
// 欧美台球桌 / 飞镖盘，还有双人并排电竞台、双人书桌、六边形灯板、吸音棉。组合由一键布置完成（桌子 + 台面摆件）。
// 约定见 kit.ts 开头。全部 id 以 hg- 开头。

import * as THREE from 'three'
import { ball, cup, cyl, rbox, shade, toon, torus, tray } from '../toon'
import { C, glow, paintPanel, pinwheelWalls, type AssetDef } from '../kit'
import { G, P, PI, cylX, cylZ, fitGroup, noOutline } from '../geo'
import { CL, CN, F, I, J, M, N, PROP, define, type PalFlat } from '../packkit'

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void
const IVORY = '#f6f0e1'
const PAPER = '#fbf8f0'
const DARK = '#26262a'

/** 平放的画面：w × d，(x, z) 为中心，y 为高度 */
const paintTop = (w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number) => paintPanel(w, d, key, draw, { x, y, z: z + d / 2, rx: -PI / 2 })

// ---------- 材质：金 / 银 / 铜 / 水晶 ----------

type Mat = 'gold' | 'silver' | 'bronze' | 'crystal'
const METAL: Record<Mat, string> = { gold: '#e3b549', silver: '#c9ced6', bronze: '#c8875a', crystal: '#d6f0fb' }
const MAT_LABEL: Record<Mat, string> = { gold: '金', silver: '银', bronze: '铜', crystal: '水晶' }

/** 把一组网格做成该材质：水晶半透明、不描边、不投影 */
function finish(o: THREE.Object3D, mat: Mat) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh
    if (!mesh.isMesh) return
    if (mat === 'crystal') {
      mesh.material = toon(METAL.crystal, { transparent: 0.55 })
      mesh.castShadow = false
      mesh.userData.noOutline = true
    } else mesh.material = toon(METAL[mat], { emissive: 0.08 })
  })
  return o
}

/** 奖杯底座：两层台 + 铭牌。返回 [底座组, 顶面高度] */
function trophyBase(w: number, d: number, base: string, plate: string, tiers = 2): [THREE.Group, number] {
  const g = new THREE.Group()
  let y = 0
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.16
    const h = i === 0 ? 3.2 : 2.6
    g.add(rbox(w * k, h, d * k, i % 2 ? shade(base, 0.08) : base, { y }, 0.5))
    y += h
  }
  g.add(noOutline(rbox(w * 0.45, 1.6, 0.2, plate, { y: 0.8, z: d / 2 + 0.12 }, 0.05)))
  return [g, y]
}

// 各造型：[底座色, 铭牌色]
function trophyCup(mat: Mat) {
  return ([base, plate]: string[]) => {
    const [g, y] = trophyBase(14, 10, base, plate)
    const top = G(cyl(1, 2.6, 3, '#fff', { y }, 16), ball(1.7, '#fff', { y: y + 4.2 }), cyl(0.8, 1.3, 3, '#fff', { y: y + 5 }, 12), cup(6.4, 2.6, 10, 0.4, '#fff', { y: y + 8 }))
    for (const s of [-1, 1]) top.add(torus(3, 0.5, '#fff', { x: s * 6.1, y: y + 13.6, rz: -s * PI / 2 }, PI))
    g.add(finish(top, mat))
    return fitGroup(g)
  }
}
/** 三层大奖杯：高底座 + 立柱 + 带盖大杯 */
function trophyTall(mat: Mat) {
  return ([base, plate]: string[]) => {
    const [g, y0] = trophyBase(20, 14, base, plate, 3)
    g.add(rbox(10, 9, 8, shade(base, 0.1), { y: y0 }, 0.6))
    const y = y0 + 9
    const top = G(cyl(1.4, 3.2, 4, '#fff', { y }, 16), ball(2.2, '#fff', { y: y + 5.6 }), cup(8.2, 3.2, 13, 0.5, '#fff', { y: y + 7 }), cyl(8.4, 8.4, 1, '#fff', { y: y + 20 }, 24), ball(1.8, '#fff', { y: y + 22.6 }))
    for (const s of [-1, 1]) top.add(torus(4.2, 0.6, '#fff', { x: s * 8, y: y + 15, rz: -s * PI / 2 }, PI))
    g.add(finish(top, mat))
    return fitGroup(g)
  }
}
/** 星形 */
function trophyStar(mat: Mat) {
  return ([base, plate]: string[]) => {
    const [g, y] = trophyBase(10, 7, base, plate)
    const pts: THREE.Vector2[] = []
    for (let k = 0; k < 10; k++) {
      const a = PI / 2 + (k / 10) * PI * 2
      const r = k % 2 ? 2.6 : 6
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r))
    }
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 1.2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 })
    geo.translate(0, 0, -0.6)
    const star = new THREE.Mesh(geo, toon('#fff'))
    star.castShadow = true
    const top = G(cyl(0.9, 1.4, 9, '#fff', { y }, 12), P(star, 0, y + 9 + 5, 0))
    g.add(finish(top, mat))
    return fitGroup(g)
  }
}
/** 月桂环：圆环 + 两侧叶片 + 中心圆章 */
function trophyLaurel(mat: Mat) {
  return ([base, plate]: string[]) => {
    const [g, y] = trophyBase(12, 7, base, plate)
    const cy = y + 12
    const top = G(cyl(0.9, 1.3, 4, '#fff', { y }, 12), torus(6.5, 0.7, '#fff', { y: cy, rx: 0 }), cylZ(3.4, 0.8, '#fff', 0, cy, 0))
    for (let k = 0; k < 9; k++) {
      const a = -PI / 2 + 0.5 + (k / 8) * (PI * 2 - 1)
      top.add(P(ball(1, '#fff', {}, [1, 1.9, 0.5]), Math.cos(a) * 7.6, cy + Math.sin(a) * 7.6, 0, 0, 0, a))
    }
    g.add(finish(top, mat))
    return fitGroup(g)
  }
}
/** 水晶方尖碑（只有水晶款） */
function trophyObelisk([base, plate]: string[]) {
  const [g, y] = trophyBase(9, 9, base, plate)
  const ob = P(cyl(1.2, 3.4, 18, '#fff', {}, 4), 0, y, 0, 0, PI / 4)
  g.add(finish(G(ob), 'crystal'))
  return fitGroup(g)
}

const TROPHY_BASES: PalFlat[] = [
  ['modern', DARK, METAL.gold],
  ['classic', '#ecebe6', CL.gold],
  ['retro', '#7a4e2e', '#e6bf55'],
  ['chinese', CN.rosewood, CN.brass],
  ['nordic', N.white, '#c9ced6'],
]
const SHAPES: { key: string; label: string; size: [number, number, number]; make: (m: Mat) => (p: string[]) => THREE.Group }[] = [
  { key: 'cup', label: '杯形', size: [19, 11, 26], make: trophyCup },
  { key: 'tall', label: '三层大奖杯', size: [25, 15, 48], make: trophyTall },
  { key: 'star', label: '星形', size: [12, 8, 26], make: trophyStar },
  { key: 'laurel', label: '月桂环', size: [18, 8, 29], make: trophyLaurel },
]
const MATS: Mat[] = ['gold', 'silver', 'bronze', 'crystal']

const trophies: AssetDef[] = [
  ...SHAPES.flatMap((s) => MATS.map((m) => define(`hg-trophy-${s.key}-${m}`, '奖杯', 'deco', s.size, TROPHY_BASES, s.make(m), { ...PROP, family: 'hg-trophy', sizeLabel: `${s.label} · ${MAT_LABEL[m]}` }))),
  define('hg-trophy-obelisk', '奖杯', 'deco', [10, 10, 25], TROPHY_BASES, trophyObelisk, { ...PROP, family: 'hg-trophy', sizeLabel: '方尖碑 · 水晶' }),
]

// ---------- 奖牌 ----------

/** 单枚奖牌立在小支架上：[缎带色 1, 缎带色 2] */
function medalStand(mat: Mat) {
  return ([r1, r2]: string[]) => {
    const g = new THREE.Group()
    g.add(rbox(9, 1, 5, '#e9eef2', {}, 0.3))
    // 斜靠的透明亚克力背板
    const back = rbox(7.5, 13, 0.4, '#e9f4fb', { y: 1 }, 0.1)
    back.material = toon('#e9f4fb', { transparent: 0.4 })
    back.userData.noOutline = true
    g.add(P(G(back), 0, 0, -1.2, -0.12))
    // 缎带搭在背板顶上，奖牌垂在前面
    for (const s of [-1, 1]) g.add(P(rbox(1.6, 8, 0.15, s > 0 ? r1 : r2, {}, 0.05), s * 0.9, 6, 0.1, -0.1, 0, -s * 0.18))
    const medal = G(cylZ(3, 0.5, '#fff', 0, 4.4, 0.6), noOutline(cylZ(2.1, 0.2, '#fff', 0, 4.4, 0.95, 20)))
    finish(medal, mat)
    ;((medal.children[1] as THREE.Mesh).material as THREE.Material).dispose?.()
    ;(medal.children[1] as THREE.Mesh).material = toon(shade(METAL[mat], -0.15))
    g.add(medal)
    return fitGroup(g)
  }
}
/** 奖牌展示框（挂墙，三枚：金银铜）：[框色, 衬底色, 缎带色] */
const MEDAL_FRAME_MOUNT = 140
function medalFrame([frame, backing, ribbon]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(42, 32, 3, frame, {}, 0.6))
  g.add(noOutline(rbox(38, 28, 0.3, backing, { y: 2, z: 1.4 }, 0.1)))
  ;(['gold', 'silver', 'bronze'] as Mat[]).forEach((m, i) => {
    const x = -12 + i * 12
    for (const s of [-1, 1]) g.add(P(rbox(2, 11, 0.15, s > 0 ? ribbon : shade(ribbon, -0.15), {}, 0.05), x + s * 1.2, 15, 1.7, 0, 0, -s * 0.12))
    g.add(finish(G(cylZ(3.6, 0.5, '#fff', x, 12, 1.9)), m))
  })
  const glass = rbox(40, 30, 0.2, '#e9f4fb', { y: 1, z: 1.6 }, 0.05)
  glass.material = toon('#e9f4fb', { transparent: 0.22 })
  glass.userData.noOutline = true
  glass.castShadow = false
  g.add(glass)
  return fitGroup(g, MEDAL_FRAME_MOUNT)
}

const medals: AssetDef[] = [
  ...(['gold', 'silver', 'bronze'] as Mat[]).map((m) =>
    define(`hg-medal-${m}`, '奖牌', 'deco', [9, 6, 15], [
      ['modern', '#3d6fb8', '#c8473a'],
      ['cute', C.pink, C.sky],
      ['classic', CL.wine, CL.navy],
      ['chinese', CN.lacquer, CN.brass],
    ], medalStand(m), { ...PROP, family: 'hg-medal', sizeLabel: `${MAT_LABEL[m]}牌 · 立架` }),
  ),
  define('hg-medal-frame', '奖牌展示框', 'deco', [42, 4, 32], [
    ['modern', DARK, '#3d3f44', '#3d6fb8'],
    ['classic', CL.gold, CL.navy, CL.wine],
    ['nordic', N.oak, N.linen, N.blue],
    ['chinese', CN.rosewood, CN.ink, CN.lacquer],
  ], medalFrame, { mount: MEDAL_FRAME_MOUNT }),
]

// ---------- 奖状 / 证书 / 毕业证书 ----------

type CertKind = 'award' | 'cert' | 'diploma'
/** 证书画面：奖状（红金花边 + 大字）、证书（细框 + 徽章）、毕业证书（校徽 + 缎带封蜡） */
function certDraw(kind: CertKind, accent: string): Draw {
  return (c, W, H) => {
    c.fillStyle = kind === 'award' ? '#fff8ec' : PAPER
    c.fillRect(0, 0, W, H)
    const m = Math.min(W, H)
    c.strokeStyle = accent
    c.lineWidth = m * 0.035
    c.strokeRect(m * 0.05, m * 0.05, W - m * 0.1, H - m * 0.1)
    c.lineWidth = m * 0.01
    c.strokeRect(m * 0.1, m * 0.1, W - m * 0.2, H - m * 0.2)
    c.fillStyle = accent
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const title = kind === 'award' ? '奖 状' : kind === 'cert' ? 'CERTIFICATE' : 'DIPLOMA'
    c.font = `bold ${Math.floor(H * (kind === 'award' ? 0.2 : 0.11))}px serif`
    c.fillText(title, W / 2, H * 0.27)
    // 正文：几行灰线
    c.fillStyle = 'rgba(60,60,60,0.45)'
    for (let i = 0; i < 4; i++) c.fillRect(W * (i === 3 ? 0.42 : 0.22), H * (0.46 + i * 0.09), W * (i === 3 ? 0.36 : 0.56), Math.max(1, H * 0.018))
    // 印章 / 封蜡
    c.fillStyle = kind === 'diploma' ? '#c8a03a' : '#c8473a'
    c.beginPath()
    c.arc(W * 0.74, H * 0.8, m * 0.09, 0, PI * 2)
    c.fill()
    if (kind === 'diploma') {
      c.fillStyle = '#b8352b'
      c.fillRect(W * 0.71, H * 0.84, m * 0.03, m * 0.12)
      c.fillRect(W * 0.75, H * 0.84, m * 0.03, m * 0.12)
    }
  }
}
const CERT_MOUNT = 150
function certFrame(kind: CertKind, w: number, h: number) {
  return ([frame, accent]: string[]) => {
    const g = new THREE.Group()
    g.add(rbox(w, h, 1.6, frame, {}, 0.35))
    g.add(paintPanel(w - 3, h - 3, `hg-cert-${kind}-${accent}`, certDraw(kind, accent), { y: 1.5, z: 0.82 }))
    return fitGroup(g, CERT_MOUNT)
  }
}
const CERT_FRAMES: PalFlat[] = [
  ['modern', DARK, '#b8352b'],
  ['classic', CL.gold, CL.wine],
  ['nordic', N.oak, '#3d6fb8'],
  ['chinese', CN.rosewood, CN.lacquer],
  ['farmhouse', F.white, F.navy],
]

/** 证书夹（合上平放）：[封皮, 烫金] */
function certFolder([cover, foil]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(24, 1.4, 17, cover, {}, 0.4))
  g.add(noOutline(rbox(8, 0.1, 1.2, foil, { y: 1.42, z: -2 }, 0.05)))
  g.add(noOutline(cyl(2, 2, 0.1, foil, { y: 1.42, z: 3 }, 20)))
  return fitGroup(g)
}
/** 一摞证书夹 */
function certStack([cover, foil]: string[]) {
  const g = new THREE.Group()
  const cols = [cover, shade(cover, -0.18), '#3b4a66', cover]
  cols.forEach((c, i) => {
    g.add(P(G(rbox(24, 1.4, 17, c, {}, 0.4), noOutline(rbox(8, 0.1, 1.2, foil, { y: 1.42, z: -2 }, 0.05))), (i % 2 ? 0.8 : -0.6), i * 1.45, (i % 2 ? -0.5 : 0.4), 0, (i - 1.5) * 0.06))
  })
  return fitGroup(g)
}
/** 毕业证书筒（横放）：[筒身, 盖子] */
function certTube([body, lid]: string[]) {
  const g = new THREE.Group()
  g.add(cylX(3.2, 30, body, 0, 3.2, 0, 20))
  for (const s of [-1, 1]) g.add(cylX(3.5, 2.6, lid, s * 15.6, 3.2, 0, 20))
  return fitGroup(g)
}
/** 证书收纳盒（盖子半开，露出一叠证书）：[盒, 标签] */
function certBox([box, label]: string[]) {
  const g = new THREE.Group()
  g.add(tray(34, 8, 26, 0.8, box, {}, 0.6))
  g.add(noOutline(rbox(10, 3, 0.2, label, { y: 2.5, z: 13.15 }, 0.1)))
  // 一叠证书竖着插在盒里，上沿露出盒口
  for (let i = 0; i < 6; i++) g.add(P(rbox(30, 22, 0.35, i % 2 ? PAPER : '#fff4dc', {}, 0.1), 0, 0.8, -9 + i * 3.2, -0.12))
  // 盖子：铰链在后沿上方，向后打开
  const lid = G(rbox(35, 1.2, 27, shade(box, 0.06), { z: -13.5 }, 0.5))
  g.add(P(lid, 0, 8, -13, -1.9))
  return fitGroup(g)
}

const certs: AssetDef[] = [
  define('hg-cert-award-s', '奖状', 'deco', [32, 2, 23], CERT_FRAMES, certFrame('award', 32, 23), { mount: CERT_MOUNT, family: 'hg-cert', sizeLabel: '奖状 · 小' }),
  define('hg-cert-award-m', '奖状', 'deco', [44, 2, 32], CERT_FRAMES, certFrame('award', 44, 32), { mount: CERT_MOUNT, family: 'hg-cert', sizeLabel: '奖状 · 中' }),
  define('hg-cert-cert-m', '奖状', 'deco', [44, 2, 33], CERT_FRAMES, certFrame('cert', 44, 33), { mount: CERT_MOUNT, family: 'hg-cert', sizeLabel: '证书 · 中' }),
  define('hg-cert-diploma-l', '奖状', 'deco', [60, 2, 46], CERT_FRAMES, certFrame('diploma', 60, 46), { mount: CERT_MOUNT, family: 'hg-cert', sizeLabel: '毕业证书 · 大' }),
  define('hg-cert-folder', '证书收纳', 'study', [24, 17, 1.6], [
    ['chinese', CN.lacquer, CN.brass],
    ['classic', CL.navy, CL.gold],
    ['modern', DARK, '#c9ced6'],
    ['retro', '#7a2e3a', '#e6bf55'],
  ], certFolder, { ...PROP, family: 'hg-cert-stored', sizeLabel: '证书夹' }),
  define('hg-cert-stack', '证书收纳', 'study', [26, 18, 6], [
    ['chinese', CN.lacquer, CN.brass],
    ['classic', CL.navy, CL.gold],
    ['modern', DARK, '#c9ced6'],
  ], certStack, { ...PROP, family: 'hg-cert-stored', sizeLabel: '一摞证书夹' }),
  define('hg-cert-tube', '证书收纳', 'study', [36, 8, 8], [
    ['classic', CL.navy, CL.gold],
    ['modern', DARK, '#c9ced6'],
    ['farmhouse', F.barn, F.iron],
  ], certTube, { ...PROP, family: 'hg-cert-stored', sizeLabel: '毕业证书筒' }),
  define('hg-cert-box', '证书收纳', 'storage', [35, 36, 34], [
    ['nordic', N.linen, N.oak],
    ['modern', M.light, M.char],
    ['cute', C.sakura, C.white],
  ], certBox, { ...PROP, family: 'hg-cert-stored', sizeLabel: '收纳盒（打开）' }),
]

// ---------- 麻将：桌子和牌分开（自动麻将机是一体机，保留成品） ----------
// 折叠麻将桌、和室手积麻将桌只是桌子；牌墙 / 牌局是独立的桌面摆件，由一键布置摆到桌上。

/**
 * 牌墙：四边各一道（n 墩 × 2 层），在 y 高度；四道风车形围成方框——每道的一端顶着相邻那道的侧面，
 * 各自歪 2–4°、错开一点，互不重叠（见 kit.ts 的 pinwheelWalls）。seed 决定歪的方向和错位
 */
function tileWalls(y: number, seed: number, back: string, n = 17) {
  const g = new THREE.Group()
  const L = n * 2.6
  for (const w of pinwheelWalls(L, 3.5, seed)) {
    const side = G(rbox(L, 1.9, 3.5, IVORY, {}, 0.25), rbox(L, 0.7, 3.5, back, { y: 1.9 }, 0.25), rbox(L, 1.2, 3.5, IVORY, { y: 2.6 }, 0.25), rbox(L, 0.7, 3.5, back, { y: 3.8 }, 0.25))
    g.add(P(side, w.x, y, w.z, 0, w.ry))
  }
  return g
}
/** 自动麻将桌·盖着桌罩：[桌框, 桌布, 罩布] */
function mjCovered([frame, , cover]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 68, 5, frame, { x: sx * 38, z: sz * 38 }, 1))
  g.add(rbox(88, 3, 88, frame, { y: 68 }, 1))
  g.add(rbox(89, 5, 89, cover, { y: 70.4 }, 1.4))
  for (let k = 0; k < 4; k++) g.add(P(G(rbox(89, 14, 0.8, shade(cover, -0.08), { z: 44.6 }, 0.3)), 0, 60, 0, 0, (k * PI) / 2))
  return g
}
/** 折叠麻将桌（打开，桌面铺着绒面）：[桌面, 绒面] */
function mjFold([top, felt]: string[]) {
  const g = new THREE.Group()
  const a = 0.5
  const L = 69.6 / Math.cos(a)
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.add(P(G(rbox(3, L, 3, DARK, { y: -L / 2 }, 1)), s * 34, 34.8, 0, t * a))
  g.add(cylX(1, 74, DARK, 0, 34.8, 0))
  g.add(rbox(80, 2.4, 80, top, { y: 69.6 }, 0.6))
  g.add(rbox(74, 0.4, 74, felt, { y: 72 }, 0.2))
  return fitGroup(g)
}
/** 折叠麻将桌（收起靠墙立着）：[桌面] */
function mjFoldClosed([top]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(80, 80, 2.4, top, { y: 1 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(3, 78, 3, DARK, { x: s * 30, y: 2, z: 2.8 }, 1))
  return fitGroup(g)
}
/** 和室手积麻将桌（座卓式，四边有挡牌的边框，四角有点棒抽屉）：[桌框, 桌布] */
function jantaku([frame, felt]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 28, 5, frame, { x: sx * 33, z: sz * 33 }, 0.8))
  g.add(rbox(75, 5, 75, frame, { y: 28 }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(75, 2.2, 4, frame, { y: 33, z: s * 35.5 }, 0.8))
    g.add(rbox(4, 2.2, 67, frame, { x: s * 35.5, y: 33 }, 0.8))
  }
  g.add(rbox(67, 0.4, 67, felt, { y: 33 }, 0.2))
  for (let k = 0; k < 4; k++) g.add(P(G(rbox(10, 2, 0.6, shade(frame, -0.2), { y: 29.5, z: 37.8 }, 0.3)), 0, 0, 0, 0, (k * PI) / 2))
  return fitGroup(g)
}
/** 麻将牌·砌好牌墙（不带牌垫，直接放在桌面 / 绒面上）：[牌背] */
function mjWalls([back]: string[]) {
  const g = tileWalls(0, 16, back, 15)
  g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x: -1, z: 1 }, 0.3), rbox(1.4, 1.4, 1.4, '#ffffff', { x: 1.3, z: -0.6 }, 0.3))
  return fitGroup(g)
}
/** 麻将牌·对局中（牌墙 + 四家手牌 + 舍牌，不带牌垫）：[牌背] */
function mjHands([back]: string[]) {
  const g = tileWalls(0, 13, back, 13)
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group()
    side.add(rbox(13 * 2.6, 3.5, 1.2, IVORY, { z: 24.5 }, 0.25), rbox(13 * 2.6, 3.5, 0.7, back, { z: 23.55 }, 0.25))
    side.add(rbox(6 * 2.6, 0.7, 7, back, { z: 5.5 }, 0.25), rbox(6 * 2.6, 1.2, 7, IVORY, { y: 0.7, z: 5.5 }, 0.25))
    g.add(P(side, 0, 0, 0, 0, (k * PI) / 2))
  }
  return fitGroup(g)
}
const FELTS: PalFlat[] = [
  ['chinese', CN.rosewood, '#2f8a5a'],
  ['modern', DARK, '#3d6fb8'],
  ['retro', '#7a4e2e', '#b8352b'],
  ['japanese', J.dark, '#3f7a4a'],
  ['cute', C.woodL, C.mint],
]
const TILE_BACKS: PalFlat[] = [
  ['chinese', '#2f8a5a'],
  ['modern', '#3d6fb8'],
  ['retro', '#e2702f'],
  ['japanese', '#d9c37a'],
  ['cute', C.pink],
]
const mahjongs: AssetDef[] = [
  define('hg-mj-covered', '自动麻将桌', 'hobby', [89, 89, 75.5], [
    ['chinese', CN.rosewood, '#2f8a5a', '#b8352b'],
    ['modern', DARK, '#3d6fb8', '#8a8d93'],
    ['retro', '#7a4e2e', '#2f8a5a', '#e0a526'],
    ['cute', C.woodL, C.mint, C.sakura],
  ], mjCovered, { surface: 75.4, family: 'int-mahjong-table', sizeLabel: '盖着桌罩' }),
  define('hg-mj-fold', '折叠麻将桌', 'hobby', [80, 80, 72.4], FELTS, mjFold, { surface: 72.4, family: 'hg-mj-fold', sizeLabel: '打开' }),
  define('hg-mj-fold-closed', '折叠麻将桌', 'hobby', [80, 9, 81], FELTS, mjFoldClosed, { family: 'hg-mj-fold', sizeLabel: '收起靠墙' }),
  define('hg-jantaku', '和室麻将桌', 'japanese', [76, 76, 35.6], FELTS, jantaku, { surface: 33.4, surfaceShape: [[[-33.5, -33.5], [33.5, -33.5], [33.5, 33.5], [-33.5, 33.5]]], family: 'hg-jantaku', sizeLabel: '手积 · 座卓', styles: ['japanese', 'chinese', 'modern', 'retro', 'cute'] }),
  define('hg-mj-walls', '麻将牌', 'hobby', [44, 44, 4.6], TILE_BACKS, mjWalls, { ...PROP, family: 'int-mahjong-set', sizeLabel: '砌好牌墙（不带牌垫）' }),
  define('hg-mj-hands', '麻将牌', 'hobby', [56, 56, 4.6], TILE_BACKS, mjHands, { ...PROP, family: 'int-mahjong-set', sizeLabel: '对局中（不带牌垫）' }),
]

// ---------- 棋：桌子、棋盘、棋罐各自独立 ----------
// 中式方桌式棋桌、独脚圆桌只是桌子；围棋盘（空盘 / 对局中 / 收官）和棋罐（木 / 藤编 / 陶，黑子 / 白子）是桌面摆件。
// 日式足付き碁盤 / 将棋盤本身就是落地的厚棋盘（直接放在榻榻米上），棋笥另放。

function gridDraw(n: number, wood: string, line: string, stars: boolean): Draw {
  return (c, W, H) => {
    c.fillStyle = wood
    c.fillRect(0, 0, W, H)
    c.strokeStyle = line
    c.lineWidth = Math.max(1, W / 220)
    const m = W * 0.06
    for (let i = 0; i < n; i++) {
      const t = m + ((W - 2 * m) * i) / (n - 1)
      const u = m + ((H - 2 * m) * i) / (n - 1)
      c.beginPath()
      c.moveTo(t, m)
      c.lineTo(t, H - m)
      c.moveTo(m, u)
      c.lineTo(W - m, u)
      c.stroke()
    }
    if (stars) {
      c.fillStyle = line
      for (const i of [3, 9, 15])
        for (const j of [3, 9, 15]) {
          c.beginPath()
          c.arc(m + ((W - 2 * m) * i) / (n - 1), m + ((H - 2 * m) * j) / (n - 1), W * 0.008, 0, PI * 2)
          c.fill()
        }
    }
  }
}
/** 棋盘上的棋子：落在 19 路交叉点上；fill 为落子比例（0 空盘） */
function goStones(w: number, d: number, y: number, fill: number, seed: number) {
  const g = new THREE.Group()
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const used = new Set<number>()
  const n = Math.round(361 * fill)
  const gx = (w * 0.88) / 18
  const gz = (d * 0.88) / 18
  for (let k = 0; k < n; k++) {
    // 收官时棋子多、遍布全盘；对局中集中在角和边
    const i = Math.floor(rnd() * 19)
    const j = Math.floor(rnd() * 19)
    if (used.has(i * 19 + j)) continue
    used.add(i * 19 + j)
    g.add(ball(Math.min(gx, gz) * 0.46, k % 2 ? '#f8f6f0' : '#26262a', { x: -w * 0.44 + i * gx, y: y + 0.3, z: -d * 0.44 + j * gz }, [1, 0.42, 1]))
  }
  return g
}
/** 平板围棋盘（放在桌上）：[盘木, 线] */
function goBoardFlat(fill: number) {
  return ([wood, line]: string[]) => {
    const g = new THREE.Group()
    g.add(rbox(45, 2.4, 42, wood, {}, 0.4))
    g.add(paintTop(44, 41, `hg-goboard-${wood}-${line}`, gridDraw(19, wood, line, true), 0, 2.45, 0))
    if (fill) g.add(goStones(44, 41, 2.45, fill, 13 + Math.round(fill * 100)))
    return fitGroup(g)
  }
}
/** 棋罐：罐身 + 盖子（斜放在一旁露出棋子）：[罐色, 编织纹色] stone 黑 / 白 */
function goBowl(stone: 'black' | 'white', woven: boolean) {
  return ([body, band]: string[]) => {
    const g = new THREE.Group()
    const col = stone === 'black' ? '#26262a' : '#f8f6f0'
    g.add(ball(5.4, body, { y: 3.6 }, [1, 0.66, 1]))
    if (woven) for (const y of [1.6, 3.4, 5.2]) g.add(torus(5.1 - Math.abs(y - 3.4) * 0.35, 0.28, band, { y, rx: PI / 2 }))
    g.add(cyl(4.4, 4.6, 0.6, shade(body, -0.08), { y: 6.8 }, 20))
    for (let k = 0; k < 6; k++) g.add(ball(0.95, col, { x: Math.cos(k) * 2, y: 6.6, z: Math.sin(k) * 2 }, [1, 0.42, 1]))
    // 盖子靠在罐边
    g.add(P(G(ball(4.6, body, {}, [1, 0.3, 1])), 1.8, 7.6, -1.2, 0.12, 0, -0.1))
    return fitGroup(g)
  }
}
/** 中式方桌式棋桌（只是桌子，桌面浅色）：[桌木, 桌面] */
function qizhuo([wood, top]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 70, 5, wood, { x: sx * 32, z: sz * 32 }, 0.8))
  g.add(rbox(66, 6, 66, wood, { y: 64 }, 0.8))
  g.add(rbox(74, 3, 74, top, { y: 70 }, 1))
  return fitGroup(g)
}
/** 独脚圆桌（游戏桌）：[桌木] */
function roundGameTable([wood]: string[]) {
  const g = new THREE.Group()
  g.add(cyl(18, 22, 3, wood, {}, 24), cyl(4, 5, 64, wood, { y: 3 }, 16))
  g.add(cyl(32, 32, 3.4, wood, { y: 67 }, 32))
  return fitGroup(g)
}
/** 日式足付き碁盤（厚盘 + 四只脚，盘上有棋局）：[盘木, 脚] */
function goBan([wood, leg]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(3.4, 2.4, 9, leg, { x: sx * 15, z: sz * 13 }, 12))
  g.add(rbox(45, 15, 42, wood, { y: 9 }, 0.6))
  g.add(paintTop(44, 41, `hg-goban-${wood}`, gridDraw(19, wood, '#3a2a1e', true), 0, 24.05, 0))
  g.add(goStones(44, 41, 24.05, 0.12, 5))
  return fitGroup(g)
}
/** 日式足付き将棋盤（盘上摆着对局）：[盘木, 脚] */
function shogiBan([wood, leg]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(3, 2.2, 8, leg, { x: sx * 11, z: sz * 12 }, 12))
  g.add(rbox(33, 13, 36, wood, { y: 8 }, 0.5))
  g.add(paintTop(32, 35, `hg-shogiban-${wood}`, gridDraw(10, wood, '#3a2a1e', false), 0, 21.05, 0))
  let s = 9
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 16; i++) g.add(P(rbox(2.4, 0.8, 2.8, '#e9cf98', {}, 0.2), (Math.floor(rnd() * 9) - 4) * 3.3, 21, (Math.floor(rnd() * 9) - 4) * 3.6, 0, rnd() < 0.5 ? 0 : PI))
  return fitGroup(g)
}
const BOARD_WOOD: PalFlat[] = [
  ['chinese', '#e3c27f', '#3a2a1e'],
  ['japanese', '#e8c98a', '#3a2a1e'],
  ['nordic', '#ead7b8', '#4a3a2e'],
  ['retro', '#d9a868', '#3a2a1e'],
]
const BOWLS: PalFlat[] = [
  ['chinese', '#8a5a34', '#5a3b2a'],
  ['japanese', '#b88a5a', '#6e4f37'],
  ['nordic', '#d9b98c', '#b8955f'],
  ['modern', '#e9e6df', '#c3c7cc'],
]
const gameTables: AssetDef[] = [
  define('hg-qizhuo', '棋桌', 'hobby', [74, 74, 73], [
    ['chinese', CN.rosewood, '#e9c98f'],
    ['nordic', N.oak, N.oakL],
    ['retro', '#7a4e2e', '#e3c27f'],
  ], qizhuo, { surface: 73, family: 'hg-game-table', sizeLabel: '中式方桌', styles: ['chinese', 'nordic', 'retro'] }),
  define('hg-game-table-round', '棋桌', 'hobby', [64, 64, 70.4], [
    ['classic', CL.walnut],
    ['modern', DARK],
    ['farmhouse', F.oak],
    ['nordic', N.oak],
  ], roundGameTable, { surface: 70.4, surfaceShape: [[[-22, -22], [22, -22], [22, 22], [-22, 22]]], family: 'hg-game-table', sizeLabel: '独脚圆桌' }),
  define('hg-go-board', '围棋盘', 'hobby', [45, 42, 2.6], BOARD_WOOD, goBoardFlat(0), { ...PROP, family: 'hg-go-board', sizeLabel: '空盘' }),
  define('hg-go-board-mid', '围棋盘', 'hobby', [45, 42, 3.4], BOARD_WOOD, goBoardFlat(0.14), { ...PROP, family: 'hg-go-board', sizeLabel: '对局中' }),
  define('hg-go-board-end', '围棋盘', 'hobby', [45, 42, 3.4], BOARD_WOOD, goBoardFlat(0.42), { ...PROP, family: 'hg-go-board', sizeLabel: '收官' }),
  define('hg-go-bowl-black', '棋罐', 'hobby', [14, 13, 10], BOWLS, goBowl('black', false), { ...PROP, family: 'hg-go-bowl', sizeLabel: '黑子', limit: { scope: 'surface', max: 1, group: 'hg-go-bowl-black' } }),
  define('hg-go-bowl-white', '棋罐', 'hobby', [14, 13, 10], BOWLS, goBowl('white', false), { ...PROP, family: 'hg-go-bowl', sizeLabel: '白子', limit: { scope: 'surface', max: 1, group: 'hg-go-bowl-white' } }),
  define('hg-go-bowl-rattan-black', '棋罐', 'hobby', [14, 13, 10], [['chinese', '#c9a46a', '#8a6a3a'], ['nordic', '#e0c79a', '#b8955f']], goBowl('black', true), { ...PROP, family: 'hg-go-bowl', sizeLabel: '藤编 · 黑子', limit: { scope: 'surface', max: 1, group: 'hg-go-bowl-black' } }),
  define('hg-go-bowl-rattan-white', '棋罐', 'hobby', [14, 13, 10], [['chinese', '#c9a46a', '#8a6a3a'], ['nordic', '#e0c79a', '#b8955f']], goBowl('white', true), { ...PROP, family: 'hg-go-bowl', sizeLabel: '藤编 · 白子', limit: { scope: 'surface', max: 1, group: 'hg-go-bowl-white' } }),
  define('hg-go-ban', '围棋', 'japanese', [45, 42, 25], [
    ['japanese', '#e8c98a', J.dark],
    ['retro', '#e3c27f', '#5a3b2a'],
  ], goBan, { family: 'hg-ban', sizeLabel: '足付き碁盤' }),
  define('hg-shogi-ban', '将棋', 'japanese', [33, 36, 22], [
    ['japanese', '#e8c98a', J.dark],
    ['retro', '#e3c27f', '#5a3b2a'],
  ], shogiBan, { family: 'hg-ban', sizeLabel: '足付き将棋盤' }),
]

// ---------- 欧美：台球桌、飞镖盘 ----------

/** 台球桌：[木框, 台呢, 边库] */
function poolTable([wood, felt, rail]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.add(rbox(9, 62, 9, wood, { x: sx * 100, z: sz * 50 }, 1.5))
  g.add(rbox(226, 14, 126, wood, { y: 62 }, 2))
  g.add(rbox(206, 1, 106, felt, { y: 76 }, 0.3))
  for (const s of [-1, 1]) {
    g.add(rbox(226, 5, 10, rail, { y: 76, z: s * 58 }, 1))
    g.add(rbox(10, 5, 106, rail, { x: s * 108, y: 76 }, 1))
  }
  // 袋口
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.add(noOutline(cyl(4.2, 4.2, 0.6, '#1d1d1f', { x: sx * 103, y: 76.9, z: sz * 53 }, 16)))
  // 三角摆好的球 + 母球
  const cols = ['#e3b549', '#3d6fb8', '#c8473a', '#6b4ea0', '#e2702f', '#2f8a5a', '#7a2e3a', '#26262a']
  let k = 0
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) g.add(ball(2.8, cols[k++ % cols.length], { x: 40 + row * 4.9, y: 79.8, z: (i - row / 2) * 5.7 }))
  g.add(ball(2.8, '#fbf8f0', { x: -50, y: 79.8, z: 0 }))
  // 球杆斜放在台面上
  g.add(P(cyl(0.7, 1.3, 140, '#d9b98c', {}, 10), -20, 78.4, 22, 0, 0, PI / 2 - 0.01))
  return fitGroup(g)
}
const DART_MOUNT = 150
/** 飞镖盘：[外圈, 色环 1, 色环 2] */
function dartboard([rim, c1, c2]: string[]) {
  const g = new THREE.Group()
  g.add(cylZ(23, 3, rim, 0, 23, 0, 40))
  g.add(paintPanel(32, 32, `hg-dart-${c1}-${c2}`, (c, W, H) => {
    c.fillStyle = rim
    c.fillRect(0, 0, W, H)
    const cx = W / 2
    const cy = H / 2
    const R = W / 2
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * PI * 2 - PI / 20
      const a1 = a0 + PI / 10
      for (const [r0, r1, col] of [
        [R * 0.95, R, i % 2 ? c1 : c2],
        [R * 0.6, R * 0.95, i % 2 ? '#26262a' : '#f2ead2'],
        [R * 0.55, R * 0.6, i % 2 ? c1 : c2],
        [R * 0.1, R * 0.55, i % 2 ? '#26262a' : '#f2ead2'],
      ] as [number, number, string][]) {
        c.fillStyle = col
        c.beginPath()
        c.arc(cx, cy, r1, a0, a1)
        c.arc(cx, cy, r0, a1, a0, true)
        c.fill()
      }
    }
    c.fillStyle = c2
    c.beginPath()
    c.arc(cx, cy, R * 0.1, 0, PI * 2)
    c.fill()
    c.fillStyle = c1
    c.beginPath()
    c.arc(cx, cy, R * 0.045, 0, PI * 2)
    c.fill()
  }, { y: 7, z: 1.6 }))
  // 插着的三支飞镖
  for (const [x, y] of [
    [3, 26],
    [-6, 20],
    [8, 16],
  ] as [number, number][])
    g.add(P(G(cyl(0.25, 0.25, 7, '#c9ced6', {}, 6), rbox(1.6, 2.4, 0.1, '#c8473a', { y: 5.6 }, 0.05)), x, y, 1.8, PI / 2 - 0.15))
  return fitGroup(g, DART_MOUNT)
}
/** 飞镖柜（门打开，两侧小黑板记分）：[柜木, 色环 1, 色环 2] */
function dartCabinet([wood, c1, c2]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(56, 60, 2, wood, { z: -2 }, 0.6))
  for (const s of [-1, 1]) g.add(rbox(2, 60, 7, wood, { x: s * 27, z: 0.5 }, 0.5))
  for (const y of [0, 58]) g.add(rbox(56, 2, 7, wood, { y, z: 0.5 }, 0.5))
  const board = dartboard([DARK, c1, c2])
  // dartboard() 按含飞镖的包围盒居中，镖盘本体在中心之后约 3cm：往前挪回来
  board.position.set(0, -DART_MOUNT + 7, 4.6)
  g.add(board)
  for (const s of [-1, 1]) {
    // 门打开约 160°：从柜边向外、稍微朝前
    const door = G(rbox(27, 60, 2, wood, { x: s * 13.5 }, 0.6), noOutline(rbox(22, 46, 0.2, '#2f3a33', { x: s * 13.5, y: 7, z: 1.05 }, 0.1)))
    g.add(P(door, s * 28, 0, 3.5, 0, -s * 0.35))
  }
  return fitGroup(g, DART_MOUNT - 7)
}
const westGames: AssetDef[] = [
  define('hg-pool-table', '台球桌', 'hobby', [226, 126, 85], [
    ['classic', CL.walnut, '#2f7a4a', '#5a3b2a'],
    ['farmhouse', F.oak, '#7a2e3a', F.iron],
    ['modern', DARK, '#3d6fb8', '#3d3f44'],
    ['industrial', I.iron, '#5a5f66', I.walnut],
  ], poolTable),
  define('hg-dartboard', '飞镖盘', 'hobby', [46, 12, 46], [
    ['modern', DARK, '#c8473a', '#2f8a5a'],
    ['industrial', I.iron, I.rust, '#3a5a3c'],
    ['farmhouse', F.iron, F.barn, F.sage],
  ], dartboard, { mount: DART_MOUNT, family: 'hg-dart', sizeLabel: '单盘' }),
  define('hg-dart-cabinet', '飞镖盘', 'hobby', [112, 30, 60], [
    ['classic', CL.walnut, '#c8473a', '#2f8a5a'],
    ['farmhouse', F.oak, F.barn, F.sage],
    ['industrial', I.walnut, I.rust, '#3a5a3c'],
  ], dartCabinet, { mount: DART_MOUNT - 7, family: 'hg-dart', sizeLabel: '飞镖柜（门打开）' }),
]

// ---------- 双人设定：并排电竞台、双人书桌；RGB 灯板、吸音棉 ----------

/** 双人并排电竞台（碳纹台面 + 底部 RGB 灯带 + 中间理线槽）：[台面, 桌腿, 灯色] */
function duoGamingDesk([top, leg, light]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 0, 1]) g.add(rbox(sx ? 8 : 6, 72, 60, leg, { x: sx * 112 }, 1))
  g.add(rbox(240, 3, 75, top, { y: 72 }, 1))
  g.add(glow(236, 1, light, { y: 70.5, z: 37.6 }, 0.8))
  g.add(rbox(60, 4, 12, shade(leg, 0.1), { y: 66, z: -28 }, 0.6))
  return g
}
/** 双人书桌（中间矮隔板）：[台面, 腿, 隔板] */
function duoDesk([top, leg, panel]: string[]) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 71, 4, leg, { x: sx * 96, z: sz * 27 }, 0.8))
  g.add(rbox(200, 3, 60, top, { y: 71 }, 0.8))
  g.add(rbox(1.6, 20, 40, panel, { y: 74, z: -10 }, 0.4))
  return g
}
const HEX_MOUNT = 150
/** 六边形 RGB 灯板（拼成一组蜂窝）：[灯色 1, 灯色 2, 灯色 3] */
function hexLights([a, b, c]: string[]) {
  const g = new THREE.Group()
  const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2], [2.5, 1]]
  cells.forEach(([i, j], k) => {
    const x = i * 15.5
    const y = j * 13.4
    const m = P(cyl(8.6, 8.6, 1.4, [a, b, c][k % 3], {}, 6), x, y, 0.7, PI / 2, 0, PI / 6)
    m.material = toon([a, b, c][k % 3], { emissive: 0.75 })
    m.userData.noOutline = true
    g.add(m, P(cyl(9, 9, 1, '#2a2a2e', {}, 6), x, y, 0.5, PI / 2, 0, PI / 6))
  })
  return fitGroup(g, HEX_MOUNT)
}
const FOAM_MOUNT = 120
/** 吸音棉（3 × 2 块，楔形纹路交替）：[色 1, 色 2] */
function acousticPanels([a, b]: string[]) {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const col = (i + j) % 2 ? a : b
      const cell = new THREE.Group()
      cell.add(rbox(29, 29, 2, shade(col, -0.08), {}, 0.4))
      for (let k = 0; k < 4; k++) {
        const ridge = (i + j) % 2 ? rbox(29, 4, 2.4, col, { y: 2 + k * 7, z: 1.2 }, 0.8) : rbox(4, 29, 2.4, col, { x: -10.5 + k * 7, z: 1.2 }, 0.8)
        cell.add(ridge)
      }
      g.add(P(cell, (i - 1) * 30, j * 30, 0))
    }
  return fitGroup(g, FOAM_MOUNT)
}
const duo: AssetDef[] = [
  define('hg-duo-gaming-desk', '双人电竞台', 'study', [240, 75, 75], [
    ['modern', DARK, '#3d3f44', '#7a5cff'],
    ['cute', C.white, C.pink, '#ff7ad9'],
    ['industrial', I.iron, I.steel, '#36d1c4'],
  ], duoGamingDesk, { surface: 75, styles: ['modern', 'cute', 'industrial'] }),
  define('hg-duo-desk', '双人书桌', 'study', [200, 60, 94], [
    ['nordic', N.oak, N.white, N.white],
    ['modern', M.white, M.char, M.light],
    ['japanese', J.hinoki, J.wood, J.washi],
    ['classic', CL.walnut, CL.walnut, CL.cream],
  ], duoDesk, { surface: 74, surfaceShape: [[[-100, -30], [-1, -30], [-1, 30], [-100, 30]], [[1, -30], [100, -30], [100, 30], [1, 30]]] }),
  define('hg-hex-lights', '六边形灯板', 'lighting', [56, 10, 46], [
    ['modern', '#7a5cff', '#36d1c4', '#ff5ca8'],
    ['cute', '#ff9ec7', '#a8d4f4', '#ffe08f'],
    ['industrial', '#ff7a3a', '#ffd166', '#36d1c4'],
  ], hexLights, { mount: HEX_MOUNT }),
  define('hg-acoustic', '吸音棉', 'music', [89, 3, 59], [
    ['modern', '#3d3f44', '#5a5f66'],
    ['industrial', '#2a2a2e', I.rust],
    ['cute', C.lilac, C.sky],
    ['nordic', N.gray, N.sage],
  ], acousticPanels, { mount: FOAM_MOUNT }),
]

export const HONORS_GAMES: AssetDef[] = [...trophies, ...medals, ...certs, ...mahjongs, ...gameTables, ...westGames, ...duo]
