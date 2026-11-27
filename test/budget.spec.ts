// 模型面数预算：全量构建所有素材（和沙盘一样走 furnitureModel：合并、描边、冻结），按尺寸分档限制三角面和合并后的网格数。
// 超限的素材放进下面的显式白名单并注明原因。白名单只能缩小：
//   - 新增素材超限 → 失败（要么减面，要么有充分理由时加进白名单）；
//   - 白名单里的素材超过登记的上限 → 失败（上限不许调高）；
//   - 白名单里的素材已经回到档位以内 → 失败（提示把这一条删掉）。
// 只做结构性断言，不测帧时间。末尾打印全库三角面 / 网格数的统计，便于优化前后对比。
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { furnitureModel, setFurnitureTemplateLimit } from '/src/three/house'

// 关掉家具模板缓存：每次都真的重建，统计和「跨模型复用的几何必须标共享」的检查才有意义
setFurnitureTemplateLimit(0)

/** 按最大边（cm）分档：小件 / 中件 / 大件（体素按尺寸自适应细分后收紧到这一档） */
const TIERS = [
  { name: '小件', max: 30, tris: 15_000, meshes: 40 },
  { name: '中件', max: 100, tris: 30_000, meshes: 80 },
  { name: '大件', max: Infinity, tris: 50_000, meshes: 120 },
] as const

/** 已知超限的素材：登记的是允许的上限（只许调低或删除，不许调高、不许新增） */
const ALLOW: Record<string, { tris: number; meshes: number; why: string }> = {
  'lm-ball-pit': { tris: 50000, meshes: 80, why: '海洋球池：上百个球' },
  'mk-drawers-floor': { tris: 62000, meshes: 242, why: '几十个独立抽屉（可开合子树各自合并），每个抽屉由圆角盒、把手拼成' },
  'rb-drone-fpv': { tris: 15000, meshes: 46, why: '电子模型：大量引脚、元件、按键等小零件' },
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
