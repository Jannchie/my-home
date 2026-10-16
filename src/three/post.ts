// 3D 沙盘的「画面效果」：一组可选的后处理风格（移轴微缩、暖阳、夜晚、胶片、水彩、漫画网点……）。
//
// 结构：
//   RenderPass（4× MSAA 半浮点目标，描边不起锯齿）
//   → [UnrealBloom 泛光，线性空间]
//   → Base：线性转 sRGB，并把透明背景合成为与 CSS 一致的径向渐变底（之后的效果作用于整张画面）
//   → [风格化：水彩 / 漫画网点 / 像素 / 素描，各自一到两个 pass]
//   → [移轴模糊：横、竖两遍]
//   → Grade：调色（曝光、对比、饱和、分离色调、褪色、单色 / 棕褐、雾感、暗角、色差、纸纹、颗粒）
// 选「无」时不建 composer，直接 renderer.render，零额外开销。
// 省电画质（setLow(true)，手机 / 低性能设备）：画布不开 MSAA，改为始终走 composer（目标不开多重采样），
// 末尾加一遍 FXAA；入夜的灯光泛光也关掉（泛光的 mip 链很吃填充率）。
// 所有效果都是静态的（颗粒按像素坐标固定），沿用沙盘的按需渲染：画面没变就不重画。

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'
import type { Stage } from './stage'

export type LookId = 'none' | 'tiltshift' | 'warm' | 'cool' | 'film' | 'pastel' | 'watercolor' | 'comic' | 'mono' | 'sepia' | 'pixel' | 'sketch'

interface Grade {
  exposure: number
  contrast: number
  saturation: number
  /** 乘到最终颜色上（整体色温） */
  gain: string
  /** 暗部 / 亮部各加一点颜色（分离色调），值是偏移量，'#000000' 为不加 */
  shadowTint: [number, number, number]
  highTint: [number, number, number]
  /** 褪色：把黑位抬到 fadeColor */
  fade: number
  fadeColor: string
  mono: number
  sepia: number
  /** 雾感：越靠画面上方（越远）越浓 */
  haze: number
  hazeColor: string
  vignette: number
  vignetteColor: string
  /** 色差（屏幕边缘 R/B 错开的像素数，按 CSS 像素） */
  ca: number
  paper: number
  grain: number
}

const NEUTRAL: Grade = {
  exposure: 1,
  contrast: 1,
  saturation: 1,
  gain: '#ffffff',
  shadowTint: [0, 0, 0],
  highTint: [0, 0, 0],
  fade: 0,
  fadeColor: '#000000',
  mono: 0,
  sepia: 0,
  haze: 0,
  hazeColor: '#ffffff',
  vignette: 0,
  vignetteColor: '#000000',
  ca: 0,
  paper: 0,
  grain: 0,
}

export interface LookDef {
  id: LookId
  /** 中文原文，显示时过 t() */
  label: string
  desc: string
  /** 纸面类风格自带的背景渐变：中心 / 中段 / 边缘（sRGB）；缺省用时间光照给的天色，入夜时也逐渐过渡到天色 */
  bg?: [string, string, string]
  bloom?: { strength: number; radius: number; threshold: number }
  /** 描边粗细倍数 */
  outline?: number
  stylize?: 'watercolor' | 'comic' | 'pixel' | 'sketch'
  /** 移轴：焦点（屏幕 y，0 底 1 顶）、清晰带半宽、过渡宽度、最大模糊半径（CSS 像素） */
  tilt?: { focus: number; band: number; fall: number; max: number }
  grade?: Partial<Grade>
}

const DEFAULT_BG: [string, string, string] = ['#fdfdfb', '#f1f3ef', '#e3e9e5']

