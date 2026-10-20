// 卡通渲染基础件：三阶色阶的 toon 材质 + 反向外壳描边 + 常用圆角体素。
// 单位：厘米。y 轴向上，平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
// 室内灯的楼层 / 房间遮罩：给所有受光照材质挂上 onBeforeCompile（副作用导入，要在任何材质编译前生效）
import { injectLightMask } from './lightMask'
import { mangaUniforms } from './manga'
import { MAT_ID, type Mat } from './matIds'

// ---------- 赛璐璐阴影 ----------
// three 自带的 PCF 阴影用逐像素噪点（IGN）旋转采样，边缘是一片网点状的颗粒渐变。
// 改成：固定采样分布（不再有颗粒）+ 把阴影收成「亮 / 暗」两档，边缘保留一段柔和但干净的过渡，像动画里的阴影块。
// 过渡的宽度跟着光源的 shadow.radius 走：平时（半径 4）是 0.12–0.88，「动画感」把半径调小（Sandbox3D），影子边缘利落得多。
{
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>
  const NOISE = 'interleavedGradientNoise( gl_FragCoord.xy ) * PI2'
  const AVG = ') * 0.2;'
  if (chunk.shadowmap_pars_fragment.includes(NOISE)) {
    chunk.shadowmap_pars_fragment = chunk.shadowmap_pars_fragment
      .split(NOISE)
      .join('0.7')
      // 只改第一处（平行光 / 聚光灯的 2D 阴影）：再加一圈 8 个固定方向的采样，过渡更平滑，再收成干净的边
      .replace(
        AVG,
        `${AVG}
				shadow *= 5.0;
				for ( int k = 0; k < 8; k ++ ) {
					float a = float( k ) * 0.7853982 + 0.3927;
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vec2( cos( a ), sin( a ) ) * radius * 1.5, shadowCoord.z ) );
				}
				float shW = clamp( shadowRadius * 0.095, 0.06, 0.38 );
				shadow = smoothstep( 0.5 - shW, 0.5 + shW, shadow / 13.0 );`,
      )
      // 点光源（漫游时所在房间的顶灯，lights.ts）的立方体阴影：同样加一圈固定方向的采样、收成干净的边
      .replace(
        /(sample4\.y \) \* texelSize, dp \) \)\s*\) \* 0\.2;)/,
        `$1
				shadow *= 5.0;
				for ( int k = 0; k < 8; k ++ ) {
					float a = float( k ) * 0.7853982 + 0.3927;
					shadow += texture( shadowMap, vec4( bd3D + ( tangent * cos( a ) + bitangent * sin( a ) ) * texelSize * 1.5, dp ) );
				}
				// 过渡收得很窄（取样圈照半径放大，轮廓仍然平滑）：硬边但不起锯齿，像动画里的影子块
				float shW = 0.06;
				shadow = smoothstep( 0.5 - shW, 0.5 + shW, shadow / 13.0 );`,
      )
  }
}

// 光线贴着表面掠过（月光、低角度的夕阳照在和光线几乎平行的墙上）时，阴影贴图的一个像素被拉成长条，
// 阴影边缘会变成一排排斜向的网点。这类表面在 toon 着色里本来就落在暗部：按 N·L 把阴影淡掉，走样就看不到了。
// 同时给 anime.ts（动画感光照）记下两个量：
//   termEdge：明暗交界的程度——投影的边缘（阴影值在 0 和 1 之间），和「动画感」两档色阶的分界（N·L = 0，见 setToonBands）
//             两侧几个像素。分界按屏幕上 N·L 的变化率换算成像素宽：大片平面（天花板、墙）N·L 几乎不变，不会整面都算成交界；
//   sunLit：这一点被太阳照到的程度（投影 × 是否在受光那一侧），1 = 受光面，0 = 暗面或落影。
{
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>
  const SHADOW = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )'
  const DIR = `directLight.color *= ( directLight.visible && receiveShadow ) ? ${SHADOW} : 1.0;`
  // 点光源的投影（漫游时所在房间的顶灯）：只投在朝着灯的面上——背光的面在阴影贴图里是自己挡自己，
  // 而 toon 色阶下背光面本来还受一部分灯光，照原样乘上阴影会把所有背光面压黑
  const POINT_SHADOW = 'getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar )'
  const POINT = `directLight.color *= ( directLight.visible && receiveShadow ) ? ${POINT_SHADOW} : 1.0;`
  // lampOcc 记下被顶灯挡住的程度：anime.ts 在输出前再压暗一些（挡住顶灯的家具也挡住了大半从地面、墙面反射来的补光），影子才读得出来
  // （three 展开的循环不分作用域：变量在下面的总声明里声明一次，这里只赋值，多盏灯投影时不会重复声明）
  // 只在真的要用时取样（显式分支，立方体阴影一次 13 个取样很贵）：不投影（浓度 0，鸟瞰时）、被房间遮罩挡掉
  // （lightMask.ts 已经把灯色乘成 0）、背对着灯的片元都跳过
  const POINT_PATCH = `lampShade = 1.0;
		if ( directLight.visible && receiveShadow && pointLightShadow.shadowIntensity > 0.0 && max( directLight.color.r, max( directLight.color.g, directLight.color.b ) ) > 1e-4 ) {
			float lampNL = dot( geometryNormal, directLight.direction );
			if ( lampNL > 0.04 ) lampShade = mix( 1.0, ${POINT_SHADOW}, smoothstep( 0.04, 0.28, lampNL ) );
		}
		lampOcc = max( lampOcc, ( 1.0 - lampShade ) * pointLightShadow.shadowIntensity );
		directLight.color *= lampShade;`
  if (chunk.lights_fragment_begin.includes(DIR) && chunk.lights_fragment_begin.includes(POINT)) {
    chunk.lights_fragment_begin =
      'float termEdge = 0.0;\nfloat sunLit = 0.0;\nfloat lampOcc = 0.0;\nfloat lampShade = 1.0;\n' +
      chunk.lights_fragment_begin.replace(POINT, POINT_PATCH).replace(
        DIR,
        `float sunNL = dot( geometryNormal, directLight.direction );
		// 背光面（权重 0）不取样：13 个取样的结果反正被乘成 0，约一半的片元白取（三元运算只求值选中的那一支）
		float sunK = smoothstep( 0.04, 0.28, sunNL );
		float sunShade = ( directLight.visible && receiveShadow && sunK > 0.0 ) ? mix( 1.0, ${SHADOW}, sunK ) : 1.0;
		directLight.color *= sunShade;
		float sunPx = abs( sunNL ) / max( fwidth( sunNL ), 1e-5 );
		termEdge = max( termEdge, max( 4.0 * sunShade * ( 1.0 - sunShade ), ( 1.0 - smoothstep( 0.0, 5.0, sunPx ) ) * sunShade ) );
		sunLit = max( sunLit, ( directLight.visible ? sunShade : 0.0 ) * smoothstep( -0.01, 0.01, sunNL ) );`,
      )
  }
}

