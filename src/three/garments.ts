// 参数化衣物生成器：品类 × 款式参数 × 配色 / 花纹，组合出无数种衣服、毛巾；衣架和衣服分开建模。
//
// 约定：
//   - 单位 cm。衣服正面朝 +z。叠好（folded）/ 平放（lying）形态原点在底面中心。
//   - 挂起（hanging）形态遵循 kit.ts 的约定：原点 = 挂点（衣架钩环内顶在 y ≈ -0.5，和 storage-forms 的衣架钩一致），
//     模型都在原点下方；单件挂起时衣服朝 +z、整体在 z ≥ 0.3（钩环往 -z 搭在杆 / 钩上），这样能直接挂到现有的挂衣杆、
//     挂钩排、洞洞板上（snapToHook）。
//   - 衣架是独立的 builder（buildHanger）：挂起形态 build 时按品类自动配衣架——上衣 / 外套 / 连衣裙用肩形衣架，
//     半身裙 / 牛仔裤 / 短裤用夹子衣架，西裤用带横杆的衣架对折搭挂，和服用和服衣架，围巾 / 帽子用 S 钩，领带用领带架。
//   - 一排衣服（garmentRow）：衣服侧挂在杆上（肩线垂直于杆），钩环绕着沿 x 的杆，原点在杆顶，衣服以 z = 0 为中心前后对称。
//     整排烘成一个顶点色网格（花纹衣服除外），几十件衣服只有几个 draw call。
//   - 面数：衣身是挤出的低面数剪影（一件约 100–400 个三角形），不用 RoundedBox。

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { patternMaterial } from './fabric'
import type { PatternKind, PatternSpec } from './patterns'
import { shade, toon } from './toon'
import { C, S, rng, type StyleTag } from './kit'

const PI = Math.PI
type V2 = [number, number]
type V3 = [number, number, number]
type Rand = () => number

// ───────────────────────── 类型 ─────────────────────────

export type GarmentKind =
  | 'tee'
  | 'tank'
  | 'polo'
  | 'shirt'
  | 'blouse'
  | 'hoodie'
  | 'sweatshirt'
  | 'sweater'
  | 'cardigan'
  | 'jacket'
  | 'blazer'
  | 'coat'
  | 'trench'
  | 'down'
  | 'dress'
  | 'skirt'
  | 'pants'
  | 'jeans'
  | 'shorts'
  | 'overalls'
  | 'kimono'
  | 'scarf'
  | 'tie'
  | 'hat'
  | 'towel'

export const GARMENT_LABELS: Record<GarmentKind, string> = {
  tee: 'T 恤',
  tank: '背心 / 吊带',
  polo: 'POLO 衫',
  shirt: '衬衫',
  blouse: '女式衬衫',
  hoodie: '连帽衫',
  sweatshirt: '卫衣',
  sweater: '毛衣',
  cardigan: '开衫',
  jacket: '夹克',
  blazer: '西装外套',
  coat: '大衣',
  trench: '风衣',
  down: '羽绒服',
  dress: '连衣裙',
  skirt: '半身裙',
  pants: '西裤 / 长裤',
  jeans: '牛仔裤',
  shorts: '短裤',
  overalls: '背带裤',
  kimono: '和服 / 浴衣',
  scarf: '围巾',
  tie: '领带',
  hat: '帽子',
  towel: '毛巾',
}

export type Collar = 'crew' | 'v' | 'shirt' | 'polo' | 'hood' | 'turtle' | 'stand' | 'lapel' | 'round' | 'bow' | 'none'
export type HangerType = 'shoulder' | 'clip' | 'bar' | 'kimono' | 'tie' | 'shook'
export type HangerMat = 'wood' | 'plastic' | 'wire' | 'velvet'
export type Wardrobe = 'women' | 'men' | 'kids' | 'casual' | 'outer'

export interface GarmentSpec {
  kind: GarmentKind
  /** 主色、副色（罗纹、领、腰头）、点缀色（纽扣、拉链、内搭） */
  main: string
  sub: string
  accent: string
  /** 主色布料上的花纹（条纹、格子、印花…），null = 纯色 */
  pattern: PatternSpec | null
  /** 衣长：上衣 / 连衣裙从领口量，下装从腰头量，cm */
  len: number
  /** 肩宽（上衣）/ 腰宽（下装）/ 幅宽（围巾、毛巾） */
  width: number
  /** 袖长，0 = 无袖 */
  sleeve: number
  collar: Collar
  /** 宽松度 0–1：衣身、袖口加宽 */
  fit: number
  /** 下摆宽 / 胸宽：1 = 直筒，>1 = A 字 / 喇叭 */
  hem: number
  buttons: number
  /** 双排扣 */
  double: boolean
  zip: boolean
  pockets: boolean
  pleats: boolean
  /** 吊带（吊带裙、吊带背心） */
  straps: boolean
  belt: boolean
  rib: boolean
  /** 羽绒服的绗缝道数 */
  quilt: number
  /** 布料厚度 */
  thick: number
  /** 品类内的变体：帽子（cap / beanie / bucket / straw / fedora / beret）、毛巾（bath / face / hand）、领带条数… */
  variant: string
  hanger: HangerMat
  /** 袖子张开的程度 0–1（默认 1）；成排侧挂时袖子几乎垂直，省进深 */
  drape?: number
  /** 衣架颜色（不给按材质默认） */
  hangerColor?: string
}

// ───────────────────────── 低面数零件 ─────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry>()
function cg<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key)
  if (!g) {
    if (geoCache.size > 4000) geoCache.clear()
    g = make()
    g.userData.shared = true
    geoCache.set(key, g)
  }
  return g as T
}
const r1 = (n: number) => Math.round(n * 10) / 10

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 挤出的剪影板：xy 平面内的多边形，厚 T，z 居中 */
function panel(pts: V2[], T: number, mat: THREE.Material, z = 0, bevel = 0.35) {
  const key = 'pn' + pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(';') + `|${r1(T)}|${r1(bevel)}`
  const geo = cg(key, () => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
    const b = Math.min(bevel, T * 0.3)
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, T - b * 2), bevelEnabled: b > 0.01, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 3 })
    g.translate(0, 0, -T / 2 + b)
    return g
  })
  return mesh(geo, mat, 0, 0, z)
}

/** 盒子（中心定位） */
function bx(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rz = 0, ry = 0, rx = 0) {
  const geo = cg(`bx${r1(w)},${r1(h)},${r1(d)}`, () => new THREE.BoxGeometry(w, h, d))
  return mesh(geo, mat, x, y, z, rx, ry, rz)
}

/** 倒角盒（一段圆角，中心定位）：叠好的衣服、毛巾 */
function rb(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0.8) {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 0.01)
  const geo = cg(`rb${r1(w)},${r1(h)},${r1(d)},${r1(rr)}`, () => new RoundedBoxGeometry(w, h, d, 1, Math.max(0.01, rr)))
  return mesh(geo, mat, x, y, z)
}

