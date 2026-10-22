// 柜子：收纳位和柜体家具的关系，以及「可开合」柜子的开 / 关。
//   - 设备 'builtin' 只是收纳位（鞋柜位 / 衣柜位 / 食品柜位，嵌墙的是墙里的壁龛），柜子本身是素材库里的家具（packs/cabinets.ts）；
//     一键布置、检查清单通过这里找「某个收纳位上放着的那件柜子」，旧存档的内置收纳读档时换成同类柜子（migrateCabinets）。
//   - 有柜门 / 抽屉的柜子（素材 openable）开关时只改家具的 open：id、位置不变，门里层板上的东西不动；
//     抽屉格（slide）里的东西跟着抽屉一起拉出 / 推回（setOpen）。

import { poseOnSpot } from './appliance'
import { fixtureDepth, pointInPolygon, uid, type BuiltinType, type Fixture, type Furniture, type Plan } from './model'
import { levels, propsOn, toLocal, toWorld } from './surface'
import { ASSET_MAP, type AssetDef } from './three/assets'
import { baseAssetId, resizedId } from './three/resize'
import type { Tag } from './three/tags'

/** 各种收纳位上算作「那件柜子」的细分类型 */
export const SPOT_CABINET_TYPES: Record<BuiltinType, Tag[]> = { shoe: ['shoe-storage'], closet: ['wardrobe'], pantry: ['pantry'] }

const spotType = (fx: Fixture): BuiltinType => fx.builtinType ?? 'shoe'

/** 这件素材能不能开合（有柜门 / 抽屉） */
export const isOpenable = (def: AssetDef | undefined) => !!def?.openable

/** 这件家具是不是能放在这种收纳位上的柜子 */
export function isCabinetFor(f: Pick<Furniture, 'asset'>, type: BuiltinType) {
  const def = ASSET_MAP.get(f.asset)
  return !!def?.type && !def.prop && SPOT_CABINET_TYPES[type].includes(def.type)
}

/** 柜子放得进收纳位：宽不超过位宽；深可以比位深出 8cm 以内（嵌墙的壁龛前面略凸出来，和现实一样） */
export function fitsSpot(def: AssetDef, fx: Fixture) {
  return def.w <= fx.w + 1 && def.d <= fixtureDepth(fx) + 8
}

/** 某个收纳位上放着的柜子（落地、中心落在位的范围内，四周放宽 15cm）；按离位中心的距离排序 */
export function cabinetsOn(furniture: Furniture[], fx: Fixture): Furniture[] {
  if (fx.kind !== 'builtin') return []
  const type = spotType(fx)
  const a = (fx.rot * Math.PI) / 180
  const half = { w: fx.w / 2 + 15, d: fixtureDepth(fx) / 2 + 15 }
  return furniture
    .filter((f) => !f.z && isCabinetFor(f, type))
    .filter((f) => {
      const dx = f.x - fx.x
      const dy = f.y - fx.y
      const lx = dx * Math.cos(a) + dy * Math.sin(a)
      const ly = -dx * Math.sin(a) + dy * Math.cos(a)
      return Math.abs(lx) <= half.w && Math.abs(ly) <= half.d
    })
    .sort((p, q) => Math.hypot(p.x - fx.x, p.y - fx.y) - Math.hypot(q.x - fx.x, q.y - fx.y))
}

/** 柜子摆到收纳位上的位姿：背面贴着位的背面，沿宽度居中 */
export const poseOnStorageSpot = (fx: Fixture, asset: string) => poseOnSpot(fx, asset, 0)

/** 这件家具是不是摆在某个收纳位上的柜子（嵌墙壁龛里的柜子伸进墙里，碰撞 / 出房间检查要放过它） */
export function spotOf(plan: Pick<Plan, 'fixtures' | 'furniture'>, f: Furniture): Fixture | null {
  return plan.fixtures.find((fx) => fx.kind === 'builtin' && cabinetsOn([f], fx).length > 0) ?? null
}

