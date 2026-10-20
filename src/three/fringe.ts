// 长绒的毛刺边（地毯、地垫）：建模时沿扁平长绒零件的顶面轮廓长一圈软软的尖刺，参考手绘室内背景里的绒毛地毯——
// 色块交界、外框都不是光滑的直线 / 曲线，而是一圈不规则的毛刺。
//
//   - 只处理地毯、地垫类素材（标签 rug / bath-mat）里扁平的长绒零件（userData.mat === 'pile'、厚度 ≤ 5cm）：
//     宠物、毛绒玩具也有长绒零件（耳朵、鳍），不能被压薄、长刺；取顶面（朝上、在最高处）三角形的边界边，
//     沿边界每隔约 0.9cm 长一根尖刺，朝外伸出 0.25–0.8cm（根部宽、密、钝，是一圈软的毛边，不是一根根显眼的刺），宽窄、长短、歪斜都随机（按位置取的哈希，每次建模结果一样）；
//   - 每根毛是接近三角形的楔形：两边是直线、梢上截成宽钝头（不尖）；有厚度（顶面和零件顶面齐平，侧面一直到零件底面），
//     和地毯本身一样看得出厚度；内圈色块的毛往下插进下一层里，看不到；
//   - 不均匀：沿边缘按约 12cm 一段的平滑噪声，有的地方毛多、有的地方几乎贴平；
//   - 上面一层色块的尖刺压在下面一层上，交界就成了毛刺状；最外圈的尖刺伸到地板上，外框也毛了；
//   - 尖刺和零件同材质、同材质类别，作为兄弟节点挂上（合并要求网格没有子节点），合并时照样并进顶点色网格；不投影、不描边，
//     长了毛刺的零件本身也不再描深色轮廓线（外框是毛边，不是硬线）。
// 在 resolveMats 之后、mergeMeshes 之前调用（house.ts buildTemplate）。

import * as THREE from 'three'
import type { AssetDef } from './kit'
import { noise3 } from './critter-geo'
import { tagMat } from './mats'
import { hasTag } from './tags'

/** 只处理不超过这么厚（cm）的长绒零件 */
const MAX_THICK = 5
/** 扁平长绒零件的厚度压到原来的这么多倍（以地面为基准缩放，一层层色块的上下次序不变）：地毯看着更薄、更贴地 */
const THIN = 0.55
/** 尖刺间距、长度范围（cm） */
const STEP = 0.9
const LEN_MIN = 0.25
const LEN_MAX = 0.8
/** 毛刺顶面比零件顶面高出的一点（不和顶面打架）、根部从顶面边界往里收的距离（圆角地毯的顶面比外沿往里收了一圈圆角） */
const LIFT = 0.03
const ROOT_INSET = 0.4
/** 毛多 / 平滑分段的噪声尺度（cm）：约这么长一段起伏一次 */
const PATCH = 12

