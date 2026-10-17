// 冰箱位 / 洗衣机位 和摆在上面的冰箱、洗衣机家具之间的关系：
//   - 设备 'fridge' / 'washer' 只是预留空间（冰箱位、洗衣机位），机器本身是素材库里的家具（packs/appliances-pack.ts）；
//   - 一键布置、检查清单、冰箱贴、洗衣液、洗衣机上方置物架都通过这里找「某个位上放着的那台机器」；
//   - 旧存档里带款式 / 颜色的冰箱、洗衣机设备，读档时换成同款同色的家具（migrateAppliances）。

import { fixtureDepth, uid, type Fixture, type Furniture, type Plan } from './model'
import { ASSET_MAP, type AssetDef } from './three/assets'
import { APPLIANCE_PALETTES } from './three/packs/appliances-pack'
import type { Tag } from './three/tags'

export type SpotKind = 'fridge' | 'washer'

/** 各种位上算作「那台机器」的细分类型：洗衣机位上放洗衣机、干衣机（叠放 / 并排）都算 */
export const SPOT_TYPES: Record<SpotKind, Tag[]> = { fridge: ['fridge'], washer: ['washer', 'dryer'] }

/** 这件家具是不是冰箱（kind = 'fridge'）/ 洗衣机（kind = 'washer'，含干衣机） */
export function isApplianceOf(f: Pick<Furniture, 'asset'>, kind: SpotKind) {
  const type = ASSET_MAP.get(f.asset)?.type
  return !!type && SPOT_TYPES[kind].includes(type)
}

/** 冰箱 / 洗衣机本身（不含干衣机）：检查清单「全屋有一台」用 */
export function isMainAppliance(def: AssetDef | undefined, kind: SpotKind) {
  return def?.type === kind
}

/** 局部坐标（沿位的宽度 lx、离墙方向 lz）→ 平面坐标 */
function toWorld(f: Pick<Fixture, 'x' | 'y' | 'rot'>, lx: number, lz: number) {
  const a = (f.rot * Math.PI) / 180
  return { x: f.x + lx * Math.cos(a) - lz * Math.sin(a), y: f.y + lx * Math.sin(a) + lz * Math.cos(a) }
}

/**
 * 把一件机器摆到位上的位姿：背面贴着位的背面（墙），沿宽度方向偏 lx。
 * 机器比位深（法式冰箱 70 深放进 65 的冰箱位）就往前凸出，和现实一样。
 */
export function poseOnSpot(fx: Fixture, asset: string, lx = 0) {
  const def = ASSET_MAP.get(asset)
  const d = def?.d ?? fixtureDepth(fx)
  const p = toWorld(fx, lx, -fixtureDepth(fx) / 2 + d / 2)
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: fx.rot }
}

/** 某个位上放着的机器（落地、中心落在位的范围内，四周放宽 15cm）；按离位中心的距离排序 */
export function appliancesOn(furniture: Furniture[], fx: Fixture): Furniture[] {
  if (fx.kind !== 'fridge' && fx.kind !== 'washer') return []
  const kind: SpotKind = fx.kind
  const a = (fx.rot * Math.PI) / 180
  const half = { w: fx.w / 2 + 15, d: fixtureDepth(fx) / 2 + 15 }
  const local = (f: Furniture) => {
    const dx = f.x - fx.x
    const dy = f.y - fx.y
    return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) }
  }
  return furniture
    .filter((f) => !f.z && isApplianceOf(f, kind))
    .filter((f) => {
      const l = local(f)
      return Math.abs(l.x) <= half.w && Math.abs(l.y) <= half.d
    })
    .sort((p, q) => Math.hypot(p.x - fx.x, p.y - fx.y) - Math.hypot(q.x - fx.x, q.y - fx.y))
}

