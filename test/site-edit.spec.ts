// 外观编辑器（3D 里点中车 / 围挡 / 屋顶 / 外墙浮出的卡片，和侧栏外观页共用）：
// 编辑对象的解析与校验、车型选项的补丁、滑杆一次拖动只记一步撤销、预览图的缓存键和预览模型。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { CAR_KINDS, FACADE_KINDS, FENCE_KINDS, PORCH_KINDS, ROOF_KINDS, type CarKind, type Exterior, type FenceKind } from '/src/model'
import { checkpoint, normalizePlan, plan, setExterior, setParking, setSite, settle, undo } from '/src/store'
import { generatePlan } from '/src/generate-region'
import { CAR_CHOICES, carChoice, carPatch, liveEdit, parkingIndex, parkingTarget, siteTargets, targetTitle, targetValid } from '/src/siteEdit'
import { previewKey, previewObject, previewPlan, type SitePreview } from '/src/three/siteThumbs'
import { JP_OPTS } from './helpers'

const house = () => normalizePlan(JSON.parse(JSON.stringify(generatePlan({ ...JP_OPTS, seed: 5, region: 'jp', dwelling: 'house' }).plan)))!

describe('编辑对象', () => {
  test('parking:i 解析', () => {
    expect(parkingIndex(parkingTarget(2))).toBe(2)
    expect(parkingIndex('fence')).toBeNull()
    expect(parkingIndex('roof')).toBeNull()
    expect(parkingIndex('parking:x' as never)).toBeNull()
  })

  test('户建：一览里有屋顶、外墙、围挡和每个车位；对象没了就无效', () => {
    const p = house()
    const ts = siteTargets(p)
    expect(ts.slice(0, 3)).toEqual(['roof', 'facade', 'fence'])
    expect(ts.length).toBe(3 + p.site!.parking.length)
    for (const t of ts) expect(targetValid(p, t)).toBe(true)
    expect(targetValid(p, parkingTarget(p.site!.parking.length))).toBe(false)
    expect(targetTitle(p, 'fence').key).toBe('围挡')
    // 公寓：没有用地和外观
    const flat = { site: undefined, exterior: undefined }
    expect(siteTargets(flat)).toEqual([])
    expect(targetValid(flat, 'fence')).toBe(false)
    expect(targetValid(flat, 'roof')).toBe(false)
  })

  test('车型选项：不停车 / compact 不写字段 / 第一次停车补上缺省色', () => {
    expect(CAR_CHOICES[0]).toBe('none')
    expect(carChoice({})).toBe('none')
    expect(carChoice({ car: true })).toBe('compact')
    expect(carChoice({ car: true, carKind: 'suv' })).toBe('suv')
    expect(carPatch('none', {})).toEqual({ car: undefined })
    expect(carPatch('compact', { carColor: '#123456' })).toEqual({ car: true, carKind: undefined, carColor: '#123456' })
    expect(carPatch('kei', {})).toMatchObject({ car: true, carKind: 'kei', carColor: '#d9534f' })
  })
})

describe('撤销：一次改动一步', () => {
  test('款式 / 颜色各一步', () => {
    plan.value = house()
    const fence0 = plan.value.site!.fence
    setSite({ fence: 'picket' })
    setSite({ fenceColor: '#2f3338' })
    expect(plan.value.site!.fence).toBe('picket')
    undo()
    expect(plan.value.site!.fenceColor).toBeUndefined()
    expect(plan.value.site!.fence).toBe('picket')
    undo()
    expect(plan.value.site!.fence).toBe(fence0)
  })

  test('车：换车型、拿掉车各一步', () => {
    plan.value = house()
    const sp0 = JSON.stringify(plan.value.site!.parking[0])
    setParking(0, carPatch('minivan', plan.value.site!.parking[0]))
    expect(carChoice(plan.value.site!.parking[0])).toBe('minivan')
    setParking(0, carPatch('none', plan.value.site!.parking[0]))
    expect(plan.value.site!.parking[0].car).toBeUndefined()
    undo()
    expect(carChoice(plan.value.site!.parking[0])).toBe('minivan')
    undo()
    expect(JSON.stringify(plan.value.site!.parking[0])).toBe(sp0)
  })

  test('滑杆拖一次（按下 → 多次 input → 松手）只记一步；键盘改值也是一步', () => {
    plan.value = house()
    const h0 = plan.value.site!.fenceHeight
    const live = liveEdit(checkpoint, settle)
    live.begin() // pointerdown
    for (const h of [100, 120, 140, 160]) {
      live.begin() // 每次 input 都会调，只有第一次记
      setSite({ fenceHeight: h }, false)
    }
    live.end()
    expect(plan.value.site!.fenceHeight).toBe(160)
    undo()
    expect(plan.value.site!.fenceHeight).toBe(h0)

    // 键盘：没有 pointerdown，第一次 input 记一步
    const pitch0 = plan.value.exterior!.pitch
    live.begin()
    setExterior({ pitch: 0.7 }, false)
    live.end()
    live.begin()
    setExterior({ pitch: 0.75 }, false)
    live.end()
    undo()
    expect(plan.value.exterior!.pitch).toBe(0.7)
    undo()
    expect(plan.value.exterior!.pitch).toBe(pitch0)
  })

  test('按下没拖动：不留空的一步', () => {
    plan.value = house()
    const live = liveEdit(checkpoint, settle)
    setSite({ fence: 'block' })
    live.begin()
    live.end()
    undo()
    expect(plan.value.site!.fence).not.toBe('block')
  })
})

