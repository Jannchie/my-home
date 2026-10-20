import fs from 'node:fs'
import { launch } from './cdp.mjs'
const [url, out, w = '1200', h = '900', wait = '6000', dsf = '2'] = process.argv.slice(2)
const b = await launch({ width: Number(w), height: Number(h) })
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: Number(dsf), mobile: false })
  await b.send('Page.navigate', { url })
  await new Promise((r) => setTimeout(r, Number(wait)))
  const shot = await b.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log('saved', out, await b.evaluate('document.title'))
} finally { await b.close() }