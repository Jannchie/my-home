// 儿童床 / 婴儿床的多种款式。约定见 kit.ts 开头。
// 所有婴儿床共用 family 'kid-crib'、所有儿童床共用 family 'kid-bed'（rooms.ts 里的经典款 / 小屋款也在这两个 family 里），
// 素材库里各合成一张卡片，用 sizeLabel 切换款式。
// 配色槽位统一为 [框架, 布面（被子 / 网纱 / 帐幔）, 点缀]；布面直接用 p[1]，不 shade，方便主程序识别布面。
// 婴儿床长边沿 x、儿童床长边沿 z（床头在 -z 贴墙），和 rooms.ts 里的旧款一致。

import * as THREE from 'three'
import { ball, capsule, cyl, face, puck, rbox, shade, toon, torus } from '../toon'
import { C, S, ellipsePoly, glow, holePanel, rectPoly, slab, type AssetDef, type StyleTag } from '../kit'

type V3 = [number, number, number]
type Pal = [StyleTag, string, string, string]
type Base = Omit<AssetDef, 'palettes' | 'paletteStyles'>

const N = S.nordic
const M = S.modern
const J = S.japanese
const I = S.industrial
const R = S.retro

/** 床垫 / 床单白 */
const MAT = '#fbf8f2'
const TIRE = '#3a3a3c'
const STAR = '#ffe08f'

/** 组装素材定义：配色带风格标注；styles 不给就取配色里出现过的风格 */
function A(base: Base, pals: Pal[]): AssetDef {
  return {
    ...base,
    palettes: pals.map((p) => [p[1], p[2], p[3]]),
    paletteStyles: pals.map((p) => p[0]),
    styles: base.styles ?? [...new Set(pals.map((p) => p[0]))],
  }
}

// =====================================================================
// 小工具
// =====================================================================

function meshOf(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 两端已知的 3D 细杆 */
function rod3(a: V3, b: V3, r: number, color: string, seg = 10) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, seg)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 沿 x 的水平圆柱，(x, y, z) 为轴心 */
function cylX(r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) {
  const m = cyl(r, r, len, color, {}, seg)
  m.rotation.z = Math.PI / 2
  m.position.set(x, y, z)
  return m
}

/** 沿 z 的水平圆柱，(x, y, z) 为轴心 */
function cylZ(r: number, len: number, color: string, x: number, y: number, z: number, seg = 16) {
  const m = cyl(r, r, len, color, {}, seg)
  m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  return m
}

/** 一排竖栏杆（沿 x 排开），x0..x1 之间均分 n 根，不含两端 */
function barsX(g: THREE.Group, x0: number, x1: number, n: number, y0: number, y1: number, z: number, r: number, c: string) {
  for (let i = 1; i <= n; i++) g.add(cyl(r, r, y1 - y0, c, { x: x0 + ((x1 - x0) * i) / (n + 1), y: y0, z }, 8))
}

/** 一排竖栏杆（沿 z 排开） */
function barsZ(g: THREE.Group, z0: number, z1: number, n: number, y0: number, y1: number, x: number, r: number, c: string) {
  for (let i = 1; i <= n; i++) g.add(cyl(r, r, y1 - y0, c, { x, y: y0, z: z0 + ((z1 - z0) * i) / (n + 1) }, 8))
}

/**
 * 任意轮廓的板：pts 是板面内的二维轮廓 [u, v]，holes 是圆孔 [u, v, r]，厚 t。
 * plane = 'xy'：u→x、v→y，板厚沿 z，放在 z = at；plane = 'zy'：u→z、v→y，板厚沿 x，放在 x = at（侧板）。
 */
function profile(pts: [number, number][], t: number, color: string, plane: 'xy' | 'zy', at: number, holes: [number, number, number][] = []) {
  const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)))
  for (const [u, v, r] of holes) {
    const h = new THREE.Path()
    h.absarc(u, v, r, 0, Math.PI * 2, true)
    s.holes.push(h)
  }
  const bevel = Math.min(0.5, t * 0.2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 20 })
  geo.translate(0, 0, -t / 2 + bevel)
  const m = meshOf(geo, toon(color))
  if (plane === 'xy') m.position.z = at
  else {
    // 绕 y 转 -90°：局部 x → 世界 z，局部 z（板厚）→ 世界 -x
    m.rotation.y = -Math.PI / 2
    m.position.x = at
  }
  return m
}

/** 椭圆环形横档（椭圆婴儿床的上下圈） */
function ring(rx: number, rz: number, y: number, r: number, color: string) {
  const pts = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2
    return new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz)
  })
  return meshOf(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, r, 8, true), toon(color))
}

/** 半透明布面（网纱、帐幔）：双面、不描边 */
function sheer(geo: THREE.BufferGeometry, color: string, k = 0.4) {
  const mat = toon(color, { transparent: k }).clone()
  mat.side = THREE.DoubleSide
  const m = new THREE.Mesh(geo, mat)
  m.userData.noOutline = true
  return m
}

/** 摇椅 / 摇篮的弧形底板：在 zy 平面里，最低点在 y = 0，半宽 hw，板高 hgt，放在 x */
function rocker(R0: number, hw: number, hgt: number, t: number, color: string, x: number) {
  const n = 16
  const bot: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const z = -hw + (2 * hw * i) / n
    bot.push([z, R0 - Math.sqrt(R0 * R0 - z * z)])
  }
  const top = bot
    .slice()
    .reverse()
    .map(([z, y]): [number, number] => [z, y + hgt])
  return profile([...bot, ...top], t, color, 'zy', x)
}

/** 小枕头 */
function pillow(w: number, d: number, color: string, x: number, y: number, z: number) {
  return rbox(w, 6, d, color, { x, y, z }, 2.8)
}

/** 被子：沿 z 铺（儿童床），靠床头一侧有一道翻折的白被头 */
function duvetZ(g: THREE.Group, w: number, l: number, y: number, z: number, color: string, x = 0) {
  g.add(rbox(w, 6, l, color, { x, y, z }, 2.8))
  g.add(rbox(w + 0.6, 3, 12, MAT, { x, y: y + 4.4, z: z - l / 2 + 6 }, 1.4))
}

/** 小被子：沿 x 铺（婴儿床），靠 -x 一侧翻折 */
function quiltX(g: THREE.Group, lx: number, lz: number, x: number, y: number, z: number, color: string) {
  g.add(rbox(lx, 3.4, lz, color, { x, y, z }, 1.6))
  g.add(rbox(8, 2.4, lz + 0.6, MAT, { x: x - lx / 2 + 4, y: y + 2.2, z }, 1))
}

