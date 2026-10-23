// 单面墙的设置（src/wallFace.ts）：墙纸覆盖 / 内收柱（墙顶的梁）的增删改、加删顶点时跟着重排、读档整理、分享、3D 搭建
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { emptyPlan, rectPoints, uid, type Plan, type Room } from '/src/model'
import { beamsOf, clampBeam, faceWallpaper, mergeWallFaces, newBeam, normalizeWallFaces, patchWallFace, splitWallFace, wallFace } from '/src/wallFace'
import { normalizePlan } from '/src/store'
import { decodeShare, encodeShare } from '/src/share'
import { buildHouse } from '/src/three/house'

/** 两间并排的洋室：A 在左（0..400），B 在右（400..700） */
function twoRooms(): Plan {
  const p = emptyPlan()
  const room = (name: string, x0: number, x1: number): Room => ({ id: uid('r'), name, kind: 'western', points: rectPoints(x0, 0, x1, 300) })
  p.rooms = [room('A', 0, 400), room('B', 400, 700)]
  return p
}

describe('patchWallFace', () => {
  test('设置、删除字段，全空时去掉 walls', () => {
    const r = twoRooms().rooms[0]
    patchWallFace(r, 2, { wallpaper: { color: '#ff0000' } })
    expect(r.walls).toEqual([null, null, { wallpaper: { color: '#ff0000' } }])
    patchWallFace(r, 2, { beam: { w: 60, d: 40, h: 30, offset: 30 } })
    expect(wallFace(r, 2)?.beam?.d).toBe(40)
    patchWallFace(r, 2, { wallpaper: undefined, beam: undefined })
    expect(r.walls).toBeUndefined()
  })

  test('墙纸：这面墙自己的优先，没有就跟随房间 / 全屋', () => {
    const p = twoRooms()
    const r = p.rooms[0]
    p.wallpaper = { color: '#eeeeee' }
    expect(faceWallpaper(p, r, 1)?.color).toBe('#eeeeee')
    r.wallpaper = { color: '#dddddd' }
    expect(faceWallpaper(p, r, 1)?.color).toBe('#dddddd')
    patchWallFace(r, 1, { wallpaper: { color: '#123456' } })
    expect(faceWallpaper(p, r, 1)?.color).toBe('#123456')
    expect(faceWallpaper(p, r, 0)?.color).toBe('#dddddd')
  })

  test('梁夹在墙内；新加的梁占满整面墙', () => {
    expect(clampBeam({ w: 999, d: 2, h: 999, offset: -10 }, 300)).toEqual({ w: 300, d: 5, h: 150, offset: 150 })
    expect(clampBeam({ w: 60, d: 40, h: 30, offset: 290 }, 300).offset).toBe(270)
    expect(newBeam(345)).toEqual({ w: 345, d: 30, h: 40, offset: 172.5 })
  })
})

describe('加删顶点', () => {
  test('插入顶点：梁按范围切到两段，墙纸两段都带，后面的边号 +1', () => {
    const r = twoRooms().rooms[0]
    patchWallFace(r, 0, { wallpaper: { color: '#111111' }, beam: { w: 200, d: 30, h: 40, offset: 250 } })
    patchWallFace(r, 2, { wallpaper: { color: '#222222' } })
    splitWallFace(r, 0, 200)
    expect(r.walls?.[0]).toEqual({ wallpaper: { color: '#111111' }, beam: { w: 50, d: 30, h: 40, offset: 175 } })
    expect(r.walls?.[1]).toEqual({ wallpaper: { color: '#111111' }, beam: { w: 150, d: 30, h: 40, offset: 75 } })
    expect(r.walls?.[3]?.wallpaper?.color).toBe('#222222')
  })

  test('删顶点：合并的两条边上的设置丢掉，后面的边号 -1', () => {
    const r = twoRooms().rooms[0]
    for (const i of [0, 1, 2, 3]) patchWallFace(r, i, { wallpaper: { color: `#00000${i}` } })
    mergeWallFaces(r, 1)
    r.points.splice(1, 1)
    expect(r.walls).toEqual([null, { wallpaper: { color: '#000002' } }, { wallpaper: { color: '#000003' } }])
  })

  test('删 0 号顶点：最后一条边和 0 号边合并成新的最后一条', () => {
    const r = twoRooms().rooms[0]
    for (const i of [0, 1, 2, 3]) patchWallFace(r, i, { wallpaper: { color: `#00000${i}` } })
    mergeWallFaces(r, 0)
    expect(r.walls).toEqual([{ wallpaper: { color: '#000001' } }, { wallpaper: { color: '#000002' } }])
  })
})

