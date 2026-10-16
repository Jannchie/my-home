import { createApp } from 'vue'
import { JIconPlugin } from '@jannchie/icons-vue'
import App from './App.vue'
import './style.css'
import { checkDimsFresh } from './three/assets'
import './ui/device'
import { registerSW } from './ui/pwa'

createApp(App)
  // 图标全局默认：圆角 2、常规线宽、16px，和现在偏轻的按钮 / 侧栏字号协调；单个 JIcon 可以用 props 覆盖
  .use(JIconPlugin, { radius: 2, weight: 'regular', size: 16 })
  .mount('#app')

// 开发环境：空闲时检查预计算的素材尺寸修正（dims.generated.ts）是否过期，过期只告警
checkDimsFresh()
// PWA：生产环境注册 service worker（离线可用、有新版本时提示刷新）
registerSW()
