// 椅凳扩充包：折叠椅、板凳 / 凳子、人体工学椅，以及几款休闲 / 餐椅。全部 id 以 c2- 开头。
// 和 chairs.ts（ch- 前缀）不重复：那边已有基础款折叠椅、导演椅、方凳、梯凳、蘑菇凳、旋转吧凳、人体工学椅、跪姿椅、带靠背平衡球椅等，
// 这里做的是另外的款式（软垫会议折叠椅、X 腿木条折叠椅、高脚导演椅、月亮椅、户外扶手椅、折叠座椅子、长板凳、工业风圆凳……）。
// 约定见 kit.ts 开头；布面（坐垫、帆布、网面）直接用配色槽位颜色，不 shade，方便主程序识别布面加花纹。
// 每个 build 最后经 fit() 把包围盒对齐到占地中心、底面贴 y = 0。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus } from '../toon'
import { C, G, holePanel, shell, type AssetDef } from '../kit'
import { PI, cappedTube, mesh, strut, strutBox, type TubeOpts, type V3 } from '../geo'
import { I, J, M, N, R, type Pal } from '../packkit'

/** 本包弯管的默认参数（段数、截面段数、球帽 / 外包 Group 的约定） */
const TUBE: TubeOpts = { seg: { per: 10, min: 16 }, group: true }

// ---------- 配色 ----------

function pal(...xs: Pal[]) {
  return { palettes: xs.map((x) => x[1]), paletteStyles: xs.map((x) => x[0]), styles: [...new Set(xs.map((x) => x[0]))] }
}
const CHROME = M.silver
const INK = M.black

// ---------- 小工具 ----------

/** 包围盒对齐：xz 居中、底面贴 0 */
function fit(g: THREE.Group) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g, true)
  const off = new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  for (const c of g.children) c.position.add(off)
  return g
}

/** 绕局部 pivot 旋转一组部件（靠背后仰、折叠） */
function hinge(pivot: V3, rx: number, ...parts: THREE.Object3D[]) {
  const inner = G(...parts)
  inner.position.set(-pivot[0], -pivot[1], -pivot[2])
  const outer = G(inner)
  outer.position.set(...pivot)
  outer.rotation.x = rx
  return outer
}

/** 办公椅五星脚：脚轮 + 气压杆，气压杆顶在 top */
function starBase(r0: number, top: number, frame: string) {
  const g = G(cyl(4.6, 6, 5, frame, { y: 6 }, 16))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const sx = Math.sin(a)
    const sz = Math.cos(a)
    g.add(strutBox([0, 8.5, 0], [sx * r0, 6.8, sz * r0], 3.4, 3.4, frame))
    g.add(cyl(0.9, 0.9, 2.4, INK, { x: sx * r0, y: 4.4, z: sz * r0 }, 8))
    g.add(ball(2.5, INK, { x: sx * r0, y: 2.5, z: sz * r0 }, [0.7, 1, 1]))
  }
  g.add(cyl(3, 3.4, Math.min(16, top - 14), INK, { y: 10 }, 14))
  g.add(cyl(2, 2, top - 11, CHROME, { y: 11 }, 12))
  return g
}

/** 绗缝扣：软垫表面的小纽扣 */
function buttons(w: number, d: number, y: number, nx: number, nz: number, color: string) {
  const g = new THREE.Group()
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) g.add(ball(0.7, color, { x: -w / 2 + (w / nx) * (i + 0.5), y, z: -d / 2 + (d / nz) * (j + 0.5) }, [1, 0.5, 1]))
  return g
}

// =====================================================================
// 折叠椅
// =====================================================================

/** 软垫会议折叠椅：钢管框 + 包布坐垫 / 靠垫。open = 展开；否则折起立放（贴墙收纳） [垫布, 管] */
const foldPad = (open: boolean) => (p: string[]) => {
  const [pad, frame] = p
  const g = new THREE.Group()
  const r = 1.2
  if (open) {
    for (const s of [-1, 1]) {
      g.add(strut([s * 20, 0, -17], [s * 20, 84, -21.5], r, frame))
      g.add(strut([s * 18, 0, 19], [s * 18, 43, 14], r, frame))
      g.add(strut([s * 18, 43, 14], [s * 20, 43, -17.5], r, frame))
      g.add(rbox(2.6, 1, 3.4, INK, { x: s * 20, z: -17 }, 0.4), rbox(2.6, 1, 3.4, INK, { x: s * 18, z: 19 }, 0.4))
    }
    g.add(strut([-18, 9, 19], [18, 9, 19], r, frame), strut([-20, 9, -17], [20, 9, -17], r, frame))
    g.add(rbox(37, 1.2, 33, shade(frame, -0.2), { y: 41.6, z: -1.5 }, 0.4))
    g.add(rbox(39, 4.6, 35, pad, { y: 42.8, z: -1.5 }, 2))
    g.add(hinge([0, 68, -20.5], -0.06, rbox(37, 19, 4, pad, { y: 59, z: -20.5 }, 1.8)))
  } else {
    for (const s of [-1, 1]) {
      g.add(strut([s * 20, 0, -1.5], [s * 20, 84, -1.5], r, frame))
      g.add(strut([s * 18, 0, 1.5], [s * 18, 62, 1.5], r, frame))
      g.add(rbox(2.6, 1, 3, INK, { x: s * 20, z: -1.5 }, 0.4), rbox(2.6, 1, 3, INK, { x: s * 18, z: 1.5 }, 0.4))
    }
    g.add(strut([-20, 9, -1.5], [20, 9, -1.5], r, frame))
    g.add(rbox(39, 35, 4.6, pad, { y: 22, z: 2.6 }, 2))
    g.add(rbox(37, 19, 4, pad, { y: 59, z: -2.4 }, 1.8))
  }
  return g
}

/** X 腿木条折叠椅（花园 / 小酒馆款）：侧面两腿交叉，长腿一直伸上去当靠背柱 [条板, 框] */
const xSlat = (open: boolean) => (p: string[]) => {
  const [slat, frame] = p
  const g = new THREE.Group()
  if (open) {
    // 长腿：前脚 (z 20) → 靠背顶 (z -21, y 86)；短腿：后脚 (z -18) → 座前 (z 16, y 44)
    const zA = (y: number) => 20 - (41 * y) / 86
    for (const s of [-1, 1]) {
      g.add(strutBox([s * 21, 0, 20], [s * 21, 86, -21], 2.4, 3.6, frame))
      g.add(strutBox([s * 18.4, 0, -18], [s * 18.4, 44, 16], 2.4, 3.4, frame))
      g.add(cyl(0.9, 0.9, 1.2, CHROME, { x: s * 22.4, y: 26, z: zA(26) - 0.3, rz: PI / 2 }, 10))
    }
    g.add(strutBox([-20, 8, 20 - (41 * 8) / 86], [20, 8, 20 - (41 * 8) / 86], 2.4, 2.4, frame))
    g.add(strutBox([-17.4, 6, -15.5], [17.4, 6, -15.5], 2.4, 2.4, frame))
    for (let i = 0; i < 6; i++) g.add(rbox(38.6, 2, 4.6, slat, { y: 44, z: -14 + i * 5.6 }, 0.6))
    for (const y of [62, 71, 80]) g.add(rbox(40, 6, 1.8, slat, { y, z: zA(y + 3) - 2.2, rx: 0.45 }, 0.6))
  } else {
    for (const s of [-1, 1]) {
      g.add(strutBox([s * 21, 0, 0], [s * 21, 94, 0], 2.4, 3.6, frame))
      g.add(strutBox([s * 18.4, 0, 3.2], [s * 18.4, 48, 3.2], 2.4, 3.4, frame))
    }
    g.add(strutBox([-20, 8, 0], [20, 8, 0], 2.4, 2.4, frame))
    for (let i = 0; i < 6; i++) g.add(rbox(38.6, 4.6, 2, slat, { y: 17 + i * 5.6, z: 5.4 }, 0.6))
    for (const y of [64, 73, 82]) g.add(rbox(40, 6, 1.8, slat, { y, z: -2.8 }, 0.6))
  }
  return g
}

