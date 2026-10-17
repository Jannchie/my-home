// 兴趣与性格素材包：乐器 + 体现「住在这里的人」爱好的摆件（漫画、宅物、运动、棋牌、手作、学习、收藏、生活气息）。
// 约定见 kit.ts 开头。全部 id 以 int- 开头，避免和其他素材包撞名。
// 人偶 / 手办一律不加脸；画面（乐谱、星图、明信片、封面）都用 paintPanel 画在贴图上。

import * as THREE from 'three'
import { ball, cup, cyl, puck, rbox, shade, torus, tray } from '../toon'
import { C, paintPanel, rng, type AssetDef } from '../kit'
import { G, P, PI, cylX, cylZ, fitBuild, fitGroup, noOutline, type V2 } from '../geo'
import { I, J, M, N, PROP, R, define, type PalFlat } from '../packkit'
import { BRASS, CARD, DARK, GOLD, IVORY, METAL, PAPER, paintTop, type Draw } from './interests/common'
import { E_GUITAR_MOUNT, accordion, celloStand, clarinetStand, digitalPiano, djDeck, drumKit, eDrum, eGuitarStand, eGuitarWall, fluteCase, grandPiano, guitarAmp, harmonica, harp, koto, metronome, musicStand, saxStand, shakuhachi, shamisen, smallInstruments, synth, taiko, trumpet, uprightPiano, violinCase, violinStand } from './interests/music'
import { MEDAL_MOUNT, MJ_TH, MJ_TW, POSTCARD_MOUNT, RAINCOAT_MOUNT, ROD_RACK_MOUNT, STAR_MOUNT, UNO_COLS, acrylicStand, backgammon, badminton, baseball, basketball, bgBoxSingle, bgHex, bgLoop, bgMystery, bgShelfRow, bgTrain, bikeHelmet, boardGames, boxingGloves, burrPuzzle, calligraphy, card, cardGame, cardStack, cartons, catToys, chemSet, chess, chessOpening, chessPiece, chineseCheckers, coffeeCanisters, decal, diceGame, die, drawGrid, drawPlayCard, drawTiles, embroidery, energyCans, figureCase, fishCooler, fishCreel, fishingStool, goBoard, golfBag, hanafuda, itaBag, jenga, jigsaw, karuta, knittingBasket, landingNet, mahjong, mangaRow, mangaStack, mapScroll, medalRack, microscope, mineralBox, mjRing, mjWall, penlights, poker, postcardWall, posterTubes, potteryWheel, raincoat, recordRow, refBooks, reversi, rodBag, rodRack, rodStanding, sewingMachine, shogi, skateboardFlat, skateboardStand, snackPile, snowboard, soccerBall, starChart, succulentSet, suitcaseOpen, suitcaseStand, surfboard, tackleBox, tangram, tennis, trophyColumn, trophyCup, trophyStar, unoCards, vinylRack, watercolor, xiangqi } from './interests/props'

// =====================================================================
// 素材表
// =====================================================================

const PIANO_PALS: PalFlat[] = [
  ['modern', '#26262a', '#fbfaf6', GOLD],
  ['nordic', N.white, '#fbfaf6', N.oak],
  ['retro', R.caramel, IVORY, BRASS],
  ['industrial', I.walnut, IVORY, I.steel],
  ['cute', C.sakura, '#fffaf4', C.lemon],
]

const MUSIC: AssetDef[] = [
  define('int-piano-upright', '立式钢琴', 'music', [150, 62, 125], PIANO_PALS, uprightPiano, { surface: 125, surfaceShape: [[[-75, -31], [75, -31], [75, 4.5], [-75, 4.5]]] }),
  define('int-piano-grand', '三角钢琴', 'music', [151.5, 164.5, 159], PIANO_PALS.slice(0, 4), fitBuild(grandPiano)),
  define('int-digital-piano', '电钢琴（带琴凳）', 'music', [136, 80, 95], [
    ['modern', '#2f3035', '#fbfaf6', '#3d3f44'],
    ['nordic', N.white, '#fbfaf6', N.sage],
    ['nordic', N.oak, '#fbfaf6', N.linen],
    ['cute', C.white, '#fffaf4', C.pink],
    ['industrial', I.walnut, IVORY, I.leather],
  ], digitalPiano),
  define('int-drum-kit', '架子鼓', 'music', [155, 122.5, 116.5], [
    ['retro', R.red, IVORY, METAL],
    ['modern', '#26262a', '#f4f4f2', METAL],
    ['cute', C.sky, '#fffaf4', METAL],
    ['retro', R.teal, IVORY, METAL],
    ['industrial', I.walnut, IVORY, I.steel],
  ], fitBuild(drumKit)),
  define('int-e-drum', '电子鼓', 'music', [118, 97, 116.5], [
    ['modern', DARK, '#55575d', '#5ad1ff'],
    ['modern', M.silver, '#55575d', '#ff6a8a'],
    ['cute', C.white, '#6a6d74', C.pink],
    ['industrial', I.iron, '#4a4a4c', I.rust],
  ], fitBuild(eDrum)),
  define('int-violin-case', '小提琴', 'music', [78, 33.5, 31.5], [
    ['modern', '#2f3035', '#8a3a4a', '#b0652e'],
    ['retro', R.caramel, R.teal, '#b0652e'],
    ['cute', C.sky, C.sakura, '#c07a3e'],
    ['nordic', N.white, N.blue, '#c07a3e'],
  ], fitBuild(violinCase), { ...PROP, form: 'open' }),
  define('int-violin-stand', '小提琴', 'music', [23, 23, 66], [
    ['retro', DARK, '#b0652e', '#2a2220'],
    ['nordic', N.oak, '#c07a3e', '#2a2220'],
    ['modern', M.silver, '#9a5428', '#1f1f22'],
    ['japanese', J.dark, '#b0652e', J.sumi],
  ], fitBuild(violinStand), { ...PROP, form: 'standing' }),
  define('int-cello', '大提琴（支架）', 'music', [50, 34.5, 133.5], [
    ['retro', '#b0652e', DARK, '#2a2220'],
    ['nordic', '#c07a3e', N.oak, '#2a2220'],
    ['modern', '#9a5428', M.char, '#1f1f22'],
    ['japanese', '#a8602e', J.dark, J.sumi],
  ], fitBuild(celloStand)),
  define('int-e-bass', '电贝斯（支架）', 'music', [34.5, 46.5, 127], [
    ['modern', '#26262a', '#f4f4f2', '#d9b98c'],
    ['retro', R.orange, IVORY, '#d9b98c'],
    ['cute', C.mint, C.white, '#ead7b8'],
    ['industrial', '#3a5a3c', '#2b2b2b', I.walnut],
    ['retro', '#e0b07a', '#2b2b2b', '#d9b98c'],
  ], fitBuild(eGuitarStand(true))),
  define('int-e-guitar-stand', '电吉他', 'music', [33.5, 43.5, 109.5], [
    ['retro', R.red, C.white, '#d9b98c'],
    ['cute', C.pink, C.white, '#ead7b8'],
    ['modern', '#26262a', '#26262a', '#d9b98c'],
    ['retro', R.teal, IVORY, '#d9b98c'],
    ['nordic', N.blue, N.white, N.oakL],
  ], fitBuild(eGuitarStand(false)), { sizeLabel: '支架' }),
  define('int-e-guitar-wall', '电吉他', 'music', [32, 9, 100.5], [
    ['retro', R.red, C.white, '#d9b98c'],
    ['cute', C.pink, C.white, '#ead7b8'],
    ['modern', '#26262a', '#26262a', '#d9b98c'],
    ['retro', R.teal, IVORY, '#d9b98c'],
    ['nordic', N.blue, N.white, N.oakL],
  ], eGuitarWall, { sizeLabel: '壁挂', mount: E_GUITAR_MOUNT }),
  define('int-guitar-amp', '吉他音箱', 'music', [50, 27.5, 43.5], [
    ['modern', '#26262a', '#4a4b50', '#c3c7cc'],
    ['retro', R.cream, '#a8683a', R.caramel],
    ['industrial', I.iron, '#6b5a48', I.steel],
    ['cute', C.mint, C.cream, C.white],
  ], fitBuild(guitarAmp)),
  define('int-sax-stand', '萨克斯（支架）', 'music', [34.5, 23.5, 78.5], [
    ['retro', BRASS, DARK, '#f4ead2'],
    ['modern', '#c3c7cc', DARK, '#f4f4f2'],
    ['industrial', '#8a6a3a', I.iron, '#e8dcc0'],
    ['cute', '#f0c868', C.white, '#fffaf4'],
  ], saxStand),
  define('int-trumpet', '小号', 'music', [50, 12, 15.2], [
    ['retro', BRASS, '#f4ead2', METAL],
    ['modern', '#c3c7cc', '#f4f4f2', '#9a9da3'],
    ['cute', '#f0c868', C.pink, METAL],
  ], trumpet, PROP),
  define('int-flute', '长笛（琴盒）', 'music', [40, 12, 4.5], [
    ['modern', '#2f3035', '#3d5a80', '#dfe3e8'],
    ['retro', R.caramel, R.red, '#e3d6b8'],
    ['cute', C.white, C.sakura, '#dfe3e8'],
  ], fluteCase, PROP),
  define('int-clarinet', '单簧管（支架）', 'music', [10.5, 11.9, 67], [
    ['modern', '#2a2a2e', '#d5d9de', DARK],
    ['retro', '#3a2a22', BRASS, '#3a2a22'],
    ['nordic', '#2a2a2e', '#d5d9de', N.oak],
  ], fitBuild(clarinetStand), PROP),
  define('int-harmonica', '口琴', 'music', [12.8, 7.9, 2.4], [
    ['modern', '#d5d9de', '#3d3f44', '#26262a'],
    ['retro', '#d5d9de', R.caramel, R.red],
    ['cute', '#d5d9de', C.sky, C.pink],
  ], harmonica, PROP),
  define('int-accordion', '手风琴', 'music', [44, 21, 44], [
    ['retro', R.red, IVORY, METAL],
    ['retro', R.teal, R.cream, METAL],
    ['modern', '#26262a', '#f4f4f2', '#c3c7cc'],
    ['cute', C.pink, C.white, C.lemon],
  ], fitBuild(accordion), PROP),
  define('int-harp', '竖琴', 'music', [68, 30, 162], [
    ['nordic', N.oak, '#f2ead8', GOLD],
    ['retro', R.caramel, '#f2ead8', BRASS],
    ['modern', '#3d3f44', '#e8e8e8', '#c3c7cc'],
    ['cute', C.woodL, '#fff6e8', C.pink],
  ], harp),
  define('int-shamisen', '三味线', 'music', [26, 24.5, 108], [
    ['japanese', J.dark, J.washi, J.wood],
    ['japanese', '#5a2e22', '#fff8ec', J.sumi],
    ['retro', R.caramel, R.cream, R.red],
  ], shamisen),
  define('int-koto', '筝', 'music', [180, 30, 16.2], [
    ['japanese', J.wood, IVORY, J.dark],
    ['japanese', J.hinoki, '#fff8ec', J.sumi],
    ['retro', R.caramel, R.cream, '#5a3a24'],
  ], koto),
  define('int-taiko', '太鼓', 'music', [58, 45, 79.5], [
    ['japanese', '#7a3a24', '#f2e2c0', J.dark],
    ['japanese', J.wood, IVORY, J.sumi],
    ['retro', R.red, R.cream, R.caramel],
  ], taiko),
  define('int-shakuhachi', '尺八', 'music', [13, 13, 55.5], [
    ['japanese', '#d8b46a', '#a8803e', J.sumi],
    ['japanese', '#c8a050', '#8a6a34', J.dark],
    ['nordic', '#e2c486', '#b89058', N.white],
  ], shakuhachi, PROP),
  define('int-small-instruments', '小乐器组（铃鼓·沙锤·卡祖笛）', 'music', [34.5, 19.9, 6.9], [
    ['cute', C.pink, C.lemon, C.sky],
    ['retro', R.red, R.mustard, R.teal],
    ['nordic', N.oak, N.sage, N.mustard],
  ], smallInstruments, PROP),
  define('int-synth', '合成器键盘', 'music', [100, 32, 9], [
    ['modern', '#2f3035', '#fbfaf6', '#ff7a4d'],
    ['retro', R.cream, IVORY, R.orange],
    ['nordic', N.white, '#fbfaf6', GOLD],
    ['cute', C.lilac, '#fffaf4', C.pink],
  ], synth(36, 100, 32, false), { ...PROP, sizeLabel: '61 键合成器' }),
  define('int-midi-keyboard', '合成器键盘', 'music', [50, 24, 8.7], [
    ['modern', '#2f3035', '#fbfaf6', '#ff7a4d'],
    ['retro', R.cream, IVORY, R.orange],
    ['cute', C.sky, '#fffaf4', C.pink],
    ['modern', M.white, '#fbfaf6', '#5ad1ff'],
  ], synth(15, 50, 24, true), { ...PROP, sizeLabel: '25 键 MIDI' }),
  define('int-dj-deck', 'DJ 台', 'music', [70, 38, 7], [
    ['modern', '#26262a', '#4a4b50', '#5ad1ff'],
    ['modern', M.silver, '#3d3f44', '#ff6a8a'],
    ['cute', C.white, C.lilac, C.pink],
    ['industrial', I.iron, I.steel, I.rust],
  ], djDeck, PROP),
  define('int-music-stand', '谱架', 'music', [50, 36, 128], [
    ['modern', DARK, PAPER, '#2a2a2a'],
    ['nordic', N.oak, PAPER, '#3a3a3a'],
    ['cute', C.pink, '#fffaf4', '#5a4646'],
    ['industrial', I.iron, '#f4ecd8', '#3a2a22'],
  ], musicStand),
  define('int-metronome', '节拍器', 'music', [11.1, 10, 21], [
    ['retro', R.caramel, R.cream, BRASS],
    ['modern', '#26262a', M.white, METAL],
    ['cute', C.pink, C.white, C.lemon],
    ['nordic', N.oak, N.white, METAL],
  ], fitBuild(metronome), PROP),
]

