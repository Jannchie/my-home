// 宣传片自己的文案（三语）。界面里已有的词（风格名、滤镜名、地区、兴趣、职业、房间名、标语）直接走应用的 t()，
// 这里只放宣传片专用的句子。语言跟应用一致：地址里的 ?lang=zh|ja|en（录制脚本 --lang）。

import { lang, t } from '../i18n'

const TEXT: Record<string, [ja: string, en: string]> = {
  一键布置: ['ワンクリックで家具配置', 'One-click furnishing'],
  住户设定: ['住む人の設定', 'Residents'],
  '风格偏好与兴趣等级，决定每个房间的家具': ['好みのスタイルと趣味のレベルで、部屋ごとの家具が決まる', 'Style taste and hobby levels shape every room'],
  '{n} 种风格': ['{n} つのスタイル', '{n} styles'],
  昼夜光照: ['昼と夜の光', 'Day and night'],
  画面效果: ['画面エフェクト', 'Looks'],
  自定义户型: ['間取りを自由に編集', 'Edit your own floor plan'],
  '{n} 件素材': ['{n} 点の素材', '{n} assets'],
  '{n} 室': ['{n} 部屋', '{n}-bed'],
  风格偏好: ['好きなスタイル', 'Style'],
  兴趣: ['趣味', 'Hobbies'],
  '{n} 岁 · {job}': ['{n} 歳 · {job}', '{job}, {n}'],
  '紧凑的 nLDK 格局，玄关落差、榻榻米和室、整体浴室': ['コンパクトな nLDK：玄関の段差、和室、ユニットバス', 'Compact nLDK: raised genkan, tatami room, unit bath'],
  '客餐厅一体，主卧带卫，景观阳台与生活阳台': ['リビングダイニング一体、主寝室に専用バス、二つのバルコニー', 'Open living and dining, en-suite master, two balconies'],
  '开放式客厅配厨房中岛，主卧套间带衣帽间，独立洗衣房': ['アイランドキッチンのある開放的な LDK、WIC 付き主寝室、独立ランドリー', 'Open-plan living with kitchen island, primary suite, laundry room'],
}

/** 宣传片文案：中文原文作 key，{n} 等占位按 params 替换 */
export function L(zh: string, params: Record<string, string | number> = {}) {
  const row = TEXT[zh]
  let s = !row || lang.value === 'zh' ? (row ? zh : t(zh)) : row[lang.value === 'ja' ? 0 : 1]
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** 英文 / 日语版的住户名字：按原名稳定地映射（同一户里不重复） */
const EN_NAMES = ['Alex', 'Mia', 'Jordan', 'Chloe', 'Ryan', 'Emma', 'Leo', 'Grace', 'Sam', 'Lily', 'Noah', 'Ava']
/** 日语版的住户名字：日本常见的名字 */
const JA_NAMES = ['陽翔', '結衣', '蒼', '美桜', '蓮', '陽菜', '湊', '紬', '大和', '葵', '悠真', '凛']
export function personName(name: string, taken: Set<string>) {
  if (lang.value === 'zh') return name
  const list = lang.value === 'ja' ? JA_NAMES : EN_NAMES
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  let k = (h >>> 0) % list.length
  while (taken.has(list[k])) k = (k + 1) % list.length
  taken.add(list[k])
  return list[k]
}
