// 日式户型生成器：seed 1..100 的结构不变量
import { describe, expect, test } from 'vitest'
import { planViolations } from '/src/generate'
import { edgeInfo, fixtureBox, boxOverlaps, pointInPolygon, onBoundary, type Plan } from '/src/model'
import { genJp, normalizeIds, overlapArea, range, reachable, roomGraph } from './helpers'

const SEEDS = range(1, 100)
const plans = new Map<number, Plan>(SEEDS.map((s) => [s, genJp(s)]))

/** 对每个 seed 收集问题，最后一次性断言（失败时能看到全部 seed 的情况） */
function collect(check: (plan: Plan, seed: number) => string[]) {
  return SEEDS.flatMap((s) => check(plans.get(s)!, s).map((m) => `seed ${s}: ${m}`))
}

describe('日式生成器 seed 1..100', () => {
  test('符合表示规约（planViolations 为空）', () => {
    expect(collect((p) => planViolations(p))).toEqual([])
  })

  test('房间两两不重叠', () => {
    expect(
      collect((p) => {
        const out: string[] = []
        for (let i = 0; i < p.rooms.length; i++)
          for (let j = i + 1; j < p.rooms.length; j++) {
            const s = overlapArea(p.rooms[i].points, p.rooms[j].points)
            if (s > 1) out.push(`${p.rooms[i].name} 与 ${p.rooms[j].name} 重叠 ${s.toFixed(0)}cm²`)
          }
        return out
      }),
    ).toEqual([])
  })

  test('从玄関经门（阳台可经窗）能到达所有房间', () => {
    expect(
      collect((p) => {
        const ent = p.rooms.find((r) => r.kind === 'entrance')
        if (!ent) return ['没有玄関']
        const viaDoor = reachable(roomGraph(p), ent.id)
        const viaAny = reachable(roomGraph(p, true), ent.id)
        return p.rooms.filter((r) => !(r.kind === 'balcony' ? viaAny : viaDoor).has(r.id)).map((r) => `${r.name}(${r.kind}) 不可达`)
      }),
    ).toEqual([])
  })

  test('门窗落在所在边的范围内', () => {
    expect(
      collect((p) =>
        p.openings.flatMap((o) => {
          const r = p.rooms.find((x) => x.id === o.roomId)
          if (!r) return [`${o.kind} 所属房间不存在`]
          if (o.edge < 0 || o.edge >= r.points.length) return [`${o.kind} 边序号越界`]
          const L = edgeInfo(r.points, o.edge).length
          return o.offset - o.width / 2 < -0.5 || o.offset + o.width / 2 > L + 0.5 || o.width <= 0 ? [`${r.name} 的 ${o.kind} 超出边 [0, ${L}]：offset ${o.offset} width ${o.width}`] : []
        }),
      ),
    ).toEqual([])
  })

  test('设备在房间内、互不重叠', () => {
    expect(
      collect((p) => {
        const out: string[] = []
        // 叠放的空调外机和下面那台位置相同，不算重叠；嵌墙收纳柜体伸进墙里，只看中心
        const fx = p.fixtures.filter((f) => !f.stackOn)
        for (const f of fx) {
          const b = fixtureBox(f)
          const corners = f.recessed
            ? [{ x: f.x, y: f.y }]
            : [
                { x: b.x0 + 0.5, y: b.y0 + 0.5 },
                { x: b.x1 - 0.5, y: b.y0 + 0.5 },
                { x: b.x1 - 0.5, y: b.y1 - 0.5 },
                { x: b.x0 + 0.5, y: b.y1 - 0.5 },
              ]
          const inSome = p.rooms.some((r) => corners.every((c) => pointInPolygon(c, r.points) || onBoundary(r.points, c, 1)))
          if (!inSome) out.push(`${f.kind} 不在任何房间内`)
        }
        for (let i = 0; i < fx.length; i++)
          for (let j = i + 1; j < fx.length; j++) if (boxOverlaps(fixtureBox(fx[i]), fixtureBox(fx[j]))) out.push(`${fx[i].kind} 与 ${fx[j].kind} 重叠`)
        return out
      }),
    ).toEqual([])
  })

  test('同 seed 两次生成结构相同（屏蔽 id）', () => {
    const diff = SEEDS.filter((s) => s % 5 === 0).filter((s) => JSON.stringify(normalizeIds(genJp(s))) !== JSON.stringify(normalizeIds(plans.get(s)!)))
    expect(diff).toEqual([])
  })
})
