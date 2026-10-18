// 欧美公寓 / 独栋平层随机生成（1–4 Bed，70–200㎡）。
//
// 骨架见 generate-band.ts（L 块 | C 列 | R 块）：
//   C 列：南侧 Living Room（外面是 Patio），北侧 Dining | Kitchen 并排，三者开放不砌墙；厨房多是中岛（island）。
//   L 块：主卧套间 —— 南侧 Primary Bedroom，北侧 Walk-in Closet + Primary Bath（双台盆、浴缸或淋浴、马桶），都从主卧进。
//   R 块：南排 Bedroom 2..n / Office，北排 Pantry（紧挨厨房）、Laundry（洗衣机 + 烘干机并排）、Bath、Foyer（入户）、Half Bath，
//         中间一条 Hallway 通到开放的客餐厨。
// 入口不下沉（室内可穿鞋），没有日式的鞋柜要求；空调是中央空调，Patio 上放一台室外机。

import { pointInPolygon, type Plan, type Room } from './model'
import {
  balconyAlong,
  bandLayout,
  bedroomCloset,
  cornerWindows,
  createCtx,
  m2,
  placeBathroom,
  placeKitchen,
  planArea,
  prepareDoors,
  putter,
  spanAt,
  unreachable,
  WALL,
  WALL_OUTER,
  type BlockSpec,
  type CellSpec,
  type Ctx,
  type LayoutOpts,
  type RegionGen,
  type RegionLayout,
} from './generate-band'
import { altInt, bump, carveCorner, defaultRule } from './footprint'
import { t } from './i18n'

const GROUP = 'west-great'

