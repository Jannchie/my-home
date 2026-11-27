// 桌面数码与手作：显示器支臂、笔记本支架、无线充、U 盘小件、对讲机、高达工作台、拼豆、魔尺数独、桌上增高书架、
// 桌面收纳盒、悬臂麦克风、直播控制台、墨水屏相框 + 日出闹钟、标签机、塑封机。约定见 kit.ts 开头。
// 原点在占地中心底面，正面朝 +z。桌面增高书架声明 surface / surfaces；带屏的显示器支臂声明 screens 和顶边夹挂层。

import * as THREE from 'three'
import { ball, box, cup, cyl, plate, puck, rbox, shade, torus, tray } from '../toon'
import { C, clipLevels, drawerBox, drawerLevel, glow, paintPanel, rectPoly, rng, slab, type AssetDef, type ScreenPanel } from '../kit'
import { batten, cylX, cylZ, fitGroup, G, ghost, lit, noOutline, P, PI, rod3, sideSlab, tiltFrame, tube, UP, type V2, type V3 } from '../geo'
import { I, J, M, N, R, define, PROP, type Pal } from '../packkit'

const STEEL = '#c3c7cc'
const DARK = '#2a2b30'
const RUBBER = '#34353a'
const SCREEN = '#bfe3ff'
const PHONE_GLASS = '#26304a'

/**
 * 亮着的屏幕画面：发光底（glow 薄片）+ 几个窗口 / 文字行。底和窗口挂在同一个父节点下，
 * screens.ts 烘屏幕贴图时会把它们合成一张。左右居中在 x，底边在 y0，底片厚度中心在 z。
 */
function screenFace(g: THREE.Object3D, gw: number, gh: number, y0: number, z: number, acc: string, variant = 0, x = 0) {
  g.add(glow(gw, gh, SCREEN, { x, y: y0, z }, 0.5))
  const z1 = z + 0.4
  const z2 = z + 0.65
  if (variant === 0) {
    // 文档窗口 + 标题栏 + 几行字 + 右边一张便签
    g.add(glow(gw * 0.56, gh * 0.68, '#ffffff', { x: x - gw * 0.18, y: y0 + gh * 0.12, z: z1 }, 0.6))
    g.add(glow(gw * 0.56, gh * 0.07, acc, { x: x - gw * 0.18, y: y0 + gh * 0.83, z: z1 }, 0.6))
    for (let i = 0; i < 5; i++) {
      const lw = gw * (0.18 + ((i * 37) % 30) / 100)
      g.add(glow(lw, gh * 0.035, '#9fb8d8', { x: x - gw * 0.42 + lw / 2, y: y0 + gh * (0.68 - i * 0.11), z: z2 }, 0.4))
    }
    g.add(glow(gw * 0.26, gh * 0.4, '#fff3b0', { x: x + gw * 0.3, y: y0 + gh * 0.3, z: z1 }, 0.6))
  } else {
    // 深色代码编辑器：侧栏 + 彩色代码行
    g.add(glow(gw * 0.84, gh * 0.82, '#26303f', { x, y: y0 + gh * 0.08, z: z1 }, 0.4))
    for (let i = 0; i < 6; i++) {
      const lw = gw * (0.14 + ((i * 53) % 36) / 100)
      g.add(glow(lw, gh * 0.04, i % 3 ? '#9be7b5' : acc, { x: x - gw * 0.3 + lw / 2, y: y0 + gh * (0.76 - i * 0.11), z: z2 }, 0.6))
    }
    g.add(glow(gw * 0.12, gh * 0.7, '#3a4658', { x: x - gw * 0.36, y: y0 + gh * 0.13, z: z2 }, 0.4))
  }
}

/** 斜面坐标系（tiltFrame 的 'z' 轴版本）里的一点 (ly, lz) 换回侧视图的世界 [y, z] */
function tiltPt(a: V2, b: V2, ly: number, lz: number): [number, number] {
  const th = -Math.atan2(b[1] - a[1], b[0] - a[0])
  return [a[1] + ly * Math.cos(th) - lz * Math.sin(th), a[0] + ly * Math.sin(th) + lz * Math.cos(th)]
}

// ---------- 显示器支臂：桌夹 + 立柱 + 两节气弹簧臂 + VESA 托盘，托着一块 24 寸薄显示器 ----------

const MA: ScreenPanel = { x: 0, y: 21, z: 20, w: 56, h: 33, t: 2 }
function monitorArm(p: string[]) {
  const [frame, arm, acc] = p
  const g = new THREE.Group()
  const pz = -17.5
  const joint = shade(arm, -0.12)
  // 桌夹：压在桌面上的夹板 + 侧面的拧紧旋钮
  g.add(rbox(9, 2.2, 8, arm, { z: pz }, 0.8))
  g.add(cylX(1.1, 1.6, DARK, 5.2, 1.15, pz, 12))
  // 立柱 + 顶盖 + 卡在立柱上的转座
  g.add(cyl(1.8, 1.8, 30, arm, { y: 2.2, z: pz }, 16))
  g.add(cyl(2.1, 2.1, 1, joint, { y: 32.2, z: pz }, 16))
  g.add(cyl(2.6, 2.6, 4, joint, { y: 25, z: pz }, 16))
  // 第一节：水平往前伸到肘关节
  const ay = 27
  const ez = -3
  g.add(batten([0, ay, pz], [0, ay, ez], 3.6, 3, arm, 0.8))
  g.add(cylX(2.2, 4.4, joint, 0, ay, ez, 16))
  // 第二节：气弹簧臂往前上方抬到云台；下面一根气弹簧（缸 + 活塞杆）
  const hy = MA.y + MA.h / 2 - 1.5
  const hz = MA.z - 3.6
  g.add(batten([0, ay, ez], [0, hy, hz], 3.6, 3, arm, 0.8))
  const L = Math.hypot(hy - ay, hz - ez)
  const dy = (hy - ay) / L
  const dz = (hz - ez) / L
  // 往下的法线方向（离开臂中心 2cm）
  const ny = -dz * 2
  const nz = dy * 2
  const at = (t: number): V3 => [0, ay + (hy - ay) * t + ny, ez + (hz - ez) * t + nz]
  g.add(rod3(at(0.08), at(0.6), 0.8, shade(arm, -0.2), 10))
  g.add(rod3(at(0.55), at(0.9), 0.4, STEEL, 8))
  // 臂上的两只理线夹
  for (const t of [0.3, 0.7]) g.add(noOutline(batten([0, ay + (hy - ay) * t - dz * 1.6, ez + (hz - ez) * t + dy * 1.6], [0, ay + (hy - ay) * (t + 0.06) - dz * 1.6, ez + (hz - ez) * (t + 0.06) + dy * 1.6], 2.6, 0.6, acc, 0.2)))
  // 云台关节 + VESA 托盘
  g.add(cylX(1.6, 3.6, joint, 0, hy, hz, 14))
  g.add(rbox(10, 10, 1.2, arm, { y: hy - 5, z: hz + 2.2 }, 0.5))
  // 显示器：外框 + 背后的凸起 + 亮着的画面
  const s = MA
  g.add(rbox(s.w, s.h, s.t, frame, { y: s.y, z: s.z }, 0.6))
  g.add(rbox(s.w * 0.45, s.h * 0.5, 1, shade(frame, -0.05), { y: s.y + s.h * 0.22, z: s.z - 1.4 }, 0.4))
  const b = 0.6
  const gw = s.w - b * 2
  const gh = s.h - b * 2 - 0.8
  screenFace(g, gw, gh, s.y + b + 0.8, s.z + 1.1, acc, 0)
  return g
}

// ---------- 笔记本支架 + 扩展坞：折叠铝支架斜托着一台打开的笔记本，右边一只小扩展坞连着线 ----------