export const LOOKS: LookDef[] = [
  { id: 'none', label: '原样', desc: '不加效果，最清楚也最省电' },
  {
    id: 'tiltshift',
    label: '移轴微缩',
    desc: '上下虚化、颜色更鲜，像拍桌上的模型',
    tilt: { focus: 0.45, band: 0.06, fall: 0.3, max: 12 },
    grade: { saturation: 1.22, contrast: 1.06, exposure: 1.03, vignette: 0.22 },
  },
  {
    id: 'warm',
    label: '暖调',
    desc: '整体偏暖橙，柔和泛光与暗角',
    bloom: { strength: 0.2, radius: 0.5, threshold: 0.9 },
    grade: { gain: '#fff3e2', exposure: 1.03, saturation: 1.08, contrast: 1.04, shadowTint: [0.02, 0.0, -0.025], highTint: [0.025, 0.01, -0.018], vignette: 0.32, vignetteColor: '#3a1e08' },
  },
  {
    id: 'cool',
    label: '冷调',
    desc: '清冷的蓝灰、低对比，带一层薄雾',
    grade: { gain: '#f2f7ff', contrast: 0.88, saturation: 0.86, exposure: 1.03, shadowTint: [-0.01, 0.005, 0.03], haze: 0.22, hazeColor: '#e9f1f7', fade: 0.06, fadeColor: '#cfdce6' },
  },
  {
    id: 'film',
    label: '胶片复古',
    desc: '褪色、偏暖绿，带颗粒和一点色差',
    grade: { contrast: 0.92, saturation: 0.8, gain: '#fff6e6', shadowTint: [-0.015, 0.02, 0.01], highTint: [0.03, 0.015, -0.03], fade: 0.12, fadeColor: '#2a2620', ca: 1.4, vignette: 0.5, vignetteColor: '#1a120a', grain: 0.075 },
  },
  {
    id: 'pastel',
    label: '粉彩梦幻',
    desc: '提亮、降饱和，一层柔光',
    bloom: { strength: 0.16, radius: 0.8, threshold: 0.78 },
    grade: { exposure: 1.03, contrast: 0.86, saturation: 0.78, gain: '#fff8fb', highTint: [0.015, 0.0, 0.02], fade: 0.1, fadeColor: '#f4e4ee' },
  },
  {
    id: 'watercolor',
    label: '水彩纸',
    desc: '色块晕开、边缘积色，透出纸纹',
    bg: ['#fcfaf5', '#f6f1e7', '#ece4d4'],
    stylize: 'watercolor',
    outline: 0.8,
    grade: { saturation: 0.92, exposure: 1.03, contrast: 0.95, paper: 0.55, vignette: 0.15, vignetteColor: '#7a6040' },
  },
  {
    id: 'comic',
    label: '漫画网点',
    desc: '阴影换成网点，描边加粗',
    bg: ['#ffffff', '#fbfbf8', '#f2f2ec'],
    stylize: 'comic',
    outline: 1.7,
    grade: { saturation: 1.1, contrast: 1.05 },
  },
  {
    id: 'mono',
    label: '黑白',
    desc: '只留明暗，像一张黑白照片',
    grade: { mono: 1, contrast: 1.1, exposure: 1.02, vignette: 0.3, grain: 0.03 },
  },
  {
    id: 'sepia',
    label: '棕褐老照片',
    desc: '暖棕单色、褪色暗角，像旧相册',
    grade: { sepia: 1, contrast: 0.95, fade: 0.08, fadeColor: '#3a2a1a', vignette: 0.55, vignetteColor: '#2a1808', grain: 0.05 },
  },
  {
    id: 'pixel',
    label: '像素风',
    desc: '降低分辨率、限制色阶，像老游戏',
    stylize: 'pixel',
    grade: { saturation: 1.12, contrast: 1.04 },
  },
  {
    id: 'sketch',
    label: '素描线稿',
    desc: '铅笔线条与排线，画在纸上',
    bg: ['#fbf9f3', '#f6f2e8', '#ece6d8'],
    stylize: 'sketch',
    outline: 1.1,
    grade: { paper: 0.35, vignette: 0.12, vignetteColor: '#6a5a40' },
  },
]

/**
 * 入夜时自发光部件的亮度上限（emissiveIntensity）：屏幕、指示灯等到 0.6（加上受到的灯光，约为原色的 1.2–1.5 倍），
 * 屏幕（带画面贴图的）更低一点，保留画面内容；以前是统一乘 2.5，夜里会过曝成一片白、看不出造型和画面。
 */
const NIGHT_GLOW_CAP = 0.6
const NIGHT_SCREEN_CAP = 0.55

export const LOOK_MAP = new Map(LOOKS.map((l) => [l.id, l]))

// ---------- 着色器 ----------

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

/** 各 pass 共用的小函数：亮度、hash、值噪声 */
const COMMON = /* glsl */ `
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }`

