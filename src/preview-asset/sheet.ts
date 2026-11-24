// 素材拼图页（scripts/shot-sheet.mjs 用）：一页里把一批素材各渲染一格，拼成一张对照图，整库过一遍只要一百多张。
// 每格：大图是右前 3/4 视角，右上角小图是另一个视角（默认背面），格子下方写 序号 · id · 声明尺寸 · 三角面数。
//
// 选素材（三选一，都可再叠 cat=分类）：
//   ids=a,b,c            点名
//   match=<id 正则>       按 id 过滤
//   from=<下标>&n=<个数>  按素材库顺序分页（不给 n 就是到末尾）
// 其他：c=配色序号（超出该素材配色数的取 0）  cols=5  cell=300  dir=three  inset=back|none  open=1（可开合的打开）
import * as THREE from 'three'
import { ASSETS, type AssetDef } from '../three/assets'
import { furnitureModel } from '../three/house'
import { createStage, fitSun, frameCamera } from '../three/stage'
import { disposeUnshared } from '../three/toon'

/** 取景方向（和单件预览页一致） */
export const DIRS: Record<string, [number, number, number]> = {
  front: [0, 0.2, 1],
  three: [0.85, 0.5, 1],
  left: [-0.85, 0.45, 1],
  back: [0.85, 0.5, -1],
  side: [1, 0.2, 0],
  top: [0.15, 1, 0.35],
  low: [0.6, -0.35, 1],
}

const LABEL_H = 34

export function runSheet(q: URLSearchParams) {
  const cols = Number(q.get('cols') ?? 5)
  const cell = Number(q.get('cell') ?? 300)
  const color = Number(q.get('c') ?? 0)
  const dirName = q.get('dir') ?? 'three'
  const insetName = q.get('inset') ?? 'back'
  const open = q.has('open')
  const cat = q.get('cat')

  let list = ASSETS as AssetDef[]
  if (cat) list = list.filter((a) => a.category === cat)
  if (q.has('ids')) {
    const want = q.get('ids')!.split(',').filter(Boolean)
    const byId = new Map(list.map((a) => [a.id, a]))
    list = want.map((id) => byId.get(id)).filter((a): a is AssetDef => !!a)
  } else if (q.has('match')) {
    const re = new RegExp(q.get('match')!)
    list = list.filter((a) => re.test(a.id))
  }
  const total = list.length
  if (!q.has('ids')) {
    const from = Number(q.get('from') ?? 0)
    const n = q.has('n') ? Number(q.get('n')) : total
    list = list.slice(from, from + n)
  }

  const rows = Math.max(1, Math.ceil(list.length / cols))
  const W = cols * cell
  const H = rows * (cell + LABEL_H)

  const gl = document.getElementById('c') as HTMLCanvasElement
  gl.style.display = 'none'
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  out.style.cssText = `display:block;width:${W}px;height:${H}px`
  document.body.style.cssText = `margin:0;background:#f3efe8;width:${W}px;height:${H}px;overflow:hidden`
  document.body.append(out)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#f3efe8'
  ctx.fillRect(0, 0, W, H)

  const stage = createStage(gl, { preserve: true })
  stage.renderer.setPixelRatio(1)
  stage.renderer.shadowMap.autoUpdate = false
  const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.16 }))
  ground.receiveShadow = true
  stage.scene.add(ground)
  const fill = new THREE.DirectionalLight('#ffffff', 0.35)
  fill.position.set(-1, 1.2, 2)
  stage.scene.add(fill)

  // 大图占格子左下的 84%，小图在右上角：两者只在格子对角线上重叠一小块（取景按包围球，模型基本到不了那里）
  const insetSize = Math.round(cell * 0.36)
  const mainSize = insetName === 'none' ? cell : Math.round(cell * 0.84)
  const info: { id: string; tris: number; box: number[]; error?: string }[] = []

  const shoot = (box: THREE.Box3, dir: string, size: number, x: number, y: number) => {
    stage.resize(size, size)
    const c = frameCamera(stage.camera, box, new THREE.Vector3(...(DIRS[dir] ?? DIRS.three)).normalize(), 1.1)
    stage.camera.near = Math.max(1, c.length() * 0.01)
    stage.camera.updateProjectionMatrix()
    stage.renderer.shadowMap.needsUpdate = true
    stage.render()
    ctx.drawImage(gl, 0, 0, size, size, x, y, size, size)
  }

  list.forEach((def, i) => {
    const x = (i % cols) * cell
    const y = Math.floor(i / cols) * (cell + LABEL_H)
    let tris = 0
    let dims: number[] = []
    let error: string | undefined
    try {
      const c = Math.min(color, def.palettes.length - 1)
      const m = furnitureModel({ id: 'preview', asset: def.id, x: 0, y: 0, rot: 0, color: c, ...(open && def.openable ? { open: true } : {}) }, { closeUp: true })
      stage.scene.add(m)
      m.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(m)
      m.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || o.userData.isOutline) return
        const g = mesh.geometry
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      })
      const s = box.getSize(new THREE.Vector3())
      dims = [s.x, s.z, s.y, box.min.y].map((v) => Math.round(v * 10) / 10)
      fitSun(stage.sun, box)
      shoot(box, dirName, mainSize, x, y + cell - mainSize)
      if (insetName !== 'none') {
        const ix = x + cell - insetSize - 2
        shoot(box, insetName, insetSize, ix, y + 2)
        ctx.strokeStyle = '#cfc6b8'
        ctx.strokeRect(ix + 0.5, y + 2.5, insetSize - 1, insetSize - 1)
      }
      stage.scene.remove(m)
      disposeUnshared(m)
    } catch (e) {
      error = (e as Error).message
      ctx.fillStyle = '#c0392b'
      ctx.font = '13px sans-serif'
      ctx.fillText(`ERROR ${error.slice(0, 40)}`, x + 8, y + cell / 2)
    }
    info.push({ id: def.id, tris: Math.round(tris), box: dims, ...(error ? { error } : {}) })
    // 标签：序号 · id（粗体），第二行 名称 · 声明尺寸 · 面数
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y + cell, cell, LABEL_H)
    ctx.strokeStyle = '#d8d0c2'
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell + LABEL_H - 1)
    ctx.fillStyle = '#222'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(`${i + 1} · ${def.id}`, x + 6, y + cell + 14, cell - 12)
    ctx.fillStyle = '#666'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${def.name} · ${def.w}×${def.d}×${def.h}${def.mount !== undefined ? ` @${def.mount}` : ''} · ${Math.round(tris)}△`, x + 6, y + cell + 29, cell - 12)
  })

  ;(window as unknown as Record<string, unknown>).__sheet = { total, ids: list.map((a) => a.id), info, width: W, height: H }
  document.title = `sheet · ${list.length}/${total}`
  document.body.dataset.ready = '1'
}
