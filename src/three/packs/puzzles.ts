// 益智玩具素材包：魔方系列（二 / 三 / 四 / 五阶的复原与打乱、金字塔、五魔方、镜面魔方、底座展示、收藏展示架、速拧计时器），
// 以及孔明锁 / 鲁班锁、九连环、华容道、七巧板、汉诺塔、指尖陀螺、解压捏捏、俄罗斯方块积木。
// 约定见 kit.ts 开头。全部 id 以 pz- 开头；魔方系列和 props-desk.ts 的 prop-rubiks-cube 同属 family 'puzzle-cube'。

import * as THREE from 'three'
import { ball, cyl, rbox, shade, toon, torus } from '../toon'
import { C, S, rng, type AssetCategory, type AssetDef } from '../kit'
import { G, P, PI, fitGroup } from '../geo'
import { CN, M, N, R, type PalFlat } from '../packkit'

function def(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: PalFlat[], build: (p: string[]) => THREE.Group, extra: Partial<AssetDef> = {}): AssetDef {
  return { id, name, category, w, d, h, palettes: pals.map((x) => x.slice(1)), paletteStyles: pals.map((x) => x[0]), styles: [...new Set(pals.map((x) => x[0]))], build, prop: true, ...extra }
}

/** 魔方配色：[芯, 6 种贴纸色] */
const CUBE_PALS: PalFlat[] = [
  ['modern', M.black, '#d94b45', '#f08a3c', '#f2d14b', '#4fae6a', '#3f7fd0', M.white],
  ['cute', C.white, C.pink, C.peach, C.lemon, C.mint, C.sky, C.lilac],
  ['retro', R.cream, R.red, R.orange, R.mustard, R.olive, R.teal, '#ffffff'],
]

/**
 * n 阶魔方（边长 s）：一块芯 + 五个可见面的贴纸（底面不贴）。
 * scrambled：贴纸颜色打乱；否则每面一色。tilt：顶层拧了一个角度（正在拧）。
 */
function cube(n: number, s: number, scrambled: boolean, tilt = 0) {
  return ([core, ...cols]: string[]) => {
    const r = rng(n * 31 + (scrambled ? 7 : 1))
    const g = new THREE.Group()
    const cell = s / n
    const st = cell * 0.82
    const color = (face: number) => (scrambled ? cols[Math.floor(r() * cols.length)] : cols[face % cols.length])
    const body = new THREE.Group()
    const top = new THREE.Group()
    body.add(rbox(s, tilt ? s - cell : s, s, core, {}, 0.3))
    if (tilt) top.add(rbox(s, cell, s, core, { y: 0 }, 0.3))
    const h = s / 2
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = -h + cell * (i + 0.5)
        const b = cell * (j + 0.5)
        const topRow = j === n - 1 && !!tilt
        const tgt = topRow ? top : body
        const yy = topRow ? cell / 2 - st / 2 : b - st / 2
        tgt.add(rbox(st, st, 0.25, color(1), { x: a, y: yy, z: h + 0.05 }, st * 0.15))
        tgt.add(rbox(st, st, 0.25, color(2), { x: a, y: yy, z: -h - 0.05 }, st * 0.15))
        tgt.add(rbox(0.25, st, st, color(3), { x: h + 0.05, y: yy, z: a }, st * 0.15))
        tgt.add(rbox(0.25, st, st, color(4), { x: -h - 0.05, y: yy, z: a }, st * 0.15))
        const topY = tilt ? cell : s
        top.add(rbox(st, 0.25, st, color(0), { x: a, y: topY - 0.1 - (tilt ? 0 : 0), z: -h + cell * (j + 0.5) }, st * 0.15))
      }
    if (tilt) {
      top.position.y = s - cell
      top.rotation.y = tilt
    }
    g.add(body, top)
    g.rotation.y = 0.35
    return fitGroup(g)
  }
}