/** 高脚导演椅（座高 75）：四腿 + 前后 X 撑 + 脚踏，帆布座背。closed = 左右收拢 [帆布, 框] */
const directorTall = (open: boolean) => (p: string[]) => {
  const [canvas, frame] = p
  const g = new THREE.Group()
  const hx = open ? 24 : 4.5
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(strutBox([sx * hx, 0, sz * 20], [sx * hx, 95, sz * 20], 3, 3, frame))
    g.add(strutBox([sx * hx, 75, -20], [sx * hx, 122, -21], 3, 3, frame))
    g.add(strutBox([sx * (hx + 0.5), 96.5, -22], [sx * (hx + 0.5), 96.5, 23], 5, 2.4, frame))
    if (open) g.add(strutBox([sx * hx, 74, -18.5], [sx * hx, 74, 18.5], 2.6, 2.6, frame))
  }
  for (const sz of [-1, 1]) {
    g.add(strutBox([-hx + 1, 38, sz * 20], [hx - 1, 70, sz * 20], 2.2, 2.2, frame))
    g.add(strutBox([hx - 1, 38, sz * 20], [-hx + 1, 70, sz * 20], 2.2, 2.2, frame))
  }
  g.add(strutBox([-hx - 1.5, 27, 21.2], [hx + 1.5, 27, 21.2], 3.4, 3.4, shade(frame, -0.1)))
  if (open) {
    g.add(rbox(46, 1, 38, canvas, { y: 74.5 }, 0.4))
    g.add(rbox(48, 20, 1, canvas, { y: 100, z: -21.2 }, 0.4))
  } else {
    g.add(rbox(3, 18, 38.4, canvas, { y: 58 }, 0.8))
    g.add(rbox(10, 20, 2.4, canvas, { y: 100, z: -21.5 }, 0.8))
  }
  return g
}

/** 月亮椅：碗形帆布座斜靠在四脚折叠架上 [布, 框, 碗底软垫] */
function moonChair(p: string[]) {
  const [cloth, frame, strap] = p
  const g = new THREE.Group()
  const bowl = G(cup(31, 12, 24, 1.2, cloth), torus(30.4, 1, frame, { y: 23.4, rx: PI / 2 }), puck(18, 4, strap, { y: 1.2 }))
  bowl.position.set(0, 20, 2)
  bowl.rotation.x = 0.42
  g.add(bowl)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      // 四根腿在坐兜底下交叉，收在底部圆垫下面（以前一直伸到对侧 y = 34，从布兜里面戳出来）
      g.add(strut([sx * 27, 0, sz * 25], [-sx * 2, 19.5, -sz * 2 + 2], 1.1, frame))
      g.add(ball(1.8, INK, { x: sx * 27, y: 1.8, z: sz * 25 }, [1, 1, 1]))
    }
  return g
}

/** 户外折叠扶手椅（露营椅）：四腿 + 侧面 / 前后 X 撑，吊床式坐面，扶手带杯托。closed = 收成一捆 [布, 框, 杯托] */
const campArm = (open: boolean) => (p: string[]) => {
  const [cloth, frame, holder] = p
  const g = new THREE.Group()
  const r = 1
  if (open) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(strut([sx * 26, 0, sz * 21], [sx * 26, 60, sz * 21], r, frame))
        g.add(ball(1.6, INK, { x: sx * 26, y: 1.6, z: sz * 21 }))
      }
      g.add(strut([sx * 26, 6, -21], [sx * 26, 38, 21], r, frame), strut([sx * 26, 6, 21], [sx * 26, 38, -21], r, frame))
      g.add(strut([sx * 25, 38, -21], [sx * 25, 92, -30], r, frame))
      g.add(rbox(7, 1.4, 44, cloth, { x: sx * 26, y: 60 }, 0.6))
    }
    for (const sz of [-1, 1]) g.add(strut([-26, 6, sz * 21], [26, 36, sz * 21], r, frame), strut([26, 6, sz * 21], [-26, 36, sz * 21], r, frame))
    // 吊床式坐面：中间低
    g.add(rbox(48, 1.2, 40, cloth, { y: 36 }, 0.5))
    g.add(rbox(48, 3, 30, cloth, { y: 34 }, 1.2))
    g.add(hinge([0, 38, -21], -0.17, rbox(48, 52, 1.2, cloth, { y: 38, z: -21 }, 0.5)))
    g.add(cup(4.2, 3.6, 7, 0.5, holder, { x: 33, y: 53, z: 13 }))
    g.add(rbox(4, 1, 4, holder, { x: 29.5, y: 58.5, z: 13 }, 0.3))
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2
      g.add(strut([Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5], [Math.cos(a) * 4, 92, Math.sin(a) * 4], r, frame))
    }
    g.add(cyl(7.5, 7, 54, cloth, { y: 22 }, 16), torus(7.6, 0.8, holder, { y: 40, rx: PI / 2 }), torus(7.4, 0.8, holder, { y: 64, rx: PI / 2 }))
    for (let i = 0; i < 4; i++) g.add(ball(1.4, INK, { x: Math.cos((i * PI) / 2 + 0.4) * 5.5, y: 1.4, z: Math.sin((i * PI) / 2 + 0.4) * 5.5 }))
  }
  return g
}

