// 名单 → 3D 里的人（three/residentRoster.ts）：在家的载入、出门的留着模型、移出名单的释放、过期的载入作废。
// 不读真的文件、不解析 VRM：residentFile / loadResidentModel 换成假的，模型就是一个带编号的对象。
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Resident } from '/src/residents'

const loads: string[] = []
const disposed: string[] = []
vi.mock('/src/residents', () => ({
  residentStatus: {} as Record<string, string>,
  residentFile: async (file: string) => (file === 'gone' ? null : new Blob([file])),
}))
vi.mock('/src/three/residents', () => ({
  warmResidentLoader: async () => {},
  loadResidentModel: async (b: Blob) => {
    const file = await b.text()
    loads.push(file)
    return { file }
  },
  disposeResidentModel: (m: { file: string }) => disposed.push(m.file),
}))

const { ResidentRoster } = await import('/src/three/residentRoster')
const { residentStatus } = await import('/src/residents')

/** 假的 ResidentLayer：只记谁在家、用的哪个模型 */
function fakeLayer() {
  const home = new Map<string, { file: string }>()
  return {
    home,
    add: (id: string, m: { file: string }) => void home.set(id, m),
    remove: (id: string) => {
      const m = home.get(id)
      home.delete(id)
      return m
    },
  }
}

const r = (id: string, file: string, home = true): Resident => ({ id, name: id, file, home, createdAt: 0 })
const flush = () => new Promise((res) => setTimeout(res, 0))

describe('住户名单 → 3D', () => {
  beforeEach(() => {
    loads.length = 0
    disposed.length = 0
  })

  test('在家的人载入住进来；文件没了标成 missing', async () => {
    const layer = fakeLayer()
    const roster = new ResidentRoster(layer as never, () => {})
    roster.update([r('a', 'fa'), r('b', 'gone'), r('c', 'fc', false)])
    await flush()
    expect([...layer.home.keys()]).toEqual(['a'])
    expect(residentStatus.a).toBe('ok')
    expect(residentStatus.b).toBe('missing')
    expect(loads).toEqual(['fa'])
  })

  test('出门再回家：用留着的模型，不重新载入', async () => {
    const layer = fakeLayer()
    const roster = new ResidentRoster(layer as never, () => {})
    roster.update([r('a', 'fa')])
    await flush()
    const m = layer.home.get('a')
    roster.update([r('a', 'fa', false)])
    expect(layer.home.size).toBe(0)
    roster.update([r('a', 'fa')])
    await flush()
    expect(layer.home.get('a')).toBe(m)
    expect(loads).toEqual(['fa'])
    expect(disposed).toEqual([])
  })

  test('移出名单：留着的模型释放；出门的人多了，先出门的先释放', async () => {
    const layer = fakeLayer()
    const roster = new ResidentRoster(layer as never, () => {})
    roster.update([r('a', 'fa'), r('b', 'fb'), r('c', 'fc')])
    await flush()
    roster.update([r('a', 'fa', false), r('b', 'fb'), r('c', 'fc')])
    roster.update([r('a', 'fa', false), r('b', 'fb', false), r('c', 'fc', false)])
    // 最多留两个：a 最先出门，被释放
    expect(disposed).toEqual(['fa'])
    roster.update([r('c', 'fc', false)])
    expect(disposed).toEqual(['fa', 'fb'])
  })

  test('载入期间出了门：载入的结果作废并释放；沙盘关了全部释放', async () => {
    const layer = fakeLayer()
    const roster = new ResidentRoster(layer as never, () => {})
    roster.update([r('a', 'fa')])
    roster.update([r('a', 'fa', false)])
    await flush()
    expect(layer.home.size).toBe(0)
    expect(disposed).toEqual(['fa'])
    roster.update([r('b', 'fb')])
    await flush()
    roster.dispose()
    expect(layer.home.size).toBe(0)
    expect(disposed).toEqual(['fa', 'fb'])
  })
})
