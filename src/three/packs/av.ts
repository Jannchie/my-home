// 影音素材包：投影仪 / 幕布 / 播放器 / 音响 / 影碟收藏 / 家庭影院氛围。
// 原点在占地中心底面（贴附物和壁挂例外，见 kit.ts），正面朝 +z。
// 投影仪有「待机（closed）」和「投影中（open）」两种形态：投影中镜头发光，并带一束 30cm 左右的短光束提示（半透明、不描边，计入包围盒）。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, glow, rng, holePanel, paintPanel, rectPoly, type AssetDef } from '../kit'
import { P, cylX, cylZ, ghost, litOutlined, noOutline } from '../geo'
import { I, J, M, N, PROP, R, define, type Pal } from '../packkit'

// ---------- 配色 / 定义 ----------

const DARK = '#2b2b30'
const RUBBER = '#3a3a3e'
const LIGHT = '#fff7dc'
const LENS_OFF = '#34405a'
const AMBER = '#ffb347'
const CYAN = '#7fe3ff'

// ---------- 小工具 ----------

/** 小指示灯 */
const led = (x: number, y: number, z: number, color: string, r = 0.4) => noOutline(litOutlined(ball(r, color, { x, y, z }), color, 0.9))

/** 朝前的旋钮：z 是安装面 */
function knob(r: number, len: number, color: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cylZ(r, len + 0.2, color, x, y, z + len / 2 - 0.1, 20))
  g.add(noOutline(rbox(r * 0.18, r * 0.7, 0.3, shade(color, -0.35), { x, y: y + r * 0.2, z: z + len + 0.05 }, 0.05)))
  return g
}

/** 喇叭单元：z 是安装面 */
function driver(r: number, cone: string, ring: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cylZ(r, 0.9, ring, x, y, z + 0.35))
  g.add(cylZ(r * 0.78, 0.9, cone, x, y, z + 0.6))
  g.add(P(ball(r * 0.3, shade(cone, -0.12), {}, [1, 1, 0.5]), x, y, z + 1.05))
  return g
}

/** 三维细杆 */
function stick3(a: [number, number, number], b: [number, number, number], r: number, color: string) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, 10)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 把模型挪到占地中心、底面贴 y = 0 */
function ctr(g: THREE.Group) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  g.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  const o = new THREE.Group()
  o.add(g)
  return o
}

/**
 * 光束：从镜头（宽 w0 高 h0）朝 +z 扩散到 len 处（宽 w1 高 h1），远端中心上移 dy（投影仪略微上仰）。
 * 半透明、双面、不描边、不投影。
 */
const beamMats = new Map<string, THREE.Material>()
function beam(w0: number, h0: number, w1: number, h1: number, len: number, dy: number, color = LIGHT, a = 0.13) {
  const v = [
    [-w0 / 2, -h0 / 2, 0],
    [w0 / 2, -h0 / 2, 0],
    [w0 / 2, h0 / 2, 0],
    [-w0 / 2, h0 / 2, 0],
    [-w1 / 2, dy - h1 / 2, len],
    [w1 / 2, dy - h1 / 2, len],
    [w1 / 2, dy + h1 / 2, len],
    [-w1 / 2, dy + h1 / 2, len],
  ].flat()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7])
  geo.computeVertexNormals()
  const key = `${color}|${a}`
  let mat = beamMats.get(key)
  if (!mat) {
    const m = (toon(color, { transparent: a }) as THREE.MeshToonMaterial).clone()
    m.side = THREE.DoubleSide
    m.emissive = new THREE.Color(color)
    m.emissiveIntensity = 0.6
    mat = m
    beamMats.set(key, mat)
  }
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.noOutline = true
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/** 镜头：从安装面 z 向前伸 len，返回镜片最前端的 z */
function lens(g: THREE.Group, r: number, len: number, x: number, y: number, z: number, ring: string, on: boolean) {
  g.add(cylZ(r + 0.7, 1, ring, x, y, z + 0.3))
  g.add(cylZ(r, len, DARK, x, y, z + len / 2))
  const gl = P(ball(r * 0.82, on ? LIGHT : LENS_OFF, {}, [1, 1, 0.3]), x, y, z + len)
  if (on) litOutlined(gl, LIGHT, 1.1)
  g.add(gl)
  return z + len + r * 0.25
}

/** 片盘：圆盘带三个镂空，在 xy 平面里（法线朝 z），厚 t 居中 */
function reelDisc(r: number, t: number, color: string) {
  const s = new THREE.Shape()
  s.absarc(0, 0, r, 0, Math.PI * 2, false)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    const h = new THREE.Path()
    h.absarc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.24, 0, Math.PI * 2, true)
    s.holes.push(h)
  }
  const hub = new THREE.Path()
  hub.absarc(0, 0, r * 0.07, 0, Math.PI * 2, true)
  s.holes.push(hub)
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 20 })
  geo.translate(0, 0, -t / 2)
  const m = new THREE.Mesh(geo, toon(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 一张平放的光盘：银色盘面 + 印刷面 + 中孔，y 为底 */
function disc(r: number, label: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cyl(r, r, 0.14, '#dfe3ea', { x, y, z }, 32))
  g.add(cyl(r * 0.96, r * 0.96, 0.2, label, { x, y: y + 0.02, z }, 32))
  g.add(cyl(r * 0.36, r * 0.36, 0.24, '#eef1f5', { x, y: y + 0.02, z }, 24))
  g.add(cyl(r * 0.12, r * 0.12, 0.28, '#6a6e78', { x, y: y + 0.01, z }, 16))
  return g
}

/** 一排数码管样的显示（只画几段发光条） */
function readout(g: THREE.Group, w: number, h: number, color: string, x: number, y: number, z: number) {
  g.add(rbox(w + 0.8, h + 0.8, 0.4, '#141418', { x, y: y - 0.4, z: z - 0.1 }, 0.2))
  const n = Math.max(2, Math.round(w / (h * 0.8)))
  const cw = (w - 0.6) / n
  for (let i = 0; i < n; i++) {
    const cx = x - w / 2 + 0.3 + cw * (i + 0.5)
    g.add(glow(cw * 0.6, 0.25, color, { x: cx, y: y + h - 0.45, z: z + 0.15 }, 0.9))
    g.add(glow(cw * 0.6, 0.25, color, { x: cx, y: y + 0.2, z: z + 0.15 }, 0.9))
    if (i % 2 === 0) g.add(glow(0.25, h * 0.7, color, { x: cx + cw * 0.3, y: y + h * 0.15, z: z + 0.15 }, 0.9))
  }
}

// ---------- 画面 ----------

type Scene = 'sunset' | 'space' | 'sea' | 'city'

function paintMovie(scene: Scene) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const grad = (stops: [number, string][]) => {
      const l = g.createLinearGradient(0, 0, 0, H)
      for (const [o, c] of stops) l.addColorStop(o, c)
      return l
    }
    const m = Math.min(W, H)
    const circle = (x: number, y: number, r: number, c: string) => {
      g.fillStyle = c
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    const figure = (x: number, base: number, s: number, c: string) => {
      g.fillStyle = c
      g.fillRect(x - s * 0.17, base - s * 0.86, s * 0.34, s * 0.86)
      circle(x, base - s * 1.0, s * 0.15, c)
    }
    if (scene === 'sunset') {
      g.fillStyle = grad([
        [0, '#3b2d5c'],
        [0.45, '#e2704f'],
        [0.75, '#ffc874'],
      ])
      g.fillRect(0, 0, W, H)
      circle(W * 0.58, H * 0.6, m * 0.15, '#fff1b8')
      g.fillStyle = '#2a1f2e'
      g.beginPath()
      g.moveTo(0, H * 0.74)
      g.quadraticCurveTo(W * 0.3, H * 0.6, W * 0.55, H * 0.76)
      g.quadraticCurveTo(W * 0.8, H * 0.68, W, H * 0.72)
      g.lineTo(W, H)
      g.lineTo(0, H)
      g.fill()
      figure(W * 0.27, H * 0.67, H * 0.16, '#2a1f2e')
      figure(W * 0.33, H * 0.675, H * 0.13, '#2a1f2e')
    } else if (scene === 'space') {
      g.fillStyle = grad([
        [0, '#0b1030'],
        [1, '#33205e'],
      ])
      g.fillRect(0, 0, W, H)
      const r = rng(7)
      for (let i = 0; i < 90; i++) circle(r() * W, r() * H, Math.max(1, m * 0.004 * (1 + r())), '#ffffff')
      circle(W * 0.64, H * 0.48, m * 0.24, '#e98b5a')
      circle(W * 0.6, H * 0.43, m * 0.2, '#f2a86e')
      g.strokeStyle = '#f4d9a6'
      g.lineWidth = Math.max(2, m * 0.025)
      g.beginPath()
      g.ellipse(W * 0.64, H * 0.48, m * 0.4, m * 0.09, -0.25, 0, Math.PI * 2)
      g.stroke()
      circle(W * 0.2, H * 0.28, m * 0.06, '#c9d4ff')
    } else if (scene === 'sea') {
      g.fillStyle = grad([
        [0, '#6fa8de'],
        [0.6, '#f9d9b0'],
      ])
      g.fillRect(0, 0, W, H * 0.62)
      circle(W * 0.5, H * 0.56, m * 0.12, '#fff3c4')
      g.fillStyle = '#2f6f9a'
      g.fillRect(0, H * 0.62, W, H * 0.38)
      g.fillStyle = '#ffe9b0'
      for (let i = 0; i < 5; i++) g.fillRect(W * (0.44 + (i % 2) * 0.02), H * (0.66 + i * 0.05), W * (0.1 - i * 0.012), Math.max(1, H * 0.012))
      g.fillStyle = '#1c2a3a'
      g.beginPath()
      g.moveTo(W * 0.2, H * 0.6)
      g.lineTo(W * 0.2, H * 0.4)
      g.lineTo(W * 0.27, H * 0.6)
      g.fill()
      g.fillRect(W * 0.16, H * 0.6, W * 0.13, H * 0.025)
    } else {
      g.fillStyle = grad([
        [0, '#1c1840'],
        [1, '#6a4a8a'],
      ])
      g.fillRect(0, 0, W, H)
      circle(W * 0.78, H * 0.22, m * 0.08, '#fff4c8')
      const r = rng(11)
      let x = 0
      while (x < W) {
        const bw = W * (0.06 + r() * 0.08)
        const bh = H * (0.25 + r() * 0.4)
        g.fillStyle = '#15132a'
        g.fillRect(x, H - bh, bw - 2, bh)
        g.fillStyle = '#ffd36a'
        for (let wy = H - bh + H * 0.04; wy < H - H * 0.04; wy += H * 0.06)
          for (let wx = x + bw * 0.18; wx < x + bw - bw * 0.2; wx += bw * 0.28) if (r() > 0.45) g.fillRect(wx, wy, Math.max(1, bw * 0.1), Math.max(1, H * 0.025))
        x += bw
      }
    }
    // 宽银幕黑边
    g.fillStyle = '#111114'
    g.fillRect(0, 0, W, H * 0.08)
    g.fillRect(0, H * 0.92, W, H * 0.08)
  }
}

/** 正在放映的画面（微微自发光），at.y 为底边 */
const movie = (w: number, h: number, scene: Scene, at: { x?: number; y?: number; z?: number }, k = 0.3) => paintPanel(w, h, `av-movie-${scene}`, paintMovie(scene), at, k)