/** 折叠高脚凳（座高 70）：侧面 X 腿 + 脚踏。closed = 合拢立放 [座, 框] */
const foldHighStool = (open: boolean) => (p: string[]) => {
  const [seat, frame] = p
  const g = new THREE.Group()
  const r = 1.3
  if (open) {
    const zA = (y: number) => 18 - (32 * y) / 66.5
    for (const s of [-1, 1]) {
      g.add(strut([s * 16, 0, 18], [s * 16, 66.5, -14], r, frame))
      g.add(strut([s * 13.5, 0, -18], [s * 13.5, 66.5, 14], r, frame))
      g.add(rbox(2.8, 1, 3.4, INK, { x: s * 16, z: 18 }, 0.4), rbox(2.8, 1, 3.4, INK, { x: s * 13.5, z: -18 }, 0.4))
      g.add(cyl(1, 1, 3, CHROME, { x: s * 14.8, y: 31.5, z: 2.8, rz: PI / 2 }, 10))
    }
    g.add(strut([-16, 24, zA(24)], [16, 24, zA(24)], 1.5, frame))
    g.add(strut([-13.5, 4, -16], [13.5, 4, -16], r, frame))
    g.add(rbox(34, 2.2, 30, shade(frame, -0.15), { y: 66.3 }, 0.6))
    g.add(rbox(35, 4.2, 31, seat, { y: 67.4 }, 1.6))
  } else {
    for (const s of [-1, 1]) {
      g.add(strut([s * 16, 0, 0], [s * 16, 74, 0], r, frame))
      g.add(strut([s * 13.5, 0, 2.6], [s * 13.5, 74, 2.6], r, frame))
      g.add(rbox(2.8, 1, 3, INK, { x: s * 16 }, 0.4))
    }
    g.add(strut([-16, 24, 0], [16, 24, 0], 1.5, frame))
    g.add(rbox(35, 31, 4.2, seat, { y: 44, z: -3.4 }, 1.6))
  }
  return g
}

/** 和式折叠座椅子：直接坐在榻榻米上，靠背可以向前折平。open = 靠背立起；否则折平叠在坐垫上 [布, 底框] */
const zaisuFold = (open: boolean) => (p: string[]) => {
  const [cloth, base] = p
  const g = new THREE.Group()
  g.add(rbox(46, 2, 48, base, {}, 0.8))
  g.add(rbox(45, 7, 46, cloth, { y: 1.6, z: 0.6 }, 2.6))
  const back = G(rbox(44, 46, 2.4, base, { y: 0, z: 0 }, 0.8), rbox(42, 44, 6, cloth, { y: 1, z: 3.4 }, 2.4))
  for (const s of [-1, 1]) back.add(rbox(3, 3, 3, INK, { x: s * 18, y: -1.5, z: 0.6 }, 0.6))
  if (open) {
    back.position.set(0, 3, -23)
    back.rotation.x = -0.38
  } else {
    back.position.set(0, 10.6, -23.2)
    back.rotation.x = PI / 2
  }
  g.add(back)
  return g
}

// =====================================================================
// 板凳 / 凳子
// =====================================================================

/** 长板凳：厚木板 + 外撇方腿 + 中间纵撑 [木, 腿] */
const bench = (len: number) => (p: string[]) => {
  const [wood, leg] = p
  const g = G(rbox(len, 4.2, 28, wood, { y: 40.8 }, 0.9))
  const hx = len / 2 - 12
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(strutBox([sx * hx, 40.8, sz * 9], [sx * (hx + 4), 0, sz * 12], 4, 4, leg))
    g.add(strutBox([sx * (hx + 1.8), 16, -11], [sx * (hx + 1.8), 16, 11], 3.4, 3, leg))
    g.add(strutBox([sx * hx, 38.2, -11], [sx * hx, 38.2, 11], 4, 3, leg))
  }
  g.add(strutBox([-hx - 1.8, 18, 0], [hx + 1.8, 18, 0], 4, 2.6, leg))
  return g
}

/** 实木方凳：四腿 + 牙板 + 错层横撑，顶面可以放东西 [面, 腿] */
function frameStool(p: string[]) {
  const [top, leg] = p
  const g = G(rbox(36, 3, 36, top, { y: 42 }, 0.8))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(strutBox([sx * 15, 0, sz * 15], [sx * 15.5, 42, sz * 15.5], 3.4, 3.4, leg))
  for (const s of [-1, 1]) {
    g.add(strutBox([-14, 38, s * 15.5], [14, 38, s * 15.5], 4, 1.8, leg))
    g.add(strutBox([s * 15.5, 38, -14], [s * 15.5, 38, 14], 1.8, 4, leg))
    g.add(strutBox([-14, 12, s * 15.1], [14, 12, s * 15.1], 2.2, 2, leg))
    g.add(strutBox([s * 15.1, 17, -14], [s * 15.1, 17, 14], 2, 2.2, leg))
  }
  return g
}

/** 工业风圆凳：木圆面 + 四根外撇方管腿 + 脚环（矮凳没有） [座, 框] */
const ironStool = (h: number) => (p: string[]) => {
  const [seat, frame] = p
  const g = G(cyl(17, 17, 3.6, seat, { y: h - 3.6 }, 28), cyl(13, 13, 1.4, shade(frame, -0.1), { y: h - 5 }, 20))
  const spread = h > 50 ? 20 : 17
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    g.add(strutBox([Math.cos(a) * 11, h - 4.6, Math.sin(a) * 11], [Math.cos(a) * spread, 0, Math.sin(a) * spread], 2.4, 2.4, frame, 0.4))
  }
  if (h > 50) {
    const y = h * 0.34
    const k = 11 + (spread - 11) * (1 - y / (h - 4.6))
    g.add(torus(k, 1, frame, { y, rx: PI / 2 }))
  } else {
    const y = 14
    const k = 11 + (spread - 11) * (1 - y / (h - 4.6))
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * PI * 2 + PI / 4
      const a1 = a0 + PI / 2
      g.add(strut([Math.cos(a0) * k, y, Math.sin(a0) * k], [Math.cos(a1) * k, y, Math.sin(a1) * k], 0.8, frame))
    }
  }
  return g
}

/** 北欧木吧凳：鞍形座 + 圆腿 + 前侧脚踏 + 低靠背弯栏 [木, 座垫] */
const woodBar = (h: number) => (p: string[]) => {
  const [wood, pad] = p
  const g = G(rbox(40, 4, 36, wood, { y: h - 5.5 }, 1.2), rbox(36, 2, 31, pad, { y: h - 1.8, z: 1 }, 0.9))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(strut([sx * 15, h - 5.5, sz * 13], [sx * 19, 0, sz * 17], 1.8, wood, 1.6))
  const fy = h * 0.33
  const k = (y: number) => 1 - y / (h - 5.5)
  const fx = 15 + 4 * k(fy)
  g.add(strut([-fx, fy, 13 + 4 * k(fy)], [fx, fy, 13 + 4 * k(fy)], 1.6, wood))
  for (const s of [-1, 1]) g.add(strut([s * fx, fy + 6, -13 - 4 * k(fy + 6)], [s * fx, fy + 6, 13 + 4 * k(fy + 6)], 1.2, wood))
  // 低靠背
  const arc: V3[] = [
    [-18, h + 12, -9],
    [-11, h + 13, -15.5],
    [0, h + 13.5, -17.5],
    [11, h + 13, -15.5],
    [18, h + 12, -9],
  ]
  g.add(cappedTube(arc, 1.8, wood, TUBE))
  for (const [x, z] of [
    [-14, -12],
    [0, -16],
    [14, -12],
  ])
    g.add(strut([x, h - 1.5, z * 0.92], [x, h + 12.5, z], 1, wood))
  return g
}

