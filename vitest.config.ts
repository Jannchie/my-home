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
    },
  }),
)
