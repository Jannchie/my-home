// 第一人称漫游：以人的视角在户型里走动。
//   - 能走的地方：除挑空以外的房间（含卫浴、收纳、阳台；阳台从落地窗出去），由 nav.ts 的 walk 网格判断，
//     碰到墙和家具时贴着滑过去，不穿模。房门按现在的开合挡人（WalkHost.blockers）：关着的过不去，开着的门扇绕着走。
//   - 地面高度跟着脚下的房间走（玄関土间低一截），眼睛高度缓动过去，跨台阶不会一下跳。
//   - 楼梯：和平地一样自由走，脚下的高度取踩着的那级踏面（stairs.ts 的 stairLayout）；高差太大的地方（梯段之间、
//     楼梯侧面）跨不过去，扶手挡人。下层从踏步低的一头踏上去，上层只能从出梯口下去。不沿路线拉着走、不自动转向。
//   - 操作和 FPS 游戏一样：点一下画面锁定鼠标，移动鼠标看四周；WASD / 方向键前后左右平移，Shift 跑；
//     Esc 先释放鼠标，再按一次退出（沙盘处理）。触屏左下摇杆走、其余地方拖动看四周。
// 沙盘（Sandbox3D.vue）负责进出时切换墙体显示、楼层显示和天花板，这里只管位置、朝向和输入。

import * as THREE from 'three'
import { centroid, edgesOf, fixtureBox, onBoundary, pointInPolygon, projectToSegment, type Box, type Plan, type Room, type Vec } from '../model'
import { SLAB, floorAbove, floorOf, floorView, isMultiFloor, planFloors } from '../floors'
import { HouseNav, type NavGrid } from '../nav'
import { slabHoles, stairFootprint, stairLayout, stairToWorld, type StairWalk } from '../stairs'
import { toon } from './toon'
import { ASSET_MAP } from './assets'
import { furnitureBox } from '../snap'

/** 头顶到上层楼板底至少留的距离（cm）：楼梯有一段在上层楼板边下面，眼睛按踏步高度算会钻进楼板里，这时低一下头 */
const HEADROOM = 12
/** 眼睛离地高度、身体半径（cm） */
const EYE = 155
const BODY_R = 12
/** 比这矮的落地家具（鞋、浴凳、玩具）跨过去，不挡路 */
const STEP_OVER = 30
/** 步行 / 跑步速度（cm/s） */
const WALK_V = 140
const RUN_V = 300
/** 一步能跨上 / 跨下的高差（cm）：比一级踏步高一点，梯段之间、楼梯侧面跨不过去 */
const STEP_UP = 30
/** 上层踏进楼梯 / 从楼梯走到上层：离出梯口这么近才算从出梯口过（cm） */
const ARRIVE = 8
/**
 * 出梯口外侧这么深的一条（cm）当楼梯的延伸：出梯口紧挨着挑空边、墙角时，上层网格离出梯口一两拃才站得下，
 * 这一条里按上层地面高度走，走到站得下的地方才算上了楼（反过来从上层也经这一条踏上楼梯）
 */
const STRIP = 30
/** 鼠标锁定刚开始的这段时间（ms）不认鼠标位移；单次位移超过这个（像素）且远大于最近的平均值时当作浏览器的毛刺丢掉 */
const LOCK_SETTLE_MS = 100
const SPIKE_PX = 120

export interface WalkHost {
  /** 某层地面的世界高度 */
  lift(floor: string): number
  /** 走到了另一层（沙盘跟着切当前层） */
  onFloor(floor: string): void
  /** 某层现在挡路的门板（关着、半开的房门；平面坐标的线段），不填 = 门洞都走得过 */
  blockers?(floor: string): [Vec, Vec][]
}

/** 一段楼梯（平面坐标）：踏面、扶手、占地、出梯口，和占地边上当墙的点（不是楼梯口的那几段） */
interface Flight {
  from: string
  to: string
  rise: number
  foot: Vec[]
  steps: { poly: Vec[]; top: number }[]
  rails: [Vec, Vec][]
  arrival: [Vec, Vec]
  /** 从下层看：里面的踏面高过 STEP_UP 的那几段边（采样点）；从上层看：出梯口以外的边 */
  edge: { lower: Vec[]; upper: Vec[] }
  /** 出梯口朝外（上层地面那边）的单位法线 */
  out: Vec
}

