// 和风补充：围炉里、七轮、臼和杵、茶道具、风炉釜、文机、长火钵、缘台、和伞、盆提灯、熊手、汤婆子、流水素面机。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z；能摆东西的声明 surface / surfaceShape；type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, cup, cyl, markWater, rbox, shade, torus } from '../toon'
import { rectPoly, shell, type AssetDef, type Fx } from '../kit'
import { G, P, PI, cylZ, fitGroup, fitWall, ghost, latheAt, lit, litOutlined, noOutline, rod3, tube, type V2 } from '../geo'
import { CN, J, N, PROP, define, type Pal } from '../packkit'

const ASH = '#d9d5cc'
const CHARCOAL = '#2f2b2a'
const EMBER = '#ff7a3a'
const IRON = '#3a3837'
const BAMBOO = '#c9b06a'
const BAMBOO_G = '#9db36a'
const WATER = '#cfeaf5'

/** 一小堆炭火：几段黑炭 + 嵌在缝里的发光炭芯，堆在 (x, y, z)（y 是灰面高度） */
function embers(x: number, y: number, z: number, s = 1) {
  const g = new THREE.Group()
  const bits: [number, number, number, number][] = [
    [-3, 0, 0.4, 0.3],
    [2.6, 1.2, -0.5, -0.8],
    [0, -3, 1.2, 1.4],
    [0.4, 2.8, 0.2, 2.2],
  ]
  for (const [dx, dz, ry, lift] of bits) g.add(P(rbox(6 * s, 2.4 * s, 2.6 * s, CHARCOAL, {}, 0.8 * s), dx * s, 1.2 * s + lift * 0.4 * s, dz * s, 0, ry))
  g.add(lit(ball(2.4 * s, EMBER, { y: 1.6 * s }, [1.2, 0.6, 1.2]), EMBER, 0.9))
  g.position.set(x, y, z)
  return g
}

/** 铁壶：扁圆壶身 + 盖和盖钮 + 壶嘴 + 提梁；壶底在 (x, y, z)，r 是壶身最大半径，壶嘴朝 +x */
function tetsubin(x: number, y: number, z: number, r: number, color = IRON) {
  const g = new THREE.Group()
  const body: V2[] = [
    [r * 0.55, 0],
    [r * 0.9, r * 0.18],
    [r, r * 0.55],
    [r * 0.88, r * 0.95],
    [r * 0.55, r * 1.15],
    [r * 0.45, r * 1.2],
  ]
  g.add(latheAt(body, color, {}, 20))
  g.add(cyl(r * 0.46, r * 0.5, r * 0.12, shade(color, 0.08), { y: r * 1.18 }, 16))
  g.add(ball(r * 0.14, shade(color, 0.12), { y: r * 1.4 }))
  g.add(rod3([r * 0.85, r * 0.6, 0], [r * 1.35, r * 1.0, 0], r * 0.11, color, 8))
  g.add(
    tube(
      [
        [0, r * 1.0, -r * 0.7],
        [0, r * 1.75, -r * 0.5],
        [0, r * 2.0, 0],
        [0, r * 1.75, r * 0.5],
        [0, r * 1.0, r * 0.7],
      ],
      r * 0.07,
      shade(color, 0.1),
      { seg: 14, radial: 6 },
    ),
  )
  g.position.set(x, y, z)
  return g
}

/** 五德（铁三脚圈）：一只圆环 + 三条插进灰里的爪，圈顶在 y + h */
function gotoku(x: number, y: number, z: number, r: number, h: number) {
  const g = new THREE.Group()
  g.add(P(torus(r, 0.5, IRON, {}, PI * 2), 0, h, 0, PI / 2))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.4
    g.add(rod3([Math.cos(a) * r, h, Math.sin(a) * r], [Math.cos(a) * r * 1.1, -1, Math.sin(a) * r * 1.1], 0.45, IRON, 6))
  }
  g.position.set(x, y, z)
  return g
}

// ---------- 围炉里（置き型）：一圈宽木炉缘围着方形灰坑，灰里一堆炭火，五德上坐着铁壶，灰里插着一双火箸 ----------

