// 素材缩略图：一个离屏渲染器依次渲染，结果缓存成 dataURL。

import * as THREE from 'three'
import { onBeforeUnmount, shallowRef, type Directive } from 'vue'
import { ASSET_MAP } from './assets'
import { basePalette } from './stylePalettes'
import { addOutlines, disposeUnshared } from './toon'
import { createStage, fitSun, frameCamera, type Stage } from './stage'

let stage: Stage | null = null
const cache = new Map<string, string>()
const SIZE = 256

function getStage() {
  if (!stage) {
    const cv = document.createElement('canvas')
    stage = createStage(cv, { preserve: true, shadowSize: 1024 })
    stage.renderer.setPixelRatio(1)
    stage.resize(SIZE, SIZE)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.12 }))
    ground.receiveShadow = true
    stage.scene.add(ground)
  }
  return stage
}

export function thumbnail(assetId: string, color = 0): string {
  const key = `${assetId}#${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const def = ASSET_MAP.get(assetId)
  if (!def) return ''
  const s = getStage()
  const obj = def.build(basePalette(def, color))
  addOutlines(obj)
  s.scene.add(obj)
  const box = new THREE.Box3().setFromObject(obj)
  fitSun(s.sun, box)
  frameCamera(s.camera, box, new THREE.Vector3(0.75, 0.62, 1).normalize(), 1.0)
  s.render()
  const url = s.renderer.domElement.toDataURL('image/png')
  s.scene.remove(obj)
  // 只要图片：模型的非共享几何体立刻释放，免得滚完素材库显存越积越多
  disposeUnshared(obj)
  cache.set(key, url)
  return url
}

/**
 * 组件里用的缩略图：thumbs[key] 有值就显示。key = `${assetId}#${color}`
 *
 * 只渲染看得见的卡片：卡片上挂 v-thumb="[id, color]"，进入视口才排队、滚出去就撤队。
 * 一张缩略图要 15–20ms（建模 + 渲染 + 编码），素材有上千个，以前一进素材库 / 沙盘就把全部排进队列，
 * 主线程被占满几十秒；而且每出一张就整份复制 thumbs、整个列表重渲染一遍。
 * 现在队列按时间片推进（每片约 12ms），结果攒一批再一次性写进 thumbs。
 */
export function useThumbs() {
  const thumbs = shallowRef<Record<string, string>>({})
  /** 待渲染的（看得见的），按进入视口的先后 */
  const queue = new Map<string, [string, number]>()
  let pending: Record<string, string> | null = null
  let timer = 0
  const flush = () => {
    if (!pending) return
    thumbs.value = { ...thumbs.value, ...pending }
    pending = null
  }
  const put = (key: string, url: string) => {
    if (!pending) {
      pending = {}
      queueMicrotask(flush)
    }
    pending[key] = url
  }
  const pump = () => {
    timer = 0
    const t0 = performance.now()
    for (const [key, [id, color]] of queue) {
      queue.delete(key)
      if (!thumbs.value[key] && !pending?.[key]) put(key, thumbnail(id, color))
      if (performance.now() - t0 > 12) break
    }
    if (queue.size) timer = window.setTimeout(pump, 0)
  }
  const want = (id: string, color = 0) => {
    const key = `${id}#${color}`
    if (thumbs.value[key]) return key
    const hit = cache.get(key)
    if (hit) {
      put(key, hit)
      return key
    }
    if (!queue.has(key)) queue.set(key, [id, color])
    if (!timer) timer = window.setTimeout(pump, 0)
    return key
  }

  type ThumbEl = HTMLElement & { _thumb?: [string, number] }
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const t = (e.target as ThumbEl)._thumb
              if (!t) continue
              if (e.isIntersecting) want(t[0], t[1])
              else queue.delete(`${t[0]}#${t[1]}`)
            }
          },
          { rootMargin: '200px' },
        )
  const observe = (el: ThumbEl, v: [string, number]) => {
    el._thumb = v
    if (io) io.observe(el)
    else want(v[0], v[1])
  }
  /** v-thumb="[assetId, color]" */
  const vThumb: Directive<ThumbEl, [string, number]> = {
    mounted: (el, b) => observe(el, b.value),
    updated(el, b) {
      const old = el._thumb
      if (old && old[0] === b.value[0] && old[1] === b.value[1]) return
      if (old) queue.delete(`${old[0]}#${old[1]}`)
      io?.unobserve(el)
      observe(el, b.value)
    },
    unmounted(el) {
      const old = el._thumb
      if (old) queue.delete(`${old[0]}#${old[1]}`)
      io?.unobserve(el)
    },
  }
  onBeforeUnmount(() => {
    clearTimeout(timer)
    io?.disconnect()
  })
  return { thumbs, want, vThumb }
}
