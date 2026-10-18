// 窗的款式（Opening.windowStyle / frame / grid / sill / shutters）：3D 模型、墙洞补角、读档校验、分享往返、生成户型的缺省款式。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { WINDOW_FRAMES, WINDOW_GRIDS, WINDOW_SILLS, WINDOW_STYLES, rectPoints, type Opening, type Plan, type WindowGrid, type WindowStyle } from '/src/model'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare, fromCompact, toCompact } from '/src/share'
import { buildHouse, openingInfos } from '/src/three/house'
import { windowModel, type WindowModelStyle } from '/src/three/windows'
import { curtainSpecs } from '/src/curtains'
import { isSashWindow } from '/src/place'
import { generateLayout, generatePlan } from '/src/generate-region'
import { windowSpan } from '/src/windows'
import { genJp } from './helpers'
import { previewKey, previewObject } from '/src/three/siteThumbs'

const STYLES = Object.keys(WINDOW_STYLES) as WindowStyle[]
const GRIDS = Object.keys(WINDOW_GRIDS) as WindowGrid[]

/** 一间洋室（南墙一扇窗）+ 南边一个阳台（洋室东墙另一扇窗朝外） */
function testPlan(win: Partial<Opening> = {}, balconyWin: Partial<Opening> = {}): Plan {
  return {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: 't',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'a', name: '洋室', kind: 'western', points: rectPoints(0, 0, 400, 300), curtain: 'auto' },
      { id: 'b', name: 'バルコニー', kind: 'balcony', points: rectPoints(0, 300, 400, 420) },
    ],
    openings: [
      // 边 1：(400,0) → (400,300)，东墙（外墙）
      { id: 'w1', kind: 'window', roomId: 'a', edge: 1, offset: 150, width: 160, hinge: 'start', swing: 'in', ...win },
      // 边 2：(400,300) → (0,300)，朝阳台
      { id: 'w2', kind: 'window', roomId: 'a', edge: 2, offset: 200, width: 170, hinge: 'start', swing: 'in', ...balconyWin },
    ],
    fixtures: [],
    furniture: [],
  }
}

function finite(o: THREE.Object3D) {
  let ok = true
  o.updateMatrixWorld(true)
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    const p = m.geometry.attributes.position
    for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) ok = false
  })
  return ok
}

describe('窗的 3D 模型', () => {
  const all: WindowModelStyle[] = ['plain', 'legacySash', ...STYLES]
  for (const style of all)
    test(`${style}：各种格条都搭得出来，不出窗洞（高度 / 宽度）`, () => {
      for (const grid of GRIDS)
        for (const [w, h] of [
          [160, 100],
          [60, 50],
          [90, 200],
        ]) {
          const g = windowModel({ style, w, h, wall: 18, frame: '#ffffff', grid, out: 1 })
          expect(g.children.length).toBeGreaterThan(0)
          expect(finite(g), `${style} ${grid} ${w}x${h}`).toBe(true)
          const b = new THREE.Box3().setFromObject(g)
          expect(b.min.y, `${style} ${grid} 底`).toBeGreaterThan(-1.5)
          expect(b.max.y, `${style} ${grid} 顶`).toBeLessThan(h + 1.5)
          expect(b.min.x).toBeGreaterThan(-w / 2 - 1.5)
          expect(b.max.x).toBeLessThan(w / 2 + 1.5)
        }
    })

  test('检查器的预览图（窗嵌在一段墙里）每种款式 / 格条都搭得出来', () => {
    const keys = new Set<string>()
    for (const style of ['plain', 'legacySash', ...STYLES] as WindowModelStyle[])
      for (const grid of GRIDS) {
        const spec = { t: 'window', style, frame: '#2f3134', grid, shutters: '#3f5a4c' } as const
        const o = previewObject(spec)
        expect(finite(o)).toBe(true)
        keys.add(previewKey(spec))
      }
    expect(keys.size).toBe((STYLES.length + 2) * GRIDS.length)
  })

  test('护窗板在户外一侧、窗的两边', () => {
    for (const out of [1, -1] as const) {
      const g = windowModel({ style: 'doubleHung', w: 120, h: 100, wall: 18, frame: '#ffffff', out, shutters: '#3f5a4c' })
      const b = new THREE.Box3().setFromObject(g)
      expect(b.max.x).toBeGreaterThan(60 + 20)
      if (out === 1) expect(b.max.z).toBeGreaterThan(9)
      else expect(b.min.z).toBeLessThan(-9)
    }
  })

  test('不填款式 = 旧的腰窗：白框 4 根 + 一片玻璃，包围盒同以前', () => {
    const info = openingInfos(testPlan())[0]
    expect(info.o.windowStyle).toBeUndefined()
    const g = windowModel({ style: 'plain', w: 160, h: 100, wall: 18, frame: '#ffffff', out: 1 })
    const meshes = g.children.filter((c) => (c as THREE.Mesh).isMesh)
    expect(meshes.length).toBe(5)
    const b = new THREE.Box3().setFromObject(g)
    expect([b.min.x, b.max.x, b.min.y, b.max.y]).toEqual([-80, 80, 0, 100].map((v) => expect.closeTo(v, 3)))
    expect(b.max.z - b.min.z).toBeCloseTo(20, 1)
  })

  test('每种款式、窗台高度在整屋里都搭得出来，几何没有 NaN；拱顶 / 圆窗补了墙角', () => {
    for (const style of STYLES)
      for (const sill of [undefined, ...(Object.keys(WINDOW_SILLS) as Opening['sill'][])]) {
        const plan = normalizePlan(testPlan({ windowStyle: style, sill, grid: 'colonial', shutters: true, frame: 'black' }, { windowStyle: style }))!
        const root = buildHouse(plan, 240)
        expect(finite(root), `${style} ${sill}`).toBe(true)
        const ops = root.children.find((c) => c.userData.part === 'opening')!
        expect(ops.children.length).toBe(2)
      }
    // 圆窗：墙比矩形洞多出补角块（同一面墙上多一块 y0 = 窗台、h = 窗高的墙）
    const walls = (p: Plan) => {
      const root = buildHouse(p, 240)
      let n = 0
      root.children.find((c) => c.userData.part === 'wall')!.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) n += ((c as THREE.Mesh).geometry.attributes.position.count as number)
      })
      return n
    }
    expect(walls(testPlan({ windowStyle: 'round' }))).toBeGreaterThan(walls(testPlan()))
    expect(walls(testPlan({ windowStyle: 'arched' }))).toBeGreaterThan(walls(testPlan()))
  })
})

