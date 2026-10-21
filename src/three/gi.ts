// 间接光（「手游风」，画面效果 LookDef.gi）：按房间布的辐照度探针，把半球光换成「从周围反射过来的光」。
//
// 半球光只按朝向给一个天色 / 地色，屋里每面墙都是同一个亮度。游戏室内的层次大多来自烘焙的间接光：靠窗亮、深处暗，
// 被阳光照到的地板把暖色反到墙上和天花板上，房间的颜色互相染。这里在浏览器里实时烘一份很粗的：
//   - 布点：每层按 SPACING 的方格，格子落在房间里（房间编号图，lightMask.ts，编号 ≥ 2）就在离地 PROBE_H 处放一个探针，
//     记下它所在的房间组（敞开相连的房间共用一组）；
//   - 采集：在探针处用立方体相机把场景画一遍（就用这一帧换好的材质和灯光，阳光的光斑、窗外的天、亮着的灯都在里面）。
//     画的时候材质照样用图集里上一轮的探针（采集画进立方体图，不画进图集，不会读写同一张图）：屋里的面只受间接光，
//     光只能从窗户（天空、阳光的光斑）和灯进来；每轮多一次反弹，场景或灯光变了连烘 ROUNDS 轮，收敛到靠窗亮、深处暗。
//     户外的面周围没有探针，照旧用半球光。一开始图集是空的，第一轮就是「半球光照亮的周围」；
//   - 投影：一个小着色器把立方体图积分成 9 个球谐系数（L2，RGB），写进探针图集（每个探针 7 个半浮点像素，第 7 个像素的 alpha 记房间组），
//     全在 GPU 上做，不回读；
//   - 取用：受光材质（realistic.ts 的 PBR）在算间接漫反射时，按片元位置取周围 4 个探针、丢掉别的房间组的（不透墙）、双线性混合，
//     按法线求球谐的辐照度，替换半球光；周围一个能用的都没有（户外、楼梯间的缝）就照旧用半球光。
// 烘焙是渐进的：每帧采几个探针（离镜头近的先采），原地更新图集；场景、灯光变了就再轮一遍，轮的途中画面沿用旧值慢慢变过去。
// 单位：厘米。平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { currentLightMask, lightMaskUniforms, maskAt, LM_MAX_FLOORS, LM_OUTDOOR, type LightMaskMap } from './lightMask'
import { reflectors } from './reflectFrame'

/** 探针间距、离地高度（cm） */
const SPACING = 120
const PROBE_H = 120
/** 立方体图边长、投影时每个面取样的边长 */
const CUBE = 24
const SAMPLES = 16
/** 每个探针占图集的像素数（9 × RGB = 27 个数 + 房间组） */
const TEXELS = 7
/** 采集相机的远平面（cm）：只要房间尺度（天球钉在远平面上，照样画得出来） */
const FAR = 1500
/** 采集时藏掉的小物件（包围球半径，cm）：它们对间接光几乎没贡献，却占了大半的 draw call */
const SMALL = 14
/** 每帧采几个探针：一个探针 6 个面，每个面都是一次完整的场景渲染（CPU 上约 3ms，大半是 three 遍历场景），多了会明显掉帧 */
const PER_FRAME = 1
/** 户型变了（图集从空的开始）连烘几轮、场景 / 灯光变了连烘几轮（每轮多一次反弹；后者接着上次的结果烘，少一轮也够） */
const ROUNDS_FRESH = 3
const ROUNDS = 2
/** 间接光里保底留多少半球光：探针是粗的，墙角、家具缝里不至于全黑 */
const AMBIENT_FLOOR = 0.12
/** 间接光的饱和度 */
const GI_SAT = 0.75

const blank = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType)
blank.needsUpdate = true

/** 所有材质共享（注入时按引用接上） */
export const giUniforms = {
  giAtlas: { value: blank as THREE.Texture },
  /** x0, z0, 1 / 间距, 每层的行数 */
  giGrid: { value: new THREE.Vector4(0, 0, 1 / SPACING, 1) },
  /** 开关, 每行的探针数, 强度, 保底的半球光比例 */
  giInfo: { value: new THREE.Vector4(0, 1, 1, AMBIENT_FLOOR) },
}

