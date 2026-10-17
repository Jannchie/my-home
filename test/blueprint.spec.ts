// 3D 设计图：标注数据（外墙尺寸线、标高、房间名）与户型一致；结构 / 家具线框能搭出来。
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { floorAnnotations, fmtDim, fmtLevel, outlineDims, topLevel, unitFor, SIDES } from '/src/dimensions'
import { BlueprintView, structureGeometry, furnitureMeshes, hardEdges, isLargeFurniture } from '/src/three/blueprint'
import { floorOutline, floorView, planFloors } from '/src/floors'
import { bbox, rectPoints, type Plan } from '/src/model'
import { generatePlan } from '/src/generate-region'
import { decorate } from '/src/decorate'
import { twoStoryPlan } from './twoStory'
import { genJp, JP_OPTS } from './helpers'

describe('数值格式', () => {
  test('尺寸：mm 带千分位、cm 取整', () => {
    expect(fmtDim(364, 'mm')).toBe('3,640')
    expect(fmtDim(91, 'mm')).toBe('910')
    expect(fmtDim(1200, 'mm')).toBe('12,000')
    expect(fmtDim(364.4, 'cm')).toBe('364')
  })
  test('标高：±0 / +2,700 / −300', () => {
    expect(fmtLevel(0, 'mm')).toBe('±0')
    expect(fmtLevel(270, 'mm')).toBe('+2,700')
    expect(fmtLevel(-30, 'mm')).toBe('−300')
    expect(fmtLevel(270, 'cm')).toBe('+270')
  })
  test('单位按地区：欧美 cm，其余 mm', () => {
    expect(unitFor('west')).toBe('cm')
    expect(unitFor('jp')).toBe('mm')
    expect(unitFor(undefined)).toBe('mm')
  })
})

describe('外墙尺寸线', () => {
  test('矩形：四边各一道总长，等于长宽', () => {
    const ds = outlineDims(rectPoints(0, 0, 900, 800), 18)
    expect(ds).toHaveLength(4)
    for (const d of ds) expect(d.tier).toBe(1)
    expect(ds.filter((d) => d.side === 'y0' || d.side === 'y1').map((d) => d.value)).toEqual([900, 900])
    expect(ds.filter((d) => d.side === 'x0' || d.side === 'x1').map((d) => d.value)).toEqual([800, 800])
  })

  test('L 形：有分段的边出两道，分段之和 = 总长；尺寸线在外墙外侧', () => {
    // 900 × 800，右下角缺 300 × 300
    const L = [
      { x: 0, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 500 },
      { x: 600, y: 500 },
      { x: 600, y: 800 },
      { x: 0, y: 800 },
    ]
    const ds = outlineDims(L, 18)
    for (const side of SIDES) {
      const seg = ds.filter((d) => d.side === side && d.tier === 0)
      const all = ds.filter((d) => d.side === side && d.tier === 1)
      expect(all).toHaveLength(1)
      const horiz = side === 'y0' || side === 'y1'
      expect(all[0].value).toBe(horiz ? 900 : 800)
      expect(seg).toHaveLength(2)
      expect(seg.reduce((s, d) => s + d.value, 0)).toBe(all[0].value)
    }
    expect(ds.filter((d) => d.side === 'y1' && d.tier === 0).map((d) => d.value)).toEqual([600, 300])
    // 尺寸线在外皮外面，第二道比第一道更远
    const y1 = ds.filter((d) => d.side === 'y1')
    for (const d of y1) expect(d.a.y).toBeGreaterThan(800 + 9)
    expect(y1.find((d) => d.tier === 1)!.a.y).toBeGreaterThan(y1.find((d) => d.tier === 0)!.a.y)
    // 缺角处的尺寸界线从缺角的外皮引出（y = 500 + 9 + 空隙），不是从包围盒
    const notch = y1.find((d) => d.tier === 0 && d.value === 300)!
    expect(notch.fromB.y).toBeLessThan(600)
  })
})