type PosterKind = 'silhouette' | 'space' | 'retro'
/** 抽象电影海报：大图形 + 标题色块 + 底部演职员细线（不写字） */
function paintPoster(kind: PosterKind, [a, b, c]: string[]) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const circle = (x: number, y: number, r: number, col: string) => {
      g.fillStyle = col
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    if (kind === 'silhouette') {
      const l = g.createLinearGradient(0, 0, 0, H)
      l.addColorStop(0, a)
      l.addColorStop(0.75, b)
      g.fillStyle = l
      g.fillRect(0, 0, W, H)
      circle(W * 0.5, H * 0.42, W * 0.3, c)
      g.fillStyle = '#1d1a24'
      g.beginPath()
      g.moveTo(0, H * 0.7)
      g.lineTo(W * 0.62, H * 0.6)
      g.lineTo(W, H * 0.66)
      g.lineTo(W, H)
      g.lineTo(0, H)
      g.fill()
      g.fillRect(W * 0.53, H * 0.47, W * 0.06, H * 0.14)
      circle(W * 0.56, H * 0.455, W * 0.035, '#1d1a24')
    } else if (kind === 'space') {
      g.fillStyle = a
      g.fillRect(0, 0, W, H)
      const r = rng(3)
      for (let i = 0; i < 70; i++) circle(r() * W, r() * H * 0.8, Math.max(1, W * 0.004), '#ffffff')
      circle(W * 0.5, H * 0.78, W * 0.62, b)
      circle(W * 0.72, H * 0.3, W * 0.12, c)
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.moveTo(W * 0.4, H * 0.42)
      g.lineTo(W * 0.46, H * 0.3)
      g.lineTo(W * 0.52, H * 0.42)
      g.fill()
      g.fillRect(W * 0.43, H * 0.42, W * 0.06, H * 0.08)
    } else {
      g.fillStyle = a
      g.fillRect(0, 0, W, H)
      g.fillStyle = b
      const cx = W * 0.5
      const cy = H * 0.5
      for (let k = 0; k < 16; k += 2) {
        const a0 = (k / 16) * Math.PI * 2
        const a1 = ((k + 1) / 16) * Math.PI * 2
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + Math.cos(a0) * H, cy + Math.sin(a0) * H)
        g.lineTo(cx + Math.cos(a1) * H, cy + Math.sin(a1) * H)
        g.fill()
      }
      circle(cx, cy, W * 0.26, c)
      circle(cx, cy, W * 0.18, a)
    }
    // 标题色块 + 演职员细线
    g.fillStyle = '#ffffff'
    g.fillRect(W * 0.12, H * 0.07, W * 0.76, H * 0.06)
    g.fillStyle = kind === 'retro' ? b : c
    g.fillRect(W * 0.3, H * 0.15, W * 0.4, H * 0.02)
    g.fillStyle = 'rgba(255,255,255,0.75)'
    for (let i = 0; i < 3; i++) g.fillRect(W * (0.14 + i * 0.02), H * (0.86 + i * 0.03), W * (0.72 - i * 0.04), Math.max(1, H * 0.008))
  }
}

// ======================================================================
// 投影仪
// ======================================================================

/** 家用桌面投影仪：[机身, 按键, 镜头圈] */
function homeProjector(on: boolean) {
  return (p: string[]) => {
    const [body, acc, ring] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(puck(1.3, 1.2, RUBBER, { x: sx * 11, z: sz * 7.5 }))
    g.add(rbox(30, 9, 22, body, { y: 1 }, 2.4))
    g.add(rbox(26, 0.6, 17, shade(body, -0.06), { y: 9.7, z: -1 }, 0.25))
    for (let i = 0; i < 4; i++) g.add(cyl(0.7, 0.7, 0.5, acc, { x: 4 + i * 2.6, y: 10.1, z: 3 }, 12))
    g.add(cyl(2, 2, 0.6, shade(body, -0.2), { x: -7, y: 9.9, z: 3 }))
    const f = lens(g, 3, 2, -7, 5.5, 10.8, ring, on)
    for (let i = 0; i < 6; i++) g.add(rbox(0.6, 5, 0.6, shade(body, -0.3), { x: 2 + i * 1.6, y: 3, z: 11 }, 0.2))
    g.add(led(12, 2.6, 11.1, on ? '#7dffa0' : '#ff7466'))
    if (on) g.add(P(beam(4.8, 4.8, 26, 15, 30, 2.6), -7, 5.5, f))
    return ctr(g)
  }
}

/** 迷你方块投影仪：[机身, 前脸, 点缀] */
function cubeProjector(on: boolean) {
  return (p: string[]) => {
    const [body, face, acc] = p
    const g = new THREE.Group()
    g.add(rbox(10, 10, 10, body, {}, 2))
    g.add(rbox(8.4, 8.4, 0.6, face, { y: 0.8, z: 5 }, 1.2))
    const f = lens(g, 2.2, 1, 0, 6, 5.2, acc, on)
    for (let i = 0; i < 3; i++) g.add(cylZ(0.35, 0.4, shade(face, -0.25), -1.4 + i * 1.4, 2.4, 5.4, 10))
    g.add(cyl(1.2, 1.2, 0.5, acc, { y: 9.85 }))
    g.add(led(3.2, 2.4, 5.35, on ? '#7dffa0' : '#ff7466', 0.3))
    if (on) g.add(P(beam(3.4, 3.4, 20, 11, 25, 0), 0, 6, f))
    return ctr(g)
  }
}

/** 迷你圆筒投影仪（易拉罐大小）：[机身, 网罩, 点缀] */
function canProjector(on: boolean) {
  return (p: string[]) => {
    const [body, mesh, acc] = p
    const g = new THREE.Group()
    g.add(cyl(4.2, 4.2, 15, body, {}, 32))
    g.add(cyl(4.3, 4.3, 7, mesh, { y: 1.5 }, 32))
    g.add(cyl(3.9, 3.9, 0.6, shade(body, -0.12), { y: 14.8 }, 32))
    g.add(P(torus(2.4, 0.25, acc), 0, 15.45, 0, Math.PI / 2))
    g.add(cyl(0.8, 0.8, 0.5, acc, { y: 15.2 }, 16))
    const f = lens(g, 1.6, 1.4, 0, 11.6, 3.5, acc, on)
    g.add(led(0, 9.2, 4.2, on ? '#7dffa0' : '#ff7466', 0.3))
    if (on) g.add(P(beam(2.6, 2.6, 18, 10, 25, 0), 0, 11.6, f))
    return ctr(g)
  }
}

/** 短焦投影仪：放在电视柜上贴墙往上投。[机身, 网罩, 顶板] */
function ustProjector(on: boolean) {
  return (p: string[]) => {
    const [body, grille, top] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(puck(1.5, 1, RUBBER, { x: sx * 22, z: sz * 12 }))
    g.add(rbox(55, 11, 33, body, { y: 1 }, 3))
    g.add(rbox(50, 7, 0.8, grille, { y: 2.5, z: 16.3 }, 0.4))
    g.add(rbox(50, 0.6, 18, top, { y: 11.8, z: 5 }, 0.3))
    const win = rbox(32, 0.6, 6, on ? LIGHT : LENS_OFF, { y: 11.8, z: -9.5 }, 0.25)
    if (on) litOutlined(win, LIGHT, 1)
    g.add(win)
    g.add(glow(12, 0.5, on ? CYAN : '#9aa0a8', { y: 9.5, z: 16.4 }, on ? 0.9 : 0.2))
    if (on) g.add(P(beam(30, 3, 54, 4, 48, 0), 0, 12.4, -9.5, -Math.PI / 2 - 0.05))
    return ctr(g)
  }
}

/** 复古胶片放映机：两个片盘。[机身, 金属件, 片盘] */
function filmProjector(on: boolean) {
  return (p: string[]) => {
    const [body, metal, reel] = p
    const g = new THREE.Group()
    g.add(rbox(30, 3, 22, shade(body, -0.18), {}, 1))
    g.add(rbox(26, 14, 18, body, { y: 3 }, 2.5))
    // 灯室 + 散热缝
    g.add(rbox(10, 8, 10, body, { x: -6, y: 16.5, z: -2 }, 2))
    for (let i = 0; i < 4; i++) {
      const s = rbox(0.6, 5, 1, on ? AMBER : shade(body, -0.3), { x: -11.1, y: 18, z: -5 + i * 2 }, 0.2)
      if (on) litOutlined(s, AMBER, 0.9)
      g.add(s)
    }
    const f = lens(g, 2.6, 8, 4, 10.5, 8.8, metal, on)
    // 片盘臂 + 片盘
    const rx = 9
    g.add(stick3([rx, 16.5, 5], [rx, 33, 12], 0.7, metal))
    g.add(stick3([rx, 16.5, -5], [rx, 33, -12], 0.7, metal))
    for (const z of [12, -12]) {
      for (const dx of [-0.9, 0.9]) g.add(P(reelDisc(10.5, 0.35, reel), rx + dx, 33, z, 0, Math.PI / 2))
      g.add(cylX(6.5, 1.5, '#3a2f2a', rx, 33, z, 20))
      g.add(cylX(1.3, 2.8, metal, rx, 33, z, 20))
    }
    // 胶片
    g.add(stick3([rx, 26, 8], [rx, 15, 9.2], 0.25, '#3a2f2a'))
    g.add(stick3([rx, 26, -16], [rx, 15, -9.2], 0.25, '#3a2f2a'))
    // 侧面摇柄
    g.add(cylX(2.2, 1, metal, -13.4, 10, 2, 20))
    g.add(cylX(0.6, 2, DARK, -14.6, 11.5, 2, 20))
    if (on) g.add(P(beam(4, 4, 26, 15, 30, 0.8), 4, 10.5, f))
    return ctr(g)
  }
}

// ======================================================================
// 幕布
// ======================================================================

/** 落地三脚架幕布：[外壳 / 立杆, 幕布黑边, 点缀] */
function tripodScreen(open: boolean) {
  return (p: string[]) => {
    const [metal, border, acc] = p
    const g = new THREE.Group()
    const top = open ? 228 : 132
    g.add(cyl(1.3, 1.3, top - 40, metal, { y: 40, z: -3 }, 12))
    g.add(cyl(2.2, 2.2, 6, acc, { y: 42, z: -3 }, 16))
    for (const [fx, fz] of [
      [0, -41],
      [-33, 16],
      [33, 16],
    ] as const) {
      g.add(stick3([0, 44, -3], [fx * 0.97, 1.2, fz * 0.97 - 3], 0.9, metal))
      g.add(puck(1.6, 1.2, RUBBER, { x: fx, z: fz - 3 }))
    }
    // 卷轴盒
    g.add(cylX(4, 170, metal, 0, 95, 3, 20))
    for (const s of [-1, 1]) g.add(P(rbox(3, 9, 9, acc, {}, 1.5), s * 86, 90.5, 3))
    g.add(rbox(6, 6, 5, acc, { y: 92, z: -1 }, 1))
    if (open) {
      g.add(rbox(160, 120, 0.4, border, { y: 99, z: 3 }, 0.2))
      g.add(movie(152, 108, 'sunset', { y: 104, z: 3.5 }))
      g.add(cylX(0.8, 162, metal, 0, 219.5, 3, 20))
      g.add(stick3([0, 226, -3], [0, 226, 3], 0.6, metal))
      g.add(cyl(0.4, 0.4, 6, metal, { y: 220, z: 3 }, 8))
    } else {
      g.add(rbox(4, 4, 5, acc, { y: top - 2, z: -1 }, 1))
    }
    return ctr(g)
  }
}

const PULL_TOP = 250
/** 壁挂手拉幕布：[卷轴盒, 端盖, 拉手] */
function pullScreen(open: boolean) {
  return (p: string[]) => {
    const [box, cap, handle] = p
    const g = new THREE.Group()
    g.add(rbox(206, 8, 8, box, { y: PULL_TOP - 8, z: 0.5 }, 2.5))
    for (const s of [-1, 1]) {
      g.add(rbox(3, 8.6, 8.6, cap, { x: s * 104, y: PULL_TOP - 8.3, z: 0.5 }, 1.5))
      g.add(rbox(5, 6, 1, '#8a8d93', { x: s * 80, y: PULL_TOP - 7, z: -4 }, 0.3))
    }
    const bottom = open ? 79.5 : PULL_TOP - 10.5
    if (open) {
      g.add(rbox(200, 160, 0.3, '#232327', { y: 82, z: 0.6 }, 0.1))
      g.add(rbox(194, 138, 0.3, '#f4f4f0', { y: 86, z: 0.9 }, 0.1))
      g.add(movie(184, 128, 'sea', { y: 91, z: 1.4 }))
    }
    g.add(rbox(202, 2.5, 2.2, box, { y: bottom, z: 0.6 }, 0.8))
    g.add(cyl(0.25, 0.25, 7.5, '#5a5a60', { y: bottom - 7.5, z: 0.6 }, 6))
    g.add(rbox(6, 2, 1.4, handle, { y: bottom - 9.5, z: 0.6 }, 0.6))
    return g
  }
}

