import { defineConfig, devices } from '@playwright/test';

/**
 * BASE_URL apunta a NGINX (contenedor app). En CI: http://localhost (docker compose en el runner).
 * Reportes: HTML (reports/html) + JUnit XML (reports/playwright-junit.xml).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/playwright-junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /.*\.api\.spec\.ts/ },
    { name: 'ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
