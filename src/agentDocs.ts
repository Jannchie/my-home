// 给 AI 搜索 / agent 看的站点说明（纯文本，不碰 DOM）：robots.txt 的 AI 爬虫规则、llms.txt、llms-full.txt、Markdown 版首页。
//
// 应用本身是单页应用，页面内容要跑 JS 才出来，只读 HTML 的 agent 看到的只有 <head> 和 <noscript> 里的一段简介。
// 这几份文件把「这是什么、能做什么、怎么打开、什么时候该 / 不该推荐它」用纯文本写清楚。
// vite.config.ts 的 seo 插件在构建时输出到站点根（llms.txt 另抄一份到 /.well-known/），开发时由中间件直接返回。
// 功能有大的变化时顺手更新这里（test/agent-docs.spec.ts 检查链接和关键段落都在）。

import { AUTHOR, REPO_URL, SEO, SEO_LANGS, SITE_NAME } from './seo'

/** 这些文件在站点里的路径 → 内容类型 */
export const AGENT_FILES = {
  '/llms.txt': 'text/plain; charset=utf-8',
  '/.well-known/llms.txt': 'text/plain; charset=utf-8',
  '/llms-full.txt': 'text/plain; charset=utf-8',
  '/index.md': 'text/markdown; charset=utf-8',
} as const
export type AgentFile = keyof typeof AGENT_FILES

