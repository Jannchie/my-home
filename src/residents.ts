// VRM 住户：用户自己上传的 VRM 人物，在 3D 沙盘里像真人一样在家里走动、坐沙发、躺床。
//
// 和家具、household（一键布置推算的那户人家）都无关，是一套独立的名单：
//   - 名单和模型文件都只存在这台设备的浏览器里（IndexedDB），不写进 plan：不进撤销历史、导出的 JSON 和分享链接
//     （VRM 动辄几十 MB，也常有不允许再分发的授权）。换户型打开时，在家的人照样住进新户型。
//   - 同一个文件按内容指纹（SHA-256）只存一份。
//   - 内置一个默认人物（public/residents/ 下的 VRM 官方样例，授权见同目录 README）：总在名单第一个、不能移除，
//     只能设成不在家；它的模型按需从站点加载，不存进 IndexedDB。名单里存一行只是为了记住在不在家、改过的名字。
// 3D 里的行为和画法见 three/residents.ts。
//
// IndexedDB：库名 my-home-residents，版本 1
//   people  { id, name, file, home, createdAt }
//   files   { id, blob }

import { reactive } from 'vue'
import { uid } from './model'
import { idbReq, openIdb } from './idb'

export interface Resident {
  id: string
  name: string
  /** 模型文件的内容指纹（files 的键） */
  file: string
  /** 在家：在 3D 沙盘里出现 */
  home: boolean
  createdAt: number
}

export const residents = reactive<{ list: Resident[]; ready: boolean }>({ list: [], ready: false })

/** 3D 里的载入情况（Sandbox3D 写）：loading 载入中、ok 在家、missing 本机没有模型文件、error 不是能用的 VRM */
export const residentStatus = reactive<Record<string, 'loading' | 'ok' | 'missing' | 'error'>>({})

const DB_NAME = 'my-home-residents'
const DB_VERSION = 1

const tx = openIdb(DB_NAME, DB_VERSION, ['people', 'files'])
const wrap = idbReq

/** 内置的默认人物 */
export const BUILTIN_ID = 'builtin-default'
const BUILTIN_FILE = 'builtin:vrm1-sample'
const BUILTIN_URL = `${import.meta.env.BASE_URL}residents/vrm1-sample.vrm`
export const isBuiltin = (r: Pick<Resident, 'id'>) => r.id === BUILTIN_ID

export async function loadResidents() {
  let list: Resident[] = []
  try {
    list = await tx(['people'], 'readonly', (s) => wrap(s.people.getAll() as IDBRequest<Resident[]>))
  } catch (e) {
    // 存储不可用（隐私模式等）：只有内置人物
    console.warn('[residents] 名单读取失败', e)
  }
  // 默认人物：没存过就是在家；存过的行只取名字和在不在家（文件以代码里的为准）
  const own = list.find(isBuiltin)
  const builtin: Resident = { id: BUILTIN_ID, name: own?.name ?? 'VRM 示例', file: BUILTIN_FILE, home: own?.home ?? true, createdAt: 0 }
  residents.list = [builtin, ...list.filter((r) => !isBuiltin(r)).sort((a, b) => a.createdAt - b.createdAt)]
  residents.ready = true
}

/** 模型文件；找不到返回 null */
export async function residentFile(file: string): Promise<Blob | null> {
  if (file === BUILTIN_FILE) {
    const res = await fetch(BUILTIN_URL)
    return res.ok ? res.blob() : null
  }
  const row = await tx(['files'], 'readonly', (s) => wrap(s.files.get(file) as IDBRequest<{ id: string; blob: Blob } | undefined>))
  return row?.blob ?? null
}

async function digest(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 加一个住户（新加的直接在家） */
export async function addResident(f: File): Promise<Resident> {
  const file = await digest(await f.arrayBuffer())
  const r: Resident = { id: uid('vrm'), name: f.name.replace(/\.vrm$/i, '') || 'VRM', file, home: true, createdAt: Date.now() }
  await tx(['people', 'files'], 'readwrite', (s) => {
    // File 本身就是 Blob：直接存，不再复制一份几十 MB 的内容
    s.files.put({ id: file, blob: f })
    s.people.put(r)
  })
  residents.list.push(r)
  return r
}

export async function updateResident(id: string, patch: Partial<Pick<Resident, 'name' | 'home'>>) {
  const r = residents.list.find((x) => x.id === id)
  if (!r) return
  Object.assign(r, patch)
  const row = { ...r }
  await tx(['people'], 'readwrite', (s) => void s.people.put(row))
}

/** 移出名单；没有别人用的模型文件一起删掉 */
export async function removeResident(id: string) {
  const r = residents.list.find((x) => x.id === id)
  if (!r || isBuiltin(r)) return
  residents.list = residents.list.filter((x) => x.id !== id)
  const shared = residents.list.some((x) => x.file === r.file)
  await tx(['people', 'files'], 'readwrite', (s) => {
    s.people.delete(id)
    if (!shared) s.files.delete(r.file)
  })
}
