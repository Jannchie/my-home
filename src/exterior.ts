// 户建的外观数据：屋顶怎么盖（几何在 roof.ts，3D 搭建 three/exterior.ts 和测试共用）、用地 / 外观字段的读档校验。
//
// 屋顶：每一层露在外面（上面没有楼层、也没有上层阳台盖着）的部分都要盖屋顶，每层一个整体的屋顶（见 roof.ts）：
//   最上层整个外轮廓用外观指定的屋顶形式；部分二阶时下层露出来的那块（下屋）贴着上层外墙升高，
//   四坡风格两端做斜脊，双坡 / 单坡风格两端做山墙；平屋顶的下屋只沿外墙做女儿墙。

import { floorOutline, floorView, planFloors } from './floors'
import { roofShape, type RoofRect, type RoofShape } from './roof'
import { CAR_KINDS, FENCE_HEIGHT_MAX, FENCE_HEIGHT_MIN, FENCE_KINDS, PORCH_KINDS, openingGeom, pointInPolygon, type CarKind, type Exterior, type FacadeKind, type Floor, type FenceKind, type Plan, type PorchKind, type RoofCover, type RoofKind, ROOF_COVERS, type Site, type Vec } from './model'

export type Side = 'n' | 's' | 'w' | 'e'
export type { RoofRect }

export interface RoofPart extends RoofShape {
  /** 盖在哪一层上（屋顶的组放进这一层，跟着它显示 / 隐藏 / 拉开） */
  floor: string
  /** 檐口（墙顶）高度：这一层的 elevation + 墙高（离 1F 地面） */
  base: number
  /** 墙顶在这一层局部坐标里的高度（= 墙高） */
  top: number
}

/**
 * 外观视图里屋顶用的外观设定：有 Plan.exterior 就用它；没有的（公寓、复式、手画的户型、旧存档）现推一份缺省的，不写进户型：
 *   - 有用地（院子）的当作户建：四坡屋顶；
 *   - 其余当作楼里的一户：平屋顶（屋面板 + 女儿墙），女儿墙和外墙同色。
 */
export function roofExterior(plan: Pick<Plan, 'exterior' | 'site'>): Exterior {
  if (plan.exterior) return plan.exterior
  return plan.site
    ? { roof: 'hip', roofColor: '#4f5866', facade: 'stucco', wallColor: DEFAULT_OUTER_WALL, trimColor: '#ffffff' }
    : { roof: 'flat', roofColor: '#a8a29a', facade: 'stucco', wallColor: DEFAULT_OUTER_WALL, trimColor: '#d8d2c8' }
}
/** 没有外观设定时外墙的颜色（three/house.ts 的外墙材质） */
export const DEFAULT_OUTER_WALL = '#fbf3e6'

/**
 * 户型的屋顶（每层露在外面的部分一块）。ex 缺省用 roofExterior（没有外观设定的户型也有缺省屋顶）；
 * heightOf：各层实际的墙高（缺省 Floor.height），屋顶盖在墙顶上。
 */
export function roofParts(plan: Plan, ex: Exterior = roofExterior(plan), heightOf: (f: Floor) => number = (f) => f.height): RoofPart[] {
  const fs = planFloors(plan)
  const views = fs.map((f) => floorView(plan, f.id).rooms)
  const outlines = views.map((rs) => floorOutline(rs))
  const out: RoofPart[] = []
  fs.forEach((f, k) => {
    const mine = outlines[k]
    if (!mine) return
    const above = outlines.slice(k + 1).filter((o): o is Vec[] => !!o)
    // 阳台板就是下面的顶：只算正上方那一层的阳台（更高楼层挑出来的阳台和这层屋顶之间隔着一层，屋顶照样要盖）
    const aboveBalconies = (views[k + 1] ?? []).filter((r) => r.kind === 'balcony').map((r) => r.points)
    const next = fs[k + 1]
    const H = heightOf(f)
    const shape = roofShape({
      kind: ex.roof,
      outline: mine,
      above,
      aboveBalconies: above.length ? aboveBalconies : [],
      top: H,
      upperRise: next ? next.elevation - f.elevation : undefined,
      wallOuter: plan.wallOuter,
      pitch: ex.pitch ?? 0.45,
      eave: ex.eave ?? 45,
    })
    if (shape) out.push({ ...shape, floor: f.id, base: f.elevation + H, top: H })
  })
  return out
}