/** 泰迪熊玩偶（坐姿，原点在底面，面朝 +z，ry 转向） */
function bear(color: string, x: number, y: number, z: number, s = 1, ry = 0) {
  const g = new THREE.Group()
  const light = shade(color, 0.14)
  g.add(ball(5 * s, color, { y: 4.6 * s }, [1, 0.92, 0.86]))
  g.add(ball(2.6 * s, light, { y: 4 * s, z: 2.6 * s }, [1, 1, 0.6]))
  for (const k of [-1, 1]) {
    g.add(ball(1.8 * s, color, { x: k * 4.4 * s, y: 5.4 * s, z: 1.4 * s }, [0.9, 1.3, 0.9]))
    g.add(ball(2 * s, color, { x: k * 2.6 * s, y: 1.7 * s, z: 3.4 * s }, [1, 0.8, 1.3]))
    g.add(ball(1.6 * s, color, { x: k * 3 * s, y: 15.4 * s }))
  }
  g.add(ball(4.2 * s, color, { y: 12 * s }))
  g.add(ball(1.7 * s, light, { y: 11 * s, z: 3.6 * s }, [1, 0.8, 0.7]))
  const nose = ball(0.6 * s, C.ink, { y: 11.7 * s, z: 4.7 * s })
  nose.userData.noOutline = true
  g.add(nose)
  g.add(face(7 * s, { y: 12.9 * s, z: 3.8 * s }))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

/** 兔子玩偶（坐姿，长耳朵） */
function bunny(color: string, x: number, y: number, z: number, s = 1, ry = 0) {
  const g = new THREE.Group()
  g.add(ball(4.6 * s, color, { y: 4.3 * s }, [1, 0.94, 0.9]))
  for (const k of [-1, 1]) {
    g.add(ball(1.9 * s, color, { x: k * 2.4 * s, y: 1.5 * s, z: 3.2 * s }, [1, 0.75, 1.4]))
    g.add(capsule(1.1 * s, 5 * s, color, { x: k * 1.7 * s, y: 13.4 * s, rz: -k * 0.16 }))
  }
  g.add(ball(4 * s, color, { y: 11 * s }))
  g.add(ball(1.3 * s, C.sakura, { y: 3.4 * s, z: -4.4 * s }))
  g.add(face(6.6 * s, { y: 11.4 * s, z: 3.7 * s }))
  g.position.set(x, y, z)
  g.rotation.y = ry
  return g
}

/** 小芥子人偶（和风婴儿床用） */
function kokeshi(body: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cyl(2.4, 2.8, 8, body, {}, 16))
  g.add(cyl(2.5, 2.5, 1, J.shu, { y: 4 }, 16))
  g.add(ball(3.2, J.washi, { y: 11 }))
  g.add(ball(3.3, J.sumi, { y: 11.8, z: -0.6 }, [1, 0.9, 1]))
  g.add(face(5.4, { y: 10.6, z: 3 }))
  g.position.set(x, y, z)
  return g
}

/**
 * 床铃：夹在栏杆顶 (x, y0, z) 上的竖杆，顶部到 top，横臂伸到 (cx, cz) 上空，下挂 4 个小玩具。
 * 最高点正好是 top。
 */
function mobile(g: THREE.Group, x: number, z: number, y0: number, top: number, cx: number, cz: number, arm: string, cols: string[]) {
  g.add(rbox(4, 7, 5, arm, { x, y: y0 - 5, z }, 1.2))
  g.add(cyl(0.8, 0.8, top - 1 - (y0 - 4), arm, { x, y: y0 - 4, z }, 8))
  g.add(ball(1, arm, { x, y: top - 1, z }))
  g.add(rod3([x, top - 2.2, z], [cx, top - 2.2, cz], 0.7, arm))
  const hy = top - 7
  g.add(cyl(0.2, 0.2, 5, arm, { x: cx, y: hy, z: cz }, 6))
  g.add(puck(2.4, 1.6, arm, { x: cx, y: hy - 1, z: cz }))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const ex = cx + Math.cos(a) * 10
    const ez = cz + Math.sin(a) * 10
    g.add(rod3([cx, hy - 0.4, cz], [ex, hy - 0.4, ez], 0.35, arm, 6))
    const L = 7 + (i % 2) * 4
    g.add(cyl(0.15, 0.15, L, C.ink, { x: ex, y: hy - 0.4 - L, z: ez }, 4))
    const ty = hy - 0.4 - L - 2.4
    const col = cols[i % cols.length]
    if (i === 0) g.add(ball(2.4, col, { x: ex, y: ty, z: ez }))
    else if (i === 1) {
      // 星星：两片交叉的小方片
      g.add(rbox(4, 4, 1.2, col, { x: ex, y: ty - 2, z: ez, rz: Math.PI / 4 }, 0.5))
      g.add(rbox(4, 4, 1.2, col, { x: ex, y: ty - 2, z: ez }, 0.5))
    } else if (i === 2) g.add(torus(2.2, 0.9, col, { x: ex, y: ty, z: ez, rz: 0.6 }, Math.PI * 1.3))
    else for (const k of [-1, 0, 1]) g.add(ball(1.7 - Math.abs(k) * 0.3, col, { x: ex + k * 1.9, y: ty + (k === 0 ? 0.6 : 0), z: ez }))
  }
}

// =====================================================================
// 婴儿床（family kid-crib，长边沿 x）
// =====================================================================

/** 经典木栏床：方柱 + 车木球头，四面竖栏杆，两端上半是带圆孔的床头板，夹一个床铃 */
function cribWood(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 63
      const z = sz * 33
      g.add(rbox(6, 88, 6, frame, { x, z }, 1.5))
      g.add(cyl(2, 2.6, 3, frame, { x, y: 88, z }, 12))
      g.add(ball(3, frame, { x, y: 93, z }))
    }
  for (const sz of [-1, 1]) {
    const z = sz * 33
    g.add(rbox(120.4, 4, 4, frame, { y: 82, z }, 1.2))
    g.add(rbox(120.4, 4, 4, frame, { y: 22, z }, 1.2))
    barsX(g, -60, 60, 13, 25, 83, z, 1.1, frame)
  }
  for (const sx of [-1, 1]) {
    const x = sx * 63
    g.add(rbox(4, 4, 60.4, frame, { x, y: 22 }, 1.2))
    g.add(rbox(4, 4, 60.4, frame, { x, y: 54 }, 1.2))
    barsZ(g, -30, 30, 6, 25, 55, x, 1.1, frame)
    g.add(holePanel(60.4, 28, 3, frame, [{ kind: 'circle', x: 0, y: 14, r: 7 }], { x, y: 58, ry: Math.PI / 2 }, 2))
  }
  g.add(rbox(120, 3, 60, frame, { y: 24 }, 1))
  g.add(rbox(118, 11, 58, MAT, { y: 27 }, 4))
  g.add(pillow(24, 34, fab, -44, 37.6, 0))
  quiltX(g, 54, 56, 28, 37.8, 0, fab)
  g.add(bear(acc === fab ? C.peach : acc, -22, 37.8, -8, 1, 0.5))
  mobile(g, -38, -33, 86, 118, -28, -4, frame, [C.lemon, C.sky, C.pink, C.mint])
  return g
}

/** 白色北欧圆角床：圆柱角柱、圆杆横档，两端是大圆角的整板（开拱形把手孔） */
function cribNordic(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cyl(2.5, 2.5, 87.5, frame, { x: sx * 59.5, z: sz * 30.5 }, 16))
      g.add(ball(2.5, frame, { x: sx * 59.5, y: 87.5, z: sz * 30.5 }))
    }
  for (const sz of [-1, 1]) {
    const z = sz * 30.5
    g.add(rod3([-59.5, 84, z], [59.5, 84, z], 1.8, frame, 12))
    g.add(rod3([-59.5, 22, z], [59.5, 22, z], 1.8, frame, 12))
    barsX(g, -59.5, 59.5, 14, 22, 84, z, 0.9, frame)
  }
  for (const sx of [-1, 1]) g.add(holePanel(57, 68, 2.5, frame, [{ kind: 'arch', x: 0, y: 44, w: 24, h: 16 }], { x: sx * 59.5, y: 20, ry: Math.PI / 2 }, 12))
  g.add(rbox(116, 2.5, 58, frame, { y: 21 }, 1))
  g.add(rbox(114, 10, 56, MAT, { y: 23.5 }, 4))
  g.add(pillow(22, 32, MAT, -42, 33.3, 0))
  quiltX(g, 56, 54, 24, 33.4, 0, fab)
  g.add(bunny(acc, -20, 33.4, -10, 1, 0.4))
  return g
}

