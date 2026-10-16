// 宣传片时间线：给定时刻 t（秒），把 3D 场景和界面叠层设置成那一刻的样子。
// 节拍：96 BPM，一拍 0.625s、一小节 2.5s；段落和切点都卡在拍点上（BGM 见 scripts/promo-bgm.py）。

import * as THREE from 'three'
import { reactive, shallowRef } from 'vue'
import { HouseSet, PromoScene, CUT_H, type View } from './scene'
import { basePlan, furnished } from './plans'
import { PromoCat } from './cat'
import { NavGrid } from '../nav'
import { furnitureModel, placeFurniture, roomAt } from '../three/house'
import { ASSETS, ASSET_MAP, STYLE_LABELS, type StyleTag } from '../three/assets'
import { allPalettes } from '../three/stylePalettes'
import { thumbnail } from '../three/thumbs'
import { LOOK_MAP, type LookId } from '../three/post'
import { DEFAULT_GEO, skyState } from '../three/sky'
import { STYLE_ORDER } from '../three/stylePalettes'
import { add, bbox, centroid, edgeInfo, edgesOf, mul, pointInPolygon, uid, type Plan, type Room, type Vec } from '../model'
import { isIndoor } from '../walls'

export const BEAT = 60 / 96
export const BAR = BEAT * 4
export const DURATION = 63
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
const showIn = (t: number, a: number, b: number, f = 0.3) => Math.min(easeOut((t - a) / f), easeOut((b - t) / f))

// ---------- 段落 ----------
export const SEG = {
  empty: 0,
  furnish: BAR, // 2.5
  styles: BAR * 4, // 10
  regions: BAR * 8, // 20
  daynight: BAR * 11, // 27.5
  looks: BAR * 14, // 35
  plan: BAR * 17, // 42.5
  library: BAR * 20, // 50
  cat: BAR * 22, // 55
  end: BAR * 25, // 62.5
}

const STYLE_CUTS: StyleTag[] = ['cute', 'nordic', 'japanese', 'industrial', 'retro', 'chinese', 'classic', 'farmhouse']
const FIRST_STYLE: StyleTag = 'modern'
const FINAL_STYLE: StyleTag = 'nordic'
const LOOK_CUTS: LookId[] = ['tiltshift', 'film', 'watercolor', 'comic', 'pixel', 'sketch']
const REGION_NAMES = ['日式', '中式', '欧美']
const CAT_TIME = 17.0

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
  bg: '#f4f1ea',
  dark: false,
  /** 右下角小字标 */
  brand: 0,
  label: null as null | { parts: { text: string; on?: boolean; dim?: boolean }[]; o: number },
  clock: null as null | { o: number; time: number },
  mask: null as null | { mode: 'cover' | 'reveal'; k: number },
  cursor: null as null | { x: number; y: number; down: number; o: number },
  lib: null as null | { o: number; pan: number; count: number; focus: number; focusO: number; cardW: number; tilt: number },
  end: null as null | { blocks: number; logo: number },
})
export const planUi = shallowRef<PlanUi | null>(null)
export const libCards = shallowRef<LibCard[]>([])

