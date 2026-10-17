// 浴室补充素材包（id 前缀 bx-）：淋浴、浴缸盖（盖着 / 折叠收起）、浴室门口地垫、毛巾挂钩 / 毛巾环 / 浴室毛巾杆、挂起的面巾。
//
// 约定补充：
//   - 淋浴（showerModel）和浴帘（showerCurtainModel）的模型在 ../shower.ts（house.ts 也用它按浴缸位置自动装到墙上）；
//     素材版 bx-shower-set 是同一个模型，供手动摆放。
//   - 浴缸盖（盖着）按浴缸外尺寸分规格：浴缸是 tray 壁厚 7、边沿高 55；盖子比浴缸外沿小 0～12，四角都压在边沿上。
//   - 挂钩类的 hook 层：y = 挂点顶 + 0.5，挂点带在 z > 0（朝外），挂起的毛巾原点 = 挂点，搭在杆 / 钩上往下垂。

import * as THREE from 'three'
import { ball, cyl, rbox, shade, torus } from '../toon'
import { C, G, rectPoly, type AssetCategory, type AssetDef } from '../kit'
import { PI, cylXLegacy, cylZLegacy } from '../geo'
import { I, J, M, N, R, define, type Build, type Dims, type Pal } from '../packkit'
import { SHOWER_PALS, showerModel } from '../shower'

const prop = (id: string, name: string, category: AssetCategory, dims: Dims, pals: Pal[], build: Build, extra: Partial<AssetDef> = {}) =>
  define(id, name, category, dims, pals, build, { prop: true, ...extra })

// ---------- 小工具 ----------

/** 落地居中 */
function ground<T extends THREE.Object3D>(o: T): T {
  o.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(o, true)
  o.position.x -= (b.min.x + b.max.x) / 2
  o.position.y -= b.min.y
  o.position.z -= (b.min.z + b.max.z) / 2
  return o
}

// =====================================================================
// 浴缸盖
// =====================================================================

const LID_PALS: Pal[] = [
  ['modern', [M.white, M.gray]],
  ['cute', [C.sky, C.white]],
  ['nordic', [N.white, N.oak]],
  ['japanese', [J.hinoki, J.dark]],
  ['retro', [R.cream, R.teal]],
]

/** 巻きふた（盖着）：一排横跨浴缸短边的细板条，板条之间有浅缝 */
function lidRollCover(w: number, d: number): Build {
  return (p) => {
    const [main, edge] = p
    const g = new THREE.Group()
    const n = Math.round(w / 3.2)
    const sw = w / n
    for (let i = 0; i < n; i++) g.add(rbox(sw - 0.35, 1.4, d, i % 2 ? shade(main, -0.04) : main, { x: -w / 2 + sw * (i + 0.5) }, 0.55))
    // 两端收边条
    for (const s of [-1, 1]) g.add(rbox(1.6, 1.8, d, edge, { x: s * (w / 2 - 0.8) }, 0.5))
    return g
  }
}

/** 組ふた（盖着）：三块板，每块带指扣凹槽 */
function lidPanelCover(w: number, d: number): Build {
  return (p) => {
    const [main, edge] = p
    const g = new THREE.Group()
    const k = 3
    const pw = w / k
    for (let i = 0; i < k; i++) {
      const x = -w / 2 + pw * (i + 0.5)
      g.add(rbox(pw - 0.5, 2.2, d, main, { x }, 0.8))
      g.add(rbox(pw - 3, 0.4, d - 3, shade(main, 0.03), { x, y: 2.05 }, 0.3))
      // 指扣：一端靠前的长圆凹槽（深色贴片）
      g.add(rbox(8, 0.4, 2.4, edge, { x, y: 2.15, z: d / 2 - 6 }, 0.2))
    }
    return g
  }
}