/** 脚下的踏面高度（离下层地面）：几级踏面都沾边时取最接近 near 的；不在踏面上是地面（0） */
function stepTop(fl: Flight, q: Vec, near: number) {
  let best = 0
  let bd = Infinity
  for (const s of fl.steps) {
    if (!pointInPolygon(q, s.poly) && !onBoundary(s.poly, q, 0.5)) continue
    const d = Math.abs(s.top - near)
    if (d < bd) {
      bd = d
      best = s.top
    }
  }
  return best
}

function flightOf(l: StairWalk): Flight {
  const L = stairLayout(l.stair, l.rise)
  const w = stairToWorld(l.stair)
  const foot = stairFootprint(l.stair)
  const fl: Flight = {
    from: l.from,
    to: l.to,
    rise: l.rise,
    foot,
    steps: L.steps.map((s) => ({ poly: s.poly.map(w), top: s.top })),
    rails: L.rails.flatMap((r) => r.pts.slice(1).map((b, i) => [w(r.pts[i]), w(b)] as [Vec, Vec])),
    arrival: [w(L.arrival[0]), w(L.arrival[1])],
    edge: { lower: [], upper: [] },
    out: { x: 0, y: 0 },
  }
  const c = centroid(foot)
  const [a, b] = fl.arrival
  const al = Math.hypot(b.x - a.x, b.y - a.y) || 1
  fl.out = { x: -(b.y - a.y) / al, y: (b.x - a.x) / al }
  if (fl.out.x * (a.x - c.x) + fl.out.y * (a.y - c.y) < 0) fl.out = { x: -fl.out.x, y: -fl.out.y }
  for (const e of edgesOf(foot)) {
    const n = Math.max(1, Math.ceil(e.length / 4))
    for (let k = 0; k <= n; k++) {
      const m = { x: e.a.x + ((e.b.x - e.a.x) * k) / n, y: e.a.y + ((e.b.y - e.a.y) * k) / n }
      const l2 = Math.hypot(c.x - m.x, c.y - m.y) || 1
      const inner = { x: m.x + ((c.x - m.x) / l2) * 3, y: m.y + ((c.y - m.y) / l2) * 3 }
      if (stepTop(fl, inner, 0) > STEP_UP) fl.edge.lower.push(m)
      if (segD(m, fl.arrival) > 1) fl.edge.upper.push(m)
    }
  }
  return fl
}

/** 在出梯口外侧那一条里（不含楼梯占地） */
function inStrip(fl: Flight, q: Vec) {
  const [a, b] = fl.arrival
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)
  const d = (q.x - a.x) * fl.out.x + (q.y - a.y) * fl.out.y
  return t >= 0 && t <= 1 && d > 0 && d <= STRIP
}

function segD(p: Vec, s: [Vec, Vec]) {
  return projectToSegment(p, s[0], s[1]).d
}

/**
 * 鼠标锁定时的位移过滤：Chrome（尤其 Windows）偶尔会给出一次几百像素的 movementX / Y，视角会一下子横着或竖着跳。
 * 锁定刚开始的一小段不认；之后单次位移超过 SPIKE_PX 且远大于最近的平均值时当作毛刺丢掉。
 */
export class MouseFilter {
  private since = -Infinity
  private avg = 8
  reset(now: number) {
    this.since = now
    this.avg = 8
  }
  accept(dx: number, dy: number, now: number) {
    if (now - this.since < LOCK_SETTLE_MS) return false
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    if (m > SPIKE_PX && m > this.avg * 6) return false
    this.avg += (m - this.avg) * 0.2
    return true
  }
}