/** 外轮廓的每个格子是否都被某块屋顶盖住（测试用） */
export function roofCovers(parts: RoofRect[], outline: Vec[]): boolean {
  const xs = [...new Set([...outline.map((p) => p.x), ...parts.flatMap((r) => [r.x0, r.x1])])].sort((a, b) => a - b)
  const ys = [...new Set([...outline.map((p) => p.y), ...parts.flatMap((r) => [r.y0, r.y1])])].sort((a, b) => a - b)
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const p = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      if (!pointInPolygon(p, outline)) continue
      if (!parts.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1)) return false
    }
  return true
}

// ---------- 按住户风格配色 ----------

/** 住户风格 → 外观配色（墙、屋顶、点缀）；屋顶形式和外墙材质仍按地区，不在这里换 */
const STYLE_COLORS: Record<string, { wall: string[]; roof: string[]; trim: string }> = {
  japanese: { wall: ['#efe9dc', '#e2d9c6'], roof: ['#56606f', '#66707e'], trim: '#5a4a3e' },
  nordic: { wall: ['#f4f2ee', '#dfe5e8'], roof: ['#5d6570', '#6e7a86'], trim: '#ffffff' },
  modern: { wall: ['#ecebe8', '#7a7f85'], roof: ['#555b63', '#686e76'], trim: '#3a3f45' },
  industrial: { wall: ['#9a9da1', '#868a8f'], roof: ['#4d5359', '#5a5f66'], trim: '#2a2e33' },
  retro: { wall: ['#e8d8b5', '#d9c49a'], roof: ['#a35a46', '#86604f'], trim: '#ffffff' },
  cute: { wall: ['#f6e3e6', '#e6eef6', '#f7efd9'], roof: ['#d98880', '#8fb3d9'], trim: '#ffffff' },
  chinese: { wall: ['#ece4d6', '#f1ebdf'], roof: ['#5f666f', '#9a5545'], trim: '#7a3b2e' },
  classic: { wall: ['#efe7d6', '#e6dccb'], roof: ['#5f666f', '#75625a'], trim: '#ffffff' },
  farmhouse: { wall: ['#f1efe8', '#e7e2d6'], roof: ['#5a6068', '#6b5a50'], trim: '#3a3f45' },
}

/** 生成户型、推算出住户之后：外观颜色跟着住户风格走（砖墙保留砖色）。seed 决定同一风格里取哪一组 */
export function styleExterior(ex: Exterior, style: string | undefined, seed: number) {
  const c = style ? STYLE_COLORS[style] : undefined
  if (!c) return
  const k = (seed >>> 3) % 7
  if (ex.facade !== 'brick') ex.wallColor = c.wall[k % c.wall.length]
  ex.roofColor = c.roof[k % c.roof.length]
  ex.trimColor = c.trim
}

// ---------- 读档校验 ----------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown): v is Vec => !!v && typeof v === 'object' && isNum((v as Vec).x) && isNum((v as Vec).y)
const isPoly = (v: unknown, min = 3): v is Vec[] => Array.isArray(v) && v.length >= min && v.every(isVec)
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)
const ROOFS: RoofKind[] = ['gable', 'hip', 'shed', 'flat']
const FACADES: FacadeKind[] = ['siding', 'stucco', 'brick']
const FENCES = Object.keys(FENCE_KINDS) as FenceKind[]
const CARS = Object.keys(CAR_KINDS) as CarKind[]
const PORCHES = Object.keys(PORCH_KINDS) as PorchKind[]

