// 款式包 C：浴室洗面桶的多种造型 + 更好看的拖把 / 清洁用品收纳。
//   - 洗面桶各款与原款 wet-bath-pail 同 family，sizeLabel 写款式名，尺寸贴近原款（24 × 24 × 11），一键布置可以直接换款。
//   - 拖把收纳筒与 out-mop-bucket 同 family（mop-storage）；帆布清洁篮、壁挂清洁工具挂架各自独立。
// 约定见 kit.ts 开头；id 前缀 vc-。容器一律空心（cup / tray / 车削壳），里面的东西低于口沿。

import * as THREE from 'three'
import { ball, cup, cyl, rbox, shade, torus, tray } from '../toon'
import { C, G, type AssetCategory, type AssetDef } from '../kit'
import { PI, clearDeep, fitChildren, lathe, mesh, noOutlineDeep, rod3 } from '../geo'
import { I, J, M, N, R, type Build, type Pal3 } from '../packkit'

const COPPER = '#c7814a'
const BRASS = '#e9c46a'
const PAD = '#eef1f4'

// ---------- 小工具 ----------

/** 环带：贴着锥形桶壁的一圈箍（rAt(y) 为桶壁外半径），内侧嵌进壁里 */
function band(rAt: (y: number) => number, y0: number, y1: number, color: string, out = 0.32) {
  const a = rAt(y0)
  const b = rAt(y1)
  return lathe(
    [
      [a - 0.3, y0],
      [a + out, y0],
      [b + out, y1],
      [b - 0.3, y1],
      [a - 0.3, y0],
    ],
    color,
  )
}
/** 圆角矩形轮廓（xy 平面） */
function rrPath(p: THREE.Path, w: number, d: number, r: number) {
  const x = w / 2
  const z = d / 2
  p.moveTo(-x + r, -z)
  p.lineTo(x - r, -z)
  p.absarc(x - r, -z + r, r, -PI / 2, 0, false)
  p.lineTo(x, z - r)
  p.absarc(x - r, z - r, r, 0, PI / 2, false)
  p.lineTo(-x + r, z)
  p.absarc(-x + r, z - r, r, PI / 2, PI, false)
  p.lineTo(-x, -z + r)
  p.absarc(-x + r, -z + r, r, PI, PI * 1.5, false)
  return p
}
/** 圆角方块（俯视圆角矩形）沿 y 挤出；t > 0 时挖空成壁厚 t 的方环。底面在 y0 */
function rrBlock(w: number, d: number, r: number, h: number, color: string, y0 = 0, t = 0) {
  const s = rrPath(new THREE.Shape(), w, d, r) as THREE.Shape
  if (t > 0) s.holes.push(rrPath(new THREE.Path(), w - t * 2, d - t * 2, Math.max(0.3, r - t)))
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 })
  geo.rotateX(-PI / 2)
  const m = mesh(geo, color)
  m.position.y = y0
  return m
}
/** 竖直的多边形板（xy 平面轮廓，沿 z 挤出 depth，z 居中） */
function xyPrism(pts: [number, number][], depth: number, color: string, at: { x?: number; y?: number; z?: number } = {}) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  geo.translate(0, 0, -depth / 2)
  const m = mesh(geo, color)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return m
}

// ======================================================================
// 洗面桶（family wet-bath-pail）
// ======================================================================

/** 桧木风呂桶：竖木条拼成的锥形桶身，两道铜箍 */
function pailHinoki(p: string[]) {
  const [wood, hoop] = p
  const H = 11.5
  const rB = 10.6
  const rT = 12
  const rAt = (y: number) => rB + ((rT - rB) * y) / H
  const g = G(cup(rT, rB, H, 1.1, wood))
  // 木条拼缝：沿桶壁倾斜的细线
  const taper = Math.atan((rT - rB) / H)
  const seam = shade(wood, -0.16)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2
    const holder = new THREE.Group()
    const line = rbox(0.28, 10, 0.4, seam, { y: -5 }, 0.1)
    line.rotation.x = taper
    holder.add(line)
    holder.rotation.y = a
    const r = rAt(5.8) + 0.06
    holder.position.set(Math.sin(a) * r, 5.8, Math.cos(a) * r)
    g.add(noOutlineDeep(holder))
  }
  g.add(band(rAt, 1.8, 3.4, hoop, 0.36))
  g.add(band(rAt, 8, 9.6, hoop, 0.36))
  return g
}

