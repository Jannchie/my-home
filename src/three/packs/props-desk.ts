// 桌面摆件素材包：数码 / 文具 / 书 / 灯 / 小装饰。全部是 prop，原点在摆件底面中心，正面朝 +z。
// 主程序依赖的固定 id：prop-laptop / prop-desk-lamp / prop-table-lamp / prop-tv-43 / prop-tv-55 /
// prop-game-console / prop-book-stack / prop-books-upright / prop-monitor / prop-keyboard-mouse。

import * as THREE from 'three'
import { ball, capsule, cup, cyl, face, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, clipLevels, glow, rng, rod, shell, type AssetDef, type Fx, type ScreenPanel, paintPanel, paintLandscape } from '../kit'
import { P, cylX, cylZ, ghostOutlined, litOutlined, noOutline } from '../geo'
import { I, J, M, N, PROP, R, definer, type Pal } from '../packkit'

/** 本包默认是桌面摆件（prop: true） */
const def = definer(PROP)

// ---------- 配色 / 定义 ----------

const SCREEN = '#bfe3ff'
const SKIN = '#ffe3d1'
const SOIL = '#8b6a4f'
const WARM = '#ffd27a'

// ---------- 小工具 ----------

/** 屏幕面板声明 + 顶边夹挂层（和下面各 build 里面板的位置一致） */
function screensOf(screens: ScreenPanel[]): Partial<AssetDef> {
  return { screens, surfaces: clipLevels(screens) }
}

/** 屏幕上的发光圆点（太阳、云） */
const disc = (r: number, color: string, x: number, y: number, z: number, k = 0.7) => noOutline(litOutlined(cylZ(r, 0.6, color, x, y, z), color, k))

/** yz 平面里的细杆 */
function rodZ(az: number, ay: number, bz: number, by: number, r: number, color: string, x = 0) {
  const m = cyl(r, r, Math.hypot(bz - az, by - ay), color, {}, 8)
  m.position.set(x, (ay + by) / 2, (az + bz) / 2)
  m.rotation.x = Math.atan2(bz - az, by - ay)
  return m
}

/** yz 平面里的扁撑板（相框背撑、支架） */
function strutZ(az: number, ay: number, bz: number, by: number, w: number, t: number, color: string, x = 0) {
  const m = rbox(w, Math.hypot(bz - az, by - ay), t, color, {}, Math.min(0.3, t * 0.4))
  m.position.set(x, (ay + by) / 2, (az + bz) / 2)
  m.rotation.x = Math.atan2(bz - az, by - ay)
  return m
}

/** 叶片 / 花瓣：从 (x,y,z) 朝水平方向 a 伸出，仰角 p */
function petal(len: number, color: string, x: number, y: number, z: number, a: number, p: number, sw = 0.45, st = 0.15) {
  const m = ball(len / 2, color, {}, [sw, st, 1])
  m.rotation.order = 'YXZ'
  m.rotation.set(-p, Math.atan2(Math.cos(a), Math.sin(a)), 0)
  const r = (Math.cos(p) * len) / 2
  m.position.set(x + Math.cos(a) * r, y + (Math.sin(p) * len) / 2, z + Math.sin(a) * r)
  return m
}

/** 半球（开口朝下），y 是底面 */
function dome(r: number, color: string, x: number, y: number, z: number, sy = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(color))
  m.position.set(x, y, z)
  m.scale.y = sy
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 七段数码管 */
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' }
function digits(g: THREE.Group, text: string, color: string, x0: number, y: number, z: number, dw = 1.6, dh = 3) {
  const s = dw * 0.22
  let x = x0
  for (const ch of text) {
    if (ch === ':') {
      g.add(glow(s, s, color, { x, y: y + dh * 0.25, z }, 0.9))
      g.add(glow(s, s, color, { x, y: y + dh * 0.65, z }, 0.9))
      x += dw * 0.8
      continue
    }
    const cx = x + dw / 2
    for (const sg of SEG[ch] ?? '') {
      if (sg === 'a') g.add(glow(dw - s, s, color, { x: cx, y: y + dh - s, z }, 0.9))
      if (sg === 'g') g.add(glow(dw - s, s, color, { x: cx, y: y + dh / 2 - s / 2, z }, 0.9))
      if (sg === 'd') g.add(glow(dw - s, s, color, { x: cx, y, z }, 0.9))
      if (sg === 'b') g.add(glow(s, dh / 2 - s / 2, color, { x: cx + dw / 2 - s / 2, y: y + dh / 2, z }, 0.9))
      if (sg === 'c') g.add(glow(s, dh / 2 - s / 2, color, { x: cx + dw / 2 - s / 2, y: y + s / 2, z }, 0.9))
      if (sg === 'f') g.add(glow(s, dh / 2 - s / 2, color, { x: cx - dw / 2 + s / 2, y: y + dh / 2, z }, 0.9))
      if (sg === 'e') g.add(glow(s, dh / 2 - s / 2, color, { x: cx - dw / 2 + s / 2, y: y + s / 2, z }, 0.9))
    }
    x += dw * 1.35
  }
}

/** 电脑桌面：两个窗口 + 任务栏。(gw, gh) 是屏幕发光区尺寸，y0 是它的底，z 是第二层的位置 */
function desktopUI(g: THREE.Group, gw: number, gh: number, y0: number, z: number, accent: string) {
  g.add(glow(gw * 0.42, gh * 0.5, '#ffffff', { x: -gw * 0.18, y: y0 + gh * 0.25, z }, 0.6))
  g.add(glow(gw * 0.42, gh * 0.08, accent, { x: -gw * 0.18, y: y0 + gh * 0.67, z: z + 0.4 }, 0.6))
  g.add(glow(gw * 0.3, gh * 0.36, '#fff3b0', { x: gw * 0.22, y: y0 + gh * 0.36, z }, 0.6))
  g.add(glow(gw * 0.9, gh * 0.07, '#eef7ff', { y: y0 + gh * 0.04, z }, 0.5))
}

/** 显示器 / 电视面板：原点在面板底边中心，屏幕朝 +z，面板厚 t（z 方向 ±t/2） */
function screenPanel(sw: number, sh: number, frame: string, t: number, chin: number) {
  const g = new THREE.Group()
  g.add(rbox(sw, sh, t, frame, {}, Math.min(1, t * 0.4)))
  g.add(rbox(sw * 0.55, sh * 0.55, 3, shade(frame, -0.05), { y: sh * 0.2, z: -t / 2 - 1.2 }, 1.2))
  const b = Math.max(0.8, sw * 0.02)
  const gw = sw - b * 2
  const gh = sh - b - chin
  g.add(glow(gw, gh, SCREEN, { y: chin, z: t / 2 + 0.2 }, 0.5))
  return { g, gw, gh, y0: chin, z: t / 2 + 0.7 }
}

// ---------- 数码 ----------

/** 打开的笔记本电脑：[机身, 键盘, 贴纸] */
function laptop(p: string[]) {
  const [body, keys, acc] = p
  const g = new THREE.Group()
  const bz = 2
  g.add(rbox(34, 1.6, 24, body, { z: bz }, 0.7))
  g.add(rbox(29, 0.4, 10, keys, { y: 1.4, z: bz - 3.5 }, 0.15))
  g.add(rbox(11, 0.4, 6.5, shade(body, -0.06), { y: 1.4, z: bz + 6.5 }, 0.15))
  const lid = new THREE.Group()
  lid.add(rbox(34, 23, 1, body, {}, 0.45))
  lid.add(glow(31, 19.5, SCREEN, { y: 2, z: 0.55 }, 0.6))
  lid.add(glow(13, 9, '#ffffff', { x: -6, y: 8, z: 0.95 }, 0.6))
  lid.add(glow(13, 1.6, acc, { x: -6, y: 15.6, z: 1.35 }, 0.6))
  lid.add(glow(9, 6, '#fff3b0', { x: 8.5, y: 5, z: 0.95 }, 0.6))
  lid.add(noOutline(ball(2.6, acc, { y: 13, z: -0.55 }, [1, 1, 0.15])))
  g.add(P(lid, 0, 1, bz - 11.6, -0.2))
  return g
}

/** 外接显示器：[边框, 支架, 窗口点缀] */
function monitor(sw: number, sh: number, bw: number, bd: number) {
  return (p: string[]) => {
    const [frame, stand, acc] = p
    const g = new THREE.Group()
    const lift = 10
    g.add(rbox(bw, 1.4, bd, stand, { z: -1 }, 0.6))
    g.add(rbox(4, lift + 8, 2.4, stand, { y: 1, z: -5.2 }, 0.8))
    const s = screenPanel(sw, sh, frame, 2, 2)
    desktopUI(s.g, s.gw, s.gh, s.y0, s.z, acc)
    s.g.add(noOutline(ball(0.35, '#9be7b5', { x: sw / 2 - 3, y: 1, z: 1.05 })))
    g.add(P(s.g, 0, lift, -2.2))
    return g
  }
}

/** 双屏：两台显示器装在同一根立杆的横臂上 */
function dualMonitor(p: string[]) {
  const [frame, stand, acc] = p
  const g = new THREE.Group()
  const zc = 1.25
  g.add(rbox(24, 1.6, 18, stand, { z: -4 + zc }, 0.7))
  g.add(cyl(1.6, 1.6, 26, stand, { y: 1, z: -8 + zc }, 12))
  g.add(rbox(62, 3, 3, stand, { y: 24.5, z: -8 + zc }, 1))
  for (const s of [-1, 1]) {
    const pn = screenPanel(55, 33, frame, 2, 1.2)
    desktopUI(pn.g, pn.gw, pn.gh, pn.y0, pn.z, s < 0 ? acc : C.mint)
    pn.g.add(rbox(3, 3, 8, stand, { y: 11, z: -7 }, 1))
    g.add(P(pn.g, s * 27.6, 14, 2.66 + zc, 0, s * -0.25))
  }
  return g
}

/** 键盘 + 鼠标 + 鼠标垫：[外壳, 键帽, 点缀] */
function keyboardMouse(p: string[]) {
  const [body, keys, acc] = p
  const g = new THREE.Group()
  const kx = -9
  g.add(rbox(36, 1.8, 12.5, body, { x: kx }, 0.6))
  const rows = [-4, -1.4, 1.2]
  for (const [ri, z] of rows.entries()) {
    for (let i = 0; i < 12; i++) {
      const enter = ri === 1 && i === 11
      g.add(rbox(2.2, 0.7, 2.2, enter ? acc : keys, { x: kx - 14.3 + i * 2.6, y: 1.5, z }, 0.3))
    }
  }
  g.add(rbox(13, 0.7, 2.2, keys, { x: kx, y: 1.5, z: 3.8 }, 0.3))
  for (const s of [-1, 1]) g.add(rbox(4.8, 0.7, 2.2, shade(keys, -0.06), { x: kx + s * 10.5, y: 1.5, z: 3.8 }, 0.3))
  g.add(rbox(17, 0.4, 16, shade(acc, 0.12), { x: 18.5, z: 0 }, 0.2))
  g.add(ball(2.8, body, { x: 18.5, y: 2.05, z: 1 }, [1.05, 0.6, 1.6]))
  g.add(cylX(0.5, 0.6, acc, 18.5, 3.6, 3, 12))
  return g
}

