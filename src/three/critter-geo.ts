// 宠物建模用的几何小工具：平滑连续的程序化形体（放样、变形球）、毛色遮罩材质、值噪声。
// 被 critters.ts 用来搭猫、狗、兔子。
//
// 毛色不用叠贴片：每个顶点存一个 mask（vec3：副色 / 花纹 A / 花纹 B 的「场值」，0.5 为分界），
// 片元里按 0.5 阈值（带 fwidth 抗锯齿）在主色上依次盖花纹 A、花纹 B、副色。
// 场值是连续函数在顶点上的采样，插值后取等值线，所以花纹边缘是干净的曲线，不随网格跳成锯齿。

import * as THREE from 'three'
import { toon } from './toon'
import { injectLightMask } from './lightMask'

const TAU = Math.PI * 2

// ---------- 网格生成 ----------

/**
 * 通用「环带」网格：nRings 圈、每圈 seg 个点（首尾圈可以是单点的极点），顶点不重复，computeVertexNormals 后处处平滑。
 * pos(i, j, out) 写入第 i 圈第 j 个点（极点圈只会用 j = 0）。
 * 方向约定：环向 j 逆时针（从 +x 转向 +y）、圈序 i 沿 +z 时法线朝外。
 */
function grid(nRings: number, seg: number, poleStart: boolean, poleEnd: boolean, pos: (i: number, j: number, out: THREE.Vector3) => void) {
  const verts: number[] = []
  const ringStart: number[] = []
  const v = new THREE.Vector3()
  for (let i = 0; i < nRings; i++) {
    ringStart.push(verts.length / 3)
    const pole = (i === 0 && poleStart) || (i === nRings - 1 && poleEnd)
    const n = pole ? 1 : seg
    for (let j = 0; j < n; j++) {
      pos(i, j, v)
      verts.push(v.x, v.y, v.z)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < nRings - 1; i++) {
    const a0 = ringStart[i]
    const b0 = ringStart[i + 1]
    const aPole = i === 0 && poleStart
    const bPole = i + 1 === nRings - 1 && poleEnd
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg
      if (aPole) idx.push(a0, b0 + j1, b0 + j)
      else if (bPole) idx.push(a0 + j, a0 + j1, b0)
      else {
        idx.push(a0 + j, a0 + j1, b0 + j)
        idx.push(a0 + j1, b0 + j1, b0 + j)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** 放样的一圈：圆心 (x, y, z)，xy 平面里的椭圆半径 rx / ry；shape 可以改截面形状（参数是角度，返回单位截面上的点） */
export interface Ring {
  x?: number
  y?: number
  z: number
  rx: number
  ry: number
}

/**
 * 沿 z 轴放样：ring(t) 给出 t ∈ [0, 1] 处的截面（首尾 rx = ry = 0 时收成极点，形成圆头）。
 * t 按余弦分布采样，两端更密，圆头不会有棱角。shape 可选：自定义截面（返回单位截面上的 [x, y]）。
 */
export function loft(n: number, seg: number, ring: (t: number) => Ring, shape?: (a: number, t: number) => [number, number]) {
  const ts = Array.from({ length: n }, (_, i) => (1 - Math.cos((Math.PI * i) / (n - 1))) / 2)
  const rings = ts.map(ring)
  const poleS = rings[0].rx < 1e-4 && rings[0].ry < 1e-4
  const poleE = rings[n - 1].rx < 1e-4 && rings[n - 1].ry < 1e-4
  return grid(n, seg, poleS, poleE, (i, j, out) => {
    const r = rings[i]
    const a = (j / seg) * TAU
    const [cx, cy] = shape ? shape(a, ts[i]) : [Math.cos(a), Math.sin(a)]
    out.set((r.x ?? 0) + cx * r.rx, (r.y ?? 0) + cy * r.ry, r.z)
  })
}

/**
 * 变形球：fn(dir) 把单位方向映射到表面点（极点在 ±y）。用来做头、爪子、绒球。
 */
export function surf(w: number, h: number, fn: (d: THREE.Vector3, out: THREE.Vector3) => void) {
  const d = new THREE.Vector3()
  return grid(h + 1, w, true, true, (i, j, out) => {
    // 先在极点为 ±z 的球上取点，再转成极点在 ±y（绕 x 转 -90°：z → y，y → -z），保持绕序
    const phi = Math.PI - (Math.PI * i) / h
    const a = (j / w) * TAU
    const x = Math.sin(phi) * Math.cos(a)
    const y = Math.sin(phi) * Math.sin(a)
    const z = Math.cos(phi)
    d.set(x, z, -y)
    fn(d, out)
  })
}

/** 椭球（可选每个方向的半径修饰） */
export function ellipsoid(rx: number, ry: number, rz: number, w = 16, h = 10) {
  return surf(w, h, (d, o) => o.set(d.x * rx, d.y * ry, d.z * rz))
}

/**
 * 两端圆头、半径从 r0 渐变到 r1 的一节（像锥形胶囊），从原点沿 -y 长 len。
 * 两端的半球中心分别在 y = 0 和 y = -len，所以串成链时关节处是同半径的球，怎么转都不断开。
 * bulge：中段额外鼓起（大腿、蓬松尾巴）；bulgeAt：鼓起位置（0..1）。
 */
export function taper(r0: number, r1: number, len: number, seg = 10, opts: { bulge?: number; bulgeAt?: number; flatZ?: number; rings?: number } = {}) {
  const { bulge = 0, bulgeAt = 0.4, flatZ = 1 } = opts
  const total = r0 + len + r1
  const n = opts.rings ?? 12
  // 沿轴向的参数 u ∈ [0, total]：起点半球、中段、终点半球
  const g = loft(n, seg, (t) => {
    const u = t * total
    let z: number
    let r: number
    if (u < r0) {
      const k = 1 - u / r0
      z = r0 * k
      r = r0 * Math.sqrt(Math.max(0, 1 - k * k))
    } else if (u > r0 + len) {
      const k = (u - r0 - len) / r1
      z = -len - r1 * k
      r = r1 * Math.sqrt(Math.max(0, 1 - k * k))
    } else {
      const k = (u - r0) / Math.max(1e-6, len)
      z = -len * k
      r = r0 + (r1 - r0) * k + bulge * Math.sin(Math.PI * Math.min(1, k / (bulgeAt * 2))) * (k < bulgeAt * 2 ? 1 : 0)
    }
    // 轴向（z）先按 0 → -len 算，最后转到 -y
    return { z: -z, rx: r, ry: r * flatZ }
  })
  // 放样沿 +z（z 坐标是 -z_axis），转成沿 -y：(x, y, z) → (x, -z, y)，绕 x 转 +90°
  g.rotateX(Math.PI / 2)
  return g
}

// ---------- 毛色遮罩材质 ----------

const furCache = new Map<string, THREE.MeshToonMaterial>()

/**
 * 毛色材质：主色 + 顶点 mask 选出的副色 / 花纹 A / 花纹 B。
 * material.color 是主色（描边颜色、悬停提亮都按它）；userData.fur 记着四种颜色（离线渲染、调试用）。
 */
export function furMaterial(main: string, sub: string, a: string, b: string) {
  const key = [main, sub, a, b].map((c) => new THREE.Color(c).getHexString()).join('|')
  let m = furCache.get(key)
  if (m) return m
  const base = toon('#ffffff') as THREE.MeshToonMaterial
  m = new THREE.MeshToonMaterial({ color: main, gradientMap: base.gradientMap })
  const cs = { sub: new THREE.Color(sub), a: new THREE.Color(a), b: new THREE.Color(b) }
  m.userData.fur = [main, sub, a, b]
  m.onBeforeCompile = (sh) => {
    injectLightMask(sh)
    sh.uniforms.uFurSub = { value: cs.sub }
    sh.uniforms.uFurA = { value: cs.a }
    sh.uniforms.uFurB = { value: cs.b }
    sh.vertexShader = 'attribute vec3 mask;\nvarying vec3 vFurMask;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFurMask = mask;')
    sh.fragmentShader =
      'uniform vec3 uFurSub;\nuniform vec3 uFurA;\nuniform vec3 uFurB;\nvarying vec3 vFurMask;\n' +
      'float furStep(float v) { float w = max(fwidth(v) * 0.75, 1e-4); return smoothstep(0.5 - w, 0.5 + w, v); }\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  vec3 furC = diffuseColor.rgb;
  furC = mix(furC, uFurA, furStep(vFurMask.y));
  furC = mix(furC, uFurB, furStep(vFurMask.z));
  furC = mix(furC, uFurSub, furStep(vFurMask.x));
  diffuseColor.rgb = furC;`,
      )
  }
  m.customProgramCacheKey = () => 'critter-fur'
  furCache.set(key, m)
  return m
}

/** 给几何体挂一个全 0 的 mask 属性（之后由上色函数填） */
export function withMask(g: THREE.BufferGeometry) {
  if (!g.attributes.mask) g.setAttribute('mask', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3))
  return g
}

// ---------- 噪声 ----------

function hash3(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/** 三维值噪声，输出 0..1，平滑（五次插值） */
export function noise3(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const u = f(x - xi)
  const v = f(y - yi)
  const w = f(z - zi)
  const L = (a: number, b: number, t: number) => a + (b - a) * t
  const h = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed)
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w)
}

/** 两层分形噪声，0..1 */
export function fbm(x: number, y: number, z: number, seed = 0) {
  return noise3(x, y, z, seed) * 0.68 + noise3(x * 2.03 + 7.1, y * 2.03 - 3.3, z * 2.03 + 1.7, seed + 1) * 0.32
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const bump = (s: number, c: number, w: number) => Math.exp(-(((s - c) / w) ** 2))
