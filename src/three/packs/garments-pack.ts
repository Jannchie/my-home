// 衣物素材包（gm- 前缀）：参数化衣物生成器（../garments.ts）的代表款。
//   - 每个品类一个系列（family），sizeLabel 写款式，同款有「叠好 / 挂起」两种形态（帽子是「平放 / 挂起」，
//     毛巾多一种「挂钩吊起」）；挂起形态按品类自动配衣架。
//   - 衣架单独成系列（挂起 / 平放）。
//   - 一排衣服：每个衣柜主题一个系列，sizeLabel 是长度（cm），挂起 = 侧挂在杆上的一排，叠好 = 一排叠好的衣服摞。
//     同一素材换配色就换一批随机款式（种子 = id + 配色）。
//   - 衣柜挂杆（枕棚 + パイプ）：壁挂，收纳间里挂一排排衣服用。

import * as THREE from 'three'
import { GARMENT_LABELS, buildGarment, buildHanger, foldedRow, garment, garmentRow, hashSeed, measureGarment, ROW_ENVELOPE, WARDROBE_LABELS, type GarmentKind, type GarmentSpec, type HangerMat, type HangerType, type Wardrobe } from '../garments'
import { rectPoly, type AssetCategory, type AssetDef, type FormTag, type StyleTag } from '../kit'
import type { PatternKind } from '../patterns'
import { cyl, rbox, shade } from '../toon'
import { I, J, M, N, R, define, type Pal } from '../packkit'

/** 衣物通用配色：[主色, 副色, 点缀色] */
const WEAR: Pal[] = [
  ['nordic', ['#d9cbb4', N.white, '#3f4f66']],
  ['nordic', [N.sage, N.linen, N.oak]],
  ['modern', [M.char, M.gray, M.white]],
  ['modern', [M.white, M.light, M.black]],
  ['cute', ['#ffb6c8', '#fff1dc', '#8fa7d6']],
  ['cute', ['#a8d4f4', '#fbf7f1', '#ff8f86']],
  ['japanese', [J.ai, J.washi, J.shu]],
  ['industrial', ['#5d6b4a', '#a89a78', I.iron]],
  ['retro', [R.mustard, R.cream, R.red]],
]
const DENIM_PAL: Pal[] = [
  ['industrial', ['#3b5a80', '#2d4462', '#c9a45c']],
  ['modern', ['#2a2f3a', '#3d3f44', M.silver]],
  ['nordic', ['#6d8db3', '#4f6f99', '#c9a45c']],
  ['retro', ['#4f6f99', R.cream, R.orange]],
]
const SUIT_PAL: Pal[] = [
  ['modern', ['#2e3a52', '#24252a', '#e8edf3']],
  ['modern', [M.char, M.black, '#e8edf3']],
  ['nordic', [N.gray, '#8a9a82', N.white]],
  ['retro', [R.caramel, '#7a2f3a', R.cream]],
  ['industrial', ['#6e4b33', I.iron, I.concrete]],
]
const KIMONO_PAL: Pal[] = [
  ['japanese', [J.ai, J.washi, J.shu]],
  ['japanese', ['#f6f0e1', J.ai, '#c9cf8e']],
  ['japanese', [J.shu, J.washi, J.sumi]],
  ['cute', ['#ffd6e0', '#fbf7f1', '#cfb8f3']],
  ['retro', [R.teal, R.cream, R.mustard]],
]
const TOWEL_PAL: Pal[] = [
  ['nordic', ['#fbf8f2', N.blue, N.gray]],
  ['nordic', [N.sage, N.linen, N.oak]],
  ['modern', [M.light, M.char, M.white]],
  ['modern', [M.char, M.gray, M.light]],
  ['cute', ['#ffd6e0', '#fbf7f1', '#a6e3cc']],
  ['cute', ['#a6e3cc', '#fbf7f1', '#ffb6c8']],
  ['japanese', [J.washi, J.ai, J.shu]],
  ['retro', [R.mustard, R.cream, R.orange]],
]
const HAT_PAL: Pal[] = [
  ['nordic', ['#d9cbb4', N.oak, N.blue]],
  ['modern', [M.black, M.char, M.silver]],
  ['cute', ['#ffd6e0', '#fbf7f1', '#ff8f86']],
  ['retro', [R.caramel, R.cream, R.red]],
  ['industrial', ['#5d6b4a', I.iron, I.rust]],
  ['japanese', ['#e9cf8f', J.sumi, J.shu]],
]

