// 临时素材预览页：?id=素材id&c=配色序号&dir=front|three|left&bg=色
import * as THREE from 'three'
import { ASSET_MAP } from '../three/assets'
import { furnitureModel } from '../three/house'
import { createStage, fitSun, frameCamera } from '../three/stage'
import { toon } from '../three/toon'

const q = new URLSearchParams(location.search)
const id = q.get('id') ?? 'va-vase-ribbon'
const color = Number(q.get('c') ?? 0)
const dirName = q.get('dir') ?? 'three'
const bg = q.get('bg')
if (bg) document.body.style.background = bg

const canvas = document.getElementById('c') as HTMLCanvasElement
const stage = createStage(canvas, { preserve: true })
stage.renderer.shadowMap.autoUpdate = false

const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.16 }))
ground.receiveShadow = true
stage.scene.add(ground)

const fill = new THREE.DirectionalLight('#ffffff', 0.35)
fill.position.set(-1, 1.2, 2)
stage.scene.add(fill)

const def = ASSET_MAP.get(id)
if (!def) throw new Error(`no asset ${id}`)
const m = furnitureModel({ id: 'preview', asset: id, x: 0, y: 0, rot: 0, color }, { closeUp: true })
stage.scene.add(m)

const box = new THREE.Box3().setFromObject(m)
fitSun(stage.sun, box)
const dir = (dirName === 'front' ? new THREE.Vector3(0, 0.2, 1) : dirName === 'left' ? new THREE.Vector3(-0.85, 0.45, 1) : new THREE.Vector3(0.85, 0.5, 1)).normalize()
const c = frameCamera(stage.camera, box, dir, 1.12)
stage.camera.near = Math.max(1, c.length() * 0.01)
stage.camera.updateProjectionMatrix()

function resize() {
  stage.resize(window.innerWidth, window.innerHeight)
}
resize()
window.addEventListener('resize', resize)

const white = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), toon('#ffffff'))
white.position.set(box.min.x - 10, 14, 0)
stage.scene.add(white)
if (q.has('nohl')) stage.scene.traverse((o) => { if (o.userData.isOutline) o.visible = false })
;(window as unknown as Record<string, unknown>).__dbg = { palette: def.palettes[color], mats: [] }

stage.render()
requestAnimationFrame(() => {
  stage.render()
  document.body.dataset.ready = '1'
  document.title = `${id} · ${def.w}×${def.d}×${def.h} · ${JSON.stringify(def.palettes[color])}`
})
