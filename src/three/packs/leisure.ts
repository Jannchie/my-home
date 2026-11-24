// 娱乐大件：乒乓球桌、桌上足球、空气曲棍球桌、街机柜、抓娃娃机、弹珠台、点唱机、按摩椅、赛车模拟器。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。带台面的（乒乓球桌、空气曲棍球桌）声明 surface；type / tags / mats 直接写在 def 里。

import * as THREE from 'three'
import { ball, cyl, plate, rbox, shade, torus } from '../toon'
import { C, paintPanel, rectPoly, shell, type AssetDef } from '../kit'
import { cylX, cylZ, fitGroup, G, ghost, glassPane, lit, mesh, noOutline, P, PI, rod3, sideSlab, tiltFrame, tube } from '../geo'
import { I, M, N, R, define, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#24252a'
const RUBBER = '#2e2f33'

/** 摇杆：底座圆片 + 细杆 + 球头，立在 (x, y, z)，轴沿局部 y */
function joystick(x: number, y: number, z: number, color: string) {
  return P(G(cyl(2.2, 2.6, 0.8, DARK, {}, 12), cyl(0.6, 0.6, 5, STEEL, { y: 0.8 }, 8), ball(1.7, color, { y: 6.6 })), x, y, z)
}

// ---------- 乒乓球桌：标准 274 × 152.5 × 76，中间一张网（两端各伸出台面 15cm），两片台面各带一副折叠腿和中间的带轮台车 ----------

const PP = { w: 274, d: 152.5, h: 76, net: 15.25, over: 15 }
function pingpong(p: string[]) {
  const [top, frame, post] = p
  const g = new THREE.Group()
  const half = PP.w / 2
  const t = 2.5
  for (const s of [-1, 1]) {
    const cx = s * (half / 2 + 0.3)
    g.add(rbox(half - 0.6, t, PP.d, top, { x: cx, y: PP.h - t }, 0.5))
    // 台面下的钢围边
    g.add(rbox(half - 12, 4, 3, frame, { x: cx, y: PP.h - t - 4, z: PP.d / 2 - 8 }, 0.6))
    g.add(rbox(half - 12, 4, 3, frame, { x: cx, y: PP.h - t - 4, z: -PP.d / 2 + 8 }, 0.6))
    // 外侧一副 U 形腿：两条腿 + 一根横撑，脚底有调平垫
    const lx = s * (half - 24)
    for (const sz of [-1, 1]) {
      g.add(rbox(4, PP.h - t - 1, 4, frame, { x: lx, y: 1, z: sz * 52 }, 0.8))
      g.add(cyl(3, 3.4, 1.2, RUBBER, { x: lx, z: sz * 52 }, 12))
    }
    g.add(rbox(3, 3, 104, frame, { x: lx, y: 22 }, 0.6))
    // 白色边线和中线（贴在台面上，略微浮起）
    const y = PP.h + 0.06
    g.add(plate(half - 0.6, 2, '#ffffff', { x: cx, y, z: PP.d / 2 - 1 }))
    g.add(plate(half - 0.6, 2, '#ffffff', { x: cx, y, z: -PP.d / 2 + 1 }))
    g.add(plate(2, PP.d, '#ffffff', { x: s * (half - 1), y }))
    g.add(plate(half - 2.6, 0.6, '#ffffff', { x: cx, y }))
  }
  // 中间的台车：四根立柱 + 上下横梁 + 四只脚轮
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(4, PP.h - t - 8, 4, frame, { x: sx * 16, y: 8, z: sz * 52 }, 0.8))
      g.add(cylX(4, 2.6, RUBBER, sx * 16, 4, sz * 52, 14))
      g.add(rbox(1.2, 5, 5, frame, { x: sx * 16 + 2, y: 4, z: sz * 52 }, 0.3))
      g.add(rbox(1.2, 5, 5, frame, { x: sx * 16 - 2, y: 4, z: sz * 52 }, 0.3))
    }
  for (const sz of [-1, 1]) g.add(rbox(36, 3, 3, frame, { y: 12, z: sz * 52 }, 0.6))
  for (const sx of [-1, 1]) g.add(rbox(3, 3, 104, frame, { x: sx * 16, y: 40 }, 0.6))
  // 网：两端的夹柱 + 半透明网面 + 顶上一条白边
  const nz = PP.d / 2 + PP.over
  for (const sz of [-1, 1]) {
    g.add(rbox(2.4, PP.net + 5, 2.4, post, { y: PP.h - 4, z: sz * (nz - 1.2) }, 0.5))
    g.add(rbox(4, 3.5, PP.over, post, { y: PP.h - t - 3.5, z: sz * (PP.d / 2 + PP.over / 2 - 2.5) }, 0.6))
  }
  g.add(ghost(rbox(0.5, PP.net - 1.4, nz * 2 - 5, '#3a4a5c', { y: PP.h + 0.2 }, 0.2), '#3a4a5c', 0.45))
  g.add(noOutline(rbox(0.9, 1.4, nz * 2 - 5, '#ffffff', { y: PP.h + PP.net - 1.2 }, 0.3)))
  return g
}

// ---------- 桌上足球：四条方腿撑起一只敞口的球场箱，八根横杆穿过箱体，杆上挂着两队小人，手柄交错在两侧 ----------

