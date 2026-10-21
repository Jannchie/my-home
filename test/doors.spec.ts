// 门的款式（Opening.doorStyle / doorColor / doorHandle / handleFinish / doorLites / doorGlass）：3D 模型、读档校验、分享往返、生成户型的缺省款式、预览缓存键。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { DOOR_HANDLES, DOOR_LITES, DOOR_STYLES, rectPoints, type DoorHandle, type DoorLeafStyle, type DoorLites, type Opening, type OpeningKind, type Plan } from '/src/model'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare, toCompact } from '/src/share'
import { buildHouse, openingInfos } from '/src/three/house'
import { doorLeafModel } from '/src/three/doorModels'
import { generateLayout, generatePlan } from '/src/generate-region'
import { GLASS_STYLES, STYLES_FOR, doorColor, hasDoorGlass, doorHandleOf, LEGACY_DOOR, LEGACY_ENTRANCE, roomAcross } from '/src/doorStyles'
import { previewKey, previewObject, type SitePreview } from '/src/three/siteThumbs'
import { genJp } from './helpers'

const STYLES = Object.keys(DOOR_STYLES) as DoorLeafStyle[]
const HANDLES = Object.keys(DOOR_HANDLES) as DoorHandle[]
const LITES = Object.keys(DOOR_LITES) as DoorLites[]
const DOOR_KEYS = ['doorStyle', 'doorColor', 'doorHandle', 'handleFinish', 'doorLites', 'doorGlass']

