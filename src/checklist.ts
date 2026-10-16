// 全屋检查清单：按房间用途和住户设定列出必要的东西，看看缺了什么；每一项都可以一键补上。

import { sharedIntervals } from './walls'
import { edgesOf, pointInPolygon, type Furniture, type Plan, type Room } from './model'
import { ASSET_MAP, type AssetDef } from './three/assets'
import { JOBS, type Household } from './household'

/** 补救动作：交给 decorate.ts 的 applyFixes 执行 */
export type Fix =
  | { how: 'wall'; re: RegExp; prop?: boolean } // 靠墙放一件
  | { how: 'mount'; re: RegExp } // 挂到墙上
  | { how: 'scatter'; re: RegExp } // 摆到房间里的台面 / 层板上
  | { how: 'fixture'; re: RegExp; fixture: 'kitchen' | 'basin' | 'washer' | 'toilet' } // 摆到设备台面上
  | { how: 'aircon' } // 挂空调（内机 + 外机朝向）
  | { how: 'outdoor' } // 空调外机补到和室内机一样多（在 store 里处理：外机是设备不是家具）
  | { how: 'chairs' } // 餐椅补到人数
  | { how: 'bed' } // 按住户补床
  | { how: 'desk' } // 书桌 + 椅子

export interface CheckItem {
  key: string
  roomId: string | null
  roomName: string
  label: string
  have: number
  need: number
  /** 内置设备（开关、对讲）：自动具备，不需要补 */
  builtin?: boolean
  fix?: Fix
}

const text = (d: AssetDef) => `${d.id} ${d.name}`
const inRoom = (plan: Plan, room: Room) => plan.furniture.filter((f) => pointInPolygon(f, room.points))
function count(list: Furniture[], re: RegExp, filter: (d: AssetDef) => boolean = () => true) {
  return list.filter((f) => {
    const d = ASSET_MAP.get(f.asset)
    return !!d && re.test(text(d)) && filter(d)
  }).length
}
const windowsOf = (plan: Plan, room: Room) => plan.openings.filter((o) => o.roomId === room.id && o.kind === 'window').length

const RE = {
  aircon: /aircon|空调/,
  curtain: /curtain|窗帘/,
  bed: /^bed-|kid-crib|kid-bed|futon|bd-bunk|bd-loft|床(?!头|尾|边)|被褥/,
  closet: /wardrobe|衣柜|tansu|箪笥|dresser|斗柜|clothes-rail|挂衣/,
  lamp: /lamp|灯(?!泡)/,
  sofa: /sofa|沙发/,
  tv: /prop-tv|wall-tv|电视(?!柜)/,
  dining: /dining-table|tbl-dining|餐桌/,
  chair: /chair|椅|stool|凳|zabuton|坐垫|zaisu/,
  microwave: /microwave|微波炉|steam-oven|蒸烤箱/,
  rice: /rice-cooker|电饭煲/,
  kettle: /kettle|electric-pot|水壶|电热水瓶/,
  shoeCab: /shoe-cabinet|鞋柜|鞋架|shoe-rack/,
  umbrella: /umbrella|伞架/,
  shoes: /shoe(?!-cab|-rack)|鞋(?!柜|架)|sneaker|boots|靴/,
  detergent: /detergent|洗衣液|洗衣粉/,
  scale: /body-scale|fit-scale|^scale-|体重秤/,
  softener: /soften|柔软/,
  towel: /towel|毛巾|浴巾/,
  dryer: /hair-dryer|吹风机/,
  toothbrush: /toothbrush|刷牙/,
  shampoo: /shampoo|bottle-set|洗发|洗护三瓶/,
  bodySoap: /body-soap|body-wash|bottle-set|沐浴|洗护三瓶/,
  bathStool: /bath-stool|浴凳|风呂椅|風呂椅/,
  bucket: /bucket|洗面桶|風呂桶/,
  toiletPaper: /toilet-paper|卷纸|卷筒纸/,
  toiletBrush: /toilet-brush|马桶刷/,
  laundryStand: /laundry-stand|晾衣架/,
  desk: /desk|书桌|学习桌|写字台|电脑桌/,
  crib: /kid-crib|婴儿床/,
  catTower: /cat-tower|猫爬架/,
  litter: /litter|猫砂/,
}

/**
 * 生成清单。规则按房间用途，加上住户相关的（床的张数、餐椅数、书桌、婴儿床、宠物用品）。
 */
