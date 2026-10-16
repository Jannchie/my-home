// 日式マンション平层随机生成。
//
// 朝向约定：y=0 一侧是阳台（南），y=D 一侧是共用廊下（玄関）。
// 三种骨架：
//   田の字型      ：中央廊下直通后侧整条 LDK，两侧为水回り列 / 居室列
//   縦長リビング  ：LDK 占一侧纵深，另一侧朝阳台是和室/洋室，廊下从侧面进 LDK
//   ワイドスパン  ：开间宽进深浅，LDK 与居室并排朝阳台，横向廊下连接前侧水回り/玄関
//   シングル      ：1K / 1DK 单身纵长型，前侧水回り + 玄関 + K/DK，里侧洋室
//
// 每次生成有约 35% 概率用紧凑尺寸档（c.compact），只收窄居室 / LDK，水回り和廊下少量收窄。
// 生成结果按不动产表示规约检查 LDK / DK 的最小帖数，不达标的方案在 generateWithArea 里被跳过。

import { orientDoors } from './doors'
import { firstDoorCenter, placeCandidates, placeOnWall, placePair, type PlaceSpec } from './place'
import { JO, add, area, bbox, dist, edgeInfo, edgesOf, fixtureDepth, mul, rotFacingWall, openingGeom, openingsOn, pointInPolygon, projectToSegment, rectPoints, uid, type Fixture, type FridgeStyle, type WasherStyle, type KitchenVariant, type Opening, type Plan, type RailingKind, type Region, type Room, type RoomKind, type Vec } from './model'
import { isIndoor, sharedIntervals } from './walls'
import { jp } from './i18n'
import { ASSET_MAP } from './three/assets'

export type LayoutType = '1K' | '1DK' | '1LDK' | '2LDK' | '3LDK'
export type LayoutStyle = 'tanoji' | 'tatenaga' | 'wide' | 'single'

export const STYLE_LABELS: Record<LayoutStyle, string> = {
  tanoji: '田の字型',
  tatenaga: '縦長リビング',
  wide: 'ワイドスパン',
  single: 'シングル',
}

export const LAYOUT_TYPES: LayoutType[] = ['1K', '1DK', '1LDK', '2LDK', '3LDK']

export interface GenOptions {
  seed: number
  type: LayoutType | 'random'
  style: LayoutStyle | 'random'
  corner: 'random' | 'yes' | 'no'
  /** 居室入口：廊下进 / 从 LDK 进（リビングイン） */
  access: 'random' | 'hall' | 'living'
  /** 专有面积范围（㎡，不含阳台），null 为不限 */
  minArea: number | null
  maxArea: number | null
  /** 地区风格：日式 / 中式 / 欧美 / 随机；不填 = 日式（见 generate-region.ts） */
  region?: Region | 'random'
  /** 中式 / 欧美的卧室数（日式用 type） */
  bedrooms?: 'random' | 1 | 2 | 3 | 4
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000)
}

export function createCtx(seed: number) {
  const rand = mulberry32(seed)
  const chance = (p: number) => rand() < p
  const rint = (lo: number, hi: number, step = 10) => lo + Math.floor(rand() * (Math.floor((hi - lo) / step) + 1)) * step
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

  const rooms: Room[] = []
  const openings: Opening[] = []
  const counters: Partial<Record<RoomKind, number>> = {}

  const room = (kind: RoomKind, name: string, points: Vec[]) => {
    const r: Room = { id: uid('r'), kind, name, points }
    rooms.push(r)
    return r
  }
  const rect = (kind: RoomKind, name: string, xa: number, ya: number, xb: number, yb: number) =>
    room(kind, name, rectPoints(Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)))
  /** 居室：洋室按顺序编号，和室不编号 */
  const bedroom = (kind: 'western' | 'japanese', xa: number, ya: number, xb: number, yb: number) => {
    counters[kind] = (counters[kind] ?? 0) + 1
    return rect(kind, kind === 'western' ? `洋室${counters[kind]}` : '和室', xa, ya, xb, yb)
  }
  /** 在房间边界上经过 at 的那条边开口 */
  const open = (r: Room, kind: Opening['kind'], at: Vec, width: number, swing: Opening['swing'] = 'in') => {
    for (let i = 0; i < r.points.length; i++) {
      const e = edgeInfo(r.points, i)
      const p = projectToSegment(at, e.a, e.b)
      if (p.d < 1) {
        const w = Math.min(width, e.length - 20)
        if (w < 40) return
        const offset = Math.max(w / 2 + 10, Math.min(e.length - w / 2 - 10, dist(e.a, p.point)))
        openings.push({ id: uid('o'), kind, roomId: r.id, edge: i, offset, width: w, hinge: chance(0.5) ? 'start' : 'end', swing })
        return
      }
    }
  }
  /** 在一个矩形房间朝 y 方向的边（顶 / 底）中间开窗 */
  const windowOn = (r: Room, y: number, width: number) => {
    const xs = r.points.filter((p) => Math.abs(p.y - y) < 1).map((p) => p.x)
    if (xs.length < 2) return
    open(r, 'window', { x: (Math.min(...xs) + Math.max(...xs)) / 2, y }, Math.min(width, Math.max(...xs) - Math.min(...xs) - 80))
  }

  const ctx = {
    rand,
    chance,
    rint,
    pick,
    rooms,
    openings,
    room,
    rect,
    bedroom,
    open,
    windowOn,
    livingIn: false,
    compact: false,
    tags: [] as string[],
    /** 按尺寸档取值：普通档 [lo, hi]，紧凑档 [clo, chi] */
    d: (lo: number, hi: number, clo: number, chi: number) => (ctx.compact ? rint(clo, chi) : rint(lo, hi)),
  }
  return ctx
}

export type Ctx = ReturnType<typeof createCtx>

/** 骨架返回外轮廓宽度（用于角部屋判断） */
type Builder = (c: Ctx, type: LayoutType) => { W: number }

