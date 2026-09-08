import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './artifacts/visual',
  snapshotPathTemplate: '{testDir}/snapshots/{projectName}/{arg}-{platform}{ext}',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4324',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'wrangler pages dev dist --ip 127.0.0.1 --port 4324 --compatibility-date 2026-09-08',
    url: 'http://127.0.0.1:4324',
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
})