/** 正多面体按面上色（非索引几何：每个面占连续 k 个三角形）：用于金字塔魔方、五魔方 */
function polyColored(geo: THREE.BufferGeometry, trisPerFace: number, cols: string[]) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  const c = new THREE.Color()
  for (let v = 0; v < n; v++) {
    c.set(cols[Math.floor(v / (3 * trisPerFace)) % cols.length])
    arr.set([c.r, c.g, c.b], v * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.computeVertexNormals()
  const base = toon('#ffffff') as THREE.MeshToonMaterial
  const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: base.gradientMap }))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
/** 金字塔魔方：一面朝下放着 */
function pyraminx([core, ...cols]: string[]) {
  const geo = new THREE.TetrahedronGeometry(5)
  const m = polyColored(geo, 1, cols.slice(0, 4))
  // 把第一个面转成朝下
  const p = geo.attributes.position
  const a = new THREE.Vector3().fromBufferAttribute(p, 0)
  const b = new THREE.Vector3().fromBufferAttribute(p, 1)
  const c = new THREE.Vector3().fromBufferAttribute(p, 2)
  const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
  m.quaternion.setFromUnitVectors(nrm, new THREE.Vector3(0, -1, 0))
  const g = G(m)
  // 芯色的细棱：三个底角各一颗小球（角块）
  g.add(ball(0.6, core, { x: 0, y: 0, z: 0 }))
  return fitGroup(g)
}
/** 五魔方（正十二面体，十二面各一色） */
function megaminx([, ...cols]: string[]) {
  const all = [...cols, ...cols.map((x) => shade(x, 0.15))]
  const m = polyColored(new THREE.DodecahedronGeometry(4.2), 3, all)
  return fitGroup(G(m))
}
/** 镜面魔方：大小不一的银色块（打乱后形状参差） */
function mirrorCube([metal]: string[]) {
  const r = rng(17)
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) {
        const w = 1.4 + r() * 1.2
        const h = 1.4 + r() * 1.2
        const d = 1.4 + r() * 1.2
        const m = rbox(w, h, d, metal, { x: (i - 1) * 2.1 + (r() - 0.5) * 0.4, y: j * 2.1, z: (k - 1) * 2.1 + (r() - 0.5) * 0.4 }, 0.15)
        m.material = toon(metal, { emissive: 0.15 })
        g.add(m)
      }
  g.rotation.y = 0.5
  return fitGroup(g)
}
/** 三阶魔方放在亚克力底座上展示 */
function cubeOnStand(p: string[]) {
  const g = new THREE.Group()
  const stand = G(cyl(4, 4.4, 1, '#eef4f8', {}, 24), cyl(1.6, 2.2, 1.6, '#eef4f8', { y: 1 }, 16))
  stand.traverse((m) => {
    const mesh = m as THREE.Mesh
    if (mesh.isMesh) {
      mesh.material = toon('#eef4f8', { transparent: 0.45 })
      mesh.userData.noOutline = true
    }
  })
  g.add(stand)
  const c = cube(3, 5.6, false)(p)
  c.position.y = 2.6
  c.rotation.set(0.62, 0.78, 0)
  g.add(c)
  return fitGroup(g)
}
/** 魔方收藏展示架：三层阶梯亚克力架，摆满各种魔方：[架子色, 魔方芯, 贴纸…] */
function cubeShelf([frame, core, ...cols]: string[]) {
  const g = new THREE.Group()
  const p = [core, ...cols]
  for (let t = 0; t < 3; t++) {
    const step = rbox(34, 1, 8, frame, { y: t * 8, z: -t * 4 + 4 }, 0.3)
    step.material = toon(frame, { transparent: 0.35 })
    step.userData.noOutline = true
    g.add(step)
    if (t) g.add(rbox(34, t * 8, 0.8, shade(frame, -0.05), { z: -t * 4 + 8 }, 0.2))
  }
  const kinds = [cube(2, 4.6, false), cube(3, 5.4, true), cube(4, 5.8, false), cube(3, 5.4, false), cube(5, 6, true), pyraminx, megaminx, cube(4, 5.8, true), cube(2, 4.6, true)]
  kinds.forEach((k, i) => {
    const t = Math.floor(i / 3)
    const m = k(p)
    m.scale.setScalar(0.92)
    m.position.set((i % 3 - 1) * 10.5, t * 8 + 1, -t * 4 + 4)
    g.add(m)
  })
  return fitGroup(g)
}
/** 速拧计时器垫：[垫子, 计时器, 屏] */
function speedTimer([mat, body, screen]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(32, 0.4, 22, mat, {}, 0.2))
  const timer = G(rbox(18, 2.6, 8, body, {}, 1.2))
  for (const s of [-1, 1]) timer.add(cyl(2.6, 2.8, 0.6, shade(body, -0.2), { x: s * 6, y: 2.4 }, 20))
  const disp = rbox(5, 0.2, 1.8, screen, { y: 2.5 }, 0.1)
  disp.material = toon(screen, { emissive: 0.6 })
  disp.userData.noOutline = true
  timer.add(disp)
  g.add(P(timer, 0, 0.4, -5))
  const c = cube(3, 5.6, true)(CUBE_PALS[0].slice(1))
  c.position.set(7, 0.4, 5)
  g.add(c)
  return fitGroup(g)
}

