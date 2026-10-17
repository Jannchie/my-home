// 楼梯外观样式：踏步下方怎么做（body）、扶手怎么做（敞开一侧 / 靠墙一侧分开选）、配色。
// 3D 模型（src/three/stairs3d.ts）按 body / rail 的种类查各自的搭建函数：
// 加一种外观 = 这里加一条样式；加一种新做法（比如悬挑踏板、玻璃踏步）= 在 stairs3d.ts 的 BODY_BUILDERS / RAIL_BUILDERS 里注册一个函数。

/** 踏步下方：solid = 封起来的实心踏步；cabinet = 实心 + 侧面做成柜门（楼梯下收纳）；open = 两侧斜梁 + 镂空踏板（无踢面） */
export type StairBody = 'solid' | 'cabinet' | 'open'
/** 扶手：balusters = 立柱 + 扶手杆；glass = 玻璃栏板；wall = 靠墙的托架扶手；none = 不装 */
export type StairRailKind = 'balusters' | 'glass' | 'wall' | 'none'

export interface StairStyle {
  /** 界面名（中文原文，t() 翻译） */
  label: string
  body: StairBody
  /** 敞开一侧（不靠墙）的扶手 */
  railOpen: StairRailKind
  /** 靠墙一侧的扶手 */
  railWall: StairRailKind
  colors: {
    tread: string
    /** 踏步主体 / 斜梁 */
    body: string
    rail: string
    post: string
    /** 柜门（cabinet） */
    door?: string
  }
}

export const STAIR_STYLES = {
  classic: {
    label: '经典（实心）',
    body: 'solid',
    railOpen: 'balusters',
    railWall: 'wall',
    colors: { tread: '#d6a273', body: '#f3ece0', rail: '#8a6a52', post: '#f7f3ec' },
  },
  storage: {
    label: '楼梯下收纳',
    body: 'cabinet',
    railOpen: 'balusters',
    railWall: 'wall',
    colors: { tread: '#d6a273', body: '#f3ece0', rail: '#8a6a52', post: '#f7f3ec', door: '#e3d3b8' },
  },
  open: {
    label: '镂空木梯',
    body: 'open',
    railOpen: 'balusters',
    railWall: 'wall',
    colors: { tread: '#c8955f', body: '#8a6a52', rail: '#8a6a52', post: '#f2ebe0' },
  },
  modern: {
    label: '现代（玻璃栏板）',
    body: 'open',
    railOpen: 'glass',
    railWall: 'wall',
    colors: { tread: '#e9e3d8', body: '#3f4247', rail: '#3f4247', post: '#3f4247' },
  },
} satisfies Record<string, StairStyle>

export type StairStyleId = keyof typeof STAIR_STYLES
export const DEFAULT_STAIR_STYLE: StairStyleId = 'classic'

/** 楼梯的外观样式（缺省 / 未知 id 用经典） */
export function stairStyle(f: { stairStyle?: string }): StairStyle {
  return (STAIR_STYLES as Record<string, StairStyle>)[f.stairStyle ?? DEFAULT_STAIR_STYLE] ?? STAIR_STYLES[DEFAULT_STAIR_STYLE]
}
