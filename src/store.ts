import { computed, reactive, ref, toRaw, watch } from 'vue'
import { orientDoors } from './doors'
import { migrateAppliances } from './appliance'
import { migrateCabinets, migrateOpenForms, setOpen } from './cabinet'
import { applyFixesHouse, decorateHouse, roomStyles } from './decorate'
import { autoWallpapers } from './wallpaper'
import type { CheckItem } from './checklist'
import { generateHousehold } from './household'
import { propsOn } from './surface'
import { applyFixtureCarry, captureFixtureProps, mirrorFixtureCarry } from './fixtureCarry'
import { ASSET_MAP, STYLE_LABELS } from './three/assets'
import { fitResize } from './resizeFit'
import { furnitureRoom, restyleFurniture } from './restyle'
import type { StyleTag } from './three/kit'
import type { LookAdjust } from './three/post'
import type { PatternSpec } from './three/patterns'
import { CITIES, DEFAULT_GEO, type Geo } from './three/sky'
import { DEFAULT_KELVIN, DEFAULT_OUTDOOR, DEFAULT_POWER, DEFAULT_RANGE, OUTDOOR_MAX, OUTDOOR_MIN, POWER_MAX, POWER_MIN, RANGE_MAX, RANGE_MIN, clampKelvin, isLightMode, type LightMode } from './three/lights'
import { ensureOutdoorUnits as ensureOutdoorUnits1, indoorUnits, planArea, randomSeed, type GenOptions } from './generate'
import { generatePlan } from './generate-region'
import { lang, t } from './i18n'
import { initialRoute } from './router'
import { edgeInfo, emptyPlan, projectToSegment, type Fixture, type FixtureKind, type Floor, type Flooring, type Furniture, type Opening, type Plan, type Room, type Vec, type Wallpaper, type Exterior, type ParkingSpot, type Site, uid } from './model'
import { makeRoomForPorch, normalizeExterior, styleExterior } from './exterior'
import { normalizeWindow } from './windows'
import { normalizeDoor } from './doorStyles'
import { yardFurniture } from './yard'
import { STAIRS_SIZE } from './stairs'
import { BASE_FLOOR_ID, SLAB, baseFloorId, floorBelow, floorById, floorOf, floorOutline, floorView, isMultiFloor, nextFloorId, normalizeFloors, planFloors, stampFloor } from './floors'

export type Tool = 'select' | 'rect' | 'poly' | 'door' | 'window' | 'fixture'

export type Selection =
  | { type: 'room'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'fixture'; id: string }
  | { type: 'furniture'; id: string }
  | { type: 'vertex'; roomId: string; index: number }
  | null

const STORAGE_KEY = 'my-home:plan'
const LOOK_KEY = 'my-home:look'
const SKY_KEY = 'my-home:sky'
const LIGHTS_KEY = 'my-home:lights'
const FOV_KEY = 'my-home:fov'
const FX_KEY = 'my-home:fx'
const LOOK_ADJ_KEY = 'my-home:look-adjust'
// 画面增强的默认值（loadFx 在 sandbox 初始化时就会调用，常量要放在它前面）
const FX_DEFAULT: SandboxFx = { ao: 'walk', reflect: 'walk', volumetric: true }
const isFxMode = (v: unknown): v is FxMode => v === 'off' || v === 'walk' || v === 'always'

/** 校验并补全旧版本数据（早期没有 fixtures / furniture） */
export function normalizePlan(p: Plan): Plan | null {
  if (p?.version !== 1 || !Array.isArray(p.rooms)) return null
  p.openings ??= []
  p.fixtures ??= []
  p.furniture ??= []
  // 早期数据只有一种墙厚
  p.wallOuter ??= Math.max(18, Math.round(p.wall * 1.5))
  // 冰箱、洗衣机以前是带款式 / 颜色的设备：换成摆在冰箱位 / 洗衣机位上的同款家具
  migrateAppliances(p)
  // 收纳位以前自己画柜子：换成摆在位上的同类柜子家具（柜门开关照旧）
  migrateCabinets(p)
  // 以前用「打开」形态的另一件素材表示开着的柜子：换成同一件素材 + open
  migrateOpenForms(p)
  for (const f of p.furniture) if (f.open !== undefined && f.open !== true) delete f.open
  // 灯光开关 / 色温：缺省 = 自动、跟随全局；坏数据去掉
  for (const r of p.rooms) {
    if (r.light !== undefined && (!isLightMode(r.light) || r.light === 'auto')) delete r.light
    if (r.lightK !== undefined) {
      if (Number.isFinite(r.lightK)) r.lightK = clampKelvin(r.lightK)
      else delete r.lightK
    }
    if (r.ownLights !== undefined && r.ownLights !== true) delete r.ownLights
  }
  for (const f of p.furniture) if (f.light !== undefined && f.light !== 'on' && f.light !== 'off') delete f.light
  for (const f of p.furniture) if (f.art !== undefined && (typeof f.art !== 'string' || !f.art)) delete f.art
  for (const f of p.furniture) if (f.spin !== undefined && (typeof f.spin !== 'number' || !Number.isFinite(f.spin) || !f.spin)) delete f.spin
  // 楼层：没有 floors 的是单层户型（旧存档都是），物件的 floor 一律删掉；坏数据整理掉
  normalizeFloors(p)
  // 窗的款式：坏值、缺省值去掉（门上不带窗字段）
  for (const o of p.openings) normalizeWindow(o)
  // 门的款式：同上（窗上不带门字段）
  for (const o of p.openings) normalizeDoor(o)
  // 户建的用地 / 外观：坏数据整理掉
  normalizeExterior(p)
  return p
}

function load(): Plan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizePlan(JSON.parse(raw))
  } catch {
    return null
  }
}