// ---------- 单件衣物 ----------

/** 一个款式：在品类默认值上覆盖的参数；pattern 只给花纹种类，颜色从配色里取 */
interface Style {
  label: string
  o?: Partial<GarmentSpec>
  pattern?: { kind: PatternKind; scale: number; angle?: 0 | 45 | 90; density?: number; ink?: 1 | 2 }
  /** 这个款式专用的配色（不给用品类的） */
  pals?: Pal[]
}

interface Line {
  kind: GarmentKind
  category?: AssetCategory
  pals?: Pal[]
  styles: Style[]
  /** 非挂起形态的 form 标签 */
  rest?: FormTag
}

const LINES: Line[] = [
  { kind: 'tee', styles: [{ label: '圆领短袖' }, { label: '横条纹', o: { collar: 'crew' }, pattern: { kind: 'stripes', scale: 6, angle: 0, ink: 2 } }, { label: 'V 领宽松', o: { collar: 'v', fit: 0.8, width: 48 } }] },
  { kind: 'tank', styles: [{ label: '细吊带', o: { straps: true, width: 36 } }, { label: '宽肩背心', o: { straps: true, fit: 0.6, width: 40 } }] },
  { kind: 'polo', styles: [{ label: '基础款' }] },
  {
    kind: 'shirt',
    styles: [
      { label: '长袖白衬衫', o: { sleeve: 60 } },
      { label: '短袖', o: { sleeve: 24 } },
      { label: '竖条纹', o: { sleeve: 60 }, pattern: { kind: 'stripes', scale: 4, angle: 90, density: 0.3, ink: 2 } },
      { label: '格子', o: { sleeve: 60 }, pattern: { kind: 'gingham', scale: 8, ink: 2 } },
    ],
  },
  {
    kind: 'blouse',
    styles: [
      { label: '蝴蝶结', o: { collar: 'bow', sleeve: 56, buttons: 0 } },
      { label: '小圆领短袖', o: { collar: 'round', sleeve: 20, buttons: 6 } },
      { label: '碎花 V 领', o: { collar: 'v', sleeve: 52, fit: 0.6 }, pattern: { kind: 'flowers', scale: 9, ink: 2 } },
    ],
  },
  { kind: 'hoodie', styles: [{ label: '套头', o: { pockets: true } }, { label: '拉链', o: { zip: true, pockets: true } }] },
  { kind: 'sweatshirt', styles: [{ label: '圆领' }] },
  {
    kind: 'sweater',
    styles: [
      { label: '圆领' },
      { label: '高领', o: { collar: 'turtle' } },
      { label: '菱格 V 领', o: { collar: 'v' }, pattern: { kind: 'argyle', scale: 12, ink: 2 } },
    ],
  },
  { kind: 'cardigan', styles: [{ label: '短款', o: { len: 58 } }, { label: '长款', o: { len: 76, fit: 0.6, pockets: true } }] },
  { kind: 'jacket', styles: [{ label: '拉链夹克' }, { label: '牛仔夹克', o: { zip: false, buttons: 5, collar: 'shirt', rib: false }, pals: DENIM_PAL }] },
  { kind: 'blazer', pals: SUIT_PAL, styles: [{ label: '单排两粒' }, { label: '双排扣', o: { double: true, buttons: 3 } }, { label: '千鸟格', pattern: { kind: 'houndstooth', scale: 6, ink: 2 } }] },
  { kind: 'coat', styles: [{ label: '切斯特大衣', o: { len: 100 } }, { label: '立领长大衣', o: { collar: 'stand', len: 108, buttons: 5 } }] },
  { kind: 'trench', pals: [['nordic', ['#c8ad84', '#b99a6e', '#5a4a3a']], ['modern', ['#3f4436', '#2e2e30', M.silver]], ['retro', ['#d8c6a5', R.caramel, R.red]], ['modern', ['#2e3a52', '#24252a', M.silver]]], styles: [{ label: '双排扣', o: { len: 104 } }] },
  { kind: 'down', styles: [{ label: '短款', o: { len: 68, quilt: 5 } }, { label: '长款连帽', o: { len: 98, quilt: 7, collar: 'hood' } }] },
  {
    kind: 'dress',
    styles: [
      { label: '长袖 A 字', o: { sleeve: 54, hem: 1.6, len: 104 } },
      { label: '吊带长裙', o: { straps: true, sleeve: 0, hem: 1.4, len: 118 } },
      { label: '短袖碎花', o: { sleeve: 20, hem: 1.6, len: 96, collar: 'round' }, pattern: { kind: 'flowers', scale: 10, ink: 2 } },
      { label: '衬衫裙', o: { collar: 'shirt', sleeve: 24, buttons: 7, hem: 1.25, len: 108, belt: true } },
      { label: '无袖直筒', o: { sleeve: 0, hem: 1.05, len: 92, collar: 'crew' } },
    ],
  },
  {
    kind: 'skirt',
    styles: [
      { label: 'A 字中裙', o: { len: 62, hem: 1.6 } },
      { label: '百褶长裙', o: { len: 80, hem: 1.8, pleats: true } },
      { label: '格纹短裙', o: { len: 44, hem: 1.5, pleats: true }, pattern: { kind: 'tartan', scale: 10, ink: 2 } },
    ],
  },
  { kind: 'pants', pals: SUIT_PAL, styles: [{ label: '西裤' }, { label: '阔腿裤', o: { width: 42 } }] },
  { kind: 'jeans', pals: DENIM_PAL, styles: [{ label: '直筒', o: { hem: 1 } }, { label: '喇叭', o: { hem: 1.35 } }] },
  { kind: 'shorts', styles: [{ label: '休闲短裤' }, { label: '格纹短裤', pattern: { kind: 'gingham', scale: 8, ink: 2 } }] },
  { kind: 'overalls', pals: DENIM_PAL, styles: [{ label: '牛仔背带裤' }] },
  {
    kind: 'kimono',
    category: 'japanese',
    pals: KIMONO_PAL,
    styles: [
      { label: '浴衣·麻叶', pattern: { kind: 'asanoha', scale: 10, ink: 1 } },
      { label: '浴衣·青海波', pattern: { kind: 'seigaiha', scale: 10, ink: 1 } },
      { label: '振袖·樱', o: { sleeve: 90 }, pattern: { kind: 'sakura', scale: 14, ink: 2 } },
    ],
  },
  { kind: 'scarf', styles: [{ label: '格纹', pattern: { kind: 'tartan', scale: 12, ink: 2 } }, { label: '条纹', pattern: { kind: 'stripes', scale: 8, angle: 0, ink: 1 } }, { label: '纯色针织', o: { thick: 1.2, width: 22 } }] },
  { kind: 'tie', pals: SUIT_PAL, styles: [{ label: '单条', o: { variant: '1' }, pattern: { kind: 'stripes', scale: 4, angle: 45, ink: 2 } }, { label: '三条', o: { variant: '3' } }] },
  {
    kind: 'hat',
    pals: HAT_PAL,
    rest: 'lying',
    styles: [
      { label: '棒球帽', o: { variant: 'cap' } },
      { label: '毛线帽', o: { variant: 'beanie' } },
      { label: '渔夫帽', o: { variant: 'bucket' } },
      { label: '草帽', o: { variant: 'straw' }, pals: [HAT_PAL[5], ['nordic', ['#e6d3a3', N.oak, N.blue]], ['cute', ['#f3e2b0', '#ffb6c8', '#ffb6c8']], ['retro', ['#e0c27a', R.caramel, R.red]]] },
      { label: '礼帽', o: { variant: 'fedora' } },
      { label: '贝雷帽', o: { variant: 'beret' } },
    ],
  },
]

