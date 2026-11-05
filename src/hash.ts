/** 字符串的 FNV-1a 32 位哈希（无符号整数）：按 id、名字固定下来的「随机」选择、随机数种子、内容指纹都用它 */
export function fnv1a(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
