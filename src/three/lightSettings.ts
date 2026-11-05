// 灯光设置的取值范围和默认值（不依赖 three.js）：store 存档校验、检查器滑杆用；lights.ts 原样转出。

export type LightMode = 'auto' | 'on' | 'off'
export const LIGHT_MODES: LightMode[] = ['auto', 'on', 'off']
export const KELVIN_MIN = 2700
export const KELVIN_MAX = 6500
export const DEFAULT_KELVIN = 4000

export const isLightMode = (v: unknown): v is LightMode => v === 'auto' || v === 'on' || v === 'off'
export const clampKelvin = (k: number) => Math.round(Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, k)) / 100) * 100

/** 全局亮度（%）的范围 */
export const POWER_MIN = 30
export const POWER_MAX = 160
export const DEFAULT_POWER = 100

/** 全局照明范围（%）的范围 */
export const RANGE_MIN = 50
export const RANGE_MAX = 250
export const DEFAULT_RANGE = 100
/** 室外光（天光、阳光、月光）强度（%）的范围：调低后室内主要靠灯照明，灯的影子更清楚 */
export const OUTDOOR_MIN = 0
export const OUTDOOR_MAX = 150
export const DEFAULT_OUTDOOR = 100
