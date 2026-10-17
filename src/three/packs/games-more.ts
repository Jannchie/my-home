// 更多棋牌桌游素材包（全是桌面摆件，由一键布置摆到牌桌 / 餐桌 / 矮桌上，桌边留座位）：
//   中式：军旗（陆战棋）、斗兽棋、飞行棋、五子棋、扑克牌局（斗地主 / 掼蛋）、牌九（骨牌）；
//   日式：花札（座布团上对局）、双六；
//   欧美：国际跳棋（checkers）、地产大亨式桌游（自创图案）、拼字游戏（字母方块）、扑克筹码箱、德州扑克牌局、多米诺骨牌、叠叠乐（抽到一半）；
//   通用：桌游盒子摞、骰子、计分本。
// 将棋、围棋、象棋、国际象棋、黑白棋、跳棋（星形）、双陆、花札（发牌 / 盒）、百人一首、UNO 风卡牌在 interests.ts，这里不重复。
// 全部 id 以 bg- 开头（gm- 已被服装包占用）；interests.ts 里有 int-bg-*，找本包的素材请用锚定的 /^bg-/。
// 约定见 kit.ts 开头。

import * as THREE from 'three'
import { ball, cup, cyl, rbox, shade, toon, tray } from '../toon'
import { C, paintPanel, rng, type AssetCategory, type AssetDef } from '../kit'
import { G, P, PI, fitGroup, noOutline } from '../geo'
import { CL, CN, F, I, J, M, N, R, type PalFlat } from '../packkit'

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void
const IVORY = '#f6f0e1'
const PAPER = '#fbf8f0'
const DARK = '#26262a'
const RED = '#c8302a'

function def(id: string, name: string, category: AssetCategory, [w, d, h]: [number, number, number], pals: PalFlat[], build: (p: string[]) => THREE.Group, extra: Partial<AssetDef> = {}): AssetDef {
  return { id, name, category, w, d, h, palettes: pals.map((x) => x.slice(1)), paletteStyles: pals.map((x) => x[0]), styles: [...new Set(pals.map((x) => x[0]))], build, prop: true, ...extra }
}
/** 平放的画面：w × d，(x, z) 为中心，y 为高度 */
const paintTop = (w: number, d: number, key: string, draw: Draw, x: number, y: number, z: number, ry = 0) => {
  const m = paintPanel(w, d, key, draw, { x: 0, y: 0, z: d / 2, rx: -PI / 2 })
  return P(G(m), x, y, z, 0, ry)
}
/** 一块平板棋盘：板身 + 顶面画面；返回 [组, 顶面高度] */
function board(w: number, d: number, t: number, wood: string, key: string, draw: Draw): [THREE.Group, number] {
  const g = new THREE.Group()
  g.add(rbox(w, t, d, wood, {}, Math.min(0.5, t / 2.2)))
  g.add(paintTop(w - 1, d - 1, key, draw, 0, t + 0.04, 0))
  return [g, t + 0.05]
}
const lineGrid = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
  c.beginPath()
  for (let i = 0; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / (nx - 1)
    c.moveTo(x, y0)
    c.lineTo(x, y1)
  }
  for (let j = 0; j < ny; j++) {
    const y = y0 + ((y1 - y0) * j) / (ny - 1)
    c.moveTo(x0, y)
    c.lineTo(x1, y)
  }
  c.stroke()
}

// ---------- 小部件：牌、骰子、圆片棋子 ----------

const CARD_W = 6.3
const CARD_D = 8.8
/** 一张平放的扑克牌：背朝上（背色 + 白边）或面朝上（白底 + 角上花色）；(x, y, z) 为底面中心，ry 转角 */
function card(back: string, faceUp: boolean, x: number, y: number, z: number, ry = 0, suit = 0, w = CARD_W, d = CARD_D) {
  const g = new THREE.Group()
  g.add(rbox(w, 0.22, d, faceUp ? PAPER : '#ffffff', {}, 0.08))
  if (faceUp) {
    const col = suit % 2 ? RED : DARK
    g.add(noOutline(rbox(w * 0.22, 0.05, w * 0.22, col, { x: -w * 0.3, y: 0.22, z: -d * 0.34 }, 0.02)))
    g.add(noOutline(rbox(w * 0.36, 0.05, w * 0.36, col, { y: 0.22 }, 0.02)))
  } else g.add(noOutline(rbox(w - 0.8, 0.05, d - 0.8, back, { y: 0.22 }, 0.05)))
  return P(g, x, y, z, 0, ry)
}
/** 一副叠好的牌：n 张高 */
function deck(back: string, x: number, y: number, z: number, ry = 0, h = 1.6, w = CARD_W, d = CARD_D) {
  const g = G(rbox(w, h, d, '#f4f1ea', {}, 0.15), noOutline(rbox(w - 0.8, 0.05, d - 0.8, back, { y: h }, 0.05)))
  return P(g, x, y, z, 0, ry)
}
/** 扇形摊开的一手牌（背朝上，平放在桌上）：围绕 (x, z) 处、朝 dir 方向（ry）展开 n 张 */
function fan(back: string, n: number, x: number, y: number, z: number, ry: number, spread = 0.09, faceUp = false) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * spread
    const c = card(back, faceUp, 0, i * 0.07, 0, a, i)
    // 绕牌底端转：底端在原点下方 CARD_D / 2
    c.position.set(Math.sin(a) * CARD_D * 0.5, i * 0.07, -Math.cos(a) * CARD_D * 0.5 + CARD_D * 0.5)
    g.add(c)
  }
  return P(g, x, y, z, 0, ry)
}
/** 骰子：边长 s，顶面 / 正面 / 右面的点数；(x, y, z) 为底面中心 */
function die(s: number, body: string, pip: string, x: number, y: number, z: number, ry = 0, top = 5) {
  const g = new THREE.Group()
  g.add(rbox(s, s, s, body, {}, s * 0.2))
  const r = s * 0.09
  const q = s * 0.26
  const LAY: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  }
  const pc = (n: number) => (n === 1 && pip === DARK ? RED : pip)
  for (const [u, v] of LAY[top]) g.add(noOutline(ball(r, pc(top), { x: u * q, y: s + 0.02, z: v * q }, [1, 0.3, 1])))
  const front = top === 1 ? 2 : 1
  for (const [u, v] of LAY[front]) g.add(noOutline(ball(r, pc(front), { x: u * q, y: s / 2 + v * q, z: s / 2 + 0.02 }, [1, 1, 0.3])))
  const side = top === 3 || top === 4 ? 2 : 3
  for (const [u, v] of LAY[side]) g.add(noOutline(ball(r, pc(side), { x: s / 2 + 0.02, y: s / 2 + v * q, z: u * q }, [0.3, 1, 1])))
  return P(g, x, y, z, 0, ry)
}
/** 圆片棋子（跳棋 / 斗兽棋 / 筹码）：顶面一圈浅色 */
function disc(r: number, h: number, color: string, x: number, y: number, z: number, ring = true) {
  const g = G(cyl(r, r, h, color, {}, 20))
  if (ring) g.add(noOutline(cyl(r * 0.62, r * 0.62, 0.06, shade(color, 0.14), { y: h }, 20)))
  return P(g, x, y, z)
}

// ---------- 军旗（陆战棋） ----------
// 5 列 × 12 行（每方 6 行），中间山界；每方 5 个行营（摆子时空着）、2 个大本营。棋子是平放的长方块。

