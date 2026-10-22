// 着色器里共用的 hash 和值噪声：后处理各遍（post.ts COMMON）和「插画」的纸纹（anime.ts，注入到受光材质里）都用这一份

/** hash12：二维坐标 → [0, 1) 的伪随机；vnoise：平滑插值的值噪声 */
export const HASH_NOISE = /* glsl */ `
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
  }`
