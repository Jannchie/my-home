// 间接光探针（gi.ts）的材质端：共享的 uniform、取用探针的 GLSL。
// 单独成一个不依赖别的模块的文件：lightMask.ts 给所有受光材质注入时要用它，而 gi.ts 要导入 lightMask，
// 放在 gi.ts 里会成环（以 lightMask 为入口加载时 gi.ts 先执行，lightMask 的常量还没初始化）。

import * as THREE from 'three'

/** 探针间距（cm） */
export const GI_SPACING = 120
/** 每个探针占图集的像素数（9 × RGB = 27 个数 + 房间组） */
export const GI_TEXELS = 7
/** 间接光里保底留多少半球光：探针是粗的，墙角、家具缝里不至于全黑 */
const AMBIENT_FLOOR = 0.12
/** 间接光的饱和度 */
const GI_SAT = 0.75

export const giBlank = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType)
giBlank.needsUpdate = true

/** 所有材质共享（注入时按引用接上） */
export const giUniforms = {
  giAtlas: { value: giBlank as THREE.Texture },
  /** x0, z0, 1 / 间距, 每层的行数 */
  giGrid: { value: new THREE.Vector4(0, 0, 1 / GI_SPACING, 1) },
  /** 开关, 每行的探针数, 强度, 保底的半球光比例 */
  giInfo: { value: new THREE.Vector4(0, 1, 1, AMBIENT_FLOOR) },
  /** 卡通材质上间接光分档的程度（0 = 连续，1 = 按半档光圈分档；见 GI_APPLY_CEL） */
  giBand: { value: 0 },
}

/**
 * 材质端：放在 lights_pars_begin 之后（要用它的 shGetIrradianceAt，和 lightMask.ts 的 lmFetch / lmFloorOf）。
 * outdoor：房间编号图里「户外」的编号（lightMask.ts LM_OUTDOOR，由调用方传入，免得导入成环）
 */
export const giPars = (outdoor: number) => /* glsl */ `
uniform sampler2D giAtlas;
uniform vec4 giGrid;
uniform vec4 giInfo;
// 片元的间接光辐照度（a = 1 有效，0 = 周围没有能用的探针，照旧用半球光）
vec4 giIrradiance( vec3 wp, vec3 wn ) {
	vec3 gp = wp + wn * 8.0;
	float gf = lmFloorOf( gp.y );
	float grp = lmFetch( gp.xz, gf ).x;
	if ( abs( grp - ${outdoor}.0 ) < 0.5 ) return vec4( 0.0 );
	// 取探针的位置再往外推一点：墙面上的点取的是房间里的探针
	vec2 g = ( wp.xz + wn.xz * 20.0 - giGrid.xy ) * giGrid.z - 0.5;
	vec2 g0 = floor( g );
	vec2 fr = g - g0;
	int nx = int( giInfo.y + 0.5 );
	int nz = int( giGrid.w + 0.5 );
	vec3 acc = vec3( 0.0 );
	float wsum = 0.0;
	for ( int k = 0; k < 4; k ++ ) {
		ivec2 c = ivec2( g0 ) + ivec2( k & 1, k >> 1 );
		if ( c.x < 0 || c.y < 0 || c.x >= nx || c.y >= nz ) continue;
		ivec2 base = ivec2( c.x * ${GI_TEXELS}, int( gf + 0.5 ) * nz + c.y );
		vec4 t6 = texelFetch( giAtlas, base + ivec2( 6, 0 ), 0 );
		// 没有探针（房间外），或者是别的房间组的（隔着墙）。片元落在墙体格子里（墙顶、门洞）时哪组都收
		if ( t6.a < 1.5 || ( grp > 0.5 && abs( t6.a - grp ) > 0.5 ) ) continue;
		float bw = max( ( ( k & 1 ) == 1 ? fr.x : 1.0 - fr.x ) * ( ( k >> 1 ) == 1 ? fr.y : 1.0 - fr.y ), 1e-3 );
		vec4 t0 = texelFetch( giAtlas, base, 0 );
		vec4 t1 = texelFetch( giAtlas, base + ivec2( 1, 0 ), 0 );
		vec4 t2 = texelFetch( giAtlas, base + ivec2( 2, 0 ), 0 );
		vec4 t3 = texelFetch( giAtlas, base + ivec2( 3, 0 ), 0 );
		vec4 t4 = texelFetch( giAtlas, base + ivec2( 4, 0 ), 0 );
		vec4 t5 = texelFetch( giAtlas, base + ivec2( 5, 0 ), 0 );
		vec3 sh[ 9 ];
		sh[ 0 ] = t0.rgb;
		sh[ 1 ] = vec3( t0.a, t1.rg );
		sh[ 2 ] = vec3( t1.ba, t2.r );
		sh[ 3 ] = t2.gba;
		sh[ 4 ] = t3.rgb;
		sh[ 5 ] = vec3( t3.a, t4.rg );
		sh[ 6 ] = vec3( t4.ba, t5.r );
		sh[ 7 ] = t5.gba;
		sh[ 8 ] = t6.rgb;
		acc += bw * max( shGetIrradianceAt( wn, sh ), 0.0 );
		wsum += bw;
	}
	if ( wsum <= 0.0 ) return vec4( 0.0 );
	// 稍微降饱和：多次反弹会把木地板的橙色一层层叠浓，整间屋子染成一片橙
	acc /= wsum;
	return vec4( mix( vec3( dot( acc, vec3( 0.2126, 0.7152, 0.0722 ) ) ), acc, ${GI_SAT.toFixed(2)} ), 1.0 );
}
`

