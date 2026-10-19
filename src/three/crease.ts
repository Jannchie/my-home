// 转折线（后处理）：描边只画得出物体的外轮廓（反向外壳），冰箱、柜子的倒角、门缝、台面转角这些物体内部的转折画不出来。
// 这里借环境光遮蔽那一遍已经画好的法线、深度图（post.ts 的 GTAOPass），在法线突变（转折）或深度突变（缝隙、前后叠着）的地方描一条线。
// 线的颜色是那一点画面颜色的深色版本（和彩色描边一样，不是黑线）。画面效果带 crease 时开（「动画感」），省电画质不开。

import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

const CreaseShader = {
  name: 'Crease',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uNear: { value: 5 },
    uFar: { value: 20000 },
    uStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear;
    uniform float uFar;
    uniform float uStrength;
    varying vec2 vUv;

    float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    vec3 nrm(vec2 uv) { return unpackRGBToNormal(texture2D(tNormal, uv).rgb); }

    // 法线转折：两侧各取一个屏幕像素比较（法线图是半分辨率、双线性插值，圆角的倒角也能比出来）；
    // 过渡放宽，线是细的、边缘柔和（后处理画的线不经过多重采样）
    float creaseAcross(vec2 off) {
      return 1.0 - smoothstep(0.6, 0.93, dot(nrm(vUv + off), nrm(vUv - off)));
    }
    // 深度缝隙：相邻点比这一点远出 4% 以上（门缝、前后叠着）
    float gapWith(float z0, vec2 off) {
      return smoothstep(0.04, 0.08, (viewZ(vUv + off) - z0) / z0);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float d0 = texture2D(tDepth, vUv).x;
      if (uStrength <= 0.0 || d0 >= 1.0) {
        gl_FragColor = base;
        return;
      }
      float z0 = viewZ(vUv);
      vec2 tx = vec2(uTexel.x, 0.0);
      vec2 ty = vec2(0.0, uTexel.y);
      float crease = max(creaseAcross(tx), creaseAcross(ty));
      float gap = max(max(gapWith(z0, tx), gapWith(z0, -tx)), max(gapWith(z0, ty), gapWith(z0, -ty)));
      float e = max(crease, gap);
      // 远处的细节线淡掉，免得一片糊
      e *= 1.0 - smoothstep(3500.0, 7000.0, z0);
      // 线色：画面颜色压暗、提一点饱和度
      vec3 c = base.rgb * 0.42;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, 1.3), 0.0);
      gl_FragColor = vec4(mix(base.rgb, c, e * uStrength), base.a);
    }`,
}

export function createCrease() {
  return new ShaderPass(CreaseShader)
}

/** 每帧画之前：法线、深度图（环境光遮蔽那一遍的），画面尺寸（设备像素，取样按屏幕像素走），镜头远近裁剪面；没有图时 strength 当 0 */
export function updateCrease(pass: ShaderPass, camera: THREE.PerspectiveCamera, normal: THREE.Texture | null, depth: THREE.Texture | null, res: THREE.Vector2, strength: number) {
  const u = pass.uniforms
  u.uStrength.value = normal && depth ? strength : 0
  if (!normal || !depth) return
  u.tNormal.value = normal
  u.tDepth.value = depth
  u.uTexel.value.set(1 / Math.max(1, res.x), 1 / Math.max(1, res.y))
  u.uNear.value = camera.near
  u.uFar.value = camera.far
}
