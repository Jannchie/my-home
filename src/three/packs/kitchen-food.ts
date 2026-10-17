// 厨房收纳 / 餐具 / 食物饮料 / 餐桌摆设素材包，id 统一用 kf- 前缀。约定见 kit.ts 开头。
//   - 桌面小物都是 prop：原点在底面中心，普通素材由 def() 自动落地并在 xz 上居中；
//     带 fx / surface(s) / mount / 挂起形态的素材坐标是手工对好的（模型本身左右前后居中），不再自动挪动。
//   - 挂起形态（form: 'hanging'）沿用 storage-forms 的约定：原点 = 挂点，模型在原点下方，本体在 z ≥ 0.3，
//     自带 S 钩（上环内顶 y ≈ -0.5）。挂杆的挂点层 y = 杆顶 + 0.5。
//   - 碗、杯、盘、盒都是真空心（cup / tray / 车削），食物放在口沿以下；食物不画脸。
//   - 食物类的配色主要换盛器（碗、盘、托盘、包装）的颜色，食物本身保持固有色。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, toon, torus, tray } from '../toon'
import { C, G, rectPoly, rng, type AssetDef, type SurfaceDef } from '../kit'
import { PI, cappedTube, hcyl, latheAt, lit, noOutlineDeep, rod3, type V3 } from '../geo'
import { I, J, M, N, R, type Pal3 } from '../packkit'
import { BRASS, BREAD, CARD, CHOCO, DISH_IN, EGG_Y, GLASS, KRAFT, NEGI, PG, RICE, STEEL, STEEL_D, TEA, TOFU, TUBE, WINE_R, arc, bottle, can, chopsticks, def, dish, dome, glassGhost } from './kitchen-food/common'
import { KNIFE_MOUNT, MW, RAIL_BAR_Y, RAIL_MOUNT, RAIL_R, RAIL_Z, WAGON_DX, bagStand, boardStand, canisters, counterRack, cupboard, cupboardCols, cupboardShelves, dishRack2, dishRackMini, gapWagon, glassContainers, hungTool, kitchenWagon, knifeMagnet, ladleBody, laidTool, panRack, railBase, railWithTools, rangeRack, riceCabinet, spiceCarousel, spiceShelf, tongsBody, turnerBody, utensilCrock, wagonTiers, whiskBody, wrapRack } from './kitchen-food/storage'
import { beerMugs, bento2, chawanmushi, chopstickPair, coasterStack, cutleryTray, donburi, dripSet, glassTumblers, kyusuSet, mugTree, placemat, plateStack, soyDish, tokkuriSet, washokuSet, wineGlasses } from './kitchen-food/tableware'
import { MISO_FX, NOODLE_FX, RICE_FX, UDON_FX, apples, baguettes, bananas, beerCrate, beerSixPack, breadBag, cannedFood, cupNoodle, curryRice, donutBox, eggCarton, grapes, isshobin, kitsuneUdon, mikanBox, milkCarton, misoSoup, onigiriTrio, onionPotatoBags, petBottles, riceBowl, riceSack, seasoningBottles, snackBags, sushiOke, toastPlate, vegBasket, waterCase, watermelonHalf, wineRack } from './kitchen-food/food'
import { NABE_FX, OKONOMI_FX, SUKI_FX, TEISHOKU, TEISHOKU_FX, dinnerForTwo, nabeSet, okonomiyakiGrill, sukiyaki, takoParty, teishoku, temakiParty } from './kitchen-food/setting'

// ======================================================================
// 配色表
// ======================================================================

const RACK_PALS: Pal3[] = [
  ['modern', STEEL, M.white, M.char],
  ['nordic', N.white, N.oakL, N.sage],
  ['cute', C.white, C.sakura, C.pink],
  ['industrial', M.black, I.concrete, I.rust],
]
const SPICE_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.linen],
  ['modern', M.black, M.silver, M.white],
  ['japanese', J.wood, J.sumi, J.washi],
  ['industrial', I.walnut, I.iron, '#e8dcc4'],
  ['cute', C.woodL, C.pink, C.white],
]
const KNIFE_PALS: Pal3[] = [
  ['modern', M.char, M.black, M.silver],
  ['nordic', N.oak, N.oakL, N.white],
  ['industrial', I.walnut, I.walnut, I.iron],
  ['japanese', J.hinoki, J.dark, J.sumi],
]
const CROCK_PALS: Pal3[] = [
  ['nordic', N.white, N.oak, STEEL],
  ['japanese', J.ai, J.wood, STEEL],
  ['retro', R.mustard, R.caramel, R.cream],
  ['industrial', I.concrete, I.walnut, M.black],
  ['cute', C.mint, C.woodL, C.pink],
]
const WAGON_PALS: Pal3[] = [
  ['modern', M.white, M.white, M.char],
  ['nordic', N.white, N.sage, N.oak],
  ['industrial', I.iron, I.iron, I.walnut],
  ['cute', C.white, C.mint, C.pink],
  ['retro', R.cream, R.teal, R.mustard],
]
const RICE_CAB_PALS: Pal3[] = [
  ['modern', M.white, M.light, M.char],
  ['nordic', N.white, N.oakL, N.sage],
  ['japanese', J.hinoki, J.wood, J.shu],
  ['cute', C.white, C.sakura, C.pink],
]
const BAG_STAND_PALS: Pal3[] = [
  ['modern', M.white, '#e8ecef', '#d65a3c'],
  ['industrial', M.black, '#e8ecef', I.rust],
  ['nordic', N.white, '#eef1ea', N.sage],
  ['cute', C.white, '#fff0f4', C.pink],
]
const LID_PALS: Pal3[] = [
  ['modern', M.white, M.light, '#e9d8a6'],
  ['nordic', N.sage, N.blue, '#e9d8a6'],
  ['cute', C.pink, C.sky, '#ffd8a8'],
  ['industrial', M.char, I.concrete, '#c9a77c'],
]
const CANISTER_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.oak],
  ['modern', M.black, M.white, M.silver],
  ['retro', R.orange, R.cream, R.caramel],
  ['cute', C.lemon, C.white, C.pink],
]
const WRAP_PALS: Pal3[] = [
  ['modern', M.white, '#e86a5a', '#4a7fc0'],
  ['nordic', N.oak, '#e86a5a', '#4a7fc0'],
  ['industrial', M.black, '#e86a5a', '#4a7fc0'],
  ['cute', C.mint, '#ff9db0', '#a8d4f4'],
]
const RAIL_PALS: Pal3[] = [
  ['modern', STEEL, STEEL, M.black],
  ['industrial', M.black, I.iron, I.walnut],
  ['nordic', N.white, N.white, N.oak],
  ['retro', BRASS, BRASS, R.caramel],
]
const TOOL_PALS: Pal3[] = [
  ['modern', STEEL, M.black, M.black],
  ['nordic', STEEL, N.oak, N.oak],
  ['cute', STEEL, C.pink, C.pink],
  ['industrial', STEEL_D, I.walnut, I.walnut],
  ['retro', STEEL, R.teal, R.teal],
]
const BOARD_PALS: Pal3[] = [
  ['nordic', N.white, N.oak, N.sage],
  ['modern', M.black, M.walnut, M.white],
  ['japanese', J.sumi, J.hinoki, J.washi],
  ['cute', C.white, C.woodL, C.pink],
]
const PANRACK_PALS: Pal3[] = [
  ['modern', M.black, M.char, M.black],
  ['nordic', N.white, '#e9e4dc', N.oak],
  ['industrial', I.iron, I.iron, I.walnut],
  ['cute', C.white, C.pink, C.woodL],
]
const SHELF_PALS: Pal3[] = [
  ['nordic', N.white, N.oak, N.sage],
  ['modern', M.black, M.char, M.silver],
  ['industrial', I.iron, I.walnut, I.rust],
  ['japanese', J.sumi, J.wood, J.shu],
  ['cute', C.white, C.woodL, C.pink],
]
const GAP_PALS: Pal3[] = [
  ['modern', M.white, M.light, M.char],
  ['nordic', N.white, N.oak, N.sage],
  ['industrial', M.black, I.walnut, I.rust],
  ['cute', C.white, C.pink, C.sky],
]
const CUPBOARD_PALS: Pal3[] = [
  ['modern', M.white, M.light, M.char],
  ['nordic', N.white, N.oak, M.black],
  ['japanese', J.wood, J.hinoki, J.sumi],
  ['industrial', I.walnut, I.walnut, I.iron],
  ['retro', R.caramel, R.cream, '#d4a64a'],
]

// 餐具
const WASHOKU_PALS: Pal3[] = [
  ['japanese', J.washi, '#9b2d26', J.dark],
  ['japanese', '#e9e2d0', J.sumi, J.shu],
  ['nordic', N.white, N.oak, N.oak],
  ['modern', M.white, M.black, M.black],
  ['cute', C.white, C.pink, C.pink],
]
const CHOP_PALS: Pal3[] = [
  ['japanese', J.shu, J.sumi, J.washi],
  ['nordic', N.oak, N.oakL, N.sage],
  ['modern', M.black, M.silver, M.white],
  ['cute', C.pink, C.sky, C.lemon],
]
const PLATE_PALS: Pal3[] = [
  ['nordic', N.white, N.linen, N.blue],
  ['japanese', J.washi, '#d8d0bc', J.ai],
  ['modern', M.white, M.light, M.black],
  ['retro', R.cream, R.mustard, R.teal],
  ['cute', C.white, C.sakura, C.pink],
]
const BENTO_PALS: Pal3[] = [
  ['japanese', J.sumi, J.shu, J.shu],
  ['japanese', J.hinoki, J.wood, J.ai],
  ['cute', C.white, C.pink, C.mint],
  ['modern', M.char, M.light, M.black],
  ['nordic', N.sage, N.white, N.oak],
]
const CHAWAN_PALS: Pal3[] = [
  ['japanese', J.washi, J.wood, J.wood],
  ['japanese', J.ai, J.sumi, J.hinoki],
  ['modern', M.white, M.black, M.walnut],
  ['nordic', N.white, N.oak, N.oak],
]
const SOY_PALS: Pal3[] = [
  ['japanese', J.washi, J.ai, J.shu],
  ['modern', M.white, M.white, M.black],
  ['nordic', N.linen, N.white, N.oak],
  ['cute', C.white, C.white, C.pink],
]
const TUMBLER_PALS: Pal3[] = [
  ['modern', GLASS, '#f5a25d', M.char],
  ['nordic', GLASS, '#f5d58a', N.oak],
  ['retro', '#e8f5d0', R.orange, R.caramel],
  ['cute', '#ffe6ee', '#ff9db0', C.white],
]
const MUGTREE_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.sage],
  ['modern', M.black, M.white, M.char],
  ['retro', R.caramel, R.mustard, R.teal],
  ['cute', C.woodL, C.pink, C.sky],
  ['industrial', I.walnut, I.concrete, I.rust],
]
const WINE_PALS: Pal3[] = [
  ['modern', GLASS, WINE_R, M.black],
  ['nordic', GLASS, WINE_R, N.oak],
  ['industrial', GLASS, WINE_R, I.walnut],
  ['retro', '#f2ead0', '#e8c24a', R.caramel],
]
const BEER_PALS: Pal3[] = [
  ['industrial', I.walnut, GLASS, I.rust],
  ['modern', M.char, GLASS, M.white],
  ['retro', R.cream, GLASS, R.red],
  ['nordic', N.oak, GLASS, N.sage],
]
const TOKKURI_PALS: Pal3[] = [
  ['japanese', J.washi, J.dark, J.ai],
  ['japanese', '#c9b79a', J.sumi, J.shu],
  ['retro', R.cream, R.caramel, R.teal],
  ['modern', M.white, M.black, M.char],
]
const DRIP_PALS: Pal3[] = [
  ['modern', STEEL, M.white, M.black],
  ['nordic', N.white, N.white, N.oak],
  ['industrial', '#c7773e', '#8a6a52', I.walnut],
  ['retro', R.cream, R.mustard, R.caramel],
  ['cute', C.white, C.pink, C.woodL],
]
const KYUSU_PALS: Pal3[] = [
  ['japanese', '#8a4a2a', J.washi, J.wood],
  ['japanese', J.ai, '#e9e2d0', J.dark],
  ['modern', M.black, M.white, M.walnut],
  ['nordic', N.white, N.linen, N.oak],
  ['cute', C.mint, C.white, C.woodL],
]
const MAT_PALS: Pal3[] = [
  ['japanese', J.tatami, J.dark, J.dark],
  ['nordic', N.linen, N.sage, N.oak],
  ['modern', M.char, M.gray, M.black],
  ['cute', C.sakura, C.pink, C.pink],
  ['retro', R.mustard, R.caramel, R.red],
]
const COASTER_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, N.oak],
  ['japanese', J.hinoki, J.ai, J.wood],
  ['modern', M.char, M.gray, M.black],
  ['cute', C.pink, C.mint, C.white],
  ['retro', R.orange, R.cream, R.teal],
]
const CUTLERY_PALS: Pal3[] = [
  ['nordic', N.oak, N.oakL, N.oak],
  ['modern', M.white, M.light, M.black],
  ['industrial', I.walnut, I.walnut, M.black],
  ['cute', C.mint, C.white, C.pink],
]
const DON_PALS: Pal3[] = [
  ['japanese', J.ai, J.ai, J.washi],
  ['japanese', J.shu, J.sumi, J.washi],
  ['retro', R.cream, R.teal, R.red],
  ['modern', M.black, M.black, M.silver],
]

