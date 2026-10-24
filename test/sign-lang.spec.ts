// 带字素材按界面语言出版本（signLang.ts）：build 里读了语言的都要标 lingual（否则切语言不重建、缓存串版），
// 标了的切语言后模板键要变。
import { afterEach, describe, expect, test } from 'vitest'
import { lang } from '/src/i18n'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { furnitureTemplateKey } from '/src/three/house'
import { lingualKey, say, signReads } from '/src/three/signLang'

const keep = lang.value
afterEach(() => {
  lang.value = keep
})

describe('带字素材按语言出版本', () => {
  test('build 里读了语言的素材正好是标了 lingual 的', () => {
    const unmarked: string[] = []
    const silent: string[] = []
    for (const a of ASSETS) {
      const r0 = signReads()
      a.build(a.palettes[0] ?? [])
      const read = signReads() > r0
      if (read && !a.lingual) unmarked.push(a.id)
      if (!read && a.lingual) silent.push(a.id)
    }
    expect(unmarked).toEqual([])
    expect(silent).toEqual([])
  })

  test('奖状、标签这些标了 lingual', () => {
    for (const id of ['hg-cert-award-m', 'hg-cert-diploma-l', 'chore-sort-bin-4', 'chore-dish-soap', 'lm-doormat-rect', 'ss-letterboard', 'sb-carton-stack-3'])
      expect(ASSET_MAP.get(id)?.lingual, id).toBe(true)
  })

  test('切语言：带字素材的模板键变，别的不变', () => {
    const keys = (asset: string) =>
      (['zh', 'ja', 'en'] as const).map((l) => {
        lang.value = l
        return furnitureTemplateKey({ asset })
      })
    expect(new Set(keys('hg-cert-award-m')).size).toBe(3)
    expect(new Set(keys('sofa')).size).toBe(1)
    lang.value = 'en'
    expect(lingualKey(ASSET_MAP.get('hg-cert-award-m'))).toBe('en')
    expect(say({ zh: '奖状', ja: '賞状', en: 'Certificate' })).toBe('Certificate')
  })
})
