// 平面图首屏不带 three.js 和建模代码：从入口（src/main.ts）顺着静态导入走，不能碰到它们。
// 平面图那侧要用素材数据请从 three/assetIndex 引入（AssetMeta），要模型的操作动态导入（store.ts heavy()、loadAssets()）。
// 这里按源码文本找 import / export … from（跳过 import type 和动态 import()），和打包器的静态图一致到够用。
import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return 'pkg:' + spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')
  const base = spec.startsWith('/') ? path.join(ROOT, spec) : path.resolve(path.dirname(from), spec)
  for (const c of [base, base + '.ts', base + '.vue', path.join(base, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  return null
}

function deps(file: string): string[] {
  let s = fs.readFileSync(file, 'utf8')
  if (file.endsWith('.vue')) s = [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
  const out: string[] = []
  const add = (spec: string) => {
    const r = resolve(file, spec)
    if (r) out.push(r)
  }
  for (const m of s.matchAll(/^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/gm)) {
    if (m[1]) continue
    // import { type A, type B } from …：全是类型，也会被擦掉
    const inner = /^\{([\s\S]*)\}$/.exec(m[2].trim())
    if (inner && inner[1].split(',').every((x) => !x.trim() || x.trim().startsWith('type '))) continue
    add(m[3])
  }
  for (const m of s.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) add(m[1])
  for (const m of s.matchAll(/^export\s+(?!type\b)(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gm)) add(m[1])
  return out
}

describe('平面图首屏的静态导入', () => {
  test('碰不到 three.js、素材包和完整素材表', () => {
    const entry = path.join(ROOT, 'src/main.ts')
    const prev = new Map<string, string | null>([[entry, null]])
    const queue = [entry]
    while (queue.length) {
      const f = queue.shift()!
      if (f.startsWith('pkg:')) continue
      for (const d of deps(f)) if (!prev.has(d)) prev.set(d, f), queue.push(d)
    }
    const rel = (f: string) => (f.startsWith('pkg:') ? f : path.relative(ROOT, f).split(path.sep).join('/'))
    const heavy = [...prev.keys()].filter((f) => {
      const r = rel(f)
      return r === 'pkg:three' || r === 'pkg:@pixiv' || r === 'src/three/assets.ts' || r === 'src/three/kit.ts' || r === 'src/three/toon.ts' || r.startsWith('src/three/packs/')
    })
    const chain = (f: string) => {
      const out: string[] = []
      for (let c: string | null | undefined = f; c; c = prev.get(c)) out.unshift(rel(c))
      return out.join(' → ')
    }
    expect(heavy.map(chain)).toEqual([])
  })
})
