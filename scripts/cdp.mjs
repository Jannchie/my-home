// 极简 CDP 客户端：起一个独立的无头 Chromium（临时 profile，不碰用户浏览器），返回 send / eval / close。
// 只给录制脚本（record-promo.mjs）这类离线工具用。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const local = process.env.LOCALAPPDATA ?? ''
  const root = path.join(local, 'ms-playwright')
  if (fs.existsSync(root)) {
    const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()
    for (const d of dirs) {
      const exe = path.join(root, d, 'chrome-win', 'chrome.exe')
      if (fs.existsSync(exe)) return exe
    }
  }
  throw new Error('找不到 Chromium：设置 CHROME 环境变量指向 chrome 可执行文件')
}

export async function launch({ width, height, port = 9350, gpu = true } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-chrome-'))
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--force-device-scale-factor=1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    'about:blank',
  ]
  const proc = spawn(findChrome(), args, { stdio: 'ignore' })
  let list
  for (let i = 0; i < 100; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json()
      break
    } catch {
      await sleep(200)
    }
  }
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  ws.binaryType = 'arraybuffer'
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    } else if (m.method) for (const l of listeners) l(m)
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails))
    return r.result?.result?.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) console.error('[page]', m.params.args.map((a) => a.value ?? a.description).join(' '))
    if (m.method === 'Runtime.exceptionThrown') console.error('[page exception]', m.params.exceptionDetails?.exception?.description)
  })
  return {
    send,
    evaluate,
    on: (fn) => listeners.push(fn),
    async close() {
      ws.close()
      proc.kill()
      await sleep(300)
      try {
        fs.rmSync(profile, { recursive: true, force: true })
      } catch {
        /* chrome 可能还占着文件 */
      }
    },
  }
}