// ---------------------------------------------------------------------------
// 田の字型
//   水回り列：洗面所 + 浴室（浴室靠外墙，洗面靠廊下），1LDK 时玄関旁加シューズIN
//   居室列：  トイレ + WIC（トイレ靠廊下）、前侧洋室
//   后侧整条带状为 LDK，3LDK 时从一侧切出一间和室/洋室（リビングイン）
// ---------------------------------------------------------------------------
const tanoji: Builder = (c, type) => {
  const { rint, chance, rect, room, bedroom, open, windowOn } = c
  if (type === '3LDK' && chance(0.45)) return tanojiNaka(c)
  const cw = c.d(100, 110, 90, 100)
  const wc = c.d(290, type === '1LDK' ? 320 : 340, 290, 310)
  const ob = type === '3LDK' ? c.d(320, 400, 280, 320) : type === '1LDK' ? c.d(260, 320, 240, 270) : c.d(280, 360, 250, 290)
  const W = wc + cw + ob
  const dL = type === '1LDK' ? c.d(320, 370, 280, 320) : type === '3LDK' ? c.d(380, 440, 330, 380) : c.d(380, 450, 330, 380)
  const gk = c.d(140, 170, 120, 140)
  const hB1 = type === '1LDK' ? c.d(270, 330, 250, 280) : type === '3LDK' ? c.d(320, 380, 270, 310) : c.d(300, 360, 260, 300)
  const hB2 = c.d(150, 170, 150, 160)
  const hA2 = c.d(180, 200, 170, 180)
  const D = dL + hB1 + hB2

  const waterLeft = chance(0.5)
  const A = waterLeft ? [0, wc] : [ob + cw, W]
  const H = waterLeft ? [wc, wc + cw] : [ob, ob + cw]
  const B = waterLeft ? [wc + cw, W] : [0, ob]
  const aIn = waterLeft ? A[1] : A[0]
  const aOut = waterLeft ? A[0] : A[1]
  const bIn = waterLeft ? B[0] : B[1]
  const bOut = waterLeft ? B[1] : B[0]

  let ldk: Room | null = null
  if (type === '3LDK') {
    const onWaterSide = chance(0.5)
    const rb = rint(c.compact ? 240 : 260, Math.min(c.compact ? 280 : 330, onWaterSide ? wc : ob))
    const left = onWaterSide === waterLeft
    const back = left ? bedroom(chance(0.6) ? 'japanese' : 'western', 0, 0, rb, dL) : bedroom(chance(0.6) ? 'japanese' : 'western', W - rb, 0, W, dL)
    ldk = left ? rect('ldk', 'LDK', rb, 0, W, dL) : rect('ldk', 'LDK', 0, 0, W - rb, dL)
    open(back, 'door', { x: left ? rb : W - rb, y: dL - 70 }, 80)
    windowOn(back, 0, rb)
  }

  let waterTop: number
  let waterBottom: number
  let ldkExtend = 0
  if (type === '1LDK') {
    const sic = rect('storage', 'シューズIN', A[0], D - gk, A[1], D)
    open(sic, 'door', { x: aIn, y: D - gk / 2 }, 70)
    waterBottom = D - gk
    const gap = D - gk - hA2 - dL
    if (gap >= 150) {
      ldkExtend = gap
      waterTop = waterBottom - hA2
    } else waterTop = dL
  } else {
    waterTop = dL
    waterBottom = dL + hA2
    const w = bedroom('western', A[0], waterBottom, A[1], D)
    open(w, 'door', { x: aIn, y: waterBottom + 55 }, 75)
    windowOn(w, D, rint(120, 170))
  }
  const bw = Math.min(c.d(160, 180, 130, 150), wc - 155)
  const bathX = waterLeft ? aOut + bw : aOut - bw
  const bath = rect('bath', '浴室', aOut, waterTop, bathX, waterBottom)
  const wash = rect('wash', '洗面所', bathX, waterTop, aIn, waterBottom)
  open(bath, 'door', { x: bathX, y: (waterTop + waterBottom) / 2 }, 70)
  open(wash, 'door', { x: aIn, y: (waterTop + waterBottom) / 2 }, 70)

  const tw = c.d(90, 110, 85, 95)
  const toiletX = waterLeft ? bIn + tw : bIn - tw
  const toilet = rect('toilet', 'トイレ', bIn, dL, toiletX, dL + hB2)
  open(toilet, 'door', { x: bIn, y: dL + hB2 / 2 }, 70, 'out')
  const wic = rect('storage', 'WIC', toiletX, dL, bOut, dL + hB2)
  open(wic, 'door', { x: (toiletX + bOut) / 2, y: dL + hB2 }, 70, 'out')
  const front = bedroom(chance(0.15) ? 'japanese' : 'western', B[0], dL + hB2, B[1], D)
  open(front, 'door', { x: bIn, y: dL + hB2 + 55 }, 75)
  windowOn(front, D, rint(120, 170))

  const hall = rect('hall', '廊下', H[0], dL, H[1], D - gk)
  const genkan = rect('entrance', '玄関', H[0], D - gk, H[1], D)
  const hMid = (H[0] + H[1]) / 2
  open(hall, 'door', { x: hMid, y: dL }, 80, 'out')
  open(genkan, 'door', { x: hMid, y: D }, 85, 'out')

  if (!ldk) {
    if (ldkExtend > 0) {
      const yb = dL + ldkExtend
      ldk = room(
        'ldk',
        'LDK',
        waterLeft
          ? [
              { x: 0, y: 0 },
              { x: W, y: 0 },
              { x: W, y: dL },
              { x: A[1], y: dL },
              { x: A[1], y: yb },
              { x: 0, y: yb },
            ]
          : [
              { x: 0, y: 0 },
              { x: W, y: 0 },
              { x: W, y: yb },
              { x: A[0], y: yb },
              { x: A[0], y: dL },
              { x: 0, y: dL },
            ],
      )
    } else ldk = rect('ldk', 'LDK', 0, 0, W, dL)
  }
  windowOn(ldk, 0, rint(240, 360))
  return { W }
}

