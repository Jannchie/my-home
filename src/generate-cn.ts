// 中式商品房平层随机生成（一室一厅 ~ 四室两厅两卫，60–160㎡ 为主）。
//
// 骨架见 generate-band.ts（L 块 | C 列 | R 块）：
//   C 列：南侧客厅（连南向景观阳台），北侧餐厅 + 入户玄关（不下沉，有鞋柜），客餐厅一体不砌墙；
//   R 块：北排紧挨餐厅的是厨房（封闭：推拉门 / 平开门；约两成半开放），厨房外是生活阳台（洗衣机、晾衣）；
//   L 块：南排主卧（三室以上带主卫），北排次卧 / 书房 / 公卫；两块中间各有一条走廊通客餐厅。
// 卫生间干湿分离：淋浴房 + 马桶 + 洗手台，主卫偶尔有浴缸；洗衣机多在生活阳台，否则进公卫。

import { pointInPolygon, rectPoints, type Fixture, type Plan, type Room } from './model'
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
  shoeCabinet,
  spanAt,
  unreachable,
  WALL,
  WALL_OUTER,
  type BlockSpec,
  type CellSpec,
  type Ctx,
  type RegionGen,
} from './generate-band'
import { railingFor } from './generate'
import { t } from './i18n'

const GROUP = 'cn-public'

