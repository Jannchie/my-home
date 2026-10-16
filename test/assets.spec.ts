// 素材库静态体检：id、配色、尺寸、模型可构建性与实测包围盒。
// 全部 2400+ 素材 build 一遍约 7 秒，只做一遍，各项检查共用测量结果。
import { beforeAll, describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSETS, type AssetDef } from '/src/three/assets'

/** 已知不满足的个例（发现时记录，修好后从这里删掉） */
const KNOWN = {
  /** 实测包围盒超出声明尺寸（壁挂类不参与自动尺寸校正） */
  size: new Set(['jp-kakejiku', 'pl-hanging']),
  /** 壁挂素材的最低点和 mount 对不上 */
  mount: new Set(['pl-hanging']),
}

interface Measured {
  def: AssetDef
  box: THREE.Box3
  nan: boolean
  error?: string
}

const measured: Measured[] = []

beforeAll(() => {
  for (const def of ASSETS) {
    const box = new THREE.Box3()
    try {
      const g = def.build(def.palettes[0] ?? [])
      g.updateMatrixWorld(true)
      box.setFromObject(g, true)
      let nan = false
      g.traverse((m) => {
        const p = (m as THREE.Mesh).geometry?.attributes?.position
        if (!p || nan) return
        const a = p.array
        for (let i = 0; i < a.length; i++)
          if (!Number.isFinite(a[i])) {
            nan = true
            break
          }
      })
      measured.push({ def, box, nan })
    } catch (e) {
      measured.push({ def, box, nan: false, error: (e as Error).message })
    }
  }
}, 300_000)

describe('素材定义', () => {
  test('id 唯一', () => {
    const seen = new Set<string>()
    const dup = ASSETS.filter((a) => seen.has(a.id) || !seen.add(a.id)).map((a) => a.id)
    expect(dup).toEqual([])
  })

  test('palettes 非空，paletteStyles（若有）与 palettes 等长', () => {
    const bad = ASSETS.filter((a) => !a.palettes.length || (a.paletteStyles && a.paletteStyles.length !== a.palettes.length)).map((a) => a.id)
    expect(bad).toEqual([])
  })

  test('尺寸为正', () => {
    const bad = ASSETS.filter((a) => !(a.w > 0 && a.d > 0 && a.h > 0)).map((a) => `${a.id} ${a.w}x${a.d}x${a.h}`)
    expect(bad).toEqual([])
  })
})

describe('素材模型（build(palettes[0])）', () => {
  test('build 不抛错、包围盒非空', () => {
    const bad = measured.filter((m) => m.error || m.box.isEmpty()).map((m) => `${m.def.id}: ${m.error ?? '空模型'}`)
    expect(bad).toEqual([])
  })

  test('顶点坐标无 NaN / Infinity', () => {
    expect(measured.filter((m) => m.nan).map((m) => m.def.id)).toEqual([])
  })

  test('实测包围盒 ≤ 声明尺寸 + 容差（设备除外）', () => {
    const bad: string[] = []
    for (const { def: d, box, error } of measured) {
      if (error || box.isEmpty() || d.fixture || KNOWN.size.has(d.id)) continue
      // 贴附物原点在背面、挂起形态原点在挂钩：不按原点对称，看实际跨度；其余按原点对称（与尺寸校正规则一致）
      const sym = !(d.stick || d.form === 'hanging')
      const sx = sym ? 2 * Math.max(box.max.x, -box.min.x) : box.max.x - box.min.x
      const sz = sym ? 2 * Math.max(box.max.z, -box.min.z) : box.max.z - box.min.z
      const sy = box.max.y - box.min.y
      if (sx > d.w + 2 || sz > d.d + 2 || sy > d.h + 3) bad.push(`${d.id} 声明 ${d.w}x${d.d}x${d.h} 实测 ${sx.toFixed(1)}x${sz.toFixed(1)}x${sy.toFixed(1)}`)
    }
    expect(bad).toEqual([])
  })

  test('落地素材最低点 ≈ 0', () => {
    const bad = measured
      .filter(({ def: d, box, error }) => !error && !box.isEmpty() && d.mount == null && !d.stick && d.form !== 'hanging' && Math.abs(box.min.y) > 0.6)
      .map(({ def, box }) => `${def.id} minY=${box.min.y.toFixed(2)}`)
    expect(bad).toEqual([])
  })

  test('壁挂素材最低点 ≈ mount', () => {
    const bad = measured
      .filter(({ def: d, box, error }) => !error && !box.isEmpty() && d.mount != null && !KNOWN.mount.has(d.id) && Math.abs(box.min.y - d.mount) > 3)
      .map(({ def, box }) => `${def.id} mount=${def.mount} minY=${box.min.y.toFixed(1)}`)
    expect(bad).toEqual([])
  })

  test('挂起形态整体在挂钩（原点）下方', () => {
    const bad = measured
      .filter(({ def: d, box, error }) => !error && !box.isEmpty() && d.form === 'hanging' && box.max.y > 1)
      .map(({ def, box }) => `${def.id} maxY=${box.max.y.toFixed(1)}`)
    expect(bad).toEqual([])
  })

  test('白名单里的个例仍然存在（修好了就从 KNOWN 删掉）', () => {
    const ids = new Set(ASSETS.map((a) => a.id))
    expect([...KNOWN.size, ...KNOWN.mount].filter((id) => !ids.has(id))).toEqual([])
  })
})