const JQ_DX = 6.4
const JQ_DZ = 4.4
const JQ_GAP = 6
/** 第 r 行（0 = 靠山界）、第 c 列的位置；side = 1 我方（+z）、-1 对方 */
const jqPos = (c: number, r: number, side: number): [number, number] => [(c - 2) * JQ_DX, side * (JQ_GAP / 2 + 1.4 + r * JQ_DZ)]
const JQ_CAMP = new Set(['1,1', '3,1', '2,2', '1,3', '3,3'])
const jqDraw = (wood: string, line: string): Draw => (c, W, H) => {
  c.fillStyle = wood
  c.fillRect(0, 0, W, H)
  const sx = W / 34
  const sz = H / 56
  const X = (x: number) => W / 2 + x * sx
  const Z = (z: number) => H / 2 + z * sz
  c.strokeStyle = line
  c.lineWidth = Math.max(1, W / 260)
  for (const side of [-1, 1]) {
    for (let r = 0; r < 6; r++) {
      const [x0, z] = jqPos(0, r, side)
      const [x1] = jqPos(4, r, side)
      c.lineWidth = r === 0 || r === 4 ? Math.max(2, W / 120) : Math.max(1, W / 260)
      c.beginPath()
      c.moveTo(X(x0), Z(z))
      c.lineTo(X(x1), Z(z))
      c.stroke()
    }
    for (let k = 0; k < 5; k++) {
      const [x, z0] = jqPos(k, 0, side)
      const [, z1] = jqPos(k, 5, side)
      c.lineWidth = k === 0 || k === 4 ? Math.max(2, W / 120) : Math.max(1, W / 260)
      c.beginPath()
      c.moveTo(X(x), Z(z0))
      c.lineTo(X(x), Z(z1))
      c.stroke()
    }
    // 站点：行营画圆，大本营画半圆，其余小方框
    for (let r = 0; r < 6; r++)
      for (let k = 0; k < 5; k++) {
        const [x, z] = jqPos(k, r, side)
        c.fillStyle = wood
        c.lineWidth = Math.max(1, W / 260)
        c.beginPath()
        if (JQ_CAMP.has(`${k},${r}`)) c.arc(X(x), Z(z), sx * 2.2, 0, PI * 2)
        else if (r === 5 && (k === 1 || k === 3)) c.arc(X(x), Z(z), sx * 2.4, side > 0 ? PI : 0, side > 0 ? PI * 2 : PI)
        else c.rect(X(x) - sx * 1.9, Z(z) - sz * 1.3, sx * 3.8, sz * 2.6)
        c.fill()
        c.stroke()
      }
  }
  // 山界：三条铁路穿过
  c.fillStyle = shade(wood, -0.08)
  c.fillRect(X(-16), Z(-JQ_GAP / 2 + 0.3), sx * 32, sz * (JQ_GAP - 0.6))
  c.lineWidth = Math.max(2, W / 120)
  for (const k of [0, 2, 4]) {
    const [x] = jqPos(k, 0, 1)
    c.beginPath()
    c.moveTo(X(x), Z(-JQ_GAP / 2 - 1.4))
    c.lineTo(X(x), Z(JQ_GAP / 2 + 1.4))
    c.stroke()
  }
}
/** 一枚军旗棋子：平放的长方块，顶面一道军衔色条 */
const jqPiece = (color: string, x: number, y: number, z: number, ry = 0, flipped = false) =>
  P(G(rbox(3.4, 0.9, 2.3, flipped ? '#e9e2cf' : color, {}, 0.3), noOutline(rbox(2.2, 0.05, 1, flipped ? shade(color, -0.1) : '#fff6e0', { y: 0.9 }, 0.1))), x, y, z, 0, ry)
function junqi(state: 'setup' | 'mid' | 'flip') {
  return ([wood, a, b]: string[]) => {
    const [g, y] = board(34, 56, 0.6, wood, `bg-jq-${wood}`, jqDraw(shade(wood, 0.08), '#3a2a1e'))
    const r = rng(state === 'mid' ? 21 : 7)
    for (const [side, col] of [[1, a], [-1, b]] as const)
      for (let row = 0; row < 6; row++)
        for (let k = 0; k < 5; k++) {
          if (JQ_CAMP.has(`${k},${row}`) && state !== 'flip') continue
          const [x, z] = jqPos(k, row, side)
          if (state === 'setup') g.add(jqPiece(col, x, y, z))
          else if (state === 'flip') {
            // 翻棋：60 枚全部背面朝上打乱摆，翻开了一些
            const open = r() < 0.35
            g.add(jqPiece(r() < 0.5 ? a : b, x, y, z, 0, !open))
          } else if (r() < 0.55) {
            // 对局中：一部分棋子被吃，剩下的往前推进了几步
            const adv = row > 1 && r() < 0.3 ? Math.max(0, row - 2) : row
            const [px, pz] = jqPos(k, adv, side)
            g.add(jqPiece(col, px, y, pz))
          }
        }
    if (state === 'mid') {
      // 被吃掉的子堆在两边桌上
      for (let i = 0; i < 7; i++) g.add(jqPiece(i % 2 ? a : b, 20.5 + (i % 2) * 0.6, i * 0.9, -6 + (i % 3) * 0.4, 0.3 * (i % 3)))
      for (let i = 0; i < 5; i++) g.add(jqPiece(i % 2 ? b : a, -20.6, i * 0.9, 8 - (i % 2) * 0.5, -0.2 * (i % 3)))
    }
    return fitGroup(g)
  }
}
/** 军旗收好：纸盒（盖子斜靠在旁边）+ 两色棋子分格 + 折起来的棋盘 */
function junqiBoxed([wood, a, b]: string[]) {
  const g = new THREE.Group()
  g.add(tray(24, 4, 15, 0.6, '#efe6d2', {}, 0.3))
  g.add(rbox(0.4, 3.4, 13.8, '#e2d6bc', { y: 0.6 }, 0.1))
  for (const [s, col] of [[-1, a], [1, b]] as const)
    for (let i = 0; i < 12; i++) g.add(jqPiece(col, s * 5.8 + ((i % 3) - 1) * 3.4, 0.6 + Math.floor(i / 9) * 0.9, -4.6 + (Math.floor(i / 3) % 3) * 4.3, (i % 2) * 0.1))
  // 盖子立在后面
  g.add(P(G(rbox(25, 0.6, 16, RED, {}, 0.3), noOutline(rbox(12, 0.05, 6, '#f6d36a', { y: 0.6 }, 0.1))), 0, 8.6, -9.4, -PI / 2 + 0.15))
  // 折好的棋盘
  g.add(rbox(17.6, 1.4, 28.6, wood, { x: 22, z: 0 }, 0.4))
  return fitGroup(g)
}
const JQ_P: PalFlat[] = [
  ['chinese', '#ead3a0', RED, '#2f5fa8'],
  ['retro', '#e8d6a8', R.red, '#3a3a3c'],
  ['cute', C.woodL, C.red, C.sky],
  ['modern', '#e9e6df', '#c8473a', '#3d3f44'],
]

// ---------- 斗兽棋 ----------

const DS_CELL = 3.6
const dsDraw = (grass: string, water: string, line: string): Draw => (c, W, H) => {
  const cw = W / 7
  const ch = H / 9
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 9; j++) {
      const river = (i === 1 || i === 2 || i === 4 || i === 5) && j >= 3 && j <= 5
      c.fillStyle = river ? water : (i + j) % 2 ? grass : shade(grass, 0.05)
      c.fillRect(i * cw, j * ch, cw, ch)
    }
  c.strokeStyle = line
  c.lineWidth = Math.max(1, W / 200)
  lineGrid(c, 0, 0, W, H, 8, 10)
  // 兽穴和陷阱
  for (const j of [0, 8]) {
    c.fillStyle = '#c8473a'
    c.beginPath()
    c.arc(3.5 * cw, (j + 0.5) * ch, cw * 0.32, 0, PI * 2)
    c.fill()
    c.fillStyle = '#8a6a4a'
    for (const [i, jj] of [[2, j], [4, j], [3, j ? 7 : 1]]) {
      c.fillRect(i * cw + cw * 0.25, jj * ch + ch * 0.25, cw * 0.5, ch * 0.5)
    }
  }
}
/** 斗兽棋子：圆片 + 顶面一个小兽头（耳朵） */
const dsPiece = (color: string, x: number, y: number, z: number) => {
  const g = disc(1.5, 0.8, color, 0, 0, 0)
  g.add(noOutline(ball(0.55, '#fff6e0', { y: 0.86 }, [1, 0.3, 1])))
  for (const s of [-1, 1]) g.add(noOutline(ball(0.25, '#fff6e0', { x: s * 0.45, y: 0.86, z: -0.45 }, [1, 0.3, 1])))
  return P(g, x, y, z)
}
const DS_START: [number, number][] = [[0, 0], [6, 0], [1, 1], [5, 1], [0, 2], [2, 2], [4, 2], [6, 2]]
function doushou(state: 'start' | 'mid') {
  return ([grass, water, a, b]: string[]) => {
    const g = new THREE.Group()
    g.add(rbox(7 * DS_CELL + 1.6, 0.8, 9 * DS_CELL + 1.6, shade(grass, -0.25), {}, 0.3))
    g.add(paintTop(7 * DS_CELL, 9 * DS_CELL, `bg-ds-${grass}-${water}`, dsDraw(grass, water, shade(grass, -0.3)), 0, 0.84, 0))
    const cell = (i: number, j: number): [number, number] => [(i - 3) * DS_CELL, (j - 4) * DS_CELL]
    const r = rng(33)
    for (const [side, col] of [[1, a], [-1, b]] as const)
      for (const [i, j0] of DS_START) {
        let i2 = side > 0 ? i : 6 - i
        let j = side > 0 ? 8 - j0 : j0
        if (state === 'mid') {
          if (r() < 0.3) continue
          if (r() < 0.5) {
            j = Math.max(0, Math.min(8, j - side * (1 + Math.floor(r() * 3))))
            i2 = Math.max(0, Math.min(6, i2 + Math.floor(r() * 3) - 1))
          }
        }
        const [x, z] = cell(i2, j)
        g.add(dsPiece(col, x, 0.85, z))
      }
    if (state === 'mid') for (let i = 0; i < 3; i++) g.add(dsPiece(i % 2 ? a : b, 15.6, i * 0.8, -4 + i * 0.3))
    return fitGroup(g)
  }
}
const DS_P: PalFlat[] = [
  ['chinese', '#9cc47a', '#7fb8e6', RED, '#2f5fa8'],
  ['cute', '#bfe3a6', C.sky, C.pink, '#7aa8e0'],
  ['retro', '#a8b86a', R.teal, R.red, R.mustard],
]

