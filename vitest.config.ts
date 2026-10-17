// vitest 配置：复用 vite.config.ts（插件、define），import.meta.glob 等 vite 特性在测试里照常工作
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: 'node',
      include: ['test/**/*.spec.ts'],
      setupFiles: ['test/setup/stubdom.ts'],
      // 素材全量 build、几十户一键布置都比较慢
      testTimeout: 120_000,
      hookTimeout: 120_000,
      pool: 'forks',
      // 每个进程都要加载 three.js 和全部素材（几百 MB）：默认按核数开会吃掉十几 GB，限制在 4 个
      maxWorkers: 4,
    },
  }),
)
