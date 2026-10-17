// 贴附物：冰箱贴、便签、照片、海报、贴纸。可以贴在冰箱门、柜门、墙等任何竖直表面上。
// 原点在背面中心，模型向 +z 伸出，y 方向上下居中（约定见 kit.ts 的 stick）。

import * as THREE from 'three'
import { ball, rbox } from '../toon'
import { C, S, paintPanel, paintLandscape, type AssetDef, type StyleTag } from '../kit'
import { noOutline } from '../geo'

/** 冰箱贴：小块 + 简单图案 */
function magnet(shape: 'strawberry' | 'lemon' | 'donut' | 'letter' | 'star') {
  return (p: string[]) => {
    const [main, sub] = p
    const g = new THREE.Group()
    if (shape === 'strawberry') {
      g.add(ball(2.6, main, { y: -0.4, z: 1.2 }, [1, 1.15, 0.45]))
      g.add(noOutline(rbox(3.6, 1.2, 0.6, C.leaf, { y: 1.6, z: 1.4 }, 0.25)))
      for (const [x, y] of [
        [-1, 0],
        [1, 0.2],
        [0, -1.2],
        [-0.6, -2],
      ])
        g.add(noOutline(ball(0.25, C.lemon, { x, y, z: 2.35 })))
    } else if (shape === 'lemon') {
      g.add(ball(2.8, main, { z: 1.12 }, [1.2, 0.85, 0.4]))
      g.add(noOutline(ball(0.6, C.leaf, { x: 3, y: 1, z: 1.2 }, [1.4, 0.7, 0.5])))
    } else if (shape === 'donut') {
      g.add(ball(2.8, C.peach, { z: 0.98 }, [1, 1, 0.35]))
      g.add(ball(2.4, main, { z: 1.25 }, [1, 1, 0.3]))
      g.add(noOutline(ball(0.8, '#ffffff', { z: 1.95 }, [1, 1, 0.3])))
    } else if (shape === 'letter') {
      g.add(rbox(4, 5, 1, main, { y: -2.5, z: 0.5 }, 0.4))
      g.add(noOutline(rbox(1.2, 3, 0.4, sub, { x: -0.6, y: -1.5, z: 1.15 }, 0.15)))
      g.add(noOutline(rbox(1.2, 1.2, 0.4, sub, { x: 0.6, y: -0.2, z: 1.15 }, 0.15)))
    } else {
      g.add(ball(2.6, main, { z: 0.91 }, [1, 1, 0.35]))
      g.add(noOutline(ball(1, sub, { z: 1.6 }, [1, 1, 0.3])))
    }
    return g
  }
}

/** 便签：一张小纸，画几行字；可选顶上一枚磁铁压着 */
function stickyNote(w: number, h: number, withMagnet: boolean) {
  return (p: string[]) => {
    const [paper, ink, mag] = p
    const g = new THREE.Group()
    g.add(
      paintPanel(
        w,
        h,
        `note-${paper}-${ink}-${w}x${h}`,
        (ctx, W, H) => {
          ctx.fillStyle = paper
          ctx.fillRect(0, 0, W, H)
          ctx.strokeStyle = ink
          ctx.lineWidth = Math.max(1, H * 0.02)
          for (let i = 0; i < 4; i++) {
            const y = H * (0.3 + i * 0.16)
            ctx.beginPath()
            ctx.moveTo(W * 0.12, y)
            ctx.lineTo(W * (0.88 - (i % 2) * 0.2), y)
            ctx.stroke()
          }
        },
        { y: -h / 2, z: 0.15 },
      ),
    )
    if (withMagnet) g.add(ball(1.4, mag, { y: h / 2 - 1.5, z: 0.8 }, [1, 1, 0.45]))
    return g
  }
}

/** 拍立得照片：白边 + 风景 + 一枚磁铁 */
function polaroid(p: string[]) {
  const [sky, hill, sun] = p
  const g = new THREE.Group()
  g.add(rbox(8.8, 10.7, 0.3, '#fbfbf8', { y: -5.35, z: 0.15 }, 0.1))
  g.add(paintPanel(7.6, 7.6, `pola-${sky}-${hill}-${sun}`, paintLandscape(sky, hill, sun), { y: -3.85, z: 0.32 }))
  g.add(ball(1, C.red, { y: 4.4, z: 0.75 }, [1, 1, 0.45]))
  return g
}

