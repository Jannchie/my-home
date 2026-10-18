// 宣传片时间线：给定时刻 t（秒），把 3D 场景和界面叠层设置成那一刻的样子。
// 节拍：96 BPM，一拍 0.625s、一小节 2.5s；段落和切点都卡在拍点上（BGM 见 scripts/promo-bgm.py）。

import * as THREE from 'three'
import { reactive, shallowRef } from 'vue'
import { HouseSet, PromoScene, CUT_H, type View } from './scene'
import { basePlan, furnished } from './plans'
import { droneModel, type DroneParts } from '../three/robots-actors'
import { finishActorModel } from '../three/critters'
import { effectivePalette } from '../three/colors'
import { NavGrid } from '../nav'
import { furnitureModel, placeFurniture, roomAt } from '../three/house'
import { ASSETS, ASSET_MAP, STYLE_LABELS, type StyleTag } from '../three/assets'
import { allPalettes } from '../three/stylePalettes'
import { thumbnail } from '../three/thumbs'
import { LOOKS, LOOK_MAP, type LookId } from '../three/post'
import { DEFAULT_GEO, skyState } from '../three/sky'
import { STYLE_ORDER } from '../three/stylePalettes'
import { add, bbox, centroid, edgeInfo, edgesOf, mul, pointInPolygon, uid, type Plan, type Room, type Vec } from '../model'
import { isIndoor } from '../walls'
import { generateHousehold, INTEREST_TIERS, INTERESTS, JOBS, levelOf, type InterestId, type Member } from '../household'
import { roomStyles } from '../decorate'
import { planArea } from '../generate'
import { hasTag, matchSel, type Sel, type Tag } from '../three/tags'
import { SelectFrame } from '../three/selectFrame'
import { t as t_ } from '../i18n'
import { L, personName } from './text'

export const BEAT = 60 / 96
export const BAR = BEAT * 4
export const DURATION = BAR * 23 + 0.5
export const FPS_DEFAULT = 60