/** 可调高度带抽屉：底部两只抽屉的柜座，角柱上有三档调节孔，床板在高档 */
function cribDrawer(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  // 柜座
  g.add(rbox(124, 24, 66, frame, { y: 1 }, 2))
  for (const sx of [-1, 1]) {
    g.add(rbox(56, 18, 1.6, shade(frame, -0.04), { x: sx * 29, y: 4, z: 32.6 }, 0.8))
    g.add(rbox(20, 2, 0.8, acc, { x: sx * 29, y: 17, z: 33.6 }, 0.4))
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(5, 100, 5, frame, { x: sx * 62.5, z: sz * 32.5 }, 1.4))
      // 调节孔
      for (const y of [40, 55, 70]) {
        const hole = cyl(0.9, 0.9, 0.4, C.ink, {}, 10)
        hole.rotation.z = Math.PI / 2
        hole.position.set(sx * 59.9, y, sz * 32.5)
        hole.userData.noOutline = true
        g.add(hole)
      }
    }
  for (const sz of [-1, 1]) {
    const z = sz * 32.5
    g.add(rbox(120.4, 4, 4, frame, { y: 95, z }, 1.2))
    g.add(rbox(120.4, 4, 4, frame, { y: 26, z }, 1.2))
    barsX(g, -60, 60, 14, 29, 96, z, 1, frame)
  }
  for (const sx of [-1, 1]) {
    const holes =
      sx < 0
        ? [{ kind: 'circle' as const, x: 0, y: 52, r: 7 }]
        : [-14, 0, 14].map((x) => ({ kind: 'circle' as const, x, y: 50, r: 4 }))
    g.add(holePanel(60.4, 72, 3, frame, holes, { x: sx * 62.5, y: 25, ry: Math.PI / 2 }, 3))
  }
  // 高档床板：四角托在插进调节孔的金属托架上（以前床板四周都离框 0.5~2cm，悬空）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, 1.5, 4, C.steel, { x: sx * 60, y: 53.6, z: sz * 29.5 }, 0.4))
  g.add(rbox(118, 3, 62, frame, { y: 55 }, 1))
  g.add(rbox(116, 10, 60, MAT, { y: 58 }, 4))
  g.add(pillow(22, 34, fab, -44, 67.5, 0))
  quiltX(g, 56, 58, 26, 67.6, 0, fab)
  g.add(bear(acc, -24, 67.6, -8, 0.95, 0.5))
  return g
}

/** 摇篮：栏杆小床架在两条弧形摇板上，可以左右摇 */
function cradle(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(rocker(80, 32, 8, 3, frame, sx * 44))
  g.add(cylX(1.6, 88, frame, 0, 4, 0))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cyl(2, 2, 74, frame, { x: sx * 44, y: 6, z: sz * 24 }, 12))
      g.add(ball(2, frame, { x: sx * 44, y: 80, z: sz * 24 }))
    }
  for (const sz of [-1, 1]) {
    const z = sz * 24
    g.add(rod3([-44, 76, z], [44, 76, z], 1.5, frame))
    g.add(rod3([-44, 34, z], [44, 34, z], 1.5, frame))
    barsX(g, -44, 44, 10, 34, 76, z, 0.8, frame)
  }
  // 床头整板（圆角），床尾栏杆
  g.add(holePanel(46, 50, 2.5, frame, [{ kind: 'circle', x: 0, y: 36, r: 6 }], { x: -44, y: 30, ry: Math.PI / 2 }, 14))
  g.add(rod3([44, 76, -24], [44, 76, 24], 1.5, frame))
  g.add(rod3([44, 34, -24], [44, 34, 24], 1.5, frame))
  barsZ(g, -24, 24, 5, 34, 76, 44, 0.8, frame)
  g.add(rbox(86, 2.5, 46, frame, { y: 33 }, 1))
  g.add(rbox(84, 7, 44, MAT, { y: 35.5 }, 3))
  g.add(pillow(18, 26, MAT, -32, 42.3, 0))
  quiltX(g, 44, 42, 16, 42.4, 0, fab)
  g.add(bunny(acc, -12, 42.4, -8, 0.8, 0.5))
  return g
}

/** 椭圆形婴儿床：上下两圈椭圆横档，栏杆沿椭圆排开，椭圆床垫 */
function cribOval(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  const RX = 60
  const RZ = 36
  g.add(ring(RX, RZ, 86, 2, frame))
  g.add(ring(RX, RZ, 26, 2, frame))
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.add(cyl(0.9, 0.9, 60, frame, { x: Math.cos(a) * RX, y: 26, z: Math.sin(a) * RZ }, 8))
  }
  // 六条短腿
  for (const a of [0, 1, 2, 3, 4, 5].map((k) => (k / 6) * Math.PI * 2 + Math.PI / 6)) {
    g.add(cyl(2.2, 1.8, 26, frame, { x: Math.cos(a) * (RX - 4), z: Math.sin(a) * (RZ - 4) }, 12))
  }
  g.add(slab(ellipsePoly(RX - 1, RZ - 1, 0, 0, 40), 3, frame, 24))
  g.add(slab(ellipsePoly(RX - 3, RZ - 3, 0, 0, 40), 10, MAT, 27))
  g.add(slab(ellipsePoly(26, 27, 24, 0, 32), 3, fab, 37))
  g.add(pillow(18, 26, MAT, -40, 36.8, 0))
  g.add(bear(acc, -18, 37, -6, 1, 0.5))
  return g
}

/** 可折叠旅行床：软包角柱 + 四面半透明网纱，底部一圈布围 */
function cribTravel(p: string[]) {
  const [frame, mesh, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(7, 74, 7, frame, { x: sx * 48.5, z: sz * 34.5 }, 3))
      g.add(rbox(7, 4, 7, acc, { x: sx * 48.5, y: 74, z: sz * 34.5 }, 2))
    }
  for (const sz of [-1, 1]) {
    g.add(rbox(90, 5, 5, frame, { y: 70, z: sz * 34.5 }, 2.4))
    g.add(rbox(90.4, 22, 2, frame, { y: 1, z: sz * 34.5 }, 0.8))
    g.add(sheer(new THREE.BoxGeometry(90, 48, 0.6).translate(0, 47, sz * 34.5), mesh, 0.42))
  }
  for (const sx of [-1, 1]) {
    g.add(rbox(5, 5, 62, frame, { x: sx * 48.5, y: 70 }, 2.4))
    g.add(rbox(2, 22, 62.4, frame, { x: sx * 48.5, y: 1 }, 0.8))
    g.add(sheer(new THREE.BoxGeometry(0.6, 48, 62).translate(sx * 48.5, 47, 0), mesh, 0.42))
  }
  g.add(rbox(90, 2, 62, frame, { y: 1 }, 0.8))
  g.add(rbox(88, 5, 60, mesh, { y: 3 }, 2))
  // 中间的折叠把手
  g.add(puck(5, 1.6, acc, { y: 8 }))
  quiltX(g, 40, 50, 18, 8, 0, acc)
  g.add(bear(C.peach, -26, 8, -6, 1, 0.4))
  return g
}

/** 和风矮床：榻榻米床面（带縁）+ 竹竿围栏，上面铺小布团 */
function cribWa(p: string[]) {
  const [bamboo, tatami, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(8, 3, 8, shade(bamboo, -0.12), { x: sx * 54, z: sz * 28 }, 1))
  g.add(rbox(122, 10, 70, bamboo, { y: 3 }, 2))
  // 角柱：竹竿 + 竹节
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 60.6
      const z = sz * 34.6
      g.add(cyl(2.4, 2.4, 43.6, bamboo, { x, z }, 14))
      g.add(ball(2.4, bamboo, { x, y: 43.6, z }))
      for (const y of [22, 34]) g.add(torus(2.5, 0.45, shade(bamboo, -0.1), { x, y, z, rx: Math.PI / 2 }))
    }
  // 竹栏：上下横竿 + 竖竿
  const bar = shade(bamboo, 0.04)
  for (const sz of [-1, 1]) {
    const z = sz * 34.6
    g.add(cylX(1.6, 121.2, bamboo, 0, 40, z))
    g.add(cylX(1.6, 121.2, bamboo, 0, 15, z))
    barsX(g, -60.6, 60.6, 15, 14, 41, z, 1.1, bar)
  }
  for (const sx of [-1, 1]) {
    const x = sx * 60.6
    g.add(cylZ(1.6, 69.2, bamboo, x, 40, 0))
    g.add(cylZ(1.6, 69.2, bamboo, x, 15, 0))
    barsZ(g, -34.6, 34.6, 8, 14, 41, x, 1.1, bar)
  }
  // 榻榻米：面 + 两侧縁
  g.add(rbox(116, 6, 64, tatami, { y: 13 }, 1))
  for (const sz of [-1, 1]) g.add(rbox(116.6, 6.4, 3.2, acc, { y: 12.9, z: sz * 30.6 }, 0.6))
  g.add(rbox(96, 5, 52, MAT, { x: 4, y: 18.6 }, 2))
  g.add(pillow(18, 26, J.washi, -36, 23.4, 0))
  quiltX(g, 52, 50, 24, 23.5, 0, acc)
  g.add(kokeshi(acc, -12, 23.6, -10))
  return g
}