const IR = { w: 112, h: 34, rim: 22 }
const IRORI_FX: Fx[] = [{ kind: 'flame', x: 0, y: IR.h - 4, z: 2, scale: 1.3 }]
function irori(p: string[]) {
  const [wood, metal] = p
  const g = new THREE.Group()
  const pit = IR.w - IR.rim * 2
  // 炉缘：四条宽木板围成口字（前后两条压住左右两条的端头）+ 下面的箱体和矮脚
  for (const s of [-1, 1]) {
    g.add(rbox(IR.w, 5, IR.rim, wood, { y: IR.h - 5, z: s * (IR.w / 2 - IR.rim / 2) }, 1))
    g.add(rbox(IR.rim, 5, pit, wood, { x: s * (IR.w / 2 - IR.rim / 2), y: IR.h - 5 }, 1))
  }
  g.add(P(shell(IR.w - 8, IR.h - 9, IR.w - 8, 3, shade(wood, -0.1), { top: false }), 0, 4, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(9, 4, 9, shade(wood, -0.2), { x: sx * (IR.w / 2 - 12), z: sz * (IR.w / 2 - 12) }, 1))
  // 灰坑：铜板内衬 + 灰面
  g.add(P(shell(pit + 1, 14, pit + 1, 1, metal, { top: false }), 0, IR.h - 15, 0))
  // 灰从铜盘底一直填到灰面 ay（只铺薄薄一层的话会悬在盘子半空）
  const ay = IR.h - 5
  g.add(rbox(pit - 0.6, ay - (IR.h - 14), pit - 0.6, ASH, { y: IR.h - 14 }, 0.4))
  g.add(embers(0, ay, 2, 1.5))
  // 五德圈比壶身最粗处小：壶坐在圈上（圈顶 = ay + 9.5，壶身半径 7 的地方离壶底约 1）
  g.add(gotoku(0, ay, 2, 7, 9))
  g.add(tetsubin(0, ay + 8.5, 2, 9))
  // 火箸和灰铲
  g.add(rod3([-22, ay - 1, 18], [-19, ay + 20, 21], 0.4, IRON, 6))
  g.add(rod3([-20.5, ay - 1, 18.6], [-16.5, ay + 20, 20], 0.4, IRON, 6))
  g.add(P(rbox(5, 0.5, 7, metal, {}, 0.2), 22, ay + 0.6, -20, 0.2, 0.5))
  g.add(rod3([23.4, ay + 0.9, -18.2], [29, ay + 6, -10], 0.45, shade(wood, -0.2), 6))
  return g
}

// ---------- 七轮：硅藻土小炭炉，侧面一扇进风口小门，口上架着烤网，网上两条秋刀鱼 ----------

const SH = { r: 13, h: 20 }
const SHICHIRIN_FX: Fx[] = [{ kind: 'smoke', x: 0, y: SH.h + 4, z: 0, scale: 0.9 }]
function shichirin(p: string[]) {
  const [body, band, fish] = p
  const g = new THREE.Group()
  g.add(cup(SH.r, SH.r * 0.82, SH.h, 2.2, body))
  // 腰箍和口箍
  g.add(P(noOutline(torus(SH.r * 0.92, 0.6, band, {}, PI * 2)), 0, SH.h * 0.45, 0, PI / 2))
  g.add(P(noOutline(torus(SH.r + 0.1, 0.6, band, {}, PI * 2)), 0, SH.h - 1.2, 0, PI / 2))
  // 进风口：正面一块深色小门 + 拉钮
  g.add(noOutline(rbox(6.5, 4.6, 0.8, CHARCOAL, { y: 3, z: SH.r * 0.86 }, 0.4)))
  g.add(rbox(1.6, 1.6, 1, band, { y: 4.5, z: SH.r * 0.86 + 0.7 }, 0.4))
  // 炭和火
  g.add(cyl(SH.r - 2.6, SH.r - 3.4, 1, CHARCOAL, { y: SH.h - 6 }, 16))
  for (const [x, z] of [
    [-3, 1],
    [3, -2],
    [0.5, 4],
  ])
    g.add(lit(ball(2.2, EMBER, { x, y: SH.h - 5, z }, [1, 0.5, 1]), EMBER, 0.9))
  // 烤网：外圈 + 几根横丝
  const ny = SH.h + 0.5
  g.add(P(torus(SH.r - 0.6, 0.35, IRON, {}, PI * 2), 0, ny, 0, PI / 2))
  for (let k = -3; k <= 3; k++) {
    const x = k * 3.2
    const half = Math.sqrt(Math.max(1, (SH.r - 0.8) ** 2 - x * x))
    g.add(noOutline(rod3([x, ny, -half], [x, ny, half], 0.18, IRON, 4)))
  }
  // 两条秋刀鱼：细长的鱼身 + 尾鳍
  for (const [z, ry] of [
    [-3.2, 0.12],
    [3.4, -0.08],
  ]) {
    const f = new THREE.Group()
    f.add(ball(9, fish, {}, [1, 0.11, 0.16]))
    f.add(P(rbox(2.6, 0.5, 3.2, shade(fish, -0.2), {}, 0.2), -9.6, 0, 0, 0, 0.78))
    f.add(noOutline(ball(0.35, '#1f1f1f', { x: 7.2, y: 0.6, z: 0.9 })))
    g.add(P(f, 0, ny + 1.2, z, 0, ry))
  }
  return g
}

// ---------- 臼和杵：整木挖出来的捣年糕臼（腰上一圈凹槽），臼里一团年糕，一把横木杵斜搭在臼沿上 ----------

const USU = { r: 24, h: 46 }
function usuKine(p: string[]) {
  const [wood, mochi] = p
  const g = new THREE.Group()
  const r = USU.r
  // 臼：外轮廓（底大、腰收、口略收）再折回去挖出碗形内腔
  const prof: V2[] = [
    [0, 0],
    [r * 0.86, 0],
    [r * 0.9, 3],
    [r * 0.8, 14],
    [r * 0.86, 20],
    [r, 30],
    [r, USU.h - 2],
    [r - 1.5, USU.h],
    [r - 4.5, USU.h],
    [r - 6, USU.h - 4],
    [r * 0.5, USU.h - 16],
    [0, USU.h - 19],
  ]
  g.add(latheAt(prof, wood, {}, 28))
  g.add(P(noOutline(torus(r * 0.82, 0.7, shade(wood, -0.2), {}, PI * 2)), 0, 16, 0, PI / 2))
  // 年糕：一团压扁的白球
  g.add(ball(13, mochi, { y: USU.h - 14 }, [1, 0.45, 1]))
  // 杵：长柄 + 横木槌头，槌头搁在臼口、柄斜向后下方
  const head: [number, number, number] = [6, USU.h + 7, 4]
  g.add(P(cyl(5.2, 5.6, 26, shade(wood, 0.08), {}, 16), head[0], head[1], head[2], 0, 0, PI / 2 - 0.25))
  g.add(rod3([head[0], head[1] - 1, head[2]], [head[0] - 4, 9, head[2] + 46], 1.7, shade(wood, 0.14), 10))
  return fitGroup(g)
}

// ---------- 茶道具：漆盆上摆着抹茶碗（里面有茶汤）、茶筅、枣（茶粉罐）和搭在枣上的茶杓 ----------

function chadogu(p: string[]) {
  const [tray, bowl, lacquer] = p
  const g = new THREE.Group()
  g.add(rbox(36, 1.4, 26, tray, {}, 0.7))
  for (const s of [-1, 1]) {
    g.add(rbox(36, 2.4, 1.2, tray, { z: s * 12.4 }, 0.5))
    g.add(rbox(1.2, 2.4, 23.6, tray, { x: s * 17.4 }, 0.5))
  }
  // 抹茶碗：筒形碗 + 高台 + 茶汤和一点泡沫
  g.add(cyl(3, 3.3, 1, shade(bowl, -0.12), { x: -8, y: 1.4, z: 1 }, 16))
  g.add(cup(6.3, 4.6, 7.2, 0.8, bowl, { x: -8, y: 2.2, z: 1 }))
  g.add(noOutline(cyl(5.3, 5.3, 0.4, '#7fa24a', { x: -8, y: 7.2, z: 1 }, 20)))
  g.add(noOutline(ball(1.6, '#a9c26a', { x: -9, y: 7.5, z: 0.4 }, [1, 0.2, 1])))
  // 茶筅：竹节柄 + 往外张开的穗（两圈细丝收成一束）
  const cx = 6
  const cz = -5
  g.add(cyl(1.3, 1.3, 4.2, BAMBOO, { x: cx, y: 1.4, z: cz }, 10))
  g.add(noOutline(cyl(1.4, 1.4, 0.5, CHARCOAL, { x: cx, y: 5.2, z: cz }, 10)))
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * PI * 2
    g.add(noOutline(rod3([cx + Math.cos(a) * 1.1, 5.4, cz + Math.sin(a) * 1.1], [cx + Math.cos(a) * 2.9, 10.6, cz + Math.sin(a) * 2.9], 0.22, shade(BAMBOO, 0.1), 4)))
  }
  g.add(cyl(0.9, 1.2, 4.2, shade(BAMBOO, 0.14), { x: cx, y: 5.4, z: cz }, 8))
  // 枣：圆润的漆罐，盖缝一圈细线
  g.add(
    latheAt(
      [
        [2.6, 0],
        [3.4, 0.6],
        [3.6, 3],
        [3.3, 5.6],
        [2.2, 6.6],
        [0.01, 6.8],
      ],
      lacquer,
      { x: 9, y: 1.4, z: 5 },
      18,
    ),
  )
  g.add(P(noOutline(torus(3.62, 0.12, shade(lacquer, 0.3), {}, PI * 2)), 9, 5.2, 5, PI / 2))
  // 茶杓：细竹片，一头搭在枣盖上，一头落在盆面
  g.add(rod3([10.5, 8.5, 5.6], [-1, 1.9, 9.6], 0.32, BAMBOO, 6))
  g.add(P(rbox(1.3, 0.3, 2, BAMBOO, {}, 0.12), 11.3, 8.9, 5.3, 0, -0.34, 0.5))
  return g
}