const ELEC_TOP = 255
/** 电动幕布：更厚的卷轴盒、黑色加长遮幅、配重底杆。[外壳, 端盖, 指示灯色] */
function electricScreen(open: boolean) {
  return (p: string[]) => {
    const [box, cap, ledC] = p
    const g = new THREE.Group()
    g.add(rbox(236, 10, 10, box, { y: ELEC_TOP - 10, z: 0.5 }, 4))
    for (const s of [-1, 1]) {
      g.add(rbox(4, 10.6, 10.6, cap, { x: s * 119, y: ELEC_TOP - 10.3, z: 0.5 }, 2))
      g.add(rbox(6, 8, 1, '#8a8d93', { x: s * 95, y: ELEC_TOP - 9, z: -5 }, 0.3))
    }
    g.add(led(-112, ELEC_TOP - 5, 5.2, ledC, 0.35))
    const bottom = open ? 81 : ELEC_TOP - 12.5
    if (open) {
      g.add(rbox(228, 162, 0.3, '#1d1d21', { y: 84, z: 0.6 }, 0.1))
      g.add(rbox(222, 126, 0.3, '#f4f4f0', { y: 89, z: 0.9 }, 0.1))
      g.add(movie(216, 120, 'space', { y: 92, z: 1.4 }))
    }
    g.add(rbox(230, 3, 3, '#1d1d21', { y: bottom, z: 0.6 }, 1.2))
    return g
  }
}

/** 画框幕布（便携折叠）：[框, 黑绒边, 脚] */
function frameScreen(p: string[]) {
  const [frame, velvet, foot] = p
  const g = new THREE.Group()
  const y0 = 52
  const fw = 164
  const fh = 98
  for (const s of [-1, 1]) {
    g.add(rbox(4, fh, 4, frame, { x: s * (fw / 2 - 2), y: y0 }, 0.8))
    g.add(rbox(3, y0 + 10, 3, frame, { x: s * (fw / 2 - 12), z: -3.5 }, 0.6))
    g.add(rbox(4, 3, 50, foot, { x: s * (fw / 2 - 12) }, 1))
    g.add(stick3([s * (fw / 2 - 12), 20, -3.5], [s * (fw / 2 - 4), y0 + 4, -0.5], 0.7, frame))
  }
  for (const y of [y0, y0 + fh - 4]) g.add(rbox(fw - 8, 4, 4, frame, { y }, 0.8))
  g.add(rbox(fw - 8, fh - 8, 0.4, velvet, { y: y0 + 4, z: 0.6 }, 0.1))
  g.add(movie(fw - 16, fh - 16, 'city', { y: y0 + 8, z: 1.1 }))
  return ctr(g)
}

// ======================================================================
// 投影仪支架
// ======================================================================

const STAND_TOP = 117.5
/** 落地三脚架投影支架（顶部托盘可放投影仪）：[金属, 托盘, 脚垫] */
function tripodStand(p: string[]) {
  const [metal, plate, foot] = p
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2
    const fx = Math.cos(a) * 34
    const fz = Math.sin(a) * 34
    g.add(stick3([0, 62, 0], [fx * 0.97, 1.2, fz * 0.97], 1, metal))
    g.add(puck(1.8, 1.2, foot, { x: fx, z: fz }))
  }
  g.add(cyl(2, 2, 8, foot, { y: 58 }, 16))
  g.add(cyl(1.6, 1.6, 50, metal, { y: 60 }, 16))
  g.add(cyl(1.1, 1.1, 8, shade(metal, -0.15), { y: 106 }, 16))
  g.add(cylX(1.6, 4, foot, 2.5, 108, 0, 20))
  g.add(rbox(10, 3, 8, foot, { y: 113 }, 1))
  g.add(rbox(36, 1.5, 28, plate, { y: STAND_TOP - 1.5 }, 0.5))
  for (const s of [-1, 1]) {
    g.add(rbox(36, 1.5, 0.8, plate, { y: STAND_TOP, z: s * 13.6 }, 0.3))
    g.add(rbox(0.8, 1.5, 26.4, plate, { x: s * 17.6, y: STAND_TOP }, 0.3))
  }
  // 三条腿前后不对称：整体后移让占地居中（托盘中心落在 z = 8.5）
  g.position.z = 8.5
  const o = new THREE.Group()
  o.add(g)
  return o
}

const ARM_TOP = 149.5
/** 床头悬臂投影支架：底座在床头侧，横臂伸到床上方。[金属, 底座, 托盘] */
function armStand(p: string[]) {
  const [metal, base, plate] = p
  const g = new THREE.Group()
  g.add(rbox(40, 3, 40, base, { z: -25 }, 1.2))
  g.add(cyl(2.4, 2.8, 4, base, { y: 3, z: -38 }, 20))
  g.add(cyl(1.8, 1.8, 141, metal, { y: 6, z: -38 }, 16))
  g.add(cylX(1.2, 3.5, base, 2.8, 120, -38, 20))
  g.add(rbox(5, 5, 5, base, { y: 143, z: -38 }, 1))
  g.add(P(cyl(1.5, 1.5, 78, metal, {}, 16), 0, 145.5, 4, Math.PI / 2))
  g.add(rbox(6, 2, 6, base, { y: 146, z: 33 }, 0.8))
  g.add(rbox(30, 1.5, 24, plate, { y: ARM_TOP - 1.5, z: 33 }, 0.5))
  for (const s of [-1, 1]) g.add(rbox(0.8, 1.5, 24, plate, { x: s * 14.6, y: ARM_TOP, z: 33 }, 0.3))
  g.add(rbox(30, 1.5, 0.8, plate, { y: ARM_TOP, z: 21.4 }, 0.3))
  return g
}

// ======================================================================
// 播放器 / 音响
// ======================================================================

const feet4 = (g: THREE.Group, x: number, z: number, h = 1, r = 1.4) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(puck(r, h, RUBBER, { x: sx * x, z: sz * z }))
}

/** 桌面 CD 机：碟仓开 / 合。[机身, 面板, 显示屏] */
function cdPlayer(open: boolean) {
  return (p: string[]) => {
    const [body, face, disp] = p
    const g = new THREE.Group()
    feet4(g, 18, 11)
    g.add(rbox(43, 8, 29, body, { y: 1 }, 1))
    g.add(rbox(42.6, 7.6, 0.8, face, { y: 1.2, z: 14.6 }, 0.6))
    g.add(rbox(20, 1.4, 0.4, '#18181c', { x: -8, y: 5.9, z: 15.1 }, 0.2))
    if (open) {
      g.add(tray(20, 1.4, 14, 0.4, shade(face, -0.12), { x: -8, y: 5.9, z: 22.1 }, 0.2))
      g.add(rbox(20, 1.8, 0.6, face, { x: -8, y: 5.7, z: 29.3 }, 0.25))
      g.add(disc(5.9, '#ffb6c8', -8, 6.35, 22.1))
    }
    readout(g, 11, 2, disp, 9, 4.4, 15.1)
    for (let i = 0; i < 5; i++) g.add(rbox(2.4, 0.9, 0.5, shade(face, -0.15), { x: -15 + i * 3, y: 2.6, z: 15.1 }, 0.2))
    g.add(knob(1.6, 1, shade(face, -0.2), 18, 5, 15))
    g.add(led(-19, 2.8, 15.1, '#7dffa0', 0.3))
    return ctr(g)
  }
}

/** 手提 CD 收音机（boombox）：[机身, 喇叭网, 把手 / 按键] */
function boombox(p: string[]) {
  const [body, grille, acc] = p
  const g = new THREE.Group()
  g.add(rbox(52, 22, 16, body, {}, 3))
  for (const s of [-1, 1]) {
    g.add(cylZ(8, 0.6, shade(body, -0.15), s * 16.5, 10.5, 7.9))
    g.add(driver(7, grille, shade(grille, -0.2), s * 16.5, 10.5, 8.1))
  }
  g.add(rbox(14, 8, 0.6, DARK, { y: 2.6, z: 8 }, 0.3))
  g.add(rbox(8, 2.6, 0.3, '#6a7080', { y: 5.2, z: 8.35 }, 0.1))
  for (const s of [-1, 1]) g.add(cylZ(0.8, 0.3, '#f4f4f2', s * 2.2, 6.5, 8.55, 12))
  g.add(glow(14, 3.2, '#ffd27a', { y: 13.6, z: 8.1 }, 0.5))
  g.add(noOutline(rbox(0.3, 2.8, 0.3, C.red, { x: 2, y: 13.8, z: 8.6 }, 0.1)))
  g.add(cyl(6, 6, 0.6, shade(body, -0.1), { y: 21.8, z: 0.5 }, 32))
  g.add(cyl(2.4, 2.4, 0.3, '#dfe3ea', { y: 22.3, z: 0.5 }, 24))
  for (let i = 0; i < 6; i++) g.add(rbox(2.8, 1, 2.2, i === 5 ? C.red : '#c9ccd2', { x: -9 + i * 3.6, y: 21.5, z: 5.3 }, 0.3))
  for (const s of [-1, 1]) g.add(cyl(1, 1, 8.5, acc, { x: s * 19, y: 21.5 }, 12))
  g.add(cylX(1.3, 40, acc, 0, 30.3, 0, 20))
  g.add(cylX(0.35, 30, '#c3c7cc', 2, 22.3, -5.4, 8))
  return ctr(g)
}

/** Discman（平放）+ 一副入耳耳机：[机身, 盖子, 按键] */
function discman(p: string[]) {
  const [body, lid, acc] = p
  const g = new THREE.Group()
  g.add(puck(6.8, 2.4, body))
  g.add(cyl(6.3, 6.3, 0.5, lid, { y: 2.2 }, 32))
  g.add(cyl(2.4, 2.4, 0.3, '#e6ebf2', { y: 2.55 }, 24))
  g.add(cyl(0.6, 0.6, 0.4, DARK, { y: 2.55 }, 12))
  g.add(rbox(3.4, 0.4, 1.3, '#b8c7a0', { y: 2.5, z: 4.3 }, 0.15))
  for (let i = 0; i < 3; i++) g.add(rbox(1.5, 0.8, 0.8, acc, { x: -2 + i * 2, y: 0.8, z: 6.3 }, 0.25))
  // 耳机线 + 两只耳塞
  g.add(stick3([6.6, 1.2, -1], [9.5, 0.3, -2], 0.15, DARK))
  g.add(stick3([9.5, 0.3, -2], [10.5, 0.3, 2], 0.15, DARK))
  g.add(stick3([9.5, 0.3, -2], [12, 0.3, -3], 0.15, DARK))
  g.add(ball(0.9, acc, { x: 10.6, y: 0.9, z: 2.6 }))
  g.add(ball(0.9, acc, { x: 12.6, y: 0.9, z: -3.2 }))
  return ctr(g)
}

/** 卡带随身听（立着）+ 一副海绵头戴耳机：[机身, 仓门, 海绵] */
function walkman(p: string[]) {
  const [body, door, foam] = p
  const g = new THREE.Group()
  const x = 8
  g.add(rbox(11, 8.4, 3.2, body, { x }, 0.6))
  g.add(rbox(9.4, 6, 0.4, door, { x, y: 1.4, z: 1.7 }, 0.3))
  g.add(rbox(6, 2.6, 0.3, '#3a3f4a', { x, y: 3.2, z: 1.95 }, 0.1))
  for (const s of [-1, 1]) g.add(cylZ(0.6, 0.3, '#f4f4f2', x + s * 1.7, 4.5, 2.15, 12))
  for (let i = 0; i < 4; i++) g.add(rbox(1.6, 0.8, 1.8, i === 1 ? C.red : '#c9ccd2', { x: x - 2.7 + i * 1.8, y: 8 }, 0.25))
  g.add(P(torus(6.5, 0.45, '#c3c7cc', {}, Math.PI), -8, 0.45, 0, -Math.PI / 2))
  for (const s of [-1, 1]) g.add(puck(2.4, 1.8, foam, { x: -8 + s * 6.5 }))
  g.add(stick3([0.6, 0.3, 1.5], [2.6, 1.5, 1], 0.15, DARK))
  return ctr(g)
}

