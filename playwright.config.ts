import { defineConfig, devices } from '@playwright/test';
import { bypassHeaders } from './tests/e2e/vercelBypass';

// Route-load smoke: drives the REAL deployed app in a headless browser and asserts each
// route renders (no white-screen / chunk-load failure / error-boundary). Catches the class
// of bug that took down /quotes /finance /discover after a deploy.
//
// In CI this points at the UNALIASED production candidate (deploy-frontend runs
// `vercel deploy --skip-domain`), so a failure here stops `promote` and users never see the
// build. The default below is the live domain, which is what you want when running it by hand
// against production.
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
    // Empty for the custom domain; the protection bypass when the target is a *.vercel.app
    // candidate. Throws rather than returning empty if that target is protected and the secret
    // is missing — see vercelBypass.ts.
    extraHTTPHeaders: bypassHeaders(baseURL),
    storageState: 'tests/e2e/.auth/state.json',
    headless: true,
    ignoreHTTPSErrors: true,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
