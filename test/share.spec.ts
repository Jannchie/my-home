// 户型链接分享（src/share.ts）的编码 / 解码，以及视图路由（src/router.ts）的路径解析
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { swSource } from '/src/pwa/sw'
import { toRaw } from 'vue'
import { decodeShare, encodeShare, fromBase64Url, payloadFromHash, SHARE_WARN_LENGTH, shareUrl, stripShareHash, toBase64Url, toCompact } from '/src/share'
import { buildPath, parseRoute } from '/src/router'
import { generate, genOptions, plan } from '/src/store'
import type { Plan } from '/src/model'

const REGIONS = ['jp', 'cn', 'west'] as const

/** 和界面「随机生成」同一条路：生成户型 + 推算住户 + 一键布置 + 墙纸 */
function furnished(region: (typeof REGIONS)[number], seed: number): Plan {
  genOptions.region = region
  genOptions.seed = seed
  generate(false)
  return JSON.parse(JSON.stringify(toRaw(plan.value)))
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.051

function expectSamePlan(got: Plan, src: Plan, withFurniture: boolean) {
  expect(got.name).toBe(src.name)
  expect(got.wall).toBeCloseTo(src.wall, 1)
  expect(got.wallOuter).toBeCloseTo(src.wallOuter, 1)
  expect(got.region).toBe(src.region)
  expect(got.north ?? 0).toBeCloseTo(src.north ?? 0, 1)
  expect(got.rooms.length).toBe(src.rooms.length)
  got.rooms.forEach((r, i) => {
    const s = src.rooms[i]
    expect(r.name).toBe(s.name)
    expect(r.kind).toBe(s.kind)
    expect(r.openGroup).toBe(s.openGroup)
    expect(r.flush).toBe(s.flush)
    expect(r.railing).toBe(s.railing)
    expect(r.points.length).toBe(s.points.length)
    r.points.forEach((p, k) => expect(near(p.x, s.points[k].x) && near(p.y, s.points[k].y)).toBe(true))
    if (withFurniture) {
      expect(r.wallpaper).toEqual(s.wallpaper)
      expect(r.curtain).toEqual(s.curtain)
    } else expect(r.wallpaper).toBeUndefined()
  })
  const roomIdx = (p: Plan, id: string) => p.rooms.findIndex((r) => r.id === id)
  expect(got.openings.length).toBe(src.openings.length)
  got.openings.forEach((o, i) => {
    const s = src.openings[i]
    expect([o.kind, o.edge, o.hinge, o.swing, roomIdx(got, o.roomId)]).toEqual([s.kind, s.edge, s.hinge, s.swing, roomIdx(src, s.roomId)])
    expect(near(o.offset, s.offset) && near(o.width, s.width)).toBe(true)
  })
  expect(got.fixtures.length).toBe(src.fixtures.length)
  const fixIdx = (p: Plan, id?: string) => (id ? p.fixtures.findIndex((f) => f.id === id) : -1)
  got.fixtures.forEach((f, i) => {
    const s = src.fixtures[i]
    const { id: _a, x: _b, y: _c, w: _d, stackOn: _e, ...fr } = f
    const { id: _f, x: _g, y: _h, w: _i, stackOn: _j, ...sr } = s
    expect(fr).toEqual(sr)
    expect(near(f.x, s.x) && near(f.y, s.y) && near(f.w, s.w)).toBe(true)
    expect(fixIdx(got, f.stackOn)).toBe(fixIdx(src, s.stackOn))
  })
  if (!withFurniture) {
    expect(got.furniture).toEqual([])
    expect(got.household).toBeUndefined()
    return
  }
  expect(got.household).toEqual(src.household)
  expect(got.furniture.length).toBe(src.furniture.length)
  got.furniture.forEach((f, i) => {
    const s = src.furniture[i]
    const { id: _a, x: _b, y: _c, rot: _d, z: _e, ...fr } = f
    const { id: _f, x: _g, y: _h, rot: _i, z: _j, ...sr } = s
    expect(fr).toEqual(sr)
    expect(near(f.x, s.x) && near(f.y, s.y) && near(f.rot, s.rot) && near(f.z ?? 0, s.z ?? 0)).toBe(true)
  })
}

describe('户型链接：往返', () => {
  const stats: string[] = []
  for (const region of REGIONS) {
    test(`${region}：只户型 / 含家具`, async () => {
      for (const seed of [11, 42, 2024]) {
        const src = furnished(region, seed)
        const origin = 'https://home.jannchie.com/en/3d'
        const lens: number[] = []
        for (const mode of ['plan', 'full'] as const) {
          const payload = await encodeShare(src, mode)
          expect(payload).toMatch(/^1[A-Za-z0-9_-]+$/)
          const url = shareUrl(payload, origin)
          lens.push(url.length)
          // 走一遍地址解析
          const back = await decodeShare(payloadFromHash(new URL(url).hash)!)
          expect(back.ok).toBe(true)
          if (back.ok) expectSamePlan(back.plan, src, mode === 'full')
        }
        const raw = JSON.stringify(src).length
        stats.push(`${region} seed=${seed} rooms=${src.rooms.length} furniture=${src.furniture.length} json=${raw}B → 只户型 ${lens[0]} / 含家具 ${lens[1]} 字符${lens[1] > SHARE_WARN_LENGTH ? '（超出提示阈值）' : ''}`)
      }
    })
  }
  test('体积统计', () => {
    console.log('[share] URL 长度\n' + stats.join('\n'))
    expect(stats.length).toBe(9)
  })

  test('紧凑 JSON 不带 id / savedId', () => {
    const src = furnished('jp', 7)
    src.savedId = 's123'
    const { h: _h, ...c } = toCompact(src, 'full')
    const s = JSON.stringify(c)
    expect(s).not.toContain('"id"')
    expect(s).not.toContain('s123')
  })

  test('只有房间的空白户型、手画的非整数坐标', async () => {
    const p: Plan = {
      version: 1,
      name: '测试 & ?#/ 名字',
      wall: 12,
      wallOuter: 18,
      rooms: [{ id: 'a', name: 'R', kind: 'other', points: [{ x: 0.04, y: -3.26 }, { x: 100.15, y: 0 }, { x: 50, y: 80.333 }] }],
      openings: [],
      fixtures: [],
      furniture: [],
    }
    const res = await decodeShare(await encodeShare(p, 'full'))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.plan.name).toBe(p.name)
    expect(res.plan.rooms[0].points).toEqual([{ x: 0, y: -3.3 }, { x: 100.2, y: 0 }, { x: 50, y: 80.3 }])
    expect(res.plan.appliancesAsFurniture).toBe(true)
  })
})