/** 带底座的平板电视：[边框, 底座, 指示灯] */
function tv(sw: number, sh: number, bw: number, bd: number) {
  return (p: string[]) => {
    const [frame, stand, acc] = p
    const g = new THREE.Group()
    const lift = 7
    g.add(rbox(bw, 1.6, bd, stand, {}, 0.7))
    g.add(rbox(bw * 0.22, lift + 10, 2.6, stand, { y: 1, z: -1.8 }, 1))
    const pn = new THREE.Group()
    pn.add(rbox(sw, sh, 2.4, frame, {}, 1))
    pn.add(rbox(sw * 0.6, sh * 0.55, 3.5, shade(frame, -0.05), { y: sh * 0.15, z: -2.8 }, 1.4))
    const b = 1.2
    const gw = sw - b * 2
    const gh = sh - b * 2
    const z1 = 1.45
    const z2 = z1 + 0.5
    pn.add(glow(gw, gh, '#9ad7ff', { y: b, z: z1 }, 0.45))
    // 画面：太阳、云、两座小山、一棵树
    pn.add(disc(gh * 0.11, '#fff3a0', gw * 0.3, b + gh * 0.72, z2, 0.8))
    pn.add(disc(gh * 0.08, '#ffffff', -gw * 0.24, b + gh * 0.7, z2))
    pn.add(disc(gh * 0.1, '#ffffff', -gw * 0.18, b + gh * 0.72, z2 + 0.15))
    pn.add(disc(gh * 0.07, '#ffffff', -gw * 0.12, b + gh * 0.69, z2 + 0.3))
    pn.add(glow(gw * 0.6, gh * 0.22, '#8fdc9c', { x: -gw * 0.2, y: b, z: z2 }, 0.5))
    pn.add(glow(gw * 0.45, gh * 0.14, '#6fcf8a', { x: gw * 0.27, y: b, z: z2 + 0.3 }, 0.5))
    pn.add(disc(gh * 0.08, '#4fae6a', gw * 0.16, b + gh * 0.24, z2 + 0.6, 0.5))
    pn.add(glow(gh * 0.025, gh * 0.08, '#b98a5e', { x: gw * 0.16, y: b + gh * 0.13, z: z2 + 0.5 }, 0.4))
    pn.add(noOutline(ball(0.4, acc, { x: sw / 2 - 4, y: 0.5, z: 1.25 })))
    g.add(P(pn, 0, lift, 0))
    return g
  }
}

/** 游戏机（底座 + 主机 + 左右手柄）+ 一个手柄：[底座, 左手柄色, 右手柄色] */
function gameConsole(p: string[]) {
  const [dock, joyL, joyR] = p
  const g = new THREE.Group()
  const dx = -6
  g.add(rbox(17.5, 7, 5, dock, { x: dx, z: -3.5 }, 1.2))
  g.add(rbox(17, 10, 1.4, '#3d3d46', { x: dx, y: 1.2, z: -0.6 }, 0.5))
  g.add(glow(13.5, 7.6, SCREEN, { x: dx, y: 3.4, z: 0.3 }, 0.55))
  g.add(glow(5, 3, '#fff3b0', { x: dx - 3, y: 6, z: 0.75 }, 0.6))
  g.add(glow(4, 2.4, C.pink, { x: dx + 3.5, y: 4.6, z: 0.75 }, 0.6))
  g.add(rbox(17, 3, 1.6, dock, { x: dx, z: 0.9 }, 0.6))
  for (const [s, col] of [
    [-1, joyL],
    [1, joyR],
  ] as const) {
    const jx = dx + s * 10.2
    g.add(rbox(3.4, 10, 1.6, col, { x: jx, y: 1.2, z: -0.6 }, 0.8))
    g.add(cylZ(0.6, 0.6, '#3d3d46', jx, s < 0 ? 8.5 : 6, 0.4, 12))
    g.add(ball(0.4, shade(col, -0.2), { x: jx, y: s < 0 ? 5.5 : 8.5, z: 0.25 }))
  }
  // 桌上的手柄
  const pad = new THREE.Group()
  // 左摇杆 + 右四键（不对称布局，避免两个黑圆点 + 中间小点看起来像一张脸）
  pad.add(rbox(10, 2.6, 5.4, dock, { y: 0.3 }, 1))
  for (const [s, col] of [
    [-1, joyL],
    [1, joyR],
  ] as const) pad.add(ball(2.4, col, { x: s * 4.8, y: 1.9, z: 1.4 }, [0.95, 0.75, 1.35]))
  pad.add(cyl(0.75, 0.6, 0.5, '#3d3d46', { x: -2.4, y: 2.85, z: 0.2 }, 12), ball(0.75, '#3d3d46', { x: -2.4, y: 3.45, z: 0.2 }, [1, 0.45, 1]))
  for (const [bx, bz] of [[0, -0.9], [0, 0.9], [-0.9, 0], [0.9, 0]] as const) pad.add(ball(0.42, shade(joyR, -0.25), { x: 2.4 + bx, y: 2.95, z: 0.2 + bz }, [1, 0.6, 1]))
  g.add(P(pad, 10, 0, 4, 0, -0.3))
  return g
}

/** 设备 + 支架（平板、手机通用）：[支架, 设备外壳, 点缀] */
function deviceStand(dw: number, dh: number, dt: number, tilt: number, bw: number, bd: number) {
  return (p: string[]) => {
    const [stand, body, acc] = p
    const g = new THREE.Group()
    g.add(rbox(bw, 0.8, bd, stand, {}, 0.35))
    const zc = bd / 2 - 1.25
    const dev = new THREE.Group()
    dev.add(rbox(dw, dh, dt, body, {}, Math.min(0.6, dt * 0.45)))
    const b = Math.min(dw, dh) * 0.07
    const gw = dw - b * 2
    const gh = dh - b * 2
    dev.add(glow(gw, gh, SCREEN, { y: b, z: dt / 2 + 0.15 }, 0.55))
    const cols = ['#ffffff', acc, '#fff3b0', '#c9f0dc', '#ffd6e0', acc]
    const n = dw > dh ? 4 : 2
    const m = dw > dh ? 2 : 3
    const cs = Math.min(gw / (n * 2), gh / (m * 2.2))
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++)
        dev.add(glow(cs, cs, cols[(i + j * n) % cols.length], { x: (i - (n - 1) / 2) * cs * 1.8, y: b + gh * 0.55 - j * cs * 1.8, z: dt / 2 + 0.55 }, 0.6))
    g.add(P(dev, 0, 0.8, zc, -tilt))
    g.add(rbox(bw * 0.9, 1.4, 0.8, stand, { y: 0.8, z: bd / 2 - 0.4 }, 0.3))
    const hy = dh * 0.55
    g.add(strutZ(-bd / 2 + 1.2, 0.8, zc - hy * Math.sin(tilt) - dt / 2, 0.8 + hy * Math.cos(tilt), Math.min(bw * 0.6, 6), 0.8, stand))
    return g
  }
}

/** 一对桌面音箱：[箱体, 喇叭, 点缀环] */
function deskSpeakers(p: string[]) {
  const [body, cone, ring] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const x = s * 16
    g.add(rbox(10, 16, 11, body, { x, ry: -s * 0.15 }, 1.6))
    const fz = 5.5
    const k = new THREE.Group()
    k.add(cylZ(3.4, 0.8, ring, 0, 5.5, 0.3))
    k.add(cylZ(2.8, 0.8, cone, 0, 5.5, 0.5))
    k.add(ball(1, shade(cone, -0.1), { y: 5.5, z: 0.9 }, [1, 1, 0.5]))
    k.add(cylZ(1.4, 0.8, ring, 0, 11.6, 0.3))
    k.add(cylZ(1, 0.8, cone, 0, 11.6, 0.5))
    g.add(P(k, x + Math.sin(-s * 0.15) * fz, 0, Math.cos(s * 0.15) * fz, 0, -s * 0.15))
  }
  return g
}

/** 耳机 + 耳机架：[支架, 头梁, 耳罩] */
function headphoneStand(p: string[]) {
  const [stand, band, ear] = p
  const g = new THREE.Group()
  g.add(puck(6, 1.6, stand))
  g.add(cyl(0.9, 0.9, 22, stand, { y: 1.4 }, 12))
  g.add(rbox(4, 1.4, 4, stand, { y: 23.2 }, 0.6))
  g.add(torus(7, 1.1, band, { y: 18 }, Math.PI))
  g.add(rbox(6, 1.2, 3.2, shade(band, 0.15), { y: 24.8 }, 0.5))
  for (const s of [-1, 1]) {
    g.add(P(puck(3.2, 2.4, ear), s * 7.4, 17, 0, 0, 0, Math.PI / 2))
    g.add(P(puck(2.8, 1.2, shade(ear, 0.18)), s * 5.8, 17, 0, 0, 0, Math.PI / 2))
  }
  return g
}

/** 打铃闹钟：[钟身, 铃铛, 指针] */
function alarmClock(p: string[]) {
  const [body, bell, hand] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(ball(1.1, bell, { x: s * 3.6, y: 1.1 }, [1, 0.9, 1]))
  g.add(cylZ(6, 4.5, body, 0, 8, 0, 32))
  g.add(cylZ(5.1, 0.4, C.white, 0, 8, 2.3, 32))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    g.add(noOutline(ball(0.35, hand, { x: Math.cos(a) * 4.1, y: 8 + Math.sin(a) * 4.1, z: 2.55 })))
  }
  g.add(rbox(0.5, 3.2, 0.3, hand, { y: 7.8, z: 2.65, rz: 0.5 }, 0.2))
  g.add(rbox(0.5, 2.2, 0.3, hand, { y: 7.9, z: 2.95, rz: -1.9 }, 0.2))
  g.add(ball(0.5, hand, { y: 8, z: 3.1 }))
  for (const s of [-1, 1]) {
    g.add(P(dome(2.6, bell, 0, 0, 0), s * 4, 13.2, 0, 0, 0, -s * 0.6))
    g.add(ball(0.6, bell, { x: s * 5.4, y: 15.3 }))
  }
  g.add(rod(0, 13.6, 0, 15.8, 0.35, shade(bell, -0.15)))
  g.add(ball(0.7, shade(bell, -0.15), { y: 15.9 }))
  return g
}

/** 电子钟：[外壳, 数字颜色] */
function digitalClock(p: string[]) {
  const [body, led] = p
  const g = new THREE.Group()
  g.add(rbox(15, 7, 5, body, {}, 1.6))
  g.add(rbox(13, 5, 0.4, '#34303f', { y: 1, z: 2.45 }, 0.2))
  digits(g, '07:30', led, -5.6, 1.9, 2.9, 1.6, 3.2)
  g.add(rbox(3, 0.6, 1.2, shade(body, -0.1), { x: 4, y: 6.8, z: -0.5 }, 0.25))
  return g
}

