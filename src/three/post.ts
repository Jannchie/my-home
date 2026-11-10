// 3D 沙盘的「画面效果」：一组可选的后处理风格（移轴微缩、暖阳、夜晚、胶片、水彩、漫画网点……）。
//
// 结构：
//   RenderPass（4× MSAA 半浮点目标，描边不起锯齿）
//   → [环境光遮蔽：画面增强（setFx）开了才有，墙角、家具贴地处压一道淡淡的冷色暗部]
//   → [体积光：画面增强里开、且在漫游时，窗口斜射进来的光柱（volumetric.ts）]
//   → [转折线：画面效果带 crease 时（「动画感」），倒角、门缝这些物体内部的转折描一条线（crease.ts）]
//   → [UnrealBloom 泛光，线性空间]
//   → 累积：镜头静止时每帧把投影抖动亚像素、和前几帧取平均（渐进式超采样，几何边缘、阴影边、细纹理的锯齿都抹平）；
//     镜头一动 / 场景一变就从头来（restart），所以没有拖影
//   → Base：线性转 sRGB，并把透明背景合成为与 CSS 一致的径向渐变底（之后的效果作用于整张画面）
//   → [风格化：水彩 / 漫画网点 / 像素 / 素描，各自一到两个 pass]
//   黑白漫画例外：材质输出编码（manga.ts），Manga pass 直接读 RenderPass 的结果出网点，替代 Base
//   → [移轴模糊：横、竖两遍]
//   → Grade：调色（曝光、对比、饱和、分离色调、褪色、单色 / 棕褐、雾感、暗角、色差、纸纹、颗粒）
// 选「无」时不建 composer，直接 renderer.render，零额外开销。
// 省电画质（setLow(true)，手机 / 低性能设备）：画布不开 MSAA，改为始终走 composer（目标不开多重采样），
// 末尾加一遍 FXAA；泛光（效果自带的、入夜灯光的）都关掉：泛光的 mip 链很吃填充率，各效果的泛光本来就很淡。
// 所有效果都是静态的（颗粒按像素坐标固定），沿用沙盘的按需渲染：画面没变就不重画。

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { isFurShell, setRealEnv, setRealStyle, swapToPbr } from './realistic'
import { setReflectReuse } from './reflectFrame'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { createDust, createVolumetric, DUST_BOX_ORBIT, DUST_BOX_WALK, updateDust, updateVolumetric } from './volumetric'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { createCrease, updateCrease } from './crease'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { mangaUniforms } from './manga'
import { isReflector } from './toon'
import { prerenderReflections } from './reflectFrame'
import { createGI, giUniforms, type GI } from './gi'
import { createFog, updateFog } from './fog'
import { LUT_SIZE, lutTexture } from './lut'
import { outlineUniforms } from './toon'
import { animeUniforms, MAX_WIN } from './anime'
import { currentLightMask, lightMaskUniforms, maskAt } from './lightMask'
import { HASH_NOISE } from './glslNoise'
import { isAdditive } from './blend'
import type { Stage } from './stage'

export type LookId = 'none' | 'anime' | 'real' | 'figure' | 'crt' | 'tiltshift' | 'warm' | 'cool' | 'film' | 'pastel' | 'watercolor' | 'comic' | 'manga' | 'manga-coarse' | 'manga-hatch' | 'manga-ink' | 'mono' | 'sepia' | 'pixel' | 'sketch' | 'illust'

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
  /**
   * 泛光：只取发光的东西（灯、屏幕、金属的硬边高光，见 anime.ts uGlowMark），受光再亮的表面不晕开。
   * threshold：亮度超过它的地方也泛一层柔光（粉彩、暖阳要的整体柔光）；不填 = 只有发光的东西
   */
  bloom?: { strength: number; radius: number; threshold?: number }
  /** 泛光光晕的颜色：色相（度）、强度（0 = 原色，1 = 很浓）；只染光晕，不改画面本身 */
  bloomTint?: { hue: number; amt: number }
  /** 描边粗细倍数 */
  outline?: number
  /** 画面风格化（一次只能一种）：水彩 / 漫画网点 / 黑白漫画（材质输出编码，manga.ts）/ 像素 / 素描 */
  stylize?: Stylize
  /**
   * 材质 / 光照风格：不填 = 赛璐璐（两档色阶、阴影色、冷暖灯光，anime.ts；Sandbox3D 按它切），大多数预设默认用它；
   * none = 原来的三档色阶、黑描边（黑白漫画系列要按明暗分档出网点，用这个）；
   * real = 写实光照：渲染时换成 PBR 材质（连续的明暗、木纹、布料、绒毛，realistic.ts），「写实」类预设用它
   */
  material?: 'none' | 'real'
  /** 不管画面增强的开关，总是开环境光遮蔽（写实要靠它压出墙角、家具底下的暗部） */
  ao?: boolean
  /**
   * 写实光照下遮蔽的画法：压向的颜色（线性空间的乘数）和浓度。写实是中性偏暖的灰、浓；
   * 动画感是淡淡的冷紫、轻（暗部是带颜色的，不是脏灰）。不填 = 写实的
   */
  aoShade?: [number, number, number, number]
  /** 写实光照下遮蔽的取样半径（cm）；不填用写实的 32（墙角、床底下一大片渐暗），动画感只要贴着的一圈 */
  aoRadius?: number
  /**
   * 灯光基调（Sandbox3D applyLights）：天光、阳光强度的倍数；up / down = 朝上的面（地板、台面）/ 朝下的面（天花板）受的天光往哪个颜色偏，
   * tint 偏多少；阳光往 sunColor 偏 sunTint；lamps：室内灯全开（动画感里灯总是亮着，暖色光晕是画面的一部分）。
   * 写实光照不填时用 REAL_LIGHTING
   */
  lighting?: { hemi: number; sun: number; up?: string; down?: string; tint?: number; sunColor?: string; sunTint?: number; lamps?: boolean }
  /** 光柱（体积光）浓度的倍数 */
  shafts?: number
  /** 手办 / 粘土质感（写实光照上叠的画法：包裹式漫反射、半光泽漆面、边缘光，realistic.ts setFigure） */
  figure?: boolean
  /** 写实光照上叠的白色边缘光强度（realistic.ts setRealStyle） */
  rim?: number
  /** 写实光照上叠的明暗交界冷暖对比强度 */
  term?: number
  /** 毛绒画成纯色、只在轮廓上有毛边（realistic.ts setRealStyle） */
  flatFur?: boolean
  /** 赛璐璐明暗（0–1）：阳光、灯光的漫反射收成亮暗两档，高光压弱（realistic.ts setRealStyle） */
  cel?: number
  /** 写实光照下阳光阴影的柔和程度（阴影半径，Sandbox3D）；不填用写实的默认 */
  softShadow?: number
  /**
   * 线性转 sRGB 之前做色调映射（写实：高光柔和地压下来，不再一片死白）。true = Khronos PBR Neutral（保色）
   */
  tone?: boolean
  /**
   * 大气雾（fog.ts）：密度（每米）、高度衰减（cm）、朝太阳那一侧带多少阳光色、最浓到多少。
   * 起雾的距离按镜头定：漫游时在房间尺度之外（屋里不起雾），鸟瞰时从视角焦点附近开始
   */
  fog?: { density: number; height: number; sun: number; max: number }
  /** 3D LUT 调色（lut.ts）的强度（0–1） */
  lut?: number
  /** 线条随距离淡出（描边变细到没有）：漫游时从 start 到 end（cm）；鸟瞰时从视角焦点往后 end - start；lift = 线色提亮、提饱和（0 = 深色线，1 = 带颜色的浅线） */
  line?: { start: number; end: number; lift: number }
  /** 间接光探针（gi.ts）的强度：按房间烘焙的球谐辐照度替换半球光（靠窗亮、深处暗、颜色互染）；不填 = 不用 */
  gi?: number
  /** 背景的天空（蓝天白云、夜里星空，animeSky.ts）：所有效果默认都有；false = 不要（透明背景上的天色渐变） */
  sky?: boolean
  /** 天空的积云：'volume' = 体积云（clouds.ts，光照像照片，写实用）；不填 = 画出来的动画云 */
  clouds?: 'volume'
  /** 镜头：显像管（弯曲屏幕、扫描线；可以和任何风格化叠加） */
  crt?: boolean
  /** 黑白漫画系列（stylize: 'manga'）的画法：网屏格子（CSS 像素）、是否补转折线、上网点 / 排线 / 只留实黑 */
  manga?: { cell: number; crease: boolean; tone: 'dot' | 'line' | 'ink' }
  /** 移轴：焦点（屏幕 y，0 底 1 顶）、清晰带半宽、过渡宽度、最大模糊半径（CSS 像素） */
  tilt?: { focus: number; band: number; fall: number; max: number }
  grade?: Partial<Grade>
  /** 转折线（crease.ts）的浓度：描边画不出来的倒角、门缝、台面转角也描一条线 */
  crease?: number
  /**
   * 插画（anime.ts 的 ILLUST_BODY）：按面的朝向平涂三档、纯色落影；描边和转折线都换成同一种暖墨色（ILLUST_INK）。
   * 值是平涂的强度，只在赛璐璐光照下起作用；入夜也是平涂（夜色底 + 灯光分档）
   */
  illust?: number
}

export type Stylize = 'watercolor' | 'comic' | 'manga' | 'pixel' | 'sketch'

/**
 * 画面效果分层，层与层可以组合：材质 / 光照（原样、动画感）、画面风格化（像素、水彩、网点、素描、黑白漫画）、
 * 镜头（移轴、显像管）、调色（曝光、对比、饱和、暗角、颗粒）、泛光、描边、转折线。
 * 预设（LOOKS）是这些参数的组合；用户在预设上调过的参数记成 LookAdjust（只记改过的），resolveLook 合起来交给后处理。
 */
export interface LookAdjust {
  material?: 'none' | 'anime' | 'real'
  sky?: boolean
  /** 'none' = 不风格化；黑白漫画的预设不能换风格化（它替换了整条管线） */
  stylize?: 'none' | Exclude<Stylize, 'manga'>
  tilt?: boolean
  crt?: boolean
  /** 泛光强度（0 = 关） */
  bloom?: number
  outline?: number
  crease?: number
  exposure?: number
  contrast?: number
  saturation?: number
  vignette?: number
  grain?: number
  /** 暗部 / 亮部色调（分离色调）：色相（度，0 = 红，120 = 绿，240 = 蓝）和强度 */
  shadowHue?: number
  shadowAmt?: number
  highHue?: number
  highAmt?: number
  /** 泛光光晕的颜色（LookDef.bloomTint） */
  bloomHue?: number
  bloomAmt?: number
}
export type LookAdjustKey = keyof LookAdjust

// 分离色调的偏移量（RGB 各加多少）↔ 色相 + 强度：在去掉亮度的色度平面上量角度（TU 指向红，TV 指向绿、背向蓝）
const TU = [2 / Math.sqrt(6), -1 / Math.sqrt(6), -1 / Math.sqrt(6)] as const
const TV = [0, 1 / Math.sqrt(2), -1 / Math.sqrt(2)] as const
/** 强度是 0 时色相没有意义：暗部默认蓝紫、亮部默认暖橙（拖强度时从这里开始） */
const TINT_HUE = { shadow: 250, high: 40, bloom: 25 }
function tintHue(t: readonly number[], fallback: number) {
  const x = t[0] * TU[0] + t[1] * TU[1] + t[2] * TU[2]
  const y = t[0] * TV[0] + t[1] * TV[1] + t[2] * TV[2]
  const amt = Math.hypot(x, y)
  return { hue: amt < 1e-4 ? fallback : Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360), amt: Math.round(amt * 1000) / 1000 }
}
export function hueTint(hue: number, amt: number): [number, number, number] {
  const a = (hue * Math.PI) / 180
  const x = Math.cos(a) * amt
  const y = Math.sin(a) * amt
  return [TU[0] * x + TV[0] * y, TU[1] * x + TV[1] * y, TU[2] * x + TV[2] * y]
}
/** 泛光光晕乘的颜色：白往这个色相偏，亮度（Rec.709）保持 1，染色不会让光晕变亮变暗 */
export function bloomTintColor(t: { hue: number; amt: number } | undefined, out = new THREE.Vector3()) {
  if (!t || t.amt <= 0) return out.set(1, 1, 1)
  const [r, g, b] = hueTint(t.hue, t.amt * 1.2).map((v) => Math.max(0, 1 + v))
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return out.set(r / l, g / l, b / l)
}
/** 色相对应的颜色（界面上的色块） */
export function hueSwatch(hue: number) {
  const [r, g, b] = hueTint(hue, 0.45).map((v) => Math.round(Math.min(1, Math.max(0, 0.55 + v)) * 255))
  return `rgb(${r}, ${g}, ${b})`
}