// ---------- 缓动 ----------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** 快出慢停（不回弹） */
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
export const easeInOut = (x: number) => {
  x = clamp01(x)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
const easeIn = (x: number) => Math.pow(clamp01(x), 3)
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
/** 标签的显隐：in..out 之间为 1，两头 0.3s 渐变 */
const showIn = (t: number, a: number, b: number, f = 0.3) => Math.min(easeOut((t - a) / f), easeInOut((b - t) / (f * 0.65)))

// ---------- 段落 ----------
export const SEG = {
  empty: 0,
  furnish: BAR, // 2.5
  household: BAR * 3, // 7.5
  styles: BAR * 6, // 15
  regions: BAR * 8, // 20
  daynight: BAR * 11, // 27.5
  looks: BAR * 12.5, // 31.25
  plan: BAR * 15.25, // 38.125（画面效果 11 拍）
  library: BAR * 18, // 45
  cat: BAR * 20, // 50
  end: BAR * 23, // 57.5
}

const STYLE_CUTS: StyleTag[] = ['cute', 'nordic', 'japanese', 'industrial', 'retro', 'chinese', 'classic', 'farmhouse']
const FINAL_STYLE: StyleTag = 'nordic'
/** 画面效果：除「原样」外的全部效果，每拍一切（这一段 11 拍；黑白漫画系列是后加的，不进宣传片） */
const LOOK_CUTS: LookId[] = LOOKS.filter((l) => l.id !== 'none' && l.stylize !== 'manga').map((l) => l.id)
/** 地区 × 规模：日式 / 中式 / 欧美各一套，由小到大（同一机位，每套一小节） */
const SIZES: { key: string; region: number; beats: number; type: string }[] = [
  { key: 'jp1ldk', region: 0, beats: 4, type: '1LDK' },
  { key: 'cn', region: 1, beats: 4, type: '' },
  { key: 'west', region: 2, beats: 4, type: '' },
]
/** 住户段用的那一户（固定种子）：两位室友风格迥异，各有一项 Lv.3+ 的兴趣套装摆在自己房间里 */
const HH_SEED = 308841
/** 风格的代表色（住户卡上的色块） */
const STYLE_COLORS: Record<StyleTag, string> = {
  cute: '#f2b8c6',
  nordic: '#c8a57a',
  modern: '#9aa4a8',
  japanese: '#b8a27a',
  industrial: '#5c6066',
  retro: '#c47a4a',
  chinese: '#a3443a',
  classic: '#8c6c4c',
  farmhouse: '#a7845a',
}
const REGION_NAMES = ['日式', '中式', '欧美']
/** 地区段：每个地区一句话概括户型特点（和三个生成器实际生成的格局一致） */
const REGION_NOTES = ['紧凑的 nLDK 格局，玄关落差、榻榻米和室、整体浴室', '客餐厅一体，主卧带卫，景观阳台与生活阳台', '开放式客厅配厨房中岛，主卧套间带衣帽间，独立洗衣房']
const CAT_TIME = 17.0
/** 结尾无人机降落的正侧面机位：俯角（0 = 正俯视） */
const SIDE_POLAR = 1.08

// ---------- 叠层状态（Promo.vue 渲染） ----------
export interface PlanUi {
  plan: Plan
  view: { x: number; y: number; s: number }
  sel: string | null
  vertex: number | null
  draft: { x0: number; y0: number; x1: number; y1: number } | null
  doorIn: { id: string; k: number } | null
  north: number
  compass: { x: number; y: number; r: number }
  furn: number
  unit: number
  o: number
}
export interface LibCard {
  id: string
  src: string
  x: number
  y: number
}

export const ui = reactive({
  w: 1920,
  h: 1080,
  canvasO: 1,
  /** 切点的短叠化：上一帧画面的残影（0..1）和新画面的轻微回弹缩放 */
  ghost: 0,
  bg: '#f4f1ea',
  dark: false,
  /** 右下角小字标 */
  brand: 0,
  label: null as null | { parts: { text: string; on?: boolean; dim?: boolean; num?: boolean }[]; note?: string; o: number },
  clock: null as null | { o: number; time: number },
  mask: null as null | { mode: 'cover' | 'reveal'; k: number; rot: number },
  cursor: null as null | { x: number; y: number; down: number; o: number },
  lib: null as null | { o: number; pan: number; count: number; focus: number; focusO: number; cardW: number; tilt: number },
  end: null as null | { blocks: number; logo: number },
  /** 住户卡（住户段） */
  cards: [] as HouseCard[],
})
export interface HouseCard {
  o: number
  /** 滑入偏移（0 = 到位） */
  dx: number
  name: string
  meta: string
  style: string
  color: string
  /** on：画面里框出来的就是这一项的套装 */
  interests: { label: string; lv: number; on?: boolean }[]
}
export const planUi = shallowRef<PlanUi | null>(null)
export const libCards = shallowRef<LibCard[]>([])

// ---------- 导演 ----------
export class Director {
  scene: PromoScene
  sets = new Map<string, HouseSet>()
  private plans = new Map<string, Plan>()
  private lastT = -1
  private lastSet: HouseSet | null = null
  /** 结尾：无人机飞过客厅，降落在窗边阳光里的停机坪垫上 */
  private drone: { parts: DroneParts; pad: THREE.Object3D; at: THREE.Vector3; start: THREE.Vector3; c1: THREE.Vector3; c2: THREE.Vector3; hover: THREE.Vector3 } | null = null
  private catSet: HouseSet | null = null
  private showcase: { id: string; colors: number[]; orig: THREE.Object3D; models: THREE.Object3D[] } | null = null
  private ground: THREE.Mesh
  private catAz = 0
  private sideAz = 0
  private edit!: ReturnType<Director['planEdit']>
  libFocus = { id: '', i: 0 }
  /** 住户段：两位成员各自的房间、兴趣套装（高亮）和卡片内容 */
  private people: { card: Omit<HouseCard, 'o' | 'dx'>; room: Room; items: HouseSet['furn'] }[] = []
  /** 兴趣物件的圆角取景框（沿用沙盘的选中框） */
  frames: SelectFrame[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new PromoScene(canvas)
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.14 }))
    this.ground.receiveShadow = true
    this.ground.visible = false
    this.scene.extra.add(this.ground)
  }

  resize(w: number, h: number) {
    ui.w = w
    ui.h = h
    this.scene.resize(w, h)
    for (const f of this.frames) f.setResolution(w, h)
  }

  // ----- 素材准备 -----

  async init(progress: (s: string) => void) {
    const A = basePlan('cn', 2024, 100, 130)
    for (const st of [...STYLE_CUTS]) this.plans.set('A:' + st, furnished(A, 2024, st))
    // 住户段：同一套户型，换一户人家按住户布置（风格不强制）
    // 在一批固定种子里挑一户：两位成员风格不同，各自房间里的兴趣套装越大件越好（一眼看得出来）
    progress('household')
    let bestH: { plan: Plan; score: number } | null = null
    for (let k = 1; k <= 160; k++) {
      const seed = HH_SEED + k * 7919
      const plan = furnished({ ...A, household: generateHousehold(A, seed) }, seed)
      const pp = pickPeople(plan)
      if (pp.length < 2) continue
      // 必须有一位主播（直播套装至少两件），另一位也要有显眼的大件
      const streamer = pp.find((x) => x.it === 'streaming' && levelOf(x.m, 'streaming') >= 3 && x.ids.length >= 2)
      if (!streamer) continue
      const other = pp.find((x) => x !== streamer)!
      const hasScreen = streamer.ids.some((id) => /green-screen/.test(plan.furniture.find((f) => f.id === id)?.asset ?? ''))
      const score = streamer.vol * (hasScreen ? 2 : 1) + other.vol * (levelOf(other.m, other.it) >= 3 ? 1.5 : 1)
      if (!bestH || score > bestH.score) bestH = { plan, score }
      if (k % 6 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    const H = bestH?.plan ?? furnished({ ...A, household: generateHousehold(A, HH_SEED) }, HH_SEED)
    // 绿幕就用绿色（风格派生配色会把它染成别的颜色，就认不出是绿幕了）
    for (const f of H.furniture) if (f.asset === 'of-green-screen') {
      f.color = 0
      delete f.colors
    }
    this.plans.set('H', H)
    progress('regions')
    this.plans.set('jp1ldk', furnished(basePlan('jp', 11, 40, 55, '1LDK'), 12))
    this.plans.set('cn', furnished(basePlan('cn', 5150, 100, 130), 5150))
    const W = furnished(basePlan('west', 306, 150, 200), 306)
    this.plans.set('west', W)
    this.edit = this.planEdit(W)
    this.plans.set('west-edit', this.edit.final)
    // 预先建好全部三维物体（之后逐帧只切换显隐，不在录制途中卡顿）
    for (const k of this.plans.keys()) {
      progress('build ' + k)
      this.set(k)
      await new Promise((r) => setTimeout(r, 0))
    }
    this.prepareCat()
    this.prepareHousehold()
    progress('thumbs')
    await this.prepareLibrary()
  }

  set(key: string) {
    let s = this.sets.get(key)
    if (!s) {
      s = new HouseSet(this.plans.get(key)!)
      this.sets.set(key, s)
    }
    return s
  }

  /** 平面图编辑演示：在一面没有阳台的外墙外加一个房间、拖一个顶点、开一扇门、转指北针 */
  private planEdit(src: Plan) {
    const b = bbox(src.rooms.flatMap((r) => r.points))
    const indoor = src.rooms.filter(isIndoor)
    const balconies = src.rooms.filter((r) => !isIndoor(r))
    type Cand = { room: Room; i: number; a: Vec; b: Vec; out: Vec; len: number; score: number }
    const cands: Cand[] = []
    for (const r of indoor) {
      edgesOf(r.points).forEach((e, i) => {
        const onBox = (Math.abs(e.a.x - e.b.x) < 0.5 && (Math.abs(e.a.x - b.x0) < 0.5 || Math.abs(e.a.x - b.x1) < 0.5)) || (Math.abs(e.a.y - e.b.y) < 0.5 && (Math.abs(e.a.y - b.y0) < 0.5 || Math.abs(e.a.y - b.y1) < 0.5))
        if (!onBox || e.length < 260) return
        // 外侧 1m 内不能有阳台
        const mid = mul(add(e.a, e.b), 0.5)
        const probe = add(mid, mul(e.out, 60))
        if (balconies.some((x) => pointInPolygon(probe, x.points))) return
        // 优先：右侧 / 下方（默认机位看得见）、边长适中
        const score = (e.out.x > 0.5 ? 2 : e.out.y > 0.5 ? 1.5 : 0) + Math.min(e.length, 400) / 400 + (r.kind === 'ldk' ? 0.6 : r.kind === 'western' ? 0.3 : 0)
        cands.push({ room: r, i, a: e.a, b: e.b, out: e.out, len: e.length, score })
      })
    }
    cands.sort((x, y) => y.score - x.score)
    const c = cands[0]
    const dir = { x: (c.b.x - c.a.x) / c.len, y: (c.b.y - c.a.y) / c.len }
    const L = Math.min(c.len - 40, 340)
    const s0 = (c.len - L) / 2
    const D = 280
    const p0 = add(c.a, mul(dir, s0))
    const p1 = add(c.a, mul(dir, s0 + L))
    const p2 = add(p1, mul(c.out, D))
    const p3 = add(p0, mul(c.out, D))
    // 第 0 条边贴着原来的外墙（门开在这条边上）；绕向和原户型的房间一致
    const pts = [p1, p0, p3, p2]
    const name = '书房'
    const room: Room = { id: uid('room'), name, kind: 'western', points: pts } as Room
    // 拖动的顶点：外侧远端的角（p2），沿墙的方向往外拉
    const vIndex = 3
    const vFrom = p2
    const vTo = add(add(p2, mul(dir, 70)), mul(c.out, 40))
    const door = { id: uid('op'), kind: 'door' as const, roomId: room.id, edge: 0, offset: L * 0.3, width: 80, hinge: 'start' as const, swing: 'in' as const }
    const north = src.north ?? 0
    const clone = (p: Plan) => JSON.parse(JSON.stringify(p)) as Plan
    const withRoom = (pp: Vec[], withDoor: boolean, n: number) => {
      const p = clone(src)
      p.rooms.push({ ...room, points: pp.map((q) => ({ ...q })) })
      if (withDoor) p.openings.push({ ...door })
      p.north = n
      return p
    }
    const moved = pts.map((q, i) => (i === vIndex ? vTo : q))
    return {
      room,
      draft: { from: p0, to: p2 },
      vIndex,
      vFrom,
      vTo,
      door,
      doorAt: add(add(c.a, mul(dir, s0 + door.offset)), mul(c.out, 0)),
      north,
      withRoom,
      final: withRoom(moved, true, north),
      moved,
    }
  }

  private prepareCat() {
    const set = this.set('A:' + FINAL_STYLE)
    const p = set.plan
    const nav = new NavGrid(p)
    const ldk = p.rooms.find((r) => r.kind === 'ldk')!
    // 挡视线的东西：家具、设备，以及墙（内墙按半墙高度算，外墙按整墙）
    const boxes: THREE.Box3[] = []
    for (const o of [...set.furn.map((x) => x.obj), ...(set.house.children[set.house.children.length - 1]?.children ?? [])]) {
      const b = new THREE.Box3().setFromObject(o)
      if (!b.isEmpty() && b.max.y > 22) boxes.push(b)
    }
    set.house.traverse((o) => {
      if (!o.userData.wall) return
      const b = new THREE.Box3().setFromObject(o)
      if (!(o.userData.fade as { outer?: boolean } | undefined)?.outer) b.max.y = Math.min(b.max.y, CUT_H)
      boxes.push(b)
    })
    /**
     * 侧面机位挡不挡：机位落在同一个 LDK 里、脚下是空地（不悬在家具或墙外），
     * 再从机位往垫子前后左右、上方几个点打视线，数一数中间挡着几样东西
     */
    const blocked = (q: Vec, az: number) => {
      const D = 250
      const g = { x: q.x + Math.sin(az) * D * Math.sin(SIDE_POLAR), y: q.y + Math.cos(az) * D * Math.sin(SIDE_POLAR) }
      let n = 0
      if (!pointInPolygon(g, ldk.points)) n += 5
      if (nav.clearAt('pet', g) < 25) n += 2
      const eye = new THREE.Vector3(g.x, nav.floorAt(q) + 18 + D * Math.cos(SIDE_POLAR), g.y)
      const fwd = { x: Math.sin(az + Math.PI / 2), y: Math.cos(az + Math.PI / 2) }
      const hit = new THREE.Vector3()
      for (const [along, h] of [[0, 8], [-35, 6], [35, 6], [0, 35], [-60, 25], [60, 25], [0, 70]]) {
        const tgt = new THREE.Vector3(q.x + fwd.x * along, nav.floorAt(q) + h, q.y + fwd.y * along)
        const ray = new THREE.Ray(eye, tgt.clone().sub(eye).normalize())
        const len = eye.distanceTo(tgt)
        n += boxes.filter((b) => !b.containsPoint(tgt) && ray.intersectBox(b, hit) && eye.distanceTo(hit) < len - 5).length
      }
      return n
    }
    // 停机坪：LDK 的窗前一块空地，且正侧面的视线不被挡（不靠隐藏家具）；朝阳台的落地窗优先、离窗越近越好
    let best: { at: Vec; face: number; score: number; out: Vec; side: number } | null = null
    for (const o of p.openings) {
      if (o.kind !== 'window' && o.kind !== 'sliding') continue
      const r = p.rooms.find((x) => x.id === o.roomId)
      if (!r) continue
      const e = edgeInfo(r.points, o.edge)
      const c = add(e.a, mul(e.dir, Math.max(o.width / 2, Math.min(e.length - o.width / 2, o.offset))))
      const inLdk = pointInPolygon(add(c, mul(e.out, -60)), ldk.points)
      const outLdk = pointInPolygon(add(c, mul(e.out, 60)), ldk.points)
      if (!inLdk && !outLdk) continue
      const inward = inLdk ? mul(e.out, -1) : e.out
      const balcony = p.rooms.some((x) => x.kind === 'balcony' && pointInPolygon(add(c, mul(inward, -60)), x.points))
      // 面朝窗外：rotation.y 的前方是 (sin h, cos h)
      const face = Math.atan2(-inward.x, -inward.y)
      for (const back of [50, 65, 80, 100, 120, 145, 170])
        for (const sd of [0, -25, 25, -50, 50, -80, 80, -110, 110]) {
          const q = add(add(c, mul(inward, back)), mul(e.dir, sd))
          if (nav.clearAt('pet', q) < 32 || !pointInPolygon(q, ldk.points)) continue
          for (const side of [face + Math.PI / 2, face - Math.PI / 2]) {
            const score = -blocked(q, side) * 100 + (balcony ? 20 : 0) - back * 0.2 - Math.abs(sd) * 0.05
            if (!best || score > best.score) best = { at: q, face, score, out: mul(inward, -1), side }
          }
        }
    }
    // 窗前挡得厉害时，在整个 LDK 里另找一块开阔的地方（任意方位的侧面机位），离窗越近越好
    if (best && best.score < -50) {
      const b = bbox(ldk.points)
      const win = best
      for (let x = b.x0 + 40; x < b.x1 - 40; x += 20)
        for (let y = b.y0 + 40; y < b.y1 - 40; y += 20) {
          const q = { x, y }
          if (!pointInPolygon(q, ldk.points) || nav.clearAt('pet', q) < 40) continue
          for (let k = 0; k < 12; k++) {
            const side = (k / 12) * Math.PI * 2
            const score = -blocked(q, side) * 100 - Math.hypot(q.x - win.at.x, q.y - win.at.y) * 0.1
            if (score > best.score) best = { ...win, at: q, side, score }
          }
        }
    }
    // 户型朝向：让这扇窗正对傍晚的太阳（略偏一点），停机坪上有一片斜进来的阳光
    if (best) {
      const bearing = skyState(CAT_TIME, 6, 21, DEFAULT_GEO, 0).bearing
      const a = (Math.atan2(best.out.x, -best.out.y) * 180) / Math.PI - bearing + 28 + 180
      const north = ((a % 360) + 360) % 360
      for (const [k, pl] of this.plans) if (k.startsWith('A:')) pl.north = north
    }
    this.catSet = set
    const face = best?.face ?? 0
    this.sideAz = best?.side ?? face + Math.PI / 2
    // 跟拍起点：侧面偏后一点，飞的过程中慢慢转到正侧面
    this.catAz = this.sideAz - 0.7
    // 停机坪垫：放在窗前那块空地上（这一套布置里本来没有，单独加一件，只在结尾显示）
    const at = best?.at ?? centroid(ldk.points)
    const fy = nav.floorAt(at)
    const pad = furnitureModel({ id: 'promo-pad', asset: 'rb-drone-pad', x: at.x, y: at.y, rot: 0 })
    placeFurniture(pad, p, { x: at.x, y: at.y, rot: 0 })
    pad.visible = false
    set.furnRoot.add(pad)
    const def = ASSET_MAP.get('rb-drone-aerial')
    const parts = droneModel('aerial', def ? effectivePalette(def, 0) : ['#e9e9e6', '#3a3d44', '#7fd8ff'])
    finishActorModel(parts.root)
    parts.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true
    })
    parts.root.visible = false
    set.root.add(parts.root)
    // 航线：从镜头对面、房间深处起飞点（留在 LDK 里，不穿墙），弧线飞到垫子上方，再垂直降落
    // 起飞点：优先镜头对面偏一侧，找不到就转着方向找；整条直线都要在 LDK 里，飞得越远越好
    const baseA = this.sideAz + Math.PI
    let s0 = add(at, { x: Math.sin(this.sideAz + Math.PI / 2) * 150, y: Math.cos(this.sideAz + Math.PI / 2) * 150 })
    let found = false
    for (const off of [-0.6, 0.6, -0.3, 0.3, -1.0, 1.0, 0, -1.4, 1.4]) {
      if (found) break
      const dir = { x: Math.sin(baseA + off), y: Math.cos(baseA + off) }
      for (let dd = 420; dd >= 160; dd -= 20) {
        const ok = [0.25, 0.5, 0.75, 1].every((f) => pointInPolygon(add(at, mul(dir, dd * f)), ldk.points))
        if (ok) {
          s0 = add(at, mul(dir, dd))
          found = true
          break
        }
      }
    }
    const away = { x: (s0.x - at.x) / (Math.hypot(s0.x - at.x, s0.y - at.y) || 1), y: (s0.y - at.y) / (Math.hypot(s0.x - at.x, s0.y - at.y) || 1) }
    const P = new THREE.Vector3(at.x, fy + 0.8, at.y)
    const S0 = new THREE.Vector3(s0.x, fy + 150, s0.y)
    const hover = P.clone().setY(fy + 75)
    this.drone = {
      parts,
      pad,
      at: P,
      start: S0,
      c1: S0.clone().lerp(hover, 0.45).setY(fy + 165),
      c2: hover.clone().add(new THREE.Vector3(away.x * 70, 55, away.y * 70)),
      hover,
    }
    // 展示用的沙发：这一套里 LDK 的沙发（没有就找任意沙发 / 单人沙发）
    const sofa = set.furn.find((o) => /sofa/.test(o.f.asset) && roomAt(p, o.f)?.kind === 'ldk') ?? set.furn.find((o) => /sofa|armchair/.test(o.f.asset))
    if (sofa) {
      const def = ASSET_MAP.get(sofa.f.asset)!
      const pals = allPalettes(def)
      const cur = sofa.f.color ?? 0
      const pick: number[] = []
      for (const st of ['cute', 'industrial', 'chinese', 'classic', 'japanese', 'retro'] as StyleTag[]) {
        const e = pals.find((x) => x.style === st && x.index !== cur)
        if (e && !pick.includes(e.index)) pick.push(e.index)
        if (pick.length === 3) break
      }
      const models = pick.map((c) => {
        const m = furnitureModel({ ...sofa.f, color: c })
        placeFurniture(m, p, sofa.f)
        return m
      })
      this.showcase = { id: sofa.f.id, colors: pick, orig: sofa.obj, models }
      this.libFocus.id = sofa.f.asset
    }
  }

  /**
   * 住户段的数据：全部来自真实的住户生成器和一键布置结果。
   * 每位成员取等级最高（≥ Lv.3）、且套装确实摆在 TA 自己房间（房间风格 = TA 的风格偏好）的那项兴趣；
   * 挑出风格不同的两位。卡片上的风格、兴趣等级和画面里的家具一一对应。
   */
  private prepareHousehold() {
    const set = this.set('H')
    const taken = new Set<string>()
    const byId = new Map(set.furn.map((o) => [o.f.id, o]))
    const picks: Director['people'] = pickPeople(set.plan).map((x) => ({
      card: memberCard(x.m, x.it, taken),
      room: x.room,
      items: x.ids.map((id) => byId.get(id)!).filter(Boolean),
    }))
    this.people = picks
    for (let i = 0; i < 6; i++) {
      const f = new SelectFrame('select')
      f.setResolution(ui.w, ui.h)
      // 框画在占地上：立柜、展示柜会挡住它，这里让它透过家具显示（材质建好就有，形状在 show 时才生成）
      for (const m of [f['outlineMat'], f['cornerMat'], f['fillMat']] as THREE.Material[]) {
        m.userData.baseOpacity = m.opacity
        m.depthTest = false
      }
      this.frames.push(f)
      this.scene.extra.add(f.group)
    }
  }

  /** 住户段（3 小节）：卡片滑入，镜头依次推到两位成员的房间，兴趣套装短暂框出，最后拉回全景接风格快切 */
  private householdSegment(t: number, set: HouseSet, wide: View): View {
    const T = SEG.household
    const ppl = this.people
    if (ppl.length < 2) return wide
    const B = BEAT
    // 节拍：第 1 位 0–4.5 拍，第 2 位 4.5–9.5 拍，最后 2.5 拍拉回
    const t1 = T + B * 0.2
    const sw = T + B * 5
    const back = T + B * 10
    const push = easeInOut(span(t, t1, t1 + B * 2)) * (1 - easeInOut(span(t, back, SEG.styles - 0.05)))
    const mix = easeInOut(span(t, sw - B * 0.4, sw + B * 1.6))
    const rv = (r: Room, items: HouseSet['furn']) => {
      const b = bbox(r.points)
      // 看向房间中心和兴趣套装之间（套装在画面里更靠中间）
      const rc = centroid(r.points)
      const ic = items.length ? { x: items.reduce((s, o) => s + o.base.x, 0) / items.length, y: items.reduce((s, o) => s + o.base.z, 0) / items.length } : rc
      const c = { x: (rc.x + ic.x * 3) / 4, y: (rc.y + ic.y * 3) / 4 }
      const R = Math.min(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 40, 330)
      const fov = (30 * Math.PI) / 180
      const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * (ui.w / ui.h)))
      return { target: new THREE.Vector3(c.x, 40, c.y), dist: (R * 1.05) / Math.sin(fit / 2) }
    }
    const a = rv(ppl[0].room, ppl[0].items)
    const b = rv(ppl[1].room, ppl[1].items)
    const dist = lerp(a.dist, b.dist, mix)
    // 卡片占了画面左侧（竖版在上方）：房间往右（竖版往下）让一让
    const right = new THREE.Vector3(Math.cos(wide.az), 0, -Math.sin(wide.az))
    const away = new THREE.Vector3(-Math.sin(wide.az), 0, -Math.cos(wide.az))
    const half = dist * Math.tan((15 * Math.PI) / 180)
    const shift = ui.w >= ui.h ? right.multiplyScalar(-half * (ui.w / ui.h) * 0.24) : away.multiplyScalar(half * 0.3)
    const target = a.target.clone().lerp(b.target, mix).add(shift)
    const view: View = {
      target: wide.target.clone().lerp(target, push),
      az: wide.az,
      polar: lerp(wide.polar, this.pol(0.8), push),
      dist: lerp(wide.dist, dist, push),
      fov: 30,
    }
    // 卡片：第 1 张滑入 → 换成第 2 张 → 拉回全景时收起
    const card = (i: number, a0: number, a1: number): HouseCard => {
      const o = Math.min(easeOut((t - a0) / 0.45), 1 - easeIn((t - a1) / 0.3))
      return { ...ppl[i].card, o: Math.max(0, o), dx: -(1 - easeOut((t - a0) / 0.5)) * 0.25 - easeIn((t - a1) / 0.3) * 0.1 }
    }
    ui.cards = [card(0, t1 + 0.1, sw - 0.15), card(1, sw + 0.15, back + 0.2)].filter((c) => c.o > 0.001)
    // 兴趣物件：镜头到位后框出 1.5s，0.4s 缓入缓出
    const hl = (i: number, a0: number) => {
      const k = Math.min(easeInOut((t - a0) / 0.4), 1 - easeInOut((t - (a0 + 1.6)) / 0.4))
      ppl[i].items.forEach((o, j) => {
        const f = this.frames[i * 3 + j]
        if (!f || k <= 0.001) return
        const def = ASSET_MAP.get(o.f.asset)
        f.show(o.base.x, o.base.y, o.base.z, def?.w ?? 40, def?.d ?? 40, o.obj.rotation.y)
        f.update(1e15, true)
        const sc = 1.12 - 0.12 * k
        f.group.scale.set(sc, 1, sc)
        for (const m of [f['outlineMat'], f['cornerMat'], f['fillMat']] as THREE.Material[]) m.opacity = m.userData.baseOpacity * k
      })
    }
    hl(0, t1 + B * 2.2)
    hl(1, sw + B * 1.8)
    void set
    ui.label = { parts: [{ text: L('住户设定') }], note: L('风格偏好与兴趣等级，决定每个房间的家具'), o: showIn(t, T + 0.3, SEG.styles - 0.2) }
    return view
  }

  private async prepareLibrary() {
    // 素材网格：在全部素材里按类别轮流取，覆盖面广；第一张固定放展示用的沙发
    const byCat = new Map<string, string[]>()
    for (const a of ASSETS) {
      if (a.fixture || a.id.startsWith('act-')) continue
      const l = byCat.get(a.category) ?? []
      // 同款系列只取一件
      if (!l.some((x) => ASSET_MAP.get(x)?.series === a.series)) l.push(a.id)
      byCat.set(a.category, l)
    }
    const lists = [...byCat.values()]
    const ids: string[] = []
    for (let k = 0; ids.length < 220 && k < 400; k++) for (const l of lists) if (l[k * 3]) ids.push(l[k * 3])
    const cols = 16
    const rows = Math.ceil(ids.length / cols)
    const cards: LibCard[] = []
    // 焦点卡片放在网格中部
    const fi = Math.floor(rows / 2) * cols + Math.floor(cols / 2)
    ids.splice(fi, 0, this.libFocus.id || 'sofa3')
    for (let i = 0; i < Math.min(ids.length, cols * rows); i++) {
      cards.push({ id: ids[i], src: thumbnail(ids[i], i === fi && this.showcase ? this.sets.get('A:' + FINAL_STYLE)!.furn.find((o) => o.f.id === this.showcase!.id)?.f.color ?? 0 : 0), x: i % cols, y: Math.floor(i / cols) })
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    this.libFocus.i = fi
    libCards.value = cards
  }

  // ----- 每一帧 -----

  frame(t: number) {
    const dt = t > this.lastT && t - this.lastT < 0.2 ? t - this.lastT : 0
    const snap = dt === 0
    this.lastT = t
    const S = SEG
    const sc = this.scene
    ui.label = null
    ui.clock = null
    ui.mask = null
    ui.cursor = null
    ui.lib = null
    ui.end = null
    ui.cards = []
    ui.canvasO = 1
    ui.brand = 0
    planUi.value = null
    this.ground.visible = false
    if (this.drone) {
      this.drone.parts.root.visible = false
      this.drone.pad.visible = false
    }
    let look: LookId = 'none'
    let time = 10.2
    let set: HouseSet
    let view: View
    let mode: 'half' | 'down' = 'half'
    let cut = CUT_H
    /** 墙体按哪个方向压低（默认跟镜头走；结尾固定，镜头转动时窗户那面墙不会忽然被压低） */
    let wallsFrom: THREE.Vector3 | null = null
    let flat = 0

    const azAt = (tt: number) => -0.5 + 0.11 * tt
    const orbit = (s: HouseSet, tt: number, polar: number, k = 1, az = azAt(tt)): View => ({ target: new THREE.Vector3(s.center.x, 30, s.center.y), az, polar: this.pol(polar), dist: this.fitDist(s, this.pol(polar)) * k, fov: 30 })

    for (const f of this.frames) f.group.visible = false
    if (t < S.household) {
      // 1–2：空房子环绕 → 家具逐件落下（落下的就是下一段住户设定里这户人家的布置）
      set = this.set('H')
      view = orbit(set, t, 0.98, lerp(1.04, 0.96, easeInOut(t / S.household)))
      this.dropFurniture(set, t)
      ui.brand = showIn(t, 0.35, S.furnish + 0.4, 0.4)
      if (t > S.furnish) ui.label = { parts: [{ text: L('一键布置') }], o: showIn(t, S.furnish + 0.4, S.household - 0.15) }
      // 开场：圆角方块展开
      if (t < 0.5) ui.mask = { mode: 'reveal', k: easeInOut(t / 0.5), rot: -4 * (1 - easeOut(t / 0.5)) }
    } else if (t < S.styles) {
      // 3：住户设定 → 每个人的房间按风格偏好与兴趣等级布置
      set = this.set('H')
      this.resetFurniture(set)
      view = this.householdSegment(t, set, orbit(set, t, 0.98, 0.96))
    } else if (t < S.regions) {
      // 4：同一户型快切住户风格，每拍一切，镜头不停
      const i = Math.min(STYLE_CUTS.length - 1, Math.floor((t - S.styles) / BEAT))
      set = this.set('A:' + STYLE_CUTS[i])
      this.resetFurniture(set)
      view = orbit(set, t, 0.98, 0.96)
      ui.label = { parts: [{ text: L('{n} 种风格', { n: STYLE_ORDER.length }) }, { text: t_(STYLE_LABELS[STYLE_CUTS[i]]), on: true }], o: showIn(t, S.styles + 0.1, S.regions - 0.2, 0.2) }
      if (t > S.regions - 0.25) ui.mask = { mode: 'cover', k: easeInOut((t - (S.regions - 0.25)) / 0.25), rot: 3 * easeIn((t - (S.regions - 0.25)) / 0.25) }
    } else if (t < S.daynight) {
      // 5：由小到大的户型 × 日式 / 中式 / 欧美，同一机位快切，取景距离按户型大小算（房子在画面里占比一致）
      let k = 0
      let acc = S.regions
      while (k < SIZES.length - 1 && t >= acc + SIZES[k].beats * BEAT) acc += SIZES[k++].beats * BEAT
      const sz = SIZES[k]
      set = this.set(sz.key)
      this.resetFurniture(set)
      view = orbit(set, t, 0.82, 0.98)
      const p = set.plan
      const beds = p.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
      const type = sz.type || L('{n} 室', { n: beds })
      ui.label = {
        parts: [...REGION_NAMES.map((n, j) => ({ text: t_(n), dim: j !== sz.region })), { text: `${type} · ${planArea(p).toFixed(0)}㎡`, on: true, num: true }],
        note: L(REGION_NOTES[sz.region]),
        o: showIn(t, S.regions + 0.3, S.daynight - 0.15, 0.25),
      }
      if (t < S.regions + 0.35) ui.mask = { mode: 'reveal', k: easeInOut((t - S.regions) / 0.35), rot: -3 * (1 - easeOut((t - S.regions) / 0.35)) }
    } else if (t < S.looks) {
      // 6：昼夜一气呵成（约 3.75s）：上午 → 正午 → 黄昏 → 入夜亮灯 → 次日清晨
      set = this.set('west')
      this.resetFurniture(set)
      view = orbit(set, t, lerp(0.82, 0.86, easeInOut(span(t, S.daynight, S.looks))), 0.98)
      time = dayTime(t)
      ui.clock = { o: showIn(t, S.daynight + 0.15, S.looks - 0.1, 0.2), time }
      ui.label = { parts: [{ text: L('昼夜光照') }], o: showIn(t, S.daynight + 0.15, S.looks - 0.1, 0.2) }
    } else if (t < S.plan) {
      // 7：画面效果，镜头慢推
      set = this.set('west')
      this.resetFurniture(set)
      const k = easeInOut(span(t, S.looks, S.plan))
      view = orbit(set, t, lerp(0.86, 0.9, k), lerp(0.98, 0.74, k), azAt(S.looks) + 0.05 * (t - S.looks))
      time = dayTime(t)
      const i = Math.min(LOOK_CUTS.length - 1, Math.floor((t - S.looks) / BEAT))
      look = LOOK_CUTS[i]
      ui.label = { parts: [{ text: L('画面效果') }, { text: t_(LOOK_MAP.get(look)!.label), on: true }], o: showIn(t, S.looks + 0.1, S.plan - 0.15, 0.2) }
    } else if (t < S.library) {
      // 7：压成平面图 → 编辑 → 长回 3D
      const r = this.planSegment(t)
      set = r.set
      view = r.view
      flat = r.flat
      time = 10.2
    } else if (t < S.cat) {
      // 8：素材库 → 一件沙发的 3D 模型换配色
      set = this.set('A:' + FINAL_STYLE)
      this.resetFurniture(set)
      view = this.librarySegment(t, set)
      time = 13.5
      wallsFrom = new THREE.Vector3(set.center.x + Math.sin(this.sideAz) * 2000, 0, set.center.y + Math.cos(this.sideAz) * 2000)
    } else {
      // 9：无人机降落 + 结尾
      set = this.set('A:' + FINAL_STYLE)
      this.resetFurniture(set)
      time = CAT_TIME + 0.25 * span(t, S.cat, S.end)
      wallsFrom = new THREE.Vector3(set.center.x + Math.sin(this.sideAz) * 2000, 0, set.center.y + Math.cos(this.sideAz) * 2000)
      view = this.catSegment(t, set)
    }

    // 切点：同机位的极短叠化（上一帧做残影 ~7 帧淡出）；不加缩放，免得同机位快切时画面大小跳动
    const cutKey = `${set.plan.name}|${set.center.x}|${set.furn.length}|${look}|${t >= S.library && t < S.cat}`
    if (cutKey !== this.lastCut && dt > 0 && this.ghost) {
      const g = this.ghost.getContext('2d')!
      if (this.ghost.width !== ui.w || this.ghost.height !== ui.h) {
        this.ghost.width = ui.w
        this.ghost.height = ui.h
      }
      g.clearRect(0, 0, ui.w, ui.h)
      g.drawImage(sc.stage.renderer.domElement, 0, 0, ui.w, ui.h)
      this.cutAt = t
    }
    this.lastCut = cutKey
    const sinceCut = t - this.cutAt
    ui.ghost = sinceCut >= 0 && sinceCut < 0.13 ? 1 - easeInOut(sinceCut / 0.13) : 0
    if (set !== this.lastSet) {
      sc.show(set)
      this.lastSet = set
    }
    // 压平：整套房子沿高度压扁（墙、家具、设备一起），平面图从下面接上
    set.root.scale.y = Math.max(0.002, 1 - flat)
    if (this.showcase && set === this.catSet) this.applyShowcase(t)
    sc.setView(view)
    const north = set.plan.north ?? 0
    sc.sky(time, 6, 21, DEFAULT_GEO, north)
    set.walls(wallsFrom ?? sc.stage.camera.position, mode, cut, dt, snap || set !== this.prevWallsSet || mode !== this.prevMode)
    this.prevMode = mode
    this.prevWallsSet = set
    sc.post.setLook(look)
    ui.bg = sc.bg
    ui.dark = sc.night > 0.55
    sc.render()
  }
  private prevWallsSet: HouseSet | null = null
  private lastCut = ''
  private cutAt = -10
  /** 残影画布（Promo.vue 提供） */
  ghost: HTMLCanvasElement | null = null
  private prevMode: 'half' | 'down' = 'half'

  /**
   * 取景距离：把房子（含底座，墙按半墙高度算）在这个俯角下转一圈，每个方位都要完整装进画面（留 margin），取最远的那个。
   * 结果和方位无关，环绕时不会忽远忽近。
   */
  /** 竖版：俯角更大（更接近俯视），房子在竖长的画面里占得更满 */
  pol(p: number) {
    return ui.w < ui.h ? p * 0.72 : p
  }
  private fitCache = new Map<string, number>()
  fitDist(s: HouseSet, polar: number, margin = ui.w < ui.h ? 1.02 : 0.97) {
    const key = `${s.plan.name}|${s.center.x}|${polar.toFixed(3)}|${ui.w}x${ui.h}|${margin}`
    const hit = this.fitCache.get(key)
    if (hit) return hit
    const cam = new THREE.PerspectiveCamera(30, ui.w / ui.h, 1, 100000)
    const b = s.box
    const ys = [b.min.y + 30, Math.min(b.max.y, 120)]
    const corners = [b.min.x, b.max.x].flatMap((x) => ys.flatMap((y) => [b.min.z, b.max.z].map((z) => new THREE.Vector3(x, y, z))))
    const target = new THREE.Vector3(s.center.x, 30, s.center.y)
    const v = new THREE.Vector3()
    const fits = (d: number, az: number) => {
      const sp = Math.sin(polar)
      cam.position.set(target.x + d * sp * Math.sin(az), target.y + d * Math.cos(polar), target.z + d * sp * Math.cos(az))
      cam.up.set(0, 1, 0)
      cam.lookAt(target)
      cam.updateMatrixWorld(true)
      return corners.every((c) => {
        v.copy(c).project(cam)
        return Math.abs(v.x) <= margin && Math.abs(v.y) <= margin && v.z < 1
      })
    }
    let need = 0
    for (let k = 0; k < 24; k++) {
      const az = (k / 24) * Math.PI * 2
      let lo = 100
      let hi = 40000
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2
        if (fits(mid, az)) hi = mid
        else lo = mid
      }
      need = Math.max(need, hi)
    }
    this.fitCache.set(key, need)
    return need
  }

  private resetFurniture(set: HouseSet) {
    if (set.root.userData.dropState === 'done') return
    for (const o of set.furn) {
      o.obj.position.copy(o.base)
      o.obj.scale.set(1, 1, 1)
      o.obj.userData.dropVisible = true
    }
    set.root.userData.dropState = 'done'
  }

  /** 家具按房间顺序逐件落下：先慢后快，每件 0.5s 缓出落地 */
  private order: Map<HouseSet, number[]> = new Map()
  private dropFurniture(set: HouseSet, t: number) {
    set.root.userData.dropState = 'drop'
    let ord = this.order.get(set)
    if (!ord) {
      const p = set.plan
      const ldk = p.rooms.find((r) => r.kind === 'ldk')
      const c0 = ldk ? centroid(ldk.points) : set.center
      const roomRank = new Map<string, number>()
      p.rooms
        .map((r) => ({ r, d: r === ldk ? -1 : Math.hypot(centroid(r.points).x - c0.x, centroid(r.points).y - c0.y) }))
        .sort((a, b) => a.d - b.d)
        .forEach((x, i) => roomRank.set(x.r.id, i))
      const key = (i: number) => {
        const f = set.furn[i].f
        const def = ASSET_MAP.get(f.asset)
        const r = roomAt(p, f)
        const layer = f.z ? 2 : def?.mount ? 1 : 0
        const size = def ? def.w * def.d : 0
        return [roomRank.get(r?.id ?? '') ?? 99, layer, -size]
      }
      ord = set.furn.map((_, i) => i)
      const keys = ord.map(key)
      ord.sort((a, b) => keys[a][0] - keys[b][0] || keys[a][1] - keys[b][1] || keys[a][2] - keys[b][2])
      this.order.set(set, ord)
    }
    const N = ord.length
    const t0 = SEG.furnish + 0.15
    const D = SEG.household - 0.75 - t0
    ord.forEach((fi, k) => {
      const o = set.furn[fi]
      const start = t0 + D * Math.pow(k / Math.max(1, N - 1), 0.55)
      const u = (t - start) / 0.5
      o.obj.userData.dropVisible = u >= 0
      const e = easeOut(u)
      o.obj.position.set(o.base.x, o.base.y + (1 - e) * 110, o.base.z)
      const s = lerp(0.82, 1, e)
      o.obj.scale.set(s, s, s)
    })
  }

  // ----- 7：平面图 -----

  private topView(set: HouseSet): { view: View; map: { x: number; y: number; s: number } } {
    const b = bbox(this.edit.final.rooms.flatMap((r) => r.points))
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    const s = Math.min((ui.w * 0.78) / (b.x1 - b.x0), (ui.h * 0.72) / (b.y1 - b.y0))
    const fov = 30
    const dist = ui.h / 2 / (s * Math.tan(((fov / 2) * Math.PI) / 180))
    void set
    return { view: { target: new THREE.Vector3(cx, 0, cy), az: 0, polar: 0, dist, fov }, map: { x: ui.w / 2 - cx * s, y: ui.h / 2 - cy * s, s } }
  }

  private planSegment(t: number) {
    const S = SEG
    const T0 = S.plan
    const fold = [T0, T0 + BEAT * 2.4] // 压平
    const grow = [S.library - BEAT * 2.3, S.library - 0.25] // 长回去
    const ed = this.edit
    const west = this.set('west')
    const edited = this.set('west-edit')
    // 起点机位：上一段结束时的样子
    const az0 = -0.5 + 0.11 * S.looks + 0.05 * (S.plan - S.looks)
    const from: View = { target: new THREE.Vector3(west.center.x, 30, west.center.y), az: az0, polar: this.pol(0.9), dist: this.fitDist(west, this.pol(0.9)) * 0.74, fov: 30 }
    const azTop = Math.round(az0 / (Math.PI * 2)) * Math.PI * 2
    const top = this.topView(edited)
    const blend = (a: View, b: View, k: number, kp: number): View => ({
      target: a.target.clone().lerp(b.target, k),
      az: lerp(a.az, b.az, k),
      polar: lerp(a.polar, b.polar, kp),
      dist: lerp(a.dist, b.dist, k),
      fov: 30,
    })
    const topV = { ...top.view, az: azTop }
    let set = west
    let view: View
    let flat = 0
    let planO = 0
    let furnO = 1
    if (t < grow[0]) {
      const u = span(t, fold[0], fold[1])
      view = blend(from, topV, easeInOut(u / 0.85), easeInOut(u / 0.8))
      flat = easeInOut(span(u, 0.05, 0.95))
      planO = easeInOut(span(u, 0.6, 1))
      furnO = 1
    } else {
      set = edited
      const u = span(t, grow[0], grow[1])
      const back: View = { target: new THREE.Vector3(edited.center.x, 30, edited.center.y), az: azTop - 0.55, polar: this.pol(0.92), dist: this.fitDist(edited, this.pol(0.92)), fov: 30 }
      view = blend(topV, back, easeInOut(span(u, 0.1, 1)), easeInOut(span(u, 0.15, 1)))
      flat = 1 - easeInOut(span(u, 0.08, 0.9))
      planO = 1 - easeInOut(span(u, 0, 0.35))
    }
    ui.canvasO = 1 - planO * 0.999
    // ---- 平面图上的操作 ----
    const E0 = fold[1] + 0.2
    const tl = {
      draftDown: E0 + 0.4,
      draftUp: E0 + 1.4,
      vDown: E0 + 2.0,
      vUp: E0 + 2.75,
      doorClick: E0 + 3.4,
    }
    let plan: Plan = west.plan
    let sel: string | null = null
    let vertex: number | null = null
    let draft: PlanUi['draft'] = null
    let doorIn: PlanUi['doorIn'] = null
    const north = west.plan.north ?? 0
    const m = top.map
    const scr = (p: Vec) => ({ x: m.x + p.x * m.s, y: m.y + p.y * m.s })
    const unit = Math.min(ui.w, ui.h) / 1080 * 1.55
    const compass = { x: ui.w - 26 * unit - 22 * unit * 1.6, y: 26 * unit + 22 * unit * 1.6, r: 22 * unit * 1.6 }
    const cur = { x: 0, y: 0, down: 0, o: 0 }
    const mv = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => {
      const e = easeInOut(k)
      cur.x = lerp(a.x, b.x, e)
      cur.y = lerp(a.y, b.y, e)
    }
    const offscreen = { x: ui.w * 0.92, y: ui.h * 0.9 }
    const pDraft0 = scr(ed.draft.from)
    const pDraft1 = scr(ed.draft.to)
    const pV0 = scr(ed.vFrom)
    const pV1 = scr(ed.vTo)
    const pDoor = scr(ed.doorAt)
    if (t >= E0 - 0.3 && t < grow[0] + 0.3) {
      cur.o = Math.min(easeOut((t - (E0 - 0.3)) / 0.3), 1 - easeOut((t - grow[0]) / 0.3))
      if (t < tl.draftDown) mv(offscreen, pDraft0, span(t, E0 - 0.3, tl.draftDown - 0.05))
      else if (t < tl.draftUp) {
        const k = easeInOut(span(t, tl.draftDown + 0.08, tl.draftUp - 0.08))
        const p = { x: lerp(ed.draft.from.x, ed.draft.to.x, k), y: lerp(ed.draft.from.y, ed.draft.to.y, k) }
        draft = { x0: ed.draft.from.x, y0: ed.draft.from.y, x1: p.x, y1: p.y }
        const s = scr(p)
        cur.x = s.x
        cur.y = s.y
        cur.down = 1
      } else if (t < tl.vDown) {
        plan = ed.withRoom(ed.room.points, false, north)
        sel = ed.room.id
        mv(pDraft1, pV0, span(t, tl.draftUp + 0.1, tl.vDown - 0.05))
      } else if (t < tl.vUp) {
        const k = easeInOut(span(t, tl.vDown + 0.08, tl.vUp - 0.08))
        const v = { x: lerp(ed.vFrom.x, ed.vTo.x, k), y: lerp(ed.vFrom.y, ed.vTo.y, k) }
        plan = ed.withRoom(ed.room.points.map((q, i) => (i === ed.vIndex ? v : q)), false, north)
        sel = ed.room.id
        vertex = ed.vIndex
        const s = scr(v)
        cur.x = s.x
        cur.y = s.y
        cur.down = 1
      } else {
        const withDoor = t >= tl.doorClick
        plan = ed.withRoom(ed.moved, withDoor, north)
        sel = t < tl.doorClick - 0.25 ? ed.room.id : null
        mv(pV1, pDoor, span(t, tl.vUp + 0.1, tl.doorClick - 0.08))
        if (t >= tl.doorClick - 0.08 && t < tl.doorClick + 0.12) cur.down = 1
        if (withDoor) doorIn = { id: ed.door.id, k: easeOut((t - tl.doorClick) / 0.35) }
      }
      ui.cursor = cur
    }
    if (t >= grow[0]) plan = ed.final
    // 进素材库前：圆角方块收拢（与素材库开头的展开成对）
    if (t > S.library - 0.25) ui.mask = { mode: 'cover', k: easeInOut((t - (S.library - 0.25)) / 0.25), rot: 3 * easeIn((t - (S.library - 0.25)) / 0.25) }
    if (planO > 0.001) planUi.value = { plan, view: m, sel, vertex, draft, doorIn, north, compass, furn: furnO, unit, o: planO }
    ui.label = { parts: [{ text: L('自定义户型') }], o: showIn(t, E0 - 0.1, grow[0] + 0.2) }
    return { set, view, flat }
  }

  // ----- 8：素材库 -----

  private librarySegment(t: number, set: HouseSet): View {
    const S = SEG
    const zoom0 = S.library + BEAT * 3.4
    const zoom1 = S.library + BEAT * 4.6
    const to3d = [S.library + BEAT * 4.2, S.library + BEAT * 5]
    const pan = easeOut(span(t, S.library, zoom1)) * 0.6 + span(t, S.library, zoom1) * 0.4
    const cardW = Math.min(ui.w, ui.h) * 0.17
    ui.lib = {
      o: 1 - easeInOut(span(t, to3d[0], to3d[1])),
      pan,
      count: Math.round(ASSETS.length * easeOut(span(t, S.library + 0.25, S.library + BEAT * 3.6))),
      focus: easeInOut(span(t, zoom0, zoom1)),
      focusO: 1,
      cardW,
      tilt: -10,
    }
    ui.canvasO = easeInOut(span(t, to3d[0], to3d[1]))
    if (t < S.library + 0.35) ui.mask = { mode: 'reveal', k: easeInOut((t - S.library) / 0.35), rot: -3 * (1 - easeOut((t - S.library) / 0.35)) }
    ui.label = { parts: [{ text: L('{n} 件素材', { n: ASSETS.length.toLocaleString('en-US') }) }, { text: L('{n} 种风格', { n: STYLE_ORDER.length }), on: true }], o: showIn(t, S.library + 0.3, S.cat - 0.15) }
    // 3D：只留展示的沙发
    const sofa = this.showcase ? set.furn.find((o) => o.f.id === this.showcase!.id) : undefined
    if (!sofa) return { target: new THREE.Vector3(set.center.x, 40, set.center.y), az: this.catAz, polar: 1.1, dist: 600, fov: 30 }
    // 和素材库缩略图同一个取景（thumbs.ts：frameCamera 方向 (0.75, 0.62, 1)、包围球贴边）：卡片放大后换成 3D 时形状、大小都对得上
    let box = sofa.obj.userData.showBox as THREE.Box3 | undefined
    if (!box) {
      box = new THREE.Box3().setFromObject(sofa.obj)
      sofa.obj.userData.showBox = box
    }
    const c = box.getCenter(new THREE.Vector3())
    const r = box.getSize(new THREE.Vector3()).length() / 2
    const dThumb = r / Math.sin((15 * Math.PI) / 180)
    const imgPx = 0.92 * Math.min(ui.w, ui.h) * 0.66
    const dist = (dThumb * ui.h) / imgPx
    this.ground.visible = true
    this.ground.position.set(c.x, sofa.base.y + 0.2, c.z)
    const az0 = sofa.obj.rotation.y + Math.atan2(0.75, 1)
    const polar0 = Math.acos(0.62 / Math.hypot(0.75, 0.62, 1))
    // 换成 3D 后开始转：转到切回房子那一刻正好是跟拍无人机的方位
    const t3 = S.library + BEAT * 4.6
    let d = (this.catAz - az0) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    const k = span(t, t3, S.cat)
    const az = az0 + d * (k * k * (3 - 2 * k) * 0.7 + k * 0.3)
    return { target: c, az, polar: lerp(polar0, 1.0, easeInOut(k)), dist: lerp(dist, dist * 1.15, easeInOut(k)), fov: 30 }
  }

  private applyShowcase(t: number) {
    const sc = this.showcase!
    const set = this.catSet!
    const S = SEG
    const inLib = t >= SEG.library && t < SEG.cat
    // 换配色：从 3D 出现后每拍一次（3 次）+ 切回房子时变回原配色（第 4 次）
    const beats = [S.library + BEAT * 5, S.library + BEAT * 6, S.library + BEAT * 7]
    let idx = -1
    for (let i = 0; i < beats.length; i++) if (t >= beats[i]) idx = i
    const active = inLib && idx >= 0 ? sc.models[idx] : sc.orig
    for (const m of [sc.orig, ...sc.models]) {
      if (m !== sc.orig) {
        if (m.parent !== set.furnRoot) set.furnRoot.add(m)
      }
      m.visible = m === active
      m.userData.dropVisible = m === active
    }
    // 素材库段：房子和别的家具都藏起来
    set.house.visible = !inLib
    set.lights.fixtures.visible = !inLib
    set.lights.group.visible = !inLib
    for (const o of set.furn) if (o.obj !== sc.orig) o.obj.userData.dropVisible = !inLib
  }

  // ----- 9：无人机 + 结尾 -----

  /** 无人机在 t 时刻的位置、姿态（全由时间算出，没有状态）；返回机身位置 */
  private flyDrone(t: number) {
    const d = this.drone!
    const S = SEG
    const t0 = S.cat + 0.3
    const t1 = S.cat + 3.1
    const tl = S.cat + 4.3
    const bez = (u: number) => {
      const v = 1 - u
      return d.start.clone().multiplyScalar(v * v * v).add(d.c1.clone().multiplyScalar(3 * v * v * u)).add(d.c2.clone().multiplyScalar(3 * v * u * u)).add(d.hover.clone().multiplyScalar(u * u * u))
    }
    const pos = (tt: number) => {
      if (tt <= t1) return bez(easeInOut(span(tt, t0, t1)))
      return d.hover.clone().lerp(d.at, easeInOut(span(tt, t1 + 0.15, tl)))
    }
    const p = pos(t)
    const e = 1 / 60
    const vel = pos(t + e).sub(pos(t - e)).divideScalar(2 * e)
    const hv = Math.hypot(vel.x, vel.z)
    const root = d.parts.root
    root.visible = true
    d.pad.visible = true
    root.position.copy(p)
    // 朝向：沿航线切线（对参数求导，减速到悬停时方向也不会乱跳），悬停降落的约 1.8s 里缓慢转成侧面对着镜头
    const u = Math.min(0.999, span(t, t0, t1))
    const v = 1 - u
    const tan = d.c1.clone().sub(d.start).multiplyScalar(v * v).add(d.c2.clone().sub(d.c1).multiplyScalar(2 * v * u)).add(d.hover.clone().sub(d.c2).multiplyScalar(u * u))
    const heading = Math.atan2(tan.x, tan.z)
    const fin = this.sideAz + Math.PI / 2
    let dyaw = fin - heading
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
    // 侧面有左右两种：取离进场方向近的那个，最多转 90°
    if (dyaw > Math.PI / 2) dyaw -= Math.PI
    if (dyaw < -Math.PI / 2) dyaw += Math.PI
    const k = easeInOut(span(t, t1 - 0.8, tl + 0.6))
    root.rotation.set(0, heading + dyaw * k, 0)
    // 机身前倾：速度越快倾得越多
    d.parts.body.rotation.set(Math.min(0.28, hv / 260) * (1 - k), 0, 0)
    // 桨：降落前全速，落地后 0.35s 缓停
    const w = 55
    const ang = t < tl ? w * (t - t0) : w * (tl - t0) + w * 0.35 * (1 - Math.exp(-(t - tl) / 0.35))
    d.parts.props.forEach((pr, i) => (pr.rotation.y = (i % 2 ? -1 : 1) * ang + i))
    return p
  }

  private catSegment(t: number, set: HouseSet): View {
    const S = SEG
    const p = this.flyDrone(t)
    // 起始：接着素材库的展示机位（围着沙发转），1.6s 内过渡到跟拍无人机
    const lib = this.librarySegment(S.cat - 1e-3, set)
    ui.lib = null
    ui.label = null
    ui.mask = null
    ui.canvasO = 1
    this.ground.visible = false
    const follow = easeInOut(span(t, S.cat + 0.45, S.cat + 2.1))
    // 跟着无人机，降落前后镜头落到正侧面、压低、靠近垫子
    const side = easeInOut(span(t, S.cat + 1.6, S.cat + 4.2))
    const tgt = p.clone().lerp(this.drone!.at.clone().setY(this.drone!.at.y + 20), easeInOut(span(t, S.cat + 2.6, S.cat + 4.4)))
    const vf = ui.w < ui.h ? 1.45 : 1
    const catV: View = { target: tgt, az: lerp(this.catAz, this.sideAz, side), polar: lerp(0.95, SIDE_POLAR, side), dist: vf * lerp(420, 240, side), fov: 30 }
    let view: View = {
      target: lib.target.clone().lerp(catV.target, follow),
      az: catV.az,
      polar: lerp(lib.polar, catV.polar, follow),
      dist: lerp(lib.dist, catV.dist, follow),
      fov: 30,
    }
    // 结尾：镜头升到俯视，色块从四周收拢
    const rise = easeInOut(span(t, S.cat + 5.2, S.cat + 6.7))
    if (rise > 0) {
      view = { target: view.target.clone().lerp(new THREE.Vector3(p.x, 0, p.z), rise), az: view.az + rise * 0.5, polar: lerp(view.polar, 0.05, rise), dist: lerp(view.dist, 900, rise), fov: 30 }
    }
    const blocks = easeInOut(span(t, S.cat + 5.9, S.cat + 6.7))
    if (blocks > 0) ui.end = { blocks, logo: easeOut(span(t, S.cat + 6.6, S.cat + 7.3)) }
    return view
  }
}

