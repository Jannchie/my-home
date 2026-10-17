// 素材声明和模型要对得上（packkit 的开发期断言跑全量）：
//   surface 不高于顶面和模型顶、surfaceShape 在占地以内、壁挂件最低点 ≈ mount、屏幕面板（screens）的顶边和几何一致。
// 只做结构性断言。已知问题登记在 KNOWN 里并注明原因；修好后要把那一条删掉（多余的登记也会失败）。
import { expect, test } from 'vitest'
import { ASSETS } from '/src/three/assets'
import { modelProblems, staticProblems } from '/src/three/packkit'

const KNOWN: Record<string, string> = {
}

test('素材声明与模型一致', () => {
  const bad: Record<string, string[]> = {}
  for (const a of ASSETS) {
    const p = [...staticProblems(a), ...modelProblems(a, a.build(a.palettes[0] ?? []))]
    if (p.length) bad[a.id] = p
  }
  const unexpected = Object.fromEntries(Object.entries(bad).filter(([id]) => !KNOWN[id]))
  expect(unexpected).toEqual({})
  const stale = Object.keys(KNOWN).filter((id) => !bad[id])
  expect(stale, '这些登记的问题已经修好，请从 KNOWN 里删掉').toEqual([])
})