// ---------- 默认地区：跟随界面语言（中文 → 中式、日文 → 日式、英文 → 欧美），用户在生成选项里选过就记住 ----------
const REGION_KEY = 'my-home:region'
type GenRegion = NonNullable<GenOptions['region']>
function regionForLang(l: string): GenRegion {
  return l === 'zh' ? 'cn' : l === 'en' ? 'west' : 'jp'
}
function initialRegion(): GenRegion {
  try {
    const saved = localStorage.getItem(REGION_KEY)
    if (saved) return saved as GenRegion
  } catch {
    /* 隐私模式等：读不到就按语言 */
  }
  return regionForLang(lang.value)
}
/** 用户在生成选项里手动选了地区：记住，之后不再跟随语言 */
export function chooseRegion(r: GenRegion) {
  genOptions.region = r
  try {
    localStorage.setItem(REGION_KEY, r)
  } catch {
    /* 存不了就只在本次生效 */
  }
}
// 没手动选过时，切换语言也跟着换默认地区
watch(lang, (l) => {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(REGION_KEY)
  } catch {
    /* ignore */
  }
  if (!saved) genOptions.region = regionForLang(l)
})

export const genOptions = reactive<GenOptions>({
  seed: randomSeed(),
  type: 'random',
  style: 'random',
  corner: 'random',
  access: 'random',
  minArea: null,
  maxArea: null,
  region: initialRegion(),
  bedrooms: 'random',
  dwelling: 'random',
})

/** 生成结果提示（面积没满足时） */
export const genMessage = ref('')

const loaded = load()
/** 启动时没有自动保存的户型（第一次来 / 清过数据），当前户型是随手生成的：打开分享链接时不用确认 */
export const bootFresh = !loaded
export const plan = ref<Plan>(loaded ?? generatePlan(genOptions).plan)
export const selection = ref<Selection>(null)
export const tool = ref<Tool>('select')

// ---------- 楼层：平面图和 3D 沙盘共用「当前楼层」 ----------

/** 正在编辑的楼层 id（不存在时退回最底层，见 activeFloor） */
export const currentFloor = ref<string>(BASE_FLOOR_ID)
/** 当前楼层（总是户型里存在的一层） */
export const activeFloor = computed(() => (floorById(plan.value, currentFloor.value) ? currentFloor.value : baseFloorId(plan.value)))
/** 当前楼层的子户型（单层户型就是 plan 本身）：平面图的绘制、吸附、选中都只看它 */
export const floorPlan = computed(() => floorView(plan.value, activeFloor.value))
/** 3D 沙盘的楼层显示：all 全部 / upto 只显示到当前层 / explode 分层拉开 */
export type FloorShow = 'all' | 'upto' | 'explode'
export const FLOOR_SHOWS: { id: FloorShow; label: string }[] = [
  { id: 'all', label: '全部楼层' },
  { id: 'upto', label: '只到当前层' },
  { id: 'explode', label: '分层拉开' },
]
export const floorShow = ref<FloorShow>('upto')

/** 选中的东西所在楼层（没有选中返回 null） */
function selectionFloor(): string | null {
  const s = selection.value
  if (!s) return null
  const p = plan.value
  if (s.type === 'opening') {
    const o = p.openings.find((x) => x.id === s.id)
    return o ? floorOf(p, findRoom(o.roomId) ?? {}) : null
  }
  const item = s.type === 'room' ? findRoom(s.id) : s.type === 'vertex' ? findRoom(s.roomId) : s.type === 'fixture' ? findFixture(s.id) : findFurniture(s.id)
  return item ? floorOf(p, item) : null
}

/** 切换当前楼层：选中的东西不在这一层就取消选中 */
export function setFloor(id: string) {
  if (!floorById(plan.value, id)) return
  currentFloor.value = id
  if (selection.value && selectionFloor() !== id) selection.value = null
}

/** 新物件打上当前楼层 */
const onActive = <T extends { floor?: string }>(x: T) => stampFloor(plan.value, x, activeFloor.value)

/**
 * 加一层（放在最上面）：层高照抄最上一层，地面 = 最上层天花 + 楼板厚；默认把下层的外轮廓复制成一个大房间（走廊），
 * 之后再在里面隔房间。单层户型第一次加层时补上楼层表（原来的那层成为 1F）。
 */
export function addFloor() {
  mutate((p) => {
    const fs = planFloors(p).map((f) => ({ ...f }))
    const top = fs[fs.length - 1]
    const id = nextFloorId({ floors: fs })
    const f: Floor = { id, name: id.toUpperCase(), elevation: top.elevation + top.height + SLAB, height: top.height }
    p.floors = [...fs, f]
    const outline = floorOutline(floorView(toRaw(p), top.id).rooms)
    if (outline) p.rooms.push({ id: uid('r'), name: '廊下', kind: 'hall', points: outline, floor: id })
    currentFloor.value = id
  })
  selection.value = null
}

/** 删掉一层（最底层不能删）：这一层的房间、门窗、设备、家具一起删；只剩一层时变回单层户型 */
export function deleteFloor(id: string) {
  const p0 = plan.value
  if (!isMultiFloor(p0) || id === baseFloorId(p0)) return
  const below = floorBelow(p0, id)?.id
  mutate((p) => {
    const gone = new Set(p.rooms.filter((r) => r.floor === id).map((r) => r.id))
    p.rooms = p.rooms.filter((r) => r.floor !== id)
    p.openings = p.openings.filter((o) => !gone.has(o.roomId))
    p.fixtures = p.fixtures.filter((f) => f.floor !== id)
    p.furniture = p.furniture.filter((f) => f.floor !== id)
    p.floors = p.floors!.filter((f) => f.id !== id)
    // 上面的楼层落下来补上空出的高度
    restack(p)
    normalizeFloors(p)
  })
  currentFloor.value = below ?? baseFloorId(plan.value)
  selection.value = null
}

/** 楼层重新叠放：每层地面 = 下一层天花 + 楼板厚 */
function restack(p: Plan) {
  const fs = p.floors
  if (!fs) return
  for (let i = 1; i < fs.length; i++) fs[i].elevation = fs[i - 1].elevation + fs[i - 1].height + SLAB
}

export function renameFloor(id: string, name: string) {
  const f = plan.value.floors?.find((x) => x.id === id)
  const n = name.trim()
  if (!f || !n || f.name === n) return
  mutate(() => (f.name = n))
}

/** 改层高（墙高）：上面的楼层跟着升降 */
export function setFloorHeight(id: string, h: number) {
  const f = plan.value.floors?.find((x) => x.id === id)
  const v = Math.round(Math.min(400, Math.max(200, h)))
  if (!f || f.height === v) return
  mutate((p) => {
    f.height = v
    restack(p)
  })
}

