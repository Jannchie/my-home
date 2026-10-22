// 生成画面效果选择器的预览图（public/looks/<id>.webp）：无头 Chromium 打开开发服务器的 3D 沙盘，
// 调用开发模式下的 window.__myhomeLookThumbs（Sandbox3D.vue）——载入固定种子的户型、正午、取景客厅，逐个效果截图。
// 新增 / 调整了效果之后重跑一次。
//
// 用法（先 pnpm dev）：node scripts/gen-look-thumbs.mjs [--port 5199] [--w 288] [--h 180] [--only anime,illust]
import fs from 'node:fs'
import path from 'node:path'
import { launch, parseArgs, waitFor } from './cdp.mjs'

const args = parseArgs()
const URL = args.url ?? `http://localhost:${args.port ?? 5199}/3d`
const W = +(args.w ?? 288)
const H = +(args.h ?? 180)
const OUT = path.resolve(args.out ?? 'public/looks')
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null

const b = await launch({ width: 1280, height: 800 })
try {
  await b.send('Page.navigate', { url: URL })
  if (!(await waitFor(b, 'window.__myhomeLookThumbs'))) throw new Error('页面上没有 __myhomeLookThumbs（要用开发服务器）：' + URL)
  await b.evaluate('window.__myhomeLookThumbs.setup()')
  const ids = (await b.evaluate('window.__myhomeLookThumbs.ids')).filter((id) => !only || only.has(id))
  fs.mkdirSync(OUT, { recursive: true })
  for (const id of ids) {
    const url = await b.evaluate(`window.__myhomeLookThumbs.shot(${JSON.stringify(id)}, ${W}, ${H})`)
    if (!url?.startsWith('data:image/webp')) throw new Error(`${id} 没截到图`)
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
    fs.writeFileSync(path.join(OUT, `${id}.webp`), buf)
    console.log(id.padEnd(14), `${(buf.length / 1024).toFixed(1)} KB`)
  }
} finally {
  await b.close()
}