const MANGA_PALS: PalFlat[] = [
  ['cute', C.pink, C.sky, C.lemon],
  ['retro', R.red, R.teal, R.mustard],
  ['modern', '#3d3f44', '#c8473a', '#f4f4f2'],
  ['nordic', N.blue, N.sage, N.mustard],
]

const OTAKU: AssetDef[] = [
  define('int-manga-stack-s', '漫画书堆', 'hobby', [18.7, 12.5, 7.5], MANGA_PALS, mangaStack(5), { ...PROP, sizeLabel: '5 本' }),
  define('int-manga-stack-m', '漫画书堆', 'hobby', [18.5, 12.3, 15], MANGA_PALS, mangaStack(10), { ...PROP, sizeLabel: '10 本' }),
  define('int-manga-stack-l', '漫画书堆', 'hobby', [18.6, 12.4, 24], MANGA_PALS, mangaStack(16), { ...PROP, sizeLabel: '16 本' }),
  define('int-manga-row', '漫画全套（一排）', 'hobby', [65, 11.6, 17.6], [
    ['cute', '#ff9fc0', '#8fc8f0', '#f4f4f2'],
    ['retro', R.orange, R.teal, '#8a8d93'],
    ['modern', '#26262a', '#c8473a', '#c3c7cc'],
    ['nordic', N.sage, N.blue, N.oak],
  ], mangaRow, PROP),
  define('int-figure-case', '手办展示柜', 'hobby', [40, 25, 46], [
    ['modern', '#26262a', '#ff9fc0', '#8fa0b8'],
    ['cute', C.white, C.pink, C.sky],
    ['nordic', N.oak, N.blue, N.white],
    ['industrial', I.iron, I.rust, I.steel],
  ], figureCase, PROP),
  define('int-ita-bag', '痛包', 'hobby', [32.5, 12.4, 30.5], [
    ['cute', C.pink, '#ff7fa8', C.white],
    ['cute', C.lilac, '#8a6ad0', C.white],
    ['cute', C.sky, '#4f8fd0', C.white],
    ['modern', '#26262a', '#ff6a8a', '#26262a'],
  ], itaBag, PROP),
  define('int-acrylic-stand', '亚克力立牌', 'hobby', [9, 5.5, 15], [
    ['cute', C.sky, '#ffcf6a', C.pink],
    ['cute', C.sakura, '#8a6ad0', C.white],
    ['cute', C.mint, '#5a4646', C.lilac],
    ['modern', '#3d3f44', '#c3c7cc', '#c8473a'],
  ], acrylicStand, PROP),
  define('int-penlights', '应援棒', 'hobby', [24.5, 9.6, 3.1], [
    ['cute', '#ff7fa8', '#6ad0ff', '#ffe066'],
    ['cute', '#b48aff', '#7affc8', '#ff9a5a'],
    ['modern', '#ffffff', '#5ad1ff', '#ff4a6a'],
  ], penlights, PROP),
  define('int-poster-tubes', '海报筒', 'hobby', [15.4, 9.2, 70], [
    ['modern', '#26262a', '#8a8d93', '#3d3f44'],
    ['cute', C.pink, C.sky, C.white],
    ['industrial', I.iron, I.leather, '#26262a'],
    ['nordic', N.sage, N.linen, N.oak],
  ], posterTubes, PROP),
]

const SPORTS: AssetDef[] = [
  define('int-basketball', '篮球', 'hobby', [25, 25, 25], [
    ['retro', '#e2702f', '#3a2a22'],
    ['modern', '#c8602a', '#26262a'],
    ['cute', '#ffa64d', '#5a4646'],
  ], basketball, PROP),
  define('int-soccer-ball', '足球', 'hobby', [22, 22, 22], [
    ['modern', '#fbfaf6', '#26262a'],
    ['cute', '#fffaf4', C.pink],
    ['retro', R.cream, R.caramel],
  ], soccerBall, PROP),
  define('int-tennis', '网球拍 + 球', 'hobby', [60.5, 27, 6.8], [
    ['modern', '#26262a', '#f4f4f2', '#d8ec4a'],
    ['cute', C.sky, C.white, '#d8ec4a'],
    ['retro', R.red, R.cream, '#d8ec4a'],
    ['nordic', N.white, N.oak, '#d8ec4a'],
  ], tennis, PROP),
  define('int-badminton', '羽毛球拍 + 球', 'hobby', [69, 25, 6.5], [
    ['modern', '#26262a', '#c8473a', '#fbfaf6'],
    ['cute', C.pink, C.white, '#fffaf4'],
    ['nordic', N.blue, N.white, '#fbfaf6'],
  ], badminton, PROP),
  define('int-baseball', '棒球手套 + 球棒', 'hobby', [83.5, 38.5, 22], [
    ['retro', '#a8683a', '#e8c89a', '#c8473a'],
    ['modern', '#3a2a22', '#26262a', '#c8473a'],
    ['industrial', I.leather, I.walnut, '#c8473a'],
  ], baseball, PROP),
  define('int-skateboard-flat', '滑板', 'hobby', [80.5, 21.5, 12.2], [
    ['retro', R.orange, '#2b2b2b', R.cream],
    ['cute', C.mint, '#3a3a3a', C.pink],
    ['modern', '#26262a', '#2b2b2b', '#f4f4f2'],
    ['industrial', I.walnut, '#2b2b2b', I.rust],
  ], skateboardFlat, { ...PROP, form: 'lying' }),
  define('int-skateboard-stand', '滑板', 'hobby', [21.5, 20.5, 79.5], [
    ['retro', R.orange, '#2b2b2b', R.cream],
    ['cute', C.mint, '#3a3a3a', C.pink],
    ['modern', '#26262a', '#2b2b2b', '#f4f4f2'],
    ['industrial', I.walnut, '#2b2b2b', I.rust],
  ], skateboardStand, { form: 'standing' }),
  define('int-surfboard', '冲浪板（靠墙）', 'hobby', [52.5, 32, 179.5], [
    ['nordic', N.white, N.blue, N.oak],
    ['retro', R.cream, R.orange, R.teal],
    ['cute', C.sky, C.pink, C.white],
    ['modern', '#f4f4f2', '#26262a', '#8a8d93'],
  ], surfboard),
  define('int-snowboard', '滑雪板（靠墙）', 'hobby', [28, 24, 149.5], [
    ['modern', '#26262a', '#3d3f44', '#5ad1ff'],
    ['retro', R.teal, '#3a3a3a', R.mustard],
    ['cute', C.lilac, '#5a4646', C.pink],
    ['industrial', I.rust, I.iron, I.steel],
  ], snowboard),
  define('int-golf-bag', '高尔夫球包', 'hobby', [27, 38, 109], [
    ['modern', '#26262a', '#c3c7cc', '#f4f4f2'],
    ['retro', R.cream, R.caramel, R.red],
    ['nordic', N.white, N.blue, N.mustard],
    ['industrial', I.leather, I.iron, I.rust],
  ], golfBag),
  define('int-boxing-gloves', '拳击手套', 'hobby', [28.5, 23, 12.6], [
    ['retro', R.red, '#fbfaf6', R.cream],
    ['modern', '#26262a', '#3d3f44', '#c8473a'],
    ['cute', C.pink, C.white, C.lemon],
    ['industrial', I.leather, I.iron, I.steel],
  ], boxingGloves, PROP),
  define('int-bike-helmet', '自行车头盔', 'hobby', [22.5, 29.5, 11.8], [
    ['modern', '#f4f4f2', '#c8473a', '#3d3f44'],
    ['cute', C.mint, C.white, '#5a4646'],
    ['industrial', I.iron, I.rust, '#26262a'],
    ['nordic', N.sage, N.white, N.gray],
  ], bikeHelmet, PROP),
]

const GAMES: AssetDef[] = [
  define('int-shogi', '将棋', 'hobby', [33.5, 36.5, 4.2], [
    ['japanese', '#e8c87a', '#f0d9a0', J.sumi],
    ['japanese', J.hinoki, '#f6e2b0', J.sumi],
    ['retro', R.caramel, R.cream, '#3a2a22'],
  ], shogi, { ...PROP, sizeLabel: '开局' }),
  define('int-go', '围棋', 'hobby', [74, 45.5, 9.8], [
    ['japanese', '#e8c87a', J.dark, J.sumi],
    ['japanese', J.hinoki, '#5a2e22', J.sumi],
    ['nordic', N.oak, N.white, '#3a3a3a'],
  ], goBoard, { ...PROP, sizeLabel: '中盘' }),
  define('int-chess', '国际象棋', 'hobby', [40.5, 36, 10.1], [
    ['modern', '#3d3f44', '#f4f4f2', '#26262a'],
    ['retro', R.caramel, R.cream, '#5a3a24'],
    ['nordic', N.oak, N.white, '#5a5f66'],
    ['cute', C.woodL, C.white, C.pink],
  ], chess, { ...PROP, sizeLabel: '中盘' }),
  define('int-mahjong-table', '自动麻将桌', 'hobby', [88, 88, 75.5], [
    ['retro', R.caramel, '#2f8a5a', R.orange],
    ['modern', '#26262a', '#3d6fb8', '#3d6fb8'],
    ['japanese', J.dark, '#3f7a4a', '#2f8a5a'],
    ['cute', C.woodL, C.mint, C.pink],
  ], mahjong, { surface: 71.5, sizeLabel: '打牌中' }),
  define('int-poker', '扑克牌', 'hobby', [32, 22, 4.4], [
    ['retro', '#2f6a4a', '#c8473a', '#c8473a'],
    ['modern', '#26262a', '#3d6fb8', '#3d6fb8'],
    ['industrial', '#3a5a3c', '#7a2a22', I.rust],
  ], poker, { ...PROP, sizeLabel: '对局中' }),
  define('int-boardgame-pile', '桌游盒子堆', 'hobby', [34.5, 31, 26.5], [
    ['cute', C.pink, C.sky, C.lemon],
    ['retro', R.teal, R.orange, R.mustard],
    ['modern', '#3d3f44', '#c8473a', '#8a8d93'],
    ['nordic', N.blue, N.sage, N.mustard],
  ], boardGames, PROP),
]

const CRAFT: AssetDef[] = [
  define('int-knitting', '毛线篮', 'hobby', [39.5, 30, 31], [
    ['nordic', N.oak, N.sage, N.mustard],
    ['cute', C.woodL, C.pink, C.sky],
    ['retro', R.caramel, R.red, R.mustard],
    ['japanese', J.wood, J.ai, J.shu],
  ], knittingBasket, PROP),
  define('int-sewing-machine', '缝纫机', 'hobby', [42, 18, 34], [
    ['cute', C.white, C.pink, C.sky],
    ['retro', R.cream, R.teal, R.red],
    ['modern', '#f4f4f2', '#3d3f44', '#c8473a'],
    ['retro', '#26262a', BRASS, R.mustard],
  ], sewingMachine, PROP),
  define('int-embroidery', '刺绣绷', 'hobby', [32, 21, 2.5], [
    ['cute', C.woodL, '#fffaf4', C.pink],
    ['nordic', N.oak, N.linen, N.blue],
    ['japanese', J.wood, J.washi, J.shu],
  ], embroidery, PROP),
  define('int-calligraphy', '书法套装', 'japanese', [46, 36, 3.6], [
    ['japanese', '#3a4258', J.sumi, '#d8b46a'],
    ['japanese', '#5a2e22', J.sumi, '#c8a050'],
    ['modern', '#2e3036', '#1e1e22', '#c8a050'],
  ], calligraphy, PROP),
  define('int-watercolor', '水彩套装', 'hobby', [43.5, 21.5, 11.1], [
    ['cute', '#fffaf4', C.sky, C.mint],
    ['nordic', N.white, N.blue, N.sage],
    ['retro', R.cream, '#9ad0e0', R.olive],
  ], watercolor, PROP),
  define('int-pottery-wheel', '陶艺转盘', 'hobby', [58, 62, 43.5], [
    ['nordic', N.white, N.gray, '#c88a62'],
    ['modern', '#3d3f44', '#8a8d93', '#b87a52'],
    ['industrial', I.steel, I.iron, '#a8684a'],
    ['cute', C.sky, C.white, '#d89a72'],
  ], potteryWheel),
]

const STUDY: AssetDef[] = [
  define('int-microscope', '显微镜', 'study', [14, 19.3, 34], [
    ['modern', '#f4f4f2', '#c3c7cc', '#fff2b8'],
    ['retro', '#26262a', BRASS, '#fff2b8'],
    ['cute', C.white, C.sky, '#fff2b8'],
  ], microscope, PROP),
  define('int-chem-set', '化学烧瓶组', 'study', [40.5, 10, 14.9], [
    ['nordic', N.oak, '#7ad0a0', '#6aa8f0'],
    ['retro', R.caramel, '#e2702f', R.teal],
    ['cute', C.woodL, C.pink, C.sky],
  ], chemSet, PROP),
  define('int-star-chart', '天文星图', 'study', [70, 2.5, 50], [
    ['modern', '#26262a', '#1d2a4a', '#fff2b8'],
    ['nordic', N.oak, '#2a3a5a', '#ffffff'],
    ['retro', R.caramel, '#1e3a4a', R.mustard],
  ], starChart, { mount: STAR_MOUNT }),
  define('int-map-scroll', '地图卷轴', 'study', [43.5, 33, 4.4], [
    ['retro', '#f0dcb0', '#6a4a2a', R.caramel],
    ['japanese', J.washi, J.sumi, J.dark],
    ['nordic', N.linen, '#4a5a6a', N.oak],
  ], mapScroll, PROP),
  define('int-ref-books', '参考书堆 + 便签', 'study', [27, 21.5, 17.5], [
    ['modern', '#3d5a80', '#8a3a4a', '#ffe08f'],
    ['nordic', N.blue, N.sage, N.mustard],
    ['retro', R.teal, R.red, R.mustard],
    ['cute', C.sky, C.pink, C.lemon],
  ], refBooks, PROP),
]

