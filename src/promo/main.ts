// 宣传片页面入口（promo.html）。pnpm promo 后打开 http://localhost:5301/promo.html?lang=zh（?play 实时预览，?t=秒 定格）
import { createApp } from 'vue'
import Promo from './Promo.vue'

createApp(Promo).mount('#promo')
