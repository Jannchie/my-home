// 素材材质标注的检查报告：每件素材的配色槽、每一槽有多少零件、零件现在解析成了什么材质（mats.ts resolveMats），标注了没有。
// 用法：pnpm mat:report [筛选...]  筛选是素材 id 前缀或定义所在的文件名（如 bedroom-extra、assets.ts）；--todo 只列没标注的
import '../test/setup/stubdom'
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { ASSETS } from '/src/three/assets'
import { resolveMats } from '/src/three/mats'

const args = process.argv.slice(2)
const todo = args.includes('--todo')
const filters = args.filter((a) => !a.startsWith('--'))

// 素材 id → 定义所在的文件（按 id 字面量反查；拼出来的 id 找不到的记成 ?）
const root = path.resolve(process.cwd(), 'src/three')
const files: [string, string][] = []
const walk = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) {
      // 标注表里也写着 id，不算定义处
      if (f !== 'matTables') walk(p)
    }
    // 生成的表、旧 id 迁移表里也列着 id，不算定义处
    else if (f.endsWith('.ts') && !f.endsWith('.generated.ts') && f !== 'family.legacy.ts') files.push([path.relative(root, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8')])
  }
}
walk(root)
const fileOf = (id: string) => {
  const exact = files.find(([, src]) => src.includes(`'${id}'`) || src.includes(`"${id}"`))
  if (exact) return exact[0]
  // 拼出来的 id（`gm-${name}`）：按前缀找写着这个前缀的文件
  const pre = id.slice(0, id.indexOf('-') + 1)
  const byPrefix = pre && files.find(([, src]) => src.includes(`'${pre}`) || src.includes(`\`${pre}`))
  return byPrefix ? byPrefix[0] + '*' : '?'
}

const hex = (c: string) => new THREE.Color(c).getHexString()
let shown = 0
let annotated = 0
for (const def of ASSETS) {
  const file = fileOf(def.id)
  if (filters.length && !filters.some((f) => def.id.startsWith(f) || file.includes(f))) continue
  const has = !!(def.mats || def.mat)
  if (has) annotated++
  if (todo && has) continue
  const pal = def.palettes[0] ?? []
  let g: THREE.Group
  try {
    g = def.build(pal)
  } catch (e) {
    console.log(`${def.id}  [build 出错] ${(e as Error).message}`)
    continue
  }
  resolveMats(g, def, pal)
  // 每一槽（零件颜色 = 配色槽颜色）的零件数和解析结果；其余零件按材质汇总
  const perSlot = pal.map(() => new Map<string, number>())
  const other = new Map<string, number>()
  const slotOf = new Map(pal.map((c, i) => [hex(c), i]))
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.isOutline) return
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshToonMaterial
    const i = mat?.color ? slotOf.get(mat.color.getHexString()) : undefined
    const bucket = i === undefined ? other : perSlot[i]
    const k = String(o.userData.mat)
    bucket.set(k, (bucket.get(k) ?? 0) + 1)
  })
  const fmt = (m: Map<string, number>) => [...m].map(([k, n]) => `${k}×${n}`).join(' ') || '-'
  const slots = pal.map((c, i) => `[${i}] ${c} → ${fmt(perSlot[i])}`).join('  ')
  console.log(`${def.id}  ${def.name}  type=${def.type ?? '-'}  ${file}  ${has ? `标注=${JSON.stringify(def.mats ?? [])}${def.mat ? ' mat=' + def.mat : ''}` : '未标注'}\n    ${slots}\n    其它零件 → ${fmt(other)}`)
  shown++
}
console.log(`\n共 ${shown} 件；全部素材里已标注 ${annotated} / ${ASSETS.length}`)
