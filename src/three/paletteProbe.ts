// 派生配色的探针（stylePalettes.ts 的 probe）：用一组互不相同的哨兵色 build 一次模型，看每个颜色槽实际落在哪类材质上、占多大面积。
// 要 build 模型，所以单独成模块，由完整素材（assets.ts）装上；元数据快照里的素材直接带着预先算好的结果（AssetMeta.slotProbe）。

import * as THREE from 'three'
import type { AssetDef, SlotProbe } from './assetMeta'
import { disposeUnshared } from './toon'
import { fromHsl, hueDist, toHsl } from './stylePalettes'

const probeCache = new Map<string, SlotProbe[]>()

/** 统计一个网格的面积（世界坐标），作为权重 */
function meshArea(m: THREE.Mesh) {
  const geo = m.geometry
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined
  if (!pos) return 0
  const idx = geo.index
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = idx ? idx.count : pos.count
  // 大网格抽样，够用了
  const step = Math.max(1, Math.floor(n / 3 / 400)) * 3
  let sum = 0
  for (let i = 0; i + 2 < n; i += step) {
    const i0 = idx ? idx.getX(i) : i
    const i1 = idx ? idx.getX(i + 1) : i + 1
    const i2 = idx ? idx.getX(i + 2) : i + 2
    a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld)
    b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld)
    c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld)
    sum += b.sub(a).cross(c.sub(a)).length() / 2
  }
  return (sum * step) / 3
}

/** 用哨兵色 build 一次，看每个槽落在哪类材质上 */
export function probeLive(def: AssetDef, n: number): SlotProbe[] {
  const hit = probeCache.get(def.id)
  if (hit) return hit
  const hues = Array.from({ length: n }, (_, i) => (17 + (i * 360) / n) % 360)
  const sentinel = hues.map((h) => fromHsl({ h, s: 0.92, l: 0.5 }))
  const tpl = def.palettes[0] ?? []
  const pal = sentinel.map((c, i) => (tpl[i] === '' ? '' : c))
  const area = new Array<number>(n).fill(0)
  const keepArea = new Array<number>(n).fill(0)
  let total = 0
  let g: THREE.Object3D | null = null
  try {
    g = def.build(pal)
    g.updateMatrixWorld(true)
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as (THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number })[]
      const w = meshArea(m)
      total += w
      for (const mat of mats) {
        if (!mat?.color) continue
        // 用 sRGB 十六进制再换 HSL（getHSL 默认在线性工作空间里算，色相会偏）
        const hsl = toHsl('#' + mat.color.getHexString())!
        if (hsl.s < 0.45 || hsl.l < 0.12 || hsl.l > 0.9) continue
        const h = hsl.h
        let best = -1
        let bd = Math.min(8, 360 / n / 3)
        hues.forEach((hh, i) => {
          const d = hueDist(h, hh)
          if (d < bd) (bd = d), (best = i)
        })
        if (best < 0) continue
        const ww = w / mats.length
        area[best] += ww
        const glowing = !!mat.emissive && (mat.emissiveIntensity ?? 0) > 0 && mat.emissive.getHex() !== 0
        const basic = (mat as THREE.Material).type === 'MeshBasicMaterial'
        const glass = mat.transparent && mat.opacity < 0.9
        if (glowing || basic || glass) keepArea[best] += ww
      }
    })
  } catch {
    // build 不认哨兵色（极少数）：全部按普通槽处理
  } finally {
    if (g) disposeUnshared(g)
  }
  const used = area.reduce((s, v) => s + v, 0) || 1
  const out = area.map((a, i) => ({ keep: a <= 0 ? !!g && total > 0 : keepArea[i] / a > 0.5, share: a / used }))
  probeCache.set(def.id, out)
  return out
}

