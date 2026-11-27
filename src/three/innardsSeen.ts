// 「部件里面的东西」（kit.ts innards：抽屉盒、抽屉里码着的衣物）关严时不画——前提是真的看不见。
// 桌面下没有柜体包着的抽屉、没有背板的架子上的抽屉，抽屉盒从背后、从低处看得一清二楚，藏掉就只剩一块悬空的面板。
// 这里量一下每件素材的每组 innards 关严时从外面看不看得到：看得到的照常画（house.ts buildTemplate 去掉标记）。
// 要打几千条射线，离线量好存进 measured.generated.ts（pnpm gen:measured）；表里没有的（新素材）现量。
import * as THREE from 'three'
import type { AssetDef } from './kit'
import { measured } from './measured'

/** 模型里的 innards 组，按遍历顺序（同一件素材顺序固定，下标当编号） */
export function innardsGroups(root: THREE.Object3D) {
  const out: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.userData.innards) out.push(o)
  })
  return out
}

/**
 * 镜头看过去的方向：水平八个方向各配平视、俯视 35°、仰视 20°（镜头贴近地面看桌面下的抽屉），再加正上方。
 * 不含正下方、大仰角：镜头到不了家具底下
 */
const DIRS: THREE.Vector3[] = [new THREE.Vector3(0, -1, 0)]
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4
  for (const tilt of [0, -35, 20]) {
    const t = (tilt * Math.PI) / 180
    DIRS.push(new THREE.Vector3(Math.cos(a) * Math.cos(t), Math.sin(t), Math.sin(a) * Math.cos(t)).normalize())
  }
}
/** 包围盒每个面上取的点（面内坐标，-1..1） */
const SPOTS: [number, number][] = [
  [0, 0],
  [-0.8, -0.8],
  [0.8, -0.8],
  [-0.8, 0.8],
  [0.8, 0.8],
]
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]

/** 一组 innards 至少有这么多条视线（占打中它的视线的比例）没被挡住才算看得到：抽屉面板之间几毫米的缝里漏出的一线不算 */
const SEEN_SHARE = 0.1

/** 模型（关着的）里每组 innards 从外面看得到多少：没被挡住的视线数 / 打中它的视线数（innardsGroups 的顺序） */
export function innardsExposure(root: THREE.Object3D): [seen: number, hit: number][] {
  const groups = innardsGroups(root)
  if (!groups.length) return []
  root.updateMatrixWorld(true)
  // 挡得住视线的：不在任何 innards 里的不透明网格（玻璃门后面的抽屉盒看得见）
  const solids: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.innards || !p.visible) return
    const mat = m.material as THREE.Material | THREE.Material[]
    if ((Array.isArray(mat) ? mat : [mat]).every((x) => x.transparent)) return
    solids.push(m)
  })
  const ray = new THREE.Raycaster()
  const box = new THREE.Box3()
  const c = new THREE.Vector3()
  const h = new THREE.Vector3()
  const p = new THREE.Vector3()
  return groups.map((g) => {
    const own: THREE.Mesh[] = []
    g.traverse((o) => void ((o as THREE.Mesh).isMesh && own.push(o as THREE.Mesh)))
    box.setFromObject(g)
    let seen = 0
    let hit = 0
    if (!own.length || box.isEmpty()) return [seen, hit]
    box.getCenter(c)
    box.getSize(h).multiplyScalar(0.5)
    const far = h.length() + 400
    for (const d of DIRS) {
      // 朝着镜头的那几个面
      for (let ax = 0; ax < 3; ax++) {
        const s = -Math.sign(d.getComponent(ax))
        if (!s || Math.abs(d.getComponent(ax)) < 0.2) continue
        const u = (ax + 1) % 3
        const v = (ax + 2) % 3
        for (const [a, b] of SPOTS) {
          p.copy(c)
            .addScaledVector(AXES[ax], s * h.getComponent(ax))
            .addScaledVector(AXES[u], a * h.getComponent(u))
            .addScaledVector(AXES[v], b * h.getComponent(v))
          ray.set(p.clone().addScaledVector(d, -far), d)
          const mine = ray.intersectObjects(own, false)[0]
          if (!mine) continue
          hit++
          const wall = ray.intersectObjects(solids, false)[0]
          if (!wall || wall.distance > mine.distance + 0.05) seen++
        }
      }
    }
    return [seen, hit]
  })
}

/** 模型（关着的）里哪几组 innards 从外面看得到：返回 innardsGroups 的下标 */
export function seenInnards(root: THREE.Object3D): number[] {
  return innardsExposure(root).flatMap(([seen, hit], i) => (seen > hit * SEEN_SHARE ? [i] : []))
}

/** 这件素材关严时从外面看得到的 innards 组（查表，表里没有就现量；和配色无关，用第一组配色量） */
export function innardsSeen(def: AssetDef): number[] {
  return measured(`innards:${def.id}`, () => seenInnards(def.build(def.palettes[0] ?? [])))
}

/** 看得到的 innards 去掉标记：照常画、照常和部件的其它零件合并（要在合并网格之前调用） */
export function showSeenInnards(root: THREE.Object3D, def: AssetDef) {
  // 不能开合的素材没人管 innards 的可见性（poseDoor），本来就一直画
  if (!def.openable) return
  const groups = innardsGroups(root)
  if (!groups.length) return
  for (const i of innardsSeen(def)) if (groups[i]) delete groups[i].userData.innards
}

/** 把所有带 innards 的可开合素材量一遍（生成 / 检查 measured.generated.ts 时用） */
export function measureAllInnards(defs: readonly AssetDef[]) {
  for (const def of defs) if (def.openable && innardsGroups(def.build(def.palettes[0] ?? [])).length) innardsSeen(def)
}
