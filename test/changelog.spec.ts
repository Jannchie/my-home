// 更新日志：第一条就是当前版本，三种语言条目齐全、条数一致
import { expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CHANGELOG } from '/src/changelog'

test('更新日志第一条与 package.json 的版本一致', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))
  expect(CHANGELOG[0].version).toBe(pkg.version)
})

test('每个版本三种语言都有条目，且条数一致', () => {
  const bad = CHANGELOG.filter((r) => {
    const n = r.notes.zh.length
    return !n || r.notes.ja.length !== n || r.notes.en.length !== n
  }).map((r) => r.version)
  expect(bad).toEqual([])
})