const FB = { w: 140, body: 76, d: 118, h: 90, box: 30 }
/** 八根杆从左到右各挂几个人、属于哪一队（0 / 1）：守门 1、后卫 2、对方前锋 3、中场 5，左右对称 */
const FB_RODS: [number, number][] = [
  [1, 0],
  [2, 0],
  [3, 1],
  [5, 0],
  [5, 1],
  [3, 0],
  [2, 1],
  [1, 1],
]
function foosball(p: string[]) {
  const [body, field, teamA, teamB] = p
  const g = new THREE.Group()
  const y0 = FB.h - FB.box
  // 腿和横撑
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(9, y0 - 1, 9, body, { x: sx * (FB.w / 2 - 9), y: 1, z: sz * (FB.body / 2 - 8) }, 1.2))
      g.add(cyl(3.6, 4, 1.4, RUBBER, { x: sx * (FB.w / 2 - 9), z: sz * (FB.body / 2 - 8) }, 12))
    }
  for (const sx of [-1, 1]) g.add(rbox(5, 5, FB.body - 24, shade(body, -0.08), { x: sx * (FB.w / 2 - 9), y: 20 }, 0.8))
  g.add(rbox(FB.w - 22, 4, 4, shade(body, -0.08), { y: 20.5 }, 0.8))
  // 球场箱：敞口空心箱 + 绿色场地 + 白线
  g.add(P(shell(FB.w, FB.box, FB.body, 3.5, body, { top: false }), 0, y0, 0))
  const fy = y0 + 5
  g.add(rbox(FB.w - 6.6, 1.5, FB.body - 6.6, field, { y: fy - 1.5 }, 0.3))
  g.add(plate(0.8, FB.body - 8, '#ffffff', { y: fy + 0.06 }))
  g.add(P(noOutline(torus(9, 0.4, '#ffffff', {}, PI * 2)), 0, fy + 0.2, 0, PI / 2))
  for (const sx of [-1, 1]) g.add(noOutline(rbox(0.5, 9, 22, DARK, { x: sx * (FB.w / 2 - 3.2), y: fy }, 0.2)))
  // 横杆、手柄、挡圈、小人
  const ry = FB.h - 9
  const zr = FB.body / 2
  FB_RODS.forEach(([n, team], i) => {
    const x = -52.5 + i * 15
    const side = team ? -1 : 1
    const color = team ? teamB : teamA
    g.add(rod3([x, ry, -zr - 12], [x, ry, zr + 12], 0.8, STEEL, 8))
    // 握把在本队一侧，另一侧一颗橡胶头
    g.add(cylZ(1.9, 11, DARK, x, ry, side * (zr + 15.5), 12))
    g.add(cylZ(1.3, 2, RUBBER, x, ry, -side * (zr + 12.5), 10))
    const span = FB.body - 26
    for (let k = 0; k < n; k++) {
      const z = n === 1 ? 0 : -span / 2 + (span * k) / (n - 1)
      g.add(rbox(2.6, 9.5, 2.2, color, { x, y: ry - 8, z: z * (n === 5 ? 1 : 0.6) }, 0.7))
      g.add(ball(1.7, color, { x, y: ry + 2.6, z: z * (n === 5 ? 1 : 0.6) }))
    }
  })
  g.add(ball(1.7, '#ffffff', { x: 6, y: fy + 1.7, z: 9 }))
  // 两端的计分珠
  for (const sx of [-1, 1]) {
    g.add(rod3([sx * (FB.w / 2 - 1.8), FB.h + 2.5, -12], [sx * (FB.w / 2 - 1.8), FB.h + 2.5, 12], 0.4, STEEL, 6))
    for (const z of [-12, 12]) g.add(cyl(0.6, 0.6, 2.6, STEEL, { x: sx * (FB.w / 2 - 1.8), y: FB.h - 0.2, z }, 6))
    for (let k = 0; k < 5; k++) g.add(noOutline(cylZ(1.1, 1.6, sx < 0 ? teamA : teamB, sx * (FB.w / 2 - 1.8), FB.h + 2.5, -9 + k * 1.9, 10)))
  }
  return g
}

// ---------- 空气曲棍球桌：四条粗腿、箱形桌身，白色台面四周一圈挡边，两端各有球门槽，台面上两只推板和一枚球饼 ----------

const AH = { w: 200, d: 104, h: 84, top: 80 }
function airHockey(p: string[]) {
  const [body, rail, accent] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rbox(13, 56, 13, body, { x: sx * (AH.w / 2 - 20), y: 2, z: sz * (AH.d / 2 - 14) }, 2))
      g.add(cyl(4.5, 5, 2, RUBBER, { x: sx * (AH.w / 2 - 20), z: sz * (AH.d / 2 - 14) }, 14))
    }
  for (const sx of [-1, 1]) g.add(rbox(6, 8, AH.d - 40, shade(body, -0.1), { x: sx * (AH.w / 2 - 20), y: 18 }, 1.2))
  // 桌身 + 一圈装饰色带
  g.add(rbox(AH.w, 24, AH.d, body, { y: 56 }, 3))
  g.add(noOutline(rbox(AH.w + 0.6, 3, AH.d + 0.6, accent, { y: 62 }, 1.4)))
  // 台面和挡边
  g.add(rbox(AH.w - 14, 1, AH.d - 14, '#f6f7f8', { y: AH.top - 0.7 }, 0.3))
  for (const sz of [-1, 1]) g.add(rbox(AH.w, AH.h - AH.top + 1, 8, rail, { y: AH.top - 1, z: sz * (AH.d / 2 - 4) }, 1.6))
  for (const sx of [-1, 1]) g.add(rbox(8, AH.h - AH.top + 1, AH.d - 16, rail, { x: sx * (AH.w / 2 - 4), y: AH.top - 1 }, 1.6))
  // 球门槽（两端挡边内侧的黑口）
  for (const sx of [-1, 1]) g.add(noOutline(rbox(0.6, 2.6, 30, DARK, { x: sx * (AH.w / 2 - 8.2), y: AH.top + 0.3 }, 0.2)))
  // 中线、中圈、两个发球点
  const ly = AH.top + 0.36
  g.add(plate(1.2, AH.d - 16, accent, { y: ly }))
  g.add(P(noOutline(torus(15, 0.5, accent, {}, PI * 2)), 0, ly + 0.1, 0, PI / 2))
  for (const sx of [-1, 1]) g.add(P(noOutline(torus(9, 0.4, '#7fa8d8', {}, PI * 2)), sx * 52, ly + 0.1, 0, PI / 2))
  // 推板和球饼
  for (const [x, z, c] of [
    [-66, -10, '#d8483f'],
    [62, 14, '#3f7fd8'],
  ] as [number, number, string][]) {
    g.add(cyl(4.8, 4.8, 2, c, { x, y: AH.top + 0.3, z }, 20))
    g.add(cyl(1.9, 2.3, 4, c, { x, y: AH.top + 2.3, z }, 14))
    g.add(ball(2.1, c, { x, y: AH.top + 6.6, z }))
  }
  g.add(cyl(3.2, 3.2, 0.9, '#f2c230', { x: 10, y: AH.top + 0.3, z: -20 }, 18))
  return g
}

// ---------- 街机柜：两块侧板夹着踢脚板、投币门、斜操作台、后仰的屏幕和探出来的发光灯箱 ----------