/** 线性 → sRGB，透明处合成径向渐变底（与 .viewport 的 CSS 渐变一致） */
const BaseShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uBg0: { value: new THREE.Color() },
    uBg1: { value: new THREE.Color() },
    uBg2: { value: new THREE.Color() },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uBg0, uBg1, uBg2;
    varying vec2 vUv;
    vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      // radial-gradient(ellipse at 50% 35%, …) farthest-corner：椭圆半轴按最近边比例，放大到过远角
      vec2 q = vec2((vUv.x - 0.5) / 0.5, ((1.0 - vUv.y) - 0.35) / 0.35);
      float r = length(q) / 2.1095;
      vec3 bg = r < 0.55 ? mix(uBg0, uBg1, r / 0.55) : mix(uBg1, uBg2, clamp((r - 0.55) / 0.45, 0.0, 1.0));
      float a = clamp(t.a, 0.0, 1.0);
      // 画面内容是预乘的（清屏处为 0），泛光叠在背景上也保留
      gl_FragColor = vec4(toSRGB(t.rgb + toLinear(bg) * (1.0 - a)), 1.0);
    }`,
}

/** 移轴：按离焦点的竖直距离决定模糊半径的可分离高斯（横竖各一遍） */
const TiltShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uDir: { value: new THREE.Vector2(1, 0) },
    uFocus: { value: 0.5 },
    uBand: { value: 0.1 },
    uFall: { value: 0.3 },
    uMax: { value: 10 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes, uDir;
    uniform float uFocus, uBand, uFall, uMax;
    varying vec2 vUv;
    void main() {
      float k = smoothstep(uBand, uBand + uFall, abs(vUv.y - uFocus));
      float r = uMax * k * k;
      if (r < 0.4) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 sum = vec4(0.0);
      float wsum = 0.0;
      for (int i = -8; i <= 8; i++) {
        float x = float(i) / 8.0;
        float w = exp(-x * x * 4.5);
        sum += texture2D(tDiffuse, vUv + uDir * x * r / uRes) * w;
        wsum += w;
      }
      gl_FragColor = sum / wsum;
    }`,
}

