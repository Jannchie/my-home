// 「动画感」光照的材质端（画面效果默认都用，见 post.ts LookDef.material）：照 MToon（VRM 的二次元着色）那样，暗面换成一种「阴影色」，明暗交界提饱和度，边缘加轮廓光。
//
//   - 阴影色：暗面不是把固有色压灰，而是乘一个偏冷的淡紫、再提一点饱和度——动画里的影子是有颜色的
//     （MToon 的 shadeColor）。暗面 = 背光那一侧（N·L < 0，和两档色阶的分界一致，见 toon.ts setToonBands）加上落影；
//   - 明暗交界提饱和度：画画时光和影交界那一窄条颜色最鲜（投影的边缘、亮面转暗面的那条线），灰白的东西推不动；
//   - 两个量（sunLit、termEdge）在 toon.ts 对 lights_fragment_begin 的补丁里算好，这里在输出颜色前用。
// 强度都是所有材质共享的 uniform：动画感光照开着时 Sandbox3D 打开（入夜阴影色减弱，夜里主要是灯光），平时为 0，画面不变。
// 注入点：受光材质走 lightMask.ts 的 injectLightMask（它在里面调用 injectAnime）。

import * as THREE from 'three'
import { setToonBands } from './toon'
import { MAT_ID } from './matIds'

export const animeUniforms = {
  /** 阴影色的强度（0 = 不换，1 = 暗面完全换成阴影色） */
  uAnimeShade: { value: 0 },
  /** 阴影色（线性空间的乘数）：偏冷的淡紫 */
  uAnimeShadeTint: { value: new THREE.Color().setRGB(0.84, 0.8, 1.0) },
  /** 交界处饱和度加多少（0 = 不加，0.5 = 交界最浓处饱和度 ×1.5） */
  uTermSat: { value: 0 },
  /** 轮廓光强度（0 = 不加） */
  uAnimeRim: { value: 0 },
  /** 金属的画法强度（0 = 和涂装一样，1 = 动画里的金属：反射的天空一侧亮、地面一侧暗，中间一道利落的分界，再加一道细高光） */
  uAnimeMetal: { value: 0 },
}

const ANCHOR = '#include <opaque_fragment>'
/** 顶灯落影处乘的颜色（线性）：浅的蓝紫 */
const LAMP_SHADE = [0.86, 0.84, 0.98]
// 三个强度都是 0（不是「动画感」）时整段跳过：uniform 控制的分支，所有片元走同一边，没有额外开销
const BODY = /* glsl */ `
	// 顶灯的落影（toon.ts lampOcc）：补光也一起压暗一点，并偏向蓝紫（动画里的影子是浅的、有颜色的）
	outgoingLight *= mix( vec3( 1.0 ), vec3( ${LAMP_SHADE.map((v) => v.toFixed(2)).join(', ')} ), lampOcc );
	if ( uAnimeShade + uTermSat + uAnimeRim > 0.0 ) {
		vec3 anLum = vec3( 0.2126, 0.7152, 0.0722 );
		// 暗面、落影：乘阴影色、饱和度 ×1.5（画里的影子是有颜色的，比受光处更鲜）
		vec3 anShade = outgoingLight * uAnimeShadeTint;
		anShade = max( mix( vec3( dot( anShade, anLum ) ), anShade, 1.5 ), 0.0 );
		outgoingLight = mix( outgoingLight, anShade, uAnimeShade * ( 1.0 - sunLit ) );
		// 交界提饱和度（往外推可能把某个通道推成负的，夹到 0）
		outgoingLight = max( mix( vec3( dot( outgoingLight, anLum ) ), outgoingLight, 1.0 + uTermSat * termEdge ), 0.0 );
		// 轮廓光（MToon 的 parametric rim）：视线擦过表面的地方加一圈暖白的亮边，受光那一侧更亮。
		// 只给曲面、圆角（法线在屏幕上变化快的地方）：大片平面（墙、地板）斜着看时 N·V 也小，不能整面发亮
		float anNV = 1.0 - clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
		float anCurv = smoothstep( 0.004, 0.03, length( fwidth( normal ) ) );
		float anRim = pow( anNV, 3.0 ) * anCurv * uAnimeRim;
		outgoingLight += anRim * mix( vec3( 1.0, 0.95, 0.86 ), diffuseColor.rgb, 0.4 ) * ( 0.35 + 0.65 * sunLit );
		METAL_BODY
	}
	${ANCHOR}`

