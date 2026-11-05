import { createApp } from 'vue'
import { JIconPlugin } from '@jannchie/icons-vue'
import App from './App.vue'
import './style.css'
import { lang, loadLang } from './i18n'
import './ui/device'
import { registerSW } from './ui/pwa'

// 先把当前语言的词典加载好再挂载（中文不需要词典，立即完成），t() 才能一直同步取词
loadLang(lang.value).then(() =>
  createApp(App)
    // 图标全局默认：圆角 2、常规线宽、16px，和现在偏轻的按钮 / 侧栏字号协调；单个 JIcon 可以用 props 覆盖
    .use(JIconPlugin, { radius: 2, weight: 'regular', size: 16 })
    .mount('#app'),
)

// 开发环境：检查预计算的素材尺寸修正（dims.generated.ts）是否过期，过期只告警（生产构建里整段去掉，不拉完整素材）
if (import.meta.env.DEV) import('./three/assets').then((m) => m.checkDimsFresh())
// PWA：生产环境注册 service worker（离线可用、有新版本时提示刷新）
registerSW()