/** 折りたたみ式（收起）：一串铰接的长板折成 Z 字，立着 */
function lidZigzag(p: string[]) {
  const [main, hinge] = p
  const g = new THREE.Group()
  const n = 8
  for (let i = 0; i < n; i++) {
    const z = -6 + i * 1.7
    const m = rbox(72, 22, 1.3, i % 2 ? shade(main, -0.05) : main, { y: 0.3, z }, 0.5)
    m.rotation.x = i % 2 ? 0.05 : -0.05
    g.add(m)
    // 铰链：上下交替
    g.add(rbox(70, 0.8, 1.6, hinge, { y: i % 2 ? 0 : 21.6, z: z + 0.85 }, 0.3))
  }
  return ground(g)
}

/** 巻きふた（卷起，小号 60）：横放的一卷 + 两道束带，给进深 61～74 的浅浴缸横搭在一端 */
function lidRolledSmall(p: string[]) {
  const [main, strap] = p
  const g = new THREE.Group()
  const cy = 8.6
  g.add(cylXLegacy(8.2, 59, main, 0, cy, 0, 28))
  for (const s of [-1, 1]) {
    g.add(cylXLegacy(6.8, 0.6, shade(main, -0.1), s * 29.6, cy, 0, 24))
    g.add(cylXLegacy(3.8, 0.6, shade(main, -0.18), s * 29.8, cy, 0, 20))
    g.add(torus(8.2, 0.42, strap, { x: s * 19, y: cy, ry: PI / 2 }))
  }
  return g
}

const LID_W = [110, 120, 130, 140, 150, 160, 170, 180]
const LID_D = [60, 70]
/** 浴缸外尺寸 w × d 能用的盖子规格（盖子不大于浴缸，至多小 12）；没有合适的返回 null */
export function lidSizeFor(w: number, d: number) {
  const lw = [...LID_W].reverse().find((x) => x <= w && x >= w - 12)
  const ld = [...LID_D].reverse().find((x) => x <= d && x >= d - 12)
  return lw && ld ? { w: lw, d: ld } : null
}

const LIDS: AssetDef[] = LID_W.flatMap((w) =>
  LID_D.flatMap((d) => [
    prop(`bx-lid-roll-${w}x${d}`, '浴缸盖（卷帘・盖着）', 'toiletry', [w, d, 1.8], LID_PALS, lidRollCover(w, d), { family: 'bx-lid-roll', sizeLabel: `${w}×${d}`, form: 'closed' }),
    prop(`bx-lid-panel-${w}x${d}`, '浴缸盖（组合板・盖着）', 'toiletry', [w - 0.5, d, 2.6], LID_PALS, lidPanelCover(w, d), { family: 'bx-lid-panel', sizeLabel: `${w}×${d}`, form: 'closed' }),
  ]),
)

// =====================================================================
// 浴室门口地垫
// =====================================================================

/** 珪藻土：两块拼成、可对折（中缝 + 防滑垫脚） */
function matDiatomFold(p: string[]) {
  const [main, edge, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(29.8, 1.0, 40, main, { x: s * 15.1, y: 0.3 }, 0.35))
  g.add(rbox(1.4, 0.4, 38, edge, { y: 0.1 }, 0.15))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.4, 1.4, 0.3, shade(edge, -0.1), { x: sx * 26, z: sz * 16 }, 10))
  g.add(rbox(6, 0.3, 1.6, acc, { x: 22, y: 1.25, z: 17 }, 0.1))
  return g
}

/** 珪藻土：小号，表面一格格的浅圆点（防滑） */
function matDiatomDots(p: string[]) {
  const [main, dot] = p
  const g = G(rbox(45, 0.9, 35, main, {}, 0.4))
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 5; j++) {
      const b = ball(1.4, dot, { x: -18 + i * 6, y: 0.9, z: -12 + j * 6 }, [1, 0.25, 1])
      b.userData.noOutline = true
      g.add(b)
    }
  return g
}

/** 雪尼尔（毛毛虫）地垫：一粒粒的绒条 */
function matChenille(p: string[]) {
  const [main, edge] = p
  const g = G(rbox(60, 0.8, 42, edge, {}, 0.35))
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 6; j++) {
      const b = ball(3.2, (i + j) % 3 ? main : shade(main, -0.05), { x: -25.6 + i * 6.4, y: 1.4, z: -16 + j * 6.4 }, [1, 0.42, 1])
      g.add(b)
    }
  return g
}

