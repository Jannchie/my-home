// 业务代码里写死的素材 id 字面量都要在素材库里存在。
// 扫 decorate / checklist / household / generate* 源码里形如 'xxx-yyy' 的单引号字符串（看起来像素材 id：小写、带连字符或数字），
// 排除各种枚举 / 标签表的键、同类数量规则的分组名、素材系列名后，剩下的必须是 ASSET_MAP 里的 id。
// 发现的缺失先记在 KNOWN_MISSING 里让测试通过；修好后从白名单删掉（白名单里的项若已存在，测试也会提醒删）。
import { expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS, ASSET_MAP } from '/src/three/assets'

const ROOT = path.resolve(__dirname, '..')
const FILES = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^(generate.*|decorate|checklist|household)\.ts$/.test(f))

/** 已知缺失（id → 说明）：确认是 bug 但暂未修 */
const KNOWN_MISSING: Record<string, string> = {}

/** 不是素材 id 的字面量（户型 / 住户 / 生成器里的分组名、键名等） */
const NOT_ASSET = new Set(['three-gen', 'cn-public', 'west-great'])

/** 看起来像素材 id：小写字母开头、只含小写字母数字和连字符，且带连字符或数字 */
const looksLikeId = (s: string) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(s) && /[-0-9]/.test(s)

function scan() {
  const families = new Set(ASSETS.map((a) => a.family).filter(Boolean) as string[])
  const refs = new Map<string, Set<string>>() // id → 出现的文件
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')
    // 同类数量规则的分组名：['rice-cooker', /…/, …]
    const groups = new Set([...src.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*\//g)].map((m) => m[1]))
    for (const m of src.matchAll(/'([^'\\\n]+)'/g)) {
      const s = m[1]
      if (!looksLikeId(s) || groups.has(s) || families.has(s) || NOT_ASSET.has(s)) continue
      if (!refs.has(s)) refs.set(s, new Set())
      refs.get(s)!.add(f)
    }
    // 单词形式的 id（'futon'、'nightstand'）不好和普通字符串区分：只看传给摆放方法的字面量
    for (const m of src.matchAll(/this\.(?:wall|must|freePush|mount|mountAbove|onFixture|squeeze|push|onLevel|free|pick)\(([^()]*)/g))
      for (const [, s] of m[1].matchAll(/'([a-z][a-z0-9]*)'/g)) {
        if (families.has(s) || NOT_ASSET.has(s)) continue
        if (!refs.has(s)) refs.set(s, new Set())
        refs.get(s)!.add(f)
      }
  }
  return refs
}

test('源码里写死的素材 id 都存在（已知缺失除外）', () => {
  const refs = scan()
  // 扫描本身要能命中足够多的真实素材，防止正则失效后测试空转
  expect([...refs.keys()].filter((id) => ASSET_MAP.has(id)).length).toBeGreaterThan(50)
  const missing = [...refs].filter(([id]) => !ASSET_MAP.has(id) && !(id in KNOWN_MISSING)).map(([id, fs]) => `${id}  ← ${[...fs].join(', ')}`)
  expect(missing).toEqual([])
})

test('已知缺失白名单没有过时', () => {
  const refs = scan()
  const stale = Object.keys(KNOWN_MISSING).filter((id) => ASSET_MAP.has(id) || !refs.has(id))
  expect(stale, '这些 id 已经存在或不再被引用，请从 KNOWN_MISSING 删除').toEqual([])
})
