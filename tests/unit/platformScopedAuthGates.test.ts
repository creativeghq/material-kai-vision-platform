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

describe('platform work is gated on the operator, never on a workspace role', () => {
  const PLATFORM_FUNCTIONS = [
    'agent-scheduler-cron/index.ts', 'check-material-alerts/index.ts', 'flow-scheduler-cron/index.ts',
    'moodboard-dormancy-cron/index.ts', 'embedding-drain/index.ts', 'ai-pricing-updater/index.ts',
    'data-integrity-runner/index.ts',
  ];

  it.each(PLATFORM_FUNCTIONS)('%s uses authenticatePlatformOperator and no allowedRoles gate', (file) => {
    const src = read(file);
    expect(src).toMatch(/authenticatePlatformOperator\(req\)/);
    expect(src, 'a workspace-role gate is back on platform-wide work').not.toMatch(/allowedRoles/);
  });

  it('mivaa-gateway re-checks /api/admin actions with the operator gate', () => {
    expect(read('mivaa-gateway/index.ts')).toMatch(/const adminAuth = await authenticatePlatformOperator\(req\)/);
  });

  it('messaging-api keeps platform billing actions behind the operator', () => {
    const src = read('messaging-api/index.ts');
    const block = src.slice(src.indexOf('const PLATFORM_ACTIONS'), src.indexOf('const PLATFORM_ACTIONS') + 400);
    for (const action of ['set-channel-seats', 'set-whatsapp-rate', 'bill-channels-monthly',
      'reconcile-phone-numbers', 'reconcile-whatsapp-costs']) {
      expect(block, `${action} left PLATFORM_ACTIONS — any signed-in user can call it`).toContain(`'${action}'`);
    }
    expect(src).toMatch(/PLATFORM_ACTIONS\.has\(action\)[^\n]*isPlatformOperator\(/);
  });

  it('email-api refuses a user send on the platform sender unless they are the operator', () => {
    const src = read('email-api/index.ts');
    const resolve = src.indexOf('resolveWorkspaceEmailSender(supabaseClient, body.workspace_id)');
    const gate = src.search(/sender\.source !== 'workspace' && !isAdminAccess\(auth\) && !\(await isPlatformOperator\(/);
    expect(resolve).toBeGreaterThan(-1);
    expect(gate, 'the platform-sender operator check is gone').toBeGreaterThan(resolve);
  });

  it('a partner kai_ key passes a role gate only when its owner would', () => {
    const auth = read('_shared/auth.ts');
    const branch = auth.slice(auth.indexOf("token.startsWith('kai_')"), auth.indexOf("token.startsWith('kai_')") + 700);
    expect(branch, 'the kai_ branch returns before allowedRoles is checked').toMatch(/holdsAnyRole\(adminClient, partnerAuth\.userId, allowedRoles\)/);
  });

  it('authenticatePlatformOperator never admits a partner key', () => {
    const auth = read('_shared/auth.ts');
    const body = auth.slice(auth.indexOf('export async function authenticatePlatformOperator'));
    expect(body).toMatch(/auth\.level === 'user' && await isPlatformOperator\(/);
  });

  it('hr-api grants the HR roles what their personas hold', () => {
    const src = read('hr-api/index.ts');
    expect(src).toMatch(/role === 'hr_manager'\) return \{ canView: true, canManage: true \}/);
    expect(src).toMatch(/role === 'hr'\) return \{ canView: true, canManage: false \}/);
  });

  it('agent-chat ignores memberships that are not active', () => {
    const src = read('agent-chat/index.ts');
    const fn = src.slice(src.indexOf('async function getUserWorkspaceMembership'));
    expect(fn.slice(0, 600)).toContain(".eq('status', 'active')");
  });

  it('hr-api seats an employee only for an owner/admin, and never revives a non-active membership', () => {
    const src = read('hr-api/expansion.ts');
    const body = src.slice(src.indexOf("case 'invite-employee'"), src.indexOf("case 'invite-employee'") + 3000);
    expect(body).toMatch(/\.in\('role', \['owner', 'admin'\]\)/);
    expect(body.indexOf("in('role', ['owner', 'admin'])")).toBeLessThan(body.indexOf('inviteUserByEmail'));
    expect(body).toMatch(/mem && mem\.status !== 'active'/);
  });

  it('trade-portal mint_link needs a selling role in the account workspace', () => {
    const src = read('trade-portal/index.ts');
    expect(src).toMatch(/\.in\('role', \['owner', 'admin', 'member', 'sales', 'sales_manager'\]\)/);
  });
});
