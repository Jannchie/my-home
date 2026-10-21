// 吸顶灯 / 吊灯 / 手元灯 / 阳台壁灯的模型和风格造型（lights.ts 的房间灯、packs/ceiling-lights.ts 的灯具素材共用）。
// 不依赖素材库（素材包要在加载时用它建模），单位厘米。

import * as THREE from 'three'
import type { StyleTag } from './kit'
import type { RoomLightSpec } from './lights'
import { addOutlines, ball, cup, cyl, rbox, toon, torus } from './toon'

/** 天花板高度（灯具按真实层高 240 放，和沙盘「墙高」滑杆无关） */
export const CEILING = 240

/** 发光部件的标记：post.ts 的夜间加亮跳过它们，由 lights.ts 按开关 / 色温控制 */
export const LAMP_GLOW = 'lampGlow'

/** 房间灯的发光材质和它的原色 */
export interface RigGlow {
  mat: THREE.MeshToonMaterial
  color: THREE.Color
}

// ---------- 吸顶灯 / 吊灯模型 ----------

/**
 * 按风格变化的主灯造型。flush 类贴着天花板（吸顶），其余吊在天花板下（吊灯、半吸顶）。
 *   hang：主灯（ceiling）时灯具底面离天花板多远；small：小房间（卫浴玄关）用时的距离（不给 = 不用在小房间）
 *   light：光源在灯具底面以上多高（放在灯罩 / 灯体里面）
 */
export type FixtureShape =
  | 'washi-square'
  | 'bamboo'
  | 'ph'
  | 'wood-ring'
  | 'led-disc'
  | 'led-line'
  | 'metal-dome'
  | 'cage'
  | 'milk-glass'
  | 'tiffany'
  | 'cloud'
  | 'star'
  | 'lattice'
  | 'palace'
  | 'chandelier'
  | 'crystal-flush'
  | 'wagon-wheel'
  | 'hex-lantern'
  | 'cylinder'

export const SHAPES: Record<FixtureShape, { hang: number; light: number; small?: number }> = {
  'washi-square': { hang: 9, light: 3.5, small: 7 },
  bamboo: { hang: 52, light: 9 },
  ph: { hang: 55, light: 6 },
  'wood-ring': { hang: 8, light: 3, small: 6 },
  'led-disc': { hang: 7, light: 1.5, small: 6 },
  'led-line': { hang: 40, light: 1.2 },
  'metal-dome': { hang: 55, light: 5 },
  cage: { hang: 30, light: 9, small: 24 },
  'milk-glass': { hang: 14, light: 6, small: 10 },
  tiffany: { hang: 55, light: 6 },
  cloud: { hang: 14, light: 6, small: 11 },
  star: { hang: 12, light: 2, small: 10 },
  lattice: { hang: 12, light: 5, small: 9 },
  palace: { hang: 58, light: 12 },
  chandelier: { hang: 62, light: 10 },
  'crystal-flush': { hang: 10, light: 4, small: 8 },
  'wagon-wheel': { hang: 58, light: 6 },
  'hex-lantern': { hang: 56, light: 11 },
  cylinder: { hang: 55, light: 6 },
}

/** 各风格的主灯 / 小房间灯 / 餐桌吊灯造型（同一风格有几款时按房间 id 固定挑一款） */
export const STYLE_SHAPES: Record<StyleTag, { ceiling: FixtureShape[]; small: FixtureShape; pendant: FixtureShape }> = {
  japanese: { ceiling: ['washi-square', 'bamboo'], small: 'washi-square', pendant: 'bamboo' },
  nordic: { ceiling: ['ph', 'wood-ring'], small: 'wood-ring', pendant: 'ph' },
  modern: { ceiling: ['led-disc', 'led-line'], small: 'led-disc', pendant: 'cylinder' },
  industrial: { ceiling: ['metal-dome', 'cage'], small: 'cage', pendant: 'metal-dome' },
  retro: { ceiling: ['milk-glass', 'tiffany'], small: 'milk-glass', pendant: 'tiffany' },
  cute: { ceiling: ['cloud', 'star'], small: 'cloud', pendant: 'cloud' },
  chinese: { ceiling: ['lattice', 'palace'], small: 'lattice', pendant: 'palace' },
  classic: { ceiling: ['chandelier', 'crystal-flush'], small: 'crystal-flush', pendant: 'chandelier' },
  farmhouse: { ceiling: ['wagon-wheel', 'hex-lantern'], small: 'cage', pendant: 'hex-lantern' },
}

