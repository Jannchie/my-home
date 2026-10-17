// 「我的户型」：在浏览器 IndexedDB 里保存多份户型，随时打开。
//
// 和 localStorage 的 my-home:plan 互不干扰：那份仍是「当前编辑中」的自动保存（store.ts），
// 这里是用户主动保存的存档，外加最近几个自动快照（用来「恢复」）。
//
// IndexedDB：库名 my-home，版本 1
//   plans      { id, name, createdAt, updatedAt, area, layout, rooms, furniture, thumb?: Blob }  —— 列表只读这个，轻
//   plan-data  { id, plan }                                                                    —— 户型本体，打开时才读
//   snapshots  { id, createdAt, name, area, layout, rooms, furniture, savedId, hash, plan }   —— 自动快照，最多 5 个
// localStorage（小数据）：my-home:saved-link = { id, hash }，记住当前户型关联的是哪份存档、保存时的内容指纹，刷新后仍能判断有没有改过。

import { reactive, toRaw, watch } from 'vue'
import { planArea } from './generate'
import { lang, t } from './i18n'
import { uid, type Plan } from './model'
import { bootFresh, historyState, normalizePlan, plan, replacePlan, sandbox } from './store'
import { planThumbnail } from './three/planThumb'

// ---------- 数据结构 ----------

export interface PlanSummary {
  name: string
  /** 专有面积 ㎡（不含阳台） */
  area: number
  /** 房型，如 2LDK；推不出来时为空 */
  layout: string
  rooms: number
  furniture: number
  /** 楼层数（多层户型才有；面积是各层相加） */
  floors?: number
}

export interface SavedMeta extends PlanSummary {
  id: string
  createdAt: number
  updatedAt: number
  thumb?: Blob
}

export interface SnapshotMeta extends PlanSummary {
  id: string
  createdAt: number
  /** 拍快照时关联的存档 */
  savedId: string | null
  hash: string
}

interface SnapshotRec extends SnapshotMeta {
  plan: Plan
}

const DB_NAME = 'my-home'
const DB_VERSION = 1
const LINK_KEY = 'my-home:saved-link'
const MAX_SNAPSHOTS = 5
/** 自动快照间隔（内容有变化才拍） */
const SNAPSHOT_EVERY = 3 * 60 * 1000

// ---------- 摘要 ----------

/** 由房间推算房型：居室数 + LDK / DK / K（S = 納戸） */
export function layoutOf(p: Plan): string {
  const baths = p.rooms.filter((r) => r.kind === 'bath')
  // 中式：几室几厅几卫（书房也算一室，客厅、餐厅各算一厅）
  if (p.region === 'cn') {
    const n = p.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
    // 一室户的客餐厅算一厅（和生成器的命名一致）
    const h = n === 1 ? 1 : p.rooms.filter((r) => r.kind === 'ldk' || r.kind === 'dining').length
    return t('{n}室{h}厅{b}卫', { n, h, b: baths.length })
  }
  // 欧美：卧室数 + 卫生间数（Half Bath 算 0.5，书房 Office 不算卧室）
  if (p.region === 'west') {
    const n = p.rooms.filter((r) => (r.kind === 'western' || r.kind === 'japanese') && r.name !== 'Office').length
    const half = baths.filter((r) => r.name === 'Half Bath').length
    const full = baths.length - half
    return t('{n}室{b}卫', { n, b: `${full + Math.floor(half / 2)}${half % 2 ? '.5' : ''}` })
  }
  const n = p.rooms.filter((r) => r.kind === 'western' || r.kind === 'japanese').length
  const ldk = p.rooms.find((r) => r.kind === 'ldk')
  const s = p.rooms.some((r) => r.name === '納戸') ? 'S' : ''
  if (ldk) {
    const tag = /^(S?LDK|DK|K)$/.test(ldk.name) ? ldk.name.replace(/^S/, '') : 'LDK'
    return `${n}${s}${tag}`
  }
  // 1DK 的 DK 是厨房类型的房间，名字写着 DK
  const k = p.rooms.find((r) => r.kind === 'kitchen')
  if (k) return `${n}${s}${/^S?L?DK$/.test(k.name) ? k.name.replace(/^S/, '') : 'K'}`
  return n ? `${n}R` : ''
}