export class Walker {
  readonly nav: HouseNav
  floor: string
  pos: Vec
  yaw = 0
  pitch = 0
  /** 摇杆输入（-1..1，y 向前为正）；触屏时由 attach 填 */
  readonly stick = { x: 0, y: 0 }
  private eyeY: number
  /** 走路时镜头的上下起伏（相位、幅度 0..1） */
  private bob = 0
  private bobAmp = 0
  /** 鼠标锁定中（FPS 式看四周）；最近一次解锁的时间（沙盘据此分辨释放鼠标的 Esc 和退出的 Esc） */
  locked = false
  unlockedAt = 0
  private keys = new Set<string>()
  private flights: Flight[]
  /** 在楼梯上：哪段楼梯、脚下踏面离下层地面多高（这时 floor 是楼梯的下层） */
  private on: { fl: Flight; h: number } | null = null
  /** 每层头顶的上层楼板：楼板底下沿的楼层（上一层）、楼板开洞的地方（楼梯洞口、挑空，头顶是空的） */
  private overhead = new Map<string, { above: string; open: Vec[][] }>()
  private vel = { x: 0, y: 0 }
  /** 这一帧挡路的门板 */
  private doors: [Vec, Vec][] = []
  /** 按住拖着门 / 抽屉时：鼠标、手指不转视角 */
  holdLook = false

  constructor(
    plan: Plan,
    private camera: THREE.PerspectiveCamera,
    private host: WalkHost,
  ) {
    this.nav = new HouseNav(plan, { sash: true, stepOver: STEP_OVER, freeStairs: true })
    this.flights = this.nav.links.map(flightOf)
    for (const f of planFloors(plan)) {
      const above = floorAbove(plan, f.id)
      if (above) this.overhead.set(f.id, { above: above.id, open: slabHoles(plan, above.id) })
    }
    const start = startPoint(plan, this.nav, (floor, p) => this.flights.some((fl) => (fl.from === floor || fl.to === floor) && pointInPolygon(p, fl.foot)))
    this.floor = start.floor
    this.pos = start.p
    this.yaw = start.yaw
    this.eyeY = this.groundY() + EYE
    this.apply()
  }

  private grid(): NavGrid {
    return this.nav.grid(this.floor)
  }

  /** 头顶上层楼板的底面高度（世界坐标）；在楼梯洞口、挑空下面，或最上层，返回 Infinity */
  private ceilingY(floor: string, p: Vec) {
    const o = this.overhead.get(floor)
    if (!o || o.open.some((h) => pointInPolygon(p, h))) return Infinity
    return this.host.lift(o.above) - SLAB
  }

  private groundY() {
    return this.on ? this.host.lift(this.on.fl.from) + this.on.h : this.host.lift(this.floor) + this.grid().floorAt(this.pos)
  }

  private ok(p: Vec) {
    return this.grid().canStand('walk', p, BODY_R)
  }

  /** 按下 / 松开一个移动键（w a s d、方向键、shift，小写） */
  hold(key: string, on: boolean) {
    if (on) this.keys.add(key)
    else this.keys.delete(key)
  }

  /** 楼梯上吗（测试、界面用） */
  get onStairs() {
    return !!this.on
  }