/** 带蚊帐顶篷：圆柱角柱的栏杆床，背面立一根杆子挑出帐冠，纱帐垂到栏杆顶 */
function cribCanopy(p: string[]) {
  const [frame, net, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(cyl(2.5, 2.5, 88, frame, { x: sx * 61.5, z: sz * 32.5 }, 16))
      g.add(ball(2.5, frame, { x: sx * 61.5, y: 88, z: sz * 32.5 }))
    }
  for (const sz of [-1, 1]) {
    const z = sz * 32.5
    g.add(rbox(120, 4, 4, frame, { y: 82, z }, 1.4))
    g.add(rbox(120, 4, 4, frame, { y: 22, z }, 1.4))
    barsX(g, -60, 60, 14, 25, 83, z, 1, frame)
  }
  for (const sx of [-1, 1]) g.add(holePanel(62, 64, 3, frame, [{ kind: 'arch', x: 0, y: 40, w: 20, h: 16 }], { x: sx * 61.5, y: 22, ry: Math.PI / 2 }, 8))
  g.add(rbox(120, 3, 62, frame, { y: 24 }, 1))
  g.add(rbox(118, 11, 60, MAT, { y: 27 }, 4))
  g.add(pillow(22, 34, MAT, -44, 37.6, 0))
  quiltX(g, 54, 58, 28, 37.8, 0, acc)
  g.add(bunny(C.sakura, -22, 37.8, -8, 1, 0.5))
  // 帐杆：夹在背面横档上
  g.add(rbox(5, 8, 5, frame, { x: 0, y: 80, z: -32.5 }, 1.2))
  g.add(cyl(1.4, 1.4, 82, frame, { x: 0, y: 84, z: -33 }, 10))
  g.add(ball(2, frame, { x: 0, y: 166, z: -33 }))
  g.add(rod3([0, 162, -33], [0, 162, 0], 1.1, frame))
  // 帐冠 + 纱帐（椭圆锥台，压扁成床的比例）
  const canopy = new THREE.Group()
  canopy.add(sheer(new THREE.CylinderGeometry(9, 31, 72, 40, 1, true).translate(0, 87 + 36, 0), net, 0.38))
  canopy.add(torus(9, 1.2, acc, { y: 159, rx: Math.PI / 2 }))
  canopy.scale.set(1.75, 1, 1)
  g.add(canopy)
  g.add(cyl(7, 9.6, 4, acc, { y: 158 }, 24))
  g.add(ball(1.8, acc, { y: 163.4 }))
  return g
}

// =====================================================================
// 儿童床（family kid-bed，长边沿 z，床头在 -z）
// =====================================================================

/** 汽车床：车身侧板（引擎盖高、驾驶舱低、尾部翘起）+ 四个轮子 + 尾翼 + 前大灯 */
function carBed(p: string[]) {
  const [body, fab, acc] = p
  const g = new THREE.Group()
  const side: [number, number][] = [
    [-103, 4],
    [103, 4],
    [103, 40],
    [99, 48],
    [72, 50],
    [66, 38],
    [-70, 38],
    [-78, 52],
    [-98, 56],
    [-103, 52],
  ]
  for (const sx of [-1, 1]) {
    g.add(profile(side, 4, body, 'zy', sx * 46))
    // 赛车条纹 + 号码牌
    g.add(rbox(0.8, 3, 110, acc, { x: sx * 48.4, y: 30, z: -6 }, 0.3))
    g.add(cylX(8, 0.8, C.white, sx * 48.4, 19, 18, 24))
    g.add(cylX(4, 1, acc, sx * 48.5, 19, 18, 20))
    for (const z of [-70, 70]) {
      g.add(cylX(16, 5, TIRE, sx * 50.5, 16, z, 28))
      g.add(cylX(8, 1.2, C.steel, sx * 53.3, 16, z, 20))
      g.add(cylX(2.6, 1.6, shade(body, -0.1), sx * 53.8, 16, z, 12))
    }
  }
  // 车头：前脸 + 引擎盖 + 仪表板
  g.add(rbox(88.4, 44, 4, body, { y: 4, z: 99.6 }, 1.2))
  g.add(rbox(88.4, 3, 30, body, { y: 46, z: 84 }, 1.2))
  g.add(rbox(88.4, 12, 3, body, { y: 36, z: 67.5 }, 1))
  for (const sx of [-1, 1]) g.add(glow(14, 7, C.lamp, { x: sx * 28, y: 30, z: 101.9 }, 0.6))
  g.add(rbox(30, 8, 0.8, C.ink, { y: 18, z: 101.8 }, 0.3))
  g.add(rbox(84, 16, 1.6, '#4a5a6a', { y: 48, z: 66, rx: -0.5 }, 0.6))
  // 方向盘
  g.add(cylZ(1, 8, C.ink, -20, 44, 62))
  g.add(torus(6.5, 1.3, C.ink, { x: -20, y: 44, z: 58 }))
  // 车尾：后挡板 + 尾翼
  g.add(rbox(88.4, 50, 4, body, { y: 4, z: -100 }, 1.2))
  // 尾翼支柱立在后挡板上（以前离挡板 4cm，尾翼整组悬空）
  for (const sx of [-1, 1]) g.add(rbox(4, 14, 4, acc, { x: sx * 30, y: 53, z: -99.5 }, 1))
  g.add(rbox(98, 3, 14, acc, { y: 66, z: -92 }, 1.2))
  // 床板 + 床垫
  g.add(rbox(88, 4, 166, shade(body, -0.15), { y: 16, z: -17 }, 1))
  g.add(rbox(86, 12, 162, MAT, { y: 20, z: -17 }, 4))
  g.add(pillow(44, 28, MAT, 0, 31.6, -82))
  duvetZ(g, 86.6, 96, 31.8, 12, fab)
  return g
}

/** 公主城堡床：城墙床头（城垛 + 拱窗）两侧尖顶塔楼，床头挑出半边纱帐；床尾矮城墙 + 小塔 */
function castleBed(p: string[]) {
  const [wall, fab, roof] = p
  const g = new THREE.Group()
  // 床头城墙
  g.add(holePanel(84, 96, 4, wall, [{ kind: 'arch', x: 0, y: 52, w: 22, h: 28 }], { y: 0, z: -94 }, 1))
  for (let i = 0; i < 5; i++) g.add(rbox(10, 10, 4, wall, { x: -32 + i * 16, y: 95.6, z: -94 }, 1))
  // 床头两座塔楼
  for (const sx of [-1, 1]) {
    const x = sx * 41
    g.add(cyl(9, 9, 126, wall, { x, z: -89 }, 24))
    g.add(cyl(10, 10, 4, shade(wall, -0.06), { x, y: 122, z: -89 }, 24))
    g.add(cyl(0, 11, 34, roof, { x, y: 126, z: -89 }, 24))
    g.add(cyl(0.6, 0.6, 16, C.ink, { x, y: 158, z: -89 }, 6))
    g.add(rbox(9, 6, 0.6, roof, { x: x + 4.8 * -sx, y: 166, z: -89 }, 0.2))
    // 塔窗
    g.add(rbox(5, 9, 1, C.ink, { x, y: 84, z: -79.6 }, 1))
  }
  // 床尾矮城墙 + 小塔
  g.add(holePanel(84, 56, 4, wall, [{ kind: 'arch', x: 0, y: 26, w: 18, h: 22 }], { y: 0, z: 96 }, 1))
  for (let i = 0; i < 5; i++) g.add(rbox(10, 8, 4, wall, { x: -32 + i * 16, y: 55.6, z: 96 }, 1))
  for (const sx of [-1, 1]) {
    const x = sx * 43
    g.add(cyl(7, 7, 70, wall, { x, z: 92 }, 20))
    g.add(cyl(0, 8, 20, roof, { x, y: 70, z: 92 }, 20))
  }
  // 侧板（开一排小拱洞）
  for (const sx of [-1, 1]) {
    const holes = [-50, -10, 30].map((x) => ({ kind: 'arch' as const, x, y: 8, w: 14, h: 14 }))
    g.add(holePanel(176, 28, 4, wall, holes, { x: sx * 44, y: 4, z: 2, ry: Math.PI / 2 }, 2))
  }
  g.add(rbox(84, 3, 186, shade(wall, -0.08), { y: 16, z: 1 }, 1))
  g.add(rbox(83, 14, 184, MAT, { y: 19, z: 1 }, 5))
  g.add(pillow(44, 28, MAT, 0, 32.6, -76))
  duvetZ(g, 83.6, 110, 32.8, 30, fab)
  // 纱帐：前半个锥台，帐冠挂在床头城墙上方
  g.add(cyl(1.4, 1.4, 70, wall, { y: 96, z: -94 }, 10))
  g.add(rbox(20, 6, 8, roof, { y: 164, z: -92 }, 1.6))
  g.add(ball(2.4, roof, { y: 172.4, z: -92 }))
  const half = new THREE.CylinderGeometry(9, 46, 124, 32, 1, true, -Math.PI / 2, Math.PI).translate(0, 40 + 62, -94)
  g.add(sheer(half, fab, 0.42))
  return g
}