// ---------- 风炉釜：三足的风炉（正面开着火窗）上坐一只茶釜，釜盖上搭着柄杓，旁边立着盖置 ----------

function furoKama(p: string[]) {
  const [furo, kama, mat] = p
  const g = new THREE.Group()
  // 敷板
  g.add(rbox(38, 1.6, 38, mat, {}, 0.6))
  // 风炉：鼓形炉身 + 三只小足 + 正面火窗（深色口里一点炭火）
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 2
    g.add(cyl(2.2, 1.8, 3, furo, { x: Math.cos(a) * 11, y: 1.6, z: Math.sin(a) * 11 }, 10))
  }
  g.add(
    latheAt(
      [
        [0, 0],
        [11.5, 0],
        [14.5, 4],
        [15.5, 10],
        [14, 15.5],
        [12.2, 16.5],
        [10.6, 16.5],
        [10.6, 14],
        [0, 13],
      ],
      furo,
      { y: 4.6 },
      24,
    ),
  )
  g.add(noOutline(P(rbox(9, 5.5, 1, CHARCOAL, {}, 1.6), 0, 13.4, 15, -0.12)))
  g.add(lit(P(rbox(5, 1.6, 0.6, EMBER, {}, 0.5), 0, 12, 15.8, -0.12), EMBER, 0.8))
  // 茶釜：扁圆釜身 + 两只鐶付 + 盖
  g.add(
    latheAt(
      [
        [6, 0],
        [10.6, 2],
        [12.4, 6.5],
        [11, 11],
        [7, 13.2],
        [5.6, 13.6],
      ],
      kama,
      { y: 18.4 },
      24,
    ),
  )
  for (const s of [-1, 1]) g.add(P(rbox(2, 2.4, 2.6, shade(kama, 0.08), {}, 0.7), s * 12, 26.4, 0))
  g.add(cyl(5.8, 6, 1, shade(kama, 0.12), { y: 31.8 }, 18))
  g.add(ball(1, '#b9905a', { y: 33.6 }))
  // 柄杓：竹筒勺头扣在釜口边、长柄斜伸出去
  g.add(P(cyl(2.4, 2.4, 3.4, BAMBOO, {}, 12), 7.4, 33.4, 3, 0, 0, 0.25))
  g.add(rod3([8.6, 34.4, 3.4], [21, 30, 15], 0.5, BAMBOO, 6))
  // 盖置：一小截青竹
  g.add(cup(2.6, 2.6, 5, 0.6, BAMBOO_G, { x: -13.5, y: 1.6, z: 13 }))
  return fitGroup(g)
}

