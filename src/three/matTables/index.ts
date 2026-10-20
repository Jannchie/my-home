// 素材材质标注表（mats.ts）：按批写在同目录的各个文件里（每批一个文件，分头补互不冲突），这里合起来。
// 每项：id → 各配色槽的材质（和 palettes 里每组颜色一一对应，null = 这一槽交给推断），
// 或 { mats, mat }（mat = 整件的默认材质：推断不出来的零件按它）。素材定义里自己写了 mats / mat 的优先。
// assets.ts 加载时合并进 AssetDef；test/mats.spec.ts 检查 id 存在、类别合法、槽数不超过配色。

import type { Mat } from '../matIds'

export type MatEntry = (Mat | null)[] | { mats?: (Mat | null)[]; mat?: Mat }

const modules = import.meta.glob<{ default: Record<string, MatEntry> }>('./*.ts', { eager: true })

/** 所有批次合起来的表（后面的文件不覆盖前面的：同一个 id 写在两处时 mats.spec.ts 会报出来） */
export const MAT_TABLE: Record<string, MatEntry> = {}
/** 每个 id 写在哪些文件里（查重用） */
export const MAT_TABLE_SOURCES: Record<string, string[]> = {}
for (const [file, mod] of Object.entries(modules)) {
  if (file === './index.ts') continue
  for (const [id, e] of Object.entries(mod.default)) {
    ;(MAT_TABLE_SOURCES[id] ??= []).push(file)
    MAT_TABLE[id] ??= e
  }
}