const EX: Exterior = { roof: 'gable', roofColor: '#4f5866', facade: 'siding', wallColor: '#f2ede3', trimColor: '#ffffff' }

function meshCount(o: THREE.Object3D) {
  let n = 0
  o.traverse((x) => {
    if ((x as THREE.Mesh).isMesh && !x.userData.isOutline) n++
  })
  return n
}

function vertexCount(o: THREE.Object3D) {
  let n = 0
  o.traverse((x) => {
    if ((x as THREE.Mesh).isMesh && !x.userData.isOutline) n += (x as THREE.Mesh).geometry.attributes.position.count
  })
  return n
}

describe('选项预览图', () => {
  test('缓存键：每个选项、每种颜色都不同；同样的参数相同', () => {
    const specs: SitePreview[] = [
      ...(Object.keys(FENCE_KINDS) as FenceKind[]).filter((k) => k !== 'none').map((k) => ({ t: 'fence', kind: k }) as SitePreview),
      ...(Object.keys(CAR_KINDS) as CarKind[]).map((k) => ({ t: 'car', kind: k, color: '#d9534f' }) as SitePreview),
      { t: 'car', kind: 'compact', color: '#3b5b8c' },
      ...(Object.keys(ROOF_KINDS) as Exterior['roof'][]).map((k) => ({ t: 'house', focus: 'roof', ex: { ...EX, roof: k } }) as SitePreview),
      ...(Object.keys(FACADE_KINDS) as Exterior['facade'][]).map((k) => ({ t: 'house', focus: 'facade', ex: { ...EX, facade: k } }) as SitePreview),
      ...(Object.keys(PORCH_KINDS) as NonNullable<Exterior['porch']>[]).map((k) => ({ t: 'house', focus: 'entrance', ex: { ...EX, porch: k } }) as SitePreview),
      { t: 'fence', kind: 'hedge', color: '#123456' },
      { t: 'fence', kind: 'hedge', height: 150 },
    ]
    const keys = specs.map(previewKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(previewKey({ t: 'fence', kind: 'brick' })).toBe(previewKey({ t: 'fence', kind: 'brick' }))
    for (const k of keys) expect(k.startsWith('site:')).toBe(true)
  })

  test.each((Object.keys(FENCE_KINDS) as FenceKind[]).filter((k) => k !== 'none'))('围挡 %s 的预览模型', (k) => {
    const o = previewObject({ t: 'fence', kind: k })
    expect(meshCount(o)).toBeGreaterThan(1)
    const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(250)
  })

  test.each(Object.keys(CAR_KINDS) as CarKind[])('车 %s 的预览模型', (k) => {
    expect(meshCount(previewObject({ t: 'car', kind: k, color: '#336699' }))).toBeGreaterThan(4)
  })

  test('小房子：每种屋顶都搭得出屋顶；入口的三种样子不同', () => {
    const p = previewPlan(EX)
    expect(p.rooms.some((r) => r.kind === 'entrance')).toBe(true)
    for (const roof of Object.keys(ROOF_KINDS) as Exterior['roof'][]) {
      let roofs = 0
      previewObject({ t: 'house', focus: 'roof', ex: { ...EX, roof } }).traverse((o) => {
        if (o.userData.roof) roofs++
      })
      expect(roofs).toBeGreaterThan(0)
    }
    // 同色的板会合并成一个网格：比顶点总数
    const counts = (Object.keys(PORCH_KINDS) as NonNullable<Exterior['porch']>[]).map((porch) => vertexCount(previewObject({ t: 'house', focus: 'entrance', ex: { ...EX, porch } })))
    expect(new Set(counts).size).toBe(counts.length)
  })
})
