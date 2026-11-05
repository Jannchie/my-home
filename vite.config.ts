import { defineConfig, loadEnv, runnerImport, type Plugin } from 'vite'
import { PUBLIC_PRECACHE, swSource, swVersion } from './src/pwa/sw.ts'
import vue from '@vitejs/plugin-vue'
import { DEFAULT_SITE_URL, jsonLd, SEO, SEO_LANGS, type SeoLang } from './src/seo.ts'
import { ROOM_NAMES, UI } from './src/i18n/ui.ts'
import { ASSET_NAMES } from './src/i18n/assetNames.ts'
import { PRODUCT_INTRO, PRODUCT_TAGLINE } from './src/i18n/product.ts'
import { AGENT_FILES, agentFile, robotsTxt, type AgentFile } from './src/agentDocs.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const tr = (zh: string, l: SeoLang) => (l === 'zh' ? zh : UI[zh][l === 'ja' ? 0 : 1])

/** 改写一个 <meta>/<link> 的属性值：attr="key" 的那个标签，把 field="..." 换成 value */
function setAttr(html: string, tag: 'meta' | 'link', attr: string, key: string, field: string, value: string) {
  const re = new RegExp(`(<${tag}\\b[^>]*\\b${attr}="${key}"[^>]*\\b${field}=")[^"]*(")`)
  if (!re.test(html)) throw new Error(`[seo] index.html 里找不到 <${tag} ${attr}="${key}">`)
  return html.replace(re, `$1${esc(value)}$2`)
}

/** 按语言改写整页 <head>；page 是这一页自己的路径（'/' 或 '/ja/' 等），决定 canonical / og:url */
function localize(html: string, l: SeoLang, page: string, site: string) {
  const s = SEO[l]
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${s.htmlLang}"`)
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(s.title)}</title>`)
  html = setAttr(html, 'meta', 'name', 'description', 'content', s.description)
  html = setAttr(html, 'meta', 'name', 'keywords', 'content', s.keywords)
  html = setAttr(html, 'link', 'rel', 'canonical', 'href', site + page)
  html = setAttr(html, 'meta', 'property', 'og:url', 'content', site + page)
  for (const [attr, pre] of [
    ['property', 'og'],
    ['name', 'twitter'],
  ] as const) {
    html = setAttr(html, 'meta', attr, `${pre}:title`, 'content', s.title)
    html = setAttr(html, 'meta', attr, `${pre}:description`, 'content', s.tagline)
    html = setAttr(html, 'meta', attr, `${pre}:image`, 'content', site + s.ogImage)
    html = setAttr(html, 'meta', attr, `${pre}:image:alt`, 'content', s.ogImageAlt)
  }
  html = setAttr(html, 'meta', 'property', 'og:locale', 'content', s.ogLocale)
  // og:locale:alternate：其余两种语言
  html = html.replace(/(\s*<meta property="og:locale:alternate"[^>]*>)+/, () =>
    SEO_LANGS.filter((x) => x !== l)
      .map((x) => `\n    <meta property="og:locale:alternate" content="${SEO[x].ogLocale}" />`)
      .join(''),
  )
  html = html.replace(
    /<script type="application\/ld\+json" id="ld-json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="ld-json">${JSON.stringify(jsonLd(l, site, page)).replace(/</g, '\\u003c')}</script>`,
  )
  // <noscript>：本语言的长简介打头，另两种语言各一句
  const others = SEO_LANGS.filter((x) => x !== l)
    .map((x) => `\n        <p lang="${SEO[x].htmlLang}">${esc(tr(PRODUCT_TAGLINE, x))}</p>`)
    .join('')
  html = html.replace(
    /(<noscript>\s*<main[^>]*>)[\s\S]*?(<p><strong>)/,
    `$1\n        <h1>${esc(s.title)}</h1>\n        <p>${esc(tr(PRODUCT_INTRO, l))}</p>${others}\n        $2`,
  )
  return html
}