// 食物：换盛器
const RICEBOWL_PALS: Pal3[] = [
  ['japanese', J.washi, J.sumi, J.dark],
  ['japanese', J.ai, J.ai, J.shu],
  ['nordic', N.white, N.oak, N.oak],
  ['cute', C.white, C.pink, C.pink],
  ['modern', M.black, M.black, M.black],
]
const MISO_PALS: Pal3[] = [
  ['japanese', '#3a1f1a', '#9b2d26', J.shu],
  ['japanese', J.sumi, J.sumi, J.shu],
  ['nordic', N.oak, N.oak, N.oak],
  ['modern', M.black, M.char, M.black],
]
const UDON_PALS: Pal3[] = [
  ['japanese', J.washi, J.washi, J.ai],
  ['japanese', J.sumi, J.sumi, J.shu],
  ['retro', R.cream, R.cream, R.red],
  ['modern', M.white, M.white, M.black],
]
const CURRY_PALS: Pal3[] = [
  ['retro', R.cream, R.teal, STEEL],
  ['modern', M.white, M.light, STEEL],
  ['nordic', N.white, N.blue, N.oak],
  ['cute', C.white, C.pink, C.woodL],
]
const OKE_PALS: Pal3[] = [
  ['japanese', J.hinoki, '#b07a3a', '#5a9e3a'],
  ['japanese', J.shu, J.sumi, '#5a9e3a'],
  ['nordic', N.oakL, N.oak, '#5a9e3a'],
]
const ONIGIRI_PALS: Pal3[] = [
  ['japanese', '#7cae5a', J.wood, '#e9c0a0'],
  ['nordic', N.oakL, N.oak, '#e8d27a'],
  ['modern', '#3e3f44', M.char, '#e9c0a0'],
  ['cute', C.mint, C.woodL, '#ffc6a0'],
]
const BREADBAG_PALS: Pal3[] = [
  ['modern', '#f4f8fb', '#4a7fc0', '#e8eef5'],
  ['retro', '#fdf8ea', R.red, R.mustard],
  ['cute', '#fff6fa', C.pink, C.sakura],
  ['nordic', '#f6f6f0', N.sage, N.linen],
]
const TOAST_PALS: Pal3[] = [
  ['nordic', N.oak, N.white, STEEL],
  ['industrial', I.walnut, I.iron, STEEL],
  ['japanese', J.hinoki, J.washi, J.wood],
  ['cute', C.woodL, C.pink, C.pink],
]
const BAGUETTE_PALS: Pal3[] = [
  ['nordic', KRAFT, N.white, N.white],
  ['retro', KRAFT, R.red, R.red],
  ['modern', '#f4f2ec', M.black, M.black],
  ['industrial', '#b58f62', I.iron, I.iron],
]
const DONUT_PALS: Pal3[] = [
  ['retro', R.cream, R.orange, '#7ad3c8'],
  ['cute', C.white, C.pink, C.lilac],
  ['modern', M.white, M.char, '#f7a8c4'],
  ['nordic', N.linen, N.sage, '#f2c94c'],
]
const APPLE_PALS: Pal3[] = [
  ['nordic', N.oak, N.oak, '#e0453a'],
  ['japanese', J.wood, J.dark, '#d63a3a'],
  ['modern', M.white, M.white, '#e0453a'],
  ['retro', R.cream, R.caramel, '#d6503a'],
]
const BANANA_PALS: Pal3[] = [
  ['nordic', N.oak, N.oak, '#5a4630'],
  ['modern', M.black, M.black, '#5a4630'],
  ['industrial', I.iron, I.walnut, '#5a4630'],
  ['cute', C.woodL, C.pink, '#5a4630'],
]
const MIKAN_PALS: Pal3[] = [
  ['japanese', CARD, '#3a7a3a', '#ff9a2a'],
  ['retro', CARD, R.red, '#ff9a2a'],
  ['nordic', '#d8c4a4', N.sage, '#ffa438'],
]
const MELON_PALS: Pal3[] = [
  ['nordic', '#3f8f3a', '#ff5a5a', N.white],
  ['japanese', '#35803a', '#ff5a5a', J.washi],
  ['cute', '#4f9e3b', '#ff6a7a', C.sky],
  ['modern', '#3f8f3a', '#ff5a5a', M.light],
]
const GRAPE_PALS: Pal3[] = [
  ['modern', M.white, M.white, '#5a3a7a'],
  ['nordic', N.linen, N.oak, '#5a3a7a'],
  ['cute', C.white, C.lilac, '#9fcf6a'],
  ['japanese', J.washi, J.wood, '#4a2f6a'],
]
const VEG_PALS: Pal3[] = [
  ['japanese', '#c9a568', '#a8813e', J.wood],
  ['nordic', '#d9c8a4', N.oak, N.oak],
  ['industrial', '#8a6a4a', I.iron, I.iron],
  ['cute', '#f0d8b0', C.pink, C.pink],
]
const NETBAG_PALS: Pal3[] = [
  ['retro', '#d64a3a', '#e0a526', R.cream],
  ['modern', '#d64a3a', '#3a8a5a', M.white],
  ['nordic', '#c85a4a', '#7a9a6a', N.linen],
]
const EGG_PALS: Pal3[] = [
  ['modern', '#eef4f8', '#e8a640', M.white],
  ['nordic', '#d8cbb0', N.sage, N.white],
  ['cute', '#ffeef3', C.pink, C.white],
]
const MILK_PALS: Pal3[] = [
  ['modern', M.white, '#4a7fc0', M.white],
  ['retro', R.cream, R.red, R.red],
  ['cute', C.white, C.pink, C.pink],
  ['nordic', N.white, N.sage, N.oak],
]
const NOODLE_PALS: Pal3[] = [
  ['retro', M.white, R.red, '#f2ecd8'],
  ['modern', M.white, M.black, M.light],
  ['cute', C.white, C.pink, '#fff3c8'],
  ['industrial', '#e8e0d0', I.rust, '#d8cfc0'],
]
const SNACK_PALS: Pal3[] = [
  ['retro', R.orange, R.red, R.teal],
  ['cute', C.pink, C.sky, C.lemon],
  ['modern', M.char, M.silver, '#d65a3c'],
  ['nordic', N.mustard, N.sage, N.blue],
]
const CAN_PALS: Pal3[] = [
  ['retro', R.red, R.teal, R.mustard],
  ['industrial', I.rust, I.steel, '#6a7a4a'],
  ['modern', M.white, M.char, M.silver],
  ['cute', C.pink, C.mint, C.lemon],
]
const SEASON_PALS: Pal3[] = [
  ['japanese', J.shu, '#e8c24a', J.washi],
  ['modern', M.black, M.white, M.white],
  ['retro', R.red, R.mustard, R.cream],
  ['nordic', N.white, N.oak, N.linen],
]
const SACK_PALS: Pal3[] = [
  ['japanese', J.washi, J.ai, J.shu],
  ['retro', R.cream, R.red, R.mustard],
  ['nordic', N.linen, N.sage, N.oak],
  ['modern', M.white, M.char, '#4a7fc0'],
]
const WATER_PALS: Pal3[] = [
  ['modern', CARD, '#4a9ad8', '#3a7ac8'],
  ['nordic', '#e2d6c0', N.blue, N.white],
  ['cute', CARD, C.sky, C.pink],
]
const SIXPACK_PALS: Pal3[] = [
  ['modern', M.silver, M.black, STEEL],
  ['retro', R.mustard, R.red, STEEL],
  ['japanese', '#2f4a8a', J.washi, STEEL],
  ['cute', C.sky, C.white, STEEL],
]
const CRATE_PALS: Pal3[] = [
  ['retro', '#d6463a', '#e0a526', R.cream],
  ['industrial', '#4a5a4a', '#c9a24a', I.concrete],
  ['modern', '#3d5a8a', '#d8d8d8', M.white],
  ['japanese', '#c8a03a', J.shu, J.washi],
]
const SAKE_PALS: Pal3[] = [
  ['japanese', '#3f6b3a', J.washi, J.shu],
  ['japanese', '#5a3a1f', J.washi, J.sumi],
  ['retro', '#3f6b3a', R.cream, R.mustard],
  ['modern', '#2a2c30', M.white, M.black],
]
const WINERACK_PALS: Pal3[] = [
  ['nordic', N.oak, '#2f4a2a', '#7a1f33'],
  ['industrial', I.walnut, '#2f4a2a', M.black],
  ['modern', M.black, '#2f3a2a', '#c3a052'],
  ['retro', R.caramel, '#3a2a1f', R.red],
]
const PET_PALS: Pal3[] = [
  ['modern', '#f2a03c', M.white, M.white],
  ['cute', '#ff9db0', C.white, C.pink],
  ['retro', '#d64a3a', R.cream, R.red],
  ['nordic', TEA, N.white, N.sage],
]

// 餐桌摆设
const TEISHOKU_PALS: Pal3[] = [
  ['japanese', J.dark, '#9b2d26', J.washi],
  ['japanese', J.hinoki, J.sumi, '#e9e2d0'],
  ['nordic', N.oak, N.sage, N.white],
  ['modern', M.black, M.black, M.white],
  ['cute', C.woodL, C.pink, C.white],
]
const DINNER_PALS: Pal3[] = [
  ['nordic', N.white, N.linen, N.sage],
  ['modern', M.white, M.char, M.black],
  ['retro', R.cream, R.mustard, R.teal],
  ['cute', C.white, C.sakura, C.pink],
  ['industrial', I.concrete, '#8a6a4a', I.iron],
]
const NABE_PALS: Pal3[] = [
  ['japanese', M.char, '#e9e2d0', J.ai],
  ['japanese', M.silver, '#6e4f37', J.shu],
  ['retro', R.red, R.cream, R.teal],
  ['modern', M.white, M.black, M.silver],
  ['cute', C.pink, C.white, C.pink],
]
const TAKO_PALS: Pal3[] = [
  ['retro', R.red, R.cream, '#5a2e1c'],
  ['modern', M.white, M.white, M.black],
  ['cute', C.pink, C.white, C.pink],
  ['japanese', J.sumi, J.washi, J.shu],
]
const GRILL_PALS: Pal3[] = [
  ['modern', M.white, M.black, M.black],
  ['industrial', M.black, I.walnut, I.walnut],
  ['retro', R.mustard, R.caramel, R.caramel],
  ['cute', C.sky, C.white, C.pink],
]
const TEMAKI_PALS: Pal3[] = [
  ['japanese', J.hinoki, J.washi, J.ai],
  ['japanese', J.shu, J.sumi, J.washi],
  ['nordic', N.oakL, N.white, N.blue],
  ['modern', M.walnut, M.black, M.white],
]
const SUKI_PALS: Pal3[] = [
  ['japanese', I.iron, J.washi, J.dark],
  ['japanese', I.iron, J.ai, J.shu],
  ['modern', M.black, M.white, M.black],
  ['retro', I.iron, R.cream, R.caramel],
]

// ======================================================================
// 素材表
// ======================================================================

const r = rectPoly
const WAGON_IN = r(-21 - WAGON_DX, -13.5, 21 - WAGON_DX, 13.5)
const wagonSurf = (tiers: number) => {
  const ys = wagonTiers(tiers)
  const gap = ys[1] - ys[0]
  return ys.slice(0, -1).map((y) => ({ y: y + 0.6, h: gap - 0.6, shape: [WAGON_IN] }))
}
const cupSurf = (W: number): SurfaceDef[] => {
  const k = cupboardShelves(W)
  const z0 = -k.D / 2
  const low = [r(-W / 2 + 2.5, z0 + 1.8, W / 2 - 2.5, k.D / 2 - 1.5)]
  return [
    { y: k.lowTop, h: k.upBottom - 2 - k.lowTop, shape: [r(-W / 2 + 1, z0 + 2, W / 2 - 1, k.D / 2 - 1)] },
    // 上柜（玻璃门）
    { y: k.upBottom, h: k.upMid - 1.5 - k.upBottom, shape: [r(-W / 2 + 2.5, z0 + 1.5, W / 2 - 2.5, z0 + k.upD - 2)], inside: true, glass: true },
    { y: k.upMid, h: k.top - 2 - k.upMid, shape: [r(-W / 2 + 2.5, z0 + 1.5, W / 2 - 2.5, z0 + k.upD - 4)], inside: true, glass: true },
    // 下柜：门里两层 + 每列一个抽屉
    { y: 8, h: k.lowMid - 1.6 - 8 - 0.5, shape: low, inside: true },
    { y: k.lowMid, h: 61.4 - k.lowMid - 0.5, shape: low, inside: true },
    ...cupboardCols(W).map(({ x, cw }): SurfaceDef => ({ y: k.drawerY + 1.1, h: 9.5, inside: true, slide: 23, shape: [r(x - (cw - 4) / 2 + 1.2, k.D / 2 - 0.4 - 38 + 1.2, x + (cw - 4) / 2 - 1.2, k.D / 2 - 1.6)] })),
  ]
}