// ---------- 飞行棋 ----------

const FX_COLORS = ['#e04a3a', '#f0c02a', '#3a86d8', '#3aa860']
const fxDraw = (base: string): Draw => (c, W, H) => {
  c.fillStyle = base
  c.fillRect(0, 0, W, H)
  const u = W / 15
  // 四角的机库
  FX_COLORS.forEach((col, k) => {
    const [i, j] = [[0, 0], [9, 0], [9, 9], [0, 9]][k]
    c.fillStyle = col
    c.fillRect(i * u + u * 0.3, j * u + u * 0.3, 6 * u - u * 0.6, 6 * u - u * 0.6)
    c.fillStyle = shade(col, 0.3)
    for (const [a, b] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]]) {
      c.beginPath()
      c.arc((i + a) * u, (j + b) * u, u * 0.8, 0, PI * 2)
      c.fill()
    }
  })
  // 外圈跑道：沿十字形外边缘一格一色
  let k = 0
  const cellAt = (i: number, j: number) => {
    c.fillStyle = FX_COLORS[k++ % 4]
    c.beginPath()
    c.arc((i + 0.5) * u, (j + 0.5) * u, u * 0.42, 0, PI * 2)
    c.fill()
  }
  for (let i = 6; i < 9; i++) for (const j of [0, 14]) cellAt(i, j)
  for (let j = 6; j < 9; j++) for (const i of [0, 14]) cellAt(i, j)
  for (let t = 0; t < 6; t++) {
    cellAt(6, t)
    cellAt(8, 14 - t)
    cellAt(t, 8)
    cellAt(14 - t, 6)
    cellAt(8, t)
    cellAt(6, 14 - t)
    cellAt(t, 6)
    cellAt(14 - t, 8)
  }
  // 中间四色终点
  FX_COLORS.forEach((col, i) => {
    c.fillStyle = col
    c.beginPath()
    c.moveTo(7.5 * u, 7.5 * u)
    const a0 = -PI * 0.75 + (i * PI) / 2
    c.arc(7.5 * u, 7.5 * u, u * 1.5, a0, a0 + PI / 2)
    c.fill()
  })
}
/** 飞机棋子：圆底座 + 机身 + 机翼 */
const plane = (col: string, x: number, y: number, z: number, ry = 0) =>
  P(G(cyl(0.9, 1, 0.5, col, {}, 16), cyl(0.35, 0.5, 2, col, { y: 0.5 }, 10), rbox(2, 0.25, 0.6, col, { y: 1.5 }, 0.1), ball(0.4, col, { y: 2.5 })), x, y, z, 0, ry)
function feixing(state: 'start' | 'mid') {
  return ([base, frame, dieCol]: string[]) => {
    const g = new THREE.Group()
    g.add(rbox(43, 0.6, 43, frame, {}, 0.3))
    g.add(paintTop(42, 42, `bg-fx-${base}`, fxDraw(base), 0, 0.64, 0))
    const u = 42 / 15
    const r = rng(state === 'mid' ? 5 : 3)
    FX_COLORS.forEach((col, k) => {
      const [i, j] = [[0, 0], [9, 0], [9, 9], [0, 9]][k]
      ;[[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]].forEach(([a, b], n) => {
        let x = (i + a) * u - 21
        let z = (j + b) * u - 21
        if (state === 'mid' && n < 2 && r() < 0.8) {
          // 起飞了：落在跑道上
          const t = Math.floor(r() * 6)
          ;[x, z] = [[(6.5) * u - 21, (t + 0.5) * u - 21], [(14 - t + 0.5) * u - 21, (6.5) * u - 21], [(8.5) * u - 21, (14 - t + 0.5) * u - 21], [(t + 0.5) * u - 21, (8.5) * u - 21]][(k + n) % 4]
        }
        g.add(plane(col, x, 0.65, z, (k * PI) / 2))
      })
    })
    g.add(die(1.8, dieCol, DARK, state === 'mid' ? 2 : 0, 0.65, state === 'mid' ? -1 : 0, 0.4, state === 'mid' ? 6 : 1))
    return fitGroup(g)
  }
}
const FX_P: PalFlat[] = [
  ['cute', '#fff6e0', C.sky, C.white],
  ['retro', R.cream, R.teal, '#fbfaf6'],
  ['modern', '#f4f4f2', M.char, '#fbfaf6'],
]

// ---------- 五子棋 ----------

const gomokuDraw = (wood: string, line: string): Draw => (c, W, H) => {
  c.fillStyle = wood
  c.fillRect(0, 0, W, H)
  c.strokeStyle = line
  c.lineWidth = Math.max(1, W / 240)
  const m = W * 0.05
  lineGrid(c, m, m, W - m, H - m, 15, 15)
  c.fillStyle = line
  for (const [i, j] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) {
    c.beginPath()
    c.arc(m + ((W - 2 * m) * i) / 14, m + ((H - 2 * m) * j) / 14, W * 0.01, 0, PI * 2)
    c.fill()
  }
}
function gomoku(state: 'mid' | 'win') {
  return ([wood, line, box]: string[]) => {
    const [g, y] = board(32, 32, 1.4, wood, `bg-gomoku-${wood}-${line}`, gomokuDraw(wood, line))
    const step = (31 * 0.9) / 14
    const at = (i: number, j: number): [number, number] => [(i - 7) * step, (j - 7) * step]
    const used = new Set<string>()
    const put = (i: number, j: number, black: boolean) => {
      if (used.has(`${i},${j}`)) return
      used.add(`${i},${j}`)
      const [x, z] = at(i, j)
      g.add(ball(step * 0.45, black ? DARK : '#f8f6f0', { x, y: y + 0.32, z }, [1, 0.4, 1]))
    }
    const r = rng(state === 'win' ? 41 : 17)
    // 对局集中在中央：围着天元随机落子
    for (let k = 0; k < (state === 'win' ? 34 : 22); k++) put(7 + Math.round((r() - 0.5) * 8), 7 + Math.round((r() - 0.5) * 8), k % 2 === 0)
    if (state === 'win') for (let t = 0; t < 5; t++) put(4 + t, 9 - t, true)
    // 两只棋盒放在棋盘两边
    for (const [s, black] of [[1, true], [-1, false]] as const) {
      g.add(cup(3.8, 3.6, 3.6, 0.4, box, { x: s * 20.5, z: s * 8 }))
      for (let k = 0; k < 5; k++) g.add(ball(0.75, black ? DARK : '#f8f6f0', { x: s * 20.5 + Math.cos(k * 1.3) * 1.6, y: 3.2, z: s * 8 + Math.sin(k * 1.3) * 1.6 }, [1, 0.4, 1]))
    }
    return fitGroup(g)
  }
}
const GOMOKU_P: PalFlat[] = [
  ['chinese', '#e3c27f', '#3a2a1e', '#8a5a34'],
  ['modern', '#efe7d6', '#3d3f44', '#3d3f44'],
  ['nordic', N.oakL, '#4a3a2e', N.oak],
  ['cute', C.woodL, '#7a5a4a', C.pink],
]

// ---------- 扑克牌局：斗地主（3 人）、掼蛋（4 人，两副牌） ----------

/** seats：几个人（每人面前一手扇形牌），中间出牌堆、底牌，旁边牌墩 */
function pokerGame(seats: 3 | 4) {
  return ([felt, back, edge]: string[]) => {
    const g = new THREE.Group()
    const W = seats === 3 ? 48 : 56
    // 一块牌桌布垫（软垫，盖住桌面）
    g.add(rbox(W, 0.4, W, edge, {}, 0.2))
    g.add(rbox(W - 2, 0.1, W - 2, felt, { y: 0.4 }, 0.05))
    const y = 0.5
    const r = rng(seats * 13)
    const dirs = seats === 3 ? [0, PI * 0.62, -PI * 0.62] : [0, PI / 2, PI, -PI / 2]
    dirs.forEach((a, i) => {
      const R0 = W / 2 - 9
      const n = seats === 3 ? 12 + i * 2 : 14 + (i % 2) * 6
      g.add(fan(back, n, Math.sin(a) * R0, y, Math.cos(a) * R0, a + PI, 0.08))
    })
    // 中间出牌：一叠面朝上（散乱）
    for (let k = 0; k < (seats === 3 ? 9 : 14); k++) g.add(card(back, true, (r() - 0.5) * 9, y + k * 0.24, (r() - 0.5) * 7, (r() - 0.5) * 1.6, k))
    if (seats === 3) {
      // 底牌三张翻开，放在一边
      for (let k = 0; k < 3; k++) g.add(card(back, true, -13 + k * 6.8, y, -13, 0, k + 1))
    } else {
      // 掼蛋：两副牌，一个牌墩没抓完
      g.add(deck(back, 14, y, -12, 0.2, 2.4))
    }
    return fitGroup(g)
  }
}
const POKER_GAME_P: PalFlat[] = [
  ['chinese', '#2f7a4a', '#b8352b', CN.rosewood],
  ['modern', '#3d5a80', '#26262a', M.char],
  ['retro', '#2f6a4a', R.red, R.caramel],
  ['cute', C.mint, C.pink, C.woodL],
]