/** 经典黄色圆桶：直筒、粗卷边口沿、底部一圈小圈足、一道色带（不带任何字样） */
function pailClassic(p: string[]) {
  const [body, stripe, foot] = p
  const y0 = 0.8
  const H = 10.4
  const rB = 10.2
  const rT = 11.6
  const rAt = (y: number) => rB + ((rT - rB) * (y - y0)) / H
  const g = G(cup(rT, rB, H, 0.8, body, { y: y0 }))
  g.add(torus(rT - 0.25, 0.72, shade(body, 0.04), { y: y0 + H - 0.7, rx: PI / 2 }))
  g.add(
    lathe(
      [
        [8.4, 0],
        [9.5, 0],
        [9.4, y0 + 0.15],
        [8.5, y0 + 0.15],
        [8.4, 0],
      ],
      foot,
    ),
  )
  g.add(band(rAt, y0 + 6.6, y0 + 7.6, stripe, 0.25))
  return g
}

/** 透明亚克力：直身透明桶 + 有色圈足和口沿 */
function pailAcrylic(p: string[]) {
  const [tint, frame] = p
  const y0 = 0.6
  const H = 10
  const g = new THREE.Group()
  g.add(clearDeep(cup(12, 11.4, H, 1.2, tint, { y: y0 }), tint, 0.42))
  g.add(
    lathe(
      [
        [8.6, 0],
        [10.8, 0],
        [11.1, 0.3],
        [11.1, y0 + 0.3],
        [8.6, y0 + 0.3],
        [8.6, 0],
      ],
      frame,
    ),
  )
  g.add(torus(11.4, 0.62, frame, { y: y0 + H - 0.62, rx: PI / 2 }))
  return g
}

/** 哑光方形现代款：圆角方桶，口沿一圈压边，两侧小提手，底下一块内收的底座 */
function pailSquare(p: string[]) {
  const [body, plinth, rim] = p
  const g = new THREE.Group()
  g.add(rrBlock(20, 20, 3.6, 0.6, plinth, 0))
  g.add(rrBlock(22, 22, 4.5, 1, body, 0.5))
  g.add(rrBlock(22, 22, 4.5, 9.6, body, 0.9, 1))
  g.add(rrBlock(22.6, 22.6, 4.8, 0.8, rim, 10.2, 1.6))
  for (const s of [-1, 1]) g.add(rbox(1.2, 1.1, 8, rim, { x: s * 11.35, y: 8.2 }, 0.45))
  return g
}

/** 片手桶（手桶 / 湯桶）：木桶身 + 一根横穿出来的直柄 */
function pailDipper(p: string[]) {
  const [wood, hoop, handle] = p
  const H = 11
  const rB = 9.8
  const rT = 10.9
  const rAt = (y: number) => rB + ((rT - rB) * y) / H
  const g = G(cup(rT, rB, H, 1, wood))
  g.add(band(rAt, 1.6, 3, hoop, 0.32))
  g.add(band(rAt, 7.6, 9, hoop, 0.32))
  // 柄：从桶壁里穿出，斜向上翘；根部一块垫木
  g.add(rod3([rAt(7) - 0.6, 7, 0], [rAt(7) + 3.2, 12.2, 0], 1, handle))
  g.add(ball(1.2, handle, { x: rAt(7) + 3.2, y: 12.2 }))
  g.add(rbox(1.2, 3.6, 3.2, shade(handle, -0.08), { x: rAt(6.4) + 0.2, y: 6.4 }, 0.4))
  return fitChildren(g)
}

