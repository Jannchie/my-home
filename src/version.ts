// 当前版本：直接取 package.json 的 version（只打进这一个字段）。
// 更新日志第一条必须和它一致（test/changelog.spec.ts 检查）；首屏只要版本号，不用为它把整份三语更新日志打进入口
import { version } from '../package.json'

export const APP_VERSION: string = version