/** 材质端：放在 lights_pars_begin 之后（要用它的 shGetIrradianceAt，和 lightMask.ts 的 lmFetch / lmFloorOf） */
export const GI_PARS = /* glsl */ `
uniform sampler2D giAtlas;
uniform vec4 giGrid;
uniform vec4 giInfo;
// 片元的间接光辐照度（a = 1 有效，0 = 周围没有能用的探针，照旧用半球光）
vec4 giIrradiance( vec3 wp, vec3 wn ) {
	vec3 gp = wp + wn * 8.0;
	float gf = lmFloorOf( gp.y );
	float grp = lmFetch( gp.xz, gf ).x;
	if ( abs( grp - ${LM_OUTDOOR}.0 ) < 0.5 ) return vec4( 0.0 );
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
		ivec2 base = ivec2( c.x * ${TEXELS}, int( gf + 0.5 ) * nz + c.y );
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

/** 材质端：放在 lights_fragment_maps 之前（这时 irradiance 已经加好了半球光） */
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

/** 立方体图 → 9 个球谐系数（辐射度的投影，和 three 的 LightProbeGenerator 同一套基函数和归一化），写进图集里这个探针的 7 个像素 */
const ProjectShader = {
  uniforms: {
    tCube: { value: null as THREE.Texture | null },
    uBaseX: { value: 0 },
    uGroup: { value: 0 },
  },
  vertexShader: /* glsl */ `
    void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform samplerCube tCube;
    uniform float uBaseX;
    uniform float uGroup;
    vec3 faceDir( int f, vec2 uv ) {
      if ( f == 0 ) return vec3( 1.0, uv.y, -uv.x );
      if ( f == 1 ) return vec3( -1.0, uv.y, uv.x );
      if ( f == 2 ) return vec3( uv.x, 1.0, -uv.y );
      if ( f == 3 ) return vec3( uv.x, -1.0, uv.y );
      if ( f == 4 ) return vec3( uv.x, uv.y, 1.0 );
      return vec3( -uv.x, uv.y, -1.0 );
    }
    void main() {
      vec3 c[ 9 ];
      for ( int i = 0; i < 9; i ++ ) c[ i ] = vec3( 0.0 );
      float wt = 0.0;
      for ( int f = 0; f < 6; f ++ ) {
        for ( int a = 0; a < ${SAMPLES}; a ++ ) {
          for ( int b = 0; b < ${SAMPLES}; b ++ ) {
            vec2 uv = ( vec2( float( a ), float( b ) ) + 0.5 ) / ${SAMPLES}.0 * 2.0 - 1.0;
            // 立方体面上一个格子对应的立体角
            float dw = 1.0 / pow( 1.0 + dot( uv, uv ), 1.5 );
            vec3 d = normalize( faceDir( f, uv ) );
            vec3 L = textureLod( tCube, d, 0.0 ).rgb * dw;
            wt += dw;
            float x = d.x, y = d.y, z = d.z;
            c[ 0 ] += L * 0.282095;
            c[ 1 ] += L * 0.488603 * y;
            c[ 2 ] += L * 0.488603 * z;
            c[ 3 ] += L * 0.488603 * x;
            c[ 4 ] += L * 1.092548 * x * y;
            c[ 5 ] += L * 1.092548 * y * z;
            c[ 6 ] += L * 0.315392 * ( 3.0 * z * z - 1.0 );
            c[ 7 ] += L * 1.092548 * x * z;
            c[ 8 ] += L * 0.546274 * ( x * x - y * y );
          }
        }
      }
      float norm = 4.0 * PI / wt;
      float v[ 28 ];
      for ( int i = 0; i < 9; i ++ ) {
        vec3 s = c[ i ] * norm;
        v[ i * 3 ] = s.r;
        v[ i * 3 + 1 ] = s.g;
        v[ i * 3 + 2 ] = s.b;
      }
      v[ 27 ] = uGroup;
      int k = int( gl_FragCoord.x - uBaseX );
      gl_FragColor = vec4( v[ k * 4 ], v[ k * 4 + 1 ], v[ k * 4 + 2 ], v[ k * 4 + 3 ] );
    }`,
}

interface Probe {
  pos: THREE.Vector3
  group: number
  /** 在图集里的像素位置 */
  x: number
  y: number
}

export interface GI {
  /** 每帧主画面之前调（材质已经换好）：布点、按需采几个探针；返回 true = 这一帧更新过探针（画面要重画） */
  step(on: boolean, version: number): boolean
  /** 还在烘（要继续要帧） */
  busy(): boolean
  setGain(v: number): void
  dispose(): void
}

export function createGI(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight): GI {
  const cubeRT = new THREE.WebGLCubeRenderTarget(CUBE, { type: THREE.HalfFloatType, generateMipmaps: false })
  const cubeCam = new THREE.CubeCamera(5, FAR, cubeRT)
  const proj = new THREE.ShaderMaterial({ ...ProjectShader, depthTest: false, depthWrite: false })
  proj.defines = { PI: Math.PI.toFixed(8) }
  const quad = new FullScreenQuad(proj)
  let atlas: THREE.WebGLRenderTarget | null = null
  let probes: Probe[] = []
  let layoutKey = ''
  let lightKey = ''
  let order: Probe[] = []
  let cursor = 0
  /** 这一轮完了还要再烘几轮（灯光 / 场景在途中又变了也是再来） */
  let pending = 0
  /** 图集刚建（空的） */
  let fresh = false
  let ready = false
  let gain = 1
  let hideVersion = -1
  let hideList: THREE.Object3D[] = []

  function layout(m: LightMaskMap) {
    const floorY = lightMaskUniforms.lmFloorY.value
    const w = m.width * m.cell
    const h = m.height * m.cell
    const nx = Math.max(1, Math.ceil(w / SPACING))
    const nz = Math.max(1, Math.ceil(h / SPACING))
    const F = Math.min(m.floors, LM_MAX_FLOORS)
    probes = []
    for (let f = 0; f < F; f++) {
      if (floorY[f] > 1e6) continue
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          // 格子中心落在墙里、房间外时，在格子里另找一个落在房间里的点
          let hit: { x: number; y: number; id: number } | null = null
          for (const [u, v] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
            const p = { x: m.x0 + (i + u) * SPACING, y: m.y0 + (j + v) * SPACING }
            const id = maskAt(m, f, p).id
            if (id >= 2) {
              hit = { ...p, id }
              break
            }
          }
          if (hit) probes.push({ pos: new THREE.Vector3(hit.x, floorY[f] + PROBE_H, hit.y), group: hit.id, x: i * TEXELS, y: f * nz + j })
        }
    }
    atlas?.dispose()
    atlas = new THREE.WebGLRenderTarget(nx * TEXELS, nz * F, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false })
    const prevTarget = renderer.getRenderTarget()
    const prevClear = renderer.getClearColor(new THREE.Color())
    const prevAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(atlas)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, false, false)
    renderer.setClearColor(prevClear, prevAlpha)
    renderer.setRenderTarget(prevTarget)
    giUniforms.giAtlas.value = atlas.texture
    giUniforms.giGrid.value.set(m.x0, m.y0, 1 / SPACING, nz)
    giUniforms.giInfo.value.y = nx
    ready = false
  }

  /** 场景里的灯光状态（变了要重烘）：太阳、天光、点光源 */
  const point: THREE.PointLight[] = []
  let pointVersion = -1
  function lightsKey(version: number) {
    if (pointVersion !== version) {
      pointVersion = version
      point.length = 0
      scene.traverse((o) => (o as THREE.PointLight).isPointLight && point.push(o as THREE.PointLight))
    }
    const d = sun.position
    let k = `${d.x.toFixed(0)},${d.y.toFixed(0)},${d.z.toFixed(0)},${sun.intensity.toFixed(2)},${sun.color.getHexString()}|${hemi.intensity.toFixed(2)},${hemi.color.getHexString()},${hemi.groundColor.getHexString()}`
    for (const l of point) k += `p${l.visible ? l.intensity.toFixed(2) : 0}`
    return k
  }

  function startRound(more: number) {
    cursor = 0
    pending = more
    // 离镜头近的先采
    const c = camera.position
    order = probes.slice().sort((a, b) => a.pos.distanceToSquared(c) - b.pos.distanceToSquared(c))
  }

  function capture(p: Probe) {
    cubeCam.position.copy(p.pos)
    cubeCam.updateMatrixWorld()
    cubeCam.update(renderer, scene)
    proj.uniforms.tCube.value = cubeRT.texture
    proj.uniforms.uBaseX.value = p.x
    proj.uniforms.uGroup.value = p.group
    const a = atlas!
    a.viewport.set(p.x, p.y, TEXELS, 1)
    a.scissor.set(p.x, p.y, TEXELS, 1)
    a.scissorTest = true
    renderer.setRenderTarget(a)
    quad.render(renderer)
    a.scissorTest = false
    a.viewport.set(0, 0, a.width, a.height)
  }

  return {
    step(on, version) {
      if (import.meta.env.DEV && dbg().off) on = false
      giUniforms.giInfo.value.x = on && ready ? 1 : 0
      giUniforms.giInfo.value.z = gain
      if (!on) return false
      const m = currentLightMask()
      if (!m) {
        giUniforms.giInfo.value.x = 0
        return false
      }
      const floorY = lightMaskUniforms.lmFloorY.value
      const lk = `${m.x0},${m.y0},${m.width},${m.height},${m.floors},${m.data.length}|${Array.from(floorY.slice(0, m.floors), (v) => v.toFixed(0)).join()}`
      if (lk !== layoutKey) {
        layoutKey = lk
        layout(m)
        lightKey = ''
        fresh = true
      }
      const k = `${version}|${lightsKey(version)}`
      if (k !== lightKey) {
        lightKey = k
        const rounds = fresh ? ROUNDS_FRESH : ROUNDS
        fresh = false
        if (cursor >= order.length) startRound(rounds - 1)
        else pending = rounds
      }
      if (cursor >= order.length) return false
      // 采集时：间接光照开（用上一轮的探针，多次反弹）、强度按 1（强度只是最后画面的曝光，乘进反弹会越烘越亮）、
      // 阴影图不重画、描边壳 / 反射面 / 粒子 / 小物件藏起来
      if (hideVersion !== version) {
        hideVersion = version
        hideList = []
        const ws = new THREE.Vector3()
        scene.traverse((o) => {
          if (o.userData.isOutline || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) return void hideList.push(o)
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh || !mesh.geometry || o.name === 'anime-sky') return
          const g = mesh.geometry
          if (!g.boundingSphere) g.computeBoundingSphere()
          if (g.boundingSphere!.radius * o.getWorldScale(ws).x < SMALL) hideList.push(o)
        })
      }
      const hidden: THREE.Object3D[] = []
      for (const o of [...hideList, ...reflectors])
        if (o.visible) {
          o.visible = false
          hidden.push(o)
        }
      const sm = renderer.shadowMap
      const auto = sm.autoUpdate
      const needs = sm.needsUpdate
      sm.autoUpdate = false
      sm.needsUpdate = false
      const giOn = giUniforms.giInfo.value.x
      giUniforms.giInfo.value.x = 1
      giUniforms.giInfo.value.z = 1
      const target = renderer.getRenderTarget()
      const t0 = performance.now()
      try {
        for (let n = 0; n < PER_FRAME && cursor < order.length; n++) capture(order[cursor++])
      } finally {
        renderer.setRenderTarget(target)
        giUniforms.giInfo.value.x = giOn
        giUniforms.giInfo.value.z = gain
        sm.autoUpdate = auto
        sm.needsUpdate = needs
        for (const o of hidden) o.visible = true
      }
      if (import.meta.env.DEV) Object.assign(dbg(), { probes: probes.length, cursor, pending, ms: +(performance.now() - t0).toFixed(1), hidden: hidden.length })
      if (cursor >= order.length) {
        ready = true
        giUniforms.giInfo.value.x = 1
        if (pending > 0) startRound(pending - 1)
      }
      return true
    },
    busy: () => cursor < order.length,
    setGain(v) {
      gain = (import.meta.env.DEV ? dbg().gain : undefined) ?? v
    },
    dispose() {
      cubeRT.dispose()
      atlas?.dispose()
      proj.dispose()
      quad.dispose()
      giUniforms.giAtlas.value = blank
      giUniforms.giInfo.value.x = 0
    },
  }
}

// 开发时给截图脚本看探针状态、关掉对比、调强度（window.__myhomeGIDebug = { off, gain }）
const dbg = () => ((window as unknown as { __myhomeGIDebug?: { off?: boolean; gain?: number } }).__myhomeGIDebug ??= {})
if (import.meta.env.DEV) Object.assign(window, { __myhomeGI: giUniforms })