// ---------- 牌九（骨牌）、多米诺 ----------

const PJ_W = 2.6
const PJ_D = 5.6
const PJ_H = 1
/** 一块骨牌：面朝上露出上下两半的点数（a / b），否则只看到牌背 */
function pjTile(body: string, pipA: string, pipB: string, faceUp: boolean, a: number, b: number, x: number, y: number, z: number, ry = 0, w = PJ_W, d = PJ_D) {
  const g = G(rbox(w, PJ_H, d, body, {}, 0.3))
  if (faceUp) {
    g.add(noOutline(rbox(w * 0.8, 0.04, 0.12, pipA === '#ffffff' ? shade(body, 0.3) : shade(body, -0.25), { y: PJ_H }, 0.02)))
    const LAY: Record<number, [number, number][]> = {
      0: [],
      1: [[0, 0]],
      2: [[-1, -1], [1, 1]],
      3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    }
    for (const [half, n] of [[-1, a], [1, b]] as const)
      for (const [u, v] of LAY[n]) g.add(noOutline(ball(w * 0.08, n === 1 || n === 4 ? pipB : pipA, { x: u * w * 0.24, y: PJ_H + 0.02, z: half * d * 0.25 + v * d * 0.12 }, [1, 0.3, 1])))
  }
  return P(g, x, y, z, 0, ry)
}
function paijiu(state: 'wall' | 'open') {
  return ([body, pipA, pipB]: string[]) => {
    const g = new THREE.Group()
    const r = rng(state === 'open' ? 8 : 4)
    if (state === 'wall') {
      // 32 张码成两层的一长排（16 墩），旁边两颗骰子
      for (let i = 0; i < 8; i++) for (let l = 0; l < 2; l++) g.add(pjTile(body, pipA, pipB, false, 0, 0, (i - 3.5) * (PJ_W + 0.15), l * PJ_H, 0))
      for (let i = 0; i < 8; i++) for (let l = 0; l < 2; l++) g.add(pjTile(body, pipA, pipB, false, 0, 0, (i - 3.5) * (PJ_W + 0.15), l * PJ_H, PJ_D + 0.15))
      g.add(die(1.4, '#fbfaf6', DARK, 13, 0, 1, 0.3, 4), die(1.4, '#fbfaf6', DARK, 15.4, 0, 3, -0.4, 6))
    } else {
      // 四家各四张，两两配对翻开；中间剩余的牌墩
      for (let k = 0; k < 4; k++) {
        const a = (k * PI) / 2
        const hand = new THREE.Group()
        for (let i = 0; i < 4; i++) hand.add(pjTile(body, pipA, pipB, true, 1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6), (i - 1.5) * (PJ_W + 0.3) + (i >= 2 ? 1.2 : -1.2), 0, 0))
        g.add(P(hand, Math.sin(a) * 15, 0, Math.cos(a) * 15, 0, a))
      }
      for (let i = 0; i < 4; i++) for (let l = 0; l < 2; l++) g.add(pjTile(body, pipA, pipB, false, 0, 0, (i - 1.5) * (PJ_W + 0.15), l * PJ_H, 0))
      g.add(die(1.4, '#fbfaf6', DARK, 6, 0, 5, 0.5, 3), die(1.4, '#fbfaf6', DARK, -6, 0, -5.6, -0.3, 5))
    }
    return fitGroup(g)
  }
}
const PJ_P: PalFlat[] = [
  ['chinese', '#26262a', '#ffffff', RED],
  ['retro', '#f2e6cc', DARK, RED],
  ['classic', IVORY, DARK, RED],
]
/** 多米诺：一条蜿蜒的牌龙 + 两边的手牌（立着）+ 牌库 */
function dominoes([body, pip, edge]: string[]) {
  const g = new THREE.Group()
  const r = rng(12)
  const W = 2.4
  const D = 4.8
  let x = -18
  let z = -3
  let dir = 0
  for (let k = 0; k < 13; k++) {
    const double = k % 5 === 2
    g.add(pjTile(body, pip, pip, true, Math.floor(r() * 7), Math.floor(r() * 7), x, 0, z, double ? 0 : PI / 2, W, D))
    if (k === 7) {
      dir = 1
      z += D / 2 + W / 2
    }
    if (dir === 0) x += double ? W + 0.2 : D + 0.2
    else x -= double ? W + 0.2 : D + 0.2
    if (k === 7) x -= D
  }
  // 两家手牌立着
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) g.add(P(G(rbox(W, D, 1, body, {}, 0.3)), (i - 2.5) * (W + 0.3), 0, s * 14, 0, s > 0 ? 0 : PI))
  // 牌库（背面朝上）
  for (let i = 0; i < 7; i++) g.add(P(G(rbox(W, 1, D, edge, {}, 0.3)), 20 + (i % 3) * 2.8, 0, -6 + Math.floor(i / 3) * 5.2, 0, (r() - 0.5) * 0.6))
  return fitGroup(g)
}
const DOMINO_P: PalFlat[] = [
  ['classic', IVORY, DARK, '#3a3a3c'],
  ['farmhouse', F.white, F.navy, F.barn],
  ['modern', '#26262a', '#ffffff', '#3d3f44'],
]

// ---------- 花札（座布团上对局）、双六 ----------

const HANA_W = 3.3
const HANA_D = 5.4
/** 花札牌面：红边框 + 季节色块（12 种） */
const HANA_FACES = ['#d65a3c', '#e98fb0', '#f2c14e', '#8a4fb0', '#3f7a4a', '#c8302a', '#e07a3a', '#2f5fa8', '#f0d050', '#b8352b', '#3a3a3c', '#7fa48f']
const hanaCard = (back: string, faceUp: boolean, k: number, x: number, y: number, z: number, ry = 0) => {
  const g = G(rbox(HANA_W, 0.3, HANA_D, faceUp ? '#f2e6cc' : back, {}, 0.1))
  if (faceUp) {
    g.add(noOutline(rbox(HANA_W - 0.6, 0.05, HANA_D - 0.6, HANA_FACES[k % 12], { y: 0.3 }, 0.05)))
    g.add(noOutline(ball(0.6, k % 3 ? '#fbf8f0' : '#26262a', { y: 0.36, z: -0.8 }, [1, 0.2, 1])))
  }
  return P(g, x, y, z, 0, ry)
}
/** 花札：座布团（或小毛毡垫）上，场札 8 张两排、山札、两家的手牌（扇形背朝上）和得札，牌盒放在垫边 */
function hanafudaMat([mat, back, box]: string[]) {
  const g = new THREE.Group()
  // 座布团：鼓起来的方垫 + 四角穗子
  g.add(rbox(48, 4, 48, mat, {}, 1.8))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(0.9, shade(mat, -0.2), { x: sx * 23, y: 3.2, z: sz * 23 }))
  const y = 4
  for (let i = 0; i < 8; i++) g.add(hanaCard(back, true, i * 3, ((i % 4) - 1.5) * 4.4, y, (Math.floor(i / 4) - 0.5) * 6.4, (i % 3) * 0.05))
  // 山札（背面朝上一叠）
  g.add(P(G(rbox(HANA_W, 2, HANA_D, '#e8dcc0', {}, 0.1), noOutline(rbox(HANA_W - 0.4, 0.05, HANA_D - 0.4, back, { y: 2 }, 0.05))), 11.6, y, 0, 0, 0.1))
  // 两家：手牌扇形 + 得札（面朝上错开摆）
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.16
      g.add(hanaCard(back, false, 0, Math.sin(a) * 6 + (i - 3) * 0.2, y + i * 0.04, s * (17 - Math.cos(a) * 1.5), a + (s > 0 ? 0 : PI)))
    }
    for (let i = 0; i < 5; i++) g.add(hanaCard(back, true, i * 5 + (s > 0 ? 1 : 2), -16 + i * 1.6, y + i * 0.32, s * 10, 0))
  }
  // 牌盒（垫子外、桌面上）
  g.add(rbox(6.6, 2.6, 9.6, box, { x: 28.6, z: 14 }, 0.4))
  g.add(noOutline(rbox(3, 0.05, 5, '#f2e6cc', { x: 28.6, y: 2.6, z: 14 }, 0.1)))
  return fitGroup(g)
}
const HANA_MAT_P: PalFlat[] = [
  ['japanese', '#7a2e3a', J.sumi, RED],
  ['japanese', J.ai, '#7a2e2e', J.sumi],
  ['retro', R.mustard, R.red, R.red],
]
/** 双六（絵双六）：铺开的大纸（画着螺旋的一格格），几枚小棋子和一颗骰子 */
const sugorokuDraw = (paper: string, a: string, b: string): Draw => (c, W, H) => {
  c.fillStyle = paper
  c.fillRect(0, 0, W, H)
  c.strokeStyle = shade(a, -0.3)
  c.lineWidth = Math.max(1, W / 300)
  c.strokeRect(W * 0.02, H * 0.03, W * 0.96, H * 0.94)
  // 螺旋排列的格子（振り出し 在外、上がり 在中心）
  const cx = W / 2
  const cy = H / 2
  for (let k = 0; k < 46; k++) {
    const t = k / 46
    const ang = t * PI * 5.2
    const rx = W * (0.44 - t * 0.36)
    const ry = H * (0.4 - t * 0.33)
    const x = cx + Math.cos(ang) * rx
    const y = cy + Math.sin(ang) * ry
    c.fillStyle = k % 3 === 0 ? a : k % 3 === 1 ? b : shade(paper, -0.08)
    c.fillRect(x - W * 0.035, y - H * 0.045, W * 0.07, H * 0.09)
    c.strokeRect(x - W * 0.035, y - H * 0.045, W * 0.07, H * 0.09)
  }
  // 上がり：中央的富士山
  c.fillStyle = '#5a7ab0'
  c.beginPath()
  c.moveTo(cx - W * 0.08, cy + H * 0.06)
  c.lineTo(cx, cy - H * 0.08)
  c.lineTo(cx + W * 0.08, cy + H * 0.06)
  c.fill()
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.moveTo(cx - W * 0.025, cy - H * 0.035)
  c.lineTo(cx, cy - H * 0.08)
  c.lineTo(cx + W * 0.025, cy - H * 0.035)
  c.fill()
}
const koma = (col: string, x: number, y: number, z: number) => P(G(cyl(0.6, 1, 2.2, col, {}, 12), ball(0.7, col, { y: 2.4 })), x, y, z)
function sugoroku([paper, a, b]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(54, 0.12, 38, shade(paper, -0.05), {}, 0.05))
  g.add(paintTop(53.6, 37.6, `bg-sugoroku-${paper}-${a}-${b}`, sugorokuDraw(paper, a, b), 0, 0.14, 0))
  for (const [x, z, col] of [[-16, 10, RED], [-10, 13, '#3a86d8'], [8, -7, '#3aa860'], [4, 3, '#f0c02a']] as const) g.add(koma(col, x, 0.15, z))
  g.add(die(1.6, '#fbfaf6', DARK, 20, 0.15, 12, 0.5, 3))
  return fitGroup(g)
}
/** 双六收好：卷起来的纸（系着绳）+ 一小盒棋子 */
function sugorokuRolled([paper, a]: string[]) {
  const g = new THREE.Group()
  g.add(P(cyl(2.4, 2.4, 38, paper, {}, 20), 0, 2.4, 0, 0, 0, PI / 2))
  for (const x of [-8, 8]) g.add(P(cyl(2.55, 2.55, 0.8, a, {}, 20), x, 2.4, 0, 0, 0, PI / 2))
  g.add(rbox(7, 2.4, 5, a, { x: 6, z: 5.6 }, 0.5))
  return fitGroup(g)
}
const SUGO_P: PalFlat[] = [
  ['japanese', '#f4ead2', J.shu, '#3f7a4a'],
  ['retro', R.cream, R.red, R.teal],
  ['cute', '#fff6e6', C.pink, C.sky],
]