// ---------------------------------------------------------------------------
// 田の字型 3LDK・中洋室
//   前排：洋室 | 玄関 | 洋室
//   中段：洗面浴室 + トイレ | 廊下 | 中洋室（无窗，引き戸通 LDK；2室採光）
//   后排：整条 LDK，厨房自然落在水回り一侧
// ---------------------------------------------------------------------------
function tanojiNaka(c: Ctx): { W: number } {
  const { rint, chance, rect, bedroom, open, windowOn } = c
  c.tags.push('中洋室')
  const cw = c.d(100, 110, 90, 100)
  const wc = c.d(290, 330, 290, 310)
  const ob = c.d(300, 360, 260, 300)
  const W = wc + cw + ob
  const dL = c.d(360, 420, 330, 370)
  const gk = c.d(140, 170, 120, 140)
  const hA2 = c.d(180, 200, 170, 180)
  const hT = c.d(150, 170, 150, 160)
  const hN = c.d(270, 310, 240, 270)
  let hB1 = c.d(300, 350, 260, 290)
  let hA1 = hN + hB1 - hA2 - hT
  const minA1 = c.compact ? 240 : 260
  if (hA1 < minA1) {
    hB1 += minA1 - hA1
    hA1 = minA1
  }
  const D = dL + hN + hB1

  const waterLeft = chance(0.5)
  const A = waterLeft ? [0, wc] : [ob + cw, W]
  const H = waterLeft ? [wc, wc + cw] : [ob, ob + cw]
  const B = waterLeft ? [wc + cw, W] : [0, ob]
  const aIn = waterLeft ? A[1] : A[0]
  const aOut = waterLeft ? A[0] : A[1]
  const bIn = waterLeft ? B[0] : B[1]
  const side = (out: number, w: number) => (waterLeft ? out + w : out - w)

  const ldk = rect('ldk', 'LDK', 0, 0, W, dL)
  windowOn(ldk, 0, rint(260, 360))

  // A 列：洗面浴室 → トイレ + 収納 → 前侧洋室
  const bw = Math.min(c.d(160, 180, 130, 150), wc - 155)
  const bath = rect('bath', '浴室', aOut, dL, side(aOut, bw), dL + hA2)
  const wash = rect('wash', '洗面所', side(aOut, bw), dL, aIn, dL + hA2)
  open(bath, 'door', { x: side(aOut, bw), y: dL + hA2 / 2 }, 70)
  open(wash, 'door', { x: aIn, y: dL + hA2 / 2 }, 70)
  const yT = dL + hA2
  const tw = c.d(90, 110, 85, 95)
  const toilet = rect('toilet', 'トイレ', aIn, yT, side(aIn, -tw), yT + hT)
  open(toilet, 'door', { x: aIn, y: yT + hT / 2 }, 70, 'out')
  const cl = rect('storage', '収納', aOut, yT, side(aIn, -tw), yT + hT)
  const yA = yT + hT
  const fa = bedroom('western', A[0], yA, A[1], D)
  open(cl, 'door', { x: (aOut + side(aIn, -tw)) / 2, y: yA }, 70, 'out')
  open(fa, 'door', { x: aIn, y: yA + 55 }, 75)
  windowOn(fa, D, rint(120, 170))

  // B 列：中洋室 → 前侧洋室
  const naka = bedroom('western', B[0], dL, B[1], dL + hN)
  open(naka, 'sliding', { x: (B[0] + B[1]) / 2, y: dL }, Math.min(ob - 60, rint(160, 180)))
  if (chance(0.5)) open(naka, 'door', { x: bIn, y: dL + hN - 60 }, 75)
  const fb = bedroom(chance(0.15) ? 'japanese' : 'western', B[0], dL + hN, B[1], D)
  open(fb, 'door', { x: bIn, y: dL + hN + 55 }, 75)
  windowOn(fb, D, rint(120, 170))

  const hall = rect('hall', '廊下', H[0], dL, H[1], D - gk)
  const genkan = rect('entrance', '玄関', H[0], D - gk, H[1], D)
  const hMid = (H[0] + H[1]) / 2
  open(hall, 'door', { x: hMid, y: dL }, 80, 'out')
  open(genkan, 'door', { x: hMid, y: D }, 85, 'out')
  return { W }
}

// ---------------------------------------------------------------------------
// 縦長リビング（2LDK / 3LDK）
//   L 列：LDK 纵深 → トイレ + 収納 → 前侧洋室
//   廊下：从玄関向后，侧面开门进 LDK
//   R 列：后侧和室/洋室（3LDK）或并入 LDK（2LDK，L 型）→ 洗面浴室 →（WIC）→ 前侧洋室
// ---------------------------------------------------------------------------
const tatenaga: Builder = (c, type) => {
  const { rint, chance, rect, room, bedroom, open, windowOn } = c
  const small = type === '2LDK'
  const wl = small ? c.d(320, 370, 290, 320) : c.d(340, 400, 310, 340)
  const cw = c.d(100, 110, 90, 100)
  const wr = small ? c.d(290, 330, 290, 310) : c.d(300, 360, 290, 320)
  const W = wl + cw + wr
  const dR = small ? c.d(270, 320, 250, 280) : c.d(300, 350, 260, 300)
  const hA2 = c.d(180, 200, 170, 180)
  const hT = c.d(150, 170, 150, 160)
  const hF = small ? c.d(260, 300, 240, 270) : c.d(270, 340, 250, 290)
  const gk = c.d(140, 170, 120, 140)
  let yLK = c.compact
    ? small
      ? rint(Math.max(dR + 180, 420), 480)
      : rint(Math.max(dR + 200, 460), 540)
    : small
      ? rint(Math.max(dR + 200, 460), 540)
      : rint(Math.max(dR + 220, 520), 640)
  let rest = yLK + hT + hF - dR - hA2
  const minRest = c.compact ? 250 : 280
  if (rest < minRest) {
    yLK += minRest - rest
    rest = minRest
  }
  const D = yLK + hT + hF

  const mirror = chance(0.5)
  const X = (x: number) => (mirror ? W - x : x)
  const r0 = wl + cw // R 列起点

  let ldk: Room
  if (type === '3LDK') {
    ldk = rect('ldk', 'LDK', X(0), 0, X(wl), yLK)
    const back = bedroom(chance(0.6) ? 'japanese' : 'western', X(wl), 0, X(W), dR)
    open(back, 'door', { x: X(wl + cw / 2), y: dR }, 75)
    if (back.kind === 'japanese') open(back, 'door', { x: X(wl), y: dR / 2 }, 120)
    windowOn(back, 0, wr)
  } else {
    ldk = room(
      'ldk',
      'LDK',
      [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: dR },
        { x: wl, y: dR },
        { x: wl, y: yLK },
        { x: 0, y: yLK },
      ].map((p) => ({ x: X(p.x), y: p.y })),
    )
  }
  windowOn(ldk, 0, rint(240, 320))

  const hall = rect('hall', '廊下', X(wl), dR, X(r0), D - gk)
  const genkan = rect('entrance', '玄関', X(wl), D - gk, X(r0), D)
  open(genkan, 'door', { x: X(wl + cw / 2), y: D }, 85, 'out')
  if (type === '3LDK') open(hall, 'door', { x: X(wl), y: yLK - 60 }, 80, 'out')
  else open(hall, 'door', { x: X(wl + cw / 2), y: dR }, 80, 'out')

  // L 列下半
  const tw = c.d(90, 110, 85, 95)
  const toilet = rect('toilet', 'トイレ', X(wl - tw), yLK, X(wl), yLK + hT)
  open(toilet, 'door', { x: X(wl), y: yLK + hT / 2 }, 70, 'out')
  const cl = rect('storage', '収納', X(0), yLK, X(wl - tw), yLK + hT)
  open(cl, 'door', { x: X((wl - tw) / 2), y: yLK + hT }, 70, 'out')
  const fl = bedroom('western', X(0), yLK + hT, X(wl), D)
  open(fl, 'door', { x: X(wl), y: yLK + hT + 45 }, 70)
  windowOn(fl, D, rint(120, 170))

  // R 列
  const bw = Math.min(c.d(160, 180, 130, 150), wr - 155)
  const wash = rect('wash', '洗面所', X(r0), dR, X(W - bw), dR + hA2)
  const bath = rect('bath', '浴室', X(W - bw), dR, X(W), dR + hA2)
  open(wash, 'door', { x: X(r0), y: dR + hA2 / 2 }, 70)
  open(bath, 'door', { x: X(W - bw), y: dR + hA2 / 2 }, 70)
  let y = dR + hA2
  if (rest >= 400) {
    const h = rest - rint(300, Math.min(360, rest - 100))
    const wic = rect('storage', 'WIC', X(r0), y, X(W), y + h)
    open(wic, 'door', { x: X(r0), y: y + h / 2 }, 70, 'out')
    y += h
  }
  const fr = bedroom('western', X(r0), y, X(W), D)
  open(fr, 'door', { x: X(r0), y: y + 50 }, 75)
  windowOn(fr, D, rint(120, 170))
  return { W }
}

