// 写实光照（画面效果的 material: 'real'，「写实」「动画感」预设用）：渲染一帧前把 toon / lambert / phong 材质临时换成 PBR，画完换回。
//   - 只在画的那一刻换：选取、高亮、缩略图、导出这些地方看到的还是原来的材质，各模块不用知道有写实模式；
//   - 每个（原材质, 材质类别）对应一份缓存的 PBR 材质，每帧同步会变的量（颜色、自发光、透明度、贴图），灯光模块、入夜加亮照常生效；
//   - 材质自己的 onBeforeCompile（布艺花纹、外墙、毛色、深度偏移）一并带过去：它们改的都是各材质共有的块。
//
// 材质类别（木、布、皮革、金属……）见 mats.ts：家具零件在建模时就定好了（userData.mat），合并成顶点色网格的家具带逐顶点的 mat 属性，
// 这里按类别定粗糙度、金属度、环境反射、布面绒光，再画程序化细节（片元里按物体坐标算，不依赖模型 UV）：
//   - 木：按圆木算的年轮（板面上的山形纹）、晚材深色带、导管纹；
//   - 寝具：褶子在几何上（bedding.ts），这里只加细斜纹；布面软包、长绒：很浅的起伏；都有细织纹、绒光（MeshPhysicalMaterial 的 sheen）；
//   - 皮革：细小的颗粒皮纹；石材：深浅斑点；
//   - 长绒（地毯、毛绒）：再叠一层 shell 绒毛：同一几何体沿法线一层层往外推，每层按噪声丢掉一部分像素，越外层留得越少，
//     底层压暗当作绒毛间的自遮蔽；绒毛层只在画的那一刻挂到网格下面，画完摘掉；
//   - 磨砂玻璃：带透射（transmission）的材质，粗糙度让后面的东西糊成一片色块透出来。
// 环境反射（RoomEnvironment 的 PMREM）按类别给强度（金属、陶瓷强，布、纸没有），只当高光的来源：
// 环境贴图的漫反射部分清零，暗部的补光还是半球光（不然所有东西都蒙一层白）。
// 细节的高频部分按屏幕上的变化率淡出（远处不闪），镜头静止时的多帧累积（post.ts）再把剩下的锯齿抹平。
// 手办 / 粘土质感（画面效果 LookDef.figure，setFigure）：同一套材质上叠一层画法，不重编译：
//   - 包裹式漫反射：明暗交界往暗面推一截，推出去的那一截带暖色（光透进粘土 / PVC 表层的感觉），明暗过渡又软又宽；
//   - 统一的半光泽漆面（布类哑一点），环境反射加强，高光宽而柔；程序化细节（木纹、褶皱）减弱，像整体涂装；
//   - 深暗部带一点淡紫，暗部里朝下的面受一点地面反上来的暖光（反光）。
// 「动画感」等预设在写实光照上再叠的画法（setRealStyle 的各项，强度按画面效果给）：
//   - term：明暗交界两侧冷暖对比（阳光的转折处、投影边缘）：受光侧一条细细的暖橙、背光侧一条蓝紫，稍提饱和；
//   - rim：白色边缘光：圆角、轮廓上一圈，物体从背景里浮出来；
//   - cel：赛璐璐明暗：阳光、灯光的漫反射收成亮暗两档，天光按朝向收成三档，高光压弱；
//   - flatFur：长绒是纯色（不长绒毛层、不画织纹和绒光）；地毯边缘、色块交界的毛刺是建模时长的（fringe.ts）；
//   - styl：二次元手游式的风格化 PBR（「手游风」）：阳光的漫反射按一条柔和的 ramp 走（受光面整体抬平、交界一段短过渡），
//     暗面（背光、落影）乘一层透亮的阴影色并提饱和度（影子是带颜色的，不是压灰），明暗交界、投影边缘是一道暖而饱和的色带；
//     高光、环境反射照写实的，靠后面的 HDR 色调映射和泛光把阳光照到的地方提得通透。
// 描边壳在描边为 0 时不画（post.ts renderPatched 藏起来）。

import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { injectLightMask } from './lightMask'
import { GI_APPLY, GI_PARS, giUniforms } from './gi'
import { MAT_ID, MATS, type Mat } from './matIds'
import { woodish } from './mats'

type LitSource = THREE.MeshToonMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial
/** 一份 PBR 材质对应的材质类别：某一种，或 'attr' = 逐顶点（合并的家具） */
type MatKey = Mat | 'attr'

