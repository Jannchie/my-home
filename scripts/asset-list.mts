// 素材清单：每件素材的 下标 / id / 名称 / 分类 / 所在文件 / 声明尺寸 / 配色数，按素材库顺序。
// 用法：vite-node scripts/asset-list.mts [--out <tsv>] [--only <id 正则>] [--by-file]（--by-file 只打印每个文件有几件、起始下标）
import '../test/setup/stubdom'
import fs from 'node:fs'
import { ASSETS, type AssetDef } from '/src/three/assets'

const argv = process.argv.slice(2)
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const only = arg('--only') ? new RegExp(arg('--only')!) : null

const mods = import.meta.glob('/src/three/packs/*.ts', { eager: true }) as Record<string, Record<string, unknown>>
const fileOf = new Map<string, string>()
for (const [k, m] of Object.entries(mods)) {
  if (k.endsWith('/index.ts')) continue
  for (const v of Object.values(m)) if (Array.isArray(v)) for (const a of v as AssetDef[]) if (a && typeof a === 'object' && 'id' in a && 'build' in a) fileOf.set(a.id, k.replace('/src/three/', ''))
}

const rows = (ASSETS as AssetDef[])
  .map((a, i) => ({ i, a, file: fileOf.get(a.id) ?? 'assets.ts' }))
  .filter(({ a }) => !only || only.test(a.id))

if (argv.includes('--by-file')) {
  const by = new Map<string, { n: number; first: number }>()
  for (const r of rows) {
    const e = by.get(r.file) ?? { n: 0, first: r.i }
    e.n++
    by.set(r.file, e)
  }
  for (const [f, e] of by) console.log(`${f}\t${e.n}\t${e.first}`)
} else {
  const text = rows.map(({ i, a, file }) => [i, a.id, a.name, a.category, file, `${a.w}x${a.d}x${a.h}`, a.palettes.length, a.mount ?? '', a.prop ? 'prop' : ''].join('\t')).join('\n')
  if (arg('--out')) fs.writeFileSync(arg('--out')!, text)
  else console.log(text)
}
