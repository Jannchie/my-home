// 单面墙的设置（Room.walls）：墙纸覆盖、内收柱（墙顶横着走的梁）。
// 按房间的边号存（points[i] → points[i+1] 朝房间里的那一面），加删顶点时跟着重排（store insertVertex / removeVertex）。

import { add, edgeInfo, edgesOf, mul, projectToSegment, roomWallpaper, type Plan, type Room, type Vec, type WallFace, type WallBeam, type Wallpaper } from './model'
import { wallThicknessAt } from './walls'
import { clampOffset } from './openingEdit'

/** 内收柱（梁）的最小长 / 深 / 高、最大下垂高度；新加时的缺省深、高（长缺省是整面墙） */
export const BEAM_MIN = 5
export const BEAM_MAX_H = 150
const BEAM_DEFAULT = { d: 30, h: 40 }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 一面墙的键（选中、高亮、组件 key 用） */
export const wallKey = (roomId: string, edge: number) => `${roomId}:${edge}`

/** 第 edge 面墙的设置（没设返回 undefined） */
export const wallFace = (r: Pick<Room, 'walls'>, edge: number): WallFace | undefined => r.walls?.[edge] ?? undefined

/** 这面墙实际用的墙纸：自己的优先，没有就跟随房间（房间再跟随全屋） */
export function faceWallpaper(p: Pick<Plan, 'wallpaper'>, r: Room, edge: number): Wallpaper | undefined {
  return wallFace(r, edge)?.wallpaper ?? roomWallpaper(p, r)
}

/** 梁的尺寸、位置夹在这面墙里：长不超过墙长，中心让整根梁留在墙内 */
export function clampBeam(b: WallBeam, L: number): WallBeam {
  const w = Math.max(Math.min(BEAM_MIN, L), Math.min(L, Math.round(b.w)))
  const d = Math.max(BEAM_MIN, Math.round(b.d))
  const h = Math.max(BEAM_MIN, Math.min(BEAM_MAX_H, Math.round(b.h)))
  return { w, d, h, offset: Math.round(clampOffset(b.offset, w, L) * 10) / 10 }
}

/** 新加的梁：整面墙长 */
export const newBeam = (L: number): WallBeam => clampBeam({ ...BEAM_DEFAULT, w: L, offset: L / 2 }, L)

/**
 * 改第 edge 面墙的设置：patch 里的字段为 undefined 就删掉；整面墙没设置了就记成 null，整间都没有就删掉 walls。
 * 直接改 r（调用方负责 mutate / 撤销）。
 */
export function patchWallFace(r: Room, edge: number, patch: Partial<WallFace>) {
  const walls = r.walls ? [...r.walls] : []
  while (walls.length < r.points.length) walls.push(null)
  const f: WallFace = { ...(walls[edge] ?? {}) }
  for (const [k, v] of Object.entries(patch) as [keyof WallFace, WallFace[keyof WallFace]][]) {
    if (v === undefined) delete f[k]
    else (f as Record<string, unknown>)[k] = v
  }
  walls[edge] = Object.keys(f).length ? f : null
  setWalls(r, walls)
}

/** 去掉末尾的 null；全空返回 undefined */
function trimWalls(walls: (WallFace | null)[]) {
  while (walls.length && !walls[walls.length - 1]) walls.pop()
  return walls.length ? walls : undefined
}

/** 写回 walls：全空就删字段 */
function setWalls(r: Room, walls: (WallFace | null)[]) {
  const w = trimWalls(walls)
  if (w) r.walls = w
  else delete r.walls
}

/**
 * 在第 k 条边上插入顶点（拆在离起点 split 处，原边长 L）：k 拆成 k、k+1 两段，后面的边号 +1。
 * 墙纸两段都带；梁按它的范围切开，落在哪段就留在哪段（横跨的两段各留一截）
 */
export function splitWallFace(r: Room, k: number, split: number) {
  if (!r.walls) return
  const walls = [...r.walls]
  const f = walls[k] ?? null
  const paper = f?.wallpaper ? { wallpaper: f.wallpaper } : {}
  const beam = f?.beam
  const part = (lo: number, hi: number, base: number): WallBeam | undefined => {
    if (!beam) return undefined
    const a = Math.max(lo, beam.offset - beam.w / 2)
    const b = Math.min(hi, beam.offset + beam.w / 2)
    return b - a >= BEAM_MIN ? { ...beam, w: b - a, offset: (a + b) / 2 - base } : undefined
  }
  const face = (bm: WallBeam | undefined): WallFace | null => (bm ? { ...paper, beam: bm } : Object.keys(paper).length ? { ...paper } : null)
  walls.splice(k, 1, face(part(0, split, 0)), face(part(split, Infinity, split)))
  setWalls(r, walls)
}

