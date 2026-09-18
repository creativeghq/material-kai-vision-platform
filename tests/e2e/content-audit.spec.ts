import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ROUTES } from './routes';
import { AUDIT_FN, HARD_KINDS, type AuditResult } from './contentAudit';

/**
 * route-load asks whether the page painted; every bug this platform ships paints. This asks
 * whether what painted is usable. Baseline counts may only go DOWN — never widen HARD_KINDS.
 */
const BASELINE: Record<string, Record<string, number>> = JSON.parse(
  readFileSync('.github/content-audit-baseline.json', 'utf8'),
);

for (const route of ROUTES) {
  test(`content audit: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page
      .waitForFunction(() => (document.body?.innerText || '').trim().length > 20, null, { timeout: 20_000 })
      .catch(() => {});

    const audit: AuditResult = JSON.parse(await page.evaluate(AUDIT_FN));
    const allowed = BASELINE[route] ?? {};

    const counted: Record<string, number> = {};
    for (const f of audit.findings) counted[f.kind] = (counted[f.kind] ?? 0) + 1;

    const soft = audit.findings.filter((f) => !HARD_KINDS.includes(f.kind));
    if (soft.length > 0) {
      process.stdout.write(`[content-audit] ${route}: ${soft.length} advisory\n` +
        soft.map((f) => `  · ${f.kind}: ${f.detail}`).join('\n') + '\n');
    }

    for (const kind of HARD_KINDS) {
      const found = counted[kind] ?? 0;
      const budget = allowed[kind] ?? 0;
      const detail = audit.findings.filter((f) => f.kind === kind)
        .map((f) => `  · ${f.detail}${f.at ? `  [${f.at}]` : ''}`).join('\n');
      expect(found, `${route} — ${kind}: ${found} found, baseline allows ${budget}\n${detail}`)
        .toBeLessThanOrEqual(budget);
    }
  });
}