function layout(seed: number, o: LayoutOpts): RegionLayout {
  const c = createCtx(seed)
  const { rint, chance, pick } = c
  const n = o.bedrooms === 'random' ? pick([1, 2, 2, 3, 3, 3, 4, 4]) : o.bedrooms
  const corner = o.corner === 'random' ? chance(0.5) : o.corner === 'yes'
  const big = n >= 3
  const dims = {
    dS: n === 1 ? rint(360, 400) : n === 2 ? rint(380, 440) : rint(420, 480),
    cw: rint(110, 130),
    dN: n === 1 ? rint(270, 300) : n === 2 ? rint(280, 320) : rint(300, 350),
    cW: n === 1 ? rint(480, 540) : n === 2 ? rint(500, 570) : rint(540, 620),
  }

  const bed = (name: string, min: number, max: number, extra: Partial<CellSpec> = {}): CellSpec => ({ kind: 'western', name, min, max, window: rint(140, 180), ...extra })
  const L: BlockSpec = {
    suite: true,
    south: [bed('Primary Bedroom', n === 1 ? 340 : n === 2 ? 360 : 400, n === 1 ? 380 : n === 2 ? 420 : 450, { tag: 'master', window: rint(180, 220) })],
    north: [
      { kind: 'storage', name: 'Walk-in Closet', min: n === 1 ? 120 : 130, max: n === 1 ? 150 : 180, tag: 'wic', doorW: 75 },
      { kind: 'bath', name: 'Primary Bath', min: n === 1 ? 200 : 220, max: n === 1 ? 240 : 270, window: 70, tag: 'primaryBath' },
    ],
  }
  const pantry: CellSpec = { kind: 'storage', name: 'Pantry', min: 100, max: 130, door: 'c', doorW: 70, tag: 'pantry' }
  const laundry: CellSpec = { kind: 'wash', name: 'Laundry', min: n === 1 ? 120 : 160, max: n === 1 ? 150 : 190, tag: 'laundry', doorKind: chance(0.3) ? 'folding' : 'door', doorW: 80 }
  const bath: CellSpec = { kind: 'bath', name: 'Bath', min: 210, max: 250, window: 60, tag: 'bath' }
  const foyer: CellSpec = { kind: 'entrance', name: 'Foyer', min: 160, max: 200, door: 'none', tag: 'foyer' }
  const half: CellSpec = { kind: 'bath', name: 'Half Bath', min: 140, max: 160, tag: 'half', doorW: 70 }
  const linen: CellSpec = { kind: 'storage', name: 'Linen', min: 90, max: 140, doorW: 60, tag: 'linen' }
  const office: CellSpec = bed('Office', 250, 300, { tag: 'office' })
  const bedN = (k: number) => bed(`Bedroom ${k}`, big ? 300 : 290, big ? 350 : 330)

  let south: CellSpec[]
  let service: CellSpec[]
  if (n === 1) {
    south = [office]
    service = [laundry, foyer]
  } else if (n === 2) {
    // Office 靠客厅还是靠外侧随机
    south = c.altChance(0.5) ? [bedN(2), office] : [office, bedN(2)]
    service = [laundry, bath, foyer]
  } else if (n === 3) {
    south = [bedN(2), bedN(3)]
    service = [laundry, bath, foyer, ...(chance(0.5) ? [half] : [])]
  } else {
    south = [bedN(2), bedN(3), bedN(4)]
    service = [laundry, bath, foyer, half]
  }
  // 北排顺序打乱：玄关别总在同一个位置；Pantry 永远紧挨厨房
  // （玄关不紧挨厨房：和玄关之间的墙不能放设备，小厨房会放不下冰箱；隔着 Pantry 就没关系）
  const withPantry = n >= 2 && chance(n >= 3 ? 0.6 : 0.35)
  if (service.length >= 3) {
    for (let i = service.length - 1; i > 0; i--) {
      const j = Math.floor(c.alt() * (i + 1))
      ;[service[i], service[j]] = [service[j], service[i]]
    }
    if (!withPantry && service[0] === foyer) {
      const j = 1 + Math.floor(c.alt() * (service.length - 1))
      ;[service[0], service[j]] = [service[j], service[0]]
    }
  }
  c.sig.push(`n${n}`, withPantry ? 'pantry' : '', south[0] === office ? 'officeIn' : '')
  const R: BlockSpec = { south, north: [...(withPantry ? [pantry] : []), ...service], filler: linen }

  // C 列北半：Dining（靠主卧一侧）| Kitchen（靠服务区一侧）
  const buildC = (x0: number, x1: number, dS: number, D: number) => {
    const kx = Math.min(rint(300, 350), x1 - x0 - 210)
    const dining = c.rect('dining', 'Dining', x0, dS, x1 - kx, D)
    dining.openGroup = GROUP
    c.open(dining, 'window', { x: (x0 + x1 - kx) / 2, y: D }, Math.min(140, x1 - kx - x0 - 80))
    const k = c.rect('kitchen', 'Kitchen', x1 - kx, dS, x1, D)
    k.openGroup = GROUP
  }

  const band = bandLayout(c, dims, { L, R }, { group: GROUP, hallName: 'Hallway', livingName: 'Living Room', livingWindow: rint(300, 380), buildC, mirror: chance(0.5) })
  const { W, D } = band

  // 入户门：Foyer 北墙
  const foyerRoom = band.placed.find((p) => p.spec.tag === 'foyer')!.room
  foyerRoom.flush = true
  const fs = spanAt(foyerRoom, D)
  if (fs) c.open(foyerRoom, 'door', { x: (fs[0] + fs[1]) / 2, y: D }, 95, 'out')

  // Patio：Living 南侧，约三成连到主卧
  const master = band.placed.find((p) => p.spec.tag === 'master')!.room
  let [px0, px1] = [band.xC0, band.xC1]
  const ms = spanAt(master, 0)
  if (ms && chance(0.3)) [px0, px1] = [Math.min(px0, ms[0]), Math.max(px1, ms[1])]
  balconyAlong(c, 'Patio', px0, px1, 0, -rint(200, 280), pick<Room['railing']>(['bars', 'bars', 'louver', 'glass']))

  const shaped = !o.plain && shapeWest(c)
  if (corner) cornerWindows(c, W, { ldk: 200, dining: 140, kitchen: 100, western: 140, bath: 60 })

  const full = c.rooms.filter((r) => r.kind === 'bath' && r.name !== 'Half Bath').length
  const halfN = c.rooms.filter((r) => r.name === 'Half Bath').length
  const beds = c.rooms.filter((r) => r.kind === 'western' && r.name !== 'Office').length
  const plan: Plan = {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: `${t('{n}室{b}卫', { n: beds, b: `${full}${halfN ? '.5' : ''}` })}${c.rooms.some((r) => r.name === 'Office') ? t('+书房') : ''}${corner ? t('·边户') : ''} ${planArea({ rooms: c.rooms }).toFixed(1)}㎡ #${seed}`,
    wall: WALL,
    wallOuter: WALL_OUTER,
    rooms: c.rooms,
    openings: c.openings,
    fixtures: [],
    furniture: [],
    region: 'west',
  }
  return { c, plan, ...(shaped ? { plain: () => layout(seed, { ...o, plain: true }) } : {}) }
}

/**
 * 外轮廓变形（只用 c.alt，见 footprint.ts）：
 *   约 30%：切掉一个外墙角（角上的卧室 / 收纳变成 L 形或变浅；挨着 Patio 的角不切）；
 *   约 25%：南侧一间卧室做凸窗（bay window：南墙中间往外凸 60–90，窗挪到凸出部分）；
 *   约 12%：Foyer 往北凸出一块（入户门挪到凸出部分）。
 */
