// 界面图标的集中映射：语义名 → 图标对象（@jannchie/icons 的 { name, draw }），模板里用 <JIcon :icon="ICONS.undo" />。
// 组件不直接 import IconXxx，统一从这里取：以后换图标只改这一个文件。
//
// 标了「新增」的是为本项目补进 jannchie-icons 的图标（v0.11.0 发布）。
import type { Icon } from '@jannchie/icons'
import {
  IconAirConditioner,
  IconAlertCircle,
  IconBathtub,
  IconBed,
  IconBookOpen,
  IconBroom,
  IconCamera,
  IconCameraFilm,
  IconCameraRotate,
  IconCheck,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconCompass,
  IconColorFilter,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconShare,
  IconCube,
  IconCursor,
  IconCursorClick,
  IconDicePair,
  IconDots,
  IconDiorama,
  IconDoor,
  IconDumbbell,
  IconEdit,
  IconExport,
  IconEye,
  IconFilePlus,
  IconFileTypePng,
  IconFolderOpen,
  IconGithub,
  IconFitToScreen,
  IconFocus,
  IconKeyboard,
  IconLightbulb,
  IconLink,
  IconLoader,
  IconSearchMinus,
  IconSearchPlus,
  IconGuitar,
  IconHeart,
  IconHistory,
  IconHomeHeart,
  IconImport,
  IconJson,
  IconLanguages,
  IconLayers,
  IconStairs,
  IconStairsUp,
  IconDashedCircle,
  IconLayoutRows,
  IconHome,
  IconBuilding,
  IconLayoutGrid,
  IconListCheck,
  IconMagnet,
  IconMapPin,
  IconPalette,
  IconPause,
  IconPaw,
  IconPentagon,
  IconPlay,
  IconPlug,
  IconPlus,
  IconPuzzle,
  IconRectangleHorizontal,
  IconRedo,
  IconRefresh,
  IconRefrigerator,
  IconReset,
  IconRotate,
  IconRotateCcw,
  IconSave,
  IconScreenshot,
  IconSearch,
  IconShoe,
  IconShuffle,
  IconSliders,
  IconSofa,
  IconSunrise,
  IconToilet,
  IconTorii,
  IconTrash,
  IconTreePine,
  IconTv,
  IconUndo,
  IconUser,
  IconUsers,
  IconUtensils,
  IconWand,
  IconWashingMachine,
  IconWrench,
  IconX,
} from '@jannchie/icons'
import {
  IconAirConditionerOutdoor,
  IconBalcony,
  IconBarn,
  IconCastle,
  IconPagoda,
  IconChair,
  IconCookingPot,
  IconCurtain,
  IconDesk,
  IconFloorPlan,
  IconFloorPlanSparkle,
  IconHallway,
  IconLampFloor,
  IconPictureFrame,
  IconPipe,
  IconPottedPlant,
  IconPumpBottle,
  IconSofaSparkle,
  IconStove,
  IconTatami,
  IconTeddyBear,
  IconVase,
  IconWall,
  IconWallHalf,
  IconWallLowered,
  IconWallpaper,
  IconWallsLowered,
  IconWallTransparent,
  IconWallTrim,
  IconWardrobe,
  IconWashbasin,
  IconWindowPane,
} from '@jannchie/icons'
import type { FixtureKind, RoomKind } from '../model'
import type { Tool, ViewMode, WallMode } from '../store'
import type { AssetCategory, StyleTag } from '../three/kit'
import type { Household } from '../household'

export type AppIcon = Icon<string>

