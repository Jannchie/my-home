import fs from 'node:fs'
import { launch } from './cdp.mjs'
const [url, prefix, w = '1400', h = '1000', gap = '2200', n = '4'] = process.argv.slice(2)
const b = await launch({ width: Number(w), height: Number(h) })
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 2, mobile: false })
  await b.send('Page.navigate', { url })
  await new Promise((r) => setTimeout(r, 7000))
  for (let i = 0; i < Number(n); i++) {
    const shot = await b.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    fs.writeFileSync(`${prefix}-${i}.png`, Buffer.from(shot.result.data, 'base64'))
    console.log('saved', `${prefix}-${i}.png`)
    await new Promise((r) => setTimeout(r, Number(gap)))
  }
} finally { await b.close() }