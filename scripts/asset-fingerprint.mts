// 素材指纹：重构素材代码（公用工具去重、迁移包）时证明「模型没变」。
// 对每个素材的每组原生配色调用 build，记录：
//   bbox / tris：包围盒（世界坐标，0.001cm）与三角面数
//   geo  ：每个网格「世界坐标顶点 + 索引 + 材质 + 投影 / 描边标记 + userData」的哈希，排序后合成（与层级、遍历顺序无关）
//   tree ：整棵树按遍历顺序的结构哈希（含 Group 的局部变换和 userData：柜门枢轴、可开合标记都在这里）
//   meta ：def 里除 build 以外的数据（尺寸、surface / surfaces / screens、标签…）
//   dp   ：九种风格的派生配色（stylePalettes.derivedPalette）
// 用法：vite-node scripts/asset-fingerprint.mts --out <json> [--base <json>] [--only <id 正则>]
//   给了 --base 就逐项对比，有差异时列出并以非 0 退出。
import '../test/setup/stubdom'
import crypto from 'node:crypto'
import fs from 'node:fs'
import * as THREE from 'three'
import { ASSETS } from '/src/three/assets'
import { STYLE_ORDER, derivedPalette } from '/src/three/stylePalettes'

const argv = process.argv.slice(2)
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const outFile = arg('--out')
const baseFile = arg('--base')
const only = arg('--only') ? new RegExp(arg('--only')!) : null

const r3 = (n: number) => Math.round(n * 1000)

/** userData / 材质参数里能稳定序列化的部分（函数、three 对象、贴图只记类型） */
function plain(x: unknown, depth = 0): unknown {
  if (x === null || x === undefined) return x
  if (typeof x === 'number') return Number.isFinite(x) ? r3(x) : String(x)
  if (typeof x === 'string' || typeof x === 'boolean') return x
  if (typeof x === 'function') return 'fn'
  if (depth > 4) return '…'
  if (Array.isArray(x)) return x.map((v) => plain(v, depth + 1))
  const o = x as Record<string, unknown> & { isObject3D?: boolean; isTexture?: boolean; isMaterial?: boolean; isColor?: boolean; isVector3?: boolean; isBufferGeometry?: boolean }
  if (o.isObject3D) return `obj:${(o as unknown as THREE.Object3D).type}`
  if (o.isTexture) return 'tex'
  if (o.isMaterial) return `mat:${(o as unknown as THREE.Material).type}`
  if (o.isBufferGeometry) return 'geo'
  if (o.isColor) return (o as unknown as THREE.Color).getHexString()
  if (o.isVector3) return [(o as unknown as THREE.Vector3).x, (o as unknown as THREE.Vector3).y, (o as unknown as THREE.Vector3).z].map(r3)
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) out[k] = plain(o[k], depth + 1)
  return out
}

function matSig(m: THREE.Material) {
  const t = m as THREE.MeshToonMaterial & { uniforms?: Record<string, { value: unknown }> }
  return JSON.stringify([
    m.type,
    t.color?.getHexString(),
    t.emissive?.getHexString(),
    t.emissiveIntensity,
    m.opacity,
    m.transparent,
    m.side,
    m.depthWrite,
    m.depthTest,
    m.blending,
    m.visible,
    !!t.map,
    t.map ? [t.map.repeat.x, t.map.repeat.y, t.map.offset.x, t.map.offset.y, t.map.rotation, t.map.wrapS, t.map.wrapT, t.map.name] : null,
    !!t.alphaMap,
    !!t.normalMap,
    plain(m.userData),
  ])
}

function meshHash(m: THREE.Mesh) {
  const h = crypto.createHash('sha1')
  const g = m.geometry
  const pos = g.attributes.position
  const e = m.matrixWorld.elements
  const buf = new Int32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    buf[i * 3] = r3(e[0] * x + e[4] * y + e[8] * z + e[12])
    buf[i * 3 + 1] = r3(e[1] * x + e[5] * y + e[9] * z + e[13])
    buf[i * 3 + 2] = r3(e[2] * x + e[6] * y + e[10] * z + e[14])
  }
  h.update(Buffer.from(buf.buffer))
  if (g.index) h.update(Buffer.from(new Int32Array(Array.from(g.index.array as ArrayLike<number>)).buffer))
  const mats = Array.isArray(m.material) ? m.material : [m.material]
  h.update(
    JSON.stringify([
      m.type,
      mats.map(matSig),
      g.groups,
      Object.keys(g.attributes).sort(),
      g.drawRange,
      m.castShadow,
      m.receiveShadow,
      m.visible,
      m.renderOrder,
      m.matrixWorld.determinant() < 0,
      plain(m.userData),
    ]),
  )
  return h.digest('hex').slice(0, 16)
}

