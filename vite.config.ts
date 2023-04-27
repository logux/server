import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['node_modules', 'test/servers'],
    coverage: {
      provider: 'c8',
      lines: 100,
      exclude: ['node_modules', 'server/index.js', '*/*.test.*']
    }
  }
})
