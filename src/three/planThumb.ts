// 「我的户型」的缩略图：
// 1. 3D 沙盘开着时，直接截沙盘当前视角（沙盘挂载时登记 liveCapture，卸载时撤销）；
// 2. 否则用一个离屏渲染器把整套户型（房子 + 家具）按默认视角渲染一张；
// 3. WebGL 不可用等情况，退回到画平面图色块。
// 输出 640×400（2 倍图，卡片上按 320×200 显示）的 WebP Blob。

import * as THREE from 'three'
import { applyCutaway, furnitureModel, placeFurniture, stepCutaway } from './house'
import { buildBuilding } from './building'
import { disposeUnshared } from './toon'
import { createStage, fitSun, frameCamera, type Stage } from './stage'
import { bbox, ROOM_KINDS, type Plan } from '../model'

export const THUMB_W = 640
export const THUMB_H = 400

/** 3D 沙盘挂载时提供的截图函数：把当前画面按 w×h 画到一张 canvas 上 */
export const liveCapture: { fn: ((w: number, h: number) => HTMLCanvasElement | null) | null } = { fn: null }

/** 把 src 按「铺满裁切」画进 w×h 的新 canvas */
export function coverInto(src: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const sw = src.width
  const sh = src.height
  if (!sw || !sh) return out
  const s = Math.max(w / sw, h / sh)
  const cw = w / s
  const ch = h / s
  out.getContext('2d')!.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h)
  return out
}

let stage: Stage | null = null
function getStage() {
  if (!stage) {
    const cv = document.createElement('canvas')
    stage = createStage(cv, { preserve: true, shadowSize: 2048 })
    stage.renderer.setPixelRatio(1)
    stage.resize(THUMB_W, THUMB_H)
  }
  return stage
}

/**
 * 离屏渲染整套户型（默认视角 + 内墙半墙 + 前墙压低，和沙盘「重置视角」的观感一致）。
 * 多层户型显示全部楼层：最上面一层做半墙处理，下面的楼层保持完整。
 */
function renderOffscreen(p: Plan, wallH: number): HTMLCanvasElement | null {
  const pts = p.rooms.flatMap((r) => r.points)
  if (!pts.length) return null
  const s = getStage()
  const root = new THREE.Group()
  const { root: house, floors } = buildBuilding(p, wallH)
  root.add(house)
  const furn: THREE.Object3D[] = []
  for (const f of p.furniture) {
    const o = furnitureModel(f)
    placeFurniture(o, p, f)
    root.add(o)
    furn.push(o)
  }
  s.scene.add(root)
  try {
    const box = new THREE.Box3().setFromObject(house)
    if (box.isEmpty()) return null
    fitSun(s.sun, box)
    const c = frameCamera(s.camera, box, new THREE.Vector3(0.35, 1.25, 1).normalize(), 0.8)
    // 镜头方向的水平分量：决定哪几面外墙算「前墙」
    const b = bbox(pts)
    const center = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    const v = new THREE.Vector3().subVectors(s.camera.position, c)
    const l = Math.hypot(v.x, v.z) || 1
    floors.forEach((fg, i) => {
      // 户建的屋顶不画：缩略图要看得到室内
      if (fg.roof) fg.roof.visible = false
      if (i === floors.length - 1) applyCutaway(fg.group, center, { x: v.x / l, y: v.z / l }, null, false, true)
      else applyCutaway(fg.group, center, null)
      stepCutaway(fg.group, 10, { style: 'cut', opacity: 0, cut: 60 }, true)
    })
    s.renderer.shadowMap.needsUpdate = true
    s.render()
    return coverInto(s.renderer.domElement, THUMB_W, THUMB_H)
  } finally {
    s.scene.remove(root)
    disposeUnshared(house)
    for (const o of furn) disposeUnshared(o)
  }
}

/** 兜底：平面图色块 */
function render2d(p: Plan): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = THUMB_W
  cv.height = THUMB_H
  const g = cv.getContext('2d')!
  g.fillStyle = '#fbfaf7'
  g.fillRect(0, 0, THUMB_W, THUMB_H)
  const pts = p.rooms.flatMap((r) => r.points)
  if (!pts.length) return cv
  const b = bbox(pts)
  const pad = 28
  const s = Math.min((THUMB_W - pad * 2) / Math.max(1, b.x1 - b.x0), (THUMB_H - pad * 2) / Math.max(1, b.y1 - b.y0))
  const ox = (THUMB_W - (b.x1 - b.x0) * s) / 2 - b.x0 * s
  const oy = (THUMB_H - (b.y1 - b.y0) * s) / 2 - b.y0 * s
  g.lineJoin = 'round'
  // 多层户型画最底层（平面图色块只能画一层）
  for (const r of p.rooms.filter((x) => !x.floor)) {
    g.beginPath()
    r.points.forEach((q, i) => (i ? g.lineTo(ox + q.x * s, oy + q.y * s) : g.moveTo(ox + q.x * s, oy + q.y * s)))
    g.closePath()
    g.fillStyle = ROOM_KINDS[r.kind]?.fill ?? '#eee'
    g.fill()
    g.strokeStyle = '#4a4f4b'
    g.lineWidth = 2
    g.stroke()
  }
  return cv
}

function toBlob(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => cv.toBlob((b) => resolve(b), 'image/webp', 0.86))
}

/**
 * 生成缩略图。p 必须是普通对象（不是响应式代理）。
 * live = true 时优先截 3D 沙盘当前画面（保存「当前户型」时用；复制 / 快照等别的户型不能截）。
 */
export async function planThumbnail(p: Plan, wallH: number, live = true): Promise<Blob | null> {
  let cv: HTMLCanvasElement | null = null
  if (live && liveCapture.fn) {
    try {
      cv = liveCapture.fn(THUMB_W, THUMB_H)
    } catch {
      cv = null
    }
  }
  if (!cv) {
    try {
      cv = renderOffscreen(p, wallH)
    } catch (e) {
      console.warn('[planThumb] 3D 缩略图失败，改用平面图', e)
      cv = null
    }
  }
  cv ??= render2d(p)
  return toBlob(cv)
}