/** 只在写实光照下起作用的参数（写实类预设换回卡通光照时清掉）：LookDef 加了写实专用的字段要补进来 */
const REAL_ONLY = ['lighting', 'aoShade', 'aoRadius', 'figure', 'softShadow', 'rim', 'term', 'flatFur', 'cel', 'gi', 'fog'] as const satisfies readonly (keyof LookDef)[]

/** 调色类参数（直接写进 grade） */
const GRADE_KEYS = ['exposure', 'contrast', 'saturation', 'vignette', 'grain'] as const

/** 预设 id + 用户调整 → 交给后处理的完整参数。没有调整时就是预设本身 */
export function resolveLook(id: string, adj: LookAdjust = {}): LookDef {
  const base = LOOK_MAP.get(id as LookId) ?? LOOK_MAP.get('none')!
  if (!Object.keys(adj).length) return base
  const out: LookDef = { ...base, grade: { ...base.grade } }
  if (adj.material !== undefined) {
    out.material = adj.material === 'anime' ? undefined : adj.material
    // 写实要的 AO、色调映射跟着材质走（不管是不是写实预设）；其它预设换成写实时描边、转折线没有意义
    out.ao = adj.material === 'real' || (base.material === 'real' ? false : base.ao)
    out.tone = adj.material === 'real' ? (base.material === 'real' ? base.tone : true) : base.material === 'real' ? false : base.tone
    if (adj.material === 'real') {
      out.outline = 0
      out.crease = 0
    } else if (base.material === 'real') {
      // 写实类预设换回卡通光照：写实专用的灯光基调、遮蔽画法不要
      for (const k of REAL_ONLY) delete out[k]
    }
  }
  if (adj.sky !== undefined) out.sky = adj.sky
  if (adj.stylize !== undefined && base.stylize !== 'manga') out.stylize = adj.stylize === 'none' ? undefined : adj.stylize
  if (adj.tilt !== undefined) out.tilt = adj.tilt ? (base.tilt ?? LOOK_MAP.get('tiltshift')!.tilt) : undefined
  if (adj.crt !== undefined) out.crt = adj.crt
  if (adj.bloom !== undefined) out.bloom = adj.bloom > 0 ? { radius: base.bloom?.radius ?? 0.5, threshold: base.bloom?.threshold, strength: adj.bloom } : undefined
  if (adj.outline !== undefined) out.outline = adj.outline
  if (adj.crease !== undefined) out.crease = adj.crease
  for (const k of GRADE_KEYS) if (adj[k] !== undefined) out.grade![k] = adj[k]
  for (const [side, tk] of [['shadow', 'shadowTint'], ['high', 'highTint']] as const) {
    const hk = `${side}Hue` as const
    const ak = `${side}Amt` as const
    if (adj[hk] === undefined && adj[ak] === undefined) continue
    const now = tintHue(base.grade?.[tk] ?? NEUTRAL[tk], TINT_HUE[side])
    out.grade![tk] = hueTint(adj[hk] ?? now.hue, adj[ak] ?? now.amt)
  }
  if (adj.bloomHue !== undefined || adj.bloomAmt !== undefined)
    out.bloomTint = { hue: adj.bloomHue ?? base.bloomTint?.hue ?? TINT_HUE.bloom, amt: adj.bloomAmt ?? base.bloomTint?.amt ?? 0 }
  return out
}

/** 某个参数在这套效果里现在的值（界面的滑杆、开关用） */
export function lookValue(def: LookDef, k: LookAdjustKey): number | boolean | string {
  switch (k) {
    case 'material':
      return def.material ?? 'anime'
    case 'sky':
      return def.sky !== false
    case 'stylize':
      return def.stylize ?? 'none'
    case 'tilt':
      return !!def.tilt
    case 'crt':
      return !!def.crt
    case 'bloom':
      return def.bloom?.strength ?? 0
    case 'outline':
      return def.outline ?? 1
    case 'crease':
      return creaseOf(def)
    case 'bloomHue':
      return def.bloomTint?.hue ?? TINT_HUE.bloom
    case 'bloomAmt':
      return def.bloomTint?.amt ?? 0
    case 'shadowHue':
    case 'shadowAmt':
    case 'highHue':
    case 'highAmt': {
      const side = k.startsWith('shadow') ? 'shadow' : 'high'
      const v = tintHue(def.grade?.[`${side}Tint`] ?? NEUTRAL[`${side}Tint`], TINT_HUE[side])
      return k.endsWith('Hue') ? v.hue : v.amt
    }
    default:
      return def.grade?.[k] ?? NEUTRAL[k]
  }
}

/** 参数变了才重设 uniform：按对象缓存序列化结果（resolveLook 每次调整都返回新对象，预设本身是同一个对象） */
const lookKeys = new WeakMap<LookDef, string>()
function lookKey(d: LookDef) {
  let k = lookKeys.get(d)
  if (k === undefined) lookKeys.set(d, (k = JSON.stringify(d)))
  return k
}

/** 转折线浓度：预设没写时，动画感光照下默认 0.6（倒角、门缝、台面转角也有线），原来的光照（黑白漫画）下不画 */
const creaseOf = (d: LookDef) => d.crease ?? (d.material ? 0 : 0.6)

/** 这套效果什么都不做（不用建后处理）；low：省电画质不开泛光、转折线，只带这两样的效果也算 */
const plainLook = (d: LookDef, low = false) =>
  !d.stylize && !d.crt && !d.tilt && (low || (!d.bloom && !creaseOf(d))) && !d.bg && (d.outline ?? 1) === 1 && Object.entries(d.grade ?? {}).every(([k, v]) => JSON.stringify(v) === JSON.stringify(NEUTRAL[k as keyof Grade]))

const DEFAULT_BG: [string, string, string] = ['#fdfdfb', '#f1f3ef', '#e3e9e5']

export const LOOKS: LookDef[] = [
  // 自然：不调色、不描粗，只有一点很轻的泛光（灯泡、屏幕这些发光的东西晕开一点）
  { id: 'none', label: '自然', desc: '清楚干净，只有一点柔和的泛光', bloom: { strength: 0.1, radius: 0.5 } },
  // 动画感：参考新海诚、京阿尼的室内背景美术。赛璐璐光照（两档明暗、带颜色的阴影，anime.ts），窗口的光斑、光柱和浮尘（volumetric.ts），
  // 深色线条（描边 + 转折线），亮部偏暖、暗部偏冷紫，灯具带暖晕；背景是蓝天白云（animeSky.ts）。
  // 以前用写实光照（PBR 上收两档明暗）：明暗还是连续的渐变，看起来不像画出来的
  {
    id: 'anime',
    label: '动画',
    desc: '利落的明暗加深色线条，像动画电影里的室内背景',
    // 遮蔽按赛璐璐的画法：贴着的一圈收成一块淡淡的阴影色，不是写实的灰色渐变
    ao: true,
    // 线条：外轮廓和物体内部的转折都描上清楚的深色线（参考手绘的室内背景，线是画面的骨架）
    outline: 1.1,
    crease: 0.9,
    // 远处的线变细到没有：窗外的栏杆、鸟瞰时院子后头不糊成一团黑
    line: { start: 600, end: 1600, lift: 0 },
    // 冷暖：天光照朝上的面（地板、台面）偏暖、朝下的面（天花板）偏冷紫，阳光偏金橙；亮度不另加（赛璐璐光照自己会提亮天光）。
    // 灯按「室内灯光」的设置走：赛璐璐没有色调映射，白天灯全开会把整个室内冲白
    lighting: { hemi: 1, sun: 1, up: '#f0e2cf', down: '#cdc8dc', tint: 0.35, sunColor: '#ffcb94', sunTint: 0.35 },
    // 间接光（gi.ts）：靠窗亮、深处暗，照到阳光的地板把暖色反到墙上；赛璐璐下按半档光圈分档（一块一块的明暗，不是连续渐变）
    gi: 1,
    shafts: 0.9,
    // 泛光只取发光的东西（灯泡、屏幕、金属高光），阳光照亮的白墙不晕
    bloom: { strength: 0.16, radius: 0.5 },
    // 墙面是奶油色而不是橘色：整体饱和度略压，暗部的淡紫保留
    grade: { exposure: 1.06, contrast: 1.04, saturation: 0.96, shadowTint: [0.0, -0.008, 0.025], highTint: [0.016, 0.006, -0.012], vignette: 0.2, vignetteColor: '#2e2440' },
  },
  // 插画：参考手绘的等距插画（一种墨色的线、外粗内细，按朝向分三档的平涂，纯色的蓝紫落影，纸纹贴在表面上，anime.ts）。
  // 背景是干净的米色纸，不要天空
  {
    id: 'illust',
    label: '插画',
    desc: '暖墨色线条、按朝向分三档的平涂和纯色落影，像手绘的插画',
    bg: ['#f3f0e7', '#efebe1', '#e6e0d2'],
    sky: false,
    illust: 1,
    outline: 1.8,
    crease: 0.8,
    grade: { contrast: 1.02 },
  },
  // 写实（realistic.ts）：PBR 材质 + 环境反射、Khronos PBR Neutral 色调映射（保色，见 BaseShader）、环境光遮蔽，不描边；目标是接近室内照片的光感
  {
    id: 'real',
    label: '写实',
    desc: 'PBR 材质、柔和的明暗与反光，接近照片',
    material: 'real',
    ao: true,
    tone: true,
    outline: 0,
    crease: 0,
    clouds: 'volume',
    // 间接光（gi.ts）：按房间烘焙的球谐探针替换屋里的半球光，靠窗亮、深处暗、地板的颜色反到墙上；
    // 大气雾（fog.ts）：鸟瞰时房子后半截、院子退进空气里，漫游时屋里不起雾
    gi: 1,
    fog: { density: 0.03, height: 350, sun: 0.12, max: 0.5 },
    bloom: { strength: 0.1, radius: 0.5 },
    grade: { exposure: 1.12, contrast: 1.06, saturation: 1.05, vignette: 0.18 },
    lighting: { hemi: 1.05, sun: 1.45 },
  },
  // 手办 / 粘土：光滑的半光泽漆面、又软又宽的明暗过渡（交界带一点透光的暖色）、轮廓上一圈柔光；
  // 影棚式的中性暖光、柔和的影子、带暖色的轻 AO；细描边和转折线勾出造型；轻微移轴，像在拍桌上的模型
  {
    id: 'figure',
    label: '手办',
    desc: '柔和的漆面与透光感，像桌上的手办、粘土模型',
    material: 'real',
    figure: true,
    rim: 0.6,
    term: 1,
    ao: true,
    tone: true,
    outline: 0.6,
    crease: 0.5,
    softShadow: 4,
    lighting: { hemi: 1.15, sun: 1.3, up: '#fff1e4', down: '#ebe0f2', tint: 0.4, sunColor: '#fff0dc', sunTint: 0.3 },
    aoShade: [0.82, 0.74, 0.72, 1.4],
    shafts: 0.5,
    bloom: { strength: 0.12, radius: 0.5 },
    tilt: { focus: 0.45, band: 0.1, fall: 0.35, max: 6 },
    grade: { exposure: 1.1, contrast: 0.98, saturation: 1.12, vignette: 0.15 },
  },
  {
    id: 'watercolor',
    label: '水彩',
    desc: '色块晕开、边缘积色，透出纸纹',
    bg: ['#fcfaf5', '#f6f1e7', '#ece4d4'],
    stylize: 'watercolor',
    outline: 0.8,
    grade: { saturation: 0.92, exposure: 1.03, contrast: 0.95, paper: 0.55, vignette: 0.15, vignetteColor: '#7a6040' },
  },
  {
    id: 'sketch',
    label: '素描',
    desc: '铅笔线条与排线，画在纸上',
    bg: ['#fbf9f3', '#f6f2e8', '#ece6d8'],
    stylize: 'sketch',
    outline: 1.1,
    grade: { paper: 0.35, vignette: 0.12, vignetteColor: '#6a5a40' },
  },
  {
    id: 'comic',
    label: '网点',
    desc: '阴影换成网点，描边加粗',
    bg: ['#ffffff', '#fbfbf8', '#f2f2ec'],
    stylize: 'comic',
    outline: 1.7,
    grade: { saturation: 1.1, contrast: 1.05 },
  },
  {
    id: 'manga',
    label: '漫画',
    desc: '按固有色和明暗分档，细网点加转折线',
    stylize: 'manga',
    material: 'none',
    manga: { cell: 4.5, crease: true, tone: 'dot' },
    outline: 1.4,
    grade: { paper: 0.12 },
  },
  {
    id: 'manga-coarse',
    label: '粗网',
    desc: '大颗网点、只描外轮廓，像放大印刷的旧漫画',
    stylize: 'manga',
    material: 'none',
    manga: { cell: 7, crease: false, tone: 'dot' },
    outline: 1.5,
    grade: { paper: 0.12 },
  },
  {
    id: 'manga-hatch',
    label: '排线',
    desc: '斜排线代替网点，暗部交叉排线',
    stylize: 'manga',
    material: 'none',
    manga: { cell: 5, crease: true, tone: 'line' },
    outline: 1.4,
    grade: { paper: 0.12 },
  },
  {
    id: 'manga-ink',
    label: '墨稿',
    desc: '只留墨线与实黑，像上网点前的原稿',
    stylize: 'manga',
    material: 'none',
    manga: { cell: 5, crease: true, tone: 'ink' },
    outline: 1.3,
    grade: { paper: 0.12 },
  },
  {
    id: 'warm',
    label: '暖阳',
    desc: '整体偏暖橙，柔和泛光与暗角',
    bloom: { strength: 0.2, radius: 0.5, threshold: 0.9 },
    grade: { gain: '#fff3e2', exposure: 1.03, saturation: 1.08, contrast: 1.04, shadowTint: [0.02, 0.0, -0.025], highTint: [0.025, 0.01, -0.018], vignette: 0.32, vignetteColor: '#3a1e08' },
  },
  {
    id: 'cool',
    label: '冷雾',
    desc: '清冷的蓝灰、低对比，带一层薄雾',
    grade: { gain: '#f2f7ff', contrast: 0.88, saturation: 0.86, exposure: 1.03, shadowTint: [-0.01, 0.005, 0.03], haze: 0.22, hazeColor: '#e9f1f7', fade: 0.06, fadeColor: '#cfdce6' },
  },
  {
    id: 'pastel',
    label: '粉彩',
    desc: '提亮、降饱和，一层柔光',
    bloom: { strength: 0.16, radius: 0.8, threshold: 0.78 },
    grade: { exposure: 1.03, contrast: 0.86, saturation: 0.78, gain: '#fff8fb', highTint: [0.015, 0.0, 0.02], fade: 0.1, fadeColor: '#f4e4ee' },
  },
  {
    id: 'film',
    label: '胶片',
    desc: '褪色、偏暖绿，带颗粒和一点色差',
    grade: { contrast: 0.92, saturation: 0.8, gain: '#fff6e6', shadowTint: [-0.015, 0.02, 0.01], highTint: [0.03, 0.015, -0.03], fade: 0.12, fadeColor: '#2a2620', ca: 1.4, vignette: 0.5, vignetteColor: '#1a120a', grain: 0.075 },
  },
  {
    id: 'mono',
    label: '黑白',
    desc: '只留明暗，像一张黑白照片',
    grade: { mono: 1, contrast: 1.1, exposure: 1.02, vignette: 0.3, grain: 0.03 },
  },
  {
    id: 'sepia',
    label: '旧照',
    desc: '暖棕单色、褪色暗角，像旧相册',
    grade: { sepia: 1, contrast: 0.95, fade: 0.08, fadeColor: '#3a2a1a', vignette: 0.55, vignetteColor: '#2a1808', grain: 0.05 },
  },
  {
    id: 'tiltshift',
    label: '微缩',
    desc: '上下虚化、颜色更鲜，像拍桌上的模型',
    tilt: { focus: 0.45, band: 0.06, fall: 0.3, max: 12 },
    grade: { saturation: 1.22, contrast: 1.06, exposure: 1.03, vignette: 0.22 },
  },
  {
    id: 'pixel',
    label: '像素',
    desc: '降低分辨率、限制色阶，像老游戏',
    stylize: 'pixel',
    grade: { saturation: 1.12, contrast: 1.04 },
  },
  {
    id: 'crt',
    label: '荧屏',
    desc: '老电视的弯曲屏幕、扫描线和荧光栅格',
    crt: true,
    outline: 1.3,
    grade: { saturation: 1.22, contrast: 1.1, exposure: 0.98 },
  },
]

