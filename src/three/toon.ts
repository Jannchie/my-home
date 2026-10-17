// 卡通渲染基础件：三阶色阶的 toon 材质 + 反向外壳描边 + 常用圆角体素。
// 单位：厘米。y 轴向上，平面图的 y 对应 3D 的 z。

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
// 室内灯的楼层 / 房间遮罩：给所有受光照材质挂上 onBeforeCompile（副作用导入，要在任何材质编译前生效）
import './lightMask'

// ---------- 赛璐璐阴影 ----------
// three 自带的 PCF 阴影用逐像素噪点（IGN）旋转采样，边缘是一片网点状的颗粒渐变。
// 改成：固定采样分布（不再有颗粒）+ 把阴影收成「亮 / 暗」两档，边缘保留一段柔和但干净的过渡，像动画里的阴影块。
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
				shadow = smoothstep( 0.12, 0.88, shadow / 13.0 );`,
      )
  }
}

// 光线贴着表面掠过（月光、低角度的夕阳照在和光线几乎平行的墙上）时，阴影贴图的一个像素被拉成长条，
// 阴影边缘会变成一排排斜向的网点。这类表面在 toon 着色里本来就落在暗部：按 N·L 把阴影淡掉，走样就看不到了。
{
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>
  const DIR = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;'
  if (chunk.lights_fragment_begin.includes(DIR)) {
    chunk.lights_fragment_begin = chunk.lights_fragment_begin.replace(
      DIR,
      DIR.replace(
        'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )',
        'mix( 1.0, getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ), smoothstep( 0.04, 0.28, dot( geometryNormal, directLight.direction ) ) )',
      ),
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
  const data = new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255])
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true
  return gradient
}

const toonCache = new Map<string, THREE.MeshToonMaterial>()
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
    toonCache.set(key, m)
  }
  return m
}

/** 描边：沿法线在屏幕空间外扩，线宽不随距离变化；颜色取填充色的深色版本，更像手绘 */
const outlineCache = new Map<string, THREE.ShaderMaterial>()
export const outlineUniforms = { uWidth: { value: 1.6 }, uViewport: { value: new THREE.Vector2(800, 600) } }
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
        void main() { gl_FragColor = vec4(uColor, 1.0); }`,
      side: THREE.BackSide,
    })
    outlineCache.set(key, m)
  }
  return m
}

export function outlineColor(fill: THREE.Color) {
  const hsl = { h: 0, s: 0, l: 0 }
  fill.getHSL(hsl)
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.8 + 0.1), Math.max(0.12, hsl.l * 0.32))
}

/** 给 root 下所有网格加描边（userData.noOutline 的跳过） */
export function addOutlines(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.noOutline && !o.userData.isOutline) meshes.push(o as THREE.Mesh)
  })
  for (const m of meshes) {
    const mat = m.material as THREE.MeshToonMaterial
    if (mat.transparent) continue
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

const r1 = (n: number) => Math.round(n * 10) / 10

/** 圆角盒，at.y 是底面高度（不是中心），摆东西更顺手 */
export function rbox(w: number, h: number, d: number, color: THREE.ColorRepresentation, at: At = {}, radius?: number) {
  const r = Math.min(radius ?? Math.min(w, h, d) * 0.18, Math.min(w, h, d) / 2 - 0.01)
  const g = cached(`rb${r1(w)},${r1(h)},${r1(d)},${r1(r)}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.max(0.01, r)))
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + h / 2 })
}

/** 圆柱 / 圆台，at.y 为底面 */
export function cyl(rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation, at: At = {}, seg = 24) {
  const g = cached(`cy${r1(rTop)},${r1(rBottom)},${r1(h)},${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg))
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + h / 2 })
}

/** 圆角圆柱（坐垫、饼状物）：胶囊压扁 */
export function puck(r: number, h: number, color: THREE.ColorRepresentation, at: At = {}) {
  const g = cached(`pk${r1(r)},${r1(h)}`, () => {
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
  const g = cached(`cu${r1(rTop)},${r1(rBottom)},${r1(h)},${r1(t)}`, () => {
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
  const g = cached(`sp${r1(r)}`, () => new THREE.SphereGeometry(r, 24, 16))
  const m = place(new THREE.Mesh(g, toon(color)), at)
  if (scale) m.scale.set(...scale)
  return m
}

/** 胶囊，竖直；at.y 为底 */
export function capsule(r: number, len: number, color: THREE.ColorRepresentation, at: At = {}) {
  const g = cached(`cp${r1(r)},${r1(len)}`, () => new THREE.CapsuleGeometry(r, len, 6, 16))
  return place(new THREE.Mesh(g, toon(color)), { ...at, y: (at.y ?? 0) + len / 2 + r })
}

export function torus(r: number, tube: number, color: THREE.ColorRepresentation, at: At = {}, arc = Math.PI * 2) {
  const g = cached(`to${r1(r)},${r1(tube)},${r1(arc)}`, () => new THREE.TorusGeometry(r, tube, 10, 32, arc))
  return place(new THREE.Mesh(g, toon(color)), at)
}

/** 平面贴片（不描边），用于地板花纹、画、屏幕等 */
export function plate(w: number, d: number, color: THREE.ColorRepresentation, at: At = {}, emissive = 0) {
  const g = cached(`pl${r1(w)},${r1(d)}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2))
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
export function shade(color: string, dl: number, ds = 0) {
  const c = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return '#' + new THREE.Color().setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + ds)), Math.max(0, Math.min(1, hsl.l + dl))).getHexString()
}

// ---------- 合并静态网格（减少 draw call） ----------

// mask：宠物毛色材质的花纹场（见 critter-geo.ts 的 furMaterial）
const MERGE_ATTRS = new Set(['position', 'normal', 'uv', 'mask'])

/** 能不能并进同材质的大网格：普通不透明网格、没有子节点、没有业务标记、几何体只有常规属性 */
function mergeable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (m.children.length || !m.visible || m.renderOrder !== 0 || Array.isArray(m.material)) return false
  if (m.material.transparent || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false
  for (const k in m.userData) if (k !== 'noOutline') return false
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
    if (o !== root && Object.keys(o.userData).some((k) => k !== 'noOutline')) {
      // 柜门 / 抽屉（kit.ts movable）：子树作为整体开合，内部零件在子树自己的局部坐标里照样按材质合并
      if (o.userData.door) mergeMeshes(o)
      return // 有业务标记的子树整体保留
    }
    for (const c of o.children) walk(c)
    if (o !== root && mergeable(o)) {
      const m = o as THREE.Mesh
      const key = `${(m.material as THREE.Material).uuid}|${+m.castShadow}|${+m.receiveShadow}|${+!!m.userData.noOutline}`
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
    for (const m of list) m.removeFromParent()
    root.add(merged)
  }
}

/**
 * 丢弃一棵场景树（移除家具、重建房子时）：释放共享缓存以外的几何体（合并出来的、墙体等每次新建的、
 * 绿植弯曲用的克隆）和淡出用的克隆材质，否则会一直占着显存。
 * 万一某个几何体其实还在别处用，three 下次渲染时会重新上传，不会出错。
 */
export function disposeUnshared(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose()
    const orig = o.userData.origGeo as THREE.BufferGeometry | undefined
    if (orig && !orig.userData.shared) orig.dispose()
    const parts = o.userData.parts as { parts: { ghost: THREE.Material[] }[] } | undefined
    if (parts) for (const p of parts.parts) for (const g of p.ghost) g.dispose()
  })
}