const COLLECT: AssetDef[] = [
  define('int-record-row', '唱片收藏（一排）', 'hobby', [40, 35, 31.5], [
    ['retro', R.orange, R.teal, METAL],
    ['modern', '#3d3f44', '#c8473a', '#26262a'],
    ['nordic', N.blue, N.mustard, N.oak],
    ['cute', C.pink, C.sky, C.white],
  ], recordRow, PROP),
  define('int-vinyl-rack', '黑胶唱片架', 'storage', [74, 36, 79], [
    ['nordic', N.oak, N.blue, N.mustard],
    ['industrial', I.walnut, I.rust, I.steel],
    ['modern', '#f4f4f2', '#3d3f44', '#c8473a'],
    ['retro', R.caramel, R.orange, R.teal],
  ], vinylRack, { surface: 79 }),
  define('int-trophy-cup', '奖杯', 'deco', [19.4, 13, 23.5], [
    ['modern', '#26262a', GOLD, GOLD],
    ['retro', R.caramel, BRASS, BRASS],
    ['nordic', N.white, '#c9ced6', '#c9ced6'],
  ], trophyCup, { ...PROP, sizeLabel: '大杯' }),
  define('int-trophy-star', '奖杯', 'deco', [11.4, 7.2, 23.5], [
    ['modern', '#26262a', GOLD, GOLD],
    ['retro', R.caramel, BRASS, BRASS],
    ['cute', C.sky, '#ffd65a', '#ffd65a'],
  ], trophyStar, { ...PROP, sizeLabel: '星形' }),
  define('int-trophy-column', '奖杯', 'deco', [8, 8, 19.5], [
    ['modern', '#26262a', GOLD, GOLD],
    ['nordic', N.white, '#c9ced6', '#c9ced6'],
    ['retro', '#3a3a3a', '#c8875a', '#c8875a'],
  ], trophyColumn, { ...PROP, sizeLabel: '小立柱' }),
  define('int-medal-rack', '奖牌挂架', 'deco', [60, 3.3, 33.6], [
    ['modern', '#26262a', '#3d6fb8', '#c8473a'],
    ['nordic', N.oak, N.blue, N.mustard],
    ['industrial', I.iron, I.rust, '#3a5a3c'],
  ], medalRack, { mount: MEDAL_MOUNT }),
  define('int-postcard-wall', '明信片墙', 'deco', [90.5, 2.7, 60.5], [
    ['industrial', '#26262a', I.walnut, '#ffd27a'],
    ['nordic', N.white, N.oak, '#fff2b8'],
    ['cute', C.pink, C.woodL, '#fff2b8'],
    ['modern', '#8a8d93', '#26262a', '#ffffff'],
  ], postcardWall, { mount: POSTCARD_MOUNT }),
  define('int-succulent-set', '多肉组合', 'plants', [32, 12, 13.4], [
    ['nordic', N.oak, N.white, '#9cc49a'],
    ['cute', C.woodL, C.sakura, '#a6d8b0'],
    ['industrial', I.walnut, I.concrete, '#8ab08a'],
    ['japanese', J.wood, J.sumi, '#9cb88a'],
  ], succulentSet, PROP),
  define('int-mineral-box', '矿石标本盒', 'study', [30, 22, 5.1], [
    ['nordic', N.oak, N.blue, N.white],
    ['retro', R.caramel, R.teal, R.cream],
    ['modern', '#3d3f44', '#8ad0ff', '#f4f4f2'],
  ], mineralBox, PROP),
]

const LIFE: AssetDef[] = [
  define('int-cat-toys', '猫抓板 + 逗猫棒', 'pets', [50.5, 32, 9], [
    ['cute', CARD, C.pink, C.lemon],
    ['nordic', '#d8b98c', N.oak, N.mustard],
    ['retro', CARD, R.red, R.teal],
  ], catToys, PROP),
  define('int-suitcase-standing', '旅行箱', 'entrance', [41.5, 24.5, 72], [
    ['cute', C.sakura, C.pink, C.sky],
    ['modern', '#3d3f44', '#26262a', '#c8473a'],
    ['nordic', N.sage, N.oak, N.mustard],
    ['retro', R.mustard, R.caramel, R.teal],
    ['industrial', I.steel, I.leather, I.rust],
  ], suitcaseStand, { form: 'standing' }),
  define('int-suitcase-open', '旅行箱', 'entrance', [81, 65.5, 11], [
    ['cute', C.sakura, C.white, C.sky],
    ['modern', '#3d3f44', '#8a8d93', '#3d5a80'],
    ['nordic', N.sage, N.linen, N.blue],
    ['retro', R.mustard, R.cream, R.teal],
    ['industrial', I.steel, I.concrete, I.rust],
  ], suitcaseOpen, { form: 'open' }),
  define('int-raincoat', '雨衣（挂钩）', 'entrance', [42, 18.7, 87], [
    ['retro', '#f0c040', '#3a3a3a', R.caramel],
    ['cute', C.pink, C.white, C.woodL],
    ['nordic', N.sage, N.white, N.oak],
    ['modern', '#3d5a80', '#f4f4f2', '#26262a'],
  ], raincoat, { mount: RAINCOAT_MOUNT }),
  define('int-cartons-1', '快递纸箱', 'storage', [34, 24.5, 20], [['industrial', CARD], ['nordic', '#d8b98c'], ['retro', '#b8854e']], cartons(1), { ...PROP, sizeLabel: '1 箱' }),
  define('int-cartons-2', '快递纸箱', 'storage', [45, 35.5, 50], [['industrial', CARD], ['nordic', '#d8b98c'], ['retro', '#b8854e']], cartons(2), { sizeLabel: '2 箱' }),
  define('int-cartons-3', '快递纸箱', 'storage', [55, 40.5, 85], [['industrial', CARD], ['nordic', '#d8b98c'], ['retro', '#b8854e']], cartons(3), { sizeLabel: '3 箱' }),
  define('int-snack-pile', '零食堆', 'tabletop', [34.5, 28, 12.3], [
    ['cute', '#ff9a5a', C.pink, C.lemon],
    ['retro', R.red, R.mustard, R.orange],
    ['modern', '#3d5a80', '#26262a', '#ffd65a'],
  ], snackPile, PROP),
  define('int-energy-cans', '能量饮料罐堆', 'tabletop', [20.5, 10.4, 40.5], [
    ['modern', '#26262a', '#5ad1ff', METAL],
    ['modern', '#3d5a80', '#ff4a6a', METAL],
    ['cute', '#ffffff', C.pink, METAL],
    ['retro', R.teal, R.mustard, METAL],
  ], energyCans, PROP),
  define('int-coffee-canisters', '咖啡豆罐', 'kitchenware', [29.5, 17, 15.5], [
    ['retro', R.red, R.cream, '#d8b98c'],
    ['modern', '#26262a', '#f4f4f2', '#c3c7cc'],
    ['nordic', N.sage, N.white, N.linen],
    ['industrial', I.steel, I.concrete, '#c8a070'],
  ], coffeeCanisters, PROP),
]

const ROD_PALS: PalFlat[] = [
  ['modern', '#26262a', '#3a3b40', '#c3c7cc'],
  ['industrial', '#3a5a3c', '#c8a070', '#7c8085'],
  ['retro', '#7a2a22', '#c8a070', BRASS],
  ['nordic', N.blue, '#c8a070', '#c3c7cc'],
]
const BAG_PALS: PalFlat[] = [
  ['modern', '#26262a', '#8a8d93', '#3d3f44'],
  ['industrial', '#5a6a4a', '#26262a', I.leather],
  ['nordic', N.blue, N.white, N.oak],
  ['retro', R.olive, R.cream, R.caramel],
]

const FISHING: AssetDef[] = [
  define('int-rod-sea', '钓竿', 'hobby', [7.3, 20, 237.5], ROD_PALS, rodStanding(true), { sizeLabel: '海竿 240', form: 'standing' }),
  define('int-rod-sea-bag', '钓竿', 'hobby', [150, 15.4, 11.2], BAG_PALS, rodBag(true), { ...PROP, sizeLabel: '海竿 240', form: 'boxed' }),
  define('int-rod-lure', '钓竿', 'hobby', [5.8, 18.5, 192.5], ROD_PALS, rodStanding(false), { sizeLabel: '路亚竿 195', form: 'standing' }),
  define('int-rod-lure-bag', '钓竿', 'hobby', [128, 15.4, 11.2], BAG_PALS, rodBag(false), { ...PROP, sizeLabel: '路亚竿 195', form: 'boxed' }),
  define('int-rod-rack', '壁挂钓竿架', 'hobby', [210, 15.7, 34], [
    ['nordic', N.oak, N.blue, '#c3c7cc'],
    ['industrial', I.walnut, '#3a5a3c', '#7c8085'],
    ['modern', '#26262a', '#3d3f44', '#c3c7cc'],
    ['retro', R.caramel, '#7a2a22', BRASS],
  ], rodRack, { mount: ROD_RACK_MOUNT }),
  define('int-tackle-box-open', '渔具箱', 'hobby', [36, 24.5, 24.5], [
    ['industrial', '#5a6a4a', '#c3c7cc', '#e2702f'],
    ['modern', '#3d3f44', '#c3c7cc', '#5ad1ff'],
    ['retro', R.red, METAL, R.mustard],
    ['cute', C.mint, C.white, C.pink],
  ], tackleBox(true), { ...PROP, form: 'open' }),
  define('int-tackle-box', '渔具箱', 'hobby', [36.5, 21, 22], [
    ['industrial', '#5a6a4a', '#c3c7cc', '#e2702f'],
    ['modern', '#3d3f44', '#c3c7cc', '#5ad1ff'],
    ['retro', R.red, METAL, R.mustard],
    ['cute', C.mint, C.white, C.pink],
  ], tackleBox(false), { ...PROP, form: 'closed' }),
  define('int-fish-cooler', '钓鱼冷藏箱', 'hobby', [55.5, 31.5, 33.5], [
    ['modern', '#f4f4f2', '#3d5a80', '#26262a'],
    ['retro', R.cream, R.red, '#3a3a3a'],
    ['industrial', I.concrete, '#5a6a4a', I.iron],
    ['cute', C.white, C.sky, C.pink],
  ], fishCooler),
  define('int-fishing-stool', '折叠钓鱼凳', 'hobby', [28, 30, 41], [
    ['industrial', '#5a6a4a', I.iron],
    ['modern', '#26262a', '#8a8d93'],
    ['nordic', N.linen, N.oak],
    ['retro', R.olive, R.caramel],
  ], fishingStool),
  define('int-fish-creel', '鱼篓', 'hobby', [26.5, 16.8, 35], [
    ['japanese', '#d8b46a', J.wood, J.dark],
    ['retro', R.caramel, R.cream, '#5a3a24'],
    ['nordic', N.oak, N.linen, N.gray],
  ], fishCreel, PROP),
  define('int-landing-net', '抄网（靠墙）', 'hobby', [41, 33, 160], [
    ['modern', '#26262a', '#c3c7cc', '#3a3a3a'],
    ['industrial', I.walnut, I.iron, '#4a5a3a'],
    ['retro', R.caramel, BRASS, '#5a5a4a'],
  ], landingNet),
]

const BOX_PALS: PalFlat[] = [['cute', C.pink], ['retro', R.teal], ['modern', '#3d3f44'], ['nordic', N.sage], ['retro', R.orange]]
const TRIO_PALS: PalFlat[] = [
  ['cute', C.pink, C.sky, C.lemon],
  ['retro', R.teal, R.orange, R.mustard],
  ['modern', '#3d3f44', '#c8473a', '#8a8d93'],
  ['nordic', N.blue, N.sage, N.mustard],
]

