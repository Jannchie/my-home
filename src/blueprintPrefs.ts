// 3D 设计图的开关与画法设置（纸面、家具、墙体、正交 / 透视、单位、楼层排法）。
// 设置单独存一个键（不进户型数据）；「开着设计图」不存，每次打开沙盘都从普通视图开始。

import { reactive, watch } from 'vue'
import type { FloorLayout, FurnitureShow, Paper, WallShow } from './three/blueprint'
import { unitFor, type DimUnit } from './dimensions'
import type { Plan } from './model'

const KEY = 'my-home:blueprint'

export type UnitPref = 'auto' | DimUnit

export const blueprint = reactive({
  on: false,
  paper: 'white' as Paper,
  furniture: 'all' as FurnitureShow,
  walls: 'cut' as WallShow,
  ortho: true,
  unit: 'auto' as UnitPref,
  layout: 'explode' as FloorLayout,
})

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)

try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
  if (raw && typeof raw === 'object') {
    blueprint.paper = pick(raw.paper, ['white', 'blue'], 'white')
    blueprint.furniture = pick(raw.furniture, ['all', 'large', 'none'], 'all')
    blueprint.walls = pick(raw.walls, ['cut', 'full'], 'cut')
    blueprint.ortho = raw.ortho !== false
    blueprint.unit = pick(raw.unit, ['auto', 'mm', 'cm'], 'auto')
    blueprint.layout = pick(raw.layout, ['stack', 'explode'], 'explode')
  }
} catch {
  /* 存储不可用或数据损坏时用默认值 */
}

watch(
  () => [blueprint.paper, blueprint.furniture, blueprint.walls, blueprint.ortho, blueprint.unit, blueprint.layout],
  () => {
    try {
      const { on: _on, ...rest } = blueprint
      void _on
      localStorage.setItem(KEY, JSON.stringify(rest))
    } catch {
      /* 存储不可用时忽略 */
    }
  },
)

/** 实际用的单位：自动 = 按户型地区（欧美 cm，其余 mm） */
export const unitOf = (p: Pick<Plan, 'region'>): DimUnit => (blueprint.unit === 'auto' ? unitFor(p.region) : blueprint.unit)
