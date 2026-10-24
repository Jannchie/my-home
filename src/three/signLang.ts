// 带字的素材（奖状、日用品标签、留言板、门口脚垫、电子钟的日期…）上的字跟着界面语言走：
// 每种语言各画一版，措辞、排版按当地习惯（日式奖状竖排、英文证书花体标题），不是逐字翻译。
//
// 素材 def 标 lingual：模型模板（house.ts furnitureTemplateKey）、缩略图（thumbs.ts）的缓存键带上语言，
// 切换语言时沙盘里这些家具重建（Sandbox3D syncFurniture）。
// build 里用 say({ zh, ja, en }) 取当前语言那一版；画布贴图的 key 也要带上 signLang()（paintPanel 按 key 共用贴图）。
// 书法、挂轴、海报这类作品上的字属于作品本身（中国画的题字、日本挂轴），不跟语言换。

import { lang, type Lang } from '../i18n'

/** 读了几次语言：测试据此检查「build 里读了语言的素材都标了 lingual」 */
let reads = 0
export const signReads = () => reads

export const signLang = (): Lang => {
  reads++
  return lang.value
}
export const say = <T>(v: Record<Lang, T>): T => v[signLang()]
/** 缓存键里的语言部分：不带字的素材是空串（切语言不重建） */
export const lingualKey = (def: { lingual?: boolean } | undefined) => (def?.lingual ? lang.value : '')

const SANS: Record<Lang, string> = {
  zh: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
  ja: '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif',
  en: '"Helvetica Neue",Arial,sans-serif',
}
/** 当前语言的无衬线字体（通用 sans-serif 在日文系统上缺简体字形，会东拼西凑） */
export const signSans = () => SANS[signLang()]
