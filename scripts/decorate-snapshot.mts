// 一键布置结果快照：jp / cn / west 各 seed 1..N 跑一遍 decorate + 检查清单，写成 JSON，用来对比重构前后的布置结果。
// 用法：vite-node scripts/decorate-snapshot.mts <out.json> [N=40]
//       vite-node scripts/decorate-snapshot.mts --diff <before.json> <after.json>   （按户列出家具 id 多重集合的差异）
import '../test/setup/stubdom'
import fs from 'node:fs'
import { decorate } from '/src/decorate'
import { checklist } from '/src/checklist'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import type { Region } from '/src/model'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const

interface Snap {
  /** 家具 id → 件数 */
  furniture: Record<string, number>
  /** 检查清单：房间|项目 → have/need */
  checklist: Record<string, string>
}

function snapshot(n: number) {
  const out: Record<string, Snap> = {}
  for (const region of ['jp', 'cn', 'west'] as Region[])
    for (let seed = 1; seed <= n; seed++) {
      const plan = generatePlan({ seed, ...OPTS, region }).plan
      const hh = generateHousehold(plan, seed)
      plan.household = hh
      plan.furniture = decorate(plan, seed, 'auto', hh)
      const furniture: Record<string, number> = {}
      for (const f of [...plan.furniture].sort((a, b) => a.asset.localeCompare(b.asset))) furniture[f.asset] = (furniture[f.asset] ?? 0) + 1
      const cl: Record<string, string> = {}
      for (const it of checklist(plan, hh)) cl[`${it.roomName}|${it.label}`] = `${it.have}/${it.need}`
      out[`${region}#${seed}`] = { furniture, checklist: cl }
    }
  return out
}

function diff(a: Record<string, Snap>, b: Record<string, Snap>) {
  let changed = 0
  const lines: string[] = []
  for (const k of Object.keys(a)) {
    const fa = a[k].furniture
    const fb = b[k]?.furniture ?? {}
    const ids = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()
    const d = ids.filter((id) => (fa[id] ?? 0) !== (fb[id] ?? 0)).map((id) => `${id} ${fa[id] ?? 0}→${fb[id] ?? 0}`)
    const ca = a[k].checklist
    const cb = b[k]?.checklist ?? {}
    const cd = [...new Set([...Object.keys(ca), ...Object.keys(cb)])].filter((x) => ca[x] !== cb[x]).map((x) => `[清单] ${x} ${ca[x] ?? '-'}→${cb[x] ?? '-'}`)
    if (d.length || cd.length) {
      changed++
      lines.push(`${k}: ${[...d, ...cd].join(', ')}`)
    }
  }
  console.log(lines.join('\n'))
  console.log(`\n${changed} / ${Object.keys(a).length} 户有变化`)
}

const args = process.argv.slice(2)
if (args[0] === '--diff') diff(JSON.parse(fs.readFileSync(args[1], 'utf8')), JSON.parse(fs.readFileSync(args[2], 'utf8')))
else {
  const n = Number(args[1] ?? 40)
  fs.writeFileSync(args[0], JSON.stringify(snapshot(n), null, 1))
  console.log(`写入 ${args[0]}`)
}