/** 收纳位朝着哪个房间开：中心在房间里，或者正面前方 5cm 在房间里（嵌墙壁龛的中心在墙后的隔壁） */
export function spotInRoom(fx: Fixture, pts: Plan['rooms'][number]['points']) {
  if (pointInPolygon(fx, pts)) return true
  const a = (fx.rot * Math.PI) / 180
  const k = fixtureDepth(fx) / 2 + 5
  return pointInPolygon({ x: fx.x - Math.sin(a) * k, y: fx.y + Math.cos(a) * k }, pts)
}

// ---------- 开 / 关 ----------

/**
 * 打开 / 关上一件可开合的柜子：只改 open（id、位置不变）。门里层板上的东西不动；
 * 抽屉格里的东西（连同摆在它们上面的）跟着抽屉拉出 / 推回。plan 里只用到 furniture。
 */
export function setOpen(plan: Pick<Plan, 'furniture'>, f: Furniture, open: boolean) {
  const def = ASSET_MAP.get(f.asset)
  if (!def?.openable || !!f.open === open) return
  const moved = new Set<string>()
  ;(def.surfaces ?? []).forEach((s, i) => {
    if (!s.slide && !s.slideX) return
    const k = open ? 1 : -1
    const { dx, dy } = slideOffset(f, k * (s.slideX ?? 0), k * (s.slide ?? 0))
    for (const o of drawerContents(plan, f, i)) {
      if (moved.has(o.id)) continue
      moved.add(o.id)
      o.x = Math.round((o.x + dx) * 10) / 10
      o.y = Math.round((o.y + dy) * 10) / 10
    }
  })
  if (open) f.open = true
  else delete f.open
}

/** 柜子局部坐标里挪 (lx, lz) 换成平面上挪多少 */
export function slideOffset(f: Furniture, lx: number, lz: number) {
  const o0 = toWorld(f, 0, 0)
  const o1 = toWorld(f, lx, lz)
  return { dx: o1.x - o0.x, dy: o1.y - o0.y }
}

/**
 * 柜子第 i 个可摆放层（def.surfaces 的下标）上的东西，连同摆在它们上面的；层的位置按柜子现在的 open 算。
 * 抽屉格（slide）里的东西跟着抽屉拉出 / 推回。
 */
export function drawerContents(plan: Pick<Plan, 'furniture'>, f: Furniture, i: number): Furniture[] {
  const def = ASSET_MAP.get(f.asset)
  if (!def?.surfaces?.[i]) return []
  const lv = levels(f.asset, !!f.open)[i + (def.surface ? 1 : 0)]
  const base = f.z ?? 0
  const on = plan.furniture.filter((o) => {
    if (o.id === f.id || Math.abs((o.z ?? 0) - (base + lv.y)) >= 0.5) return false
    const l = toLocal(f, o)
    return lv.polys.some((pl) => pointInPolygon(l, pl.map(([x, z]) => ({ x, y: z }))))
  })
  const seen = new Set<string>()
  return on.flatMap((x) => [x, ...propsOn(plan, x)]).filter((o) => !seen.has(o.id) && !!seen.add(o.id))
}

// ---------- 旧存档迁移 ----------

/** 以前画在收纳位上的柜子 → 层板 / 挂衣杆高度一致的柜体系列 */
const LEGACY_SERIES: Record<BuiltinType, string> = { shoe: 'cb-shoe-tall', closet: 'cb-closet-hinged', pantry: 'cb-pantry-glass' }
/** 以前的配色：[门色, 柜体色, 拉手] */
const LEGACY_COLORS: Record<BuiltinType, string[]> = {
  shoe: ['#f6e3c6', '#f3dcbc', '#d9dee6'],
  closet: ['#f6e3c6', '#f3dcbc', '#d9dee6'],
  pantry: ['#f4f1ea', '#fbf7f1', '#d9dee6'],
}

/**
 * 把一款柜子定制成正好填满收纳位（resize.ts 的派生 id）：宽 = 位宽；比位浅的加深到位深，本来就只比位深出 8 以内的（fitsSpot 允许的）
 * 保持原来的深度，更深的减到位深。调不了、夹到可调范围后放不进返回 undefined
 */