function shapeWest(c: Ctx) {
  const t = { rooms: c.rooms, openings: c.openings }
  const rule = defaultRule({ western: 8.5, storage: 1 })
  let done = false
  if (c.altChance(0.3)) {
    const k0 = Math.floor(c.alt() * 4)
    const all = ['ne', 'se', 'nw', 'sw'] as const
    for (let i = 0; i < 4; i++) if (carveCorner(c, t, all[(k0 + i) % 4], rule, { w: [0.35, 0.6], d: [0.3, 0.5] })) {
      done = true
      break
    }
  }
  if (c.altChance(0.25)) {
    const beds = c.rooms.filter((r) => r.kind === 'western' && r.points.length === 4 && r.points.some((p) => Math.abs(p.y) < 1))
    const start = Math.floor(c.alt() * Math.max(1, beds.length))
    const depth = altInt(c, 60, 90)
    const want = altInt(c, 170, 240)
    const shift = c.alt() - 0.5
    for (let i = 0; i < beds.length; i++) {
      const r = beds[(start + i) % beds.length]
      const xs = r.points.map((p) => p.x)
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
      const w = Math.min(want, x1 - x0 - 100)
      if (w < 150) continue
      const mid = (x0 + x1) / 2 + Math.round((shift * (x1 - x0 - w - 100)) / 10) * 10
      if (bump(t, r, 's', mid - w / 2, mid + w / 2, depth)) {
        done = true
        break
      }
    }
  }
  if (c.altChance(0.12)) {
    const g = c.rooms.find((r) => r.kind === 'entrance')
    const xs = g?.points.map((p) => p.x) ?? []
    if (g && bump(t, g, 'n', Math.min(...xs), Math.max(...xs), altInt(c, 60, 100))) done = true
  }
  return done
}

function furnish({ c, plan }: { c: Ctx; plan: Plan }): Plan {
  prepareDoors(plan)
  const put = putter(plan)
  const kitchen = plan.rooms.find((r) => r.kind === 'kitchen')
  if (kitchen) {
    const island = c.chance(0.8)
    const { k } = placeKitchen(plan, kitchen, {
      variants: island ? ['facing', 'wall'] : ['wall'],
      lengths: [300, 285, 270, 255, 240, 225, 210],
      edges: 'inner',
      fridge: [90, 85, 80, 75],
      fridgeDepth: 75,
      extra: { dishwasher: true, induction: c.chance(0.5), burners: c.chance(0.6) ? 3 : 2 },
    })
    if (k?.variant === 'facing') k.island = true
  }
  for (const r of plan.rooms) {
    if (r.kind === 'bath') {
      if (r.name === 'Half Bath') placeBathroom(plan, r, { wet: 'none', basins: 1, basinW: [60, 50], basinD: 45 })
      else if (r.name === 'Primary Bath') placeBathroom(plan, r, { wet: c.chance(0.55) ? 'tub' : 'shower', basins: 2, basinW: [75, 70, 65], basinD: 55 })
      else placeBathroom(plan, r, { wet: c.chance(0.7) ? 'tub' : 'shower', basins: 1, basinW: [80, 70, 60], basinD: 55 })
    } else if (r.name === 'Laundry') {
      // 洗衣机位：宽的放洗衣机 + 烘干机并排，窄的放叠放款（一键布置按位的宽度挑）
      if (!put(r, { kind: 'washer', lengths: [140, 130], depth: 70 })) put(r, { kind: 'washer', lengths: [70, 64], depth: 68 })
      if (c.chance(0.6)) put(r, { kind: 'basin', lengths: [60, 50], depth: 50 })
    } else if (r.name === 'Pantry') {
      const f = put(r, { kind: 'builtin', lengths: [130, 120, 100, 90, 80], depth: 40 })
      if (f) f.builtinType = 'pantry'
    } else if (r.kind === 'western' && r.name !== 'Primary Bedroom') {
      // 次卧的 reach-in closet
      bedroomCloset(plan, r)
    }
  }
  // 中央空调的室外机：Patio 上靠外墙
  const patio = plan.rooms.find((r) => r.kind === 'balcony')
  if (patio) put(patio, { kind: 'outdoor', lengths: [80], depth: 40, edges: 'house', avoidWindows: true }) ?? put(patio, { kind: 'outdoor', lengths: [80], depth: 40, avoidWindows: true })

  for (const f of plan.fixtures) if (f.kind === 'toilet') f.toiletType = 'basic'
  return plan
}

function violations(plan: Plan, checkFixtures: boolean): string[] {
  const out: string[] = []
  const living = plan.rooms.find((r) => r.kind === 'ldk')
  const beds = plan.rooms.filter((r) => r.kind === 'western' && r.name !== 'Office').length
  if (!living || m2(living) < (beds <= 1 ? 15 : beds === 2 ? 17 : 20)) out.push('Living 太小')
  for (const r of plan.rooms.filter((r) => r.kind === 'western')) if (m2(r) < (r.name === 'Primary Bedroom' ? 14 : 8.5)) out.push(`${r.name} 太小`)
  if (unreachable(plan).length) out.push('有房间走不到')
  if (checkFixtures) {
    if (!plan.fixtures.some((f) => f.kind === 'kitchen')) out.push('厨房放不下')
    if (!plan.fixtures.some((f) => f.kind === 'fridge')) out.push('冰箱放不下')
    if (!plan.fixtures.some((f) => f.kind === 'washer')) out.push('洗衣机放不下')
    for (const r of plan.rooms.filter((r) => r.kind === 'bath')) {
      const fs = plan.fixtures.filter((f) => pointInPolygon(f, r.points))
      const need = r.name === 'Half Bath' ? ['toilet', 'basin'] : ['toilet', 'basin', 'bathtub']
      if (!need.every((k) => fs.some((f) => f.kind === k))) out.push(`${r.name} 设备不全`)
    }
  }
  return out
}

export const WEST: RegionGen = { region: 'west', layout, furnish, violations }