/** 支架托板在侧视图里的后端、前端 [z, y]（后高前低） */
const LS_A: V2 = [-11, 7]
const LS_B: V2 = [10, 2.6]
function laptopStand(p: string[]) {
  const [body, stand, acc] = p
  const g = new THREE.Group()
  const cx = -3
  const deck = tiltFrame(LS_A, LS_B, 'z')
  const L = deck.len
  // 托板 + 前沿挡条（挡住笔记本不往下滑）
  deck.g.add(rbox(24, 0.6, L, stand, { x: cx, z: L / 2 }, 0.25))
  deck.g.add(rbox(23.6, 1.6, 0.8, stand, { x: cx, z: L - 0.4 }, 0.3))
  // 笔记本底座：键盘区 + 触控板
  const lz = 10.6
  deck.g.add(rbox(28, 1.5, 20, body, { x: cx, y: 0.6, z: lz }, 0.5))
  deck.g.add(rbox(24, 0.3, 8.5, DARK, { x: cx, y: 2, z: lz - 3.6 }, 0.15))
  deck.g.add(rbox(9, 0.3, 5, shade(body, -0.12), { x: cx, y: 2, z: lz + 4.9 }, 0.15))
  // 屏幕：铰链在底座后沿，往后仰；正面亮着
  const lid = new THREE.Group()
  lid.add(rbox(28, 18, 0.8, body, {}, 0.4))
  screenFace(lid, 26, 15.6, 1.4, 0.55, acc, 1)
  lid.add(noOutline(cylZ(1.3, 0.2, acc, 0, 9, -0.45, 16)))
  deck.g.add(P(lid, cx, 1.9, lz - 9.6, -0.5))
  g.add(deck.g)
  // 底下的两条支脚 + 后面两根撑杆 + 前端的转轴
  for (const s of [-1, 1]) {
    const x = cx + s * 10
    g.add(rbox(2, 0.8, 22, stand, { x, z: -0.5 }, 0.3))
    const [ty, tz] = tiltPt(LS_A, LS_B, -0.1, 1.2)
    g.add(batten([x, 0.6, -10.4], [x, ty, tz], 1.8, 1.2, stand, 0.4))
  }
  g.add(cylX(0.95, 22, shade(stand, -0.08), cx, 1.85, 9.2, 12))
  // 扩展坞：小铝盒 + 正面几个口 + 指示灯
  const dx = 14.5
  g.add(rbox(5, 2, 9, stand, { x: dx, z: 2 }, 0.6))
  for (const [x, w] of [
    [-1.2, 1.2],
    [0.6, 0.8],
    [1.7, 0.8],
  ] as [number, number][])
    g.add(noOutline(box(w, 0.5, 0.3, DARK, { x: dx + x, y: 0.8, z: 6.55 })))
  g.add(lit(box(0.5, 0.2, 0.5, '#7dffb0', { x: dx + 1.6, y: 1.95, z: 5.8 }), '#7dffb0', 0.8))
  // 线：从笔记本右侧的口绕出来，插进扩展坞顶上
  const [py, pz] = tiltPt(LS_A, LS_B, 1.35, 12)
  g.add(
    tube(
      [
        [cx + 13.7, py, pz],
        [cx + 15.2, py - 0.3, pz + 0.3],
        [dx - 1.2, 3.2, 0.8],
        [dx - 1, 1.8, 0.8],
      ],
      0.3,
      DARK,
      { seg: 16, radial: 6 },
    ),
  )
  return fitGroup(g)
}

// ---------- 无线充电组：圆形充电板上躺着一部手机，右边一个三合一支架（手机 / 手表 / 耳机盒） ----------

function wirelessCharger(p: string[]) {
  const [padC, phone, acc] = p
  const g = new THREE.Group()
  // 充电板 + 前沿指示灯 + 躺着的手机（锁屏微亮）
  g.add(puck(4.5, 0.8, padC, { x: -4 }))
  // 指示灯和耳机盒上的灯同色同亮度（发光件按颜色各占一次绘制，能合就合）
  g.add(lit(box(0.8, 0.2, 0.4, '#7dffb0', { x: -4, y: 0.35, z: 4.35 }), '#7dffb0', 0.8))
  g.add(rbox(14, 0.8, 7, phone, { x: -4, y: 0.8 }, 0.6))
  g.add(lit(box(13, 0.2, 6.2, PHONE_GLASS, { x: -4, y: 1.5 }), PHONE_GLASS, 0.35))
  g.add(noOutline(lit(box(2.4, 0.1, 0.6, '#cfe3ff', { x: -5, y: 1.7, z: -1.2 }), '#cfe3ff', 0.6)))
  // 充电板的线沿桌面接到支架底座后面
  g.add(
    tube(
      [
        [-4, 0.35, -4.2],
        [-1, 0.35, -5.4],
        [2, 0.35, -5.2],
        [3.6, 0.35, -4.4],
      ],
      0.3,
      DARK,
      { seg: 12, radial: 6 },
    ),
  )
  // 三合一支架：底座 + 往后仰的手机托板（带圆形充电线圈）
  const sx = 7
  g.add(rbox(8, 1.2, 10, padC, { x: sx }, 0.5))
  const back = new THREE.Group()
  back.add(rbox(7, 12, 1.2, padC, {}, 0.5))
  back.add(noOutline(cylZ(2.2, 0.3, acc, 0, 7.2, 0.7, 20)))
  back.add(rbox(7, 1, 1.6, shade(padC, -0.08), { z: 1.2 }, 0.3))
  g.add(P(back, sx, 1.2, -3.2, -0.25))
  // 耳机盒：竖着放在前面左边，盖缝 + 小灯
  g.add(rbox(4.2, 5, 2.2, '#f4f4f2', { x: sx - 1.6, y: 1.2, z: 2.4 }, 1))
  g.add(noOutline(box(4.4, 0.2, 2.4, '#dcdcd8', { x: sx - 1.6, y: 4.6, z: 2.4 })))
  g.add(lit(box(0.3, 0.3, 0.2, '#7dffb0', { x: sx - 1.6, y: 3.4, z: 3.55 }), '#7dffb0', 0.8))
  // 手表：一根短柱顶着圆形充电头，表身挂在前面，表带绕到后面
  const wx = sx + 2.6
  g.add(cyl(0.5, 0.5, 2.4, acc, { x: wx, y: 1.2, z: 2 }, 10))
  g.add(cylZ(1.3, 0.6, acc, wx, 4.6, 2.4, 14))
  g.add(rbox(2.6, 3.2, 1, phone, { x: wx, y: 3, z: 3.2 }, 0.5))
  g.add(lit(box(2.1, 2.6, 0.2, PHONE_GLASS, { x: wx, y: 3.3, z: 3.75 }), PHONE_GLASS, 0.35))
  const band = torus(1.9, 0.4, shade(acc, -0.15), { x: wx, y: 4.6, z: 2.2, ry: PI / 2 })
  band.scale.set(0.45, 1, 2.2)
  g.add(band)
  return fitGroup(g)
}

// ---------- U 盘与读卡器小件：三只 U 盘、一只插着 SD 卡的读卡器、一只装着 SD 卡的小盒 ----------

/** 一只躺着的 U 盘：机身 + 金属插头 + 挂绳孔，插头朝 +z；ry 转向 */
function usbStick(x: number, z: number, ry: number, color: string) {
  const s = new THREE.Group()
  s.add(rbox(1.8, 0.8, 4.6, color, { z: -0.6 }, 0.35))
  s.add(box(1.2, 0.45, 1.3, STEEL, { y: 0.17, z: 2.15 }))
  s.add(noOutline(torus(0.35, 0.12, shade(color, -0.25), { y: 0.82, z: -2.3, rx: PI / 2 }, PI * 2, [4, 8])))
  return P(s, x, 0, z, 0, ry)
}

function usbBits(p: string[]) {
  const [a, b, boxC] = p
  const g = new THREE.Group()
  // 三只 U 盘斜躺成一排
  g.add(usbStick(-5.6, 2.3, 0.15, a))
  g.add(usbStick(-3, 2.1, -0.1, b))
  g.add(usbStick(-0.4, 2.4, 0.25, shade(a, 0.25)))
  // 读卡器：扁盒子，后面一张插了一半的 SD 卡，前面是 USB 插头
  g.add(rbox(3.4, 1, 4.6, DARK, { x: 4.6, z: 2.3 }, 0.4))
  g.add(box(2.4, 0.2, 2.2, '#3f74c8', { x: 4.6, y: 0.4, z: -0.6 }))
  g.add(noOutline(box(1.6, 0.1, 0.9, '#f4f4f2', { x: 4.6, y: 0.6, z: -0.9 })))
  g.add(box(1.2, 0.45, 1.3, STEEL, { x: 4.6, y: 0.27, z: 5.2 }))
  g.add(lit(box(0.3, 0.1, 0.3, '#7dffb0', { x: 5.6, y: 0.95, z: 3.6 }), '#7dffb0', 0.8))
  // 小收纳盒：敞口小盒里立着几张 SD 卡
  g.add(tray(6.4, 2.2, 3.6, 0.3, boxC, { x: -2.6, z: -2.6 }, 0.12))
  ;['#d8483f', '#3f74c8', '#2b2b30', '#f2c230'].forEach((c, i) => {
    const sd = box(2.4, 3, 0.25, c, { x: -4.6 + i * 1.4, y: 0.3, z: -2.6 + (i % 2 ? 0.5 : -0.5) })
    sd.rotation.z = (i - 1.5) * 0.08
    g.add(sd)
  })
  // 一张散放的 micro SD
  g.add(box(1.1, 0.15, 1.5, DARK, { x: 4.2, y: 0, z: -2.6 }))
  return fitGroup(g)
}

