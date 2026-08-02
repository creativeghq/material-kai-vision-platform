import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { bypassHeaders } from './vercelBypass';

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
  // This launches its own context, so it does NOT inherit `use.extraHTTPHeaders` from the
  // config — the bypass has to be applied here too, or the login would hit the SSO wall.
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: bypassHeaders(baseURL),
  });
  await page.goto(`${baseURL}/auth`, { waitUntil: 'domcontentloaded' });

  // The auth page defaults to the Sign Up tab — activate Sign In if its field isn't visible.
  const emailField = page.locator('#signin-email');
  if (!(await emailField.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: /sign in/i }).click().catch(() => {});
  }
  // Say WHERE we ended up when the form never appears. The first gated run failed here with a
  // bare "locator #signin-email not visible" timeout, which is consistent with the app being
  // slow, the markup changing, OR the deployment-protection bypass not working and Vercel's
  // login page being served instead — three very different problems, indistinguishable from
  // the message. The landed URL and title tell them apart immediately.
  try {
    await emailField.waitFor({ state: 'visible', timeout: 15_000 });
  } catch (err) {
    const landedOn = page.url();
    const title = await page.title().catch(() => '(no title)');
    console.error(`[smoke] sign-in form not found.\n  landed on: ${landedOn}\n  title: ${title}`);
    if (/vercel\.com\/(login|sso)/.test(landedOn)) {
      console.error('[smoke] That is Vercel\'s deployment-protection wall — the bypass header ' +
        'did not take effect. Check VERCEL_AUTOMATION_BYPASS_SECRET against the project\'s ' +
        'current Protection Bypass for Automation value.');
    }
    throw err;
  }
  await emailField.fill(email);
  await page.locator('#signin-password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Successful login navigates away from /auth.
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/auth'), { timeout: 30_000 });
  await page.context().storageState({ path: STATE });
  await browser.close();
  console.log('[smoke] authenticated as', email);
}
