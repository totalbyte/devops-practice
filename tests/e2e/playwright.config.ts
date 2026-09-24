import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  // One retry in CI absorbs cold-start flakiness of the full stack; the trace of the retry is kept.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    // `github` turns failures into annotations on the PR diff.
    ...(process.env.CI ? [['github'] as const] : []),
    ['list'],
    ['json', { outputFile: 'results.json' }],
    ['html', { outputFolder: 'html-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'on',
    trace: 'on-first-retry',
    video: 'off',
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
});
