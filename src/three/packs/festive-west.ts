// 西式节日与家庭聚会：万圣节玄关组、骷髅门花环、感恩节餐桌中心、情人节组、香槟塔、生日派对桌面、气球拱门、圣诞倒数日历、胡桃夹子士兵、
// 姜饼屋、九枝烛台与陀螺、复活节兔子与彩蛋、派对饮料台、彩带礼炮、壁炉台圣诞袜。约定见 kit.ts 开头：原点在占地中心底面，正面朝 +z；
// 壁挂件最低点 = mount、背面贴 z = -d/2（fitWall）。
// 蜡烛的火苗 = 自发光的小水滴 + fx flame 粒子；带火苗的素材建模后按包围盒居中落地，火苗坐标跟着一起平移（见 withFlames）。
// 字和数字一律不写：倒数日历用色块和点数示意，生日蜡烛的「8」用两个圆环叠成。

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { measured } from '../measured'
import { ball, cached, cup, cyl, face, puck, rbox, shade, torus } from '../toon'
import { C, holePanel, rng, type AssetDef, type Fx } from '../kit'
import { G, P, PI, UP, box3, cylX, cylZ, fitGroup, fitOffset, fitWall, ghost, lathe, lit, mesh, noOutline, rod3, taperRod3, tube, type V2, type V3 } from '../geo'
import { CL, F, M, N, R, PROP, define, type Build, type Pal } from '../packkit'

const WICK = '#3a302a'
const FLAME = '#ffb347'
/** 南瓜灯里透出来的暖光 */
const GLOW = '#ffcf5a'
const BONE = '#f3ecdc'
/** 黑猫、靴子这类「黑色」：深紫灰，不用纯黑 */
const INK = '#2e2a36'
const GLASS = '#cfeeff'
const STRAW = '#dcc078'
const STRAW_D = '#b89a52'
const STEM = '#6f7a3c'
const PINE = '#2f6b45'
const PINE_L = '#3f8457'
const BERRY = '#c8283a'
const SNOW = '#fbfbf8'
const GOLD = '#e3b549'
const BRASS = '#d9b45a'
const WOOD = '#b88a5a'
const ROAST = '#c47a36'
const ROAST_D = '#a65e27'
const ROAST_L = '#dc9a4e'
const COOKIE = '#b8733a'
const COOKIE_D = '#8f5428'
const ICING = '#fffaf2'
const CHOC = '#5a3424'
const LEMONADE = '#f4dc6a'
const LEMON = '#f2cf2c'
const LEMON_IN = '#fbeea0'
const BOTTLE = '#2f4f3a'
const RUBBER = '#3a3a3e'
const PARSLEY = '#4f9e5b'
const CRANBERRY = '#a8202f'
/** 小南瓜、落叶的天然颜色 */
const PUMPKIN_O = '#e8822e'
const PUMPKIN_W = '#efe7d6'
const PUMPKIN_G = '#9aa27a'
const FALL_LEAVES = ['#d9622b', '#b8352b', '#e3a52a', '#c9772f']

// ---------- 公用小件 ----------

/** 竖直贴花：朝 +z 的薄片（不描边、不投影），(x, y) 是中心，rot 是面内转角 */
function decalZ(w: number, h: number, color: string, x: number, y: number, z: number, rot = 0) {
  return P(plateZ(w, h, color), x, y, z, 0, 0, rot)
}
function plateZ(w: number, h: number, color: string) {
  const geo = cached(`fw-pz${w},${h}`, () => new THREE.PlaneGeometry(w, h))
  const m = mesh(geo, color)
  m.castShadow = false
  m.userData.noOutline = true
  return m
}

/** 低面数小圆粒（浆果、糖粒、针叶束）：s 是三个方向的缩放；lo = true 用 6 × 4 段（直径 < 2cm 的成堆小粒） */
function pip(r: number, color: string, x: number, y: number, z: number, s: V3 = [1, 1, 1], lo = false) {
  const m = mesh(
    lo ? cached('fw-pip6', () => new THREE.SphereGeometry(1, 6, 4)) : cached('fw-pip', () => new THREE.SphereGeometry(1, 8, 6)),
    color,
  )
  m.position.set(x, y, z)
  m.scale.set(r * s[0], r * s[1], r * s[2])
  return m
}

