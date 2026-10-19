// 墙面边饰的小预览图（墙纸面板用）：一截墙的正视图，按真实比例画踢脚线、腰壁（平板 / 竖向压条）、腰线压条和顶角线。
// 墙高按 240cm 画；预览图是竖长的（宽 : 高 = 3 : 4），墙纸颜色作底，边饰颜色和 3D 里一样。

import type { WallTrim } from '../model'
import { shade } from '../three/toon'

const WALL_H = 240
const cache = new Map<string, string>()

export function trimPreview(trim: WallTrim | undefined, wall: string, w = 42, h = 56) {
  const key = `${JSON.stringify(trim ?? null)}|${wall}|${w}x${h}`
  let url = cache.get(key)
  if (url) return url
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  const cv = document.createElement('canvas')
  cv.width = Math.round(w * dpr)
  cv.height = Math.round(h * dpr)
  const g = cv.getContext('2d')!
  g.scale(dpr, dpr)
  const y = (cm: number) => h - (cm / WALL_H) * h
  // 墙面，底下一条地板
  g.fillStyle = wall
  g.fillRect(0, 0, w, h)
  const floorH = 3
  if (trim?.wainscot) {
    const t = trim.wainscot
    const top = y(t.h)
    g.fillStyle = t.color
    g.fillRect(0, top, w, h - top)
    if (t.kind === 'batten') {
      g.fillStyle = shade(t.color, -0.1)
      for (let x = w / 8; x < w; x += w / 4) g.fillRect(Math.round(x), top, 1, h - top)
    }
    // 腰线压条
    g.fillStyle = shade(t.color, -0.07)
    g.fillRect(0, top - 1.5, w, 2.5)
    g.fillStyle = shade(t.color, 0.12)
    g.fillRect(0, top - 1.5, w, 0.8)
  }
  if (trim?.crown) {
    const b = Math.max(2.5, (trim.crown.h / WALL_H) * h * 1.6)
    g.fillStyle = trim.crown.color
    g.fillRect(0, 0, w, b)
    g.fillStyle = shade(trim.crown.color, -0.1)
    g.fillRect(0, b - 0.8, w, 0.8)
  }
  if (trim?.base) {
    const b = Math.max(2.5, (trim.base.h / WALL_H) * h * 1.6)
    g.fillStyle = trim.base.color
    g.fillRect(0, h - floorH - b, w, b)
    g.fillStyle = shade(trim.base.color, 0.12)
    g.fillRect(0, h - floorH - b, w, 0.8)
  }
  g.fillStyle = '#c9a77e'
  g.fillRect(0, h - floorH, w, floorH)
  url = cv.toDataURL()
  cache.set(key, url)
  return url
}
