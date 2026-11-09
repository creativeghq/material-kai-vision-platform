import { test as base, devices, type BrowserContext } from '@playwright/test';
import { bypassHeaders } from './vercelBypass';

export const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL || 'https://app.materialshub.gr';

// One context per WORKER so the HTTP cache spans routes: a cold app load costs ~45 Vercel edge requests.
export const test = base.extend<object, { sharedContext: BrowserContext }>({
  sharedContext: [
    async ({ browser }, use) => {
      const { defaultBrowserType: _browserType, ...desktop } = devices['Desktop Chrome'];
      const context = await browser.newContext({
        ...desktop,
        baseURL: SMOKE_BASE_URL,
        storageState: 'tests/e2e/.auth/state.json',
        extraHTTPHeaders: bypassHeaders(SMOKE_BASE_URL),
        ignoreHTTPSErrors: true,
      });
      context.setDefaultNavigationTimeout(30_000);
      context.setDefaultTimeout(15_000);
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
