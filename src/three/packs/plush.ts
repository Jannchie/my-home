// 毛绒玩偶：能摆在床上、沙发上、架子上。大鲨鲨 / 小鲨鲨（趴着的长条鲨鱼）。

import * as THREE from 'three'
import { ball, toon } from '../toon'
import { C, type AssetDef, type StyleTag } from '../kit'

/** 身体轮廓：t 从尾（0）到鼻尖（1），半径占最粗处的比例 */
const PROFILE: [number, number][] = [
  [0, 0.1],
  [0.08, 0.2],
  [0.22, 0.42],
  [0.4, 0.74],
  [0.56, 0.95],
  [0.68, 1],
  [0.8, 0.93],
  [0.89, 0.76],
  [0.95, 0.5],
  [0.985, 0.24],
  [1, 0],
]

/** 沿 x 轴车削出来的流线身体（鼻尖朝 +x），截面是 h × w 的椭圆 */
function bodyGeo(L: number, h: number, w: number) {
  const curve = new THREE.SplineCurve(PROFILE.map(([t, r]) => new THREE.Vector2(r, t)))
  const pts = curve.getPoints(40).map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y * L - L / 2))
  const g = new THREE.LatheGeometry(pts, 36)
  g.rotateZ(-Math.PI / 2)
  g.scale(1, h / 2, w / 2)
  g.computeVertexNormals()
  return g
}

/** 平面轮廓挤出成带圆角的鳍 */
function finGeo(shape: THREE.Shape, thick: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.45, bevelSegments: 3, curveSegments: 14 })
  g.translate(0, 0, -thick / 2)
  return g
}

const mesh = (g: THREE.BufferGeometry, color: string) => new THREE.Mesh(g, toon(color))

/** 趴着的鲨鱼：头朝 +x。L 为全长；配色 [背, 肚, 眼] */
function shark(L: number) {
  return (p: string[]) => {
    const [back, belly, eye] = p
    const H = L * 0.21
    const W = L * 0.23
    const g = new THREE.Group()
    const geo = bodyGeo(L, H, W)
    const body = mesh(geo, back)
    body.position.y = H / 2
    // 白肚皮：同一条轮廓稍微压扁、往下挪，从下半边透出来，分界线是顺滑的曲线
    const tummy = mesh(geo, belly)
    tummy.scale.set(0.985, 0.86, 1.03)
    tummy.position.set(L * 0.008, H * 0.42, 0)
    g.add(body, tummy)
    const t = Math.max(0.6, L * 0.022)
    // 背鳍：前缘凸、后缘内凹，往后掠
    const ds = new THREE.Shape()
    ds.moveTo(-H * 0.32, 0)
    ds.quadraticCurveTo(-H * 0.1, H * 0.25, H * 0.12, H * 0.5)
    ds.quadraticCurveTo(H * 0.02, H * 0.2, H * 0.3, 0)
    ds.lineTo(-H * 0.32, 0)
    const dorsal = mesh(finGeo(ds, t), back)
    dorsal.rotation.y = Math.PI
    dorsal.position.set(L * 0.02, H * 0.9, 0)
    g.add(dorsal)
    // 尾鳍：竖着的新月形，上叶大下叶小
    const ts = new THREE.Shape()
    ts.moveTo(0, 0)
    ts.quadraticCurveTo(-H * 0.35, H * 0.35, -H * 0.62, H * 0.78)
    ts.quadraticCurveTo(-H * 0.3, H * 0.2, -H * 0.18, 0)
    ts.quadraticCurveTo(-H * 0.32, -H * 0.18, -H * 0.42, -H * 0.36)
    ts.quadraticCurveTo(-H * 0.12, -H * 0.2, 0, 0)
    const tail = mesh(finGeo(ts, t), back)
    tail.position.set(-L * 0.47, H * 0.45, 0)
    g.add(tail)
    // 胸鳍：两侧往后下方伸，平贴着床面
    for (const s of [-1, 1]) {
      const ps = new THREE.Shape()
      ps.moveTo(0, 0)
      ps.quadraticCurveTo(-H * 0.1, H * 0.42, -H * 0.55, H * 0.62)
      ps.quadraticCurveTo(-H * 0.4, H * 0.22, -H * 0.42, 0)
      ps.lineTo(0, 0)
      const fin = mesh(finGeo(ps, t * 0.8), back)
      fin.rotation.x = s * (Math.PI / 2 - 0.35)
      fin.position.set(L * 0.14, H * 0.2, s * W * 0.38)
      g.add(fin)
    }
    // 眼睛、小嘴
    // 眼睛贴在身体表面（t≈0.86 处截面半宽约 0.41W），小嘴在鼻尖下方
    for (const s of [-1, 1]) g.add(ball(Math.max(0.6, L * 0.012), eye, { x: L * 0.36, y: H * 0.6, z: s * W * 0.39 }, [0.7, 1, 0.6]))
    g.add(ball(1, eye, { x: L * 0.452, y: H * 0.3 }, [L * 0.003, L * 0.0025, W * 0.09]))
    // 尾鳍比鼻尖伸得远：整体挪一下让占地居中
    for (const c of g.children) c.position.x += L * 0.055
    return g
  }
}

const SHARK_PALS: [StyleTag, string[]][] = [
  ['nordic', ['#7f9bb0', '#f4f1ea', '#2f3134']],
  ['cute', [C.sky, C.white, '#3a3a40']],
  ['cute', ['#f4a9c0', C.white, '#3a3a40']],
  ['modern', ['#9aa1a8', '#f2f2f0', '#222326']],
  ['retro', ['#3f7f8a', '#f4e7c8', '#2f2a26']],
]

const sharkDef = (id: string, sizeLabel: string, L: number): AssetDef => ({
  id,
  name: '鲨鱼玩偶',
  family: 'plush-shark',
  sizeLabel,
  category: 'deco',
  w: Math.round(L * 1.11),
  d: Math.round(L * 0.44),
  h: Math.round(L * 0.31),
  prop: true,
  palettes: SHARK_PALS.map(([, p]) => p),
  paletteStyles: SHARK_PALS.map(([s]) => s),
  styles: [...new Set(SHARK_PALS.map(([s]) => s))],
  build: shark(L),
})

export const PLUSH: AssetDef[] = [sharkDef('plush-shark-l', '大鲨鲨', 90), sharkDef('plush-shark-s', '小鲨鲨', 50)]
