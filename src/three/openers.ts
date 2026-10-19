// 沙盘里一扇扇门、一个个抽屉的开合：每个会动的部件单独开关、单独调开合程度（0 = 关上，1 = 开到底），带缓动动画。
//   - 家具的部件（kit.ts movable：柜门、抽屉、翻门、推拉门）按「家具 id + 部件下标（kit.ts doorParts 的顺序）」记；
//     没动过的部件跟着家具的 open（存档里的整体开关）。
//   - 房门（house.ts buildOpenings 里带 doorPart 标记的组）按洞口 id 记；没动过的门按 doorMotion.ts defaultDoorOpen。
//   - 开合只在这次打开的沙盘里有效（不进存档、不进撤销）；房子 / 家具模型重建后照样摆回去。
//   - 抽屉拉出时，抽屉格里的东西由沙盘跟着挪（onPart 回调），模型本身只管部件。
//   - segments：第一人称漫游按房门现在的开合挡人（门板线段，平面坐标）。

import * as THREE from 'three'
import type { Vec } from '../model'
import { defaultDoorOpen, doorSegments, type DoorGeom } from '../doorMotion'
import { doorParts, poseDoor } from './kit'
import { poseOpening, type OpeningInfo } from './house'

/** 一个会动的东西：家具部件或房门 */
export type OpenKey = string
export const furnKey = (id: string, part: number): OpenKey => `f:${id}:${part}`
export const doorKey = (id: string): OpenKey => `o:${id}`

interface Live {
  /** 只摆模型（不挪抽屉里的东西）：拖动时试探屏幕方向用 */
  pose: (v: number) => void
  /** 摆到某个开合程度（连同抽屉里的东西） */
  apply: (v: number) => void
  /** 现在摆在多少 */
  cur: number
  /** 没动过时的开合程度 */
  base: number
  /** 拾取 / 高亮用的对象 */
  objs: THREE.Object3D[]
}

/** 动画速度：每秒最少走开合程度的这么多，剩下的按指数缓动收尾 */
const MIN_SPEED = 0.6
const EASE = 9

export class Openers {
  /** 动过的部件要摆到的开合程度（会话内保存） */
  private want = new Map<OpenKey, number>()
  private live = new Map<OpenKey, Live>()
  private moving = new Set<OpenKey>()
  /** 房门的几何和所在楼层（漫游挡人用） */
  private doors = new Map<string, { geom: DoorGeom; floor: string }>()

  constructor(private onPart: (furnitureId: string, part: number, v: number, base: number) => void = () => {}) {}

  /** 房子重建后：找出所有房门，按记下的开合摆好 */
  bindHouse(root: THREE.Object3D) {
    for (const k of [...this.live.keys()]) if (k.startsWith('o:')) this.live.delete(k)
    this.doors.clear()
    const groups = new Map<string, THREE.Object3D[]>()
    root.traverse((o) => {
      if (!o.userData.doorPart) return
      const info = o.userData.info as OpeningInfo
      let list = groups.get(info.o.id)
      if (!list) groups.set(info.o.id, (list = []))
      list.push(o)
      let f: THREE.Object3D | null = o
      while (f && f.userData.floorId === undefined) f = f.parent
      this.doors.set(info.o.id, { geom: info, floor: (f?.userData.floorId as string) ?? '' })
    })
    for (const [id, objs] of groups) {
      const info = objs[0].userData.info as OpeningInfo
      const base = defaultDoorOpen(info.o)
      const key = doorKey(id)
      const v = this.want.get(key) ?? base
      const pose = (x: number) => objs.forEach((o) => poseOpening(o, x))
      const live: Live = { pose, apply: pose, cur: v, base, objs }
      this.live.set(key, live)
      if (v !== base) live.apply(v)
    }
    for (const k of this.moving) if (!this.live.has(k)) this.moving.delete(k)
  }

  /** 家具模型建好 / 重建后：登记它的部件，动过的摆回去。open = 家具存档里的整体开关 */
  bindFurniture(id: string, root: THREE.Object3D, open: boolean) {
    this.unbindFurniture(id, false)
    const base = open ? 1 : 0
    doorParts(root).forEach((o, i) => {
      const key = furnKey(id, i)
      const v = this.want.get(key) ?? base
      const live: Live = {
        pose: (x) => poseDoor(o, x),
        apply: (x) => {
          poseDoor(o, x)
          this.onPart(id, i, x, base)
        },
        cur: v,
        base,
        objs: [o],
      }
      this.live.set(key, live)
      if (v !== base) live.apply(v)
    })
  }

