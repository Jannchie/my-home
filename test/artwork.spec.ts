// 装饰画的画面：画种库、素材接线、挑画不重复、存档 / 分享链接带上画面
import { describe, expect, test } from 'vitest'
import { ART_ASSETS, artDraw, artFaceCalls, cycleArt, motifsFor, motifsOfKind, parseArt, pickArt, rerollArt, withArt, type ArtKind } from '/src/three/artwork'
import { MOTIFS, mulberry } from '/src/three/artMotifs'
import { ASSET_MAP } from '/src/three/assets'
import { furnitureTemplateKey } from '/src/three/house'
import { fromCompact, toCompact } from '/src/share'
import { decorate } from '/src/decorate'
import { generateHousehold } from '/src/household'
import type { StyleTag } from '/src/three/kit'
import { genJp } from './helpers'

const STYLES: StyleTag[] = ['cute', 'nordic', 'modern', 'japanese', 'industrial', 'retro', 'chinese', 'classic', 'farmhouse']
const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D

describe('画种库', () => {
  test('画种 id 唯一，至少 40 种', () => {
    expect(new Set(MOTIFS.map((m) => m.id)).size).toBe(MOTIFS.length)
    expect(MOTIFS.length).toBeGreaterThanOrEqual(40)
  })

  test('每个画种在各种比例、各种种子下都能画（不抛错）', () => {
    for (const m of MOTIFS)
      for (const [W, H] of [
        [512, 384],
        [180, 512],
        [512, 200],
        [64, 64],
      ])
        for (let s = 0; s < 4; s++) expect(() => m.draw(ctx, W, H, mulberry(s * 977 + 3)), m.id).not.toThrow()
  })

  test('每种风格的挂画 / 照片 / 海报都有至少 3 个画种可挑；和风、中式有挂轴', () => {
    for (const st of STYLES)
      for (const k of ['painting', 'photo', 'poster', 'kids'] as ArtKind[]) {
        const own = motifsOfKind(k).filter((m) => m.styles.includes(st))
        expect(motifsFor(k, st).length, `${st}/${k}`).toBeGreaterThanOrEqual(3)
        if (k === 'painting') expect(own.length, `${st}/painting 专属`).toBeGreaterThanOrEqual(4)
      }
    for (const st of ['japanese', 'chinese'] as StyleTag[]) expect(motifsOfKind('scroll').filter((m) => m.styles.includes(st)).length).toBeGreaterThanOrEqual(5)
  })

  test('画面字符串：解析、循环、换一版', () => {
    expect(parseArt('fuji.42')).toMatchObject({ seed: 42 })
    expect(parseArt('nope.1')).toBeNull()
    expect(parseArt(undefined)).toBeNull()
    expect(artDraw('bad')).toBeNull()
    const list = motifsOfKind('scroll')
    let a = cycleArt(undefined, 'scroll', 1)
    expect(parseArt(a)!.motif).toBe(list[0])
    for (let i = 0; i < list.length; i++) a = cycleArt(a, 'scroll', 1)
    expect(parseArt(a)!.motif).toBe(list[0])
    expect(parseArt(cycleArt(a, 'scroll', -1))!.motif).toBe(list[list.length - 1])
    const b = rerollArt('fuji.5', 'painting')
    expect(parseArt(b)!.motif.id).toBe('fuji')
    expect(b).not.toBe('fuji.5')
  })

  test('挑画：同一户里先把画种用遍再重复', () => {
    const used = new Map<string, number>()
    const r = mulberry(7)
    const pool = motifsFor('painting', 'nordic')
    const got = Array.from({ length: pool.length }, () => parseArt(pickArt('painting', 'nordic', r, used))!.motif.id)
    expect(new Set(got).size).toBe(pool.length)
  })
})

describe('素材接线', () => {
  test('登记的素材都存在，构建时都会读画面', () => {
    for (const [id, kind] of Object.entries(ART_ASSETS)) {
      const def = ASSET_MAP.get(id)
      expect(def, id).toBeTruthy()
      const art = pickArt(kind, undefined, mulberry(1))
      const before = artFaceCalls()
      withArt(art, () => def!.build(def!.palettes[0] ?? []))
      expect(artFaceCalls(), id).toBeGreaterThan(before)
    }
  })

  test('模板缓存键含画面', () => {
    const base = { asset: 'wall-art-mountain', color: 0 }
    expect(furnitureTemplateKey(base)).not.toBe(furnitureTemplateKey({ ...base, art: 'fuji.1' }))
    expect(furnitureTemplateKey({ ...base, art: 'fuji.1' })).not.toBe(furnitureTemplateKey({ ...base, art: 'fuji.2' }))
  })
})

describe('布置与存档', () => {
  test('一键布置给画挑了画面，同一户的画尽量不重样', () => {
    let arts = 0
    for (let seed = 1; seed <= 6; seed++) {
      const plan = genJp(seed)
      const hh = generateHousehold(plan, seed)
      const fs = decorate(plan, seed, 'auto', hh)
      const pics = fs.filter((f) => ART_ASSETS[f.asset])
      for (const f of pics) expect(parseArt(f.art), `${seed} ${f.asset}`).not.toBeNull()
      arts += pics.length
      const ids = pics.filter((f) => ART_ASSETS[f.asset] === 'painting').map((f) => parseArt(f.art)!.motif.id)
      if (ids.length >= 2) expect(new Set(ids).size, `seed ${seed}: ${ids.join(',')}`).toBeGreaterThanOrEqual(Math.min(ids.length, 3))
    }
    expect(arts).toBeGreaterThan(0)
  })

  test('分享链接保留画面', () => {
    const plan = genJp(3)
    plan.furniture = [{ id: 'a', asset: 'wall-art-mountain', x: 100, y: 100, rot: 0, art: 'fuji.123' }]
    const back = fromCompact(JSON.parse(JSON.stringify(toCompact(plan, 'full'))))
    expect(back.furniture[0].art).toBe('fuji.123')
  })
})
