// 柜子生成器：按「一段一段」的描述搭出可开合的柜子（柜体 + 层板 / 挂衣杆 + 门 / 抽屉），同时给出对应的可摆放层。
// 收纳位上的柜子（packs/cabinets.ts）都用它；别的素材包里结构规整的柜子也可以直接用（模型和 surfaces 一定对得上）。
//
// 坐标约定同 kit.ts：原点在底面中心，正面朝 +z。门板厚 DOOR_T，门的正面在 z = d/2，柜体缩在门后面。
// 柜体从下往上分成若干段（sections），每段之间一块隔板：
//   doors   平开门（每扇约 45 宽，按 n 指定）
//   sliding 推拉门（两扇或四扇）
//   drawers 抽屉（rows 行 × n 列）
//   flaps   翻门 / 翻斗（底边铰链往外翻 flap 度）
//   open    开放格（没有门）
//   covered 被下面某一段的门一起盖住（那一段写 upto = 本段下标）

import * as THREE from 'three'
import { cyl, rbox, shade, toon } from './toon'
import { carcass, doorRow, drawerBox, drawerLevel, flapDoor, hangingPipe, pipeHook, rectPoly, shelvesIn, slidingDoors, type SurfaceDef } from './kit'

export type DoorStyle = 'flat' | 'frame' | 'louver' | 'glass' | 'fusuma' | 'mirror' | 'slat' | 'cane'

export interface CabSection {
  /** 这一段的顶（上面那块隔板 / 顶板的底面高度）；段的底 = 下一段的顶 + 板厚（第一段 = 底座 + 板厚） */
  y1: number
  front: 'doors' | 'sliding' | 'drawers' | 'flaps' | 'open' | 'covered'
  door?: DoorStyle
  /** 门扇数 / 抽屉列数 */
  n?: number
  /** 抽屉行数 */
  rows?: number
  /** 段内层板（顶面高度） */
  shelves?: number[]
  /** 挂衣杆中心高度（杆在柜内进深中间） */
  pipe?: number
  /** 这一段的门一直盖到第几段（那些段写 front: 'covered'） */
  upto?: number
  /** flaps：翻开多少度 */
  flap?: number
}

export interface CabSpec {
  w: number
  d: number
  h: number
  /** 踢脚高度 */
  base?: number
  /** 板厚 */
  t?: number
  sections: CabSection[]
  /** 挂衣杆的进深位置（局部 z），默认柜内中间 */
  pipeZ?: number
}

/** 门板厚 */
export const DOOR_T = 1.6

/** 门占的进深：推拉门前后两条轨道，比平开门厚一倍多 */
export const frontDepth = (s: CabSpec) => (s.sections.some((x) => x.front === 'sliding') ? DOOR_T * 2 + 0.4 : DOOR_T)

/** 每段的底（可摆放的地板面高度） */
function floors(s: CabSpec) {
  const t = s.t ?? 1.8
  return s.sections.map((_, i) => (i === 0 ? (s.base ?? 0) + t : s.sections[i - 1].y1 + t))
}

/** 柜内可摆放区域的 x / z 范围 */
function inner(s: CabSpec) {
  const t = s.t ?? 1.8
  return { x0: -s.w / 2 + t + 0.4, x1: s.w / 2 - t - 0.4, z0: -s.d / 2 + t + 0.4, z1: s.d / 2 - frontDepth(s) - 0.8 }
}

/** 挂衣杆的进深位置 */
const pipeZ = (s: CabSpec) => s.pipeZ ?? (inner(s).z0 + inner(s).z1) / 2

/**
 * 门板做法：返回以门板底边中点为原点（z 居中）的部件。c 为门板色，k 为点缀色（框、拉手、纸门的边）。
 */