// ---------- 各向异性过滤 ----------
// 斜着看的贴图（地板、墙纸、布艺花纹、灯光光斑）用显卡支持的最大各向异性过滤，远处不糊成一片。
// 舞台建好后由 setMaxAnisotropy 设定上限（省电画质 4×）；之前已经建好的贴图登记在这里，一起更新。
let anisoLevel = 4
const anisoTextures = new Set<THREE.Texture>()
/** 给贴图套上当前的各向异性级别，并登记（画质切换时统一更新） */
export function useAnisotropy<T extends THREE.Texture>(t: T): T {
  t.anisotropy = anisoLevel
  anisoTextures.add(t)
  return t
}
export function setMaxAnisotropy(n: number) {
  anisoLevel = Math.max(1, n)
  for (const t of anisoTextures) {
    if (t.anisotropy === anisoLevel) continue
    t.anisotropy = anisoLevel
    t.needsUpdate = true
  }
}

// ---------- 材质 ----------

let gradient: THREE.DataTexture | null = null
/** 色阶贴图：暗部 / 中间 / 亮部，硬切换出赛璐璐的感觉 */
function gradientMap() {
  if (gradient) return gradient
  // 六格：平时 暗暗中中亮亮（分界在 N·L = ±1/3，和以前的三格一样）；「动画感」换成 暗暗暗亮亮亮（分界在 0），见 setToonBands。
  // 格数建好后不能改（贴图存储是定长的），所以一开始就用六格
  const data = new Uint8Array(6 * 4)
  BANDS_NORMAL.forEach((v, i) => data.set([v, v, v, 255], i * 4))
  gradient = new THREE.DataTexture(data, 6, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true
  return gradient
}

/**
 * 色阶：平时三档（暗 / 中 / 亮，分界在 N·L = ±1/3）；「动画感」两档，分界在 N·L = 0——背对太阳就是暗面
 * （平时背对太阳的面还有 150/255 的阳光，太阳低的时候朝下的天花板会被晒成一片暖色）。
 * 「动画感」的暗面只接收约四成的直射光（室内灯也一样：太暗的话夜里柜门正面和正对着灯的门缝、侧面反差太大），颜色交给 anime.ts 的阴影色。
 * 所有 toon 材质共用这一张图，改数据就全部生效（不重编译）。
 */
const BANDS_NORMAL = [150, 150, 215, 215, 255, 255]
// 暗面分三档（背光越多越暗）：同一个物体朝向不同的几个暗面也分得出来（鹿头、厨具的各个面），最暗的也不发黑
const BANDS_ANIME = [128, 152, 184, 255, 255, 255]
export function setToonBands(two: boolean) {
  const t = gradientMap()
  const d = t.image.data as Uint8Array
  const bands = two ? BANDS_ANIME : BANDS_NORMAL
  if (bands.every((v, i) => d[i * 4] === v)) return
  bands.forEach((v, i) => d.set([v, v, v], i * 4))
  t.needsUpdate = true
}

const toonCache = new Map<string, THREE.MeshToonMaterial>()
/** 纯色、不透明、不自发光的缓存 toon 材质：可以并进顶点色的单一材质（mergeSolidColors） */
const plainToons = new WeakSet<THREE.Material>()
export function toon(color: THREE.ColorRepresentation, opts: { emissive?: number; transparent?: number } = {}) {
  const c = new THREE.Color(color)
  const key = `${c.getHexString()}|${opts.emissive ?? 0}|${opts.transparent ?? 1}`
  let m = toonCache.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() })
    if (opts.emissive) {
      m.emissive = c.clone()
      m.emissiveIntensity = opts.emissive
    }
    if (opts.transparent !== undefined && opts.transparent < 1) {
      m.transparent = true
      m.opacity = opts.transparent
      m.depthWrite = false
    }
    if (!opts.emissive && !m.transparent) plainToons.add(m)
    toonCache.set(key, m)
  }
  return m
}