/**
 * 入夜时自发光部件的亮度上限（emissiveIntensity）：屏幕、指示灯等到 0.6（加上受到的灯光，约为原色的 1.2–1.5 倍），
 * 屏幕（带画面贴图的）更低一点，保留画面内容；以前是统一乘 2.5，夜里会过曝成一片白、看不出造型和画面。
 */
const NIGHT_GLOW_CAP = 0.6

/** 「插画」的墨色（线性）：偏暖的近黑，不是纯黑 */
const ILLUST_INK = new THREE.Color('#231e16')
/** 描边 / 转折线的统一墨色 uniform（rgb = 墨色 × k，w = 换成它的程度）：on 为假时不换 */
function setInk(v: THREE.Vector4, on: boolean, k = 1) {
  if (on) v.set(ILLUST_INK.r * k, ILLUST_INK.g * k, ILLUST_INK.b * k, 1)
  else v.w = 0
}
const NIGHT_SCREEN_CAP = 0.55

/** 浮尘的亮度 */
const DUST_STRENGTH = 2.2
/** 鸟瞰时浮尘的亮度倍数：远看整屋的颗粒叠在一起，要淡得多 */
const DUST_ORBIT = 0.3
/** 多帧累积：收敛到第几帧就停（之后按这个权重滑动平均，浮尘这类一直在动的东西不会拖太长的影） */
const ACCUM_FRAMES = 16
/** 赛璐璐漫游时间接光的倍数（屋里高调：暗部是明亮的阴影色，不是昏暗） */
const CEL_WALK_GI = 2.2
const tmpSun = new THREE.Vector3()
/** 场景里有东西在动时累积帧数压到这里（这一帧的权重至少 1 / (ACCUM_SETTLE + 1)） */
const ACCUM_SETTLE = 7
/** 累积那一遍最多认几个动着的角色的屏幕矩形（这一帧的 + 上一帧的各一半） */
const ACCUM_MOVERS = 8

/** 白天雾色往这个淡天蓝偏 */
const FOG_SKY = new THREE.Color('#bcd6f0')
/** 漫游时从多远开始起雾（cm）：比一般房间的进深远，屋里不起雾 */
const WALK_FOG_START = 900
/** 鸟瞰时从视角焦点往前多少开始起雾（cm） */
const ORBIT_FOG_BACK = 300

/** 漫游时后处理描线的视线焦点距离（cm）：内部的转折线从这里往外渐淡 */
const WALK_LINE_FOCUS = 300

/** 漫游体积光的浓度（每厘米光路的散射量） */
const VOL_STRENGTH = 0.0028

/**
 * 写实的环境反射按这个亮度算 1（天光强度 × 亮度）：白天的天光 1.5 × 写实的 1.05 × 天色的亮度约 0.92。
 * 环境贴图是固定的（realistic.ts），反射的强弱、冷暖跟着这时候屋里实际有多少光
 */
const ENV_LIGHT_REF = 1.45
/** 室内灯全开时算进环境反射的光（和天光同一个量纲）：夜里开着灯，反射大约是白天的一半 */
const ENV_LAMP = 0.7
/** 环境反射最多到白天的多少倍（白天又开着灯时不再往上加） */
const ENV_LIGHT_MAX = 1.25
const envLight = new THREE.Color()

/** 写实遮蔽的默认画法：中性偏暖的灰、浓（LookDef.aoShade） */
const REAL_AO_SHADE: [number, number, number, number] = [0.36, 0.34, 0.33, 2.2]
/** 写实光照没写灯光基调时的默认（LookDef.lighting）：阳光加强、天光照常 */
export const REAL_LIGHTING: NonNullable<LookDef['lighting']> = { hemi: 1.05, sun: 1.45 }

export const LOOK_MAP = new Map(LOOKS.map((l) => [l.id, l]))

// ---------- 着色器 ----------

/** 预编译后处理各遍时挂材质用的几何（不画，只是 compile 要一个网格） */
const QUAD = new THREE.PlaneGeometry(2, 2)

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

/** 各 pass 共用的小函数：亮度、hash、值噪声 */
const COMMON = /* glsl */ `
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  ${HASH_NOISE}
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
    uTone: { value: 0 },
    /** 线性空间的曝光倍数：只有带色调映射的效果用（其余效果的曝光还在 Grade 里，这里是 1） */
    uExposure: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uBg0, uBg1, uBg2;
    uniform float uTone, uExposure;
    // Khronos PBR Neutral：three 自带的实现（toneMappingExposure 由渲染器按 1 填）。比 AgX 保色：家具配色是按原色调好的
    #include <common>
    #include <tonemapping_pars_fragment>
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
      // 曝光要在色调映射之前乘（线性空间）：放在后面的调色里乘，刚被色调映射柔和压下来的高光又会顶到 1 以上、剪成一片死白。
      // 背景（透明处的渐变底）不过色调映射，照旧只乘曝光
      vec3 col = t.rgb * uExposure;
      if (uTone > 0.5) col = NeutralToneMapping(col);
      gl_FragColor = vec4(toSRGB(col + toLinear(bg) * uExposure * (1.0 - a)), 1.0);
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

/**
 * 黑白漫画系列：读材质输出的编码（manga.ts：R = 档位 / 4，1 为墨线；GB = 视空间法线 xy），不读颜色。
 * 档位已经在材质里按固有色 + 明暗算好，这里只管怎么画：
 *   网点：整页对齐的 45° 圆点网屏（各档同一张网屏，相邻区域之间不出摩尔纹），浅 / 深两档覆盖率 18% / 42%
 *   排线：45° 斜线，深档再叠一层反向斜线
 *   墨线稿：不上网点，只留实黑
 * 转折线：相邻像素法线夹角超过约 37° 处补一条细线（同一物体的两个面落进同一档时，靠它把形体画出来）。
 * 输入是预乘的（清屏处 alpha 为 0）：先除回 alpha 再解码，背景按 alpha 合成纸色（入夜铺一层深档）。
 */
const MangaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScale: { value: 1 },
    uNight: { value: 0 },
    /** 网屏格子（CSS 像素） */
    uCell: { value: 4.5 },
    uCrease: { value: 1 },
    /** 0 网点、1 排线、2 墨线稿 */
    uTone: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uScale, uNight, uCell, uCrease, uTone;
    varying vec2 vUv;
    vec4 enc(vec2 uv) {
      vec4 t = texture2D(tDiffuse, uv);
      return vec4(t.rgb / max(t.a, 1e-3), clamp(t.a, 0.0, 1.0));
    }
    vec3 nrm(vec4 e) {
      vec2 xy = e.gb * 2.0 - 1.0;
      return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
    }
    float dotInk(float c, float cell) {
      vec2 rp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (vUv * uRes) / cell;
      float d = length(fract(rp) - 0.5);
      // 圆点面积 = 覆盖率
      float r = sqrt(c / 3.14159);
      float aa = 0.7 / cell;
      return 1.0 - smoothstep(r - aa, r + aa, d);
    }
    float lineInk(float c, float cell, float dir) {
      vec2 p = vUv * uRes;
      float d = abs(fract((p.x + dir * p.y) * 0.7071 / cell) - 0.5) * 2.0;
      float aa = 1.0 / cell;
      return 1.0 - smoothstep(c - aa, c + aa, d);
    }
    float toneInk(float lv, float cell) {
      if (lv > 2.5) return 1.0;
      if (lv < 0.5 || uTone > 1.5) return 0.0;
      if (uTone > 0.5) {
        float h = lineInk(lv < 1.5 ? 0.18 : 0.24, cell, 1.0);
        return lv < 1.5 ? h : max(h, lineInk(0.24, cell, -1.0));
      }
      return dotInk(lv < 1.5 ? 0.18 : 0.42, cell);
    }
    float creaseWith(vec3 n0, vec2 off) {
      vec4 e1 = enc(vUv + off);
      if (e1.a < 0.99 || e1.r > 0.875) return 0.0;
      return 1.0 - smoothstep(0.78, 0.9, dot(n0, nrm(e1)));
    }
    void main() {
      vec4 e = enc(vUv);
      float cell = uCell * uScale;
      float line = smoothstep(0.8, 0.95, e.r);
      float ink = max(toneInk(floor(min(e.r * 4.0, 3.0) + 0.5), cell), line);
      if (uCrease > 0.5 && e.a > 0.99 && line < 0.01) {
        vec3 n0 = nrm(e);
        vec2 px = uScale / uRes;
        ink = max(ink, max(creaseWith(n0, vec2(px.x, 0.0)), creaseWith(n0, vec2(0.0, px.y))));
      }
      ink = mix(toneInk(uNight > 0.5 ? 2.0 : 0.0, cell), ink, e.a);
      gl_FragColor = vec4(mix(vec3(0.985, 0.98, 0.965), vec3(0.09, 0.085, 0.1), ink), 1.0);
    }`,
}