/** 把下一层的外轮廓复制到当前楼层（一个房间）；没有下一层或下一层是空的就不做 */
export function copyOutlineFromBelow() {
  const p = plan.value
  const below = floorBelow(p, activeFloor.value)
  if (!below) return
  const outline = floorOutline(floorView(toRaw(p), below.id).rooms)
  if (!outline) return
  addRoom({ name: '廊下', kind: 'hall', points: outline })
}
/** 设备工具当前要放的种类 */
export const placeKind = ref<FixtureKind>('kitchen')
/** 放设备：没有贴墙时预览的手动旋转（贴墙时朝向由墙决定） */
export const placeRot = ref(0)
/** 放设备：放下后留在放置模式，接着放同一种 */
export const placeContinuous = ref(false)
/** 设备面板（选要放的设备）开着 */
export const placePicker = ref(false)
export const settings = reactive({ grid: 10, snap: true })

/** 主视图：2D 平面图 / 3D 沙盘 / 素材库 */
export type ViewMode = '2d' | '3d' | 'lib'
/** 初值取自地址（/en/3d、/library…，见 router.ts）；之后由 router 双向同步 */
export const viewMode = ref<ViewMode>(initialRoute.view)
/** 3D 沙盘里正要摆放的素材 */
export const placing = ref<{ asset: string; color: number; colors?: string[]; patterns?: (PatternSpec | null)[]; art?: string } | null>(null)
/** 墙体显示：完整 / 前墙透明 / 前墙压低（模拟人生式）/ 全部压低 */
export type WallMode = 'up' | 'fade' | 'cut' | 'half' | 'down'
export const WALL_MODES: { id: WallMode; label: string }[] = [
  { id: 'up', label: '完整' },
  { id: 'fade', label: '前墙透明' },
  { id: 'cut', label: '前墙压低' },
  { id: 'half', label: '内墙半墙' },
  { id: 'down', label: '全部压低' },
]
// wallHeight：「墙高」滑杆压低当前层的高度，Infinity = 满高（各层的层高）
export const sandbox = reactive({ wallHeight: Infinity, wallMode: 'half' as WallMode, cutHeight: 60, cutawayOpacity: 0, cutawayHover: true, snap: true, mode: 'edit' as 'edit' | 'preview', autoRotate: true, autoFurnish: true, style: 'auto' as StyleTag | 'random' | 'auto', look: loadLook(), lookAdj: loadLookAdj(), fx: loadFx(), fov: loadFov(), ...loadSky(), ...loadLights(), playing: false, exterior: false })

/**
 * 3D 沙盘的显示方式：全部楼层 / 只到当前层 / 分层拉开 / 外观，四个是同一级的选项（外观 = 全部楼层叠好、墙满高、盖屋顶）。
 * 单层户型没有前三种的区别，只有「室内 / 外观」。内部仍是 floorShow + sandbox.exterior 两个状态。
 */
export type FloorView = FloorShow | 'interior' | 'exterior'
export const floorView3d = computed<FloorView>(() => (sandbox.exterior ? 'exterior' : floorShow.value))
export function setFloorView(v: FloorView) {
  sandbox.exterior = v === 'exterior'
  if (v !== 'exterior' && v !== 'interior') floorShow.value = v
}
/** 当前户型可选的显示方式 */
export const floorViews = (multi: boolean): { id: FloorView; label: string }[] => [
  ...(multi ? FLOOR_SHOWS : [{ id: 'interior' as const, label: '室内' }]),
  { id: 'exterior', label: '外观' },
]

/** 设备的当前时间：时刻（小时，含分钟）与月日 */
export function nowSky() {
  const n = new Date()
  return { time: n.getHours() + n.getMinutes() / 60, month: n.getMonth() + 1, day: n.getDate() }
}

/** 没选过地点时，按设备时区挑一个同时区的城市（东八区 → 上海，东九区 → 东京…），让「现在」的太阳位置大致对得上 */
function guessGeo(): Geo {
  const tz = -new Date().getTimezoneOffset() / 60
  const c = CITIES.find((x) => x.tz === tz)
  return c ? { id: c.id, lat: c.lat, lon: c.lon, tz: c.tz } : { ...DEFAULT_GEO }
}

/**
 * 3D 沙盘的时间与太阳：时刻（0–24 小时，连续）、月日、地点（城市预设或经纬度）、播放速度（小时 / 秒）；单独存一个键。
 * 时刻和月日默认跟着设备的当前时间走（timeSet = false）；用户拖过时刻、改过月日或播放过时间流逝之后才记住自己设的时间。
 */
function loadSky() {
  const d = { time: 14, month: 5, day: 15, timeSet: false, geo: guessGeo(), speed: 1 }
  try {
    const raw = JSON.parse(localStorage.getItem(SKY_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      // 旧数据没有 timeSet：当作没改过，跟随当前时间
      if (raw.timeSet === true) {
        d.timeSet = true
        if (Number.isFinite(raw.time)) d.time = Math.min(24, Math.max(0, raw.time))
        if (Number.isInteger(raw.month) && raw.month >= 1 && raw.month <= 12) d.month = raw.month
        if (Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= 31) d.day = raw.day
      }
      if (raw.geo && Number.isFinite(raw.geo.lat) && Number.isFinite(raw.geo.lon)) d.geo = { id: String(raw.geo.id ?? 'custom'), lat: raw.geo.lat, lon: raw.geo.lon, tz: Number.isFinite(raw.geo.tz) ? raw.geo.tz : Math.round(raw.geo.lon / 15) }
      if (Number.isFinite(raw.speed)) d.speed = raw.speed
    }
  } catch {
    /* 存储不可用或数据损坏时用默认值 */
  }
  if (!d.timeSet) Object.assign(d, nowSky())
  return d
}

/** 「回到现在」：时刻和月日重新跟随设备时间 */
export function syncSkyToNow() {
  sandbox.playing = false
  Object.assign(sandbox, nowSky())
  sandbox.timeSet = false
}
// 跟随当前时间时，每分钟对一次表（开着页面过了很久，太阳也跟着走）
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (!sandbox.timeSet && !sandbox.playing) Object.assign(sandbox, nowSky())
  }, 60_000)
}

