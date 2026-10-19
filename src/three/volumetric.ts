// 体积光（后处理，漫游时）：阳光从窗口斜射进屋、照亮空气里的浮尘，形成一道道光柱（原神室内的那种）。
//
// 做法：每个像素沿视线从镜头走到画面里的物体（深度取环境光遮蔽那一遍的深度图，不多画场景），一路取样：
//   - 这一点照得到太阳吗：查太阳的阴影贴图（和地上的光斑同一张），所以光柱的形状、被窗格 / 窗帘 / 家具挡出的阴影
//     都和地上的光斑完全一致；
//   - 这一点在屋里吗：查灯光模块的俯视房间编号图（lightMask.ts，编号 ≥ 2 是室内房间组），屋外、阳台不算，
//     不然透过窗户看出去整片户外都是雾；
//   - 照得到又在屋里的长度累加起来，按相位函数（看向太阳的方向更亮，前向散射）乘上阳光颜色，加到画面上。
// 加在泛光之前，光柱最亮的地方会晕开一点。取样起点按像素抖动（静态的，画面不动时不闪），避免一圈圈的条纹。
// 画面增强开了体积光、在漫游里、高画质时开（深度图借环境光遮蔽那一遍，见 post.ts）；入夜随太阳一起消失。

import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { LM_FETCH_GLSL, LM_OUTDOOR, lightMaskUniforms } from './lightMask'

/** 沿视线的取样数、最远走多远（cm） */
const STEPS = 40
const MAX_DIST = 1500

const VolumetricShader = {
  name: 'WalkVolumetric',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uShadow: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uStrength: { value: 0 },
    ...lightMaskUniforms,
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2DShadow uShadow;
    uniform mat4 uShadowMatrix;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uStrength;
    varying vec2 vUv;
    ${LM_FETCH_GLSL}

    // 这一点在不在屋里：所在楼层的房间编号图里编号 ≥ 2（0 = 墙体，1 = 户外 / 阳台）
    float indoor(vec3 p) {
      return lmFetch(p.xz, lmFloorOf(p.y)).x > ${LM_OUTDOOR}.5 ? 1.0 : 0.0;
    }

    float sunLit(vec3 p) {
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0 || sc.z > 1.0) return 0.0;
      return texture(uShadow, vec3(sc.xy, sc.z - 0.0005));
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.0) {
        gl_FragColor = base;
        return;
      }
      float depth = texture2D(tDepth, vUv).x;
      vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 view = uProjInv * ndc;
      view /= view.w;
      vec3 end = (uCamWorld * vec4(view.xyz, 1.0)).xyz;
      vec3 start = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 ray = end - start;
      float len = min(length(ray), ${MAX_DIST}.0);
      vec3 dir = normalize(ray);
      float stepLen = len / ${STEPS}.0;
      // 起点按像素抖动（interleaved gradient noise）：不同像素错开取样位置，消掉一圈圈的条纹
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float acc = 0.0;
      for (int i = 0; i < ${STEPS}; i++) {
        vec3 p = start + dir * (stepLen * (float(i) + jitter));
        acc += sunLit(p) * indoor(p);
      }
      acc *= stepLen;
      // 前向散射：看向太阳那一侧（逆光看光柱）更亮
      float c = max(dot(dir, uSunDir), 0.0);
      float phase = 0.45 + 1.6 * pow(c, 6.0);
      vec3 scatter = uSunColor * (acc * uStrength * phase);
      gl_FragColor = vec4(base.rgb + scatter, base.a);
    }`,
}

export function createVolumetric() {
  const pass = new ShaderPass(VolumetricShader)
  // 共享的房间编号图 uniform：ShaderPass 会克隆 uniforms，这里换回同一个对象，户型变了自动跟上
  for (const k of Object.keys(lightMaskUniforms) as (keyof typeof lightMaskUniforms)[]) pass.uniforms[k] = lightMaskUniforms[k]
  return pass
}

const sunDir = new THREE.Vector3()

/**
 * 每帧画之前更新：镜头矩阵、太阳方向和阴影矩阵、深度图。strength = 0 时不走光线（只拷贝画面）。
 * 太阳的阴影贴图要先画过一次才有（第一帧之前 strength 当 0）。
 */
export function updateVolumetric(pass: ShaderPass, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, depth: THREE.Texture | null, strength: number) {
  const u = pass.uniforms
  const shadow = sun.shadow.map?.depthTexture ?? null
  u.uStrength.value = shadow && depth ? strength : 0
  if (!shadow || !depth) return
  u.tDepth.value = depth
  u.uShadow.value = shadow
  u.uShadowMatrix.value.copy(sun.shadow.matrix)
  u.uProjInv.value.copy(camera.projectionMatrixInverse)
  u.uCamWorld.value.copy(camera.matrixWorld)
  u.uSunDir.value.copy(sunDir.subVectors(sun.position, sun.target.position).normalize())
  u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity)
}