  /** 转动视角（像素；k = 每像素多少弧度） */
  look(dx: number, dy: number, k = 0.0042) {
    this.yaw -= dx * k
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k))
  }

  /** 推进一帧；返回镜头是否动了 */
  update(dt: number): boolean {
    const k = this.keys
    let fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + this.stick.y
    let side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.stick.x
    const l = Math.hypot(fwd, side)
    if (l > 1) {
      fwd /= l
      side /= l
    }
    const before = { x: this.pos.x, y: this.pos.y, yaw: this.yaw, eye: this.camera.position.y }
    this.doors = this.host.blockers?.(this.floor) ?? []
    const v = k.has('shift') ? RUN_V : WALK_V
    // 平面上的前、右（镜头默认朝 -z，平面 y 对应世界 z）
    const f = { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) }
    const r = { x: -f.y, y: f.x }
    const want = { x: (f.x * fwd + r.x * side) * v, y: (f.y * fwd + r.y * side) * v }
    // 起步、停下带一点惯性，不会一顿一顿的
    const a = 1 - Math.exp(-dt * 12)
    this.vel.x += (want.x - this.vel.x) * a
    this.vel.y += (want.y - this.vel.y) * a
    const step = { x: this.vel.x * dt, y: this.vel.y * dt }

    this.slide(step)
    // 头顶是上层楼板（还没走到楼梯洞口底下）：眼睛压到楼板底下，不钻进楼板里
    // 脚还在上层楼板底下才算（楼梯最后一段已经踩到上层地面上，头顶就不是这块楼板了）
    const feet = this.groundY()
    const slab = this.ceilingY(this.floor, this.pos)
    const ceil = feet < slab - 1 ? slab - HEADROOM : Infinity
    const target = Math.min(feet + EYE, ceil)
    this.eyeY += (target - this.eyeY) * (1 - Math.exp(-dt * 12))
    // 平滑跟不上的那几帧也不能钻进楼板（走得快时一下就到了楼板边下面）
    this.eyeY = Math.min(this.eyeY, ceil)
    // 走路的起伏：按走过的距离推进相位，停下时幅度收回
    const speed = Math.hypot(this.vel.x, this.vel.y)
    this.bob += speed * dt * 0.045
    this.bobAmp += ((speed > 20 ? 1 : 0) - this.bobAmp) * (1 - Math.exp(-dt * 8))
    this.apply()
    return Math.abs(before.x - this.pos.x) + Math.abs(before.y - this.pos.y) > 0.01 || before.yaw !== this.yaw || Math.abs(before.eye - this.camera.position.y) > 0.05 || this.pitchMoved()
  }

  private lastPitch = 0
  private pitchMoved() {
    const m = this.lastPitch !== this.pitch
    this.lastPitch = this.pitch
    return m
  }

  /** 按小步走，被挡住时分别试 x、y 方向（贴着墙、扶手滑过去） */
  private slide(d: Vec) {
    const L = Math.hypot(d.x, d.y)
    if (L < 1e-4) return
    const n = Math.ceil(L / 3)
    const sx = d.x / n
    const sy = d.y / n
    for (let i = 0; i < n; i++) {
      const p = this.pos
      if (!this.step({ x: p.x + sx, y: p.y + sy }) && !this.step({ x: p.x + sx, y: p.y }) && !this.step({ x: p.x, y: p.y + sy })) break
    }
  }

  /** 走一小步到 q：走得过去就走过去（含踏上 / 走下楼梯、换层），返回是否走了 */
  private step(q: Vec): boolean {
    const p = this.pos
    const on = this.on
    if (on) {
      const fl = on.fl
      if (pointInPolygon(q, fl.foot)) {
        const h = stepTop(fl, q, on.h)
        if (Math.abs(h - on.h) > STEP_UP || this.railBlocks(fl, p, q)) return false
        on.h = h
        this.pos = q
        this.setFloor(fl.from)
        return true
      }
      // 出梯口外侧那一条：按上层地面走，站得下了就算上了楼
      if (on.h >= fl.rise - STEP_UP && inStrip(fl, q)) {
        on.h = fl.rise
        this.pos = q
        if (this.nav.grid(fl.to).canStand('walk', q, BODY_R)) {
          this.on = null
          this.setFloor(fl.to)
        }
        return true
      }
      // 走出楼梯占地：低的一头接下层地面，顶上从出梯口接上层地面
      const to = on.h <= STEP_UP ? fl.from : on.h >= fl.rise - STEP_UP && segD(q, fl.arrival) < ARRIVE ? fl.to : null
      if (!to || !this.nav.grid(to).canStand('walk', q, BODY_R)) return false
      this.on = null
      this.setFloor(to)
      this.pos = q
      return true
    }
    // 上层：出梯口跟前站不下的那一条，当楼梯的延伸走进去（不换层）
    for (const fl of this.flights)
      if (fl.to === this.floor && inStrip(fl, q) && !this.ok(q)) {
        this.on = { fl, h: fl.rise }
        this.pos = q
        return true
      }
    for (const fl of this.flights) {
      const up = fl.from === this.floor
      if ((!up && fl.to !== this.floor) || !pointInPolygon(q, fl.foot)) continue
      // 下层：踏上低的那几级；上层：只从出梯口踏上最上面几级（别处是楼梯洞口）
      const h = stepTop(fl, q, up ? 0 : fl.rise)
      if (up ? h > STEP_UP : h < fl.rise - STEP_UP || segD(p, fl.arrival) > ARRIVE) return false
      if (this.railBlocks(fl, p, q)) return false
      this.on = { fl, h }
      this.setFloor(fl.from)
      this.pos = q
      return true
    }
    // 楼梯占地边上不是楼梯口的那几段当墙；出生点卡在障碍里时允许往空处走
    if (this.edgeBlocks(p, q) || this.doorBlocks(p, q)) return false
    const g = this.grid()
    if (this.ok(p) ? !this.ok(q) : g.clearAt('walk', q) <= g.clearAt('walk', p)) return false
    this.pos = q
    return true
  }

  /** 离扶手不到身体半径、还在往扶手靠 */
  private railBlocks(fl: Flight, p: Vec, q: Vec) {
    return fl.rails.some((r) => {
      const d = segD(q, r)
      return d < BODY_R && d < segD(p, r)
    })
  }

  /** 离楼梯占地边（当墙的那几段）不到身体半径、还在往那靠 */
  private edgeBlocks(p: Vec, q: Vec) {
    for (const fl of this.flights) {
      const pts = fl.from === this.floor ? fl.edge.lower : fl.to === this.floor ? fl.edge.upper : null
      if (!pts) continue
      for (const m of pts) {
        const d = Math.hypot(q.x - m.x, q.y - m.y)
        if (d < BODY_R && d < Math.hypot(p.x - m.x, p.y - m.y)) return true
      }
    }
    return false
  }

  /** 离门板不到身体半径、还在往门板靠（关着的门过不去，开着的门扇绕着走） */
  private doorBlocks(p: Vec, q: Vec) {
    return this.doors.some((s) => {
      const d = segD(q, s)
      return d < BODY_R && d < segD(p, s)
    })
  }

  private setFloor(floor: string) {
    if (floor === this.floor) return
    this.floor = floor
    this.doors = this.host.blockers?.(floor) ?? []
    this.host.onFloor(floor)
  }

  private apply() {
    const c = this.camera
    c.position.set(this.pos.x, this.eyeY + Math.sin(this.bob) * 1.6 * this.bobAmp, this.pos.y)
    c.rotation.order = 'YXZ'
    c.rotation.set(this.pitch, this.yaw, 0)
    c.updateMatrixWorld()
  }

  /**
   * 接上输入：键盘（window）、鼠标锁定看四周（点一下画面锁定）、触屏摇杆和拖动看四周。
   * onStick 在摇杆出现 / 移动 / 收起时回调（屏幕坐标，给界面画摇杆）；onLock 在鼠标锁定 / 释放时回调。返回解绑函数。
   */
  attach(el: HTMLElement, onStick: (s: { x: number; y: number; dx: number; dy: number } | null) => void, onLock: (locked: boolean) => void = () => {}) {
    const KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'])
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const k = e.key.toLowerCase()
      if (!KEYS.has(k)) return
      this.hold(k, true)
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => this.hold(e.key.toLowerCase(), false)
    const blur = () => this.keys.clear()
    // 鼠标：点一下锁定指针，之后鼠标移动直接转视角（movementX / Y）
    const lockChange = () => {
      const on = document.pointerLockElement === el
      if (this.locked && !on) this.unlockedAt = performance.now()
      if (on && !this.locked) filter.reset(performance.now())
      this.locked = on
      if (!on) this.keys.clear()
      onLock(on)
    }
    const filter = new MouseFilter()
    const mmove = (e: MouseEvent) => {
      if (this.locked && filter.accept(e.movementX, e.movementY, performance.now()) && !this.holdLook) this.look(e.movementX, e.movementY, 0.0022)
    }
    // 触屏：落在左下区域是摇杆，其余拖动看四周
    let lookId: number | null = null
    let last = { x: 0, y: 0 }
    let stickId: number | null = null
    let origin = { x: 0, y: 0 }
    const R = 56
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        // 原始鼠标输入（不经过系统指针加速），也能避开大部分位移毛刺；浏览器不支持时退回普通锁定
        if (!this.locked) Promise.resolve(el.requestPointerLock?.({ unadjustedMovement: true })).catch(() => el.requestPointerLock?.())
        return
      }
      const b = el.getBoundingClientRect()
      const x = e.clientX - b.left
      const y = e.clientY - b.top
      if (stickId === null && x < b.width * 0.45 && y > b.height * 0.4) {
        stickId = e.pointerId
        origin = { x, y }
        onStick({ x, y, dx: 0, dy: 0 })
      } else if (lookId === null) {
        lookId = e.pointerId
        last = { x: e.clientX, y: e.clientY }
      } else return
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    const pmove = (e: PointerEvent) => {
      if (e.pointerId === lookId) {
        // 触屏手指移动幅度大，转得慢一点
        if (!this.holdLook) this.look((e.clientX - last.x) * 0.7, (e.clientY - last.y) * 0.7)
        last = { x: e.clientX, y: e.clientY }
      } else if (e.pointerId === stickId) {
        const b = el.getBoundingClientRect()
        let dx = e.clientX - b.left - origin.x
        let dy = e.clientY - b.top - origin.y
        const l = Math.hypot(dx, dy)
        if (l > R) {
          dx *= R / l
          dy *= R / l
        }
        this.stick.x = dx / R
        this.stick.y = -dy / R
        onStick({ ...origin, dx, dy })
      }
    }
    const pup = (e: PointerEvent) => {
      if (e.pointerId === lookId) lookId = null
      if (e.pointerId === stickId) {
        stickId = null
        this.stick.x = this.stick.y = 0
        onStick(null)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('pointerlockchange', lockChange)
    document.addEventListener('mousemove', mmove)
    el.addEventListener('pointerdown', pdown)
    el.addEventListener('pointermove', pmove)
    el.addEventListener('pointerup', pup)
    el.addEventListener('pointercancel', pup)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('pointerlockchange', lockChange)
      document.removeEventListener('mousemove', mmove)
      if (document.pointerLockElement === el) document.exitPointerLock()
      el.removeEventListener('pointerdown', pdown)
      el.removeEventListener('pointermove', pmove)
      el.removeEventListener('pointerup', pup)
      el.removeEventListener('pointercancel', pup)
      this.keys.clear()
    }
  }
}