/** 像素：按格子取 4 点平均（下采样），再用 4×4 Bayer 抖动量化色阶 */
const PixelShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPx: { value: 4 },
    uLevels: { value: 20 },
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
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 cell = floor(vUv * uRes / uPx);
      vec2 c0 = (cell + 0.5) * uPx / uRes;
      vec2 o = uPx * 0.3 / uRes;
      // 取格子中心那一点（不平均：平均会把描边抹成灰色的糊边）；格子里有明显更暗的描边，就用描边色（1px 的线不会丢）
      vec3 c = texture2D(tDiffuse, c0).rgb;
      vec3 k[4];
      k[0] = texture2D(tDiffuse, c0 + vec2(-o.x, -o.y)).rgb;
      k[1] = texture2D(tDiffuse, c0 + vec2(o.x, -o.y)).rgb;
      k[2] = texture2D(tDiffuse, c0 + vec2(-o.x, o.y)).rgb;
      k[3] = texture2D(tDiffuse, c0 + vec2(o.x, o.y)).rgb;
      for (int i = 0; i < 4; i++) if (luma(k[i]) < luma(c) - 0.28) c = k[i];
      float n = uLevels - 1.0;
      float d = bayer(cell) * 0.12;
      vec3 q = floor(c * n + 0.5 + d) / n;
      // 近灰色（背景渐变、白墙）按亮度整体量化，避免各通道分别取整后串出彩色色带
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float ql = floor(l * n + 0.5 + d) / n;
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(c + (ql - l), q, smoothstep(0.03, 0.1, chroma));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}

/**
 * CRT 显像管：屏幕弯曲（桶形）+ 圆角黑框、低分辨率的扫描线（亮的地方光束更粗）、RGB 荧光栅格、
 * 一点色差（红蓝错开）、扫描线之间透出的辉光、暗角。分辨率按 CSS 像素算（uScale），高清屏上格子不会变小
 */
const CrtShader = {
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
    vec2 warp(vec2 uv) {
      vec2 c = uv * 2.0 - 1.0;
      c *= 1.0 + c.yx * c.yx * vec2(0.045, 0.065);
      return c * 0.5 + 0.5;
    }
    void main() {
      vec2 uv = warp(vUv);
      // 屏幕外（弯曲后露出的角）和圆角：黑框
      vec2 e = min(uv, 1.0 - uv);
      vec2 rc = max(vec2(0.018) - e, 0.0);
      float inside = 1.0 - smoothstep(0.012, 0.018, length(rc)) ;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) inside = 0.0;
      // 扫描线：每 4 个 CSS 像素一行；水平方向也按同样的格子取样
      float lines = uRes.y / (4.0 * uScale);
      float cols = lines * uRes.x / uRes.y;
      float y = uv.y * lines;
      vec2 cell = vec2((floor(uv.x * cols) + 0.5) / cols, (floor(y) + 0.5) / lines);
      float ca = 0.6 / cols;
      vec3 c;
      c.r = texture2D(tDiffuse, cell + vec2(ca, 0.0)).r;
      c.g = texture2D(tDiffuse, cell).g;
      c.b = texture2D(tDiffuse, cell - vec2(ca, 0.0)).b;
      // 相邻两格混一点：显像管的电子束是软的
      vec3 nb = texture2D(tDiffuse, cell + vec2(1.0 / cols, 0.0)).rgb + texture2D(tDiffuse, cell - vec2(1.0 / cols, 0.0)).rgb;
      c = mix(c, nb * 0.5, 0.2);
      // 光束：越亮越粗（扫描线之间的黑缝被亮色填上）
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float dist = abs(fract(y) - 0.5);
      float w = mix(0.24, 0.42, l);
      float beam = exp(-dist * dist / (2.0 * w * w)) * 1.05;
      // 抗摩尔纹：弯曲后扫描线在屏幕上的周期接近像素（边角、缩小看时）就淡成平均亮度，不出干涉条纹
      float avg = w * 2.5066 * 1.05;
      beam = mix(beam, avg, smoothstep(0.2, 0.45, fwidth(y)));
      vec3 col = c * beam;
      // 荧光栅格：每 3 个 CSS 像素一组 R / G / B 竖条，压得很淡（太强会和扫描线干涉出摩尔纹）
      float m = mod(floor(gl_FragCoord.x / max(1.0, floor(uScale + 0.5))), 3.0);
      vec3 mask = m < 0.5 ? vec3(1.05, 0.95, 0.95) : m < 1.5 ? vec3(0.95, 1.05, 0.95) : vec3(0.95, 0.95, 1.05);
      col *= mask;
      // 辉光：周围的亮色透过来一点
      vec3 glow = (texture2D(tDiffuse, cell + vec2(0.0, 2.0 / lines)).rgb + texture2D(tDiffuse, cell - vec2(0.0, 2.0 / lines)).rgb + nb) * 0.25;
      col += glow * glow * 0.1;
      // 暗角
      vec2 v = vUv - 0.5;
      col *= 1.0 - dot(v, v) * 0.9;
      gl_FragColor = vec4(mix(vec3(0.03, 0.03, 0.035), col, inside), 1.0);
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
/** 没开 LUT 时挂的占位（1³） */
const BLANK_LUT = new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1)
BLANK_LUT.needsUpdate = true

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
    uLut: { value: BLANK_LUT as THREE.Data3DTexture },
    uLutMix: { value: 0 },
    /** 对比度用不剪切的 S 曲线（带色调映射的效果）；0 = 原来的直线 */
    uSCurve: { value: 0 },
    /** 过曝处保色相（黑白漫画读的是编码，不开） */
    uShoulder: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform highp sampler3D uLut;
    uniform float uLutMix, uSCurve, uShoulder;
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
      if (uSCurve > 0.5 && uContrast > 1.0) {
        // 直线的对比（绕 0.5 拉开）两头都会剪切：亮部顶成死白、暗部压成死黑。换成 S 曲线（smoothstep，中点斜率 1.5）
        // 按比例混进来，中点的斜率还是 uContrast，两头贴着 0 和 1 收住；超过 1.5 的那一点再按直线补
        float k = min((uContrast - 1.0) * 2.0, 1.0);
        vec3 x = clamp(c, 0.0, 1.0);
        c = mix(c, x * x * (3.0 - 2.0 * x), k);
        c = (c - 0.5) * (uContrast / (1.0 + 0.5 * k)) + 0.5;
      } else c = (c - 0.5) * uContrast + 0.5;
      float l = luma(c);
      c = mix(vec3(l), c, uSaturation);
      c += mix(uShadowTint, uHighTint, smoothstep(0.15, 0.85, l));
      c *= uGain;
      // 过曝处保色相：逐通道剪到 1 时，先顶到头的通道不再涨、别的还在涨，颜色就偏了（阳光下的奶油色墙偏成柠檬黄，
      // 暖色灯下的木头偏黄绿）。最大的通道超过 1 时，色相按剪切之前的算，最亮、最暗的两个通道和直接剪切完全一样，
      // 只把中间那个通道摆回原来的色相上；没过曝的像素（三个通道都不到 1）一点不变，三个通道都过曝的照旧是白
      if (uShoulder > 0.5) {
        c = max(c, 0.0);
        float mx = max(c.r, max(c.g, c.b));
        if (mx > 1.0) {
          float mn = min(c.r, min(c.g, c.b));
          vec3 h = c / mx;
          float t = clamp((min(mn, 1.0) - mn / mx) / max(1.0 - mn / mx, 1e-4), 0.0, 1.0);
          c = mix(h, vec3(1.0), t);
        }
      }
      c = clamp(c, 0.0, 1.0);
      // 3D LUT（lut.ts）：按格子中心取样
      if (uLutMix > 0.0) c = mix(c, texture(uLut, c * ${((LUT_SIZE - 1) / LUT_SIZE).toFixed(6)} + ${(0.5 / LUT_SIZE).toFixed(6)}).rgb, uLutMix);
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
      // 抖动：屏幕是每通道 8 位，天空、墙面的大块缓变会量化成一圈圈色带；加约 ±0.5 级的噪声把台阶打散
      // （两个 IGN 相关，合起来近似均匀分布、幅度小：平涂类效果导出的图不会因此多出大片低位噪声）。
      // 噪声按像素固定（interleaved gradient noise，不随帧变），画面静止时不闪，多帧累积也不受影响
      vec2 fc = gl_FragCoord.xy;
      float dn = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715)))) + fract(52.9829189 * fract(dot(fc + vec2(47.0, 17.0), vec2(0.06711056, 0.00583715)))) - 1.0;
      c += dn / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}

/**
 * 泛光的取亮：不再按亮度挑（白墙、受光的白桌面、悬停高亮提亮的地方都会晕开），只取发光的部分——
 * 不透明材质把发光量写在 alpha 里（anime.ts uGlowMark：2 + 发光量），取这一点颜色里发光所占的比例。
 * 亮度那一支只在效果给了柔光阈值时起作用（threshold 不填时设成够不到的值）
 */
