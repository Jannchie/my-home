// 户建的外观数据：屋顶怎么盖（几何在 roof.ts，3D 搭建 three/exterior.ts 和测试共用）、用地 / 外观字段的读档校验。
//
// 屋顶：每一层露在外面（上面没有楼层、也没有上层阳台盖着）的部分都要盖屋顶，每层一个整体的屋顶（见 roof.ts）：
//   最上层整个外轮廓用外观指定的屋顶形式；部分二阶时下层露出来的那块（下屋）贴着上层外墙升高，
//   四坡风格两端做斜脊，双坡 / 单坡风格两端做山墙；平屋顶的下屋只沿外墙做女儿墙。

import { floorOutline, floorView, planFloors } from './floors'
import { roofShape, type RoofRect, type RoofShape } from './roof'
import { CAR_KINDS, FENCE_HEIGHT_MAX, FENCE_HEIGHT_MIN, FENCE_KINDS, PORCH_KINDS, pointInPolygon, type CarKind, type Exterior, type FacadeKind, type FenceKind, type Plan, type PorchKind, type RoofCover, type RoofKind, ROOF_COVERS, type Site, type Vec } from './model'

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

/** 户型的屋顶（每层露在外面的部分一块）；没有外观设定（公寓）返回空 */
export function roofParts(plan: Plan): RoofPart[] {
  const ex = plan.exterior
  if (!ex) return []
  const fs = planFloors(plan)
  const views = fs.map((f) => floorView(plan, f.id).rooms)
  const outlines = views.map((rs) => floorOutline(rs))
  const out: RoofPart[] = []
  fs.forEach((f, k) => {
    const mine = outlines[k]
    if (!mine) return
    const above = outlines.slice(k + 1).filter((o): o is Vec[] => !!o)
    const aboveBalconies = views.slice(k + 1).flatMap((rs) => rs.filter((r) => r.kind === 'balcony').map((r) => r.points))
    const next = fs[k + 1]
    const shape = roofShape({
      kind: ex.roof,
      outline: mine,
      above,
      aboveBalconies: above.length ? aboveBalconies : [],
      top: f.height,
      upperRise: next ? next.elevation - f.elevation : undefined,
      wallOuter: plan.wallOuter,
      pitch: ex.pitch ?? 0.45,
      eave: ex.eave ?? 45,
    })
    if (shape) out.push({ ...shape, floor: f.id, base: f.elevation + f.height, top: f.height })
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