// ---------- 导演 ----------
export class Director {
  scene: PromoScene
  sets = new Map<string, HouseSet>()
  private plans = new Map<string, Plan>()
  private lastT = -1
  private lastSet: HouseSet | null = null
  private cat: PromoCat | null = null
  private catSet: HouseSet | null = null
  private showcase: { id: string; colors: number[]; orig: THREE.Object3D; models: THREE.Object3D[] } | null = null
  private ground: THREE.Mesh
  private catAz = 0
  private edit!: ReturnType<Director['planEdit']>
  libFocus = { id: '', i: 0 }

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
  }

  // ----- 素材准备 -----

  async init(progress: (s: string) => void) {
    const A = basePlan('cn', 2024, 100, 130)
    this.plans.set('A:' + FIRST_STYLE, furnished(A, 2024, FIRST_STYLE))
    for (const st of [...STYLE_CUTS]) this.plans.set('A:' + st, furnished(A, 2024, st))
    progress('regions')
    this.plans.set('jp', furnished(basePlan('jp', 491, 90, 110, '3LDK'), 491))
    this.plans.set('cn', furnished(basePlan('cn', 5150, 100, 130), 5150))
    const W = furnished(basePlan('west', 306, 110, 140), 306)
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
    const north = 32
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
    // 终点：LDK 朝阳台的落地窗（没有就用任意一扇窗）前 50cm
    let best: { at: Vec; face: number; score: number; out: Vec } | null = null
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
      const at = add(c, mul(inward, 55))
      // 面朝窗外：rotation.y 的前方是 (sin h, cos h)
      const face = Math.atan2(-inward.x, -inward.y)
      const score = (balcony ? 2 : 0) + o.width / 200
      if (nav.clearAt('pet', at) >= 14 && (!best || score > best.score)) best = { at, face, score, out: mul(inward, -1) }
    }
    // 户型朝向：让这扇窗正对傍晚的太阳（略偏一点），猫停下的地方有一片斜进来的阳光
    if (best) {
      const bearing = skyState(CAT_TIME, 6, 21, DEFAULT_GEO, 0).bearing
      const a = (Math.atan2(best.out.x, -best.out.y) * 180) / Math.PI - bearing + 28 + 180
      const north = ((a % 360) + 360) % 360
      for (const [k, pl] of this.plans) if (k.startsWith('A:')) pl.north = north
    }
    // 起点：离终点最远的居室中心（卧室 → 客厅）
    const beds = p.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese')
    let start: Vec | null = null
    let path: Vec[] | null = null
    const target = best?.at ?? centroid(ldk.points)
    const cand = beds
      .map((r) => {
        const c = centroid(r.points)
        const pp = nav.path('pet', c, target, 18)
        return { c, pp, len: pp ? pp.reduce((s, q, i) => (i ? s + Math.hypot(q.x - pp[i - 1].x, q.y - pp[i - 1].y) : 0), 0) : Infinity }
      })
      .filter((x) => x.pp && x.len > 300)
      .sort((a, b) => a.len - b.len)
    if (cand.length) {
      start = cand[0].c
      path = cand[0].pp
    }
    if (!path || !start) path = [centroid(ldk.points), target]
    // 路线太长就从后半段开始（大约 4m 内走完）
    const total = path.reduce((s, q, i) => (i ? s + Math.hypot(q.x - path![i - 1].x, q.y - path![i - 1].y) : 0), 0)
    const keep = Math.min(total, 520)
    const trimmed = trimFromEnd(path, keep)
    this.cat = new PromoCat(nav, { path: trimmed, walk: [SEG.cat + 0.2, SEG.cat + 3.6], stretch: 1.2, rest: 'loaf', face: best?.face ?? 0 })
    this.catSet = set
    // 布置里自带的猫（静态模型 / 猫窝里蜷着的猫）藏起来，只留走动的这一只
    for (const o of set.furn) {
      const act = ASSET_MAP.get(o.f.asset)?.actor
      if (act?.kind !== 'cat') continue
      if (act.role === 'body') o.obj.userData.mountHidden = true
      else o.obj.traverse((n) => { if (n.userData.actorPart) n.visible = false })
    }
    // 跟拍方位：从猫最后面朝窗外的方向的斜后方看（窗户那面外墙在远处，不会被压低）
    this.catAz = (best?.face ?? 0) + Math.PI - 0.7
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

  private async prepareLibrary() {
    // 素材网格：在全部素材里按类别轮流取，覆盖面广；第一张固定放展示用的沙发
    const byCat = new Map<string, string[]>()
    for (const a of ASSETS) {
      if (a.fixture || a.id.startsWith('act-')) continue
      const l = byCat.get(a.category) ?? []
      if (!l.some((x) => ASSET_MAP.get(x)?.family && ASSET_MAP.get(x)!.family === a.family)) l.push(a.id)
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
    ui.canvasO = 1
    ui.brand = 0
    planUi.value = null
    this.ground.visible = false
    if (this.cat) this.cat.root.visible = false
    let look: LookId = 'none'
    let time = 10.2
    let set: HouseSet
    let view: View
    let mode: 'half' | 'down' = 'half'
    let cut = CUT_H
    /** 墙体按哪个方向压低（默认跟镜头走；跟拍猫时固定，镜头转动时窗户那面墙不会忽然被压低） */
    let wallsFrom: THREE.Vector3 | null = null
    let flat = 0

    const azAt = (tt: number) => -0.5 + 0.11 * tt
    const orbit = (s: HouseSet, tt: number, polar: number, k = 1, az = azAt(tt)): View => ({ target: new THREE.Vector3(s.center.x, 30, s.center.y), az, polar: this.pol(polar), dist: this.fitDist(s, this.pol(polar)) * k, fov: 30 })

    if (t < S.styles) {
      // 1–2：空房子环绕 → 家具逐件落下
      set = this.set('A:' + FIRST_STYLE)
      view = orbit(set, t, 0.98, lerp(1.04, 0.96, easeInOut(t / S.styles)))
      this.dropFurniture(set, t)
      ui.brand = showIn(t, 0.35, S.furnish + 0.4, 0.4)
      if (t > S.furnish) ui.label = { parts: [{ text: '一键布置' }], o: showIn(t, S.furnish + 0.5, S.styles - 0.2) }
      // 开场：圆角方块展开
      if (t < 0.45) ui.mask = { mode: 'reveal', k: easeOut(t / 0.45) }
    } else if (t < S.regions) {
      // 3：同一户型快切住户风格，镜头不停
      const i = Math.min(STYLE_CUTS.length - 1, Math.floor((t - S.styles) / (BEAT * 2)))
      set = this.set('A:' + STYLE_CUTS[i])
      this.resetFurniture(set)
      view = orbit(set, t, 0.98, 0.96)
      ui.label = { parts: [{ text: '9 种风格' }, { text: STYLE_LABELS[STYLE_CUTS[i]], on: true }], o: showIn(t, S.styles + 0.15, S.regions - 0.25) }
      if (t > S.regions - 0.2) ui.mask = { mode: 'cover', k: easeIn((t - (S.regions - 0.2)) / 0.2) }
    } else if (t < S.daynight) {
      // 4：日式 / 中式 / 欧美
      const i = Math.min(2, Math.floor((t - S.regions) / BAR))
      set = this.set(['jp', 'cn', 'west'][i])
      this.resetFurniture(set)
      view = orbit(set, t, 0.82, 0.98)
      ui.label = { parts: REGION_NAMES.map((n, k) => ({ text: n, dim: k !== i })), o: showIn(t, S.regions + 0.35, S.daynight - 0.2) }
      if (t < S.regions + 0.3) ui.mask = { mode: 'reveal', k: easeOut((t - S.regions) / 0.3) }
    } else if (t < S.looks) {
      // 5：昼夜流转
      set = this.set('west')
      this.resetFurniture(set)
      view = orbit(set, t, lerp(0.82, 0.86, easeInOut(span(t, S.daynight, S.daynight + 2))), 0.98, azAt(S.daynight) + lerp(0.11, 0.06, easeInOut(span(t, S.daynight, S.daynight + 1.5))) * (t - S.daynight))
      time = dayTime(t)
      ui.clock = { o: showIn(t, S.daynight + 0.3, S.looks - 0.2), time }
      ui.label = { parts: [{ text: '昼夜光照' }], o: showIn(t, S.daynight + 0.3, S.looks - 0.2) }
    } else if (t < S.plan) {
      // 6：画面效果，镜头慢推
      set = this.set('west')
      this.resetFurniture(set)
      const k = easeInOut(span(t, S.looks, S.plan))
      const az0 = azAt(S.daynight) + 0.06 * (S.looks - S.daynight)
      view = orbit(set, t, lerp(0.86, 0.9, k), lerp(0.98, 0.74, k), az0 + 0.05 * (t - S.looks))
      time = dayTime(t)
      const i = Math.min(LOOK_CUTS.length - 1, Math.floor((t - S.looks) / (BEAT * 2)))
      look = LOOK_CUTS[i]
      ui.label = { parts: [{ text: '画面效果' }, { text: LOOK_MAP.get(look)!.label, on: true }], o: showIn(t, S.looks + 0.15, S.plan - 0.2) }
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
      wallsFrom = new THREE.Vector3(set.center.x + Math.sin(this.catAz) * 2000, 0, set.center.y + Math.cos(this.catAz) * 2000)
    } else {
      // 9：猫
      set = this.set('A:' + FINAL_STYLE)
      this.resetFurniture(set)
      time = CAT_TIME + 0.25 * span(t, S.cat, S.end)
      wallsFrom = new THREE.Vector3(set.center.x + Math.sin(this.catAz) * 2000, 0, set.center.y + Math.cos(this.catAz) * 2000)
      view = this.catSegment(t, set)
    }

    if (set !== this.lastSet) {
      sc.show(set)
      this.lastSet = set
    }
    // 压平：整套房子沿高度压扁（墙、家具、设备一起），平面图从下面接上
    set.root.scale.y = Math.max(0.002, 1 - flat)
    if (this.showcase && set === this.catSet) this.applyShowcase(t)
    sc.setView(view)
    this.occlude(set, t >= S.cat ? view.target : null)
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
  /** 跟拍猫时，挡在镜头和猫之间的高家具藏起来（同沙盘的「前墙透明」思路） */
  private occlude(set: HouseSet, focus: THREE.Vector3 | null) {
    const cam = this.scene.stage.camera.position
    const ray = new THREE.Ray()
    const hit = new THREE.Vector3()
    const fixtures = set.house.children[set.house.children.length - 1]?.children ?? []
    const items = [...set.furn.map((o) => o.obj), ...fixtures]
    for (const obj of items) {
      const fixture = fixtures.includes(obj)
      obj.userData.occluded = false
      if (fixture) obj.visible = true
      if (!focus) continue
      let box = obj.userData.box as THREE.Box3 | undefined
      if (!box) {
        box = new THREE.Box3().setFromObject(obj).expandByScalar(6)
        obj.userData.box = box
      }
      if (box.max.y < 45 || box.containsPoint(focus)) continue
      const len = cam.distanceTo(focus)
      ray.set(cam, focus.clone().sub(cam).normalize())
      if (ray.intersectBox(box, hit) && cam.distanceTo(hit) < len - 20) {
        obj.userData.occluded = true
        if (fixture) obj.visible = false
      }
    }
  }
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
    const D = SEG.styles - 0.75 - t0
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
    const grow = [S.library - BEAT * 2.6, S.library - 0.25] // 长回去
    const ed = this.edit
    const west = this.set('west')
    const edited = this.set('west-edit')
    // 起点机位：上一段结束时的样子
    const az0 = -0.5 + 0.11 * S.daynight + 0.06 * (S.looks - S.daynight) + 0.05 * (S.plan - S.looks)
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
      draftDown: E0 + 0.35,
      draftUp: E0 + 1.25,
      vDown: E0 + 1.85,
      vUp: E0 + 2.55,
      doorClick: E0 + 3.15,
      nDown: E0 + 3.75,
      nUp: E0 + 4.45,
    }
    let plan: Plan = west.plan
    let sel: string | null = null
    let vertex: number | null = null
    let draft: PlanUi['draft'] = null
    let doorIn: PlanUi['doorIn'] = null
    let north = west.plan.north ?? 0
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
    const nAng = (a: number) => ({ x: compass.x + Math.sin((a * Math.PI) / 180) * compass.r * 0.78, y: compass.y - Math.cos((a * Math.PI) / 180) * compass.r * 0.78 })
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
      } else if (t < tl.nDown) {
        const withDoor = t >= tl.doorClick
        plan = ed.withRoom(ed.moved, withDoor, north)
        sel = t < tl.doorClick - 0.25 ? ed.room.id : null
        mv(pV1, pDoor, span(t, tl.vUp + 0.1, tl.doorClick - 0.08))
        if (t >= tl.doorClick - 0.08 && t < tl.doorClick + 0.12) cur.down = 1
        if (withDoor) {
          doorIn = { id: ed.door.id, k: easeOut((t - tl.doorClick) / 0.35) }
          if (t > tl.doorClick + 0.2) mv(pDoor, nAng(0), span(t, tl.doorClick + 0.2, tl.nDown - 0.05))
        }
      } else {
        const k = easeInOut(span(t, tl.nDown + 0.06, tl.nUp - 0.06))
        north = lerp(0, ed.north, k)
        plan = ed.withRoom(ed.moved, true, north)
        const s = nAng(north)
        cur.x = s.x
        cur.y = s.y
        cur.down = t < tl.nUp ? 1 : 0
        if (t >= tl.nUp) {
          plan = ed.final
          north = ed.north
        }
      }
      ui.cursor = cur
    }
    if (t >= grow[0]) {
      plan = ed.final
      north = ed.north
    }
    if (planO > 0.001) planUi.value = { plan, view: m, sel, vertex, draft, doorIn, north, compass, furn: furnO, unit, o: planO }
    ui.label = { parts: [{ text: '自定义户型' }], o: showIn(t, E0 - 0.1, grow[0] + 0.2) }
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
    if (t < S.library + 0.3) ui.mask = { mode: 'reveal', k: easeOut((t - S.library) / 0.3) }
    ui.label = { parts: [{ text: `${ASSETS.length.toLocaleString('en-US')} 件素材` }, { text: `${STYLE_ORDER.length} 种风格`, on: true }], o: showIn(t, S.library + 0.3, S.cat - 0.15) }
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
    // 换成 3D 后开始转：转到切回房子那一刻正好是跟拍猫的方位，并带着跟拍段开头的角速度
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
    if (this.cat) this.cat.root.visible = !inLib && t >= SEG.cat
  }

  // ----- 9：猫 + 结尾 -----

  private catSegment(t: number, set: HouseSet): View {
    const S = SEG
    const cat = this.cat!
    if (cat.root.parent !== set.root) set.root.add(cat.root)
    cat.update(t)
    cat.root.visible = true
    const p = cat.position
    // 起始：接着素材库的展示机位（围着沙发转），1.2s 内过渡到跟拍猫
    const lib = this.librarySegment(S.cat - 1e-3, set)
    ui.lib = null
    ui.label = null
    ui.mask = null
    ui.canvasO = 1
    this.ground.visible = false
    const follow = easeInOut(span(t, S.cat + 0.45, S.cat + 2.1))
    const tgt = new THREE.Vector3(p.x, p.y + 22, p.z)
    const catV: View = { target: tgt, az: this.catAz + 0.32 * (t - S.cat) * (1 - follow * 0.75), polar: 0.98, dist: (ui.w < ui.h ? 1.45 : 1) * lerp(360, 290, easeInOut(span(t, S.cat + 2.4, S.cat + 4.6))), fov: 30 }
    let view: View = {
      target: lib.target.clone().lerp(catV.target, follow),
      az: catV.az,
      polar: lerp(lib.polar, catV.polar, follow),
      dist: lerp(lib.dist, catV.dist, follow),
      fov: 30,
    }
    // 结尾：镜头升到俯视，色块从四周收拢
    const rise = easeInOut(span(t, S.cat + 5.0, S.cat + 6.6))
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
  const K: [number, number][] = [
    [SEG.daynight, 10.2],
    [SEG.daynight + 1.2, 13.5],
    [SEG.daynight + 2.6, 17.9],
    [SEG.daynight + 3.6, 19.4],
    [SEG.daynight + 4.7, 22.0],
    [SEG.daynight + 5.4, 26.5],
    [SEG.daynight + 6.6, 29.6],
    [SEG.looks + 1.2, 32.5],
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

function trimFromEnd(path: Vec[], keep: number): Vec[] {
  const out: Vec[] = [path[path.length - 1]]
  let acc = 0
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i]
    const b = path[i - 1]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    if (acc + d >= keep) {
      const k = (keep - acc) / d
      out.unshift({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
      return out
    }
    acc += d
    out.unshift(b)
  }
  return out
}