/** 款式 + 配色 → 规格 */
function specOf(kind: GarmentKind, st: Style, p: string[]): GarmentSpec {
  const o = st.o ?? {}
  const s = garment(kind, { ...o, main: p[0], sub: p[1], accent: p[2] })
  if (st.pattern) s.pattern = { kind: st.pattern.kind, colors: [s.main, st.pattern.ink === 1 ? s.sub : s.accent, s.sub], scale: st.pattern.scale, angle: st.pattern.angle ?? 0, density: st.pattern.density ?? 0.45, seed: 7 }
  return s
}

/** 落地居中：包围盒底面 y = 0、xz 居中 */
function ground(g: THREE.Group) {
  const b = new THREE.Box3().setFromObject(g, true)
  g.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  return new THREE.Group().add(g)
}

const NAMES: Partial<Record<GarmentKind, string>> = { kimono: '和服 / 浴衣', tank: '背心', pants: '长裤' }
const CLOTHES: AssetDef[] = LINES.flatMap((line) => {
  const label = NAMES[line.kind] ?? GARMENT_LABELS[line.kind]
  return line.styles.flatMap((st, i) => {
    const pals = st.pals ?? line.pals ?? WEAR
    const base = `gm-${line.kind}-s${i + 1}`
    const ref = specOf(line.kind, st, pals[0][1])
    const common = { sizeLabel: st.label, prop: true, limit: { scope: 'surface' as const, max: 30 } }
    return [
      define(`${base}-${line.rest ?? 'folded'}`, label, line.category ?? 'deco', measureGarment(ref, 'folded'), pals, (p) => ground(buildGarment(specOf(line.kind, st, p), 'folded')), { ...common, form: line.rest ?? 'folded' }),
      define(`${base}-hanging`, label, line.category ?? 'deco', measureGarment(ref, 'hanging'), pals, (p) => buildGarment(specOf(line.kind, st, p), 'hanging'), { ...common, form: 'hanging' }),
    ]
  })
})