const BOARDGAMES: AssetDef[] = [
  define('int-bgbox-square', '桌游盒', 'hobby', [30, 30, 7.8], BOX_PALS, bgBoxSingle(30, 7.5, 30, 1), { ...PROP, sizeLabel: '方形大盒' }),
  define('int-bgbox-mid', '桌游盒', 'hobby', [23, 23, 6.3], BOX_PALS, bgBoxSingle(23, 6, 23, 2), { ...PROP, sizeLabel: '中号方盒' }),
  define('int-bgbox-rect', '桌游盒', 'hobby', [30, 22, 6.3], BOX_PALS, bgBoxSingle(30, 6, 22, 3), { ...PROP, sizeLabel: '长方形' }),
  define('int-bgbox-card', '桌游盒', 'hobby', [12.1, 9.1, 4.3], BOX_PALS, bgBoxSingle(12, 4, 9, 4), { ...PROP, sizeLabel: '小卡牌盒' }),
  define('int-bgbox-row', '桌游盒（竖插一排）', 'hobby', [57.5, 30.5, 30], TRIO_PALS, bgShelfRow, PROP),
  define('int-bg-hex', '六角地块版图（对局中）', 'hobby', [53.5, 36.5, 2.7], [
    ['cute', '#9ccbe8', C.pink, '#ffffff'],
    ['retro', '#5aa0b8', R.red, R.cream],
    ['nordic', N.blue, N.mustard, N.white],
  ], bgHex, PROP),
  define('int-bg-train', '铁路地图版图（对局中）', 'hobby', [57, 34, 1.6], [
    ['retro', '#e8dcb0', R.red, R.teal],
    ['nordic', '#dfe5c8', N.blue, N.mustard],
    ['cute', '#f6ecd0', C.pink, C.sky],
  ], bgTrain, PROP),
  define('int-card-game', '彩色数字卡牌', 'hobby', [44, 32, 2.7], [
    ['retro', '#c8473a', '#2f6a4a'],
    ['modern', '#26262a', '#3d3f44'],
    ['cute', C.pink, C.sky],
  ], cardGame, { ...PROP, sizeLabel: '对局中' }),
  define('int-dice-game', '骰子游戏（骰盅 + 骰子）', 'hobby', [36.5, 26, 10.2], [
    ['industrial', I.leather, '#2f6a4a', '#fbfaf6'],
    ['modern', '#26262a', '#3d5a80', '#fbfaf6'],
    ['retro', R.caramel, R.red, R.cream],
    ['cute', C.pink, C.mint, '#ffffff'],
  ], diceGame, PROP),
  define('int-bg-loop', '环形大富翁棋盘（对局中）', 'hobby', [62, 50, 2.6], [
    ['retro', '#dfe8d0', R.red, R.mustard],
    ['cute', '#f6ecd0', C.pink, C.sky],
    ['nordic', N.linen, N.blue, N.mustard],
  ], bgLoop, PROP),
  define('int-bg-mystery', '推理桌游（对局中）', 'hobby', [59.5, 48, 3.1], [
    ['retro', '#c8a878', '#5a3a24', R.red],
    ['modern', '#b8bcc2', '#3d3f44', '#c8473a'],
    ['nordic', N.oakL, N.gray, N.blue],
  ], bgMystery, PROP),
  define('int-chess-opening', '国际象棋', 'hobby', [36, 36, 8.8], [
    ['modern', '#3d3f44', '#f4f4f2', '#26262a'],
    ['retro', R.caramel, R.cream, '#5a3a24'],
    ['nordic', N.oak, N.white, '#5a5f66'],
    ['cute', C.woodL, C.white, C.pink],
  ], chessOpening, { ...PROP, sizeLabel: '开局' }),
  define('int-xiangqi', '中国象棋', 'hobby', [40, 44, 2.7], [
    ['retro', '#e8c87a', '#c8302a', '#26262a'],
    ['nordic', N.oakL, '#c8302a', '#26262a'],
    ['japanese', J.hinoki, '#c8302a', J.sumi],
  ], xiangqi, { ...PROP, sizeLabel: '开局' }),
  define('int-reversi', '黑白棋', 'hobby', [34, 34, 2], [
    ['modern', '#3f8a4a', '#26262a', '#f4f4f2'],
    ['retro', '#2f7a4a', '#26262a', R.cream],
    ['cute', '#8fcf9a', '#5a4646', '#ffffff'],
  ], reversi, { ...PROP, sizeLabel: '中盘' }),
  define('int-chinese-checkers', '跳棋', 'hobby', [43, 43, 3], [
    ['retro', R.caramel, R.cream, R.red],
    ['nordic', N.oak, N.white, '#c8473a'],
    ['cute', C.woodL, C.sakura, C.pink],
  ], chineseCheckers, { ...PROP, sizeLabel: '开局' }),
  define('int-backgammon', '双陆棋', 'hobby', [48.5, 38, 3], [
    ['retro', '#7a4a2a', R.red, R.red],
    ['industrial', I.walnut, '#3a3a3c', '#26262a'],
    ['nordic', N.oak, N.blue, N.blue],
  ], backgammon, { ...PROP, sizeLabel: '对局中' }),
  define('int-hanafuda', '花札', 'japanese', [21.5, 19.9, 1.6], [
    ['japanese', '#c8302a', '#f2e6cc', J.shu],
    ['japanese', '#26262a', '#cfe0f0', '#8a4fb0'],
    ['retro', R.red, R.cream, R.mustard],
  ], hanafuda, { ...PROP, sizeLabel: '对局中' }),
  define('int-karuta', '百人一首（かるた）', 'japanese', [88, 60, 1.1], [
    ['japanese', J.tatami, '#3a6a4a', J.sumi],
    ['japanese', '#d0d49a', '#c8302a', J.sumi],
    ['retro', '#c9c48a', R.teal, '#3a2a22'],
  ], karuta, { ...PROP, sizeLabel: '摆开对局' }),
  define('int-jenga', '叠叠乐', 'hobby', [13.5, 11, 27], [['nordic', '#e8cfa0'], ['japanese', J.hinoki], ['cute', '#f0d6b0']], jenga(true), { ...PROP, form: 'stacked' }),
  define('int-jenga-fallen', '叠叠乐', 'hobby', [45.5, 40, 8.3], [['nordic', '#e8cfa0'], ['japanese', J.hinoki], ['cute', '#f0d6b0']], jenga(false), { ...PROP, form: 'lying' }),
  define('int-uno-cards', '彩色数字卡牌', 'hobby', [37, 11.3, 3.2], [
    ['retro', '#c8473a', '#2f6a4a'],
    ['modern', '#26262a', '#3d3f44'],
    ['cute', C.pink, C.sky],
  ], unoCards, { ...PROP, sizeLabel: '一副 + 摊开几张' }),
  define('int-jigsaw', '拼图（拼到一半）', 'hobby', [54, 40, 0.9], [
    ['nordic', N.linen, '#a8d4f4', '#78c47a'],
    ['retro', R.cream, '#9ad0e0', R.olive],
    ['cute', C.cream, C.sky, C.mint],
  ], jigsaw, PROP),
  define('int-tangram', '七巧板', 'hobby', [33.5, 20.5, 1.6], [
    ['nordic', N.oak, N.blue, N.sage],
    ['cute', C.woodL, C.sky, C.lilac],
    ['retro', R.caramel, R.red, R.teal],
  ], tangram, PROP),
  define('int-burr-puzzle', '鲁班锁', 'hobby', [18, 10.3, 8.8], [['nordic', '#e2c486'], ['japanese', J.wood], ['retro', R.caramel]], burrPuzzle, PROP),
]

export const INTERESTS: AssetDef[] = [...MUSIC, ...OTAKU, ...SPORTS, ...GAMES, ...CRAFT, ...STUDY, ...COLLECT, ...LIFE, ...FISHING, ...BOARDGAMES]

// =====================================================================
// 棋牌状态变体：每种棋牌一个 family（int-chess、int-go…），name 统一为棋种名，sizeLabel 表示状态
// （收在盒里 / 合上 / 开局 / 中盘 / 残局 / 摆谱 / 收拾中…）。旧 id 保留为其中一个状态，见上方 GAMES / BOARDGAMES。
// 同一 family 的配色组和旧素材完全一致，切换状态时配色不跳。
// =====================================================================

type ChessKind = 'p' | 'r' | 'n' | 'b' | 'q' | 'k'

/** 国际象棋盘（和旧素材同一张贴图）：36 × 36，盘面高 2.3 */
function chessBoard(g: THREE.Group, frame: string, white: string, black: string) {
  g.add(rbox(36, 2, 36, frame, {}, 0.5))
  g.add(paintTop(32, 32, `int-chess-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 8, W / 8 + 1, H / 8 + 1)
      }
  }, 0, 2.3, 0))
}
/** 按「f 列 r 行 白?」摆子：r = 0 是白方底线（+z 一侧） */
function chessPut(g: THREE.Group, list: [ChessKind, number, number, boolean][], white: string, black: string) {
  for (const [k, f, r, w] of list) g.add(P(chessPiece(k, w ? white : black, w ? PI : 0), -14 + f * 4, 2.35, 14 - r * 4))
}
/** 被吃掉的子：横躺在棋盘外侧排成列（side = 1 右侧，-1 左侧） */
function chessTaken(g: THREE.Group, kinds: ChessKind[], color: string, side: number) {
  kinds.forEach((k, i) => {
    const col = Math.floor(i / 6)
    const row = i % 6
    g.add(P(chessPiece(k, color), side * (19.6 + col * 7), 1.4, -13 + row * 5.2, 0, 0, -side * (PI / 2)))
  })
}

const CHESS_MID: [ChessKind, number, number, boolean][] = [
  ['k', 6, 0, true], ['r', 5, 0, true], ['q', 3, 1, true], ['b', 2, 3, true], ['n', 5, 2, true], ['p', 0, 1, true], ['p', 1, 1, true], ['p', 4, 3, true], ['p', 5, 1, true], ['p', 6, 1, true], ['p', 7, 2, true],
  ['k', 6, 7, false], ['r', 0, 7, false], ['r', 5, 7, false], ['q', 4, 6, false], ['n', 2, 5, false], ['b', 6, 6, false], ['p', 0, 6, false], ['p', 1, 5, false], ['p', 4, 4, false], ['p', 5, 6, false], ['p', 6, 5, false], ['p', 7, 6, false],
]

/** 收在木盒里：抽拉盖木盒，盖上镶一小块棋盘格 [框, 白, 黑] */
function chessBoxed(p: string[]) {
  const [frame, white, black] = p
  const g = G(rbox(30, 6.4, 15, frame, {}, 0.6), rbox(29.4, 0.8, 14.2, shade(frame, -0.12), { y: 6.2 }, 0.3))
  g.add(paintTop(12, 6, `int-chess-lid-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 4, W / 8 + 1, H / 4 + 1)
      }
  }, 0, 7.05, 0))
  g.add(rbox(3, 0.5, 1, shade(frame, -0.3), { x: 13, y: 7, z: 0 }, 0.2))
  return fitGroup(g)
}

/** 折叠棋盘合上：两片对折，外面露出半张棋盘格，后边两个合页、前边一个搭扣 [框, 白, 黑] */
function chessFolded(p: string[]) {
  const [frame, white, black] = p
  const g = G(rbox(36, 2.6, 18, frame, {}, 0.5), rbox(36, 2.6, 18, shade(frame, -0.06), { y: 2.7 }, 0.5))
  g.add(paintTop(32, 16, `int-chess-half-${white}-${black}`, (c, W, H) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? shade(black, 0.25) : shade(white, -0.04)
        c.fillRect((i * W) / 8, (j * H) / 4, W / 8 + 1, H / 4 + 1)
      }
  }, 0, 5.6, 0))
  for (const x of [-11, 11]) g.add(cylX(0.6, 5, METAL, x, 2.7, -9.1))
  g.add(rbox(3, 2.4, 0.6, METAL, { y: 1.5, z: 9.1 }, 0.2))
  return fitGroup(g)
}

/** 残局：双方只剩几个子，吃掉的子横躺在两侧 [框, 白, 黑] */
function chessEndgame(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  chessBoard(g, frame, white, black)
  chessPut(g, [['k', 6, 1, true], ['r', 0, 4, true], ['p', 5, 1, true], ['p', 6, 2, true], ['p', 7, 1, true], ['k', 5, 6, false], ['r', 3, 6, false], ['p', 6, 5, false], ['p', 7, 4, false], ['b', 2, 3, false]], white, black)
  chessTaken(g, ['q', 'r', 'n', 'n', 'b', 'p', 'p', 'p', 'p', 'p'], black, 1)
  chessTaken(g, ['q', 'r', 'n', 'n', 'b', 'b', 'p', 'p', 'p', 'p', 'p'], white, -1)
  return fitGroup(g)
}

/** 打开的棋谱书：两页各画一个小棋图 + 几行字，中心 (x, z) [封面色] */
function openBook(cover: string, key: string, x: number, z: number, ry = 0, ink = '#3a3a3a') {
  const b = G(rbox(25, 0.4, 17.6, cover, {}, 0.15))
  for (const s of [-1, 1]) {
    b.add(rbox(12, 0.9, 16.6, PAPER, { x: s * 6.1, y: 0.4 }, 0.2))
    b.add(paintTop(11, 15.6, `${key}-${s}`, (c, W, H) => {
      c.fillStyle = PAPER
      c.fillRect(0, 0, W, H)
      const n = 8
      const bw = W * 0.7
      const x0 = (W - bw) / 2
      const y0 = H * 0.08
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          c.fillStyle = (i + j) % 2 ? '#b8b8b8' : '#ffffff'
          c.fillRect(x0 + (i * bw) / n, y0 + (j * bw) / n, bw / n + 1, bw / n + 1)
        }
      c.strokeStyle = ink
      c.lineWidth = Math.max(1, W * 0.01)
      c.strokeRect(x0, y0, bw, bw)
      const r = rng(s + 7)
      c.fillStyle = ink
      for (let k = 0; k < 7; k++) {
        c.beginPath()
        c.arc(x0 + (Math.floor(r() * 8) + 0.5) * (bw / 8), y0 + (Math.floor(r() * 8) + 0.5) * (bw / 8), bw / 24, 0, PI * 2)
        c.fill()
      }
      for (let k = 0; k < 6; k++) c.fillRect(W * 0.12, y0 + bw + H * (0.06 + k * 0.045), W * (0.5 + r() * 0.26), Math.max(1, H * 0.012))
    }, s * 6.1, 1.32, 0))
  }
  b.add(rbox(0.6, 1.1, 16.8, shade(cover, -0.2), { y: 0.35 }, 0.2))
  return P(b, x, 0, z, 0, ry)
}

/** 复盘 / 摆谱：盘上是谱里的局面，旁边摊着棋谱书和一支铅笔 [框, 白, 黑] */
function chessStudy(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  chessBoard(g, frame, white, black)
  chessPut(g, CHESS_MID.filter((_, i) => i % 5 !== 3), white, black)
  g.add(openBook(shade(frame, -0.1), `int-chess-book-${frame}`, 33, 2, -0.12))
  g.add(cylX(0.35, 13, '#e8c040', 32, 0.75, 13.5))
  g.add(P(cyl(0.01, 0.35, 1.2, '#f2d9b0', {}, 8), 25.4, 0.75, 13.5, 0, 0, PI / 2))
  return fitGroup(g)
}

