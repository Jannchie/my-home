// 室内灯的「楼层 + 房间」遮罩：点光源不投阴影，光会穿过楼板照到上下层、穿过隔墙照进隔壁。
// 这里用一张俯视的房间编号图把每盏灯限制在它所在的楼层和房间（以及敞开相连的房间）里。
//
// 做法：
//   - 每层生成一张「房间编号图」（buildLightMask，纯函数，单元测试覆盖），各层上下拼成一张 RGBA8 图集：
//       R = 片元所在格子的编号：0 = 墙体（同层的灯都放行：墙顶、门窗框、门洞里的地面）、1 = 户外（阳台也算）、
//           2.. = 房间组（敞开相连的房间——同 openGroup 的客餐厅、玄関与廊下…——共用一个编号）
//       G = 上一层在这个位置开洞（楼梯洞口 / 挑空）时，上一层那里的编号：上层的灯可以从洞口照下来
//       B = 本层在这个位置开洞时，下一层那里的编号：下层的灯可以从洞口照上来（楼梯上半段、挑空里通高的墙）
//   - 每盏点光源记 (楼层序号, 房间组)，放在 uniform 数组里，下标和 three 的 pointLights[ i ] 一一对应
//     （灯池的灯是场景里仅有的点光源，按加入顺序排列，three 收集灯时不重排）。开关灯、换池子分配只改数组，不重编译。
//   - 片元：世界坐标沿法线往外偏几厘米（墙面的点落进它面向的房间，楼板底面落进下层），按高度定楼层，
//     在那一层的编号图里取一次样，然后每盏灯比较一下：同层同组 / 墙体 / 洞口相连的才算这盏灯的光。
//     落在墙体格子里的竖直面（墙段端面、门洞侧壁）再往镜头方向走出一个墙厚取一次样，归到看得见它的那一侧。
//     世界坐标由视空间位置和 viewMatrix 反算，不加 varying，顶点着色器不动。
//   - 注入：所有受光照的内置材质（toon / lambert / phong / standard / physical）的原型上挂 onBeforeCompile，
//     把 lights_fragment_begin 换成带遮罩的版本、接上共享的 uniform 对象。所有材质共用同一个函数，
//     程序缓存键和以前一样（不会多编译程序）；自己有 onBeforeCompile 的材质（毛色、布艺花纹、外墙）在里面调用 injectLightMask。
// 单位：厘米。平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { edgesOf, pointInPolygon, type Plan, type Room, type Vec } from '../model'
import { floorOf, planFloors } from '../floors'
import { isOpenBetween, isVoid, sharedIntervals, wallSegments } from '../walls'
import { stairHoles } from '../stairs'

/** uniform 数组长度：灯池上限（POOL_HIGH）、楼层上限 */
export const LM_MAX_LIGHTS = 16
export const LM_MAX_FLOORS = 8
/** 编号图格子边长（cm）；户型很大时放大，单层图不超过 LM_MAX_SIZE 像素 */
export const LM_CELL = 4
const LM_MAX_SIZE = 1024
/** 片元沿法线外推的距离（cm）：要大于半个隔墙厚 + 半格，墙面的点才会落进房间那一格 */
export const LM_PUSH = 5

export const LM_WALL = 0
export const LM_OUTDOOR = 1

export interface LightMaskMap {
  /** 单层图的格数 */
  width: number
  height: number
  floors: number
  /** 图的左上角（平面坐标）与格子边长 */
  x0: number
  y0: number
  cell: number
  /** RGBA，按层从下到上拼接：第 f 层占第 f·height 行起的 height 行 */
  data: Uint8Array
  /** 房间 → (楼层序号, 编号)：阳台是户外（1） */
  rooms: Map<string, { floor: number; group: number }>
  floorIds: string[]
  /** 最厚的墙（cm） */
  wall: number
}

