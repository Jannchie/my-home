// 屋面材料的 3D 搭建：瓦面（贴图 + 截面起伏）、瓦头、屋脊 / 斜脊的脊瓦、和瓦山墙端的鬼瓦。
// 几何（UV、截面、瓦头）在 ../roofCover.ts（纯函数）；这里画贴图、包成网格。
//
// 贴图：每种材料 × 颜色一张 512² 的 CanvasTexture（缓存，带 mipmap、各向异性），颜色直接画进去（同外墙 facadeTexture）。
// 卡通渲染里细小的法线起伏读不出来，所以瓦行的搭接（瓦尾的亮边 + 下面一行的阴影）、瓦片之间的深浅都画成色带。
// 材质和素面屋顶一样不吃室内灯（遮罩取一个不存在的房间编号，见 three/exterior.ts roofMaterial）。

import * as THREE from 'three'
import type { RoofCover } from '../model'
import { COVER_SPECS, coverHeight, coverSheet, type CoverSheet } from '../roofCover'
import type { Crease } from '../roof'
import { injectLightMask } from './lightMask'
import { shade, toon, useAnisotropy } from './toon'

const S = 512

/** 确定性的伪随机（0..1） */
function rnd(i: number, j: number, k = 0) {
  // murmur3 的 fmix32 混两轮（简单的乘法哈希按 i 递增会排成斜线 / 横线，铺满屋面后很显眼）
  const fmix = (h: number) => {
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    return (h ^ (h >>> 16)) >>> 0
  }
  return fmix(fmix(i * 0x9e3779b1 + 0x7f4a7c15) ^ fmix(j + 0x632be5ab) ^ fmix(k * 0x27d4eb2f + 0x165667b1)) / 4294967296
}

type G = CanvasRenderingContext2D

/** 画布按实际尺寸（cm）画：x 沿檐口，y 往下是下坡方向（画布顶 = 贴图 v = 1 = 上坡） */
function cmCtx(g: G, w: number, h: number) {
  const sx = S / w
  const sy = S / h
  return {
    rect(x: number, y: number, rw: number, rh: number, c: string) {
      g.fillStyle = c
      // 跨过右 / 下边的部分绕回去画，贴图无缝
      for (const ox of [0, -w, w])
        for (const oy of [0, -h, h]) {
          const X = (x + ox) * sx
          const Y = (y + oy) * sy
          if (X > S || Y > S || X + rw * sx < 0 || Y + rh * sy < 0) continue
          g.fillRect(X, Y, rw * sx, rh * sy)
        }
    },
    /** 竖直方向的渐变带（y0 → y0 + rh，颜色 c0 → c1） */
    vgrad(x: number, y: number, rw: number, rh: number, c0: string, c1: string) {
      for (const oy of [0, -h, h]) {
        const gr = g.createLinearGradient(0, (y + oy) * sy, 0, (y + oy + rh) * sy)
        gr.addColorStop(0, c0)
        gr.addColorStop(1, c1)
        g.fillStyle = gr
        for (const ox of [0, -w, w]) g.fillRect((x + ox) * sx, (y + oy) * sy, rw * sx, rh * sy)
      }
    },
  }
}

