// 素材几何体检（src/three/modelAudit.ts）：悬空零件、看得见的共面闪烁、沉到地下、纯黑零件、build 出错。
// 新素材、改模型时这些问题一律不许出现；已核实不是缺陷的个例记在 KNOWN 里（写明原因，修好了就删掉）。
// 面数偏多只在脚本里报（scripts/audit-models.mts），不进测试：笼子、网格这类靠大量细丝撑起来的造型面数高是正常的。
import { beforeAll, describe, expect, test } from 'vitest'
import { ASSETS } from '/src/three/assets'
import { PROBLEM, auditAsset, type AuditCheck, type AuditReport } from '/src/three/modelAudit'

type Checked = Exclude<AuditCheck, 'heavy' | 'near'>
const LABEL: Record<Checked, string> = { island: '没有悬空的零件', zfight: '没有看得见的共面闪烁', sink: '落地素材不沉到地下', black: '默认配色没有纯黑零件' }

/** 已核实的个例：检查项 → id → 为什么不算缺陷 */
const KNOWN: Record<Checked, Record<string, string>> = { island: {}, zfight: {}, sink: {}, black: {} }

const CHECKS = Object.keys(KNOWN) as Checked[]
const reports = new Map<string, AuditReport>()

beforeAll(() => {
  const checks = new Set<AuditCheck>(CHECKS)
  for (const def of ASSETS) reports.set(def.id, auditAsset(def, { checks }))
}, 600_000)

describe('素材几何体检', () => {
  test('build 不出错', () => {
    expect([...reports.values()].filter((r) => r.error).map((r) => `${r.id}: ${r.error}`)).toEqual([])
  })
  for (const k of CHECKS)
    test(LABEL[k], () => {
      expect([...reports.values()].filter((r) => PROBLEM[k](r) && !(r.id in KNOWN[k])).map((r) => r.id)).toEqual([])
    })
  test('白名单里的个例仍然存在、仍然有这个问题（修好了就删掉）', () => {
    const stale = CHECKS.flatMap((k) => Object.keys(KNOWN[k]).filter((id) => !reports.has(id) || !PROBLEM[k](reports.get(id)!)).map((id) => `${k}: ${id}`))
    expect(stale).toEqual([])
  })
})
