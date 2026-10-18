// 窗的款式（Opening.windowStyle / frame / grid / sill / shutters）：高度范围、读档校验、生成户型时按地区给的缺省款式。
// 3D 模型在 three/windows.ts，平面图符号在 components/PlanCanvas.vue。都不填的窗 = 旧存档的样子。

import { WINDOW_FRAMES, WINDOW_GRIDS, WINDOW_SILLS, WINDOW_STYLES, type Opening, type Plan, type Region, type Room, type WindowFrame, type WindowGrid, type WindowSill, type WindowStyle } from './model'

const WET = ['bath', 'toilet', 'wash']
export const isWetRoom = (owner: { kind: string }) => WET.includes(owner.kind)

/**
 * 窗朝着阳台时是不是「掃き出し窓」（落地、能走出去的推拉窗）：窗台高度没指定或指定落地才是；
 * 朝阳台但改成腰窗 / 高窗的就是普通的窗。balcony = 窗外是阳台（各处原来的判断）。
 */
export const sashAllowed = (o: Pick<Opening, 'sill'> | undefined) => !o?.sill || o.sill === 'full'

/** 窗的高度范围（离房间地面）：house.ts 的墙洞、窗帘、墙面占用共用 */
export function windowSpan(owner: { kind: string }, sash: boolean, sill?: WindowSill) {
  if (sill === 'full' || (sash && !sill)) return { y0: 0, y1: 200 }
  if (sill === 'low') return { y0: 0, y1: 55 }
  if (sill === 'high') return { y0: 150, y1: 200 }
  if (isWetRoom(owner)) return { y0: 110, y1: 180 }
  return { y0: 90, y1: 190 }
}

/** 窗框颜色 */
export const frameColor = (o: Pick<Opening, 'frame'>) => WINDOW_FRAMES[o.frame ?? 'white']?.color ?? '#ffffff'

/** 百叶护窗板的颜色：跟着窗框走（白框配墨绿，其余深一点） */
export function shutterColor(o: Pick<Opening, 'frame'>) {
  switch (o.frame) {
    case 'black':
      return '#2f3134'
    case 'wood':
      return '#8a6240'
    case 'bronze':
      return '#4f4237'
    case 'silver':
      return '#56606b'
    default:
      return '#3f5a4c'
  }
}

/** 圆窗的直径、拱顶窗的拱高：w 窗宽，h 窗洞高 */
export const roundDiameter = (w: number, h: number) => Math.max(10, Math.min(w, h))
export const archRise = (w: number, h: number) => Math.max(4, Math.min(w / 2, h * 0.45))

const STYLES = Object.keys(WINDOW_STYLES) as WindowStyle[]
const FRAMES = Object.keys(WINDOW_FRAMES) as WindowFrame[]
const GRIDS = Object.keys(WINDOW_GRIDS) as WindowGrid[]
const SILLS = Object.keys(WINDOW_SILLS) as WindowSill[]

/** 读档校验：坏值、缺省值删掉（白框、无格条不写），门上的窗字段整个去掉 */
export function normalizeWindow(o: Opening) {
  if (o.kind !== 'window') {
    delete o.windowStyle
    delete o.frame
    delete o.grid
    delete o.sill
    delete o.shutters
    return
  }
  if (o.windowStyle !== undefined && !STYLES.includes(o.windowStyle)) delete o.windowStyle
  if (o.frame !== undefined && (!FRAMES.includes(o.frame) || o.frame === 'white')) delete o.frame
  if (o.grid !== undefined && (!GRIDS.includes(o.grid) || o.grid === 'none')) delete o.grid
  if (o.sill !== undefined && !SILLS.includes(o.sill)) delete o.sill
  if (o.shutters !== undefined && o.shutters !== true) delete o.shutters
}

/** 款式可选的格条（百叶窗、圆窗不加格条） */
export const gridAllowed = (style: WindowStyle | undefined) => style !== 'louver' && style !== 'round'

// ---------- 生成户型时的缺省款式 ----------

/** 种子散列（同 generate.ts seedUnit 的算法；这里单独写一份，免得 curtains / house 经由这里循环引用生成器） */
function seedUnit(seed: number, k: number) {
  let h = (Math.imul(seed | 0, 2654435761) ^ Math.imul(k + 0x3c6e, 40503)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 「随机」用的散列：和布局的随机序列无关（不改变户型本身），同一种子总是同一套窗 */
const pick = <T>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))]
/** 按权重取：[值, 权重][] */
function weighted<T>(list: readonly [T, number][], u: number): T {
  const total = list.reduce((s, [, w]) => s + w, 0)
  let x = u * total
  for (const [v, w] of list) {
    if ((x -= w) < 0) return v
  }
  return list[list.length - 1][0]
}