// ---------- 对讲机一对 + 双联充电座 ----------

/** 一台对讲机：机身 + 天线 + 顶上两只旋钮 + 喇叭格栅 + 小屏 + 侧面 PTT 键 + 背夹，原点在机身底面中心 */
function radio(color: string, acc: string) {
  const r = new THREE.Group()
  r.add(rbox(5.4, 10.4, 3.2, color, {}, 1))
  r.add(cyl(0.45, 0.6, 6.5, RUBBER, { x: -1.4, y: 10.2 }, 10))
  r.add(ball(0.55, RUBBER, { x: -1.4, y: 16.7 }, undefined, [8, 6]))
  r.add(cyl(0.6, 0.6, 1.1, DARK, { x: 0.6, y: 10.2 }, 12))
  r.add(cyl(0.45, 0.45, 0.9, acc, { x: 1.8, y: 10.2 }, 10))
  // 正面：喇叭格栅（几道横槽）、小屏、按键
  for (let i = 0; i < 4; i++) r.add(noOutline(box(3.6, 0.25, 0.2, shade(color, -0.25), { y: 6.6 + i * 0.6, z: 1.62 })))
  r.add(lit(box(3, 1.4, 0.2, '#b8e2c8', { y: 4.2, z: 1.62 }), '#b8e2c8', 0.35))
  for (let i = 0; i < 3; i++) r.add(box(0.8, 0.5, 0.3, shade(color, 0.2), { x: -1.1 + i * 1.1, y: 2.8, z: 1.6 }))
  // 侧面 PTT 键、背夹
  r.add(box(0.4, 2.4, 1.4, acc, { x: -2.8, y: 5.6 }))
  r.add(box(2.2, 4.2, 0.4, DARK, { y: 4.6, z: -1.75 }))
  return r
}

function walkieTalkie(p: string[]) {
  const [body, cradle, acc] = p
  const g = new THREE.Group()
  // 充电座：底板 + 前后围挡 + 两侧和中间的隔板，前沿两只充电灯
  g.add(rbox(14.8, 1.5, 8, cradle, {}, 0.6))
  g.add(rbox(14.8, 3.6, 1.2, cradle, { y: 1.4, z: 3.4 }, 0.4))
  g.add(rbox(14.8, 5, 1.2, cradle, { y: 1.4, z: -3.4 }, 0.4))
  for (const x of [-6.8, 0, 6.8]) g.add(rbox(1.2, 3.4, 5.6, cradle, { x, y: 1.4 }, 0.3))
  for (const [x, c] of [
    [-3.4, '#7dffb0'],
    [3.4, '#ffb347'],
  ] as [number, string][])
    g.add(lit(box(0.8, 0.3, 0.4, c, { x, y: 4.95, z: 3.6 }), c, 0.8))
  // 两台对讲机插在座里（略往后靠）
  for (const [x, ry] of [
    [-3.4, 0.05],
    [3.4, -0.05],
  ] as [number, number][])
    g.add(P(radio(body, acc), x, 1.5, 0, -0.04, ry))
  return g
}

// ---------- 高达模型工作台：切割垫上一只半成品机器人（方头单眼、一边肩甲），水口钳、笔刀、打磨棒和两块板件 ----------

/** 半成品机器人：方头单眼、左肩一块大肩甲，右臂还没装（躺在垫子上），左腿只装了骨架。原点在底座底面 */
function mecha(main: string, frame: string, acc: string) {
  const m = new THREE.Group()
  m.add(cyl(3, 3.2, 0.6, frame, {}, 20))
  const y0 = 0.6
  // 脚、小腿（右腿装好了外甲，左腿只是灰色骨架）
  for (const s of [-1, 1]) {
    m.add(rbox(1.7, 0.9, 2.8, main, { x: s * 1.1, y: y0, z: 0.3 }, 0.3))
    m.add(rbox(s > 0 ? 1.5 : 1.1, 3.4, s > 0 ? 1.7 : 1.2, s > 0 ? main : frame, { x: s * 1.1, y: y0 + 0.9 }, 0.3))
    m.add(rbox(1.2, 2.6, 1.3, frame, { x: s * 1.1, y: y0 + 4.2 }, 0.3))
  }
  m.add(box(1.1, 0.9, 0.5, acc, { x: 1.1, y: y0 + 3.4, z: 0.95 }))
  // 腰、裙甲、胸部（胸口两道进气口）
  m.add(rbox(3.6, 1.3, 2.3, main, { y: y0 + 6.6 }, 0.35))
  m.add(rbox(4.4, 3.4, 2.8, main, { y: y0 + 7.8 }, 0.5))
  for (const s of [-1, 1]) m.add(box(1.2, 0.9, 0.3, acc, { x: s * 1.1, y: y0 + 9.6, z: 1.45 }))
  // 脖子、方头、单眼导轨和粉色单眼
  m.add(cyl(0.5, 0.6, 0.6, frame, { y: y0 + 11.2 }, 10))
  m.add(rbox(2, 1.8, 2.1, main, { y: y0 + 11.7 }, 0.35))
  m.add(noOutline(box(1.7, 0.5, 0.2, DARK, { y: y0 + 12.4, z: 1.1 })))
  m.add(lit(ball(0.22, '#ff4f8a', { x: 0.3, y: y0 + 12.65, z: 1.22 }, undefined, [8, 6]), '#ff4f8a', 0.9))
  m.add(box(0.3, 1, 0.3, acc, { y: y0 + 13.4, z: -0.3 }))
  // 左肩：大肩甲 + 垂下来的左臂和拳头；右肩只有关节
  m.add(rbox(2.4, 2.4, 3, acc, { x: -3, y: y0 + 9.4 }, 0.6))
  m.add(rbox(1.2, 3.6, 1.3, main, { x: -3, y: y0 + 5.9 }, 0.3))
  m.add(ball(0.7, frame, { x: -3, y: y0 + 5.6 }, undefined, [8, 6]))
  m.add(ball(0.75, frame, { x: 2.5, y: y0 + 10.2 }, undefined, [8, 6]))
  return m
}

/** 一块板件：长方形外框 + 中间一根横梁 + 挂在梁上的几个小零件，平躺，原点在底面中心 */
function runner(color: string, seed: number) {
  const r = new THREE.Group()
  const w = 10
  const d = 7
  for (const s of [-1, 1]) {
    r.add(box(w, 0.4, 0.4, color, { z: s * (d / 2 - 0.2) }))
    r.add(box(0.4, 0.3, d - 0.8, color, { x: s * (w / 2 - 0.2) }))
  }
  r.add(box(w - 0.8, 0.3, 0.3, color))
  const rnd = rng(seed)
  for (let i = 0; i < 4; i++) {
    const pw = 1.2 + rnd() * 0.8
    const pd = 1.2 + rnd() * 0.9
    const side = i % 2 ? 1 : -1
    r.add(box(pw, 0.5, pd, color, { x: -3.3 + i * 2.2, z: side * (pd / 2 + 0.05) }))
  }
  return r
}

