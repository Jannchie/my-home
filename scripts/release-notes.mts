// 从 src/changelog.ts 生成某个版本的 GitHub Release 说明（中 / 日 / 英三段）。
// 用法：pnpm exec vite-node scripts/release-notes.mts v1.1.0 > notes.md
import { CHANGELOG } from '../src/changelog'

const want = (process.argv[2] ?? '').replace(/^v/, '') || CHANGELOG[0].version
const r = CHANGELOG.find((x) => x.version === want)
if (!r) {
  console.error(`changelog 里没有 ${want}`)
  process.exit(1)
}
const section = (title: string, items: string[]) => [`### ${title}`, '', ...items.map((x) => `- ${x}`), ''].join('\n')
console.log(
  [
    `https://home.jannchie.com`,
    '',
    section('English', r.notes.en),
    section('中文', r.notes.zh),
    section('日本語', r.notes.ja),
  ].join('\n'),
)
