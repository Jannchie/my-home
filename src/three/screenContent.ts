// 屏幕画面预设：显示器、电视、笔记本、平板、一体机上显示什么（写代码、打游戏、追剧、修图…）。
// 家具的 screen 字段存预设 id，不填 = 素材自带的画面。屏幕画面在 screens.ts bakeScreens 里烘成贴图，
// 给了预设就不画素材自带的那些发光小片，改用这里按屏幕比例现画一张（同一预设、同样尺寸的屏幕共用一张）。
// 一键布置按屏幕主人的职业、兴趣、性格挑画面（workstation.ts screenContents）。

import type { AssetDef } from './kit'
import { hasTag } from './tags'

export interface ScreenPreset {
  id: string
  label: string
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number): void
}

/** 能换画面的素材：有屏幕面板的（显示器、电视、一体机），以及笔记本、平板 */
export const hasScreen = (d: AssetDef | undefined) => !!d && (!!d.screens?.length || hasTag(d, 'laptop', 'tablet', 'tv', 'monitor', 'aio-pc'))

const rect = (ctx: CanvasRenderingContext2D, fill: string, x: number, y: number, w: number, h: number, r = 0) => {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}
const dot = (ctx: CanvasRenderingContext2D, fill: string, x: number, y: number, r: number) => {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
/** 一行行「文字」：横条，长度随机 */
function lines(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number, colors: string[], indent = false) {
  const lh = Math.max(3, h / 14)
  let col = 0
  for (let yy = y + lh * 0.6; yy + lh * 0.5 < y + h; yy += lh * 1.6) {
    if (rand() < 0.12) continue
    if (indent) col = Math.max(0, Math.min(3, col + (rand() < 0.3 ? 1 : rand() < 0.3 ? -1 : 0)))
    let xx = x + col * lh * 1.4
    const parts = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < parts && xx < x + w; i++) {
      const lw = Math.min(x + w - xx, w * (0.08 + rand() * 0.28))
      rect(ctx, colors[Math.floor(rand() * colors.length)], xx, yy, lw, lh * 0.7, lh * 0.3)
      xx += lw + lh * 0.8
    }
  }
}
/** 窗口标题栏 + 三个圆点 */
function titleBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bar: string) {
  rect(ctx, bar, x, y, w, h)
  for (const [i, c] of ['#ff6b6b', '#ffc94d', '#6bd68a'].entries()) dot(ctx, c, x + h * (0.7 + i * 0.75), y + h / 2, h * 0.22)
}
/** 起伏的山 / 地面轮廓 */
function hills(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number, fill: string, amp: number) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  const n = 6
  const ph = rand() * 6
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    ctx.lineTo(x + t * w, y + h * (1 - amp) + Math.sin(t * n + ph) * h * amp * 0.5 + Math.sin(t * 17 + ph * 2) * h * amp * 0.15)
  }
  ctx.lineTo(x + w, y + h)
  ctx.fill()
}
/** 一个小人头像（视频会议、直播小窗） */
function face(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, skin: string, hair: string, shirt: string) {
  rect(ctx, bg, x, y, w, h)
  const s = Math.min(w, h)
  dot(ctx, shirt, x + w / 2, y + h + s * 0.12, s * 0.42)
  dot(ctx, hair, x + w / 2, y + h * 0.45 - s * 0.04, s * 0.22)
  dot(ctx, skin, x + w / 2, y + h * 0.47, s * 0.19)
}

