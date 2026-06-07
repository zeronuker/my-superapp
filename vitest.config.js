import { defineConfig } from 'vitest/config'

// Isolated test config — deliberately does NOT load vite.config.js so the
// PWA / React plugins don't run during unit tests. The functions under test
// are pure JS (no DOM), so the lightweight 'node' environment is enough.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
