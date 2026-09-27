import { defineConfig } from 'vitest/config'

// Source tests only: the compiled copies under dist/ would otherwise run a second time.
export default defineConfig({ test: { include: ['src/**/*.test.ts', 'eval/**/*.test.ts'] } })