/** 数码相框：[边框, -, 点缀] */
function digitalFrame(p: string[]) {
  const [frame, , acc] = p
  const g = new THREE.Group()
  const f = new THREE.Group()
  f.add(rbox(22, 16, 1.4, frame, {}, 0.6))
  f.add(glow(19.4, 13.4, '#a8dcff', { y: 1.3, z: 0.75 }, 0.5))
  f.add(disc(1.8, '#fff3a0', 5.5, 10.6, 1.25))
  f.add(glow(12, 3.4, '#8fdc9c', { x: -3.5, y: 1.3, z: 1.15 }, 0.5))
  f.add(glow(8, 2.2, '#6fcf8a', { x: 5, y: 1.3, z: 1.45 }, 0.5))
  f.add(noOutline(ball(0.3, acc, { x: 10, y: 0.7, z: 0.75 })))
  g.add(P(f, 0, 0, 2.7, -0.18))
  g.add(strutZ(-3.8, 0, 2.7 - 9 * Math.sin(0.18) - 0.7, 9 * Math.cos(0.18), 4, 0.8, shade(frame, -0.08)))
  return g
}

/** 迷你 CRT 电视（复古）：[外壳, 屏框, 旋钮] */
function crtTv(p: string[]) {
  const [body, bezel, knob] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(1.1, 0.7, 3.2, R.caramel, { x: sx * 11, z: sz * 9 }, 10))
  g.add(rbox(30, 26, 26, body, { y: 3 }, 4))
  g.add(rbox(21, 18, 1, bezel, { x: -3.5, y: 7, z: 13 }, 1.5))
  g.add(glow(18.6, 15.4, '#b8e8d8', { x: -3.5, y: 8.3, z: 13.7 }, 0.5))
  g.add(disc(2.2, '#fff3a0', 0, 19, 14.2))
  g.add(glow(12, 3, '#8fd0a8', { x: -6, y: 8.5, z: 14.2 }, 0.45))
  for (const y of [21, 15.5]) g.add(cylZ(1.7, 1.4, knob, 10.5, y, 13.4))
  for (let i = 0; i < 4; i++) g.add(rbox(4.5, 0.6, 0.6, shade(body, -0.2), { x: 10.5, y: 6.5 + i * 1.6, z: 12.9 }, 0.25))
  g.add(ball(1.8, M.silver, { y: 29, z: -4 }, [1.2, 0.7, 1]))
  for (const [bx, by] of [
    [-8, 43],
    [9, 42],
  ]) {
    g.add(rod(0, 29.5, bx, by, 0.3, M.silver, -4))
    g.add(ball(0.6, M.silver, { x: bx, y: by, z: -4 }))
  }
  return g
}

/** 复古收音机：[外壳, 喇叭网, 旋钮] */
function radio(p: string[]) {
  const [body, grille, knob] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(rbox(3, 1, 7, shade(body, -0.2), { x: s * 9 }, 0.4))
  g.add(rbox(24, 13, 9, body, { y: 0.8 }, 2.2))
  g.add(cylZ(4.6, 0.6, grille, -5, 7.2, 4.6, 32))
  for (let i = -2; i <= 2; i++) g.add(rbox(7 - Math.abs(i) * 1.2, 0.4, 0.3, shade(grille, -0.18), { x: -5, y: 7 + i * 1.5, z: 5 }, 0.15))
  g.add(rbox(8, 3, 0.4, C.cream, { x: 6, y: 9, z: 4.6 }, 0.3))
  g.add(rbox(0.3, 2.2, 0.3, R.red, { x: 5, y: 9.4, z: 4.9 }, 0.1))
  for (const x of [3.5, 8.5]) g.add(cylZ(1.3, 1.4, knob, x, 5, 4.9))
  g.add(torus(6, 0.6, shade(body, -0.15), { y: 13.4 }, Math.PI))
  g.add(rod(9.5, 13.5, 14, 27, 0.25, M.silver, -2))
  g.add(ball(0.5, M.silver, { x: 14, y: 27, z: -2 }))
  return g
}

/** 唱片机：[机身, 转盘, 唱片标签] */
function turntable(p: string[]) {
  const [body, platter, label] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(puck(1.6, 1.4, M.black, { x: sx * 17, z: sz * 13 }))
  g.add(rbox(40, 7, 32, body, { y: 1.2 }, 1.4))
  g.add(puck(14, 1.4, platter, { x: -4, y: 8 }))
  g.add(puck(13.6, 0.5, '#2f2c33', { x: -4, y: 9.2 }))
  g.add(puck(4, 0.4, label, { x: -4, y: 9.5 }))
  g.add(cyl(0.3, 0.3, 1, M.silver, { x: -4, y: 9.5 }, 8))
  g.add(cyl(1.8, 1.8, 3, M.silver, { x: 14, y: 8, z: -10 }, 16))
  const arm = new THREE.Group()
  arm.add(rbox(0.8, 0.8, 16, M.silver, { y: -0.4, z: 8 }, 0.3))
  arm.add(rbox(1.6, 0.8, 2.6, M.black, { y: -0.6, z: 16.6 }, 0.3))
  arm.add(rbox(2, 2, 2.4, M.char, { y: -1, z: -1.8 }, 0.5))
  g.add(P(arm, 14, 11.6, -10, 0, -0.5))
  for (const x of [10, 15]) g.add(cylZ(1, 1, M.silver, x, 4.5, 16.4))
  return g
}

/** 拨盘电话（复古）：[机身, 拨盘, 中心] */
function rotaryPhone(p: string[]) {
  const [body, dial, center] = p
  const g = new THREE.Group()
  g.add(rbox(18, 5, 22, body, {}, 2))
  g.add(rbox(18, 6, 12, body, { y: 4, z: -5 }, 2.4))
  const d = new THREE.Group()
  d.add(cyl(4.5, 4.5, 0.8, dial, {}, 32))
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 1.7 + 0.6
    d.add(cyl(0.55, 0.55, 0.3, shade(dial, 0.25), { x: Math.cos(a) * 3.1, y: 0.75, z: Math.sin(a) * 3.1 }, 12))
  }
  d.add(cyl(1.4, 1.4, 0.3, center, { y: 0.75 }, 20))
  g.add(P(d, 0, 6.4, 6, 0.4))
  for (const s of [-1, 1]) g.add(rbox(2, 2.2, 3, shade(body, -0.1), { x: s * 5, y: 9.8, z: -5 }, 0.6))
  g.add(P(capsule(1.6, 11, body), 0, 12, -5, 0, 0, Math.PI / 2))
  for (const s of [-1, 1]) g.add(ball(2.6, body, { x: s * 7.6, y: 11.4, z: -5 }, [1, 0.75, 1.2]))
  for (let i = 0; i < 5; i++) g.add(torus(0.8, 0.25, shade(body, -0.1), { x: -9.6 - i * 0.7, y: 2.5, z: -7, ry: Math.PI / 2 }))
  return g
}

/** 打字机（复古）：[机身, 键帽, 卷纸旋钮] */
function typewriter(p: string[]) {
  const [body, keys, acc] = p
  const g = new THREE.Group()
  g.add(rbox(30, 5, 24, body, {}, 1.5))
  g.add(rbox(30, 9, 10, body, { y: 4, z: -7 }, 2))
  for (let r = 0; r < 3; r++) {
    const ky = 5.6 + (2 - r) * 0.9
    const z = 3 + r * 2.8
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * 2.7 + r * 0.6
      g.add(cyl(0.25, 0.25, ky - 4.8, M.char, { x, y: 4.8, z }, 6))
      g.add(cyl(1, 1, 0.6, keys, { x, y: ky, z }, 14))
    }
  }
  g.add(rbox(12, 0.6, 1.5, keys, { y: 5.6, z: 11.2 }, 0.3))
  g.add(rbox(14, 2.4, 3, M.char, { y: 4.8, z: -1.2 }, 0.6))
  g.add(cylX(1.8, 32, M.char, 0, 14.6, -7))
  for (const s of [-1, 1]) g.add(cylX(2, 1.6, acc, s * 16.8, 14.6, -7))
  g.add(rbox(21, 16, 0.3, C.white, { y: 13.5, z: -8.4, rx: -0.15 }, 0.1))
  for (let i = 0; i < 3; i++) g.add(noOutline(rbox(14 - i * 3, 0.3, 0.3, M.gray, { x: -2, y: 25 - i * 1.5, z: -9.6 + i * 0.22, rx: -0.15 }, 0.1)))
  g.add(rod(-17.5, 15.5, -21, 18, 0.35, M.silver, -7))
  g.add(ball(0.7, acc, { x: -21, y: 18, z: -7 }))
  return g
}

// ---------- 书 ----------

/** 一本平放的书：封面 + 书页（右侧露出） */
function flatBook(bw: number, t: number, bd: number, color: string) {
  const g = new THREE.Group()
  g.add(rbox(bw, t, bd, color, {}, 0.4))
  g.add(rbox(bw - 0.6, t - 0.7, bd - 1.2, C.cream, { x: 0.6, y: 0.35 }, 0.2))
  return g
}

function bookStack(p: string[]) {
  const r = rng(11)
  const g = new THREE.Group()
  const cols = [p[0], p[1], p[2], shade(p[0], -0.1)]
  let y = 0
  for (let i = 0; i < 4; i++) {
    const t = 2.4 + r() * 1.4
    const b = flatBook(22 - i * 1.6 + r() * 1.5, t, 16 - i * 0.8, cols[i])
    g.add(P(b, (r() - 0.5) * 1.5, y, (r() - 0.5) * 1, 0, (r() - 0.5) * 0.45))
    y += t
  }
  // 最上面放一支笔
  g.add(cylX(0.4, 13, p[2], 1, y + 0.4, 2, 8))
  g.add(P(cyl(0.05, 0.4, 1.2, C.ink, {}, 8), 8.1, y + 0.4, 2, 0, 0, -Math.PI / 2))
  return g
}

/** 一排立着的书 + 两个猫耳书立 */
function booksUpright(p: string[]) {
  const r = rng(5)
  const g = new THREE.Group()
  const cols = [p[0], p[1], p[2], shade(p[0], 0.08), shade(p[1], -0.1), C.cream, shade(p[2], 0.1)]
  const books = cols.map((c) => ({ c, t: 1.8 + r() * 1.8, h: 17 + r() * 7, d: 14 + r() * 2 }))
  const total = books.reduce((s, b) => s + b.t, 0) + 6
  let x = -total / 2 + 3
  const end = shade(p[2], -0.12)
  for (const s of [-1, 1]) {
    const ex = s * (total / 2 - 1.5)
    g.add(rbox(3, 13, 11, end, { x: ex }, 1.2))
    for (const e of [-1, 1]) g.add(P(cyl(0.1, 1.3, 2.2, end, {}, 4), ex, 13.6, e * 2.6, 0, Math.PI / 4))
  }
  for (const b of books) {
    const cx = x + b.t / 2
    g.add(rbox(b.t, b.h, b.d, b.c, { x: cx }, 0.3))
    g.add(rbox(b.t - 0.3, b.h - 0.8, b.d - 0.8, C.cream, { x: cx, y: 0.4, z: -0.7 }, 0.15))
    g.add(rbox(b.t - 0.3, 1.2, 0.4, shade(b.c, -0.2), { x: cx, y: b.h * 0.72, z: b.d / 2 + 0.1 }, 0.15))
    g.add(rbox(b.t - 0.3, 0.6, 0.4, shade(b.c, -0.2), { x: cx, y: b.h * 0.18, z: b.d / 2 + 0.1 }, 0.15))
    x += b.t
  }
  return g
}