/** 每层：总长尺寸 = 外轮廓（中心线）包围盒 */
function checkFloorDims(p: Plan) {
  const annos = floorAnnotations(p)
  expect(annos).toHaveLength(planFloors(p).length)
  for (const a of annos) {
    const outline = floorOutline(floorView(p, a.floorId).rooms)
    expect(outline).not.toBeNull()
    const b = bbox(outline!)
    const overall = a.dims.filter((d) => d.tier === 1)
    expect(overall).toHaveLength(4)
    for (const d of overall) expect(d.value).toBeCloseTo(d.side === 'y0' || d.side === 'y1' ? b.x1 - b.x0 : b.y1 - b.y0, 6)
    for (const side of SIDES) {
      const seg = a.dims.filter((d) => d.side === side && d.tier === 0)
      const all = overall.find((d) => d.side === side)!
      if (seg.length) expect(seg.reduce((s, d) => s + d.value, 0)).toBeCloseTo(all.value, 6)
    }
    // 房间名：挑空不标，其余户内房间都有
    const rooms = floorView(p, a.floorId).rooms.filter((r) => r.kind !== 'void')
    expect(a.rooms.map((r) => r.id).sort()).toEqual(rooms.map((r) => r.id).sort())
    for (const r of a.rooms) expect(r.area).toBeGreaterThan(0)
  }
  return annos
}

describe('户型标注', () => {
  test('单层公寓：一层、标高 ±0、总长与户型包围盒一致', () => {
    const p = genJp(3)
    const annos = checkFloorDims(p)
    expect(annos).toHaveLength(1)
    expect(annos[0].level).toBe(0)
    const indoor = p.rooms.filter((r) => r.kind !== 'balcony' && r.kind !== 'void').flatMap((r) => r.points)
    const b = bbox(indoor)
    expect(annos[0].dims.find((d) => d.side === 'y1' && d.tier === 1)!.value).toBeCloseTo(b.x1 - b.x0, 6)
    expect(topLevel(p)).toBe(planFloors(p)[0].height)
  })

  test('两层户建：每层都有标高和尺寸；层间高 = 上层标高差', () => {
    const p = twoStoryPlan()
    const annos = checkFloorDims(p)
    expect(annos.map((a) => a.level)).toEqual(planFloors(p).map((f) => f.elevation - planFloors(p)[0].elevation))
    expect(annos[1].level).toBeGreaterThan(0)
    expect(annos[0].rise).toBe(annos[1].level - annos[0].level)
    expect(annos[1].rise).toBe(planFloors(p)[1].height)
    // 外轮廓 900 × 800
    expect(annos[0].dims.filter((d) => d.tier === 1).map((d) => d.value).sort((a, b) => a - b)).toEqual([800, 800, 900, 900])
  })

  test('生成的户建 / 复式：每层都有四边总长和标高', () => {
    for (const dwelling of ['house', 'duplex'] as const)
      for (const seed of [1, 2, 3]) {
        const p = generatePlan({ ...JP_OPTS, seed, region: 'jp', dwelling }).plan
        const annos = checkFloorDims(p)
        expect(annos.length).toBe(2)
        expect(new Set(annos.map((a) => a.level)).size).toBe(2)
      }
  })
})