type ToolKind = 'ladle' | 'turner' | 'whisk' | 'tongs'
const TOOL_BODY: Record<ToolKind, (p: string[]) => THREE.Group> = { ladle: ladleBody, turner: turnerBody, whisk: whiskBody, tongs: tongsBody }
const TOOL_NAME: Record<ToolKind, string> = { ladle: '汤勺', turner: '锅铲', whisk: '打蛋器', tongs: '食物夹' }
const TOOL_DIMS: Record<ToolKind, { lying: [number, number, number]; hanging: [number, number, number] }> = {
  ladle: { lying: [30.3, 8.4, 3.6], hanging: [8.4, 5.3, 35.8] },
  turner: { lying: [30.9, 8, 1.2], hanging: [8, 5.3, 36.4] },
  whisk: { lying: [27, 6.7, 6.7], hanging: [6.7, 8.2, 32.5] },
  tongs: { lying: [25.4, 6.5, 1.5], hanging: [6.5, 5.3, 30.9] },
}
const toolDefs = (k: ToolKind): AssetDef[] => [
  def({ id: `kf-${k}`, name: TOOL_NAME[k], form: 'lying', w: TOOL_DIMS[k].lying[0], d: TOOL_DIMS[k].lying[1], h: TOOL_DIMS[k].lying[2], pals: TOOL_PALS, build: (p) => laidTool(TOOL_BODY[k](p)) }),
  def({ id: `kf-${k}-hanging`, name: TOOL_NAME[k], form: 'hanging', w: TOOL_DIMS[k].hanging[0], d: TOOL_DIMS[k].hanging[1], h: TOOL_DIMS[k].hanging[2], pals: TOOL_PALS, build: (p) => hungTool(TOOL_BODY[k](p)) }),
]

export const KITCHEN_FOOD: AssetDef[] = [
  // ---------- 厨房收纳 ----------
  def({ id: 'kf-dish-rack', name: '两层沥水架', sizeLabel: '空', w: 48, d: 29.3, h: 37.5, pals: RACK_PALS, build: (p) => dishRack2(p, false) }),
  def({ id: 'kf-dish-rack-full', name: '两层沥水架', sizeLabel: '放着碗盘', w: 48, d: 29.3, h: 37.5, pals: RACK_PALS, build: (p) => dishRack2(p, true) }),
  def({ id: 'kf-dish-rack-mini', name: '两层沥水架', sizeLabel: '单层小号', w: 34, d: 24, h: 13.5, pals: RACK_PALS, build: dishRackMini }),
  def({ id: 'kf-spice-carousel', name: '旋转调料架', w: 24, d: 24, h: 25.8, pals: SPICE_PALS, build: spiceCarousel }),
  def({ id: 'kf-spice-shelf', name: '两层调料架（带瓶）', w: 36, d: 12, h: 30, pals: SPICE_PALS, build: spiceShelf }),
  def({ id: 'kf-knife-magnet', name: '磁吸刀架', w: 42, d: 2.8, h: 31.5, mount: KNIFE_MOUNT, prop: false, pals: KNIFE_PALS, build: knifeMagnet }),
  def({ id: 'kf-utensil-crock', name: '厨具筒', w: 12.9, d: 12.8, h: 35.1, pals: CROCK_PALS, build: utensilCrock }),
  def({ id: 'kf-wagon-3', name: '厨房网篮推车', sizeLabel: '3 层', w: 48.3, d: 30.6, h: 73.2, prop: false, surface: 67.6, surfaceShape: [WAGON_IN], surfaces: wagonSurf(3), pals: WAGON_PALS, build: (p) => kitchenWagon(p, 3) }),
  def({ id: 'kf-wagon-4', name: '厨房网篮推车', sizeLabel: '4 层', w: 48.3, d: 30.6, h: 85.2, prop: false, surface: 79.6, surfaceShape: [WAGON_IN], surfaces: wagonSurf(4), pals: WAGON_PALS, build: (p) => kitchenWagon(p, 4) }),
  def({ id: 'kf-rice-cabinet', name: '计量米柜 10kg', w: 26, d: 43.6, h: 48, pals: RICE_CAB_PALS, build: riceCabinet }),
  def({ id: 'kf-bag-stand', name: '垃圾分类挂袋架', w: 74.6, d: 29.3, h: 68, prop: false, pals: BAG_STAND_PALS, build: bagStand }),
  def({ id: 'kf-glass-containers', name: '玻璃保鲜盒叠放', w: 22.6, d: 17.8, h: 21.6, pals: LID_PALS, build: glassContainers }),
  def({ id: 'kf-canisters', name: '干货密封罐', w: 27, d: 9, h: 29, pals: CANISTER_PALS, build: canisters }),
  def({ id: 'kf-wrap-rack', name: '保鲜膜收纳架', w: 34, d: 9, h: 16, pals: WRAP_PALS, build: wrapRack }),
  def({
    id: 'kf-rail',
    name: '厨房挂杆',
    sizeLabel: '空杆（可挂厨具）',
    w: 62.2,
    d: 4.9,
    h: 6,
    mount: RAIL_MOUNT,
    prop: false,
    surfaces: [{ y: RAIL_BAR_Y + RAIL_R + 0.5, kind: 'hook', h: 40, shape: [r(-27, RAIL_Z - 1.5, 27, RAIL_Z + 1.5)] }],
    pals: RAIL_PALS,
    build: (p) => railBase(p, 60),
  }),
  def({ id: 'kf-rail-tools', name: '厨房挂杆', sizeLabel: '挂满厨具', w: 62.6, d: 10, h: 38.1, mount: 107.9, prop: false, pals: RAIL_PALS, build: railWithTools }),
  ...toolDefs('ladle'),
  ...toolDefs('turner'),
  ...toolDefs('whisk'),
  ...toolDefs('tongs'),
  def({ id: 'kf-board-stand', name: '砧板立架', w: 30, d: 12, h: 23, pals: BOARD_PALS, build: boardStand }),
  def({ id: 'kf-pan-rack', name: '锅具收纳架', w: 24, d: 36, h: 37.4, pals: PANRACK_PALS, build: panRack }),
  def({ id: 'kf-range-rack', name: '微波炉架', w: MW.w, d: MW.d, h: MW.h, prop: false, surface: MW.h, surfaces: [{ y: MW.shelves[0] + 2, h: 120 }, { y: MW.shelves[1] + 2, h: 36 }, { y: MW.shelves[2] + 2, h: 28 }], pals: SHELF_PALS, build: rangeRack }),
  def({ id: 'kf-counter-rack', name: '台面置物架（跨电器）', w: 58, d: 36, h: 42, surface: 42, pals: SHELF_PALS, build: counterRack }),
  def({ id: 'kf-gap-wagon', name: '冰箱夹缝推车（带调料）', w: 15, d: 55.9, h: 80.2, prop: false, pals: GAP_PALS, build: gapWagon }),
  def({ id: 'kf-cupboard-80', name: '玻璃门食器棚', sizeLabel: '80', category: 'dining', w: 81, d: 46.8, h: 180, prop: false, surface: 180, surfaceShape: [r(-40, -22.5, 40, 9)], openable: true, surfaces: cupSurf(80), pals: CUPBOARD_PALS, build: (p) => cupboard(p, 80) }),
  def({ id: 'kf-cupboard-120', name: '玻璃门食器棚', sizeLabel: '120', category: 'dining', w: 121, d: 46.8, h: 180, prop: false, surface: 180, surfaceShape: [r(-60, -22.5, 60, 9)], openable: true, surfaces: cupSurf(120), pals: CUPBOARD_PALS, build: (p) => cupboard(p, 120) }),

  // ---------- 餐具 ----------
  def({ id: 'kf-washoku-set', name: '一人份和食器', category: 'tabletop', w: 25, d: 17.5, h: 9.2, pals: WASHOKU_PALS, build: washokuSet }),
  def({ id: 'kf-chopsticks', name: '筷子筷架', category: 'tabletop', w: 23, d: 5.6, h: 1.6, pals: CHOP_PALS, build: chopstickPair }),
  def({ id: 'kf-plates-s', name: '盘子叠放', sizeLabel: '小 15cm', w: 15, d: 15, h: 7.4, pals: PLATE_PALS, build: (p) => plateStack(p, 7.5, 5) }),
  def({ id: 'kf-plates-m', name: '盘子叠放', sizeLabel: '中 21cm', w: 21, d: 21, h: 6, pals: PLATE_PALS, build: (p) => plateStack(p, 10.5, 4) }),
  def({ id: 'kf-plates-l', name: '盘子叠放', sizeLabel: '大 27cm', w: 27, d: 27, h: 5.5, pals: PLATE_PALS, build: (p) => plateStack(p, 13.5, 3) }),
  def({ id: 'kf-bento-closed', name: '两层便当盒', form: 'closed', category: 'tabletop', w: 18, d: 11.8, h: 11, pals: BENTO_PALS, build: (p) => bento2(p, false) }),
  def({ id: 'kf-bento-open', name: '两层便当盒', form: 'open', category: 'tabletop', w: 36, d: 13.8, h: 10.6, pals: BENTO_PALS, build: (p) => bento2(p, true) }),
  def({ id: 'kf-chawanmushi', name: '茶碗蒸杯', category: 'tabletop', w: 13, d: 13, h: 10, pals: CHAWAN_PALS, build: chawanmushi }),
  def({ id: 'kf-soy-dish', name: '酱油碟 + 酱油壶', category: 'tabletop', w: 16.7, d: 9, h: 8.4, pals: SOY_PALS, build: soyDish }),
  def({ id: 'kf-tumblers', name: '玻璃杯组', category: 'tabletop', w: 22.6, d: 9.6, h: 12.4, pals: TUMBLER_PALS, build: glassTumblers }),
  def({ id: 'kf-mug-tree', name: '马克杯架', category: 'tabletop', w: 27.1, d: 27.1, h: 35, pals: MUGTREE_PALS, build: mugTree }),
  def({ id: 'kf-wine-glasses', name: '葡萄酒杯一对', category: 'tabletop', w: 20, d: 12, h: 20.6, pals: WINE_PALS, build: wineGlasses }),
  def({ id: 'kf-beer-mugs', name: '啤酒杯（两杯）', category: 'tabletop', w: 23.4, d: 10.3, h: 15.4, pals: BEER_PALS, build: beerMugs }),
  def({ id: 'kf-tokkuri', name: '热燗套组（德利 + 猪口）', category: 'tabletop', w: 24, d: 14, h: 15, raw: true, fx: [{ kind: 'steam', x: 0, y: 15, z: 0, scale: 0.4, height: 10 }], pals: TOKKURI_PALS, build: tokkuriSet }),
  def({ id: 'kf-drip-set', name: '手冲咖啡套组', category: 'tabletop', w: 31.9, d: 11, h: 19.5, pals: DRIP_PALS, build: dripSet }),
  def({ id: 'kf-kyusu-set', name: '急须茶壶 + 汤吞', category: 'tabletop', w: 30, d: 17.5, h: 11, pals: KYUSU_PALS, build: kyusuSet }),
  def({ id: 'kf-placemat', name: '餐垫', sizeLabel: '长方', category: 'tabletop', w: 45, d: 32, h: 1.3, pals: MAT_PALS, build: (p) => placemat(p, 'rect') }),
  def({ id: 'kf-placemat-round', name: '餐垫', sizeLabel: '圆形', category: 'tabletop', w: 38, d: 38, h: 1.3, pals: MAT_PALS, build: (p) => placemat(p, 'round') }),
  def({ id: 'kf-coasters', name: '杯垫一叠', category: 'tabletop', w: 22.8, d: 12.4, h: 3.4, pals: COASTER_PALS, build: coasterStack }),
  def({ id: 'kf-cutlery-tray', name: '餐具收纳盒', w: 30, d: 22, h: 5, pals: CUTLERY_PALS, build: cutleryTray }),
  def({ id: 'kf-donburi', name: '丼碗（带盖）', category: 'tabletop', w: 16, d: 16, h: 10.6, pals: DON_PALS, build: donburi }),

  // ---------- 食物 / 饮料 ----------
  def({ id: 'kf-rice-bowl', name: '一碗白饭', category: 'tabletop', w: 22, d: 14, h: 7.5, off: [0, -1.2], fx: RICE_FX, pals: RICEBOWL_PALS, build: riceBowl }),
  def({ id: 'kf-miso-soup', name: '味噌汤', category: 'tabletop', w: 12, d: 12, h: 6.6, fx: MISO_FX, pals: MISO_PALS, build: misoSoup }),
  def({ id: 'kf-udon', name: '狐狸乌冬', category: 'tabletop', w: 19, d: 19, h: 8.1, fx: UDON_FX, pals: UDON_PALS, build: kitsuneUdon }),
  def({ id: 'kf-curry', name: '咖喱饭', category: 'tabletop', w: 26, d: 19, h: 3.6, pals: CURRY_PALS, build: curryRice }),
  def({ id: 'kf-sushi-oke', name: '寿司桶（散寿司）', category: 'tabletop', w: 30, d: 30, h: 7, pals: OKE_PALS, build: sushiOke }),
  def({ id: 'kf-onigiri-trio', name: '饭团三个', category: 'tabletop', w: 25, d: 13, h: 7, pals: ONIGIRI_PALS, build: onigiriTrio }),
  def({ id: 'kf-bread-bag', name: '袋装吐司', category: 'tabletop', w: 12.4, d: 27.1, h: 15.6, pals: BREADBAG_PALS, build: breadBag }),
  def({ id: 'kf-toast-plate', name: '吐司切片配黄油', category: 'tabletop', w: 24, d: 16, h: 4.3, pals: TOAST_PALS, build: toastPlate }),
  def({ id: 'kf-baguettes', name: '纸袋法棍', category: 'tabletop', w: 17.7, d: 8, h: 62, pals: BAGUETTE_PALS, build: baguettes }),
  def({ id: 'kf-donut-box', name: '甜甜圈盒', category: 'tabletop', w: 30, d: 21, h: 25.6, pals: DONUT_PALS, build: donutBox }),
  def({ id: 'kf-apples', name: '苹果', category: 'tabletop', w: 20, d: 20, h: 9.3, pals: APPLE_PALS, build: apples }),
  def({ id: 'kf-bananas', name: '香蕉架', category: 'tabletop', w: 23.6, d: 18.1, h: 36.6, pals: BANANA_PALS, build: bananas }),
  def({ id: 'kf-mikan-box', name: '一箱橘子', w: 36, d: 41.2, h: 24.5, pals: MIKAN_PALS, build: mikanBox }),
  def({ id: 'kf-watermelon', name: '半个西瓜', category: 'tabletop', w: 28, d: 28, h: 10, pals: MELON_PALS, build: watermelonHalf }),
  def({ id: 'kf-grapes', name: '一串葡萄', category: 'tabletop', w: 18, d: 18, h: 6, pals: GRAPE_PALS, build: grapes }),
  def({ id: 'kf-veg-basket', name: '蔬菜篮（萝卜·葱·白菜）', w: 44.2, d: 28.8, h: 16.2, pals: VEG_PALS, build: vegBasket }),
  def({ id: 'kf-onion-bags', name: '洋葱土豆网袋', w: 31.9, d: 10, h: 14.3, pals: NETBAG_PALS, build: onionPotatoBags }),
  def({ id: 'kf-eggs', name: '鸡蛋盒', w: 26, d: 23, h: 5.6, pals: EGG_PALS, build: eggCarton }),
  def({ id: 'kf-milk', name: '牛奶盒', sizeLabel: '1L', w: 7, d: 7, h: 23.4, pals: MILK_PALS, build: (p) => milkCarton(p, true) }),
  def({ id: 'kf-milk-s', name: '牛奶盒', sizeLabel: '500ml', w: 6, d: 6, h: 16.4, pals: MILK_PALS, build: (p) => milkCarton(p, false) }),
  def({ id: 'kf-cup-noodle', name: '杯面', form: 'closed', category: 'tabletop', w: 10, d: 11.4, h: 10.8, pals: NOODLE_PALS, build: (p) => cupNoodle(p, false) }),
  def({ id: 'kf-cup-noodle-open', name: '杯面', form: 'open', formLabel: '泡着', category: 'tabletop', w: 21, d: 11.6, h: 18.8, off: [0, 0.97], fx: NOODLE_FX, pals: NOODLE_PALS, build: (p) => cupNoodle(p, true) }),
  def({ id: 'kf-snacks', name: '零食袋', category: 'tabletop', w: 34.8, d: 11.8, h: 21.7, pals: SNACK_PALS, build: snackBags }),
  def({ id: 'kf-cans', name: '罐头叠放', w: 25.7, d: 8.4, h: 16.5, pals: CAN_PALS, build: cannedFood }),
  def({ id: 'kf-seasonings', name: '调味料瓶（酱油·味醂·油）', w: 24.4, d: 8.4, h: 28.2, pals: SEASON_PALS, build: seasoningBottles }),
  def({ id: 'kf-rice-sack-5', name: '米袋', sizeLabel: '5kg', w: 28, d: 42, h: 9.4, pals: SACK_PALS, build: (p) => riceSack(p, 5) }),
  def({ id: 'kf-rice-sack-10', name: '米袋', sizeLabel: '10kg', w: 36, d: 54, h: 11.4, pals: SACK_PALS, build: (p) => riceSack(p, 10) }),
  def({ id: 'kf-water-case', name: '矿泉水整箱', sizeLabel: '2L×6', form: 'open', w: 32.6, d: 34.7, h: 38.9, pals: WATER_PALS, build: (p) => waterCase(p, true) }),
  def({ id: 'kf-water-case-closed', name: '矿泉水整箱', sizeLabel: '2L×6', form: 'closed', w: 32.6, d: 22.6, h: 31, pals: WATER_PALS, build: (p) => waterCase(p, false) }),
  def({ id: 'kf-beer-6', name: '啤酒罐六连包', category: 'tabletop', w: 21, d: 14, h: 13.2, pals: SIXPACK_PALS, build: beerSixPack }),
  def({ id: 'kf-beer-crate', name: '啤酒箱（20 瓶）', w: 48.4, d: 33, h: 30.8, pals: CRATE_PALS, build: beerCrate }),
  def({ id: 'kf-isshobin', name: '清酒一升瓶', category: 'tabletop', w: 10, d: 10, h: 41, pals: SAKE_PALS, build: isshobin }),
  def({ id: 'kf-wine-rack', name: '葡萄酒 + 酒架', w: 34, d: 30.5, h: 26, pals: WINERACK_PALS, build: wineRack }),
  def({ id: 'kf-pet-bottles', name: '宝特瓶饮料', category: 'tabletop', w: 18, d: 13.7, h: 33, pals: PET_PALS, build: petBottles }),

  // ---------- 餐桌摆设 ----------
  def({ id: 'kf-teishoku', name: '一人份定食', category: 'tabletop', w: TEISHOKU.w, d: TEISHOKU.d, h: 7.8, fx: TEISHOKU_FX, pals: TEISHOKU_PALS, build: teishoku }),
  def({ id: 'kf-dinner-two', name: '两人晚餐套组', category: 'tabletop', w: 40, d: 62, h: 11.6, pals: DINNER_PALS, build: dinnerForTwo }),
  def({ id: 'kf-nabe', name: '火锅（卡式炉 + 土锅）', category: 'tabletop', w: 36, d: 31.1, h: 22.4, off: [0, -0.55], fx: NABE_FX, pals: NABE_PALS, build: nabeSet }),
  def({ id: 'kf-takoyaki-party', name: '章鱼烧派对', category: 'tabletop', w: 43, d: 29.7, h: 15.4, pals: TAKO_PALS, build: takoParty }),
  def({ id: 'kf-okonomiyaki', name: '铁板烧（大阪烧）', category: 'tabletop', w: 60.4, d: 35.4, h: 8.1, off: [0, -1.72], fx: OKONOMI_FX, pals: GRILL_PALS, build: okonomiyakiGrill }),
  def({ id: 'kf-temaki-party', name: '手卷寿司派对', category: 'tabletop', w: 53, d: 32, h: 7, pals: TEMAKI_PALS, build: temakiParty }),
  def({ id: 'kf-sukiyaki', name: '寿喜烧', category: 'tabletop', w: 34, d: 37.8, h: 5, off: [0, -4.91], fx: SUKI_FX, pals: SUKI_PALS, build: sukiyaki }),
]