function triCount(m: THREE.Mesh) {
  const g = m.geometry
  return (g.index ? g.index.count : g.attributes.position.count) / 3
}

interface PalPrint {
  bbox: number[]
  tris: number
  meshes: number
  geo: string
  tree: string
}

function printModel(root: THREE.Object3D): PalPrint {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const hashes: string[] = []
  const tree = crypto.createHash('sha1')
  let tris = 0
  let meshes = 0
  const walk = (o: THREE.Object3D, depth: number) => {
    const m = o as THREE.Mesh
    let own = ''
    if (m.isMesh || (o as THREE.LineSegments).isLine || (o as THREE.Points).isPoints) {
      own = meshHash(m)
      hashes.push(own)
      if (m.isMesh) {
        tris += triCount(m)
        meshes++
        m.geometry.computeBoundingBox()
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld))
      }
    }
    tree.update(JSON.stringify([depth, o.type, own, o.position.toArray().map(r3), o.quaternion.toArray().map((v) => Math.round(v * 1e5)), o.scale.toArray().map(r3), o.visible, plain(o.userData)]))
    for (const c of o.children) walk(c, depth + 1)
  }
  walk(root, 0)
  hashes.sort()
  const geo = crypto.createHash('sha1').update(hashes.join(',')).digest('hex').slice(0, 16)
  const bbox = box.isEmpty() ? [] : [...box.min.toArray(), ...box.max.toArray()].map(r3)
  return { bbox, tris, meshes, geo, tree: tree.digest('hex').slice(0, 16) }
}

function metaOf(a: (typeof ASSETS)[number]) {
  const { build: _b, ...rest } = a
  return crypto.createHash('sha1').update(JSON.stringify(plain(rest))).digest('hex').slice(0, 16)
}

const t0 = Date.now()
const result: Record<string, { meta: string; dp: string; pals: PalPrint[] }> = {}
for (const a of ASSETS) {
  if (only && !only.test(a.id)) continue
  const pals = a.palettes.length ? a.palettes : [[]]
  result[a.id] = { meta: metaOf(a), dp: JSON.stringify(STYLE_ORDER.map((st) => derivedPalette(a, st))), pals: pals.map((p) => printModel(a.build(p))) }
}
console.log(`[fingerprint] ${Object.keys(result).length} 个素材，${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result))

if (baseFile) {
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8')) as typeof result
  const diffs: string[] = []
  const count = { bbox: 0, tris: 0, geo: 0, tree: 0, meta: 0, dp: 0 }
  for (const id of new Set([...Object.keys(base), ...Object.keys(result)])) {
    if (only && !only.test(id)) continue
    const a = base[id]
    const b = result[id]
    if (!a || !b) {
      diffs.push(`${id}: ${a ? '消失' : '新增'}`)
      continue
    }
    if (a.meta !== b.meta) {
      count.meta++
      diffs.push(`${id}: meta`)
    }
    if (a.dp !== b.dp) {
      count.dp++
      diffs.push(`${id}: 派生配色 ${a.dp} → ${b.dp}`)
    }
    if (a.pals.length !== b.pals.length) {
      diffs.push(`${id}: 配色组数 ${a.pals.length} → ${b.pals.length}`)
      continue
    }
    a.pals.forEach((pa, i) => {
      const pb = b.pals[i]
      const bad: string[] = []
      if (pa.bbox.join() !== pb.bbox.join()) (count.bbox++, bad.push(`bbox ${pa.bbox} → ${pb.bbox}`))
      if (pa.tris !== pb.tris) (count.tris++, bad.push(`tris ${pa.tris} → ${pb.tris}`))
      if (pa.geo !== pb.geo) (count.geo++, bad.push('geo'))
      if (pa.tree !== pb.tree) (count.tree++, bad.push('tree'))
      if (bad.length) diffs.push(`${id}#${i}: ${bad.join('; ')}`)
    })
  }
  if (diffs.length) {
    console.log(diffs.slice(0, 200).join('\n'))
    if (diffs.length > 200) console.log(`… 共 ${diffs.length} 条`)
    console.log('[fingerprint] 差异统计', count)
    process.exit(1)
  }
  console.log('[fingerprint] 与基线完全一致')
}