// ---------- 国际跳棋（checkers） ----------

const ckDraw = (a: string, b: string): Draw => (c, W, H) => {
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      c.fillStyle = (i + j) % 2 ? b : a
      c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
    }
}
function checkers(state: 'start' | 'mid') {
  return ([frame, light, dark, p1, p2]: string[]) => {
    const [g, y] = board(36, 36, 1.4, frame, `bg-ck-${light}-${dark}`, (c, W, H) => {
      c.fillStyle = frame
      c.fillRect(0, 0, W, H)
      c.save()
      c.translate(W * 0.05, H * 0.05)
      ckDraw(light, dark)(c, W * 0.9, H * 0.9)
      c.restore()
    })
    const step = (35 * 0.9) / 8
    const at = (i: number, j: number): [number, number] => [(i - 3.5) * step, (j - 3.5) * step]
    const r = rng(state === 'mid' ? 9 : 2)
    let off1 = 0
    let off2 = 0
    for (const [rows, col, side] of [[[0, 1, 2], p2, -1], [[5, 6, 7], p1, 1]] as const)
      for (const j of rows)
        for (let i = 0; i < 8; i++) {
          if ((i + j) % 2 === 0) continue
          let jj: number = j
          let ii = i
          if (state === 'mid') {
            if (r() < 0.35) {
              // 被吃掉：摆到棋盘外一边
              const k = side > 0 ? off1++ : off2++
              g.add(disc(1.7, 0.7, side > 0 ? p2 : p1, side * 21.5, Math.floor(k / 4) * 0.7, (k % 4) * 3.6 - 5))
              continue
            }
            if (r() < 0.4) {
              jj = Math.max(0, Math.min(7, j - side * (1 + Math.floor(r() * 3))))
              ii = Math.max(0, Math.min(7, ((jj + i) % 2 ? i : i + 1)))
              if ((ii + jj) % 2 === 0) ii = Math.max(0, ii - 1)
            }
          }
          const [x, z] = at(ii, jj)
          g.add(disc(1.7, 0.7, col, x, y, z))
          // 升王：叠两枚
          if (state === 'mid' && jj === (side > 0 ? 0 : 7)) g.add(disc(1.7, 0.7, col, x, y + 0.7, z))
        }
    return fitGroup(g)
  }
}
const CK_P: PalFlat[] = [
  ['classic', CL.walnut, '#f0e2c4', '#3a2a22', '#b8352b', '#26262a'],
  ['farmhouse', F.oak, F.white, F.barn, F.barn, F.iron],
  ['modern', M.char, '#f4f4f2', '#3d3f44', '#c8473a', '#26262a'],
  ['retro', R.caramel, R.cream, R.red, R.red, '#3a3a3c'],
]

// ---------- 地产大亨式桌游（自创图案，无商标） ----------

const propDraw = (base: string, band: string): Draw => (c, W, H) => {
  c.fillStyle = base
  c.fillRect(0, 0, W, H)
  const n = 11
  const u = W / n
  const cols = ['#8a5a3a', '#7fc8e6', '#d870b0', '#f0902a', '#e04a3a', '#f0d02a', '#3aa860', '#2f5fa8']
  c.strokeStyle = '#3a3a3c'
  c.lineWidth = Math.max(1, W / 300)
  for (let k = 0; k < n; k++)
    for (const [i, j, side] of [[k, 0, 0], [n - 1, k, 1], [n - 1 - k, n - 1, 2], [0, n - 1 - k, 3]]) {
      c.strokeRect(i * u, j * u, u, u)
      if (k === 0 || k === n - 1) continue
      if (k % 4 === 2) continue
      c.fillStyle = cols[(side * 2 + (k > 5 ? 1 : 0)) % cols.length]
      const t = u * 0.25
      if (side === 0) c.fillRect(i * u, j * u + u - t, u, t)
      if (side === 1) c.fillRect(i * u, j * u, t, u)
      if (side === 2) c.fillRect(i * u, j * u, u, t)
      if (side === 3) c.fillRect(i * u + u - t, j * u, t, u)
    }
  // 中央：斜放的色带 + 两块牌堆位
  c.save()
  c.translate(W / 2, H / 2)
  c.rotate(-PI / 4)
  c.fillStyle = band
  c.fillRect(-W * 0.32, -H * 0.06, W * 0.64, H * 0.12)
  c.restore()
  c.strokeRect(W * 0.22, H * 0.22, u * 1.6, u * 1.1)
  c.strokeRect(W * 0.62, H * 0.66, u * 1.6, u * 1.1)
}
/** 小房子 / 旅馆 */
const house = (col: string, x: number, y: number, z: number, big = false) => {
  const w = big ? 1.6 : 0.9
  const g = G(rbox(w, 0.7, 0.9, col, {}, 0.1))
  const roof = P(cyl(0, 0.75, 0.55, col, {}, 4), 0, 0.7, 0, 0, PI / 4)
  roof.scale.set(w / 1.06, 1, 0.9 / 1.06)
  g.add(roof)
  return P(g, x, y, z)
}
function propertyGame([base, band, money]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(50, 0.6, 50, shade(base, -0.1), {}, 0.3))
  g.add(paintTop(49.6, 49.6, `bg-prop-${base}-${band}`, propDraw(base, band), 0, 0.64, 0))
  const y = 0.65
  const u = 49.6 / 11
  const r = rng(77)
  // 房子、旅馆落在格子上
  for (let k = 0; k < 9; k++) {
    const t = 1 + Math.floor(r() * 9)
    const side = Math.floor(r() * 4)
    const [i, j] = [[t, 0.25], [10.75, t], [10 - t, 10.75], [0.25, 10 - t]][side]
    g.add(house(k % 4 === 3 ? '#d84a3a' : '#3aa860', (i + 0.5) * u - 24.8, y, (j + 0.25) * u - 24.8, k % 4 === 3))
  }
  // 四枚棋子（自创：小帽子、小车、小船、小狗形状换成简单几何）
  g.add(P(G(cyl(0.9, 0.9, 0.3, '#c9ced6', {}, 16), cyl(0.55, 0.55, 1.2, '#c9ced6', { y: 0.3 }, 16)), -22, y, 8))
  g.add(P(G(rbox(2, 0.8, 1.1, '#c9ced6', {}, 0.3), rbox(1, 0.6, 1, '#c9ced6', { y: 0.8, x: -0.2 }, 0.2)), 22, y, -14, 0, PI / 2))
  g.add(P(G(cone(0.9, 1.8, '#c9ced6')), 6, y, 22.4))
  g.add(P(G(ball(0.8, '#c9ced6', { y: 0.8 }), cyl(0.9, 0.9, 0.3, '#c9ced6', {}, 16)), -22.4, y, -18))
  // 中央的两叠卡片、两颗骰子
  g.add(deck('#f0a03a', -10, y, -10, PI / 4, 1, 4.4, 6.6), deck('#3a86d8', 6, y, 9, PI / 4, 1, 4.4, 6.6))
  g.add(die(1.4, '#fbfaf6', DARK, 2, y, -4, 0.3, 4), die(1.4, '#fbfaf6', DARK, 4.2, y, -2.6, -0.5, 2))
  // 银行：棋盘外一边的纸钞（各色一叠）
  const notes = ['#f4f1ea', '#f6c6d0', '#f6e08a', '#a8d8a0', '#a8c8f0', '#f0b878', '#e8a0a0']
  notes.forEach((col, k) => g.add(rbox(6.4, 0.6 + (k % 3) * 0.3, 3.4, col, { x: 30, z: -16 + k * 4.4 }, 0.1)))
  g.add(rbox(1.2, 0.8, 30, money, { x: 34, z: -2.8 }, 0.3))
  return fitGroup(g)
}
function cone(r: number, h: number, col: string) {
  return cyl(0.05, r, h, col, {}, 16)
}
/** 地产桌游收好：扁平大盒（盒盖有色带图案）+ 盒边上一叠纸钞露出来 */
function propertyBoxed([base, band]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(51, 5, 26, base, {}, 0.6))
  g.add(noOutline(rbox(40, 0.06, 6, band, { y: 5, z: -2 }, 0.1)))
  g.add(noOutline(rbox(12, 0.06, 4, '#3a3a3c', { y: 5, z: 6 }, 0.1)))
  for (let k = 0; k < 3; k++) g.add(rbox(6.4, 0.5, 3.4, ['#f6e08a', '#a8d8a0', '#f6c6d0'][k], { x: 16 + k * 0.5, y: 5 + k * 0.5, z: 7 - k * 0.3 }, 0.1))
  return fitGroup(g)
}
const PROP_P: PalFlat[] = [
  ['retro', '#dfe8d0', R.red, R.caramel],
  ['farmhouse', F.linen, F.barn, F.oak],
  ['classic', '#e6ead8', CL.wine, CL.walnut],
  ['cute', '#f6ecd0', C.pink, C.woodL],
]

