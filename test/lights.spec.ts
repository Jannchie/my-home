// 室内灯光：每个房间都有主灯、开关 / 色温存档字段的读写与默认值、亮度上限
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { generatePlan } from '/src/generate-region'
import { normalizePlan } from '/src/store'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { DEFAULT_KELVIN, IndoorLights, LARGE_GLOW_CAP, autoLevel, glowIntensity, isLampAsset, kelvinColor, lampTarget, lightColor, roomLightSpecs, roomTarget, takeOverRoomLights } from '/src/three/lights'
import type { Plan } from '/src/model'
import { floorHeight, floorOf } from '/src/floors'
import { JP_OPTS, range } from './helpers'

const plans: [string, Plan][] = (['jp', 'cn', 'west'] as const).flatMap((region) => range(1, 30).map((seed) => [`${region}#${seed}`, generatePlan({ seed, ...JP_OPTS, region }).plan] as [string, Plan]))

describe('房间主灯', () => {
  test('每个房间（含阳台）恰好一盏主灯，位置在房间里、高度在天花板以下', () => {
    const bad: string[] = []
    for (const [name, p] of plans) {
      const specs = roomLightSpecs(p)
      for (const r of p.rooms) {
        const prim = specs.filter((s) => s.roomId === r.id && s.primary)
        if (prim.length !== 1) bad.push(`${name} ${r.kind}: ${prim.length} 盏主灯`)
      }
      for (const s of specs) {
        if (!(s.h > 100 && s.h <= floorHeight(p, floorOf(p, p.rooms.find((r) => r.id === s.roomId)!)))) bad.push(`${name} ${s.roomId}: 高度 ${s.h}`)
        if (s.ceil !== floorHeight(p, floorOf(p, p.rooms.find((r) => r.id === s.roomId)!))) bad.push(`${name} ${s.roomId}: 天花板 ${s.ceil}`)
        if (!(s.intensity > 0 && s.distance > 0)) bad.push(`${name} ${s.roomId}: 强度 / 距离不对`)
      }
    }
    expect(bad).toEqual([])
  })

  test('按房间类型选灯：卫浴玄关是小吸顶灯、阳台是壁灯、有厨房设备的厨房是手元灯', () => {
    for (const [, p] of plans) {
      const specs = roomLightSpecs(p)
      for (const r of p.rooms) {
        const s = specs.find((x) => x.roomId === r.id && x.primary)!
        if (r.kind === 'balcony') expect(s.kind).toBe('wall')
        if (['bath', 'toilet', 'wash', 'entrance', 'hall', 'storage'].includes(r.kind)) expect(s.kind).toBe('small')
        if (r.kind === 'kitchen' && p.fixtures.some((f) => f.kind === 'kitchen')) expect(['counter', 'ceiling']).toContain(s.kind)
        if (r.kind === 'western' || r.kind === 'japanese') expect(s.kind).toBe('ceiling')
      }
    }
  })

  test('餐厅有餐桌时换成餐桌上方的吊灯', () => {
    const p: Plan = {
      version: 1,
      name: 't',
      wall: 10,
      wallOuter: 18,
      rooms: [{ id: 'd', name: '餐厅', kind: 'dining', points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }],
      openings: [],
      fixtures: [],
      furniture: [{ id: 't', asset: 'tbl-dining-135', x: 150, y: 120, rot: 0 }],
    }
    const s = roomLightSpecs(p).find((x) => x.primary)!
    expect(s.kind).toBe('pendant')
    expect([s.x, s.y]).toEqual([150, 120])
    expect(s.h).toBeLessThan(200)
  })
})

