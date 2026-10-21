// 墙上的设备摆在哪：每扇门旁边（门把手一侧）离地 125 的灯开关，两侧房间各一个；
// LDK 门边的可视对讲 + 热水器遥控（日本住宅的标配位置），浴室门内的浴室遥控，玄关门外的门铃。
// 默认按门自动摆、画在房子里（house.ts buildWallDevices）。对讲和遥控面板可以「接管」成挂墙家具（素材 packs/wall-devices.ts）：
// 沙盘里点中自动画的那台，全屋的对讲、遥控面板就按现在的位置换成家具（Plan.devicesAsFurniture），之后和别的壁挂物一样
// 选中、沿墙拖动、删掉，位置记进存档。手动从素材库摆了同款的，那一款也不再自动画。灯开关、门铃跟着门走，不接管。

import { add, mul, rotFacingWall, uid, type Furniture, type Plan, type Vec } from '../model'
import { isIndoor } from '../walls'
import { floorViews, perFloorFurniture } from '../floors'
import { ASSET_MAP } from './assets'
import { openingInfos, roomAt, type OpeningInfo } from './house'

export type WallDeviceKind = 'switch' | 'intercom' | 'heater-remote' | 'bath-remote' | 'doorbell'

/** 一台设备：装在洞口 info 旁边，side 指向设备所在的房间，沿墙离洞口中心 along，离地 y（模型的安装高度） */
export interface WallDeviceSpot {
  kind: WallDeviceKind
  info: OpeningInfo
  side: Vec
  along: number
  y: number
}

/** 能接管成家具的设备 → 素材 */
export const DEVICE_ASSET: Partial<Record<WallDeviceKind, string>> = {
  intercom: 'wd-intercom',
  'heater-remote': 'wd-heater-remote',
  'bath-remote': 'wd-bath-remote',
}

/** 自动摆的设备（已经接管、或者手动摆了同款家具的不算） */
export function wallDeviceSpots(plan: Plan, infos: OpeningInfo[]): WallDeviceSpot[] {
  const out: WallDeviceSpot[] = []
  const placed = new Set<string>()
  const roomOnSide = (info: OpeningInfo, side: Vec) => roomAt(plan, add(info.center, mul(side, info.wall / 2 + 20)))
  for (const info of infos) {
    if (info.o.kind === 'window') continue
    // 门把手一侧：开门在铰链对侧，推拉门放在门框右侧
    const latch = info.o.kind === 'door' ? (info.o.hinge === 'start' ? 1 : -1) : 1
    const along = latch * (info.width / 2 + 10)
    for (const sgn of [-1, 1]) {
      const side = mul(info.out, sgn)
      const room = roomOnSide(info, side)
      if (!room) {
        // 户外一侧：玄关大门外装门铃；同一位置已经装了可视门铃（素材 hc-doorbell-*，一键布置或手动摆的）就不画默认门铃
        if (info.owner.kind === 'entrance' && info.outer) {
          const p = add(add(info.center, mul(info.dir, along + 6)), mul(side, info.wall / 2))
          if (!plan.furniture.some((f) => f.asset.startsWith('hc-doorbell') && Math.hypot(f.x - p.x, f.y - p.y) < 40)) out.push({ kind: 'doorbell', info, side, along: along + 6, y: 145 })
        }
        continue
      }
      if (!isIndoor(room) || room.kind === 'storage') continue
      const key = `${room.id}|${Math.round(info.center.x)},${Math.round(info.center.y)}`
      if (placed.has(key)) continue
      placed.add(key)
      out.push({ kind: 'switch', info, side, along, y: 125 })
      if (room.kind === 'ldk' && !placed.has('intercom')) {
        placed.add('intercom')
        out.push({ kind: 'intercom', info, side, along: along + latch * 20, y: 150 })
        out.push({ kind: 'heater-remote', info, side, along: along + latch * 36, y: 150 })
      }
      if (room.kind === 'bath' && !placed.has('bath-remote')) {
        placed.add('bath-remote')
        out.push({ kind: 'bath-remote', info, side, along: along + latch * 14, y: 110 })
      }
    }
  }
  const owned = ownedDeviceKinds(plan)
  return out.filter((s) => !owned.has(s.kind))
}

/** 不再自动摆的设备：全屋接管了的，或者（这一层）摆了同款家具的 */
function ownedDeviceKinds(plan: Plan) {
  const kinds = Object.keys(DEVICE_ASSET) as WallDeviceKind[]
  return new Set(plan.devicesAsFurniture ? kinds : kinds.filter((k) => plan.furniture.some((f) => f.asset === DEVICE_ASSET[k])))
}

/** 各层不自动摆哪些设备的指纹（接管了、摆了同款家具都会变）：变了房子要重建 */
export const wallDeviceKey = (plan: Plan) => floorViews(plan).map(({ view }) => [...ownedDeviceKinds(view)].join(',')).join('|')

/** 设备换成家具时的摆放：背面贴墙面、朝向房间（同 snap.ts snapToWall） */
function deviceFurniture(s: WallDeviceSpot): Furniture | null {
  const asset = DEVICE_ASSET[s.kind]
  const def = asset ? ASSET_MAP.get(asset) : undefined
  if (!asset || !def) return null
  const c = add(add(s.info.center, mul(s.info.dir, s.along)), mul(s.side, s.info.wall / 2 + def.d / 2))
  return { id: uid('u'), asset, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, rot: rotFacingWall(mul(s.side, -1)) }
}

/**
 * 接管：全屋自动摆的对讲、遥控面板按现在的位置换成挂墙家具（就地改 plan），以后不再自动摆。返回新加的家具。
 */
export function takeOverDevices(plan: Plan): Furniture[] {
  if (plan.devicesAsFurniture) return []
  const made = perFloorFurniture(plan, (view) => wallDeviceSpots(view, openingInfos(view)).flatMap((s) => deviceFurniture(s) ?? []))
  plan.furniture.push(...made)
  plan.devicesAsFurniture = true
  return made
}