export function doorPanel(style: DoorStyle, c: string, k: string, th = DOOR_T): (w: number, h: number) => THREE.Object3D[] {
  const strip = (w: number, h: number, x: number, y: number, col: string, d = 0.6, z = th / 2 + 0.25) => rbox(w, h, d, col, { x, y, z }, 0.2)
  switch (style) {
    case 'frame':
      return (w, h) => {
        const f = shade(c, -0.05)
        const b = Math.min(6, w * 0.14)
        return [rbox(w, h, th, c, {}, 0.5), strip(b, h - 1, -w / 2 + b / 2 + 0.5, 0.5, f), strip(b, h - 1, w / 2 - b / 2 - 0.5, 0.5, f), strip(w - b * 2 - 1, b, 0, 0.5, f), strip(w - b * 2 - 1, b, 0, h - b - 0.5, f)]
      }
    case 'louver':
      return (w, h) => {
        const f = shade(c, -0.04)
        const b = Math.min(5, w * 0.12)
        const out: THREE.Object3D[] = [rbox(w, h, th * 0.6, shade(c, -0.22), { z: -th * 0.2 }, 0.3)]
        out.push(rbox(b, h, th, c, { x: -w / 2 + b / 2 }, 0.4), rbox(b, h, th, c, { x: w / 2 - b / 2 }, 0.4), rbox(w - b * 2, b, th, c, {}, 0.4), rbox(w - b * 2, b, th, c, { y: h - b }, 0.4))
        const n = Math.max(2, Math.floor((h - b * 2) / 4))
        const step = (h - b * 2) / n
        for (let i = 0; i < n; i++) {
          const m = rbox(w - b * 2 - 0.2, step * 0.8, 0.7, f, { y: b + i * step + step * 0.1, z: 0.1 }, 0.2)
          m.rotation.x = -0.45
          out.push(m)
        }
        return out
      }
    case 'glass':
      return (w, h) => {
        const b = Math.min(5, w * 0.12)
        const pane = rbox(w - b * 2 + 0.6, h - b * 2 + 0.6, 0.5, '#cfeaff', { y: b - 0.3 }, 0.1)
        pane.material = toon('#cfeaff', { transparent: 0.3 })
        pane.userData.noOutline = true
        return [rbox(b, h, th, c, { x: -w / 2 + b / 2 }, 0.4), rbox(b, h, th, c, { x: w / 2 - b / 2 }, 0.4), rbox(w - b * 2, b, th, c, {}, 0.4), rbox(w - b * 2, b, th, c, { y: h - b }, 0.4), pane]
      }
    case 'fusuma':
      return (w, h) => {
        // 襖：和纸面 + 细边框 + 圆形引手
        const out: THREE.Object3D[] = [rbox(w, h, th, c, {}, 0.3)]
        const b = 1.6
        out.push(strip(b, h, -w / 2 + b / 2, 0, k, 0.8), strip(b, h, w / 2 - b / 2, 0, k, 0.8), strip(w, b, 0, 0, k, 0.8), strip(w, b, 0, h - b, k, 0.8))
        for (const s of [-1, 1]) {
          const hk = cyl(2.6, 2.6, 0.6, shade(k, 0.1), { x: s * (w / 2 - 7), y: Math.min(h / 2, 85), z: th / 2 + 0.1, rx: Math.PI / 2 }, 16)
          hk.position.y = Math.min(h / 2, 85)
          out.push(hk)
        }
        // 淡淡的纹样（两道横向的云纹带）
        for (const y of [h * 0.18, h * 0.72]) if (h > 40) out.push(strip(w - 6, Math.min(4, h * 0.05), 0, y, shade(c, -0.06), 0.3, th / 2 + 0.1))
        return out
      }
    case 'mirror':
      return (w, h) => {
        const glass = rbox(w - 5, h - 5, 0.5, '#e3edf3', { y: 2.5, z: th / 2 + 0.2 }, 0.2)
        glass.material = toon('#e3edf3', { emissive: 0.12 })
        glass.userData.noOutline = true
        return [rbox(w, h, th, c, {}, 0.4), glass]
      }
    case 'slat':
      return (w, h) => {
        const out: THREE.Object3D[] = [rbox(w, h, th, c, {}, 0.4)]
        const n = Math.max(3, Math.floor(w / 5))
        for (let i = 1; i < n; i++) out.push(strip(0.8, h - 4, -w / 2 + (w / n) * i, 2, shade(c, -0.1), 0.4, th / 2 + 0.15))
        return out
      }
    case 'cane':
      return (w, h) => {
        // 藤编门：木框 + 藤编网面
        const b = Math.min(5, w * 0.12)
        const mesh = rbox(w - b * 2 + 0.4, h - b * 2 + 0.4, 0.5, k, { y: b - 0.2 }, 0.1)
        return [rbox(b, h, th, c, { x: -w / 2 + b / 2 }, 0.4), rbox(b, h, th, c, { x: w / 2 - b / 2 }, 0.4), rbox(w - b * 2, b, th, c, {}, 0.4), rbox(w - b * 2, b, th, c, { y: h - b }, 0.4), mesh]
      }
    default:
      return (w, h) => [rbox(w, h, th, c, {}, 0.5)]
  }
}

/**
 * 按描述搭出柜子。p = [门色, 柜体色, 点缀色（拉手、框）]；纸门（fusuma）的门色是纸色、点缀色是边框。
 */