/** 直角小方块（不到 2cm 的条、框、辐条用不着圆角）：at.y 是底面，和 rbox 一样 */
function box(w: number, h: number, d: number, color: string, at: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number } = {}) {
  const m = mesh(cached(`fw-box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), color)
  m.position.set(at.x ?? 0, (at.y ?? 0) + h / 2, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  return m
}

/** 细圆环（彩条、盘边、蛋上的条带、花心卷）：截面 4 段、一圈 24 段，比 torus 省面；at.y 是中心，arc 是扫过的角度 */
function band(r: number, tube: number, color: string, at: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number } = {}, arc = PI * 2, seg = 24) {
  const n = Math.max(6, Math.round((seg * arc) / (PI * 2)))
  const geo = cached(`fw-band${r},${tube},${arc.toFixed(3)},${n}`, () => new THREE.TorusGeometry(r, tube, 4, n, arc))
  const m = mesh(geo, color)
  m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  m.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0)
  return m
}

/** xy 平面里的轮廓沿 z 挤出（厚 t，z 居中）：剪影立牌、蝙蝠、心形、星星、落叶。bevel 往里收，轮廓不变大 */
function slabXY(shape: THREE.Shape | V2[], t: number, color: string, bevel = 0, key?: string, seg = 12) {
  const make = () => {
    const s = Array.isArray(shape) ? new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y))) : shape
    const b = Math.min(bevel, t * 0.3)
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: b > 0 ? 2 : 1, curveSegments: seg })
    geo.translate(0, 0, -t / 2 + b)
    return geo
  }
  return mesh(key ? cached(`fw-${key}|${t}|${bevel}|${seg}`, make) : make(), color)
}

/** 心形轮廓：宽 s、高约 0.9s，包围盒中心在原点，尖朝 -y */
function heartPts(s: number, n = 28): V2[] {
  const k = s / 32
  return Array.from({ length: n }, (_, i): V2 => {
    const t = (i / n) * PI * 2
    return [16 * Math.sin(t) ** 3 * k, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.6) * k]
  })
}

/** 五角星：外半径 ro、内半径 ri */
function starPts(ro: number, ri = ro * 0.45): V2[] {
  return Array.from({ length: 10 }, (_, i): V2 => {
    const a = PI / 2 + (i / 10) * PI * 2
    const r = i % 2 ? ri : ro
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

/** 枫叶：五个尖角的叶片 + 一小截叶柄（长约 2.2r） */
function maplePts(r: number): V2[] {
  const pts: V2[] = []
  for (let i = 0; i < 10; i++) {
    // 正下方那个内凹点换成叶柄
    if (i === 5) {
      pts.push([-r * 0.12, -r * 0.42], [-r * 0.08, -r * 1.05], [r * 0.08, -r * 1.05], [r * 0.12, -r * 0.42])
      continue
    }
    const a = PI / 2 + (i / 10) * PI * 2
    const rr = i % 2 ? r * 0.45 : r
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  return pts
}

/**
 * 带棱的南瓜：球面按经度压出 ribs 道棱沟，上下两极往里凹（梗窝）。半径 r，高度方向缩放 hs；
 * 最高 / 最低点在 ±GOURD_HALF × r × hs（凹窝外一圈），叠南瓜塔按它算。接缝转到背面。
 */
const GOURD_HALF = 0.833
function gourd(r: number, hs: number, color: string, ribs = 8, deep = 0.1, lo = false) {
  const geo = cached(`fw-gourd${ribs},${deep},${lo}`, () => {
    // lo：桌面上的小南瓜，每道棱只留棱顶和棱沟两列顶点（纬向段数不变，GOURD_HALF 照旧）
    const g = lo ? new THREE.SphereGeometry(1, ribs * 2, 12) : new THREE.SphereGeometry(1, ribs * 3, 12)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const f = 1 - deep * (1 - Math.abs(Math.cos((ribs * Math.atan2(z, x)) / 2)))
      pos.setXYZ(i, x * f, y * (0.72 + 0.28 * Math.sqrt(Math.hypot(x, z))), z * f)
    }
    g.computeVertexNormals()
    return g
  })
  const m = mesh(geo, color)
  m.scale.set(r, r * hs, r)
  m.rotation.y = -PI / 2
  return m
}

/** 南瓜梗：从 (x, y, z) 往上长 len、往 dir 方向歪一点的锥梗（根部埋进梗窝） */
function pumpkinStem(x: number, y: number, z: number, len: number, r: number, color: string, dir = 0.6) {
  return taperRod3([x, y - 0.8, z], [x + Math.cos(dir) * len * 0.3, y + len, z + Math.sin(dir) * len * 0.3], r, r * 0.65, color, 7)
}

/** 小南瓜（桌面点缀）：带梗，底面在 y */
function miniPumpkin(r: number, color: string, x: number, y: number, z: number, hs = 0.75) {
  const half = GOURD_HALF * r * hs
  return G(P(gourd(r, hs, color, 8, 0.1, true), x, y + half, z, 0, -PI / 2, 0), pumpkinStem(x, y + half * 2 - 0.2, z, r * 0.45, r * 0.16, STEM))
}

/** 蜡烛：蜡柱 + 烛芯 + 一滴发光的火苗，底面在 (x, y, z)。火苗粒子的位置是 [x, y + h + 0.9k, z] */
function candle(r: number, h: number, color: string, x: number, y: number, z: number, k = 1) {
  return G(
    cyl(r, r, h, color, { x, y, z }, r > 1.5 ? 20 : 10),
    cyl(0.12, 0.12, 0.8, WICK, { x, y: y + h - 0.1, z }, 5),
    lit(ball(0.45 * k, FLAME, { x, y: y + h + 0.95 * k, z }, [1, 1.8, 1], [8, 6]), FLAME, 1),
  )
}
const flameAt = (x: number, y: number, z: number, h: number, k = 1): V3 => [x, y + h + 0.9 * k, z]

/** 把对象挪到 (x, z)，再整体抬 / 降到最低点 = y（对象还没挂到别的父节点上时用；旋转保持不变） */
function restAt<T extends THREE.Object3D>(o: T, x: number, z: number, y = 0): T {
  o.position.set(x, 0, z)
  o.position.y = y - box3(o).min.y
  return o
}

/** 把对象的局部 axis 轴转到 dir */
function aim<T extends THREE.Object3D>(o: T, dir: THREE.Vector3, axis = UP): T {
  o.quaternion.setFromUnitVectors(axis, dir.clone().normalize())
  return o
}

/**
 * 建模后 x / z 居中、最低点落地；火苗粒子跟着平移。平移量要用第一组配色建一次模型才量得出来：
 * 离线量好查表（measured.generated.ts），不在载入素材包时现建模型
 */
function withFlames(key: string, build: Build, pals: Pal[], flames: V3[], scale = 0.4): { build: Build; fx: Fx[] } {
  // 取整到 0.001cm（|| 0 消掉 -0：存成 JSON 再读回来会变成 0，测量表的过期检查会对不上）
  const [dx, dy, dz] = measured(`flames:${key}`, () => fitOffset(build(pals[0][1])).map((v) => Math.round(v * 1000) / 1000 || 0) as [number, number, number])
  return { build: (p) => fitGroup(build(p)), fx: flames.map(([x, y, z]): Fx => ({ kind: 'flame', x: x + dx, y: y + dy, z: z + dz, scale })) }
}

/** 往 target 的正面（+z）投射，把一块发光的刻痕贴在命中的表面上、朝着表面法线（刻出来的南瓜脸） */
function carveOn(target: THREE.Mesh, pts: V2[], x: number, y: number, color: string) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 80), new THREE.Vector3(0, 0, -1))
  const hit = ray.intersectObject(target, false)[0]
  const m = lit(slabXY(pts, 1.2, color), color, 0.95)
  const g = G(m)
  if (hit?.face) {
    const n = hit.face.normal.clone().transformDirection(target.matrixWorld)
    g.position.copy(hit.point).addScaledVector(n, -0.2)
    aim(g, n, new THREE.Vector3(0, 0, 1))
  } else g.position.set(x, y, target.position.z)
  return g
}

/** 蝴蝶结：两只压扁的蝶翼 + 结 + 两条垂尾，正面朝 +z，(x, y, z) 是结的中心 */
function bow(color: string, x: number, y: number, z: number, s = 1) {
  const g = new THREE.Group()
  for (const k of [-1, 1]) {
    g.add(P(ball(2.2 * s, color, {}, [1.25, 0.78, 0.5], [8, 5]), k * 2.4 * s, 0.4 * s, 0, 0, 0, k * 0.3))
    g.add(noOutline(P(ball(0.9 * s, shade(color, -0.2), {}, [1.1, 0.5, 0.3], [8, 4]), k * 2.6 * s, 0.4 * s, 0.95 * s, 0, 0, k * 0.3)))
    g.add(P(box(1.6 * s, 5 * s, 0.5 * s, color), k * 1.3 * s, -3 * s, 0.1 * s, 0, 0, k * 0.32))
  }
  g.add(ball(1.1 * s, shade(color, -0.06), {}, [1.1, 1, 0.8], [8, 6]))
  return P(g, x, y, z)
}

// ---------- 万圣节玄关组：三只大小不一的南瓜叠成塔（最上面一只刻了发光的笑脸），旁边一束扎腰的干稻草和一只黑猫剪影立牌 ----------

/** 坐着的黑猫剪影（正面看）：身子、两只尖耳朵，尾巴在右侧贴地卷起来。底边在 y = 0 */
const CAT_PTS: V2[] = [
  [-9, 0], [9, 0], [14, 0.4], [17.2, 3.8], [17.8, 8.2], [16, 11.3], [14.2, 11.2], [15.4, 8.6], [15.1, 5.6], [13.2, 3.3], [10.4, 2.8],
  [10.2, 8], [7, 16.5], [4.5, 20], [6.6, 22.5], [7.2, 26], [6.6, 29.2], [6.9, 34.6], [3.2, 30.6], [0, 31.1],
  [-3.2, 30.6], [-6.9, 34.6], [-6.6, 29.2], [-7.2, 26], [-6.6, 22.5], [-4.5, 20], [-7, 16.5], [-10, 8], [-9.5, 2.5],
]
/** 杏仁形的猫眼 */
const CAT_EYE: V2[] = Array.from({ length: 10 }, (_, i): V2 => {
  const a = (i / 10) * PI * 2
  return [Math.cos(a) * 1.4, Math.sin(a) * 0.85 * (0.75 + 0.25 * Math.abs(Math.cos(a)))]
})

function halloweenPorch(p: string[]) {
  const [pumpA, pumpB, twine] = p
  const g = new THREE.Group()
  // 南瓜塔：上面一只的底圈压进下面一只的梗窝
  const x0 = -12
  const z0 = 3
  const tiers: [number, number, string, number][] = [
    [18, 0.7, pumpA, 0],
    [13.5, 0.76, pumpB, 1.2],
    [10, 0.86, pumpA, -0.6],
  ]
  let top = 0
  const stack: THREE.Mesh[] = []
  tiers.forEach(([r, hs, c, dx], i) => {
    const half = GOURD_HALF * r * hs
    const cy = top + half - (i ? 1.1 : 0)
    const m = gourd(r, hs, c)
    m.position.set(x0 + dx, cy, z0)
    m.rotation.y = -PI / 2 + i * 0.4
    g.add(m)
    top = cy + half
    stack.push(m)
  })
  // 顶上一只：梗、一根卷须、一片叶子
  const cx = x0 - 0.6
  g.add(pumpkinStem(cx, top - 0.3, z0, 5, 1.1, STEM, 0.4))
  const vine: V3[] = []
  for (let i = 0; i <= 14; i++) {
    const a = i * 0.75
    const rr = 2.6 - i * 0.12
    vine.push([cx + 0.6 + Math.cos(a) * rr + i * 0.35, top + 0.6 + i * 0.1, z0 + Math.sin(a) * rr])
  }
  g.add(tube(vine, 0.18, STEM, { seg: 40, radial: 4 }))
  g.add(P(ball(2.6, PINE_L, {}, [1, 0.18, 0.7]), cx - 3, top + 0.2, z0 + 1.2, 0.2, 0.6, -0.25))
  // 刻出来的笑脸：两只圆眼、一个三角鼻、一道上翘的弯嘴（分几段贴合表面）
  g.updateMatrixWorld(true)
  const head = stack[stack.length - 1]
  const hy = head.position.y
  const eye = Array.from({ length: 8 }, (_, i): V2 => [Math.cos((i / 8) * PI * 2) * 1.5, Math.sin((i / 8) * PI * 2) * 1.75])
  for (const s of [-1, 1]) g.add(carveOn(head, eye, cx + s * 3.3, hy + 2.4, GLOW))
  g.add(carveOn(head, [[-0.9, -0.55], [0.9, -0.55], [0, 0.9]], cx, hy + 0.1, GLOW))
  for (let k = -2; k <= 2; k++) {
    const x = k * 1.9
    const y = -2.6 + 0.12 * x * x
    const a = Math.atan(0.26 * x)
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const quad: V2[] = (
      [
        [-1.05, -0.8],
        [1.05, -0.8],
        [1.05, 0.6],
        [-1.05, 0.6],
      ] as V2[]
    ).map(([u, v]): V2 => [u * c - v * sn, u * sn + v * c])
    g.add(carveOn(head, quad, cx + x, hy + y, GLOW))
  }
  // 一束干稻草：下半截散开立在地上，腰上扎一道麻绳，上半截散开、顶上是穗头
  const rand = rng(11)
  const sx = 11
  const sz = -9
  const tieY = 24
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * PI * 2 + rand() * 0.3
    const rb = 5 + rand() * 2.5
    const rt = 6 + rand() * 4
    const tr = 1.1 + rand() * 0.6
    const c = i % 3 ? STRAW : STRAW_D
    const mid: V3 = [sx + Math.cos(a) * tr, tieY, sz + Math.sin(a) * tr]
    const tip: V3 = [sx + Math.cos(a) * rt, 58 + rand() * 9, sz + Math.sin(a) * rt]
    g.add(taperRod3([sx + Math.cos(a) * rb, 0.3, sz + Math.sin(a) * rb], mid, 0.45, 0.38, c, 5))
    g.add(taperRod3(mid, tip, 0.38, 0.25, c, 5))
    const dir = new THREE.Vector3(tip[0] - mid[0], tip[1] - mid[1], tip[2] - mid[2]).normalize()
    const ear = aim(ball(1, STRAW_D, {}, [0.55, 2.4, 0.55], [6, 4]), dir)
    ear.position.set(tip[0] + dir.x * 1.8, tip[1] + dir.y * 1.8, tip[2] + dir.z * 1.8)
    g.add(ear)
  }
  g.add(torus(2.1, 0.7, twine, { x: sx, y: tieY, z: sz, rx: PI / 2 }))
  g.add(bow(twine, sx, tieY - 0.2, sz + 2.6, 0.55))
  // 黑猫剪影立牌：插在一块小木座里，眼睛是发光的黄色
  const cat = new THREE.Group()
  cat.add(slabXY(CAT_PTS, 1.2, INK, 0.2, 'cat'))
  for (const s of [-1, 1]) {
    cat.add(lit(P(slabXY(CAT_EYE, 0.5, GLOW, 0, 'cateye'), s * 2.6, 25.6, 0.65), GLOW, 0.9))
    cat.add(P(slabXY([[-0.18, -0.7], [0.18, -0.7], [0.18, 0.7], [-0.18, 0.7]], 0.4, INK, 0, 'pupil'), s * 2.6, 25.6, 1.05))
  }
  cat.add(P(rbox(1.8, 1.2, 0.5, '#ff9db0', {}, 0.2), 0, 23.6, 0.7))
  const base = rbox(24, 2.5, 6, WOOD, { x: 3.5, y: -1.5 }, 0.6)
  cat.add(base)
  g.add(P(cat, 17, 1.5, 9, 0, -0.25, 0))
  return fitGroup(g)
}

// ---------- 万圣节门花环：黑色枝条编的圈，下方坐着一只卡通小骷髅头，右上飞着三只小蝙蝠，顶上一只橙色蝴蝶结 ----------

/** 蝙蝠剪影（翼展约 10）：两只尖耳、扇形翅膀 */
const BAT_HALF: V2[] = [[0.35, 1.5], [0.6, 0.8], [1.2, 0.9], [2.6, 1.6], [4.2, 1.9], [5, 1.3], [4.2, 0.6], [3.6, -0.2], [2.8, 0.1], [2.2, -0.6], [1.4, -0.2], [0.6, -1.1], [0, -1.3]]
const BAT_PTS: V2[] = [[0, 0.9], ...BAT_HALF, ...BAT_HALF.slice(0, -1).reverse().map(([x, y]): V2 => [-x, y])]

function skeletonWreath(p: string[]) {
  const [twig, ribbon, batC] = p
  const g = new THREE.Group()
  const RR = 15
  // 枝条：一圈粗芯 + 几圈绕着它起伏的细枝 + 支棱出来的小枝杈
  g.add(torus(RR, 2.2, twig))
  for (let k = 0; k < 6; k++) {
    const pts: V3[] = []
    const ph = k * 1.1
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * PI * 2
      const rr = RR + Math.sin(a * 3 + ph) * 1.6
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr, Math.cos(a * 2 + ph) * 1.4])
    }
    g.add(tube(pts, 0.35, shade(twig, k % 2 ? 0.1 : -0.04), { closed: true, seg: 36, radial: 4 }))
  }
  const rand = rng(5)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * PI * 2 + rand() * 0.2
    const out = i % 2 ? 1 : -1
    const r0 = RR + out * 1.6
    const r1 = RR + out * (4 + rand() * 2.5)
    const a1 = a + (rand() - 0.5) * 0.3
    g.add(rod3([Math.cos(a) * r0, Math.sin(a) * r0, 0.4], [Math.cos(a1) * r1, Math.sin(a1) * r1, (rand() - 0.3) * 2], 0.22, shade(twig, 0.06), 4))
  }
  // 三只小蝙蝠
  ;([[0.5, 1, -0.3], [0.95, 0.8, 0.25], [0.12, 0.7, -0.15]] as V3[]).forEach(([a, s, rot]) => {
    const b = P(slabXY(BAT_PTS, 0.6, batC, 0.12, 'bat'), Math.cos(a) * (RR + 3), Math.sin(a) * (RR + 3), 1.8, 0, 0, rot)
    b.scale.setScalar(s)
    g.add(b)
  })
  // 卡通小骷髅：圆脑壳、窄下巴、两只大眼窝（带高光）、倒心形鼻孔、三道牙缝
  const k = G()
  k.add(ball(4.2, BONE, {}, [1.05, 0.95, 0.85]))
  k.add(rbox(5.6, 2.8, 5, BONE, { y: -4 }, 1.2))
  for (const s of [-1, 1]) {
    k.add(noOutline(ball(1.25, INK, { x: s * 1.6, y: 0.2, z: 3.22 }, [0.9, 1.1, 0.35], [8, 6])))
    k.add(noOutline(ball(0.32, '#ffffff', { x: s * 1.6 + 0.4, y: 0.7, z: 3.62 }, undefined, [6, 4])))
  }
  k.add(noOutline(ball(0.55, INK, { y: -1.4, z: 3.28 }, [1, 0.75, 0.4], [8, 6])))
  for (const x of [-1, 0, 1]) k.add(decalZ(0.25, 1.3, INK, x, -2.6, 2.56))
  g.add(P(k, Math.cos(-2.2) * RR, Math.sin(-2.2) * RR + 1, 3, 0, 0, 0.15))
  // 顶上的蝴蝶结
  g.add(bow(ribbon, 0, RR + 0.6, 3, 1))
  return fitWall(g, 150, 9)
}

// ---------- 感恩节餐桌中心：两头带提手的长木托盘，中间椭圆瓷盘上一只金褐色烤火鸡（两只鸡腿套纸花袖口），两头立着蜡烛，散着小南瓜和落叶 ----------

const TG = { w: 58, d: 26, t: 1.2 }
const TG_CANDLES: [number, number, number][] = [
  [-22, -4.5, 15],
  [22, -4.5, 11],
]
/** 烤火鸡（身子沿 x，鸡腿朝 +x 翘起），底面在 y */
function roastTurkey(y: number) {
  const g = new THREE.Group()
  const by = y + 5.6
  g.add(ball(8, ROAST, { y: by }, [1.15, 0.72, 0.95], [16, 12]))
  // 胸脯两块鼓起
  for (const s of [-1, 1]) g.add(ball(4.6, ROAST_L, { x: -0.8, y: by + 2.6, z: s * 2.5 }, [1.45, 0.72, 0.9], [12, 8]))
  // 翅膀贴在两侧
  for (const s of [-1, 1]) g.add(ball(3.4, ROAST_D, { x: -2.8, y: by - 0.2, z: s * 7 }, [1.3, 0.62, 0.5], [12, 8]))
  // 大腿 + 鸡腿 + 骨头 + 纸花袖口
  for (const s of [-1, 1]) {
    g.add(ball(3.6, ROAST, { x: 4.6, y: by + 0.6, z: s * 5.2 }, [1.3, 0.9, 0.9], [12, 8]))
    const a: V3 = [6.4, by + 1, s * 4.8]
    const b: V3 = [11.6, by + 4, s * 3.4]
    const c: V3 = [13.4, by + 5, s * 3]
    g.add(ball(2.3, ROAST_D, { x: a[0], y: a[1], z: a[2] }, undefined, [10, 6]))
    g.add(taperRod3(a, b, 2.3, 1.1, ROAST_D, 12))
    g.add(rod3(b, c, 0.5, BONE, 8))
    const dir = new THREE.Vector3(c[0] - b[0], c[1] - b[1], c[2] - b[2])
    const cuffAt = new THREE.Vector3(...b).addScaledVector(dir, 0.55)
    const cuff = aim(cyl(1.45, 0.9, 1.7, ICING, {}, 10), dir)
    cuff.position.copy(cuffAt)
    g.add(cuff)
    g.add(ball(0.75, BONE, { x: c[0], y: c[1], z: c[2] }, undefined, [8, 6]))
  }
  return g
}
function thanksgivingTable(p: string[]) {
  const [wood, platter, wax] = p
  const g = new THREE.Group()
  const { w, d, t } = TG
  // 托盘：底板、两条长边、两头带把手孔的端板
  g.add(rbox(w - 2.4, t, d, wood, {}, 0.4))
  for (const s of [-1, 1]) g.add(rbox(w - 2.4, 3.5, t, wood, { z: s * (d / 2 - t / 2) }, 0.4))
  for (const s of [-1, 1]) g.add(holePanel(d, 6.5, t, shade(wood, -0.05), [{ kind: 'rect', x: 0, y: 3.6, w: 9, h: 1.8, r: 0.9 }], { x: s * (w / 2 - t / 2), ry: PI / 2 }, 1.2, { seg: 4 }))
  // 椭圆瓷盘 + 烤火鸡 + 盘边的香芹和蔓越莓
  const plat = lathe([[0, 0], [9, 0], [11.4, 0.9], [12, 1.5], [11.5, 1.6], [9.4, 0.7], [0, 0.7]], platter, 32)
  plat.position.y = t
  plat.scale.z = 0.72
  g.add(plat)
  g.add(roastTurkey(t + 0.7))
  const rand = rng(3)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2
    const x = Math.cos(a) * 10.2
    const z = Math.sin(a) * 7.1
    if (x > 9) continue
    g.add(pip(i % 3 ? 0.9 : 0.6, i % 3 ? PARSLEY : CRANBERRY, x, t + 1.5 + rand() * 0.3, z, [1, 0.8, 1], true))
  }
  // 两支蜡烛（铜烛托）
  for (const [x, z, h] of TG_CANDLES) {
    g.add(cyl(3, 3.3, 0.9, BRASS, { x, y: t, z }, 20))
    g.add(candle(2, h, wax, x, t + 0.9, z))
  }
  // 小南瓜：橙、白、灰绿
  g.add(miniPumpkin(3.3, PUMPKIN_O, -19, t, 6.2))
  g.add(miniPumpkin(2.7, PUMPKIN_W, 18.5, t, 6.8, 0.8))
  g.add(miniPumpkin(2.4, PUMPKIN_G, 23.5, t, 4.5))
  // 落叶：平躺在托盘里，略微埋进底板
  ;([[-14.5, 9, 0.4], [-25, 3.5, 2], [14, -8.5, 1.2], [25.5, -9.5, -0.6], [-15, -9, 2.6], [13.5, 9.4, -1.4]] as V3[]).forEach(([x, z, ry], i) => {
    g.add(P(slabXY(maplePts(2.2), 0.3, FALL_LEAVES[i % FALL_LEAVES.length], 0, 'maple'), x, t + 0.1, z, -PI / 2, 0, ry))
  })
  return g
}

// ---------- 情人节组：一束自立的手扎红玫瑰（牛皮纸 + 衬纸包着、缎带系腰），一只打开的心形巧克力盒压在盒盖上，一张立着的心形卡片 ----------

/** 玫瑰花头：花心 + 一圈外翻的花瓣，(x, y, z) 是花心底部 */
function rose(color: string, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(ball(1.7, shade(color, -0.08), { y: 1.5 }, [1, 0.9, 1], [8, 6]))
  g.add(noOutline(band(0.9, 0.3, shade(color, -0.2), { y: 2.85, rx: PI / 2 }, PI * 1.6, 12)))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = ball(1.5, color, {}, [1, 0.82, 0.42], [6, 5])
    m.position.set(Math.cos(a) * 1.25, 1.2, Math.sin(a) * 1.25)
    m.rotation.set(0, -a + PI / 2, 0)
    m.rotateX(0.5)
    g.add(m)
  }
  return P(g, x, y, z)
}
function valentineSet(p: string[]) {
  const [roseC, paper, boxC, tissue] = p
  const g = new THREE.Group()
  // 花束：花茎下端散开撑地，缎带系腰，上面是喇叭形的包装纸
  const bq = new THREE.Group()
  const wrapY = 9
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    bq.add(rod3([Math.cos(a) * 3.3, 0.3, Math.sin(a) * 3.3], [Math.cos(a) * 0.9, wrapY + 0.4, Math.sin(a) * 0.9], 0.32, STEM, 5))
  }
  bq.add(cup(10, 2.2, 15, 0.35, paper, { y: wrapY }))
  bq.add(torus(2.5, 0.55, roseC, { y: wrapY + 0.5, rx: PI / 2 }))
  bq.add(bow(roseC, 0, wrapY + 0.6, 2.9, 0.45))
  // 外层的衬纸：一圈尖顶的纸片，贴着包装纸的斜面往外翻
  const tilt = Math.atan(7.8 / 15)
  const flap: V2[] = [[-1.6, 0], [1.6, 0], [4.6, 13], [0, 17], [-4.6, 13]]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3
    const y0 = wrapY + 2
    const r0 = 2.2 + 7.8 * (2 / 15) + 0.55
    const leaf = P(slabXY(flap, 0.3, tissue, 0, 'flap'), 0, 0, 0, tilt, 0, 0)
    bq.add(P(G(P(G(leaf), 0, y0, r0)), 0, 0, 0, 0, PI / 2 - a, 0))
  }
  // 花头埋在包装口里的一层绿叶上
  bq.add(cyl(8.4, 7.9, 1.5, PINE, { y: wrapY + 12.4 }, 24))
  ;([[0, 0], [4.7, 0.4], [-4.5, 1.3], [1.6, 4.6], [-2.2, -4.4], [2.9, -3.7], [-3.4, 4]] as V2[]).forEach(([x, z], i) => bq.add(rose(roseC, x, wrapY + 13.2 + (i ? 0 : 1), z)))
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.2
    bq.add(P(ball(2.4, PINE_L, {}, [0.45, 0.14, 1], [6, 4]), Math.cos(a) * 7.2, wrapY + 14, Math.sin(a) * 7.2, 0, -a + PI / 2, 0).rotateX(-0.5))
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + 0.6
    bq.add(pip(0.5, '#ffffff', Math.cos(a) * 6.6, wrapY + 14.6 + (i % 2) * 0.4, Math.sin(a) * 6.6, [1, 1, 1], true))
  }
  g.add(P(bq, -9, 0, -3))
  // 心形巧克力盒：盒盖垫在下面、斜着露出一角；盒身是一圈心形围边 + 金色衬纸底 + 七颗巧克力
  const lid = P(slabXY(heartPts(15.2), 1.2, shade(boxC, -0.06), 0.3, 'heart-lid'), 8.6, 0.6, 4.2, -PI / 2, 0, 0.4)
  g.add(lid)
  const choc = new THREE.Group()
  const ring = new THREE.Shape(heartPts(14).map(([x, y]) => new THREE.Vector2(x, y)))
  ring.holes.push(new THREE.Path(heartPts(12.4).map(([x, y]) => new THREE.Vector2(x, y))))
  choc.add(P(slabXY(ring, 3.4, boxC, 0.2), 0, 1.7, 0, -PI / 2, 0, 0))
  choc.add(P(slabXY(heartPts(13.2), 0.8, GOLD, 0, 'heart-floor'), 0, 0.4, 0, -PI / 2, 0, 0))
  ;([[-3.1, 2.6], [3.1, 2.6], [0, 0.9], [-1.6, -1.6], [1.6, -1.6], [0, -3.7], [-4.2, 0.4]] as V2[]).forEach(([x, yh], i) => {
    choc.add(cyl(1.3, 1.0, 1.0, '#8a5a3a', { x, y: 0.8, z: -yh }, 12))
    if (i % 3 === 0) choc.add(P(slabXY(heartPts(2), 0.9, i ? CHOC : roseC, 0.2, 'choc-heart'), x, 1.5, -yh, -PI / 2, 0, 0))
    else choc.add(ball(0.95, i % 2 ? CHOC : '#7a4a30', { x, y: 1.55, z: -yh }, [1, 0.72, 1], [8, 6]))
  })
  g.add(P(choc, 6.5, 1.2, 4.5, 0, 0.12, 0))
  // 立着的折卡：两片对靠成帐篷形，正面一颗红心
  const card = new THREE.Group()
  const ch = 12
  const spread = 2.3
  const front = G(box(9, ch, 0.25, '#fffaf4', { y: 0, z: -0.125 }))
  front.add(P(slabXY(heartPts(5.4), 0.3, roseC, 0, 'card-heart'), 0, ch * 0.55, 0.1))
  const fr = Math.atan2(-spread, ch)
  card.add(P(front, 0, 0, spread, fr, 0, 0))
  card.add(P(G(box(9, ch, 0.25, tissue, { z: 0.125 })), 0, 0, -spread, -fr, 0, 0))
  g.add(P(card, 11.5, 0, -6.5, 0, -0.35, 0))
  return fitGroup(g)
}

// ---------- 香槟塔：圆托盘上三层香槟碟（下 3×3、中 2×2、顶 1 只，上层的杯脚架在下层四只杯口上），旁边一瓶开过的香槟和拔下来的软木塞 ----------

/** 碟形香槟杯（含壁厚的车削轮廓）：杯口在 y = CH.rim */
const CH = { rim: 9, step: 9.4 }
const COUPE: V2[] = [[0, 0], [3.3, 0], [3.3, 0.25], [1.2, 0.5], [0.38, 1.2], [0.38, 5.6], [1, 6], [3.2, 6.8], [4.3, 8], [4.6, 9], [4.4, 9], [4.1, 8.2], [3, 7.2], [1, 6.4], [0, 6.35]]
const BUBBLY: V2[] = [[0, 6.5], [0.95, 6.55], [2.9, 7.3], [3.85, 8], [0, 8]]
/** 一只杯里的酒和杯口亮边；玻璃杯身在 champagneTower 里统一合成一个网格 */
function coupe(x: number, y: number, z: number) {
  return G(
    P(lathe(BUBBLY, '#f3d36b', 10), x, y, z),
    // 杯口一圈亮边，让透明的杯子看得出轮廓
    noOutline(band(4.5, 0.1, '#ffffff', { x, y: y + CH.rim - 0.05, z, rx: PI / 2 }, PI * 2, 10)),
  )
}
function champagneTower(p: string[]) {
  const [trayC, foil, label] = p
  const g = new THREE.Group()
  g.add(cyl(18.6, 18.6, 1, trayC, {}, 40))
  g.add(torus(18.6, 0.5, shade(trayC, -0.08), { y: 1, rx: PI / 2 }))
  const s = CH.step
  const y0 = 1
  const at: V3[] = []
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) at.push([i * s, y0, j * s])
  for (const i of [-0.5, 0.5]) for (const j of [-0.5, 0.5]) at.push([i * s, y0 + CH.rim, j * s])
  at.push([0, y0 + CH.rim * 2, 0])
  for (const [x, y, z] of at) g.add(coupe(x, y, z))
  // 玻璃杯身：半透明件不参与按材质合并，14 只杯合成一个网格，省成一个 draw call
  const glass = cached('fw-coupes', () => {
    const one = new THREE.LatheGeometry(COUPE.map(([r, y]) => new THREE.Vector2(r, y)), 10)
    return mergeGeometries(at.map(([x, y, z]) => one.clone().translate(x, y, z)))
  })
  g.add(ghost(mesh(glass, '#e4f5ff'), '#e4f5ff', 0.45))
  // 香槟瓶：深绿玻璃、酒标、颈上的锡箔（软木塞已经拔掉）
  const bx = 23
  const bz = -6
  g.add(P(lathe([[0, 0], [3.7, 0], [3.8, 0.4], [3.8, 17], [3.5, 19.5], [2.4, 22], [1.45, 24.5], [1.4, 28], [1.6, 28.4], [1.6, 29.2], [1.3, 29.4], [1, 29.3], [1, 26], [0, 26]], BOTTLE, 20), bx, 0, bz))
  g.add(cyl(3.9, 3.9, 6.5, label, { x: bx, y: 7.5, z: bz }, 20))
  g.add(cyl(3.9, 3.9, 0.8, foil, { x: bx, y: 14.2, z: bz }, 20))
  g.add(P(lathe([[2.5, 22.2], [1.56, 24.5], [1.51, 27.9], [1.7, 28.3], [1.7, 29.3], [1.42, 29.5], [1.12, 29.5]], foil, 20), bx, 0, bz))
  // 拔下来的软木塞（蘑菇形，躺在桌上）
  const cork = G(cyl(1.05, 1.05, 2.4, '#d2a76a', {}, 12), cyl(1.6, 1.6, 1.4, '#c49758', { y: 2.4 }, 12), ball(1.6, '#c49758', { y: 3.8 }, [1, 0.45, 1], [10, 6]))
  cork.rotation.set(0, 0.6, PI / 2)
  g.add(restAt(cork, bx - 1, bz + 9))
  return fitGroup(g)
}

// ---------- 生日派对桌面：淋了巧克力酱、撒着彩糖的蛋糕上插一支「8」字蜡烛（两个圆环叠成），一摞纸盘，一顶立着、一顶倒着的派对帽，一只吹龙 ----------

const BD = { cx: -8, top: 10.6 }
/** 「8」字蜡烛：上下两个圆环的中心高度和半径；wick 是烛芯根部的高度 */
const EIGHT = { lo: 13.45, rlo: 1.7, hi: 17.05, rhi: 1.4, tube: 0.55, wick: 17.05 + 1.4 + 0.55 - 0.2 }
const BD_FLAME: V3 = [BD.cx, EIGHT.wick + 0.9 * 0.7, 0]
/** 派对帽：圆锥 + 两道彩条 + 顶上绒球，底面中心在原点 */
function partyHat(main: string, stripe: string, pom: string) {
  const g = new THREE.Group()
  const r = 4.6
  const h = 13
  g.add(cyl(0, r, h, main, {}, 18))
  for (const y of [3, 7.5]) g.add(noOutline(band(r * (1 - y / h) + 0.05, 0.3, stripe, { y, rx: PI / 2 })))
  g.add(ball(1.5, pom, { y: h + 0.6 }, undefined, [10, 8]))
  return g
}
function birthdayTable(p: string[]) {
  const [frost, accA, accB, board] = p
  const g = new THREE.Group()
  const { cx, top } = BD
  // 蛋糕：底托、蛋糕体、顶上的巧克力淋面 + 往下挂的酱滴、裱花、彩糖
  g.add(cyl(12, 12, 1.2, board, { x: cx }, 40))
  g.add(cyl(9, 9, 8.4, frost, { x: cx, y: 1.2 }, 32))
  g.add(cyl(9.2, 9.2, 1, CHOC, { x: cx, y: 9.6 }, 32))
  const rand = rng(8)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2 + 0.1
    const len = 1.2 + rand() * 2.6
    g.add(cyl(0.55, 0.55, len, CHOC, { x: cx + Math.cos(a) * 9.1, y: 9.8 - len, z: Math.sin(a) * 9.1 }, 6))
    g.add(ball(0.55, CHOC, { x: cx + Math.cos(a) * 9.1, y: 9.8 - len, z: Math.sin(a) * 9.1 }, undefined, [6, 4]))
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2
    g.add(pip(1.05, i % 2 ? '#fffaf2' : frost, cx + Math.cos(a) * 7.4, top + 0.5, Math.sin(a) * 7.4, [1, 0.9, 1]))
  }
  const sprinkle = [accA, accB, '#ffffff', '#ff8f86']
  for (let i = 0; i < 30; i++) {
    const a = rand() * PI * 2
    const rr = 2.4 + rand() * 3.8
    g.add(cyl(0.16, 0.16, 0.8, sprinkle[i % 4], { x: cx + Math.cos(a) * rr, y: top - 0.05, z: Math.sin(a) * rr, rx: PI / 2, rz: rand() * PI }, 4))
  }
  // 「8」字蜡烛：一根插进蛋糕的小签 + 上下两个竖着的圆环
  g.add(cyl(0.35, 0.35, 1.6, accA, { x: cx, y: top - 0.6 }, 8))
  g.add(torus(EIGHT.rlo, EIGHT.tube, accA, { x: cx, y: EIGHT.lo }))
  g.add(torus(EIGHT.rhi, EIGHT.tube, accA, { x: cx, y: EIGHT.hi }))
  for (const [y, r] of [
    [EIGHT.lo, EIGHT.rlo],
    [EIGHT.hi, EIGHT.rhi],
  ])
    g.add(noOutline(band(r, 0.2, '#ffffff', { x: cx, y, z: EIGHT.tube - 0.05 })))
  const wy = EIGHT.wick
  g.add(cyl(0.12, 0.12, 0.8, WICK, { x: cx, y: wy - 0.1 }, 5))
  g.add(lit(ball(0.45 * 0.7, FLAME, { x: cx, y: wy + 0.95 * 0.7 }, [1, 1.8, 1], [8, 6]), FLAME, 1))
  // 一摞纸盘：一根实心柱身 + 每张盘子的彩边 + 顶上一张带盘心凹的
  const px = 13.5
  const pz = -6.5
  g.add(cyl(8, 7.6, 2.6, '#fbfaf6', { x: px, z: pz }, 28))
  for (let k = 0; k < 6; k++) g.add(noOutline(band(8, 0.22, k % 2 ? accB : shade(accB, 0.12), { x: px, y: 0.4 + k * 0.42, z: pz, rx: PI / 2 })))
  g.add(P(lathe([[0, 0], [6, 0], [8.3, 0.7], [8.5, 0.85], [8.2, 0.9], [6, 0.25], [0, 0.25]], '#fbfaf6', 28), px, 2.5, pz))
  g.add(noOutline(band(7.4, 0.2, accB, { x: px, y: 3.15, z: pz, rx: PI / 2 })))
  // 派对帽：一顶立着，一顶侧倒（母线贴着桌面）
  g.add(P(partyHat(accA, accB, '#ffffff'), 14.5, 0, 9.5))
  const alpha = Math.atan(4.6 / 13)
  const lying = partyHat(accB, accA, accA)
  lying.rotation.set(0, 0, -(PI / 2 + alpha))
  const wrap = G(lying)
  wrap.rotation.y = -0.35
  g.add(restAt(wrap, -7, 15))
  // 吹龙：吹嘴 + 卷起来的纸卷（竖着立在桌面上）+ 一撮流苏
  const bx = -21
  const bz = -12.5
  g.add(cylX(0.55, 3.2, '#ffffff', bx, 0.55, bz, 10))
  g.add(cylX(0.8, 0.8, accB, bx + 1.9, 0.8, bz, 10))
  const coil: V3[] = []
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    const a = -PI / 2 + t * PI * 3.4
    const rr = 3.2 - t * 2.3
    coil.push([bx + 5.5 + Math.cos(a) * rr, 3.55 + Math.sin(a) * rr, bz])
  }
  const roll = tube([[bx + 2.1, 0.8, bz], ...coil], 0.4, accA, { seg: 64, radial: 6 })
  roll.scale.z = 2.6
  roll.position.z = bz * (1 - 2.6)
  g.add(roll)
  return g
}

// ---------- 气球拱门：两头各一只配重底座立起一根白杆，上面撑着一道半椭圆的气球拱，四种颜色的气球四只一簇交错、夹着小气球 ----------

const BA = { a: 80, b: 75, y0: 100 }
function balloonArch(p: string[]) {
  const [c1, c2, c3, c4, baseC] = p
  const g = new THREE.Group()
  const cols = [c1, c2, c3, c4]
  // 配重底座 + 立杆
  for (const s of [-1, 1]) {
    const x = s * BA.a
    g.add(rbox(30, 9, 30, baseC, { x }, 3))
    g.add(cyl(2.4, 2.8, 2, shade(baseC, -0.1), { x, y: 9 }, 16))
    g.add(cyl(1.4, 1.4, BA.y0 + 4 - 11, '#f4f4f2', { x, y: 11 }, 12))
  }
  // 拱：半椭圆骨架（藏在气球里），沿着骨架每站一簇四只大气球，簇和簇之间转 45°
  const at = (t: number): THREE.Vector3 => new THREE.Vector3(-Math.cos(t) * BA.a, BA.y0 + Math.sin(t) * BA.b, 0)
  const frame: V3[] = []
  for (let i = 0; i <= 24; i++) {
    const v = at((i / 24) * PI)
    frame.push([v.x, v.y, 0])
  }
  g.add(tube(frame, 1.2, '#f4f4f2', { seg: 24, radial: 5 }))
  const n = 21
  const rand = rng(21)
  const seg: [number, number] = [9, 6]
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * PI
    const c = at(t)
    const tan = new THREE.Vector3(Math.sin(t) * BA.a, Math.cos(t) * BA.b, 0).normalize()
    const nor = new THREE.Vector3(-tan.y, tan.x, 0)
    for (let k = 0; k < 4; k++) {
      const ph = (k / 4) * PI * 2 + (i % 2) * (PI / 4)
      const off = nor.clone().multiplyScalar(Math.cos(ph) * 7.5).add(new THREE.Vector3(0, 0, Math.sin(ph) * 7.5))
      const r = 11 + rand() * 2.5
      const m = ball(r, cols[(i + k) % 4], {}, [1, 1.12, 1], seg)
      m.position.copy(c).add(off)
      aim(m, off)
      g.add(m)
    }
    // 小气球填缝
    if (i % 2) {
      const ph = rand() * PI * 2
      const off = nor.clone().multiplyScalar(Math.cos(ph) * 13).add(new THREE.Vector3(0, 0, Math.sin(ph) * 13))
      g.add(ball(5.5, cols[(i + 2) % 4], { x: c.x + off.x, y: c.y + off.y, z: c.z + off.z }, undefined, seg))
    }
  }
  return fitGroup(g)
}

// ---------- 圣诞倒数日历：木头小屋，正面 4 × 6 共 24 只小抽屉（三种颜色交错，每只带拉手和点数标签），人字屋顶积着雪、挂着冰溜，山墙上一颗金星 ----------

const AC = { w: 36, h: 32, d: 9, cols: 4, rows: 6, roof: 44 }
function adventCalendar(p: string[]) {
  const [house, drawA, drawB, trim] = p
  const g = new THREE.Group()
  const { w, h, d } = AC
  g.add(rbox(w + 2, 2, d + 1.4, shade(house, -0.1), { y: -1.6 }, 0.6))
  g.add(rbox(w, h, d, house, {}, 0.8))
  // 抽屉：面板嵌进柜体一半、凸出 0.5；每只一个铜拉手和一块米白标签（上面 1–4 个点表示是第几天）
  const mx = 1.8
  const my = 1.5
  const gap = 0.8
  const cw = (w - mx * 2 - gap * (AC.cols - 1)) / AC.cols
  const rh = (h - my * 2 - gap * (AC.rows - 1)) / AC.rows
  const drawColors = [drawA, drawB, trim]
  const fz = d / 2
  for (let i = 0; i < AC.cols; i++)
    for (let j = 0; j < AC.rows; j++) {
      const x = -w / 2 + mx + cw / 2 + i * (cw + gap)
      const y = my + j * (rh + gap)
      const k = j * AC.cols + i
      g.add(box(cw, rh, 1, drawColors[(i + j) % 3], { x, y, z: fz }))
      g.add(ball(0.42, BRASS, { x, y: y + rh * 0.3, z: fz + 0.62 }, undefined, [6, 4]))
      const tagC = (i + j) % 3 === 2 ? '#f6efe0' : '#fbf6ea'
      g.add(decalZ(2.6, 1.3, tagC, x, y + rh * 0.7, fz + 0.56))
      const dots = (k % 4) + 1
      for (let q = 0; q < dots; q++) g.add(decalZ(0.36, 0.36, '#5a4646', x + (q - (dots - 1) / 2) * 0.55, y + rh * 0.7, fz + 0.62))
    }
  // 山墙（三角棱柱）+ 两片屋顶板 + 屋顶上的积雪、冰溜、烟囱
  const ridge = AC.roof
  g.add(slabXY([[-w / 2 + 0.5, h - 0.5], [w / 2 - 0.5, h - 0.5], [0, ridge - 1.5]], d, house))
  const run = w / 2 + 0.5
  const rise = ridge - 1.5 - (h - 0.5)
  const th = Math.atan2(rise, run)
  const len = Math.hypot(run, rise) + 3.5
  const n = new THREE.Vector2(Math.sin(th), Math.cos(th))
  for (const s of [-1, 1]) {
    const mx2 = (s * run) / 2
    const my2 = (h - 0.5 + ridge - 1.5) / 2
    // 屋顶板：底面贴在山墙斜边上，往檐口方向多伸出一点
    const along = new THREE.Vector2(s * Math.cos(th), -Math.sin(th))
    const c = new THREE.Vector2(mx2, my2).addScaledVector(new THREE.Vector2(s * n.x, n.y), 0.8).addScaledVector(along, 1)
    g.add(P(rbox(len, 1.6, d + 2, drawA, {}, 0.5), c.x, c.y, 0, 0, 0, -s * th))
    const sc = c.clone().addScaledVector(new THREE.Vector2(s * n.x, n.y), 1.3)
    g.add(P(rbox(len - 0.6, 1.4, d + 2.6, SNOW, {}, 0.6), sc.x, sc.y, 0, 0, 0, -s * th))
    // 檐口一排冰溜（挂在积雪下沿）
    const eave = sc.clone().addScaledVector(along, (len - 0.6) / 2 - 0.4).addScaledVector(new THREE.Vector2(s * n.x, n.y), -0.7)
    for (let q = 0; q < 4; q++) {
      const z = -d / 2 + 1 + q * ((d - 2) / 3)
      g.add(cyl(0.45, 0.05, 1.6 + (q % 2) * 0.9, SNOW, { x: eave.x, y: eave.y - 1.5 - (q % 2) * 0.9, z }, 6))
    }
  }
  g.add(ball(1.3, SNOW, { y: ridge + 0.4 }, [1, 0.6, (d + 2.6) / 2.6], [10, 6]))
  g.add(rbox(4, 8, 4, shade(house, -0.15), { x: -9.5, y: h + 2.5, z: -0.5 }, 0.5))
  g.add(rbox(5, 1.4, 5, SNOW, { x: -9.5, y: h + 10.3, z: -0.5 }, 0.6))
  // 山墙上的金星
  g.add(P(slabXY(starPts(3), 0.6, GOLD, 0.15, 'ac-star'), 0, h + 5.4, d / 2 + 0.2))
  return fitWall(g, 120, d + 2.6)
}

// ---------- 胡桃夹子士兵：金边圆台上站着，黑靴白裤、红外套金扣、肩章和腰带，方下巴的木头脸配白胡子，头戴高帽，右手握着金权杖 ----------

function nutcracker(p: string[]) {
  const [coat, pants, hat, trim] = p
  const g = new THREE.Group()
  // 圆台
  g.add(cyl(8.5, 9, 3, shade(hat, 0.05), {}, 32))
  g.add(noOutline(band(8.7, 0.4, trim, { y: 2.6, rx: PI / 2 }, PI * 2, 32)))
  // 靴子、裤腿
  for (const s of [-1, 1]) {
    g.add(rbox(3.6, 5, 5, INK, { x: s * 2.1, y: 3, z: 0.4 }, 1.2))
    g.add(cyl(1.5, 1.6, 7, pants, { x: s * 2.1, y: 7.5 }, 12))
  }
  // 外套（下摆略宽）、腰带和金扣、三颗纽扣、白色前襟
  g.add(cyl(5, 5.8, 13.5, coat, { y: 14 }, 24))
  g.add(cyl(5.95, 5.95, 1.4, INK, { y: 17 }, 24))
  g.add(rbox(1.9, 1.7, 0.6, trim, { y: 16.85, z: 5.95 }, 0.2))
  // 前襟顺着外套的收腰往后仰一点
  const lean = 0.8 / 13.5
  g.add(P(rbox(3.2, 9.2, 0.6, '#fbf7f1', {}, 0.3), 0, 22.8, 5.33, -lean))
  for (const y of [20, 22.4, 24.8]) g.add(ball(0.42, trim, { y, z: 5.68 - (y - 22.8) * lean }, undefined, [6, 4]))
  // 肩章、手臂、白手套；右手握一根金权杖
  for (const s of [-1, 1]) {
    g.add(puck(1.9, 1, trim, { x: s * 4.6, y: 26.6 }))
    g.add(taperRod3([s * 5.2, 26.2, 0], [s * 6.3, 18.6, 1.2], 1.6, 1.4, coat, 12))
    g.add(cyl(1.55, 1.55, 1.1, '#fbf7f1', { x: s * 6.3, y: 18.2, z: 1.2 }, 12))
    g.add(ball(1.35, '#fbf7f1', { x: s * 6.4, y: 17.5, z: 1.4 }))
  }
  g.add(rod3([6.4, 11, 1.4], [6.4, 27, 1.4], 0.35, trim, 8))
  g.add(ball(0.95, trim, { x: 6.4, y: 27.6, z: 1.4 }, undefined, [10, 8]))
  // 领子、方脑袋、脸、鼻子、八字胡、嘴缝、白胡子、两鬓
  g.add(cyl(3.2, 3.6, 1.2, coat, { y: 27.4 }, 20))
  g.add(rbox(7.2, 8.4, 7, '#f6d2b0', { y: 28.2 }, 1.6))
  g.add(face(5, { y: 33.8, z: 3.5 }))
  g.add(ball(0.75, '#e8a98a', { y: 32.6, z: 3.65 }, undefined, [8, 6]))
  for (const s of [-1, 1]) g.add(ball(1.2, '#fbf7f1', { x: s * 1.1, y: 31.5, z: 3.65 }, [1.3, 0.55, 0.5], [8, 6]))
  g.add(rbox(3.4, 0.45, 0.4, '#7a3a30', { y: 30.35, z: 3.6 }, 0.15))
  g.add(rbox(6.4, 3.6, 2.6, '#fbf7f1', { y: 26.6, z: 2.6 }, 1.2))
  for (const s of [-1, 1]) g.add(rbox(1.2, 4.6, 5.6, '#fbf7f1', { x: s * 3.6, y: 30.6, z: -0.4 }, 0.5))
  g.add(rbox(7.6, 6.2, 1.4, '#fbf7f1', { y: 29.4, z: -3.4 }, 0.6))
  // 高帽：帽身、帽檐金箍、正面金星、顶上一团羽饰
  g.add(cyl(3.9, 3.7, 9.5, hat, { y: 35.8 }, 24))
  g.add(torus(3.75, 0.5, trim, { y: 36.4, rx: PI / 2 }))
  g.add(P(slabXY(starPts(1.6), 0.5, trim, 0.1, 'nc-star'), 0, 41, 3.95))
  g.add(ball(1.3, coat, { y: 45.6, z: 1 }, [1, 1.3, 1], [10, 8]))
  return fitGroup(g)
}

// ---------- 姜饼屋：饼干墙的小屋，屋顶铺着糖霜、檐口挂着糖霜滴，屋脊一排软糖，门旁一根拐杖糖，糖窗透着暖光，屋前躺着一个姜饼人 ----------

const GB = { w: 16, wall: 9, ridge: 15, d: 12, base: 1.2 }
/** 姜饼人轮廓：圆脑袋、两只胳膊、两条腿，脚底在 y ≈ -0.2 */
const GB_MAN: V2[] = (() => {
  const pts: V2[] = []
  for (let i = 0; i <= 10; i++) {
    const a = (-50 + (i / 10) * 280) * (PI / 180)
    pts.push([Math.cos(a) * 1.4, 5.4 + Math.sin(a) * 1.4])
  }
  pts.push([-1, 4.3], [-3.2, 4], [-3.4, 3], [-1.2, 2.9], [-1.3, 1.5], [-2.4, 0.2], [-1.4, -0.2], [0, 1.2], [1.4, -0.2], [2.4, 0.2], [1.3, 1.5], [1.2, 2.9], [3.4, 3], [3.2, 4], [1, 4.3])
  return pts
})()
function gingerbreadHouse(p: string[]) {
  const [candyA, candyB, boardC] = p
  const g = new THREE.Group()
  const { w, wall, ridge, d, base } = GB
  g.add(rbox(24, base, 20, boardC, {}, 0.5))
  // 墙：五边形饼干棱柱
  const hw = w / 2
  g.add(P(slabXY([[-hw, 0], [hw, 0], [hw, wall], [0, ridge], [-hw, wall]], d, COOKIE, 0.4), 0, base, -1))
  const fz = -1 + d / 2
  // 屋顶两块饼干板 + 糖霜层 + 檐口糖霜滴
  const run = hw
  const rise = ridge - wall
  const th = Math.atan2(rise, run)
  const len = Math.hypot(run, rise) + 2.2
  const nrm = (s: number) => new THREE.Vector2(s * Math.sin(th), Math.cos(th))
  const along = (s: number) => new THREE.Vector2(s * Math.cos(th), -Math.sin(th))
  for (const s of [-1, 1]) {
    const mid = new THREE.Vector2((s * run) / 2, base + (wall + ridge) / 2)
    const c = mid.clone().addScaledVector(nrm(s), 0.6).addScaledVector(along(s), 0.9)
    g.add(P(rbox(len, 1.2, d + 2, COOKIE_D, {}, 0.4), c.x, c.y, -1, 0, 0, -s * th))
    const ic = c.clone().addScaledVector(nrm(s), 0.8)
    g.add(P(rbox(len - 0.4, 0.6, d + 2.2, ICING, {}, 0.25), ic.x, ic.y, -1, 0, 0, -s * th))
    const eave = ic.clone().addScaledVector(along(s), (len - 0.4) / 2 - 0.3).addScaledVector(nrm(s), -0.2)
    for (let q = 0; q < 7; q++) {
      const z = -1 - (d + 1.6) / 2 + q * ((d + 1.6) / 6)
      g.add(pip(q % 2 ? 0.55 : 0.75, ICING, eave.x, eave.y - (q % 2 ? 0.5 : 0.8), z, [1, 1.4, 1], true))
    }
    // 屋顶上点几颗彩色糖豆
    for (let q = 0; q < 3; q++) {
      const pos = ic.clone().addScaledVector(along(s), -2.6 + q * 2.6).addScaledVector(nrm(s), 0.35)
      g.add(pip(0.55, q % 2 ? candyB : candyA, pos.x, pos.y, -1 + (q - 1) * 3.5, [1, 1, 1], true))
    }
  }
  // 屋脊一排软糖（圆台 + 圆顶）
  for (let q = 0; q < 5; q++) {
    const z = -1 - 5 + q * 2.5
    const c = [candyA, candyB, '#ffe08f', candyB, candyA][q]
    g.add(cyl(0.7, 1, 1.1, c, { y: base + ridge + 1.6, z }, 10))
    g.add(ball(0.7, c, { y: base + ridge + 2.7, z }, [1, 0.7, 1], [8, 6]))
  }
  // 烟囱 + 糖霜顶
  g.add(rbox(2.4, 5, 2.4, COOKIE_D, { x: 4.4, y: base + wall + 2, z: -3 }, 0.3))
  g.add(rbox(3, 0.8, 3, ICING, { x: 4.4, y: base + wall + 7, z: -3 }, 0.3))
  // 门：深色饼干门板 + 一圈糖霜 + 糖豆门把
  g.add(rbox(3.6, 5.4, 0.6, COOKIE_D, { y: base + 0.2, z: fz + 0.1 }, 1.2))
  g.add(noOutline(torus(1.8, 0.18, ICING, { y: base + 3.8, z: fz + 0.42 }, PI)))
  g.add(pip(0.3, candyA, 1, base + 2.6, fz + 0.5, [1, 1, 1], true))
  // 窗：透暖光的糖窗 + 白色糖霜窗框和十字
  const win = (x: number, y: number, z: number, ry: number) => {
    const wg = new THREE.Group()
    wg.add(lit(rbox(2.6, 2.6, 0.4, '#ffd86b', { y: -1.3 }, 0.2), '#ffd86b', 0.55))
    for (const s of [-1, 1]) {
      wg.add(box(3.2, 0.4, 0.5, ICING, { y: s * 1.4 - 0.2, z: 0.1 }))
      wg.add(box(0.4, 3.2, 0.5, ICING, { x: s * 1.4, y: -1.6, z: 0.1 }))
    }
    wg.add(box(0.3, 2.6, 0.5, ICING, { y: -1.3, z: 0.15 }))
    wg.add(box(2.6, 0.3, 0.5, ICING, { y: -0.15, z: 0.15 }))
    return P(wg, x, y, z, 0, ry, 0)
  }
  for (const s of [-1, 1]) g.add(win(s * 5.2, base + 5.2, fz + 0.1, 0))
  for (const s of [-1, 1]) g.add(win(s * (hw + 0.1), base + 5.2, -1, s * (PI / 2)))
  g.add(win(0, base + 5.2, -1 - d / 2 - 0.1, PI))
  // 墙角的薄荷糖、山墙上一颗心形糖
  for (const s of [-1, 1]) {
    g.add(P(cyl(1, 1, 0.5, '#ffffff', {}, 14), s * (hw - 1.4), base + 1.6, fz + 0.15, PI / 2))
    for (let q = 0; q < 3; q++) g.add(decalZ(0.35, 1.8, BERRY, s * (hw - 1.4), base + 1.6, fz + 0.46, (q / 3) * PI))
  }
  g.add(P(slabXY(heartPts(2.4), 0.5, candyA, 0.1, 'gb-heart'), 0, base + wall + 2.2, fz + 0.1))
  // 门旁的拐杖糖：红白相间的直杆 + 红色弯钩，贴墙立着
  const cx = 2.45
  const cz = fz + 0.4
  for (let q = 0; q < 8; q++) g.add(cyl(0.3, 0.3, 0.8, q % 2 ? BERRY : '#ffffff', { x: cx, y: base + q * 0.8, z: cz }, 8))
  g.add(torus(0.8, 0.3, BERRY, { x: cx - 0.8, y: base + 6.4, z: cz }, PI))
  // 屋前的石子小路（彩色糖片）和一个躺着的姜饼人
  ;([[0, 7.2], [0.6, 8.6]] as V2[]).forEach(([x, z], i) => g.add(cyl(0.9, 0.9, 0.3, i ? candyB : candyA, { x, y: base, z }, 12)))
  const man = P(slabXY(GB_MAN, 0.6, COOKIE, 0.15, 'gb-man'), -4, base + 0.25, 7.5, -PI / 2, 0, PI / 2)
  man.scale.set(0.7, 0.7, 1)
  g.add(man)
  for (const [x, y] of [
    [-0.5, 5.6],
    [0.5, 5.6],
    [0, 3.3],
    [0, 2.2],
  ]) {
    const v = new THREE.Vector3(x * 0.7, y * 0.7, 0.32).applyEuler(man.rotation).add(man.position)
    g.add(pip(0.22, ICING, v.x, v.y, v.z, [1, 0.6, 1], true))
  }
  return g
}

// ---------- 节日烛台组：九枝烛台（八根半圆弧枝杈一层套一层，正中的主烛高出一截，九支蜡烛都点着）+ 一只躺倒的四面陀螺和几枚金币 ----------

const MN = { yc: 21, step: 3.6, candleH: 6 }
const MN_FLAMES: V3[] = [
  ...[-4, -3, -2, -1, 1, 2, 3, 4].map((k): V3 => flameAt(k * MN.step, MN.yc + 0.6, 0, MN.candleH, 0.8)),
  flameAt(0, MN.yc + 4.1, 0, MN.candleH, 0.8),
]
function menorahSet(p: string[]) {
  const [metal, wax, dreidelC] = p
  const g = new THREE.Group()
  const { yc, step, candleH } = MN
  // 底座、主杆、四层半圆弧枝杈
  g.add(lathe([[0, 0], [6, 0], [6, 0.8], [4.5, 1.5], [2, 2.6], [1.2, 4], [0, 4]], metal, 28))
  g.add(cyl(0.75, 1, yc + 3.6 - 3.8, metal, { y: 3.8 }, 12))
  for (let k = 1; k <= 4; k++) g.add(torus(k * step, 0.42, metal, { y: yc, rz: PI }, PI))
  // 烛杯 + 蜡烛（主烛杯高出 3.5）
  const cupAt = (x: number, y: number) => {
    g.add(cyl(1.05, 0.65, 1.4, metal, { x, y: y - 0.6 }, 12))
    g.add(candle(0.45, candleH, wax, x, y + 0.6, 0, 0.8))
  }
  for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) cupAt(k * step, yc)
  cupAt(0, yc + 3.5)
  // 陀螺：方身 + 尖底（四棱锥）+ 柄，四面各一个金色的记号；侧躺在桌上
  const dr = new THREE.Group()
  dr.add(rbox(3, 3, 3, dreidelC, { y: 2 }, 0.4))
  dr.add(P(cyl(2.05, 0.15, 2.2, dreidelC, {}, 4), 0, 1.1, 0, 0, PI / 4, 0))
  dr.add(cyl(0.4, 0.4, 2, shade(dreidelC, -0.08), { y: 4.9 }, 8))
  dr.add(ball(0.5, shade(dreidelC, -0.08), { y: 6.9 }, undefined, [8, 6]))
  for (let k = 0; k < 4; k++) {
    const mark = new THREE.Group()
    mark.add(decalZ(1.4, 0.32, GOLD, 0, 3.9, 1.56))
    if (k !== 1) mark.add(decalZ(0.32, 1.6, GOLD, k === 3 ? 0 : 0.55, 3.2, 1.56))
    if (k >= 2) mark.add(decalZ(1.4, 0.32, GOLD, 0, 2.6, 1.56))
    mark.rotation.y = (k * PI) / 2
    dr.add(mark)
  }
  dr.rotation.z = -PI / 2
  const dw = G(dr)
  dw.rotation.y = 0.5
  g.add(restAt(dw, 11, 3.6))
  // 几枚金币
  ;([[6.6, 4.4, 0], [8.3, 5.8, 0], [15.8, 2.6, 0]] as V3[]).forEach(([x, z]) => g.add(cyl(1.2, 1.2, 0.32, GOLD, { x, z }, 12)))
  g.add(cyl(1.2, 1.2, 0.32, shade(GOLD, -0.06), { x: 6.9, y: 0.32, z: 4.6 }, 12))
  return g
}

// ---------- 复活节兔子与彩蛋：一只坐着的白瓷兔（长耳朵、圆尾巴），旁边一只方形草编篮（装着草和彩蛋、带提梁），地上散着几只彩条纹的蛋 ----------

/** 一只彩蛋：长轴沿局部 y，套几道彩色条带；(x, y, z) 是蛋心 */
function stripedEgg(r: number, body: string, stripe: string, x: number, y: number, z: number, n = 2) {
  const g = new THREE.Group()
  const ly = r * 1.32
  g.add(ball(r, body, {}, [1, 1.32, 1], [12, 8]))
  const ts = n === 3 ? [-0.45, 0, 0.45] : [-0.3, 0.3]
  ts.forEach((t, i) => {
    const yy = t * ly
    const rr = r * Math.sqrt(1 - t * t) + 0.02
    g.add(noOutline(band(rr, 0.24, i % 2 && n === 3 ? '#ffffff' : stripe, { y: yy, rx: PI / 2 }, PI * 2, 12)))
  })
  return P(g, x, y, z)
}
function easterBunny(p: string[]) {
  const [ceramic, eggA, eggB, basket] = p
  const g = new THREE.Group()
  // 草编篮：方形空心篮 + 横向编条 + 卷边 + 提梁 + 里面的草和蛋
  const bw = 13
  const bd = 10
  const bh = 7
  const bx = -8.5
  const bz = -1.5
  const bk = new THREE.Group()
  bk.add(rbox(bw, 0.7, bd, basket, {}, 0.3))
  for (const s of [-1, 1]) {
    bk.add(rbox(bw, bh, 0.7, basket, { z: s * (bd / 2 - 0.35) }, 0.3))
    bk.add(rbox(0.7, bh, bd - 1.4, basket, { x: s * (bw / 2 - 0.35) }, 0.3))
  }
  for (const y of [1.6, 3.6, 5.6]) {
    for (const s of [-1, 1]) {
      bk.add(box(bw - 0.6, 0.9, 0.3, shade(basket, -0.14), { y, z: s * (bd / 2 + 0.15) }))
      bk.add(box(0.3, 0.9, bd - 0.6, shade(basket, -0.14), { x: s * (bw / 2 + 0.15), y }))
    }
  }
  for (const s of [-1, 1]) {
    bk.add(rod3([-bw / 2, bh, s * (bd / 2 - 0.35)], [bw / 2, bh, s * (bd / 2 - 0.35)], 0.55, shade(basket, 0.06), 8))
    bk.add(rod3([s * (bw / 2 - 0.35), bh, -bd / 2], [s * (bw / 2 - 0.35), bh, bd / 2], 0.55, shade(basket, 0.06), 8))
  }
  bk.add(tube([[-bw / 2 + 0.4, bh, 0], [-bw / 2 + 1.2, bh + 6, 0], [0, bh + 8.2, 0], [bw / 2 - 1.2, bh + 6, 0], [bw / 2 - 0.4, bh, 0]], 0.5, shade(basket, 0.06), { seg: 32, radial: 6 }))
  bk.add(rbox(bw - 1.6, 1, bd - 1.6, '#8fcf7a', { y: 4.6 }, 0.4))
  const rand = rng(4)
  for (let i = 0; i < 16; i++) {
    const x = (rand() - 0.5) * (bw - 2.6)
    const z = (rand() - 0.5) * (bd - 2.6)
    bk.add(P(ball(1, i % 2 ? '#7cc47a' : '#9fd88a', {}, [0.25, 1.4, 0.25], [6, 4]), x, 5.9, z, (rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.8))
  }
  bk.add(stripedEgg(1.8, eggA, eggB, -3, 6.6, 0.5))
  bk.add(P(stripedEgg(1.7, C.lemon, eggA, 1.2, 6.4, -1.2, 3), 1.2, 6.4, -1.2, 0.3, 0, -0.3))
  bk.add(P(stripedEgg(1.7, eggB, '#ffffff', 3.8, 6.4, 1.6), 3.8, 6.4, 1.6, -0.2, 0, 0.35))
  g.add(P(bk, bx, 0, bz, 0, 0.18, 0))
  // 陶瓷兔：圆身子、后腿、前爪、圆脑袋、两只长耳（粉色内耳）、尾巴、脸
  const bn = new THREE.Group()
  bn.add(ball(5, ceramic, { y: 4.8 }, [1, 0.95, 1.1]))
  for (const s of [-1, 1]) {
    bn.add(ball(2.2, ceramic, { x: s * 3.4, y: 1.6, z: 2 }, [0.75, 0.62, 1.45], [12, 8]))
    bn.add(ball(1.1, ceramic, { x: s * 1.4, y: 1.1, z: 4.6 }, [1, 0.9, 1.3]))
  }
  bn.add(ball(3.6, ceramic, { y: 11.5, z: 1.5 }))
  for (const s of [-1, 1]) {
    const ear = P(G(ball(1.2, ceramic, {}, [1, 3.4, 0.5]), noOutline(ball(0.75, '#ffc2cf', { z: 0.32 }, [0.95, 3.6, 0.42]))), s * 1.4, 17, 0.8, -0.12, 0, s * -0.2)
    bn.add(ear)
  }
  bn.add(ball(1.4, ceramic, { y: 4, z: -5.4 }, undefined, [10, 8]))
  bn.add(face(3.4, { y: 11.8, z: 5 }))
  bn.add(noOutline(ball(0.38, '#ff9db0', { y: 11, z: 5.08 }, [1.2, 0.8, 0.6], [8, 6])))
  g.add(P(bn, 8.5, 0, 1.5, 0, -0.35, 0))
  // 地上散落的彩蛋（侧躺）
  ;([[-1, 8.5, 0.4, eggA, eggB, 2], [3, 9.2, -0.5, eggB, C.lemon, 3], [12.2, 8.9, 0.6, C.lilac, eggA, 2], [-12.5, 7, 2.2, C.mint, eggB, 3]] as [number, number, number, string, string, number][]).forEach(([x, z, ry, a, b, n]) => {
    const e = stripedEgg(2, a, b, 0, 0, 0, n)
    e.rotation.z = PI / 2
    const w2 = G(e)
    w2.rotation.y = ry
    g.add(restAt(w2, x, z))
  })
  return fitGroup(g)
}

// ---------- 派对饮料台：白色折叠小桌，桌上一只带龙头的玻璃饮料桶（铁丝架托着、里面是柠檬水和柠檬片），一摞纸杯和一罐彩色吸管 ----------

const PD = { w: 78, d: 44, h: 74 }
/** 一片柠檬：黄色果皮圈 + 浅色果肉 + 几道白色瓣线，(x, y, z) 为中心，rx / rz 是倾角 */
function lemonSlice(x: number, y: number, z: number, rx: number, rz: number) {
  const g = new THREE.Group()
  g.add(cyl(2.4, 2.4, 0.45, LEMON_IN, { y: -0.22 }, 16))
  g.add(noOutline(band(2.45, 0.28, LEMON, { rx: PI / 2 }, PI * 2, 16)))
  for (let k = 0; k < 4; k++) g.add(noOutline(box(4.2, 0.1, 0.18, '#ffffff', { y: 0.2, ry: (k / 4) * PI })))
  return P(g, x, y, z, rx, 0, rz)
}
function partyDrinks(p: string[]) {
  const [topC, cupC, strawC, metal] = p
  const g = new THREE.Group()
  const { w, d, h } = PD
  // 折叠桌：桌面、两头各一对钢管腿（上下横撑 + 一根斜拉撑到桌底）、橡胶脚套
  g.add(rbox(w, 3, d, topC, { y: h - 3 }, 1))
  g.add(rbox(w - 6, 2.4, 1.6, shade(topC, -0.1), { y: h - 5.4, z: d / 2 - 3 }, 0.4))
  g.add(rbox(w - 6, 2.4, 1.6, shade(topC, -0.1), { y: h - 5.4, z: -d / 2 + 3 }, 0.4))
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 6)
    for (const sz of [-1, 1]) {
      g.add(rod3([x, 1, sz * 17], [x, h - 3, sz * 17], 1.2, metal, 10))
      g.add(cyl(1.6, 1.6, 1.2, RUBBER, { x, z: sz * 17 }, 12))
    }
    g.add(rod3([x, 12, -17], [x, 12, 17], 0.9, metal, 8))
    g.add(rod3([x, h - 6, -17], [x, h - 6, 17], 0.9, metal, 8))
    g.add(rod3([x, 12, 0], [s * 16, h - 3, 0], 0.8, metal, 8))
  }
  const top = h
  // 饮料桶：铁丝托架（上下两道圈 + 四根立柱）、玻璃桶、柠檬水、柠檬片、冰块、盖子、龙头
  const dx = -15
  const dz = 3
  const jy = top + 8
  g.add(band(10, 0.5, metal, { x: dx, y: top + 0.45, z: dz, rx: PI / 2 }, PI * 2, 32))
  g.add(band(10, 0.5, metal, { x: dx, y: jy - 0.45, z: dz, rx: PI / 2 }, PI * 2, 32))
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2
    g.add(rod3([dx + Math.cos(a) * 10, top + 0.45, dz + Math.sin(a) * 10], [dx + Math.cos(a) * 10, jy - 0.45, dz + Math.sin(a) * 10], 0.4, metal, 6))
  }
  g.add(P(ghost(cup(10.5, 10.5, 22, 0.5, GLASS), GLASS, 0.25), dx, jy, dz))
  g.add(ghost(cyl(9.85, 9.85, 15, LEMONADE, { x: dx, y: jy + 0.55, z: dz }, 32), LEMONADE, 0.5))
  ;([[-4, 6, 2, 0.5, 0.2], [3.5, 9.5, -3, -0.3, 1.2], [-1, 12.5, 4.2, 1.3, -0.2], [4, 3.6, 4, 0.2, 0.7], [-5, 13.2, -3.6, -0.9, 0.4]] as [number, number, number, number, number][]).forEach(([x, y, z, rx, rz]) =>
    g.add(lemonSlice(dx + x, jy + y, dz + z, rx, rz)),
  )
  for (const [x, z, ry] of [
    [2, 1, 0.4],
    [-2.5, -2, 1.1],
  ])
    g.add(ghost(rbox(2.6, 2.6, 2.6, '#f4fbff', { x: dx + x, y: jy + 14.2, z: dz + z, ry }, 0.4), '#f4fbff', 0.6))
  g.add(cyl(10.8, 10.8, 1.2, metal, { x: dx, y: jy + 22, z: dz }, 32))
  g.add(ball(1.4, metal, { x: dx, y: jy + 24.2, z: dz }, [1, 0.7, 1]))
  const tz = dz + 10.5
  g.add(cylZ(1, 4, metal, dx, jy + 2.5, tz + 0.5, 14))
  g.add(cyl(0.7, 0.6, 2.4, metal, { x: dx, y: jy + 0.3, z: tz + 2 }, 10))
  g.add(rbox(1, 3.6, 0.9, metal, { x: dx, y: jy + 3, z: tz + 2.2 }, 0.3))
  // 一摞纸杯：最下面一只完整，往上每只露出一圈杯口
  const cx = 9
  const cz = -6
  g.add(cyl(4, 2.8, 7, cupC, { x: cx, y: top, z: cz }, 20))
  for (let k = 1; k <= 7; k++) g.add(cyl(4, 3.83, 1.2, cupC, { x: cx, y: top + 7 + (k - 1) * 1.2 - 0.2, z: cz }, 20))
  for (let k = 0; k <= 7; k++) g.add(noOutline(band(4.02, 0.16, '#ffffff', { x: cx, y: top + 7 + k * 1.2 - 0.1, z: cz, rx: PI / 2 }, PI * 2, 20)))
  g.add(cup(4, 2.8, 1.4, 0.2, cupC, { x: cx, y: top + 7 + 6 * 1.2 - 0.3, z: cz }))
  // 吸管罐：玻璃罐 + 一把散开的彩色吸管
  const sx = 23
  const sz = 6
  g.add(P(ghost(cup(3.4, 3.2, 10, 0.35, GLASS), GLASS, 0.3), sx, top, sz))
  const straws = [strawC, '#ffffff', shade(strawC, 0.15), cupC]
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2
    const b: V3 = [sx + Math.cos(a) * 1.2, top + 0.5, sz + Math.sin(a) * 1.2]
    const dir = new THREE.Vector3(Math.cos(a) * 0.2, 1, Math.sin(a) * 0.2).normalize()
    const len = 17 + (k % 3)
    g.add(rod3(b, [b[0] + dir.x * len, b[1] + dir.y * len, b[2] + dir.z * len], 0.3, straws[k % 4], 6))
  }
  return fitGroup(g)
}

// ---------- 彩带礼炮与派对小物：一支刚放过的礼花筒立着、彩带从筒口喷出来落了一桌，一支没放的躺着，一只派对喇叭，桌上撒满彩纸屑 ----------

function confettiCannon(p: string[]) {
  const [canA, canB, horn, acc] = p
  const g = new THREE.Group()
  // 放过的礼花筒：拧柄底座 + 空心筒身 + 彩条，筒口朝上
  const ax = -6
  const az = -2
  g.add(cyl(1.9, 1.9, 2.6, shade(canA, -0.18), { x: ax, z: az }, 16))
  for (const y of [0.7, 1.4, 2.1]) g.add(noOutline(band(1.92, 0.18, shade(canA, -0.3), { x: ax, y, z: az, rx: PI / 2 }, PI * 2, 16)))
  // 空心筒身：薄壁直筒，16 段车削就够（cup 固定 32 段、口沿半圆 6 步，这么细的筒看不出来）
  g.add(P(lathe([[0, 0], [2.4, 0], [2.4, 8.5], [2.15, 8.5], [2.15, 0.25], [0, 0.25]], canA, 16), ax, 2.4, az))
  for (const y of [4.6, 7.6]) g.add(noOutline(band(2.42, 0.26, acc, { x: ax, y, z: az, rx: PI / 2 }, PI * 2, 16)))
  // 彩带：从筒里窜出来、在空中拱一下再落到桌上打卷
  const cols = [horn, acc, canB, '#ffffff', horn, acc]
  for (let i = 0; i < 6; i++) {
    const a = -PI * 0.15 + (i / 5) * PI * 1.3
    const ca = Math.cos(a)
    const sa = Math.sin(a) * 0.6
    const L = 9 + (i % 3) * 1.6
    const pts: V3[] = [
      [ax + ca * 0.6, 9.5, az + sa * 0.6],
      [ax + ca * 2, 12.4, az + sa * 2],
      [ax + ca * L * 0.45, 13.3 - (i % 2) * 0.8, az + sa * L * 0.45],
      [ax + ca * L * 0.75, 9, az + sa * L * 0.75 + 0.8],
      [ax + ca * L * 0.85, 4, az + sa * L * 0.85 - 0.6],
      [ax + ca * L, 0.6, az + sa * L],
      [ax + ca * (L + 1.6), 1.2, az + sa * (L + 1.6) + 1],
      [ax + ca * (L + 2.2), 0.25, az + sa * (L + 2.2) - 0.4],
    ]
    g.add(tube(pts, 0.22, cols[i], { seg: 32, radial: 4 }))
  }
  // 没放的礼花筒：躺着，筒口有一张纸封
  const bx = 7
  const bz = 5
  const can2 = new THREE.Group()
  can2.add(cylX(2.3, 10, canB, 0, 2.3, 0, 20))
  can2.add(cylX(1.8, 2.6, shade(canB, -0.18), -6.3, 2.3, 0, 16))
  for (const x of [-6.9, -6.2, -5.5]) can2.add(noOutline(band(1.82, 0.18, shade(canB, -0.3), { x, y: 2.3, ry: PI / 2 }, PI * 2, 16)))
  can2.add(cylX(2.35, 0.3, '#fbf7f1', 5.1, 2.3, 0, 20))
  for (const x of [-2.5, 1.5]) can2.add(noOutline(band(2.32, 0.26, acc, { x, y: 2.3, ry: PI / 2 }, PI * 2, 20)))
  g.add(P(can2, bx, 0, bz, 0, -0.35, 0))
  // 派对喇叭：吹嘴 + 渐粗的喇叭身 + 喇叭口，侧躺在桌上（母线贴桌面）
  const hn = new THREE.Group()
  hn.add(cyl(2.3, 0.45, 12, horn, { y: 0 }, 16))
  hn.add(cyl(0.5, 0.5, 2, '#fbf7f1', { y: -2 }, 8))
  hn.add(band(2.3, 0.3, acc, { y: 12, rx: PI / 2 }, PI * 2, 16))
  for (const y of [3.5, 7.5]) hn.add(noOutline(band(0.45 + (1.85 * y) / 12 + 0.05, 0.2, acc, { y, rx: PI / 2 }, PI * 2, 16)))
  const al = Math.atan((2.3 - 0.45) / 12)
  hn.rotation.z = -(PI / 2 - al)
  const hw = G(hn)
  hw.rotation.y = 0.25
  g.add(restAt(hw, 1, -6.5))
  // 彩纸屑
  const rand = rng(14)
  const bits = [canA, canB, horn, acc, '#ffffff']
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 24
    const z = (rand() - 0.5) * 16
    g.add(cyl(0.5, 0.5, 0.12, bits[i % 5], { x, z, ry: rand() * PI }, 4))
  }
  return fitGroup(g)
}

// ---------- 壁炉台装饰组：一条打着三个弯的松枝花环（红果、松果、发光小灯、四个红蝴蝶结），下面三只挂在铜钩上的圣诞袜（白绒袜口、不同花样） ----------

/** 圣诞袜轮廓：袜口在 y = 0，袜尖朝 +x */
const SOCK = (() => {
  const s = new THREE.Shape()
  s.moveTo(-5.5, 0)
  s.lineTo(5.5, 0)
  s.lineTo(5.5, -24)
  s.quadraticCurveTo(6, -27, 10, -27.2)
  s.quadraticCurveTo(14.5, -27.5, 14.5, -31.5)
  s.quadraticCurveTo(14.5, -36, 9.5, -36)
  s.lineTo(0, -36)
  s.quadraticCurveTo(-6, -36, -5.5, -29)
  s.lineTo(-5.5, 0)
  return s
})()
const SOCK_TOE = (() => {
  const s = new THREE.Shape()
  s.moveTo(9.2, -28)
  s.quadraticCurveTo(13.5, -28.4, 13.5, -31.5)
  s.quadraticCurveTo(13.5, -35, 9.5, -35)
  s.quadraticCurveTo(7.6, -31.5, 9.2, -28)
  return s
})()
const SOCK_HEEL = (() => {
  const s = new THREE.Shape()
  s.moveTo(-4.6, -29.5)
  s.quadraticCurveTo(-4.6, -35, 0.5, -35)
  s.quadraticCurveTo(-0.6, -31, -4.6, -29.5)
  return s
})()
const SOCK_T = 4
/** 一只圣诞袜：鼓鼓的袜身、袜尖 / 袜跟补色、腿上的花样（0 横条、1 星星、2 圆点）、白绒袜口、挂绳圈；原点在袜口中心 */
function stocking(body: string, patch: string, pattern: number) {
  const g = new THREE.Group()
  g.add(slabXY(SOCK, SOCK_T, body, 0.9, 'sock', 6))
  const fz = SOCK_T / 2 + 0.1
  g.add(P(slabXY(SOCK_TOE, 0.4, patch, 0, 'sock-toe', 6), 0, 0, fz))
  g.add(P(slabXY(SOCK_HEEL, 0.4, patch, 0, 'sock-heel', 6), 0, 0, fz))
  if (pattern === 0) for (const y of [-11, -15, -19]) g.add(box(9, 1.5, 0.4, patch, { y, z: fz }))
  else if (pattern === 1) g.add(P(slabXY(starPts(3.4), 0.4, patch, 0, 'sock-star'), 0.2, -15, fz))
  else
    for (const [x, y] of [
      [-2.4, -10.5],
      [2.2, -12.5],
      [-1.8, -16],
      [2.6, -19],
      [-2.6, -21.5],
      [0.6, -22.8],
    ])
      g.add(ball(0.8, patch, { x, y, z: fz - 0.25 }, [1, 1, 0.45], [6, 4]))
  // 白绒袜口：一条胖胖的圆角块，上沿一排绒球让它看起来毛茸茸
  g.add(rbox(13.4, 6.8, 5.2, SNOW, { y: -6 }, 2.2))
  for (let k = 0; k < 6; k++) g.add(pip(1.15, SNOW, -5.6 + k * 2.24, 0.75, (k % 2) * 0.6 - 0.3, [1, 1, 1], true))
  g.add(band(1.25, 0.26, SNOW, { y: 1.6 }, PI * 2, 12))
  return g
}
function fireplaceStockings(p: string[]) {
  const [sA, sB, sC, metal] = p
  const g = new THREE.Group()
  // 花环：四个挂点（铜钉）之间垂成三道弯
  const xs = [-58, -19.3, 19.3, 58]
  const yTop = 56
  const sag = 6
  const gz = 4.4
  const path: V3[] = []
  for (let i = 0; i < 3; i++)
    for (let k = i ? 1 : 0; k <= 12; k++) {
      const x = xs[i] + ((xs[i + 1] - xs[i]) * k) / 12
      path.push([x, yTop - sag * Math.sin((PI * k) / 12), gz])
    }
  g.add(tube(path, 2.2, PINE, { seg: 48, radial: 6 }))
  for (const x of xs) g.add(cylZ(0.45, gz, metal, x, yTop, gz / 2, 8))
  // 针叶束：沿花环每隔一段往四周支出几簇（朝前、上下，不往墙里扎）
  const rand = rng(31)
  for (let i = 0; i < path.length; i++) {
    const [x, y, z] = path[i]
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI * 2 + i * 0.7 + rand() * 0.5
      const dir = new THREE.Vector3((rand() - 0.5) * 0.8, Math.cos(a), Math.max(-0.15, Math.sin(a))).normalize()
      const m = aim(ball(1, k % 2 ? PINE : PINE_L, {}, [0.38, 2.6, 0.38], [4, 3]), dir)
      m.position.set(x + dir.x * 2.4, y + dir.y * 2.4, z + dir.z * 2.4)
      g.add(m)
    }
  }
  // 小灯串：一根细线沿花环前面绕，挂一串暖色发光小灯
  const wire: V3[] = path.map(([x, y], i) => [x, y + Math.sin(i * 1.3) * 1.2, gz + 2.3])
  g.add(tube(wire, 0.12, '#2d4a33', { seg: 60, radial: 3 }))
  const bulbs = ['#fff2b8', '#ffc46b', '#ff8f86', '#fff2b8']
  for (let i = 1; i < wire.length - 1; i += 2) {
    const [x, y, z] = wire[i]
    g.add(lit(ball(0.6, bulbs[(i >> 1) % 4], { x, y: y - 0.6, z: z + 0.2 }, [1, 1.3, 1], [6, 4]), bulbs[(i >> 1) % 4], 0.9))
  }
  // 红果（三颗一簇）和松果
  for (let i = 2; i < path.length - 1; i += 3) {
    const [x, y] = path[i]
    for (let k = 0; k < 3; k++) g.add(pip(0.75, BERRY, x + (k - 1) * 1.1, y + 1.6 + (k % 2) * 0.9, gz + 2.6, [1, 1, 1], true))
  }
  for (let i = 0; i < 3; i++) {
    const x = (xs[i] + xs[i + 1]) / 2
    g.add(ball(1.6, '#8a5a3a', { x: x + 2.2, y: yTop - sag - 2.2, z: gz + 1.8 }, [1, 1.35, 1], [8, 6]))
  }
  for (const x of xs) g.add(bow(sA, x, yTop + 0.4, gz + 2.6, 0.75))
  // 三只袜子：铜钩（从墙里伸出来、末端上翘）挂着袜口上的绳圈
  const hookY = 40
  ;([[-38, sA, sC, 0], [0, sB, sA, 1], [38, sC, sB, 2]] as [number, string, string, number][]).forEach(([x, body, patch, pat]) => {
    g.add(cylZ(0.3, 5.2, metal, x, hookY, 2.6, 8))
    g.add(cyl(0.3, 0.3, 1.4, metal, { x, y: hookY, z: 5.1 }, 8))
    g.add(cyl(0.9, 0.9, 0.4, metal, { x, y: hookY, z: 0.2, rx: PI / 2 }, 12))
    const s = stocking(body, patch, pat)
    s.position.set(x, hookY - 2.88, 2.7)
    g.add(s)
  })
  return fitWall(g, 100, 9.4)
}

// ---------- 配色 ----------

const PORCH_PALS: Pal[] = [
  ['farmhouse', ['#e8822e', '#f1ece2', F.barn]],
  ['retro', [R.orange, '#efa03c', R.caramel]],
  ['classic', ['#e07a2c', '#c9cdb5', CL.wine]],
  ['cute', ['#ffa64d', '#ffd08a', C.lilac]],
  ['nordic', ['#e89a52', N.white, N.sage]],
]
const SKULL_PALS: Pal[] = [
  ['retro', ['#3a3237', R.orange, '#6a4a8a']],
  ['classic', ['#35303a', '#e27a2c', '#7a3a8a']],
  ['modern', [M.char, '#f08a24', '#8a8d93']],
  ['cute', ['#5a4a66', C.orange, '#9b7fd0']],
  ['farmhouse', [F.iron, '#d9772e', '#6b5f7a']],
]
const TG_PALS: Pal[] = [
  ['farmhouse', [F.oak, F.white, F.butter]],
  ['classic', [CL.walnut, CL.ivory, CL.wine]],
  ['nordic', [N.oak, N.white, N.linen]],
  ['retro', [R.caramel, R.cream, R.mustard]],
]
const VAL_PALS: Pal[] = [
  ['classic', ['#c8283a', '#f1e4d0', '#b8283a', '#f6d6dc']],
  ['cute', ['#ff6f91', C.white, C.pink, C.sakura]],
  ['modern', ['#b01e34', M.char, '#2f2b30', M.light]],
  ['retro', [R.red, '#d9b98c', R.red, R.cream]],
  ['nordic', ['#d64a5a', N.linen, '#e9a7b2', N.white]],
]
const CHAMP_PALS: Pal[] = [
  ['classic', [CL.gold, CL.gold, CL.ivory]],
  ['modern', [M.silver, '#2f3036', M.white]],
  ['retro', [R.mustard, R.red, R.cream]],
  ['nordic', [N.white, N.mustard, N.linen]],
]
const BD_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.lemon, C.white]],
  ['cute', [C.mint, C.lilac, C.peach, C.white]],
  ['modern', [M.white, '#3f7fd8', '#f2c230', M.light]],
  ['retro', [R.cream, R.teal, R.orange, R.mustard]],
  ['classic', [CL.ivory, CL.wine, CL.gold, CL.cream]],
]
const ARCH_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.lemon, C.white, C.white]],
  ['modern', ['#d9c39a', M.white, M.silver, '#e8b4b8', M.light]],
  ['retro', [R.orange, R.mustard, R.teal, R.cream, R.caramel]],
  ['classic', [CL.gold, CL.ivory, '#e8c4c4', CL.blue, CL.walnut]],
  ['nordic', [N.sage, N.white, N.blue, N.oakL, N.white]],
]
const ADVENT_PALS: Pal[] = [
  ['farmhouse', [F.oak, F.barn, F.sage, F.white]],
  ['nordic', [N.oakL, '#c8473a', N.sage, N.white]],
  ['classic', [CL.walnut, CL.wine, '#5f7a5a', CL.cream]],
  ['cute', [C.woodL, C.red, C.mint, C.lemon]],
]
const NUT_PALS: Pal[] = [
  ['classic', ['#b8283a', '#f4ede0', '#2f2b38', CL.gold]],
  ['retro', [R.red, R.cream, '#2c3e6b', R.mustard]],
  ['farmhouse', [F.navy, F.white, F.barn, F.butter]],
  ['cute', [C.red, C.white, C.sky, C.lemon]],
  ['modern', ['#2e6b4f', M.white, '#2f3036', '#d9b45a']],
]
const GB_PALS: Pal[] = [
  ['cute', [C.pink, C.mint, C.white]],
  ['classic', [CL.wine, '#5f8a5a', CL.ivory]],
  ['retro', [R.red, R.teal, R.cream]],
  ['nordic', ['#d6494a', N.sage, N.white]],
]
const MN_PALS: Pal[] = [
  ['classic', [CL.gold, CL.ivory, CL.blue]],
  ['modern', [M.silver, M.white, '#3f6fb5']],
  ['nordic', [BRASS, '#9fb4c7', N.white]],
  ['retro', ['#c9a25a', R.cream, R.teal]],
]
const EASTER_PALS: Pal[] = [
  ['cute', [C.white, C.pink, C.sky, C.woodL]],
  ['nordic', [N.white, N.sage, N.mustard, N.oak]],
  ['farmhouse', [F.white, F.sage, F.butter, F.oak]],
  ['cute', [C.sakura, C.lemon, C.lilac, C.wood]],
  ['classic', [CL.ivory, CL.blue, '#e8c4c4', CL.walnut]],
]
const DRINK_PALS: Pal[] = [
  ['modern', [M.white, '#e8483f', '#3f7fd8', M.silver]],
  ['cute', [C.white, C.pink, C.mint, C.steel]],
  ['retro', [R.cream, R.red, R.teal, R.mustard]],
  ['farmhouse', [F.oak, F.navy, F.barn, F.iron]],
  ['nordic', [N.oak, N.blue, N.mustard, N.white]],
]
const POP_PALS: Pal[] = [
  ['cute', [C.pink, C.sky, C.lemon, C.mint]],
  ['modern', ['#2f3036', '#d9b45a', M.white, '#e8483f']],
  ['retro', [R.teal, R.orange, R.mustard, R.red]],
  ['classic', [CL.navy, CL.gold, CL.ivory, CL.wine]],
]
const SOCK_PALS: Pal[] = [
  ['classic', ['#b8283a', '#2f6b45', CL.ivory, CL.gold]],
  ['farmhouse', [F.barn, F.navy, '#c9b79a', F.iron]],
  ['nordic', ['#c8473a', N.gray, N.white, N.oak]],
  ['cute', [C.red, C.mint, C.lilac, C.lemon]],
  ['retro', [R.red, R.teal, R.mustard, R.caramel]],
]

// 带火苗的：建模后居中落地，火苗跟着平移
const TG_BUILD = withFlames('fw-thanksgiving-table', thanksgivingTable, TG_PALS, TG_CANDLES.map(([x, z, h]) => flameAt(x, TG.t + 0.9, z, h)), 0.45)
const BD_BUILD = withFlames('fw-birthday-table', birthdayTable, BD_PALS, [BD_FLAME], 0.3)
const MN_BUILD = withFlames('fw-menorah-set', menorahSet, MN_PALS, MN_FLAMES, 0.3)

export const FESTIVE_WEST: AssetDef[] = [
  define('fw-halloween-porch', '万圣节玄关组', 'deco', [64.3, 40.2, 70.5], PORCH_PALS, halloweenPorch, { type: 'decor', tags: ['own-colors'], mats: ['plant', 'plant', 'fabric'] }),
  define('fw-skeleton-wreath', '万圣节骷髅花环', 'deco', [41, 9, 40], SKULL_PALS, skeletonWreath, { type: 'decor', mount: 150, mats: ['wood', 'fabric', 'paper'] }),
  define('fw-thanksgiving-table', '感恩节餐桌中心', 'tabletop', [58, 26, 19], TG_PALS, TG_BUILD.build, { ...PROP, type: 'food', tags: ['own-colors'], mats: ['wood', 'ceramic', 'paint'], fx: TG_BUILD.fx }),
  define('fw-valentine-set', '情人节玫瑰礼盒组', 'tabletop', [36.7, 25.2, 26.4], VAL_PALS, valentineSet, { ...PROP, type: 'decor', mats: ['plant', 'paper', 'paper', 'paper'] }),
  define('fw-champagne-tower', '香槟塔', 'tabletop', [46, 38.2, 29.5], CHAMP_PALS, champagneTower, { ...PROP, type: 'drink', mats: ['metal', 'metal', 'paper'] }),
  define('fw-birthday-table', '生日派对桌面组', 'tabletop', [44.6, 35.9, 20], BD_PALS, BD_BUILD.build, { ...PROP, type: 'food', tags: ['own-colors'], mats: ['paint', 'paper', 'paper', 'paper'], fx: BD_BUILD.fx }),
  define('fw-balloon-arch', '气球拱门', 'deco', [201.4, 44.2, 195.3], ARCH_PALS, balloonArch, { type: 'decor', mats: ['plastic', 'plastic', 'plastic', 'plastic', 'plastic'] }),
  define('fw-advent-calendar', '圣诞倒数日历', 'deco', [43.6, 11.6, 46.8], ADVENT_PALS, adventCalendar, { type: 'decor', mount: 120, mats: ['wood', 'paint', 'paint', 'paint'] }),
  define('fw-nutcracker', '胡桃夹子士兵', 'deco', [18.2, 18.2, 47.3], NUT_PALS, nutcracker, { type: 'decor', mats: ['paint', 'paint', 'paint', 'metal'] }),
  define('fw-gingerbread-house', '姜饼屋', 'tabletop', [24, 20, 19.4], GB_PALS, gingerbreadHouse, { ...PROP, type: 'food', tags: ['own-colors'], mats: ['paint', 'paint', 'paper'] }),
  define('fw-menorah-set', '九枝烛台与陀螺', 'tabletop', [33.1, 13, 32.6], MN_PALS, MN_BUILD.build, { ...PROP, type: 'decor', mats: ['metal', 'paint', 'wood'], fx: MN_BUILD.fx }),
  define('fw-easter-bunny', '复活节兔子与彩蛋', 'tabletop', [30.9, 19.4, 21], EASTER_PALS, easterBunny, { ...PROP, type: 'decor', mats: ['ceramic', 'paint', 'paint', 'wood'] }),
  define('fw-party-drinks', '派对饮料台', 'dining', [78, 44, 107.2], DRINK_PALS, partyDrinks, { type: 'drink', mats: ['plastic', 'paper', 'plastic', 'metal'] }),
  define('fw-confetti-cannon', '彩带礼炮与派对喇叭', 'tabletop', [32.4, 21, 13.9], POP_PALS, confettiCannon, { ...PROP, type: 'toy', mats: ['paper', 'paper', 'paper', 'paper'] }),
  define('fw-fireplace-stockings', '壁炉台圣诞袜花环', 'deco', [123.7, 9.4, 59.8], SOCK_PALS, fireplaceStockings, { type: 'decor', mount: 100, mats: ['fabric', 'fabric', 'fabric', 'metal'] }),
]