const AR = { w: 66, d: 84, h: 178 }
/** 侧板轮廓（z 朝前、y 朝上）：踢脚 → 操作台前沿 → 屏幕往后仰 → 灯箱往前探 → 顶 */
const AR_SIDE: [number, number][] = [
  [-42, 0],
  [26, 0],
  [26, 80],
  [40, 86],
  [40, 92],
  [17, 100],
  [5, 150],
  [24, 153],
  [24, 174],
  [-42, 178],
]
function arcade(p: string[]) {
  const [body, accent, panel] = p
  const g = new THREE.Group()
  const inner = AR.w - 5
  for (const s of [-1, 1]) {
    g.add(sideSlab(AR_SIDE, 2.5, body, s * (AR.w / 2 - 1.25)))
    // 侧板上的两条斜色带
    for (const [y, c] of [
      [58, accent],
      [70, shade(accent, 0.18)],
    ] as [number, string][])
      g.add(noOutline(P(rbox(0.5, 7, 60, c, {}, 0.2), s * (AR.w / 2 + 0.05), y, -6, -0.5)))
  }
  // 踢脚板、投币门、底板、背板、顶板
  g.add(rbox(inner, 80, 2, panel, { z: 24 }, 0.4))
  g.add(rbox(24, 30, 1, shade(panel, -0.25), { y: 24, z: 25.3 }, 0.5))
  // 投币门上：一只发光的投币口、一把锁、底下的退币口
  g.add(lit(rbox(2.4, 6, 0.6, '#ff8a3d', { y: 42, z: 25.9 }, 0.3), '#ff8a3d', 0.7))
  g.add(cyl(1.3, 1.3, 0.8, STEEL, { x: 7, y: 37, z: 26.2, rx: PI / 2 }, 10))
  g.add(rbox(12, 5, 0.8, DARK, { y: 27, z: 25.9 }, 0.4))
  g.add(rbox(inner, 2, 66, panel, { y: 2, z: -8 }, 0.4))
  g.add(rbox(inner, 172, 2, panel, { y: 3, z: -40 }, 0.4))
  // 操作台：前沿立面 + 斜面，上面一根摇杆和六颗按钮
  g.add(rbox(inner, 7, 2, shade(panel, -0.12), { y: 85.5, z: 38.6 }, 0.4))
  const deck = tiltFrame([40, 92], [17, 100])
  deck.g.add(rbox(inner, deck.len, 2, shade(panel, 0.1), { z: -1 }, 0.4))
  deck.g.add(P(joystick(0, 0, 0, accent), -14, deck.len * 0.5, 0, PI / 2))
  for (let i = 0; i < 6; i++) {
    const bx = 4 + (i % 3) * 7.5
    const by = deck.len * (i < 3 ? 0.66 : 0.34) + (i % 3) * 0.8
    deck.g.add(P(cyl(2.2, 2.4, 1.2, i % 2 ? accent : '#f2f2ee', {}, 14), bx, by, 0, PI / 2))
  }
  g.add(deck.g)
  // 屏幕：后仰的深色面板 + 发光画面
  const scr = tiltFrame([17, 100], [5, 150])
  scr.g.add(rbox(inner, scr.len, 2, DARK, { z: -1 }, 0.4))
  scr.g.add(
    paintPanel(
      inner - 12,
      scr.len - 10,
      'ls-arcade',
      (c, W, H) => {
        c.fillStyle = '#10142e'
        c.fillRect(0, 0, W, H)
        const u = W / 22
        // 星星
        c.fillStyle = '#6f7bd0'
        for (const [x, y] of [[2, 3], [9, 2], [17, 4], [5, 9], [14, 8], [19, 12], [3, 15], [11, 14]]) c.fillRect(x * u, y * u * (H / W) * 1.1, u * 0.35, u * 0.35)
        // 三排像素小怪
        const rows = ['#ff5ca8', '#ffd24a', '#5ad1ff']
        rows.forEach((col, r) => {
          c.fillStyle = col
          for (let k = 0; k < 5; k++) {
            const x = (2.4 + k * 3.7) * u
            const y = H * (0.14 + r * 0.14)
            c.fillRect(x, y, u * 2, u * 1.1)
            c.fillRect(x - u * 0.4, y + u * 0.4, u * 2.8, u * 0.5)
            c.fillRect(x + u * 0.1, y + u * 1.1, u * 0.5, u * 0.5)
            c.fillRect(x + u * 1.4, y + u * 1.1, u * 0.5, u * 0.5)
          }
        })
        // 炮台和一发子弹
        c.fillStyle = '#7dff9a'
        c.fillRect(W * 0.44, H * 0.86, u * 2.6, u * 0.9)
        c.fillRect(W * 0.44 + u, H * 0.86 - u * 0.6, u * 0.6, u * 0.6)
        c.fillStyle = '#ffffff'
        c.fillRect(W * 0.44 + u * 1.15, H * 0.66, u * 0.3, u * 1.4)
      },
      { y: 5, z: 0.35 },
      0.85,
    ),
  )
  g.add(scr.g)
  // 灯箱底下的喇叭板、灯箱正面的发光条
  const spk = tiltFrame([5, 150], [24, 153])
  spk.g.add(rbox(inner, spk.len, 2, shade(panel, -0.2), { z: 1 }, 0.4))
  g.add(spk.g)
  g.add(rbox(inner, 21, 2, DARK, { y: 153, z: 22 }, 0.4))
  g.add(lit(rbox(inner - 6, 15, 0.8, accent, { y: 156, z: 23.4 }, 0.4), accent, 0.75))
  for (const sx of [-1, 1]) g.add(lit(rbox(10, 3, 0.5, '#ffffff', { x: sx * 12, y: 162, z: 24 }, 0.3), '#ffffff', 0.9))
  // 顶板（沿侧板顶边略微前低后高）
  const roof = tiltFrame([24, 174], [-42, 178])
  roof.g.add(rbox(inner, roof.len, 2, panel, { z: -1 }, 0.4))
  g.add(roof.g)
  return g
}

// ---------- 抓娃娃机：下柜带操作台和取物口，上面是四面玻璃的展示箱（里面一堆圆滚滚的玩偶和一只三爪抓手），顶上是灯箱 ----------