/** 全屋的冰箱 / 洗衣机家具（不管在不在位上） */
export function appliancesIn(plan: Pick<Plan, 'furniture'>, kind: SpotKind) {
  return plan.furniture.filter((f) => !f.z && isApplianceOf(f, kind))
}

// ---------- 旧存档迁移 ----------

const LEGACY_FRIDGE: Record<string, string> = {
  '2door': 'ap2-fridge-2door',
  '3door': 'ap2-fridge-3door',
  french: 'ap2-fridge-french',
  side: 'ap2-fridge-side',
  retro: 'ap2-fridge-retro',
}
const LEGACY_WASHER: Record<string, string> = {
  drum: 'ap2-washer-drum',
  top: 'ap2-washer-top',
  compact: 'ap2-washer-compact',
  stack: 'ap2-washer-stack',
  twin: 'ap2-washer-twin',
}
/** 旧设备不填颜色时的默认机身色（以前 appliances.ts 里的 FRIDGE_DEFAULT_COLOR / WASHER_DEFAULT_COLOR） */
const LEGACY_DEFAULT_COLOR = { fridge: '#a6e3cc', washer: '#fbf7f1' }

/** 机身色 → 家具配色：和某组预设完全一致就用那组，否则用自定义颜色槽保留原色 */
export function applianceColor(hex: string): Pick<Furniture, 'color' | 'colors'> {
  const i = APPLIANCE_PALETTES.findIndex(([, c]) => c.toLowerCase() === hex.toLowerCase())
  return i >= 0 ? { color: i } : { color: 0, colors: [hex] }
}

/** 一台旧的冰箱 / 洗衣机设备对应的家具（款式、颜色、位置照旧） */
export function legacyAppliances(fx: Fixture): Furniture[] {
  if (fx.kind !== 'fridge' && fx.kind !== 'washer') return []
  const color = applianceColor(fx.color ?? LEGACY_DEFAULT_COLOR[fx.kind])
  const make = (asset: string, lx = 0): Furniture => ({ id: uid('u'), asset, ...poseOnSpot(fx, asset, lx), ...color })
  if (fx.kind === 'fridge') return [make(LEGACY_FRIDGE[fx.style ?? '3door'] ?? LEGACY_FRIDGE['3door'])]
  if (fx.style === 'pair') {
    // 洗衣机 + 烘干机并排：位够宽用欧美大容量的两台，否则用 60 宽的滚筒两台
    const us = fx.w >= 2 * (ASSET_MAP.get('ap2-washer-us')?.w ?? 68) + 2
    const [washer, dryer] = us ? ['ap2-washer-us', 'ap2-dryer-us'] : ['ap2-washer-drum', 'ap2-dryer']
    const half = (ASSET_MAP.get(washer)?.w ?? 60) / 2 + 1
    return [make(washer, -half), make(dryer, half)]
  }
  return [make(LEGACY_WASHER[fx.style ?? 'drum'] ?? LEGACY_WASHER.drum)]
}

/**
 * 旧存档迁移：带 style / color 的冰箱、洗衣机设备 → 在同一位置生成同款同色的家具，设备上的 style / color 删掉。
 * 位上已经放着对应家具的（比如迁移过又被旧版本写回了字段）不重复生成。返回生成了几件。
 */
export function migrateAppliances(plan: Plan): number {
  let n = 0
  // 旧存档（没有 appliancesAsFurniture 标记）里，没写款式颜色的设备以前也会画出默认款：同样补上
  const legacy = !plan.appliancesAsFurniture
  for (const fx of plan.fixtures) {
    if (fx.kind !== 'fridge' && fx.kind !== 'washer') continue
    if (!legacy && fx.style === undefined && fx.color === undefined) continue
    if (!appliancesOn(plan.furniture, fx).length) {
      const add = legacyAppliances(fx)
      plan.furniture.push(...add)
      n += add.length
    }
    delete fx.style
    delete fx.color
  }
  plan.appliancesAsFurniture = true
  return n
}