// ---------- 拼字游戏（字母方块，无商标） ----------

const wordsDraw = (base: string, dl: string, tw: string): Draw => (c, W, H) => {
  c.fillStyle = base
  c.fillRect(0, 0, W, H)
  const n = 15
  const u = W / n
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const ci = Math.abs(i - 7)
      const cj = Math.abs(j - 7)
      let col: string | null = null
      if ((ci === 7 || ci === 0) && (cj === 7 || cj === 0) && !(ci === 0 && cj === 0)) col = tw
      else if (ci === cj && ci >= 3) col = shade(tw, 0.25)
      else if ((ci === 1 && cj === 1) || (ci === 5 && cj === 1) || (ci === 1 && cj === 5) || (ci === 4 && cj === 0) || (ci === 0 && cj === 4)) col = dl
      else if (ci === 0 && cj === 0) col = tw
      if (col) {
        c.fillStyle = col
        c.fillRect(i * u + 1, j * u + 1, u - 2, u - 2)
      }
    }
  c.strokeStyle = '#ffffff'
  c.lineWidth = Math.max(1, W / 300)
  lineGrid(c, 0, 0, W, H, n + 1, n + 1)
}
/** 字母方块：象牙色小方块，顶面一道深色笔画（示意字母） */
const tile = (x: number, y: number, z: number, k: number, ry = 0) => {
  const g = G(rbox(1.9, 0.5, 2.1, '#f3e6c8', {}, 0.2))
  g.add(noOutline(rbox(k % 3 ? 0.9 : 0.25, 0.04, k % 3 ? 0.22 : 1.1, '#3a2a22', { y: 0.5, x: k % 2 ? -0.1 : 0.1 }, 0.05)))
  if (k % 4 === 1) g.add(noOutline(rbox(0.22, 0.04, 1.1, '#3a2a22', { y: 0.5, x: -0.35 }, 0.05)))
  return P(g, x, y, z, 0, ry)
}
/** 字母架（斜面小木架 + 7 枚方块） */
const rack = (col: string, x: number, z: number, ry: number) => {
  const g = G(rbox(17, 1.2, 2.6, col, {}, 0.3))
  for (let i = 0; i < 7; i++) g.add(P(tile(0, 0, 0, i + 2), (i - 3) * 2.2, 1.2, 0.2, -0.5))
  return P(g, x, 0, z, 0, ry)
}
function words(state: 'play' | 'boxed') {
  return ([base, dl, tw, wood]: string[]) => {
    const g = new THREE.Group()
    if (state === 'play') {
      g.add(rbox(36, 1, 36, wood, {}, 0.4))
      g.add(paintTop(35, 35, `bg-words-${base}-${dl}-${tw}`, wordsDraw(base, dl, tw), 0, 1.04, 0))
      const u = 35 / 15
      const at = (i: number, j: number): [number, number] => [(i - 7) * u, (j - 7) * u]
      const cells: [number, number][] = []
      for (let i = 4; i <= 10; i++) cells.push([i, 7])
      for (let j = 3; j <= 6; j++) cells.push([6, j])
      for (let j = 8; j <= 11; j++) cells.push([9, j])
      for (let i = 9; i <= 13; i++) cells.push([i, 11])
      for (let i = 2; i <= 5; i++) cells.push([i, 3])
      cells.forEach(([i, j], k) => {
        const [x, z] = at(i, j)
        g.add(tile(x, 1.05, z, k))
      })
      for (const s of [-1, 1]) g.add(rack(wood, 0, s * 22, s > 0 ? 0 : PI))
      // 字母袋
      g.add(ball(4.2, '#7a2e3a', { x: 24, y: 3.2, z: -8 }, [1, 0.75, 1]))
      g.add(cyl(1.4, 2.2, 2.6, '#7a2e3a', { x: 24, y: 5.6, z: -8 }, 12))
    } else {
      g.add(rbox(38, 5.4, 20, base, {}, 0.6))
      g.add(noOutline(rbox(30, 0.06, 4, tw, { y: 5.4, z: -3 }, 0.1)))
      for (let i = 0; i < 5; i++) g.add(tile(-8 + i * 2.3, 5.45, 4, i))
      g.add(ball(4, '#7a2e3a', { x: 25, y: 3, z: 2 }, [1, 0.75, 1]))
    }
    return fitGroup(g)
  }
}
const WORDS_P: PalFlat[] = [
  ['classic', '#e6dcc0', '#9cc6e0', '#d8605a', CL.walnut],
  ['farmhouse', '#ebe2c8', '#a8c4d8', F.barn, F.oak],
  ['modern', '#e9e6df', '#9fb4c7', '#c8473a', M.char],
  ['retro', R.cream, R.teal, R.red, R.caramel],
]

// ---------- 扑克筹码箱、德州扑克牌局 ----------

