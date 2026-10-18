// 第一人称漫游：以人的视角在户型里走动。
//   - 能走的地方：除挑空以外的房间（含卫浴、收纳、阳台；阳台从落地窗出去），由 nav.ts 的 walk 网格判断，
//     碰到墙和家具时贴着滑过去，不穿模。
//   - 地面高度跟着脚下的房间走（玄関土间低一截），眼睛高度缓动过去，跨台阶不会一下跳。
//   - 楼梯：走到起步口（或上层的出梯口）朝楼梯方向走，就沿 stairs.ts 的 stairWalk 路线上下楼，前后键沿楼梯前进后退。
//   - 操作和 FPS 游戏一样：点一下画面锁定鼠标，移动鼠标看四周；WASD / 方向键前后左右平移，Shift 跑；
//     Esc 先释放鼠标，再按一次退出（沙盘处理）。触屏左下摇杆走、其余地方拖动看四周。
// 沙盘（Sandbox3D.vue）负责进出时切换墙体显示、楼层显示和天花板，这里只管位置、朝向和输入。

import * as THREE from 'three'
import { centroid, pointInPolygon, type Plan, type Vec } from '../model'
import { floorAbove, floorOf, isMultiFloor, planFloors } from '../floors'
import { HouseNav, type NavGrid } from '../nav'
import { slabHoles, type StairWalk } from '../stairs'
import { toon } from './toon'

/** 眼睛离地高度、身体半径（cm） */
const EYE = 155
const BODY_R = 12
/** 比这矮的落地家具（鞋、浴凳、玩具）跨过去，不挡路 */
const STEP_OVER = 30
/** 步行 / 跑步速度（cm/s） */
const WALK_V = 140
const RUN_V = 300
/** 离楼梯口多近、朝着楼梯走就踏上楼梯 */
const STAIR_REACH = 35

export interface WalkHost {
  /** 某层地面的世界高度 */
  lift(floor: string): number
  /** 走到了另一层（沙盘跟着切当前层） */
  onFloor(floor: string): void
}

/** 楼梯上的状态：沿路线的弧长 s；dir = 前进键往哪走（+1 上楼、-1 下楼） */
interface OnStair {
  w: StairWalk
  cum: number[]
  s: number
  dir: 1 | -1
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
  private stair: OnStair | null = null
  private vel = { x: 0, y: 0 }

  constructor(
    plan: Plan,
    private camera: THREE.PerspectiveCamera,
    private host: WalkHost,
  ) {
    this.nav = new HouseNav(plan, { sash: true, stepOver: STEP_OVER })
    const start = startPoint(plan, this.nav)
    this.floor = start.floor
    this.pos = start.p
    this.yaw = start.yaw
    this.eyeY = this.groundY() + EYE
    this.apply()
  }

  private grid(): NavGrid {
    return this.nav.grid(this.floor)
  }

  private groundY() {
    return this.host.lift(this.floor) + this.grid().floorAt(this.pos)
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
    return !!this.stair
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

    let target: number
    if (this.stair) target = this.climb(f, fwd * v * dt, dt)
    else {
      this.slide(step)
      this.enterStairs(step)
      target = this.stair ? this.stairY() : this.groundY() + EYE
    }
    this.eyeY += (target - this.eyeY) * (1 - Math.exp(-dt * 12))
    // 走路的起伏：按走过的距离推进相位，停下、上下楼时幅度收回
    const speed = this.stair ? 0 : Math.hypot(this.vel.x, this.vel.y)
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

  /** 按小步走，被挡住时分别试 x、y 方向（贴着墙滑过去）；出生点卡在障碍里时允许往空处走 */
  private slide(d: Vec) {
    const L = Math.hypot(d.x, d.y)
    if (L < 1e-4) return
    const n = Math.ceil(L / 3)
    const sx = d.x / n
    const sy = d.y / n
    const g = this.grid()
    for (let i = 0; i < n; i++) {
      const p = this.pos
      const stuck = !this.ok(p)
      const better = (q: Vec) => (stuck ? g.clearAt('walk', q) > g.clearAt('walk', p) : this.ok(q))
      const both = { x: p.x + sx, y: p.y + sy }
      if (better(both)) this.pos = both
      else if (better({ x: p.x + sx, y: p.y })) this.pos = { x: p.x + sx, y: p.y }
      else if (better({ x: p.x, y: p.y + sy })) this.pos = { x: p.x, y: p.y + sy }
      else break
    }
  }

  /** 站在楼梯口、朝楼梯方向走：踏上楼梯 */
  private enterStairs(d: Vec) {
    const L = Math.hypot(d.x, d.y)
    if (L < 1e-4) return
    for (const w of this.nav.links) {
      const n = w.pts.length
      if (n < 2) continue
      const up = w.from === this.floor
      if (!up && w.to !== this.floor) continue
      const end = up ? w.entry : w.exit
      if (Math.hypot(this.pos.x - end.x, this.pos.y - end.y) > STAIR_REACH) continue
      const next = up ? w.pts[Math.min(n - 1, 3)] : w.pts[Math.max(0, n - 4)]
      const tx = next.x - end.x
      const ty = next.y - end.y
      const tl = Math.hypot(tx, ty) || 1
      if ((d.x * tx + d.y * ty) / (L * tl) < 0.35) continue
      const cum = [0]
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(w.pts[i].x - w.pts[i - 1].x, w.pts[i].y - w.pts[i - 1].y))
      this.stair = { w, cum, s: up ? 0 : cum[n - 1], dir: up ? 1 : -1 }
      this.floor = w.from
      this.pos = this.stairPoint()
      return
    }
  }