/** 洋室（400 × 300）+ 东边玄关（外墙上入户门）；洋室北墙一扇门，玄关南墙入户门 */
function testPlan(door: Partial<Opening> = {}, entry: Partial<Opening> = {}): Plan {
  return {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: 't',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'a', name: '洋室', kind: 'western', points: rectPoints(0, 0, 400, 300) },
      { id: 'e', name: '玄関', kind: 'entrance', points: rectPoints(400, 0, 600, 300) },
    ],
    openings: [
      // 边 1：(400,0) → (400,300)，洋室和玄关之间的隔墙
      { id: 'd1', kind: 'door', roomId: 'a', edge: 1, offset: 150, width: 80, hinge: 'start', swing: 'in', ...door },
      // 玄关边 2：(600,300) → (400,300)，南墙（外墙）
      { id: 'd2', kind: 'door', roomId: 'e', edge: 2, offset: 100, width: 120, hinge: 'start', swing: 'out', ...entry },
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

/** 开门洞口一组子物体在平面上的包围盒（局部 = 世界，测试里 house 没有挪动） */
function openingGroups(root: THREE.Object3D) {
  return root.children.find((c) => c.userData.part === 'opening')!.children
}

describe('门扇的 3D 模型', () => {
  for (const style of [undefined, ...STYLES])
    test(`${style ?? '平板'}：各种把手、尺寸都搭得出来，不出门扇范围`, () => {
      for (const handle of HANDLES)
        for (const [w, h, t] of [
          [80, 196, 3.6],
          [40, 196, 2.4],
          [150, 203, 3.6],
          [30, 60, 3],
        ]) {
          const g = doorLeafModel({ style, w, h, t, color: '#b98757', handle, handleColor: '#c9ccd1', handleSide: 1 })
          expect(g.children.length).toBeGreaterThan(0)
          expect(finite(g), `${style} ${handle} ${w}x${h}`).toBe(true)
          const b = new THREE.Box3().setFromObject(g)
          expect(b.min.y, `${style} 底`).toBeGreaterThan(-1)
          expect(b.max.y, `${style} 顶`).toBeLessThan(h + 1)
          expect(b.min.x, `${style} 左`).toBeGreaterThan(-w / 2 - 1)
          expect(b.max.x, `${style} 右`).toBeLessThan(w / 2 + 1)
          // 把手两面各伸出一点，不超过 8cm
          expect(b.max.z - b.min.z).toBeLessThan(t + 16)
        }
    })

  test('每种款式 × 门的种类在整屋里都搭得出来，几何没有 NaN，门扇都在洞口附近', () => {
    for (const kind of ['door', 'sliding', 'folding'] as OpeningKind[])
      for (const style of STYLES)
        for (const lites of [undefined, ...LITES]) {
          if (kind !== 'door' && lites) continue
          const plan = normalizePlan(testPlan({ kind, doorStyle: style, doorColor: '#2f4a6b', doorHandle: 'knob', handleFinish: 'brass' }, { doorStyle: style, doorLites: lites }))!
          const root = buildHouse(plan, 240)
          expect(finite(root), `${kind} ${style} ${lites}`).toBe(true)
          const groups = openingGroups(root)
          expect(groups.length).toBeGreaterThanOrEqual(2)
          for (const c of groups) {
            const b = new THREE.Box3().setFromObject(c)
            expect(b.max.y, `${kind} ${style} 顶`).toBeLessThan(241)
            expect(b.min.y).toBeGreaterThan(-2)
            // 都在门洞周围（谷仓门推开一段，挂在墙面上）
            const info = c.userData.info
            expect(info).toBeTruthy()
            const cx = (b.min.x + b.max.x) / 2
            const cz = (b.min.z + b.max.z) / 2
            expect(Math.hypot(cx - info.center.x, cz - info.center.y), `${kind} ${style}`).toBeLessThan(info.width)
          }
        }
  })

  test('不填款式 = 旧的门扇：平板 + 小方块把手两块，旧颜色（入户门浅蓝）', () => {
    const root = buildHouse(testPlan(), 240)
    const groups = openingGroups(root)
    expect(groups.length).toBe(2)
    const colors = groups.map((g) => {
      const set = new Set<string>()
      g.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh && !(m.material as THREE.Material).side) set.add('#' + (m.material as THREE.MeshToonMaterial).color.getHexString())
      })
      return set
    })
    expect(colors[0].has(LEGACY_DOOR)).toBe(true)
    expect(colors[1].has(LEGACY_ENTRANCE)).toBe(true)
    const b = new THREE.Box3().setFromObject(groups[0])
    expect(b.max.y).toBeCloseTo(197, 0)
  })

  test('带侧窗的入户门：门扇变窄，侧窗固定在洞口里；带亮子的门洞开到 226', () => {
    const p = testPlan({}, { doorStyle: 'panel6', doorLites: 'both' })
    const info = openingInfos(p).find((i) => i.o.id === 'd2')!
    expect(info.y1).toBe(226)
    expect(openingInfos(testPlan()).find((i) => i.o.id === 'd2')!.y1).toBe(200)
    const root = buildHouse(p, 260)
    const groups = openingGroups(root).filter((c) => c.userData.info.o.id === 'd2')
    // 门扇 + 侧窗 / 亮子
    expect(groups.length).toBe(2)
    expect(groups.some((g) => new THREE.Box3().setFromObject(g).max.y > 210)).toBe(true)
    // 门扇比洞口窄（让出侧窗）
    const leaf = groups.find((g) => new THREE.Box3().setFromObject(g).max.y < 200)!
    const lb = new THREE.Box3().setFromObject(leaf)
    expect(Math.hypot(lb.max.x - lb.min.x, lb.max.z - lb.min.z)).toBeLessThan(120 - 22)
  })

  test('玻璃：带玻璃的款式都有玻璃；透明 / 磨砂换材质，写实下分别是光面 / 磨砂玻璃；不填同旧的样子', () => {
    const glassOf = (g: THREE.Object3D) => {
      const out: THREE.Mesh[] = []
      g.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh && (m.userData.mat === 'glass' || m.userData.mat === 'frosted')) out.push(m)
      })
      return out
    }
    for (const style of STYLES) {
      const spec = { style, w: 80, h: 196, t: 3.6, color: '#f6f4ef', handle: 'lever' as const, handleColor: '#c9ccd1', handleSide: 1 as const }
      const legacy = glassOf(doorLeafModel(spec))
      expect(legacy.length > 0, style).toBe(GLASS_STYLES.includes(style))
      if (!legacy.length) continue
      const clear = glassOf(doorLeafModel({ ...spec, glass: 'clear' }))
      const frosted = glassOf(doorLeafModel({ ...spec, glass: 'frosted' }))
      expect(clear.length).toBe(legacy.length)
      for (const m of legacy) expect(m.userData.mat).toBe('frosted')
      for (const m of clear) expect(m.userData.mat).toBe('glass')
      for (const m of frosted) expect(m.userData.mat).toBe('frosted')
      const op = (ms: THREE.Mesh[]) => (ms[0].material as THREE.Material).opacity
      expect(op(clear)).toBeLessThan(op(legacy))
      expect(op(frosted)).toBeGreaterThan(op(legacy))
    }
    // 竖条玻璃在门扇正中、横条玻璃一列好几条
    const strip = glassOf(doorLeafModel({ style: 'glassStrip', w: 80, h: 196, t: 3.6, color: '#f6f4ef', handle: 'lever', handleColor: '#c9ccd1', handleSide: 1 }))
    expect(strip.length).toBe(1)
    const sb = new THREE.Box3().setFromObject(strip[0])
    expect(Math.abs(sb.min.x + sb.max.x)).toBeLessThan(0.5)
    expect(sb.max.y - sb.min.y).toBeGreaterThan(120)
    expect(glassOf(doorLeafModel({ style: 'glassSlits', w: 80, h: 196, t: 3.6, color: '#f6f4ef', handle: 'lever', handleColor: '#c9ccd1', handleSide: 1 })).length).toBeGreaterThan(3)
    // 侧窗 / 亮子的玻璃也跟着选
    const root = buildHouse(testPlan({}, { doorStyle: 'glassStrip', doorLites: 'both', doorGlass: 'clear' }), 260)
    const mats = new Set(openingGroups(root).filter((c) => c.userData.info.o.id === 'd2').flatMap((g) => glassOf(g).map((m) => m.userData.mat)))
    expect([...mats]).toEqual(['glass'])
    expect(hasDoorGlass({ kind: 'door', doorStyle: 'panel4' })).toBe(false)
    expect(hasDoorGlass({ kind: 'door', doorStyle: 'panel4', doorLites: 'side' })).toBe(true)
    expect(hasDoorGlass({ kind: 'sliding', doorStyle: 'glassStrip' })).toBe(true)
  })

  test('默认颜色 / 把手按款式', () => {
    expect(doorColor({ kind: 'door' }, false)).toBe(LEGACY_DOOR)
    expect(doorColor({ kind: 'door' }, true)).toBe(LEGACY_ENTRANCE)
    expect(doorColor({ kind: 'sliding', doorStyle: 'fusuma' }, false)).not.toBe(LEGACY_DOOR)
    expect(doorColor({ kind: 'door', doorColor: '#123456' }, true)).toBe('#123456')
    expect(doorHandleOf({ kind: 'door' })).toBe('lever')
    expect(doorHandleOf({ kind: 'sliding', doorStyle: 'shoji' })).toBe('pull')
    expect(doorHandleOf({ kind: 'door', doorStyle: 'grooved' })).toBe('bar')
    expect(doorHandleOf({ kind: 'door', doorStyle: 'grooved', doorHandle: 'knob' })).toBe('knob')
  })
})

