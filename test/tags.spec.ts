// 语义标签：词表完整、每件素材都有功能标签，以及业务代码不再按素材名字 / id 子串判断类别（防回归）。
import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { FIXED_TAGS, FUNCTION_TAGS } from '/src/three/tags'
import { GENERATED_TAGS } from '/src/three/tags.generated'
import { INTERESTS } from '/src/household'
import { TAXONOMY } from '/src/three/taxonomy.generated'
import { TYPE_NAMES } from '/src/three/typeLabels'

const ROOT = path.resolve(__dirname, '..')

describe('素材标签', () => {
  test('每件素材（设备除外）至少有一个功能标签', () => {
    const func = new Set<string>(FUNCTION_TAGS)
    const bad = ASSETS.filter((a) => !a.fixture && !(a.tags ?? []).some((t) => func.has(t))).map((a) => `${a.id} ${a.name}`)
    expect(bad).toEqual([])
  })

  test('标签只用词表里的值（hobby:<兴趣> 要对得上 household.ts 的兴趣）', () => {
    const fixed = new Set(FIXED_TAGS)
    const interests = new Set(Object.keys(INTERESTS))
    const ok = (t: string) => fixed.has(t) || (t.startsWith('hobby:') && interests.has(t.slice(6)))
    const bad = ASSETS.flatMap((a) => (a.tags ?? []).filter((t) => !ok(t)).map((t) => `${a.id}: ${t}`))
    expect(bad).toEqual([])
  })

  test('词表里的每个标签都有素材在用（生成表没过期、没有死标签）', () => {
    const used = new Set(ASSETS.flatMap((a) => a.tags ?? []))
    expect(FIXED_TAGS.filter((t) => !used.has(t))).toEqual([])
    // 兴趣标签：有分类以外匹配的兴趣（tagged）都要有素材
    const tagged = Object.entries(INTERESTS)
      .filter(([, v]) => [v.floor, v.props, v.wall].some((m) => m?.tagged))
      .map(([k]) => `hobby:${k}`)
    expect(tagged.filter((t) => !used.has(t))).toEqual([])
  })

  test('生成表里的 id 都是现有素材', () => {
    expect(Object.keys(GENERATED_TAGS).filter((id) => !ASSET_MAP.has(id))).toEqual([])
    expect(Object.keys(TAXONOMY).filter((id) => !ASSET_MAP.has(id))).toEqual([])
  })
})

describe('细分类型与同款系列', () => {
  test('每件素材（设备除外）都有细分类型，且是有显示名的功能标签，素材自己也带着这个标签或由系列迁移而来', () => {
    const func = new Set<string>(FUNCTION_TAGS)
    const bad = ASSETS.filter((a) => !a.fixture && (!a.type || !func.has(a.type) || !(a.type in TYPE_NAMES))).map((a) => `${a.id}: ${a.type}`)
    expect(bad).toEqual([])
  })

  test('同款系列只收同一造型：同一尺寸 / 款式名（sizeLabel）下只能靠 form 区分，成员的细分类型一致', () => {
    const by = new Map<string, typeof ASSETS>()
    for (const a of ASSETS) if (!a.fixture) (by.get(a.series!) ?? by.set(a.series!, []).get(a.series!)!).push(a)
    const bad: string[] = []
    for (const [s, xs] of by) {
      if (xs.length < 2) continue
      if (new Set(xs.map((a) => a.type)).size > 1) bad.push(`${s}: 细分类型不一致 ${[...new Set(xs.map((a) => a.type))]}`)
      const groups = new Map<string, string[]>()
      for (const a of xs) {
        const k = a.sizeLabel ?? ''
        groups.set(k, [...(groups.get(k) ?? []), `${a.form ?? ''}|${a.formLabel ?? ''}`])
      }
      for (const [k, forms] of groups) if (forms.length !== new Set(forms).size) bad.push(`${s}「${k}」: 同一款里有重复的 form（不是同一件东西的不同陈设）`)
    }
    expect(bad).toEqual([])
  })
})

/**
 * 业务规则文件里不能再按素材名字 / id 子串判断类别：
 *   - 正则字面量不能含中文（素材名字是中文；房间名的判断除外，见 ROOM_NAME）
 *   - 正则字面量必须锚定在 id 开头（^…，每个顶层分支都以 ^ 开头）：只用来点名具体素材或成套系列，类别一律用标签
 *   - new RegExp 的模板也必须以 ^ 开头
 *   - 素材的 name 不能参与匹配（.test / .match / .includes / 模板字符串拼接）
 *   - 不用已废弃的 family 字段（细分类型用 type，同款系列用 series）
 */