/** 用地 / 外观：坏数据整理掉（字段缺了补缺省，整体不像样就删） */
export function normalizeExterior(p: Plan) {
  const s = p.site as unknown as Record<string, unknown> | undefined
  if (s !== undefined) {
    if (!s || typeof s !== 'object' || !isPoly(s.points)) delete p.site
    else {
      const site: Site = {
        points: s.points as Vec[],
        fence: FENCES.includes(s.fence as FenceKind) ? (s.fence as FenceKind) : 'none',
        ...(isColor(s.fenceColor) ? { fenceColor: s.fenceColor } : {}),
        ...(isNum(s.fenceHeight) ? { fenceHeight: Math.min(FENCE_HEIGHT_MAX, Math.max(FENCE_HEIGHT_MIN, Math.round(s.fenceHeight))) } : {}),
        gates: Array.isArray(s.gates) ? (s.gates as unknown[]).filter((g): g is [Vec, Vec] => isPoly(g, 2) && (g as Vec[]).length === 2) : [],
        paths: Array.isArray(s.paths) ? (s.paths as unknown[]).filter((x): x is Vec[] => isPoly(x)) : [],
        parking: Array.isArray(s.parking)
          ? (s.parking as unknown[]).flatMap((x) => {
              const o = x as Record<string, unknown>
              if (!o || !isPoly(o.points)) return []
              return [{ points: o.points as Vec[], rot: isNum(o.rot) ? o.rot : 0, ...(o.car ? { car: true } : {}), ...(isColor(o.carColor) ? { carColor: o.carColor } : {}), ...(CARS.includes(o.carKind as CarKind) ? { carKind: o.carKind as CarKind } : {}) }]
            })
          : [],
      }
      p.site = site
    }
  }
  const e = p.exterior as unknown as Record<string, unknown> | undefined
  if (e !== undefined) {
    if (!e || typeof e !== 'object' || !ROOFS.includes(e.roof as RoofKind)) delete p.exterior
    else {
      const ex: Exterior = {
        roof: e.roof as RoofKind,
        roofColor: isColor(e.roofColor) ? e.roofColor : '#4f5866',
        facade: FACADES.includes(e.facade as FacadeKind) ? (e.facade as FacadeKind) : 'stucco',
        wallColor: isColor(e.wallColor) ? e.wallColor : '#f2ede3',
        trimColor: isColor(e.trimColor) ? e.trimColor : '#ffffff',
      }
      if (isNum(e.pitch)) ex.pitch = Math.min(1.2, Math.max(0.1, e.pitch))
      if (isNum(e.eave)) ex.eave = Math.min(120, Math.max(0, e.eave))
      if (PORCHES.includes(e.porch as PorchKind)) ex.porch = e.porch as PorchKind
      if (typeof e.roofCover === 'string' && Object.hasOwn(ROOF_COVERS, e.roofCover)) ex.roofCover = e.roofCover as RoofCover
      p.exterior = ex
    }
  }
}

// ---------- 入户门前的雨棚 / 门廊 ----------
//
// 雨棚、门廊的尺寸以前是写死的（门廊出挑 160、比门宽 180），用地北边只留 130～200 时，柱子和台阶会压到围挡、甚至伸出用地。
// 现在按门前到用地边界的距离算实际尺寸：门廊前沿到围挡至少留一条通行的距离，放不下柱子就退成雨棚，再不行只留门框。
// 3D（three/exterior.ts facadeExtras）、院子布置和摆放提示（snap.ts yardBlocked）都用这里算出来的同一份。

/** 门廊、雨棚想要的尺寸：比门宽多出的宽度、出挑深度、门前台阶 */
const PORCH_SIZE = { porch: { extra: 180, depth: 160 }, canopy: { extra: 90, depth: 85, stepExtra: 60, stepDepth: 70 } }
/** 门廊前沿（柱子）到用地边界至少留的通行距离 */
export const PORCH_WALK = 60
/** 门廊至少要这么深才立柱子，再浅就退成雨棚 */
const PORCH_MIN = 110

export interface PorchShape {
  /** frame：只有门框（选了「无」，或门前太窄） */
  kind: 'porch' | 'canopy' | 'frame'
  /** 顶棚宽、出挑深度（cm） */
  width: number
  depth: number
  /** 门前台阶的宽、深；0 = 没有台阶 */
  stepW: number
  stepD: number
}

/** 门前到用地边界的距离：从门外墙面 face 沿 out 方向打一条射线，碰到用地边界的最近距离；没有用地返回 Infinity */
export function roomInFront(site: Site | undefined, face: Vec, out: Vec): number {
  if (!site) return Infinity
  let best = Infinity
  const pts = site.points
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const den = out.x * ey - out.y * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((a.x - face.x) * ey - (a.y - face.y) * ex) / den
    const u = ((a.x - face.x) * out.y - (a.y - face.y) * out.x) / den
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t)
  }
  return best
}