// 金属（合并成顶点色网格的家具零件，逐顶点的 mat 属性 = 金属）：卡通材质没有高光，金属画出来和哑光漆一样。
// 照动画里画金属的办法：按反射方向（世界空间）朝上还是朝下分成亮暗两块，分界利落；朝上一侧再加一道窄的亮带（天空 / 窗户的倒影）。
// 都是乘在受过光的颜色上：影子里、夜里的金属跟着暗，亮带也按亮度给，不会在暗处发光
const METAL_BODY = /* glsl */ `
		if ( uAnimeMetal > 0.0 && abs( vAnMat - ${MAT_ID.metal}.0 ) < 0.5 ) {
			vec3 anR = inverseTransformDirection( reflect( - geometryViewDir, normal ), viewMatrix );
			float anSky = smoothstep( -0.03, 0.03, anR.y );
			float anBand = smoothstep( 0.45, 0.52, anR.y ) * ( 1.0 - smoothstep( 0.68, 0.75, anR.y ) );
			vec3 anMetal = outgoingLight * mix( 0.5, 1.3, anSky ) + anBand * 0.6 * dot( outgoingLight, anLum ) * vec3( 1.0, 0.98, 0.95 );
			outgoingLight = mix( outgoingLight, anMetal, uAnimeMetal );
		}`

/** 受光材质（toon / lambert / phong / standard / physical）：由 injectLightMask 在换掉 lights_fragment_begin 之前调用 */
export function injectAnime(sh: THREE.WebGLProgramParametersWithUniforms) {
  if (!sh.fragmentShader.includes(ANCHOR) || !sh.fragmentShader.includes('#include <lights_fragment_begin>')) return
  // sunLit / termEdge / lampOcc 由 toon.ts 的全局补丁声明；three 改了那个块、补丁没打上时不注入（否则着色器编译不过）
  if (!(THREE.ShaderChunk as unknown as Record<string, string>).lights_fragment_begin.includes('lampOcc')) return
  Object.assign(sh.uniforms, animeUniforms)
  // 金属的画法只给合并成顶点色网格的家具（toon + 顶点色，带逐顶点的 mat）；别的材质不声明 mat 属性（绒毛层自己声明了同名属性）
  const metal = sh.shaderID === 'toon' && sh.vertexColors
  if (metal) sh.vertexShader = 'attribute float mat;\nvarying float vAnMat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAnMat = mat;')
  sh.fragmentShader =
    'uniform float uAnimeShade;\nuniform vec3 uAnimeShadeTint;\nuniform float uTermSat;\nuniform float uAnimeRim;\nuniform float uAnimeMetal;\n' +
    (metal ? 'varying float vAnMat;\n' : '') +
    sh.fragmentShader.replace(ANCHOR, BODY.replace('METAL_BODY', metal ? METAL_BODY : ''))
}

/** 「动画感」的强度：交界饱和度、阴影色、轮廓光 */
const TERM_SAT = 0.35
const SHADE = 0.85
const RIM = 0.35
const METAL = 1

/**
 * 开关「动画感」的全部全局状态：两档色阶（toon.ts）、阴影色、交界饱和度、轮廓光、金属的画法。
 * night：入夜程度（夜里阴影色减弱、轮廓光关掉，主要是灯光）。
 * 描边和经典一样是深色线（以前是提亮的彩色线，细线上几乎看不出差别，反而不如深色线清楚）。
 * 离开沙盘时 setAnimeLook(false) 还原，别处（素材库缩略图）照常
 */
export function setAnimeLook(on: boolean, night = 0) {
  setToonBands(on)
  animeUniforms.uTermSat.value = on ? TERM_SAT : 0
  animeUniforms.uAnimeShade.value = on ? SHADE * (1 - 0.5 * night) : 0
  animeUniforms.uAnimeRim.value = on ? RIM * (1 - night) : 0
  animeUniforms.uAnimeMetal.value = on ? METAL : 0
}