/** 小屋框架床（烟囱款）：落地床架 + 尖顶屋框，床头山墙开圆窗，一侧屋面铺半截木板，屋面上有烟囱 */
function houseBed2(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  const RY = 172
  for (const sx of [-1, 1])
    for (const z of [-96, 0, 96]) g.add(rbox(5, 120, 5, frame, { x: sx * 46, z }, 1.3))
  // 床架
  for (const sx of [-1, 1]) g.add(rbox(4, 14, 192, frame, { x: sx * 46, y: 0 }, 1.2))
  for (const z of [-96, 96]) g.add(rbox(88, 14, 4, frame, { y: 0, z }, 1.2))
  g.add(rbox(88, 2, 188, shade(frame, -0.08), { y: 4 }, 0.8))
  g.add(rbox(86, 14, 186, MAT, { y: 6 }, 5))
  g.add(pillow(44, 28, MAT, 0, 19.6, -78))
  duvetZ(g, 86.6, 110, 19.8, 30, fab)
  // 屋顶框：檐梁 + 斜梁 + 屋脊
  const ang = Math.atan2(RY - 120, 46)
  const len = Math.hypot(46, RY - 120)
  for (const sx of [-1, 1]) {
    g.add(rbox(4, 4, 196, frame, { x: sx * 46, y: 118 }, 1.2))
    for (const z of [-96, 0, 96]) g.add(rod3([sx * 46, 120, z], [0, RY, z], 2, frame))
  }
  g.add(rbox(5, 5, 200, frame, { y: RY - 2 }, 1.4))
  // -x 一侧屋面：床头那半铺木板
  for (let i = 0; i < 6; i++) {
    const z = -92.7 + i * 15.4
    g.add(rbox(len - 2, 1.6, 14.6, i % 2 ? shade(frame, 0.05) : frame, { x: -23, y: (120 + RY) / 2 + 1.2 - 0.8, z, rz: ang }, 0.6))
  }
  // 床头山墙（三角板 + 圆窗）
  g.add(profile([
    [-46, 118],
    [46, 118],
    [0, RY - 2],
  ], 3, frame, 'xy', -98.5, [[0, 138, 9]]))
  // 烟囱（在 +x 屋面上）
  // 烟囱下面加一根檩条，烟囱立在檩条上（+x 屋面只有椽子没有屋面板，以前烟囱悬在半空）
  g.add(rbox(4, 4, 196, frame, { x: 22, y: 143.5 }, 1.2))
  g.add(rbox(10, 26, 10, acc, { x: 22, y: 140, z: -62 }, 1.2))
  g.add(rbox(12, 3, 12, shade(acc, -0.1), { x: 22, y: 165, z: -62 }, 1))
  // 两侧低护栏（+x 中段留口）
  for (const sx of [-1, 1]) {
    const z1 = sx > 0 ? -10 : 96
    g.add(rbox(3, 3, z1 + 96, frame, { x: sx * 46, y: 34, z: (z1 - 96) / 2 }, 1))
    barsZ(g, -96, z1, sx > 0 ? 4 : 10, 14, 34.5, sx * 46, 1, frame)
  }
  // 屋脊下一串小灯
  for (let i = 0; i < 9; i++) {
    const z = -80 + i * 20
    const sag = 8 - Math.abs(i - 4) * 0.8
    const b = ball(1.6, STAR, { y: RY - 6 - sag, z })
    b.material = toon(STAR, { emissive: 0.7 })
    g.add(b)
    g.add(cyl(0.2, 0.2, sag + 3.6, C.ink, { y: RY - 5.6 - sag, z }, 4))
  }
  return g
}

/** 上下铺：四根通高立柱，下铺 + 上铺（四周护栏），床尾立式梯子 */
function bunkBed(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 160, 6, frame, { x: sx * 49, z: sz * 97 }, 1.5))
  const deck = (y: number, duvet: string) => {
    for (const sx of [-1, 1]) g.add(rbox(4, 14, 188, frame, { x: sx * 49, y }, 1.2))
    for (const sz of [-1, 1]) g.add(rbox(92, 14, 4, frame, { y, z: sz * 97 }, 1.2))
    g.add(rbox(92, 2, 188, shade(frame, -0.08), { y: y + 4 }, 0.8))
    g.add(rbox(90, 12, 186, MAT, { y: y + 6 }, 4))
    g.add(pillow(44, 26, MAT, 0, y + 17.6, -78))
    duvetZ(g, 90.6, 96, y + 17.8, 40, duvet)
  }
  deck(16, fab)
  deck(100, acc)
  // 上铺护栏：两长边全长，床头整板，床尾在梯子上方留口
  for (const sx of [-1, 1]) {
    g.add(rbox(4, 4, 188, frame, { x: sx * 49, y: 150 }, 1.2))
    barsZ(g, -94, 94, 11, 114, 151, sx * 49, 1.2, frame)
  }
  g.add(rbox(92, 34, 3, frame, { y: 116, z: -97 }, 1))
  g.add(rbox(92, 26, 3, frame, { y: 36, z: -97 }, 1))
  g.add(rbox(57, 4, 4, frame, { x: -18.5, y: 150, z: 97 }, 1.2))
  barsX(g, -46, 10, 3, 114, 151, 97, 1.2, frame)
  // 梯子
  g.add(rbox(5, 160, 5, frame, { x: 10, z: 97 }, 1.3))
  for (const y of [50, 75, 125, 145]) g.add(cylX(1.6, 37, frame, 29, y, 97))
  g.add(bear(C.peach, -26, 117.8, -50, 1, 0.3))
  return g
}