const CM = { w: 78, d: 84, h: 186, base: 80, glassTop: 160 }
function clawMachine(p: string[]) {
  const [body, accent, toyA, toyB] = p
  const g = new THREE.Group()
  const bd = CM.d - 6
  const bz = -3
  // 下柜 + 踢脚
  g.add(rbox(CM.w, CM.base - 4, bd, body, { y: 4, z: bz }, 2.5))
  g.add(rbox(CM.w - 6, 5, bd - 6, shade(body, -0.3), { z: bz }, 1))
  // 取物口：深色口 + 半开的翻板
  g.add(rbox(26, 20, 1, DARK, { x: -18, y: 14, z: bz + bd / 2 + 0.2 }, 0.6))
  g.add(P(ghost(rbox(24, 16, 0.6, '#cfe8f5', {}, 0.3), '#cfe8f5', 0.5), -18, 34, bz + bd / 2 + 1.2, -0.25))
  // 投币口面板
  g.add(rbox(16, 22, 1, shade(body, -0.18), { x: 20, y: 34, z: bz + bd / 2 + 0.2 }, 0.6))
  g.add(lit(rbox(5, 1.2, 0.6, '#ffd24a', { x: 20, y: 48, z: bz + bd / 2 + 0.7 }, 0.2), '#ffd24a', 0.7))
  g.add(rbox(7, 7, 0.8, STEEL, { x: 20, y: 37, z: bz + bd / 2 + 0.6 }, 0.6))
  // 操作台：从柜面探出来的一条台子，上面一根摇杆、一颗大按钮
  g.add(rbox(CM.w - 4, 5, 12, accent, { y: CM.base - 7, z: CM.d / 2 - 6 }, 1.6))
  g.add(joystick(-12, CM.base - 2, CM.d / 2 - 6, '#e8483f'))
  g.add(cyl(3.4, 3.8, 1.4, '#f2f2ee', { x: 12, y: CM.base - 2, z: CM.d / 2 - 6 }, 16))
  g.add(lit(cyl(2.8, 2.8, 1.2, '#ffd24a', { x: 12, y: CM.base - 1.2, z: CM.d / 2 - 6 }, 16), '#ffd24a', 0.6))
  // 展示箱：底板、四根角柱、四面玻璃
  const gh = CM.glassTop - CM.base
  g.add(rbox(CM.w - 4, 2, bd - 4, '#f6f2ea', { y: CM.base - 1, z: bz }, 0.5))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(4, gh, 4, accent, { x: sx * (CM.w / 2 - 2), y: CM.base, z: bz + sz * (bd / 2 - 2) }, 0.8))
  for (const sz of [-1, 1]) g.add(glassPane(CM.w - 8, gh, 0.8, { y: CM.base, z: bz + sz * (bd / 2 - 2) }))
  for (const sx of [-1, 1]) g.add(P(glassPane(bd - 8, gh, 0.8, { y: CM.base, z: 0 }), sx * (CM.w / 2 - 2), CM.base + gh / 2, bz, 0, PI / 2))
  // 出货筒：左前角一只透明圆筒
  g.add(ghost(cyl(10, 10, 24, '#cfe8f5', { x: -24, y: CM.base + 1, z: bz + bd / 2 - 16 }, 20), '#cfe8f5', 0.3))
  // 玩偶堆：两种颜色交替的圆球，各带一对小耳朵（不加脸：玻璃后面太小看不清）
  const toys: [number, number, number, number][] = [
    [8, 8, -22, 0],
    [24, 7.5, -12, 0],
    [-8, 7.5, -24, 0],
    [16, 7, 6, 0],
    [-2, 8, -6, 0],
    [26, 7, 20, 0],
    [0, 7.5, 16, 0],
    [-24, 7, -6, 0],
    [10, 7, -8, 12],
    [-6, 6.5, 6, 12.5],
    [20, 6.5, 2, 11],
  ]
  toys.forEach(([x, r, z, lift], i) => {
    const c = [toyA, toyB, '#fbf7f1'][i % 3]
    const y = CM.base + 1 + r * 0.9 + lift
    g.add(ball(r, c, { x, y, z: bz + z }, [1, 0.92, 1]))
    for (const s of [-1, 1]) g.add(ball(r * 0.3, shade(c, -0.06), { x: x + s * r * 0.55, y: y + r * 0.78, z: bz + z }))
  })
  // 抓手：顶上的横梁和小车、垂下来的钢索、三只弯爪
  const cy = CM.glassTop - 1.2
  // 横梁贴着灯箱底、两头搭在左右玻璃的上沿
  g.add(rbox(CM.w - 6, 2.4, 3, STEEL, { y: cy - 1.2, z: bz + 4 }, 0.6))
  g.add(rbox(9, 5, 8, shade(accent, -0.1), { x: 6, y: cy - 5, z: bz + 4 }, 1))
  g.add(cyl(0.35, 0.35, 22, DARK, { x: 6, y: cy - 27, z: bz + 4 }, 6))
  g.add(cyl(2.2, 2.6, 4, STEEL, { x: 6, y: cy - 31, z: bz + 4 }, 12))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.5
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    g.add(
      tube(
        [
          [6 + cx * 1.6, cy - 30, bz + 4 + cz * 1.6],
          [6 + cx * 7, cy - 35, bz + 4 + cz * 7],
          [6 + cx * 7.5, cy - 41, bz + 4 + cz * 7.5],
          [6 + cx * 4, cy - 45, bz + 4 + cz * 4],
        ],
        0.55,
        STEEL,
        { seg: 10, radial: 6 },
      ),
    )
  }
  // 顶部灯箱
  g.add(rbox(CM.w, CM.h - CM.glassTop, bd, body, { y: CM.glassTop, z: bz }, 2.5))
  g.add(lit(rbox(CM.w - 12, CM.h - CM.glassTop - 10, 0.8, accent, { y: CM.glassTop + 5, z: bz + bd / 2 + 0.1 }, 0.4), accent, 0.7))
  for (let k = 0; k < 5; k++) g.add(lit(ball(1.6, '#fff6d8', { x: -24 + k * 12, y: CM.glassTop + (CM.h - CM.glassTop) / 2, z: bz + bd / 2 + 0.9 }), '#fff6d8', 0.9))
  return g
}

// ---------- 弹珠台：四条细腿撑着前低后高的斜箱，玻璃下面是球道（弹射柱、挡板、斜坡），后面立着发光的背箱 ----------

