// 生成文件没有过期：gen:tags / gen:taxonomy 用 --check 重新生成并和已提交的文件比较（不写文件）。
// 过期时按提示运行对应的 pnpm 命令并提交。脚本各自加载全部素材，放在子进程里跑。
import { execSync } from 'node:child_process'
import path from 'node:path'
import { expect, test } from 'vitest'

const root = path.resolve(__dirname, '..')
function check(script: string) {
  try {
    execSync(`npx vite-node ${script} --check`, { cwd: root, stdio: 'pipe', encoding: 'utf8' })
    return ''
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || String(e)
  }
}

test('tags.generated.ts 未过期（pnpm gen:tags）', () => {
  expect(check('scripts/migrate-tags.mts')).toBe('')
})

test('taxonomy.generated.ts 未过期（pnpm gen:taxonomy）', () => {
  expect(check('scripts/gen-taxonomy.mts')).toBe('')
})

// 旧系列字段 family 已删除（迁移到 type / series / limitGroup）：素材定义里不能再带它；
// 冻结表 LEGACY_FAMILY 只用于派生配色的分组键（保证已有素材派生配色不变）和迁移脚本，不能指向不存在的素材。
test('family 已迁移，冻结表与素材一致', async () => {
  const { ASSETS, ASSET_MAP } = await import('/src/three/assets')
  const { LEGACY_FAMILY } = await import('/src/three/family.legacy')
  const { paletteKey } = await import('/src/three/stylePalettes')
  expect(ASSETS.filter((a) => 'family' in a).map((a) => a.id)).toEqual([])
  expect(Object.keys(LEGACY_FAMILY).filter((id) => !ASSET_MAP.has(id))).toEqual([])
  expect(ASSETS.filter((a) => paletteKey(a) !== (LEGACY_FAMILY[a.id] ?? a.id)).map((a) => a.id)).toEqual([])
})