/** 散乱收拾中：盘上剩几个子、有的倒了，前面打开的木盒里已经装了一半 [框, 白, 黑] */
function chessMessy(p: string[]) {
  const [frame, white, black] = p
  const g = new THREE.Group()
  chessBoard(g, frame, white, black)
  chessPut(g, [['k', 4, 0, true], ['r', 0, 0, true], ['p', 2, 2, true], ['q', 3, 7, false], ['p', 6, 6, false], ['n', 5, 4, false], ['b', 1, 5, true]], white, black)
  const lying: [ChessKind, number, number, number, boolean][] = [['p', 3, 3, 0.6, true], ['r', 6, 2, -1.2, false], ['p', -1, -9, 2.2, false], ['b', 9, -6, 0.3, true]]
  for (const [k, x, z, ry, w] of lying) g.add(P(G(P(chessPiece(k, w ? white : black), 0, 1.4, 0, 0, 0, PI / 2)), x, 2.3, z, 0, ry))
  // 木盒：两格，左格白子、右格黑子
  const box = G(tray(30, 6.4, 15, 0.8, frame), rbox(0.8, 5.6, 13.4, frame, { y: 0.8 }, 0.2))
  for (let i = 0; i < 9; i++) {
    const w = i % 2 === 0
    const x = w ? -12 + (i % 4) * 2.6 : 3 + (i % 4) * 2.6
    box.add(P(chessPiece(i % 3 === 0 ? 'p' : i % 3 === 1 ? 'n' : 'b', w ? white : black), x, 2.2, -3 + Math.floor(i / 4) * 3, 0, i * 0.7, PI / 2))
  }
  g.add(P(box, 0, 0, 29))
  g.add(rbox(30, 0.8, 15, shade(frame, -0.12), { x: -30, y: 0, z: 22 }, 0.3))
  return fitGroup(g)
}

// ---------- 围棋 ----------

const GO_X = (i: number) => -41.4 * 0.45 + (i * 41.4 * 0.9) / 18
const GO_Z = (j: number) => -44.5 * 0.45 + (j * 44.5 * 0.9) / 18
const GO_B = '#26262a'
const GO_W = '#f8f6f0'

/**
 * 围棋：stones = [i, j, 黑?]；bowls：'closed' 棋罐盖着，'open' 盖子翻过来放在罐边（装提子）。
 * prisoners：每个盖子里的提子数。[棋盘木, 棋罐, 线色]
 */
function goState(p: string[], stones: [number, number, boolean][], bowls: 'closed' | 'open', prisoners = 0) {
  const [board, bowl, line] = p
  const g = new THREE.Group()
  g.add(rbox(42.4, 5, 45.5, board, {}, 0.6))
  const st: V2[] = [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
  g.add(paintTop(41.4, 44.5, `int-go-${board}-${line}`, drawGrid(board, line, 19, st, 0.05), 0, 5.3, 0))
  for (const [i, j, b] of stones) g.add(ball(1.1, b ? GO_B : GO_W, { x: GO_X(i), y: 5.8, z: GO_Z(j) }, [1, 0.45, 1]))
  for (const [s, c] of [[-1, GO_B], [1, GO_W]] as [number, string][]) {
    const x = s * 30.5
    g.add(ball(6.5, bowl, { x, y: 4.4, z: 14 }, [1, 0.68, 1]))
    if (bowls === 'closed') g.add(puck(5.4, 1.8, bowl, { x, y: 8, z: 14 }))
    else {
      // 罐口露出一堆棋子，盖子翻过来放在罐子后面，里面装着提子
      for (let k = 0; k < 7; k++) g.add(ball(1.1, c, { x: x + Math.cos(k) * (k ? 2.2 : 0), y: 8.6 + (k ? 0 : 0.5), z: 14 + Math.sin(k) * (k ? 2.2 : 0) }, [1, 0.45, 1]))
      g.add(cup(5.4, 4.6, 1.8, 0.4, bowl, { x, z: 0 }))
      const other = c === GO_B ? GO_W : GO_B
      for (let k = 0; k < prisoners; k++) g.add(ball(1.1, other, { x: x + Math.cos(k * 2.4) * Math.min(3.2, 0.9 * Math.sqrt(k)), y: 0.9 + (k > 10 ? 0.45 : 0), z: Math.sin(k * 2.4) * Math.min(3.2, 0.9 * Math.sqrt(k)) }, [1, 0.45, 1]))
    }
  }
  return fitGroup(g)
}
const goEmpty = (p: string[]) => goState(p, [], 'closed')
const goOpening = (p: string[]) =>
  goState(p, [[3, 3, true], [15, 15, false], [15, 3, true], [3, 15, false], [16, 9, true], [2, 9, false], [5, 2, true], [13, 16, false], [9, 3, true], [15, 13, false], [16, 5, true]], 'open')
function goCounting(p: string[]) {
  // 终局数子：中间一条曲折的分界，黑占左、白占右；边上还有几块小的活棋
  const stones: [number, number, boolean][] = []
  for (let j = 0; j < 19; j++) {
    const b = 9 + Math.round(2.2 * Math.sin(j * 0.55))
    stones.push([b - 1, j, true], [b, j, false])
    if (j % 4 === 1) stones.push([b - 2, j, true])
    if (j % 5 === 2) stones.push([b + 1, j, false])
  }
  for (const [i, j] of [[3, 2], [4, 2], [4, 3], [3, 4], [2, 4]] as V2[]) stones.push([i, j, true])
  for (const [i, j] of [[15, 15], [14, 15], [14, 16], [16, 14], [15, 13]] as V2[]) stones.push([i, j, false])
  return goState(p, stones, 'open', 14)
}

// ---------- 将棋 ----------

/** 将棋盘（同旧素材贴图）+ 按 9 行字符图摆子：x = 自己的子、X = 自己的大子（王 / 飞 / 角），o / O 为对方 [棋盘木, 棋子木, 字色] */
function shogiState(p: string[], rows: string[], held: [number, number] = [0, 0], extra?: (g: THREE.Group) => void) {
  const [board, piece, ink] = p
  const g = new THREE.Group()
  const bw = 33.3
  const bd = 36.4
  g.add(rbox(bw, 3, bd, board, {}, 0.5))
  g.add(paintTop(31, 34, `int-shogi-${board}-${ink}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    const lw = Math.max(1, W * 0.004)
    for (let i = 0; i <= 9; i++) {
      c.fillRect((i / 9) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 9) * (H - lw), W, lw)
    }
    for (const [i, j] of [[3, 3], [6, 3], [3, 6], [6, 6]]) {
      c.beginPath()
      c.arc((i / 9) * W, (j / 9) * H, lw * 2.5, 0, PI * 2)
      c.fill()
    }
  }, 0, 3.3, 0))
  const koma = (x: number, y: number, z: number, mine: boolean, big: boolean) => {
    const r = big ? 1.65 : 1.45
    const m = cyl(r * 0.8, r, 0.8, piece, { x, y, z, ry: mine ? PI : 0 }, 5)
    m.scale.set(0.85, 1, 1)
    g.add(m, noOutline(rbox(0.8, 0.1, 1.1, ink, { x, y: y + 0.82, z }, 0.05)))
  }
  const cw = 31 / 9
  const ch = 34 / 9
  rows.forEach((row, j) =>
    [...row].forEach((ch0, i) => {
      if (ch0 === '.') return
      koma(-15.5 + cw * (i + 0.5), 3.3, -17 + ch * (j + 0.5), ch0.toLowerCase() === 'x', ch0 === 'X' || ch0 === 'O')
    }),
  )
  // 驹台：放持驹的小台，在各自右手边
  for (const [s, n] of [[1, held[0]], [-1, held[1]]] as [number, number][]) {
    if (!n) continue
    const x = s * 26
    const z = s * 11
    g.add(rbox(14, 1.6, 14, board, { x, y: 2.4, z }, 0.4))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(1.6, 2.4, 1.6, shade(board, -0.15), { x: x + sx * 5.5, z: z + sz * 5.5 }, 0.3))
    for (let k = 0; k < n; k++) koma(x - 4 + (k % 3) * 4, 4, z - 3 + Math.floor(k / 3) * 4, s > 0, false)
  }
  extra?.(g)
  return fitGroup(g)
}
const SHOGI_MID = ['o.o.Oo.oo', '.O....oO.', 'o.oooo..o', '..o...o..', '.o..x..o.', '..x...x..', 'xx.xxx.xx', '.X.....X.', 'x.xxXx.xx']
const shogiMid = (p: string[]) => shogiState(p, SHOGI_MID, [3, 2])
const shogiTsume = (p: string[]) =>
  shogiState(p, ['...oO.o..', '.....o...', '....x.x..', '.X.......', '.........', '.........', '.........', '.........', '.........'], [2, 0], (g) => g.add(openBook('#e8e0cc', 'int-shogi-tsume-book', 0, 30, 0)))
/** 收好：棋盘上放着驹箱（木盒，盖子有一道浅槽）[棋盘木, 棋子木, 字色] */
function shogiBoxed(p: string[]) {
  const [board, piece] = p
  const g = new THREE.Group()
  g.add(rbox(33.3, 3, 36.4, board, {}, 0.5))
  g.add(paintTop(31, 34, `int-shogi-plain-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = shade(board, -0.12)
    for (let i = 1; i < 6; i++) c.fillRect(0, (i / 6) * H, W, Math.max(1, H * 0.003))
  }, 0, 3.05, 0))
  g.add(rbox(10, 4.6, 7.4, shade(piece, -0.12), { y: 3, z: 0 }, 0.4), rbox(10.2, 1, 7.6, shade(piece, -0.2), { y: 7.2, z: 0 }, 0.3))
  g.add(rbox(4, 0.3, 1, shade(piece, -0.35), { y: 8.15 }, 0.1))
  return fitGroup(g)
}

// ---------- 中国象棋 ----------