/** 高架床：上铺 + 护栏，床下靠 -x 一侧是书桌（带三斗抽屉柜），床尾梯子 */
function loftBed(p: string[]) {
  const [frame, fab, desk] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(6, 180, 6, frame, { x: sx * 49, z: sz * 97 }, 1.5))
  for (const sx of [-1, 1]) g.add(rbox(4, 14, 188, frame, { x: sx * 49, y: 124 }, 1.2))
  for (const sz of [-1, 1]) g.add(rbox(92, 14, 4, frame, { y: 124, z: sz * 97 }, 1.2))
  g.add(rbox(92, 2, 188, shade(frame, -0.08), { y: 128 }, 0.8))
  g.add(rbox(90, 12, 186, MAT, { y: 130 }, 4))
  g.add(pillow(44, 26, MAT, 0, 141.6, -78))
  duvetZ(g, 90.6, 96, 141.8, 40, fab)
  for (const sx of [-1, 1]) {
    g.add(rbox(4, 4, 188, frame, { x: sx * 49, y: 170 }, 1.2))
    barsZ(g, -94, 94, 11, 138, 171, sx * 49, 1.2, frame)
  }
  g.add(rbox(92, 34, 3, frame, { y: 138, z: -97 }, 1))
  g.add(rbox(57, 4, 4, frame, { x: -18.5, y: 170, z: 97 }, 1.2))
  barsX(g, -46, 10, 3, 138, 171, 97, 1.2, frame)
  // 梯子
  g.add(rbox(5, 180, 5, frame, { x: 10, z: 97 }, 1.3))
  for (const y of [26, 52, 78, 104, 150, 164]) g.add(cylX(1.6, 37, frame, 29, y, 97))
  // 书桌：桌面 + 抽屉柜 + 端板
  g.add(rbox(50, 3, 120, desk, { x: -21, y: 70, z: -20 }, 1))
  g.add(rbox(42, 70, 36, frame, { x: -25, z: -60 }, 1.2))
  for (const y of [3, 25, 47]) {
    g.add(rbox(1.6, 20, 32, desk, { x: -3.6, y, z: -60 }, 0.8))
    g.add(rbox(0.8, 2, 12, C.ink, { x: -2.6, y: y + 15, z: -60 }, 0.3))
  }
  g.add(rbox(46, 70, 3, frame, { x: -23, z: 38.5 }, 1))
  g.add(bunny(C.sakura, -26, 141.8, -50, 1, 0.3))
  return g
}

/** 蒙氏地床：贴地的矮床框 + 一圈圆杆护栏，长边中段留出入口，孩子能自己爬上爬下 */
function montessoriBed(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(rbox(4, 12, 190, frame, { x: sx * 46.5 }, 1.2))
  for (const sz of [-1, 1]) g.add(rbox(89, 12, 4, frame, { z: sz * 96.5 }, 1.2))
  g.add(rbox(89, 2, 190, shade(frame, -0.08), { y: 1 }, 0.8))
  g.add(rbox(88, 14, 188, MAT, { y: 3 }, 5))
  g.add(pillow(44, 28, MAT, 0, 16.6, -76))
  duvetZ(g, 88.6, 100, 16.8, 34, fab)
  g.add(bear(acc, -24, 17, -48, 1, 0.4))
  // 护栏立柱：四角 + 入口两侧
  const posts: [number, number][] = [
    [-46.5, -96.5],
    [46.5, -96.5],
    [-46.5, 96.5],
    [46.5, 96.5],
    [46.5, -20],
    [46.5, 50],
  ]
  for (const [x, z] of posts) {
    g.add(rbox(5, 38, 5, frame, { x, z }, 1.6))
    g.add(ball(2.5, frame, { x, y: 37.5, z }))
  }
  const top = 36
  g.add(rod3([-46.5, top, -96.5], [-46.5, top, 96.5], 2, frame, 12))
  g.add(rod3([46.5, top, -96.5], [46.5, top, -20], 2, frame, 12))
  g.add(rod3([46.5, top, 50], [46.5, top, 96.5], 2, frame, 12))
  g.add(rod3([-46.5, top, -96.5], [46.5, top, -96.5], 2, frame, 12))
  g.add(rod3([-46.5, top, 96.5], [46.5, top, 96.5], 2, frame, 12))
  barsZ(g, -96.5, 96.5, 14, 12, top, -46.5, 1.2, frame)
  barsZ(g, -96.5, -20, 5, 12, top, 46.5, 1.2, frame)
  barsZ(g, 50, 96.5, 3, 12, top, 46.5, 1.2, frame)
  barsX(g, -46.5, 46.5, 7, 12, top, -96.5, 1.2, frame)
  barsX(g, -46.5, 46.5, 7, 12, top, 96.5, 1.2, frame)
  return g
}

/** 太空火箭床：侧板是躺倒的火箭（脚头是箭头、床头是尾翼），舷窗真开孔，床头立一片尾翼和两个喷口 */
function rocketBed(p: string[]) {
  const [body, fab, acc] = p
  const g = new THREE.Group()
  const side: [number, number][] = [
    [-100, 0],
    [-86, 0],
    [-78, 8],
    [40, 8],
    [70, 10],
    [88, 18],
    [100, 30],
    [88, 42],
    [70, 50],
    [40, 52],
    [-70, 52],
    [-82, 62],
    [-100, 80],
  ]
  for (const sx of [-1, 1]) {
    g.add(profile(side, 4, body, 'zy', sx * 46, [
      [-20, 32, 8],
      [22, 32, 8],
    ]))
    for (const z of [-20, 22]) g.add(torus(8.4, 1.2, acc, { x: sx * 48.2, y: 32, z, ry: Math.PI / 2 }))
    // 侧面的箭头色带
    g.add(rbox(0.8, 4, 24, acc, { x: sx * 48.4, y: 16, z: 70, rx: 0.32 }, 0.3))
    // 小星星贴花
    for (const [z, y] of [
      [-56, 40],
      [0, 16],
      [50, 40],
    ]) {
      const st = ball(1.6, STAR, { x: sx * 48.4, y, z }, [0.3, 1, 1])
      st.userData.noOutline = true
      g.add(st)
    }
    g.add(rbox(6, 8, 10, shade(body, -0.15), { x: sx * 43, y: 0, z: 30 }, 1))
  }
  // 箭头鼻锥 + 前挡板
  g.add(rbox(88.4, 30, 4, body, { y: 12, z: 84 }, 1.2))
  g.add(cyl(0, 15, 14, acc, { y: 19, z: 93, rx: Math.PI / 2 }, 24))
  // 床头：挡板 + 中间尾翼 + 喷口
  g.add(rbox(88.4, 60, 4, body, { y: 8, z: -88 }, 1.2))
  g.add(profile([
    [-100, 58],
    [-84, 58],
    [-100, 96],
  ], 4, acc, 'zy', 0))
  for (const sx of [-1, 1]) {
    g.add(cylZ(6, 8, shade(body, -0.25), sx * 20, 30, -95, 20))
    const f = cylZ(4, 0.8, C.orange, sx * 20, 30, -99.2, 16)
    f.material = toon(C.orange, { emissive: 0.6 })
    g.add(f)
  }
  g.add(rbox(88, 4, 170, shade(body, -0.15), { y: 10, z: -4 }, 1))
  g.add(rbox(86, 12, 154, MAT, { y: 14, z: -9 }, 4))
  g.add(pillow(44, 26, MAT, 0, 25.6, -70))
  duvetZ(g, 86.6, 90, 25.8, 20, fab)
  return g
}

/** 抽屉储物床：箱体床座（+x 一侧三只大抽屉）+ 书架式床头（两层格子） */
function storageBed(p: string[]) {
  const [main, sub, acc] = p
  const g = new THREE.Group()
  g.add(rbox(90, 2, 190, shade(main, -0.2), { y: 0 }, 0.6))
  g.add(rbox(96, 29, 196, main, { y: 2 }, 1.6))
  for (const z of [-58, 2, 62]) {
    g.add(rbox(1.6, 22, 56, sub, { x: 47.6, y: 5, z }, 0.8))
    g.add(rbox(0.8, 2.5, 16, acc, { x: 48.6, y: 21, z }, 0.3))
  }
  // -x 一侧的装饰面板（和 +x 抽屉面对称）
  g.add(rbox(1.6, 24, 188, sub, { x: -48.2, y: 4 }, 0.8))
  // 书架床头
  g.add(rbox(96, 92, 2, main, { z: -97 }, 0.8))
  for (const sx of [-1, 1]) g.add(rbox(3, 61, 22, main, { x: sx * 46.5, y: 31, z: -87 }, 1))
  g.add(rbox(96, 3, 22, main, { y: 89, z: -87 }, 1))
  g.add(rbox(90.4, 2.5, 20, main, { y: 62, z: -86 }, 0.6))
  for (const x of [-15, 15]) g.add(rbox(2.5, 58.4, 20, main, { x, y: 31, z: -86 }, 0.6))
  // 左下格放几本书
  const cols = [acc, sub, C.sky, C.lemon, C.pink]
  for (let i = 0; i < 5; i++) g.add(rbox(3.4, 18 + (i % 3) * 2.5, 15, cols[i], { x: -42 + i * 3.8, y: 31, z: -86 }, 0.6))
  g.add(rbox(90, 16, 168, MAT, { y: 31, z: 10 }, 5))
  g.add(pillow(44, 26, MAT, 0, 46.6, -60))
  duvetZ(g, 90.6, 100, 46.8, 40, sub)
  return g
}