describe('门款式的预览图', () => {
  test('每种门 × 款式都搭得出来；缓存键区分款式 / 颜色 / 把手 / 侧窗', () => {
    const keys = new Set<string>()
    for (const kind of ['door', 'sliding', 'folding'] as const)
      for (const style of [undefined, ...STYLES_FOR[kind]]) {
        const spec: SitePreview = { t: 'door', kind, style, color: '#f6f4ef', handle: 'lever', handleColor: '#c9ccd1' }
        expect(finite(previewObject(spec)), `${kind} ${style}`).toBe(true)
        keys.add(previewKey(spec))
      }
    const n = 3 + STYLES_FOR.door.length + STYLES_FOR.sliding.length + STYLES_FOR.folding.length
    expect(keys.size).toBe(n)
    const base: SitePreview = { t: 'door', kind: 'door', style: 'panel4', color: '#f6f4ef', handle: 'lever', handleColor: '#c9ccd1' }
    const variants: SitePreview[] = [base, { ...base, color: '#2f4a6b' }, { ...base, handle: 'knob' }, { ...base, handleColor: '#c9a04a' }, { ...base, lites: 'side' }, { ...base, lites: 'top' }, { ...base, kind: 'sliding' }, { ...base, glass: 'clear' }, { ...base, glass: 'frosted' }]
    expect(new Set(variants.map(previewKey)).size).toBe(variants.length)
    for (const v of variants) expect(finite(previewObject(v))).toBe(true)
  })
})