// ---------- 文机：席地而坐用的矮书桌，两条板腿带云形透雕，桌面下两只小抽屉 ----------

const FZ = { w: 92, d: 40, h: 33 }
function fuzukue(p: string[]) {
  const [wood, pull] = p
  const g = new THREE.Group()
  g.add(rbox(FZ.w, 2.6, FZ.d, wood, { y: FZ.h - 2.6 }, 0.8))
  // 抽屉箱：桌面下通长的一条，分两只抽屉
  g.add(rbox(FZ.w - 14, 7, FZ.d - 6, shade(wood, -0.06), { y: FZ.h - 9.6 }, 0.6))
  for (const s of [-1, 1]) {
    g.add(rbox((FZ.w - 20) / 2, 5.2, 1, wood, { x: (s * (FZ.w - 16)) / 4, y: FZ.h - 8.7, z: FZ.d / 2 - 2.8 }, 0.4))
    g.add(rbox(6, 1, 1.2, pull, { x: (s * (FZ.w - 16)) / 4, y: FZ.h - 6.6, z: FZ.d / 2 - 2 }, 0.4))
  }
  // 板腿：两块竖板 + 底下的横脚，中间一根贯
  for (const s of [-1, 1]) {
    g.add(rbox(3, FZ.h - 5, FZ.d - 10, wood, { x: s * (FZ.w / 2 - 8), y: 2.6 }, 0.8))
    g.add(rbox(5, 3, FZ.d - 2, shade(wood, -0.1), { x: s * (FZ.w / 2 - 8) }, 1))
  }
  g.add(rbox(FZ.w - 19, 3, 2.4, shade(wood, -0.1), { y: 9, z: -6 }, 0.6))
  return g
}

// ---------- 长火钵：长方木箱，左边是铜内衬的灰坑（五德上一只铁壶），右边是猫板和两只小抽屉 ----------

const NH = { w: 68, d: 38, h: 34, pit: 40 }
const NAGA_FX: Fx[] = [{ kind: 'steam', x: -NH.w / 2 + 4 + NH.pit / 2 + 9, y: NH.h + 12, z: 0, scale: 0.8 }]
function nagaHibachi(p: string[]) {
  const [wood, metal] = p
  const g = new THREE.Group()
  // 箱体和脚
  g.add(P(shell(NH.w, NH.h - 3, NH.d, 2.6, wood, { top: false }), 0, 3, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 3, 5, shade(wood, -0.2), { x: sx * (NH.w / 2 - 4), z: sz * (NH.d / 2 - 4) }, 0.8))
  // 口沿一圈压条
  // 压条顶面比箱壁高 0.6（同高的话两种木色在口沿上共面会闪）
  for (const s of [-1, 1]) g.add(rbox(NH.w + 1.6, 2.4, 3.6, shade(wood, -0.12), { y: NH.h - 1.8, z: s * (NH.d / 2 - 1.3) }, 0.7))
  for (const s of [-1, 1]) g.add(rbox(3.6, 2.4, NH.d - 5, shade(wood, -0.12), { x: s * (NH.w / 2 - 1.3), y: NH.h - 1.8 }, 0.7))
  // 左边：铜内衬 + 灰 + 炭火 + 五德 + 铁壶
  const px = -NH.w / 2 + 4 + NH.pit / 2
  g.add(P(shell(NH.pit, 12, NH.d - 7, 0.8, metal, { top: false }), px, NH.h - 13.4, 0))
  g.add(rbox(NH.pit - 1.4, 7, NH.d - 8.4, ASH, { x: px, y: NH.h - 12.6 }, 0.4))
  const ay = NH.h - 5.6
  g.add(embers(px - 8, ay, 1, 1))
  g.add(gotoku(px + 9, ay, 0, 5, 6))
  g.add(tetsubin(px + 9, ay + 5.7, 0, 6.2))
  g.add(rod3([px - 15, ay - 1, -9], [px - 13, ay + 14, -11], 0.35, IRON, 6))
  g.add(rod3([px - 13.6, ay - 1, -8.4], [px - 10.6, ay + 14, -10], 0.35, IRON, 6))
  // 右边：隔板 + 猫板（盖板）+ 正面两只小抽屉
  const rx0 = px + NH.pit / 2
  const rw = NH.w / 2 - 2.6 - rx0
  g.add(rbox(2, NH.h - 6, NH.d - 5, wood, { x: rx0 + 1.3, y: 3 }, 0.4))
  g.add(rbox(rw + 2, 2, NH.d - 5.4, shade(wood, 0.06), { x: rx0 + 0.3 + (rw + 2) / 2, y: NH.h - 2.2 }, 0.5))
  for (const [y, h] of [
    [9, 8],
    [19, 8],
  ]) {
    g.add(rbox(rw - 1, h, 0.8, shade(wood, 0.05), { x: rx0 + 1 + rw / 2, y, z: NH.d / 2 - 0.2 }, 0.3))
    g.add(noOutline(rbox(4, 1, 0.8, metal, { x: rx0 + 1 + rw / 2, y: y + h / 2 - 0.5, z: NH.d / 2 + 0.5 }, 0.3)))
  }
  return g
}

// ---------- 缘台：夏天乘凉的条板长凳——四条方腿、两根横档，台面是留缝的窄木条 ----------

