// 屏幕画面预设（screenContent.ts）：能换画面的素材、轮换、烘焙时按预设画、按住户挑画面。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSET_MAP } from '/src/three/assets'
import { SCREEN_PRESETS, cycleScreen, hasScreen } from '/src/three/screenContent'
import { furnitureModel, furnitureTemplateKey } from '/src/three/house'
import { screenWeights } from '/src/workstation'
import { generateHousehold, type Member } from '/src/household'
import { decorate } from '/src/decorate'
import { generatePlan } from '/src/generate-region'
import { JP_OPTS, range } from './helpers'

const member = (p: Partial<Member>): Member => ({ id: 'm', name: '', role: 'self', age: 30, job: 'office', traits: [], interests: [], style: 'modern', ...p })
const top = (w: Partial<Record<string, number>>) => Object.entries(w).sort((a, b) => b[1]! - a[1]!)[0][0]

describe('screen content', () => {
  test('有屏幕的素材才能换画面', () => {
    for (const id of ['prop-monitor', 'prop-laptop', 'prop-tv-43', 'mon-slim-27']) expect(hasScreen(ASSET_MAP.get(id)), id).toBe(true)
    for (const id of ['bookshelf', 'sofa2']) expect(hasScreen(ASSET_MAP.get(id)), id).toBe(false)
  })

  test('预设 id 不重复，轮换一圈回到原画面', () => {
    expect(new Set(SCREEN_PRESETS.map((p) => p.id)).size).toBe(SCREEN_PRESETS.length)
    let cur: string | undefined
    for (let i = 0; i <= SCREEN_PRESETS.length; i++) cur = cycleScreen(cur, 1)
    expect(cur).toBeUndefined()
    expect(cycleScreen(undefined, -1)).toBe(SCREEN_PRESETS[SCREEN_PRESETS.length - 1].id)
  })

  test('换了画面：模板键不同，屏幕换成一张贴图', () => {
    const base = { id: 'x', asset: 'prop-monitor', x: 0, y: 0, rot: 0 }
    expect(furnitureTemplateKey(base)).not.toBe(furnitureTemplateKey({ ...base, screen: 'code' }))
    const maps = (m: THREE.Object3D) => {
      const out = new Set<THREE.Texture>()
      m.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined
        if (mat && !Array.isArray(mat) && mat.emissiveMap) out.add(mat.emissiveMap)
      })
      return out
    }
    const a = maps(furnitureModel({ ...base, screen: 'code' }))
    const b = maps(furnitureModel({ ...base, screen: 'game' }))
    expect(a.size).toBe(1)
    expect([...a][0]).not.toBe([...b][0])
  })

  test('按职业、兴趣挑画面', () => {
    const mon = ASSET_MAP.get('prop-monitor')!
    expect(top(screenWeights(mon, [member({ job: 'programmer' })]))).toBe('code')
    expect(top(screenWeights(mon, [member({ job: 'designer' })]))).toBe('design')
    expect(top(screenWeights(mon, [member({ job: 'musician' })]))).toBe('music')
    expect(top(screenWeights(mon, [member({ job: 'student', interests: ['gaming'], levels: { gaming: 4 } })]))).toBe('game')
    const tv = ASSET_MAP.get('prop-tv-43')!
    expect(top(screenWeights(tv, [member({ age: 8, job: 'schoolkid', interests: ['otaku'], levels: { otaku: 3 } })]))).toBe('anime')
  })

  test('一键布置后屏幕都按住户挑好了画面', () => {
    let screens = 0
    let set = 0
    const ids = new Set(SCREEN_PRESETS.map((p) => p.id))
    for (const seed of range(1, 12)) {
      const plan = generatePlan({ seed, ...JP_OPTS, region: 'jp' }).plan
      const hh = generateHousehold(plan, seed)
      for (const f of decorate(plan, seed, 'auto', hh)) {
        if (!hasScreen(ASSET_MAP.get(f.asset))) continue
        screens++
        if (f.screen) {
          set++
          expect(ids.has(f.screen), f.screen).toBe(true)
        }
      }
    }
    expect(screens).toBeGreaterThan(4)
    expect(set / screens).toBeGreaterThan(0.9)
  })
})
