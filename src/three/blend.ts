// 不动 alpha 的混合方式：画进主画面的 alpha 里有泛光的发光标记（anime.ts uGlowMark：不发光 = 1，发光 = 2 + 发光量）
// 和背景覆盖率（post.ts Base 按它合成天色）。叠在物体上的半透明效果（光斑、高亮、浮尘、粒子）改了 alpha，
// 就会被当成光源晕开、或在天空上挖出黑点，所以它们只加颜色、alpha 原样保留

import * as THREE from 'three'

/** 混合时 alpha 原样保留（颜色怎么混由各自决定） */
export const KEEP_ALPHA = { blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor } as const

/** 颜色按 alpha 相加（同 AdditiveBlending），alpha 不动 */
export const ADDITIVE_KEEP_ALPHA = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  ...KEEP_ALPHA,
} as const

/**
 * 加色的材质（AdditiveBlending，或上面这种只加颜色的自定义混合）：黑白漫画、遮蔽那一遍按它认出光斑、粒子。
 * 悬停高亮（highlight.ts，已有颜色 × k 再加回去）不算
 */
export const isAdditive = (m: THREE.Material | undefined) =>
  !!m && (m.blending === THREE.AdditiveBlending || (m.blending === THREE.CustomBlending && m.blendDst === THREE.OneFactor && (m.blendSrc === THREE.SrcAlphaFactor || m.blendSrc === THREE.OneFactor)))