/** 折叠两级踏脚凳（厨房用）：金属框 + 两级防滑踏板。closed = 合拢立放 [踏板, 框] */
const stepFold = (open: boolean) => (p: string[]) => {
  const [tread, frame] = p
  const g = new THREE.Group()
  const r = 1.2
  if (open) {
    for (const s of [-1, 1]) {
      g.add(strut([s * 20, 0, 22], [s * 20, 52, -10], r, frame))
      g.add(strut([s * 21.5, 0, -22], [s * 21.5, 52, -13], r, frame))
      g.add(rbox(3, 1, 4, INK, { x: s * 20, z: 22 }, 0.4), rbox(3, 1, 4, INK, { x: s * 21.5, z: -22 }, 0.4))
    }
    g.add(strut([-21.5, 22, -16.5], [21.5, 22, -16.5], r, frame))
    g.add(rbox(38, 2.4, 15, tread, { y: 24, z: 7 }, 0.6))
    g.add(rbox(44, 2.4, 22, tread, { y: 52, z: -11.5 }, 0.6))
    for (const z of [3, 7, 11]) g.add(rbox(34, 0.4, 1.2, shade(tread, -0.25), { y: 26.2, z }, 0.15))
    for (const z of [-18, -13, -8, -3]) g.add(rbox(40, 0.4, 1.2, shade(tread, -0.25), { y: 54.2, z }, 0.15))
  } else {
    for (const s of [-1, 1]) {
      g.add(strut([s * 20, 0, 1.2], [s * 20, 60, 1.2], r, frame))
      g.add(strut([s * 21.5, 0, -1.2], [s * 21.5, 58, -1.2], r, frame))
    }
    g.add(rbox(38, 15, 2.4, tread, { y: 24, z: 3.6 }, 0.6))
    g.add(rbox(44, 22, 2.4, tread, { y: 38, z: -3.6 }, 0.6))
  }
  return g
}

/** 小圆矮凳（座高 22）：圆面带提手孔 + 三条外撇腿 [木, 腿] */
function lowStool(p: string[]) {
  const [wood, leg] = p
  const top = holePanel(30, 30, 2.6, wood, [{ kind: 'rect', x: 0, y: 19, w: 10, h: 3, r: 1.5 }], { y: 22, z: -15, rx: PI / 2 }, 15)
  const g = G(top)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2
    g.add(strut([Math.cos(a) * 8, 20.9, Math.sin(a) * 8], [Math.cos(a) * 13, 0, Math.sin(a) * 13], 1.6, leg, 1.3))
  }
  return g
}

/** 儿童小凳（塑料，座高 24）：四面拱形开口 + 顶面提手孔 + 一对小耳朵 [主色, 耳朵 / 点缀] */
function kidStool(p: string[]) {
  const [body, ear] = p
  const g = G(
    shell(32, 23, 24, 1.6, body, {
      front: [{ kind: 'arch', x: 0, y: 0, w: 20, h: 13 }],
      back: [{ kind: 'arch', x: 0, y: 0, w: 20, h: 13 }],
      left: [{ kind: 'arch', x: 0, y: 0, w: 12, h: 11 }],
      right: [{ kind: 'arch', x: 0, y: 0, w: 12, h: 11 }],
      top: false,
      bottom: false,
    }),
  )
  g.add(holePanel(33, 25, 2, body, [{ kind: 'rect', x: 0, y: 16, w: 10, h: 3, r: 1.5 }], { y: 24, z: -12.5, rx: PI / 2 }, 4))
  for (const s of [-1, 1]) g.add(ball(3.2, ear, { x: s * 11, y: 24.8, z: -10 }, [1, 0.8, 0.5]))
  return g
}

/** 可叠放塑料凳：圆面（带一圈小孔纹）+ 四条外撇锥腿；n > 1 时叠成一摞 [主色, 点缀] */
const stackStool = (n: number) => (p: string[]) => {
  const [body, acc] = p
  const g = new THREE.Group()
  for (let k = 0; k < n; k++) {
    const y0 = k * 5.5
    const one = G(cyl(15.5, 15, 2.6, body, { y: 43 }, 28), cyl(14, 14, 0.4, acc, { y: 45.6 }, 28))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4
      one.add(strut([Math.cos(a) * 18.5, 0, Math.sin(a) * 18.5], [Math.cos(a) * 12, 43.2, Math.sin(a) * 12], 1.2, body, 2.2, 8))
    }
    one.add(torus(15, 0.6, body, { y: 18, rx: PI / 2 }))
    one.position.y = y0
    g.add(one)
  }
  return g
}

/** 钢琴凳：带储物格的箱体 + 绗缝软垫面 + 方腿 [垫, 木] */
function pianoBench(p: string[]) {
  const [pad, wood] = p
  const g = G(rbox(72, 9, 33, wood, { y: 36 }, 0.8))
  g.add(rbox(74, 4.6, 35, pad, { y: 45 }, 1.8), buttons(66, 28, 49.6, 6, 2, shade(pad, -0.15)))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(strutBox([sx * 33, 0, sz * 14], [sx * 33.5, 36, sz * 14.5], 3.6, 3.6, wood))
  g.add(rbox(66, 1.4, 1, shade(wood, -0.2), { x: 0, y: 40, z: 16.6 }, 0.3))
  g.add(strutBox([-32.5, 10, 0], [32.5, 10, 0], 3, 2.4, wood))
  for (const s of [-1, 1]) g.add(strutBox([s * 33.2, 10, -12], [s * 33.2, 10, 12], 2.4, 3, wood))
  return g
}

/** 化妆凳：圆形绗缝软墩 + 细弯腿 + 脚环 [垫, 腿 / 金属] */
function vanityStool(p: string[]) {
  const [pad, leg] = p
  const g = G(puck(19, 10, pad, { y: 35 }), ball(0.9, shade(pad, -0.15), { y: 45 }, [1, 0.5, 1]))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    g.add(ball(0.7, shade(pad, -0.15), { x: Math.cos(a) * 10, y: 44.6, z: Math.sin(a) * 10 }, [1, 0.5, 1]))
  }
  g.add(cyl(16, 16, 1.2, leg, { y: 34 }, 24))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    const c = Math.cos(a)
    const s = Math.sin(a)
    g.add(cappedTube([[c * 13, 34.5, s * 13], [c * 15.5, 20, s * 15.5], [c * 17.5, 1, s * 17.5]], 1, leg, TUBE))
  }
  g.add(torus(15.8, 0.6, leg, { y: 15, rx: PI / 2 }))
  return g
}

/** 玄关穿鞋凳：软垫面 + 侧板 + 下层鞋架（可放鞋） [垫, 木] */
const shoeBench = (w: number) => (p: string[]) => {
  const [pad, wood] = p
  const g = G(rbox(w, 3, 34, wood, { y: 36 }, 0.8), rbox(w - 2, 5, 32, pad, { y: 39 }, 2))
  for (const s of [-1, 1]) g.add(rbox(3, 36, 34, wood, { x: s * (w / 2 - 1.5) }, 0.8))
  // 下层鞋架：条板，略高出地面
  const n = Math.round((w - 6) / 7)
  for (let i = 0; i < n; i++) g.add(rbox((w - 6) / n - 1.2, 1.6, 32, wood, { x: -(w - 6) / 2 + ((w - 6) / n) * (i + 0.5), y: 10 }, 0.4))
  g.add(rbox(w - 6, 3, 2, wood, { y: 8.4, z: 15 }, 0.4), rbox(w - 6, 3, 2, wood, { y: 8.4, z: -15 }, 0.4))
  g.add(rbox(w - 6, 6, 1.6, wood, { y: 28, z: -16 }, 0.4))
  return g
}