let skyTimer = 0
watch(
  () => [sandbox.time, sandbox.month, sandbox.day, sandbox.timeSet, sandbox.geo.id, sandbox.geo.lat, sandbox.geo.lon, sandbox.geo.tz, sandbox.speed],
  () => {
    // 播放时时刻每帧都在变：节流写入
    clearTimeout(skyTimer)
    skyTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(SKY_KEY, JSON.stringify({ time: sandbox.time, month: sandbox.month, day: sandbox.day, timeSet: sandbox.timeSet, geo: toRaw(sandbox.geo), speed: sandbox.speed }))
      } catch {
        /* 存储不可用时忽略 */
      }
    }, 500)
  },
)

/**
 * 室内灯光的全局设置：lightMode 自动（按太阳高度渐亮渐灭）/ 开 / 关，lightK 色温（K），lightPower 亮度（%），lightOutdoor 室外光（%）。单独存一个键，不进户型数据；
 * 单个房间、单个灯具的开关和色温覆盖存在户型里（Room.light / lightK、Furniture.light）。
 */
function loadLights(): { lightMode: LightMode; lightK: number; lightPower: number; lightRange: number; lightOutdoor: number } {
  const d = { lightMode: 'auto' as LightMode, lightK: DEFAULT_KELVIN, lightPower: DEFAULT_POWER, lightRange: DEFAULT_RANGE, lightOutdoor: DEFAULT_OUTDOOR }
  try {
    const raw = JSON.parse(localStorage.getItem(LIGHTS_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      if (isLightMode(raw.mode)) d.lightMode = raw.mode
      if (Number.isFinite(raw.k)) d.lightK = clampKelvin(raw.k)
      if (Number.isFinite(raw.power)) d.lightPower = Math.round(Math.min(POWER_MAX, Math.max(POWER_MIN, raw.power)))
      if (Number.isFinite(raw.range)) d.lightRange = Math.round(Math.min(RANGE_MAX, Math.max(RANGE_MIN, raw.range)))
      if (Number.isFinite(raw.outdoor)) d.lightOutdoor = Math.round(Math.min(OUTDOOR_MAX, Math.max(OUTDOOR_MIN, raw.outdoor)))
    }
  } catch {
    /* 读不到就用默认 */
  }
  return d
}
watch(
  () => [sandbox.lightMode, sandbox.lightK, sandbox.lightPower, sandbox.lightRange, sandbox.lightOutdoor],
  () => {
    try {
      localStorage.setItem(LIGHTS_KEY, JSON.stringify({ mode: sandbox.lightMode, k: sandbox.lightK, power: sandbox.lightPower, range: sandbox.lightRange, outdoor: sandbox.lightOutdoor }))
    } catch {
      /* 存储不可用时忽略 */
    }
  },
)

/** 房间灯：auto 删字段（旧存档的样子） */
export function setRoomLight(id: string, mode: LightMode) {
  const r = findRoom(id)
  if (!r || (r.light ?? 'auto') === mode) return
  mutate(() => {
    if (mode === 'auto') delete r.light
    else r.light = mode
  })
}
/** 房间灯色温：undefined = 跟随全局 */
export function setRoomLightK(id: string, k: number | undefined) {
  const r = findRoom(id)
  if (!r || r.lightK === k) return
  mutate(() => {
    if (k === undefined) delete r.lightK
    else r.lightK = clampKelvin(k)
  })
}
/** 灯具开关：undefined = 跟随房间 */
/** 可开合的柜子：打开 / 关上柜门（id、位置不变，门里的东西不动，抽屉里的东西跟着抽屉走；可撤销） */
export function setFurnitureOpen(id: string, open: boolean) {
  const f = findFurniture(id)
  if (!f || !!f.open === open || !ASSET_MAP.get(f.asset)?.openable) return
  mutate((p) => setOpen(p, f, open))
}

export function setFurnitureLight(id: string, v: 'on' | 'off' | undefined) {
  const f = findFurniture(id)
  if (!f || f.light === v) return
  mutate(() => {
    if (v === undefined) delete f.light
    else f.light = v
  })
}

/** 3D 沙盘的视角（透视强度，度）：小 = 平、接近等距视图；大 = 近大远小更明显。单独存一个键 */
export const FOV_MIN = 15
export const FOV_MAX = 70
function loadFov() {
  try {
    const v = Number(localStorage.getItem(FOV_KEY))
    return v >= FOV_MIN && v <= FOV_MAX ? v : 35
  } catch {
    return 35
  }
}
watch(
  () => sandbox.fov,
  (v) => {
    try {
      localStorage.setItem(FOV_KEY, String(v))
    } catch {
      /* 存储不可用时忽略 */
    }
  },
)

/** 画面效果在预设上的调整（three/post.ts LookAdjust，只记改过的参数）；换预设时清空 */
function loadLookAdj(): LookAdjust {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_ADJ_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as LookAdjust) : {}
  } catch {
    return {}
  }
}
watch(
  () => sandbox.lookAdj,
  (v) => {
    try {
      localStorage.setItem(LOOK_ADJ_KEY, JSON.stringify(v))
    } catch {
      /* 存储不可用时忽略 */
    }
  },
  { deep: true },
)

/** 3D 沙盘的画面效果（three/post.ts 的 LookId），单独存一个键，不进户型数据；没选过的默认「动画」（删掉的「手游」也回到它） */
function loadLook() {
  try {
    const v = localStorage.getItem(LOOK_KEY)
    return !v || v === 'game' ? 'anime' : v
  } catch {
    return 'anime'
  }
}
watch(
  () => sandbox.look,
  (v) => {
    try {
      localStorage.setItem(LOOK_KEY, v)
    } catch {
      /* 存储不可用时忽略 */
    }
  },
)

/**
 * 画面增强（3D 沙盘，高画质才生效）：环境光遮蔽、反射（地面 / 镜子 / 水面）各有 关 / 仅漫游 / 始终；
 * 体积光只在漫游时成立（鸟瞰时没有天花板，满屋都被晒到），只有开关。单独存一个键，不进户型数据
 */
