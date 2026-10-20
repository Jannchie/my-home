// 床品的几何体：被子、枕头。以前是圆角方块，写实光照下像一块硬板子；这里按布的样子做形状：
//   - 被子：顶面平铺在床垫上，微微蓬起、有一两道宽缓的斜褶；越过床垫边缘后圆滚滚地翻下去（半径 = 被子厚度），
//     两侧和床尾垂下一截。垂下的部分有不规则的竖向波浪褶，越往下摆越大，下摆也高低起伏；
//   - 枕头：鼓起来的超椭球，四边捏薄、中间鼓（像真枕头缝线那一圈是扁的）。
// 都是确定性的（同样的参数同样的形状），几何体按参数缓存。单位厘米，y 向上。

import * as THREE from 'three'
import { toon } from './toon'

/** 一维的「平铺 → 圆角翻下 → 垂下」：沿展开长度 a（从中线量起）算出横向位置和往下落的量 */
function unroll(a: number, half: number, r: number) {
  const s = Math.sign(a) || 1
  const k = Math.abs(a)
  if (k <= half) return { lat: a, down: 0, hang: 0 }
  const arc = (Math.PI / 2) * r
  if (k <= half + arc) {
    const t = (k - half) / r
    return { lat: s * (half + r * Math.sin(t)), down: r * (1 - Math.cos(t)), hang: 0 }
  }
  const hang = k - half - arc
  return { lat: s * (half + r), down: r + hang, hang }
}

/** 平滑的一维噪声（确定性）：几个不同频率的正弦叠起来 */
function wave(x: number, seed: number) {
  return Math.sin(x * 0.21 + seed) * 0.55 + Math.sin(x * 0.47 + seed * 2.3) * 0.3 + Math.sin(x * 0.93 + seed * 4.1) * 0.15
}

const geoCache = new Map<string, THREE.BufferGeometry>()

export interface DuvetOpts {
  /** 被子的外宽（含两侧翻下去的圆边，x 方向，以 x = 0 为中线）：垂褶基本往里收，不比这个宽出多少 */
  w: number
  /** 被子从床头那端到床尾外沿的长（z 方向，从 z1 - len 到 z1，含床尾的圆边） */
  len: number
  /** 被子顶面高度 */
  top: number
  /** 床尾外沿的 z */
  z1: number
  /** 两侧、床尾垂下多长 */
  drop: number
  /** 被子厚度（翻边的半径） */
  thick?: number
  seed?: number
}