function layout(seed: number, o: { bedrooms: 'random' | 1 | 2 | 3 | 4; corner: 'random' | 'yes' | 'no' }): { c: Ctx; plan: Plan } {
  const c = createCtx(seed)
  const { rint, chance, pick } = c
  const n = o.bedrooms === 'random' ? pick([1, 2, 2, 3, 3, 3, 4]) : o.bedrooms
  const corner = o.corner === 'random' ? chance(0.45) : o.corner === 'yes'
  const dims = {
    dS: n === 1 ? rint(380, 430) : n === 4 ? rint(440, 500) : rint(400, 470),
    cw: rint(110, 130),
    dN: n === 1 ? rint(260, 300) : n === 4 ? rint(300, 360) : rint(280, 340),
    cW: n === 1 ? rint(340, 390) : n === 2 ? rint(360, 420) : n === 3 ? rint(380, 450) : rint(420, 500),
  }

  // ---------- 房间清单 ----------
  const bed = (name: string, min: number, max: number, window: number, extra: Partial<CellSpec> = {}): CellSpec => ({ kind: 'western', name, min, max, window, ...extra })
  const ensuite = n >= 3 || (n === 2 && chance(0.3))
  const master = bed(n === 1 ? '卧室' : '主卧', n === 4 ? 420 : ensuite ? 360 : 330, n === 4 ? 470 : ensuite ? 410 : 390, rint(160, 200), {
    tag: 'master',
    ensuite: ensuite ? { name: '主卫', w: rint(180, 210), h: rint(220, 250), tag: 'ensuite' } : undefined,
  })
  const slidingKitchen = chance(0.65)
  const kitchen: CellSpec = {
    kind: 'kitchen',
    name: '厨房',
    min: n >= 3 ? 220 : 200,
    max: n >= 3 ? 270 : 240,
    door: 'c',
    doorKind: slidingKitchen ? 'sliding' : 'door',
    doorW: slidingKitchen ? 130 : 80,
    openToC: chance(0.2),
    tag: 'kitchen',
  }
  const pubBath: CellSpec = { kind: 'bath', name: n === 1 ? '卫生间' : '公卫', min: 170, max: 210, window: 60, tag: 'bath' }
  const filler: CellSpec = { kind: 'storage', name: '储藏间', min: 100, max: 170, doorW: 70, tag: 'store' }
  const [third, fourth] = chance(0.5) ? ['书房', '儿童房'] : ['儿童房', '书房']
  const second = bed('次卧', 290, 340, rint(140, 170))

  // 几种排法（都满足：厨房在 R 块北排第一间、紧挨餐厅；每间都从走廊 / 客餐厅进）
  let L: BlockSpec
  let R: BlockSpec
  c.sig.push(`n${n}`)
  if (n === 1) {
    L = { south: [master], north: [pubBath], filler }
    R = { south: [], north: [kitchen] }
  } else if (n === 2) {
    if (c.altChance(0.35)) {
      // 公卫挪到厨房旁边：主卧独占 L 块（加深到走廊带，门开向客厅）
      c.sig.push('bathByKitchen')
      L = { south: [master], north: [] }
      R = { south: [second], north: [kitchen, pubBath], filler }
    } else {
      L = { south: [master], north: [pubBath], filler }
      R = { south: [second], north: [kitchen] }
    }
  } else if (n === 3) {
    // 公卫放在主卧这一侧：北排（次卧 + 公卫）比主卧宽，主卧顺势做大，是全屋最大的卧室；
    // 公卫靠客餐厅一侧还是外侧随机
    const third3 = bed(third, 270, 310, rint(120, 150))
    const bathIn = c.altChance(0.4)
    if (bathIn) c.sig.push('bathIn')
    L = { south: [master], north: bathIn ? [pubBath, third3] : [third3, pubBath], filler }
    R = { south: [second], north: [kitchen], filler }
  } else {
    // 次卧和第四间谁靠客厅随机
    const south4 = [second, bed(fourth, 270, 320, rint(130, 160))]
    if (c.altChance(0.5)) {
      south4.reverse()
      c.sig.push('swap')
    }
    L = { south: [master], north: [bed(third, 280, 330, rint(120, 150))], filler }
    R = { south: south4, north: [kitchen, pubBath], filler }
  }

  // ---------- C 列北半：餐厅 + 玄关（在远离厨房的一侧）+ 可能有储藏间 ----------
  const buildC = (x0: number, x1: number, dS: number, D: number) => {
    const gk = rint(150, 180)
    const gw = rint(150, 190)
    const rest = x1 - x0 - gw
    const store = rest >= 220 && chance(0.4)
    const sw = store ? rint(100, 130) : 0
    const xs = x0 + gw + sw
    const dining = c.room(
      'dining',
      '餐厅',
      x1 - xs < 30
        ? rectPoints(x0, dS, x1, D - gk)
        : [
            { x: x0, y: dS },
            { x: x1, y: dS },
            { x: x1, y: D },
            { x: xs, y: D },
            { x: xs, y: D - gk },
            { x: x0, y: D - gk },
          ],
    )
    dining.openGroup = GROUP
    if (x1 - xs >= 160) c.open(dining, 'window', { x: (xs + x1) / 2, y: D }, Math.min(120, x1 - xs - 60))
    const genkan = c.rect('entrance', '玄关', x0, D - gk, x0 + gw, D)
    genkan.flush = true
    genkan.openGroup = GROUP
    c.open(genkan, 'door', { x: x0 + gw / 2, y: D }, 95, 'out')
    if (store) {
      const st = c.rect('storage', '储藏间', x0 + gw, D - gk, xs, D)
      c.open(st, 'door', { x: x0 + gw + sw / 2, y: D - gk }, Math.min(70, sw - 20), 'out')
    }
  }

  const band = bandLayout(c, dims, { L, R }, { group: GROUP, hallName: '走廊', livingName: '客厅', livingWindow: rint(260, 340), buildC, mirror: chance(0.5) })
  const { W, D } = band

  // ---------- 阳台 ----------
  // 南向景观阳台：连客厅，约三成连到主卧
  const masterRoom = band.placed.find((p) => p.spec.tag === 'master')!.room
  let [bx0, bx1] = [band.xC0, band.xC1]
  const ms = spanAt(masterRoom, 0)
  if (ms && chance(0.35)) [bx0, bx1] = [Math.min(bx0, ms[0]), Math.max(bx1, ms[1])]
  const rail = pick<Room['railing']>(['glass', 'glass', 'bars', 'mixed', railingFor(seed)])
  balconyAlong(c, '景观阳台', bx0, bx1, 0, -rint(140, 180), rail)
  // 生活阳台：厨房北侧，推拉门进
  const kRoom = band.placed.find((p) => p.spec.tag === 'kitchen')!.room
  const ks = spanAt(kRoom, D)
  if (ks) {
    balconyAlong(c, '生活阳台', ks[0], ks[1], D, rint(110, 140), rail)
    c.open(kRoom, 'sliding', { x: (ks[0] + ks[1]) / 2, y: D }, Math.min(ks[1] - ks[0] - 50, 150))
  }

  if (corner) cornerWindows(c, W, { ldk: 180, dining: 120, western: 120, bath: 60, kitchen: 90 })

  const baths = c.rooms.filter((r) => r.kind === 'bath').length
  const plan: Plan = {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: `${t('{n}室{h}厅{b}卫', { n, h: n === 1 ? 1 : 2, b: baths })}${corner ? t('·边户') : ''} ${planArea({ rooms: c.rooms }).toFixed(1)}㎡ #${seed}`,
    wall: WALL,
    wallOuter: WALL_OUTER,
    rooms: c.rooms,
    openings: c.openings,
    fixtures: [],
    furniture: [],
    region: 'cn',
  }
  return { c, plan }
}

