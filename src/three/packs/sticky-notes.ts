// 便签：方形 / 长条 / 心形 / 云朵 / 索引贴 / 一叠，带手写涂鸦线条、轻微卷角、随机小角度。
// 贴的（stick: true）原点在背面中心，模型向 +z 伸出、y 方向上下居中，可以贴在显示器边框、墙、冰箱门上；
// 桌面款（sn-desk-*）是平放的 prop，原点在底面中心。颜色：黄 / 粉 / 蓝 / 绿 / 橙 / 紫六组配色，[纸, 墨水, 副色, 第三色]。

import * as THREE from 'three'
import { rbox, shade, toon } from '../toon'
import { type AssetDef, type StyleTag } from '../kit'
import { noOutline } from '../geo'

const T = 0.12
const PALS: [StyleTag, string[]][] = [
  ['cute', ['#ffe680', '#5a5070', '#ffb3cc', '#9fd4ff']],
  ['modern', ['#ffb8cf', '#6a4a5a', '#ffe680', '#b8e8a0']],
  ['nordic', ['#a8d8ff', '#3e5070', '#ffc480', '#ffe680']],
  ['japanese', ['#bdeea0', '#4a5a40', '#d6c4ff', '#ffb8cf']],
  ['retro', ['#ffc27a', '#6a4a30', '#a8d8ff', '#bdeea0']],
  ['industrial', ['#d6c4ff', '#4a4070', '#ffe680', '#a8d8ff']],
]

/** 平面形状 → 薄片（正面朝 +z，背面贴在 z = 0） */
function sheet(shape: THREE.Shape, color: string, z = 0) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 10 })
  const m = new THREE.Mesh(geo, toon(color))
  m.position.z = z
  return m
}
function rectShape(w: number, h: number, cut = 0) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -h / 2)
  s.lineTo(w / 2 - cut, -h / 2)
  s.lineTo(w / 2, -h / 2 + cut)
  s.lineTo(w / 2, h / 2)
  s.lineTo(-w / 2, h / 2)
  s.closePath()
  return s
}
function heartShape(w: number, h: number) {
  const s = new THREE.Shape()
  const x = w / 2
  const y = h / 2
  s.moveTo(0, -y)
  s.bezierCurveTo(-x * 0.4, -y * 0.55, -x, -y * 0.1, -x, y * 0.35)
  s.bezierCurveTo(-x, y * 0.85, -x * 0.35, y * 1.05, 0, y * 0.55)
  s.bezierCurveTo(x * 0.35, y * 1.05, x, y * 0.85, x, y * 0.35)
  s.bezierCurveTo(x, -y * 0.1, x * 0.4, -y * 0.55, 0, -y)
  return s
}
function cloudShape(w: number, h: number) {
  const s = new THREE.Shape()
  const x = w / 2
  const y = h / 2
  s.moveTo(-x * 0.8, -y)
  s.lineTo(x * 0.8, -y)
  s.quadraticCurveTo(x * 1.08, -y * 0.6, x * 0.86, -y * 0.05)
  s.quadraticCurveTo(x * 1.0, y * 0.6, x * 0.45, y * 0.55)
  s.quadraticCurveTo(x * 0.25, y * 1.1, -x * 0.12, y * 0.82)
  s.quadraticCurveTo(-x * 0.55, y * 1.05, -x * 0.62, y * 0.42)
  s.quadraticCurveTo(-x * 1.08, y * 0.35, -x * 0.92, -y * 0.25)
  s.quadraticCurveTo(-x * 1.05, -y * 0.8, -x * 0.8, -y)
  return s
}

/** 一笔手写线条（细长扁条），从 (x0, y0) 到 (x1, y1) */
function stroke(x0: number, y0: number, x1: number, y1: number, ink: string, z: number, w = 0.22) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const m = noOutline(rbox(len, w, 0.04, ink, {}, 0.02))
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2 - w / 2, z)
  m.rotation.z = Math.atan2(y1 - y0, x1 - x0)
  return m
}
/** 折线 */
function poly(pts: [number, number][], ink: string, z: number, w = 0.22) {
  const g = new THREE.Group()
  for (let i = 1; i < pts.length; i++) g.add(stroke(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], ink, z, w))
  return g
}