function gunplaBench(p: string[]) {
  const [main, frame, acc, matC] = p
  const g = new THREE.Group()
  const top = 0.4
  // 切割垫：绿色垫子 + 格线（每 5cm 一条稍粗的）
  g.add(rbox(38, top, 28, matC, {}, 0.15))
  for (let i = -3; i <= 3; i++) g.add(plate(0.15, 26, '#e8f2e4', { x: i * 5, y: top + 0.05 }))
  for (let i = -2; i <= 2; i++) g.add(plate(36, 0.15, '#e8f2e4', { y: top + 0.05, z: i * 5 }))
  // 机器人立在垫子右后方；没装上的右臂躺在旁边
  g.add(P(mecha(main, frame, acc), 9, top, -5))
  g.add(P(G(rbox(1.2, 1.3, 3.6, main, {}, 0.3), ball(0.75, frame, { y: 0.65, z: 2.2 }, undefined, [8, 6])), 14, top, 1.5, 0, 0.5))
  // 两块板件（一块主色、一块骨架灰）
  g.add(P(runner(main, 3), -10, top, -6, 0, 0.12))
  g.add(P(runner(frame, 7), -9, top, 5.5, 0, -0.18))
  // 水口钳：两只手柄（套着彩色胶套）在转轴处交叉，前面一对金属钳口
  const nip = new THREE.Group()
  for (const s of [-1, 1]) {
    nip.add(P(rbox(0.8, s > 0 ? 0.5 : 0.6, 6.4, acc, {}, 0.25), s * 0.9, 0.3, 3.2, 0, s * 0.16))
    nip.add(P(box(0.5, 0.4, 2.2, STEEL), s * 0.2, 0.2, -1, 0, -s * 0.08))
  }
  nip.add(cyl(0.6, 0.6, 0.9, STEEL, { y: 0 }, 12))
  g.add(P(nip, 1.5, top, 6, 0, -0.6))
  // 笔刀：彩色笔杆 + 银色夹头 + 小刀片
  g.add(cylX(0.38, 8, frame, 0, top + 0.38, 11, 12))
  g.add(cylX(0.42, 1.6, STEEL, 4.6, top + 0.42, 11, 12))
  g.add(P(box(1, 0.1, 0.4, STEEL), 5.9, top + 0.42, 11, 0, 0, -0.1))
  // 两根打磨棒
  for (const [x, c] of [
    [13, '#f2f2ee'],
    [15, '#e8a23a'],
  ] as [number, string][])
    g.add(P(box(1, 0.5, 9, c), x, top + 0.25, 8, 0, 0.08))
  return fitGroup(g)
}

// ---------- 拼豆板 + 熨斗：方形钉板上拼了一半的像素爱心，旁边一只分格珠盒和一只小熨斗 ----------

/** 10×10 像素图：# 主色、o 高光、. 底色珠，空格 = 还没拼（露出钉子）。前五行拼好了 */
const PERLER = ['..##..##..', '.########.', '#o########', '##########', '.########.', '          ', '   #      ', '          ', '          ', '          ']

function perlerBeads(p: string[]) {
  const [boardC, heart, boxC, ironC] = p
  const g = new THREE.Group()
  const bx = -9
  const step = 1.4
  // 钉板
  g.add(rbox(15, 0.5, 15, boardC, { x: bx }, 0.3))
  PERLER.forEach((row, j) => {
    for (let i = 0; i < 10; i++) {
      const x = bx + (i - 4.5) * step
      const z = (j - 4.5) * step
      const c = row[i]
      // 一百来颗的小件：钉子 4 段、珠子 6 段（直径一厘米上下，看不出棱角）
      if (c === ' ') g.add(cyl(0.18, 0.2, 0.5, shade(boardC, -0.08), { x, y: 0.5, z }, 4))
      else g.add(cyl(0.6, 0.6, 0.6, c === '#' ? heart : c === 'o' ? '#ffffff' : '#fbf3e4', { x, y: 0.5, z }, 6))
    }
  })
  // 珠盒：3 × 2 小格，每格一堆不同颜色的珠子
  const ox = 6
  const oz = -3
  g.add(tray(11, 2.4, 8, 0.5, boxC, { x: ox, z: oz }, 0.2))
  for (const x of [-1.8, 1.8]) g.add(box(0.4, 1.8, 7, boxC, { x: ox + x, y: 0.5, z: oz }))
  g.add(box(10, 1.8, 0.4, boxC, { x: ox, y: 0.5, z: oz }))
  ;[heart, '#fbf3e4', '#5ab4e8', '#f2c230', '#6fc27a', DARK].forEach((c, k) => {
    const x = ox + (k % 3 - 1) * 3.4
    const z = oz + (k < 3 ? -1.9 : 1.9)
    g.add(rbox(2.6, 0.8, 2.8, c, { x, y: 0.5, z }, 0.3))
    for (const [dx, dz] of [
      [-0.5, 0.3],
      [0.5, -0.4],
    ])
      g.add(ball(0.45, c, { x: x + dx, y: 1.45, z: z + dz }, undefined, [6, 4]))
  })
  // 小熨斗：尖头金属底板 + 机身 + 拱形把手 + 温控旋钮 + 电线
  const iron = new THREE.Group()
  iron.add(slab([[-2.6, -4.2], [2.6, -4.2], [2.6, 1.6], [0, 4.4], [-2.6, 1.6]], 0.7, STEEL, 0))
  iron.add(slab([[-2.2, -3.8], [2.2, -3.8], [2.2, 1.4], [0, 3.6], [-2.2, 1.4]], 1.6, ironC, 0.6))
  iron.add(tube([[0, 2, -3], [0, 4.2, -2], [0, 4.4, 0.6], [0, 2.1, 2]], 0.6, shade(ironC, -0.1), { seg: 12, radial: 8 }))
  iron.add(cyl(0.8, 0.8, 0.4, DARK, { y: 2.1, z: -1 }, 12))
  iron.add(tube([[0, 1.2, -3.8], [0.4, 0.8, -5.4], [2, 0.3, -6.4], [4, 0.3, -6.6]], 0.25, DARK, { seg: 12, radial: 6 }))
  g.add(P(iron, 6.4, 0, 6, 0, -0.35))
  return fitGroup(g)
}

// ---------- 魔尺与数独盘：彩色三棱块盘成的球，旁边一块木数独盘（九宫粗线 + 用色点表示数字的棋子） ----------

function magicSnake(p: string[]) {
  const [a, b, wood, line] = p
  const g = new THREE.Group()
  // 魔尺球：24 块三棱块按纬度分四圈贴在一只深色球芯上，两色交替，平的一面朝外
  const sx = 7
  const R0 = 4.1
  const cy = 5.3
  g.add(ball(3.4, shade(b, -0.2), { x: sx, y: cy }, undefined, [12, 8]))
  let k = 0
  for (const [lat, n, off] of [
    [-0.85, 5, 0],
    [-0.28, 7, 0.4],
    [0.28, 7, 0],
    [0.85, 5, 0.4],
    [1.3, 3, 0.2],
    [-1.3, 3, 0.6],
  ] as [number, number, number][]) {
    for (let i = 0; i < n; i++) {
      const th = (i / n) * PI * 2 + off
      const out = new THREE.Vector3(Math.cos(lat) * Math.cos(th), Math.sin(lat), Math.cos(lat) * Math.sin(th))
      const east = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th))
      const m = cyl(1.45, 1.45, 3.2 * Math.cos(lat) + 0.6, k++ % 2 ? a : b, {}, 3)
      m.position.set(sx + out.x * R0, cy + out.y * R0, out.z * R0)
      m.quaternion.setFromUnitVectors(UP, east)
      // 绕自身轴转到「一个顶点朝里」（三棱柱局部 +z 是一个顶点，转到朝球心）
      const lz = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion)
      const want = out.clone().negate()
      m.rotateY(Math.atan2(lz.clone().cross(want).dot(east), lz.dot(want)))
      g.add(m)
    }
  }
  // 数独盘：木板 + 九宫粗线（凸起）+ 细格线（贴面）
  const ox = -5.5
  const cell = 1.3
  const top = 1
  g.add(rbox(13, top, 13, wood, { x: ox }, 0.4))
  for (const s of [-1, 1]) {
    g.add(box(11.7, 0.2, 0.25, line, { x: ox, y: top - 0.05, z: s * cell * 1.5 }))
    g.add(box(0.25, 0.3, 11.7, line, { x: ox + s * cell * 1.5, y: top - 0.05 }))
  }
  for (const i of [-3.5, -2.5, -0.5, 0.5, 2.5, 3.5]) {
    g.add(plate(11.7, 0.08, shade(wood, -0.25), { x: ox, y: top + 0.05, z: i * cell }))
    g.add(plate(0.08, 11.7, shade(wood, -0.25), { x: ox + i * cell, y: top + 0.05 }))
  }
  // 棋子：木色圆片 + 顶上的色点（九种颜色代表 1–9）
  const digits = ['#d8483f', '#e8a23a', '#f2c230', '#6fc27a', '#2f8f8a', '#3f74c8', '#7a5cff', '#d96aa8', '#3a3330']
  const rnd = rng(11)
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 9; i++) {
      if (rnd() > 0.36) continue
      const x = ox + (i - 4) * cell
      const z = (j - 4) * cell
      g.add(cyl(0.5, 0.52, 0.4, shade(wood, 0.12), { x, y: top, z }, 8))
      g.add(noOutline(cyl(0.22, 0.22, 0.1, digits[(i * 3 + j * 5) % 9], { x, y: top + 0.4, z }, 6)))
    }
  return fitGroup(g)
}

