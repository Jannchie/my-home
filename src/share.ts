// 户型链接分享：把户型压进地址的 hash（#p=…），不经过服务器。
//
// payload = 版本号（1 个字符）+ base64url(deflate-raw(紧凑 JSON))，压缩用浏览器原生 CompressionStream（Node 18+ 也有）。
// 紧凑 JSON（版本 1）：
//   { n 名字, w 内墙厚, o 外墙厚, g? 地区, N? 朝向,
//     r 房间 [[名字, 种类, 顶点（0.1cm 整数，首点绝对值、之后逐点差分，x/y 交错）, 其余字段?]],
//     d 门窗 [[房间序号, 种类, 边, 位置, 宽, 铰链 / 开向（bit0 = end，bit1 = out）, 其余字段?（门窗的款式等）]],
//     x 设备 [[种类, x, y, 宽, 旋转, 其余字段?（stackOn 换成设备序号）]],
//     a? 素材表 [素材 id…], f? 家具 [[素材表序号, x, y, 旋转, 配色序号?, 其余字段?]], h? 住户,
//     F? 楼层 [[id, 名字, 地面高, 层高]]（多层户型才有；房间 / 设备 / 家具的 floor 跟着「其余字段」走，门窗跟着房间） }
// id 一律不进链接，解码时重新生成；坐标、长度四舍五入到 0.1cm。
// 「只户型」不带家具、住户和房间的装饰（墙纸、窗帘、灯光覆盖）。
// 解码后走 store.normalizePlan（存档迁移），坏数据返回错误码，不抛异常。

import { uid, type Fixture, type Furniture, type Opening, type Plan, type Room } from './model'
import { normalizePlan } from './store'

export type ShareMode = 'plan' | 'full'
export const SHARE_VERSION = '1'
/** 含家具的链接超过这个长度就建议改用「只户型」或导出 JSON（不少聊天软件 / 浏览器对超长地址处理不好） */
export const SHARE_WARN_LENGTH = 16 * 1024
/** 地址里的 hash 键 */
export const SHARE_KEY = 'p'

export type ShareError = 'empty' | 'version' | 'corrupt'
export type DecodeResult = { ok: true; plan: Plan } | { ok: false; error: ShareError }

// ---------- 数值 ----------