describe('开关与色温', () => {
  test('房间设置优先于全局；自动跟太阳高度，黄昏渐亮', () => {
    expect(roomTarget('auto', undefined, 0.4)).toBe(0.4)
    expect(roomTarget('off', 'on', 0)).toBe(1)
    expect(roomTarget('on', 'off', 1)).toBe(0)
    expect(roomTarget('on', 'auto', 0)).toBe(1)
    expect(lampTarget(undefined, 0.7)).toBe(0.7)
    expect(lampTarget('off', 1)).toBe(0)
    expect(autoLevel(30)).toBe(0)
    expect(autoLevel(-10)).toBe(1)
    const mid = autoLevel(1)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  test('色温：低偏暖、高接近白；换色温不改变灯光亮度', () => {
    const warm = kelvinColor(2700)
    const cool = kelvinColor(6500)
    expect(warm.r).toBeGreaterThan(warm.b * 2)
    expect(Math.abs(cool.r - cool.b)).toBeLessThan(0.1)
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    expect(lum(lightColor(2700))).toBeCloseTo(lum(lightColor(6500)), 5)
    expect(DEFAULT_KELVIN).toBe(4000)
  })

  test('发光部件：白天不变，夜里有上限（不过曝）', () => {
    for (const base of [0.35, 0.55, 0.8]) {
      expect(glowIntensity(base, 0, 0)).toBeCloseTo(base)
      expect(glowIntensity(base, 0, 1)).toBeCloseTo(base)
      expect(glowIntensity(base, 1, 1, 0.9)).toBeLessThanOrEqual(Math.max(base, 0.65))
      expect(glowIntensity(base, 1, 0)).toBeLessThan(base * 0.2)
    }
  })

  test('灯具识别：灯具分类都算，头灯 / 应援棒不算', () => {
    const lamps = ASSETS.filter((a) => a.category === 'lighting' && !a.fixture)
    expect(lamps.length).toBeGreaterThan(10)
    for (const a of lamps) expect(isLampAsset(a)).toBe(true)
    for (const id of ['gr-headlamp', 'int-penlights']) {
      const a = ASSETS.find((x) => x.id === id)
      if (a) expect(isLampAsset(a)).toBe(false)
    }
  })
})

describe('存档字段', () => {
  const base = (): Plan => ({
    version: 1,
    name: 't',
    wall: 10,
    wallOuter: 18,
    rooms: [
      { id: 'a', name: 'A', kind: 'western', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] },
      { id: 'b', name: 'B', kind: 'western', points: [{ x: 300, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 }, { x: 300, y: 300 }] },
    ],
    openings: [],
    fixtures: [],
    furniture: [{ id: 'f', asset: 'floor-lamp', x: 100, y: 100, rot: 0 }],
    appliancesAsFurniture: true,
  })

  test('旧存档没有灯光字段：缺省 = 自动、跟随全局色温', () => {
    const p = normalizePlan(JSON.parse(JSON.stringify(base())))!
    expect(p.rooms.every((r) => r.light === undefined && r.lightK === undefined)).toBe(true)
    expect(p.furniture[0].light).toBeUndefined()
  })

  test('开关 / 色温写进存档后原样读回；坏数据去掉、色温夹到范围内', () => {
    const p = base()
    p.rooms[0].light = 'off'
    p.rooms[0].lightK = 4000
    p.furniture[0].light = 'on'
    const back = normalizePlan(JSON.parse(JSON.stringify(p)))!
    expect(back.rooms[0].light).toBe('off')
    expect(back.rooms[0].lightK).toBe(4000)
    expect(back.furniture[0].light).toBe('on')

    const raw = JSON.parse(JSON.stringify(p))
    raw.rooms[0].light = 'blink'
    raw.rooms[1].light = 'auto'
    raw.rooms[1].lightK = 99999
    raw.furniture[0].light = 'maybe'
    const fixed = normalizePlan(raw)!
    expect(fixed.rooms[0].light).toBeUndefined()
    expect(fixed.rooms[1].light).toBeUndefined()
    expect(fixed.rooms[1].lightK).toBe(6500)
    expect(fixed.furniture[0].light).toBeUndefined()
  })
})

describe('灯具亮度与按风格的主灯', () => {
  test('大面积白色纸罩夜里压到更低的上限；小灯罩、灯泡不受影响', () => {
    // 和纸灯笼落地灯：emissive 0.55、近白、发光面两万多 cm²
    expect(glowIntensity(0.55, 1, 1, 0.94, 22000)).toBeLessThanOrEqual(LARGE_GLOW_CAP + 0.01)
    expect(glowIntensity(0.55, 1, 1, 0.94, 300)).toBeCloseTo(0.55)
    expect(glowIntensity(0.85, 1, 1, 0.9, 22000)).toBeCloseTo(0.85)
    // 白天不变
    expect(glowIntensity(0.55, 0, 1, 0.94, 22000)).toBeCloseTo(0.55)
  })

  test('吸顶灯 / 吊灯按风格换造型，光源仍在天花板以下、灯具里面', () => {
    const styles = ['cute', 'nordic', 'modern', 'japanese', 'industrial', 'retro', 'chinese', 'classic', 'farmhouse'] as const
    for (const st of styles) {
      const shapes = new Set<string>()
      for (const [, p] of plans.slice(0, 20)) {
        for (const s of roomLightSpecs(p, new Map(), () => st)) {
          expect(s.h).toBeGreaterThan(100)
          expect(s.h).toBeLessThanOrEqual(s.ceil!)
          if (s.kind === 'ceiling' || s.kind === 'small' || s.kind === 'pendant') {
            expect(s.h).toBeGreaterThanOrEqual(s.fy)
            expect(s.shape).toBeTruthy()
            shapes.add(s.shape!)
          } else expect(s.shape).toBeUndefined()
        }
      }
      expect(shapes.size).toBeGreaterThan(1)
    }
  })
})

describe('阳台壁灯跟着它挂的那面墙', () => {
  // 阳台壁灯以前放在灯光组里，不跟墙体让开：墙压低 / 半墙时还挂在半空
  const setup = () => {
    const plan = generatePlan({ ...JP_OPTS, seed: 1, region: 'jp' }).plan
    const lights = new IndoorLights(8)
    lights.syncRooms(plan, ASSET_MAP, () => 0)
    const lamp = lights.fixtures.children.find((o) => (o.userData.fade as { onWall?: boolean } | undefined)?.onWall)
    return { plan, lights, lamp }
  }
  test('阳台壁灯在灯具组里，带着朝向（朝阳台）', () => {
    const { lamp } = setup()
    expect(lamp).toBeTruthy()
  })
  test('半墙 / 全部压低（hideAll）时藏起来；外观视图（墙完整）时显示', () => {
    const { lights, lamp } = setup()
    lights.applyCutaway({ x: 0, y: 0 }, null, null, true)
    expect(lamp!.userData.target).toBe(1)
    lights.applyCutaway({ x: 0, y: 0 }, null, null, false)
    expect(lamp!.userData.target).toBe(0)
  })
  test('前墙让开时：镜头在阳台那一侧（这面墙正对镜头）就藏，在房子另一侧就不藏', () => {
    const { lights, lamp } = setup()
    const f = lamp!.userData.fade as { x: number; y: number; nx: number; ny: number }
    const center = { x: f.x - f.nx * 300, y: f.y - f.ny * 300 }
    lights.applyCutaway(center, { x: f.nx, y: f.ny }, null, false)
    expect(lamp!.userData.target).toBe(1)
    lights.applyCutaway(center, { x: -f.nx, y: -f.ny }, null, false)
    expect(lamp!.userData.target).toBe(0)
  })
})

describe('主灯换成灯具家具（吸顶灯 / 吊灯素材）', () => {
  const pick = () => {
    const p = structuredClone(plans.find(([, x]) => x.rooms.some((r) => r.kind === 'western'))![1])
    const room = p.rooms.find((r) => r.kind === 'western')!
    return { p, room }
  }

  test('接管：原位换成同款素材，房间不再自动摆主灯；删光了也不回来', () => {
    const { p, room } = pick()
    const specs = roomLightSpecs(p)
    const mine = specs.filter((s) => s.roomId === room.id && ['ceiling', 'small', 'pendant'].includes(s.kind))
    expect(mine.length).toBeGreaterThan(0)
    const made = takeOverRoomLights(p, room.id, specs)
    expect(made.length).toBe(mine.length)
    for (const f of made) {
      const def = ASSET_MAP.get(f.asset)!
      expect(def.ceiling, f.asset).toBeTruthy()
      expect(isLampAsset(def)).toBe(true)
    }
    expect(roomLightSpecs(p).filter((s) => s.roomId === room.id && s.primary)).toEqual([])
    p.furniture = p.furniture.filter((f) => !made.includes(f))
    expect(roomLightSpecs(p).filter((s) => s.roomId === room.id && s.primary)).toEqual([])
    // 再接管不会重复加
    expect(takeOverRoomLights(p, room.id, specs)).toEqual([])
  })

  test('手动摆一盏吸顶灯：这个房间的自动主灯让出来，别的房间不变', () => {
    const { p, room } = pick()
    const before = roomLightSpecs(p).filter((s) => s.primary).length
    const c = room.points.reduce((a, q) => ({ x: a.x + q.x / room.points.length, y: a.y + q.y / room.points.length }), { x: 0, y: 0 })
    p.furniture.push({ id: 'cl1', asset: 'cl-led-disc', x: c.x, y: c.y, rot: 0, ...(room.floor ? { floor: room.floor } : {}) })
    const after = roomLightSpecs(p)
    expect(after.filter((s) => s.roomId === room.id && s.primary)).toEqual([])
    expect(after.filter((s) => s.primary).length).toBe(before - 1)
  })

  test('吸顶灯家具当房间主灯打光：入夜亮起、光源在天花板下、照射范围同自动主灯', () => {
    const { p, room } = pick()
    const auto = roomLightSpecs(p).find((s) => s.roomId === room.id && s.primary)!
    const made = takeOverRoomLights(p, room.id, roomLightSpecs(p))
    const lights = new IndoorLights(8)
    lights.syncRooms(p, ASSET_MAP, () => 0)
    const objs = new Map(made.map((f) => [f.id, { obj: placed(f) }]))
    lights.syncLamps(p, objs, ASSET_MAP, (f) => p.rooms.find((r) => r.id === room.id && f), () => 0)
    lights.setState({ global: 'on', kelvin: DEFAULT_KELVIN, auto: 1, night: 1, power: 1 })
    for (let i = 0; i < 60; i++) lights.step(1 / 30)
    expect(lights.levelOf(room.id)).toBeCloseTo(1, 3)
    const pool = lights.group.children.filter((o) => (o as THREE.PointLight).isPointLight) as THREE.PointLight[]
    const lit = pool.filter((l) => l.intensity > 0 && Math.hypot(l.position.x - made[0].x, l.position.z - made[0].y) < 30)
    expect(lit.length).toBeGreaterThan(0)
    expect(lit[0].position.y).toBeLessThan(240)
    expect(lit[0].position.y).toBeGreaterThan(150)
    expect(lit[0].distance).toBeGreaterThanOrEqual(auto.distance)
  })
})

/** 家具模型摆到它的位置（测试用） */
function placed(f: Plan['furniture'][number]) {
  const g = ASSET_MAP.get(f.asset)!.build(ASSET_MAP.get(f.asset)!.palettes[0])
  g.position.set(f.x, 0, f.y)
  g.updateMatrixWorld(true)
  return g
}