/** 北欧粉彩圆角款：圆润底角的车削桶身，粗圆口沿，两侧小耳朵，一道细色带 */
function pailPastel(p: string[]) {
  const [body, ear, stripe] = p
  const H = 10
  const t = 1.4
  const rc = 3
  const rb = 7.6
  const rw = rb + rc
  const rTop = 11
  const pts: [number, number][] = [[0, 0]]
  for (let i = 0; i <= 6; i++) {
    const a = -PI / 2 + (i / 6) * (PI / 2)
    pts.push([rb + Math.cos(a) * rc, rc + Math.sin(a) * rc])
  }
  pts.push([rTop, H - t / 2])
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * PI
    pts.push([rTop - t / 2 + (Math.cos(a) * t) / 2, H - t / 2 + (Math.sin(a) * t) / 2])
  }
  pts.push([rTop - t, H - t / 2])
  pts.push([rw - t, rc])
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (PI / 2)
    pts.push([rb + Math.cos(a) * (rc - t), rc - Math.sin(a) * (rc - t)])
  }
  pts.push([0, t])
  const g = G(lathe(pts, body, 40))
  const rAt = (y: number) => rw + ((rTop - rw) * (y - rc)) / (H - t / 2 - rc)
  g.add(band(rAt, 5.2, 6, stripe, 0.22))
  for (const s of [-1, 1]) g.add(rbox(2.6, 1, 6, ear, { x: s * 11.3, y: H - 1.5 }, 0.45))
  return g
}

// ======================================================================
// 拖把 / 清洁用品收纳
// ======================================================================

/** 带盖拖把收纳筒：细长筒 + 中间开孔的盖子，拖把杆从孔里伸出来 */
function mopTube(p: string[]) {
  const [main, lid, grip] = p
  const g = new THREE.Group()
  const H = 52
  g.add(
    lathe(
      [
        [6.4, 0],
        [8, 0],
        [8, 0.9],
        [6.4, 0.9],
        [6.4, 0],
      ],
      lid,
    ),
  )
  g.add(cup(9, 8.4, H, 1, main, { y: 0.6 }))
  const rAt = (y: number) => 8.4 + (0.6 * (y - 0.6)) / H
  for (const y of [8, 42]) g.add(band(rAt, y, y + 1.2, lid, 0.22))
  // 盖子：环形，中间留孔给拖把杆；后面一块铰链，前面一个小扣手
  const y1 = H + 0.6 - 0.8
  g.add(
    lathe(
      [
        [2.2, y1],
        [9.5, y1],
        [9.5, y1 + 1.6],
        [8.2, y1 + 2.6],
        [3.2, y1 + 2.6],
        [2.2, y1 + 1.8],
        [2.2, y1],
      ],
      lid,
    ),
  )
  g.add(rbox(4, 2.2, 1.6, shade(lid, -0.1), { y: y1 + 0.2, z: -9.6 }, 0.5))
  g.add(rbox(3, 1.2, 1.4, shade(lid, -0.1), { y: y1 + 0.6, z: 9.7 }, 0.45))
  // 拖把杆：立在筒底，伸出盖孔
  g.add(cyl(1.2, 1.2, 100, C.steel, { y: 1.6 }, 12))
  g.add(cyl(1.5, 1.5, 16, grip, { y: 101.6 }, 14))
  g.add(cyl(1.7, 1.7, 1.2, shade(grip, -0.12), { y: 117.6 }, 14))
  g.add(torus(1.3, 0.35, shade(grip, -0.12), { y: 120.1 }))
  return fitChildren(g)
}

