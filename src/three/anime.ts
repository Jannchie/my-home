// 「动画感」光照的材质端（画面效果默认都用，见 post.ts LookDef.material）：照 MToon（VRM 的二次元着色）那样，暗面换成一种「阴影色」，明暗交界提饱和度，边缘加轮廓光。
//
//   - 阴影色：暗面不是把固有色压灰，而是乘一个偏冷的淡紫、再提一点饱和度——动画里的影子是有颜色的
//     （MToon 的 shadeColor）。暗面 = 背光那一侧（N·L < 0，和两档色阶的分界一致，见 toon.ts setToonBands）加上落影；
//   - 明暗交界提饱和度：画画时光和影交界那一窄条颜色最鲜（投影的边缘、亮面转暗面的那条线），灰白的东西推不动；
//   - 两个量（sunLit、termEdge）在 toon.ts 对 lights_fragment_begin 的补丁里算好，这里在输出颜色前用。
// 强度都是所有材质共享的 uniform：动画感光照开着时 Sandbox3D 打开（入夜阴影色减弱，夜里主要是灯光），平时为 0，画面不变。
// 注入点：受光材质走 lightMask.ts 的 injectLightMask（它在里面调用 injectAnime）。

import * as THREE from 'three'
import { cloneWithHooks, setToonBands } from './toon'
import { MAT_ID } from './matIds'
import { HASH_NOISE } from './glslNoise'

/** 地板倒映窗户时最多看几扇窗（离镜头最近的；post.ts 选） */
export const MAX_WIN = 8

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
  /** 「插画」平涂的强度（0 = 不用，1 = 受光的颜色整个换成按朝向分三档的平涂和纯色落影） */
  uIllust: { value: 0 },
  /** 「插画」的入夜程度（0 = 白天按朝向平涂，1 = 夜色底 + 灯光分档） */
  uIllustNight: { value: 0 },
  /**
   * 泛光的标记（post.ts 只在画进后处理的那一次打开）：不透明材质把自己发出的光（自发光 + 金属的硬边高光）写进 alpha——
   * 不发光 = 1，发光 = 2 + 发光量（线性亮度）。泛光只从这个标记里取，受光再亮（白墙、悬停高亮提亮的桌面）也不晕开
   */
  uGlowMark: { value: 0 },
  /** 地板（材质带 ANIME_FLOOR 宏）木纹、砖缝的对比和饱和度收多少（0 = 不收，1 = 对比约减半、饱和度 ×0.8） */
  uAnimeFloor: { value: 0 },
  /** 地板倒映窗户的强度（0 = 不画；见 FLOOR_REFL），uWinColor = 倒影的颜色（线性，天光色，post.ts 每帧设） */
  uFloorRefl: { value: 0 },
  uWinColor: { value: new THREE.Color(0.9, 0.95, 1.0) },
  /**
   * 离镜头最近的几扇窗（post.ts 每帧设）：A = 窗玻璃中心（世界坐标）+ 朝向（0 = 法线沿 x，1 = 沿 z）；
   * B = 半宽、半高、两侧的房间编号（lightMask 编号图；地板只倒映同一房间的窗）
   */
  uWinA: { value: Array.from({ length: MAX_WIN }, () => new THREE.Vector4()) },
  uWinB: { value: Array.from({ length: MAX_WIN }, () => new THREE.Vector4()) },
  uWinCount: { value: 0 },
  /** 窗玻璃（ANIME_GLASS 宏）上两道斜向高光的强度 */
  uAnimeGlass: { value: 0 },
}

/** 阴影色：平时偏冷的淡紫；太阳低（傍晚、清晨）时更紫、更浓，和金橙的阳光对比 */
const SHADE_TINT = new THREE.Color().setRGB(0.84, 0.8, 1.0)
const SHADE_TINT_GOLDEN = new THREE.Color().setRGB(0.8, 0.76, 1.0)

