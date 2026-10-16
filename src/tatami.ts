// 畳割り：把矩形和室铺成榻榻米。
// 以半张榻榻米（约 88cm 见方）为网格单位，用 1×2 的整张和 1×1 的半张去铺，
// 遵守传统规则「四つ目地を作らない」——任何一个点不能有四张榻榻米的角相交。
// 格子数为奇数时放一张半畳，优先放正中（典型的 4.5 畳），放不下再允许放在别处。

export interface Mat {
  x: number
  y: number
  w: number
  h: number
  half: boolean
}

const UNIT = 88

export function tatamiLayout(x0: number, y0: number, x1: number, y1: number): Mat[] {
  const W = x1 - x0
  const H = y1 - y0
  const nx = Math.max(1, Math.round(W / UNIT))
  const ny = Math.max(1, Math.round(H / UNIT))
  const cw = W / nx
  const ch = H / ny
  const cells = solve(nx, ny, true) ?? solve(nx, ny, false) ?? fallback(nx, ny)
  return cells.map((t) => ({ x: x0 + t.c * cw, y: y0 + t.r * ch, w: t.cs * cw, h: t.rs * ch, half: t.cs * t.rs === 1 }))
}

interface Tile {
  r: number
  c: number
  rs: number
  cs: number
}

function solve(nx: number, ny: number, halfAtCenter: boolean): Tile[] | null {
  const grid: number[][] = Array.from({ length: ny }, () => Array(nx).fill(-1))
  const tiles: Tile[] = []
  const needHalf = (nx * ny) % 2 === 1
  const hr = Math.floor(ny / 2)
  const hc = Math.floor(nx / 2)
  let budget = 50000
  let halfUsed = false
  // 只有 halfAtCenter 时才把正中格子保留给半畳
  const reserved = (r: number, c: number) => needHalf && halfAtCenter && r === hr && c === hc

  // 网格内部点 (pr, pc) 处是否四张不同的榻榻米相交
  const cross = (pr: number, pc: number) => {
    if (pr <= 0 || pc <= 0 || pr >= ny || pc >= nx) return false
    const ids = [grid[pr - 1][pc - 1], grid[pr - 1][pc], grid[pr][pc - 1], grid[pr][pc]]
    return ids.every((v) => v >= 0) && new Set(ids).size === 4
  }

  const place = (t: Tile, id: number) => {
    for (let r = t.r; r < t.r + t.rs; r++) for (let c = t.c; c < t.c + t.cs; c++) grid[r][c] = id
  }

  const dfs = (): boolean => {
    if (--budget < 0) return false
    let r = -1
    let c = -1
    outer: for (let i = 0; i < ny; i++)
      for (let j = 0; j < nx; j++)
        if (grid[i][j] < 0) {
          r = i
          c = j
          break outer
        }
    if (r < 0) return true
    const options: Tile[] = []
    if (reserved(r, c)) options.push({ r, c, rs: 1, cs: 1 })
    else {
      if (c + 1 < nx && grid[r][c + 1] < 0 && !reserved(r, c + 1)) options.push({ r, c, rs: 1, cs: 2 })
      if (r + 1 < ny && !reserved(r + 1, c)) options.push({ r, c, rs: 2, cs: 1 })
      if (needHalf && !halfAtCenter && !halfUsed) options.push({ r, c, rs: 1, cs: 1 })
    }
    for (const t of options) {
      const id = tiles.length
      const isHalf = t.rs * t.cs === 1
      place(t, id)
      tiles.push(t)
      if (isHalf) halfUsed = true
      const corners = [
        [t.r, t.c],
        [t.r, t.c + t.cs],
        [t.r + t.rs, t.c],
        [t.r + t.rs, t.c + t.cs],
      ]
      if (!corners.some(([pr, pc]) => cross(pr, pc)) && dfs()) return true
      tiles.pop()
      place(t, -1)
      if (isHalf) halfUsed = false
    }
    return false
  }
  return dfs() ? tiles : null
}

/** 找不到合规铺法时的兜底：逐行横铺，行尾不够就竖铺或半畳 */
function fallback(nx: number, ny: number): Tile[] {
  const grid: boolean[][] = Array.from({ length: ny }, () => Array(nx).fill(false))
  const tiles: Tile[] = []
  for (let r = 0; r < ny; r++)
    for (let c = 0; c < nx; c++) {
      if (grid[r][c]) continue
      let t: Tile
      if (c + 1 < nx && !grid[r][c + 1]) t = { r, c, rs: 1, cs: 2 }
      else if (r + 1 < ny) t = { r, c, rs: 2, cs: 1 }
      else t = { r, c, rs: 1, cs: 1 }
      for (let i = t.r; i < t.r + t.rs; i++) for (let j = t.c; j < t.c + t.cs; j++) grid[i][j] = true
      tiles.push(t)
    }
  return tiles
}