/**
 * 出生点：玄关里离房子中心最近的能站处，面朝房子中心；没有玄关就在最大的起居房间中央。
 * 多层户型从玄关所在层（一般是最底层）开始。
 */
export function startPoint(plan: Plan, nav: HouseNav, avoid: (floor: string, p: Vec) => boolean = () => false): { floor: string; p: Vec; yaw: number } {
  const indoor = plan.rooms.filter((r) => r.kind !== 'balcony' && r.kind !== 'void')
  const center = centroid((indoor.length ? indoor : plan.rooms).flatMap((r) => r.points))
  const size = (pts: Vec[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2
  const entry = plan.rooms.find((r) => r.kind === 'entrance')
  const living = [...indoor].sort((a, b) => (['ldk', 'western', 'japanese'].includes(b.kind) ? 1 : 0) - (['ldk', 'western', 'japanese'].includes(a.kind) ? 1 : 0) || size(b.points) - size(a.points))[0]
  for (const room of [entry, living, ...indoor].filter(Boolean)) {
    const floor = isMultiFloor(plan) ? floorOf(plan, room!) : planFloors(plan)[0].id
    const g = nav.grid(floor)
    const c = centroid(room!.points)
    // 从房间中心往房子中心挪一点（玄关里站在上框边一侧，正对走廊）
    const toward = { x: c.x + (center.x - c.x) * 0.15, y: c.y + (center.y - c.y) * 0.15 }
    const p = g.nearest('walk', pointInPolygon(toward, room!.points) ? toward : c, BODY_R, 150)
    if (!p || avoid(floor, p)) continue
    const yaw = Math.atan2(-(center.x - p.x), -(center.y - p.y))
    return { floor, p, yaw: Math.hypot(center.x - p.x, center.y - p.y) < 1 ? 0 : yaw }
  }
  return { floor: planFloors(plan)[0].id, p: center, yaw: 0 }
}

/**
 * 漫游时盖在各个户内房间上的天花板（不投影、不受阴影，只挡住上面的天空 / 上层楼板的背面）。
 * 上一层楼板开洞的地方（楼梯洞口、挑空）不盖，抬头看得到上层、楼梯走得上去。
 */
let ceilingMat: THREE.MeshToonMaterial | null = null
/**
 * 天花板材质：双面（只有朝下的一面）；室内灯（点光源）只照到三成——吸顶灯的光源离天花板只有几厘米、正对着它，
 * 照满了整面天花板会过曝（真实的吸顶灯也主要往下照）。复制一份 toon 材质，不动共享缓存里的那份
 */
function ceilingMaterial() {
  if (ceilingMat) return ceilingMat
  const src = toon('#f3efe8') as THREE.MeshToonMaterial
  const m = src.clone()
  m.side = THREE.DoubleSide
  m.onBeforeCompile = (sh, r) => {
    src.onBeforeCompile(sh, r)
    if (sh.uniforms.lmPointScale) sh.uniforms.lmPointScale.value = 0.3
  }
  m.customProgramCacheKey = () => 'walk-ceiling'
  ceilingMat = m
  return m
}

export function ceilings(plan: Plan, heightOf: (floor: string) => number): THREE.Group {
  const g = new THREE.Group()
  const mat = ceilingMaterial()
  const multi = isMultiFloor(plan)
  const holesOf = new Map<string, Vec[][]>()
  for (const f of planFloors(plan)) {
    const above = floorAbove(plan, f.id)
    holesOf.set(f.id, above ? slabHoles(plan, above.id) : [])
  }
  for (const r of plan.rooms) {
    if (r.kind === 'balcony' || r.kind === 'void' || r.points.length < 3) continue
    const floor = multi ? floorOf(plan, r) : planFloors(plan)[0].id
    const geo = ceilingGeometry(r.points, holesOf.get(floor) ?? [])
    if (!geo) continue
    const m = new THREE.Mesh(geo, mat)
    m.position.y = heightOf(floor) - 0.5
    m.castShadow = false
    m.receiveShadow = false
    m.raycast = () => {}
    g.add(m)
  }
  return g
}

/**
 * 一个房间的天花板几何体（世界坐标 (x, 0, y)）。没碰到洞口就是整块多边形；碰到时按房间和洞口的顶点坐标切成格子，
 * 去掉中心落在洞口里的格子（房间都是横平竖直的，洞口是楼梯占地或挑空房间，格子切得准）。
 */
export function ceilingGeometry(pts: Vec[], holes: Vec[][]): THREE.BufferGeometry | null {
  const xs0 = pts.map((p) => p.x)
  const ys0 = pts.map((p) => p.y)
  const box = { x0: Math.min(...xs0), y0: Math.min(...ys0), x1: Math.max(...xs0), y1: Math.max(...ys0) }
  const hit = holes.filter((h) => h.some((p) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1) || pts.some((p) => pointInPolygon(p, h)) || pointInPolygon({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, h))
  let geo: THREE.BufferGeometry
  if (!hit.length) geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y))))
  else {
    const cut = (vs: number[], lo: number, hi: number) => [...new Set(vs.filter((v) => v >= lo && v <= hi).map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b)
    const xs = cut([...xs0, ...hit.flat().map((p) => p.x)], box.x0, box.x1)
    const ys = cut([...ys0, ...hit.flat().map((p) => p.y)], box.y0, box.y1)
    const pos: number[] = []
    for (let i = 0; i + 1 < xs.length; i++)
      for (let j = 0; j + 1 < ys.length; j++) {
        const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
        if (!pointInPolygon(c, pts) || hit.some((h) => pointInPolygon(c, h))) continue
        const [a, b, d, e] = [xs[i], xs[i + 1], ys[j], ys[j + 1]]
        pos.push(a, d, 0, b, d, 0, b, e, 0, a, d, 0, b, e, 0, a, e, 0)
      }
    if (!pos.length) return null
    geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.computeVertexNormals()
  }
  // 平面 (x, y) → 世界 (x, h, y)：绕 x 轴转 +90°
  geo.rotateX(Math.PI / 2)
  return geo
}