/** 星空顶篷床：四柱床 + 深色顶篷（底面缀满发光星星），四角束起的帐幔，顶篷下挂星星和月亮，长边挂一串小灯 */
function starryBed(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  const lit = (m: THREE.Mesh, k = 0.8) => {
    m.material = toon(STAR, { emissive: k })
    m.userData.noOutline = true
    return m
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 47.5
      const z = sz * 97.5
      g.add(cyl(2.5, 2.5, 170, frame, { x, z }, 14))
      g.add(ball(2.5, frame, { x, y: 173.5, z }))
      // 束起的帐幔
      g.add(cyl(4, 7, 116, fab, { x: sx * 41.5, y: 52, z: sz * 91.5 }, 16))
      g.add(torus(4.8, 0.9, acc, { x: sx * 41.5, y: 120, z: sz * 91.5, rx: Math.PI / 2 }))
      g.add(cyl(4.6, 4, 2, fab, { x: sx * 41.5, y: 168 - 2, z: sz * 91.5 }, 16))
    }
  for (const sx of [-1, 1]) g.add(rbox(4, 4, 195, frame, { x: sx * 47.5, y: 166 }, 1.2))
  for (const sz of [-1, 1]) g.add(rbox(95, 4, 4, frame, { y: 166, z: sz * 97.5 }, 1.2))
  g.add(rbox(98, 1.6, 198, fab, { y: 170 }, 0.6))
  // 顶篷底面的星星
  const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1
  for (let i = 0; i < 26; i++) {
    const x = -40 + rnd(i) * 80
    const z = -90 + rnd(i + 50) * 180
    g.add(lit(ball(1.2 + rnd(i + 99) * 0.8, STAR, { x, y: 169.6, z }, [1, 0.35, 1])))
  }
  // 垂挂的星星和月亮
  for (const [x, z, L] of [
    [-20, -40, 24],
    [18, -10, 30],
    [-8, 30, 20],
    [22, 60, 26],
  ]) {
    g.add(cyl(0.15, 0.15, L, C.ink, { x, y: 170 - L, z }, 4))
    g.add(lit(rbox(4.4, 4.4, 1.2, STAR, { x, y: 170 - L - 4.4, z, rz: Math.PI / 4 }, 0.5), 0.6))
    g.add(lit(rbox(4.4, 4.4, 1.2, STAR, { x, y: 170 - L - 4.4, z }, 0.5), 0.6))
  }
  g.add(cyl(0.15, 0.15, 18, C.ink, { y: 152, z: 10 }, 4))
  g.add(lit(torus(5, 1.8, STAR, { y: 146, z: 10, rz: 0.5 }, Math.PI * 1.25), 0.7))
  // 长边一串小灯
  for (const sx of [-1, 1])
    for (let i = 0; i <= 12; i++) {
      const z = -90 + i * 15
      const t = (z / 90) ** 2
      g.add(lit(ball(1.3, STAR, { x: sx * 46, y: 152 + t * 12, z }), 0.9))
    }
  // 灯串的电线：串起各个小灯，两头挂到床柱上（以前小灯一颗颗悬空）
  for (const sx of [-1, 1]) {
    const pts: V3[] = [[sx * 47.5, 166, -95.5]]
    for (let i = 0; i <= 12; i++) {
      const z = -90 + i * 15
      pts.push([sx * 46, 152 + (z / 90) ** 2 * 12, z])
    }
    pts.push([sx * 47.5, 166, 95.5])
    for (let i = 0; i + 1 < pts.length; i++) {
      const w = rod3(pts[i], pts[i + 1], 0.18, C.ink, 4)
      w.userData.noOutline = true
      g.add(w)
    }
  }
  // 床头板（大圆角）、床尾板、侧板
  g.add(holePanel(90, 62, 4, frame, [], { y: 12, z: -97.5 }, 20))
  g.add(holePanel(90, 36, 4, frame, [], { y: 12, z: 97.5 }, 12))
  for (const sx of [-1, 1]) g.add(rbox(3, 16, 191, frame, { x: sx * 47.5, y: 14 }, 1))
  g.add(rbox(91, 3, 191, shade(frame, -0.08), { y: 16 }, 0.8))
  g.add(rbox(89, 16, 189, MAT, { y: 19 }, 5))
  g.add(pillow(44, 28, MAT, 0, 34.6, -76))
  duvetZ(g, 89.6, 110, 34.8, 34, fab)
  return g
}

/** 可延长成长床：床头段 + 套在里面的伸缩床尾段（侧轨上有刻度），床垫加一段延长垫 */
function extendBed(p: string[]) {
  const [frame, fab, acc] = p
  const g = new THREE.Group()
  // 床头段
  for (const sx of [-1, 1]) {
    g.add(rbox(6, 72, 6, frame, { x: sx * 44, z: -85 }, 1.5))
    g.add(rbox(4, 12, 100, frame, { x: sx * 45, y: 14, z: -38 }, 1.2))
    g.add(rbox(6, 26, 6, frame, { x: sx * 44, z: 4 }, 1.5))
  }
  g.add(holePanel(82, 40, 3, frame, [{ kind: 'rect', x: 0, y: 16, w: 30, h: 8, r: 4 }], { y: 28, z: -85 }, 10))
  // 床尾段：侧轨在床头段侧轨内侧滑动
  for (const sx of [-1, 1]) {
    g.add(rbox(3, 10, 100, shade(frame, 0.06), { x: sx * 42.5, y: 15, z: 38 }, 1))
    g.add(rbox(5, 50, 5, frame, { x: sx * 42.5, z: 85.5 }, 1.4))
    for (let i = 0; i < 6; i++) g.add(rbox(0.6, i % 2 ? 2 : 4, 0.8, acc, { x: sx * 44.2, y: 19, z: 14 + i * 5 }, 0.2))
  }
  g.add(holePanel(80, 26, 3, frame, [], { y: 20, z: 85.5 }, 8))
  g.add(rbox(84, 2, 170, shade(frame, -0.08), { y: 22 }, 0.8))
  // 床垫 + 延长垫
  g.add(rbox(84, 12, 128, MAT, { y: 24, z: -20 }, 4))
  g.add(rbox(84, 12, 36, shade(MAT, -0.04), { y: 24, z: 62.5 }, 4))
  g.add(pillow(42, 26, MAT, 0, 35.6, -66))
  duvetZ(g, 84.6, 80, 35.8, 14, fab)
  g.add(bear(acc, 22, 36, -40, 0.9, -0.4))
  return g
}

// =====================================================================
// 素材表
// =====================================================================

const CRIB = { name: '婴儿床', family: 'kid-crib', category: 'kids' as const }
const BED = { name: '儿童床', family: 'kid-bed', category: 'kids' as const }