/** 迷你组合音响：主机 + 两只书架箱。[主机, 音箱, 显示屏] */
function miniCompo(p: string[]) {
  const [body, spk, disp] = p
  const g = new THREE.Group()
  g.add(rbox(22, 26, 26, body, {}, 1.5))
  g.add(cyl(7.5, 7.5, 0.5, shade(body, -0.1), { y: 25.8, z: 1 }, 32))
  readout(g, 14, 2.4, disp, 0, 19.5, 13.1)
  g.add(rbox(16, 6, 0.5, DARK, { y: 7.5, z: 13.1 }, 0.3))
  g.add(knob(2.2, 1.2, shade(body, -0.15), 6, 15, 13))
  for (let i = 0; i < 4; i++) g.add(rbox(1.8, 0.8, 0.5, shade(body, -0.2), { x: -8 + i * 2.6, y: 15.4, z: 13.1 }, 0.2))
  g.add(led(-8.5, 3.5, 13.1, '#7dffa0', 0.3))
  for (const s of [-1, 1]) {
    g.add(rbox(15, 25, 22, spk, { x: s * 19.5, z: -2 }, 1.2))
    g.add(driver(5, DARK, shade(spk, -0.2), s * 19.5, 8.5, 9))
    g.add(driver(1.8, DARK, shade(spk, -0.2), s * 19.5, 19.5, 9))
  }
  return ctr(g)
}

/** 薄型蓝光 / DVD 播放机：[机身, 面板, 指示灯] */
function bdPlayer(p: string[]) {
  const [body, face, ledC] = p
  const g = new THREE.Group()
  feet4(g, 18, 7, 0.8, 1.2)
  g.add(rbox(43, 4.4, 20, body, { y: 0.8 }, 0.8))
  g.add(rbox(42.6, 4, 0.6, face, { y: 1, z: 10.1 }, 0.3))
  g.add(rbox(18, 0.5, 0.4, '#101014', { x: -6, y: 3.6, z: 10.5 }, 0.15))
  g.add(glow(6, 0.35, ledC, { x: -6, y: 1.9, z: 10.45 }, 0.9))
  readout(g, 7, 1.3, ledC, 9, 2.1, 10.5)
  for (const x of [17, 19.2]) g.add(cylZ(0.6, 0.4, shade(face, 0.15), x, 2.8, 10.55, 12))
  return ctr(g)
}

/** 卡带机（双指针 VU 表）：[机身, 面板, 表头] */
function cassetteDeck(p: string[]) {
  const [body, face, meter] = p
  const g = new THREE.Group()
  feet4(g, 18, 11)
  g.add(rbox(43, 12, 28, body, { y: 1 }, 1))
  g.add(rbox(42.6, 11.6, 0.8, face, { y: 1.2, z: 14.2 }, 0.6))
  g.add(rbox(16, 8.5, 0.6, shade(face, -0.12), { x: -11, y: 3.2, z: 14.7 }, 0.3))
  g.add(rbox(11, 3.4, 0.3, '#2c2f38', { x: -11, y: 6, z: 15.1 }, 0.1))
  for (const s of [-1, 1]) {
    g.add(cylZ(1.1, 0.3, '#f4f4f2', -11 + s * 3, 7.7, 15.3, 16))
    g.add(cylZ(0.4, 0.4, DARK, -11 + s * 3, 7.7, 15.4, 8))
  }
  for (const [x, a] of [
    [1.5, -0.35],
    [8, 0.3],
  ] as const) {
    g.add(glow(5.6, 3.2, meter, { x, y: 7.8, z: 14.8 }, 0.6))
    g.add(noOutline(rbox(0.25, 2.6, 0.2, DARK, { x, y: 7.9, z: 15.3, rz: a }, 0.05)))
  }
  for (let i = 0; i < 6; i++) g.add(rbox(2.6, 1.6, 2, '#d9dce1', { x: -0.5 + i * 3, y: 3, z: 14.9 }, 0.3))
  g.add(knob(1.5, 1.2, shade(face, -0.2), 17.5, 9, 14.6))
  g.add(knob(1.5, 1.2, shade(face, -0.2), 17.5, 4.5, 14.6))
  return ctr(g)
}

/** AV 功放：大音量旋钮 + 宽显示屏。[机身, 面板, 显示屏] */
function avReceiver(p: string[]) {
  const [body, face, disp] = p
  const g = new THREE.Group()
  feet4(g, 18, 15, 1.2, 1.8)
  g.add(rbox(43, 15, 37, body, { y: 1.2 }, 1))
  g.add(rbox(42.6, 14.6, 1, face, { y: 1.4, z: 18.3 }, 0.6))
  g.add(knob(4.5, 2, shade(face, -0.08), 14, 9, 18.7))
  g.add(knob(2.6, 1.6, shade(face, -0.08), -15, 9.5, 18.7))
  g.add(rbox(20, 4, 0.4, '#101014', { y: 9.6, z: 18.9 }, 0.2))
  readout(g, 18, 2.6, disp, 0, 10.3, 19.1)
  for (let i = 0; i < 8; i++) g.add(rbox(1.8, 0.8, 0.5, shade(face, -0.15), { x: -7.7 + i * 2.2, y: 5.6, z: 18.9 }, 0.2))
  g.add(cylZ(0.7, 0.5, DARK, -15, 4, 19, 12))
  g.add(led(-18.5, 13.5, 18.9, CYAN, 0.3))
  for (let i = 0; i < 6; i++) g.add(rbox(30, 0.4, 1, shade(body, -0.2), { y: 16, z: -12 + i * 3 }, 0.15))
  return ctr(g)
}

/** 回音壁 Soundbar：[机身, 布面, 指示灯] */
function soundbar(p: string[]) {
  const [body, fabric, ledC] = p
  const g = new THREE.Group()
  g.add(rbox(90, 6.5, 10, body, {}, 1.5))
  g.add(rbox(86, 4, 0.6, fabric, { y: 1.25, z: 5 }, 0.3))
  for (let i = 0; i < 4; i++) g.add(glow(0.5, 0.5, ledC, { x: -1.8 + i * 1.2, y: 0.6, z: 5.05 }, 0.9))
  g.add(rbox(4, 0.4, 2, shade(body, -0.15), { x: 38, y: 6.3 }, 0.15))
  return g
}

/** 低音炮：[箱体, 网罩, 点缀] */
function subwoofer(p: string[]) {
  const [body, grille, acc] = p
  const g = new THREE.Group()
  feet4(g, 10, 15, 1.5, 2)
  g.add(rbox(26, 36, 36, body, { y: 1.5 }, 1.5))
  g.add(cylZ(10.5, 0.6, shade(body, -0.15), 0, 20.5, 18))
  g.add(driver(9.5, grille, acc, 0, 20.5, 18.2))
  g.add(cylZ(2.4, 0.6, DARK, 0, 6, 18.1, 20))
  g.add(cylZ(1.8, 0.7, '#111114', 0, 6, 18.25, 20))
  return ctr(g)
}

/** 5.1 前置落地箱：细高、三个单元。[箱体, 单元, 银圈] */
function htTower(p: string[]) {
  const [body, cone, ring] = p
  const g = new THREE.Group()
  g.add(rbox(26, 2.5, 30, shade(body, -0.1), {}, 0.8))
  g.add(rbox(22, 98, 26, body, { y: 2.5 }, 1.5))
  g.add(driver(2, cone, ring, 0, 88, 13))
  g.add(driver(7, cone, ring, 0, 72, 13))
  g.add(driver(7, cone, ring, 0, 54, 13))
  g.add(cylZ(2.2, 0.6, '#111114', 0, 12, 13.1, 16))
  return g
}

/** 5.1 中置：横放。[箱体, 单元, 银圈] */
function htCenter(p: string[]) {
  const [body, cone, ring] = p
  const g = new THREE.Group()
  feet4(g, 22, 7, 1, 1.2)
  g.add(rbox(52, 16, 20, body, { y: 1 }, 1.5))
  for (const s of [-1, 1]) g.add(driver(5, cone, ring, s * 14, 9, 10))
  g.add(driver(1.9, cone, ring, 0, 9, 10))
  return ctr(g)
}

/** 5.1 环绕：小书架箱。[箱体, 单元, 银圈] */
function htSurround(p: string[]) {
  const [body, cone, ring] = p
  const g = new THREE.Group()
  g.add(rbox(15, 24, 14, body, {}, 1.2))
  g.add(driver(4.6, cone, ring, 0, 9, 7))
  g.add(driver(1.6, cone, ring, 0, 19, 7))
  return ctr(g)
}

/** 落地 HiFi 音箱：木箱、尖脚、大单元。[木色, 面板, 单元] */
function hifiTower(W: number, H: number, D: number, twoWoofers: boolean) {
  return (p: string[]) => {
    const [wood, baffle, cone] = p
    const g = new THREE.Group()
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.2, 0.2, 4, '#c3c7cc', { x: sx * (W / 2 - 3), z: sz * (D / 2 - 3) }, 12))
    g.add(rbox(W, H, D, wood, { y: 4 }, 1.2))
    g.add(rbox(W - 2, H - 2, 0.8, baffle, { y: 5, z: D / 2 }, 0.5))
    const z = D / 2 + 0.4
    const top = 4 + H
    g.add(driver(W * 0.09, cone, '#c3c7cc', 0, top - W * 0.25, z))
    g.add(driver(W * 0.24, cone, shade(baffle, -0.15), 0, top - W * 0.75, z))
    g.add(driver(W * 0.36, cone, shade(baffle, -0.15), 0, top - W * 1.5, z))
    if (twoWoofers) g.add(driver(W * 0.36, cone, shade(baffle, -0.15), 0, top - W * 2.35, z))
    g.add(cylZ(W * 0.1, 0.6, '#111114', 0, 4 + H * 0.12, z, 16))
    return ctr(g)
  }
}

/** 真空管功放：管子发橙光。[木座, 顶板, 变压器] */
function tubeAmp(p: string[]) {
  const [wood, plate, tf] = p
  const g = new THREE.Group()
  g.add(rbox(38, 9, 26, wood, {}, 1.2))
  g.add(rbox(36, 0.8, 24, plate, { y: 8.8 }, 0.3))
  for (const x of [-12, 0, 12]) g.add(rbox(8, x === 0 ? 9 : 7.5, 7, tf, { x, y: 9.6, z: -7.5 }, 1))
  for (const x of [-10.5, -3.5, 3.5, 10.5]) {
    g.add(cyl(2, 2, 0.8, DARK, { x, y: 9.6, z: 3.5 }, 16))
    g.add(cyl(0.9, 0.9, 4, '#8a8d93', { x, y: 10.6, z: 3.5 }, 12))
    g.add(noOutline(litOutlined(cyl(0.45, 0.45, 2.6, AMBER, { x, y: 11.4, z: 3.5 }, 8), AMBER, 1.2)))
    g.add(noOutline(litOutlined(ball(1.2, '#ff9a3c', { x, y: 12.6, z: 3.5 }, [1, 1.3, 1]), '#ff9a3c', 0.5)))
    g.add(ghost(capsule(1.6, 7, '#e8f4ff', { x, y: 10.4, z: 3.5 }), '#e8f4ff', 0.3))
  }
  for (const s of [-1, 1]) g.add(knob(1.8, 1.4, plate, s * 12, 4.5, 13))
  g.add(glow(8, 4, AMBER, { y: 2.6, z: 13.1 }, 0.6))
  g.add(noOutline(rbox(0.25, 3.2, 0.2, DARK, { x: 0.5, y: 2.9, z: 13.6, rz: -0.35 }, 0.05)))
  g.add(led(-16, 2, 13.1, C.red, 0.35))
  return ctr(g)
}