const r1 = (v: number) => Math.round(v * 10) / 10
const tenth = (v: number) => Math.round(v * 10)

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 去掉已经单独编码的字段，剩下的原样带上（新加的可选字段不用改编码也能分享）；没有剩余时返回 undefined */
function rest<T extends object>(o: T, drop: string[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (!drop.includes(k) && v !== undefined) out[k] = v
  return Object.keys(out).length ? out : undefined
}

/** 末尾的 undefined 去掉（数组更短） */
function trim<T extends unknown[]>(a: T): T {
  while (a.length && a[a.length - 1] === undefined) a.pop()
  return a
}

// ---------- 紧凑 JSON ----------

type CRoom = [string, string, number[], Record<string, unknown>?]
type COpening = [number, string, number, number, number, number, Record<string, unknown>?]
type CFixture = [string, number, number, number, number, Record<string, unknown>?]
type CFurniture = [number, number, number, number, (number | null)?, Record<string, unknown>?]
interface Compact {
  n: string
  w: number
  o: number
  g?: string
  N?: number
  r: CRoom[]
  d: COpening[]
  x: CFixture[]
  a?: string[]
  f?: CFurniture[]
  h?: unknown
  F?: [string, string, number, number][]
  /** 户建用地 / 外观（结构见 model.ts Site / Exterior；读入时由 normalizePlan 校验） */
  S?: unknown
  X?: unknown
}

const ROOM_DECOR = ['wallpaper', 'curtain', 'light', 'lightK']
const OPENING_CODED = ['id', 'kind', 'roomId', 'edge', 'offset', 'width', 'hinge', 'swing', 'floor']

export function toCompact(p: Plan, mode: ShareMode): Compact {
  const roomIdx = new Map(p.rooms.map((r, i) => [r.id, i]))
  const fixIdx = new Map(p.fixtures.map((f, i) => [f.id, i]))
  const c: Compact = {
    n: p.name ?? '',
    w: r1(p.wall),
    o: r1(p.wallOuter),
    r: p.rooms.map((r) => {
      const pts: number[] = []
      let px = 0
      let py = 0
      for (const v of r.points) {
        const x = tenth(v.x)
        const y = tenth(v.y)
        pts.push(x - px, y - py)
        px = x
        py = y
      }
      return trim<CRoom>([r.name, r.kind, pts, rest(r, ['id', 'name', 'kind', 'points', ...(mode === 'plan' ? ROOM_DECOR : [])])])
    }),
    d: p.openings
      .filter((o) => roomIdx.has(o.roomId))
      // 第 7 项：没单独编码的字段（窗的款式 / 窗框 / 格条 / 窗台 / 护窗板，门的款式 / 颜色 / 把手 / 侧窗亮子）；旧版本解码只读前 6 项，多出来的忽略
      .map((o) => trim<COpening>([roomIdx.get(o.roomId)!, o.kind, o.edge, r1(o.offset), r1(o.width), (o.hinge === 'end' ? 1 : 0) | (o.swing === 'out' ? 2 : 0), rest(o, OPENING_CODED)])),
    x: p.fixtures.map((f) => {
      const extra = rest(f, ['id', 'kind', 'x', 'y', 'w', 'rot', 'stackOn'])
      const s = f.stackOn !== undefined ? fixIdx.get(f.stackOn) : undefined
      const e = s !== undefined ? { ...extra, stackOn: s } : extra
      return trim<CFixture>([f.kind, r1(f.x), r1(f.y), r1(f.w), r1(f.rot), e])
    }),
  }
  if (p.region) c.g = p.region
  if (p.north) c.N = r1(p.north)
  if (p.floors && p.floors.length > 1) c.F = p.floors.map((f) => [f.id, f.name, r1(f.elevation), r1(f.height)])
  if (p.site) c.S = JSON.parse(JSON.stringify(p.site, (_k, v) => (typeof v === 'number' ? r1(v) : v)))
  if (p.exterior) c.X = p.exterior
  if (mode === 'full') {
    const table: string[] = []
    const ai = new Map<string, number>()
    c.f = p.furniture.map((f) => {
      let i = ai.get(f.asset)
      if (i === undefined) {
        i = table.length
        table.push(f.asset)
        ai.set(f.asset, i)
      }
      const extra = rest(f, ['id', 'asset', 'x', 'y', 'rot', 'color', 'z'])
      const e = f.z ? { ...extra, z: r1(f.z) } : extra
      return trim<CFurniture>([i, r1(f.x), r1(f.y), r1(f.rot), f.color ?? (e ? null : undefined), e])
    })
    c.a = table
    if (p.household) c.h = p.household
  }
  return c
}

/** 紧凑 JSON → Plan（未经 normalizePlan）；结构不对时抛错，由 decodeShare 接住 */
export function fromCompact(c: unknown): Plan {
  const bad = (what: string): never => {
    throw new Error(`bad ${what}`)
  }
  if (!isObj(c)) bad('root')
  const o = c as unknown as Compact
  if (!Array.isArray(o.r) || !Array.isArray(o.d) || !Array.isArray(o.x)) bad('lists')
  if (!isNum(o.w) || !isNum(o.o)) bad('walls')

  const rooms: Room[] = o.r.map((cr) => {
    if (!Array.isArray(cr) || !isStr(cr[0]) || !isStr(cr[1]) || !Array.isArray(cr[2])) bad('room')
    const pts = cr[2]
    if (pts.length < 6 || pts.length % 2 || !pts.every(isNum)) bad('points')
    const points = []
    let x = 0
    let y = 0
    for (let i = 0; i < pts.length; i += 2) {
      x += pts[i]
      y += pts[i + 1]
      points.push({ x: x / 10, y: y / 10 })
    }
    return { ...(isObj(cr[3]) ? cr[3] : {}), id: uid('r'), name: cr[0], kind: cr[1] as Room['kind'], points }
  })

  const openings: Opening[] = o.d.map((cd) => {
    if (!Array.isArray(cd) || cd.length < 6) bad('opening')
    const [ri, kind, edge, offset, width, hs] = cd
    if (!isNum(ri) || !rooms[ri] || !isStr(kind) || !isNum(edge) || !isNum(offset) || !isNum(width) || !isNum(hs)) bad('opening')
    if (edge < 0 || edge >= rooms[ri].points.length) bad('opening edge')
    // 门窗的楼层跟着房间（normalizePlan 里同步）
    // 其余字段（窗的款式等）原样带上，由 normalizePlan 校验
    const extra = isObj(cd[6]) ? cd[6] : {}
    return { ...extra, id: uid('o'), kind: kind as Opening['kind'], roomId: rooms[ri].id, edge, offset, width, hinge: hs & 1 ? 'end' : 'start', swing: hs & 2 ? 'out' : 'in' }
  })

  const fixIds = o.x.map(() => uid('f'))
  const fixtures: Fixture[] = o.x.map((cx, i) => {
    if (!Array.isArray(cx) || !isStr(cx[0]) || !isNum(cx[1]) || !isNum(cx[2]) || !isNum(cx[3]) || !isNum(cx[4])) bad('fixture')
    const extra: Record<string, unknown> = isObj(cx[5]) ? { ...cx[5] } : {}
    if ('stackOn' in extra) {
      const s = extra.stackOn
      if (isNum(s) && fixIds[s] && s !== i) extra.stackOn = fixIds[s]
      else delete extra.stackOn
    }
    return { ...extra, id: fixIds[i], kind: cx[0] as Fixture['kind'], x: cx[1], y: cx[2], w: cx[3], rot: cx[4] }
  })

  let furniture: Furniture[] = []
  if (o.f !== undefined) {
    const table = o.a
    if (!Array.isArray(o.f) || !Array.isArray(table) || !table.every(isStr)) bad('furniture')
    furniture = o.f.map((cf) => {
      if (!Array.isArray(cf) || !isNum(cf[0]) || !isStr(table![cf[0]]) || !isNum(cf[1]) || !isNum(cf[2]) || !isNum(cf[3])) bad('furniture item')
      const extra = isObj(cf[5]) ? cf[5] : {}
      return { ...extra, id: uid('u'), asset: table![cf[0]], x: cf[1], y: cf[2], rot: cf[3], ...(isNum(cf[4]) ? { color: cf[4] } : {}) }
    })
  }

  const p: Plan = {
    version: 1,
    // 分享出去的都是迁移过的新数据：冰箱 / 洗衣机、收纳位上的柜子已经是家具（只户型时也不要给位补默认款）
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: isStr(o.n) ? o.n : '',
    wall: o.w,
    wallOuter: o.o,
    rooms,
    openings,
    fixtures,
    furniture,
  }
  if (o.g === 'jp' || o.g === 'cn' || o.g === 'west') p.region = o.g
  if (isNum(o.N)) p.north = o.N
  // 楼层表：坏的项丢掉，其余交给 normalizePlan（排序、去重、只剩一层时变回单层）
  if (Array.isArray(o.F)) p.floors = o.F.filter((f) => Array.isArray(f) && isStr(f[0]) && isStr(f[1]) && isNum(f[2]) && isNum(f[3])).map(([id, name, elevation, height]) => ({ id, name, elevation, height }))
  if (isObj(o.h) && Array.isArray((o.h as { members?: unknown }).members)) p.household = o.h as unknown as Plan['household']
  if (isObj(o.S)) p.site = o.S as unknown as Plan['site']
  if (isObj(o.X)) p.exterior = o.X as unknown as Plan['exterior']
  return p
}

// ---------- 压缩与 base64url ----------

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64')
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------- 对外 ----------

/** 户型 → payload（不含 #p=） */
export async function encodeShare(p: Plan, mode: ShareMode): Promise<string> {
  const json = JSON.stringify(toCompact(p, mode))
  const z = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
  return SHARE_VERSION + toBase64Url(z)
}

/** payload → 户型（已过 normalizePlan）；坏数据返回错误码 */
export async function decodeShare(payload: string): Promise<DecodeResult> {
  payload = payload.trim()
  if (!payload) return { ok: false, error: 'empty' }
  if (payload[0] !== SHARE_VERSION) return { ok: false, error: /^[0-9A-Za-z]$/.test(payload[0]) && payload[0] > SHARE_VERSION ? 'version' : 'corrupt' }
  try {
    const raw = await pipe(fromBase64Url(payload.slice(1)), new DecompressionStream('deflate-raw'))
    const p = normalizePlan(fromCompact(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))))
    if (!p) return { ok: false, error: 'corrupt' }
    return { ok: true, plan: p }
  } catch {
    return { ok: false, error: 'corrupt' }
  }
}

/** 从 hash 里取 payload：#p=…（也容忍 #…&p=…） */
export function payloadFromHash(hash: string): string | null {
  const h = hash.replace(/^#/, '')
  if (!h) return null
  const v = new URLSearchParams(h).get(SHARE_KEY)
  return v || null
}

/** 完整分享链接：当前地址（语言 + 视图路径 + 查询参数）换上 #p= */
export function shareUrl(payload: string, href: string): string {
  const u = new URL(href)
  u.hash = `${SHARE_KEY}=${payload}`
  return u.toString()
}

/** 地址里去掉 #p（打开后避免刷新重复导入） */
export function stripShareHash(href: string): string {
  const u = new URL(href)
  const params = new URLSearchParams(u.hash.replace(/^#/, ''))
  if (!params.has(SHARE_KEY)) return href
  params.delete(SHARE_KEY)
  const rest = params.toString()
  u.hash = rest ? rest : ''
  return u.toString()
}