// =====================================================================
// 人体工学椅
// =====================================================================

/** 网背人体工学椅：头枕、腰托、3D 扶手、五星脚轮。foot = 高背 + 前面抽出脚托 [座布, 网面, 框] */
const ergo = (foot: boolean) => (p: string[]) => {
  const [seat, net, frame] = p
  const g = G(starBase(31, 41, frame))
  g.add(rbox(22, 5, 22, frame, { y: 36, z: -1 }, 1))
  g.add(rbox(52, 2.4, 50, shade(frame, -0.05), { y: 40.6, z: 2 }, 1))
  g.add(rbox(50, 6, 48, seat, { y: 42, z: 3 }, 2.6))
  // 靠背骨架：从座下往后上弯
  g.add(cappedTube([[0, 38, -10], [0, 44, -22], [0, 52, -26]], 2.4, frame, TUBE))
  const backH = foot ? 60 : 52
  const back = new THREE.Group()
  const hw = 24
  const loop: V3[] = [
    [-hw + 2, 0, 0],
    [-hw, backH * 0.5, -1.2],
    [-hw + 3, backH, 0],
    [0, backH + 1.5, 0.4],
    [hw - 3, backH, 0],
    [hw, backH * 0.5, -1.2],
    [hw - 2, 0, 0],
    [0, -1, 1],
  ]
  back.add(cappedTube(loop, 1.4, frame, { ...TUBE, closed: true }))
  back.add(rbox(hw * 2 - 4, backH - 2, 0.8, net, { y: 0.5, z: -0.6 }, 0.3))
  back.add(rbox(32, 9, 3.4, frame, { y: 8, z: 1.4 }, 1.4))
  back.add(strutBox([0, backH - 2, -1.6], [0, backH + 10, -2.4], 5, 2, frame))
  back.add(rbox(32, 12, 4.4, seat, { y: backH + 9, z: -0.4 }, 2))
  back.position.set(0, 52, -25.5)
  g.add(hinge([0, 52, -25.5], -0.14, back))
  // 扶手：竖杆 + 可调扶手垫
  for (const s of [-1, 1]) {
    g.add(strutBox([s * 23, 41, -4], [s * 27, 48, -4], 2.4, 5, frame))
    g.add(strutBox([s * 27, 47, -4], [s * 27, 63, -4], 3, 4, frame))
    g.add(rbox(8, 2.6, 25, seat, { x: s * 27, y: 63, z: 0 }, 1.1))
    g.add(rbox(1.4, 3, 1.4, INK, { x: s * 25.6, y: 55, z: -1.8 }, 0.4))
  }
  if (foot) {
    for (const s of [-1, 1]) g.add(strutBox([s * 15, 40, 18], [s * 15, 37.5, 44], 2.4, 2, CHROME))
    g.add(rbox(38, 3.4, 16, seat, { y: 36.4, z: 50 }, 1.4))
    g.add(rbox(40, 1.6, 17, frame, { y: 35, z: 50 }, 0.6))
  }
  return g
}

/** 简约网椅：无扶手、中背网面、五星脚轮 [座布, 网面, 框] */
function meshSimple(p: string[]) {
  const [seat, net, frame] = p
  const g = G(starBase(28, 41, frame))
  g.add(rbox(18, 4, 18, frame, { y: 37 }, 1))
  g.add(rbox(46, 6, 45, seat, { y: 41, z: 2 }, 2.6))
  for (const s of [-1, 1]) g.add(cappedTube([[s * 16, 42, -12], [s * 18, 46, -22], [s * 20, 60, -25], [s * 19, 86, -27]], 1.3, frame, TUBE))
  g.add(cappedTube([[-19, 86, -27], [0, 88, -28.5], [19, 86, -27]], 1.3, frame, TUBE))
  g.add(hinge([0, 48, -24], -0.1, rbox(37, 38, 0.8, net, { y: 48, z: -24.5 }, 0.3)))
  g.add(hinge([0, 48, -24], -0.1, rbox(37, 2.4, 1.4, frame, { y: 49, z: -24.4 }, 0.5)))
  return g
}

/** 摇摆跪椅：两片弧形木侧板当摇杆，斜坐垫 + 跪垫 [垫, 木] */
function kneelRock(p: string[]) {
  const [pad, wood] = p
  const g = new THREE.Group()
  // 侧板：上缘在坐垫和跪垫下方，下缘是一道摇弧
  const side = () => {
    const sh = new THREE.Shape()
    const n = 16
    for (let i = 0; i <= n; i++) {
      const t = -1 + (2 * i) / n
      const z = t * 32
      const y = 6 * t * t
      if (i === 0) sh.moveTo(z, y)
      else sh.lineTo(z, y)
    }
    sh.lineTo(32, 12)
    sh.lineTo(22, 18)
    sh.lineTo(10, 14)
    sh.lineTo(-8, 30)
    sh.lineTo(-24, 50)
    sh.lineTo(-31, 50)
    sh.lineTo(-32, 6)
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1 })
    geo.rotateY(-PI / 2)
    return mesh(geo, wood)
  }
  for (const s of [-1, 1]) {
    const m = side()
    m.position.x = s * 19 + (s < 0 ? 0 : 2.4)
    g.add(m)
  }
  g.add(strutBox([-18, 6, 0], [18, 6, 0], 3.4, 3.4, wood))
  g.add(strutBox([-18, 46, -27], [18, 46, -27], 3, 3, wood))
  g.add(hinge([0, 50, -27], 0.32, rbox(42, 6, 30, pad, { y: 50, z: -15 }, 2.4)))
  g.add(hinge([0, 18, 20], 0.5, rbox(42, 5, 18, pad, { y: 15, z: 20 }, 2)))
  return g
}

/** 马鞍椅：两瓣鞍形坐面 + 气压杆 + 五星脚轮 [座, 框] */
function saddleChair(p: string[]) {
  const [seat, frame] = p
  const g = G(starBase(28, 58, frame))
  g.add(rbox(16, 4, 16, frame, { y: 54 }, 1))
  for (const s of [-1, 1]) g.add(ball(13, seat, { x: s * 9.5, y: 62, z: -2 }, [0.9, 0.42, 1.25]))
  g.add(ball(7, seat, { y: 61, z: 14 }, [1, 0.6, 1.6]))
  g.add(rbox(34, 3, 30, shade(frame, -0.05), { y: 56.5, z: 0 }, 1))
  g.add(cyl(1, 1, 8, INK, { x: 8, y: 48, z: 6, rz: 0.6 }, 8))
  return g
}

/** 平衡球凳（无靠背）：带脚轮的圆环底座托着瑜伽球 [球, 框] */
function ballStool(p: string[]) {
  const [ballC, frame] = p
  const g = G(torus(18, 1.5, frame, { y: 10, rx: PI / 2 }))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4
    g.add(strut([Math.cos(a) * 19, 4.5, Math.sin(a) * 19], [Math.cos(a) * 17.5, 10, Math.sin(a) * 17.5], 1.2, frame))
    g.add(ball(2.4, INK, { x: Math.cos(a) * 19, y: 2.4, z: Math.sin(a) * 19 }, [0.7, 1, 1]))
  }
  g.add(ball(24, ballC, { y: 28.5 }))
  g.add(torus(24.1, 0.5, shade(ballC, -0.15), { y: 28.5, rx: PI / 2 }))
  return g
}

