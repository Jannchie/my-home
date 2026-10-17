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