/** 中国象棋盘（同旧素材贴图）+ 摆子：pieces = [i, j, 红?]；taken = 两侧被吃的子数 [棋盘木, 红方, 黑方] */
function xqState(p: string[], pieces: [number, number, boolean][], taken: [number, number] = [0, 0]) {
  const [board, red, black] = p
  const g = new THREE.Group()
  const BW = 40
  const BD = 44
  g.add(rbox(BW, 1.6, BD, board, {}, 0.4))
  const gx = 4.2
  const gz = 4.3
  const x0 = -gx * 4
  const z0 = -gz * 4.5
  g.add(paintTop(BW - 1, BD - 1, `int-xq-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    const px = (i: number) => ((x0 + i * gx + (BW - 1) / 2) / (BW - 1)) * W
    const pz = (j: number) => ((z0 + j * gz + (BD - 1) / 2) / (BD - 1)) * H
    c.strokeStyle = '#3a2a20'
    c.lineWidth = Math.max(1, W * 0.004)
    for (let j = 0; j < 10; j++) {
      c.beginPath()
      c.moveTo(px(0), pz(j))
      c.lineTo(px(8), pz(j))
      c.stroke()
    }
    for (let i = 0; i < 9; i++) {
      c.beginPath()
      if (i === 0 || i === 8) {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(9))
      } else {
        c.moveTo(px(i), pz(0))
        c.lineTo(px(i), pz(4))
        c.moveTo(px(i), pz(5))
        c.lineTo(px(i), pz(9))
      }
      c.stroke()
    }
    for (const j of [0, 7]) {
      c.beginPath()
      c.moveTo(px(3), pz(j))
      c.lineTo(px(5), pz(j + 2))
      c.moveTo(px(5), pz(j))
      c.lineTo(px(3), pz(j + 2))
      c.stroke()
    }
    c.lineWidth = Math.max(1, W * 0.007)
    c.strokeRect(px(0) - W * 0.012, pz(0) - W * 0.012, px(8) - px(0) + W * 0.024, pz(9) - pz(0) + W * 0.024)
  }, 0, 1.9, 0))
  const piece = (x: number, y: number, z: number, side: string) => {
    g.add(puck(1.8, 1, '#f2dcb0', { x, y, z }))
    g.add(noOutline(torus(1.35, 0.1, side, { x, y: y + 1.02, z, rx: PI / 2 })))
    g.add(noOutline(rbox(1.1, 0.06, 0.25, side, { x, y: y + 1, z }, 0.03)), noOutline(rbox(0.25, 0.06, 1.1, side, { x, y: y + 1, z }, 0.03)))
  }
  for (const [i, j, r] of pieces) piece(x0 + i * gx, 1.6, z0 + j * gz, r ? red : black)
  // 被吃掉的子：在棋盘两侧叠成小摞（红方吃的黑子放红方右手边）
  for (const [s, n, col] of [[1, taken[0], black], [-1, taken[1], red]] as [number, number, string][])
    for (let k = 0; k < n; k++) piece(s * 23.5, Math.floor(k / 2) * 1, s * (8 + (k % 2) * 4), col)
  return fitGroup(g)
}
const XQ_MID: [number, number, boolean][] = [
  [4, 9, true], [3, 9, true], [5, 9, true], [0, 9, true], [2, 7, true], [6, 9, true], [8, 8, true], [4, 7, true], [1, 5, true], [0, 6, true], [4, 5, true], [6, 6, true], [8, 6, true],
  [4, 0, false], [3, 0, false], [5, 1, false], [8, 0, false], [2, 2, false], [6, 0, false], [1, 4, false], [7, 2, false], [0, 3, false], [4, 3, false], [6, 3, false], [8, 3, false],
]
const xqMid = (p: string[]) => xqState(p, XQ_MID, [5, 3])
const xqEnd = (p: string[]) => xqState(p, [[4, 9, true], [3, 8, true], [2, 2, true], [5, 4, true], [3, 0, false], [4, 1, false], [7, 6, false], [6, 5, false]], [10, 11])
/** 收在盒里：木盒（盖子画一个「楚河汉界」的方格）+ 卷起来的布棋盘 [棋盘木, 红方, 黑方] */
function xqBoxed(p: string[]) {
  const [board, red, black] = p
  const g = G(rbox(22, 5.6, 12, shade(board, -0.12), {}, 0.5), rbox(22.2, 0.9, 12.2, shade(board, -0.22), { y: 5.2 }, 0.3))
  g.add(paintTop(18, 8, `int-xq-lid-${board}`, (c, W, H) => {
    c.fillStyle = shade(board, 0.05)
    c.fillRect(0, 0, W, H)
    c.fillStyle = red
    c.beginPath()
    c.arc(W * 0.3, H / 2, H * 0.3, 0, PI * 2)
    c.fill()
    c.fillStyle = black
    c.beginPath()
    c.arc(W * 0.7, H / 2, H * 0.3, 0, PI * 2)
    c.fill()
  }, 0, 6.15, 0))
  g.add(cylX(2.2, 30, '#f2e6cc', 0, 2.2, 11), torus(2.25, 0.25, red, { x: -10, y: 2.2, z: 11, ry: PI / 2 }), torus(2.25, 0.25, red, { x: 10, y: 2.2, z: 11, ry: PI / 2 }))
  return fitGroup(g)
}

// ---------- 黑白棋 ----------

/** 黑白棋盘（同旧素材贴图）+ 棋子：cells = [i, j, 黑面朝上?]，i、j 为 0–7 [棋盘, 黑, 白] */
function reversiState(p: string[], cells: [number, number, boolean][]) {
  const [board, dark, light] = p
  const g = new THREE.Group()
  g.add(rbox(34, 1.6, 34, shade(board, -0.15), {}, 0.4))
  g.add(paintTop(32, 32, `int-reversi-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#1e2a1e'
    const lw = Math.max(1, W * 0.006)
    for (let i = 0; i <= 8; i++) {
      c.fillRect((i / 8) * (W - lw), 0, lw, H)
      c.fillRect(0, (i / 8) * (H - lw), W, lw)
    }
  }, 0, 1.9, 0))
  for (const [i, j, d] of cells) {
    const x = -14 + i * 4
    const z = -14 + j * 4
    g.add(cyl(1.6, 1.6, 0.2, d ? light : dark, { x, y: 1.9, z }, 20), cyl(1.6, 1.6, 0.2, d ? dark : light, { x, y: 2.1, z }, 20))
  }
  return fitGroup(g)
}
const reversiOpening = (p: string[]) => reversiState(p, [[3, 3, false], [4, 4, false], [3, 4, true], [4, 3, true]])
function reversiFull(p: string[]) {
  const r = rng(64)
  const cells: [number, number, boolean][] = []
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) cells.push([i, j, i + j * 0.6 + r() * 4 < 7])
  return reversiState(p, cells)
}
/** 收在盒里：扁方盒，盖上画着黑白棋子 [棋盘, 黑, 白] */
function reversiBoxed(p: string[]) {
  const [board, dark, light] = p
  const g = G(rbox(30, 4, 30, board, {}, 0.5), rbox(30.2, 0.8, 30.2, shade(board, -0.15), { y: 3.4 }, 0.3))
  g.add(paintTop(27, 27, `int-reversi-lid-${board}`, (c, W, H) => {
    c.fillStyle = board
    c.fillRect(0, 0, W, H)
    for (const [x, y, d] of [[0.38, 0.38, true], [0.62, 0.62, true], [0.62, 0.38, false], [0.38, 0.62, false]] as [number, number, boolean][]) {
      c.fillStyle = d ? dark : light
      c.beginPath()
      c.arc(x * W, y * H, W * 0.11, 0, PI * 2)
      c.fill()
    }
    c.fillStyle = light
    c.fillRect(W * 0.2, H * 0.86, W * 0.6, H * 0.03)
  }, 0, 4.25, 0))
  return fitGroup(g)
}

// ---------- 跳棋 ----------

/** 跳棋盘（同旧素材贴图），返回孔位 [盘色, 星色, 点缀] */
function ccBoard(g: THREE.Group, plate: string, star: string) {
  g.add(cyl(21.6, 21.6, 1.6, plate, {}, 48))
  const sp = 1.9
  const holes: V2[] = []
  const tri = (q: number, r: number) => [sp * (q + r / 2), sp * r * (Math.sqrt(3) / 2)] as V2
  for (let q = -8; q <= 8; q++)
    for (let r = -8; r <= 8; r++) {
      const s = -q - r
      const inA = q >= -4 && r >= -4 && s >= -4
      const inB = q <= 4 && r <= 4 && s <= 4
      if (inA || inB) holes.push(tri(q, r))
    }
  g.add(paintTop(30, 30, `int-cc-${plate}-${star}`, (c, W, H) => {
    c.fillStyle = plate
    c.fillRect(0, 0, W, H)
    c.fillStyle = star
    const k = W / 30
    const pts: V2[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + PI / 2
      const rr = i % 2 ? 7.6 : 14.4
      pts.push([W / 2 + Math.cos(a) * rr * k, H / 2 + Math.sin(a) * rr * k])
    }
    c.beginPath()
    c.moveTo(...pts[0])
    for (const pt of pts) c.lineTo(...pt)
    c.fill()
    c.fillStyle = shade(star, -0.3)
    for (const [x, z] of holes) {
      c.beginPath()
      c.arc(W / 2 + x * k, H / 2 + z * k, k * 0.45, 0, PI * 2)
      c.fill()
    }
  }, 0, 1.9, 0))
  return holes
}
/** 对局中：三方的弹珠都走出了一部分，散在星盘各处 */
function ccPlaying(p: string[]) {
  const [plate, star, acc] = p
  const g = new THREE.Group()
  const holes = ccBoard(g, plate, star)
  const cols = [acc, '#f0c030', '#3fa05a']
  const r = rng(31)
  const used = new Set<number>()
  for (let k = 0; k < 30; k++) {
    let h = Math.floor(r() * holes.length)
    while (used.has(h)) h = (h + 7) % holes.length
    used.add(h)
    const [x, z] = holes[h]
    g.add(ball(0.75, cols[k % 3], { x, y: 2.15, z }))
  }
  return fitGroup(g)
}
/** 收拾中：盘空了，弹珠都倒进旁边的小碗里 */
function ccTidy(p: string[]) {
  const [plate, star, acc] = p
  const g = new THREE.Group()
  ccBoard(g, plate, star)
  g.add(cup(5.5, 4, 4, 0.5, shade(plate, -0.1), { x: 27, z: 10 }))
  const cols = [acc, '#3d7fd0', '#f0c030', '#3fa05a', '#ffffff', '#26262a']
  for (let k = 0; k < 22; k++) {
    const a = k * 2.4
    const rr = Math.min(4, 0.9 * Math.sqrt(k))
    g.add(ball(0.75, cols[k % 6], { x: 27 + Math.cos(a) * rr, y: 1.3 + (k > 12 ? 1.2 : 0.2) + rr * 0.3, z: 10 + Math.sin(a) * rr }))
  }
  return fitGroup(g)
}

// ---------- 双陆棋 ----------

/** 打开的双陆棋盒（同旧素材贴图）+ 按点位摆子：points = [点位 1–24, 枚数, 己方?] [框, 三角, 棋子] */
function bgmState(p: string[], points: [number, number, boolean][], dice = true) {
  const [frame, tri, chk] = p
  const g = new THREE.Group()
  for (const s of [-1, 1]) g.add(tray(24, 2.4, 38, 1, frame, { x: s * 12.2 }))
  g.add(cylZ(0.5, 36, METAL, 0, 0.6, 0, 8))
  for (const s of [-1, 1])
    g.add(paintTop(21.8, 35.8, `int-bgm-${frame}-${tri}`, (c, W, H) => {
      c.fillStyle = shade(frame, 0.35)
      c.fillRect(0, 0, W, H)
      for (let i = 0; i < 6; i++) {
        for (const top of [true, false]) {
          c.fillStyle = (i + (top ? 0 : 1)) % 2 ? tri : '#f2e6cc'
          const x = (i / 6) * W
          c.beginPath()
          if (top) {
            c.moveTo(x, 0)
            c.lineTo(x + W / 6, 0)
            c.lineTo(x + W / 12, H * 0.42)
          } else {
            c.moveTo(x, H)
            c.lineTo(x + W / 6, H)
            c.lineTo(x + W / 12, H * 0.58)
          }
          c.fill()
        }
      }
    }, s * 12.2, 1.3, 0))
  const pw = 21.8 / 6
  const other = '#f4f4f2'
  for (const [pt, n, mine] of points) {
    // 1–6 右下、7–12 左下、13–18 左上、19–24 右上
    const side = pt <= 6 || pt >= 19 ? 1 : -1
    const top = pt >= 13
    const i = pt <= 6 ? 6 - pt : pt <= 12 ? 12 - pt : pt <= 18 ? pt - 13 : pt - 19
    const x = side * 12.2 - 10.9 + pw * (i + 0.5)
    for (let k = 0; k < n; k++) g.add(cyl(1.5, 1.5, 0.6, mine ? chk : other, { x, y: 1 + Math.floor(k / 5) * 0.6, z: (top ? -1 : 1) * (17.9 - 1.5 - (k % 5) * 3) }, 18))
  }
  if (dice) g.add(P(die(1.4, '#ffffff', '#26262a', 5, 3, 0.4), 5, 1, 0), P(die(1.4, '#ffffff', '#26262a', 1, 2, -0.3), 8, 1, 1.5))
  return fitGroup(g)
}
const bgmOpening = (p: string[]) =>
  bgmState(p, [[24, 2, true], [13, 5, true], [8, 3, true], [6, 5, true], [1, 2, false], [12, 5, false], [17, 3, false], [19, 5, false]], false)
/** 合上的双陆棋盒：手提箱样，盖面镶几道三角纹，前面搭扣、侧面提手 [框, 三角, 棋子] */
function bgmClosed(p: string[]) {
  const [frame, tri] = p
  const g = G(rbox(24.4, 2.6, 38, frame, {}, 0.6), rbox(24.4, 2.6, 38, shade(frame, -0.06), { y: 2.7 }, 0.6))
  g.add(paintTop(20, 33, `int-bgm-lid-${frame}-${tri}`, (c, W, H) => {
    c.fillStyle = shade(frame, 0.2)
    c.fillRect(0, 0, W, H)
    c.fillStyle = tri
    for (let i = 0; i < 6; i++) {
      c.beginPath()
      c.moveTo(0, (i / 6) * H)
      c.lineTo(W * 0.4, ((i + 0.5) / 6) * H)
      c.lineTo(0, ((i + 1) / 6) * H)
      c.fill()
      c.beginPath()
      c.moveTo(W, (i / 6) * H)
      c.lineTo(W * 0.6, ((i + 0.5) / 6) * H)
      c.lineTo(W, ((i + 1) / 6) * H)
      c.fill()
    }
  }, 0, 5.4, 0))
  for (const z of [-8, 8]) g.add(rbox(1, 2.6, 2.4, METAL, { x: 12.5, y: 1.4, z }, 0.3))
  g.add(cylZ(0.6, 10, METAL, -14, 2.7, 0, 8), rbox(2.6, 1, 1, METAL, { x: -13, y: 2.2, z: -5 }, 0.2), rbox(2.6, 1, 1, METAL, { x: -13, y: 2.2, z: 5 }, 0.2))
  return fitGroup(g)
}

// ---------- 扑克 ----------

