/** Three authorization shapes from #294 that nothing else can see. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, 'supabase/functions', p), 'utf8'));

describe('#294 — platform-scoped gates and body-supplied ids', () => {
  const secrets = read('platform-secrets-admin/index.ts');

  it('platform-secrets-admin asks the operator question, not a workspace role', () => {
    expect(secrets, 'gated on allowedRoles again — `admin` is a workspace role any tenant grants')
      .not.toMatch(/allowedRoles/);
    expect(secrets).toMatch(/isPlatformOperator\(/);
    // The gate must actually refuse, not merely compute a boolean.
    expect(secrets).toMatch(/if\s*\(!\(await isPlatformOperator\([^)]*\)\)\)/);
  });

  it('platform_secrets is updated, never upserted', () => {
    expect(secrets, 'an upsert lets a caller declare a key that resolveSecret() will then serve')
      .not.toMatch(/\.upsert\(/);
    expect(secrets).toMatch(/Unknown secret key/);
  });

  it('default_value is masked — it is a live resolution tier', () => {
    expect(secrets).toMatch(/default_value:\s*maskSecretValue\(/);
  });

  it('email-api guards the PLATFORM domain registry with the operator question', () => {
    // `email_domains` has no workspace_id — it is the platform's own Resend registry, and
    // add/verify/sync call Resend with the platform RESEND_API_KEY. They were gated on
    // `allowedRoles: ['admin','super_admin','owner']`, so any tenant's workspace OWNER could add
    // and verify domains on our sending account: a domain-reputation and phishing surface.
    const src = read('email-api/index.ts');
    expect(src).toMatch(/isPlatformOperator\(/);
    expect(
      src.match(/allowedRoles: \['admin', 'super_admin', 'owner'\]/g) ?? [],
      "a domain route is back on a workspace-role gate",
    ).toHaveLength(1); // only the freeform `send` operator check legitimately remains
  });

  it('email-api gates the email-marketing add-on at the API boundary', () => {
    // Four routes belong to the EUR 9/mo add-on (its own Stripe product). The nav tile is hidden
    // without it, but the endpoint is reachable directly — nav is UX, the API is the boundary.
    const src = read('email-api/index.ts');
    const gates = src.match(/assertEntitled\([^)]*'email-marketing'\)/g) ?? [];
    expect(gates, 'one per marketing route: campaign stats + the three contact-sync routes')
      .toHaveLength(4);
    // …and each must sit behind the membership check, never instead of it.
    expect((src.match(/userCanAccessWorkspace\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('catalog-translate-pdf checks ownership before it spends or reads private storage', () => {
    const src = read('catalog-translate-pdf/index.ts');

    expect(src, 'both ids come from the request body and the client is service-role')
      .toMatch(/userCanAccessWorkspace\(/);

    const guard = src.indexOf('userCanAccessWorkspace(');
    const download = src.indexOf('.download(');
    const debit = src.indexOf("'debit_credits'");
    const model = src.indexOf('api.anthropic.com');

    for (const [name, at] of [['download', download], ['debit', debit], ['model call', model]] as const) {
      expect(at, `${name} not found — re-anchor this test`).toBeGreaterThan(-1);
      expect(
        guard,
        `the ownership check must run BEFORE the ${name}; after it, an unauthorized caller is `
        + 'charged and served before being refused',
      ).toBeLessThan(at);
    }
  });
});