/**
 * 各类别的参数：粗糙度、金属度、环境反射强度、布面绒光；accent：叠不叠明暗交界的冷暖色带和白色边缘光
 * （灌木不叠：一圈白边会让整块叶丛像塑料）。
 * 环境反射整体压低（RoomEnvironment 里的灯板比我们的半球光亮得多）；金属也不太光滑，否则阳光的镜面高光会烧成一团白、再被泛光放大
 */
const PARAMS: Record<Mat, { rough: number; metal: number; env: number; sheen: number; accent?: number }> = {
  paint: { rough: 0.9, metal: 0, env: 0, sheen: 0 },
  wood: { rough: 0.72, metal: 0, env: 0.05, sheen: 0 },
  fabric: { rough: 0.95, metal: 0, env: 0, sheen: 0.45 },
  pile: { rough: 1, metal: 0, env: 0, sheen: 0.6 },
  bedding: { rough: 0.92, metal: 0, env: 0, sheen: 0.6 },
  leather: { rough: 0.55, metal: 0, env: 0.08, sheen: 0 },
  metal: { rough: 0.5, metal: 0.7, env: 0.35, sheen: 0 },
  plastic: { rough: 0.5, metal: 0, env: 0.1, sheen: 0 },
  glass: { rough: 0.06, metal: 0, env: 0.15, sheen: 0 },
  frosted: { rough: 0.5, metal: 0, env: 0.1, sheen: 0 },
  ceramic: { rough: 0.22, metal: 0, env: 0.18, sheen: 0 },
  stone: { rough: 0.68, metal: 0, env: 0.03, sheen: 0 },
  paper: { rough: 0.96, metal: 0, env: 0, sheen: 0 },
  plant: { rough: 0.6, metal: 0, env: 0.03, sheen: 0 },
  foliage: { rough: 1, metal: 0, env: 0, sheen: 0, accent: 0 },
}
/** 绒毛层数、绒毛长度（cm） */
const FUR_LAYERS = 10
const FUR_LEN = 1.1

const isLitSource = (m: THREE.Material): m is LitSource =>
  (m as THREE.MeshToonMaterial).isMeshToonMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial

// ---------- 网格的材质类别 ----------

/**
 * 网格用哪种：合并的家具（几何体带 mat 属性）逐顶点；否则网格自己或祖先标的 userData.mat（家具零件、窗帘、门玻璃），
 * 再看原材质上标的（地板），都没有按颜色猜（像木头的算木，其余涂装）
 */
function keyOf(mesh: THREE.Mesh, src: LitSource): MatKey {
  // 每帧都要问：按网格缓存（材质、几何体换了才重新判断），不再每帧沿祖先链找、按颜色猜
  const c = keyCache.get(mesh)
  if (c && c.src === src && c.geo === mesh.geometry) return c.key
  const key = findKey(mesh, src)
  keyCache.set(mesh, { src, geo: mesh.geometry, key })
  return key
}
const keyCache = new WeakMap<THREE.Mesh, { src: LitSource; geo: THREE.BufferGeometry; key: MatKey }>()
function findKey(mesh: THREE.Mesh, src: LitSource): MatKey {
  if (mesh.geometry.attributes.mat) return 'attr'
  for (let n: THREE.Object3D | null = mesh; n; n = n.parent) if (n.userData.mat) return n.userData.mat as Mat
  if (src.userData.mat) return src.userData.mat as Mat
  return woodish(src.color) ? 'wood' : 'paint'
}

// ---------- 着色器补丁 ----------

const NOISE_GLSL = /* glsl */ `
float rHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float rNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rHash3(i), rHash3(i + vec3(1, 0, 0)), f.x), mix(rHash3(i + vec3(0, 1, 0)), rHash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rHash3(i + vec3(0, 0, 1)), rHash3(i + vec3(1, 0, 1)), f.x), mix(rHash3(i + vec3(0, 1, 1)), rHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float rNoise2(vec2 x) { return rNoise3(vec3(x, 0.5)); }
// 高频细节按屏幕上的变化率淡出：一个像素里已经跨过小半个周期就不画
float rAA(float coord, float freq) { return 1.0 - smoothstep(0.25, 0.6, fwidth(coord) * freq); }
`

/** 按类别取值的 GLSL 函数：name(id) = 第 id 个类别的参数 */
function tableGlsl(name: string, pick: (p: (typeof PARAMS)[Mat]) => number) {
  const rows = MATS.map((m, i) => `if (id < ${i}.5) return ${pick(PARAMS[m]).toFixed(3)};`).join('\n  ')
  return `float ${name}(float id) {\n  ${rows}\n  return 0.0;\n}`
}

