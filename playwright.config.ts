import { defineConfig, devices } from '@playwright/test';

// Route-load smoke: drives the REAL deployed app in a headless browser and asserts each
// route renders (no white-screen / chunk-load failure / error-boundary). Catches the class
// of bug that took down /quotes /finance /discover after a deploy. Runs as a post-deploy
// gate (see .github/workflows/deploy.yml → fe-smoke).
const baseURL = process.env.SMOKE_BASE_URL || 'https://app.materialshub.gr';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 1, // a transient blip (cold edge, chunk-retry reload) shouldn't fail the gate
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    storageState: 'tests/e2e/.auth/state.json',
    headless: true,
    ignoreHTTPSErrors: true,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
