// 预计算素材尺寸修正，生成 src/three/dims.generated.ts（尺寸修正 DIMS + 挂件前后中心 HANG_Z）。
// 用法：pnpm gen:dims（= vite-node scripts/gen-dims.mts）
// 新增 / 修改素材模型后重跑；test/dims.spec.ts 会检查生成文件是否过期。
import '../test/setup/stubdom'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS } from '/src/three/assets'
import { computeDims, computeHang } from '/src/three/dims'

const table = computeDims(ASSETS)
const ids = Object.keys(table)
const body = ids.map((id) => `  ${JSON.stringify(id)}: [${table[id].join(', ')}],`).join('\n')
const hang = computeHang(ASSETS)
const hangBody = Object.keys(hang)
  .map((id) => `  ${JSON.stringify(id)}: ${hang[id]},`)
  .join('\n')
const src = `// 由 scripts/gen-dims.mts 自动生成，请勿手改；素材模型变了就运行 pnpm gen:dims。
// id → [w, d, h, lift]：实测比声明大的素材放大后的尺寸，以及陷地素材需要抬起的高度（cm）。规则见 dims.ts。
import type { DimsTable, HangTable } from './dims'

export const DIMS: DimsTable = {
${body}
}

/** id → 挂起形态模型前后（z）方向的中心（cm，往前为正）：只记偏离挂钩 ≥ 0.3 的。见 AssetMeta.hangZ */
export const HANG_Z: HangTable = {
${hangBody}
}
`
const out = path.resolve(process.cwd(), 'src/three/dims.generated.ts')
fs.writeFileSync(out, src)
console.log(
  `[gen:dims] ${ASSETS.length} 个素材，${ids.length} 个需要修正（其中 ${ids.filter((id) => table[id][3]).length} 个需要抬起），${Object.keys(hang).length} 个挂件不居中 → ${path.relative(process.cwd(), out)}`,
)