describe('窗台高度 / 落地窗 / 窗帘', () => {
  test('窗台预设的高度范围', () => {
    const room = { kind: 'western' }
    expect(windowSpan(room, false)).toEqual({ y0: 90, y1: 190 })
    expect(windowSpan({ kind: 'bath' }, false)).toEqual({ y0: 110, y1: 180 })
    expect(windowSpan(room, true)).toEqual({ y0: 0, y1: 200 })
    expect(windowSpan(room, false, 'full')).toEqual({ y0: 0, y1: 200 })
    expect(windowSpan(room, true, 'waist')).toEqual({ y0: 90, y1: 190 })
    expect(windowSpan(room, false, 'high').y0).toBeGreaterThan(140)
    expect(windowSpan(room, false, 'low').y0).toBe(0)
  })

  test('朝阳台的窗改成腰窗就不是落地推拉窗（走不出去）', () => {
    const p = testPlan({}, { sill: 'waist' })
    const infos = openingInfos(p)
    expect(infos[1].sash).toBe(false)
    expect(infos[1].y0).toBe(90)
    const room = p.rooms[0]
    const e = { out: { x: 0, y: 1 } }
    expect(isSashWindow(p, room, e, { x: 200, y: 300 })).toBe(true)
    expect(isSashWindow(p, room, e, { x: 200, y: 300 }, p.openings[1])).toBe(false)
    expect(openingInfos(testPlan())[1].sash).toBe(true)
  })

  test('每种款式、窗台高度都挂得上窗帘', () => {
    for (const style of STYLES)
      for (const sill of [undefined, 'waist', 'high', 'full'] as const) {
        const specs = curtainSpecs(testPlan({ windowStyle: style, sill }, { windowStyle: style }))
        expect(specs.length, `${style} ${sill}`).toBe(2)
        for (const s of specs) expect(s.rodY - s.bottom).toBeGreaterThan(20)
      }
  })
})