/** 圆柱蓝牙音箱：[布面, 端盖, 按键] */
function btCylinder(p: string[]) {
  const [fabric, cap, acc] = p
  const g = new THREE.Group()
  g.add(puck(4.5, 1.6, cap))
  g.add(cyl(4.4, 4.4, 15.2, fabric, { y: 1.2 }, 32))
  g.add(puck(4.5, 1.6, cap, { y: 16 }))
  for (const x of [-1.6, 0, 1.6]) g.add(cyl(0.6, 0.6, 0.5, acc, { x, y: 17.4 }, 12))
  g.add(P(torus(1.2, 0.3, cap), 0, 15, -4.6, 0, Math.PI / 2))
  return ctr(g)
}

/** 复古皮革蓝牙音箱：[皮革, 金属网, 把手] */
function btRetro(p: string[]) {
  const [leather, metal, strap] = p
  const g = new THREE.Group()
  g.add(rbox(18, 11, 8, leather, {}, 1.5))
  const holes: { kind: 'circle'; x: number; y: number; r: number }[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) holes.push({ kind: 'circle', x: -5.6 + c * 1.4, y: 1.2 + r * 1.3, r: 0.38 })
  g.add(holePanel(14.4, 7.4, 0.6, metal, holes, { y: 1.8, z: 4.05 }, 0.6))
  g.add(rbox(13, 6, 0.4, DARK, { y: 2.5, z: 3.7 }, 0.3))
  g.add(cyl(1.3, 1.3, 0.9, metal, { x: 5.5, y: 10.9 }, 16))
  g.add(P(torus(4, 0.5, strap, {}, Math.PI), 0, 10.6, 0))
  return g
}

/** 圆球蓝牙音箱：[外壳, 网点, 按键] */
function btBall(p: string[]) {
  const [body, dot, acc] = p
  const g = new THREE.Group()
  g.add(ball(6, body, { y: 6 }))
  for (let r = 0; r < 3; r++)
    for (let c = -2; c <= 2; c++) {
      const a = c * 0.26
      const e = (r - 1) * 0.26
      g.add(noOutline(ball(0.4, dot, { x: Math.sin(a) * Math.cos(e) * 6, y: 6 + Math.sin(e) * 6, z: Math.cos(a) * Math.cos(e) * 6 })))
    }
  g.add(cyl(1.3, 1.3, 0.6, acc, { y: 11.8 }, 16))
  g.add(P(torus(1.4, 0.35, acc), 4.2, 10.4, 0, 0, Math.PI / 2, -0.8))
  return ctr(g)
}

/** 耳机放大器：[机身, 面板, 旋钮] */
function headAmp(p: string[]) {
  const [body, face, kc] = p
  const g = new THREE.Group()
  g.add(rbox(12, 5, 18, body, {}, 0.8))
  g.add(rbox(11.6, 4.6, 0.6, face, { y: 0.2, z: 9 }, 0.3))
  g.add(knob(1.6, 1.4, kc, 2.6, 2.5, 9.2))
  g.add(cylZ(0.8, 0.4, '#c3c7cc', -2.8, 2.5, 9.4, 16))
  g.add(cylZ(0.35, 0.5, '#111114', -2.8, 2.5, 9.5, 8))
  g.add(led(-4.8, 3.8, 9.35, '#7dffa0', 0.25))
  g.add(rbox(0.6, 0.6, 1.4, '#c3c7cc', { x: 5, y: 3.4, z: 9.6 }, 0.2))
  return ctr(g)
}

// ======================================================================
// 影碟收藏
// ======================================================================

/** 在 p 的几种颜色里轮换并微调明暗：书脊 / 侧脊用 */
function spineColors(p: string[], n: number, seed: number) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const k = r()
    if (k < 0.12) return '#f4f4f2'
    if (k < 0.2) return '#2b2b30'
    return shade(p[i % 3], (r() - 0.5) * 0.18)
  })
}

/** 一排立着的 CD（带金属书立）：[色1, 色2, 色3] */
function cdRow(p: string[]) {
  const g = new THREE.Group()
  const n = 14
  const t = 1.04
  const W = n * t
  const cols = spineColors(p, n, 5)
  g.add(rbox(W + 0.8, 0.3, 11, '#8a8d93', {}, 0.1))
  for (const s of [-1, 1]) g.add(rbox(0.4, 13, 10, '#8a8d93', { x: s * (W / 2 + 0.2), y: 0.3 }, 0.15))
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + t * (i + 0.5)
    g.add(rbox(1, 14.2, 12.4, cols[i], { x, y: 0.3 }, 0.15))
    g.add(rbox(0.6, 2.4, 0.4, i % 3 === 0 ? '#2b2b30' : '#f4f4f2', { x, y: 9.8, z: 6.3 }, 0.1))
  }
  return g
}

const TOWER_BOARDS = [2, 18, 34, 50, 66, 82]
/** 落地 CD 架：六层开放层板。[木色, 背板, 挡条] */
function cdTower(p: string[]) {
  const [wood, back, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(1.6, 100, 20, wood, { x: s * 14.2 }, 0.4))
  g.add(rbox(26.8, 98, 0.6, back, { y: 1, z: -9.6 }, 0.1))
  g.add(rbox(26.8, 2, 1.5, wood, { z: 9 }, 0.3))
  for (const y of TOWER_BOARDS) {
    g.add(rbox(26.8, 1.6, 19.4, wood, { y, z: 0.3 }, 0.3))
    g.add(rbox(26.8, 1, 0.6, acc, { y: y + 1.6, z: 9.6 }, 0.2))
  }
  g.add(rbox(30, 1.6, 20, wood, { y: 98.4 }, 0.4))
  return g
}

/** 桌面 CD 架：两层，侧板带把手孔。[木色, 挡条, —] */
function cdDeskRack(p: string[]) {
  const [wood, acc] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(holePanel(16, 33.4, 1.4, wood, [{ kind: 'circle', x: 0, y: 25.5, r: 2.6 }], { x: s * 20.3, ry: Math.PI / 2 }, 2))
  for (const y of [0, 15.9, 31.9]) g.add(rbox(39.2, 1.5, 16, wood, { y }, 0.3))
  for (const y of [1.5, 17.4]) g.add(rbox(39.2, 3, 0.8, acc, { y, z: -7.6 }, 0.3))
  return g
}

/** 一排蓝光 / DVD 盒：[盒色, 侧脊 1, 侧脊 2] */
function bdRow(p: string[]) {
  const [caseC, a, b] = p
  const g = new THREE.Group()
  const n = 12
  const t = 1.5
  const r = rng(9)
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * t) / 2 + i * t
    g.add(rbox(1.4, 17.2, 13.5, caseC, { x }, 0.2))
    const c = r() < 0.5 ? shade(a, (r() - 0.5) * 0.2) : shade(b, (r() - 0.5) * 0.2)
    g.add(rbox(1, 13.6, 0.4, c, { x, y: 0.8, z: 6.8 }, 0.1))
    g.add(rbox(0.6, 1.4, 0.4, '#f4f4f2', { x, y: 15, z: 6.8 }, 0.1))
  }
  return g
}

/** 一排 VHS 录像带（纸套）：[色1, 色2, 色3] */
function vhsRow(p: string[]) {
  const g = new THREE.Group()
  const n = 8
  const t = 2.75
  const cols = spineColors(p, n, 21)
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * t) / 2 + i * t
    g.add(rbox(2.6, 18.8, 10.6, cols[i], { x }, 0.3))
    g.add(rbox(1.8, 9, 0.4, '#f4f4f2', { x, y: 6.5, z: 5.4 }, 0.15))
    g.add(rbox(1.8, 1.4, 0.4, shade(cols[i], -0.25), { x, y: 2.2, z: 5.4 }, 0.15))
  }
  return g
}

/** 卡带收纳盒（空心木盒，里面立着一排卡带）：[盒子, 色1, 色2] */
function cassetteBox(p: string[]) {
  const [box, a, b] = p
  const g = new THREE.Group()
  g.add(tray(30, 6.5, 12.5, 0.6, box, {}, 0.3))
  g.add(rbox(8, 2.4, 0.3, '#f4f4f2', { y: 2, z: 6.4 }, 0.1))
  const n = 15
  const r = rng(13)
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * 1.8) / 2 + i * 1.8
    g.add(rbox(1.6, 7, 10.9, '#dfe6ee', { x, y: 0.6 }, 0.2))
    g.add(rbox(1.2, 0.4, 10, shade(r() < 0.5 ? a : b, (r() - 0.5) * 0.25), { x, y: 7.4 }, 0.1))
  }
  return g
}

/** 电影海报（贴附物）：原点在背面中心 */
function poster(w: number, h: number, kind: PosterKind, framed: boolean) {
  return (p: string[]) => {
    const g = new THREE.Group()
    const key = `av-poster-${kind}-${p.join('')}`
    if (framed) {
      const f = '#2b2b30'
      for (const s of [-1, 1]) {
        g.add(rbox(w, 2.4, 2, f, { y: s > 0 ? h / 2 - 2.4 : -h / 2, z: 1 }, 0.4))
        g.add(rbox(2.4, h - 4.8, 2, f, { x: s * (w / 2 - 1.2), y: -h / 2 + 2.4, z: 1 }, 0.4))
      }
      g.add(rbox(w - 4, h - 4, 0.4, '#f4f4f2', { y: -h / 2 + 2, z: 0.2 }, 0.1))
      g.add(paintPanel(w - 7, h - 7, key, paintPoster(kind, p), { y: -h / 2 + 3.5, z: 0.75 }))
    } else {
      g.add(rbox(w, h, 0.2, '#f4f4f2', { y: -h / 2, z: 0.1 }, 0.05))
      g.add(paintPanel(w - 1.6, h - 1.6, key, paintPoster(kind, p), { y: -h / 2 + 0.8, z: 0.5 }))
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) g.add(ghost(rbox(5, 1.8, 0.1, '#fff6c8', { x: sx * (w / 2 - 2.6), y: sy * (h / 2 - 2.6) - 0.9, z: 0.8, rz: sx * sy * 0.78 }, 0.05), '#fff6c8', 0.6))
    }
    return g
  }
}

/** 贴附物居中：x / y 居中，背面贴 z = 0 */
function ctrStick(g: THREE.Group) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  g.position.set(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -b.min.z)
  const o = new THREE.Group()
  o.add(g)
  return o
}

/** 电影票根（三张，用图钉钉着）：[票 1, 票 2, 票 3] */
function ticketStubs(p: string[]) {
  const g = new THREE.Group()
  const spots: [number, number, number, number][] = [
    [-4, 2.5, 0.05, 0.14],
    [3, -0.5, 0.35, -0.18],
    [-1.5, -4, 0.65, 0.06],
  ]
  spots.forEach(([x, y, z, rz], i) => {
    const c = p[i % p.length]
    const t = new THREE.Group()
    t.add(
      paintPanel(
        13,
        5.6,
        `av-ticket-${c}`,
        (ctx, W, H) => {
          ctx.fillStyle = c
          ctx.fillRect(0, 0, W, H)
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.fillRect(W * 0.06, H * 0.2, W * 0.5, H * 0.16)
          for (let k = 0; k < 2; k++) ctx.fillRect(W * 0.06, H * (0.5 + k * 0.16), W * (0.38 - k * 0.1), Math.max(1, H * 0.07))
          ctx.fillStyle = '#ffffff'
          for (let k = 0; k < 8; k++) ctx.fillRect(W * 0.7, H * (0.08 + k * 0.11), Math.max(1, W * 0.008), H * 0.05)
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          for (let k = 0; k < 9; k++) ctx.fillRect(W * (0.76 + k * 0.022), H * 0.25, Math.max(1, W * (k % 3 === 0 ? 0.01 : 0.005)), H * 0.5)
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.beginPath()
          ctx.arc(W * 0.62, H * 0.5, H * 0.12, 0, Math.PI * 2)
          ctx.fill()
        },
        { x: 0, y: -2.8 },
      ),
    )
    t.position.set(x, y, z)
    t.rotation.z = rz
    g.add(t)
    g.add(ball(0.6, [C.red, '#5aa9ff', C.lemon][i], { x: x - 4.5 * Math.cos(rz), y: y - 4.5 * Math.sin(rz), z: z + 0.6 }, [1, 1, 0.8]))
  })
  return ctrStick(g)
}

