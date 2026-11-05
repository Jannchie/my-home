// 预先量好素材定义时要量的模型（three/measured.ts），生成 src/three/measured.generated.ts。
// 用法：pnpm gen:measured（= vite-node scripts/gen-measured.mts）
// 改了吸顶灯、衣物、毛巾的模型后重跑；test/measured.spec.ts 会检查生成文件是否过期。
import '../test/setup/stubdom'
import fs from 'node:fs'
import path from 'node:path'

;(globalThis as { __MEASURE_LIVE__?: boolean }).__MEASURE_LIVE__ = true
const { measuredNow } = await import('/src/three/measured')
await import('/src/three/assets')

const keys = Object.keys(measuredNow).sort()
const body = keys.map((k) => `  ${JSON.stringify(k)}: [${measuredNow[k].join(', ')}],`).join('\n')
const src = `// 由 scripts/gen-measured.mts 自动生成，请勿手改；素材模型变了就运行 pnpm gen:measured。
export const MEASURED: Record<string, readonly number[]> = {
${body}
}
`
const out = path.resolve(process.cwd(), 'src/three/measured.generated.ts')
fs.writeFileSync(out, src)
console.log(`[gen:measured] ${keys.length} 项 → ${path.relative(process.cwd(), out)}`)
