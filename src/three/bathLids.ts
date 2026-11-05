// 浴缸盖的规格（宽 × 深）：素材在 packs/bath-extra.ts，平面图、手动摆放、一键布置按浴缸尺寸挑规格用这里。

export const LID_W = [110, 120, 130, 140, 150, 160, 170, 180]
export const LID_D = [60, 70]
/** 浴缸外尺寸 w × d 能用的盖子规格（盖子不大于浴缸，至多小 12）；没有合适的返回 null */
export function lidSizeFor(w: number, d: number) {
  const lw = [...LID_W].reverse().find((x) => x <= w && x >= w - 12)
  const ld = [...LID_D].reverse().find((x) => x <= d && x >= d - 12)
  return lw && ld ? { w: lw, d: ld } : null
}