/** 毛巾地垫：薄棉垫 + 两端织带 + 一道字母条 */
function matTowel(p: string[]) {
  const [main, band, acc] = p
  const g = G(rbox(65, 0.7, 45, main, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(4, 0.35, 44, band, { x: s * 28, y: 0.6 }, 0.12))
  g.add(rbox(18, 0.25, 3, acc, { x: 0, y: 0.62, z: 15 }, 0.1))
  return g
}

/** 桧木すのこ：五根板条 + 下面两根垫木 */
function matSlat(p: string[]) {
  const [main, under] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(4, 1.6, 38, under, { x: s * 20 }, 0.4))
  for (let i = 0; i < 5; i++) g.add(rbox(60, 1.4, 6.6, main, { y: 1.6, z: -16 + i * 8 }, 0.5))
  return g
}

const DIATOM_PALS: Pal[] = [
  ['modern', [M.light, M.gray, M.char]],
  ['nordic', [N.linen, N.oak, N.sage]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['japanese', ['#d8d2c4', J.wood, J.ai]],
]
const MATS: AssetDef[] = [
  prop('bx-mat-diatom-fold', '浴室地垫', 'toiletry', [60.2, 40, 1.6], DIATOM_PALS, matDiatomFold, { family: 'bath-mat', sizeLabel: '硅藻土・对折' }),
  prop('bx-mat-diatom-dots', '浴室地垫', 'toiletry', [45, 35, 1.3], [
    ['modern', ['#e9e7e2', M.gray]],
    ['nordic', [N.white, N.blue]],
    ['cute', [C.white, C.mint]],
    ['japanese', [J.washi, J.tatami]],
  ], matDiatomDots, { family: 'bath-mat', sizeLabel: '硅藻土・小号' }),
  prop('bx-mat-chenille', '浴室地垫', 'toiletry', [60, 42, 2.75], [
    ['cute', [C.pink, C.white]],
    ['nordic', [N.sage, N.white]],
    ['modern', [M.gray, M.char]],
    ['retro', [R.mustard, R.caramel]],
    ['cute', [C.sky, C.white]],
  ], matChenille, { family: 'bath-mat', sizeLabel: '雪尼尔' }),
  prop('bx-mat-towel', '浴室地垫', 'toiletry', [65, 45, 1], [
    ['nordic', [N.white, N.blue, N.gray]],
    ['modern', [M.light, M.char, M.white]],
    ['japanese', [J.washi, J.ai, J.shu]],
    ['retro', [R.cream, R.orange, R.teal]],
  ], matTowel, { family: 'bath-mat', sizeLabel: '毛巾' }),
  prop('bx-mat-slat', '浴室地垫', 'toiletry', [60, 38.6, 3], [
    ['japanese', [J.hinoki, J.wood]],
    ['nordic', [N.oakL, N.oak]],
    ['industrial', [I.walnut, I.iron]],
  ], matSlat, { family: 'bath-mat', sizeLabel: '桧木踏板' }),
]

// =====================================================================
// 毛巾挂钩 / 毛巾环 / 浴室毛巾杆（壁挂）+ 挂起的面巾
// =====================================================================

const HOOK_PALS: Pal[] = [
  ['modern', [M.silver, M.white]],
  ['modern', [M.black, M.char]],
  ['nordic', [N.oak, N.white]],
  ['japanese', [J.wood, J.sumi]],
  ['cute', [C.white, C.pink]],
]

/** 单个挂钩：圆底座 + 往外伸的横臂 + 上翘的钩尖；毛巾搭在横臂上（钩尖内侧 1.2） */
const HK = { mount: 160, d: 8.1, tip: 3.05 }
function hookAt(g: THREE.Group, x: number, y: number, main: string, base: string) {
  const zb = -HK.d / 2
  g.add(cylZLegacy(2.2, 1.2, base, x, y, zb + 0.6, 18))
  g.add(cylZLegacy(0.75, HK.tip - (zb + 1.2), main, x, y, (HK.tip + zb + 1.2) / 2, 10))
  g.add(ball(0.75, main, { x, y, z: HK.tip }))
  g.add(cyl(0.75, 0.75, 2.4, main, { x, y, z: HK.tip }, 10))
  g.add(ball(1.0, main, { x, y: y + 2.4, z: HK.tip }))
}
function towelHook(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  hookAt(g, 0, HK.mount + 2.2, main, base)
  return g
}
/** 三连挂钩：横板 + 三个钩 */
function towelHook3(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  g.add(rbox(32, 5.6, 1.4, base, { y: HK.mount - 0.6, z: -HK.d / 2 + 0.7 }, 0.5))
  for (const x of [-11, 0, 11]) hookAt(g, x, HK.mount + 2.2, main, base)
  return g
}
/** 毛巾环：墙座 + 短臂 + 吊环 */
const TR = { mount: 104, d: 5.6, r: 8, z: 1.7 }
function towelRing(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  // 臂端小铰正好压在环顶上（以前环和小铰之间空着 1.8cm，环悬空）
  const top = TR.mount + TR.r * 2 + 2.2
  g.add(cylZLegacy(2.4, 1.2, base, 0, top, -TR.d / 2 + 0.6, 18))
  g.add(cylZLegacy(0.8, TR.z - (-TR.d / 2 + 1.2), main, 0, top, (TR.z - TR.d / 2 + 1.2) / 2, 10))
  // 吊环挂在臂端的小铰上，环面平行于墙
  g.add(ball(1.1, main, { y: top, z: TR.z }))
  g.add(torus(TR.r, 0.55, main, { y: TR.mount + 0.55 + TR.r, z: TR.z }))
  return g
}
/** 浴室毛巾杆（短，不锈钢）：杆心离墙 4.4 */
const TBB = { mount: 108, w: 45, barZ: 1.85, d: 5.5 }
function towelBarBath(p: string[]) {
  const [main, base] = p
  const g = new THREE.Group()
  const y = TBB.mount + 2.4
  for (const s of [-1, 1]) {
    const x = s * (TBB.w / 2 - 2.4)
    g.add(cylZLegacy(2.4, 1, base, x, y, -TBB.d / 2 + 0.5, 16))
    g.add(cylZLegacy(0.9, TBB.barZ + TBB.d / 2 - 1, main, x, y, (-TBB.d / 2 + 1 + TBB.barZ) / 2, 10))
  }
  g.add(cylXLegacy(0.9, TBB.w - 4.8, main, 0, y, TBB.barZ, 12))
  return g
}

/** 面巾：叠好 / 搭在挂钩、杆上（原点 = 挂点，往下垂） */
const FT = { w: 34, drop: 40 }
function faceTowelFolded(p: string[]) {
  const [main, border] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) g.add(rbox(34, 1.6, 21, i === 1 ? shade(main, -0.04) : main, { y: i * 1.6 }, 0.7))
  g.add(rbox(34.4, 0.6, 21.4, border, { y: 2.3 }, 0.25))
  return g
}
function faceTowelHanging(p: string[]) {
  const [main, border] = p
  const g = new THREE.Group()
  // 搭在杆 / 钩上：顶上一道横向的弯折压在杆顶（y = -0.5），前后两片往下垂（前片长一点）；挂点中心在 z = 1.85
  const zc = 1.85
  g.add(rbox(FT.w, 1.0, 5.8, main, { y: -0.5, z: zc }, 0.5))
  g.add(rbox(FT.w, FT.drop, 1.0, main, { y: 0.2 - FT.drop, z: zc + 2.4 }, 0.45))
  g.add(rbox(FT.w, FT.drop - 8, 1.0, shade(main, -0.05), { y: 0.2 - FT.drop + 8, z: zc - 2.4 }, 0.45))
  g.add(rbox(FT.w + 0.4, 2, 1.4, border, { y: 0.2 - FT.drop + 3, z: zc + 2.4 }, 0.3))
  return g
}