describe('读档校验 / 分享', () => {
  test('旧存档（没有门字段）读进来不多出任何字段', () => {
    const p = normalizePlan(JSON.parse(JSON.stringify(genJp(5))))!
    for (const o of p.openings) for (const k of DOOR_KEYS) expect(o).not.toHaveProperty(k)
  })

  test('坏值、缺省值去掉；窗上的门字段、推拉门上的侧窗去掉；颜色统一小写', () => {
    const p = testPlan(
      { doorStyle: 'bogus' as DoorLeafStyle, doorColor: 'red', doorHandle: 'x' as DoorHandle, handleFinish: 'silver', doorLites: 'side' },
      { doorStyle: 'grooved', doorColor: '#AABBCC', doorHandle: 'bar', handleFinish: 'black', doorLites: 'top', doorGlass: 'bogus' as 'clear' },
    )
    p.openings.push({ id: 's', kind: 'sliding', roomId: 'a', edge: 3, offset: 100, width: 120, hinge: 'start', swing: 'in', doorStyle: 'shoji', doorLites: 'both', doorGlass: 'frosted' })
    p.openings.push({ id: 'w', kind: 'window', roomId: 'a', edge: 0, offset: 200, width: 120, hinge: 'start', swing: 'in', doorStyle: 'flush', doorColor: '#000000', doorGlass: 'clear' })
    const n = normalizePlan(p)!
    const [a, b, s, w] = n.openings
    for (const k of ['doorStyle', 'doorColor', 'doorHandle', 'handleFinish']) expect(a).not.toHaveProperty(k)
    expect(a.doorLites).toBe('side')
    expect([b.doorStyle, b.doorColor, b.doorHandle, b.handleFinish, b.doorLites]).toEqual(['grooved', '#aabbcc', 'bar', 'black', 'top'])
    expect(b).not.toHaveProperty('doorGlass')
    expect(s.doorStyle).toBe('shoji')
    expect(s.doorGlass).toBe('frosted')
    expect(s).not.toHaveProperty('doorLites')
    for (const k of DOOR_KEYS) expect(w).not.toHaveProperty(k)
  })

  test('分享链接往返带上门的款式；不带款式的门还是 6 项', async () => {
    const src = testPlan({ doorStyle: 'glassFull', doorColor: '#9cb39a', doorHandle: 'knob', handleFinish: 'brass' }, { doorStyle: 'glassStrip', doorLites: 'both', doorGlass: 'frosted' })
    const back = await decodeShare(await encodeShare(src, 'plan'))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    const [a, b] = back.plan.openings
    expect([a.doorStyle, a.doorColor, a.doorHandle, a.handleFinish]).toEqual(['glassFull', '#9cb39a', 'knob', 'brass'])
    expect([b.doorStyle, b.doorLites, b.doorGlass]).toEqual(['glassStrip', 'both', 'frosted'])
    const c = toCompact(testPlan(), 'plan')
    for (const d of c.d) expect(d.length).toBe(6)
  })
})

