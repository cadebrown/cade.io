import { defineConfig, devices } from '@playwright/test'

if (!process.env.CAREER_REVIEW_DIR)
  throw new Error('Set CAREER_REVIEW_DIR to the private snapshot pair')
export default defineConfig({
  testDir: './tests/career',
  outputDir: './artifacts/career/browser',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4326', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: 'node scripts/dev-career.mjs --port 4326',
    url: 'http://127.0.0.1:4326/resume',
    reuseExistingServer: false,
  },
})