// ---------------------------------------------------------------------------
// ワイドスパン
//   后排：LDK 与 1~2 间居室并排朝阳台
//   中间：横向廊下
//   前排（从外墙一侧起）：浴室 | 洗面所 | トイレ+シューズBOX | 玄関 | 前侧洋室 | 収納
// ---------------------------------------------------------------------------
const wide: Builder = (c, type) => {
  const { rint, chance, pick, rect, bedroom, open, windowOn } = c
  const beds = type === '1LDK' ? 1 : type === '2LDK' ? 2 : 3
  // 2LDK 一半概率两间居室都在后排（隔壁），前排不放居室；リビングイン 时必定都在后排
  const backBeds = beds === 3 || (beds === 2 && (c.livingIn || chance(0.5))) ? 2 : 1
  const frontBeds = beds - backBeds
  const bothBack = beds === 2 && backBeds === 2
  const dB = bothBack ? c.d(380, 420, 350, 380) : c.d(360, 430, 330, 370)
  const cw = c.d(100, 110, 90, 100)
  const hf = c.d(250, 290, 230, 260)
  const D = dB + cw + hf
  const yc = dB + cw // 前排上沿

  const bw = c.d(160, 170, 130, 150)
  // 后排两间居室时前排没有居室，水回り和玄関做宽一点、加シューズIN 把开间用掉
  const ww = bothBack ? c.d(170, 200, 150, 170) : c.d(150, 170, 130, 150)
  const tw = c.d(95, 105, 85, 95)
  const gw = bothBack ? c.d(170, 200, 150, 170) : c.d(140, 170, 120, 140)
  const sw = bothBack ? rint(110, 140) : 0
  const backW = Array.from({ length: backBeds }, () => (bothBack ? c.d(260, 300, 250, 270) : c.d(280, 330, 250, 280)))
  let wL = type === '1LDK' ? c.d(380, 450, 340, 390) : bothBack ? c.d(400, 460, 380, 420) : c.d(440, 540, 400, 450)
  const fixed = bw + ww + tw + gw + sw
  const need = frontBeds * (c.compact ? 260 : 290)
  let W = wL + backW.reduce((s, w) => s + w, 0)
  if (W - fixed < need) {
    wL += need - (W - fixed)
    W = fixed + need
  }

  const mirror = chance(0.5)
  const X = (x: number) => (mirror ? W - x : x)
  const order = c.livingIn
    ? backBeds === 2
      ? ['R', 'L', 'R']
      : pick([['R', 'L'], ['L', 'R']])
    : pick(backBeds === 2 ? [['R', 'L', 'R'], ['R', 'R', 'L'], ['L', 'R', 'R']] : [['R', 'L'], ['L', 'R']])
  const ldkAt = order.indexOf('L')
  const lastBackW = order[order.length - 1] === 'L' ? wL : backW[backW.length - 1]

  // 前排
  const linen = rect('storage', 'リネン庫', X(0), dB, X(bw), yc)
  const bath = rect('bath', '浴室', X(0), yc, X(bw), D)
  let x = bw
  const wash = rect('wash', '洗面所', X(x), yc, X(x + ww), D)
  open(bath, 'door', { x: X(bw), y: (yc + D) / 2 }, 70)
  open(wash, 'door', { x: X(x + ww / 2), y: yc }, 70)
  open(linen, 'door', { x: X(bw), y: dB + cw / 2 }, 60, 'out')
  x += ww
  const th = c.d(150, 165, 145, 155)
  const toilet = rect('toilet', 'トイレ', X(x), yc, X(x + tw), yc + th)
  open(toilet, 'door', { x: X(x + tw / 2), y: yc }, 70, 'out')
  const shoe = rect('storage', sw ? '収納' : 'シューズBOX', X(x), yc + th, X(x + tw), D)
  open(shoe, 'door', { x: X(x + tw), y: (yc + th + D) / 2 }, 60, 'out')
  x += tw
  const genkan = rect('entrance', '玄関', X(x), yc, X(x + gw), D)
  open(genkan, 'door', { x: X(x + gw / 2), y: D }, 85, 'out')
  x += gw
  let prev: Room = genkan
  if (sw) {
    const sic = rect('storage', 'シューズIN', X(x), yc, X(x + sw), D)
    open(sic, 'door', { x: X(x), y: (yc + D) / 2 }, 70, 'out')
    prev = sic
    x += sw
  }
  let rest = W - x
  for (let i = 0; i < frontBeds; i++) {
    let w = Math.min(rest, c.d(290, 340, 260, 290))
    if (i === frontBeds - 1) {
      // 最后一间吸收多余宽度：剩得太少就并入，剩得太多就把房间做大（上限约 7 帖），留 150 给收纳
      if (rest - w < 70) w = rest
      else if (rest - w > 200) w = Math.min(rest - 150, 420)
    }
    const r = bedroom('western', X(x), yc, X(x + w), D)
    open(r, 'door', { x: X(x + 50), y: yc }, 75)
    windowOn(r, D, rint(120, 160))
    prev = r
    x += w
    rest -= w
  }
  // 剩余宽度：够宽就做收纳，太窄就并进前一间
  let hallEnd = W
  if (rest >= 260) {
    // 太宽做收纳不合理：做成带窗的納戸（サービスルーム），即 nSLDK
    c.tags.push('S')
    const st = rect('other', '納戸', X(x), yc, X(W), D)
    open(st, 'door', { x: X(x + 50), y: yc }, 75)
    windowOn(st, D, rint(100, 140))
  } else if (rest >= 70) {
    // 收纳向上延伸会截短廊下，要保证最远的后排房间仍够得着廊下
    const extend = chance(0.5) && lastBackW - rest >= 110
    const st = rect('storage', rest >= 150 ? 'WIC' : '収納', X(x), extend ? dB : yc, X(W), D)
    if (extend) {
      hallEnd = x
      // 左邻是居室就从居室进，否则从廊下尽头进
      const fromRoom = prev.kind === 'western' || prev.kind === 'japanese'
      open(st, 'door', { x: X(x), y: fromRoom ? yc + 40 : dB + cw / 2 }, fromRoom ? 70 : 60, 'out')
    } else open(st, 'door', { x: X(x + rest / 2), y: yc }, 70, 'out')
  } else if (rest > 0) {
    prev.points = prev.points.map((p) => (Math.abs(p.x - X(x)) < 1 ? { x: X(W), y: p.y } : p))
  }
  const hall = rect('hall', '廊下', X(bw), dB, X(hallEnd), yc)

  // 后排
  let bx = 0
  let bi = 0
  let ci = 0
  const overlapMid = (x0: number, x1: number) => {
    const a = Math.max(x0, bw)
    const b = Math.min(x1, hallEnd)
    return b - a >= 85 ? (a + b) / 2 : null
  }
  for (const k of order) {
    const w = k === 'L' ? wL : backW[bi++]
    if (k === 'L') {
      const ldk = rect('ldk', 'LDK', X(bx), 0, X(bx + w), dB)
      // 门靠里侧墙的一端，另一端留给厨房
      const lo = Math.max(bx, bw)
      const hi = Math.min(bx + w, hallEnd)
      open(hall, 'door', { x: X(chance(0.5) ? lo + 55 : hi - 55), y: dB }, 80, 'out')
      windowOn(ldk, 0, rint(260, 360))
    } else {
      const r = bedroom(chance(0.3) ? 'japanese' : 'western', X(bx), 0, X(bx + w), dB)
      const m = overlapMid(bx, bx + w)
      // 与 LDK 相邻：リビングイン 时门开在共用墙上
      const nextToLdk = Math.abs(ci - ldkAt) === 1
      if (nextToLdk && c.livingIn) open(r, 'door', { x: X(ci < ldkAt ? bx + w : bx), y: dB / 2 - 10 }, 80)
      else if (m !== null) open(r, 'door', { x: X(m), y: dB }, 70)
      windowOn(r, 0, w - 100)
    }
    bx += w
    ci++
  }
  return { W }
}