export const SCREEN_PRESETS: ScreenPreset[] = [
  {
    id: 'code',
    label: '写代码',
    draw(ctx, W, H, rand) {
      rect(ctx, '#1e2230', 0, 0, W, H)
      rect(ctx, '#171a25', 0, 0, W * 0.17, H)
      lines(ctx, rand, W * 0.02, H * 0.04, W * 0.13, H * 0.9, ['#5b6378', '#7a839a'])
      rect(ctx, '#262b3b', W * 0.17, 0, W, H * 0.06)
      rect(ctx, '#1e2230', W * 0.18, 0, W * 0.14, H * 0.06)
      lines(ctx, rand, W * 0.2, H * 0.08, W * 0.76, H * 0.68, ['#c792ea', '#82aaff', '#c3e88d', '#ffcb6b', '#89ddff', '#a6accd'], true)
      rect(ctx, '#11131b', W * 0.17, H * 0.76, W, H * 0.24)
      lines(ctx, rand, W * 0.19, H * 0.78, W * 0.6, H * 0.2, ['#c3e88d', '#a6accd'])
    },
  },
  {
    id: 'terminal',
    label: '终端',
    draw(ctx, W, H, rand) {
      rect(ctx, '#0d1117', 0, 0, W, H)
      titleBar(ctx, 0, 0, W, H * 0.07, '#21262d')
      lines(ctx, rand, W * 0.03, H * 0.1, W * 0.9, H * 0.86, ['#3fb950', '#3fb950', '#8b949e', '#d29922'])
      rect(ctx, '#3fb950', W * 0.03, H * 0.9, W * 0.025, H * 0.04)
    },
  },
  {
    id: 'sheet',
    label: '表格',
    draw(ctx, W, H, rand) {
      rect(ctx, '#ffffff', 0, 0, W, H)
      rect(ctx, '#1f7a4d', 0, 0, W, H * 0.08)
      rect(ctx, '#eef3ef', 0, H * 0.08, W, H * 0.07)
      const cols = 7
      const rows = 12
      const y0 = H * 0.17
      const ch = (H * 0.8) / rows
      ctx.fillStyle = '#d7dde0'
      for (let i = 0; i <= cols; i++) ctx.fillRect((W * i) / cols, y0, 1, H)
      for (let j = 0; j <= rows; j++) ctx.fillRect(0, y0 + j * ch, W, 1)
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) if (rand() < 0.7) rect(ctx, j === 0 ? '#1f7a4d' : i === 0 ? '#5c6670' : '#9aa5ad', (W * i) / cols + 3, y0 + j * ch + ch * 0.3, (W / cols) * (0.3 + rand() * 0.5), ch * 0.4, 1)
      // 一块柱状图
      const bx = W * 0.6
      const by = H * 0.45
      rect(ctx, '#ffffff', bx, by, W * 0.36, H * 0.42)
      for (let i = 0; i < 6; i++) {
        const bh = H * 0.36 * (0.25 + rand() * 0.75)
        rect(ctx, i % 2 ? '#4f9e5b' : '#82c785', bx + W * (0.02 + i * 0.055), by + H * 0.4 - bh, W * 0.04, bh)
      }
    },
  },
  {
    id: 'design',
    label: '设计稿',
    draw(ctx, W, H, rand) {
      rect(ctx, '#2c2c2c', 0, 0, W, H)
      rect(ctx, '#383838', 0, 0, W, H * 0.06)
      rect(ctx, '#383838', 0, H * 0.06, W * 0.14, H)
      rect(ctx, '#383838', W * 0.82, H * 0.06, W * 0.18, H)
      lines(ctx, rand, W * 0.015, H * 0.09, W * 0.11, H * 0.85, ['#8a8a8a', '#b3b3b3'])
      lines(ctx, rand, W * 0.835, H * 0.09, W * 0.15, H * 0.4, ['#8a8a8a', '#b3b3b3'])
      for (const [i, c] of ['#ff7262', '#a259ff', '#1abcfe', '#0acf83', '#f24e1e'].entries()) rect(ctx, c, W * (0.84 + (i % 3) * 0.05), H * (0.6 + Math.floor(i / 3) * 0.08), W * 0.04, H * 0.06, 2)
      // 画板：一张海报 + 一个手机页面
      rect(ctx, '#f6efe4', W * 0.18, H * 0.14, W * 0.36, H * 0.74)
      rect(ctx, '#ffb38a', W * 0.21, H * 0.2, W * 0.3, H * 0.34, 4)
      dot(ctx, '#ffe08f', W * 0.42, H * 0.3, H * 0.07)
      lines(ctx, rand, W * 0.21, H * 0.58, W * 0.3, H * 0.26, ['#3d3f44', '#8c8f96'])
      rect(ctx, '#ffffff', W * 0.6, H * 0.16, W * 0.17, H * 0.7, 6)
      rect(ctx, '#a259ff', W * 0.61, H * 0.2, W * 0.15, H * 0.16, 4)
      lines(ctx, rand, W * 0.615, H * 0.4, W * 0.14, H * 0.4, ['#c4c4c4', '#8c8f96'])
      ctx.strokeStyle = '#1abcfe'
      ctx.lineWidth = Math.max(1, W / 300)
      ctx.strokeRect(W * 0.6, H * 0.16, W * 0.17, H * 0.7)
    },
  },
  {
    id: 'photo',
    label: '修图',
    draw(ctx, W, H, rand) {
      rect(ctx, '#2b2b2e', 0, 0, W, H)
      rect(ctx, '#1f1f22', W * 0.8, 0, W * 0.2, H)
      const x = W * 0.05
      const y = H * 0.08
      const w = W * 0.71
      const h = H * 0.84
      const sky = ctx.createLinearGradient(0, y, 0, y + h)
      sky.addColorStop(0, '#ffb07a')
      sky.addColorStop(0.6, '#ffd9a8')
      sky.addColorStop(1, '#f8e8c8')
      ctx.fillStyle = sky
      ctx.fillRect(x, y, w, h)
      dot(ctx, '#fff4d6', x + w * 0.66, y + h * 0.45, h * 0.1)
      hills(ctx, rand, x, y, w, h, '#7a6c8f', 0.45)
      hills(ctx, rand, x, y, w, h, '#4a4a6a', 0.28)
      // 直方图 + 调节滑杆
      ctx.fillStyle = '#8a8a90'
      for (let i = 0; i < 30; i++) {
        const v = Math.exp(-((i - 18) ** 2) / 60) * 0.8 + rand() * 0.2
        ctx.fillRect(W * (0.82 + i * 0.005), H * (0.2 - v * 0.12), W * 0.004, H * v * 0.12)
      }
      for (let i = 0; i < 6; i++) {
        rect(ctx, '#55555a', W * 0.82, H * (0.3 + i * 0.1), W * 0.16, H * 0.012)
        dot(ctx, '#e0e0e0', W * (0.84 + rand() * 0.12), H * (0.306 + i * 0.1), H * 0.015)
      }
    },
  },
  {
    id: 'game',
    label: '游戏',
    draw(ctx, W, H, rand) {
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#5ec8ff')
      sky.addColorStop(1, '#c9f1ff')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)
      for (let i = 0; i < 4; i++) {
        const cx = W * rand()
        const cy = H * (0.1 + rand() * 0.25)
        for (let k = 0; k < 3; k++) dot(ctx, '#ffffff', cx + k * H * 0.06, cy + (k % 2) * H * 0.02, H * 0.045)
      }
      hills(ctx, rand, 0, 0, W, H, '#86d47a', 0.4)
      hills(ctx, rand, 0, 0, W, H, '#4fae5c', 0.22)
      // 角色、金币、HUD
      rect(ctx, '#ff6b6b', W * 0.3, H * 0.62, W * 0.05, H * 0.12, 3)
      dot(ctx, '#ffd6b0', W * 0.325, H * 0.58, H * 0.05)
      for (let i = 0; i < 5; i++) dot(ctx, '#ffd23f', W * (0.45 + i * 0.06), H * 0.5, H * 0.025)
      rect(ctx, '#00000066', W * 0.02, H * 0.03, W * 0.3, H * 0.08, 4)
      rect(ctx, '#ff4d6d', W * 0.035, H * 0.05, W * 0.2, H * 0.04, 2)
      rect(ctx, '#00000066', W * 0.82, H * 0.03, W * 0.16, H * 0.22, 4)
      dot(ctx, '#ffd23f', W * 0.9, H * 0.14, H * 0.015)
    },
  },
  {
    id: 'stream',
    label: '直播',
    draw(ctx, W, H, rand) {
      rect(ctx, '#18181b', 0, 0, W, H)
      // 主画面：游戏
      const gx = W * 0.02
      const gy = H * 0.04
      const gw = W * 0.7
      const gh = H * 0.72
      rect(ctx, '#3a2a6b', gx, gy, gw, gh)
      hills(ctx, rand, gx, gy, gw, gh, '#7b4fd6', 0.5)
      hills(ctx, rand, gx, gy, gw, gh, '#ff4fa3', 0.25)
      face(ctx, gx + gw * 0.74, gy + gh * 0.66, gw * 0.24, gh * 0.32, '#2d2d35', '#ffd6b0', '#3d2b25', '#9147ff')
      rect(ctx, '#eb0400', gx + gw * 0.02, gy + gh * 0.04, gw * 0.08, gh * 0.07, 3)
      // 聊天栏
      rect(ctx, '#1f1f23', W * 0.74, 0, W * 0.26, H)
      lines(ctx, rand, W * 0.755, H * 0.04, W * 0.23, H * 0.86, ['#9147ff', '#00c8af', '#ff7f50', '#efeff1', '#adadb8'])
      lines(ctx, rand, W * 0.02, H * 0.8, W * 0.5, H * 0.16, ['#efeff1', '#adadb8'])
    },
  },
  {
    id: 'video',
    label: '追剧',
    draw(ctx, W, H, rand) {
      rect(ctx, '#000000', 0, 0, W, H)
      const y = H * 0.08
      const h = H * 0.84
      const sky = ctx.createLinearGradient(0, y, 0, y + h)
      sky.addColorStop(0, '#2b3a67')
      sky.addColorStop(1, '#f2a65a')
      ctx.fillStyle = sky
      ctx.fillRect(0, y, W, h)
      dot(ctx, '#fff1c1', W * 0.7, y + h * 0.35, h * 0.08)
      hills(ctx, rand, 0, y, W, h, '#2a2440', 0.35)
      // 两个人物剪影
      for (const [x, s] of [[0.32, 1], [0.44, 0.9]] as const) {
        rect(ctx, '#15121f', W * x, y + h * (0.55 - 0.1 * s), W * 0.07 * s, h * 0.45, W * 0.02)
        dot(ctx, '#15121f', W * (x + 0.035 * s), y + h * (0.5 - 0.1 * s), h * 0.07 * s)
      }
      // 字幕 + 进度条
      rect(ctx, '#ffffff', W * 0.35, y + h * 0.84, W * 0.3, h * 0.035, 2)
      rect(ctx, '#ffffff44', W * 0.05, y + h * 0.95, W * 0.9, h * 0.012)
      rect(ctx, '#e50914', W * 0.05, y + h * 0.95, W * (0.15 + rand() * 0.6), h * 0.012)
    },
  },
  {
    id: 'anime',
    label: '动画',
    draw(ctx, W, H, rand) {
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#7fc8ff')
      sky.addColorStop(1, '#fff0f5')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)
      for (let i = 0; i < 18; i++) dot(ctx, '#ffc0d4', W * rand(), H * rand() * 0.8, H * 0.012)
      hills(ctx, rand, 0, 0, W, H, '#b9e3a5', 0.25)
      // 大头角色：头发、脸、大眼睛
      const cx = W * 0.55
      const cy = H * 0.55
      const r = H * 0.22
      dot(ctx, '#6b4c9a', cx, cy - r * 0.15, r * 1.12)
      dot(ctx, '#ffe2cf', cx, cy, r)
      for (const s of [-1, 1]) {
        dot(ctx, '#3b2a5a', cx + s * r * 0.38, cy + r * 0.05, r * 0.2)
        dot(ctx, '#ffffff', cx + s * r * 0.33, cy - r * 0.02, r * 0.07)
        dot(ctx, '#ffb3c7', cx + s * r * 0.6, cy + r * 0.35, r * 0.1)
      }
      rect(ctx, '#6b4c9a', cx - r * 1.1, cy - r * 1.05, r * 2.2, r * 0.6, r * 0.3)
      rect(ctx, '#ffffff', W * 0.3, H * 0.88, W * 0.4, H * 0.04, 2)
    },
  },
  {
    id: 'meeting',
    label: '视频会议',
    draw(ctx, W, H) {
      rect(ctx, '#202124', 0, 0, W, H)
      const people = [
        ['#3c4043', '#ffd6b0', '#3d2b25', '#4f7cff'],
        ['#2f3b35', '#e8b48f', '#1f1a17', '#c94f4f'],
        ['#3b3346', '#ffe2cf', '#c9a25a', '#3fa66b'],
        ['#33404a', '#c68b62', '#2b2b2b', '#e0a526'],
      ] as const
      const gw = W * 0.47
      const gh = H * 0.41
      people.forEach(([bg, skin, hair, shirt], i) => face(ctx, W * (0.02 + (i % 2) * 0.49), H * (0.03 + Math.floor(i / 2) * 0.44), gw, gh, bg, skin, hair, shirt))
      rect(ctx, '#2d2e31', 0, H * 0.9, W, H * 0.1)
      for (let i = 0; i < 4; i++) dot(ctx, i === 3 ? '#ea4335' : '#5f6368', W * (0.4 + i * 0.065), H * 0.95, H * 0.03)
    },
  },
  {
    id: 'music',
    label: '编曲',
    draw(ctx, W, H, rand) {
      rect(ctx, '#232629', 0, 0, W, H)
      rect(ctx, '#2f3337', 0, 0, W, H * 0.08)
      rect(ctx, '#2a2d31', 0, H * 0.08, W * 0.15, H)
      const tracks = ['#ff8a65', '#ffd54f', '#81c784', '#64b5f6', '#ba68c8', '#4dd0e1']
      const th = (H * 0.86) / tracks.length
      tracks.forEach((c, i) => {
        const y = H * 0.1 + i * th
        rect(ctx, c, W * 0.01, y + th * 0.2, W * 0.025, th * 0.6, 2)
        lines(ctx, () => 0.5, W * 0.045, y + th * 0.2, W * 0.09, th * 0.5, ['#8a9096'])
        let x = W * 0.16
        while (x < W * 0.97) {
          const cw = W * (0.06 + rand() * 0.18)
          if (rand() < 0.75) {
            rect(ctx, c + '55', x, y + th * 0.12, Math.min(cw, W * 0.97 - x), th * 0.76, 3)
            ctx.fillStyle = c
            for (let k = 0; k < cw; k += Math.max(2, W / 200)) {
              const a = (0.15 + rand() * 0.7) * th * 0.35
              ctx.fillRect(x + k, y + th / 2 - a, Math.max(1, W / 400), a * 2)
            }
          }
          x += cw + W * 0.01
        }
      })
      rect(ctx, '#ff5252', W * (0.3 + rand() * 0.4), H * 0.08, Math.max(1, W / 300), H)
    },
  },
  {
    id: 'web',
    label: '网页',
    draw(ctx, W, H, rand) {
      rect(ctx, '#ffffff', 0, 0, W, H)
      rect(ctx, '#e8eaed', 0, 0, W, H * 0.07)
      rect(ctx, '#ffffff', W * 0.15, H * 0.015, W * 0.6, H * 0.04, H * 0.02)
      rect(ctx, '#3d5a80', 0, H * 0.07, W, H * 0.08)
      rect(ctx, '#f2c14e', W * 0.06, H * 0.2, W * 0.42, H * 0.36, 3)
      dot(ctx, '#ffffff99', W * 0.2, H * 0.32, H * 0.06)
      lines(ctx, rand, W * 0.06, H * 0.6, W * 0.42, H * 0.36, ['#202124', '#5f6368', '#5f6368'])
      for (let i = 0; i < 3; i++) {
        rect(ctx, ['#98c1d9', '#ee6c4d', '#a6e3cc'][i], W * 0.54, H * (0.2 + i * 0.26), W * 0.14, H * 0.2, 3)
        lines(ctx, rand, W * 0.7, H * (0.2 + i * 0.26), W * 0.25, H * 0.2, ['#202124', '#5f6368'])
      }
    },
  },
  {
    id: 'stocks',
    label: '行情',
    draw(ctx, W, H, rand) {
      rect(ctx, '#0b0e14', 0, 0, W, H)
      ctx.fillStyle = '#1c2230'
      for (let i = 1; i < 6; i++) ctx.fillRect(0, (H * i) / 6, W * 0.78, 1)
      let v = H * 0.5
      const n = 40
      const cw = (W * 0.76) / n
      for (let i = 0; i < n; i++) {
        const o = v
        v = Math.max(H * 0.12, Math.min(H * 0.85, v + (rand() - 0.52) * H * 0.08))
        const up = v < o
        const c = up ? '#26a69a' : '#ef5350'
        rect(ctx, c, W * 0.01 + i * cw + cw * 0.45, Math.min(o, v) - H * 0.02, Math.max(1, cw * 0.1), Math.abs(o - v) + H * 0.04)
        rect(ctx, c, W * 0.01 + i * cw + cw * 0.15, Math.min(o, v), cw * 0.7, Math.max(2, Math.abs(o - v)))
      }
      rect(ctx, '#131722', W * 0.79, 0, W * 0.21, H)
      for (let i = 0; i < 12; i++) {
        const up = rand() < 0.5
        rect(ctx, '#b2b5be', W * 0.8, H * (0.04 + i * 0.08), W * 0.07, H * 0.03, 2)
        rect(ctx, up ? '#26a69a' : '#ef5350', W * 0.9, H * (0.04 + i * 0.08), W * 0.08, H * 0.03, 2)
      }
    },
  },
  {
    id: 'reading',
    label: '电子书',
    draw(ctx, W, H, rand) {
      rect(ctx, '#f4ecd8', 0, 0, W, H)
      const two = W > H * 1.2
      for (const k of two ? [0, 1] : [0]) {
        const x = two ? W * (0.06 + k * 0.5) : W * 0.1
        const w = two ? W * 0.38 : W * 0.8
        rect(ctx, '#5b4636', x + w * 0.3, H * 0.07, w * 0.4, H * 0.03, 2)
        lines(ctx, rand, x, H * 0.14, w, H * 0.8, ['#5b4636', '#5b4636', '#7d6553'])
      }
    },
  },
  {
    id: 'wallpaper',
    label: '桌面壁纸',
    draw(ctx, W, H, rand) {
      const sky = ctx.createLinearGradient(0, 0, W, H)
      sky.addColorStop(0, '#a18cd1')
      sky.addColorStop(1, '#fbc2eb')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)
      hills(ctx, rand, 0, 0, W, H, '#8f7ad0aa', 0.45)
      hills(ctx, rand, 0, 0, W, H, '#6c5bb8', 0.25)
      for (let i = 0; i < 4; i++) rect(ctx, '#ffffffcc', W * 0.02, H * (0.04 + i * 0.11), H * 0.08, H * 0.08, H * 0.02)
      rect(ctx, '#ffffff99', W * 0.3, H * 0.92, W * 0.4, H * 0.06, H * 0.03)
      for (let i = 0; i < 6; i++) rect(ctx, ['#ff8a65', '#4fc3f7', '#81c784', '#ffd54f', '#ba68c8', '#e0e0e0'][i], W * (0.32 + i * 0.062), H * 0.93, H * 0.04, H * 0.04, H * 0.01)
    },
  },
  {
    id: 'off',
    label: '关着',
    draw(ctx, W, H) {
      rect(ctx, '#0c0d10', 0, 0, W, H)
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#ffffff10')
      g.addColorStop(0.5, '#ffffff00')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    },
  },
]

export const SCREEN_PRESET_MAP = new Map(SCREEN_PRESETS.map((p) => [p.id, p]))

/** 在预设列表里往前 / 往后轮一个（不填 = 原画面，排在最前） */
export function cycleScreen(cur: string | undefined, dir: 1 | -1) {
  const ids = [undefined, ...SCREEN_PRESETS.map((p) => p.id)]
  const i = Math.max(0, ids.indexOf(cur))
  return ids[(i + dir + ids.length) % ids.length]
}