/** 水彩第一步：四象限 Kuwahara，把画面压成边缘清楚的平涂色块 */
const KuwaharaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uStep: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uStep;
    varying vec2 vUv;
    void main() {
      vec2 px = uStep / uRes;
      vec3 m[4];
      vec3 s[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
      for (int j = 0; j <= 3; j++) {
        for (int i = 0; i <= 3; i++) {
          vec2 o = vec2(float(i), float(j)) * px;
          vec3 c0 = texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb;
          vec3 c1 = texture2D(tDiffuse, vUv + vec2(o.x, -o.y)).rgb;
          vec3 c2 = texture2D(tDiffuse, vUv + vec2(-o.x, o.y)).rgb;
          vec3 c3 = texture2D(tDiffuse, vUv + vec2(o.x, o.y)).rgb;
          m[0] += c0; s[0] += c0 * c0;
          m[1] += c1; s[1] += c1 * c1;
          m[2] += c2; s[2] += c2 * c2;
          m[3] += c3; s[3] += c3 * c3;
        }
      }
      float best = 1e9;
      vec3 col = vec3(0.0);
      for (int k = 0; k < 4; k++) {
        vec3 mean = m[k] / 16.0;
        vec3 v = abs(s[k] / 16.0 - mean * mean);
        float sv = v.r + v.g + v.b;
        if (sv < best) { best = sv; col = mean; }
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
}

/** 水彩第二步：纸纹扰动取样（晕染）、色块边缘积色、颜料颗粒、整体变透 */
const PigmentShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScale: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uScale;
    varying vec2 vUv;
    ${COMMON}
    void main() {
      vec2 p = vUv * uRes / uScale;
      // 低频噪声推一推取样位置：颜色边界像被水洇开
      vec2 wob = vec2(fbm(p * 0.035), fbm(p * 0.035 + 31.7)) - 0.5;
      vec2 uv = vUv + wob * 5.0 * uScale / uRes;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      // 边缘积色：颜色变化大的地方颜料堆得深一点
      vec2 d = 1.6 * uScale / uRes;
      float gx = luma(texture2D(tDiffuse, uv + vec2(d.x, 0.0)).rgb) - luma(texture2D(tDiffuse, uv - vec2(d.x, 0.0)).rgb);
      float gy = luma(texture2D(tDiffuse, uv + vec2(0.0, d.y)).rgb) - luma(texture2D(tDiffuse, uv - vec2(0.0, d.y)).rgb);
      float edge = smoothstep(0.03, 0.22, length(vec2(gx, gy)));
      // 水彩是透明颜料：整体往纸色提亮，暗部保留
      c = mix(c, vec3(1.0), 0.12 * (1.0 - luma(c)));
      c *= 1.0 - edge * 0.22;
      // 颜料颗粒（沉在纸纹凹处）
      float gran = fbm(p * 0.45) - 0.5;
      c *= 1.0 + gran * 0.12 * (1.0 - luma(c) * 0.6);
      // 颜色不均：大块的浓淡变化
      float blot = fbm(p * 0.008 + 5.0) - 0.5;
      c = mix(c, c * c, -blot * 0.35);
      gl_FragColor = vec4(c, 1.0);
    }`,
}

/** 漫画：暗部换成 45° 网点、亮部留白、按亮度梯度补墨线 */
const ComicShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScale: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uScale;
    varying vec2 vUv;
    ${COMMON}
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = luma(c);
      // 网点：45° 网格，暗处点大
      vec2 px = vUv * uRes;
      float cell = 6.0 * uScale;
      vec2 rp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * px / cell;
      vec2 f = fract(rp) - 0.5;
      float d = length(f);
      // 只有暗部上网点：中间调保持干净的平涂
      float rad = sqrt(clamp((0.56 - l) * 1.9, 0.0, 1.0)) * 0.6;
      float aa = 0.9 / cell;
      float dotInk = (1.0 - smoothstep(rad - aa, rad + aa, d)) * step(0.03, rad);
      // 底色压平一点（漫画上色是平涂），亮部推向纸白
      vec3 flatC = mix(c, vec3(1.0), smoothstep(0.72, 0.95, l) * 0.55);
      vec3 inkCol = c * 0.42;
      vec3 o = mix(flatC, inkCol, dotInk * 0.75);
      // 墨线：亮度 Sobel
      vec2 e = uScale / uRes;
      float tl = luma(texture2D(tDiffuse, vUv + vec2(-e.x, e.y)).rgb);
      float tc = luma(texture2D(tDiffuse, vUv + vec2(0.0, e.y)).rgb);
      float tr = luma(texture2D(tDiffuse, vUv + vec2(e.x, e.y)).rgb);
      float ml = luma(texture2D(tDiffuse, vUv + vec2(-e.x, 0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, vUv + vec2(e.x, 0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, vUv + vec2(-e.x, -e.y)).rgb);
      float bc = luma(texture2D(tDiffuse, vUv + vec2(0.0, -e.y)).rgb);
      float br = luma(texture2D(tDiffuse, vUv + vec2(e.x, -e.y)).rgb);
      float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl;
      float gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
      float edge = smoothstep(0.35, 0.8, length(vec2(gx, gy)));
      o = mix(o, vec3(0.13, 0.12, 0.16), edge * 0.85);
      gl_FragColor = vec4(o, 1.0);
    }`,
}

/** 像素：按格子取 4 点平均（下采样），再用 4×4 Bayer 抖动量化色阶 */
const PixelShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPx: { value: 4 },
    uLevels: { value: 12 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uPx, uLevels;
    varying vec2 vUv;
    float bayer(vec2 p) {
      vec2 q = mod(p, 4.0);
      int i = int(q.x) + int(q.y) * 4;
      float m[16];
      m[0] = 0.0; m[1] = 8.0; m[2] = 2.0; m[3] = 10.0;
      m[4] = 12.0; m[5] = 4.0; m[6] = 14.0; m[7] = 6.0;
      m[8] = 3.0; m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;
      m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
      for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
      return 0.0;
    }
    void main() {
      vec2 cell = floor(vUv * uRes / uPx);
      vec2 c0 = (cell + 0.5) * uPx / uRes;
      vec2 o = uPx * 0.25 / uRes;
      vec3 c = (texture2D(tDiffuse, c0 + vec2(-o.x, -o.y)).rgb + texture2D(tDiffuse, c0 + vec2(o.x, -o.y)).rgb
              + texture2D(tDiffuse, c0 + vec2(-o.x, o.y)).rgb + texture2D(tDiffuse, c0 + vec2(o.x, o.y)).rgb) * 0.25;
      float n = uLevels - 1.0;
      float d = bayer(cell) * 0.2;
      vec3 q = floor(c * n + 0.5 + d) / n;
      // 近灰色（背景渐变、白墙）按亮度整体量化，避免各通道分别取整后串出彩色色带
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float ql = floor(l * n + 0.5 + d) / n;
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(c + (ql - l), q, smoothstep(0.03, 0.1, chroma));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}

/** 素描：亮度边缘当铅笔线（两遍错位取样更像手画），暗部两层交叉排线，留一点淡彩 */
const SketchShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScale: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uScale;
    varying vec2 vUv;
    ${COMMON}
    float edgeAt(vec2 uv) {
      vec2 e = uScale / uRes;
      float tl = luma(texture2D(tDiffuse, uv + vec2(-e.x, e.y)).rgb);
      float tc = luma(texture2D(tDiffuse, uv + vec2(0.0, e.y)).rgb);
      float tr = luma(texture2D(tDiffuse, uv + vec2(e.x, e.y)).rgb);
      float ml = luma(texture2D(tDiffuse, uv + vec2(-e.x, 0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, uv + vec2(e.x, 0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, uv + vec2(-e.x, -e.y)).rgb);
      float bc = luma(texture2D(tDiffuse, uv + vec2(0.0, -e.y)).rgb);
      float br = luma(texture2D(tDiffuse, uv + vec2(e.x, -e.y)).rgb);
      float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl;
      float gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
      return smoothstep(0.12, 0.5, length(vec2(gx, gy)));
    }
    void main() {
      vec2 p = vUv * uRes / uScale;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = luma(c);
      // 两遍线条，各自被噪声推开一点
      vec2 w1 = (vec2(fbm(p * 0.02), fbm(p * 0.02 + 9.3)) - 0.5) * 3.0 * uScale / uRes;
      vec2 w2 = (vec2(fbm(p * 0.03 + 4.1), fbm(p * 0.03 + 13.7)) - 0.5) * 3.0 * uScale / uRes;
      float line = max(edgeAt(vUv + w1), edgeAt(vUv + w2) * 0.7);
      line *= 0.75 + 0.25 * vnoise(p * 0.25);
      // 排线：45° 一层，暗处再加 -45° 一层
      float h1 = smoothstep(0.55, 0.15, abs(fract((p.x + p.y) / 6.0) - 0.5) * 2.0) * smoothstep(0.72, 0.42, l);
      float h2 = smoothstep(0.55, 0.15, abs(fract((p.x - p.y) / 5.0) - 0.5) * 2.0) * smoothstep(0.45, 0.2, l);
      float hatch = max(h1, h2) * (0.6 + 0.4 * vnoise(p * 0.08));
      vec3 paper = vec3(0.965, 0.95, 0.915);
      vec3 graphite = vec3(0.24, 0.24, 0.27);
      // 淡淡的原色水洗，避免整张都是灰
      vec3 wash = mix(paper, c, 0.16);
      vec3 o = mix(wash, graphite, clamp(line * 0.9 + hatch * 0.32, 0.0, 1.0));
      gl_FragColor = vec4(o, 1.0);
    }`,
}

/** 最后一遍调色（sRGB 空间） */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScale: { value: 1 },
    uExposure: { value: 1 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uGain: { value: new THREE.Color(1, 1, 1) },
    uShadowTint: { value: new THREE.Vector3() },
    uHighTint: { value: new THREE.Vector3() },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color() },
    uMono: { value: 0 },
    uSepia: { value: 0 },
    uHaze: { value: 0 },
    uHazeColor: { value: new THREE.Color() },
    uVignette: { value: 0 },
    uVigColor: { value: new THREE.Color() },
    uCA: { value: 0 },
    uPaper: { value: 0 },
    uGrain: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uScale, uExposure, uContrast, uSaturation, uFade, uMono, uSepia, uHaze, uVignette, uCA, uPaper, uGrain;
    uniform vec3 uGain, uShadowTint, uHighTint, uFadeColor, uHazeColor, uVigColor;
    varying vec2 vUv;
    ${COMMON}
    void main() {
      vec2 uv = vUv;
      vec3 c;
      if (uCA > 0.0) {
        vec2 d = (uv - 0.5) * 2.0;
        vec2 off = d * dot(d, d) * uCA * uScale / uRes;
        c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else c = texture2D(tDiffuse, uv).rgb;
      c *= uExposure;
      c = (c - 0.5) * uContrast + 0.5;
      float l = luma(c);
      c = mix(vec3(l), c, uSaturation);
      c += mix(uShadowTint, uHighTint, smoothstep(0.15, 0.85, l));
      c *= uGain;
      c = clamp(c, 0.0, 1.0);
      float l2 = luma(c);
      c = mix(c, vec3(l2), uMono);
      vec3 sep = vec3(l2) * vec3(1.08, 0.93, 0.74) + vec3(0.035, 0.02, 0.0);
      c = mix(c, sep, uSepia);
      c = mix(c, uFadeColor + c * (1.0 - uFadeColor), uFade);
      float hz = uHaze * (0.25 + 0.75 * smoothstep(0.15, 0.95, uv.y));
      c = mix(c, uHazeColor, hz);
      vec2 vq = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float v = smoothstep(0.4, 1.3, length(vq));
      c = mix(c, uVigColor, v * uVignette);
      if (uPaper > 0.0) {
        vec2 p = uv * uRes / uScale;
        float fib = fbm(p * vec2(0.9, 0.35)) * 0.6 + fbm(p * 0.12) * 0.4;
        float pit = smoothstep(0.62, 0.8, vnoise(p * 0.55));
        c *= 1.0 - uPaper * (0.09 * fib + 0.05 * pit);
      }
      if (uGrain > 0.0) {
        float g = hash12(floor(uv * uRes / max(1.0, uScale * 0.8))) - 0.5;
        c += g * uGrain * (1.0 - abs(luma(c) - 0.5) * 1.2);
      }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}

// ---------- 管线 ----------

export interface Post {
  /** 切换画面效果；'none' 且不在夜里时拆掉 composer，回到直接渲染 */
  setLook: (id: string) => void
  /** 时间光照给的天色与入夜程度（见 sky.ts） */
  setSky: (bg: [string, string, string], night: number) => void
  /** 临时用某个效果渲染一帧（生成选择器缩略图用），fn 里调用 stage.render() */
  withLook: <T>(id: string, fn: () => T) => T
  /** 省电画质：无 MSAA + FXAA、不加入夜泛光 */
  setLow: (low: boolean) => void
  /** 室内灯光（three/lights.ts）：窗户夜光的颜色（跟色温）和亮灯程度 0–1 */
  setIndoor: (color: THREE.Color, level: number) => void
  dispose: () => void
}

/** 窗玻璃（kit.ts 的 C.glass，半透明）：入夜后透出暖光 */
const GLASS_HEX = 'bfe6ff'
const WINDOW_GLOW = new THREE.Color('#ffcf8a')
/** 室内灯光模块自己控制的发光材质（userData 标记，见 three/lights.ts 的 LAMP_GLOW） */
const LAMP_GLOW = 'lampGlow'

export function attachPost(stage: Stage, opts: { low?: boolean } = {}): Post {
  const { renderer, scene, camera } = stage
  let low = !!opts.low
  // 省电画质没有 MSAA：像素比够高（≥2）时锯齿不明显，不再叠 FXAA（FXAA 会把描边抹糊）
  const needFxaa = () => low && renderer.getPixelRatio() < 2

  let composer: EffectComposer | null = null
  let passes: {
    render: RenderPass
    bloom: UnrealBloomPass | null
    base: ShaderPass
    kuwahara: ShaderPass
    pigment: ShaderPass
    comic: ShaderPass
    pixel: ShaderPass
    sketch: ShaderPass
    tiltH: ShaderPass
    tiltV: ShaderPass
    grade: ShaderPass
    fxaa: ShaderPass
  } | null = null
  let current: LookDef = LOOK_MAP.get('none')!
  let sky: { bg: [string, string, string]; night: number } = { bg: DEFAULT_BG, night: 0 }
  /** 窗户夜光：颜色跟色温，亮度跟室内亮灯程度（没接室内灯光时按全亮） */
  const windowGlow = WINDOW_GLOW.clone()
  let indoor = 1
  /** 上次写进 uniform 的状态（效果或天色变了才重设） */
  let appliedKey = ''

  const cssSize = () => renderer.getSize(new THREE.Vector2())

  function build() {
    const pr = renderer.getPixelRatio()
    const s = cssSize()
    // 4× MSAA：后处理目标默认没有抗锯齿，toon 描边会出明显锯齿
    // 省电画质不开多重采样，末尾用 FXAA
    const rt = new THREE.WebGLRenderTarget(Math.max(1, s.x * pr), Math.max(1, s.y * pr), { type: THREE.HalfFloatType, samples: low ? 0 : 4 })
    composer = new EffectComposer(renderer, rt)
    composer.setPixelRatio(pr)
    composer.setSize(s.x, s.y)
    const mk = (sh: object) => new ShaderPass(sh)
    passes = {
      render: new RenderPass(scene, camera),
      bloom: null,
      base: mk(BaseShader),
      kuwahara: mk(KuwaharaShader),
      pigment: mk(PigmentShader),
      comic: mk(ComicShader),
      pixel: mk(PixelShader),
      sketch: mk(SketchShader),
      tiltH: mk(TiltShader),
      tiltV: mk(TiltShader),
      grade: mk(GradeShader),
      fxaa: mk(FXAAShader),
    }
    passes.tiltV.uniforms.uDir.value.set(0, 1)
    passes.fxaa.enabled = needFxaa()
    const p = passes
    for (const ps of [p.render, p.base, p.kuwahara, p.pigment, p.comic, p.pixel, p.sketch, p.tiltH, p.tiltV, p.grade, p.fxaa]) composer.addPass(ps)
    appliedKey = ''
    syncSize()
  }

  function teardown() {
    if (!composer || !passes) return
    for (const ps of composer.passes) ps.dispose()
    composer.renderTarget1.dispose()
    composer.renderTarget2.dispose()
    composer = null
    passes = null
    appliedKey = ''
  }

  /** 各 pass 的分辨率与「CSS 像素」换算系数 */
  function syncSize() {
    if (!passes) return
    const pr = renderer.getPixelRatio()
    const res = renderer.getDrawingBufferSize(new THREE.Vector2())
    for (const ps of [passes.kuwahara, passes.pigment, passes.comic, passes.pixel, passes.sketch, passes.tiltH, passes.tiltV, passes.grade]) {
      const u = ps.uniforms
      u.uRes?.value.copy(res)
      if (u.uScale) u.uScale.value = pr
    }
    passes.fxaa.uniforms.resolution.value.set(1 / Math.max(1, res.x), 1 / Math.max(1, res.y))
    passes.kuwahara.uniforms.uStep.value = Math.max(1, pr * 0.9)
    passes.pixel.uniforms.uPx.value = Math.round(5 * pr)
    if (current.tilt) {
      passes.tiltH.uniforms.uMax.value = current.tilt.max * pr
      passes.tiltV.uniforms.uMax.value = current.tilt.max * pr
    }
  }

  function apply() {
    if (!passes || !composer) return
    const look = current
    const key = look.id + '|' + sky.bg.join() + '|' + sky.night.toFixed(3) + '|' + low
    if (key === appliedKey) return
    appliedKey = key
    const p = passes
    // 泛光：效果自带的，和入夜后灯具的光晕取较强者
    // 阈值高、强度低：只在最亮的发光部件周围留一圈淡晕，不盖住灯具轮廓和屏幕边框
    const nightBloom = sky.night > 0.02 && !low ? { strength: 0.28 * sky.night, radius: 0.3, threshold: 0.82 } : undefined
    const bloom = nightBloom && (!look.bloom || nightBloom.strength > look.bloom.strength) ? nightBloom : look.bloom
    if (bloom && !p.bloom) {
      // 用到才建（mip 链占显存）
      const s = cssSize()
      p.bloom = new UnrealBloomPass(new THREE.Vector2(s.x, s.y), 1, 0.5, 0.8)
      composer.insertPass(p.bloom, 1)
    }
    if (p.bloom) {
      p.bloom.enabled = !!bloom
      if (bloom) {
        p.bloom.strength = bloom.strength
        p.bloom.radius = bloom.radius
        p.bloom.threshold = bloom.threshold
      }
    }
    // 背景：纸面类风格用自己的纸色，入夜时逐渐换成天色
    const ub = p.base.uniforms
    for (let i = 0; i < 3; i++) {
      const c = (ub['uBg' + i].value as THREE.Color).set(sky.bg[i])
      if (look.bg) c.lerp(new THREE.Color(look.bg[i]), 1 - sky.night)
    }
    p.kuwahara.enabled = p.pigment.enabled = look.stylize === 'watercolor'
    p.comic.enabled = look.stylize === 'comic'
    p.pixel.enabled = look.stylize === 'pixel'
    p.sketch.enabled = look.stylize === 'sketch'
    p.tiltH.enabled = p.tiltV.enabled = !!look.tilt
    if (look.tilt) {
      for (const ps of [p.tiltH, p.tiltV]) {
        ps.uniforms.uFocus.value = look.tilt.focus
        ps.uniforms.uBand.value = look.tilt.band
        ps.uniforms.uFall.value = look.tilt.fall
      }
    }
    const g = { ...NEUTRAL, ...look.grade }
    const u = p.grade.uniforms
    u.uExposure.value = g.exposure
    u.uContrast.value = g.contrast
    u.uSaturation.value = g.saturation
    u.uGain.value.set(g.gain)
    u.uShadowTint.value.set(...g.shadowTint)
    u.uHighTint.value.set(...g.highTint)
    u.uFade.value = g.fade
    u.uFadeColor.value.set(g.fadeColor)
    u.uMono.value = g.mono
    u.uSepia.value = g.sepia
    u.uHaze.value = g.haze * (1 - sky.night)
    u.uHazeColor.value.set(g.hazeColor)
    u.uVignette.value = g.vignette
    u.uVigColor.value.set(g.vignetteColor)
    u.uCA.value = g.ca
    u.uPaper.value = g.paper
    u.uGrain.value = g.grain
    syncSize()
  }

  /**
   * 渲染一帧前临时改材质，渲染完立即还原：
   * - 描边壳是不走光照、不做色彩空间转换的 ShaderMaterial：直接上屏时它的颜色值被当成 sRGB 显示，
   *   进了线性的 composer 后会被 Base 再转一次 sRGB 而变浅。这里先把颜色转回线性，保证和「原样」一样深；
   *   入夜再整体压暗（否则不受光照的描边在暗场景里会像霓虹灯）。
   * - 入夜：自发光材质（台灯、指示灯、屏幕）加亮，让泛光只落在灯上；窗玻璃透出暖光。
   * （更干净的做法是给 toon.ts 的描边着色器加一个 uniform，但那个文件不在本次改动范围内。）
   * 白天且不走 composer 时什么都不用改，不遍历场景。
   */
  function renderPatched(draw: () => void) {
    const night = sky.night
    const linear = !!composer
    if (!linear && night < 0.01) return draw()
    const outlines: [THREE.Color, THREE.Color][] = []
    const boosted: [THREE.MeshStandardMaterial, number][] = []
    const glass: [THREE.MeshStandardMaterial, THREE.Color, number][] = []
    const seen = new Set<THREE.Material>()
    scene.traverseVisible((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!m) return
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (seen.has(mat)) continue
        seen.add(mat)
        if (o.userData.isOutline) {
          const c = (mat as THREE.ShaderMaterial).uniforms?.uColor?.value as THREE.Color | undefined
          if (!c) continue
          outlines.push([c, c.clone()])
          // 把「当作 sRGB 显示的值」换算成线性值
          if (linear) c.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace)
          c.multiplyScalar(1 - 0.7 * night)
          continue
        }
        if (night < 0.01) continue
        const e = mat as THREE.MeshStandardMaterial
        if (!e.emissive) continue
        if (e.transparent && e.color?.getHexString() === GLASS_HEX) {
          glass.push([e, e.emissive.clone(), e.emissiveIntensity])
          e.emissive.copy(windowGlow)
          e.emissiveIntensity = night * (0.12 + 0.6 * indoor)
          continue
        }
        // 室内灯光模块自己管的灯罩 / 灯泡（按开关、色温控制）
        if (e.userData?.[LAMP_GLOW]) continue
        // 只加亮真正的灯和屏幕，浴缸水面、玻璃这类微微自发光的不算；纯黑 emissive 加亮也没用
        if (!(e.emissiveIntensity >= 0.3)) continue
        if (e.emissive.r + e.emissive.g + e.emissive.b < 0.01) continue
        // 加亮到上限为止（已经比上限亮的不动）：保留原色、画面和分格
        const cap = e.emissiveMap ? NIGHT_SCREEN_CAP : NIGHT_GLOW_CAP
        const v = e.emissiveIntensity
        if (v >= cap) continue
        boosted.push([e, v])
        e.emissiveIntensity = v + (cap - v) * night
      }
    })
    try {
      draw()
    } finally {
      for (const [c, orig] of outlines) c.copy(orig)
      for (const [e, v] of boosted) e.emissiveIntensity = v
      for (const [e, c, v] of glass) {
        e.emissive.copy(c)
        e.emissiveIntensity = v
      }
    }
  }

  const hook = {
    render() {
      if (!composer) return renderPatched(() => renderer.render(scene, camera))
      apply()
      renderPatched(() => composer!.render())
    },
    resize(w: number, h: number) {
      if (!composer) return
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, h)
      syncSize()
    },
  }

  /** 按当前效果与天色决定走不走 composer；keep 为真时不拆（生成缩略图途中） */
  function update(keep = false) {
    stage.outlineScale = current.outline ?? 1
    const need = current.id !== 'none' || sky.night > 0.02 || needFxaa()
    if (need && !composer) build()
    if (!need && !keep) teardown()
    // 白天「原样」：不接管，直接 renderer.render；夜里即使不走 composer 也要接管来调整材质
    stage.post = composer || sky.night >= 0.01 ? hook : null
  }

  return {
    setLook(id) {
      current = LOOK_MAP.get(id as LookId) ?? LOOK_MAP.get('none')!
      update()
    },
    setSky(bg, night) {
      sky = { bg, night }
      update()
    },
    withLook(id, fn) {
      const keep = current
      current = LOOK_MAP.get(id as LookId) ?? LOOK_MAP.get('none')!
      update(true)
      try {
        return fn()
      } finally {
        current = keep
        update(true)
      }
    },
    setIndoor(color, level) {
      windowGlow.copy(WINDOW_GLOW).lerp(color, 0.6)
      indoor = level
    },
    setLow(v) {
      if (v === low) return
      low = v
      // 多重采样数和 FXAA 都在建 composer 时决定：拆掉按新画质重建
      teardown()
      update()
    },
    dispose() {
      stage.post = null
      stage.outlineScale = 1
      teardown()
    },
  }
}
