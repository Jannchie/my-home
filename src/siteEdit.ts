// 户建外观的编辑对象（3D 沙盘里点中的围挡 / 车位上的车 / 屋顶 / 外墙）和编辑器共用的小工具。
// 编辑器组件 SiteEditor.vue 在浮动卡片和侧栏「外观」页里各用一份，逻辑都在这里或 store 的 setSite / setParking / setExterior。

import { CAR_KINDS, FACADE_KINDS, FENCE_KINDS, PORCH_KINDS, ROOF_COVERS, ROOF_KINDS, type CarKind, type Exterior, type FacadeKind, type FenceKind, type ParkingSpot, type Plan, type PorchKind, type RoofCover, type RoofKind } from './model'
import { FLAT_COVERS, PITCHED_COVERS, activeCover } from './roofCover'

/** 编辑对象：fence 围挡 / roof 屋顶 / facade 外墙（含入口）/ parking:i 第 i 个车位上的车 */
export type SiteTarget = 'fence' | 'roof' | 'facade' | `parking:${number}`

export const parkingTarget = (i: number): SiteTarget => `parking:${i}`

/** parking:i → i；别的对象返回 null */
export function parkingIndex(t: SiteTarget): number | null {
  if (!t.startsWith('parking:')) return null
  const i = Number(t.slice(8))
  return Number.isInteger(i) && i >= 0 ? i : null
}

/** 对象在这个户型里还在不在（撤销、换户型后可能没了） */
export function targetValid(p: Pick<Plan, 'site' | 'exterior'>, t: SiteTarget): boolean {
  if (t === 'fence') return !!p.site
  if (t === 'roof' || t === 'facade') return !!p.exterior
  const i = parkingIndex(t)
  return i !== null && !!p.site?.parking[i]
}

/** 户型里能编辑的全部对象（侧栏外观页的一览顺序） */
export function siteTargets(p: Pick<Plan, 'site' | 'exterior'>): SiteTarget[] {
  return [...(p.exterior ? (['roof', 'facade'] as const) : []), ...(p.site ? (['fence'] as const) : []), ...(p.site?.parking ?? []).map((_, i) => parkingTarget(i))]
}

/** 对象的标题（中文原文，模板里 t() 一下；车位有好几个时带编号） */
export function targetTitle(p: Pick<Plan, 'site'>, t: SiteTarget): { key: string; n?: number } {
  if (t === 'fence') return { key: '围挡' }
  if (t === 'roof') return { key: '屋顶' }
  if (t === 'facade') return { key: '外墙' }
  const i = parkingIndex(t) ?? 0
  return (p.site?.parking.length ?? 0) > 1 ? { key: '车位 {n}', n: i + 1 } : { key: '车位' }
}

// ---------- 车位上的车：「不停车」也是一个选项 ----------

export type CarChoice = CarKind | 'none'
export const CAR_DEFAULT_COLOR = '#d9534f'

export const carChoice = (sp: Pick<ParkingSpot, 'car' | 'carKind'>): CarChoice => (sp.car ? (sp.carKind ?? 'compact') : 'none')

/** 选了某个车型后要写进车位的补丁（compact 是缺省，不写字段；颜色没写过就补上缺省色） */
export function carPatch(choice: CarChoice, sp: Pick<ParkingSpot, 'carColor'>): Partial<Pick<ParkingSpot, 'car' | 'carKind' | 'carColor'>> {
  if (choice === 'none') return { car: undefined }
  return { car: true, carKind: choice === 'compact' ? undefined : choice, carColor: sp.carColor ?? CAR_DEFAULT_COLOR }
}

// ---------- 选项表 ----------

export const FENCE_CHOICES = Object.keys(FENCE_KINDS) as FenceKind[]
export const CAR_CHOICES: CarChoice[] = ['none', ...(Object.keys(CAR_KINDS) as CarKind[])]
export const ROOF_CHOICES = Object.keys(ROOF_KINDS) as RoofKind[]
export const FACADE_CHOICES = Object.keys(FACADE_KINDS) as FacadeKind[]
export const PORCH_CHOICES = Object.keys(PORCH_KINDS) as PorchKind[]
/** 屋面材料的选项：素面（不写字段）+ 这种屋顶能铺的材料 */
export type CoverChoice = RoofCover | 'plain'
export const coverChoices = (roof: RoofKind): CoverChoice[] => ['plain', ...(roof === 'flat' ? FLAT_COVERS : PITCHED_COVERS)]
/** 现在选中的是哪一项（没写、或和屋顶形式对不上都算素面） */
export const coverChoice = (ex: Pick<Exterior, 'roof' | 'roofCover'>): CoverChoice => activeCover(ex) ?? 'plain'
export const coverLabel = (c: CoverChoice) => (c === 'plain' ? '素面' : ROOF_COVERS[c])
export const carLabel = (c: CarChoice) => (c === 'none' ? '不停车' : CAR_KINDS[c])

export const ROOF_COLORS = ['#4f5866', '#3d4655', '#2f3540', '#686e76', '#6b4a3c', '#a35a46', '#4b5a4e', '#8fb3d9']
export const WALL_COLORS = ['#f2ede3', '#e7dfcf', '#efe7d6', '#d8d4cc', '#cdd6da', '#9aa0a6', '#5d6168', '#b5654c']
export const TRIM_COLORS = ['#ffffff', '#e9e4d8', '#9c7a56', '#5a4a3e', '#3a3f45', '#7a3b2e']
export const FENCE_COLORS = ['#7fa86b', '#b48f68', '#d3cbbd', '#b9bab4', '#f4f1ea', '#a65a48', '#4b4f55', '#2f3338']
export const CAR_COLORS = ['#d9534f', '#f2f2f2', '#a3a8ad', '#2f3338', '#3b5b8c', '#9fb8a0', '#e6c35c', '#7a4a8c']

/**
 * 滑杆的撤销：一次拖动只记一步。按下（pointerdown）或第一次 input 时 checkpoint，
 * 之后的 input 不再记；change / 松手时 settle（没变就丢掉刚记的那步）。键盘方向键改值也只记一步。
 */
export function liveEdit(checkpoint: () => void, settle: () => void) {
  let open = false
  return {
    begin() {
      if (open) return
      checkpoint()
      open = true
    },
    end() {
      if (!open) return
      open = false
      settle()
    },
    get open() {
      return open
    },
  }
}
