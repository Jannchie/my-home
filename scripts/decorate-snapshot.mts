// 一键布置结果快照：jp / cn / west 各 seed 1..N 跑一遍 decorate + 检查清单，写成 JSON，用来对比重构前后的布置结果。
// 用法：vite-node scripts/decorate-snapshot.mts <out.json> [N=40]
//       vite-node scripts/decorate-snapshot.mts --diff <before.json> <after.json>   按户列出家具 id 多重集合的差异
//       vite-node scripts/decorate-snapshot.mts --agg <before.json> <after.json>    汇总：总件数、分类件数、各素材全量增减、摆放位置的变化
import '../test/setup/stubdom'
import fs from 'node:fs'
import { decorate } from '/src/decorate'
import { checklist } from '/src/checklist'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { ASSET_MAP } from '/src/three/assets'
import { furnitureBox } from '/src/snap'
import type { Furniture, Region } from '/src/model'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const

interface Snap {
  /** 家具 id → 件数 */
  furniture: Record<string, number>
  /** 检查清单：房间|项目 → have/need */
  checklist: Record<string, string>
  /** 摆在别的家具上的东西：「素材>所在家具」→ 件数（高于 140cm 的记作 素材>家具^） */
  on: Record<string, number>
}

/** 摆件下面是哪件家具：顶面 / 层板高度和 z 对得上、中心落在占地里 */
function parentOf(all: Furniture[], f: Furniture) {
  const z = f.z ?? 0
  for (const o of all) {
    if (o === f) continue
    const d = ASSET_MAP.get(o.asset)
    if (!d || d.prop) continue
    const levels = [...(d.surface ? [d.surface] : []), ...(d.surfaces ?? []).map((l) => l.y)].map((y) => (o.z ?? 0) + y)
    if (!levels.some((y) => Math.abs(y - z) < 0.6)) continue
    const b = furnitureBox(o.asset, o.x, o.y, o.rot)
    if (f.x >= b.x0 - 1 && f.x <= b.x1 + 1 && f.y >= b.y0 - 1 && f.y <= b.y1 + 1) return o
  }
  return null
}

function snapshot(n: number) {
  const out: Record<string, Snap> = {}
  for (const region of ['jp', 'cn', 'west'] as Region[])
    for (let seed = 1; seed <= n; seed++) {
      const plan = generatePlan({ seed, ...OPTS, region }).plan
      const hh = generateHousehold(plan, seed)
      plan.household = hh
      // DECOR_SEED_OFFSET：只换一键布置的随机种子（户型、住户不变），用来估计「纯随机」带来的差异有多大
      plan.furniture = decorate(plan, seed + Number(process.env.DECOR_SEED_OFFSET ?? 0), 'auto', hh)
      const furniture: Record<string, number> = {}
      for (const f of [...plan.furniture].sort((a, b) => a.asset.localeCompare(b.asset))) furniture[f.asset] = (furniture[f.asset] ?? 0) + 1
      const cl: Record<string, string> = {}
      for (const it of checklist(plan, hh)) cl[`${it.roomName}|${it.label}`] = `${it.have}/${it.need}`
      const on: Record<string, number> = {}
      for (const f of plan.furniture) {
        const d = ASSET_MAP.get(f.asset)
        if (!d?.prop || !f.z) continue
        const p = parentOf(plan.furniture, f)
        if (!p) continue
        const k = `${f.asset}>${p.asset}${(f.z ?? 0) > 140 ? '^' : ''}`
        on[k] = (on[k] ?? 0) + 1
      }
      out[`${region}#${seed}`] = { furniture, checklist: cl, on }
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

/** 全量汇总对比 */
function agg(a: Record<string, Snap>, b: Record<string, Snap>) {
  const sum = (s: Record<string, Snap>, key: 'furniture' | 'on') => {
    const m = new Map<string, number>()
    for (const v of Object.values(s)) for (const [id, n] of Object.entries(v[key] ?? {})) m.set(id, (m.get(id) ?? 0) + n)
    return m
  }
  const fa = sum(a, 'furniture')
  const fb = sum(b, 'furniture')
  const total = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0)
  console.log(`总件数 ${total(fa)} → ${total(fb)}`)
  // 每户件数的变化幅度
  const per = Object.keys(a).map((k) => {
    const x = a[k].furniture
    const y = b[k]?.furniture ?? {}
    const ids = new Set([...Object.keys(x), ...Object.keys(y)])
    let same = 0
    let all = 0
    for (const id of ids) {
      same += Math.min(x[id] ?? 0, y[id] ?? 0)
      all += Math.max(x[id] ?? 0, y[id] ?? 0)
    }
    return same / Math.max(1, all)
  })
  per.sort((p, q) => p - q)
  console.log(`每户家具多重集合的重合度（交 / 并）：最低 ${per[0].toFixed(2)}，中位 ${per[Math.floor(per.length / 2)].toFixed(2)}，平均 ${(per.reduce((x, y) => x + y, 0) / per.length).toFixed(2)}`)
  const cat = (m: Map<string, number>) => {
    const c = new Map<string, number>()
    for (const [id, n] of m) {
      const k = ASSET_MAP.get(id)?.category ?? '?'
      c.set(k, (c.get(k) ?? 0) + n)
    }
    return c
  }
  const ca = cat(fa)
  const cb = cat(fb)
  console.log('\n分类件数：')
  for (const k of [...new Set([...ca.keys(), ...cb.keys()])].sort()) console.log(`  ${k.padEnd(12)} ${ca.get(k) ?? 0} → ${cb.get(k) ?? 0}`)
  const delta = [...new Set([...fa.keys(), ...fb.keys()])].map((id) => [id, (fb.get(id) ?? 0) - (fa.get(id) ?? 0), fa.get(id) ?? 0, fb.get(id) ?? 0] as const).filter(([, d]) => d)
  delta.sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))
  console.log('\n全量增减最大的素材（120 户合计）：')
  for (const [id, , x, y] of delta.slice(0, 60)) console.log(`  ${id} ${ASSET_MAP.get(id)?.name ?? ''} ${x} → ${y}`)
  const oa = sum(a, 'on')
  const ob = sum(b, 'on')
  const od = [...new Set([...oa.keys(), ...ob.keys()])].map((k) => [k, oa.get(k) ?? 0, ob.get(k) ?? 0] as const).filter(([, x, y]) => x !== y)
  fs.writeFileSync(process.argv[5] ?? 'on-diff.tsv', od.map((r) => r.join('\t')).join('\n'))
}

const args = process.argv.slice(2)
if (args[0] === '--diff') diff(JSON.parse(fs.readFileSync(args[1], 'utf8')), JSON.parse(fs.readFileSync(args[2], 'utf8')))
else if (args[0] === '--agg') agg(JSON.parse(fs.readFileSync(args[1], 'utf8')), JSON.parse(fs.readFileSync(args[2], 'utf8')))
else {
  const n = Number(args[1] ?? 40)
  fs.writeFileSync(args[0], JSON.stringify(snapshot(n), null, 1))
  console.log(`写入 ${args[0]}`)
}
