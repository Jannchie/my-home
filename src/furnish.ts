// 一键布置、检查清单补齐、自动墙纸、换风格：要 build 模型探测尺寸（收纳、柜门开合）、依赖 three.js，
// 所以从 store 拆出来按需动态加载（store.ts 的 heavy()），平面图首屏不必下载。
export { applyFixesHouse, decorateHouse, roomStyles } from './decorate'
export { autoWallpapers } from './wallpaper'
export { furnitureRoom, restyleFurniture } from './restyle'