export function cabinetModel(s: CabSpec, p: string[]) {
  const [door, body = door, accent = '#c9ced6'] = p
  const t = s.t ?? 1.8
  const g = new THREE.Group()
  const ft = frontDepth(s)
  const dc = s.d - ft
  const box = carcass(s.w, s.h, dc, body, { t, base: s.base ?? 0 })
  box.position.z = -ft / 2
  g.add(box)
  const inBody = shade(body, 0.04)
  s.sections.forEach((sec, i) => {
    // 段间隔板
    if (i < s.sections.length - 1) g.add(rbox(s.w - t * 2, t, dc - t, body, { y: sec.y1, z: -ft / 2 + t / 2 }, 0.3))
    if (sec.shelves?.length) {
      const sh = shelvesIn(s.w, dc, sec.shelves, inBody, t)
      sh.position.z = -ft / 2
      g.add(sh)
    }
    if (sec.pipe) g.add(hangingPipe(-s.w / 2 + t, s.w / 2 - t, sec.pipe, pipeZ(s)))
    // 门 / 抽屉：盖住整段（从下面那块板的中间到上面那块板的中间，最底 / 最顶盖到柜边）
    const last = sec.upto ?? i
    const y0 = i === 0 ? (s.base ?? 0) : s.sections[i - 1].y1 + t / 2
    const y1 = last === s.sections.length - 1 ? s.h : s.sections[last].y1 + t / 2
    const z = s.d / 2
    const style = sec.door ?? 'flat'
    const knob = style === 'fusuma' ? false : accent
    if (sec.front === 'doors') g.add(doorRow({ x0: -s.w / 2, x1: s.w / 2, y0, y1, z, color: door, n: sec.n, knob, panel: doorPanel(style, door, accent) }))
    else if (sec.front === 'sliding') g.add(slidingDoors({ x0: -s.w / 2 + 0.2, x1: s.w / 2 - 0.2, y0, y1, z, color: door, n: sec.n ?? 2, th: DOOR_T, panel: doorPanel(style, door, accent), pull: style === 'fusuma' || style === 'mirror' ? false : shade(door, -0.25) }))
    else if (sec.front === 'flaps') {
      const n = sec.n ?? 1
      const dw = s.w / n
      for (let k = 0; k < n; k++) g.add(flapDoor({ x0: -s.w / 2 + dw * k, x1: -s.w / 2 + dw * (k + 1), y0, y1, z, color: door, hinge: 'bottom', knob: accent, angle: ((sec.flap ?? 35) * Math.PI) / 180 }))
    } else if (sec.front === 'drawers') {
      const n = sec.n ?? 1
      const rows = sec.rows ?? 1
      const dw = s.w / n
      const dh = (y1 - y0) / rows
      for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++) g.add(drawerBox({ x0: -s.w / 2 + dw * k, x1: -s.w / 2 + dw * (k + 1), y0: y0 + dh * r, y1: y0 + dh * (r + 1), z, depth: dc - t - 1, color: door, inner: inBody, knob: accent }))
    }
  })
  return g
}

/**
 * 柜子的可摆放层（和 cabinetModel 一一对应）：每段的底板 + 段内层板 + 挂衣杆 + 抽屉格。
 * 门里的层标 inside；玻璃门的标 glass；开放格两者都不标。
 */
export function cabinetSurfaces(s: CabSpec): SurfaceDef[] {
  const t = s.t ?? 1.8
  const fl = floors(s)
  const r = inner(s)
  const out: SurfaceDef[] = []
  const frontOf = (i: number) => {
    for (let j = i; j >= 0; j--) {
      const sec = s.sections[j]
      if (sec.front !== 'covered') return sec
    }
    return s.sections[i]
  }
  s.sections.forEach((sec, i) => {
    const f = frontOf(i)
    if (f.front === 'drawers') {
      const n = f.n ?? 1
      const rows = f.rows ?? 1
      const y0 = i === 0 ? (s.base ?? 0) : s.sections[i - 1].y1 + t / 2
      const y1 = i === s.sections.length - 1 ? s.h : sec.y1 + t / 2
      const dw = s.w / n
      const dh = (y1 - y0) / rows
      for (let rr = 0; rr < rows; rr++) for (let k = 0; k < n; k++) out.push(drawerLevel({ x0: -s.w / 2 + dw * k, x1: -s.w / 2 + dw * (k + 1), y0: y0 + dh * rr, y1: y0 + dh * (rr + 1), z: s.d / 2, depth: s.d - frontDepth(s) - t - 1 }))
      return
    }
    const inside = f.front !== 'open'
    const glass = inside && f.door === 'glass'
    const ys = [fl[i], ...(sec.shelves ?? [])].sort((a, b) => a - b)
    ys.forEach((y, k) => {
      const top = k + 1 < ys.length ? ys[k + 1] - 1.6 : sec.y1
      const lv: SurfaceDef = { y, h: Math.round((top - y - 0.5) * 10) / 10, shape: [rectPoly(r.x0, r.z0, r.x1, r.z1)] }
      if (inside) lv.inside = true
      if (glass) lv.glass = true
      out.push(lv)
    })
    if (sec.pipe) out.push(pipeHook(-s.w / 2 + t, s.w / 2 - t, sec.pipe, pipeZ(s), sec.pipe - fl[i] - 6))
  })
  return out
}
