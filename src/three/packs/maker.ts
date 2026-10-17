// 机械手工 / 电子单片机素材包：开发板、面包板、元件耗材、焊接与测量仪器、电动工具、木工机械、工作台与收纳、半成品氛围物。
// 约定见 kit.ts 开头。id 一律 mk- 前缀。
//   - PCB 走线 / 丝印、面包板孔阵、示波器波形、数码管、刻度盘等画面都用 paintPanel（平放的用 paintTop），不拼小网格。
//   - PCB 板厚 0.16，画面浮在板面上 0.05（板体比画面四周大 0.03，描边能框住画面）；元件放在画面高度上。
//   - 线材（跳线、表笔线、电源线、软管）用 tube：两端都接在设备 / 插头 / 夹子上，不悬空断头。
//   - 挂起形态（剥线钳、杜邦线）原点 = 洞洞板挂点，自带 J 形钩（横臂 y = -2，钩尾往 -z 插进板 1cm），本体 z ≥ 0.3。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, S, movable, paintPanel, rectPoly, rng, shell, type AssetCategory, type AssetDef, type Poly, type StyleTag, type SurfaceDef } from '../kit'

type V3 = [number, number, number]
type Pal = [StyleTag, ...string[]]
type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void

const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro
const PI = Math.PI

const GOLD = '#e3b549'
const PIN = '#d5d9de'
const CHIP = '#26272b'
const HDR = '#2a2a2e'
const METAL = '#c9cdd2'
const CHROME = '#dfe3e8'
const RUBBER = '#2e2f33'
const GLASS = '#cfe8f5'
const BRASS = '#d9b25a'
const SOLDER = '#cfd3d8'
const WIRES = ['#8a5a3a', '#e8453c', '#f2963a', '#f2d23a', '#4caf50', '#3a8ee8', '#9b59d0', '#9a9da3', '#f4f4f2', '#2b2b2b']
const PASTEL = ['#d9a88a', '#ff9db0', '#ffc28f', '#ffe48f', '#a6e3a0', '#a8d4f4', '#cfb8f3', '#c9ccd2', '#fbf7f1', '#6a6a72']
const PART_COLORS = ['#e8453c', '#f2963a', '#f2d23a', '#4caf50', '#3a8ee8', '#9b59d0', '#f4f4f2', '#2b2b2b', '#e6c9a0', '#5ac8fa']

function def(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pal[], build: (p: string[]) => THREE.Group, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => x.slice(1) as string[]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}
const PROP = { prop: true }

// ======================================================================
// 小工具
// ======================================================================

function P<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}

const noLine = <T extends THREE.Object3D>(o: T): T => {
  o.traverse((c) => (c.userData.noOutline = true))
  return o
}

function lit<T extends THREE.Mesh>(m: T, color: string, k = 0.6): T {
  m.material = toon(color, { emissive: k })
  m.userData.noOutline = true
  return m
}

/** 半透明（亚克力、玻璃），整组替换材质，不描边 */
function ghost<T extends THREE.Object3D>(o: T, color: string, a = 0.35): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (m.isMesh) {
      m.material = toon(color, { transparent: a })
      m.castShadow = false
    }
  })
  return o
}

/** 沿 x / z 的横圆柱，给中心 */
const cylX = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 20) => P(cyl(r, r, len, color, {}, seg), x, y, z, 0, 0, PI / 2)
const cylZ = (r: number, len: number, color: string, x: number, y: number, z: number, seg = 20) => P(cyl(r, r, len, color, {}, seg), x, y, z, PI / 2)

/** 两端已知的 3D 圆杆 */
function bar(a: V3, b: V3, r: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 两端已知的方材：截面 w × t */
function beam(a: V3, b: V3, w: number, t: number, color: string, r = 0.4) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = rbox(w, va.distanceTo(vb), t, color, {}, r)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 把沿 +y 建的零件摆到 a，指向 b */
function orient<T extends THREE.Object3D>(o: T, a: V3, b: V3): T {
  const va = new THREE.Vector3(...a)
  o.position.copy(va)
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...b).sub(va).normalize())
  return o
}

/** 线材：过给定点的平滑软管，两端圆头 */
function tube(pts: V3[], r: number, color: string, closed = false, seg?: number) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    closed,
    'centripetal',
  )
  const geo = new THREE.TubeGeometry(curve, seg ?? Math.max(16, pts.length * 8), r, 8, closed)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  if (closed) return m
  const a = pts[0]
  const b = pts[pts.length - 1]
  return G(m, ball(r, color, { x: a[0], y: a[1], z: a[2] }), ball(r, color, { x: b[0], y: b[1], z: b[2] }))
}

/** 螺旋线点（沿 +y），半径 R、螺距 pitch、圈数 turns */
function helix(R: number, pitch: number, turns: number, perTurn = 12): V3[] {
  const n = Math.round(turns * perTurn)
  return Array.from({ length: n + 1 }, (_, i): V3 => {
    const a = (i / perTurn) * PI * 2
    return [Math.cos(a) * R, (i / perTurn) * pitch, Math.sin(a) * R]
  })
}

/** 把组摆正：x / z 居中，最低点落在 y0 */
function fit(g: THREE.Object3D, y0 = 0) {
  const outer = new THREE.Group()
  outer.add(g)
  outer.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(outer, true)
  g.position.x -= (b.min.x + b.max.x) / 2
  g.position.z -= (b.min.z + b.max.z) / 2
  g.position.y += y0 - b.min.y
  return outer
}

/** 平放的画面：w × d，画布顶边朝后（-z），(x, z) 为中心，y 为高度 */
function paintTop(w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number, emissive = 0) {
  return paintPanel(w, d, key, draw, { x, y, z: z + d / 2, rx: -PI / 2 }, emissive)
}

/** 平放的发光小块（指示灯、背光屏） */
const flatGlow = (w: number, d: number, color: string, x: number, y: number, z: number, k = 0.7) => lit(rbox(w, 0.12, d, color, { x, y, z }, 0.04), color, k)

/** 平放的扁带（灯带、FPC 排线、卷带）：过给定点，宽 width、厚 t，路径点是带子的中心线 */
function ribbon(pts: V3[], width: number, t: number, color: string) {
  const g = new THREE.Group()
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i]
    const [bx, by, bz] = pts[i + 1]
    const hd = Math.hypot(bx - ax, bz - az)
    const len = Math.hypot(hd, by - ay)
    const m = rbox(width, t, len + 0.04, color, {}, Math.min(t * 0.4, 0.05))
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    m.rotation.order = 'YXZ'
    m.rotation.set(-Math.atan2(by - ay, hd), Math.atan2(bx - ax, bz - az), 0)
    g.add(m)
  }
  return g
}

/** 平面上的平滑曲线采样（xz），步长 step */
function sample2(pts: [number, number][], step: number, y: number): V3[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, y, z)),
    false,
    'centripetal',
  )
  const n = Math.max(2, Math.round(curve.getLength() / step))
  return curve.getSpacedPoints(n).map((v): V3 => [v.x, v.y, v.z])
}

const isLight = (c: string) => {
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(c).getHSL(hsl)
  return hsl.l > 0.72
}

// ======================================================================
// 画面
// ======================================================================

/** PCB 板面：阻焊底色 + 金色走线 / 过孔 / 焊盘 + 丝印框与字 + 四角安装孔 */
function drawPcb(base: string, seed: number, silk: string, dense = 1): Draw {
  return (g, W, H) => {
    const r = rng(seed)
    const u = Math.max(W, H) / 70
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    // 走线
    g.globalAlpha = 0.85
    g.strokeStyle = GOLD
    g.lineWidth = Math.max(1, u * 0.45)
    for (let i = 0; i < 38 * dense; i++) {
      let x = r() * W
      let y = r() * H
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 3; k++) {
        const L = (4 + r() * 16) * u
        const a = Math.floor(r() * 8) * (PI / 4)
        x += Math.cos(a) * L
        y += Math.sin(a) * L
        g.lineTo(x, y)
      }
      g.stroke()
      g.fillStyle = GOLD
      g.beginPath()
      g.arc(x, y, u * 0.75, 0, PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    // 焊盘排
    g.fillStyle = GOLD
    for (let i = 0; i < 9 * dense; i++) {
      const x = W * (0.08 + r() * 0.8)
      const y = H * (0.08 + r() * 0.8)
      const n = 2 + Math.floor(r() * 7)
      const vert = r() < 0.5
      for (let k = 0; k < n; k++) g.fillRect(x + (vert ? 0 : k * u * 1.8), y + (vert ? k * u * 1.8 : 0), u * 1.1, u * 1.1)
    }
    // 丝印
    g.strokeStyle = silk
    g.fillStyle = silk
    g.lineWidth = Math.max(1, u * 0.3)
    for (let i = 0; i < 7 * dense; i++) g.strokeRect(W * (0.05 + r() * 0.75), H * (0.05 + r() * 0.75), (3 + r() * 9) * u, (2 + r() * 6) * u)
    for (let i = 0; i < 8 * dense; i++) g.fillRect(W * (0.05 + r() * 0.8), H * (0.05 + r() * 0.85), (2 + r() * 6) * u, u * 0.6)
    // 安装孔
    for (const [fx, fy] of [
      [0.05, 0.08],
      [0.95, 0.08],
      [0.05, 0.92],
      [0.95, 0.92],
    ]) {
      g.fillStyle = GOLD
      g.beginPath()
      g.arc(W * fx, H * fy, u * 1.8, 0, PI * 2)
      g.fill()
      g.fillStyle = '#1b1b1d'
      g.beginPath()
      g.arc(W * fx, H * fy, u * 1.0, 0, PI * 2)
      g.fill()
    }
  }
}

/** 母排针顶面的孔 */
const drawSockets = (n: number, rows: number): Draw => (g, W, H) => {
  g.fillStyle = HDR
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#0c0c0e'
  const cw = W / n
  const ch = H / rows
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) g.fillRect(i * cw + cw * 0.3, j * ch + ch * 0.3, cw * 0.4, ch * 0.4)
}

/** 数码管 / 段码屏：深底 + 亮字 */
const drawSeg =
  (text: string, color: string, bg = '#160c0a', unit = ''): Draw =>
  (g, W, H) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = color
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    g.font = `bold ${Math.floor(H * 0.78)}px "Courier New", monospace`
    g.fillText(text, unit ? W * 0.44 : W / 2, H * 0.54, W * (unit ? 0.78 : 0.92))
    if (unit) {
      g.font = `bold ${Math.floor(H * 0.36)}px sans-serif`
      g.fillText(unit, W * 0.91, H * 0.66)
    }
  }