// ---------- 毛巾 ----------

const TOWEL_STYLES: { key: string; label: string; variant: string; pattern?: Style['pattern'] }[] = [
  { key: 'bath', label: '浴巾', variant: 'bath' },
  { key: 'bath-stripe', label: '浴巾·条纹', variant: 'bath', pattern: { kind: 'stripes', scale: 8, angle: 90, ink: 1 } },
  { key: 'face', label: '面巾', variant: 'face' },
  { key: 'face-check', label: '面巾·格子', variant: 'face', pattern: { kind: 'gingham', scale: 6, ink: 1 } },
  { key: 'hand', label: '擦手巾', variant: 'hand' },
  { key: 'hand-dots', label: '擦手巾·小图案', variant: 'hand', pattern: { kind: 'stars', scale: 6, ink: 2 } },
]
function towelSpec(t: (typeof TOWEL_STYLES)[number], p: string[]) {
  const s = garment('towel', { main: p[0], sub: p[1], accent: p[2], variant: t.variant, thick: t.variant === 'bath' ? 0.9 : 0.7 })
  if (t.pattern) s.pattern = { kind: t.pattern.kind, colors: [p[0], t.pattern.ink === 1 ? p[1] : p[2]], scale: t.pattern.scale, angle: t.pattern.angle ?? 0, density: 0.4, seed: 3 }
  return s
}
const TOWELS: AssetDef[] = TOWEL_STYLES.flatMap((t) => {
  const ref = towelSpec(t, TOWEL_PAL[0][1])
  const common = { sizeLabel: t.label, prop: true, limit: { scope: 'surface' as const, max: 30 } }
  return [
    define(`gm-towel-${t.key}-folded`, '毛巾', 'toiletry', measureGarment(ref, 'folded'), TOWEL_PAL, (p) => ground(buildGarment(towelSpec(t, p), 'folded')), { ...common, form: 'folded' }),
    define(`gm-towel-${t.key}-bar`, '毛巾', 'toiletry', measureGarment(ref, 'bar'), TOWEL_PAL, (p) => buildGarment(towelSpec(t, p), 'bar'), { ...common, form: 'hanging', formLabel: '搭在杆上' }),
    define(`gm-towel-${t.key}-hook`, '毛巾', 'toiletry', measureGarment(ref, 'hook'), TOWEL_PAL, (p) => buildGarment(towelSpec(t, p), 'hook'), { ...common, form: 'hanging', formLabel: '挂钩吊起' }),
  ]
})