/** 编号图里某层某点的三个通道（测试与调试用；图外 = 户外） */
export function maskAt(m: LightMaskMap, floor: number, p: Vec) {
  const i = Math.floor((p.x - m.x0) / m.cell)
  const j = Math.floor((p.y - m.y0) / m.cell)
  if (i < 0 || j < 0 || i >= m.width || j >= m.height) return { id: LM_OUTDOOR, up: 0, down: 0 }
  const k = ((floor * m.height + j) * m.width + i) * 4
  return { id: m.data[k], up: m.data[k + 1], down: m.data[k + 2] }
}

/** 某盏灯（所在楼层、编号）能不能照到某层某点：和着色器里的 lmPass 一致 */
export function maskPass(m: LightMaskMap, light: { floor: number; group: number }, floor: number, p: Vec) {
  const c = maskAt(m, floor, p)
  if (light.floor === floor && (c.id === LM_WALL || c.id === light.group)) return true
  return light.group > LM_OUTDOOR && (c.up === light.group || c.down === light.group)
}

/** 编号图的指纹：房间 / 墙 / 楼层 / 楼梯变了才重建（家具移动不用） */
export function lightMaskKey(plan: Plan) {
  const rooms = plan.rooms.map((r) => `${r.id}:${r.kind}:${r.floor ?? ''}:${r.openGroup ?? ''}:${r.name}:${r.points.map((p) => `${p.x},${p.y}`).join(';')}`).join('|')
  const stairs = plan.fixtures
    .filter((f) => f.kind === 'stairs')
    .map((f) => `${f.x},${f.y},${f.w},${f.d ?? ''},${f.rot},${f.stairs ?? ''},${f.turn ?? ''},${f.run ?? ''},${f.floor ?? ''}`)
    .join('|')
  const floors = planFloors(plan).map((f) => `${f.id}:${f.elevation}:${f.height}`).join('|')
  return `${plan.wall}/${plan.wallOuter}#${floors}#${rooms}#${stairs}`
}

/** 两个房间是否共用一段边 */
function adjacent(a: Room, b: Room) {
  return edgesOf(a.points).some((e) => sharedIntervals(e, b).length > 0)
}

/** 点到线段的距离 */
function segDist(px: number, py: number, a: Vec, b: Vec) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / L2)) : 0
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t))
}

/**
 * 生成各层的房间编号图（见文件头）。
 * 分组：同层相邻且敞开（walls.ts isOpenBetween：同 openGroup、玄関与廊下 / 厨房…）的房间并成一组；阳台 = 户外；挑空自成一组。
 */