export function fitToSpot(def: AssetDef, fx: Fixture): AssetDef | undefined {
  const base = ASSET_MAP.get(baseAssetId(def.id)) ?? def
  const sd = fixtureDepth(fx)
  const fit = ASSET_MAP.get(resizedId(base, fx.w, base.d > sd && base.d <= sd + 8 ? base.d : sd))
  return fit && fitsSpot(fit, fx) ? fit : undefined
}

/**
 * 收纳位上放这批候选（同一系列 / 同类）里的哪件：优先拿宽度最接近位宽的一档定制成正好填满位（任意宽度的位都不留缝）；
 * 都调不了就取放得进的最宽一档；都放不进返回 undefined
 */
export function fitIn(fx: Fixture, cands: AssetDef[]): AssetDef | undefined {
  const near = [...cands].sort((a, b) => Math.abs(a.w - fx.w) - Math.abs(b.w - fx.w))
  for (const d of near) {
    const fit = fitToSpot(d, fx)
    if (fit) return fit
  }
  return cands.filter((d) => fitsSpot(d, fx)).sort((a, b) => b.w - a.w)[0]
}

/** 一个旧的内置收纳对应的柜子家具（同类、定制成填满位的尺寸，放不进就取最窄一档；旧配色，柜门开关照旧） */
export function legacyCabinet(fx: Fixture): Furniture | null {
  if (fx.kind !== 'builtin') return null
  const type = spotType(fx)
  const series = [...ASSET_MAP.values()].filter((d) => d.series === LEGACY_SERIES[type])
  const def = series.length ? (fitIn(fx, series) ?? [...series].sort((a, b) => a.w - b.w)[0]) : undefined
  if (!def) return null
  const f: Furniture = { id: uid('u'), asset: def.id, ...poseOnStorageSpot(fx, def.id), color: 0, colors: [...LEGACY_COLORS[type]] }
  if (fx.open) f.open = true
  return f
}

/**
 * 旧存档迁移：以前收纳位（内置收纳）自己画柜子 → 在每个收纳位上生成同类柜子家具（open 继承），收纳位上的 open 删掉。
 * 已经放着柜子的位不重复生成。返回生成了几件。
 */
export function migrateCabinets(plan: Plan): number {
  let n = 0
  if (!plan.cabinetsAsFurniture) {
    for (const fx of plan.fixtures) {
      if (fx.kind !== 'builtin') continue
      if (!cabinetsOn(plan.furniture, fx).length) {
        const f = legacyCabinet(fx)
        if (f) {
          plan.furniture.push(f)
          n++
        }
      }
    }
  }
  for (const fx of plan.fixtures) if (fx.kind === 'builtin') delete fx.open
  plan.cabinetsAsFurniture = true
  return n
}


/**
 * 以前用「打开」形态的另一件素材表示开着的柜子（同系列 form 'open'）；现在同一件素材按 open 切换。
 * 旧 id → 保留的那件（位置照旧：两种形态的柜体都以占地中心为原点）。
 */
export const LEGACY_OPEN_FORMS: Record<string, string> = {
  'sb-shoe-cab-open': 'sb-shoe-cab-closed',
  'sb-door-cab-open': 'sb-door-cab-closed',
  'be-lingerie-38-open': 'be-lingerie-38-closed',
  'be-lingerie-48-open': 'be-lingerie-48-closed',
  'be-chest-low-open': 'be-chest-low-closed',
  'fm-storage-bed-open': 'fm-storage-bed',
}

/** 旧存档迁移：「打开」形态的素材换成同一件可开合素材 + open。返回换了几件 */
export function migrateOpenForms(plan: Pick<Plan, 'furniture'>): number {
  let n = 0
  for (const f of plan.furniture) {
    const to = LEGACY_OPEN_FORMS[f.asset]
    if (!to || ASSET_MAP.has(f.asset) || !ASSET_MAP.get(to)?.openable) continue
    f.asset = to
    f.open = true
    n++
  }
  return n
}