// ======================================================================
// 追加：饮料（罐 / 玻璃瓶 / 宝特瓶 / 纸盒）、矿泉水、饮水机、零食点心
// ======================================================================

const WATER = '#cfeeff'
const PET = '#e8f6ff'
const MILK = '#fbfaf4'

/** 一罐饮料：罐身 + 标签色带 + 拉环；at.y 为底面 */
function drinkCan(r: number, h: number, body: string, band: string, top = STEEL, at: { x?: number; y?: number; z?: number } = {}) {
  const g = can(r, h, body, top)
  g.add(noOutlineDeep(cyl(r + 0.03, r + 0.03, h * 0.28, band, { y: h * 0.38 }, 20)))
  g.add(noOutlineDeep(rbox(1, 0.2, 1.6, STEEL_D, { y: h, z: r * 0.35 }, 0.1)))
  g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return g
}

/** 封好的整箱纸箱（24 罐 / 24 瓶）：侧面印色带和一个商品小图，顶上胶带，两侧把手孔 */
function sealedCase(w: number, h: number, d: number, band: string, mark: string) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, CARD, {}, 0.4))
  g.add(noOutlineDeep(rbox(w + 0.6, h * 0.3, d + 0.6, band, { y: h * 0.35 }, 0.2)))
  g.add(noOutlineDeep(rbox(5, h * 0.6, 0.3, mark, { x: w * 0.3, y: h * 0.18, z: d / 2 + 0.5 }, 0.6)))
  g.add(noOutlineDeep(rbox(6, 0.2, d + 0.2, '#e8d9b8', { y: h }, 0.05)))
  for (const s of [-1, 1]) g.add(noOutlineDeep(rbox(0.3, 2, 6, shade(CARD, -0.3), { x: s * (w / 2 + 0.05), y: h - 4 }, 0.5)))
  return g
}

/** 罐装饮料：single 单罐 / six 六联包（塑料环） / case 24 罐整箱 / short 咖啡短罐 / slim 能量饮料细长罐 */
function cans(p: string[], kind: 'single' | 'six' | 'case' | 'short' | 'slim') {
  const [body, band, acc] = p
  const g = new THREE.Group()
  if (kind === 'single') g.add(drinkCan(3.3, 12.2, body, band))
  if (kind === 'short') g.add(drinkCan(2.65, 10.4, body, band, acc))
  if (kind === 'slim') g.add(drinkCan(2.65, 13.4, body, band))
  if (kind === 'six') {
    for (let i = 0; i < 6; i++) g.add(drinkCan(3.3, 12.2, body, band, STEEL, { x: -6.7 + (i % 3) * 6.7, z: i < 3 ? -3.35 : 3.35 }))
    // 顶上的塑料提环
    g.add(glassGhost(rbox(20.4, 0.4, 13.6, '#f4f4f4', { y: 11.2 }, 0.2), '#f4f4f4', 0.55))
    for (let i = 0; i < 6; i++) g.add(torus(3, 0.25, acc, { x: -6.7 + (i % 3) * 6.7, y: 11.4, z: i < 3 ? -3.35 : 3.35, rx: PI / 2 }))
  }
  if (kind === 'case') g.add(sealedCase(41, 12.8, 27.4, body, band))
  return g
}

/** 玻璃瓶：soda 汽水瓶 / milk 牛奶瓶 / juice 果汁瓶 / beer 精酿啤酒 / sparkling 气泡水 */
function glassBottle(p: string[], kind: 'soda' | 'milk' | 'juice' | 'beer' | 'sparkling') {
  const [lab, cap, liq] = p
  const g = new THREE.Group()
  if (kind === 'soda') {
    g.add(glassGhost(latheAt([[0, 0], [2.8, 0], [2.9, 0.4], [2.9, 9], [2.2, 12], [1.3, 16], [1.3, 18.6], [0, 18.6]], GLASS), '#cfe9d8', 0.45))
    g.add(noOutlineDeep(latheAt([[0, 0.4], [2.55, 0.4], [2.55, 9], [1.95, 12], [1.1, 15], [0, 15]], liq)))
    g.add(noOutlineDeep(cyl(2.95, 2.95, 4, lab, { y: 3 }, 20)))
    g.add(cyl(1.5, 1.4, 0.9, cap, { y: 18.4 }, 16))
  } else if (kind === 'milk') {
    g.add(glassGhost(latheAt([[0, 0], [3.1, 0], [3.2, 0.4], [3.2, 7.5], [2.4, 10.5], [2.2, 12.6], [0, 12.6]], GLASS), GLASS, 0.4))
    g.add(noOutlineDeep(latheAt([[0, 0.3], [2.9, 0.3], [2.9, 7.4], [2.15, 10.3], [2, 11.6], [0, 11.6]], MILK)))
    g.add(cyl(2.4, 2.4, 0.4, cap, { y: 12.5 }, 20))
    g.add(noOutlineDeep(cyl(2.6, 2.4, 1.2, lab, { y: 11.9 }, 20)))
  } else if (kind === 'juice') {
    g.add(glassGhost(latheAt([[0, 0], [3.2, 0], [3.3, 0.4], [3.3, 11], [2.4, 13.5], [2, 15], [0, 15]], GLASS), GLASS, 0.4))
    g.add(noOutlineDeep(latheAt([[0, 0.4], [3, 0.4], [3, 10.8], [2.2, 13], [0, 13]], liq)))
    g.add(noOutlineDeep(cyl(3.35, 3.35, 5, lab, { y: 3.5 }, 20)))
    g.add(cyl(2.2, 2.2, 1.4, cap, { y: 14.8 }, 20))
  } else if (kind === 'beer') {
    g.add(bottle(3.1, 21, 1.15, 12.5, '#6b3a16', {}))
    g.add(noOutlineDeep(cyl(3.14, 3.14, 6.5, lab, { y: 3.5 }, 20)))
    g.add(noOutlineDeep(rbox(2.4, 3, 0.3, cap, { y: 5.2, z: 3.12 }, 0.2)))
    g.add(cyl(1.4, 1.3, 0.9, cap, { y: 20.6 }, 14))
  } else {
    g.add(bottle(3.9, 27, 1.3, 13, '#4f8a4a', {}))
    g.add(noOutlineDeep(cyl(3.95, 3.95, 6, lab, { y: 5 }, 22)))
    g.add(cyl(1.5, 1.5, 2, cap, { y: 26.6 }, 14))
  }
  return g
}