export function summarize(p: Plan, name = p.name): PlanSummary {
  return {
    name,
    area: Math.round(planArea(p) * 10) / 10,
    layout: layoutOf(p),
    rooms: p.rooms.length,
    furniture: p.furniture.length,
    ...(p.floors && p.floors.length > 1 ? { floors: p.floors.length } : {}),
  }
}

/** 内容指纹（FNV-1a 32 位）：只用来判断「改没改过」 */
function hashStr(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${s.length.toString(36)}-${(h >>> 0).toString(36)}`
}
const currentJson = () => JSON.stringify(toRaw(plan.value))

// ---------- 状态 ----------

export type ConfirmChoice = 'ok' | 'alt' | 'cancel'
interface ConfirmReq {
  title: string
  message: string
  ok: string
  alt?: string
  danger?: boolean
  resolve: (c: ConfirmChoice) => void
}

export const saved = reactive({
  /** 存档列表（按更新时间倒序） */
  list: [] as SavedMeta[],
  snapshots: [] as SnapshotMeta[],
  loaded: false,
  /** 存储不可用时的提示（隐私模式等）；有值时整个功能降级为只读提示 */
  unavailable: '',
  busy: false,
  /** 当前户型关联的存档 id（从那份打开 / 保存到那份） */
  currentId: null as string | null,
  /** 和关联存档相比有没有改动；没有关联时表示「没存过」 */
  dirty: true,
  panelOpen: false,
  /** 打开面板时直接聚焦到「另存为」名字输入框 */
  focusSave: 0,
  toast: null as { id: number; text: string; kind: 'ok' | 'error' } | null,
  confirm: null as ConfirmReq | null,
})

let linkHash: string | null = null

function readLink() {
  try {
    const raw = localStorage.getItem(LINK_KEY)
    const v = raw ? JSON.parse(raw) : null
    if (v && typeof v.id === 'string') return v as { id: string; hash: string | null }
  } catch {
    /* 读不到就当没关联 */
  }
  return null
}
function writeLink() {
  try {
    if (saved.currentId) localStorage.setItem(LINK_KEY, JSON.stringify({ id: saved.currentId, hash: linkHash }))
    else localStorage.removeItem(LINK_KEY)
  } catch {
    /* 存不了只影响刷新后的「已修改」判断 */
  }
}
function setLink(id: string | null, hash: string | null) {
  saved.currentId = id
  linkHash = id ? hash : null
  saved.dirty = !id || hash !== hashStr(currentJson())
  writeLink()
}

/** 新建 / 随机生成 / 导入时调用：当前户型不再对应任何存档 */
export function detachSaved() {
  setLink(null, null)
}

// 只有户型本身带着同一个 savedId 才算关联（撤销到打开存档之前，户型里没有这个标记，就不会被 Ctrl+S 误覆盖进那份存档）
export const currentSaved = () => (saved.currentId && toRaw(plan.value).savedId === saved.currentId ? saved.list.find((m) => m.id === saved.currentId) : undefined)

// ---------- 提示 / 确认 ----------

let toastSeq = 0
let toastTimer = 0
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  clearTimeout(toastTimer)
  saved.toast = { id: ++toastSeq, text, kind }
  toastTimer = window.setTimeout(() => (saved.toast = null), kind === 'error' ? 6000 : 2600)
}

/** 应用内确认框（不用浏览器 confirm）。alt 是可选的第二个按钮（如「先保存」） */
export function ask(opts: Omit<ConfirmReq, 'resolve'>): Promise<ConfirmChoice> {
  saved.confirm?.resolve('cancel')
  return new Promise((resolve) => {
    saved.confirm = {
      ...opts,
      resolve: (c) => {
        saved.confirm = null
        resolve(c)
      },
    }
  })
}

/** 把存储错误翻成用户看得懂的话 */
export function friendlyError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? ''
  if (name === 'QuotaExceededError' || /quota/i.test(String((e as Error)?.message ?? '')))
    return t('浏览器存储空间不足，没能保存。可以删掉几份旧户型，或先「导出 JSON」备份。')
  if (name === 'NoIndexedDB' || name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError')
    return t('浏览器不允许本地存储（可能是隐私 / 无痕模式），「我的户型」暂时用不了。可以用「导出 JSON」备份。')
  return t('存储出错：{msg}', { msg: (e as Error)?.message || name || String(e) })
}

// ---------- IndexedDB 薄封装 ----------

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      const e = new Error('IndexedDB unavailable')
      e.name = 'NoIndexedDB'
      return reject(e)
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      return reject(e)
    }
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('plans')) d.createObjectStore('plans', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('plan-data')) d.createObjectStore('plan-data', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const d = req.result
      // 别的标签页升级了库：先关掉，下次用时重开
      d.onversionchange = () => {
        d.close()
        dbp = null
      }
      resolve(d)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(Object.assign(new Error('IndexedDB blocked'), { name: 'InvalidStateError' }))
  })
  dbp.catch(() => (dbp = null))
  return dbp
}

const wrap = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

/** 在一个事务里跑 fn，事务提交后返回 fn 的结果 */
async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (s: Record<string, IDBObjectStore>) => Promise<T> | T): Promise<T> {
  const d = await db()
  const x = d.transaction(stores, mode)
  const map = Object.fromEntries(stores.map((n) => [n, x.objectStore(n)]))
  const done = new Promise<void>((resolve, reject) => {
    x.oncomplete = () => resolve()
    x.onerror = () => reject(x.error)
    x.onabort = () => reject(x.error ?? Object.assign(new Error('aborted'), { name: 'AbortError' }))
  })
  const out = await fn(map)
  await done
  return out
}

// ---------- 读取 ----------

export async function refreshSaved() {
  try {
    const [list, snaps] = await tx(['plans', 'snapshots'], 'readonly', async (s) => {
      const metas = wrap(s.plans.getAll() as IDBRequest<SavedMeta[]>)
      // 快照不读户型本体：用游标只取摘要
      const sm: SnapshotMeta[] = []
      await new Promise<void>((resolve, reject) => {
        const c = s.snapshots.openCursor()
        c.onsuccess = () => {
          const cur = c.result
          if (!cur) return resolve()
          const { plan: _p, ...meta } = cur.value as SnapshotRec
          sm.push(meta)
          cur.continue()
        }
        c.onerror = () => reject(c.error)
      })
      return [await metas, sm] as const
    })
    saved.list = list.sort((a, b) => b.updatedAt - a.updatedAt)
    saved.snapshots = snaps.sort((a, b) => b.createdAt - a.createdAt)
    saved.unavailable = ''
    pruneThumbUrls()
  } catch (e) {
    saved.unavailable = friendlyError(e)
  } finally {
    saved.loaded = true
  }
}

// ---------- 缩略图 URL（Blob → object URL，按 id + 更新时间缓存） ----------

const thumbUrls = new Map<string, { at: number; url: string }>()
export function thumbUrl(m: SavedMeta): string {
  if (!m.thumb) return ''
  const hit = thumbUrls.get(m.id)
  if (hit && hit.at === m.updatedAt) return hit.url
  if (hit) URL.revokeObjectURL(hit.url)
  const url = URL.createObjectURL(m.thumb)
  thumbUrls.set(m.id, { at: m.updatedAt, url })
  return url
}
function pruneThumbUrls() {
  const alive = new Set(saved.list.map((m) => m.id))
  for (const [id, v] of thumbUrls)
    if (!alive.has(id)) {
      URL.revokeObjectURL(v.url)
      thumbUrls.delete(id)
    }
}

// ---------- 保存 / 打开 / 改名 / 复制 / 删除 ----------

let persistAsked = false

/**
 * 保存当前户型。asNew：另存为新的一份；否则覆盖当前关联的存档（没有关联时等同另存为）。
 * 返回存档 id；失败时弹提示并返回 null。
 */
export async function saveCurrent(opts: { name?: string; asNew?: boolean } = {}): Promise<string | null> {
  if (saved.busy) return null
  saved.busy = true
  try {
    const prev = !opts.asNew ? currentSaved() : undefined
    const id = prev?.id ?? uid('s')
    // 户型本身记下存档 id（不进撤销历史）
    toRaw(plan.value).savedId = id
    const json = currentJson()
    const p = JSON.parse(json) as Plan
    const name = (opts.name ?? prev?.name ?? p.name).trim() || p.name || t('未命名户型')
    const now = Date.now()
    const thumb = await planThumbnail(p, sandbox.wallHeight, true).catch(() => null)
    const meta: SavedMeta = { ...summarize(p, name), id, createdAt: prev?.createdAt ?? now, updatedAt: now, ...(thumb ? { thumb } : {}) }
    await tx(['plans', 'plan-data'], 'readwrite', (s) => {
      s.plans.put(meta)
      s['plan-data'].put({ id: meta.id, plan: p })
    })
    // 保存期间用户可能又改了：指纹用保存时的内容，改过的部分仍显示为未保存
    setLink(meta.id, hashStr(json))
    await refreshSaved()
    toast(prev ? t('已保存「{name}」', { name }) : t('已保存为「{name}」', { name }))
    if (!persistAsked) {
      persistAsked = true
      // 申请持久化存储，减少被浏览器清理的可能（不支持 / 被拒都无所谓）
      navigator.storage?.persist?.().catch(() => {})
    }
    return meta.id
  } catch (e) {
    toast(friendlyError(e), 'error')
    return null
  } finally {
    saved.busy = false
  }
}

/** Ctrl+S / 顶栏「保存」：有关联存档就直接覆盖，否则打开面板让用户起名 */
export function quickSave() {
  if (saved.unavailable) {
    toast(saved.unavailable, 'error')
    return
  }
  if (currentSaved()) void saveCurrent()
  else openPanel(true)
}

export function openPanel(focusSave = false) {
  saved.panelOpen = true
  if (focusSave) saved.focusSave++
  void refreshSaved()
}

async function readPlan(id: string): Promise<Plan | null> {
  const rec = await tx(['plan-data'], 'readonly', (s) => wrap(s['plan-data'].get(id) as IDBRequest<{ id: string; plan: Plan } | undefined>))
  return rec ? normalizePlan(rec.plan) : null
}

/** 打开一份存档替换当前户型（进撤销历史，可以撤销回去）。确认由调用方负责。 */
export async function openSaved(id: string): Promise<boolean> {
  try {
    const p = await readPlan(id)
    if (!p) throw new Error(t('这份户型的数据丢失了'))
    // 被替换掉的户型先拍一张快照，撤销之外再多一道保险
    if (saved.dirty) await takeSnapshot(true)
    p.savedId = id
    replacePlan(p)
    setLink(id, hashStr(currentJson()))
    return true
  } catch (e) {
    toast(friendlyError(e), 'error')
    return false
  }
}

export async function renameSaved(id: string, name: string) {
  name = name.trim()
  const m = saved.list.find((x) => x.id === id)
  if (!m || !name || name === m.name) return
  try {
    await tx(['plans'], 'readwrite', (s) => {
      s.plans.put({ ...toRaw(m), name })
    })
    m.name = name
  } catch (e) {
    toast(friendlyError(e), 'error')
  }
}

export async function duplicateSaved(id: string) {
  const m = saved.list.find((x) => x.id === id)
  if (!m) return
  try {
    const p = await readPlan(id)
    if (!p) throw new Error(t('这份户型的数据丢失了'))
    const now = Date.now()
    const copy: SavedMeta = { ...toRaw(m), id: uid('s'), name: t('{name} 副本', { name: m.name }), createdAt: now, updatedAt: now }
    await tx(['plans', 'plan-data'], 'readwrite', (s) => {
      s.plans.put(copy)
      s['plan-data'].put({ id: copy.id, plan: p })
    })
    await refreshSaved()
    toast(t('已复制为「{name}」', { name: copy.name }))
  } catch (e) {
    toast(friendlyError(e), 'error')
  }
}

export async function deleteSaved(id: string) {
  try {
    await tx(['plans', 'plan-data'], 'readwrite', (s) => {
      s.plans.delete(id)
      s['plan-data'].delete(id)
    })
    if (saved.currentId === id) detachSaved()
    await refreshSaved()
  } catch (e) {
    toast(friendlyError(e), 'error')
  }
}

// ---------- 自动快照 ----------

let lastSnapHash = ''

/** 拍一张当前户型的快照（内容和上一张一样就跳过），只保留最近 5 张 */
export async function takeSnapshot(force = false) {
  if (saved.unavailable) return
  const json = currentJson()
  const h = hashStr(json)
  if (h === lastSnapHash || saved.snapshots[0]?.hash === h) return
  const p = JSON.parse(json) as Plan
  if (!p.rooms.length && !force) return
  try {
    const rec: SnapshotRec = { ...summarize(p, currentSaved()?.name ?? p.name), id: uid('v'), createdAt: Date.now(), savedId: saved.currentId, hash: h, plan: p }
    await tx(['snapshots'], 'readwrite', async (s) => {
      s.snapshots.put(rec)
      const keys = (await wrap(s.snapshots.getAll() as IDBRequest<SnapshotRec[]>)).sort((a, b) => b.createdAt - a.createdAt).map((x) => x.id)
      for (const k of keys.slice(MAX_SNAPSHOTS)) s.snapshots.delete(k)
    })
    lastSnapHash = h
    await refreshSaved()
  } catch {
    /* 快照是锦上添花：失败不打扰用户 */
  }
}

/** 恢复一张快照（进撤销历史）；仍关联拍快照时的那份存档，但标为未保存 */
export async function restoreSnapshot(id: string): Promise<boolean> {
  try {
    const rec = await tx(['snapshots'], 'readonly', (s) => wrap(s.snapshots.get(id) as IDBRequest<SnapshotRec | undefined>))
    const p = rec && normalizePlan(rec.plan)
    if (!rec || !p) throw new Error(t('这份户型的数据丢失了'))
    if (saved.dirty) await takeSnapshot(true)
    replacePlan(p)
    const stillThere = rec.savedId && saved.list.some((m) => m.id === rec.savedId)
    setLink(stillThere ? rec.savedId : null, null)
    return true
  } catch (e) {
    toast(friendlyError(e), 'error')
    return false
  }
}

// ---------- 打开分享链接里的户型 ----------

/**
 * 用分享来的户型替换当前户型（进撤销历史）。当前户型有内容又没存过时先问：
 * 「存进我的户型再打开」（默认）/「直接替换」/ 取消。返回是否打开了。
 */
export async function openSharedPlan(p: Plan): Promise<boolean> {
  // 启动时存档列表可能还没读完：要靠它判断当前户型存没存过
  if (!saved.loaded) await refreshSaved()
  const cur = toRaw(plan.value)
  const empty = !cur.rooms.length && !cur.furniture.length
  // 第一次来、还没动过的随机户型也不用问
  const untouched = (bootFresh && !historyState.canUndo) || (!!currentSaved() && !saved.dirty)
  if (!empty && !untouched) {
    const m = currentSaved()
    const canSave = !saved.unavailable
    const c = await ask({
      title: t('打开分享的户型「{name}」？', { name: p.name || t('未命名户型') }),
      message: [m ? t('「{name}」有未保存的修改。', { name: m.name }) : t('当前户型还没有保存。'), canSave ? t('建议先存进「我的户型」，之后随时可以打开。') : t('直接打开也没关系：可以用「撤销」找回，自动快照里也会留一份。')].join(lang.value === 'en' ? ' ' : ''),
      ok: canSave ? t('先存进「我的户型」再打开') : t('直接替换'),
      ...(canSave ? { alt: t('直接替换') } : {}),
    })
    if (c === 'cancel') return false
    if (c === 'ok' && canSave && !(await saveCurrent(m ? {} : { asNew: true }))) return false
    if (saved.dirty) await takeSnapshot(true)
  }
  delete p.savedId
  replacePlan(p)
  // 分享来的户型不对应任何存档：标为未保存
  detachSaved()
  return true
}

// ---------- 初始化 ----------

let inited = false
export function initSaved() {
  if (inited) return
  inited = true
  const link = readLink()
  saved.currentId = link?.id ?? null
  linkHash = link?.hash ?? null
  saved.dirty = !link || link.hash !== hashStr(currentJson())
  void refreshSaved().then(() => {
    // 关联的存档已经被删了（比如在别的标签页）
    if (saved.currentId && !saved.unavailable && !currentSaved()) detachSaved()
  })

  // 「已修改」标记：户型变化后稍等再算一次指纹（大户型序列化要几毫秒，别每次按键都算）
  let timer = 0
  watch(
    plan,
    () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        saved.dirty = !saved.currentId || linkHash !== hashStr(currentJson())
      }, 400)
    },
    { deep: true },
  )

  // 自动快照：每 3 分钟看一眼，有变化才拍
  window.setInterval(() => void takeSnapshot(), SNAPSHOT_EVERY)
}