const I = MAT_ID
/** 所有写实材质共用的开关（0 = 关）：手办质感、白色边缘光强度、明暗交界冷暖对比强度、纯色毛绒、赛璐璐明暗 */
const realUniforms = {
  uFigure: { value: 0 },
  uRim: { value: 0 },
  uTerm: { value: 0 },
  uFlatFur: { value: 0 },
  uCel: { value: 0 },
  uStyl: { value: 0 },
  /** 风格化 PBR 的阴影色、交界色（线性空间的乘数） */
  uStylShade: { value: new THREE.Color().setRGB(0.9, 0.92, 1.03) },
  uStylWarm: { value: new THREE.Color().setRGB(1.08, 0.96, 0.84) },
}
/** 写实光照上叠的画法（post.ts 每帧按画面效果设）：手办质感、边缘光、明暗交界、纯色毛绒、赛璐璐明暗、风格化 PBR */
export function setRealStyle(s: { figure: number; rim: number; term: number; flatFur: number; cel: number; styl: number }) {
  realUniforms.uFigure.value = s.figure
  realUniforms.uRim.value = s.rim
  realUniforms.uTerm.value = s.term
  realUniforms.uFlatFur.value = s.flatFur
  realUniforms.uCel.value = s.cel
  realUniforms.uStyl.value = s.styl
}

const PARS_FRAG = /* glsl */ `
uniform float uFigure;
uniform float uRim;
uniform float uTerm;
uniform float uFlatFur;
uniform float uCel;
uniform float uStyl;
uniform vec3 uStylShade;
uniform vec3 uStylWarm;
varying vec3 vRP;
varying vec3 vRN;
varying float vMat;
${NOISE_GLSL}
${tableGlsl('rTabRough', (p) => p.rough)}
${tableGlsl('rTabMetal', (p) => p.metal)}
${tableGlsl('rTabEnv', (p) => p.env)}
${tableGlsl('rTabSheen', (p) => p.sheen)}
${tableGlsl('rTabAccent', (p) => p.accent ?? 1)}
// 手办质感下的粗糙度、环境反射：统一的半光泽漆面，布类、纸哑一点，金属亮一点
${tableGlsl('rFigRough', (p) => (p.sheen > 0 || p.rough > 0.95 ? 0.62 : p.metal > 0 ? 0.3 : 0.42))}
${tableGlsl('rFigEnv', (p) => (p.sheen > 0 || p.rough > 0.95 ? 0.12 : p.metal > 0 ? 0.6 : 0.3))}
float rIs(float id) { return 1.0 - step(0.5, abs(vMat - id)); }
// 木纹：把木板当成从一根圆木上锯下来的：顺纹方向 u（朝上、朝前的面是 x，朝侧面的面是 z），
// 年轮是到圆木轴心（在板面后方约 25cm、沿着板子微微倾斜）的距离，平切的板面上就自然出现一道道山形纹；
// 早材浅、晚材深（年轮里靠外的那一窄条）、细密的导管纹（顺纹的短暗线）、整块板子之间的深浅差
float rWoodGrain() {
  vec3 an = abs(normalize(vRN));
  vec3 q = vRP;
  float u;
  vec2 cs;
  if (an.y > max(an.x, an.z)) { u = q.x; cs = vec2(q.z, q.y); }
  else if (an.x > an.z) { u = q.z; cs = vec2(q.y, q.x); }
  else { u = q.x; cs = vec2(q.y, q.z); }
  vec2 c = cs + vec2(rNoise2(vec2(u * 0.01, 3.0)) * 10.0 - 5.0, 25.0 + u * 0.035);
  float r = length(c) + rNoise3(vec3(u * 0.02, cs * 0.15)) * 1.1 + rNoise3(vec3(u * 0.004, cs * 0.04)) * 3.0;
  // 约 4mm 一圈
  float rings = r * 2.4;
  float t = fract(rings);
  float late = smoothstep(0.6, 0.92, t) * (1.0 - smoothstep(0.94, 1.0, t));
  float pore = smoothstep(0.72, 0.92, rNoise3(vec3(u * 0.12, cs * 7.0)));
  float tone = rNoise3(vec3(u * 0.006, cs * 0.05));
  return (0.92 + 0.12 * tone) * (1.0 - 0.2 * late * rAA(rings, 1.0)) * (1.0 - 0.12 * pore * rAA(cs.x + cs.y, 7.0));
}
// 按高度场扰动法线（Mikkelsen 的屏幕导数法，three 的 bumpmap 同款；位置导数不归一化，高度和位置同一单位）
vec3 rPerturb(vec3 pos, vec3 n, float h, float faceDir) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`