// 地板（house.ts floorMaterial 带 ANIME_FLOOR 宏）：动画背景里大面积的地面是低对比、低饱和的，木纹只是一层淡淡的纹理，
// 不抢家具和光斑。纹理的局部平均色取贴图很高一级的 mip，往它收一半，再降一点饱和度
const FLOOR_BODY = /* glsl */ `
	#ifdef USE_MAP
	if ( uAnimeFloor > 0.0 ) {
		vec3 afMean = diffuse * texture2D( map, vMapUv, 8.0 ).rgb;
		vec3 afC = mix( afMean, diffuseColor.rgb, 1.0 - 0.45 * uAnimeFloor );
		afC = mix( vec3( dot( afC, vec3( 0.2126, 0.7152, 0.0722 ) ) ), afC, 1.0 - 0.2 * uAnimeFloor );
		diffuseColor.rgb = afC;
	}
	#endif
`

// 地板倒映窗户（京阿尼的室内背景里最有辨识度的一笔：打了蜡的木地板上一道竖着拉长、边缘模糊的窗户亮影）。
// 不另画一遍场景：视线在地板上镜像以后朝上走，和附近几扇窗的玻璃面求交（窗都是横平竖直的，按 x / z 一个平面），
// 落在窗里就加一片天光色；越远越糊（边缘放宽）、竖着比横着更糊（拉长），越掠射越亮（菲涅耳）。
// 只算同一房间的窗（lightMask 的编号图），不会隔着墙倒映隔壁的窗；中间挡着的家具不管（画的倒影本来就是示意）
const FLOOR_REFL = /* glsl */ `
	if ( uFloorRefl > 0.0 && uWinCount > 0 ) {
		vec3 frP = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
		vec3 frV = normalize( frP - cameraPosition );
		vec3 frR = vec3( frV.x, - frV.y, frV.z );
		float frRoom = lmFetch( frP.xz, lmFloorOf( frP.y + 5.0 ) ).x;
		float frAcc = 0.0;
		for ( int i = 0; i < ${MAX_WIN}; i ++ ) {
			if ( i >= uWinCount ) break;
			vec4 wa = uWinA[ i ];
			vec4 wb = uWinB[ i ];
			if ( abs( frRoom - wb.z ) > 0.5 && abs( frRoom - wb.w ) > 0.5 ) continue;
			bool alongX = wa.w < 0.5;
			float rn = alongX ? frR.x : frR.z;
			if ( abs( rn ) < 1e-4 ) continue;
			float t = ( alongX ? wa.x - frP.x : wa.z - frP.z ) / rn;
			if ( t <= 0.0 ) continue;
			vec3 frH = frP + frR * t;
			float tu = abs( alongX ? frH.z - wa.z : frH.x - wa.x ) - wb.x;
			float tv = abs( frH.y - wa.y ) - wb.y;
			float soft = 2.0 + 0.05 * t;
			frAcc += ( 1.0 - smoothstep( - soft, soft, tu ) ) * ( 1.0 - smoothstep( - soft * 3.0, soft * 3.0, tv ) ) * ( 1.0 - smoothstep( 200.0, 800.0, t ) );
		}
		float frFres = 0.3 + 0.7 * pow( 1.0 - abs( frV.y ), 3.0 );
		outgoingLight += min( frAcc, 1.0 ) * frFres * uFloorRefl * uWinColor;
	}
`

// 窗玻璃（windows.ts，ANIME_GLASS 宏）：动画里的窗玻璃总有两道平行的斜向高光（一宽一窄），玻璃一下就读出来了。
// 按世界坐标画（窗不论朝 x 还是 z，x + z 都沿着玻璃走），每 1.7m 重复一组；高光处玻璃也更不透明一点
const GLASS_BODY = /* glsl */ `
	#ifdef ANIME_GLASS
	if ( uAnimeGlass > 0.0 ) {
		vec3 agW = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
		float agD = fract( ( agW.x + agW.z + agW.y * 0.9 ) / 170.0 );
		float agS = smoothstep( 0.28, 0.3, agD ) - smoothstep( 0.37, 0.39, agD ) + 0.6 * ( smoothstep( 0.43, 0.445, agD ) - smoothstep( 0.47, 0.485, agD ) );
		outgoingLight += agS * uAnimeGlass * 0.55;
		diffuseColor.a = min( 1.0, diffuseColor.a + agS * uAnimeGlass * 0.35 );
	}
	#endif
`

