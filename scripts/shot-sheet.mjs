// 素材拼图截图：一页渲染一批素材（preview-asset.html 的拼图模式，见 src/preview-asset/sheet.ts），整库过一遍只要一百多张图。
//
// 用法（先 pnpm dev --port 5199）：
//   node scripts/shot-sheet.mjs --all                       全库，每张 20 件
//   node scripts/shot-sheet.mjs --match "^gd-"               按 id 正则
//   node scripts/shot-sheet.mjs --ids a,b,c                  点名
//   node scripts/shot-sheet.mjs --cat pets                   按分类
//   选项：--per 20（每张几件）  --cols 5  --cell 300  --color 0  --dir three  --inset back|none  --open（可开合的打开）  --innards（关着也画抽屉内部，对比用）
//         --from 0 --to 100（只截素材库下标区间）  --port 5199  --out <目录>（默认系统临时目录下 asset-sheets）  --name sheet
// 输出：<out>/<name>-0000.png … 和 <out>/<name>.json（每张图里依次是哪些 id、三角面数、实测包围盒）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, parseArgs, waitFor } from './cdp.mjs'

const args = parseArgs()
const port = args.port ?? 5199
const per = Number(args.per ?? 20)
const cols = Number(args.cols ?? 5)
const cell = Number(args.cell ?? 300)
const out = path.resolve(typeof args.out === 'string' ? args.out : path.join(os.tmpdir(), 'asset-sheets'))
const name = typeof args.name === 'string' ? args.name : 'sheet'
fs.mkdirSync(out, { recursive: true })

const base = new URLSearchParams({ cols: String(cols), cell: String(cell), c: String(args.color ?? 0), dir: String(args.dir ?? 'three'), inset: String(args.inset ?? 'back') })
if (args.open) base.set('open', '1')
if (args.innards) base.set('innards', '1')
if (typeof args.cat === 'string') base.set('cat', args.cat)
if (typeof args.match === 'string') base.set('match', args.match)

const ids = typeof args.ids === 'string' ? args.ids.split(',').filter(Boolean) : null
const from = Number(args.from ?? 0)

const b = await launch({ width: cols * cell, height: 900 })
const index = []
try {
  const open = async (params) => {
    const url = `http://localhost:${port}/preview-asset.html?${params}`
    await b.send('Page.navigate', { url })
    if (!(await waitFor(b, "document.body?.dataset?.ready === '1'", 120000))) {
      const overlay = await b.evaluate("document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0, 600) ?? document.title").catch(() => '')
      throw new Error(`拼图页没准备好：${url}\n${overlay}`)
    }
    return JSON.parse(await b.evaluate('JSON.stringify(window.__sheet)'))
  }
  const capture = async (sheet, n) => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: sheet.width, height: sheet.height, deviceScaleFactor: 1, mobile: false })
    // 改了视口尺寸后等两帧，让整张拼图重新合成上屏（否则偶尔截到空白）
    await b.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))')
    const png = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: sheet.width, height: sheet.height, scale: 1 } })
    const file = `${name}-${String(n).padStart(4, '0')}.png`
    fs.writeFileSync(path.join(out, file), Buffer.from(png.result.data, 'base64'))
    index.push({ file, ids: sheet.ids, info: sheet.info })
    console.log(file, sheet.ids[0], '…', sheet.ids.at(-1))
  }
  if (ids) {
    for (let i = 0, n = 0; i < ids.length; i += per, n++) {
      const p = new URLSearchParams(base)
      p.set('ids', ids.slice(i, i + per).join(','))
      await capture(await open(p), n)
    }
  } else {
    let total = Infinity
    const to = Math.min(Number(args.to ?? Infinity), Infinity)
    for (let i = from, n = Math.floor(from / per); i < Math.min(total, to); i += per, n++) {
      const p = new URLSearchParams(base)
      p.set('from', String(i))
      p.set('n', String(Math.min(per, to - i)))
      const sheet = await open(p)
      total = sheet.total
      if (!sheet.ids.length) break
      await capture(sheet, n)
    }
  }
  await new Promise((r) => setTimeout(r, 200))
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(index))
  console.log(`${index.length} 张 →`, out)
} finally {
  await b.close()
}