const EN = { w: 150, d: 46, h: 40 }
function endai(p: string[]) {
  const [wood] = p
  const g = new THREE.Group()
  const n = 7
  const sw = (EN.d - (n - 1) * 1) / n
  for (let k = 0; k < n; k++) g.add(rbox(EN.w, 2.4, sw, k % 2 ? wood : shade(wood, 0.04), { y: EN.h - 2.4, z: -EN.d / 2 + sw / 2 + k * (sw + 1) }, 0.6))
  // 台面下的三根托梁、四条腿和前后横档
  for (const x of [-EN.w / 2 + 12, 0, EN.w / 2 - 12]) g.add(rbox(4.5, 4, EN.d - 4, shade(wood, -0.1), { x, y: EN.h - 6.4 }, 0.8))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(rbox(5.5, EN.h - 6.4, 5.5, shade(wood, -0.06), { x: sx * (EN.w / 2 - 12), z: sz * (EN.d / 2 - 6) }, 0.9))
  for (const sz of [-1, 1]) g.add(rbox(EN.w - 29.5, 3.6, 2.6, shade(wood, -0.1), { y: 12, z: sz * (EN.d / 2 - 6) }, 0.7))
  return g
}

// ---------- 和伞：撑开的油纸伞侧放在地上当装饰——伞面两色环带、密密的伞骨、竹柄和顶上的头轮 ----------

const WG = { r: 46 }
function wagasa(p: string[]) {
  const [paper, band, frame] = p
  const u = new THREE.Group()
  const r = WG.r
  const depth = 15
  // 伞面：从伞顶 (0, depth) 到伞沿 (r, 0) 的薄锥壳，按半径分成几圈环带换色。
  // 每圈是一个闭合的薄楔形截面（外面从伞沿往伞顶走、里面折回来），里外两面都朝外，从伞下往上看也是实的
  const yAt = (rr: number) => depth * (1 - rr / r)
  const cone = (r0: number, r1: number, color: string) =>
    latheAt(
      [
        [r1, yAt(r1)],
        [r0, yAt(r0)],
        [r0, yAt(r0) - 0.5],
        [r1, yAt(r1) - 0.5],
        [r1, yAt(r1)],
      ],
      color,
      {},
      36,
    )
  u.add(G(cone(1.5, r * 0.34, paper), cone(r * 0.34, r * 0.56, band), cone(r * 0.56, r * 0.9, paper), cone(r * 0.9, r, band)))
  // 伞骨（里侧）：从伞顶放射到伞沿的细竹条，每隔一根再连一根撑骨到伞柄上的滑环
  const ribs = 24
  for (let k = 0; k < ribs; k++) {
    const a = (k / ribs) * PI * 2
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    u.add(noOutline(rod3([cx * 2, depth - 1.2, cz * 2], [cx * (r - 0.6), -0.9, cz * (r - 0.6)], 0.22, frame, 4)))
    if (k % 3 === 0) u.add(noOutline(rod3([cx * 1.6, -9, cz * 1.6], [cx * r * 0.52, depth * 0.48 - 1, cz * r * 0.52], 0.2, frame, 4)))
  }
  // 伞柄、滑环、顶上的头轮和伞头
  u.add(cyl(0.9, 0.9, 66, BAMBOO, { y: -50 }, 8))
  u.add(cyl(1.7, 1.7, 2.6, frame, { y: -10.4 }, 10))
  u.add(cyl(2, 1.6, 2.4, frame, { y: depth - 0.6 }, 12))
  u.add(ball(1.2, CHARCOAL, { y: depth + 2.4 }))
  u.add(cyl(1.3, 1.1, 5, shade(BAMBOO, -0.25), { y: -50.8 }, 8))
  // 侧放：伞面朝前上方，伞沿和伞柄尾端着地
  const g = new THREE.Group()
  g.add(P(u, 0, 0, 0, 1.02, 0, 0))
  return fitGroup(g)
}

// ---------- 盆提灯：三条弯腿撑着的落地纸灯——上下两圈木环、椭球形纸罩（自发光）、垂着一束流苏 ----------

function bonChochin(p: string[]) {
  const [frame, paper, tassel] = p
  const g = new THREE.Group()
  const top = 78
  // 三条弯腿：从地面外撇着往上收，到灯罩上方合拢
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + PI / 6
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    g.add(
      tube(
        [
          [cx * 14, 0.6, cz * 14],
          [cx * 9, 14, cz * 9],
          [cx * 13.5, 40, cz * 13.5],
          [cx * 9, 64, cz * 9],
          [cx * 2, top - 4, cz * 2],
        ],
        0.7,
        frame,
        { seg: 20, radial: 6 },
      ),
    )
    g.add(ball(1.1, frame, { x: cx * 14, y: 1.1, z: cz * 14 }))
  }
  g.add(cyl(2.4, 2.6, 4, frame, { y: top - 5 }, 12))
  g.add(ball(1.6, frame, { y: top - 0.4 }))
  // 灯罩：椭球纸罩 + 上下口的木环
  g.add(litOutlined(ball(10, paper, { y: 44 }, [1, 1.25, 1]), paper, 0.55))
  for (const y of [32.2, 55.8]) g.add(cyl(5.2, 5.2, 1.4, frame, { y }, 16))
  // 罩面的几道横向竹骨和一圈纹样带
  for (const [y, rr] of [
    [38, 9.1],
    [44, 10.1],
    [50, 9.1],
  ])
    g.add(P(noOutline(torus(rr, 0.16, shade(paper, -0.18), {}, PI * 2)), 0, y, 0, PI / 2))
  g.add(P(noOutline(torus(10.15, 0.5, tassel, {}, PI * 2)), 0, 41, 0, PI / 2))
  // 吊绳和流苏
  g.add(cyl(0.3, 0.3, 17, frame, { y: 57 }, 6))
  g.add(cyl(0.3, 0.3, 5, tassel, { y: 27 }, 6))
  g.add(ball(1.3, tassel, { y: 26.4 }))
  g.add(cyl(0.9, 1.6, 8, tassel, { y: 17.6 }, 10))
  return g
}