// ---------------------------------------------------------------------------
// シングル（1K / 1DK）
//   前侧：水回り列（3点ユニット，或 浴室 → 洗面所 → トイレ）| 玄関 + K（廊下キッチン）/ DK
//   里侧：洋室朝阳台，水回り列上方切出クローゼット
// ---------------------------------------------------------------------------
/** 3点ユニット 的概率：随专有面积（㎡）线性下降 */
function unitBathChance(area: number) {
  const pts: [number, number][] = [
    [20, 0.85],
    [22, 0.7],
    [25, 0.35],
    [28, 0.05],
  ]
  if (area <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [a1, p1] = pts[i]
    const [a0, p0] = pts[i - 1]
    if (area <= a1) return p0 + ((p1 - p0) * (area - a0)) / (a1 - a0)
  }
  return 0.03
}

const single: Builder = (c, type) => {
  const { rint, chance, rect, room, open } = c
  const dk = type === '1DK'
  const wb = c.d(155, 180, 150, 165)
  // K 宽要放得下 65 台面 + 80 操作通道
  const wk = dk ? c.d(290, 340, 260, 300) : c.d(170, 195, 165, 180)
  const W = wb + wk
  const gk = c.d(110, 130, 100, 120)
  const yR = dk ? c.d(290, 350, 260, 300) : c.d(300, 380, 270, 320) // 洋室进深

  // K / DK 至少要有的进深：台面 + 通道 + 玄関
  const needZ = gk + (dk ? 260 : 220)
  // 3点ユニット（浴缸、洗面、马桶一体）多见于小户型：按估算面积决定概率，
  // 20㎡ 以下很常见，25㎡ 以上几乎都是バス・トイレ別
  // 按バス・トイレ別的进深估（浴室 + 洗面所 + トイレ约 440），两种方案面积可比
  const estArea = (W * (yR + Math.max(needZ, 440))) / 10000
  const unit = chance(unitBathChance(estArea) * (dk ? 0.7 : 1))

  const mirror = chance(0.5)
  const X = (x: number) => (mirror ? W - x : x)

  // 水回り列，从里往外排
  const stack: { kind: RoomKind; name: string; h: number }[] = unit
    ? [{ kind: 'bath', name: 'ユニットバス', h: c.d(190, 210, 180, 190) }]
    : [
        { kind: 'bath', name: '浴室', h: c.d(165, 180, 155, 165) },
        { kind: 'wash', name: '洗面所', h: c.d(140, 160, 130, 145) },
        { kind: 'toilet', name: 'トイレ', h: c.d(120, 140, 110, 125) },
      ]
  const hz0 = stack.reduce((s, x) => s + x.h, 0)
  // 3点ユニット 没有洗面所，空位做洗濯機置場（朝 K / 玄関敞开的凹位）；否则做收纳
  if (needZ - hz0 >= 70) stack.push(unit ? { kind: 'wash', name: '洗濯機置場', h: needZ - hz0 } : { kind: 'storage', name: '収納', h: needZ - hz0 })
  else if (needZ > hz0) stack[stack.length - 1].h += needZ - hz0
  const hz = Math.max(needZ, hz0)
  const D = yR + hz

  // 洋室（水回り列上方切出クローゼット，L 型）
  const cd = c.d(60, 80, 60, 70)
  const withCl = chance(0.85)
  const bed = room(
    'western',
    '洋室',
    (withCl
      ? [
          { x: 0, y: 0 },
          { x: W, y: 0 },
          { x: W, y: yR },
          { x: wb, y: yR },
          { x: wb, y: yR - cd },
          { x: 0, y: yR - cd },
        ]
      : rectPoints(0, 0, W, yR)
    ).map((p) => ({ x: X(p.x), y: p.y })),
  )
  open(bed, 'window', { x: X(W / 2), y: 0 }, Math.min(W - 80, rint(160, 200)))
  if (withCl) {
    const cl = rect('storage', 'クローゼット', X(0), yR - cd, X(wb), yR)
    open(cl, 'sliding', { x: X(wb / 2), y: yR - cd }, wb - 30, 'out')
  }

  // 水回り：浴室从洗面所进，其余开向 K / DK / 玄関
  let y = yR
  stack.forEach((it, i) => {
    const r = rect(it.kind, it.name, X(0), y, X(wb), y + it.h)
    if (it.kind === 'bath' && !unit) open(r, 'door', { x: X(wb / 2), y: y + it.h }, 60, 'in')
    else if (it.name === '洗濯機置場') {
      // 开放凹位，不装门
    } else if (it.kind === 'storage') open(r, 'sliding', { x: X(wb), y: y + it.h / 2 }, Math.min(it.h - 20, 90), 'out')
    else open(r, 'door', { x: X(wb), y: y + it.h / 2 }, i === 0 && unit ? 65 : 60, 'in')
    y += it.h
  })

  // K / DK + 玄関
  if (dk) {
    const gw = rint(110, 130)
    const k = room(
      'kitchen',
      'DK',
      [
        { x: wb, y: yR },
        { x: W, y: yR },
        { x: W, y: D },
        { x: wb + gw, y: D },
        { x: wb + gw, y: D - gk },
        { x: wb, y: D - gk },
      ].map((p) => ({ x: X(p.x), y: p.y })),
    )
    const genkan = rect('entrance', '玄関', X(wb), D - gk, X(wb + gw), D)
    open(genkan, 'door', { x: X(wb + gw / 2), y: D }, 80, 'out')
    const fw = W - wb - gw - 60
    if (fw >= 60) open(k, 'window', { x: X((wb + gw + W) / 2), y: D }, Math.min(fw, 120))
    if (chance(0.5)) open(k, 'sliding', { x: X(wb + wk / 2), y: yR }, Math.min(wk - 60, 160))
    else open(k, 'door', { x: X(wb + 45), y: yR }, 70, 'out')
  } else {
    const k = rect('kitchen', 'K', X(wb), yR, X(W), D - gk)
    const genkan = rect('entrance', '玄関', X(wb), D - gk, X(W), D)
    open(genkan, 'door', { x: X(wb + wk / 2), y: D }, 80, 'out')
    open(k, 'door', { x: X(wb + 45), y: yR }, 70, 'out')
  }
  return { W }
}