/** 帆布清洁用品收纳篮：中间隔开，左格放喷壶和清洁剂瓶，右格放叠好的抹布和海绵；两条提带 */
function cleanCaddy(p: string[]) {
  const [canvas, trim, acc] = p
  const W = 34
  const D = 22
  const H = 22
  const g = new THREE.Group()
  g.add(tray(W, H, D, 1, canvas, {}, 0.45))
  // 口沿包边
  for (const s of [-1, 1]) {
    g.add(rbox(W + 0.6, 1.6, 1.6, trim, { y: H - 1.6, z: s * (D / 2 - 0.5) }, 0.5))
    g.add(rbox(1.6, 1.6, D - 1.4, trim, { x: s * (W / 2 - 0.5), y: H - 1.6 }, 0.5))
  }
  // 提带：两条拱形带子，根部钉一块皮扣
  for (const s of [-1, 1]) {
    g.add(torus(7, 0.55, trim, { y: H - 2.4, z: s * (D / 2 + 0.25) }, PI))
    for (const x of [-7, 7]) g.add(rbox(2.6, 3.6, 0.5, shade(trim, -0.12), { x, y: H - 5.4, z: s * (D / 2 + 0.25) }, 0.2))
  }
  g.add(rbox(1, H - 4, D - 2, shade(canvas, -0.06), { x: 4, y: 1 }, 0.4))
  // 喷壶
  const sx = -9.5
  const sz = -4
  g.add(cyl(3.2, 3.4, 12, C.white, { x: sx, y: 1, z: sz }, 18))
  g.add(cyl(1.4, 3.2, 2.4, C.white, { x: sx, y: 13, z: sz }, 18))
  g.add(cyl(1.5, 1.5, 1.6, acc, { x: sx, y: 15.2, z: sz }, 14))
  g.add(rbox(3, 2.6, 3.6, acc, { x: sx + 0.8, y: 16.6, z: sz }, 0.8))
  g.add(rbox(3.4, 1.2, 1.8, acc, { x: sx + 3.2, y: 17.8, z: sz }, 0.4))
  g.add(rbox(0.9, 3.4, 1.4, shade(acc, -0.15), { x: sx + 2.2, y: 13.8, z: sz }, 0.3))
  // 清洁剂瓶
  g.add(rbox(6, 13, 4, shade(acc, 0.25), { x: -10, y: 1, z: 5 }, 1.4))
  g.add(cyl(1.2, 1.2, 2.4, acc, { x: -10, y: 14, z: 5 }, 12))
  // 叠好的抹布
  const cloths = [C.sky, C.lemon, C.pink, PAD]
  cloths.forEach((c, i) => g.add(rbox(10, 1.8, 14, c, { x: 10.4, y: 1 + i * 1.85, z: 1 }, 0.7)))
  // 海绵
  g.add(rbox(8, 1.8, 5, '#ffd86b', { x: 10.4, y: 8.4, z: -1 }, 0.5))
  g.add(rbox(8, 1, 5, '#6fbf73', { x: 10.4, y: 10.2, z: -1 }, 0.4))
  return g
}