function glowOnlyHighPass(bloom: UnrealBloomPass) {
  const m = bloom.materialHighPassFilter
  m.fragmentShader = /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float luminosityThreshold;
    uniform float smoothWidth;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float l = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float glow = clamp(max(texel.a - 2.0, 0.0) / max(l, 1e-3), 0.0, 1.0);
      float soft = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, l);
      float k = max(glow, soft);
      gl_FragColor = vec4(texel.rgb * k, min(texel.a, 1.0) * k);
    }`
  m.needsUpdate = true
}

// ---------- 管线 ----------

export interface Post {
  /** 切换画面效果（预设 id，或 resolveLook 合好的完整参数）；什么都不做的效果且不在夜里时拆掉 composer */
  setLook: (look: string | LookDef) => void
  /** 时间光照给的天色与入夜程度（见 sky.ts） */
  setSky: (bg: [string, string, string], night: number) => void
  /**
   * 在后台编译某个效果要用的着色器（场景材质按这个效果换好之后的样子、后处理各遍），编好后 resolve。
   * 第一次画某个效果时 three 要同步等着色器链接完（M1 上一个效果能卡几百毫秒）；先用它编好再画就不卡。
   * 和 setLook 一样可以传预设 id 或 resolveLook 合好的完整参数
   */
  prepareLook: (look: string | LookDef) => Promise<void>
  /** 省电画质：无 MSAA + FXAA、不加入夜泛光 */
  setLow: (low: boolean) => void
  /** 室内灯光（three/lights.ts）：窗户夜光的颜色（跟色温）和亮灯程度 0–1 */
  setIndoor: (color: THREE.Color, level: number) => void
  /** 画面增强（省电画质都不开）：环境光遮蔽、体积光（体积光借遮蔽那一遍的深度图）。开不开由沙盘按模式决定 */
  /**
   * 画面增强（省电画质都不开）：环境光遮蔽、体积光（漫游时的光柱，借遮蔽那一遍的深度图）、浮尘（漫游、鸟瞰都有；漫游时才飘）。
   * 开不开由沙盘按模式决定
   */
  setFx: (fx: { ao: boolean; volumetric: boolean; dust: boolean }) => void
  /** 鸟瞰时浮尘围绕的焦点（轨道控制的 target，传引用，跟着变） */
  setFocus: (v: THREE.Vector3) => void
  /** 漫游中（后处理描线的远近淡出按人眼的距离算） */
  setWalking: (on: boolean) => void
  /**
   * 场景变了（沙盘在「自己要重画」时调用，后处理自己要的帧不调）：多帧累积退回到前几帧的权重，动着的东西（粒子、宠物、拖动的家具）
   * 只留很短的拖影、静止的部分还保留一点抗锯齿；hard = 从头来。镜头动了不用调，后处理自己比较镜头矩阵
   */
  restart: (hard?: boolean) => void
  /**
   * 正在动的角色（宠物、VRM 住户）的世界包围盒，每帧给。多帧累积在它们（和上一帧它们所在）的屏幕范围里
   * 把历史夹到当前帧邻域的颜色范围内：走过去的人不留拖影，其余静止的部分照常累积抗锯齿、降噪
   */
  setMovers: (boxes: THREE.Box3[]) => void
  /** 后处理自己还要接着画：累积还没收敛、浮尘在飘 */
  wantsFrame: () => boolean
  dispose: () => void
}

/**
 * 玻璃（kit.ts 的 C.glass，半透明）：入夜后透出暖光。按颜色认，认到的不只是窗（windows.ts 的 userData.windowGlass）：
 * 门上的玻璃、栏板的玻璃、玻璃桌面、鱼缸也是这个颜色、也跟着亮——所以不能直接换成只认窗的那个标记（门玻璃就不亮了）
 */
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
    ao: GTAOPass | null
    /** 体积光（volumetric.ts），借遮蔽那一遍的深度图 */
    vol: ShaderPass | null
    /** 转折线（crease.ts），同样借遮蔽那一遍的法线、深度图 */
    crease: ShaderPass | null
    /** 大气雾（fog.ts），借遮蔽那一遍的深度图 */
    fog: ShaderPass | null
    bloom: UnrealBloomPass | null
    base: ShaderPass
    kuwahara: ShaderPass
    pigment: ShaderPass
    comic: ShaderPass
    manga: ShaderPass
    pixel: ShaderPass
    crt: ShaderPass
    sketch: ShaderPass
    tiltH: ShaderPass
    tiltV: ShaderPass
    grade: ShaderPass
    fxaa: ShaderPass
    /** 后处理画出来的线（转折线）不经过多重采样：高画质下补一遍 SMAA（比 FXAA 清楚，不会把描边抹糊） */
    smaa: SMAAPass
    accum: AccumPass
  } | null = null
  /** 浮尘（volumetric.ts），体积光开着时才建、才挂进场景 */
  let dust: THREE.Points | null = null
  /** 间接光探针（gi.ts），效果要它时才建 */
  let gi: GI | null = null
  // 写实（PBR）和赛璐璐（「动画」：探针收成一档一档，gi.ts GI_APPLY_CEL）都能用；原来的三档色阶不用
  const giOn = () => !low && !!current.gi && current.material !== 'none' && current.stylize !== 'manga'
  let current: LookDef = LOOK_MAP.get('none')!
  let sky: { bg: [string, string, string]; night: number } = { bg: DEFAULT_BG, night: 0 }
  /** 雾的颜色（线性）：天色往淡天蓝偏（白天的背景色接近白，直接用会像起了白雾），入夜就是夜色 */
  const fogColor = new THREE.Color()
  const syncFogColor = () => fogColor.set(sky.bg[1]).lerp(FOG_SKY, 0.55 * (1 - sky.night))
  syncFogColor()
  /** 窗户夜光：颜色跟色温，亮度跟室内亮灯程度（没接室内灯光时按全亮） */
  const windowGlow = WINDOW_GLOW.clone()
  let indoor = 1
  let fx = { ao: false, volumetric: false, dust: false }
  let focus = new THREE.Vector3()
  /** 上次写进 uniform 的状态（效果或天色变了才重设） */
  let appliedKey = ''

  const cssSize = () => renderer.getSize(new THREE.Vector2())
  const bufRes = new THREE.Vector2()

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
      ao: null,
      vol: null,
      crease: null,
      fog: null,
      bloom: null,
      base: mk(BaseShader),
      kuwahara: mk(KuwaharaShader),
      pigment: mk(PigmentShader),
      comic: mk(ComicShader),
      manga: mk(MangaShader),
      pixel: mk(PixelShader),
      crt: mk(CrtShader),
      sketch: mk(SketchShader),
      tiltH: mk(TiltShader),
      tiltV: mk(TiltShader),
      grade: mk(GradeShader),
      fxaa: mk(FXAAShader),
      smaa: new SMAAPass(),
      accum: new AccumPass(),
    }
    passes.tiltV.uniforms.uDir.value.set(0, 1)
    passes.fxaa.enabled = needFxaa()
    const p = passes
    // manga 紧跟 RenderPass（读线性的编码，不能先过 Base）；泛光后插在下标 1，漫画模式下不开
    for (const ps of [p.render, p.manga, p.accum, p.base, p.kuwahara, p.pigment, p.comic, p.pixel, p.sketch, p.tiltH, p.tiltV, p.grade, p.crt, p.smaa, p.fxaa]) composer.addPass(ps)
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
    for (const ps of [passes.kuwahara, passes.pigment, passes.comic, passes.manga, passes.pixel, passes.crt, passes.sketch, passes.tiltH, passes.tiltV, passes.grade]) {
      const u = ps.uniforms
      u.uRes?.value.copy(res)
      if (u.uScale) u.uScale.value = pr
    }
    passes.fxaa.uniforms.resolution.value.set(1 / Math.max(1, res.x), 1 / Math.max(1, res.y))
    passes.kuwahara.uniforms.uStep.value = Math.max(1, pr * 0.9)
    passes.pixel.uniforms.uPx.value = Math.round(4 * pr)
    if (current.tilt) {
      passes.tiltH.uniforms.uMax.value = current.tilt.max * pr
      passes.tiltV.uniforms.uMax.value = current.tilt.max * pr
    }
  }

  function apply() {
    if (!passes || !composer) return
    const look = current
    const key = lookKey(look) + '|' + sky.bg.join() + '|' + sky.night.toFixed(3) + '|' + low + '|' + fx.ao + '|' + fx.volumetric
    if (key === appliedKey) return
    appliedKey = key
    const p = passes
    // 泛光：效果自带的，和入夜后灯具的光晕取较强者
    // 只取发光的部件（glowOnlyHighPass）、强度低：在灯具、屏幕周围留一圈淡晕，不盖住轮廓和边框
    // 黑白漫画读的是编码不是颜色，不能泛光
    const manga = look.stylize === 'manga'
    // 夜里的泛光比效果自己的强、会接管：柔光阈值沿用效果自己的（没有就只晕发光的东西，灯下的浅色地板不会晕成一团白）
    const nightBloom = sky.night > 0.02 && !low && !manga ? { strength: 0.28 * sky.night, radius: 0.3, threshold: look.bloom?.threshold } : undefined
    const bloom = low ? undefined : nightBloom && (!look.bloom || nightBloom.strength > look.bloom.strength) ? nightBloom : look.bloom
    // 遮蔽、体积光、转折线：漫画读的是编码，不能乘、不能加
    const ao = (fx.ao || !!look.ao) && !low && !manga
    const vol = fx.volumetric && !low && !manga
    const crease = creaseOf(look) > 0 && !low && !manga
    const fog = !!look.fog && !low && !manga
    if ((ao || vol || crease || fog) && !p.ao) {
      p.ao = createAO(renderer, scene, camera, () => sceneVersion)
      p.vol = createVolumetric()
      p.fog = createFog()
      p.crease = createCrease()
      composer.insertPass(p.ao, 1)
      composer.insertPass(p.vol, 2)
      composer.insertPass(p.fog, 3)
      composer.insertPass(p.crease, 4)
    }
    // 只开体积光 / 转折线 / 雾时遮蔽那一遍照样跑（要它的深度、法线图），只是不往画面上乘
    if (p.ao) {
      p.ao.enabled = ao || vol || crease || fog
      p.ao.blendIntensity = ao ? AO_INTENSITY : 0
      // 写实的遮蔽半径大得多（墙角、床底下一大片渐暗），动画感只要贴着的那一圈
      const realAo = look.material === 'real'
      const shade = look.aoShade ?? REAL_AO_SHADE
      p.ao.blendMaterial.uniforms.uReal.value = realAo ? 1 : 0
      p.ao.blendMaterial.uniforms.uRealShade.value.set(shade[0], shade[1], shade[2], shade[3])
      p.ao.updateGtaoMaterial(realAo ? { radius: look.aoRadius ?? 32, thickness: 14, distanceFallOff: 0.85 } : { radius: 12, thickness: 12, distanceFallOff: 0.7 })
    }
    if (p.vol) p.vol.enabled = vol
    if (p.fog) p.fog.enabled = fog
    if (p.crease) p.crease.enabled = crease
    p.smaa.enabled = crease
    if (bloom && !p.bloom) {
      // 用到才建（mip 链占显存）；排在遮蔽、体积光后面
      const s = cssSize()
      p.bloom = new UnrealBloomPass(new THREE.Vector2(s.x, s.y), 1, 0.5, 0.8)
      glowOnlyHighPass(p.bloom)
      composer.insertPass(p.bloom, p.ao ? 5 : 1)
    }
    if (p.bloom) {
      p.bloom.enabled = !!bloom
      if (bloom) {
        p.bloom.strength = bloom.strength
        p.bloom.radius = bloom.radius
        // 没有柔光阈值：亮度这一支永远达不到，只剩发光的东西
        p.bloom.threshold = bloom.threshold ?? 1e4
        // 光晕的颜色：合成时每一级 mip 乘一个颜色（UnrealBloomPass 的 bloomTintColors），原画面不动
        for (const v of p.bloom.bloomTintColors) bloomTintColor(look.bloomTint, v)
      }
    }
    // 背景：纸面类风格用自己的纸色，入夜时逐渐换成天色
    const ub = p.base.uniforms
    ub.uTone.value = look.tone ? 1 : 0
    for (let i = 0; i < 3; i++) {
      const c = (ub['uBg' + i].value as THREE.Color).set(sky.bg[i])
      if (look.bg) c.lerp(new THREE.Color(look.bg[i]), 1 - sky.night)
    }
    p.kuwahara.enabled = p.pigment.enabled = look.stylize === 'watercolor'
    p.comic.enabled = look.stylize === 'comic'
    p.manga.enabled = manga
    p.base.enabled = !manga
    if (look.manga) {
      const um = p.manga.uniforms
      um.uNight.value = sky.night
      um.uCell.value = look.manga.cell
      um.uCrease.value = look.manga.crease ? 1 : 0
      um.uTone.value = { dot: 0, line: 1, ink: 2 }[look.manga.tone]
    }
    p.pixel.enabled = look.stylize === 'pixel'
    p.crt.enabled = !!look.crt
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
    // 带色调映射的效果（写实、手办）：曝光挪到 Base 里、色调映射之前乘。预设和滑杆上的数是按显示空间调的，
    // 换到线性空间按 2.2 次方折算，中间调的亮度和原来一样，只是高光改成柔和地收住；对比度用不剪切的 S 曲线
    ub.uExposure.value = look.tone ? Math.pow(Math.max(0, g.exposure), 2.2) : 1
    u.uExposure.value = look.tone ? 1 : g.exposure
    u.uSCurve.value = look.tone ? 1 : 0
    u.uShoulder.value = manga ? 0 : 1
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
    u.uLutMix.value = look.lut ?? 0
    u.uLut.value = look.lut ? lutTexture('vivid') : BLANK_LUT
    syncSize()
  }

  /**
   * 渲染一帧前临时改材质 / uniform，渲染完立即还原：
   * - 描边壳是不走光照、不做色彩空间转换的 ShaderMaterial：直接上屏时它的颜色值被当成 sRGB 显示，
   *   进了线性的 composer 后会被 Base 再转一次 sRGB 而变浅。这里让描边着色器先把颜色转回线性（共用的 uLinear），保证和「原样」一样深；
   *   入夜再整体压暗（uDim，否则不受光照的描边在暗场景里会像霓虹灯）。两个都是 toon.ts outlineUniforms 里共用的，不遍历场景。
   * - 入夜：自发光材质（台灯、指示灯、屏幕）加亮，让泛光只落在灯上；窗玻璃透出暖光。
   * - 黑白漫画：材质切到编码输出（uManga），并按当前太阳与天光算「完全受光」的受光比；
   *   粒子、Sprite、加色贴片（灯光光斑）没法编码，这一帧先藏起来。
   * 白天、不是黑白漫画、不是写实时不遍历场景。
   */
  function renderPatched(draw: () => void) {
    // 线条随距离淡出、带颜色（LookDef.line）：漫游按镜头距离，鸟瞰从视角焦点往后
    const ln = composer ? current.line : undefined
    const lf = outlineUniforms.uLineFade.value
    if (ln) {
      const base = walking ? 0 : Math.max(0, camera.position.distanceTo(focus) - ln.start)
      lf.set(base + ln.start, base + ln.end, 1)
    } else lf.z = 0
    outlineUniforms.uLineLift.value = ln?.lift ?? 0
    // 插画：描边换成统一的暖墨色（线性，进 composer 才有；入夜和别的描边一样压暗）
    setInk(outlineUniforms.uInk.value, !!composer && !!current.illust, 1 - 0.7 * sky.night)
    const night = sky.night
    const linear = !!composer
    const manga = linear && current.stylize === 'manga' && !!passes
    const real = linear && current.material === 'real'
    // 写实：材质换成 PBR 时用到的参数（只是几个 uniform，PBR 材质在 swapToPbr 时才从原材质同步加亮后的值）
    setRealStyle({
      figure: real && current.figure ? 1 : 0,
      rim: real ? (current.rim ?? 0) : 0,
      term: real ? (current.term ?? 0) : 0,
      flatFur: real && current.flatFur ? 1 : 0,
      cel: real ? (current.cel ?? 0) : 0,
    })
    // 环境反射（固定的一张贴图）跟着屋里现在的光：天光（已经带着时间、室外光滑杆、夜里开灯的补光）+ 室内灯（色温色）。
    // 夜里关着灯时反射几乎没有；色调只带一半（全带的话黄昏、夜里所有高光都染成一个颜色）
    if (real) {
      const h = stage.hemi
      const lamp = ENV_LAMP * Math.max(0, indoor)
      envLight.setRGB(h.color.r * h.intensity + windowGlow.r * lamp, h.color.g * h.intensity + windowGlow.g * lamp, h.color.b * h.intensity + windowGlow.b * lamp)
      const l = lumOf(envLight)
      const k = Math.min(ENV_LIGHT_MAX, l / ENV_LIGHT_REF) / Math.max(1e-4, l)
      envLight.setRGB((envLight.r + l) * 0.5 * k, (envLight.g + l) * 0.5 * k, (envLight.b + l) * 0.5 * k)
      setRealEnv(envLight)
    }
    // 线的粗细跟着阳光（赛璐璐的「动画」类，不含插画）：受光侧细、背光侧粗；入夜退掉
    const ls = outlineUniforms.uLineSun.value
    ls.w = linear && !current.material && !current.illust && current.stylize === undefined ? 1 - night : 0
    if (ls.w > 0) {
      tmpSun.copy(stage.sun.position).sub(stage.sun.target.position).normalize().transformDirection(camera.matrixWorldInverse)
      ls.set(tmpSun.x, tmpSun.y, tmpSun.z, ls.w)
    }
    // 描边色：进 composer 时转回线性、入夜压暗（着色器里做，渲染完还原成原样）
    outlineUniforms.uLinear.value = linear ? 1 : 0
    outlineUniforms.uDim.value = 1 - 0.7 * night
    if (!manga && !real && night < 0.01) {
      try {
        return draw()
      } finally {
        outlineUniforms.uLinear.value = 0
        outlineUniforms.uDim.value = 1
        outlineUniforms.uLineSun.value.w = 0
      }
    }
    const hidden: THREE.Object3D[] = []
    if (manga) {
      const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
      // toon 受光部的色阶是 1，天光取天空色；漫反射 BRDF 带 1/π
      const ref = (stage.sun.intensity * lum(stage.sun.color) + stage.hemi.intensity * lum(stage.hemi.color)) / Math.PI
      mangaUniforms.uMangaLitRef.value = Math.max(1e-4, ref)
      mangaUniforms.uMangaNight.value = night
      mangaUniforms.uManga.value = 1
    }
    const boosted: [THREE.MeshStandardMaterial, number][] = []
    const glass: [THREE.MeshStandardMaterial, THREE.Color, number][] = []
    const seen = new Set<THREE.Material>()
    const visit = (o: THREE.Object3D) => {
      const additive = isAdditive((o as THREE.Mesh).material as THREE.Material | undefined)
      if (manga && ((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || additive)) {
        hidden.push(o)
        o.visible = false
        return
      }
      // 写实（描边为 0 时）不画描边壳
      if (o.userData.isOutline && real && !(current.outline ?? 1)) {
        hidden.push(o)
        o.visible = false
        return
      }
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!m) return
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (seen.has(mat)) continue
        seen.add(mat)
        // 描边的颜色换算在着色器里（上面的 uLinear / uDim）
        if (o.userData.isOutline || night < 0.01) continue
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
    }
    // 黑白漫画要藏掉每帧临时加进来的浮尘：照原样遍历；其余用缓存的列表（每帧遍历整个场景要近 1ms）
    if (manga) scene.traverseVisible(visit)
    else for (const o of patchTargets()) if (o.visible) visit(o)
    // 写实：材质换成 PBR（在入夜加亮之后换，PBR 材质从原材质同步加亮后的值）
    const restore = real ? swapToPbr(renderer, scene, (o) => !!o.userData.isOutline) : null
    try {
      draw()
    } finally {
      restore?.()
      mangaUniforms.uManga.value = 0
      for (const o of hidden) o.visible = true
      outlineUniforms.uLinear.value = 0
      outlineUniforms.uDim.value = 1
      outlineUniforms.uLineSun.value.w = 0
      for (const [e, v] of boosted) e.emissiveIntensity = v
      for (const [e, c, v] of glass) {
        e.emissive.copy(c)
        e.emissiveIntensity = v
      }
    }
  }

  /**
   * 场景版本：场景本身变了（编辑、淡出、换家具，Sandbox3D 调 restart(true)）时加一。
   * renderPatched、遮蔽的法线那一遍按它缓存要处理的对象列表，不每帧遍历整个场景
   */
  let sceneVersion = 0
  // 窗玻璃（windows.ts 标的 userData.windowGlass）：地板倒映窗户用。包围盒在世界坐标里，户型重建（场景版本变了）才重算
  const glassList = versionedList(scene, () => sceneVersion, (o) => !!((o as THREE.Mesh).material as THREE.Material | undefined)?.userData?.windowGlass)
  let winVersion = -1
  let wins: { c: THREE.Vector3; alongX: boolean; hu: number; hv: number; a: number; b: number }[] = []
  const winBox = new THREE.Box3()
  const winC = new THREE.Vector3()
  const winS = new THREE.Vector3()
  function updateWindows() {
    const list = glassList()
    const m = currentLightMask()
    if (winVersion !== sceneVersion || wins.length === 0) {
      winVersion = sceneVersion
      wins = []
      const fy = lightMaskUniforms.lmFloorY.value
      for (const o of list) {
        if (!o.visible) continue
        winBox.setFromObject(o)
        if (winBox.isEmpty()) continue
        winBox.getCenter(winC)
        winBox.getSize(winS)
        // 薄的那个方向是法线（窗都是横平竖直的）；太小的（气窗格条、百叶片）不要
        const alongX = winS.x < winS.z
        const hu = (alongX ? winS.z : winS.x) / 2
        const hv = winS.y / 2
        if (hu < 15 || hv < 15) continue
        // 两侧各探出 30cm 看是哪个房间（lightMask 编号图），地板只倒映同一房间的窗
        let f = 0
        if (m) for (let k = 1; k < m.floors; k++) if (winC.y >= fy[k] - 2) f = k
        const side = (d: number) => (m ? maskAt(m, f, { x: winC.x + (alongX ? d : 0), y: winC.z + (alongX ? 0 : d) }).id : -1)
        wins.push({ c: winC.clone(), alongX, hu, hv, a: side(30), b: side(-30) })
      }
    }
    const cam = camera.position
    const near = wins.slice().sort((p, q) => p.c.distanceToSquared(cam) - q.c.distanceToSquared(cam)).slice(0, MAX_WIN)
    const A = animeUniforms.uWinA.value
    const B = animeUniforms.uWinB.value
    near.forEach((w, i) => {
      A[i].set(w.c.x, w.c.y, w.c.z, w.alongX ? 0 : 1)
      B[i].set(w.hu, w.hv, w.a, w.b)
    })
    animeUniforms.uWinCount.value = near.length
    // 倒影的颜色：天光色（线性）
    animeUniforms.uWinColor.value.copy(stage.hemi.color).multiplyScalar(Math.min(1.2, stage.hemi.intensity))
  }
  const patchTargets = versionedList(scene, () => sceneVersion, (o) => !!(o as THREE.Mesh).material)

  /** 镜头静止的判断：上一帧（不含抖动）的视图 / 投影矩阵 */
  const lastView = new THREE.Matrix4()
  const lastProj = new THREE.Matrix4()
  let dustOn = false
  /** 浮尘在飘（漫游时）：要一直重画；鸟瞰时停在 dustTime */
  let dustAnim = false
  let dustTime = 0
  /** 每画一帧加一：抖动序号、体积光的取样相位（累积帧数在场景有动画时会被压住不涨，不能拿它当序号） */
  let tick = 0
  /** 上一帧之后场景变过（restart）：倒影要重画，不能沿用 */
  let sceneChanged = true

  /**
   * 外轮廓一律由描边壳画（粗细 = outline），转折线那一遍只画物体内部的转折（浓度 = crease）。
   * 以前高画质下开着转折线时外轮廓改由后处理画墨线（crease.ts 的 uSil）、不画描边壳：
   * 转折线滑杆一过 0 外轮廓的画法就整个换掉、浓度被顶到 1，描边滑杆也不起作用，两档画质的线又不一样，调起来很怪
   */
  let walking = false
  /** 动着的角色（setMovers）；投影成屏幕矩形交给累积那一遍 */
  let movers: THREE.Box3[] = []
  const moverPt = new THREE.Vector3()
  const moverRects = Array.from({ length: ACCUM_MOVERS }, () => new THREE.Vector4())
  /** 把 movers 投影成 uv 矩形（多留几个像素：描边、头发摆动），写进累积那一遍（矩形对象每帧复用） */
  function projectMovers(p: { accum: AccumPass }) {
    let n = 0
    for (const b of movers) {
      if (n >= ACCUM_MOVERS) break
      if (b.isEmpty()) continue
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      let behind = false
      for (let i = 0; i < 8; i++) {
        moverPt.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(camera.matrixWorldInverse)
        // 有角点在镜头后面：投影不可靠，整屏都按动着处理
        if (moverPt.z > -camera.near) behind = true
        moverPt.applyMatrix4(camera.projectionMatrix)
        x0 = Math.min(x0, moverPt.x)
        y0 = Math.min(y0, moverPt.y)
        x1 = Math.max(x1, moverPt.x)
        y1 = Math.max(y1, moverPt.y)
      }
      if (behind) moverRects[n++].set(0, 0, 1, 1)
      else if (x1 >= -1 && y1 >= -1 && x0 <= 1 && y0 <= 1) moverRects[n++].set(x0 * 0.5 + 0.5 - 0.01, y0 * 0.5 + 0.5 - 0.01, x1 * 0.5 + 0.5 + 0.01, y1 * 0.5 + 0.5 + 0.01)
    }
    p.accum.setMovers(moverRects, n)
  }

  /** 多帧累积开不开：省电画质、黑白漫画（编码不能平均）、像素风（要硬边）不开 */
  const accumOn = () => !!passes && !low && current.stylize !== 'manga' && current.stylize !== 'pixel'

  /** 投影抖动亚像素（Halton 2 / 3），叠在已有的 view offset（手机底部面板让出的位置）上，画完还原 */
  function jittered(draw: () => void) {
    if (passes!.accum.frame === 0) return draw()
    const n = tick
    const halton = (i: number, b: number) => {
      let f = 1
      let r = 0
      while (i > 0) {
        f /= b
        r += f * (i % b)
        i = Math.floor(i / b)
      }
      return r
    }
    const pr = renderer.getPixelRatio()
    const size = cssSize()
    const v = camera.view?.enabled ? { ...camera.view } : null
    const jx = (halton((n % 16) + 1, 2) - 0.5) / pr
    const jy = (halton((n % 16) + 1, 3) - 0.5) / pr
    if (v) camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX + jx, v.offsetY + jy, v.width, v.height)
    else camera.setViewOffset(size.x, size.y, jx, jy, size.x, size.y)
    camera.updateProjectionMatrix()
    try {
      draw()
    } finally {
      if (v) camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height)
      else camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
  }

  const hook = {
    render() {
      if (!composer)
        return renderPatched(() => {
          prerenderReflections(renderer, scene, camera)
          renderer.render(scene, camera)
        })
      apply()
      const p = passes!
      // 镜头动了（漫游、转视角）：累积从头来
      camera.updateMatrixWorld()
      if (!lastView.equals(camera.matrixWorld) || !lastProj.equals(camera.projectionMatrix)) p.accum.frame = 0
      lastView.copy(camera.matrixWorld)
      lastProj.copy(camera.projectionMatrix)
      p.accum.enabled = accumOn()
      if (!p.accum.enabled) p.accum.frame = 0
      projectMovers(p)
      // 镜头、场景都没变，只是累积在收敛：倒影沿用上一帧的（reflect.ts）
      setReflectReuse(p.accum.frame > 0 && !sceneChanged)
      sceneChanged = false
      tick++
      jittered(() => {
        if (p.crease?.enabled) {
          setInk(p.crease.uniforms.uInk.value as THREE.Vector4, !!current.illust)
          updateCrease(p.crease, camera, p.ao?.normalTexture ?? null, p.ao?.depthTexture ?? null, renderer.getDrawingBufferSize(bufRes), creaseOf(current), renderer.getPixelRatio(), false, walking ? WALK_LINE_FOCUS : camera.position.distanceTo(focus), (current.outline ?? 1) > 0)
        }
        const shafts = VOL_STRENGTH * (current.shafts ?? 1) * (1 - sky.night)
        if (p.ao?.enabled) updateAOSun(p.ao, camera, stage.sun, AO_SUN_FADE * (1 - sky.night) * sunShare(stage.sun, stage.hemi, indoor))
        if (p.vol?.enabled) updateVolumetric(p.vol, camera, stage.sun, p.ao?.depthTexture ?? null, shafts, tick)
        const fd = current.fog
        if (p.fog?.enabled && fd) {
          // 漫游：屋里不起雾，窗外的街景才淡下去；鸟瞰：从视角焦点往后，房子的后半截、院子、底座往背景里退
          const start = walking ? WALK_FOG_START : Math.max(0, camera.position.distanceTo(focus) - ORBIT_FOG_BACK)
          updateFog(p.fog, camera, p.ao?.depthTexture ?? null, { start, density: (fd.density / 100) * (1 - 0.6 * sky.night), height: fd.height, ground: 0, color: fogColor, sun: stage.sun, sunK: fd.sun * (1 - sky.night), max: fd.max })
        }
        // 浮尘：漫游时（体积光开着）围着镜头、慢慢飘；鸟瞰时围着视角焦点、不动（不用一直重画）
        const walk = !!p.vol?.enabled
        dustAnim = walk
        if (walk || dustTime === 0) dustTime = performance.now() / 1000
        dustOn =
          fx.dust &&
          !low &&
          current.stylize !== 'manga' &&
          !!(dust ??= createDust()) &&
          updateDust(dust, camera, stage.sun, stage.hemi, renderer.getDrawingBufferSize(bufRes).y, dustTime, DUST_STRENGTH * (current.shafts ?? 1) * (1 - sky.night) * (walk ? 1 : DUST_ORBIT), walk ? camera.position : focus, walk ? DUST_BOX_WALK : DUST_BOX_ORBIT)
        if (dustOn) scene.add(dust!)
        try {
          renderPatched(() => {
            // 间接光探针：用这一帧换好的材质采几个（gi.ts）；探针更新了，累积退回到少量帧，新的间接光很快显出来
            if (giOn()) gi ??= createGI(renderer, scene, camera, stage.sun, stage.hemi)
            // 夜里灯光的多次反弹在小房间里叠得很快（整屋发白）：入夜时间接光收弱
            // 赛璐璐漫游：屋里只从窗户进光，照实算偏暗；动画的室内是高调的（暗部明亮、干净），间接光提亮
            const cel = current.material !== 'real'
            // 入夜：灯光的反弹收得更多（赛璐璐夜里要灯下一池光、周围暗下去），漫游的提亮只在白天
            gi?.setGain((current.gi ?? 1) * (1 - (cel ? 0.8 : 0.6) * sky.night) * (cel && walking ? 1 + (CEL_WALK_GI - 1) * (1 - sky.night) : 1))
            giUniforms.giBand.value = cel ? 1 : 0
            // 地板倒映窗户：离镜头最近的几扇窗（anime.ts FLOOR_REFL）
            if (animeUniforms.uFloorRefl.value > 0) updateWindows()
            if (gi?.step(giOn(), sceneVersion)) p.accum.frame = Math.min(p.accum.frame, ACCUM_SETTLE)
            // 倒影在最外层先画（reflectFrame.ts）；镜头已经抖过亚像素，和主画面一致
            prerenderReflections(renderer, scene, camera)
            // 发光标记只写进主画面（倒影、探针那几次渲染不要）
            animeUniforms.uGlowMark.value = p.bloom?.enabled ? 1 : 0
            try {
              composer!.render()
            } finally {
              animeUniforms.uGlowMark.value = 0
            }
          })
        } finally {
          if (dust) scene.remove(dust)
        }
      })
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
    const need = !plainLook(current, low) || sky.night > 0.02 || needFxaa() || (!low && (fx.ao || fx.volumetric || fx.dust))
    if (need && !composer) build()
    if (!need && !keep) teardown()
    // 白天「原样」：不接管，直接 renderer.render；夜里即使不走 composer 也要接管来调整材质
    stage.post = composer || sky.night >= 0.01 ? hook : null
  }

  return {
    setLook(look) {
      current = typeof look === 'string' ? resolveLook(look) : look
      update()
    },
    setSky(bg, night) {
      sky = { bg, night }
      syncFogColor()
      update()
    },
    prepareLook(look) {
      const keep = current
      current = typeof look === 'string' ? (LOOK_MAP.get(look as LookId) ?? LOOK_MAP.get('none')!) : look
      update(true)
      apply()
      const jobs: Promise<unknown>[] = []
      // 画进 composer 的目标和直接上屏是两种着色器变体（输出色彩空间不同）：编译时也要对着同一个目标
      const target = renderer.getRenderTarget()
      try {
        renderer.setRenderTarget(composer ? composer.renderTarget1 : null)
        renderPatched(() => jobs.push(renderer.compileAsync(scene, camera)))
        if (composer) {
          const quads = new THREE.Scene()
          for (const ps of composer.passes) {
            const m = ps.enabled ? (ps as ShaderPass).material : undefined
            if (m) quads.add(new THREE.Mesh(QUAD, m))
          }
          jobs.push(renderer.compileAsync(quads, camera))
        }
      } finally {
        renderer.setRenderTarget(target)
        current = keep
        update(true)
      }
      return Promise.all(jobs).then(() => undefined)
    },
    restart(hard = false) {
      sceneChanged = true
      if (hard) sceneVersion++
      if (passes) passes.accum.frame = hard ? 0 : Math.min(passes.accum.frame, ACCUM_SETTLE)
    },
    wantsFrame() {
      if (!composer || !passes || stage.post !== hook) return false
      return (dustOn && dustAnim) || (accumOn() && passes.accum.frame < ACCUM_FRAMES) || (giOn() && !!gi?.busy())
    },
    setMovers(boxes) {
      movers = boxes
    },
    setIndoor(color, level) {
      windowGlow.copy(WINDOW_GLOW).lerp(color, 0.6)
      indoor = level
    },
    setWalking(on) {
      walking = on
    },
    setFocus(v) {
      focus = v
    },
    setFx(v) {
      if (v.ao === fx.ao && v.volumetric === fx.volumetric && v.dust === fx.dust) return
      fx = { ...v }
      appliedKey = ''
      update()
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
      gi?.dispose()
      gi = null
      if (dust) {
        dust.geometry.dispose()
        ;(dust.material as THREE.Material).dispose()
        dust = null
      }
    },
  }
}

/**
 * 多帧累积（渐进式超采样）：输入是这一帧（投影抖过亚像素），和历史按 1 / (帧数 + 1) 混合，帧数到 ACCUM_FRAMES 之后按固定权重滑动平均。
 * frame = 0 时直接输出这一帧、清掉历史。两张半浮点历史图来回倒。
 * 动着的角色所在的矩形（这一帧和上一帧的）里，历史先夹到当前帧 3×3 邻域的颜色范围内（TAA 的邻域裁剪）：
 * 没有运动矢量，但镜头不动时只有角色在动，裁剪就足以去掉拖影；矩形外不裁剪，静止画面的降噪不受影响。
 */
const EMPTY_RECT = new THREE.Vector4(2, 2, -2, -2)

class AccumPass extends Pass {
  frame = 0
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private quad: FullScreenQuad
  private mat: THREE.ShaderMaterial
  private copy: THREE.ShaderMaterial

  constructor() {
    super()
    const mk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
    this.hist = [mk(), mk()]
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tCur: { value: null },
        tHist: { value: null },
        uK: { value: 1 },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uMovers: { value: Array.from({ length: ACCUM_MOVERS * 2 }, () => EMPTY_RECT.clone()) },
        uMoverN: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCur;
        uniform sampler2D tHist;
        uniform float uK;
        uniform vec2 uTexel;
        uniform vec4 uMovers[ ${ACCUM_MOVERS * 2} ];
        uniform int uMoverN;
        varying vec2 vUv;
        // 只看用到的那几个矩形：没有角色在动时每个像素一次比较就出来
        bool moving() {
          for ( int i = 0; i < ${ACCUM_MOVERS * 2}; i ++ ) {
            if ( i >= uMoverN ) break;
            vec4 r = uMovers[ i ];
            if ( vUv.x >= r.x && vUv.y >= r.y && vUv.x <= r.z && vUv.y <= r.w ) return true;
          }
          return false;
        }
        // 从头来时不读历史：mix(历史, 当前, 1) 在历史里有 NaN 时仍是 NaN（0 × NaN），一个坏像素会永远留在画面上
        void main() {
          vec4 cur = texture2D(tCur, vUv);
          if ( uK >= 1.0 ) {
            gl_FragColor = cur;
            return;
          }
          vec4 hist = texture2D(tHist, vUv);
          if ( moving() ) {
            vec4 lo = cur;
            vec4 hi = cur;
            for ( int y = -1; y <= 1; y ++ )
              for ( int x = -1; x <= 1; x ++ ) {
                if ( x == 0 && y == 0 ) continue;
                vec4 c = texture2D(tCur, vUv + vec2(float(x), float(y)) * uTexel);
                lo = min(lo, c);
                hi = max(hi, c);
              }
            hist = clamp(hist, lo, hi);
          }
          gl_FragColor = mix(hist, cur, uK);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.copy = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
  }

  setSize(w: number, h: number) {
    for (const t of this.hist) t.setSize(w, h)
    this.mat.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h))
    this.frame = 0
  }

  /** 这一帧动着的角色的 uv 矩形；和上一帧的一起生效（上一帧的位置在历史里，也要裁剪） */
  private moverPrev = Array.from({ length: ACCUM_MOVERS }, () => new THREE.Vector4())
  private moverPrevN = 0
  /** 前 n 个矩形生效（rects 会被调用方复用：这里抄下来） */
  setMovers(rects: readonly THREE.Vector4[], n: number) {
    const u = this.mat.uniforms.uMovers.value as THREE.Vector4[]
    for (let i = 0; i < n; i++) u[i].copy(rects[i])
    for (let i = 0; i < this.moverPrevN; i++) u[n + i].copy(this.moverPrev[i])
    const all = n + this.moverPrevN
    for (let i = all; i < u.length; i++) u[i].copy(EMPTY_RECT)
    this.mat.uniforms.uMoverN.value = all
    for (let i = 0; i < n; i++) this.moverPrev[i].copy(rects[i])
    this.moverPrevN = n
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const [prev, next] = this.hist
    if (this.frame === 0) {
      // 从头来（镜头在动时每帧都是）：输出就是这一帧，只把它抄进历史；不在最后时不交换缓冲，下一个 pass 直接读 readBuffer，
      // 省掉「混合进历史 + 再抄到 writeBuffer」两遍全屏
      this.copy.uniforms.tDiffuse.value = readBuffer.texture
      this.quad.material = this.copy
      renderer.setRenderTarget(next)
      this.quad.render(renderer)
      if (this.renderToScreen) {
        renderer.setRenderTarget(null)
        this.quad.render(renderer)
      }
      this.needsSwap = this.renderToScreen
      this.hist = [next, prev]
      this.frame++
      return
    }
    this.needsSwap = true
    this.mat.uniforms.tCur.value = readBuffer.texture
    this.mat.uniforms.tHist.value = prev.texture
    this.mat.uniforms.uK.value = this.frame === 0 ? 1 : Math.max(1 / (this.frame + 1), 1 / ACCUM_FRAMES)
    this.quad.material = this.mat
    renderer.setRenderTarget(next)
    this.quad.render(renderer)
    this.copy.uniforms.tDiffuse.value = next.texture
    this.quad.material = this.copy
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
    this.hist = [next, prev]
    this.frame++
  }

  dispose() {
    for (const t of this.hist) t.dispose()
    this.mat.dispose()
    this.copy.dispose()
    this.quad.dispose()
  }
}

/**
 * 画面增强的环境光遮蔽（GTAO，单位厘米）；体积光、转折线也借它的法线 / 深度图。法线 / 深度那一遍额外画一次场景：
 * - 描边壳、半透明（玻璃、水面）、加色贴片（灯光光斑）、Sprite、反射面不进去：壳会把物体轮廓撑大一圈，玻璃会挡住窗外，
 *   反射面一画就会触发它再画一遍倒影；
 * - 双面画：天花板只有一面朝下的面，单面会被剔掉，墙顶那圈就算不出遮蔽。
 * 合成时按赛璐璐的画法收成一块阴影色：遮蔽过了阈值才上色，边缘只留一小段过渡，不是写实的灰色渐变；
 * 阴影色偏冷紫（动画里室内阴影的常见画法），压得很浅。
 * 遮蔽是低频的，高像素比屏上按 CSS 像素算（法线那一遍、GTAO、降噪都少画四分之三的像素），合成时双线性放大。
 */
const AO_INTENSITY = 0.9

/** 缓存兜底：隔这么多次取用不管版本也重建一次（漏报的改动最多晚这么久生效） */
const CACHE_FRAMES = 120
/** 场景里满足 keep 的对象列表，按 version() 缓存（版本变了、或取用 CACHE_FRAMES 次后重建）：每帧用它代替遍历整个场景 */
function versionedList(scene: THREE.Object3D, version: () => number, keep: (o: THREE.Object3D) => boolean) {
  let list: THREE.Object3D[] = []
  let ver = -1
  let age = 0
  return () => {
    if (ver !== version() || ++age > CACHE_FRAMES) {
      ver = version()
      age = 0
      list = []
      scene.traverse((o) => {
        if (keep(o)) list.push(o)
      })
    }
    return list
  }
}
/** 法线那一遍不画的小物件半径（cm）：后处理描线时外轮廓也从这张图里来，只省掉最小的那些 */
const SMALL_R = 3

function createAO(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, version: () => number) {
  const pass = new GTAOPass(scene, camera, 1, 1)
  pass.updateGtaoMaterial({ radius: 12, distanceExponent: 1.5, thickness: 12, distanceFallOff: 0.7, scale: 1.4, samples: 24, screenSpaceRadius: false })
  pass.updatePdMaterial({ lumaPhi: 20, depthPhi: 2, normalPhi: 3, radius: 10, rings: 4, samples: 32 })
  pass.blendIntensity = AO_INTENSITY
  // 高像素比屏按 CSS 像素算（最多减半）：再低的话放大后墙顶、柱子边上会出现一格一格的光晕
  const setSize = pass.setSize.bind(pass)
  pass.setSize = (w, h) => {
    const k = Math.min(2, Math.max(1, renderer.getPixelRatio()))
    setSize(Math.max(1, Math.ceil(w / k)), Math.max(1, Math.ceil(h / k)))
  }
  pass.normalMaterial.side = THREE.DoubleSide
  const hidden = (pass as unknown as { _visibilityCache: THREE.Object3D[] })._visibilityCache
  // 要藏的对象按场景版本缓存（每帧遍历整个场景要近 1ms），每帧只翻这张表；
  // 另外半径 SMALL_R 以下的小物件（笔、按钮）也不画：遮蔽、转折线在它们身上看不出来，省下大把 draw call
  const ballS = new THREE.Sphere()
  const skipList = versionedList(scene, version, (o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    const mat = Array.isArray(m) ? m[0] : m
    if (
      (o as THREE.Points).isPoints ||
      (o as THREE.Line).isLine ||
      (o as THREE.Sprite).isSprite ||
      isReflector(o) ||
      isFurShell(o) ||
      o.userData.isOutline ||
      (!!mat && (mat.transparent || isAdditive(mat) || !mat.depthWrite))
    )
      return true
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return false
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
    return ballS.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld).radius < SMALL_R
  })
  ;(pass as unknown as { _overrideVisibility: () => void })._overrideVisibility = () => {
    for (const o of skipList()) {
      if (!o.visible) continue
      o.visible = false
      hidden.push(o)
    }
  }
  const blend = pass.blendMaterial
  // 线性空间的乘数：比 toon 暗部那一档浅得多，只压一层淡淡的冷紫，提示「这里是角落」而不抢画面
  blend.uniforms.uShade = { value: new THREE.Vector3(0.85, 0.83, 0.9) }
  // 写实：不分档，按遮蔽量连续压暗（中性偏暖的灰）
  blend.uniforms.uReal = { value: 0 }
  blend.uniforms.uRealShade = { value: new THREE.Vector4(...REAL_AO_SHADE) }
  // 遮蔽只该压环境光：被太阳直射的地方（地上的光斑、窗台）直射光不受「角落」影响，照样压暗就成了光斑里的脏边。
  // 这里按像素查太阳的阴影贴图（和地上的光斑同一张）再乘朝向，直射到的地方把遮蔽退掉（updateAOSun 每帧给）
  Object.assign(blend.uniforms, {
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    uShadow: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uShadowTexel: { value: 1 / 2048 },
    uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
    uSunFade: { value: 0 },
  })
  blend.fragmentShader = /* glsl */ `
    uniform float intensity;
    uniform float uReal;
    uniform vec4 uRealShade;
    uniform vec3 uShade;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    // 阴影贴图只在有太阳时才绑（AO_SUN 由 updateAOSun 开关）：sampler2DShadow 上不能挂空纹理，挂了整遍合成画不出来
    #ifdef AO_SUN
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform sampler2DShadow uShadow;
    uniform mat4 uShadowMatrix;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform float uShadowTexel;
    uniform vec3 uSunDirV;
    uniform float uSunFade;

    // 这一点被太阳直射的程度（0..1）：朝向 × 阴影贴图（5 个取样的小 PCF，和光斑的软边差不多宽）
    float sunDirect() {
      vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
      float facing = smoothstep(0.02, 0.25, dot(n, uSunDirV));
      if (facing <= 0.0) return 0.0;
      float depth = texture2D(tDepth, vUv).x;
      if (depth >= 1.0) return 0.0;
      vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      v /= v.w;
      // 沿法线抬一点（cm）再查，免得表面自己挡自己
      vec3 p = (uCamWorld * vec4(v.xyz + n * 1.5, 1.0)).xyz;
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0 || sc.z > 1.0) return 0.0;
      float z = sc.z - 0.0005;
      float o = uShadowTexel * 1.5;
      float lit = texture(uShadow, vec3(sc.xy, z)) * 0.4
        + (texture(uShadow, vec3(sc.xy + vec2(o, 0.0), z)) + texture(uShadow, vec3(sc.xy - vec2(o, 0.0), z))
         + texture(uShadow, vec3(sc.xy + vec2(0.0, o), z)) + texture(uShadow, vec3(sc.xy - vec2(0.0, o), z))) * 0.15;
      return lit * facing;
    }
    #endif

    void main() {
      float occ = (1.0 - texture2D(tDiffuse, vUv).r) * intensity;
      #ifdef AO_SUN
      if (occ > 0.0) occ *= 1.0 - uSunFade * sunDirect();
      #endif
      // 两档：浅的遮蔽不画，过了阈值就是一整块阴影
      if (uReal > 0.5) {
        gl_FragColor = vec4(mix(vec3(1.0), uRealShade.rgb, clamp(occ * uRealShade.a, 0.0, 1.0)), 1.0);
        return;
      }
      float k = smoothstep(0.22, 0.4, occ);
      gl_FragColor = vec4(mix(vec3(1.0), uShade, k), 1.0);
    }`
  blend.needsUpdate = true
  return pass
}

/** 直射处遮蔽退掉多少（Saltline 的做法：留两成，直射的角落还是略有一点暗） */
const AO_SUN_FADE = 0.8
/**
 * 阳光在总光照里占到这么多就按完全退掉算。平常的白天各画面效果都在 0.5–0.65（阳光 2 × 0.9，天光 1.5–1.9 × 0.9），
 * 所以白天还是 AO_SUN_FADE；太阳贴着地平线（阳光强度掉到零点几）、或者室外光调得很低而屋里开着灯时，
 * 「直射到」的地方其实主要还是环境光 / 灯光在照，遮蔽就不该退那么多
 */
const AO_SUN_SHARE_FULL = 0.5
/** 室内灯全开时大约相当于多少天光（和半球光强度 × 亮度同一个量纲）：只用来估阳光占比，不参与光照 */
const AO_LAMP_AMBIENT = 1
const lumOf = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
/** 阳光占总光照的比例换成 0–1 的系数（乘到遮蔽的退让量上）；indoor = 室内亮灯程度（setIndoor） */
function sunShare(sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, indoor: number) {
  const s = sun.visible ? sun.intensity * lumOf(sun.color) : 0
  if (!(s > 0)) return 0
  const amb = hemi.intensity * lumOf(hemi.color) + AO_LAMP_AMBIENT * Math.max(0, indoor)
  return Math.min(1, s / (s + amb) / AO_SUN_SHARE_FULL)
}

/** 每帧画之前：给遮蔽合成那一遍太阳的阴影贴图、方向（视空间）和镜头矩阵；没有阴影贴图（第一帧）或入夜时不退 */
function updateAOSun(pass: GTAOPass, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, fade: number) {
  const m = pass.blendMaterial
  const u = m.uniforms
  const shadow = sun.shadow.map?.depthTexture ?? null
  const on = !!shadow && sun.castShadow && sun.visible && sun.intensity > 0 && fade > 0
  // 开关只在入夜 / 天亮、第一帧时变，重编译一次
  if (on !== ('AO_SUN' in m.defines)) {
    if (on) m.defines.AO_SUN = ''
    else delete m.defines.AO_SUN
    m.needsUpdate = true
  }
  if (!on) return
  u.uSunFade.value = fade
  u.tDepth.value = pass.depthTexture
  u.tNormal.value = pass.normalTexture
  u.uShadow.value = shadow
  // 共享引用：阴影矩阵在这一帧画阴影时才更新，uniform 绘制时才上传，这样拿到的是当帧的（拷贝会晚一帧）
  u.uShadowMatrix.value = sun.shadow.matrix
  u.uShadowTexel.value = 1 / sun.shadow.mapSize.x
  u.uProjInv.value.copy(camera.projectionMatrixInverse)
  u.uCamWorld.value.copy(camera.matrixWorld)
  // 法线图是视空间的（MeshNormalMaterial）：太阳方向也转到视空间
  u.uSunDirV.value.subVectors(sun.position, sun.target.position).normalize().transformDirection(camera.matrixWorldInverse)
}