/** 胶片盘：两个片盒叠放 + 一只缠着胶片的开放片盘。[片盒, 片盘, 胶片] */
function filmReels(p: string[]) {
  const [can, reel, film] = p
  const g = new THREE.Group()
  g.add(cyl(13, 13, 2.4, can, {}, 40))
  g.add(cyl(13.3, 13.3, 1, shade(can, -0.1), { y: 1.6 }, 40))
  g.add(cyl(13, 13, 2.4, shade(can, 0.04), { x: 1.5, y: 2.6, z: -1 }, 40))
  g.add(cyl(13.3, 13.3, 1, shade(can, -0.06), { x: 1.5, y: 4.2, z: -1 }, 40))
  g.add(cyl(4, 4, 0.3, '#f4f4f2', { x: 1.5, y: 5.2, z: 7 }, 20))
  const rx = -0.5
  const rz = 0.5
  g.add(cyl(1.5, 1.5, 2.8, reel, { x: rx, y: 5.2, z: rz }, 16))
  g.add(cyl(8.5, 8.5, 2, film, { x: rx, y: 5.6, z: rz }, 32))
  for (const y of [5.4, 7.8]) g.add(P(reelDisc(11.5, 0.4, reel), rx, y, rz, -Math.PI / 2))
  return ctr(g)
}

/** 场记板（平放，拍板张开）：[板, 条纹 1, 条纹 2] */
function clapper(p: string[]) {
  const [board, a, b] = p
  const g = new THREE.Group()
  const stripes = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.fillStyle = a
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = b
    for (let x = -H; x < W + H; x += H * 2.2) {
      ctx.beginPath()
      ctx.moveTo(x, H)
      ctx.lineTo(x + H * 1.1, H)
      ctx.lineTo(x + H * 2.2, 0)
      ctx.lineTo(x + H * 1.1, 0)
      ctx.fill()
    }
  }
  g.add(rbox(28, 1.2, 22, board, { z: 2 }, 0.4))
  g.add(
    paintPanel(
      26,
      20,
      `av-slate-${board}`,
      (ctx, W, H) => {
        ctx.fillStyle = board
        ctx.fillRect(0, 0, W, H)
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = Math.max(2, H * 0.012)
        for (const y of [0.3, 0.55, 0.8]) {
          ctx.beginPath()
          ctx.moveTo(W * 0.03, H * y)
          ctx.lineTo(W * 0.97, H * y)
          ctx.stroke()
        }
        for (const x of [0.35, 0.68]) {
          ctx.beginPath()
          ctx.moveTo(W * x, H * 0.3)
          ctx.lineTo(W * x, H * 0.8)
          ctx.stroke()
        }
      },
      { y: 1.25, z: 12, rx: -Math.PI / 2 },
    ),
  )
  g.add(rbox(28, 1.2, 3.6, board, { z: -10.8 }, 0.3))
  g.add(paintPanel(27.6, 3.2, `av-clap-${a}-${b}`, stripes, { y: 1.25, z: -9.2, rx: -Math.PI / 2 }))
  const top = new THREE.Group()
  top.add(rbox(28, 1.2, 3.6, board, { x: 14 }, 0.3))
  top.add(paintPanel(27.6, 3.2, `av-clap-${a}-${b}`, stripes, { x: 14, y: 1.25, z: 1.6, rx: -Math.PI / 2 }))
  g.add(P(top, -14, 1.25, -10.8, 0, 0.32))
  g.add(cyl(0.7, 0.7, 2.7, '#c3c7cc', { x: -12.8, z: -10.8 }, 12))
  return ctr(g)
}

// ======================================================================
// 爆米花
// ======================================================================

/** 一堆爆米花：在 w × d 的范围里堆成小丘 */
function popcornPile(g: THREE.Group, cx: number, cz: number, w: number, d: number, y0: number, peak: number, n: number, seed: number) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1
    const v = r() * 2 - 1
    const k = 1 - Math.max(Math.abs(u), Math.abs(v))
    const rad = 1 + r() * 0.5
    g.add(ball(rad, r() < 0.75 ? '#fff4d6' : '#ffe08f', { x: cx + (u * w) / 2, y: y0 + rad * 0.8 + r() * peak * k, z: cz + (v * d) / 2 }, [1, 0.85, 1]))
  }
}

/** 复古爆米花推车：[车身, 奶油色, 金色] */
function popcornCart(p: string[]) {
  const [red, cream, gold] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 31.5
    g.add(P(torus(13.5, 1.2, DARK), x, 15, -10, 0, Math.PI / 2))
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      g.add(stick3([x, 15, -10], [x, 15 + Math.sin(a) * 13, -10 + Math.cos(a) * 13], 0.5, gold))
    }
    g.add(cylX(2, 3, gold, x, 15, -10, 20))
    g.add(cyl(1.4, 1.4, 16, gold, { x: s * 26, z: 14 }, 12))
    g.add(puck(2.2, 1.2, DARK, { x: s * 26, z: 14 }))
  }
  g.add(cylX(0.9, 60, DARK, 0, 15, -10, 20))
  g.add(rbox(60, 46, 40, red, { y: 16 }, 2))
  g.add(rbox(48, 28, 0.6, cream, { y: 24, z: 20.1 }, 0.4))
  g.add(rbox(56, 2, 0.8, gold, { y: 57, z: 20.1 }, 0.3))
  // 玻璃柜
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2.5, 46, 2.5, red, { x: sx * 28.75, y: 62, z: sz * 18.75 }, 0.6))
  g.add(ghost(rbox(55, 45.6, 35.5, C.glass, { y: 62.2 }, 0.3), C.glass, 0.22))
  popcornPile(g, 0, 0, 48, 28, 62, 5, 80, 31)
  g.add(cyl(0.6, 0.6, 12, '#c3c7cc', { y: 96 }, 8))
  g.add(cyl(8, 6.5, 8, '#c3c7cc', { y: 88 }, 24))
  g.add(cyl(8.4, 8.4, 0.8, '#a9adb3', { y: 95.6 }, 24))
  // 屋顶
  g.add(rbox(64, 3, 44, red, { y: 108 }, 1))
  const roof = new THREE.Group()
  roof.add(P(cyl(3, 45.3, 12, red, {}, 4), 0, 6, 0, 0, Math.PI / 4))
  roof.scale.z = 44 / 64
  roof.position.y = 111
  g.add(roof)
  g.add(ball(2.4, gold, { y: 125.2 }))
  g.add(rbox(30, 7, 1, cream, { y: 111.5, z: 21.5 }, 0.4))
  g.add(rbox(32, 1, 1.2, gold, { y: 118.5, z: 21.5 }, 0.3))
  // 推把
  for (const s of [-1, 1]) g.add(stick3([s * 22, 52, -20], [s * 22, 72, -34], 1, gold))
  g.add(cylX(1.4, 48, DARK, 0, 72, -34, 20))
  return ctr(g)
}

/** 桌面爆米花机：[机身, 奶油色, 金色] */
function popcornMachine(p: string[]) {
  const [red, cream, gold] = p
  const g = new THREE.Group()
  feet4(g, 18, 11, 1.5, 1.6)
  g.add(rbox(42, 12, 28, red, { y: 1.5 }, 1.5))
  g.add(rbox(28, 8, 0.5, cream, { y: 3.5, z: 14.1 }, 0.3))
  g.add(cylZ(0.9, 0.8, gold, 10, 7.5, 14.4, 12))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2, 32, 2, red, { x: sx * 20, y: 13.5, z: sz * 13 }, 0.5))
  g.add(ghost(rbox(38.5, 31.6, 24.5, C.glass, { y: 13.7 }, 0.3), C.glass, 0.22))
  popcornPile(g, 0, 0, 33, 19, 13.5, 3, 40, 37)
  g.add(cyl(0.5, 0.5, 8, '#c3c7cc', { y: 37.5 }, 8))
  g.add(cyl(5.5, 4.5, 6, '#c3c7cc', { y: 32 }, 20))
  g.add(rbox(44, 3, 30, red, { y: 45.5 }, 1))
  g.add(rbox(44.4, 1, 30.4, gold, { y: 45.2 }, 0.3))
  g.add(cyl(9, 13, 4, red, { y: 48.5 }, 24))
  g.add(ball(1.8, gold, { y: 54 }))
  return g
}

/** 爆米花桶：空心条纹纸桶，口沿以下装满爆米花。[桶色, 条纹, 爆米花] */
function popcornBucket(p: string[]) {
  const [white, stripe, pop] = p
  const g = new THREE.Group()
  g.add(cup(7.5, 5.5, 18, 0.4, white))
  for (let k = 0; k < 8; k++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(7.51, 5.57, 17, 6, 1, true, (k * Math.PI) / 4, Math.PI / 8), toon(stripe))
    m.position.y = 9
    m.castShadow = true
    g.add(m)
  }
  g.add(puck(6.5, 1.2, pop, { y: 15.2 }))
  const r = rng(41)
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 5.2
    const rad = 1 + r() * 0.4
    g.add(ball(rad, r() < 0.7 ? pop : '#ffe08f', { x: Math.cos(a) * d, y: 16.2 + r() * 1.3 + (1 - d / 5.2) * 0.8, z: Math.sin(a) * d }, [1, 0.85, 1]))
  }
  return g
}

// ======================================================================
// 家庭影院氛围
// ======================================================================

const CURTAIN_MOUNT = 10
/** 影院遮光帘：丝绒帘 + 垂花帷幔 + 金色流苏，后面一层遮光衬布。[丝绒, 金色, 遮光布] */
function theaterCurtain(p: string[]) {
  const [velvet, gold, liner] = p
  const g = new THREE.Group()
  const y0 = CURTAIN_MOUNT
  const top = y0 + 235
  g.add(rbox(224, 228, 0.6, liner, { y: y0 + 2, z: -6.7 }, 0.2))
  for (const s of [-1, 1]) {
    g.add(rbox(3, 4, 4, gold, { x: s * 105, y: top - 14, z: -4.4 }, 0.4))
    for (let i = 0; i < 11; i++) {
      const x = s * (34 + i * 7.2)
      g.add(capsule(4.2, 212, i % 2 ? shade(velvet, -0.06) : velvet, { x, y: y0, z: i % 2 ? -1.6 : 0 }))
    }
    g.add(rbox(84, 6, 11, gold, { x: s * 72, y: 92, z: 0 }, 2.5))
    g.add(cyl(0.6, 0.6, 10, gold, { x: s * 36, y: 84, z: 5 }, 8))
    g.add(cyl(2.2, 0.6, 7, gold, { x: s * 36, y: 77, z: 5 }, 12))
  }
  g.add(rbox(232, 26, 10, velvet, { y: top - 26, z: -1 }, 2))
  for (let i = 0; i < 5; i++) {
    const x = -92 + i * 46
    g.add(ball(23, shade(velvet, 0.03), { x, y: top - 26, z: 0 }, [1, 0.35, 0.22]))
    g.add(cyl(1.6, 0.5, 6, gold, { x: x + 23, y: top - 34, z: 1.5 }, 10))
  }
  g.add(rbox(234, 3, 11, gold, { y: top - 2.7, z: -1 }, 0.8)) // 比丝绒帘头高 0.3，顶面不共面
  return g
}

/** 影院沙发（带杯架扶手）：[皮面, 扶手 / 头枕, 杯架] */
function theaterSofa(seats: number) {
  return (p: string[]) => {
    const [main, acc, cupC] = p
    const g = new THREE.Group()
    const W = seats * 60 + (seats + 1) * 18
    for (let i = 0; i <= seats; i++) {
      const x = -W / 2 + 9 + i * 78
      g.add(rbox(18, 52, 88, shade(main, -0.04), { x, z: -2 }, 3))
      g.add(holePanel(18, 88, 8, acc, [{ kind: 'circle', x: 0, y: 16, r: 3.9 }], { x, y: 56, z: 42, rx: -Math.PI / 2 }, 3))
      g.add(cup(3.7, 3.2, 7.6, 0.3, cupC, { x, y: 52.2, z: 26 }))
    }
    for (let j = 0; j < seats; j++) {
      const cx = -W / 2 + 48 + j * 78
      g.add(rbox(60, 26, 84, main, { x: cx, z: -2 }, 3))
      g.add(rbox(56, 22, 6, shade(main, -0.08), { x: cx, y: 3, z: 41 }, 2))
      g.add(rbox(58, 16, 60, main, { x: cx, y: 24, z: 10 }, 6))
      const back = new THREE.Group()
      back.add(rbox(58, 66, 22, main, {}, 6))
      back.add(rbox(48, 16, 10, acc, { y: 50, z: 9 }, 4))
      g.add(P(back, cx, 24, -30, -0.15))
    }
    return ctr(g)
  }
}

