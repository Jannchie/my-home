// 素材外观检查：一个无头浏览器连续打开素材预览页（preview-asset.html），按 素材 × 配色 × 角度 截图，
// 每件素材拼成一张对照图（行 = 配色，列 = 角度），方便一眼看出穿模、悬空、错位、缺件。
//
// 用法（先 pnpm dev）：
//   node scripts/shot-asset.mjs --ids fp-cat-post,fp-music-stand
//   node scripts/shot-asset.mjs --ids fp-ladder-desk --colors all --dirs three,back,side
//   选项：--port 5199  --colors 0 | 0,2 | all（默认 0）  --dirs three,front,back（可选 front three left back side top）
//         --size 480（单格边长）  --out <目录>（默认系统临时目录下 asset-shots）  --sheet false（只存单张，不拼图）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, parseArgs, waitFor } from './cdp.mjs'

const args = parseArgs()
if (typeof args.ids !== 'string') throw new Error('用 --ids 指定素材 id（逗号分隔）')
const ids = args.ids.split(',').filter(Boolean)
const port = args.port ?? 5199
const dirs = String(args.dirs ?? 'three,front,back').split(',')
const cell = Number(args.size ?? 480)
const out = path.resolve(typeof args.out === 'string' ? args.out : path.join(os.tmpdir(), 'asset-shots'))
const sheet = args.sheet !== 'false'
fs.mkdirSync(out, { recursive: true })

const b = await launch({ width: cell, height: cell })
try {
  /** 打开一格并截图，返回 PNG 的 base64 */
  async function shot(id, c, dir) {
    const url = `http://localhost:${port}/preview-asset.html?id=${encodeURIComponent(id)}&c=${c}&dir=${dir}`
    await b.send('Page.navigate', { url })
    if (!(await waitFor(b, "document.body?.dataset?.ready === '1'", 30000))) {
      const overlay = await b.evaluate("document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0, 600) ?? document.title").catch(() => '')
      throw new Error(`预览页没准备好：${url}\n${overlay}`)
    }
    const shot = await b.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    return shot.result.data
  }

  for (const id of ids) {
    // 先开默认配色拿到配色数量
    const first = await shot(id, 0, dirs[0])
    const count = await b.evaluate('window.__dbg?.count ?? 1')
    const colors = args.colors === 'all' ? [...Array(count).keys()] : String(args.colors ?? '0').split(',').map(Number).filter((c) => c < count)
    const grid = []
    for (const c of colors) {
      const row = []
      for (const dir of dirs) {
        const data = c === 0 && dir === dirs[0] ? first : await shot(id, c, dir)
        if (!sheet) fs.writeFileSync(path.join(out, `${id}-c${c}-${dir}.png`), Buffer.from(data, 'base64'))
        row.push(data)
      }
      grid.push(row)
    }
    if (!sheet) {
      console.log(id, `${colors.length * dirs.length} 张 →`, out)
      continue
    }
    // 拼图：在空白页里排成表格再截一张
    const w = cell * dirs.length
    const h = (cell + 22) * grid.length + 26
    await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await b.send('Page.navigate', { url: 'about:blank' })
    const html = `<body style="margin:0;font:13px sans-serif;background:#f3efe8"><div style="height:26px;line-height:26px;padding:0 8px"><b>${id}</b> · ${dirs.join(' / ')}</div>${grid
      .map((row, i) => `<div style="height:22px;line-height:22px;padding:0 8px;color:#666">配色 ${colors[i]}</div><div style="display:flex">${row.map((d) => `<img width="${cell}" height="${cell}" src="data:image/png;base64,${d}">`).join('')}</div>`)
      .join('')}</body>`
    await b.evaluate(`document.open(); document.write(${JSON.stringify(html)}); document.close()`)
    await waitFor(b, '[...document.images].every((i) => i.complete)', 10000)
    const png = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } })
    const file = path.join(out, `${id}.png`)
    fs.writeFileSync(file, Buffer.from(png.result.data, 'base64'))
    await b.send('Emulation.setDeviceMetricsOverride', { width: cell, height: cell, deviceScaleFactor: 1, mobile: false })
    console.log(id, `${colors.length} 配色 × ${dirs.length} 角度 →`, file)
  }
} finally {
  await b.close()
}
