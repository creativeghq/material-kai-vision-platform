import { defineConfig, devices } from '@playwright/test';
import { SMOKE_BASE_URL } from './tests/e2e/fixtures';

// Route-load smoke against the REAL deployed app. Context options (auth state, protection
// bypass, timeouts) live in tests/e2e/fixtures.ts, which shares one context per worker.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 1, // a transient blip (cold edge, chunk-retry reload) shouldn't fail the gate
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: { baseURL: SMOKE_BASE_URL, headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