export function buildLightMask(plan: Plan, cellSize = LM_CELL): LightMaskMap | null {
  const fs = planFloors(plan)
  const rooms = plan.rooms.filter((r) => r.points.length >= 3)
  if (!rooms.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rooms)
    for (const p of r.points) {
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
  // 外墙外侧也要盖住（外墙面的点外推后落在墙外一点）
  const pad = plan.wallOuter + 2 * cellSize
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  const cell = Math.max(cellSize, (x1 - x0) / LM_MAX_SIZE, (y1 - y0) / LM_MAX_SIZE)
  const W = Math.max(1, Math.ceil((x1 - x0) / cell))
  const H = Math.max(1, Math.ceil((y1 - y0) / cell))
  const F = Math.min(LM_MAX_FLOORS, fs.length)
  const floorIdx = new Map(fs.map((f, i) => [f.id, i]))

  // ---- 分组 ----
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let p = parent.get(id) ?? id
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p
    parent.set(id, p)
    return p
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const indoorish = (r: Room) => r.kind !== 'balcony' && !isVoid(r)
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]
      const b = rooms[j]
      if (floorOf(plan, a) !== floorOf(plan, b) || !indoorish(a) || !indoorish(b)) continue
      if (isOpenBetween(a, b) && adjacent(a, b)) union(a.id, b.id)
    }
  const groupOf = new Map<string, number>()
  const roomsOut = new Map<string, { floor: number; group: number }>()
  let next = 2
  for (const r of rooms) {
    const floor = floorIdx.get(floorOf(plan, r)) ?? 0
    let g: number
    if (r.kind === 'balcony') g = LM_OUTDOOR
    else {
      const root = find(r.id)
      g = groupOf.get(root) ?? 0
      if (!g) {
        // 编号用完（255 组以上）时回绕：只会多漏一点光
        g = next
        next = next >= 255 ? 2 : next + 1
        groupOf.set(root, g)
      }
    }
    roomsOut.set(r.id, { floor, group: g })
  }

  // ---- 栅格化 ----
  const N = W * H
  const ids: Uint8Array[] = []
  const cx = (i: number) => x0 + (i + 0.5) * cell
  const cy = (j: number) => y0 + (j + 0.5) * cell
  /** 多边形覆盖的格子（格心在多边形内） */
  const fillPoly = (pts: Vec[], fn: (k: number) => void) => {
    let bx0 = Infinity
    let by0 = Infinity
    let bx1 = -Infinity
    let by1 = -Infinity
    for (const p of pts) {
      bx0 = Math.min(bx0, p.x)
      by0 = Math.min(by0, p.y)
      bx1 = Math.max(bx1, p.x)
      by1 = Math.max(by1, p.y)
    }
    const i0 = Math.max(0, Math.floor((bx0 - x0) / cell))
    const i1 = Math.min(W - 1, Math.ceil((bx1 - x0) / cell))
    const j0 = Math.max(0, Math.floor((by0 - y0) / cell))
    const j1 = Math.min(H - 1, Math.ceil((by1 - y0) / cell))
    const p = { x: 0, y: 0 }
    for (let j = j0; j <= j1; j++) {
      p.y = cy(j)
      for (let i = i0; i <= i1; i++) {
        p.x = cx(i)
        if (pointInPolygon(p, pts)) fn(j * W + i)
      }
    }
  }
  for (let f = 0; f < F; f++) {
    const id = new Uint8Array(N).fill(LM_OUTDOOR)
    const fid = fs[f].id
    const on = rooms.filter((r) => floorOf(plan, r) === fid)
    for (const r of on) {
      const g = roomsOut.get(r.id)!.group
      fillPoly(r.points, (k) => (id[k] = g))
    }
    // 墙体（敞开边不砌墙）：墙中心线两侧各半个墙厚，再往里收半格——贴着墙面的格子算房间 / 户外，
    // 墙面外贴着的水平面（外墙饰面的顶面、窗台）不会因为格子取整落进墙体、被室内灯照亮
    for (const s of wallSegments(on)) {
      if (s.kind === 'open') continue
      const t = (s.kind === 'outer' ? plan.wallOuter : plan.wall) / 2 - cell / 2
      const i0 = Math.max(0, Math.floor((Math.min(s.a.x, s.b.x) - t - x0) / cell))
      const i1 = Math.min(W - 1, Math.ceil((Math.max(s.a.x, s.b.x) + t - x0) / cell))
      const j0 = Math.max(0, Math.floor((Math.min(s.a.y, s.b.y) - t - y0) / cell))
      const j1 = Math.min(H - 1, Math.ceil((Math.max(s.a.y, s.b.y) + t - y0) / cell))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segDist(cx(i), cy(j), s.a, s.b) < t) id[j * W + i] = LM_WALL
    }
    ids.push(id)
  }
  const up: Uint8Array[] = ids.map(() => new Uint8Array(N))
  const down: Uint8Array[] = ids.map(() => new Uint8Array(N))
  const linkable = (v: number) => v > LM_OUTDOOR
  for (let f = 1; f < F; f++) {
    const fid = fs[f].id
    const holes = [...stairHoles(plan, fid).map((h) => h.poly), ...rooms.filter((r) => isVoid(r) && floorOf(plan, r) === fid).map((r) => r.points)]
    for (const h of holes)
      fillPoly(h, (k) => {
        if (linkable(ids[f - 1][k])) down[f][k] = ids[f - 1][k]
        if (linkable(ids[f][k])) up[f - 1][k] = ids[f][k]
      })
  }
  const data = new Uint8Array(N * F * 4)
  for (let f = 0; f < F; f++) {
    const o = f * N * 4
    for (let k = 0; k < N; k++) {
      data[o + k * 4] = ids[f][k]
      data[o + k * 4 + 1] = up[f][k]
      data[o + k * 4 + 2] = down[f][k]
      data[o + k * 4 + 3] = 255
    }
  }
  return { width: W, height: H, floors: F, x0, y0, cell, data, rooms: roomsOut, floorIds: fs.slice(0, F).map((f) => f.id), wall: Math.max(plan.wall, plan.wallOuter) }
}

