// 家具纯色材质并成单一顶点色材质（toon.ts mergeSolidColors，house.ts setVertexColorMerge）：
//   - 看到的东西不变：按（填充色、描边色、投影设置、材质种类）分组，每组的三角形数完全一致、顶点坐标的一阶 / 二阶矩一致
//     （坐标只允许浮点误差：合并时把零件的变换烘进顶点）；没有描边的零件仍然没有描边；
//   - 花纹、发光、半透明零件保持独立材质；灯具不合并；柜门子树内部单独合并、照样开合；
//   - 材质分组（填充 draw call）和描边外壳数大幅下降。
// 只做结构性断言，不测帧时间。
import { afterAll, expect, test } from 'vitest'
import * as THREE from 'three'
import { ASSETS, ASSET_MAP } from '/src/three/assets'
import { furnitureModel, setFurnitureTemplateLimit, setVertexColorMerge } from '/src/three/house'
import { hasTag } from '/src/three/tags'

setFurnitureTemplateLimit(0)
afterAll(() => setVertexColorMerge(false))

type Moments = { n: number; s: number[] }
/** 一棵模型「画出来的样子」：（填充色 | 描边色 | 投影 | 材质种类）→ 三角形数与顶点坐标的矩，与网格怎么分组无关 */
function look(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const out = new Map<string, Moments>()
  const v = new THREE.Vector3()
  const hex = (c: THREE.Color | null) => (c ? c.getHexString() : '-')
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.isOutline || !o.visible || Array.isArray(m.material)) return
    const mat = m.material as THREE.MeshToonMaterial
    const g = m.geometry
    const P = g.attributes.position
    const col = g.attributes.color as THREE.BufferAttribute | undefined
    const oc = g.attributes.ocolor as THREE.BufferAttribute | undefined
    const hull = m.children.find((c) => c.userData.isOutline) as THREE.Mesh | undefined
    const hullColor = hull && !(hull.material as THREE.Material).userData?.vertexColorOutline ? ((hull.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color) : null
    // 顶点色材质等价于「纯色 toon」
    const kind = mat.vertexColors ? 'MeshToonMaterial||false' : `${mat.type}|${mat.map ? 'map' : ''}|${mat.transparent}`
    const idx = g.index?.array
    const cnt = g.index ? g.index.count : P.count
    for (let i = 0; i < cnt; i += 3) {
      const v0 = idx ? idx[i] : i
      const fill = col && mat.vertexColors ? hex(new THREE.Color(col.getX(v0), col.getY(v0), col.getZ(v0)).multiply(mat.color)) : hex(mat.color)
      const line = oc ? (oc.getX(v0) < 0 ? '-' : hex(new THREE.Color(oc.getX(v0), oc.getY(v0), oc.getZ(v0)))) : hex(hullColor)
      const key = `${fill}|${line}|${m.castShadow}|${m.receiveShadow}|${kind}`
      let s = out.get(key)
      if (!s) out.set(key, (s = { n: 0, s: [0, 0, 0, 0, 0, 0] }))
      s.n++
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(P, idx ? idx[i + k] : i + k).applyMatrix4(m.matrixWorld)
        s.s[0] += v.x
        s.s[1] += v.y
        s.s[2] += v.z
        s.s[3] += v.x * v.x
        s.s[4] += v.y * v.y
        s.s[5] += v.z * v.z
      }
    }
  })
  return out
}
/** 两份样子的差异（空 = 一致） */
function lookDiff(a: Map<string, Moments>, b: Map<string, Moments>) {
  const bad: string[] = []
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k)
    const y = b.get(k)
    if (!x || !y || x.n !== y.n) {
      bad.push(`${k}: ${x?.n ?? 0} vs ${y?.n ?? 0} 个三角形`)
      continue
    }
    x.s.forEach((v, i) => {
      if (Math.abs(v - y.s[i]) > 1e-3 * x.n + 1e-6 * Math.abs(v)) bad.push(`${k}: 矩 ${i} ${v} vs ${y.s[i]}`)
    })
  }
  return bad
}

function stats(root: THREE.Object3D) {
  let fills = 0
  let hulls = 0
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    if (o.userData.isOutline) hulls++
    else fills++
  })
  return { fills, hulls }
}

const model = (asset: string, extra: Record<string, unknown> = {}) => furnitureModel({ id: 'x', asset, x: 0, y: 0, rot: 0, color: 0, ...extra } as never)

test('合并前后画出来的三角形、填充色、描边色一致，材质分组大幅下降', () => {
  const bad: string[] = []
  const before = { fills: 0, hulls: 0 }
  const after = { fills: 0, hulls: 0 }
  for (const a of ASSETS) {
    if (a.fixture) continue
    setVertexColorMerge(false)
    const m0 = model(a.id)
    setVertexColorMerge(true)
    const m1 = model(a.id)
    const d = lookDiff(look(m0), look(m1))
    if (d.length) bad.push(`${a.id}: ${d[0]}`)
    const s0 = stats(m0)
    const s1 = stats(m1)
    before.fills += s0.fills
    before.hulls += s0.hulls
    after.fills += s1.fills
    after.hulls += s1.hulls
  }
  console.log(`[vertex-color] 全库填充网格 ${before.fills} → ${after.fills}，描边外壳 ${before.hulls} → ${after.hulls}`)
  expect(bad).toEqual([])
  expect(after.fills).toBeLessThan(before.fills * 0.5)
  expect(after.hulls).toBeLessThan(before.hulls * 0.5)
}, 600_000)

test('花纹零件保持花纹材质，其余并成顶点色网格', () => {
  setVertexColorMerge(true)
  expect(ASSET_MAP.get('sofa3')).toBeTruthy()
  const m = model('sofa3', { patterns: [{ kind: 'stripe', colors: ['#f3e2c7', '#7a9cc6'], scale: 8, angle: 45 }] })
  const mats = new Set<string>()
  m.traverse((o) => {
    const x = o as THREE.Mesh
    if (!x.isMesh || o.userData.isOutline) return
    const mat = x.material as THREE.MeshToonMaterial
    mats.add(mat.userData.vertexColorToon ? 'vc' : mat.map ? 'pattern' : 'other')
  })
  expect(mats.has('pattern')).toBe(true)
  expect(mats.has('vc')).toBe(true)
})

test('灯具不合并；柜门子树内部合并并照样开合', () => {
  setVertexColorMerge(true)
  const lamp = ASSETS.find((a) => hasTag(a, 'light') && !a.fixture)!
  let vcInLamp = 0
  model(lamp.id).traverse((o) => {
    if (((o as THREE.Mesh).material as THREE.Material | undefined)?.userData?.vertexColorToon) vcInLamp++
  })
  expect(vcInLamp).toBe(0)

  const doorVc = (root: THREE.Object3D) => {
    const out: THREE.Mesh[] = []
    root.traverse((o) => {
      if (!o.userData.door) return
      o.traverse((c) => {
        if (((c as THREE.Mesh).material as THREE.Material | undefined)?.userData?.vertexColorToon) out.push(c as THREE.Mesh)
      })
    })
    return out
  }
  const centers = (root: THREE.Object3D) => {
    root.updateMatrixWorld(true)
    return doorVc(root).map((m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).toArray().map((v) => Math.round(v)).join(','))
  }
  const closed = model('wardrobe')
  expect(doorVc(closed).length).toBeGreaterThan(0)
  expect(centers(model('wardrobe', { open: true }))).not.toEqual(centers(closed))
})
