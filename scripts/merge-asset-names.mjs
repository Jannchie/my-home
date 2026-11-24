// 把新素材的译名合并进 src/i18n/assetNames.ts：输入 {"中文": ["日本語", "English"]} 的 JSON 文件。
// 保持「每行一条、按键排序」的格式；已有且译名不同的条目保留原值并提示。
// 用法：node scripts/merge-asset-names.mjs <names.json>
import fs from 'node:fs'

const file = 'src/i18n/assetNames.ts'
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const src = fs.readFileSync(file, 'utf8')
const eol = src.includes('\r\n') ? '\r\n' : '\n'
const lines = src.split(/\r?\n/)
const start = lines.findIndex((l) => l.startsWith('export const ASSET_NAMES'))
const end = lines.findIndex((l, i) => i > start && l.startsWith('}'))
if (start < 0 || end < 0) throw new Error(`${file} 里找不到 ASSET_NAMES`)

const map = new Map()
for (const l of lines.slice(start + 1, end)) {
  const m = l.match(/^\s*("(?:[^"\\]|\\.)*"):\s*(\[.*\]),?\s*$/)
  if (!m) throw new Error('无法解析：' + l)
  map.set(JSON.parse(m[1]), JSON.parse(m[2]))
}
const before = map.size
const keys0 = [...map.keys()]
const sorted = keys0.every((k, i) => i === 0 || keys0[i - 1] <= k)

let added = 0
for (const [k, v] of Object.entries(add)) {
  if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'string' || !x)) throw new Error(`译名格式不对：${k}`)
  if (map.has(k)) {
    if (JSON.stringify(map.get(k)) !== JSON.stringify(v)) console.warn('已有不同译名，保留原值：', k, map.get(k), '≠', v)
    continue
  }
  map.set(k, v)
  added++
}
const keys = sorted ? [...map.keys()].sort() : [...map.keys()]
const body = keys.map((k) => `  ${JSON.stringify(k)}: [${map.get(k).map((x) => JSON.stringify(x)).join(', ')}],`)
fs.writeFileSync(file, [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join(eol))
console.log(`原有 ${before} 条（${sorted ? '已排序' : '未排序，新条目加在末尾'}），新增 ${added} 条`)
