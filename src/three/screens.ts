// 屏幕画面烘成贴图：显示器、电视、平板的画面是在屏幕背景（kit.ts glow 发光薄片）前面一层层叠的小发光片（窗口、标题栏、文字行），
// 每层相差零点几厘米。卡通光照下看不出来，写实光照、描边、环境光遮蔽下会露出厚度（层间有阴影、边上有线）。
// 家具模板建好后（合并网格之前）调 bakeScreens：同一个父节点下、贴在某块背景前面 2.5cm 以内且落在它范围里的发光零件，
// 按前后顺序画进一张 canvas，背景换成一块贴着这张图的平面（贴在原来背景的正面），那些小片删掉。画面看起来一样，只是没有厚度了。
// 画面上圆的发光零件（电视里的云、太阳是压扁的小球）按它在屏幕上的投影画成椭圆。

import * as THREE from 'three'
import { toon, useAnisotropy } from './toon'
import type { ScreenPreset } from './screenContent'

/** 发光片前后最多隔多远（cm）还算同一块屏幕上的画面 */
const MAX_GAP = 2.5
/** 画布分辨率：每厘米多少像素、长边上限 */
const PX_PER_CM = 10
const MAX_PX = 512

interface Slab {
  mesh: THREE.Mesh
  w: number
  h: number
  d: number
  color: THREE.Color
  k: number
}

/** 发光零件：纯色、发光、不透明、没有贴图的 toon 材质 */
function glowing(o: THREE.Object3D): o is THREE.Mesh {
  const mesh = o as THREE.Mesh
  if (!mesh.isMesh || Array.isArray(mesh.material)) return false
  const m = mesh.material as THREE.MeshToonMaterial
  return !!m.isMeshToonMaterial && !m.transparent && !m.map && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0
}

/** 发光薄片（屏幕背景的候选）：几何体最薄的是 z 方向 */
function slabOf(o: THREE.Object3D): Slab | null {
  if (!glowing(o)) return null
  const g = o.geometry
  if (!g.boundingBox) g.computeBoundingBox()
  const s = g.boundingBox!.getSize(new THREE.Vector3()).multiply(o.scale)
  if (s.z > 0.9 || s.x < s.z * 2 || s.y < s.z * 2) return null
  const m = o.material as THREE.MeshToonMaterial
  return { mesh: o, w: s.x, h: s.y, d: s.z, color: m.color, k: m.emissiveIntensity }
}

/** 画面上的一个元素：在屏幕背景局部坐标里的矩形（x0..x1, y0..y1）、离背景正面的距离、形状（圆的几何体画椭圆，其余画圆角矩形） */
interface Item {
  mesh: THREE.Mesh
  x0: number
  x1: number
  y0: number
  y1: number
  z: number
  round: boolean
  color: THREE.Color
  k: number
}

/** 画成椭圆的几何体（球、圆柱、胶囊、圆盘、圆环）；其余画圆角矩形 */
const ROUND = /Sphere|Cylinder|Capsule|Circle|Torus|Lathe/
const texCache = new Map<string, THREE.CanvasTexture>()
const matCache = new Map<string, THREE.MeshToonMaterial>()
const box = new THREE.Box3()
const toBase = new THREE.Matrix4()

/**
 * preset：换成某个画面预设（screenContent.ts）。素材自带的发光小片照样删掉，画面改用预设现画；
 * 没有小片、只有一块发光背景的大屏幕（够大的，免得把指示灯也画上）也换
 */
