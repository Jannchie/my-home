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
// 照动画里画金属的办法，按反射方向（世界空间）画一张假的「周围环境」：
//   - 分档的底色：朝下（映着地面、柜体）暗，水平（映着墙）中等，越往上越亮（天花板、天空），一档一档利落地分开，
//     站着看台面时反射大多朝斜上（仰角 25°–45°），近处亮、远处暗的几档正好横过台面；
//   - 两条平行的细亮线（窗户、日光灯的倒影），也落在台面那段仰角里，水龙头、拉手这些圆的零件上是一圈亮环；
//   - 硬边高光：反射对准太阳（照得到时）或正上方的顶灯，一小块亮过泛光阈值的白，会晕开。
// 底色乘在受过光的颜色上，亮线、高光也按亮度给：影子里、夜里的金属跟着暗，不会在暗处发光
const METAL_BODY = /* glsl */ `
		if ( uAnimeMetal > 0.0 && abs( vAnMat - ${MAT_ID.metal}.0 ) < 0.5 ) {
			vec3 anR = inverseTransformDirection( reflect( - geometryViewDir, normal ), viewMatrix );
			float anL = dot( outgoingLight, anLum );
			float anLv = mix( 0.36, 0.78, smoothstep( -0.06, 0.0, anR.y ) );
			anLv = mix( anLv, 1.02, smoothstep( 0.36, 0.39, anR.y ) );
			anLv = mix( anLv, 1.3, smoothstep( 0.6, 0.63, anR.y ) );
			float anLine = ( smoothstep( 0.462, 0.47, anR.y ) - smoothstep( 0.484, 0.492, anR.y ) ) + 0.7 * ( smoothstep( 0.52, 0.527, anR.y ) - smoothstep( 0.538, 0.545, anR.y ) );
			float anHot = smoothstep( 0.9, 0.93, anR.y );
			#if NUM_DIR_LIGHTS > 0
			vec3 anSunR = inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix );
			anHot = max( anHot, smoothstep( 0.982, 0.988, dot( anR, anSunR ) ) * sunLit );
			#endif
			// 金属偏一点冷（映着天光）
			vec3 anMetal = outgoingLight * anLv * vec3( 0.95, 0.98, 1.04 ) + ( anLine * 1.5 + anHot * 2.6 ) * ( 0.25 + anL ) * vec3( 1.0, 0.98, 0.95 );
			outgoingLight = mix( outgoingLight, anMetal, uAnimeMetal );
		}`

/** 受光材质（toon / lambert / phong / standard / physical）：由 injectLightMask 在换掉 lights_fragment_begin 之前调用 */
export function injectAnime(sh: THREE.WebGLProgramParametersWithUniforms) {
  if (!sh.fragmentShader.includes(ANCHOR) || !sh.fragmentShader.includes('#include <lights_fragment_begin>')) return
  // sunLit / termEdge / lampOcc 由 toon.ts 的全局补丁声明；three 改了那个块、补丁没打上时不注入（否则着色器编译不过）
  if (!(THREE.ShaderChunk as unknown as Record<string, string>).lights_fragment_begin.includes('lampOcc')) return
  Object.assign(sh.uniforms, animeUniforms)
  // 金属的画法：合并成顶点色网格的家具逐顶点判断（toon + 顶点色，带逐顶点的 mat；别的材质不声明 mat 属性，绒毛层自己声明了同名属性）；
  // 没合并的金属零件（厨房台面、水槽、设备的拉手……）由 markMetalParts 换成带 ANIME_METAL 宏的材质，整个材质都按金属画
  const perVertex = sh.shaderID === 'toon' && sh.vertexColors
  const whole = !perVertex && sh.defines?.ANIME_METAL !== undefined
  const metal = perVertex || whole
  if (perVertex) sh.vertexShader = 'attribute float mat;\nvarying float vAnMat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAnMat = mat;')
  sh.fragmentShader =
    'uniform float uAnimeShade;\nuniform vec3 uAnimeShadeTint;\nuniform float uTermSat;\nuniform float uAnimeRim;\nuniform float uAnimeMetal;\n' +
    (perVertex ? 'varying float vAnMat;\n' : whole ? `#define vAnMat ${MAT_ID.metal}.0\n` : '') +
    sh.fragmentShader.replace(ANCHOR, BODY.replace('METAL_BODY', metal ? METAL_BODY : ''))
}

const metalMats = new WeakMap<THREE.Material, THREE.Material>()
/**
 * 没合并成顶点色网格的金属零件（userData.mat = 'metal' 的 toon 网格，比如设备的台面、水槽、拉手）：换成同款材质的一份带 ANIME_METAL 宏的克隆，
 * 赛璐璐下也按金属画（同一个源材质只克隆一次）。要在 resolveMats 之后调用
 */
export function markMetalParts(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || o.userData.isOutline || o.userData.mat !== 'metal' || Array.isArray(mesh.material)) return
    const m = mesh.material as THREE.MeshToonMaterial
    if (!m.isMeshToonMaterial || m.vertexColors || m.defines?.ANIME_METAL !== undefined) return
    let v = metalMats.get(m)
    if (!v) {
      v = m.clone()
      v.defines = { ...m.defines, ANIME_METAL: '' }
      // clone 不带 onBeforeCompile / customProgramCacheKey（灯光遮罩、赛璐璐都注入在那里）
      v.onBeforeCompile = m.onBeforeCompile
      v.customProgramCacheKey = m.customProgramCacheKey
      metalMats.set(m, v)
    }
    mesh.material = v
  })
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