export type FxMode = 'off' | 'walk' | 'always'
export interface SandboxFx {
  ao: FxMode
  reflect: FxMode
  volumetric: boolean
}
function loadFx(): SandboxFx {
  try {
    const v = JSON.parse(localStorage.getItem(FX_KEY) || '{}') as Partial<SandboxFx>
    return {
      ao: isFxMode(v.ao) ? v.ao : FX_DEFAULT.ao,
      reflect: isFxMode(v.reflect) ? v.reflect : FX_DEFAULT.reflect,
      volumetric: typeof v.volumetric === 'boolean' ? v.volumetric : FX_DEFAULT.volumetric,
    }
  } catch {
    return { ...FX_DEFAULT }
  }
}
watch(
  () => sandbox.fx,
  (v) => {
    try {
      localStorage.setItem(FX_KEY, JSON.stringify(v))
    } catch {
      /* 存储不可用时忽略 */
    }
  },
  { deep: true },
)

let saveTimer = 0
watch(
  plan,
  (p) => {
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toRaw(p)))
      } catch {
        /* 存储不可用时忽略 */
      }
    }, 300)
  },
  { deep: true },
)

// ---------- 撤销 / 重做（整份快照） ----------

const undoStack: string[] = []
const redoStack: string[] = []
export const historyState = reactive({ canUndo: false, canRedo: false })

function syncHistory() {
  historyState.canUndo = undoStack.length > 0
  historyState.canRedo = redoStack.length > 0
}

/** 修改前调用：记录当前状态 */
export function checkpoint() {
  undoStack.push(JSON.stringify(toRaw(plan.value)))
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
  syncHistory()
}

/** 拖拽结束时调用：如果实际没变，丢弃刚才的 checkpoint */
export function settle() {
  const top = undoStack[undoStack.length - 1]
  if (top !== undefined && top === JSON.stringify(toRaw(plan.value))) undoStack.pop()
  syncHistory()
}

export function mutate(fn: (p: Plan) => void) {
  checkpoint()
  fn(plan.value)
}

function validateSelection() {
  const s = selection.value
  if (!s) return
  if (s.type === 'room' && !findRoom(s.id)) selection.value = null
  if (s.type === 'opening' && !plan.value.openings.some((o) => o.id === s.id)) selection.value = null
  if (s.type === 'fixture' && !plan.value.fixtures.some((f) => f.id === s.id)) selection.value = null
  if (s.type === 'furniture' && !plan.value.furniture.some((f) => f.id === s.id)) selection.value = null
  if (s.type === 'vertex') {
    const r = findRoom(s.roomId)
    if (!r || s.index >= r.points.length) selection.value = null
  }
}

export function undo() {
  const prev = undoStack.pop()
  if (prev === undefined) return
  redoStack.push(JSON.stringify(toRaw(plan.value)))
  plan.value = JSON.parse(prev)
  validateSelection()
  syncHistory()
}

export function redo() {
  const next = redoStack.pop()
  if (next === undefined) return
  undoStack.push(JSON.stringify(toRaw(plan.value)))
  plan.value = JSON.parse(next)
  validateSelection()
  syncHistory()
}

export function replacePlan(p: Plan) {
  checkpoint()
  plan.value = p
  selection.value = null
}

export function generate(newSeed = true) {
  if (newSeed) genOptions.seed = randomSeed()
  const r = generatePlan(genOptions)
  genOptions.seed = r.seed
  const lo = genOptions.minArea
  const hi = genOptions.maxArea
  genMessage.value = r.matched
    ? ''
    : t('没找到 {lo}–{hi}㎡ 的方案，给出最接近的 {a}㎡', { lo: lo ?? '', hi: hi ?? '', a: planArea(r.plan).toFixed(1) })
  // 生成户型时顺带布置家具（同一个种子，结果可复现）
  // 先推算住户，再按住户布置（同一个种子，结果可复现）
  r.plan.household = generateHousehold(r.plan, r.seed)
  // 户建的外观颜色跟着住户风格
  if (r.plan.exterior) styleExterior(r.plan.exterior, r.plan.household.style, r.seed)
  if (sandbox.autoFurnish) {
    r.plan.furniture = furnish(r.plan, r.seed)
    ensureOutdoorUnits(r.plan)
    papers(r.plan, r.seed)
  }
  replacePlan(r.plan)
}

export function newPlan() {
  replacePlan(emptyPlan())
}

// ---------- 查询与编辑 ----------

export function findRoom(id: string): Room | undefined {
  return plan.value.rooms.find((r) => r.id === id)
}

export function addRoom(room: Omit<Room, 'id'>) {
  checkpoint()
  const r: Room = onActive({ ...room, id: uid('r') })
  plan.value.rooms.push(r)
  selection.value = { type: 'room', id: r.id }
  return r
}

export function deleteSelection() {
  const s = selection.value
  if (!s) return
  if (s.type === 'room') {
    mutate((p) => {
      p.rooms = p.rooms.filter((r) => r.id !== s.id)
      p.openings = p.openings.filter((o) => o.roomId !== s.id)
    })
    selection.value = null
  } else if (s.type === 'opening') {
    mutate((p) => {
      p.openings = p.openings.filter((o) => o.id !== s.id)
    })
    selection.value = null
  } else if (s.type === 'fixture') {
    mutate((p) => {
      p.fixtures = p.fixtures.filter((f) => f.id !== s.id)
    })
    selection.value = null
  } else if (s.type === 'furniture') {
    // 桌上的东西一起删
    const f = findFurniture(s.id)
    const gone = new Set([s.id, ...(f ? propsOn(plan.value, f).map((o) => o.id) : [])])
    mutate((p) => {
      p.furniture = p.furniture.filter((o) => !gone.has(o.id))
    })
    selection.value = null
  } else if (s.type === 'vertex') {
    const r = findRoom(s.roomId)
    if (!r || r.points.length <= 3) return
    checkpoint()
    removeVertex(r, s.index)
    selection.value = { type: 'room', id: r.id }
  }
}

export function duplicateSelection() {
  const s = selection.value
  if (s?.type === 'furniture') {
    const f = findFurniture(s.id)
    if (!f) return
    // 连同桌上的东西一起复制
    const kids = propsOn(plan.value, f)
    addFurniture({ ...f, x: f.x + 30, y: f.y + 30 })
    for (const k of kids) plan.value.furniture.push({ ...k, id: uid('u'), x: k.x + 30, y: k.y + 30 })
    return
  }
  if (s?.type !== 'room') return
  const r = findRoom(s.id)
  if (!r) return
  checkpoint()
  const copy: Room = { id: uid('r'), name: r.name, kind: r.kind, points: r.points.map((p) => ({ x: p.x + 50, y: p.y + 50 })), ...(r.floor ? { floor: r.floor } : {}) }
  plan.value.rooms.push(copy)
  for (const o of plan.value.openings.filter((o) => o.roomId === r.id)) {
    plan.value.openings.push({ ...o, id: uid('o'), roomId: copy.id })
  }
  selection.value = { type: 'room', id: copy.id }
}