type Doodle = 'lines' | 'scribble' | 'check' | 'smile' | 'star' | 'none'
/** 纸面上的涂鸦，尺寸 w × h（中心在原点） */
function doodle(kind: Doodle, w: number, h: number, ink: string, acc: string, z: number) {
  const g = new THREE.Group()
  const L = -w * 0.36
  if (kind === 'lines') {
    const n = Math.max(2, Math.min(4, Math.floor(h / 2)))
    for (let i = 0; i < n; i++) {
      const y = h * 0.28 - (i * h * 0.56) / Math.max(1, n - 1)
      const r = 0.36 - ((i * 7) % 3) * 0.08
      g.add(poly([[L, y], [L + w * 0.25, y + 0.15], [L + w * 0.5, y - 0.1], [w * r, y + 0.08]], ink, z))
    }
  } else if (kind === 'scribble') {
    g.add(poly([[L, h * 0.25], [L + w * 0.15, h * 0.32], [L + w * 0.3, h * 0.2], [L + w * 0.48, h * 0.3], [L + w * 0.62, h * 0.2]], ink, z))
    g.add(poly([[L, 0], [L + w * 0.2, 0.2], [L + w * 0.42, -0.1], [L + w * 0.56, 0.15]], ink, z))
    // 圈起来的重点 + 下划线
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2
      const a1 = ((i + 1) / 8) * Math.PI * 2
      g.add(stroke(w * 0.22 + Math.cos(a0) * w * 0.12, -h * 0.22 + Math.sin(a0) * h * 0.1, w * 0.22 + Math.cos(a1) * w * 0.12, -h * 0.22 + Math.sin(a1) * h * 0.1, acc, z, 0.2))
    }
    g.add(stroke(L, -h * 0.3, L + w * 0.3, -h * 0.34, ink, z))
  } else if (kind === 'check') {
    for (let i = 0; i < 3; i++) {
      const y = h * 0.25 - i * h * 0.25
      const b = Math.min(w, h) * 0.1
      g.add(poly([[L, y - b], [L + b * 2, y - b], [L + b * 2, y + b], [L, y + b], [L, y - b]], ink, z, 0.15))
      if (i < 2) g.add(poly([[L + b * 0.3, y], [L + b, y - b * 0.7], [L + b * 2.6, y + b * 1.4]], acc, z + 0.02, 0.24))
      g.add(stroke(L + b * 3, y, w * (0.3 - i * 0.05), y + 0.1, ink, z))
    }
  } else if (kind === 'smile') {
    const r = Math.min(w, h) * 0.28
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2
      const a1 = ((i + 1) / 12) * Math.PI * 2
      g.add(stroke(Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r, ink, z, 0.2))
    }
    for (const s of [-1, 1]) g.add(noOutline(rbox(0.35, 0.5, 0.04, ink, { x: s * r * 0.35, y: r * 0.1, z }, 0.1)))
    g.add(poly([[-r * 0.5, -r * 0.25], [-r * 0.2, -r * 0.5], [r * 0.2, -r * 0.5], [r * 0.5, -r * 0.25]], ink, z, 0.2))
  } else if (kind === 'star') {
    const r = Math.min(w, h) * 0.3
    const pts: [number, number][] = []
    for (let i = 0; i <= 5; i++) {
      const a = Math.PI / 2 + (i * 4 * Math.PI) / 5
      pts.push([Math.cos(a) * r, Math.sin(a) * r])
    }
    g.add(poly(pts, acc, z, 0.22))
  }
  return g
}

/** 卷起的一角：右下角被切掉的那块翻折到正面（沿切口斜边对折），再往外翘一点 */
function curl(w: number, h: number, size: number, color: string, z: number) {
  // 局部坐标以斜边中点为原点：斜边沿 (1, 1) 方向，翻过来的三角尖在 (-size/2, size/2)
  const k = size / 2
  const s = new THREE.Shape()
  s.moveTo(-k, -k)
  s.lineTo(k, k)
  s.lineTo(-k, k)
  s.closePath()
  const m = sheet(s, shade(color, -0.14), 0)
  const g = new THREE.Group()
  g.add(m)
  g.position.set(w / 2 - k, -h / 2 + k, z + T + 0.02)
  g.rotateOnAxis(new THREE.Vector3(1, 1, 0).normalize(), 0.45)
  return g
}

interface NoteSpec {
  shape: 'square' | 'strip' | 'vstrip' | 'heart' | 'cloud'
  doodle: Doodle
  /** 纸色用第几个配色槽（0 主色、2 / 3 副色） */
  slot?: number
  curl?: boolean
}
const SIZE: Record<NoteSpec['shape'], [number, number]> = { square: [7.6, 7.6], strip: [12.5, 3.8], vstrip: [3.8, 10], heart: [7.2, 6.6], cloud: [9, 6.2] }