  /**
   * 楼梯上：前进键沿楼梯往 dir 方向走、后退键反过来（拐角平台处朝向和走向垂直也照样走）；
   * 明显朝着楼梯的另一头时（掉头了）换方向。走动时镜头顺着楼梯的拐弯转过去。走到头就换层。
   */
  private climb(f: Vec, along: number, dt: number): number {
    const st = this.stair!
    const { w, cum } = st
    const i = this.stairIndex()
    const a = w.pts[Math.max(0, i - 2)]
    const b = w.pts[Math.min(w.pts.length - 1, i + 2)]
    const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = { x: (b.x - a.x) / tl, y: (b.y - a.y) / tl }
    const facing = f.x * t.x + f.y * t.y
    if (Math.abs(facing) > 0.5) st.dir = facing > 0 ? 1 : -1
    st.s += along * st.dir
    if (along) {
      // 朝向缓缓转到楼梯的走向（后退时仍面朝前方）
      const want = Math.atan2(-t.x * st.dir, -t.y * st.dir)
      let d = want - this.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.yaw += d * (1 - Math.exp(-dt * 4))
    }
    const total = cum[cum.length - 1]
    if (st.s >= total) return this.leaveStairs(w.to, w.exit)
    if (st.s <= 0) return this.leaveStairs(w.from, w.entry)
    this.pos = this.stairPoint()
    return this.stairY()
  }

  private leaveStairs(floor: string, at: Vec) {
    this.stair = null
    const changed = floor !== this.floor
    this.floor = floor
    this.pos = this.grid().nearest('walk', at, BODY_R, 60) ?? { ...at }
    if (changed) this.host.onFloor(floor)
    return this.groundY() + EYE
  }

  private stairIndex() {
    const { cum, s } = this.stair!
    let i = 0
    while (i + 1 < cum.length && cum[i + 1] < s) i++
    return i
  }

  private stairSample() {
    const { w, cum, s } = this.stair!
    const i = this.stairIndex()
    const j = Math.min(w.pts.length - 1, i + 1)
    const t = cum[j] > cum[i] ? (s - cum[i]) / (cum[j] - cum[i]) : 0
    const a = w.pts[i]
    const b = w.pts[j]
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
  }

  private stairPoint(): Vec {
    const q = this.stairSample()
    return { x: q.x, y: q.y }
  }

  private stairY() {
    return this.host.lift(this.stair!.w.from) + this.stairSample().z + EYE
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
      this.locked = on
      if (!on) this.keys.clear()
      onLock(on)
    }
    const mmove = (e: MouseEvent) => {
      if (this.locked) this.look(e.movementX, e.movementY, 0.0022)
    }
    // 触屏：落在左下区域是摇杆，其余拖动看四周
    let lookId: number | null = null
    let last = { x: 0, y: 0 }
    let stickId: number | null = null
    let origin = { x: 0, y: 0 }
    const R = 56
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (!this.locked) el.requestPointerLock?.()
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
        this.look((e.clientX - last.x) * 0.7, (e.clientY - last.y) * 0.7)
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
export function startPoint(plan: Plan, nav: HouseNav): { floor: string; p: Vec; yaw: number } {
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
    if (!p) continue
    const yaw = Math.atan2(-(center.x - p.x), -(center.y - p.y))
    return { floor, p, yaw: Math.hypot(center.x - p.x, center.y - p.y) < 1 ? 0 : yaw }
  }
  return { floor: planFloors(plan)[0].id, p: center, yaw: 0 }
}

/**
 * 漫游时盖在各个户内房间上的天花板（不投影、不受阴影，只挡住上面的天空 / 上层楼板的背面）。
 * 上一层楼板开洞的地方（楼梯洞口、挑空）不盖，抬头看得到上层、楼梯走得上去。
 */
export function ceilings(plan: Plan, heightOf: (floor: string) => number): THREE.Group {
  const g = new THREE.Group()
  const mat = toon('#f3efe8')
  mat.side = THREE.DoubleSide
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
function ceilingGeometry(pts: Vec[], holes: Vec[][]): THREE.BufferGeometry | null {
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