/**
 * 深度偏移：顶点沿视线往镜头拉近自身距离的 k 倍（透视相机按比例缩视空间坐标，屏幕位置不变；正交相机只动 z）。
 * 用来让墙纸、边饰、外墙面压过和它共面 / 贴着的相邻面，代替 polygonOffset：polygonOffset 的 factor 项按表面倾斜放大，
 * 掠射角（和视线几乎平行的内墙面、边饰）时偏移没有上限，内墙的墙纸、顶角线会被拉到外墙、屋面前面（外观视图里穿模）。
 * 这里的偏移只和距离成正比（k = 4e-4：20m 外 0.8cm），远小于外墙厚、屋面到墙顶的距离；同样拉近的面之间前后关系不变。
 * 克隆材质时照常拷 onBeforeCompile / customProgramCacheKey 就会带上。
 */
export function pullDepth<T extends THREE.Material>(m: T, k: number): T {
  const before = m.onBeforeCompile
  const key = m.customProgramCacheKey()
  const f = (1 - k).toFixed(7)
  m.onBeforeCompile = function (sh, r) {
    before.call(this, sh, r)
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
  gl_Position = projectionMatrix * ( projectionMatrix[ 2 ][ 3 ] != 0.0 ? vec4( mvPosition.xyz * ${f}, 1.0 ) : vec4( mvPosition.xy, mvPosition.z * ${f}, 1.0 ) );`,
    )
  }
  m.customProgramCacheKey = () => `${key}|pull${f}`
  m.polygonOffset = false
  return m
}

let vcToon: THREE.MeshToonMaterial | null = null
/**
 * 顶点色的 toon 材质（家具单材质合并用，所有家具共用一份）：底色白色 × 顶点色 = 原来各材质的颜色，着色结果和原来逐材质完全一样。
 * 自发光也乘顶点色：悬停高亮、灯罩兜底发光等「按自身颜色自发光」的克隆（emissive = color = 白）因此仍是同色提亮。
 * 灯光遮罩照常接上（自己设了 onBeforeCompile 就要自己调 injectLightMask）。
 */
export function vertexColorToon() {
  if (vcToon) return vcToon
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() })
  m.onBeforeCompile = (sh) => {
    injectLightMask(sh)
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;')
  }
  m.customProgramCacheKey = () => 'toon-vertex-color'
  m.userData.vertexColorToon = true
  vcToon = m
  return m
}

/** 描边：沿法线在屏幕空间外扩，线宽不随距离变化；颜色取填充色的深色版本，更像手绘 */
const outlineCache = new Map<string, THREE.ShaderMaterial>()
// uManga：黑白漫画效果渲染时描边输出墨线标记（manga.ts，R = 1），和受光材质共用同一个 uniform 对象
export const outlineUniforms = { uWidth: { value: 1.6 }, uViewport: { value: new THREE.Vector2(800, 600) }, uManga: mangaUniforms.uManga }
function outlineMaterial(color: THREE.Color) {
  const key = color.getHexString()
  let m = outlineCache.get(key)
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { ...outlineUniforms, uColor: { value: color } },
      vertexShader: /* glsl */ `
        uniform float uWidth;
        uniform vec2 uViewport;
        void main() {
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
          float l = length(dir);
          if (l > 1e-5) clip.xy += dir / l * uWidth * 2.0 / uViewport * clip.w;
          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uManga;
        void main() { gl_FragColor = uManga > 0.5 ? vec4(1.0, 0.5, 0.5, 1.0) : vec4(uColor, 1.0); }`,
      side: THREE.BackSide,
    })
    outlineCache.set(key, m)
  }
  return m
}

// 描边颜色：填充色的深色版本。浅色 / 中色填充沿用原来的算法；近黑的填充（黑色电竞椅、人体工学椅、
// 小车底盘、深色显示器）如果描边也接近黑，远景观感里轮廓和内部转折会糊成一坨黑，所以单独给一个
// 有上限的提亮——色相不变、饱和度压低，明度最高只到中灰（比白填充的描边还暗一档），不会变成刺眼的
// 白色硬边。注意 getHSL 默认在工作色彩空间（线性）里取值，这里的数字比肉眼看到的明度低。
const OUTLINE_FLOOR = 0.12 // 描边明度下限（沿用原值）
const OUTLINE_DARK_FROM = 0.3 // 填充线性明度低于它才开始提亮；提亮量线性衰减，到这里归零，函数连续
const OUTLINE_DARK_L = 0.3 // 纯黑填充的描边明度上限（显示出来约 #3d4052–#4e463e 的中灰）：看得见轮廓，又不抢眼
export function outlineColor(fill: THREE.Color) {
  const hsl = { h: 0, s: 0, l: 0 }
  fill.getHSL(hsl)
  const dark = Math.max(0, 1 - hsl.l / OUTLINE_DARK_FROM)
  const lift = OUTLINE_DARK_L * dark
  const l = Math.max(OUTLINE_FLOOR, hsl.l * 0.32, lift)
  // 只有真的把描边抬到了下限以上才压饱和度（lifted: 0→1），其余填充的饱和度保持原样
  const lifted = Math.max(0, (lift - OUTLINE_FLOOR) / (OUTLINE_DARK_L - OUTLINE_FLOOR))
  const s = Math.min(1, (hsl.s * 0.8 + 0.1) * (1 - 0.35 * lifted))
  return new THREE.Color().setHSL(hsl.h, s, l)
}

let vcOutline: THREE.ShaderMaterial | null = null
/**
 * 顶点色描边：颜色逐顶点（属性 ocolor = 合并前各描边外壳的 uColor，已经按 outlineColor 算好），
 * ocolor.r < 0 的顶点所在零件原来没有描边（太小、noOutline），整片三角形移到裁剪空间外面丢掉。
 * uLinear / uDim 对应 post.ts 对普通描边 uColor 的临时调整（进线性 composer 时先转回线性、入夜压暗）。
 */
export function vertexColorOutline() {
  if (vcOutline) return vcOutline
  vcOutline = new THREE.ShaderMaterial({
    uniforms: { ...outlineUniforms, uLinear: { value: 0 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      uniform vec2 uViewport;
      attribute vec3 ocolor;
      varying vec3 vOColor;
      void main() {
        vOColor = ocolor;
        if (ocolor.r < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
        float l = length(dir);
        if (l > 1e-5) clip.xy += dir / l * uWidth * 2.0 / uViewport * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLinear;
      uniform float uDim;
      uniform float uManga;
      varying vec3 vOColor;
      vec3 toLinear(vec3 c) {
        return mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), vec3(greaterThanEqual(c, vec3(0.04045))));
      }
      void main() {
        vec3 c = uLinear > 0.5 ? toLinear(vOColor) : vOColor;
        gl_FragColor = uManga > 0.5 ? vec4(1.0, 0.5, 0.5, 1.0) : vec4(c * uDim, 1.0);
      }`,
    side: THREE.BackSide,
  })
  vcOutline.userData.vertexColorOutline = true
  return vcOutline
}

