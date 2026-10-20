// 动态分辨率：镜头在动（转视角、漫游）时按实际帧率降像素比，停下后恢复满分辨率重画一帧。
// 帧率按 rAF 间隔算：GPU 跟不上时浏览器会推迟 rAF，间隔反映的是整帧（含 GPU）的耗时；CPU 计时量不到 GPU。
// 高像素比屏（Mac 的 Retina 是 2）上像素数是 CSS 像素的四倍，转动时画面本来就在动、细节看不清，降下来最划算。

/** 最低缩放：像素比 2 的屏上降到 1（CSS 像素），再低就糊得明显了 */
export const DYN_MIN = 0.5
const STEP = 0.125
/** 动着时平均帧间隔高于它（低于 45fps）就降一档 */
const SLOW_MS = 1000 / 45
/** 低于它（高于 56fps）就升回一档 */
const FAST_MS = 1000 / 56
/** 至少攒这么多帧再判断（换分辨率后的第一帧要重建渲染目标，不算） */
const SAMPLES = 10
/** 镜头停下多久后恢复满分辨率（阻尼收尾时一直有很小的移动，不要来回切） */
const SETTLE_MS = 200

export class DynRes {
  /** 动着时用的缩放：跨多次转动记住，下次一动直接用，不用每次从头试 */
  motionScale = 1
  /** 当前缩放（1 = 满分辨率） */
  scale = 1
  private lastMove = -Infinity
  private sum = 0
  private n = -1

  /** 每个 rAF 调一次（dtMs：距上一帧的间隔），返回这一帧该用的缩放 */
  update(now: number, dtMs: number, moving: boolean) {
    if (!moving) {
      if (now - this.lastMove > SETTLE_MS) this.setScale(1)
      return this.scale
    }
    this.lastMove = now
    this.setScale(this.motionScale)
    // 第一帧（刚开始动、刚换过分辨率）的间隔不算
    if (this.n++ < 0) return this.scale
    this.sum += dtMs
    if (this.n < SAMPLES) return this.scale
    const avg = this.sum / this.n
    if (avg > SLOW_MS && this.motionScale > DYN_MIN) this.motionScale = Math.max(DYN_MIN, this.motionScale - STEP)
    else if (avg < FAST_MS && this.motionScale < 1) this.motionScale = Math.min(1, this.motionScale + STEP)
    this.sum = 0
    this.n = 0
    this.setScale(this.motionScale)
    return this.scale
  }

  private setScale(s: number) {
    if (s === this.scale) return
    this.scale = s
    this.sum = 0
    this.n = -1
  }
}