/** 宝特瓶：500ml（圆） / 2L（方）；liq 为饮料色，标签用色带区分 */
function petBottle(p: string[], big: boolean) {
  const [liq, lab, cap] = p
  const g = new THREE.Group()
  if (!big) {
    g.add(glassGhost(bottle(3.3, 19.6, 1.35, 13.5, PET, {}), PET, 0.4))
    g.add(noOutlineDeep(bottle(3.05, 16.5, 1.1, 13.3, liq, { y: 0.3 })))
    g.add(noOutlineDeep(cyl(3.35, 3.35, 6, lab, { y: 5 }, 20)))
    g.add(cyl(1.5, 1.5, 1.6, cap, { y: 19.4 }, 14))
    return g
  }
  // 2L 方瓶：方身 + 圆肩
  g.add(glassGhost(rbox(9.6, 23, 9.6, PET, {}, 2), PET, 0.4))
  g.add(glassGhost(latheAt([[4.8, 0], [4.8, 1], [3, 4.5], [1.6, 6.2], [1.6, 8], [0, 8]], PET, { y: 23 }), PET, 0.4))
  g.add(noOutlineDeep(rbox(9, 21.6, 9, liq, { y: 0.4 }, 1.8)))
  g.add(noOutlineDeep(rbox(10.2, 7, 10.2, lab, { y: 9 }, 2))) // 比瓶身每边凸出 0.3，避免和瓶身侧面闪烁
  g.add(cyl(1.7, 1.7, 2, cap, { y: 31 }, 14))
  return g
}

/** 矿泉水：500ml 圆瓶 / 2L 方瓶（水色 + 色带标签） */
function waterBottle(p: string[], big: boolean) {
  return petBottle([WATER, p[0], p[1]], big)
}

/** 利乐纸盒：soy1l 豆乳 1L / soy200 豆乳 200ml（侧面贴吸管）/ juice125 果汁小盒（吸管插好） */
function tetra(p: string[], kind: 'soy1l' | 'soy200' | 'juice125') {
  const [body, band, acc] = p
  const g = new THREE.Group()
  const [w, d, h] = kind === 'soy1l' ? [7, 7, 19.5] : kind === 'soy200' ? [6.3, 4, 10.5] : [5.2, 3.6, 8.6]
  g.add(rbox(w, h, d, body, {}, 0.3))
  g.add(noOutlineDeep(rbox(w + 0.6, h * 0.4, d + 0.6, band, { y: h * 0.18 }, 0.25)))
  g.add(noOutlineDeep(ball(w * 0.18, acc, { y: h * 0.72, z: d / 2 + 0.02 }, [1, 1, 0.1])))
  if (kind === 'soy1l') {
    g.add(cyl(1.3, 1.3, 1.2, acc, { x: 1.4, y: h, z: 1.4 }, 14))
    g.add(rbox(w, 0.6, 1, body, { y: h, z: -d / 2 + 0.5 }, 0.2))
  }
  if (kind === 'soy200') g.add(glassGhost(rbox(0.8, 9, 0.8, '#f4f4f4', { x: w / 2 + 0.75, y: 0.6 }, 0.3), '#f4f4f4', 0.6))
  if (kind === 'juice125') g.add(PG(cyl(0.3, 0.3, 6, acc, {}, 8), 1.2, h - 1, 0.6, 0, 0, -0.35))
  return g
}

/** 酸奶：tub 400g 大盒 / four 四连杯 */
function yogurt(p: string[], kind: 'tub' | 'four') {
  const [body, lid, band] = p
  const g = new THREE.Group()
  if (kind === 'tub') {
    g.add(cup(5.4, 4.6, 8.4, 0.3, body))
    g.add(noOutlineDeep(cyl(5.1, 5.1, 0.3, MILK, { y: 7.6 }, 24)))
    g.add(noOutlineDeep(cup(5.42, 4.95, 4, 0.05, band, { y: 2.4 })))
    g.add(puck(5.8, 1.4, lid, { y: 8.2 }))
    return g
  }
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 ? 1 : -1) * 3.6
    const z = i < 2 ? -3.6 : 3.6
    g.add(cup(3.3, 2.8, 6, 0.25, body, { x, z }))
    g.add(noOutlineDeep(cyl(3.05, 3.05, 0.3, MILK, { x, y: 5.4, z }, 20)))
  }
  g.add(rbox(14.4, 0.3, 14.4, lid, { y: 6 }, 0.1))
  g.add(noOutlineDeep(rbox(14.6, 2.6, 14.6, band, { y: 1.6 }, 0.2)))
  return g
}

/** 冰箱用冷水壶（2L 细长，装麦茶 / 水） */
function fridgePot(p: string[]) {
  const [lid, liq, acc] = p
  const g = new THREE.Group()
  g.add(glassGhost(cup(5.2, 5, 25, 0.3, GLASS), GLASS, 0.35))
  g.add(noOutlineDeep(cyl(4.85, 4.75, 19, liq, { y: 0.3 }, 24)))
  g.add(puck(5.6, 2.4, lid, { y: 24.4 }))
  g.add(rbox(3, 1.4, 3, lid, { y: 25, z: 5 }, 0.5))
  g.add(cyl(1.4, 1.4, 1, acc, { y: 26.6 }, 12))
  g.add(glassGhost(cappedTube([[-5, 21, 0], [-8.6, 19, 0], [-8.6, 6, 0], [-5, 4, 0]], 0.8, GLASS, { ...TUBE, seg: 20 }), GLASS, 0.5))
  return g
}

// ---------- 饮水机 ----------

/** 倒扣的大水桶（半透明，能看到水）：瓶口朝下，瓶口底在 y0，半径 r、桶高 h */
function bigBottle(r: number, h: number, y0: number, fill = 0.75) {
  const g = new THREE.Group()
  const pts: [number, number][] = [[0, 0], [2.2, 0], [2.2, 3], [r * 0.55, 4.5], [r, 8], [r, h - 2], [r - 2, h], [0, h]]
  g.add(glassGhost(latheAt(pts, '#bfe6ff', { y: y0 }, 28), '#bfe6ff', 0.35))
  // 倒扣时水在下面（靠瓶口一侧）
  const wh = (h - 8) * fill
  g.add(glassGhost(cyl(r - 0.5, r - 0.5, wh, '#7cc4f0', { y: y0 + 8 }, 28), '#7cc4f0', 0.4))
  g.add(glassGhost(latheAt([[0, 0.3], [1.9, 0.3], [1.9, 3], [r * 0.52, 4.6], [r - 0.5, 8], [0, 8]], '#7cc4f0', { y: y0 }), '#7cc4f0', 0.4))
  // 桶身的加强环（不透明细圈，看得出是个桶）
  for (const k of [0.35, 0.7]) g.add(torus(r + 0.05, 0.25, '#9fd2f2', { y: y0 + 8 + (h - 10) * k, rx: PI / 2 }))
  return g
}

/** 冷热两个出水口（蓝 / 红按钮）+ 接水托盘；凹槽背板在 z = zf，出水口高 y */
function taps(trayC: string, y: number, zf: number, trayY: number, w = 16) {
  const g = new THREE.Group()
  g.add(rbox(w, y - trayY + 4, 0.6, '#3a3c40', { y: trayY, z: zf }, 0.4))
  for (const [x, c] of [
    [-3.5, '#4fa3f0'],
    [3.5, '#f05a4f'],
  ] as const) {
    g.add(rbox(3, 2.4, 4.2, c, { x, y, z: zf + 2.2 }, 0.8))
    g.add(cyl(0.6, 0.6, 1.2, STEEL, { x, y: y - 1.2, z: zf + 3 }, 10))
  }
  g.add(tray(w - 1, 1.4, 6.5, 0.4, trayC, { y: trayY, z: zf + 3.5 }, 0.4))
  g.add(noOutlineDeep(rbox(w - 2.4, 0.2, 5.2, STEEL_D, { y: trayY + 1.1, z: zf + 3.5 }, 0.05)))
  return g
}

/** 落地饮水机（ウォーターサーバー）：top = 上置（12L 水桶倒扣在顶上） / bottom = 下置（水桶在柜内，透明窗看得到） */
function waterServer(p: string[], top: boolean) {
  const [body, panel, acc] = p
  const g = new THREE.Group()
  const W = 30
  const D = 34
  if (top) {
    const H = 100
    g.add(rbox(W, H, D, body, {}, 3))
    g.add(rbox(W - 6, 30, 1, panel, { y: 62, z: D / 2 - 0.3 }, 1.5))
    g.add(taps(acc, 84, D / 2 + 0.2, 64))
    g.add(rbox(14, 3, 0.6, panel, { y: 94, z: D / 2 }, 0.5))
    g.add(lit(ball(0.5, '#7fe0a8', { x: 4, y: 95.5, z: D / 2 + 0.4 }), '#7fe0a8', 0.8))
    g.add(cyl(7, 8, 1.5, panel, { y: H }, 24))
    g.add(bigBottle(13, 38, H + 1.5))
    for (let i = 0; i < 4; i++) g.add(noOutlineDeep(rbox(16, 0.6, 0.3, shade(body, -0.15), { y: 6 + i * 1.6, z: D / 2 + 0.05 }, 0.1)))
    return g
  }
  const H = 112
  // 下部柜（侧板 + 背板 + 底板），正面是透明窗，能看到柜里的水桶
  for (const sx of [-1, 1]) g.add(rbox(1.5, 60, D, body, { x: sx * (W / 2 - 0.75) }, 0.8))
  g.add(rbox(W - 3, 1.5, D, body, {}, 0.5))
  g.add(rbox(W - 3, 60, 1.5, body, { z: -D / 2 + 0.75 }, 0.5))
  g.add(glassGhost(rbox(W - 3, 56, 0.4, GLASS, { y: 1.5, z: D / 2 - 0.5 }, 0.3), '#d8e2ea', 0.3))
  g.add(rbox(W - 3, 3, 1.2, panel, { y: 1.5, z: D / 2 - 0.6 }, 0.4))
  // 柜里的水桶（瓶口朝上立放，吸水管插进桶口）
  const b = bigBottle(12, 36, 0)
  b.rotation.x = PI
  b.position.set(0, 1.5 + 36, -1)
  g.add(b)
  g.add(cyl(0.6, 0.6, 22, '#e8f2f8', { y: 38, z: -1 }, 8))
  // 上部机身
  g.add(rbox(W, H - 58, D, body, { y: 58 }, 3))
  g.add(rbox(W - 6, 30, 1, panel, { y: 66, z: D / 2 - 0.3 }, 1.5))
  g.add(taps(acc, 88, D / 2 + 0.2, 68))
  g.add(rbox(14, 3, 0.6, panel, { y: 101, z: D / 2 }, 0.5))
  g.add(lit(ball(0.5, '#7fe0a8', { x: 4, y: 102.5, z: D / 2 + 0.4 }), '#7fe0a8', 0.8))
  return g
}

/** 台式小饮水机（7L 水桶倒扣） */
function deskServer(p: string[]) {
  const [body, panel, acc] = p
  const g = new THREE.Group()
  g.add(rbox(24, 28, 28, body, {}, 2.5))
  g.add(rbox(18, 17, 1, panel, { y: 4, z: 13.7 }, 1.2))
  g.add(taps(acc, 15, 14.2, 4.4, 14))
  g.add(cyl(5.5, 6, 1.2, panel, { y: 28 }, 20))
  g.add(bigBottle(9.5, 24, 29.2))
  return g
}

// ---------- 外卖 / 便利店 / 日配 ----------

