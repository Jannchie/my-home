// 「黑白漫画」系列画面效果的材质端：开启时所有受光材质不输出颜色，而是输出给后处理用的编码。
//
// 漫画上色分两层：固有色决定底色档（白 / 浅网点 / 深网点 / 黑），阴影再压深一档。
// 从最终画面的亮度去猜这两层会混在一起（深色物体和落在阴影里的浅色物体一样暗），
// 而着色器里两者都是现成的，所以在这里直接算出档位：
//   底色档：固有色的感知明度 V（CIELAB L* 加 Helmholtz–Kohlrausch 校正，Fairchild & Pirrotta：
//          高饱和色看起来比同 L* 的灰更亮，画师也会给它浅一档），≥82 白、≤35 黑，中间等分
//   阴影档：受光比（光照后亮度 ÷ 固有色亮度 ÷「完全受光」的基准）。白天落影约 0.45、背光面约 0.75、
//          正面受光约 1；低于 0.85 深一档、低于 0.25 深两档。入夜阈值上移：只有被灯照到的地方留白
// 输出：R = 档位 / 4（0 白 … 0.75 黑；描边外壳在 toon.ts 里输出 1 = 墨线），
//       GB = 视空间法线 xy（后处理比较相邻像素的法线画转折线；法线是线性量，MSAA 边缘平均后仍有意义）
// 发光体（灯、屏幕、入夜的窗）按纸白处理。
// 注入点：受光材质走 lightMask.ts 的 injectLightMask（它在里面调用 injectManga），MeshBasicMaterial 在这里挂原型。
// uManga 只在 post.ts 渲染漫画帧的那一次 draw 里为 1，平时材质照常输出颜色。

import * as THREE from 'three'

export const mangaUniforms = {
  uManga: { value: 0 },
  /** 「完全受光」时的受光比（太阳 + 天光），由 post.ts 每帧按灯光算 */
  uMangaLitRef: { value: 1 },
  uMangaNight: { value: 0 },
}

const PARS = /* glsl */ `
uniform float uManga, uMangaLitRef, uMangaNight;
float mangaValue( vec3 c ) {
	vec3 xyz = vec3(
		dot( c, vec3( 0.4124, 0.3576, 0.1805 ) ),
		dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ),
		dot( c, vec3( 0.0193, 0.1192, 0.9505 ) ) ) / vec3( 0.95047, 1.0, 1.08883 );
	xyz = max( xyz, 0.0 );
	vec3 f = mix( xyz * 7.787 + 0.137931, pow( xyz, vec3( 1.0 / 3.0 ) ), step( 0.008856, xyz ) );
	float L = 116.0 * f.y - 16.0;
	vec2 ab = vec2( 500.0 * ( f.x - f.y ), 200.0 * ( f.y - f.z ) );
	float h = atan( ab.y, ab.x + 1e-6 );
	return L + ( 2.5 - 0.025 * L ) * ( 0.116 * abs( sin( ( h - 1.5707963 ) * 0.5 ) ) + 0.085 ) * length( ab );
}
float mangaBase( vec3 c ) {
	return clamp( floor( ( 82.0 - mangaValue( c ) ) / 47.0 * 3.0 + 0.5 ), 0.0, 3.0 );
}
`

const ANCHOR = '#include <opaque_fragment>'

const LIT = /* glsl */ `${ANCHOR}
	if ( uManga > 0.5 ) {
		vec3 mgW = vec3( 0.2126, 0.7152, 0.0722 );
		float mgLit = dot( outgoingLight, mgW ) / max( dot( diffuseColor.rgb, mgW ), 0.004 ) / uMangaLitRef;
		float mgShade = mgLit < mix( 0.25, 0.5, uMangaNight ) ? 2.0 : mgLit < mix( 0.85, 1.2, uMangaNight ) ? 1.0 : 0.0;
		float mgLevel = dot( totalEmissiveRadiance, mgW ) > 0.12 ? 0.0 : min( mangaBase( diffuseColor.rgb ) + mgShade, 3.0 );
		gl_FragColor.rgb = vec3( mgLevel * 0.25, normal.xy * 0.5 + 0.5 );
	}`

// 不受光（没有法线）：按正对镜头记
const BASIC = /* glsl */ `${ANCHOR}
	if ( uManga > 0.5 ) gl_FragColor.rgb = vec3( mangaBase( diffuseColor.rgb ) * 0.25, 0.5, 0.5 );`

let warned = false
function inject(sh: THREE.WebGLProgramParametersWithUniforms, body: string) {
  if (!sh.fragmentShader.includes(ANCHOR)) {
    if (!warned) {
      warned = true
      console.warn('[manga] three 的 opaque_fragment 变了，黑白漫画编码没有生效')
    }
    return
  }
  Object.assign(sh.uniforms, mangaUniforms)
  sh.fragmentShader = PARS + sh.fragmentShader.replace(ANCHOR, body)
}

/** 受光材质（toon / lambert / phong / standard / physical）：由 injectLightMask 调用 */
export function injectManga(sh: THREE.WebGLProgramParametersWithUniforms) {
  inject(sh, LIT)
}

;(THREE.MeshBasicMaterial.prototype as THREE.Material).onBeforeCompile = (sh) => inject(sh, BASIC)
