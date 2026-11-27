// 益智玩具素材包：魔方系列（二 / 三 / 四 / 五阶的复原与打乱、金字塔、五魔方、镜面魔方、底座展示、收藏展示架、速拧计时器），
// 以及孔明锁 / 鲁班锁、九连环、华容道、七巧板、汉诺塔、指尖陀螺、解压捏捏、俄罗斯方块积木。
// 约定见 kit.ts 开头。全部 id 以 pz- 开头；魔方系列和 props-desk.ts 的 prop-rubiks-cube 同属 family 'puzzle-cube'。

import * as THREE from 'three'
import { ball, cached, cyl, rbox, shade, toon, torus } from '../toon'
import { C, S, rng, type AssetDef } from '../kit'
import { G, P, PI, fitGroup, mesh } from '../geo'
import { CN, M, N, PROP, R, definer, type PalFlat } from '../packkit'

/** 本包默认是桌面摆件（prop: true） */
const def = definer(PROP)

/** 魔方配色：[芯, 6 种贴纸色] */
const CUBE_PALS: PalFlat[] = [
  ['modern', M.black, '#d94b45', '#f08a3c', '#f2d14b', '#4fae6a', '#3f7fd0', M.white],
  ['cute', C.white, C.pink, C.peach, C.lemon, C.mint, C.sky, C.lilac],
  ['retro', R.cream, R.red, R.orange, R.mustard, R.olive, R.teal, '#ffffff'],
]

/** 贴纸厚度：一半埋在芯里 */
const STICKER_T = 0.25

/**
 * 魔方贴纸：圆角方片，中心在 (x, y, z)，贴在法线沿 axis 的面上。
 * 用不倒角的挤出片（约 44 个三角面）而不是圆角盒（108 个）：一个五阶魔方 125 张贴纸、收藏架上 400 多张，
 * 贴纸只有 1～2cm，侧棱的倒角根本看不出来。
 */