// ---------- 熊手：竹耙上扎满吉祥物——金小判、米俵、红鲷鱼、松枝和一块木牌（酉之市的招福耙，挂在墙上） ----------

const KM = { w: 46, d: 10, h: 60, mount: 140 }
function kumade(p: string[]) {
  const [bamboo, red, gold] = p
  const g = new THREE.Group()
  // 竹柄和耙齿（扇形张开，齿尖往前弯）
  g.add(cyl(1, 1, 30, bamboo, { y: 0 }, 8))
  for (let k = -4; k <= 4; k++) {
    const a = k * 0.2
    const x = Math.sin(a) * 30
    const y = 30 + Math.cos(a) * 28
    g.add(
      tube(
        [
          [0, 30, 0],
          [x * 0.6, 30 + (y - 30) * 0.6, 0],
          [x, y, 0.6],
          [x * 1.04, y + 1.4, 3],
        ],
        0.5,
        shade(bamboo, k % 2 ? 0.05 : -0.05),
        { seg: 10, radial: 5 },
      ),
    )
  }
  g.add(rbox(20, 1.6, 1.6, shade(bamboo, -0.15), { y: 43, z: 0.6 }, 0.5))
  // 吉祥物：中间一只米俵、两枚小判、一条鲷鱼、一把松枝、一块木牌
  g.add(P(cyl(4.6, 4.6, 12, '#e6cf8f', {}, 14), 0, 44, 3.6, 0, 0, PI / 2))
  for (const s of [-1, 1]) g.add(P(noOutline(torus(4.7, 0.35, '#b9933a', {}, PI * 2)), s * 3.2, 44, 3.6, 0, PI / 2))
  for (const [x, y, rz] of [
    [-10, 49, 0.3],
    [10.5, 47, -0.25],
  ])
    g.add(P(ball(4.2, gold, {}, [0.72, 1, 0.16]), x, y, 1.9, 0, 0, rz))
  // 鲷鱼：压扁的红身子 + 尾巴 + 眼睛
  const fish = G(ball(5.4, red, {}, [1, 0.62, 0.3]), P(rbox(3, 4.6, 0.8, shade(red, -0.12), {}, 0.3), -5.6, 0, 0, 0, 0, 0.78), noOutline(ball(0.55, '#ffffff', { x: 3, y: 0.8, z: 1.5 })))
  g.add(P(fish, 3, 35.5, 3.8, 0, 0, 0.2))
  // 松枝插在米俵左端
  for (const [x, y, rz] of [
    [-6.8, 42, 0.5],
    [-7.4, 45.5, 0.9],
    [-6.6, 40, 0.15],
  ])
    g.add(P(ball(4.4, '#4f8a4a', {}, [0.3, 1, 0.14]), x, y, 3.6, 0, 0, rz))
  g.add(P(rbox(6.5, 9, 0.9, '#f1e3c0', {}, 0.3), 9.5, 37, 3, 0, 0, -0.18))
  g.add(noOutline(P(rbox(1, 6.5, 0.4, red, {}, 0.15), 9.5, 37, 3.6, 0, 0, -0.18)))
  // 柄上的红白纸垂和金铃
  g.add(P(rbox(3.4, 7, 0.5, '#ffffff', {}, 0.2), -1.6, 20, 1.2, 0, 0, 0.2))
  g.add(P(rbox(3.4, 7, 0.5, red, {}, 0.2), 1.6, 19, 1.3, 0, 0, -0.2))
  g.add(ball(1.5, gold, { y: 25.6, z: 1.6 }))
  return fitWall(g, KM.mount, KM.d)
}

// ---------- 汤婆子：波纹铁皮的椭圆热水袋，顶上一只铜盖，下半截套着针织套 ----------

function yutanpo(p: string[]) {
  const [metal, cap, knit] = p
  const g = new THREE.Group()
  // 壶身：压扁的椭球（半轴 14 × 4.2 × 10.1）+ 顶面几圈同心波纹（椭圆环，贴着壶面的高度摆）
  g.add(ball(14, metal, { y: 4.6 }, [1, 0.3, 0.72]))
  for (const k of [0.3, 0.52, 0.72]) {
    const ring = P(noOutline(torus(14 * k, 0.45, shade(metal, -0.1), {}, PI * 2)), 0, 4.6 + 4.2 * Math.sqrt(1 - k * k) - 0.1, 0, PI / 2)
    ring.scale.set(1, 0.72, 1)
    g.add(ring)
  }
  // 铜盖和提环
  g.add(cyl(2, 2.2, 1.6, cap, { x: 9.5, y: 7.2 }, 12))
  g.add(P(torus(1.4, 0.3, cap, {}, PI), 9.5, 8.8, 0))
  // 针织套：包住左边大半截（比壶身略大的椭球，半轴 10.4 × 4.8 × 11）+ 几圈绕着套身的罗纹
  g.add(ball(14.5, knit, { x: -4.5, y: 4.6 }, [0.72, 0.33, 0.76]))
  for (const x of [-10.5, -5.5, -0.5]) {
    const k = Math.sqrt(1 - ((x + 4.5) / 10.4) ** 2)
    const rib = P(noOutline(torus(11 * k, 0.4, shade(knit, -0.14), {}, PI * 2)), x, 4.6, 0, 0, PI / 2)
    rib.scale.set(1, 4.8 / 11, 1)
    g.add(rib)
  }
  return fitGroup(g)
}

