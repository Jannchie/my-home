// 调深浅 / 饱和度（shade）的纯计算版：和 three.js 的 Color 完全一致（sRGB 十六进制 → 线性工作空间里的 HSL 调整 → 回 sRGB），
// 但不依赖 three.js，平面图那侧（自动墙纸等）也能用。toon.ts 的 shade 在它外面再记一笔来源（材质标注用）。
// 和 three 的结果逐个比对见 test/shade.spec.ts。

const toLinear = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4))
const toSrgb = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t)
  return p
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** '#rgb' / '#rrggbb' → 六位小写十六进制（不带 #）；不是十六进制返回 null */
export function hex6(color: string): string | null {
  const m = HEX.exec(color.trim())
  if (!m) return null
  const h = m[1].toLowerCase()
  return h.length === 3 ? h.replace(/./g, (c) => c + c) : h
}

/**
 * 十六进制颜色的明度加 dl、饱和度加 ds（都在 three.js 线性工作空间的 HSL 里算），返回六位十六进制（不带 #）。
 * 输入不是十六进制返回 null（调用方另行处理）
 */
export function shadeHex(color: string, dl: number, ds = 0): string | null {
  const h = hex6(color)
  if (!h) return null
  const n = parseInt(h, 16)
  const r = toLinear(((n >> 16) & 255) / 255)
  const g = toLinear(((n >> 8) & 255) / 255)
  const b = toLinear((n & 255) / 255)
  // getHSL
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l0 = (min + max) / 2
  let hue = 0
  let sat = 0
  if (min !== max) {
    const d = max - min
    sat = l0 <= 0.5 ? d / (max + min) : d / (2 - max - min)
    hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    hue /= 6
  }
  // setHSL
  const s = clamp(clamp(sat + ds, 0, 1), 0, 1)
  const l = clamp(clamp(l0 + dl, 0, 1), 0, 1)
  hue = ((hue % 1) + 1) % 1
  let rr = l
  let gg = l
  let bb = l
  if (s !== 0) {
    const p = l <= 0.5 ? l * (1 + s) : l + s - l * s
    const q = 2 * l - p
    rr = hue2rgb(q, p, hue + 1 / 3)
    gg = hue2rgb(q, p, hue)
    bb = hue2rgb(q, p, hue - 1 / 3)
  }
  // getHexString
  const byte = (c: number) => Math.round(clamp(toSrgb(c) * 255, 0, 255))
  return ('000000' + (byte(rr) * 65536 + byte(gg) * 256 + byte(bb)).toString(16)).slice(-6)
}

/** 平面图侧用的 shade：返回 '#rrggbb'（输入不是十六进制时原样返回） */
export const shadeColor = (color: string, dl: number, ds = 0) => {
  const out = shadeHex(color, dl, ds)
  return out ? '#' + out : color
}
