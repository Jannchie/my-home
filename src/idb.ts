// IndexedDB 薄封装：我的户型（saved.ts）和 VRM 住户（residents.ts）各用一个库，开库 / 事务的写法共用这里。

/** 打开一个库（stores 是 keyPath 为 id 的对象仓库，没有就建），返回在这个库上开事务的函数 */
export function openIdb(name: string, version: number, stores: string[]) {
  let dbp: Promise<IDBDatabase> | null = null
  function db(): Promise<IDBDatabase> {
    if (dbp) return dbp
    dbp = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(Object.assign(new Error('IndexedDB unavailable'), { name: 'NoIndexedDB' }))
      let req: IDBOpenDBRequest
      try {
        req = indexedDB.open(name, version)
      } catch (e) {
        return reject(e)
      }
      req.onupgradeneeded = () => {
        const d = req.result
        for (const s of stores) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' })
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

  /** 在一个事务里跑 fn，事务提交后返回 fn 的结果 */
  return async function tx<T>(names: string[], mode: IDBTransactionMode, fn: (s: Record<string, IDBObjectStore>) => Promise<T> | T): Promise<T> {
    const d = await db()
    const x = d.transaction(names, mode)
    const map = Object.fromEntries(names.map((n) => [n, x.objectStore(n)]))
    const done = new Promise<void>((resolve, reject) => {
      x.oncomplete = () => resolve()
      x.onerror = () => reject(x.error)
      x.onabort = () => reject(x.error ?? Object.assign(new Error('aborted'), { name: 'AbortError' }))
    })
    const out = await fn(map)
    await done
    return out
  }
}

/** 一个请求的结果 */
export const idbReq = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