describe('读档校验 / 分享', () => {
  test('旧存档（没有窗字段）读进来不多出任何字段', () => {
    const p = normalizePlan(JSON.parse(JSON.stringify(genJp(5))))!
    for (const o of p.openings) for (const k of ['windowStyle', 'frame', 'grid', 'sill', 'shutters']) expect(o).not.toHaveProperty(k)
  })

  test('坏值、缺省值去掉；门上的窗字段去掉', () => {
    const p = testPlan({ windowStyle: 'bogus' as WindowStyle, frame: 'white', grid: 'none', sill: 'x' as Opening['sill'], shutters: 1 as unknown as boolean }, { windowStyle: 'arched', frame: 'wood', grid: 'shoji', sill: 'high', shutters: true })
    p.openings.push({ id: 'd', kind: 'door', roomId: 'a', edge: 3, offset: 100, width: 80, hinge: 'start', swing: 'in', windowStyle: 'round', frame: 'black' })
    const n = normalizePlan(p)!
    const [a, b, d] = n.openings
    for (const k of ['windowStyle', 'frame', 'grid', 'sill', 'shutters']) expect(a).not.toHaveProperty(k)
    expect([b.windowStyle, b.frame, b.grid, b.sill, b.shutters]).toEqual(['arched', 'wood', 'shoji', 'high', true])
    expect(d).not.toHaveProperty('windowStyle')
    expect(d).not.toHaveProperty('frame')
  })

  test('分享链接往返带上窗的款式；旧格式（6 项）照常读', async () => {
    const src = testPlan({ windowStyle: 'casement2', frame: 'black', grid: 'cross', sill: 'low', shutters: true }, { windowStyle: 'fixed' })
    const back = await decodeShare(await encodeShare(src, 'plan'))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    const [a, b] = back.plan.openings
    expect([a.windowStyle, a.frame, a.grid, a.sill, a.shutters]).toEqual(['casement2', 'black', 'cross', 'low', true])
    expect(b.windowStyle).toBe('fixed')
    // 不带款式的窗：紧凑格式还是 6 项（旧版本能读）
    const c = toCompact(testPlan(), 'plan')
    for (const d of c.d) expect(d.length).toBe(6)
    // 第 7 项坏了（不是对象）：忽略
    const bad = toCompact(testPlan(), 'plan') as unknown as { d: unknown[][] }
    bad.d[0].push('junk')
    const p = fromCompact(bad)
    expect(p.openings[0].windowStyle).toBeUndefined()
  })
})

describe('生成户型的缺省款式', () => {
  const opts = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const
  test('配窗不改布局（去掉窗字段后和只出布局的结果一样）', () => {
    for (const region of ['jp', 'cn', 'west'] as const)
      for (const seed of [3, 17]) {
        for (const dwelling of ['apartment', 'house'] as const) {
          const o = { ...opts, seed, region, dwelling }
          const a = generatePlan(o).plan
          const b = generateLayout(o).plan
          const strip = (p: Plan) => JSON.stringify({ ...p, openings: p.openings.map(({ id: _i, windowStyle: _s, frame: _f, grid: _g, sill: _l, shutters: _h, doorStyle: _ds, doorColor: _dc, doorHandle: _dh, handleFinish: _hf, doorLites: _dl, ...r }) => r) }, (k, v) => (k === 'id' || k === 'roomId' || k === 'stackOn' || k === 'savedId' ? undefined : v))
          expect(strip(a)).toBe(strip(b))
          expect(a.openings.some((x) => x.windowStyle), `${region} ${seed} ${dwelling}`).toBe(true)
          // 不改窗台高度（落地窗、窗帘、一键布置都不受影响）
          for (const x of a.openings) expect(x.sill).toBeUndefined()
        }
      }
  })

  test('各地区的款式 / 窗框符合地区习惯，同一种子结果相同', () => {
    const seen: Record<string, Set<string>> = { jp: new Set(), cn: new Set(), west: new Set() }
    const frames: Record<string, Set<string>> = { jp: new Set(), cn: new Set(), west: new Set() }
    for (const region of ['jp', 'cn', 'west'] as const)
      for (let seed = 1; seed <= 12; seed++) {
        const p = generatePlan({ ...opts, seed, region }).plan
        const q = generatePlan({ ...opts, seed, region }).plan
        expect(p.openings.map((o) => [o.windowStyle, o.frame, o.grid, o.shutters])).toEqual(q.openings.map((o) => [o.windowStyle, o.frame, o.grid, o.shutters]))
        for (const o of p.openings) {
          if (o.windowStyle) seen[region].add(o.windowStyle)
          if (o.kind === 'window') frames[region].add(o.frame ?? 'white')
          if (o.frame) expect(Object.keys(WINDOW_FRAMES)).toContain(o.frame)
        }
      }
    expect(seen.jp.has('sliding')).toBe(true)
    expect([...seen.jp].every((s) => ['sliding', 'louver', 'awning', 'fixed'].includes(s))).toBe(true)
    expect(seen.cn.has('combo')).toBe(true)
    expect(seen.west.has('doubleHung')).toBe(true)
    expect(seen.west.has('louver')).toBe(false)
    expect(frames.jp.has('silver')).toBe(true)
  })
})