function sticker(st: number, color: string, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', lite = false) {
  const q = Math.round(st * 100) / 100
  const geo = cached(`pz-sticker${lite ? '-lite' : ''}${q}`, () => {
    // 简化版：直角方片（12 个三角面），给展示架上缩小了的那一排魔方用
    if (lite) return new THREE.BoxGeometry(q, q, STICKER_T)
    const h = q / 2
    const r = q * 0.15
    const sh = new THREE.Shape()
    sh.moveTo(-h + r, -h)
    sh.lineTo(h - r, -h)
    sh.absarc(h - r, -h + r, r, -PI / 2, 0, false)
    sh.lineTo(h, h - r)
    sh.absarc(h - r, h - r, r, 0, PI / 2, false)
    sh.lineTo(-h + r, h)
    sh.absarc(-h + r, h - r, r, PI / 2, PI, false)
    sh.lineTo(-h, -h + r)
    sh.absarc(-h + r, -h + r, r, PI, PI * 1.5, false)
    return new THREE.ExtrudeGeometry(sh, { depth: STICKER_T, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -STICKER_T / 2)
  })
  return P(mesh(geo, color), x, y, z, axis === 'y' ? -PI / 2 : 0, axis === 'x' ? PI / 2 : 0)
}

/**
 * n 阶魔方（边长 s）：一块芯 + 五个可见面的贴纸（底面不贴）。
 * scrambled：贴纸颜色打乱；否则每面一色。tilt：顶层拧了一个角度（正在拧）。lite：贴纸用直角方片（见 sticker）。
 */
function cube(n: number, s: number, scrambled: boolean, tilt = 0, lite = false) {
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
        const yy = topRow ? cell / 2 : b
        tgt.add(sticker(st, color(1), a, yy, h + 0.05, 'z', lite))
        tgt.add(sticker(st, color(2), a, yy, -h - 0.05, 'z', lite))
        tgt.add(sticker(st, color(3), h + 0.05, yy, a, 'x', lite))
        tgt.add(sticker(st, color(4), -h - 0.05, yy, a, 'x', lite))
        const topY = tilt ? cell : s
        top.add(sticker(st, color(0), a, topY + 0.025, -h + cell * (j + 0.5), 'y', lite))
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

type V = THREE.Vector3

/** 凸多面体：每个面一圈顶点，按 center 判断朝外的绕向（非索引几何，面与面之间是硬棱） */
function solid(faces: V[][], center: V, color: string) {
  const arr: number[] = []
  for (const raw of faces) {
    const n = raw[1].clone().sub(raw[0]).cross(raw[2].clone().sub(raw[0]))
    const f = n.dot(raw[0].clone().sub(center)) < 0 ? [...raw].reverse() : raw
    for (let i = 1; i < f.length - 1; i++) for (const p of [f[0], f[i], f[i + 1]]) arr.push(p.x, p.y, p.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
  geo.computeVertexNormals()
  return mesh(geo, color)
}

/**
 * 多面体魔方的贴纸：每张是某个面上的一个凸多边形，四周往里收 gap 露出芯色的缝，再沿面的法线垫高 lift。
 * 同色的贴纸合成一个网格（只有顶面和一圈侧壁，贴着芯的底面不做）。out 是这个面朝外的方向，用来统一顶点绕向。
 */
function polyStickers(list: { pts: V[]; out: V; color: string }[], gap: number, lift = 0.1) {
  const byColor = new Map<string, number[]>()
  for (const { pts: raw, out, color } of list) {
    const n = raw[1].clone().sub(raw[0]).cross(raw[2].clone().sub(raw[0])).normalize()
    const flip = n.dot(out) < 0
    const pts = flip ? [...raw].reverse() : raw
    if (flip) n.negate()
    const k = pts.length
    // 每个顶点沿两条邻边的内法线往里收（斜接），各边都正好收进 gap
    const inset = pts.map((p, i) => {
      const n0 = n.clone().cross(p.clone().sub(pts[(i + k - 1) % k]).normalize())
      const n1 = n.clone().cross(pts[(i + 1) % k].clone().sub(p).normalize())
      const miter = gap / (1 + n0.dot(n1))
      return p.clone().addScaledVector(n0.add(n1), miter)
    })
    const top = inset.map((p) => p.clone().addScaledVector(n, lift))
    const base = inset.map((p) => p.clone().addScaledVector(n, -0.05))
    const arr = byColor.get(color) ?? []
    byColor.set(color, arr)
    const tri = (...ps: V[]) => {
      for (const p of ps) arr.push(p.x, p.y, p.z)
    }
    for (let i = 1; i < k - 1; i++) tri(top[0], top[i], top[i + 1])
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k
      tri(base[i], base[j], top[j])
      tri(base[i], top[j], top[i])
    }
  }
  const g = new THREE.Group()
  for (const [color, arr] of byColor) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    geo.computeVertexNormals()
    g.add(mesh(geo, color))
  }
  return g
}

/**
 * 金字塔魔方：一面朝下放着，一个面正对前方。芯色的正四面体，看得见的三个面各贴 9 张三角贴纸
 * （以前只是一个四面各一色的光滑四面体，看不出是魔方）。
 */
function pyraminx([core, ...cols]: string[]) {
  const a = 8.2
  const rb = a / Math.sqrt(3)
  const base = [0, 1, 2].map((i) => {
    const th = -PI / 2 + (i * 2 * PI) / 3
    return new THREE.Vector3(Math.cos(th) * rb, 0, Math.sin(th) * rb)
  })
  const apex = new THREE.Vector3(0, a * Math.sqrt(2 / 3), 0)
  const center = new THREE.Vector3(0, apex.y / 4, 0)
  const sides = [0, 1, 2].map((i) => [base[i], base[(i + 1) % 3], apex])
  const g = G(solid([...sides, base], center, core))
  const list: { pts: V[]; out: V; color: string }[] = []
  sides.forEach(([A, B, C], f) => {
    const out = A.clone().add(B).add(C).divideScalar(3).sub(center)
    // 隔一个取色（红 / 黄 / 蓝）：相邻两面挨着的红和橙太像，分不出是两个面
    const color = cols[(f * 2) % cols.length]
    const pt =(i: number, j: number) => A.clone().addScaledVector(B.clone().sub(A), i / 3).addScaledVector(C.clone().sub(A), j / 3)
    for (let i = 0; i < 3; i++)
      for (let j = 0; i + j < 3; j++) {
        list.push({ pts: [pt(i, j), pt(i + 1, j), pt(i, j + 1)], out, color })
        if (i + j < 2) list.push({ pts: [pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)], out, color })
      }
  })
  g.add(polyStickers(list, 0.16))
  return fitGroup(g)
}

/**
 * 五魔方（正十二面体，十二面各一色）：一个面朝下平放（以前靠一条棱立着），
 * 每面按真实的切法分成中心五边形 + 五块棱 + 五块角，露出芯色的缝（以前是十二个光面，看不出是魔方）。
 */
function megaminx([core, ...cols]: string[]) {
  const all = [...cols, ...cols.map((x) => shade(x, 0.15))]
  const geo = new THREE.DodecahedronGeometry(4.2)
  const pos = (geo.index ? geo.toNonIndexed() : geo).attributes.position
  const g = G(mesh(geo, core))
  const list: { pts: V[]; out: V; color: string }[] = []
  // 中心五边形占面宽的比例；角块的边长比例由它定（两条切线交在中心五边形的顶点上）
  const s = 0.45
  const f = (1 - s) / (2 - 2 * Math.cos((2 * PI) / 5))
  let down: V | null = null
  for (let face = 0; face < 12; face++) {
    // 每个面 3 个三角形 9 个顶点，去重剩 5 个，绕面心按角度排好
    const uniq: V[] = []
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, face * 9 + i)
      if (!uniq.some((u) => u.distanceTo(p) < 1e-3)) uniq.push(p)
    }
    const c = uniq.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(uniq.length)
    const n = c.clone().normalize()
    if (!down) {
      // 第一个面朝下贴地，看不见，不贴
      down = n
      continue
    }
    const ux = uniq[0].clone().sub(c).normalize()
    const uy = n.clone().cross(ux)
    const ang = (p: V) => Math.atan2(p.clone().sub(c).dot(uy), p.clone().sub(c).dot(ux))
    const v = [...uniq].sort((p, q) => ang(p) - ang(q))
    const color = all[face % all.length]
    const inner = v.map((p) => c.clone().lerp(p, s))
    list.push({ pts: inner, out: n, color })
    for (let k = 0; k < 5; k++) {
      const p = v[k]
      const nx = v[(k + 1) % 5]
      const pv = v[(k + 4) % 5]
      list.push({ pts: [p, p.clone().lerp(nx, f), inner[k], p.clone().lerp(pv, f)], out: n, color })
      list.push({ pts: [p.clone().lerp(nx, f), nx.clone().lerp(p, f), inner[(k + 1) % 5], inner[k]], out: n, color })
    }
  }
  g.add(polyStickers(list, 0.09))
  if (down) g.quaternion.setFromUnitVectors(down, new THREE.Vector3(0, -1, 0))
  return fitGroup(g)
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
  // 架上九个魔方有 400 多张贴纸，每张才 1cm 上下：用直角方片，整件从 4.6 万面降到 1 万以内
  const kinds = [cube(2, 4.6, false, 0, true), cube(3, 5.4, true, 0, true), cube(4, 5.8, false, 0, true), cube(3, 5.4, false, 0, true), cube(5, 6, true, 0, true), pyraminx, megaminx, cube(4, 5.8, true, 0, true), cube(2, 4.6, true, 0, true)]
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
  // 每格左右留 0.15 的缝，上下互相压进 0.1：积木是一块压一块摞起来的（以前上下也留缝，上面三排各自悬着）
  const cellAt = (x: number, y: number, col: string) => g.add(rbox(u - 0.15, u + 0.1, u - 0.15, col, { x: x * u, y: y * u - 0.05, z: 0 }, 0.25))
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
  def('pz-cube-2', '魔方', 'tabletop', [7, 7, 5], CUBE_PALS, cube(2, 5, false), { sizeLabel: '二阶 · 复原' }),
  def('pz-cube-2-scr', '魔方', 'tabletop', [7, 7, 5], CUBE_PALS, cube(2, 5, true), { sizeLabel: '二阶 · 打乱' }),
  def('pz-cube-3', '魔方', 'tabletop', [8, 8, 6], CUBE_PALS, cube(3, 5.7, false), { sizeLabel: '三阶 · 复原' }),
  def('pz-cube-3-turn', '魔方', 'tabletop', [8, 8, 6], CUBE_PALS, cube(3, 5.7, true, 0.4), { sizeLabel: '三阶 · 拧到一半' }),
  def('pz-cube-4', '魔方', 'tabletop', [9, 9, 6.5], CUBE_PALS, cube(4, 6.2, false), { sizeLabel: '四阶 · 复原' }),
  def('pz-cube-4-scr', '魔方', 'tabletop', [9, 9, 6.5], CUBE_PALS, cube(4, 6.2, true), { sizeLabel: '四阶 · 打乱' }),
  def('pz-cube-5', '魔方', 'tabletop', [10, 10, 7], CUBE_PALS, cube(5, 6.8, true), { sizeLabel: '五阶 · 打乱' }),
  def('pz-pyraminx', '魔方', 'tabletop', [9, 9, 7], CUBE_PALS, pyraminx, { sizeLabel: '金字塔' }),
  def('pz-megaminx', '魔方', 'tabletop', [8.5, 8.5, 7], CUBE_PALS, megaminx, { sizeLabel: '五魔方' }),
  def('pz-mirror', '魔方', 'tabletop', [9, 9, 8], [['modern', '#c9ced6'], ['retro', '#e3b549'], ['cute', '#e7c2d4']], mirrorCube, { sizeLabel: '镜面魔方' }),
  def('pz-cube-stand', '魔方', 'tabletop', [9, 11, 9.5], CUBE_PALS, cubeOnStand, { sizeLabel: '三阶 · 底座展示' }),
  def('pz-cube-shelf', '魔方收藏展示架', 'tabletop', [36, 18, 24], [
    ['modern', '#e9f2f7', M.black, '#d94b45', '#f08a3c', '#f2d14b', '#4fae6a', '#3f7fd0', M.white],
    ['cute', '#fff0f6', C.white, C.pink, C.peach, C.lemon, C.mint, C.sky, C.lilac],
  ], cubeShelf, { limit: { scope: 'house', max: 1 } }),
  def('pz-speed-timer', '速拧计时器', 'tabletop', [32, 22, 7], [
    ['modern', '#26262a', '#3f7fd0', '#ff5c5c'],
    ['cute', C.lilac, C.pink, '#7cf0b0'],
    ['industrial', '#3a3a3c', '#c46a3a', '#ffd166'],
  ], speedTimer, { limit: { scope: 'house', max: 1 } }),
  def('pz-luban', '孔明锁', 'tabletop', [10, 10, 9], WOOD, lubanLock, { sizeLabel: '组装好' }),
  def('pz-luban-apart', '孔明锁', 'tabletop', [15, 12, 2], WOOD, lubanApart, { sizeLabel: '拆开' }),
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
  def('pz-squishy-bun', '解压捏捏', 'tabletop', [7, 7, 5], [['cute', '#fff4e6', C.pink], ['retro', '#f4e7c8', R.orange]], squishy('bun'), { sizeLabel: '包子', limit: { scope: 'room', max: 1, group: 'pz-squishy' } }),
  def('pz-squishy-cat', '解压捏捏', 'tabletop', [7, 7, 6.5], [['cute', C.lemon, '#5a4646'], ['modern', '#d7d8db', '#26262a'], ['nordic', N.linen, '#5a5f66']], squishy('cat'), { sizeLabel: '猫团子', limit: { scope: 'room', max: 1, group: 'pz-squishy' } }),
  def('pz-tetris', '俄罗斯方块积木', 'tabletop', [9, 3, 9], [
    ['cute', C.sky, C.pink, C.lemon, C.mint],
    ['modern', '#3f7fd0', '#d94b45', '#f2d14b', '#4fae6a'],
    ['retro', R.teal, R.red, R.mustard, R.olive],
  ], tetris),
]