/** 删除顶点：相邻两条边合并，其上的门窗删除，其余边号重排 */
export function removeVertex(r: Room, i: number) {
  const n = r.points.length
  const gone = new Set([(i - 1 + n) % n, i])
  const ops = plan.value.openings
  plan.value.openings = ops.filter((o) => o.roomId !== r.id || !gone.has(o.edge))
  for (const o of plan.value.openings) if (o.roomId === r.id && o.edge > i) o.edge--
  r.points.splice(i, 1)
}

/** 在第 k 条边上插入顶点，门窗按位置分到两段 */
export function insertVertex(r: Room, k: number, p: Vec) {
  const e = edgeInfo(r.points, k)
  const split = projectToSegment(p, e.a, e.b).t
  for (const o of plan.value.openings) {
    if (o.roomId !== r.id) continue
    if (o.edge > k) o.edge++
    else if (o.edge === k && o.offset > split) {
      o.edge = k + 1
      o.offset -= split
    }
  }
  r.points.splice(k + 1, 0, p)
}

export function findFixture(id: string): Fixture | undefined {
  return plan.value.fixtures.find((f) => f.id === id)
}

export function addFixture(f: Omit<Fixture, 'id'>) {
  checkpoint()
  const fx: Fixture = onActive({ ...f, id: uid('f') })
  plan.value.fixtures.push(fx)
  selection.value = { type: 'fixture', id: fx.id }
}

/** 选中的设备转 deg 度（缺省顺时针 90°；3D 沙盘的 Q / 逆时针按钮传 -90），一步撤销 */
export function rotateSelectedFixture(deg = 90) {
  const s = selection.value
  if (s?.type !== 'fixture') return
  const f = findFixture(s.id)
  if (!f) return
  mutate((p) => {
    // 台面上的东西（浴缸盖、台面小物）跟着一起转
    const carry = captureFixtureProps(p, f)
    f.rot = (((f.rot + deg) % 360) + 360) % 360
    applyFixtureCarry(p, f, carry)
  })
}

/** 厨房左右翻转（水槽和灶对调），一步撤销；台面上的东西跟着镜像 */
export function flipKitchen(id: string) {
  const f = findFixture(id)
  if (f?.kind !== 'kitchen') return
  mutate((p) => {
    const carry = captureFixtureProps(p, f)
    if (f.flip) delete f.flip
    else f.flip = true
    mirrorFixtureCarry(carry)
    applyFixtureCarry(p, f, carry)
  })
}

/** 换楼梯形式（只改数据，不记撤销）：占地换成这种形式的默认尺寸（中心不动），去掉这种形式用不到的字段 */
export function applyStairsVariant(f: Fixture, v: NonNullable<Fixture['stairs']>) {
  f.stairs = v
  f.w = STAIRS_SIZE[v].w
  f.d = STAIRS_SIZE[v].d
  if (v === 'straight') delete f.turn
  if (v !== 'l') delete f.run
  if (v !== 'straight' && v !== 'l') delete f.under
}

/** 换楼梯形式，一步撤销（检查器、楼梯右键菜单） */
export function setStairsVariant(f: Fixture, v: NonNullable<Fixture['stairs']>) {
  mutate(() => applyStairsVariant(f, v))
}

/** 按规则重新决定所有开门的铰链与开向 */
export function tidyDoors() {
  // 多层户型按层整理（门扇只和同一层的墙、门打架）；子户型里的门窗和原户型是同一批对象
  mutate((p) => {
    for (const fl of planFloors(p)) orientDoors(floorView(p, fl.id))
  })
}

export function addOpening(o: Omit<Opening, 'id'>) {
  checkpoint()
  const op: Opening = { ...o, id: uid('o') }
  // 门窗的楼层跟着所在房间
  const owner = findRoom(o.roomId)
  if (owner?.floor) op.floor = owner.floor
  else delete op.floor
  plan.value.openings.push(op)
  selection.value = { type: 'opening', id: op.id }
}

export function findFurniture(id: string): Furniture | undefined {
  return plan.value.furniture.find((f) => f.id === id)
}

export function addFurniture(f: Omit<Furniture, 'id'>) {
  checkpoint()
  const fu: Furniture = { asset: f.asset, x: f.x, y: f.y, rot: f.rot, color: f.color, id: uid('u'), ...(f.z ? { z: f.z } : {}), ...(f.colors?.length ? { colors: [...f.colors] } : {}), ...(f.patterns?.some(Boolean) ? { patterns: [...f.patterns] } : {}), ...(f.art ? { art: f.art } : {}), ...(f.spin ? { spin: f.spin } : {}) }
  // 复制的家具留在原来那层；新摆的放在当前楼层
  stampFloor(plan.value, fu, f.floor ?? activeFloor.value)
  plan.value.furniture.push(fu)
  selection.value = { type: 'furniture', id: fu.id }
  return fu
}

const normDeg = (r: number) => Math.round((((r % 360) + 360) % 360) * 10) / 10

/** 把家具转 deg 度（桌上的东西绕桌子中心一起转）。不记撤销：调用方负责 mutate / checkpoint + settle */
function turnFurniture(f: Furniture, deg: number) {
  // 贴附物（便签、贴纸）：在贴着的面里转，不改贴在哪个面上
  if (ASSET_MAP.get(f.asset)?.stick) {
    const s = normDeg((f.spin ?? 0) + deg)
    if (s) f.spin = s
    else delete f.spin
    return
  }
  const a = (deg * Math.PI) / 180
  for (const k of propsOn(plan.value, f)) {
    const dx = k.x - f.x
    const dy = k.y - f.y
    k.x = Math.round((f.x + dx * Math.cos(a) - dy * Math.sin(a)) * 10) / 10
    k.y = Math.round((f.y + dx * Math.sin(a) + dy * Math.cos(a)) * 10) / 10
    k.rot = normDeg(k.rot + deg)
  }
  f.rot = normDeg(f.rot + deg)
}

