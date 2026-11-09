import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: 'e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:3101',
    channel:
      process.env.PLAYWRIGHT_CHANNEL === 'chromium'
        ? undefined
        : (process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)),
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