const FILES = [
  'src/decorate.ts',
  'src/checklist.ts',
  'src/household.ts',
  'src/workstation.ts',
  'src/homecams.ts',
  'src/appliance.ts',
  'src/surface.ts',
  'src/snap.ts',
  'src/three/lights.ts',
  'src/three/house.ts',
  'src/three/post.ts',
  'src/three/actors.ts',
  'src/three/catalog.ts',
  'src/generate.ts',
  'src/store.ts',
]
/** 匹配房间名（不是素材）的正则：收纳间是鞋柜 / 食品库 / リネン庫 / WIC，按房间名判断 */
const ROOM_NAME = /^\s*\.test\((room|r)\.name\)/

/** 去掉注释和字符串内容（保留引号，便于判断上下文），行号不变 */
function strip(src: string) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) out += src[i++] === '\n' ? '\n' : ''
      i += 2
    } else if (c === "'" || c === '"') {
      out += c
      i++
      while (i < src.length && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') i++
        i++
      }
      out += c
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

/** 顶层的 | 分支 */
function branches(re: string) {
  const out: string[] = []
  let depth = 0
  let cls = false
  let cur = ''
  for (let i = 0; i < re.length; i++) {
    const c = re[i]
    if (c === '\\') {
      cur += c + re[++i]
      continue
    }
    if (cls) cls = c !== ']'
    else if (c === '[') cls = true
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === '|' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

const CJK = /[぀-ヿ㐀-鿿]/
const REGEX_LIT = /(^|[(,=:[!&|?{};]|\breturn)\s*\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/([dgimsuy]*)/gm

function lint(file: string) {
  const src = strip(fs.readFileSync(path.join(ROOT, file), 'utf8'))
  const bad: string[] = []
  const lineOf = (i: number) => src.slice(0, i).split('\n').length
  for (const m of src.matchAll(REGEX_LIT)) {
    const body = m[2]
    const at = `${file}:${lineOf(m.index!)} /${body}/`
    if (ROOM_NAME.test(src.slice(m.index! + m[0].length, m.index! + m[0].length + 40))) continue
    if (CJK.test(body)) bad.push(`${at}  含中文（按名字匹配）`)
    else if (!branches(body).every((b) => b.startsWith('^'))) bad.push(`${at}  没有锚定在 id 开头`)
  }
  for (const m of src.matchAll(/new RegExp\(\s*([`'"])(.)/g)) if (m[2] !== '^') bad.push(`${file}:${lineOf(m.index!)} new RegExp 没有锚定在 id 开头`)
  // 旧的 family 字段不再参与业务判断（用 type / series）
  for (const m of src.matchAll(/\.family\b/g)) bad.push(`${file}:${lineOf(m.index!)} 用了已废弃的 family（改用 type / series）`)
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
  raw.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    if (/\.(test|match|search|includes|startsWith|endsWith)\([^)]*\.name\b/.test(code) && !/\b(room|r)\.name\b/.test(code)) bad.push(`${file}:${i + 1} 名字参与匹配`)
    if (/\$\{[^}]*\.name\b[^}]*\}/.test(code) && /\.test\(|\.match\(/.test(code)) bad.push(`${file}:${i + 1} 名字拼进匹配串`)
  })
  return bad
}

describe('业务代码不按名字 / id 子串判断素材类别', () => {
  test('lint 本身能抓到违规写法', () => {
    const sample = strip("const a = /desk|书桌/.test(x)\nconst b = /^ok$/\nconst c = /^a|b/\nif (/WIC/.test(room.name)) {}\n")
    const hits = [...sample.matchAll(REGEX_LIT)].map((m) => m[2])
    expect(hits).toEqual(['desk|书桌', '^ok$', '^a|b', 'WIC'])
    expect(branches('^a|b').every((b) => b.startsWith('^'))).toBe(false)
    expect(branches('^(a|b)$').every((b) => b.startsWith('^'))).toBe(true)
  })

  test('扫描确实读到了这些文件里的正则（防止 lint 空转）', () => {
    const n = FILES.reduce((s, f) => s + [...strip(fs.readFileSync(path.join(ROOT, f), 'utf8')).matchAll(REGEX_LIT)].length, 0)
    expect(n).toBeGreaterThan(100)
  })

  for (const f of FILES) test(f, () => expect(lint(f)).toEqual([]))
})
