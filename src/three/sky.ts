// 3D 沙盘的「时间与太阳」：按 时刻 + 日期 + 经纬度 + 户型朝向 算出太阳方位，再连续地调出
// 太阳光 / 月光、天光、背景渐变和「入夜程度」（灯具、屏幕、窗户亮起来）。
//
// 太阳位置用 SunCalc 的近似公式（赤纬、时角 → 高度角、方位角），精度在 1° 以内，对布光足够。
// 时刻按所选城市的标准时（不含夏令时）理解；手动输入经纬度时时区取 round(经度 / 15)。

import * as THREE from 'three'

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

// ---------- 太阳位置（SunCalc） ----------

const RAD = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545

/**
 * 太阳的高度角与方位角（弧度）。
 * azimuth 按 SunCalc 的约定：从正南起算，向西为正；换成「从正北顺时针」的方位要 + π。
 */
export function sunPosition(utcMs: number, lat: number, lon: number) {
  const d = utcMs / DAY_MS - 0.5 + J1970 - J2000
  const M = RAD * (357.5291 + 0.98560028 * d) // 平近点角
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) // 中心差
  const L = M + C + RAD * 102.9372 + Math.PI // 黄经
  const e = RAD * 23.4397 // 黄赤交角
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) // 赤纬
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L)) // 赤经
  const phi = RAD * lat
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra // 时角 = 恒星时 - 赤经
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))
  return { altitude, azimuth }
}

/** 所选城市当地时刻对应的 UTC 毫秒（年份固定，只看月日） */
export function localToUtc(time: number, month: number, day: number, geo: Geo) {
  return Date.UTC(2026, month - 1, day) + (time - geo.tz) * 3600000
}

// ---------- 光照 ----------

export interface SkyState {
  /** 太阳（或月亮）所在方向，世界坐标单位向量，指向光源 */
  lightDir: THREE.Vector3
  lightColor: THREE.Color
  lightIntensity: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiIntensity: number
  /** 背景径向渐变：中心 / 中段 / 边缘（sRGB hex） */
  bg: [string, string, string]
  /** 入夜程度 0（白天）~ 1（深夜）：灯具、屏幕、窗户亮起来，泛光加强 */
  night: number
  /** 太阳高度角（度），用于界面显示 */
  altitude: number
  /** 太阳方位（度，从正北顺时针） */
  bearing: number
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 四个关键状态：白天 / 金色时刻 / 蓝调时刻 / 夜晚 */
const KEYS = {
  day: { bg: ['#fdfdfb', '#f1f3ef', '#e3e9e5'], sky: '#fff6e8', ground: '#e8dfd2', hemi: 1.5 },
  golden: { bg: ['#fff5ea', '#fbe3cf', '#ecc9b9'], sky: '#ffe4c8', ground: '#dcc4b2', hemi: 1.3 },
  blue: { bg: ['#d6d2e6', '#aeb0cf', '#7f88ad'], sky: '#9c9cc4', ground: '#5c5c74', hemi: 0.8 },
  night: { bg: ['#2d3a57', '#1f2840', '#141a2b'], sky: '#56669a', ground: '#262c40', hemi: 0.5 },
}

function mixHex(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
}

/** 世界坐标里「正北」「正东」的水平方向。平面图 y 对应 3D z；north 为平面图上北方相对「上方」顺时针的角度 */
export function compassAxes(northDeg: number) {
  const a = northDeg * RAD
  return { n: new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), e: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) }
}

export function skyState(time: number, month: number, day: number, geo: Geo, northDeg: number): SkyState {
  const { altitude, azimuth } = sunPosition(localToUtc(time, month, day, geo), geo.lat, geo.lon)
  const h = altitude / RAD
  const bearing = azimuth + Math.PI
  const { n, e } = compassAxes(northDeg)

  // 关键状态之间的权重：白天 ← 24°～4° → 金色 ← 1° → 蓝调 ← -6° → 夜晚 ← -12°
  const tDay = smooth(4, 24, h)
  const tGold = smooth(-6, 1, h)
  const tBlue = smooth(-12, -6, h)
  const pick = <T,>(f: (k: (typeof KEYS)['day']) => T, mix: (a: T, b: T, t: number) => T) =>
    mix(mix(mix(f(KEYS.night), f(KEYS.blue), tBlue), f(KEYS.golden), tGold), f(KEYS.day), tDay)
  const lerpN = (a: number, b: number, t: number) => a + (b - a) * t
  const bg = [0, 1, 2].map((i) => pick((k) => k.bg[i], mixHex)) as [string, string, string]

  // 太阳在地平线以上（含一点暮光余量）用太阳，以下换成月亮；交接处两者强度都接近 0，看不出跳变
  const sunUp = h > -3
  let lightDir: THREE.Vector3
  let lightColor: THREE.Color
  let lightIntensity: number
  if (sunUp) {
    const alt = Math.max(altitude, 2 * RAD) // 贴地时别让阴影拉到无限长
    lightDir = n.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(e, Math.sin(bearing)).multiplyScalar(Math.cos(alt)).setY(Math.sin(alt)).normalize()
    lightColor = new THREE.Color(mixHex(mixHex('#ff7a4a', '#ffb070', smooth(-2, 4, h)), '#fff3df', smooth(4, 28, h)))
    lightIntensity = 2.0 * smooth(-3, 12, h)
  } else {
    // 月光：简化成与太阳相对、固定 50° 高度的冷色弱光
    const alt = 50 * RAD
    const b = bearing + Math.PI
    lightDir = n.clone().multiplyScalar(Math.cos(b)).addScaledVector(e, Math.sin(b)).multiplyScalar(Math.cos(alt)).setY(Math.sin(alt)).normalize()
    lightColor = new THREE.Color('#a9b9ff')
    lightIntensity = 0.5 * (1 - smooth(-9, -3, h))
  }

  return {
    lightDir,
    lightColor,
    lightIntensity,
    hemiSky: new THREE.Color(pick((k) => k.sky, mixHex)),
    hemiGround: new THREE.Color(pick((k) => k.ground, mixHex)),
    hemiIntensity: pick((k) => k.hemi, lerpN),
    bg,
    night: 1 - smooth(-6, 3, h),
    altitude: h,
    bearing: ((bearing / RAD) % 360 + 360) % 360,
  }
}

/** 一年里每月的天数（月日选择用，不考虑闰年） */
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
