// 会活动的角色素材包：猫、狗、兔子、扫地机器人（带充电座）、Kachaka（带专用架子和充电座）。id 统一用 act- 前缀。
// 布置模式下它们就是普通素材（宠物睡着、机器人停在座上）；切到预览后由 actors.ts 接管，在家里走动。
// 模型和骨架在 critters.ts，静态版只是把骨架摆成睡觉 / 待机的姿势。

import * as THREE from 'three'
import { G, rectPoly, type AssetDef, type ActorSpec, type StyleTag } from '../kit'
import { creatureStatic, kachakaDock, kachakaLevels, kachakaModel, markActorPart, vacuumModel, KACHAKA, type PoseName } from '../critters'
import { rbox, shade } from '../toon'

type Pal = [StyleTag, string[]]

function def(id: string, name: string, [w, d, h]: [number, number, number], pals: Pal[], build: (p: string[]) => THREE.Group, actor: ActorSpec, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category: 'pets',
    w,
    d,
    h,
    palettes: pals.map((x) => x[1]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    actor,
    ...extra,
  }
}

/**
 * 猫的花色：[主色, 副色（肚皮 / 吻部 / 白袜子）, 花纹 A, 花纹 B]。花纹画法按颜色关系推（见 critters.ts 的 coatOf）：
 * A = B = 主色 → 纯色；A ≠ B → 三花；A = B 且主色浅、花纹深 → 副色 = 主色时奶牛猫，否则重点色（暹罗）；其余 → 虎斑。
 */
const CAT_PALS: Pal[] = [
  ['cute', ['#f4a259', '#fff4e6', '#d9792b', '#d9792b']], // 橘猫
  ['cute', ['#fbf7f1', '#fbf7f1', '#e8954a', '#3a3536']], // 三花
  ['modern', ['#3a3536', '#3a3536', '#3a3536', '#3a3536']], // 黑猫
  ['nordic', ['#a7a7ad', '#f4f4f2', '#6f6f78', '#6f6f78']], // 灰虎斑
  ['cute', ['#fbf7f1', '#fbf7f1', '#3a3536', '#3a3536']], // 奶牛
  ['nordic', ['#f3e6d0', '#f7efe2', '#7a5a48', '#7a5a48']], // 暹罗色
]

/** 狗：[主色, 副色（柴犬的白色里毛 / 腊肠的棕色重点 / 贵宾的口吻）, 项圈色] */
const SHIBA_PALS: Pal[] = [
  ['japanese', ['#e9a35a', '#fff4e6', '#d65a3c']], // 赤柴
  ['japanese', ['#3e3a39', '#f1dcc0', '#3d5a80']], // 黑柴
  ['cute', ['#f6efe2', '#ffffff', '#ffb6c8']], // 白柴
]
const POODLE_PALS: Pal[] = [
  ['cute', ['#e8b38a', '#f3cfae', '#ff8f86']], // 杏色
  ['cute', ['#fbf7f1', '#ffffff', '#a8d4f4']], // 白
  ['modern', ['#3d3f44', '#55575d', '#ff8f86']], // 黑
  ['retro', ['#8a5a3c', '#a8683a', '#e0a526']], // 棕
]
const DACHS_PALS: Pal[] = [
  ['retro', ['#a8683a', '#d39a68', '#2f8f8a']], // 红色
  ['modern', ['#2f2a2a', '#b9784a', '#e0a526']], // 黑棕
  ['cute', ['#e9c49a', '#f6e2c6', '#ffb6c8']], // 奶油
]
/** 兔子：[主色, 副色（肚皮 / 口鼻 / 尾巴）, 花纹色（有就是荷兰兔 / 熊猫兔：后半身、耳朵、眼圈）] */
const RABBIT_PALS: Pal[] = [
  ['cute', ['#fbf7f1', '#ffffff']],
  ['nordic', ['#b9906a', '#f1e4d2']],
  ['modern', ['#8a8d93', '#e6e6e4']],
  ['cute', ['#fbf7f1', '#ffffff', '#5a4646', '#5a4646']], // 熊猫兔
]

/** 静态宠物：蜷睡姿势让身体偏向一侧，按包围盒在 xz 上居中（预览时角色从 actorPart 的世界位置出发，位置一致） */
const pet = (breed: string, pose: PoseName) => (p: string[]) => {
  const g = markActorPart(creatureStatic(breed, p, pose))
  const c = new THREE.Box3().setFromObject(g, true).getCenter(new THREE.Vector3())
  g.position.x -= c.x
  g.position.z -= c.z
  return G(g)
}

// ---------- 扫地机器人（带充电座） ----------

const VAC_PALS: Pal[] = [
  ['cute', ['#fbf7f1', '#a8d4f4', '#5a4646']],
  ['modern', ['#24252a', '#3d3f44', '#c3c7cc']],
  ['nordic', ['#f7f5f0', '#b9bfc4', '#d9b98c']],
]

/** 充电座贴墙（-z），机器人停在座前、背对着座子 */
function vacuumWithDock(p: string[]) {
  const [main, sub] = p
  const g = new THREE.Group()
  g.add(rbox(18, 10, 7, main, { z: -19.5 }, 2.5))
  g.add(rbox(14, 0.8, 9, shade(sub, -0.05), { z: -12 }, 0.3))
  g.add(rbox(4, 0.6, 0.4, '#7fe0a8', { y: 7, z: -15.9 }))
  const v = vacuumModel(p).root
  v.position.z = 4
  g.add(markActorPart(v))
  return g
}