const TOWEL_PALS: Pal[] = [
  ['cute', [C.sakura, C.white]],
  ['nordic', [N.white, N.blue]],
  ['modern', [M.gray, M.char]],
  ['japanese', [J.washi, J.ai]],
  ['retro', [R.mustard, R.teal]],
]

/** 挂钩层：rest = 毛巾搭的位置（局部 z）。snapToHook 把挂起物原点放在挂点带的内沿，挂起物的搭点在原点前 1.85，所以带的中心取 rest - 0.35 */
const hookLevel = (x0: number, x1: number, rest: number, y: number) => ({ y, kind: 'hook' as const, shape: [rectPoly(x0, rest - 0.35 - 1.5, x1, rest - 0.35 + 1.5)] })

const HOOKS: AssetDef[] = [
  define('bx-towel-hook', '毛巾挂钩', 'toiletry', [4.4, HK.d, 5.6], HOOK_PALS, towelHook, {
    family: 'bx-towel-hook',
    sizeLabel: '单钩',
    mount: HK.mount,
    surfaces: [hookLevel(-1.2, 1.2, HK.tip - 1.2, HK.mount + 2.2 + 0.75 + 0.5)],
  }),
  define('bx-towel-hook-3', '毛巾挂钩', 'toiletry', [32, HK.d, 6], HOOK_PALS, towelHook3, {
    family: 'bx-towel-hook',
    sizeLabel: '三连',
    mount: HK.mount - 0.6,
    surfaces: [-11, 0, 11].map((x) => hookLevel(x - 1.2, x + 1.2, HK.tip - 1.2, HK.mount + 2.2 + 0.75 + 0.5)),
  }),
  define('bx-towel-ring', '毛巾环', 'toiletry', [TR.r * 2 + 1.1, TR.d, TR.r * 2 + 6.5], HOOK_PALS, towelRing, {
    mount: TR.mount,
    // 挂点：环底内侧（面巾从环里穿过搭着）
    surfaces: [hookLevel(-4, 4, TR.z, TR.mount + 1.1 + 0.5)],
  }),
  define('bx-towel-bar-bath', '浴室毛巾杆', 'toiletry', [TBB.w, TBB.d, 4.8], HOOK_PALS, towelBarBath, {
    mount: TBB.mount,
    surfaces: [hookLevel(-TBB.w / 2 + 5, TBB.w / 2 - 5, TBB.barZ, TBB.mount + 2.4 + 0.9 + 0.5)],
  }),
  prop('bx-face-towel-folded', '面巾', 'toiletry', [34.4, 21.4, 4.6], TOWEL_PALS, faceTowelFolded, { family: 'bx-face-towel', form: 'folded' }),
  prop('bx-face-towel-hanging', '面巾', 'toiletry', [34.4, 6, 40.3], TOWEL_PALS, faceTowelHanging, { family: 'bx-face-towel', form: 'hanging' }),
]