// ---------- 其他益智玩具 ----------

/** 孔明锁 / 鲁班锁（组装好）：[木色] */
function lubanLock([wood]: string[]) {
  const g = new THREE.Group()
  const L = 8
  const t = 1.6
  for (const o of [-0.85, 0.85]) {
    g.add(rbox(L, t, t, o > 0 ? wood : shade(wood, -0.08), { x: 0, y: 4 - t / 2 + o, z: 0 }, 0.2))
    g.add(rbox(t, t, L, o > 0 ? shade(wood, 0.06) : wood, { x: o, y: 4 - t / 2, z: 0 }, 0.2))
    g.add(rbox(t, L, t, shade(wood, -0.05), { x: 0, y: 0, z: o }, 0.2))
  }
  return fitGroup(g)
}
/** 孔明锁（拆开散放）：[木色] */
function lubanApart([wood]: string[]) {
  const g = new THREE.Group()
  const r = rng(5)
  for (let i = 0; i < 6; i++) {
    const m = rbox(8, 1.6, 1.6, i % 2 ? wood : shade(wood, -0.08), {}, 0.2)
    g.add(P(G(m), (i % 3 - 1) * 4.5, 0, (Math.floor(i / 3) - 0.5) * 5, 0, r() * PI, 0))
  }
  return fitGroup(g)
}
/** 九连环：[环色, 柄色] */
function nineRings([ring, handle]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(18, 0.8, 1.6, handle, {}, 0.3))
  for (let i = 0; i < 9; i++) {
    const x = -7.2 + i * 1.8
    g.add(cyl(0.12, 0.12, 2.6, ring, { x, y: 0.8 }, 6))
    g.add(P(torus(1.3, 0.12, ring, {}), x, 4.2, 0, 0, PI / 2))
  }
  g.add(P(rbox(17, 0.4, 0.5, ring, {}, 0.1), 0, 4.2, 1.3))
  return fitGroup(g)
}
/** 华容道：木框 + 滑块（曹操大块）：[框, 块, 大块] */
function huarong([frame, block, big]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(13, 1, 16, frame, {}, 0.4))
  for (const s of [-1, 1]) {
    g.add(rbox(13, 1, 1, frame, { y: 1, z: s * 7.5 }, 0.3))
    g.add(rbox(1, 1, 14, frame, { x: s * 6, y: 1 }, 0.3))
  }
  const u = 2.7
  const pieces: [number, number, number, number, string][] = [
    [1, 0, 2, 2, big],
    [0, 0, 1, 2, block],
    [3, 0, 1, 2, block],
    [0, 2, 1, 2, block],
    [3, 2, 1, 2, block],
    [1, 2, 2, 1, shade(block, 0.1)],
    [1, 3, 1, 1, shade(block, -0.1)],
    [2, 3, 1, 1, shade(block, -0.1)],
    [0, 4, 1, 1, shade(block, -0.1)],
    [3, 4, 1, 1, shade(block, -0.1)],
  ]
  for (const [i, j, w, h, c] of pieces) g.add(rbox(w * u - 0.25, 1.1, h * u - 0.25, c, { x: -5.4 + (i + w / 2) * u, y: 1, z: -6.75 + (j + h / 2) * u }, 0.25))
  return fitGroup(g)
}
/** 七巧板（木托 + 七块）：[托, 色 1, 色 2] */
function tangram([tray, a, b]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(14, 0.8, 14, tray, {}, 0.4))
  const tri = (pts: [number, number][], col: string, y: number) => {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false })
    geo.rotateX(-PI / 2)
    const m = new THREE.Mesh(geo, toon(col))
    m.castShadow = true
    m.position.y = y
    return m
  }
  const s = 6
  const cols = [a, b, shade(a, 0.15), shade(b, 0.15), shade(a, -0.15), shade(b, -0.15), '#f2d14b']
  const parts: [number, number][][] = [
    [[-s, -s], [s, -s], [0, 0]],
    [[-s, -s], [0, 0], [-s, s]],
    [[s, -s], [s, 0], [s / 2, -s / 2]],
    [[0, 0], [s / 2, -s / 2], [s, 0], [s / 2, s / 2]],
    [[-s, s], [0, 0], [s / 2, s / 2], [0, s]],
    [[0, s], [s / 2, s / 2], [s, s]],
    [[s / 2, s / 2], [s, 0], [s, s]],
  ]
  parts.forEach((p, i) => g.add(tri(p.map(([x, z]): [number, number] => [x * 0.96, z * 0.96]), cols[i], 0.85)))
  return fitGroup(g)
}
/** 汉诺塔：[底座, 盘色] */
function hanoi([base, disc]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(24, 1.4, 8, base, {}, 0.4))
  for (const x of [-7.5, 0, 7.5]) g.add(cyl(0.35, 0.35, 9, shade(base, -0.1), { x, y: 1.4 }, 8))
  for (let i = 0; i < 6; i++) g.add(cyl(3.4 - i * 0.45, 3.4 - i * 0.45, 0.9, shade(disc, (i - 3) * 0.06), { x: i < 4 ? -7.5 : 0, y: 1.4 + (i < 4 ? i : i - 4) * 0.95 }, 20))
  return fitGroup(g)
}
/** 指尖陀螺：[主体, 轴承盖] */
function spinner([body, cap]: string[]) {
  const g = new THREE.Group()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2
    g.add(cyl(1.5, 1.5, 0.9, body, { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6 }, 20))
    g.add(P(rbox(2.6, 0.9, 1.6, body, {}, 0.4), Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3, 0, -a))
  }
  g.add(cyl(1.4, 1.4, 1.2, cap, {}, 20))
  return fitGroup(g)
}
/** 解压捏捏：kind 包子 / 猫团子：[主色, 点缀] */
function squishy(kind: 'bun' | 'cat') {
  return ([body, accent]: string[]) => {
    const g = new THREE.Group()
    if (kind === 'bun') {
      g.add(ball(3, body, { y: 2.2 }, [1, 0.75, 1]))
      for (let k = 0; k < 6; k++) g.add(P(ball(0.7, shade(body, -0.06), {}, [1.6, 0.4, 0.6]), Math.cos(k) * 0.9, 4.3, Math.sin(k) * 0.9, 0, k))
    } else {
      g.add(ball(3, body, { y: 2.4 }, [1, 0.82, 0.95]))
      for (const s of [-1, 1]) g.add(P(cyl(0.01, 1, 1.6, body, {}, 4), s * 1.6, 4.4, 0, 0, PI / 4, s * 0.25))
      for (const s of [-1, 1]) g.add(ball(0.32, accent, { x: s * 1, y: 3.1, z: 2.55 }))
    }
    return fitGroup(g)
  }
}
/** 俄罗斯方块积木（几块堆叠） */
function tetris([a, b, c, d]: string[]) {
  const g = new THREE.Group()
  const u = 2
  const cellAt = (x: number, y: number, col: string) => g.add(rbox(u - 0.15, u - 0.15, u - 0.15, col, { x: x * u, y: y * u, z: 0 }, 0.25))
  for (const [x, y] of [[0, 0], [1, 0], [2, 0], [3, 0]]) cellAt(x, y, a)
  for (const [x, y] of [[0, 1], [1, 1], [1, 2], [2, 2]]) cellAt(x, y, b)
  for (const [x, y] of [[2, 1], [3, 1], [3, 2], [3, 3]]) cellAt(x, y, c)
  for (const [x, y] of [[0, 2], [0, 3], [1, 3], [2, 3]]) cellAt(x, y, d)
  return fitGroup(g)
}