/** 一张便签（正面朝 +z，背面在 z = z0），返回组 */
function note(spec: NoteSpec, p: string[], z0 = 0) {
  const paper = p[spec.slot ?? 0]
  const ink = p[1]
  const acc = spec.slot ? p[0] : p[2]
  const [w, h] = SIZE[spec.shape]
  const g = new THREE.Group()
  const cut = spec.curl ? 2 : 0
  const shape = spec.shape === 'heart' ? heartShape(w, h) : spec.shape === 'cloud' ? cloudShape(w, h) : rectShape(w, h, cut)
  g.add(sheet(shape, paper, z0))
  // 顶上一条胶带的背胶区（略深）
  if (spec.shape === 'square' || spec.shape === 'strip') g.add(noOutline(rbox(w - 0.2, Math.min(1.4, h * 0.2), 0.03, shade(paper, -0.05), { y: h / 2 - Math.min(1.4, h * 0.2) - 0.1, z: z0 + T + 0.01 }, 0.01)))
  g.add(doodle(spec.doodle, w * (spec.shape === 'heart' ? 0.7 : 0.9), h * (spec.shape === 'heart' ? 0.6 : 0.85), ink, acc, z0 + T + 0.03))
  if (spec.curl) g.add(curl(w, h, cut, paper, z0))
  return g
}

/** 贴着的单张：整体在纸面内转 tilt（度） */
function stuck(spec: NoteSpec, tilt: number) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const n = note(spec, p)
    n.rotation.z = (tilt * Math.PI) / 180
    g.add(n)
    return g
  }
}
/** 一叠（还没撕开的便签本）：几张错开一点叠着，最上面一张有字 */
function stack(rainbow: boolean, tilt: number) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const cols = rainbow ? [p[3], p[2], p[0], p[3]] : [p[0], p[0], p[0], p[0]]
    for (let i = 0; i < 4; i++) {
      const top = i === 3
      const n = top ? note({ shape: 'square', doodle: 'lines', curl: !rainbow }, [cols[i], p[1], p[2], p[3]], i * (T + 0.02)) : new THREE.Group().add(sheet(rectShape(7.6, 7.6), shade(cols[i], -0.03 * (3 - i)), i * (T + 0.02)))
      n.rotation.z = ((tilt + (i - 1.5) * 2.2) * Math.PI) / 180
      n.position.set((i - 1.5) * 0.18, (1.5 - i) * 0.15, 0)
      g.add(n)
    }
    return g
  }
}
/** 索引贴：一排窄条（fan = 扇形散开） */
function tabs(fan: boolean) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const cols = [p[0], p[2], p[3], shade(p[0], -0.15), p[2]]
    const n = fan ? 4 : 5
    for (let i = 0; i < n; i++) {
      const m = new THREE.Group()
      m.add(sheet(rectShape(1.5, 5), cols[i], 0))
      // 下半截是透明胶片：画成浅色
      m.add(noOutline(rbox(1.5, 2.2, 0.03, '#f4f6f8', { y: -2.5, z: T + 0.01 }, 0.01)))
      if (fan) {
        m.position.set(-1 + i * 0.9, -0.5, i * 0.03)
        m.rotation.z = (-25 + i * 16) * (Math.PI / 180)
      } else m.position.set(-3.4 + i * 1.7, (i % 2) * 0.4, 0)
      g.add(m)
    }
    return g
  }
}
/** 三张一组：方形 + 心形 + 长条，彼此压一点 */
function trio(p: string[]) {
  const g = new THREE.Group()
  const a = note({ shape: 'square', doodle: 'check' }, p, 0)
  a.position.set(-3, 1, 0)
  a.rotation.z = -0.08
  const b = note({ shape: 'heart', doodle: 'none', slot: 2 }, p, T + 0.02)
  b.position.set(3.4, 1.8, 0)
  b.rotation.z = 0.15
  const c = note({ shape: 'strip', doodle: 'lines', slot: 3 }, p, 2 * (T + 0.02))
  c.position.set(1, -3.6, 0)
  c.rotation.z = 0.05
  g.add(a, b, c)
  return g
}

/** 竖直贴着的 → 平放在桌上：绕 x 转 -90°，原点落到底面 */
function lying(build: (p: string[]) => THREE.Group, yaw = 0) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const inner = build(p)
    inner.rotation.x = -Math.PI / 2
    const w = new THREE.Group()
    w.add(inner)
    w.rotation.y = yaw
    g.add(w)
    return g
  }
}
/** 便签方块（厚厚一摞彩色纸，平放） */
function cube(p: string[]) {
  const g = new THREE.Group()
  const cols = [p[0], p[2], p[3], p[0], p[2], p[3], p[0], p[2]]
  for (let i = 0; i < cols.length; i++) g.add(rbox(9, 0.7, 9, cols[i], { y: i * 0.7 }, 0.08))
  const top = lying(stuck({ shape: 'square', doodle: 'scribble' }, 0))(p)
  top.scale.set(9 / 7.6, 1, 9 / 7.6)
  top.position.y = cols.length * 0.7
  g.add(top)
  return g
}
/** 桌上散着几张 */
function loose(p: string[]) {
  const g = new THREE.Group()
  const a = lying((q) => new THREE.Group().add(note({ shape: 'square', doodle: 'lines' }, q)), 0.3)(p)
  a.position.set(-3.5, 0, 1)
  const b = lying((q) => new THREE.Group().add(note({ shape: 'square', doodle: 'smile', slot: 2 }, q)), -0.25)(p)
  b.position.set(2.5, T + 0.02, -1.5)
  const c = lying((q) => new THREE.Group().add(note({ shape: 'heart', doodle: 'none', slot: 3 }, q)), 0.6)(p)
  c.position.set(3.8, 2 * (T + 0.02), 3.2)
  g.add(a, b, c)
  return g
}
/** 索引贴（装在小卡片上，平放） */
function tabPack(p: string[]) {
  const g = new THREE.Group()
  g.add(rbox(8.5, 0.2, 7, '#f4f6f8', {}, 0.05))
  const t = lying(tabs(false))(p)
  t.position.y = 0.2
  g.add(t)
  return g
}