// ---------- 着色器 ----------

const blank = new THREE.DataTexture(new Uint8Array([LM_WALL, 0, 0, 255]), 1, 1, THREE.RGBAFormat)
blank.needsUpdate = true

/** 所有材质共享的 uniform 对象（注入时按引用接上，改 value 全部材质生效） */
export const lightMaskUniforms = {
  lmMap: { value: blank as THREE.Texture },
  /** x0, z0, 1 / 图宽（cm）, 1 / 图深（cm） */
  lmGrid: { value: new THREE.Vector4(0, 0, 1, 1) },
  /** 开关, 层数, 法线外推距离, 墙里的竖直面往镜头方向再取样的距离 */
  lmInfo: { value: new THREE.Vector4(0, 1, LM_PUSH, 30) },
  /** 各层地面的当前世界高度（含分层拉开的偏移） */
  lmFloorY: { value: new Float32Array(LM_MAX_FLOORS) },
  /** 每盏点光源：楼层序号, 编号, 不受遮罩(1), - */
  lmLight: { value: new Float32Array(LM_MAX_LIGHTS * 4) },
}

const PARS = /* glsl */ `
uniform sampler2D lmMap;
uniform vec4 lmGrid;
uniform vec4 lmInfo;
uniform float lmFloorY[ ${LM_MAX_FLOORS} ];
uniform vec4 lmLight[ ${LM_MAX_LIGHTS} ];
// 第 f 层编号图在 xz 处的 (编号, 上层洞口编号, 下层洞口编号)；图外 = 户外
vec3 lmFetch( vec2 xz, float f ) {
	vec2 uv = ( xz - lmGrid.xy ) * lmGrid.zw;
	if ( uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) return vec3( ${LM_OUTDOOR}.0, 0.0, 0.0 );
	return floor( texture2D( lmMap, vec2( uv.x, ( uv.y + f ) / lmInfo.y ) ).rgb * 255.0 + 0.5 );
}
// L：灯（楼层, 编号, 不受遮罩）；c：片元所在格子（楼层, 编号, 上层洞口编号, 下层洞口编号），c.x < 0 = 遮罩关闭
float lmPass( vec4 L, vec4 c ) {
	if ( c.x < -0.5 || L.z > 0.5 ) return 1.0;
	if ( abs( L.x - c.x ) < 0.5 && ( c.y < 0.5 || abs( L.y - c.y ) < 0.5 ) ) return 1.0;
	if ( L.y > 1.5 && ( abs( L.y - c.z ) < 0.5 || abs( L.y - c.w ) < 0.5 ) ) return 1.0;
	return 0.0;
}
`

const LOOKUP = /* glsl */ `
vec4 lmCell = vec4( -1.0 );
if ( lmInfo.x > 0.5 ) {
	// 视空间 → 世界：viewMatrix 是刚体变换，逆 = 转置旋转
	vec3 lmW = ( vec4( geometryPosition - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
	vec3 lmN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
	vec3 lmP = lmW + lmN * lmInfo.z;
	float lmF = 0.0;
	for ( int k = 1; k < ${LM_MAX_FLOORS}; k ++ ) {
		if ( float( k ) < lmInfo.y && lmP.y >= lmFloorY[ k ] - 2.0 ) lmF = float( k );
	}
	lmCell = vec4( lmF, lmFetch( lmP.xz, lmF ) );
	// 墙体里的竖直面（墙段端面、门洞侧壁、厚外墙里的门扇）：往镜头那边再走出一个墙厚取样，
	// 归到看得见它的那一侧（外墙外侧的接缝不会被室内灯照亮）；仍在墙里（或是墙顶这类水平面）就按墙体放行
	if ( lmCell.y < 0.5 && abs( lmN.y ) < 0.7 ) {
		vec2 lmV = cameraPosition.xz - lmW.xz;
		float lmL = length( lmV );
		if ( lmL > 1e-3 ) {
			vec3 lmC2 = lmFetch( lmW.xz + lmV / lmL * lmInfo.w, lmF );
			if ( lmC2.x > 0.5 ) lmCell.yzw = lmC2;
		}
	}
}
`