/** 被子（床头那一端是平的直边，翻折的被头另外做） */
export function duvetGeometry(o: DuvetOpts) {
  const r = o.thick ?? 4
  const seed = o.seed ?? 1
  const key = `duvet|${[o.w, o.len, o.top, o.z1, o.drop, r, seed].map((v) => v.toFixed(1)).join(',')}`
  let geo = geoCache.get(key)
  if (geo) return geo
  // 平铺部分：外轮廓减去翻边的半径
  const half = o.w / 2 - r
  const flat = o.len - r
  const arc = (Math.PI / 2) * r
  const spanX = half + arc + o.drop
  const spanZ = flat + arc + o.drop
  const STEP = 2.5
  const nx = Math.max(8, Math.ceil((spanX * 2) / STEP))
  const nz = Math.max(8, Math.ceil(spanZ / STEP))
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
  const z0 = o.z1 - o.len
  // 两道宽缓的斜褶（被子被拉扯出来的）：方向、位置按 seed 定
  const ridges = [0, 1].map((i) => {
    const ang = 0.5 + seed * 1.7 + i * 2.1
    return { cx: Math.sin(seed * 3.1 + i * 5) * half * 0.5, cz: z0 + flat * (0.35 + 0.35 * i), dx: Math.cos(ang), dz: Math.sin(ang), h: 1.1 - i * 0.3 }
  })
  for (let j = 0; j <= nz; j++) {
    const b = (j / nz) * spanZ
    for (let i = 0; i <= nx; i++) {
      const a = (i / nx) * spanX * 2 - spanX
      // 下摆长短不齐：两侧按 z、床尾按 x 起伏
      const ux = unroll(a, half, r)
      const uz = b <= flat ? { lat: b, down: 0, hang: 0 } : unroll(b - flat + half, half, r)
      const zLat = b <= flat ? b : flat + (uz.lat - half)
      let x = ux.lat
      let z = z0 + zLat
      let y = o.top - Math.max(ux.down, uz.down)
      // 垂下的部分：竖向波浪褶，越往下越大（往外鼓、往里收交替），下摆起伏
      const hx = ux.hang
      const hz = uz.hang
      // 褶子又宽又缓（15～65cm 一个），不是一圈荷叶边；以往里收为主（往外最多鼓一厘米多，不比外轮廓宽出多少）
      if (hx > 0) {
        const amp = Math.min(3, 0.3 + hx * 0.22)
        x += Math.sign(a) * amp * (wave(z * 0.42, seed + Math.sign(a)) - 0.5) * 0.9
        y += hx * 0.05 * wave(z * 0.3, seed + 7)
      }
      if (hz > 0) {
        const amp = Math.min(3, 0.3 + hz * 0.22)
        z += amp * (wave(x * 0.42, seed + 3) - 0.5) * 0.9
        y += hz * 0.05 * wave(x * 0.3, seed + 9)
      }
      // 顶面：中间微微蓬起、两道宽缓的斜褶、很浅的起伏
      if (ux.down === 0 && uz.down === 0) {
        const ex = Math.abs(x) / half
        y += 0.9 * (1 - ex ** 4)
        for (const rd of ridges) {
          const qx = x - rd.cx
          const qz = z - rd.cz
          const across = qx * -rd.dz + qz * rd.dx
          const along = qx * rd.dx + qz * rd.dz
          y += rd.h * Math.exp(-(across * across) / 18) * Math.exp(-(along * along) / (o.len * o.len * 0.08))
        }
        y += 0.35 * wave(x * 0.5 + z * 0.3, seed + 11)
      } else if (uz.down === 0 && ux.hang === 0) {
        // 圆边上：顶面的蓬起接过来，免得接缝处有台阶
        y += 0.9 * (1 - Math.min(1, Math.abs(x) / half) ** 4)
      }
      const k = (j * (nx + 1) + i) * 3
      pos[k] = x
      pos[k + 1] = y
      pos[k + 2] = z
    }
  }
  const index: number[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      const b = a + 1
      const c = a + nx + 1
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  geoCache.set(key, geo)
  return geo
}

/** 被子网格 */
export function duvet(o: DuvetOpts & { color: string }) {
  const m = new THREE.Mesh(duvetGeometry(o), toon(o.color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 枕头的几何体：w × h × d 的鼓包，中心在原点；pinch 越大四边越扁 */
export function pillowGeometry(w: number, h: number, d: number, pinch = 0.7) {
  const key = `pillow|${w.toFixed(1)},${h.toFixed(1)},${d.toFixed(1)},${pinch}`
  let geo = geoCache.get(key)
  if (geo) return geo
  geo = new THREE.SphereGeometry(1, 40, 24)
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    // 超椭球：方方的轮廓、圆圆的角
    const sx = Math.sign(x) * Math.abs(x) ** 0.35
    const sz = Math.sign(z) * Math.abs(z) ** 0.35
    // 越靠四边越扁（边上那一圈缝线是平的）
    const edge = Math.max(Math.abs(sx), Math.abs(sz)) ** 6
    const sy = y * (1 - pinch * edge)
    p.setXYZ(i, (sx * w) / 2, (sy * h) / 2, (sz * d) / 2)
  }
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  geoCache.set(key, geo)
  return geo
}

/** 枕头网格：底面在 y，中心在 (x, z)；rx 往后仰 */
export function pillowMesh(w: number, h: number, d: number, color: string, at: { x?: number; y: number; z?: number; rx?: number }, pinch = 0.7) {
  const m = new THREE.Mesh(pillowGeometry(w, h, d, pinch), toon(color))
  m.position.set(at.x ?? 0, at.y + h / 2, at.z ?? 0)
  m.rotation.x = at.rx ?? 0
  m.castShadow = true
  m.receiveShadow = true
  return m
}