/** 摊开的书 */
function openBook(p: string[]) {
  const [cover, , mark] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    g.add(rbox(15, 0.4, 21, cover, { x: s * 7.6, y: 0.45, rz: -s * 0.06 }, 0.15))
    g.add(rbox(14.2, 1.2, 20, C.cream, { x: s * 7.4, y: 0.75, rz: -s * 0.1 }, 0.4))
    for (let i = 0; i < 6; i++) g.add(noOutline(rbox(10, 0.2, 0.4, '#c9b9a6', { x: s * 7.4, y: 2, z: -7 + i * 2.6, rz: -s * 0.1 }, 0.1)))
  }
  g.add(rbox(1.2, 0.3, 8, mark, { x: 1.2, y: 1.95, z: 9 }, 0.1))
  return g
}

// ---------- 文具 ----------

/** 笔筒：[筒, 笔色1, 笔色2] */
function penCup(p: string[]) {
  const [body, a, b] = p
  const g = new THREE.Group()
  g.add(cup(4, 3.6, 10, 0.5, body))
  const pens: [number, number, number, string, string][] = [
    [-1.4, -2.6, 0.6, a, 'pen'],
    [1.2, 2.4, -0.8, b, 'pen'],
    [0.2, 0.6, 1.4, C.lemon, 'pencil'],
    [-0.6, -1.2, -1.6, shade(a, -0.2), 'pen'],
    [1.6, 1.8, 1, C.white, 'ruler'],
  ]
  for (const [x0, dx, z, col, kind] of pens) {
    const top = kind === 'ruler' ? 16 : 14.5
    if (kind === 'ruler') {
      g.add(P(rbox(1.8, 15, 0.3, col, {}, 0.1), x0 + dx / 2, 0.5 + 7.5, z, 0, 0, -Math.atan2(dx, 15)))
      continue
    }
    g.add(rod(x0, 0.6, x0 + dx, top, kind === 'pencil' ? 0.4 : 0.45, col, z))
    const a2 = Math.atan2(-dx, top - 0.6)
    if (kind === 'pencil') {
      g.add(P(cyl(0.05, 0.4, 1.4, C.woodL, {}, 6), x0 + dx * 1.05, top + 0.7, z, 0, 0, a2))
    } else {
      g.add(ball(0.55, shade(col, -0.15), { x: x0 + dx, y: top, z }))
    }
  }
  return g
}

/** 便签纸块：[三层颜色] */
function stickyNotes(p: string[]) {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) g.add(rbox(7.6, 1, 7.6, p[i], { y: i, ry: (i - 1) * 0.08 }, 0.12))
  g.add(rbox(7.6, 0.15, 7.6, p[2], { y: 3.05, z: -0.2, rx: -0.12, ry: 0.08 }, 0.05))
  g.add(rbox(7.6, 0.15, 7.6, p[0], { x: 6, y: 0.05, z: 3, ry: 0.5 }, 0.05))
  for (let i = 0; i < 3; i++) g.add(noOutline(rbox(4.5 - i, 0.1, 0.3, '#8a7a7a', { x: 5.6, y: 0.25, z: 1.8 + i * 1.1, ry: 0.5 }, 0.04)))
  return g
}

/** 文件分类架：[框, 文件夹1, 文件夹2] */
function fileSorter(p: string[]) {
  const [frame, f1, f2] = p
  const g = new THREE.Group()
  g.add(rbox(25, 1, 20, frame, {}, 0.4))
  for (const s of [-1, 1]) g.add(rbox(0.8, 16, 20, frame, { x: s * 12.1 }, 0.3))
  const walls: [number, number][] = [
    [9.6, 6],
    [3.2, 10],
    [-3.2, 14],
    [-9.6, 16],
  ]
  for (const [z, h] of walls) g.add(rbox(23.6, h, 0.8, frame, { z }, 0.3))
  const slots: [number, number, string][] = [
    [6.4, 9, f1],
    [0, 13, f2],
    [-6.4, 17, shade(f1, 0.08)],
  ]
  for (const [z, h, c] of slots) {
    g.add(rbox(21, h, 0.6, c, { y: 1, z: z - 0.8 }, 0.2))
    g.add(rbox(19, h + 1.5, 0.3, C.white, { x: -0.5, y: 1, z: z + 0.4 }, 0.1))
    g.add(rbox(4, 1.4, 0.6, c, { x: 6, y: 1 + h, z: z - 0.8 }, 0.2))
  }
  return g
}

/** 订书机：[上壳, 底座, -] */
function stapler(p: string[]) {
  const [body, base] = p
  const g = new THREE.Group()
  g.add(rbox(4, 1.2, 15, base, {}, 0.5))
  g.add(rbox(3, 0.3, 3, M.silver, { y: 1.1, z: 5.4 }, 0.1))
  g.add(rbox(3.6, 2.2, 14, body, { y: 1.7, z: 0.3, rx: -0.04 }, 1))
  g.add(cylX(1, 4.2, base, 0, 2.1, -6.6))
  return g
}

/** 胶带座：[座, 胶带, -] */
function tapeDispenser(p: string[]) {
  const [body, tape] = p
  const g = new THREE.Group()
  g.add(rbox(6.4, 5.6, 12, body, {}, 2))
  g.add(P(torus(2.3, 0.9, tape), 0, 6, -1, 0, Math.PI / 2))
  g.add(cylX(1.2, 2.2, shade(body, -0.12), 0, 6, -1))
  g.add(rbox(4.4, 0.8, 1, M.silver, { y: 5.4, z: 5.4 }, 0.2))
  g.add(strutZ(2.2, 6.9, 5.2, 6, 1.8, 0.15, tape))
  return g
}

/** 台历：[板, 页眉, 圈注] */
function deskCalendar(p: string[]) {
  const [board, head, mark] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const pg = new THREE.Group()
    pg.add(rbox(15, 11, 0.4, board, {}, 0.15))
    if (s > 0) {
      pg.add(rbox(14, 10, 0.3, C.white, { y: 0.3, z: 0.4 }, 0.1))
      pg.add(rbox(14, 2.2, 0.3, head, { y: 8, z: 0.6 }, 0.1))
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 4; j++) pg.add(noOutline(rbox(1.2, 0.8, 0.2, j === 1 && i === 3 ? mark : '#c9bdb3', { x: -5.5 + i * 2.2, y: 1.2 + j * 1.6, z: 0.6 }, 0.05)))
      pg.add(torus(1, 0.15, mark, { x: 1.1, y: 3.6, z: 0.8 }))
    }
    g.add(P(pg, 0, 0, s * 3.3, -s * 0.3))
  }
  for (let i = 0; i < 5; i++) g.add(torus(0.6, 0.15, M.silver, { x: -6 + i * 3, y: 10.7, z: 0, ry: Math.PI / 2 }))
  return g
}

/** 小黑板画架：[框, 板面, 粉笔画] */
function miniBlackboard(p: string[]) {
  const [frame, board, chalk] = p
  const g = new THREE.Group()
  const f = new THREE.Group()
  for (const s of [-1, 1]) f.add(rbox(1, 19, 0.8, frame, { x: s * 7.6, z: -0.9 }, 0.3))
  f.add(rbox(17, 12, 1, frame, { y: 4 }, 0.5))
  f.add(rbox(15, 10, 0.4, board, { y: 5, z: 0.4 }, 0.15))
  for (const s of [-1, 1]) f.add(noOutline(ball(1.1, chalk, { x: s * 0.75 + 2.5, y: 11, z: 0.65 }, [1, 1, 0.15])))
  f.add(noOutline(rbox(1.6, 1.6, 0.2, chalk, { x: 2.5, y: 9.1, z: 0.65, rz: Math.PI / 4 }, 0.05)))
  for (let i = 0; i < 3; i++) f.add(noOutline(rbox(6 - i * 1.2, 0.3, 0.2, C.white, { x: -3.2, y: 12 - i * 1.6, z: 0.65 }, 0.05)))
  f.add(rbox(15, 0.8, 1.6, frame, { y: 3.6, z: 0.9 }, 0.3))
  f.add(cylX(0.3, 2.2, C.white, -3, 4.7, 1, 8))
  g.add(P(f, 0, 0, 4, -0.2))
  const ty = 19 * Math.cos(0.2)
  const tz = 4 - 19 * Math.sin(0.2) - 1.3
  g.add(rodZ(-4.5, 0, tz, ty - 0.6, 0.45, frame))
  return g
}

/** 魔方：[芯, 6 种贴纸色] */
function rubiksCube(p: string[]) {
  const [core, ...cols] = p
  const r = rng(3)
  const g = new THREE.Group()
  const s = 5.7
  const h = s / 2
  g.add(rbox(s, s, s, core, { y: 0 }, 0.4))
  const off = [-1.85, 0, 1.85]
  const pick = (f: number) => (r() < 0.6 ? cols[f % cols.length] : cols[Math.floor(r() * cols.length)])
  for (const a of off)
    for (const b of off) {
      g.add(rbox(1.6, 0.3, 1.6, pick(0), { x: a, y: s - 0.1, z: b }, 0.25))
      g.add(rbox(1.6, 1.6, 0.3, pick(1), { x: a, y: h + b - 0.8, z: h + 0.05 }, 0.25))
      g.add(rbox(1.6, 1.6, 0.3, pick(2), { x: a, y: h + b - 0.8, z: -h - 0.05 }, 0.25))
      g.add(rbox(0.3, 1.6, 1.6, pick(3), { x: h + 0.05, y: h + b - 0.8, z: a }, 0.25))
      g.add(rbox(0.3, 1.6, 1.6, pick(4), { x: -h - 0.05, y: h + b - 0.8, z: a }, 0.25))
    }
  g.rotation.y = 0.35
  return g
}

/** 地球仪：[海洋, 陆地, 金属] */
function globe(p: string[]) {
  const [sea, land, metal] = p
  const g = new THREE.Group()
  const R0 = 11
  const tilt = 0.4
  const earth = new THREE.Group()
  earth.add(ball(R0, sea))
  const r = rng(9)
  for (let i = 0; i < 9; i++) {
    const lat = (r() - 0.5) * 2.2
    const lon = r() * Math.PI * 2
    const v = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(R0 + 0.05)
    const m = noOutline(ball(2.6 + r() * 1.6, land, {}, [1, 0.8, 0.18]))
    m.position.copy(v)
    m.lookAt(0, 0, 0)
    earth.add(m)
  }
  earth.add(P(torus(R0 + 1.3, 0.45, metal, {}, Math.PI), 0, 0, 0, 0, 0, Math.PI / 2))
  earth.add(ball(0.8, metal, { y: R0 + 1.3 }))
  const cy = 1.6 + 3 + (R0 + 1.3) * Math.cos(tilt)
  const bx = (R0 + 1.3) * Math.sin(tilt)
  g.add(P(earth, 0, cy, 0, 0, 0, tilt))
  g.add(puck(6.5, 1.6, metal, { x: bx }))
  g.add(cyl(1, 1.4, 3.4, metal, { x: bx, y: 1.4 }, 12))
  return g
}

