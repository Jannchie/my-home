import { describe, expect, test } from 'vitest'
import { ASSET_MAP } from '/src/three/assets'
import { MATS } from '/src/three/matIds'
import { MAT_TABLE, MAT_TABLE_SOURCES } from '/src/three/matTables'

describe('材质标注表', () => {
  test('id 都存在、只写在一处、类别合法、槽数不超过配色', () => {
    const valid = new Set<string>(MATS)
    const problems: string[] = []
    for (const [id, e] of Object.entries(MAT_TABLE)) {
      const def = ASSET_MAP.get(id)
      if (!def) {
        problems.push(`${id}：没有这件素材`)
        continue
      }
      if (MAT_TABLE_SOURCES[id].length > 1) problems.push(`${id}：重复写在 ${MAT_TABLE_SOURCES[id].join('、')}`)
      const mats = Array.isArray(e) ? e : (e.mats ?? [])
      const mat = Array.isArray(e) ? undefined : e.mat
      for (const m of [...mats, mat]) if (m && !valid.has(m)) problems.push(`${id}：不认识的材质 ${m}`)
      const slots = Math.max(...def.palettes.map((p) => p.length))
      if (mats.length > slots) problems.push(`${id}：标了 ${mats.length} 槽，配色只有 ${slots} 槽`)
    }
    expect(problems).toEqual([])
  })
})