/** 删掉第 i 个顶点：边 i-1、i 合并成一条（两条边上的设置都丢掉，和门窗一样），后面的边号 -1 */
export function mergeWallFaces(r: Room, i: number) {
  if (!r.walls) return
  const n = r.points.length
  const walls = [...r.walls]
  while (walls.length < n) walls.push(null)
  const prev = (i - 1 + n) % n
  walls[prev] = null
  // 删的是 0 号顶点时合并后的边是新的最后一条（原来的 n-1），上面已经清掉了
  walls.splice(i, 1)
  setWalls(r, walls)
}

/** 读档时整理：坏数据去掉，梁夹到墙内 */
export function normalizeWallFaces(r: Room) {
  if (r.walls === undefined) return
  if (!Array.isArray(r.walls)) return void delete r.walls
  const n = r.points.length
  const walls = r.walls.slice(0, n).map((f, i): WallFace | null => {
    if (!f || typeof f !== 'object') return null
    const out: WallFace = {}
    const wp = f.wallpaper
    if (wp && typeof wp === 'object' && typeof wp.color === 'string') out.wallpaper = wp
    const b = f.beam
    if (b && isNum(b.w) && isNum(b.d) && isNum(b.h) && isNum(b.offset) && b.w > 0 && b.d > 0 && b.h > 0) out.beam = clampBeam(b, edgeInfo(r.points, i).length)
    return Object.keys(out).length ? out : null
  })
  setWalls(r, walls)
}

/** 各面墙去掉墙纸覆盖（只留梁，墙纸算装饰、梁是结构）：分享「只户型」时用；全空返回 undefined */
export function wallsWithoutPaper(walls: (WallFace | null)[]): (WallFace | null)[] | undefined {
  return trimWalls(walls.map((f) => (f?.beam ? { beam: f.beam } : null)))
}

/** 直接去掉这间房各面墙的墙纸覆盖（全屋随机墙纸时用） */
export function stripWallPapers(r: Room) {
  if (r.walls) setWalls(r, wallsWithoutPaper(r.walls) ?? [])
}

/**
 * 房间里离点 p（墙中线上）最近、和方向 dir 平行的边号；离边超过 tol 返回 -1。
 * 3D 里墙段按直线合并过，用它从墙段找回是哪间房的哪条边。
 */
export function edgeNear(r: Room, p: Vec, dir: Vec, tol: number) {
  let best = -1
  let bd = tol
  edgesOf(r.points).forEach((e, i) => {
    if (Math.abs(e.dir.x * dir.y - e.dir.y * dir.x) > 1e-3) return
    const d = projectToSegment(p, e.a, e.b).d
    if (d <= bd) {
      bd = d
      best = i
    }
  })
  return best
}

/** 第 edge 面墙朝房间里的墙面线（墙中线往室内让开半个墙厚再加 inset）：平面图、3D 的选中高亮用 */
export function wallInnerFace(plan: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>, r: Room, edge: number, inset = 0) {
  const e = edgeInfo(r.points, edge)
  const k = -(wallThicknessAt(plan, mul(add(e.a, e.b), 0.5), e.out, r) / 2 + inset)
  return { e, a: add(e.a, mul(e.out, k)), b: add(e.b, mul(e.out, k)) }
}

export interface BeamInfo {
  room: Room
  edge: number
  beam: WallBeam
  /** 梁中心在墙中线上的投影、沿墙方向、朝室内的法线 */
  at: Vec
  dir: Vec
  inward: Vec
  /** 墙厚（梁从墙面 t/2 处往里突出） */
  t: number
  /** 平面上的四个角（墙面 → 室内） */
  poly: Vec[]
}

/** 全屋（或某层子户型）所有的内收柱（梁） */
export function beamsOf(plan: Pick<Plan, 'rooms' | 'wall' | 'wallOuter'>): BeamInfo[] {
  const out: BeamInfo[] = []
  for (const room of plan.rooms) {
    if (!room.walls) continue
    room.walls.forEach((f, edge) => {
      if (!f?.beam || edge >= room.points.length) return
      const e = edgeInfo(room.points, edge)
      const beam = clampBeam(f.beam, e.length)
      const at = add(e.a, mul(e.dir, beam.offset))
      const inward = mul(e.out, -1)
      const t = wallThicknessAt(plan, at, e.out, room)
      const corner = (u: number, k: number) => add(add(at, mul(e.dir, u)), mul(inward, k))
      const h = beam.w / 2
      const poly = [corner(-h, t / 2), corner(h, t / 2), corner(h, t / 2 + beam.d), corner(-h, t / 2 + beam.d)]
      out.push({ room, edge, beam, at, dir: e.dir, inward, t, poly })
    })
  }
  return out
}