/** 儿童画：蜡笔画的小房子和小人，两枚磁铁压着 */
function kidsDrawing(p: string[]) {
  const [paper, crayon, sun] = p
  const g = new THREE.Group()
  g.add(
    paintPanel(
      21,
      15,
      `kid-${paper}-${crayon}-${sun}`,
      (ctx, W, H) => {
        ctx.fillStyle = paper
        ctx.fillRect(0, 0, W, H)
        ctx.lineWidth = Math.max(2, W * 0.015)
        ctx.lineCap = 'round'
        ctx.strokeStyle = sun
        ctx.beginPath()
        ctx.arc(W * 0.82, H * 0.2, H * 0.1, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = crayon
        ctx.strokeRect(W * 0.2, H * 0.48, W * 0.26, H * 0.34)
        ctx.beginPath()
        ctx.moveTo(W * 0.16, H * 0.5)
        ctx.lineTo(W * 0.33, H * 0.28)
        ctx.lineTo(W * 0.5, H * 0.5)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(W * 0.66, H * 0.5, H * 0.06, 0, Math.PI * 2)
        ctx.moveTo(W * 0.66, H * 0.56)
        ctx.lineTo(W * 0.66, H * 0.74)
        ctx.moveTo(W * 0.6, H * 0.63)
        ctx.lineTo(W * 0.72, H * 0.63)
        ctx.moveTo(W * 0.66, H * 0.74)
        ctx.lineTo(W * 0.61, H * 0.86)
        ctx.moveTo(W * 0.66, H * 0.74)
        ctx.lineTo(W * 0.71, H * 0.86)
        ctx.stroke()
        ctx.strokeStyle = '#78c47a'
        ctx.beginPath()
        ctx.moveTo(0, H * 0.84)
        ctx.lineTo(W, H * 0.84)
        ctx.stroke()
      },
      { y: -7.5, z: 0.12 },
    ),
  )
  for (const x of [-9, 9]) g.add(ball(0.9, C.lemon, { x, y: 6.4, z: 0.6 }, [1, 1, 0.45]))
  return g
}

/** 海报：大幅风景 / 几何，四角胶带 */
function poster(w: number, h: number, kind: 'landscape' | 'shapes') {
  return (p: string[]) => {
    const [a, b, c] = p
    const g = new THREE.Group()
    const draw =
      kind === 'landscape'
        ? paintLandscape(a, b, c)
        : (ctx: CanvasRenderingContext2D, W: number, H: number) => {
            ctx.fillStyle = a
            ctx.fillRect(0, 0, W, H)
            ctx.fillStyle = b
            ctx.beginPath()
            ctx.arc(W * 0.5, H * 0.38, W * 0.28, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = c
            ctx.fillRect(W * 0.18, H * 0.68, W * 0.64, H * 0.06)
            ctx.fillRect(W * 0.3, H * 0.78, W * 0.4, H * 0.03)
          }
    g.add(paintPanel(w, h, `poster-${kind}-${a}-${b}-${c}-${w}`, draw, { y: -h / 2, z: 0.12 }))
    for (const [x, y] of [
      [-w / 2 + 1.5, h / 2 - 1.5],
      [w / 2 - 1.5, h / 2 - 1.5],
      [-w / 2 + 1.5, -h / 2 + 1.5],
      [w / 2 - 1.5, -h / 2 + 1.5],
    ])
      g.add(noOutline(rbox(3, 1.2, 0.2, '#f3eee2', { x, y: y - 0.6, z: 0.25, rz: 0.6 }, 0.05)))
    return g
  }
}

/** 贴纸：爱心 / 星星形的薄片 */
function decal(shape: 'heart' | 'star') {
  return (p: string[]) => {
    const [main] = p
    const g = new THREE.Group()
    const m = paintPanel(
      6,
      6,
      `decal-${shape}-${main}`,
      (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = main
        ctx.beginPath()
        if (shape === 'heart') {
          const s = W / 2
          ctx.moveTo(s, H * 0.85)
          ctx.bezierCurveTo(-s * 0.2, H * 0.45, s * 0.4, -H * 0.05, s, H * 0.3)
          ctx.bezierCurveTo(W - s * 0.4, -H * 0.05, W + s * 0.2, H * 0.45, s, H * 0.85)
        } else {
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? W * 0.2 : W * 0.46
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2
            const x = W / 2 + Math.cos(a) * r
            const y = H / 2 + Math.sin(a) * r
            if (i) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
        }
        ctx.closePath()
        ctx.fill()
      },
      { y: -3, z: 0.08 },
    )
    const mat = m.material as THREE.MeshToonMaterial
    mat.transparent = true
    mat.alphaTest = 0.4
    g.add(m)
    return g
  }
}

const sty = (groups: Partial<Record<StyleTag, string[][]>>) => {
  const palettes: string[][] = []
  const paletteStyles: StyleTag[] = []
  for (const [k, ps] of Object.entries(groups) as [StyleTag, string[][]][])
    for (const p of ps) {
      palettes.push(p)
      paletteStyles.push(k)
    }
  return { palettes, paletteStyles, styles: Object.keys(groups) as StyleTag[] }
}
const { nordic: N, modern: M, retro: R, japanese: J, industrial: I } = S
const base = { category: 'deco' as const, stick: true, prop: true }

export const STICKERS: AssetDef[] = [
  { id: 'st-magnet-strawberry', name: '冰箱贴', family: 'fridge-magnet', sizeLabel: '草莓', w: 5.4, d: 2.5, h: 6.2, ...base, ...sty({ cute: [[C.red, C.leaf], [C.pink, C.leaf]] }), build: magnet('strawberry') },
  { id: 'st-magnet-lemon', name: '冰箱贴', family: 'fridge-magnet', sizeLabel: '柠檬', w: 7, d: 2.3, h: 5, ...base, ...sty({ cute: [[C.lemon, C.leaf]], retro: [[R.mustard, R.olive]] }), build: magnet('lemon') },
  { id: 'st-magnet-donut', name: '冰箱贴', family: 'fridge-magnet', sizeLabel: '甜甜圈', w: 5.6, d: 2.2, h: 5.6, ...base, ...sty({ cute: [[C.pink, C.white], [C.lilac, C.white]] }), build: magnet('donut') },
  { id: 'st-magnet-letter', name: '冰箱贴', family: 'fridge-magnet', sizeLabel: '字母', w: 4, d: 1.4, h: 5, ...base, ...sty({ cute: [[C.sky, C.white], [C.mint, C.white]], modern: [[M.char, M.white]], retro: [[R.teal, R.cream]] }), build: magnet('letter') },
  { id: 'st-magnet-star', name: '冰箱贴', family: 'fridge-magnet', sizeLabel: '星星', w: 5.2, d: 1.9, h: 5.2, ...base, ...sty({ cute: [[C.lemon, C.orange]], nordic: [[N.mustard, N.white]] }), build: magnet('star') },
  { id: 'st-note', name: '便签', family: 'sticky-note', sizeLabel: '小', w: 7.6, d: 0.5, h: 7.6, ...base, ...sty({ cute: [['#fff3a0', '#c9a24a', C.pink], [C.sakura, '#c4788c', C.sky]], nordic: [[N.linen, N.gray, N.sage]], modern: [['#ffffff', M.gray, M.char]] }), build: stickyNote(7.6, 7.6, false) },
  { id: 'st-note-magnet', name: '便签', family: 'sticky-note', sizeLabel: '购物清单', w: 10, d: 1.5, h: 14.5, ...base, ...sty({ cute: [['#fffdf5', '#c9a24a', C.red], ['#fff3a0', '#c9a24a', C.sky]], modern: [['#ffffff', M.gray, M.black]], japanese: [[J.washi, J.sumi, J.shu]] }), build: stickyNote(10, 14, true) },
  { id: 'st-polaroid', name: '拍立得照片', w: 8.8, d: 1.3, h: 11.7, ...base, ...sty({ cute: [[C.sky, C.leaf, C.lemon]], nordic: [[N.blue, N.sage, N.mustard]], retro: [[R.cream, R.olive, R.orange]] }), build: polaroid },
  { id: 'st-kids-drawing', name: '儿童画', w: 21, d: 1.1, h: 16, ...base, ...sty({ cute: [['#fffdf5', '#5b8def', C.orange], ['#fffdf5', C.red, C.lemon]] }), build: kidsDrawing },
  { id: 'st-poster', name: '海报', family: 'poster', sizeLabel: 'A2 风景', w: 42, d: 0.5, h: 59, ...base, prop: false, ...sty({ cute: [[C.sky, C.mint, C.lemon]], nordic: [[N.linen, N.sage, N.mustard]], retro: [[R.cream, R.teal, R.orange]], japanese: [[J.washi, J.ai, J.shu]] }), build: poster(42, 59, 'landscape') },
  { id: 'st-poster-shapes', name: '海报', family: 'poster', sizeLabel: 'A2 几何', w: 42, d: 0.5, h: 59, ...base, prop: false, ...sty({ modern: [[M.light, M.char, M.black]], nordic: [[N.white, N.mustard, N.gray]], retro: [[R.mustard, R.red, R.teal]], industrial: [[I.concrete, I.rust, I.iron]] }), build: poster(42, 59, 'shapes') },
  { id: 'st-decal-heart', name: '贴纸', family: 'decal', sizeLabel: '爱心', w: 6, d: 0.2, h: 6, ...base, ...sty({ cute: [[C.pink], [C.red]] }), build: decal('heart') },
  { id: 'st-decal-star', name: '贴纸', family: 'decal', sizeLabel: '星星', w: 6, d: 0.2, h: 6, ...base, ...sty({ cute: [[C.lemon], [C.sky]] }), build: decal('star') },
]