const CHIP_COLS = ['#f4f1ea', '#c8302a', '#2f5fa8', '#3aa860', '#26262a']
/** 一摞筹码 */
const chips = (col: string, n: number, x: number, y: number, z: number) => {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    g.add(cyl(1.95, 1.95, 0.33, col, { y: i * 0.34 }, 20))
    if (i % 2 === 0) g.add(noOutline(cyl(1.97, 1.97, 0.12, i % 4 ? '#ffffff' : shade(col, 0.3), { y: i * 0.34 + 0.1 }, 20)))
  }
  return P(g, x, y, z)
}
/** 筹码箱：铝箱打开（盖子立在后面），五排筹码躺在槽里，中间一副牌、两颗骰子 */
function chipCase(open: boolean) {
  return ([shell, lining]: string[]) => {
    const g = new THREE.Group()
    g.add(tray(42, 7, 22, 0.8, shell, {}, 0.4))
    if (!open) {
      g.add(rbox(42.4, 1, 22.4, shell, { y: 7 }, 0.4))
      g.add(rbox(10, 1.4, 2, DARK, { y: 4.4, z: 11.4 }, 0.5))
      return fitGroup(g)
    }
    g.add(rbox(40.4, 0.6, 20.4, lining, { y: 0.8 }, 0.2))
    // 五排横躺的筹码（在槽里，只露出上半截）
    for (let k = 0; k < 5; k++) g.add(P(cyl(1.95, 1.95, 30, CHIP_COLS[k], {}, 20), -4, 3.2, -8 + k * 3.95, 0, 0, PI / 2))
    g.add(deck('#c8302a', 16, 1.4, -4, PI / 2, 1.6), deck('#2f5fa8', 16, 1.4, 4, PI / 2, 1.6))
    // 盖子立着
    g.add(P(G(tray(42, 6, 22, 0.8, shell, {}, 0.4)), 0, 7, -11.2, -PI / 2 - 0.12))
    return fitGroup(g)
  }
}
/** 德州扑克牌局：椭圆绒面垫，五张公共牌，各家面前的两张手牌和筹码，中间的底池，庄家按钮 */
function holdem([felt, rim, back]: string[]) {
  const g = new THREE.Group()
  const mat = cyl(30, 30, 0.6, rim, {}, 48)
  mat.scale.set(1, 1, 0.7)
  const top = noOutline(cyl(28, 28, 0.08, felt, { y: 0.6 }, 48))
  top.scale.set(1, 1, 0.68)
  g.add(mat, top)
  const y = 0.7
  for (let k = 0; k < 5; k++) g.add(card(back, k < 4, (k - 2) * 6.9, y, -2, 0, k))
  const seats = 6
  const r = rng(5)
  for (let s = 0; s < seats; s++) {
    const a = (s / seats) * PI * 2 + PI / 6
    const sx = Math.sin(a) * 22
    const sz = Math.cos(a) * 14
    g.add(card(back, false, sx - 1.5, y, sz, a + PI + 0.15), card(back, false, sx + 1.5, y + 0.25, sz, a + PI - 0.1))
    const cx = Math.sin(a) * 14
    const cz = Math.cos(a) * 8.5
    for (let c = 0; c < 2; c++) g.add(chips(CHIP_COLS[(s + c) % 5], 2 + Math.floor(r() * 6), cx + (c - 0.5) * 4, y, cz))
  }
  // 底池
  for (let c = 0; c < 3; c++) g.add(chips(CHIP_COLS[c + 1], 3 + c * 2, -3 + c * 3.4, y, 5.4))
  g.add(noOutline(cyl(1.6, 1.6, 0.5, '#ffffff', { x: 12, y, z: 4 }, 20)))
  return fitGroup(g)
}
const CHIP_CASE_P: PalFlat[] = [
  ['modern', '#c3c7cc', '#26262a'],
  ['industrial', I.steel, '#3a3a3c'],
  ['classic', '#a8916a', CL.wine],
]
const HOLDEM_P: PalFlat[] = [
  ['classic', '#2f7a4a', CL.walnut, CL.wine],
  ['modern', '#3d5a80', M.black, '#26262a'],
  ['industrial', '#3a5a3c', I.leather, I.rust],
  ['farmhouse', '#2f6a4a', F.oak, F.navy],
]

// ---------- 叠叠乐（抽到一半） ----------

function jengaMid([wood]: string[]) {
  const g = new THREE.Group()
  const L = 7.5
  const Wb = 2.5
  const H = 1.5
  const r = rng(19)
  // 每层的抽法：不抽 / 抽左 / 抽右 / 抽中间 / 两边都抽（只剩中间一根）——总有支撑，不会悬空
  const PATTERNS = [[], [0], [2], [1], [0, 2]]
  for (let lv = 0; lv < 18; lv++) {
    const gone: number[] = lv > 1 && lv < 15 && r() < 0.6 ? PATTERNS[1 + Math.floor(r() * 4)] : []
    for (let i = 0; i < 3; i++) {
      if (gone.includes(i)) continue
      const off = (i - 1) * Wb
      const b = lv % 2 ? rbox(L, H, Wb - 0.08, shade(wood, (r() - 0.5) * 0.06), { y: lv * H, z: off }, 0.2) : rbox(Wb - 0.08, H, L, shade(wood, (r() - 0.5) * 0.06), { y: lv * H, x: off }, 0.2)
      b.position.x += (r() - 0.5) * 0.25
      g.add(b)
    }
  }
  // 抽出来的几块：顶上横放两块、桌上散几块
  g.add(rbox(L, H, Wb - 0.08, wood, { y: 18 * H, z: -Wb }, 0.2))
  for (let k = 0; k < 4; k++) g.add(P(rbox(L, H, Wb - 0.08, shade(wood, 0.03), {}, 0.2), 9 + k * 1.4, 0, -3 + k * 2.8, 0, (r() - 0.5) * 1.2))
  return fitGroup(g)
}

// ---------- 通用：桌游盒子摞、骰子、计分本 ----------

/** 桌游盒子摞：sizes = [宽, 高, 深]；盒盖一圈深色边 + 中间色块（无字） */
function boxStack(sizes: [number, number, number][], seed: number) {
  return (pal: string[]) => {
    const g = new THREE.Group()
    const r = rng(seed)
    let y = 0
    sizes.forEach(([w, h, d], k) => {
      const col = pal[k % pal.length]
      const b = new THREE.Group()
      b.add(rbox(w, h, d, col, {}, 0.4))
      b.add(noOutline(rbox(w * 0.7, 0.06, d * 0.45, shade(col, k % 2 ? 0.25 : -0.2), { y: h, z: -d * 0.08 }, 0.1)))
      b.add(noOutline(rbox(w * 0.3, 0.06, d * 0.14, '#fbf8f0', { y: h, x: -w * 0.18, z: d * 0.3 }, 0.05)))
      // 盒身侧面一条（书脊似的标题带）
      b.add(noOutline(rbox(w * 0.6, h * 0.35, 0.06, shade(col, 0.3), { y: h * 0.32, z: d / 2 }, 0.05)))
      g.add(P(b, (r() - 0.5) * 1.6, y, (r() - 0.5) * 1.2, 0, (r() - 0.5) * 0.12))
      y += h
    })
    return fitGroup(g)
  }
}
const BOX_P: PalFlat[] = [
  ['cute', C.pink, C.sky, C.lemon, C.mint, C.lilac],
  ['retro', R.teal, R.orange, R.mustard, R.red, R.olive],
  ['modern', '#3d3f44', '#c8473a', '#8a8d93', '#3d6fb8', '#e0a526'],
  ['nordic', N.blue, N.sage, N.mustard, N.oakL, N.gray],
  ['farmhouse', F.barn, F.navy, F.butter, F.sage, F.linen],
]
/** 两颗六面骰 */
function dicePair([a, pip, b]: string[]) {
  return fitGroup(G(die(1.6, a, pip, 0, 0, 0, 0.3, 6), die(1.6, b, pip, 2.6, 0, 1.2, -0.5, 3)))
}
/** 多面骰套装 + 皮质骰盘（六边形托盘里的 D20 / D12 / D10 / D8 / D6 / D4） */
function diceRpg([tray0, d1, d2]: string[]) {
  const g = new THREE.Group()
  g.add(tray(18, 2.2, 14, 0.9, tray0, {}, 0.6))
  g.add(noOutline(rbox(16.4, 0.1, 12.4, shade(tray0, -0.25), { y: 0.9 }, 0.1)))
  const poly = (geo: THREE.BufferGeometry, col: string, x: number, z: number, s: number) => {
    const m = new THREE.Mesh(geo, toon(col))
    m.castShadow = true
    m.scale.setScalar(s)
    m.position.set(x, 1 + s * 0.85, z)
    m.rotation.set(0.4, x, 0.2)
    return m
  }
  g.add(poly(new THREE.IcosahedronGeometry(1), d1, -4.5, -2, 1.3))
  g.add(poly(new THREE.DodecahedronGeometry(1), d2, 0, -3, 1.2))
  g.add(poly(new THREE.OctahedronGeometry(1), d1, 4.6, -2.5, 1.1))
  g.add(poly(new THREE.TetrahedronGeometry(1), d2, -3, 3, 1.1))
  g.add(die(1.6, d1, '#ffffff', 2.4, 0.9, 2.2, 0.3, 4))
  g.add(poly(new THREE.OctahedronGeometry(1, 0), d2, 5.6, 2.8, 1))
  return fitGroup(g)
}
const DICE_P: PalFlat[] = [
  ['modern', '#fbfaf6', DARK, '#c8302a'],
  ['cute', C.pink, '#ffffff', C.sky],
  ['retro', R.cream, '#3a2a22', R.red],
]
const RPG_P: PalFlat[] = [
  ['industrial', I.leather, '#6b4ea0', '#2f8a8a'],
  ['classic', CL.wine, '#c8a96a', '#3b4a66'],
  ['modern', DARK, '#c8473a', '#3d6fb8'],
]
/** 计分本：一本带格子的小本子 + 一支铅笔 */
function scorePad([cover, paper, pencil]: string[]) {
  const g = new THREE.Group()
  g.add(rbox(10.4, 0.6, 15, cover, {}, 0.2))
  g.add(rbox(9.8, 0.3, 14, paper, { y: 0.6, z: 0.3 }, 0.1))
  for (let i = 0; i < 6; i++) g.add(noOutline(rbox(9, 0.03, 0.08, '#9fb4c7', { y: 0.9, z: -5 + i * 2.2 }, 0.01)))
  for (let i = 0; i < 3; i++) g.add(noOutline(rbox(0.08, 0.03, 12, '#9fb4c7', { y: 0.9, x: -2 + i * 3, z: 0.3 }, 0.01)))
  g.add(P(cyl(0.38, 0.38, 13, pencil, {}, 6), 7.2, 0.4, 1, PI / 2, 0.3))
  return fitGroup(g)
}
const PAD_P: PalFlat[] = [
  ['modern', '#3d3f44', PAPER, '#e0a526'],
  ['cute', C.sky, PAPER, C.pink],
  ['retro', R.red, R.cream, R.mustard],
]