/** 贴附物尺寸：转 tilt 后的外接矩形 */
function bound(w: number, h: number, tilt: number): [number, number] {
  const a = Math.abs((tilt * Math.PI) / 180)
  return [Math.round((w * Math.cos(a) + h * Math.sin(a)) * 10) / 10 + 0.4, Math.round((w * Math.sin(a) + h * Math.cos(a)) * 10) / 10 + 0.4]
}

function base(id: string, name: string, sizeLabel: string | undefined, dims: [number, number, number], build: (p: string[]) => THREE.Group, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    ...(sizeLabel ? { sizeLabel } : {}),
    category: 'deco',
    w: dims[0],
    d: dims[1],
    h: dims[2],
    palettes: PALS.map((x) => x[1]),
    paletteStyles: PALS.map((x) => x[0]),
    styles: PALS.map((x) => x[0]),
    build,
    prop: true,
    ...extra,
  }
}
function stuckDef(id: string, name: string, label: string, spec: NoteSpec, tilt: number) {
  const [w, h] = bound(...SIZE[spec.shape], tilt)
  return base(id, name, label, [w, 0.6, h], stuck(spec, tilt), { stick: true })
}

export const STICKY_NOTES: AssetDef[] = [
  // 贴的
  // 贴的单张都端正：歪一点的角度是摆放时的 spin（Furniture.spin，一键布置随机给一点），不做成变体
  stuckDef('sn-square-scribble', '方形便签', '涂鸦', { shape: 'square', doodle: 'scribble' }, 0),
  stuckDef('sn-square-check', '方形便签', '清单', { shape: 'square', doodle: 'check' }, 0),
  stuckDef('sn-square-smile', '方形便签', '笑脸', { shape: 'square', doodle: 'smile', slot: 2 }, 0),
  stuckDef('sn-square-curl', '方形便签', '卷角', { shape: 'square', doodle: 'lines', curl: true }, 0),
  stuckDef('sn-strip-h', '长条便签', '横条', { shape: 'strip', doodle: 'lines' }, 0),
  stuckDef('sn-strip-v', '长条便签', '竖条', { shape: 'vstrip', doodle: 'lines', slot: 3 }, 0),
  stuckDef('sn-heart-l', '心形便签', '空白', { shape: 'heart', doodle: 'none' }, 0),
  stuckDef('sn-heart-r', '心形便签', '星星', { shape: 'heart', doodle: 'star', slot: 2 }, 0),
  stuckDef('sn-cloud-l', '云朵便签', '横线', { shape: 'cloud', doodle: 'lines', slot: 3 }, 0),
  stuckDef('sn-cloud-r', '云朵便签', '笑脸', { shape: 'cloud', doodle: 'smile' }, 0),
  base('sn-stack', '一叠便签', '同色', [9.6, 1, 9.6], stack(false, -3), { stick: true }),
  base('sn-stack-rainbow', '一叠便签', '彩虹', [9.6, 1, 9.6], stack(true, 4), { stick: true }),
  base('sn-tabs-row', '索引贴', '一排', [9, 0.6, 5.8], tabs(false), { stick: true }),
  base('sn-tabs-fan', '索引贴', '扇形', [7.6, 0.8, 6.4], tabs(true), { stick: true }),
  base('sn-trio', '便签组', undefined, [15.4, 1, 13.4], trio, { stick: true }),
  // 桌面上平放的
  base('sn-desk-pad', '便签本', '一本', [10, 10, 0.8], lying(stack(false, 0), 0.2), { }),
  base('sn-desk-cube', '便签本', '彩色方块', [9.2, 9.2, 6.6], cube),
  base('sn-desk-loose', '便签本', '散落几张', [17, 13.5, 0.6], loose),
  base('sn-desk-tabs', '便签本', '索引贴卡', [9, 7.4, 0.5], tabPack),
]
