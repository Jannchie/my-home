// 测试和截图用的两层户型：1F 客餐厅 + 厨房 + 浴室 / 洗面 / 卫生间 + 楼梯间（直跑楼梯），
// 2F 三间卧室 + 卫生间 + 走廊（楼梯洞口在走廊里）。坐标单位 cm，外轮廓 900 × 800。
import { rectPoints, type Fixture, type Opening, type Plan, type Room } from '/src/model'

const room = (id: string, name: string, kind: Room['kind'], pts: Room['points'], floor?: string, extra: Partial<Room> = {}): Room => ({ id, name, kind, points: pts, ...(floor ? { floor } : {}), ...extra })
const R = (x0: number, y0: number, x1: number, y1: number) => rectPoints(x0, y0, x1, y1)
let oid = 0
const op = (roomId: string, kind: Opening['kind'], edge: number, offset: number, width: number, extra: Partial<Opening> = {}): Opening => ({ id: `o${++oid}`, kind, roomId, edge, offset, width, hinge: 'start', swing: 'in', ...extra })

export function twoStoryPlan(): Plan {
  oid = 0
  const rooms: Room[] = [
    room('ldk', 'LDK', 'ldk', R(0, 0, 560, 500), undefined, { openGroup: 'ldk' }),
    room('kit', 'キッチン', 'kitchen', R(560, 0, 900, 300), undefined, { openGroup: 'ldk' }),
    room('hall1', '廊下', 'hall', R(560, 300, 900, 800)),
    room('bath', '浴室', 'bath', R(0, 500, 250, 800)),
    room('wash', '洗面所', 'wash', R(250, 500, 400, 800)),
    room('wc1', 'トイレ', 'toilet', R(400, 500, 560, 800)),
    room('hall2', '廊下', 'hall', [
      { x: 560, y: 300 },
      { x: 900, y: 300 },
      { x: 900, y: 800 },
      { x: 560, y: 800 },
      { x: 560, y: 600 },
      { x: 330, y: 600 },
      { x: 330, y: 400 },
      { x: 560, y: 400 },
    ], '2f'),
    room('bed1', '洋室', 'western', R(0, 0, 560, 400), '2f'),
    room('bed2', '洋室', 'western', R(0, 400, 330, 800), '2f'),
    room('bed3', '洋室', 'western', R(560, 0, 900, 300), '2f'),
    room('wc2', 'トイレ', 'toilet', R(330, 600, 560, 800), '2f'),
  ]
  const openings: Opening[] = [
    // 1F
    op('hall1', 'door', 3, 400, 80),
    op('hall1', 'door', 3, 150, 75),
    op('hall1', 'door', 2, 250, 90, { swing: 'out' }),
    op('ldk', 'sliding', 2, 235, 80),
    op('wash', 'folding', 3, 150, 70),
    op('ldk', 'window', 0, 280, 180),
    op('ldk', 'window', 3, 250, 150),
    op('kit', 'window', 0, 170, 120),
    op('bath', 'window', 3, 150, 80),
    // 2F
    op('hall2', 'door', 6, 120, 80),
    op('hall2', 'door', 5, 100, 80),
    op('hall2', 'door', 4, 100, 70),
    op('hall2', 'door', 0, 120, 80),
    op('bed1', 'window', 0, 280, 180),
    op('bed2', 'window', 3, 200, 150),
    op('bed3', 'window', 0, 170, 120),
    op('hall2', 'window', 1, 250, 90),
  ]
  for (const o of openings) if (o.roomId === 'hall2' || o.roomId.startsWith('bed') || o.roomId === 'wc2') o.floor = '2f'
  const fixtures: Fixture[] = [
    { id: 'k', kind: 'kitchen', variant: 'wall', x: 730, y: 41.5, w: 255, rot: 0 },
    { id: 'tub', kind: 'bathtub', x: 125, y: 753.5, w: 140, d: 75, rot: 180 },
    { id: 'wc', kind: 'toilet', x: 480, y: 756, w: 40, d: 70, rot: 180 },
    { id: 'basin', kind: 'basin', x: 325, y: 763.5, w: 75, d: 55, rot: 180 },
    { id: 'stairs', kind: 'stairs', stairs: 'straight', x: 845, y: 605, w: 90, d: 360, rot: 0 },
    { id: 'wc2f', kind: 'toilet', x: 445, y: 756, w: 40, d: 70, rot: 180, floor: '2f' },
  ]
  return {
    version: 1,
    appliancesAsFurniture: true,
    cabinetsAsFurniture: true,
    name: '两层户建',
    wall: 10,
    wallOuter: 18,
    rooms,
    openings,
    fixtures,
    furniture: [],
    floors: [
      { id: '1f', name: '1F', elevation: 0, height: 240 },
      { id: '2f', name: '2F', elevation: 270, height: 240 },
    ],
  }
}
