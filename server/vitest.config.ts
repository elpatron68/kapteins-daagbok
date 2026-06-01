import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-minimum-32-characters-long',
      ORIGIN: 'http://localhost:5173',
      RP_ID: 'localhost'
    }
  }
})