// =====================================================================
// 休闲 / 餐椅
// =====================================================================

/** 靠背款懒人沙发：落地座墩 + 高靠背，像一把没有腿的沙发 [布, 抱枕] */
function beanLounger(p: string[]) {
  const [cloth, pillow] = p
  const g = new THREE.Group()
  g.add(ball(36, cloth, { y: 14, z: 6 }, [1, 0.42, 0.95]))
  g.add(hinge([0, 20, -22], -0.3, ball(32, cloth, { y: 44, z: -22 }, [1, 0.95, 0.38])))
  for (const s of [-1, 1]) g.add(ball(13, cloth, { x: s * 28, y: 24, z: 0 }, [0.55, 0.75, 1.5]))
  g.add(hinge([0, 30, -10], -0.25, rbox(30, 26, 9, pillow, { y: 28, z: -10 }, 4)))
  return g
}

/** 曲木咖啡馆椅：圆座 + 四条圆腿 + 弯木靠背环 + 腿间圆环 [木, 座面] */
function bentwood(p: string[]) {
  const [wood, seatC] = p
  const g = G(cyl(21, 21, 3, wood, { y: 42 }, 28), cyl(19, 19, 0.8, seatC, { y: 44.8 }, 28))
  // 后腿一直弯上去成靠背
  for (const s of [-1, 1]) {
    g.add(cappedTube([[s * 15, 0, -18], [s * 14, 30, -15], [s * 14, 44, -15], [s * 15, 70, -19], [s * 12, 86, -21]], 1.4, wood, TUBE))
    g.add(strut([s * 15, 0, 18], [s * 13, 42.5, 13], 1.4, wood, 1.6))
  }
  g.add(cappedTube([[-12, 86, -21], [-6, 88.5, -22.5], [0, 89, -23], [6, 88.5, -22.5], [12, 86, -21]], 1.4, wood, TUBE))
  g.add(cappedTube([[-14, 58, -16.5], [-9, 64, -19], [0, 66, -20], [9, 64, -19], [14, 58, -16.5]], 1, wood, TUBE))
  g.add(torus(15.4, 0.9, wood, { y: 20, rx: PI / 2 }))
  return g
}

/** 梯背草编椅：四根圆柱 + 编织座 + 三道弯横档（梯背） [木, 座面] */
function ladderBack(p: string[]) {
  const [wood, rush] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(cyl(1.8, 1.8, 46, wood, { x: s * 21, z: 17 }, 12), ball(2.1, wood, { x: s * 21, y: 46, z: 17 }))
    g.add(strut([s * 20, 0, -17], [s * 19.5, 98, -21], 1.8, wood, 1.6, 12), ball(2, wood, { x: s * 19.5, y: 98.5, z: -21 }))
  }
  // 编织座：一块带格纹的软垫面，边框是横档
  g.add(rbox(41, 3, 35, rush, { y: 42 }, 1))
  for (let i = 0; i < 7; i++) g.add(rbox(41.2, 0.3, 0.6, shade(rush, -0.2), { y: 45, z: -15 + i * 5 }, 0.1))
  for (const sz of [-1, 1]) g.add(strut([-21, 43, sz * 17], [21, 43, sz * 17], 1.3, wood))
  for (const sx of [-1, 1]) g.add(strut([sx * 21, 43, -17], [sx * 21, 43, 17], 1.3, wood))
  for (const y of [14, 24]) {
    g.add(strut([-21, y, 17], [21, y, 17], 1, wood))
    for (const sx of [-1, 1]) g.add(strut([sx * 21, y + 4, -17], [sx * 21, y + 4, 17], 1, wood))
  }
  for (const [y, h] of [
    [60, 6],
    [74, 6],
    [88, 7],
  ]) {
    const z = -17 - (4 * y) / 98
    g.add(strutBox([-19.5, y, z - 0.5], [19.5, y, z - 0.5], h, 1.6, wood))
  }
  return g
}

// ---------- 配色表 ----------

