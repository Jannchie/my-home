// 日照计算用的城市预设和经纬度（不依赖 three.js）：store 存档校验、设置面板用；sky.ts 原样转出。

export interface Geo {
  /** 城市预设 id，手动输入时为 'custom' */
  id: string
  lat: number
  lon: number
  /** 标准时区（小时） */
  tz: number
}

/** label 是中文原文，显示时过 t() */
export const CITIES: (Geo & { label: string })[] = [
  { id: 'tokyo', label: '东京', lat: 35.68, lon: 139.69, tz: 9 },
  { id: 'osaka', label: '大阪', lat: 34.69, lon: 135.5, tz: 9 },
  { id: 'sapporo', label: '札幌', lat: 43.06, lon: 141.35, tz: 9 },
  { id: 'naha', label: '那霸', lat: 26.21, lon: 127.68, tz: 9 },
  { id: 'shanghai', label: '上海', lat: 31.23, lon: 121.47, tz: 8 },
  { id: 'beijing', label: '北京', lat: 39.9, lon: 116.4, tz: 8 },
  { id: 'taipei', label: '台北', lat: 25.03, lon: 121.56, tz: 8 },
  { id: 'seoul', label: '首尔', lat: 37.57, lon: 126.98, tz: 9 },
  { id: 'newyork', label: '纽约', lat: 40.71, lon: -74.01, tz: -5 },
  { id: 'london', label: '伦敦', lat: 51.51, lon: -0.13, tz: 0 },
  { id: 'paris', label: '巴黎', lat: 48.86, lon: 2.35, tz: 1 },
  { id: 'sydney', label: '悉尼', lat: -33.87, lon: 151.21, tz: 10 },
]
export const DEFAULT_GEO: Geo = { id: 'tokyo', lat: 35.68, lon: 139.69, tz: 9 }