const BUILDERS: Record<LayoutStyle, Builder> = { tanoji, tatenaga, wide, single }

/**
 * 不动产表示规约（DK・LDK の広さの目安）：
 *   居室 1 间：DK >= 4.5 帖、LDK >= 8 帖；居室 2 间以上：DK >= 6 帖、LDK >= 10 帖。
 * 另外有 LDK / DK / K 的户型必须放得下厨房和冰箱位（日本的間取り図必标「冷」）。
 */
export function planViolations(p: Plan, checkKitchen = true): string[] {
  const out: string[] = []
  const beds = p.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
  for (const r of p.rooms) {
    const jo = area(r.points) / 10000 / JO
    const min = r.kind === 'ldk' ? (beds <= 1 ? 8 : 10) : r.kind === 'kitchen' && r.name === 'DK' ? (beds <= 1 ? 4.5 : 6) : 0
    if (jo < min) out.push(`${r.name} ${jo.toFixed(1)}帖 < ${min}帖`)
  }
  if (checkKitchen && p.rooms.some((r) => r.kind === 'ldk' || r.kind === 'kitchen')) {
    if (!p.fixtures.some((f) => f.kind === 'kitchen')) out.push('厨房放不下')
    else if (!p.fixtures.some((f) => f.kind === 'fridge')) out.push('冰箱位放不下')
  }
  return out
}

/** 户内隔墙 / 外墙（躯体）厚 */
export const WALL = 10
export const WALL_OUTER = 18

interface Layout {
  c: Ctx
  plan: Plan
}

/** 阳台扶手墙样式：按种子单独取（不动主随机序列，同一种子的户型不变） */
export function railingFor(seed: number): RailingKind {
  const kinds: RailingKind[] = ['mixed', 'mixed', 'concrete', 'glass', 'bars', 'louver']
  const h = Math.imul((seed ^ 0x5bd1e995) >>> 0, 2654435761) >>> 0
  return kinds[(h >>> 7) % kinds.length]
}

/** 第一阶段：房间、门窗（不含设备）。面积在这一步就确定了 */
function layout(opts: GenOptions): Layout {
  const c = createCtx(opts.seed)
  const type: LayoutType = opts.type === 'random' ? c.pick<LayoutType>(['1K', '1DK', '1LDK', '2LDK', '2LDK', '3LDK', '3LDK']) : opts.type
  const isSingle = type === '1K' || type === '1DK'
  const styles: LayoutStyle[] = isSingle ? ['single'] : type === '1LDK' ? ['tanoji', 'wide'] : ['tanoji', 'tatenaga', 'wide']
  let style: LayoutStyle = opts.style === 'random' ? c.pick(styles) : opts.style
  if (!styles.includes(style)) style = styles[0]
  c.compact = c.chance(0.35)
  const corner = opts.corner === 'random' ? c.chance(0.4) : opts.corner === 'yes'
  // リビングイン：只有ワイドスパン能让两间居室都贴着 LDK
  // 1K / 1DK 只有一间居室，不区分入口
  if (!isSingle) {
    if (opts.access === 'living') {
      c.livingIn = true
      style = 'wide'
    } else if (opts.access === 'random' && style === 'wide') c.livingIn = c.chance(0.3)
  }

  const { W } = BUILDERS[style](c, type)
  c.rooms.unshift({ id: uid('r'), kind: 'balcony', name: 'バルコニー', points: rectPoints(0, -c.rint(120, 180), W, 0), railing: railingFor(opts.seed) })

  // 角部屋：外侧山墙开窗
  if (corner) {
    const sideX = c.chance(0.5) ? 0 : W
    const sizes: Partial<Record<RoomKind, number>> = { ldk: 170, western: 120, japanese: 120, bath: 60 }
    for (const r of c.rooms) {
      const w = sizes[r.kind]
      if (!w) continue
      for (let i = 0; i < r.points.length; i++) {
        const e = edgeInfo(r.points, i)
        if (Math.abs(e.a.x - sideX) < 1 && Math.abs(e.b.x - sideX) < 1 && e.length > w + 40) {
          c.open(r, 'window', { x: sideX, y: (e.a.y + e.b.y) / 2 }, w)
          break
        }
      }
    }
  }

  for (const o of c.openings) {
    const r = c.rooms.find((r) => r.id === o.roomId)!
    if (o.kind !== 'door') continue
    if (r.kind === 'japanese') {
      // 和室用引き戸 / 襖；和 LDK 共用的墙上做宽的两扇引き違い
      o.kind = 'sliding'
      const { e, center } = openingGeom(c.rooms, o)!
      const probe = add(center, mul(e.out, 10))
      const other = c.rooms.find((x) => x !== r && pointInPolygon(probe, x.points))
      if (other?.kind === 'ldk') {
        o.width = Math.min(e.length - 40, c.rint(150, 180))
        o.offset = Math.max(o.width / 2 + 20, Math.min(e.length - o.width / 2 - 20, o.offset))
      }
    } else if (r.kind === 'wash') {
      // 洗面所：引き戸，不占地方
      o.kind = 'sliding'
    } else if (r.kind === 'bath') {
      // 浴室：中折れ戸，向浴室内折
      o.kind = 'folding'
      o.swing = 'in'
    } else if (r.kind === 'storage' && r.name !== 'WIC') {
      // 收纳：折れ戸
      o.kind = 'folding'
    }
  }

  // トイレ、洗面所、ユニットバス的门挪到墙的一端：另一端留给马桶 / 洗面台、洗衣机
  for (const r of c.rooms) {
    if (r.kind !== 'toilet' && r.kind !== 'wash' && r.name !== 'ユニットバス') continue
    const b = bbox(r.points)
    const corner = { x: b.x0, y: b.y0 }
    for (const { o, e } of openingsOn(r, c)) {
      if (o.kind === 'window') continue
      if (r.kind === 'toilet' && o.kind === 'door') o.width = Math.min(o.width, 65)
      // 门框离墙角 10cm
      const lo = o.width / 2 + 10
      const hi = e.length - o.width / 2 - 10
      if (hi <= lo) continue
      const at = (t: number) => dist(add(e.a, mul(e.dir, t)), corner)
      o.offset = at(lo) <= at(hi) ? lo : hi
    }
  }

  const plan: Plan = {
    version: 1,
    name: `${c.tags.includes('S') ? type.replace('LDK', 'SLDK') : type} ${jp(STYLE_LABELS[style])}${c.livingIn ? '·' + jp('リビングイン') : ''}${c.tags.filter((t) => t !== 'S').map((t) => '·' + t).join('')}${corner ? '·' + jp('角部屋') : ''} ${planArea({ rooms: c.rooms }).toFixed(1)}㎡ #${opts.seed}`,
    wall: WALL,
    wallOuter: WALL_OUTER,
    rooms: c.rooms,
    openings: c.openings,
    fixtures: [],
    furniture: [],
  }
  return { c, plan }
}