export const hashStr = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 给房间灯套上风格造型：改 shape / style，吊下来的造型把灯具和光源一起往下移 */
export function styleSpec(s: RoomLightSpec, style: StyleTag | undefined, variant = hashStr(s.roomId)) {
  if (!style || !(s.kind === 'ceiling' || s.kind === 'small' || s.kind === 'pendant')) return
  const t = STYLE_SHAPES[style]
  const shape = s.kind === 'ceiling' ? t.ceiling[variant % t.ceiling.length] : s.kind === 'small' ? t.small : t.pendant
  const info = SHAPES[shape]
  s.style = style
  s.shape = shape
  if (s.kind !== 'pendant') s.fy = CEILING - (s.kind === 'small' ? info.small ?? info.hang : info.hang)
  s.h = Math.min(CEILING - 3, s.fy + info.light)
}

function glowMaterial(color: string) {
  const m = (toon(color) as THREE.MeshToonMaterial).clone()
  m.emissive = new THREE.Color(color)
  m.emissiveIntensity = 0.15
  m.userData[LAMP_GLOW] = true
  return m
}

const WARM_BULB = '#ffe6b0'
const PAPER = '#fbf3e2'
const BRASS = '#cfae63'
const IRON = '#3a3a3c'
const CRYSTAL = '#e6f3ff'

/** 沿控制点的细管 */
function tubeMesh(pts: [number, number, number][], r: number, color: string) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 6, false), toon(color))
  return m
}

/** 两端已知的细杆 */
function rodMesh(a: [number, number, number], b: [number, number, number], r: number, color: string) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const m = cyl(r, r, va.distanceTo(vb), color, {}, 6)
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
  return m
}

/** 水平圆环，y 为环心 */
const hRing = (r: number, t: number, color: string, y: number) => {
  const m = torus(r, t, color, { y })
  m.rotation.x = Math.PI / 2
  return m
}

/** 旋转体（灯罩），profile 为 [半径, 高] */
function latheMesh(profile: [number, number][], mat: THREE.Material, y = 0, seg = 28) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(0.001, r), h)), seg), mat)
  m.position.y = y
  return m
}

/** 吊线 + 吸顶座：从 y0 到天花板（top） */
function cord(g: THREE.Group, y0: number, top: number, color = IRON, canopy = 5) {
  if (top - y0 > 2) g.add(cyl(0.45, 0.45, top - y0 - 1.6, color, { y: y0 }, 6))
  g.add(cyl(canopy, canopy, 1.6, color, { y: top - 1.6 }, 20))
}

/**
 * 灯具模型：局部原点在灯具底面中心（吊灯在灯罩下沿）；glows 是要随开关变亮的材质（各自的原色）。
 * top = 天花板离原点多高（吸线、吸顶座画到这里）。
 */