// ---------- 小地图 ----------

/** 小地图要画的东西（按楼层算一次）：房间、落地家具和设备的占地 */
export interface MiniMapData {
  rooms: Room[]
  boxes: Box[]
}

export function miniMapData(plan: Plan, floor: string): MiniMapData {
  const view = isMultiFloor(plan) ? floorView(plan, floor) : plan
  const boxes: Box[] = []
  for (const f of view.furniture) {
    const d = ASSET_MAP.get(f.asset)
    if (!d || f.z || d.mount || d.stick || d.h < 30) continue
    boxes.push(furnitureBox(f.asset, f.x, f.y, f.rot))
  }
  for (const fx of view.fixtures) if (!fx.id.startsWith('stair-clear-')) boxes.push(fixtureBox(fx))
  return { rooms: view.rooms, boxes }
}

const MINI_FILL: Partial<Record<Room['kind'], string>> = {
  balcony: '#dfe7d6',
  bath: '#d6e6ee',
  wash: '#d6e6ee',
  toilet: '#d6e6ee',
  kitchen: '#efe3cf',
  entrance: '#e6ded3',
  hall: '#ece6dc',
  storage: '#e2ddd5',
  void: 'rgba(0, 0, 0, 0)',
}

/**
 * 画小地图：以自己为中心、前方朝上的圆形地图（半径 range cm）。房间按用途上浅色，墙线、家具占地，中间是自己和视野扇形。
 * size：画布的 CSS 边长；画布本身按 dpr 放大。
 */