/** 半透明的同色 */
function alpha(c: string, a: number) {
  const k = new THREE.Color(c)
  return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`
}

/** 瓦行的搭接：行的下沿一道亮边（瓦尾的厚度），下面一行顶上一道阴影 */
function courseEdges(d: ReturnType<typeof cmCtx>, W: number, rows: number, ch: number, c: string, edge = 1.6, shadow = 3.5, dark = 0.2) {
  for (let i = 0; i < rows; i++) {
    const y = (i + 1) * ch
    d.rect(0, y - edge, W, edge, shade(c, 0.07))
    d.rect(0, y, W, 0.9, shade(c, -dark))
    d.vgrad(0, y + 0.9, W, shadow, alpha(shade(c, -dark * 0.7), 1), alpha(c, 0))
  }
}

/** 细小的颗粒（沥青瓦的砂粒、碎石、卷材的斑驳） */
function speckle(g: G, n: number, size: number, colors: string[], seed: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length]
    g.fillRect(rnd(i, seed, 1) * S, rnd(i, seed, 2) * S, size, size)
  }
}

function drawCover(g: G, cover: RoofCover, color: string) {
  const { texW: W, texH: H } = COVER_SPECS[cover]
  const d = cmCtx(g, W, H)
  const base = cover === 'membrane' ? shade(color, 0.25) : color
  g.fillStyle = base
  g.fillRect(0, 0, S, S)
  switch (cover) {
    case 'kawara':
    case 'spanish': {
      const pw = COVER_SPECS[cover].profile!.period
      const cols = Math.round(W / pw)
      const ch = cover === 'kawara' ? 23.5 : 30
      const rows = Math.round(H / ch)
      const vary = cover === 'kawara' ? 0.035 : 0.075
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          const k = rnd(i, j, cover === 'kawara' ? 3 : 4)
          const c = shade(color, (k - 0.5) * 2 * vary, cover === 'spanish' ? (rnd(i, j, 5) - 0.5) * 0.12 : 0)
          d.rect(j * pw, i * ch, pw, ch, c)
          // 槽里压暗一点、圆筒顶上提亮一点（光照方向无关的环境光遮蔽）
          d.rect(j * pw + pw * 0.3, i * ch, pw * 0.3, ch, alpha(shade(c, -0.12), 0.35))
          d.rect(j * pw - pw * 0.04, i * ch, pw * 0.08, ch, alpha(shade(c, 0.12), 0.5))
          if (cover === 'spanish' && rnd(i, j, 6) < 0.35) d.rect(j * pw + pw * rnd(i, j, 7) * 0.6, i * ch + ch * 0.2, pw * 0.3, ch * 0.5, alpha(shade(c, -0.1, 0.05), 0.35))
        }
      courseEdges(d, W, rows, ch, color, cover === 'kawara' ? 1.6 : 2.2, cover === 'kawara' ? 3.5 : 5, cover === 'kawara' ? 0.2 : 0.24)
      break
    }
    case 'cement': {
      const tw = 30
      const ch = 28
      const rows = Math.round(H / ch)
      const cols = Math.round(W / tw)
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          const c = shade(color, (rnd(i, j, 8) - 0.5) * 0.06)
          d.rect(j * tw, i * ch, tw, ch, c)
          // 右边的咬合筋：一道暗缝 + 一道亮棱
          d.rect(j * tw + tw - 1.6, i * ch, 0.8, ch, shade(c, -0.18))
          d.rect(j * tw + tw - 0.8, i * ch, 1.2, ch, shade(c, 0.08))
        }
      courseEdges(d, W, rows, ch, color, 2, 4, 0.22)
      break
    }
    case 'shingle': {
      const tab = 100 / 3
      const ch = 14
      const rows = Math.round(H / ch)
      for (let i = 0; i < rows; i++) {
        const off = (i % 2) * (tab / 2) + (i % 4 >= 2 ? tab / 4 : 0)
        for (let j = -1; j < Math.round(W / tab) + 1; j++) {
          const k = rnd(i, j, 9)
          const c = shade(color, (k - 0.5) * 0.14, (rnd(i, j, 10) - 0.5) * 0.06)
          d.rect(j * tab + off, i * ch, tab, ch, c)
          d.rect(j * tab + off, i * ch, 0.7, ch, shade(color, -0.28))
        }
      }
      speckle(g, 5000, 1.5, [alpha(shade(color, 0.1), 0.35), alpha(shade(color, -0.1), 0.35)], 11)
      courseEdges(d, W, rows, ch, color, 0.8, 2.5, 0.3)
      break
    }
    case 'slate': {
      const sw = 45
      const ch = 18
      const rows = Math.round(H / ch)
      for (let i = 0; i < rows; i++) {
        const off = (i % 2) * (sw / 2)
        for (let j = -1; j < Math.round(W / sw) + 1; j++) {
          const c = shade(color, (rnd(i, j, 12) - 0.5) * 0.08)
          d.rect(j * sw + off, i * ch, sw, ch, c)
          // 下半截略亮（瓦面朝上翘的那一点角度）
          d.rect(j * sw + off, i * ch + ch * 0.55, sw, ch * 0.45, alpha(shade(c, 0.05), 0.6))
          d.rect(j * sw + off, i * ch, 0.6, ch, shade(color, -0.22))
        }
      }
      courseEdges(d, W, rows, ch, color, 1, 2.8, 0.24)
      break
    }
    case 'metal': {
      const pw = 45
      for (let j = 0; j < Math.round(W / pw); j++) {
        // 板中间微微鼓起：中间亮、两边暗；立边顶亮、根部暗
        d.rect(j * pw + pw * 0.25, 0, pw * 0.45, H, alpha(shade(color, 0.05), 0.7))
        d.rect(j * pw + pw * 0.86, 0, pw * 0.06, H, alpha(shade(color, -0.08), 0.8))
        d.rect(j * pw + pw * 0.935, 0, pw * 0.04, H, shade(color, 0.14))
        d.rect(j * pw + pw * 0.975, 0, pw * 0.025, H, shade(color, -0.15))
      }
      break
    }
    case 'membrane': {
      speckle(g, 1400, 3, [alpha(shade(base, 0.03), 0.5), alpha(shade(base, -0.04), 0.5)], 13)
      // 卷材 100cm 一幅，接缝一道亮边 + 细暗线；横向 400cm 一道搭接
      for (const x of [0, 100]) {
        d.rect(x, 0, 2.4, H, shade(base, 0.06))
        d.rect(x + 2.4, 0, 0.8, H, shade(base, -0.1))
      }
      d.rect(0, 200, 100, 2, shade(base, 0.05))
      d.rect(100, 0, 100, 2, shade(base, 0.05))
      break
    }
    case 'gravel': {
      const tint = shade(color, 0.3, -0.2)
      const pal = ['#c9c4b8', '#b3ada1', '#dad5ca', '#9d988e', '#e6e1d6'].map((c) => '#' + new THREE.Color(c).lerp(new THREE.Color(tint), 0.25).getHexString())
      g.fillStyle = pal[0]
      g.fillRect(0, 0, S, S)
      for (let i = 0; i < 2600; i++) {
        const x = rnd(i, 1, 14) * S
        const y = rnd(i, 2, 14) * S
        const r = 1.5 + rnd(i, 3, 14) * 3
        g.fillStyle = pal[i % pal.length]
        g.beginPath()
        g.ellipse(x, y, r, r * 0.75, rnd(i, 4, 14) * 3, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = alpha('#000000', 0.12)
        g.fillRect(x - r * 0.6, y + r * 0.5, r * 1.2, 1.2)
      }
      break
    }
    case 'green': {
      // 景天类的低矮绿化：深浅几种绿的团块，夹几点黄、红
      g.fillStyle = '#6f8f4a'
      g.fillRect(0, 0, S, S)
      const greens = ['#5f8040', '#7da352', '#8db861', '#6a9447', '#9cc46e', '#55753a']
      for (let i = 0; i < 900; i++) {
        const x = rnd(i, 1, 15) * S
        const y = rnd(i, 2, 15) * S
        const r = 4 + rnd(i, 3, 15) * 9
        g.fillStyle = greens[i % greens.length]
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
      speckle(g, 500, 3, ['#d9c45a', '#c46a4a', '#e8e0a0', '#3f5a2c'], 16)
      break
    }
  }
}

const texCache = new Map<string, THREE.Texture>()
function coverTexture(cover: RoofCover, color: string) {
  const key = `${cover}|${color}`
  let t = texCache.get(key)
  if (t) return t
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  drawCover(cv.getContext('2d')!, cover, color)
  t = new THREE.CanvasTexture(cv as unknown as HTMLCanvasElement)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  useAnisotropy(t)
  texCache.set(key, t)
  return t
}

/** 户外版的材质：室内灯不照（同 three/exterior.ts 的 roofMaterial） */
function outdoor<T extends THREE.MeshToonMaterial>(mat: T): T {
  mat.onBeforeCompile = (sh) => {
    injectLightMask(sh)
    sh.fragmentShader = sh.fragmentShader.replace('lmCell = vec4( lmF, lmFetch( lmP.xz, lmF ) );', `lmCell = vec4( lmF, 250.0, 0.0, 0.0 );`)
  }
  mat.customProgramCacheKey = () => 'roof-outdoor'
  return mat
}

const matCache = new Map<string, THREE.Material>()
/** 瓦面的材质（材料 × 颜色缓存） */
export function coverMaterial(cover: RoofCover, color: string): THREE.Material {
  const key = `sheet|${cover}|${color}`
  let m = matCache.get(key)
  if (m) return m
  const base = toon('#ffffff') as THREE.MeshToonMaterial
  m = outdoor(new THREE.MeshToonMaterial({ color: '#ffffff', map: coverTexture(cover, color), gradientMap: base.gradientMap }))
  matCache.set(key, m)
  return m
}
/** 纯色的户外材质（瓦头、脊瓦） */
function plainMaterial(color: string): THREE.Material {
  const key = `plain|${color}`
  let m = matCache.get(key)
  if (m) return m
  const base = toon(color) as THREE.MeshToonMaterial
  m = outdoor(new THREE.MeshToonMaterial({ color: base.color.clone(), gradientMap: base.gradientMap }))
  matCache.set(key, m)
  return m
}

/** 瓦头的颜色：瓦面的截面朝外，比瓦面暗一点 */
const edgeColor = (cover: RoofCover, color: string) => shade(cover === 'membrane' ? shade(color, 0.25) : cover === 'green' ? '#5d7a3e' : cover === 'gravel' ? '#a9a398' : color, -0.08)

/** 平面 (x, y, z) 的三角形平铺 → three 网格（y、z 互换；绕向按给的法线定） */
function toMesh(pos: number[], nrm: number[], uv: number[] | null, mat: THREE.Material): THREE.Mesh | null {
  if (!pos.length) return null
  const P = new Float32Array(pos.length)
  const N = new Float32Array(nrm.length)
  const T = uv ? new Float32Array(uv.length) : null
  for (let t = 0; t < pos.length; t += 9) {
    // 平面 → three：(x, y, z) → (x, z, y)
    const v = [0, 1, 2].map((m) => new THREE.Vector3(pos[t + m * 3], pos[t + m * 3 + 2], pos[t + m * 3 + 1]))
    const n = [0, 1, 2].map((m) => new THREE.Vector3(nrm[t + m * 3], nrm[t + m * 3 + 2], nrm[t + m * 3 + 1]))
    const face = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]))
    const avg = n[0].clone().add(n[1]).add(n[2])
    const order = face.dot(avg) < 0 ? [0, 2, 1] : [0, 1, 2]
    order.forEach((m, o) => {
      const at = t + o * 3
      P[at] = v[m].x
      P[at + 1] = v[m].y
      P[at + 2] = v[m].z
      N[at] = n[m].x
      N[at + 1] = n[m].y
      N[at + 2] = n[m].z
      if (T && uv) {
        const ti = ((t / 3 + o) | 0) * 2
        const si = ((t / 3 + m) | 0) * 2
        T[ti] = uv[si]
        T[ti + 1] = uv[si + 1]
      }
    })
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  if (T) geo.setAttribute('uv', new THREE.BufferAttribute(T, 2))
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** 屋面三角形 → 瓦面 + 瓦头两个网格（瓦面不描边：起伏的薄壳描出来全是碎线；轮廓由下面的屋面实体描） */
export function coverMeshes(tris: number[], cover: RoofCover, color: string, zRef?: number, sheet?: CoverSheet): THREE.Mesh[] {
  let z0 = zRef ?? Infinity
  if (zRef === undefined) for (let k = 2; k < tris.length; k += 3) z0 = Math.min(z0, tris[k])
  const s = sheet ?? coverSheet(tris, cover, z0)
  const out: THREE.Mesh[] = []
  const top = toMesh(s.pos, s.nrm, s.uv, coverMaterial(cover, color))
  const edge = toMesh(s.edgePos, s.edgeNrm, null, plainMaterial(edgeColor(cover, color)))
  for (const m of [top, edge]) {
    if (!m) continue
    m.userData.noOutline = true
    out.push(m)
  }
  // 标记瓦面（测试 / 调试用；带标记的网格不参与 mergeMeshes，本来也是每种材质一个）
  if (top) top.userData.roofCover = cover
  return out
}

// ---------- 脊瓦 ----------

/** 截面 [横向 s, 高 h]（从左下沿外轮廓到右下），seg：分节长度（每节尾端收小一点，接缝处看得出一节节） */
interface CapStyle {
  parts: { pts: [number, number][]; color: (c: string) => string; seg?: number }[]
}

const arc = (cx: number, cy: number, r: number, n: number, a0 = Math.PI, a1 = 0): [number, number][] => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]
})

/** 各材料的屋脊（ridge）/ 斜脊（hip）截面；h 从「瓦面最高处」算起，往下伸进屋面里盖住缝 */
function capStyle(cover: RoofCover, kind: 'ridge' | 'hip'): CapStyle {
  const k = kind === 'ridge' ? 1 : 0.85
  switch (cover) {
    case 'kawara':
      // のし瓦叠两层 + 冠瓦（半圆，一节节）
      return {
        parts: [
          { pts: [[-13 * k, -8], [-13 * k, 3 * k], [-12 * k, 4 * k], [-11.5 * k, 7 * k], [11.5 * k, 7 * k], [12 * k, 4 * k], [13 * k, 3 * k], [13 * k, -8]], color: (c) => shade(c, -0.06) },
          { pts: [[-8 * k, 5 * k], ...arc(0, 7 * k, 8 * k, 6), [8 * k, 5 * k]], color: (c) => shade(c, 0.04), seg: 30 },
        ],
      }
    case 'spanish':
      return {
        parts: [
          { pts: [[-12 * k, -8], [-12 * k, 2], [12 * k, 2], [12 * k, -8]], color: () => '#cdbfa9' },
          { pts: [[-11 * k, 0], ...arc(0, 1, 11 * k, 6), [11 * k, 0]], color: (c) => shade(c, -0.03), seg: 35 },
        ],
      }
    case 'cement':
      return { parts: [{ pts: [[-15 * k, -8], [-15 * k, 1], [-10 * k, 6 * k], [0, 9 * k], [10 * k, 6 * k], [15 * k, 1], [15 * k, -8]], color: (c) => shade(c, -0.04), seg: 40 }] }
    case 'shingle':
      return { parts: [{ pts: [[-15 * k, -6], [-15 * k, 0.5], [-10 * k, 3], [0, 4.5], [10 * k, 3], [15 * k, 0.5], [15 * k, -6]], color: (c) => shade(c, -0.05), seg: 33 }] }
    case 'slate':
      return { parts: [{ pts: [[-12 * k, -6], [-12 * k, 0.5], [-10 * k, 4], [0, 6], [10 * k, 4], [12 * k, 0.5], [12 * k, -6]], color: (c) => shade(c, 0.04) }] }
    default:
      // 金属板：帽形的屋脊包板
      return { parts: [{ pts: [[-16 * k, -5], [-16 * k, 1], [-4 * k, 6], [4 * k, 6], [16 * k, 1], [16 * k, -5]], color: (c) => shade(c, 0.05) }] }
  }
}

/** 沿 A→B（three 坐标）挤出截面；segLen 分节（每节尾端收到 92%），每节起点封一个端面 */
function extrudeCap(A: THREE.Vector3, B: THREE.Vector3, pts: [number, number][], segLen: number | undefined, out: number[]) {
  const dir = B.clone().sub(A)
  const L = dir.length()
  if (L < 1) return
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const n = segLen ? Math.max(1, Math.round(L / segLen)) : 1
  const ring = (t: number, scale: number) => {
    const o = A.clone().addScaledVector(dir, t)
    // 截面绕底边中点缩放（底下伸进屋面的部分不动）
    return pts.map(([s, h]) => o.clone().addScaledVector(side, s * scale).addScaledVector(up, h >= 0 ? h * scale : h))
  }
  const push = (...v: THREE.Vector3[]) => {
    for (const p of v) out.push(p.x, p.y, p.z)
  }
  for (let i = 0; i < n; i++) {
    const r0 = ring(i / n, 1)
    const r1 = ring((i + 1) / n, segLen ? 0.92 : 1)
    // 截面从左下经顶部到右下（从起点看过去是顺时针），外法线 = 截面走向 × 挤出方向
    const m = pts.length
    for (let j = 0; j < m; j++) {
      const k = (j + 1) % m // j = m - 1 是底面
      push(r0[j], r1[k], r1[j], r0[j], r0[k], r1[k])
    }
    // 端面（扇形，从截面中心）：起点朝 -dir，终点朝 +dir
    const fan = (r: THREE.Vector3[], back: boolean) => {
      const c = r.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / r.length)
      for (let j = 0; j < r.length; j++) (back ? push(c, r[(j + 1) % r.length], r[j]) : push(c, r[j], r[(j + 1) % r.length]))
    }
    if (segLen || i === 0) fan(r0, true)
    if (i === n - 1) fan(r1, false)
  }
}

/** 三角形平铺 → 网格（平面着色） */
function solidMesh(pos: number[], mat: THREE.Material) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 屋脊、斜脊的脊瓦（层局部 three 坐标）；和瓦在山墙端的屋脊头上加鬼瓦。
 * 天沟不在这里（还是 three/exterior.ts 画的一道深色线，抬到瓦面上面）。
 */
export function coverCaps(creases: Crease[], cover: RoofCover, color: string): THREE.Mesh[] {
  const H = coverHeight(cover)
  const buckets = new Map<string, number[]>()
  const add = (c: string, pos: number[]) => {
    let b = buckets.get(c)
    if (!b) buckets.set(c, (b = []))
    for (const v of pos) b.push(v)
  }
  const to3 = (p: [number, number, number]) => new THREE.Vector3(p[0], p[2] + H, p[1])
  // 屋脊端点被几条折线共用：只有屋脊自己用的端点是山墙端
  const ends = new Map<string, number>()
  const key = (p: [number, number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)},${p[2].toFixed(1)}`
  for (const c of creases) for (const p of [c.a, c.b]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1)
  for (const c of creases) {
    if (c.kind === 'valley') continue
    const style = capStyle(cover, c.kind)
    // 斜脊从低往高铺（每节的大头压在下坡一侧）
    const [a, b] = c.kind === 'hip' && c.a[2] > c.b[2] ? [c.b, c.a] : [c.a, c.b]
    for (const part of style.parts) {
      const pos: number[] = []
      extrudeCap(to3(a), to3(b), part.pts, part.seg, pos)
      add(part.color(color), pos)
    }
    if (cover === 'kawara' && c.kind === 'ridge')
      for (const p of [c.a, c.b]) {
        if ((ends.get(key(p)) ?? 0) > 1) continue
        // 鬼瓦：屋脊头上一块立着的板（宽 34、高 30、厚 8），略探出山墙
        const q = p === c.a ? c.b : c.a
        const P = to3(p)
        const d = P.clone().sub(to3(q)).setY(0).normalize()
        const pos: number[] = []
        const o = P.clone().addScaledVector(d, 2)
        const pts: [number, number][] = [[-17, -10], [-17, 10], [-12, 18], [-5, 21], [5, 21], [12, 18], [17, 10], [17, -10]]
        extrudeCap(o.clone().addScaledVector(d, -4), o.clone().addScaledVector(d, 4), pts, undefined, pos)
        add(shade(color, -0.12), pos)
      }
  }
  return [...buckets].map(([c, pos]) => solidMesh(pos, plainMaterial(c)))
}

/** 天沟线要抬到瓦面上面多少 */
export const valleyLift = (cover: RoofCover | null) => (cover ? coverHeight(cover) * 0.6 : 0)