/**
 * 给 PBR 材质接上按类别的参数和细节。perVertex：类别取几何体的 mat 属性（合并的家具），粗糙度、金属度、绒光也按类别表覆盖；
 * 否则整个材质只有一种类别（编译期常量），粗糙度等已经设在材质上（地板的 pbrRoughness 要保留）
 */
function injectDetail(sh: THREE.WebGLProgramParametersWithUniforms, perVertex: boolean, id: number) {
  if (!sh.vertexShader.includes('#include <begin_vertex>') || !sh.fragmentShader.includes('#include <color_fragment>')) return
  Object.assign(sh.uniforms, realUniforms, giUniforms)
  // 类别：合并的家具逐顶点（varying）；其余网格整个材质只有一种，写成编译期常量——按类别查表的 if 链、各类别细节的分支（rIs）
  // 都被编译器折叠掉，每个片元不再逐个比较（程序缓存键里本来就带着类别，不多出程序）
  sh.vertexShader =
    (perVertex ? 'attribute float mat;\nvarying float vMat;\n' : '') +
    'varying vec3 vRP;\nvarying vec3 vRN;\n' +
    sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  vRP = position;\n  vRN = normal;${perVertex ? '\n  vMat = mat;' : ''}`)
  const pars = perVertex ? PARS_FRAG : PARS_FRAG.replace('varying float vMat;', `#define vMat ${id.toFixed(1)}`)
  let f = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + pars)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  float rBump = 0.0;
  // 手办质感下细节减弱（整体涂装）
  if (rIs(${I.wood}.0) > 0.0) diffuseColor.rgb *= mix(rWoodGrain(), 1.0, 0.6 * uFigure);
  float rCloth = rIs(${I.fabric}.0) + rIs(${I.pile}.0) + rIs(${I.bedding}.0);
  if (rCloth > 0.0) {
    // 寝具的褶子在几何上（bedding.ts 建模时算好），这里不再加起伏；布面软包、长绒：绷紧的，只有很浅、很缓的起伏
    float drape = rIs(${I.bedding}.0);
    // 纯色毛绒：长绒不画起伏和织纹
    float flatPile = rIs(${I.pile}.0) * uFlatFur;
    rBump = (1.0 - drape) * (1.0 - flatPile) * rNoise3(vRP * vec3(0.05, 0.08, 0.05)) * 0.25;
    // 织纹：寝具是棉布的斜纹（细密的斜线，近看才有），软包是细碎的颗粒
    float weave = rNoise3(vRP * 2.2) - 0.5;
    float twill = sin((vRP.x + vRP.z + vRP.y * 0.5) * 18.0) * rAA(vRP.x + vRP.z + vRP.y * 0.5, 18.0 / 6.2831853);
    diffuseColor.rgb *= 1.0 + (1.0 - flatPile) * mix(0.1 * weave, 0.035 * twill + 0.05 * weave, drape) * rAA(vRP.x + vRP.y + vRP.z, 2.2);
  }
  if (rIs(${I.leather}.0) > 0.0) {
    // 皮纹：细小的颗粒凸起（约 1.5mm）、一点深浅不匀
    rBump = rNoise3(vRP * 6.0) * 0.05 * rAA(vRP.x + vRP.y + vRP.z, 6.0);
    diffuseColor.rgb *= 0.95 + 0.08 * rNoise3(vRP * 0.3);
  }
  if (rIs(${I.stone}.0) > 0.0) {
    // 石材 / 混凝土：大块的深浅 + 细斑点
    float speck = rNoise3(vRP * 3.0) - 0.5;
    diffuseColor.rgb *= 0.93 + 0.1 * rNoise3(vRP * 0.12) + 0.1 * speck * rAA(vRP.x + vRP.y + vRP.z, 3.0);
  }`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
  rBump *= 1.0 - 0.6 * uFigure;
  if (rBump > 0.0) normal = rPerturb(-vViewPosition, normal, rBump, faceDirection);`,
    )
    // 赛璐璐明暗：天光也按朝向收成三档（朝上 / 侧面 / 朝下），档与档之间软过渡；圆的物体上不再是一整片平滑的渐变
    .replace(
      '#include <lights_pars_begin>',
      THREE.ShaderChunk.lights_pars_begin.replace(
        'float hemiDiffuseWeight = 0.5 * dotNL + 0.5;',
        `float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		float rHq = hemiDiffuseWeight * 2.0;
		hemiDiffuseWeight = mix( hemiDiffuseWeight, ( floor( rHq ) + smoothstep( 0.35, 0.65, fract( rHq ) ) ) * 0.5, uCel );`,
      ) + GI_PARS,
    )
    // 手办质感：统一的半光泽漆面
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, rFigRough(vMat), uFigure);')
    // 手办质感：包裹式漫反射（只改漫反射，高光照旧）
    .replace(
      '#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk.lights_physical_pars_fragment
        // 赛璐璐明暗下高光压弱（动画背景里只有玻璃、金属、釉面才有清楚的高光，而且是画上去的一小块）
        .replace(
          'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;',
          'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation * ( 1.0 - 0.6 * uCel );',
        )
        .replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
        `vec3 rDiffIrr = irradiance;
	if ( uFigure > 0.0 ) {
		float rNL = dot( geometryNormal, directLight.direction );
		float rWrap = saturate( ( rNL + 0.45 ) / 1.45 );
		// 推到暗面的那一截带暖色：光透进表层再出来
		vec3 rTint = mix( vec3( 1.0, 0.55, 0.42 ), vec3( 1.0 ), smoothstep( 0.0, 0.4, rNL ) );
		rDiffIrr = mix( irradiance, rWrap * directLight.color * rTint, uFigure );
	}
	if ( uCel > 0.0 ) {
		// 赛璐璐明暗：受光面整块亮、只留一点点随角度的渐变，过了明暗交界线干脆地落进暗面（投影本身已经是利落的边）
		float rNL = dot( geometryNormal, directLight.direction );
		float rCelNL = smoothstep( 0.0, 0.06, rNL ) * ( 0.78 + 0.22 * saturate( rNL ) );
		rDiffIrr = mix( rDiffIrr, rCelNL * directLight.color, uCel );
	}
	if ( uStyl > 0.0 ) {
		// 风格化 ramp：受光面整体抬平（只留一点随角度的渐变），交界在 N·L 0–0.1 之间利落地落进暗面（手游角色、场景的明暗分界）。
		// irradiance = N·L × 光色 × 投影，除掉 N·L 得到光色 × 投影（背光时两者都是 0）
		float rNL = dot( geometryNormal, directLight.direction );
		vec3 rLight = irradiance / max( saturate( rNL ), 1e-3 );
		float rRamp = smoothstep( 0.0, 0.1, rNL ) * ( 0.82 + 0.18 * saturate( rNL ) );
		rDiffIrr = mix( rDiffIrr, rRamp * rLight, uStyl );
	}
	reflectedLight.directDiffuse += rDiffIrr * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`,
      ),
    )
    // 手办质感：菲涅尔边缘光
    .replace(
      '#include <opaque_fragment>',
      `if ( uFigure + uRim + uTerm > 0.0 ) {
		#if NUM_DIR_LIGHTS > 0
		// 明暗交界两侧的冷暖对比：阳光 N·L 在 0 附近的两条细带（受光侧暖橙、背光侧蓝紫，都提一点饱和），
		// 加上投影的边缘（toon.ts 记的 termEdge，本来就只有几个像素宽）。只是点缀，不抢眼
		float rSun = dot( normal, directionalLights[ 0 ].direction );
		float rAccent = rTabAccent( vMat );
		float rWarm = rAccent * max( ( 1.0 - smoothstep( 0.0, 0.1, abs( rSun - 0.05 ) ) ) * step( 0.0, rSun ), termEdge * sunLit ) * uTerm;
		float rCool = rAccent * max( ( 1.0 - smoothstep( 0.0, 0.08, abs( rSun + 0.04 ) ) ) * step( rSun, 0.0 ), termEdge * ( 1.0 - sunLit ) ) * uTerm;
		float rLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
		outgoingLight = max( mix( vec3( rLum ), outgoingLight, 1.0 + 0.45 * rWarm + 0.35 * rCool ), 0.0 );
		outgoingLight *= mix( vec3( 1.0 ), vec3( 1.04, 0.99, 0.95 ), rWarm ) * mix( vec3( 1.0 ), vec3( 0.95, 0.96, 1.06 ), rCool );
		// 手办：深暗部带一点淡紫；暗部里朝下、朝侧面的面受地面反上来的一点暖光（反光，越朝下越多）
		float rShade = ( 1.0 - sunLit ) * uFigure;
		outgoingLight *= mix( vec3( 1.0 ), vec3( 0.97, 0.96, 1.04 ), rShade );
		vec3 rNW = inverseTransformDirection( normal, viewMatrix );
		outgoingLight += rShade * smoothstep( 0.2, -0.8, rNW.y ) * diffuseColor.rgb * vec3( 1.0, 0.86, 0.72 ) * 0.12;
		#endif
		// 边缘光（白）：圆角、曲面（法线在屏幕上变化快）亮，大片平面斜着看只亮一点，不会整面发白
		float rNV = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
		float rCurv = mix( 0.2, 1.0, smoothstep( 0.004, 0.03, length( fwidth( normal ) ) ) );
		outgoingLight += uRim * pow( rNV, 2.2 ) * rCurv * rTabAccent( vMat );
	}
	if ( uStyl > 0.0 ) {
		// 风格化 PBR：暗面乘阴影色、提饱和度（透亮的蓝紫影子）；明暗交界、投影边缘一道暖而饱和的色带
		float sLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 sShade = max( mix( vec3( sLum ), outgoingLight, 1.3 ), 0.0 ) * uStylShade;
		outgoingLight = mix( outgoingLight, sShade, uStyl * ( 1.0 - sunLit ) );
		vec3 sWarm = max( mix( vec3( sLum ), outgoingLight, 1.35 ), 0.0 ) * uStylWarm;
		outgoingLight = mix( outgoingLight, sWarm, uStyl * rTabAccent( vMat ) * termEdge * sunLit * 0.8 );
	}
	#include <opaque_fragment>`,
    )
  if (perVertex)
    f = f
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = rTabRough(vMat);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = rTabMetal(vMat);')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n  #ifdef USE_SHEEN\n  material.sheenColor *= rTabSheen(vMat) * (1.0 - rIs(${I.pile}.0) * uFlatFur);\n  #endif`)
  // 环境贴图只当高光来源：漫反射部分清零，反射按类别缩放
  // 间接光探针（gi.ts）：替换半球光，要在环境贴图之前（那里只加高光）
  f = f.replace(
    '#include <lights_fragment_maps>',
    `${GI_APPLY}
  #include <lights_fragment_maps>
  #if defined( RE_IndirectSpecular )
  iblIrradiance = vec3( 0.0 );
  radiance *= mix(rTabEnv(vMat), rFigEnv(vMat), uFigure);
  #endif`,
  )
  sh.fragmentShader = f
}

