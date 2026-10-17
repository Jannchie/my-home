// 素材尺寸校正（预计算版）。
//
// 素材的实际模型常比声明的 w / d / h 略大（扶手、尾巴、支脚伸出去），碰撞、贴墙、对齐都按声明尺寸算，差了就会穿模。
// 以前在页面空闲时逐个 build 测量、运行时改写素材，导致同一 seed 的布置在校正前后、浏览器与测试之间不一致。
// 现在改成离线预计算：scripts/gen-dims.mts 用这里的 computeDims() 生成 dims.generated.ts，
// assets.ts 在构造 ASSETS 时同步 applyDims()；开发环境下 main.ts 只用 warnIfDimsStale() 检查生成文件是否过期。
//
// 规则（与原 refineDims 一致）：
//   - 实际比声明大就更新成实测值（只放大不缩小，xz 按原点对称）；
//   - 陷进地面的（最低点 < -0.5）整体抬到地面上（build 外包一层把模型抬高 lift）；
//   - 壁挂、贴附、挂起形态、设备的原点约定不同，不处理。

import * as THREE from 'three'
import type { AssetDef } from './kit'

/** id → [w, d, h, lift]：只记需要修正的素材 */
export type DimsTable = Record<string, readonly [number, number, number, number]>

/** 校正前的原始尺寸与 build（applyDims 时记下，过期检查要拿原始数据重新测） */
const ORIGINAL = new Map<string, { w: number; d: number; h: number; build: AssetDef['build'] }>()

/** 是否参与尺寸校正 */
export const dimsApplicable = (d: AssetDef) => !d.mount && !d.stick && d.form !== 'hanging' && !d.fixture

/** lift 保留两位小数（向上取，保证抬起后不再陷地） */
const roundLift = (x: number) => Math.ceil(x * 100) / 100

/** 测量一个素材（按原始声明与原始 build），返回需要的修正；不需要修正返回 null */
export function measureDims(def: AssetDef, box = new THREE.Box3()): [number, number, number, number] | null {
  if (!dimsApplicable(def)) return null
  const o = ORIGINAL.get(def.id)
  const decl = o ?? def
  const build = o?.build ?? def.build
  let g: THREE.Group
  try {
    g = build(def.palettes[0] ?? [])
  } catch {
    return null
  }
  g.updateMatrixWorld(true)
  box.setFromObject(g, true)
  if (box.isEmpty()) return null
  const lift = box.min.y < -0.5 ? roundLift(-box.min.y) : 0
  // 进位留 0.001cm 容差：浮点误差、体素尺寸量化（≤ 0.05cm 以内的抖动）不应让 120.0000001 进成 121
  const w = Math.ceil(2 * Math.max(box.max.x, -box.min.x) - 1e-3)
  const dd = Math.ceil(2 * Math.max(box.max.z, -box.min.z) - 1e-3)
  const h = Math.ceil(box.max.y + lift - 1e-3)
  if (w > decl.w + 1 || dd > decl.d + 1 || h > decl.h + 2 || lift) return [Math.max(decl.w, w), Math.max(decl.d, dd), Math.max(decl.h, h), lift]
  return null
}

/** 对全部素材测量一遍，得到完整的修正表（键按 id 排序，便于生成稳定的文件） */
export function computeDims(assets: AssetDef[]): DimsTable {
  const box = new THREE.Box3()
  const out: Record<string, [number, number, number, number]> = {}
  for (const d of [...assets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const fix = measureDims(d, box)
    if (fix) out[d.id] = fix
  }
  return out
}

/** 把修正表同步应用到素材上（构造 ASSETS 时调用一次）；返回应用的条数 */
export function applyDims(assets: AssetDef[], table: DimsTable) {
  let n = 0
  for (const d of assets) {
    const fix = table[d.id]
    if (!fix || !dimsApplicable(d) || ORIGINAL.has(d.id)) continue
    ORIGINAL.set(d.id, { w: d.w, d: d.d, h: d.h, build: d.build })
    const [w, dd, h, lift] = fix
    d.w = w
    d.d = dd
    d.h = h
    if (lift) {
      const orig = d.build
      d.build = (p) => {
        const m = orig(p)
        m.position.y += lift
        return m
      }
    }
    n++
  }
  return n
}

/** 比较两张修正表，返回不一致的 id（多出、缺少、数值不同） */
export function diffDims(a: DimsTable, b: DimsTable): string[] {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...ids].filter((id) => {
    const x = a[id]
    const y = b[id]
    return !x || !y || x.some((v, i) => Math.abs(v - y[i]) > 1e-6)
  })
}

/**
 * 仅开发环境：空闲时把全部素材重新测一遍，和 dims.generated.ts 对比，过期就 console.warn 提示跑 `pnpm gen:dims`。
 * 只告警，不改数据。
 */
export function warnIfDimsStale(assets: AssetDef[], table: DimsTable) {
  const todo = [...assets]
  const box = new THREE.Box3()
  const fresh: Record<string, [number, number, number, number]> = {}
  const step = (deadline?: IdleDeadline) => {
    const until = performance.now() + 12
    while (todo.length && (deadline ? deadline.timeRemaining() > 2 : performance.now() < until)) {
      const d = todo.shift()!
      const fix = measureDims(d, box)
      if (fix) fresh[d.id] = fix
    }
    if (todo.length) return schedule()
    const bad = diffDims(fresh, table)
    if (bad.length) console.warn(`[assets] src/three/dims.generated.ts 已过期（${bad.length} 个素材的尺寸修正不一致），请运行 pnpm gen:dims：`, bad.slice(0, 30))
  }
  const schedule = () => ('requestIdleCallback' in window ? requestIdleCallback(step, { timeout: 200 }) : setTimeout(step, 16))
  schedule()
}