const PB = { w: 76, d: 142, h: 186 }
/** 玻璃面（球道框的顶边）在侧视图里的两端：前面矮、后面高 */
const PB_GLASS: [[number, number], [number, number]] = [
  [66, 96],
  [-38, 122],
]
/** 箱体侧面轮廓：顶边比玻璃面低 5.2，球道面和四周的框落在它上面 */
const PB_SIDE: [number, number][] = [
  [66, 70],
  [66, PB_GLASS[0][1] - 5.2],
  [-38, PB_GLASS[1][1] - 5.2],
  // 箱体一直延伸到背箱底下（背箱坐在箱体后端上）
  [-62, 122],
  [-62, 80],
]
function pinball(p: string[]) {
  const [body, accent, field] = p
  const g = new THREE.Group()
  const bw = PB.w - 6
  g.add(sideSlab(PB_SIDE, bw, body))
  // 四条镀铬腿（略微外撇）
  for (const sx of [-1, 1]) {
    g.add(rod3([sx * (bw / 2 + 1), 0, 64], [sx * (bw / 2 - 1), 80, 62], 1.6, STEEL, 8))
    g.add(rod3([sx * (bw / 2 + 1), 0, -42], [sx * (bw / 2 - 1), 92, -36], 1.6, STEEL, 8))
    for (const z of [64, -42]) g.add(cyl(2.4, 2.8, 1.2, RUBBER, { x: sx * (bw / 2 + 1), z }, 10))
  }
  // 侧面的色带
  for (const s of [-1, 1]) g.add(noOutline(P(rbox(0.5, 9, 96, accent, {}, 0.2), s * (bw / 2 + 0.05), 92, 14, 0.245)))
  // 球道面（在斜面坐标系里摆）：台面、四周的木框、玻璃
  const top = tiltFrame(...PB_GLASS)
  // 球道板和四周的框都往下伸进箱体顶面（玻璃面以下约 5cm 处），不留缝
  top.g.add(rbox(bw - 5, top.len - 5, 3.2, field, { y: 2.5, z: -3.8 }, 0.3))
  for (const sx of [-1, 1]) top.g.add(rbox(2.5, top.len, 5.8, shade(body, -0.2), { x: sx * (bw / 2 - 1.25), z: -2.8 }, 0.5))
  top.g.add(rbox(bw - 5, 2.5, 5.8, shade(body, -0.2), { y: 0, z: -2.8 }, 0.5))
  top.g.add(rbox(bw - 5, 2.5, 5.8, shade(body, -0.2), { y: top.len - 2.5, z: -2.8 }, 0.5))
  // 弹射柱（三只发光蘑菇头）
  for (const [x, y, c] of [
    [-12, 78, '#ff5ca8'],
    [10, 84, '#ffd24a'],
    [-2, 66, '#5ad1ff'],
  ] as [number, number, string][]) {
    top.g.add(P(cyl(4.2, 4.2, 1.6, '#f2f2ee', {}, 16), x, y, -1.9, PI / 2))
    top.g.add(lit(P(cyl(3.2, 3.6, 1, c, {}, 16), x, y, -0.6, PI / 2), c, 0.7))
  }
  // 两片挡板、中间的出球口、右侧的发射道
  for (const s of [-1, 1]) top.g.add(P(rbox(11, 2.4, 1.6, '#f2f2ee', {}, 0.7), s * 8, 16, -1.9, 0, 0, s * 0.5))
  for (const s of [-1, 1]) top.g.add(P(rbox(1.4, 26, 1.6, accent, {}, 0.5), s * 20, 30, -1.9, 0, 0, s * -0.45))
  top.g.add(rbox(1.2, top.len - 30, 1.8, STEEL, { x: bw / 2 - 8, y: 6, z: -2.9 }, 0.4))
  top.g.add(P(ball(1.35, STEEL, {}), bw / 2 - 5.2, 9, -1.4))
  // 上半场的弧形导轨和一条斜坡
  top.g.add(P(noOutline(torus(22, 0.7, STEEL, {}, PI)), 0, top.len - 30, -1.8))
  top.g.add(P(rbox(7, 30, 0.8, shade(accent, 0.2), {}, 0.3), -22, 62, -1.6, 0, 0, 0.25))
  top.g.add(ghost(rbox(bw - 5, top.len - 5, 0.5, '#cfe8f5', { y: 2.5, z: -0.5 }, 0.2), '#cfe8f5', 0.18))
  g.add(top.g)
  // 前脸：投币门、开始按钮、弹簧拉杆；两侧的挡板按钮
  g.add(rbox(22, 16, 1, shade(body, -0.3), { y: 73, z: 66.2 }, 0.5))
  g.add(lit(cyl(1.8, 1.8, 1, '#ffd24a', { x: -22, y: 86, z: 66.6, rx: PI / 2 }, 12), '#ffd24a', 0.7))
  g.add(cylZ(0.9, 7, STEEL, 24, 86, 69.5, 8))
  g.add(cylZ(2, 3, DARK, 24, 86, 73.5, 12))
  for (const s of [-1, 1]) g.add(lit(P(cyl(1.8, 1.8, 1, '#ff5a4a', {}, 12), s * (bw / 2 + 0.4), 88, 56, 0, 0, PI / 2), '#ff5a4a', 0.6))
  // 背箱：箱体 + 发光背板画
  g.add(rbox(PB.w, 64, 26, body, { y: PB.h - 64, z: -54 }, 1.6))
  g.add(
    paintPanel(
      PB.w - 10,
      54,
      'ls-pinball',
      (c, W, H) => {
        const grd = c.createLinearGradient(0, 0, 0, H)
        grd.addColorStop(0, '#2a1650')
        grd.addColorStop(1, '#d6438a')
        c.fillStyle = grd
        c.fillRect(0, 0, W, H)
        // 放射光芒
        c.strokeStyle = 'rgba(255, 220, 120, 0.55)'
        c.lineWidth = W * 0.02
        for (let k = 0; k < 9; k++) {
          const a = PI + (k / 8) * PI
          c.beginPath()
          c.moveTo(W / 2, H * 0.95)
          c.lineTo(W / 2 + Math.cos(a) * W, H * 0.95 + Math.sin(a) * W)
          c.stroke()
        }
        // 大银球和高光
        c.fillStyle = '#e6e9ef'
        c.beginPath()
        c.arc(W / 2, H * 0.56, H * 0.24, 0, PI * 2)
        c.fill()
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.arc(W * 0.46, H * 0.48, H * 0.07, 0, PI * 2)
        c.fill()
        // 顶上的计分窗
        c.fillStyle = '#12091f'
        c.fillRect(W * 0.2, H * 0.07, W * 0.6, H * 0.15)
        c.fillStyle = '#ffb347'
        for (let k = 0; k < 6; k++) c.fillRect(W * (0.24 + k * 0.09), H * 0.1, W * 0.05, H * 0.09)
      },
      { y: PB.h - 59, z: -40.65 },
      0.8,
    ),
  )
  // 前面的拉杆比背箱多探出一截：按包围盒前后居中
  return fitGroup(g)
}