/** 一摞叠好的毛巾（3–5 条，颜色在配色里轮换） */
function towelStack(variant: string, n: number) {
  return (p: string[]) => {
    const g = new THREE.Group()
    let y = 0
    for (let i = 0; i < n; i++) {
      const s = garment('towel', { main: i % 2 ? p[1] : p[0], sub: shade(i % 2 ? p[1] : p[0], -0.15), accent: p[2], variant })
      const t = buildGarment(s, 'folded')
      t.position.set(((i * 37) % 5) * 0.2 - 0.4, y, ((i * 23) % 3) * 0.3 - 0.3)
      g.add(t)
      y += new THREE.Box3().setFromObject(t, true).getSize(new THREE.Vector3()).y - 0.35 // 减去织带高出顶面的 0.3，上一条压实在下一条上
    }
    return ground(g)
  }
}
const STACKS: [string, string, string, number][] = [
  ['gm-towel-stack-bath', '浴巾 ×3', 'bath', 3],
  ['gm-towel-stack-face', '面巾 ×4', 'face', 4],
  ['gm-towel-stack-hand', '擦手巾 ×5', 'hand', 5],
]
const TOWEL_STACKS: AssetDef[] = STACKS.map(([id, label, v, n]) => {
  const b = new THREE.Box3().setFromObject(towelStack(v, n)(TOWEL_PAL[0][1]), true).getSize(new THREE.Vector3())
  return define(id, '一摞毛巾', 'toiletry', [Math.round(b.x * 10) / 10, Math.round(b.z * 10) / 10, Math.round(b.y * 10) / 10], TOWEL_PAL, towelStack(v, n), { sizeLabel: label, prop: true, form: 'stacked', limit: { scope: 'surface', max: 30 } })
})

// ---------- 衣架 ----------

const HANGER_PAL: Pal[] = [
  ['nordic', ['#c99a66']],
  ['japanese', ['#8a6446']],
  ['modern', ['#3a3a40']],
  ['modern', ['#f4f1ec']],
  ['cute', ['#ffb6c8']],
  ['industrial', ['#c3c7cc']],
]
const HANGERS: [string, string, HangerType, HangerMat, { hw?: number; heavy?: boolean }][] = [
  ['wood', '木质肩形', 'shoulder', 'wood', {}],
  ['wood-wide', '厚肩西装衣架', 'shoulder', 'wood', { heavy: true, hw: 21 }],
  ['plastic', '塑料衣架', 'shoulder', 'plastic', {}],
  ['wire', '金属丝衣架', 'shoulder', 'wire', {}],
  ['velvet', '植绒防滑衣架', 'shoulder', 'velvet', {}],
  ['bar', '裤架（带横杆）', 'bar', 'wood', {}],
  ['clip', '夹子裙架', 'clip', 'plastic', { hw: 18 }],
  ['tie', '领带架', 'tie', 'wire', {}],
  ['kids', '儿童衣架', 'shoulder', 'plastic', { hw: 13 }],
]
const hangerBuild = (type: HangerType, mat: HangerMat, o: { hw?: number; heavy?: boolean }, lying: boolean) => (p: string[]) => {
  const g = buildHanger(type, mat, p[0], o)
  if (!lying) return g
  g.rotation.x = -Math.PI / 2
  return ground(new THREE.Group().add(g))
}
const measure = (g: THREE.Object3D): [number, number, number] => {
  const b = new THREE.Box3().setFromObject(g, true)
  const s = b.getSize(new THREE.Vector3())
  return [Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10, Math.round(Math.max(s.y, -b.min.y) * 10) / 10]
}
const HANGER_DEFS: AssetDef[] = HANGERS.flatMap(([key, label, type, mat, o]) =>
  ([false, true] as const).map((lying) => {
    const b = hangerBuild(type, mat, o, lying)
    return define(`gm-hanger-${key}-${lying ? 'lying' : 'hanging'}`, '衣架', 'storage', measure(b(HANGER_PAL[0][1])), HANGER_PAL, b, {
      sizeLabel: label,
      prop: true,
      form: lying ? 'lying' : 'hanging',
      limit: { scope: 'surface', max: 30 },
    })
  }),
)

