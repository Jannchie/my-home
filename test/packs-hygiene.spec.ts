// 素材包卫生：共用工具只有一份实现。
//   - 包里不能再定义和 geo.ts / packkit.ts / cabinetKit.ts 导出同名的顶层函数 / 常量 / 类型（同名不同义是最大的隐患：
//     改一个包里 bar 的参数顺序，另一个包的调用就悄悄变成另一种几何）。需要包内特化时起一个不撞名的名字。
//   - 包之间不互相 import（共用的东西放进 geo / packkit / cabinetKit）。
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

const DIR = path.resolve(__dirname, '../src/three')
const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8')
const TOP = /^(?:export\s+)?(?:function|const|let|type|interface|class)\s+([A-Za-z_$][\w$]*)/gm
const topNames = (src: string) => [...src.matchAll(TOP)].map((m) => m[1])
const exportNames = (src: string) => [...src.matchAll(/^export\s+(?:function|const|type|interface|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])

const shared = new Map<string, string>()
for (const f of ['geo.ts', 'packkit.ts', 'cabinetKit.ts']) for (const n of exportNames(read(f))) shared.set(n, f)
const packs = fs.readdirSync(path.join(DIR, 'packs')).filter((f) => f.endsWith('.ts') && f !== 'index.ts')

test('素材包不重新定义共用工具的名字', () => {
  const bad: string[] = []
  for (const f of packs) for (const n of topNames(read(`packs/${f}`))) if (shared.has(n)) bad.push(`${f}: ${n}（已在 ${shared.get(n)}）`)
  expect(bad).toEqual([])
})

test('素材包之间不互相 import', () => {
  const bad: string[] = []
  for (const f of packs) for (const m of read(`packs/${f}`).matchAll(/from '\.\/([\w-]+)'/g)) bad.push(`${f} → ${m[1]}`)
  expect(bad).toEqual([])
})