// ---------- 点唱机：拱顶的复古落地点唱机——发光的拱形灯管和两侧灯柱、中间的唱片窗、下面的喇叭格栅 ----------

const JB = { w: 80, d: 62, h: 152 }
function jukebox(p: string[]) {
  const [wood, tubeA, tubeB, metal] = p
  const g = new THREE.Group()
  const r = JB.w / 2
  const sh = JB.h - r
  // 机身：正面是「矩形 + 半圆」的拱形，沿前后挤出
  const s = new THREE.Shape()
  s.moveTo(-r, 4)
  s.lineTo(r, 4)
  s.lineTo(r, sh)
  s.absarc(0, sh, r, 0, PI, false)
  s.lineTo(-r, 4)
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: JB.d - 6 - 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelOffset: -1.5, bevelSegments: 2, curveSegments: 20 })
  bodyGeo.translate(0, 0, -JB.d / 2 + 1.5)
  g.add(mesh(bodyGeo, wood))
  g.add(rbox(JB.w - 6, 5, JB.d - 12, shade(wood, -0.3), { z: -4 }, 1))
  const fz = JB.d / 2 - 6
  // 拱形灯管两圈 + 两侧灯柱
  g.add(lit(P(torus(r - 5, 2.6, tubeA, {}, PI), 0, sh, fz + 1.4), tubeA, 0.75))
  g.add(lit(P(torus(r - 11.5, 2.2, tubeB, {}, PI), 0, sh, fz + 1.2), tubeB, 0.75))
  for (const sx of [-1, 1]) {
    g.add(lit(cyl(2.6, 2.6, sh - 10, tubeA, { x: sx * (r - 5), y: 10, z: fz + 1.4 }, 12), tubeA, 0.75))
    g.add(lit(cyl(2.2, 2.2, sh - 56, tubeB, { x: sx * (r - 11.5), y: 56, z: fz + 1.2 }, 12), tubeB, 0.75))
    g.add(cyl(3.4, 3.8, 10, metal, { x: sx * (r - 5), z: fz + 1.4 }, 12))
  }
  // 唱片窗：深色窗 + 一张斜放的唱片和唱臂
  g.add(rbox(46, 34, 1, DARK, { y: sh - 14, z: fz + 0.3 }, 3))
  g.add(P(G(cyl(13, 13, 0.6, '#1b1b1f', {}, 24), noOutline(cyl(4.4, 4.4, 0.5, tubeA, { y: 0.4 }, 16)), noOutline(cyl(0.8, 0.8, 0.6, metal, { y: 0.7 }, 8))), 0, sh + 2, fz + 2.2, PI / 2 - 0.25))
  g.add(rod3([15, sh + 14, fz + 2.6], [6, sh + 5, fz + 3.2], 0.6, metal, 6))
  // 选曲按钮条
  g.add(rbox(50, 6, 2, metal, { y: sh - 24, z: fz + 0.4 }, 0.8))
  for (let k = 0; k < 8; k++) g.add(noOutline(rbox(3.6, 2.6, 0.6, k % 2 ? '#f6efd9' : '#e8483f', { x: -17.5 + k * 5, y: sh - 22.3, z: fz + 1.6 }, 0.4)))
  // 喇叭格栅：布面 + 菱形金属条
  g.add(rbox(48, 46, 1, '#3a2a22', { y: 12, z: fz + 0.3 }, 3))
  for (const sgn of [-1, 1]) for (let k = -2; k <= 2; k++) g.add(noOutline(P(rbox(1.2, 54, 0.6, metal, {}, 0.3), k * 11, 35, fz + 1.1, 0, 0, sgn * 0.55)))
  g.add(P(noOutline(torus(8, 1.2, metal, {}, PI * 2)), 0, 35, fz + 1.6))
  // 顶上的金属拱饰
  g.add(P(rbox(12, 5, 3, metal, {}, 1.2), 0, JB.h - 4, fz + 0.9))
  return g
}

// ---------- 按摩椅：圆润的外壳两侧是扶手舱，中间是后仰的靠背和头枕，前面连着包小腿的腿托和脚托 ----------

const MC = { w: 86, d: 134, h: 120 }
function massageChair(p: string[]) {
  const [shellC, pad, accent] = p
  const g = new THREE.Group()
  // 底座（两只扶手舱之间、座垫下面），后面一块封板把靠背外壳和底座接起来
  g.add(rbox(60, 30, 80, shade(shellC, -0.08), { z: -18 }, 5))
  g.add(P(rbox(52, 44, 8, shellC, {}, 3), 0, 30, -56, -0.3))
  // 两侧扶手舱：圆润的大块外壳 + 顶上的手臂槽 + 侧面的装饰弧线
  for (const s of [-1, 1]) {
    g.add(rbox(17, 46, 92, shellC, { x: s * 32.5, y: 10, z: -14 }, 8))
    g.add(rbox(10, 5, 50, pad, { x: s * 32.5, y: 52.5, z: 4 }, 2.4))
    g.add(noOutline(P(torus(26, 1.3, accent, {}, PI * 0.8), s * 41.2, 26, -12, 0, PI / 2, PI * 0.1)))
  }
  // 座垫
  g.add(rbox(48, 14, 56, pad, { y: 30, z: 2 }, 5))
  // 靠背（往后仰）+ 外壳背板 + 头枕 + 肩部两只气囊
  g.add(P(rbox(52, 84, 16, pad, {}, 6), 0, 78, -38, -0.3))
  g.add(P(rbox(60, 90, 12, shellC, {}, 6), 0, 76, -47, -0.3))
  g.add(P(rbox(30, 16, 9, accent, {}, 4), 0, 106, -40, -0.3))
  for (const s of [-1, 1]) g.add(P(rbox(11, 26, 18, shellC, {}, 5), s * 26, 86, -32, -0.3))
  // 腿托：斜着的小腿槽（两条凹槽用深色衬垫表现）+ 落地的脚托
  g.add(P(rbox(48, 42, 20, shellC, {}, 6), 0, 26, 40, 0.5))
  for (const s of [-1, 1]) g.add(P(rbox(15, 36, 4, pad, {}, 2), s * 10.5, 31, 47.5, 0.5))
  g.add(rbox(48, 18, 30, shellC, { z: 52 }, 6))
  for (const s of [-1, 1]) g.add(rbox(15, 4, 22, pad, { x: s * 10.5, y: 15.5, z: 52 }, 1.8))
  // 右扶手上的遥控器
  g.add(P(rbox(6, 1.6, 13, DARK, {}, 0.6), 32.5, 56.4, -6, -0.15))
  g.add(noOutline(lit(P(rbox(4.4, 0.4, 5, '#8fd8ff', {}, 0.2), 32.5, 57.5, -9, -0.15), '#8fd8ff', 0.6)))
  return g
}