// ---------- 一排衣服 ----------

/** 行配色：[色调 1, 色调 2, 衣架色]，两组色调影响约四成衣服的颜色 */
const ROW_PAL: Pal[] = [
  ['nordic', ['#d9cbb4', N.sage, '#c99a66']],
  ['nordic', [N.blue, N.linen, '#e9d8bd']],
  ['modern', [M.char, M.light, '#3a3a40']],
  ['modern', ['#2e3a52', M.gray, '#c3c7cc']],
  ['cute', ['#ffb6c8', '#a8d4f4', '#f4f1ec']],
  ['cute', ['#cfb8f3', '#ffe08f', '#ffd6e0']],
  ['japanese', [J.ai, J.washi, '#8a6446']],
  ['industrial', ['#5d6b4a', '#3b5a80', '#c3c7cc']],
  ['retro', [R.mustard, R.teal, '#a8683a']],
  ['retro', [R.orange, '#7a2f3a', '#c99a66']],
]
const STYLE_OF = new Map(ROW_PAL.map(([s, p]) => [p.join(), s]))
const hangerMatFor = (style: StyleTag, color: string): HangerMat => (style === 'industrial' ? 'wire' : style === 'cute' ? 'plastic' : style === 'modern' ? (color === '#3a3a40' ? 'velvet' : 'wire') : 'wood')

export const ROW_LENGTHS = [30, 45, 60, 90, 120]
/** 叠好的一排：高 28（约 3–6 件一摞）、深 40 */
const FOLD_ROW = { h: 28, d: 40 }
const WARDROBES: Wardrobe[] = ['women', 'men', 'kids', 'casual', 'outer']
const ROWS: AssetDef[] = WARDROBES.flatMap((wd) =>
  ROW_LENGTHS.flatMap((len) => {
    const [Dcap, Hcap] = ROW_ENVELOPE[wd]
    const fam = { sizeLabel: `${len}`, limit: { scope: 'house' as const, max: 99 } }
    const name = `一排衣服（${WARDROBE_LABELS[wd]}）`
    const rowStyle = (p: string[]): StyleTag => STYLE_OF.get(p.join()) ?? 'nordic'
    const hanging = define(`gm-row-${wd}-${len}-hanging`, name, 'storage', [len, Dcap, Hcap], ROW_PAL, (p) => {
      const style = rowStyle(p)
      return garmentRow(len, { seed: hashSeed(`gm-row-${wd}-${len}`, ...p), wardrobe: wd, style, tones: [p[0], p[1]], hanger: hangerMatFor(style, p[2]), hangerColor: p[2] })
    }, { ...fam, form: 'hanging', prop: true })
    const folded = define(`gm-row-${wd}-${len}-folded`, name, 'storage', [len, FOLD_ROW.d, FOLD_ROW.h], ROW_PAL, (p) => {
      return foldedRow(len, { seed: hashSeed(`gm-rowf-${wd}-${len}`, ...p), wardrobe: wd, style: rowStyle(p), tones: [p[0], p[1]], h: FOLD_ROW.h - 0.6, d: FOLD_ROW.d })
    }, { ...fam, form: 'folded', prop: true })
    return [hanging, folded]
  }),
)

