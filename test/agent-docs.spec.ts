// 给 AI 搜索 / agent 看的站点文件（src/agentDocs.ts）：AI 爬虫放行规则、llms.txt / llms-full.txt / index.md 的关键内容和链接。
import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { AGENT_FILES, agentFile, llmsTxt, robotsTxt, type AgentFile } from '/src/agentDocs'
import { SEO, SEO_LANGS } from '/src/seo'

const SITE = 'https://example.test'

describe('agent 用的站点文件', () => {
  test('robots.txt 放行主要的 AI 搜索 / agent 爬虫，并给出 sitemap', () => {
    const r = robotsTxt(SITE)
    for (const bot of ['ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Google-Extended', 'GPTBot']) expect(r).toContain(`User-agent: ${bot}\nAllow: /`)
    expect(r).toContain(`Sitemap: ${SITE}/sitemap.xml`)
    expect(r).not.toMatch(/Disallow/)
  })

  test('每个文件都有内容，llms.txt 的根路径和 /.well-known/ 一致', () => {
    for (const p of Object.keys(AGENT_FILES) as AgentFile[]) expect(agentFile(p, SITE)?.length, p).toBeGreaterThan(300)
    expect(agentFile('/.well-known/llms.txt', SITE)).toBe(llmsTxt(SITE))
    expect(agentFile('/nope.txt', SITE)).toBeNull()
  })

  test('llms.txt 按规范开头（H1 + 引用块），列出三种语言的入口和完整文档', () => {
    const t = llmsTxt(SITE)
    expect(t).toMatch(/^# My Home\n\n> /)
    for (const l of SEO_LANGS) expect(t).toContain(SITE + SEO[l].path)
    expect(t).toContain(`${SITE}/llms-full.txt`)
    expect(t).toContain('## When NOT to use this app')
  })

  test('llms-full.txt 说明 URL 规则、数据与隐私、怎么一步步引导用户', () => {
    const t = agentFile('/llms-full.txt', SITE)!
    for (const h of ['## URL scheme', '## Data and privacy', '## Limits', '## How to guide a user']) expect(t).toContain(h)
    expect(t).toContain('#p=')
  })

  test('站点里的链接都指向本站或源码仓库（不会漏掉站点地址）', () => {
    for (const p of Object.keys(AGENT_FILES) as AgentFile[])
      for (const m of agentFile(p, SITE)!.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) expect(m[1].startsWith(SITE) || m[1].startsWith('https://github.com/') || m[1].startsWith('https://x.com/'), m[1]).toBe(true)
  })

  test('入口页 <head> 指向 Markdown 版首页和 llms.txt', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8')
    expect(html).toContain('type="text/markdown" href="__SITE_URL__/index.md"')
    expect(html).toContain('href="__SITE_URL__/llms.txt"')
  })
})