const LIVING = ['ldk', 'dining', 'kitchen']
const BEDS = ['western', 'japanese']

/**
 * 给新生成的户型配窗：地区决定整套窗框 / 格条 / 主要开法，房间决定细节。只写窗的款式字段，不碰布局。
 *   日式：铝合金引き違い（银 / 古铜，少数白框）；浴室、厕所多是百叶窗或上悬窗；和室配和风细格。
 *   中式：铝合金平开窗（灰黑 / 银 / 白）；客厅的大窗是「固定 + 两侧平开」，卫生间上悬。
 *   欧美：白框上下提拉或平开，殖民风格条 / 田字格；户建有时带百叶护窗板；客厅偶尔是固定景观窗或拱顶窗。
 * 朝阳台的落地窗只跟着换窗框颜色（开法不变）。
 */
export function styleWindows(plan: Plan, region: Region, seed: number) {
  const u = (k: number) => seedUnit(seed, 0x7a11 + k)
  const house = !!plan.site
  let frame: WindowFrame
  let grid: WindowGrid = 'none'
  let main: WindowStyle
  let shutters = false
  if (region === 'jp') {
    frame = weighted<WindowFrame>([['silver', 6], ['bronze', 3], ['white', 1.5], ['black', 1]], u(1))
    main = 'sliding'
  } else if (region === 'cn') {
    frame = weighted<WindowFrame>([['black', 4], ['silver', 3], ['white', 2], ['bronze', 1]], u(1))
    main = weighted<WindowStyle>([['casement2', 5], ['sliding', 3], ['casement', 2]], u(2))
  } else {
    frame = weighted<WindowFrame>([['white', 7], ['black', 2.5], ['wood', 1]], u(1))
    main = weighted<WindowStyle>([['doubleHung', 6], ['casement2', 2.5], ['casement', 1.5]], u(2))
    grid = weighted<WindowGrid>([['colonial', 4], ['cross', 2], ['none', 3], ['top', 1]], u(3))
    shutters = house && u(4) < 0.4
  }
  const livingPick = u(5)
  const wetPick = u(6)
  plan.openings.forEach((o, i) => {
    if (o.kind !== 'window') return
    const owner = plan.rooms.find((r) => r.id === o.roomId)
    if (!owner) return
    if (frame !== 'white') o.frame = frame
    if (owner.kind === 'balcony' || isBalconyWindow(plan, o, owner)) return
    const wet = isWetRoom(owner)
    let style: WindowStyle = main
    let g: WindowGrid = grid
    if (wet) {
      style = region === 'jp' ? (wetPick < 0.55 ? 'louver' : 'awning') : region === 'cn' ? 'awning' : wetPick < 0.5 ? 'awning' : 'casement'
      g = 'none'
    } else if (LIVING.includes(owner.kind) && o.width >= 120) {
      if (region === 'cn') style = 'combo'
      else if (region === 'west') {
        if (livingPick < 0.25) {
          style = 'fixed'
          g = 'none'
        } else if (house && livingPick < 0.4) style = 'arched'
      }
    } else if (owner.kind === 'japanese') {
      g = 'shoji'
    } else if (region === 'jp' && o.width < 70) {
      // 小窗：纵向的上悬 / 固定（JP 的小窗多是すべり出し或 FIX）
      style = pick<WindowStyle>(['awning', 'fixed'], u(10 + i))
    }
    if (o.width < 60 && style === 'casement2') style = 'casement'
    o.windowStyle = style
    if (g !== 'none' && gridAllowed(style)) o.grid = g
    if (shutters && !wet && BEDS.concat(LIVING).includes(owner.kind) && style !== 'fixed') o.shutters = true
  })
}

/** 窗外是阳台（掃き出し窓的位置） */
function isBalconyWindow(plan: Pick<Plan, 'rooms'>, o: Opening, owner: Room) {
  const e = owner.points[o.edge]
  const f = owner.points[(o.edge + 1) % owner.points.length]
  if (!e || !f) return false
  const L = Math.hypot(f.x - e.x, f.y - e.y) || 1
  const d = { x: (f.x - e.x) / L, y: (f.y - e.y) / L }
  const t = Math.max(0, Math.min(L, o.offset))
  const c = { x: e.x + d.x * t, y: e.y + d.y * t }
  // 两侧各探一下（外法线方向取决于房间绕向）
  return plan.rooms.some((r) => r.kind === 'balcony' && r !== owner && [1, -1].some((k) => inside({ x: c.x - d.y * 25 * k, y: c.y + d.x * 25 * k }, r.points)))
}

function inside(p: { x: number; y: number }, pts: { x: number; y: number }[]) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}