const UP = new THREE.Vector3(0, 1, 0)
/** 两点之间的细杆 */
function stk(a: V3, b: V3, r: number, mat: THREE.Material, seg = 6) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const len = dir.length()
  const geo = cg(`st${r1(r)},${r1(len)},${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg, 1))
  const m = mesh(geo, mat)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  if (len > 1e-6) m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return m
}

/** 圆柱（中心定位，轴沿 y） */
function cy(rt: number, rbm: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0, seg = 10) {
  const geo = cg(`cy${r1(rt)},${r1(rbm)},${r1(h)},${seg}`, () => new THREE.CylinderGeometry(rt, rbm, h, seg, 1))
  return mesh(geo, mat, x, y, z, rx, 0, rz)
}

/** 低面数椭球 */
function bl(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const geo = cg(`bl${r1(r)}`, () => new THREE.SphereGeometry(r, 10, 6))
  const m = mesh(geo, mat, x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}

/** 半球（开口朝下，底面在 y） */
function dome(r: number, mat: THREE.Material, y = 0, sy = 1) {
  const geo = cg(`dm${r1(r)}`, () => new THREE.SphereGeometry(r, 12, 5, 0, PI * 2, 0, PI / 2))
  const m = mesh(geo, mat, 0, y, 0)
  m.scale.y = sy
  return m
}

/** 平滑管子（衣架钩、带子） */
function tube(pts: V3[], r: number, mat: THREE.Material, seg = 16) {
  const key = 'tb' + pts.map((p) => p.map(r1).join(',')).join(';') + `|${r1(r)}|${seg}`
  const geo = cg(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal'), seg, r, 5, false))
  return mesh(geo, mat)
}

function arcPts(cx: number, cy0: number, r: number, a0: number, a1: number, n: number, plane: 'xy' | 'yz', depth = 0): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push(plane === 'xy' ? [cx + Math.cos(a) * r, cy0 + Math.sin(a) * r, depth] : [depth, cy0 + Math.sin(a) * r, cx + Math.cos(a) * r])
  }
  return out
}

const G = (...c: THREE.Object3D[]) => {
  const g = new THREE.Group()
  for (const o of c) g.add(o)
  return g
}

const mirror = (pts: V2[]): V2[] => [...pts, ...pts.slice().reverse().map(([x, y]): V2 => [-x, y])]
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function box3(o: THREE.Object3D) {
  o.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(o, true)
}

// ───────────────────────── 材质 ─────────────────────────

interface Mats {
  main: THREE.Material
  plain: THREE.Material
  dark: THREE.Material
  sub: THREE.Material
  acc: THREE.Material
  hanger: THREE.Material
  metal: THREE.Material
}

const HANGER_COLORS: Record<HangerMat, string> = { wood: '#c99a66', plastic: '#f4f1ec', wire: '#c3c7cc', velvet: '#3a3a40' }

function mats(s: GarmentSpec, usePattern = true): Mats {
  const plain = toon(s.main)
  return {
    main: usePattern && s.pattern ? patternMaterial(s.pattern) : plain,
    plain,
    dark: toon(shade(s.main, -0.09)),
    sub: toon(s.sub),
    acc: toon(s.accent),
    hanger: toon(s.hangerColor ?? HANGER_COLORS[s.hanger]),
    metal: toon('#c3c7cc'),
  }
}

// ───────────────────────── 衣架（独立零件） ─────────────────────────

/** 衣架颈部落点 */
const NECK_Y = -5.4
/** 肩形衣架的肩条斜率：肩线 = 衣架肩条再高 1.6，肩条完全包在衣服里 */
const SLOPE = 0.42
const shoulderY = (x: number) => NECK_Y - SLOPE * Math.abs(x) + 1.6

/**
 * 衣架钩：钩环内顶在 y ≈ -0.5，脖子落到 (0, -5.4, zc)。
 * inPlane = false：钩环在 yz 平面（钩尾朝 -z），单件挂在挂钩 / 杆上时用（衣服朝 +z）；
 * inPlane = true ：钩环在衣架平面内（xy），一排侧挂时用：整件转 90° 后钩环正好绕着沿 x 的杆。
 */
function hookCurve(mat: THREE.Material, inPlane: boolean, zc: number) {
  if (inPlane) {
    const top = arcPts(0.2, -1.45, 1.2, PI * 1.2, -PI * 0.15, 8, 'xy')
    return tube([...top, [0.7, -3.2, 0], [0, -4.4, 0], [0, -5.4, 0]], 0.22, mat, 18)
  }
  const top = arcPts(0.2, -1.45, 1.2, PI * 1.2, -PI * 0.15, 8, 'yz')
  return tube([...top, [0, -3.2, (1.4 + zc) / 2], [0, -4.4, zc], [0, -5.4, zc]], 0.22, mat, 18)
}

/** 肩形衣架的肩条（不含钩）：半宽 hw；heavy = 厚肩（大衣、西装） */
function shoulderArms(m: Mats, hw: number, style: HangerMat, heavy: boolean, bar: boolean) {
  const g = new THREE.Group()
  const y0 = NECK_Y
  const yE = NECK_Y - SLOPE * hw
  const ang = Math.atan2(SLOPE * hw, hw)
  const len = Math.hypot(hw, SLOPE * hw)
  if (style === 'wire') {
    for (const s of [-1, 1]) g.add(stk([0, y0, 0], [s * hw, yE, 0], 0.22, m.hanger, 5))
    g.add(stk([-hw, yE, 0], [hw, yE, 0], 0.22, m.hanger, 5))
    return g
  }
  const t = style === 'velvet' ? 0.8 : heavy ? 1.8 : 1.3
  const d = style === 'velvet' ? 0.7 : heavy ? 3 : 1
  for (const s of [-1, 1]) g.add(bx(len, t, d, m.hanger, (s * hw) / 2, (y0 + yE) / 2 - t * 0.2, 0, -s * ang))
  g.add(bx(3, 1.8, d + 0.2, m.hanger, 0, y0 - 0.6, 0))
  if (bar || style === 'plastic') g.add(stk([-hw + 1, yE - 1, 0], [hw - 1, yE - 1, 0], style === 'plastic' ? 0.35 : 0.45, m.hanger, 6))
  return g
}

/** 夹子衣架：一根横杆 + 两个夹子；衣服顶边在 y = CLIP_TOP */
const CLIP_TOP = -9
function clipBar(m: Mats, hw: number, style: HangerMat) {
  const g = new THREE.Group()
  const y = -6.2
  g.add(style === 'wire' ? stk([-hw, y, 0], [hw, y, 0], 0.25, m.hanger, 5) : bx(hw * 2, 1.4, 1, m.hanger, 0, y, 0))
  g.add(bx(2, 1.4, 1.2, m.hanger, 0, y + 0.6, 0))
  for (const s of [-1, 1]) {
    g.add(bx(2.2, 3.6, 0.5, m.metal, s * (hw - 2.5), y - 2.4, 0.45))
    g.add(bx(2.2, 3.6, 0.5, m.metal, s * (hw - 2.5), y - 2.4, -0.45))
  }
  return g
}

/** 领带架：横杆在 y = TIE_BAR */
const TIE_BAR = -8
function tieBar(m: Mats) {
  const g = new THREE.Group()
  g.add(stk([0, NECK_Y, 0], [-9, TIE_BAR, 0], 0.25, m.hanger, 5), stk([0, NECK_Y, 0], [9, TIE_BAR, 0], 0.25, m.hanger, 5))
  g.add(stk([-9, TIE_BAR, 0], [9, TIE_BAR, 0], 0.3, m.hanger, 6))
  return g
}

/** S 钩：上环开口朝后（内顶 y ≈ -0.5），下环最低点 (0, S_LOW, zc) */
const S_LOW = -6.4
function sHook(mat: THREE.Material, zc = 2.6) {
  const top = arcPts(0.2, -1.45, 1.2, PI * 1.15, 0, 7, 'yz')
  const bottom = arcPts(zc, -5.2, 1.2, PI, PI * 2.2, 7, 'yz')
  return tube([...top, ...bottom], 0.25, mat, 30)
}

/**
 * 独立的衣架（素材库单独展示、或给衣物用）：挂起形态，原点在钩环内顶上方 0.5。
 * type：shoulder 肩形 / bar 带裤杆 / clip 夹子 / kimono 和服 / tie 领带架 / shook S 钩。
 */
export function buildHanger(type: HangerType, style: HangerMat, color?: string, opts: { hw?: number; inPlane?: boolean; heavy?: boolean } = {}) {
  const m = mats({ ...DEFAULT_SPEC, hanger: style, hangerColor: color })
  const inPlane = opts.inPlane ?? false
  const hw = opts.hw ?? 20
  let body: THREE.Group
  if (type === 'shook') return G(sHook(m.hanger))
  if (type === 'clip') body = clipBar(m, hw * 0.85, style)
  else if (type === 'tie') body = tieBar(m)
  else if (type === 'kimono') body = G(stk([-65, -6, 0], [65, -6, 0], 0.6, m.hanger, 8), bl(1.2, m.hanger, -65, -6), bl(1.2, m.hanger, 65, -6))
  else body = shoulderArms(m, hw, style, !!opts.heavy, type === 'bar')
  return attachHook(body, m, inPlane)
}

/** 给衣架 + 衣服的整体加钩：单件挂起时整体挪到 z ≥ 0.3 */
function attachHook(body: THREE.Group, m: Mats, inPlane: boolean) {
  if (inPlane) return G(body, hookCurve(m.hanger, true, 0))
  const b = box3(body)
  const dz = 0.3 - b.min.z
  body.position.z += dz
  return G(body, hookCurve(m.hanger, false, dz))
}

// ───────────────────────── 品类参数 ─────────────────────────

interface KindInfo {
  /** 挂起时用的衣架 */
  hanger: HangerType
  /** 叠好的尺寸（成人）[宽, 深, 高] */
  fold: [number, number, number]
  thick: number
  /** 上衣类（剪影带肩、袖） */
  top?: boolean
  /** 衣长、肩宽 / 腰宽、袖长的范围（成人） */
  len: [number, number]
  width: [number, number]
  sleeve: [number, number]
  collars: Collar[]
  patterns: PatternKind[]
}

const K: Record<GarmentKind, KindInfo> = {
  tee: { hanger: 'shoulder', fold: [28, 32, 3], thick: 1.2, top: true, len: [60, 72], width: [40, 50], sleeve: [16, 24], collars: ['crew', 'crew', 'v'], patterns: ['stripes', 'stars', 'dots'] },
  tank: { hanger: 'shoulder', fold: [26, 28, 2.2], thick: 0.9, top: true, len: [52, 64], width: [34, 42], sleeve: [0, 0], collars: ['none'], patterns: ['stripes', 'flowers', 'gingham'] },
  polo: { hanger: 'shoulder', fold: [28, 32, 3.2], thick: 1.4, top: true, len: [64, 72], width: [42, 50], sleeve: [18, 24], collars: ['polo'], patterns: ['stripes'] },
  shirt: { hanger: 'shoulder', fold: [28, 36, 3.6], thick: 1.0, top: true, len: [70, 80], width: [42, 48], sleeve: [22, 62], collars: ['shirt'], patterns: ['stripes', 'gingham', 'tartan', 'houndstooth'] },
  blouse: { hanger: 'shoulder', fold: [28, 34, 3.2], thick: 0.9, top: true, len: [56, 66], width: [36, 42], sleeve: [20, 58], collars: ['round', 'bow', 'v', 'crew'], patterns: ['flowers', 'dots', 'stripes', 'gingham'] },
  hoodie: { hanger: 'shoulder', fold: [32, 36, 7], thick: 2.6, top: true, len: [62, 72], width: [44, 52], sleeve: [56, 62], collars: ['hood'], patterns: [] },
  sweatshirt: { hanger: 'shoulder', fold: [32, 34, 6], thick: 2.2, top: true, len: [60, 70], width: [44, 52], sleeve: [55, 60], collars: ['crew'], patterns: ['stripes'] },
  sweater: { hanger: 'shoulder', fold: [30, 34, 6], thick: 2.6, top: true, len: [58, 68], width: [42, 50], sleeve: [54, 60], collars: ['crew', 'v', 'turtle'], patterns: ['argyle', 'stripes', 'houndstooth'] },
  cardigan: { hanger: 'shoulder', fold: [30, 34, 5], thick: 2.0, top: true, len: [56, 74], width: [40, 48], sleeve: [52, 58], collars: ['v'], patterns: ['argyle', 'stripes'] },
  jacket: { hanger: 'shoulder', fold: [34, 38, 7], thick: 2.6, top: true, len: [58, 68], width: [44, 52], sleeve: [56, 62], collars: ['stand', 'shirt'], patterns: ['tartan'] },
  blazer: { hanger: 'shoulder', fold: [34, 40, 6], thick: 2.2, top: true, len: [66, 76], width: [40, 48], sleeve: [56, 62], collars: ['lapel'], patterns: ['houndstooth', 'tartan', 'stripes'] },
  coat: { hanger: 'shoulder', fold: [36, 42, 8], thick: 3.0, top: true, len: [88, 112], width: [42, 50], sleeve: [58, 64], collars: ['lapel', 'stand'], patterns: ['houndstooth', 'tartan'] },
  trench: { hanger: 'shoulder', fold: [36, 42, 7], thick: 2.6, top: true, len: [92, 112], width: [42, 48], sleeve: [58, 62], collars: ['lapel'], patterns: [] },
  down: { hanger: 'shoulder', fold: [36, 40, 12], thick: 5.2, top: true, len: [64, 100], width: [46, 52], sleeve: [58, 62], collars: ['stand', 'hood'], patterns: [] },
  dress: { hanger: 'shoulder', fold: [30, 38, 4.5], thick: 1.2, top: true, len: [86, 122], width: [34, 40], sleeve: [0, 56], collars: ['crew', 'v', 'round', 'shirt', 'none'], patterns: ['flowers', 'dots', 'gingham', 'sakura', 'stripes'] },
  skirt: { hanger: 'clip', fold: [30, 34, 3], thick: 1.2, len: [42, 86], width: [30, 36], sleeve: [0, 0], collars: ['none'], patterns: ['tartan', 'houndstooth', 'flowers', 'dots', 'gingham'] },
  pants: { hanger: 'bar', fold: [30, 40, 4], thick: 1.0, len: [96, 104], width: [36, 42], sleeve: [0, 0], collars: ['none'], patterns: ['houndstooth', 'stripes'] },
  jeans: { hanger: 'clip', fold: [32, 38, 5], thick: 1.6, len: [96, 104], width: [36, 42], sleeve: [0, 0], collars: ['none'], patterns: [] },
  shorts: { hanger: 'clip', fold: [28, 28, 3.4], thick: 1.4, len: [36, 50], width: [34, 40], sleeve: [0, 0], collars: ['none'], patterns: ['gingham', 'stripes'] },
  overalls: { hanger: 'shoulder', fold: [32, 38, 5.5], thick: 1.6, len: [120, 135], width: [38, 44], sleeve: [0, 0], collars: ['none'], patterns: ['stripes'] },
  kimono: { hanger: 'kimono', fold: [40, 86, 4], thick: 1.6, len: [136, 146], width: [62, 66], sleeve: [46, 50], collars: ['none'], patterns: ['asanoha', 'seigaiha', 'yagasuri', 'sakura', 'ichimatsu', 'kikko', 'shippo'] },
  scarf: { hanger: 'shook', fold: [24, 16, 5], thick: 0.8, len: [140, 180], width: [18, 30], sleeve: [0, 0], collars: ['none'], patterns: ['tartan', 'stripes', 'houndstooth', 'gingham'] },
  tie: { hanger: 'tie', fold: [8.6, 8.6, 7], thick: 0.5, len: [140, 148], width: [7, 9], sleeve: [0, 0], collars: ['none'], patterns: ['stripes', 'dots', 'argyle'] },
  hat: { hanger: 'shook', fold: [24, 24, 10], thick: 0.8, len: [0, 0], width: [0, 0], sleeve: [0, 0], collars: ['none'], patterns: ['tartan', 'houndstooth'] },
  towel: { hanger: 'shook', fold: [34, 26, 7], thick: 0.8, len: [0, 0], width: [0, 0], sleeve: [0, 0], collars: ['none'], patterns: ['stripes', 'gingham', 'dots', 'hearts', 'stars'] },
}

export const DEFAULT_SPEC: GarmentSpec = {
  kind: 'tee',
  main: '#f4f1ea',
  sub: '#e2ddd3',
  accent: '#5a6a80',
  pattern: null,
  len: 66,
  width: 44,
  sleeve: 20,
  collar: 'crew',
  fit: 0.3,
  hem: 1,
  buttons: 0,
  double: false,
  zip: false,
  pockets: false,
  pleats: false,
  straps: false,
  belt: false,
  rib: false,
  quilt: 0,
  thick: 1.2,
  variant: '',
  hanger: 'wood',
}

/** 按品类给一套合理的默认值，再用 o 覆盖 */
export function garment(kind: GarmentKind, o: Partial<GarmentSpec> = {}): GarmentSpec {
  const k = K[kind]
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2
  const base: GarmentSpec = { ...DEFAULT_SPEC, kind, len: mid(k.len), width: mid(k.width), sleeve: k.sleeve[1], collar: k.collars[0], thick: k.thick }
  const extra: Partial<GarmentSpec> = {
    shirt: { buttons: 7 },
    polo: { buttons: 2 },
    hoodie: { pockets: true, rib: true },
    sweatshirt: { rib: true },
    sweater: { rib: true },
    cardigan: { buttons: 5, rib: true },
    jacket: { zip: true, rib: true, pockets: true },
    blazer: { buttons: 2, pockets: true },
    coat: { buttons: 3, pockets: true, hem: 1.08 },
    trench: { buttons: 4, double: true, belt: true, hem: 1.12 },
    down: { zip: true, quilt: 5 },
    dress: { hem: 1.5 },
    skirt: { hem: 1.5 },
    jeans: { pockets: true },
    shorts: { hem: 1.1 },
    overalls: { pockets: true },
    hat: { variant: 'cap' },
    towel: { variant: 'bath' },
    tie: { variant: '1' },
  }[kind as string] ?? {}
  return { ...base, ...extra, ...o }
}

// ───────────────────────── 上衣 / 连衣裙剪影 ─────────────────────────

/** 上衣类（含连衣裙、外套）：衣身 + 袖 + 领 + 细节；z = 0 居中，正面朝 +z。返回不含衣架的衣服 */
function buildTop(s: GarmentSpec, m: Mats) {
  const g = new THREE.Group()
  const T = s.thick
  const k = s.width / 44
  const sw = s.width
  const nw = clamp(sw * 0.16, 4, 8)
  const yN = shoulderY(nw)
  const yS = shoulderY(sw / 2)
  const arm = (17 + s.fit * 5) * Math.max(0.7, k)
  const bw = sw * (1.02 + s.fit * 0.12)
  const yB = yN - s.len
  const front = T / 2
  const isDress = s.kind === 'dress'
  const lapel = s.collar === 'lapel'
  const dip = { crew: 2.2, v: 12 * k, shirt: 1.6, polo: 1.6, hood: 2.5, turtle: 0, stand: 0.8, lapel: 1, round: 2.6, bow: 2, none: 2 }[s.collar]
  // 衣身
  let right: V2[]
  if (s.straps) {
    const yTop = yS - 6 * k
    right = [[bw * 0.38, yTop], [bw / 2, yTop - 3], [bw / 2, yS - arm]]
  } else right = [[nw, yN], [sw / 2, yS], [bw / 2, yS - arm]]
  if (isDress) {
    const yW = yS - arm - 13 * k
    right.push([bw * 0.42, yW], [(bw * s.hem) / 2, yB])
  } else if (s.belt) {
    const yW = yS - arm - 14 * k
    right.push([bw * 0.48, yW], [(bw * s.hem) / 2, yB])
  } else right.push([(bw * s.hem) / 2, yB])
  const neckY = s.straps ? yS - 6 * k - 1 : yN - dip
  const body = mirror(right)
  body.unshift([0, neckY])
  g.add(panel(body, T, m.main))
  const widthAt = (y: number) => {
    // 剪影在高度 y 的半宽（线性插值右侧轮廓）
    for (let i = 0; i < right.length - 1; i++) {
      const [x0, y0] = right[i]
      const [x1, y1] = right[i + 1]
      if (y <= y0 && y >= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1)
    }
    return right[right.length - 1][0]
  }
  // 吊带
  if (s.straps) {
    const ha = hangerHalf(s) - 4
    const wide = s.kind === 'tank' && s.fit > 0.4
    for (const sx of [-1, 1]) {
      if (wide) g.add(panel([[sx * (bw * 0.38 - 4), yS - 6 * k], [sx * bw * 0.38, yS - 6 * k], [sx * (ha + 1.5), shoulderY(ha + 1.5) + 0.3], [sx * (ha - 2.5), shoulderY(ha - 2.5) + 0.3]].map(([x, y]): V2 => [x, y]) as V2[], T, m.main))
      else g.add(stk([sx * (ha - 0.5), shoulderY(ha) + 0.2, 0], [sx * (bw * 0.38 - 1.2), yS - 6 * k - 0.5, 0], 0.35, m.sub, 5))
    }
  }
  // 袖
  if (s.sleeve > 0 && !s.straps) {
    const short = s.sleeve < 30
    const th = (short ? 0.55 : 0.1 + s.fit * 0.05) * (s.drape ?? 1)
    const d: V2 = [Math.sin(th), -Math.cos(th)]
    const n: V2 = [Math.cos(th), Math.sin(th)]
    const cuff = (short ? 12.5 + s.fit * 3 : 9 + s.fit * 2.5) * Math.max(0.7, k)
    const ST = T + 0.5
    for (const sx of [-1, 1]) {
      const A: V2 = [sw / 2 - 0.6, yS + 0.5]
      const B: V2 = [A[0] + d[0] * s.sleeve, A[1] + d[1] * s.sleeve]
      const Cc: V2 = [B[0] - n[0] * cuff, B[1] - n[1] * cuff]
      const D: V2 = [bw / 2 - 1, yS - arm + 1]
      const q = [A, B, Cc, D].map(([x, y]): V2 => [sx * x, y])
      g.add(panel(sx > 0 ? q : q.reverse(), ST, m.main))
      if ((s.rib || s.kind === 'down') && !short) {
        const B2: V2 = [B[0] - d[0] * 3.5, B[1] - d[1] * 3.5]
        const C2: V2 = [Cc[0] - d[0] * 3.5, Cc[1] - d[1] * 3.5]
        const cq = [B2, B, Cc, C2].map(([x, y]): V2 => [sx * x, y])
        g.add(panel(sx > 0 ? cq : cq.reverse(), ST + 0.5, s.kind === 'down' ? m.dark : m.sub))
      }
      if (s.quilt) for (let i = 1; i <= 3; i++) {
        const t = i / 4
        const P: V2 = [A[0] + d[0] * s.sleeve * t, A[1] + d[1] * s.sleeve * t]
        const Q: V2 = [P[0] - n[0] * (cuff + 4), P[1] - n[1] * (cuff + 4)]
        g.add(stk([sx * P[0], P[1], 0], [sx * Q[0], Q[1], 0], ST / 2 + 0.15, m.dark, 5))
      }
    }
  }
  // 领
  const z = front + 0.15
  switch (s.collar) {
    case 'crew':
      g.add(tube([[-nw, yN - 0.2, z], [-nw * 0.55, yN - dip * 0.8, z], [0, neckY - 0.1, z], [nw * 0.55, yN - dip * 0.8, z], [nw, yN - 0.2, z]], 0.45, m.sub, 8))
      break
    case 'v':
      for (const sx of [-1, 1]) g.add(stk([sx * nw, yN - 0.3, z], [0, neckY, z], 0.45, m.sub, 5))
      break
    case 'round':
      for (const sx of [-1, 1]) g.add(bl(4 * k + 1, m.sub, sx * (nw * 0.55), yN - 2.2, front + 0.25, 1, 0.65, 0.12))
      break
    case 'bow':
      for (const sx of [-1, 1]) g.add(panel([[0, yN - 2.6], [sx * 4.5, yN - 0.6], [sx * 4.5, yN - 4.8]].map(([x, y]): V2 => [x, y]) as V2[], 0.6, m.acc, front + 0.45))
      g.add(stk([-0.6, yN - 3, front + 0.5], [-1.6, yN - 11, front + 0.5], 0.5, m.acc, 4), stk([0.6, yN - 3, front + 0.5], [1.8, yN - 10, front + 0.5], 0.5, m.acc, 4))
      break
    case 'shirt':
    case 'polo': {
      const cw = s.collar === 'polo' ? 4.5 : 5.5
      for (const sx of [-1, 1]) {
        const tri: V2[] = [[sx * 0.3, neckY - 0.4], [sx * (nw + 1.2), yN + 0.6], [sx * (nw + 0.6), yN - cw]]
        g.add(panel(sx > 0 ? tri : tri.reverse(), 0.6, m.sub, front + 0.35))
      }
      g.add(stk([-nw, yN + 0.4, -T / 2 + 0.2], [nw, yN + 0.4, -T / 2 + 0.2], 0.5, m.sub, 5))
      break
    }
    case 'turtle':
      g.add(bx(nw * 2 + 2, 5, T + 1.4, m.dark, 0, yN + 1.2, 0))
      break
    case 'stand':
      g.add(bx(nw * 2 + 1.5, 3.4, T + 0.8, s.kind === 'down' ? m.dark : m.sub, 0, yN + 0.8, 0))
      break
    case 'hood': {
      const hw = nw + 5
      const hood: V2[] = [[-hw, yN + 2], [hw, yN + 2], [hw * 0.9, yN - 12], [hw * 0.5, yN - 21], [0, yN - 23], [-hw * 0.5, yN - 21], [-hw * 0.9, yN - 12]]
      g.add(panel(hood, 1.6, m.main, -T / 2 - 0.9))
      for (const sx of [-1, 1]) g.add(stk([sx * 2.2, neckY - 0.5, z], [sx * 2.6, neckY - 15, z], 0.25, m.acc, 4))
      break
    }
    case 'lapel': {
      const L = 22 * k + (s.kind === 'coat' || s.kind === 'trench' ? 6 : 0)
      g.add(panel([[-nw + 0.5, yN], [nw - 0.5, yN], [0, yN - L]], 0.4, m.acc, front + 0.2))
      for (const sx of [-1, 1]) {
        const q: V2[] = [[sx * (nw + 0.5), yN + 0.4], [sx * (nw + 4.5), yN - 7], [sx * 3.5, yN - L - 1], [sx * 0.5, yN - L]]
        g.add(panel(sx > 0 ? q.reverse() : q, 0.5, m.dark, front + 0.55))
      }
      g.add(stk([-nw, yN + 0.4, -T / 2 + 0.3], [nw, yN + 0.4, -T / 2 + 0.3], 0.6, m.dark, 5))
      break
    }
  }
  // 前襟：纽扣 / 拉链 / 门襟
  const yTop = lapel ? yN - 22 * k - (s.kind === 'coat' || s.kind === 'trench' ? 6 : 0) - 2 : s.collar === 'v' ? neckY - 1.5 : neckY - 2
  if (s.zip) {
    g.add(bx(0.8, yTop - yB - 0.5, 0.4, m.acc, 0, (yTop + yB) / 2, front + 0.2))
    g.add(bx(1.4, 2.2, 0.8, m.metal, 0, yTop - 2, front + 0.4))
  }
  if (s.buttons) {
    const n = s.buttons
    const yLow = s.kind === 'polo' ? yTop - 9 : isDress ? yS - arm - 10 : yB + 6
    const step = n > 1 ? (yTop - yLow) / (n - 1) : 0
    const cols = s.double ? [-3.5 * k, 3.5 * k] : [0]
    if (s.kind === 'shirt' || s.kind === 'polo' || s.kind === 'blouse') g.add(bx(2.4, yTop - (s.kind === 'polo' ? yLow - 1.5 : yB), 0.3, m.plain, 0, (yTop + (s.kind === 'polo' ? yLow - 1.5 : yB)) / 2, front + 0.12))
    for (let i = 0; i < n; i++) for (const cx of cols) g.add(cy(0.6, 0.6, 0.4, m.acc, cx, yTop - i * step, front + 0.35, PI / 2, 0, 6))
  }
  // 口袋
  if (s.pockets) {
    if (s.kind === 'hoodie' || s.kind === 'sweatshirt') g.add(bx(bw * 0.5, 11 * k, 0.4, m.dark, 0, yB + 9 * k, front + 0.2))
    else for (const sx of [-1, 1]) g.add(bx(9 * k + 1, (s.kind === 'blazer' || s.kind === 'coat' ? 2 : 9) * Math.max(0.7, k), 0.4, m.dark, sx * bw * 0.26, yB + Math.min(s.len * 0.22, 22), front + 0.2))
  }
  if (s.kind === 'shirt' && s.sleeve > 30) g.add(bx(7, 8, 0.3, m.plain, -bw * 0.22, yS - 11, front + 0.15))
  // 腰带
  if (s.belt) {
    const yW = yS - arm - 14 * k
    const w = widthAt(yW) * 2 + 0.6
    g.add(bx(w, 3.4, T + 0.6, m.dark, 0, yW, 0))
    g.add(bx(3.6, 4, T + 1.0, m.acc, 0, yW, 0))
  }
  if (isDress && !s.belt && s.sleeve === 0 && !s.straps) g.add(bx(widthAt(yS - arm - 13 * k) * 2 + 0.4, 2, T + 0.4, m.sub, 0, yS - arm - 13 * k, 0))
  // 羽绒绗缝
  if (s.quilt) for (let i = 1; i <= s.quilt; i++) {
    const y = yB + (i * (yS - arm + 4 - yB)) / (s.quilt + 1)
    g.add(bx(widthAt(y) * 2 + 0.2, 0.6, T + 0.3, m.dark, 0, y, 0))
  }
  // 罗纹下摆
  if (s.rib) g.add(bx((bw * s.hem) + 0.4, 4, T + 0.6, m.sub, 0, yB + 1.8, 0))
  // 牛仔夹克：明线
  if (s.kind === 'jacket' && !s.zip) g.add(bx(bw - 4, 0.3, 0.2, m.acc, 0, yS - 8, front + 0.1))
  return g
}

// ───────────────────────── 下装 ─────────────────────────

/** 半身裙 / 牛仔裤 / 短裤：顶边在 yT（夹子衣架下），z = 0 居中 */
function buildBottom(s: GarmentSpec, m: Mats, yT: number) {
  const g = new THREE.Group()
  const T = s.thick
  const ww = s.width
  const yB = yT - s.len
  if (s.kind === 'skirt') {
    const hw = (ww * s.hem) / 2
    let pts: V2[]
    if (s.pleats) {
      // 百褶：下摆锯齿
      const n = Math.max(6, Math.round(hw / 3)) * 2
      const hem: V2[] = []
      for (let i = 0; i <= n; i++) hem.push([hw - (2 * hw * i) / n, yB + (i % 2 ? 1.4 : 0)])
      pts = [[-ww / 2, yT], [ww / 2, yT], ...hem]
      for (let i = 1; i < n / 2; i++) {
        const t = i / (n / 2)
        g.add(stk([(-ww / 2 + ww * t) * 1, yT - 3, T / 2 + 0.1], [-hw + 2 * hw * t, yB + 1.5, T / 2 + 0.1], 0.18, m.dark, 3))
      }
    } else pts = [[-ww / 2, yT], [ww / 2, yT], [hw, yB], [-hw, yB]]
    g.add(panel(pts, T, m.main))
    g.add(bx(ww + 0.4, 3.2, T + 0.5, m.sub, 0, yT - 1.6, 0))
    if (s.buttons) g.add(cy(0.7, 0.7, 0.4, m.acc, ww * 0.3, yT - 1.6, T / 2 + 0.45, PI / 2, 0, 6))
    return g
  }
  // 裤子：两条腿
  const flare = s.kind === 'shorts' ? ww * 0.12 : ww * (s.hem - 1) * 0.5 + 1
  const lw = s.kind === 'shorts' ? ww * 0.55 : ww * 0.42 + flare
  const rise = s.kind === 'shorts' ? Math.min(s.len - 6, 26) : 28
  const pts: V2[] = [[-ww / 2, yT], [ww / 2, yT], [ww / 2 + flare, yB], [ww / 2 + flare - lw, yB], [0, yT - rise], [-(ww / 2 + flare - lw), yB], [-(ww / 2 + flare), yB]]
  g.add(panel(pts, T, m.main))
  g.add(bx(ww + 0.4, 3.6, T + 0.5, s.kind === 'jeans' ? m.main : m.sub, 0, yT - 1.8, 0))
  g.add(cy(0.7, 0.7, 0.4, m.metal, 0, yT - 1.8, T / 2 + 0.45, PI / 2, 0, 6))
  g.add(bx(0.3, rise - 8, 0.2, m.acc, 2, yT - 4 - (rise - 8) / 2, T / 2 + 0.12))
  if (s.pockets || s.kind === 'jeans') for (const sx of [-1, 1]) g.add(stk([sx * (ww / 2 - 7), yT - 3.6, T / 2 + 0.12], [sx * (ww / 2 - 0.5), yT - 11, T / 2 + 0.12], 0.25, m.acc, 3))
  if (s.kind === 'jeans' && s.len > 60) for (const sx of [-1, 1]) {
    const x0 = sx * (ww / 2 + flare)
    const x1 = sx * (ww / 2 + flare - lw)
    g.add(bx(Math.abs(x1 - x0) + 0.3, 3.5, T + 0.6, m.dark, (x0 + x1) / 2, yB + 1.75, 0))
  }
  return g
}

/** 背带裤：肩形衣架上挂着两条背带 + 胸片 + 裤子 */
function buildOveralls(s: GarmentSpec, m: Mats) {
  const g = new THREE.Group()
  const T = s.thick
  const k = s.width / 40
  const ha = hangerHalf(s) - 3
  const bibW = 22 * k
  const yBib = shoulderY(ha) - 14 * k
  const yWaist = yBib - 20 * k
  for (const sx of [-1, 1]) {
    g.add(panel(sx > 0 ? [[ha - 2, shoulderY(ha - 2) + 0.4], [ha + 1.5, shoulderY(ha + 1.5) + 0.4], [bibW / 2, yBib], [bibW / 2 - 3.5, yBib]] : [[-(bibW / 2 - 3.5), yBib], [-bibW / 2, yBib], [-(ha + 1.5), shoulderY(ha + 1.5) + 0.4], [-(ha - 2), shoulderY(ha - 2) + 0.4]], T * 0.7, m.main))
    g.add(cy(0.9, 0.9, 0.5, m.metal, sx * (bibW / 2 - 1.8), yBib - 1.5, T / 2 + 0.3, PI / 2, 0, 6))
  }
  g.add(panel([[-bibW / 2, yBib], [bibW / 2, yBib], [s.width / 2, yWaist], [-s.width / 2, yWaist]], T, m.main))
  g.add(bx(10 * k, 8 * k, 0.4, m.dark, 0, yBib - 8 * k, T / 2 + 0.2))
  const pants = buildBottom({ ...s, kind: s.len - (yBib - yWaist) < 60 ? 'shorts' : 'jeans', len: s.len - 34 * k, pockets: true }, m, yWaist)
  g.add(pants)
  return g
}

/** 西裤：沿裤线对折，搭在衣架下横杆上，前后两片 */
function buildPantsOnBar(s: GarmentSpec, m: Mats, barY: number) {
  const g = new THREE.Group()
  const T = s.thick
  const pw = s.width * 0.82
  const r = 0.45 + T / 2 + 0.1
  const h1 = s.len * 0.5
  const h2 = h1 - 6
  g.add(panel([[-pw / 2, barY], [pw / 2, barY], [pw / 2 + 1, barY - h1], [-pw / 2 + 1, barY - h1]], T, m.main, r))
  g.add(panel([[-pw / 2, barY], [pw / 2, barY], [pw / 2 + 0.5, barY - h2], [-pw / 2 + 0.5, barY - h2]], T, m.main, -r))
  const cap = cg(`pcap${r1(pw)},${r1(r + T / 2)}`, () => new THREE.CylinderGeometry(r + T / 2, r + T / 2, pw, 6, 1, false, 0, PI).rotateZ(PI / 2).rotateX(PI / 2))
  g.add(mesh(cap, m.main, 0, barY, 0))
  g.add(stk([0, barY - 3, r + T / 2 + 0.1], [0.6, barY - h1 + 2, r + T / 2 + 0.1], 0.15, m.dark, 3))
  return g
}

// ───────────────────────── 和服 / 围巾 / 领带 / 帽子 / 毛巾 ─────────────────────────

function buildKimono(s: GarmentSpec, m: Mats) {
  const g = new THREE.Group()
  const T = s.thick
  const ry = -6
  const top = ry + 1
  const bw = s.width
  const L = s.len
  g.add(panel([[-bw / 2, top], [bw / 2, top], [bw / 2, top - L], [-bw / 2, top - L]], T, m.main))
  for (const sx of [-1, 1]) {
    const x0 = sx * (bw / 2 - 0.5)
    const x1 = sx * (bw / 2 + 33)
    const q: V2[] = [[x0, top - 0.2], [x1, top - 0.2], [x1, top - s.sleeve], [x0, top - s.sleeve]]
    g.add(panel(sx > 0 ? q : q.reverse(), T - 0.3, m.main))
  }
  // 衿
  for (const sx of [-1, 1]) g.add(stk([sx * 5, top, T / 2 + 0.25], [sx * -3, top - 70, T / 2 + 0.25], 1.6, m.sub, 4))
  g.add(bx(bw + 0.4, 3, T + 0.4, m.dark, 0, top - L + 1.5, 0))
  return g
}

/** 围巾：对折搭在 S 钩下环上，两片垂下，末端流苏 */
function buildScarf(s: GarmentSpec, m: Mats, inPlane: boolean) {
  const zc = inPlane ? 0 : 2.6
  const g = G(inPlane ? hookCurve(m.metal, true, 0) : sHook(m.metal, zc))
  const top = S_LOW - 0.2
  const w = s.width
  const hang = Math.min(s.len / 2, 80)
  const T = s.thick
  g.add(cy(1.2, 1.2, w, m.main, 0, top - 1.1, zc, 0, PI / 2, 6))
  g.add(panel([[-w / 2, top - 1], [w / 2, top - 1], [w / 2, top - hang], [-w / 2, top - hang]], T, m.main, zc + 0.75))
  g.add(panel([[-w / 2, top - 1], [w / 2, top - 1], [w / 2, top - hang + 8], [-w / 2, top - hang + 8]], T, m.main, zc - 0.75))
  for (const [dy, dz] of [[hang, 0.75], [hang - 8, -0.75]] as const)
    for (let x = -w / 2 + 1.2; x <= w / 2 - 1.1; x += 2.2) g.add(stk([x, top - dy, zc + dz], [x, top - dy - 4, zc + dz], 0.25, m.sub, 3))
  return g
}

/** 领带：领带架横杆上搭 n 条 */
function tieShape(w: number, len: number): V2[] {
  return [[-1.8, 0], [1.8, 0], [w / 2, -len + w * 0.5], [0, -len], [-w / 2, -len + w * 0.5]]
}
function buildTies(s: GarmentSpec, m: Mats, inPlane: boolean) {
  const body = tieBar(m)
  const n = clamp(parseInt(s.variant) || 1, 1, 4)
  const T = s.thick
  const cols = [m.main, m.sub, m.acc, m.dark]
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -5 + (10 * i) / (n - 1)
    const len = s.len * 0.42 - i * 2
    const front = panel(tieShape(s.width, len).map(([px, py]): V2 => [px + x, py + TIE_BAR - 0.6]), T, cols[i % 4], 0.65)
    const back = panel(tieShape(s.width * 0.55, len - 14).map(([px, py]): V2 => [px + x, py + TIE_BAR - 0.6]), T, cols[i % 4], -0.65)
    body.add(front, back)
  }
  return attachHook(body, m, inPlane)
}

/** 帽子：原点在帽子底面中心，帽顶朝上 */
function buildHat(s: GarmentSpec, m: Mats) {
  const v = s.variant || 'cap'
  const g = new THREE.Group()
  switch (v) {
    case 'beanie':
      g.add(cy(8.6, 8.8, 4.5, m.sub, 0, 2.25, 0, 0, 0, 14), dome(8.4, m.main, 4.3, 1.15), bl(2.8, m.acc, 0, 4.3 + 8.4 * 1.15 + 1.8))
      break
    case 'bucket':
      g.add(cy(8.2, 12, 3, m.main, 0, 1.5, 0, 0, 0, 14), cy(7, 7.8, 6.5, m.main, 0, 6, 0, 0, 0, 14), cy(7, 7, 1, m.main, 0, 9.6, 0, 0, 0, 14), cy(7.9, 7.9, 1.2, m.sub, 0, 3.6, 0, 0, 0, 14))
      break
    case 'straw':
      g.add(cy(17, 17, 0.8, m.main, 0, 0.4, 0, 0, 0, 16), cy(6.4, 7, 8, m.main, 0, 4.6, 0, 0, 0, 14), cy(6.4, 6.4, 0.8, m.main, 0, 8.9, 0, 0, 0, 14), cy(7.3, 7.3, 1.8, m.acc, 0, 1.8, 0, 0, 0, 14))
      break
    case 'fedora':
      g.add(cy(15, 15, 0.8, m.main, 0, 0.4, 0, 0, 0, 16), cy(7, 8, 10, m.main, 0, 5.4, 0, 0, 0, 14), bl(7, m.main, 0, 10.4, 0, 1, 0.3, 1.1), cy(8.1, 8.1, 2, m.sub, 0, 1.8, 0, 0, 0, 14))
      break
    case 'beret':
      g.add(bl(12, m.main, 0, 2.6, 0, 1, 0.24, 1), cy(9, 9, 1.4, m.main, 0, 0.7, 0, 0, 0, 14), cy(0.5, 0.5, 1.6, m.main, 0, 5.8))
      break
    default: {
      // 棒球帽：帽冠 + 帽檐
      g.add(dome(9, m.main, 0, 0.95), cy(9, 9, 0.6, m.main, 0, 0.3, 0, 0, 0, 14), bl(1.1, m.acc, 0, 8.6))
      const brim = cg('capbrim', () => {
        const sh = new THREE.Shape()
        sh.absarc(0, 0, 9, 0, PI, true)
        sh.absellipse(0, 0, 9, 8, PI, 0, true)
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 6 })
        geo.rotateX(PI / 2)
        return geo
      })
      g.add(mesh(brim, m.sub, 0, 0.9, 0.5))
      g.add(panel([[-3, 5], [3, 5], [3, 2], [-3, 2]], 0.3, m.acc, 8.4))
      break
    }
  }
  return g
}

/** 毛巾尺寸：[宽, 展开长] */
const TOWEL_SIZE: Record<string, [number, number]> = { bath: [60, 120], face: [34, 80], hand: [34, 36], wash: [25, 25] }
/** 叠好的毛巾尺寸 [宽, 深, 高] */
const TOWEL_FOLD: Record<string, [number, number, number]> = { bath: [36, 26, 6.6], face: [26, 18, 4.2], hand: [18, 13, 3.2], wash: [13, 13, 2.2] }

function towelBands(g: THREE.Group, w: number, ys: number[], T: number, m: Mats, z: number) {
  for (const y of ys) g.add(bx(w + 0.3, 2.2, T + 0.5, m.sub, 0, y, z))
}

/** 毛巾搭在杆上：对折，杆顶在原点下 0.5，杆中心在 z = 1.7（和挂杆挂点带的吸附位置一致） */
function towelOverBar(s: GarmentSpec, m: Mats) {
  const [w, L] = TOWEL_SIZE[s.variant] ?? TOWEL_SIZE.bath
  const T = s.thick
  const zc = 1.7
  const R = 1.9
  const yC = -R
  const g = new THREE.Group()
  const h1 = L / 2
  const h2 = L / 2 - Math.min(8, L * 0.12)
  const cap = cg(`tcap${r1(w)},${r1(R)}`, () => new THREE.CylinderGeometry(R, R, w, 7, 1, true, 0, PI).rotateZ(PI / 2).rotateX(PI / 2))
  g.add(mesh(cap, m.main, 0, yC, zc))
  g.add(panel([[-w / 2, yC], [w / 2, yC], [w / 2, yC - h1], [-w / 2, yC - h1]], T, m.main, zc + R - T / 2))
  g.add(panel([[-w / 2, yC], [w / 2, yC], [w / 2, yC - h2], [-w / 2, yC - h2]], T, m.main, zc - R + T / 2))
  towelBands(g, w, [yC - h1 + 5], T, m, zc + R - T / 2)
  towelBands(g, w, [yC - h2 + 5], T, m, zc - R + T / 2)
  return g
}

/** 毛巾挂在挂钩上：一角的挂环套在 S 钩上，斜着吊下来 */
function towelOnHook(s: GarmentSpec, m: Mats) {
  const [w, L0] = TOWEL_SIZE[s.variant] ?? TOWEL_SIZE.bath
  const L = s.variant === 'bath' ? L0 * 0.75 : L0
  const T = s.thick
  const zc = 2.6
  const g = G(sHook(m.metal, zc))
  const loopY = S_LOW - 0.9
  g.add(cy(0.9, 0.9, 0.5, m.sub, 0, loopY, zc, PI / 2, 0, 8))
  // 一角吊起：菱形偏下，自然下垂成倒三角 + 长方形
  const top = loopY - 0.8
  const half = w * 0.55
  const pts: V2[] = [[0, top], [half, top - half * 0.8], [half * 0.85, top - L * 0.85], [0, top - L], [-half * 0.85, top - L * 0.85], [-half, top - half * 0.8]]
  g.add(panel(pts, T * 1.6, m.main, zc + T))
  g.add(stk([-half * 0.95, top - half * 0.8 - 6, zc + T * 1.8 + 0.1], [half * 0.95, top - half * 0.8 - 6, zc + T * 1.8 + 0.1], 0.6, m.sub, 4))
  return g
}

function towelFolded(s: GarmentSpec, m: Mats) {
  const [w, d, h] = TOWEL_FOLD[s.variant] ?? TOWEL_FOLD.bath
  const g = new THREE.Group()
  const n = 3
  const lh = h / n
  for (let i = 0; i < n; i++) g.add(rb(i === 1 ? w - 0.5 : w, lh + 0.05, i === 1 ? d - 0.5 : d, m.main, 0, lh * (i + 0.5), 0, Math.min(1, lh * 0.45)))
  // 前沿的折边 + 一道织带
  // 织带比毛巾顶面高出 0.3，避免和顶层毛巾共面闪烁
  g.add(bx(w * 0.08 + 1.5, h + 0.15, d + 0.3, m.sub, w * 0.3, 0.15 + (h + 0.15) / 2, 0))
  return g
}

// ───────────────────────── 叠好的衣服 ─────────────────────────

/** 叠好形态的尺寸 [宽, 深, 高]（随款式略变，儿童按比例缩小） */
export function foldDims(s: GarmentSpec): [number, number, number] {
  if (s.kind === 'towel') return TOWEL_FOLD[s.variant] ?? TOWEL_FOLD.bath
  const [w, d, h] = K[s.kind].fold
  const k = K[s.kind].width[1] ? clamp(s.width / ((K[s.kind].width[0] + K[s.kind].width[1]) / 2), 0.6, 1.15) : 1
  const kk = k < 0.9 ? 0.55 + 0.45 * k : 1
  const lenK = s.kind === 'down' && s.len > 85 ? 1.25 : s.kind === 'coat' || s.kind === 'trench' ? clamp(s.len / 100, 0.9, 1.1) : 1
  return [r1(w * kk), r1(d * kk), r1(h * lenK * (0.8 + s.thick / K[s.kind].thick / 5))]
}

function buildFolded(s: GarmentSpec, m: Mats, dims = foldDims(s)) {
  if (s.kind === 'towel') return towelFolded(s, m)
  if (s.kind === 'hat') return buildHat(s, m)
  const [w, d, h] = dims
  const g = new THREE.Group()
  if (s.kind === 'tie') {
    // 卷起来的领带
    const r = w / 2
    g.add(cy(r, r, h, m.main, 0, h / 2, 0, 0, 0, 12), cy(r * 0.45, r * 0.45, h + 0.2, m.dark, 0, h / 2, 0, 0, 0, 8))
    return g
  }
  const r = Math.min(1.2, h * 0.22)
  g.add(rb(w, h * 0.56, d, m.main, 0, h * 0.28, 0, r))
  g.add(rb(w - 0.8, h * 0.5, d - 0.8, m.main, 0, h * 0.75, 0, r))
  const top = h + 0.12
  const zb = -d / 2
  const top3 = (o: THREE.Mesh) => g.add(o)
  const lower = ['skirt', 'pants', 'jeans', 'shorts'].includes(s.kind)
  if (lower) {
    // 腰头在后沿
    top3(bx(w - 1, 0.4, 3, s.kind === 'jeans' ? m.dark : m.sub, 0, top - 0.1, zb + 2.2))
    if (s.kind === 'jeans') top3(bx(0.3, 0.3, d - 8, m.acc, -w * 0.25, top, 2))
  } else if (s.kind === 'scarf') {
    for (let x = -w / 2 + 1; x < w / 2 - 0.5; x += 2) top3(bx(0.5, 0.5, 3, m.sub, x, h * 0.4, d / 2 + 1.2))
  } else if (s.kind === 'kimono') {
    // 畳紙（和服包装纸）一样的收法：衿露出一截
    top3(bx(4, 0.4, d * 0.7, m.sub, -w * 0.2, top, -d * 0.1))
  } else {
    // 上衣：领口在后沿，前沿是下摆
    const nw = Math.min(5, w * 0.18)
    if (s.collar === 'hood') g.add(bl(1, m.dark, 0, top, zb + 6, nw + 2, 1.2, 4.5))
    else if (s.collar === 'turtle' || s.collar === 'stand') top3(bx(nw * 2 + 1, 0.8, 3, m.dark, 0, top, zb + 2.5))
    else if (s.collar === 'lapel') for (const sx of [-1, 1]) top3(bx(2, 0.5, 10, m.dark, sx * 3, top, zb + 6, 0, sx * 0.35))
    else if (s.collar !== 'none') top3(tube([[-nw, top, zb + 1.5], [-nw * 0.6, top, zb + 4], [0, top, zb + 5], [nw * 0.6, top, zb + 4], [nw, top, zb + 1.5]], 0.45, m.sub, 8))
    if (s.buttons && !s.double) for (let i = 0; i < Math.min(s.buttons, 4); i++) top3(cy(0.55, 0.55, 0.3, m.acc, 0, top, zb + 8 + i * ((d - 12) / 4), 0, 0, 6))
    if (s.zip) top3(bx(0.7, 0.3, d - 6, m.acc, 0, top, 1))
    if (s.quilt) for (let i = 1; i < 4; i++) top3(bx(w - 1.2, 0.5, 0.6, m.dark, 0, top - 0.1, zb + (i * d) / 4))
    if (s.rib) top3(bx(w - 0.6, h * 0.5, 0.5, m.sub, 0, h * 0.75, d / 2 - 0.2))
    // 两侧折进去的袖子压出的折线
    for (const sx of [-1, 1]) top3(bx(0.4, 0.25, d - 4, m.dark, sx * w * 0.28, top - 0.05, 0))
  }
  return g
}

// ───────────────────────── 组装 ─────────────────────────

/** 衣架半宽：跟着肩宽走，儿童衣架小一号 */
function hangerHalf(s: GarmentSpec) {
  return clamp(s.width / 2 - 2.5, 11, 21)
}

/** 衣物该配什么衣架（品类决定；skirt / shorts 用夹子，西裤对折搭杆，围巾 / 帽子 / 毛巾 S 钩…） */
export function hangerFor(s: GarmentSpec): HangerType {
  return K[s.kind].hanger
}

export type GarmentForm = 'folded' | 'hanging' | 'bar' | 'hook'

/**
 * 建模一件衣物。
 *   folded ：叠好（帽子为平放），原点在底面中心
 *   hanging：挂起，衣架按品类自动生成；inPlane = 侧挂成排时用（钩环绕沿 x 的杆，衣服以 z = 0 为中心）
 *   bar / hook：毛巾专用——搭在毛巾杆上 / 一角吊在挂钩上
 * usePattern = false 时不建花纹材质（测量尺寸用）
 */
export function buildGarment(s: GarmentSpec, form: GarmentForm, opts: { inPlane?: boolean; usePattern?: boolean } = {}): THREE.Group {
  const m = mats(s, opts.usePattern ?? true)
  const inPlane = opts.inPlane ?? false
  if (form === 'folded') return buildFolded(s, m)
  if (s.kind === 'towel') return form === 'hook' ? towelOnHook(s, m) : towelOverBar(s, m)
  if (s.kind === 'hat') {
    const hat = buildHat(s, m)
    // 帽檐后沿挂在 S 钩下环上，帽顶朝外
    hat.rotation.x = PI / 2
    const holder = G(hat)
    const b = box3(holder)
    hat.position.set(-(b.min.x + b.max.x) / 2, S_LOW - 0.35 - b.max.y, 2.6 - b.min.z - 1.2)
    return G(holder, sHook(m.metal))
  }
  if (s.kind === 'scarf') return buildScarf(s, m, inPlane)
  if (s.kind === 'tie') return buildTies(s, m, inPlane)
  const style = s.hanger
  const heavy = ['coat', 'trench', 'blazer', 'down'].includes(s.kind) && style === 'wood'
  let body: THREE.Group
  switch (hangerFor(s)) {
    case 'kimono':
      body = G(stk([-66, -6, 0], [66, -6, 0], 0.6, m.hanger, 8), bl(1.2, m.hanger, -66, -6), bl(1.2, m.hanger, 66, -6), buildKimono(s, m))
      break
    case 'clip': {
      const hw = clamp(s.width / 2 + 2, 14, 21)
      body = G(clipBar(m, hw, style), buildBottom(s, m, CLIP_TOP))
      break
    }
    case 'bar': {
      const hw = hangerHalf(s)
      const barY = NECK_Y - SLOPE * hw - 1
      body = G(shoulderArms(m, hw, style, false, true), buildPantsOnBar(s, m, barY))
      break
    }
    default: {
      const hw = hangerHalf(s)
      body = G(shoulderArms(m, hw, style, heavy, false), s.kind === 'overalls' ? buildOveralls(s, m) : buildTop(s, m))
    }
  }
  return attachHook(body, m, inPlane)
}

/** 实测尺寸 [宽, 深, 高]（挂起形态：高 = 原点到最低点） */
export function measureGarment(s: GarmentSpec, form: GarmentForm, inPlane = false): [number, number, number] {
  const b = box3(buildGarment(s, form, { inPlane, usePattern: false }))
  const sz = b.getSize(new THREE.Vector3())
  return [r1(sz.x), r1(sz.z), r1(form === 'folded' ? sz.y : Math.max(sz.y, -b.min.y))]
}

// ───────────────────────── 随机款式 ─────────────────────────

/** 各风格的衣物色板（偏布料的颜色，比家具色板更暗、更多中性色） */
export const WEAR_COLORS: Record<StyleTag, string[]> = {
  cute: [C.pink, C.sakura, C.sky, C.mint, C.lemon, C.lilac, C.peach, '#fdf6ee', '#f6e3d3', '#8fa7d6', '#e88aa0'],
  nordic: [S.nordic.white, S.nordic.linen, '#d9cbb4', S.nordic.gray, S.nordic.sage, S.nordic.blue, S.nordic.mustard, '#3f4f66', '#b48a63', '#8a9a82'],
  modern: [S.modern.black, S.modern.char, S.modern.gray, S.modern.light, S.modern.white, '#2e3a52', '#cbbba4', '#9a8270', '#5b6470'],
  japanese: [S.japanese.ai, S.japanese.sumi, S.japanese.washi, '#b9893f', S.japanese.shu, '#7d8b56', '#b7a6a0', '#4f6a5a', '#e7d9c0'],
  industrial: ['#5d6b4a', '#a89a78', '#3b5a80', '#2e2e30', S.industrial.rust, '#6e4b33', S.industrial.concrete, '#7c8085', '#4a5560'],
  retro: [S.retro.mustard, S.retro.teal, S.retro.orange, S.retro.caramel, S.retro.cream, S.retro.olive, S.retro.red, '#7a2f3a', '#3f5a7a'],
  chinese: [S.chinese.ink, S.chinese.ivory, S.chinese.lacquer, S.chinese.jade, '#2f3f5c', '#8a6a4a', '#c9b79a', '#5b2a2a', '#d8cdb8'],
  classic: [S.classic.ivory, S.classic.cream, S.classic.navy, S.classic.wine, S.classic.blue, '#6d6a5e', '#b9a27a', '#3a3a40', '#e7d7d0'],
  farmhouse: [S.farmhouse.white, S.farmhouse.linen, S.farmhouse.navy, S.farmhouse.sage, S.farmhouse.barn, '#5d6b8a', '#b9a07a', '#6e5a44', '#a7b8c9'],
}
const KID_COLORS = ['#ff9f9f', '#ffd36b', '#8fd3a8', '#7fbff0', '#c9a6f0', '#ffb47a', '#ffffff', '#f7c6d9', '#5f8fd6', '#f26b6b']
const DENIM = ['#3b5a80', '#4f6f99', '#2d4462', '#6d8db3', '#2a2f3a']

const STYLE_HANGER: Record<StyleTag, HangerMat[]> = {
  cute: ['plastic', 'plastic', 'velvet'],
  nordic: ['wood', 'wood', 'wire'],
  modern: ['velvet', 'wire', 'plastic'],
  japanese: ['wood'],
  industrial: ['wire', 'wire', 'wood'],
  retro: ['wood', 'wood', 'plastic'],
  chinese: ['wood'],
  classic: ['velvet', 'wood', 'wood'],
  farmhouse: ['wood', 'wood', 'wire'],
}

/** 各衣柜主题里各品类出现的权重 */
const WARDROBE_KINDS: Record<Wardrobe, [GarmentKind, number][]> = {
  women: [['tee', 1], ['blouse', 3], ['shirt', 1.2], ['cardigan', 2], ['sweater', 1.6], ['dress', 3], ['skirt', 3], ['trench', 0.8], ['coat', 1.2], ['jacket', 0.8], ['pants', 0.8], ['jeans', 1], ['tank', 1], ['down', 0.4], ['blazer', 0.6]],
  men: [['tee', 1.5], ['shirt', 3], ['polo', 1.5], ['hoodie', 1.2], ['sweater', 1.4], ['blazer', 2], ['coat', 1.2], ['down', 0.8], ['jacket', 1.5], ['pants', 2.5], ['jeans', 1.5], ['sweatshirt', 0.8]],
  kids: [['tee', 3], ['hoodie', 2], ['sweatshirt', 2], ['dress', 1.5], ['skirt', 1], ['overalls', 1.5], ['shorts', 1.5], ['jacket', 1], ['down', 1], ['pants', 0.6], ['jeans', 0.6]],
  casual: [['tee', 3], ['hoodie', 2], ['sweatshirt', 2], ['shirt', 2], ['jeans', 2], ['jacket', 1.5], ['cardigan', 1], ['shorts', 1], ['down', 0.5], ['skirt', 0.5], ['polo', 0.8]],
  outer: [['coat', 3], ['trench', 2], ['down', 2.5], ['jacket', 2], ['blazer', 1.5]],
}

export const WARDROBE_LABELS: Record<Wardrobe, string> = { women: '女装', men: '男装', kids: '童装', casual: '休闲', outer: '外套' }

/** 衣柜主题的身材：肩宽 / 腰宽倍率 */
const WARDROBE_SCALE: Record<Wardrobe, number> = { women: 0.9, men: 1.04, kids: 0.66, casual: 1, outer: 1 }

function weighted<T>(rand: Rand, list: [T, number][]): T {
  const sum = list.reduce((a, b) => a + b[1], 0)
  let r = rand() * sum
  for (const [v, w] of list) {
    r -= w
    if (r <= 0) return v
  }
  return list[list.length - 1][0]
}

export interface RandomOpts {
  wardrobe?: Wardrobe
  style?: StyleTag
  /** 偏好的色调（行配色），约 40% 的衣服从这里取色 */
  tones?: string[]
  kinds?: GarmentKind[]
  hanger?: HangerMat
  hangerColor?: string
  /** 花纹出现的概率 */
  patternChance?: number
}

/** 随机一件衣物：品类按衣柜主题加权，款式参数在品类范围内随机，配色按风格色板 */
export function randomGarment(rand: Rand, o: RandomOpts = {}): GarmentSpec {
  const wd = o.wardrobe ?? 'casual'
  const style = o.style ?? 'nordic'
  const kind = o.kinds?.length ? o.kinds[Math.floor(rand() * o.kinds.length)] : weighted(rand, WARDROBE_KINDS[wd])
  const k = K[kind]
  const sc = WARDROBE_SCALE[wd]
  const kid = wd === 'kids'
  const pool = kid ? [...KID_COLORS, ...WEAR_COLORS[style].slice(0, 4)] : WEAR_COLORS[style]
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const tone = () => (o.tones?.length && rand() < 0.4 ? shade(pick(o.tones), (rand() - 0.5) * 0.16) : pick(pool))
  const range = (r: [number, number]) => r[0] + rand() * (r[1] - r[0])
  let main = tone()
  if (kind === 'jeans' || (kind === 'jacket' && rand() < 0.35) || (kind === 'overalls' && rand() < 0.6)) main = pick(DENIM)
  if (kind === 'trench') main = pick(['#c8ad84', '#b99a6e', '#3f4436', '#d8c6a5', '#2e3a52'])
  if (kind === 'blazer' || (kind === 'pants' && rand() < 0.6)) main = pick(['#2e3a52', '#3d3f44', '#5b6470', '#24252a', '#8a8070', ...pool.slice(0, 2)])
  const sub = rand() < 0.6 ? shade(main, rand() < 0.5 ? -0.1 : 0.1) : tone()
  const accent = pick(['#f4f1ea', '#3a3a40', '#c9a45c', '#8a6a4a', tone()])
  const s = garment(kind, {
    main,
    sub,
    accent,
    len: range(k.len) * (kid ? 0.62 : sc < 1 ? 0.97 : 1),
    width: range(k.width) * sc,
    sleeve: k.sleeve[1] ? (kind === 'shirt' || kind === 'blouse' || kind === 'dress' ? (rand() < 0.4 ? range([18, 26]) : range([50, k.sleeve[1]])) : range(k.sleeve)) * (kid ? 0.62 : 1) : 0,
    collar: pick(k.collars),
    fit: rand() * 0.8,
    hanger: o.hanger ?? pick(STYLE_HANGER[style]),
    hangerColor: o.hangerColor,
  })
  // 款式细节
  if (kind === 'dress') {
    s.hem = pick([1.05, 1.4, 1.6, 1.9])
    s.straps = rand() < 0.2
    s.belt = rand() < 0.25
    if (s.collar === 'shirt') s.buttons = 5 + Math.floor(rand() * 4)
    if (kid) s.len = range([50, 70])
  }
  if (kind === 'skirt') {
    s.pleats = rand() < 0.35
    s.hem = s.pleats ? 1.8 : pick([1.15, 1.5, 1.7])
    s.len = range(k.len) * (kid ? 0.6 : 1)
  }
  if (kind === 'tank') s.straps = true
  if (kind === 'cardigan') s.buttons = 4 + Math.floor(rand() * 3)
  if (kind === 'coat') {
    s.double = rand() < 0.3
    s.buttons = s.double ? 3 : 3 + Math.floor(rand() * 2)
    s.belt = rand() < 0.2
    if (s.collar === 'stand') s.zip = false
  }
  if (kind === 'down') {
    s.len = rand() < 0.3 ? range([90, 100]) : range([62, 72])
    s.quilt = Math.round(s.len / 13)
    s.thick = range([4.4, 5.8])
  }
  if (kind === 'jacket') {
    s.zip = rand() < 0.6
    if (!s.zip) s.buttons = 5
  }
  if (kind === 'blazer') s.buttons = rand() < 0.2 ? 3 : rand() < 0.15 ? 1 : 2
  if (kind === 'shirt' || kind === 'blouse') s.buttons = kind === 'shirt' ? 7 : rand() < 0.5 ? 6 : 0
  if (kind === 'pants') s.hem = range([1, 1.15])
  if (kind === 'jeans') s.hem = pick([1, 1, 1.15, 1.3])
  if (kind === 'overalls' && kid) s.len = range([70, 85])
  if (kid) {
    s.thick = Math.max(0.8, s.thick * 0.85)
    if (kind === 'down') s.thick = 3.6
  }
  // 花纹
  const pc = o.patternChance ?? 0.22
  if (k.patterns.length && rand() < pc) {
    const pk = pick(k.patterns)
    const ink = pick([s.sub, s.accent, shade(s.main, rand() < 0.5 ? -0.3 : 0.3), tone()])
    s.pattern = { kind: pk, colors: [s.main, ink, pick(pool)], scale: Math.round(range(pk === 'stripes' ? [4, 9] : [6, 12])), density: Math.round(range([0.3, 0.6]) * 100) / 100, angle: pk === 'stripes' ? (kind === 'shirt' || kind === 'pants' ? 90 : 0) : 0, seed: Math.floor(rand() * 1e5) }
  }
  return s
}

/** 一件毛巾 */
export function randomTowel(rand: Rand, style: StyleTag, variant: string): GarmentSpec {
  const pool = WEAR_COLORS[style]
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const main = rand() < 0.3 ? '#fbf8f2' : pick(pool)
  const sub = shade(main, rand() < 0.5 ? -0.18 : 0.12)
  const s = garment('towel', { main, sub, accent: pick(pool), variant, thick: variant === 'bath' ? 0.9 : 0.7 })
  if (rand() < 0.3) s.pattern = { kind: pick(K.towel.patterns), colors: [main, sub, pick(pool)], scale: 6, density: 0.4, angle: 0, seed: Math.floor(rand() * 1e5) }
  return s
}

// ───────────────────────── 一排衣服 ─────────────────────────

export interface RowOpts {
  seed: number
  wardrobe: Wardrobe
  style: StyleTag
  tones?: string[]
  hanger?: HangerMat
  hangerColor?: string
  /** 按衣长排序（短上衣 → 长大衣） */
  sort?: boolean
  /** 整排的最大衣长 / 最大进深：保证一件最长款正好到 h、最宽的正好到 d（尺寸稳定，碰撞按它算） */
  h?: number
  d?: number
}

/** 衣柜主题的整排尺寸上限 [进深, 高]（成排素材的声明尺寸） */
export const ROW_ENVELOPE: Record<Wardrobe, [number, number]> = { women: [48, 120], men: [50, 112], kids: [40, 74], casual: [50, 100], outer: [50, 114] }

const ROW_LONG: Record<Wardrobe, GarmentKind[]> = { women: ['dress', 'coat'], men: ['coat'], kids: ['dress', 'down'], casual: ['coat', 'cardigan'], outer: ['coat', 'trench'] }

/** 侧挂后的占位：x 方向（= 衣服原来的 z）和 z 方向（= 衣服原来的 x）、最低点 */
function sideExtent(g: THREE.Object3D) {
  const b = box3(g)
  // 绕 y 转 +90°：新 x = 旧 z，新 z = -旧 x
  return { x0: b.min.z, x1: b.max.z, z0: -b.max.x, z1: -b.min.x, y0: b.min.y }
}

/**
 * 一排挂在杆上的衣服（不含杆）：沿 x 每 4–6cm 一件，衣架自动配，整排正好占满 [-len/2, len/2]。
 * 原点在杆顶（钩环内顶在 y = -0.5），衣服以 z = 0 为中心。整排烘成顶点色网格（花纹衣服保留花纹材质）。
 */
export function garmentRow(len: number, o: RowOpts): THREE.Group {
  const rand = rng(o.seed)
  const [Dcap, Hcap] = [o.d ?? ROW_ENVELOPE[o.wardrobe][0], o.h ?? ROW_ENVELOPE[o.wardrobe][1]]
  const hanger = o.hanger ?? STYLE_HANGER[o.style][Math.floor(rand() * STYLE_HANGER[o.style].length)]
  const ro: RandomOpts = { wardrobe: o.wardrobe, style: o.style, tones: o.tones, hanger, hangerColor: o.hangerColor }
  const specs: GarmentSpec[] = []
  // 估算件数：平均每件 5cm
  let budget = len
  while (budget > 3) {
    const s = randomGarment(rand, ro)
    s.drape = 0.35
    specs.push(s)
    budget -= Math.max(4 + rand() * 2, s.thick + 2.2)
  }
  // 一件最长款（定高）
  const long = randomGarment(rand, { ...ro, kinds: ROW_LONG[o.wardrobe] })
  long.pattern = null
  long.drape = 0.35
  specs[specs.length - 1] = long
  const fitted = new Map<GarmentSpec, THREE.Group>()
  const build = (s: GarmentSpec) => buildGarment(s, 'hanging', { inPlane: true })
  const halfOf = (g: THREE.Object3D) => {
    const e = sideExtent(g)
    return Math.max(-e.z0, e.z1)
  }
  // 调参数让最低点 / 半宽正好到目标；没有目标的只要不超过上限
  const tune = (s: GarmentSpec, wantH: number | null, wantD: number | null) => {
    let g = fitted.get(s) ?? build(s)
    for (let it = 0; it < 5; it++) {
      const e = sideExtent(g)
      const half = Math.max(-e.z0, e.z1)
      let changed = false
      if (wantH !== null ? Math.abs(-e.y0 - wantH) > 0.05 : -e.y0 > Hcap) {
        s.len += (wantH ?? Hcap - 1) + e.y0
        changed = true
      }
      if (wantD !== null ? Math.abs(half - wantD / 2) > 0.05 : half > Dcap / 2) {
        const dw = (wantD ?? Dcap - 1) / 2 - half
        s.width += K[s.kind].top && s.sleeve > 0 && !s.straps ? dw * 1.6 : dw * 1.8
        changed = true
      }
      if (!changed) break
      g = build(s)
    }
    fitted.set(s, g)
  }
  for (const s of specs) tune(s, s === long ? Hcap : null, null)
  // 最宽的那件撑满进深
  const wide = specs.reduce((a, b) => (halfOf(fitted.get(b)!) > halfOf(fitted.get(a)!) ? b : a))
  tune(wide, wide === long ? Hcap : null, Dcap)
  // 排序：短 → 长
  const order = o.sort === false ? specs.slice() : specs.slice().sort((a, b) => sideExtent(fitted.get(a)!).y0 < sideExtent(fitted.get(b)!).y0 ? 1 : -1)
  // 依次排开：间距 4–6cm，厚的衣服不重叠
  const placeAll = (list: GarmentSpec[]) => {
    const xs: number[] = []
    const ext = list.map((s) => sideExtent(fitted.get(s)!))
    let x = -len / 2 - ext[0].x0
    for (let i = 0; i < list.length; i++) {
      if (i > 0) x = Math.max(x + 4 + rand() * 2, xs[i - 1] + ext[i - 1].x1 - ext[i].x0 + 0.3)
      xs.push(x)
    }
    const last = list.length - 1
    return { xs, over: xs[last] + ext[last].x1 - len / 2, ext }
  }
  let list = order
  let res = placeAll(list)
  // 放不下：去掉中间的普通款（不动最长、最宽的那件）
  while (res.over > 0 && list.length > 2) {
    const cand = list.map((_, i) => i).filter((i) => list[i] !== long && list[i] !== wide)
    list = list.filter((_, i) => i !== cand[Math.floor(cand.length / 2)])
    res = placeAll(list)
  }
  // 剩下的空当均摊到各件之间，整排正好占满
  const n = list.length
  const spare = -res.over
  const root = new THREE.Group()
  list.forEach((s, i) => {
    const g = fitted.get(s)!
    g.rotation.y = PI / 2
    g.position.x = res.xs[i] + (n > 1 ? (spare * i) / (n - 1) : spare / 2)
    root.add(g)
  })
  const out = bakeVertexColors(root)
  // 件数（统计用；根节点的 userData 不影响 mergeMeshes）
  out.userData.count = n
  return out
}

/** 一排叠好的衣服：沿 x 若干摞，每摞 2–6 件，整排正好占满 [-len/2, len/2]，最高一摞正好到 h、最深一件正好到 d */
export function foldedRow(len: number, o: RowOpts & { h: number; d: number }): THREE.Group {
  const rand = rng(o.seed)
  const ro: RandomOpts = { wardrobe: o.wardrobe, style: o.style, tones: o.tones, patternChance: 0.25 }
  const piles: { s: GarmentSpec; dims: [number, number, number]; ox: number; oz: number }[][] = []
  let used = 0
  // 每摞宽约 30–36，彼此留 1–3cm
  while (true) {
    const pile: (typeof piles)[number] = []
    let h = 0
    const kind = randomGarment(rand, ro).kind
    // 同一摞同品类（像店里那样按类叠）
    while (true) {
      const s = randomGarment(rand, { ...ro, kinds: [kind] })
      const dims = foldDims(s)
      dims[0] = Math.min(dims[0], len - 1)
      dims[1] = Math.min(dims[1], o.d)
      if (h + dims[2] > o.h || pile.length >= 6) break
      pile.push({ s, dims, ox: (rand() - 0.5) * 1.2, oz: (rand() - 0.5) * 1.2 })
      h += dims[2]
    }
    if (!pile.length) break
    const pw = Math.max(...pile.map((p) => p.dims[0] + Math.abs(p.ox) * 2))
    if (used + pw > len && piles.length) break
    piles.push(pile)
    used += pw + 2
    if (used > len) break
  }
  // 最高一摞补到 h：最上面那件加厚
  let tallest = 0
  let tallH = -1
  piles.forEach((p, i) => {
    const h = p.reduce((a, q) => a + q.dims[2], 0)
    if (h > tallH) {
      tallH = h
      tallest = i
    }
  })
  const tp = piles[tallest]
  tp[tp.length - 1].dims[2] += o.h - tallH
  // 最深一件补到 d、偏移归零
  const deep = tp[0]
  deep.dims[1] = o.d
  deep.oz = 0
  for (const p of piles) for (const q of p) q.oz = clamp(q.oz, -(o.d - q.dims[1]) / 2, (o.d - q.dims[1]) / 2)
  // 只有一摞：最宽的一件撑满整排宽度
  if (piles.length === 1) {
    const q = piles[0].reduce((a, b) => (b.dims[0] > a.dims[0] ? b : a))
    q.dims[0] = len
    for (const r of piles[0]) r.ox = r === q ? 0 : clamp(r.ox, -(len - r.dims[0]) / 2, (len - r.dims[0]) / 2)
  }
  // 摆开
  const widths = piles.map((p) => p.map((q) => [q.ox - q.dims[0] / 2, q.ox + q.dims[0] / 2]).reduce((a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])], [Infinity, -Infinity]))
  const total = widths.reduce((a, w) => a + w[1] - w[0], 0)
  const gap = piles.length > 1 ? (len - total) / (piles.length - 1) : 0
  const root = new THREE.Group()
  let x = -len / 2
  piles.forEach((p, i) => {
    const [w0, w1] = widths[i]
    const cx = piles.length > 1 ? x - w0 : -(w0 + w1) / 2
    let y = 0
    for (const q of p) {
      const g = buildFolded(q.s, mats(q.s), q.dims)
      g.position.set(cx + q.ox, y, q.oz)
      root.add(g)
      y += q.dims[2]
    }
    x += w1 - w0 + gap
  })
  return bakeVertexColors(root)
}

// ───────────────────────── 烘成顶点色 ─────────────────────────

let vcMat: THREE.MeshToonMaterial | null = null
/** 顶点色 toon 材质（白色底，描边按白色算出的深灰） */
function vertexColorMat() {
  if (!vcMat) vcMat = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap })
  return vcMat
}

/** 把一堆纯色 toon 网格合成一个顶点色网格（花纹材质的保留原样），一排几十件衣服只剩几个 draw call */
export function bakeVertexColors(root: THREE.Group) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const keep: THREE.Mesh[] = []
  const solid: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mat = m.material as THREE.MeshToonMaterial
    if (Array.isArray(mat) || mat.map || mat.transparent || !mat.isMeshToonMaterial) keep.push(m)
    else solid.push(m)
  })
  let verts = 0
  let tris = 0
  for (const m of solid) {
    verts += m.geometry.attributes.position.count
    tris += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count
  }
  const pos = new Float32Array(verts * 3)
  const nor = new Float32Array(verts * 3)
  const col = new Float32Array(verts * 3)
  const idx = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
  const local = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const v = new THREE.Vector3()
  let vo = 0
  let io = 0
  for (const m of solid) {
    const g = m.geometry
    local.multiplyMatrices(inv, m.matrixWorld)
    nm.getNormalMatrix(local)
    const flip = local.determinant() < 0
    const c = (m.material as THREE.MeshToonMaterial).color
    const P = g.attributes.position
    const N = g.attributes.normal
    const n = P.count
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(local)
      pos.set([v.x, v.y, v.z], (vo + i) * 3)
      if (N) {
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize()
        nor.set([v.x, v.y, v.z], (vo + i) * 3)
      }
      col.set([c.r, c.g, c.b], (vo + i) * 3)
    }
    const ia = g.index?.array
    const cnt = g.index ? g.index.count : n
    for (let i = 0; i < cnt; i += 3) {
      const a = ia ? ia[i] : i
      const b = ia ? ia[i + 1] : i + 1
      const cc = ia ? ia[i + 2] : i + 2
      idx[io++] = vo + a
      idx[io++] = vo + (flip ? cc : b)
      idx[io++] = vo + (flip ? b : cc)
    }
    vo += n
  }
  const out = new THREE.Group()
  if (solid.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    geo.computeBoundingSphere()
    const merged = new THREE.Mesh(geo, vertexColorMat())
    merged.castShadow = true
    merged.receiveShadow = true
    out.add(merged)
  }
  for (const m of keep) {
    local.multiplyMatrices(inv, m.matrixWorld)
    const k = new THREE.Mesh(m.geometry, m.material)
    local.decompose(k.position, k.quaternion, k.scale)
    k.castShadow = true
    k.receiveShadow = true
    out.add(k)
  }
  return out
}

/** 字符串 → 种子 */
export function hashSeed(...parts: string[]) {
  let h = 2166136261
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
