// 全屋检查清单：按房间用途和住户设定列出必要的东西，看看缺了什么；每一项都可以一键补上。

import { sharedIntervals } from './walls'
import { edgesOf, pointInPolygon, type Furniture, type Plan, type Room } from './model'
import { ASSET_MAP, type AssetDef } from './three/assets'
import { JOBS, type Household } from './household'
import { hasTag, type Sel, type Tag } from './three/tags'

/** 补救动作：交给 decorate.ts 的 applyFixes 执行；sel 是要补的素材（语义标签或点名的 id，见 three/tags.ts） */
export type Fix =
  | { how: 'wall'; sel: Sel; prop?: boolean } // 靠墙放一件
  | { how: 'mount'; sel: Sel } // 挂到墙上
  | { how: 'scatter'; sel: Sel } // 摆到房间里的台面 / 层板上
  | { how: 'fixture'; sel: Sel; fixture: 'kitchen' | 'basin' | 'washer' | 'toilet' } // 摆到设备台面上
  | { how: 'aircon' } // 挂空调（内机 + 外机朝向）
  | { how: 'appliance'; kind: 'fridge' | 'washer' } // 冰箱 / 洗衣机：放到空着的冰箱位 / 洗衣机位上，没有位就靠墙放
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

const inRoom = (plan: Plan, room: Room) => plan.furniture.filter((f) => pointInPolygon(f, room.points))
/** 有这些标签（任一）的家具件数 */
function count(list: Furniture[], tags: Tag | readonly Tag[], filter: (d: AssetDef) => boolean = () => true) {
  const ts = typeof tags === 'string' ? [tags] : tags
  return countIf(list, (d) => hasTag(d, ...ts) && filter(d))
}
function countIf(list: Furniture[], ok: (d: AssetDef) => boolean) {
  return list.filter((f) => {
    const d = ASSET_MAP.get(f.asset)
    return !!d && ok(d)
  }).length
}
const windowsOf = (plan: Plan, room: Room) => plan.openings.filter((o) => o.roomId === room.id && o.kind === 'window').length