function sitemap(site: string) {
  const alts = SEO_LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${SEO[l].htmlLang}" href="${site}${SEO[l].path}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${site}/"/>`)
    .join('\n')
  const today = new Date().toISOString().slice(0, 10)
  const urls = ['/', ...SEO_LANGS.map((l) => SEO[l].path)]
    .map((p) => `  <url>\n    <loc>${site}${p}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
}

/**
 * SEO 插件：
 * - index.html 里的 __SITE_URL__ 换成站点地址，并按 src/seo.ts 填好中文版 meta / JSON-LD；
 * - 构建时额外输出 zh/ja/en/index.html（各自的 meta、canonical、分享图），以及 sitemap.xml、robots.txt（含 AI 爬虫规则）、
 *   给 agent 看的 llms.txt（另抄一份到 /.well-known/）、llms-full.txt、index.md（src/agentDocs.ts）；
 * - 开发时这些文件也能直接访问。
 */
function seo(site: string): Plugin {
  return {
    name: 'my-home-seo',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      // 顺手去掉 HTML 注释（只是给维护者看的）
      // 开发时访问 /ja/ 等路径，也直接给对应语言的 head（构建时这里只处理根 index.html，三语入口页在 generateBundle 里生成）
      handler: (html, ctx) => {
        const m = /^\/(zh|ja|en)\//.exec(ctx.originalUrl ?? '')
        const l = (m?.[1] ?? 'zh') as SeoLang
        return localize(html.replaceAll('__SITE_URL__', site).replace(/\s*<!--[\s\S]*?-->/g, ''), l, m ? SEO[l].path : '/', site)
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req as { url?: string }).url?.split('?')[0] ?? ''
        const body = path === '/robots.txt' ? robotsTxt(site) : path === '/sitemap.xml' ? sitemap(site) : agentFile(path, site)
        if (body == null) return next()
        res.setHeader('Content-Type', path === '/sitemap.xml' ? 'application/xml; charset=utf-8' : (AGENT_FILES[path as AgentFile] ?? 'text/plain; charset=utf-8'))
        res.end(body)
      })
    },
    // index.html 由 Vite 自己的 html 插件在 generateBundle 阶段产出，这里排在它后面
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const index = bundle['index.html']
        if (!index || index.type !== 'asset') return
        const html = String(index.source)
        for (const l of SEO_LANGS) {
          this.emitFile({ type: 'asset', fileName: `${l}/index.html`, source: localize(html, l, SEO[l].path, site) })
        }
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(site) })
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) })
        for (const path of Object.keys(AGENT_FILES) as AgentFile[]) this.emitFile({ type: 'asset', fileName: path.slice(1), source: agentFile(path, site)! })
      },
    },
  }
}

/**
 * PWA：构建时生成 dist/sw.js（源码见 src/pwa/sw.ts），预缓存应用壳——三语入口页、全部带 hash 的 JS / CSS、
 * 图标与 manifest（分享卡片大图不缓存）。版本号取清单内容的 hash：任何资源变了，SW 就会更新并提示用户刷新。
 * 开发环境不生成、也不注册（src/ui/pwa.ts）。
 */
function pwa(): Plugin {
  return {
    name: 'my-home-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const files = Object.keys(bundle).filter((f) => /\.(js|css|html|woff2?|svg|png|webmanifest)$/.test(f) && f !== 'sitemap.xml')
        const urls = [...new Set(['/', ...files.map((f) => '/' + f.replace(/(^|\/)index\.html$/, '$1')), ...PUBLIC_PRECACHE])].sort()
        const src = swSource(swVersion(JSON.stringify(urls)), urls)
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: src })
      },
    },
  }
}

/**
 * 界面词典按语言拆包：源文件（i18n/ui.ts、assetNames.ts）按「中文 → [日, 英]」成对维护，方便对照翻译；
 * 运行时只需要当前语言那一列。这里把每种语言的那一列生成虚拟模块 virtual:i18n-dict/ja|en，
 * i18n/index.ts 按需动态导入：中文界面一个词典都不下载，日 / 英各只下载自己的一半。
 * 词典改了 vite 会因配置依赖变化自动重启，生成结果跟着更新。
 */
export function i18nDicts(): Plugin {
  const PREFIX = 'virtual:i18n-dict/'
  const col = (src: Record<string, [string, string]>, i: 0 | 1) => Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v[i]]))
  return {
    name: 'my-home-i18n-dicts',
    resolveId: (id) => (id.startsWith(PREFIX) ? '\0' + id : undefined),
    load(id) {
      if (!id.startsWith('\0' + PREFIX)) return
      const l = id.slice(PREFIX.length + 1)
      if (l !== 'ja' && l !== 'en') throw new Error(`[i18n] 未知词典 ${id}`)
      const i = l === 'ja' ? 0 : 1
      const dict = { ui: col(UI, i), rooms: col(ROOM_NAMES, i), assets: col(ASSET_NAMES, i) }
      // JSON.parse 一个字符串字面量比等价的对象字面量解析得快
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(dict))})`
    },
  }
}

