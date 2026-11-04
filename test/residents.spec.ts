// VRM 住户层（three/residents.ts）的行为：找座位、坐下 / 躺下 / 起身、经楼梯换层。
// 不载入真的 VRM：用一个只有骨骼节点的替身模型（姿势照常摆，只是没有网格）。
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { generatePlan } from '/src/generate-region'
import { generateHousehold } from '/src/household'
import { decorateHouse } from '/src/decorate'
import { baseFloorId, planFloors } from '/src/floors'
import { HouseNav } from '/src/nav'
import { ResidentLayer, lieSpec, type ResidentModel } from '/src/three/residents'
import { ASSET_MAP } from '/src/three/assets'
import { canSitOn, isSleepable } from '/src/three/tags'
import { buildMotions, motionData } from '/src/three/motions'
import { JP_OPTS } from './helpers'

/** 替身骨架：标准化骨骼按 T 字站姿摆好（米），挂在场景下（动作片段按骨骼名绑定） */
const RIG: [string, string | null, number, number, number][] = [
  ['hips', null, 0, 0.88, 0],
  ['spine', 'hips', 0, 0.1, 0],
  ['chest', 'spine', 0, 0.12, 0],
  ['neck', 'chest', 0, 0.2, 0],
  ['head', 'neck', 0, 0.1, 0],
  ['leftUpperArm', 'chest', 0.18, 0.15, 0],
  ['rightUpperArm', 'chest', -0.18, 0.15, 0],
  ['leftLowerArm', 'leftUpperArm', 0.25, 0, 0],
  ['rightLowerArm', 'rightUpperArm', -0.25, 0, 0],
  ['leftUpperLeg', 'hips', 0.09, -0.05, 0],
  ['rightUpperLeg', 'hips', -0.09, -0.05, 0],
  ['leftLowerLeg', 'leftUpperLeg', 0, -0.38, 0],
  ['rightLowerLeg', 'rightUpperLeg', 0, -0.38, 0],
  ['leftFoot', 'leftLowerLeg', 0, -0.37, 0],
  ['rightFoot', 'rightLowerLeg', 0, -0.37, 0],
]

/** 不载入真的 VRM：只有骨骼节点、没有网格的替身，动作片段用真的数据换算 */
async function stubModel(): Promise<ResidentModel> {
  const scene = new THREE.Group()
  const bones = new Map<string, THREE.Object3D>()
  for (const [name, parent, x, y, z] of RIG) {
    const n = new THREE.Object3D()
    n.name = name
    n.position.set(x, y, z)
    ;(parent ? bones.get(parent)! : scene).add(n)
    bones.set(name, n)
  }
  const vrm = {
    scene,
    humanoid: { getNormalizedBoneNode: (b: string) => bones.get(b) ?? null, update() {} },
    update() {},
  } as unknown as VRM
  const root = new THREE.Group()
  root.scale.setScalar(100)
  root.add(scene)
  return { vrm, root, vrm0: false, height: 160, hipY: 88, ankleY: 8, motions: buildMotions(vrm, false, 88, 100, await motionData()) }
}

function house(seed = 3) {
  const plan = generatePlan({ ...JP_OPTS, seed, region: 'jp', dwelling: 'house' }).plan
  const hh = generateHousehold(plan, seed)
  plan.household = hh
  plan.furniture = decorateHouse(plan, seed, 'auto', hh)
  return plan
}

const run = (layer: ResidentLayer, id: string, until: (s: ReturnType<ResidentLayer['snapshot']>[number]) => boolean, secs = 120) => {
  for (let i = 0; i < secs * 30; i++) {
    layer.update(1 / 30)
    const me = layer.snapshot().find((s) => s.id === id)!
    if (until(me)) return me
  }
  return layer.snapshot().find((s) => s.id === id)!
}

