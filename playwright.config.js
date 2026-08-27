import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT || 8002);
const baseURL = `http://127.0.0.1:${port}/`;

// Playwright no publica su Chromium para algunos sistemas (por ejemplo macOS 13).
// Ahí se usa un navegador ya instalado. Se puede fijar por clon, una sola vez:
//   git config fiestas.playwrightChannel chrome
// o puntualmente con PLAYWRIGHT_CHANNEL=chrome. Fijarlo en git config es lo que
// hace que los hooks funcionen sin acordarse de exportar nada.
function resolveChannel() {
  if (process.env.PLAYWRIGHT_CHANNEL) return process.env.PLAYWRIGHT_CHANNEL;
  try {
    const value = execSync('git config --get fiestas.playwrightChannel', {
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

const channel = resolveChannel();

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Sin reintentos a propósito: un test inestable tiene que verse, no taparse.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  // Presupuesto por test. No es una medida de rendimiento: está para cortar
  // cuelgues. Los casos que cargan la portada entera (473 tarjetas) y luego
  // navegan rondan los 35s en una máquina ocupada, así que 30s se quedaban
  // cortos y el test moría al cerrar el contexto.
  timeout: 90_000,
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