export function bakeScreens(root: THREE.Object3D, preset?: ScreenPreset) {
  const byParent = new Map<THREE.Object3D, THREE.Mesh[]>()
  root.traverse((o) => {
    if (!glowing(o) || !o.parent) return
    let list = byParent.get(o.parent)
    if (!list) byParent.set(o.parent, (list = []))
    list.push(o)
  })
  const inv = new THREE.Matrix4()
  for (const [parent, meshes] of byParent) {
    if (meshes.length < 2) continue
    const bases = meshes.map(slabOf).filter((s): s is Slab => !!s)
    bases.sort((a, b) => b.w * b.h - a.w * a.h)
    const used = new Set<THREE.Mesh>()
    for (const base of bases) {
      if (used.has(base.mesh)) continue
      base.mesh.updateMatrix()
      inv.copy(base.mesh.matrix).invert()
      const items: Item[] = []
      for (const m of meshes) {
        if (m === base.mesh || used.has(m)) continue
        m.updateMatrix()
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
        box.copy(m.geometry.boundingBox!).applyMatrix4(toBase.multiplyMatrices(inv, m.matrix))
        // 贴在背景正面前面（不穿到背景后面），离得不远，落在背景范围里
        if (box.min.z < base.d / 2 - 0.3 || box.min.z > base.d / 2 + MAX_GAP) continue
        if (box.min.x < -base.w / 2 - 0.5 || box.max.x > base.w / 2 + 0.5 || box.min.y < -base.h / 2 - 0.5 || box.max.y > base.h / 2 + 0.5) continue
        const mat = m.material as THREE.MeshToonMaterial
        items.push({ mesh: m, x0: box.min.x, x1: box.max.x, y0: box.min.y, y1: box.max.y, z: box.min.z, round: ROUND.test(m.geometry.type), color: mat.color, k: mat.emissiveIntensity })
      }
      if (!items.length && (!preset || base.w < 8 || base.h < 5)) continue
      items.sort((a, b) => a.z - b.z)
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(base.w, base.h), preset ? presetMaterial(base, preset) : screenMaterial(base, items))
      plane.position.copy(new THREE.Vector3(0, 0, base.d / 2 + 0.02).applyMatrix4(base.mesh.matrix))
      plane.quaternion.copy(base.mesh.quaternion)
      plane.userData.noOutline = true
      plane.castShadow = false
      parent.add(plane)
      for (const it of items) {
        used.add(it.mesh)
        it.mesh.removeFromParent()
      }
      used.add(base.mesh)
      base.mesh.removeFromParent()
    }
  }
}

/** 画面材质：背景色打底，各元素按前后顺序画上去；发光强度按背景的算，其它元素的亮度差折进颜色里。同样的画面共用一份 */
function screenMaterial(base: Slab, items: Item[]) {
  const scale = Math.max(2, Math.min(PX_PER_CM, MAX_PX / Math.max(base.w, base.h)))
  const W = Math.max(4, Math.round(base.w * scale))
  const H = Math.max(4, Math.round(base.h * scale))
  const style = (c: THREE.Color, k: number) => c.clone().multiplyScalar(Math.min(1.6, k / base.k)).getStyle()
  const shapes = items.map((it) => [style(it.color, it.k), (it.x0 + base.w / 2) * scale, (base.h / 2 - it.y1) * scale, (it.x1 - it.x0) * scale, (it.y1 - it.y0) * scale, it.round ? 1 : 0] as const)
  const key = `${W}x${H}|${style(base.color, base.k)}|${shapes.map((r) => r.map((v) => (typeof v === 'number' ? v.toFixed(1) : v)).join(',')).join(';')}`
  let m = matCache.get(key)
  if (m) return m
  let tex = texCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = style(base.color, base.k)
    ctx.fillRect(0, 0, W, H)
    for (const [fill, x, y, w, h, round] of shapes) {
      ctx.fillStyle = fill
      ctx.beginPath()
      if (round) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      else ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.15)
      ctx.fill()
    }
    tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    useAnisotropy(tex)
    texCache.set(key, tex)
  }
  const gradientMap = (toon('#ffffff') as THREE.MeshToonMaterial).gradientMap
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: base.k, gradientMap })
  matCache.set(key, m)
  return m
}

/** 预设画面的材质：按屏幕尺寸（像素）和预设缓存；关着的屏幕几乎不发光 */
function presetMaterial(base: Slab, preset: ScreenPreset) {
  const scale = Math.max(2, Math.min(PX_PER_CM, MAX_PX / Math.max(base.w, base.h)))
  const W = Math.max(4, Math.round(base.w * scale))
  const H = Math.max(4, Math.round(base.h * scale))
  const key = `preset|${preset.id}|${W}x${H}`
  let m = matCache.get(key)
  if (m) return m
  let tex = texCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    preset.draw(cv.getContext('2d')!, W, H, seeded(`${preset.id}|${W}x${H}`))
    tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    useAnisotropy(tex)
    texCache.set(key, tex)
  }
  const gradientMap = (toon('#ffffff') as THREE.MeshToonMaterial).gradientMap
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: preset.id === 'off' ? 0.05 : base.k, gradientMap })
  matCache.set(key, m)
  return m
}

/** 按字符串定种子的随机数（同一预设、同样尺寸的画面每次都一样） */
function seeded(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