describe('VRM 住户', () => {
  const plan = house()
  const lift = (id: string) => planFloors(plan).find((f) => f.id === id)!.elevation

  test('布置好的户建里找得到沙发 / 椅子和床', async () => {
    const layer = new ResidentLayer()
    layer.add('a', await stubModel())
    layer.sync(plan, false)
    const seats = layer.seatList
    expect(seats.some((s) => !s.lie)).toBe(true)
    expect(seats.some((s) => s.lie)).toBe(true)
    // 座面、床面都在地面以上、一般家具的高度以内
    for (const s of seats) expect(s.y).toBeGreaterThan(0)
    for (const s of seats) expect(s.y).toBeLessThan(90)
  })

  test('走过去坐下：髋部落到座面上，起身后放掉座位', async () => {
    const layer = new ResidentLayer()
    layer.lift = lift
    layer.add('a', await stubModel())
    layer.sync(plan, true)
    const fl = layer.snapshot()[0].fl
    const seat = layer.seatList.find((s) => !s.lie && s.fl === fl) ?? layer.seatList.find((s) => !s.lie)!
    expect(layer.seatAt('a', seat.key)).toBe(true)
    const sat = run(layer, 'a', (s) => s.seat === seat.key && s.sit > 0.99)
    expect(sat.seat).toBe(seat.key)
    // 髋部落在座面上方一成髋高（大腿的厚度）：脚底的高度 = 座面 + 8.8 − 坐好时的髋高
    const m = await stubModel()
    expect(sat.z).toBeCloseTo(seat.y + 8.8 - m.motions.sitHip.y, 3)
    expect(layer.seatList.find((s) => s.key === seat.key)!.by).toBe('a')
    // 让他去别处：先起身，座位空出来
    expect(layer.sendTo('a', seat.fl, layer.seatList.find((s) => s.key === seat.key)!.front)).toBe(true)
    const up = run(layer, 'a', (s) => s.seat === null && s.sit < 0.01)
    expect(up.seat).toBe(null)
    expect(layer.seatList.find((s) => s.key === seat.key)!.by).toBe(undefined)
  })

  test('躺到床上：身体放平、脚跟抬到床面以上', async () => {
    const layer = new ResidentLayer()
    layer.lift = lift
    layer.add('a', await stubModel())
    layer.sync(plan, true)
    const bed = layer.seatList.find((s) => s.lie)!
    expect(layer.seatAt('a', bed.key)).toBe(true)
    const me = run(layer, 'a', (s) => s.seat === bed.key && s.lie > 0.99, 180)
    expect({ seat: me.seat, fl: me.fl }).toEqual({ seat: bed.key, fl: bed.fl })
    expect(me.pitch).toBeCloseTo(-Math.PI / 2, 3)
    expect(me.z).toBeGreaterThan(bed.y)
    // 闭上眼睡着以后一动不动：不再要求重画
    run(layer, 'a', () => false, 3)
    expect(layer.update(1 / 30)).toBe(false)
  })

  test('经楼梯走到另一层', async () => {
    const layer = new ResidentLayer()
    layer.lift = lift
    layer.add('a', await stubModel())
    layer.sync(plan, true)
    const nav = new HouseNav(plan, { sash: true, stepOver: 30 })
    const lo = baseFloorId(plan)
    const hi = planFloors(plan)[1].id
    const from = layer.snapshot()[0].fl
    const to = from === lo ? hi : lo
    const goal = nav.grid(to).randomSpot('walk', 16, () => 0.5, undefined, Infinity, 12) ?? nav.grid(to).nearest('walk', nav.links[0].exit, 16, 300)!
    expect(layer.sendTo('a', to, goal)).toBe(true)
    let stairs = false
    const me = run(layer, 'a', (s) => {
      if (s.task === 'stairs') stairs = true
      return s.fl === to && stairs && s.task !== 'stairs' && s.task !== 'go'
    }, 240)
    expect({ fl: me.fl, stairs }).toEqual({ fl: to, stairs: true })
  })
})

describe('哪些床能躺', () => {
  const spec = (id: string) => lieSpec(ASSET_MAP.get(id)!, 160)
  test('普通的床顺着深度躺，宽床躺两个人', () => {
    expect(spec('bed-double')).toMatchObject({ along: true, n: 2 })
    expect(spec('fm-folding-bed')).toMatchObject({ along: true, n: 1 })
  })
  test('长边朝外的日间床、上下铺顺着宽度躺', () => {
    expect(spec('fm-daybed')).toMatchObject({ along: false, n: 1 })
    expect(spec('bd-bunk')).toMatchObject({ along: false, n: 1 })
  })
  test('收起的折叠床、婴儿床、高架床、合着的沙发床不躺', () => {
    for (const id of ['fm-folding-bed-closed', 'kid-crib', 'kb2-bed-loft', 'lv-sofa-bed', 'lm-futon-sofa']) expect(spec(id), id).toBe(null)
    // 展开的沙发床能躺
    expect(spec('lm-futon-sofa-open')).toMatchObject({ along: true })
  })
})

describe('动作片段', () => {
  test('按模型的骨骼换算成片段：每段都有髋部位移和身体骨骼的旋转，坐下时髋部比站着低、在脚后面', async () => {
    const m = (await stubModel()).motions
    for (const c of Object.values(m.clips)) {
      expect(c.duration).toBeGreaterThan(0.5)
      expect(c.tracks.some((t) => t.name === 'hips.position')).toBe(true)
      expect(c.tracks.some((t) => t.name === 'leftUpperLeg.quaternion')).toBe(true)
    }
    expect(m.sitHip.y).toBeLessThan(88 * 0.75)
    expect(m.sitHip.z).toBeLessThan(0)
    // 走路片段的速度是普通步速（0.6 – 1.6 m/s）
    expect(m.walkSpeed).toBeGreaterThan(60)
    expect(m.walkSpeed).toBeLessThan(160)
  })
})

describe('床和座位的用途判断', () => {
  const def = (id: string) => ASSET_MAP.get(id)!
  test('收起 / 合着的形态不算能睡的床，置き床不是床', () => {
    expect(isSleepable(def('fm-folding-bed'))).toBe(true)
    expect(isSleepable(def('fm-folding-bed-closed'))).toBe(false)
    expect(isSleepable(def('lm-futon-sofa'))).toBe(false)
    expect(isSleepable(def('lm-futon-sofa-open'))).toBe(true)
    expect(isSleepable(def('sw-jp-okidoko'))).toBe(false)
  })
  test('吧台桌、吧台柜、毛巾杆不是座位，卡座是', () => {
    for (const id of ['tbl-bar-table', 'fm-bar-counter', 'sf-towel-bar-1']) expect(canSitOn(def(id)), id).toBe(false)
    for (const id of ['fm-booth', 'tbl-bar-stool', 'lv-sofa-bed']) expect(canSitOn(def(id)), id).toBe(true)
  })
})