describe('户型链接：坏数据', () => {
  test('各种坏 payload 返回错误而不抛', async () => {
    const good = await encodeShare(furnished('cn', 3), 'plan')
    const cases: [string, string][] = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['1', 'corrupt'],
      ['1!!!', 'corrupt'],
      ['1AAAA', 'corrupt'],
      [good.slice(0, good.length >> 1), 'corrupt'],
      ['0' + good.slice(1), 'corrupt'],
      ['9' + good.slice(1), 'version'],
      ['2abc', 'version'],
    ]
    for (const [p, err] of cases) {
      const r = await decodeShare(p)
      expect(r, p.slice(0, 20)).toEqual({ ok: false, error: err })
    }
  })

  test('压缩数据完好但 JSON 结构不对', async () => {
    const z = async (s: string) => {
      const out = new Blob([new TextEncoder().encode(s)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
      return '1' + toBase64Url(new Uint8Array(await new Response(out).arrayBuffer()))
    }
    for (const json of ['null', '[]', '{"r":[],"d":[],"x":[]}', '{"n":"x","w":12,"o":18,"r":[["a","ldk",[0,0,1]]],"d":[],"x":[]}', '{"n":"x","w":12,"o":18,"r":[],"d":[[5,"door",0,1,1,0]],"x":[]}', '{"n":"x","w":12,"o":18,"r":[],"d":[],"x":[],"f":[[0,1,1,0]],"a":[]}', 'not json']) {
      expect(await decodeShare(await z(json))).toEqual({ ok: false, error: 'corrupt' })
    }
    // 最小的合法户型
    const ok = await decodeShare(await z('{"n":"x","w":12,"o":18,"r":[],"d":[],"x":[]}'))
    expect(ok.ok).toBe(true)
  })

  test('base64url 往返', () => {
    const b = new Uint8Array(70000).map((_, i) => (i * 37) & 255)
    expect(fromBase64Url(toBase64Url(b))).toEqual(b)
  })
})

describe('分享地址', () => {
  test('hash 读写', () => {
    expect(payloadFromHash('#p=1abc')).toBe('1abc')
    expect(payloadFromHash('#x=1&p=1abc')).toBe('1abc')
    expect(payloadFromHash('')).toBeNull()
    expect(payloadFromHash('#foo')).toBeNull()
    expect(shareUrl('1abc', 'https://h.com/ja/library/sofa?lang=ja#old')).toBe('https://h.com/ja/library/sofa?lang=ja#p=1abc')
    expect(stripShareHash('https://h.com/en/3d#p=1abc')).toBe('https://h.com/en/3d')
    expect(stripShareHash('https://h.com/en/3d#x=1&p=1abc')).toBe('https://h.com/en/3d#x=1')
    expect(stripShareHash('https://h.com/en/3d')).toBe('https://h.com/en/3d')
  })
})

describe('视图路由', () => {
  test('路径 → 语言 + 视图', () => {
    const cases: [string, ReturnType<typeof parseRoute>][] = [
      ['/', { lang: null, view: '2d' }],
      ['/zh/', { lang: 'zh', view: '2d' }],
      ['/ja', { lang: 'ja', view: '2d' }],
      ['/en/index.html', { lang: 'en', view: '2d' }],
      ['/index.html', { lang: null, view: '2d' }],
      ['/en/plan', { lang: 'en', view: '2d' }],
      ['/en/3d', { lang: 'en', view: '3d' }],
      ['/en/3d/', { lang: 'en', view: '3d' }],
      ['/3d', { lang: null, view: '3d' }],
      ['/library', { lang: null, view: 'lib' }],
      ['/ja/library/', { lang: 'ja', view: 'lib' }],
      ['/en/library/sofa-3p', { lang: 'en', view: 'lib', asset: 'sofa-3p' }],
      ['/library/a%20b', { lang: null, view: 'lib', asset: 'a b' }],
      ['/library/%E0%A4%A', { lang: null, view: 'lib' }],
      ['/en/3d/extra', { lang: 'en', view: '3d' }],
      ['/fr/3d', { lang: null, view: '2d' }],
      ['/whatever', { lang: null, view: '2d' }],
      ['/english/3d', { lang: null, view: '2d' }],
    ]
    for (const [path, want] of cases) expect(parseRoute(path), path).toEqual(want)
  })

  test('视图 → 路径（保留有无语言前缀）', () => {
    expect(buildPath({ lang: 'en', view: '2d' })).toBe('/en/plan')
    expect(buildPath({ lang: 'ja', view: '3d' })).toBe('/ja/3d')
    expect(buildPath({ lang: null, view: 'lib' })).toBe('/library')
    expect(buildPath({ lang: 'zh', view: 'lib', asset: 'sofa-3p' })).toBe('/zh/library/sofa-3p')
    expect(buildPath({ lang: null, view: '3d', asset: 'x' })).toBe('/3d')
    for (const p of ['/en/plan', '/ja/3d', '/library', '/zh/library/sofa-3p', '/3d']) expect(buildPath(parseRoute(p))).toBe(p)
  })
})

describe('部署：Cloudflare Pages _redirects 与 service worker', () => {
  // Pages 的规则优先于静态文件（文件存在也照样重写），所以不能有能匹配到资源的规则
  const rules = readFileSync(resolve(__dirname, '../public/_redirects'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
  const match = (path: string) => {
    for (const [from, to, status] of rules) {
      const hit = from.endsWith('*') ? path.startsWith(from.slice(0, -1)) : path === from
      if (hit) return { to, status }
    }
    return null
  }

  test('语言前缀的视图深链重写到对应入口页（200，不跳转）', () => {
    for (const l of ['zh', 'ja', 'en'])
      for (const p of [`/${l}/3d`, `/${l}/plan`, `/${l}/library`, `/${l}/library/sofa-3p`, `/${l}/`]) expect(match(p), p).toEqual({ to: `/${l}/`, status: '200' })
  })

  test('不会重写真实文件；目标不写 index.html（Pages 会判为死循环并忽略）', () => {
    for (const p of ['/', '/assets/index-abc.js', '/sw.js', '/sitemap.xml', '/robots.txt', '/manifest.webmanifest', '/og.png', '/og-en.png', '/favicon.ico', '/3d', '/library']) expect(match(p), p).toBeNull()
    for (const [from, to] of rules) {
      expect(to).not.toMatch(/index(\.html)?$/)
      expect(from).not.toBe('/*')
    }
  })

  test('离线导航按语言前缀回退到入口页', () => {
    const src = swSource('test', ['/'])
    // 取出 entryOf 函数单独跑
    const fn = new Function(`${/function entryOf[\s\S]*?\n}/.exec(src)![0]}; return entryOf`)() as (u: URL) => string
    const e = (p: string) => fn(new URL('https://h.com' + p))
    expect(e('/en/3d')).toBe('/en/')
    expect(e('/ja/library/sofa-3p')).toBe('/ja/')
    expect(e('/zh/')).toBe('/zh/')
    expect(e('/3d')).toBe('/')
    expect(e('/english')).toBe('/')
    expect(e('/')).toBe('/')
  })
})
