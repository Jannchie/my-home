// 名单（residents.ts，浏览器本地）→ 3D 里的人（ResidentLayer）：在家的人载入模型住进来，出门的搬走。
//   - 载入是异步的：期间名单又变了（出门、换了模型）或沙盘关了，载入的结果作废、模型释放。
//   - 出门的人的模型留着（最多 PARK_MAX 个，先出门的先释放）：点回家时不用重新解析几十 MB 的 VRM、重新编着色器。
//   - 移出名单、关掉沙盘时释放。

import { residentFile, residentStatus, type Resident } from '../residents'
import { ResidentLayer, disposeResidentModel, loadResidentModel, warmResidentLoader, type ResidentModel } from './residents'

/** 出门的人最多留几个模型 */
const PARK_MAX = 2

export class ResidentRoster {
  /** 在家（或正在载入）的人 → 模型文件 */
  private home = new Map<string, string>()
  /** 出门的人留着的模型（插入顺序 = 出门的先后） */
  private parked = new Map<string, { file: string; m: ResidentModel }>()
  private closed = false

  constructor(
    private layer: ResidentLayer,
    /** 有人搬进来 / 载入状态变了：要重画 */
    private onChange: () => void,
  ) {}

  /** 名单变了：按最新的名单让人回家 / 出门 */
  update(list: readonly Resident[]) {
    if (this.closed) return
    const want = new Map(list.filter((r) => r.home).map((r) => [r.id, r.file]))
    let left = false
    for (const [id, file] of [...this.home]) {
      if (want.get(id) === file) continue
      this.home.delete(id)
      delete residentStatus[id]
      const m = this.layer.remove(id)
      if (m) this.park(id, file, m)
      left = true
    }
    if (left) this.onChange()
    // 移出名单、换了模型的：留着的旧模型也不要了
    const listed = new Map(list.map((r) => [r.id, r.file]))
    for (const [id, p] of [...this.parked]) if (listed.get(id) !== p.file) this.unpark(id)
    for (const [id, file] of want) if (!this.home.has(id)) this.moveIn(id, file)
  }

  /** 沙盘关了：全部释放 */
  dispose() {
    this.closed = true
    for (const id of this.home.keys()) {
      const m = this.layer.remove(id)
      if (m) disposeResidentModel(m)
      delete residentStatus[id]
    }
    this.home.clear()
    for (const id of [...this.parked.keys()]) this.unpark(id)
  }

  private park(id: string, file: string, m: ResidentModel) {
    this.parked.set(id, { file, m })
    while (this.parked.size > PARK_MAX) this.unpark(this.parked.keys().next().value!)
  }

  /** 停着的模型不要了：释放 */
  private unpark(id: string) {
    const p = this.parked.get(id)
    this.parked.delete(id)
    if (p) disposeResidentModel(p.m)
  }

  private async moveIn(id: string, file: string) {
    this.home.set(id, file)
    const kept = this.parked.get(id)
    if (kept?.file === file) {
      this.parked.delete(id)
      this.layer.add(id, kept.m)
      residentStatus[id] = 'ok'
      this.onChange()
      return
    }
    residentStatus[id] = 'loading'
    let st: 'ok' | 'missing' | 'error'
    let m: ResidentModel | null = null
    try {
      // 读模型文件和下载载入器、动作数据一起开始
      const [blob] = await Promise.all([residentFile(file), warmResidentLoader()])
      if (blob) m = await loadResidentModel(blob)
      st = m ? 'ok' : 'missing'
    } catch (e) {
      console.warn('[residents] VRM 载入失败', e)
      st = 'error'
    }
    if (this.closed || this.home.get(id) !== file) {
      if (m) disposeResidentModel(m)
      return
    }
    if (m) this.layer.add(id, m)
    residentStatus[id] = st
    this.onChange()
  }
}
