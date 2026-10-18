// 3D 沙盘里家具的选中 / 悬停 / 摆放标记：贴合占地形状的圆角矩形「取景框」；有厚度的东西用立体框（show3d）。
//
//   - 一条细实线外框 + 四个加粗的角标（像相机取景框的四个角），内部一层极淡的同色填充；
//   - 出现时从稍大（112%）缩到贴合，160ms 缓出；之后角标轻轻呼吸（往外 0–2.5cm，周期 1.6s）；
//   - 悬停用同一套形状的细虚线、无角标无填充，和选中区分开；
//   - 线宽用 Line2（LineMaterial，单位是屏幕像素），远近缩放时粗细不变；
//   - 系统要求减少动效、或省电画质时不播动画（静止画面不用每帧重画）。
//   - 立体框：包围盒的 12 条棱是细线，8 个角各一组三向加粗角标，内部一层极淡的同色填充；缩入、呼吸同平面框。
// 另带一条「离墙引导线」：拖动时从占地边缘画到最近的墙面，两端各一道短横，配合指针旁的「离墙 N cm」。

import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

export type FrameStyle = 'select' | 'hover' | 'ghost'

/** 占地外扩一点再画框，框不和家具边缘重叠 */
const PAD = 8
/** 立体框比包围盒外扩的距离 */
const PAD3 = 3
const APPEAR_MS = 160
const BREATH_S = 1.6
const BREATH_CM = 2.5

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 圆角矩形的闭合轮廓（半宽 hw、半深 hd、圆角 r），逆时针 */
function roundedRect(hw: number, hd: number, r: number, seg = 6) {
  const pts: THREE.Vector3[] = []
  const corners: [number, number, number][] = [
    [hw - r, hd - r, 0],
    [-(hw - r), hd - r, Math.PI / 2],
    [-(hw - r), -(hd - r), Math.PI],
    [hw - r, -(hd - r), (Math.PI * 3) / 2],
  ]
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r))
    }
  }
  pts.push(pts[0].clone())
  return pts
}

function lineOf(pts: THREE.Vector3[], mat: LineMaterial) {
  const g = new LineGeometry()
  g.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]))
  const l = new Line2(g, mat)
  l.computeLineDistances()
  l.renderOrder = 3
  return l
}

export class SelectFrame {
  group = new THREE.Group()
  private body = new THREE.Group()
  private corners: THREE.Group[] = []
  private outlineMat: LineMaterial
  private cornerMat: LineMaterial
  private fillMat: THREE.MeshBasicMaterial
  private key = ''
  private fill: THREE.Mesh | null = null
  private shownAt = 0
  private dir: [number, number][] = []
  /** 立体框的角标往外的方向（x, y, z） */
  private dir3: [number, number, number][] = []
  private solid = false

  constructor(private style: FrameStyle) {
    const hover = style === 'hover'
    this.outlineMat = new LineMaterial({ color: '#577a68', linewidth: hover ? 1.5 : 2.5, transparent: true, opacity: hover ? 0.85 : 1, dashed: hover, dashSize: 7, gapSize: 5, depthWrite: false })
    this.cornerMat = new LineMaterial({ color: '#577a68', linewidth: 5, transparent: true, opacity: 1, depthWrite: false })
    this.fillMat = new THREE.MeshBasicMaterial({ color: '#577a68', transparent: true, opacity: style === 'ghost' ? 0.18 : 0.14, depthWrite: false, side: THREE.DoubleSide })
    this.group.add(this.body)
    this.group.visible = false
    this.group.renderOrder = 3
  }

  /** 屏幕尺寸（CSS 像素）：LineMaterial 的线宽按它换算 */
  setResolution(w: number, h: number) {
    this.outlineMat.resolution.set(w, h)
    this.cornerMat.resolution.set(w, h)
  }

  setColor(c: THREE.ColorRepresentation) {
    this.outlineMat.color.set(c)
    this.cornerMat.color.set(c)
    this.fillMat.color.set(c)
  }

  /**
   * 框线压在最上面画（不做深度测试）：门窗前面常挂着窗帘、摆着家具，框会被挡住大半。
   * 只改线，淡填充照常被遮挡。
   */
  setOnTop(on: boolean) {
    if (this.outlineMat.depthTest === !on) return
    this.outlineMat.depthTest = !on
    this.cornerMat.depthTest = !on
  }

  /** 清掉旧形状；形状没变返回 false */
  private reset(key: string) {
    if (key === this.key) return false
    this.key = key
    for (const c of [...this.body.children]) {
      this.body.remove(c)
      c.traverse((n) => (n as THREE.Mesh).geometry?.dispose())
    }
    this.corners = []
    this.dir = []
    this.dir3 = []
    this.fill = null
    return true
  }

