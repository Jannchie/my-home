// 素材元数据快照（生产构建里平面图首屏用它代替完整素材，见 vite.config.ts 的 assetMeta 插件）：
// 经过 JSON 往返后数据和完整素材一致；只有数据时派生的改尺寸素材和完整素材派生的占地、可摆放层一致。
import { describe, expect, test } from 'vitest'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { assetSnapshot } from '/src/three/assetSnapshot'
import { deriveResizedMeta, resizeRange } from '/src/three/resize'
import { slotProbeFor } from '/src/three/stylePalettes'

const snap = JSON.parse(JSON.stringify(assetSnapshot())) as ReturnType<typeof assetSnapshot>
const byId = new Map(snap.map((a) => [a.id, a]))
const dataOf = (a: object) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k, v]) => typeof v !== 'function' && k !== 'slotProbe'))))

describe('素材元数据快照', () => {
  test('每件素材都在，数据字段和完整素材一致', () => {
    expect(snap.length).toBe(ASSETS.length)
    const bad = ASSETS.filter((a) => JSON.stringify(dataOf(byId.get(a.id)!)) !== JSON.stringify(dataOf(a))).map((a) => a.id)
    expect(bad).toEqual([])
  })

  test('能派生配色的带着探针结果，和现场探测一致', () => {
    const bad = ASSETS.filter((a) => JSON.stringify(byId.get(a.id)!.slotProbe) !== JSON.stringify(slotProbeFor(a))).map((a) => a.id)
    expect(bad).toEqual([])
  })

  test('改尺寸：只有数据时派生的占地、可摆放层和完整素材派生的一致（自带 resize 的除外）', () => {
    const lookup = (id: string) => byId.get(id)
    const bad: string[] = []
    for (const a of ASSETS) {
      const r = resizeRange(a)
      if (!r || a.ownResize) continue
      const id = `${a.id}@${r.w[1]}x${r.d[0]}`
      const full = ASSET_MAP.get(id)
      // 太小的尺寸（深度不到 5cm）派生本来就拒绝：两边都没有
      if (!full) {
        if (deriveResizedMeta(id, lookup)) bad.push(id + '（只有数据时多派生了）')
        continue
      }
      const meta = deriveResizedMeta(id, lookup)!
      if (JSON.stringify([meta.w, meta.d, meta.surfaces, meta.surfaceShape]) !== JSON.stringify([full.w, full.d, full.surfaces, full.surfaceShape])) bad.push(id)
    }
    expect(bad).toEqual([])
  })
})
