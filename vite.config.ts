import { defineConfig, loadEnv, type Plugin } from 'vite'
import { PUBLIC_PRECACHE, swSource, swVersion } from './src/pwa/sw'
import vue from '@vitejs/plugin-vue'
import { DEFAULT_SITE_URL, jsonLd, SEO, SEO_LANGS, type SeoLang } from './src/seo'
import { PRODUCT_INTRO, PRODUCT_TAGLINE, UI } from './src/i18n/ui'
import { AGENT_FILES, agentFile, robotsTxt, type AgentFile } from './src/agentDocs'

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

/** 本仓库根目录下的 .claude/（小写、正斜杠；Windows 的 URL 路径去掉开头的 /） */
const CLAUDE_DIR = decodeURIComponent(new URL('./.claude/', import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .toLowerCase()

export default defineConfig(({ mode }) => {
  // 站点地址：项目根 .env* / 环境变量里的 VITE_SITE_URL，没有就用占位地址（上线前务必改掉）
  const site = (loadEnv(mode, '', 'VITE_').VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
  return {
    plugins: [vue(), seo(site), pwa()],
    define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(site) },
    // 代理的 git worktree 在 .claude/worktrees 下：别让它们的改动触发本仓库 dev server 整页刷新。
    // 只忽略本仓库根目录下的 .claude（worktree 自己也在某个 .claude 里，不能按路径片段匹配）
    server: { port: 5199, watch: { ignored: (p: string) => p.replace(/\\/g, '/').toLowerCase().startsWith(CLAUDE_DIR) } },
    build: {
      // 分包：three、素材包、i18n 词典体积大且更新节奏不同，各自成独立 chunk，改业务代码时浏览器缓存仍可复用。
      // Vite 8（rolldown）里 manualChunks 只是兼容写法：它被转成单个 group，而 group 默认会把命中模块的依赖一并收进来，
      // 结果 three 被素材包的 chunk 吞掉。这里用 codeSplitting.groups 按优先级分组，three 先认领。
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'three', test: /[\\/]node_modules[\\/](\.pnpm[\\/]three@[^\\/]+[\\/]node_modules[\\/])?three[\\/]/, priority: 30 },
              { name: 'i18n', test: /[\\/]src[\\/]i18n[\\/](ui|assetNames)\.ts$/, priority: 20 },
              { name: 'asset-packs', test: /[\\/]src[\\/]three[\\/]packs[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
  }
})
