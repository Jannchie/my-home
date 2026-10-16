// 风格覆盖率统计：每种风格有多少素材 / 配色组（原生、原生 + 派生），以及家具类的覆盖率。
// 用法：npx vite-node scripts/style-coverage.mts [all]
//   加 all 会把全部派生配色真正算一遍（触发探针 build），顺便计时。
import '../test/setup/stubdom'
import { ASSETS } from '/src/three/assets'
import { STYLE_ORDER, derivedPalette, hasDerived, nativeStyle } from '/src/three/stylePalettes'

/** 「家具类」：派生配色要覆盖到 90% 以上的分类 */
const FURN = new Set(['living', 'dining', 'bedroom', 'study', 'storage', 'entrance', 'japanese', 'lighting', 'deco', 'kids'])
const pct = (a: number, b: number) => `${a}/${b} ${((100 * a) / Math.max(1, b)).toFixed(1)}%`

const rows = STYLE_ORDER.map((st) => {
  let nA = 0, nP = 0, aA = 0, aP = 0, fN = 0, fA = 0, fT = 0
  for (const a of ASSETS) {
    const native = a.palettes.filter((_, i) => nativeStyle(a, i) === st).length
    const der = hasDerived(a, st) ? 1 : 0
    if (native) nA++
    if (native || der) aA++
    nP += native
    aP += native + der
    if (FURN.has(a.category) && !a.fixture) {
      fT++
      if (native) fN++
      if (native || der) fA++
    }
  }
  return { 风格: st, 原生素材: nA, 原生配色组: nP, 含派生素材: aA, 含派生配色组: aP, 家具原生: pct(fN, fT), 家具含派生: pct(fA, fT) }
})
console.log(`素材总数 ${ASSETS.length}`)
console.table(rows)

if (process.argv[2] === 'all') {
  const t0 = performance.now()
  let n = 0
  for (const a of ASSETS) for (const st of STYLE_ORDER) if (hasDerived(a, st)) (derivedPalette(a, st), n++)
  console.log(`派生配色 ${n} 组，用时 ${(performance.now() - t0).toFixed(0)} ms`)
}