// ---------- 桌上显示器增高书架：长台面 + 底板，两端各一个两层抽屉柜，中间留空塞键盘 ----------

const DS = { w: 80, d: 24, h: 18, top: 1.5, base: 1, t: 1.2, unit: 18 }
/** 两端抽屉柜各两只抽屉的抽屉口（左右对称） */
function dsDrawers() {
  const out: { x0: number; x1: number; y0: number; y1: number; z: number; depth: number }[] = []
  const mid = (DS.base + DS.h - DS.top) / 2
  for (const s of [-1, 1]) {
    const xa = s * (DS.w / 2 - DS.t)
    const xb = s * (DS.w / 2 - DS.unit + DS.t / 2)
    const [x0, x1] = s < 0 ? [xa, xb] : [xb, xa]
    for (const [y0, y1] of [
      [DS.base, mid],
      [mid, DS.h - DS.top],
    ])
      out.push({ x0, x1, y0, y1, z: DS.d / 2 - 1.4, depth: DS.d - 3.8 })
  }
  return out
}

function deskShelf(p: string[]) {
  const [wood, body, knob] = p
  const g = new THREE.Group()
  const ih = DS.h - DS.top - DS.base
  // 底板、台面
  g.add(rbox(DS.w, DS.base, DS.d, body, {}, 0.3))
  g.add(rbox(DS.w, DS.top, DS.d, wood, { y: DS.h - DS.top }, 0.5))
  for (const s of [-1, 1]) {
    // 外侧板、内侧板、背板
    g.add(rbox(DS.t, ih, DS.d, body, { x: s * (DS.w / 2 - DS.t / 2), y: DS.base }, 0.3))
    g.add(rbox(DS.t, ih, DS.d, body, { x: s * (DS.w / 2 - DS.unit), y: DS.base }, 0.3))
    g.add(rbox(DS.unit - DS.t * 1.5, ih, 1, shade(body, -0.05), { x: s * (DS.w / 2 - DS.unit / 2 - DS.t / 4), y: DS.base, z: -DS.d / 2 + 0.5 }, 0.2))
  }
  for (const o of dsDrawers()) g.add(drawerBox({ ...o, color: wood, knob }))
  // 中间空格后面一块低挡板（挡住键盘线）
  g.add(rbox(DS.w - DS.unit * 2 - DS.t, 3, 1, shade(body, -0.05), { y: DS.base, z: -DS.d / 2 + 0.5 }, 0.2))
  return g
}

// ---------- 桌面分格收纳盒：后排高格插笔、剪刀、荧光笔和尺，前排矮格放便签本和一卷充电线 ----------

function deskOrganizer(p: string[]) {
  const [boxC, sub, acc] = p
  const g = new THREE.Group()
  const t = 0.8
  // 后排高格（高 11）、前排矮格（高 5.5）
  g.add(tray(30, 11, 8, t, boxC, { z: -4 }, 0.3))
  g.add(tray(30, 5.5, 8, t, boxC, { z: 4 }, 0.3))
  for (const x of [-5, 5]) g.add(rbox(t, 10.2, 6.4, boxC, { x, y: t, z: -4 }, 0.2))
  g.add(rbox(t, 4.7, 6.4, boxC, { x: -3, y: t, z: 4 }, 0.2))
  // 笔：几支斜插的笔
  const pens: [number, number, number, number, string][] = [
    [-12.5, -5.6, 0.12, 13, acc],
    [-11, -3, -0.08, 12.5, DARK],
    [-9, -5.2, 0.05, 14, '#3f74c8'],
    [-7.4, -2.8, -0.14, 12, sub],
  ]
  for (const [x, z, rz, len, c] of pens) {
    const pen = new THREE.Group()
    pen.add(cyl(0.45, 0.45, len - 1.6, c, {}, 10))
    pen.add(cyl(0.48, 0.48, 1.6, shade(c, -0.15), { y: len - 1.6 }, 10))
    pen.add(box(0.2, 3, 0.4, STEEL, { x: 0.5, y: len - 3.4 }))
    g.add(P(pen, x, t, z, 0, 0, rz))
  }
  // 剪刀：刀刃朝下插着，两只手柄环露在外面
  const sc = new THREE.Group()
  for (const s of [-1, 1]) {
    sc.add(P(box(0.5, 8.6, 0.2, STEEL), s * 0.25, 4.32, s * 0.1, 0, 0, s * 0.05))
    sc.add(torus(1.2, 0.35, acc, { x: s * 1.3, y: 10.6, z: s * 0.1 }, PI * 2, [6, 12]))
    // 手柄：从转轴斜着接进指环的下沿（以前指环只是悬在刀刃上方，和刀身没连上）
    sc.add(rod3([0, 8.6, s * 0.1], [s * 0.65, 9.65, s * 0.1], 0.3, acc, 6))
  }
  sc.add(cylZ(0.4, 0.8, STEEL, 0, 8.6, 0, 10))
  g.add(P(sc, -1.5, t, -4.4, 0, 0.2))
  // 荧光笔两支 + 一把直尺
  for (const [x, c] of [
    [1.8, '#f2e23a'],
    [3.4, '#ff8fb4'],
  ] as [number, string][])
    g.add(P(rbox(1.4, 12, 0.9, c, {}, 0.3), x, t + 6, -5.6, -0.08))
  // 直尺和刻度一起斜靠：刻度条半嵌在尺面里（以前刻度竖直排、尺子往后仰，上面几道离了尺面）
  const ruler = G(P(box(3.2, 15, 0.3, '#eef4f6'), 0, 0, 0))
  for (let i = 0; i < 5; i++) ruler.add(noOutline(box(1, 0.1, 0.1, DARK, { x: -1, y: 1.5 + i * 1.2, z: 0.17 })))
  g.add(P(ruler, 10, t + 7.5, -6.6, -0.05))
  // 前排：便签本、一卷充电线 + 插头
  g.add(rbox(7.6, 3.6, 6.2, '#ffe27a', { x: -9.4, y: t, z: 4 }, 0.15))
  g.add(box(7.6, 0.2, 6.2, '#ffd23f', { x: -9.4, y: t + 3.6, z: 4 }))
  // 一卷线：五圈细环叠起来，一圈 16 段、截面 6 段
  for (let i = 0; i < 5; i++) g.add(torus(2.6, 0.35, i % 2 ? '#f4f4f2' : '#e6e6e2', { x: 6, y: t + 0.35 + i * 0.7, z: 4, rx: PI / 2 }, PI * 2, [6, 16]))
  g.add(tube([[8.4, t + 3.15, 4.6], [10.6, t + 2.6, 5.4], [12.2, t + 1.2, 5]], 0.35, '#f4f4f2', { seg: 10, radial: 6 }))
  g.add(rbox(1.2, 0.7, 2, '#f4f4f2', { x: 12.4, y: t + 0.5, z: 4.4 }, 0.2))
  return fitGroup(g)
}

// ---------- 悬臂麦克风架：桌夹 + 两节带弹簧的悬臂，末端防震架里吊着一支麦克风，前面一只鹅颈防喷罩 ----------