// ---------- 材质 ----------

/** 磨砂玻璃：颜色、透明度不跟原材质同步 */
const frostedSet = new WeakSet<THREE.Material>()
const pbrOf = new WeakMap<THREE.Material, Map<MatKey, THREE.MeshStandardMaterial>>()

function toPbr(src: LitSource, key: MatKey, env: THREE.Texture) {
  let byKey = pbrOf.get(src)
  if (!byKey) pbrOf.set(src, (byKey = new Map()))
  let p = byKey.get(key)
  if (p) return p
  if (key === 'frosted' && src.transparent) {
    // 磨砂玻璃：不再是半透明叠加，而是透射（three 先把不透明的东西画进一张带 mip 的图，按粗糙度取模糊的那一级）
    p = new THREE.MeshPhysicalMaterial({ color: '#f3f6f5', roughness: 0.5, metalness: 0, transmission: 1, thickness: 0.6, ior: 1.5, side: src.side })
    p.userData = src.userData
    frostedSet.add(p)
    byKey.set(key, p)
    return p
  }
  const one = key === 'attr' ? null : PARAMS[key]
  // 透明、自发光的（玻璃、屏幕、灯罩）不加细节
  const detail = !src.transparent && !src.emissiveMap && !(src.emissiveIntensity > 0.05 && src.emissive.getHex() !== 0)
  let roughness = typeof src.userData.pbrRoughness === 'number' ? (src.userData.pbrRoughness as number) : (one?.rough ?? 0.9)
  if (src.transparent) roughness = Math.min(roughness, 0.15)
  else if (src.emissiveMap) roughness = 0.25
  const sheen = key === 'attr' || (one?.sheen ?? 0) > 0
  p = sheen
    ? new THREE.MeshPhysicalMaterial({ roughness, metalness: one?.metal ?? 0, sheen: 1, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff') })
    : new THREE.MeshStandardMaterial({ roughness, metalness: one?.metal ?? 0 })
  if (one && sheen) (p as THREE.MeshPhysicalMaterial).sheenColor.setScalar(one.sheen)
  // 环境贴图都挂上：接了细节补丁的在着色器里按类别缩放；透明 / 自发光的按类别给强度
  p.envMap = env
  p.envMapIntensity = detail ? 1 : (one?.env ?? 0.3)
  p.name = src.name
  p.userData = src.userData
  p.side = src.side
  p.shadowSide = src.shadowSide
  p.vertexColors = src.vertexColors
  p.transparent = src.transparent
  p.depthWrite = src.depthWrite
  p.depthTest = src.depthTest
  p.alphaTest = src.alphaTest
  p.blending = src.blending
  p.polygonOffset = src.polygonOffset
  p.polygonOffsetFactor = src.polygonOffsetFactor
  p.polygonOffsetUnits = src.polygonOffsetUnits
  p.alphaMap = src.alphaMap
  p.normalMap = src.normalMap
  p.flatShading = (src as THREE.MeshPhongMaterial).flatShading ?? false
  // 自己挂的着色器补丁（原型上的 injectLightMask 两种材质都有）在前，细节在后
  const before = Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile') ? src.onBeforeCompile : p.onBeforeCompile
  const baseKey = Object.prototype.hasOwnProperty.call(src, 'customProgramCacheKey') ? src.customProgramCacheKey() : ''
  const id = key === 'attr' ? 0 : MAT_ID[key]
  p.onBeforeCompile = function (sh, r) {
    before.call(this, sh, r)
    if (detail) injectDetail(sh, key === 'attr', id)
  }
  p.customProgramCacheKey = () => `${baseKey}|real-${detail ? key : 'plain'}`
  byKey.set(key, p)
  return p
}

/** 每帧同步原材质上会变的量 */
function sync(src: LitSource, p: THREE.MeshStandardMaterial) {
  if (frostedSet.has(p)) {
    p.visible = src.visible
    return
  }
  p.color.copy(src.color)
  p.emissive.copy(src.emissive)
  p.emissiveIntensity = src.emissiveIntensity
  p.opacity = src.opacity
  p.visible = src.visible
  if (p.map !== src.map || p.emissiveMap !== src.emissiveMap) {
    p.map = src.map
    p.emissiveMap = src.emissiveMap
    p.needsUpdate = true
  }
}

// ---------- 长绒 ----------

const furOf = new WeakMap<THREE.Material, THREE.MeshStandardMaterial[]>()
/** 一套绒毛层材质（跟着网格的 PBR 材质走：同色、同顶点色、同贴图）。perVertex：只在 mat 属性是长绒的顶点上长 */
function furLayers(base: THREE.MeshStandardMaterial, perVertex: boolean) {
  let list = furOf.get(base)
  if (list) return list
  list = []
  for (let i = 1; i <= FUR_LAYERS; i++) {
    const t = i / FUR_LAYERS
    const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: base.vertexColors, map: base.map })
    m.color = base.color
    m.onBeforeCompile = (sh) => {
      injectLightMask(sh)
      sh.uniforms.uFurT = { value: t }
      sh.vertexShader =
        (perVertex ? 'attribute float mat;\n' : '') +
        'uniform float uFurT;\nvarying vec3 vFurP;\nvarying float vFurOn;\n' +
        sh.vertexShader
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n  vFurP = position;\n  vFurOn = ${perVertex ? `1.0 - step(0.5, abs(mat - ${MAT_ID.pile}.0))` : '1.0'};\n  transformed += normal * (uFurT * ${FUR_LEN.toFixed(2)} * vFurOn);`,
          )
          // 合并的家具里不是长绒的顶点（整件家具的其余部分）直接丢到裁剪空间外：不进光栅化，10 层绒毛不再各画一遍整件家具
          // （合并时各零件的顶点不共用，一个三角形的顶点要么都是长绒、要么都不是）
          .replace('#include <project_vertex>', '#include <project_vertex>\n  if (vFurOn < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);')
      sh.fragmentShader =
        'uniform float uFurT;\nvarying vec3 vFurP;\nvarying float vFurOn;\n' +
        NOISE_GLSL +
        sh.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  if (vFurOn < 0.5) discard;
  // 一根根绒毛：按物体坐标的细格子取随机长度，比这一层短的丢掉；梢往一边倒一点，长短按团簇起伏
  vec3 fp = vFurP + vec3(0.25, 0.0, 0.18) * uFurT;
  float strand = rHash3(floor(fp * 4.0) + 0.5);
  float clump = rNoise3(fp * 0.35);
  if (strand * (0.6 + 0.6 * clump) < uFurT) discard;
  // 越往底层越暗（绒毛间的自遮蔽），梢上略亮
  diffuseColor.rgb *= mix(0.55, 1.08, uFurT);`,
        )
    }
    m.customProgramCacheKey = () => `real-fur${perVertex ? '-attr' : ''}`
    list.push(m)
  }
  furOf.set(base, list)
  return list
}