/** 壁挂式清洁工具挂架：一条木挂板 + 三个夹扣，挂着扫把、平板拖把、长柄簸箕 */
const RACK_MOUNT = 12
function wallToolRack(p: string[]) {
  const [board, tool, bristle] = p
  const g = new THREE.Group()
  const zb = -6
  const zp = -2.6
  // 挂板（y 106–116）
  g.add(rbox(80, 10, 1.6, board, { y: 106, z: zb }, 0.5))
  for (const x of [-34, 34]) g.add(cyl(0.7, 0.7, 0.4, shade(board, -0.25), { x, y: 110.4, z: zb + 0.8 + 0.2, rx: PI / 2 }, 10))
  // 夹扣
  for (const x of [-26, 0, 26]) {
    g.add(rbox(4.4, 3, 2.2, shade(tool, -0.15), { x, y: 108, z: zb + 1.8 }, 0.6))
    g.add(rbox(4.4, 3, 0.8, shade(tool, -0.15), { x, y: 108, z: zp + 1.3 }, 0.3))
    for (const s of [-1, 1]) g.add(rbox(0.8, 3, 2.6, shade(tool, -0.15), { x: x + s * 1.8, y: 108, z: zp - 0.4 }, 0.3))
  }
  // 扫把（x -26）：刷毛底在 y 12
  const bx = -26
  g.add(xyPrism([[-11, 0], [11, 0], [9, 11], [-9, 11]], 3.4, bristle, { x: bx, y: 12, z: zp }))
  g.add(noOutlineDeep(rbox(19, 0.5, 3.8, shade(bristle, -0.18), { x: bx, y: 16, z: zp }, 0.2)))
  g.add(rbox(19, 3, 4.2, shade(tool, -0.08), { x: bx, y: 22.5, z: zp }, 1))
  g.add(cyl(1.2, 2, 4, shade(tool, -0.08), { x: bx, y: 25, z: zp }, 14))
  g.add(cyl(1.1, 1.1, 92, tool, { x: bx, y: 28.5, z: zp }, 12))
  g.add(torus(1, 0.3, shade(tool, -0.15), { x: bx, y: 121.6, z: zp }))
  // 平板拖把（x 0）：拖布板在下
  g.add(rbox(28, 1.8, 9, PAD, { y: 14, z: zp + 1.2 }, 0.6))
  g.add(rbox(27, 1.4, 8, shade(tool, -0.08), { y: 15.6, z: zp + 1.2 }, 0.5))
  g.add(rbox(3, 3.4, 3, shade(tool, -0.15), { y: 16.8, z: zp }, 0.8))
  g.add(cyl(1.1, 1.1, 100, tool, { y: 20, z: zp }, 12))
  g.add(cyl(1.5, 1.5, 14, shade(tool, -0.12), { y: 104, z: zp }, 14))
  // 长柄簸箕（x 26）：斗口朝前
  const dx = 26
  const dy = 18
  const dz = zp + 6
  g.add(rbox(22, 0.8, 14, tool, { x: dx, y: dy, z: dz }, 0.3))
  g.add(rbox(22, 8, 0.9, tool, { x: dx, y: dy, z: dz - 6.6 }, 0.35))
  // 侧板：转 90° 后局部 +x 指向 -z，所以高的一边放在 x = +7（后面）
  for (const s of [-1, 1]) g.add(xyPrism([[-6.4, 0], [7, 0], [7, 8], [1, 8]], 0.8, tool, { x: dx + s * 10.6, y: dy, z: dz }).rotateY(PI / 2))
  g.add(rbox(22.2, 0.5, 1.4, bristle, { x: dx, y: dy - 0.2, z: dz + 6.6 }, 0.2))
  g.add(cyl(1.1, 1.1, 88, tool, { x: dx, y: dy + 7.6, z: zp }, 12))
  g.add(rbox(2.6, 2, 3.4, shade(tool, -0.15), { x: dx, y: dy + 6.4, z: zp + 0.8 }, 0.6))
  return fitChildren(g, RACK_MOUNT)
}

// ======================================================================
// 定义
// ======================================================================

function vc(id: string, name: string, sizeLabel: string | undefined, category: AssetCategory, [w, d, h]: [number, number, number], pals: Pal3[], build: Build, extra: Partial<AssetDef> = {}): AssetDef {
  return {
    id,
    name,
    ...(sizeLabel !== undefined ? { sizeLabel } : {}),
    category,
    w,
    d,
    h,
    palettes: pals.map((x) => [x[1], x[2], x[3]]),
    paletteStyles: pals.map((x) => x[0]),
    styles: [...new Set(pals.map((x) => x[0]))],
    build,
    ...extra,
  }
}