  /** 按占地（宽 × 深，cm）重建形状；尺寸没变就不动 */
  private build(w: number, d: number) {
    if (!this.reset(`${w}x${d}`)) return
    this.solid = false
    const hw = w / 2 + PAD
    const hd = d / 2 + PAD
    const r = Math.min(10, hw / 2, hd / 2)
    this.body.add(lineOf(roundedRect(hw, hd, r), this.outlineMat))
    if (this.style !== 'hover') {
      // 填充
      const s = new THREE.Shape()
      const pts = roundedRect(hw, hd, r)
      s.moveTo(pts[0].x, pts[0].z)
      for (const p of pts.slice(1)) s.lineTo(p.x, p.z)
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(s).rotateX(Math.PI / 2), this.fillMat)
      fill.renderOrder = 2
      this.fill = fill
      this.body.add(fill)
      // 四个角标
      const len = Math.max(r + 4, Math.min(24, hw * 0.45, hd * 0.45))
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ] as [number, number][]) {
        const g = new THREE.Group()
        g.add(lineOf(this.bracket(hw, hd, r, len, sx, sz), this.cornerMat))
        this.corners.push(g)
        this.dir.push([sx, sz])
        this.body.add(g)
      }
    }
  }

  /** 一个角的角标折线：从 z 向直边进入，沿圆角转到 x 向直边离开 */
  private bracket(hw: number, hd: number, r: number, len: number, sx: number, sz: number) {
    const pts: THREE.Vector3[] = []
    const cx = sx * (hw - r)
    const cz = sz * (hd - r)
    const run = Math.max(0, len - r)
    pts.push(new THREE.Vector3(sx * hw, 0, cz - sz * run))
    // 圆心 (cx, cz)，从朝 x 外侧的方向转到朝 z 外侧的方向
    const a0 = Math.atan2(0, sx)
    const a1 = Math.atan2(sz, 0)
    let da = a1 - a0
    if (da > Math.PI) da -= Math.PI * 2
    if (da < -Math.PI) da += Math.PI * 2
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (da * i) / 6
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r))
    }
    pts.push(new THREE.Vector3(cx - sx * run, 0, sz * hd))
    return pts
  }

  /**
   * 显示在 (x, y, z)（场景坐标，y 是地面高度），占地 w × d，朝向 rotY（弧度，同家具模型的 rotation.y）。
   * 从隐藏到显示时播「缩入」动画。
   */
  show(x: number, y: number, z: number, w: number, d: number, rotY: number) {
    this.build(w, d)
    if (!this.group.visible) this.shownAt = performance.now()
    this.group.visible = true
    // 略高于地面，免得和地板深度打架
    this.group.position.set(x, y + 1.5, z)
    this.group.rotation.y = rotY
    this.body.rotation.x = 0
    if (this.fill) this.fill.visible = true
  }

  /**
   * 壁挂物、贴附物：框立起来贴在它正面（宽 w × 高 h），(x, y, z) 是框的中心，朝向 rotY 同家具模型（正面朝局部 +z）。
   */
  showUpright(x: number, y: number, z: number, w: number, h: number, rotY: number) {
    this.build(w, h)
    if (!this.group.visible) this.shownAt = performance.now()
    this.group.visible = true
    this.group.position.set(x, y, z)
    this.group.rotation.y = rotY
    this.body.rotation.x = Math.PI / 2
    // 立着的填充会像一块玻璃挡在东西前面：只留线框和角标
    if (this.fill) this.fill.visible = false
  }

  /** 立体框：包围盒（宽 w × 高 h × 深 d，局部坐标，中心在原点）外扩 PAD3 */
  private build3d(w: number, h: number, d: number) {
    if (!this.reset(`3d:${w}x${h}x${d}`)) return
    this.solid = true
    const [x, y, z] = [w / 2 + PAD3, h / 2 + PAD3, d / 2 + PAD3]
    const signs = [-1, 1]
    // 12 条棱
    const edges: THREE.Vector3[][] = []
    for (const sy of signs) for (const sz of signs) edges.push([new THREE.Vector3(-x, sy * y, sz * z), new THREE.Vector3(x, sy * y, sz * z)])
    for (const sx of signs) for (const sz of signs) edges.push([new THREE.Vector3(sx * x, -y, sz * z), new THREE.Vector3(sx * x, y, sz * z)])
    for (const sx of signs) for (const sy of signs) edges.push([new THREE.Vector3(sx * x, sy * y, -z), new THREE.Vector3(sx * x, sy * y, z)])
    for (const e of edges) this.body.add(lineOf(e, this.outlineMat))
    if (this.style === 'hover') return
    const fill = new THREE.Mesh(new THREE.BoxGeometry(x * 2, y * 2, z * 2), this.fillMat)
    fill.renderOrder = 2
    this.fill = fill
    this.body.add(fill)
    // 8 个角：沿三条棱各伸出一小段
    const len = (v: number) => Math.max(4, Math.min(20, v * 0.7))
    for (const sx of signs)
      for (const sy of signs)
        for (const sz of signs) {
          const g = new THREE.Group()
          const c = new THREE.Vector3(sx * x, sy * y, sz * z)
          g.add(lineOf([c.clone().add(new THREE.Vector3(-sx * len(x), 0, 0)), c, c.clone().add(new THREE.Vector3(0, -sy * len(y), 0))], this.cornerMat))
          g.add(lineOf([c, c.clone().add(new THREE.Vector3(0, 0, -sz * len(z)))], this.cornerMat))
          this.corners.push(g)
          this.dir3.push([sx, sy, sz])
          this.body.add(g)
        }
  }

  /** 立体框：(x, y, z) 是包围盒中心（场景坐标），w × h × d 是局部包围盒尺寸，朝向 rotY 同家具模型 */
  show3d(x: number, y: number, z: number, w: number, h: number, d: number, rotY: number) {
    this.build3d(w, h, d)
    if (!this.group.visible) this.shownAt = performance.now()
    this.group.visible = true
    this.group.position.set(x, y, z)
    this.group.rotation.y = rotY
    this.body.rotation.x = 0
    if (this.fill) this.fill.visible = true
  }

  hide() {
    this.group.visible = false
  }

  get visible() {
    return this.group.visible
  }

  /** 每帧调用；返回是否还在动（需要重画）。still 为真时不播呼吸（省电 / 减少动效） */
  update(now: number, still: boolean) {
    if (!this.group.visible) return false
    const reduce = reducedMotion()
    const k = reduce ? 1 : Math.min(1, (now - this.shownAt) / APPEAR_MS)
    const e = 1 - Math.pow(1 - k, 3)
    const s = 1.12 - 0.12 * e
    if (this.solid) this.body.scale.setScalar(s)
    else this.body.scale.set(s, 1, s)
    let moving = k < 1
    if (this.style === 'select' && !reduce && !still) {
      const b = ((1 - Math.cos(((now / 1000) * Math.PI * 2) / BREATH_S)) / 2) * BREATH_CM
      if (this.solid) this.corners.forEach((c, i) => c.position.set(this.dir3[i][0] * b, this.dir3[i][1] * b, this.dir3[i][2] * b))
      else this.corners.forEach((c, i) => c.position.set(this.dir[i][0] * b, 0, this.dir[i][1] * b))
      moving = true
    } else this.corners.forEach((c) => c.position.set(0, 0, 0))
    return moving
  }

  dispose() {
    for (const c of this.body.children) c.traverse((n) => (n as THREE.Mesh).geometry?.dispose())
    this.outlineMat.dispose()
    this.cornerMat.dispose()
    this.fillMat.dispose()
  }
}