/** 披萨盒（L 33cm）：open 打开（盖子立在后面） / closed 合上 */
function pizzaBox(p: string[], open: boolean) {
  const [box, print, top] = p
  const g = new THREE.Group()
  const S = 33
  if (!open) {
    g.add(rbox(S, 4.4, S, box, {}, 0.4))
    g.add(noOutlineDeep(cyl(9, 9, 0.2, print, { y: 4.4 }, 28)))
    g.add(noOutlineDeep(cyl(6, 6, 0.25, top, { y: 4.4 }, 28)))
    return g
  }
  g.add(tray(S, 4.2, S, 0.4, box, {}, 0.3))
  // 盖子立在后面（盖内侧朝前，印着圆标）
  const lid = new THREE.Group()
  lid.add(rbox(S, 0.4, S, box, {}, 0.2))
  lid.add(noOutlineDeep(cyl(9, 9, 0.2, print, { y: 0.4 }, 28)))
  lid.rotation.x = PI / 2 - 0.06
  lid.position.set(0, S / 2 + 0.2, -S / 2 - 0.2)
  g.add(lid)
  // 披萨：饼边 + 酱 + 芝士 + 料，切 8 块
  const y = 0.4
  g.add(torus(14.2, 1.1, '#d9a050', { y: y + 1, rx: PI / 2 }))
  g.add(cyl(14, 14, 1, '#e8b468', { y }, 40))
  g.add(noOutlineDeep(cyl(13.2, 13.2, 0.3, '#d8442e', { y: y + 1 }, 40)))
  g.add(noOutlineDeep(cyl(12.4, 12.4, 0.35, '#ffe08a', { y: y + 1.1 }, 40)))
  const r = rng(13)
  for (let i = 0; i < 14; i++) {
    const a = r() * PI * 2
    const d = 2 + r() * 9
    g.add(cyl(1.6, 1.6, 0.4, '#c8303f', { x: Math.cos(a) * d, y: y + 1.35, z: Math.sin(a) * d }, 14))
  }
  for (let i = 0; i < 10; i++) g.add(noOutlineDeep(torus(0.8, 0.22, '#3f8a3a', { x: Math.cos(i * 2.1) * (3 + (i % 4) * 2.4), y: y + 1.6, z: Math.sin(i * 2.1) * (3 + (i % 4) * 2.4), rx: PI / 2 })))
  for (let i = 0; i < 4; i++) g.add(noOutlineDeep(rbox(28, 0.1, 0.2, '#b8803c', { y: y + 1.75, ry: (i * PI) / 4 }, 0.02)))
  return g
}

/** 中华外卖纸盒（打开，炒面）+ 一次性筷子 */
function chineseTakeout(p: string[]) {
  const [box, print, handle] = p
  const g = new THREE.Group()
  // 方口圆台：四段车削转 45°
  const m = latheAt([[0, 0], [5.4, 0], [7.6, 10], [7.3, 10], [5.1, 0.35], [0, 0.35]], box, {}, 4)
  m.rotation.y = PI / 4
  g.add(m)
  g.add(noOutlineDeep(rbox(4, 4, 0.2, print, { y: 3, z: 4, rx: -0.22 }, 1)))
  g.add(cappedTube([[-6.6, 9, 0], [-5, 15, 0], [5, 15, 0], [6.6, 9, 0]], 0.12, handle, { ...TUBE, seg: 24 }))
  for (let i = 0; i < 8; i++) g.add(noOutlineDeep(cappedTube(arc([0, 8.6, 0], 1 + i * 0.6, i * 0.9, i * 0.9 + 2.6, 6, 'xz'), 0.3, '#d9a050', { ...TUBE, seg: 12 })))
  g.add(noOutlineDeep(ball(1, '#3f8a3a', { x: 2, y: 9, z: -1 }, [1.3, 0.3, 1])))
  g.add(noOutlineDeep(rbox(1.4, 0.4, 1, '#f08a3c', { x: -2, y: 9, z: 1.5 }, 0.2)))
  g.add(chopsticks(20, '#ead7b8', 0, 0, 9.5))
  return g
}

/** 外卖便当（底盒 + 透明盖，炸鸡 + 饭） */
function takeoutBento(p: string[]) {
  const [base, sticker, acc] = p
  const g = new THREE.Group()
  g.add(tray(22, 3.6, 16, 0.4, base, {}, 0.8))
  g.add(rbox(0.4, 3, 15, base, { x: 3, y: 0.4 }, 0.1))
  g.add(noOutlineDeep(rbox(11.6, 2.6, 14.6, RICE, { x: -2.7, y: 0.4 }, 1)))
  g.add(ball(0.9, '#c8303f', { x: -2.7, y: 3, z: 0 }))
  for (const [x, z] of [
    [5.5, -4],
    [8, -1],
    [5.8, 2],
    [8.4, 4.5],
  ])
    g.add(ball(1.8, '#b86a2a', { x, y: 2.6, z }, [1.1, 0.8, 1]))
  g.add(noOutlineDeep(ball(1.4, acc, { x: -6, y: 3, z: 4.5 }, [1.4, 0.3, 1])))
  // 透明盖（倒扣的浅盒）+ 价签
  g.add(glassGhost(tray(22.4, 3.2, 16.4, 0.3, GLASS, { y: 6.8, rx: PI }, 0.8), GLASS, 0.3))
  g.add(noOutlineDeep(rbox(6, 0.2, 3.5, sticker, { x: 5, y: 6.85, z: 4 }, 0.1)))
  return g
}

/** 三角形挤出体（三明治片 / 包装盒）：直角在 (-a, 0)，底宽 2a、高 b、厚 depth，z 从 z0 起 */
function triPrism(a: number, b: number, depth: number, color: string, z0: number, bevel = 0) {
  const s = new THREE.Shape()
  s.moveTo(-a, 0)
  s.lineTo(a, 0)
  s.lineTo(-a, b)
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, bevel ? { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 } : { depth, bevelEnabled: false })
  const m = new THREE.Mesh(geo, toon(color))
  m.position.z = z0
  m.castShadow = true
  return m
}

/** 便利店三明治（三角包装，两片） */
function sandwichPack(p: string[]) {
  const [film, label, filling] = p
  const g = new THREE.Group()
  for (const dz of [-2.2, 2.2]) {
    const h = new THREE.Group()
    h.add(triPrism(6.3, 10.6, 0.8, BREAD, -1.5, 0.2))
    h.add(triPrism(6.1, 10.2, 0.8, filling, -0.5))
    h.add(noOutlineDeep(triPrism(6.2, 10.3, 0.3, '#7cc46a', 0.3)))
    h.add(triPrism(6.3, 10.6, 0.8, BREAD, 0.7, 0.2))
    h.position.z = dz
    g.add(h)
  }
  g.add(glassGhost(triPrism(7.2, 12, 8.4, film, -4.2), film, 0.3))
  g.add(noOutlineDeep(rbox(6, 3, 0.2, label, { x: -3, y: 2, z: 4.3 }, 0.3)))
  return g
}

/** 纳豆三连盒 */
function natto(p: string[]) {
  const [box, label, tape] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    g.add(rbox(9.6, 3.5, 7.6, box, { y: i * 3.55 }, 0.6))
    g.add(noOutlineDeep(rbox(9.7, 0.3, 7.7, shade(box, -0.08), { y: i * 3.55 + 2.2 }, 0.1)))
  }
  g.add(noOutlineDeep(rbox(6, 0.2, 4.5, label, { y: 10.66 }, 0.3)))
  g.add(rbox(2.4, 10.8, 7.8, tape, { y: -0.05 }, 0.2))
  return g
}

/** 盒装豆腐（覆膜） */
function tofuPack(p: string[]) {
  const [trayC, label, acc] = p
  const g = new THREE.Group()
  g.add(tray(11.6, 4.2, 8.6, 0.3, trayC, {}, 0.5))
  g.add(noOutlineDeep(rbox(10.6, 3.6, 7.6, TOFU, { y: 0.3 }, 0.4)))
  g.add(glassGhost(rbox(11.8, 0.2, 8.8, '#ffffff', { y: 4.2 }, 0.05), '#ffffff', 0.4))
  g.add(noOutlineDeep(rbox(7, 0.15, 4, label, { y: 4.4 }, 0.2)))
  g.add(noOutlineDeep(ball(1, acc, { x: -2.2, y: 4.55, z: 0 }, [1, 0.1, 1])))
  return g
}

/** 杯面整箱（12 杯，打开） */
function noodleCase(p: string[]) {
  const [card, lidC, band] = p
  const g = new THREE.Group()
  g.add(tray(40, 11, 30, 0.5, card, {}, 0.2))
  g.add(noOutlineDeep(rbox(16, 5, 0.3, lidC, { y: 3, z: 15.05 }, 0.5)))
  for (const s of [-1, 1]) {
    const f = rbox(40, 0.4, 9, card, {}, 0.1)
    f.position.set(0, 11 + Math.sin(0.9) * 4.5, s * (15 + Math.cos(0.9) * 4.5))
    f.rotation.x = -s * 0.9
    g.add(f)
  }
  for (let i = 0; i < 12; i++) {
    const x = -14.4 + (i % 4) * 9.6
    const z = -9.6 + Math.floor(i / 4) * 9.6
    g.add(cup(4.6, 3.5, 10.5, 0.3, C.white, { x, y: 0.5, z }))
    g.add(noOutlineDeep(cup(4.62, 4.1, 3.4, 0.05, band, { x, y: 5.6, z })))
    g.add(cyl(4.7, 4.7, 0.3, lidC, { x, y: 11, z }, 24))
  }
  return g
}

// ---------- 零食 / 甜点 ----------

/** 糖果罐（玻璃罐装彩色糖球） */
function candyJar(p: string[]) {
  const [lid, a, b] = p
  const g = new THREE.Group()
  g.add(glassGhost(latheAt([[0, 0], [5.8, 0], [6.2, 1], [6.4, 10], [5.2, 13], [4.6, 14], [0, 14]], GLASS), GLASS, 0.3))
  const cols = [a, b, '#ffd84d', '#7ed37a', '#ff8a5c', C.white]
  const r = rng(21)
  for (let i = 0; i < 26; i++) {
    const layer = Math.floor(i / 7)
    const ang = r() * PI * 2
    const d = r() * 4
    g.add(ball(1.1, cols[i % cols.length], { x: Math.cos(ang) * d, y: 1.4 + layer * 1.9 + r() * 0.4, z: Math.sin(ang) * d }))
  }
  g.add(puck(5, 1.6, lid, { y: 14 }))
  g.add(ball(1.2, lid, { y: 16.2 }))
  return g
}

/** 曲奇铁盒：open 盖子立在后面 / closed 盖着 */
function cookieTin(p: string[], open: boolean) {
  const [tin, band, acc] = p
  const g = new THREE.Group()
  g.add(cup(10, 10, 6.5, 0.3, tin))
  g.add(noOutlineDeep(cup(10.03, 10.03, 1.2, 0.05, band, { y: 2.6 })))
  if (!open) {
    g.add(puck(10.3, 2, tin, { y: 5.6 }))
    g.add(noOutlineDeep(cyl(6, 6, 0.2, band, { y: 7.6 }, 28)))
    g.add(noOutlineDeep(cyl(3, 3, 0.25, acc, { y: 7.6 }, 20)))
    return g
  }
  const pos: [number, number][] = [[0, 0], ...Array.from({ length: 6 }, (_, i): [number, number] => [Math.cos((i / 6) * PI * 2) * 5.6, Math.sin((i / 6) * PI * 2) * 5.6])]
  pos.forEach(([x, z], i) => {
    g.add(cup(2.5, 2.1, 1.8, 0.1, '#f4ece0', { x, y: 0.3, z }))
    g.add(puck(2.1, 1.2, i % 3 === 0 ? CHOCO : i % 3 === 1 ? '#e8b468' : '#d99a55', { x, y: 1.4, z }))
  })
  const l = G(puck(10.3, 2, tin), noOutlineDeep(cyl(6, 6, 0.2, band, { y: 2 }, 28)))
  l.rotation.x = PI / 2 - 0.15
  l.position.set(0, 10.3, -11.4)
  g.add(l)
  return g
}

/** 巧克力（三板叠放 + 一板拆开） */
function chocolate(p: string[]) {
  const [a, b, foil] = p
  const g = new THREE.Group()
  const cols = [a, b, a]
  for (let i = 0; i < 3; i++) {
    g.add(rbox(16, 1, 8, cols[i], { y: i * 1.02, ry: (i - 1) * 0.08 }, 0.3))
    g.add(noOutlineDeep(rbox(5, 0.1, 8.1, shade(cols[i], 0.25), { y: i * 1.02 + 0.3, ry: (i - 1) * 0.08 }, 0.02)))
  }
  g.add(rbox(16, 0.3, 8, foil, { x: 2, z: 10, ry: -0.1 }, 0.1))
  const bar = new THREE.Group()
  for (let i = 0; i < 5; i++) for (let k = 0; k < 2; k++) bar.add(rbox(2.6, 0.8, 3.4, CHOCO, { x: -5.6 + i * 2.8, z: -1.8 + k * 3.6 }, 0.3))
  bar.position.set(1, 0.3, 10)
  bar.rotation.y = -0.1
  g.add(bar)
  return g
}

/** 薯片：bag 大袋（立放） / tube 筒装；每组配色是一种口味 */
function chips(p: string[], kind: 'bag' | 'tube') {
  const [body, band, acc] = p
  const g = new THREE.Group()
  if (kind === 'tube') {
    g.add(cyl(3.8, 3.8, 23, body, {}, 24))
    g.add(noOutlineDeep(cyl(3.83, 3.83, 7, band, { y: 8 }, 24)))
    g.add(noOutlineDeep(ball(1.8, acc, { y: 11.5, z: 3.7 }, [1, 1, 0.12])))
    g.add(puck(4, 1.4, '#f4f4f4', { y: 22.4 }))
    return g
  }
  g.add(rbox(18, 23, 5.4, body, { y: 1.2 }, 2.4))
  for (const y of [0.2, 23.6]) g.add(rbox(17.6, 1.6, 1.2, shade(body, -0.1), { y }, 0.3))
  g.add(noOutlineDeep(rbox(14, 5, 0.2, band, { y: 15, z: 2.72 }, 1)))
  for (let i = 0; i < 3; i++) g.add(noOutlineDeep(ball(2, acc, { x: -4 + i * 4, y: 8 + (i % 2), z: 2.6 }, [1, 0.8, 0.12])))
  return g
}

