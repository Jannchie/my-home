// 素材包注册：自动收集本目录下所有文件导出的素材数组（AssetDef[]）。
// 新增素材包只要在这里放一个 .ts 文件并导出数组即可；某个包暂时没写完、导出为空也不会影响其他包。

import type { AssetDef } from '../kit'

const mods = import.meta.glob('./*.ts', { eager: true }) as Record<string, Record<string, unknown>>

const isAsset = (x: unknown): x is AssetDef => !!x && typeof x === 'object' && 'id' in x && 'build' in x

export const PACKS: AssetDef[] = Object.keys(mods)
  .filter((k) => !k.endsWith('/index.ts'))
  .sort()
  .flatMap((k) => Object.values(mods[k]).filter(Array.isArray).flat().filter(isAsset))