/** 通用操作（顶栏、侧栏、检查器里的按钮） */
export const ICONS = {
  // 历史
  undo: IconUndo,
  redo: IconRedo,
  // 文件
  newPlan: IconFilePlus,
  import: IconImport,
  export: IconExport,
  exportJson: IconJson,
  exportPng: IconFileTypePng,
  // 分享链接（户型压进地址）
  shareLink: IconLink,
  share: IconShare,
  copy: IconCopy,
  // 我的户型（浏览器里保存的多份户型）
  save: IconSave,
  savedPlans: IconFolderOpen,
  restore: IconHistory, // 自动快照 / 恢复
  rename: IconEdit,
  close: IconX,
  // 户型生成
  generate: IconFloorPlanSparkle, // 新增：随机生成户型
  random: IconDicePair, // 骰子：种子 / 随机
  generateOptions: IconSliders, // 生成参数
  autoFurnishToggle: IconSofaSparkle, // 新增：「带家具」开关
  // 视图
  fit: IconFitToScreen,
  screenshot: IconScreenshot,
  screenshotPng: IconCamera,
  resetView: IconCameraRotate,
  autoRotate: IconRotate,
  look: IconColorFilter, // 3D 沙盘的画面效果（后处理滤镜）
  // 3D 沙盘：时间与太阳
  sky: IconSunrise, // 时间光照小节
  timeOfDay: IconClock, // 时刻滑杆
  date: IconCalendar, // 月日
  location: IconMapPin, // 城市 / 经纬度
  north: IconCompass, // 户型朝向（指北针）
  indoorLight: IconLightbulb, // 室内灯光开关 / 色温
  play: IconPlay, // 时间流逝动画
  pause: IconPause,
  language: IconLanguages,
  // 3D 沙盘：布置 / 预览
  modeEdit: IconEdit,
  modePreview: IconEye,
  // 3D 沙盘的「外观」视图：屋顶、外墙全高
  exteriorView: IconBuilding,
  // 3D 沙盘：一键布置 / 清空 / 吸附 / 跟随鼠标
  autoFurnish: IconSofaSparkle, // 新增
  clearFurniture: IconBroom,
  snap: IconMagnet,
  followCursor: IconCursorClick,
  wallHeight: IconWallHalf, // 新增：墙高滑块
  // 住户 / 家电 / 墙纸 / 边饰 / 窗帘
  household: IconUsers,
  rerollHousehold: IconShuffle,
  appliances: IconPlug,
  wallpaper: IconWallpaper, // 新增
  wallpaperRandom: IconShuffle,
  wallpaperDefault: IconReset,
  trim: IconWallTrim, // 新增：边饰（踢脚线 / 腰壁 / 护墙板 / 顶角线）
  curtain: IconCurtain, // 新增
  // 检查清单
  checklist: IconListCheck,
  checkOk: IconCheckCircle,
  checkMissing: IconAlertCircle,
  checkFixAll: IconWand,
  checkFixOne: IconPlus,
  check: IconCheck,
  expand: IconChevronDown,
  collapse: IconChevronUp,
  // 选中物体
  rotateCw: IconRotate,
  rotateCcw: IconRotateCcw,
  duplicate: IconCopy,
  delete: IconTrash,
  color: IconPalette,
  pattern: IconLayoutGrid, // 布艺花纹
  shuffle: IconShuffle, // 随机配色 / 随机花纹 / 重排
  reset: IconReset,
  // 素材库
  search: IconSearch,
  allCategories: IconLayers,
  floors: IconLayers, // 楼层
  floorAdd: IconPlus,
  floorUp: IconStairsUp,
  floorAll: IconHome, // 楼层显示：全部
  floorUpto: IconStairsUp, // 只到当前层
  floorExplode: IconLayoutRows, // 分层拉开
  placeInSandbox: IconDiorama,
  // 门窗
  doorFlip: IconDoor,
  tidyDoors: IconWand,
  // 操作感：快捷键帮助、聚焦、缩放、加载、新手提示
  keyboard: IconKeyboard,
  focus: IconFocus, // 双击 / 菜单：镜头聚焦到家具
  zoomIn: IconSearchPlus,
  zoomOut: IconSearchMinus,
  loading: IconLoader,
  tip: IconLightbulb,
  // 手机 / 平板：顶栏「更多」菜单、PWA 新版本提示
  more: IconDots,
  refresh: IconRefresh,
  github: IconGithub, // 项目仓库链接
  // 内置收纳（3D 里选中时的卡片）
  builtin: IconWardrobe,
  changelog: IconHistory, // 更新日志
} satisfies Record<string, AppIcon>