const ANCHOR = '#include <opaque_fragment>'
/** 顶灯落影处乘的颜色（线性）：浅的蓝紫 */
const LAMP_SHADE = [0.86, 0.84, 0.98]
// 三个强度都是 0（不是「动画感」）时整段跳过：uniform 控制的分支，所有片元走同一边，没有额外开销
const BODY = /* glsl */ `
	float anGlow = 0.0;
	vec3 anLum = vec3( 0.2126, 0.7152, 0.0722 );
	// 顶灯的落影（toon.ts lampOcc）：补光也一起压暗一点，并偏向蓝紫（动画里的影子是浅的、有颜色的）
	outgoingLight *= mix( vec3( 1.0 ), vec3( ${LAMP_SHADE.map((v) => v.toFixed(2)).join(', ')} ), lampOcc );
	ILLUST_BODY
	if ( uAnimeShade + uTermSat + uAnimeRim > 0.0 ) {
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
		// 深色的东西（黑沙发、黑家电）：轮廓光加重，朝上的面再加一层淡淡的天光反光——动画里黑色的物件靠亮边和反光把形体提出来，
		// 不然只剩一团黑（固有色线性亮度 0.03 以下算全黑，0.15 以上不加）
		float anDark = 1.0 - smoothstep( 0.03, 0.15, dot( diffuseColor.rgb, anLum ) );
		float anRim = pow( anNV, 3.0 ) * anCurv * uAnimeRim * ( 1.0 + 1.5 * anDark );
		outgoingLight += anRim * mix( vec3( 1.0, 0.95, 0.86 ), diffuseColor.rgb, 0.4 ) * ( 0.35 + 0.65 * sunLit );
		float anUp = smoothstep( 0.4, 0.9, inverseTransformDirection( normal, viewMatrix ).y );
		outgoingLight += anDark * anUp * uAnimeRim * 0.12 * vec3( 0.86, 0.9, 1.0 ) * ( 0.4 + 0.6 * sunLit );
	}
	METAL_BODY
	FLOOR_REFL_BODY
	${GLASS_BODY}
	${ANCHOR}
	#ifdef OPAQUE
	anGlow += dot( totalEmissiveRadiance, anLum );
	if ( uGlowMark > 0.5 && anGlow > 0.003 ) gl_FragColor.a = 2.0 + anGlow;
	#endif`