/**
 * 给 root 下所有网格加描边（userData.noOutline 的跳过）。
 * minSize：包围球直径小于它（cm）的网格不加（每个外壳都是一次 draw call；太小的零件描边只有几个像素）。
 */
export function addOutlines(root: THREE.Object3D, opts: { minSize?: number } = {}) {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.noOutline && !o.userData.isOutline) meshes.push(o as THREE.Mesh)
  })
  if (opts.minSize) root.updateMatrixWorld(true)
  for (const m of meshes) {
    const mat = m.material as THREE.MeshToonMaterial
    if (mat.transparent) continue
    if (opts.minSize) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
      if (m.geometry.boundingSphere!.radius * 2 * m.matrixWorld.getMaxScaleOnAxis() < opts.minSize) continue
    }
    const hull = new THREE.Mesh(m.geometry, outlineMaterial(outlineColor(mat.color)))
    hull.userData.isOutline = true
    hull.raycast = () => {}
    m.add(hull)
  }
}

// ---------- 体素 ----------

const geoCache = new Map<string, THREE.BufferGeometry>()
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    g.userData.shared = true
    geoCache.set(key, g)
  }
  return g as T
}

export interface At {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
}

function place(mesh: THREE.Mesh, at: At = {}) {
  mesh.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  mesh.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * 体素尺寸先量化再建几何：缓存键和几何用同一组数，同一个键永远对应同一份几何（不会因为先来的那次尺寸不同而差一点）。
 * 取整到 0.1cm（误差 ≤ 0.05cm）；不到 0.1cm 的细小尺寸保留到 0.001cm，免得被取成 0 变成退化几何。
 */
const q = (n: number) => (Math.abs(n) >= 0.1 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 1000)

/**
 * 体素细分按尺寸自适应：圆角 / 球 / 圆环越小，屏幕上越看不出棱角（卡通描边又会把轮廓压成一条线），
 * 小件用更少的段数。圆角盒 3 段时每个约 590 个三角面、1 段约 110 个；球 24×16 约 770、12×8 约 190。
 */
export function rboxSegments(r: number) {
  return r >= 4 ? 3 : r >= 1.5 ? 2 : 1
}
export function ballSegments(r: number): [number, number] {
  return r >= 8 ? [24, 16] : r >= 3 ? [16, 12] : [12, 8]
}
/**
 * 圆环：[管截面段数, 一整圈的段数]。管截面只看管粗（细管 8 段）；一整圈的段数只看环的半径（r < 4 的小环 24 段）。
 * 不能因为管细或环不大就减圈上的段数：贴着杯子、花瓶、桶身的箍（cup / cyl 都是 32 / 24 段）折线和器身对不上，
 * 会一截截陷进去（截图对比里 r≈6 的陶罐箍降到 24 段就成了虚线）。不满一圈的按弧长比例减段（至少 6 段）。
 */
export function torusSegments(r: number, tube: number, arc: number): [number, number] {
  const radial = tube < 1.5 ? 8 : 10
  const full = r < 4 ? 24 : 32
  return [radial, Math.max(6, Math.ceil((full * arc) / (Math.PI * 2)))]
}

/** 圆角盒，at.y 是底面高度（不是中心），摆东西更顺手 */
export function rbox(w: number, h: number, d: number, color: THREE.ColorRepresentation, at: At = {}, radius?: number) {
  w = q(w)
  h = q(h)
  d = q(d)
  const r = q(Math.max(0.01, Math.min(radius ?? Math.min(w, h, d) * 0.18, Math.min(w, h, d) / 2 - 0.01)))
  const seg = rboxSegments(r)
  const g = cached(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r))
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + h / 2 })
}