// ---------- 赛车模拟器：型材底架上一头是桶形座椅，另一头立着方向盘台、踏板和显示器（显示器那头靠墙，座椅背对房间） ----------

const SR = { w: 72, d: 156, h: 126 }
function simRig(p: string[]) {
  const [frame, seat, accent] = p
  const g = new THREE.Group()
  // 底架：两根长型材 + 三根横档 + 调平脚
  for (const s of [-1, 1]) {
    g.add(rbox(4, 4, 150, frame, { x: s * 24, y: 2, z: 0 }, 0.6))
    for (const z of [-70, 0, 70]) g.add(cyl(2.4, 2.8, 2, RUBBER, { x: s * 24, z }, 10))
  }
  for (const z of [-66, -8, 38]) g.add(rbox(52, 4, 4, frame, { y: 2, z }, 0.6))
  // 显示器（靠 -z 一端，屏幕朝 +z 对着座椅）：立柱 + 屏幕 + 发光画面
  g.add(rbox(5, 78, 5, frame, { y: 6, z: -70 }, 0.8))
  g.add(rbox(72, 42, 3.5, DARK, { y: 82, z: -68 }, 1.2))
  g.add(
    paintPanel(
      68,
      38,
      'ls-sim-rig',
      (c, W, H) => {
        // 天空、远山、赛道（透视梯形）和路肩的红白条
        c.fillStyle = '#7ec4f2'
        c.fillRect(0, 0, W, H * 0.5)
        c.fillStyle = '#5f9a6a'
        c.beginPath()
        c.moveTo(0, H * 0.5)
        c.lineTo(W * 0.3, H * 0.32)
        c.lineTo(W * 0.55, H * 0.46)
        c.lineTo(W * 0.8, H * 0.3)
        c.lineTo(W, H * 0.5)
        c.fill()
        c.fillStyle = '#6fb26a'
        c.fillRect(0, H * 0.5, W, H * 0.5)
        c.fillStyle = '#4a4d55'
        c.beginPath()
        c.moveTo(W * 0.46, H * 0.5)
        c.lineTo(W * 0.56, H * 0.5)
        c.lineTo(W * 0.95, H)
        c.lineTo(W * 0.1, H)
        c.fill()
        c.fillStyle = '#f4f4f2'
        for (let k = 0; k < 4; k++) {
          const t0 = k / 4 + 0.05
          const t1 = t0 + 0.1
          const x = (t: number) => W * (0.51 + (0.525 - 0.51) * t)
          c.fillRect(x(t0) - W * 0.006 * (1 + t0 * 3), H * (0.5 + t0 * 0.5), W * 0.012 * (1 + t0 * 3), H * (t1 - t0) * 0.5)
        }
        // 仪表条
        c.fillStyle = 'rgba(20, 22, 30, 0.75)'
        c.fillRect(W * 0.36, H * 0.84, W * 0.28, H * 0.12)
        c.fillStyle = '#ff5a4a'
        c.fillRect(W * 0.38, H * 0.87, W * 0.16, H * 0.06)
      },
      { y: 84, z: -66.1 },
      0.85,
    ),
  )
  // 方向盘台：两根立柱 + 台板 + 基座 + 方向盘（朝 +z 对着座椅）
  for (const s of [-1, 1]) g.add(rbox(4, 62, 4, frame, { x: s * 24, y: 4, z: -38 }, 0.6))
  g.add(rbox(52, 3, 20, frame, { y: 64, z: -36 }, 0.8))
  g.add(rbox(24, 13, 18, DARK, { y: 67, z: -37 }, 2))
  g.add(cylZ(2.2, 9, DARK, 0, 74, -24, 12))
  g.add(P(torus(15, 1.8, RUBBER, {}, PI * 2), 0, 74, -19))
  for (const a of [PI * 0.5, PI * 1.17, PI * 1.83]) g.add(rod3([0, 74, -19.6], [Math.cos(a) * 14, 74 + Math.sin(a) * 14, -19.6], 1.3, STEEL, 8))
  g.add(noOutline(P(rbox(3, 1.4, 4.2, accent, {}, 0.5), 0, 89, -19, PI / 2)))
  // 踏板：斜板 + 三只踏板
  g.add(P(rbox(44, 3, 28, frame, {}, 0.8), 0, 10, -52, 0.45))
  for (const [x, c] of [
    [-13, STEEL],
    [0, STEEL],
    [13, accent],
  ] as [number, string][])
    g.add(P(rbox(7, 14, 2, c, {}, 0.8), x, 16.5, -51, 0.9))
  // 排挡：右侧一只小盒 + 挡杆
  g.add(rbox(10, 10, 16, DARK, { x: 31, y: 52, z: -6 }, 1.6))
  g.add(rbox(4, 46, 4, frame, { x: 26, y: 6, z: -6 }, 0.6))
  g.add(cyl(0.8, 0.8, 12, STEEL, { x: 31, y: 62, z: -6 }, 8))
  g.add(ball(2.4, accent, { x: 31, y: 75, z: -6 }))
  // 桶形座椅（面朝 -z）：滑轨、坐垫、两侧护翼、靠背和头枕
  for (const s of [-1, 1]) g.add(rbox(4, 14, 44, frame, { x: s * 18, y: 6, z: 40 }, 0.8))
  g.add(rbox(44, 10, 46, seat, { y: 20, z: 40 }, 4))
  for (const s of [-1, 1]) g.add(rbox(8, 16, 42, seat, { x: s * 20, y: 22, z: 38 }, 3.5))
  g.add(P(rbox(44, 66, 11, seat, {}, 5), 0, 60, 66, 0.2))
  for (const s of [-1, 1]) g.add(P(rbox(8, 44, 15, seat, {}, 3.5), s * 20, 56, 62, 0.2))
  g.add(P(rbox(26, 20, 9, seat, {}, 4), 0, 100, 73.6, 0.2))
  // 椅面和靠背中间的装饰色条
  g.add(noOutline(rbox(8, 0.6, 40, accent, { y: 29.8, z: 38 }, 0.3)))
  g.add(noOutline(P(rbox(8, 52, 0.6, accent, {}, 0.3), 0, 61, 60.4, 0.2)))
  return g
}

