import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Logs the smoke account in via the real /auth form once, saves the storage state, and all
// route-load tests reuse it. Using the UI (not token injection) guarantees the session is in
// exactly the shape the app's supabase-js client expects.
const STATE = 'tests/e2e/.auth/state.json';

export default async function globalSetup(_config: FullConfig) {
  mkdirSync('tests/e2e/.auth', { recursive: true });
  const baseURL = process.env.SMOKE_BASE_URL || 'https://app.materialshub.gr';
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;

  if (!email || !password) {
    console.warn('[smoke] SMOKE_EMAIL/SMOKE_PASSWORD not set — authed routes will be skipped');
    writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${baseURL}/auth`, { waitUntil: 'domcontentloaded' });

  // The auth page defaults to the Sign Up tab — activate Sign In if its field isn't visible.
  const emailField = page.locator('#signin-email');
  if (!(await emailField.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: /sign in/i }).click().catch(() => {});
  }
  await emailField.waitFor({ state: 'visible', timeout: 15_000 });
  await emailField.fill(email);
  await page.locator('#signin-password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Successful login navigates away from /auth.
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/auth'), { timeout: 30_000 });
  await page.context().storageState({ path: STATE });
  await browser.close();
  console.log('[smoke] authenticated as', email);
}
