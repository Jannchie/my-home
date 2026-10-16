// 结尾的猫：用 critters 的骨架和姿势，按固定脚本走一条导航网格算出的路线，到窗边伸懒腰、趴下。
// 状态从 t0 起按固定步长推进；时间倒退时从头重算，所以任意时刻的画面都是确定的。

import * as THREE from 'three'
import { applyPose, buildCreature, clonePose, emptyMotion, finishActorModel, lerpPose, poseFor, type Motion, type Pose, type PoseName, type Rig } from '../three/critters'
import type { NavGrid } from '../nav'
import type { Vec } from '../model'

const TAU = Math.PI * 2
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI

export interface CatScript {
  path: Vec[]
  /** 开始走、走到终点的时刻（秒，片子时间） */
  walk: [number, number]
  /** 停下后伸懒腰的时长、之后趴下的姿势 */
  stretch: number
  rest: PoseName
  /** 到终点后面朝的方向（rotation.y） */
  face: number
}

export class PromoCat {
  root = new THREE.Group()
  rig: Rig
  private pose: Pose
  private motion: Motion = emptyMotion()
  private simT = -Infinity
  private h = 0
  private s = 0
  private walkW = 0
  private phase = 0
  private lens: number[] = []
  private total = 0

  constructor(
    private nav: NavGrid,
    private sc: CatScript,
    pal = ['#f4a259', '#fff4e6', '#d9792b', '#d9792b'],
  ) {
    this.rig = buildCreature('cat', pal)
    finishActorModel(this.rig.root)
    this.root.add(this.rig.root)
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2b2030', transparent: true, opacity: 0.16, depthWrite: false }))
    sh.scale.set(this.rig.breed.girth * 1.25, 1, this.rig.breed.len * 0.75)
    sh.position.y = 0.35
    sh.userData.noOutline = true
    this.root.add(sh)
    this.pose = poseFor(this.rig.breed, 'stand')
    let acc = 0
    this.lens = [0]
    for (let i = 1; i < sc.path.length; i++) {
      acc += Math.hypot(sc.path[i].x - sc.path[i - 1].x, sc.path[i].y - sc.path[i - 1].y)
      this.lens.push(acc)
    }
    this.total = acc
  }

  /** 路线上距离 d 处的点 */
  at(d: number): Vec {
    const p = this.sc.path
    d = Math.max(0, Math.min(this.total, d))
    let i = 1
    while (i < p.length - 1 && this.lens[i] < d) i++
    const a = p[i - 1]
    const b = p[i]
    const L = this.lens[i] - this.lens[i - 1] || 1
    const k = (d - this.lens[i - 1]) / L
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
  }

  /** 走过的距离：两端缓起缓停 */
  private dist(t: number) {
    const [a, b] = this.sc.walk
    const u = Math.max(0, Math.min(1, (t - a) / (b - a)))
    // 起步 / 停下各占 18% 的时间，中间匀速
    const r = 0.18
    const v = 1 / (1 - r)
    let s: number
    if (u < r) s = (v * u * u) / (2 * r)
    else if (u > 1 - r) s = 1 - (v * (1 - u) * (1 - u)) / (2 * r)
    else s = v * (u - r / 2)
    return s * this.total
  }

  get position() {
    return this.root.position
  }

  update(t: number) {
    const dt = 1 / 120
    if (t < this.simT || !Number.isFinite(this.simT)) {
      this.simT = this.sc.walk[0] - 0.5
      const p0 = this.at(0)
      const p1 = this.at(20)
      this.h = Math.atan2(p1.x - p0.x, p1.y - p0.y)
      this.s = 0
      this.walkW = 0
      this.phase = 0
      this.pose = poseFor(this.rig.breed, 'stand')
      this.motion = emptyMotion()
    }
    while (this.simT < t) {
      this.simT = Math.min(t, this.simT + dt)
      this.step(this.simT, dt)
    }
    const p = this.at(this.s)
    this.root.position.set(p.x, this.nav.floorAt(p), p.y)
    this.root.rotation.set(0, this.h, 0)
  }

  private step(t: number, dt: number) {
    const b = this.rig.breed
    const s1 = this.dist(t)
    const speed = (s1 - this.s) / dt
    this.s = s1
    const [, end] = this.sc.walk
    const arrived = t >= end
    // 朝向：看向前方 25cm 的点；到了之后转向 face
    let hT = this.h
    if (!arrived && this.s < this.total - 2) {
      const q = this.at(this.s + 25)
      const p = this.at(this.s)
      hT = Math.atan2(q.x - p.x, q.y - p.y)
    } else hT = this.sc.face
    this.h += wrap(hT - this.h) * Math.min(1, dt * (arrived ? 3 : 6))

    let poseName: PoseName = 'stand'
    if (arrived) {
      const k = t - end
      if (k > 0.25 && k < 0.25 + this.sc.stretch) poseName = 'stretch'
      else if (k >= 0.25 + this.sc.stretch) poseName = this.sc.rest
    }
    const tgt = poseFor(b, poseName)
    if (poseName === this.sc.rest && t - end > this.sc.stretch + 1.4) tgt.eyes = 0.15
    lerpPose(this.pose, tgt, 1 - Math.exp(-dt * (poseName === 'stretch' ? 4 : 5)))
    const m = this.motion
    m.t += dt
    const moving = speed > 1
    this.walkW += ((moving ? Math.min(1, speed / (b.walk * 0.5)) : 0) - this.walkW) * Math.min(1, dt * 8)
    this.phase += (TAU * speed * dt) / (b.leg * 2.6)
    m.gait = this.walkW
    m.phase = this.phase
    m.run = 0
    m.breathe = poseName === this.sc.rest ? 0.8 : 0.35
    m.wag += ((!moving ? 0.25 : 0) - m.wag) * Math.min(1, dt * 3)
    m.earFlick = 0
    applyPose(this.rig, clonePose(this.pose), m)
  }
}