/** 沙漏：[木框, 沙, -]。玻璃是一整个连续的旋转体（两个泡 + 细颈），上泡的沙落在泡底、下泡堆成小丘，中间一缕细沙 */
const HG = { y0: 1.4, y1: 14.6, neck: 0.35, bulb: 3.4, cap: 2.6 }
/** 玻璃内壁半径：y 为离地高度 */
function hgRadius(y: number) {
  const mid = (HG.y0 + HG.y1) / 2
  const u = Math.min(1, Math.abs(y - mid) / ((HG.y1 - HG.y0) / 2))
  // 细颈附近迅速鼓起（开方让泡身更圆），靠近盖子处圆滑收口
  if (u < 0.6) return HG.neck + (HG.bulb - HG.neck) * Math.sqrt(Math.sin(((u / 0.6) * Math.PI) / 2))
  return HG.cap + (HG.bulb - HG.cap) * Math.sqrt(Math.cos((((u - 0.6) / 0.4) * Math.PI) / 2))
}
function latheBare(pts: [number, number][], color: string) {
  return new THREE.Mesh(
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    ),
    toon(color),
  )
}
function hourglass(p: string[]) {
  const [wood, sand] = p
  const g = new THREE.Group()
  g.add(puck(5, 1.4, wood))
  g.add(puck(5, 1.4, wood, { y: HG.y1 }))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    g.add(cyl(0.45, 0.45, 13.4, wood, { x: Math.cos(a) * 4.1, y: 1.2, z: Math.sin(a) * 4.1 }, 8))
  }
  const mid = (HG.y0 + HG.y1) / 2
  const steps = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
  // 玻璃：从底盖到顶盖的连续轮廓
  const glass: [number, number][] = steps(HG.y0, HG.y1, 28).map((y) => [hgRadius(y), y])
  g.add(ghostOutlined(noOutline(latheBare([[0, HG.y0], ...glass, [0, HG.y1]], C.glass)), C.glass, 0.3))
  // 上泡的沙：贴着泡底（细颈往上）到平整的沙面，沙面中间微微凹下
  const top = mid + 2.6
  const upper: [number, number][] = steps(mid + 0.1, top, 8).map((y) => [hgRadius(y) * 0.94, y])
  g.add(latheBare([[0, mid + 0.1], ...upper, [hgRadius(top) * 0.5, top - 0.15], [0, top - 0.4]], sand))
  // 下泡的沙堆：铺满泡底、往上隆成小丘
  const base = HG.y0 + 0.1
  const lower: [number, number][] = steps(base, base + 1.4, 4).map((y) => [hgRadius(y) * 0.94, y])
  g.add(latheBare([[0, base], ...lower, [hgRadius(base + 1.4) * 0.55, base + 2.3], [0.5, base + 2.9], [0, base + 3]], sand))
  // 正在落下的一缕沙
  g.add(cyl(0.1, 0.1, mid + 0.1 - (base + 3), sand, { y: base + 3 }, 6))
  return g
}

// ---------- 植物 ----------

/** 多肉（莲座）：[盆, 叶色, 叶尖] */
function succulent(p: string[]) {
  const [pot, leafC, tip] = p
  const g = new THREE.Group()
  g.add(cup(5, 4, 7, 0.8, pot))
  g.add(cyl(4.05, 4.05, 0.5, SOIL, { y: 5.2 }))
  const rings: [number, number, number, string][] = [
    [8, 5, 0.25, tip],
    [6, 4, 0.7, leafC],
    [5, 2.8, 1.15, shade(leafC, 0.08)],
  ]
  for (const [ri, [n, len, pitch, col]] of rings.entries())
    for (let i = 0; i < n; i++) g.add(petal(len, col, 0, 6 + ri * 0.5, 0, (i / n) * Math.PI * 2 + ri * 0.4, pitch, 0.5, 0.32))
  g.add(ball(0.9, shade(leafC, 0.1), { y: 7.6 }))
  return g
}

/** 空气凤梨（贝壳托）：[托, 叶色, 花] */
function airPlant(p: string[]) {
  const [holder, leafC, flower] = p
  const g = new THREE.Group()
  g.add(cup(4.6, 3, 2.6, 0.5, holder))
  for (let i = 0; i < 6; i++) g.add(ball(0.7, C.white, { x: Math.cos(i) * 2, y: 1.2, z: Math.sin(i) * 2 }))
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    g.add(petal(6 + (i % 3) * 1.4, i % 2 ? leafC : shade(leafC, 0.08), 0, 1.8, 0, a, 0.5 + (i % 4) * 0.22, 0.18, 0.12))
  }
  g.add(capsule(0.5, 3, flower, { y: 2.4 }))
  return g
}

/** 小仙人掌：[盆, 花, -] */
function miniCactus(p: string[]) {
  const [pot, flower] = p
  const g = new THREE.Group()
  g.add(cup(4, 3.3, 5.5, 0.6, pot))
  g.add(cyl(3.4, 3.4, 0.5, SOIL, { y: 4.1 }))
  g.add(capsule(2.4, 3.6, C.leaf, { y: 3.6 }))
  g.add(capsule(1.1, 1.4, C.leaf, { x: 2.6, y: 6.4, rz: -0.5 }))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.add(petal(1.6, flower, 0, 12.1, 0, a, 0.5, 0.6, 0.3))
  }
  g.add(ball(0.5, C.lemon, { y: 12.4 }))
  for (let i = 0; i < 6; i++) g.add(noOutline(ball(0.18, C.white, { x: Math.cos(i * 1.3) * 2.42, y: 5 + (i % 3) * 1.6, z: Math.sin(i * 1.3) * 2.42 })))
  return g
}

/** 盆景：[浅盆, 叶团, 树干] */
function bonsai(p: string[]) {
  const [pot, foliage, trunk] = p
  const g = new THREE.Group()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(2, 0.8, 1.6, shade(pot, -0.1), { x: sx * 9, z: sz * 4.5 }, 0.3))
  g.add(tray(24, 4.5, 14, 1, pot, { y: 0.6 }))
  g.add(rbox(22, 0.6, 12, SOIL, { y: 3.4 }, 0.2))
  for (const [x, z] of [
    [-6, 3],
    [5, -3],
    [-2, -4],
  ])
    g.add(ball(1.6, C.leafD, { x, y: 4, z }, [1.4, 0.4, 1]))
  const pts: [number, number][] = [
    [0, 3.8],
    [-2, 8],
    [1.5, 12],
    [4.2, 15.5],
  ]
  for (let i = 0; i < pts.length - 1; i++) {
    g.add(rod(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.3 - i * 0.25, trunk))
    g.add(ball(1.3 - i * 0.25, trunk, { x: pts[i + 1][0], y: pts[i + 1][1] }))
  }
  g.add(rod(-1, 10, -5, 13, 0.6, trunk))
  g.add(ball(4.5, foliage, { x: 4.5, y: 16.8 }, [1.3, 0.55, 1]))
  g.add(ball(3.6, shade(foliage, 0.06), { x: -5, y: 13.8, z: 1 }, [1.3, 0.55, 1]))
  g.add(ball(3, shade(foliage, -0.05), { x: 0.5, y: 19.6, z: -1 }, [1.3, 0.6, 1]))
  return g
}

// ---------- 灯 ----------

/** 可弯折台灯：[灯臂, 关节, -] */
function deskLamp(p: string[]) {
  const [main, joint] = p
  const arm = new THREE.Group()
  arm.add(puck(6.5, 2.4, main, { x: -6 }))
  arm.add(ball(1.6, joint, { x: -6, y: 3 }))
  arm.add(rod(-6, 3, -1, 23, 0.8, main))
  arm.add(ball(1.6, joint, { x: -1, y: 23 }))
  arm.add(rod(-1, 23, 9, 28, 0.8, main))
  arm.add(ball(1.4, joint, { x: 9, y: 28 }))
  arm.add(P(cyl(2, 5.5, 7, main, {}, 20), 11, 25, 0, 0, 0, 0.35))
  arm.add(litOutlined(ball(2.2, C.lamp, { x: 12, y: 22.4 }), C.lamp, 0.9))
  const inner = new THREE.Group()
  inner.add(P(arm, -2.5))
  inner.rotation.y = -Math.PI / 2
  return inner
}

/** 床头台灯：[灯罩, 灯座, 饰边] */
function tableLamp(p: string[]) {
  const [shadeC, base, trim] = p
  const g = new THREE.Group()
  g.add(puck(5.5, 1.6, base))
  g.add(ball(5, base, { y: 6 }, [1, 0.95, 1]))
  g.add(cyl(0.7, 0.7, 8, shade(base, -0.15), { y: 10 }, 8))
  g.add(litOutlined(cyl(6.5, 10, 12, shadeC, { y: 16 }), shadeC, 0.5))
  g.add(P(torus(10, 0.5, trim), 0, 16.3, 0, Math.PI / 2))
  g.add(P(torus(6.5, 0.4, trim), 0, 27.8, 0, Math.PI / 2))
  return g
}

/** 工业风爱迪生灯泡台灯：[底座木, 水管, -] */
function edisonLamp(p: string[]) {
  const [wood, pipe] = p
  const g = new THREE.Group()
  g.add(rbox(14, 3, 11, wood, {}, 0.8))
  g.add(puck(1.9, 0.8, pipe, { x: -4, y: 2.8 }))
  g.add(cyl(0.9, 0.9, 22, pipe, { x: -4, y: 3 }, 12))
  for (const x of [-4, 4]) g.add(ball(1.25, pipe, { x, y: 25 }))
  g.add(cylX(0.9, 8, pipe, 0, 25, 0, 12))
  g.add(cyl(1.4, 1.4, 3, shade(pipe, 0.1), { x: 4, y: 21.6 }, 14))
  g.add(litOutlined(torus(1.1, 0.16, '#ffb347', { x: 4, y: 18.4 }), '#ffb347', 1))
  g.add(cyl(0.12, 0.12, 3, '#c9a46a', { x: 4, y: 18.4 }, 6))
  g.add(ghostOutlined(ball(3.4, '#fff4d6', { x: 4, y: 18.2 }, [1, 1.25, 1]), '#fff4d6', 0.4))
  g.add(cylZ(0.8, 1, M.silver, 4, 1.6, 5.7, 12))
  return g
}

/** 蘑菇灯：[灯罩, 灯身, -] */
function mushroomLamp(p: string[]) {
  const [capC, stem] = p
  const g = new THREE.Group()
  g.add(puck(6, 1.5, stem))
  g.add(cyl(1.6, 2.4, 14, stem, { y: 1.4 }, 20))
  g.add(litOutlined(dome(10, capC, 0, 15.5, 0, 0.75), capC, 0.35))
  g.add(litOutlined(cyl(9.9, 9.9, 0.5, C.lamp, { y: 15.2 }, 32), C.lamp, 0.8))
  return g
}

/** 和纸灯：[和纸, 木框, -] */
function washiLamp(p: string[]) {
  const [paper, wood] = p
  const g = new THREE.Group()
  g.add(puck(7.6, 2, wood))
  g.add(litOutlined(cyl(6.8, 6.8, 22, paper, { y: 2 }, 24), paper, 0.45))
  for (const y of [2.6, 23.4]) g.add(P(torus(7, 0.45, wood), 0, y, 0, Math.PI / 2))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cyl(0.4, 0.4, 21, wood, { x: Math.cos(a) * 7, y: 2.4, z: Math.sin(a) * 7 }, 8))
  }
  g.add(puck(3, 1.2, wood, { y: 23.8 }))
  return g
}