/** 离墙引导线：占地边缘 → 墙面，两端各一道短横（场景坐标，地面上方 1.5cm） */
export class WallGuide {
  group = new THREE.Group()
  private mat = new LineMaterial({ color: '#3f6652', linewidth: 1.5, transparent: true, opacity: 0.9, dashed: true, dashSize: 4, gapSize: 3, depthWrite: false })
  private tickMat = new LineMaterial({ color: '#3f6652', linewidth: 2, transparent: true, opacity: 0.9, depthWrite: false })
  constructor() {
    this.group.visible = false
    this.group.renderOrder = 4
  }
  setResolution(w: number, h: number) {
    this.mat.resolution.set(w, h)
    this.tickMat.resolution.set(w, h)
  }
  /** a、b：起止点（平面坐标 x/y → 场景 x/z），y：地面高度；距离太短时不画 */
  show(a: { x: number; y: number }, b: { x: number; y: number }, y: number) {
    this.clear()
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 2) return this.hide()
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    const h = y + 1.5
    this.group.add(lineOf([new THREE.Vector3(a.x, h, a.y), new THREE.Vector3(b.x, h, b.y)], this.mat))
    for (const p of [a, b]) this.group.add(lineOf([new THREE.Vector3(p.x - nx * 6, h, p.y - ny * 6), new THREE.Vector3(p.x + nx * 6, h, p.y + ny * 6)], this.tickMat))
    this.group.visible = true
  }
  hide() {
    this.group.visible = false
  }
  private clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c)
      ;(c as THREE.Mesh).geometry?.dispose()
    }
  }
  dispose() {
    this.clear()
    this.mat.dispose()
    this.tickMat.dispose()
  }
}
