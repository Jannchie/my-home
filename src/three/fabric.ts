// 布艺花纹：把 patterns.ts 画出的花纹单元做成贴图，按物体坐标投影平铺到模型上（不依赖模型 UV），
// 一个花纹单元 = spec.scale 厘米，大沙发和小靠垫上的花纹尺寸一致。

import * as THREE from 'three'
import { drawPattern, patternKey as keyOf, type PatternSpec } from './patterns'

export { patternPreview } from './patterns'
import { toon, useAnisotropy } from './toon'
import { injectLightMask } from './lightMask'

const TEX = 256
const texCache = new Map<string, THREE.CanvasTexture>()
const matCache = new Map<string, THREE.MeshToonMaterial>()

export function patternTexture(spec: PatternSpec) {
  const key = keyOf(spec)
  let t = texCache.get(key)
  if (!t) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = TEX
    drawPattern(cv.getContext('2d')!, spec, TEX)
    t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    useAnisotropy(t)
    texCache.set(key, t)
  }
  return t
}

/** 带花纹的 toon 材质：片元里按物体坐标的主法线方向选投影平面取样 */
export function patternMaterial(spec: PatternSpec, world = false) {
  const key = keyOf(spec) + '|' + spec.scale + (world ? '|w' : '')
  let m = matCache.get(key)
  if (m) return m
  const base = toon('#ffffff') as THREE.MeshToonMaterial
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: patternTexture(spec), gradientMap: base.gradientMap })
  const scale = 1 / Math.max(1, spec.scale)
  m.onBeforeCompile = (sh) => {
    injectLightMask(sh)
    sh.uniforms.uPatScale = { value: scale }
    const assign = world ? 'vObjPos = (modelMatrix * vec4(position, 1.0)).xyz;\n  vObjNormal = mat3(modelMatrix) * normal;' : 'vObjPos = position;\n  vObjNormal = normal;'
    sh.vertexShader = 'varying vec3 vObjPos;\nvarying vec3 vObjNormal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  ' + assign)
    sh.fragmentShader =
      'varying vec3 vObjPos;\nvarying vec3 vObjNormal;\nuniform float uPatScale;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec3 pn = abs(normalize(vObjNormal));
  vec2 puv = (pn.y > max(pn.x, pn.z)) ? vObjPos.xz : ((pn.x > pn.z) ? vObjPos.zy : vObjPos.xy);
  diffuseColor *= texture2D(map, puv * uPatScale);`,
      )
  }
  m.customProgramCacheKey = () => (world ? 'fabric-pattern-world' : 'fabric-pattern')
  matCache.set(key, m)
  return m
}

const hex = (c: string) => new THREE.Color(c).getHexString()

/**
 * 给模型里用某个配色槽颜色的网格换上花纹材质。
 * 按材质颜色匹配：build 里直接用 palette[i] 上色的部件会被换掉，用 shade() 调过深浅的部件（底座、阴影色）保持纯色。
 * 描边外壳和半透明部件不动。
 */
export function applyPatterns(root: THREE.Object3D, palette: string[], patterns?: (PatternSpec | null | undefined)[]) {
  if (!patterns?.some(Boolean)) return
  const bySlot = new Map<string, PatternSpec>()
  patterns.forEach((p, i) => {
    if (p && palette[i]) bySlot.set(hex(palette[i]), p)
  })
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || o.userData.isOutline || Array.isArray(mesh.material)) return
    const mat = mesh.material as THREE.MeshToonMaterial
    if (!mat.isMeshToonMaterial || mat.transparent || mat.map) return
    const spec = bySlot.get(mat.color.getHexString())
    if (spec) mesh.material = patternMaterial(spec)
  })
}
