// 临时截图脚本：node scripts/shot-preview.mjs <url> <out.png> [w] [h] [waitMs]
import fs from 'node:fs'
import { launch } from './cdp.mjs'

const [url, out, w = '900', h = '1100', wait = '1200'] = process.argv.slice(2)
const browser = await launch({ width: Number(w), height: Number(h) })
try {
  const nav = await browser.send('Page.navigate', { url })
  if (nav.result?.errorText) console.error('navigate:', nav.result.errorText)
  let ready = false
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 250))
    ready = (await browser.evaluate("document.body?.dataset?.ready || ''")) === '1'
    if (ready) break
  }
  if (!ready) {
    const info = await browser.evaluate(`JSON.stringify({ href: location.href, state: document.readyState, ready: document.body?.dataset?.ready ?? null, title: document.title, overlay: document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0, 900) ?? null, html: document.body?.innerHTML.slice(0, 300) })`)
    console.error('page:', info)
    throw new Error('preview not ready: ' + url)
  }
  await new Promise((r) => setTimeout(r, Number(wait)))
  const shot = await browser.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log('saved', out, await browser.evaluate('document.title'))
} finally {
  await browser.close()
}