// ---------- 配色 ----------

const PP_PALS: Pal[] = [
  ['modern', ['#2f6fb5', M.char, M.black]],
  ['modern', ['#2e7d5b', M.char, M.black]],
  ['industrial', ['#34373d', I.iron, I.rust]],
  ['nordic', ['#4f8fc0', N.white, N.oak]],
]
const FB_PALS: Pal[] = [
  ['nordic', [N.oak, '#4f9e5b', '#d8483f', '#3f7fd8']],
  ['modern', [M.char, '#3f8f5a', '#e8483f', '#f2c230']],
  ['retro', [R.caramel, '#3f8f5a', R.red, R.mustard]],
  ['industrial', [I.walnut, '#4a8a58', I.rust, I.steel]],
  ['cute', [C.woodL, '#8fd49a', C.pink, C.sky]],
]
const AH_PALS: Pal[] = [
  ['modern', [M.char, '#3f7fd8', '#e8483f']],
  ['modern', [M.white, M.black, '#3f7fd8']],
  ['retro', [R.teal, R.cream, R.orange]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
const AR_PALS: Pal[] = [
  ['modern', ['#2b2b30', '#ff5ca8', '#3a3b42']],
  ['retro', ['#2c3e6b', '#ffd24a', '#22304f']],
  ['retro', ['#7a2b2b', '#f4e7c8', '#3a2a2a']],
  ['industrial', [I.iron, '#5ad1ff', '#2c2c2e']],
  ['cute', [C.pink, '#fff3a8', '#f7dfe6']],
]
const CM_PALS: Pal[] = [
  ['cute', [C.pink, '#fff3a8', C.sky, C.lilac]],
  ['cute', [C.sky, C.white, C.peach, C.mint]],
  ['modern', [M.white, '#ff5ca8', '#ffd24a', '#5ad1ff']],
  ['retro', [R.red, R.cream, R.mustard, R.teal]],
  ['modern', [M.char, '#7a5cff', '#ff8fb4', '#7fe0c8']],
]
const PB_PALS: Pal[] = [
  ['retro', ['#2c3e6b', '#ffb347', '#2f8f8a']],
  ['retro', ['#7a2b2b', '#f4e7c8', '#3f6f9a']],
  ['modern', ['#2b2b30', '#ff5ca8', '#3a2a66']],
  ['industrial', [I.iron, I.rust, '#3d4a52']],
]
const JB_PALS: Pal[] = [
  ['retro', [R.caramel, '#ff9a3d', '#ffe27a', '#d9b45a']],
  ['retro', ['#6b3a2a', '#ff6f91', '#7fe0ff', '#c9ced6']],
  ['classic', ['#7a4b32', '#ffb347', '#ff6f6f', '#c8a96a']],
  ['modern', [M.black, '#7a5cff', '#36d1c4', M.silver]],
]
const MC_PALS: Pal[] = [
  ['modern', [M.char, '#8a6a52', '#c9a25a']],
  ['modern', [M.white, '#3d3f44', '#5ad1ff']],
  ['nordic', [N.linen, '#b7a48e', N.mustard]],
  ['classic', ['#5a3b2a', '#c9a98a', '#c8a96a']],
  ['modern', ['#7a2e3a', '#2b2b30', M.silver]],
]
const SR_PALS: Pal[] = [
  ['modern', [M.char, M.black, '#e8483f']],
  ['modern', [M.silver, '#2b2b30', '#3f7fd8']],
  ['industrial', [I.iron, I.leather, I.rust]],
  ['modern', [M.black, '#f4f4f2', '#7a5cff']],
]

const GAME_TABLE: Partial<AssetDef> = { type: 'sports-gear', tags: ['table', 'hobby:sports'] }
const CABINET_GAME: Partial<AssetDef> = { type: 'video-game', tags: ['hobby:gaming'] }

export const LEISURE: AssetDef[] = [
  define('ls-pingpong', '乒乓球桌', 'fitness', [PP.w, PP.d + PP.over * 2, PP.h + PP.net], PP_PALS, pingpong, {
    ...GAME_TABLE,
    mats: ['wood', 'metal', 'metal'],
    surface: PP.h,
    // 网两侧各一块（网和夹柱那一条不放东西）
    surfaceShape: [rectPoly(-PP.w / 2 + 2, -PP.d / 2 + 2, -6, PP.d / 2 - 2), rectPoly(6, -PP.d / 2 + 2, PP.w / 2 - 2, PP.d / 2 - 2)],
  }),
  define('ls-foosball', '桌上足球', 'hobby', [FB.w, FB.d, FB.h + 4], FB_PALS, foosball, {
    ...GAME_TABLE,
    mats: ['wood', 'fabric', 'plastic', 'plastic'],
  }),
  define('ls-air-hockey', '空气曲棍球桌', 'hobby', [AH.w, AH.d, AH.h + 5], AH_PALS, airHockey, {
    ...GAME_TABLE,
    mats: ['plastic', 'plastic', 'plastic'],
  }),
  define('ls-arcade', '街机柜', 'hobby', [AR.w, AR.d, AR.h], AR_PALS, arcade, {
    ...CABINET_GAME,
    mats: ['wood', 'plastic', 'wood'],
  }),
  define('ls-claw-machine', '抓娃娃机', 'hobby', [CM.w, CM.d, CM.h], CM_PALS, clawMachine, {
    ...CABINET_GAME,
    mats: ['metal', 'plastic', 'pile', 'pile'],
  }),
  define('ls-pinball', '弹珠台', 'hobby', [PB.w, PB.d, PB.h], PB_PALS, pinball, {
    ...CABINET_GAME,
    styles: ['retro', 'modern', 'industrial'],
    mats: ['wood', 'plastic', 'wood'],
  }),
  define('ls-jukebox', '点唱机', 'hobby', [JB.w, JB.d, JB.h], JB_PALS, jukebox, {
    type: 'audio',
    tags: ['hobby:music'],
    mats: ['wood', 'glass', 'glass', 'metal'],
  }),
  define('ls-massage-chair', '按摩椅', 'living', [MC.w, MC.d, MC.h], MC_PALS, massageChair, {
    type: 'appliance',
    tags: ['seat'],
    mats: ['plastic', 'leather', 'metal'],
  }),
  define('ls-sim-rig', '赛车模拟器', 'hobby', [SR.w, SR.d, SR.h], SR_PALS, simRig, {
    ...CABINET_GAME,
    mats: ['metal', 'fabric', 'plastic'],
  }),
]