const st = (family: string, sizeLabel: string, extra: Partial<AssetDef> = {}) => ({ family, sizeLabel, ...extra })

export const GAMES_MORE: AssetDef[] = [
  // 中式
  def('bg-junqi-setup', '军旗（陆战棋）', 'hobby', [34, 56, 1.6], JQ_P, junqi('setup'), st('bg-junqi', '摆好开局')),
  def('bg-junqi-mid', '军旗（陆战棋）', 'hobby', [45.6, 56, 6.4], JQ_P, junqi('mid'), st('bg-junqi', '对局中')),
  def('bg-junqi-flip', '军旗（陆战棋）', 'hobby', [34, 56, 1.6], JQ_P, junqi('flip'), st('bg-junqi', '翻棋')),
  def('bg-junqi-boxed', '军旗（陆战棋）', 'hobby', [43.4, 28.7, 16.6], JQ_P, junqiBoxed, st('bg-junqi', '收在盒里', { form: 'boxed' })),
  def('bg-doushou-start', '斗兽棋', 'hobby', [26.8, 34, 1.9], DS_P, doushou('start'), st('bg-doushou', '开局')),
  def('bg-doushou-mid', '斗兽棋', 'hobby', [30.5, 34, 2.7], DS_P, doushou('mid'), st('bg-doushou', '对局中')),
  def('bg-feixing-start', '飞行棋', 'hobby', [43, 43, 3.6], FX_P, feixing('start'), st('bg-feixing', '开局')),
  def('bg-feixing-mid', '飞行棋', 'hobby', [43, 43, 3.6], FX_P, feixing('mid'), st('bg-feixing', '对局中')),
  def('bg-gomoku-mid', '五子棋', 'hobby', [48.6, 32, 3.6], GOMOKU_P, gomoku('mid'), st('bg-gomoku', '对局中')),
  def('bg-gomoku-win', '五子棋', 'hobby', [48.6, 32, 3.6], GOMOKU_P, gomoku('win'), st('bg-gomoku', '五子连珠')),
  def('bg-poker-ddz', '扑克牌局', 'hobby', [48, 48, 2.7], POKER_GAME_P, pokerGame(3), st('bg-poker-game', '斗地主（三人）')),
  def('bg-poker-guandan', '扑克牌局', 'hobby', [56, 56, 3.9], POKER_GAME_P, pokerGame(4), st('bg-poker-game', '掼蛋（四人）')),
  def('bg-paijiu-wall', '牌九（骨牌）', 'hobby', [27.2, 11.4, 2], PJ_P, paijiu('wall'), st('bg-paijiu', '码好牌墩')),
  def('bg-paijiu-reveal', '牌九（骨牌）', 'hobby', [35.6, 35.6, 2], PJ_P, paijiu('open'), st('bg-paijiu', '开牌')),
  // 日式
  def('bg-hanafuda-mat', '花札', 'japanese', [55.9, 48, 6.1], HANA_MAT_P, hanafudaMat, st('bg-hanafuda-mat', '座布团上对局')),
  def('bg-sugoroku', '双六', 'japanese', [54, 38, 3.3], SUGO_P, sugoroku, st('bg-sugoroku', '铺开对局')),
  def('bg-sugoroku-rolled', '双六', 'japanese', [38, 10.7, 5.1], SUGO_P, sugorokuRolled, st('bg-sugoroku', '卷起来')),
  // 欧美
  def('bg-checkers-start', '国际跳棋', 'hobby', [36, 36, 2.3], CK_P, checkers('start'), st('bg-checkers', '开局')),
  def('bg-checkers-mid', '国际跳棋', 'hobby', [46.4, 36, 2.3], CK_P, checkers('mid'), st('bg-checkers', '对局中')),
  def('bg-property', '地产大亨桌游', 'hobby', [59.6, 50.3, 2.5], PROP_P, propertyGame, st('bg-property', '对局中')),
  def('bg-property-boxed', '地产大亨桌游', 'hobby', [51, 26, 6.5], PROP_P, propertyBoxed, st('bg-property', '收在盒里', { form: 'boxed' })),
  def('bg-words', '拼字游戏', 'hobby', [46.2, 46.6, 8.2], WORDS_P, words('play'), st('bg-words', '对局中')),
  def('bg-words-boxed', '拼字游戏', 'hobby', [48, 20, 6], WORDS_P, words('boxed'), st('bg-words', '收在盒里', { form: 'boxed' })),
  def('bg-chip-case', '扑克筹码箱', 'hobby', [42, 29.5, 22.5], CHIP_CASE_P, chipCase(true), st('bg-chip-case', '打开')),
  def('bg-chip-case-closed', '扑克筹码箱', 'hobby', [42.5, 23.6, 8], CHIP_CASE_P, chipCase(false), st('bg-chip-case', '合上', { form: 'closed' })),
  def('bg-holdem', '德州扑克牌局', 'hobby', [60, 42, 3.1], HOLDEM_P, holdem),
  def('bg-dominoes', '多米诺骨牌', 'hobby', [47.7, 29, 4.9], DOMINO_P, dominoes),
  def('bg-jenga-mid', '叠叠乐', 'hobby', [21, 12.6, 29.3], [['nordic', '#e8cfa0'], ['japanese', J.hinoki], ['cute', '#f0d6b0']], jengaMid, st('int-jenga', '抽到一半')),
  // 通用
  def('bg-box-stack-s', '桌游盒子摞', 'hobby', [31.3, 31.3, 15.1], BOX_P, boxStack([[30, 7, 30], [26, 4.5, 26], [20, 3.5, 14]], 3), st('bg-box-stack', '矮摞 3 盒')),
  def('bg-box-stack-m', '桌游盒子摞', 'hobby', [31.7, 30.9, 26.6], BOX_P, boxStack([[30, 8, 30], [30, 7, 30], [27, 5, 27], [24, 4, 18], [20, 2.5, 14]], 5), st('bg-box-stack', '中摞 5 盒')),
  def('bg-box-stack-l', '桌游盒子摞', 'hobby', [32.3, 32, 44.6], BOX_P, boxStack([[30, 8, 30], [30, 8, 30], [30, 7, 30], [28, 6, 28], [27, 5, 27], [24, 4, 18], [22, 3.5, 16], [18, 3, 12]], 7), st('bg-box-stack', '高摞 8 盒')),
  def('bg-dice-pair', '骰子', 'hobby', [4.5, 3.1, 1.7], DICE_P, dicePair, st('bg-dice', '两颗六面骰')),
  def('bg-dice-rpg', '骰子', 'hobby', [18, 14, 3.4], RPG_P, diceRpg, st('bg-dice', '多面骰 + 骰盘')),
  def('bg-score-pad', '计分本', 'hobby', [12.8, 15, 1], PAD_P, scorePad),
]

/**
 * 各地区的常见程度（一键布置按它挑游戏）：jp / cn / west 的权重，0 = 这个地区基本不出现。
 * 也覆盖 interests.ts 里已有的棋牌（围棋、象棋、将棋、花札…）。没列出的按 1。
 */
export const GAME_REGION: [RegExp, { jp: number; cn: number; west: number }][] = [
  [/^bg-(junqi|doushou|feixing|poker-(ddz|guandan)|paijiu)/, { jp: 0, cn: 3, west: 0 }],
  [/^bg-gomoku/, { jp: 1, cn: 3, west: 0 }],
  [/^(int-xiangqi|int-mahjong|hg-mj)/, { jp: 0.5, cn: 3, west: 0 }],
  [/^int-chinese-checkers/, { jp: 0.5, cn: 3, west: 0.5 }],
  [/^(hg-go-board|int-go)/, { jp: 2, cn: 2, west: 0.3 }],
  [/^(bg-hanafuda|int-hanafuda|int-karuta|bg-sugoroku|int-shogi)/, { jp: 3, cn: 0, west: 0 }],
  [/^int-reversi/, { jp: 3, cn: 1, west: 0.5 }],
  [/^(bg-checkers|bg-property|bg-words|bg-chip-case|bg-holdem|bg-dominoes|int-backgammon|int-bg-)/, { jp: 0.3, cn: 0.3, west: 3 }],
  [/^int-chess/, { jp: 0.5, cn: 0.8, west: 3 }],
  [/^bg-dice-rpg/, { jp: 1, cn: 0.5, west: 2 }],
  [/^(int-poker|int-uno|int-card-game)/, { jp: 1, cn: 1.5, west: 1.5 }],
]
/** 某件棋牌素材在地区里的权重 */
export function gameWeight(id: string, region: 'jp' | 'cn' | 'west') {
  const r = GAME_REGION.find(([re]) => re.test(id))
  return r ? r[1][region] : 1
}
