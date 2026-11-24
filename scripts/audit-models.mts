// 素材模型体检命令行：检查逻辑在 src/three/modelAudit.ts（测试也用它）。
// 用法：vite-node scripts/audit-models.mts [--only <id 正则>] [--out <json>] [--gap 0.03] [--min-area 1.5]
//       [--checks island,zfight,sink,black,heavy] [--palette <序号> | all]（all：每组配色各查一遍，找纯黑零件这类和配色有关的问题）
//       [--down]（也打印朝下的共面）
// 只报告，不改任何东西；--out 另存完整 JSON。
import '../test/setup/stubdom'
import fs from 'node:fs'
import { ASSETS, type AssetDef } from '/src/three/assets'
import { AUDIT_CHECKS, PROBLEM, auditAsset, hasProblem, type AuditCheck, type AuditReport } from '/src/three/modelAudit'

const argv = process.argv.slice(2)
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const only = arg('--only') ? new RegExp(arg('--only')!) : null
const outFile = arg('--out')
const showDown = argv.includes('--down')
const checks = arg('--checks') ? new Set(arg('--checks')!.split(',') as AuditCheck[]) : undefined
/** 没给的参数留空，用 auditAsset 自己的默认值 */
const num = (k: string) => (arg(k) === undefined ? undefined : Number(arg(k)))
const gap = num('--gap')
const minArea = num('--min-area')
const allPalettes = arg('--palette') === 'all'
const palette = allPalettes ? 0 : (num('--palette') ?? 0)

const reports: AuditReport[] = []
const t0 = Date.now()
for (const def of ASSETS as AssetDef[]) {
  if (only && !only.test(def.id)) continue
  const n = allPalettes ? def.palettes.length : 1
  for (let c = 0; c < n; c++) {
    const rep = auditAsset(def, { gap, minArea, checks, palette: allPalettes ? c : palette })
    if (allPalettes) rep.id += `#${c}`
    if (hasProblem(rep) || (showDown && rep.zfightDown)) reports.push(rep)
  }
}

const LABEL: Record<AuditCheck, string> = { island: '悬空', zfight: '共面', sink: '沉地', black: '纯黑', heavy: '面数偏多' }
const counts = AUDIT_CHECKS.map((k) => `${LABEL[k]} ${reports.filter(PROBLEM[k]).length} 件`)
console.log(`体检完成 ${((Date.now() - t0) / 1000).toFixed(1)}s：${counts.join('，')}，出错 ${reports.filter((r) => r.error).length} 件`)
type ZF = NonNullable<AuditReport['zfight']>
const zf = (label: string, zs: ZF) => `${label}×${zs.length} ` + zs.slice(0, 3).map((z) => `[${z.a}/${z.b} n=${z.normal.join(',')} @${z.at.join(',')} ${z.area}cm² Δ${z.gap}]`).join(' ')
for (const r of reports) {
  const bits: string[] = []
  if (r.error) bits.push(`ERROR ${r.error}`)
  if (r.heavy) bits.push(`${r.tris}△`)
  if (r.sink !== undefined) bits.push(`沉地 ${r.sink}`)
  if (r.black) bits.push(`纯黑零件×${r.black}`)
  if (r.islands) bits.push(`悬空×${r.islands.length} ` + r.islands.slice(0, 3).map((i) => `[${i.n}件 ${i.size.join('×')} @${i.center.join(',')} 距${i.gap} ${i.colors[0]}]`).join(' '))
  if (r.zfight) bits.push(zf('共面', r.zfight))
  if (showDown && r.zfightDown) bits.push(zf('朝下共面', r.zfightDown))
  if (bits.length) console.log(`${r.id}\t${r.name}\t${bits.join(' | ')}`)
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(reports, null, 1))