/** 玻璃球台灯：[灯球, 底座, 饰环] */
function globeLamp(p: string[]) {
  const [light, base, ring] = p
  const g = new THREE.Group()
  g.add(cyl(5, 6, 6, base, {}, 24))
  g.add(P(torus(5.1, 0.4, ring), 0, 5.6, 0, Math.PI / 2))
  g.add(litOutlined(ball(9, light, { y: 14.4 }), light, 0.45))
  return g
}

/** 三支蜡烛：x, z, 半径, 高（蜡烛底面在托盘上 y = 1） */
const CANDLES: [number, number, number, number][] = [
  [-3.4, -1.2, 2.4, 10],
  [3.2, -1.8, 2.2, 7],
  [0, 3.4, 2, 5],
]

/** 三支蜡烛 + 托盘：[蜡, 托盘, -]。只留很小的发光火芯，火苗交给 fx */
function candles(p: string[]) {
  const [wax, dish] = p
  const g = new THREE.Group()
  g.add(puck(8, 1.2, dish))
  for (const [x, z, r, h] of CANDLES) {
    g.add(cyl(r, r, h, wax, { x, y: 1, z }, 20))
    g.add(ball(0.5, shade(wax, -0.04), { x: x + r * 0.8, y: 1 + h - 1, z: z + r * 0.5 }, [0.8, 1.6, 0.8]))
    g.add(rbox(0.2, 0.9, 0.2, C.ink, { x, y: 1 + h - 0.1, z }, 0.05))
    g.add(noOutline(litOutlined(ball(0.3, '#ffcf5a', { x, y: 1 + h + 1.2, z }, [1, 1.7, 1]), '#ffcf5a', 0.95)))
  }
  return g
}
const CANDLE_FX: Fx[] = CANDLES.map(([x, z, , h]) => ({ kind: 'flame', x, y: 1 + h + 0.9, z, scale: 0.5 }))

/** 香薰机：[瓷身, 木座, 灯环]，喷口在 y = 15.2 */
function aromaDiffuser(p: string[]) {
  const [body, base, light] = p
  const g = new THREE.Group()
  g.add(cyl(5.5, 6, 3, base, {}, 28))
  g.add(litOutlined(P(torus(5.4, 0.35, light), 0, 3.1, 0, Math.PI / 2), light, 0.8))
  g.add(ball(5.6, body, { y: 6.4 }, [1, 1.15, 1]))
  g.add(cyl(0.6, 2.6, 4, body, { y: 11 }, 20))
  g.add(cyl(0.7, 0.7, 0.3, M.char, { y: 14.9 }, 12))
  return g
}

/** 迷你加湿器：[机身, 盖, 指示灯]，喷口在 y = 14.7 */
function miniHumidifier(p: string[]) {
  const [body, cap, light] = p
  const g = new THREE.Group()
  g.add(cyl(4.2, 4.6, 12, body, {}, 28))
  g.add(litOutlined(P(torus(4.5, 0.3, light), 0, 2.6, 0, Math.PI / 2), light, 0.8))
  g.add(puck(4.3, 2, cap, { y: 11.6 }))
  g.add(cyl(1, 1.3, 1.4, shade(cap, -0.1), { y: 13.3 }, 16))
  return g
}

/** 桌面小风扇：[机身, 扇叶, 点缀] */
function deskFan(p: string[]) {
  const [body, blade, acc] = p
  const g = new THREE.Group()
  const cy = 16
  const fz = 1.5
  g.add(puck(6, 2, body, { z: -1 }))
  g.add(cyl(1, 1, 10, body, { y: 2, z: -1.5 }, 12))
  g.add(cyl(0.8, 0.8, 3, body, { y: 11.5, z: -1.5 }, 12))
  g.add(ball(2.4, body, { y: cy, z: -1.2 }))
  const rotor = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const pv = new THREE.Group()
    pv.add(ball(1.6, blade, { y: 3 }, [1, 1.7, 0.18]))
    pv.rotation.z = (i / 4) * Math.PI * 2 + 0.3
    rotor.add(pv)
  }
  rotor.add(ball(1.2, acc, { z: 0.1 }))
  g.add(P(rotor, 0, cy, fz))
  for (const dz of [-1.2, 1.2]) g.add(P(torus(6.3, 0.35, body), 0, cy, fz + dz))
  for (let i = 0; i < 6; i++) g.add(P(rbox(0.3, 12.6, 0.3, body, {}, 0.1), 0, cy, fz + 1.3, 0, 0, (i / 6) * Math.PI))
  g.add(cylZ(1, 0.4, acc, 0, cy, fz + 1.5))
  return g
}

// ---------- 小装饰 ----------

/** 竖 / 横相框：[框, 照片底, 画面] */
function photoFrame(fw: number, fh: number) {
  return (p: string[]) => {
    const [frame, photo, pic] = p
    const g = new THREE.Group()
    const f = new THREE.Group()
    f.add(rbox(fw, fh, 1.4, frame, {}, 0.5))
    f.add(rbox(fw - 2.4, fh - 2.4, 0.3, C.white, { y: 1.2, z: 0.75 }, 0.1))
    // 照片画在贴图上，内容天然裁在照片范围内
    f.add(paintPanel(fw - 5, fh - 5, `photo-${photo}-${pic}`, paintLandscape(photo, pic, C.lemon), { y: 2.5, z: 0.95 }))
    const zf = fh * 0.12
    g.add(P(f, 0, 0, zf, -0.15))
    const hy = fh * 0.62
    g.add(strutZ(zf - fh * 0.42, 0, zf - hy * Math.sin(0.15) - 0.75, hy * Math.cos(0.15), fw * 0.28, 0.6, shade(frame, -0.08)))
    return g
  }
}

/** 手办：[发色, 衣服, 点缀] */
function animeFigure(p: string[]) {
  const [hair, dress, acc] = p
  const g = new THREE.Group()
  g.add(puck(4.5, 1, acc))
  for (const s of [-1, 1]) {
    g.add(capsule(0.55, 2.2, SKIN, { x: s * 0.9, y: 1 }))
    g.add(ball(0.75, C.ink, { x: s * 0.9, y: 1.5, z: 0.3 }, [1, 0.8, 1.4]))
    g.add(capsule(0.5, 2.4, SKIN, { x: s * 2, y: 6.2, rz: s * 0.35 }))
  }
  g.add(cyl(1.4, 3.2, 4.5, dress, { y: 3.6 }))
  g.add(P(torus(3.15, 0.3, acc), 0, 3.75, 0, Math.PI / 2))
  g.add(capsule(1.3, 1.2, dress, { y: 6.8 }))
  g.add(ball(3.3, SKIN, { y: 13.4 }))
  g.add(ball(3.55, hair, { y: 13.9, z: -0.45 }))
  for (const s of [-1, 1]) {
    g.add(capsule(1.1, 3, hair, { x: s * 3.8, y: 9.4, z: -0.8, rz: s * 0.25 }))
    g.add(ball(0.7, acc, { x: s * 3.3, y: 14.6, z: -0.8 }))
  }
  g.add(ball(1, acc, { x: 1.6, y: 16.8, z: 0.6 }, [1.4, 0.8, 0.6]))
  g.add(face(3.4, { y: 12.9, z: 3.15 }))
  return g
}

/** 扭蛋机：[机身, 顶盖, 旋钮] */
function gacha(p: string[]) {
  const [body, top, knob] = p
  const g = new THREE.Group()
  // 机身空心，正面下方真开出货口，里面躺着一颗扭蛋
  g.add(shell(10, 9, 10, 0.6, body, { front: [{ kind: 'rect', x: 0, y: 0.9, w: 4, h: 2.4, r: 0.4 }] }))
  g.add(ball(0.9, C.pink, { x: 0.4, y: 1.5, z: 3.2 }))
  g.add(rbox(6.4, 4.4, 0.4, shade(body, 0.1), { y: 4.2, z: 5.2 }, 0.2))
  g.add(cylZ(1.7, 1.2, knob, 0, 6.4, 5.7))
  g.add(rbox(2.8, 0.6, 0.6, shade(knob, -0.15), { y: 6.1, z: 6.5 }, 0.2))
  g.add(P(torus(3.4, 0.6, top), 0, 9, 0, Math.PI / 2))
  const r = rng(4)
  const cols = [C.pink, C.sky, C.lemon, C.mint, C.lilac, C.peach]
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2
    const d = r() * 2.6
    g.add(ball(1.3, cols[i % cols.length], { x: Math.cos(a) * d, y: 10.6 + (i % 3) * 1.8 + r() * 0.5, z: Math.sin(a) * d }))
  }
  g.add(ghostOutlined(ball(5.2, C.glass, { y: 13.2 }), C.glass))
  g.add(puck(2.2, 1.4, top, { y: 18 }))
  return g
}

/** 招财猫：[身体, 项圈, 金币] */
function manekiNeko(p: string[]) {
  const [body, collar, coin] = p
  const g = new THREE.Group()
  g.add(ball(4.5, body, { y: 4.5 }, [1, 1, 0.9]))
  g.add(ball(4.2, body, { y: 11.5 }))
  for (const s of [-1, 1]) {
    g.add(cyl(0.1, 1.8, 2.6, body, { x: s * 2.6, y: 14.2, rz: -s * 0.35 }, 10))
    g.add(noOutline(cyl(0.05, 1, 1.4, '#ffb6c8', { x: s * 2.55, y: 14.6, z: 0.6, rz: -s * 0.35 }, 10)))
  }
  g.add(capsule(1.2, 2.6, body, { x: 3.9, y: 7.4, rz: -0.25 }))
  g.add(ball(1.4, body, { x: 4.9, y: 12.4 }))
  g.add(ball(2.2, coin, { x: -1.5, y: 4.6, z: 3.8 }, [0.8, 1.2, 0.25]))
  g.add(ball(1.1, body, { x: -1.2, y: 3, z: 3.6 }, [1, 0.8, 0.9]))
  g.add(P(torus(3.2, 0.5, collar), 0, 8.3, 0, Math.PI / 2))
  g.add(ball(0.8, coin, { y: 7.5, z: 3.2 }))
  g.add(face(4, { y: 11.2, z: 3.95 }))
  return g
}

/** 达摩：[身体, 脸, 金纹] */
function daruma(p: string[]) {
  const [body, faceC, gold] = p
  const g = new THREE.Group()
  g.add(ball(6, body, { y: 6.3 }, [1, 1.05, 0.95]))
  g.add(ball(3.6, faceC, { y: 7.6, z: 4.1 }, [1, 0.9, 0.5]))
  g.add(face(3, { y: 7.6, z: 5.85 }))
  g.add(rbox(2.6, 1.6, 0.4, gold, { y: 2.9, z: 5.25 }, 0.2))
  for (const s of [-1, 1]) g.add(ball(1, gold, { x: s * 4, y: 4, z: 3.4 }, [1, 1, 0.4]))
  return g
}