/** 材质端（PBR，realistic.ts）：放在 lights_fragment_maps 之前（这时 irradiance 已经加好了半球光） */
export const GI_APPLY = /* glsl */ `
	#if defined( RE_IndirectDiffuse )
	if ( giInfo.x > 0.5 ) {
		vec3 giW = ( vec4( geometryPosition - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
		vec3 giN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		vec4 gi = giIrradiance( giW, giN );
		irradiance = mix( irradiance, gi.rgb * giInfo.z + irradiance * giInfo.w, gi.a );
	}
	#endif
`

/**
 * 卡通材质（toon / lambert / phong）的取用：「动画感」也用间接光（靠窗亮、深处暗、阳光照到的地板把暖色反到墙上），
 * 但按画画的办法收成一档一档：辐照度的亮度按半档光圈（×√2）分档，档与档之间只留一小段过渡，
 * 大片的墙、天花板上是几块利落的明暗，不是写实的连续渐变（giBand = 0 时就是连续的）
 */
const GI_APPLY_CEL = /* glsl */ `
	if ( giInfo.x > 0.5 ) {
		vec3 giW = ( vec4( geometryPosition - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
		vec3 giN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		vec4 gi = giIrradiance( giW, giN );
		vec3 giC = gi.rgb * giInfo.z + irradiance * giInfo.w;
		if ( giBand > 0.0 ) {
			float giL = max( dot( giC, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
			float giE = log2( giL ) * 2.0;
			float giQ = floor( giE ) + smoothstep( 0.4, 0.6, fract( giE ) );
			giC *= mix( 1.0, exp2( giQ * 0.5 ) / giL, giBand );
		}
		irradiance = mix( irradiance, giC, gi.a );
	}
`

/**
 * 卡通材质接上探针（lightMask.ts injectLightMask 调用，要在遮罩的 lmFetch / lmFloorOf 拼进去之后）。
 * PBR 由 realistic.ts 自己接（它还要改环境贴图那一段）
 */
export function injectGICel(sh: THREE.WebGLProgramParametersWithUniforms, outdoor: number) {
  if (sh.shaderID !== 'toon' && sh.shaderID !== 'lambert' && sh.shaderID !== 'phong') return
  const f = sh.fragmentShader
  if (!f.includes('#include <lights_pars_begin>') || !f.includes('#include <lights_fragment_maps>')) return
  Object.assign(sh.uniforms, giUniforms)
  sh.fragmentShader = f
    .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\nuniform float giBand;\n${giPars(outdoor)}`)
    .replace('#include <lights_fragment_maps>', `${GI_APPLY_CEL}\n#include <lights_fragment_maps>`)
}
