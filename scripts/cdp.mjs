// 极简 CDP 客户端：起一个独立的无头 Chromium（临时 profile，不碰用户浏览器），返回 send / eval / close。
// 只给录制脚本（record-promo.mjs）这类离线工具用。
import { execSync, spawn } from 'node:child_process'
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

/** 命令行参数：--key value / --flag → { key: 'value' | true } */
export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(
    argv.reduce((acc, a, i, all) => {
      if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
      return acc
    }, []),
  )
}

/** 等页面上的表达式为真（每 250ms 查一次，页面还在加载时求值出错也接着等）；超时返回 false */
export async function waitFor(b, expr, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    if (await b.evaluate(`!!(${expr})`).catch(() => false)) return true
    await sleep(250)
  }
  return false
}

// 浏览器互斥锁：同一时间只让一个脚本开无头 Chrome（并行跑的截图脚本排队，免得同时起好几套浏览器把内存吃满）。
// 锁是临时目录下的一个文件夹，里面记着持有者的 pid；持有者已经不在了（崩溃、被杀）就当作过期锁清掉。
const LOCK = path.join(os.tmpdir(), 'my-home-chrome.lock')
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
async function acquireLock(maxWait = 30 * 60 * 1000) {
  for (let t = 0; ; t += 400) {
    try {
      fs.mkdirSync(LOCK)
      fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid))
      return
    } catch {
      let pid = NaN
      try {
        pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8'))
      } catch {
        /* 对方刚建好目录还没写 pid：下一轮再看 */
      }
      if (pid === process.pid) return
      if (Number.isFinite(pid) && !alive(pid)) fs.rmSync(LOCK, { recursive: true, force: true })
      else if (t > maxWait) throw new Error(`等浏览器锁超时（持有者 pid ${pid}）：${LOCK}`)
      else await sleep(400)
    }
  }
}
function releaseLock() {
  try {
    if (Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8')) === process.pid) fs.rmSync(LOCK, { recursive: true, force: true })
  } catch {
    /* 没有锁 */
  }
}

// 调试端口默认在 9350–9949 里随机取：上一次没退干净的实例占着端口时不撞
export async function launch({ width, height, port, gpu = true } = {}) {
  await acquireLock()
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-chrome-'))
  const argsFor = (p) => [
    '--headless=new',
    `--remote-debugging-port=${p}`,
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
  // Windows 上 proc.kill() 只结束启动进程，渲染 / GPU 子进程会留下来：按进程树强杀。
  // 脚本正常退出、报错、Ctrl+C 时也要杀，否则每次失败重试都会留下一整套 Chrome。
  let proc = null
  const killProc = () => {
    if (!proc) return
    try {
      if (process.platform === 'win32') execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' })
      else process.kill(-proc.pid, 'SIGKILL')
    } catch {
      proc.kill('SIGKILL')
    }
    proc = null
  }
  // 两样都能重复调用（killProc 清空 proc，releaseLock 只删自己持有的锁）
  const killTree = () => {
    releaseLock()
    killProc()
  }
  process.once('exit', killTree)
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => (killTree(), process.exit(1)))

  // 调试端口被别的程序占着时，Chrome 可能只在 IPv6 回环上监听、甚至根本没监听：两个回环地址都试，
  // 15 秒连不上就杀掉换一个端口重起（以前只连 127.0.0.1 且无限等，持着浏览器锁空转，后面排队的脚本全卡住）。
  let page = null
  for (let attempt = 0; attempt < 4 && !page; attempt++) {
    const p = port && attempt === 0 ? port : 9350 + Math.floor(Math.random() * 600)
    proc = spawn(findChrome(), argsFor(p), { stdio: 'ignore', detached: process.platform !== 'win32' })
    // 按真实时间算 15 秒（请求本身的超时也算在内），两个回环地址同时问
    const probe = (host) =>
      fetch(`http://${host}:${p}/json/list`, { signal: AbortSignal.timeout(800) })
        .then((r) => r.json())
        .then((list) => list.find((x) => x.type === 'page') ?? Promise.reject(new Error('还没有页面')))
    for (const deadline = Date.now() + 15000; !page && Date.now() < deadline; ) {
      page = await Promise.any([probe('127.0.0.1'), probe('[::1]')]).catch(() => null)
      if (!page) await sleep(250)
    }
    if (!page) killProc()
  }
  if (!page) {
    killTree()
    throw new Error('无头 Chrome 起不来（换了 4 个调试端口都连不上）')
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  ws.binaryType = 'arraybuffer'
  await new Promise((r, reject) => {
    const timer = setTimeout(() => (killTree(), reject(new Error('CDP WebSocket 连接超时'))), 15000)
    ws.onopen = () => (clearTimeout(timer), r())
    ws.onerror = () => (clearTimeout(timer), killTree(), reject(new Error('CDP WebSocket 连接失败')))
  })
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
  // 每个请求最多等 60s：GPU / 页面卡死时抛错退出，而不是无限挂起（录制脚本外层会重试）
  const send = (method, params = {}) =>
    new Promise((r, reject) => {
      const i = ++id
      const timer = setTimeout(() => {
        pending.delete(i)
        reject(new Error(`CDP ${method} 超时`))
      }, 60000)
      pending.set(i, (m) => {
        clearTimeout(timer)
        r(m)
      })
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
      killTree()
      await sleep(300)
      try {
        fs.rmSync(profile, { recursive: true, force: true })
      } catch {
        /* chrome 可能还占着文件 */
      }
    },
  }
}
