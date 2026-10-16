// 逐帧录制宣传片：无头 Chromium 打开 promo.html，按固定步长调用 window.__promo.frame(t)，
// 每帧 CDP 截图后直接喂给 ffmpeg（不落地中间帧），最后混入 BGM。
//
// 用法（先 pnpm promo:build && pnpm promo:preview，默认录 http://localhost:5302；--port 5301 可直接录开发服务器）：
//   node scripts/record-promo.mjs --w 1920 --h 1080 --fps 60 --out promo-1080p.mp4 --audio bgm.wav
//   node scripts/record-promo.mjs --w 960 --h 540 --fps 30 --out preview.mp4 --fast       # 低分辨率样片（JPEG 截图）
//   node scripts/record-promo.mjs --w 1920 --h 1080 --stills 1,6,15 --dir shots          # 只截几张关键帧
//   可选：--from 10 --to 20 只录一段；--url 指定页面地址
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { launch } from './cdp.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
    return acc
  }, []),
)
const W = +(args.w ?? 1920)
const H = +(args.h ?? 1080)
const FPS = +(args.fps ?? 60)
const URL = args.url ?? `http://localhost:${args.port ?? 5302}/promo.html?lang=zh`
const fast = !!args.fast

const b = await launch({ width: W, height: H, port: +(args.cdp ?? 9350) + Math.floor(Math.random() * 40) })
await b.send('Page.navigate', { url: URL })
for (let i = 0; i < 600; i++) {
  const ok = await b.evaluate('!!window.__promo').catch(() => false)
  if (ok) break
  await new Promise((r) => setTimeout(r, 250))
}
const t0 = Date.now()
await b.evaluate('window.__promo.ready')
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const duration = await b.evaluate('window.__promo.duration')
// 页面若中途重载（开发服务器热更新），录下来的帧就不连续了：每秒检查一次，发现就中止
const origin = await b.evaluate('performance.timeOrigin')
const checkOrigin = async () => {
  if ((await b.evaluate('performance.timeOrigin').catch(() => -1)) !== origin) {
    console.error('\n页面中途重载了，录制中止（用 pnpm promo:build + promo:preview 录正式版）')
    await b.close()
    process.exit(1)
  }
}

async function grab(format) {
  const r = await b.send('Page.captureScreenshot', format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 93 })
  return Buffer.from(r.result.data, 'base64')
}

if (args.stills) {
  const dir = args.dir ?? '.'
  fs.mkdirSync(dir, { recursive: true })
  const times = String(args.stills).split(',').map(Number)
  for (const t of times) {
    // 先从前一点开始走几帧，让带状态的东西（墙体渐变、猫）走到位
    for (let k = 12; k >= 1; k--) await b.evaluate(`window.__promo.frame(${Math.max(0, t - k / 30)})`)
    await b.evaluate(`window.__promo.frame(${t})`)
    const f = path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`)
    fs.writeFileSync(f, await grab('png'))
    console.log(f)
  }
  await b.close()
  process.exit(0)
}

const from = +(args.from ?? 0)
const to = Math.min(+(args.to ?? duration), duration)
const out = args.out ?? 'promo.mp4'
const n = Math.round((to - from) * FPS)
const ff = spawn(
  'ffmpeg',
  [
    '-y',
    '-loglevel', 'error',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-c:v', fast ? 'mjpeg' : 'png',
    '-i', '-',
    ...(args.audio ? ['-ss', String(from), '-i', args.audio] : []),
    '-c:v', 'libx264',
    '-preset', fast ? 'veryfast' : 'slow',
    '-crf', fast ? '22' : '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    ...(args.audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)
const tStart = Date.now()
for (let i = 0; i < n; i++) {
  const t = from + i / FPS
  await b.evaluate(`window.__promo.frame(${t})`)
  const img = await grab(fast ? 'jpeg' : 'png')
  if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r))
  if (i % FPS === 0) {
    await checkOrigin()
    const el = (Date.now() - tStart) / 1000
    process.stdout.write(`\r${t.toFixed(1)}s / ${to}s  ${(el / (i + 1) * 1000).toFixed(0)}ms/frame  eta ${((n - i) * el / (i + 1) / 60).toFixed(1)}min   `)
  }
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
console.log(`\n${out}  ${n} frames  ${((Date.now() - tStart) / 1000).toFixed(0)}s`)
await b.close()