/** 圆柱 / 圆台，at.y 为底面 */
export function cyl(rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation, at: At = {}, seg = 24) {
  rTop = q(rTop)
  rBottom = q(rBottom)
  h = q(h)
  const g = cached(`cy${rTop},${rBottom},${h},${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg))
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + h / 2 })
}

/** 圆角圆柱（坐垫、饼状物）：胶囊压扁 */
export function puck(r: number, h: number, color: THREE.ColorRepresentation, at: At = {}) {
  r = q(r)
  h = q(h)
  const g = cached(`pk${r},${h}`, () => {
    const k = Math.min(h / 2, r) * 0.9
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)]
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      for (let i = 0; i <= 5; i++) {
        const a = a0 + ((a1 - a0) * i) / 5
        pts.push(new THREE.Vector2(cx + Math.cos(a) * k, cy + Math.sin(a) * k))
      }
    }
    arc(r - k, -h / 2 + k, -Math.PI / 2, 0)
    arc(r - k, h / 2 - k, 0, Math.PI / 2)
    pts.push(new THREE.Vector2(0, h / 2))
    return new THREE.LatheGeometry(pts, 32)
  })
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + h / 2 })
}

/** 空心的杯 / 桶 / 花盆：带壁厚和圆润的口沿，at.y 为底面 */
export function cup(rTop: number, rBottom: number, h: number, t: number, color: THREE.ColorRepresentation, at: At = {}) {
  rTop = q(rTop)
  rBottom = q(rBottom)
  h = q(h)
  t = q(t)
  const g = cached(`cu${rTop},${rBottom},${h},${t}`, () => {
    const k = Math.min(t * 0.6, rBottom * 0.2)
    const innerBottom = rBottom - t + ((rTop - rBottom) * t) / h
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
    // 外底的小倒角
    pts.push(new THREE.Vector2(rBottom - k, 0), new THREE.Vector2(rBottom, k))
    pts.push(new THREE.Vector2(rTop, h - t / 2))
    // 口沿：半圆
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI
      pts.push(new THREE.Vector2(rTop - t / 2 + (Math.cos(a) * t) / 2, h - t / 2 + (Math.sin(a) * t) / 2))
    }
    pts.push(new THREE.Vector2(rTop - t, h - t / 2))
    pts.push(new THREE.Vector2(innerBottom, t + k), new THREE.Vector2(innerBottom - k, t))
    pts.push(new THREE.Vector2(0, t))
    return new THREE.LatheGeometry(pts, 32)
  })
  return place(new THREE.Mesh(g, toon(color)), at)
}

/** 空心的方箱（花箱、浴缸）：底板 + 四面壁，at.y 为底面 */
export function tray(w: number, h: number, d: number, t: number, color: THREE.ColorRepresentation, at: At = {}, radius?: number) {
  const r = radius ?? Math.min(t * 0.45, 3)
  const g = new THREE.Group()
  g.add(rbox(w, t, d, color, {}, r))
  for (const s of [-1, 1]) {
    g.add(rbox(w, h, t, color, { z: (s * (d - t)) / 2 }, r))
    g.add(rbox(t, h, d - t * 2 + r * 2, color, { x: (s * (w - t)) / 2 }, r))
  }
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  g.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  return g
}

/** 球 / 椭球，at.y 为球心；scale 用于压扁 */
export function ball(r: number, color: THREE.ColorRepresentation, at: At = {}, scale?: [number, number, number]) {
  r = q(r)
  const [ws, hs] = ballSegments(r)
  const g = cached(`sp${r},${ws}x${hs}`, () => new THREE.SphereGeometry(r, ws, hs))
  const m = place(new THREE.Mesh(g, toon(color)), at)
  if (scale) m.scale.set(...scale)
  return m
}

/** 胶囊，竖直；at.y 为底 */
export function capsule(r: number, len: number, color: THREE.ColorRepresentation, at: At = {}) {
  r = q(r)
  len = q(len)
  const g = cached(`cp${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16))
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + len / 2 + r })
}

export function torus(r: number, tube: number, color: THREE.ColorRepresentation, at: At = {}, arc = Math.PI * 2) {
  r = q(r)
  tube = q(tube)
  // 弧度取整到 0.001（按 0.1 取整的话，半径大的圆环弧长误差会超过 0.05cm）
  arc = Math.abs(arc - Math.PI * 2) < 1e-4 ? Math.PI * 2 : Math.round(arc * 1000) / 1000
  const [radial, tubular] = torusSegments(r, tube, arc)
  const g = cached(`to${r},${tube},${arc},${radial}x${tubular}`, () => new THREE.TorusGeometry(r, tube, radial, tubular, arc))
  return place(new THREE.Mesh(g, toon(color)), at)
}