// ---------- 流水素面机：圆盆里一圈环形水道（水在流、面在漂），中间一座冰山岛，旁边两只蘸汁杯和筷子 ----------

function somen(p: string[]) {
  const [body, island, cupC] = p
  const g = new THREE.Group()
  // 盆：底座 + 外圈盆壁 + 中间的岛
  g.add(cyl(15.5, 16.5, 4, shade(body, -0.1), {}, 28))
  g.add(cup(17, 16, 8, 1.2, body, { y: 4 }))
  g.add(cyl(8, 9, 9.5, island, { y: 4.8 }, 24))
  g.add(cyl(6.4, 7.6, 1.4, shade(island, 0.06), { y: 14.3 }, 20))
  // 岛顶的冰块和一片青枫叶
  for (const [x, z, s] of [
    [-2, 1, 3],
    [2.2, -1.4, 2.6],
    [0.6, 2.6, 2.2],
  ])
    g.add(ghost(P(rbox(s, s, s, '#e8f6fb', {}, 0.5), x, 15.7 + s / 2, z, 0.2, 0.6, 0.1), '#e8f6fb', 0.55))
  g.add(noOutline(P(ball(1.8, '#6fae5a', {}, [1, 0.12, 0.7]), -3.4, 16, -2.6, 0, 0.6, 0.15)))
  // 水面（环形水道）和漂着的素面
  const water = markWater(ghost(P(new THREE.Mesh(new THREE.RingGeometry(9.2, 15.7, 36).rotateX(-PI / 2)), 0, 10.4, 0), WATER, 0.55))
  g.add(water)
  for (const a0 of [0.3, 2.1, 3.9, 5.2]) {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= 6; i++) {
      const a = a0 + i * 0.16
      const rr = 12.4 + Math.sin(i * 1.7 + a0) * 1.2
      pts.push([Math.cos(a) * rr, 10.6, Math.sin(a) * rr])
    }
    g.add(noOutline(tube(pts, 0.28, '#fbf8ef', { seg: 12, radial: 5 })))
  }
  // 两只蘸汁杯（里面是酱汁）和一双筷子
  for (const [x, z] of [
    [-24, 8],
    [-25, -6],
  ]) {
    g.add(cup(4, 3, 5.4, 0.6, cupC, { x, z }))
    g.add(noOutline(cyl(3.3, 3.3, 0.3, '#5a3a22', { x, y: 4.2, z }, 14)))
  }
  g.add(rod3([23.2, 1.3, -7], [24.4, 0.4, 13.5], 0.35, shade(island, -0.3), 6))
  g.add(rod3([25, 1.3, -7], [26.6, 0.4, 13.2], 0.35, shade(island, -0.3), 6))
  g.add(cylZ(0.9, 4, shade(body, -0.2), 24.2, 0.9, -5, 8).rotateZ(PI / 2))
  return fitGroup(g)
}

// ---------- 配色 ----------

const WOOD_METAL: Pal[] = [
  ['japanese', [J.dark, '#b9743f']],
  ['japanese', [J.wood, '#c9a25a']],
  ['japanese', [J.sumi, '#b9743f']],
  ['chinese', [CN.rosewood, CN.brass]],
]
const SHICHIRIN_PALS: Pal[] = [
  ['japanese', ['#e8dcc0', J.sumi, '#9fb4c7']],
  ['japanese', ['#d9c2a0', '#8a6a4a', '#8fa3b8']],
  ['japanese', ['#bfb8ab', '#3e3a39', '#a9b8c4']],
]
const USU_PALS: Pal[] = [
  ['japanese', [J.wood, '#fbf7ee']],
  ['japanese', [J.hinoki, '#fbf7ee']],
  ['japanese', [J.dark, '#f7efe0']],
]
const CHADOGU_PALS: Pal[] = [
  ['japanese', [J.sumi, '#e9dfc9', '#8a1f1f']],
  ['japanese', ['#7a2a22', '#3e3a39', J.sumi]],
  ['japanese', [J.dark, '#a9c2b0', '#c9a25a']],
  ['chinese', [CN.ink, CN.celadon, CN.lacquer]],
]
const FURO_PALS: Pal[] = [
  ['japanese', ['#5a4a3e', '#2f2b2a', J.sumi]],
  ['japanese', ['#b9743f', '#3a3837', J.dark]],
  ['japanese', ['#8a8782', '#2f2b2a', '#7a2a22']],
]
const FZ_PALS: Pal[] = [
  ['japanese', [J.wood, J.sumi]],
  ['japanese', [J.dark, '#c9a25a']],
  ['japanese', [J.hinoki, J.dark]],
  ['chinese', [CN.rosewood, CN.brass]],
  ['nordic', [N.oak, N.white]],
]
const EN_PALS: Pal[] = [
  ['japanese', [J.hinoki]],
  ['japanese', [J.wood]],
  ['japanese', [J.dark]],
  ['nordic', [N.oak]],
]
const WG_PALS: Pal[] = [
  ['japanese', [J.shu, '#fbf3e2', J.sumi]],
  ['japanese', ['#6a4a8a', '#fbf3e2', J.sumi]],
  ['japanese', [J.ai, '#f6f0e1', J.dark]],
  ['japanese', ['#f6f0e1', J.shu, J.wood]],
  ['chinese', [CN.lacquer, '#f2dfa8', CN.ink]],
]
const BON_PALS: Pal[] = [
  ['japanese', [J.sumi, '#fbf3e2', '#7a5aa8']],
  ['japanese', [J.dark, '#fdf1dc', J.shu]],
  ['japanese', [J.wood, '#f6f6ee', J.ai]],
]
const KM_PALS: Pal[] = [
  ['japanese', [BAMBOO, '#d8483f', '#e3b549']],
  ['japanese', ['#b99a5a', '#c8473a', '#d4b25a']],
  ['japanese', [BAMBOO_G, '#e2573f', '#f2c230']],
]
const YU_PALS: Pal[] = [
  ['japanese', ['#c9ced6', '#c9a25a', '#c8473a']],
  ['japanese', ['#c9a25a', '#8a6a3a', '#3d5a80']],
  ['nordic', ['#d7d8db', '#b9bfc4', N.mustard]],
  ['cute', ['#c9ced6', '#e3b549', '#ffb6c8']],
]
const SOMEN_PALS: Pal[] = [
  ['japanese', ['#f4f6f8', BAMBOO_G, '#3d5a80']],
  ['japanese', ['#bfe3ee', '#fbf7f1', '#2f8f8a']],
  ['cute', ['#ffd6e0', '#fbf7f1', '#a8d4f4']],
]