/** 按门前的空间 room（cm）算雨棚 / 门廊的实际尺寸 */
export function porchShape(kind: PorchKind, doorW: number, room: number): PorchShape {
  const frame: PorchShape = { kind: 'frame', width: 0, depth: 0, stepW: 0, stepD: 0 }
  if (kind === 'none') return frame
  if (kind === 'porch' && room - PORCH_WALK >= PORCH_MIN) {
    const depth = Math.min(PORCH_SIZE.porch.depth, room - PORCH_WALK)
    const width = doorW + PORCH_SIZE.porch.extra
    return { kind: 'porch', width, depth, stepW: width, stepD: depth }
  }
  // 雨棚（门廊放不下时也退成雨棚）：顶棚和台阶都离边界留 30
  const c = PORCH_SIZE.canopy
  const depth = Math.min(c.depth, room - 30)
  if (depth < 40) return frame
  return { kind: 'canopy', width: doorW + c.extra, depth, stepW: doorW + c.stepExtra, stepD: Math.min(c.stepDepth, depth - 15) }
}

/** 最底层的入户门（玄关在外墙上的门）：门外墙面中点、沿墙方向、朝外方向、门宽 */
export function entranceDoor(plan: Plan): { face: Vec; dir: Vec; out: Vec; width: number } | null {
  const base = planFloors(plan)[0].id
  const view = floorView(plan, base)
  for (const o of view.openings) {
    if (o.kind !== 'door') continue
    const owner = view.rooms.find((r) => r.id === o.roomId)
    if (owner?.kind !== 'entrance') continue
    const g = openingGeom(view.rooms, o)
    if (!g) continue
    const probe = (k: number) => ({ x: g.center.x + g.e.out.x * k, y: g.center.y + g.e.out.y * k })
    // 外墙上的门：门外 30 不在任何房间里（阳台也不算）
    const outside = (k: number) => !view.rooms.some((r) => pointInPolygon(probe(k), r.points))
    const out = outside(plan.wallOuter / 2 + 20) ? g.e.out : outside(-(plan.wallOuter / 2 + 20)) ? { x: -g.e.out.x, y: -g.e.out.y } : null
    if (!out) continue
    const face = { x: g.center.x + out.x * (plan.wallOuter / 2), y: g.center.y + out.y * (plan.wallOuter / 2) }
    return { face, dir: g.e.dir, out, width: o.width }
  }
  return null
}

/** 入户门前雨棚 / 门廊（连台阶、柱子）在平面上占的矩形；没有外观设定、没有入户门、只有门框时返回 null */
export function porchFootprint(plan: Plan): Vec[] | null {
  if (!plan.exterior) return null
  const d = entranceDoor(plan)
  if (!d) return null
  const s = porchShape(plan.exterior.porch ?? 'canopy', d.width, roomInFront(plan.site, d.face, d.out))
  if (s.kind === 'frame') return null
  // 落地的只有台阶和柱子（门廊的柱子在顶棚范围里）；雨棚只有台阶落地
  const w = s.kind === 'porch' ? s.width : s.stepW
  const dep = s.kind === 'porch' ? s.depth : s.stepD
  const at = (along: number, k: number) => ({ x: d.face.x + d.dir.x * along + d.out.x * k, y: d.face.y + d.dir.y * along + d.out.y * k })
  return [at(-w / 2, 0), at(w / 2, 0), at(w / 2, dep), at(-w / 2, dep)]
}

/**
 * 门廊优先：选了门廊（porch）而门前放不下完整的门廊加通道时，把用地正对大门的那条边（连同上面的出入口、
 * 门前通道、车位）往外推，让出空间——围挡跟着用地边界走，相当于把围挡往外挪。原地改 plan.site，不消耗随机数。
 * 返回推了多远（cm；0 = 本来就放得下，或没有门廊 / 用地 / 入户门）。
 */
export function makeRoomForPorch(plan: Plan): number {
  const site = plan.site
  if (!site || plan.exterior?.porch !== 'porch') return 0
  const d = entranceDoor(plan)
  if (!d) return 0
  const room = roomInFront(site, d.face, d.out)
  const need = PORCH_SIZE.porch.depth + PORCH_WALK
  if (!(room < need)) return 0
  const delta = Math.ceil((need - room) / 10) * 10
  // 投到门的朝向上、和门前那条边一样远（或更远）的点都往外推
  const far = (p: Vec) => (p.x - d.face.x) * d.out.x + (p.y - d.face.y) * d.out.y >= room - 1
  const push = (p: Vec): Vec => (far(p) ? { x: p.x + d.out.x * delta, y: p.y + d.out.y * delta } : p)
  site.points = site.points.map(push)
  site.gates = site.gates.map(([a, b]) => [push(a), push(b)])
  site.paths = site.paths.map((p) => p.map(push))
  for (const s of site.parking) s.points = s.points.map(push)
  return delta
}