// =====================================================================
// 其他：折叠式浴缸盖、淋浴组（手动摆放版）
// =====================================================================

const SHOWER_SET_D = 16.3
const OTHER: AssetDef[] = [
  prop('bx-lid-zigzag', '浴缸盖（折叠式・收起）', 'toiletry', [72, 14.7, 22.4], LID_PALS, lidZigzag, { form: 'folded' }),
  prop('bx-lid-rolled-60', '浴缸盖（卷帘・卷起）', 'toiletry', [60, 17.2, 17.2], LID_PALS, lidRolledSmall, { form: 'lying' }),
  define('bx-shower-set', '淋浴组（水栓・滑杆・镜子）', 'toiletry', [64, SHOWER_SET_D, 147.1], SHOWER_PALS, (p) => {
    const g = showerModel({ mode: 'side', full: true }, p)
    g.position.set(-32, 0, -SHOWER_SET_D / 2)
    return G(g)
  }, {
    mount: 43.3,
    surfaces: [{ y: 60.4, shape: [rectPoly(-30, -SHOWER_SET_D / 2 + 1, 30, -SHOWER_SET_D / 2 + 13)], h: 16 }],
  }),
]

export const BATH_EXTRA: AssetDef[] = [...LIDS, ...MATS, ...HOOKS, ...OTHER]