// ======================================================================
// 目录
// ======================================================================

const PRJ_HOME: Pal[] = [
  ['modern', [M.white, M.char, M.silver]],
  ['modern', [M.char, M.silver, M.black]],
  ['nordic', [N.white, N.oak, N.gray]],
  ['cute', [C.white, C.sky, C.pink]],
]
const PRJ_CUBE: Pal[] = [
  ['cute', [C.pink, C.white, C.lemon]],
  ['cute', [C.mint, C.white, C.sky]],
  ['cute', [C.lemon, C.white, C.pink]],
  ['modern', [M.white, M.char, M.silver]],
  ['retro', [R.mustard, R.cream, R.caramel]],
]
const PRJ_CAN: Pal[] = [
  ['modern', [M.char, M.gray, M.silver]],
  ['modern', [M.silver, M.char, M.white]],
  ['nordic', [N.sage, N.linen, N.oak]],
  ['cute', [C.lilac, C.white, C.pink]],
]
const PRJ_UST: Pal[] = [
  ['modern', [M.white, M.light, M.silver]],
  ['modern', [M.black, M.char, M.char]],
  ['nordic', [N.white, N.linen, N.oakL]],
]
const PRJ_FILM: Pal[] = [
  ['retro', ['#5a5f66', M.silver, M.silver]],
  ['retro', [R.teal, M.silver, '#c3c7cc']],
  ['industrial', [I.iron, I.steel, I.steel]],
  ['modern', [M.black, M.silver, M.silver]],
]
const SCR_TRIPOD: Pal[] = [
  ['modern', [M.silver, '#232327', M.char]],
  ['modern', [M.char, '#232327', M.black]],
  ['nordic', [N.white, '#2a2a2e', N.oak]],
  ['cute', [C.white, '#2a2a2e', C.pink]],
]
const SCR_PULL: Pal[] = [
  ['modern', [M.white, M.char, M.char]],
  ['modern', [M.black, M.char, M.silver]],
  ['nordic', [N.white, N.oak, N.oak]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
const SCR_ELEC: Pal[] = [
  ['modern', [M.white, M.light, '#7dffa0']],
  ['modern', [M.black, M.char, '#ff7466']],
  ['modern', [M.silver, M.char, CYAN]],
]
const SCR_FRAME: Pal[] = [
  ['modern', [M.black, '#1d1d21', M.char]],
  ['modern', [M.silver, '#1d1d21', M.char]],
  ['industrial', [I.iron, '#1d1d21', I.walnut]],
]
const STAND_TRI: Pal[] = [
  ['modern', [M.black, M.char, M.char]],
  ['modern', [M.silver, M.white, M.char]],
  ['industrial', [I.iron, I.walnut, I.iron]],
  ['nordic', [N.white, N.oak, N.gray]],
]
const STAND_ARM: Pal[] = [
  ['modern', [M.silver, M.char, M.char]],
  ['modern', [M.black, M.black, M.char]],
  ['nordic', [N.white, N.oak, N.white]],
  ['cute', [C.white, C.pink, C.white]],
]
const CDP: Pal[] = [
  ['modern', [M.silver, M.silver, CYAN]],
  ['modern', [M.black, M.char, AMBER]],
  ['modern', [M.char, M.black, '#7dffa0']],
  ['retro', [R.caramel, R.cream, AMBER]],
  ['nordic', [N.white, N.linen, CYAN]],
]
const BOOM: Pal[] = [
  ['retro', [M.silver, DARK, M.black]],
  ['retro', [R.red, DARK, M.silver]],
  ['retro', [R.mustard, '#4a4a4f', R.caramel]],
  ['cute', [C.pink, C.white, C.white]],
  ['cute', [C.sky, '#ffffff', C.lemon]],
]
const DISCMAN: Pal[] = [
  ['modern', [M.silver, M.light, M.char]],
  ['retro', [R.teal, R.cream, R.orange]],
  ['cute', [C.lilac, C.white, C.pink]],
  ['cute', [C.mint, C.white, C.lemon]],
]
const WALKMAN: Pal[] = [
  ['retro', [M.silver, M.char, R.orange]],
  ['retro', [R.mustard, '#5a5f66', R.orange]],
  ['retro', [R.red, M.char, R.orange]],
  ['cute', [C.sky, C.white, C.pink]],
  ['modern', [M.black, M.char, M.char]],
]
const COMPO: Pal[] = [
  ['modern', [M.silver, M.char, CYAN]],
  ['modern', [M.black, M.black, AMBER]],
  ['nordic', [N.white, N.oak, CYAN]],
  ['retro', [R.cream, R.caramel, AMBER]],
  ['cute', [C.white, C.sakura, '#7dffa0']],
]
const BDP: Pal[] = [
  ['modern', [M.black, M.black, '#5aa9ff']],
  ['modern', [M.char, M.black, CYAN]],
  ['modern', [M.silver, M.char, '#7dffa0']],
  ['nordic', [N.white, N.white, CYAN]],
]
const DECK: Pal[] = [
  ['retro', [M.silver, M.silver, AMBER]],
  ['retro', [M.black, M.char, AMBER]],
  ['retro', [R.caramel, R.cream, AMBER]],
  ['industrial', [I.iron, I.steel, AMBER]],
]
const AVR: Pal[] = [
  ['modern', [M.black, M.black, CYAN]],
  ['modern', [M.silver, M.silver, CYAN]],
  ['modern', [M.char, M.char, AMBER]],
  ['retro', [R.caramel, M.silver, AMBER]],
]
const BAR: Pal[] = [
  ['modern', [M.black, M.char, '#ffffff']],
  ['modern', [M.char, M.gray, CYAN]],
  ['modern', [M.white, M.light, '#7dffa0']],
  ['nordic', [N.white, N.linen, '#ffffff']],
]
const HT: Pal[] = [
  ['modern', [M.black, DARK, M.silver]],
  ['modern', [M.white, M.char, M.silver]],
  ['industrial', [I.walnut, DARK, I.steel]],
  ['nordic', [N.oak, M.char, M.silver]],
]
const HIFI: Pal[] = [
  ['retro', [R.caramel, R.cream, DARK]],
  ['industrial', [I.walnut, I.iron, DARK]],
  ['nordic', [N.oak, N.white, M.char]],
  ['modern', [M.walnut, M.black, M.char]],
  ['japanese', [J.wood, J.sumi, J.dark]],
]
const TUBE: Pal[] = [
  ['retro', [R.caramel, M.silver, M.black]],
  ['industrial', [I.walnut, I.steel, I.iron]],
  ['modern', [M.black, M.char, M.black]],
  ['nordic', [N.oak, N.white, M.char]],
]
const BT_CYL: Pal[] = [
  ['modern', [M.char, M.black, M.silver]],
  ['nordic', [N.blue, N.white, N.white]],
  ['nordic', [N.sage, N.white, N.oak]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['cute', [C.sky, C.white, C.white]],
]
const BT_RETRO: Pal[] = [
  ['retro', [R.caramel, M.silver, shade(R.caramel, -0.15)]],
  ['retro', [R.cream, M.silver, R.caramel]],
  ['retro', [R.teal, M.silver, R.caramel]],
  ['industrial', [I.leather, I.steel, I.walnut]],
]
const BT_BALL: Pal[] = [
  ['cute', [C.pink, C.white, C.lemon]],
  ['cute', [C.mint, C.white, C.pink]],
  ['cute', [C.lemon, C.white, C.sky]],
  ['cute', [C.lilac, C.white, C.mint]],
]
const HPA: Pal[] = [
  ['modern', [M.black, M.char, M.silver]],
  ['modern', [M.silver, M.silver, M.char]],
  ['retro', [R.caramel, R.cream, M.silver]],
  ['industrial', [I.iron, I.steel, I.walnut]],
]
const SPINES: Pal[] = [
  ['retro', [R.mustard, R.teal, R.orange]],
  ['cute', [C.pink, C.sky, C.lemon]],
  ['modern', [M.char, M.light, '#e05a3a']],
  ['nordic', [N.sage, N.blue, N.mustard]],
]
const RACK: Pal[] = [
  ['nordic', [N.oak, N.white, N.oak]],
  ['modern', [M.white, M.white, M.char]],
  ['modern', [M.black, M.char, M.black]],
  ['industrial', [I.walnut, I.iron, I.iron]],
  ['cute', [C.white, C.sakura, C.pink]],
]
const DESK_RACK: Pal[] = [
  ['nordic', [N.oak, N.white]],
  ['modern', [M.white, M.char]],
  ['industrial', [I.walnut, I.iron]],
  ['cute', [C.woodL, C.pink]],
]
const BD_CASES: Pal[] = [
  ['modern', ['#2f6fd0', M.white, M.char]],
  ['modern', ['#1d1d21', M.white, '#e05a3a']],
  ['cute', ['#7fb6e6', C.pink, C.lemon]],
  ['retro', [R.teal, R.cream, R.orange]],
]
const VHS: Pal[] = [
  ['retro', [R.mustard, R.red, R.teal]],
  ['retro', [R.cream, R.orange, R.caramel]],
  ['modern', [M.black, M.white, M.gray]],
  ['cute', [C.pink, C.sky, C.mint]],
]
const TAPE_BOX: Pal[] = [
  ['retro', [R.caramel, R.orange, R.teal]],
  ['nordic', [N.oak, N.mustard, N.blue]],
  ['modern', [M.char, M.light, '#e05a3a']],
  ['cute', [C.white, C.pink, C.sky]],
]
const POSTER_SIL: Pal[] = [
  ['retro', [R.teal, R.orange, R.cream]],
  ['modern', ['#3b2d5c', '#e2704f', '#ffd27a']],
  ['modern', [M.light, M.gray, '#e05a3a']],
  ['nordic', [N.blue, N.linen, N.mustard]],
]
const POSTER_SPACE: Pal[] = [
  ['modern', ['#0b1030', '#e98b5a', '#c9d4ff']],
  ['modern', ['#1d1d21', '#5aa9ff', '#ffd27a']],
  ['cute', ['#3a2f6a', C.pink, C.lemon]],
  ['retro', ['#203a4a', R.orange, R.mustard]],
]
const POSTER_RETRO: Pal[] = [
  ['retro', [R.cream, R.orange, R.teal]],
  ['retro', [R.mustard, R.red, R.cream]],
  ['cute', [C.cream, C.pink, C.sky]],
  ['japanese', [J.washi, J.shu, J.ai]],
]
const REELS: Pal[] = [
  ['retro', [M.silver, M.silver, '#3a2f2a']],
  ['retro', [R.teal, M.silver, '#3a2f2a']],
  ['industrial', [I.steel, I.iron, '#3a2f2a']],
  ['modern', [M.char, M.silver, '#3a2f2a']],
]
const CLAP: Pal[] = [
  ['modern', [DARK, '#ffffff', DARK]],
  ['retro', [DARK, R.mustard, DARK]],
  ['modern', [DARK, '#ffffff', '#e05a3a']],
  ['cute', [C.lilac, C.white, C.pink]],
]
const POPCORN: Pal[] = [
  ['retro', [R.red, R.cream, R.mustard]],
  ['retro', [R.teal, R.cream, R.mustard]],
  ['cute', [C.pink, C.white, C.lemon]],
  ['cute', [C.sky, C.white, C.lemon]],
]
const BUCKET: Pal[] = [
  ['retro', ['#ffffff', R.red, '#fff1c4']],
  ['retro', ['#ffffff', R.teal, '#fff1c4']],
  ['cute', ['#ffffff', C.pink, '#fff1c4']],
  ['cute', ['#ffffff', C.sky, '#fff1c4']],
]
const TICKETS: Pal[] = [
  ['retro', [R.orange, R.teal, R.mustard]],
  ['cute', [C.pink, C.sky, C.lemon]],
  ['modern', [M.light, '#e05a3a', M.char]],
  ['nordic', [N.sage, N.mustard, N.blue]],
]
const CURTAIN: Pal[] = [
  ['retro', ['#9a2a2a', R.mustard, '#1d1d21']],
  ['retro', [R.teal, R.mustard, '#1d1d21']],
  ['modern', [M.char, M.silver, '#1d1d21']],
  ['modern', ['#2f3d5a', '#c9a24a', '#1d1d21']],
  ['nordic', [N.gray, N.oak, '#2a2a2e']],
]
const SOFA: Pal[] = [
  ['modern', [M.black, M.char, M.silver]],
  ['modern', [M.char, M.gray, M.silver]],
  ['retro', ['#9a2a2a', R.caramel, M.silver]],
  ['industrial', [I.leather, I.walnut, I.steel]],
  ['nordic', [N.gray, N.linen, M.silver]],
]

const both = <T,>(f: (on: boolean) => T) => [f(false), f(true)] as const

const [homeOff, homeOn] = both(homeProjector)
const [cubeOff, cubeOn] = both(cubeProjector)
const [canOff, canOn] = both(canProjector)
const [ustOff, ustOn] = both(ustProjector)
const [filmOff, filmOn] = both(filmProjector)

export const AV: AssetDef[] = [
  // ---------- 投影仪 ----------
  define('av-projector', '家用投影仪', 'appliance', [30, 24.5, 10.6], PRJ_HOME, homeOff, { ...PROP, form: 'closed', formLabel: '待机' }),
  define('av-projector-on', '家用投影仪', 'appliance', [35, 54.6, 15.6], PRJ_HOME, homeOn, { ...PROP, form: 'open', formLabel: '投影中' }),
  define('av-projector-cube', '迷你方块投影仪', 'appliance', [10, 11.4, 10.4], PRJ_CUBE, cubeOff, { ...PROP, form: 'closed', formLabel: '待机' }),
  define('av-projector-cube-on', '迷你方块投影仪', 'appliance', [20, 36.8, 11.5], PRJ_CUBE, cubeOn, { ...PROP, form: 'open', formLabel: '投影中' }),
  define('av-projector-can', '迷你圆筒投影仪', 'appliance', [8.6, 9.5, 15.7], PRJ_CAN, canOff, { ...PROP, form: 'closed', formLabel: '待机' }),
  define('av-projector-can-on', '迷你圆筒投影仪', 'appliance', [18, 34.6, 16.6], PRJ_CAN, canOn, { ...PROP, form: 'open', formLabel: '投影中' }),
  define('av-projector-ust', '短焦投影仪', 'appliance', [55, 33.4, 12.4], PRJ_UST, ustOff, { ...PROP, form: 'closed', formLabel: '待机' }),
  define('av-projector-ust-on', '短焦投影仪', 'appliance', [55, 33.2, 60.4], PRJ_UST, ustOn, { ...PROP, form: 'open', formLabel: '投影中' }),
  define('av-film-projector', '胶片放映机', 'appliance', [30.6, 45, 43.5], PRJ_FILM, filmOff, { ...PROP, form: 'closed', formLabel: '待机' }),
  define('av-film-projector-on', '胶片放映机', 'appliance', [32.6, 70, 43.5], PRJ_FILM, filmOn, { ...PROP, form: 'open', formLabel: '投影中' }),

  // ---------- 幕布 ----------
  define('av-screen-tripod', '三脚架幕布', 'living', [175, 60.2, 228], SCR_TRIPOD, tripodScreen(true), { form: 'open', formLabel: '展开' }),
  define('av-screen-tripod-closed', '三脚架幕布', 'living', [175, 60.2, 134], SCR_TRIPOD, tripodScreen(false), { form: 'closed', formLabel: '收起' }),
  define('av-screen-pull', '壁挂手拉幕布', 'living', [211, 9, 180.3], SCR_PULL, pullScreen(true), { form: 'open', formLabel: '展开', mount: 70 }),
  define('av-screen-pull-closed', '壁挂手拉幕布', 'living', [211, 9, 20.3], SCR_PULL, pullScreen(false), { form: 'closed', formLabel: '收起', mount: 230 }),
  define('av-screen-electric', '电动幕布', 'living', [242, 11, 174.3], SCR_ELEC, electricScreen(true), { form: 'open', formLabel: '展开', mount: 81 }),
  define('av-screen-electric-closed', '电动幕布', 'living', [242, 11, 12.8], SCR_ELEC, electricScreen(false), { form: 'closed', formLabel: '收起', mount: 242.5 }),
  define('av-screen-frame', '画框幕布', 'living', [164, 50, 150], SCR_FRAME, frameScreen),

  // ---------- 投影支架 ----------
  define('av-stand-tripod', '落地投影支架', 'living', [62.5, 54.6, 119], STAND_TRI, tripodStand, { surface: STAND_TOP, surfaceShape: [rectPoly(-17.2, -4.7, 17.2, 21.7)] }),
  define('av-stand-arm', '床头悬臂投影支架', 'bedroom', [40, 90, 151], STAND_ARM, armStand, { surface: ARM_TOP, surfaceShape: [rectPoly(-14.2, 21.8, 14.2, 45)] }),

  // ---------- 播放器 ----------
  define('av-cd-player', 'CD 机', 'appliance', [43, 30.7, 9], CDP, cdPlayer(false), { ...PROP, form: 'closed' }),
  define('av-cd-player-open', 'CD 机', 'appliance', [43, 44.1, 9], CDP, cdPlayer(true), { ...PROP, form: 'open' }),
  define('av-boombox', '手提 CD 收音机', 'appliance', [52, 18.2, 31.6], BOOM, boombox, PROP),
  define('av-discman', 'Discman 随身 CD', 'appliance', [20, 14, 3], DISCMAN, discman, PROP),
  define('av-walkman', '卡带随身听', 'appliance', [30.4, 9.4, 8.8], WALKMAN, walkman, PROP),
  define('av-mini-compo', '迷你组合音响', 'appliance', [54, 27.4, 26.3], COMPO, miniCompo, PROP),
  define('av-bd-player', '蓝光播放机', 'appliance', [43, 21, 5.2], BDP, bdPlayer, PROP),
  define('av-cassette-deck', '卡带机', 'appliance', [43, 30, 13], DECK, cassetteDeck, PROP),
  define('av-receiver', 'AV 功放', 'appliance', [43, 39.4, 16.4], AVR, avReceiver, PROP),
  define('av-tube-amp', '真空管功放', 'appliance', [38, 27.6, 20.6], TUBE, tubeAmp, PROP),
  define('av-headphone-amp', '耳机放大器', 'appliance', [12, 19.8, 5], HPA, headAmp, PROP),

  // ---------- 音箱 ----------
  define('av-soundbar', '回音壁 Soundbar', 'appliance', [90, 10.4, 6.7], BAR, soundbar, PROP),
  define('av-ht-front', '家庭影院音箱', 'living', [26, 30, 100.5], HT, htTower, { sizeLabel: '前置落地箱' }),
  define('av-ht-center', '家庭影院音箱', 'living', [52, 21.8, 17], HT, htCenter, { ...PROP, sizeLabel: '中置' }),
  define('av-ht-surround', '家庭影院音箱', 'living', [15, 15.7, 24], HT, htSurround, { ...PROP, sizeLabel: '环绕' }),
  define('av-ht-sub', '家庭影院音箱', 'living', [26, 38.7, 37.5], HT, subwoofer, { sizeLabel: '低音炮' }),
  define('av-hifi-tower', '落地 HiFi 音箱', 'living', [24, 32.8, 90], HIFI, hifiTower(24, 86, 30, false), { sizeLabel: '中' }),
  define('av-hifi-tower-l', '落地 HiFi 音箱', 'living', [30, 41.1, 108], HIFI, hifiTower(30, 104, 38, true), { sizeLabel: '大' }),
  define('av-bt-cylinder', '圆柱蓝牙音箱', 'appliance', [9, 10.6, 17.9], BT_CYL, btCylinder, PROP),
  define('av-bt-retro', '复古皮革蓝牙音箱', 'appliance', [18, 8.4, 15.1], BT_RETRO, btRetro, PROP),
  define('av-bt-ball', '圆球蓝牙音箱', 'appliance', [12, 12.4, 12.4], BT_BALL, btBall, PROP),

  // ---------- 影碟收藏 ----------
  define('av-cd-row', 'CD 一排', 'hobby', [15.4, 12.4, 14.5], SPINES, cdRow, PROP),
  define('av-cd-tower', '落地 CD 架', 'hobby', [30, 20, 100], RACK, cdTower, {
    surface: 100,
    surfaces: TOWER_BOARDS.map((y, i) => ({ y: y + 1.6, h: i === TOWER_BOARDS.length - 1 ? 14.8 : 14.4, shape: [rectPoly(-13.4, -9.2, 13.4, 9.2)] })),
  }),
  define('av-cd-rack-desk', '桌面 CD 架', 'hobby', [42, 16, 33.4], DESK_RACK, cdDeskRack, {
    ...PROP,
    surface: 33.4,
    surfaces: [
      { y: 1.5, h: 14.4, shape: [rectPoly(-19.6, -7.2, 19.6, 8)] },
      { y: 17.4, h: 14.5, shape: [rectPoly(-19.6, -7.2, 19.6, 8)] },
    ],
  }),
  define('av-bd-row', '蓝光碟一排', 'hobby', [17.9, 13.9, 17.2], BD_CASES, bdRow, PROP),
  define('av-vhs-row', '录像带一排', 'hobby', [21.9, 11, 18.8], VHS, vhsRow, PROP),
  define('av-cassette-box', '卡带收纳盒', 'hobby', [30, 12.6, 7.6], TAPE_BOX, cassetteBox, PROP),
  define('av-film-reels', '胶片盘', 'hobby', [28, 28, 8.2], REELS, filmReels, PROP),
  define('av-clapper', '场记板', 'hobby', [28.5, 34.2, 2.7], CLAP, clapper, PROP),

  // ---------- 海报 / 票根 ----------
  define('av-poster', '电影海报', 'deco', [51.5, 0.9, 72.8], POSTER_SIL, poster(51.5, 72.8, 'silhouette', false), { stick: true, prop: true, sizeLabel: 'B2 剪影' }),
  define('av-poster-space', '电影海报', 'deco', [51.5, 2, 72.8], POSTER_SPACE, poster(51.5, 72.8, 'space', true), { stick: true, prop: true, sizeLabel: 'B2 太空（带框）' }),
  define('av-poster-retro', '电影海报', 'deco', [36.4, 0.9, 51.5], POSTER_RETRO, poster(36.4, 51.5, 'retro', false), { stick: true, prop: true, sizeLabel: 'B3 复古' }),
  define('av-ticket-stubs', '电影票根', 'deco', [20.7, 1.7, 13.4], TICKETS, ticketStubs, { stick: true, prop: true }),

  // ---------- 爆米花 ----------
  define('av-popcorn-cart', '复古爆米花推车', 'appliance', [66, 57.5, 127.6], POPCORN, popcornCart),
  define('av-popcorn-machine', '桌面爆米花机', 'appliance', [44.4, 30.4, 55.8], POPCORN, popcornMachine, PROP),
  define('av-popcorn-bucket', '爆米花桶', 'tabletop', [15, 15, 19], BUCKET, popcornBucket, PROP),

  // ---------- 家庭影院氛围 ----------
  define('av-theater-curtain', '影院遮光帘', 'deco', [234, 14.2, 235], CURTAIN, theaterCurtain, { mount: CURTAIN_MOUNT }),
  define('av-theater-sofa', '影院沙发', 'living', [96, 93.8, 90.8], SOFA, theaterSofa(1), { sizeLabel: '单人' }),
  define('av-theater-sofa-2', '影院沙发', 'living', [174, 93.8, 90.8], SOFA, theaterSofa(2), { sizeLabel: '双人' }),
]
