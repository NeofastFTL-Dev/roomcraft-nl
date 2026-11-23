import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  // Browsers are normally Playwright's bundled Chromium. When the download is
  // unavailable, set PLAYWRIGHT_CHANNEL=chrome (or msedge) to use a locally
  // installed browser instead.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
