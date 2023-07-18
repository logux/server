import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['node_modules', 'server/index.js', '*/*.test.*'],
      lines: 100,
      provider: 'v8'
    },
    environment: 'node',
    exclude: ['node_modules', 'test/servers']
  }
})