const POINT = 'getPointLightInfo( pointLight, geometryPosition, directLight );'
const ANCHOR = 'IncidentLight directLight;'
let patched: string | null = null
let warned = false

/** 带遮罩的 lights_fragment_begin（取用时再拼：toon.ts 对这个块的全局补丁已经生效） */
function maskedLightsChunk() {
  if (patched !== null) return patched
  const src = (THREE.ShaderChunk as unknown as Record<string, string>).lights_fragment_begin
  if (!src.includes(POINT) || !src.includes(ANCHOR)) {
    patched = ''
    return patched
  }
  patched = src.replace(ANCHOR, `${LOOKUP}\n${ANCHOR}`).replace(POINT, `${POINT}\n\t\tdirectLight.color *= lmPass( lmLight[ i ], lmCell );`)
  return patched
}

/** 给受光照材质的着色器接上遮罩（onBeforeCompile 里调用） */
export function injectLightMask(sh: THREE.WebGLProgramParametersWithUniforms) {
  const chunk = maskedLightsChunk()
  if (!chunk || !sh.fragmentShader.includes('#include <lights_fragment_begin>')) {
    if (!chunk && !warned) {
      warned = true
      console.warn('[lightMask] three 的 lights_fragment_begin 变了，室内灯遮罩没有生效')
    }
    return
  }
  Object.assign(sh.uniforms, lightMaskUniforms)
  sh.fragmentShader = PARS + sh.fragmentShader.replace('#include <lights_fragment_begin>', chunk)
}

// 内置的受光照材质默认都接上（自己设了 onBeforeCompile 的材质在里面调 injectLightMask）
for (const C of [THREE.MeshToonMaterial, THREE.MeshLambertMaterial, THREE.MeshPhongMaterial, THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial]) {
  ;(C.prototype as THREE.Material).onBeforeCompile = injectLightMask
}

// ---------- 运行时状态 ----------

let mapTex: THREE.DataTexture | null = null

/** 户型变了：换上新的编号图（null = 关掉遮罩） */
export function setLightMaskMap(m: LightMaskMap | null) {
  const U = lightMaskUniforms
  if (mapTex) mapTex.dispose()
  mapTex = null
  if (!m) {
    U.lmMap.value = blank
    U.lmInfo.value.y = 1
    return
  }
  const t = new THREE.DataTexture(m.data, m.width, m.height * m.floors, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  mapTex = t
  U.lmMap.value = t
  U.lmGrid.value.set(m.x0, m.y0, 1 / (m.width * m.cell), 1 / (m.height * m.cell))
  U.lmInfo.value.y = m.floors
  U.lmInfo.value.w = m.wall + m.cell * 2
}

/** 各层地面的当前世界高度（楼层动画每帧更新；隐藏的层给一个很高的值） */
export function setLightMaskFloors(ys: number[]) {
  const a = lightMaskUniforms.lmFloorY.value
  for (let i = 0; i < LM_MAX_FLOORS; i++) a[i] = i < ys.length ? ys[i] : 1e7
}

/** 灯池第 i 盏灯所在的楼层与编号；free = 不受遮罩（不知道在哪个房间） */
export function setLightMaskLight(i: number, floor: number, group: number, free: boolean) {
  if (i >= LM_MAX_LIGHTS) return
  const a = lightMaskUniforms.lmLight.value
  a[i * 4] = floor
  a[i * 4 + 1] = group
  a[i * 4 + 2] = free ? 1 : 0
}

/** 遮罩开关：有编号图、并且有灯亮着时才开（白天不用多取一次样） */
export function setLightMaskEnabled(on: boolean) {
  lightMaskUniforms.lmInfo.value.x = on && mapTex ? 1 : 0
}