/** 旋转操作改的那个角度：一般是朝向 rot，贴附物是在面里转的 spin */
export const turnAngle = (f: Pick<Furniture, 'asset' | 'rot' | 'spin'>) => (ASSET_MAP.get(f.asset)?.stick ? f.spin ?? 0 : f.rot)

export function rotateSelectedFurniture(deg: number) {
  const s = selection.value
  if (s?.type !== 'furniture') return
  const f = findFurniture(s.id)
  if (f) mutate(() => turnFurniture(f, deg))
}

/**
 * 连续旋转（拖滑杆、R + 拖动）：开始时调用 checkpoint()，过程中反复调用本函数转到目标角度，结束时 settle()，
 * 整个过程只记一步撤销。
 */
export function setSelectedFurnitureRotation(rot: number) {
  const s = selection.value
  if (s?.type !== 'furniture') return
  const f = findFurniture(s.id)
  if (!f) return
  const delta = ((((normDeg(rot) - turnAngle(f)) % 360) + 540) % 360) - 180
  if (Math.abs(delta) > 0.05) turnFurniture(f, delta)
}

/** 选中家具换预设配色（清掉自定义） */
export function setFurniturePreset(id: string, color: number) {
  const f = findFurniture(id)
  if (f)
    mutate(() => {
      f.color = color
      delete f.colors
    })
}

/** 自定义配色：preview 只改不记撤销（拖取色器时），commit 记一次撤销 */
let colorEditing = false
export function previewFurnitureColors(id: string, colors: string[] | undefined) {
  const f = findFurniture(id)
  if (!f) return
  if (!colorEditing) {
    checkpoint()
    colorEditing = true
  }
  if (colors) f.colors = colors
  else delete f.colors
}
export function commitFurnitureColors(id: string, colors: string[] | undefined) {
  const f = findFurniture(id)
  if (!f) return
  if (!colorEditing) checkpoint()
  colorEditing = false
  if (colors) f.colors = colors
  else delete f.colors
  settle()
}

/** 换一户人家，并按新住户重新布置 */
export function rerollHousehold() {
  mutate((p) => {
    const seed = Math.floor(Math.random() * 1e9)
    p.household = generateHousehold(toRaw(p), seed)
    // 布置算法只读 plan，传原始对象：经过响应式代理要慢一个数量级（约 1s → 0.1s）
    p.furniture = furnish(toRaw(p), seed)
    ensureOutdoorUnits(p)
    papers(p, seed)
  })
  selection.value = null
}

/** 按当前住户重新布置（没有住户就先推算一户） */
export function redecorate() {
  mutate((p) => {
    p.household ??= generateHousehold(toRaw(p))
    const seed = Date.now()
    p.furniture = furnish(toRaw(p), seed)
    ensureOutdoorUnits(p)
    papers(p, seed)
  })
  selection.value = null
}

/**
 * 一键布置：多层户型从下往上逐层布置（decorateHouse：房间分配全户统一，全户限量的东西不每层都放，
 * 楼梯口留空），家具打上所在楼层。单层户型和以前完全一样。
 */
function furnish(p: Plan, seed: number) {
  const inside = decorateHouse(p, seed, sandbox.style, p.household)
  // 户建：院子里再摆几件户外物件（yard.ts）
  return p.site ? [...inside, ...yardFurniture(p, seed)] : inside
}

/**
 * 空调外机补到和室内机一样多。多层户型按层放（各层的阳台），新外机打上所在楼层；单层和以前一样。
 */
function ensureOutdoorUnits(p: Plan) {
  if (!isMultiFloor(p)) return ensureOutdoorUnits1(p)
  const need = indoorUnits(p)
  for (const fl of planFloors(p)) {
    const view = floorView(p, fl.id)
    const before = new Set(view.fixtures)
    const others = p.fixtures.filter((f) => f.kind === 'outdoor' && floorOf(p, f) !== fl.id).length
    ensureOutdoorUnits1(view, Math.max(0, need - others))
    for (const f of view.fixtures) if (!before.has(f)) p.fixtures.push(stampFloor(p, f, fl.id))
  }
}

/** 按住户自动贴墙纸（居室用主人的风格） */
function papers(p: Plan, seed: number) {
  const raw = toRaw(p)
  // 房间分配全户统一：整份户型一起算
  const styles = roomStyles(raw, raw.household)
  autoWallpapers(p, raw.household, (r) => styles.get(r.id), seed)
}

/** 某个房间换墙纸；undefined = 恢复默认 */
export function setRoomWallpaper(roomId: string, wp: Wallpaper | undefined) {
  const r = findRoom(roomId)
  if (!r) return
  mutate(() => {
    if (wp) r.wallpaper = wp
    else delete r.wallpaper
  })
}

/**
 * 只换家具风格、不动布局（restyle.ts）。roomId 为 null 时全屋，否则只换这间里的家具。
 * style：具体风格；'auto' = 按房间（有主人的居室用主人的风格，其余用全家的风格）；'random' = 随机挑一种。返回改动的件数
 */
export function restyle(roomId: string | null, style: StyleTag | 'auto' | 'random') {
  const raw = toRaw(plan.value)
  const all = Object.keys(STYLE_LABELS) as StyleTag[]
  const fixed = style === 'random' ? all[Math.floor(Math.random() * all.length)] : style === 'auto' ? null : style
  const byRoom = fixed ? null : roomStyles(raw, raw.household)
  const home = raw.household?.style ?? 'nordic'
  let n = 0
  mutate((p) => {
    n = restyleFurniture(p, (f) => {
      const room = furnitureRoom(p, f)?.id
      if (roomId && room !== roomId) return undefined
      return fixed ?? byRoom!.get(room ?? '') ?? home
    })
  })
  return n
}

/** 全屋墙纸（没设自己墙纸的房间都用它）；undefined = 回到默认的米白墙 */
export function setHouseWallpaper(wp: Wallpaper | undefined) {
  mutate((p) => {
    if (wp) p.wallpaper = wp
    else delete p.wallpaper
  })
}

/**
 * 木地板：roomId 为 null 时改全屋，否则改这间（覆盖全屋）。patch 里值为 undefined 的字段删掉（回到跟随全屋 / 缺省）；
 * 改完没有字段了就整个删掉
 */