// ---------- 衣柜挂杆（枕棚 + パイプ） ----------

/** 壁挂：mount = 托架底；挂杆中心离墙 25cm（占地进深 50 = 衣服侧挂的进深），枕棚板深 42 */
export const PIPE = { mount: 160, d: 50, pipeY: 170, pipeR: 1.6, shelfY: 180, shelfT: 2, shelfD: 42 }
function closetPipe(w: number) {
  return (p: string[]) => {
    const [board, metal] = p
    const g = new THREE.Group()
    const zw = -PIPE.d / 2
    // 墙上的横档
    g.add(rbox(w, 6, 1.6, board, { y: PIPE.shelfY - 6, z: zw + 0.8 }, 0.4))
    // 枕棚板
    g.add(rbox(w, PIPE.shelfT, PIPE.shelfD, board, { y: PIPE.shelfY, z: zw + PIPE.shelfD / 2 }, 0.5))
    // 两端：贴侧墙的通长棚受け桟（托住枕棚、装挂杆座）
    for (const sx of [-1, 1]) {
      g.add(rbox(1.6, PIPE.shelfY - PIPE.mount, PIPE.d, board, { x: sx * (w / 2 - 0.8), y: PIPE.mount }, 0.4))
      const seat = cyl(2.4, 2.4, 1.4, metal, {}, 12)
      seat.position.set(sx * (w / 2 - 2.5), PIPE.pipeY, 0)
      seat.rotation.z = Math.PI / 2
      g.add(seat)
    }
    const pipe = cyl(PIPE.pipeR, PIPE.pipeR, w - 4, metal, {}, 14)
    pipe.position.set(0, PIPE.pipeY, 0)
    pipe.rotation.z = Math.PI / 2
    g.add(pipe)
    // 中间吊撑（长杆）
    if (w > 120) g.add(rbox(1.2, PIPE.shelfY - PIPE.pipeY + 1, 1.2, metal, { y: PIPE.pipeY - 1, z: 0 }, 0.3))
    return g
  }
}
const PIPE_PAL: Pal[] = [
  ['nordic', [N.white, M.silver]],
  ['nordic', [N.oak, M.silver]],
  ['modern', [M.white, M.black]],
  ['japanese', [J.hinoki, J.dark]],
  ['industrial', [I.walnut, I.iron]],
]
export const PIPE_WIDTHS = [60, 90, 120, 150, 180, 240]
const PIPES: AssetDef[] = PIPE_WIDTHS.map((w) =>
  define(`gm-closet-pipe-${w}`, '衣柜挂杆（枕棚）', 'storage', [w, PIPE.d, PIPE.shelfY + PIPE.shelfT - PIPE.mount], PIPE_PAL, closetPipe(w), {
    sizeLabel: `${w}`,
    mount: PIPE.mount,
    surface: PIPE.shelfY + PIPE.shelfT,
    surfaceShape: [rectPoly(-w / 2 + 2, -PIPE.d / 2 + 1, w / 2 - 2, -PIPE.d / 2 + PIPE.shelfD - 1)],
    surfaces: [{ y: PIPE.pipeY + PIPE.pipeR + 0.45, kind: 'hook', h: PIPE.pipeY - 2, shape: [rectPoly(-w / 2 + 4, -1.7, w / 2 - 4, 1.3)] }],
  }),
)

export const GARMENTS_PACK: AssetDef[] = [...CLOTHES, ...TOWELS, ...TOWEL_STACKS, ...HANGER_DEFS, ...ROWS, ...PIPES]