export function fixtureModel(s: RoomLightSpec): { obj: THREE.Group; glows: RigGlow[] } {
  const g = new THREE.Group()
  const glows: RigGlow[] = []
  const glow = (color: string) => {
    const m = glowMaterial(color)
    glows.push({ mat: m, color: new THREE.Color(color) })
    return m
  }
  const lit = <T extends THREE.Mesh>(m: T, mat: THREE.Material, outline = true): T => {
    m.material = mat
    if (!outline) m.userData.noOutline = true
    return m
  }
  const top = CEILING - s.fy
  const small = s.kind === 'small'
  const S = small ? 13 : s.kind === 'pendant' ? 19 : 24
  const rim = '#e9e4da'
  switch (s.shape) {
    case 'washi-square': {
      // 方形和纸吸顶：原木框 + 和纸面板 + 底面组子格
      const w = S * 1.9
      const h = top - 1.6
      const wood = '#b88a5a'
      g.add(lit(rbox(w - 1.6, h, w - 1.6, PAPER, {}, 0.4), glow(PAPER)))
      for (const sz of [-1, 1]) {
        g.add(rbox(w, 1.8, 1.8, wood, { z: (sz * (w - 1.8)) / 2 }, 0.4))
        g.add(rbox(1.8, 1.8, w - 3.6, wood, { x: (sz * (w - 1.8)) / 2 }, 0.4))
      }
      for (let i = 1; i < 4; i++) {
        const p = -w / 2 + (w * i) / 4
        g.add(rbox(w - 3, 0.6, 0.6, wood, { y: -0.35, z: p }, 0.2))
        g.add(rbox(0.6, 0.6, w - 3, wood, { x: p, y: -0.35 }, 0.2))
      }
      g.add(rbox(w * 0.4, 1.6, w * 0.4, wood, { y: top - 1.6 }, 0.4))
      break
    }
    case 'lattice': {
      // 新中式方形木格吸顶：深色木框、绢纱发光、底面回纹 + 四角红流苏
      const w = S * 1.9
      const h = Math.max(4, top - 3.2)
      const wood = '#5a3b2a'
      g.add(lit(rbox(w - 2, h, w - 2, '#f6ecd8', { y: 0.4 }, 0.4), glow('#f6ecd8')))
      for (const y of [0, h]) {
        for (const sz of [-1, 1]) {
          g.add(rbox(w + 1, 2.2, 2.2, wood, { y, z: (sz * (w - 1.2)) / 2 }, 0.5))
          g.add(rbox(2.2, 2.2, w - 3.2, wood, { x: (sz * (w - 1.2)) / 2, y }, 0.5))
        }
      }
      for (const k of [0.62, 0.32]) {
        const ww = w * k
        for (const sz of [-1, 1]) {
          g.add(rbox(ww, 0.8, 0.8, wood, { y: -0.5, z: (sz * ww) / 2 }, 0.2))
          g.add(rbox(0.8, 0.8, ww, wood, { x: (sz * ww) / 2, y: -0.5 }, 0.2))
        }
      }
      if (!small)
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            g.add(cyl(0.25, 0.25, 3, '#b8352b', { x: sx * (w / 2 + 0.2), y: -3, z: sz * (w / 2 + 0.2) }, 4))
            g.add(cyl(0.6, 1.3, 6, '#b8352b', { x: sx * (w / 2 + 0.2), y: -9, z: sz * (w / 2 + 0.2) }, 8))
          }
      break
    }
    case 'wood-ring': {
      // 北欧木圈吸顶：乳白灯罩外围一圈原木
      const dome = cyl(S * 0.86, S * 0.92, Math.min(top - 2, S * 0.26), '#fff6e6', {}, 36)
      g.add(lit(dome, glow('#fff6e6')))
      g.add(hRing(S * 0.98, S * 0.09, '#d9b98c', S * 0.12))
      g.add(cyl(S * 0.5, S * 0.5, 2, '#d9b98c', { y: top - 2 }, 28))
      break
    }
    case 'led-disc': {
      // 现代圆盘 LED：很薄的发光圆盘 + 一圈金属边
      g.add(lit(cyl(S * 1.02, S * 1.02, 2.4, '#fbfaf6', {}, 48), glow('#fbfaf6')))
      g.add(hRing(S * 1.03, 0.6, '#c3c7cc', 1.2))
      g.add(cyl(S * 0.4, S * 0.4, top - 2.4, '#e8e8e6', { y: 2.4 }, 24))
      break
    }
    case 'led-line': {
      // 现代线条灯：长条铝壳，底面发光，两根吊线
      const L = S * 3.4
      g.add(rbox(L, 3, 5, '#3d3f44', { y: 0.6 }, 0.6))
      g.add(lit(rbox(L - 1.4, 0.8, 3.6, '#fbfaf6', {}, 0.3), glow('#fbfaf6'), false))
      for (const sx of [-1, 1]) {
        g.add(cyl(0.18, 0.18, top - 3.6, '#8a8d93', { x: sx * L * 0.38, y: 3.6 }, 4))
        g.add(cyl(2.2, 2.2, 1, '#3d3f44', { x: sx * L * 0.38, y: top - 1 }, 12))
      }
      break
    }
    case 'cylinder': {
      // 现代筒形吊灯：哑光金属筒，下口里面发光
      g.add(cup(S * 0.5, S * 0.5, S * 0.9, 0.6, '#3d3f44', { rx: Math.PI, y: S * 0.9 }))
      g.add(lit(cyl(S * 0.46, S * 0.46, 0.4, '#fff3dc', { y: S * 0.3 }, 28), glow('#fff3dc'), false))
      g.add(lit(ball(3, WARM_BULB, { y: S * 0.42 }), glow(WARM_BULB), false))
      cord(g, S * 0.9, top, '#3d3f44', 4)
      break
    }
    case 'ph': {
      // PH 三层罩吊灯
      const k = S / 22
      const domeAt = (r: number, h: number, yTop: number, rTop: number) => {
        const m = cup(r * k, rTop * k, h * k, 0.7, '#f7f5f0')
        m.rotation.x = Math.PI
        m.position.y = yTop * k
        return lit(m, glow('#f7f5f0'))
      }
      g.add(domeAt(22, 9, 22, 6))
      g.add(domeAt(16, 7, 13.5, 9))
      g.add(domeAt(10.5, 5, 6.5, 7))
      g.add(lit(ball(3.4 * k, WARM_BULB, { y: 7 * k }), glow(WARM_BULB), false))
      cord(g, 22 * k, top, '#8a8d93', 4)
      break
    }
    case 'bamboo': {
      // 竹编吊灯：发光的和纸内罩 + 竹篾弧条与箍
      const R = S * 0.95
      const H = R * 0.9
      const bamboo = '#c99a5b'
      const prof: [number, number][] = [
        [R * 0.82, 0],
        [R, H * 0.3],
        [R * 0.92, H * 0.65],
        [R * 0.55, H * 0.92],
        [R * 0.18, H],
      ]
      const inner = glow('#f6ecd6')
      ;(inner as THREE.MeshToonMaterial).side = THREE.DoubleSide
      g.add(latheMesh(prof, inner))
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const pts = prof.map(([r, y]): [number, number, number] => [Math.sin(a) * (r + 0.5), y, Math.cos(a) * (r + 0.5)])
        g.add(tubeMesh(pts, 0.3, bamboo))
      }
      g.add(hRing(R * 0.82 + 0.4, 0.5, bamboo, 0))
      g.add(hRing(R + 0.6, 0.4, bamboo, H * 0.3))
      g.add(hRing(R * 0.92 + 0.6, 0.4, bamboo, H * 0.65))
      g.add(lit(ball(3, WARM_BULB, { y: H * 0.45 }), glow(WARM_BULB), false))
      cord(g, H, top, '#6e4f37', 3.5)
      break
    }
    case 'metal-dome': {
      // 工业金属罩吊灯：深色金属斗罩，罩里一圈亮
      const R = S * 0.85
      const shade = cup(R, R * 0.22, R * 0.75, 0.7, IRON)
      shade.rotation.x = Math.PI
      shade.position.y = R * 0.75
      g.add(shade)
      g.add(lit(cyl(R * 0.94, R * 0.94, 0.3, '#ffeccc', { y: 0.6 }, 28), glow('#ffeccc'), false))
      g.add(lit(ball(3.4, WARM_BULB, { y: R * 0.3 }, [1, 1.3, 1]), glow(WARM_BULB), false))
      g.add(cyl(2.4, 2.4, 3, '#c46a3a', { y: R * 0.75 }, 12))
      cord(g, R * 0.75 + 3, top, IRON, 4)
      break
    }
    case 'cage': {
      // 铁笼半吸顶：吸顶盘 + 短杆 + 铁丝笼 + 爱迪生灯泡
      const R = small ? 7 : 10
      const H = small ? 15 : 20
      const cy = H / 2
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const pts: [number, number, number][] = []
        for (let j = 0; j <= 6; j++) {
          const t = -1 + (2 * j) / 6
          const r = R * Math.sqrt(1 - 0.7 * t * t)
          pts.push([Math.sin(a) * r, cy + (t * H) / 2, Math.cos(a) * r])
        }
        g.add(tubeMesh(pts, 0.3, IRON))
      }
      g.add(hRing(R, 0.35, IRON, cy))
      g.add(lit(ball(R * 0.42, WARM_BULB, { y: cy }, [1, 1.35, 1]), glow(WARM_BULB), false))
      g.add(cyl(1.8, 1.8, 3, '#c9a25a', { y: H - 0.5 }, 12))
      g.add(cyl(0.8, 0.8, Math.max(0.5, top - H - 2.5), IRON, { y: H + 2.5 }, 8))
      g.add(cyl(6, 6, 1.6, IRON, { y: top - 1.6 }, 20))
      break
    }
    case 'milk-glass': {
      // 复古乳白玻璃罩：黄铜底盘 + 半球乳白罩 + 底部小铜钮
      const R = S * 0.82
      const H = top - 2
      g.add(latheMesh([[0.001, 0], [R * 0.45, H * 0.05], [R * 0.85, H * 0.3], [R, H * 0.7], [R, H], [0.001, H]], glow('#f7efdc')))
      g.add(hRing(R + 0.2, 0.6, BRASS, H))
      // 吸顶座小一点：从上往下看主要是发光的罩子
      g.add(cyl(R * 0.32, R * 0.32, 2, BRASS, { y: H }, 28))
      g.add(ball(1.4, BRASS, { y: -0.6 }))
      break
    }
    case 'tiffany': {
      // 蒂芙尼彩玻璃吊灯：锥形罩，几种颜色的玻璃片，片间铅条
      const R = S * 0.95
      const H = R * 0.6
      const colors = ['#e8a83c', '#5aa47a', '#c8473a', '#f0c35a']
      const n = 16
      for (let i = 0; i < n; i++) {
        const mat = glow(colors[i % colors.length])
        mat.side = THREE.DoubleSide
        const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.3, R, H, 3, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n), mat)
        m.position.y = H / 2
        g.add(m)
        const a = (i / n) * Math.PI * 2
        g.add(rodMesh([Math.sin(a) * R, 0, Math.cos(a) * R], [Math.sin(a) * R * 0.3, H, Math.cos(a) * R * 0.3], 0.3, '#5a4a3a'))
      }
      g.add(hRing(R, 0.5, '#5a4a3a', 0))
      g.add(hRing(R * 0.65, 0.3, '#5a4a3a', H / 2))
      g.add(lit(ball(3, WARM_BULB, { y: H * 0.4 }), glow(WARM_BULB), false))
      cord(g, H, top, '#5a4a3a', 4)
      break
    }
    case 'cloud': {
      // 云朵灯：几团压扁的发光球
      const m = glow('#fdfcf8')
      const r = S / 4.2
      const parts: [number, number, number, number][] = [
        [-S * 0.55, 0, 0, 1],
        [-S * 0.2, r * 0.3, S * 0.18, 1.25],
        [S * 0.22, r * 0.25, -S * 0.12, 1.35],
        [S * 0.58, 0, S * 0.05, 1.05],
        [0, -r * 0.1, -S * 0.3, 1.1],
        [0.05, 0, S * 0.32, 1],
      ]
      for (const [x, y, z, k] of parts) g.add(lit(ball(r * k, '#fdfcf8', { x, y: y + r * k * 0.7, z }, [1, 0.7, 1]), m))
      g.add(cyl(0.4, 0.4, Math.max(0.5, top - r * 1.6), '#e8e4dc', { y: r * 1.6 }, 6))
      g.add(cyl(4, 4, 1.4, '#f4f0ea', { y: top - 1.4 }, 16))
      break
    }
    case 'star': {
      // 星星吸顶灯：一颗平放、朝下发光的星星
      const R0 = S * 1.1
      const sh = new THREE.Shape()
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? R0 * 0.5 : R0
        if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2 })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, 0.8, 0)
      g.add(new THREE.Mesh(geo, glow('#fff1b8')))
      g.add(cyl(R0 * 0.25, R0 * 0.25, top - 4, '#fbf7f1', { y: 4 }, 20))
      break
    }
    case 'palace': {
      // 新中式六角宫灯：木檐、绢纱灯身、六根立柱、檐角挂流苏
      const R = S * 0.62
      const H = R * 1.5
      const wood = '#6b3a2a'
      g.add(cyl(R * 0.5, R * 1.05, 3, wood, {}, 6))
      g.add(lit(cyl(R, R, H, '#f6e4c4', { y: 3 }, 6), glow('#f6e4c4')))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        g.add(cyl(0.7, 0.7, H, wood, { x: Math.sin(a) * R * 1.03, y: 3, z: Math.cos(a) * R * 1.03 }, 6))
        const ex = Math.sin(a) * R * 1.45
        const ez = Math.cos(a) * R * 1.45
        g.add(rodMesh([Math.sin(a) * R, H + 4, Math.cos(a) * R], [ex, H + 6, ez], 0.5, wood))
        g.add(cyl(0.6, 1.1, 4, '#b8352b', { x: ex, y: H + 1.6, z: ez }, 6))
      }
      g.add(cyl(R * 1.08, R * 1.08, 1.6, wood, { y: H + 3 }, 6))
      g.add(cyl(R * 0.35, R * 1.08, 3, wood, { y: H + 4.6 }, 6))
      g.add(cyl(0.6, 1.2, 6, '#b8352b', { y: -6 }, 8))
      cord(g, H + 7.6, top, wood, 4)
      break
    }
    case 'chandelier': {
      // 水晶吊灯：黄铜中柱、一圈 S 形烛臂、烛焰灯泡、挂一圈水晶坠
      const R = S * 1.05
      const crystal = toon(CRYSTAL, { transparent: 0.6 })
      g.add(latheMesh([[0.001, 0], [2.6, 1], [3.4, 5], [1.6, 9], [2.2, 14], [1, 20]], toon(BRASS), -2))
      const flame = glow('#ffe6b0')
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const ax = Math.sin(a)
        const az = Math.cos(a)
        g.add(tubeMesh([[ax * 2, 2, az * 2], [ax * R * 0.5, -0.5, az * R * 0.5], [ax * R * 0.95, 2, az * R * 0.95], [ax * R, 5, az * R]], 0.55, BRASS))
        g.add(cyl(2, 1.4, 1.4, BRASS, { x: ax * R, y: 5, z: az * R }, 12))
        g.add(cyl(1, 1, 4.5, '#f4ede0', { x: ax * R, y: 6.4, z: az * R }, 10))
        g.add(lit(ball(0.9, '#ffe6b0', { x: ax * R, y: 11.8, z: az * R }, [1, 1.7, 1]), flame, false))
        const d = ball(0.7, CRYSTAL, { x: Math.sin(a + 0.52) * R * 0.75, y: -1.8, z: Math.cos(a + 0.52) * R * 0.75 }, [1, 1.8, 1])
        d.material = crystal
        g.add(d)
      }
      const d0 = ball(1.4, CRYSTAL, { y: -3.6 }, [1, 1.6, 1])
      d0.material = crystal
      g.add(d0)
      g.add(hRing(R * 0.45, 0.35, BRASS, 8))
      cord(g, 18, top, BRASS, 4)
      break
    }
    case 'crystal-flush': {
      // 古典水晶吸顶：乳白圆罩 + 金边 + 一圈水晶坠
      const R = S * 0.85
      const H = Math.max(3, top - 3)
      g.add(lit(cyl(R * 0.82, R * 0.9, H, '#fbf3e6', { y: 1.4 }, 32), glow('#fbf3e6')))
      g.add(hRing(R * 0.92, 0.6, BRASS, 1.4))
      g.add(hRing(R * 0.84, 0.5, BRASS, H + 1.4))
      g.add(cyl(R * 0.3, R * 0.3, 1.6, BRASS, { y: H + 1.4 }, 24))
      const crystal = toon(CRYSTAL, { transparent: 0.6 })
      const n = small ? 8 : 14
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2
        const d = ball(small ? 0.5 : 0.8, CRYSTAL, { x: Math.sin(a) * R * 0.92, y: -0.4, z: Math.cos(a) * R * 0.92 }, [1, 1.8, 1])
        d.material = crystal
        g.add(d)
      }
      g.add(ball(1.2, BRASS, { y: 0.8 }))
      break
    }
    case 'wagon-wheel': {
      // 乡村铁艺马车轮吊灯：水平铁圈 + 辐条 + 圈上一圈烛泡，四根吊链
      const R = S * 1.25
      g.add(hRing(R, 0.9, IRON, 0))
      g.add(hRing(R * 0.25, 0.7, IRON, 0))
      const flame = glow('#ffe6b0')
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        g.add(rodMesh([Math.sin(a) * R * 0.25, 0, Math.cos(a) * R * 0.25], [Math.sin(a) * R, 0, Math.cos(a) * R], 0.5, IRON))
        if (k % 2 === 0) {
          const x = Math.sin(a + 0.39) * R
          const z = Math.cos(a + 0.39) * R
          g.add(cyl(1.6, 1.2, 1.2, IRON, { x, y: 0.6, z }, 10))
          g.add(cyl(0.9, 0.9, 4, '#efe6d4', { x, y: 1.8, z }, 8))
          g.add(lit(ball(0.9, '#ffe6b0', { x, y: 6.8, z }, [1, 1.7, 1]), flame, false))
        }
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 8
        g.add(rodMesh([Math.sin(a) * R * 0.97, 0.5, Math.cos(a) * R * 0.97], [0, 22, 0], 0.25, IRON))
      }
      g.add(ball(1.4, IRON, { y: 22 }))
      g.add(lit(ball(2.4, WARM_BULB, { y: 4 }), glow(WARM_BULB), false))
      cord(g, 22, top, IRON, 4)
      break
    }
    case 'hex-lantern': {
      // 乡村六角罩吊灯：铁框六角灯笼，玻璃发光，尖顶
      const R = S * 0.58
      const H = R * 1.7
      g.add(cyl(R * 1.05, R * 0.6, 2, IRON, {}, 6))
      g.add(lit(cyl(R, R * 0.92, H, '#fff0c8', { y: 2 }, 6), glow('#fff0c8')))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        g.add(rodMesh([Math.sin(a) * R * 0.95, 2, Math.cos(a) * R * 0.95], [Math.sin(a) * R * 1.03, H + 2, Math.cos(a) * R * 1.03], 0.45, IRON))
      }
      g.add(cyl(R * 0.3, R * 1.2, R * 0.6, IRON, { y: H + 2 }, 6))
      g.add(torus(2, 0.4, IRON, { y: H + 2 + R * 0.6 + 2 }))
      cord(g, H + 2 + R * 0.6 + 4, top, IRON, 4)
      break
    }
    default: {
      if (s.kind === 'ceiling' || s.kind === 'small') {
        const r = s.kind === 'ceiling' ? 24 : 13
        const dome = cyl(r * 0.92, r, r * 0.26, '#fff6e6')
        dome.material = glow('#fff6e6')
        g.add(dome)
        g.add(cyl(r * 0.55, r * 0.55, 2, rim, { y: r * 0.26 }))
      } else if (s.kind === 'pendant') {
        const m = glow('#fff6e6')
        g.add(cyl(0.5, 0.5, top - 16, '#3d3f44', { y: 16 }))
        g.add(cyl(5, 5, 1.6, '#3d3f44', { y: top - 1.6 }))
        // 灯罩：上小下大的圆台，开口朝下；灯泡露出一点
        // 布灯罩：夜里从里面透出光（和灯泡共用发光材质）
        g.add(lit(cyl(5, 19, 16, '#f2e6cf', {}, 28), m))
        g.add(lit(ball(5.5, '#fff3dc', { y: 2 }), m))
        // 灯罩内侧（下面看上去是亮的）
        g.add(lit(cyl(4, 17.5, 0.6, '#fff3dc', { y: 0.2 }, 28), m, false))
      } else if (s.kind === 'counter') {
        const L = s.len ?? 90
        g.add(lit(rbox(L, 3, 9, '#fff6e6', {}, 1.2), glow('#fff6e6')))
        g.add(rbox(L + 2, 1.5, 11, rim, { y: 3 }, 0.6))
      } else {
        // 阳台壁灯：贴墙的底座 + 方形灯罩
        g.add(rbox(10, 16, 3, '#3d3f44', { z: -8 }, 1))
        g.add(lit(rbox(11, 13, 11, '#fff6e6', { y: 1.5, z: 0 }, 2), glow('#fff6e6')))
        g.add(rbox(13, 2, 13, '#3d3f44', { y: 14.5, z: 0 }, 0.8))
      }
    }
  }
  addOutlines(g)
  g.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
    // 共享的 toon 材质换成灯具专用的一份：同一个材质被接收阴影、不接收阴影的网格交替使用时，
    // three 每画一次都要重新查一遍着色器程序（漫游时每帧上千次），这里的网格都不接收阴影，单独一份就不来回切了
    const m = o as THREE.Mesh
    if (m.isMesh && !Array.isArray(m.material) && !m.userData.isOutline) m.material = fixtureMat(m.material)
  })
  return { obj: g, glows }
}

/** 灯具用的材质副本（按原材质缓存，所有灯具共用）；自己发光的部件（glow）本来就是独立材质，不换 */
const fixtureMats = new WeakMap<THREE.Material, THREE.Material>()
function fixtureMat(src: THREE.Material) {
  if (src.userData[LAMP_GLOW]) return src
  let m = fixtureMats.get(src)
  if (!m) {
    m = src.clone()
    m.onBeforeCompile = src.onBeforeCompile
    m.customProgramCacheKey = src.customProgramCacheKey
    fixtureMats.set(src, m)
  }
  return m
}