describe('读档 / 分享', () => {
  test('normalizeWallFaces 去掉坏数据', () => {
    const r = twoRooms().rooms[0]
    r.walls = [{ wallpaper: { color: 3 } } as never, 'x' as never, { beam: { w: 60, d: 40, h: 30, offset: 9999 } }, { beam: { w: 60, d: 40, offset: 30 } } as never, null, { beam: { w: 10, d: 10, h: 10, offset: 5 } }]
    normalizeWallFaces(r)
    expect(r.walls).toEqual([null, null, { beam: { w: 60, d: 40, h: 30, offset: 370 } }])
    r.walls = 5 as never
    normalizeWallFaces(r)
    expect(r.walls).toBeUndefined()
  })

  test('旧存档（没有 walls）照常读', () => {
    const p = normalizePlan(twoRooms())!
    expect(p.rooms.every((r) => r.walls === undefined)).toBe(true)
  })

  test('分享：完整版带墙纸和梁，只户型只带梁', async () => {
    const p = twoRooms()
    patchWallFace(p.rooms[0], 1, { wallpaper: { color: '#abcdef' }, beam: { w: 50, d: 35, h: 30, offset: 60 } })
    const full = await decodeShare(await encodeShare(p, 'full'))
    const bare = await decodeShare(await encodeShare(p, 'plan'))
    if (!full.ok || !bare.ok) throw new Error('decode failed')
    expect(full.plan.rooms[0].walls?.[1]).toEqual({ wallpaper: { color: '#abcdef' }, beam: { w: 50, d: 35, h: 30, offset: 60 } })
    expect(bare.plan.rooms[0].walls?.[1]).toEqual({ beam: { w: 50, d: 35, h: 30, offset: 60 } })
  })
})

describe('3D', () => {
  /** 房子里所有网格顶点的世界坐标 */
  function vertices(root: THREE.Object3D) {
    root.updateMatrixWorld(true)
    const out: THREE.Vector3[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      const pos = m.isMesh ? (m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined) : undefined
      if (!pos) return
      for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
    })
    return out
  }

  test('内收柱（梁）：平面上在墙面里侧，3D 里贴着墙顶往下垂', () => {
    const p = twoRooms()
    // A 的 1 号边是 x = 400 的隔墙（墙厚 10），梁突出 40、下垂 30、长 60、中心在离起点 100 处
    patchWallFace(p.rooms[0], 1, { beam: { w: 60, d: 40, h: 30, offset: 100 } })
    const [bi] = beamsOf(p)
    const xs = bi.poly.map((q) => q.x)
    expect(Math.max(...xs)).toBeCloseTo(395)
    expect(Math.min(...xs)).toBeCloseTo(355)
    // 梁正面（x ≈ 355）只在墙顶往下 30 的范围里有顶点：梁底 y = 210，地面附近没有；没梁时这里什么都没有
    const front = (vs: THREE.Vector3[]) => vs.filter((v) => Math.abs(v.x - 355) < 0.6 && v.z > 60 && v.z < 200)
    const ys = front(vertices(buildHouse(p, 240))).map((v) => v.y)
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeCloseTo(210, 0)
    expect(Math.max(...ys)).toBeCloseTo(240, 0)
    expect(front(vertices(buildHouse(twoRooms(), 240))).length).toBe(0)
  })

  test('单面墙纸：这面墙用自己的材质，同房间别的墙不受影响', () => {
    const p = twoRooms()
    patchWallFace(p.rooms[0], 3, { wallpaper: { color: '#ff0000' } })
    const colors = new Set<string>()
    buildHouse(p, 240).traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const c = (mat as THREE.MeshBasicMaterial).color
        if (c) colors.add(c.getHexString())
      }
    })
    expect(colors.has('ff0000')).toBe(true)
  })
})
