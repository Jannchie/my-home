// 一键布置耗时：jp / cn / west 各 seed 1..N（默认 10）跑 decorate，报平均每户耗时（先预热，素材缓存不计入；每户取 ROUNDS 遍里最短的一次）。
// 用法：vite-node scripts/bench-decorate.mts [N=10] [--major]
//       --major：顺带打印每户大件（床、沙发、电视柜、书桌、餐桌、衣柜）的位置，对比布置效果用
import '../test/setup/stubdom'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { ASSET_MAP } from '/src/three/assets'
import { hasTag } from '/src/three/tags'
import { pointInPolygon, type Region } from '/src/model'

const OPTS = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const
const args = process.argv.slice(2)
const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 10)
const major = args.includes('--major')

const cases = (['jp', 'cn', 'west'] as Region[]).flatMap((region) =>
  Array.from({ length: n }, (_, i) => {
    const seed = i + 1
    const plan = generatePlan({ seed, ...OPTS, region }).plan
    const hh = generateHousehold(plan, seed)
    return { region, seed, plan, hh }
  }),
)
// 预热：素材查找缓存、模块初始化
for (const c of cases.slice(0, 3)) decorate(c.plan, c.seed, 'auto', c.hh)

// 每户跑 ROUNDS 遍取最短的一次（机器忙的时候平均值抖得厉害，最短时间更稳）
const ROUNDS = Number(process.env.ROUNDS ?? 3)
const best = new Map<(typeof cases)[number], number>()
for (let round = 0; round < ROUNDS; round++)
  for (const c of cases) {
    const t0 = performance.now()
    const fs = decorate(c.plan, c.seed, 'auto', c.hh)
    const dt = performance.now() - t0
    best.set(c, Math.min(best.get(c) ?? Infinity, dt))
    if (major && round === 0) {
      const big = fs.filter((f) => {
        const d = ASSET_MAP.get(f.asset)
        return d && !f.z && !d.prop && !d.mount && hasTag(d, 'bed', 'sofa', 'tv-stand', 'desk', 'dining-table', 'wardrobe')
      })
      const lines = big.map((f) => {
        const r = c.plan.rooms.find((x) => pointInPolygon(f, x.points))
        return `${r?.kind ?? '?'}:${f.asset}@(${f.x},${f.y},${f.rot})`
      })
      console.log(`${c.region}#${c.seed} ${lines.join(' ')}`)
    }
  }
const per: Record<string, number[]> = { jp: [], cn: [], west: [] }
for (const [c, t] of best) per[c.region].push(t)
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
for (const r of Object.keys(per)) console.log(`${r}: ${avg(per[r]).toFixed(1)} ms/户`)
console.log(`全部: ${avg(Object.values(per).flat()).toFixed(1)} ms/户`)