/** 第二阶段：摆设备（厨房、冰箱、浴缸、马桶、洗面台、洗衣机位、PS、空调外机） */
function furnish({ c, plan }: Layout): Plan {
  // 门的开向在摆设备之前定：设备要避开开扇（不影响面积，放在这里让面积筛选更快）
  orientDoors(plan)
  const put = (room: Room, spec: PlaceSpec) => {
    const f = placeOnWall(room, plan, spec)
    if (f) plan.fixtures.push(f)
    return f
  }

  // 厨房 + 冰箱
  const kRoom = plan.rooms.find((r) => r.kind === 'ldk') ?? plan.rooms.find((r) => r.kind === 'kitchen')
  if (kRoom) {
    const isLdk = kRoom.kind === 'ldk'
    const variants: KitchenVariant[] = isLdk && c.chance(0.7) ? ['facing', 'wall'] : ['wall', 'facing']
    const lengths = isLdk ? [270, 255, 240, 225, 210, 195, 180] : kRoom.name === 'DK' ? [240, 225, 210, 195, 180] : [180, 165, 150, 135]
    // 厨房候选（长台面优先）逐个试，直到冰箱位也放得下；都不行就只放厨房
    const fridge = (k: Fixture): PlaceSpec => ({ kind: 'fridge', lengths: [65, 60], depth: 65, near: { x: k.x, y: k.y }, nearMax: k.w / 2 + 160 })
    let fallback: Fixture | null = null
    outer: for (const variant of isLdk ? variants : ['wall' as const]) {
      const spec: PlaceSpec = { kind: 'kitchen', variant, lengths, depth: fixtureDepth({ kind: 'kitchen', variant }), edges: 'inner' }
      for (const k of placeCandidates(kRoom, plan, spec).slice(0, 80)) {
        fallback ??= k
        const f = placeOnWall(kRoom, { ...plan, fixtures: [...plan.fixtures, k] }, fridge(k))
        if (f) {
          plan.fixtures.push(k, f)
          fallback = null
          break outer
        }
      }
    }
    if (fallback) plan.fixtures.push(fallback)
  }

  for (const r of plan.rooms) {
    const door = firstDoorCenter(r, plan)
    const b = bbox(r.points)
    const minDim = Math.min(b.x1 - b.x0, b.y1 - b.y0)
    if (r.kind === 'bath') {
      if (r.name === 'ユニットバス') {
        // 3点ユニット：浴缸靠里，马桶、洗面台在门两侧
        put(r, { kind: 'bathtub', fill: true, lengths: [100], depth: 70, far: door, underWindow: true })
        plan.fixtures.push(
          ...placePair(r, plan, { kind: 'toilet', lengths: [40], depth: 65 }, { kind: 'basin', lengths: [50, 45], depth: 40 }),
        )
      } else {
        put(r, { kind: 'bathtub', fill: true, lengths: [110], depth: Math.min(80, Math.round(minDim * 0.45)), far: door, underWindow: true })
      }
    } else if (r.kind === 'toilet') {
      put(r, { kind: 'toilet', lengths: [40], depth: 68, far: door, centered: true })
    } else if (r.name === '洗濯機置場') {
      put(r, { kind: 'washer', lengths: [64, 60], depth: 64 })
    } else if (r.kind === 'wash') {
      plan.fixtures.push(
        ...placePair(
          r,
          plan,
          { kind: 'washer', lengths: [64, 60], depth: 64, underWindow: true },
          { kind: 'basin', lengths: [75, 60], depth: 55, underWindow: true },
        ),
      )
      if (c.chance(0.6)) put(r, { kind: 'ps', lengths: [45, 40], depth: 40 })
    } else if (r.kind === 'balcony') {
      // 外机背靠建筑外墙、风扇朝外；那面墙放不下才退到侧墙
      const spec: PlaceSpec = { kind: 'outdoor', lengths: [80, 70], depth: 30, avoidWindows: true }
      if (!put(r, { ...spec, edges: 'house' })) put(r, spec)
    }
  }
  // 玄关的造作鞋柜：和收纳间共用的那面墙上做成嵌墙的（柜体退进收纳间，不占玄关），没有就靠墙做一个
  const genkan = plan.rooms.find((r) => r.kind === 'entrance')
  if (genkan) {
    let best: { e: ReturnType<typeof edgesOf>[number]; lo: number; hi: number } | null = null
    for (const e of edgesOf(genkan.points)) {
      // 这面墙上的门（收纳间自己的门常开在同一面墙上）：两侧各让出 15，鞋柜不能挡在门前
      const doors = plan.openings.flatMap((o) => {
        const g = openingGeom(plan.rooms, o)
        if (!g || Math.abs(e.dir.x * g.e.dir.y - e.dir.y * g.e.dir.x) > 1e-6) return []
        const p = projectToSegment(g.center, e.a, e.b)
        return p.d > 1 ? [] : [[p.t - o.width / 2 - 15, p.t + o.width / 2 + 15] as [number, number]]
      })
      for (const o of plan.rooms.filter((r) => r.kind === 'storage'))
        for (const [lo0, hi0] of sharedIntervals(e, o))
          for (const [lo, hi] of subtractIntervals([lo0, hi0], doors)) if (hi - lo >= 70 && (!best || hi - lo > best.hi - best.lo)) best = { e, lo, hi }
    }
    if (best) {
      const d = 38
      const w = Math.min(best.hi - best.lo - 20, 100)
      const mid = add(best.e.a, mul(best.e.dir, (best.lo + best.hi) / 2))
      // 正面贴玄关一侧的墙面，柜体往收纳间里伸
      const face = add(mid, mul(best.e.out, -WALL / 2))
      const c = add(face, mul(best.e.out, d / 2))
      plan.fixtures.push({ id: uid('f'), kind: 'builtin', builtinType: 'shoe', recessed: true, x: Math.round(c.x), y: Math.round(c.y), w: Math.round(w), d, rot: rotFacingWall(best.e.out) })
    } else if (c.chance(0.5)) {
      const f = placeOnWall(genkan, plan, { kind: 'builtin', lengths: [90, 80, 70, 60], depth: 38 })
      if (f) plan.fixtures.push({ ...f, builtinType: 'shoe' })
    }
  }

  // 冰箱、洗衣机的款式和颜色：小户型多是两门小冰箱 / 小型立式洗衣机
  const small = planArea(plan) < 35
  const pickW = <T,>(items: [T, number][]) => {
    let r = c.rand() * items.reduce((s, [, w]) => s + w, 0)
    for (const [v, w] of items) if ((r -= w) <= 0) return v
    return items[0][0]
  }
  const COLORS: [string, number][] = [['#f6f6f3', 5], ['#c9ccd1', 3], ['#2f3134', 2], ['#e8d9bf', 2], ['#8a8d93', 1], ['#bfe8d8', 1], ['#f6c9d2', 0.6], ['#cfe3f2', 0.6], ['#efe4d0', 1]]
  for (const f of plan.fixtures) {
    if (f.kind === 'fridge') {
      f.style = small ? pickW<FridgeStyle>([['2door', 6], ['3door', 3], ['retro', 1]]) : pickW<FridgeStyle>([['3door', 4], ['french', 3], ['side', 1.5], ['retro', 0.6], ['2door', 0.4]])
      f.color = f.style === 'retro' ? pickW([['#bfe8d8', 2], ['#f6c9d2', 2], ['#cfe3f2', 1], ['#f3e3a6', 1], ['#efe4d0', 1]]) : pickW(COLORS)
    } else if (f.kind === 'washer') {
      f.style = small ? pickW<WasherStyle>([['compact', 5], ['top', 3], ['drum', 1.5], ['twin', 0.3]]) : pickW<WasherStyle>([['drum', 4], ['top', 4], ['stack', 1], ['twin', 0.3]])
      f.color = pickW([['#f6f6f3', 6], ['#c9ccd1', 2], ['#8a8d93', 1], ['#2f3134', 1], ['#e8d9bf', 1]])
    }
  }

  // 马桶类型：日本住宅多是温水洗净；面积大的户型更可能是无水箱的高级款
  const big = planArea(plan) > 60
  for (const f of plan.fixtures) if (f.kind === 'toilet') f.toiletType = c.chance(big ? 0.3 : 0.1) ? 'tankless' : c.chance(0.2) ? 'basic' : 'washlet'
  return plan
}