/** 合并的几何体里有没有长绒的顶点（按几何体缓存） */
function hasPile(g: THREE.BufferGeometry) {
  if (g.userData.hasPile === undefined) {
    const a = g.attributes.mat as THREE.BufferAttribute
    let any = false
    for (let i = 0; i < a.count && !any; i++) any = Math.abs(a.getX(i) - MAT_ID.pile) < 0.5
    g.userData.hasPile = any
  }
  return g.userData.hasPile as boolean
}

const furMeshes = new WeakMap<THREE.Mesh, THREE.Mesh[]>()
function furFor(mesh: THREE.Mesh, base: THREE.MeshStandardMaterial, perVertex: boolean) {
  const mats = furLayers(base, perVertex)
  let list = furMeshes.get(mesh)
  if (list && list[0].material === mats[0] && list[0].geometry === mesh.geometry) return list
  list = mats.map((m) => {
    const s = new THREE.Mesh(mesh.geometry, m)
    s.castShadow = false
    s.receiveShadow = true
    s.userData.noOutline = true
    s.userData.furShell = true
    s.raycast = () => {}
    return s
  })
  furMeshes.set(mesh, list)
  return list
}
/** 绒毛层：遮蔽那一遍（post.ts）、倒影（reflect.ts）里不画——遮蔽算不出绒毛的差别，倒影本来就糊 */
export const isFurShell = (o: THREE.Object3D) => !!o.userData.furShell
/** 这一帧挂在场景里的绒毛层（swapToPbr 挂上、还原时摘掉），倒影期间要藏起来 */
export const activeFur: THREE.Mesh[] = []