export function setFlooring(roomId: string | null, patch: Partial<Flooring>) {
  const r = roomId ? findRoom(roomId) : null
  if (roomId && !r) return
  mutate((p) => {
    const host: { flooring?: Flooring } = r ?? p
    const f = { ...host.flooring }
    patchObj(f, patch)
    if (Object.keys(f).length) host.flooring = f
    else delete host.flooring
  })
}

/** 按补丁改一个对象：值为 undefined 的字段删掉（回到缺省） */
function patchObj<T extends object>(o: T, patch: Partial<T>) {
  for (const [k, v] of Object.entries(patch) as [keyof T, T[keyof T] | undefined][]) {
    if (v === undefined) delete o[k]
    else o[k] = v
  }
}

// 户建的用地 / 外观样式（沙盘「外观」页）。history = false：拖滑杆的中间值，调用方在开始时自己 checkpoint 一次

/** 改用地的围挡（款式、颜色、高度） */
export function setSite(patch: Partial<Pick<Site, 'fence' | 'fenceColor' | 'fenceHeight'>>, history = true) {
  const s = plan.value.site
  if (!s) return
  if (history) checkpoint()
  patchObj(s, patch)
}

/** 改某个车位上的车（有没有车、车型、颜色） */
export function setParking(i: number, patch: Partial<Pick<ParkingSpot, 'car' | 'carKind' | 'carColor'>>) {
  const s = plan.value.site?.parking[i]
  if (!s) return
  checkpoint()
  patchObj(s, patch)
}

/** 改外观（屋顶、外墙、点缀色、门廊） */
export function setExterior(patch: Partial<Exterior>, history = true) {
  const e = plan.value.exterior
  if (!e) return
  if (history) checkpoint()
  patchObj(e, patch)
  // 换成门廊：门前放不下就把用地正对大门的那条边（围挡、通道、车位）往外推（同一步撤销）
  if (patch.porch === 'porch') makeRoomForPorch(plan.value)
}

/** 全屋重新随机墙纸 */
export function rerollWallpapers() {
  mutate((p) => papers(p, Math.floor(Math.random() * 1e9)))
}

/** 检查清单：补上缺的东西（只补，不动已有的） */
export function fixChecklist(items: CheckItem[]) {
  mutate((p) => {
    p.household ??= generateHousehold(toRaw(p))
    // 多层户型按层补：房间条目交给房间所在层，每层的条目交给那层，全户条目交给对应的层（checklist.ts fixFloor）
    const raw = toRaw(p)
    p.furniture = applyFixesHouse(raw, items, raw.household)
    // 空调外机是设备，applyFixes 管不到：按室内机台数补够
    ensureOutdoorUnits(p)
  })
}

/** 布艺花纹：一次记一次撤销 */
export function commitFurniturePatterns(id: string, patterns: (PatternSpec | null)[] | undefined) {
  const f = findFurniture(id)
  if (!f) return
  mutate(() => {
    if (patterns?.some(Boolean)) f.patterns = patterns
    else delete f.patterns
  })
}

/** 装饰画的画面（artwork.ts）：一次记一次撤销；undefined = 换回素材原来的画 */
export function setFurnitureArt(id: string, art: string | undefined) {
  const f = findFurniture(id)
  if (!f || f.art === art) return
  mutate(() => {
    if (art) f.art = art
    else delete f.art
  })
}

/** 屏幕画面预设（three/screenContent.ts）；undefined = 素材自带的画面 */
export function setFurnitureScreen(id: string, screen: string | undefined) {
  const f = findFurniture(id)
  if (!f || f.screen === screen) return
  mutate(() => {
    if (screen) f.screen = screen
    else delete f.screen
  })
}

/** 同款：同一个素材，或同款系列（同一造型的不同尺寸 / 陈设）的家具 */
export function sameKind(f: Furniture) {
  const s = ASSET_MAP.get(f.asset)?.series
  return plan.value.furniture.filter((o) => o.asset === f.asset || (!!s && ASSET_MAP.get(o.asset)?.series === s))
}

/** 把一件家具的配色复制给所有同款 */
export function applyColorsToSame(id: string) {
  const f = findFurniture(id)
  if (!f) return
  mutate(() => {
    for (const o of sameKind(f)) {
      o.color = f.color
      if (f.colors) o.colors = [...f.colors]
      else delete o.colors
      if (f.patterns) o.patterns = [...f.patterns]
      else delete o.patterns
    }
  })
}

/** 换成同系列的另一个规格（位置、朝向、配色保留） */
export function swapFurnitureAsset(id: string, asset: string) {
  const f = findFurniture(id)
  if (f && f.asset !== asset) mutate(() => (f.asset = asset))
}

/**
 * 调宽深（resize.ts）：换成 `原 id@宽x深` 的派生素材，宽度以中心为准、深度以背面为准（靠墙的柜子背面仍贴墙）。
 * 尺寸夹到可调范围里；和原尺寸一样就回到原素材。变大后会撞墙、压到旁边的家具 / 设备，就往空的一侧挪或减到放得下（resizeFit.ts）
 */
export function resizeFurniture(id: string, w: number, d: number) {
  const f = findFurniture(id)
  const r = f && fitResize(plan.value, f, w, d)
  if (!f || !r || (r.asset === f.asset && r.x === f.x && r.y === f.y)) return
  mutate(() => {
    f.asset = r.asset
    f.x = r.x
    f.y = r.y
  })
}

/**
 * 原地换成同类的另一款（catalog.ts sameTypeVariants）：位置、朝向不动。换到别的系列时配色槽的含义不同了，
 * 自定义颜色和花纹清掉；配色序号超出新款的配色数就回到第一组
 */
export function swapFurnitureVariant(id: string, asset: string) {
  const f = findFurniture(id)
  const def = ASSET_MAP.get(asset)
  const old = f && ASSET_MAP.get(f.asset)
  if (!f || !def || f.asset === asset) return
  mutate(() => {
    f.asset = asset
    if ((old?.series ?? old?.id) !== (def.series ?? def.id)) {
      delete f.colors
      delete f.patterns
    }
    if ((f.color ?? 0) >= def.palettes.length) f.color = 0
  })
}