function micArm(p: string[]) {
  const [arm, mic, acc] = p
  const g = new THREE.Group()
  const cz = -31
  const joint = shade(arm, -0.15)
  // 桌夹 + 侧旋钮 + 立柱 + 转座
  g.add(rbox(7, 2, 7, arm, { z: cz }, 0.6))
  g.add(cylX(1, 2, DARK, 4.4, 1, cz, 12))
  g.add(cyl(1.3, 1.3, 7, arm, { y: 2, z: cz }, 14))
  g.add(cyl(1.8, 1.8, 2.4, joint, { y: 8, z: cz }, 14))
  // 两节悬臂：每节两根平行杆 + 两侧的弹簧
  const A: V3 = [0, 10.4, cz]
  const E: V3 = [0, 54, -16]
  const T: V3 = [0, 47, 20]
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  for (const [a, b] of [
    [A, E],
    [E, T],
  ] as [V3, V3][]) {
    for (const s of [-1, 1]) {
      g.add(rod3([s * 0.9, a[1], a[2]], [s * 0.9, b[1], b[2]], 0.45, arm, 8))
      const p0 = lerp(a, b, 0.18)
      const p1 = lerp(a, b, 0.72)
      g.add(rod3([s * 1.6, p0[1], p0[2]], [s * 1.6, p1[1], p1[2]], 0.42, acc, 8))
    }
  }
  g.add(cylX(1.3, 3.6, joint, 0, A[1], A[2], 14))
  g.add(cylX(1.4, 4.2, joint, 0, E[1], E[2], 14))
  g.add(cylX(1.2, 3.6, joint, 0, T[1], T[2], 14))
  // 防震架：从末端垂下的短杆 + 横梁 + 两根侧杆 + 上下两只环，环和麦克风之间几根弹力绳
  const mz = T[2]
  g.add(cyl(0.45, 0.45, 2.4, joint, { y: T[1] - 2.6, z: mz }, 8))
  g.add(cylX(0.5, 7.2, joint, 0, T[1] - 2.8, mz, 8))
  for (const s of [-1, 1]) g.add(cyl(0.4, 0.4, 10, joint, { x: s * 3.4, y: T[1] - 12.8, z: mz }, 8))
  for (const y of [35, 40]) {
    g.add(torus(3.4, 0.35, joint, { y, z: mz, rx: PI / 2 }))
    for (const s of [-1, 1]) g.add(rod3([s * 3.1, y, mz], [s * 2, y, mz], 0.15, acc, 6))
    g.add(rod3([0, y, mz + 3.1], [0, y, mz + 2], 0.15, acc, 6))
  }
  // 麦克风：机身 + 金属网头 + 网头下的一道环
  g.add(cyl(2, 1.9, 10, mic, { y: 30.5, z: mz }, 20))
  g.add(cyl(2.1, 2.1, 0.6, STEEL, { y: 40.5, z: mz }, 20))
  g.add(ball(2.1, shade(mic, 0.18), { y: 41.6, z: mz }))
  // 鹅颈防喷罩
  g.add(tube([[1.8, T[1], mz], [4, 45, mz + 2], [5.6, 40.5, mz + 5.4], [5, 37.8, mz + 7]], 0.3, DARK, { seg: 16, radial: 6 }))
  g.add(torus(5, 0.4, DARK, { y: 37, z: mz + 7 }))
  g.add(ghost(cylZ(4.7, 0.2, '#2a2b30', 0, 37, mz + 7, 24), '#2a2b30', 0.4))
  return fitGroup(g)
}

// ---------- 桌面直播控制台：斜面按键面板（3 × 5 发光键）+ 四推子小调音台 ----------

const KEY_COLORS = ['#ff5ca8', '#5ad1ff', '#ffd24a', '#7dff9a', '#a46bff']

function streamDeck(p: string[]) {
  const [body, mixer, acc] = p
  const g = new THREE.Group()
  // 按键面板：楔形机身，斜面上 3 × 5 颗键（深色键帽 + 发光图标）
  const kx = -7.5
  g.add(sideSlab([[-4.5, 0], [4.5, 0], [4.5, 1.6], [-4.5, 5]], 13, body, kx))
  const f = tiltFrame([-4.5, 5], [4.5, 1.6], 'z')
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++) {
      const x = kx + (c - 2) * 2.4
      const z = 1.8 + r * 2.6
      // 十五颗键、十五个图标：直角小盒（圆角盒每个 108 个面，几毫米的圆角看不出）
      f.g.add(box(2, 0.6, 2, DARK, { x, y: -0.1, z }))
      const col = r === 1 && c === 2 ? acc : KEY_COLORS[(r * 2 + c) % 5]
      f.g.add(lit(box(1.4, 0.2, 1.4, col, { x, y: 0.45, z }), col, 0.7))
    }
  g.add(f.g)
  // 调音台：扁盒子，四条推子槽 + 推子帽，后排四只旋钮，右侧电平灯
  const mx = 7
  g.add(rbox(14, 2.4, 11, mixer, { x: mx }, 0.6))
  const caps = [0.4, -1.6, 1.2, -0.4]
  caps.forEach((dz, i) => {
    const x = mx - 4.5 + i * 2.6
    g.add(noOutline(box(0.4, 0.1, 6, DARK, { x, y: 2.4, z: 1.2 })))
    g.add(box(1.4, 1, 0.8, i === 3 ? acc : '#e8e8e4', { x, y: 2.4, z: 1.2 + dz }))
    g.add(cyl(0.6, 0.65, 0.9, DARK, { x, y: 2.4, z: -3.4 }, 10))
    g.add(noOutline(box(0.15, 0.1, 0.5, '#f4f4f2', { x, y: 3.3, z: -3.6 })))
  })
  // 电平灯：绿、黄借按键图标的颜色和亮度（发光件按颜色各占一次绘制，同色同亮度的才能合并）；最顶上一格是削波的红灯，单独一色
  for (let i = 0; i < 4; i++) {
    const c = i === 3 ? '#ff5a4a' : i === 2 ? KEY_COLORS[2] : KEY_COLORS[3]
    g.add(lit(box(0.6, 0.2, 0.6, c, { x: mx + 5.8, y: 2.35, z: 3.6 - i * 1.1 }), c, 0.7))
  }
  // 两台之间的连线
  g.add(tube([[kx + 6.4, 0.6, -3], [-0.5, 0.3, -4.5], [mx - 6.9, 0.6, -4]], 0.25, DARK, { seg: 10, radial: 6 }))
  return fitGroup(g)
}

// ---------- 电子墨水相框 + 智能日出闹钟：往后仰的立式相框（灰阶画面）+ 方形闹钟（发光圆面 + 时间） ----------

function paintEink(c: CanvasRenderingContext2D, W: number, H: number) {
  // 白色卡纸边 + 灰阶山水：天空渐变、太阳、两层山、湖面倒影的横线
  c.fillStyle = '#f2f2ee'
  c.fillRect(0, 0, W, H)
  const m = W * 0.09
  const iw = W - m * 2
  const ih = H - m * 2
  const grd = c.createLinearGradient(0, m, 0, m + ih)
  grd.addColorStop(0, '#b9bab6')
  grd.addColorStop(0.6, '#e4e4e0')
  c.fillStyle = grd
  c.fillRect(m, m, iw, ih)
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.arc(m + iw * 0.68, m + ih * 0.26, iw * 0.1, 0, PI * 2)
  c.fill()
  const hill = (pts: [number, number][], col: string) => {
    c.fillStyle = col
    c.beginPath()
    c.moveTo(m, m + ih * 0.62)
    for (const [x, y] of pts) c.lineTo(m + iw * x, m + ih * y)
    c.lineTo(m + iw, m + ih * 0.62)
    c.closePath()
    c.fill()
  }
  hill([[0.2, 0.36], [0.42, 0.5], [0.62, 0.32], [0.9, 0.52]], '#8d8e8a')
  hill([[0.12, 0.5], [0.3, 0.44], [0.55, 0.56], [0.8, 0.46]], '#5c5d5a')
  c.fillStyle = '#d2d2ce'
  c.fillRect(m, m + ih * 0.62, iw, ih * 0.38)
  c.fillStyle = '#9a9b97'
  for (let i = 0; i < 7; i++) c.fillRect(m + iw * (0.1 + ((i * 37) % 50) / 100), m + ih * (0.67 + i * 0.045), iw * 0.3, Math.max(1, ih * 0.012))
}