// ---------- Kachaka ----------

const KC_PALS: Pal[] = [
  ['nordic', ['#f4f4f2', '#f7f5f0', '#d9b98c', '#9fb4c7']],
  ['modern', ['#f4f4f2', '#3d3f44', '#7a5a43', '#8a8d93']],
  ['cute', ['#f4f4f2', '#fbf7f1', '#f3dcbc', '#ffb6c8']],
  ['nordic', ['#f4f4f2', '#f7f5f0', '#f7f5f0', '#a9bfa3']],
]

/** 机器人中心（地面）在 z = KC_Z；充电座贴在它身后 */
const KC_Z = 2
function kachakaSet(tiers: 0 | 2 | 3) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const dock = kachakaDock(shade(p[0] ?? '#f4f4f2', -0.04))
    dock.position.z = KC_Z - KACHAKA.d / 2 - 0.15 - KACHAKA.dock.d / 2
    g.add(dock)
    const k = kachakaModel(p, tiers).root
    k.position.z = KC_Z
    g.add(markActorPart(k))
    return g
  }
}

function kachakaSurfaces(tiers: 2 | 3): Partial<AssetDef> {
  const lv = kachakaLevels(tiers)
  const shape = [rectPoly(-KACHAKA.shelfW / 2 + 1.2, KC_Z - KACHAKA.shelfD / 2 + 1.2, KACHAKA.shelfW / 2 - 1.2, KC_Z + KACHAKA.shelfD / 2 - 1.2)]
  return {
    surface: lv[lv.length - 1],
    surfaceShape: shape,
    surfaces: lv.slice(0, -1).map((y, i) => ({ y, shape, h: lv[i + 1] - y - 1.8 })),
  }
}

export const ACTOR_ASSETS: AssetDef[] = [
  def('act-cat', '猫（会走动）', [26, 34, 31], CAT_PALS, pet('cat', 'curl'), { kind: 'cat', role: 'body', breed: 'cat' }, { family: 'act-cat', sizeLabel: '短毛猫' }),
  def('act-cat-long', '猫（会走动）', [29, 39, 35], CAT_PALS, pet('cat-long', 'curl'), { kind: 'cat', role: 'body', breed: 'cat-long' }, { family: 'act-cat', sizeLabel: '长毛猫' }),
  def('act-kitten', '猫（会走动）', [18, 25, 24], CAT_PALS, pet('kitten', 'curl'), { kind: 'cat', role: 'body', breed: 'kitten' }, { family: 'act-cat', sizeLabel: '小猫' }),
  def('act-shiba', '狗（会走动）', [32, 47, 43], SHIBA_PALS, pet('shiba', 'curl'), { kind: 'dog', role: 'body', breed: 'shiba' }, { family: 'act-dog', sizeLabel: '柴犬' }),
  def('act-poodle', '狗（会走动）', [24, 33, 29], POODLE_PALS, pet('poodle', 'curl'), { kind: 'dog', role: 'body', breed: 'poodle' }, { family: 'act-dog', sizeLabel: '玩具贵宾' }),
  def('act-dachshund', '狗（会走动）', [29, 40, 26], DACHS_PALS, pet('dachshund', 'curl'), { kind: 'dog', role: 'body', breed: 'dachshund' }, { family: 'act-dog', sizeLabel: '腊肠犬' }),
  def('act-rabbit', '兔子（会走动）', [19, 34, 30], RABBIT_PALS, pet('rabbit', 'loaf'), { kind: 'rabbit', role: 'body', breed: 'rabbit' }, { family: 'act-rabbit', sizeLabel: '立耳兔' }),
  def('act-rabbit-lop', '兔子（会走动）', [21, 36, 22], RABBIT_PALS, pet('rabbit-lop', 'loaf'), { kind: 'rabbit', role: 'body', breed: 'rabbit-lop' }, { family: 'act-rabbit', sizeLabel: '垂耳兔' }),
  def('act-vacuum', '扫地机器人（会自动清扫）', [36, 46, 11], VAC_PALS, vacuumWithDock, { kind: 'vacuum', role: 'body' }, { category: 'appliance', limit: { scope: 'house', max: 1, group: 'vacuum' } }),
  def('act-kachaka', '家用搬运机器人 Kachaka', [34, 56, 13], KC_PALS, kachakaSet(0), { kind: 'kachaka', role: 'body' }, { category: 'appliance', family: 'act-kachaka', sizeLabel: '本体 + 充电座' }),
  def('act-kachaka-2', '家用搬运机器人 Kachaka', [34, 56, 44], KC_PALS, kachakaSet(2), { kind: 'kachaka', role: 'body' }, { category: 'appliance', family: 'act-kachaka', sizeLabel: '+ 2 段架子', ...kachakaSurfaces(2) }),
  def('act-kachaka-3', '家用搬运机器人 Kachaka', [34, 56, 72], KC_PALS, kachakaSet(3), { kind: 'kachaka', role: 'body' }, { category: 'appliance', family: 'act-kachaka', sizeLabel: '+ 3 段架子', ...kachakaSurfaces(3) }),
]