function furnish({ c, plan }: { c: Ctx; plan: Plan }): Plan {
  prepareDoors(plan)
  const put = putter(plan)
  const byName = (re: RegExp) => plan.rooms.filter((r) => re.test(r.name))
  const kitchen = plan.rooms.find((r) => r.kind === 'kitchen')
  const dining = plan.rooms.find((r) => r.kind === 'dining')
  if (kitchen)
    placeKitchen(plan, kitchen, {
      variants: ['wall'],
      lengths: [300, 285, 270, 255, 240, 225, 210, 195, 180, 165],
      edges: 'any',
      fridge: [75, 70, 65],
      fridgeDepth: 68,
      fridgeRooms: dining ? [dining] : [],
      // 中式厨房：两口大火灶 + 吸油烟机（壁挂式厨房模型自带）
      extra: { burners: 2 },
    })

  // 洗衣机：多半在生活阳台，否则进公卫
  const service = plan.rooms.find((r) => r.kind === 'balcony' && r.name === '生活阳台')
  let washer: Fixture | null = null
  if (service && c.chance(0.8)) washer = put(service, { kind: 'washer', lengths: [64, 60], depth: 64 })

  for (const r of plan.rooms.filter((r) => r.kind === 'bath')) {
    const isMaster = r.name === '主卫'
    const got = placeBathroom(plan, r, {
      wet: isMaster ? (c.chance(0.3) ? 'tub' : 'shower') : c.chance(0.12) ? 'tub' : 'shower',
      basins: isMaster && m2(r) >= 5 && c.chance(0.35) ? 2 : 1,
      basinW: [80, 70, 60],
      basinD: 50,
      washer: !washer && !isMaster,
    })
    washer ??= got.find((f) => f.kind === 'washer') ?? null
  }
  if (!washer && service) washer = put(service, { kind: 'washer', lengths: [64, 60], depth: 64 })

  const genkan = plan.rooms.find((r) => r.kind === 'entrance')
  if (genkan) shoeCabinet(plan, genkan)
  // 主卧常见整面定制衣柜
  for (const r of byName(/^(主卧|卧室)$/)) if (c.chance(0.55)) bedroomCloset(plan, r, [240, 220, 200, 180, 160], 60)

  // 马桶普通款居多，智能马桶约三成（冰箱、洗衣机是家具，由一键布置挑款式）
  for (const f of plan.fixtures) if (f.kind === 'toilet') f.toiletType = c.chance(0.55) ? 'basic' : c.chance(0.75) ? 'washlet' : 'tankless'
  return plan
}

function violations(plan: Plan, checkFixtures: boolean): string[] {
  const out: string[] = []
  const living = plan.rooms.find((r) => r.kind === 'ldk')
  const beds = plan.rooms.filter((r) => r.kind === 'western')
  if (!living || m2(living) < (beds.length <= 1 ? 11 : 14)) out.push('客厅太小')
  for (const r of beds) if (m2(r) < (/书房|儿童房/.test(r.name) ? 6 : 7.5)) out.push(`${r.name} 太小`)
  const k = plan.rooms.find((r) => r.kind === 'kitchen')
  if (!k || m2(k) < 4.5) out.push('厨房太小')
  if (unreachable(plan).length) out.push('有房间走不到')
  if (checkFixtures) {
    if (!plan.fixtures.some((f) => f.kind === 'kitchen')) out.push('厨房放不下')
    if (!plan.fixtures.some((f) => f.kind === 'fridge')) out.push('冰箱放不下')
    if (!plan.fixtures.some((f) => f.kind === 'washer')) out.push('洗衣机放不下')
    for (const r of plan.rooms.filter((r) => r.kind === 'bath')) {
      const fs = plan.fixtures.filter((f) => pointInPolygon(f, r.points))
      if (!fs.some((f) => f.kind === 'toilet') || !fs.some((f) => f.kind === 'basin') || !fs.some((f) => f.kind === 'bathtub')) out.push(`${r.name} 设备不全`)
    }
  }
  return out
}

export const CN: RegionGen = { layout, furnish, violations }
