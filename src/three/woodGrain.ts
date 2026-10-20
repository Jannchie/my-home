// 木地板贴图：一张图 = 240cm 见方，12 条 20cm 宽的地板，每条长短不一、错缝铺；
// 每块板的底色深浅略有不同，板面有顺着长边流动的木纹（直纹 + 山形纹），板与板之间一条深色的缝、缝边一道浅色的倒角高光。
// 参考手绘室内背景里的木地板：板缝清楚、每块板能分得出来，木纹淡淡的、不抢画面。

import { shade as toonShade } from './toon'
import { rng } from './kit'

/** 调深浅、饱和度：这些随机色不是配色槽，不登记来源 */
const shade = (color: string, dl: number, ds = 0) => toonShade(color, dl, ds, false)

/** 一张贴图覆盖的边长（cm） */
export const PLANK_TILE = 240
const ROWS = 12

const hashStr = (str: string) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 在 s×s 的画布上画满地板（横向铺，贴图横向重复也接得上：每行的板长加起来正好一圈） */
export function drawPlanks(g: CanvasRenderingContext2D, s: number, base: string, line: string) {
  const rand = rng(hashStr(base))
  // 色调表里的缝线色只比底色深一点：缝要再深一些才看得清
  line = shade(line, -0.16, 0.05)
  const h = s / ROWS
  const px = s / PLANK_TILE
  g.fillStyle = base
  g.fillRect(0, 0, s, s)
  for (let r = 0; r < ROWS; r++) {
    const y0 = r * h
    // 这一行的接缝位置（一圈 240cm 里 2–3 条缝，板长 60–150cm），起点随机错开
    const n = rand() < 0.5 ? 2 : 3
    const cuts: number[] = []
    let u = rand() * s
    for (let k = 0; k < n; k++) {
      cuts.push(u % s)
      u += (s / n) * (0.75 + rand() * 0.5)
    }
    cuts.sort((a, b) => a - b)
    for (let k = 0; k < cuts.length; k++) {
      const a = cuts[k]
      const b = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + s
      plank(g, s, a, y0, b - a, h, shade(base, (rand() - 0.5) * 0.07, (rand() - 0.5) * 0.06), rand, px)
    }
    // 长边的缝：深色缝 + 下沿一道浅色倒角
    g.fillStyle = line
    g.globalAlpha = 0.95
    g.fillRect(0, y0, s, Math.max(1, 0.35 * px))
    g.globalAlpha = 0.25
    g.fillStyle = '#ffffff'
    g.fillRect(0, y0 + 0.35 * px, s, Math.max(1, 0.3 * px))
    g.globalAlpha = 1
    // 端头的缝
    g.fillStyle = line
    for (const c of cuts) {
      g.globalAlpha = 0.9
      g.fillRect(c - 0.15 * px, y0, Math.max(1, 0.3 * px), h)
      g.globalAlpha = 0.2
      g.fillStyle = '#ffffff'
      g.fillRect(c + 0.15 * px, y0, Math.max(1, 0.25 * px), h)
      g.fillStyle = line
    }
    g.globalAlpha = 1
  }
}

/** 一块板：底色、顺纹、山形纹；横向超出画布的部分绕回左边画（贴图左右接得上） */
function plank(g: CanvasRenderingContext2D, s: number, x: number, y: number, w: number, h: number, color: string, rand: () => number, px: number) {
  for (const off of [0, -s]) {
    if (x + off > s || x + off + w < 0) continue
    g.save()
    g.beginPath()
    g.rect(x + off, y, w, h)
    g.clip()
    g.fillStyle = color
    g.fillRect(x + off, y, w, h)
    grain(g, x + off, y, w, h, color, rand, px)
    g.restore()
  }
}

/** 木纹：用固定种子重放，两次绕回画出来一样 */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rand: () => number, px: number) {
  const seed = Math.floor(rand() * 1e9)
  const r = rng(seed)
  const dark = shade(color, -0.09, 0.04)
  const light = shade(color, 0.05)
  // 顺纹：几条细长、微微起伏的线
  const lines = 5 + Math.floor(r() * 4)
  for (let i = 0; i < lines; i++) {
    const yy = y + (0.1 + 0.8 * r()) * h
    const amp = (0.3 + r() * 0.8) * px
    const freq = (1 + r() * 2) / Math.max(1, w)
    const ph = r() * 6.28
    g.strokeStyle = r() < 0.7 ? dark : light
    g.globalAlpha = 0.18 + r() * 0.22
    g.lineWidth = Math.max(0.6, (0.12 + r() * 0.2) * px)
    g.beginPath()
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const xx = x + t * w
      const yv = yy + Math.sin(ph + t * w * freq * 6.28) * amp
      if (t === 0) g.moveTo(xx, yv)
      else g.lineTo(xx, yv)
    }
    g.stroke()
  }
  // 山形纹（弦切面的拱形年轮）：一半的板有，一组套着的抛物线
  if (r() < 0.55) {
    const cx = x + (0.25 + 0.5 * r()) * w
    const cy = y + (0.3 + 0.4 * r()) * h
    const len = (0.25 + 0.3 * r()) * w
    const dir = r() < 0.5 ? 1 : -1
    const rings = 3 + Math.floor(r() * 3)
    g.strokeStyle = dark
    for (let k = 0; k < rings; k++) {
      const sp = (k + 1) / rings
      const half = h * (0.12 + 0.36 * sp)
      const L = len * (0.4 + 0.6 * sp)
      g.globalAlpha = 0.16 + 0.14 * (1 - sp)
      g.lineWidth = Math.max(0.6, 0.18 * px)
      g.beginPath()
      g.moveTo(cx - dir * L * 1.6, cy - half)
      g.quadraticCurveTo(cx + dir * L, cy - half * 0.95, cx + dir * L, cy)
      g.quadraticCurveTo(cx + dir * L, cy + half * 0.95, cx - dir * L * 1.6, cy + half)
      g.stroke()
    }
  }
  g.globalAlpha = 1
}