/** 各项「有没有」按语义标签数 */
const TAGS = {
  aircon: 'aircon',
  bed: 'legacy-cl-bed',
  closet: ['wardrobe', 'dresser', 'clothes-rail'],
  lamp: 'lamp',
  sofa: 'sofa',
  tv: 'tv',
  dining: 'dining-table',
  chair: 'dining-seat',
  microwave: 'microwave',
  rice: 'rice-cooker',
  kettle: 'legacy-cl-kettle',
  shoeCab: 'shoe-storage',
  umbrella: 'umbrella-stand',
  shoes: 'shoe',
  detergent: 'detergent',
  scale: 'legacy-cl-scale',
  softener: 'softener',
  towel: 'towel',
  dryer: 'hair-dryer',
  toothbrush: 'toothbrush',
  shampoo: 'shampoo',
  bodySoap: 'body-soap',
  bathStool: 'bath-stool',
  bucket: 'bucket',
  toiletPaper: 'toilet-paper',
  toiletBrush: 'toilet-brush',
  laundryStand: 'laundry-stand',
  desk: 'legacy-cl-desk',
  crib: 'crib',
  catTower: 'cat-tower',
  litter: 'litter-box',
} satisfies Record<string, Tag | Tag[]>

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
      if (region !== 'west') item(r, '空调', count(f, TAGS.aircon), 1, { how: 'aircon' })
      if (windowsOf(plan, r) && r.kind !== 'japanese') item(r, '窗帘', r.curtain === false ? 0 : 1, 1, undefined, r.curtain !== false)
      item(r, '开关', 1, 1, undefined, true)
    }
    if (r.kind === 'western' || r.kind === 'japanese') {
      item(r, '照明（台灯 / 落地灯）', count(f, TAGS.lamp), 1, { how: 'scatter', sel: 'legacy-cl-lamp-fix' })
      // 和房间共墙的收纳间（クローゼット、押入れ、WIC）或房间里的壁内收纳就算有衣物收纳
      const closetRoom = plan.rooms.some((o) => o.kind === 'storage' && edgesOf(r.points).some((e) => sharedIntervals(e, o).length > 0))
      const builtinCloset = plan.fixtures.some((x) => x.kind === 'builtin' && x.builtinType === 'closet' && pointInPolygon(x, r.points))
      item(r, '衣物收纳', count(f, TAGS.closet) + (closetRoom || builtinCloset ? 1 : 0), 1, { how: 'wall', sel: /^(wardrobe$|dresser$|be-|sf-garment-rail|.*clothes-rail|.*chest)/ })
    }
    if (r.kind === 'ldk') {
      item(r, '沙发', count(f, TAGS.sofa), 1, { how: 'wall', sel: /^sofa2$/ })
      item(r, '电视', count(f, TAGS.tv), 1, { how: 'scatter', sel: /^prop-tv-43/ })
      if (!diningRoom) item(r, '餐桌', count(f, TAGS.dining), 1, { how: 'wall', sel: /^dining-table$/ })
      item(r, '可视对讲 / 热水器遥控', 1, 1, undefined, true)
    }
    if (r.kind === 'dining') item(r, '餐桌', count(f, TAGS.dining), 1, { how: 'wall', sel: /^dining-table$/ })
    if (r.kind === 'ldk' || r.kind === 'kitchen') {
      const hasKitchen = plan.fixtures.some((x) => x.kind === 'kitchen' && pointInPolygon(x, r.points))
      if (hasKitchen) {
        // 冰箱是家具：全屋有一台就行（中式厨房小，冰箱常放在餐厅）
        item(r, '冰箱', countIf(all, (d) => d.family === 'fridge'), 1, { how: 'appliance', kind: 'fridge' })
        item(r, '微波炉', count(all, TAGS.microwave), 1, { how: 'fixture', sel: /^prop-microwave/, fixture: 'kitchen' })
        item(r, '电饭煲', count(all, TAGS.rice), 1, { how: 'fixture', sel: /^prop-rice-cooker$/, fixture: 'kitchen' })
        item(r, '电水壶', count(all, TAGS.kettle), 1, { how: 'fixture', sel: /^prop-kettle$/, fixture: 'kitchen' })
      }
    }
    if (r.kind === 'entrance' && region !== 'west') {
      const builtinShoe = plan.fixtures.filter((x) => x.kind === 'builtin' && (x.builtinType ?? 'shoe') === 'shoe' && pointInPolygon(x, r.points)).length
      // 玄关太小时鞋架、伞架会放到相邻的走廊里，也算
      const fe = [...f, ...plan.rooms.filter((o) => o.kind === 'hall' && edgesOf(r.points).some((e) => sharedIntervals(e, o).length > 0)).flatMap((o) => inRoom(plan, o))]
      item(r, '鞋柜 / 鞋架', count(fe, TAGS.shoeCab) + builtinShoe, 1, { how: 'wall', sel: /^shoe-cabinet$/ })
      item(r, '伞架', count(fe, TAGS.umbrella), 1, { how: 'wall', sel: /^umbrella-stand$/ })
      item(r, '鞋子', count(f, TAGS.shoes, (d) => !!d.prop), 1, { how: 'scatter', sel: 'legacy-cl-shoe-fix' })
    }
    const hasFx = (kind: string) => plan.fixtures.some((x) => x.kind === kind && pointInPolygon(x, r.points))
    if (r.kind === 'wash' && region !== 'jp') {
      // 欧美的 Laundry：只看洗衣用品
      item(r, '洗衣液', count(f, TAGS.detergent), 1, { how: 'fixture', sel: 'legacy-cl-detergent-fix', fixture: 'washer' })
      if (hasFx('basin')) item(r, '毛巾', count(f, TAGS.towel), 1, { how: 'scatter', sel: 'towel' })
    } else if (r.kind === 'wash') {
      item(r, '洗衣液', count(f, TAGS.detergent), 1, { how: 'fixture', sel: 'legacy-cl-detergent-fix', fixture: 'washer' })
      item(r, '柔软剂', count(f, TAGS.softener), 1, { how: 'fixture', sel: 'softener', fixture: 'washer' })
      item(r, '牙刷杯', count(f, TAGS.toothbrush), 1, { how: 'fixture', sel: 'toothbrush', fixture: 'basin' })
      item(r, '毛巾', count(f, TAGS.towel), 1, { how: 'scatter', sel: 'towel' })
      item(r, '吹风机', count(f, TAGS.dryer), 1, { how: 'scatter', sel: 'hair-dryer' })
      // 体重秤全屋有一台就行（放卧室、更衣间也算）
      item(r, '体重秤', count(all, TAGS.scale), 1, { how: 'wall', sel: /^(wet-body-scale|scale-glass|scale-round)$/ })
    }
    if (r.kind === 'bath') {
      item(r, '洗发水', count(f, TAGS.shampoo), 1, { how: 'scatter', sel: /^wet-shampoo$/ })
      item(r, '沐浴露', count(f, TAGS.bodySoap), 1, { how: 'scatter', sel: /^wet-body-soap$/ })
      if (region === 'jp') {
        item(r, '浴凳', count(f, TAGS.bathStool), 1, { how: 'wall', sel: 'bath-stool' })
        item(r, '洗面桶', count(f, TAGS.bucket), 1, { how: 'wall', sel: 'bucket' })
        item(r, '浴室遥控', 1, 1, undefined, true)
      } else if (hasFx('basin')) {
        item(r, '牙刷杯', count(f, TAGS.toothbrush), 1, { how: 'fixture', sel: 'toothbrush', fixture: 'basin' })
        item(r, '毛巾', count(f, TAGS.towel), 1, { how: 'scatter', sel: 'towel' })
      }
    }
    if (r.kind === 'toilet' || (r.kind === 'bath' && plan.fixtures.some((x) => x.kind === 'toilet' && pointInPolygon(x, r.points)))) {
      item(r, '卷纸架', 1, 1, undefined, true)
      item(r, '备用卷纸', count(f, TAGS.toiletPaper), 1, { how: 'fixture', sel: 'toilet-paper', fixture: 'toilet' })
      item(r, '马桶刷', count(f, TAGS.toiletBrush), 1, { how: 'wall', sel: 'toilet-brush' })
    }
    if (r.kind === 'balcony') {
      // 晾衣：日式每个阳台；中式只看生活阳台（没有就看景观阳台）；欧美 Patio 不晒衣服（有烘干机）
      if (region === 'jp' || (region === 'cn' && (serviceBalcony ?? firstBalcony) === r)) item(r, '晾衣架', region === 'cn' ? count(plan.rooms.filter((o) => o.kind === 'balcony').flatMap((o) => inRoom(plan, o)), TAGS.laundryStand) : count(f, TAGS.laundryStand), 1, { how: 'wall', sel: /^laundry-stand$/ })
      const ac = count(all, TAGS.aircon)
      // 外机数只在第一个阳台上列一次（中式两个阳台不重复报）
      if (ac && region !== 'west' && r === firstBalcony) item(r, `空调外机（对应 ${ac} 台室内机）`, plan.fixtures.filter((x) => x.kind === 'outdoor').length, ac, { how: 'outdoor' })
    }
  }

  // 洗衣机（家具）：有洗衣机位或洗面所的户型全屋要有一台
  if (plan.fixtures.some((x) => x.kind === 'washer') || plan.rooms.some((r) => r.kind === 'wash')) item(null, '洗衣机', countIf(all, (d) => d.family === 'washer'), 1, { how: 'appliance', kind: 'washer' })

  // ---------- 住户相关 ----------
  if (hh) {
    const sleepers = hh.members.filter((m) => m.role !== 'partner').length
    item(null, `床（${hh.members.length} 人）`, count(all, TAGS.bed), sleepers, { how: 'bed' })
    const chairs = plan.rooms.filter((r) => r.kind === 'ldk' || r.kind === 'kitchen' || r.kind === 'dining').reduce((s, r) => s + count(inRoom(plan, r), TAGS.chair), 0)
    if (count(all, TAGS.dining)) item(null, `餐椅（${hh.members.length} 人）`, chairs, hh.members.length, { how: 'chairs' })
    const deskUsers = hh.members.filter((m) => JOBS[m.job].wfh || m.job === 'student' || m.job === 'schoolkid').length
    if (deskUsers) item(null, '书桌（在家工作 / 学习的人）', count(all, TAGS.desk, (d) => !d.prop && !!d.surface), deskUsers, { how: 'desk' })
    if (hh.members.some((m) => m.age < 3)) item(null, '婴儿床', count(all, TAGS.crib), 1, { how: 'wall', sel: /^kid-crib/ })
    if (hh.members.some((m) => m.interests.includes('cats'))) {
      item(null, '猫爬架', count(all, TAGS.catTower), 1, { how: 'wall', sel: /^cat-tower$/ })
      item(null, '猫砂盆', count(all, TAGS.litter), 1, { how: 'wall', sel: 'litter-box' })
    }
  }
  return out
}

export const missing = (items: CheckItem[]) => items.filter((i) => !i.builtin && i.have < i.need)