/** 软垫折叠椅：[垫布, 管] */
const FOLD_PAD_PAL = pal(['modern', [M.char, CHROME]], ['modern', [M.light, M.black]], ['nordic', [N.blue, M.white]], ['industrial', [I.leather, I.iron]], ['retro', [R.red, CHROME]])
/** 木条折叠椅：[条板, 框] */
const XSLAT_PAL = pal(['nordic', [N.oakL, N.oak]], ['retro', [R.cream, R.teal]], ['industrial', [I.walnut, I.iron]], ['japanese', [J.hinoki, J.dark]], ['cute', [C.white, C.mint]])
/** 帆布 + 框：[布, 框] */
const CANVAS_PAL = pal(['industrial', [I.concrete, I.walnut]], ['modern', [M.black, M.black]], ['nordic', [N.linen, N.oak]], ['retro', [R.olive, R.caramel]], ['cute', [C.sky, M.white]])
/** 户外布 + 管 + 点缀：[布, 框, 点缀] */
const CAMP_PAL = pal(['industrial', [R.olive, I.iron, I.rust]], ['nordic', [N.sage, N.gray, N.mustard]], ['modern', [M.char, M.black, M.gray]], ['retro', [R.orange, M.char, R.cream]], ['cute', [C.pink, M.white, C.lemon]])
/** [座, 框] 金属框凳 */
const HIGH_STOOL_PAL = pal(['modern', [M.black, M.black]], ['modern', [M.light, CHROME]], ['industrial', [I.walnut, I.iron]], ['retro', [R.mustard, CHROME]], ['cute', [C.sky, M.white]])
/** 座椅子：[布, 底框] */
const ZAISU_PAL = pal(['japanese', [J.ai, J.dark]], ['japanese', [J.tatami, J.wood]], ['japanese', [J.shu, J.sumi]], ['nordic', [N.gray, N.oak]], ['cute', [C.sakura, C.woodL]])
/** 木作：[主木, 腿] */
const WOOD_PAL = pal(['nordic', [N.oak, N.oak]], ['japanese', [J.hinoki, J.wood]], ['industrial', [I.walnut, I.iron]], ['retro', [R.caramel, R.caramel]], ['modern', [M.walnut, M.black]])
/** 方凳：[面, 腿] */
const FRAME_STOOL_PAL = pal(['nordic', [N.oak, N.oak]], ['japanese', [J.hinoki, J.dark]], ['retro', [R.caramel, R.caramel]], ['modern', [M.black, M.black]], ['cute', [C.mint, C.white]])
/** 工业风圆凳：[座, 框] */
const IRON_PAL = pal(['industrial', [I.walnut, I.iron]], ['industrial', [I.leather, I.steel]], ['modern', [M.walnut, M.black]], ['retro', [R.teal, M.char]], ['nordic', [N.oak, M.white]])
/** 木吧凳：[木, 垫] */
const WOOD_BAR_PAL = pal(['nordic', [N.oak, N.linen]], ['nordic', [N.white, N.gray]], ['japanese', [J.wood, J.ai]], ['retro', [R.caramel, R.mustard]], ['modern', [M.black, M.char]])
/** 踏脚凳：[踏板, 框] */
const STEP_PAL = pal(['modern', [M.char, M.white]], ['modern', [M.light, CHROME]], ['nordic', [N.oak, M.white]], ['cute', [C.mint, M.white]], ['industrial', [I.concrete, I.iron]])
/** 儿童凳 / 塑料：[主色, 点缀] */
const KID_PAL = pal(['cute', [C.pink, C.white]], ['cute', [C.sky, C.lemon]], ['cute', [C.mint, C.white]], ['nordic', [N.white, N.sage]], ['retro', [R.mustard, R.cream]])
const PLASTIC_PAL = pal(['modern', [M.white, M.light]], ['modern', [M.char, M.gray]], ['retro', [R.red, R.cream]], ['retro', [R.teal, R.cream]], ['cute', [C.lemon, C.white]], ['nordic', [N.sage, N.white]])
/** 钢琴凳：[垫, 木] */
const PIANO_PAL = pal(['modern', [M.black, M.black]], ['retro', [R.red, R.caramel]], ['industrial', [I.leather, I.walnut]], ['nordic', [N.linen, N.white]], ['cute', [C.sakura, C.white]])
/** 化妆凳：[垫, 腿] */
const VANITY_PAL = pal(['cute', [C.sakura, '#e3c06a']], ['cute', [C.lilac, M.white]], ['modern', [M.light, '#e3c06a']], ['retro', [R.teal, '#e3c06a']], ['nordic', [N.linen, N.oak]])
/** 穿鞋凳：[垫, 木] */
const SHOE_PAL = pal(['nordic', [N.gray, N.oak]], ['japanese', [J.ai, J.hinoki]], ['japanese', [J.tatami, J.dark]], ['industrial', [I.leather, I.walnut]], ['modern', [M.char, M.white]])
/** 人体工学椅：[座布, 网面, 框] */
const ERGO_PAL = pal(
  ['modern', [M.char, M.black, M.black]],
  ['modern', [M.light, M.gray, M.white]],
  ['nordic', [N.sage, N.gray, M.white]],
  ['industrial', [I.leather, I.iron, I.iron]],
  ['cute', [C.pink, C.sakura, M.white]],
)
/** 平衡球 / 马鞍：[座 / 球, 框] */
const SEAT_FRAME_PAL = pal(['modern', [M.char, M.black]], ['modern', [M.light, CHROME]], ['nordic', [N.sage, M.white]], ['industrial', [I.leather, I.iron]], ['cute', [C.lilac, M.white]])
/** 跪椅：[垫, 木] */
const KNEEL_PAL = pal(['nordic', [N.gray, N.oak]], ['nordic', [N.blue, N.white]], ['modern', [M.char, M.walnut]], ['japanese', [J.ai, J.hinoki]], ['retro', [R.mustard, R.caramel]])
/** 懒人沙发：[布, 抱枕] */
const BEAN_PAL = pal(['nordic', [N.linen, N.sage]], ['modern', [M.char, M.light]], ['retro', [R.mustard, R.teal]], ['cute', [C.sakura, C.white]], ['industrial', [I.leather, I.concrete]])
/** 曲木椅：[木, 座面] */
const BENT_PAL = pal(['retro', [R.caramel, '#d9c08a']], ['modern', [M.black, M.black]], ['nordic', [N.oak, N.linen]], ['industrial', [I.walnut, I.leather]], ['cute', [C.woodL, C.sakura]])
/** 梯背椅：[木, 编织座] */
const LADDER_PAL = pal(['nordic', [N.oak, '#d9c08a']], ['nordic', [N.white, N.linen]], ['japanese', [J.wood, J.tatami]], ['retro', [R.teal, '#d9c08a']], ['industrial', [I.walnut, I.leather]])

// ---------- 素材 ----------

type Def = Omit<AssetDef, 'palettes'> & ReturnType<typeof pal>
const A = (d: Def): AssetDef => ({ ...d, build: (p) => fit(d.build(p)) })