export const VARIANTS_C: AssetDef[] = [
  // —— 洗面桶 ——
  vc('vc-pail-hinoki', '洗面桶', '桧木风呂桶', 'toiletry', [24.3, 24.3, 11.5], [
    ['japanese', J.hinoki, COPPER, ''],
    ['japanese', '#d9b27c', J.sumi, ''],
    ['nordic', N.oakL, M.silver, ''],
    ['retro', R.caramel, BRASS, ''],
    ['modern', M.walnut, M.black, ''],
  ], pailHinoki, { prop: true }),
  vc('vc-pail-classic', '洗面桶', '经典圆桶', 'toiletry', [24.1, 24.1, 11.2], [
    ['retro', '#f6c431', R.red, '#e3ab1c'],
    ['retro', R.teal, R.cream, shade(R.teal, -0.15)],
    ['cute', C.sky, C.white, shade(C.sky, -0.15)],
    ['cute', '#ff9fb6', C.white, shade('#ff9fb6', -0.15)],
    ['modern', M.white, M.char, M.gray],
  ], pailClassic, { prop: true }),
  vc('vc-pail-acrylic', '洗面桶', '透明亚克力', 'toiletry', [24, 24, 10.6], [
    ['modern', '#dff2fb', M.silver, ''],
    ['cute', '#ffd9e4', C.pink, ''],
    ['cute', '#d6f3e6', C.mint, ''],
    ['modern', '#cfd3d8', M.char, ''],
    ['retro', '#f5ddb0', R.caramel, ''],
  ], pailAcrylic, { prop: true }),
  vc('vc-pail-square', '洗面桶', '哑光方形', 'toiletry', [23.9, 22.6, 11], [
    ['modern', '#d9d6d0', M.char, M.char],
    ['modern', M.char, M.black, M.silver],
    ['modern', M.white, M.gray, M.light],
    ['nordic', N.sage, N.white, N.oak],
    ['nordic', '#d8cbbb', N.oak, N.white],
  ], pailSquare, { prop: true }),
  vc('vc-pail-dipper', '洗面桶', '片手桶', 'toiletry', [25.9, 22, 13.4], [
    ['japanese', J.hinoki, COPPER, J.hinoki],
    ['japanese', J.shu, J.sumi, J.sumi],
    ['japanese', J.sumi, J.shu, J.shu],
    ['nordic', N.white, N.oak, N.oak],
    ['cute', C.sakura, C.white, C.woodL],
  ], pailDipper, { prop: true }),
  vc('vc-pail-pastel', '洗面桶', '粉彩圆角', 'toiletry', [25.2, 22, 10], [
    ['cute', C.sakura, C.white, C.pink],
    ['cute', C.mint, C.white, C.lemon],
    ['cute', '#dccbf5', C.white, C.lilac],
    ['nordic', N.sage, N.white, N.oak],
    ['nordic', N.linen, N.blue, N.mustard],
  ], pailPastel, { prop: true }),

  // —— 拖把 / 清洁用品收纳 ——
  vc('vc-mop-tube', '拖把收纳筒', '带盖收纳筒', 'storage', [19, 20.8, 121.8], [
    ['modern', M.white, M.char, M.char],
    ['modern', M.char, M.black, M.silver],
    ['nordic', N.sage, N.white, N.oak],
    ['nordic', '#e9e4da', N.oak, N.oak],
    ['cute', C.sky, C.white, C.pink],
  ], mopTube),
  vc('vc-clean-caddy', '帆布清洁收纳篮', undefined, 'storage', [34.6, 23.6, 27.2], [
    ['nordic', '#e6dccb', '#a07a55', N.blue],
    ['nordic', N.gray, N.white, N.mustard],
    ['modern', M.char, M.black, M.silver],
    ['cute', C.sakura, C.white, C.mint],
    ['industrial', '#8f8a5e', I.leather, I.rust],
  ], cleanCaddy),
  vc('vc-clean-wall-rack', '壁挂清洁工具挂架', undefined, 'storage', [80, 17.5, 110.9], [
    ['nordic', N.oak, N.white, '#d8c08a'],
    ['japanese', J.hinoki, J.sumi, '#c9a86a'],
    ['modern', M.char, M.white, M.gray],
    ['cute', C.woodL, C.mint, C.lemon],
    ['industrial', I.iron, I.walnut, '#b89a6a'],
  ], wallToolRack, { mount: RACK_MOUNT }),
]
