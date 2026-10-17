// 模型面数预算：全量构建所有素材（和沙盘一样走 furnitureModel：合并、描边、冻结），按尺寸分档限制三角面和合并后的网格数。
// 超限的素材放进下面的显式白名单并注明原因。白名单只能缩小：
//   - 新增素材超限 → 失败（要么减面，要么有充分理由时加进白名单）；
//   - 白名单里的素材超过登记的上限 → 失败（上限不许调高）；
//   - 白名单里的素材已经回到档位以内 → 失败（提示把这一条删掉）。
// 只做结构性断言，不测帧时间。末尾打印全库三角面 / 网格数的统计，便于优化前后对比。
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { furnitureModel } from '/src/three/house'

/** 按最大边（cm）分档：小件 / 中件 / 大件 */
const TIERS = [
  { name: '小件', max: 30, tris: 40_000, meshes: 40 },
  { name: '中件', max: 100, tris: 80_000, meshes: 80 },
  { name: '大件', max: Infinity, tris: 120_000, meshes: 120 },
] as const

/** 已知超限的素材：登记的是允许的上限（只许调低或删除，不许调高、不许新增） */
const ALLOW: Record<string, { tris: number; meshes: number; why: string }> = {
  'bc-fan-brass-3': { tris: 98000, meshes: 80, why: '扇叶、灯罩的细分曲面' },
  'be-chest-low-closed': { tris: 179000, meshes: 80, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'be-lingerie-38-closed': { tris: 193000, meshes: 120, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'be-lingerie-48-closed': { tris: 224000, meshes: 120, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'bg-paijiu-reveal': { tris: 120000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'bg-poker-guandan': { tris: 108000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'cl-herb-mint': { tris: 49000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'cl-herb-rosemary': { tris: 118000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'cl-sprout-box': { tris: 83000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'fm-apothecary': { tris: 264000, meshes: 195, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'fm-rattan-sofa': { tris: 152000, meshes: 120, why: '藤编：weave() 挤出的镂空孔洞板' },
  'gd-cactus-group': { tris: 65000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'gd-herb-mint': { tris: 61000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'gd-herb-rosemary': { tris: 127000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'gd-rose': { tris: 85000, meshes: 80, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'gd-strawberry': { tris: 52000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'gd-succulent-bowl': { tris: 81000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'hg-go-board-end': { tris: 90000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'int-mahjong-mat-shuffle': { tris: 83000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'int-mahjong-shuffle': { tris: 132000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'int-manga-stack-l': { tris: 48000, meshes: 40, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'int-xiangqi': { tris: 86000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'int-xiangqi-mid': { tris: 88000, meshes: 80, why: '大量棋子 / 牌 / 书册（每个都是圆角盒或圆柱）' },
  'lm-ball-pit': { tris: 101000, meshes: 80, why: '海洋球池：上百个球' },
  'lm-train-track': { tris: 104000, meshes: 80, why: '轨道枕木与铁轨：大量小圆角盒' },
  'mk-bluepill': { tris: 66000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-breadboard-full': { tris: 44000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-drawers-desk': { tris: 216000, meshes: 157, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'mk-drawers-floor': { tris: 334000, meshes: 242, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'mk-dupont-hanging': { tris: 47000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-dupont-lying': { tris: 97000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-led-strip': { tris: 46000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-parts-box': { tris: 51000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-raspi': { tris: 48000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'mk-robot-car': { tris: 55000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'of-tablet-kb': { tris: 43000, meshes: 40, why: '电子模型：大量引脚、元件、按键等小零件' },
  'pet-aquarium-120': { tris: 155000, meshes: 120, why: '水草、砂石、鱼等大量小零件' },
  'pet-aquarium-90': { tris: 135000, meshes: 120, why: '水草、砂石、鱼等大量小零件' },
  'prop-bug-zapper': { tris: 115000, meshes: 80, why: '电网格栅：几十根细圆柱' },
  'prop-bug-zapper-stand': { tris: 117000, meshes: 80, why: '电网格栅：几十根细圆柱' },
  'pz-cube-4': { tris: 48000, meshes: 40, why: '魔方每个小块都是圆角盒 + 贴纸' },
  'pz-cube-4-scr': { tris: 48000, meshes: 40, why: '魔方每个小块都是圆角盒 + 贴纸' },
  'pz-cube-5': { tris: 75000, meshes: 40, why: '魔方每个小块都是圆角盒 + 贴纸' },
  'pz-cube-shelf': { tris: 252000, meshes: 80, why: '魔方每个小块都是圆角盒 + 贴纸' },
  'rb-drone-fpv': { tris: 40000, meshes: 46, why: '电子模型：大量引脚、元件、按键等小零件' },
  'sb-shoe-hiking-f': { tris: 41000, meshes: 40, why: '鞋带孔、鞋底花纹等小零件' },
  'ss-hina-tiers': { tris: 94000, meshes: 80, why: '雏人形：多层台阶上几十个人偶小零件' },
  'sw-cn-jiazi': { tris: 147000, meshes: 120, why: '编织 / 网面：上百根细圆柱或圆环' },
  'va-vase-jar': { tris: 42000, meshes: 40, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
  'vb-plant-areca': { tris: 148000, meshes: 120, why: '大量叶片 / 花瓣 / 果实小球体（ball 默认 24×16 细分）' },
}

interface Stat {
  tris: number
  meshes: number
  /** 模型里用到的几何体（检查共享标记用） */
  geos: Set<THREE.BufferGeometry>
}
function measure(id: string): Stat {
  const g = furnitureModel({ id: 'budget', asset: id, x: 0, y: 0, rot: 0, color: 0 })
  let tris = 0
  let meshes = 0
  const geos = new Set<THREE.BufferGeometry>()
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) geos.add(m.geometry)
    // 描边外壳和本体共用几何，不重复计三角面
    if (!m.isMesh || o.userData.isOutline) return
    meshes++
    const geo = m.geometry
    const n = geo.index ? geo.index.count : geo.attributes.position.count
    tris += (n / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1)
  })
  return { tris: Math.round(tris), meshes, geos }
}
const tierOf = (id: string) => {
  const a = ASSET_MAP.get(id)!
  const s = Math.max(a.w, a.d, a.h)
  return TIERS.find((t) => s <= t.max)!
}

const stats = new Map<string, Stat>()
const statOf = (id: string) => {
  let s = stats.get(id)
  if (!s) stats.set(id, (s = measure(id)))
  return s
}

test('所有素材都在面数预算以内（或在白名单里且不超过登记的上限）', () => {
  const bad: string[] = []
  for (const a of ASSETS) {
    const s = statOf(a.id)
    const t = tierOf(a.id)
    const allow = ALLOW[a.id]
    const lim = allow ?? t
    if (s.tris > lim.tris) bad.push(`${a.id}（${t.name}）三角面 ${s.tris} > ${lim.tris}`)
    if (s.meshes > lim.meshes) bad.push(`${a.id}（${t.name}）网格 ${s.meshes} > ${lim.meshes}`)
  }
  let tris = 0
  let meshes = 0
  for (const s of stats.values()) {
    tris += s.tris
    meshes += s.meshes
  }
  const per = TIERS.map((t) => {
    const xs = ASSETS.filter((a) => tierOf(a.id) === t)
    return `${t.name} ${xs.length} 件 ${xs.reduce((n, a) => n + statOf(a.id).tris, 0)} 三角面`
  })
  console.log(`[budget] ${ASSETS.length} 件素材：三角面 ${tris}，合并后网格 ${meshes}；${per.join('，')}`)
  expect(bad).toEqual([])
})

test('白名单只能缩小：登记的素材必须存在且仍然超出档位', () => {
  const stale: string[] = []
  for (const [id, allow] of Object.entries(ALLOW)) {
    if (!ASSET_MAP.has(id)) {
      stale.push(`${id} 已不存在`)
      continue
    }
    if (!allow.why) stale.push(`${id} 没写原因`)
    const s = statOf(id)
    const t = tierOf(id)
    if (s.tris <= t.tris && s.meshes <= t.meshes) stale.push(`${id} 已回到${t.name}预算以内（${s.tris} 三角面 / ${s.meshes} 网格），请从白名单删掉`)
  }
  expect(stale).toEqual([])
})

test('跨模型复用的几何体都标了 userData.shared（否则移除一件家具时 disposeUnshared 会释放别的家具还在用的几何）', () => {
  // 每件素材再建一次：和第一次建出来的模型共用的几何体，只能来自模块级缓存，必须标记共享
  const bad = new Set<string>()
  for (const a of ASSETS) {
    const first = statOf(a.id).geos
    const again = measure(a.id).geos
    for (const g of again) if (first.has(g) && !g.userData.shared) bad.add(a.id)
  }
  expect([...bad]).toEqual([])
})
