import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT || 8002);
const baseURL = `http://127.0.0.1:${port}/`;

// Playwright no publica su Chromium para algunos sistemas (por ejemplo macOS 13).
// Ahí se puede usar el navegador ya instalado: PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Sin reintentos a propósito: un test inestable tiene que verse, no taparse.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 5'], channel } }
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