  /** 家具删掉了 / 整体开关变了（forget）：不再管它的部件 */
  unbindFurniture(id: string, forget = true) {
    const pre = `f:${id}:`
    for (const k of [...this.live.keys()])
      if (k.startsWith(pre)) {
        this.live.delete(k)
        this.moving.delete(k)
      }
    if (forget) for (const k of [...this.want.keys()]) if (k.startsWith(pre)) this.want.delete(k)
  }

  /** 所有家具部件回到存档里的样子（进入布置模式时：摆放按存档的位置算） */
  resetFurniture() {
    for (const [k, l] of this.live)
      if (k.startsWith('f:') && this.want.has(k)) {
        l.cur = l.base
        l.apply(l.base)
        this.moving.delete(k)
      }
    for (const k of [...this.want.keys()]) if (k.startsWith('f:')) this.want.delete(k)
  }

  has(key: OpenKey) {
    return this.live.has(key)
  }
  /** 现在摆在多少 */
  value(key: OpenKey) {
    return this.live.get(key)?.cur ?? 0
  }
  /** 要去的开合程度 */
  target(key: OpenKey) {
    const l = this.live.get(key)
    return this.want.get(key) ?? l?.base ?? 0
  }
  objects(key: OpenKey) {
    return this.live.get(key)?.objs ?? []
  }

  /** 设定开合程度；animate = false 时立刻到位（拖动跟手） */
  set(key: OpenKey, v: number, animate = true) {
    const l = this.live.get(key)
    if (!l) return
    v = Math.max(0, Math.min(1, v))
    this.want.set(key, v)
    if (animate) this.moving.add(key)
    else {
      this.moving.delete(key)
      if (l.cur !== v) {
        l.cur = v
        l.apply(v)
      }
    }
  }

  /** 模型临时摆到 v 跑一下 fn（比如量一量部件往屏幕哪边动），再摆回现在的位置 */
  probe<T>(key: OpenKey, v: number, fn: () => T): T | undefined {
    const l = this.live.get(key)
    if (!l) return undefined
    l.pose(v)
    try {
      return fn()
    } finally {
      l.pose(l.cur)
    }
  }

  /** 开着（过了一小半）就关上，关着就开到底 */
  toggle(key: OpenKey) {
    this.set(key, this.target(key) > 0.08 ? 0 : 1)
  }

  /** 推进动画；返回有没有东西在动 */
  step(dt: number) {
    for (const k of this.moving) {
      const l = this.live.get(k)
      const t = this.want.get(k)
      if (!l || t === undefined) {
        this.moving.delete(k)
        continue
      }
      const d = t - l.cur
      const s = Math.max(Math.abs(d) * (1 - Math.exp(-dt * EASE)), MIN_SPEED * dt)
      l.cur = Math.abs(d) <= s ? t : l.cur + Math.sign(d) * s
      l.apply(l.cur)
      if (l.cur === t) this.moving.delete(k)
    }
    return this.moving.size > 0
  }

  /** 拾取：从命中的对象往上找，属于哪个会动的部件 / 房门 */
  keyOf(o: THREE.Object3D | null): OpenKey | null {
    for (; o; o = o.parent) {
      if (o.userData.doorPart) return doorKey((o.userData.info as OpeningInfo).o.id)
      if (o.userData.door) {
        let f: THREE.Object3D | null = o.parent
        while (f && !f.userData.furnitureId) f = f.parent
        if (!f) return null
        const i = doorParts(f).indexOf(o)
        return i < 0 ? null : furnKey(f.userData.furnitureId as string, i)
      }
      if (o.userData.furnitureId) return null
    }
    return null
  }

  /** 某层所有房门现在挡路的门板线段（平面坐标） */
  segments(floor: string): [Vec, Vec][] {
    const out: [Vec, Vec][] = []
    for (const [id, d] of this.doors) {
      if (d.floor !== floor) continue
      out.push(...doorSegments(d.geom, this.live.get(doorKey(id))?.cur ?? defaultDoorOpen(d.geom.o)))
    }
    return out
  }
}