export function generateJapanese(opts: GenOptions): Plan {
  return furnish(layout(opts))
}

/** 专有面积（㎡）：不含阳台，按墙中心线 */
export function planArea(p: Pick<Plan, 'rooms'>) {
  return p.rooms.filter(isIndoor).reduce((s, r) => s + area(r.points), 0) / 10000
}

export interface GenResult {
  plan: Plan
  seed: number
  /** 是否落在面积范围内；否则 plan 是最接近的方案 */
  matched: boolean
}

/**
 * 带面积限制的生成：从 seed 开始依次试后面的种子，
 * 第一个「落在面积范围内且符合表示规约」的方案胜出；都不行就返回最接近的合规方案。
 * 面积只取决于布局，所以先只做布局，面积合格的才摆设备。
 */
export function generateWithArea(opts: GenOptions, attempts = 600): GenResult {
  const lo = opts.minArea ?? 0
  const hi = opts.maxArea ?? Infinity
  let best: { seed: number; score: number } | null = null
  for (let i = 0; i < attempts; i++) {
    const seed = (opts.seed + i) % 1_000_000
    const l = layout({ ...opts, seed })
    const a = planArea(l.plan)
    const gap = a < lo ? lo - a : a > hi ? a - hi : 0
    // 帖数只看布局：不合规的布局不必再摆设备
    const layoutOk = planViolations(l.plan, false).length === 0
    if (gap === 0 && layoutOk) {
      const plan = furnish(l)
      if (planViolations(plan).length === 0) return { plan, seed, matched: true }
    }
    // 兜底：面积最接近的方案（不合规的排在后面；gap 为 0 走到这里说明设备放不下）
    const score = gap + (layoutOk ? 0 : 1e6) + (gap === 0 ? 1e5 : 0)
    if (!best || score < best.score) best = { seed, score }
  }
  return { plan: generateJapanese({ ...opts, seed: best!.seed }), seed: best!.seed, matched: false }
}

/** 区间 [lo, hi] 扣掉若干区间后剩下的几段 */
export function subtractIntervals([lo, hi]: [number, number], cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [[lo, hi]]
  for (const [a, b] of cuts) out = out.flatMap(([l, h]) => (b <= l || a >= h ? [[l, h] as [number, number]] : [[l, a], [b, h]].filter(([x, y]) => y - x > 1) as [number, number][]))
  return out
}

/** 室内机（壁挂空调）的台数 */
/** 室内机：空调系列（含各款式）里的壁挂机 */
export const indoorUnits = (plan: Plan) => plan.furniture.filter((f) => f.asset === 'aircon' || ASSET_MAP.get(f.asset)?.family === 'aircon').length

/**
 * 空调外机补到和室内机一样多：先在阳台上靠建筑外墙放，再靠阳台其他边（都避开落地窗），
 * 还不够就用二段架台叠在已有外机上面（日本公寓的阳台常见做法）。
 */
export function ensureOutdoorUnits(plan: Plan, need = indoorUnits(plan)) {
  // 欧美住宅多是中央空调：室外机由生成器放在 patio 一侧，不按室内机台数补
  if (plan.region === 'west') return
  const spec: PlaceSpec = { kind: 'outdoor', lengths: [80, 70], depth: 30, avoidWindows: true }
  const count = () => plan.fixtures.filter((f) => f.kind === 'outdoor').length
  for (let guard = 0; count() < need && guard < 12; guard++) {
    let f: Fixture | null = null
    for (const b of plan.rooms.filter((r) => r.kind === 'balcony')) {
      f = placeOnWall(b, plan, { ...spec, edges: 'house' }) ?? placeOnWall(b, plan, spec)
      if (f) break
    }
    if (f) {
      plan.fixtures.push(f)
      continue
    }
    const base = plan.fixtures.find((x) => x.kind === 'outdoor' && !x.stackOn && !plan.fixtures.some((y) => y.stackOn === x.id))
    if (!base) break
    plan.fixtures.push({ ...base, id: uid('f'), stackOn: base.id })
  }
}