/** 冰淇淋杯两个（一个开着插木勺） */
function iceCream(p: string[]) {
  const [cupC, ice, lid] = p
  const g = new THREE.Group()
  g.add(cup(4.2, 3.4, 5, 0.25, cupC, { x: -5 }))
  g.add(noOutlineDeep(cyl(3.9, 3.9, 0.3, ice, { x: -5, y: 4.4 }, 24)))
  g.add(dome(3.4, 1.6, ice, { x: -5, y: 4.6 }))
  g.add(PG(rbox(1.2, 0.3, 6, C.woodL, {}, 0.15), -4, 6.4, 1.5, 0.7, 0.3))
  g.add(cup(4.2, 3.4, 5, 0.25, cupC, { x: 5 }))
  g.add(puck(4.4, 1, lid, { x: 5, y: 4.7 }))
  return g
}

/** 便利店布丁三连杯 */
function pudding3(p: string[]) {
  const [cupC, lid, caramel] = p
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 7.4
    g.add(glassGhost(cup(3.6, 2.6, 6.4, 0.25, cupC, { x }), cupC, 0.45))
    g.add(noOutlineDeep(cyl(3.3, 2.4, 5.4, '#f6d675', { x, y: 0.3 }, 20)))
    g.add(noOutlineDeep(cyl(2.45, 2.4, 0.8, caramel, { x, y: 0.3 }, 20)))
  }
  g.add(rbox(22.4, 0.3, 7.6, lid, { y: 6.4 }, 0.1))
  return g
}

/** 团子三串（长盘上） */
function dango(p: string[]) {
  const [plateC, , acc] = p
  const g = new THREE.Group()
  g.add(rbox(20, 1, 10, plateC, {}, 0.4))
  const sets: [number, string[]][] = [
    [-3, ['#ffb6c8', '#fffaf0', '#9ccf7a']],
    [0, ['#c98a3c', '#c98a3c', '#c98a3c']],
    [3, ['#8a4a5a', '#8a4a5a', '#8a4a5a']],
  ]
  for (const [z, cs] of sets) {
    g.add(hcyl(0.2, 0.2, 17, C.woodL, 0, 2.4, z, 'x', 6))
    cs.forEach((c, i) => g.add(ball(1.4, c, { x: -3.2 + i * 2.8, y: 2.4, z })))
  }
  g.add(noOutlineDeep(ball(0.6, acc, { x: 7, y: 1.3, z: 3.5 }, [1, 0.3, 1])))
  return g
}

/** 铜锣烧两个（一平放、一斜靠） */
function dorayaki(p: string[]) {
  const [plateC] = p
  const g = new THREE.Group()
  g.add(dish(9, 1.4, plateC))
  const one = (x: number, y: number, z: number, rz: number) => {
    const d = new THREE.Group()
    d.add(puck(4.2, 1.6, '#b8742a', { y: 0 }))
    d.add(noOutlineDeep(puck(3.8, 0.8, '#5a2e2a', { y: 1.4 })))
    d.add(puck(4.2, 1.6, '#b8742a', { y: 2 }))
    d.position.set(x, y, z)
    d.rotation.z = rz
    g.add(d)
  }
  one(-1.5, DISH_IN, 0.5, 0)
  one(2.6, DISH_IN + 1.2, -1.2, 0.35)
  return g
}

/** 大福三个（怀纸 + 盘） */
function daifuku(p: string[]) {
  const [plateC, paper] = p
  const g = new THREE.Group()
  g.add(rbox(18, 1, 12, plateC, {}, 0.5))
  g.add(noOutlineDeep(rbox(14, 0.1, 9, paper, { y: 1, ry: 0.15 }, 0.02)))
  for (const [x, c, ex] of [
    [-4.6, '#fffaf0', null],
    [0, '#ffd6e0', '#e8495a'],
    [4.6, '#c8dfa8', null],
  ] as const) {
    g.add(ball(2.6, c, { x, y: 1.1 + 1.9, z: 0 }, [1, 0.72, 1]))
    if (ex) g.add(noOutlineDeep(ball(0.9, ex, { x, y: 1.1 + 3.6, z: 0.3 }, [1, 0.6, 1])))
  }
  return g
}

/** 水果篮（藤编椭圆篮：苹果、橘子、香蕉、葡萄） */
function fruitBasket(p: string[]) {
  const [basket, rim] = p
  const g = new THREE.Group()
  const b = cup(14, 11, 9, 0.8, basket)
  b.scale.z = 0.7
  g.add(b)
  const t = torus(13.8, 0.6, rim, { y: 9, rx: PI / 2 })
  t.scale.y = 0.7
  g.add(t)
  g.add(cappedTube(arc([0, 9, 0], 12.5, 0, PI, 16, 'xy'), 0.6, rim, { ...TUBE, seg: 32 }))
  g.add(ball(3.6, '#e0453a', { x: -6, y: 8, z: -1.5 }, [1, 0.92, 1]))
  g.add(ball(3.2, '#ff9a2a', { x: 0, y: 8.5, z: 2.5 }, [1, 0.9, 1]))
  g.add(ball(3.2, '#ff9a2a', { x: -1.5, y: 8.6, z: -3.5 }, [1, 0.9, 1]))
  for (let i = 0; i < 3; i++) g.add(cappedTube(arc([5, 4, 0], 6.5, PI * 0.55, PI * 0.95, 6, 'xy').map(([x, y]): V3 => [x + 3, y + 3.5, -2 + i * 2]), 1.3, '#ffd84d', { ...TUBE, seg: 12 }))
  for (let i = 0; i < 9; i++) g.add(ball(1.1, '#5a3a7a', { x: 6 + (i % 3) * 1.6 - 1, y: 9.5 - Math.floor(i / 3) * 1.3, z: 3 + (i % 2) }))
  return g
}

/** 买菜环保袋（装着葱、胡萝卜、卷心菜） */
function vegBag(p: string[]) {
  const [bag, handle, print] = p
  const g = new THREE.Group()
  g.add(tray(34, 28, 14, 0.4, bag, {}, 1.5))
  g.add(noOutlineDeep(rbox(10, 10, 0.2, print, { y: 10, z: 7.1 }, 2)))
  for (const s of [-1, 1]) g.add(cappedTube([[-7, 27.5, s * 6.8], [-6, 38, s * 6], [6, 38, s * 6], [7, 27.5, s * 6.8]], 0.8, handle, { ...TUBE, seg: 24 }))
  g.add(ball(7, '#a6d47a', { x: 7, y: 24, z: 0 }, [1, 0.9, 0.85]))
  g.add(ball(6.5, '#cbe8a0', { x: 7, y: 24.8, z: 0.4 }, [1, 0.85, 0.8]))
  for (let i = 0; i < 3; i++) {
    g.add(rod3([-9 + i * 1.8, 6, -2 + i], [-11 + i * 1.8, 34, -3 + i], 1, '#f4f4e6', 8))
    g.add(rod3([-11 + i * 1.8, 34, -3 + i], [-12.5 + i * 2.2, 50, -3.5 + i], 0.85, NEGI, 8))
  }
  for (let i = 0; i < 2; i++) {
    const c = cyl(1.4, 0.3, 16, '#f08a3c', {}, 10)
    c.position.set(-1 + i * 2.8, 18, 3)
    c.rotation.z = PI + 0.15 - i * 0.3
    g.add(c)
  }
  return g
}

// ---------- 配色 ----------

// 罐装饮料：[罐身, 标签色带, 点缀]，每组是一种口味（不写品牌）
const CAN_FLAVOR_PALS: Pal3[] = [
  ['retro', '#d6343a', '#f4f4f4', '#d6343a'], // 可乐
  ['japanese', '#3f8a4a', '#e9e2d0', '#3f8a4a'], // 绿茶
  ['industrial', '#5a3a2a', '#d9b98c', '#3a2a22'], // 咖啡
  ['modern', '#dfe6ec', '#4a9ad8', '#c3c7cc'], // 碳酸水
  ['cute', '#1f2a3a', '#a6f03c', '#a6f03c'], // 能量饮料
]
const GLASS_BOTTLE_PALS: Pal3[] = [
  ['retro', R.cream, R.red, '#f5e6a8'],
  ['modern', M.white, M.char, '#f2a03c'],
  ['nordic', N.linen, N.sage, '#f5d58a'],
  ['cute', C.sakura, C.pink, '#ff9db0'],
  ['japanese', J.washi, J.ai, '#e8c24a'],
]
// 宝特瓶：[饮料色, 标签色带, 瓶盖]
const PET_FLAVOR_PALS: Pal3[] = [
  ['japanese', '#b7c96a', '#3f8a4a', '#3f8a4a'], // 绿茶
  ['modern', '#e8f4fb', '#3a7ac8', '#3a7ac8'], // 运动饮料
  ['retro', '#f2a03c', R.orange, R.red], // 橙汁
  ['cute', '#ffc8d6', C.pink, C.white], // 桃子水
  ['nordic', '#d8a35c', N.oak, N.white], // 麦茶
]
// 矿泉水：[标签色带, 瓶盖, —]
const WATERB_PALS: Pal3[] = [
  ['modern', '#3a7ac8', '#3a7ac8', '#3a7ac8'],
  ['nordic', N.blue, N.white, N.white],
  ['japanese', J.ai, J.washi, J.washi],
  ['cute', C.sky, C.pink, C.pink],
]
const WATER_CASE24_PALS: Pal3[] = [
  ['modern', '#3a7ac8', '#e8f4fb', CARD],
  ['nordic', N.blue, N.white, CARD],
  ['japanese', J.ai, J.washi, CARD],
  ['cute', C.sky, C.pink, CARD],
]
const TETRA_PALS: Pal3[] = [
  ['nordic', N.white, N.sage, '#d9b98c'],
  ['modern', M.white, M.char, '#4a9ad8'],
  ['retro', R.cream, R.orange, R.red],
  ['cute', C.white, C.pink, C.lemon],
]
const YOGURT_PALS: Pal3[] = [
  ['modern', M.white, '#4a7fc0', '#4a7fc0'],
  ['cute', C.white, C.pink, C.pink],
  ['nordic', N.white, N.sage, N.linen],
  ['retro', R.cream, R.red, R.mustard],
]
const FRIDGE_POT_PALS: Pal3[] = [
  ['modern', M.white, '#d8a35c', M.char],
  ['nordic', N.sage, WATER, N.white],
  ['cute', C.pink, '#d8a35c', C.white],
  ['japanese', J.ai, TEA, J.washi],
]
const SERVER_PALS: Pal3[] = [
  ['modern', M.white, M.char, M.light],
  ['industrial', M.black, I.iron, I.steel],
  ['nordic', N.white, N.oak, N.linen],
  ['cute', C.white, C.sky, C.mint],
  ['retro', R.cream, R.teal, R.cream],
]
const PIZZA_PALS: Pal3[] = [
  ['retro', '#f4ecd8', R.red, R.mustard],
  ['industrial', KRAFT, I.iron, I.rust],
  ['modern', M.white, M.black, '#d8442e'],
  ['cute', C.white, C.pink, C.lemon],
]
const TAKEOUT_PALS: Pal3[] = [
  ['retro', M.white, R.red, STEEL],
  ['modern', M.white, M.black, STEEL],
  ['industrial', KRAFT, I.iron, STEEL],
  ['cute', C.white, C.pink, STEEL],
]
const TAKEOUT_BENTO_PALS: Pal3[] = [
  ['modern', M.black, '#f2c94c', '#4f9e3b'],
  ['japanese', J.shu, J.washi, '#4f9e3b'],
  ['industrial', I.iron, '#e8dcc4', '#4f9e3b'],
  ['cute', C.pink, C.white, '#4f9e3b'],
]
const SANDWICH_PALS: Pal3[] = [
  ['modern', '#eaf4fb', '#3a7ac8', EGG_Y],
  ['retro', '#eaf4fb', R.red, '#f4b8c0'],
  ['cute', '#fff0f4', C.pink, '#ffd75e'],
  ['nordic', '#f4f6f0', N.sage, '#e8b468'],
]
const NATTO_PALS: Pal3[] = [
  ['japanese', M.white, J.shu, J.ai],
  ['retro', '#f4ecd8', R.red, R.mustard],
  ['modern', M.white, M.black, '#3a7ac8'],
]
const TOFU_PALS: Pal3[] = [
  ['japanese', M.white, J.ai, J.shu],
  ['modern', M.white, M.char, '#3a7ac8'],
  ['nordic', '#eef1ea', N.sage, N.oak],
]
const NOODLE_CASE_PALS: Pal3[] = [
  ['retro', CARD, R.red, R.red],
  ['modern', CARD, M.black, M.char],
  ['cute', CARD, C.pink, C.pink],
]
const CANDY_PALS: Pal3[] = [
  ['cute', C.pink, '#ff5a8a', '#6ac4f0'],
  ['retro', R.red, R.orange, R.teal],
  ['nordic', N.oak, '#f2a0a0', '#9fc8e8'],
  ['modern', M.silver, '#e8495a', '#4a9ad8'],
]
const TIN_PALS: Pal3[] = [
  ['retro', '#2f5a8a', R.cream, R.red],
  ['nordic', N.blue, N.white, N.mustard],
  ['cute', C.pink, C.white, C.mint],
  ['industrial', I.iron, I.rust, '#d4a64a'],
]
const CHOCO_PALS: Pal3[] = [
  ['retro', R.red, R.caramel, '#d4d4d4'],
  ['modern', M.black, M.white, '#d4d4d4'],
  ['cute', C.pink, C.lilac, '#e8d4a0'],
  ['nordic', N.blue, N.mustard, '#d4d4d4'],
]
// 薯片：每组一种口味
const CHIPS_PALS: Pal3[] = [
  ['retro', '#f2c94c', R.red, '#e8b468'], // 原味
  ['cute', '#9fd36a', C.white, '#e8b468'], // 海苔盐
  ['modern', '#3a5fb8', M.white, '#e8b468'], // 淡盐
  ['industrial', '#c8473a', I.iron, '#d99a55'], // 烧烤
  ['nordic', '#e8a640', N.white, '#e8b468'], // 黄油酱油
]
const ICE_PALS: Pal3[] = [
  ['retro', R.cream, '#fff6e0', R.red],
  ['cute', C.white, '#ffc8d6', C.pink],
  ['modern', M.white, '#a8683a', M.black],
  ['japanese', J.washi, '#b7c96a', J.ai],
]
const PUDDING_PALS: Pal3[] = [
  ['retro', '#fff8e0', R.red, '#8a4a1a'],
  ['cute', '#fff0f4', C.pink, '#8a4a1a'],
  ['modern', '#ffffff', M.char, '#6a3a1a'],
]
const WAGASHI_PALS: Pal3[] = [
  ['japanese', J.washi, J.washi, J.shu],
  ['japanese', J.sumi, '#f6e8d4', J.shu],
  ['nordic', N.white, N.linen, N.sage],
  ['modern', M.black, M.white, M.white],
  ['cute', C.sakura, C.white, C.pink],
]
const BASKET_PALS: Pal3[] = [
  ['nordic', '#d9c8a4', N.oak, N.oak],
  ['japanese', '#c9a568', '#a8813e', J.wood],
  ['industrial', '#8a6a4a', I.walnut, I.walnut],
  ['cute', '#f0d8b0', C.pink, C.pink],
]
const ECO_PALS: Pal3[] = [
  ['nordic', N.linen, N.oak, N.sage],
  ['modern', M.char, M.black, M.white],
  ['japanese', J.ai, J.sumi, J.washi],
  ['cute', C.sakura, C.pink, C.white],
  ['retro', R.mustard, R.caramel, R.teal],
]

