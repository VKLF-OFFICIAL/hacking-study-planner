// Tests de extremo a extremo: `npm run test:e2e`.
// Escritorio: Chromium, Firefox y WebKit (motor de Safari); movil: Pixel e iPhone.
// En local sin los navegadores de Playwright, PW_CHROMIUM_PATH apunta a un Chromium.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const chromium = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // El service worker se prueba aparte: aqui cada test empieza sin cache
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromium } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...chromium } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
});
