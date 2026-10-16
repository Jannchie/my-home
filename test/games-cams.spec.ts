// 棋牌（packs/games-more.ts）与家用摄像头（packs/cameras-home.ts、homecams.ts）的一键布置回归：
//   - 新摆件都有支撑面、不超出台面；落地的在房间内
//   - 棋牌按地区出现：本地区少见（GAME_REGION 权重 < 1）的占比很低，各地区都出现了自己的特色棋牌
//   - 宠物摄像头只在养宠物的人家出现，镜头大致朝着宠物区；婴儿监视器在婴儿床边；可视门铃在大门外
import { beforeAll, describe, expect, test } from 'vitest'
import { decorate } from '/src/decorate'
import { generateHousehold, type Household, type InterestId } from '/src/household'
import { generatePlan } from '/src/generate-region'
import { dist, pointInPolygon, type Furniture, type Plan } from '/src/model'
import { supportOf } from '/src/surface'
import { ASSET_MAP } from '/src/three/assets'
import { gameWeight } from '/src/three/packs/games-more'
import { JP_OPTS, range } from './helpers'

type Region = 'jp' | 'cn' | 'west'
interface Case {
  tag: string
  region: Region
  plan: Plan
  hh: Household
  f: Furniture[]
}
const REGIONS: Region[] = ['jp', 'cn', 'west']
/** 普通住户（看摄像头）和强制「棋牌 Lv.3」的住户（看棋牌的地区分布） */
const normal: Case[] = []
const gamers: Case[] = []
const GAME = /^(bg-|int-(poker|uno|card-game|mahjong-(case|mat)|hanafuda|karuta|shogi|go|chess|xiangqi|reversi|chinese-checkers|backgammon|bg-|boardgame|jenga|dice-game)|hg-(go-board|mj-(walls|hands)))/

function run(region: Region, seed: number, tweak?: (hh: Household) => void): Case {
  const plan = generatePlan({ seed, ...JP_OPTS, region }).plan
  const hh = generateHousehold(plan, seed)
  tweak?.(hh)
  plan.household = hh
  plan.furniture = decorate(plan, seed, 'auto', hh)
  return { tag: `${region}#${seed}`, region, plan, hh, f: plan.furniture }
}

beforeAll(() => {
  for (const region of REGIONS)
    for (const seed of range(1, 24)) {
      normal.push(run(region, seed))
      if (seed <= 14)
        gamers.push(
          run(region, seed, (hh) => {
            const m = hh.members[0]
            if (!m.interests.includes('boardgames')) m.interests = [...m.interests.slice(0, 2), 'boardgames' as InterestId]
            m.levels = { ...m.levels, boardgames: 3 }
          }),
        )
    }
}, 300_000)

const def = (x: Furniture) => ASSET_MAP.get(x.asset)!
const mine = (x: Furniture) => /^(hc|bg)-/.test(x.asset)