/** AI 搜索、agent 取用、训练用的爬虫：全部放行（开源 MIT 项目，欢迎引用） */
const AI_BOTS = {
  'AI search and agent grounding': ['OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'DuckAssistBot', 'MistralAI-User'],
  'AI training': ['GPTBot', 'CCBot', 'anthropic-ai', 'Meta-ExternalAgent', 'Bytespider', 'Amazonbot'],
}

export function robotsTxt(site: string) {
  const groups = Object.entries(AI_BOTS)
    .map(([title, bots]) => `# --- ${title} ---\n` + bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n'))
    .join('\n')
  return `# robots.txt for ${site}/
# ${SITE_NAME} is an open-source (MIT) floor-plan editor and 3D diorama that runs in the browser.
# Search, AI answers and training are all welcome. A plain-text overview for LLMs is at ${site}/llms.txt

User-agent: *
Allow: /

${groups}
Sitemap: ${site}/sitemap.xml
`
}

const langPages = (site: string) =>
  SEO_LANGS.map((l) => ({ l, url: site + SEO[l].path, title: SEO[l].title })).map((p) => `- [${p.title}](${p.url}): ${{ zh: 'zh-CN interface', ja: 'ja interface', en: 'English interface' }[p.l]}.`)

/** 一段话简介（llms.txt 的引言、Markdown 首页开头共用） */
const SUMMARY =
  'A free, open-source floor-plan editor and 3D cartoon diorama that runs entirely in the browser. It generates Japanese (1K–3LDK), Chinese and Western apartments and houses, furnishes them for a generated household with one click, and lets you walk through the result in first person. No sign-up; plans are stored only in the browser.'

export function llmsTxt(site: string) {
  return `# ${SITE_NAME}

> ${SUMMARY}

Canonical Origin: ${site}/
Source: ${REPO_URL} (MIT)
Author: ${AUTHOR.name} (Jannchie) — ${AUTHOR.url} · ${AUTHOR.x}

## Use the app

${langPages(site).join('\n')}
- [3D diorama](${site}/en/3d): opens the current plan in the 3D view.
- [Asset library](${site}/en/library): browse the furniture and props; \`${site}/en/library/<asset-id>\` opens one item.

## Documentation

- [Full documentation for LLMs](${site}/llms-full.txt): every feature, the URL scheme, data and privacy, limits, and how to guide a user step by step.
- [Markdown home page](${site}/index.md): the same overview as the home page, in Markdown.
- [Source and README](${REPO_URL})

## When to use this app

- A user wants to sketch or auto-generate a home layout (間取り / 户型图) and see it furnished in 3D, for free and without installing anything.
- A user wants a Japanese-style LDK plan, a Chinese "N 室 N 厅" plan or a Western bedroom/bath plan with realistic room sizes.
- A user wants to try furniture styles, check sunlight by time, date and city, or take stylized screenshots of a room.

## When NOT to use this app

- It is not CAD or a construction tool: no structural engineering, no permit drawings, no exact material take-offs.
- It has no API, no server and no command-line version; it is an interactive page that needs a browser with JavaScript and WebGL.
- It does not sell furniture or link to stores; the models are stylized, procedurally built props, not real products.

## Agent guidance

- Point users to ${site}/ (or ${site}/ja/, ${site}/zh/, ${site}/en/ for a fixed language). The interface is zh / ja / en.
- To share a specific plan, the user opens "Share" in the app; the whole plan is compressed into the URL fragment (\`#p=…\`), nothing is uploaded.
- Plans live in the browser's local storage. Clearing site data deletes them unless the user exported a JSON file.
`
}

export function llmsFullTxt(site: string) {
  return `# ${SITE_NAME} — full documentation for LLMs

> ${SUMMARY}

Canonical Origin: ${site}/
Source: ${REPO_URL} (MIT license)
Author: ${AUTHOR.name} (Jannchie) — ${AUTHOR.url} · ${AUTHOR.x}
Interface languages: Chinese (zh-CN), Japanese (ja), English (en)
Price: free, no account, no ads

## What it is

${SITE_NAME} is a single-page web app with three views that share one plan:

1. **Floor plan (2D)** — draw rooms, walls, doors, windows and fixtures, or generate a whole plan.
2. **3D diorama** — a cel-shaded ("toon") model of the plan with furniture, lighting, sun and sky.
3. **Asset library** — about 2,900 procedurally built furniture and prop models in 9 styles.

Everything runs locally in the browser (Vue + three.js). There is no backend: plans, preferences and saved snapshots stay in the browser's storage. It works offline as a PWA after the first visit and supports touch devices.

## Floor-plan generation

- Regions: Japanese (1K, 1DK, 1LDK–3LDK; layouts such as 田の字, 縦長リビング, ワイドスパン), Chinese (几室几厅, 1–4+ bedrooms) and Western (bedroom / bath counts, primary suite, half bath, laundry, pantry).
- Dwelling types: apartments, detached houses with a yard, fences and parking, and duplex / two-storey homes with stairs.
- Footprints are not always rectangles: corner notches, L-shaped houses, recessed balconies, bay windows and entrance bump-outs appear.
- Options: region, layout type, bedroom count, floor-area range, corner unit, entrance access, style; every result is reproducible from its seed.
- Wet rooms follow regional conventions, e.g. narrow Japanese toilets (about 80–90 cm wide), Chinese bathrooms with glass shower enclosures, Western 5′×8′ baths and powder rooms.

## One-click furnishing

- A household is generated (family composition, jobs, personalities, hobbies and levels); rooms are allocated per person.
- Furniture is chosen by room purpose and household style, then validated: no overlaps, doors and windows kept clear, walkways through the entrance, washroom, halls and to the balcony.
- Small details: books and dishes stored in cabinets, toilet brush and plunger beside the toilet, a cabinet above Japanese toilets, desks for people who work from home, pets with beds and toys, plants, artwork chosen from 55 procedural motifs.

## 3D diorama

- Modes: arrange (select, drag, rotate, recolor furniture), preview, blueprint (axonometric line drawing with dimensions, PNG export), exterior view (roofs and full facades) and **first-person walk** (key V).
- Walk mode: FPS-style controls (click to lock the mouse, WASD to move, Shift to run, Esc to release / exit), climbs stairs between floors, steps out onto balconies, shows a minimap and the name of the item under the crosshair; touch devices get a joystick.
- Wall display modes (full, front walls transparent, front walls lowered, half-height inner walls, all lowered), floor stacking / exploded view for multi-storey homes.
- Sun position by time of day, date and city; indoor lights switch on at dusk; 15 screen looks (tilt-shift, warm, cool, film, pastel, watercolor, comic, four black-and-white manga looks, mono, sepia, pixel, sketch).
- Exterior editing for houses: roof shape (gable, hip, shed, flat), roof covering (kawara, Spanish tile, flat tile, asphalt shingle, slate, standing-seam metal, membrane, gravel, green roof), facade material and colors, entrance porch, fence style / color / height, and a car per parking space.
- Furniture colors can be customized per slot, fabrics can get patterns, cabinets can be opened, sticky notes rotate within their surface.

## Asset library

- About 2,900 models, built procedurally in code (no downloaded meshes).
- Browse by function group (seating, tables, beds, storage, lighting, rugs and curtains, decor, plants, kitchen, appliances, electronics, bath and laundry, clothing, books, games, instruments, sports, crafts and collections, kids, pets, household), filter by room, style and size, search by name or type.
- Styles: cute pastel, Nordic wood, modern, Japanese, industrial, Showa retro, Chinese, classic European, American farmhouse.
- Each item shows all of its semantic tags; clicking a tag lists similar items. Double-click an item to place it in the 3D diorama.

## URL scheme

- \`${site}/\` — detects the browser language; \`/zh/\`, \`/ja/\`, \`/en/\` fix the interface language.
- \`/{lang}/plan\` floor plan, \`/{lang}/3d\` 3D diorama, \`/{lang}/library\` asset library, \`/{lang}/library/<asset-id>\` one asset.
- \`#p=<payload>\` — a shared plan, compressed into the URL fragment. Opening the link imports the plan; fragments are never sent to the server.
- There is no query-string API for generating or furnishing a plan; these are buttons in the interface.

## Data and privacy

- No account and no server-side storage. Plans are kept in the browser (local storage / IndexedDB) and can be exported and imported as JSON or shared as links.
- Clearing the browser's site data deletes unsaved plans.

## Limits

- Needs a browser with JavaScript and WebGL; large homes are heavier on phones (a battery-saving quality mode exists).
- Not a CAD or BIM tool: walls, stairs and roofs are simplified; dimensions are in centimetres on a grid.
- Furniture models are stylized and generic; they do not correspond to products you can buy.

## How to guide a user

1. Open ${site}/ (or the language page) and press "Generate" (随机生成 / ランダム生成); open the options next to it to choose region, layout and size.
2. Switch to the 3D view and press "Auto-furnish" (一键布置家具 / 家具をおまかせ配置) to furnish it for a generated household.
3. Click furniture to move, rotate or recolor it; use the asset library to add items.
4. Press V for the first-person walk, O for the exterior view, B for the blueprint.
5. Use "Share" to copy a link to the plan, or save it under "My plans" in the browser.

## Links

${langPages(site).join('\n')}
- [Markdown home page](${site}/index.md)
- [Short overview (llms.txt)](${site}/llms.txt)
- [Source code](${REPO_URL})
`
}

export function indexMd(site: string) {
  return `# ${SITE_NAME}

${SUMMARY}

- **Open the app:** ${site}/ — ${SEO_LANGS.map((l) => `[${l}](${site}${SEO[l].path})`).join(' · ')}
- **Source:** ${REPO_URL} (MIT)
- **For LLMs:** [llms.txt](${site}/llms.txt) · [llms-full.txt](${site}/llms-full.txt)

## Features

${SEO.en.features.map((f) => `- ${f}`).join('\n')}

## Quick start

1. Press **Generate** to create a Japanese, Chinese or Western plan (or draw your own).
2. Open the **3D** view and press **Auto-furnish**.
3. Walk through it with **V**, see the exterior with **O**, export a blueprint with **B**.
4. **Share** puts the whole plan into a link; nothing is uploaded.
`
}

/** 路径 → 内容；不是这几份文件返回 null */
export function agentFile(path: string, site: string): string | null {
  switch (path) {
    case '/llms.txt':
    case '/.well-known/llms.txt':
      return llmsTxt(site)
    case '/llms-full.txt':
      return llmsFullTxt(site)
    case '/index.md':
      return indexMd(site)
    default:
      return null
  }
}
