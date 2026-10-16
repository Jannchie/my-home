// 预计算素材尺寸修正，生成 src/three/dims.generated.ts。
// 用法：pnpm gen:dims（= vite-node scripts/gen-dims.mts）
// 新增 / 修改素材模型后重跑；test/dims.spec.ts 会检查生成文件是否过期。
import '../test/setup/stubdom'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS } from '/src/three/assets'
import { computeDims } from '/src/three/dims'

const table = computeDims(ASSETS)
const ids = Object.keys(table)
const body = ids.map((id) => `  ${JSON.stringify(id)}: [${table[id].join(', ')}],`).join('\n')
const src = `// 由 scripts/gen-dims.mts 自动生成，请勿手改；素材模型变了就运行 pnpm gen:dims。
// id → [w, d, h, lift]：实测比声明大的素材放大后的尺寸，以及陷地素材需要抬起的高度（cm）。规则见 dims.ts。
import type { DimsTable } from './dims'

export const DIMS: DimsTable = {
${body}
}
`
const out = path.resolve(process.cwd(), 'src/three/dims.generated.ts')
fs.writeFileSync(out, src)
console.log(`[gen:dims] ${ASSETS.length} 个素材，${ids.length} 个需要修正（其中 ${ids.filter((id) => table[id][3]).length} 个需要抬起）→ ${path.relative(process.cwd(), out)}`)