describe('棋牌与摄像头的一键布置', () => {
  test('新摆件有支撑面、不超出台面；落地的在房间内', () => {
    const bad: string[] = []
    for (const { tag, plan, f } of [...normal, ...gamers])
      for (const x of f.filter(mine)) {
        const d = def(x)
        if (d.mount) continue
        if ((x.z ?? 0) > 0.5) {
          const sp = supportOf(plan, x)
          if (!sp) bad.push(`${tag}: ${x.asset} 悬空`)
          else if (!sp.fits) bad.push(`${tag}: ${x.asset} 超出台面`)
        } else if (!plan.rooms.some((r) => pointInPolygon(x, r.points))) bad.push(`${tag}: ${x.asset} 在房间外`)
      }
    expect(bad).toEqual([])
  })

  test('棋牌按地区出现：少见的 ≤ 10%，各地区都有本地特色', () => {
    const SIGNATURE: Record<Region, RegExp> = {
      cn: /^(bg-(junqi|gomoku|doushou|feixing|poker-|paijiu)|int-(xiangqi|mahjong|chinese-checkers)|hg-mj-)/,
      jp: /^(bg-(hanafuda|sugoroku)|int-(hanafuda|karuta|shogi|reversi))/,
      west: /^(bg-(checkers|property|words|holdem|chip-case|dominoes)|int-(chess|backgammon|bg-))/,
    }
    const report: string[] = []
    for (const region of REGIONS) {
      const games = gamers.filter((c) => c.region === region).flatMap((c) => c.f.filter((x) => GAME.test(x.asset) && def(x).prop))
      const rare = games.filter((x) => gameWeight(x.asset, region) < 1)
      const sig = games.filter((x) => SIGNATURE[region].test(x.asset))
      report.push(`${region}: ${games.length} 件，少见 ${rare.length}（${rare.map((x) => x.asset).join(',')}），特色 ${sig.length}`)
      expect(games.length, report.join('\n')).toBeGreaterThan(20)
      expect(rare.length / games.length, report.join('\n')).toBeLessThanOrEqual(0.1)
      expect(sig.length / games.length, report.join('\n')).toBeGreaterThanOrEqual(0.25)
    }
    // 新棋牌（bg-）在每个地区都出现
    for (const region of REGIONS) expect(gamers.some((c) => c.region === region && c.f.some((x) => x.asset.startsWith('bg-'))), region).toBe(true)
  })

  test('宠物摄像头只在养宠物的人家，镜头大致朝着宠物区', () => {
    const PETS: InterestId[] = ['cats', 'dogs', 'smallpets', 'birds']
    let petHomes = 0
    let withCam = 0
    const bad: string[] = []
    for (const { tag, hh, f } of normal) {
      const pets = hh.members.some((m) => m.interests.some((i) => PETS.includes(i)))
      const cams = f.filter((x) => x.asset.startsWith('hc-pet-'))
      if (!pets) {
        if (cams.length) bad.push(`${tag}: 没养宠物却有 ${cams.map((x) => x.asset)}`)
        continue
      }
      const spots = f.filter((x) => !x.z && def(x).category === 'pets' && !def(x).prop && !def(x).mount && !/^rb-|aquarium/.test(x.asset))
      if (!spots.length) continue
      petHomes++
      if (cams.length) withCam++
      for (const c of cams) {
        // 朝向（正面 = +z 转 rot）与最近宠物区方向的夹角
        const a = (c.rot * Math.PI) / 180
        const front = { x: -Math.sin(a), y: Math.cos(a) }
        const best = Math.max(
          ...spots.map((s) => {
            const v = { x: s.x - c.x, y: s.y - c.y }
            const L = Math.hypot(v.x, v.y) || 1
            return (front.x * v.x + front.y * v.y) / L
          }),
        )
        if (best < 0.5) bad.push(`${tag}: ${c.asset} 没有朝向宠物区（cos=${best.toFixed(2)}）`)
      }
    }
    expect(bad).toEqual([])
    expect(withCam / Math.max(1, petHomes), `${withCam}/${petHomes}`).toBeGreaterThanOrEqual(0.4)
  })

  test('婴儿监视器在婴儿床边；可视门铃装在大门外（不在任何房间里）', () => {
    const bad: string[] = []
    let babyCams = 0
    for (const { tag, plan, f } of normal) {
      for (const c of f.filter((x) => x.asset === 'hc-baby-cam')) {
        babyCams++
        const crib = f.find((x) => def(x).family === 'kid-crib')
        if (!crib || dist(crib, c) > 330) bad.push(`${tag}: 婴儿监视器离婴儿床太远`)
      }
      for (const b of f.filter((x) => x.asset === 'hc-doorbell-video')) if (plan.rooms.some((r) => pointInPolygon(b, r.points))) bad.push(`${tag}: 可视门铃在室内`)
    }
    expect(bad).toEqual([])
    expect(babyCams).toBeGreaterThan(0)
  })
})