export const KIDS_BEDS: AssetDef[] = [
  // ---- 婴儿床 ----
  A({ ...CRIB, id: 'kb2-crib-wood', sizeLabel: '木栏床铃', w: 132, d: 72, h: 118, build: cribWood }, [
    ['nordic', N.oak, N.linen, N.sage],
    ['japanese', J.wood, J.washi, J.ai],
    ['retro', R.caramel, R.cream, R.mustard],
    ['cute', C.woodL, C.pink, C.mint],
    ['industrial', I.walnut, I.concrete, I.rust],
  ]),
  A({ ...CRIB, id: 'kb2-crib-nordic', sizeLabel: '北欧圆角', w: 124, d: 66, h: 90, build: cribNordic }, [
    ['nordic', N.white, N.sage, N.mustard],
    ['nordic', N.white, N.blue, N.oakL],
    ['nordic', N.gray, N.linen, N.oak],
    ['cute', C.white, C.sakura, C.lilac],
    ['modern', M.white, M.light, M.char],
  ]),
  A({ ...CRIB, id: 'kb2-crib-drawer', sizeLabel: '升降抽屉', w: 130, d: 70, h: 100, build: cribDrawer }, [
    ['modern', M.white, M.light, M.char],
    ['modern', M.char, M.white, M.silver],
    ['nordic', N.oak, N.white, N.blue],
    ['cute', C.white, C.sky, C.lemon],
  ]),
  A({ ...CRIB, id: 'kb2-crib-cradle', sizeLabel: '摇篮', w: 92, d: 64, h: 82, build: cradle }, [
    ['nordic', N.oakL, N.linen, N.sage],
    ['japanese', J.hinoki, J.washi, J.shu],
    ['retro', R.caramel, R.cream, R.teal],
    ['cute', C.white, C.pink, C.lemon],
  ]),
  A({ ...CRIB, id: 'kb2-crib-oval', sizeLabel: '椭圆', w: 124, d: 76, h: 88, build: cribOval }, [
    ['nordic', N.white, N.linen, N.oak],
    ['modern', M.white, M.light, M.silver],
    ['cute', C.white, C.mint, C.pink],
    ['nordic', N.oak, N.sage, N.mustard],
  ]),
  A({ ...CRIB, id: 'kb2-crib-travel', sizeLabel: '折叠旅行', w: 104, d: 76, h: 78, build: cribTravel }, [
    ['modern', M.char, M.light, M.gray],
    ['modern', M.gray, M.white, M.black],
    ['cute', C.sky, C.white, C.lemon],
    ['nordic', N.blue, N.white, N.mustard],
    ['industrial', I.iron, I.concrete, I.rust],
  ]),
  A({ ...CRIB, id: 'kb2-crib-wa', sizeLabel: '和风矮床', w: 127, d: 75, h: 46, build: cribWa }, [
    ['japanese', J.hinoki, J.tatami, J.ai],
    ['japanese', J.wood, J.tatami, J.shu],
    ['japanese', J.dark, '#d8d39a', J.sumi],
    ['nordic', N.oakL, N.sage, N.linen],
  ]),
  A({ ...CRIB, id: 'kb2-crib-canopy', sizeLabel: '蚊帐顶篷', w: 128, d: 70, h: 168, build: cribCanopy }, [
    ['cute', C.white, C.sakura, C.pink],
    ['nordic', N.white, N.linen, N.sage],
    ['retro', R.caramel, R.cream, R.orange],
    ['modern', M.light, M.white, M.char],
  ]),

  // ---- 儿童床 ----
  A({ ...BED, id: 'kb2-bed-car', sizeLabel: '汽车床', w: 109, d: 206, h: 69, build: carBed }, [
    ['cute', C.red, C.sky, C.lemon],
    ['cute', C.sky, C.lemon, C.pink],
    ['retro', R.red, R.cream, R.mustard],
    ['retro', R.teal, R.cream, R.orange],
    ['modern', M.white, M.light, M.black],
  ]),
  A({ ...BED, id: 'kb2-bed-castle', sizeLabel: '公主城堡', w: 104, d: 200, h: 175, build: castleBed }, [
    ['cute', C.white, C.sakura, C.pink],
    ['cute', C.sakura, C.white, C.lilac],
    ['nordic', N.white, N.linen, N.blue],
    ['retro', R.cream, R.mustard, R.red],
    ['modern', M.light, M.white, M.char],
  ]),
  A({ ...BED, id: 'kb2-bed-house', sizeLabel: '烟囱小屋', w: 97, d: 200, h: 175, build: houseBed2 }, [
    ['nordic', N.oak, N.linen, N.sage],
    ['nordic', N.white, N.blue, N.mustard],
    ['japanese', J.hinoki, J.washi, J.shu],
    ['cute', C.woodL, C.pink, C.mint],
    ['modern', M.char, M.light, M.white],
  ]),
  A({
    ...BED,
    id: 'kb2-bed-bunk',
    sizeLabel: '上下铺',
    w: 104,
    d: 200,
    h: 160,
    // 上下两层床面上没被枕头、被子盖住的那段
    surfaces: [
      { y: 34, shape: [rectPoly(-40, -60, 40, -12)], h: 66 },
      { y: 118, shape: [rectPoly(-40, -60, 40, -12)], h: 40 },
    ],
    build: bunkBed,
  }, [
    ['nordic', N.oak, N.blue, N.mustard],
    ['nordic', N.white, N.sage, N.oak],
    ['industrial', I.iron, I.concrete, I.rust],
    ['modern', M.white, M.char, M.gray],
    ['cute', C.white, C.pink, C.sky],
  ]),
  A({
    ...BED,
    id: 'kb2-bed-loft',
    sizeLabel: '高架书桌',
    w: 104,
    d: 200,
    h: 180,
    surfaces: [
      { y: 73, shape: [rectPoly(-45, -79, 3, 39)], h: 51 },
      { y: 142, shape: [rectPoly(-40, -60, 40, -12)], h: 40 },
    ],
    build: loftBed,
  }, [
    ['modern', M.white, M.light, M.walnut],
    ['industrial', I.iron, I.leather, I.walnut],
    ['nordic', N.white, N.sage, N.oak],
    ['cute', C.white, C.sky, C.woodL],
  ]),
  A({ ...BED, id: 'kb2-bed-floor', sizeLabel: '蒙氏地床', w: 98, d: 198, h: 40, build: montessoriBed }, [
    ['nordic', N.oakL, N.linen, N.sage],
    ['japanese', J.hinoki, J.washi, J.ai],
    ['modern', M.white, M.light, M.char],
    ['cute', C.woodL, C.lemon, C.pink],
  ]),
  A({ ...BED, id: 'kb2-bed-rocket', sizeLabel: '火箭床', w: 99, d: 200, h: 96, build: rocketBed }, [
    ['cute', C.white, C.sky, C.red],
    ['retro', R.cream, R.teal, R.orange],
    ['modern', M.light, M.char, C.red],
    ['industrial', I.steel, I.concrete, I.rust],
  ]),
  A({
    ...BED,
    id: 'kb2-bed-storage',
    sizeLabel: '抽屉储物',
    w: 98,
    d: 196,
    h: 92,
    surfaces: [
      { y: 92, shape: [rectPoly(-47, -97, 47, -77)] },
      { y: 64.5, shape: [rectPoly(-44, -95, 44, -77)], h: 24.5 },
    ],
    build: storageBed,
  }, [
    ['nordic', N.white, N.oak, N.gray],
    ['modern', M.white, M.char, M.gray],
    ['modern', M.walnut, M.light, M.black],
    ['cute', C.white, C.mint, C.pink],
    ['japanese', J.wood, J.washi, J.sumi],
  ]),
  A({ ...BED, id: 'kb2-bed-starry', sizeLabel: '星空顶篷', w: 100, d: 200, h: 176, build: starryBed }, [
    ['nordic', N.white, '#3d4f7a', N.mustard],
    ['modern', M.char, '#2a3550', M.silver],
    ['cute', C.white, C.lilac, C.lemon],
    ['retro', R.caramel, '#2f4a6b', R.mustard],
    ['japanese', J.hinoki, J.ai, J.washi],
  ]),
  A({ ...BED, id: 'kb2-bed-extend', sizeLabel: '可延长', w: 94, d: 176, h: 72, build: extendBed }, [
    ['nordic', N.oak, N.linen, N.sage],
    ['nordic', N.white, N.blue, N.oak],
    ['modern', M.light, M.white, M.char],
    ['japanese', J.hinoki, J.washi, J.shu],
  ]),
]
