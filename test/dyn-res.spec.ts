import { describe, expect, it } from 'vitest'
import { DYN_MIN, DynRes } from '../src/three/dynRes'

/** 以固定帧间隔跑 frames 帧，返回最后的缩放 */
function run(d: DynRes, t0: number, frames: number, dt: number, moving = true) {
  let t = t0
  let s = d.scale
  for (let i = 0; i < frames; i++) {
    t += dt
    s = d.update(t, dt, moving)
  }
  return { t, s }
}

describe('DynRes', () => {
  it('静止时保持满分辨率', () => {
    const d = new DynRes()
    expect(run(d, 0, 100, 50, false).s).toBe(1)
  })

  it('动着帧率低时逐档降，最低到 DYN_MIN', () => {
    const d = new DynRes()
    const a = run(d, 0, 12, 50)
    expect(a.s).toBeLessThan(1)
    const b = run(d, a.t, 200, 50)
    expect(b.s).toBe(DYN_MIN)
  })

  it('帧率够时不降', () => {
    const d = new DynRes()
    expect(run(d, 0, 200, 1000 / 60).s).toBe(1)
  })

  it('停下后恢复满分辨率，下次一动直接用记住的缩放', () => {
    const d = new DynRes()
    const a = run(d, 0, 200, 50)
    expect(a.s).toBe(DYN_MIN)
    const b = run(d, a.t, 20, 16, false)
    expect(b.s).toBe(1)
    expect(d.update(b.t + 16, 16, true)).toBe(DYN_MIN)
  })

  it('降下来后帧率变好会逐档升回', () => {
    const d = new DynRes()
    const a = run(d, 0, 200, 50)
    expect(run(d, a.t, 400, 1000 / 60).s).toBe(1)
  })
})