export const CHAIRS_MORE: AssetDef[] = [
  // 折叠椅
  A({ id: 'c2-fold-pad', name: '软垫折叠椅', family: 'c2-fold-pad', form: 'open', category: 'dining', w: 42.6, d: 43.7, h: 84.2, ...FOLD_PAD_PAL, build: foldPad(true) }),
  A({ id: 'c2-fold-pad-closed', name: '软垫折叠椅', family: 'c2-fold-pad', form: 'closed', formLabel: '折起靠墙', category: 'dining', w: 42.6, d: 9.3, h: 84, ...FOLD_PAD_PAL, build: foldPad(false) }),
  A({ id: 'c2-xslat', name: 'X 腿木条折叠椅', family: 'c2-xslat', form: 'open', category: 'dining', w: 46, d: 45.1, h: 87.4, ...XSLAT_PAL, build: xSlat(true) }),
  A({ id: 'c2-xslat-closed', name: 'X 腿木条折叠椅', family: 'c2-xslat', form: 'closed', formLabel: '折起靠墙', category: 'dining', w: 44.4, d: 10.1, h: 94, ...XSLAT_PAL, build: xSlat(false) }),
  A({ id: 'c2-director-tall', name: '高脚导演椅', family: 'c2-director-tall', form: 'open', category: 'living', w: 54, d: 45.5, h: 122, ...CANVAS_PAL, build: directorTall(true) }),
  A({ id: 'c2-director-tall-closed', name: '高脚导演椅', family: 'c2-director-tall', form: 'closed', formLabel: '收拢', category: 'living', w: 15, d: 45.7, h: 122, ...CANVAS_PAL, build: directorTall(false) }),
  A({ id: 'c2-moon', name: '月亮椅', category: 'outdoor', w: 62.8, d: 67.1, h: 55.7, ...CAMP_PAL, build: moonChair }),
  A({ id: 'c2-camp-arm', name: '户外折叠扶手椅', family: 'c2-camp-arm', form: 'open', category: 'outdoor', w: 66.7, d: 53.6, h: 92.2, ...CAMP_PAL, build: campArm(true) }),
  A({ id: 'c2-camp-arm-closed', name: '户外折叠扶手椅', family: 'c2-camp-arm', form: 'closed', formLabel: '收成一捆', category: 'outdoor', w: 16.8, d: 16.8, h: 92, ...CAMP_PAL, build: campArm(false) }),
  A({ id: 'c2-fold-high-stool', name: '折叠高脚凳', family: 'c2-fold-high-stool', form: 'open', category: 'dining', w: 35, d: 39.4, h: 72.2, ...HIGH_STOOL_PAL, build: foldHighStool(true) }),
  A({ id: 'c2-fold-high-stool-closed', name: '折叠高脚凳', family: 'c2-fold-high-stool', form: 'closed', formLabel: '折起靠墙', category: 'dining', w: 35, d: 9.4, h: 75, ...HIGH_STOOL_PAL, build: foldHighStool(false) }),
  A({ id: 'c2-zaisu-fold', name: '折叠座椅子', family: 'c2-zaisu-fold', form: 'open', category: 'japanese', w: 46, d: 64.9, h: 46.4, ...ZAISU_PAL, build: zaisuFold(true) }),
  A({ id: 'c2-zaisu-fold-folded', name: '折叠座椅子', family: 'c2-zaisu-fold', form: 'folded', formLabel: '靠背折平', category: 'japanese', w: 46, d: 48.7, h: 11.8, ...ZAISU_PAL, build: zaisuFold(false) }),

  // 板凳 / 凳子
  A({ id: 'c2-bench-90', name: '长板凳', family: 'c2-bench', sizeLabel: '双人 90', category: 'dining', w: 90, d: 28, h: 45.2, surface: 45, ...WOOD_PAL, build: bench(90) }),
  A({ id: 'c2-bench-135', name: '长板凳', family: 'c2-bench', sizeLabel: '三人 135', category: 'dining', w: 135, d: 28, h: 45.2, surface: 45, ...WOOD_PAL, build: bench(135) }),
  A({ id: 'c2-frame-stool', name: '实木方凳（带横撑）', category: 'dining', w: 36, d: 36, h: 45, surface: 45, ...FRAME_STOOL_PAL, build: frameStool }),
  A({ id: 'c2-iron-stool-45', name: '工业风圆凳', family: 'c2-iron-stool', sizeLabel: '座高 45', category: 'dining', w: 34, d: 34, h: 45.2, surface: 45, ...IRON_PAL, build: ironStool(45) }),
  A({ id: 'c2-iron-stool-65', name: '工业风圆凳', family: 'c2-iron-stool', sizeLabel: '吧凳 65', category: 'dining', w: 35.4, d: 35.4, h: 65.2, ...IRON_PAL, build: ironStool(65) }),
  A({ id: 'c2-iron-stool-75', name: '工业风圆凳', family: 'c2-iron-stool', sizeLabel: '吧凳 75', category: 'dining', w: 35.4, d: 35.4, h: 75.1, ...IRON_PAL, build: ironStool(75) }),
  A({ id: 'c2-wood-bar-65', name: '矮背木吧凳', family: 'c2-wood-bar', sizeLabel: '座高 65', category: 'dining', w: 41, d: 37.9, h: 80.4, ...WOOD_BAR_PAL, build: woodBar(65) }),
  A({ id: 'c2-wood-bar-75', name: '矮背木吧凳', family: 'c2-wood-bar', sizeLabel: '座高 75', category: 'dining', w: 41, d: 37.9, h: 90.4, ...WOOD_BAR_PAL, build: woodBar(75) }),
  A({ id: 'c2-step-fold', name: '折叠两级踏脚凳', family: 'c2-step-fold', form: 'open', category: 'living', w: 46, d: 48, h: 55.2, ...STEP_PAL, build: stepFold(true) }),
  A({ id: 'c2-step-fold-closed', name: '折叠两级踏脚凳', family: 'c2-step-fold', form: 'closed', formLabel: '折起靠墙', category: 'living', w: 45.3, d: 9.6, h: 60, ...STEP_PAL, build: stepFold(false) }),
  A({ id: 'c2-low-stool', name: '小圆矮凳', category: 'living', w: 30, d: 30, h: 23.6, ...WOOD_PAL, build: lowStool }),
  A({ id: 'c2-kid-stool', name: '儿童小凳', category: 'kids', w: 33, d: 25, h: 27.7, ...KID_PAL, build: kidStool }),
  A({ id: 'c2-stack-stool', name: '叠放塑料凳', family: 'c2-stack-stool', sizeLabel: '单个', category: 'living', w: 31.2, d: 31.2, h: 46.2, ...PLASTIC_PAL, build: stackStool(1) }),
  A({ id: 'c2-stack-stool-5', name: '叠放塑料凳', family: 'c2-stack-stool', sizeLabel: '叠 5 个', form: 'stacked', category: 'living', w: 31.2, d: 31.2, h: 68.2, ...PLASTIC_PAL, build: stackStool(5) }),
  A({ id: 'c2-piano-bench', name: '钢琴凳', category: 'music', w: 74, d: 35, h: 50, ...PIANO_PAL, build: pianoBench }),
  A({ id: 'c2-vanity-stool', name: '化妆凳', category: 'bedroom', w: 38, d: 38, h: 45.4, ...VANITY_PAL, build: vanityStool }),
  A({ id: 'c2-shoe-bench-60', name: '穿鞋凳', family: 'c2-shoe-bench', sizeLabel: '60', category: 'entrance', w: 60, d: 34, h: 44, surface: 44, surfaces: [{ y: 11.6, h: 24 }], ...SHOE_PAL, build: shoeBench(60) }),
  A({ id: 'c2-shoe-bench-90', name: '穿鞋凳', family: 'c2-shoe-bench', sizeLabel: '90', category: 'entrance', w: 90, d: 34, h: 44, surface: 44, surfaces: [{ y: 11.6, h: 24 }], ...SHOE_PAL, build: shoeBench(90) }),

  // 人体工学椅
  A({ id: 'c2-ergo', name: '网背人体工学椅', family: 'c2-ergo', sizeLabel: '带头枕', category: 'study', w: 62.5, d: 71.5, h: 124.3, ...ERGO_PAL, build: ergo(false) }),
  A({ id: 'c2-ergo-foot', name: '网背人体工学椅', family: 'c2-ergo', sizeLabel: '高背带脚托', category: 'study', w: 62.5, d: 97.6, h: 132.2, ...ERGO_PAL, build: ergo(true) }),
  A({ id: 'c2-mesh-simple', name: '简约网椅', category: 'study', w: 56.8, d: 60.3, h: 89.3, ...ERGO_PAL, build: meshSimple }),
  A({ id: 'c2-kneel-rock', name: '摇摆跪椅', category: 'study', w: 43.6, d: 64.8, h: 56.4, ...KNEEL_PAL, build: kneelRock }),
  A({ id: 'c2-saddle', name: '马鞍椅', category: 'study', w: 56.8, d: 55.7, h: 67.5, ...SEAT_FRAME_PAL, build: saddleChair }),
  A({ id: 'c2-ball-stool', name: '平衡球凳', category: 'study', w: 49.2, d: 49.2, h: 52.5, ...SEAT_FRAME_PAL, build: ballStool }),

  // 休闲 / 餐椅
  A({ id: 'c2-bean-lounger', name: '靠背懒人沙发', family: 'beanbag', sizeLabel: '靠背沙发', category: 'living', w: 72, d: 83.9, h: 73.2, ...BEAN_PAL, build: beanLounger }),
  A({ id: 'c2-bentwood', name: '曲木咖啡椅', family: 'dining-chair', sizeLabel: '曲木', category: 'dining', w: 42, d: 45.4, h: 91.8, ...BENT_PAL, build: bentwood }),
  A({ id: 'c2-ladder-back', name: '梯背草编椅', family: 'dining-chair', sizeLabel: '梯背', category: 'dining', w: 46.2, d: 42.1, h: 100.6, ...LADDER_PAL, build: ladderBack }),
]