export const KITCHEN_DRINKS_SNACKS: AssetDef[] = [
  // ---------- 罐装饮料 ----------
  def({ id: 'kf-can', name: '罐装饮料', sizeLabel: '单罐 350ml', category: 'tabletop', w: 6.6, d: 6.6, h: 12.4, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'single') }),
  def({ id: 'kf-can-short', name: '罐装饮料', sizeLabel: '咖啡短罐 190ml', category: 'tabletop', w: 5.3, d: 5.3, h: 10.6, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'short') }),
  def({ id: 'kf-can-slim', name: '罐装饮料', sizeLabel: '细长罐 250ml', category: 'tabletop', w: 5.3, d: 5.3, h: 13.6, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'slim') }),
  def({ id: 'kf-can-6', name: '罐装饮料', sizeLabel: '6 联包', category: 'tabletop', w: 20.4, d: 13.6, h: 12.4, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'six') }),
  def({ id: 'kf-can-case', name: '罐装饮料', sizeLabel: '24 罐整箱', form: 'boxed', category: 'tabletop', w: 41.6, d: 28.4, h: 12.8, pals: CAN_FLAVOR_PALS, build: (p) => cans(p, 'case') }),
  // ---------- 玻璃瓶 ----------
  def({ id: 'kf-bottle-soda', name: '玻璃瓶饮料', sizeLabel: '汽水瓶', category: 'tabletop', w: 5.8, d: 5.8, h: 19.3, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'soda') }),
  def({ id: 'kf-bottle-milk', name: '玻璃瓶饮料', sizeLabel: '牛奶瓶', category: 'tabletop', w: 6.4, d: 6.4, h: 12.9, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'milk') }),
  def({ id: 'kf-bottle-juice', name: '玻璃瓶饮料', sizeLabel: '果汁瓶', category: 'tabletop', w: 6.7, d: 6.7, h: 16.2, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'juice') }),
  def({ id: 'kf-bottle-beer', name: '玻璃瓶饮料', sizeLabel: '精酿啤酒', category: 'tabletop', w: 6.3, d: 6.3, h: 21.5, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'beer') }),
  def({ id: 'kf-bottle-sparkling', name: '玻璃瓶饮料', sizeLabel: '气泡水', category: 'tabletop', w: 7.9, d: 7.9, h: 28.6, pals: GLASS_BOTTLE_PALS, build: (p) => glassBottle(p, 'sparkling') }),
  // ---------- 宝特瓶 / 纸盒 / 酸奶 ----------
  def({ id: 'kf-pet-500', name: '宝特瓶饮料', sizeLabel: '500ml', category: 'tabletop', w: 6.7, d: 6.7, h: 21, pals: PET_FLAVOR_PALS, build: (p) => petBottle(p, false) }),
  def({ id: 'kf-pet-2l', name: '宝特瓶饮料', sizeLabel: '2L', category: 'tabletop', w: 9.7, d: 9.7, h: 33, pals: PET_FLAVOR_PALS, build: (p) => petBottle(p, true) }),
  def({ id: 'kf-tetra-1l', name: '纸盒饮料', sizeLabel: '豆乳 1L', category: 'tabletop', w: 7.6, d: 7.6, h: 20.7, pals: TETRA_PALS, build: (p) => tetra(p, 'soy1l') }),
  def({ id: 'kf-tetra-200', name: '纸盒饮料', sizeLabel: '豆乳 200ml', category: 'tabletop', w: 7.8, d: 4.6, h: 10.5, pals: TETRA_PALS, build: (p) => tetra(p, 'soy200') }),
  def({ id: 'kf-tetra-125', name: '纸盒饮料', sizeLabel: '果汁小盒（插吸管）', category: 'tabletop', w: 6.4, d: 4.2, h: 13.3, pals: TETRA_PALS, build: (p) => tetra(p, 'juice125') }),
  def({ id: 'kf-yogurt-tub', name: '酸奶', sizeLabel: '400g 大盒', category: 'tabletop', w: 11.6, d: 11.6, h: 9.6, pals: YOGURT_PALS, build: (p) => yogurt(p, 'tub') }),
  def({ id: 'kf-yogurt-4', name: '酸奶', sizeLabel: '四连杯', category: 'tabletop', w: 14.6, d: 14.6, h: 6.3, pals: YOGURT_PALS, build: (p) => yogurt(p, 'four') }),
  // ---------- 矿泉水 / 饮水 ----------
  def({ id: 'kf-water-500', name: '矿泉水', sizeLabel: '500ml', category: 'tabletop', w: 6.7, d: 6.7, h: 21, pals: WATERB_PALS, build: (p) => waterBottle(p, false) }),
  def({ id: 'kf-water-2l', name: '矿泉水', sizeLabel: '2L', category: 'tabletop', w: 9.7, d: 9.7, h: 33, pals: WATERB_PALS, build: (p) => waterBottle(p, true) }),
  def({ id: 'kf-water-case-24', name: '矿泉水整箱', sizeLabel: '500ml×24', form: 'boxed', w: 41.6, d: 28.4, h: 21.4, pals: WATER_CASE24_PALS, build: (p) => G(sealedCase(41, 21.4, 27.4, p[0], p[1])) }),
  def({ id: 'kf-fridge-pot', name: '冰箱冷水壶 2L', category: 'tabletop', w: 16, d: 12.1, h: 27.6, pals: FRIDGE_POT_PALS, build: fridgePot }),
  def({ id: 'kf-water-server-top', name: '饮水机（大桶）', sizeLabel: '上置水桶', category: 'appliance', prop: false, w: 30, d: 41, h: 139.5, pals: SERVER_PALS, build: (p) => waterServer(p, true) }),
  def({ id: 'kf-water-server-bottom', name: '饮水机（大桶）', sizeLabel: '下置水桶', category: 'appliance', prop: false, w: 30, d: 41, h: 112, pals: SERVER_PALS, build: (p) => waterServer(p, false) }),
  def({ id: 'kf-water-server-desk', name: '饮水机（大桶）', sizeLabel: '台式小型', category: 'appliance', w: 24, d: 35, h: 53.2, pals: SERVER_PALS, build: deskServer }),
  // ---------- 外卖 / 便利店 / 日配 ----------
  def({ id: 'kf-pizza-open', name: '披萨盒', form: 'open', category: 'tabletop', w: 33, d: 34.2, h: 33.4, pals: PIZZA_PALS, build: (p) => pizzaBox(p, true) }),
  def({ id: 'kf-pizza-closed', name: '披萨盒', form: 'closed', category: 'tabletop', w: 33, d: 33, h: 4.6, pals: PIZZA_PALS, build: (p) => pizzaBox(p, false) }),
  def({ id: 'kf-takeout-chinese', name: '外卖盒', sizeLabel: '中华餐盒', category: 'tabletop', w: 20, d: 15.7, h: 16.2, pals: TAKEOUT_PALS, build: chineseTakeout }),
  def({ id: 'kf-takeout-bento', name: '外卖盒', sizeLabel: '外卖便当', category: 'tabletop', w: 22.4, d: 17.4, h: 7, pals: TAKEOUT_BENTO_PALS, build: takeoutBento }),
  def({ id: 'kf-sandwich', name: '便利店三明治', category: 'tabletop', w: 14.4, d: 8.4, h: 12, pals: SANDWICH_PALS, build: sandwichPack }),
  def({ id: 'kf-natto', name: '纳豆三连盒', category: 'tabletop', w: 9.7, d: 7.8, h: 10.8, pals: NATTO_PALS, build: natto }),
  def({ id: 'kf-tofu', name: '盒装豆腐', category: 'tabletop', w: 11.8, d: 8.8, h: 4.6, pals: TOFU_PALS, build: tofuPack }),
  def({ id: 'kf-noodle-case', name: '杯面整箱', w: 40, d: 41.4, h: 18.1, pals: NOODLE_CASE_PALS, build: noodleCase }),
  // ---------- 零食 / 甜点 ----------
  def({ id: 'kf-candy-jar', name: '糖果罐', category: 'tabletop', w: 12.8, d: 12.8, h: 17.4, pals: CANDY_PALS, build: candyJar }),
  def({ id: 'kf-cookie-tin', name: '曲奇铁盒', form: 'closed', category: 'tabletop', w: 20.6, d: 20.6, h: 7.8, pals: TIN_PALS, build: (p) => cookieTin(p, false) }),
  def({ id: 'kf-cookie-tin-open', name: '曲奇铁盒', form: 'open', category: 'tabletop', w: 20.6, d: 22.8, h: 20.6, pals: TIN_PALS, build: (p) => cookieTin(p, true) }),
  def({ id: 'kf-chocolate', name: '巧克力', category: 'tabletop', w: 18.6, d: 19.4, h: 3, pals: CHOCO_PALS, build: chocolate }),
  def({ id: 'kf-chips-bag', name: '薯片', sizeLabel: '袋装', category: 'tabletop', w: 18, d: 5.4, h: 25.2, pals: CHIPS_PALS, build: (p) => chips(p, 'bag') }),
  def({ id: 'kf-chips-tube', name: '薯片', sizeLabel: '筒装', category: 'tabletop', w: 8, d: 8, h: 23.8, pals: CHIPS_PALS, build: (p) => chips(p, 'tube') }),
  def({ id: 'kf-ice-cream', name: '冰淇淋杯', category: 'tabletop', w: 18.4, d: 8.8, h: 8.5, pals: ICE_PALS, build: iceCream }),
  def({ id: 'kf-pudding-3', name: '布丁三连杯', category: 'tabletop', w: 22.4, d: 7.6, h: 6.7, pals: PUDDING_PALS, build: pudding3 }),
  def({ id: 'kf-dango', name: '日式点心', sizeLabel: '团子', category: 'tabletop', w: 20, d: 10, h: 3.8, pals: WAGASHI_PALS, build: dango }),
  def({ id: 'kf-dorayaki', name: '日式点心', sizeLabel: '铜锣烧', category: 'tabletop', w: 18, d: 18, h: 6.5, pals: WAGASHI_PALS, build: dorayaki }),
  def({ id: 'kf-daifuku', name: '日式点心', sizeLabel: '大福', category: 'tabletop', w: 18, d: 12, h: 5, pals: WAGASHI_PALS, build: daifuku }),
  def({ id: 'kf-fruit-basket', name: '水果篮', category: 'tabletop', w: 29, d: 20, h: 22, pals: BASKET_PALS, build: fruitBasket }),
  def({ id: 'kf-veg-bag', name: '买菜环保袋', w: 34, d: 16.2, h: 50, pals: ECO_PALS, build: vegBag }),
]