/** 示波器屏：网格 + 绿色正弦 + 第二通道方波 */
const drawScope =
  (trace: string): Draw =>
  (g, W, H) => {
    g.fillStyle = '#06110b'
    g.fillRect(0, 0, W, H)
    const top = H * 0.1
    const bot = H * 0.93
    const left = W * 0.03
    const right = W * 0.97
    g.fillStyle = '#18261f'
    g.fillRect(0, 0, W, top)
    g.fillStyle = trace
    g.font = `${Math.floor(top * 0.62)}px sans-serif`
    g.textBaseline = 'middle'
    g.fillText('CH1 1.00V   M 500µs   T ↑ 0.42V', W * 0.03, top / 2)
    g.strokeStyle = 'rgba(150,200,170,0.22)'
    g.lineWidth = 1
    for (let i = 0; i <= 10; i++) {
      const x = left + ((right - left) * i) / 10
      g.beginPath()
      g.moveTo(x, top)
      g.lineTo(x, bot)
      g.stroke()
    }
    for (let j = 0; j <= 8; j++) {
      const y = top + ((bot - top) * j) / 8
      g.beginPath()
      g.moveTo(left, y)
      g.lineTo(right, y)
      g.stroke()
    }
    g.strokeStyle = 'rgba(150,200,170,0.45)'
    g.beginPath()
    g.moveTo((left + right) / 2, top)
    g.lineTo((left + right) / 2, bot)
    g.moveTo(left, (top + bot) / 2)
    g.lineTo(right, (top + bot) / 2)
    g.stroke()
    const plot = (fy: (t: number) => number, color: string) => {
      g.strokeStyle = color
      g.lineWidth = Math.max(2, H * 0.014)
      g.beginPath()
      for (let x = left; x <= right; x += 1.5) {
        const y = top + (bot - top) * fy((x - left) / (right - left))
        if (x === left) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    plot((t) => 0.36 - 0.22 * Math.sin(t * PI * 2 * 2.5), trace)
    plot((t) => (Math.floor(t * 10) % 2 === 0 ? 0.68 : 0.82), isLight(trace) && trace.toLowerCase().startsWith('#ff') ? '#5ad8ff' : '#ffd84a')
  }

/** 信号发生器 LCD：蓝底黄波形 + 参数 */
const drawSigLcd: Draw = (g, W, H) => {
  g.fillStyle = '#123a7a'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#1d4f9a'
  g.fillRect(0, 0, W, H * 0.16)
  g.fillStyle = '#ffffff'
  g.font = `${Math.floor(H * 0.1)}px sans-serif`
  g.textBaseline = 'middle'
  g.fillText('CH1  Sine  ON', W * 0.04, H * 0.08)
  g.strokeStyle = '#ffd84a'
  g.lineWidth = Math.max(2, H * 0.02)
  g.beginPath()
  for (let x = W * 0.05; x <= W * 0.6; x += 1.5) {
    const y = H * (0.5 - 0.2 * Math.sin(((x - W * 0.05) / (W * 0.55)) * PI * 4))
    if (x === W * 0.05) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  g.fillStyle = '#ffd84a'
  g.font = `bold ${Math.floor(H * 0.12)}px "Courier New", monospace`
  g.fillText('1.000000kHz', W * 0.03, H * 0.82)
  g.fillStyle = '#9fd0ff'
  g.font = `${Math.floor(H * 0.09)}px sans-serif`
  for (const [i, t] of ['Freq', 'Ampl', 'Offset', 'Phase'].entries()) {
    g.fillStyle = i === 0 ? '#ffd84a' : '#2a62b8'
    g.fillRect(W * 0.66, H * (0.2 + i * 0.19), W * 0.31, H * 0.15)
    g.fillStyle = i === 0 ? '#123a7a' : '#ffffff'
    g.fillText(t, W * 0.69, H * (0.275 + i * 0.19))
  }
}

/** OLED 小屏：黑底亮字 + 柱状图 */
const drawOled =
  (color: string): Draw =>
  (g, W, H) => {
    g.fillStyle = '#05070a'
    g.fillRect(0, 0, W, H)
    g.fillStyle = color
    g.textBaseline = 'top'
    g.font = `bold ${Math.floor(H * 0.26)}px sans-serif`
    g.fillText('HELLO!', W * 0.06, H * 0.06)
    g.font = `${Math.floor(H * 0.17)}px "Courier New", monospace`
    g.fillText('23.5°C 61%', W * 0.06, H * 0.4)
    for (let i = 0; i < 12; i++) {
      const h = H * (0.08 + 0.22 * Math.abs(Math.sin(i * 1.3)))
      g.fillRect(W * (0.06 + i * 0.075), H * 0.94 - h, W * 0.05, h)
    }
  }

/** 万用表 LCD */
const drawMeterLcd: Draw = (g, W, H) => {
  g.fillStyle = '#b4cfa8'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#1d2a24'
  g.textBaseline = 'middle'
  g.font = `bold ${Math.floor(H * 0.66)}px "Courier New", monospace`
  g.textAlign = 'right'
  g.fillText('12.47', W * 0.8, H * 0.56)
  g.font = `bold ${Math.floor(H * 0.24)}px sans-serif`
  g.textAlign = 'left'
  g.fillText('V', W * 0.83, H * 0.62)
  g.fillText('DC', W * 0.04, H * 0.2)
  g.fillText('AUTO', W * 0.04, H * 0.86)
}

/** 万用表面板：刻度盘一圈档位 */
const drawMeterFace =
  (face: string, accent: string, cy: number): Draw =>
  (g, W, H) => {
    g.fillStyle = face
    g.fillRect(0, 0, W, H)
    const cx = W / 2
    const y0 = H * cy
    const rr = W * 0.38
    g.strokeStyle = '#e8e8e8'
    g.fillStyle = '#e8e8e8'
    g.lineWidth = Math.max(1, W * 0.012)
    const labels = ['OFF', 'V~', 'V⎓', 'mV', 'Ω', '→|', 'A', 'mA', 'µA', 'Hz']
    g.font = `bold ${Math.floor(W * 0.07)}px sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    labels.forEach((t, i) => {
      const a = -PI * 0.9 + (i / (labels.length - 1)) * PI * 1.8 - PI / 2
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * rr * 0.72, y0 + Math.sin(a) * rr * 0.72)
      g.lineTo(cx + Math.cos(a) * rr * 0.82, y0 + Math.sin(a) * rr * 0.82)
      g.stroke()
      g.fillStyle = i === 2 ? accent : '#e8e8e8'
      g.fillText(t, cx + Math.cos(a) * rr * 1.0, y0 + Math.sin(a) * rr * 1.0)
    })
    g.fillStyle = accent
    g.fillRect(W * 0.08, H * 0.05, W * 0.84, H * 0.012)
  }

/** 面包板孔阵：两侧电源轨（红 / 蓝线）、中间凹槽、主区 a–j 行 */
const BB_P = 0.254
const BB_D = 5.5
const bbX = (n: number, c: number) => (c - (n - 1) / 2) * BB_P
const bbZ = (r: number) => (r >= 10 ? [-2.25, -1.996, 1.996, 2.25][r - 10] : r < 5 ? -(0.381 + (4 - r) * BB_P) : 0.381 + (r - 5) * BB_P)
const railCol = (n: number, c: number) => c >= 2 && c <= n - 3 && c % 6 !== 5
const drawBreadboard =
  (base: string, n: number, w: number, rails: boolean): Draw =>
  (g, W, H) => {
    const d = rails ? BB_D : 3.5
    const px = (x: number) => ((x + w / 2) / w) * W
    const pz = (z: number) => ((z + d / 2) / d) * H
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.fillStyle = shade(base, -0.12)
    g.fillRect(0, pz(-0.2), W, pz(0.2) - pz(-0.2))
    const s = Math.max(1, (0.11 / w) * W)
    g.fillStyle = shade(base, -0.55)
    for (let c = 0; c < n; c++) for (let r = 0; r < 10; r++) g.fillRect(px(bbX(n, c)) - s / 2, pz(bbZ(r)) - s / 2, s, s)
    if (rails) {
      for (let c = 0; c < n; c++) if (railCol(n, c)) for (let r = 10; r < 14; r++) g.fillRect(px(bbX(n, c)) - s / 2, pz(bbZ(r)) - s / 2, s, s)
      const lw = Math.max(1, H * 0.012)
      for (const [z, col] of [
        [-2.52, '#e8453c'],
        [-1.72, '#3a6fd8'],
        [1.72, '#e8453c'],
        [2.52, '#3a6fd8'],
      ] as const) {
        g.fillStyle = col
        g.fillRect(px(bbX(n, 0)), pz(z) - lw / 2, px(bbX(n, n - 1)) - px(bbX(n, 0)), lw)
      }
    }
  }

/** 蜂窝床（激光切割机） */
const drawHoneycomb: Draw = (g, W, H) => {
  g.fillStyle = '#5e6268'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#8e9399'
  g.lineWidth = 1
  const s = Math.max(4, W / 70)
  for (let y = 0, row = 0; y < H + s; y += s * 0.87, row++)
    for (let x = row % 2 ? s / 2 : 0; x < W + s; x += s) {
      g.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * PI * 2 + PI / 6
        const xx = x + Math.cos(a) * s * 0.55
        const yy = y + Math.sin(a) * s * 0.55
        if (k === 0) g.moveTo(xx, yy)
        else g.lineTo(xx, yy)
      }
      g.closePath()
      g.stroke()
    }
}

/** 木板上切 / 刻出的图案（激光切割件、CNC 雕刻件） */
const drawCutWood =
  (wood: string, kind: 'laser' | 'cnc'): Draw =>
  (g, W, H) => {
    g.fillStyle = wood
    g.fillRect(0, 0, W, H)
    g.strokeStyle = shade(wood, -0.08)
    g.lineWidth = 1
    for (let y = 3; y < H; y += 7) {
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(W * 0.3, y + 3, W * 0.6, y - 3, W, y + 1)
      g.stroke()
    }
    g.strokeStyle = kind === 'laser' ? '#3a2416' : shade(wood, -0.3)
    g.lineWidth = Math.max(2, W * 0.012)
    if (kind === 'laser') {
      for (const [cx, cy, rr] of [
        [0.25, 0.35, 0.16],
        [0.62, 0.32, 0.12],
      ]) {
        g.beginPath()
        for (let k = 0; k <= 10; k++) {
          const a = (k / 10) * PI * 2 - PI / 2
          const rad = (k % 2 ? 0.45 : 1) * rr * H
          const x = W * cx + Math.cos(a) * rad
          const y = H * cy + Math.sin(a) * rad
          if (k === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
      g.strokeRect(W * 0.12, H * 0.62, W * 0.3, H * 0.26)
      g.beginPath()
      g.arc(W * 0.72, H * 0.72, H * 0.15, 0, PI * 2)
      g.stroke()
    } else {
      g.beginPath()
      for (let k = 0; k < 120; k++) {
        const a = k * 0.25
        const rad = (k / 120) * H * 0.4
        const x = W * 0.5 + Math.cos(a) * rad * (W / H) * 0.9
        const y = H * 0.5 + Math.sin(a) * rad
        if (k === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      g.strokeRect(W * 0.06, H * 0.08, W * 0.88, H * 0.84)
    }
  }

/** 洞洞板孔（2.5cm 间距，第一排距底 1.25cm） */
const drawPegHoles =
  (base: string): Draw =>
  (g, W, H) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    const pxPerCm = W / 133
    const s = 2.5 * pxPerCm
    g.fillStyle = shade(base, -0.45)
    for (let y = H - 1.25 * pxPerCm; y > 0; y -= s)
      for (let x = 1.75 * pxPerCm; x < W; x += s) {
        g.beginPath()
        g.arc(x, y, Math.max(1, 0.35 * pxPerCm), 0, PI * 2)
        g.fill()
      }
  }

/** 防静电垫：网格 + 标识 + 刻度 */
const drawEsdMat =
  (base: string): Draw =>
  (g, W, H) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.strokeStyle = shade(base, 0.12)
    g.lineWidth = 1
    for (let x = 0; x < W; x += W / 30) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, H)
      g.stroke()
    }
    for (let y = 0; y < H; y += W / 30) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }
    g.fillStyle = shade(base, 0.3)
    g.fillRect(0, H * 0.94, W, H * 0.06)
    g.fillStyle = base
    for (let i = 0; i < 60; i++) g.fillRect((i / 60) * W, H * 0.94, 1, H * (i % 5 === 0 ? 0.035 : 0.018))
    g.fillStyle = shade(base, 0.35)
    g.font = `bold ${Math.floor(H * 0.05)}px sans-serif`
    g.textBaseline = 'top'
    g.fillText('⚠ ESD PROTECTIVE AREA', W * 0.03, H * 0.03)
  }

/** 小标签：底色 + 一两行字 */
const drawTag =
  (bg: string, fg: string, lines: string[]): Draw =>
  (g, W, H) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const n = lines.length
    lines.forEach((t, i) => {
      g.font = `bold ${Math.floor((H / n) * (i === 0 ? 0.55 : 0.4))}px sans-serif`
      g.fillText(t, W / 2, (H * (i + 0.5)) / n, W * 0.9)
    })
  }

/** 圆形标签（焊锡卷、助焊剂罐盖） */
const drawRoundTag =
  (bg: string, fg: string, t1: string, t2: string): Draw =>
  (g, W, H) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = fg
    g.beginPath()
    g.arc(W / 2, H / 2, Math.min(W, H) * 0.47, 0, PI * 2)
    g.lineWidth = Math.max(2, W * 0.03)
    g.strokeStyle = fg
    g.stroke()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `bold ${Math.floor(H * 0.2)}px sans-serif`
    g.fillText(t1, W / 2, H * 0.44)
    g.font = `${Math.floor(H * 0.11)}px sans-serif`
    g.fillText(t2, W / 2, H * 0.64)
  }

/** 模组天线（蛇形走线） */
const drawAntenna: Draw = (g, W, H) => {
  g.fillStyle = '#1c1c1e'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = GOLD
  g.lineWidth = Math.max(2, W * 0.08)
  g.beginPath()
  const n = 6
  g.moveTo(W * 0.2, H * 0.05)
  for (let i = 0; i < n; i++) {
    const y = H * (0.1 + (i / n) * 0.8)
    g.lineTo(i % 2 ? W * 0.2 : W * 0.8, y)
    g.lineTo(i % 2 ? W * 0.2 : W * 0.8, y + (H * 0.8) / n)
  }
  g.stroke()
}

/** 铝型材工作台（CNC）：T 形槽 */
const drawSlots: Draw = (g, W, H) => {
  g.fillStyle = '#c3c7cc'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#5e6268'
  for (let i = 1; i < 6; i++) g.fillRect(0, (H * i) / 6 - H * 0.02, W, H * 0.04)
}

/** 卷尺刻度条（显微镜底座、台锯） */
const drawRuler =
  (bg: string, fg: string): Draw =>
  (g, W, H) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = fg
    for (let i = 0; i <= 40; i++) g.fillRect((i / 40) * W, 0, 1, H * (i % 10 === 0 ? 0.7 : i % 5 === 0 ? 0.5 : 0.3))
  }

// ======================================================================
// 电子零件
// ======================================================================

const PCB_T = 0.16

/** 一块 PCB：板体 + 画面；返回组和元件安装面高度 */
function board(w: number, d: number, base: string, seed: number, y = 0.15, feet = true, dense = 1) {
  const g = new THREE.Group()
  const silk = isLight(base) ? '#3a3a3c' : '#ffffff'
  g.add(rbox(w + 0.06, PCB_T, d + 0.06, shade(base, -0.05), { y }, 0.05))
  const top = y + PCB_T + 0.05
  g.add(paintTop(w, d, `mk-pcb-${base}-${seed}-${w}x${d}`, drawPcb(base, seed, silk, dense), 0, top, 0))
  if (feet && y > 0.05) for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.18, 0.18, y, '#e8e8e8', { x: sx * (w / 2 - 0.35), z: sz * (d / 2 - 0.35) }, 10))
  return { g, top }
}

/** 贴片 / QFP 芯片：黑色小方块 + 四周银色引脚；nx = 前后两边每边引脚数，nz = 左右两边每边引脚数 */
function chip(w: number, d: number, x: number, y: number, z: number, nx = 0, nz = 0, h = 0.14, body = CHIP) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, body, { x, y: y + 0.03, z }, 0.03))
  const k = Math.min(w, d)
  g.add(noLine(cyl(k * 0.08, k * 0.08, 0.04, '#5a5b60', { x: x - w / 2 + k * 0.2, y: y + 0.03 + h, z: z - d / 2 + k * 0.2 }, 10)))
  for (let i = 0; i < nx; i++) {
    const px = x - w / 2 + (w * (i + 0.5)) / nx
    for (const s of [-1, 1]) g.add(noLine(rbox(Math.min(0.12, (w / nx) * 0.55), 0.05, 0.14, PIN, { x: px, y, z: z + s * (d / 2 + 0.05) }, 0.01)))
  }
  for (let i = 0; i < nz; i++) {
    const pz = z - d / 2 + (d * (i + 0.5)) / nz
    for (const s of [-1, 1]) g.add(noLine(rbox(0.14, 0.05, Math.min(0.12, (d / nz) * 0.55), PIN, { x: x + s * (w / 2 + 0.05), y, z: pz }, 0.01)))
  }
  return g
}

/** 直插 DIP 芯片：本体离板 0.1，两侧弯腿 */
function dip(n: number, x: number, y: number, z: number, body = CHIP) {
  const g = new THREE.Group()
  const w = n * BB_P - 0.05
  g.add(rbox(w, 0.32, 0.62, body, { x, y: y + 0.12, z }, 0.04))
  g.add(noLine(cyl(0.06, 0.06, 0.03, '#5a5b60', { x: x - w / 2 + 0.18, y: y + 0.44, z: z - 0.15 }, 10)))
  for (let i = 0; i < n; i++)
    for (const s of [-1, 1]) {
      const px = x - w / 2 + BB_P * (i + 0.5)
      g.add(noLine(rbox(0.07, 0.4, 0.05, PIN, { x: px, y: y - 0.2, z: z + s * 0.381 }, 0.01)))
      g.add(noLine(rbox(0.07, 0.05, 0.1, PIN, { x: px, y: y + 0.2, z: z + s * 0.34 }, 0.01)))
    }
  return g
}

/** 排针（公：塑料座 + 竖针；母：高塑料座 + 顶面孔） along = 排列方向 */
function header(n: number, rows: number, x: number, y: number, z: number, along: 'x' | 'z' = 'x', female = false, pinColor = GOLD, body = HDR) {
  const g = new THREE.Group()
  const L = n * BB_P
  const Wd = rows * BB_P
  const [bw, bd] = along === 'x' ? [L, Wd] : [Wd, L]
  if (female) {
    g.add(rbox(bw, 0.85, bd, body, { x, y, z }, 0.04))
    g.add(paintTop(bw - 0.04, bd - 0.04, `mk-sock-${n}x${rows}-${along}`, along === 'x' ? drawSockets(n, rows) : drawSockets(rows, n), x, y + 0.88, z))
    return g
  }
  g.add(rbox(bw, 0.25, bd, body, { x, y, z }, 0.04))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < rows; j++) {
      const a = (i - (n - 1) / 2) * BB_P
      const b = (j - (rows - 1) / 2) * BB_P
      g.add(noLine(rbox(0.07, 0.85, 0.07, pinColor, { x: x + (along === 'x' ? a : b), y, z: z + (along === 'x' ? b : a) }, 0.01)))
    }
  return g
}

/** 朝下的排针（小板插在面包板上 / 平放时支起板子）：针脚 y 0–0.6，塑料座 0.6–0.85 */
function headerDown(n: number, x: number, z: number, along: 'x' | 'z' = 'x') {
  const g = new THREE.Group()
  const L = n * BB_P
  g.add(rbox(along === 'x' ? L : BB_P, 0.25, along === 'x' ? BB_P : L, HDR, { x, y: 0.6, z }, 0.04))
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * BB_P
    g.add(noLine(rbox(0.07, 0.62, 0.07, PIN, { x: x + (along === 'x' ? a : 0), y: 0, z: z + (along === 'x' ? 0 : a) }, 0.01)))
  }
  return g
}

/** 轻触按键：方底 + 圆帽 */
function tactile(x: number, y: number, z: number, cap = '#2b2b2b', s = 0.6) {
  return G(rbox(s, 0.3, s, '#c9ccd2', { x, y, z }, 0.05), cyl(s * 0.28, s * 0.28, 0.18, cap, { x, y: y + 0.3, z }, 12))
}

/** micro USB 口，开口朝 dir（-x / +x） */
const microUsb = (x: number, y: number, z: number) => rbox(0.6, 0.28, 0.75, METAL, { x, y, z }, 0.08)

/** 直插 LED：两条腿插进孔（孔面高 top），灯珠发光 */
function ledThrough(x1: number, x2: number, z: number, top: number, color: string, legH = 0.9) {
  const g = new THREE.Group()
  for (const x of [x1, x2]) g.add(noLine(rbox(0.05, legH + 0.25, 0.05, PIN, { x, y: top - 0.25, z }, 0.01)))
  const cx = (x1 + x2) / 2
  g.add(lit(cyl(0.29, 0.29, 0.08, color, { x: cx, y: top + legH, z }, 14), color, 0.5))
  g.add(lit(cyl(0.25, 0.25, 0.42, color, { x: cx, y: top + legH + 0.08, z }, 14), color, 0.8))
  g.add(lit(ball(0.25, color, { x: cx, y: top + legH + 0.5, z }), color, 0.8))
  return g
}

/** 色环电阻：两腿插孔，本体卧在板上方 */
function resistor(x1: number, x2: number, z: number, top: number, body = '#e6c9a0', bands = ['#8a5a3a', '#2b2b2b', '#e8453c', GOLD]) {
  const g = new THREE.Group()
  const y = top + 0.32
  const cx = (x1 + x2) / 2
  g.add(cylX(0.12, 0.62, body, cx, y, z, 12))
  for (const s of [-1, 1]) g.add(cylX(0.135, 0.12, body, cx + s * 0.27, y, z, 12))
  bands.forEach((b, i) => g.add(noLine(cylX(0.128, 0.05, b, cx - 0.2 + i * 0.12 + (i === 3 ? 0.06 : 0), y, z, 12))))
  for (const x of [x1, x2]) {
    g.add(noLine(rbox(0.05, 0.57, 0.05, PIN, { x, y: top - 0.25, z }, 0.01)))
    g.add(noLine(bar([x, y, z], [cx + Math.sign(cx - x) * -0.3, y, z], 0.025, PIN, 6)))
  }
  return g
}

/** 电解电容：立在两孔上 */
function eCap(x1: number, x2: number, z: number, top: number, body = '#2b4fa0', h = 0.9, r = 0.3) {
  const cx = (x1 + x2) / 2
  const g = G(cyl(r, r, h, body, { x: cx, y: top + 0.2, z }, 16), noLine(cyl(r * 0.85, r * 0.85, 0.03, METAL, { x: cx, y: top + 0.2 + h, z }, 16)))
  g.add(noLine(rbox(0.06, h * 0.9, 0.04, '#e8e8e8', { x: cx - r * 0.6, y: top + 0.25, z: z + r * 0.78 }, 0.01)))
  for (const x of [x1, x2]) g.add(noLine(rbox(0.05, 0.47, 0.05, PIN, { x, y: top - 0.25, z }, 0.01)))
  return g
}

/** 瓷片电容：小圆片 + 两腿 */
function ceramicCap(x1: number, x2: number, z: number, top: number, color = '#f2963a') {
  const cx = (x1 + x2) / 2
  const g = G(ball(0.22, color, { x: cx, y: top + 0.55, z }, [1, 1, 0.4]))
  for (const x of [x1, x2]) g.add(noLine(bar([x, top - 0.25, z], [cx + (x - cx) * 0.5, top + 0.45, z], 0.025, PIN, 6)))
  return g
}

/** 跳线：从孔 a 拱到孔 b（孔面高 top，拱高 h）；h 很小时就是贴板走的短跳线 */
function jumper(a: [number, number], b: [number, number], top: number, h: number, color: string, r = 0.055) {
  const [ax, az] = a
  const [bx, bz] = b
  const dx = bx - ax
  const dz = bz - az
  if (h < 0.3) {
    const k = 0.12 / Math.max(0.3, Math.hypot(dx, dz))
    return tube(
      [
        [ax, top - 0.2, az],
        [ax, top + 0.06, az],
        [ax + dx * k, top + 0.1, az + dz * k],
        [bx - dx * k, top + 0.1, bz - dz * k],
        [bx, top + 0.06, bz],
        [bx, top - 0.2, bz],
      ],
      r,
      color,
    )
  }
  return tube(
    [
      [ax, top - 0.2, az],
      [ax, top + h * 0.45, az],
      [ax + dx * 0.25, top + h * 0.92, az + dz * 0.25],
      [ax + dx * 0.5, top + h, az + dz * 0.5],
      [ax + dx * 0.75, top + h * 0.92, az + dz * 0.75],
      [bx, top + h * 0.45, bz],
      [bx, top - 0.2, bz],
    ],
    r,
    color,
  )
}

/** 杜邦头：黑色方塑料壳，公头带针；沿 dir（单位向量 xz）朝外 */
function dupontHead(x: number, y: number, z: number, ang: number, male: boolean, color = '#1e1e20') {
  const g = new THREE.Group()
  g.add(rbox(0.25, 0.25, 1.4, color, { y: -0.125 }, 0.03))
  g.children[0].position.z = 0.7
  if (male) g.add(noLine(P(rbox(0.07, 0.07, 0.6, PIN, {}, 0.01), 0, 0, 1.6)))
  g.position.set(x, y, z)
  g.rotation.y = ang
  return g
}

/** 1 节 AA 电池（沿 z 平放），给中心 */
function aaBattery(x: number, y: number, z: number, wrap: string, band: string, len = 5.0, r = 0.72) {
  return G(
    cylZ(r, len, wrap, x, y, z, 18),
    cylZ(r + 0.01, len * 0.22, band, x, y, z - len * 0.3, 18),
    cylZ(r * 0.35, 0.16, METAL, x, y, z + len / 2 + 0.06, 12),
    noLine(cylZ(r * 0.9, 0.04, METAL, x, y, z - len / 2 - 0.01, 16)),
  )
}

/** 鳄鱼夹（沿 +z 张口），后部套绝缘套 */
function gator(x: number, y: number, z: number, boot: string, ang = 0) {
  const g = new THREE.Group()
  g.add(capsule(0.32, 1.4, boot, {}))
  g.children[0].rotation.x = PI / 2
  g.children[0].position.set(0, 0.32, 0.2)
  g.add(P(rbox(0.5, 0.12, 2.0, METAL, {}, 0.04), 0, 0.5, 1.9, -0.18))
  g.add(P(rbox(0.5, 0.12, 2.0, METAL, {}, 0.04), 0, 0.14, 1.9, 0.05))
  g.position.set(x, y, z)
  g.rotation.y = ang
  return g
}

// ======================================================================
// 电子 / 单片机
// ======================================================================

/** Arduino UNO 风：6.86 × 5.34 */
function arduinoParts(base: string, hdr: string, acc: string) {
  const W = 6.86
  const { g, top: t } = board(W, 5.34, base, 11)
  g.add(rbox(1.6, 1.1, 1.2, METAL, { x: -2.95, y: t, z: -1.05 }, 0.08))
  g.add(noLine(rbox(0.12, 0.7, 0.8, '#3a3a3c', { x: -3.77, y: t + 0.2, z: -1.05 }, 0.04)))
  g.add(rbox(1.4, 1.1, 0.9, '#1e1e20', { x: -2.85, y: t, z: 1.6 }, 0.1))
  g.add(noLine(cylX(0.25, 0.1, '#0c0c0e', -3.57, t + 0.55, 1.6, 12)))
  g.add(header(10, 1, -0.2, t, -2.5, 'x', true, GOLD, hdr))
  g.add(header(8, 1, 2.3, t, -2.5, 'x', true, GOLD, hdr))
  g.add(header(8, 1, -0.5, t, 2.5, 'x', true, GOLD, hdr))
  g.add(header(6, 1, 2.0, t, 2.5, 'x', true, GOLD, hdr))
  g.add(rbox(3.7, 0.28, 1.0, '#2a2a2e', { x: 0.9, y: t, z: 1.1 }, 0.04))
  g.add(rbox(3.56, 0.36, 0.66, CHIP, { x: 0.9, y: t + 0.28, z: 1.1 }, 0.05))
  g.add(noLine(cyl(0.08, 0.08, 0.03, '#5a5b60', { x: -0.7, y: t + 0.64, z: 1.1 }, 10)))
  g.add(rbox(1.1, 0.35, 0.45, METAL, { x: -1.0, y: t, z: 0.4 }, 0.15))
  g.add(tactile(-2.9, t, -2.2, acc))
  g.add(rbox(0.65, 0.25, 0.65, CHIP, { x: -2.6, y: t, z: 0.55 }, 0.05))
  for (const z of [0.85, 1.6]) g.add(G(cyl(0.3, 0.3, 0.55, '#2b2b2b', { x: -1.75, y: t, z }, 14), noLine(cyl(0.26, 0.26, 0.03, METAL, { x: -1.75, y: t + 0.55, z }, 14))))
  g.add(chip(0.5, 0.5, -1.2, t, -1.0, 4, 4))
  g.add(header(3, 2, 3.0, t, 0.6, 'z'))
  g.add(flatGlow(0.25, 0.15, '#7cff8a', 1.3, t, -1.6))
  g.add(flatGlow(0.25, 0.15, '#ffb43a', 1.3, t, -1.25))
  return g
}

/** 树莓派风：8.5 × 5.6 */
function raspiParts(base: string, hdr: string, acc: string) {
  const { g, top: t } = board(8.5, 5.6, base, 23)
  g.add(header(20, 2, -0.45, t, -2.33, 'x', false, GOLD, hdr))
  for (const z of [-1.75, -0.15]) {
    g.add(rbox(1.9, 1.6, 1.35, METAL, { x: 3.5, y: t, z }, 0.08))
    for (const yy of [0.25, 0.95]) g.add(noLine(rbox(0.1, 0.42, 0.95, '#2b4fa0', { x: 4.47, y: t + yy, z }, 0.03)))
  }
  g.add(rbox(2.1, 1.35, 1.6, METAL, { x: 3.4, y: t, z: 1.6 }, 0.08))
  g.add(noLine(rbox(0.1, 0.75, 1.1, '#2b2b2b', { x: 4.47, y: t + 0.3, z: 1.6 }, 0.04)))
  g.add(rbox(1.4, 0.12, 1.4, '#e8e8e8', { x: -0.6, y: t, z: 0.2 }, 0.06))
  g.add(rbox(1.2, 0.18, 1.2, METAL, { x: -0.6, y: t + 0.12, z: 0.2 }, 0.06))
  g.add(chip(0.9, 0.9, 1.6, t, 0.4, 0, 0))
  g.add(chip(0.6, 0.6, 1.6, t, -0.8, 5, 5))
  g.add(rbox(1.5, 0.6, 1.15, METAL, { x: -1.0, y: t, z: 2.35 }, 0.1))
  g.add(microUsb(-3.0, t, 2.5))
  g.add(rbox(0.7, 0.6, 1.2, '#1e1e20', { x: 1.0, y: t, z: 2.2 }, 0.08))
  g.add(cylZ(0.3, 0.4, '#1e1e20', 1.0, t + 0.3, 2.95, 12))
  g.add(rbox(1.8, 0.3, 0.35, '#f4f4f2', { x: -2.4, y: t, z: 0.4 }, 0.04))
  g.add(rbox(0.35, 0.3, 1.8, '#f4f4f2', { x: -3.7, y: t, z: -0.2 }, 0.04))
  g.add(flatGlow(0.22, 0.15, '#ff4a3a', -3.6, t, 1.7))
  g.add(flatGlow(0.22, 0.15, acc, -3.6, t, 1.35))
  return g
}

const BOARD_PALS: Pal[] = [
  ['modern', '#1f6fb2', HDR, '#e8453c'],
  ['industrial', '#2f7d4a', HDR, '#f2c230'],
  ['modern', '#2a2b30', '#3d3f44', '#5ac8fa'],
  ['cute', '#9b6fd0', HDR, C.pink],
  ['cute', '#f2f2ee', C.pink, C.sky],
]
const PI_PALS: Pal[] = [
  ['industrial', '#2f8f4a', HDR, '#7cff8a'],
  ['modern', '#2a2b30', HDR, '#5ac8fa'],
  ['modern', '#1f6fb2', HDR, '#7cff8a'],
  ['cute', '#d9468f', HDR, C.lemon],
]

function esp32(p: string[]) {
  const [base, , acc] = p
  const g = new THREE.Group()
  const { g: b, top: t } = board(5.2, 2.8, base, 37, 0.85, false, 0.6)
  g.add(b)
  g.add(headerDown(15, 0, -1.15))
  g.add(headerDown(15, 0, 1.15))
  g.add(rbox(2.55, 0.1, 1.8, '#202022', { x: 1.2, y: t, z: 0 }, 0.04))
  g.add(rbox(1.75, 0.3, 1.6, METAL, { x: 0.85, y: t + 0.1, z: 0 }, 0.06))
  g.add(paintTop(0.6, 1.6, 'mk-antenna', drawAntenna, 2.15, t + 0.16, 0))
  g.add(microUsb(-2.45, t, 0))
  for (const s of [-1, 1]) g.add(tactile(-1.95, t, s * 0.95, '#2b2b2b', 0.42))
  g.add(chip(0.5, 0.5, -1.15, t, 0.4, 4, 4))
  g.add(rbox(0.65, 0.18, 0.35, CHIP, { x: -1.15, y: t, z: -0.55 }, 0.04))
  g.add(flatGlow(0.2, 0.14, acc, -1.75, t, 0.05))
  return fit(g)
}

function bluePill(p: string[]) {
  const [base, , acc] = p
  const g = new THREE.Group()
  const { g: b, top: t } = board(5.3, 2.3, base, 41, 0.85, false, 0.6)
  g.add(b)
  g.add(headerDown(20, 0, -1.02))
  g.add(headerDown(20, 0, 1.02))
  g.add(P(G(chip(0.7, 0.7, 0, t, 0, 12, 12, 0.12)), 0.5, 0, 0, 0, PI / 4))
  g.add(rbox(0.5, 0.2, 0.28, METAL, { x: -0.6, y: t, z: 0.55 }, 0.08))
  for (const z of [-0.3, 0.2]) {
    g.add(header(3, 1, -1.55, t, z, 'x'))
    g.add(rbox(0.25, 0.55, 0.28, '#f2c230', { x: -1.68, y: t + 0.32, z }, 0.04))
  }
  g.add(microUsb(-2.55, t, 0))
  g.add(tactile(-0.7, t, -0.62, '#2b2b2b', 0.4))
  g.add(header(4, 1, 2.45, t, 0, 'z'))
  g.add(flatGlow(0.2, 0.12, '#ff4a3a', 1.6, t, 0.7))
  g.add(flatGlow(0.2, 0.12, acc, 1.6, t, -0.7))
  return fit(g)
}

/** 面包板本体 + 孔阵画面；返回孔面高度 */
function bbBody(g: THREE.Group, n: number, w: number, color: string, rails = true) {
  const d = rails ? BB_D : 3.5
  g.add(rbox(w, 0.85, d, color, {}, 0.12))
  g.add(paintTop(w - 0.1, d - 0.1, `mk-bb-${color}-${n}-${rails}`, drawBreadboard(color, n, w - 0.1, rails), 0, 0.9, 0))
  return 0.9
}

function breadboardFull(p: string[]) {
  const [color, wireSet, led] = p
  const wires = isLight(wireSet) ? PASTEL : WIRES
  const n = 63
  const g = new THREE.Group()
  const T = bbBody(g, n, 16.5, color)
  const h = (c: number, r: number): [number, number] => [bbX(n, c), bbZ(r)]
  g.add(dip(4, (bbX(n, 20) + bbX(n, 23)) / 2, T, 0))
  g.add(ledThrough(bbX(n, 40), bbX(n, 41), bbZ(2), T, led))
  g.add(ledThrough(bbX(n, 44), bbX(n, 45), bbZ(7), T, '#7cff6a'))
  g.add(resistor(bbX(n, 34), bbX(n, 39), bbZ(1), T))
  g.add(resistor(bbX(n, 46), bbX(n, 51), bbZ(8), T, '#7fb0e0', ['#e8453c', '#e8453c', '#8a5a3a', GOLD]))
  g.add(eCap(bbX(n, 26), bbX(n, 27), bbZ(7), T))
  g.add(ceramicCap(bbX(n, 17), bbX(n, 18), bbZ(3), T))
  g.add(jumper(h(8, 10), h(8, 0), T, 0.6, wires[1]))
  g.add(jumper(h(10, 13), h(10, 9), T, 0.6, wires[9]))
  g.add(jumper(h(24, 2), h(40, 0), T, 1.3, wires[3]))
  g.add(jumper(h(22, 7), h(44, 9), T, 1.0, wires[4]))
  g.add(jumper(h(30, 4), h(30, 5), T, 0.1, wires[2]))
  g.add(jumper(h(52, 3), h(52, 10), T, 0.8, wires[1]))
  g.add(jumper(h(54, 6), h(54, 13), T, 0.8, wires[9]))
  g.add(jumper(h(13, 2), h(16, 2), T, 0.1, wires[5]))
  g.add(jumper(h(14, 11), h(14, 1), T, 0.1, wires[1]))
  g.add(jumper(h(33, 12), h(33, 8), T, 0.1, wires[9]))
  return g
}

function breadboardHalf(p: string[]) {
  const [color, wireSet, led] = p
  const wires = isLight(wireSet) ? PASTEL : WIRES
  const n = 30
  const g = new THREE.Group()
  const T = bbBody(g, n, 8.2, color)
  const h = (c: number, r: number): [number, number] => [bbX(n, c), bbZ(r)]
  g.add(ledThrough(bbX(n, 18), bbX(n, 19), bbZ(2), T, led))
  g.add(resistor(bbX(n, 12), bbX(n, 17), bbZ(1), T))
  const bx = bbX(n, 7)
  g.add(rbox(0.6, 0.35, 0.6, '#2b2b2b', { x: bx, y: T + 0.1, z: 0 }, 0.05))
  g.add(cyl(0.18, 0.18, 0.2, wires[5], { x: bx, y: T + 0.45, z: 0 }, 12))
  for (const c of [6, 8]) for (const s of [-1, 1]) g.add(noLine(rbox(0.06, 0.4, 0.05, PIN, { x: bbX(n, c), y: T - 0.25, z: s * 0.381 }, 0.01)))
  g.add(jumper(h(3, 10), h(3, 0), T, 0.6, wires[1]))
  g.add(jumper(h(25, 13), h(25, 9), T, 0.6, wires[9]))
  g.add(jumper(h(10, 2), h(10, 7), T, 0.9, wires[3]))
  g.add(jumper(h(8, 8), h(20, 8), T, 0.8, wires[4]))
  g.add(jumper(h(19, 11), h(19, 0), T, 0.1, wires[1]))
  g.add(jumper(h(20, 3), h(23, 3), T, 0.1, wires[5]))
  return g
}

const BB_PALS: Pal[] = [
  ['modern', '#f4f4f2', '#3a3a3c', '#ff4a3a'],
  ['industrial', '#2b2c30', '#3a3a3c', '#ffb43a'],
  ['cute', '#ffd6e0', '#ffffff', '#7ad0ff'],
  ['cute', '#cfe9ff', '#ffffff', '#ff7ab0'],
  ['retro', R.cream, '#3a3a3c', '#7cff6a'],
]

function pcbStack(p: string[]) {
  const [a, b] = p
  const g = new THREE.Group()
  const r = rng(5)
  for (let i = 0; i < 7; i++) g.add(rbox(10, PCB_T, 10, i % 3 === 2 ? b : a, { x: (r() - 0.5) * 0.6, y: i * PCB_T, z: (r() - 0.5) * 0.6, ry: (r() - 0.5) * 0.12 }, 0.05))
  g.add(rbox(10.06, PCB_T, 10.06, a, { y: 7 * PCB_T }, 0.05))
  g.add(paintTop(10, 10, `mk-pcb-${a}-61-10x10`, drawPcb(a, 61, isLight(a) ? '#3a3a3c' : '#ffffff'), 0, 8 * PCB_T + 0.05, 0))
  for (let i = 0; i < 4; i++) g.add(rbox(5, PCB_T, 7, b, { x: 9 + (r() - 0.5) * 0.4, y: i * PCB_T, z: 1 + (r() - 0.5) * 0.4, ry: 0.2 + (r() - 0.5) * 0.1 }, 0.05))
  g.add(rbox(5.06, PCB_T, 7.06, b, { x: 9, y: 4 * PCB_T, z: 1, ry: 0.2 }, 0.05))
  const pt = paintTop(5, 7, `mk-pcb-${b}-62-5x7`, drawPcb(b, 62, isLight(b) ? '#3a3a3c' : '#ffffff', 0.6), 0, 0, 0)
  g.add(P(G(pt), 9, 5 * PCB_T + 0.05, 1, 0, 0.2))
  return fit(g)
}

function smdReels(p: string[]) {
  const [flange, tape, rack] = p
  const g = new THREE.Group()
  const yc = 9.9
  g.add(rbox(8, 0.8, 9, rack, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(0.5, yc + 1, 3, rack, { x: s * 3.6, y: 0.8 }, 0.2))
  g.add(cylX(0.5, 7.6, CHROME, 0, yc, 0, 12))
  const cols = [flange, shade(flange, 0.12), flange, shade(flange, -0.1)]
  ;[-2.25, -0.75, 0.75, 2.25].forEach((x, i) => {
    for (const s of [-1, 1]) g.add(cylX(8.9, 0.12, cols[i], x + s * 0.58, yc, 0, 40))
    g.add(cylX(6.2 - i * 0.6, 1.0, tape, x, yc, 0, 32))
    g.add(cylX(1.4, 1.3, shade(cols[i], -0.15), x, yc, 0, 16))
  })
  for (const [i, x] of [[0, -2.25], [2, 0.75]] as const) {
    const rr = 6.2 - i * 0.6
    g.add(rbox(0.8, yc - 0.1, 0.05, tape, { x, y: 0.05, z: rr }, 0.02))
    g.add(rbox(0.8, 0.05, 5.5, tape, { x, y: 0, z: rr + 2.75 }, 0.02))
    for (let k = 0; k < 6; k++) g.add(noLine(rbox(0.3, 0.05, 0.3, '#3a3a3c', { x, y: 0.04, z: rr + 0.8 + k * 0.8 }, 0.02)))
  }
  return fit(g)
}
const REEL_PALS: Pal[] = [
  ['modern', '#3a7fd0', '#f4f4f2', '#3d3f44'],
  ['industrial', '#26272b', '#e8e2d8', I.iron],
  ['cute', '#ffb6c8', '#f4f4f2', C.white],
  ['modern', '#f4f4f2', '#2e2f33', M.silver],
]

function partsBox(p: string[]) {
  const [latch, tint] = p
  const g = new THREE.Group()
  const W = 19
  const D = 12
  const H = 3.2
  g.add(ghost(tray(W, H, D, 0.25, tint, {}, 0.3), tint, 0.4))
  const cw = (W - 0.5) / 6
  const cd = (D - 0.5) / 3
  for (let i = 1; i < 6; i++) g.add(ghost(rbox(0.12, H - 0.3, D - 0.5, tint, { x: -W / 2 + 0.25 + cw * i, y: 0.2 }, 0.05), tint, 0.4))
  for (let j = 1; j < 3; j++) g.add(ghost(rbox(W - 0.5, H - 0.3, 0.12, tint, { y: 0.2, z: -D / 2 + 0.25 + cd * j }, 0.05), tint, 0.4))
  const r = rng(17)
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const cx = -W / 2 + 0.25 + cw * (i + 0.5)
      const cz = -D / 2 + 0.25 + cd * (j + 0.5)
      const kind = (i + j * 6) % 4
      const col = PART_COLORS[Math.floor(r() * PART_COLORS.length)]
      const cnt = 5 + Math.floor(r() * 4)
      for (let k = 0; k < cnt; k++) {
        const x = cx + (r() - 0.5) * (cw - 1.0)
        const z = cz + (r() - 0.5) * (cd - 1.0)
        const y = 0.25
        if (kind === 0) g.add(noLine(P(cyl(0.11, 0.11, 0.6, '#e6c9a0', {}, 8), x, y + 0.11, z, 0, r() * PI, PI / 2)))
        else if (kind === 1) g.add(noLine(G(lit(cyl(0.25, 0.25, 0.45, col, { x, y, z }, 10), col, 0.25), lit(ball(0.25, col, { x, y: y + 0.45, z }), col, 0.25))))
        else if (kind === 2) g.add(noLine(cyl(0.3, 0.3, 0.8, k % 2 ? '#2b4fa0' : '#2b2b2b', { x, y, z }, 12)))
        else g.add(noLine(rbox(0.45, 0.35, 0.18, k % 2 ? CHIP : '#f2963a', { x, y, z, ry: r() * PI }, 0.05)))
      }
    }
  g.add(ghost(rbox(W, 0.25, D, tint, { y: H }, 0.2), tint, 0.3))
  for (const x of [-5, 5]) g.add(rbox(1.6, 1.4, 0.4, latch, { x, y: H - 0.9, z: D / 2 + 0.1 }, 0.15))
  g.add(rbox(W - 2, 0.6, 0.5, latch, { y: H - 0.2, z: -D / 2 - 0.15 }, 0.2))
  return fit(g)
}
const CASE_PALS: Pal[] = [
  ['modern', '#3a7fd0', GLASS],
  ['industrial', '#c46a3a', '#e8e2d8'],
  ['modern', M.char, '#dfe3e8'],
  ['cute', C.pink, '#fff0f4'],
  ['retro', R.teal, '#f4e7c8'],
]

/** 一排（10 根）杜邦线，沿给定的中心线平躺，两端杜邦头 */
function dupontRibbon(path: (o: number) => V3[], y: number, wires: string[], housing: string, male: boolean) {
  const g = new THREE.Group()
  wires.forEach((c, i) => {
    const o = (i - (wires.length - 1) / 2) * 0.27
    const pts = path(o).map(([x, , z]): V3 => [x, y, z])
    g.add(tube(pts, 0.08, c, false, 80))
    const [a, a2] = [pts[0], pts[1]]
    const [b, b2] = [pts[pts.length - 1], pts[pts.length - 2]]
    g.add(dupontHead(a[0], y + 0.125, a[2], Math.atan2(a[0] - a2[0], a[2] - a2[2]), male, housing))
    g.add(dupontHead(b[0], y + 0.125, b[2], Math.atan2(b[0] - b2[0], b[2] - b2[2]), true, housing))
  })
  return g
}
function dupontLying(p: string[]) {
  const [housing, tie, set] = p
  const wires = isLight(set) ? PASTEL : WIRES
  const g = new THREE.Group()
  const uPath =
    (L: number) =>
    (o: number): V3[] => {
      const Rr = 2.2 + o
      const arc = Array.from({ length: 7 }, (_, k): V3 => {
        const a = -PI / 2 + (k / 6) * PI
        return [6 + Math.cos(a) * Rr, 0, Math.sin(a) * Rr]
      })
      return [[-L, 0, -Rr], [-2, 0, -Rr], [3, 0, -Rr], ...arc, [3, 0, Rr], [-2, 0, Rr], [-L + 1.5, 0, Rr]]
    }
  g.add(dupontRibbon(uPath(8), 0.08, wires, housing, true))
  const top = dupontRibbon(uPath(6), 0.25, [...wires].reverse(), housing, false)
  top.rotation.y = 0.35
  top.position.set(0.5, 0, 0.3)
  g.add(top)
  g.add(rbox(0.6, 0.35, 6.4, tie, { x: 2, y: 0, z: 0 }, 0.12))
  return fit(g)
}
/** J 形钩（storage-forms 同款尺寸）：横臂 y = -2 沿 +z 伸出 L */
const J_ARM = -2
function jHook(L: number, color = METAL) {
  const r = 0.32
  return G(bar([0, J_ARM, -1], [0, J_ARM, L], r, color), bar([0, J_ARM, L], [0, -r, L], r, color), ball(r, color, { y: J_ARM, z: L }), ball(r, color, { y: -r, z: L }), cylZ(0.7, 0.3, color, 0, J_ARM, 0.15, 12))
}
function dupontHanging(p: string[]) {
  const [housing, tie, set] = p
  const wires = isLight(set) ? PASTEL : WIRES
  const g = new THREE.Group()
  const top = J_ARM + 0.32 + 0.08
  wires.forEach((c, i) => {
    const z = 1.0 + i * 0.27
    const lenL = 11 + (i % 3) * 0.6
    const lenR = 9 + (i % 4) * 0.5
    const pts: V3[] = [
      [-0.55, top - lenL, z],
      [-0.5, top - 3, z],
      [-0.4, top - 0.4, z],
      [0, top, z],
      [0.4, top - 0.4, z],
      [0.5, top - 3, z],
      [0.6, top - lenR, z],
    ]
    g.add(tube(pts, 0.08, c, false, 60))
    for (const [x, y, male] of [[-0.55, top - lenL, true], [0.6, top - lenR, i % 2 === 0]] as const) {
      const hd = new THREE.Group()
      hd.add(rbox(0.25, 1.4, 0.25, housing, { y: -1.4 }, 0.03))
      if (male) hd.add(noLine(rbox(0.07, 0.6, 0.07, PIN, { y: -2.0 }, 0.01)))
      hd.position.set(x, y, z)
      g.add(hd)
    }
  })
  g.add(rbox(1.5, 0.6, 3.2, tie, { y: top - 6, z: 2.2 }, 0.15))
  g.add(jHook(4.2))
  return g
}
const DUPONT_PALS: Pal[] = [
  ['modern', '#1e1e20', '#3a3a3c', '#3a3a3c'],
  ['industrial', '#1e1e20', I.rust, '#5a5a5a'],
  ['cute', '#f4f4f2', C.pink, '#ffffff'],
  ['retro', '#1e1e20', R.mustard, '#4a4a4a'],
]

function servoSet(p: string[]) {
  const [sv, tt, rim] = p
  const g = new THREE.Group()
  // SG90
  {
    const x = -6
    const z = -1
    g.add(rbox(2.3, 2.27, 1.22, sv, { x, z }, 0.12))
    g.add(rbox(3.2, 0.25, 1.22, sv, { x, y: 1.55, z }, 0.08))
    g.add(cyl(0.6, 0.6, 0.4, sv, { x: x + 0.55, y: 2.27, z }, 16))
    g.add(cyl(0.22, 0.22, 0.3, '#f4f4f2', { x: x + 0.55, y: 2.67, z }, 10))
    g.add(rbox(3.0, 0.16, 0.5, '#f4f4f2', { x: x + 0.55, y: 2.97, z }, 0.08))
    g.add(rbox(0.5, 0.16, 1.8, '#f4f4f2', { x: x + 0.55, y: 2.97, z }, 0.08))
    for (const [i, c] of ['#8a5a3a', '#e8453c', '#f2963a'].entries()) g.add(tube([[x - 1.15, 0.5, z - 0.15 + i * 0.15], [x - 2.0, 0.12, z + 0.2 + i * 0.15], [x - 2.4, 0.08, z + 2.0 + i * 0.15], [x - 1.6, 0.08, z + 3.2 + i * 0.15]], 0.06, c))
    g.add(rbox(0.8, 0.25, 1.4, '#1e1e20', { x: x - 1.3, y: 0, z: z + 4.0 }, 0.04))
  }
  // MG996R
  {
    const x = -1
    const z = -1.2
    g.add(rbox(4.0, 3.7, 2.0, '#2b2b2b', { x, z }, 0.15))
    g.add(rbox(5.4, 0.25, 2.0, '#2b2b2b', { x, y: 2.8, z }, 0.1))
    g.add(cyl(0.7, 0.7, 0.4, '#2b2b2b', { x: x + 1, y: 3.7, z }, 16))
    g.add(cyl(1.0, 1.0, 0.2, METAL, { x: x + 1, y: 4.1, z }, 20))
    for (const [i, c] of ['#8a5a3a', '#e8453c', '#f2963a'].entries()) g.add(tube([[x - 2.0, 0.6, z + 0.6 + i * 0.15], [x - 1.5, 0.1, z + 1.8 + i * 0.15], [x - 0.5, 0.08, z + 3.4 + i * 0.15]], 0.06, c))
    g.add(rbox(0.8, 0.25, 1.4, '#1e1e20', { x: x - 0.1, y: 0, z: z + 4.4 }, 0.04))
  }
  // TT 减速电机 + 轮子（轮子平放）
  {
    const x = 4.2
    g.add(rbox(2.2, 1.9, 6.4, tt, { x, z: -1 }, 0.2))
    g.add(cylZ(1.0, 2.6, METAL, x, 0.95 + 0.05, 3.5, 16))
    g.add(cylX(0.27, 4.4, '#f4f4f2', x, 0.95, -3.2, 10))
    g.add(puck(3.25, 2.6, RUBBER, { x: 9.5, z: 0 }))
    g.add(cyl(2.3, 2.3, 2.7, rim, { x: 9.5, y: -0.05, z: 0 }, 24))
    g.add(cyl(0.6, 0.6, 2.8, shade(rim, -0.15), { x: 9.5, y: -0.1, z: 0 }, 12))
  }
  return fit(g)
}
const SERVO_PALS: Pal[] = [
  ['modern', '#2f6db5', '#f2c230', '#f2c230'],
  ['industrial', '#26272b', '#e2a33a', '#3a3a3c'],
  ['cute', '#7ab8e8', C.lemon, C.pink],
  ['retro', R.teal, R.mustard, R.orange],
]

function robotCar(p: string[]) {
  const [plate, wheel, pcb] = p
  const g = new THREE.Group()
  // 轮 + TT 电机
  for (const s of [-1, 1]) {
    g.add(P(G(puck(3.25, 2.6, RUBBER), cyl(2.3, 2.3, 2.7, wheel, { y: -0.05 }, 24)), s > 0 ? 9.3 : -6.7, 3.25, 2.1, 0, 0, PI / 2))
    g.add(rbox(2.2, 1.9, 6.5, '#f2c230', { x: s * 5.5, y: 2.3, z: 3.75 }, 0.2))
    g.add(cylZ(1.0, 2.4, METAL, s * 5.5, 3.25, 8.2, 16))
    g.add(cylX(0.27, 2.0, '#f4f4f2', s * 6.9, 3.25, 2.1, 10))
  }
  g.add(rbox(13, 0.3, 20, plate, { y: 4.3 }, 0.15))
  g.add(cyl(0.9, 0.9, 2.5, METAL, { y: 1.8, z: -7.5 }, 14))
  g.add(ball(0.9, CHROME, { y: 0.9, z: -7.5 }))
  // 电池盒
  g.add(tray(5.9, 1.6, 6.4, 0.15, '#1e1e20', { y: 4.6, z: -4 }))
  for (let i = 0; i < 4; i++) g.add(aaBattery(-2.18 + i * 1.45, 4.6 + 0.15 + 0.72, -4, '#3a7fd0', '#f4f4f2'))
  // 电机驱动板
  g.add(rbox(4.3, 0.16, 4.3, '#c8473a', { y: 4.6, z: 5.5 }, 0.05))
  g.add(rbox(1.6, 2.2, 2.2, '#2b2b2b', { y: 4.76, z: 5.0 }, 0.1))
  for (let k = 0; k < 6; k++) g.add(noLine(rbox(1.6, 2.0, 0.1, '#3a3a3c', { y: 4.9, z: 4.0 + k * 0.4 }, 0.02)))
  for (const s of [-1, 1]) g.add(rbox(0.9, 0.9, 1.0, '#3a7fd0', { x: s * 1.6, y: 4.76, z: 7.0 }, 0.08))
  // 上层板 + 铜柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.25, 0.25, 3.0, BRASS, { x: sx * 5.5, y: 4.6, z: -1 + sz * 6 }, 8))
  g.add(rbox(13, 0.3, 14, plate, { y: 7.6, z: -1 }, 0.15))
  const ard = arduinoParts(pcb, HDR, '#e8453c')
  ard.position.set(0, 7.9, -1)
  g.add(ard)
  // 超声波模块
  g.add(rbox(2.0, 0.4, 1.0, '#1e1e20', { y: 4.6, z: 9.0 }, 0.08))
  g.add(rbox(4.5, 2.0, 0.16, '#2f6db5', { y: 5.0, z: 9.2 }, 0.05))
  for (const s of [-1, 1]) {
    g.add(cylZ(0.8, 1.2, METAL, s * 1.3, 6.0, 9.88, 18))
    g.add(noLine(cylZ(0.62, 0.06, '#3a3a3c', s * 1.3, 6.0, 10.5, 18)))
  }
  // 导线：驱动板 → Arduino 排母
  const wc = ['#e8453c', '#2b2b2b', '#f2d23a', '#4caf50', '#3a8ee8']
  wc.forEach((c, i) => {
    const x = -1.4 + i * 0.5
    g.add(tube([[x, 4.95, 6.6], [x, 6.6, 7.3], [x * 0.8, 9.8, 4.0], [x - 0.6, 10.2, 2.2], [x - 0.6, 9.15, 1.5]], 0.06, c))
  })
  g.add(tube([[-2.2, 6.2, -4], [-3.0, 7.0, 0], [-1.8, 5.2, 3.6], [-0.6, 4.95, 4.2]], 0.06, '#e8453c'))
  g.add(tube([[-1.8, 6.2, -4], [-2.5, 6.8, 0], [-1.4, 5.2, 3.6], [-0.2, 4.95, 4.2]], 0.06, '#2b2b2b'))
  return fit(g)
}
const CAR_PALS: Pal[] = [
  ['modern', '#3d3f44', '#f2c230', '#1f6fb2'],
  ['cute', '#ffb6c8', C.lemon, '#1f6fb2'],
  ['industrial', '#c46a3a', '#3a3a3c', '#2f7d4a'],
  ['modern', '#e8f2f8', '#f2c230', '#2a2b30'],
]

function ledStrip(p: string[]) {
  const [reel, strip, glowC] = p
  const g = new THREE.Group()
  const yc = 5
  for (const s of [-1, 1]) g.add(cylX(5, 0.15, reel, s * 0.65, yc, 0, 36))
  g.add(cylX(4.2, 1.1, strip, 0, yc, 0, 32))
  g.add(cylX(1.5, 1.3, shade(reel, -0.15), 0, yc, 0, 16))
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * PI * 2
    g.add(lit(P(rbox(0.5, 0.12, 0.45, glowC, {}, 0.04), 0, yc + Math.sin(a) * 4.27, Math.cos(a) * 4.27, PI / 2 - a), glowC, 0.5))
  }
  const t = 0.15
  const flat = sample2([[0, 5.5], [0.6, 10], [2.2, 15], [5.5, 19.5], [9.5, 21.8], [13.5, 22], [17, 20.5]], 0.8, t / 2)
  g.add(ribbon([[0, 0.8 + t / 2, 0], [0, 0.4, 2.8], [0, t / 2, 5.5], flat[0]], 1.0, t, strip))
  g.add(ribbon(flat, 1.0, t, strip))
  let acc = 0
  for (let i = 1; i < flat.length; i++) {
    const [ax, , az] = flat[i - 1]
    const [bx, , bz] = flat[i]
    acc += Math.hypot(bx - ax, bz - az)
    if (acc >= 1.6) {
      acc = 0
      g.add(lit(rbox(0.5, 0.14, 0.5, glowC, { x: bx, y: t, z: bz, ry: Math.atan2(bx - ax, bz - az) }, 0.04), glowC, 0.9))
    }
  }
  const e = flat[flat.length - 1]
  const e2 = flat[flat.length - 2]
  const dx = (e[0] - e2[0]) / Math.hypot(e[0] - e2[0], e[2] - e2[2])
  const dz = (e[2] - e2[2]) / Math.hypot(e[0] - e2[0], e[2] - e2[2])
  ;['#e8453c', '#f4f4f2', '#4caf50'].forEach((c, i) => {
    const o = (i - 1) * 0.25
    g.add(tube([[e[0] + dz * o, 0.1, e[2] - dx * o], [e[0] + dx * 1.5 + dz * o, 0.08, e[2] + dz * 1.5 - dx * o], [e[0] + dx * 3 + dz * o * 1.5, 0.08, e[2] + dz * 3 - dx * o * 1.5]], 0.07, c))
  })
  g.add(P(rbox(1.0, 0.5, 0.8, '#f4f4f2', {}, 0.08), e[0] + dx * 3.4, 0.0, e[2] + dz * 3.4, 0, Math.atan2(dx, dz)))
  return fit(g)
}
const STRIP_PALS: Pal[] = [
  ['modern', '#f4f4f2', '#f4f4f2', '#fff2b8'],
  ['cute', C.pink, '#f4f4f2', '#ff8fd8'],
  ['industrial', '#2e2f33', '#2e2f33', '#ffb43a'],
  ['modern', '#3d3f44', '#f4f4f2', '#7ad0ff'],
  ['retro', R.cream, '#f4f4f2', '#ff6a3a'],
]

function batteryBox(p: string[]) {
  const [box, wrap, band] = p
  const g = new THREE.Group()
  g.add(tray(6.3, 1.6, 6.0, 0.15, box, {}, 0.1))
  for (let i = 0; i < 4; i++) {
    const x = -2.18 + i * 1.45
    const bat = aaBattery(x, 0.15 + 0.72, 0, wrap, band)
    if (i % 2) bat.rotation.y = PI
    if (i % 2) bat.position.x = 2 * x
    g.add(bat)
  }
  for (const s of [-1, 1]) g.add(noLine(rbox(5.8, 1.1, 0.06, METAL, { y: 0.3, z: s * 2.83 }, 0.02)))
  g.add(tube([[-2.6, 0.9, -3.0], [-3.2, 0.35, -4.4], [-1.5, 0.08, -6.5], [1.8, 0.08, -7.2], [4.2, 0.08, -6.0]], 0.07, '#e8453c'))
  g.add(tube([[-2.2, 0.9, -3.0], [-2.7, 0.35, -4.1], [-1.2, 0.08, -5.8], [1.8, 0.08, -6.3], [4.4, 0.08, -5.2]], 0.07, '#2b2b2b'))
  for (const [x, z] of [[4.2, -6.0], [4.4, -5.2]]) g.add(noLine(cylX(0.04, 0.6, SOLDER, x + 0.3, 0.08, z, 6)))
  g.add(P(aaBattery(0, 0.72, 0, wrap, band), -1.0, 0, 5.0, 0, PI / 2 - 0.2))
  g.add(P(aaBattery(0, 0.72, 0, wrap, band), 2.4, 0, 4.4, 0, PI / 2 + 0.3))
  return fit(g)
}
const BATT_PALS: Pal[] = [
  ['modern', '#26272b', '#2f5fb5', '#f4f4f2'],
  ['industrial', '#26272b', '#2b2b2b', '#f2963a'],
  ['cute', '#f4f4f2', '#ffb6c8', '#ffffff'],
  ['retro', '#26272b', R.red, R.mustard],
]

function cell18650(x: number, y: number, z: number, wrap: string, standing: boolean) {
  const len = 6.5
  const r = 0.9
  if (standing)
    return G(cyl(r, r, len, wrap, { x, y, z }, 20), noLine(cyl(r * 0.85, r * 0.85, 0.05, '#f4f4f2', { x, y: y + len, z }, 18)), cyl(r * 0.4, r * 0.4, 0.12, METAL, { x, y: y + len, z }, 12))
  return G(cylZ(r, len, wrap, x, y, z, 20), cylZ(r * 0.4, 0.12, METAL, x, y, z + len / 2 + 0.05, 12), noLine(cylZ(r * 0.85, 0.05, '#f4f4f2', x, y, z + len / 2 - 0.01, 18)))
}
function charger18650(p: string[]) {
  const [body, w1, w2] = p
  const g = new THREE.Group()
  g.add(rbox(7.6, 1.6, 10, body, {}, 0.5))
  for (const x of [-3.6, 0, 3.6]) g.add(rbox(0.4, 0.9, 8.6, shade(body, -0.08), { x, y: 1.6, z: -0.3 }, 0.15))
  for (const [i, x] of [-1.8, 1.8].entries()) {
    g.add(cell18650(x, 1.6 + 0.9 - 0.3, -0.6, i ? w2 : w1, false))
    g.add(rbox(1.4, 1.4, 0.8, '#9a9da3', { x, y: 1.4, z: 3.5 }, 0.15))
  }
  g.add(rbox(6.8, 0.2, 1.3, '#1e1e20', { y: 1.6, z: 4.25 }, 0.08))
  g.add(paintTop(6.2, 1.0, 'mk-chg-lcd', drawSeg('4.18V  4.20V', '#7ad0ff', '#0a1a2a'), 0, 1.85, 4.25, 0.8))
  g.add(cell18650(6.6, 0, -2.2, w1, true))
  g.add(cell18650(8.5, 0, -2.2, w2, true))
  g.add(P(cell18650(0, 0, 0, w2, false), 7.6, 0.9, 2.6, 0, 0.5))
  return fit(g)
}
const CELL_PALS: Pal[] = [
  ['modern', '#d7d8db', '#2f5fb5', '#3a9a5a'],
  ['industrial', '#3a3a3c', '#7a3fa0', '#2b2b2b'],
  ['cute', C.white, C.pink, C.sky],
  ['retro', R.cream, R.teal, R.orange],
]

function oledModule(p: string[]) {
  const [bbColor, pcbColor, glowC] = p
  const g = new THREE.Group()
  const n = 17
  const T = bbBody(g, n, 4.6, bbColor, false)
  const z = bbZ(2)
  for (let c = 7; c <= 10; c++) g.add(noLine(rbox(0.07, 0.95, 0.07, GOLD, { x: bbX(n, c), y: T - 0.25, z }, 0.01)))
  g.add(rbox(4 * BB_P, 0.25, BB_P, HDR, { x: (bbX(n, 7) + bbX(n, 10)) / 2, y: T + 0.45, z }, 0.04))
  const by = T + 0.7
  g.add(rbox(2.7, 2.8, PCB_T, pcbColor, { y: by, z: z - 0.05 }, 0.05))
  g.add(rbox(2.6, 1.7, 0.12, '#111216', { y: by + 0.7, z: z + 0.09 }, 0.04))
  g.add(paintPanel(2.3, 1.25, `mk-oled-${glowC}`, drawOled(glowC), { y: by + 0.92, z: z + 0.2 }, 0.95))
  for (const [i, c] of ['#2b2b2b', '#e8453c', '#f2d23a', '#3a8ee8'].entries()) g.add(jumper([bbX(n, 7 + i), bbZ(4)], [bbX(n, 3 + i * 3), bbZ(8)], T, 0.5 + i * 0.12, c))
  return fit(g)
}
const OLED_PALS: Pal[] = [
  ['modern', '#f4f4f2', '#1f6fb2', '#7ad0ff'],
  ['industrial', '#2b2c30', '#2a2b30', '#ffd23a'],
  ['cute', '#ffd6e0', '#9b6fd0', '#ffffff'],
  ['retro', R.cream, '#1f6fb2', '#7cff8a'],
]

// ======================================================================
// 仪器 / 工具
// ======================================================================

function solderStation(p: string[]) {
  const [unit, holder, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(10, 9, 15, unit, { x: -7, z: -1 }, 0.8))
  g.add(rbox(8.6, 6.4, 0.3, '#232428', { x: -7, y: 1.3, z: 6.55 }, 0.2))
  g.add(paintPanel(4.6, 2.0, `mk-seg-350-${glowC}`, drawSeg('350', glowC, '#160c0a', '°C'), { x: -7, y: 5.0, z: 6.75 }, 0.9))
  g.add(cylZ(1.1, 1.0, '#2b2b2b', -8.4, 3.0, 7.2, 20))
  g.add(noLine(rbox(0.2, 0.8, 0.1, '#f4f4f2', { x: -8.4, y: 3.2, z: 7.75 }, 0.04)))
  g.add(rbox(0.8, 1.2, 0.4, '#e8453c', { x: -4.6, y: 2.2, z: 6.8 }, 0.1))
  g.add(cylZ(0.6, 0.6, METAL, -5.0, 4.0, 6.95, 14))
  // 烙铁架
  g.add(rbox(8, 1.2, 12, holder, { x: 5, z: 0 }, 0.4))
  g.add(tray(5, 0.8, 4.5, 0.2, shade(holder, -0.1), { x: 5, y: 1.2, z: 3.3 }))
  g.add(rbox(4.4, 0.6, 3.9, '#f2c230', { x: 5, y: 1.4, z: 3.3 }, 0.15))
  const A: V3 = [5, 4.0, -4.2]
  const dir = new THREE.Vector3(0, 5, 5.5).normalize()
  const at = (k: number): V3 => [A[0], A[1] + dir.y * k, A[2] + dir.z * k]
  const coil = orient(G(tube(helix(1.3, 0.55, 12), 0.1, CHROME, false, 300)), A, at(1))
  g.add(coil)
  g.add(bar([5, 1.2, -4.2], A, 0.35, holder))
  g.add(bar([5, 1.2, -0.5], at(4.5), 0.25, holder))
  // 烙铁
  g.add(orient(G(cyl(0.25, 0.1, 1.4, '#9a9da3', {}, 10), cyl(0.25, 0.25, 4.5, CHROME, { y: 1.4 }, 10), cyl(0.55, 0.45, 0.8, '#2b2b2b', { y: 5.9 }, 14), capsule(0.7, 6.5, unit, { y: 6.5 }), cyl(0.35, 0.5, 1.4, '#2b2b2b', { y: 14.0 }, 12)), at(0.5), at(2)))
  const end = at(16)
  g.add(tube([end, [5, end[1] + 0.3, end[2] + 1.8], [3.5, 6, 11], [0, 0.3, 10.8], [-4, 0.4, 9.2], [-5.0, 2.5, 7.8], [-5.0, 4.0, 7.3]], 0.2, '#2b2b2b'))
  return fit(g)
}
const STATION_PALS: Pal[] = [
  ['industrial', I.iron, I.steel, '#ff8c3a'],
  ['modern', '#3d3f44', M.black, '#ff4a3a'],
  ['retro', '#2f6db5', '#f2c230', '#7cff6a'],
  ['cute', C.pink, '#f4f4f2', '#7ad0ff'],
  ['modern', M.white, M.char, '#5ac8fa'],
]

function hotAirStation(p: string[]) {
  const [unit, gun, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(14, 10, 18, unit, { x: -3 }, 0.8))
  g.add(rbox(12.6, 7.6, 0.3, '#232428', { x: -3, y: 1.2, z: 9.0 }, 0.2))
  g.add(paintPanel(4.4, 1.8, `mk-seg-320-${glowC}`, drawSeg('320', glowC, '#160c0a', '°C'), { x: -6, y: 6.0, z: 9.2 }, 0.9))
  g.add(paintPanel(4.4, 1.8, `mk-seg-45-${glowC}`, drawSeg('45', '#7cff8a', '#08140a', '%'), { x: 0, y: 6.0, z: 9.2 }, 0.9))
  for (const x of [-6, 0]) g.add(cylZ(1.0, 1.0, '#2b2b2b', x, 3.5, 9.6, 20))
  g.add(rbox(1.0, 1.4, 0.4, '#e8453c', { x: 2.4, y: 2.0, z: 9.25 }, 0.1))
  g.add(cylZ(0.9, 0.6, '#3a3a3c', 1.0, 2.2, 9.3, 16))
  // 风枪架 + 风枪
  g.add(rbox(4.5, 1, 12, unit, { x: 7.6 }, 0.3))
  for (const z of [-4, 3]) {
    g.add(rbox(1, 5.5, 1, unit, { x: 7.6, y: 1, z }, 0.2))
    g.add(rbox(4, 1.2, 1, unit, { x: 7.6, y: 5.6, z }, 0.3))
  }
  const gy = 6.5 + 1.7
  g.add(cylZ(1.7, 13, gun, 7.6, gy, -0.5, 24))
  for (const z of [-3, -1.5]) g.add(cylZ(1.78, 0.5, '#2b2b2b', 7.6, gy, z, 24))
  g.add(cylZ(1.5, 1.0, '#2b2b2b', 7.6, gy, -7.3, 20))
  g.add(cylZ(0.75, 2.4, METAL, 7.6, gy, 7.2, 16))
  g.add(cylZ(0.45, 1.6, CHROME, 7.6, gy, 9.2, 12))
  g.add(tube([[7.6, gy, -7.8], [7.6, gy - 0.6, -10.2], [10.6, 3.2, -8.5], [11.3, 1.0, 0], [9.2, 0.6, 10.5], [4.0, 0.8, 11.8], [1.0, 2.2, 9.5]], 0.45, '#5a5d63'))
  return fit(g)
}

function desolderPump(p: string[]) {
  const [body, btn, grip] = p
  const g = new THREE.Group()
  g.add(cylZ(1.0, 13, body, 0, 1.0, 0, 20))
  g.add(cylZ(1.06, 4.0, grip, 0, 1.0, -2.5, 20))
  g.add(P(cyl(0.3, 0.75, 3, '#f4f4f2', {}, 16), 0, 1.0, 8.0, PI / 2))
  g.add(cylZ(1.05, 0.6, shade(body, -0.15), 0, 1.0, 6.3, 20))
  g.add(cylZ(1.1, 0.8, shade(body, -0.15), 0, 1.0, -6.9, 20))
  g.add(cylZ(0.25, 3.5, CHROME, 0, 1.0, -9.0, 10))
  g.add(cylZ(0.9, 1.0, grip, 0, 1.0, -11.2, 18))
  g.add(rbox(0.8, 0.6, 1.4, btn, { y: 1.8, z: 2.5 }, 0.2))
  return fit(g)
}
const PUMP_PALS: Pal[] = [
  ['modern', M.silver, '#e8453c', M.black],
  ['industrial', '#3a7fd0', '#2b2b2b', '#2b2b2b'],
  ['cute', '#ffb6c8', C.white, '#9b6fd0'],
  ['retro', R.teal, R.mustard, '#3a3a3c'],
]

function solderSpool(p: string[]) {
  const [stand, flange, label] = p
  const g = new THREE.Group()
  g.add(rbox(8, 0.9, 6, stand, {}, 0.3))
  for (const s of [-1, 1]) g.add(rbox(0.6, 5.5, 1.4, stand, { x: s * 3.5, y: 0.9 }, 0.2))
  const yc = 5.8
  g.add(cylX(0.25, 7.6, CHROME, 0, yc, 0, 10))
  for (const s of [-1, 1]) g.add(cylX(3.0, 0.15, flange, s * 1.6, yc, 0, 36))
  g.add(cylX(2.4, 3.05, SOLDER, 0, yc, 0, 32))
  g.add(paintPanel(3.6, 3.6, `mk-spool-${flange}-${label}`, drawRoundTag(flange, label, 'Sn63', 'Ø0.8mm 250g'), { x: 1.69, y: yc - 1.8, ry: PI / 2 }))
  g.add(rbox(1.2, 0.9, 0.9, stand, { x: 0.5, y: 0.9, z: 2.55 }, 0.2))
  g.add(cylZ(0.25, 1.0, METAL, 0.5, 2.0, 2.6, 10))
  g.add(tube([[0.5, yc, 2.4], [0.5, 4.2, 2.7], [0.5, 2.6, 2.4], [0.5, 2.0, 2.0], [0.5, 2.0, 3.2], [0.6, 1.4, 4.6], [1.0, 0.06, 6.0], [2.6, 0.06, 6.8]], 0.05, SOLDER, false, 60))
  return fit(g)
}
const SPOOL_PALS: Pal[] = [
  ['industrial', I.iron, '#2f7d4a', '#ffffff'],
  ['modern', M.char, '#e8453c', '#ffffff'],
  ['cute', C.white, C.pink, '#ffffff'],
  ['retro', R.caramel, R.mustard, '#3a2a1a'],
]

function fluxSet(p: string[]) {
  const [tin, pen, label] = p
  const g = new THREE.Group()
  g.add(cup(2.5, 2.5, 1.6, 0.12, tin, { x: -3, z: -1 }))
  g.add(cyl(2.36, 2.36, 1.1, '#d9a441', { x: -3, y: 0.12, z: -1 }, 28))
  g.add(cyl(2.6, 2.6, 0.5, tin, { x: 3, z: -1.5 }, 32))
  g.add(paintTop(3.8, 3.8, `mk-flux-${tin}-${label}`, drawRoundTag(label, '#ffffff', 'FLUX', 'NO-CLEAN  RMA'), 3, 0.55, -1.5))
  g.add(P(capsule(0.55, 8, pen), -1, 0.55, 3.0, 0, 0, PI / 2))
  g.add(P(cyl(0.3, 0.5, 1.0, '#f4f4f2', {}, 12), 3.85, 0.55, 3.0, 0, 0, -PI / 2))
  g.add(cylX(0.5, 7, '#f2d9a0', -0.5, 0.5, 5.2, 16))
  g.add(cylX(0.62, 0.3, '#f4f4f2', -4.1, 0.62, 5.2, 16))
  g.add(cylX(0.12, 2.5, '#f4f4f2', -5.4, 0.5, 5.2, 8))
  g.add(cylX(0.45, 0.2, '#f4f4f2', -6.7, 0.5, 5.2, 12))
  g.add(P(cyl(0.12, 0.35, 1.6, '#3a8ee8', {}, 10), 3.8, 0.5, 5.2, 0, 0, -PI / 2))
  return fit(g)
}
const FLUX_PALS: Pal[] = [
  ['industrial', METAL, '#2f7d4a', '#2f7d4a'],
  ['modern', '#3d3f44', '#3a7fd0', '#3a7fd0'],
  ['cute', '#f4f4f2', C.pink, '#e86a9a'],
  ['retro', R.mustard, R.red, R.red],
]

function helpingHands(p: string[]) {
  const [base, rodC, clipC] = p
  const g = new THREE.Group()
  g.add(rbox(15, 1.8, 9, base, {}, 0.6))
  for (const s of [-1, 1]) {
    g.add(cyl(0.35, 0.35, 7.2, rodC, { x: s * 5.5, y: 1.8 }, 10))
    g.add(ball(0.6, rodC, { x: s * 5.5, y: 9, z: 0 }))
    g.add(bar([s * 5.5, 9, 0], [s * 4.0, 10.9, 0.8], 0.3, rodC))
    g.add(ball(0.45, rodC, { x: s * 4.0, y: 10.9, z: 0.8 }))
    // 鳄鱼夹夹住 PCB 边
    g.add(rbox(2.3, 0.18, 0.55, clipC, { x: s * 2.85, y: 10.98, z: 0.8, rz: s * 0.08 }, 0.05))
    g.add(rbox(2.3, 0.18, 0.55, clipC, { x: s * 2.85, y: 10.62, z: 0.8, rz: -s * 0.08 }, 0.05))
    g.add(cylZ(0.25, 0.7, METAL, s * 3.85, 10.88, 0.8, 10))
  }
  g.add(rbox(4.4, PCB_T, 3.2, '#2f7d4a', { y: 10.8, z: 0.8 }, 0.04))
  g.add(paintTop(4.3, 3.1, 'mk-pcb-hh', drawPcb('#2f7d4a', 71, '#ffffff', 0.5), 0, 10.81 + PCB_T, 0.8))
  g.add(chip(1.0, 1.0, 0.5, 11.01, 0.8, 6, 6))
  g.add(cyl(0.35, 0.35, 15.5, rodC, { y: 1.8, z: -3 }, 10))
  g.add(ball(0.6, rodC, { y: 17.3, z: -3 }))
  const lens = G(torus(4.5, 0.35, rodC), ghost(P(cyl(4.3, 4.3, 0.25, GLASS, {}, 32), 0, 0, 0, PI / 2), GLASS, 0.35))
  lens.position.set(0, 17.8, 2.6)
  lens.rotation.x = -PI / 4
  g.add(lens)
  g.add(bar([0, 17.3, -3], [0, 17.8 + 3.18, 2.6 - 3.18], 0.3, rodC))
  return fit(g)
}
const HH_PALS: Pal[] = [
  ['industrial', I.iron, CHROME, '#e8453c'],
  ['modern', M.char, M.silver, '#2b2b2b'],
  ['cute', C.sky, CHROME, C.pink],
  ['retro', R.red, CHROME, R.mustard],
]

function multimeter(p: string[]) {
  const [boot, face, acc] = p
  const g = new THREE.Group()
  g.add(tray(9.4, 3.8, 18.6, 0.6, boot, {}, 0.5))
  g.add(rbox(8.2, 3.4, 17.4, face, {}, 0.3))
  g.add(paintTop(8.0, 17.2, `mk-meter-${face}-${acc}`, drawMeterFace(face, acc, 0.55), 0, 3.45, 0))
  g.add(rbox(6.8, 0.15, 3.4, '#1e1e20', { y: 3.4, z: -5.6 }, 0.08))
  g.add(paintTop(6.2, 2.8, 'mk-meter-lcd', drawMeterLcd, 0, 3.6, -5.6, 0.45))
  for (let i = 0; i < 4; i++) g.add(rbox(1.3, 0.3, 0.7, i === 0 ? acc : '#5a5d63', { x: -2.4 + i * 1.6, y: 3.4, z: -2.9 }, 0.12))
  g.add(cyl(2.2, 2.2, 0.6, '#2b2b2b', { y: 3.4, z: 0.9 }, 28))
  g.add(rbox(0.6, 0.5, 3.6, '#3a3a3c', { y: 4.0, z: 0.9, ry: 0.5 }, 0.15))
  g.add(noLine(rbox(0.15, 0.1, 1.4, '#f4f4f2', { x: -0.45, y: 4.5, z: 0.1, ry: 0.5 }, 0.03)))
  const jx = [-3, -1, 1, 3]
  jx.forEach((x, i) => {
    g.add(cyl(0.45, 0.45, 0.15, i === 2 ? '#e8453c' : i === 1 ? '#2b2b2b' : '#e8453c', { x, y: 3.4, z: 6.6 }, 14))
    g.add(noLine(cyl(0.22, 0.22, 0.16, '#0c0c0e', { x, y: 3.42, z: 6.6 }, 10)))
  })
  // 表笔
  for (const [jx0, col, px, ang] of [[1, '#e8453c', 8.0, 0.08], [-1, '#2b2b2b', 9.9, -0.05]] as const) {
    g.add(cyl(0.4, 0.35, 1.3, col, { x: jx0, y: 3.5, z: 6.6 }, 12))
    const probe = G(P(capsule(0.45, 8, col), 0, 0.45, 0, PI / 2), cylZ(0.75, 0.25, col, 0, 0.45, -3.2, 14), P(cyl(0.05, 0.12, 2.6, CHROME, {}, 8), 0, 0.45, -5.6, -PI / 2))
    probe.position.set(px, 0, -1.5)
    probe.rotation.y = ang
    g.add(probe)
    const tail = new THREE.Vector3(0, 0.45, 4.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(probe.position)
    g.add(tube([[jx0, 4.8, 6.6], [jx0 + 0.6, 5.6, 7.8], [4.5, 2.6, 10.2], [px + 0.4, 0.3, 9.4], [tail.x, 0.45, tail.z + 0.6], [tail.x, 0.45, tail.z]], 0.16, col))
  }
  return fit(g)
}
const METER_PALS: Pal[] = [
  ['industrial', '#f2c230', '#3d3f44', '#e8453c'],
  ['modern', '#e8453c', '#2e2f33', '#f2c230'],
  ['modern', '#3d3f44', '#2e2f33', '#5ac8fa'],
  ['cute', C.mint, '#4a4d55', C.pink],
  ['retro', R.orange, '#3a3a3c', R.mustard],
]

function oscilloscope(p: string[]) {
  const [body, panel, trace] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.4, 1.0, 1.6, RUBBER, { x: sx * 13, z: sz * 4.5 }, 0.3))
  g.add(rbox(31, 15, 12, body, { y: 1.0 }, 1.2))
  g.add(rbox(30.2, 14.2, 0.4, panel, { y: 1.4, z: 6.1 }, 0.5))
  g.add(rbox(18, 11.4, 0.3, '#111216', { x: -5.5, y: 3.0, z: 6.35 }, 0.3))
  g.add(paintPanel(17, 10.5, `mk-scope-${trace}`, drawScope(trace), { x: -5.5, y: 3.45, z: 6.6 }, 0.9))
  for (const [x, y, r] of [[5.6, 12.8, 0.6], [8.2, 12.8, 0.6], [11, 12.8, 0.6], [13.6, 12.8, 0.6], [6.2, 9.4, 1.0], [10.2, 9.4, 1.0], [14, 9.4, 0.8]] as const) {
    g.add(cylZ(r, 1.0, '#2b2b2b', x, y, 6.75, 18))
    g.add(noLine(rbox(0.12, r * 0.8, 0.1, '#f4f4f2', { x, y: y + r * 0.1, z: 7.27 }, 0.03)))
  }
  const btnC = ['#f2d23a', '#5ad8ff', '#e85ad8', '#5a8af2']
  for (let i = 0; i < 4; i++) g.add(rbox(1.1, 0.7, 0.4, btnC[i], { x: 4.8 + i * 2.6, y: 5.6, z: 6.4 }, 0.15))
  for (let i = 0; i < 6; i++) g.add(rbox(1.1, 0.6, 0.4, '#5a5d63', { x: 4.8 + (i % 3) * 2.2, y: 7.0 + Math.floor(i / 3) * 3.6 - (i >= 3 ? 0 : 0), z: 6.4 }, 0.15))
  for (let i = 0; i < 5; i++) g.add(rbox(1.3, 0.55, 0.3, '#5a5d63', { x: 3.9, y: 4.2 + i * 2.1, z: 6.35 }, 0.12))
  const bnc = [4.6, 7.4, 10.2, 13]
  bnc.forEach((x) => {
    g.add(cylZ(0.6, 1.2, METAL, x, 2.6, 6.9, 16))
    g.add(cylZ(0.75, 0.2, '#3a3a3c', x, 2.6, 6.4, 16))
  })
  g.add(rbox(1.2, 0.8, 0.4, '#e8453c', { x: -14, y: 2.0, z: 6.4 }, 0.15))
  // 探头
  for (const [i, x0, pz, col] of [[0, 4.6, 13.6, btnC[0]], [1, 7.4, 16.0, btnC[1]]] as const) {
    g.add(cylZ(0.45, 0.6, '#2b2b2b', x0, 2.6, 7.7, 12))
    const px = -9 + i * 1.5
    g.add(P(capsule(0.5, 6.5, '#3a3a3c'), px, 0.5, pz, 0, 0, PI / 2))
    g.add(cylX(0.55, 0.3, col, px + 2.6, 0.55, pz, 14))
    g.add(P(cyl(0.08, 0.3, 1.8, CHROME, {}, 8), px - 4.6, 0.5, pz, 0, 0, PI / 2))
    g.add(tube([[x0, 2.6, 8.0], [x0 + 0.3, 1.6, 9.6], [x0 - 1.5, 0.3, pz - 1.0], [px + 6, 0.3, pz + 0.2], [px + 4.2, 0.5, pz]], 0.15, '#2b2b2b'))
  }
  return fit(g)
}
const SCOPE_PALS: Pal[] = [
  ['modern', M.light, M.char, '#5cff7a'],
  ['modern', M.black, '#2e2f33', '#5cff7a'],
  ['industrial', '#5a6068', '#2e2f33', '#ffd23a'],
  ['retro', R.cream, '#4a5a5a', '#ffb43a'],
  ['cute', C.white, '#9fc9ea', '#7cff9a'],
]

function benchPsu(p: string[]) {
  const [body, panel, knob] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.6, 1.0, 1.6, RUBBER, { x: sx * 5, z: sz * 10.5 }, 0.3))
  g.add(rbox(13, 15, 25, body, { y: 1.0 }, 0.8))
  g.add(rbox(12.4, 14.4, 0.3, panel, { y: 1.3, z: 12.55 }, 0.4))
  g.add(paintPanel(7.2, 2.5, 'mk-psu-v', drawSeg('12.00', '#ff4a3a', '#160a0a', 'V'), { x: -2.0, y: 11.6, z: 12.85 }, 0.9))
  g.add(paintPanel(7.2, 2.5, 'mk-psu-a', drawSeg('0.523', '#7cff6a', '#0a160a', 'A'), { x: -2.0, y: 8.4, z: 12.85 }, 0.9))
  for (const y of [12.6, 9.4]) {
    g.add(cylZ(1.0, 1.0, knob, 4.1, y, 13.2, 20))
    g.add(noLine(rbox(0.15, 0.7, 0.1, '#f4f4f2', { x: 4.1, y: y + 0.1, z: 13.72 }, 0.03)))
  }
  for (const [x, col] of [[-3, '#e8453c'], [0, '#2b2b2b'], [3, '#4caf50']] as const) {
    g.add(cylZ(0.75, 0.3, '#3a3a3c', x, 3.6, 12.85, 16))
    g.add(cylZ(0.55, 1.2, col, x, 3.6, 13.5, 16))
  }
  g.add(rbox(1.2, 1.2, 0.4, '#e8453c', { x: -4.8, y: 5.6, z: 12.75 }, 0.15))
  for (const [x, col, ex, ez] of [[-3, '#e8453c', -5.5, 21.5], [0, '#2b2b2b', 2.2, 21.8]] as const) {
    g.add(tube([[x, 3.6, 14.1], [x, 3.0, 15.0], [x * 0.9 + (ex - x) * 0.3, 0.8, 16.8], [(x + ex) / 2, 0.3, 19], [ex, 0.32, ez - 1.2]], 0.15, col))
    g.add(gator(ex, 0, ez - 1.3, col))
  }
  return fit(g)
}
const PSU_PALS: Pal[] = [
  ['industrial', '#3a3a3c', '#26272b', '#2b2b2b'],
  ['modern', M.light, M.char, '#2b2b2b'],
  ['retro', R.cream, '#4a4a46', R.orange],
  ['cute', C.white, '#5a6f8a', C.pink],
]

function sigGen(p: string[]) {
  const [body, panel, knob] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2, 1.0, 1.6, RUBBER, { x: sx * 9.5, z: sz * 11 }, 0.3))
  g.add(rbox(23, 9.5, 26, body, { y: 1.0 }, 0.8))
  g.add(rbox(22.4, 8.9, 0.3, panel, { y: 1.3, z: 13.05 }, 0.4))
  g.add(rbox(10.8, 6.6, 0.25, '#111216', { x: -5.2, y: 2.8, z: 13.3 }, 0.2))
  g.add(paintPanel(10, 6, 'mk-siglcd', drawSigLcd, { x: -5.2, y: 3.1, z: 13.5 }, 0.8))
  for (let i = 0; i < 5; i++) g.add(rbox(1.6, 0.6, 0.35, '#5a5d63', { x: -9.4 + i * 2.1, y: 1.9, z: 13.3 }, 0.12))
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.add(rbox(0.9, 0.7, 0.35, j === 3 ? knob : '#5a5d63', { x: 1.5 + i * 1.2, y: 2.6 + j * 1.3, z: 13.3 }, 0.12))
  g.add(cylZ(1.3, 1.1, '#2b2b2b', 8.6, 7.4, 13.75, 22))
  g.add(noLine(rbox(0.15, 1.0, 0.1, '#f4f4f2', { x: 8.6, y: 7.7, z: 14.33 }, 0.03)))
  for (const x of [7.4, 9.8]) {
    g.add(cylZ(0.6, 1.2, METAL, x, 3.0, 13.8, 16))
    g.add(cylZ(0.75, 0.2, '#3a3a3c', x, 3.0, 13.3, 16))
  }
  g.add(rbox(1.0, 1.0, 0.4, knob, { x: 7.4, y: 4.6, z: 13.3 }, 0.15))
  return fit(g)
}

function logicAnalyzer(p: string[]) {
  const [body, label] = p
  const g = new THREE.Group()
  g.add(rbox(5.5, 1.6, 5.5, body, {}, 0.4))
  g.add(paintTop(4.6, 3.0, `mk-la-${body}-${label}`, drawTag(body, label, ['LOGIC', '8CH 24MHz']), 0, 1.65, -0.6))
  g.add(rbox(2.8, 0.6, 0.6, '#1e1e20', { y: 0.5, z: 3.0 }, 0.08))
  WIRES.forEach((c, i) => {
    const xs = -1.2 + i * 0.27
    const xe = -6 + i * 1.35
    const ze = 9.5 + (i % 3) * 1.4
    g.add(tube([[xs, 0.8, 3.25], [xs, 0.6, 4.6], [xs + (xe - xs) * 0.5, 0.1, 6.8], [xe, 0.1, ze - 1.6], [xe, 0.3, ze - 0.5]], 0.07, c))
    g.add(P(capsule(0.3, 1.4, c), xe, 0.3, ze + 0.5, PI / 2))
    g.add(P(cyl(0.05, 0.12, 0.8, CHROME, {}, 6), xe, 0.3, ze + 1.9, PI / 2))
  })
  g.add(tube([[0, 0.8, -2.8], [0, 0.4, -4.6], [2.2, 0.15, -7.4], [4.4, 0.15, -8.2]], 0.15, '#2b2b2b'))
  g.add(P(rbox(1.2, 0.6, 1.8, '#2b2b2b', {}, 0.15), 5.4, 0.0, -8.5, 0, PI / 2 - 0.3))
  return fit(g)
}
const LA_PALS: Pal[] = [
  ['modern', '#c8473a', '#ffffff'],
  ['modern', M.black, '#f2c230'],
  ['industrial', M.silver, '#2b2b2b'],
  ['cute', '#7ab8e8', '#ffffff'],
]

function usbMicroscope(p: string[]) {
  const [base, scope, glowC] = p
  const g = new THREE.Group()
  g.add(rbox(12, 1.2, 14, base, {}, 0.4))
  g.add(paintTop(10, 1.2, 'mk-ruler-mm', drawRuler('#f4f4f2', '#2b2b2b'), 0, 1.25, 6.0))
  g.add(cyl(0.6, 0.6, 18, CHROME, { y: 1.2, z: -5 }, 12))
  g.add(rbox(2.2, 2.4, 2.6, base, { y: 12, z: -5 }, 0.3))
  g.add(rbox(1.6, 1.4, 4.0, base, { y: 12.5, z: -2.4 }, 0.3))
  g.add(cyl(2.0, 2.0, 2.4, base, { y: 12, z: 0 }, 22))
  g.add(cyl(1.7, 1.7, 10, scope, { y: 6.5, z: 0 }, 22))
  g.add(cyl(1.9, 1.9, 1.2, '#3a3a3c', { y: 9.0, z: 0 }, 22))
  g.add(cyl(1.75, 1.6, 0.6, '#2b2b2b', { y: 5.9, z: 0 }, 22))
  g.add(lit(P(torus(1.15, 0.18, glowC), 0, 5.92, 0, PI / 2), glowC, 0.9))
  g.add(noLine(cyl(0.6, 0.6, 0.05, '#4a6a8a', { y: 5.88, z: 0 }, 16)))
  g.add(rbox(4.4, PCB_T, 3.2, '#2f7d4a', { y: 1.2, z: 0 }, 0.04))
  g.add(paintTop(4.3, 3.1, 'mk-pcb-micro', drawPcb('#2f7d4a', 73, '#ffffff', 0.5), 0, 1.21 + PCB_T, 0))
  g.add(chip(0.8, 0.8, 0.3, 1.41, 0.2, 5, 5))
  g.add(tube([[0, 16.5, 0], [0, 17.8, 0.5], [2.2, 17.2, 3.0], [5.0, 8.0, 5.2], [6.6, 0.15, 6.4], [8.4, 0.15, 8.6]], 0.15, '#2b2b2b'))
  g.add(P(rbox(1.2, 0.5, 1.8, '#2b2b2b', {}, 0.15), 9.0, 0, 9.5, 0, 0.7))
  return fit(g)
}
const MICRO_PALS: Pal[] = [
  ['modern', M.black, M.silver, '#ffffff'],
  ['industrial', I.iron, '#5a6068', '#fff2b8'],
  ['cute', C.white, C.sky, '#ffffff'],
  ['modern', M.white, M.char, '#bfe3ff'],
]

// ---- 电动工具 ----

function glueGun(p: string[]) {
  const [body, acc] = p
  const gun = new THREE.Group()
  gun.add(P(capsule(1.7, 9, body), 0, 0, 0, PI / 2))
  gun.add(P(cyl(0.35, 1.0, 2.4, METAL, {}, 14), 0, 0, 7.8, PI / 2))
  gun.add(P(cyl(0.12, 0.3, 0.9, '#b8862a', {}, 10), 0, 0, 9.4, PI / 2))
  gun.add(P(rbox(2.6, 8.5, 3.2, body, {}, 0.9), 0, -4.6, -2.6, -0.28))
  gun.add(P(rbox(1.2, 2.6, 1.3, acc, {}, 0.4), 0, -2.6, 0.6, -0.2))
  gun.add(P(rbox(2.8, 1.2, 3.4, acc, {}, 0.5), 0, -8.7, -3.8, -0.28))
  gun.add(cylZ(0.55, 4.0, '#f4f2e8', 0, 0.2, -7.6, 14))
  // 支架（钢丝）
  gun.add(bar([-0.9, -1.4, 4.5], [-0.9, -5.6, 5.4], 0.12, METAL))
  gun.add(bar([0.9, -1.4, 4.5], [0.9, -5.6, 5.4], 0.12, METAL))
  gun.add(bar([-0.9, -5.6, 5.4], [0.9, -5.6, 5.4], 0.12, METAL))
  gun.add(tube([[0, -9.3, -4.6], [0, -9.6, -6.5], [1.2, -9.5, -10], [3.5, -9.5, -12]], 0.22, '#2b2b2b'))
  gun.add(P(rbox(1.6, 1.2, 2.2, '#2b2b2b', {}, 0.2), 4.2, -9.6, -12.8, 0, 0.6))
  gun.rotation.x = 0.12
  const g = fit(gun)
  for (let i = 0; i < 3; i++) g.add(cylZ(0.55, 10, '#f4f2e8', 3.2 + i * 1.15, 0.55, 2, 14))
  return fit(g)
}

function eScrewdriver(p: string[]) {
  const [body, acc, caseC] = p
  const g = new THREE.Group()
  g.add(puck(2.6, 1.2, '#2b2b2b'))
  g.add(cup(1.5, 1.6, 2.6, 0.2, '#2b2b2b', { y: 1.0 }))
  g.add(cyl(1.2, 1.2, 14.5, body, { y: 1.3 }, 20))
  g.add(cyl(1.26, 1.26, 5, acc, { y: 6.5 }, 20))
  g.add(cyl(1.1, 1.0, 0.8, '#2b2b2b', { y: 15.8 }, 18))
  g.add(lit(P(torus(1.05, 0.12, '#7ad0ff'), 0, 15.7, 0, PI / 2), '#7ad0ff', 0.8))
  g.add(rbox(0.8, 1.6, 0.5, acc, { y: 11.5, z: 1.1 }, 0.2))
  // 批头盒（打开）
  g.add(tray(9, 1.2, 5.5, 0.2, caseC, { x: 7.5 }, 0.15))
  g.add(rbox(9, 5.5, 0.25, caseC, { x: 7.5, y: 0.6, z: -2.9 }, 0.15))
  for (let i = 0; i < 10; i++) for (const z of [-1.2, 1.2]) g.add(P(cyl(0.2, 0.2, 2.5, METAL, {}, 6), 3.9 + i * 0.8, 0.45, z, PI / 2))
  return fit(g)
}

function rotaryTool(p: string[]) {
  const [body, acc, caseC] = p
  const g = new THREE.Group()
  g.add(P(capsule(2.0, 13, body), 0, 2.0, 0, 0, 0, PI / 2))
  g.add(P(cyl(0.9, 1.5, 2.4, acc, {}, 16), 9.3, 2.0, 0, 0, 0, -PI / 2))
  g.add(cylX(0.45, 1.0, METAL, 11.0, 2.0, 0, 12))
  g.add(cylX(0.1, 3.2, CHROME, 13.0, 2.0, 0, 6))
  g.add(cylX(0.5, 0.4, '#b5583a', 14.6, 2.0, 0, 12))
  g.add(rbox(3, 0.6, 1.2, acc, { x: 1.5, y: 3.85 }, 0.2))
  g.add(cylX(0.9, 0.5, acc, -6.5, 3.6, 0, 16))
  g.add(lit(rbox(0.4, 0.1, 0.3, '#7cff8a', { x: -2.5, y: 3.98 }, 0.04), '#7cff8a'))
  g.add(torus(0.6, 0.15, METAL, { x: -9.3, y: 2.0 }))
  // 配件盒
  g.add(tray(13, 1.6, 8, 0.2, caseC, { x: 1, z: -7.5 }, 0.15))
  const r = rng(29)
  for (let i = 0; i < 5; i++) g.add(cyl(1.0, 1.0, 0.12, '#8a5a3a', { x: -4 + i * 0.25, y: 0.2 + i * 0.12, z: -7.5 }, 18))
  for (let i = 0; i < 8; i++) {
    const x = -1 + (i % 4) * 2.2
    const z = -9.5 + Math.floor(i / 4) * 3.5
    g.add(cyl(0.08, 0.08, 1.2, CHROME, { x, y: 0.2, z }, 6))
    const c = ['#b5583a', '#f4f4f2', '#c9cdd2', '#3a7fd0'][Math.floor(r() * 4)]
    g.add(i % 2 ? cyl(0.45, 0.45, 0.8, c, { x, y: 1.0, z }, 12) : ball(0.4, c, { x, y: 1.4, z }))
  }
  g.add(ghost(rbox(13, 0.25, 8, GLASS, { x: 1, y: 1.6, z: -7.5 }, 0.15), GLASS, 0.3))
  return fit(g)
}

const TOOL_PALS: Pal[] = [
  ['industrial', '#2fa3a8', '#2b2b2b', '#3d3f44'],
  ['industrial', '#f2c230', '#2b2b2b', '#2b2b2b'],
  ['modern', '#3d3f44', '#c8473a', '#5a5d63'],
  ['retro', R.red, '#2b2b2b', R.cream],
  ['cute', C.mint, C.pink, C.white],
]

/** 自动剥线钳：平放时长轴沿 z，钳头朝 +z；返回 [模型, 挂环中心] */
function stripperBody(p: string[]): [THREE.Group, V3] {
  const [grip, acc] = p
  const g = new THREE.Group()
  g.add(rbox(4.2, 1.5, 5.6, '#4a4d52', { y: 0.3, z: 6.0 }, 0.4))
  g.add(rbox(3.4, 0.4, 4.6, METAL, { y: 1.8, z: 6.2 }, 0.15))
  g.add(noLine(rbox(3.6, 0.2, 0.25, '#1e1e20', { y: 1.6, z: 8.4 }, 0.05)))
  for (let i = 0; i < 5; i++) g.add(noLine(cylZ(0.08 + i * 0.03, 0.3, '#1e1e20', -1.3 + i * 0.65, 1.0, 8.75, 10)))
  for (const s of [-1, 1]) {
    g.add(P(capsule(0.7, 10.5, s < 0 ? grip : acc), s * 1.25, 0.75, -1.8, PI / 2, s * 0.06))
  }
  g.add(P(G(tube(helix(0.35, 0.3, 5), 0.06, METAL, false, 60)), 0, 0.75, 1.2, 0, 0, PI / 2))
  g.children[g.children.length - 1].position.x = -0.75
  const ring: V3 = [1.25, 0.75, -8.3]
  g.add(P(torus(0.7, 0.2, METAL), ...ring, PI / 2))
  return [g, ring]
}
function stripperLying(p: string[]) {
  return fit(stripperBody(p)[0])
}
function stripperHanging(p: string[]) {
  const [body, ring] = stripperBody(p)
  const inner = new THREE.Group()
  body.rotation.x = PI / 2
  inner.add(body)
  // 绕 x 转 90°：(x, y, z) → (x, -z, y)
  const ringR: V3 = [ring[0], -ring[2], ring[1]]
  const ringY = J_ARM - 0.32 - 0.5
  const zc = 0.3 + ring[1]
  inner.position.set(-ringR[0], ringY - ringR[1], zc - ringR[2])
  return G(inner, jHook(zc + 1.4))
}
const STRIP_TOOL_PALS: Pal[] = [
  ['industrial', '#c8473a', '#2b2b2b'],
  ['modern', '#3a7fd0', '#2b2b2b'],
  ['industrial', '#f2c230', '#3a3a3c'],
  ['cute', C.pink, C.sky],
]

function esdStrap(p: string[]) {
  const [band, cord, clip] = p
  const g = new THREE.Group()
  g.add(P(torus(2.4, 0.45, band), 0, 0.45, 0, PI / 2))
  g.add(rbox(1.6, 0.95, 1.3, '#3a3a3c', { x: 2.4, y: 0, z: 0 }, 0.3))
  g.add(cyl(0.4, 0.4, 0.25, METAL, { x: 2.4, y: 0.95, z: 0 }, 12))
  const coil = helix(0.35, 0.24, 36, 10).map(([x, y, z]): V3 => [y + 3.4, x + 0.45, z])
  g.add(tube(coil, 0.07, cord, false, 700))
  g.add(tube([[12.04, 0.45, 0.35], [13.2, 0.12, 0.8], [14.2, 0.12, 0.2]], 0.07, cord))
  g.add(gator(14.6, 0, 0, clip, PI / 2))
  return fit(g)
}
const ESD_PALS: Pal[] = [
  ['modern', '#3a7fd0', '#3a7fd0', '#e8453c'],
  ['industrial', '#2b2b2b', '#2b2b2b', '#2b2b2b'],
  ['cute', C.pink, '#e86a9a', C.sky],
  ['retro', R.teal, '#2b2b2b', R.red],
]

function esdMat(p: string[]) {
  const [mat] = p
  const g = new THREE.Group()
  g.add(rbox(60, 0.3, 40, mat, {}, 0.12))
  g.add(paintTop(59.6, 39.6, `mk-esdmat-${mat}`, drawEsdMat(mat), 0, 0.35, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.6, 0.6, 0.25, METAL, { x: sx * 28, y: 0.3, z: sz * 18 }, 14))
  return g
}
const MAT_PALS: Pal[] = [
  ['modern', '#3f7fbf'],
  ['industrial', '#4f8a6a'],
  ['modern', '#5a6068'],
  ['cute', '#e88aa8'],
]

function magLamp(p: string[]) {
  const [base, head, glowC] = p
  const g = new THREE.Group()
  g.add(puck(9, 2.5, base, { z: -14 }))
  g.add(rbox(3, 2.5, 3, head, { y: 2.3, z: -14 }, 0.4))
  const pv: V3 = [0, 4.3, -14]
  const el: V3 = [0, 34, -20]
  const nk: V3 = [0, 30.5, -2.5]
  for (const s of [-1, 1]) {
    g.add(bar([s * 0.8, pv[1], pv[2]], [s * 0.8, el[1], el[2]], 0.35, head))
    g.add(bar([s * 0.8, el[1], el[2]], [s * 0.8, nk[1], nk[2]], 0.3, head))
  }
  g.add(cylX(0.8, 2.6, '#3a3a3c', ...pv, 14))
  g.add(cylX(0.8, 2.6, '#3a3a3c', ...el, 14))
  g.add(orient(G(tube(helix(0.4, 0.3, 30, 8), 0.06, CHROME, false, 300)), [0, 6, -14.6], [0, 33, -19.9]))
  g.add(rbox(2, 2, 3, head, { y: 29.6, z: -2.2 }, 0.4))
  g.add(P(torus(7.5, 1.6, head), 0, 30, 6, PI / 2))
  g.add(lit(P(torus(6.3, 0.4, glowC), 0, 28.9, 6, PI / 2), glowC, 0.95))
  g.add(ghost(cyl(6.1, 6.1, 0.4, GLASS, { y: 29.7, z: 6 }, 36), GLASS, 0.35))
  g.add(cylZ(0.6, 2.0, head, 0, 30, 14.4, 12))
  return fit(g)
}
const MAG_PALS: Pal[] = [
  ['modern', M.white, M.white, '#ffffff'],
  ['industrial', I.iron, I.iron, '#fff2b8'],
  ['modern', M.black, M.char, '#ffffff'],
  ['cute', C.white, C.pink, '#fff2b8'],
]

// ======================================================================
// 机械 / 木工
// ======================================================================

function benchVise(p: string[]) {
  const [cast, jaw] = p
  const g = new THREE.Group()
  g.add(rbox(14, 1.2, 12, cast, { z: 0 }, 0.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.6, 0.6, 0.4, METAL, { x: sx * 5.8, y: 1.2, z: sz * 4.5 }, 6))
  g.add(puck(5.5, 1.4, shade(cast, -0.08), { y: 1.2 }))
  g.add(rbox(11, 9.4, 4.5, cast, { y: 2.6, z: -2.6 }, 0.6))
  g.add(rbox(6, 1.2, 4.5, cast, { y: 12.0, z: -4.6 }, 0.3))
  g.add(rbox(4, 3.6, 13, cast, { y: 2.6, z: 3.6 }, 0.5))
  g.add(rbox(11, 8, 4, cast, { y: 4.0, z: 3.5 }, 0.6))
  g.add(rbox(10, 3, 0.6, jaw, { y: 9, z: -0.05 }, 0.1))
  g.add(rbox(10, 3, 0.6, jaw, { y: 9, z: 1.2 }, 0.1))
  for (let i = 0; i < 6; i++) for (const z of [0.27, 0.88]) g.add(noLine(rbox(9.6, 0.08, 0.06, '#1e1e20', { y: 9.3 + i * 0.45, z }, 0.02)))
  g.add(cylZ(0.7, 6, CHROME, 0, 5.6, 8.0, 14))
  g.add(cyl(1.2, 1.2, 1.6, cast, { y: 4.8, z: 10.6 }, 16))
  g.children[g.children.length - 1].rotation.x = PI / 2
  g.children[g.children.length - 1].position.set(0, 5.6, 10.6)
  g.add(cylX(0.4, 10, CHROME, 0, 5.6, 11.0, 10))
  for (const s of [-1, 1]) g.add(ball(0.65, CHROME, { x: s * 5.2, y: 5.6, z: 11.0 }))
  return fit(g)
}
const VISE_PALS: Pal[] = [
  ['industrial', '#2f5fb5', '#5a5d63'],
  ['industrial', '#c8473a', '#5a5d63'],
  ['modern', '#3d3f44', '#8a8d93'],
  ['retro', '#6b7a55', '#5a5d63'],
  ['cute', C.mint, '#8a8d93'],
]

function drillSet(p: string[]) {
  const [body, acc, caseC] = p
  const g = new THREE.Group()
  g.add(rbox(7.5, 3.6, 10, '#2b2b2b', { z: -1 }, 0.6))
  g.add(rbox(7.6, 0.8, 10.1, body, { y: 2.6, z: -1 }, 0.3))
  g.add(P(rbox(3.4, 11.5, 4.2, body, {}, 1.0), 0, 9.2, 0, -0.12))
  g.add(P(rbox(3.6, 6, 4.4, acc, {}, 1.0), 0, 8.4, -0.5, -0.12))
  g.add(P(capsule(2.6, 12, body), 0, 17, 1.5, PI / 2))
  g.add(rbox(1.2, 2.2, 1.4, acc, { y: 11.8, z: 2.6 }, 0.3))
  g.add(cylZ(2.1, 1.0, acc, 0, 17, 9.4, 22))
  g.add(P(cyl(1.6, 1.9, 3.5, '#2b2b2b', {}, 20), 0, 17, 11.5, PI / 2))
  g.add(cylZ(0.25, 6, CHROME, 0, 17, 16.2, 8))
  g.add(rbox(1.8, 0.8, 0.8, acc, { x: 1.6, y: 14.2, z: 1.3 }, 0.2))
  // 钻头盒
  g.add(tray(9, 1.2, 14, 0.25, caseC, { x: 11 }, 0.3))
  for (let i = 0; i < 10; i++) {
    const r = 0.1 + i * 0.045
    g.add(cylZ(r, 7 + i * 0.5, GOLD, 7.2 + i * 0.85, 0.25 + r, 0, 8))
  }
  return fit(g)
}

function angleGrinder(p: string[]) {
  const [body, acc, disc] = p
  const g = new THREE.Group()
  g.add(puck(6.25, 0.3, disc))
  g.add(noLine(cyl(1.2, 1.2, 0.08, METAL, { y: 0.3 }, 14)))
  const gm = toon(METAL).clone()
  gm.side = THREE.DoubleSide
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 1.4, 28, 1, false, 0, PI), gm)
  guard.position.y = 1.15
  g.add(guard)
  g.add(rbox(5.5, 4.4, 5.5, '#4a4d52', { x: 1, y: 0.6 }, 0.8))
  g.add(P(capsule(3.0, 14, body), 12, 3.6, 0, 0, 0, PI / 2))
  g.add(rbox(3, 0.6, 1.2, acc, { x: 10, y: 6.4 }, 0.2))
  g.add(cylZ(0.9, 9, '#2b2b2b', 1.5, 3.2, -7, 14))
  g.add(cylX(2.4, 1.6, acc, 21.5, 3.6, 0, 18))
  g.add(tube([[22.4, 3.6, 0], [24.5, 2.0, 0.5], [25.5, 0.25, 3], [23, 0.25, 6], [19, 0.25, 6.5]], 0.25, '#2b2b2b'))
  g.add(P(rbox(1.8, 1.2, 2.6, '#2b2b2b', {}, 0.2), 17.6, 0, 6.5, 0, PI / 2))
  g.rotation.z = -0.06
  return fit(g)
}

function jigsawScene(p: string[]) {
  const [body, acc, wood] = p
  const g = new THREE.Group()
  for (const x of [-11, 11]) g.add(rbox(4, 5, 18, shade(wood, -0.1), { x }, 0.4))
  g.add(rbox(34, 1.8, 20, wood, { y: 5 }, 0.3))
  const kerf: Draw = (c, W, H) => {
    c.fillStyle = wood
    c.fillRect(0, 0, W, H)
    c.strokeStyle = shade(wood, -0.07)
    c.lineWidth = 1
    for (let y = 4; y < H; y += 9) {
      c.beginPath()
      c.moveTo(0, y)
      c.bezierCurveTo(W * 0.3, y + 4, W * 0.7, y - 4, W, y)
      c.stroke()
    }
    c.strokeStyle = '#4a3020'
    c.lineWidth = Math.max(2, W * 0.006)
    const zy = ((8 + 10) / 20) * H
    c.beginPath()
    c.moveTo(0, zy)
    c.lineTo(((4.2 + 17) / 34) * W, zy)
    c.stroke()
    c.strokeStyle = '#7a7d82'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(((4.2 + 17) / 34) * W, zy)
    c.bezierCurveTo(W * 0.8, zy, W * 0.85, H * 0.5, W * 0.95, H * 0.2)
    c.stroke()
  }
  g.add(paintTop(33.8, 19.8, `mk-jigplank-${wood}`, kerf, 0, 6.85, 0))
  const z = 8
  g.add(rbox(16, 0.5, 6.5, METAL, { x: -3, y: 6.85, z }, 0.15))
  const shape = new THREE.Shape()
  shape.moveTo(-8, 0)
  shape.lineTo(7.5, 0)
  shape.lineTo(7.5, 6)
  shape.quadraticCurveTo(7.5, 11.5, 2, 12.5)
  shape.lineTo(-6, 12.5)
  shape.quadraticCurveTo(-8, 12.5, -8, 10)
  shape.lineTo(-8, 0)
  const hole = new THREE.Path()
  hole.moveTo(-5.5, 7.6)
  hole.lineTo(3.5, 7.6)
  hole.quadraticCurveTo(5, 7.6, 5, 9)
  hole.lineTo(5, 9.6)
  hole.quadraticCurveTo(5, 10.6, 3.5, 10.6)
  hole.lineTo(-5.5, 10.6)
  hole.lineTo(-5.5, 7.6)
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelOffset: -0.5, bevelSegments: 2, curveSegments: 12 })
  geo.translate(0, 0, -2.8)
  const bodyM = new THREE.Mesh(geo, toon(body))
  bodyM.castShadow = true
  bodyM.position.set(-3, 7.35, z)
  g.add(bodyM)
  g.add(rbox(6, 6.8, 5.8, acc, { x: -7.5, y: 7.35, z }, 0.8))
  g.add(rbox(2, 2.6, 2.2, '#2b2b2b', { x: 4.2, y: 7.35, z }, 0.3))
  g.add(rbox(0.9, 7.2, 0.12, CHROME, { x: 4.2, y: 2.8, z }, 0.04))
  g.add(rbox(1.2, 1.4, 1.0, acc, { x: -1.5, y: 14.2, z }, 0.3))
  g.add(tube([[-11, 12.5, z], [-13, 10.5, z + 0.5], [-15.5, 7.2, z + 1.5], [-17.3, 6.0, z + 2.5], [-18.6, 2.5, z + 3.5], [-19.2, 0.3, z + 5.5], [-17.5, 0.3, z + 8.0]], 0.25, '#2b2b2b'))
  const r = rng(43)
  for (let i = 0; i < 14; i++) g.add(noLine(cyl(0.25 + r() * 0.3, 0.25 + r() * 0.3, 0.06, shade(wood, 0.12), { x: 2 + r() * 6, y: 6.82, z: z - 1 + r() * 4 }, 8)))
  return fit(g)
}

function tableSaw(p: string[]) {
  const [body, fence] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(3, 1, 3, RUBBER, { x: sx * 13, z: sz * 12 }, 0.3))
  g.add(rbox(30, 11, 28, body, { y: 1 }, 0.8))
  g.add(rbox(34, 0.6, 32, METAL, { y: 12 }, 0.2))
  g.add(paintTop(30, 1.2, 'mk-ruler-saw', drawRuler('#f2c230', '#2b2b2b'), 0, 12.65, 14.8))
  g.add(rbox(3, 0.1, 12, '#e8453c', { x: 3, y: 12.6 }, 0.04))
  g.add(cylX(5.5, 0.18, '#d9dde2', 3, 11, 0, 40))
  g.add(rbox(0.2, 5, 3, METAL, { x: 3, y: 12.6, z: -5.6 }, 0.05))
  g.add(ghost(rbox(1.8, 5.2, 12, GLASS, { x: 3, y: 12.8 }, 0.4), GLASS, 0.35))
  g.add(rbox(2, 3, 32, fence, { x: -6, y: 12.6 }, 0.3))
  g.add(rbox(3, 2, 4, fence, { x: -6, y: 12.4, z: 16.2 }, 0.3))
  g.add(rbox(1.2, 0.4, 14, METAL, { x: 11, y: 12.6 }, 0.1))
  g.add(rbox(8, 2.4, 2, fence, { x: 11, y: 12.9, z: 3 }, 0.3))
  g.add(cyl(0.4, 0.4, 4, '#2b2b2b', { x: 11, y: 15.3, z: 3 }, 10))
  g.add(rbox(3, 2.4, 0.8, '#e8453c', { x: -8, y: 5, z: 14.3 }, 0.3))
  g.add(cylZ(1.8, 3, '#2b2b2b', 4, 6, -15.4, 18))
  g.add(cylZ(1.2, 1.4, '#3a3a3c', 11, 6, 14.6, 16))
  return fit(g)
}
const MACHINE_PALS: Pal[] = [
  ['industrial', '#5a6f8a', '#f2c230', '#c9a06a'],
  ['modern', M.char, '#e8453c', '#d9b98c'],
  ['industrial', '#2fa3a8', '#2b2b2b', '#c9a06a'],
  ['retro', R.orange, R.cream, '#d9b98c'],
  ['cute', C.mint, C.pink, C.woodL],
]

function drillPress(p: string[]) {
  const [cast, acc] = p
  const g = new THREE.Group()
  g.add(rbox(20, 3, 28, cast, { z: 2 }, 0.6))
  for (const s of [-1, 1]) g.add(noLine(rbox(1.2, 0.1, 16, '#2b2b2b', { x: s * 4, y: 3, z: 4 }, 0.04)))
  g.add(cyl(2.2, 2.2, 52, CHROME, { y: 3, z: -8 }, 20))
  g.add(cyl(3, 3, 4, cast, { y: 18, z: -8 }, 20))
  g.add(rbox(4, 3, 7, cast, { y: 18.5, z: -3.5 }, 0.5))
  g.add(puck(8, 2, cast, { y: 20, z: 4 }))
  g.add(rbox(13, 13, 22, cast, { y: 40, z: -1 }, 1.0))
  g.add(rbox(13.2, 4, 22.2, acc, { y: 53, z: -1 }, 1.5))
  g.add(cyl(5, 5, 12, shade(cast, -0.1), { y: 41, z: -15 }, 22))
  g.add(cyl(1.6, 1.6, 4, CHROME, { y: 36, z: 4 }, 16))
  g.add(cyl(1.8, 1.2, 3.5, '#2b2b2b', { y: 32.5, z: 4 }, 16))
  g.add(cyl(0.3, 0.3, 7, CHROME, { y: 25.5, z: 4 }, 8))
  g.add(cylX(1.2, 1.6, CHROME, 7.3, 45, 4, 14))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.4
    const e: V3 = [7.6, 45 + Math.sin(a) * 8, 4 + Math.cos(a) * 8]
    g.add(bar([7.6, 45, 4], e, 0.35, CHROME))
    g.add(ball(0.9, '#2b2b2b', { x: e[0], y: e[1], z: e[2] }))
  }
  g.add(rbox(3.6, 4.4, 1, acc, { x: -4, y: 43, z: 10.3 }, 0.4))
  g.add(cylZ(0.5, 0.5, '#4caf50', -4, 46, 10.9, 12))
  g.add(cylZ(0.5, 0.5, '#e8453c', -4, 44.2, 10.9, 12))
  return fit(g)
}

function laserCutter(p: string[]) {
  const [body, lid, head] = p
  const g = new THREE.Group()
  g.add(shell(70, 18, 50, 1.5, body, { top: false }))
  g.add(rbox(66, 1.5, 46, shade(body, -0.25), { y: 1.5 }, 0.2))
  g.add(rbox(62, 6, 42, '#3a3d44', { y: 3 }, 0.3))
  g.add(paintTop(61.6, 41.6, 'mk-honeycomb', drawHoneycomb, 0, 9.05, 0))
  g.add(rbox(40, 0.4, 28, '#d9b98c', { x: -3, y: 9.1, z: 2 }, 0.1))
  g.add(paintTop(39.6, 27.6, 'mk-lasercut', drawCutWood('#d9b98c', 'laser'), -3, 9.55, 2))
  for (const s of [-1, 1]) g.add(rbox(2, 1.6, 44, '#5a5d63', { x: s * 31.5, y: 13 }, 0.3))
  g.add(rbox(64, 2, 3, '#5a5d63', { y: 14.6, z: -2 }, 0.3))
  g.add(rbox(4, 4, 3.6, head, { x: 6, y: 12, z: 0.8 }, 0.5))
  g.add(cyl(0.7, 0.5, 1.2, METAL, { x: 6, y: 10.8, z: 0.8 }, 12))
  g.add(lit(ball(0.25, '#ff4a3a', { x: 6, y: 10.2, z: 0.8 }), '#ff4a3a', 1))
  g.add(rbox(70, 1.4, 3, body, { y: 18, z: -23.5 }, 0.4))
  g.add(rbox(70, 1.4, 2, body, { y: 18, z: 24 }, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2, 1.4, 45, body, { x: s * 34, y: 18 }, 0.4))
  g.add(ghost(rbox(66, 0.5, 45, lid, { y: 18.5, z: 0.5 }, 0.2), lid, 0.4))
  g.add(rbox(20, 0.8, 1.6, '#2b2b2b', { y: 19.3, z: 24 }, 0.3))
  g.add(lit(rbox(2.2, 0.2, 1.0, '#7ad0ff', { x: 28, y: 19.4, z: 24 }, 0.08), '#7ad0ff', 0.8))
  g.add(cylZ(4, 6, '#9a9da3', 26, 9, -27, 22))
  return fit(g)
}
const LASER_PALS: Pal[] = [
  ['modern', M.white, '#e86a2a', M.char],
  ['modern', M.black, '#5a6068', '#e8453c'],
  ['industrial', I.iron, '#e86a2a', I.rust],
  ['cute', C.white, '#ff9db0', C.sky],
]

function cnc3018(p: string[]) {
  const [alu, plate, spindle] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(2, 4, 33, alu, { x: s * 18 }, 0.2))
    g.add(rbox(34, 4, 2, alu, { z: s * 15.5 }, 0.2))
    g.add(cylZ(0.4, 30, CHROME, s * 7, 3.5, 0, 10))
  }
  g.add(cylZ(0.4, 30, '#9a9da3', 0, 2.8, 0, 10))
  g.add(rbox(30, 1.4, 18, alu, { y: 4.5, z: 0 }, 0.2))
  g.add(paintTop(29.6, 17.6, 'mk-cnc-bed', drawSlots, 0, 5.95, 0))
  g.add(rbox(14, 1.2, 10, '#d9b98c', { y: 5.9 }, 0.1))
  g.add(paintTop(13.6, 9.6, 'mk-cnc-wood', drawCutWood('#d9b98c', 'cnc'), 0, 7.15, 0))
  g.add(rbox(4.2, 4.2, 4.2, '#2b2b2b', { y: 0.5, z: 17.6 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(1.2, 24, 8, plate, { x: s * 19.6, z: -8 }, 0.3))
  g.add(rbox(39, 4, 2, alu, { y: 20, z: -8 }, 0.2))
  g.add(rbox(39, 4, 2, alu, { y: 14, z: -8 }, 0.2))
  g.add(cylX(0.4, 38, CHROME, 0, 19, -6.6, 10))
  g.add(cylX(0.4, 38, CHROME, 0, 15, -6.6, 10))
  g.add(rbox(8, 11, 1, plate, { y: 12.5, z: -6.5 }, 0.2))
  g.add(rbox(5.6, 3, 2.4, plate, { y: 14, z: -4.8 }, 0.3))
  g.add(cyl(2.6, 2.6, 9, spindle, { y: 11, z: -3.5 }, 22))
  g.add(cyl(2.2, 2.2, 1, '#2b2b2b', { y: 20, z: -3.5 }, 22))
  g.add(cyl(0.8, 0.8, 1.5, METAL, { y: 9.5, z: -3.5 }, 12))
  g.add(cyl(0.12, 0.12, 2.0, CHROME, { y: 7.5, z: -3.5 }, 6))
  g.add(rbox(4.2, 4.2, 4.2, '#2b2b2b', { x: 22.3, y: 15, z: -8 }, 0.3))
  g.add(rbox(4.2, 4.2, 4.2, '#2b2b2b', { y: 23.5, z: -6.5 }, 0.3))
  g.add(rbox(0.3, 6, 8, '#2f7d4a', { x: -20.5, y: 5, z: -8 }, 0.05))
  g.add(cylX(1.6, 0.8, '#2b2b2b', -21.1, 9, -8, 16))
  for (const [i, c] of ['#e8453c', '#2b2b2b', '#3a8ee8'].entries()) g.add(tube([[-20.4, 10.5 - i * 0.4, -10.5], [-19, 23, -11], [-4, 25.5, -9], [-1.5 + i * 0.5, 25.7, -6.5]], 0.1, c))
  return fit(g)
}
const CNC_PALS: Pal[] = [
  ['modern', M.silver, M.black, M.white],
  ['industrial', '#5a5d63', I.iron, '#3d3f44'],
  ['cute', '#d9dde2', C.pink, C.white],
  ['modern', M.char, '#3a7fd0', M.silver],
]

/** 零件抽屉柜：rows 自下而上，每行 {h, n} */
function drawerCab(W: number, D: number, rows: { h: number; n: number }[], plinth: number) {
  return (p: string[]) => {
    const [frame, tint, handle] = p
    const g = new THREE.Group()
    const H = plinth + rows.reduce((s, r) => s + r.h, 0) + 1.2
    if (plinth > 0) g.add(rbox(W - 2, plinth, D - 3, shade(frame, -0.12), { z: -0.5 }, 0.4))
    g.add(rbox(W, H - plinth, D - 1.2, frame, { y: plinth, z: -0.6 }, 0.5))
    const zf = D / 2 - 1.2
    const r = rng(W * 7 + D)
    let y = plinth + 0.6
    for (const row of rows) {
      const cw = (W - 1.2) / row.n
      g.add(rbox(W, 0.5, 1.0, frame, { y: y - 0.25, z: zf + 0.5 }, 0.15))
      for (let i = 0; i < row.n; i++) {
        const x = -W / 2 + 0.6 + cw * (i + 0.5)
        g.add(rbox(0.5, row.h, 1.0, frame, { x: x - cw / 2, y, z: zf + 0.5 }, 0.15))
        const c = PART_COLORS[Math.floor(r() * PART_COLORS.length)]
        // 每个透明小抽屉（连同里面的零件）都能拉出一半
        const bin = new THREE.Group()
        bin.add(noLine(rbox(cw - 1.0, row.h * (0.25 + r() * 0.25), 0.6, c, { x, y: y + 0.3, z: zf + 0.35 }, 0.1)))
        bin.add(ghost(rbox(cw - 0.45, row.h - 0.45, 0.2, tint, { x, y: y + 0.22, z: zf + 0.85 }, 0.08), tint, 0.4))
        bin.add(rbox(Math.min(cw * 0.4, 4), 0.5, 0.5, handle, { x, y: y + row.h * 0.55, z: zf + 1.15 }, 0.15))
        bin.add(tray(cw - 1.2, row.h - 1.2, D - 3, 0.4, shade(tint, -0.08), { x, y: y + 0.3, z: zf - (D - 3) / 2 }, 0.15))
        g.add(movable(bin, { kind: 'drawer', dz: Math.round(D * 0.5) }))
      }
      g.add(rbox(0.5, row.h, 1.0, frame, { x: W / 2 - 0.35, y, z: zf + 0.5 }, 0.15))
      y += row.h
    }
    g.add(rbox(W, 0.6, 1.0, frame, { y: y - 0.3, z: zf + 0.5 }, 0.15))
    return g
  }
}
const DRAWER_PALS: Pal[] = [
  ['modern', '#3a7fd0', GLASS, '#2b2b2b'],
  ['industrial', '#5a5d63', '#dfe3e8', '#c46a3a'],
  ['modern', M.white, '#f4f4f2', M.char],
  ['cute', C.pink, '#fff0f4', C.white],
  ['retro', R.teal, R.cream, R.mustard],
]
/** 零件抽屉柜每个小抽屉的可摆放层（和 drawerCab 一致；抽屉是透明的，标 glass） */
function drawerCabSurfaces(W: number, D: number, rows: { h: number; n: number }[], plinth: number): SurfaceDef[] {
  const zf = D / 2 - 1.2
  const out: SurfaceDef[] = []
  let y = plinth + 0.6
  for (const row of rows) {
    const cw = (W - 1.2) / row.n
    for (let i = 0; i < row.n; i++) {
      const x = -W / 2 + 0.6 + cw * (i + 0.5)
      out.push({ y: y + 0.7, h: Math.round((row.h - 1.8) * 10) / 10, inside: true, glass: true, slide: Math.round(D * 0.5), shape: [rectPoly(x - (cw - 1.2) / 2 + 0.6, zf - (D - 3) + 0.6, x + (cw - 1.2) / 2 - 0.6, zf - 0.6)] })
    }
    y += row.h
  }
  return out
}
const DESK_ROWS = [{ h: 6.4, n: 3 }, ...Array.from({ length: 6 }, () => ({ h: 3.6, n: 6 }))]
const FLOOR_ROWS = Array.from({ length: 12 }, () => ({ h: 7.8, n: 5 }))

function toolChest(p: string[]) {
  const [body, handle, mat] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(4, 2, 4, '#5a5d63', { x: sx * 29, y: 8, z: sz * 18 }, 0.3))
      g.add(rbox(1.2, 3, 1.2, '#5a5d63', { x: sx * 29, y: 5.5, z: sz * 18 }, 0.2))
      g.add(cylX(4, 3, RUBBER, sx * 29, 4, sz * 18, 24))
      g.add(cylX(1.5, 3.2, '#c9cdd2', sx * 29, 4, sz * 18, 12))
    }
  g.add(rbox(68, 73, 46, body, { y: 9 }, 1))
  let y = 10
  for (const h of CHEST_DRAWERS) {
    g.add(movable(G(rbox(64, h - 0.6, 0.6, shade(body, 0.04), { y, z: 23.1 }, 0.3), rbox(56, 1.2, 1.4, handle, { y: y + h - 2.6, z: 23.9 }, 0.4), tray(62, h - 3, 42, 0.6, shade(body, -0.12), { y: y + 0.5, z: 22.8 - 21 }, 0.2)), { kind: 'drawer', dz: 26 }))
    y += h
  }
  for (const s of [-1, 1]) g.add(cylX(0.6, 4, handle, 36, 74, s * 15, 10))
  g.add(cylZ(1.0, 34, '#2b2b2b', 38.5, 74, 0, 16))
  g.add(rbox(68, 1, 46, body, { y: 82 }, 0.4))
  g.add(rbox(65.4, 0.3, 43.4, mat, { y: 83 }, 0.1))
  for (const s of [-1, 1]) {
    g.add(rbox(68, 2, 1.3, body, { y: 83, z: s * 22.35 }, 0.4))
    g.add(rbox(1.3, 2, 43.4, body, { x: s * 33.35, y: 83 }, 0.4))
  }
  g.add(cylZ(0.8, 0.6, CHROME, 28, 79, 23.2, 14))
  return G(P(g, CHEST_DX, 0, CHEST_DZ))
}
/** 侧把手和抽屉拉手让包围盒偏了，整体挪回占地中心 */
const CHEST_DX = -2.75
const CHEST_DZ = -0.8
/** 工具柜六个抽屉的高度（自下而上，第一个从 y = 10 起） */
const CHEST_DRAWERS = [6, 6, 8, 10, 16, 24]
/** 工具柜抽屉格（和 toolChest 一致，含整体平移） */
function chestSurfaces(): SurfaceDef[] {
  let y = 10
  return CHEST_DRAWERS.map((h) => {
    const lv: SurfaceDef = { y: y + 1.1, h: h - 4, inside: true, slide: 26, shape: [rectPoly(-30 + CHEST_DX, -18.4 + CHEST_DZ, 30 + CHEST_DX, 22 + CHEST_DZ)] }
    y += h
    return lv
  })
}
const CHEST_PALS: Pal[] = [
  ['industrial', '#c8382e', CHROME, RUBBER],
  ['modern', M.black, M.silver, RUBBER],
  ['industrial', '#2f5fb5', CHROME, RUBBER],
  ['retro', R.teal, CHROME, '#3a3a3c'],
  ['cute', C.pink, C.white, '#6a6a72'],
]

const BENCH_W = 150
const BENCH_D = 70
const BENCH_TOP = 90
/** 前钳伸出台面，整体往后挪让占地居中 */
const BZ = -4.7
function workbench(peg: boolean) {
  return (p: string[]) => {
    const [top, frame, board] = p
    const g = new THREE.Group()
    const lx = BENCH_W / 2 - 4.5
    const lz = BENCH_D / 2 - 3.5
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) g.add(rbox(7, peg && sz < 0 ? 160 : BENCH_TOP - 6, 7, frame, { x: sx * lx, z: sz * lz }, 0.5))
    for (let i = 0; i < 7; i++) g.add(rbox(BENCH_W, 6, 9.9, shade(top, (i % 2) * 0.04 - 0.02), { y: BENCH_TOP - 6, z: -BENCH_D / 2 + 5 + i * 10 }, 0.4))
    for (const s of [-1, 1]) {
      g.add(rbox(BENCH_W - 16, 8, 3, frame, { y: BENCH_TOP - 14, z: s * (lz - 0.5) }, 0.4))
      g.add(rbox(3, 8, BENCH_D - 14, frame, { x: s * lx, y: BENCH_TOP - 14 }, 0.4))
      g.add(rbox(3, 5, BENCH_D - 14, frame, { x: s * lx, y: 12 }, 0.4))
    }
    g.add(rbox(BENCH_W - 9, 2.5, BENCH_D - 10, shade(top, -0.06), { y: 20 }, 0.4))
    // 木制前钳
    g.add(rbox(26, 12, 4, shade(top, -0.04), { x: -50, y: BENCH_TOP - 14, z: BENCH_D / 2 + 2.2 }, 0.5))
    for (const s of [-1, 1]) g.add(cylZ(1.0, 8, CHROME, -50 + s * 9, BENCH_TOP - 9, BENCH_D / 2 + 1, 10))
    g.add(cylZ(1.3, 7, '#5a5d63', -50, BENCH_TOP - 8, BENCH_D / 2 + 5, 12))
    g.add(cylX(0.8, 20, frame, -50, BENCH_TOP - 8, BENCH_D / 2 + 8.2, 10))
    for (const s of [-1, 1]) g.add(ball(1.2, frame, { x: -50 + s * 10, y: BENCH_TOP - 8, z: BENCH_D / 2 + 8.2 }))
    if (peg) {
      const bw = BENCH_W - 16
      g.add(rbox(bw, 66, 1.2, board, { y: 94, z: -lz + 0.9 }, 0.3))
      g.add(paintPanel(bw - 1, 65, `mk-pegholes-${board}`, drawPegHoles(board), { y: 94.5, z: -lz + 1.65 }))
      g.add(rbox(BENCH_W, 3, 7, frame, { y: 160, z: -lz }, 0.5))
    }
    return G(P(g, 0, 0, BZ))
  }
}
const PEG_FRONT = -(BENCH_D / 2 - 3.5) + 1.5 + BZ
const pegHookBands = () =>
  [4, 8, 12, 16, 20, 24].map((k) => {
    const y = 94.5 + 1.25 + 2.5 * k + 2
    return { y, shape: [rectPoly(-65, PEG_FRONT, 65, PEG_FRONT + 3)], kind: 'hook' as const, h: Math.round((y - BENCH_TOP - 1) * 10) / 10 }
  })
const BENCH_PALS: Pal[] = [
  ['industrial', '#c9a06a', I.iron, '#d9c9a8'],
  ['nordic', N.oak, N.white, N.white],
  ['industrial', I.walnut, '#7c8085', '#3a3a3c'],
  ['cute', C.woodL, C.mint, C.white],
  ['japanese', J.hinoki, J.dark, J.washi],
]

function sawhorse(p: string[]) {
  const [wood, brace] = p
  const g = new THREE.Group()
  g.add(rbox(90, 8.9, 3.8, wood, { y: 61.1 }, 0.4))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(beam([sx * 35, 61.5, sz * 2.6], [sx * 39, 0.6, sz * 22], 6.4, 3.8, wood))
    }
  for (const sx of [-1, 1]) g.add(rbox(1.5, 14, 12, brace, { x: sx * 31, y: 50, z: 0 }, 0.3))
  for (const sz of [-1, 1]) g.add(rbox(76, 6, 1.8, brace, { y: 20, z: sz * 15.6 }, 0.3))
  return fit(g)
}
const HORSE_PALS: Pal[] = [
  ['industrial', '#d9b98c', '#c9a06a'],
  ['nordic', N.oakL, N.oak],
  ['industrial', '#c9a06a', I.iron],
  ['cute', C.woodL, C.mint],
]

function lumber(p: string[]) {
  const [pine, cedar, strap] = p
  const g = new THREE.Group()
  const r = rng(51)
  const lay = (y: number, t: number, w: number, zs: number[], col: string) => {
    for (const z of zs) g.add(rbox(100 + r() * 20, t, w, shade(col, (r() - 0.5) * 0.06), { x: (r() - 0.5) * 8, y, z }, 0.3))
  }
  lay(0, 3.8, 8.9, [-9.1, 0, 9.1], pine)
  lay(3.8, 1.9, 13.9, [-7, 7], cedar)
  lay(5.7, 3.8, 8.9, [-4.6, 4.6], pine)
  for (const x of [-30, 30]) {
    g.add(rbox(2.5, 0.15, 28.2, strap, { x, y: 9.5 }, 0.05))
    for (const s of [-1, 1]) g.add(rbox(2.5, 9.6, 0.15, strap, { x, y: 0.05, z: s * 13.95 }, 0.05))
  }
  return fit(g)
}
const LUMBER_PALS: Pal[] = [
  ['nordic', '#e8cfa0', '#d9b98c', '#3a7fd0'],
  ['industrial', '#d9b98c', '#b88a5a', I.iron],
  ['japanese', J.hinoki, '#e0c090', J.shu],
  ['cute', C.woodL, C.wood, C.pink],
]

function screwSorter(p: string[]) {
  const [caseC, tint] = p
  const g = new THREE.Group()
  const W = 26
  const D = 17
  const H = 4
  g.add(tray(W, H, D, 0.3, caseC, {}, 0.3))
  const cw = (W - 0.6) / 6
  const cd = (D - 0.6) / 3
  for (let i = 1; i < 6; i++) g.add(rbox(0.25, H - 0.6, D - 0.6, caseC, { x: -W / 2 + 0.3 + cw * i, y: 0.3 }, 0.08))
  for (let j = 1; j < 3; j++) g.add(rbox(W - 0.6, H - 0.6, 0.25, caseC, { y: 0.3, z: -D / 2 + 0.3 + cd * j }, 0.08))
  const r = rng(91)
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const cx = -W / 2 + 0.3 + cw * (i + 0.5)
      const cz = -D / 2 + 0.3 + cd * (j + 0.5)
      const kind = (i * 3 + j) % 4
      const col = [METAL, '#2b2b2b', BRASS, CHROME][(i + j) % 4]
      for (let k = 0; k < 8; k++) {
        const x = cx + (r() - 0.5) * (cw - 1.2)
        const z = cz + (r() - 0.5) * (cd - 1.2)
        const y = 0.3
        const sc = 0.7 + ((i * 3 + j) % 3) * 0.25
        if (kind === 0)
          g.add(noLine(P(G(cyl(0.12 * sc, 0.12 * sc, 1.4 * sc, col, { y: -0.7 * sc }, 6), cyl(0.28 * sc, 0.28 * sc, 0.15, col, { y: 0.7 * sc }, 10)), x, y + 0.3 * sc, z, PI / 2, r() * PI, 0)))
        else if (kind === 1) g.add(noLine(cyl(0.32 * sc, 0.32 * sc, 0.22 * sc, col, { x, y, z }, 6)))
        else if (kind === 2) g.add(noLine(P(torus(0.28 * sc, 0.08 * sc, col), x, y + 0.08, z, PI / 2)))
        else g.add(noLine(cyl(0.22 * sc, 0.22 * sc, 0.5 * sc, col, { x, y, z }, 8)))
      }
    }
  const lid = new THREE.Group()
  lid.add(ghost(rbox(W, 0.3, D, tint, { z: D / 2 }, 0.2), tint, 0.4))
  lid.position.set(0, H, -D / 2)
  lid.rotation.x = -1.8
  g.add(lid)
  for (const x of [-7, 7]) g.add(rbox(2, 1.4, 0.5, shade(caseC, -0.15), { x, y: H - 1.0, z: D / 2 + 0.15 }, 0.15))
  return fit(g)
}
const SORTER_PALS: Pal[] = [
  ['industrial', '#c46a3a', '#e8e2d8'],
  ['modern', '#3a7fd0', GLASS],
  ['modern', M.char, '#dfe3e8'],
  ['cute', C.lilac, '#f6f0ff'],
]

function sandpaper(p: string[]) {
  const [grit1, grit2, block] = p
  const g = new THREE.Group()
  g.add(cylX(3.5, 10, grit1, 0, 3.5, 0, 28))
  g.add(cylX(1.2, 10.1, '#c99a62', 0, 3.5, 0, 16))
  g.add(noLine(cylX(0.9, 10.2, '#5a4030', 0, 3.5, 0, 14)))
  g.add(rbox(10, 0.06, 7, grit1, { y: 0, z: 3.6 }, 0.02))
  g.add(cylX(2.8, 10, grit2, 0, 2.8, -7.5, 28))
  g.add(cylX(1.0, 10.1, '#c99a62', 0, 2.8, -7.5, 16))
  g.add(noLine(cylX(0.75, 10.2, '#5a4030', 0, 2.8, -7.5, 14)))
  g.add(rbox(11, 2.5, 6.5, block, { x: 12, z: -1 }, 0.4))
  g.add(rbox(11.4, 2.8, 6.0, grit2, { x: 12, y: -0.15, z: -1 }, 0.3))
  for (let i = 0; i < 3; i++) g.add(rbox(14, 0.06, 11, i % 2 ? grit1 : grit2, { x: 13, y: i * 0.07, z: 6.5, ry: i * 0.08 }, 0.02))
  return fit(g)
}
const SAND_PALS: Pal[] = [
  ['industrial', '#b5583a', '#4a4a48', '#c99a62'],
  ['modern', '#7a7d82', '#3d3f44', '#d7d8db'],
  ['retro', R.orange, R.olive, R.caramel],
  ['cute', '#f4a6b8', '#a6c8f4', C.woodL],
]

// ======================================================================
// 半成品氛围
// ======================================================================

function teardown(p: string[]) {
  const [shellC, pcbC, acc] = p
  const g = new THREE.Group()
  g.add(tray(22, 3, 14, 0.35, shellC, { x: -6 }, 0.6))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.35, 0.35, 0.8, shellC, { x: -6 + sx * 7, y: 0.35, z: sz * 4 }, 10))
  const { g: b, top: t } = board(16, 10, pcbC, 81, 1.15, false)
  b.position.x = -6
  g.add(b)
  g.add(chip(2.0, 2.0, -8, t, -1, 10, 10))
  g.add(chip(1.2, 0.8, -3.5, t, 2, 6, 0))
  g.add(rbox(1.5, 0.6, 1.0, METAL, { x: -12.5, y: t, z: 2.5 }, 0.1))
  g.add(rbox(3.2, 0.4, 0.8, '#f4f4f2', { x: -2, y: t, z: -3.6 }, 0.06))
  for (let i = 0; i < 4; i++) g.add(G(cyl(0.35, 0.35, 0.8, '#2b2b2b', { x: -10 + i * 1.0, y: t, z: 3.2 }, 12)))
  g.add(rbox(6, 1.0, 4, '#3a7fd0', { x: -3.5, y: 0.35, z: 4.9 }, 0.3))
  g.add(tube([[-1.5, 1.2, 4.5], [-0.6, 1.8, 3.5], [-1.2, t + 0.2, 1.0]], 0.06, '#e8453c'))
  g.add(tube([[-1.5, 1.2, 5.2], [-0.2, 1.9, 4.0], [-0.8, t + 0.2, 1.3]], 0.06, '#2b2b2b'))
  // 翻开的上壳（内面朝上）+ 排线
  g.add(tray(22, 2.0, 14, 0.35, shellC, { x: 17 }, 0.6))
  for (let i = 0; i < 4; i++) g.add(cyl(0.6, 0.6, 0.6, acc, { x: 12 + i * 1.6, y: 0.35, z: 3 }, 14))
  g.add(cyl(3, 3, 0.4, '#3a3a3c', { x: 20, y: 0.35, z: -1 }, 24))
  g.add(rbox(2, 0.4, 0.8, '#f4f4f2', { x: 9, y: 0.35, z: -3.6 }, 0.06))
  g.add(ribbon([[-2, t + 0.45, -3.6], [-1, 3.6, -3.6], [2, 4.5, -3.8], [5.5, 3.5, -3.8], [7.5, 1.6, -3.6], [9, 0.85, -3.6]], 1.6, 0.06, '#e2a33a'))
  // 螺丝碗、精密螺丝刀、撬棒、散线
  g.add(cup(2.5, 2.0, 1.2, 0.15, '#c43a3a', { x: 4, z: 10.5 }))
  const r = rng(13)
  for (let i = 0; i < 7; i++) g.add(noLine(P(G(cyl(0.08, 0.08, 0.5, METAL, { y: -0.25 }, 6), cyl(0.18, 0.18, 0.08, METAL, { y: 0.25 }, 8)), 4 + (r() - 0.5) * 2.4, 0.4, 10.5 + (r() - 0.5) * 2.4, PI / 2, r() * PI, 0)))
  g.add(cylX(0.4, 8, acc, -6, 0.4, 10, 6))
  g.add(cylX(0.1, 3, CHROME, -0.5, 0.4, 10, 6))
  g.add(rbox(9, 0.3, 0.8, '#3a7fd0', { x: -14, z: 10.5, ry: 0.3 }, 0.1))
  g.add(tube([[-17, 0.08, 8.5], [-19, 0.08, 6], [-21, 0.08, 2], [-19.6, 0.08, -2], [-17.5, 0.08, -3.5]], 0.07, '#4caf50'))
  g.add(tube([[-16, 0.08, 9.5], [-18, 0.08, 9.0], [-20.5, 0.08, 6.5], [-21.5, 0.08, 4.5]], 0.07, '#f2d23a'))
  return fit(g)
}
const TEAR_PALS: Pal[] = [
  ['modern', M.white, '#2f7d4a', M.char],
  ['modern', M.char, '#1f6fb2', '#e8453c'],
  ['retro', R.cream, '#2f7d4a', R.orange],
  ['cute', C.sky, '#9b6fd0', C.pink],
]

function wipSoldering(p: string[]) {
  const [holder, pcbC, acc] = p
  const g = new THREE.Group()
  g.add(rbox(16, 1.5, 9, holder, {}, 0.5))
  for (const s of [-1, 1]) {
    g.add(cyl(0.5, 0.5, 4.2, CHROME, { x: s * 6.5, y: 1.5 }, 10))
    g.add(rbox(1.8, 1.6, 3, holder, { x: s * 5.6, y: 5.4 }, 0.3))
  }
  const { g: b, top: t } = board(10, 7, pcbC, 87, 6.0, false)
  g.add(b)
  g.add(chip(1.4, 1.4, -1.5, t, -1, 8, 8))
  g.add(resistor(1, 2.2, 1.5, t))
  g.add(resistor(1, 2.2, 0.8, t, '#7fb0e0'))
  g.add(eCap(-3.5, -3.2, 2, t))
  g.add(header(6, 1, 1.5, t, -2.6, 'x'))
  for (const [x, z] of [[1, 1.5], [2.2, 1.5], [1, 0.8], [-3.5, 2], [-3.2, 2], [0.4, -2.6], [0.65, -2.6]]) g.add(ball(0.12, SOLDER, { x, y: t, z }))
  g.add(lit(ball(0.1, '#ffd27a', { x: 2.2, y: t + 0.02, z: 0.8 }), '#ffd27a', 1))
  // 镊子、焊锡笔、散件
  g.add(beam([-6, 0.15, 6], [3, 0.15, 7.2], 0.4, 0.15, METAL, 0.05))
  g.add(beam([-6, 0.15, 6.3], [3, 0.6, 6.4], 0.4, 0.15, METAL, 0.05))
  g.add(P(capsule(0.6, 7, acc), 8.5, 0.6, 2.5, PI / 2, 0.2))
  g.add(P(cyl(0.05, 0.05, 1.5, SOLDER, {}, 6), 9.3, 0.6, 7.0, PI / 2 + 0.2, 0.2))
  g.add(cup(1.6, 1.4, 0.6, 0.1, '#f4f4f2', { x: -9.5, z: 4 }))
  for (let i = 0; i < 4; i++) g.add(noLine(P(cyl(0.11, 0.11, 0.6, '#e6c9a0', {}, 8), -9.5 + (i - 1.5) * 0.5, 0.25, 4 + (i % 2) * 0.4, 0, 0.3 * i, PI / 2)))
  return fit(g)
}
const WIP_PALS: Pal[] = [
  ['industrial', I.iron, '#2f7d4a', '#2f7d4a'],
  ['modern', M.char, '#1f6fb2', '#e8453c'],
  ['cute', C.white, '#9b6fd0', C.pink],
  ['retro', R.teal, '#2f7d4a', R.mustard],
]

// ======================================================================
// 导出
// ======================================================================

const H = { family: 'mk-dupont' }
const ST = { family: 'mk-stripper' }
const BENCH_SURF = (peg: boolean): Partial<AssetDef> => ({
  surface: BENCH_TOP,
  surfaceShape: [rectPoly(-BENCH_W / 2, -BENCH_D / 2 + (peg ? 7 : 0) + BZ, BENCH_W / 2, BENCH_D / 2 + BZ)] as Poly[],
  surfaces: [{ y: 22.5, shape: [rectPoly(-BENCH_W / 2 + 8, -BENCH_D / 2 + 7 + BZ, BENCH_W / 2 - 8, BENCH_D / 2 - 7 + BZ)], h: BENCH_TOP - 14 - 22.5 }, ...(peg ? pegHookBands() : [])],
})

export const MAKER: AssetDef[] = [
  // 电子 / 单片机
  def('mk-arduino', 'Arduino 开发板', 'hobby', [7.3, 5.4, 1.5], BOARD_PALS, (p) => fit(arduinoParts(p[0], p[1], p[2])), PROP),
  def('mk-raspi', '树莓派', 'hobby', [8.8, 6, 2], PI_PALS, (p) => fit(raspiParts(p[0], p[1], p[2])), PROP),
  def('mk-esp32', 'ESP32 开发板', 'hobby', [5.4, 2.9, 1.5], BOARD_PALS, esp32, PROP),
  def('mk-bluepill', 'STM32 蓝丸板', 'hobby', [5.5, 2.4, 1.9], [['modern', '#2f5fb5', HDR, '#7cff8a'], ['industrial', '#2a2b30', HDR, '#7cff8a'], ['cute', '#9b6fd0', HDR, C.pink]], bluePill, PROP),
  def('mk-breadboard-full', '面包板', 'hobby', [16.5, 5.5, 2.6], BB_PALS, breadboardFull, { ...PROP, family: 'mk-breadboard', sizeLabel: '830 孔' }),
  def('mk-breadboard-half', '面包板', 'hobby', [8.2, 5.5, 2.6], BB_PALS, breadboardHalf, { ...PROP, family: 'mk-breadboard', sizeLabel: '400 孔' }),
  def('mk-pcb-stack', '裸 PCB 一摞', 'hobby', [17.6, 10.8, 1.3], [['industrial', '#2f7d4a', '#9b6fd0'], ['modern', '#2a2b30', '#1f6fb2'], ['cute', '#f2f2ee', '#d9468f'], ['modern', '#1f6fb2', '#c8473a']], pcbStack, PROP),
  def('mk-smd-reels', '贴片元件卷带', 'hobby', [8, 20.6, 18.8], REEL_PALS, smdReels, PROP),
  def('mk-parts-box', '元件收纳盒', 'hobby', [19, 12.7, 3.7], CASE_PALS, partsBox, PROP),
  def('mk-dupont-lying', '杜邦线', 'hobby', [19.5, 11, 0.5], DUPONT_PALS, dupontLying, { ...PROP, ...H, form: 'lying' }),
  def('mk-dupont-hanging', '杜邦线', 'hobby', [1.5, 5.5, 15.7], DUPONT_PALS, dupontHanging, { ...PROP, ...H, form: 'hanging' }),
  def('mk-servo-set', '舵机与减速电机', 'hobby', [21.2, 9, 4.4], SERVO_PALS, servoSet, PROP),
  def('mk-robot-car', '小车底盘套件', 'hobby', [18.7, 20.5, 10.3], CAR_PALS, robotCar, PROP),
  def('mk-led-strip', 'LED 灯带卷', 'hobby', [21.3, 27.6, 10.3], STRIP_PALS, ledStrip, PROP),
  def('mk-battery-box', '电池盒', 'hobby', [8.6, 13.5, 1.6], BATT_PALS, batteryBox, PROP),
  def('mk-18650', '18650 电池与充电器', 'hobby', [13.7, 10.9, 6.6], CELL_PALS, charger18650, PROP),
  def('mk-oled', 'OLED 屏模块', 'hobby', [4.6, 3.5, 4.4], OLED_PALS, oledModule, PROP),
  // 仪器 / 工具
  def('mk-solder-station', '电烙铁台', 'hobby', [21, 19.8, 15.7], STATION_PALS, solderStation, PROP),
  def('mk-hot-air', '热风枪拆焊台', 'hobby', [21.8, 23.1, 10], STATION_PALS, hotAirStation, PROP),
  def('mk-desolder-pump', '吸锡器', 'hobby', [2.2, 21.2, 2.5], PUMP_PALS, desolderPump, PROP),
  def('mk-solder-spool', '焊锡丝卷', 'hobby', [8, 9.9, 8.9], SPOOL_PALS, solderSpool, PROP),
  def('mk-flux', '助焊剂', 'hobby', [12.4, 9.9, 1.6], FLUX_PALS, fluxSet, PROP),
  def('mk-helping-hands', '第三只手', 'hobby', [15, 10.6, 21.3], HH_PALS, helpingHands, PROP),
  def('mk-multimeter', '万用表', 'hobby', [15.5, 19.8, 6.1], METER_PALS, multimeter, PROP),
  def('mk-oscilloscope', '示波器', 'hobby', [31, 22.6, 16], SCOPE_PALS, oscilloscope, PROP),
  def('mk-bench-psu', '可调直流电源', 'hobby', [13, 35.9, 16], PSU_PALS, benchPsu, PROP),
  def('mk-sig-gen', '信号发生器', 'hobby', [23, 27.4, 10.5], PSU_PALS, sigGen, PROP),
  def('mk-logic-analyzer', '逻辑分析仪', 'hobby', [12.8, 23.9, 2], LA_PALS, logicAnalyzer, PROP),
  def('mk-usb-microscope', 'USB 显微镜', 'hobby', [16, 17.5, 19.5], MICRO_PALS, usbMicroscope, PROP),
  def('mk-glue-gun', '热熔胶枪', 'hobby', [9.6, 25, 11.2], TOOL_PALS, glueGun, PROP),
  def('mk-e-screwdriver', '电动螺丝刀', 'hobby', [14.6, 5.8, 16.6], TOOL_PALS, eScrewdriver, PROP),
  def('mk-rotary-tool', '迷你电磨', 'hobby', [24.9, 13.5, 4.5], TOOL_PALS, rotaryTool, PROP),
  def('mk-stripper-lying', '剥线钳', 'hobby', [4.5, 18.1, 2.1], STRIP_TOOL_PALS, stripperLying, { ...PROP, ...ST, form: 'lying' }),
  def('mk-stripper-hanging', '剥线钳', 'hobby', [4.5, 3.8, 20], STRIP_TOOL_PALS, stripperHanging, { ...PROP, ...ST, form: 'hanging' }),
  def('mk-esd-strap', '静电手环', 'hobby', [20.3, 5.7, 1.2], ESD_PALS, esdStrap, PROP),
  def('mk-esd-mat', 'ESD 防静电垫', 'hobby', [60, 40, 0.6], MAT_PALS, esdMat, { ...PROP, surface: 0.4 }),
  def('mk-mag-lamp', '放大镜台灯', 'hobby', [18.2, 38.4, 34.8], MAG_PALS, magLamp, PROP),
  // 机械 / 木工
  def('mk-bench-vise', '台钳', 'hobby', [14, 18.5, 13.2], VISE_PALS, benchVise, PROP),
  def('mk-drill-set', '电钻 + 钻头盒', 'hobby', [19.3, 26.3, 19.6], TOOL_PALS, drillSet, PROP),
  def('mk-angle-grinder', '角磨机', 'hobby', [32, 18.9, 8.2], TOOL_PALS, angleGrinder, PROP),
  def('mk-jigsaw', '曲线锯（锯木中）', 'hobby', [36.5, 26.3, 20], MACHINE_PALS, jigsawScene, PROP),
  def('mk-table-saw', '迷你台锯', 'hobby', [34, 35.1, 19.3], MACHINE_PALS, tableSaw, PROP),
  def('mk-drill-press', '台钻', 'hobby', [20, 36, 57], MACHINE_PALS, drillPress, PROP),
  def('mk-laser-cutter', '激光切割机', 'hobby', [70, 55, 20.1], LASER_PALS, laserCutter, PROP),
  def('mk-cnc', '迷你 CNC 雕刻机', 'hobby', [45.9, 36.2, 27.7], CNC_PALS, cnc3018, PROP),
  def('mk-drawers-desk', '零件抽屉柜', 'storage', [38, 16.2, 29.2], DRAWER_PALS, drawerCab(38, 16, DESK_ROWS, 0), { ...PROP, family: 'mk-parts-drawer', sizeLabel: '桌面 39 格', surface: 29.2, surfaces: drawerCabSurfaces(38, 16, DESK_ROWS, 0), openable: true }),
  def('mk-drawers-floor', '零件抽屉柜', 'storage', [50, 25.2, 98.8], DRAWER_PALS, drawerCab(50, 25, FLOOR_ROWS, 4), { family: 'mk-parts-drawer', sizeLabel: '落地 60 格', surface: 98.8, surfaces: drawerCabSurfaces(50, 25, FLOOR_ROWS, 4), openable: true }),
  def('mk-tool-chest', '工具柜', 'storage', [73.5, 47.6, 85], CHEST_PALS, toolChest, { surface: 83.3, surfaceShape: [rectPoly(-32.6 + CHEST_DX, -21.6 + CHEST_DZ, 32.6 + CHEST_DX, 21.6 + CHEST_DZ)], surfaces: chestSurfaces(), openable: true }),
  def('mk-workbench', '工作台', 'hobby', [150, 79.4, 90], BENCH_PALS, workbench(false), { family: 'mk-workbench', sizeLabel: '150', ...BENCH_SURF(false) }),
  def('mk-workbench-peg', '工作台', 'hobby', [150, 79.4, 163], BENCH_PALS, workbench(true), { family: 'mk-workbench', sizeLabel: '150 带洞洞板', ...BENCH_SURF(true) }),
  def('mk-sawhorse', '锯木架', 'hobby', [90, 49.3, 70], HORSE_PALS, sawhorse, { surface: 70, surfaceShape: [rectPoly(-45, -1.9, 45, 1.9)] }),
  def('mk-lumber', '木料一捆', 'hobby', [114.4, 28.2, 9.7], LUMBER_PALS, lumber),
  def('mk-screw-sorter', '螺丝分类盒', 'hobby', [26, 21.5, 20.5], SORTER_PALS, screwSorter, PROP),
  def('mk-sandpaper', '砂纸卷', 'hobby', [25.9, 23.3, 7.1], SAND_PALS, sandpaper, PROP),
  // 半成品
  def('mk-teardown', '拆解中的电子产品', 'hobby', [49.6, 20.3, 4.5], TEAR_PALS, teardown, PROP),
  def('mk-wip-solder', '焊接中的小板', 'hobby', [20.4, 12.2, 7.4], WIP_PALS, wipSoldering, { ...PROP, fx: [{ kind: 'smoke', x: 3.1, y: 6.4, z: -0.8, scale: 0.35, height: 10 }] }),
]