// 插画（参考手绘的等距插画）：不按光照的强弱，按面的朝向（世界空间）平涂三档——朝上的面最亮，
// 侧面里朝着太阳那一边（水平方向）是中间一档，背着太阳的一边、朝下的面最暗；镜头怎么转盒子都有清楚的体积感。
// 落影（朝着太阳却被挡住的地方）是一块纯色：固有色压暗后和固定的蓝紫各一半，硬边。
// 颜色只看固有色（diffuseColor，含贴图、顶点色），自发光照加。
// 入夜也是平涂：整体压成偏冷的夜色，灯照到的地方按受光量提亮成两档、带灯的暖色（uIllustNight 在两套之间过渡）。
// 纸纹按世界坐标贴在表面上（三个轴向的投影按法线混合），转镜头时跟着物体走，不是盖在屏幕上的一层：
// 细颗粒（约 2 cm）、中等的纤维团（约 8 cm）、大块的不均匀色斑（约半米），每层在屏幕上小于一个像素时淡掉，远处不闪
// 落影色（线性）是一块饱和的蓝紫（#41538f）；纸纹浓度 0.8。
// 三个投影方向按法线的权重混合，几乎为 0 的方向不取样（墙、地板、盒子的面只取一个方向）
const ILLUST_SHADOW = new THREE.Color('#41538f')
const ILLUST_PARS = /* glsl */ `
${HASH_NOISE}
const vec3 IL_SHADOW = vec3( ${[ILLUST_SHADOW.r, ILLUST_SHADOW.g, ILLUST_SHADOW.b].map((v) => v.toFixed(4)).join(', ')} );
const float IL_PAPER = 0.8;
float ilTri( vec3 w, vec3 k, float f ) {
	float v = 0.0;
	if ( k.x > 0.01 ) v += vnoise( w.zy * f ) * k.x;
	if ( k.y > 0.01 ) v += vnoise( w.xz * f + 31.7 ) * k.y;
	if ( k.z > 0.01 ) v += vnoise( w.xy * f + 57.3 ) * k.z;
	return v;
}
`
const ILLUST_BODY = /* glsl */ `
	if ( uIllust > 0.0 ) {
		vec3 ilN = inverseTransformDirection( normal, viewMatrix );
		vec3 ilA = diffuseColor.rgb;
		float ilTone = mix( 0.5, 1.0, smoothstep( 0.5, 0.6, ilN.y ) );
		float ilDown = 1.0 - smoothstep( -0.6, -0.5, ilN.y );
		ilTone = mix( ilTone, 0.45, ilDown );
		float ilCast = 0.0;
		#if NUM_DIR_LIGHTS > 0
		vec3 ilS = inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix );
		vec2 ilSh = ilS.xz / max( length( ilS.xz ), 1e-4 );
		vec2 ilNh = ilN.xz / max( length( ilN.xz ), 1e-4 );
		float ilSide = smoothstep( 0.5, 0.6, ilN.y ) + ilDown;
		ilTone = mix( ilTone, 0.78, smoothstep( -0.05, 0.05, dot( ilNh, ilSh ) ) * ( 1.0 - ilSide ) );
		// 落影：朝着太阳（N·L > 0）、却没被照到
		ilCast = smoothstep( 0.0, 0.06, dot( normal, directionalLights[ 0 ].direction ) ) * ( 1.0 - sunLit );
		#endif
		vec3 ilFlat = ilA * ilTone;
		vec3 ilShade = mix( ilA * 0.4, IL_SHADOW, 0.65 );
		ilFlat = mix( ilFlat, min( ilShade, ilFlat ), ilCast );
		if ( uIllustNight > 0.0 ) {
			// 夜里：按这一点受到的光（主要是室内灯）分三档——夜色底、灯光中档、灯光亮档；颜色取光的色相（灯的暖色）
			vec3 ilL = max( outgoingLight - totalEmissiveRadiance, 0.0 ) / max( ilA, vec3( 0.03 ) );
			float ilLv = dot( ilL, anLum );
			vec3 ilHue = ilL / max( max( ilL.r, max( ilL.g, ilL.b ) ), 1e-3 );
			float ilBand = smoothstep( 0.28, 0.34, ilLv ) * 0.5 + smoothstep( 0.85, 0.95, ilLv ) * 0.5;
			vec3 ilNightLight = mix( vec3( 0.2, 0.22, 0.32 ), ilHue * mix( 0.5, 0.85, clamp( ilBand * 2.0 - 1.0, 0.0, 1.0 ) ), smoothstep( 0.0, 0.5, ilBand ) );
			vec3 ilNight = ilA * ilNightLight * mix( 0.85, 1.0, smoothstep( 0.5, 0.6, ilN.y ) );
			ilFlat = mix( ilFlat, ilNight, uIllustNight );
		}
		{
			vec3 ilW = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
			vec3 ilK = pow( abs( ilN ), vec3( 4.0 ) );
			ilK /= ilK.x + ilK.y + ilK.z;
			float ilPx = length( fwidth( ilW ) );
			// 细颗粒、纤维团在屏幕上小于一个像素时淡没：淡没了就不取样
			float ilFineK = 1.0 - smoothstep( 0.25, 0.5, ilPx * 0.5 );
			float ilMidK = 1.0 - smoothstep( 0.25, 0.5, ilPx * 0.12 );
			float ilFine = ilFineK > 0.0 ? ( ilTri( ilW, ilK, 0.5 ) - 0.5 ) * ilFineK : 0.0;
			float ilMid = ilMidK > 0.0 ? ( ilTri( ilW, ilK, 0.12 ) - 0.5 ) * ilMidK : 0.0;
			float ilBlot = smoothstep( 0.35, 0.75, ilTri( ilW, ilK, 0.02 ) );
			ilFlat *= 1.0 - IL_PAPER * ( 0.06 + 0.12 * ilFine + 0.08 * ilMid + 0.08 * ilBlot );
		}
		outgoingLight = mix( outgoingLight, ilFlat + totalEmissiveRadiance, uIllust );
	}`

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
			anGlow = anHot * 2.6 * ( 0.25 + anL ) * uAnimeMetal;
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
  // 地板：贴图取样之后收对比、降饱和
  if (sh.defines?.ANIME_FLOOR !== undefined && sh.fragmentShader.includes('#include <map_fragment>'))
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${FLOOR_BODY}`)
  const floor = sh.defines?.ANIME_FLOOR !== undefined
  sh.fragmentShader =
    `uniform float uFloorRefl;\nuniform vec3 uWinColor;\nuniform vec4 uWinA[ ${MAX_WIN} ];\nuniform vec4 uWinB[ ${MAX_WIN} ];\nuniform int uWinCount;\nuniform float uAnimeGlass;\n` +
    'uniform float uAnimeFloor;\nuniform float uAnimeShade;\nuniform vec3 uAnimeShadeTint;\nuniform float uTermSat;\nuniform float uAnimeRim;\nuniform float uAnimeMetal;\nuniform float uIllust;\nuniform float uIllustNight;\nuniform float uGlowMark;\n' +
    ILLUST_PARS +
    (perVertex ? 'varying float vAnMat;\n' : whole ? `#define vAnMat ${MAT_ID.metal}.0\n` : '') +
    sh.fragmentShader.replace(ANCHOR, BODY.replace('ILLUST_BODY', ILLUST_BODY).replace('METAL_BODY', metal ? METAL_BODY : '').replace('FLOOR_REFL_BODY', floor ? FLOOR_REFL : ''))
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
      // clone 不带 onBeforeCompile / customProgramCacheKey（灯光遮罩、赛璐璐都注入在那里）
      v = cloneWithHooks(m)
      v.defines = { ...m.defines, ANIME_METAL: '' }
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
/** 地板倒映窗户的强度 */
const FLOOR_REFL_K = 0.5
/** 漫游时阴影色的比例 */
const INDOOR_SHADE = 0.45