// ---------- 换材质 ----------

/**
 * 把场景里可见网格的受光材质换成 PBR（长绒挂上绒毛层），返回还原函数。skip：不换的网格（描边壳等，由调用方藏起来）
 */
// 每帧换材质用的临时表：模块级复用，不每帧分配（swapToPbr 不会重入：倒影是在已经换好的场景里画的）
const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
const fur: [THREE.Mesh, THREE.Mesh[]][] = []
const synced = new Set<THREE.Material>()
/** 多材质网格换成 PBR 后的材质数组：按网格缓存（原数组换了才重建），每帧原地更新 */
const arrayCache = new WeakMap<THREE.Mesh, { src: THREE.Material[]; out: THREE.Material[] }>()
function restorePbr() {
  for (const [mesh, m] of swapped) mesh.material = m
  for (const [mesh, list] of fur) for (const s of list) mesh.remove(s)
  swapped.length = 0
  fur.length = 0
  activeFur.length = 0
}

export function swapToPbr(renderer: THREE.WebGLRenderer, scene: THREE.Scene, skip: (o: THREE.Object3D) => boolean) {
  const env = realEnvironment(renderer)
  synced.clear()
  const conv = (mesh: THREE.Mesh, m: LitSource) => {
    const key = keyOf(mesh, m)
    const p = toPbr(m, key, env)
    if (!synced.has(p)) {
      synced.add(p)
      sync(m, p)
    }
    // 长绒：不透明的才长毛（淡出中的半透明副本不长）
    if (!realUniforms.uFlatFur.value && !m.transparent && !m.emissiveMap && (key === 'pile' || (key === 'attr' && hasPile(mesh.geometry)))) fur.push([mesh, furFor(mesh, p, key === 'attr')])
    return p
  }
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || skip(o)) return
    const m = mesh.material
    if (Array.isArray(m)) {
      if (!m.some(isLitSource)) return
      swapped.push([mesh, m])
      let c = arrayCache.get(mesh)
      if (!c || c.src !== m || c.out.length !== m.length) arrayCache.set(mesh, (c = { src: m, out: new Array(m.length) }))
      for (let i = 0; i < m.length; i++) {
        const x = m[i]
        c.out[i] = isLitSource(x) ? conv(mesh, x) : x
      }
      mesh.material = c.out
    } else if (m && isLitSource(m)) {
      swapped.push([mesh, m])
      mesh.material = conv(mesh, m)
    }
  })
  for (const [mesh, list] of fur) {
    mesh.add(...list)
    activeFur.push(...list)
  }
  return restorePbr
}

let envTex: THREE.Texture | null = null
/** 高光的反射来源：RoomEnvironment 预滤波（只建一次） */
function realEnvironment(renderer: THREE.WebGLRenderer) {
  if (envTex) return envTex
  const pm = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  envTex = pm.fromScene(room, 0.04).texture
  room.dispose()
  pm.dispose()
  return envTex
}