/** 按位置取的确定性随机数 0–1 */
function hash(x: number, y: number, k: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/** 顶面的边界边：每条边附带顶面内部一侧的一个顶点，用来定朝外 */
function topBoundary(g: THREE.BufferGeometry, top: number) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const idx = g.index
  const triCount = idx ? idx.count / 3 : pos.count / 3
  const at = (i: number) => (idx ? idx.getX(i) : i)
  const key = (v: THREE.Vector3) => `${Math.round(v.x * 50)},${Math.round(v.z * 50)}`
  const edges = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; n: number }>()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, at(t * 3))
    b.fromBufferAttribute(pos, at(t * 3 + 1))
    c.fromBufferAttribute(pos, at(t * 3 + 2))
    if (Math.min(a.y, b.y, c.y) < top - 0.05) continue
    const n = e1.subVectors(b, a).cross(e2.subVectors(c, a))
    if (n.lengthSq() < 1e-10 || n.normalize().y < 0.9) continue
    const vs = [a, b, c]
    for (let i = 0; i < 3; i++) {
      const p = vs[i]
      const q = vs[(i + 1) % 3]
      const r = vs[(i + 2) % 3]
      const kp = key(p)
      const kq = key(q)
      if (kp === kq) continue
      const k = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`
      const e = edges.get(k)
      if (e) e.n++
      else edges.set(k, { a: p.clone(), b: q.clone(), c: r.clone(), n: 1 })
    }
  }
  return [...edges.values()].filter((e) => e.n === 1)
}

/** 一圈毛刺的几何体：每根是有厚度的楔形（顶面和零件顶面齐平，往下到零件底面），每个面单独的法线 */
function spikes(edges: ReturnType<typeof topBoundary>, top: number, bottom: number) {
  const pos: number[] = []
  const nrm: number[] = []
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  /** 一个三角形，绕向按 n 定（朝 n 那面可见） */
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, n: THREE.Vector3) => {
    const flip = e1.subVectors(q, p).cross(e2.subVectors(r, p)).dot(n) < 0
    for (const v of flip ? [p, r, q] : [p, q, r]) {
      pos.push(v.x, v.y, v.z)
      nrm.push(n.x, n.y, n.z)
    }
  }
  const UP = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3()
  const mid = new THREE.Vector3()
  /** 侧面：顶边 p→q 往下拉到底面的竖直四边形，法线水平朝外（背离这根毛的中心 c） */
  const wall = (p: THREE.Vector3, q: THREE.Vector3, c: THREE.Vector3) => {
    side.set(q.z - p.z, 0, p.x - q.x)
    if (side.lengthSq() < 1e-8) return
    side.normalize()
    if (side.dot(mid.addVectors(p, q).multiplyScalar(0.5).sub(c)) < 0) side.negate()
    const pb = p.clone().setY(bottom)
    const qb = q.clone().setY(bottom)
    tri(p, q, qb, side)
    tri(p, qb, pb, side)
  }
  const dir = new THREE.Vector3()
  const out = new THREE.Vector3()
  const toC = new THREE.Vector3()
  for (const e of edges) {
    dir.subVectors(e.b, e.a).setY(0)
    const len = dir.length()
    if (len < 0.3) continue
    dir.divideScalar(len)
    // 朝外：边的法向里背离顶面内部（第三个顶点）的那一侧
    out.set(dir.z, 0, -dir.x)
    if (out.dot(toC.subVectors(e.c, e.a)) > 0) out.negate()
    const n = Math.max(1, Math.round(len / STEP))
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n
      const mx = e.a.x + (e.b.x - e.a.x) * s
      const mz = e.a.z + (e.b.z - e.a.z) * s
      const h1 = hash(mx, mz, 1)
      const h2 = hash(mx, mz, 2)
      const h3 = hash(mx, mz, 3)
      // 毛多 / 平滑的分段：噪声低的一段毛几乎贴平（只留 15%），高的一段长到满长
      const patch = THREE.MathUtils.smoothstep(noise3(mx / PATCH, 0, mz / PATCH, 7), 0.35, 0.8)
      const l = (LEN_MIN + (LEN_MAX - LEN_MIN) * h1 * h1) * (0.15 + 0.85 * patch)
      // 根部宽度：比间距宽一点，相邻的毛根部叠在一起，不露缝
      const w = (len / n) * (0.95 + 0.6 * h2)
      const lean = (h3 - 0.5) * 0.5
      const P = (along: number, outward: number) => new THREE.Vector3(mx + dir.x * along + out.x * outward, top + LIFT, mz + dir.z * along + out.z * outward)
      // 梯形：两边是直线，梢上截成宽钝头（宽约根部的四成），不尖
      const a = P(-w / 2, -ROOT_INSET)
      const b = P(w / 2, -ROOT_INSET)
      const ta = P(-w * 0.2 + lean, l)
      const tb = P(w * 0.2 + lean, l)
      const c = P(lean * 0.5, l * 0.4)
      tri(a, b, tb, UP)
      tri(a, tb, ta, UP)
      wall(a, ta, c)
      wall(ta, tb, c)
      wall(tb, b, c)
    }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  return g
}

/** 给地毯、地垫里扁平的长绒零件长毛刺边（顺便压薄） */
export function addPileFringe(root: THREE.Object3D, def: Pick<AssetDef, 'tags'>) {
  if (!hasTag(def, 'rug', 'bath-mat')) return
  const targets: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.isOutline || o.userData.mat !== 'pile' || Array.isArray(m.material) || m.material.transparent) return
    targets.push(m)
  })
  const box = new THREE.Box3()
  for (const m of targets) {
    if (!m.parent) continue
    // 在父节点的坐标系里算（扁平零件常常是立着建好再转平的，几何体局部的 y 不是朝上）；先用包围盒挑掉不够扁平的
    m.updateMatrix()
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrix)
    if (box.max.y - box.min.y > MAX_THICK || Math.max(box.max.x - box.min.x, box.max.z - box.min.z) < 6) continue
    const g = m.geometry.clone().applyMatrix4(m.matrix)
    // clone 会带上原几何体的 userData（缓存的共用标记）：这份是这个模型自己的，要能随模板回收
    g.userData = {}
    // 压薄：零件换成父坐标系里压扁的几何体（原几何体可能是共用的缓存，不能改），变换归一
    g.scale(1, THIN, 1)
    g.computeBoundingBox()
    g.computeBoundingSphere()
    m.geometry = g
    m.position.set(0, 0, 0)
    m.quaternion.identity()
    m.scale.set(1, 1, 1)
    const geo = spikes(topBoundary(g, g.boundingBox!.max.y), g.boundingBox!.max.y, g.boundingBox!.min.y + 0.05)
    if (!geo) continue
    // 长了毛刺的零件不再描深色轮廓线：外框是毛边，不是硬线
    m.userData.noOutline = true
    const f = tagMat(new THREE.Mesh(geo, m.material), 'pile')
    f.castShadow = false
    f.receiveShadow = m.receiveShadow
    f.userData.noOutline = true
    m.parent.add(f)
  }
}