/** 线香 + 香插：[香插, 香, -]，香头在 (1.6, 8.7)，烟交给 fx */
function incense(p: string[]) {
  const [dish, stick] = p
  const g = new THREE.Group()
  g.add(rbox(13, 1, 4.5, dish, {}, 0.5))
  g.add(ball(0.8, shade(dish, -0.12), { x: -5, y: 1.1 }))
  g.add(rod(-5, 1.2, 1.5, 8.6, 0.12, stick))
  g.add(noOutline(litOutlined(ball(0.22, '#ff7a45', { x: 1.6, y: 8.7 }), '#ff7a45', 1)))
  for (let i = 0; i < 3; i++) g.add(noOutline(ball(0.25, '#b8b0a8', { x: -1 + i * 1.6, y: 1, z: 0.6 - i * 0.3 }, [1, 0.5, 1])))
  return g
}

// ---------- 定义 ----------

const GADGET: Pal[] = [
  ['cute', [C.white, C.sky, C.pink]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['nordic', [N.white, N.gray, N.sage]],
  ['modern', [M.char, M.black, M.silver]],
  ['modern', [M.white, M.light, M.gray]],
]

const BOOKS: Pal[] = [
  ['cute', [C.pink, C.sky, C.lemon]],
  ['cute', [C.mint, C.lilac, C.peach]],
  ['nordic', [N.blue, N.sage, N.mustard]],
  ['modern', [M.char, M.light, M.walnut]],
  ['japanese', [J.ai, J.shu, J.washi]],
  ['retro', [R.teal, R.mustard, R.red]],
]

const POTS: Pal[] = [
  ['cute', [C.sakura, C.mint, C.pink]],
  ['cute', [C.sky, C.leaf, C.lemon]],
  ['nordic', [N.white, N.sage, N.linen]],
  ['modern', [M.char, '#8fbf96', M.light]],
  ['industrial', [I.concrete, '#8fbf96', I.rust]],
  ['japanese', [J.washi, '#8fbf96', J.shu]],
]

const LAMP_SHADES: Pal[] = [
  ['cute', [C.lamp, C.white, C.pink]],
  ['cute', [C.sakura, C.white, C.lemon]],
  ['cute', [C.mint, C.cream, C.sky]],
  ['nordic', [N.linen, N.oak, N.white]],
  ['japanese', [J.washi, J.wood, J.sumi]],
  ['modern', [M.white, M.char, M.silver]],
]

export const PROPS_DESK: AssetDef[] = [
  // 数码
  def('prop-laptop', '笔记本电脑', 'tabletop', [34, 29, 24], [
    ['cute', [C.steel, C.ink, C.pink]],
    ['cute', [C.sakura, '#d9a7b4', C.sky]],
    ['nordic', [N.white, N.gray, N.sage]],
    ['modern', [M.silver, M.char, M.white]],
    ['modern', [M.char, M.black, M.gray]],
  ], laptop),
  def('prop-monitor', '显示器', 'tabletop', [54, 18, 43], [
    ['cute', [C.white, C.white, C.pink]],
    ['cute', [C.sakura, C.white, C.sky]],
    ['nordic', [N.white, N.oak, N.sage]],
    ['modern', [M.black, M.silver, M.gray]],
  ], monitor(54, 33, 22, 16), { family: 'monitor', sizeLabel: '24 寸', ...screensOf([{ x: 0, y: 10, z: -2.2, w: 54, h: 33, t: 2 }]) }),
  def('prop-monitor-27', '显示器', 'tabletop', [62, 20, 48], [
    ['cute', [C.white, C.white, C.pink]],
    ['cute', [C.sakura, C.white, C.sky]],
    ['nordic', [N.white, N.oak, N.sage]],
    ['modern', [M.black, M.silver, M.gray]],
  ], monitor(62, 38, 25, 18), { family: 'monitor', sizeLabel: '27 寸', ...screensOf([{ x: 0, y: 10, z: -2.2, w: 62, h: 38, t: 2 }]) }),
  def('prop-monitor-dual', '双屏显示器', 'tabletop', [110, 24, 47], [
    ['cute', [C.white, C.white, C.pink]],
    ['nordic', [N.white, N.gray, N.sage]],
    ['modern', [M.black, M.char, M.gray]],
    ['industrial', [I.iron, I.steel, I.rust]],
  ], dualMonitor, screensOf([-1, 1].map((s) => ({ x: s * 27.6, y: 14, z: 3.91, w: 55, h: 33, t: 2, ry: s * -0.25 })))),
  def('prop-keyboard-mouse', '键盘鼠标', 'tabletop', [54, 16, 4], [
    ['cute', [C.white, C.sakura, C.pink]],
    ['cute', [C.white, C.sky, C.lemon]],
    ['nordic', [N.white, N.linen, N.sage]],
    ['modern', [M.char, M.black, M.gray]],
    ['retro', [R.cream, '#e6d6b0', R.orange]],
  ], keyboardMouse),
  def('prop-tv-43', '平板电视', 'tabletop', [97, 22, 64], [
    ['modern', [M.black, M.char, '#ff6b6b']],
    ['cute', [C.white, C.white, C.pink]],
    ['nordic', [N.white, N.oak, N.sage]],
  ], tv(97, 57, 34, 22), { family: 'tv', sizeLabel: '43 寸', styles: ['modern', 'cute', 'nordic', 'industrial'], ...screensOf([{ x: 0, y: 7, z: 0, w: 97, h: 57, t: 2.4 }]) }),
  def('prop-tv-55', '平板电视', 'tabletop', [123, 26, 78], [
    ['modern', [M.black, M.char, '#ff6b6b']],
    ['cute', [C.white, C.white, C.pink]],
    ['nordic', [N.white, N.oak, N.sage]],
  ], tv(123, 71, 42, 26), { family: 'tv', sizeLabel: '55 寸', styles: ['modern', 'cute', 'nordic', 'industrial'], ...screensOf([{ x: 0, y: 7, z: 0, w: 123, h: 71, t: 2.4 }]) }),
  def('prop-game-console', '游戏机', 'tabletop', [36, 16, 12], [
    ['cute', [C.white, C.sky, C.pink]],
    ['cute', [C.sakura, C.mint, C.lemon]],
    ['modern', [M.char, M.gray, M.silver]],
    ['retro', [R.cream, R.red, R.teal]],
  ], gameConsole),
  def('prop-tablet-stand', '平板支架', 'tabletop', [25, 11, 18], GADGET.map(([s, [a, b, c]]): Pal => [s, [b, a, c]]), deviceStand(24.5, 17.5, 0.7, 0.35, 14, 11)),
  def('prop-phone-stand', '手机支架', 'tabletop', [8, 8, 15], GADGET.map(([s, [a, b, c]]): Pal => [s, [b, a, c]]), deviceStand(7.2, 15, 0.8, 0.3, 8, 8)),
  def('prop-desk-speakers', '桌面音箱', 'tabletop', [44, 12, 16], [
    ['cute', [C.white, C.ink, C.pink]],
    ['nordic', [N.oak, M.char, N.white]],
    ['modern', [M.black, M.char, M.silver]],
    ['retro', [R.caramel, '#3a3330', R.cream]],
  ], deskSpeakers),
  def('prop-headphone-stand', '耳机架', 'tabletop', [18, 12, 26], [
    ['cute', [C.white, C.pink, C.sakura]],
    ['cute', [C.woodL, C.sky, C.white]],
    ['nordic', [N.oak, N.white, N.gray]],
    ['modern', [M.silver, M.black, M.char]],
    ['industrial', [I.walnut, I.iron, I.leather]],
  ], headphoneStand),
  def('prop-digital-clock', '电子钟', 'tabletop', [15, 5, 7], [
    ['cute', [C.sakura, '#ff8fa8']],
    ['nordic', [N.oak, '#ffd27a']],
    ['modern', [M.black, '#ff5a4f']],
    ['modern', [M.white, '#4fc3ff']],
  ], digitalClock),
  def('prop-digital-frame', '数码相框', 'tabletop', [22, 8, 16], [
    ['cute', [C.white, C.white, C.pink]],
    ['nordic', [N.oak, N.white, N.sage]],
    ['modern', [M.black, M.black, M.silver]],
  ], digitalFrame),
  def('prop-crt-tv', '复古小电视', 'tabletop', [30, 26, 43], [
    ['retro', [R.cream, '#4a4040', R.orange]],
    ['retro', [R.teal, '#3a3330', R.cream]],
    ['retro', [R.orange, '#3a3330', R.cream]],
    ['cute', [C.sakura, C.ink, C.mint]],
  ], crtTv),
  def('prop-radio', '复古收音机', 'tabletop', [27, 10, 28], [
    ['retro', [R.teal, R.cream, R.caramel]],
    ['retro', [R.red, R.cream, R.caramel]],
    ['retro', [R.mustard, '#5a4646', R.cream]],
    ['cute', [C.mint, C.white, C.pink]],
  ], radio),
  def('prop-turntable', '唱片机', 'tabletop', [40, 32, 13], [
    ['retro', [R.caramel, M.silver, R.orange]],
    ['nordic', [N.oak, N.white, N.blue]],
    ['modern', [M.black, M.silver, R.orange]],
    ['cute', [C.sakura, C.white, C.lemon]],
  ], turntable),
  def('prop-rotary-phone', '拨盘电话', 'tabletop', [21, 22, 14], [
    ['retro', [R.red, R.cream, R.cream]],
    ['retro', [R.olive, R.cream, R.mustard]],
    ['modern', [M.black, M.silver, M.white]],
    ['cute', [C.pink, C.white, C.lemon]],
  ], rotaryPhone),
  def('prop-typewriter', '打字机', 'tabletop', [40, 24, 30], [
    ['retro', [R.teal, R.cream, R.caramel]],
    ['retro', [R.mustard, R.cream, M.char]],
    ['modern', [M.char, M.white, M.silver]],
    ['cute', [C.mint, C.white, C.pink]],
  ], typewriter),

  // 书
  def('prop-book-stack', '一叠书', 'tabletop', [24, 18, 13], BOOKS, bookStack, { family: 'prop-book-stack', sizeLabel: '标准' }),
  def('prop-books-upright', '书立和书', 'tabletop', [28, 17, 22], BOOKS, booksUpright),
  def('prop-book-open', '摊开的书', 'tabletop', [30, 24, 3], BOOKS, openBook),

  // 文具
  def('prop-pen-cup', '笔筒', 'tabletop', [9, 9, 17], [
    ['cute', [C.sakura, C.sky, C.pink]],
    ['cute', [C.mint, C.lilac, C.peach]],
    ['nordic', [N.oak, N.blue, N.mustard]],
    ['modern', [M.char, M.black, M.silver]],
    ['industrial', [I.steel, I.iron, I.rust]],
  ], penCup),
  def('prop-sticky-notes', '便签纸', 'tabletop', [15, 12, 4], [
    ['cute', [C.lemon, C.pink, C.sky]],
    ['cute', [C.mint, C.lilac, C.peach]],
    ['nordic', [N.linen, N.sage, N.mustard]],
    ['retro', [R.mustard, R.orange, R.cream]],
  ], stickyNotes),
  def('prop-file-sorter', '文件架', 'tabletop', [26, 20, 21], [
    ['cute', [C.white, C.pink, C.sky]],
    ['nordic', [N.oak, N.blue, N.sage]],
    ['modern', [M.char, M.light, M.gray]],
    ['industrial', [I.iron, I.leather, I.concrete]],
  ], fileSorter),
  def('prop-stapler', '订书机', 'tabletop', [5, 16, 4], [
    ['cute', [C.pink, C.white]],
    ['cute', [C.sky, C.white]],
    ['modern', [M.black, M.char]],
    ['retro', [R.red, M.char]],
  ], stapler),
  def('prop-tape-dispenser', '胶带座', 'tabletop', [7, 12, 9], [
    ['cute', [C.mint, C.lemon]],
    ['cute', [C.sakura, C.sky]],
    ['modern', [M.char, M.white]],
    ['retro', [R.teal, R.cream]],
  ], tapeDispenser),
  def('prop-desk-calendar', '台历', 'tabletop', [16, 7, 11], [
    ['cute', [C.sakura, C.pink, C.red]],
    ['cute', [C.sky, C.mint, C.pink]],
    ['nordic', [N.oak, N.sage, N.mustard]],
    ['modern', [M.char, M.black, '#e5534b']],
    ['japanese', [J.hinoki, J.ai, J.shu]],
  ], deskCalendar),
  def('prop-mini-blackboard', '小黑板', 'tabletop', [18, 10, 18], [
    ['cute', [C.woodL, '#5e7f6e', C.pink]],
    ['nordic', [N.oak, '#4f5b5e', N.mustard]],
    ['industrial', [I.walnut, I.iron, C.white]],
    ['retro', [R.caramel, '#3f5f4a', R.mustard]],
  ], miniBlackboard),
  def('prop-rubiks-cube', '魔方', 'tabletop', [7, 7, 6], [
    ['cute', [C.white, C.pink, C.peach, C.lemon, C.mint, C.sky, C.lilac]],
    ['modern', [M.black, '#d94b45', '#f08a3c', '#f2d14b', '#4fae6a', '#3f7fd0', M.white]],
    ['retro', [R.cream, R.red, R.orange, R.mustard, R.olive, R.teal, C.white]],
  ], rubiksCube, { family: 'puzzle-cube', sizeLabel: '三阶 · 打乱' }),
  def('prop-globe', '地球仪', 'tabletop', [25, 22, 28], [
    ['cute', [C.sky, C.mint, C.pink]],
    ['nordic', [N.blue, N.linen, N.oak]],
    ['retro', [R.cream, R.caramel, '#b8863b']],
    ['modern', [M.char, M.light, M.silver]],
  ], globe),
  def('prop-hourglass', '沙漏', 'tabletop', [10, 10, 16], [
    ['cute', [C.woodL, C.pink]],
    ['nordic', [N.oak, '#f2e3c4']],
    ['japanese', [J.dark, '#e9d2a6']],
    ['modern', [M.black, M.light]],
  ], hourglass),
  def('prop-alarm-clock', '打铃闹钟', 'tabletop', [14, 7, 17], [
    ['cute', [C.pink, C.lemon, C.ink]],
    ['cute', [C.mint, C.white, C.ink]],
    ['retro', [R.red, M.silver, M.char]],
    ['retro', [R.mustard, R.caramel, M.char]],
    ['modern', [M.white, M.silver, M.black]],
  ], alarmClock),

  // 植物
  def('prop-succulent', '多肉盆栽', 'tabletop', [10, 10, 10], POTS.map(([s, [pot]]): Pal => [s, [pot, '#9fd4a8', '#e6a9b6']]), succulent),
  def('prop-air-plant', '空气凤梨', 'tabletop', [13, 12, 10], [
    ['cute', [C.sakura, '#a9c9a4', C.pink]],
    ['nordic', [N.white, '#a9c9a4', N.mustard]],
    ['modern', [M.light, '#9bb8a0', M.char]],
    ['industrial', [I.concrete, '#9bb8a0', I.rust]],
  ], airPlant),
  def('prop-mini-cactus', '小仙人掌', 'tabletop', [10, 8, 13], POTS.map(([s, [pot, , acc]]): Pal => [s, [pot, s === 'cute' ? C.pink : acc]]), miniCactus),
  def('prop-bonsai', '盆景', 'tabletop', [24, 14, 22], [
    ['japanese', [J.ai, '#5f9a5a', J.dark]],
    ['japanese', [J.sumi, '#6aa35f', J.dark]],
    ['japanese', [J.washi, '#5f9a5a', J.wood]],
    ['modern', [M.char, '#5f9a5a', M.walnut]],
  ], bonsai),

  // 灯
  def('prop-desk-lamp', '折臂台灯', 'lighting', [14, 30, 31], [
    ['cute', [C.mint, C.white]],
    ['cute', [C.pink, C.white]],
    ['nordic', [N.white, N.oak]],
    ['modern', [M.black, M.silver]],
    ['industrial', [I.iron, I.rust]],
  ], deskLamp, { family: 'desk-lamp', sizeLabel: '折臂' }),
  def('prop-table-lamp', '床头台灯', 'lighting', [21, 21, 29], LAMP_SHADES, tableLamp, { family: 'table-lamp', sizeLabel: '床头' }),
  def('prop-lamp-edison', '爱迪生灯泡台灯', 'lighting', [14, 11, 26], [
    ['industrial', [I.walnut, I.iron]],
    ['industrial', [I.concrete, I.steel]],
    ['retro', [R.caramel, '#7a6a3a']],
    ['modern', [M.walnut, M.black]],
  ], edisonLamp, { family: 'desk-lamp', sizeLabel: '爱迪生灯泡' }),
  def('prop-lamp-mushroom', '蘑菇灯', 'lighting', [20, 20, 23], [
    ['retro', [R.orange, R.cream]],
    ['retro', [R.mustard, R.cream]],
    ['modern', [M.white, M.white]],
    ['cute', [C.sakura, C.white]],
    ['nordic', [N.linen, N.oak]],
  ], mushroomLamp, { family: 'table-lamp', sizeLabel: '蘑菇' }),
  def('prop-lamp-washi', '和纸台灯', 'lighting', [16, 16, 25], [
    ['japanese', [J.washi, J.wood]],
    ['japanese', [J.washi, J.sumi]],
    ['nordic', [N.linen, N.oak]],
  ], washiLamp, { family: 'table-lamp', sizeLabel: '和纸' }),
  def('prop-lamp-globe', '玻璃球台灯', 'lighting', [18, 18, 24], [
    ['modern', [M.white, M.black, M.silver]],
    ['nordic', [N.white, N.oak, N.linen]],
    ['cute', [C.sakura, C.white, C.lemon]],
    ['retro', [R.cream, R.caramel, '#b8863b']],
  ], globeLamp, { family: 'table-lamp', sizeLabel: '玻璃球' }),
  def('prop-candles', '蜡烛', 'tabletop', [16, 16, 14], [
    ['cute', [C.sakura, C.white]],
    ['nordic', [N.white, N.oak]],
    ['modern', [M.light, M.char]],
    ['japanese', [J.washi, J.sumi]],
  ], candles, { fx: CANDLE_FX }),
  def('prop-aroma-diffuser', '香薰机', 'tabletop', [12, 12, 16], [
    ['cute', [C.white, C.woodL, C.pink]],
    ['nordic', [N.white, N.oak, '#ffd27a']],
    ['modern', [M.char, M.walnut, '#9ad7ff']],
    ['japanese', [J.washi, J.dark, WARM]],
  ], aromaDiffuser, { fx: [{ kind: 'mist', x: 0, y: 15.3, z: 0, scale: 0.8 }] }),
  def('prop-mini-humidifier', '迷你加湿器', 'tabletop', [10, 10, 15], [
    ['cute', [C.sky, C.white, '#9ad7ff']],
    ['cute', [C.sakura, C.white, C.pink]],
    ['nordic', [N.white, N.oak, '#9ad7ff']],
    ['modern', [M.white, M.char, '#9ad7ff']],
  ], miniHumidifier, { fx: [{ kind: 'mist', x: 0, y: 14.8, z: 0, scale: 0.7 }] }),
  def('prop-desk-fan', '桌面小风扇', 'tabletop', [14, 12, 23], [
    ['cute', [C.mint, C.white, C.pink]],
    ['cute', [C.sakura, C.white, C.lemon]],
    ['retro', [R.teal, R.cream, R.mustard]],
    ['modern', [M.white, M.light, M.char]],
    ['industrial', [I.iron, I.steel, I.rust]],
  ], deskFan),

  // 小装饰
  def('prop-photo-frame', '相框', 'tabletop', [13, 9, 18], [
    ['cute', [C.sakura, C.sky, C.mint]],
    ['cute', [C.woodL, C.lemon, C.pink]],
    ['nordic', [N.oak, N.blue, N.sage]],
    ['modern', [M.black, M.light, M.gray]],
    ['retro', [R.caramel, R.cream, R.teal]],
  ], photoFrame(13, 18), { family: 'photo-frame', sizeLabel: '竖版' }),
  def('prop-photo-frame-wide', '相框', 'tabletop', [18, 8, 13], [
    ['cute', [C.sakura, C.sky, C.mint]],
    ['cute', [C.woodL, C.lemon, C.pink]],
    ['nordic', [N.oak, N.blue, N.sage]],
    ['modern', [M.black, M.light, M.gray]],
    ['retro', [R.caramel, R.cream, R.teal]],
  ], photoFrame(18, 13), { family: 'photo-frame', sizeLabel: '横版' }),
  def('prop-anime-figure', '手办', 'tabletop', [11, 9, 18], [
    ['cute', ['#ff9fc0', C.white, C.sky]],
    ['cute', ['#a8c8ff', C.lilac, C.pink]],
    ['cute', [C.lemon, C.mint, C.pink]],
    ['retro', ['#6b4a3a', R.red, R.cream]],
  ], animeFigure),
  def('prop-gacha', '扭蛋机', 'tabletop', [10, 12, 20], [
    ['cute', [C.red, C.white, C.lemon]],
    ['cute', [C.sky, C.white, C.pink]],
    ['retro', [R.orange, R.cream, R.teal]],
  ], gacha),
  def('prop-maneki-neko', '招财猫', 'tabletop', [11, 9, 17], [
    ['cute', [C.white, C.red, C.lemon]],
    ['japanese', [J.washi, J.shu, '#e3b549']],
    ['cute', ['#5a4f55', C.pink, C.lemon]],
    ['cute', [C.sakura, C.red, C.lemon]],
  ], manekiNeko),
  def('prop-daruma', '达摩', 'tabletop', [12, 12, 13], [
    ['japanese', ['#e0503e', J.washi, '#e3b549']],
    ['japanese', [J.washi, '#fff8ec', J.shu]],
    ['cute', [C.pink, C.white, C.lemon]],
    ['cute', [C.sky, C.white, C.lemon]],
  ], daruma),
  def('prop-incense', '线香', 'tabletop', [13, 5, 9], [
    ['japanese', [J.sumi, '#7a8a4a']],
    ['japanese', [J.hinoki, '#7a8a4a']],
    ['nordic', [N.white, '#9a7a5a']],
    ['industrial', [I.concrete, '#6a5a4a']],
  ], incense, { fx: [{ kind: 'smoke', x: 1.6, y: 8.9, z: 0, scale: 0.7 }] }),
]