/** 昼夜段的时刻（小时，可超过 24 表示次日）：清晨 → 正午 → 黄昏 → 夜 → 次日清晨，黄昏和夜晚停留久一点 */
function dayTime(t: number) {
  const D = SEG.daynight
  const K: [number, number][] = [
    [D, 10.2],
    [D + 0.55, 13.0],
    [D + 1.2, 17.8],
    [D + 1.7, 19.4],
    [D + 2.25, 22.0],
    [D + 2.7, 26.5],
    [D + 3.3, 29.6],
    [SEG.looks + 0.8, 32.5],
  ]
  if (t <= K[0][0]) return K[0][1]
  for (let i = 1; i < K.length; i++) {
    if (t <= K[i][0]) {
      const k = (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0])
      return lerp(K[i - 1][1], K[i][1], k * k * (3 - 2 * k) * 0.5 + k * 0.5)
    }
  }
  return K[K.length - 1][1]
}

/** 住户卡片的内容：名字 · 年龄 · 职业、风格偏好、兴趣与等级（按等级从高到低，最多 3 项） */
function memberCard(m: Member, shown: InterestId, taken: Set<string>): Omit<HouseCard, 'o' | 'dx'> {
  const its = [...m.interests]
    .map((it: InterestId) => ({ label: t_(INTERESTS[it].label), lv: levelOf(m, it) as number, on: it === shown }))
    .sort((a, b) => b.lv - a.lv)
    .slice(0, 3)
  return { name: personName(m.name, taken), meta: L('{n} 岁 · {job}', { n: m.age, job: t_(JOBS[m.job].label) }), style: t_(STYLE_LABELS[m.style]), color: STYLE_COLORS[m.style], interests: its }
}