const WOOD: PalFlat[] = [
  ['chinese', '#c9955a'],
  ['nordic', N.oak],
  ['japanese', '#e9d2a6'],
  ['retro', R.caramel],
]

export const PUZZLES: AssetDef[] = [
  def('pz-cube-2', '魔方', 'tabletop', [7, 7, 5], CUBE_PALS, cube(2, 5, false), { family: 'puzzle-cube', sizeLabel: '二阶 · 复原' }),
  def('pz-cube-2-scr', '魔方', 'tabletop', [7, 7, 5], CUBE_PALS, cube(2, 5, true), { family: 'puzzle-cube', sizeLabel: '二阶 · 打乱' }),
  def('pz-cube-3', '魔方', 'tabletop', [8, 8, 6], CUBE_PALS, cube(3, 5.7, false), { family: 'puzzle-cube', sizeLabel: '三阶 · 复原' }),
  def('pz-cube-3-turn', '魔方', 'tabletop', [8, 8, 6], CUBE_PALS, cube(3, 5.7, true, 0.4), { family: 'puzzle-cube', sizeLabel: '三阶 · 拧到一半' }),
  def('pz-cube-4', '魔方', 'tabletop', [9, 9, 6.5], CUBE_PALS, cube(4, 6.2, false), { family: 'puzzle-cube', sizeLabel: '四阶 · 复原' }),
  def('pz-cube-4-scr', '魔方', 'tabletop', [9, 9, 6.5], CUBE_PALS, cube(4, 6.2, true), { family: 'puzzle-cube', sizeLabel: '四阶 · 打乱' }),
  def('pz-cube-5', '魔方', 'tabletop', [10, 10, 7], CUBE_PALS, cube(5, 6.8, true), { family: 'puzzle-cube', sizeLabel: '五阶 · 打乱' }),
  def('pz-pyraminx', '魔方', 'tabletop', [9, 9, 7], CUBE_PALS, pyraminx, { family: 'puzzle-cube', sizeLabel: '金字塔' }),
  def('pz-megaminx', '魔方', 'tabletop', [10, 10, 10], CUBE_PALS, megaminx, { family: 'puzzle-cube', sizeLabel: '五魔方' }),
  def('pz-mirror', '魔方', 'tabletop', [9, 9, 8], [['modern', '#c9ced6'], ['retro', '#e3b549'], ['cute', '#e7c2d4']], mirrorCube, { family: 'puzzle-cube', sizeLabel: '镜面魔方' }),
  def('pz-cube-stand', '魔方', 'tabletop', [10, 10, 12], CUBE_PALS, cubeOnStand, { family: 'puzzle-cube', sizeLabel: '三阶 · 底座展示' }),
  def('pz-cube-shelf', '魔方收藏展示架', 'tabletop', [36, 18, 24], [
    ['modern', '#e9f2f7', M.black, '#d94b45', '#f08a3c', '#f2d14b', '#4fae6a', '#3f7fd0', M.white],
    ['cute', '#fff0f6', C.white, C.pink, C.peach, C.lemon, C.mint, C.sky, C.lilac],
  ], cubeShelf, { limit: { scope: 'house', max: 1 } }),
  def('pz-speed-timer', '速拧计时器', 'tabletop', [32, 22, 7], [
    ['modern', '#26262a', '#3f7fd0', '#ff5c5c'],
    ['cute', C.lilac, C.pink, '#7cf0b0'],
    ['industrial', '#3a3a3c', '#c46a3a', '#ffd166'],
  ], speedTimer, { limit: { scope: 'house', max: 1 } }),
  def('pz-luban', '孔明锁', 'tabletop', [10, 10, 9], WOOD, lubanLock, { family: 'pz-luban', sizeLabel: '组装好' }),
  def('pz-luban-apart', '孔明锁', 'tabletop', [15, 12, 2], WOOD, lubanApart, { family: 'pz-luban', sizeLabel: '拆开' }),
  def('pz-nine-rings', '九连环', 'tabletop', [19, 4, 7], [
    ['chinese', '#c9ced6', CN.lacquer],
    ['retro', '#e3b549', R.caramel],
    ['modern', '#c9ced6', M.char],
  ], nineRings),
  def('pz-huarong', '华容道', 'tabletop', [14, 17, 2.4], [
    ['chinese', CN.rosewood, '#e9c98f', CN.lacquer],
    ['nordic', N.oak, N.white, N.blue],
    ['cute', C.woodL, C.mint, C.pink],
  ], huarong),
  def('pz-tangram', '七巧板', 'tabletop', [15, 15, 2], [
    ['cute', C.woodL, C.pink, C.sky],
    ['nordic', N.oak, N.sage, N.mustard],
    ['chinese', CN.walnut, CN.lacquer, CN.jade],
  ], tangram),
  def('pz-hanoi', '汉诺塔', 'tabletop', [25, 9, 11], [
    ['nordic', N.oak, N.blue],
    ['cute', C.woodL, C.pink],
    ['retro', R.caramel, R.orange],
  ], hanoi),
  def('pz-spinner', '指尖陀螺', 'tabletop', [9, 9, 1.5], [
    ['modern', '#3f7fd0', '#c9ced6'],
    ['cute', C.pink, C.white],
    ['industrial', S.industrial.rust, '#3a3a3c'],
  ], spinner, { limit: { scope: 'house', max: 2 } }),
  def('pz-squishy-bun', '解压捏捏', 'tabletop', [7, 7, 5], [['cute', '#fff4e6', C.pink], ['retro', '#f4e7c8', R.orange]], squishy('bun'), { family: 'pz-squishy', sizeLabel: '包子', limit: { scope: 'room', max: 1, group: 'pz-squishy' } }),
  def('pz-squishy-cat', '解压捏捏', 'tabletop', [7, 7, 6.5], [['cute', C.lemon, '#5a4646'], ['modern', '#d7d8db', '#26262a'], ['nordic', N.linen, '#5a5f66']], squishy('cat'), { family: 'pz-squishy', sizeLabel: '猫团子', limit: { scope: 'room', max: 1, group: 'pz-squishy' } }),
  def('pz-tetris', '俄罗斯方块积木', 'tabletop', [9, 3, 9], [
    ['cute', C.sky, C.pink, C.lemon, C.mint],
    ['modern', '#3f7fd0', '#d94b45', '#f2d14b', '#4fae6a'],
    ['retro', R.teal, R.red, R.mustard, R.olive],
  ], tetris),
]
