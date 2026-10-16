// i18n 覆盖率（移植自临时脚本 check-i18n.mjs）：
//   1. 界面文案：src 下所有 t('…') 字面量、组件里的 label / hints 表、各种标签表，ui.ts 里都要有 [ja, en]；
//   2. 房间默认名：ROOM_NAMES 齐全；
//   3. 素材名：name / sizeLabel / formLabel 在 assetNames.ts（或 ui.ts）里的覆盖率。
import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ROOM_NAMES, UI } from '/src/i18n/ui'
import { ASSET_NAMES } from '/src/i18n/assetNames'
import * as M from '/src/model'
import * as KIT from '/src/three/kit'
import * as CAT from '/src/three/catalog'
import * as GEN from '/src/generate'
import * as HH from '/src/household'
import * as DEC from '/src/decorate'
import * as COL from '/src/three/colors'
import * as PAT from '/src/three/patterns'
import { ASSETS } from '/src/three/assets'

/** 素材名覆盖率下限（%）：只许上升，补齐翻译后调高 */
const ASSET_COVERAGE_MIN = 100

const ROOT = path.resolve(__dirname, '..')
const CJK = /[぀-ヿ㐀-鿿]/
const bad = (e: unknown) => !Array.isArray(e) || e.length !== 2 || !e[0] || !e[1]

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(vue|ts)$/.test(e.name) ? [p] : []
  })
}

function uiKeys() {
  const need = new Map<string, string>()
  const add = (k: unknown, from: string) => {
    if (typeof k === 'string' && k && CJK.test(k) && !need.has(k)) need.set(k, from)
  }
  const sep = path.sep
  const files = walk(path.join(ROOT, 'src')).filter((f) => !f.includes(`${sep}i18n${sep}`) && !f.includes(`${sep}packs${sep}`) && !f.endsWith('.generated.ts'))
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    const rel = path.relative(ROOT, f)
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1], rel)
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) add(m[1], rel)
    // t(cond ? 'a' : 'b')
    for (const m of src.matchAll(/\bt\(([^()]*\?[^()]*)\)/g)) for (const s of m[1].matchAll(/'([^']*)'/g)) add(s[1], rel)
    if (f.endsWith('.vue')) {
      for (const m of src.matchAll(/\blabel: '([^']*)'/g)) add(m[1], rel + ' label')
      const hints = /const hints[^{]*\{([\s\S]*?)\n\}/.exec(src)
      if (hints) for (const m of hints[1].matchAll(/: '([^']*)'/g)) add(m[1], rel + ' hints')
    }
  }
  // 检查清单的标签（模板里的数字换成 {n}）
  const cl = fs.readFileSync(path.join(ROOT, 'src/checklist.ts'), 'utf8')
  for (const m of cl.matchAll(/item\((?:r|null), '([^']*)'/g)) add(m[1], 'checklist')
  for (const m of cl.matchAll(/item\((?:r|null), `([^`]*)`/g)) add(m[1].replace(/\$\{[^}]*\}/g, '{n}'), 'checklist')
  add('全屋', 'checklist')

  const vals = (o: object | undefined) => Object.values(o ?? {}) as unknown[]
  const label = (o: object | undefined) => vals(o).map((x) => (x as { label?: string }).label)
  const tables: [string, unknown[]][] = [
    ['model.ts', [...label(M.ROOM_KINDS), ...vals(M.OPENING_LABELS), ...label(M.FIXTURES), ...vals(M.TOILET_TYPES), ...vals(M.BUILTIN_TYPES), ...vals(M.WASHER_STYLES), ...vals(M.FRIDGE_STYLES), ...vals(M.RAILING_KINDS)]],
    ['kit.ts', [...vals(KIT.CATEGORY_LABELS), ...vals(KIT.STYLE_LABELS), ...vals((KIT as Record<string, object>).FORM_LABELS)]],
    ['catalog.ts', vals((CAT as Record<string, object>).SIZE_LABELS)],
    ['generate.ts', vals(GEN.STYLE_LABELS)],
    ['household.ts', [...vals(HH.KIND_LABELS), ...vals(HH.ROLE_LABELS), ...label(HH.TRAITS), ...label(HH.INTERESTS), ...label(HH.JOBS)]],
    ['decorate.ts', vals(DEC.PURPOSE_LABELS)],
    ['colors.ts', [...((COL as Record<string, unknown>).SWATCHES as { label: string }[]).map((x) => x.label), '主色', '副色', '点缀色']],
    ['patterns.ts', ((PAT as Record<string, unknown>).PATTERN_KINDS as { label: string; group: string }[]).flatMap((x) => [x.label, x.group])],
  ]
  for (const [from, ks] of tables) for (const k of ks) add(k, from)
  return need
}

describe('i18n', () => {
  test('界面文案三语齐全', () => {
    const need = uiKeys()
    expect(need.size).toBeGreaterThan(100)
    const miss = [...need].filter(([k]) => bad(UI[k])).map(([k, f]) => `${k}  ← ${f}`)
    expect(miss).toEqual([])
  })

  test('房间默认名三语齐全', () => {
    // 日式 / 中式 / 欧美各生成器里写死的房间名
    const gen = fs
      .readdirSync(path.join(ROOT, 'src'))
      .filter((f) => /^generate.*\.ts$/.test(f))
      .map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'))
      .join('\n')
    const names = new Set(['全屋', '洋室', '和室'])
    for (const m of gen.matchAll(/rect\(\s*'?\w+'?,\s*(?:[^'`,]*\?\s*)?'([^']+)'(?:\s*:\s*'([^']+)')?/g)) [m[1], m[2]].forEach((s) => s && names.add(s))
    for (const m of gen.matchAll(/name: '([^']+)'/g)) names.add(m[1])
    for (const x of Object.values(M.ROOM_KINDS)) names.add(x.label)
    for (const x of Object.values(DEC.PURPOSE_LABELS)) names.add(x)
    expect([...names].filter((k) => bad(ROOM_NAMES[k]))).toEqual([])
  })

  test(`素材名覆盖率 ≥ ${ASSET_COVERAGE_MIN}%`, () => {
    const strs = new Map<string, string>()
    for (const a of ASSETS) for (const s of [a.name, a.sizeLabel, a.formLabel]) if (s && CJK.test(s) && !strs.has(s)) strs.set(s, a.id)
    const miss = [...strs].filter(([s]) => bad(ASSET_NAMES[s]) && bad(UI[s]))
    const pct = (100 * (strs.size - miss.length)) / strs.size
    expect(pct, miss.slice(0, 50).map(([s, id]) => `${s} (${id})`).join('\n')).toBeGreaterThanOrEqual(ASSET_COVERAGE_MIN)
  })
})