const HEARTH: Partial<AssetDef> = { type: 'heater', tags: ['decor'], styles: ['japanese'] }

export const JAPANESE_MORE: AssetDef[] = [
  define('jm-irori', '围炉里', 'japanese', [IR.w, IR.w, IR.h + 24], WOOD_METAL, irori, {
    ...HEARTH,
    mats: ['wood', 'metal'],
    fx: IRORI_FX,
    // 只有炉缘那一圈能放东西（中间是灰坑）
    surface: IR.h,
    surfaceShape: [
      rectPoly(-IR.w / 2 + 1, IR.w / 2 - IR.rim + 1, IR.w / 2 - 1, IR.w / 2 - 1),
      rectPoly(-IR.w / 2 + 1, -IR.w / 2 + 1, IR.w / 2 - 1, -IR.w / 2 + IR.rim - 1),
      rectPoly(-IR.w / 2 + 1, -IR.w / 2 + IR.rim, -IR.w / 2 + IR.rim - 1, IR.w / 2 - IR.rim),
      rectPoly(IR.w / 2 - IR.rim + 1, -IR.w / 2 + IR.rim, IR.w / 2 - 1, IR.w / 2 - IR.rim),
    ],
  }),
  define('jm-shichirin', '七轮炭炉', 'japanese', [SH.r * 2 + 1, SH.r * 2 + 1, SH.h + 3], SHICHIRIN_PALS, shichirin, {
    ...PROP,
    type: 'cookware',
    styles: ['japanese'],
    mats: ['ceramic', 'metal', null],
    fx: SHICHIRIN_FX,
  }),
  define('jm-usu-kine', '臼和杵', 'japanese', [50, 76, 62], USU_PALS, usuKine, {
    type: 'decor',
    styles: ['japanese'],
    mats: ['wood', null],
  }),
  define('jm-chadogu', '茶道具', 'japanese', [36, 26, 11], CHADOGU_PALS, chadogu, {
    ...PROP,
    type: 'tea-set',
    tags: ['hobby:tea', 'curio-ok'],
    mats: ['wood', 'ceramic', 'wood'],
  }),
  define('jm-furo-kama', '风炉釜', 'japanese', [41, 38, 36], FURO_PALS, furoKama, {
    type: 'tea-set',
    tags: ['hobby:tea'],
    styles: ['japanese'],
    mats: ['ceramic', 'metal', 'wood'],
  }),
  define('jm-fuzukue', '文机', 'japanese', [FZ.w, FZ.d, FZ.h], FZ_PALS, fuzukue, {
    type: 'low-table',
    tags: ['table'],
    mats: ['wood', 'metal'],
    surface: FZ.h,
  }),
  define('jm-naga-hibachi', '长火钵', 'japanese', [NH.w + 2, NH.d + 2, NH.h + 16], WOOD_METAL, nagaHibachi, {
    ...HEARTH,
    mats: ['wood', 'metal'],
    fx: NAGA_FX,
    // 右边的猫板上能放茶杯
    surface: NH.h,
    surfaceShape: [rectPoly(-NH.w / 2 + 4 + NH.pit + 1, -NH.d / 2 + 4, NH.w / 2 - 3, NH.d / 2 - 4)],
  }),
  define('jm-endai', '缘台', 'outdoor', [EN.w, EN.d, EN.h], EN_PALS, endai, {
    type: 'seat',
    mats: ['wood'],
  }),
  define('jm-wagasa', '和伞', 'japanese', [92, 68, 79], WG_PALS, wagasa, {
    type: 'decor',
    mats: ['paper', 'paper', 'wood'],
  }),
  define('jm-bon-chochin', '盆提灯', 'japanese', [28, 28, 80], BON_PALS, bonChochin, {
    type: 'decor',
    styles: ['japanese'],
    mats: ['wood', 'paper', 'fabric'],
  }),
  define('jm-kumade', '熊手', 'japanese', [KM.w, KM.d, KM.h], KM_PALS, kumade, {
    type: 'decor',
    styles: ['japanese'],
    mount: KM.mount,
    mats: ['wood', null, 'metal'],
  }),
  define('jm-yutanpo', '汤婆子', 'japanese', [29, 23, 11], YU_PALS, yutanpo, {
    ...PROP,
    type: 'sundries',
    tags: ['bed-ok'],
    mats: ['metal', 'metal', 'fabric'],
  }),
  define('jm-somen', '流水素面机', 'japanese', [56, 34, 19], SOMEN_PALS, somen, {
    ...PROP,
    type: 'cookware',
    styles: ['japanese'],
    mats: ['plastic', 'plastic', 'ceramic'],
  }),
]