/**
 * 开关「动画感」的全部全局状态：两档色阶（toon.ts）、阴影色、交界饱和度、轮廓光、金属的画法。
 * night：入夜程度（夜里阴影色减弱、轮廓光关掉，主要是灯光）。indoor：漫游（阴影色减弱）。
 * golden：太阳低的程度（0 = 白天高照，1 = 贴着地平线）：阴影色更紫，和偏橙的阳光（Sandbox3D）对比。
 * 描边和经典一样是深色线（以前是提亮的彩色线，细线上几乎看不出差别，反而不如深色线清楚）。
 * illust：「插画」平涂的强度（post.ts LookDef.illust），只在赛璐璐光照下起作用。
 * 离开沙盘时 setAnimeLook(false) 还原，别处（素材库缩略图）照常
 */
export function setAnimeLook(on: boolean, night = 0, illust = 0, indoor = false, golden = 0) {
  setToonBands(on)
  // 插画白天、夜里都是平涂，赛璐璐的阴影色、交界、轮廓光让给它（夜里换成夜色底 + 灯光分档，见 ILLUST_BODY）
  const il = on ? illust : 0
  animeUniforms.uIllust.value = il
  animeUniforms.uIllustNight.value = night
  animeUniforms.uTermSat.value = on ? TERM_SAT * (1 - il) : 0
  // 漫游（indoor）：屋里只有窗口的光斑受阳光，其余都算暗面；阴影色照原样会把整间屋子染成浑浊的紫，减半，只留一层偏冷
  animeUniforms.uAnimeShade.value = on ? SHADE * (1 - 0.5 * night) * (1 - il) * (indoor ? INDOOR_SHADE : 1) : 0
  animeUniforms.uAnimeRim.value = on ? RIM * (1 - night) * (1 - il) : 0
  animeUniforms.uAnimeMetal.value = on ? METAL : 0
  animeUniforms.uAnimeFloor.value = on ? 1 - il : 0
  // 地板倒映窗户、窗玻璃的高光：白天的画法，入夜退掉（夜里窗外是暗的）
  animeUniforms.uFloorRefl.value = on ? FLOOR_REFL_K * (1 - night) * (1 - il) : 0
  animeUniforms.uAnimeGlass.value = on ? (1 - 0.8 * night) * (1 - il) : 0
  animeUniforms.uAnimeShadeTint.value.copy(SHADE_TINT).lerp(SHADE_TINT_GOLDEN, on ? golden : 0)
}