describe('生成户型的缺省门款式', () => {
  const opts = { type: 'random', style: 'random', corner: 'random', access: 'random', minArea: null, maxArea: null } as const
  const strip = (p: Plan) =>
    JSON.stringify({ ...p, openings: p.openings.map(({ id: _i, windowStyle: _s, frame: _f, grid: _g, sill: _l, shutters: _h, doorStyle: _ds, doorColor: _dc, doorHandle: _dh, handleFinish: _hf, doorLites: _dl, ...r }) => r) }, (k, v) =>
      k === 'id' || k === 'roomId' || k === 'stackOn' || k === 'savedId' ? undefined : v,
    )

  test('配门不改布局；每扇门都配了款式，窗上没有门字段', () => {
    for (const region of ['jp', 'cn', 'west'] as const)
      for (const seed of [3, 17])
        for (const dwelling of ['apartment', 'house'] as const) {
          const o = { ...opts, seed, region, dwelling }
          const a = generatePlan(o).plan
          expect(strip(a)).toBe(strip(generateLayout(o).plan))
          for (const x of a.openings) {
            if (x.kind === 'window') for (const k of DOOR_KEYS) expect(x).not.toHaveProperty(k)
            else expect(x.doorStyle, `${region} ${seed} ${dwelling}`).toBeTruthy()
          }
          // 读档校验不删生成的值
          const n = normalizePlan(JSON.parse(JSON.stringify(a)))!
          expect(n.openings.map((x) => DOOR_KEYS.map((k) => (x as unknown as Record<string, unknown>)[k]))).toEqual(a.openings.map((x) => DOOR_KEYS.map((k) => (x as unknown as Record<string, unknown>)[k])))
        }
  })

  test('各地区的门符合地区习惯，同一种子结果相同', () => {
    const seen: Record<string, Set<string>> = { jp: new Set(), cn: new Set(), west: new Set() }
    const entry: Record<string, Set<string>> = { jp: new Set(), cn: new Set(), west: new Set() }
    let washitsu = 0
    for (const region of ['jp', 'cn', 'west'] as const)
      for (let seed = 1; seed <= 14; seed++)
        for (const dwelling of ['apartment', 'house'] as const) {
          const p = generatePlan({ ...opts, seed, region, dwelling }).plan
          const q = generatePlan({ ...opts, seed, region, dwelling }).plan
          expect(p.openings.map((o) => DOOR_KEYS.map((k) => (o as unknown as Record<string, unknown>)[k]))).toEqual(q.openings.map((o) => DOOR_KEYS.map((k) => (o as unknown as Record<string, unknown>)[k])))
          for (const o of p.openings) {
            if (o.kind === 'window') continue
            const owner = p.rooms.find((r) => r.id === o.roomId)!
            const across = roomAcross(p, o, owner)
            if (o.kind === 'door' && owner.kind === 'entrance' && (!across || across.kind === 'balcony')) entry[region].add(o.doorStyle!)
            else seen[region].add(`${o.kind}:${o.doorStyle}`)
            if (region === 'jp' && o.kind === 'sliding' && (owner.kind === 'japanese' || across?.kind === 'japanese')) {
              washitsu++
              expect(o.doorStyle?.startsWith('fusuma')).toBe(true)
            }
          }
        }
    expect(washitsu).toBeGreaterThan(0)
    expect(seen.jp.has('door:flush')).toBe(true)
    expect([...seen.jp].some((s) => /panel/.test(s))).toBe(false)
    expect([...seen.west].some((s) => s === 'door:panel6' || s === 'door:panel4')).toBe(true)
    expect(seen.west.has('folding:louver') || seen.west.has('sliding:barn')).toBe(true)
    expect(seen.cn.has('sliding:glassFull')).toBe(true)
    expect(entry.jp.has('grooved')).toBe(true)
    expect(entry.cn.has('grooved')).toBe(true)
    expect([...entry.west].every((s) => ['panel6', 'panel4', 'glassTop'].includes(s))).toBe(true)
  })
})
