// 宣传片录制页的独立 Vite 配置：只挂 Vue 插件，入口 promo.html，和主应用的构建（vite.config.ts）完全分开。
//   pnpm promo          开发服务器（http://localhost:5301/promo.html，?play 实时预览）
//   pnpm promo:build    打包到 dist-promo（代码冻结：录制途中别的改动不会触发热更新、整页重载）
//   pnpm promo:preview  静态服务 dist-promo（http://localhost:5302/promo.html），正式录制用它
//   pnpm promo:record   逐帧录制（scripts/record-promo.mjs）
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify('https://home.jannchie.com') },
  server: { port: 5301, strictPort: true },
  preview: { port: 5302, strictPort: true },
  build: { outDir: 'dist-promo', rollupOptions: { input: 'promo.html' } },
})