/** 顶栏视图切换 */
export const VIEW_ICONS = {
  '2d': IconFloorPlan, // 新增：平面图
  '3d': IconDiorama, // 3D 沙盘
  lib: IconSofa, // 素材库
} satisfies Record<ViewMode, AppIcon>

/** 平面图工具 */
export const TOOL_ICONS = {
  select: IconCursor,
  rect: IconRectangleHorizontal,
  poly: IconPentagon,
  door: IconDoor,
  window: IconWindowPane, // 新增：建筑立面的窗（界面里的 window 是应用窗口）
  fixture: IconBathtub, // 设备（卫浴 / 厨房 / 家电位）
} satisfies Record<Tool, AppIcon>

/** 3D 沙盘墙体显示模式 */
export const WALL_MODE_ICONS = {
  up: IconWall, // 新增：完整
  fade: IconWallTransparent, // 新增：前墙透明
  cut: IconWallLowered, // 新增：前墙压低
  half: IconWallHalf, // 新增：内墙半墙
  down: IconWallsLowered, // 新增：全部压低
} satisfies Record<WallMode, AppIcon>

/** 房间类型（检查器的类型下拉、平面图图例） */
export const ROOM_ICONS = {
  ldk: IconSofa,
  kitchen: IconStove, // 新增
  dining: IconChair,
  western: IconBed,
  japanese: IconTatami, // 新增
  wash: IconWashbasin, // 新增
  bath: IconBathtub,
  toilet: IconToilet,
  hall: IconHallway, // 新增
  entrance: IconShoe,
  storage: IconWardrobe, // 新增
  balcony: IconBalcony, // 新增
  void: IconDashedCircle, // 挑空（多层户型）
  other: IconCube,
} satisfies Record<RoomKind, AppIcon>

/** 设备（FIXTURES） */
export const FIXTURE_ICONS = {
  kitchen: IconStove, // 新增
  bathtub: IconBathtub,
  toilet: IconToilet,
  basin: IconWashbasin, // 新增
  washer: IconWashingMachine,
  fridge: IconRefrigerator,
  ps: IconPipe, // 新增：PS 管道井
  outdoor: IconAirConditionerOutdoor, // 新增：空调外机
  builtin: IconWardrobe, // 新增：内置收纳
  stairs: IconStairs, // 楼梯（多层户型）
} satisfies Record<FixtureKind, AppIcon>

/** 素材分类（CATEGORY_LABELS） */
export const CATEGORY_ICONS = {
  living: IconSofa,
  dining: IconChair, // 新增
  bedroom: IconBed,
  study: IconDesk, // 新增
  kids: IconTeddyBear, // 新增
  japanese: IconTorii,
  storage: IconWardrobe, // 新增
  plants: IconPottedPlant, // 新增
  lighting: IconLampFloor, // 新增
  tabletop: IconVase, // 新增
  kitchenware: IconCookingPot, // 新增
  toiletry: IconPumpBottle, // 新增
  deco: IconPictureFrame, // 新增
  pets: IconPaw,
  fitness: IconDumbbell,
  hobby: IconPuzzle,
  music: IconGuitar,
  entrance: IconShoe,
  outdoor: IconBalcony, // 新增
  appliance: IconTv,
} satisfies Record<AssetCategory, AppIcon>

/** 风格标签（STYLE_LABELS，可选） */
export const STYLE_ICONS = {
  cute: IconHeart,
  nordic: IconTreePine,
  modern: IconCube,
  japanese: IconTorii,
  industrial: IconWrench,
  retro: IconCameraFilm,
  chinese: IconPagoda,
  classic: IconCastle,
  farmhouse: IconBarn,
} satisfies Record<StyleTag, AppIcon>

/** 住户类型（KIND_LABELS，可选） */
export const HOUSEHOLD_ICONS = {
  single: IconUser,
  couple: IconHeart,
  family: IconHomeHeart,
  'three-gen': IconUsers,
  roommates: IconUsers,
} satisfies Record<Household['kind'], AppIcon>

/** 其他可能用到的家居图标（家电面板、检查清单条目等） */
export const MISC_ICONS = {
  airConditioner: IconAirConditioner,
  utensils: IconUtensils,
  book: IconBookOpen,
} satisfies Record<string, AppIcon>