function paintAlarm(c: CanvasRenderingContext2D, W: number, H: number) {
  c.fillStyle = '#1d1f26'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#ffb347'
  c.font = `bold ${Math.round(H * 0.72)}px sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('06:30', W / 2, H * 0.55)
}

function einkFrame(p: string[]) {
  const [frame, clock, acc] = p
  const g = new THREE.Group()
  // 相框：边框 + 灰阶画面（墨水屏不发光）+ 背后撑脚
  const fx = -5
  const f = new THREE.Group()
  f.add(rbox(13, 17, 1.2, frame, {}, 0.5))
  f.add(paintPanel(11.4, 15.4, 'dt-eink', paintEink, { y: 0.8, z: 0.68 }))
  f.add(rbox(3, 3, 0.5, shade(frame, -0.1), { y: 7, z: -0.8 }, 0.2))
  g.add(P(f, fx, 0.12, 0, -0.18))
  g.add(batten([fx, 8.2, -2.2], [fx, 0.3, -6.6], 2, 0.5, shade(frame, -0.1), 0.2))
  // 日出闹钟：圆角方盒 + 正面发光的圆面（外圈一道环）+ 底下的时间条 + 顶上的贪睡键
  const cx = 6.8
  g.add(rbox(9, 9, 7, clock, { x: cx }, 2))
  g.add(lit(cylZ(3, 0.4, '#ffd9a0', cx, 5.3, 3.5, 28), '#ffd9a0', 0.75))
  g.add(torus(3.1, 0.3, acc, { x: cx, y: 5.3, z: 3.6 }))
  g.add(paintPanel(4.6, 1.3, 'dt-alarm-time', paintAlarm, { x: cx, y: 1.1, z: 3.58 }, 0.8))
  g.add(rbox(4, 0.5, 2.4, acc, { x: cx, y: 8.8 }, 0.25))
  return fitGroup(g)
}

// ---------- 标签机与收纳罐：躺着的手持标签机（小屏、键盘、出带口）、一盒标签带、三只贴了标签的透明收纳罐 ----------

function labelMaker(p: string[]) {
  const [body, tape, lid] = p
  const g = new THREE.Group()
  // 标签机：机身 + 小液晶 + 4 × 5 键 + 后端吐出的一截标签
  const mx = -9
  g.add(rbox(6.5, 3.2, 14, body, { x: mx, z: 1 }, 1.2))
  g.add(lit(box(4.6, 0.2, 2.6, '#c3d1b0', { x: mx, y: 3.1, z: -3.2 }), '#c3d1b0', 0.2))
  g.add(noOutline(box(3, 0.1, 0.5, '#3a4038', { x: mx - 0.3, y: 3.3, z: -3.2 })))
  // 二十颗小键：直角小盒
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 4; c++) g.add(box(1, 0.35, 0.9, r === 4 && c === 3 ? tape : shade(body, 0.25), { x: mx - 1.95 + c * 1.3, y: 3.05, z: -0.4 + r * 1.35 }))
  g.add(box(1.2, 0.2, 3, '#fbfaf4', { x: mx, y: 1.6, z: -7.4 }))
  g.add(noOutline(box(0.6, 0.1, 1.6, DARK, { x: mx, y: 1.8, z: -7.6 })))
  // 标签带盒：方盒 + 中间的卷轴孔 + 窗里露出的白带
  const tx = -1.8
  g.add(rbox(5.5, 1.6, 5.5, tape, { x: tx, z: 3.2 }, 0.4))
  g.add(cyl(0.8, 0.8, 0.2, DARK, { x: tx, y: 1.55, z: 3.2 }, 14))
  g.add(cyl(1.8, 1.8, 0.1, '#fbfaf4', { x: tx - 0.6, y: 1.58, z: 3.4 }, 20))
  // 收纳罐：透明罐身 + 彩色盖子 + 正面的白标签（一道字）+ 罐里的小东西
  const jars: [number, number, string][] = [
    [3.6, 8, '#e8a23a'],
    [8.6, 6.4, '#5ab4e8'],
    [13.4, 9, '#d8483f'],
  ]
  for (const [x, h, inner] of jars) {
    const z = -3
    g.add(ghost(cup(2.3, 2.2, h, 0.25, '#dfeff5', { x, z }, 16), '#dfeff5', 0.5))
    g.add(puck(2.45, 1, lid, { x, y: h - 0.2, z }))
    g.add(box(3, 1.6, 0.2, '#fbfaf4', { x, y: h * 0.45, z: z + 2.3 }))
    g.add(noOutline(box(2, 0.25, 0.1, DARK, { x, y: h * 0.45 + 0.65, z: z + 2.42 })))
    for (let i = 0; i < 4; i++) g.add(ball(0.6, i % 2 ? inner : shade(inner, 0.2), { x: x + Math.cos(i * 2.1) * 1.1, y: 0.8 + (i > 2 ? 0.7 : 0), z: z + Math.sin(i * 2.1) * 1.1 }, undefined, [6, 4]))
  }
  return fitGroup(g)
}

// ---------- 塑封机：扁长的圆背机身、两端色块端盖，顶上进纸口和指示灯，前面出纸口正吐出一张塑封卡片 ----------

const LM_SIDE: V2[] = [
  [-4.5, 0],
  [4.5, 0],
  [4.5, 3.2],
  [3.6, 5.6],
  [1.5, 6.8],
  [-2, 7],
  [-4, 6],
  [-4.5, 4.8],
]

function paintCard(c: CanvasRenderingContext2D, W: number, H: number) {
  c.fillStyle = '#fdf6e8'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#7fc4e8'
  c.fillRect(W * 0.06, H * 0.1, W * 0.34, H * 0.62)
  c.fillStyle = '#f2c230'
  c.beginPath()
  c.arc(W * 0.23, H * 0.32, W * 0.07, 0, PI * 2)
  c.fill()
  c.fillStyle = '#6fc27a'
  c.fillRect(W * 0.06, H * 0.52, W * 0.34, H * 0.2)
  c.fillStyle = '#6b6a66'
  for (let i = 0; i < 4; i++) c.fillRect(W * 0.48, H * (0.16 + i * 0.15), W * (0.42 - i * 0.06), H * 0.06)
  c.fillStyle = '#d8483f'
  c.fillRect(W * 0.06, H * 0.82, W * 0.88, H * 0.06)
}

function laminator(p: string[]) {
  const [body, cap, acc] = p
  const g = new THREE.Group()
  g.add(sideSlab(LM_SIDE, 32, body))
  // 端盖：同一轮廓放大一点，两端各一块
  const big = LM_SIDE.map(([z, y]): V2 => [z * 1.06, y * 1.06])
  for (const s of [-1, 1]) g.add(sideSlab(big, 1.4, cap, s * 16.5))
  // 顶上：进纸口、控制条（两只指示灯 + 一个拨杆）
  g.add(rbox(26, 0.4, 0.8, DARK, { y: 6.75, z: -1 }, 0.1))
  g.add(rbox(5, 0.4, 1.6, shade(body, -0.12), { x: 11, y: 6.7, z: 0.9 }, 0.15))
  g.add(lit(cyl(0.3, 0.3, 0.2, '#7dff9a', { x: 9.6, y: 7.1, z: 0.9 }, 10), '#7dff9a', 0.9))
  g.add(lit(cyl(0.3, 0.3, 0.2, acc, { x: 10.8, y: 7.1, z: 0.9 }, 10), acc, 0.9))
  g.add(rbox(1, 0.5, 0.6, '#e8e8e4', { x: 12.6, y: 7.05, z: 0.9 }, 0.15))
  // 前面的出纸口 + 吐出一半的塑封卡片（透亮的封膜边 + 印好的卡面）
  g.add(rbox(26, 0.5, 0.3, DARK, { y: 1.6, z: 4.55 }, 0.1))
  g.add(rbox(10, 0.2, 7.4, '#eef6f8', { y: 1.75, z: 5.9 }, 0.08))
  g.add(paintPanel(8.6, 5.6, 'dt-laminate-card', paintCard, { y: 2.01, z: 9.1, rx: -PI / 2 }))
  return fitGroup(g)
}

// ---------- 配色 ----------

/** [屏幕边框, 支臂, 点缀] */
const MA_PALS: Pal[] = [
  ['modern', [M.black, M.silver, '#7ab8ff']],
  ['modern', [M.char, M.black, M.gray]],
  ['nordic', [N.white, N.white, N.sage]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
/** [笔记本机身, 支架铝色, 点缀] */
const LS_PALS: Pal[] = [
  ['modern', [M.silver, '#9ea3aa', '#7ab8ff']],
  ['modern', ['#4a4c52', M.silver, '#9be7b5']],
  ['cute', [C.sakura, C.steel, C.pink]],
  ['nordic', [N.white, N.oak, N.sage]],
]
/** [充电板 / 支架, 手机 / 表壳, 点缀] */
const WC_PALS: Pal[] = [
  ['modern', [M.white, M.char, M.silver]],
  ['modern', [M.black, M.silver, M.gray]],
  ['cute', [C.sakura, C.white, C.pink]],
  ['nordic', [N.linen, N.blue, N.oak]],
]
/** [U 盘 A, U 盘 B, 收纳盒] */
const UB_PALS: Pal[] = [
  ['modern', [M.char, '#3f74c8', M.light]],
  ['cute', [C.pink, C.mint, C.white]],
  ['nordic', [N.sage, N.mustard, N.oak]],
  ['retro', [R.red, R.teal, R.cream]],
]
/** [机身, 充电座, 点缀] */
const WT_PALS: Pal[] = [
  ['modern', [M.black, M.char, '#ff8a3d']],
  ['modern', ['#f0b429', M.black, M.char]],
  ['cute', [C.sky, C.white, C.pink]],
  ['industrial', ['#4f5a3a', I.iron, I.rust]],
]
/** [外甲主色, 骨架灰, 点缀, 切割垫] */
const GB_PALS: Pal[] = [
  ['modern', ['#f4f4f2', '#8a8d93', '#3f74c8', '#3f7a5a']],
  ['modern', ['#4f6b3a', '#6b6e74', '#d8483f', '#2f5a6e']],
  ['retro', [R.red, '#8a8d93', R.mustard, '#3f7a5a']],
  ['cute', [C.white, C.steel, C.pink, '#5a8fa8']],
]
/** [钉板, 爱心主色, 珠盒, 熨斗] */
const PB_PALS: Pal[] = [
  ['cute', ['#dfeef6', '#ff5c7a', C.white, C.sky]],
  ['cute', ['#f6e6ee', '#7a5cff', C.sakura, C.mint]],
  ['modern', ['#e8e8e4', '#d8483f', M.white, M.char]],
  ['retro', [R.cream, R.orange, R.teal, R.mustard]],
]
/** [魔尺色 A, 魔尺色 B, 数独木板, 粗线] */
const MS_PALS: Pal[] = [
  ['cute', ['#3f8fe0', '#f6f6f2', C.wood, C.woodD]],
  ['modern', ['#d8483f', M.white, N.oak, M.char]],
  ['retro', [R.mustard, R.teal, R.caramel, '#5a3b2a']],
  ['japanese', [J.shu, J.washi, J.hinoki, J.dark]],
]
/** [台面 / 抽屉面, 柜体, 把手] */
const DS_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.oak]],
  ['modern', [M.walnut, M.char, M.silver]],
  ['japanese', [J.hinoki, J.wood, J.dark]],
  ['industrial', [I.walnut, I.iron, I.steel]],
  ['cute', [C.woodL, C.white, C.pink]],
]
/** [盒子, 笔 / 次色, 点缀] */
const DO_PALS: Pal[] = [
  ['nordic', [N.oak, N.sage, N.mustard]],
  ['modern', [M.white, M.char, '#3f74c8']],
  ['cute', [C.sakura, C.mint, C.pink]],
  ['industrial', [I.iron, I.leather, I.rust]],
]
/** [悬臂, 麦克风, 弹簧 / 点缀] */
const MI_PALS: Pal[] = [
  ['modern', [M.black, M.char, '#e8483f']],
  ['modern', [M.white, M.silver, M.gray]],
  ['cute', [C.white, C.sakura, C.pink]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
/** [按键面板, 调音台, 点缀] */
const SD_PALS: Pal[] = [
  ['modern', [M.black, M.char, '#a46bff']],
  ['modern', [M.white, M.light, '#4fe3ff']],
  ['cute', [C.sakura, C.white, C.pink]],
  ['industrial', [I.iron, I.steel, I.rust]],
]
/** [相框, 闹钟, 点缀] */
const EF_PALS: Pal[] = [
  ['nordic', [N.oak, N.white, N.sage]],
  ['modern', [M.char, M.white, M.silver]],
  ['japanese', [J.wood, J.washi, J.shu]],
  ['cute', [C.white, C.sakura, C.pink]],
]
/** [标签机, 标签带盒, 罐盖] */
const LB_PALS: Pal[] = [
  ['modern', [M.char, '#f2c230', M.white]],
  ['modern', [M.white, '#3f74c8', M.char]],
  ['cute', [C.pink, C.mint, C.white]],
  ['nordic', [N.gray, N.mustard, N.oak]],
]
/** [机身, 端盖, 指示灯] */
const LA_PALS: Pal[] = [
  ['modern', [M.white, M.char, '#ffb347']],
  ['modern', [M.char, M.black, '#ff5a4a']],
  ['cute', [C.white, C.sky, C.pink]],
  ['nordic', [N.linen, N.sage, N.mustard]],
]

export const DESK_TECH: AssetDef[] = [
  define('dt-monitor-arm', '支臂显示器', 'tabletop', [56, 43, 54], MA_PALS, monitorArm, {
    ...PROP,
    type: 'monitor',
    tags: ['hobby:tech'],
    mats: ['plastic', 'metal', 'plastic'],
    sizeLabel: '气弹簧夹桌',
    screens: [MA],
    surfaces: clipLevels([MA]),
  }),
  define('dt-laptop-stand', '笔记本支架', 'tabletop', [34, 26, 26], LS_PALS, laptopStand, { ...PROP, type: 'laptop', mats: ['metal', 'metal', 'plastic'] }),
  define('dt-wireless-charger', '无线充电组', 'tabletop', [22, 12, 13], WC_PALS, wirelessCharger, { ...PROP, type: 'electronics', mats: ['plastic', 'glass', 'plastic'] }),
  define('dt-usb-bits', 'U 盘与读卡器', 'tabletop', [13, 10, 3.4], UB_PALS, usbBits, { ...PROP, type: 'electronics', mats: ['plastic', 'plastic', 'plastic'] }),
  define('dt-walkie-talkie', '对讲机', 'tabletop', [15, 8, 19], WT_PALS, walkieTalkie, { ...PROP, type: 'electronics', mats: ['plastic', 'plastic', 'plastic'] }),
  define('dt-gunpla-bench', '模型拼装台', 'tabletop', [38, 28, 15.4], GB_PALS, gunplaBench, { ...PROP, type: 'model', tags: ['hobby:models'], mats: ['plastic', 'plastic', 'plastic', 'plastic'] }),
  define('dt-perler-beads', '拼豆板与熨斗', 'tabletop', [29, 18, 5.2], PB_PALS, perlerBeads, { ...PROP, type: 'craft-tool', tags: ['hobby:crafts'], mats: ['plastic', 'plastic', 'plastic', 'plastic'] }),
  define('dt-magic-snake', '魔尺与数独盘', 'tabletop', [24, 13, 10], MS_PALS, magicSnake, { ...PROP, type: 'puzzle', tags: ['hobby:puzzles'], mats: ['plastic', 'plastic', 'wood', 'wood'] }),
  define('dt-desk-shelf', '桌上增高书架', 'study', [DS.w, DS.d, DS.h], DS_PALS, deskShelf, {
    ...PROP,
    type: 'shelving',
    // 两端的抽屉能拉开（movable）
    openable: true,
    mats: ['wood', 'wood', 'metal'],
    surface: DS.h,
    surfaces: [{ y: DS.base, h: DS.h - DS.top - DS.base, shape: [rectPoly(-DS.w / 2 + DS.unit + 1, -DS.d / 2 + 1.6, DS.w / 2 - DS.unit - 1, DS.d / 2 - 1)] }, ...dsDrawers().map((o) => drawerLevel(o))],
  }),
  define('dt-desk-organizer', '桌面收纳盒', 'tabletop', [30, 16, 16], DO_PALS, deskOrganizer, { ...PROP, type: 'pen', mats: ['wood', 'plastic', 'plastic'] }),
  define('dt-mic-arm', '悬臂麦克风架', 'tabletop', [12, 62, 56], MI_PALS, micArm, { ...PROP, type: 'mic', tags: ['hobby:streaming'], mats: ['metal', 'metal', 'metal'] }),
  define('dt-stream-deck', '直播控制台', 'tabletop', [28, 11, 5.4], SD_PALS, streamDeck, { ...PROP, type: 'stream-gear', tags: ['hobby:streaming'], mats: ['plastic', 'plastic', 'plastic'] }),
  define('dt-e-ink-frame', '墨水屏相框与日出闹钟', 'tabletop', [23, 11, 17], EF_PALS, einkFrame, { ...PROP, type: 'clock', mats: ['wood', 'plastic', 'plastic'] }),
  define('dt-label-maker', '标签机与收纳罐', 'tabletop', [28, 17, 10], LB_PALS, labelMaker, { ...PROP, type: 'stationery', mats: ['plastic', 'plastic', 'plastic'] }),
  define('dt-laminator', '塑封机', 'tabletop', [34.5, 14.5, 7.6], LA_PALS, laminator, { ...PROP, type: 'office-machine', mats: ['plastic', 'plastic', 'plastic'] }),
]