export function drawMiniMap(ctx: CanvasRenderingContext2D, d: MiniMapData, pos: Vec, yaw: number, size: number, dpr: number, range = 450, fov = 72) {
  const c = size / 2
  const k = c / range
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, c - 1, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(40, 38, 34, 0.55)'
  ctx.fill()
  ctx.clip()
  ctx.save()
  ctx.translate(c, c)
  ctx.rotate(yaw)
  ctx.scale(k, k)
  ctx.translate(-pos.x, -pos.y)
  const path = (pts: Vec[]) => {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
  }
  for (const r of d.rooms) {
    path(r.points)
    ctx.fillStyle = MINI_FILL[r.kind] ?? '#f4efe6'
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(120, 104, 86, 0.55)'
  for (const b of d.boxes) ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
  ctx.strokeStyle = '#4a4036'
  ctx.lineWidth = 2.2 / k
  ctx.lineJoin = 'round'
  for (const r of d.rooms) {
    if (r.kind === 'void') continue
    path(r.points)
    ctx.stroke()
  }
  ctx.restore()
  // 自己：视野扇形 + 箭头（前方朝上）
  const half = (fov * Math.PI) / 360
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.7)
  g.addColorStop(0, 'rgba(255, 214, 120, 0.55)')
  g.addColorStop(1, 'rgba(255, 214, 120, 0)')
  ctx.beginPath()
  ctx.moveTo(c, c)
  ctx.arc(c, c, c * 0.7, -Math.PI / 2 - half, -Math.PI / 2 + half)
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(c, c - 7)
  ctx.lineTo(c + 5, c + 5)
  ctx.lineTo(c, c + 2.5)
  ctx.lineTo(c - 5, c + 5)
  ctx.closePath()
  ctx.fillStyle = '#ff8a3d'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(c, c, c - 1, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 2
  ctx.stroke()
}
