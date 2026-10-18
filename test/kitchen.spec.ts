// 整体厨房（设备 kitchen）的正面：灶下的旋钮面板、洗碗机、柜门各占一列，旋钮不压柜门 / 拉手
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { kitchenModel } from '/src/three/assets'

const boxes = (g: THREE.Object3D, kind: string) => {
  g.updateMatrixWorld(true)
  const out: THREE.Box3[] = []
  g.traverse((o) => {
    if (o.userData.kitchenPart === kind) out.push(new THREE.Box3().setFromObject(o, true))
  })
  return out
}
/** 两个盒子实心相交（各方向重叠都超过 eps；贴着不算） */
const hit = (a: THREE.Box3, b: THREE.Box3, eps = 0.05) =>
  Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > eps && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > eps && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > eps
/** 正面投影（x × y）重叠：旋钮前后错开也不行，看上去就是叠在柜门上 */
const faceHit = (a: THREE.Box3, b: THREE.Box3, eps = 0.05) => Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > eps && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > eps

const variants = [150, 165, 180, 210, 225, 240, 255, 270, 300].flatMap((w) =>
  [false, true].flatMap((facing) =>
    [false, true].flatMap((induction) =>
      [false, true].flatMap((dishwasher) =>
        ([2, 3] as const).flatMap((burners) => (facing ? [false, true] : [false]).map((island) => ({ w, facing, induction, dishwasher, burners, island }))),
      ),
    ),
  ),
)

describe('整体厨房正面', () => {
  test('旋钮在旋钮面板里，不和柜门、抽屉、洗碗机、拉手重叠；各块门板互不重叠', () => {
    const bad: string[] = []
    for (const v of variants) {
      const g = kitchenModel(v.w, v.facing, v.burners, v)
      const tag = JSON.stringify(v)
      const knobs = boxes(g, 'knob')
      const fascia = boxes(g, 'fascia')
      const fronts = boxes(g, 'front')
      const handles = boxes(g, 'handle')
      if (!v.island && knobs.length !== 4) bad.push(`${tag}: ${knobs.length} 个旋钮`)
      if (v.island && knobs.length) bad.push(`${tag}: 岛台上有旋钮`)
      for (const k of knobs) {
        if (!fascia.some((f) => faceHit(k, f) && k.min.x >= f.min.x && k.max.x <= f.max.x && k.min.y >= f.min.y && k.max.y <= f.max.y)) bad.push(`${tag}: 旋钮不在面板范围里`)
        if (fronts.some((f) => faceHit(k, f))) bad.push(`${tag}: 旋钮压在柜门上`)
        if (handles.some((h) => faceHit(k, h))) bad.push(`${tag}: 旋钮压在拉手上`)
      }
      for (const f of fascia) {
        if (fronts.some((d) => hit(f, d))) bad.push(`${tag}: 旋钮面板插进柜门`)
        if (handles.some((h) => hit(f, h))) bad.push(`${tag}: 拉手穿过旋钮面板`)
      }
      for (let i = 0; i < fronts.length; i++) for (let j = i + 1; j < fronts.length; j++) if (faceHit(fronts[i], fronts[j], 0.2)) bad.push(`${tag}: 门板 ${i} / ${j} 重叠`)
      // 每个拉手只落在一块门板上
      for (const h of handles) if (fronts.filter((f) => faceHit(h, f)).length !== 1) bad.push(`${tag}: 拉手跨了门板`)
    }
    expect(bad).toEqual([])
  })

  test('宽一些的厨房装得下洗碗机', () => {
    for (const w of [240, 255, 270, 300])
      for (const facing of [false, true]) {
        let n = 0
        kitchenModel(w, facing, 3, { dishwasher: true }).traverse((o) => (n += o.userData.dishwasher ? 1 : 0))
        expect(n).toBe(1)
      }
  })
})
