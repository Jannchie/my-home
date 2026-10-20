// 渲染舞台：渲染器、暖色灯光、相机取景。沙盘、素材预览、缩略图共用。

import * as THREE from 'three'
import { outlineUniforms, setMaxAnisotropy } from './toon'
import { beginReflectFrame, prerenderReflections } from './reflectFrame'

export interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  /** 后处理接管：设置后 render / resize 交给它（见 post.ts），为 null 时直接 renderer.render */
  post: PostHook | null
  /** 描边宽度倍数（漫画等画面效果会加粗） */
  outlineScale: number
  render: () => void
  resize: (w: number, h: number) => void
  dispose: () => void
}

export interface PostHook {
  render: () => void
  resize: (w: number, h: number) => void
}

/**
 * 阴影边缘的模糊半径（阴影贴图像素）。两档都是 4：省电画质的贴图分辨率减半，边缘在世界里宽一倍，正好掩盖锯齿；
 * 高画质下两层户建约 3–4cm，柔和但不糊（toon.ts 会把过渡再收紧成干净的两档）。
 */
export const SHADOW_RADIUS = 4

/**
 * low：省电画质（手机 / 低性能设备，见 src/ui/device.ts）——不开 MSAA、阴影贴图 1024。
 * 阴影两档都用 PCFShadowMap（three r180 起 PCFSoftShadowMap 已移除，设了也会退回 PCF 并打警告）：
 * r186 的 PCF 按 shadow.radius 在圆盘上取样，toon.ts 又把采样改成固定分布 + 收成干净的两档，边缘柔和不起颗粒。
 * VSM 不用：它要把接收阴影的网格也画进阴影贴图（这里 draw call 是瓶颈），漏光也更明显。
 * 像素比上限两档都是 2：手机屏幕像素比多为 3，限到 1.5 等于半分辨率再拉伸，画面发虚；沙盘只在变化时重画，多出的像素可以接受。
 */
export function createStage(canvas: HTMLCanvasElement, opts: { preserve?: boolean; shadowSize?: number; low?: boolean } = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.low, alpha: true, preserveDrawingBuffer: !!opts.preserve })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  setMaxAnisotropy(opts.low ? 4 : Math.min(16, renderer.capabilities.getMaxAnisotropy()))
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  // 世界矩阵每帧在 render 开头更新一次：一帧里有主画面、法线、倒影好几次 renderer.render，默认每次都把整棵场景树重算一遍
  scene.matrixWorldAutoUpdate = false
  const camera = new THREE.PerspectiveCamera(30, 1, 5, 20000)

  // 天光：上方偏暖白、下方是中性米色（底色不能带彩色，否则会渗进墙脚、缝隙里）
  const hemi = new THREE.HemisphereLight('#fff6e8', '#e8dfd2', 1.5)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff3df', 2.0)
  sun.castShadow = true
  const shadow = opts.shadowSize ?? (opts.low ? 1024 : 2048)
  sun.shadow.mapSize.set(shadow, shadow)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.6
  sun.shadow.radius = SHADOW_RADIUS
  scene.add(sun)
  scene.add(sun.target)

  const stage: Stage = {
    renderer,
    scene,
    camera,
    sun,
    hemi,
    post: null,
    outlineScale: 1,
    render() {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2())
      outlineUniforms.uViewport.value.copy(size)
      outlineUniforms.uWidth.value = 1.25 * renderer.getPixelRatio() * stage.outlineScale
      beginReflectFrame()
      scene.updateMatrixWorld()
      if (stage.post) stage.post.render()
      else {
        prerenderReflections(renderer, scene, camera)
        renderer.render(scene, camera)
      }
    },
    resize(w, h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
      stage.post?.resize(w, h)
    },
    dispose() {
      renderer.dispose()
    },
  }
  return stage
}

/** 运行中切换画质：像素比、阴影贴图尺寸（画布本身的 MSAA 建好后改不了，由后处理的 FXAA 兜底） */
export function setStageQuality(stage: Stage, low: boolean) {
  const { renderer, sun } = stage
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  setMaxAnisotropy(low ? 4 : Math.min(16, renderer.capabilities.getMaxAnisotropy()))
  const size = low ? 1024 : 2048
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size)
    sun.shadow.map?.dispose()
    sun.shadow.map = null
  }
  renderer.shadowMap.needsUpdate = true
  const s = renderer.getSize(new THREE.Vector2())
  stage.resize(s.x, s.y)
}

/** 默认的太阳方向（指向光源）：左后上方 */
const DEFAULT_SUN_DIR = new THREE.Vector3(-0.55, 1.4, -0.9).normalize()

/** 让太阳的阴影相机罩住整个物体；dir 是指向光源的方向（3D 沙盘按时间与朝向算出，见 sky.ts） */
export function fitSun(sun: THREE.DirectionalLight, box: THREE.Box3, dir: THREE.Vector3 = DEFAULT_SUN_DIR) {
  const c = box.getCenter(new THREE.Vector3())
  const r = box.getSize(new THREE.Vector3()).length() / 2 + 20
  sun.position.copy(c).addScaledVector(dir, r * 1.75)
  sun.target.position.copy(c)
  const cam = sun.shadow.camera
  cam.left = -r
  cam.right = r
  cam.top = r
  cam.bottom = -r
  cam.near = 1
  cam.far = r * 4
  cam.updateProjectionMatrix()
}

/** 相机从斜前上方看向物体，距离刚好装下 */
export function frameCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3, dir = new THREE.Vector3(0.62, 0.78, 1).normalize(), margin = 1.15) {
  const c = box.getCenter(new THREE.Vector3())
  const r = box.getSize(new THREE.Vector3()).length() / 2
  const fov = (camera.fov * Math.PI) / 180
  const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect))
  const d = (r * margin) / Math.sin(fit / 2)
  camera.position.copy(c).addScaledVector(dir, d)
  camera.lookAt(c)
  return c
}