export function checklist(plan: Plan, hh?: Household): CheckItem[] {
  const out: CheckItem[] = []
  const item = (room: Room | null, label: string, have: number, need: number, fix?: Fix, builtin = false) =>
    out.push({ key: `${room?.id ?? 'home'}|${label}`, roomId: room?.id ?? null, roomName: room?.name ?? '全屋', label, have, need, fix, builtin })
  const all = plan.furniture
  const habit = (r: Room) => r.kind === 'western' || r.kind === 'japanese' || r.kind === 'ldk'
  // 地区：日式的玄関鞋柜、浴室洗い場（浴凳、洗面桶）、给汤遥控是日本特有；欧美中央空调不挂壁挂机、室内穿鞋
  const region = plan.region ?? 'jp'
  const diningRoom = plan.rooms.some((r) => r.kind === 'dining')
  const firstBalcony = plan.rooms.find((r) => r.kind === 'balcony')
  const serviceBalcony = plan.rooms.find((r) => r.kind === 'balcony' && r.name === '生活阳台')

  for (const r of plan.rooms) {
    const f = inRoom(plan, r)
    if (habit(r)) {
      if (region !== 'west') item(r, '空调', count(f, RE.aircon), 1, { how: 'aircon' })
      if (windowsOf(plan, r) && r.kind !== 'japanese') item(r, '窗帘', r.curtain === false ? 0 : 1, 1, undefined, r.curtain !== false)
      item(r, '开关', 1, 1, undefined, true)
    }
    if (r.kind === 'western' || r.kind === 'japanese') {
      item(r, '照明（台灯 / 落地灯）', count(f, RE.lamp), 1, { how: 'scatter', re: /prop-table-lamp|prop-desk-lamp|台灯/ })
      // 和房间共墙的收纳间（クローゼット、押入れ、WIC）或房间里的壁内收纳就算有衣物收纳
      const closetRoom = plan.rooms.some((o) => o.kind === 'storage' && edgesOf(r.points).some((e) => sharedIntervals(e, o).length > 0))
      const builtinCloset = plan.fixtures.some((x) => x.kind === 'builtin' && x.builtinType === 'closet' && pointInPolygon(x, r.points))
      item(r, '衣物收纳', count(f, RE.closet) + (closetRoom || builtinCloset ? 1 : 0), 1, { how: 'wall', re: /^wardrobe$|^dresser$|^be-|^sf-garment-rail|clothes-rail|chest/ })
    }
    if (r.kind === 'ldk') {
      item(r, '沙发', count(f, RE.sofa), 1, { how: 'wall', re: /^sofa2$/ })
      item(r, '电视', count(f, RE.tv), 1, { how: 'scatter', re: /prop-tv-43/ })
      if (!diningRoom) item(r, '餐桌', count(f, RE.dining), 1, { how: 'wall', re: /^dining-table$/ })
      item(r, '可视对讲 / 热水器遥控', 1, 1, undefined, true)
    }
    if (r.kind === 'dining') item(r, '餐桌', count(f, RE.dining), 1, { how: 'wall', re: /^dining-table$/ })
    if (r.kind === 'ldk' || r.kind === 'kitchen') {
      const hasKitchen = plan.fixtures.some((x) => x.kind === 'kitchen' && pointInPolygon(x, r.points))
      if (hasKitchen) {
        // 中式厨房小，冰箱常放在餐厅：按全屋算
        item(r, '冰箱', plan.fixtures.filter((x) => x.kind === 'fridge' && (region !== 'jp' || pointInPolygon(x, r.points))).length, 1)
        item(r, '微波炉', count(all, RE.microwave), 1, { how: 'fixture', re: /prop-microwave/, fixture: 'kitchen' })
        item(r, '电饭煲', count(all, RE.rice), 1, { how: 'fixture', re: /prop-rice-cooker$/, fixture: 'kitchen' })
        item(r, '电水壶', count(all, RE.kettle), 1, { how: 'fixture', re: /prop-kettle$/, fixture: 'kitchen' })
      }
    }
    if (r.kind === 'entrance' && region !== 'west') {
      const builtinShoe = plan.fixtures.filter((x) => x.kind === 'builtin' && (x.builtinType ?? 'shoe') === 'shoe' && pointInPolygon(x, r.points)).length
      // 玄关太小时鞋架、伞架会放到相邻的走廊里，也算
      const fe = [...f, ...plan.rooms.filter((o) => o.kind === 'hall' && edgesOf(r.points).some((e) => sharedIntervals(e, o).length > 0)).flatMap((o) => inRoom(plan, o))]
      item(r, '鞋柜 / 鞋架', count(fe, RE.shoeCab) + builtinShoe, 1, { how: 'wall', re: /^shoe-cabinet$/ })
      item(r, '伞架', count(fe, RE.umbrella), 1, { how: 'wall', re: /^umbrella-stand$/ })
      item(r, '鞋子', count(f, RE.shoes, (d) => !!d.prop), 1, { how: 'scatter', re: /sneaker|运动鞋|shoe/ })
    }
    const hasFx = (kind: string) => plan.fixtures.some((x) => x.kind === kind && pointInPolygon(x, r.points))
    if (r.kind === 'wash' && region !== 'jp') {
      // 欧美的 Laundry：只看洗衣用品
      item(r, '洗衣液', count(f, RE.detergent), 1, { how: 'fixture', re: /detergent|洗衣液/, fixture: 'washer' })
      if (hasFx('basin')) item(r, '毛巾', count(f, RE.towel), 1, { how: 'scatter', re: /towel|毛巾/ })
    } else if (r.kind === 'wash') {
      item(r, '洗衣液', count(f, RE.detergent), 1, { how: 'fixture', re: /detergent|洗衣液/, fixture: 'washer' })
      item(r, '柔软剂', count(f, RE.softener), 1, { how: 'fixture', re: /soften|柔软/, fixture: 'washer' })
      item(r, '牙刷杯', count(f, RE.toothbrush), 1, { how: 'fixture', re: /toothbrush|刷牙/, fixture: 'basin' })
      item(r, '毛巾', count(f, RE.towel), 1, { how: 'scatter', re: /towel|毛巾/ })
      item(r, '吹风机', count(f, RE.dryer), 1, { how: 'scatter', re: /hair-dryer|吹风机/ })
      // 体重秤全屋有一台就行（放卧室、更衣间也算）
      item(r, '体重秤', count(all, RE.scale), 1, { how: 'wall', re: /^(wet-body-scale|scale-glass|scale-round)$/ })
    }
    if (r.kind === 'bath') {
      item(r, '洗发水', count(f, RE.shampoo), 1, { how: 'scatter', re: /^wet-shampoo$/ })
      item(r, '沐浴露', count(f, RE.bodySoap), 1, { how: 'scatter', re: /^wet-body-soap$/ })
      if (region === 'jp') {
        item(r, '浴凳', count(f, RE.bathStool), 1, { how: 'wall', re: /bath-stool|浴凳|風呂椅|风呂椅/ })
        item(r, '洗面桶', count(f, RE.bucket), 1, { how: 'wall', re: /bucket|洗面桶|風呂桶/ })
        item(r, '浴室遥控', 1, 1, undefined, true)
      } else if (hasFx('basin')) {
        item(r, '牙刷杯', count(f, RE.toothbrush), 1, { how: 'fixture', re: /toothbrush|刷牙/, fixture: 'basin' })
        item(r, '毛巾', count(f, RE.towel), 1, { how: 'scatter', re: /towel|毛巾/ })
      }
    }
    if (r.kind === 'toilet' || (r.kind === 'bath' && plan.fixtures.some((x) => x.kind === 'toilet' && pointInPolygon(x, r.points)))) {
      item(r, '卷纸架', 1, 1, undefined, true)
      item(r, '备用卷纸', count(f, RE.toiletPaper), 1, { how: 'fixture', re: /toilet-paper|卷纸|卷筒纸/, fixture: 'toilet' })
      item(r, '马桶刷', count(f, RE.toiletBrush), 1, { how: 'wall', re: /toilet-brush|马桶刷/ })
    }
    if (r.kind === 'balcony') {
      // 晾衣：日式每个阳台；中式只看生活阳台（没有就看景观阳台）；欧美 Patio 不晒衣服（有烘干机）
      if (region === 'jp' || (region === 'cn' && (serviceBalcony ?? firstBalcony) === r)) item(r, '晾衣架', region === 'cn' ? count(plan.rooms.filter((o) => o.kind === 'balcony').flatMap((o) => inRoom(plan, o)), RE.laundryStand) : count(f, RE.laundryStand), 1, { how: 'wall', re: /^laundry-stand$/ })
      const ac = count(all, RE.aircon)
      // 外机数只在第一个阳台上列一次（中式两个阳台不重复报）
      if (ac && region !== 'west' && r === firstBalcony) item(r, `空调外机（对应 ${ac} 台室内机）`, plan.fixtures.filter((x) => x.kind === 'outdoor').length, ac, { how: 'outdoor' })
    }
  }

  // ---------- 住户相关 ----------
  if (hh) {
    const sleepers = hh.members.filter((m) => m.role !== 'partner').length
    item(null, `床（${hh.members.length} 人）`, count(all, RE.bed), sleepers, { how: 'bed' })
    const chairs = plan.rooms.filter((r) => r.kind === 'ldk' || r.kind === 'kitchen' || r.kind === 'dining').reduce((s, r) => s + count(inRoom(plan, r), RE.chair, (d) => d.category === 'dining' || /餐|dining/.test(d.id + d.name)), 0)
    if (count(all, RE.dining)) item(null, `餐椅（${hh.members.length} 人）`, chairs, hh.members.length, { how: 'chairs' })
    const deskUsers = hh.members.filter((m) => JOBS[m.job].wfh || m.job === 'student' || m.job === 'schoolkid').length
    if (deskUsers) item(null, '书桌（在家工作 / 学习的人）', count(all, RE.desk, (d) => !d.prop && !!d.surface), deskUsers, { how: 'desk' })
    if (hh.members.some((m) => m.age < 3)) item(null, '婴儿床', count(all, RE.crib), 1, { how: 'wall', re: /kid-crib/ })
    if (hh.members.some((m) => m.interests.includes('cats'))) {
      item(null, '猫爬架', count(all, RE.catTower), 1, { how: 'wall', re: /^cat-tower$/ })
      item(null, '猫砂盆', count(all, RE.litter), 1, { how: 'wall', re: /litter|猫砂/ })
    }
  }
  return out
}

export const missing = (items: CheckItem[]) => items.filter((i) => !i.builtin && i.have < i.need)
