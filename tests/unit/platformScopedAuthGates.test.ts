/**
 * Three authorization shapes from #294 that nothing else can see.
 *
 * ## 1. `allowedRoles: ['admin', 'super_admin']` is NOT a platform gate
 *
 * `authenticate()` matches `allowedRoles` against `workspace_members.role` as well as the global
 * `user_profiles.role_id → roles.name`, and it grants if EITHER matches. That is deliberate — a
 * dealer who owns a workspace holds global role 'user' and must still be allowed business ops.
 * But `'admin'` is also an ordinary WORKSPACE role, handed out by any tenant from Profile → Team.
 *
 * So a *platform*-scoped function gated that way is reachable by any tenant's workspace admin.
 * `platform-secrets-admin` writes the store every tenant's integrations resolve through
 * (`resolveSecret()`: env > platform_secrets.value > default_value), so appointing a colleague
 * workspace admin also handed them the platform's credential store. `email-api`'s domain routes
 * were the same shape: `email_domains` has no workspace_id — it is the PLATFORM's Resend registry
 * — and add/verify/sync call Resend with the platform key, so a tenant's workspace owner could
 * add and verify domains on our own sending account. `reset-platform` was moved off the identical
 * gate earlier, and the comment at that site records why.
 *
 * ## 1b. Nav is UX; the API is the boundary
 *
 * Four `email-api` routes belong to the `email-marketing` add-on (EUR 9/mo, its own Stripe
 * product) and checked nothing. The tile is hidden without the entitlement, which is exactly why
 * nothing looked wrong — the endpoint was reachable directly the whole time.
 *
 * Only the operator holds an active workspace-`admin` row today, so this was latent — it arms
 * itself the first time a tenant uses an ordinary product feature.
 *
 * ## 2. `platform_secrets` is a declared registry, so writes UPDATE — they never upsert
 *
 * An upsert let a caller invent a key. Since `resolveSecret()` reads this table for every
 * integration, inventing a key is choosing what an integration resolves to. All 55 keys are
 * declared by migration; the admin surface edits values.
 *
 * ## 3. An ownership check that runs after the side effect is not a check
 *
 * `catalog-translate-pdf` took `source_pdf_id` and `target_catalog_id` from the request body and
 * used the service-role client on both — reading a PDF out of the private `pdf-documents` bucket
 * and UPDATEing a catalog body. The guard has to precede the download, the credit debit and the
 * model call, or an unauthorized caller is merely charged before being refused. Same reason
 * financeAtomicity asserts order.
 */
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