/**
 * 素材元数据快照（src/three/assetIndex.ts、assetRegistry.ts）：平面图只需要素材的数据部分（占地、标签、配色…），
 * 不需要建模代码和 three.js（两者 gzip 后约 1MB）。生产构建时在 Node 里把完整素材表跑一遍，去掉函数字段，
 * 生成 virtual:asset-meta 登记进素材表；完整素材进 3D 时再加载、整表替换。
 * 开发和测试环境不生成快照，virtual:asset-meta 直接加载完整素材（行为和以前一样）。
 */
export function assetMeta(): Plugin {
  const ID = 'virtual:asset-meta'
  let build = false
  let snapshot: Promise<string> | null = null
  return {
    name: 'my-home-asset-meta',
    configResolved: (c) => void (build = c.command === 'build'),
    resolveId: (id) => (id === ID ? '\0' + ID : undefined),
    async load(id) {
      if (id !== '\0' + ID) return
      if (!build) return `import '/src/three/assets.ts'`
      snapshot ??= metaSnapshot()
      return [
        `import { registerAssets } from '/src/three/assetRegistry.ts'`,
        `import { deriveResizedMeta } from '/src/three/resizeMeta.ts'`,
        `registerAssets(JSON.parse(${JSON.stringify(await snapshot)}), deriveResizedMeta, false)`,
      ].join('\n')
    },
  }
}

/** 在 Node 里加载完整素材表（素材 build 会碰 canvas，先装上测试用的极简 DOM 桩），生成快照（src/three/assetSnapshot.ts）的 JSON */
async function metaSnapshot() {
  const file = (p: string) => decodeURIComponent(new URL(p, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
  const config = { configFile: false as const, root: file('./'), mode: 'production', logLevel: 'error' as const, plugins: [i18nDicts()] }
  await runnerImport(file('./test/setup/stubdom.ts'), config)
  const { module } = await runnerImport<{ assetSnapshot: () => object[] }>(file('./src/three/assetSnapshot.ts'), config)
  const bad: string[] = []
  const json = JSON.stringify(module.assetSnapshot(), (k, v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k)
    return v
  })
  // JSON 存不下 NaN / Infinity：真出现了说明素材数据有问题，别悄悄变成 null
  if (bad.length) throw new Error(`[asset-meta] 素材数据里有非有限数：${[...new Set(bad)].join(', ')}`)
  return json
}

/** 本仓库根目录下的 .claude/（小写、正斜杠；Windows 的 URL 路径去掉开头的 /） */
const CLAUDE_DIR = decodeURIComponent(new URL('./.claude/', import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .toLowerCase()

export default defineConfig(({ mode }) => {
  // 站点地址：项目根 .env* / 环境变量里的 VITE_SITE_URL，没有就用占位地址（上线前务必改掉）
  const site = (loadEnv(mode, '', 'VITE_').VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
  return {
    plugins: [vue(), i18nDicts(), assetMeta(), seo(site), pwa()],
    define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(site) },
    // 代理的 git worktree 在 .claude/worktrees 下：别让它们的改动触发本仓库 dev server 整页刷新。
    // 只忽略本仓库根目录下的 .claude（worktree 自己也在某个 .claude 里，不能按路径片段匹配）
    server: { port: 5199, watch: { ignored: (p: string) => p.replace(/\\/g, '/').toLowerCase().startsWith(CLAUDE_DIR) } },
    build: {
      // 分包：three 体积大、更新少，单独成 chunk，改业务代码时浏览器缓存仍可复用。
      // 素材包不再单独分组：它们只经由动态导入的 assets.ts 加载（平面图首屏用元数据快照，见 assetMeta 插件），自然落在懒加载的 chunk 里；
      // 分组会把命中模块的依赖（平面图也用的公共模块）一并收进来，入口就又得静态引用它。
      // Vite 8（rolldown）里 manualChunks 只是兼容写法，这里用 codeSplitting.groups。
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'three', test: /[\\/]node_modules[\\/](\.pnpm[\\/]three@[^\\/]+[\\/]node_modules[\\/])?three[\\/]/, priority: 30 },
            ],
          },
        },
      },
    },
  }
})