describe('线框', () => {
  test('两层户建：剖切 / 满高都能搭出来，每层都有墙线和填充', () => {
    const p = twoStoryPlan()
    for (const walls of ['cut', 'full'] as const) {
      const fs = structureGeometry(p, walls)
      expect(fs).toHaveLength(2)
      for (const f of fs) {
        expect(f.lines.wall.length).toBeGreaterThan(6 * 20)
        expect(f.fills.wall.length).toBeGreaterThan(9 * 20)
        expect(f.lines.opening.length).toBeGreaterThan(0)
        expect(f.wallTop).toBe(walls === 'cut' ? 140 : planFloors(p).find((x) => x.id === f.floorId)!.height)
        for (const v of f.lines.wall) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  test('户建（带屋顶、外墙装饰）：满高时有屋顶线，剖切时没有', () => {
    const p = generatePlan({ ...JP_OPTS, seed: 2, region: 'jp', dwelling: 'house' }).plan
    const cut = structureGeometry(p, 'cut')
    const full = structureGeometry(p, 'full')
    const sum = (fs: typeof cut) => fs.reduce((s, f) => s + f.lines.wall.length, 0)
    expect(sum(full)).toBeGreaterThan(sum(cut))
  })

  test('家具线框：全部 ≥ 大件 ≥ 隐藏 = 0', () => {
    const p = genJp(5)
    p.furniture = decorate(p, 5)
    expect(p.furniture.length).toBeGreaterThan(0)
    const mat = new THREE.MeshBasicMaterial()
    const count = (show: 'all' | 'large' | 'none') => furnitureMeshes(p, show, mat).reduce((s, f) => s + f.meshes.length, 0)
    const all = count('all')
    const large = count('large')
    expect(all).toBeGreaterThan(0)
    expect(large).toBeGreaterThan(0)
    expect(large).toBeLessThan(all)
    expect(count('none')).toBe(0)
    expect(p.furniture.some(isLargeFurniture)).toBe(true)
  })
})

describe('硬边提取', () => {
  test('和 THREE.EdgesGeometry 的边数一致（立方体、圆柱、圆角盒、球）', () => {
    const geos = [new THREE.BoxGeometry(10, 20, 30), new THREE.CylinderGeometry(5, 5, 20, 24), new THREE.SphereGeometry(10, 16, 12), new THREE.TorusGeometry(10, 3, 8, 24), new THREE.BoxGeometry(10, 10, 10).toNonIndexed()]
    for (const g of geos)
      for (const angle of [20, 32]) {
        const ref = new THREE.EdgesGeometry(g, angle).getAttribute('position').count / 2
        expect(hardEdges(g, angle).length / 6).toBe(ref)
      }
  })
})

describe('设计图视图（假渲染器）', () => {
  const fakeDom = () => {
    const ev = { addEventListener() {}, removeEventListener() {} }
    return { ...ev, style: {}, ownerDocument: ev, getRootNode: () => ev, clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as unknown as HTMLElement
  }
  const fakeRenderer = () =>
    ({
      getClearColor: (c: unknown) => c,
      getClearAlpha: () => 0,
      setClearColor() {},
      setRenderTarget() {},
      getRenderTarget: () => null,
      clear() {},
      render() {},
      shadowMap: {},
      capabilities: { maxTextureSize: 8192 },
      extensions: { has: () => true },
      autoClear: true,
      getDrawingBufferSize: (v: import('three').Vector2) => v.set(1600, 1200),
    }) as unknown as import('three').WebGLRenderer
  const opts = { paper: 'white', furniture: 'all', walls: 'cut', ortho: true, unit: 'mm', layout: 'explode' } as const

  test('两层户建：进入、排版、切换选项都不报错；每层都有尺寸线、标高文字', () => {
    const p = twoStoryPlan()
    const v = new BlueprintView(fakeRenderer(), fakeDom())
    v.resize(800, 600)
    v.enter({ plan: p }, { ...opts })
    expect(v.frame()).toBe(true)
    const s = v.stats() as Record<string, number>
    expect(s.wall).toBeGreaterThan(0)
    expect(s.dim).toBeGreaterThan(0)
    expect(s.labels).toBeGreaterThan(8)
    // 标高：两层各一个 + 墙顶
    const levels = (v as unknown as { labels: { kind: string; floorId: string }[] }).labels.filter((l) => l.kind === 'level')
    expect(levels).toHaveLength(3)
    expect(new Set(levels.map((l) => l.floorId)).size).toBe(2)
    for (const o of [{ walls: 'full' }, { paper: 'blue' }, { ortho: false }, { layout: 'stack' }, { furniture: 'none' }, { unit: 'cm' }] as const) {
      v.setOptions({ ...opts, ...o })
      v.frame()
    }
    v.exit()
    v.dispose()
  })
})