/**
 * 住户段要展示的两位成员：每人取等级 ≥ 3、套装确实摆在 TA 自己风格房间里的那项兴趣（命中的家具按体积排，最多 3 件），
 * 风格互不相同；按套装体积从大到小排（最显眼的先出场）。vol 是框出来那几件的总体积（cm³）。
 */
function pickPeople(p: Plan) {
  const hh = p.household!
  const styles = roomStyles(p, hh)
  // 一眼就认得出是什么爱好的大件，按「显眼程度」加权：直播的绿幕 / 柔光箱 / 落地补光灯最好认，乐器、健身器械其次；
  // 电竞桌常被柜子挡住、望远镜摆在家里显得刻意，降权或不计
  const WEIGHTS: [RegExp, number][] = [
    [/green-screen|绿幕|softbox|柔光|ring-light|补光|mic-boom/i, 3],
    [/piano|钢琴|drum|鼓|guitar|吉他|treadmill|跑步机|power-rack|rowing|划船|spin-bike|exercise-bike/i, 1.5],
    [/camera-showcase|easel|画架|sewing|缝纫|aquarium|鱼缸|水族|server-rack|mahjong|麻将|go-table|棋桌/i, 1],
    [/pc-(full|mid)|monitor-gaming|gaming-chair|电竞/i, 0.4],
    [/telescope|望远镜/i, 0],
  ]
  const vol = (f: Plan['furniture'][number]) => {
    const d = ASSET_MAP.get(f.asset)
    if (!d) return 0
    // 其余兴趣物件也算一点（保证每个人都有东西可框），但远不如上面这些
    const w = WEIGHTS.find(([re]) => re.test(f.asset + d.name))?.[1] ?? 0.15
    return w * d.w * d.d * (d.h ?? 40)
  }
  const out: { m: Member; it: InterestId; room: Room; ids: string[]; vol: number }[] = []
  const used = new Set<string>()
  for (const m of hh.members) {
    let best: { score: number; it: InterestId; room: Room; items: Plan['furniture'] } | null = null
    for (const it of m.interests) {
      const lv = levelOf(m, it)
      if (lv < 1) continue
      const def = INTERESTS[it]
      // 等级套装里的选择器（标签 / id 前缀正则），加上带这个兴趣标签（hobby:<id>）的素材
      const sels: Sel[] = (INTEREST_TIERS[it] ?? []).slice(0, lv).flatMap((tier) => [...(tier.floor ?? []), ...(tier.wall ?? []), ...(tier.props ?? [])])
      const tagged = !!(def.floor?.tagged || def.props?.tagged)
      // 只框立在地上或摆在台面上的（壁挂的框在地上看不出是哪件）
      const cats = [...(def.floor?.cats ?? []), ...(def.props?.cats ?? [])] as string[]
      const hits = p.furniture.filter((f) => {
        const d = ASSET_MAP.get(f.asset)
        return d && !d.mount && (sels.some((sel) => matchSel(d, sel)) || (tagged && hasTag(d, `hobby:${it}` as Tag)) || cats.includes(d.category))
      })
      const byRoom = new Map<string, { room: Room; items: Plan['furniture'] }>()
      for (const f of hits) {
        const room = roomAt(p, f)
        if (!room || styles.get(room.id) !== m.style) continue
        const g = byRoom.get(room.id) ?? { room, items: [] }
        g.items.push(f)
        byRoom.set(room.id, g)
      }
      for (const g of byRoom.values()) {
        g.items = g.items.filter((f) => vol(f) > 0)
        if (!g.items.length) continue
        g.items.sort((a, b) => vol(b) - vol(a))
        const score = g.items.slice(0, 3).reduce((s, f) => s + vol(f), 0)
        if (!best || score > best.score) best = { score, it, ...g }
      }
    }
    if (!best || used.has(m.style)) continue
    used.add(m.style)
    const items = best.items.slice(0, 3)
    out.push({ m, it: best.it, room: best.room, ids: items.map((f) => f.id), vol: best.score })
  }
  return out.sort((a, b) => b.vol - a.vol).slice(0, 2)
}