/** 平面贴片（不描边），用于地板花纹、画、屏幕等 */
export function plate(w: number, d: number, color: THREE.ColorRepresentation, at: At = {}, emissive = 0) {
  w = q(w)
  d = q(d)
  const g = cached(`pl${w},${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2))
  const m = place(new THREE.Mesh(g, toon(color, { emissive })), at)
  m.userData.noOutline = true
  m.castShadow = false
  return m
}

/** 叶子：压扁的球 */
export function leaf(len: number, color: THREE.ColorRepresentation, at: At = {}) {
  return ball(len / 2, color, at, [0.45, 0.12, 1])
}

/** 一张可爱的脸：两只眼睛 + 腮红，贴在 z 正方向的面上 */
export function face(size: number, at: { x?: number; y: number; z: number }, blush = '#ff9db0') {
  const g = new THREE.Group()
  const eye = size * 0.11
  const gap = size * 0.28
  for (const s of [-1, 1]) {
    const e = ball(eye, '#3a2a2a', { x: s * gap, y: 0, z: 0 }, [1, 1.25, 0.5])
    e.userData.noOutline = true
    g.add(e)
    const hl = ball(eye * 0.35, '#ffffff', { x: s * gap + eye * 0.3, y: eye * 0.45, z: eye * 0.35 })
    hl.userData.noOutline = true
    g.add(hl)
    const b = ball(eye * 1.1, blush, { x: s * (gap + eye * 1.6), y: -eye * 1.5, z: -eye * 0.2 }, [1.3, 0.6, 0.3])
    b.userData.noOutline = true
    g.add(b)
  }
  g.position.set(at.x ?? 0, at.y, at.z)
  return g
}

export function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group()
  for (const c of children) g.add(c)
  return g
}

/** 颜色微调：同一色系的深 / 浅版本 */
/** track = false：不登记来源（随机调出来的颜色，不是配色槽，如 woodGrain.ts 的每块地板） */
export function shade(color: string, dl: number, ds = 0, track = true) {
  const c = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  const out = new THREE.Color().setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + ds)), Math.max(0, Math.min(1, hsl.l + dl))).getHexString()
  // 记下深浅色是从哪个颜色调出来的：材质标注（mats.ts）按配色槽认零件，shade 出来的底座、阴影色也要认得出是哪一槽
  const src = c.getHexString()
  if (track && out !== src && !shadeSrc.has(out)) shadeSrc.set(out, src)
  return '#' + out
}
const shadeSrc = new Map<string, string>()
/** 由 shade() 调出 hex（不带 #）的那个原色；不是 shade 出来的返回 undefined */
export const shadeSource = (hex: string) => shadeSrc.get(hex)

/** 反射面（three 的 Reflector：地面反射膜、镜子 / 水面上挂的反射面）：淡出、遮蔽、倒影这些遍历都要跳过它 */
export const isReflector = (o: THREE.Object3D) => !!(o as THREE.Object3D & { isReflector?: boolean }).isReflector

/**
 * 标记镜面：开着反射时 three/mirrors.ts 给离人近的镜子换上真实的平面反射。
 * 网格的几何体要是薄片（最薄的那个轴就是镜面法线，朝素材正面 +z 的一侧是镜面）；带标记的网格不参与合并。
 */
export function markMirror<T extends THREE.Object3D>(o: T): T {
  o.userData.mirror = true
  // 写实光照下按玻璃画（mats.ts）：镜面不透明，按颜色推断不出来
  o.userData.mat ??= 'glass'
  return o
}

/** 标记水面：开着反射时 three/mirrors.ts 给水面换上会动的水，离人近的再叠真实倒影。网格要是水平的薄片（朝上的那面是水面） */
export function markWater<T extends THREE.Object3D>(o: T): T {
  o.userData.water = true
  return o
}

// ---------- 合并静态网格（减少 draw call） ----------

// mask：宠物毛色材质的花纹场（见 critter-geo.ts 的 furMaterial）
const MERGE_ATTRS = new Set(['position', 'normal', 'uv', 'mask'])
/** 不算「业务标记」的 userData：带着它们的零件照样合并（noOutline 不描边、mat 材质类别，合并时按 mat 分组 / 写成逐顶点属性） */
const PLAIN_KEYS = new Set(['noOutline', 'mat'])

/** 能不能并进同材质的大网格：普通不透明网格、没有子节点、没有业务标记、几何体只有常规属性 */
function mergeable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (m.children.length || !m.visible || m.renderOrder !== 0 || Array.isArray(m.material)) return false
  if (m.material.transparent || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false
  for (const k in m.userData) if (!PLAIN_KEYS.has(k)) return false
  const g = m.geometry
  if (!g.attributes.position || Object.keys(g.morphAttributes).length || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false
  for (const k in g.attributes) if (!MERGE_ATTRS.has(k)) return false
  return true
}

/**
 * 把模型里材质、投影设置、描边标记都相同的网格合成一个（顶点烘进模型局部坐标）。
 * 家具由几十上百个小零件拼成，合并后 draw call 降到「每种材质一个」，外观完全一样：
 * 描边外壳沿逐顶点法线外扩，合并前后结果相同。带 userData 的（游动的鱼、门窗信息等）和半透明的不动；
 * 柜门 / 抽屉子树（userData.door）不和柜体合并，但子树内部单独合并（开合时整棵子树一起动）。
 * 要在 addOutlines 之前调用。
 */
export function mergeMeshes(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, THREE.Mesh[]>()
  const walk = (o: THREE.Object3D) => {
    if (o !== root && Object.keys(o.userData).some((k) => !PLAIN_KEYS.has(k))) {
      // 柜门 / 抽屉（kit.ts movable）：子树作为整体开合，内部零件在子树自己的局部坐标里照样按材质合并
      if (o.userData.door) mergeMeshes(o)
      return // 有业务标记的子树整体保留
    }
    for (const c of o.children) walk(c)
    if (o !== root && mergeable(o)) {
      const m = o as THREE.Mesh
      const key = `${(m.material as THREE.Material).uuid}|${+m.castShadow}|${+m.receiveShadow}|${+!!m.userData.noOutline}|${m.userData.mat ?? ''}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = []))
      b.push(m)
    }
  }
  walk(root)
  const local = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const v = new THREE.Vector3()
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    // 属性取并集，缺的补 0（和原来 WebGL 读未绑定属性的默认值一致）
    const names = new Set<string>()
    let verts = 0
    let tris = 0
    for (const m of list) {
      for (const k in m.geometry.attributes) names.add(k)
      const n = m.geometry.attributes.position.count
      verts += n
      tris += m.geometry.index ? m.geometry.index.count : n
    }
    const size: Record<string, number> = { position: 3, normal: 3, uv: 2, mask: 3 }
    const out: Record<string, Float32Array> = {}
    for (const k of names) out[k] = new Float32Array(verts * size[k])
    const index = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
    let vo = 0
    let io = 0
    for (const m of list) {
      const g = m.geometry
      local.multiplyMatrices(inv, m.matrixWorld)
      nm.getNormalMatrix(local)
      const flip = local.determinant() < 0
      const n = g.attributes.position.count
      for (const k of names) {
        const src = g.attributes[k] as THREE.BufferAttribute | undefined
        if (!src) continue
        const dst = out[k]
        const s = size[k]
        // 常见情况（非交错的 Float32 属性）直接读数组，比逐个 fromBufferAttribute 快几倍
        const arr = !(src as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && src.array instanceof Float32Array && src.itemSize === s ? src.array : null
        if (k === 'position' || k === 'normal') {
          const e: number[] = k === 'position' ? local.elements : nm.elements
          for (let i = 0; i < n; i++) {
            let x: number, y: number, z: number
            if (arr) {
              x = arr[i * 3]
              y = arr[i * 3 + 1]
              z = arr[i * 3 + 2]
            } else {
              v.fromBufferAttribute(src, i)
              x = v.x
              y = v.y
              z = v.z
            }
            const o = (vo + i) * 3
            if (k === 'position') {
              dst[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
              dst[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
              dst[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
            } else {
              const nx = e[0] * x + e[3] * y + e[6] * z
              const ny = e[1] * x + e[4] * y + e[7] * z
              const nz = e[2] * x + e[5] * y + e[8] * z
              const l = Math.hypot(nx, ny, nz) || 1
              dst[o] = nx / l
              dst[o + 1] = ny / l
              dst[o + 2] = nz / l
            }
          }
        } else if (arr) {
          dst.set(arr.subarray(0, n * s), vo * s)
        } else {
          for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) dst[(vo + i) * s + c] = src.getComponent(i, c)
        }
      }
      const idx = g.index
      const ia = idx?.array
      const cnt = idx ? idx.count : n
      for (let i = 0; i < cnt; i += 3) {
        const a = ia ? ia[i] : i
        const b = ia ? ia[i + 1] : i + 1
        const c = ia ? ia[i + 2] : i + 2
        // 镜像（负缩放）的零件：烘进顶点后要翻转绕序，否则正反面颠倒
        index[io++] = vo + a
        index[io++] = vo + (flip ? c : b)
        index[io++] = vo + (flip ? b : c)
      }
      vo += n
    }
    const geo = new THREE.BufferGeometry()
    for (const k of names) geo.setAttribute(k, new THREE.BufferAttribute(out[k], size[k]))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeBoundingSphere()
    const first = list[0]
    const merged = new THREE.Mesh(geo, first.material)
    merged.castShadow = first.castShadow
    merged.receiveShadow = first.receiveShadow
    if (first.userData.noOutline) merged.userData.noOutline = true
    if (first.userData.mat) merged.userData.mat = first.userData.mat
    for (const m of list) m.removeFromParent()
    root.add(merged)
  }
}

// ---------- 纯色材质并成一个顶点色材质（每件家具约 1 次填充 + 1 次描边） ----------

/** 能不能并进顶点色网格：纯色缓存 toon 材质、没有业务标记、子节点只有描边外壳、几何体只有常规属性 */
function solidColored(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (!m.visible || m.renderOrder !== 0 || Array.isArray(m.material) || !plainToons.has(m.material)) return false
  for (const k in m.userData) if (!PLAIN_KEYS.has(k)) return false
  if (m.children.some((c) => !c.userData.isOutline || c.children.length)) return false
  const g = m.geometry
  if (!g.attributes.position || !g.attributes.normal || Object.keys(g.morphAttributes).length || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false
  for (const k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv') return false
  return true
}

/**
 * 在 mergeMeshes + addOutlines（+ 花纹）之后调用：把纯色 toon 材质的网格按投影设置合成一个顶点色网格，
 * 顶点色 = 原材质颜色，描边改成一个读逐顶点颜色的外壳（原来没有描边的零件不画），画面和逐材质时一样。
 * 花纹（patternMaterial）、发光、半透明、贴图、带业务标记的子树（柜门以外）都不动；柜门 / 抽屉子树内部单独合并。
 * 返回合并掉的网格数（测试用）。
 */
export function mergeSolidColors(root: THREE.Object3D): number {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, THREE.Mesh[]>()
  let merged = 0
  const walk = (o: THREE.Object3D) => {
    if (o !== root && Object.keys(o.userData).some((k) => !PLAIN_KEYS.has(k))) {
      if (o.userData.door) merged += mergeSolidColors(o)
      return
    }
    for (const c of [...o.children]) if (!c.userData.isOutline) walk(c)
    if (o !== root && solidColored(o)) {
      const m = o as THREE.Mesh
      const key = `${+m.castShadow}|${+m.receiveShadow}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = []))
      b.push(m)
    }
  }
  walk(root)
  const local = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const col = new THREE.Color()
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    let verts = 0
    let tris = 0
    for (const m of list) {
      const n = m.geometry.attributes.position.count
      verts += n
      tris += m.geometry.index ? m.geometry.index.count : n
    }
    const pos = new Float32Array(verts * 3)
    const nor = new Float32Array(verts * 3)
    const color = new Float32Array(verts * 3)
    const ocolor = new Float32Array(verts * 3)
    // 逐顶点的材质编号（mats.ts，写实光照用）
    const mat = new Float32Array(verts)
    const index = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
    let outlined = false
    let vo = 0
    let io = 0
    for (const m of list) {
      const g = m.geometry
      local.multiplyMatrices(inv, m.matrixWorld)
      nm.getNormalMatrix(local)
      const flip = local.determinant() < 0
      const e = local.elements
      const ne = nm.elements
      const P = g.attributes.position
      const N = g.attributes.normal
      const n = P.count
      col.copy((m.material as THREE.MeshToonMaterial).color)
      const hull = m.children.find((c) => c.userData.isOutline) as THREE.Mesh | undefined
      const oc = (hull?.material as THREE.ShaderMaterial | undefined)?.uniforms?.uColor?.value as THREE.Color | undefined
      if (oc) outlined = true
      mat.fill(MAT_ID[m.userData.mat as Mat] ?? 0, vo, vo + n)
      for (let i = 0; i < n; i++) {
        const x = P.getX(i)
        const y = P.getY(i)
        const z = P.getZ(i)
        const o3 = (vo + i) * 3
        pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12]
        pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
        pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
        const a = N.getX(i)
        const b = N.getY(i)
        const c = N.getZ(i)
        const nx = ne[0] * a + ne[3] * b + ne[6] * c
        const ny = ne[1] * a + ne[4] * b + ne[7] * c
        const nz = ne[2] * a + ne[5] * b + ne[8] * c
        const l = Math.hypot(nx, ny, nz) || 1
        nor[o3] = nx / l
        nor[o3 + 1] = ny / l
        nor[o3 + 2] = nz / l
        color[o3] = col.r
        color[o3 + 1] = col.g
        color[o3 + 2] = col.b
        ocolor[o3] = oc ? oc.r : -1
        ocolor[o3 + 1] = oc ? oc.g : -1
        ocolor[o3 + 2] = oc ? oc.b : -1
      }
      const ia = g.index?.array
      const cnt = g.index ? g.index.count : n
      for (let i = 0; i < cnt; i += 3) {
        const a = ia ? ia[i] : i
        const b = ia ? ia[i + 1] : i + 1
        const c = ia ? ia[i + 2] : i + 2
        index[io++] = vo + a
        index[io++] = vo + (flip ? c : b)
        index[io++] = vo + (flip ? b : c)
      }
      vo += n
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('ocolor', new THREE.BufferAttribute(ocolor, 3))
    geo.setAttribute('mat', new THREE.BufferAttribute(mat, 1))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeBoundingSphere()
    const fill = new THREE.Mesh(geo, vertexColorToon())
    fill.castShadow = list[0].castShadow
    fill.receiveShadow = list[0].receiveShadow
    // 合并前每个零件各自带 noOutline 标记已经体现在 ocolor 里；整体不再需要 noOutline
    if (outlined) {
      const hull = new THREE.Mesh(geo, vertexColorOutline())
      hull.userData.isOutline = true
      hull.raycast = () => {}
      fill.add(hull)
    } else fill.userData.noOutline = true
    for (const m of list) m.removeFromParent()
    root.add(fill)
    merged += list.length
  }
  return merged
}

/**
 * 半透明网格（玻璃、纱帘、水面：材质或材质数组全部 transparent）不投影，只接收阴影。
 * 体素默认 castShadow = true，换成半透明材质后投影标记还开着，阳光会被整扇窗挡住。
 * 在建模出口（家具模型、房体）统一调一遍；楼层淡出临时换上的透明副本由 fadeFloor 自己管，不受影响。
 */
export function noTransparentShadows(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.castShadow || o.userData.isOutline) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    if (mats.length && mats.every((x) => x.transparent)) m.castShadow = false
  })
}

/** disposeUnshared 遍历到这些对象时调用的回调（只调一次），house.ts 的家具模板用它做引用计数 */
export const disposeHooks = new WeakMap<THREE.Object3D, () => void>()

/**
 * 丢弃一棵场景树（移除家具、重建房子时）：释放共享缓存以外的几何体（合并出来的、墙体等每次新建的、
 * 绿植弯曲用的克隆）和淡出用的克隆材质，否则会一直占着显存。
 * 万一某个几何体其实还在别处用，three 下次渲染时会重新上传，不会出错。
 */
export function disposeUnshared(root: THREE.Object3D) {
  root.traverse((o) => {
    // 登记了释放回调的（家具模板的实例：归还模板引用）
    const hook = disposeHooks.get(o)
    if (hook) {
      disposeHooks.delete(o)
      hook()
    }
    const m = o as THREE.Mesh
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose()
    const orig = o.userData.origGeo as THREE.BufferGeometry | undefined
    if (orig && !orig.userData.shared) orig.dispose()
    const parts = o.userData.parts as { parts: { ghost: THREE.Material[] }[] } | undefined
    if (parts) for (const p of parts.parts) for (const g of p.ghost) g.dispose()
  })
}
