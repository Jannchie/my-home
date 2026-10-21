// 3D LUT 调色（画面效果 LookDef.lut，「手游风」用）：参数式调色（post.ts 的 Grade）只能整体调曝光、对比、饱和、冷暖，
// 游戏的调色还会按色相分别处理——天空的蓝更饱和、往青偏一点，草木的绿往黄绿偏、更鲜，木头和皮肤的暖色更暖，
// 暗部带一点蓝紫、亮部带一点暖。这些写成一个 sRGB → sRGB 的函数，烘成 32³ 的 3D 贴图，Grade 里查一次表。
// 在 OKLab（感知均匀的色彩空间）里调：亮度、色度、色相分开动，调色相不会顺带改亮度。

import * as THREE from 'three'

export const LUT_SIZE = 32

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB（0–1）→ OKLab */
export function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = toLin(r)
  const G = toLin(g)
  const B = toLin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

/** OKLab → sRGB（0–1，超出色域的夹回去） */
export function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const c = (x: number) => Math.min(1, Math.max(0, toSrgb(Math.min(1, Math.max(0, x)))))
  return [c(R), c(G), c(B)]
}

/** 色相（度）离某个中心多近：高斯权重，width 是标准差（度） */
function near(h: number, center: number, width: number) {
  let d = Math.abs(h - center) % 360
  if (d > 180) d = 360 - d
  return Math.exp(-((d / width) ** 2))
}

/** 每段色相：中心（OKLab 色相角，度）、色度倍数、色相偏移（度） */
const BANDS: { h: number; w: number; chroma: number; shift: number }[] = [
  // 木色、橙、肤色：更暖、稍浓
  { h: 60, w: 22, chroma: 1.08, shift: -4 },
  // 草木的绿：往黄绿偏、更鲜
  { h: 140, w: 26, chroma: 1.14, shift: -8 },
  // 天空、水的蓝：更饱和、往青偏一点
  { h: 240, w: 30, chroma: 1.18, shift: -10 },
  // 品红、紫：稍收
  { h: 330, w: 25, chroma: 0.94, shift: 0 },
]

/** 「手游风」的调色函数：sRGB → sRGB */
export function gameGrade(r: number, g: number, b: number): [number, number, number] {
  let [L, A, B] = srgbToOklab(r, g, b)
  // 轻微的 S 曲线（中间调对比），黑白位不动
  const s = L * L * (3 - 2 * L)
  L = L + (s - L) * 0.22
  let C = Math.hypot(A, B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360
  let k = 1.04
  let dh = 0
  for (const band of BANDS) {
    const w = near(h, band.h, band.w)
    k *= 1 + (band.chroma - 1) * w
    dh += band.shift * w
  }
  // 接近灰的颜色色相不稳定，不动色相
  dh *= Math.min(1, C / 0.03)
  C *= k
  h += dh
  A = C * Math.cos((h * Math.PI) / 180)
  B = C * Math.sin((h * Math.PI) / 180)
  // 分离色调：暗部偏蓝紫、亮部偏暖（OKLab 的 b 轴：负 = 蓝，正 = 黄）
  const shade = (1 - Math.min(1, L / 0.6)) ** 2
  // 亮部偏暖在接近纯白时收掉：白墙、白光还是白的
  const high = Math.max(0, (L - 0.55) / 0.45) ** 2 * (1 - Math.min(1, Math.max(0, (L - 0.88) / 0.12)))
  A += 0.006 * shade
  B += -0.022 * shade + 0.014 * high
  return oklabToSrgb(L, A, B)
}

const cache = new Map<string, THREE.Data3DTexture>()

/** 把调色函数烘成 3D 贴图（按 id 缓存）：R 沿 x、G 沿 y、B 沿 z，取样时按 (c × (N-1) + 0.5) / N 对准格子中心 */
export function lutTexture(id: string, fn: (r: number, g: number, b: number) => [number, number, number] = gameGrade) {
  let t = cache.get(id)
  if (t) return t
  const N = LUT_SIZE
  const data = new Uint8Array(N * N * N * 4)
  let i = 0
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const [r, g, b] = fn(x / (N - 1), y / (N - 1), z / (N - 1))
        data[i++] = Math.round(r * 255)
        data[i++] = Math.round(g * 255)
        data[i++] = Math.round(b * 255)
        data[i++] = 255
      }
  t = new THREE.Data3DTexture(data, N, N, N)
  t.format = THREE.RGBAFormat
  t.type = THREE.UnsignedByteType
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping
  t.unpackAlignment = 1
  t.needsUpdate = true
  cache.set(id, t)
  return t
}
