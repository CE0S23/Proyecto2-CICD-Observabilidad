import { defineConfig, devices } from '@playwright/test';

/**
 * BASE_URL apunta a NGINX (contenedor app). En CI: http://localhost (imagen app levantada con docker compose en el runner).
 * Reportes: HTML (reports/html) + JUnit XML (reports/playwright-junit.xml).
 * En CI se falla rapido: sin reintentos y se detiene en el primer fallo (el fallo sigue quedando registrado).
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 0 : 0,
  maxFailures: CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/playwright-junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // Un solo proyecto (Chromium): contiene las pruebas de API (request) y el flujo E2E en navegador.
  projects: [{ name: 'chromium', testMatch: /.*\.(api|ui)\.spec\.ts/, use: { ...devices['Desktop Chrome'] } }],
});