/** 扑克牌背：白边 + 牌背色菱格 */
const pokerBack = (back: string): Draw => (c, W, H) => {
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, W, H)
  c.fillStyle = back
  c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
  c.strokeStyle = 'rgba(255,255,255,0.45)'
  c.lineWidth = Math.max(1, W * 0.02)
  for (let k = -6; k < 12; k++) {
    c.beginPath()
    c.moveTo(W * 0.08 + k * W * 0.12, H * 0.06)
    c.lineTo(W * 0.08 + (k + 6) * W * 0.12, H * 0.94)
    c.moveTo(W * 0.08 + (k + 6) * W * 0.12, H * 0.06)
    c.lineTo(W * 0.08 + k * W * 0.12, H * 0.94)
    c.stroke()
  }
}
/** 扑克牌盒：小纸盒，盒面一个大黑桃 */
function pokerBox(back: string, open = false) {
  const g = G(rbox(6.8, 2, 9.4, back, {}, 0.2))
  g.add(decal(paintTop(6.2, 8.8, `int-pokerbox-${back}`, (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffff'
    c.lineWidth = W * 0.04
    c.strokeRect(W * 0.1, H * 0.08, W * 0.8, H * 0.84)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${Math.floor(H * 0.4)}px serif`
    c.fillText('♠', W / 2, H * 0.52)
  }, 0, 2.02, 0)))
  if (open) g.add(rbox(6.8, 0.2, 3, back, { y: 0.9, z: 6, rx: 0.5 }, 0.08))
  return g
}
/** 筹码一摞 */
function chipStack(g: THREE.Group, x: number, z: number, n: number, c: string, stripe: string, y = 0) {
  g.add(cyl(2, 2, n * 0.34, c, { x, y, z }, 20))
  for (let k = 1; k < n; k += 2) g.add(noOutline(cyl(2.02, 2.02, 0.12, stripe, { x, y: y + k * 0.34, z }, 20)))
}
/** 收在盒里：扑克牌盒 + 合上的筹码箱 [桌垫, 牌背, 筹码主色] */
function pokerBoxed(p: string[]) {
  const [, back, chip] = p
  const g = new THREE.Group()
  g.add(P(pokerBox(back), -9, 0, 2, 0, 0.15))
  const cs = G(rbox(18, 6, 12, '#c8ccd2', {}, 0.8), rbox(18.2, 0.6, 12.2, '#9a9ea6', { y: 3 }, 0.2), rbox(6, 1.2, 1.2, '#26262a', { y: 2.2, z: 6.4 }, 0.4))
  cs.add(rbox(8, 0.3, 4, chip, { y: 6, z: -2 }, 0.1))
  g.add(P(cs, 5, 0, 0))
  return fitGroup(g)
}
/** 整副叠放：理齐的一副牌 + 打开的空盒 + 几摞筹码 [桌垫, 牌背, 筹码主色] */
function pokerDeck(p: string[]) {
  const [, back, chip] = p
  const g = new THREE.Group()
  g.add(P(cardStack(6.3, 8.8, 20, '#ffffff', back, `int-poker-deck-${back}`, pokerBack(back)), -4, 0, 0, 0, 0.1))
  g.add(P(pokerBox(back, true), 4.5, 0, -1, 0, -0.3))
  chipStack(g, 12, 3, 10, chip, '#ffffff')
  chipStack(g, 12.5, -2, 7, '#ffffff', chip)
  return fitGroup(g)
}
/** 发牌中：毡垫上牌堆居中，四家面前各发了两张（背面朝上），旁边是筹码 [桌垫, 牌背, 筹码主色] */
function pokerDealing(p: string[]) {
  const [mat, back, chip] = p
  const g = new THREE.Group()
  g.add(rbox(44, 0.3, 36, mat, {}, 0.15))
  const y = 0.3
  g.add(P(cardStack(6.3, 8.8, 14, '#ffffff', back, `int-poker-deck-${back}`, pokerBack(back)), 0, y, 0, 0, 0.3))
  const seats: [number, number, number][] = [[0, 12.5, 0], [17, 0, PI / 2], [0, -12.5, PI], [-17, 0, -PI / 2]]
  seats.forEach(([x, z, ry], i) => {
    for (let k = 0; k < 2; k++) {
      const cd = card(6.3, 8.8, '#ffffff', `int-pokerback-${back}`, pokerBack(back), 0.12)
      g.add(P(G(P(cd, (k - 0.5) * 3.2, k * 0.13, 0, 0, (k - 0.5) * 0.25)), x, y, z, 0, ry))
    }
    chipStack(g, x + (i % 2 ? 0 : 9) * (i === 2 ? -1 : 1), z + (i % 2 ? 9 : 0) * (i === 1 ? -1 : 1), 4 + i * 2, i % 2 ? '#ffffff' : chip, i % 2 ? chip : '#ffffff', y)
  })
  // 发到一半：一张牌正滑向下家
  g.add(P(card(6.3, 8.8, '#ffffff', `int-pokerback-${back}`, pokerBack(back), 0.12), 8, y, 5, 0, 1.1))
  return fitGroup(g)
}

// ---------- 花札 ----------

const hanaBack = (back: string): Draw => (c, W, H) => {
  c.fillStyle = back
  c.fillRect(0, 0, W, H)
}
/** 花札纸盒：一红一黑两盒（两副），盒面贴白色标签 */
function hanaBox(back: string, x: number, z: number, ry = 0) {
  const g = G(rbox(4.4, 2.6, 6.4, back, {}, 0.2))
  g.add(decal(paintTop(4, 6, `int-hanabox-${back}`, (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#f6f0e1'
    c.fillRect(W * 0.18, H * 0.18, W * 0.64, H * 0.64)
    c.fillStyle = '#c8302a'
    c.beginPath()
    c.arc(W / 2, H * 0.42, W * 0.16, 0, PI * 2)
    c.fill()
    c.fillStyle = '#26262a'
    c.fillRect(W * 0.3, H * 0.62, W * 0.4, H * 0.05)
  }, 0, 2.62, 0)))
  return P(g, x, 0, z, 0, ry)
}
/** 收在盒里：红黑两盒并排 [牌背, 主色, 点缀] */
function hanaBoxed(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(hanaBox(back, -2.6, 0, 0.05), hanaBox(back === '#26262a' ? '#c8302a' : '#26262a', 2.6, 0.3, -0.08))
  return fitGroup(g)
}
/** 整副叠放：理齐的一叠（48 张）+ 打开的空盒 [牌背, 主色, 点缀] */
function hanaStack(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(P(cardStack(3.3, 5.4, 22, '#26262a', back, `int-hana-back-${back}`, hanaBack(back)), -3, 0, 0, 0, 0.08))
  const box = G(tray(4.4, 2.2, 6.4, 0.3, back), rbox(4.4, 0.3, 6.4, back, { x: 4.6, z: 0 }, 0.1))
  g.add(P(box, 3.5, 0, 0.4, 0, -0.15))
  return fitGroup(g)
}
/** 发牌中：中间牌山，场上 8 张背面朝上两排，两家手里各 8 张背面朝上叠成扇形 [牌背, 主色, 点缀] */
function hanaDealing(p: string[]) {
  const [back] = p
  const g = new THREE.Group()
  g.add(P(cardStack(3.3, 5.4, 12, '#26262a', back, `int-hana-back-${back}`, hanaBack(back)), -9, 0, 0))
  const r = rng(5)
  for (let k = 0; k < 8; k++) g.add(P(card(3.3, 5.4, '#26262a', `int-hana-b1-${back}`, hanaBack(back), 0.08), -3 + (k % 4) * 4, 0, -3.2 + Math.floor(k / 4) * 6.4, 0, (r() - 0.5) * 0.2))
  for (const [z, ry] of [[10, 0], [-10, PI]] as [number, number][])
    for (let k = 0; k < 8; k++) g.add(P(G(P(card(3.3, 5.4, '#26262a', `int-hana-b1-${back}`, hanaBack(back), 0.08), 0, 0, -2.4)), (k - 3.5) * 1.3 * (ry ? -1 : 1), k * 0.09, z, 0, ry + (k - 3.5) * 0.12))
  return fitGroup(g)
}

// ---------- UNO 风卡牌 ----------

const unoBack = (back: string): Draw => (c, W, H) => {
  c.fillStyle = '#26262a'
  c.fillRect(0, 0, W, H)
  c.fillStyle = back
  c.beginPath()
  c.ellipse(W / 2, H / 2, W * 0.32, H * 0.38, 0.5, 0, PI * 2)
  c.fill()
}
/** 收在盒里：长方纸盒，盒面四色色块 [牌背, 桌垫] */
function unoBoxed(p: string[]) {
  const [back] = p
  const g = G(rbox(6.6, 3.4, 9.6, back, {}, 0.3))
  g.add(decal(paintTop(6.2, 9.2, `int-unobox-${back}`, (c, W, H) => {
    c.fillStyle = back
    c.fillRect(0, 0, W, H)
    UNO_COLS.forEach((col, i) => {
      c.fillStyle = col
      c.fillRect(W * (0.15 + (i % 2) * 0.36), H * (0.2 + Math.floor(i / 2) * 0.3), W * 0.34, H * 0.28)
    })
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.ellipse(W / 2, H * 0.5, W * 0.22, H * 0.12, -0.4, 0, PI * 2)
    c.fill()
  }, 0, 3.42, 0)))
  return fitGroup(g)
}
/** 发牌中：牌堆 + 翻开的第一张，三家面前各一叠 7 张背面朝上 [牌背, 桌垫] */
function unoDealing(p: string[]) {
  const [back, mat] = p
  const g = new THREE.Group()
  g.add(rbox(44, 0.3, 32, mat, {}, 0.15))
  const y = 0.3
  g.add(P(cardStack(5.7, 8.8, 26, '#ffffff', back, `int-uno-deal-${back}`, unoBack(back)), -3.5, y, 0))
  g.add(P(card(5.7, 8.8, '#ffffff', `int-pc-${UNO_COLS[2]}-7`, drawPlayCard(UNO_COLS[2], 7)), 3.5, y, 0, 0, 0.2))
  for (const [x, z, ry] of [[0, 10.5, 0], [-15, -4, PI / 2], [15, -4, -PI / 2]] as [number, number, number][])
    g.add(P(cardStack(5.7, 8.8, 7, '#ffffff', back, `int-uno-deal-${back}`, unoBack(back)), x, y, z, 0, ry + 0.1))
  return fitGroup(g)
}

// ---------- 百人一首 ----------

/** 收在盒里：黑漆盒，盖子一道彩色边 [榻榻米, 牌边, 字色] */
function karutaBoxed(p: string[]) {
  const [, edge, ink] = p
  const g = G(rbox(20, 6.4, 13.6, ink, {}, 0.6), rbox(20.3, 1.6, 13.9, edge, { y: 5.2 }, 0.4), rbox(20.1, 0.4, 13.7, ink, { y: 6.6 }, 0.2))
  g.add(paintTop(10, 5, `int-karuta-lid-${edge}`, (c, W, H) => {
    c.fillStyle = '#e3c06a'
    c.fillRect(0, 0, W, H)
    c.fillStyle = ink
    c.fillRect(W * 0.1, H * 0.4, W * 0.8, H * 0.2)
  }, 0, 7.02, 0))
  return fitGroup(g)
}
/** 整叠：读札（带画的那叠）和取札两叠理好，盒子开着放在旁边 [榻榻米, 牌边, 字色] */
function karutaStacks(p: string[]) {
  const [, edge, ink] = p
  const g = new THREE.Group()
  g.add(P(cardStack(5.3, 7.4, 36, edge, '#f6f0e1', `int-karuta-yomi-${edge}`, (c, W, H) => {
    c.fillStyle = edge
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#fbf6e8'
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = '#c8473a'
    c.beginPath()
    c.arc(W / 2, H * 0.32, W * 0.2, 0, PI * 2)
    c.fill()
    c.fillStyle = ink
    for (let k = 0; k < 3; k++) c.fillRect(W * (0.25 + k * 0.2), H * 0.55, W * 0.06, H * 0.32)
  }), -8, 0, 0, 0, 0.05))
  g.add(P(cardStack(5.3, 7.4, 36, edge, '#f6f0e1', `int-karuta-tori-${edge}`, (c, W, H) => {
    c.fillStyle = edge
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#fbf6e8'
    c.fillRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88)
    c.fillStyle = ink
    for (let k = 0; k < 3; k++) c.fillRect(W * (0.22 + k * 0.22), H * 0.14, W * 0.07, H * 0.7)
  }), -1.5, 0, 0.4, 0, -0.06))
  g.add(P(G(tray(20, 4, 13.6, 0.6, ink), rbox(0.6, 3.4, 12.4, ink, { y: 0.6 }, 0.2)), 12, 0, 0))
  return fitGroup(g)
}

// ---------- 麻将 ----------

/** 麻将桌本体（同旧素材）：桌面毡高 71.5 [桌框, 桌布] */
function mjTable(g: THREE.Group, frame: string, felt: string) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(5, 68, 5, frame, { x: sx * 38, z: sz * 38 }, 1))
  g.add(rbox(88, 3, 88, frame, { y: 68 }, 1))
  for (const s of [-1, 1]) {
    g.add(rbox(88, 2.4, 4, frame, { y: 71, z: s * 42 }, 0.8))
    g.add(rbox(4, 2.4, 80, frame, { x: s * 42, y: 71 }, 0.8))
  }
  g.add(rbox(80, 0.5, 80, felt, { y: 71 }, 0.2))
}
/** 洗牌用的散牌：背面朝上随意散在 (cx, cz) 周围半径 rad 的范围里 */
function mjScatter(g: THREE.Group, back: string, y: number, rad: number, n: number, seed: number) {
  const r = rng(seed)
  const step = 3.6
  const cells: V2[] = []
  for (let x = -rad; x <= rad; x += step) for (let z = -rad; z <= rad; z += step) if (Math.hypot(x, z) < rad) cells.push([x, z])
  for (let k = 0; k < Math.min(n, cells.length); k++) {
    const idx = Math.floor(r() * cells.length)
    const [x, z] = cells.splice(idx, 1)[0]
    const t = G(rbox(MJ_TW, 1.2, MJ_TH, IVORY, {}, 0.25), rbox(MJ_TW, 0.7, MJ_TH, back, { y: 1.2 }, 0.25))
    g.add(P(t, x + (r() - 0.5) * 0.8, y + (k % 4) * 0.01, z + (r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.7))
  }
}
/** 洗牌中：牌全部背面朝上散在桌中间 [桌框, 桌布, 牌背] */
function mjShuffle(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  mjTable(g, frame, felt)
  mjScatter(g, back, 71.5, 30, 110, 3)
  return g
}
/** 砌好牌墙：四面各 17 墩 × 2 层，中间两颗骰子 [桌框, 桌布, 牌背] */
function mjWalls(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  mjTable(g, frame, felt)
  mjRing(g, 17, back, 71.5, 5)
  g.add(rbox(9, 0.6, 9, DARK, { y: 71.5 }, 0.3))
  for (const [x, z] of [[-1.2, 0.5], [1.4, -0.8]] as V2[]) g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x, y: 72.1, z }, 0.3))
  return g
}
/** 和牌摊开：牌墙剩一部分，各家舍牌三排；和了的那家手牌 14 张推倒、牌面朝上，其余三家立着 [桌框, 桌布, 牌背] */
function mjWin(p: string[]) {
  const [frame, felt, back] = p
  const g = new THREE.Group()
  mjTable(g, frame, felt)
  const fy = 71.5
  const walls = [9, 5, 12, 7]
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group()
    side.add(P(mjWall(walls[k], back), -((17 - walls[k]) * MJ_TW) / 2, 0, 18))
    // 舍牌：三排 6 张，牌面朝上
    side.add(rbox(6 * MJ_TW, 0.7, 3 * MJ_TH, back, { z: 9 }, 0.25))
    side.add(rbox(6 * MJ_TW, 1.2, 3 * MJ_TH, IVORY, { y: 0.7, z: 9 }, 0.25))
    side.add(paintTop(6 * MJ_TW - 0.2, 3 * MJ_TH - 0.2, `int-mj-river3-${k}`, drawTiles(6, 3, 70 + k, IVORY), 0, 2.2, 9))
    const HL = (k === 0 ? 14 : 13) * MJ_TW
    if (k === 0) {
      // 推倒的手牌：平躺，牌面朝上
      side.add(rbox(HL, 0.7, MJ_TH, back, { z: 32.6 }, 0.25), rbox(HL, 1.2, MJ_TH, IVORY, { y: 0.7, z: 32.6 }, 0.25))
      side.add(paintTop(HL - 0.2, MJ_TH - 0.2, 'int-mj-win-hand', drawTiles(14, 1, 99, IVORY), 0, 1.92, 32.6))
    } else {
      side.add(rbox(HL, MJ_TH, 1.2, IVORY, { z: 33.4 }, 0.25))
      side.add(rbox(HL, MJ_TH, 0.7, back, { z: 32.45 }, 0.25))
      side.add(paintPanel(HL - 0.2, MJ_TH - 0.2, `int-mj-hand-${k}`, drawTiles(13, 1, 30 + k, IVORY), { y: 0.1, z: 34.3 }))
    }
    g.add(P(side, 0, fy, 0, 0, (k * PI) / 2))
  }
  g.add(rbox(9, 0.6, 9, DARK, { y: fy }, 0.3))
  return g
}

/** 麻将牌箱（皮面手提箱，合上）[桌垫, 牌背, 箱色] */
function mjCase(p: string[]) {
  const [, back, box] = p
  const g = G(rbox(38, 10, 24, box, {}, 1.2), rbox(38.2, 0.8, 24.2, shade(box, -0.2), { y: 6.4 }, 0.3))
  for (const x of [-12, 12]) g.add(rbox(3, 2.4, 0.8, METAL, { x, y: 5.4, z: 12.2 }, 0.3))
  g.add(P(torus(5, 0.7, shade(box, -0.25), {}, PI), 0, 10, 0))
  for (const x of [-5, 5]) g.add(rbox(2, 1, 2, METAL, { x, y: 10, z: 0 }, 0.3))
  g.add(rbox(6, 0.3, 3, back, { x: 0, y: 10, z: 7 }, 0.1))
  return fitGroup(g)
}
/** 牌垫上洗牌：方形毡垫，牌背面朝上散开 [桌垫, 牌背, 箱色] */
function mjMatShuffle(p: string[]) {
  const [mat, back] = p
  const g = G(rbox(70, 0.4, 70, mat, {}, 0.2))
  mjScatter(g, back, 0.4, 24, 80, 9)
  g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x: 30, y: 0.4, z: 30 }, 0.3), rbox(1.4, 1.4, 1.4, '#ffffff', { x: 28, y: 0.4, z: 31.5, ry: 0.5 }, 0.3))
  return fitGroup(g)
}
/** 牌垫上砌好牌墙：四面各 17 墩 [桌垫, 牌背, 箱色] */
function mjMatWalls(p: string[]) {
  const [mat, back] = p
  const g = G(rbox(70, 0.4, 70, mat, {}, 0.2))
  mjRing(g, 17, back, 0.4, 9)
  for (const [x, z] of [[-1.2, 0.5], [1.4, -0.8]] as V2[]) g.add(rbox(1.4, 1.4, 1.4, '#ffffff', { x, y: 0.4, z }, 0.3))
  return fitGroup(g)
}

// ---------- 素材声明 ----------

const CHESS_P: PalFlat[] = [['modern', '#3d3f44', '#f4f4f2', '#26262a'], ['retro', R.caramel, R.cream, '#5a3a24'], ['nordic', N.oak, N.white, '#5a5f66'], ['cute', C.woodL, C.white, C.pink]]
const GO_P: PalFlat[] = [['japanese', '#e8c87a', J.dark, J.sumi], ['japanese', J.hinoki, '#5a2e22', J.sumi], ['nordic', N.oak, N.white, '#3a3a3a']]
const SHOGI_P: PalFlat[] = [['japanese', '#e8c87a', '#f0d9a0', J.sumi], ['japanese', J.hinoki, '#f6e2b0', J.sumi], ['retro', R.caramel, R.cream, '#3a2a22']]
const MJ_P: PalFlat[] = [['retro', R.caramel, '#2f8a5a', R.orange], ['modern', '#26262a', '#3d6fb8', '#3d6fb8'], ['japanese', J.dark, '#3f7a4a', '#2f8a5a'], ['cute', C.woodL, C.mint, C.pink]]
const MJSET_P: PalFlat[] = [['retro', '#2f8a5a', R.orange, R.caramel], ['modern', '#3d6fb8', '#3d6fb8', '#26262a'], ['japanese', '#3f7a4a', '#2f8a5a', J.dark], ['cute', C.mint, C.pink, C.woodL]]
const POKER_P: PalFlat[] = [['retro', '#2f6a4a', '#c8473a', '#c8473a'], ['modern', '#26262a', '#3d6fb8', '#3d6fb8'], ['industrial', '#3a5a3c', '#7a2a22', I.rust]]
const UNO_P: PalFlat[] = [['retro', '#c8473a', '#2f6a4a'], ['modern', '#26262a', '#3d3f44'], ['cute', C.pink, C.sky]]
const XQ_P: PalFlat[] = [['retro', '#e8c87a', '#c8302a', '#26262a'], ['nordic', N.oakL, '#c8302a', '#26262a'], ['japanese', J.hinoki, '#c8302a', J.sumi]]
const REV_P: PalFlat[] = [['modern', '#3f8a4a', '#26262a', '#f4f4f2'], ['retro', '#2f7a4a', '#26262a', R.cream], ['cute', '#8fcf9a', '#5a4646', '#ffffff']]
const CC_P: PalFlat[] = [['retro', R.caramel, R.cream, R.red], ['nordic', N.oak, N.white, '#c8473a'], ['cute', C.woodL, C.sakura, C.pink]]
const BGM_P: PalFlat[] = [['retro', '#7a4a2a', R.red, R.red], ['industrial', I.walnut, '#3a3a3c', '#26262a'], ['nordic', N.oak, N.blue, N.blue]]
const HANA_P: PalFlat[] = [['japanese', '#c8302a', '#f2e6cc', J.shu], ['japanese', '#26262a', '#cfe0f0', '#8a4fb0'], ['retro', R.red, R.cream, R.mustard]]
const KARUTA_P: PalFlat[] = [['japanese', J.tatami, '#3a6a4a', J.sumi], ['japanese', '#d0d49a', '#c8302a', J.sumi], ['retro', '#c9c48a', R.teal, '#3a2a22']]

const st = (sizeLabel: string) => ({ ...PROP, sizeLabel })

export const INT_GAME_STATES: AssetDef[] = [
  // 国际象棋（旧：int-chess-opening = 开局、int-chess = 中盘）
  define('int-chess-boxed', '国际象棋', 'hobby', [30, 15, 7.5], CHESS_P, chessBoxed, st('收在盒里')),
  define('int-chess-folded', '国际象棋', 'hobby', [36, 19.1, 5.6], CHESS_P, chessFolded, st('棋盘合上')),
  define('int-chess-endgame', '国际象棋', 'hobby', [61.3, 36, 8.8], CHESS_P, chessEndgame, st('残局')),
  define('int-chess-study', '国际象棋', 'hobby', [64.4, 36, 8.8], CHESS_P, chessStudy, st('复盘摆谱')),
  define('int-chess-messy', '国际象棋', 'hobby', [63, 54.5, 8.8], CHESS_P, chessMessy, st('收拾中')),
  // 围棋（旧：int-go = 中盘）
  define('int-go-empty', '围棋', 'hobby', [74, 45.5, 9.8], GO_P, goEmpty, st('空盘 + 棋罐')),
  define('int-go-opening', '围棋', 'hobby', [74, 45.5, 9.6], GO_P, goOpening, st('布局')),
  define('int-go-counting', '围棋', 'hobby', [74, 45.5, 9.6], GO_P, goCounting, st('终局数子')),
  // 将棋（旧：int-shogi = 开局）
  define('int-shogi-mid', '将棋', 'hobby', [66, 36.4, 4.9], SHOGI_P, shogiMid, st('中盘（持驹）')),
  define('int-shogi-tsume', '将棋', 'hobby', [49.6, 57, 4.9], SHOGI_P, shogiTsume, st('诘将棋')),
  define('int-shogi-boxed', '将棋', 'hobby', [33.3, 36.4, 8.5], SHOGI_P, shogiBoxed, st('收好（驹箱）')),
  // 中国象棋（旧：int-xiangqi = 开局）
  define('int-xiangqi-mid', '中国象棋', 'hobby', [50.6, 44, 3.1], XQ_P, xqMid, st('中盘')),
  define('int-xiangqi-end', '中国象棋', 'hobby', [50.6, 44, 6.1], XQ_P, xqEnd, st('残局')),
  define('int-xiangqi-boxed', '中国象棋', 'hobby', [30, 19.6, 6.5], XQ_P, xqBoxed, st('收在盒里')),
  // 黑白棋（旧：int-reversi = 中盘）
  define('int-reversi-opening', '黑白棋', 'hobby', [34, 34, 2.3], REV_P, reversiOpening, st('开局四子')),
  define('int-reversi-full', '黑白棋', 'hobby', [34, 34, 2.3], REV_P, reversiFull, st('终局铺满')),
  define('int-reversi-boxed', '黑白棋', 'hobby', [30.2, 30.2, 4.3], REV_P, reversiBoxed, st('收在盒里')),
  // 跳棋（旧：int-chinese-checkers = 开局）
  define('int-chinese-checkers-playing', '跳棋', 'hobby', [43.2, 43.2, 2.9], CC_P, ccPlaying, st('对局中')),
  define('int-chinese-checkers-tidy', '跳棋', 'hobby', [54.1, 43.2, 4.5], CC_P, ccTidy, st('收拾中')),
  // 双陆棋（旧：int-backgammon = 对局中）
  define('int-backgammon-opening', '双陆棋', 'hobby', [48.4, 38, 2.4], BGM_P, bgmOpening, st('开局')),
  define('int-backgammon-closed', '双陆棋', 'hobby', [27.6, 38, 5.4], BGM_P, bgmClosed, st('合上')),
  // 扑克（旧：int-poker = 对局中）
  define('int-poker-boxed', '扑克牌', 'hobby', [27.1, 13.2, 6.3], POKER_P, pokerBoxed, st('收在盒里')),
  define('int-poker-deck', '扑克牌', 'hobby', [22.1, 13.4, 3.4], POKER_P, pokerDeck, st('整副叠放')),
  define('int-poker-dealing', '扑克牌', 'hobby', [44, 36, 3.7], POKER_P, pokerDealing, st('发牌中')),
  // 花札（旧：int-hanafuda = 对局中）
  define('int-hanafuda-boxed', '花札', 'japanese', [10, 6.9, 2.6], HANA_P, hanaBoxed, st('收在盒里')),
  define('int-hanafuda-stack', '花札', 'japanese', [15.5, 7.6, 2.2], HANA_P, hanaStack, st('整副叠放')),
  define('int-hanafuda-dealing', '花札', 'japanese', [21.5, 21.9, 1], HANA_P, hanaDealing, st('发牌中')),
  // UNO 风卡牌（旧：int-uno-cards = 一副 + 摊开、int-card-game = 对局中）
  define('int-uno-boxed', '彩色数字卡牌', 'hobby', [6.6, 9.6, 3.4], UNO_P, unoBoxed, st('收在盒里')),
  define('int-uno-dealing', '彩色数字卡牌', 'hobby', [44, 32, 2.4], UNO_P, unoDealing, st('发牌中')),
  // 百人一首（旧：int-karuta = 摆开对局）
  define('int-karuta-boxed', '百人一首（かるた）', 'japanese', [20.3, 13.9, 7], KARUTA_P, karutaBoxed, st('收在盒里')),
  define('int-karuta-stack', '百人一首（かるた）', 'japanese', [32.8, 13.6, 4], KARUTA_P, karutaStacks, st('整叠')),
  // 自动麻将桌（旧：int-mahjong-table = 打牌中）
  define('int-mahjong-shuffle', '自动麻将桌', 'hobby', [88, 88, 73.4], MJ_P, mjShuffle, { surface: 71.5, sizeLabel: '洗牌中' }),
  define('int-mahjong-walls', '自动麻将桌', 'hobby', [88, 88, 75.3], MJ_P, mjWalls, { surface: 71.5, sizeLabel: '砌好牌墙' }),
  define('int-mahjong-win', '自动麻将桌', 'hobby', [88, 88, 75.3], MJ_P, mjWin, { surface: 71.5, sizeLabel: '和牌摊开' }),
  // 麻将牌（桌面用）
  define('int-mahjong-case', '麻将牌', 'hobby', [38.2, 24.7, 15.7], MJSET_P, mjCase, st('收在牌箱里')),
  define('int-mahjong-mat-shuffle', '麻将牌', 'hobby', [70, 70, 2.3], MJSET_P, mjMatShuffle, st('牌垫上洗牌')),
  define('int-mahjong-mat-walls', '麻将牌', 'hobby', [70, 70, 4.2], MJSET_P, mjMatWalls, st('牌垫上砌牌墙')),
]
