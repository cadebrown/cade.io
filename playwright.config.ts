import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './artifacts/browser',
  fullyParallel: false,
  workers: 2,
  timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    {
      name: 'webkit',
      testMatch: [
        'quality.spec.ts',
        'widgets.spec.ts',
        'layouts.spec.ts',
        'explorer.spec.ts',
        'release.spec.ts',
      ],
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'wrangler pages dev dist --ip 127.0.0.1 --port 4322 --compatibility-date 2026-09-08',
      url: 'http://127.0.0.1:4322',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
    {
      command: 'node scripts/dev-test-server.mjs',
      url: `http://127.0.0.1:${process.env.ASTRO_DRAFT_PORT ?? '4323'}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
